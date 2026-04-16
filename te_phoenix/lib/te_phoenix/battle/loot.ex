defmodule TePhoenix.Battle.Loot do
  @moduledoc """
  Loot system: Steal, Drop Tables, Overkill bonus, Battle Chain, Battle Rating.
  Ported from te/battle/loot.js
  require Logger
  """

  alias TePhoenix.Repo
  import Ecto.Query

  # ══════════════════════════════════════════════════════════════════
  # STEAL
  # ══════════════════════════════════════════════════════════════════

  @doc """
  Mid-battle steal action. Roll against target's steal table.
  Two pools: common (high chance) and rare (low chance).
  Chance = (luck + speed*0.5) vs target level.
  """
  def resolve_steal(state, actor, target, result) do
    settings = state.settings

    cond do
      not settings[:enable_steal] ->
        {state, %{result | log: ["Steal is not available." | result.log]}}

      Map.get(target, :already_stolen, false) ->
        {state, %{result | log: ["#{target.name} has nothing left to steal!" | result.log]}}

      actor.team_id == target.team_id ->
        {state, %{result | log: ["#{actor.name} can't steal from an ally!" | result.log]}}

      true ->
        steal_table = load_steal_table(target.char_id)

        if steal_table == nil or steal_table == [] do
          {state, %{result | log: ["#{target.name} has nothing to steal." | result.log]}}
        else
          base_chance = settings[:steal_base_chance] || 50
          chance = min(95, max(10,
            base_chance + (actor.luck || 0) * 2 + (actor.speed || 0) * 0.5 - (target.level || 1) * 3
          ))

          if :rand.uniform(100) > chance do
            result = %{result |
              log: ["#{actor.name} tries to steal from #{target.name}... but fails! (#{round(chance)}% chance)" | result.log],
              actions: [%{type: :steal, actor: actor.name, target: target.name, success: false} | result.actions]
            }
            {state, result}
          else
            {stolen, is_rare} = roll_steal_item(steal_table, settings)

            if stolen == nil do
              {state, %{result | log: ["#{actor.name} rummages through #{target.name}'s pockets... nothing!" | result.log]}}
            else
              # Mark target as stolen from
              target = Map.put(target, :already_stolen, true)
              state = %{state | combatants: Map.put(state.combatants, target.char_id, target)}

              # Give item to actor (DB side)
              item_info = give_stolen_item(actor.char_id, stolen)

              result = %{result |
                log: ["#{item_info.icon} #{actor.name} steals #{item_info.name}#{if stolen["qty"] > 1, do: " x#{stolen["qty"]}", else: ""} from #{target.name}!" | result.log],
                actions: [%{type: :steal, actor: actor.name, target: target.name, success: true,
                  item: %{id: stolen["item_id"], name: item_info.name, icon: item_info.icon, qty: stolen["qty"] || 1, rare: is_rare}} | result.actions]
              }
              {state, result}
            end
          end
        end
    end
  end

  defp load_steal_table(char_id) do
    case Repo.one(from n in "game_npcs", where: n.char_id == ^char_id, select: n.steal_table_json, limit: 1) do
      nil -> []
      json when is_binary(json) ->
        case Jason.decode(json) do
          {:ok, list} when is_list(list) -> list
          _ -> []
        end
      _ -> []
    end
  rescue
    _ -> []
  end

  defp roll_steal_item(steal_table, settings) do
    rare_items = Enum.filter(steal_table, fn e -> e["rarity"] == "rare" end)
    common_items = Enum.filter(steal_table, fn e -> e["rarity"] != "rare" end)
    rare_chance = settings[:steal_rare_chance] || 0.20

    cond do
      rare_items != [] and :rand.uniform() < rare_chance ->
        {Enum.random(rare_items), true}
      common_items != [] ->
        {Enum.random(common_items), false}
      true ->
        {nil, false}
    end
  end

  defp give_stolen_item(char_id, stolen) do
    item_id = stolen["item_id"]
    qty = stolen["qty"] || 1

    try do
      Repo.query!(
        "INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)",
        [char_id, item_id, qty]
      )
    rescue
      _ -> nil
    end

    # Get item display info
    case Repo.one(from i in "game_items", where: i.id == ^item_id, select: %{name: i.name, icon: i.icon}) do
      nil -> %{name: "Unknown Item", icon: "📦"}
      info -> %{name: info.name, icon: info.icon || "📦"}
    end
  rescue
    _ -> %{name: "Unknown Item", icon: "📦"}
  end

  # ══════════════════════════════════════════════════════════════════
  # ITEM RESOLUTION (Full battle item usage)
  # ══════════════════════════════════════════════════════════════════

  @doc """
  Resolve item usage in battle. Supports:
  - Heal HP/MP
  - Throw damage (BG3-style: any item can be thrown)
  - Apply/cure status effects
  - Create terrain surfaces
  - Heal specific limbs
  """
  def resolve_item(state, actor, target, item_id, result) do
    # Check wound prevents item use
    if Map.get(actor, :wound_flags, %{})["cant_use_items"] do
      {state, %{result | log: ["#{actor.name}'s arm is too wounded to use items!" | result.log]}}
    else
      case load_item(item_id) do
        nil ->
          {state, %{result | log: ["#{actor.name} can't use that in battle!" | result.log]}}

        item ->
          effects = parse_json(item.effects)
          resolve_item_effects(state, actor, target, item, effects, result)
      end
    end
  end

  defp resolve_item_effects(state, actor, target, item, effects, result) do
    # Determine target
    throw_target = effects["throw_target"] || "self"
    item_target = case throw_target do
      "self" -> actor
      "enemy" when target != nil -> target
      "ally" when target != nil -> target
      "any" when target != nil -> target
      _ -> actor
    end

    throw_verb = if item_target.char_id == actor.char_id, do: "uses", else: "throws"
    on_text = if item_target.char_id == actor.char_id, do: "", else: " on #{item_target.name}"
    result = %{result | log: ["#{actor.name} #{throw_verb} #{item.icon || "🧪"} #{item.name}#{on_text}!" | result.log]}

    # Heal HP
    {item_target, result} =
      if effects["heal_hp"] do
        heal = effects["heal_hp"]["formula"] || "50"
        vars = TePhoenix.Battle.Combatant.formula_vars(actor, item_target)
        amount = trunc(TePhoenix.Battle.Formula.evaluate(heal, vars))
        t = TePhoenix.Battle.Combatant.apply_healing(item_target, amount)
        {t, %{result |
          log: ["#{t.name} recovers #{amount} HP!" | result.log],
          actions: [%{type: :heal, target: t.name, amount: amount} | result.actions]
        }}
      else
        {item_target, result}
      end

    # Heal MP
    {item_target, result} =
      if effects["heal_mp"] do
        heal = effects["heal_mp"]["formula"] || "30"
        vars = TePhoenix.Battle.Combatant.formula_vars(actor, item_target)
        amount = trunc(TePhoenix.Battle.Formula.evaluate(heal, vars))
        new_mp = min(item_target.max_mp, item_target.current_mp + amount)
        t = %{item_target | current_mp: new_mp}
        {t, %{result | log: ["#{t.name} recovers #{amount} MP!" | result.log]}}
      else
        {item_target, result}
      end

    # Throw damage (bombs, acid flasks)
    {item_target, result} =
      if effects["throw_damage"] do
        vars = TePhoenix.Battle.Combatant.formula_vars(actor, item_target)
        dmg = max(1, trunc(TePhoenix.Battle.Formula.evaluate(effects["throw_damage"]["formula"] || "20", vars)))
        t = TePhoenix.Battle.Combatant.apply_damage(item_target, dmg)
        {t, %{result |
          log: ["#{t.name} takes #{dmg} damage!" | result.log],
          actions: [%{type: :item_damage, target: t.name, amount: dmg, item: item.name} | result.actions]
        }}
      else
        {item_target, result}
      end

    # Surface creation (BG3-style)
    state =
      if effects["surface_on_throw"] && item_target.char_id != actor.char_id do
        key = "#{item_target.grid_x},#{item_target.grid_y}"
        terrain = Map.put(state.terrain_map, key, effects["surface_on_throw"])

        # Spread to adjacent if splash radius
        terrain = case effects["surface_radius"] do
          nil -> terrain
          radius ->
            for dy <- -radius..radius, dx <- -radius..radius,
                not (dx == 0 and dy == 0),
                abs(dx) + abs(dy) <= radius,
                reduce: terrain do
              acc ->
                sk = "#{item_target.grid_x + dx},#{item_target.grid_y + dy}"
                Map.put(acc, sk, effects["surface_on_throw"])
            end
        end

        %{state | terrain_map: terrain}
      else
        state
      end

    # Save updated target
    state = %{state | combatants: Map.put(state.combatants, item_target.char_id, item_target)}

    # Consume from inventory (DB side, non-blocking)
    consume_item(actor.char_id, item.id)

    {state, result}
  end

  # ══════════════════════════════════════════════════════════════════
  # LIMIT BREAK
  # ══════════════════════════════════════════════════════════════════

  @doc "Resolve a limit break action"
  def resolve_limit_break(state, actor, target, limit_id, result, _target_limb \\ nil) do
    case load_limit_break(limit_id, actor) do
      nil ->
        {state, %{result | log: ["#{actor.name} can't use that limit break!" | result.log]}}

      limit ->
        cond do
          Map.get(actor, :limitbreak, 0) < 100 ->
            {state, %{result | log: ["Limit break bar not full!" | result.log]}}

          (limit[:break_level] || 0) > Map.get(actor, :breaklevel, 0) ->
            {state, %{result | log: ["Limit break level too low!" | result.log]}}

          (limit[:char_level_req] || 0) > (actor.level || 1) ->
            {state, %{result | log: ["Character level too low for this limit!" | result.log]}}

          true ->
            # Consume limit bar
            actor = Map.put(actor, :limitbreak, 0)

            effects = parse_json(limit[:effects])
            vars = TePhoenix.Battle.Combatant.formula_vars(actor, target || actor)

            log_text = (effects["log"] || "{name} unleashes #{limit.name}!")
                       |> String.replace("{name}", actor.name)

            result = %{result |
              log: ["💥 LIMIT BREAK: #{log_text}" | result.log],
              actions: [%{type: :limit_break, name: limit.name, icon: limit[:icon]} | result.actions]
            }

            # Damage
            {target, result} =
              if effects["damage"] && target do
                formula = get_in(effects, ["damage", "formula"]) || "ATK*4"
                damage = trunc(TePhoenix.Battle.Formula.evaluate(formula, vars))

                # Stance mods
                damage = if actor.stance == "POWER", do: trunc(damage * 1.4), else: damage
                damage = if actor.stance == "MAGIC" and get_in(effects, ["damage", "type"]) == "magic", do: trunc(damage * 1.4), else: damage
                damage = if target.stance == "GUARD", do: trunc(damage * 0.5), else: damage
                damage = max(1, damage)

                t = TePhoenix.Battle.Combatant.apply_damage(target, damage)
                r = %{result |
                  log: ["#{t.name} takes #{damage} damage!" | result.log],
                  actions: [%{type: :limit_damage, target: t.name, amount: damage} | result.actions]
                }
                {t, r}
              else
                {target, result}
              end

            # Heal
            {actor, result} =
              if effects["heal"] do
                formula = get_in(effects, ["heal", "formula"]) || "MHP*0.3"
                heal = trunc(TePhoenix.Battle.Formula.evaluate(formula, vars))
                a = TePhoenix.Battle.Combatant.apply_healing(actor, heal)
                {a, %{result | log: ["#{a.name} recovers #{heal} HP!" | result.log]}}
              else
                {actor, result}
              end

            # Death check
            {target, result} =
              if target && target.current_hp <= 0 do
                {target, %{result |
                  log: ["☠️ #{target.name} has been slain!" | result.log],
                  actions: [%{type: :death, target: target.name} | result.actions]
                }}
              else
                {target, result}
              end

            combatants = Map.put(state.combatants, actor.char_id, actor)
            combatants = if target, do: Map.put(combatants, target.char_id, target), else: combatants
            state = %{state | combatants: combatants}

            # Fire limit_break trigger
            lb_ctx = %{attacker: actor, victim: target, limit_name: limit.name}
            {state, result} = TePhoenix.Battle.Triggers.fire("limit_break_fired", state, lb_ctx, result)

            {state, result}
        end
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # OVERKILL / CHAIN / RATING
  # ══════════════════════════════════════════════════════════════════

  @doc "Calculate overkill multiplier for bonus drops"
  def overkill_multiplier(overkill_damage, settings) do
    if not settings[:enable_overkill_bonus] or overkill_damage <= 0 do
      1.0
    else
      cond do
        overkill_damage >= (settings[:overkill_threshold_large] || 200) -> settings[:overkill_mult_large] || 2.00
        overkill_damage >= (settings[:overkill_threshold_medium] || 100) -> settings[:overkill_mult_medium] || 1.50
        overkill_damage >= (settings[:overkill_threshold_small] || 50) -> settings[:overkill_mult_small] || 1.25
        true -> 1.0
      end
    end
  end

  @doc "Calculate battle rating (S/A/B/C) based on turn count"
  def battle_rating(turn_count, settings) do
    if not settings[:enable_battle_rating] do
      :c
    else
      target = settings[:rating_target_turns] || 8
      cond do
        turn_count <= target -> :s
        turn_count <= target * 1.5 -> :a
        turn_count <= target * 2.5 -> :b
        true -> :c
      end
    end
  end

  @doc "Get XP/gold multiplier for a battle rating"
  def rating_multiplier(rating, settings) do
    case rating do
      :s -> %{xp: settings[:rating_s_xp_mult] || 1.50, gold: settings[:rating_s_gold_mult] || 2.00}
      :a -> %{xp: settings[:rating_a_xp_mult] || 1.25, gold: settings[:rating_a_gold_mult] || 1.50}
      _ -> %{xp: 1.0, gold: 1.0}
    end
  end

  # ── DB helpers ──────────────────────────────────────────────────

  defp load_item(item_id) do
    Repo.one(from i in "game_items", where: i.id == ^item_id,
      select: %{id: i.id, name: i.name, icon: i.icon, effects: i.effects, type: i.type})
  rescue
    _ -> nil
  end

  defp load_limit_break(limit_id, actor) do
    _class_id = Map.get(actor, :class_id)
    query = from l in "game_limit_breaks",
      where: l.id == ^limit_id,
      select: %{id: l.id, name: l.name, icon: l.icon, effects: l.effects,
                break_level: l.break_level, char_level_req: l.char_level_req}

    Repo.one(query)
  rescue
    _ -> nil
  end

  defp consume_item(char_id, item_id) do
    try do
      Repo.query!("UPDATE character_items SET quantity=quantity-1 WHERE character_id=? AND item_id=? AND quantity>0", [char_id, item_id])
      Repo.query!("DELETE FROM character_items WHERE character_id=? AND item_id=? AND quantity<=0", [char_id, item_id])
    rescue
      _ -> nil
    end
  end

  defp parse_json(nil), do: %{}
  defp parse_json(str) when is_binary(str) do
    case Jason.decode(str) do
      {:ok, map} when is_map(map) -> map
      _ -> %{}
    end
  end
  defp parse_json(map) when is_map(map), do: map
  defp parse_json(_), do: %{}
end
