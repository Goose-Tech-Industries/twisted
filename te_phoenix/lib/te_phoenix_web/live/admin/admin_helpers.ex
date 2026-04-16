defmodule TePhoenixWeb.Admin.AdminHelpers do
  @moduledoc """
  Shared on_mount hook for all admin LiveViews.
  Provides: pinned notes strip, shoutbox, staff buddy dock, DM pop-ups.
  """

  import Phoenix.Component, only: [assign: 2, assign: 3, update: 3]
  import Phoenix.LiveView, only: [attach_hook: 4, connected?: 1, put_flash: 3, push_event: 3]

  alias TePhoenix.Repo
  alias TePhoenix.Game.PlayerRegistry
  alias TePhoenix.Game.AdminPresence

  def on_mount(:load_pinned_notes, _params, session, socket) do
    staff_list = load_staff_list()

    socket = socket
      # Notes strip
      |> assign(:pinned_notes, load_pinned_notes())
      |> assign(:notes_input, "")
      |> assign(:notes_expanded, false)
      # Shoutbox (all-staff chat)
      |> assign(:chat_messages, load_chat_messages("general"))
      |> assign(:shoutbox_collapsed, false)
      # Staff dock (buddy list)
      |> assign(:staff_dock_open, true)
      |> assign(:staff_list, staff_list)
      # DM pop-ups
      |> assign(:open_dms, [])
      # Status picker
      |> assign(:my_status, "online")
      |> assign(:away_message, "")
      |> assign(:show_status_menu, false)
      # Emoji picker (which DM channel has emoji open, nil = none)
      |> assign(:emoji_channel, nil)
      # Group chats
      |> assign(:group_channels, load_group_channels(session["user_id"] || load_user_id_from_node_session()))
      |> assign(:show_create_group, false)
      |> assign(:new_group_name, "")
      |> assign(:group_selected_members, MapSet.new())
      # Session info (try Phoenix session, fall back to Node session cookie)
      |> assign(:session_user_id, session["user_id"] || load_user_id_from_node_session())
      |> assign(:session_username, session["username"] || load_username_from_node_session() || "Staff")
      |> assign(:session_role, session["role"] || load_role_from_node_session() || "STAFF")
      |> assign(:session_chat_color, load_user_chat_color(session["user_id"] || load_user_id_from_node_session()))

    # Update last_login on every mount (static + connected)
    uid = socket.assigns.session_user_id
    if uid do
      Repo.query("UPDATE users SET last_login=NOW(), last_login_date=CURDATE() WHERE id=?", [uid])
    end

    socket = if connected?(socket) do
      Phoenix.PubSub.subscribe(TePhoenix.PubSub, "staff_chat:general")
      Phoenix.PubSub.subscribe(TePhoenix.PubSub, "staff_notes")
      Phoenix.PubSub.subscribe(TePhoenix.PubSub, "staff_presence")
      :timer.send_interval(10_000, :refresh_staff_list)

      # Subscribe to group channels
      Enum.each(socket.assigns.group_channels, fn ch ->
        Phoenix.PubSub.subscribe(TePhoenix.PubSub, "staff_chat:#{ch}")
      end)

      # Auto-open recent DM conversations (last 24h)
      open_dms = load_recent_dms(uid, socket.assigns.staff_list)
      Enum.each(open_dms, fn dm ->
        Phoenix.PubSub.subscribe(TePhoenix.PubSub, "staff_chat:#{dm.channel}")
      end)

      # Track admin presence — register on AdminSauce with current page
      # AdminPresence monitors this process and auto-cleans on disconnect
      if uid do
        page = admin_page_name(socket.assigns[:active_tab])
        AdminPresence.track(uid, %{
          username: socket.assigns.session_username,
          role: socket.assigns.session_role,
          page: page
        })
      end

      socket
      |> assign(:staff_list, load_staff_list())
      |> assign(:open_dms, open_dms)
    else
      socket
    end

    socket = attach_hook(socket, :admin_events, :handle_event, &handle_event/3)
    socket = attach_hook(socket, :admin_info, :handle_info, &handle_info/2)

    {:cont, socket}
  end

  # ═══════════════════════════════════════════════════════════════
  # EVENT HANDLERS
  # ═══════════════════════════════════════════════════════════════

  # ── Notes ──────────────────────────────────────────────────────

  defp handle_event("toggle_notes", _p, socket), do: {:halt, assign(socket, :notes_expanded, !socket.assigns.notes_expanded)}

  defp handle_event("notes_input", %{"value" => v}, socket), do: {:halt, assign(socket, :notes_input, v)}

  defp handle_event("add_pinned_note", params, socket) do
    body = String.trim(params["body"] || socket.assigns.notes_input)
    if body != "" do
      author = socket.assigns.session_username
      Repo.query("INSERT INTO gm_notes (author_id, author, body, pinned) VALUES (?,?,?,1)",
        [socket.assigns.session_user_id || 0, author, String.slice(body, 0, 200)])
      Phoenix.PubSub.broadcast(TePhoenix.PubSub, "staff_notes", :notes_updated)
      {:halt, socket |> assign(:notes_input, "") |> assign(:notes_expanded, false) |> assign(:pinned_notes, load_pinned_notes())}
    else
      {:halt, socket}
    end
  end

  defp handle_event("unpin_note", %{"id" => id}, socket) do
    Repo.query("UPDATE gm_notes SET pinned=0 WHERE id=?", [to_int(id)])
    Phoenix.PubSub.broadcast(TePhoenix.PubSub, "staff_notes", :notes_updated)
    {:halt, assign(socket, :pinned_notes, load_pinned_notes())}
  end

  # ── Shoutbox ───────────────────────────────────────────────────

  defp handle_event("toggle_shoutbox", _p, socket), do: {:halt, assign(socket, :shoutbox_collapsed, !socket.assigns.shoutbox_collapsed)}

  defp handle_event("send_chat", params, socket) do
    body = String.trim(params["body"] || "")
    if body != "" do
      sender_id = socket.assigns.session_user_id || 0
      sender_name = socket.assigns.session_username
      sender_role = socket.assigns.session_role
      body = process_command(body, socket)

      Repo.query("INSERT INTO staff_messages (sender_id, sender_name, sender_role, channel, body) VALUES (?,?,?,?,?)",
        [sender_id, sender_name, sender_role, "general", String.slice(body, 0, 500)])

      msg = %{sender_name: sender_name, sender_role: sender_role, body: body, channel: "general", created_at: NaiveDateTime.utc_now(), chat_color: socket.assigns[:session_chat_color]}
      Phoenix.PubSub.broadcast(TePhoenix.PubSub, "staff_chat:general", {:staff_msg, msg})
      {:halt, socket}
    else
      {:halt, socket}
    end
  end

  # ── Staff Dock ─────────────────────────────────────────────────

  defp handle_event("toggle_staff_dock", _p, socket), do: {:halt, assign(socket, :staff_dock_open, !socket.assigns.staff_dock_open)}

  # ── DM Pop-ups ─────────────────────────────────────────────────

  defp handle_event("open_dm", %{"username" => username, "user_id" => user_id}, socket) do
    my_id = socket.assigns.session_user_id || 0
    target_id = to_int(user_id)
    channel = dm_channel(my_id, target_id)

    # Check if already open
    if Enum.any?(socket.assigns.open_dms, & &1.channel == channel) do
      {:halt, socket}
    else
      if connected?(socket), do: Phoenix.PubSub.subscribe(TePhoenix.PubSub, "staff_chat:#{channel}")
      messages = load_chat_messages(channel)

      # Look up target role
      target_role = case Enum.find(socket.assigns.staff_list, & &1.user_id == target_id) do
        %{role: r} -> r
        _ -> "STAFF"
      end

      dm = %{
        channel: channel,
        target_name: username,
        target_id: target_id,
        target_role: target_role,
        messages: messages,
        minimized: false
      }

      {:halt, update(socket, :open_dms, fn dms -> dms ++ [dm] end)}
    end
  end

  defp handle_event("close_dm", %{"channel" => channel}, socket) do
    if connected?(socket), do: Phoenix.PubSub.unsubscribe(TePhoenix.PubSub, "staff_chat:#{channel}")
    {:halt, update(socket, :open_dms, fn dms -> Enum.reject(dms, & &1.channel == channel) end)}
  end

  defp handle_event("toggle_dm_minimize", %{"channel" => channel}, socket) do
    {:halt, update(socket, :open_dms, fn dms ->
      Enum.map(dms, fn dm ->
        if dm.channel == channel, do: %{dm | minimized: !dm.minimized}, else: dm
      end)
    end)}
  end

  defp handle_event("send_dm", %{"channel" => channel, "body" => body}, socket) do
    body = String.trim(body)
    if body != "" do
      sender_id = socket.assigns.session_user_id || 0
      sender_name = socket.assigns.session_username
      sender_role = socket.assigns.session_role
      body = process_command(body, socket)

      Repo.query("INSERT INTO staff_messages (sender_id, sender_name, sender_role, channel, body) VALUES (?,?,?,?,?)",
        [sender_id, sender_name, sender_role, channel, String.slice(body, 0, 500)])

      msg = %{sender_name: sender_name, sender_role: sender_role, body: body, channel: channel, created_at: NaiveDateTime.utc_now(), chat_color: socket.assigns[:session_chat_color]}
      Phoenix.PubSub.broadcast(TePhoenix.PubSub, "staff_chat:#{channel}", {:staff_msg, msg})
      {:halt, socket}
    else
      {:halt, socket}
    end
  end

  # ── Group Chats ─────────────────────────────────────────────────

  defp handle_event("toggle_create_group", _p, socket) do
    {:halt, assign(socket,
      show_create_group: !socket.assigns.show_create_group,
      group_selected_members: MapSet.new(),
      new_group_name: ""
    )}
  end

  defp handle_event("new_group_name", %{"value" => v}, socket) do
    {:halt, assign(socket, :new_group_name, v)}
  end

  defp handle_event("toggle_group_member", %{"user_id" => user_id}, socket) do
    uid = to_int(user_id)
    members = socket.assigns.group_selected_members
    members = if MapSet.member?(members, uid), do: MapSet.delete(members, uid), else: MapSet.put(members, uid)
    {:halt, assign(socket, :group_selected_members, members)}
  end

  defp handle_event("create_group", params, socket) do
    name = (params["name"] || socket.assigns.new_group_name) |> String.trim()
    members = socket.assigns.group_selected_members

    if name != "" and MapSet.size(members) > 0 do
      # Create channel name from sorted member IDs
      my_id = socket.assigns.session_user_id || 0
      all_ids = MapSet.put(members, my_id) |> MapSet.to_list() |> Enum.sort()
      channel = "group:#{Enum.join(all_ids, "-")}:#{name |> String.downcase() |> String.replace(~r/[^a-z0-9]/, "")}"

      if connected?(socket), do: Phoenix.PubSub.subscribe(TePhoenix.PubSub, "staff_chat:#{channel}")
      messages = load_chat_messages(channel)

      # Build display name from member names
      member_names = socket.assigns.staff_list
        |> Enum.filter(fn s -> MapSet.member?(members, s.user_id) end)
        |> Enum.map(& &1.name)

      dm = %{
        channel: channel,
        target_name: name,
        target_id: 0,
        target_role: "GROUP",
        messages: messages,
        minimized: false,
        members: member_names
      }

      groups = socket.assigns.group_channels
      groups = if channel in groups, do: groups, else: groups ++ [channel]

      {:halt, socket
        |> update(:open_dms, fn dms ->
          if Enum.any?(dms, & &1.channel == channel), do: dms, else: dms ++ [dm]
        end)
        |> assign(:group_channels, groups)
        |> assign(:show_create_group, false)
        |> assign(:new_group_name, "")
        |> assign(:group_selected_members, MapSet.new())}
    else
      {:halt, socket}
    end
  end

  defp handle_event("delete_group", %{"channel" => channel}, socket) do
    # Delete all messages in this channel and remove from list
    Repo.query("DELETE FROM staff_messages WHERE channel=?", [channel])
    if connected?(socket), do: Phoenix.PubSub.unsubscribe(TePhoenix.PubSub, "staff_chat:#{channel}")

    {:halt, socket
      |> update(:group_channels, fn chs -> Enum.reject(chs, & &1 == channel) end)
      |> update(:open_dms, fn dms -> Enum.reject(dms, & &1.channel == channel) end)}
  end

  defp handle_event("open_group", %{"channel" => channel}, socket) do
    if connected?(socket), do: Phoenix.PubSub.subscribe(TePhoenix.PubSub, "staff_chat:#{channel}")
    messages = load_chat_messages(channel)
    name = String.replace_prefix(channel, "group:", "")

    dm = %{
      channel: channel,
      target_name: "##{name}",
      target_id: 0,
      target_role: "GROUP",
      messages: messages,
      minimized: false
    }

    {:halt, update(socket, :open_dms, fn dms ->
      if Enum.any?(dms, & &1.channel == channel), do: dms, else: dms ++ [dm]
    end)}
  end

  # ── Message Save (Snapchat-style) ───────────────────────────────

  defp handle_event("save_message", %{"msg_id" => msg_id}, socket) do
    uid = socket.assigns.session_user_id || 0
    Repo.query("UPDATE staff_messages SET saved=1, saved_by=? WHERE id=?", [uid, to_int(msg_id)])
    {:halt, put_flash(socket, :info, "Message saved")}
  end

  defp handle_event("unsave_message", %{"msg_id" => msg_id}, socket) do
    Repo.query("UPDATE staff_messages SET saved=0, saved_by=NULL WHERE id=?", [to_int(msg_id)])
    {:halt, put_flash(socket, :info, "Message unsaved")}
  end

  # ── Status Picker ──────────────────────────────────────────────

  defp handle_event("toggle_status_menu", _p, socket) do
    {:halt, assign(socket, :show_status_menu, !socket.assigns.show_status_menu)}
  end

  defp handle_event("set_status", %{"status" => status}, socket) do
    {:halt, socket |> assign(:my_status, status) |> assign(:show_status_menu, false) |> assign(:away_message, "")}
  end

  defp handle_event("set_away", %{"message" => msg}, socket) do
    {:halt, socket |> assign(:my_status, "away") |> assign(:away_message, msg) |> assign(:show_status_menu, false)}
  end

  # ── Emoji Picker ──────────────────────────────────────────────

  defp handle_event("toggle_emoji", %{"channel" => channel}, socket) do
    current = socket.assigns.emoji_channel
    {:halt, assign(socket, :emoji_channel, if(current == channel, do: nil, else: channel))}
  end

  # ── Nudge ─────────────────────────────────────────────────────

  defp handle_event("send_nudge", %{"user_id" => uid}, socket) do
    target_id = to_int(uid)
    from = socket.assigns.session_username
    Phoenix.PubSub.broadcast(TePhoenix.PubSub, "staff_presence", {:staff_nudge, %{from: from, target_id: target_id}})
    {:halt, put_flash(socket, :info, "Nudge sent!")}
  end

  # ── Pass through ───────────────────────────────────────────────

  defp handle_event(_event, _params, socket), do: {:cont, socket}

  # ═══════════════════════════════════════════════════════════════
  # INFO HANDLERS (PubSub)
  # ═══════════════════════════════════════════════════════════════

  defp handle_info({:staff_msg, %{channel: "general"} = msg}, socket) do
    socket = socket
      |> update(:chat_messages, fn msgs -> (msgs ++ [msg]) |> Enum.take(-50) end)
      |> push_event("new_chat_msg", %{})
    {:halt, socket}
  end

  defp handle_info({:staff_msg, %{channel: channel} = msg}, socket) do
    # Route to correct DM window
    socket = socket
      |> update(:open_dms, fn dms ->
        Enum.map(dms, fn dm ->
          if dm.channel == channel do
            %{dm | messages: (dm.messages ++ [msg]) |> Enum.take(-50)}
          else
            dm
          end
        end)
      end)
      |> push_event("new_chat_msg", %{})
    {:halt, socket}
  end

  defp handle_info(:notes_updated, socket) do
    {:halt, assign(socket, :pinned_notes, load_pinned_notes())}
  end

  defp handle_info(:refresh_staff_list, socket) do
    {:halt, assign(socket, :staff_list, load_staff_list())}
  end

  defp handle_info({:staff_sign_on, %{username: username, role: role}}, socket) do
    socket = socket
      |> assign(:staff_list, load_staff_list())
      |> Phoenix.LiveView.push_event("play_sound", %{type: "sign_on", username: username, role: role})
    {:halt, socket}
  end

  defp handle_info({:staff_sign_off, %{username: username}}, socket) do
    socket = socket
      |> assign(:staff_list, load_staff_list())
      |> Phoenix.LiveView.push_event("play_sound", %{type: "sign_off", username: username})
    {:halt, socket}
  end

  defp handle_info({:staff_nudge, %{from: from, target_id: target_id}}, socket) do
    my_id = socket.assigns.session_user_id
    if target_id == :all or target_id == my_id do
      {:halt, push_event(socket, "nudge", %{from: from})}
    else
      {:halt, socket}
    end
  end

  defp handle_info(_msg, socket), do: {:cont, socket}

  # ═══════════════════════════════════════════════════════════════
  # DATA LOADERS
  # ═══════════════════════════════════════════════════════════════

  def load_pinned_notes do
    case Repo.query("SELECT id, body, author FROM gm_notes WHERE pinned=1 ORDER BY created_at DESC LIMIT 5") do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, body, author] -> %{id: id, body: body, author: author} end)
      _ -> []
    end
  end

  defp load_chat_messages(channel) do
    case Repo.query(
      "SELECT sm.id, sm.sender_name, sm.sender_role, sm.body, sm.created_at, sm.saved, u.chat_color FROM staff_messages sm LEFT JOIN users u ON u.id=sm.sender_id WHERE sm.channel=? ORDER BY sm.created_at DESC LIMIT 50",
      [channel]
    ) do
      {:ok, %{rows: rows}} ->
        rows
        |> Enum.map(fn [id, name, role, body, ts, saved, chat_color] ->
          %{id: id, sender_name: name, sender_role: String.upcase(to_string(role || "STAFF")), body: body, created_at: ts, channel: channel, chat_color: chat_color, saved: saved == 1}
        end)
        |> Enum.reverse()
      _ -> []
    end
  end

  defp load_staff_list do
    # Check multiple sources for online status:
    # 1. PlayerRegistry (Phoenix channels)
    online_from_registry = PlayerRegistry.all()
      |> Enum.map(fn p -> Map.get(p, :user_id) || Map.get(p, "user_id") end)
      |> Enum.filter(& &1)
      |> MapSet.new()

    # 2. Users who logged in within the last 30 minutes (actually active, not just session alive)
    online_from_recent = case Repo.query(
      "SELECT id FROM users WHERE last_login > NOW() - INTERVAL 30 MINUTE"
    ) do
      {:ok, %{rows: rows}} -> rows |> Enum.map(fn [uid] -> uid end) |> MapSet.new()
      _ -> MapSet.new()
    end

    online_ids = MapSet.union(online_from_registry, online_from_recent)

    # Get all staff from DB
    staff = case Repo.query(
      "SELECT id, username, role, last_login, chat_color FROM users WHERE role IN ('ADMIN','GM','MOD','STAFF','OWNER') ORDER BY last_login DESC LIMIT 30"
    ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, name, role, last_login, chat_color] ->
          %{user_id: id, name: name, role: role, online: MapSet.member?(online_ids, id), last_login: last_login, chat_color: chat_color}
        end)
      _ -> []
    end

    role_weight = %{"OWNER" => 5, "ADMIN" => 4, "GM" => 3, "MOD" => 2, "STAFF" => 1}
    Enum.sort_by(staff, fn s ->
      {if(s.online, do: 0, else: 1), -(Map.get(role_weight, s.role, 0))}
    end)
  end

  # Load user info from Node's Express session (stored in MySQL sessions table)
  # Gets the most recently active session
  defp load_user_id_from_node_session do
    case Repo.query("SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.userId')) AS UNSIGNED) as uid FROM sessions WHERE expires > UNIX_TIMESTAMP() ORDER BY expires DESC LIMIT 1") do
      {:ok, %{rows: [[uid]]}} ->
        id = to_int(uid)
        if id > 0, do: id, else: nil
      _ -> nil
    end
  end

  defp load_username_from_node_session do
    case Repo.query("SELECT JSON_UNQUOTE(JSON_EXTRACT(data, '$.username')) FROM sessions WHERE expires > UNIX_TIMESTAMP() ORDER BY expires DESC LIMIT 1") do
      {:ok, %{rows: [[name]]}} when is_binary(name) -> name
      _ -> nil
    end
  end

  defp load_role_from_node_session do
    case Repo.query("SELECT JSON_UNQUOTE(JSON_EXTRACT(data, '$.role')) FROM sessions WHERE expires > UNIX_TIMESTAMP() ORDER BY expires DESC LIMIT 1") do
      {:ok, %{rows: [[role]]}} when is_binary(role) -> role
      _ -> nil
    end
  end

  defp load_recent_dms(nil, _staff_list), do: []
  defp load_recent_dms(user_id, staff_list) do
    # Find DM channels with NEW messages (sent by others, after our last login)
    last_login = case Repo.query("SELECT last_login FROM users WHERE id=?", [user_id]) do
      {:ok, %{rows: [[ts]]}} when not is_nil(ts) -> ts
      _ -> nil
    end

    # Only auto-open DMs that have unread messages from OTHER people
    time_clause = if last_login do
      {"AND sm.created_at > ? AND sm.sender_id != ?", [last_login, user_id]}
    else
      {"AND sm.created_at > NOW() - INTERVAL 7 DAY AND sm.sender_id != ?", [user_id]}
    end

    case Repo.query(
      "SELECT DISTINCT sm.channel FROM staff_messages sm WHERE sm.channel LIKE 'dm:%' #{elem(time_clause, 0)} ORDER BY sm.created_at DESC",
      elem(time_clause, 1)
    ) do
      {:ok, %{rows: rows}} ->
        rows
        |> Enum.map(fn [ch] -> ch end)
        |> Enum.filter(fn ch ->
          case String.split(ch, ":") do
            ["dm", id_a, id_b] -> user_id == to_int(id_a) or user_id == to_int(id_b)
            _ -> false
          end
        end)
        |> Enum.map(fn ch ->
          ["dm", id_a, id_b] = String.split(ch, ":")
          other_id = if to_int(id_a) == user_id, do: to_int(id_b), else: to_int(id_a)
          other = Enum.find(staff_list, fn s -> s.user_id == other_id end)
          messages = load_chat_messages(ch)

          # Count unread (messages from other person after our last login)
          unread = if last_login do
            Enum.count(messages, fn m -> m.sender_name != (socket_username(user_id, staff_list)) and newer_than?(m.created_at, last_login) end)
          else
            length(messages)
          end

          %{
            channel: ch,
            target_name: if(other, do: other.name, else: "User #{other_id}"),
            target_id: other_id,
            target_role: if(other, do: other.role, else: "STAFF"),
            messages: messages,
            minimized: false,
            unread: unread
          }
        end)
      _ -> []
    end
  end

  defp socket_username(user_id, staff_list) do
    case Enum.find(staff_list, fn s -> s.user_id == user_id end) do
      %{name: name} -> name
      _ -> ""
    end
  end

  defp newer_than?(%NaiveDateTime{} = a, %NaiveDateTime{} = b), do: NaiveDateTime.compare(a, b) == :gt
  defp newer_than?(_, _), do: false

  defp load_group_channels(nil), do: []
  defp load_group_channels(user_id) do
    # Check if OWNER (sees all groups)
    is_owner = case Repo.query("SELECT role FROM users WHERE id=?", [user_id]) do
      {:ok, %{rows: [[role]]}} -> to_string(role) == "OWNER"
      _ -> false
    end

    case Repo.query("SELECT DISTINCT channel FROM staff_messages WHERE channel LIKE 'group:%' ORDER BY channel") do
      {:ok, %{rows: rows}} ->
        rows
        |> Enum.map(fn [ch] -> ch end)
        |> Enum.filter(fn ch ->
          if is_owner do
            true
          else
            case String.split(ch, ":") do
              ["group", ids_str, _name] ->
                ids = String.split(ids_str, "-") |> Enum.map(&to_int/1)
                user_id in ids
              _ -> false
            end
          end
        end)
      _ -> []
    end
  end

  defp load_user_chat_color(nil), do: nil
  defp load_user_chat_color(user_id) do
    case Repo.query("SELECT chat_color FROM users WHERE id=?", [user_id]) do
      {:ok, %{rows: [[color]]}} -> color
      _ -> nil
    end
  end

  defp process_command(body, socket) do
    cond do
      String.starts_with?(body, "/help") ->
        """
        📖 *Chat Commands:*
        /roll — Roll d20
        /roll 3d6 — Roll 3 six-sided dice
        /nudge — Nudge everyone in this chat
        /me <action> — Action text (e.g. /me waves)
        /shrug — ¯\\_(ツ)_/¯
        /tableflip — (╯°□°）╯︵ ┻━┻
        /unflip — ┬─┬ノ( º _ ºノ)
        *bold* _italic_ ~strike~
        """

      String.starts_with?(body, "/nudge") ->
        from = socket.assigns.session_username
        Phoenix.PubSub.broadcast(TePhoenix.PubSub, "staff_presence", {:staff_nudge, %{from: from, target_id: :all}})
        "⚡ #{from} sent a nudge!"

      String.starts_with?(body, "/me ") ->
        action = String.replace_prefix(body, "/me ", "")
        "_#{socket.assigns.session_username} #{action}_"

      body == "/shrug" -> "¯\\_(ツ)_/¯"
      body == "/tableflip" -> "(╯°□°）╯︵ ┻━┻"
      body == "/unflip" -> "┬─┬ノ( º _ ºノ)"

      String.starts_with?(body, "/roll") -> maybe_roll_dice(body)

      true -> body
    end
  end

  defp maybe_roll_dice(body) do
    if String.starts_with?(body, "/roll") do
      {count, sides} = parse_roll(body)
      rolls = for _ <- 1..count, do: :rand.uniform(sides)
      total = Enum.sum(rolls)
      "🎲 rolled #{count}d#{sides}: [#{Enum.join(rolls, ", ")}]#{if count > 1, do: " = #{total}", else: ""}"
    else
      body
    end
  end

  defp parse_roll(text) do
    case Regex.run(~r/\/roll\s*(\d*)d?(\d*)/, text) do
      [_, count_s, sides_s] ->
        count = min(max(to_int_default(count_s, 1), 1), 20)
        sides = min(max(to_int_default(sides_s, 20), 2), 100)
        {count, sides}
      _ -> {1, 20}
    end
  end

  defp to_int_default("", default), do: default
  defp to_int_default(s, _default) do
    case Integer.parse(s) do
      {n, _} -> n
      :error -> 1
    end
  end

  defp dm_channel(a, b), do: "dm:#{min(a, b)}:#{max(a, b)}"

  defp admin_page_name(:dashboard), do: "Dashboard"
  defp admin_page_name(:content), do: "Content Hub"
  defp admin_page_name(:combat), do: "Combat Hub"
  defp admin_page_name(:economy), do: "Economy Hub"
  defp admin_page_name(:gameplay), do: "Gameplay Hub"
  defp admin_page_name(:magic), do: "Magic Hub"
  defp admin_page_name(:config), do: "Config Hub"
  defp admin_page_name(:world), do: "World Hub"
  defp admin_page_name(:social), do: "Social Hub"
  defp admin_page_name(:gm_tools), do: "GM Tools"
  defp admin_page_name(:players), do: "Player Manager"
  defp admin_page_name(:campaign), do: "Campaign Hub"
  defp admin_page_name(:entities), do: "Entity Manager"
  defp admin_page_name(:roles), do: "Roles"
  defp admin_page_name(:settings), do: "Settings"
  defp admin_page_name(nil), do: "AdminSauce"
  defp admin_page_name(other) when is_atom(other), do: other |> Atom.to_string() |> String.capitalize()
  defp admin_page_name(_), do: "AdminSauce"

  defp to_int(val) when is_integer(val), do: val
  defp to_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp to_int(_), do: 0
end
