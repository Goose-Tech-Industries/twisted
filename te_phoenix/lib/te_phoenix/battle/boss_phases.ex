defmodule TePhoenix.Battle.BossPhases do
  @moduledoc """
  Multi-phase boss fight system.

  A boss can have N phases, each triggered at an HP threshold. When the
  boss crosses a threshold, the phase transitions: new moveset, stat
  modifiers, status applications, add spawns, arena changes (terrain
  mutations, hazard zones), and visual/music cues.

  ## Phase definition (DB-driven, editable from AdminSauce)

  Stored in `game_boss_phases` table. Each row:

      %{
        boss_npc_id: 42,
        phase: 2,
        hp_threshold_pct: 0.50,     # triggers when HP drops below 50%
        name: "Enraged",
        on_enter: %{
          "apply_status" => ["berserk", "haste"],
          "remove_status" => ["shield"],
          "stat_mults" => %{"atk" => 1.5, "speed" => 1.3},
          "spawn_adds" => [%{"npc_template" => "minion", "count" => 3, "zone_key" => "boss_room"}],
          "terrain_change" => %{"fire" => [[3,3],[4,3],[5,3]]},
          "broadcast" => "boss_phase_2",
          "dialogue" => "You dare wound me?! FEEL MY WRATH!",
          "music" => "boss_phase2_intense",
          "script_id" => nil
        },
        on_exit: %{},
        settings: %{}
      }

  ## How it works

  1. After damage is applied to a boss combatant, `check_phase_transition/3`
     compares current HP% against each phase's threshold.
  2. If the boss crossed into a new phase (lower HP%), `enter_phase/4` runs:
     - Applies/removes statuses via StatusEffects
     - Multiplies stats (stored as temporary status modifiers)
     - Spawns add NPCs via the wave system
     - Mutates terrain
     - Broadcasts phase change event for client (music, visual, dialogue)
     - Fires the trigger bus with "boss_phase" event
  3. Phase is tracked on the combatant via `boss_current_phase` field.
  4. If the boss is healed ABOVE a threshold, the phase does NOT revert
     (phases are one-way down). This prevents phase-cycling exploits.

  ## Integration

    * `damage.ex` — after damage resolution, calls `check_phase_transition`
    * `Triggers` — fires `"boss_phase"` event with phase number
    * `StatusEffects` — phase stat mults are applied as a synthetic status
    * `Waves.Scheduler` — add spawns use the same spawn infrastructure
    * `state.ex` — terrain_map mutations for hazard zones
    * `battle_channel.ex` — broadcasts phase change for client effects
  """

  require Logger
  alias TePhoenix.Battle.{Combatant, StatusEffects, Triggers}
  alias TePhoenix.Repo

  @table "game_boss_phases"

  # ── Setup ───────────────────────────────────────────────────────

  def ensure_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      boss_npc_id INT NOT NULL,
      phase INT NOT NULL DEFAULT 1,
      hp_threshold_pct FLOAT NOT NULL DEFAULT 0.75,
      name VARCHAR(120) DEFAULT 'Phase',
      on_enter_json LONGTEXT,
      on_exit_json LONGTEXT,
      settings_json LONGTEXT,
      enabled TINYINT(1) DEFAULT 1,
      UNIQUE KEY uk_boss_phase (boss_npc_id, phase),
      INDEX idx_boss (boss_npc_id)
    )
    """)
  rescue
    e -> Logger.error("BossPhases ensure_table: #{inspect(e)}")
  end

  # ── Phase lookup ────────────────────────────────────────────────

  @doc "Get all phases for a boss NPC, sorted by threshold descending (highest first)."
  def get_phases(boss_npc_id) do
    case Repo.query(
      "SELECT phase, hp_threshold_pct, name, on_enter_json, on_exit_json, settings_json FROM #{@table} WHERE boss_npc_id = ? AND enabled = 1 ORDER BY hp_threshold_pct DESC",
      [boss_npc_id]
    ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [phase, thresh, name, enter_j, exit_j, set_j] ->
          %{
            phase: phase,
            hp_threshold_pct: thresh || 0.75,
            name: name || "Phase #{phase}",
            on_enter: decode(enter_j),
            on_exit: decode(exit_j),
            settings: decode(set_j)
          }
        end)

      _ -> []
    end
  rescue
    _ -> []
  end

  # ── Phase transition check ──────────────────────────────────────

  @doc """
  Check if a boss combatant should transition to a new phase after
  taking damage. Call this after damage resolution in the pipeline.

  Returns `{state, combatant, result}` — may have mutated all three
  if a phase transition occurred.
  """
  def check_phase_transition(state, combatant, result) do
    # Only check bosses (combatants with boss_npc_id set)
    boss_npc_id = Map.get(combatant, :boss_npc_id)

    if is_nil(boss_npc_id) or not Combatant.alive?(combatant) do
      {state, combatant, result}
    else
      current_phase = Map.get(combatant, :boss_current_phase, 0)
      hp_pct = if combatant.max_hp > 0, do: combatant.current_hp / combatant.max_hp, else: 0.0

      phases = get_phases(boss_npc_id)

      # Find the highest-numbered phase whose threshold we've crossed
      # that we haven't entered yet (phases are one-way)
      next_phase =
        phases
        |> Enum.filter(fn p -> hp_pct <= p.hp_threshold_pct and p.phase > current_phase end)
        |> Enum.sort_by(& &1.phase)
        |> List.first()

      if next_phase do
        enter_phase(state, combatant, next_phase, result)
      else
        {state, combatant, result}
      end
    end
  end

  # ── Phase entry ─────────────────────────────────────────────────

  defp enter_phase(state, combatant, phase_def, result) do
    Logger.info("Boss #{combatant.name} enters #{phase_def.name} (phase #{phase_def.phase})")

    combatant = Map.put(combatant, :boss_current_phase, phase_def.phase)
    on_enter = phase_def.on_enter || %{}

    # Apply statuses
    {combatant, result} = apply_phase_statuses(combatant, on_enter, result)

    # Remove statuses
    combatant = remove_phase_statuses(combatant, on_enter)

    # Stat multipliers as a synthetic "boss_phase" status
    combatant = apply_phase_stat_mults(combatant, on_enter)

    # Update combatant in state
    state = put_in(state.combatants[combatant.char_id], combatant)

    # Spawn adds
    state = spawn_adds(state, on_enter)

    # Terrain changes
    state = apply_terrain_changes(state, on_enter)

    # Dialogue
    result = maybe_add_dialogue(result, combatant, on_enter)

    # Broadcast
    result = %{result |
      log: ["⚠️ #{combatant.name} enters #{phase_def.name}!" | result.log],
      actions: [%{
        type: :boss_phase,
        boss: combatant.name,
        phase: phase_def.phase,
        name: phase_def.name,
        music: on_enter["music"],
        visual: on_enter["visual"]
      } | result.actions]
    }

    # Fire trigger
    ctx = %{victim: combatant, attacker: nil, phase: phase_def.phase}
    {state, result} = Triggers.fire("boss_phase", state, ctx, result)

    # Run script if attached
    if sid = on_enter["script_id"] do
      try do
        {state, result} = TePhoenix.Game.ScriptInterpreter.run_for_trigger(sid, state, ctx, result)
        {state, Map.get(state.combatants, combatant.char_id, combatant), result}
      rescue
        _ -> {state, combatant, result}
      end
    else
      {state, combatant, result}
    end
  end

  defp apply_phase_statuses(combatant, on_enter, result) do
    statuses = on_enter["apply_status"] || []
    statuses = if is_binary(statuses), do: [statuses], else: statuses

    Enum.reduce(statuses, {combatant, result}, fn key, {c, r} ->
      StatusEffects.apply_status(c, key, r)
    end)
  end

  defp remove_phase_statuses(combatant, on_enter) do
    statuses = on_enter["remove_status"] || []
    statuses = if is_binary(statuses), do: [statuses], else: statuses

    Enum.reduce(statuses, combatant, fn key, c ->
      StatusEffects.remove(c, key)
    end)
  end

  defp apply_phase_stat_mults(combatant, on_enter) do
    case on_enter["stat_mults"] do
      nil -> combatant
      %{} = mults when map_size(mults) == 0 -> combatant
      mults ->
        # Apply as a permanent synthetic status so compute_modifiers picks it up
        phase_status = %{
          key: "boss_phase_buff",
          name: "Phase Power",
          icon: "👹",
          category: "buff",
          duration: nil,
          permanent: true,
          stacks: 1,
          effects: Map.new(mults, fn {stat, mult} -> {"#{stat}_mult", mult} end),
          tick: %{},
          disabled_commands: [],
          cure_tags: []
        }

        existing = Map.get(combatant, :statuses, []) || []
        filtered = Enum.reject(existing, &(&1[:key] == "boss_phase_buff"))
        Map.put(combatant, :statuses, filtered ++ [phase_status])
    end
  end

  defp spawn_adds(state, on_enter) do
    adds = on_enter["spawn_adds"] || []

    Enum.reduce(adds, state, fn add, st ->
      count = add["count"] || 1
      template = add["npc_template"] || "minion"

      for _i <- 1..count do
        try do
          Repo.query(
            "INSERT INTO game_npcs (name, map_id, x, y, hp, max_hp, atk, is_enemy, created_at) VALUES (?, ?, ?, ?, 100, 100, 10, 1, NOW())",
            [template, st.map_id || 1, :rand.uniform(st.grid_w), :rand.uniform(st.grid_h)]
          )
        rescue
          _ -> nil
        end
      end

      st
    end)
  end

  defp apply_terrain_changes(state, on_enter) do
    case on_enter["terrain_change"] do
      nil -> state
      %{} = changes ->
        terrain = state.terrain_map || %{}

        terrain =
          Enum.reduce(changes, terrain, fn {terrain_type, coords}, acc ->
            Enum.reduce(coords, acc, fn
              [x, y], a -> Map.put(a, "#{x},#{y}", terrain_type)
              _, a -> a
            end)
          end)

        %{state | terrain_map: terrain}
    end
  end

  defp maybe_add_dialogue(result, combatant, on_enter) do
    case on_enter["dialogue"] do
      nil -> result
      "" -> result
      text ->
        %{result |
          log: ["💬 #{combatant.name}: \"#{text}\"" | result.log],
          actions: [%{type: :boss_dialogue, boss: combatant.name, text: text} | result.actions]
        }
    end
  end

  # ── CRUD for AdminSauce ─────────────────────────────────────────

  def upsert_phase(boss_npc_id, phase_num, attrs) do
    Repo.query(
      """
      INSERT INTO #{@table} (boss_npc_id, phase, hp_threshold_pct, name, on_enter_json, on_exit_json, settings_json, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        hp_threshold_pct=VALUES(hp_threshold_pct), name=VALUES(name),
        on_enter_json=VALUES(on_enter_json), on_exit_json=VALUES(on_exit_json),
        settings_json=VALUES(settings_json)
      """,
      [
        boss_npc_id, phase_num,
        attrs[:hp_threshold_pct] || 0.5,
        attrs[:name] || "Phase #{phase_num}",
        Jason.encode!(attrs[:on_enter] || %{}),
        Jason.encode!(attrs[:on_exit] || %{}),
        Jason.encode!(attrs[:settings] || %{})
      ]
    )
  end

  def delete_phase(boss_npc_id, phase_num) do
    Repo.query("DELETE FROM #{@table} WHERE boss_npc_id = ? AND phase = ?", [boss_npc_id, phase_num])
  end

  # ── Helpers ─────────────────────────────────────────────────────

  defp decode(nil), do: %{}
  defp decode(""), do: %{}
  defp decode(s) when is_binary(s), do: case(Jason.decode(s), do: ({:ok, v} -> v; _ -> %{}))
  defp decode(m) when is_map(m), do: m
  defp decode(_), do: %{}
end
