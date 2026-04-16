defmodule TePhoenixWeb.Admin.GmHubLive do
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo
  alias TePhoenix.Game.PlayerRegistry
  alias TePhoenix.Game.AdminAudit

  @per_page 30
  @tabs ~w(tools notes activity)

  @impl true
  def mount(_params, _session, socket) do
    # Messenger is now persistent in the layout — no need to subscribe here

    {:ok,
     socket
     |> assign(
       active_tab: :gm_tools,
       tab: "tools",
       tabs: @tabs,
       search: "",
       page: 1,
       rows: [],
       total: 0,
       # Tools
       broadcast_msg: "",
       broadcast_style: "info",
       map_broadcast_msg: "",
       map_broadcast_id: "",
       maps_list: load_maps_list(),
       action_log: [],
       heal_result: nil,
       xp_amount: "",
       xp_result: nil,
       weather_effect: "clear",
       maintenance_mode: load_maintenance_mode(),
       server_stats: nil,
       # Notes
       notes_list: [],
       note_body: "",
       note_scope: "global",
       note_map_id: "",
       note_pinned: false,
       notes_map_filter: "",
       online_staff: [],
       # Targeted player tools
       target_search: "",
       target_player: nil,
       target_chars: [],
       target_result: nil
     )
     |> load_tab()}
  end

  # ── Events ─────────────────────────────────────────────────────────

  @impl true
  def handle_event("change_tab", %{"tab" => tab}, socket) do
    {:noreply, assign(socket, tab: tab, search: "", page: 1) |> load_tab()}
  end

  def handle_event("search", %{"search" => q}, socket) do
    {:noreply, assign(socket, search: q, page: 1) |> load_tab()}
  end

  def handle_event("prev_page", _params, socket) do
    {:noreply, assign(socket, page: max(1, socket.assigns.page - 1)) |> load_tab()}
  end

  def handle_event("next_page", _params, socket) do
    max_p = max(1, ceil(socket.assigns.total / @per_page))
    {:noreply, assign(socket, page: min(max_p, socket.assigns.page + 1)) |> load_tab()}
  end

  # ── Tools Events ───────────────────────────────────────────────────

  def handle_event("update_broadcast", %{"message" => msg}, socket) do
    {:noreply, assign(socket, broadcast_msg: msg)}
  end

  def handle_event("update_broadcast_style", %{"style" => style}, socket) do
    {:noreply, assign(socket, broadcast_style: style)}
  end

  def handle_event("send_broadcast", %{"message" => msg}, socket) do
    if msg != "" do
      TePhoenixWeb.Endpoint.broadcast!("social:lobby", "system_broadcast", %{
        message: msg,
        style: socket.assigns.broadcast_style,
        from: "SYSTEM",
        timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
      })

      log_entry = %{action: "Server Broadcast", detail: "#{socket.assigns.broadcast_style}: #{truncate(msg, 40)}", at: DateTime.utc_now()}
      AdminAudit.log("gm_broadcast", actor(socket), nil, %{style: socket.assigns.broadcast_style, message: truncate(msg, 200)})
      {:noreply, socket |> put_flash(:info, "Broadcast sent.") |> assign(broadcast_msg: "") |> append_action_log(log_entry)}
    else
      {:noreply, put_flash(socket, :error, "Message cannot be empty.")}
    end
  end

  def handle_event("update_map_broadcast", params, socket) do
    updates =
      Enum.reduce(params, %{}, fn
        {"message", v}, acc -> Map.put(acc, :map_broadcast_msg, v)
        {"map_id", v}, acc -> Map.put(acc, :map_broadcast_id, v)
        _, acc -> acc
      end)

    {:noreply, assign(socket, Map.to_list(updates))}
  end

  def handle_event("send_map_broadcast", %{"message" => msg, "map_id" => map_id}, socket) do
    if msg != "" && map_id != "" do
      TePhoenixWeb.Endpoint.broadcast!("map:#{map_id}", "system_broadcast", %{
        message: msg,
        from: "SYSTEM",
        timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
      })

      log_entry = %{action: "Map Broadcast", detail: "Map #{map_id}: #{truncate(msg, 40)}", at: DateTime.utc_now()}
      AdminAudit.log("gm_map_broadcast", actor(socket), nil, %{map_id: map_id, message: truncate(msg, 200)})
      {:noreply, socket |> put_flash(:info, "Map broadcast sent.") |> assign(map_broadcast_msg: "") |> append_action_log(log_entry)}
    else
      {:noreply, put_flash(socket, :error, "Map and message required.")}
    end
  end

  def handle_event("refresh_stats", _params, socket) do
    {:noreply, assign(socket, server_stats: gather_stats())}
  end

  def handle_event("heal_all", _params, socket) do
    players = PlayerRegistry.all()
    char_ids = Enum.map(players, &Map.get(&1, :char_id)) |> Enum.reject(&is_nil/1)

    result =
      if char_ids == [] do
        "No online characters to heal."
      else
        placeholders = Enum.map_join(char_ids, ", ", fn _ -> "?" end)

        case Repo.query(
               "UPDATE characters SET current_hp = max_hp, current_mp = max_mp WHERE id IN (#{placeholders})",
               char_ids
             ) do
          {:ok, %{num_rows: n}} -> "Healed #{n} character(s) to full HP/MP."
          _ -> "Heal failed - database error."
        end
      end

    log_entry = %{action: "Heal All", detail: result, at: DateTime.utc_now()}
    AdminAudit.log("gm_heal_all", actor(socket), nil, result)
    {:noreply, assign(socket, heal_result: result) |> append_action_log(log_entry)}
  end

  def handle_event("grant_xp", %{"amount" => amount_str}, socket) do
    amount = parse_int(amount_str)

    result =
      if amount <= 0 do
        "Invalid XP amount."
      else
        players = PlayerRegistry.all()
        char_ids = Enum.map(players, &Map.get(&1, :char_id)) |> Enum.reject(&is_nil/1)

        if char_ids == [] do
          "No online characters to grant XP."
        else
          placeholders = Enum.map_join(char_ids, ", ", fn _ -> "?" end)

          case Repo.query(
                 "UPDATE characters SET experience = experience + ? WHERE id IN (#{placeholders})",
                 [amount | char_ids]
               ) do
            {:ok, %{num_rows: n}} -> "Granted #{amount} XP to #{n} character(s)."
            _ -> "Grant XP failed - database error."
          end
        end
      end

    log_entry = %{action: "Grant XP", detail: result, at: DateTime.utc_now()}
    AdminAudit.log("gm_grant_xp_all", actor(socket), nil, result)
    {:noreply, assign(socket, xp_result: result) |> append_action_log(log_entry)}
  end

  def handle_event("update_xp_amount", %{"amount" => val}, socket) do
    {:noreply, assign(socket, xp_amount: val)}
  end

  def handle_event("force_weather", %{"effect" => effect}, socket) do
    TePhoenixWeb.Endpoint.broadcast!("social:lobby", "weather_change", %{effect: effect})
    log_entry = %{action: "Force Weather", detail: "Set to: #{effect}", at: DateTime.utc_now()}
    AdminAudit.log("gm_weather", actor(socket), nil, effect)
    {:noreply, socket |> assign(weather_effect: effect) |> put_flash(:info, "Weather set to #{effect}.") |> append_action_log(log_entry)}
  end

  def handle_event("update_weather", %{"effect" => effect}, socket) do
    {:noreply, assign(socket, weather_effect: effect)}
  end

  def handle_event("toggle_maintenance", _params, socket) do
    new_val = !socket.assigns.maintenance_mode
    val_str = if new_val, do: "1", else: "0"

    Repo.query(
      "INSERT INTO system_settings (setting_key, setting_value) VALUES ('maintenance_mode', ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = ?",
      [val_str, val_str]
    )

    if new_val do
      TePhoenixWeb.Endpoint.broadcast!("social:lobby", "system_broadcast", %{
        message: "Server entering maintenance mode.",
        style: "danger",
        from: "SYSTEM",
        timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
      })
    end

    AdminAudit.log("gm_maintenance", actor(socket), nil, if(new_val, do: "enabled", else: "disabled"))
    log_entry = %{action: "Maintenance Mode", detail: if(new_val, do: "ENABLED", else: "DISABLED"), at: DateTime.utc_now()}
    {:noreply, assign(socket, maintenance_mode: new_val) |> append_action_log(log_entry)}
  end

  # ── Targeted Player Tools ────────────────────────────────────────────

  def handle_event("target_search", %{"search" => q}, socket) do
    {:noreply, assign(socket, target_search: q, target_result: nil)}
  end

  def handle_event("target_find", %{"search" => q}, socket) do
    q = String.trim(q)
    if q == "" do
      {:noreply, assign(socket, target_player: nil, target_chars: [], target_result: nil)}
    else
      case Repo.query("SELECT id, username, role, currency FROM users WHERE username LIKE ? LIMIT 1", ["%#{q}%"]) do
        {:ok, %{rows: [[id, name, role, gold]]}} ->
          chars = load_target_chars(id)
          {:noreply, assign(socket, target_player: %{id: id, username: name, role: role, currency: gold}, target_chars: chars, target_result: nil)}
        _ ->
          {:noreply, assign(socket, target_player: nil, target_chars: [], target_result: "Player not found.")}
      end
    end
  end

  def handle_event("target_clear", _params, socket) do
    {:noreply, assign(socket, target_player: nil, target_chars: [], target_search: "", target_result: nil)}
  end

  def handle_event("target_heal", %{"char-id" => char_id}, socket) do
    cid = parse_int(char_id)
    Repo.query("UPDATE characters SET current_hp=max_hp, current_mp=max_mp WHERE id=?", [cid])
    AdminAudit.log("gm_heal", actor(socket), %{id: socket.assigns.target_player.id, name: socket.assigns.target_player.username}, "char ##{cid}")
    log_entry = %{action: "Heal Player", detail: "Char ##{cid} healed to full", at: DateTime.utc_now()}
    chars = reload_target_chars(socket)
    {:noreply, assign(socket, target_chars: chars, target_result: "Character healed.") |> append_action_log(log_entry)}
  end

  def handle_event("target_give_xp", %{"char-id" => char_id, "amount" => amount}, socket) do
    cid = parse_int(char_id)
    amt = parse_int(amount)
    if amt > 0 do
      Repo.query("UPDATE characters SET experience=experience+? WHERE id=?", [amt, cid])
      AdminAudit.log("gm_give_xp", actor(socket), %{id: socket.assigns.target_player.id, name: socket.assigns.target_player.username}, %{char_id: cid, amount: amt})
      log_entry = %{action: "Give XP", detail: "+#{amt} XP to char ##{cid}", at: DateTime.utc_now()}
      chars = reload_target_chars(socket)
      {:noreply, assign(socket, target_chars: chars, target_result: "+#{amt} XP granted.") |> append_action_log(log_entry)}
    else
      {:noreply, assign(socket, target_result: "Enter a valid XP amount.")}
    end
  end

  def handle_event("target_teleport", %{"char-id" => char_id, "map-id" => map_id}, socket) do
    cid = parse_int(char_id)
    mid = parse_int(map_id)
    if mid > 0 do
      Repo.query("UPDATE characters SET map_id=?, x=5, y=5 WHERE id=?", [mid, cid])
      # Also update PlayerRegistry if online
      case PlayerRegistry.get(cid) do
        nil -> :ok
        _data -> PlayerRegistry.update(cid, %{map_id: mid, x: 5, y: 5})
      end
      AdminAudit.log("gm_teleport", actor(socket), %{id: socket.assigns.target_player.id, name: socket.assigns.target_player.username}, %{char_id: cid, map_id: mid})
      log_entry = %{action: "Teleport", detail: "Char ##{cid} → Map ##{mid}", at: DateTime.utc_now()}
      chars = reload_target_chars(socket)
      {:noreply, assign(socket, target_chars: chars, target_result: "Teleported to map #{mid}.") |> append_action_log(log_entry)}
    else
      {:noreply, assign(socket, target_result: "Select a map.")}
    end
  end

  def handle_event("target_give_gold", %{"amount" => amount}, socket) do
    amt = parse_int(amount)
    if socket.assigns.target_player && amt != 0 do
      uid = socket.assigns.target_player.id
      Repo.query("UPDATE users SET currency=GREATEST(0, currency+?) WHERE id=?", [amt, uid])
      # Reload player gold
      case Repo.query("SELECT currency FROM users WHERE id=?", [uid]) do
        {:ok, %{rows: [[gold]]}} ->
          player = Map.put(socket.assigns.target_player, :currency, gold)
          AdminAudit.log("gm_give_gold", actor(socket), %{id: uid, name: player.username}, %{amount: amt})
          log_entry = %{action: "Give Gold", detail: "#{if amt > 0, do: "+"}#{amt}g to #{player.username}", at: DateTime.utc_now()}
          {:noreply, assign(socket, target_player: player, target_result: "#{if amt > 0, do: "+"}#{amt} gold.") |> append_action_log(log_entry)}
        _ ->
          {:noreply, assign(socket, target_result: "Gold adjusted.")}
      end
    else
      {:noreply, socket}
    end
  end

  # ── Notes Events ───────────────────────────────────────────────────

  def handle_event("update_note_form", params, socket) do
    updates =
      Enum.reduce(params, [], fn
        {"body", v}, acc -> [{:note_body, v} | acc]
        {"scope", v}, acc -> [{:note_scope, v} | acc]
        {"map_id", v}, acc -> [{:note_map_id, v} | acc]
        {"pinned", _}, acc -> [{:note_pinned, true} | acc]
        _, acc -> acc
      end)

    # Handle unchecked checkbox (not present in params)
    updates =
      if Enum.any?(updates, fn {k, _} -> k == :note_pinned end),
        do: updates,
        else: [{:note_pinned, false} | updates]

    {:noreply, assign(socket, updates)}
  end

  def handle_event("add_note", %{"body" => body} = params, socket) do
    if body == "" do
      {:noreply, put_flash(socket, :error, "Note body cannot be empty.")}
    else
      scope = params["scope"] || "global"
      map_id = if scope == "map", do: parse_int_or_nil(params["map_id"]), else: nil
      pinned = if params["pinned"], do: 1, else: 0
      author = "Admin"

      case Repo.query(
             "INSERT INTO gm_notes (body, author, map_id, pinned) VALUES (?, ?, ?, ?)",
             [body, author, map_id, pinned]
           ) do
        {:ok, _} ->
          {:noreply,
           socket
           |> assign(note_body: "", note_pinned: false)
           |> put_flash(:info, "Note added.")
           |> load_notes()
           |> maybe_refresh_pinned_notes()}

        _ ->
          {:noreply, put_flash(socket, :error, "Failed to add note.")}
      end
    end
  end

  def handle_event("pin_note", %{"id" => id}, socket) do
    Repo.query("UPDATE gm_notes SET pinned=1 WHERE id=?", [parse_int(id)])
    {:noreply, socket |> load_notes() |> maybe_refresh_pinned_notes()}
  end

  def handle_event("unpin_note", %{"id" => id}, socket) do
    Repo.query("UPDATE gm_notes SET pinned=0 WHERE id=?", [parse_int(id)])
    {:noreply, socket |> load_notes() |> maybe_refresh_pinned_notes()}
  end

  def handle_event("delete_note", %{"id" => id}, socket) do
    Repo.query("DELETE FROM gm_notes WHERE id=?", [parse_int(id)])
    {:noreply, socket |> load_notes() |> maybe_refresh_pinned_notes() |> put_flash(:info, "Note deleted.")}
  end

  def handle_event("filter_notes_map", %{"map_id" => map_id}, socket) do
    {:noreply, assign(socket, notes_map_filter: map_id) |> load_notes()}
  end

  # ── Messenger Events ──────────────────────────────────────────────

  @impl true
  def handle_info(_msg, socket), do: {:noreply, socket}

  defp load_target_chars(user_id) do
    case Repo.query("""
      SELECT c.id, c.name, c.level, c.current_hp, c.max_hp, c.current_mp, c.max_mp,
             c.experience, c.map_id, gc.name AS class_name, gm.name AS map_name
      FROM characters c
      LEFT JOIN game_classes gc ON gc.id=c.class_id
      LEFT JOIN game_maps gm ON gm.id=c.map_id
      WHERE c.user_id=? ORDER BY c.level DESC
    """, [user_id]) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
  end

  defp reload_target_chars(socket) do
    case socket.assigns.target_player do
      nil -> []
      p -> load_target_chars(p.id)
    end
  end

  # ── Data Loading ──────────────────────────────────────────────────

  defp load_tab(%{assigns: %{tab: "tools"}} = socket) do
    assign(socket, server_stats: gather_stats(), rows: [], total: 0)
  end

  defp load_tab(%{assigns: %{tab: "notes"}} = socket) do
    socket |> assign(rows: [], total: 0) |> load_notes()
  end

  defp load_tab(%{assigns: %{tab: "activity"}} = socket) do
    search = socket.assigns.search
    offset = (socket.assigns.page - 1) * @per_page

    {where, params} =
      if search != "" do
        {" WHERE event_type LIKE ? OR actor_name LIKE ?", ["%#{search}%", "%#{search}%"]}
      else
        {"", []}
      end

    total =
      case Repo.query("SELECT COUNT(*) FROM game_event_log#{where}", params) do
        {:ok, %{rows: [[c]]}} -> c
        _ -> 0
      end

    rows =
      case Repo.query(
             "SELECT id, event_type, actor_name, detail_json, created_at FROM game_event_log#{where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
             params ++ [@per_page, offset]
           ) do
        {:ok, %{rows: r, columns: c}} -> to_maps(r, c)
        _ -> []
      end

    assign(socket, rows: rows, total: total)
  end

  defp load_tab(socket), do: assign(socket, rows: [], total: 0)

  defp load_notes(socket) do
    map_filter = socket.assigns.notes_map_filter

    {where, params} =
      if map_filter != "" do
        {"WHERE map_id = ?", [parse_int(map_filter)]}
      else
        {"WHERE (map_id IS NULL OR map_id IS NOT NULL)", []}
      end

    notes =
      case Repo.query(
             "SELECT id, body, author, map_id, pinned, created_at FROM gm_notes #{where} ORDER BY pinned DESC, created_at DESC LIMIT 30",
             params
           ) do
        {:ok, %{rows: r, columns: c}} -> to_maps(r, c)
        _ -> []
      end

    assign(socket, notes_list: notes)
  end


  defp load_maps_list do
    case Repo.query("SELECT id, name FROM game_maps WHERE is_active=1 ORDER BY name") do
      {:ok, %{rows: r}} -> Enum.map(r, fn [id, name] -> %{id: id, name: name} end)
      _ -> []
    end
  end

  defp load_maintenance_mode do
    case Repo.query("SELECT setting_value FROM system_settings WHERE setting_key='maintenance_mode'") do
      {:ok, %{rows: [["1"]]}} -> true
      _ -> false
    end
  end

  defp gather_stats do
    players = PlayerRegistry.all()

    %{
      online_count: length(players),
      uptime: format_uptime(),
      total_characters:
        case Repo.query("SELECT COUNT(*) FROM characters") do
          {:ok, %{rows: [[c]]}} -> c
          _ -> 0
        end,
      total_accounts:
        case Repo.query("SELECT COUNT(*) FROM users") do
          {:ok, %{rows: [[c]]}} -> c
          _ -> 0
        end
    }
  end

  defp format_uptime do
    {uptime_ms, _} = :erlang.statistics(:wall_clock)
    total_secs = div(uptime_ms, 1000)
    hours = div(total_secs, 3600)
    mins = div(rem(total_secs, 3600), 60)
    "#{hours}h #{mins}m"
  end

  defp maybe_refresh_pinned_notes(socket) do
    assign(socket, :pinned_notes, TePhoenixWeb.Admin.AdminHelpers.load_pinned_notes())
  end

  defp append_action_log(socket, entry) do
    update(socket, :action_log, fn log -> [entry | log] |> Enum.take(20) end)
  end

  defp actor(socket), do: %{id: socket.assigns[:session_user_id], name: socket.assigns[:session_username] || "GM"}

  # ── Render ─────────────────────────────────────────────────────────

  @impl true
  def render(assigns) do
    max_page = max(1, ceil(assigns.total / @per_page))
    assigns = assign(assigns, max_page: max_page)

    ~H"""
    <div>
      <h2 class="text-2xl font-bold text-amber-400 mb-6">GM Hub</h2>

      <!-- Tab Bar -->
      <div class="flex gap-1 mb-6 border-b border-zinc-800 pb-3">
        <button :for={t <- @tabs} phx-click="change_tab" phx-value-tab={t}
          class={["px-3 py-1.5 rounded-t text-sm font-medium transition-colors",
            @tab == t && "bg-amber-600 text-white",
            @tab != t && "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"]}>
          {tab_label(t)}
        </button>
      </div>

      <!-- Tab Content -->
      <%= case @tab do %>
        <% "tools" -> %>
          <.render_tools {assigns} />

        <% "notes" -> %>
          <.render_notes {assigns} />

        <% "activity" -> %>
          <.render_activity {assigns} />


        <% _ -> %>
          <div class="p-8 text-center text-zinc-600 text-sm">Unknown tab</div>
      <% end %>
    </div>
    """
  end

  # ── Tools Tab ──────────────────────────────────────────────────────

  defp render_tools(assigns) do
    ~H"""
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <!-- Server Broadcast -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-3">Server Broadcast</h3>
        <form phx-submit="send_broadcast" class="space-y-3">
          <textarea name="message" phx-change="update_broadcast"
            rows="3" placeholder="Type broadcast message..."
            class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:outline-none resize-none">{@broadcast_msg}</textarea>
          <select name="style" phx-change="update_broadcast_style"
            class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
            <option value="info" selected={@broadcast_style == "info"}>Info</option>
            <option value="warning" selected={@broadcast_style == "warning"}>Warning</option>
            <option value="danger" selected={@broadcast_style == "danger"}>Danger</option>
          </select>
          <button type="submit"
            class="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded transition-colors">
            Send Broadcast
          </button>
        </form>
      </div>

      <!-- Map Broadcast -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-3">Map Broadcast</h3>
        <form phx-submit="send_map_broadcast" phx-change="update_map_broadcast" class="space-y-3">
          <select name="map_id"
            class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
            <option value="">Select map...</option>
            <option :for={m <- @maps_list} value={m.id} selected={to_string(m.id) == @map_broadcast_id}>{m.name}</option>
          </select>
          <input type="text" name="message" value={@map_broadcast_msg} placeholder="Map message..."
            class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:outline-none" />
          <button type="submit"
            class="w-full px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium rounded transition-colors">
            Send to Map
          </button>
        </form>
      </div>

      <!-- Server Stats -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500">Server Stats</h3>
          <button phx-click="refresh_stats" class="text-xs text-amber-500 hover:text-amber-400">Refresh</button>
        </div>
        <div :if={@server_stats} class="space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-zinc-500">Online</span>
            <span class="text-emerald-400 font-medium">{@server_stats.online_count}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-zinc-500">Uptime</span>
            <span class="text-zinc-300">{@server_stats.uptime}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-zinc-500">Total Characters</span>
            <span class="text-zinc-300">{@server_stats.total_characters}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-zinc-500">Total Accounts</span>
            <span class="text-zinc-300">{@server_stats.total_accounts}</span>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-3">Quick Actions</h3>

        <!-- Heal All -->
        <div>
          <button phx-click="heal_all"
            class="w-full px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium rounded transition-colors">
            Heal All Online
          </button>
          <p :if={@heal_result} class="text-xs text-emerald-400 mt-1">{@heal_result}</p>
        </div>

        <!-- Grant XP -->
        <form phx-submit="grant_xp" class="space-y-2">
          <input type="number" name="amount" value={@xp_amount} placeholder="XP amount"
            phx-change="update_xp_amount" min="1"
            class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:outline-none" />
          <button type="submit"
            class="w-full px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium rounded transition-colors">
            Grant XP to All Online
          </button>
        </form>
        <p :if={@xp_result} class="text-xs text-blue-400">{@xp_result}</p>

        <!-- Force Weather -->
        <form phx-submit="force_weather" phx-change="update_weather" class="space-y-2">
          <select name="effect"
            class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
            <option :for={w <- ~w(clear rain storm snow fog sandstorm blizzard)} value={w} selected={@weather_effect == w}>{String.capitalize(w)}</option>
          </select>
          <button type="submit"
            class="w-full px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium rounded transition-colors">
            Force Weather
          </button>
        </form>

        <!-- Maintenance Mode -->
        <button phx-click="toggle_maintenance"
          class={["w-full px-4 py-2 text-white text-sm font-medium rounded transition-colors",
            @maintenance_mode && "bg-red-700 hover:bg-red-600",
            !@maintenance_mode && "bg-zinc-700 hover:bg-zinc-600"]}>
          {if @maintenance_mode, do: "Disable Maintenance Mode", else: "Enable Maintenance Mode"}
        </button>
      </div>

      <!-- Targeted Player Tools -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5 lg:col-span-3">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500">Target Player</h3>
          <button :if={@target_player} phx-click="target_clear" class="text-xs text-zinc-500 hover:text-zinc-300">Clear</button>
        </div>
        <!-- Search -->
        <form phx-submit="target_find" phx-change="target_search" class="flex gap-2 mb-3">
          <input type="text" name="search" value={@target_search} placeholder="Search by username..."
            phx-debounce="300"
            class="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:outline-none" />
          <button type="submit" class="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-white text-sm rounded">Find</button>
        </form>
        <!-- Result message -->
        <p :if={@target_result} class="text-xs text-amber-400 mb-3">{@target_result}</p>
        <!-- Player found -->
        <div :if={@target_player} class="border border-amber-800/30 rounded-lg p-4 bg-zinc-950/50">
          <div class="flex items-center gap-4 mb-4">
            <div>
              <span class="text-lg font-bold text-zinc-200">{@target_player.username}</span>
              <span class="text-[10px] ml-2 px-2 py-0.5 rounded bg-amber-900/50 text-amber-400">{@target_player.role}</span>
            </div>
            <span class="text-sm text-amber-400 font-mono">{@target_player.currency}g</span>
            <form phx-submit="target_give_gold" class="flex gap-1 ml-auto">
              <input type="number" name="amount" value="1000"
                class="w-24 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300" />
              <button type="submit" class="px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs">Give Gold</button>
            </form>
          </div>
          <!-- Characters -->
          <div :if={@target_chars != []} class="space-y-3">
            <%= for char <- @target_chars do %>
            <div class="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-3">
                  <span class="text-sm font-medium text-zinc-200">{char["name"]}</span>
                  <span class="text-xs text-zinc-500">{char["class_name"]}</span>
                  <span class="text-xs text-amber-400 font-mono">Lv.{char["level"]}</span>
                </div>
                <div class="flex items-center gap-3 text-xs">
                  <span class="text-red-400">HP {char["current_hp"]}/{char["max_hp"]}</span>
                  <span class="text-blue-400">MP {char["current_mp"]}/{char["max_mp"]}</span>
                  <span class="text-zinc-500">📍 {char["map_name"] || "Map #{char["map_id"]}"}</span>
                  <span class="text-zinc-600">⚡ {char["experience"]} XP</span>
                </div>
              </div>
              <div class="flex gap-2 flex-wrap">
                <!-- Heal -->
                <button phx-click="target_heal" phx-value-char-id={char["id"]}
                  class="px-2.5 py-1 bg-emerald-900/50 text-emerald-400 border border-emerald-800/50 rounded text-xs hover:bg-emerald-800/50">💚 Heal</button>
                <!-- Give XP -->
                <form phx-submit="target_give_xp" class="flex gap-1">
                  <input type="hidden" name="char-id" value={char["id"]} />
                  <input type="number" name="amount" value="100" min="1"
                    class="w-20 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300" />
                  <button type="submit" class="px-2.5 py-1 bg-blue-900/50 text-blue-400 border border-blue-800/50 rounded text-xs hover:bg-blue-800/50">⚡ +XP</button>
                </form>
                <!-- Teleport -->
                <form phx-submit="target_teleport" class="flex gap-1">
                  <input type="hidden" name="char-id" value={char["id"]} />
                  <select name="map-id" class="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300">
                    <option value="">Teleport to...</option>
                    <option :for={m <- @maps_list} value={m.id}>{m.name}</option>
                  </select>
                  <button type="submit" class="px-2.5 py-1 bg-purple-900/50 text-purple-400 border border-purple-800/50 rounded text-xs hover:bg-purple-800/50">📍 Go</button>
                </form>
              </div>
            </div>
            <% end %>
          </div>
          <div :if={@target_chars == []} class="text-xs text-zinc-600 italic">No characters on this account</div>
        </div>
      </div>

      <!-- Action Log -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5 lg:col-span-2">
        <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-3">Action Log (This Session)</h3>
        <div class="max-h-48 overflow-y-auto space-y-1">
          <div :for={entry <- @action_log} class="flex items-center gap-2 text-xs py-1 border-b border-zinc-800/50">
            <span class="text-amber-400 font-medium shrink-0">{entry.action}</span>
            <span class="text-zinc-400 flex-1 truncate">{entry.detail}</span>
            <span class="text-zinc-600 shrink-0">{format_timestamp(entry.at)}</span>
          </div>
          <div :if={@action_log == []} class="text-zinc-600 text-xs py-2">No actions taken yet this session.</div>
        </div>
      </div>
    </div>
    """
  end

  # ── Notes Tab ──────────────────────────────────────────────────────

  defp render_notes(assigns) do
    ~H"""
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Compose Note -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-3">New Note</h3>
        <form phx-submit="add_note" phx-change="update_note_form" class="space-y-3">
          <textarea name="body" rows="4" placeholder="Write a GM note..."
            class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:outline-none resize-y">{@note_body}</textarea>
          <select name="scope"
            class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
            <option value="global" selected={@note_scope == "global"}>Global</option>
            <option value="map" selected={@note_scope == "map"}>Per-Map</option>
          </select>
          <select :if={@note_scope == "map"} name="map_id"
            class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
            <option value="">Select map...</option>
            <option :for={m <- @maps_list} value={m.id}>{m.name}</option>
          </select>
          <label class="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
            <input type="checkbox" name="pinned" value="1" checked={@note_pinned}
              class="rounded border-zinc-600 bg-zinc-950 text-amber-500 focus:ring-amber-500" />
            Pin to header strip
          </label>
          <button type="submit"
            class="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded transition-colors">
            Add Note
          </button>
        </form>
      </div>

      <!-- Notes List -->
      <div class="lg:col-span-2 space-y-3">
        <!-- Filter -->
        <div class="flex items-center gap-3 mb-2">
          <span class="text-xs text-zinc-500">Filter:</span>
          <form phx-change="filter_notes_map">
            <select name="map_id"
              class="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-300 focus:border-amber-500 focus:outline-none">
              <option value="">All Notes</option>
              <option :for={m <- @maps_list} value={m.id} selected={to_string(m.id) == @notes_map_filter}>{m.name}</option>
            </select>
          </form>
          <span class="text-xs text-zinc-600">{length(@notes_list)} notes</span>
        </div>

        <div :for={note <- @notes_list} class={["bg-zinc-900 border rounded-lg p-4",
          note["pinned"] == 1 && "border-yellow-800/50",
          note["pinned"] != 1 && "border-zinc-800"]}>
          <div class="flex items-start gap-3">
            <div class="flex-1">
              <p class="text-sm text-zinc-200">{note["body"]}</p>
              <div class="flex items-center gap-2 mt-2 text-[10px] text-zinc-500">
                <span>{note["author"]}</span>
                <span>&middot;</span>
                <span>{format_timestamp(note["created_at"])}</span>
                <span :if={note["map_id"]} class="text-blue-400">Map #{note["map_id"]}</span>
                <span :if={note["pinned"] == 1} class="text-yellow-400">pinned</span>
              </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button :if={note["pinned"] != 1} phx-click="pin_note" phx-value-id={note["id"]}
                class="px-2 py-1 text-[10px] text-yellow-500 hover:bg-yellow-900/30 rounded transition-colors"
                title="Pin">Pin</button>
              <button :if={note["pinned"] == 1} phx-click="unpin_note" phx-value-id={note["id"]}
                class="px-2 py-1 text-[10px] text-yellow-500 hover:bg-yellow-900/30 rounded transition-colors"
                title="Unpin">Unpin</button>
              <button phx-click="delete_note" phx-value-id={note["id"]}
                class="px-2 py-1 text-[10px] text-red-500 hover:bg-red-900/30 rounded transition-colors"
                title="Delete"
                data-confirm="Delete this note?">Del</button>
            </div>
          </div>
        </div>
        <div :if={@notes_list == []} class="p-8 text-center text-zinc-600 text-sm">No GM notes yet. Create one!</div>
      </div>
    </div>
    """
  end

  # ── Activity Tab ───────────────────────────────────────────────────

  defp render_activity(assigns) do
    ~H"""
    <div>
      <!-- Search + Controls -->
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <form phx-change="search" class="flex-1 max-w-xs">
          <input type="text" name="search" value={@search} placeholder="Search events..."
            phx-debounce="300"
            class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
        </form>
        <span class="text-xs text-zinc-600">{@total} records</span>
        <div class="ml-auto flex items-center gap-2">
          <button phx-click="prev_page" disabled={@page <= 1}
            class="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs hover:bg-zinc-700 disabled:opacity-30">Prev</button>
          <span class="text-xs text-zinc-500">{@page} / {@max_page}</span>
          <button phx-click="next_page" disabled={@page >= @max_page}
            class="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs hover:bg-zinc-700 disabled:opacity-30">Next</button>
        </div>
      </div>

      <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-zinc-800 text-left">
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">ID</th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Event Type</th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Actor</th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Details</th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Date</th>
            </tr>
          </thead>
          <tbody>
            <tr :for={row <- @rows} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
              <td class="px-3 py-2 text-sm text-zinc-500 font-mono">{row["id"]}</td>
              <td class="px-3 py-2">
                <span class="px-2 py-0.5 bg-amber-900/30 text-amber-400 text-xs rounded-full">{row["event_type"]}</span>
              </td>
              <td class="px-3 py-2 text-sm text-zinc-300">{row["actor_name"]}</td>
              <td class="px-3 py-2 text-sm text-zinc-500 max-w-[300px] truncate">{truncate(row["detail_json"], 60)}</td>
              <td class="px-3 py-2 text-xs text-zinc-600">{format_timestamp(row["created_at"])}</td>
            </tr>
          </tbody>
        </table>
        <div :if={@rows == []} class="p-8 text-center text-zinc-600 text-sm">No activity log entries found</div>
      </div>
    </div>
    """
  end

  # ── Helpers ────────────────────────────────────────────────────────

  defp tab_label("tools"), do: "Tools"
  defp tab_label("notes"), do: "Notes"
  defp tab_label("activity"), do: "Activity"
  defp tab_label(t), do: String.capitalize(t)

  defp to_maps(rows, columns) do
    Enum.map(rows, fn row -> Enum.zip(columns, row) |> Map.new() end)
  end

  defp truncate(nil, _len), do: ""

  defp truncate(val, len) when is_binary(val) do
    if String.length(val) > len, do: String.slice(val, 0, len) <> "...", else: val
  end

  defp truncate(val, _len), do: to_string(val)

  defp format_timestamp(nil), do: ""
  defp format_timestamp(%DateTime{} = ts), do: Calendar.strftime(ts, "%H:%M")
  defp format_timestamp(%NaiveDateTime{} = ts), do: Calendar.strftime(ts, "%b %d %H:%M")
  defp format_timestamp(ts), do: to_string(ts)

  defp parse_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end

  defp parse_int(val) when is_integer(val), do: val
  defp parse_int(_), do: 0

  defp parse_int_or_nil(""), do: nil
  defp parse_int_or_nil(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> nil
    end
  end
  defp parse_int_or_nil(val) when is_integer(val), do: val
  defp parse_int_or_nil(_), do: nil
end
