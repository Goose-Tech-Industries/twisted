defmodule TePhoenix.Battle.Morale do
  @moduledoc """
  Enemy morale system — fear, flee AI, rout.
  Ported from te/battle/morale.js

  Morale (0-100) drops from ally deaths, crits, heavy damage, low HP.
  Rises from kills, heals, idle turns.
  Below flee threshold: AI attempts to flee.
  Leader flees: all allies rout.
  """

  alias TePhoenix.Battle.Combatant

  @doc "Initialize morale for all combatants in a battle"
  def init_morale(state) do
    settings = state.settings
    if not settings[:enable_morale], do: state

    starting = settings[:starting_morale] || 100
    max_morale = settings[:max_morale] || 100
    brave_bonus = settings[:personality_brave_bonus] || 20
    coward_penalty = settings[:personality_coward_penalty] || -20

    combatants =
      Enum.reduce(state.combatants, state.combatants, fn {id, c}, combs ->
        personality = Map.get(c, :personality, "") |> to_string() |> String.downcase()

        bonus = case personality do
          "brave" -> brave_bonus
          "coward" -> coward_penalty
          _ -> 0
        end

        morale = min(max_morale, starting + bonus)
        is_fanatic = personality == "fanatic"
        is_leader = Map.get(c, :is_boss, false)

        c = c
        |> Map.put(:morale, morale)
        |> Map.put(:morale_fanatic, is_fanatic)
        |> Map.put(:morale_is_leader, is_leader)

        Map.put(combs, id, c)
      end)

    %{state | combatants: combatants}
  end

  @doc "Adjust morale for a combatant (AI only, fanatics immune)"
  def adjust_morale(state, combatant_id, delta) do
    settings = state.settings
    if not settings[:enable_morale], do: state

    case Map.get(state.combatants, combatant_id) do
      nil -> state
      c ->
        if not c.is_ai or Map.get(c, :morale_fanatic, false) do
          state
        else
          max_m = settings[:max_morale] || 100
          new_morale = max(0, min(max_m, (c.morale || 100) + delta))
          c = %{c | morale: new_morale}
          %{state | combatants: Map.put(state.combatants, combatant_id, c)}
        end
    end
  end

  @doc "Handle morale changes when a combatant dies. Returns {state, flee_events}"
  def on_combatant_death(state, dead_id) do
    settings = state.settings
    if not settings[:enable_morale], do: {state, []}

    dead = Map.get(state.combatants, dead_id)
    if dead == nil, do: {state, []}

    dead_team = dead.team_id

    # Morale boost for enemies
    enemy_gain = settings[:enemy_kill_gain] || 10
    state =
      state.teams
      |> Enum.reject(fn {tid, _} -> tid == dead_team end)
      |> Enum.reduce(state, fn {_tid, members}, s ->
        Enum.reduce(members, s, fn id, s2 -> adjust_morale(s2, id, enemy_gain) end)
      end)

    # Morale loss for allies
    is_leader = Map.get(dead, :morale_is_leader, false)
    loss = if is_leader, do: settings[:leader_death_loss] || 30, else: settings[:ally_death_loss] || 20

    {state, flee_events} =
      (Map.get(state.teams, dead_team, []) -- [dead_id])
      |> Enum.reduce({state, []}, fn id, {s, events} ->
        s = adjust_morale(s, id, -loss)
        c = Map.get(s.combatants, id)

        if c && should_flee?(s, id) do
          reason = if is_leader, do: :leader_fell, else: :morale_broken
          {s, [%{type: :morale_flee, combatant_id: id, name: c.name, reason: reason} | events]}
        else
          {s, events}
        end
      end)

    {state, Enum.reverse(flee_events)}
  end

  @doc "Handle morale changes when a combatant takes damage"
  def on_damage_taken(state, target_id, damage, is_crit) do
    settings = state.settings
    if not settings[:enable_morale], do: state

    state = if is_crit do
      adjust_morale(state, target_id, -(settings[:critical_hit_loss] || 10))
    else
      state
    end

    target = Map.get(state.combatants, target_id)
    if target == nil, do: state

    dmg_pct = damage / max(1, target.max_hp)
    state = if dmg_pct >= (settings[:heavy_damage_pct] || 0.30) do
      adjust_morale(state, target_id, -(settings[:heavy_damage_loss] || 10))
    else
      state
    end

    # Low HP penalty (once per combatant)
    hp_pct = target.current_hp / max(1, target.max_hp)
    if hp_pct < (settings[:low_hp_threshold] || 0.25) and not Map.get(target, :low_hp_morale_applied, false) do
      target = Map.put(target, :low_hp_morale_applied, true)
      state = %{state | combatants: Map.put(state.combatants, target_id, target)}
      adjust_morale(state, target_id, -(settings[:low_hp_loss] || 15))
    else
      state
    end
  end

  @doc "Morale recovery when healed"
  def on_heal_received(state, target_id) do
    gain = state.settings[:heal_received_gain] || 5
    adjust_morale(state, target_id, gain)
  end

  @doc "Morale recovery on idle turn (no damage taken)"
  def on_idle_turn(state, combatant_id) do
    gain = state.settings[:idle_turn_gain] || 3
    adjust_morale(state, combatant_id, gain)
  end

  @doc "Check if a combatant should flee (morale below threshold)"
  def should_flee?(state, combatant_id) do
    settings = state.settings
    if not settings[:enable_morale], do: false

    case Map.get(state.combatants, combatant_id) do
      nil -> false
      c ->
        if not c.is_ai or Map.get(c, :morale_fanatic, false) do
          false
        else
          (c.morale || 100) <= (settings[:flee_threshold] || 20)
        end
    end
  end

  @doc "Rout: if a fleeing combatant is a leader, force all allies to flee"
  def check_rout(state, fleeing_id) do
    settings = state.settings
    if not settings[:enable_morale] or not (settings[:rout_on_leader_flee] != false), do: {state, []}

    fleeing = Map.get(state.combatants, fleeing_id)
    if fleeing == nil or not Map.get(fleeing, :morale_is_leader, false), do: {state, []}

    team = fleeing.team_id
    members = Map.get(state.teams, team, []) -- [fleeing_id]

    {state, routed} =
      Enum.reduce(members, {state, []}, fn id, {s, events} ->
        c = Map.get(s.combatants, id)
        if c && Combatant.alive?(c) and not Map.get(c, :morale_fanatic, false) do
          c = %{c | morale: 0}
          s = %{s | combatants: Map.put(s.combatants, id, c)}
          {s, [%{type: :rout, combatant_id: id, name: c.name} | events]}
        else
          {s, events}
        end
      end)

    {state, Enum.reverse(routed)}
  end

  @doc "Pursuit bonus damage against fleeing enemies"
  def pursuit_bonus(state, target_id) do
    if should_flee?(state, target_id) do
      state.settings[:pursuit_bonus_damage_pct] || 0.50
    else
      0
    end
  end
end
