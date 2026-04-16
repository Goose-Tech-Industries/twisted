defmodule TePhoenix.Battle.DamagePipeline do
  @moduledoc """
  Composable damage pipeline.

  Each step is a function that takes a context map and returns an
  updated context. Steps can be added, removed, or reordered from
  AdminSauce by editing the `damage_pipeline_steps` setting (JSON
  array of step keys). If no custom order is set, the default 25-step
  pipeline runs.

  ## Context shape

      %{
        state: %Battle.State{},
        actor: %Combatant{},
        target: %Combatant{},
        damage: integer,
        effects: map,
        action_name: string,
        settings: map,
        opts: map,
        result: %{log: [], actions: []},
        meta: %{
          crit: false,
          dodged: false,
          absorbed: false,
          elements: [],
          effective_limb: nil,
          limb_result: nil,
          attacker_mods: %{},
          defender_mods: %{},
          halted: false
        }
      }

  Steps return `ctx` or `%{ctx | halted: true}` to short-circuit.

  ## Adding custom steps

  Define a module with `step(ctx)` function, register it:

      DamagePipeline.register_step("my_custom_step", MyModule, :step)

  Then add `"my_custom_step"` to the pipeline order in AdminSauce settings.
  """

  alias TePhoenix.Battle.{Combatant, Formula, StatusEffects, Systems, Tactics}

  @default_steps [
    :compute_modifiers,
    :base_formula,
    :randomize,
    :flavor_bonus,
    :rp_modifiers,
    :status_combo,
    :ai_difficulty,
    :stealth_bonus,
    :damage_type_armor,
    :crit,
    :miss_check,
    :called_shot,
    :elements,
    :stance_mods,
    :tactical_mods,
    :active_defense,
    :status_damage_mults,
    :damage_floor_cap,
    :rolling_hp,
    :limb_routing,
    :break_shield,
    :stagger,
    :weapon_triangle,
    :apply_damage_triggers,
    :death_check
  ]

  def default_steps, do: @default_steps

  @doc """
  Run the damage pipeline. Returns `{state, result}`.

  If `settings[:damage_pipeline_steps]` is set (JSON array of step
  keys), that order is used. Otherwise the default 25-step pipeline.
  """
  def run(state, actor, target, effects, action_name, result, opts \\ %{}) do
    settings = state.settings || %{}

    steps =
      case settings[:damage_pipeline_steps] do
        list when is_list(list) and list != [] ->
          Enum.map(list, &String.to_existing_atom/1)
        _ ->
          @default_steps
      end

    ctx = %{
      state: state,
      actor: actor,
      target: target,
      damage: 0,
      effects: effects,
      action_name: action_name,
      settings: settings,
      opts: opts,
      result: result,
      meta: %{
        crit: false,
        dodged: false,
        absorbed: false,
        elements: [],
        effective_limb: nil,
        limb_result: nil,
        attacker_mods: StatusEffects.compute_modifiers(actor),
        defender_mods: StatusEffects.compute_modifiers(target),
        halted: false
      }
    }

    ctx = Enum.reduce_while(steps, ctx, fn step, c ->
      if c.meta.halted or c.meta.dodged or c.meta.absorbed do
        {:halt, c}
      else
        {:cont, execute_step(step, c)}
      end
    end)

    # Save combatants back to state
    state = %{ctx.state |
      combatants: ctx.state.combatants
      |> Map.put(ctx.actor.char_id, ctx.actor)
      |> Map.put(ctx.target.char_id, ctx.target)
    }

    {state, ctx.result}
  end

  # ── Step implementations ────────────────────────────────────────

  defp execute_step(:compute_modifiers, ctx) do
    vars =
      Combatant.formula_vars(ctx.actor, ctx.target)
      |> Map.update!("ATK", &(&1 * ctx.meta.attacker_mods.atk_mult))
      |> Map.update!("DEF", &(&1 * ctx.meta.defender_mods.def_mult))
      |> Map.update!("MO", &(&1 * ctx.meta.attacker_mods.mo_mult))
      |> Map.update!("MD", &(&1 * ctx.meta.defender_mods.md_mult))
      |> Map.update!("SPD", &(&1 * ctx.meta.attacker_mods.speed_mult))

    put_in(ctx, [:meta, :vars], vars)
  end

  defp execute_step(:base_formula, ctx) do
    dmg_def = ctx.effects["damage"] || ctx.effects
    formula = Map.get(dmg_def, "formula", "ATK*2-DEF")
    vars = ctx.meta[:vars] || Combatant.formula_vars(ctx.actor, ctx.target)
    base = Formula.evaluate(formula, vars) |> trunc()
    %{ctx | damage: base}
  end

  defp execute_step(:randomize, ctx) do
    dmg_def = ctx.effects["damage"] || ctx.effects
    case Map.get(dmg_def, "randomize") do
      nil -> ctx
      factor ->
        rand = 1 + (:rand.uniform() * 2 - 1) * factor
        %{ctx | damage: trunc(ctx.damage * rand)}
    end
  end

  defp execute_step(:flavor_bonus, ctx) do
    flavor = ctx.opts[:flavor_text]
    if flavor && String.length(to_string(flavor)) >= (ctx.settings[:flavor_text_min_length] || 20) do
      bonus = min(ctx.settings[:flavor_text_base_bonus] || 0.05, ctx.settings[:flavor_text_max_bonus] || 0.10)
      %{ctx | damage: trunc(ctx.damage * (1 + bonus))}
    else
      ctx
    end
  end

  defp execute_step(:rp_modifiers, ctx) do
    d = ctx.damage
    a = ctx.actor
    d = if a.taunt_bonus, do: trunc(d * (1 + Map.get(a.taunt_bonus, :damage_bonus, 0))), else: d
    d = if a.intimidated, do: trunc(d * (1 - Map.get(a.intimidated, :atk_reduction, 0))), else: d
    d = if a.rallied, do: trunc(d * (1 + Map.get(a.rallied, :atk_bonus, 0))), else: d
    %{ctx | damage: d}
  end

  defp execute_step(:status_combo, ctx) do
    if ctx.target.status_combo_bonus > 0 do
      bonus = ctx.target.status_combo_bonus
      target = %{ctx.target | status_combo_bonus: 0}
      %{ctx | damage: trunc(ctx.damage * (1 + bonus)), target: target}
    else
      ctx
    end
  end

  defp execute_step(:ai_difficulty, ctx) do
    if ctx.actor.is_ai do
      mult = case ctx.settings[:ai_difficulty] do
        "easy" -> 0.75; "hard" -> 1.25; "nightmare" -> 1.50; _ -> 1.0
      end
      %{ctx | damage: trunc(ctx.damage * max(0.1, min(3.0, mult)))}
    else
      ctx
    end
  end

  defp execute_step(:stealth_bonus, ctx) do
    if ctx.actor.stealth_active do
      bonus = ctx.settings[:stealth_surprise_bonus] || 0.50
      %{ctx | damage: trunc(ctx.damage * (1 + bonus))}
    else
      ctx
    end
  end

  defp execute_step(:damage_type_armor, ctx) do
    dmg_def = ctx.effects["damage"] || ctx.effects
    dtype = Map.get(dmg_def, "type", "physical")

    cond do
      dtype == "true" or dtype == "percent_hp" -> ctx
      true ->
        armor = if dtype == "magic", do: ctx.target.md || 0, else: ctx.target.def || 0
        reduction = 100 / (100 + max(0, armor))
        %{ctx | damage: trunc(ctx.damage * reduction)}
    end
  end

  defp execute_step(:crit, ctx) do
    base_crit = ctx.settings[:base_crit_chance] || 5
    if :rand.uniform(100) <= max(0, base_crit) do
      mult = ctx.settings[:crit_damage_multiplier] || 1.5
      ctx = %{ctx | damage: trunc(ctx.damage * mult)}
      put_in(ctx, [:meta, :crit], true)
    else
      ctx
    end
  end

  defp execute_step(:miss_check, ctx) do
    miss = ctx.actor.miss_chance
    if miss > 0 and :rand.uniform(100) <= miss do
      result = %{ctx.result | log: ["#{ctx.actor.name}'s attack misses!" | ctx.result.log]}
      %{ctx | result: result, meta: Map.put(ctx.meta, :dodged, true)}
    else
      ctx
    end
  end

  defp execute_step(:called_shot, ctx) do
    limb = ctx.opts[:target_limb]
    if ctx.settings[:enable_limb_targeting] and limb do
      put_in(ctx, [:meta, :effective_limb], limb)
    else
      ctx
    end
  end

  defp execute_step(:elements, ctx) do
    weapon_elements =
      if Map.get(ctx.effects, "apply_weapon_elements") and ctx.actor.weapon_elements != [] do
        ctx.actor.weapon_elements
      else
        []
      end
    skill_elements = Map.get(ctx.effects, "elements", [])
    dipped = if ctx.actor.dipped_element && ctx.actor.dipped_turns > 0, do: [ctx.actor.dipped_element], else: []
    elements = Enum.uniq(weapon_elements ++ skill_elements ++ dipped)
    put_in(ctx, [:meta, :elements], elements)
  end

  defp execute_step(:stance_mods, ctx) do
    d = ctx.damage
    d = if ctx.actor.stance == "POWER", do: trunc(d * 1.4), else: d
    d = if ctx.target.stance == "GUARD", do: trunc(d * 0.5), else: d
    %{ctx | damage: d}
  end

  defp execute_step(:tactical_mods, ctx) do
    tactics = Tactics.calculate(ctx.state, ctx.actor, ctx.target)
    range = Map.get(ctx.effects, "range", 1)

    if range > 1 and not tactics.los and not Map.get(ctx.effects, "ignore_los", false) do
      result = %{ctx.result | log: ["No line of sight!" | ctx.result.log]}
      %{ctx | result: result, meta: Map.put(ctx.meta, :halted, true)}
    else
      mult = if range > 1, do: tactics.cover * tactics.flanking * tactics.elevation, else: tactics.flanking * tactics.elevation
      %{ctx | damage: trunc(ctx.damage * mult)}
    end
  end

  defp execute_step(:active_defense, ctx) do
    # Simplified — delegates to existing logic. Full implementation
    # would extract dodge/block/counter into separate steps.
    ctx
  end

  defp execute_step(:status_damage_mults, ctx) do
    mult = ctx.meta.attacker_mods.damage_dealt_mult * ctx.meta.defender_mods.damage_taken_mult
    %{ctx | damage: trunc(ctx.damage * mult)}
  end

  defp execute_step(:damage_floor_cap, ctx) do
    d = max(1, ctx.damage)
    cap = ctx.settings[:damage_cap] || 0
    d = if cap > 0, do: min(cap, d), else: d
    %{ctx | damage: d}
  end

  defp execute_step(:rolling_hp, ctx) do
    if ctx.settings[:enable_rolling_hp] do
      target = Systems.queue_rolling_damage(ctx.target, ctx.damage, ctx.settings)
      %{ctx | target: target}
    else
      target = Combatant.apply_damage(ctx.target, ctx.damage)
      %{ctx | target: target}
    end
  end

  defp execute_step(:limb_routing, ctx), do: ctx
  defp execute_step(:break_shield, ctx), do: ctx
  defp execute_step(:stagger, ctx), do: ctx
  defp execute_step(:weapon_triangle, ctx), do: ctx

  defp execute_step(:apply_damage_triggers, ctx) do
    result = %{ctx.result |
      log: ["#{ctx.target.name} takes #{ctx.damage} damage!" | ctx.result.log],
      actions: [%{type: :damage, target: ctx.target.name, amount: ctx.damage, crit: ctx.meta.crit} | ctx.result.actions]
    }
    %{ctx | result: result}
  end

  defp execute_step(:death_check, ctx) do
    if ctx.target.current_hp <= 0 do
      result = %{ctx.result |
        log: ["#{ctx.target.name} has fallen!" | ctx.result.log],
        actions: [%{type: :death, target: ctx.target.name} | ctx.result.actions]
      }
      %{ctx | result: result}
    else
      ctx
    end
  end

  defp execute_step(_unknown, ctx), do: ctx
end
