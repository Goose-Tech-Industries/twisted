defmodule TePhoenixWeb.Admin.PlayerManagerLive do
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo
  alias TePhoenix.Game.PlayerRegistry
  alias TePhoenix.Game.AdminPresence
  alias TePhoenix.Game.AdminAudit

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket,
      active_tab: :players,
      players: [],
      total: 0,
      page: 1,
      limit: 50,
      search: "",
      filter: "all",
      selected_player: nil,
      selected_chars: [],
      online_players: [],
      admin_presence: [],
      selected_ids: MapSet.new(),
      expanded_id: nil,
      expanded_data: nil,
      gold_amount: "1000",
      sort_col: "last_login",
      sort_dir: "desc",
      # Timed ban/mute
      ban_duration: "permanent",
      ban_reason: "",
      mute_duration: "permanent",
      # Comparison mode
      compare_mode: false,
      compare_ids: [],
      compare_data: nil,
      # Item recall
      recall_search: "",
      recall_items: [],
      show_recall_modal: false,
      # Broadcast
      broadcast_target_id: nil,
      broadcast_message: ""
    ) |> load_players() |> load_online()}
  end

  defp load_players(socket) do
    page = socket.assigns.page
    limit = socket.assigns.limit
    offset = (page - 1) * limit
    search = socket.assigns.search
    filter = socket.assigns.filter
    sort_col = socket.assigns.sort_col
    sort_dir = socket.assigns.sort_dir

    conditions = ["1=1"]
    params = []

    {conditions, params} = if search != "" do
      {conditions ++ ["(u.username LIKE ? OR u.email LIKE ?)"], params ++ ["%#{search}%", "%#{search}%"]}
    else
      {conditions, params}
    end

    {conditions, params} = case filter do
      "banned" -> {conditions ++ ["u.is_banned=1"], params}
      "staff" -> {conditions ++ ["u.role IN ('MOD','GM','ADMIN','OWNER')"], params}
      "muted" -> {conditions ++ ["u.is_muted=1"], params}
      "frozen" -> {conditions ++ ["u.is_frozen=1"], params}
      "new" -> {conditions ++ ["u.created_at >= NOW() - INTERVAL 24 HOUR"], params}
      "online" ->
        game_ids = Enum.map(PlayerRegistry.all(), fn data -> data[:user_id] end) |> Enum.reject(&is_nil/1)
        admin_ids = AdminPresence.online_user_ids() |> MapSet.to_list()
        online_ids = (game_ids ++ admin_ids) |> Enum.uniq()
        if online_ids != [] do
          placeholders = Enum.map_join(online_ids, ",", fn _ -> "?" end)
          {conditions ++ ["u.id IN (#{placeholders})"], params ++ online_ids}
        else
          {conditions ++ ["1=0"], params}
        end
      _ -> {conditions, params}
    end

    where = "WHERE " <> Enum.join(conditions, " AND ")

    # Sortable columns whitelist
    order_col = case sort_col do
      "username" -> "u.username"
      "role" -> "u.role"
      "currency" -> "u.currency"
      "char_count" -> "char_count"
      "created_at" -> "u.created_at"
      _ -> "u.last_login"
    end
    order_dir = if sort_dir == "asc", do: "ASC", else: "DESC"

    total = case Repo.query("SELECT COUNT(*) FROM users u #{where}", params) do
      {:ok, %{rows: [[c]]}} -> c
      _ -> 0
    end

    players = case Repo.query("""
      SELECT u.id, u.username, u.email, u.role, u.currency, u.is_banned, u.is_muted, u.is_frozen,
             u.last_login, u.chat_color, u.ban_expires_at, u.mute_expires_at,
             COUNT(c.id) AS char_count
      FROM users u LEFT JOIN characters c ON c.user_id=u.id
      #{where}
      GROUP BY u.id ORDER BY #{order_col} #{order_dir} LIMIT ? OFFSET ?
    """, params ++ [limit, offset]) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    assign(socket, players: players, total: total)
  end

  defp load_online(socket) do
    game_online = PlayerRegistry.all()
    admin_online = AdminPresence.all()
    assign(socket, online_players: game_online, admin_presence: admin_online)
  end

  # ── Search & Pagination ────────────────────────────────────────

  @impl true
  def handle_event("search", %{"search" => search}, socket) do
    {:noreply, assign(socket, search: search, page: 1) |> load_players()}
  end

  def handle_event("prev_page", _params, socket) do
    {:noreply, assign(socket, page: max(1, socket.assigns.page - 1)) |> load_players()}
  end

  def handle_event("next_page", _params, socket) do
    max_page = max(1, ceil(socket.assigns.total / socket.assigns.limit))
    {:noreply, assign(socket, page: min(max_page, socket.assigns.page + 1)) |> load_players()}
  end

  # ── Sortable Columns ──────────────────────────────────────────

  def handle_event("sort", %{"col" => col}, socket) do
    {new_col, new_dir} = if socket.assigns.sort_col == col do
      {col, if(socket.assigns.sort_dir == "asc", do: "desc", else: "asc")}
    else
      {col, "desc"}
    end
    {:noreply, assign(socket, sort_col: new_col, sort_dir: new_dir, page: 1) |> load_players()}
  end

  # ── Quick Filters ──────────────────────────────────────────────

  def handle_event("set_filter", %{"filter" => f}, socket) do
    {:noreply, assign(socket, filter: f, page: 1, selected_ids: MapSet.new()) |> load_players()}
  end

  # ── Expand Player Row ─────────────────────────────────────────

  def handle_event("expand_player", %{"id" => id}, socket) do
    id = to_int(id)
    if socket.assigns.expanded_id == id do
      {:noreply, assign(socket, expanded_id: nil, expanded_data: nil)}
    else
      data = load_expanded_player(id)
      {:noreply, assign(socket, expanded_id: id, expanded_data: data)}
    end
  end

  # ── Timed Ban ──────────────────────────────────────────────────

  def handle_event("update_ban_duration", %{"value" => val}, socket) do
    {:noreply, assign(socket, ban_duration: val)}
  end

  def handle_event("update_ban_reason", %{"value" => val}, socket) do
    {:noreply, assign(socket, ban_reason: val)}
  end

  def handle_event("ban", %{"id" => id}, socket) do
    uid = to_int(id)
    duration = socket.assigns.ban_duration
    reason = String.trim(socket.assigns.ban_reason)
    name = get_username(uid)
    a = actor(socket)

    {expires_at, duration_minutes} = parse_duration(duration)

    if expires_at do
      Repo.query("UPDATE users SET is_banned=1, ban_reason=?, ban_expires_at=? WHERE id=?", [reason, expires_at, uid])
    else
      Repo.query("UPDATE users SET is_banned=1, ban_reason=?, ban_expires_at=NULL WHERE id=?", [reason, uid])
    end

    # Log to moderation_actions
    log_moderation(uid, "ban", reason, duration_minutes, expires_at, a)
    AdminAudit.log("gm_ban", a, %{id: uid, name: name}, %{reason: reason, duration: duration})

    # Force kick if online
    kick_player_from_game(uid)

    {:noreply, socket
      |> put_flash(:info, "Player banned#{if duration != "permanent", do: " for #{duration}", else: " permanently"}.")
      |> assign(ban_reason: "", ban_duration: "permanent")
      |> load_players() |> refresh_expanded(uid)}
  end

  def handle_event("unban", %{"id" => id}, socket) do
    uid = to_int(id)
    name = get_username(uid)
    a = actor(socket)
    Repo.query("UPDATE users SET is_banned=0, ban_reason=NULL, ban_expires_at=NULL WHERE id=?", [uid])
    log_moderation(uid, "unban", nil, nil, nil, a)
    AdminAudit.log("gm_unban", a, %{id: uid, name: name})
    {:noreply, socket |> put_flash(:info, "Player unbanned.") |> load_players() |> refresh_expanded(uid)}
  end

  # ── Timed Mute ─────────────────────────────────────────────────

  def handle_event("update_mute_duration", %{"value" => val}, socket) do
    {:noreply, assign(socket, mute_duration: val)}
  end

  def handle_event("mute", %{"id" => id}, socket) do
    uid = to_int(id)
    duration = socket.assigns.mute_duration
    name = get_username(uid)
    a = actor(socket)

    {expires_at, duration_minutes} = parse_duration(duration)

    if expires_at do
      Repo.query("UPDATE users SET is_muted=1, mute_expires_at=? WHERE id=?", [expires_at, uid])
    else
      Repo.query("UPDATE users SET is_muted=1, mute_expires_at=NULL WHERE id=?", [uid])
    end

    log_moderation(uid, "mute", nil, duration_minutes, expires_at, a)
    AdminAudit.log("gm_mute", a, %{id: uid, name: name}, %{duration: duration})
    {:noreply, socket |> put_flash(:info, "Player muted#{if duration != "permanent", do: " for #{duration}", else: " permanently"}.") |> assign(mute_duration: "permanent") |> load_players() |> refresh_expanded(uid)}
  end

  def handle_event("unmute", %{"id" => id}, socket) do
    uid = to_int(id)
    name = get_username(uid)
    a = actor(socket)
    Repo.query("UPDATE users SET is_muted=0, mute_expires_at=NULL WHERE id=?", [uid])
    log_moderation(uid, "unmute", nil, nil, nil, a)
    AdminAudit.log("gm_unmute", a, %{id: uid, name: name})
    {:noreply, socket |> put_flash(:info, "Player unmuted.") |> load_players() |> refresh_expanded(uid)}
  end

  # ── Force Kick ─────────────────────────────────────────────────

  def handle_event("kick", %{"id" => id}, socket) do
    uid = to_int(id)
    name = get_username(uid)
    a = actor(socket)

    kicked = kick_player_from_game(uid)
    log_moderation(uid, "kick", nil, nil, nil, a)
    AdminAudit.log("gm_kick", a, %{id: uid, name: name})

    msg = if kicked > 0, do: "Player kicked (#{kicked} character(s) disconnected).", else: "Player is not online."
    {:noreply, socket |> put_flash(:info, msg) |> load_players() |> load_online() |> refresh_expanded(uid)}
  end

  # ── Freeze / Unfreeze ─────────────────────────────────────────

  def handle_event("freeze", %{"id" => id}, socket) do
    uid = to_int(id)
    name = get_username(uid)
    a = actor(socket)
    Repo.query("UPDATE users SET is_frozen=1 WHERE id=?", [uid])

    # Update in-memory registry so movement is blocked immediately
    for p <- PlayerRegistry.all(), p[:user_id] == uid do
      PlayerRegistry.update(p[:char_id], %{is_frozen: true})
    end

    log_moderation(uid, "freeze", nil, nil, nil, a)
    AdminAudit.log("gm_freeze", a, %{id: uid, name: name})
    {:noreply, socket |> put_flash(:info, "Player frozen.") |> load_players() |> refresh_expanded(uid)}
  end

  def handle_event("unfreeze", %{"id" => id}, socket) do
    uid = to_int(id)
    name = get_username(uid)
    a = actor(socket)
    Repo.query("UPDATE users SET is_frozen=0 WHERE id=?", [uid])

    for p <- PlayerRegistry.all(), p[:user_id] == uid do
      PlayerRegistry.update(p[:char_id], %{is_frozen: false})
    end

    log_moderation(uid, "unfreeze", nil, nil, nil, a)
    AdminAudit.log("gm_unfreeze", a, %{id: uid, name: name})
    {:noreply, socket |> put_flash(:info, "Player unfrozen.") |> load_players() |> refresh_expanded(uid)}
  end

  # ── Broadcast Popup to Player ──────────────────────────────────

  def handle_event("show_broadcast", %{"id" => id}, socket) do
    {:noreply, assign(socket, broadcast_target_id: to_int(id), broadcast_message: "")}
  end

  def handle_event("cancel_broadcast", _params, socket) do
    {:noreply, assign(socket, broadcast_target_id: nil, broadcast_message: "")}
  end

  def handle_event("update_broadcast_msg", %{"value" => val}, socket) do
    {:noreply, assign(socket, broadcast_message: val)}
  end

  def handle_event("send_broadcast", %{"id" => id}, socket) do
    uid = to_int(id)
    msg = String.trim(socket.assigns.broadcast_message)
    if msg == "" do
      {:noreply, put_flash(socket, :error, "Message cannot be empty.")}
    else
      name = get_username(uid)
      a = actor(socket)

      # Push to all online characters of this user
      for p <- PlayerRegistry.all(), p[:user_id] == uid do
        TePhoenixWeb.Endpoint.broadcast!("user:#{p[:char_id]}", "admin_popup", %{
          message: msg,
          from: a.name,
          timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
        })
      end

      AdminAudit.log("gm_broadcast_player", a, %{id: uid, name: name}, msg)
      {:noreply, socket |> put_flash(:info, "Popup sent to #{name}.") |> assign(broadcast_target_id: nil, broadcast_message: "")}
    end
  end

  # ── Send System Message ────────────────────────────────────────

  def handle_event("send_system_message", %{"id" => id, "subject" => subject, "body" => body}, socket) do
    uid = to_int(id)
    subject = String.trim(subject)
    body = String.trim(body)

    if body == "" do
      {:noreply, put_flash(socket, :error, "Message body required.")}
    else
      a = actor(socket)
      subject = if subject == "", do: "Message from #{a.name}", else: subject

      Repo.query(
        "INSERT INTO system_messages (user_id, sender_name, sender_id, subject, body, message_type) VALUES (?, ?, ?, ?, ?, 'admin')",
        [uid, a.name, a.id, subject, body]
      )

      # Push notification if online
      for p <- PlayerRegistry.all(), p[:user_id] == uid do
        TePhoenixWeb.Endpoint.broadcast!("user:#{p[:char_id]}", "system_message", %{
          subject: subject, body: body, from: a.name
        })
      end

      name = get_username(uid)
      AdminAudit.log("gm_system_message", a, %{id: uid, name: name}, %{subject: subject})
      {:noreply, socket |> put_flash(:info, "System message sent to #{name}.")}
    end
  end

  # ── Warning System ─────────────────────────────────────────────

  def handle_event("issue_warning", %{"id" => id, "reason" => reason, "severity" => severity}, socket) do
    uid = to_int(id)
    reason = String.trim(reason)
    if reason == "" do
      {:noreply, put_flash(socket, :error, "Warning reason required.")}
    else
      name = get_username(uid)
      a = actor(socket)
      Repo.query(
        "INSERT INTO player_warnings (user_id, warned_by, warned_by_name, reason, warning_level) VALUES (?, ?, ?, ?, ?)",
        [uid, a.id, a.name, reason, severity]
      )
      Repo.query("UPDATE users SET warning_level=COALESCE(warning_level,0)+1 WHERE id=?", [uid])

      log_moderation(uid, "warn", reason, nil, nil, a)

      # Auto-escalate: 3+ warnings = auto-ban
      case Repo.query("SELECT warning_level FROM users WHERE id=?", [uid]) do
        {:ok, %{rows: [[level]]}} when is_integer(level) and level >= 3 ->
          Repo.query("UPDATE users SET is_banned=1, ban_reason='Auto-ban: 3+ warnings' WHERE id=?", [uid])
          log_moderation(uid, "ban", "Auto-ban: 3+ warnings", nil, nil, %{id: 0, name: "System"})
          AdminAudit.log("gm_auto_ban", %{id: 0, name: "System"}, %{id: uid, name: name}, "Auto-ban: warning level #{level}")
          kick_player_from_game(uid)
        _ -> :ok
      end

      AdminAudit.log("gm_warn", a, %{id: uid, name: name}, %{reason: reason, severity: severity})
      {:noreply, socket |> put_flash(:info, "Warning issued.") |> load_players() |> refresh_expanded(uid)}
    end
  end

  # ── Role ───────────────────────────────────────────────────────

  def handle_event("set_role", %{"id" => id, "role" => role}, socket) do
    uid = to_int(id)
    if role in ~w(PLAYER MOD GM ADMIN OWNER) do
      Repo.query("UPDATE users SET role=? WHERE id=?", [role, uid])
      name = get_username(uid)
      AdminAudit.log("gm_role_change", actor(socket), %{id: uid, name: name}, role)
      {:noreply, socket |> put_flash(:info, "Role set to #{role}.") |> load_players() |> refresh_expanded(uid)}
    else
      {:noreply, put_flash(socket, :error, "Invalid role.")}
    end
  end

  # ── Quick Gold ─────────────────────────────────────────────────

  def handle_event("quick_gold", %{"id" => id, "amount" => amount}, socket) do
    uid = to_int(id)
    amt = to_int(amount)
    if amt != 0 do
      Repo.query("UPDATE users SET currency=GREATEST(0, currency+?) WHERE id=?", [amt, uid])
      name = get_username(uid)
      AdminAudit.log("gm_give_gold", actor(socket), %{id: uid, name: name}, %{amount: amt})
      data = load_expanded_player(uid)
      {:noreply, socket |> put_flash(:info, "#{if amt > 0, do: "+"}#{amt} gold.") |> assign(expanded_data: data) |> load_players()}
    else
      {:noreply, socket}
    end
  end

  def handle_event("update_gold_amount", %{"value" => val}, socket) do
    {:noreply, assign(socket, gold_amount: val)}
  end

  # ── Bulk Select ────────────────────────────────────────────────

  def handle_event("toggle_select", %{"id" => id}, socket) do
    id = to_int(id)
    selected = socket.assigns.selected_ids
    selected = if MapSet.member?(selected, id), do: MapSet.delete(selected, id), else: MapSet.put(selected, id)
    {:noreply, assign(socket, selected_ids: selected)}
  end

  def handle_event("select_all", _params, socket) do
    ids = Enum.map(socket.assigns.players, fn p -> p["id"] end) |> MapSet.new()
    {:noreply, assign(socket, selected_ids: ids)}
  end

  def handle_event("select_none", _params, socket) do
    {:noreply, assign(socket, selected_ids: MapSet.new())}
  end

  def handle_event("bulk_ban", _params, socket) do
    ids = MapSet.to_list(socket.assigns.selected_ids)
    if ids != [] do
      placeholders = Enum.map_join(ids, ",", fn _ -> "?" end)
      Repo.query("UPDATE users SET is_banned=1 WHERE id IN (#{placeholders})", ids)
      a = actor(socket)
      for uid <- ids, do: log_moderation(uid, "ban", "Bulk ban", nil, nil, a)
      AdminAudit.log("gm_bulk_ban", a, nil, %{count: length(ids), user_ids: ids})
      {:noreply, socket |> put_flash(:info, "#{length(ids)} players banned.") |> assign(selected_ids: MapSet.new()) |> load_players()}
    else
      {:noreply, socket}
    end
  end

  def handle_event("bulk_unban", _params, socket) do
    ids = MapSet.to_list(socket.assigns.selected_ids)
    if ids != [] do
      placeholders = Enum.map_join(ids, ",", fn _ -> "?" end)
      Repo.query("UPDATE users SET is_banned=0, ban_expires_at=NULL WHERE id IN (#{placeholders})", ids)
      a = actor(socket)
      for uid <- ids, do: log_moderation(uid, "unban", nil, nil, nil, a)
      AdminAudit.log("gm_bulk_unban", a, nil, %{count: length(ids), user_ids: ids})
      {:noreply, socket |> put_flash(:info, "#{length(ids)} players unbanned.") |> assign(selected_ids: MapSet.new()) |> load_players()}
    else
      {:noreply, socket}
    end
  end

  def handle_event("bulk_set_role", %{"role" => role}, socket) do
    ids = MapSet.to_list(socket.assigns.selected_ids)
    if ids != [] and role in ~w(PLAYER MOD GM ADMIN OWNER) do
      placeholders = Enum.map_join(ids, ",", fn _ -> "?" end)
      Repo.query("UPDATE users SET role=? WHERE id IN (#{placeholders})", [role | ids])
      AdminAudit.log("gm_bulk_role", actor(socket), nil, %{role: role, count: length(ids), user_ids: ids})
      {:noreply, socket |> put_flash(:info, "#{length(ids)} players set to #{role}.") |> assign(selected_ids: MapSet.new()) |> load_players()}
    else
      {:noreply, socket}
    end
  end

  # ── Comparison Mode ────────────────────────────────────────────

  def handle_event("toggle_compare_mode", _params, socket) do
    {:noreply, assign(socket, compare_mode: !socket.assigns.compare_mode, compare_ids: [], compare_data: nil)}
  end

  def handle_event("toggle_compare", %{"id" => id}, socket) do
    id = to_int(id)
    ids = socket.assigns.compare_ids
    ids = if id in ids, do: List.delete(ids, id), else: (if length(ids) < 2, do: ids ++ [id], else: ids)
    {:noreply, assign(socket, compare_ids: ids)}
  end

  def handle_event("run_compare", _params, socket) do
    ids = socket.assigns.compare_ids
    if length(ids) == 2 do
      data = Enum.map(ids, &load_comparison_data/1)
      {:noreply, assign(socket, compare_data: data)}
    else
      {:noreply, put_flash(socket, :error, "Select exactly 2 players to compare.")}
    end
  end

  def handle_event("close_compare", _params, socket) do
    {:noreply, assign(socket, compare_data: nil, compare_ids: [], compare_mode: false)}
  end

  # ── Server-Wide Item Recall ────────────────────────────────────

  def handle_event("show_recall", _params, socket) do
    {:noreply, assign(socket, show_recall_modal: true, recall_search: "", recall_items: [])}
  end

  def handle_event("close_recall", _params, socket) do
    {:noreply, assign(socket, show_recall_modal: false, recall_search: "", recall_items: [])}
  end

  def handle_event("recall_search", %{"value" => q}, socket) do
    items = if String.length(q) >= 2 do
      case Repo.query("SELECT id, name, icon, rarity FROM game_items WHERE name LIKE ? ORDER BY name LIMIT 20", ["%#{q}%"]) do
        {:ok, %{rows: rows}} -> Enum.map(rows, fn [id, n, ic, r] -> %{id: id, name: n, icon: ic || "📦", rarity: r} end)
        _ -> []
      end
    else
      []
    end
    {:noreply, assign(socket, recall_search: q, recall_items: items)}
  end

  def handle_event("recall_item", %{"item-id" => item_id}, socket) do
    iid = to_int(item_id)
    a = actor(socket)

    # Count how many will be removed
    {count, affected} = case Repo.query("""
      SELECT COUNT(*), COUNT(DISTINCT ci.character_id)
      FROM character_items ci WHERE ci.item_id=?
    """, [iid]) do
      {:ok, %{rows: [[c, a]]}} -> {c, a}
      _ -> {0, 0}
    end

    if count > 0 do
      Repo.query("DELETE FROM character_items WHERE item_id=?", [iid])
      item_name = case Repo.query("SELECT name FROM game_items WHERE id=?", [iid]) do
        {:ok, %{rows: [[n]]}} -> n
        _ -> "Item ##{iid}"
      end

      log_moderation(0, "item_recall", "Recalled #{item_name}", nil, nil, a, %{item_id: iid, count: count, affected_chars: affected})
      AdminAudit.log("gm_item_recall", a, nil, %{item_id: iid, item_name: item_name, removed: count, affected_characters: affected})

      {:noreply, socket
        |> put_flash(:info, "Recalled #{count} copies of #{item_name} from #{affected} character(s).")
        |> assign(show_recall_modal: false, recall_search: "", recall_items: [])}
    else
      {:noreply, put_flash(socket, :error, "No players have this item.")}
    end
  end

  # ── View Player (legacy sidebar) ──────────────────────────────

  def handle_event("view_player", %{"id" => id}, socket) do
    user_id = to_int(id)

    player = case Repo.query(
      "SELECT id, username, email, role, currency, is_banned, created_at, last_login FROM users WHERE id=?",
      [user_id]
    ) do
      {:ok, %{rows: [row], columns: cols}} -> Enum.zip(cols, row) |> Map.new()
      _ -> nil
    end

    chars = case Repo.query("""
      SELECT c.id, c.name, c.level, c.class_id, c.race_id, gc.name AS class_name, gr.name AS race_name
      FROM characters c
      LEFT JOIN game_classes gc ON gc.id=c.class_id
      LEFT JOIN game_races gr ON gr.id=c.race_id
      WHERE c.user_id=? ORDER BY c.level DESC
    """, [user_id]) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    {:noreply, assign(socket, selected_player: player, selected_chars: chars)}
  end

  def handle_event("close_player", _params, socket) do
    {:noreply, assign(socket, selected_player: nil, selected_chars: [])}
  end

  # ── Data Loaders ───────────────────────────────────────────────

  defp load_expanded_player(user_id) do
    player = case Repo.query(
      "SELECT id, username, email, role, currency, is_banned, is_muted, is_frozen, ban_reason, ban_expires_at, mute_expires_at, created_at, last_login, login_streak, warning_level FROM users WHERE id=?",
      [user_id]
    ) do
      {:ok, %{rows: [row], columns: cols}} -> Enum.zip(cols, row) |> Map.new()
      _ -> nil
    end

    chars = case Repo.query("""
      SELECT c.id, c.name, c.level, c.current_hp, c.max_hp, c.map_id,
             gc.name AS class_name, gr.name AS race_name, gm.name AS map_name
      FROM characters c
      LEFT JOIN game_classes gc ON gc.id=c.class_id
      LEFT JOIN game_races gr ON gr.id=c.race_id
      LEFT JOIN game_maps gm ON gm.id=c.map_id
      WHERE c.user_id=? ORDER BY c.level DESC
    """, [user_id]) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    warnings = case Repo.query(
      "SELECT reason, warning_level AS severity, warned_by_name AS issued_by_name, created_at FROM player_warnings WHERE user_id=? ORDER BY created_at DESC LIMIT 10",
      [user_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    mod_history = case Repo.query(
      "SELECT action_type, reason, duration_minutes, performed_by_name, created_at FROM moderation_actions WHERE user_id=? ORDER BY created_at DESC LIMIT 15",
      [user_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    %{player: player, chars: chars, warnings: warnings, mod_history: mod_history}
  end

  defp load_comparison_data(user_id) do
    player = case Repo.query(
      "SELECT id, username, role, currency, is_banned, is_muted, is_frozen, created_at, last_login, login_streak, warning_level FROM users WHERE id=?",
      [user_id]
    ) do
      {:ok, %{rows: [row], columns: cols}} -> Enum.zip(cols, row) |> Map.new()
      _ -> nil
    end

    chars = case Repo.query("""
      SELECT c.id, c.name, c.level, c.atk, c.def, c.mo, c.md, c.speed, c.luck, c.current_hp, c.max_hp,
             gc.name AS class_name, gr.name AS race_name
      FROM characters c
      LEFT JOIN game_classes gc ON gc.id=c.class_id
      LEFT JOIN game_races gr ON gr.id=c.race_id
      WHERE c.user_id=? ORDER BY c.level DESC
    """, [user_id]) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    inv_value = case Repo.query("""
      SELECT COALESCE(SUM(ci.quantity * gi.value), 0)
      FROM character_items ci
      JOIN game_items gi ON gi.id=ci.item_id
      WHERE ci.character_id IN (SELECT id FROM characters WHERE user_id=?)
    """, [user_id]) do
      {:ok, %{rows: [[v]]}} -> v
      _ -> 0
    end

    mod_count = case Repo.query("SELECT COUNT(*) FROM moderation_actions WHERE user_id=?", [user_id]) do
      {:ok, %{rows: [[c]]}} -> c
      _ -> 0
    end

    %{player: player, chars: chars, inv_value: inv_value, mod_count: mod_count}
  end

  # ── Render ─────────────────────────────────────────────────────

  @impl true
  def render(assigns) do
    max_page = max(1, ceil(assigns.total / assigns.limit))
    game_ids = Enum.map(assigns.online_players, fn data -> data[:user_id] end) |> Enum.reject(&is_nil/1) |> MapSet.new()
    admin_ids = AdminPresence.online_user_ids()
    online_ids = MapSet.union(game_ids, admin_ids)
    admin_locations = Map.new(assigns.admin_presence, fn p -> {p[:user_id], "#{p[:page] || "AdminSauce"}"} end)
    game_locations = Map.new(assigns.online_players, fn p ->
      uid = p[:user_id]
      map_name = p[:map_name] || "Map #{p[:map_id] || "?"}"
      {uid, map_name}
    end)
    locations = Map.merge(game_locations, admin_locations)
    bulk_count = MapSet.size(assigns.selected_ids)
    total_online = MapSet.size(online_ids)

    duration_options = [{"Permanent", "permanent"}, {"15 min", "15m"}, {"1 hour", "1h"}, {"6 hours", "6h"}, {"24 hours", "24h"}, {"3 days", "3d"}, {"7 days", "7d"}, {"30 days", "30d"}]

    assigns = assign(assigns,
      max_page: max_page, online_ids: online_ids, locations: locations,
      bulk_count: bulk_count, total_online: total_online,
      duration_options: duration_options
    )

    ~H"""
    <div>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-amber-400">Player Manager</h2>
        <div class="flex items-center gap-3">
          <button phx-click="show_recall" class="px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-800/50 rounded text-xs hover:bg-red-800/40">Server Item Recall</button>
          <button phx-click="toggle_compare_mode"
            class={["px-3 py-1.5 rounded text-xs border transition-colors",
                     @compare_mode && "bg-indigo-900/50 text-indigo-400 border-indigo-700",
                     !@compare_mode && "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700"]}>
            {if @compare_mode, do: "Exit Compare", else: "Compare Players"}
          </button>
          <span class="text-xs text-green-400">{@total_online} online</span>
        </div>
      </div>

      <!-- Compare Mode Bar -->
      <div :if={@compare_mode} class="flex items-center gap-3 mb-4 px-4 py-2.5 bg-indigo-900/20 border border-indigo-800/30 rounded-lg">
        <span class="text-xs text-indigo-400 font-medium">Compare Mode: select 2 players</span>
        <span class="text-xs text-zinc-500">{length(@compare_ids)}/2 selected</span>
        <button :if={length(@compare_ids) == 2} phx-click="run_compare" class="ml-auto px-3 py-1 bg-indigo-700 text-white rounded text-xs hover:bg-indigo-600">Compare Now</button>
      </div>

      <!-- Comparison Panel -->
      <%= if @compare_data && length(@compare_data) == 2 do %>
        <.comparison_panel data={@compare_data} />
      <% end %>

      <!-- Item Recall Modal -->
      <div :if={@show_recall_modal} class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" phx-click="close_recall">
        <div class="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-[500px] max-h-[80vh] overflow-y-auto" phx-click-away="close_recall">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-red-400">Server-Wide Item Recall</h3>
            <button phx-click="close_recall" class="text-zinc-500 hover:text-zinc-300">x</button>
          </div>
          <p class="text-xs text-zinc-500 mb-3">Remove ALL copies of an item from every player's inventory server-wide.</p>
          <input type="text" placeholder="Search item name..." value={@recall_search}
            phx-keyup="recall_search"
            class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-red-500 focus:outline-none mb-3" />
          <div :if={@recall_items != []} class="space-y-1">
            <button :for={item <- @recall_items}
              phx-click="recall_item" phx-value-item-id={item.id}
              data-confirm={"RECALL ALL copies of #{item.name} from every player? This cannot be undone."}
              class="block w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-red-900/30 hover:text-red-300 rounded transition-colors">
              <span class="mr-2">{item.icon}</span>
              <span>{item.name}</span>
              <span class={"ml-2 text-[10px] #{rarity_color(item.rarity)}"}>{item.rarity}</span>
            </button>
          </div>
          <div :if={@recall_search != "" && @recall_items == []} class="text-xs text-zinc-600 italic py-2">No matching items</div>
        </div>
      </div>

      <!-- Filter Bar + Search -->
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <div class="flex gap-1">
          <button :for={{label, val, icon} <- [{"All", "all", ""}, {"Online", "online", ""}, {"Staff", "staff", ""}, {"Banned", "banned", ""}, {"Muted", "muted", ""}, {"Frozen", "frozen", ""}, {"New (24h)", "new", ""}]}
            phx-click="set_filter" phx-value-filter={val}
            class={["px-3 py-1.5 rounded text-xs font-medium transition-colors",
                     @filter == val && "bg-amber-600 text-white",
                     @filter != val && "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"]}>
            {label}
          </button>
        </div>

        <form phx-change="search" class="flex-1 max-w-sm">
          <input type="text" name="search" value={@search} placeholder="Search username or email..."
            phx-debounce="300"
            class="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
        </form>

        <span class="text-xs text-zinc-600">{@total} players</span>

        <div class="ml-auto flex items-center gap-2">
          <button phx-click="prev_page" disabled={@page <= 1}
            class="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs hover:bg-zinc-700 disabled:opacity-30">Prev</button>
          <span class="text-xs text-zinc-500">{@page} / {@max_page}</span>
          <button phx-click="next_page" disabled={@page >= @max_page}
            class="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs hover:bg-zinc-700 disabled:opacity-30">Next</button>
        </div>
      </div>

      <!-- Bulk Actions Bar -->
      <div :if={@bulk_count > 0} class="flex items-center gap-3 mb-4 px-4 py-2.5 bg-amber-900/20 border border-amber-800/30 rounded-lg">
        <span class="text-xs text-amber-400 font-medium">{@bulk_count} selected</span>
        <button phx-click="select_none" class="text-xs text-zinc-400 hover:text-zinc-300">Clear</button>
        <div class="ml-auto flex gap-2">
          <button phx-click="bulk_ban" data-confirm={"Ban #{@bulk_count} players?"}
            class="px-2.5 py-1 bg-red-900/50 text-red-400 border border-red-800/50 rounded text-xs hover:bg-red-800/50">Ban Selected</button>
          <button phx-click="bulk_unban" data-confirm={"Unban #{@bulk_count} players?"}
            class="px-2.5 py-1 bg-green-900/50 text-green-400 border border-green-800/50 rounded text-xs hover:bg-green-800/50">Unban Selected</button>
          <select phx-change="bulk_set_role" name="role"
            class="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300">
            <option value="">Set Role...</option>
            <option :for={r <- ~w(PLAYER MOD GM ADMIN OWNER)} value={r}>{r}</option>
          </select>
        </div>
      </div>

      <!-- Player Table -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-zinc-800 text-left">
              <th class="px-3 py-2.5 w-8">
                <button phx-click="select_all" class="text-[10px] text-zinc-500 hover:text-amber-400" title="Select all">All</button>
              </th>
              <th :if={@compare_mode} class="px-2 py-2.5 w-8"></th>
              <th class="px-3 py-2.5 w-8"></th>
              <.sortable_th col="username" label="Username" sort_col={@sort_col} sort_dir={@sort_dir} />
              <.sortable_th col="role" label="Role" sort_col={@sort_col} sort_dir={@sort_dir} />
              <.sortable_th col="currency" label="Gold" sort_col={@sort_col} sort_dir={@sort_dir} />
              <.sortable_th col="char_count" label="Chars" sort_col={@sort_col} sort_dir={@sort_dir} />
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Status</th>
              <.sortable_th col="last_login" label="Last Login" sort_col={@sort_col} sort_dir={@sort_dir} />
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            <%= for p <- @players do %>
            <tr class={["border-b border-zinc-800/50 transition-colors",
                       @expanded_id == p["id"] && "bg-amber-900/10 border-amber-800/30",
                       @expanded_id != p["id"] && "hover:bg-zinc-800/30",
                       login_age_class(p["last_login"])]}>
              <td class="px-3 py-2.5">
                <button phx-click="toggle_select" phx-value-id={p["id"]}
                  class={["text-sm cursor-pointer", MapSet.member?(@selected_ids, p["id"]) && "text-amber-400", !MapSet.member?(@selected_ids, p["id"]) && "text-zinc-600"]}>
                  {if MapSet.member?(@selected_ids, p["id"]), do: "[x]", else: "[ ]"}
                </button>
              </td>
              <td :if={@compare_mode} class="px-2 py-2.5">
                <button phx-click="toggle_compare" phx-value-id={p["id"]}
                  class={["text-xs px-1.5 py-0.5 rounded border transition-colors",
                           p["id"] in @compare_ids && "bg-indigo-900/50 text-indigo-400 border-indigo-700",
                           p["id"] not in @compare_ids && "bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-indigo-600"]}>
                  {if p["id"] in @compare_ids, do: "VS", else: "+"}
                </button>
              </td>
              <td class="px-1 py-2.5">
                <button phx-click="expand_player" phx-value-id={p["id"]} class="text-xs text-zinc-600 hover:text-amber-400">{if @expanded_id == p["id"], do: "v", else: ">"}</button>
              </td>
              <td class="px-3 py-2.5">
                <div class="flex items-center gap-2">
                  <span :if={MapSet.member?(@online_ids, p["id"])} class="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="Online"></span>
                  <a href={~p"/sauce/players/#{p["id"]}"} class="hover:underline">
                    <.styled_name name={p["username"]} role={p["role"] || "PLAYER"} chat_color={p["chat_color"]} class="text-sm font-medium" />
                  </a>
                </div>
              </td>
              <td class="px-3 py-2.5">
                <span class={["text-[10px] px-2 py-0.5 rounded font-medium", role_color(p["role"])]}>{p["role"] || "PLAYER"}</span>
              </td>
              <td class="px-3 py-2.5 text-sm text-amber-400/80 font-mono">{p["currency"] || 0}</td>
              <td class="px-3 py-2.5 text-sm text-zinc-400">{p["char_count"]}</td>
              <td class="px-3 py-2.5">
                <div class="flex flex-wrap gap-1">
                  <span :if={p["is_banned"] == 1} class="text-[10px] px-2 py-0.5 rounded bg-red-900/50 text-red-400">
                    Banned{if p["ban_expires_at"], do: " (#{format_expiry(p["ban_expires_at"])})", else: ""}
                  </span>
                  <span :if={p["is_muted"] == 1} class="text-[10px] px-2 py-0.5 rounded bg-orange-900/50 text-orange-400">
                    Muted{if p["mute_expires_at"], do: " (#{format_expiry(p["mute_expires_at"])})", else: ""}
                  </span>
                  <span :if={p["is_frozen"] == 1} class="text-[10px] px-2 py-0.5 rounded bg-cyan-900/50 text-cyan-400">Frozen</span>
                  <span :if={p["is_banned"] != 1 && MapSet.member?(@online_ids, p["id"])} class="text-[10px] px-2 py-0.5 rounded bg-green-900/30 text-green-500">Online</span>
                  <span :if={p["is_banned"] != 1 && !MapSet.member?(@online_ids, p["id"]) && p["is_frozen"] != 1} class="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-500">Offline</span>
                </div>
                <div :if={Map.has_key?(@locations, p["id"])} class="text-[10px] text-zinc-500 mt-0.5">{@locations[p["id"]]}</div>
              </td>
              <td class="px-3 py-2.5 text-[11px] text-zinc-600">{format_timestamp(p["last_login"])}</td>
              <td class="px-3 py-2.5">
                <div class="flex gap-1">
                  <button :if={MapSet.member?(@online_ids, p["id"])} phx-click="kick" phx-value-id={p["id"]} data-confirm="Kick this player?"
                    class="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-500 hover:bg-yellow-800/40" title="Kick">Kick</button>
                  <button :if={MapSet.member?(@online_ids, p["id"])} phx-click="show_broadcast" phx-value-id={p["id"]}
                    class="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 hover:bg-blue-800/40" title="Send popup">Msg</button>
                </div>
              </td>
            </tr>
            <!-- Expanded Detail Panel -->
            <tr :if={@expanded_id == p["id"] && @expanded_data} class="bg-zinc-950/50">
              <td colspan="11" class="p-0">
                <.expanded_panel p={p} data={@expanded_data} gold_amount={@gold_amount} ban_duration={@ban_duration} ban_reason={@ban_reason} mute_duration={@mute_duration} duration_options={@duration_options} online_ids={@online_ids} broadcast_target_id={@broadcast_target_id} broadcast_message={@broadcast_message} />
              </td>
            </tr>
            <% end %>
          </tbody>
        </table>

        <div :if={@players == []} class="p-8 text-center text-zinc-600 text-sm">No players found</div>
      </div>

      <!-- Broadcast Popup Modal (floating, for when triggered from Actions column) -->
      <div :if={@broadcast_target_id && @expanded_id != @broadcast_target_id} class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
        <div class="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-96">
          <h3 class="text-sm font-bold text-blue-400 mb-3">Send Popup to Player</h3>
          <textarea phx-keyup="update_broadcast_msg" rows="3" placeholder="Type your message..."
            class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-blue-500 focus:outline-none mb-3">{@broadcast_message}</textarea>
          <div class="flex gap-2 justify-end">
            <button phx-click="cancel_broadcast" class="px-3 py-1.5 bg-zinc-700 text-zinc-300 rounded text-xs">Cancel</button>
            <button phx-click="send_broadcast" phx-value-id={@broadcast_target_id} class="px-3 py-1.5 bg-blue-700 text-white rounded text-xs hover:bg-blue-600">Send</button>
          </div>
        </div>
      </div>
    </div>
    """
  end

  # ── Sortable Table Header ──────────────────────────────────────

  attr :col, :string, required: true
  attr :label, :string, required: true
  attr :sort_col, :string, required: true
  attr :sort_dir, :string, required: true

  defp sortable_th(assigns) do
    active = assigns.sort_col == assigns.col
    indicator = if active, do: (if assigns.sort_dir == "asc", do: " ^", else: " v"), else: ""
    assigns = assign(assigns, active: active, indicator: indicator)

    ~H"""
    <th class="px-3 py-2.5">
      <button phx-click="sort" phx-value-col={@col}
        class={["text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:text-amber-400 transition-colors",
                 @active && "text-amber-400",
                 !@active && "text-zinc-500"]}>
        {@label}{@indicator}
      </button>
    </th>
    """
  end

  # ── Expanded Row Panel ─────────────────────────────────────────

  attr :p, :map, required: true
  attr :data, :map, required: true
  attr :gold_amount, :string, required: true
  attr :ban_duration, :string, required: true
  attr :ban_reason, :string, required: true
  attr :mute_duration, :string, required: true
  attr :duration_options, :list, required: true
  attr :online_ids, :any, required: true
  attr :broadcast_target_id, :any, required: true
  attr :broadcast_message, :string, required: true

  defp expanded_panel(assigns) do
    ~H"""
    <div class="px-6 py-4 border-l-2 border-amber-600/50">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
        <!-- Player Info -->
        <div>
          <h4 class="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Account</h4>
          <div class="space-y-1 text-xs">
            <div class="flex justify-between"><span class="text-zinc-500">Email</span><span class="text-zinc-300 truncate ml-2">{@data.player["email"]}</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Gold</span><span class="text-amber-400 font-mono">{@data.player["currency"]}</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Streak</span><span class="text-zinc-300">{@data.player["login_streak"] || 0} days</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Warnings</span><span class="text-zinc-300">{@data.player["warning_level"] || 0}</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Joined</span><span class="text-zinc-400">{format_timestamp(@data.player["created_at"])}</span></div>
          </div>
          <!-- Quick Gold -->
          <form phx-submit="quick_gold" phx-value-id={@p["id"]} class="flex gap-1 mt-3">
            <input type="number" name="amount" value={@gold_amount} phx-keyup="update_gold_amount"
              class="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300" />
            <button type="submit" class="px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs">Give Gold</button>
          </form>
        </div>

        <!-- Characters -->
        <div>
          <h4 class="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Characters ({length(@data.chars)})</h4>
          <div :if={@data.chars == []} class="text-xs text-zinc-600 italic">No characters</div>
          <div :for={c <- @data.chars} class="flex items-center justify-between py-1.5 border-b border-zinc-800/50 last:border-0">
            <div>
              <span class="text-sm text-zinc-200">{c["name"]}</span>
              <span class="text-[10px] text-zinc-500 ml-1">{c["class_name"]} · {c["race_name"]}</span>
            </div>
            <div class="text-right">
              <span class="text-xs text-amber-400 font-mono">Lv.{c["level"]}</span>
              <div class="text-[10px] text-zinc-600">{c["map_name"] || "Map #{c["map_id"]}"}</div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div>
          <h4 class="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Actions</h4>
          <div class="space-y-2">
            <!-- Role -->
            <div>
              <span class="text-[10px] text-zinc-500 block mb-1">Role</span>
              <div class="flex gap-1 flex-wrap">
                <button :for={r <- ~w(PLAYER MOD GM ADMIN OWNER)}
                  phx-click="set_role" phx-value-id={@p["id"]} phx-value-role={r}
                  data-confirm={"Set role to #{r}?"}
                  class={["px-2 py-0.5 rounded text-[10px] font-bold transition-colors",
                           (@data.player["role"] || "PLAYER") == r && "ring-1 ring-amber-400",
                           role_color(r)]}>{r}</button>
              </div>
            </div>

            <!-- Timed Mute -->
            <div class="pt-1">
              <span class="text-[10px] text-zinc-500 block mb-1">Mute</span>
              <div :if={@data.player["is_muted"] != 1} class="flex gap-1">
                <select phx-change="update_mute_duration" name="value"
                  class="px-1.5 py-1 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-300">
                  <option :for={{label, val} <- @duration_options} value={val} selected={@mute_duration == val}>{label}</option>
                </select>
                <button phx-click="mute" phx-value-id={@p["id"]}
                  class="px-2 py-1 bg-orange-900/50 text-orange-400 border border-orange-800 rounded text-[10px] hover:bg-orange-800/50">Mute</button>
              </div>
              <button :if={@data.player["is_muted"] == 1} phx-click="unmute" phx-value-id={@p["id"]}
                class="px-3 py-1 bg-orange-700 text-white rounded text-[10px] hover:bg-orange-600">Unmute</button>
            </div>

            <!-- Freeze -->
            <div class="flex gap-2 pt-1">
              <button :if={@data.player["is_frozen"] != 1}
                phx-click="freeze" phx-value-id={@p["id"]}
                class="px-3 py-1 bg-cyan-900/50 text-cyan-400 border border-cyan-800 rounded text-[10px] hover:bg-cyan-800/50">Freeze</button>
              <button :if={@data.player["is_frozen"] == 1}
                phx-click="unfreeze" phx-value-id={@p["id"]}
                class="px-3 py-1 bg-cyan-700 text-white rounded text-[10px] hover:bg-cyan-600">Unfreeze</button>
              <button :if={MapSet.member?(@online_ids, @p["id"])}
                phx-click="kick" phx-value-id={@p["id"]} data-confirm="Kick this player?"
                class="px-3 py-1 bg-yellow-900/50 text-yellow-400 border border-yellow-800 rounded text-[10px] hover:bg-yellow-800/50">Kick</button>
            </div>

            <!-- Timed Ban -->
            <div class="pt-2 border-t border-zinc-800 mt-1">
              <span class="text-[10px] text-zinc-500 block mb-1">Ban</span>
              <div :if={@data.player["is_banned"] != 1} class="space-y-1">
                <div class="flex gap-1">
                  <select phx-change="update_ban_duration" name="value"
                    class="px-1.5 py-1 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-300">
                    <option :for={{label, val} <- @duration_options} value={val} selected={@ban_duration == val}>{label}</option>
                  </select>
                  <input type="text" placeholder="Reason..." value={@ban_reason} phx-keyup="update_ban_reason"
                    class="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-300 min-w-0" />
                  <button phx-click="ban" phx-value-id={@p["id"]} data-confirm="Ban this player?"
                    class="px-2 py-1 bg-red-900/50 text-red-400 border border-red-800 rounded text-[10px] hover:bg-red-800/50">Ban</button>
                </div>
              </div>
              <div :if={@data.player["is_banned"] == 1} class="space-y-1">
                <div :if={@data.player["ban_reason"]} class="text-[10px] text-red-400/70 italic">Reason: {@data.player["ban_reason"]}</div>
                <div :if={@data.player["ban_expires_at"]} class="text-[10px] text-red-400/70">Expires: {format_timestamp(@data.player["ban_expires_at"])}</div>
                <button phx-click="unban" phx-value-id={@p["id"]}
                  class="px-3 py-1 bg-green-900/50 text-green-400 border border-green-800 rounded text-[10px] hover:bg-green-800/50">Unban</button>
              </div>
            </div>

            <!-- Send Message -->
            <div class="pt-2 border-t border-zinc-800 mt-1">
              <span class="text-[10px] text-zinc-500 block mb-1">System Message</span>
              <form phx-submit="send_system_message" phx-value-id={@p["id"]} class="space-y-1">
                <input type="text" name="subject" placeholder="Subject (optional)"
                  class="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-300" />
                <div class="flex gap-1">
                  <input type="text" name="body" placeholder="Message..."
                    class="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-300" />
                  <button type="submit" class="px-2 py-1 bg-blue-900/50 text-blue-400 border border-blue-800 rounded text-[10px] hover:bg-blue-800/50">Send</button>
                </div>
              </form>
            </div>

            <a href={~p"/sauce/players/#{@p["id"]}"} class="block mt-2 px-3 py-1.5 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded text-xs hover:bg-zinc-700 text-center">Full Profile</a>
          </div>
        </div>

        <!-- Moderation + Warnings -->
        <div>
          <h4 class="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Issue Warning</h4>
          <form phx-submit="issue_warning" phx-value-id={@p["id"]} class="flex gap-1 flex-wrap mb-3">
            <input type="text" name="reason" placeholder="Reason..."
              class="flex-1 min-w-[100px] px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300" />
            <select name="severity" class="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <button type="submit" class="px-2 py-1 bg-yellow-900/50 text-yellow-400 border border-yellow-800/50 rounded text-xs hover:bg-yellow-800/50">Warn</button>
          </form>
          <!-- Warning history -->
          <div :if={@data[:warnings] && @data.warnings != []} class="space-y-1 mb-3">
            <div :for={w <- @data.warnings} class="text-[10px] flex items-center gap-2 py-0.5">
              <span class={["px-1.5 py-0.5 rounded font-medium",
                w["severity"] == "critical" && "bg-red-900/50 text-red-400",
                w["severity"] == "high" && "bg-orange-900/50 text-orange-400",
                w["severity"] == "medium" && "bg-yellow-900/50 text-yellow-400",
                w["severity"] == "low" && "bg-zinc-800 text-zinc-400"]}>{w["severity"]}</span>
              <span class="text-zinc-400 flex-1 truncate">{w["reason"]}</span>
              <span class="text-zinc-600 shrink-0">{format_timestamp(w["created_at"])}</span>
            </div>
          </div>
          <!-- Mod History -->
          <h4 :if={@data[:mod_history] && @data.mod_history != []} class="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 mt-2">Moderation Log</h4>
          <div :if={@data[:mod_history]} class="space-y-1">
            <div :for={m <- @data.mod_history} class="text-[10px] flex items-center gap-2 py-0.5">
              <span class={["px-1.5 py-0.5 rounded font-medium", mod_action_color(m["action_type"])]}>{m["action_type"]}</span>
              <span :if={m["reason"]} class="text-zinc-500 flex-1 truncate">{m["reason"]}</span>
              <span :if={m["duration_minutes"]} class="text-zinc-600">{format_duration_minutes(m["duration_minutes"])}</span>
              <span class="text-zinc-600 shrink-0">{m["performed_by_name"]}</span>
              <span class="text-zinc-600 shrink-0">{format_timestamp(m["created_at"])}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    """
  end

  # ── Comparison Panel ───────────────────────────────────────────

  attr :data, :list, required: true

  defp comparison_panel(assigns) do
    [a, b] = assigns.data
    assigns = assign(assigns, a: a, b: b)

    ~H"""
    <div class="mb-6 bg-zinc-900 border border-indigo-800/30 rounded-xl p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-bold text-indigo-400 uppercase tracking-wider">Player Comparison</h3>
        <button phx-click="close_compare" class="text-xs text-zinc-500 hover:text-zinc-300">Close</button>
      </div>

      <div class="grid grid-cols-2 gap-6">
        <!-- Player A -->
        <div class="space-y-3">
          <div class="text-center">
            <div class="text-lg font-bold text-zinc-200">{@a.player["username"]}</div>
            <span class={["text-[10px] px-2 py-0.5 rounded font-medium", role_color(@a.player["role"])]}>{@a.player["role"]}</span>
          </div>
          <.comparison_stats player={@a} />
        </div>
        <!-- Player B -->
        <div class="space-y-3">
          <div class="text-center">
            <div class="text-lg font-bold text-zinc-200">{@b.player["username"]}</div>
            <span class={["text-[10px] px-2 py-0.5 rounded font-medium", role_color(@b.player["role"])]}>{@b.player["role"]}</span>
          </div>
          <.comparison_stats player={@b} />
        </div>
      </div>

      <!-- Side-by-side stat bars -->
      <div class="mt-4 border-t border-zinc-800 pt-4">
        <div class="grid grid-cols-2 gap-4 text-xs">
          <div class="space-y-1">
            <div class="flex justify-between"><span class="text-zinc-500">Gold</span><span class="text-amber-400 font-mono">{@a.player["currency"]}</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Inventory Value</span><span class="text-amber-400 font-mono">{@a.inv_value}g</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Net Worth</span><span class="text-amber-400 font-mono font-bold">{(@a.player["currency"] || 0) + @a.inv_value}g</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Warnings</span><span class="text-zinc-300">{@a.player["warning_level"] || 0}</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Mod Actions</span><span class="text-zinc-300">{@a.mod_count}</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Characters</span><span class="text-zinc-300">{length(@a.chars)}</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Login Streak</span><span class="text-zinc-300">{@a.player["login_streak"] || 0}d</span></div>
          </div>
          <div class="space-y-1">
            <div class="flex justify-between"><span class="text-zinc-500">Gold</span><span class="text-amber-400 font-mono">{@b.player["currency"]}</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Inventory Value</span><span class="text-amber-400 font-mono">{@b.inv_value}g</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Net Worth</span><span class="text-amber-400 font-mono font-bold">{(@b.player["currency"] || 0) + @b.inv_value}g</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Warnings</span><span class="text-zinc-300">{@b.player["warning_level"] || 0}</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Mod Actions</span><span class="text-zinc-300">{@b.mod_count}</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Characters</span><span class="text-zinc-300">{length(@b.chars)}</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Login Streak</span><span class="text-zinc-300">{@b.player["login_streak"] || 0}d</span></div>
          </div>
        </div>
      </div>
    </div>
    """
  end

  attr :player, :map, required: true

  defp comparison_stats(assigns) do
    ~H"""
    <div :for={c <- @player.chars} class="bg-zinc-800/50 rounded-lg p-3">
      <div class="flex justify-between items-center mb-2">
        <span class="text-sm text-zinc-200 font-medium">{c["name"]}</span>
        <span class="text-xs text-amber-400 font-mono">Lv.{c["level"]}</span>
      </div>
      <div class="text-[10px] text-zinc-500 mb-2">{c["class_name"]} · {c["race_name"]}</div>
      <div class="grid grid-cols-3 gap-1 text-[10px]">
        <div class="text-center"><span class="text-zinc-500">ATK</span> <span class="text-red-400 font-mono">{c["atk"]}</span></div>
        <div class="text-center"><span class="text-zinc-500">DEF</span> <span class="text-amber-400 font-mono">{c["def"]}</span></div>
        <div class="text-center"><span class="text-zinc-500">SPD</span> <span class="text-yellow-400 font-mono">{c["speed"]}</span></div>
        <div class="text-center"><span class="text-zinc-500">MO</span> <span class="text-purple-400 font-mono">{c["mo"]}</span></div>
        <div class="text-center"><span class="text-zinc-500">MD</span> <span class="text-cyan-400 font-mono">{c["md"]}</span></div>
        <div class="text-center"><span class="text-zinc-500">LCK</span> <span class="text-pink-400 font-mono">{c["luck"]}</span></div>
      </div>
      <div class="mt-1 text-[10px] text-center">
        <span class="text-green-400">{c["current_hp"]}/{c["max_hp"]} HP</span>
      </div>
    </div>
    <div :if={@player.chars == []} class="text-xs text-zinc-600 italic text-center">No characters</div>
    """
  end

  # ── Helpers ────────────────────────────────────────────────────

  defp parse_duration("permanent"), do: {nil, nil}
  defp parse_duration("15m"), do: {minutes_from_now(15), 15}
  defp parse_duration("1h"), do: {minutes_from_now(60), 60}
  defp parse_duration("6h"), do: {minutes_from_now(360), 360}
  defp parse_duration("24h"), do: {minutes_from_now(1440), 1440}
  defp parse_duration("3d"), do: {minutes_from_now(4320), 4320}
  defp parse_duration("7d"), do: {minutes_from_now(10080), 10080}
  defp parse_duration("30d"), do: {minutes_from_now(43200), 43200}
  defp parse_duration(_), do: {nil, nil}

  defp minutes_from_now(minutes) do
    NaiveDateTime.utc_now() |> NaiveDateTime.add(minutes * 60, :second)
  end

  defp log_moderation(user_id, action_type, reason, duration_minutes, expires_at, actor, detail \\ nil) do
    detail_str = if detail, do: Jason.encode!(detail), else: nil
    Repo.query(
      "INSERT INTO moderation_actions (user_id, action_type, reason, duration_minutes, expires_at, performed_by_id, performed_by_name, detail_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [user_id, action_type, reason, duration_minutes, expires_at, actor.id, actor.name, detail_str]
    )
  end

  defp kick_player_from_game(user_id) do
    chars = PlayerRegistry.all() |> Enum.filter(fn p -> p[:user_id] == user_id end)
    for p <- chars do
      TePhoenixWeb.Endpoint.broadcast!("user:#{p[:char_id]}", "force_disconnect", %{reason: "You have been kicked by an administrator."})
      PlayerRegistry.delete(p[:char_id])
    end
    length(chars)
  end

  defp login_age_class(nil), do: "opacity-30"
  defp login_age_class(%NaiveDateTime{} = ts) do
    days = NaiveDateTime.diff(NaiveDateTime.utc_now(), ts, :second) |> div(86400)
    cond do
      days > 30 -> "opacity-30"
      days > 7 -> "opacity-50"
      true -> ""
    end
  end
  defp login_age_class(_), do: ""

  defp role_color("OWNER"), do: "bg-purple-900/50 text-purple-400"
  defp role_color("ADMIN"), do: "bg-red-900/50 text-red-400"
  defp role_color("GM"), do: "bg-amber-900/50 text-amber-400"
  defp role_color("MOD"), do: "bg-blue-900/50 text-blue-400"
  defp role_color("STAFF"), do: "bg-cyan-900/50 text-cyan-400"
  defp role_color(_), do: "bg-zinc-800 text-zinc-400"

  defp mod_action_color("ban"), do: "bg-red-900/50 text-red-400"
  defp mod_action_color("unban"), do: "bg-green-900/50 text-green-400"
  defp mod_action_color("mute"), do: "bg-orange-900/50 text-orange-400"
  defp mod_action_color("unmute"), do: "bg-green-900/50 text-green-400"
  defp mod_action_color("kick"), do: "bg-yellow-900/50 text-yellow-400"
  defp mod_action_color("freeze"), do: "bg-cyan-900/50 text-cyan-400"
  defp mod_action_color("unfreeze"), do: "bg-cyan-900/30 text-cyan-500"
  defp mod_action_color("warn"), do: "bg-yellow-900/50 text-yellow-400"
  defp mod_action_color("wipe"), do: "bg-red-900/50 text-red-300"
  defp mod_action_color("item_recall"), do: "bg-red-900/30 text-red-500"
  defp mod_action_color(_), do: "bg-zinc-800 text-zinc-400"

  defp rarity_color(nil), do: "text-zinc-400"
  defp rarity_color(r) when is_binary(r) do
    case String.downcase(r) do
      "common" -> "text-zinc-400"
      "uncommon" -> "text-green-400"
      "rare" -> "text-blue-400"
      "epic" -> "text-purple-400"
      "legendary" -> "text-amber-400"
      "mythic" -> "text-red-400"
      _ -> "text-zinc-400"
    end
  end
  defp rarity_color(_), do: "text-zinc-400"

  defp format_timestamp(nil), do: "Never"
  defp format_timestamp(%NaiveDateTime{} = ts), do: Calendar.strftime(ts, "%b %d %H:%M")
  defp format_timestamp(ts), do: to_string(ts)

  defp format_expiry(nil), do: ""
  defp format_expiry(%NaiveDateTime{} = ts) do
    diff = NaiveDateTime.diff(ts, NaiveDateTime.utc_now(), :second)
    cond do
      diff <= 0 -> "expired"
      diff < 3600 -> "#{div(diff, 60)}m left"
      diff < 86400 -> "#{div(diff, 3600)}h left"
      true -> "#{div(diff, 86400)}d left"
    end
  end
  defp format_expiry(_), do: ""

  defp format_duration_minutes(nil), do: ""
  defp format_duration_minutes(m) when m < 60, do: "#{m}m"
  defp format_duration_minutes(m) when m < 1440, do: "#{div(m, 60)}h"
  defp format_duration_minutes(m), do: "#{div(m, 1440)}d"

  defp actor(socket), do: %{id: socket.assigns[:session_user_id], name: socket.assigns[:session_username] || "Admin"}

  defp get_username(user_id) do
    case Repo.query("SELECT username FROM users WHERE id=?", [user_id]) do
      {:ok, %{rows: [[name]]}} -> name
      _ -> "Unknown"
    end
  end

  defp refresh_expanded(socket, user_id) do
    if socket.assigns.expanded_id == user_id do
      assign(socket, expanded_data: load_expanded_player(user_id))
    else
      socket
    end
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
