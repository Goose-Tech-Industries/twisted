defmodule TePhoenixWeb.Battle.CombatOptionsHandler do
  @moduledoc """
  Handles negotiation, non-lethal toggle, defense stance, limb targeting,
  KO actions, and PvP KO choices.
  Ported from socket-battle.js sessions 6c and 8.
  """

  import Phoenix.Channel
  require Logger

  alias TePhoenix.Battle.State
  alias TePhoenix.Repo

  # ── Battle Negotiate (NPC or Player) ────────────────────────────

  def handle("battle_negotiate", %{"battle_id" => battle_id, "target_char_id" => target_char_id}, socket) do
    char_id = socket.assigns[:char_id]
    battle_id = to_int(battle_id)
    target_char_id = to_int(target_char_id)

    with true <- State.alive?(battle_id),
         state <- State.get_state(battle_id),
         true <- state.status == :active,
         %{} = actor <- Map.get(state.combatants, char_id),
         %{} = target <- Map.get(state.combatants, target_char_id),
         true <- state.turn_char_id == char_id || push_error(socket, "Not your turn.") do

      # Range check (talking distance = 3 tiles)
      if actor.grid_x && target.grid_x do
        dist = State.chebyshev(actor, target)
        if dist > 3 do
          push(socket, "battle_error", %{reason: "Too far to negotiate. Move closer (dist #{dist}, need ≤3)."})
          {:noreply, socket}
        else
          do_negotiate(socket, battle_id, state, actor, target, char_id, target_char_id)
        end
      else
        do_negotiate(socket, battle_id, state, actor, target, char_id, target_char_id)
      end
    else
      _ -> {:noreply, socket}
    end
  end

  # ── Negotiate Response (player accepts/declines alliance) ───────

  def handle("negotiate_respond", %{"battle_id" => battle_id, "from_char_id" => from_char_id, "accept" => accept}, socket) do
    char_id = socket.assigns[:char_id]
    char_name = socket.assigns[:char_name] || "Unknown"
    battle_id = to_int(battle_id)

    with true <- State.alive?(battle_id),
         state <- State.get_state(battle_id),
         %{} = _responder <- Map.get(state.combatants, char_id),
         %{} = proposer <- Map.get(state.combatants, to_int(from_char_id)) do

      if accept do
        proposer_team = get_team_id(state, to_int(from_char_id))
        State.switch_team(battle_id, char_id, proposer_team)

        State.add_log(battle_id, %{
          actor: "system",
          text: "🤝 #{char_name} accepts the alliance with #{proposer.name}!"
        })

        broadcast!(socket, "action_result", %{
          result: %{
            actor: "system",
            actions: [%{type: "alliance_shift", from: char_name, to_team: proposer_team}],
            log: ["🤝 #{char_name} accepts the alliance with #{proposer.name}!"]
          }
        })
      else
        State.add_log(battle_id, %{
          actor: "system",
          text: "❌ #{char_name} declines the alliance."
        })

        broadcast!(socket, "action_result", %{
          result: %{
            actor: "system",
            actions: [],
            log: ["❌ #{char_name} declines the alliance."]
          }
        })
      end
    end

    {:noreply, socket}
  end

  # ── Toggle Non-Lethal Mode ─────────────────────────────────────

  def handle("battle_toggle_nonlethal", %{"battle_id" => battle_id}, socket) do
    char_id = socket.assigns[:char_id]
    battle_id = to_int(battle_id)

    if State.alive?(battle_id) do
      State.update_combatant(battle_id, char_id, fn c ->
        non_lethal = !Map.get(c, :non_lethal, false)
        %{c | non_lethal: non_lethal}
      end)

      combatant = State.get_combatant(battle_id, char_id)
      non_lethal = Map.get(combatant, :non_lethal, false)

      push(socket, "battle_nonlethal_toggled", %{
        char_id: char_id,
        non_lethal: non_lethal
      })
    end

    {:noreply, socket}
  end

  # ── Set Defense Stance ──────────────────────────────────────────

  def handle("battle_set_defense", %{"battle_id" => battle_id, "defense" => defense}, socket)
      when defense in ["dodge", "block", "counter"] do
    char_id = socket.assigns[:char_id]
    battle_id = to_int(battle_id)

    if State.alive?(battle_id) do
      State.update_combatant(battle_id, char_id, fn c ->
        %{c | default_defense: defense}
      end)

      push(socket, "battle_defense_set", %{char_id: char_id, defense: defense})
    end

    {:noreply, socket}
  end

  # ── Set Limb Target ────────────────────────────────────────────

  def handle("battle_limb_target", %{"battle_id" => battle_id, "limb_key" => limb_key}, socket) do
    char_id = socket.assigns[:char_id]
    battle_id = to_int(battle_id)

    valid_limbs = ~w(head torso left_arm right_arm left_leg right_leg)

    if limb_key in valid_limbs and State.alive?(battle_id) do
      State.update_combatant(battle_id, char_id, fn c ->
        %{c | target_limb: limb_key}
      end)

      push(socket, "battle_limb_target_set", %{char_id: char_id, limb_key: limb_key})
    end

    {:noreply, socket}
  end

  # ── Post-Battle KO Action (NPC) ────────────────────────────────

  def handle("battle_ko_action", %{"battle_id" => battle_id, "npc_char_id" => npc_char_id, "action" => action}, socket) do
    char_id = socket.assigns[:char_id]
    battle_id = to_int(battle_id)

    result = process_ko_action(battle_id, char_id, to_int(npc_char_id), action)
    push(socket, "battle_ko_result", result)
    {:noreply, socket}
  end

  # ── PvP KO Choice (spare/finish) ───────────────────────────────

  def handle("battle_pvp_ko_choice", %{"battle_id" => battle_id, "target_char_id" => target_char_id, "spare" => spare}, socket) do
    char_id = socket.assigns[:char_id]
    battle_id = to_int(battle_id)

    result = process_pvp_ko_choice(battle_id, char_id, to_int(target_char_id), spare)
    push(socket, "battle_pvp_ko_result", result)
    {:noreply, socket}
  end

  # ══════════════════════════════════════════════════════════════════
  # PRIVATE
  # ══════════════════════════════════════════════════════════════════

  defp load_npc_persona(char_id, default_name) do
    case Repo.query("SELECT persona, name FROM game_npcs WHERE char_id=? LIMIT 1", [char_id]) do
      {:ok, %{rows: [[persona, name]]}} ->
        {name || default_name, persona || "A hostile creature."}
      _ ->
        {default_name, "A hostile creature."}
    end
  end

  defp process_ko_action(battle_id, actor_id, npc_char_id, action) do
    with true <- State.alive?(battle_id),
         state <- State.get_state(battle_id),
         %{} = target <- Map.get(state.combatants, npc_char_id),
         true <- target.knocked_out or target.current_hp <= 0 do

      case action do
        "spare" ->
          State.add_log(battle_id, %{actor: "system", text: "The enemy is spared."})
          %{success: true, action: "spare", message: "You spare #{target.name}."}

        "execute" ->
          State.update_combatant(battle_id, npc_char_id, fn c ->
            %{c | current_hp: 0, knocked_out: true}
          end)
          State.add_log(battle_id, %{actor: "system", text: "#{target.name} is finished off."})
          %{success: true, action: "execute", message: "#{target.name} has been slain."}

        "capture" ->
          # Record capture in DB for companion/bestiary system
          try do
            Repo.query!(
              "INSERT INTO character_companions (character_id, companion_npc_id, captured_at, is_active) SELECT ?, gn.id, NOW(), 0 FROM game_npcs gn WHERE gn.char_id=? AND gn.is_recruitable=1 LIMIT 1",
              [actor_id, npc_char_id]
            )
          rescue
            _ -> nil
          end
          # Mark the NPC as captured in battle log
          State.add_log(battle_id, %{actor: "system", text: "#{target.name} has been captured!"})
          %{success: true, action: "capture", message: "#{target.name} has been captured!"}

        _ ->
          %{success: false, message: "Unknown KO action."}
      end
    else
      _ -> %{success: false, message: "Invalid target or battle."}
    end
  end

  defp process_pvp_ko_choice(battle_id, _actor_id, target_char_id, spare) do
    with true <- State.alive?(battle_id),
         state <- State.get_state(battle_id),
         %{} = target <- Map.get(state.combatants, target_char_id),
         true <- target.knocked_out or target.current_hp <= 0 do

      if spare do
        State.add_log(battle_id, %{actor: "system", text: "#{target.name} is spared!"})
        %{success: true, spared: true, message: "You spare #{target.name}."}
      else
        State.update_combatant(battle_id, target_char_id, fn c ->
          %{c | current_hp: 0}
        end)
        State.add_log(battle_id, %{actor: "system", text: "#{target.name} is finished off!"})
        %{success: true, spared: false, message: "#{target.name} has been defeated."}
      end
    else
      _ -> %{success: false, message: "Invalid target or battle."}
    end
  end

  defp generate_negotiation_dialogue(npc_name, persona, actor_name, hp_pct, willingness, success) do
    # Use persona to flavor the dialogue. Pick from templates based on persona keywords + state.
    persona_lower = String.downcase(persona || "")

    is_proud = String.contains?(persona_lower, "proud") or String.contains?(persona_lower, "noble") or String.contains?(persona_lower, "honor")
    is_cowardly = String.contains?(persona_lower, "coward") or String.contains?(persona_lower, "timid") or String.contains?(persona_lower, "afraid")
    is_feral = String.contains?(persona_lower, "beast") or String.contains?(persona_lower, "feral") or String.contains?(persona_lower, "wild") or String.contains?(persona_lower, "creature")
    is_cunning = String.contains?(persona_lower, "cunning") or String.contains?(persona_lower, "clever") or String.contains?(persona_lower, "sly") or String.contains?(persona_lower, "thief")

    cond do
      success and is_cowardly ->
        "*#{npc_name} drops their weapon and trembles* \"P-please! I'll do whatever you say, #{actor_name}! Just don't hurt me anymore!\""

      success and is_proud and hp_pct < 20 ->
        "*#{npc_name} kneels, bleeding heavily* \"You... have bested me. My blade is yours, #{actor_name}. I will not beg — but I will serve.\""

      success and is_cunning ->
        "*#{npc_name} smirks despite their wounds* \"Alright, alright... you win this round, #{actor_name}. I know when the odds have shifted. Let's be... partners.\""

      success and is_feral ->
        "*#{npc_name} growls low but lowers their stance* The creature seems to recognize #{actor_name}'s dominance. It falls in step beside you."

      success and hp_pct < 30 ->
        "*#{npc_name} clutches their wounds* \"Enough... I yield. You've proven your strength, #{actor_name}. I'll fight alongside you.\""

      success and willingness > 75 ->
        "*#{npc_name} considers for a moment, then nods* \"This battle is lost for my side. I'd rather live — lead the way, #{actor_name}.\""

      success ->
        "*#{npc_name} lowers their weapon reluctantly* \"...Fine. I'll fight with you, #{actor_name}. But don't think this makes us friends.\""

      not success and is_proud ->
        "*#{npc_name} stands tall despite their injuries* \"I would sooner die than betray my allies. Do your worst, #{actor_name}!\""

      not success and is_cowardly and hp_pct > 50 ->
        "*#{npc_name} hides behind their shield* \"N-no! My master would punish me far worse than you ever could!\""

      not success and is_feral ->
        "*#{npc_name} bares their teeth and snarls* The creature shows no understanding of #{actor_name}'s words — only aggression."

      not success and is_cunning ->
        "*#{npc_name} laughs* \"Nice try, #{actor_name}. You'll have to do better than words to defeat me.\""

      not success and willingness < 15 ->
        "*#{npc_name} spits at #{actor_name}'s feet* \"Pathetic. You think a few scratches will make me turn? I'd rather die fighting!\""

      not success ->
        "*#{npc_name} snarls defiantly* \"You think I'd betray my own? Never! Come, #{actor_name} — finish what you started!\""
    end
  end

  defp get_team_id(state, char_id) do
    Enum.find_value(state.teams, nil, fn {team_id, members} ->
      if char_id in members, do: team_id
    end)
  end

  defp push_error(socket, msg) do
    push(socket, "battle_error", %{reason: msg})
    false
  end

  defp do_negotiate(socket, battle_id, state, actor, target, char_id, target_char_id) do
    if target.is_ai do
      hp_pct = if target.max_hp > 0, do: round(target.current_hp / target.max_hp * 100), else: 100

      # Willingness factors: low HP, actor's luck, level difference, morale
      hp_factor = max(0, 100 - hp_pct)
      luck_bonus = min(20, (Map.get(actor, :luck, 0) || 0))
      level_diff = max(0, (Map.get(actor, :level, 1) || 1) - (Map.get(target, :level, 1) || 1)) * 3
      morale_penalty = if (Map.get(target, :morale, 100) || 100) < 30, do: 20, else: 0
      willingness = min(95, max(5, hp_factor + luck_bonus + level_diff + morale_penalty))
      success = willingness >= 45

      {npc_name, persona} = load_npc_persona(target.char_id, target.name)

      dialogue = generate_negotiation_dialogue(npc_name, persona, actor.name, hp_pct, willingness, success)

      if success do
        actor_team_id = get_team_id(state, char_id)
        State.switch_team(battle_id, target_char_id, actor_team_id)
      end

      State.add_log(battle_id, %{
        actor: actor.name,
        text: "🤝 Negotiation with #{npc_name}: #{if success, do: "SUCCESS", else: "FAILED"} (willingness: #{willingness}%)"
      })

      broadcast!(socket, "action_result", %{
        result: %{
          actor: actor.name,
          actions: [%{type: "negotiate", target: npc_name, success: success, willingness: willingness}],
          log: ["🤝 #{actor.name} attempts to negotiate with #{npc_name}..."]
        }
      })

      push(socket, "negotiate_result", %{
        success: success, willingness: willingness, target_name: npc_name,
        dialogue: dialogue, target_char_id: target_char_id
      })

      State.next_turn(battle_id)
    else
      TePhoenixWeb.Endpoint.broadcast!(
        "user:#{target_char_id}", "negotiate_request",
        %{from_name: actor.name, from_char_id: char_id,
          to_team_id: get_team_id(state, char_id), battle_id: battle_id}
      )

      push(socket, "negotiate_result", %{
        success: nil, target_name: target.name,
        dialogue: "Waiting for #{target.name} to respond...",
        target_char_id: target_char_id, pending: true
      })

      State.add_log(battle_id, %{
        actor: actor.name,
        text: "🤝 #{actor.name} proposes an alliance to #{target.name}..."
      })

      broadcast!(socket, "action_result", %{
        result: %{actor: actor.name, actions: [],
          log: ["🤝 #{actor.name} proposes an alliance to #{target.name}..."]}
      })
    end

    {:noreply, socket}
  end

  defp to_int(val) when is_integer(val), do: val
  defp to_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp to_int(_), do: 0
end
