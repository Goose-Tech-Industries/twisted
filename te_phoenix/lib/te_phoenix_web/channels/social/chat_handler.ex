defmodule TePhoenixWeb.Social.ChatHandler do
  @moduledoc """
  Chat, emotes, presence, friends, greet, inspect, profile, guestbook.
  Ported from socket-social.js sections 1 + social interactions.
  """

  import Phoenix.Channel

  alias TePhoenix.Game.PlayerRegistry
  alias TePhoenix.Repo

  @emotes %{
    "wave" => "waves cheerfully", "bow" => "bows respectfully",
    "cheer" => "cheers!", "laugh" => "bursts out laughing",
    "cry" => "weeps dramatically", "think" => "strokes their chin thoughtfully",
    "shrug" => "shrugs", "dance" => "breaks into a wild dance",
    "salute" => "stands at attention and salutes", "kneel" => "kneels solemnly",
    "point" => "points dramatically into the distance",
    "sleep" => "has fallen asleep on their feet",
    "angry" => "shakes their fist at the sky", "clap" => "claps enthusiastically",
    "sit" => "sits down and rests"
  }

  @staff_roles ~w(ADMIN GM MOD STAFF OWNER)

  def handle("chat_send", %{"channel" => channel, "text" => text} = payload, socket) do
    char_id = socket.assigns[:char_id] || get_char_id(socket)
    p = PlayerRegistry.get(char_id)
    if is_nil(p), do: {:noreply, socket}

    msg = text |> to_string() |> String.trim() |> String.slice(0, 300) |> html_escape()
    if msg == "", do: {:noreply, socket}

    base_payload = %{
      channel: channel, from: p.name, fromCharId: p.char_id,
      role: p.role || "PLAYER", chatColor: p.chat_color,
      text: msg, ts: System.system_time(:millisecond)
    }

    case channel do
      "global" ->
        TePhoenixWeb.Endpoint.broadcast!("social:lobby", "chat_msg", base_payload)

      "local" ->
        TePhoenixWeb.Endpoint.broadcast!("map:#{p.map_id}", "chat_msg", base_payload)

      "party" ->
        # Party chat routed via party topic
        TePhoenixWeb.Endpoint.broadcast!("party:#{char_id}", "chat_msg", base_payload)

      "guild" ->
        case Repo.query("SELECT guild_id FROM guild_members WHERE character_id=? AND is_active=1", [char_id]) do
          {:ok, %{rows: [[gid]]}} ->
            TePhoenixWeb.Endpoint.broadcast!("guild:#{gid}", "chat_msg", base_payload)
          _ ->
            push(socket, "chat_msg", %{channel: "system", from: "System", text: "You are not in a guild.", ts: System.system_time(:millisecond)})
        end

      "dm" ->
        target_char_id = payload["targetCharId"]
        target_name = payload["targetName"]
        target = cond do
          target_char_id -> PlayerRegistry.get(parse_int(target_char_id))
          target_name ->
            PlayerRegistry.all() |> Enum.find(fn p -> String.downcase(p.name) == String.downcase(to_string(target_name)) end)
          true -> nil
        end

        if target do
          dm_payload = Map.put(base_payload, :targetName, target.name)
          push(socket, "chat_msg", dm_payload)
          TePhoenixWeb.Endpoint.broadcast!("user:#{target.char_id}", "chat_msg", dm_payload)
        else
          push(socket, "chat_msg", %{channel: "system", from: "System", text: "Player not found or offline.", ts: System.system_time(:millisecond)})
        end

      "announce" ->
        if is_staff?(p) do
          TePhoenixWeb.Endpoint.broadcast!("social:lobby", "chat_msg", Map.put(base_payload, :channel, "announce"))
        end

      "admin" ->
        if is_staff?(p) do
          TePhoenixWeb.Endpoint.broadcast!("staff:panel", "chat_msg", base_payload)
        end

      _ ->
        push(socket, "chat_msg", %{channel: "system", from: "System", text: "Unknown channel: #{channel}", ts: System.system_time(:millisecond)})
    end

    {:noreply, socket}
  end

  def handle("title_changed", %{"charId" => char_id, "title" => title}, socket) do
    p = PlayerRegistry.get(char_id)
    if p do
      TePhoenixWeb.Endpoint.broadcast!("map:#{p.map_id}", "player_title_changed", %{charId: char_id, title: title})
    end
    {:noreply, socket}
  end

  def handle("set_presence", %{"status" => status} = payload, socket) do
    valid = ~w(online away busy lfp invisible)
    if status not in valid, do: {:noreply, socket}

    char_id = get_char_id(socket)
    p = PlayerRegistry.get(char_id)
    if is_nil(p), do: {:noreply, socket}

    away_msg = (payload["awayMessage"] || "") |> String.slice(0, 255)
    PlayerRegistry.update(char_id, %{presence: status, away_message: away_msg})

    if status != "lfp" do
      try do Repo.query!("DELETE FROM lfp_listings WHERE character_id=?", [char_id])
      rescue _ -> nil end
    end

    TePhoenixWeb.Endpoint.broadcast!("map:#{p.map_id}", "player_presence_changed", %{
      charId: char_id, presence: status, awayMessage: away_msg
    })

    {:noreply, socket}
  end

  def handle("typing_dm", %{"targetCharId" => target_char_id, "isTyping" => is_typing}, socket) do
    char_id = get_char_id(socket)
    p = PlayerRegistry.get(char_id)
    if p do
      TePhoenixWeb.Endpoint.broadcast!("user:#{parse_int(target_char_id)}", "typing_dm_indicator", %{
        fromCharId: char_id, fromName: p.name, isTyping: !!is_typing
      })
    end
    {:noreply, socket}
  end

  def handle("emote", %{"emoteKey" => emote_key}, socket) do
    p = PlayerRegistry.get(get_char_id(socket))
    if is_nil(p), do: {:noreply, socket}

    action = Map.get(@emotes, emote_key)
    if action do
      text = "*#{p.name} #{action}*"
      TePhoenixWeb.Endpoint.broadcast!("map:#{p.map_id}", "chat_msg", %{
        channel: "local", from: p.name, fromCharId: p.char_id,
        text: text, isEmote: true, ts: System.system_time(:millisecond)
      })
      TePhoenixWeb.Endpoint.broadcast!("map:#{p.map_id}", "emote_bubble", %{charId: p.char_id, text: text})
    end
    {:noreply, socket}
  end

  def handle("friend_request_sent", %{"targetCharId" => target_char_id}, socket) do
    p = PlayerRegistry.get(get_char_id(socket))
    if p do
      TePhoenixWeb.Endpoint.broadcast!("user:#{parse_int(target_char_id)}", "friend_request_incoming", %{
        fromCharId: p.char_id, fromName: p.name
      })
    end
    {:noreply, socket}
  end

  def handle("greet_player", %{"targetCharId" => target_char_id}, socket) do
    char_id = get_char_id(socket)
    p = PlayerRegistry.get(char_id)
    tid = parse_int(target_char_id)
    if is_nil(p) or tid == 0 or tid == char_id, do: {:noreply, socket}

    try do
      # One-way: add greeter's char_id to TARGET's greeted list
      case Repo.query("SELECT state_json FROM characters WHERE id=?", [tid]) do
        {:ok, %{rows: [[json]]}} ->
          t_state = parse_json(json, %{})
          greeted = t_state["greeted"] || []
          if char_id not in greeted do
            t_state = Map.put(t_state, "greeted", greeted ++ [char_id])
            Repo.query!("UPDATE characters SET state_json=? WHERE id=?", [Jason.encode!(t_state), tid])
          end
        _ -> nil
      end

      # Track who greeter has greeted
      case Repo.query("SELECT state_json FROM characters WHERE id=?", [char_id]) do
        {:ok, %{rows: [[json]]}} ->
          my_state = parse_json(json, %{})
          has_greeted = my_state["hasGreeted"] || []
          if tid not in has_greeted do
            my_state = Map.put(my_state, "hasGreeted", has_greeted ++ [tid])
            Repo.query!("UPDATE characters SET state_json=? WHERE id=?", [Jason.encode!(my_state), char_id])
          end
        _ -> nil
      end

      push(socket, "greet_ack", %{targetCharId: tid, sent: true})
      TePhoenixWeb.Endpoint.broadcast!("user:#{tid}", "greet_received", %{fromCharId: char_id, fromName: p.name})
    rescue
      _ -> nil
    end

    {:noreply, socket}
  end

  def handle("inspect_player", %{"targetCharId" => target_char_id}, socket) do
    tid = parse_int(target_char_id)

    result = case Repo.query(
      "SELECT c.id, c.name, c.level, c.title, c.profile_bio, cl.name AS class_name, cl.icon AS class_icon, r.name AS race_name, gm.guild_id, g.name AS guild_name, gm.rank AS guild_rank FROM characters c LEFT JOIN game_classes cl ON cl.id=c.class_id LEFT JOIN game_races r ON r.id=c.race_id LEFT JOIN guild_members gm ON gm.character_id=c.id AND gm.is_active=1 LEFT JOIN guilds g ON g.id=gm.guild_id WHERE c.id=? LIMIT 1",
      [tid]
    ) do
      {:ok, %{rows: [row], columns: cols}} ->
        char = Enum.zip(cols, row) |> Map.new()

        equipment = case Repo.query("SELECT ce.slot_key AS slot, i.name, i.icon, i.type, i.rarity FROM character_equipment ce JOIN game_items i ON i.id=ce.item_id WHERE ce.character_id=?", [tid]) do
          {:ok, %{rows: rows, columns: ecols}} -> Enum.map(rows, fn row -> Enum.zip(ecols, row) |> Map.new() end)
          _ -> []
        end

        %{success: true, character: Map.put(char, "equipment", equipment)}

      _ -> %{success: false}
    end

    push(socket, "inspect_result", result)
    {:noreply, socket}
  end

  def handle("view_profile", %{"targetCharId" => target_char_id}, socket) do
    char_id = get_char_id(socket)
    tid = parse_int(target_char_id)

    # Increment view count
    if tid != char_id do
      try do Repo.query!("UPDATE characters SET profile_views=profile_views+1 WHERE id=?", [tid])
      rescue _ -> nil end
    end

    profile = case Repo.query(
      "SELECT c.id, c.name, c.level, c.equipped_title, c.profile_bio, c.profile_color, c.profile_banner_emoji, c.profile_favorite_quote, c.profile_signature, c.profile_views, c.presence_status, c.profile_music_url, c.profile_background, c.profile_status, c.profile_pinned_achievements, c.show_profile_viewers, cl.name AS class_name, r.name AS race_name, g.name AS guild_name, gm.rank AS guild_rank FROM characters c LEFT JOIN game_classes cl ON cl.id=c.class_id LEFT JOIN game_races r ON r.id=c.race_id LEFT JOIN guild_members gm ON gm.character_id=c.id AND gm.is_active=1 LEFT JOIN guilds g ON g.id=gm.guild_id WHERE c.id=? LIMIT 1",
      [tid]
    ) do
      {:ok, %{rows: [row], columns: cols}} ->
        char = Enum.zip(cols, row) |> Map.new()

        equipment = case Repo.query("SELECT ce.slot_key AS slot, i.name, i.icon, i.rarity FROM character_equipment ce JOIN game_items i ON i.id=ce.item_id WHERE ce.character_id=?", [tid]) do
          {:ok, %{rows: rows, columns: c}} -> Enum.map(rows, fn r -> Enum.zip(c, r) |> Map.new() end)
          _ -> []
        end

        top_friends = case Repo.query("SELECT tf.slot, tf.friend_char_id, c2.name, c2.level FROM character_top_friends tf JOIN characters c2 ON c2.id=tf.friend_char_id WHERE tf.character_id=? ORDER BY tf.slot", [tid]) do
          {:ok, %{rows: rows, columns: c}} -> Enum.map(rows, fn r -> Enum.zip(c, r) |> Map.new() end)
          _ -> []
        end

        guestbook = case Repo.query("SELECT id, author_char_id, author_name, message, created_at FROM profile_guestbook WHERE profile_char_id=? AND is_deleted=0 ORDER BY created_at DESC LIMIT 20", [tid]) do
          {:ok, %{rows: rows, columns: c}} -> Enum.map(rows, fn r -> Enum.zip(c, r) |> Map.new() end)
          _ -> []
        end

        %{success: true, profile: char |> Map.merge(%{
          "equipment" => equipment, "topFriends" => top_friends,
          "guestbook" => guestbook, "isOwnProfile" => tid == char_id
        })}

      _ -> %{success: false}
    end

    push(socket, "profile_data", profile)
    {:noreply, socket}
  end

  def handle("guestbook_post", %{"targetCharId" => target_char_id, "message" => message}, socket) do
    char_id = get_char_id(socket)
    tid = parse_int(target_char_id)
    text = (message || "") |> String.trim() |> String.slice(0, 500)
    if text == "", do: {:noreply, socket}

    try do
      # Rate limit: 1 per profile per 24h
      case Repo.query("SELECT id FROM profile_guestbook WHERE profile_char_id=? AND author_char_id=? AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)", [tid, char_id]) do
        {:ok, %{rows: [_]}} ->
          push(socket, "guestbook_result", %{success: false, message: "You can only post once per profile every 24 hours."})

        _ ->
          html = text |> html_escape()

          case Repo.query("SELECT name, equipped_title, profile_color FROM characters WHERE id=?", [char_id]) do
            {:ok, %{rows: [[name, title, color]]}} ->
              Repo.query!("INSERT INTO profile_guestbook (profile_char_id, author_char_id, author_name, author_title, author_color, message, message_html) VALUES (?,?,?,?,?,?,?)",
                [tid, char_id, name, title, color, text, html])
              push(socket, "guestbook_result", %{success: true})
              TePhoenixWeb.Endpoint.broadcast!("user:#{tid}", "notification", %{type: "info", message: "#{name} left a message on your profile!"})
            _ -> nil
          end
      end
    rescue
      _ -> push(socket, "guestbook_result", %{success: false, message: "Error posting."})
    end

    {:noreply, socket}
  end

  def handle(_, _, socket), do: {:noreply, socket}

  # ── Private ─────────────────────────────────────────────────────

  defp get_char_id(socket) do
    socket.assigns[:char_id] ||
      case Repo.query("SELECT id FROM characters WHERE user_id=? LIMIT 1", [socket.assigns.user_id]) do
        {:ok, %{rows: [[id]]}} -> id
        _ -> nil
      end
  end

  defp is_staff?(p), do: String.upcase(p.role || "") in @staff_roles

  defp html_escape(str) do
    str
    |> String.replace("&", "&amp;")
    |> String.replace("<", "&lt;")
    |> String.replace(">", "&gt;")
    |> String.replace("\"", "&quot;")
  end

  defp parse_int(val) when is_integer(val), do: val
  defp parse_int(val) when is_binary(val) do
    case Integer.parse(val) do {n, _} -> n; :error -> 0 end
  end
  defp parse_int(_), do: 0

  defp parse_json(nil, d), do: d
  defp parse_json("", d), do: d
  defp parse_json(v, d) when is_binary(v) do
    case Jason.decode(v) do {:ok, p} -> p; _ -> d end
  end
  defp parse_json(v, _) when is_map(v) or is_list(v), do: v
  defp parse_json(_, d), do: d
end
