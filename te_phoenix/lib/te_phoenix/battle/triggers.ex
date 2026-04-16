defmodule TePhoenix.Battle.Triggers do
  @moduledoc """
  Event bus for the data-driven battle rule system.

  Call `fire/4` at any hook point in the pipeline with a context map.
  The registry is queried (ETS, zero DB cost) for rules matching the
  event name. Each matching rule's `condition` is evaluated against the
  context; if it passes, the rule's `effect` is executed.

  Effects understood out of the box:

    * `%{"apply_status"  => "bleed_light",    "to" => "victim"}`
    * `%{"remove_status" => "freeze",         "to" => "victim"}`
    * `%{"damage_flat"   => 25,               "to" => "victim"}`
    * `%{"heal_pct_max"  => 0.15,             "to" => "attacker"}`
    * `%{"queue_event"   => "interrogation_prompt", "to" => "victim"}`
    * `%{"knockout"      => true,             "to" => "victim"}`
    * `%{"script_id"     => 42}` — runs a visual-script graph
    * Multiple effects can be bundled: the same map can include any
      subset of the keys above; they run in the order listed.

  Context map shape (convention):

      %{
        attacker: %Combatant{},  # optional
        victim:   %Combatant{},  # the one the event happened to
        limb:     "left_leg",    # optional — limb_broken / called shot
        element:  "fire",        # optional
        damage:   128,           # optional
        crit:     true,          # optional
        nonlethal: false
      }

  Returns an updated `{battle_state, result}` tuple so the caller can
  thread it through the pipeline.

  `battle_state` is the GenServer state from `TePhoenix.Battle.State`.
  We update `state.combatants` in place when effects mutate a combatant.
  """

  alias TePhoenix.Battle.{Combatant, StatusEffects, StatusRegistry}

  @doc """
  Fire a trigger event. Returns `{state, result}`.
  """
  def fire(event, state, ctx, result) when is_binary(event) do
    rules = StatusRegistry.rules_for(event)

    Enum.reduce(rules, {state, result}, fn rule, {st, r} ->
      if condition_match?(rule.condition, ctx, st) do
        run_effect(rule.effect, ctx, st, r)
      else
        {st, r}
      end
    end)
  end

  def fire(event, state, ctx, result) when is_atom(event),
    do: fire(Atom.to_string(event), state, ctx, result)

  # ── Condition matching ───────────────────────────────────────────

  defp condition_match?(nil, _ctx, _st), do: true
  defp condition_match?(cond, _ctx, _st) when cond == %{}, do: true

  defp condition_match?(cond, ctx, state) do
    Enum.all?(cond, fn {k, v} -> check(k, v, ctx, state) end)
  end

  defp check("limb", v, ctx, _), do: to_string(ctx[:limb]) == to_string(v)
  defp check("element", v, ctx, _) do
    elements = ctx[:elements] || (if ctx[:element], do: [ctx[:element]], else: [])
    Enum.any?(elements, &(to_string(&1) == to_string(v)))
  end
  defp check("crit", v, ctx, _), do: !!ctx[:crit] == !!v
  defp check("nonlethal", v, ctx, _), do: !!ctx[:nonlethal] == !!v

  defp check("has_status", status_key, ctx, state) do
    victim = resolve_actor("victim", ctx, state)
    victim && StatusEffects.has?(victim, to_string(status_key))
  end

  defp check("hp_below_pct", pct, ctx, state) do
    victim = resolve_actor("victim", ctx, state)
    victim && victim.max_hp > 0 && victim.current_hp / victim.max_hp < pct
  end

  defp check("hp_above_pct", pct, ctx, state) do
    victim = resolve_actor("victim", ctx, state)
    victim && victim.max_hp > 0 && victim.current_hp / victim.max_hp > pct
  end

  defp check("team", team, ctx, state) do
    victim = resolve_actor("victim", ctx, state)
    victim && to_string(victim.team_id) == to_string(team)
  end

  defp check(_key, _v, _ctx, _), do: true

  # ── Effect execution ─────────────────────────────────────────────

  defp run_effect(effect, ctx, state, result) do
    state_result = {state, result}

    state_result =
      case effect["apply_status"] do
        nil -> state_result
        key -> apply_status_effect(state_result, effect, ctx, key)
      end

    state_result =
      case effect["remove_status"] do
        nil -> state_result
        key -> remove_status_effect(state_result, effect, ctx, key)
      end

    state_result =
      case effect["damage_flat"] do
        nil -> state_result
        amt -> damage_flat_effect(state_result, effect, ctx, amt)
      end

    state_result =
      case effect["heal_pct_max"] do
        nil -> state_result
        pct -> heal_pct_effect(state_result, effect, ctx, pct)
      end

    state_result =
      if effect["knockout"] == true do
        knockout_effect(state_result, effect, ctx)
      else
        state_result
      end

    state_result =
      case effect["queue_event"] do
        nil -> state_result
        name -> queue_event_effect(state_result, effect, ctx, name)
      end

    state_result =
      if effect["increment_limit_gauge"] == true do
        increment_limit(state_result, effect, ctx)
      else
        state_result
      end

    state_result =
      case effect["script_id"] do
        sid when is_integer(sid) -> run_script_effect(state_result, ctx, sid)
        _ -> state_result
      end

    state_result
  end

  defp increment_limit({state, result}, effect, ctx) do
    target_name = effect["to"] || "victim"
    actor = resolve_actor(target_name, ctx, state)

    if actor do
      damage = ctx[:damage] || 0
      dmg_pts = Map.get(actor, :dmg_pts, 100.0)
      limit_pts = Map.get(actor, :limit_pts, 1.0)
      gain = if dmg_pts > 0, do: damage / dmg_pts * limit_pts, else: 0
      new_gauge = min(100.0, (Map.get(actor, :limit_gauge, 0.0) || 0) + gain)
      actor = Map.put(actor, :limit_gauge, new_gauge)
      state = put_in(state.combatants[actor.char_id], actor)

      if new_gauge >= 100.0 do
        result = %{result |
          log: ["💥 #{actor.name}'s limit break is ready!" | result.log],
          actions: [%{type: :limit_ready, char_id: actor.char_id} | result.actions]
        }
        {state, result}
      else
        {state, result}
      end
    else
      {state, result}
    end
  end

  # ── Individual effect implementations ────────────────────────────

  defp apply_status_effect({state, result}, effect, ctx, key) do
    target_name = effect["to"] || "victim"
    actor = resolve_actor(target_name, ctx, state)

    if actor do
      {actor, result} = StatusEffects.apply_status(actor, key, result, source_id: effect["source_id"])
      state = put_in(state.combatants[actor.char_id], actor)
      {state, result}
    else
      {state, result}
    end
  end

  defp remove_status_effect({state, result}, effect, ctx, key) do
    target_name = effect["to"] || "victim"
    actor = resolve_actor(target_name, ctx, state)

    if actor do
      actor = StatusEffects.remove(actor, key)
      result = %{result | log: ["✨ #{actor.name}'s #{key} is cleansed." | result.log]}
      state = put_in(state.combatants[actor.char_id], actor)
      {state, result}
    else
      {state, result}
    end
  end

  defp damage_flat_effect({state, result}, effect, ctx, amt) do
    target_name = effect["to"] || "victim"
    actor = resolve_actor(target_name, ctx, state)

    if actor do
      dmg = max(1, trunc(amt))
      actor = Combatant.apply_damage(actor, dmg)
      result = %{result |
        log: ["💢 #{actor.name} takes #{dmg} trigger damage." | result.log],
        actions: [%{type: :trigger_damage, target: actor.name, amount: dmg} | result.actions]
      }
      state = put_in(state.combatants[actor.char_id], actor)
      {state, result}
    else
      {state, result}
    end
  end

  defp heal_pct_effect({state, result}, effect, ctx, pct) do
    target_name = effect["to"] || "victim"
    actor = resolve_actor(target_name, ctx, state)

    if actor do
      heal = max(1, trunc(actor.max_hp * pct))
      actor = Combatant.apply_healing(actor, heal)
      result = %{result |
        log: ["💚 #{actor.name} recovers #{heal} HP." | result.log],
        actions: [%{type: :trigger_heal, target: actor.name, amount: heal} | result.actions]
      }
      state = put_in(state.combatants[actor.char_id], actor)
      {state, result}
    else
      {state, result}
    end
  end

  defp knockout_effect({state, result}, effect, ctx) do
    target_name = effect["to"] || "victim"
    actor = resolve_actor(target_name, ctx, state)

    if actor do
      actor = %{actor | knocked_out: true, unconscious: true, current_hp: 0}
      result = %{result |
        log: ["💫 #{actor.name} is knocked out!" | result.log],
        actions: [%{type: :knockout, target: actor.name} | result.actions]
      }
      state = put_in(state.combatants[actor.char_id], actor)
      {state, result}
    else
      {state, result}
    end
  end

  defp queue_event_effect({state, result}, effect, ctx, event_name) do
    target_name = effect["to"] || "victim"
    actor = resolve_actor(target_name, ctx, state)
    char_id = actor && actor.char_id

    queued = Map.get(state, :pending_events, [])
    entry = %{
      event: event_name,
      char_id: char_id,
      ctx: Map.take(ctx, [:limb, :element, :damage, :crit]),
      queued_at_turn: state.turn_number
    }

    state = Map.put(state, :pending_events, queued ++ [entry])

    result = %{result |
      log: ["📢 Event queued: #{event_name}" | result.log],
      actions: [%{type: :event_queued, event: event_name, target: actor && actor.name} | result.actions]
    }

    {state, result}
  end

  defp run_script_effect({state, result}, ctx, sid) do
    try do
      TePhoenix.Game.ScriptInterpreter.run_for_trigger(sid, state, ctx, result)
    rescue
      _ -> {state, result}
    catch
      _, _ -> {state, result}
    end
  end

  # ── Actor resolution ─────────────────────────────────────────────

  defp resolve_actor("self", ctx, _state), do: ctx[:victim] || ctx[:attacker]
  defp resolve_actor("victim", ctx, _state), do: ctx[:victim]
  defp resolve_actor("attacker", ctx, _state), do: ctx[:attacker]
  defp resolve_actor("target", ctx, _state), do: ctx[:victim] || ctx[:target]
  defp resolve_actor(name, ctx, _state), do: ctx[String.to_atom(name)] || ctx[name]
end
