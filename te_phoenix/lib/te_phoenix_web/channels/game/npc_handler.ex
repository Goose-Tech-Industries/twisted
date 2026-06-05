defmodule TePhoenixWeb.Game.NpcHandler do
  @moduledoc """
  NPC interaction handlers: dialogue, menu choices, companions, training, sparring.
  Ported from socket-npc.js — all 12 events.
  """

  import Phoenix.Channel
  import Phoenix.Socket, only: [assign: 3]
  require Logger

  alias TePhoenix.Game.PlayerRegistry
  alias TePhoenix.{Repo, EventRunner}

  # ═══════════════════════════════════════════════════════════════════
  # NPC TALK — AI dialogue with memory/reputation
  # ═══════════════════════════════════════════════════════════════════

  def handle("npc_talk", %{"message" => message} = payload, socket) do
    char_id = socket.assigns[:char_id]
    p = PlayerRegistry.get(char_id)
    if is_nil(p), do: {:noreply, socket}

    # Throttle: 2s between NPC talks
    last_talk = socket.assigns[:last_npc_talk] || 0
    now = System.system_time(:millisecond)
    if now - last_talk < 2000, do: {:noreply, socket}

    socket = assign(socket, :last_npc_talk, now)

    # Sanitize message
    message = message |> to_string() |> String.trim() |> String.slice(0, 500)
    if message == "", do: {:noreply, socket}

    # Find the NPC — from talking_to assigns or by position
    npc = socket.assigns[:talking_to_npc]
    npc_name = if npc, do: npc["name"] || "Stranger", else: payload["npcName"] || "Stranger"

    # ── Alignment check: does this NPC refuse to talk to this character? ──
    npc_id = if npc, do: npc["id"], else: payload["npcId"]
    if npc_id do
      case TePhoenix.Game.Alignment.can_interact_npc?(char_id, npc_id) do
        {:refused, refuse_msg} ->
          push(socket, "npc_reply", %{npcName: npc_name, text: refuse_msg})
          {:noreply, socket}
        :ok -> :ok
      end
    end

    # Load NPC persona from DB if not cached
    persona = if npc, do: npc["persona"], else: nil
    persona = if is_nil(persona) do
      case Repo.query("SELECT persona FROM game_npcs WHERE name=? LIMIT 1", [npc_name]) do
        {:ok, %{rows: [[p]]}} -> p
        _ -> "A mysterious figure."
      end
    else
      persona
    end

    # Load persistent memory
    {facts, reputation} = load_npc_memory(char_id, npc_name)

    # Load player context for richer dialogue
    {player_level, player_title} = load_player_context(char_id, p.name)

    # Generate NPC reply (themed fallback — AI provider wired separately)
    reply = generate_npc_reply(npc_name, persona, p.name, player_title, message, facts, reputation, player_level)

    push(socket, "npc_reply", %{npcName: npc_name, text: reply})

    # Extract facts from conversation and update reputation
    new_facts = extract_conversation_facts(facts, message, npc_name, p.name)
    rep_delta = calculate_reputation_delta(message)
    new_rep = max(-100, min(100, reputation + rep_delta))

    upsert_npc_memory(char_id, npc_name, new_facts, new_rep)

    {:noreply, socket}
  end

  # ═══════════════════════════════════════════════════════════════════
  # ACCEPT NPC NEED — ambient task completion
  # ═══════════════════════════════════════════════════════════════════

  def handle("accept_npc_need", %{"npcId" => npc_id}, socket) do
    char_id = socket.assigns[:char_id]
    p = PlayerRegistry.get(char_id)
    if is_nil(p), do: {:noreply, socket}

    # Load NPC data
    case Repo.query("SELECT name, id FROM game_npcs WHERE id=?", [npc_id]) do
      {:ok, %{rows: [[npc_name, _npc_db_id]]}} ->
        # Award rewards (gold + XP from ambient tasks are small)
        reward_gold = 10 + :rand.uniform(20)
        reward_xp = 5 + :rand.uniform(15)

        try do
          if reward_gold > 0 do
            Repo.query!("UPDATE users SET currency=currency+? WHERE id=(SELECT user_id FROM characters WHERE id=?)",
              [reward_gold, char_id])
          end
          if reward_xp > 0 do
            Repo.query!("UPDATE characters SET experience=experience+? WHERE id=?", [reward_xp, char_id])
          end
        rescue _ -> nil
        end

        # Reputation boost
        {facts, rep} = load_npc_memory(char_id, npc_name)
        new_facts = (facts ++ ["Helped #{npc_name} with a small task"]) |> Enum.take(-10)
        upsert_npc_memory(char_id, npc_name, new_facts, min(100, rep + 8))

        # Faction rep boost
        update_faction_rep_for_npc(char_id, npc_id, 5)

        push(socket, "npc_need_resolved", %{
          npcName: npc_name, reward_gold: reward_gold, reward_xp: reward_xp,
          message: "*#{npc_name} thanks you.* \"You have my gratitude.\""
        })

      _ -> nil
    end

    {:noreply, socket}
  end

  # ═══════════════════════════════════════════════════════════════════
  # NPC MENU CHOICE — quest accept, shop, haggle, companion, talk
  # ═══════════════════════════════════════════════════════════════════

  def handle("npc_menu_choice", %{"choiceId" => choice_id}, socket) do
    char_id = socket.assigns[:char_id]
    p = PlayerRegistry.get(char_id)
    npc = socket.assigns[:talking_to_npc]
    if is_nil(p) or is_nil(npc), do: {:noreply, socket}

    npc_name = npc["name"] || "NPC"
    {facts, reputation} = load_npc_memory(char_id, npc_name)

    cond do
      String.starts_with?(choice_id, "quest_") ->
        quest_id = choice_id |> String.replace("quest_", "") |> parse_int()
        handle_quest_choice(socket, char_id, npc_name, quest_id, facts, reputation)

      String.starts_with?(choice_id, "shop_") ->
        shop_id = choice_id |> String.replace("shop_", "") |> parse_int()
        socket = assign(socket, :shop_discount, 0)
        push(socket, "event_queue", %{events: [%{cmd: "open_shop", shopId: shop_id}]})

      String.starts_with?(choice_id, "haggle_") ->
        shop_id = choice_id |> String.replace("haggle_", "") |> parse_int()
        discount = cond do
          reputation >= 60 -> 20
          reputation >= 40 -> 15
          reputation >= 20 -> 10
          true -> 0
        end

        if discount > 0 do
          socket = assign(socket, :shop_discount, discount)
          push(socket, "event_queue", %{events: [
            %{cmd: "dialogue", speaker: npc_name,
              text: "*#{npc_name} leans in.* \"For you? I'll knock #{discount}% off. Don't tell the others.\""},
            %{cmd: "open_shop", shopId: shop_id, discount: discount}
          ]})
        else
          push(socket, "event_queue", %{events: [
            %{cmd: "dialogue", speaker: npc_name,
              text: "\"Prices are prices. I don't make exceptions.\""}
          ]})
        end

      choice_id == "companion_recruit" ->
        handle_companion_recruit(socket, char_id, npc, npc_name, facts, reputation)

      choice_id == "companion_dismiss" ->
        handle_companion_dismiss(socket, char_id, npc, npc_name)

      choice_id == "companion_locked_rep" ->
        push(socket, "event_queue", %{events: [
          %{cmd: "dialogue", speaker: npc_name,
            text: "*#{npc_name} considers your request.* \"I don't know you well enough yet. Prove yourself to me first.\""}
        ]})

      choice_id == "companion_locked_quest" ->
        push(socket, "event_queue", %{events: [
          %{cmd: "dialogue", speaker: npc_name,
            text: "*#{npc_name} shakes their head.* \"There's something I need done first. Help me with that, and we'll talk.\""}
        ]})

      choice_id == "companion_full" ->
        push(socket, "event_queue", %{events: [
          %{cmd: "dialogue", speaker: npc_name,
            text: "*#{npc_name} glances at your companions.* \"Looks like your hands are full already. Come back if you make room.\""}
        ]})

      choice_id == "talk" ->
        push(socket, "event_queue", %{events: [%{cmd: "npc_talk_prompt", npcName: npc_name}]})

      choice_id == "farewell" ->
        farewell = if reputation > 50,
          do: "*#{npc_name} waves warmly.* \"Safe travels, friend.\"",
          else: "\"Watch yourself out there.\""
        push(socket, "event_queue", %{events: [%{cmd: "dialogue", speaker: npc_name, text: farewell}]})

      true -> nil
    end

    {:noreply, socket}
  end

  # ═══════════════════════════════════════════════════════════════════
  # COMPANION MANAGEMENT
  # ═══════════════════════════════════════════════════════════════════

  def handle("companion_set_tactics", %{"npcId" => npc_id, "tactics" => tactics}, socket) do
    char_id = socket.assigns[:char_id]
    valid = ~w(AGGRESSIVE BALANCED DEFENSIVE SUPPORT)
    if tactics not in valid, do: {:noreply, socket}

    try do
      Repo.query!("UPDATE character_companions SET tactics=? WHERE character_id=? AND npc_id=? AND is_active=1",
        [tactics, char_id, npc_id])
    rescue _ -> nil
    end

    push(socket, "companion_tactics_changed", %{npcId: npc_id, tactics: tactics})
    {:noreply, socket}
  end

  def handle("companion_dismiss", %{"npcId" => npc_id}, socket) do
    char_id = socket.assigns[:char_id]

    try do
      Repo.query!("UPDATE character_companions SET is_active=0 WHERE character_id=? AND npc_id=?", [char_id, npc_id])
    rescue _ -> nil
    end

    push(socket, "companion_dismissed", %{npcId: npc_id})
    {:noreply, socket}
  end

  def handle("companion_get_affinity", %{"npcId" => npc_id}, socket) do
    char_id = socket.assigns[:char_id]

    try do
      # Get companion affinity
      {affinity, _level} = case Repo.query(
        "SELECT affinity, affinity_level FROM character_companions WHERE character_id=? AND npc_id=?",
        [char_id, npc_id]
      ) do
        {:ok, %{rows: [[a, l]]}} -> {a || 0, l || 0}
        _ -> {0, 0}
      end

      # Get tiers
      tiers = case Repo.query("SELECT name, affinity_required FROM game_companion_affinity_tiers ORDER BY affinity_required ASC") do
        {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
        _ -> []
      end

      current_tier = tiers
        |> Enum.filter(fn t -> affinity >= (t["affinity_required"] || 0) end)
        |> List.last()

      tier_name = if current_tier, do: current_tier["name"], else: "Stranger"
      next_tier = tiers |> Enum.find(fn t -> (t["affinity_required"] || 0) > affinity end)

      # Get companion quests
      quests = case Repo.query(
        "SELECT cq.id, cq.title, cq.description, cq.affinity_required, cq.prerequisite_quest_id, COALESCE(p.status, 'locked') as status FROM game_companion_quests cq LEFT JOIN character_companion_quest_progress p ON p.companion_quest_id=cq.id AND p.character_id=? WHERE cq.npc_id=? AND cq.is_active=1 ORDER BY cq.quest_order ASC",
        [char_id, npc_id]
      ) do
        {:ok, %{rows: rows, columns: cols}} ->
          Enum.map(rows, fn row ->
            q = Enum.zip(cols, row) |> Map.new()
            # Check availability for locked quests
            if q["status"] == "locked" do
              affinity_met = affinity >= (q["affinity_required"] || 0)
              if affinity_met, do: Map.put(q, "status", "available"), else: q
            else
              q
            end
          end)
        _ -> []
      end

      push(socket, "companion_affinity", %{
        npcId: npc_id, affinity: affinity, tierName: tier_name,
        nextTier: next_tier, quests: quests
      })
    rescue
      _ -> push(socket, "companion_affinity", %{npcId: npc_id, affinity: 0, tierName: "Stranger", quests: []})
    end

    {:noreply, socket}
  end

  def handle("companion_quest_accept", %{"questId" => quest_id, "npcId" => npc_id}, socket) do
    char_id = socket.assigns[:char_id]

    try do
      case Repo.query("SELECT title, npc_id, affinity_required, prerequisite_quest_id FROM game_companion_quests WHERE id=? AND is_active=1", [quest_id]) do
        {:ok, %{rows: [[title, q_npc_id, aff_req, prereq_id]]}} ->
          # Check affinity
          {affinity, _} = case Repo.query("SELECT affinity FROM character_companions WHERE character_id=? AND npc_id=?", [char_id, q_npc_id]) do
            {:ok, %{rows: [[a]]}} -> {a || 0, nil}
            _ -> {0, nil}
          end

          cond do
            affinity < (aff_req || 0) ->
              push(socket, "companion_quest_result", %{success: false, message: "Not enough affinity", npcId: q_npc_id})

            prereq_id != nil ->
              case Repo.query("SELECT status FROM character_companion_quest_progress WHERE character_id=? AND companion_quest_id=?", [char_id, prereq_id]) do
                {:ok, %{rows: [["completed"]]}} ->
                  accept_companion_quest(socket, char_id, quest_id, title, q_npc_id)
                _ ->
                  push(socket, "companion_quest_result", %{success: false, message: "Complete the previous quest first", npcId: q_npc_id})
              end

            true ->
              accept_companion_quest(socket, char_id, quest_id, title, q_npc_id)
          end

        _ ->
          push(socket, "companion_quest_result", %{success: false, message: "Quest not found", npcId: npc_id})
      end
    rescue
      e -> push(socket, "companion_quest_result", %{success: false, message: Exception.message(e), npcId: npc_id})
    end

    {:noreply, socket}
  end

  # ═══════════════════════════════════════════════════════════════════
  # EVENT CHOICE — map event option selection
  # ═══════════════════════════════════════════════════════════════════

  def handle("event_choice", %{"optionId" => option_id}, socket) do
    char_id = socket.assigns[:char_id]

    case socket.assigns[:pending_event_choice] do
      nil -> {:noreply, socket}
      %{pending: pending, char_state: char_state} ->
        case EventRunner.resume(pending, option_id, char_id, char_state) do
          {:ok, responses} ->
            Enum.each(responses, fn r -> push(socket, "event_action", r) end)
          {:halted, responses, new_pending} ->
            Enum.each(responses, fn r -> push(socket, "event_action", r) end)
            socket = assign(socket, :pending_event_choice, %{pending: new_pending, char_state: char_state})
            {:noreply, socket}
          _ -> nil
        end

        socket = assign(socket, :pending_event_choice, nil)
        {:noreply, socket}
    end
  end

  # ═══════════════════════════════════════════════════════════════════
  # TRAINING
  # ═══════════════════════════════════════════════════════════════════

  def handle("master_train", %{"npcId" => npc_id}, socket) do
    char_id = socket.assigns[:char_id]

    # Training under an NPC master — look up master config
    result = try do
      case Repo.query("SELECT name, train_stat, train_amount, train_cost FROM game_npcs WHERE id=? AND is_trainer=1", [npc_id]) do
        {:ok, %{rows: [[name, stat, amount, cost]]}} ->
          # Check gold
          required_cost = cost || 0
          case Repo.query("SELECT currency FROM users WHERE id=(SELECT user_id FROM characters WHERE id=?)", [char_id]) do
            {:ok, %{rows: [[currency]]}} when currency >= required_cost ->
              if cost > 0 do
                Repo.query!("UPDATE users SET currency=currency-? WHERE id=(SELECT user_id FROM characters WHERE id=?)", [cost, char_id])
              end

              gain = amount || 1
              safe_stat = if stat in ~w(atk def mo md speed luck max_hp max_mp), do: stat, else: "atk"
              Repo.query!("UPDATE characters SET #{safe_stat}=#{safe_stat}+? WHERE id=?", [gain, char_id])

              Repo.query("INSERT INTO character_training_log (character_id, training_type, stat_gains_json) VALUES (?,?,?)",
                [char_id, "master_#{npc_id}", Jason.encode!(%{safe_stat => gain})])

              %{success: true, message: "Trained with #{name}! +#{gain} #{safe_stat}", stat: safe_stat, gain: gain}

            _ -> %{success: false, message: "Not enough gold. Need #{cost}."}
          end

        _ -> %{success: false, message: "This NPC is not a trainer."}
      end
    rescue
      e -> %{success: false, message: Exception.message(e)}
    end

    push(socket, "master_train_result", result)
    {:noreply, socket}
  end

  def handle("train", %{"trainingType" => training_type}, socket) do
    char_id = socket.assigns[:char_id]

    result = try do
      case Repo.query("SELECT * FROM game_training_config WHERE name=? AND active=1", [training_type || "self_train"]) do
        {:ok, %{rows: [row], columns: cols}} ->
          cfg = Enum.zip(cols, row) |> Map.new()

          # Check race/class restrictions
          case Repo.query("SELECT race_id, class_id FROM characters WHERE id=?", [char_id]) do
            {:ok, %{rows: [[race_id, class_id]]}} ->
              allowed_races = parse_json(cfg["allowed_race_ids"], nil)
              allowed_classes = parse_json(cfg["allowed_class_ids"], nil)

              cond do
                allowed_races && race_id not in allowed_races ->
                  %{success: false, message: "Your race cannot use this training method."}

                allowed_classes && class_id not in allowed_classes ->
                  %{success: false, message: "Your class cannot use this training method."}

                cfg["requires_partner"] == 1 ->
                  %{success: false, message: "This requires a sparring partner."}

                cfg["requires_master"] == 1 ->
                  %{success: false, message: "This requires an NPC master."}

                true ->
                  # Check daily limit
                  daily_limit = cfg["daily_limit"] || 999
                  case Repo.query(
                    "SELECT COUNT(*) FROM character_training_log WHERE character_id=? AND training_type=? AND DATE(trained_at)=CURDATE()",
                    [char_id, training_type]
                  ) do
                    {:ok, %{rows: [[count]]}} when count >= daily_limit ->
                      %{success: false, message: "Daily limit reached (#{daily_limit}/day)."}

                    _ ->
                      # Apply gains
                      gains = parse_json(cfg["stat_gains"], %{})
                      costs = parse_json(cfg["stat_costs"], %{})

                      actual_gains = apply_training_stats(char_id, gains, costs)

                      Repo.query("INSERT INTO character_training_log (character_id, training_type, stat_gains_json) VALUES (?,?,?)",
                        [char_id, training_type, Jason.encode!(actual_gains)])

                      %{success: true, type: training_type, gains: actual_gains, label: cfg["label"]}
                  end
              end

            _ -> %{success: false, message: "Character not found."}
          end

        _ -> %{success: false, message: "This training type is not available."}
      end
    rescue
      e -> %{success: false, message: Exception.message(e)}
    end

    push(socket, "train_result", result)
    {:noreply, socket}
  end

  # ═══════════════════════════════════════════════════════════════════
  # HYPERBOLIC TIME CHAMBER
  # ═══════════════════════════════════════════════════════════════════

  def handle("htc_enter", _payload, socket) do
    char_id = socket.assigns[:char_id]
    player = PlayerRegistry.get(char_id)

    if is_nil(player) do
      {:noreply, socket}
    else
      case TePhoenix.Game.HTCSession.enter(char_id, player.map_id) do
        {:ok, session} ->
          push(socket, "htc_entered", %{
            max_seconds: session.max_seconds,
            time_dilation: session.time_dilation,
            gravity_mult: session.gravity_mult,
            training_interval: session.training_interval,
          })
          push(socket, "chat_msg", %{
            channel: "system", from: "System",
            text: "You enter the Hyperbolic Time Chamber. Gravity: #{session.gravity_mult}x. Time flows #{session.time_dilation}x faster here.",
            ts: System.system_time(:millisecond),
          })

        {:error, reason} ->
          push(socket, "htc_error", %{reason: reason})
      end

      {:noreply, socket}
    end
  end

  def handle("htc_leave", _payload, socket) do
    char_id = socket.assigns[:char_id]

    case TePhoenix.Game.HTCSession.leave(char_id) do
      {:ok, summary} ->
        push(socket, "htc_left", %{summary: summary})
        push(socket, "chat_msg", %{
          channel: "system", from: "System",
          text: "You exit the Hyperbolic Time Chamber. #{summary.in_game_hours} in-game hours passed (#{div(summary.real_seconds, 60)} real minutes). Training ticks: #{summary.training_ticks}.",
          ts: System.system_time(:millisecond),
        })

      {:error, reason} ->
        push(socket, "htc_error", %{reason: reason})
    end

    {:noreply, socket}
  end

  def handle("htc_train", %{"type" => training_type}, socket) do
    char_id = socket.assigns[:char_id]

    case TePhoenix.Game.HTCSession.active_train(char_id, training_type) do
      {:ok, gains} ->
        push(socket, "htc_train_result", %{success: true, gains: gains, type: training_type})

      {:error, reason} ->
        push(socket, "htc_train_result", %{success: false, message: reason})
    end

    {:noreply, socket}
  end

  def handle("htc_status", _payload, socket) do
    char_id = socket.assigns[:char_id]

    case TePhoenix.Game.HTCSession.get_session(char_id) do
      nil ->
        push(socket, "htc_status", %{inside: false})

      session ->
        push(socket, "htc_status", %{
          inside: true,
          elapsed_seconds: session.elapsed_seconds,
          remaining_seconds: session.remaining_seconds,
          in_game_hours: session.in_game_hours,
          total_ticks: session.total_ticks,
          total_gains: session.total_gains,
          gravity_mult: session.gravity_mult,
          time_dilation: session.time_dilation,
        })
    end

    {:noreply, socket}
  end

  # ═══════════════════════════════════════════════════════════════════
  # SPARRING
  # ═══════════════════════════════════════════════════════════════════

  def handle("spar_request", %{"targetCharId" => target_char_id}, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p), do: {:noreply, socket}

    target = PlayerRegistry.get(target_char_id)
    if is_nil(target) do
      push(socket, "spar_error", %{reason: "Player not found or offline."})
    else
      TePhoenixWeb.Endpoint.broadcast!("user:#{target_char_id}", "spar_requested", %{
        fromName: p.name, fromCharId: p.char_id
      })
      push(socket, "spar_sent", %{targetName: target.name})
    end

    {:noreply, socket}
  end

  def handle("spar_accept", %{"fromCharId" => from_char_id}, socket) do
    char_id = socket.assigns[:char_id]
    p = PlayerRegistry.get(char_id)
    if is_nil(p), do: {:noreply, socket}

    try do
      case Repo.query("SELECT * FROM game_training_config WHERE name='spar' AND active=1") do
        {:ok, %{rows: [row], columns: cols}} ->
          cfg = Enum.zip(cols, row) |> Map.new()
          gains = parse_json(cfg["stat_gains"], %{})
          costs = parse_json(cfg["stat_costs"], %{})

          # Apply to both players
          for cid <- [char_id, from_char_id] do
            actual_gains = apply_training_stats(cid, gains, costs)
            partner_id = if cid == char_id, do: from_char_id, else: char_id
            Repo.query("INSERT INTO character_training_log (character_id, training_type, partner_char_id, stat_gains_json) VALUES (?,?,?,?)",
              [cid, "spar", partner_id, Jason.encode!(actual_gains)])
          end

          # Notify both
          from = PlayerRegistry.get(from_char_id)
          push(socket, "train_result", %{success: true, type: "spar", partner: from && from.name || "Partner"})
          TePhoenixWeb.Endpoint.broadcast!("user:#{from_char_id}", "train_result", %{
            success: true, type: "spar", partner: p.name
          })

        _ ->
          push(socket, "train_result", %{success: false, message: "Sparring not configured."})
      end
    rescue
      e -> push(socket, "train_result", %{success: false, message: Exception.message(e)})
    end

    {:noreply, socket}
  end

  def handle(_, _, socket), do: {:noreply, socket}

  # ═══════════════════════════════════════════════════════════════════
  # PRIVATE HELPERS
  # ═══════════════════════════════════════════════════════════════════

  defp load_npc_memory(char_id, npc_name) do
    case Repo.query("SELECT facts_json, reputation FROM npc_memories WHERE char_id=? AND npc_name=?", [char_id, npc_name]) do
      {:ok, %{rows: [[facts_json, rep]]}} ->
        facts = parse_json(facts_json, [])
        {facts, rep || 0}
      _ -> {[], 0}
    end
  end

  defp upsert_npc_memory(char_id, npc_name, facts, reputation) do
    rep = max(-100, min(100, reputation))
    try do
      Repo.query!(
        "INSERT INTO npc_memories (char_id, npc_name, facts_json, reputation) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE facts_json=VALUES(facts_json), reputation=VALUES(reputation), last_seen=CURRENT_TIMESTAMP",
        [char_id, npc_name, Jason.encode!(facts), rep]
      )
    rescue _ -> nil
    end
  end

  defp load_player_context(char_id, _name) do
    level = case Repo.query("SELECT level FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[l]]}} -> l || 1
      _ -> 1
    end

    title = derive_title(char_id)
    {level, title}
  end

  defp derive_title(char_id) do
    try do
      rep = case Repo.query("SELECT AVG(reputation) FROM npc_memories WHERE char_id=?", [char_id]) do
        {:ok, %{rows: [[r]]}} -> r || 0; _ -> 0
      end

      rumors = case Repo.query("SELECT COUNT(*) FROM npc_rumors WHERE char_id=? AND spread_count > 0", [char_id]) do
        {:ok, %{rows: [[c]]}} -> c || 0; _ -> 0
      end

      {level, wins} = case Repo.query("SELECT level, battle_record FROM characters WHERE id=?", [char_id]) do
        {:ok, %{rows: [[l, br]]}} ->
          w = case Jason.decode(to_string(br || "{\"W\":0}")) do
            {:ok, %{"W" => w}} -> w; _ -> 0
          end
          {l || 1, w}
        _ -> {1, 0}
      end

      cond do
        rep >= 70 and rumors >= 3 -> "the Renowned"
        rep >= 50 and level >= 10 -> "the Trusted"
        wins >= 20 -> "the Proven"
        rep >= 40 -> "the Welcomed"
        rep <= -60 and rumors >= 2 -> "the Feared"
        rep <= -40 -> "the Distrusted"
        level >= 20 -> "the Veteran"
        true -> nil
      end
    rescue
      _ -> nil
    end
  end

  defp generate_npc_reply(npc_name, persona, player_name, title, message, facts, reputation, _level) do
    # Themed fallback dialogue generator — uses persona keywords + reputation + context
    address = if title, do: "#{player_name} #{title}", else: player_name
    persona_lower = String.downcase(persona || "")
    msg_lower = String.downcase(message)

    is_merchant = String.contains?(persona_lower, "merchant") or String.contains?(persona_lower, "shop") or String.contains?(persona_lower, "trade")
    is_guard = String.contains?(persona_lower, "guard") or String.contains?(persona_lower, "soldier") or String.contains?(persona_lower, "patrol")
    is_elder = String.contains?(persona_lower, "elder") or String.contains?(persona_lower, "wise") or String.contains?(persona_lower, "sage")

    cond do
      String.contains?(msg_lower, "quest") or String.contains?(msg_lower, "task") ->
        if reputation > 30 do
          "*#{npc_name} nods thoughtfully.* \"I might have something for you, #{address}. There's been trouble lately...\""
        else
          "*#{npc_name} looks doubtful.* \"I barely know you. Why would I trust you with important work?\""
        end

      String.contains?(msg_lower, "help") ->
        "*#{npc_name} studies you.* \"Help? #{if reputation > 20, do: "I suppose I could use a hand.", else: "What's in it for you?"}\""

      String.contains?(msg_lower, "buy") or String.contains?(msg_lower, "sell") or String.contains?(msg_lower, "shop") ->
        if is_merchant do
          "*#{npc_name} gestures to their wares.* \"Take a look. #{if reputation > 40, do: "I might have something special for a regular like you.", else: "Fair prices, I promise."}\""
        else
          "\"I'm no merchant, #{address}. Try the market district.\""
        end

      String.contains?(msg_lower, "danger") or String.contains?(msg_lower, "monster") or String.contains?(msg_lower, "enemy") ->
        if is_guard do
          "*#{npc_name} grips their weapon.* \"Aye, the roads aren't safe. Creatures from the north have been growing bolder.\""
        else
          "*#{npc_name} glances around nervously.* \"Keep your voice down. There are things out there best not spoken of.\""
        end

      String.contains?(msg_lower, "lore") or String.contains?(msg_lower, "history") or String.contains?(msg_lower, "story") ->
        if is_elder do
          "*#{npc_name}'s eyes light up.* \"Ah, a seeker of knowledge! Sit, and I'll tell you of the old times...\""
        else
          "\"I'm no historian, but I've heard tales. Ask the elders if you want the real stories.\""
        end

      String.contains?(msg_lower, "hello") or String.contains?(msg_lower, "hi") or String.contains?(msg_lower, "greet") ->
        cond do
          reputation > 50 -> "*#{npc_name} smiles warmly.* \"#{address}! Always good to see a friendly face.\""
          reputation < -20 -> "*#{npc_name} narrows their eyes.* \"...#{player_name}. What do you want?\""
          true -> "*#{npc_name} nods.* \"Well met, traveler.\""
        end

      facts != [] and :rand.uniform(3) == 1 ->
        last_fact = List.last(facts)
        "*#{npc_name} recalls something.* \"I remember — #{last_fact}. #{if reputation > 30, do: "Good times.", else: "Interesting times."}\""

      true ->
        responses = [
          "*#{npc_name} considers your words carefully.* \"Hmm. #{if reputation > 20, do: "You make a fair point.", else: "I'll think on that."}\"\n",
          "\"Is that so?\" *#{npc_name} #{if reputation > 30, do: "smiles", else: "frowns"}.* \"Tell me more.\"",
          "*#{npc_name} #{if is_guard, do: "stands at attention", else: "leans back"}.* \"Life here isn't what it used to be, #{address}.\"",
        ]
        Enum.random(responses)
    end
  end

  defp extract_conversation_facts(existing_facts, message, _npc_name, player_name) do
    # Simple fact extraction from conversation
    new_fact = cond do
      String.contains?(String.downcase(message), "quest") -> "#{player_name} asked about quests"
      String.contains?(String.downcase(message), "help") -> "#{player_name} offered help"
      String.contains?(String.downcase(message), "threat") -> "#{player_name} made threats"
      String.contains?(String.downcase(message), "thank") -> "#{player_name} showed gratitude"
      String.length(message) > 50 -> "#{player_name} had a long conversation"
      true -> nil
    end

    facts = if new_fact, do: existing_facts ++ [new_fact], else: existing_facts
    Enum.take(facts, -10)
  end

  defp calculate_reputation_delta(message) do
    msg = String.downcase(message)
    cond do
      String.contains?(msg, "thank") or String.contains?(msg, "appreciate") or String.contains?(msg, "grateful") -> 3
      String.contains?(msg, "help") or String.contains?(msg, "friend") -> 2
      String.contains?(msg, "please") -> 1
      String.contains?(msg, "threat") or String.contains?(msg, "kill") or String.contains?(msg, "die") -> -5
      String.contains?(msg, "hate") or String.contains?(msg, "stupid") or String.contains?(msg, "ugly") -> -3
      true -> 0
    end
  end

  defp handle_quest_choice(socket, char_id, npc_name, quest_id, facts, reputation) do
    char_state = load_char_state(char_id)

    case Repo.query("SELECT name, objectives_json FROM game_quests WHERE id=?", [quest_id]) do
      {:ok, %{rows: [[quest_name, objectives_json]]}} ->
        active_quests = get_in(char_state, ["quests", "active"]) || %{}
        quest_key = to_string(quest_id)

        if Map.has_key?(active_quests, quest_key) do
          # Check-in on existing quest
          steps = parse_json(objectives_json, [])
          step = get_in(active_quests, [quest_key, "step"]) || 0
          obj = Enum.at(steps, step)
          text = if obj, do: "\"You're making progress. #{obj["description"] || "Keep going."}\"",
            else: "\"I think you've done what I asked. Let me reward you.\""
          push(socket, "event_queue", %{events: [%{cmd: "dialogue", speaker: npc_name, text: text}]})
        else
          # Start new quest
          quests = char_state["quests"] || %{}
          active = Map.get(quests, "active", %{})
          active = Map.put(active, quest_key, %{"step" => 0, "started" => System.system_time(:millisecond)})
          new_state = put_in(char_state, ["quests", Access.key("active", %{})], active)

          try do
            Repo.query!("UPDATE characters SET state_json=? WHERE id=?", [Jason.encode!(new_state), char_id])
          rescue _ -> nil
          end

          steps = parse_json(objectives_json, [])
          first_step = List.first(steps)
          accept_msg = if first_step,
            do: "\"Good. Here's what I need: #{first_step["description"]}\"",
            else: "\"The task is yours. Don't disappoint me.\""

          push(socket, "event_queue", %{events: [
            %{cmd: "dialogue", speaker: npc_name, text: accept_msg},
            %{cmd: "notification", text: "📜 Quest Started: #{quest_name}", type: "quest"}
          ]})

          upsert_npc_memory(char_id, npc_name, facts, min(100, reputation + 5))
        end

      _ -> nil
    end
  end

  defp handle_companion_recruit(socket, char_id, npc, npc_name, facts, reputation) do
    npc_id = npc["id"]

    try do
      Repo.query!(
        "INSERT INTO character_companions (character_id, npc_id, is_active, tactics) VALUES (?,?,1,'BALANCED') ON DUPLICATE KEY UPDATE is_active=1, recruited_at=NOW()",
        [char_id, npc_id]
      )

      push(socket, "event_queue", %{events: [
        %{cmd: "dialogue", speaker: npc_name,
          text: "*#{npc_name} nods firmly.* \"I'll fight by your side. Lead the way.\""},
        %{cmd: "notification", text: "⚔️ #{npc_name} joined your party!", type: "info"}
      ]})

      upsert_npc_memory(char_id, npc_name, facts, min(100, reputation + 10))
    rescue
      _ -> push(socket, "notification", %{type: "error", message: "Failed to recruit companion."})
    end
  end

  defp handle_companion_dismiss(socket, char_id, npc, npc_name) do
    try do
      Repo.query!("UPDATE character_companions SET is_active=0 WHERE character_id=? AND npc_id=?", [char_id, npc["id"]])
      push(socket, "companion_dismissed", %{npcId: npc["id"]})
      push(socket, "event_queue", %{events: [
        %{cmd: "dialogue", speaker: npc_name,
          text: "*#{npc_name} steps back.* \"I'll be here if you need me again.\""}
      ]})
    rescue _ -> nil
    end
  end

  defp accept_companion_quest(socket, char_id, quest_id, title, npc_id) do
    try do
      Repo.query!(
        "INSERT INTO character_companion_quest_progress (character_id, companion_quest_id, status, started_at) VALUES (?,?,'active',NOW()) ON DUPLICATE KEY UPDATE status='active', started_at=NOW()",
        [char_id, quest_id]
      )
      push(socket, "companion_quest_result", %{success: true, message: "Quest accepted: #{title}", npcId: npc_id})
    rescue
      e -> push(socket, "companion_quest_result", %{success: false, message: Exception.message(e), npcId: npc_id})
    end
  end

  defp update_faction_rep_for_npc(char_id, npc_id, delta) do
    # Get NPC's faction
    case Repo.query(
      "SELECT f.id, f.rival_id FROM factions f JOIN npc_factions nf ON nf.faction_id=f.id WHERE nf.npc_id=? LIMIT 1",
      [npc_id]
    ) do
      {:ok, %{rows: [[faction_id, rival_id]]}} ->
        clamped = max(-100, min(100, delta))
        try do
          Repo.query!(
            "INSERT INTO player_faction_rep (char_id, faction_id, reputation) VALUES (?,?,?) ON DUPLICATE KEY UPDATE reputation=GREATEST(-100, LEAST(100, reputation+?))",
            [char_id, faction_id, clamped, delta]
          )
          # Rival faction gets opposite effect at 50%
          if rival_id do
            rival_delta = round(-delta * 0.5)
            if rival_delta != 0 do
              Repo.query!(
                "INSERT INTO player_faction_rep (char_id, faction_id, reputation) VALUES (?,?,?) ON DUPLICATE KEY UPDATE reputation=GREATEST(-100, LEAST(100, reputation+?))",
                [char_id, rival_id, max(-100, min(100, rival_delta)), rival_delta]
              )
            end
          end
        rescue _ -> nil
        end
      _ -> nil
    end
  end

  defp apply_training_stats(char_id, gains, costs) do
    valid_stats = ~w(atk def mo md speed luck max_hp max_mp current_hp current_mp)

    actual_gains = Enum.reduce(gains, %{}, fn {stat, pct}, acc ->
      if stat in valid_stats do
        base = case Repo.query("SELECT #{stat} FROM characters WHERE id=?", [char_id]) do
          {:ok, %{rows: [[v]]}} -> v || 100
          _ -> 100
        end
        gain = max(1, trunc(base * pct))
        try do
          Repo.query!("UPDATE characters SET #{stat}=#{stat}+? WHERE id=?", [gain, char_id])
        rescue _ -> nil
        end
        Map.put(acc, stat, gain)
      else
        acc
      end
    end)

    # Apply costs
    Enum.each(costs, fn {stat, pct} ->
      if stat in valid_stats do
        base = case Repo.query("SELECT #{stat} FROM characters WHERE id=?", [char_id]) do
          {:ok, %{rows: [[v]]}} -> v || 100; _ -> 100
        end
        loss = max(1, trunc(base * pct))
        try do
          Repo.query!("UPDATE characters SET #{stat}=GREATEST(1,#{stat}-?) WHERE id=?", [loss, char_id])
        rescue _ -> nil
        end
      end
    end)

    actual_gains
  end

  defp load_char_state(char_id) do
    case Repo.query("SELECT state_json FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[json]]}} -> parse_json(json, %{})
      _ -> %{}
    end
  end

  defp parse_int(val) when is_integer(val), do: val
  defp parse_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp parse_int(_), do: 0

  defp parse_json(nil, d), do: d
  defp parse_json("", d), do: d
  defp parse_json(v, d) when is_binary(v) do
    case Jason.decode(v) do
      {:ok, p} -> p
      _ -> d
    end
  end
  defp parse_json(v, _) when is_map(v) or is_list(v), do: v
  defp parse_json(_, d), do: d
end
