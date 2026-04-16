defmodule TePhoenixWeb.Game.DmHandler do
  @moduledoc """
  DM (Dungeon Master) campaign system — AI DM sessions, admin DM controls,
  persistent campaigns, character sheets, session logging.
  Ported from socket-game.js DM sections.
  """

  import Phoenix.Channel
  require Logger

  alias TePhoenix.Game.{PlayerRegistry, MapData}
  alias TePhoenix.Repo

  @staff_roles ~w(ADMIN GM MOD STAFF OWNER)

  # DM sessions stored in ETS for cross-process access
  # Initialized lazily
  defp dm_table do
    case :ets.whereis(:dm_sessions) do
      :undefined -> :ets.new(:dm_sessions, [:named_table, :public, :set]); :dm_sessions
      _ -> :dm_sessions
    end
  end

  defp get_session(id) do
    case :ets.lookup(dm_table(), id) do
      [{_, session}] -> session
      [] -> nil
    end
  end

  defp put_session(id, session), do: :ets.insert(dm_table(), {id, session})
  defp delete_session(id), do: :ets.delete(dm_table(), id)

  # ── AI DM Action ────────────────────────────────────────────────

  def handle("dm_action", %{"action" => action} = payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p), do: {:noreply, socket}

    session_id = payload["sessionId"] || p.char_id
    session = get_session(session_id) || create_dm_session(session_id, p)

    # ── Technique Discovery: scan for RP patterns ──
    ruleset = TePhoenix.Game.ActionSlots.get_ruleset(session_id)
    discovery_events = TePhoenix.Battle.TechniqueDiscovery.check_action(
      socket.assigns[:char_id], action,
      campaign_id: session_id,
      ruleset_id: ruleset && ruleset["id"]
    )

    # AI response (placeholder — calls AI when available, falls back to generic)
    response = generate_dm_response(action, session)

    if response do
      history = session.history ++ [%{speaker: p.name, text: action}, %{speaker: "DM", text: response}]
      history = if length(history) > 50, do: Enum.drop(history, 2), else: history
      put_session(session_id, %{session | history: history})

      TePhoenixWeb.Endpoint.broadcast!("dm:#{session_id}", "dm_response", %{
        speaker: "DM", text: response, sessionId: session_id
      })

      # Send discovery milestone messages
      Enum.each(discovery_events, fn {_type, message} ->
        TePhoenixWeb.Endpoint.broadcast!("dm:#{session_id}", "dm_response", %{
          speaker: "System", text: message, sessionId: session_id
        })
      end)
    else
      push(socket, "notification", %{type: "error", message: "DM mode unavailable."})
    end

    {:noreply, socket}
  end

  # ── Crystallize Discovery (player names their technique) ────
  def handle("dm_crystallize_technique", %{"themeTag" => theme_tag, "name" => name} = payload, socket) do
    char_id = socket.assigns[:char_id]
    icon = payload["icon"] || "⚡"

    case TePhoenix.Battle.TechniqueDiscovery.crystallize(char_id, theme_tag, %{name: name, icon: icon}) do
      {:ok, tech_id} ->
        push(socket, "notification", %{type: "success", message: "#{name} has been forged! A unique technique, born from your actions."})
        push(socket, "technique_learned", %{techniqueId: tech_id, name: name, icon: icon})

        # Announce in session
        session_id = payload["sessionId"]
        if session_id do
          p = PlayerRegistry.get(char_id)
          TePhoenixWeb.Endpoint.broadcast!("dm:#{session_id}", "dm_response", %{
            speaker: "System",
            text: "#{p && p.name || "A warrior"} has created a new technique: **#{name}**!",
            sessionId: session_id
          })
        end

      {:error, reason} ->
        push(socket, "notification", %{type: "error", message: reason})
    end

    {:noreply, socket}
  end

  # ── Get current discoveries ────
  def handle("dm_get_discoveries", _payload, socket) do
    discoveries = TePhoenix.Battle.TechniqueDiscovery.get_discoveries(socket.assigns[:char_id])
    push(socket, "technique_discoveries", %{discoveries: discoveries})
    {:noreply, socket}
  end

  # ── DM tags a player's action with a theme ────
  def handle("dm_tag_action", %{"targetCharId" => target_id, "themeTag" => tag} = payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p) or String.upcase(p.role || "") not in @staff_roles, do: {:noreply, socket}

    events = TePhoenix.Battle.TechniqueDiscovery.dm_tag_action(target_id, tag,
      campaign_id: payload["sessionId"],
      ruleset_id: payload["rulesetId"]
    )

    Enum.each(events, fn {_type, message} ->
      TePhoenixWeb.Endpoint.broadcast!("user:#{target_id}", "notification", %{type: "info", message: message})
    end)

    push(socket, "notification", %{type: "success", message: "Tagged action as '#{tag}'"})
    {:noreply, socket}
  end

  # ── DM overrides stats for a discovery ────
  def handle("dm_override_discovery", %{"targetCharId" => target_id, "themeTag" => tag, "overrides" => overrides}, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p) or String.upcase(p.role || "") not in @staff_roles, do: {:noreply, socket}

    case TePhoenix.Battle.TechniqueDiscovery.dm_override(target_id, tag, overrides) do
      :ok -> push(socket, "notification", %{type: "success", message: "Discovery stats overridden"})
      {:error, msg} -> push(socket, "notification", %{type: "error", message: msg})
    end

    {:noreply, socket}
  end

  # ── Admin DM Assist ─────────────────────────────────────────────

  def handle("dm_assist", %{"instruction" => instruction} = payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p) or String.upcase(p.role || "") not in @staff_roles, do: {:noreply, socket}

    _session = get_session(payload["sessionId"])

    # Generate DM-assist text (AI or fallback)
    response = "The DM considers: #{instruction}. A mysterious force guides the narrative forward..."

    push(socket, "dm_assist_result", %{text: response})
    {:noreply, socket}
  end

  # ── Admin DM Narrate ────────────────────────────────────────────

  def handle("dm_narrate", %{"text" => text, "sessionId" => session_id}, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p) or String.upcase(p.role || "") not in @staff_roles, do: {:noreply, socket}

    session = get_session(session_id) || create_dm_session(session_id, p)
    history = session.history ++ [%{speaker: "DM", text: text}]
    put_session(session_id, %{session | history: history, is_admin_run: true})

    TePhoenixWeb.Endpoint.broadcast!("dm:#{session_id}", "dm_response", %{
      speaker: "#{p.name} (DM)", text: text, sessionId: session_id
    })

    {:noreply, socket}
  end

  def handle("dm_join_session", %{"sessionId" => session_id}, socket) do
    # Subscribe to DM session topic
    TePhoenixWeb.Endpoint.subscribe("dm:#{session_id}")
    {:noreply, socket}
  end

  # ── DM Map Controls ─────────────────────────────────────────────

  def handle("dm_lock_player", %{"targetCharId" => target_id, "locked" => locked}, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p) or String.upcase(p.role || "") not in @staff_roles, do: {:noreply, socket}

    PlayerRegistry.update(target_id, %{dm_locked: !!locked})
    TePhoenixWeb.Endpoint.broadcast!("user:#{target_id}", "event_queue",
      [%{cmd: "lock_movement", locked: !!locked}])
    TePhoenixWeb.Endpoint.broadcast!("user:#{target_id}", "notification",
      %{type: "info", message: if(locked, do: "The DM has locked your movement.", else: "You can move again.")})

    {:noreply, socket}
  end

  def handle("dm_lock_all", %{"locked" => locked, "sessionId" => session_id}, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p) or String.upcase(p.role || "") not in @staff_roles, do: {:noreply, socket}

    TePhoenixWeb.Endpoint.broadcast!("dm:#{session_id}", "event_queue",
      [%{cmd: "lock_movement", locked: !!locked}])
    TePhoenixWeb.Endpoint.broadcast!("dm:#{session_id}", "notification",
      %{type: "info", message: if(locked, do: "The DM has locked movement.", else: "Movement unlocked.")})

    {:noreply, socket}
  end

  def handle("dm_teleport_player", %{"targetCharId" => target_id} = payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p) or String.upcase(p.role || "") not in @staff_roles, do: {:noreply, socket}

    target = PlayerRegistry.get(target_id)
    if is_nil(target), do: {:noreply, socket}

    new_map = payload["mapId"] || target.map_id
    new_x = payload["x"] || target.x
    new_y = payload["y"] || target.y

    PlayerRegistry.update(target_id, %{map_id: new_map, x: new_x, y: new_y})
    Repo.query("UPDATE characters SET map_id=?, x=?, y=? WHERE id=?", [new_map, new_x, new_y, target_id])

    if new_map != target.map_id do
      TePhoenixWeb.Endpoint.broadcast!("map:#{target.map_id}", "player_left", %{char_id: target_id})
      map_data = MapData.get(new_map)
      TePhoenixWeb.Endpoint.broadcast!("user:#{target_id}", "map_data", map_data || %{})
      TePhoenixWeb.Endpoint.broadcast!("user:#{target_id}", "map_changed", %{mapId: new_map})
      TePhoenixWeb.Endpoint.broadcast!("map:#{new_map}", "player_joined", PlayerRegistry.get(target_id))
    end

    TePhoenixWeb.Endpoint.broadcast!("user:#{target_id}", "force_move", %{x: new_x, y: new_y})
    {:noreply, socket}
  end

  def handle("dm_spawn_npc", %{"npcId" => npc_id} = payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p) or String.upcase(p.role || "") not in @staff_roles, do: {:noreply, socket}

    target_map = payload["mapId"] || p.map_id
    x = payload["x"] || 5
    y = payload["y"] || 5

    Repo.query("UPDATE game_npcs SET map_id=?, x=?, y=? WHERE id=?", [target_map, x, y, npc_id])

    npc_name = case Repo.query("SELECT name FROM game_npcs WHERE id=?", [npc_id]) do
      {:ok, %{rows: [[n]]}} -> n; _ -> "NPC"
    end

    TePhoenixWeb.Endpoint.broadcast!("map:#{target_map}", "npc_arrived", %{npcId: npc_id, name: npc_name, x: x, y: y})
    {:noreply, socket}
  end

  def handle("dm_force_battle", %{"targetCharId" => target_id, "enemyNpcId" => enemy_npc_id}, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p) or String.upcase(p.role || "") not in @staff_roles, do: {:noreply, socket}

    TePhoenixWeb.Endpoint.broadcast!("user:#{target_id}", "trigger_pve_battle", %{npcId: enemy_npc_id})
    {:noreply, socket}
  end

  def handle("dm_set_environment", payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p) or String.upcase(p.role || "") not in @staff_roles, do: {:noreply, socket}

    target_map = payload["mapId"] || p.map_id
    if payload["weather"] do
      TePhoenixWeb.Endpoint.broadcast!("map:#{target_map}", "notification",
        %{type: "info", message: "The weather changes to #{payload["weather"]}..."})
    end
    {:noreply, socket}
  end

  def handle("dm_screen_effect", %{"sessionId" => session_id} = payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p) or String.upcase(p.role || "") not in @staff_roles, do: {:noreply, socket}

    TePhoenixWeb.Endpoint.broadcast!("dm:#{session_id}", "event_queue",
      [%{cmd: "screen_effect", effect: payload["effect"] || "shake",
         duration: payload["duration"] || 500, color: payload["color"]}])
    {:noreply, socket}
  end

  def handle("dm_spawn_particle", payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p) or String.upcase(p.role || "") not in @staff_roles, do: {:noreply, socket}

    target_map = payload["mapId"] || p.map_id
    TePhoenixWeb.Endpoint.broadcast!("map:#{target_map}", "map_particle", %{
      preset: payload["preset"] || "fire", x: payload["x"] || p.x, y: payload["y"] || p.y
    })
    {:noreply, socket}
  end

  # ── DM Campaigns (persistent) ──────────────────────────────────

  def handle("dm_create_campaign", payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p) or String.upcase(p.role || "") not in ["ADMIN", "GM", "STAFF", "OWNER"], do: {:noreply, socket}

    try do
      {:ok, result} = Repo.query(
        "INSERT INTO game_dm_campaigns (name, description, dm_user_id, max_players, is_oneshot, world_tone, map_id, ruleset_id) VALUES (?,?,?,?,?,?,?,?)",
        [payload["name"], payload["description"], p.user_id,
         payload["maxPlayers"] || 7, if(payload["isOneshot"], do: 1, else: 0),
         payload["worldTone"] || "dark fantasy", payload["mapId"], payload["rulesetId"]]
      )
      push(socket, "dm_campaign_created", %{id: result.last_insert_id, name: payload["name"]})
      push(socket, "notification", %{type: "success", message: "Campaign \"#{payload["name"]}\" created!"})
    rescue
      e -> push(socket, "notification", %{type: "error", message: Exception.message(e)})
    end

    {:noreply, socket}
  end

  def handle("dm_list_campaigns", _payload, socket) do
    campaigns = case Repo.query(
      "SELECT c.*, u.username AS dm_name, (SELECT COUNT(*) FROM game_dm_campaign_players WHERE campaign_id=c.id AND status='accepted') AS player_count FROM game_dm_campaigns c JOIN users u ON u.id=c.dm_user_id WHERE c.status IN ('recruiting','active') ORDER BY c.created_at DESC"
    ) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    push(socket, "dm_campaigns_list", campaigns)
    {:noreply, socket}
  end

  def handle("dm_invite_player", %{"campaignId" => campaign_id, "targetUserId" => target_user_id}, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p), do: {:noreply, socket}

    try do
      case Repo.query("SELECT name, max_players FROM game_dm_campaigns WHERE id=? AND dm_user_id=?", [campaign_id, p.user_id]) do
        {:ok, %{rows: [[name, max_p]]}} ->
          case Repo.query("SELECT COUNT(*) FROM game_dm_campaign_players WHERE campaign_id=? AND status='accepted'", [campaign_id]) do
            {:ok, %{rows: [[c]]}} when c >= max_p ->
              push(socket, "notification", %{type: "error", message: "Campaign is full."})
            _ ->
              Repo.query!("INSERT INTO game_dm_campaign_players (campaign_id, user_id) VALUES (?,?) ON DUPLICATE KEY UPDATE status='invited'",
                [campaign_id, target_user_id])

              # Notify target if online (find their char_id)
              case Repo.query("SELECT id FROM characters WHERE user_id=? LIMIT 1", [target_user_id]) do
                {:ok, %{rows: [[target_char]]}} ->
                  TePhoenixWeb.Endpoint.broadcast!("user:#{target_char}", "notification",
                    %{type: "info", message: "You've been invited to \"#{name}\" campaign!"})
                _ -> nil
              end

              push(socket, "notification", %{type: "success", message: "Invite sent!"})
          end
        _ -> push(socket, "notification", %{type: "error", message: "Not your campaign."})
      end
    rescue
      e -> push(socket, "notification", %{type: "error", message: Exception.message(e)})
    end

    {:noreply, socket}
  end

  def handle("dm_campaign_respond", %{"campaignId" => campaign_id, "accept" => accept}, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p), do: {:noreply, socket}

    status = if accept, do: "accepted", else: "declined"
    joined = if accept, do: "NOW()", else: "NULL"
    try do
      Repo.query!("UPDATE game_dm_campaign_players SET status=?, joined_at=#{joined} WHERE campaign_id=? AND user_id=?",
        [status, campaign_id, p.user_id])
    rescue _ -> nil
    end

    push(socket, "notification", %{type: "info", message: if(accept, do: "Joined campaign!", else: "Declined invite.")})
    {:noreply, socket}
  end

  def handle("dm_save_character_sheet", %{"campaignId" => campaign_id, "sheet" => sheet}, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p), do: {:noreply, socket}

    try do
      # Upsert character sheet
      case Repo.query("SELECT id FROM game_dm_character_sheets WHERE campaign_id=? AND user_id=?", [campaign_id, p.user_id]) do
        {:ok, %{rows: [[existing_id]]}} ->
          Repo.query!("UPDATE game_dm_character_sheets SET name=?, race=?, class_name=?, level=?, str=?, dex=?, con=?, int_score=?, wis=?, cha=?, max_hp=?, backstory=?, equipment_json=?, skills_json=? WHERE id=?",
            [sheet["name"], sheet["race"], sheet["class_name"], sheet["level"],
             sheet["str"], sheet["dex"], sheet["con"], sheet["int_score"], sheet["wis"], sheet["cha"],
             sheet["max_hp"], sheet["backstory"],
             if(sheet["equipment_json"], do: Jason.encode!(sheet["equipment_json"])),
             if(sheet["skills_json"], do: Jason.encode!(sheet["skills_json"])),
             existing_id])

        _ ->
          Repo.query!("INSERT INTO game_dm_character_sheets (campaign_id, user_id, name, race, class_name, level, str, dex, con, int_score, wis, cha, max_hp, backstory) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [campaign_id, p.user_id,
             sheet["name"], sheet["race"], sheet["class_name"], sheet["level"],
             sheet["str"], sheet["dex"], sheet["con"], sheet["int_score"], sheet["wis"], sheet["cha"],
             sheet["max_hp"], sheet["backstory"]])
      end

      push(socket, "notification", %{type: "success", message: "Character sheet saved!"})
    rescue
      e -> push(socket, "notification", %{type: "error", message: Exception.message(e)})
    end

    {:noreply, socket}
  end

  def handle("dm_get_sheets", %{"campaignId" => campaign_id}, socket) do
    sheets = case Repo.query(
      "SELECT s.*, u.username FROM game_dm_character_sheets s JOIN users u ON u.id=s.user_id WHERE s.campaign_id=?",
      [campaign_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    push(socket, "dm_character_sheets", %{campaignId: campaign_id, sheets: sheets})
    {:noreply, socket}
  end

  def handle("dm_start_session", %{"campaignId" => campaign_id} = payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p) or String.upcase(p.role || "") not in ["ADMIN", "GM", "STAFF", "OWNER"], do: {:noreply, socket}

    try do
      case Repo.query("SELECT name, session_count, description, world_tone FROM game_dm_campaigns WHERE id=? AND dm_user_id=?", [campaign_id, p.user_id]) do
        {:ok, %{rows: [[name, session_count, desc, tone]]}} ->
          session_num = (session_count || 0) + 1
          Repo.query!("UPDATE game_dm_campaigns SET status='active', session_count=? WHERE id=?", [session_num, campaign_id])

          {:ok, log_result} = Repo.query(
            "INSERT INTO game_dm_session_log (campaign_id, session_number, title) VALUES (?,?,?)",
            [campaign_id, session_num, payload["title"] || "Session #{session_num}"]
          )

          # Load campaign players
          players = case Repo.query(
            "SELECT s.name, s.class_name, s.level FROM game_dm_character_sheets s JOIN game_dm_campaign_players cp ON cp.campaign_id=s.campaign_id AND cp.user_id=s.user_id AND cp.status='accepted' WHERE s.campaign_id=?",
            [campaign_id]
          ) do
            {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
            _ -> []
          end

          put_session(campaign_id, %{
            id: campaign_id,
            session_log_id: log_result.last_insert_id,
            history: [],
            location: "Unknown",
            party_members: players,
            dm_context: desc,
            is_admin_run: true,
            world_tone: tone
          })

          # Notify all campaign players
          case Repo.query("SELECT cp.user_id FROM game_dm_campaign_players cp WHERE cp.campaign_id=? AND cp.status='accepted'", [campaign_id]) do
            {:ok, %{rows: rows}} ->
              Enum.each(rows, fn [uid] ->
                case Repo.query("SELECT id FROM characters WHERE user_id=? LIMIT 1", [uid]) do
                  {:ok, %{rows: [[cid]]}} ->
                    TePhoenixWeb.Endpoint.broadcast!("user:#{cid}", "notification",
                      %{type: "success", message: "Campaign \"#{name}\" Session #{session_num} starting!"})
                  _ -> nil
                end
              end)
            _ -> nil
          end

          TePhoenixWeb.Endpoint.subscribe("dm:#{campaign_id}")
          push(socket, "dm_session_started", %{campaignId: campaign_id, sessionNumber: session_num, sessionLogId: log_result.last_insert_id})

        _ -> push(socket, "notification", %{type: "error", message: "Campaign not found."})
      end
    rescue
      e -> push(socket, "notification", %{type: "error", message: Exception.message(e)})
    end

    {:noreply, socket}
  end

  def handle("dm_end_session", %{"campaignId" => campaign_id} = payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p) or String.upcase(p.role || "") not in ["ADMIN", "GM", "STAFF", "OWNER"], do: {:noreply, socket}

    session = get_session(campaign_id)
    if session && session.session_log_id do
      try do
        Repo.query!("UPDATE game_dm_session_log SET ended_at=NOW(), summary=?, log_json=? WHERE id=?",
          [payload["summary"], Jason.encode!(session.history || []), session.session_log_id])
      rescue _ -> nil
      end
    end

    delete_session(campaign_id)
    TePhoenixWeb.Endpoint.broadcast!("dm:#{campaign_id}", "notification", %{type: "info", message: "Session ended."})
    TePhoenixWeb.Endpoint.broadcast!("dm:#{campaign_id}", "dm_session_ended", %{campaignId: campaign_id})

    {:noreply, socket}
  end

  # ── Action Slots ────────────────────────────────────────────

  def handle("get_action_slots", %{"campaignId" => campaign_id}, socket) do
    char_id = socket.assigns[:char_id]
    {race, class_name} = get_race_class(char_id)

    slots = TePhoenix.Game.ActionSlots.get_slot_status(%{
      character_id: char_id, campaign_id: campaign_id,
      race: race, class_name: class_name
    })

    push(socket, "action_slots", %{campaignId: campaign_id, slots: slots})
    {:noreply, socket}
  end

  def handle("campaign_action", %{"campaignId" => campaign_id, "actionType" => action_type} = _payload, socket) do
    char_id = socket.assigns[:char_id]
    {race, class_name} = get_race_class(char_id)

    case TePhoenix.Game.ActionSlots.can_perform?(%{
      character_id: char_id, campaign_id: campaign_id,
      action_type: action_type, race: race, class_name: class_name
    }) do
      {:error, reason} ->
        push(socket, "campaign_action_result", %{success: false, message: reason, actionType: action_type})

      {:ok, remaining, _max_uses, _window_info} ->
        # Get gain multiplier
        ruleset = TePhoenix.Game.ActionSlots.get_ruleset(campaign_id)
        {gain_result, message} = if ruleset do
          %{multiplier: mult, flat_bonus: flat} =
            TePhoenix.Game.ActionSlots.gain_multiplier(ruleset["id"], race, class_name, action_type)

          # Apply gains from action window effect_json
          windows = TePhoenix.Game.ActionSlots.get_action_windows(ruleset["id"])
          aw = Enum.find(windows, fn w -> w["action_type"] == action_type end)
          effect = if aw["effect_json"] do
            case aw["effect_json"] do
              e when is_binary(e) -> Jason.decode!(e)
              e when is_map(e) -> e
              _ -> nil
            end
          end

          if effect && effect["type"] == "stat_gain" && effect["stat"] do
            base = case Repo.query("SELECT atk, level FROM characters WHERE id=?", [char_id]) do
              {:ok, %{rows: [[atk, lvl]]}} -> %{"base" => atk || 100, "level" => lvl || 1, "atk" => atk || 10}
              _ -> %{"base" => 100, "level" => 1, "atk" => 10}
            end

            # Simple formula: replace var names with values, eval basic math
            gain = try do
              formula_str = Enum.reduce(base, effect["formula"] || "1", fn {k, v}, acc ->
                String.replace(acc, k, Integer.to_string(v))
              end)
              {result, _} = Code.eval_string(formula_str)
              round(result * mult) + flat
            rescue
              _ -> flat + 1
            end

            stat_col = if effect["stat"] == "powerlevel", do: "atk", else: effect["stat"]
            if stat_col in ~w(atk def mo md speed luck max_hp max_mp experience) do
              try do
                Repo.query!("UPDATE characters SET `#{stat_col}`=`#{stat_col}`+? WHERE id=?", [gain, char_id])
              rescue _ -> nil
              end
            end

            label = if ruleset["stat_mode"] == "single", do: ruleset["primary_stat_name"] || "Power", else: effect["stat"]
            {%{stat: effect["stat"], gain: gain, label: label}, "#{label} +#{gain}! (#{max(0, (remaining || 1) - 1)} remaining)"}
          else
            {%{}, "#{action_type} complete! (#{max(0, (remaining || 1) - 1)} remaining)"}
          end
        else
          {%{}, "#{action_type} complete!"}
        end

        # Record the action
        TePhoenix.Game.ActionSlots.record_action(%{
          character_id: char_id, campaign_id: campaign_id,
          action_type: action_type, result_json: gain_result
        })

        push(socket, "campaign_action_result", %{
          success: true, actionType: action_type, message: message
        } |> Map.merge(gain_result))

        # Broadcast to DM session if active
        session = get_session(campaign_id)
        if session do
          p = PlayerRegistry.get(char_id)
          gain_text = if gain_result[:gain], do: " (+#{gain_result[:gain]} #{gain_result[:label] || ""})", else: ""
          TePhoenixWeb.Endpoint.broadcast!("dm:#{campaign_id}", "dm_response", %{
            speaker: "System",
            text: "#{p && p.name || "Player"} used #{action_type}#{gain_text}.",
            sessionId: campaign_id
          })
        end
    end

    {:noreply, socket}
  end

  def handle("check_campaign_moves", %{"campaignId" => campaign_id}, socket) do
    char_id = socket.assigns[:char_id]
    {race, class_name} = get_race_class(char_id)

    # Check flying status
    is_flying = case Repo.query(
      "SELECT 1 FROM character_status_effects cse JOIN game_statuses s ON s.id=cse.status_id WHERE cse.character_id=? AND s.effects LIKE '%fly%' AND (cse.expires_at IS NULL OR cse.expires_at > NOW()) LIMIT 1",
      [char_id]
    ) do
      {:ok, %{rows: [_]}} -> true
      _ -> false
    end

    result = TePhoenix.Game.ActionSlots.check_moves(%{
      character_id: char_id, campaign_id: campaign_id,
      race: race, class_name: class_name, is_flying: is_flying
    })

    push(socket, "campaign_move_status", Map.put(result, :campaignId, campaign_id))
    {:noreply, socket}
  end

  def handle(_, _, socket), do: {:noreply, socket}

  # ── Private ─────────────────────────────────────────────────

  defp get_race_class(char_id) do
    case Repo.query(
      "SELECT r.name, cl.name FROM characters c LEFT JOIN game_races r ON r.id=c.race_id LEFT JOIN game_classes cl ON cl.id=c.class_id WHERE c.id=?",
      [char_id]
    ) do
      {:ok, %{rows: [[race, cls]]}} -> {race || "", cls || ""}
      _ -> {"", ""}
    end
  end

  defp create_dm_session(session_id, player) do
    session = %{
      id: session_id,
      history: [],
      location: "Unknown",
      party_members: [%{name: player.name, class: "Adventurer", level: player.level || 1}],
      dm_context: nil,
      is_admin_run: false,
      session_log_id: nil,
      world_tone: nil
    }
    put_session(session_id, session)
    session
  end

  defp generate_dm_response(action, session) do
    # Generates a DM response. Uses AI when available, fallback to template.
    # TODO: Wire to AI provider when ai-features.ex is ported
    location = session.location || "the unknown"
    party = session.party_members |> Enum.map(fn m -> m["name"] || m[:name] end) |> Enum.join(", ")
    _history_context = session.history |> Enum.take(-4) |> Enum.map(fn h -> "#{h[:speaker] || h["speaker"]}: #{h[:text] || h["text"]}" end) |> Enum.join("\n")

    cond do
      String.contains?(String.downcase(action), "look") ->
        "You survey #{location}. The air is thick with tension. Ancient stone walls bear the scars of battles long past. #{if party != "", do: "Your companions — #{party} — stand ready.", else: ""}"

      String.contains?(String.downcase(action), "attack") ->
        "You charge forward with determination! Roll for initiative..."

      String.contains?(String.downcase(action), "search") ->
        roll = :rand.uniform(20)
        if roll >= 12 do
          "Perception check: #{roll}. You find something interesting hidden nearby..."
        else
          "Perception check: #{roll}. You search but find nothing of note."
        end

      String.contains?(String.downcase(action), "talk") or String.contains?(String.downcase(action), "speak") ->
        "The figure regards you cautiously. \"Speak your piece, traveler. But choose your words carefully.\""

      true ->
        "You #{String.downcase(action)}. The dungeon master considers the consequences... The world shifts in response to your actions."
    end
  end
end
