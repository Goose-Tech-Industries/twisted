defmodule TePhoenix.Battle.State do
  @moduledoc """
  Battle state GenServer — each active battle is its own process.
  Ported from te/battle/state.js BattleState class.

  Key BEAM advantages over the JS version:
  - Each battle is an isolated process (crash isolation)
  - Turn timeouts via Process.send_after (no manual timers)
  - Battle state is immutable between updates (no race conditions)
  - Process hibernation for idle battles (memory efficiency)
  - Native supervision and restart on crash
  """

  use GenServer
  require Logger

  alias TePhoenix.Battle.{Combatant, Settings, StatusEffects, Triggers, Projectiles, Respawn, Surfaces, Reactions}

  # ── State struct ────────────────────────────────────────────────

  defstruct [
    :id,
    :access_token,
    type: :pvp,
    status: :active,
    winner: nil,
    turn_number: 1,
    log: [],

    # Teams & combatants
    combatants: %{},
    teams: %{},

    # Turn queue (speed-sorted list of char_ids)
    turn_queue: [],
    turn_queue_idx: 0,
    turn_char_id: nil,

    # Grid
    grid_w: 8,
    grid_h: 5,
    terrain_map: %{},
    surface_durations: %{},
    battle_objects: %{},
    elevation_map: %{},

    # Map location
    map_id: nil,
    map_x: nil,
    map_y: nil,

    # Settings (loaded async)
    settings: nil,

    # NPC tracking for quest kill credit
    enemy_npc_ids: [],

    # Weather
    weather: nil,

    # Turn timeout timer ref
    turn_timer: nil,

    # Pending events queued by data-driven trigger rules (interrogation
    # prompts, post-ko dialogue, quest hooks). Channels drain this list
    # via get_pending_events/1 + clear_pending_events/1.
    pending_events: [],

    # Active projectiles in flight (skillshots, ranged attacks, AoE)
    active_projectiles: []
  ]

  # ── Object presets (BG3-style destructibles) ────────────────────

  @object_presets %{
    barrel: %{
      hp: 20, icon: "🛢️", label: "Oil Barrel", blocking: true, cover_value: 0,
      on_destroy: %{type: :fire_aoe, radius: 1, damage: 15, terrain: :fire,
                     message: "💥 The barrel explodes in a burst of flame!"}
    },
    crate: %{
      hp: 30, icon: "📦", label: "Crate", blocking: true, cover_value: 30,
      on_destroy: %{type: :remove_cover, message: "📦 The crate shatters!"}
    },
    chandelier: %{
      hp: 15, icon: "🕯️", label: "Chandelier", blocking: false, cover_value: 0,
      on_destroy: %{type: :crush, damage: 30, message: "💥 The chandelier crashes down!"}
    },
    pot: %{
      hp: 10, icon: "🏺", label: "Pot", blocking: true, cover_value: 10,
      on_destroy: %{type: :remove_cover, message: "🏺 The pot shatters!"}
    },
    torch: %{
      hp: 12, icon: "🔥", label: "Torch Stand", blocking: true, cover_value: 0,
      on_destroy: %{type: :fire_aoe, radius: 0, damage: 10, terrain: :fire,
                     message: "🔥 The torch topples and ignites the ground!"}
    }
  }

  def object_presets, do: @object_presets

  # ══════════════════════════════════════════════════════════════════
  # PUBLIC API
  # ══════════════════════════════════════════════════════════════════

  @doc "Start a new battle process"
  def start_link(opts) do
    battle_id = Keyword.fetch!(opts, :id)
    GenServer.start_link(__MODULE__, opts, name: via(battle_id))
  end

  @doc "Get the full battle state"
  def get_state(battle_id) do
    GenServer.call(via(battle_id), :get_state)
  end

  @doc "Get a specific combatant"
  def get_combatant(battle_id, char_id) do
    GenServer.call(via(battle_id), {:get_combatant, char_id})
  end

  @doc "Get whose turn it is"
  def current_turn(battle_id) do
    GenServer.call(via(battle_id), :current_turn)
  end

  @doc "Advance to the next turn"
  def next_turn(battle_id) do
    GenServer.call(via(battle_id), :next_turn)
  end

  @doc """
  Drain pending trigger-queued events (interrogation prompts, post-ko
  dialogue, quest hooks). Returns the list and clears it atomically so
  callers can't double-process.
  """
  def drain_pending_events(battle_id) do
    GenServer.call(via(battle_id), :drain_pending_events)
  end

  @doc "Peek at pending events without clearing."
  def peek_pending_events(battle_id) do
    GenServer.call(via(battle_id), :peek_pending_events)
  end

  @doc "Add a combatant mid-battle"
  def add_combatant(battle_id, stats, team_id, is_ai \\ false) do
    GenServer.call(via(battle_id), {:add_combatant, stats, team_id, is_ai})
  end

  @doc "Switch a combatant to a different team"
  def switch_team(battle_id, char_id, new_team_id) do
    GenServer.call(via(battle_id), {:switch_team, char_id, new_team_id})
  end

  @doc "Update a combatant (applies a function to the combatant struct)"
  def update_combatant(battle_id, char_id, update_fn) do
    GenServer.call(via(battle_id), {:update_combatant, char_id, update_fn})
  end

  @doc "Add a log entry"
  def add_log(battle_id, entry) do
    GenServer.cast(via(battle_id), {:add_log, entry})
  end

  @doc "Register battle on a map (for mid-battle join visibility)"
  def register_on_map(battle_id, map_id, x, y) do
    GenServer.cast(via(battle_id), {:register_on_map, map_id, x, y})
  end

  @doc "Initialize settings from DB"
  def init_settings(battle_id, arena_row \\ nil) do
    GenServer.call(via(battle_id), {:init_settings, arena_row}, 10_000)
  end

  @doc "End the battle with a winner"
  def finish(battle_id, winner) do
    GenServer.call(via(battle_id), {:finish, winner})
  end

  @doc "Get all living enemies of a combatant"
  def get_enemy_team(battle_id, char_id) do
    GenServer.call(via(battle_id), {:get_enemy_team, char_id})
  end

  @doc "Get all living allies of a combatant"
  def get_ally_team(battle_id, char_id) do
    GenServer.call(via(battle_id), {:get_ally_team, char_id})
  end

  @doc "Replace the full battle state (after Combat.execute returns a modified state)"
  def replace_state(battle_id, new_state) do
    GenServer.call(via(battle_id), {:replace_state, new_state})
  end

  @doc "Check if battle process is alive"
  def alive?(battle_id) do
    case Registry.lookup(TePhoenix.BattleRegistry, battle_id) do
      [{_pid, _}] -> true
      [] -> false
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # GENSERVER CALLBACKS
  # ══════════════════════════════════════════════════════════════════

  @impl true
  def init(opts) do
    battle_id = Keyword.fetch!(opts, :id)
    teams = Keyword.fetch!(opts, :teams)
    type = Keyword.get(opts, :type, :pvp)

    state = %__MODULE__{
      id: battle_id,
      access_token: :crypto.strong_rand_bytes(16) |> Base.encode16(case: :lower),
      type: type,
      settings: Settings.defaults()
    }

    # Build combatants from team specs
    state = build_teams(state, teams)

    # Build turn queue and set first actor
    state = rebuild_turn_queue(state)
    state = %{state | turn_char_id: List.first(state.turn_queue)}

    # Assign grid positions
    state = assign_grid_positions(state)

    Logger.info("Battle #{battle_id} started: #{inspect(Map.keys(state.teams))}")

    # Fire battle_start trigger so data-driven rules can run intro
    # effects (buffs, dialogue, boss phase setup, etc.)
    {state, _result} = Triggers.fire("battle_start", state, %{}, %{log: [], actions: []})

    {:ok, state}
  end

  @impl true
  def handle_call(:get_state, _from, state) do
    {:reply, state, state}
  end

  def handle_call({:get_combatant, char_id}, _from, state) do
    {:reply, Map.get(state.combatants, char_id), state}
  end

  def handle_call(:current_turn, _from, state) do
    combatant = Map.get(state.combatants, state.turn_char_id)
    {:reply, {state.turn_char_id, combatant}, state}
  end

  def handle_call(:next_turn, _from, state) do
    state = cancel_turn_timer(state)
    state = run_turn_end_hooks(state)
    state = advance_turn(state)
    state = run_turn_start_hooks(state)
    state = maybe_start_turn_timer(state)
    {:reply, {state.turn_char_id, Map.get(state.combatants, state.turn_char_id)}, state}
  end

  def handle_call(:drain_pending_events, _from, state) do
    events = Map.get(state, :pending_events, [])
    {:reply, events, %{state | pending_events: []}}
  end

  def handle_call(:peek_pending_events, _from, state) do
    {:reply, Map.get(state, :pending_events, []), state}
  end

  def handle_call({:add_combatant, stats, team_id, is_ai}, _from, state) do
    combatant = %Combatant{
      char_id: stats.char_id,
      name: stats.name,
      team_id: team_id,
      is_ai: is_ai,
      level: stats.level,
      max_hp: stats.max_hp,
      current_hp: stats.current_hp,
      max_mp: stats.max_mp,
      current_mp: stats.current_mp,
      atk: stats.atk,
      def: stats.def,
      mo: stats.mo,
      md: stats.md,
      speed: stats.speed,
      luck: stats.luck,
      has_moved: true
    }

    # Place on grid
    combatant = place_new_combatant(state, combatant, team_id)

    state = put_in(state.combatants[combatant.char_id], combatant)
    teams = Map.update(state.teams, team_id, [combatant.char_id], &[combatant.char_id | &1])
    state = %{state | teams: teams}
    state = rebuild_turn_queue(state)

    state = add_log_entry(state, %{actor: "system", text: "#{stats.name} joins the battle!"})
    {:reply, :ok, state}
  end

  def handle_call({:switch_team, char_id, new_team_id}, _from, state) do
    case Map.get(state.combatants, char_id) do
      nil ->
        {:reply, {:error, :not_found}, state}

      combatant ->
        old_team_id = combatant.team_id

        if old_team_id == new_team_id do
          {:reply, {:error, :same_team}, state}
        else
          # Remove from old team
          old_members = Map.get(state.teams, old_team_id, []) |> List.delete(char_id)
          teams = if old_members == [],
            do: Map.delete(state.teams, old_team_id),
            else: Map.put(state.teams, old_team_id, old_members)

          # Add to new team
          teams = Map.update(teams, new_team_id, [char_id], &[char_id | &1])

          combatant = %{combatant | team_id: new_team_id}
          combatants = Map.put(state.combatants, char_id, combatant)

          state = %{state | teams: teams, combatants: combatants}
          state = add_log_entry(state, %{actor: "system", text: "⚔️→🤝 #{combatant.name} switches to #{new_team_id}!"})
          {:reply, :ok, state}
        end
    end
  end

  def handle_call({:update_combatant, char_id, update_fn}, _from, state) do
    case Map.get(state.combatants, char_id) do
      nil ->
        {:reply, {:error, :not_found}, state}

      combatant ->
        updated = update_fn.(combatant)
        state = put_in(state.combatants[char_id], updated)
        {:reply, {:ok, updated}, state}
    end
  end

  def handle_call({:init_settings, arena_row}, _from, state) do
    settings = Settings.load()
    settings = Settings.apply_arena_overrides(settings, arena_row)

    grid_w = settings[:grid_width] || 8
    grid_h = settings[:grid_height] || 5

    state = %{state | settings: settings, grid_w: grid_w, grid_h: grid_h}
    state = assign_grid_positions(state)
    state = maybe_start_turn_timer(state)

    {:reply, :ok, state}
  end

  def handle_call({:finish, winner}, _from, state) do
    state = cancel_turn_timer(state)
    state = %{state | status: :finished, winner: winner}
    Logger.info("Battle #{state.id} finished. Winner: #{inspect(winner)}")
    {:reply, :ok, state}
  end

  def handle_call({:replace_state, new_state}, _from, _state) do
    {:reply, :ok, new_state}
  end

  def handle_call({:get_enemy_team, char_id}, _from, state) do
    enemies = get_enemies(state, char_id)
    {:reply, enemies, state}
  end

  def handle_call({:get_ally_team, char_id}, _from, state) do
    allies = get_allies(state, char_id)
    {:reply, allies, state}
  end

  @impl true
  def handle_cast({:add_log, entry}, state) do
    state = add_log_entry(state, entry)
    {:noreply, state}
  end

  def handle_cast({:register_on_map, map_id, x, y}, state) do
    {:noreply, %{state | map_id: map_id, map_x: x, map_y: y}}
  end

  @impl true
  def handle_info(:turn_timeout, state) do
    Logger.info("Battle #{state.id}: Turn timeout for char #{state.turn_char_id}")
    state = advance_turn(state)
    state = maybe_start_turn_timer(state)
    {:noreply, state}
  end

  def handle_info({:respawn, char_id}, state) do
    {state, result} = Respawn.execute_respawn(state, char_id)
    state = merge_result_into_log(state, result)
    state = rebuild_turn_queue(state)
    {:noreply, state}
  end

  # ══════════════════════════════════════════════════════════════════
  # PRIVATE HELPERS
  # ══════════════════════════════════════════════════════════════════

  defp via(battle_id) do
    {:via, Registry, {TePhoenix.BattleRegistry, battle_id}}
  end

  # ── Team building ───────────────────────────────────────────────

  defp build_teams(state, teams) do
    # Detect legacy format (players/enemies) vs multi-team
    is_legacy = Map.has_key?(teams, :players) or Map.has_key?(teams, :enemies)

    if is_legacy do
      build_legacy_teams(state, teams)
    else
      build_multi_teams(state, teams)
    end
  end

  defp build_legacy_teams(state, teams) do
    {combatants, team_map} =
      Enum.reduce([:players, :enemies], {%{}, %{}}, fn team_key, {combs, tmap} ->
        default_ai = team_key == :enemies
        members = Map.get(teams, team_key, [])

        {new_combs, ids} =
          Enum.reduce(members, {combs, []}, fn stats, {c_acc, id_acc} ->
            # Respect is_ai from stats if explicitly set; otherwise default by team
            is_ai = Map.get(stats, :is_ai, default_ai)
            combatant = stats_to_combatant(stats, team_key, is_ai)
            {Map.put(c_acc, combatant.char_id, combatant), [combatant.char_id | id_acc]}
          end)

        {new_combs, Map.put(tmap, team_key, Enum.reverse(ids))}
      end)

    %{state | combatants: combatants, teams: team_map}
  end

  defp build_multi_teams(state, teams) do
    {combatants, team_map} =
      Enum.reduce(teams, {%{}, %{}}, fn {team_id, members}, {combs, tmap} ->
        {new_combs, ids} =
          Enum.reduce(members, {combs, []}, fn stats, {c_acc, id_acc} ->
            is_ai = Map.get(stats, :is_ai, false)
            combatant = stats_to_combatant(stats, team_id, is_ai)
            {Map.put(c_acc, combatant.char_id, combatant), [combatant.char_id | id_acc]}
          end)

        {new_combs, Map.put(tmap, team_id, Enum.reverse(ids))}
      end)

    %{state | combatants: combatants, teams: team_map}
  end

  defp stats_to_combatant(stats, team_id, is_ai) do
    %Combatant{
      char_id: stats.char_id,
      name: stats.name,
      team_id: team_id,
      is_ai: is_ai,
      level: Map.get(stats, :level, 1),
      max_hp: Map.get(stats, :max_hp, 100),
      current_hp: Map.get(stats, :current_hp, Map.get(stats, :max_hp, 100)),
      max_mp: Map.get(stats, :max_mp, 50),
      current_mp: Map.get(stats, :current_mp, Map.get(stats, :max_mp, 50)),
      atk: Map.get(stats, :atk, 10),
      def: Map.get(stats, :def, 5),
      mo: Map.get(stats, :mo, 5),
      md: Map.get(stats, :md, 5),
      speed: Map.get(stats, :speed, 10),
      luck: Map.get(stats, :luck, 5),
      weapon_type: Map.get(stats, :weapon_type),
      weapon_elements: Map.get(stats, :weapon_elements, []),
      armor_type: Map.get(stats, :armor_type),
      equipment: Map.get(stats, :equipment, %{}),
      morale: Map.get(stats, :morale, 100),
      bp: Map.get(stats, :bp, 0),
      passives: Map.get(stats, :passives, []),
      shield_points: Map.get(stats, :shield_points, 0),
      shield_max: Map.get(stats, :shield_max, 0),
      weaknesses: Map.get(stats, :weaknesses, [])
    }
  end

  # ── Turn queue ──────────────────────────────────────────────────

  defp rebuild_turn_queue(state) do
    # Effective speed: base * status speed_mult, floored at 1 so a
    # stack of slow effects can't freeze someone out of the queue.
    # Ties break by luck, then by char_id (deterministic so save/load
    # is stable and no two runs diverge on identical combatants).
    sorted =
      state.combatants
      |> Map.values()
      |> Enum.filter(&Combatant.alive?/1)
      |> Enum.sort_by(fn c ->
        mods = StatusEffects.compute_modifiers(c)
        eff_speed = max(1, trunc((c.speed || 1) * mods.speed_mult))
        {-eff_speed, -(c.luck || 0), c.char_id}
      end)
      |> Enum.map(& &1.char_id)

    %{state | turn_queue: sorted, turn_queue_idx: 0}
  end

  # ── Turn hooks (data-driven status ticks + trigger fires) ──────
  #
  # On turn end: tick every status on the outgoing combatant — DoT
  # damage, HoT heals, duration countdown, expiry. Then fire the
  # `turn_end` event so any rule listening (regen-on-low-hp, poison
  # worsen, etc.) can react.
  #
  # On turn start: fire `turn_start` for the incoming combatant — lets
  # rules apply buffs, check HP thresholds, queue events.

  defp run_turn_end_hooks(state) do
    with char_id when not is_nil(char_id) <- state.turn_char_id,
         %Combatant{} = c <- Map.get(state.combatants, char_id) do
      result = %{log: [], actions: []}

      # Clear stale combo bonus so it doesn't leak to the next turn.
      c = %{c | status_combo_bonus: 0}

      # Tick cooldowns — decrement by 1 (or more if hasted, fewer if
      # slowed). Global mult from settings stacks with status modifier.
      c = tick_cooldowns(c, state.settings)

      {c, result} = StatusEffects.tick(c, result)
      state = put_in(state.combatants[char_id], c)

      state = merge_result_into_log(state, result)
      ctx = %{victim: c, attacker: nil}
      {state, result} = Triggers.fire("turn_end", state, ctx, %{log: [], actions: []})
      state = merge_result_into_log(state, result)

      # Advance projectiles in flight
      {state, proj_result} = Projectiles.tick_projectiles(state)
      state = merge_result_into_log(state, proj_result)

      # Tick surface effects (damage, status, duration countdown)
      {state, surf_result} = Surfaces.tick(state)
      merge_result_into_log(state, surf_result)
    else
      _ -> state
    end
  end

  defp run_turn_start_hooks(state) do
    with char_id when not is_nil(char_id) <- state.turn_char_id,
         %Combatant{} = c <- Map.get(state.combatants, char_id) do
      # Reset reaction charges & AP for the new turn's actor
      c = Reactions.reset_charges(c)
      c = %{c | current_ap: c.max_ap || 6}
      state = put_in(state.combatants[char_id], c)

      ctx = %{victim: c, attacker: nil}
      {state, result} = Triggers.fire("turn_start", state, ctx, %{log: [], actions: []})
      merge_result_into_log(state, result)
    else
      _ -> state
    end
  end

  defp merge_result_into_log(state, %{log: []}), do: state
  defp merge_result_into_log(state, %{log: lines}) do
    entries = Enum.map(Enum.reverse(lines), fn text -> %{actor: "system", text: text} end)
    Enum.reduce(entries, state, &add_log_entry(&2, &1))
  end
  defp merge_result_into_log(state, _), do: state

  defp tick_cooldowns(%Combatant{} = c, settings) do
    if not (settings[:enable_cooldowns] || false) or c.cooldowns == %{} do
      c
    else
      mods = StatusEffects.compute_modifiers(c)
      rate = max(0.1, mods.cooldown_rate * (settings[:cooldown_global_mult] || 1.0))
      tick = max(1, trunc(rate))

      updated =
        c.cooldowns
        |> Enum.map(fn {k, v} -> {k, v - tick} end)
        |> Enum.reject(fn {_k, v} -> v <= 0 end)
        |> Map.new()

      %{c | cooldowns: updated}
    end
  end

  defp advance_turn(state) do
    case state.settings[:initiative_type] do
      "atb" -> advance_atb(state)
      "ctb" -> advance_ctb(state)
      _ -> advance_speed(state)
    end
  end

  defp advance_speed(state) do
    queue = state.turn_queue

    if queue == [] do
      %{state | status: :finished}
    else
    max_attempts = length(queue) * 2

    result =
      Enum.reduce_while(1..max(max_attempts, 1), state, fn i, acc ->
        idx = rem(acc.turn_queue_idx + i, length(queue))
        char_id = Enum.at(queue, idx)
        combatant = Map.get(acc.combatants, char_id)

        if combatant && Combatant.alive?(combatant) do
          new_state = %{acc |
            turn_queue_idx: idx,
            turn_char_id: char_id,
            turn_number: acc.turn_number + 1
          }
          # Reset movement for the new actor
          new_state = reset_move_for_turn(new_state, char_id)
          {:halt, new_state}
        else
          {:cont, acc}
        end
      end)

    # If nobody alive, battle is over
    if result.turn_char_id == state.turn_char_id and result.turn_number == state.turn_number do
      %{result | status: :finished}
    else
      result
    end
    end  # end of queue != [] guard
  end

  defp advance_atb(state) do
    # ATB: tick gauges until someone is ready
    # Reset previous actor's gauge
    state =
      if state.turn_char_id do
        update_combatant_in_state(state, state.turn_char_id, fn c -> %{c | atb_gauge: 0.0} end)
      else
        state
      end

    speed_factor = state.settings[:atb_speed_factor] || 5.0

    Enum.reduce_while(1..200, state, fn _tick, acc ->
      # Tick all living combatants' ATB gauges. Speed is clamped and
      # status speed_mult applied so slow effects slow the gauge.
      {new_combatants, ready} =
        Enum.reduce(acc.combatants, {acc.combatants, []}, fn {id, c}, {combs, ready_list} ->
          if Combatant.alive?(c) do
            mods = StatusEffects.compute_modifiers(c)
            eff_speed = max(1, (c.speed || 1) * mods.speed_mult)
            new_gauge = c.atb_gauge + eff_speed / (speed_factor * 100)
            updated = %{c | atb_gauge: min(1.0, new_gauge)}
            combs = Map.put(combs, id, updated)
            ready_list = if new_gauge >= 1.0, do: [id | ready_list], else: ready_list
            {combs, ready_list}
          else
            {combs, ready_list}
          end
        end)

      acc = %{acc | combatants: new_combatants}

      if ready != [] do
        char_id = hd(ready)
        acc = %{acc | turn_char_id: char_id, turn_number: acc.turn_number + 1}
        acc = reset_move_for_turn(acc, char_id)
        {:halt, acc}
      else
        {:cont, acc}
      end
    end)
  end

  defp advance_ctb(state) do
    # CTB: advance counters, first to reach threshold acts
    state =
      if state.turn_char_id do
        base_recovery = state.settings[:ctb_base_recovery] || 100
        update_combatant_in_state(state, state.turn_char_id, fn c ->
          %{c | ctb_counter: base_recovery}
        end)
      else
        state
      end

    speed_divisor = state.settings[:ctb_speed_divisor] || 10

    Enum.reduce_while(1..200, state, fn _tick, acc ->
      {new_combatants, next_id} =
        Enum.reduce(acc.combatants, {acc.combatants, nil}, fn {id, c}, {combs, best} ->
          if Combatant.alive?(c) do
            new_counter = max(0, c.ctb_counter - max(1, div(c.speed, speed_divisor)))
            updated = %{c | ctb_counter: new_counter}
            combs = Map.put(combs, id, updated)

            best =
              if new_counter <= 0 do
                case best do
                  nil -> id
                  _ -> if c.speed > Map.get(acc.combatants, best, %{speed: 0}).speed, do: id, else: best
                end
              else
                best
              end

            {combs, best}
          else
            {combs, best}
          end
        end)

      acc = %{acc | combatants: new_combatants}

      if next_id do
        acc = %{acc | turn_char_id: next_id, turn_number: acc.turn_number + 1}
        acc = reset_move_for_turn(acc, next_id)
        {:halt, acc}
      else
        {:cont, acc}
      end
    end)
  end

  defp reset_move_for_turn(state, char_id) do
    update_combatant_in_state(state, char_id, fn c -> %{c | has_moved: false} end)
  end

  # ── Grid positioning ────────────────────────────────────────────

  defp assign_grid_positions(state) do
    grid_w = state.grid_w
    grid_h = state.grid_h
    team_ids = Map.keys(state.teams)

    # Spawn positions for up to 4 teams: left, right, top, bottom
    spawns = [
      %{col: 1, row: div(grid_h, 2), spread: :v},
      %{col: grid_w - 2, row: div(grid_h, 2), spread: :v},
      %{col: div(grid_w, 2), row: 0, spread: :h},
      %{col: div(grid_w, 2), row: grid_h - 1, spread: :h}
    ]

    combatants =
      team_ids
      |> Enum.with_index()
      |> Enum.reduce(state.combatants, fn {team_id, team_idx}, combs ->
        spawn = Enum.at(spawns, rem(team_idx, length(spawns)))
        member_ids = Map.get(state.teams, team_id, [])

        member_ids
        |> Enum.with_index()
        |> Enum.reduce(combs, fn {char_id, i}, c_acc ->
          {gx, gy} =
            if spawn.spread == :v do
              row = spawn.row + if(rem(i, 2) == 0, do: div(i, 2), else: -div(i + 1, 2))
              {spawn.col, max(0, min(grid_h - 1, row))}
            else
              col = spawn.col + if(rem(i, 2) == 0, do: div(i, 2), else: -div(i + 1, 2))
              {max(0, min(grid_w - 1, col)), spawn.row}
            end

          Map.update!(c_acc, char_id, fn c -> %{c | grid_x: gx, grid_y: gy} end)
        end)
      end)

    %{state | combatants: combatants}
  end

  defp place_new_combatant(state, combatant, team_id) do
    spawns = [
      %{col: 1, row: 0},
      %{col: state.grid_w - 2, row: 0},
      %{col: div(state.grid_w, 2), row: 0},
      %{col: div(state.grid_w, 2), row: state.grid_h - 1}
    ]

    team_idx = Map.keys(state.teams) |> Enum.find_index(&(&1 == team_id)) || 0
    spawn = Enum.at(spawns, rem(team_idx, length(spawns)))

    # Find first unoccupied tile in spawn column
    occupied_positions =
      state.combatants
      |> Map.values()
      |> Enum.filter(&Combatant.alive?/1)
      |> MapSet.new(fn c -> {c.grid_x, c.grid_y} end)

    {gx, gy} =
      Enum.reduce_while(0..(state.grid_h - 1), {spawn.col, 0}, fn y, _acc ->
        if MapSet.member?(occupied_positions, {spawn.col, y}) do
          {:cont, {spawn.col, y}}
        else
          {:halt, {spawn.col, y}}
        end
      end)

    %{combatant | grid_x: gx, grid_y: gy}
  end

  # ── Team queries ────────────────────────────────────────────────

  defp get_enemies(state, char_id) do
    my_team = get_in(state.combatants, [char_id, Access.key(:team_id)])

    state.combatants
    |> Map.values()
    |> Enum.filter(fn c -> c.team_id != my_team and Combatant.alive?(c) end)
  end

  defp get_allies(state, char_id) do
    my_team = get_in(state.combatants, [char_id, Access.key(:team_id)])

    state.combatants
    |> Map.values()
    |> Enum.filter(fn c -> c.team_id == my_team and c.char_id != char_id and Combatant.alive?(c) end)
  end

  # ── Utility ─────────────────────────────────────────────────────

  defp update_combatant_in_state(state, char_id, update_fn) do
    case Map.get(state.combatants, char_id) do
      nil -> state
      combatant -> %{state | combatants: Map.put(state.combatants, char_id, update_fn.(combatant))}
    end
  end

  defp add_log_entry(state, entry) do
    log_entry = Map.merge(entry, %{turn: state.turn_number, time: System.system_time(:millisecond)})
    %{state | log: [log_entry | state.log]}
  end

  # ── Turn timer ──────────────────────────────────────────────────

  defp maybe_start_turn_timer(state) do
    cur = Map.get(state.combatants, state.turn_char_id)

    if state.settings[:enable_turn_timeout] and is_map(cur) and not Map.get(cur, :is_ai, false) do
      timeout_ms = (state.settings[:turn_timeout_seconds] || 120) * 1000
      ref = Process.send_after(self(), :turn_timeout, timeout_ms)
      %{state | turn_timer: ref}
    else
      state
    end
  end

  defp cancel_turn_timer(%{turn_timer: nil} = state), do: state
  defp cancel_turn_timer(%{turn_timer: ref} = state) do
    Process.cancel_timer(ref)
    %{state | turn_timer: nil}
  end

  # ══════════════════════════════════════════════════════════════════
  # STATIC HELPERS (usable without GenServer call)
  # ══════════════════════════════════════════════════════════════════

  @doc "Chebyshev distance (diagonal = 1, like a chess king)"
  def chebyshev(%{grid_x: x1, grid_y: y1}, %{grid_x: x2, grid_y: y2})
      when is_number(x1) and is_number(y1) and is_number(x2) and is_number(y2) do
    max(abs(x2 - x1), abs(y2 - y1))
  end
  def chebyshev(_, _), do: 1

  @doc "Check if two combatants are within range"
  def in_range?(a, b, range) do
    if is_nil(Map.get(a, :grid_x)) or is_nil(Map.get(a, :grid_y)) or
       is_nil(Map.get(b, :grid_x)) or is_nil(Map.get(b, :grid_y)) do
      true
    else
      chebyshev(a, b) <= range
    end
  end
end
