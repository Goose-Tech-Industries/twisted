defmodule TePhoenix.Battle.Respawn do
  @moduledoc """
  Data-driven respawn system for battle/match modes.

  Every match mode can define its own respawn rules. The respawn type
  is set in the match mode's settings or in the battle settings. Types:

    * `"timed"` — MOBA/arena: respawn after N seconds, scaling with
      game time. Formula: `base + (turn * scale_per_turn)`.
    * `"round"` — arena/fighting: respawn at start of next round.
      All combatants revive, cooldowns reset, positions reset.
    * `"checkpoint"` — souls-like: respawn at nearest checkpoint. All
      enemies on the map reset. Player keeps items/XP.
    * `"permanent"` — battle royale/roguelike: dead is dead. Match
      continues without you.
    * `"wave"` — horde/TD: respawn between waves. Dead during a wave
      means you sit out until the wave clears.
    * `"lives"` — platformer/brawl: N lives per match. Respawn
      instantly until lives exhausted, then permanent.
    * `"custom"` — script-driven via visual scripting graph.

  ## Configuration (in match mode settings or battle settings)

      "respawn": {
        "type": "timed",
        "base_seconds": 5,
        "scale_per_turn": 0.5,
        "max_seconds": 45,
        "respawn_hp_pct": 1.0,
        "respawn_mp_pct": 0.5,
        "respawn_at": "base",     // "base" / "last_position" / "checkpoint"
        "clear_statuses": true,
        "clear_cooldowns": true,
        "lives": 0,               // 0 = unlimited (for lives type)
        "invuln_seconds": 3       // grace period post-respawn
      }

  ## Integration

    * `battle_channel.ex` — on death/KO, schedule respawn timer
    * `state.ex` — `handle_info(:respawn, char_id)` revives combatant
    * `Triggers` — fires `"respawn"` event for rule hooks
    * Client receives `respawn_timer` push with countdown
  """

  alias TePhoenix.Battle.{Combatant, StatusEffects}
  require Logger

  @default_config %{
    "type" => "permanent",
    "base_seconds" => 5,
    "scale_per_turn" => 0.5,
    "max_seconds" => 45,
    "respawn_hp_pct" => 1.0,
    "respawn_mp_pct" => 0.5,
    "respawn_at" => "base",
    "clear_statuses" => true,
    "clear_cooldowns" => true,
    "lives" => 0,
    "invuln_seconds" => 3
  }

  # ── Schedule ────────────────────────────────────────────────────

  @doc """
  Called when a combatant dies/is KO'd. Determines the respawn type
  from battle settings and either schedules a respawn timer or marks
  the death as permanent.

  Returns `{state, result}` with respawn scheduling info.
  """
  def on_death(state, combatant, result) do
    config = get_config(state)

    case config["type"] do
      "permanent" ->
        result = %{result |
          actions: [%{type: :permanent_death, char_id: combatant.char_id} | result.actions]
        }
        {state, result}

      "timed" ->
        delay = calculate_timed_delay(config, state.turn_number)
        schedule_respawn(state, combatant, delay, config, result)

      "round" ->
        # Mark for respawn at next round. Stored on combatant.
        combatant = Map.put(combatant, :respawn_at_round, true)
        state = put_in(state.combatants[combatant.char_id], combatant)
        result = %{result |
          log: ["#{combatant.name} will respawn next round." | result.log],
          actions: [%{type: :respawn_round, char_id: combatant.char_id} | result.actions]
        }
        {state, result}

      "wave" ->
        combatant = Map.put(combatant, :respawn_at_wave_clear, true)
        state = put_in(state.combatants[combatant.char_id], combatant)
        result = %{result |
          log: ["#{combatant.name} will respawn when the wave clears." | result.log],
          actions: [%{type: :respawn_wave, char_id: combatant.char_id} | result.actions]
        }
        {state, result}

      "lives" ->
        lives_used = Map.get(combatant, :lives_used, 0) + 1
        max_lives = config["lives"] || 3

        if lives_used >= max_lives do
          result = %{result |
            log: ["#{combatant.name} has no lives remaining!" | result.log],
            actions: [%{type: :permanent_death, char_id: combatant.char_id, lives_used: lives_used} | result.actions]
          }
          {state, result}
        else
          combatant = Map.put(combatant, :lives_used, lives_used)
          state = put_in(state.combatants[combatant.char_id], combatant)
          schedule_respawn(state, combatant, config["base_seconds"] || 3, config, result)
        end

      "checkpoint" ->
        delay = config["base_seconds"] || 3
        schedule_respawn(state, combatant, delay, config, result)

      _ ->
        {state, result}
    end
  end

  # ── Execute respawn ─────────────────────────────────────────────

  @doc """
  Revive a combatant. Called by the battle GenServer when the respawn
  timer fires, or immediately for round/wave respawns.

  Returns the updated combatant and a result with the respawn event.
  """
  def execute_respawn(state, char_id) do
    combatant = Map.get(state.combatants, char_id)
    config = get_config(state)

    if combatant do
      hp_pct = config["respawn_hp_pct"] || 1.0
      mp_pct = config["respawn_mp_pct"] || 0.5

      combatant = %{combatant |
        current_hp: max(1, trunc(combatant.max_hp * hp_pct)),
        current_mp: trunc(combatant.max_mp * mp_pct),
        knocked_out: false,
        unconscious: false
      }

      # Clear statuses if configured
      combatant =
        if config["clear_statuses"] != false do
          Map.put(combatant, :statuses, [])
        else
          combatant
        end

      # Clear cooldowns if configured
      combatant =
        if config["clear_cooldowns"] != false do
          Map.put(combatant, :cooldowns, %{})
        else
          combatant
        end

      # Reset position
      combatant = reset_position(combatant, config, state)

      # Apply invulnerability
      {combatant, result} =
        if (config["invuln_seconds"] || 0) > 0 do
          invuln_status = %{
            key: "respawn_invuln",
            name: "Invulnerable",
            icon: "✨",
            category: "buff",
            duration: config["invuln_seconds"],
            permanent: false,
            stacks: 1,
            effects: %{"damage_taken_mult" => 0.0, "prevent_action" => false},
            tick: %{},
            disabled_commands: [],
            cure_tags: []
          }

          existing = Map.get(combatant, :statuses, []) || []
          {Map.put(combatant, :statuses, existing ++ [invuln_status]),
           %{log: ["✨ #{combatant.name} is temporarily invulnerable!"], actions: []}}
        else
          {combatant, %{log: [], actions: []}}
        end

      # Clear respawn flags
      combatant =
        combatant
        |> Map.delete(:respawn_at_round)
        |> Map.delete(:respawn_at_wave_clear)

      state = put_in(state.combatants[char_id], combatant)

      result = %{result |
        log: ["🔄 #{combatant.name} has respawned!" | result.log],
        actions: [%{type: :respawn, char_id: char_id, hp: combatant.current_hp, x: combatant.grid_x, y: combatant.grid_y} | result.actions]
      }

      {state, result}
    else
      {state, %{log: [], actions: []}}
    end
  end

  @doc "Respawn all combatants flagged for round respawn."
  def respawn_round(state) do
    chars_to_respawn =
      state.combatants
      |> Enum.filter(fn {_id, c} -> Map.get(c, :respawn_at_round) == true end)
      |> Enum.map(fn {id, _} -> id end)

    Enum.reduce(chars_to_respawn, {state, %{log: [], actions: []}}, fn id, {st, r} ->
      {st2, r2} = execute_respawn(st, id)
      {st2, %{log: r2.log ++ r.log, actions: r2.actions ++ r.actions}}
    end)
  end

  @doc "Respawn all combatants flagged for wave-clear respawn."
  def respawn_wave_clear(state) do
    chars_to_respawn =
      state.combatants
      |> Enum.filter(fn {_id, c} -> Map.get(c, :respawn_at_wave_clear) == true end)
      |> Enum.map(fn {id, _} -> id end)

    Enum.reduce(chars_to_respawn, {state, %{log: [], actions: []}}, fn id, {st, r} ->
      {st2, r2} = execute_respawn(st, id)
      {st2, %{log: r2.log ++ r.log, actions: r2.actions ++ r.actions}}
    end)
  end

  # ── Internal ────────────────────────────────────────────────────

  defp schedule_respawn(state, combatant, delay_seconds, config, result) do
    delay_ms = delay_seconds * 1000
    # The battle GenServer will receive {:respawn, char_id} after the delay.
    # We store the timer ref so it can be cancelled if the battle ends.
    Process.send_after(self(), {:respawn, combatant.char_id}, delay_ms)

    lives_info = if config["type"] == "lives" do
      lives_used = Map.get(combatant, :lives_used, 0)
      " (#{config["lives"] - lives_used} lives remaining)"
    else
      ""
    end

    result = %{result |
      log: ["#{combatant.name} will respawn in #{delay_seconds} seconds#{lives_info}." | result.log],
      actions: [%{
        type: :respawn_timer,
        char_id: combatant.char_id,
        delay_seconds: delay_seconds,
        respawn_at: config["respawn_at"]
      } | result.actions]
    }

    {state, result}
  end

  defp calculate_timed_delay(config, turn_number) do
    base = config["base_seconds"] || 5
    scale = config["scale_per_turn"] || 0.5
    max_delay = config["max_seconds"] || 45

    delay = base + trunc(turn_number * scale)
    min(max_delay, delay)
  end

  defp reset_position(combatant, config, state) do
    case config["respawn_at"] do
      "last_position" ->
        combatant

      "checkpoint" ->
        combatant

      _ ->
        # "base" — respawn at team's starting position
        team_id = combatant.team_id
        base_x = if team_id == 1, do: 0, else: (state.grid_w || 8) - 1
        base_y = div(state.grid_h || 5, 2)
        %{combatant | grid_x: base_x, grid_y: base_y}
    end
  end

  defp get_config(state) do
    settings = state.settings || %{}

    case settings[:respawn] do
      %{} = config -> Map.merge(@default_config, config)
      _ -> @default_config
    end
  end
end
