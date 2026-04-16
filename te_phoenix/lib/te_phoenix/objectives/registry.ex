defmodule TePhoenix.Objectives.Registry do
  @moduledoc """
  Data-driven objective definition registry.

  Two tables, auto-created on boot:

    * `game_objective_defs` — definitions (tower, generator, switch,
      collect-quest, kill-quest, survive, escort, etc.). Every field
      editable from AdminSauce. No objective types are hardcoded.

    * `game_objective_instances` — live runtime state per objective
      placed on a map. Tracks progress, status, interacting players.

  Definitions are ETS-cached. Instances are DB-persisted and loaded
  on demand per-map. `reload/0` rebuilds ETS after edits.

  ## Objective types

  The `type` field is a freeform string that the Ticker and API use
  to determine UX behavior:

    * `"interact"` — single-use interact (lever, switch, button)
    * `"hold"` — hold-to-interact with progress bar (DBD generator)
    * `"destroy"` — has HP, team-targetable (MOBA tower, barrel)
    * `"collect"` — counter incremented by item pickup / kill
    * `"survive"` — timer counts UP, succeed when target reached
    * `"escort"` — NPC must reach target tile alive
    * `"reach"` — player must stand on target tile
    * `"construct"` — hold to build, then becomes functional (RTS)
    * `"toggle"` — flip between on/off states
    * `"custom"` — entirely script-driven via on_progress graph

  ## Progress models

    * `"boolean"` — 0 or 1, complete on first trigger
    * `"counter"` — 0..target_value, complete when == target
    * `"timer"` — seconds of continuous interaction, Ticker-driven
    * `"hp"` — starts at target_value, decremented by damage
  """

  use GenServer
  require Logger

  alias TePhoenix.Repo

  @defs_table "game_objective_defs"
  @instances_table "game_objective_instances"
  @ets_defs :twisted_objective_defs

  def start_link(_opts \\ []) do
    GenServer.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  # ── Public API ──────────────────────────────────────────────────

  def get_def(key) when is_binary(key) do
    case :ets.lookup(@ets_defs, key) do
      [{^key, d}] -> d
      _ -> nil
    end
  rescue
    ArgumentError -> nil
  end

  def list_defs do
    :ets.tab2list(@ets_defs) |> Enum.map(fn {_k, v} -> v end)
  rescue
    ArgumentError -> []
  end

  def reload, do: GenServer.call(__MODULE__, :reload)

  def upsert_def(%{} = d), do: GenServer.call(__MODULE__, {:upsert_def, d})
  def delete_def(key), do: GenServer.call(__MODULE__, {:delete_def, to_string(key)})

  # ── Instance CRUD (DB-direct, no ETS) ───────────────────────────

  def list_instances(map_id) do
    case Repo.query("SELECT id, objective_key, map_id, x, y, current_value, status, team_id, interacting_json, settings_json, started_at, completed_at FROM #{@instances_table} WHERE map_id = ? ORDER BY id ASC", [map_id]) do
      {:ok, %{rows: rows}} -> Enum.map(rows, &row_to_instance/1)
      _ -> []
    end
  rescue
    _ -> []
  end

  def get_instance(id) do
    case Repo.query("SELECT id, objective_key, map_id, x, y, current_value, status, team_id, interacting_json, settings_json, started_at, completed_at FROM #{@instances_table} WHERE id = ?", [id]) do
      {:ok, %{rows: [row]}} -> row_to_instance(row)
      _ -> nil
    end
  rescue
    _ -> nil
  end

  def upsert_instance(%{} = inst) do
    Repo.query(
      """
      INSERT INTO #{@instances_table}
        (id, objective_key, map_id, x, y, current_value, status, team_id,
         interacting_json, settings_json, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        current_value=VALUES(current_value), status=VALUES(status),
        team_id=VALUES(team_id), interacting_json=VALUES(interacting_json),
        settings_json=VALUES(settings_json), started_at=VALUES(started_at),
        completed_at=VALUES(completed_at)
      """,
      [
        inst[:id],
        inst[:objective_key] || "",
        inst[:map_id],
        inst[:x] || 0,
        inst[:y] || 0,
        inst[:current_value] || 0,
        inst[:status] || "inactive",
        inst[:team_id],
        Jason.encode!(inst[:interacting] || []),
        Jason.encode!(inst[:settings] || %{}),
        inst[:started_at],
        inst[:completed_at]
      ]
    )
  rescue
    e -> Logger.error("upsert_instance failed: #{inspect(e)}")
  end

  def update_instance_state(id, updates) do
    sets = Enum.map(updates, fn {k, _v} -> "#{k}=?" end) |> Enum.join(", ")
    vals = Enum.map(updates, fn {_k, v} -> v end)

    Repo.query("UPDATE #{@instances_table} SET #{sets} WHERE id = ?", vals ++ [id])
  rescue
    e -> Logger.error("update_instance_state failed: #{inspect(e)}")
  end

  def delete_instance(id) do
    Repo.query("DELETE FROM #{@instances_table} WHERE id = ?", [id])
  end

  # ── GenServer ───────────────────────────────────────────────────

  @impl true
  def init(:ok) do
    ensure_ets()
    ensure_tables()
    seed_defaults_if_empty()
    load_defs()
    {:ok, %{}}
  end

  @impl true
  def handle_call(:reload, _from, state) do
    load_defs()
    {:reply, :ok, state}
  end

  def handle_call({:upsert_def, d}, _from, state) do
    persist_def(d)
    load_defs()
    {:reply, :ok, state}
  end

  def handle_call({:delete_def, key}, _from, state) do
    Repo.query("DELETE FROM #{@defs_table} WHERE `key` = ?", [key])
    load_defs()
    {:reply, :ok, state}
  end

  # ── ETS ─────────────────────────────────────────────────────────

  defp ensure_ets do
    case :ets.info(@ets_defs) do
      :undefined -> :ets.new(@ets_defs, [:set, :public, :named_table, read_concurrency: true])
      _ -> :ok
    end
  end

  # ── DB tables ───────────────────────────────────────────────────

  defp ensure_tables do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@defs_table} (
      `key` VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      icon VARCHAR(16) DEFAULT '🎯',
      type VARCHAR(32) DEFAULT 'interact',
      progress_model VARCHAR(16) DEFAULT 'boolean',
      target_value INT DEFAULT 1,
      team_owned TINYINT(1) DEFAULT 0,
      respawn_seconds INT DEFAULT 0,
      on_progress_json LONGTEXT,
      on_complete_json LONGTEXT,
      on_fail_json LONGTEXT,
      settings_json LONGTEXT,
      enabled TINYINT(1) DEFAULT 1,
      updated_at DATETIME NOT NULL
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@instances_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      objective_key VARCHAR(80) NOT NULL,
      map_id INT NOT NULL,
      x INT DEFAULT 0,
      y INT DEFAULT 0,
      current_value INT DEFAULT 0,
      status VARCHAR(16) DEFAULT 'inactive',
      team_id INT,
      interacting_json LONGTEXT,
      settings_json LONGTEXT,
      started_at DATETIME,
      completed_at DATETIME,
      INDEX idx_map (map_id),
      INDEX idx_key (objective_key)
    )
    """)
  rescue
    e -> Logger.error("Objectives ensure_tables: #{inspect(e)}")
  end

  # ── Load ────────────────────────────────────────────────────────

  defp load_defs do
    :ets.delete_all_objects(@ets_defs)

    case Repo.query("SELECT `key`, name, description, icon, type, progress_model, target_value, team_owned, respawn_seconds, on_progress_json, on_complete_json, on_fail_json, settings_json, enabled FROM #{@defs_table}") do
      {:ok, %{rows: rows}} ->
        for row <- rows do
          d = row_to_def(row)
          if d.enabled, do: :ets.insert(@ets_defs, {d.key, d})
        end

      _ ->
        :ok
    end
  rescue
    _ -> :ok
  end

  defp row_to_def([key, name, desc, icon, type, pm, tv, team, respawn, on_p, on_c, on_f, settings, enabled]) do
    %{
      key: key,
      name: name,
      description: desc,
      icon: icon || "🎯",
      type: type || "interact",
      progress_model: pm || "boolean",
      target_value: tv || 1,
      team_owned: to_bool(team),
      respawn_seconds: respawn || 0,
      on_progress: decode_json(on_p),
      on_complete: decode_json(on_c),
      on_fail: decode_json(on_f),
      settings: decode_json(settings),
      enabled: to_bool(enabled)
    }
  end

  defp row_to_instance([id, key, map_id, x, y, cv, status, team, inter_j, set_j, started, completed]) do
    %{
      id: id,
      objective_key: key,
      map_id: map_id,
      x: x || 0,
      y: y || 0,
      current_value: cv || 0,
      status: status || "inactive",
      team_id: team,
      interacting: decode_json_list(inter_j),
      settings: decode_json(set_j),
      started_at: started,
      completed_at: completed
    }
  end

  # ── Persist ─────────────────────────────────────────────────────

  defp persist_def(d) do
    key = to_string(d[:key] || d["key"])
    Repo.query(
      """
      INSERT INTO #{@defs_table}
        (`key`, name, description, icon, type, progress_model, target_value,
         team_owned, respawn_seconds, on_progress_json, on_complete_json,
         on_fail_json, settings_json, enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        name=VALUES(name), description=VALUES(description), icon=VALUES(icon),
        type=VALUES(type), progress_model=VALUES(progress_model),
        target_value=VALUES(target_value), team_owned=VALUES(team_owned),
        respawn_seconds=VALUES(respawn_seconds), on_progress_json=VALUES(on_progress_json),
        on_complete_json=VALUES(on_complete_json), on_fail_json=VALUES(on_fail_json),
        settings_json=VALUES(settings_json), enabled=VALUES(enabled), updated_at=NOW()
      """,
      [
        key,
        fetch(d, :name, key),
        fetch(d, :description, ""),
        fetch(d, :icon, "🎯"),
        fetch(d, :type, "interact"),
        fetch(d, :progress_model, "boolean"),
        fetch(d, :target_value, 1),
        if(fetch(d, :team_owned, false), do: 1, else: 0),
        fetch(d, :respawn_seconds, 0),
        Jason.encode!(fetch(d, :on_progress, %{})),
        Jason.encode!(fetch(d, :on_complete, %{})),
        Jason.encode!(fetch(d, :on_fail, %{})),
        Jason.encode!(fetch(d, :settings, %{})),
        if(fetch(d, :enabled, true), do: 1, else: 0)
      ]
    )
  end

  # ── Helpers ─────────────────────────────────────────────────────

  defp fetch(map, key, default), do: Map.get(map, key, Map.get(map, to_string(key), default))

  defp to_bool(1), do: true
  defp to_bool(true), do: true
  defp to_bool(_), do: false

  defp decode_json(nil), do: %{}
  defp decode_json(""), do: %{}
  defp decode_json(s) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, m} when is_map(m) -> m
      {:ok, l} when is_list(l) -> l
      _ -> %{}
    end
  end
  defp decode_json(m) when is_map(m), do: m
  defp decode_json(_), do: %{}

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

  # ── Defaults seed ───────────────────────────────────────────────

  defp seed_defaults_if_empty do
    case Repo.query("SELECT COUNT(*) FROM #{@defs_table}") do
      {:ok, %{rows: [[0]]}} ->
        Enum.each(TePhoenix.Objectives.Defaults.defs(), &persist_def/1)

      _ ->
        :ok
    end
  rescue
    _ -> :ok
  end
end
