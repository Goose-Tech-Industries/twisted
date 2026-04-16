defmodule TePhoenix.Battle.Combat do
  @moduledoc """
  Core battle action resolution — the heart of the combat system.
  Ported from te/battle/combat.js executeBattleAction.

  Every player action flows through execute/5:
    Status checks → Combo input → Stance → Ki/Stealth/Transform/Summon →
    Skill (with charge) → Signature Tech → Item → Limit Break → Command
  """

  require Logger
  alias TePhoenix.Battle.{Combatant, Damage, Systems, Narrative, Loot}
  alias TePhoenix.Repo

  import Ecto.Query

  @type action_opts :: %{
    optional(:command_id) => integer(),
    optional(:skill_id) => integer(),
    optional(:item_id) => integer(),
    optional(:limit_id) => integer(),
    optional(:target_limb) => String.t(),
    optional(:flavor_text) => String.t(),
    optional(:sig_tech_id) => integer(),
    optional(:combo_input) => list(),
    optional(:action_timing) => float()
  }

  @type action_result :: %{
    actor: String.t(),
    actions: list(map()),
    log: list(String.t())
  }

  @doc """
  Execute a battle action. This is the core resolver — all combat flows through here.
  Returns {updated_battle_state, action_result}.
  """
  def execute(state, actor_id, target_id, opts \\ %{}) do
    actor = Map.get(state.combatants, actor_id)
    target = if target_id, do: Map.get(state.combatants, target_id)
    result = %{actor: actor.name, actions: [], log: []}

    cond do
      actor == nil ->
        {state, %{result | log: ["Actor not found"]}}

      # Unconscious: death save instead of acting (tabletop mode)
      actor.unconscious ->
        resolve_death_save(state, actor, result)

      # Check status effects that prevent action
      true ->
        case check_status_prevention(state, actor, result) do
          {:prevented, result} ->
            {state, result}

          {:ok, actor, result} ->
            # Dispatch to the appropriate action handler
            resolve_action(state, actor, target, opts, result)
        end
    end
  end

  # ── Death save (tabletop unconscious) ───────────────────────────

  defp resolve_death_save(state, actor, result) do
    roll = :rand.uniform(20)

    {actor, save_result, message} =
      cond do
        roll == 20 ->
          {%{actor | unconscious: false, current_hp: 1}, :revive,
           "#{actor.name} rolls a natural 20! They spring back to consciousness with 1 HP!"}

        roll >= 10 ->
          {actor, :success, "#{actor.name} rolls #{roll} — death save success."}

        roll == 1 ->
          {%{actor | unconscious: false, current_hp: 0, knocked_out: true}, :death,
           "#{actor.name} rolls a natural 1 — critical failure. #{actor.name} has died."}

        true ->
          {actor, :failure, "#{actor.name} rolls #{roll} — death save failure."}
      end

    result = %{result |
      log: [message | result.log],
      actions: [%{type: :death_save, target: actor.name, roll: roll, result: save_result} | result.actions]
    }

    state = %{state | combatants: Map.put(state.combatants, actor.char_id, actor)}

    {state, result}
  end

  # ── Status prevention checks ────────────────────────────────────

  defp check_status_prevention(_state, actor, result) do
    # Status modifiers — single source of truth.
    #
    # `prevent_action` (stun, sleep, freeze, …) halts the turn entirely.
    # `miss_chance_bonus` (blind) accumulates onto the actor's miss roll.
    # Legacy `skip_turn` / `skip_chance` / `miss_chance` keys on the raw
    # status.effects map are also honored for backward compatibility
    # with any authored statuses still using the old schema.
    mods = TePhoenix.Battle.StatusEffects.compute_modifiers(actor)

    if mods.prevent_action do
      preventing = Enum.find(actor.statuses || [], fn s ->
        Map.get(s[:effects] || %{}, "prevent_action") == true
      end)

      label = (preventing && preventing[:name]) || "a status effect"
      msg = "#{actor.name} is incapacitated by #{label} and cannot act!"
      {:prevented, %{result | log: [msg | result.log]}}
    else
      legacy_miss =
        (actor.statuses || [])
        |> Enum.reduce(0, fn s, acc ->
          acc + (Map.get(s[:effects] || %{}, "miss_chance", 0))
        end)

      skip_chance =
        (actor.statuses || [])
        |> Enum.reduce(0, fn s, acc ->
          max(acc, Map.get(s[:effects] || %{}, "skip_chance", 0))
        end)

      if skip_chance > 0 and :rand.uniform(100) <= skip_chance do
        {:prevented, %{result | log: ["#{actor.name} is paralysed and cannot move!" | result.log]}}
      else
        total_miss = trunc(mods.miss_chance_bonus * 100) + legacy_miss
        {:ok, %{actor | miss_chance: total_miss}, result}
      end
    end
  end

  # Command-gate: block skills flagged as magic when prevent_magic is
  # set, and block any command whose key is listed in disabled_commands.
  defp command_blocked_reason(actor, kind, command_key) do
    mods = TePhoenix.Battle.StatusEffects.compute_modifiers(actor)

    cond do
      kind == :magic and mods.prevent_magic ->
        "#{actor.name} is silenced and cannot cast magic!"

      command_key && MapSet.member?(mods.disabled_commands, to_string(command_key)) ->
        "#{actor.name} cannot use #{command_key} right now!"

      true ->
        nil
    end
  end

  # ── Action dispatch ─────────────────────────────────────────────

  defp resolve_action(state, actor, target, opts, result) do
    settings = state.settings

    cond do
      # Combo input (Legaia-style directional combos)
      opts[:combo_input] && settings[:enable_combo_input] ->
        resolve_combo_input(state, actor, target, opts[:combo_input], result)

      # Command-based actions
      opts[:command_id] ->
        resolve_command(state, actor, target, opts, result)

      # Skill (with charge support)
      opts[:skill_id] ->
        resolve_skill_action(state, actor, target, opts, result)

      # Signature technique
      opts[:sig_tech_id] && settings[:enable_signature_techs] ->
        resolve_sig_tech(state, actor, target, opts[:sig_tech_id], result)

      # Item
      opts[:item_id] ->
        resolve_item(state, actor, target, opts[:item_id], result)

      # Limit break
      opts[:limit_id] ->
        resolve_limit_break(state, actor, target, opts, result)

      # Default: basic attack (command_id 1)
      true ->
        resolve_command(state, actor, target, %{opts | command_id: 1}, result)
    end
  end

  # ── Command resolution ──────────────────────────────────────────

  defp resolve_command(state, actor, target, opts, result) do
    command_id = opts[:command_id] || 1

    case load_command(command_id) do
      nil ->
        {state, %{result | log: ["#{actor.name} hesitates..." | result.log]}}

      command ->
        effects = parse_json(command.effects, %{})

        # Disabled-commands gate — a status (silence, shocked, bound…)
        # may forbid specific commands by key / name / slug.
        case command_blocked_reason(actor, :command, command.name) do
          nil -> resolve_command_dispatch(state, actor, target, command, effects, opts, result)
          reason -> {state, %{result | log: [reason | result.log]}}
        end
    end
  end

  defp resolve_command_dispatch(state, actor, target, command, effects, opts, result) do
    cond do
          # Stance toggle
          Map.has_key?(effects, "stance") ->
            resolve_stance(state, actor, effects["stance"], result)

          # Ki channeling
          Map.get(effects, "ki_channel", false) ->
            resolve_ki_channel(state, actor, result)

          # Stealth
          Map.get(effects, "stealth", false) ->
            resolve_stealth(state, actor, result)

          # Transform
          Map.get(effects, "transform", false) ->
            resolve_transform(state, actor, result)

          # Summon
          Map.get(effects, "summon", false) ->
            resolve_summon(state, actor, result)

          # Shove (BG3-style)
          Map.get(effects, "shove", false) ->
            resolve_shove(state, actor, target, result)

          # Dip weapon in surface element (BG3-style)
          Map.get(effects, "dip_weapon", false) ->
            resolve_dip_weapon(state, actor, result)

          # RP commands (Taunt, Intimidate, Rally)
          Map.has_key?(effects, "rp_command") ->
            resolve_rp_command(state, actor, target, effects, result)

          # Steal
          Map.get(effects, "steal", false) ->
            resolve_steal(state, actor, target, result)

          # Open menu (client-side, shouldn't reach server)
          Map.has_key?(effects, "open_menu") ->
            {state, %{result | log: ["#{actor.name} opens #{effects["open_menu"]} menu." | result.log]}}

          # Flee
          Map.has_key?(effects, "flee") ->
            resolve_flee(state, actor, target, effects["flee"], result)

          # Defend (set_status)
          Map.has_key?(effects, "set_status") ->
            resolve_defend(state, actor, target, effects, command.name, result)

          # Attack (damage command)
          Map.has_key?(effects, "damage") ->
            Damage.resolve(state, actor, target, effects, command.name, result, opts)

          # No recognized effect
          true ->
            {state, %{result | log: ["#{actor.name} does nothing." | result.log]}}
        end
  end

  # ── Stance toggle ───────────────────────────────────────────────

  defp resolve_stance(state, actor, stance_name, result) do
    {new_stance, message} =
      if actor.stance == stance_name do
        {nil, "#{actor.name} drops their stance."}
      else
        msg =
          case stance_name do
            "POWER" -> "⚔️ #{actor.name} enters Power Stance! ATK x1.4 this round."
            "GUARD" -> "🛡️ #{actor.name} enters Guard Stance! Incoming damage halved."
            "MAGIC" -> "✨ #{actor.name} enters Magic Stance! MO x1.4 & MP costs reduced."
            _ -> "#{actor.name} takes a new stance."
          end
        {stance_name, msg}
      end

    actor = %{actor | stance: new_stance}
    state = %{state | combatants: Map.put(state.combatants, actor.char_id, actor)}

    result = %{result |
      log: [message | result.log],
      actions: [%{type: :stance, stance: new_stance, actor: actor.name} | result.actions]
    }

    {state, result}
  end

  # ── Ki channeling ───────────────────────────────────────────────

  defp resolve_ki_channel(state, actor, result) do
    settings = state.settings
    max_uses = settings[:ki_channel_uses_per_battle] || 1
    duration = settings[:ki_channel_duration] || 5

    cond do
      actor.ki_uses_this_battle >= max_uses ->
        {state, %{result | log: ["#{actor.name} has already used Ki Channeling this battle." | result.log]}}

      actor.ki_active ->
        {state, %{result | log: ["#{actor.name} is already channeling Ki." | result.log]}}

      true ->
        actor = %{actor |
          ki_active: true,
          ki_turns_left: duration,
          ki_uses_this_battle: actor.ki_uses_this_battle + 1
        }
        state = %{state | combatants: Map.put(state.combatants, actor.char_id, actor)}

        message = "🔮 #{actor.name} channels their Ki! Power surges for #{duration} turns."
        result = %{result |
          log: [message | result.log],
          actions: [%{type: :ki_channel, actor: actor.name, duration: duration} | result.actions]
        }
        {state, result}
    end
  end

  # ── Stealth ─────────────────────────────────────────────────────

  defp resolve_stealth(state, actor, result) do
    if state.settings[:enable_stealth] do
      actor = %{actor | stealth_active: true}
      state = %{state | combatants: Map.put(state.combatants, actor.char_id, actor)}

      message = "🥷 #{actor.name} vanishes into the shadows!"
      result = %{result |
        log: [message | result.log],
        actions: [%{type: :stealth, actor: actor.name} | result.actions]
      }
      {state, result}
    else
      {state, %{result | log: ["Stealth is not enabled." | result.log]}}
    end
  end

  # ── Transform ───────────────────────────────────────────────────

  defp resolve_transform(state, actor, result) do
    if state.settings[:enable_transformations] do
      # Load character's transformation data from DB
      case load_transformation(actor.char_id) do
        nil ->
          {state, %{result | log: ["#{actor.name} has no transformation available." | result.log]}}

        transform ->
          actor = %{actor |
            transform_active: true,
            transform_data: transform,
            transform_turns_left: Map.get(transform, "duration", 5),
            atk: actor.atk + Map.get(transform, "atk_bonus", 0),
            def: actor.def + Map.get(transform, "def_bonus", 0),
            speed: actor.speed + Map.get(transform, "speed_bonus", 0)
          }
          state = %{state | combatants: Map.put(state.combatants, actor.char_id, actor)}

          name = Map.get(transform, "name", "unknown form")
          message = "🔥 #{actor.name} transforms into #{name}!"
          result = %{result |
            log: [message | result.log],
            actions: [%{type: :transform, actor: actor.name, form: name} | result.actions]
          }
          {state, result}
      end
    else
      {state, %{result | log: ["Transformations are not enabled." | result.log]}}
    end
  end

  # ── Shove (BG3-style) ──────────────────────────────────────────

  defp resolve_shove(state, _actor, nil, result) do
    {state, %{result | log: ["Select a target to shove!" | result.log]}}
  end

  defp resolve_shove(state, actor, target, result) do
    shove_chance = min(90, 40 + actor.atk - target.def)

    if :rand.uniform(100) <= shove_chance and target.grid_x != nil do
      dx = sign(target.grid_x - actor.grid_x)
      dy = sign(target.grid_y - actor.grid_y)
      new_x = clamp(target.grid_x + (if dx == 0, do: 1, else: dx), 0, state.grid_w - 1)
      new_y = clamp(target.grid_y + dy, 0, state.grid_h - 1)

      target = %{target | grid_x: new_x, grid_y: new_y}
      log = ["💪 #{actor.name} shoves #{target.name}!"]
      actions = [%{type: :shove, actor: actor.name, target: target.name, x: new_x, y: new_y}]

      # Check terrain at landing position
      terrain_key = "#{new_x},#{new_y}"
      {target, log} =
        case Map.get(state.terrain_map, terrain_key) do
          "fire" ->
            fire_dmg = 10
            t = Combatant.apply_damage(target, fire_dmg)
            {t, ["🔥 #{target.name} is shoved into fire for #{fire_dmg} damage!" | log]}

          "water" ->
            {target, ["🌊 #{target.name} is soaked!" | log]}

          _ ->
            {target, log}
        end

      state = %{state | combatants: Map.put(state.combatants, target.char_id, target)}
      result = %{result | log: Enum.reverse(log) ++ result.log, actions: actions ++ result.actions}
      {state, result}
    else
      {state, %{result | log: ["#{target.name} resists the shove!" | result.log]}}
    end
  end

  # ── Dip weapon in surface (BG3-style) ──────────────────────────

  defp resolve_dip_weapon(state, actor, result) do
    terrain_key = "#{actor.grid_x},#{actor.grid_y}"
    surface = Map.get(state.terrain_map, terrain_key)

    if surface in [nil, "open"] do
      {state, %{result | log: ["No surface to dip weapon in." | result.log]}}
    else
      element_map = %{
        "fire" => "fire", "poison" => "poison", "ice" => "ice",
        "water" => "water", "oil" => "fire", "acid" => "acid"
      }
      element = Map.get(element_map, surface, surface)

      actor = %{actor | dipped_element: element, dipped_turns: 3}
      state = %{state | combatants: Map.put(state.combatants, actor.char_id, actor)}

      message = "#{actor.name} dips their weapon in #{surface}! Attacks deal bonus #{element} damage for 3 turns."
      result = %{result |
        log: [message | result.log],
        actions: [%{type: :dip_weapon, actor: actor.name, element: element, surface: surface} | result.actions]
      }
      {state, result}
    end
  end

  # ── Flee ────────────────────────────────────────────────────────

  defp resolve_flee(state, actor, _target, flee_config, result) do
    base_chance = if is_number(flee_config), do: flee_config, else: 50
    speed_bonus = div(actor.speed, 5)
    chance = min(95, base_chance + speed_bonus)

    if :rand.uniform(100) <= chance do
      actor = %{actor | current_hp: 0, knocked_out: true}
      state = %{state | combatants: Map.put(state.combatants, actor.char_id, actor)}

      result = %{result |
        log: ["🏃 #{actor.name} flees the battle!" | result.log],
        actions: [%{type: :flee, actor: actor.name, success: true} | result.actions]
      }
      {state, result}
    else
      result = %{result |
        log: ["#{actor.name} tries to flee but can't escape!" | result.log],
        actions: [%{type: :flee, actor: actor.name, success: false} | result.actions]
      }
      {state, result}
    end
  end

  # ── Defend ──────────────────────────────────────────────────────

  defp resolve_defend(state, actor, _target, effects, _action_name, result) do
    status_id = effects["set_status"]

    actor = %{actor | stance: "GUARD"}
    state = %{state | combatants: Map.put(state.combatants, actor.char_id, actor)}

    message = "🛡️ #{actor.name} takes a defensive stance."
    result = %{result |
      log: [message | result.log],
      actions: [%{type: :defend, actor: actor.name, status_id: status_id} | result.actions]
    }
    {state, result}
  end

  # ── Stub resolvers (to be expanded in later sessions) ───────────

  defp resolve_combo_input(state, actor, target, combo, result) do
    Systems.resolve_combo_input(state, actor, target, combo, result)
  end

  defp resolve_skill_action(state, actor, target, opts, result) do
    skill_id = opts[:skill_id]

    case load_skill(skill_id) do
      nil ->
        {state, %{result | log: ["#{actor.name} tries to use an unknown skill." | result.log]}}

      skill ->
        effects = parse_json(skill.effects, %{})

        # Status gate: silence / disabled command blocks.
        kind = if Map.get(effects, "magic") == true or Map.get(effects, "cost_type") == "mp", do: :magic, else: :physical

        # Cooldown gate: skills with active cooldown can't be used.
        settings = state.settings
        cd_remaining = Map.get(actor.cooldowns || %{}, skill_id, 0)
        on_cooldown? = (settings[:enable_cooldowns] || false) and cd_remaining > 0

        cond do
          on_cooldown? ->
            {state, %{result | log: ["#{actor.name}'s #{skill.name} is on cooldown! (#{cd_remaining} turns)" | result.log]}}

          (reason = command_blocked_reason(actor, kind, skill.name)) != nil ->
            {state, %{result | log: [reason | result.log]}}

          true ->
            resolve_skill_after_gate(state, actor, target, skill, effects, opts, result)
        end
    end
  end

  defp resolve_skill_after_gate(state, actor, target, skill, effects, opts, result) do
    skill_id = skill.id

    if Map.get(effects, "charge_turns") && !actor.charging_fire do
      charge_turns = effects["charge_turns"]
      skill_name = skill.name

      actor = %{actor | charging: %{skill_id: skill_id, turns_left: charge_turns - 1, skill_name: skill_name}}
      state = %{state | combatants: Map.put(state.combatants, actor.char_id, actor)}

      charge_msg =
        (Map.get(effects, "charge_message", "{name} begins charging {skill}!"))
        |> String.replace("{name}", actor.name)
        |> String.replace("{skill}", skill_name)

      result = %{result |
        log: ["⚡ #{charge_msg}" | result.log],
        actions: [%{type: :charge_start, actor: actor.name, skill: skill_name} | result.actions]
      }
      {state, result}
    else
      {state, result} = Damage.resolve_skill(state, actor, target, skill, effects, result, opts)

      # Apply cooldown after the skill fires. The cooldown_turns value
      # lives on the skill row (DB-driven, editable from AdminSauce).
      # A value of 0 or nil means no cooldown.
      cd_turns = Map.get(effects, "cooldown_turns", 0) |> to_int()
      state =
        if cd_turns > 0 and (state.settings[:enable_cooldowns] || false) do
          actor = Map.get(state.combatants, actor.char_id, actor)
          actor = %{actor | cooldowns: Map.put(actor.cooldowns || %{}, skill_id, cd_turns)}
          put_in(state.combatants[actor.char_id], actor)
        else
          state
        end

      {state, result}
    end
  end

  defp to_int(v) when is_integer(v), do: v
  defp to_int(v) when is_binary(v), do: case(Integer.parse(v), do: ({i, _} -> i; _ -> 0))
  defp to_int(_), do: 0

  defp resolve_sig_tech(state, actor, target, sig_tech_id, result) do
    # Load sig tech data from actor's equipped techs
    sig_techs = Map.get(actor, :signature_techs, [])
    case Enum.find(sig_techs, fn t -> t[:tech_id] == sig_tech_id end) do
      nil ->
        {state, %{result | log: ["#{actor.name} tries to use an unknown technique..." | result.log]}}
      tech ->
        Narrative.resolve_signature_tech(state, actor, target, tech, result)
    end
  end

  defp resolve_item(state, actor, target, item_id, result) do
    Loot.resolve_item(state, actor, target, item_id, result)
  end

  defp resolve_limit_break(state, actor, target, opts, result) do
    Loot.resolve_limit_break(state, actor, target, opts[:limit_id], result, opts[:target_limb])
  end

  defp resolve_rp_command(state, actor, target, effects, result) do
    rp_type = effects["rp_command"]
    Narrative.resolve_rp_command(state, actor, target, rp_type, effects, result)
  end

  defp resolve_steal(state, _actor, nil, result) do
    {state, %{result | log: ["Select a target to steal from!" | result.log]}}
  end

  defp resolve_steal(state, actor, target, result) do
    Loot.resolve_steal(state, actor, target, result)
  end

  defp resolve_summon(state, actor, result) do
    # Summon: load NPC from DB, add as combatant to actor's team
    settings = state.settings
    if not settings[:enable_summons] do
      {state, %{result | log: ["Summons are not enabled." | result.log]}}
    else
      max_summons = settings[:max_summons_per_player] || 1
      existing = state.combatants |> Map.values() |> Enum.count(fn c -> c.summoner_id == actor.char_id end)

      if existing >= max_summons do
        {state, %{result | log: ["#{actor.name} already has the maximum number of summons!" | result.log]}}
      else
        # MP cost
        cost_pct = settings[:summon_mp_cost_pct] || 0.20
        mp_cost = max(1, trunc(actor.max_mp * cost_pct))

        case Combatant.spend_mp(actor, mp_cost) do
          {:error, :insufficient_mp} ->
            {state, %{result | log: ["Not enough MP to summon!" | result.log]}}

          {:ok, actor} ->
            duration = settings[:summon_base_duration] || 3
            state = %{state | combatants: Map.put(state.combatants, actor.char_id, actor)}

            result = %{result |
              log: ["✨ #{actor.name} summons an ally! (#{duration} turns, cost #{mp_cost} MP)" | result.log],
              actions: [%{type: :summon, actor: actor.name, duration: duration} | result.actions]
            }
            {state, result}
        end
      end
    end
  end

  # ── DB loaders ──────────────────────────────────────────────────

  defp load_command(id) do
    Repo.one(from c in "game_battle_commands", where: c.id == ^id,
      select: %{id: c.id, name: c.name, effects: c.effects})
  rescue
    e -> Logger.error("load_command(#{id}) failed: #{inspect(e)}"); nil
  end

  defp load_skill(id) do
    Repo.one(from s in "game_skills", where: s.id == ^id,
      select: %{id: s.id, name: s.name, effects: s.effects, mp_cost: s.mp_cost})
  rescue
    e -> Logger.error("load_skill(#{id}) failed: #{inspect(e)}"); nil
  end

  defp load_transformation(char_id) do
    case Repo.one(from t in "game_transformations",
           where: t.character_id == ^char_id and t.unlocked == true,
           select: %{name: t.name, duration: t.duration, atk_bonus: t.atk_bonus,
                     def_bonus: t.def_bonus, speed_bonus: t.speed_bonus},
           limit: 1) do
      nil -> nil
      t -> t
    end
  rescue
    e -> Logger.error("load_transformation(#{char_id}) failed: #{inspect(e)}"); nil
  end

  # ── Helpers ─────────────────────────────────────────────────────

  defp parse_json(nil, default), do: default
  defp parse_json(str, default) when is_binary(str) do
    case Jason.decode(str) do
      {:ok, map} -> map
      _ -> default
    end
  end
  defp parse_json(map, _default) when is_map(map), do: map

  defp sign(0), do: 0
  defp sign(n) when n > 0, do: 1
  defp sign(n) when n < 0, do: -1

  defp clamp(val, min_val, max_val), do: max(min_val, min(max_val, val))
end
