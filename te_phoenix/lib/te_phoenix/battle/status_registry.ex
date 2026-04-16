defmodule TePhoenix.Battle.StatusRegistry do
  @moduledoc """
  Data-driven registry of battle status effects and trigger rules.

  Two tables, both auto-created on boot:

    * `game_battle_statuses` — status definitions (bleed, stun, poison,
      cripple_leg, regen, …). Every field is editable from AdminSauce or
      power-code via the Ecto schema. No status names are hardcoded
      anywhere in the battle pipeline.

    * `game_battle_rules` — trigger rules that fire effects when events
      happen (`limb_broken`, `ko`, `turn_start`, `damage_taken`, `crit`,
      `hp_threshold`, …). Effects may apply a status, run a visual-script
      graph, or queue a runtime event.

  Code-defined defaults are seeded into the DB on first boot so the
  engine is usable immediately; users can then edit, disable, or delete
  any of them without touching source.

  Lookups are served from ETS so the hot damage/tick pipeline pays zero
  DB cost per call. `reload/0` re-reads the DB — AdminSauce editors call
  it on save.
  """

  use GenServer
  require Logger

  alias TePhoenix.Repo

  @statuses_table "game_battle_statuses"
  @rules_table "game_battle_rules"

  @ets_statuses :twisted_battle_statuses
  @ets_rules :twisted_battle_rules
  @ets_rules_by_trigger :twisted_battle_rules_by_trigger

  # ── Public API ────────────────────────────────────────────────────

  def start_link(_opts \\ []) do
    GenServer.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  @doc "Look up a status definition by string key (e.g. \"bleed_light\")."
  def get_status(key) when is_binary(key) do
    case :ets.lookup(@ets_statuses, key) do
      [{^key, def}] -> def
      _ -> nil
    end
  rescue
    ArgumentError -> nil
  end

  def get_status(key) when is_atom(key), do: get_status(Atom.to_string(key))

  @doc "List all status definitions."
  def list_statuses do
    :ets.tab2list(@ets_statuses) |> Enum.map(fn {_k, v} -> v end)
  rescue
    ArgumentError -> []
  end

  @doc "Get all rules firing on the given trigger (sorted by priority DESC)."
  def rules_for(trigger) when is_binary(trigger) do
    case :ets.lookup(@ets_rules_by_trigger, trigger) do
      [{^trigger, rules}] -> rules
      _ -> []
    end
  rescue
    ArgumentError -> []
  end

  def rules_for(trigger) when is_atom(trigger), do: rules_for(Atom.to_string(trigger))

  @doc "List every rule."
  def list_rules do
    :ets.tab2list(@ets_rules) |> Enum.map(fn {_k, v} -> v end)
  rescue
    ArgumentError -> []
  end

  @doc "Reload DB → ETS. Call after mutating definitions."
  def reload, do: GenServer.call(__MODULE__, :reload)

  @doc "Upsert a status definition. Map fields match the schema below."
  def upsert_status(%{} = def), do: GenServer.call(__MODULE__, {:upsert_status, def})

  @doc "Delete a status definition by key."
  def delete_status(key), do: GenServer.call(__MODULE__, {:delete_status, to_string(key)})

  @doc "Upsert a trigger rule."
  def upsert_rule(%{} = rule), do: GenServer.call(__MODULE__, {:upsert_rule, rule})

  @doc "Delete a rule by key."
  def delete_rule(key), do: GenServer.call(__MODULE__, {:delete_rule, to_string(key)})

  # ── GenServer ────────────────────────────────────────────────────

  @impl true
  def init(:ok) do
    ensure_ets()
    ensure_tables()
    seed_defaults_if_empty()
    load_all()
    {:ok, %{}}
  end

  @impl true
  def handle_call(:reload, _from, state) do
    load_all()
    {:reply, :ok, state}
  end

  def handle_call({:upsert_status, def}, _from, state) do
    persist_status(def)
    load_statuses()
    {:reply, :ok, state}
  end

  def handle_call({:delete_status, key}, _from, state) do
    Repo.query("DELETE FROM #{@statuses_table} WHERE `key` = ?", [key])
    load_statuses()
    {:reply, :ok, state}
  end

  def handle_call({:upsert_rule, rule}, _from, state) do
    persist_rule(rule)
    load_rules()
    {:reply, :ok, state}
  end

  def handle_call({:delete_rule, key}, _from, state) do
    Repo.query("DELETE FROM #{@rules_table} WHERE `key` = ?", [key])
    load_rules()
    {:reply, :ok, state}
  end

  # ── ETS ──────────────────────────────────────────────────────────

  defp ensure_ets do
    for tab <- [@ets_statuses, @ets_rules, @ets_rules_by_trigger] do
      case :ets.info(tab) do
        :undefined -> :ets.new(tab, [:set, :public, :named_table, read_concurrency: true])
        _ -> :ok
      end
    end
  end

  # ── DB tables ────────────────────────────────────────────────────

  defp ensure_tables do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@statuses_table} (
      `key` VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      icon VARCHAR(16) DEFAULT '⚡',
      category VARCHAR(32) DEFAULT 'debuff',
      default_duration INT DEFAULT 3,
      permanent TINYINT(1) DEFAULT 0,
      stacking VARCHAR(16) DEFAULT 'refresh',
      max_stacks INT DEFAULT 1,
      effects_json LONGTEXT,
      tick_json LONGTEXT,
      disabled_commands_json LONGTEXT,
      cure_tags_json LONGTEXT,
      on_apply_script_id INT,
      on_tick_script_id INT,
      on_expire_script_id INT,
      enabled TINYINT(1) DEFAULT 1,
      updated_at DATETIME NOT NULL
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@rules_table} (
      `key` VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      trigger_event VARCHAR(64) NOT NULL,
      condition_json LONGTEXT,
      effect_json LONGTEXT NOT NULL,
      priority INT DEFAULT 100,
      enabled TINYINT(1) DEFAULT 1,
      updated_at DATETIME NOT NULL,
      INDEX idx_trigger (trigger_event)
    )
    """)
  rescue
    e ->
      Logger.error("StatusRegistry ensure_tables failed: #{inspect(e)}")
      :ok
  end

  # ── Load ─────────────────────────────────────────────────────────

  defp load_all do
    load_statuses()
    load_rules()
  end

  defp load_statuses do
    :ets.delete_all_objects(@ets_statuses)

    case Repo.query("SELECT `key`, name, description, icon, category, default_duration, permanent, stacking, max_stacks, effects_json, tick_json, disabled_commands_json, cure_tags_json, on_apply_script_id, on_tick_script_id, on_expire_script_id, enabled FROM #{@statuses_table}") do
      {:ok, %{rows: rows}} ->
        for row <- rows do
          def = row_to_status(row)
          if def.enabled, do: :ets.insert(@ets_statuses, {def.key, def})
        end

      _ ->
        :ok
    end
  rescue
    _ -> :ok
  end

  defp load_rules do
    :ets.delete_all_objects(@ets_rules)
    :ets.delete_all_objects(@ets_rules_by_trigger)

    case Repo.query("SELECT `key`, name, description, trigger_event, condition_json, effect_json, priority, enabled FROM #{@rules_table} ORDER BY priority DESC, `key` ASC") do
      {:ok, %{rows: rows}} ->
        all_rules =
          for row <- rows do
            rule = row_to_rule(row)
            if rule.enabled, do: :ets.insert(@ets_rules, {rule.key, rule})
            rule
          end
          |> Enum.filter(& &1.enabled)

        by_trigger = Enum.group_by(all_rules, & &1.trigger)

        for {trig, rules} <- by_trigger do
          sorted = Enum.sort_by(rules, &(-&1.priority))
          :ets.insert(@ets_rules_by_trigger, {trig, sorted})
        end

      _ ->
        :ok
    end
  rescue
    _ -> :ok
  end

  defp row_to_status([key, name, desc, icon, cat, dur, perm, stack, max_stacks, effects, tick, disabled, cure, on_a, on_t, on_e, enabled]) do
    %{
      key: key,
      name: name,
      description: desc,
      icon: icon || "⚡",
      category: cat || "debuff",
      default_duration: dur || 3,
      permanent: to_bool(perm),
      stacking: stack || "refresh",
      max_stacks: max_stacks || 1,
      effects: decode_json_map(effects),
      tick: decode_json_map(tick),
      disabled_commands: decode_json_list(disabled),
      cure_tags: decode_json_list(cure),
      on_apply_script_id: on_a,
      on_tick_script_id: on_t,
      on_expire_script_id: on_e,
      enabled: to_bool(enabled)
    }
  end

  defp row_to_rule([key, name, desc, trigger, cond_j, effect_j, prio, enabled]) do
    %{
      key: key,
      name: name,
      description: desc,
      trigger: trigger,
      condition: decode_json_map(cond_j),
      effect: decode_json_map(effect_j),
      priority: prio || 100,
      enabled: to_bool(enabled)
    }
  end

  defp to_bool(1), do: true
  defp to_bool(true), do: true
  defp to_bool(_), do: false

  defp decode_json_map(nil), do: %{}
  defp decode_json_map(""), do: %{}
  defp decode_json_map(s) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, %{} = m} -> m
      _ -> %{}
    end
  end
  defp decode_json_map(m) when is_map(m), do: m
  defp decode_json_map(_), do: %{}

  defp decode_json_list(nil), do: []
  defp decode_json_list(""), do: []
  defp decode_json_list(s) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, l} when is_list(l) -> l
      _ -> []
    end
  end
  defp decode_json_list(l) when is_list(l), do: l
  defp decode_json_list(_), do: []

  # ── Persist ──────────────────────────────────────────────────────

  defp persist_status(def) do
    key = to_string(def[:key] || def["key"])
    Repo.query(
      """
      INSERT INTO #{@statuses_table}
        (`key`, name, description, icon, category, default_duration, permanent,
         stacking, max_stacks, effects_json, tick_json, disabled_commands_json,
         cure_tags_json, on_apply_script_id, on_tick_script_id, on_expire_script_id,
         enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        name=VALUES(name), description=VALUES(description), icon=VALUES(icon),
        category=VALUES(category), default_duration=VALUES(default_duration),
        permanent=VALUES(permanent), stacking=VALUES(stacking),
        max_stacks=VALUES(max_stacks), effects_json=VALUES(effects_json),
        tick_json=VALUES(tick_json), disabled_commands_json=VALUES(disabled_commands_json),
        cure_tags_json=VALUES(cure_tags_json), on_apply_script_id=VALUES(on_apply_script_id),
        on_tick_script_id=VALUES(on_tick_script_id), on_expire_script_id=VALUES(on_expire_script_id),
        enabled=VALUES(enabled), updated_at=NOW()
      """,
      [
        key,
        fetch(def, :name, key),
        fetch(def, :description, ""),
        fetch(def, :icon, "⚡"),
        fetch(def, :category, "debuff"),
        fetch(def, :default_duration, 3),
        if(fetch(def, :permanent, false), do: 1, else: 0),
        fetch(def, :stacking, "refresh"),
        fetch(def, :max_stacks, 1),
        encode(fetch(def, :effects, %{})),
        encode(fetch(def, :tick, %{})),
        encode(fetch(def, :disabled_commands, [])),
        encode(fetch(def, :cure_tags, [])),
        fetch(def, :on_apply_script_id, nil),
        fetch(def, :on_tick_script_id, nil),
        fetch(def, :on_expire_script_id, nil),
        if(fetch(def, :enabled, true), do: 1, else: 0)
      ]
    )
  end

  defp persist_rule(rule) do
    key = to_string(rule[:key] || rule["key"])
    Repo.query(
      """
      INSERT INTO #{@rules_table}
        (`key`, name, description, trigger_event, condition_json, effect_json,
         priority, enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        name=VALUES(name), description=VALUES(description),
        trigger_event=VALUES(trigger_event), condition_json=VALUES(condition_json),
        effect_json=VALUES(effect_json), priority=VALUES(priority),
        enabled=VALUES(enabled), updated_at=NOW()
      """,
      [
        key,
        fetch(rule, :name, key),
        fetch(rule, :description, ""),
        fetch(rule, :trigger, ""),
        encode(fetch(rule, :condition, %{})),
        encode(fetch(rule, :effect, %{})),
        fetch(rule, :priority, 100),
        if(fetch(rule, :enabled, true), do: 1, else: 0)
      ]
    )
  end

  defp fetch(map, key, default) do
    Map.get(map, key, Map.get(map, to_string(key), default))
  end

  defp encode(val), do: Jason.encode!(val)

  # ── Defaults seed ────────────────────────────────────────────────

  defp seed_defaults_if_empty do
    with {:ok, %{rows: [[sc]]}} <- Repo.query("SELECT COUNT(*) FROM #{@statuses_table}"),
         {:ok, %{rows: [[rc]]}} <- Repo.query("SELECT COUNT(*) FROM #{@rules_table}") do
      if sc == 0, do: Enum.each(TePhoenix.Battle.StatusDefaults.statuses(), &persist_status/1)
      if rc == 0, do: Enum.each(TePhoenix.Battle.StatusDefaults.rules(), &persist_rule/1)
    end
  rescue
    _ -> :ok
  end
end
