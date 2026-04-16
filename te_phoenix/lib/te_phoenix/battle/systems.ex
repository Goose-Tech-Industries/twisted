defmodule TePhoenix.Battle.Systems do
  @moduledoc """
  Battle subsystems: Active Defense, Ki Channeling, Bleed, Break/Shield,
  Stagger, One More, Turn Delay, Party Swap, Weapon Triangle,
  Advantage/Disadvantage, Passive Abilities, Rolling HP, Combo Input,
  Action Commands, Alignment.
  Ported from te/battle/systems.js
  """

  alias TePhoenix.Battle.{Combatant, Formula, StatusEffects}

  # NOTE: Active Defense (dodge/block/counter) lives in
  # TePhoenix.Battle.Damage. A duplicate implementation used to live
  # here and was silently orphaned — it has been removed to prevent
  # drift. Diminishing-returns tracking lives in damage.ex as well.

  # ══════════════════════════════════════════════════════════════════
  # KI CHANNELING
  # ══════════════════════════════════════════════════════════════════

  @doc "Activate ki channeling: restore HP to max for N turns, then crash"
  def resolve_ki_channel(state, actor, result) do
    settings = state.settings

    cond do
      not settings[:enable_ki_channeling] ->
        {state, %{result | log: ["Ki channeling is not available." | result.log]}}

      actor.ki_uses_this_battle >= (settings[:ki_channel_uses_per_battle] || 1) ->
        {state, %{result | log: ["#{actor.name} has already channeled their ki this battle!" | result.log]}}

      actor.ki_active ->
        {state, %{result | log: ["#{actor.name} is already channeling!" | result.log]}}

      true ->
        duration = settings[:ki_channel_duration] || 5
        saved_hp = actor.current_hp

        actor = %{actor |
          ki_active: true,
          ki_turns_left: duration,
          ki_uses_this_battle: actor.ki_uses_this_battle + 1,
          current_hp: actor.max_hp  # Restore to full
        }

        state = %{state | combatants: Map.put(state.combatants, actor.char_id, actor)}

        result = %{result |
          log: ["🔥 #{actor.name} CHANNELS THEIR KI! Full power for #{duration} turns!" | result.log],
          actions: [%{type: :ki_channel, actor: actor.name, duration: duration, saved_hp: saved_hp, restored_hp: actor.max_hp} | result.actions]
        }
        {state, result}
    end
  end

  @doc "Tick ki channel at turn end — decrement, crash when expired"
  def tick_ki_channel(combatant, tick_result) do
    if not combatant.ki_active do
      {combatant, tick_result}
    else
      turns_left = combatant.ki_turns_left - 1

      if turns_left <= 0 do
        # CRASH — drop to saved_hp * crash_pct
        crash_pct = 0.50  # from settings ideally
        crash_hp = max(1, trunc(combatant.current_hp * crash_pct))
        combatant = %{combatant | ki_active: false, ki_turns_left: 0, current_hp: min(combatant.current_hp, crash_hp)}

        tick_result = %{tick_result |
          log: ["💥 #{combatant.name}'s ki channeling ends! Power crashes to #{crash_hp} HP!" | tick_result.log],
          actions: [%{type: :ki_channel_crash, target: combatant.name, crash_hp: crash_hp} | tick_result.actions]
        }
        {combatant, tick_result}
      else
        combatant = %{combatant | ki_turns_left: turns_left}
        tick_result = %{tick_result |
          log: ["🔥 #{combatant.name}'s ki burns bright! (#{turns_left} turns left)" | tick_result.log]
        }
        {combatant, tick_result}
      end
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # BLEED TIERS
  # ══════════════════════════════════════════════════════════════════

  @doc """
  Apply a bleed tier to a combatant.

  Thin adapter around the data-driven StatusEffects engine. The tier
  name maps to a status key "bleed_<tier>" which must exist in the
  `game_battle_statuses` registry (seeded by StatusDefaults).

  The legacy `bleed_tiers` and `settings` parameters are ignored —
  tier data now lives in the DB and is editable from AdminSauce.
  Kept in the signature so existing call sites don't break.
  """
  def apply_bleed(combatant, tier_name, _bleed_tiers, _settings, result) do
    StatusEffects.apply_status(combatant, "bleed_#{tier_name}", result)
  end

  @doc """
  Tick bleeds at end of turn.

  Delegates to `StatusEffects.tick/2` which processes ALL statuses —
  DoTs, HoTs, control effects, durations — not just bleed. Kept as a
  named function so existing callers (if any) continue to work, but
  new code should call `StatusEffects.tick/2` directly.
  """
  def tick_bleeds(combatant, tick_result), do: StatusEffects.tick(combatant, tick_result)

  # ══════════════════════════════════════════════════════════════════
  # BREAK / SHIELD (Octopath Traveler)
  # ══════════════════════════════════════════════════════════════════

  @doc "Check if elements hit weakness, reduce shield, trigger break"
  def check_break_shield(target, elements, settings, result) do
    if not settings[:enable_break_shield] or target.shield_points <= 0 or target.broken do
      {target, result}
    else
      weaknesses = Enum.map(target.weaknesses, &String.downcase/1)
      hits = Enum.count(elements, fn e -> String.downcase(to_string(e)) in weaknesses end)

      if hits > 0 do
        new_shield = max(0, target.shield_points - hits)
        target = %{target | shield_points: new_shield}

        if new_shield <= 0 do
          stun_turns = settings[:break_stun_turns] || 1
          target = %{target | broken: true, break_turns_left: stun_turns}
          result = %{result |
            log: ["💥 BREAK! #{target.name}'s defenses shatter!" | result.log],
            actions: [%{type: :break, target: target.name} | result.actions]
          }
          {target, result}
        else
          result = %{result |
            log: ["🛡️ Shield crack! #{new_shield} shields remaining." | result.log],
            actions: [%{type: :shield_hit, target: target.name, remaining: new_shield} | result.actions]
          }
          {target, result}
        end
      else
        {target, result}
      end
    end
  end

  @doc "Tick break recovery"
  def tick_break_state(combatant) do
    if not combatant.broken do
      combatant
    else
      turns = combatant.break_turns_left - 1
      if turns <= 0 do
        %{combatant | broken: false, shield_points: combatant.shield_max}
      else
        %{combatant | break_turns_left: turns}
      end
    end
  end

  @doc "Break damage bonus multiplier"
  def break_damage_bonus(target, settings) do
    if target.broken, do: 1.0 + (settings[:break_damage_bonus] || 0.50), else: 1.0
  end

  # ══════════════════════════════════════════════════════════════════
  # STAGGER (FF7 Remake)
  # ══════════════════════════════════════════════════════════════════

  @doc "Apply stagger pressure from damage. Returns {mult, target, result}"
  def apply_stagger_pressure(target, damage, settings, result) do
    if not settings[:enable_stagger_system] or target.stagger_max <= 0 do
      {1.0, target, result}
    else
      if target.broken do
        # During stagger: bonus damage
        bonus = settings[:break_damage_bonus] || 0.50
        mult = 1.0 + bonus
        result = %{result |
          log: ["💫 STAGGERED! Damage x#{Float.round(mult, 1)}!" | result.log],
          actions: [%{type: :stagger_hit, target: target.name, mult: mult} | result.actions]
        }
        {mult, target, result}
      else
        increase = (settings[:stagger_base_increase] || 5) + div(damage, 10)
        new_stagger = min(target.stagger_max, target.stagger + increase)
        target = %{target | stagger: new_stagger}

        if new_stagger >= target.stagger_max do
          target = %{target | broken: true, break_turns_left: 3, stagger: 0}
          result = %{result |
            log: ["💥 #{target.name} is STAGGERED!" | result.log],
            actions: [%{type: :stagger, target: target.name} | result.actions]
          }
          {1.0, target, result}
        else
          {1.0, target, result}
        end
      end
    end
  end

  @doc "Tick stagger decay"
  def tick_stagger(combatant, settings) do
    cond do
      combatant.broken ->
        turns = combatant.break_turns_left - 1
        if turns <= 0, do: %{combatant | broken: false, stagger: 0}, else: %{combatant | break_turns_left: turns}
      combatant.stagger > 0 ->
        decay = settings[:stagger_decay_per_turn] || 10
        %{combatant | stagger: max(0, combatant.stagger - decay)}
      true ->
        combatant
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # ONE MORE (Persona) + TURN DELAY (Grandia)
  # ══════════════════════════════════════════════════════════════════

  @doc "Check for One More: weakness hit or crit = extra turn"
  def check_one_more(settings, actor, _target, was_weakness, was_crit, result) do
    if not settings[:enable_one_more] do
      {false, result}
    else
      if was_weakness or was_crit do
        result = %{result |
          log: ["🎯 ONE MORE! #{actor.name} gets an extra action!" | result.log],
          actions: [%{type: :one_more, actor: actor.name} | result.actions]
        }
        {true, result}
      else
        {false, result}
      end
    end
  end

  @doc "Delay a target's turn in the queue"
  def apply_turn_delay(turn_queue, target, delay_amount, result) do
    if delay_amount <= 0 do
      {turn_queue, result}
    else
      idx = Enum.find_index(turn_queue, &(&1 == target.char_id))
      if idx do
        queue = List.delete_at(turn_queue, idx)
        new_idx = min(length(queue), idx + delay_amount)
        queue = List.insert_at(queue, new_idx, target.char_id)

        result = %{result |
          log: ["⏳ #{target.name}'s turn is delayed!" | result.log],
          actions: [%{type: :turn_delay, target: target.name, delay: delay_amount} | result.actions]
        }

        # Cancel charge
        result =
          if target.charging do
            %{result |
              log: ["❌ #{target.name}'s charge is cancelled!" | result.log],
              actions: [%{type: :charge_cancel, target: target.name} | result.actions]
            }
          else
            result
          end

        {queue, result}
      else
        {turn_queue, result}
      end
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # ADVANTAGE / DISADVANTAGE (D&D)
  # ══════════════════════════════════════════════════════════════════

  @doc "Roll with advantage (best of 2) or disadvantage (worst of 2)"
  def roll_with_advantage(base_chance, has_advantage, has_disadvantage) do
    cond do
      has_advantage and not has_disadvantage ->
        max(:rand.uniform(), :rand.uniform()) < base_chance
      has_disadvantage and not has_advantage ->
        min(:rand.uniform(), :rand.uniform()) < base_chance
      true ->
        :rand.uniform() < base_chance
    end
  end

  @doc "Check if combatant has advantage from status effects"
  def has_advantage?(combatant) do
    Enum.any?(combatant.statuses, fn s ->
      effects = s[:effects] || %{}
      Map.get(effects, "advantage", false)
    end)
  end

  @doc "Check if combatant has disadvantage from status effects"
  def has_disadvantage?(combatant) do
    Enum.any?(combatant.statuses, fn s ->
      effects = s[:effects] || %{}
      Map.get(effects, "disadvantage", false)
    end)
  end

  # ══════════════════════════════════════════════════════════════════
  # COMBO INPUT (Legend of Legaia)
  # ══════════════════════════════════════════════════════════════════

  @input_icons %{"H" => "⬆️", "L" => "⬇️", "R" => "➡️", "U" => "⬆️"}

  @doc "Resolve a combo input sequence (Legaia-style directional combos)"
  def resolve_combo_input(state, actor, target, input_sequence, result) do
    settings = state.settings
    if not settings[:enable_combo_input] do
      {state, %{result | log: ["Combo input is not enabled." | result.log]}}
    else
      inputs = if is_list(input_sequence), do: input_sequence,
               else: String.split(to_string(input_sequence), ",") |> Enum.map(&String.trim/1)

      if inputs == [] do
        {state, %{result | log: ["#{actor.name} hesitates..." | result.log]}}
      else
        ap_cost = length(inputs)
        current_ap = Map.get(actor, :current_ap, 6)

        if ap_cost > current_ap do
          {state, %{result | log: ["Not enough AP! Need #{ap_cost}, have #{current_ap}." | result.log]}}
        else
          actor = Map.put(actor, :current_ap, current_ap - ap_cost)

          # Display input sequence
          display = Enum.map(inputs, fn i -> Map.get(@input_icons, i, i) end) |> Enum.join(" ")
          result = %{result |
            log: ["🎮 #{actor.name}: #{display}" | result.log],
            actions: [%{type: :combo_input, actor: actor.name, inputs: inputs, display: display} | result.actions]
          }

          # Check if matches a known Art
          combo_arts = Map.get(actor, :combo_arts, [])
          input_str = Enum.join(inputs, ",")
          matched_art = Enum.find(combo_arts, fn a -> a.sequence_str == input_str end)

          {state, actor, target, result} =
            if matched_art do
              resolve_combo_art(state, actor, target, matched_art, result)
            else
              resolve_individual_hits(state, actor, target, inputs, settings, result)
            end

          state = %{state | combatants: state.combatants |> Map.put(actor.char_id, actor) |> Map.put(target.char_id, target)}

          # Death check
          {target, result} =
            if target.current_hp <= 0 do
              {%{target | current_hp: 0}, %{result | log: ["☠️ #{target.name} has been slain!" | result.log],
                actions: [%{type: :death, target: target.name} | result.actions]}}
            else
              {target, result}
            end

          state = %{state | combatants: Map.put(state.combatants, target.char_id, target)}
          {state, result}
        end
      end
    end
  end

  defp resolve_combo_art(state, actor, target, art, result) do
    text = (art[:battle_text] || "{name} uses {skill}!")
           |> String.replace("{name}", actor.name)
           |> String.replace("{skill}", art.name)

    result = %{result |
      log: [text | ["⚡ ART DISCOVERED: #{art.name}!" | result.log]],
      actions: [%{type: :combo_art, name: art.name, actor: actor.name} | result.actions]
    }

    vars = Combatant.formula_vars(actor, target)
    damage = max(1, trunc(Formula.evaluate(art[:damage_formula] || "ATK*3", vars)))
    target = Combatant.apply_damage(target, damage)

    result = %{result |
      log: ["#{target.name} takes #{damage} damage!" | result.log],
      actions: [%{type: :combo_art_damage, target: target.name, amount: damage, art: art.name} | result.actions]
    }

    {state, actor, target, result}
  end

  defp resolve_individual_hits(state, actor, target, inputs, settings, result) do
    hit_dmg_mult = settings[:combo_individual_hit_damage] || 0.5

    {target, result, _total} =
      Enum.reduce_while(inputs, {target, result, 0}, fn input, {t, r, total} ->
        dmg = max(1, trunc(actor.atk * hit_dmg_mult))
        t = Combatant.apply_damage(t, dmg)
        total = total + dmg

        dir_name = case input do
          "H" -> "High"; "L" -> "Low"; "R" -> "Right"; "U" -> "Up"; other -> other
        end

        r = %{r | log: ["  #{dir_name} strike: #{dmg} damage!" | r.log]}

        if t.current_hp <= 0, do: {:halt, {t, r, total}}, else: {:cont, {t, r, total}}
      end)

    {state, actor, target, result}
  end

  # ══════════════════════════════════════════════════════════════════
  # ROLLING HP (Earthbound odometer)
  # ══════════════════════════════════════════════════════════════════

  @doc "Queue rolling damage — server applies immediately, client animates"
  def queue_rolling_damage(combatant, damage, settings) do
    if not settings[:enable_rolling_hp] do
      Combatant.apply_damage(combatant, damage)
    else
      rolling = Map.get(combatant, :rolling_damage, 0) + damage
      combatant = Combatant.apply_damage(combatant, damage)
      Map.put(combatant, :rolling_damage, rolling)
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # KI / RANGED DODGE BONUS
  # ══════════════════════════════════════════════════════════════════

  @doc "Ki/ranged/magic attacks give defender a base dodge bonus (Mado rule)"
  def ki_ranged_dodge_bonus(effects, settings) do
    if not settings[:enable_diminishing_returns], do: 0,
    else: (
      is_ranged = Map.get(effects, "range", 0) > 1 and Map.get(effects, "range") != 99
      is_magic = get_in(effects, ["damage", "type"]) == "magic"
      if is_ranged or is_magic, do: settings[:ki_ranged_dodge_bonus] || 0.15, else: 0
    )
  end
end
