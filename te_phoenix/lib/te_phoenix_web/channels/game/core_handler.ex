defmodule TePhoenixWeb.Game.CoreHandler do
  @moduledoc """
  Core game session handlers: join_game, move, teleport, fast_travel, interact, disconnect.
  Ported from socket-game.js sections 1-4 + disconnect.
  """

  import Phoenix.Channel
  import Phoenix.Socket, only: [assign: 3]
  require Logger

  alias TePhoenix.Game.{PlayerRegistry, MapData}
  alias TePhoenix.{Repo, EventRunner}

  # ═══════════════════════════════════════════════════════════════════
  # JOIN GAME
  # ═══════════════════════════════════════════════════════════════════

  def handle("join_game", payload, socket) do
    user_id = socket.assigns.user_id
    char_id = parse_int(Map.get(payload, "charId") || Map.get(payload, "char_id"))

    if char_id == 0 do
      push(socket, "error_msg", %{reason: "Missing charId."})
      {:noreply, socket}
    else
      case Repo.query("SELECT * FROM characters WHERE id=? AND user_id=?", [char_id, user_id]) do
        {:ok, %{rows: [row], columns: cols}} ->
          char = Enum.zip(cols, row) |> Map.new()
          do_join_game(socket, char, user_id)

        _ ->
          push(socket, "error_msg", %{reason: "Character not found."})
          {:noreply, socket}
      end
    end
  end

  # ═══════════════════════════════════════════════════════════════════
  # MOVE (server-authoritative)
  # ═══════════════════════════════════════════════════════════════════

  def handle("move", payload, socket) do
    char_id = socket.assigns[:char_id]
    player = PlayerRegistry.get(char_id)

    if is_nil(player) do
      {:noreply, socket}
    else
      target_x = parse_int(payload["x"])
      target_y = parse_int(payload["y"])
      is_running = !!payload["running"]

      # Throttle check
      now = System.system_time(:millisecond)
      last_move = Map.get(player, :last_move_time, 0)
      base_cooldown = Map.get(player, :move_cooldown, 200)
      mount_mult = player.mount_speed_mult || 1.0
      effective_cooldown = trunc(base_cooldown * (if is_running, do: 0.5, else: 1.0) / max(0.5, mount_mult))

      if now - last_move < effective_cooldown do
        {:noreply, socket}
      else
        do_move(socket, player, char_id, target_x, target_y, now)
      end
    end
  end

  # ═══════════════════════════════════════════════════════════════════
  # MOVE CONTINUOUS — Free-roam FPS/3D movement
  # ═══════════════════════════════════════════════════════════════════
  # Client sends continuous position as tile coordinates. Server
  # validates the tile is passable and within reasonable distance
  # from the last known position (anti-teleport).

  def handle("move_continuous", payload, socket) do
    char_id = socket.assigns[:char_id]
    player = PlayerRegistry.get(char_id)

    if is_nil(player) do
      {:noreply, socket}
    else
      target_x = parse_int(payload["tileX"])
      target_y = parse_int(payload["tileY"])
      _is_running = !!payload["running"]

      # Rate limit: max 20 updates/sec
      now = System.system_time(:millisecond)
      last_move = Map.get(player, :last_move_time, 0)
      if now - last_move < 50 do
        {:noreply, socket}
      else
        do_move_continuous(socket, player, char_id, target_x, target_y, now)
      end
    end
  end

  # ═══════════════════════════════════════════════════════════════════
  # TELEPORT
  # ═══════════════════════════════════════════════════════════════════

  def handle("teleport", payload, socket) do
    char_id = socket.assigns[:char_id]
    player = PlayerRegistry.get(char_id)
    if is_nil(player), do: {:noreply, socket}

    new_map_id = parse_int(payload["mapId"] || payload["map_id"])
    map_data = MapData.get(new_map_id)

    if is_nil(map_data) do
      push(socket, "error_msg", %{reason: "Map not found."})
      {:noreply, socket}
    else
      # Check reputation gates
      case check_rep_gate(char_id, new_map_id) do
        {:blocked, msg} ->
          push(socket, "chat_msg", %{channel: "system", from: "System", text: msg, ts: System.system_time(:millisecond)})
          push(socket, "force_move", %{x: player.x, y: player.y})
          {:noreply, socket}

        :ok ->
          do_teleport(socket, player, char_id, new_map_id, map_data, payload)
      end
    end
  end

  # ═══════════════════════════════════════════════════════════════════
  # FAST TRAVEL
  # ═══════════════════════════════════════════════════════════════════

  def handle("fast_travel", %{"mapId" => map_id_str} = _payload, socket) do
    char_id = socket.assigns[:char_id]
    dest_map = parse_int(map_id_str)

    # Check player has discovered this warp point
    case Repo.query("SELECT state_json FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[json]]}} ->
        char_state = parse_json(json, %{})
        warp_points = char_state["warpPoints"] || []

        known = Enum.any?(warp_points, fn wp ->
          (wp["mapId"] || wp["map_id"]) == dest_map
        end)

        if not known do
          push(socket, "notification", %{text: "You haven't discovered that location yet.", type: "error"})
          {:noreply, socket}
        else
          map_data = MapData.get(dest_map)
          if is_nil(map_data) or not map_data.fast_travel_enabled do
            push(socket, "notification", %{text: "Fast travel is not available to that location.", type: "error"})
            {:noreply, socket}
          else
            push(socket, "notification", %{text: "Fast travel to #{map_data.name}...", type: "info"})
            # Re-use teleport logic
            player = PlayerRegistry.get(char_id)
            do_teleport(socket, player, char_id, dest_map, map_data, %{})
          end
        end

      _ ->
        push(socket, "error_msg", %{reason: "Character not found."})
        {:noreply, socket}
    end
  end

  # ═══════════════════════════════════════════════════════════════════
  # INTERACT
  # ═══════════════════════════════════════════════════════════════════

  def handle("interact", _payload, socket) do
    char_id = socket.assigns[:char_id]
    player = PlayerRegistry.get(char_id)
    if is_nil(player), do: {:noreply, socket}

    map_data = MapData.get(player.map_id)
    if is_nil(map_data), do: {:noreply, socket}

    # 1. Check signs/objects at player position
    objects = map_data.objects || []
    sign = Enum.find(objects, fn o ->
      dist = abs((o["x"] || 0) - player.x) + abs((o["y"] || 0) - player.y)
      dist <= 1 and o["preset"] == "SIGN" and o["text"]
    end)

    if sign do
      push(socket, "event_queue", %{events: [%{cmd: "dialogue", speaker: sign["label"] || "Sign", text: sign["text"]}]})
      {:noreply, socket}
    else
      # 2. Check for live NPCs
      npcs = MapData.get_npcs(player.map_id)
      live_npc = Enum.find(npcs, fn n ->
        dist = abs((n["x"] || 0) - player.x) + abs((n["y"] || 0) - player.y)
        dist <= 1
      end)

      if live_npc do
        handle_npc_interact(socket, char_id, player, live_npc)
      else
        # 3. Check INTERACT map events
        events = map_data.events || []
        char_state = load_char_state(char_id)

        case run_map_event(events, "INTERACT", player.x, player.y, char_id, char_state) do
          {:ok, responses} ->
            Enum.each(responses, fn r -> push(socket, "event_action", r) end)
          {:halted, responses, pending} ->
            Enum.each(responses, fn r -> push(socket, "event_action", r) end)
            _socket = assign(socket, :pending_event_choice, %{pending: pending, char_state: char_state})
          _ -> nil
        end

        {:noreply, socket}
      end
    end
  end

  # ═══════════════════════════════════════════════════════════════════
  # EVENT CHOICE (from EventRunner CHOICE halts)
  # ═══════════════════════════════════════════════════════════════════

  def handle("event_choice", %{"option_id" => option_id}, socket) do
    char_id = socket.assigns[:char_id]

    case socket.assigns[:pending_event_choice] do
      nil ->
        {:noreply, socket}

      %{pending: pending, char_state: char_state} ->
        case EventRunner.resume(pending, option_id, char_id, char_state) do
          {:ok, responses} ->
            Enum.each(responses, fn r -> push(socket, "event_action", r) end)
          {:halted, responses, new_pending} ->
            Enum.each(responses, fn r -> push(socket, "event_action", r) end)
            _socket = assign(socket, :pending_event_choice, %{pending: new_pending, char_state: char_state})
            {:noreply, socket}
          _ -> nil
        end

        socket = assign(socket, :pending_event_choice, nil)
        {:noreply, socket}
    end
  end

  # ═══════════════════════════════════════════════════════════════════
  # DISCONNECT
  # ═══════════════════════════════════════════════════════════════════

  def handle_disconnect(socket) do
    with char_id when not is_nil(char_id) <- socket.assigns[:char_id],
         player when not is_nil(player) <- PlayerRegistry.get(char_id) do
      do_disconnect(socket, char_id, player)
    else
      _ -> :ok
    end
  end

  defp do_disconnect(_socket, char_id, player) do
    # Persist position to DB
    try do
      Repo.query!("UPDATE characters SET x=?, y=?, map_id=?, presence='offline', last_seen=NOW() WHERE id=?",
        [player.x, player.y, player.map_id, char_id])
    rescue
      _ -> nil
    end

    # Check if offline players stay visible
    offline_visible = case Repo.query("SELECT setting_value FROM system_settings WHERE setting_key='enable_offline_players'") do
      {:ok, %{rows: [[val]]}} -> val == "true" or val == "1"
      _ -> false
    end

    if offline_visible do
      TePhoenixWeb.Endpoint.broadcast!("map:#{player.map_id}", "player_status_change", %{
        charId: char_id, name: player.name,
        x: player.x, y: player.y, level: player.level,
        isOffline: true, presence: "offline"
      })
    else
      TePhoenixWeb.Endpoint.broadcast!("map:#{player.map_id}", "player_left", %{char_id: char_id})
    end

    # Clean up party membership
    try do
      Repo.query!(
        "UPDATE character_party_members SET is_active=0, left_at=NOW() WHERE character_id=? AND is_active=1",
        [char_id]
      )
    rescue
      _ -> nil
    end

    PlayerRegistry.delete(char_id)
    Logger.info("#{player.name} disconnected")
    :ok
  end

  # ═══════════════════════════════════════════════════════════════════
  # PRIVATE HELPERS
  # ═══════════════════════════════════════════════════════════════════

  defp do_join_game(socket, char, user_id) do
    char_id = char["id"]
    map_id = char["map_id"] || 1

    # Parse state_json
    char_state = parse_json(char["state_json"], %{})
    tutorial_done = !!char_state["tutorial_done"]

    # Load user role + chat color
    {role, chat_color} = case Repo.query("SELECT role, chat_color FROM users WHERE id=?", [user_id]) do
      {:ok, %{rows: [[r, c]]}} -> {r || "PLAYER", c}
      _ -> {"PLAYER", nil}
    end

    # Load mount speed
    mount_speed = case Repo.query(
      "SELECT m.speed_mult FROM character_mounts cm JOIN game_mounts m ON m.id=cm.mount_id WHERE cm.character_id=? AND cm.is_active=1 LIMIT 1",
      [char_id]
    ) do
      {:ok, %{rows: [[mult]]}} -> parse_float(mult, 1.0)
      _ -> 1.0
    end

    # Register in PlayerRegistry
    player = %{
      char_id: char_id,
      user_id: user_id,
      name: char["name"],
      map_id: map_id,
      x: char["x"] || 0,
      y: char["y"] || 0,
      level: char["level"] || 1,
      role: role,
      chat_color: chat_color,
      presence: char["presence_status"] || "online",
      mount_speed_mult: mount_speed,
      in_arena: nil
    }
    PlayerRegistry.put(char_id, player)

    # Assign to socket
    socket = socket
      |> assign(:char_id, char_id)
      |> assign(:char_name, char["name"])
      |> assign(:char_level, char["level"] || 1)
      |> assign(:map_id, map_id)

    # Subscribe to map topic for location broadcasts
    TePhoenixWeb.Endpoint.subscribe("map:#{map_id}")

    # Load map data
    map_data = MapData.get(map_id)
    if map_data, do: push(socket, "map_data", map_data)

    # Load region
    region = MapData.get_region(map_id)
    region_payload = if region do
      %{
        id: region["id"], name: region["name"],
        danger_level: region["danger_level"],
        corruption_level: region["corruption_level"],
        faction_control: region["faction_control"],
        weather_override: region["weather_override"],
        pvp_enabled: region["pvp_enabled"],
        is_sanctuary: region["is_sanctuary"],
        xp_mult: region["xp_mult"], gold_mult: region["gold_mult"]
      }
    end

    # Greet system
    {enable_greet, greeted_ids, has_greeted} = load_greet_data(char_id, char_state)

    # Ticket Q: bundle the right-rail panel data onto init_self so the
    # player UI doesn't have to chase six separate pushes to know what
    # to render. Each lookup returns a safe default if the underlying
    # module doesn't exist yet — empty array, nil, "clear" — never raise.

    quests_active =
      try do
        TePhoenix.Game.Quests.list_active(char_id)
      rescue
        _ -> []
      end

    weather_key =
      try do
        TePhoenix.World.Weather.get_weather(map_id) || "clear"
      rescue
        _ -> "clear"
      end

    online_count =
      try do
        TePhoenix.Game.PlayerRegistry.count()
      rescue
        _ -> 0
      end

    # Send init_self with full character data
    push(socket, "init_self", %{
      charId: char_id, userId: user_id,
      name: char["name"], mapId: map_id,
      x: char["x"] || 0, y: char["y"] || 0,
      level: char["level"] || 1, role: role,
      tutorialDone: tutorial_done,
      enableGreetSystem: enable_greet,
      greetedIds: greeted_ids, hasGreetedIds: has_greeted,
      hp: char["current_hp"], maxHp: char["max_hp"],
      mp: char["current_mp"] || 0, maxMp: char["max_mp"] || 0,
      atk: char["atk"], def: char["def"],
      mo: char["mo"], md: char["md"],
      speed: char["speed"], luck: char["luck"],
      limitbreak: char["limitbreak"] || 0,
      breaklevel: char["breaklevel"] || 1,
      region: region_payload,
      # ── Ticket Q additions ────────────────────────────────
      quests: %{active: quests_active},
      # Statuses also flow via the separate `active_statuses` push fired
      # in send_active_statuses/2 below — embedding [] here is a
      # forward-compat slot for clients that prefer one-shot init.
      statuses: [],
      # TODO: companion system not yet implemented; return nil so the
      # Companion panel renders its empty state without inventing fake data.
      companion: nil,
      world: %{
        # TODO: in-game day/night clock not yet implemented; default "day".
        time_of_day: "day",
        weather: weather_key,
        online_count: online_count,
        events: []
      }
    })

    # Send players on this map
    map_players = PlayerRegistry.on_map(map_id)
      |> Enum.filter(fn p -> p.char_id != char_id end)
    push(socket, "player_list", %{players: map_players})

    # Broadcast join to map
    TePhoenixWeb.Endpoint.broadcast!("map:#{map_id}", "player_joined", player)

    # Send NPCs
    npcs = MapData.get_npcs(map_id)
    push(socket, "npc_list", %{npcs: npcs})

    # Load active statuses
    send_active_statuses(socket, char_id)

    # Send ground items + structures
    send_ground_items(socket, map_id)
    send_structures(socket, map_id)

    # Send tile palette (cached)
    send_tile_palette(socket)

    # Fire AUTO triggers
    if map_data do
      auto_events = (map_data.events || [])
        |> Enum.filter(fn e -> is_map(e) and e["trigger"] == "AUTO" end)

      Enum.each(auto_events, fn event ->
        actions = event["actions"] || []
        if actions != [] do
          case EventRunner.execute(actions, char_id, char_state) do
            {:ok, responses} ->
              Enum.each(responses, fn r -> push(socket, "event_action", r) end)
            {:halted, responses, pending} ->
              Enum.each(responses, fn r -> push(socket, "event_action", r) end)
              assign(socket, :pending_event_choice, %{pending: pending, char_state: char_state})
            _ -> nil
          end
        end
      end)
    end

    # Unread mail count
    case Repo.query("SELECT COUNT(*) AS n FROM character_mail WHERE recipient_char_id=? AND is_deleted=0 AND is_read=0", [char_id]) do
      {:ok, %{rows: [[n]]}} when n > 0 -> push(socket, "mail_unread_count", %{count: n})
      _ -> nil
    end

    Logger.info("#{char["name"]} joined Map #{map_id}")
    {:noreply, socket}
  end

  defp do_move(socket, player, char_id, target_x, target_y, now) do
    map_data = MapData.get(player.map_id)
    if is_nil(map_data) do
      {:noreply, socket}
    else
      dx = abs(target_x - player.x)
      dy = abs(target_y - player.y)

      cond do
        # Must move exactly 1 tile (cardinal or diagonal)
        (dx + dy) < 1 or dx > 1 or dy > 1 ->
          push(socket, "force_move", %{x: player.x, y: player.y})
          {:noreply, socket}

        # Check map edge — neighbor transition
        target_x < 0 or target_x >= map_data.width or target_y < 0 or target_y >= map_data.height ->
          handle_map_edge(socket, player, char_id, target_x, target_y, map_data)

        # Passability check
        not tile_passable?(map_data, target_x, target_y) ->
          push(socket, "force_move", %{x: player.x, y: player.y})
          {:noreply, socket}

        true ->
          # Valid move — update position
          PlayerRegistry.update(char_id, %{x: target_x, y: target_y, last_move_time: now})

          # Broadcast to map (all players on this map see the move)
          TePhoenixWeb.Endpoint.broadcast!("map:#{player.map_id}", "player_moved", %{
            id: char_id, x: target_x, y: target_y
          })

          # Push confirmation to the mover's own socket so the client
          # doesn't need to subscribe to the map channel just to learn
          # its own position (the old snap-back bug was caused by the
          # client predicting blindly with no positive confirmation).
          push(socket, "move_confirmed", %{x: target_x, y: target_y})

          # Check hazards at new position
          check_hazards(socket, char_id, player.map_id, target_x, target_y)

          # Check STEP_ON / PROXIMITY / REGION_ENTER events
          check_movement_events(socket, char_id, player, map_data, target_x, target_y)

          # Random encounter check
          check_random_encounters(socket, char_id, player.map_id, target_x, target_y, player.level)

          # Arena zone check
          check_arena_zone(socket, char_id, player.map_id, target_x, target_y)

          {:noreply, socket}
      end
    end
  end

  defp do_move_continuous(socket, player, char_id, target_x, target_y, now) do
    map_data = MapData.get(player.map_id)
    if is_nil(map_data) do
      {:noreply, socket}
    else
      # Anti-teleport: max 3 tiles from last position per update
      dx = abs(target_x - player.x)
      dy = abs(target_y - player.y)

      cond do
        # Same position — no-op
        target_x == player.x and target_y == player.y ->
          {:noreply, socket}

        # Too far from last known position (speed hack detection)
        dx > 3 or dy > 3 ->
          push(socket, "force_move", %{x: player.x, y: player.y})
          {:noreply, socket}

        # Out of bounds — check map edge transition
        target_x < 0 or target_x >= map_data.width or target_y < 0 or target_y >= map_data.height ->
          handle_map_edge(socket, player, char_id, target_x, target_y, map_data)

        # Passability check
        not tile_passable?(map_data, target_x, target_y) ->
          push(socket, "force_move", %{x: player.x, y: player.y})
          {:noreply, socket}

        true ->
          # Valid move — update position
          PlayerRegistry.update(char_id, %{x: target_x, y: target_y, last_move_time: now})

          # Broadcast to map (all players on this map see the move)
          TePhoenixWeb.Endpoint.broadcast!("map:#{player.map_id}", "player_moved", %{
            id: char_id, x: target_x, y: target_y
          })

          # Push confirmation to the mover's own socket so the client
          # doesn't need to subscribe to the map channel just to learn
          # its own position (the old snap-back bug was caused by the
          # client predicting blindly with no positive confirmation).
          push(socket, "move_confirmed", %{x: target_x, y: target_y})

          # Movement events (step-on triggers, encounters, etc.)
          check_hazards(socket, char_id, player.map_id, target_x, target_y)
          check_movement_events(socket, char_id, player, map_data, target_x, target_y)
          check_random_encounters(socket, char_id, player.map_id, target_x, target_y, player.level)
          check_arena_zone(socket, char_id, player.map_id, target_x, target_y)

          {:noreply, socket}
      end
    end
  end

  defp do_teleport(socket, player, char_id, new_map_id, map_data, payload) do
    old_map_id = player.map_id

    # Calculate spawn position
    spawn_x = parse_int(payload["x"]) |> fallback(map_data.spawn_x) |> fallback(div(map_data.width, 2))
    spawn_y = parse_int(payload["y"]) |> fallback(map_data.spawn_y) |> fallback(div(map_data.height, 2))

    # Unsubscribe from old map, subscribe to new
    TePhoenixWeb.Endpoint.unsubscribe("map:#{old_map_id}")
    TePhoenixWeb.Endpoint.broadcast!("map:#{old_map_id}", "player_left", %{char_id: char_id})

    # Update position
    PlayerRegistry.update(char_id, %{map_id: new_map_id, x: spawn_x, y: spawn_y, in_arena: nil})

    try do
      Repo.query!("UPDATE characters SET map_id=?, x=?, y=? WHERE id=?",
        [new_map_id, spawn_x, spawn_y, char_id])
    rescue
      _ -> nil
    end

    TePhoenixWeb.Endpoint.subscribe("map:#{new_map_id}")

    # Discover fast travel point
    if map_data.fast_travel_enabled do
      discover_warp_point(socket, char_id, new_map_id, map_data.name)
    end

    # Send new map data
    push(socket, "map_data", map_data)

    region = MapData.get_region(new_map_id)
    push(socket, "map_changed", %{
      mapId: new_map_id,
      mapName: map_data.name,
      x: spawn_x, y: spawn_y,
      zoneType: map_data.zone_type || "WORLD",
      floorNumber: map_data.floor_number,
      dungeonName: map_data.dungeon_name,
      region: if(region, do: %{
        id: region["id"], name: region["name"],
        danger_level: region["danger_level"],
        is_sanctuary: region["is_sanctuary"],
        pvp_enabled: region["pvp_enabled"],
        xp_mult: region["xp_mult"], gold_mult: region["gold_mult"]
      })
    })

    # Send players + NPCs on new map
    map_players = PlayerRegistry.on_map(new_map_id) |> Enum.filter(fn p -> p.char_id != char_id end)
    push(socket, "player_list", %{players: map_players})

    npcs = MapData.get_npcs(new_map_id)
    push(socket, "npc_list", %{npcs: npcs})

    # Fire location_enter trigger event
    TePhoenixWeb.Endpoint.broadcast!("user:#{char_id}", "trigger_event", %{event: "location_enter", map_id: new_map_id})

    # Announce arrival
    updated_player = PlayerRegistry.get(char_id)
    TePhoenixWeb.Endpoint.broadcast!("map:#{new_map_id}", "player_joined", updated_player)

    send_ground_items(socket, new_map_id)
    send_structures(socket, new_map_id)

    socket = assign(socket, :map_id, new_map_id)
    {:noreply, socket}
  end

  defp handle_npc_interact(socket, char_id, player, npc) do
    npc_name = npc["name"] || "NPC"

    # Load NPC memory for this player
    {facts, reputation} = case Repo.query(
      "SELECT facts_json, reputation FROM npc_memories WHERE char_id=? AND npc_name=?",
      [char_id, npc_name]
    ) do
      {:ok, %{rows: [[facts_json, rep]]}} ->
        {parse_json(facts_json, []), rep || 0}
      _ -> {[], 0}
    end

    # Build NPC interaction menu
    char_state = load_char_state(char_id)
    choices = []

    # Quest offers
    quest_offers = npc["quest_offers"] || []
    choices = if quest_offers != [] do
      case Repo.query(
        "SELECT id, name FROM game_quests WHERE id IN (#{Enum.map_join(quest_offers, ",", fn _ -> "?" end)}) AND is_active=1",
        quest_offers
      ) do
        {:ok, %{rows: rows}} ->
          Enum.reduce(rows, choices, fn [qid, qname], acc ->
            active_quests = get_in(char_state, ["quests", "active"]) || %{}
            label = if Map.has_key?(active_quests, to_string(qid)),
              do: "📜 \"#{qname}\" — Check in",
              else: "📜 \"#{qname}\" — Tell me more"
            acc ++ [%{id: "quest_#{qid}", text: label}]
          end)
        _ -> choices
      end
    else
      choices
    end

    # Shop
    shop_id = npc["shop_id"]
    choices = if shop_id do
      choices ++ [%{id: "shop_#{shop_id}", text: "🏪 Browse your wares"}]
      |> then(fn c -> if reputation >= 20, do: c ++ [%{id: "haggle_#{shop_id}", text: "💰 Ask for a deal..."}], else: c end)
    else
      choices
    end

    # Companion recruit
    choices = if npc["is_recruitable"] do
      meets_rep = reputation >= (npc["recruit_rep_req"] || 50)
      recruit_option = if meets_rep,
        do: %{id: "companion_recruit", text: "⚔️ Join my party!"},
        else: %{id: "companion_locked_rep", text: "🔒 Join my party (needs higher reputation)"}
      choices ++ [recruit_option]
    else
      choices
    end

    # Always offer talk + farewell
    choices = choices ++ [
      %{id: "talk", text: "💬 Just talking"},
      %{id: "farewell", text: "👋 Farewell"}
    ]

    # Greeting based on reputation
    greeting = cond do
      reputation > 50 -> "*#{npc_name} smiles.* \"Good to see you again, #{player.name}.\""
      reputation < -30 -> "*#{npc_name} eyes you warily.* \"You again. What do you want?\""
      facts != [] -> "\"Ah, you're back. What can I do for you?\""
      true -> "*#{npc_name} looks you over.* \"Yes? What do you need?\""
    end

    socket = assign(socket, :talking_to_npc, npc)

    push(socket, "event_queue", %{events: [
      %{cmd: "dialogue", speaker: npc_name, text: greeting},
      %{cmd: "npc_choice_menu", npcName: npc_name, choices: choices}
    ]})

    {:noreply, socket}
  end

  defp handle_map_edge(socket, player, char_id, target_x, target_y, map_data) do
    {neighbor_id, new_x, new_y} = cond do
      target_y < 0 and map_data.neighbor_north ->
        {map_data.neighbor_north, target_x, nil}
      target_y >= map_data.height and map_data.neighbor_south ->
        {map_data.neighbor_south, target_x, 0}
      target_x < 0 and map_data.neighbor_west ->
        {map_data.neighbor_west, nil, target_y}
      target_x >= map_data.width and map_data.neighbor_east ->
        {map_data.neighbor_east, 0, target_y}
      true -> {nil, nil, nil}
    end

    if neighbor_id do
      neighbor = MapData.get(neighbor_id)
      if neighbor do
        # Calculate entry position
        final_x = if is_nil(new_x), do: neighbor.width - 1, else: min(max(new_x, 0), neighbor.width - 1)
        final_y = if is_nil(new_y), do: neighbor.height - 1, else: min(max(new_y, 0), neighbor.height - 1)

        # Transition to neighbor map
        do_teleport(socket, player, char_id, neighbor_id, neighbor, %{"x" => final_x, "y" => final_y})
      else
        push(socket, "force_move", %{x: player.x, y: player.y})
        {:noreply, socket}
      end
    else
      push(socket, "force_move", %{x: player.x, y: player.y})
      {:noreply, socket}
    end
  end

  defp tile_passable?(map_data, x, y) do
    idx = y * map_data.width + x
    passability = map_data.passability || []

    if passability != [] do
      Enum.at(passability, idx) != 1
    else
      tiles = map_data.tiles || []
      tile_id = Enum.at(tiles, idx)
      # Blocked tile IDs: 0 = void, other blocking tiles
      tile_id != nil and tile_id != 0
    end
  end

  defp check_hazards(socket, char_id, map_id, x, y) do
    case Repo.query("SELECT * FROM game_map_hazards WHERE map_id=? AND x=? AND y=?", [map_id, x, y]) do
      {:ok, %{rows: rows, columns: cols}} when rows != [] ->
        Enum.each(rows, fn row ->
          hz = Enum.zip(cols, row) |> Map.new()
          if (hz["damage_per_step"] || 0) > 0 do
            Repo.query("UPDATE characters SET current_hp=GREATEST(0, current_hp-?) WHERE id=?", [hz["damage_per_step"], char_id])
            push(socket, "notification", %{type: "warning", message: "#{hz["description"] || hz["hazard_type"]}: -#{hz["damage_per_step"]} HP"})
          end
          if (hz["heal_per_step"] || 0) > 0 do
            Repo.query("UPDATE characters SET current_hp=LEAST(max_hp, current_hp+?) WHERE id=?", [hz["heal_per_step"], char_id])
            push(socket, "notification", %{type: "success", message: "#{hz["description"] || "Healing zone"}: +#{hz["heal_per_step"]} HP"})
          end
          if hz["status_effect_id"] do
            try do
              Repo.query!(
                "INSERT INTO character_status_effects (character_id, status_id, source, expires_at) VALUES (?,?,'hazard',DATE_ADD(NOW(), INTERVAL 60 SECOND)) ON DUPLICATE KEY UPDATE expires_at=DATE_ADD(NOW(), INTERVAL 60 SECOND)",
                [char_id, hz["status_effect_id"]]
              )
            rescue _ -> nil
            end
          end
        end)
      _ -> nil
    end
  end

  defp check_movement_events(socket, char_id, _player, map_data, x, y) do
    events = map_data.events || []
    if events == [], do: :ok

    char_state = load_char_state(char_id)

    # STEP_ON events
    step_events = Enum.filter(events, fn e ->
      is_map(e) and e["trigger"] == "STEP_ON" and e["x"] == x and e["y"] == y
    end)

    char_state = Enum.reduce(step_events, char_state, fn event, state ->
      actions = event["actions"] || []
      if actions != [] do
        case EventRunner.execute(actions, char_id, state) do
          {:ok, responses} ->
            Enum.each(responses, fn r -> push(socket, "event_action", r) end)
            # Reload state in case it changed
            load_char_state(char_id)
          _ -> state
        end
      else
        state
      end
    end)

    # PROXIMITY events (within radius)
    prox_events = Enum.filter(events, fn e ->
      if is_map(e) and e["trigger"] == "PROXIMITY" do
        radius = e["radius"] || 3
        dist = abs((e["x"] || 0) - x) + abs((e["y"] || 0) - y)
        dist <= radius
      else
        false
      end
    end)

    Enum.each(prox_events, fn event ->
      actions = event["actions"] || []
      if actions != [] do
        case EventRunner.execute(actions, char_id, char_state) do
          {:ok, responses} -> Enum.each(responses, fn r -> push(socket, "event_action", r) end)
          _ -> nil
        end
      end
    end)
  end

  defp check_random_encounters(socket, _char_id, map_id, x, y, level) do
    case Repo.query(
      "SELECT * FROM game_map_spawns WHERE map_id=? AND enabled=1 AND ?>=x_min AND ?<=x_max AND ?>=y_min AND ?<=y_max",
      [map_id, x, x, y, y]
    ) do
      {:ok, %{rows: rows, columns: cols}} when rows != [] ->
        # Try one encounter per step
        Enum.reduce_while(rows, nil, fn row, _acc ->
          zone = Enum.zip(cols, row) |> Map.new()
          rate = zone["encounter_rate"] || 10

          if :rand.uniform(100) > rate do
            {:cont, nil}
          else
            # Level check
            min_lvl = zone["min_level"] || 1
            max_lvl = zone["max_level"] || 50
            if level < min_lvl or level > max_lvl do
              {:cont, nil}
            else
              # Pick enemy from encounter table
              table = parse_json(zone["encounter_table"], [])
              if table == [] do
                {:cont, nil}
              else
                total_weight = Enum.reduce(table, 0, fn e, s -> s + (e["weight"] || 1) end)
                roll = :rand.uniform() * total_weight
                picked = pick_weighted(table, roll)

                push(socket, "random_encounter", %{
                  zoneName: zone["name"],
                  npcId: picked["npc_id"],
                  npcName: picked["name"] || "Enemy"
                })

                {:halt, :done}
              end
            end
          end
        end)
      _ -> nil
    end
  end

  defp check_arena_zone(socket, char_id, map_id, x, y) do
    player = PlayerRegistry.get(char_id)
    was_in_arena = player[:in_arena]

    case Repo.query(
      "SELECT id, name, type, min_level, max_level, entry_fee, reward_multiplier FROM game_arenas WHERE map_id=? AND enabled=1 AND ?>=x_min AND ?<=x_max AND ?>=y_min AND ?<=y_max LIMIT 1",
      [map_id, x, x, y, y]
    ) do
      {:ok, %{rows: [[id, name, type, min_lvl, max_lvl, fee, mult]]}} ->
        if is_nil(was_in_arena) do
          # Entered arena
          arena = %{arenaId: id, arenaName: name, arenaType: type || "OPEN_PVP",
                    minLevel: min_lvl, maxLevel: max_lvl, entryFee: fee || 0,
                    rewardMultiplier: parse_float(mult, 1.0)}
          PlayerRegistry.update(char_id, %{in_arena: arena})
          push(socket, "arena_entered", arena)
          TePhoenixWeb.Endpoint.broadcast!("map:#{map_id}", "player_arena_changed", %{charId: char_id, inArena: arena})
        end

      _ ->
        if not is_nil(was_in_arena) do
          # Left arena
          PlayerRegistry.update(char_id, %{in_arena: nil})
          push(socket, "arena_left", %{})
          TePhoenixWeb.Endpoint.broadcast!("map:#{map_id}", "player_arena_changed", %{charId: char_id, inArena: nil})
        end
    end
  end

  defp check_rep_gate(char_id, map_id) do
    region = MapData.get_region(map_id)
    if is_nil(region), do: :ok

    case Repo.query("SELECT * FROM game_region_rep_gates WHERE region_id=?", [region["id"]]) do
      {:ok, %{rows: rows, columns: cols}} when rows != [] ->
        blocked = Enum.find(rows, fn row ->
          gate = Enum.zip(cols, row) |> Map.new()
          case Repo.query("SELECT reputation FROM player_faction_rep WHERE character_id=? AND faction_id=?",
            [char_id, gate["faction_id"]]) do
            {:ok, %{rows: [[rep]]}} ->
              rep < (gate["min_reputation"] || 0) or
              (gate["max_reputation"] != nil and rep > gate["max_reputation"])
            _ -> true  # No rep record = blocked
          end
        end)

        if blocked do
          gate = Enum.zip(cols, blocked) |> Map.new()
          {:blocked, gate["deny_message"] || "You are not welcome here."}
        else
          :ok
        end

      _ -> :ok
    end
  end

  defp discover_warp_point(socket, char_id, map_id, map_name) do
    case Repo.query("SELECT state_json FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[json]]}} ->
        state = parse_json(json, %{})
        warp_points = state["warpPoints"] || []

        if not Enum.any?(warp_points, fn wp -> (wp["mapId"] || wp["map_id"]) == map_id end) do
          warp_points = warp_points ++ [%{"mapId" => map_id, "name" => map_name, "discoveredAt" => System.system_time(:millisecond)}]
          new_state = Map.put(state, "warpPoints", warp_points)
          try do
            Repo.query!("UPDATE characters SET state_json=? WHERE id=?", [Jason.encode!(new_state), char_id])
          rescue _ -> nil
          end
          push(socket, "warp_discovered", %{mapId: map_id, name: map_name})
        end
      _ -> nil
    end
  end

  defp run_map_event(events, trigger_type, x, y, char_id, char_state) do
    matching = Enum.filter(events, fn e ->
      is_map(e) and e["trigger"] == trigger_type and e["x"] == x and e["y"] == y
    end)

    actions = matching |> Enum.flat_map(fn e -> e["actions"] || [] end)
    if actions != [] do
      EventRunner.execute(actions, char_id, char_state)
    else
      {:ok, []}
    end
  end

  defp load_char_state(char_id) do
    case Repo.query("SELECT state_json FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[json]]}} -> parse_json(json, %{})
      _ -> %{}
    end
  end

  defp load_greet_data(_char_id, char_state) do
    enable = case Repo.query("SELECT setting_value FROM system_settings WHERE setting_key='enable_greet_system'") do
      {:ok, %{rows: [[val]]}} -> val == "true" or val == "1"
      _ -> false
    end

    greeted = char_state["greeted"] || []
    has_greeted = char_state["hasGreeted"] || []
    {enable, greeted, has_greeted}
  end

  defp send_active_statuses(socket, char_id) do
    case Repo.query(
      "SELECT s.id, s.name, s.icon, s.type, s.effects FROM character_status_effects cse JOIN game_statuses s ON s.id=cse.status_id WHERE cse.character_id=? AND (cse.expires_at IS NULL OR cse.expires_at > NOW())",
      [char_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        statuses = Enum.map(rows, fn row ->
          Enum.zip(cols, row) |> Map.new() |> Map.take(["id", "name", "icon", "type"])
        end)
        push(socket, "active_statuses", %{statuses: statuses})

        # Merge overworld effects
        ow_fx = Enum.reduce(rows, %{}, fn row, acc ->
          data = Enum.zip(cols, row) |> Map.new()
          fx = parse_json(data["effects"], %{})
          Map.merge(acc, fx)
        end)
        push(socket, "overworld_effects", ow_fx)
      _ -> nil
    end
  end

  defp send_ground_items(socket, map_id) do
    case Repo.query(
      "SELECT id, item_id, x, y, quantity, dropped_by FROM game_ground_items WHERE map_id=? AND (expires_at IS NULL OR expires_at > NOW())",
      [map_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        items = Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
        push(socket, "ground_items", %{items: items})
      _ -> nil
    end
  end

  defp send_structures(socket, map_id) do
    case Repo.query(
      "SELECT id, x, y, name, icon, owner_id, data_json FROM game_deployed_structures WHERE map_id=? AND is_active=1 AND (expires_at IS NULL OR expires_at > NOW())",
      [map_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        structs = Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
        push(socket, "deployed_structures", %{structures: structs})
      _ -> nil
    end
  end

  defp send_tile_palette(socket) do
    # Cache tile palette globally via persistent_term
    palette = case :persistent_term.get(:tile_palette, nil) do
      nil -> load_tile_palette()
      cached -> cached
    end
    push(socket, "tile_palette", %{tiles: palette})
  end

  defp load_tile_palette do
    case Repo.query(
      "SELECT t.id, t.name, t.color, t.category, t.is_passable, t.animation_id, a.frame_tiles, a.fps FROM game_tile_types t LEFT JOIN game_tile_animations a ON a.id=t.animation_id AND a.is_active=1 WHERE t.is_active=1 ORDER BY t.sort_order"
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        palette = Enum.map(rows, fn row ->
          tile = Enum.zip(cols, row) |> Map.new()
          Map.update(tile, "frame_tiles", nil, fn ft -> parse_json(ft, nil) end)
        end)
        :persistent_term.put(:tile_palette, palette)
        palette
      _ -> []
    end
  end

  defp pick_weighted(table, roll) do
    Enum.reduce_while(table, roll, fn entry, remaining ->
      weight = entry["weight"] || 1
      if remaining - weight <= 0 do
        {:halt, entry}
      else
        {:cont, remaining - weight}
      end
    end)
    |> case do
      result when is_map(result) -> result
      _ -> List.first(table) || %{}
    end
  end

  defp fallback(0, other), do: other || 0
  defp fallback(nil, other), do: other || 0
  defp fallback(val, _other), do: val

  defp parse_int(nil), do: 0
  defp parse_int(val) when is_integer(val), do: val
  defp parse_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp parse_int(_), do: 0

  defp parse_float(nil, default), do: default
  defp parse_float(val, _default) when is_float(val), do: val
  defp parse_float(val, _default) when is_integer(val), do: val * 1.0
  defp parse_float(val, default) when is_binary(val) do
    case Float.parse(val) do
      {f, _} -> f
      :error -> default
    end
  end
  defp parse_float(_, default), do: default

  defp parse_json(nil, default), do: default
  defp parse_json("", default), do: default
  defp parse_json(val, default) when is_binary(val) do
    case Jason.decode(val) do
      {:ok, parsed} -> parsed
      _ -> default
    end
  end
  defp parse_json(val, _default) when is_map(val) or is_list(val), do: val
  defp parse_json(_, default), do: default
end
