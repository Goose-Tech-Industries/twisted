defmodule TePhoenix.Battle.Reactions do
  @moduledoc """
  Reaction system: automatic responses to combat events.

  Reactions are abilities that fire automatically when a trigger
  condition is met, without consuming the combatant's turn. They
  use a separate "reaction" resource (1 per round, refreshed at
  turn start) to prevent infinite chains.

  ## Reaction definition (data-driven via `game_reaction_defs`)

      %{
        key: "counter_stance",
        name: "Counter Stance",
        trigger: "damage_taken",        # when to check
        condition: %{                    # must match to fire
          "damage_type" => "physical",
          "hp_above_pct" => 0.2
        },
        effect: %{                       # what happens
          "type" => "counter_attack",
          "damage_formula" => "ATK*1.5",
          "apply_status" => nil,
          "script_id" => nil
        },
        priority: 100,                   # higher fires first
        passive: false                   # true = always active, false = must equip
      }

  ## Reaction types

    * `counter_attack` — deal damage back to attacker on being hit
    * `auto_heal` — auto-use heal item/spell when HP drops below threshold
    * `baton_pass` — pass turn to an ally (Persona 5)
    * `opportunity_attack` — attack enemy who moves out of melee range
    * `guard_ally` — take damage for an adjacent ally
    * `evasion` — auto-dodge with chance, consuming reaction
    * `reflect` — reflect spell/projectile back at caster
    * `absorb` — absorb incoming element to heal
    * `custom` — script-driven via visual scripting graph

  ## Integration

    * `damage.ex` — after hit, check defender reactions
    * `state.ex` — on movement, check opportunity attack reactions
    * `combat.ex` — baton_pass modifies turn order
    * `Triggers` — reactions fire via the existing trigger bus
    * Combatant struct — `reactions_remaining: 1`, reset each turn

  All data-driven, toggleable via `enable_reactions` setting.
  """

  require Logger
  alias TePhoenix.Battle.{Combatant, StatusEffects, Triggers}
  alias TePhoenix.Repo

  @table "game_reaction_defs"

  # ── Setup ───────────────────────────────────────────────────────

  def ensure_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@table} (
      `key` VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      icon VARCHAR(16) DEFAULT '⚡',
      trigger_event VARCHAR(64) NOT NULL,
      condition_json LONGTEXT,
      effect_json LONGTEXT NOT NULL,
      effect_type VARCHAR(32) DEFAULT 'counter_attack',
      priority INT DEFAULT 100,
      passive TINYINT(1) DEFAULT 0,
      enabled TINYINT(1) DEFAULT 1,
      updated_at DATETIME NOT NULL
    )
    """)

    seed_defaults()
  rescue
    e -> Logger.error("Reactions ensure_table: #{inspect(e)}")
  end

  # ── Check and fire reactions ────────────────────────────────────

  @doc """
  Check if a combatant has any reactions that should fire for the
  given event. Executes the first matching reaction (highest priority)
  and consumes one reaction charge.

  Returns `{state, result}`.
  """
  def check_reactions(state, combatant, event, ctx, result) do
    settings = state.settings || %{}

    if not (settings[:enable_reactions] || false) do
      {state, result}
    else
      remaining = Map.get(combatant, :reactions_remaining, 1)

      if remaining <= 0 do
        {state, result}
      else
        equipped = Map.get(combatant, :equipped_reactions, [])
        all_reactions = list_defs()

        matching =
          all_reactions
          |> Enum.filter(fn r ->
            r.trigger_event == event and
            (r.passive or r.key in equipped) and
            condition_match?(r.condition, ctx, combatant)
          end)
          |> Enum.sort_by(&(-&1.priority))

        case matching do
          [reaction | _] ->
            combatant = Map.put(combatant, :reactions_remaining, remaining - 1)
            state = put_in(state.combatants[combatant.char_id], combatant)
            execute_reaction(state, combatant, reaction, ctx, result)

          [] ->
            {state, result}
        end
      end
    end
  end

  @doc "Reset reaction charges for a combatant (call at turn start)."
  def reset_charges(combatant) do
    Map.put(combatant, :reactions_remaining, 1)
  end

  # ── Execute reaction ────────────────────────────────────────────

  defp execute_reaction(state, combatant, reaction, ctx, result) do
    result = %{result |
      log: ["⚡ #{combatant.name} reacts with #{reaction.name}!" | result.log],
      actions: [%{type: :reaction, actor: combatant.name, reaction: reaction.key, icon: reaction.icon} | result.actions]
    }

    effect = reaction.effect || %{}

    case reaction.effect_type do
      "counter_attack" ->
        execute_counter(state, combatant, ctx, effect, result)

      "auto_heal" ->
        execute_auto_heal(state, combatant, effect, result)

      "opportunity_attack" ->
        execute_opportunity(state, combatant, ctx, effect, result)

      "guard_ally" ->
        execute_guard(state, combatant, ctx, effect, result)

      "evasion" ->
        execute_evasion(state, combatant, ctx, effect, result)

      "reflect" ->
        execute_reflect(state, combatant, ctx, effect, result)

      "baton_pass" ->
        execute_baton_pass(state, combatant, ctx, effect, result)

      "apply_status" ->
        target_key = effect["to"] || "self"
        status_key = effect["status"] || effect["apply_status"]
        actor = if target_key == "self", do: combatant, else: ctx[:attacker]

        if actor && status_key do
          {actor, result} = StatusEffects.apply_status(actor, status_key, result)
          state = put_in(state.combatants[actor.char_id], actor)
          {state, result}
        else
          {state, result}
        end

      "custom" ->
        if sid = effect["script_id"] do
          try do
            TePhoenix.Game.ScriptInterpreter.run_for_trigger(sid, state, ctx, result)
          rescue
            _ -> {state, result}
          end
        else
          {state, result}
        end

      _ ->
        {state, result}
    end
  end

  defp execute_counter(state, combatant, ctx, effect, result) do
    attacker = ctx[:attacker]

    if attacker && Combatant.alive?(attacker) do
      formula = effect["damage_formula"] || "ATK*1"
      vars = Combatant.formula_vars(combatant, attacker)
      damage = max(1, trunc(TePhoenix.Battle.Formula.evaluate(formula, vars)))
      attacker = Combatant.apply_damage(attacker, damage)

      result = %{result |
        log: ["↩️ #{combatant.name} counters for #{damage} damage!" | result.log],
        actions: [%{type: :reaction_counter, actor: combatant.name, target: attacker.name, damage: damage} | result.actions]
      }

      state = put_in(state.combatants[attacker.char_id], attacker)
      {state, result}
    else
      {state, result}
    end
  end

  defp execute_auto_heal(state, combatant, effect, result) do
    heal_pct = effect["heal_pct"] || 0.25
    heal = max(1, trunc(combatant.max_hp * heal_pct))
    combatant = Combatant.apply_healing(combatant, heal)

    result = %{result |
      log: ["💚 #{combatant.name} auto-heals for #{heal} HP!" | result.log],
      actions: [%{type: :reaction_heal, actor: combatant.name, amount: heal} | result.actions]
    }

    state = put_in(state.combatants[combatant.char_id], combatant)
    {state, result}
  end

  defp execute_opportunity(state, combatant, ctx, effect, result) do
    target = ctx[:mover] || ctx[:victim]

    if target && Combatant.alive?(target) do
      formula = effect["damage_formula"] || "ATK*1"
      vars = Combatant.formula_vars(combatant, target)
      damage = max(1, trunc(TePhoenix.Battle.Formula.evaluate(formula, vars)))
      target = Combatant.apply_damage(target, damage)

      result = %{result |
        log: ["⚔️ #{combatant.name} strikes #{target.name} as they flee! (#{damage} damage)" | result.log],
        actions: [%{type: :opportunity_attack, actor: combatant.name, target: target.name, damage: damage} | result.actions]
      }

      state = put_in(state.combatants[target.char_id], target)
      {state, result}
    else
      {state, result}
    end
  end

  defp execute_guard(state, combatant, ctx, _effect, result) do
    ally = ctx[:victim]

    if ally && ally.char_id != combatant.char_id do
      damage = ctx[:damage] || 0
      combatant = Combatant.apply_damage(combatant, damage)

      result = %{result |
        log: ["🛡️ #{combatant.name} takes the hit for #{ally.name}! (#{damage} damage)" | result.log],
        actions: [%{type: :guard_ally, guardian: combatant.name, protected: ally.name, damage: damage} | result.actions]
      }

      state = put_in(state.combatants[combatant.char_id], combatant)
      {state, result}
    else
      {state, result}
    end
  end

  defp execute_evasion(state, combatant, _ctx, effect, result) do
    chance = effect["evasion_chance"] || 0.5

    if :rand.uniform() < chance do
      result = %{result |
        log: ["💨 #{combatant.name} evades the attack!" | result.log],
        actions: [%{type: :reaction_evasion, actor: combatant.name, success: true} | result.actions]
      }
      {state, result}
    else
      result = %{result |
        log: ["#{combatant.name} tries to evade but fails!" | result.log],
        actions: [%{type: :reaction_evasion, actor: combatant.name, success: false} | result.actions]
      }
      {state, result}
    end
  end

  defp execute_reflect(state, combatant, ctx, _effect, result) do
    attacker = ctx[:attacker]
    damage = ctx[:damage] || 0

    if attacker && damage > 0 do
      reflect_dmg = div(damage, 2)
      attacker = Combatant.apply_damage(attacker, reflect_dmg)

      result = %{result |
        log: ["🪞 #{combatant.name} reflects #{reflect_dmg} damage back!" | result.log],
        actions: [%{type: :reaction_reflect, actor: combatant.name, target: attacker.name, damage: reflect_dmg} | result.actions]
      }

      state = put_in(state.combatants[attacker.char_id], attacker)
      {state, result}
    else
      {state, result}
    end
  end

  defp execute_baton_pass(state, combatant, _ctx, _effect, result) do
    team = combatant.team_id
    allies =
      state.combatants
      |> Enum.filter(fn {id, c} -> c.team_id == team and id != combatant.char_id and Combatant.alive?(c) end)
      |> Enum.map(fn {id, _} -> id end)

    case allies do
      [] ->
        {state, result}

      [ally_id | _] ->
        ally = Map.get(state.combatants, ally_id)

        result = %{result |
          log: ["🤝 #{combatant.name} passes to #{ally.name}!" | result.log],
          actions: [%{type: :baton_pass, from: combatant.name, to: ally.name, to_id: ally_id} | result.actions]
        }

        {state, result}
    end
  end

  # ── Condition matching ──────────────────────────────────────────

  defp condition_match?(nil, _ctx, _c), do: true
  defp condition_match?(cond, _ctx, _c) when cond == %{}, do: true

  defp condition_match?(cond, ctx, combatant) do
    Enum.all?(cond, fn {k, v} ->
      case k do
        "damage_type" -> to_string(ctx[:damage_type]) == to_string(v)
        "hp_below_pct" -> combatant.max_hp > 0 and combatant.current_hp / combatant.max_hp < v
        "hp_above_pct" -> combatant.max_hp > 0 and combatant.current_hp / combatant.max_hp > v
        "element" -> to_string(ctx[:element]) == to_string(v)
        "is_ranged" -> ctx[:range] && ctx[:range] > 1
        "is_melee" -> !ctx[:range] || ctx[:range] <= 1
        _ -> true
      end
    end)
  end

  # ── Data access ─────────────────────────────────────────────────

  def list_defs do
    case Repo.query("SELECT `key`, name, description, icon, trigger_event, condition_json, effect_json, effect_type, priority, passive FROM #{@table} WHERE enabled = 1 ORDER BY priority DESC") do
      {:ok, %{rows: rows}} -> Enum.map(rows, &parse_def/1)
      _ -> []
    end
  rescue
    _ -> []
  end

  defp parse_def([key, name, desc, icon, trigger, cond_j, eff_j, eff_type, prio, passive]) do
    %{
      key: key, name: name, description: desc, icon: icon || "⚡",
      trigger_event: trigger, condition: decode(cond_j),
      effect: decode(eff_j), effect_type: eff_type || "counter_attack",
      priority: prio || 100, passive: passive == 1 or passive == true
    }
  end

  defp decode(nil), do: %{}
  defp decode(""), do: %{}
  defp decode(s) when is_binary(s), do: case(Jason.decode(s), do: ({:ok, v} -> v; _ -> %{}))
  defp decode(m) when is_map(m), do: m
  defp decode(_), do: %{}

  # ── Seed defaults ───────────────────────────────────────────────

  defp seed_defaults do
    case Repo.query("SELECT COUNT(*) FROM #{@table}") do
      {:ok, %{rows: [[0]]}} ->
        for r <- default_reactions() do
          Repo.query(
            "INSERT INTO #{@table} (`key`, name, description, icon, trigger_event, condition_json, effect_json, effect_type, priority, passive, enabled, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,NOW())",
            [r.key, r.name, r.desc, r.icon, r.trigger, Jason.encode!(r.cond), Jason.encode!(r.effect), r.etype, r.prio, if(r.passive, do: 1, else: 0)]
          )
        end
      _ -> :ok
    end
  rescue
    _ -> :ok
  end

  defp default_reactions do
    [
      %{key: "counter_stance", name: "Counter Stance", desc: "Counter physical attacks with 1.5x ATK.", icon: "↩️",
        trigger: "damage_taken", cond: %{"damage_type" => "physical"}, effect: %{"damage_formula" => "ATK*1.5"}, etype: "counter_attack", prio: 100, passive: false},
      %{key: "auto_potion", name: "Auto-Potion", desc: "Auto-heal 25% HP when hit below 30%.", icon: "💊",
        trigger: "damage_taken", cond: %{"hp_below_pct" => 0.30}, effect: %{"heal_pct" => 0.25}, etype: "auto_heal", prio: 90, passive: false},
      %{key: "baton_pass", name: "Baton Pass", desc: "Pass your turn to an ally after a weakness hit.", icon: "🤝",
        trigger: "attack_landed", cond: %{}, effect: %{}, etype: "baton_pass", prio: 80, passive: false},
      %{key: "opportunity_strike", name: "Opportunity Strike", desc: "Attack enemies who move out of melee range.", icon: "⚔️",
        trigger: "enemy_moved", cond: %{}, effect: %{"damage_formula" => "ATK*1"}, etype: "opportunity_attack", prio: 100, passive: true},
      %{key: "spell_reflect", name: "Spell Reflect", desc: "Reflect 50% of magic damage back at caster.", icon: "🪞",
        trigger: "damage_taken", cond: %{"damage_type" => "magic"}, effect: %{}, etype: "reflect", prio: 70, passive: false},
      %{key: "cover_ally", name: "Cover Ally", desc: "Take a hit for an adjacent ally.", icon: "🛡️",
        trigger: "ally_targeted", cond: %{}, effect: %{}, etype: "guard_ally", prio: 60, passive: false}
    ]
  end
end
