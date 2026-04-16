defmodule TePhoenix.Battle.Narrative do
  @moduledoc """
  Narrative systems: Signature Techniques, RP Commands (Taunt/Intimidate/Rally),
  Flavor Text evaluation, Combo Procs, Battle Narration.
  Ported from te/battle/narrative.js
  """

  alias TePhoenix.Battle.Combatant

  # ══════════════════════════════════════════════════════════════════
  # RP COMMANDS (Taunt, Intimidate, Rally)
  # ══════════════════════════════════════════════════════════════════

  @doc "Resolve an RP command (Taunt, Intimidate, Rally)"
  def resolve_rp_command(state, actor, target, rp_type, effects, result, flavor_text \\ nil) do
    settings = state.settings

    if not settings[:enable_rp_commands] do
      {state, %{result | log: ["RP commands are not enabled." | result.log]}}
    else
      # RP flavor text bonus
      rp_bonus = if flavor_text && settings[:enable_rp_descriptions] do
        evaluate_flavor_bonus(flavor_text, settings)
      else
        0
      end

      result = if flavor_text && String.trim(to_string(flavor_text)) != "" do
        %{result | log: ["💬 \"#{String.trim(to_string(flavor_text))}\"" | result.log]}
      else
        result
      end

      case rp_type do
        "taunt" -> resolve_taunt(state, actor, target, effects, rp_bonus, result)
        "intimidate" -> resolve_intimidate(state, actor, target, effects, rp_bonus, result)
        "rally" -> resolve_rally(state, actor, target, effects, rp_bonus, result)
        _ -> {state, %{result | log: ["Unknown RP command: #{rp_type}" | result.log]}}
      end
    end
  end

  defp resolve_taunt(state, actor, target, effects, rp_bonus, result) do
    dmg_bonus = (parse_float(effects["self_damage_bonus"]) || 0.10) + rp_bonus
    duration = effects["bonus_duration"] || 1

    actor = %{actor | taunt_bonus: %{damage_bonus: dmg_bonus, turns_left: duration}}

    # Force AI to target the taunter
    target =
      if target do
        Map.put(target, :taunted, %{by: actor.char_id, turns_left: effects["aggro_duration"] || 1})
      else
        target
      end

    message = "😤 #{actor.name} taunts #{if target, do: target.name, else: "the enemy"}!"

    result = %{result |
      log: ["Next attack: +#{round(dmg_bonus * 100)}% damage!" | [message | result.log]],
      actions: [%{type: :taunt, actor: actor.name, target: target && target.name, dmg_bonus: dmg_bonus} | result.actions]
    }

    combatants = Map.put(state.combatants, actor.char_id, actor)
    combatants = if target, do: Map.put(combatants, target.char_id, target), else: combatants
    {%{state | combatants: combatants}, result}
  end

  defp resolve_intimidate(state, actor, target, effects, rp_bonus, result) do
    base_chance = (parse_float(effects["base_chance"]) || 0.50) + rp_bonus
    atk_reduction = parse_float(effects["atk_reduction"]) || 0.15
    acc_reduction = parse_float(effects["accuracy_reduction"]) || 0.10
    duration = effects["duration"] || 2

    # Level-based check
    level_ratio = (actor.level || 1) / max(1, (target && target.level) || 1)
    chance = min(0.90, base_chance * min(2, level_ratio))

    if :rand.uniform() < chance do
      target =
        if target do
          %{target | intimidated: %{atk_reduction: atk_reduction, acc_reduction: acc_reduction, turns_left: duration}}
        else
          target
        end

      target_name = if target, do: target.name, else: "the enemy"
      result = %{result |
        log: ["#{target_name} is shaken! (-#{round(atk_reduction * 100)}% ATK, -#{round(acc_reduction * 100)}% accuracy for #{duration} turns)"
              | ["👁️ #{actor.name} intimidates #{target_name}!" | result.log]],
        actions: [%{type: :intimidate, success: true, actor: actor.name, target: target_name} | result.actions]
      }

      combatants = if target, do: Map.put(state.combatants, target.char_id, target), else: state.combatants
      {%{state | combatants: combatants}, result}
    else
      result = %{result |
        log: ["#{actor.name} tries to intimidate but #{if target, do: target.name, else: "the enemy"} stands firm!" | result.log],
        actions: [%{type: :intimidate, success: false, actor: actor.name} | result.actions]
      }
      {state, result}
    end
  end

  defp resolve_rally(state, actor, _target, effects, rp_bonus, result) do
    atk_bonus = (parse_float(effects["atk_bonus"]) || 0.10) + rp_bonus
    spd_bonus = parse_float(effects["speed_bonus"]) || 0.10
    duration = effects["duration"] || 2

    # Rally affects all living allies + self
    my_team = actor.team_id
    allies = state.combatants
    |> Map.values()
    |> Enum.filter(fn c -> c.team_id == my_team and c.char_id != actor.char_id and Combatant.alive?(c) end)

    rally_data = %{atk_bonus: atk_bonus, speed_bonus: spd_bonus, turns_left: duration}

    combatants =
      Enum.reduce(allies, state.combatants, fn ally, combs ->
        Map.put(combs, ally.char_id, %{ally | rallied: rally_data})
      end)

    actor = %{actor | rallied: rally_data}
    combatants = Map.put(combatants, actor.char_id, actor)

    ally_count = length(allies) + 1
    result = %{result |
      log: ["All allies: +#{round(atk_bonus * 100)}% ATK, +#{round(spd_bonus * 100)}% Speed for #{duration} turns!"
            | ["📣 #{actor.name} rallies the party!" | result.log]],
      actions: [%{type: :rally, actor: actor.name, atk_bonus: atk_bonus, spd_bonus: spd_bonus, allies: ally_count} | result.actions]
    }

    {%{state | combatants: combatants}, result}
  end

  @doc "Tick RP effects at turn end (decrement durations)"
  def tick_rp_effects(combatant) do
    combatant
    |> tick_timed_field(:taunt_bonus)
    |> tick_timed_field(:intimidated)
    |> tick_timed_field(:rallied)
    |> tick_taunted()
  end

  defp tick_timed_field(combatant, field) do
    case Map.get(combatant, field) do
      nil -> combatant
      %{turns_left: t} when t <= 1 -> Map.put(combatant, field, nil)
      %{turns_left: t} = val -> Map.put(combatant, field, %{val | turns_left: t - 1})
      _ -> combatant
    end
  end

  defp tick_taunted(combatant) do
    case Map.get(combatant, :taunted) do
      nil -> combatant
      %{turns_left: t} when t <= 1 -> Map.delete(combatant, :taunted)
      %{turns_left: t} = val -> Map.put(combatant, :taunted, %{val | turns_left: t - 1})
      _ -> combatant
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # SIGNATURE TECHNIQUES
  # ══════════════════════════════════════════════════════════════════

  @doc "Resolve a signature technique in combat"
  def resolve_signature_tech(state, actor, target, sig_tech, result, target_limb \\ nil) do
    settings = state.settings

    # Battle text
    text = (sig_tech[:battle_text] || "{name} uses {skill}!")
           |> String.replace("{name}", actor.name)
           |> String.replace("{skill}", sig_tech.name)

    result = %{result |
      log: ["⚡ #{text}" | result.log],
      actions: [%{type: :sig_tech, name: sig_tech.name, actor: actor.name} | result.actions]
    }

    case sig_tech[:tech_type] do
      type when type in ["ki_attack", "physical"] ->
        resolve_sig_tech_attack(state, actor, target, sig_tech, settings, result, target_limb)

      "ki_heal" ->
        resolve_sig_tech_heal(state, actor, target, sig_tech, settings, result)

      _ ->
        {state, %{result | log: ["Unknown technique type." | result.log]}}
    end
  end

  defp resolve_sig_tech_attack(state, actor, target, sig_tech, _settings, result, _target_limb) do
    # Cost: % of current HP
    cost = max(1, trunc(actor.current_hp * (sig_tech[:cost_pct] || 0.10)))

    actor =
      if sig_tech[:tech_type] == "ki_attack" do
        result_log = ["(Cost: #{cost} HP)" | result.log]
        _result = %{result | log: result_log}
        %{actor | current_hp: max(1, actor.current_hp - cost)}
      else
        actor
      end

    # Damage calculation
    base_stat = if sig_tech[:tech_type] == "physical", do: actor.atk, else: actor.mo
    damage = max(1, trunc(base_stat * ((sig_tech[:damage_pct] || 0.50) / 0.10) * 2))

    # Ability effects
    fx = sig_tech[:ability_effects] || %{}

    # Piercing: ignore % of defense
    damage =
      if fx["piercing"] do
        ignore_rate = fx["piercing"]
        def_reduction = trunc((target.def || 0) * ignore_rate)
        damage + def_reduction
      else
        damage
      end

    # Multi-hit
    hits = fx["multi_hit"] || 1
    per_hit = if hits > 1, do: div(damage, hits), else: damage

    {target, result, _total_dmg} =
      Enum.reduce_while(1..hits, {target, result, 0}, fn h, {t, r, total} ->
        hit_dmg = max(1, per_hit)

        # Element bonus
        hit_dmg = if sig_tech[:element], do: trunc(hit_dmg * 1.10), else: hit_dmg

        t = Combatant.apply_damage(t, hit_dmg)
        total = total + hit_dmg

        log_msg = if hits > 1,
          do: "Hit #{h}: #{t.name} takes #{hit_dmg} damage!",
          else: "#{t.name} takes #{hit_dmg} damage!"

        r = %{r |
          log: [log_msg | r.log],
          actions: [%{type: :sig_tech_damage, target: t.name, amount: hit_dmg, hit: h, total_hits: hits} | r.actions]
        }

        if t.current_hp <= 0, do: {:halt, {t, r, total}}, else: {:cont, {t, r, total}}
      end)

    # Death check
    {target, result} =
      if target.current_hp <= 0 do
        {target, %{result |
          log: ["☠️ #{target.name} has been slain!" | result.log],
          actions: [%{type: :death, target: target.name} | result.actions]
        }}
      else
        {target, result}
      end

    state = %{state | combatants: state.combatants |> Map.put(actor.char_id, actor) |> Map.put(target.char_id, target)}
    {state, result}
  end

  defp resolve_sig_tech_heal(state, actor, target, sig_tech, _settings, result) do
    cost = max(1, trunc(actor.current_hp * (sig_tech[:cost_pct] || 0.10)))
    actor = %{actor | current_hp: max(1, actor.current_hp - cost)}

    heal_amount = trunc(actor.max_hp * (sig_tech[:heal_pct] || 0.30))
    heal_target = if target && target.team_id == actor.team_id, do: target, else: actor
    heal_target = Combatant.apply_healing(heal_target, heal_amount)

    result = %{result |
      log: ["#{heal_target.name} recovers #{heal_amount} HP! (Cost: #{cost} HP)" | result.log],
      actions: [%{type: :sig_tech_heal, target: heal_target.name, amount: heal_amount} | result.actions]
    }

    state = %{state | combatants: state.combatants
      |> Map.put(actor.char_id, actor)
      |> Map.put(heal_target.char_id, heal_target)}
    {state, result}
  end

  # ══════════════════════════════════════════════════════════════════
  # FLAVOR TEXT / RP BONUS
  # ══════════════════════════════════════════════════════════════════

  @combat_keywords MapSet.new(~w[
    fire flame burn blaze inferno ice frost freeze cold lightning thunder shock bolt
    earth stone rock quake dark shadow void light holy radiant
    slash cut strike punch kick smash crush pierce stab thrust sweep spin
    charge leap dash lunge slam uppercut overhead backstab flank
    head skull leg arm chest torso neck throat eye knee spine
    rapid swift heavy brutal graceful precise reckless savage fury rage
    feint parry counter riposte dodge weave
    wall ground air sky above below behind tree water cliff
  ])

  @doc "Extract combat keywords from flavor text"
  def extract_keywords(nil), do: []
  def extract_keywords(text) when is_binary(text) do
    text
    |> String.downcase()
    |> String.split(~r/[\s,.\-!?;:'"+]+/)
    |> Enum.filter(fn w -> String.length(w) > 2 and MapSet.member?(@combat_keywords, w) end)
    |> Enum.uniq()
  end

  @doc "Evaluate flavor text for a damage bonus"
  def evaluate_flavor_bonus(nil, _settings), do: 0
  def evaluate_flavor_bonus(text, settings) when is_binary(text) do
    min_length = settings[:flavor_text_min_length] || 20
    base_bonus = settings[:flavor_text_base_bonus] || 0.05
    max_bonus = settings[:flavor_text_max_bonus] || 0.10
    kw_bonus = settings[:flavor_text_keyword_bonus] || 0.02
    kw_max = settings[:flavor_text_keyword_max] || 3

    if String.length(text) < min_length do
      0
    else
      keywords = extract_keywords(text)
      kw_count = min(kw_max, length(keywords))
      bonus = base_bonus + kw_count * kw_bonus
      min(max_bonus, bonus)
    end
  end
  def evaluate_flavor_bonus(_, _), do: 0

  # ══════════════════════════════════════════════════════════════════
  # COMBO PROC (free extra attacks)
  # ══════════════════════════════════════════════════════════════════

  @doc "Roll for combo proc chain after an attack"
  def resolve_combo_proc(state, actor, target, combo_chance, max_chain, result) do
    settings = state.settings

    if not settings[:enable_combo_procs] or combo_chance <= 0 or max_chain <= 0 or
       target == nil or target.current_hp <= 0 or target.knocked_out do
      {state, result}
    else
      decay = settings[:combo_chain_decay] || 0.50
      combo_crit = settings[:combo_crit_chance] || 0.03

      {target, result, _} =
        Enum.reduce_while(0..(max_chain - 1), {target, result, combo_chance}, fn _chain_idx, {t, r, current_chance} ->
          if :rand.uniform() >= current_chance do
            {:halt, {t, r, 0}}
          else
            r = %{r |
              log: ["⚡ COMBO! #{actor.name} follows up with another strike!" | r.log],
              actions: [%{type: :combo_proc, actor: actor.name} | r.actions]
            }

            combo_dmg = max(1, trunc(actor.atk * 1.5))
            {combo_dmg, crit_hit} =
              if :rand.uniform() < combo_crit do
                {trunc(combo_dmg * 1.5), true}
              else
                {combo_dmg, false}
              end

            t = Combatant.apply_damage(t, combo_dmg)
            crit_prefix = if crit_hit, do: "💥 CRIT! ", else: ""
            r = %{r |
              log: ["#{crit_prefix}#{t.name} takes #{combo_dmg} combo damage!" | r.log],
              actions: [%{type: :combo_damage, target: t.name, amount: combo_dmg, crit: crit_hit} | r.actions]
            }

            if t.current_hp <= 0 do
              r = %{r | log: ["☠️ #{t.name} has been slain!" | r.log],
                       actions: [%{type: :death, target: t.name} | r.actions]}
              {:halt, {t, r, 0}}
            else
              {:cont, {t, r, current_chance * decay}}
            end
          end
        end)

      state = %{state | combatants: Map.put(state.combatants, target.char_id, target)}
      {state, result}
    end
  end

  # ── Helpers ─────────────────────────────────────────────────────

  defp parse_float(nil), do: nil
  defp parse_float(n) when is_number(n), do: n / 1
  defp parse_float(s) when is_binary(s) do
    case Float.parse(s) do
      {f, _} -> f
      :error -> nil
    end
  end
  defp parse_float(_), do: nil
end
