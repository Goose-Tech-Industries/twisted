defmodule TePhoenix.Battle.Damage do
  @moduledoc """
  The core damage calculation pipeline.
  Ported from te/battle/resolve-damage.js

  Pipeline order:
    Base formula → Randomize → RP/Flavor bonus → Taunt/Intimidate/Rally →
    Status combo → AI difficulty → Stealth bonus → Weather → Damage type →
    Armor reduction → Crit → Terrain/Flanking → Miss check → Called shot →
    Element system → Stance mods → Active defense → Action command →
    Floor/Cap → Cover → Barrier → Limb routing → Break/Stagger →
    Weapon triangle → Passives → Elemental reactions → Post-damage effects
  """

  alias TePhoenix.Battle.{Combatant, State, Formula, StatusEffects, Triggers, Systems, BossPhases, Respawn}

  @doc """
  Resolve damage from a command or direct damage effect.
  Returns {updated_state, action_result}.
  """
  def resolve(state, actor, target, effects, action_name, result, opts \\ %{}) do
    if target == nil do
      {state, %{result | log: ["No target selected!" | result.log]}}
    else
      do_resolve(state, actor, target, effects, action_name, result, opts)
    end
  end

  @doc """
  Resolve damage from a skill.
  """
  def resolve_skill(state, actor, target, skill, effects, result, opts) do
    if target == nil and Map.has_key?(effects, "damage") do
      {state, %{result | log: ["No target selected!" | result.log]}}
    else
      # Check MP cost
      mp_cost = Map.get(skill, :mp_cost, 0)

      case Combatant.spend_mp(actor, mp_cost) do
        {:ok, actor} ->
          state = %{state | combatants: Map.put(state.combatants, actor.char_id, actor)}

          if Map.has_key?(effects, "damage") do
            do_resolve(state, actor, target, effects, skill.name, result, opts)
          else
            # Non-damage skill (heal, buff, etc.)
            resolve_non_damage_skill(state, actor, target, skill, effects, result)
          end

        {:error, :insufficient_mp} ->
          {state, %{result | log: ["#{actor.name} doesn't have enough MP!" | result.log]}}
      end
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # MAIN DAMAGE PIPELINE
  # ══════════════════════════════════════════════════════════════════

  defp do_resolve(state, actor, target, effects, action_name, result, opts) do
    settings = state.settings
    dmg_def = effects["damage"]

    # ── Range check ───────────────────────────────────────────────
    range = Map.get(effects, "range", 1)

    if range != 99 and not State.in_range?(actor, target, range) do
      dist = State.chebyshev(actor, target)
      msg = "⚠️ #{target.name} is out of reach (dist #{dist}, need ≤#{range}). Move closer first."
      {state, %{result | log: [msg | result.log]}}
    else
      # ── Data-driven status modifiers (no hardcoded status names) ─
      attacker_mods = StatusEffects.compute_modifiers(actor)
      defender_mods = StatusEffects.compute_modifiers(target)

      # Apply stat multipliers to the formula vars before evaluating.
      # This lets atk_mult/def_mult/mo_mult/md_mult/speed_mult from ANY
      # status or combination flow into the base damage formula without
      # the formula needing to know they exist.
      vars =
        Combatant.formula_vars(actor, target)
        |> Map.update!("ATK", &(&1 * attacker_mods.atk_mult))
        |> Map.update!("DEF", &(&1 * defender_mods.def_mult))
        |> Map.update!("MO",  &(&1 * attacker_mods.mo_mult))
        |> Map.update!("MD",  &(&1 * defender_mods.md_mult))
        |> Map.update!("SPD", &(&1 * attacker_mods.speed_mult))

      formula = Map.get(dmg_def, "formula", "ATK*2-DEF")
      base_damage = Formula.evaluate(formula, vars) |> trunc()

      # ── Randomize ─────────────────────────────────────────────
      damage =
        case Map.get(dmg_def, "randomize") do
          nil -> base_damage
          rand_factor ->
            rand = 1 + (:rand.uniform() * 2 - 1) * rand_factor
            trunc(base_damage * rand)
        end

      # ── RP / Flavor text bonus ────────────────────────────────
      {damage, result} = apply_flavor_bonus(damage, actor, opts[:flavor_text], settings, result)

      # ── Taunt / Intimidate / Rally ────────────────────────────
      damage = apply_rp_modifiers(damage, actor)

      # ── Status combo bonus ────────────────────────────────────
      {damage, target, result} =
        if target.status_combo_bonus > 0 do
          bonus = target.status_combo_bonus
          d = trunc(damage * (1 + bonus))
          r = %{result | log: ["💥 Status combo amplifies damage! (+#{round(bonus * 100)}%)" | result.log]}
          t = %{target | status_combo_bonus: 0}
          {d, t, r}
        else
          {damage, target, result}
        end

      # ── AI difficulty modifier ────────────────────────────────
      damage =
        if actor.is_ai do
          mult = ai_difficulty_mult(settings)
          trunc(damage * mult)
        else
          damage
        end

      # ── Stealth bonus ─────────────────────────────────────────
      {damage, result} =
        if actor.stealth_active do
          bonus = settings[:stealth_surprise_bonus] || 0.50
          d = trunc(damage * (1 + bonus))
          r = %{result | log: ["🥷 Ambush! +#{round(bonus * 100)}% damage from stealth!" | result.log]}
          {d, r}
        else
          {damage, result}
        end

      # ── Damage type & armor ───────────────────────────────────
      dmg_type = Map.get(dmg_def, "type", "physical")
      is_true = dmg_type == "true"
      is_pct = dmg_type == "percent_hp"

      damage =
        if is_pct do
          trunc(target.max_hp * (abs(damage) / 100))
        else
          damage
        end

      damage =
        if not is_true and not is_pct and damage > 0 do
          armor = if dmg_type == "magic", do: target.md || 0, else: target.def || 0
          armor = max(0, armor)
          armor_reduction = 100 / (100 + armor)
          trunc(damage * armor_reduction)
        else
          damage
        end

      # ── Critical hit ──────────────────────────────────────────
      base_crit = settings[:base_crit_chance] || 5
      crit_chance = max(0, base_crit)

      {damage, crit} =
        if :rand.uniform(100) <= crit_chance do
          mult = settings[:crit_damage_multiplier] || 1.5
          {trunc(damage * mult), true}
        else
          {damage, false}
        end

      # ── Miss check (blind + wound accuracy) ──────────────────
      miss_chance = actor.miss_chance

      if miss_chance > 0 and :rand.uniform(100) <= miss_chance do
        result = %{result |
          log: ["#{actor.name}'s attack misses!" | result.log],
          actions: [%{type: :miss, target: target.name} | result.actions]
        }
        # Reset miss chance on actor
        actor = %{actor | miss_chance: 0}
        state = %{state | combatants: Map.put(state.combatants, actor.char_id, actor)}
        {state, result}
      else
        actor = %{actor | miss_chance: 0}

        # ── Called shot accuracy ────────────────────────────────
        target_limb = opts[:target_limb]
        effective_limb = apply_called_shot(target_limb, target, settings)

        # ── Element processing ──────────────────────────────────
        elements = build_elements(effects, actor)

        {damage, target, result, absorbed} =
          if elements != [] do
            resolve_elements(damage, elements, target, result)
          else
            {damage, target, result, false}
          end

        if absorbed do
          # Element absorption — target healed, skip normal damage
          state = %{state | combatants: Map.put(state.combatants, target.char_id, target)}
          {state, result}
        else
          # ── Stance modifiers ──────────────────────────────────
          damage =
            if actor.stance == "POWER", do: trunc(damage * 1.4), else: damage

          damage =
            if target.stance == "GUARD", do: trunc(damage * 0.5), else: damage

          # ── Active defense (dodge/block/counter) ──────────────
          # Dodge floor from statuses (e.g. haste) + ki-ranged bonus on
          # ranged/magic attacks. Both purely data-driven.
          ki_bonus = Systems.ki_ranged_dodge_bonus(effects, settings)
          extra_dodge_bonus = defender_mods.dodge_floor + ki_bonus
          dodge_ceiling = defender_mods.dodge_ceiling

          {damage, target, result, dodged} =
            if settings[:enable_active_defense] and Combatant.alive?(target) do
              resolve_active_defense(state, actor, target, damage, action_name, settings, result, extra_dodge_bonus, dodge_ceiling)
            else
              {damage, target, result, false}
            end

          if dodged do
            state = %{state |
              combatants: state.combatants
              |> Map.put(actor.char_id, actor)
              |> Map.put(target.char_id, target)
            }
            {state, result}
          else
            # ── Action command timing bonus ─────────────────────
            {damage, result} =
              if opts[:action_timing] && settings[:enable_action_commands] do
                apply_action_command(damage, opts[:action_timing], result)
              else
                {damage, result}
              end

            # ── Status damage mults (data-driven) ───────────────
            damage = trunc(damage * attacker_mods.damage_dealt_mult * defender_mods.damage_taken_mult)

            # ── Damage floor & cap ──────────────────────────────
            damage = max(1, damage)
            dmg_cap = settings[:damage_cap] || 0
            damage = if dmg_cap > 0, do: min(dmg_cap, damage), else: damage

            # ── Limb damage routing ─────────────────────────────
            {_damage_to_hp, target, limb_result, result} =
              if settings[:enable_limb_targeting] and effective_limb and target.limb_hp != %{} do
                resolve_limb_damage(target, damage, effective_limb, settings, crit, elements, result)
              else
                target = Combatant.apply_damage(target, damage)
                {damage, target, nil, result}
              end

            # ── Trigger: damage_taken (always) ──────────────────
            state_for_trig = %{state | combatants: Map.put(state.combatants, target.char_id, target)}
            damage_ctx = %{attacker: actor, victim: target, damage: damage, crit: crit, elements: elements, element: List.first(elements)}
            {state_for_trig, result} = Triggers.fire("damage_taken", state_for_trig, damage_ctx, result)
            target = Map.get(state_for_trig.combatants, target.char_id, target)

            # ── Trigger: limb_broken (data-driven consequences) ─
            {target, result} =
              if limb_result && limb_result.limb_disabled do
                state_for_trig2 = %{state | combatants: Map.put(state.combatants, target.char_id, target)}
                limb_ctx = %{attacker: actor, victim: target, limb: limb_result.limb_key, crit: crit, elements: elements}
                {state_after, result} = Triggers.fire("limb_broken", state_for_trig2, limb_ctx, result)
                {Map.get(state_after.combatants, target.char_id, target), result}
              else
                {target, result}
              end

            # ── Log the hit ─────────────────────────────────────
            log_text = Map.get(effects, "log", "{name} attacks!") |> String.replace("{name}", actor.name)

            {result, target} =
              if limb_result do
                format_limb_result(result, target, limb_result, crit, elements)
              else
                crit_prefix = if crit, do: "💥 CRITICAL! ", else: ""
                r = %{result |
                  log: ["#{crit_prefix}#{target.name} takes #{damage} damage!" | [log_text | result.log]],
                  actions: [%{type: :damage, target: target.name, amount: damage, crit: crit, elements: elements} | result.actions]
                }
                {r, target}
              end

            # ── Break shield (Octopath) ─────────────────────────
            {target, result} =
              if settings[:enable_break_shield] and elements != [] do
                check_break_shield(target, elements, result)
              else
                {target, result}
              end

            # ── Stagger (FF7R) ──────────────────────────────────
            {damage, target, result} =
              if settings[:enable_stagger_system] do
                apply_stagger(target, damage, settings, result)
              else
                {damage, target, result}
              end

            # ── Weapon triangle (Fire Emblem) ───────────────────
            # Triangle applies a ±15% bonus. Damage has already been
            # applied to target HP earlier in the pipeline, so we apply
            # the delta as an additional adjustment instead of double-
            # counting. Bug before this fix: the triangle result was
            # bound to `_damage` and silently discarded.
            {target, result} =
              if settings[:enable_weapon_triangle] and actor.weapon_type and target.weapon_type do
                {new_damage, result} = apply_weapon_triangle(actor.weapon_type, target.weapon_type, damage, result)
                delta = new_damage - damage

                target =
                  cond do
                    delta > 0 -> Combatant.apply_damage(target, delta)
                    delta < 0 -> Combatant.apply_healing(target, -delta)
                    true -> target
                  end

                {target, result}
              else
                {target, result}
              end

            # ── Death / knockout check ──────────────────────────
            {state, target, result} =
              if target.current_hp <= 0 or target.knocked_out do
                check_death_or_knockout(state, actor, target, result)
              else
                {state, target, result}
              end

            # ── One More (Persona) ──────────────────────────────
            # Weakness hit or crit = extra turn for attacker
            # (implemented as a flag on the result for the caller to handle)
            result =
              if settings[:enable_one_more] do
                was_weakness = elements != [] and Enum.any?(target.weaknesses, &(&1 in elements))

                if was_weakness or crit do
                  %{result | actions: [%{type: :one_more, actor: actor.name} | result.actions]}
                else
                  result
                end
              else
                result
              end

            # ── Reveal from stealth after attacking ─────────────
            actor = %{actor | stealth_active: false}

            # ── Save updated combatants ─────────────────────────
            state = %{state |
              combatants: state.combatants
              |> Map.put(actor.char_id, actor)
              |> Map.put(target.char_id, target)
            }

            # ── Boss phase transition check ──────────────────────
            target = Map.get(state.combatants, target.char_id, target)
            {state, target, result} = BossPhases.check_phase_transition(state, target, result)
            state = put_in(state.combatants[target.char_id], target)

            # ── Trigger: attack_landed (post-hit hooks) ─────────
            atk_ctx = %{attacker: actor, victim: target, damage: damage, crit: crit, elements: elements, element: List.first(elements)}
            {state, result} = Triggers.fire("attack_landed", state, atk_ctx, result)

            {state, result}
          end
        end
      end
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # SUB-PIPELINES
  # ══════════════════════════════════════════════════════════════════

  defp apply_flavor_bonus(damage, _actor, nil, _settings, result), do: {damage, result}
  defp apply_flavor_bonus(damage, _actor, "", _settings, result), do: {damage, result}

  defp apply_flavor_bonus(damage, _actor, flavor_text, settings, result) do
    if settings[:enable_flavor_text] do
      min_len = settings[:flavor_text_min_length] || 20
      base_bonus = settings[:flavor_text_base_bonus] || 0.05
      max_bonus = settings[:flavor_text_max_bonus] || 0.10

      bonus =
        if String.length(flavor_text) >= min_len do
          min(base_bonus, max_bonus)
        else
          0
        end

      if bonus > 0 do
        d = trunc(damage * (1 + bonus))
        r = %{result | log: ["💬 \"#{flavor_text}\"" | result.log]}
        {d, r}
      else
        {damage, result}
      end
    else
      {damage, result}
    end
  end

  defp apply_rp_modifiers(damage, actor) do
    damage =
      if actor.taunt_bonus do
        bonus = Map.get(actor.taunt_bonus, :damage_bonus, 0)
        if bonus > 0, do: trunc(damage * (1 + bonus)), else: damage
      else
        damage
      end

    damage =
      if actor.intimidated do
        reduction = Map.get(actor.intimidated, :atk_reduction, 0)
        if reduction > 0, do: trunc(damage * (1 - reduction)), else: damage
      else
        damage
      end

    damage =
      if actor.rallied do
        bonus = Map.get(actor.rallied, :atk_bonus, 0)
        if bonus > 0, do: trunc(damage * (1 + bonus)), else: damage
      else
        damage
      end

    damage
  end

  defp ai_difficulty_mult(settings) do
    mult =
      case settings[:ai_difficulty] do
        "easy" -> 0.75
        "hard" -> 1.25
        "nightmare" -> 1.50
        _ -> 1.0
      end

    # Clamp: DB-driven settings overrides could push this out of range
    max(0.1, min(3.0, mult))
  end

  # ── Active defense ──────────────────────────────────────────────

  defp resolve_active_defense(state, actor, target, damage, _action_name, settings, result, extra_dodge_bonus, dodge_ceiling) do
    # Human uses the preference set via battle_channel "set_defense".
    # AI auto-picks by tactics. If no preference, fall back to block so
    # the target still gets SOME defense instead of eating the full hit.
    defense_choice =
      cond do
        target.is_ai -> ai_pick_defense(target)
        target.default_defense in ["dodge", "block", "counter"] -> target.default_defense
        true -> "block"
      end

    case defense_choice do
      "dodge" ->
        resolve_dodge(state, actor, target, damage, settings, result, extra_dodge_bonus, dodge_ceiling)

      "block" ->
        resolve_block(state, actor, target, damage, settings, result)

      "counter" ->
        resolve_counter(state, actor, target, damage, settings, result)

      _ ->
        {damage, target, result, false}
    end
  end

  defp resolve_dodge(_state, actor, target, damage, settings, result, extra_dodge_bonus, dodge_ceiling) do
    base = settings[:dodge_base_chance] || 0.15
    speed_factor = settings[:dodge_speed_factor] || 0.35
    max_chance = min(settings[:dodge_max_chance] || 0.90, dodge_ceiling)

    speed_diff = max(0, target.speed - actor.speed)
    chance = min(max_chance, base + extra_dodge_bonus + speed_diff * speed_factor / 100)

    if :rand.uniform() < chance do
      # Full dodge — shift 1 tile away
      dx = sign(target.grid_x - actor.grid_x)
      dy = sign(target.grid_y - actor.grid_y)
      # Keep defaults if on same tile
      dx = if dx == 0, do: 1, else: dx

      target = %{target |
        grid_x: clamp(target.grid_x + dx, 0, 7),
        grid_y: clamp(target.grid_y + dy, 0, 4)
      }

      result = %{result |
        log: ["#{target.name} dodges the attack!" | result.log],
        actions: [%{type: :dodge, target: target.name, success: true} | result.actions]
      }
      {0, target, result, true}
    else
      {damage, target, result, false}
    end
  end

  defp resolve_block(_state, _actor, target, damage, settings, result) do
    die_sides = settings[:block_die_sides] || 6
    success_numbers = settings[:block_success_numbers] || [1, 2]

    roll = :rand.uniform(die_sides)

    if roll in success_numbers do
      reduction = settings[:block_one_arm_reduction] || 0.25
      blocked_damage = trunc(damage * (1 - reduction))

      result = %{result |
        log: ["🛡️ #{target.name} blocks! (-#{round(reduction * 100)}% damage)" | result.log],
        actions: [%{type: :block, target: target.name, reduction: reduction, success: true} | result.actions]
      }
      {blocked_damage, target, result, false}
    else
      {damage, target, result, false}
    end
  end

  defp resolve_counter(_state, actor, target, damage, settings, result) do
    base = settings[:counter_base_chance] || 0.25
    max_chance = settings[:counter_max_chance] || 0.90
    chance = min(max_chance, base)

    if :rand.uniform() < chance do
      # Counter: deal reduced damage back to attacker
      counter_dmg = trunc(target.atk * 0.5)
      result = %{result |
        log: ["⚡ #{target.name} counters for #{counter_dmg} damage!" | result.log],
        actions: [%{type: :counter, actor: target.name, target: actor.name, damage: counter_dmg} | result.actions]
      }
      # Still take full damage but counter back
      {damage, target, result, false}
    else
      {damage, target, result, false}
    end
  end

  defp ai_pick_defense(target) do
    # Tactic-driven defense pick. Weights per tactic are tuned so that
    # aggressive AI leans block/counter, defensive AI leans dodge,
    # support AI leans dodge/counter. Overridden by target.default_defense
    # if the user set a hard preference.
    cond do
      target.default_defense in ["dodge", "block", "counter"] ->
        target.default_defense

      true ->
        tactics = Map.get(target, :auto_tactics, "balanced") |> to_string() |> String.downcase()
        roll = :rand.uniform()

        case tactics do
          "aggressive" ->
            cond do
              roll < 0.10 -> "counter"
              roll < 0.40 -> "block"
              roll < 0.70 -> "dodge"
              true -> "block"
            end

          "defensive" ->
            cond do
              roll < 0.20 -> "counter"
              roll < 0.60 -> "dodge"
              true -> "block"
            end

          "support" ->
            cond do
              roll < 0.50 -> "dodge"
              roll < 0.60 -> "counter"
              true -> "block"
            end

          _ ->
            cond do
              roll < 0.15 -> "counter"
              roll < 0.48 -> "dodge"
              true -> "block"
            end
        end
    end
  end

  # ── Element system ──────────────────────────────────────────────

  defp build_elements(effects, actor) do
    weapon_elements =
      if Map.get(effects, "apply_weapon_elements") and actor.weapon_elements != [] do
        actor.weapon_elements
      else
        []
      end

    skill_elements = Map.get(effects, "elements", [])

    dipped =
      if actor.dipped_element and actor.dipped_turns > 0 do
        [actor.dipped_element]
      else
        []
      end

    (weapon_elements ++ skill_elements ++ dipped) |> Enum.uniq()
  end

  defp resolve_elements(damage, elements, target, result) do
    # Check target's weaknesses list
    {final_mult, elem_log, absorbed} =
      Enum.reduce(elements, {1.0, nil, false}, fn elem, {mult, log, abs} ->
        elem_lower = String.downcase(elem)

        if elem_lower in Enum.map(target.weaknesses, &String.downcase/1) do
          new_mult = max(mult, 1.5)
          {new_mult, "🔥 #{target.name} is weak to #{elem}! (+50%)", abs}
        else
          {mult, log, abs}
        end
      end)

    if absorbed do
      {0, target, result, true}
    else
      damage = if final_mult == 1.0, do: damage, else: trunc(damage * final_mult)

      result =
        if elem_log do
          %{result | log: [elem_log | result.log]}
        else
          result
        end

      {damage, target, result, false}
    end
  end

  # ── Called shot ─────────────────────────────────────────────────

  defp apply_called_shot(nil, _target, _settings), do: nil

  defp apply_called_shot(target_limb, _target, settings) do
    if settings[:enable_limb_targeting] and settings[:enable_called_shot_penalty] do
      # Check if the called shot misses and hits torso instead
      penalty =
        case target_limb do
          "head" -> settings[:called_shot_penalty_head] || 0.20
          limb when limb in ["left_arm", "right_arm"] -> settings[:called_shot_penalty_arms] || 0.10
          limb when limb in ["left_leg", "right_leg"] -> settings[:called_shot_penalty_legs] || 0.10
          _ -> 0
        end

      if penalty > 0 and :rand.uniform() < penalty do
        "torso"
      else
        target_limb
      end
    else
      target_limb
    end
  end

  # ── Limb damage ─────────────────────────────────────────────────

  defp resolve_limb_damage(target, damage, limb_key, settings, _crit, _elements, result) do
    bleed_through = settings[:limb_bleed_through_default] || 0.60

    limb_hp = Map.get(target.limb_hp, limb_key, 0)
    limb_damage = min(damage, limb_hp)
    main_damage = trunc(damage * bleed_through)

    # Apply limb damage
    new_limb_hp = max(0, limb_hp - limb_damage)
    target = %{target | limb_hp: Map.put(target.limb_hp, limb_key, new_limb_hp)}

    # Apply bleed-through to main HP
    target = Combatant.apply_damage(target, main_damage)

    limb_disabled = new_limb_hp <= 0 and limb_hp > 0

    # Head knockout check
    knocked_out =
      if limb_key == "head" and limb_disabled do
        true
      else
        false
      end

    target =
      if knocked_out do
        %{target | knocked_out: true, current_hp: 0}
      else
        target
      end

    limb_result = %{
      limb_key: limb_key,
      limb_label: humanize_limb(limb_key),
      limb_damage: limb_damage,
      main_damage: main_damage,
      limb_disabled: limb_disabled,
      knocked_out: knocked_out
    }

    {main_damage, target, limb_result, result}
  end

  defp format_limb_result(result, target, lr, crit, elements) do
    crit_prefix = if crit, do: "💥 CRITICAL! ", else: ""

    log = ["#{crit_prefix}#{target.name}'s #{lr.limb_label} takes #{lr.limb_damage} damage! (#{lr.main_damage} bleed-through)"]
    actions = [%{type: :damage, target: target.name, amount: lr.main_damage,
                 limb_damage: lr.limb_damage, limb: lr.limb_key, crit: crit, elements: elements}]

    {log, actions} =
      if lr.limb_disabled do
        {["💀 #{target.name}'s #{lr.limb_label} is disabled!" | log],
         [%{type: :limb_disabled, target: target.name, limb: lr.limb_key, label: lr.limb_label} | actions]}
      else
        {log, actions}
      end

    {log, actions} =
      if lr.knocked_out do
        {["💫 #{target.name} is knocked out from a devastating head blow!" | log], actions}
      else
        {log, actions}
      end

    result = %{result |
      log: Enum.reverse(log) ++ result.log,
      actions: actions ++ result.actions
    }

    {result, target}
  end

  # ── Break shield (Octopath) ────────────────────────────────────

  defp check_break_shield(target, elements, result) do
    if target.shield_points > 0 do
      hits = Enum.count(elements, fn e -> String.downcase(e) in Enum.map(target.weaknesses, &String.downcase/1) end)

      if hits > 0 do
        new_shield = max(0, target.shield_points - hits)
        target = %{target | shield_points: new_shield}

        if new_shield <= 0 do
          target = %{target | broken: true, break_turns_left: 1}
          result = %{result |
            log: ["💥 BREAK! #{target.name}'s shields are shattered!" | result.log],
            actions: [%{type: :break, target: target.name} | result.actions]
          }
          {target, result}
        else
          result = %{result |
            log: ["🛡️ #{target.name}'s shield cracks! (#{new_shield}/#{target.shield_max})" | result.log]
          }
          {target, result}
        end
      else
        {target, result}
      end
    else
      {target, result}
    end
  end

  # ── Stagger (FF7R) ─────────────────────────────────────────────

  defp apply_stagger(target, damage, settings, result) do
    if target.broken do
      # Already staggered — bonus damage
      bonus = settings[:break_damage_bonus] || 0.50
      d = trunc(damage * (1 + bonus))
      r = %{result | log: ["💥 Stagger bonus! +#{round(bonus * 100)}% damage!" | result.log]}
      {d, target, r}
    else
      increase = settings[:stagger_base_increase] || 5
      new_stagger = min(target.stagger_max, target.stagger + increase)
      target = %{target | stagger: new_stagger}

      if new_stagger >= target.stagger_max and target.stagger_max > 0 do
        target = %{target | broken: true, break_turns_left: 1, stagger: 0}
        result = %{result |
          log: ["⚡ #{target.name} is STAGGERED!" | result.log],
          actions: [%{type: :stagger, target: target.name} | result.actions]
        }
        {damage, target, result}
      else
        {damage, target, result}
      end
    end
  end

  # ── Weapon triangle ────────────────────────────────────────────

  defp apply_weapon_triangle(attacker_type, defender_type, damage, result) do
    # Classic Fire Emblem triangle: Sword > Axe > Lance > Sword
    advantage = %{
      "sword" => "axe",
      "axe" => "lance",
      "lance" => "sword"
    }

    a = String.downcase(to_string(attacker_type))
    d = String.downcase(to_string(defender_type))

    cond do
      Map.get(advantage, a) == d ->
        bonus = 0.15
        d_new = trunc(damage * (1 + bonus))
        r = %{result | log: ["⚔️ Weapon advantage! (+#{round(bonus * 100)}%)" | result.log]}
        {d_new, r}

      Map.get(advantage, d) == a ->
        penalty = -0.15
        d_new = trunc(damage * (1 + penalty))
        r = %{result | log: ["⚔️ Weapon disadvantage! (#{round(penalty * 100)}%)" | result.log]}
        {d_new, r}

      true ->
        {damage, result}
    end
  end

  # ── Death / knockout ────────────────────────────────────────────

  defp check_death_or_knockout(state, actor, target, result) do
    settings = state.settings

    is_ko =
      actor.non_lethal or
      target.knocked_out or
      (settings[:enable_nonlethal] and false)

    {target, result, event} =
      if is_ko and settings[:enable_nonlethal] do
        target = %{target | knocked_out: true, unconscious: true, current_hp: 0}
        result = %{result |
          log: ["#{target.name} is knocked unconscious!" | result.log],
          actions: [%{type: :knockout, target: target.name} | result.actions]
        }
        {target, result, "ko"}
      else
        result = %{result |
          log: ["☠️ #{target.name} has been slain!" | result.log],
          actions: [%{type: :death, target: target.name} | result.actions]
        }
        {target, result, "death"}
      end

    # Fire the trigger bus so data-driven rules can respond (interrogation
    # prompts, revenge buffs, loot drops on death, bounty flags, etc.).
    state = %{state | combatants: Map.put(state.combatants, target.char_id, target)}
    ctx = %{attacker: actor, victim: target, nonlethal: event == "ko"}
    {state, result} = Triggers.fire(event, state, ctx, result)
    target = Map.get(state.combatants, target.char_id, target)

    # Schedule respawn if the mode supports it
    {state, result} = Respawn.on_death(state, target, result)

    {state, target, result}
  end

  # ── Action command (Mario RPG timing) ──────────────────────────

  defp apply_action_command(damage, timing, result) do
    # Timing is 0.0-1.0, perfect is near 0.5
    diff = abs(timing - 0.5)

    cond do
      diff < 0.05 ->
        bonus = 0.25
        {trunc(damage * (1 + bonus)),
         %{result |
           log: ["⭐ PERFECT timing! +#{round(bonus * 100)}% damage!" | result.log],
           actions: [%{type: :action_command, rating: :perfect, bonus: bonus} | result.actions]
         }}

      diff < 0.15 ->
        bonus = 0.10
        {trunc(damage * (1 + bonus)),
         %{result |
           log: ["✨ Good timing! +#{round(bonus * 100)}% damage!" | result.log],
           actions: [%{type: :action_command, rating: :good, bonus: bonus} | result.actions]
         }}

      true ->
        {damage, result}
    end
  end

  # ── Non-damage skill resolution ─────────────────────────────────

  defp resolve_non_damage_skill(state, actor, target, skill, effects, result) do
    heal_target = target || actor

    cond do
      Map.has_key?(effects, "heal") ->
        heal = effects["heal"]
        healed = Combatant.apply_healing(heal_target, heal)
        state = %{state | combatants: Map.put(state.combatants, healed.char_id, healed)}

        result = %{result |
          log: ["#{actor.name} casts #{skill.name}! #{healed.name} recovers #{heal} HP!" | result.log],
          actions: [%{type: :heal, actor: actor.name, target: healed.name, amount: heal} | result.actions]
        }
        {state, result}

      Map.has_key?(effects, "revive") ->
        if heal_target.current_hp <= 0 do
          hp_pct = effects["revive"]
          restored = max(1, trunc(heal_target.max_hp * hp_pct))
          healed = %{heal_target | current_hp: restored, knocked_out: false, unconscious: false}
          state = %{state | combatants: Map.put(state.combatants, healed.char_id, healed)}

          result = %{result |
            log: ["#{actor.name} casts #{skill.name}! #{healed.name} is revived with #{restored} HP!" | result.log],
            actions: [%{type: :revive, actor: actor.name, target: healed.name, hp: restored} | result.actions]
          }
          {state, result}
        else
          {state, %{result | log: ["#{heal_target.name} is already alive!" | result.log]}}
        end

      true ->
        {state, %{result | log: ["#{actor.name} casts #{skill.name}!" | result.log]}}
    end
  end

  # ── Helpers ─────────────────────────────────────────────────────

  defp humanize_limb("head"), do: "Head"
  defp humanize_limb("torso"), do: "Torso"
  defp humanize_limb("left_arm"), do: "Left Arm"
  defp humanize_limb("right_arm"), do: "Right Arm"
  defp humanize_limb("left_leg"), do: "Left Leg"
  defp humanize_limb("right_leg"), do: "Right Leg"
  defp humanize_limb(other), do: String.capitalize(to_string(other))

  defp sign(0), do: 0
  defp sign(n) when n > 0, do: 1
  defp sign(n) when n < 0, do: -1

  defp clamp(val, min_val, max_val), do: max(min_val, min(max_val, val))
end
