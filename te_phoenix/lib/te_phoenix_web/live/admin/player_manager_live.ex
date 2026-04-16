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
      gold_amount: "1000"
    ) |> load_players() |> load_online()}
  end

  defp load_players(socket) do
    page = socket.assigns.page
    limit = socket.assigns.limit
    offset = (page - 1) * limit
    search = socket.assigns.search
    filter = socket.assigns.filter

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

    total = case Repo.query("SELECT COUNT(*) FROM users u #{where}", params) do
      {:ok, %{rows: [[c]]}} -> c
      _ -> 0
    end

    players = case Repo.query("""
      SELECT u.id, u.username, u.email, u.role, u.currency, u.is_banned, u.is_muted, u.last_login,
             u.chat_color, COUNT(c.id) AS char_count
      FROM users u LEFT JOIN characters c ON c.user_id=u.id
      #{where}
      GROUP BY u.id ORDER BY u.last_login DESC LIMIT ? OFFSET ?
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

  def handle_event("ban", %{"id" => id}, socket) do
    uid = to_int(id)
    Repo.query("UPDATE users SET is_banned=1 WHERE id=?", [uid])
    name = get_username(uid)
    AdminAudit.log("gm_ban", actor(socket), %{id: uid, name: name})
    {:noreply, socket |> put_flash(:info, "Player banned.") |> load_players() |> assign(selected_player: nil) |> refresh_expanded(uid)}
  end

  def handle_event("unban", %{"id" => id}, socket) do
    uid = to_int(id)
    Repo.query("UPDATE users SET is_banned=0, ban_reason=NULL WHERE id=?", [uid])
    name = get_username(uid)
    AdminAudit.log("gm_unban", actor(socket), %{id: uid, name: name})
    {:noreply, socket |> put_flash(:info, "Player unbanned.") |> load_players() |> assign(selected_player: nil) |> refresh_expanded(uid)}
  end

  def handle_event("set_role", %{"id" => id, "role" => role}, socket) do
    uid = to_int(id)
    if role in ~w(PLAYER MOD GM ADMIN OWNER) do
      Repo.query("UPDATE users SET role=? WHERE id=?", [role, uid])
      name = get_username(uid)
      AdminAudit.log("gm_role_change", actor(socket), %{id: uid, name: name}, role)
      {:noreply, socket |> put_flash(:info, "Role set to #{role}.") |> load_players() |> assign(selected_player: nil) |> refresh_expanded(uid)}
    else
      {:noreply, put_flash(socket, :error, "Invalid role.")}
    end
  end

  # ── Mute Toggle ────────────────────────────────────────────────

  def handle_event("mute", %{"id" => id}, socket) do
    uid = to_int(id)
    Repo.query("UPDATE users SET is_muted=1 WHERE id=?", [uid])
    name = get_username(uid)
    AdminAudit.log("gm_mute", actor(socket), %{id: uid, name: name})
    {:noreply, socket |> put_flash(:info, "Player muted.") |> load_players() |> refresh_expanded(uid)}
  end

  def handle_event("unmute", %{"id" => id}, socket) do
    uid = to_int(id)
    Repo.query("UPDATE users SET is_muted=0 WHERE id=?", [uid])
    name = get_username(uid)
    AdminAudit.log("gm_unmute", actor(socket), %{id: uid, name: name})
    {:noreply, socket |> put_flash(:info, "Player unmuted.") |> load_players() |> refresh_expanded(uid)}
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
      # Insert warning record
      Repo.query(
        "INSERT INTO player_warnings (user_id, warned_by, warned_by_name, reason, warning_level) VALUES (?, ?, ?, ?, ?)",
        [uid, a.id, a.name, reason, severity]
      )
      # Increment warning_level
      Repo.query("UPDATE users SET warning_level=COALESCE(warning_level,0)+1 WHERE id=?", [uid])

      # Auto-escalate: 3+ warnings = auto-ban
      case Repo.query("SELECT warning_level FROM users WHERE id=?", [uid]) do
        {:ok, %{rows: [[level]]}} when is_integer(level) and level >= 3 ->
          Repo.query("UPDATE users SET is_banned=1, ban_reason='Auto-ban: 3+ warnings' WHERE id=?", [uid])
          AdminAudit.log("gm_auto_ban", %{id: 0, name: "System"}, %{id: uid, name: name}, "Auto-ban: warning level #{level}")
        _ -> :ok
      end

      AdminAudit.log("gm_warn", a, %{id: uid, name: name}, %{reason: reason, severity: severity})
      {:noreply, socket |> put_flash(:info, "Warning issued.") |> load_players() |> refresh_expanded(uid)}
    end
  end

  # ── Quick Filters ──────────────────────────────────────────────

  def handle_event("set_filter", %{"filter" => f}, socket) do
    {:noreply, assign(socket, filter: f, page: 1, selected_ids: MapSet.new()) |> load_players()}
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
      AdminAudit.log("gm_bulk_ban", actor(socket), nil, %{count: length(ids), user_ids: ids})
      {:noreply, socket |> put_flash(:info, "#{length(ids)} players banned.") |> assign(selected_ids: MapSet.new()) |> load_players()}
    else
      {:noreply, socket}
    end
  end

  def handle_event("bulk_unban", _params, socket) do
    ids = MapSet.to_list(socket.assigns.selected_ids)
    if ids != [] do
      placeholders = Enum.map_join(ids, ",", fn _ -> "?" end)
      Repo.query("UPDATE users SET is_banned=0 WHERE id IN (#{placeholders})", ids)
      AdminAudit.log("gm_bulk_unban", actor(socket), nil, %{count: length(ids), user_ids: ids})
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

  # ── Expandable Row ─────────────────────────────────────────────

  def handle_event("expand_player", %{"id" => id}, socket) do
    id = to_int(id)
    if socket.assigns.expanded_id == id do
      {:noreply, assign(socket, expanded_id: nil, expanded_data: nil)}
    else
      data = load_expanded_player(id)
      {:noreply, assign(socket, expanded_id: id, expanded_data: data)}
    end
  end

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

  defp load_expanded_player(user_id) do
    player = case Repo.query(
      "SELECT id, username, email, role, currency, is_banned, is_muted, ban_reason, created_at, last_login, login_streak, warning_level FROM users WHERE id=?",
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

    %{player: player, chars: chars, warnings: warnings}
  end

  @impl true
  def render(assigns) do
    max_page = max(1, ceil(assigns.total / assigns.limit))
    # Merge game online + admin panel online
    game_ids = Enum.map(assigns.online_players, fn data -> data[:user_id] end) |> Enum.reject(&is_nil/1) |> MapSet.new()
    admin_ids = AdminPresence.online_user_ids()
    online_ids = MapSet.union(game_ids, admin_ids)
    # Build location map: user_id => "Game: MapName" or "AdminSauce: PageName"
    admin_locations = Map.new(assigns.admin_presence, fn p -> {p[:user_id], "🔧 #{p[:page] || "AdminSauce"}"} end)
    game_locations = Map.new(assigns.online_players, fn p ->
      uid = p[:user_id]
      map_name = p[:map_name] || "Map #{p[:map_id] || "?"}"
      {uid, "🎮 #{map_name}"}
    end)
    # Admin location takes precedence (more specific), but show game if also in-game
    locations = Map.merge(game_locations, admin_locations)
    bulk_count = MapSet.size(assigns.selected_ids)
    total_online = MapSet.size(online_ids)
    assigns = assign(assigns, max_page: max_page, online_ids: online_ids, locations: locations, bulk_count: bulk_count, total_online: total_online)

    ~H"""
    <div>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-amber-400">Player Manager</h2>
        <span class="text-xs text-green-400">{@total_online} online</span>
      </div>

      <!-- Filter Bar + Search -->
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <!-- Quick Filters -->
        <div class="flex gap-1">
          <button :for={{label, val, icon} <- [{"All", "all", ""}, {"Online", "online", "🟢"}, {"Staff", "staff", "⭐"}, {"Banned", "banned", "🚫"}, {"Muted", "muted", "🔇"}, {"New (24h)", "new", "🆕"}]}
            phx-click="set_filter" phx-value-filter={val}
            class={["px-3 py-1.5 rounded text-xs font-medium transition-colors",
                     @filter == val && "bg-amber-600 text-white",
                     @filter != val && "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"]}>
            {icon} {label}
          </button>
        </div>

        <!-- Search -->
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
                <button phx-click="select_all" class="text-[10px] text-zinc-500 hover:text-amber-400" title="Select all">☐</button>
              </th>
              <th class="px-3 py-2.5 w-8"></th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Username</th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Role</th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Gold</th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Chars</th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Status</th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Last Login</th>
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
                  {if MapSet.member?(@selected_ids, p["id"]), do: "☑", else: "☐"}
                </button>
              </td>
              <td class="px-1 py-2.5">
                <button phx-click="expand_player" phx-value-id={p["id"]} class="text-xs text-zinc-600 hover:text-amber-400">{if @expanded_id == p["id"], do: "▼", else: "▶"}</button>
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
                  <span :if={p["is_banned"] == 1} class="text-[10px] px-2 py-0.5 rounded bg-red-900/50 text-red-400">Banned</span>
                  <span :if={p["is_muted"] == 1} class="text-[10px] px-2 py-0.5 rounded bg-orange-900/50 text-orange-400">Muted</span>
                  <span :if={p["is_banned"] != 1 && MapSet.member?(@online_ids, p["id"])} class="text-[10px] px-2 py-0.5 rounded bg-green-900/30 text-green-500">Online</span>
                  <span :if={p["is_banned"] != 1 && !MapSet.member?(@online_ids, p["id"])} class="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-500">Offline</span>
                </div>
                <div :if={Map.has_key?(@locations, p["id"])} class="text-[10px] text-zinc-500 mt-0.5">{@locations[p["id"]]}</div>
              </td>
              <td class="px-3 py-2.5 text-[11px] text-zinc-600">{format_timestamp(p["last_login"])}</td>
            </tr>
            <!-- Expanded Detail Panel -->
            <tr :if={@expanded_id == p["id"] && @expanded_data} class="bg-zinc-950/50">
              <td colspan="8" class="p-0">
                <div class="px-6 py-4 border-l-2 border-amber-600/50">
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <!-- Player Info -->
                    <div>
                      <h4 class="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Account</h4>
                      <div class="space-y-1 text-xs">
                        <div class="flex justify-between"><span class="text-zinc-500">Email</span><span class="text-zinc-300">{@expanded_data.player["email"]}</span></div>
                        <div class="flex justify-between"><span class="text-zinc-500">Gold</span><span class="text-amber-400 font-mono">{@expanded_data.player["currency"]}</span></div>
                        <div class="flex justify-between"><span class="text-zinc-500">Streak</span><span class="text-zinc-300">{@expanded_data.player["login_streak"] || 0} days</span></div>
                        <div class="flex justify-between"><span class="text-zinc-500">Warnings</span><span class="text-zinc-300">{@expanded_data.player["warning_level"] || 0}</span></div>
                        <div class="flex justify-between"><span class="text-zinc-500">Joined</span><span class="text-zinc-400">{format_timestamp(@expanded_data.player["created_at"])}</span></div>
                      </div>
                      <!-- Quick Gold -->
                      <form phx-submit="quick_gold" phx-value-id={p["id"]} class="flex gap-1 mt-3">
                        <input type="number" name="amount" value={@gold_amount} phx-keyup="update_gold_amount"
                          class="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300" />
                        <button type="submit" class="px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs">Give Gold</button>
                      </form>
                    </div>
                    <!-- Characters -->
                    <div>
                      <h4 class="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Characters ({length(@expanded_data.chars)})</h4>
                      <div :if={@expanded_data.chars == []} class="text-xs text-zinc-600 italic">No characters</div>
                      <div :for={c <- @expanded_data.chars} class="flex items-center justify-between py-1.5 border-b border-zinc-800/50 last:border-0">
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
                    <!-- Quick Actions -->
                    <div>
                      <h4 class="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Actions</h4>
                      <div class="space-y-2">
                        <div>
                          <span class="text-[10px] text-zinc-500 block mb-1">Role</span>
                          <div class="flex gap-1 flex-wrap">
                            <button :for={r <- ~w(PLAYER MOD GM ADMIN OWNER)}
                              phx-click="set_role" phx-value-id={p["id"]} phx-value-role={r}
                              data-confirm={"Set role to #{r}?"}
                              class={["px-2 py-0.5 rounded text-[10px] font-bold transition-colors",
                                       (@expanded_data.player["role"] || "PLAYER") == r && "ring-1 ring-amber-400",
                                       role_color(r)]}>{r}</button>
                          </div>
                        </div>
                        <!-- Mute -->
                        <div class="flex gap-2 pt-1">
                          <button :if={@expanded_data.player["is_muted"] != 1}
                            phx-click="mute" phx-value-id={p["id"]}
                            class="px-3 py-1.5 bg-orange-900/50 text-orange-400 border border-orange-800 rounded text-xs hover:bg-orange-800/50">🔇 Mute</button>
                          <button :if={@expanded_data.player["is_muted"] == 1}
                            phx-click="unmute" phx-value-id={p["id"]}
                            class="px-3 py-1.5 bg-orange-700 text-white rounded text-xs hover:bg-orange-600">🔊 Unmute</button>
                        </div>
                        <!-- Ban -->
                        <div class="flex gap-2 pt-1">
                          <button :if={@expanded_data.player["is_banned"] != 1}
                            phx-click="ban" phx-value-id={p["id"]} data-confirm="Ban this player?"
                            class="px-3 py-1.5 bg-red-900/50 text-red-400 border border-red-800 rounded text-xs hover:bg-red-800/50">Ban</button>
                          <button :if={@expanded_data.player["is_banned"] == 1}
                            phx-click="unban" phx-value-id={p["id"]}
                            class="px-3 py-1.5 bg-green-900/50 text-green-400 border border-green-800 rounded text-xs hover:bg-green-800/50">Unban</button>
                          <a href={~p"/sauce/players/#{p["id"]}"} class="px-3 py-1.5 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded text-xs hover:bg-zinc-700">Full Profile →</a>
                        </div>
                        <!-- Issue Warning -->
                        <div class="pt-2 border-t border-zinc-800 mt-2">
                          <span class="text-[10px] text-zinc-500 block mb-1">Issue Warning</span>
                          <form phx-submit="issue_warning" phx-value-id={p["id"]} class="flex gap-1 flex-wrap">
                            <input type="text" name="reason" placeholder="Reason..."
                              class="flex-1 min-w-[120px] px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300" />
                            <select name="severity" class="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300">
                              <option value="low">Low</option>
                              <option value="medium" selected>Medium</option>
                              <option value="high">High</option>
                              <option value="critical">Critical</option>
                            </select>
                            <button type="submit" class="px-2.5 py-1 bg-yellow-900/50 text-yellow-400 border border-yellow-800/50 rounded text-xs hover:bg-yellow-800/50">⚠️ Warn</button>
                          </form>
                          <!-- Warning history -->
                          <div :if={@expanded_data[:warnings] && @expanded_data.warnings != []} class="mt-2 space-y-1">
                            <div :for={w <- @expanded_data.warnings} class="text-[10px] flex items-center gap-2 py-0.5">
                              <span class={["px-1.5 py-0.5 rounded font-medium",
                                w["severity"] == "critical" && "bg-red-900/50 text-red-400",
                                w["severity"] == "high" && "bg-orange-900/50 text-orange-400",
                                w["severity"] == "medium" && "bg-yellow-900/50 text-yellow-400",
                                w["severity"] == "low" && "bg-zinc-800 text-zinc-400"]}>{w["severity"]}</span>
                              <span class="text-zinc-400 flex-1 truncate">{w["reason"]}</span>
                              <span class="text-zinc-600 shrink-0">{w["issued_by_name"]}</span>
                              <span class="text-zinc-600 shrink-0">{format_timestamp(w["created_at"])}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
            <% end %>
          </tbody>
        </table>

        <div :if={@players == []} class="p-8 text-center text-zinc-600 text-sm">No players found</div>
      </div>
    </div>
    """
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

  defp format_timestamp(nil), do: "Never"
  defp format_timestamp(%NaiveDateTime{} = ts), do: Calendar.strftime(ts, "%b %d %H:%M")
  defp format_timestamp(ts), do: to_string(ts)

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
