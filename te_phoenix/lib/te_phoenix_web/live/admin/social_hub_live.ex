defmodule TePhoenixWeb.Admin.SocialHubLive do
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo
  alias TePhoenix.Game.PlayerRegistry

  @tabs ~w(reports online chat broadcast warnings appeals auto_mod permissions guilds parties)

  @impl true
  def mount(_params, _session, socket) do
    if connected?(socket) do
      :timer.send_interval(5_000, :refresh_online)
    end

    {:ok,
     assign(socket,
       active_tab: :social,
       tab: "reports",
       tabs: @tabs,
       search: "",
       page: 1,
       rows: [],
       total: 0,
       online_players: [],
       broadcast_msg: "",
       columns: [],
       column_types: %{},
       current_table: nil,
       editing: nil,
       creating: false,
       form_data: %{},
       form_errors: []
     )
     |> load_tab()}
  end

  @impl true
  def handle_info(:refresh_online, %{assigns: %{tab: "online"}} = socket) do
    {:noreply, load_tab(socket)}
  end

  def handle_info(:refresh_online, socket) do
    {:noreply, socket}
  end

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
    max_p = max(1, ceil(socket.assigns.total / 30))
    {:noreply, assign(socket, page: min(max_p, socket.assigns.page + 1)) |> load_tab()}
  end

  def handle_event("resolve_report", %{"id" => id}, socket) do
    case Repo.query("UPDATE player_reports SET status = 'actioned' WHERE id = ?", [to_int(id)]) do
      {:ok, %{num_rows: n}} when n > 0 ->
        {:noreply, socket |> put_flash(:info, "Report ##{id} resolved.") |> load_tab()}

      _ ->
        {:noreply, put_flash(socket, :error, "Failed to resolve report.")}
    end
  end

  # ── CRUD events for moderation tabs ──────────────────────────
  def handle_event("new", _, socket) do
    defaults = for {c, m} <- (socket.assigns[:column_types] || %{}), c != "id", into: %{}, do: {c, m.default || ""}
    {:noreply, assign(socket, creating: true, editing: nil, form_data: defaults, form_errors: [])}
  end

  def handle_event("save_new", params, socket) do
    import TePhoenixWeb.Admin.CrudHelpers
    form = params["entity"] || %{}
    table = socket.assigns[:current_table]
    case create_record(table, form, socket.assigns[:column_types] || %{}) do
      :ok -> {:noreply, socket |> assign(creating: false, form_data: %{}, form_errors: []) |> put_flash(:info, "Created!") |> load_tab()}
      {:error, msg} -> {:noreply, assign(socket, form_errors: [msg])}
    end
  end

  def handle_event("edit", %{"id" => id}, socket) do
    row = Enum.find(socket.assigns.rows, &(to_string(&1["id"]) == to_string(id)))
    if row do
      form = for {k, v} <- row, into: %{}, do: {k, if(is_nil(v), do: "", else: to_string(v))}
      {:noreply, assign(socket, editing: row, creating: false, form_data: form, form_errors: [])}
    else {:noreply, socket} end
  end

  def handle_event("save_edit", params, socket) do
    import TePhoenixWeb.Admin.CrudHelpers
    form = params["entity"] || %{}
    table = socket.assigns[:current_table]
    row_id = socket.assigns[:editing] && socket.assigns.editing["id"]
    case update_record(table, row_id, form, socket.assigns[:columns] || [], socket.assigns[:column_types] || %{}) do
      :ok -> {:noreply, socket |> assign(editing: nil, form_data: %{}, form_errors: []) |> put_flash(:info, "Updated!") |> load_tab()}
      {:error, msg} -> {:noreply, assign(socket, form_errors: [msg])}
    end
  end

  def handle_event("delete", %{"id" => id}, socket) do
    import TePhoenixWeb.Admin.CrudHelpers
    table = socket.assigns[:current_table]
    case delete_record(table, id) do
      :ok -> {:noreply, socket |> put_flash(:info, "Deleted!") |> load_tab()}
      {:error, msg} -> {:noreply, put_flash(socket, :error, msg)}
    end
  end

  def handle_event("cancel_form", _, socket), do: {:noreply, assign(socket, editing: nil, creating: false, form_data: %{}, form_errors: [])}
  def handle_event("update_form", %{"entity" => d}, socket), do: {:noreply, assign(socket, form_data: Map.merge(socket.assigns[:form_data] || %{}, d))}

  def handle_event("update_broadcast", %{"message" => msg}, socket) do
    {:noreply, assign(socket, broadcast_msg: msg)}
  end

  def handle_event("send_broadcast", %{"message" => msg}, socket) do
    if msg != "" do
      TePhoenixWeb.Endpoint.broadcast!("social:lobby", "system_broadcast", %{
        message: msg,
        from: "SYSTEM",
        timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
      })

      {:noreply, socket |> put_flash(:info, "Broadcast sent.") |> assign(broadcast_msg: "")}
    else
      {:noreply, put_flash(socket, :error, "Message cannot be empty.")}
    end
  end

  # ── Data Loading ──────────────────────────────────────────────────

  defp load_tab(%{assigns: %{tab: "reports"}} = socket) do
    search = socket.assigns.search
    offset = (socket.assigns.page - 1) * 30

    {where, params} =
      if search != "" do
        {"WHERE reporter_name LIKE ? OR reported_name LIKE ?", ["%#{search}%", "%#{search}%"]}
      else
        {"", []}
      end

    total =
      case Repo.query("SELECT COUNT(*) FROM player_reports #{where}", params) do
        {:ok, %{rows: [[c]]}} -> c
        _ -> 0
      end

    rows =
      case Repo.query(
             "SELECT id, reporter_name, reported_name, reason, (status IN ('actioned','dismissed')) AS resolved, created_at FROM player_reports #{where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
             params ++ [30, offset]
           ) do
        {:ok, %{rows: r}} ->
          Enum.map(r, fn [id, reporter, reported, reason, resolved, ts] ->
            %{
              id: id,
              reporter_name: reporter,
              reported_name: reported,
              reason: reason,
              resolved: resolved,
              created_at: ts
            }
          end)

        _ ->
          []
      end

    assign(socket, rows: rows, total: total)
  end

  defp load_tab(%{assigns: %{tab: "online"}} = socket) do
    players = PlayerRegistry.all()

    filtered =
      if socket.assigns.search != "" do
        q = String.downcase(socket.assigns.search)

        Enum.filter(players, fn p ->
          name = Map.get(p, :name, "") || ""
          String.contains?(String.downcase(name), q)
        end)
      else
        players
      end

    sorted = Enum.sort_by(filtered, &(Map.get(&1, :name, "")))

    assign(socket, online_players: sorted, total: length(sorted), rows: [])
  end

  defp load_tab(%{assigns: %{tab: "chat"}} = socket) do
    rows =
      try do
        case Repo.query(
               "SELECT id, event_type, actor_name, detail_json, created_at FROM game_event_log ORDER BY created_at DESC LIMIT 100"
             ) do
          {:ok, %{rows: r}} ->
            Enum.map(r, fn [id, event_type, actor, detail, ts] ->
              %{id: id, from: actor, message: detail, channel: event_type, timestamp: ts}
            end)

          _ ->
            []
        end
      rescue
        _ -> []
      end

    assign(socket, rows: rows, total: length(rows))
  end

  defp load_tab(%{assigns: %{tab: "broadcast"}} = socket) do
    assign(socket, rows: [], total: 0)
  end

  # ── CRUD tabs (use CrudHelpers for generic table access) ──────
  @crud_tabs %{
    "warnings" => "player_warnings",
    "appeals" => "player_appeals",
    "auto_mod" => "game_auto_mod_rules",
    "permissions" => "staff_permissions",
    "guilds" => "guilds",
    "parties" => "character_parties",
  }

  defp load_tab(%{assigns: %{tab: tab}} = socket) when is_map_key(@crud_tabs, tab) do
    table = @crud_tabs[tab]
    import TePhoenixWeb.Admin.CrudHelpers
    socket
    |> assign(current_table: table)
    |> load_tab_data(table, per_page: 30)
  end

  defp load_tab(socket), do: assign(socket, rows: [], total: 0, columns: [], column_types: %{})

  # ── Render ────────────────────────────────────────────────────────

  @impl true
  def render(assigns) do
    max_page = max(1, ceil(assigns.total / 30))
    assigns = assign(assigns, max_page: max_page)

    ~H"""
    <div>
      <h2 class="text-2xl font-bold text-amber-400 mb-6">Social / Mod Hub</h2>

      <!-- Tab Bar -->
      <div class="flex gap-1 mb-6 border-b border-zinc-800 pb-3">
        <button :for={t <- @tabs} phx-click="change_tab" phx-value-tab={t}
          class={["px-3 py-1.5 rounded-t text-sm font-medium transition-colors",
            @tab == t && "bg-amber-600 text-white",
            @tab != t && "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"]}>
          {String.capitalize(t)}
        </button>
      </div>

      <!-- Search (for reports/online) -->
      <div :if={@tab in ["reports", "online"]} class="flex items-center gap-4 mb-4">
        <form phx-submit="search" class="flex-1">
          <input type="text" name="search" value={@search}
            placeholder={if @tab == "reports", do: "Search by reporter or reported...", else: "Search by name..."}
            phx-debounce="300"
            class="w-full max-w-sm px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:outline-none" />
        </form>
        <div :if={@total > 0 and @tab == "reports"} class="flex items-center gap-2 shrink-0">
          <span class="text-xs text-zinc-600">{@total} reports</span>
          <button phx-click="prev_page" disabled={@page <= 1}
            class="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs hover:bg-zinc-700 disabled:opacity-30">Prev</button>
          <span class="text-xs text-zinc-500">{@page} / {@max_page}</span>
          <button phx-click="next_page" disabled={@page >= @max_page}
            class="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs hover:bg-zinc-700 disabled:opacity-30">Next</button>
        </div>
      </div>

      <!-- Tab Content -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
        {render_tab(assigns)}
      </div>
    </div>
    """
  end

  defp render_tab(%{tab: "reports"} = assigns) do
    ~H"""
    <table class="w-full">
      <thead>
        <tr class="border-b border-zinc-800 text-left">
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">ID</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Reporter</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Reported</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Reason</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Status</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Date</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-20">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr :for={row <- @rows} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
          <td class="px-3 py-2 text-sm text-zinc-500 font-mono">{row.id}</td>
          <td class="px-3 py-2 text-sm text-zinc-300">{row.reporter_name}</td>
          <td class="px-3 py-2 text-sm text-red-400">{row.reported_name}</td>
          <td class="px-3 py-2 text-sm text-zinc-400 max-w-[250px] truncate">{row.reason}</td>
          <td class="px-3 py-2 text-sm">{resolve_badge(row.resolved)}</td>
          <td class="px-3 py-2 text-xs text-zinc-600">{format_timestamp(row.created_at)}</td>
          <td class="px-3 py-2">
            <button :if={row.resolved not in [1, true, "1", "true"]}
              phx-click="resolve_report" phx-value-id={row.id}
              class="text-xs px-2 py-1 rounded bg-green-900/50 text-green-400 hover:bg-green-800/50 transition-colors">
              Resolve
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <div :if={@rows == []} class="p-8 text-center text-zinc-600 text-sm">No reports found</div>
    """
  end

  defp render_tab(%{tab: "online"} = assigns) do
    ~H"""
    <div class="p-4">
      <div class="flex items-center gap-2 mb-4">
        <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
        <span class="text-sm text-zinc-400">{length(@online_players)} player(s) online</span>
        <span class="text-[10px] text-zinc-600 ml-2">Auto-refreshes every 5s</span>
      </div>

      <table :if={@online_players != []} class="w-full">
        <thead>
          <tr class="border-b border-zinc-800 text-left">
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Name</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Level</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Map</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Role</th>
          </tr>
        </thead>
        <tbody>
          <tr :for={p <- @online_players} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
            <td class="px-3 py-2 text-sm text-zinc-200 font-medium">{Map.get(p, :name, "???")}</td>
            <td class="px-3 py-2 text-sm text-amber-400">{Map.get(p, :level, "-")}</td>
            <td class="px-3 py-2 text-sm text-zinc-400">{Map.get(p, :map_id, "-")}</td>
            <td class="px-3 py-2 text-sm text-zinc-500">{Map.get(p, :role, "-")}</td>
          </tr>
        </tbody>
      </table>

      <div :if={@online_players == []} class="text-center text-zinc-600 text-sm py-4">No players online</div>
    </div>
    """
  end

  defp render_tab(%{tab: "chat"} = assigns) do
    ~H"""
    <div class="divide-y divide-zinc-800/50">
      <div :for={row <- @rows} class="px-4 py-2.5 hover:bg-zinc-800/30 transition-colors">
        <div class="flex items-center gap-3">
          <span class="text-sm text-amber-400 font-medium shrink-0">{row.from}</span>
          <span :if={row.channel} class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{row.channel}</span>
          <span class="text-[10px] text-zinc-600 ml-auto shrink-0">{format_timestamp(row.timestamp)}</span>
        </div>
        <p class="text-sm text-zinc-300 mt-1 truncate">{row.message}</p>
      </div>
    </div>
    <div :if={@rows == []} class="p-8 text-center text-zinc-600 text-sm">No chat log available</div>
    """
  end

  defp render_tab(%{tab: "broadcast"} = assigns) do
    ~H"""
    <div class="p-6 max-w-lg">
      <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4">System Broadcast</h3>
      <p class="text-xs text-zinc-600 mb-4">Send a message to all connected players in the lobby channel.</p>

      <form phx-submit="send_broadcast" class="space-y-4">
        <textarea
          name="message"
          value={@broadcast_msg}
          phx-change="update_broadcast"
          rows="4"
          placeholder="Type your broadcast message..."
          class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:outline-none resize-none"
        >{@broadcast_msg}</textarea>

        <button type="submit"
          class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded transition-colors">
          Send Broadcast
        </button>
      </form>
    </div>
    """
  end

  # Generic CRUD tab (warnings, appeals, auto_mod, permissions, guilds, parties)
  defp render_tab(%{tab: tab} = assigns) when tab in ~w(warnings appeals auto_mod permissions guilds parties) do
    import TePhoenixWeb.Admin.CrudHelpers, only: [format_cell: 1, field_type: 2]
    import TePhoenixWeb.Admin.HubCrudComponents

    show_form = assigns[:creating] || assigns[:editing] != nil
    form_title = if assigns[:creating], do: "Create New", else: "Edit ##{assigns[:editing] && assigns.editing["id"]}"
    editable_cols = (assigns[:columns] || []) -- ["id"]
    assigns = assign(assigns, show_form: show_form, form_title: form_title, editable_cols: editable_cols)

    ~H"""
    <div>
      <div :if={@show_form} class="fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-12 overflow-y-auto">
        <div class="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-2xl mb-12 shadow-2xl">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-amber-400">{@form_title}</h3>
            <button phx-click="cancel_form" class="text-zinc-500 hover:text-zinc-300 text-xl">&times;</button>
          </div>
          <div :for={err <- @form_errors} class="mb-3 p-2 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">{err}</div>
          <form phx-submit={if @creating, do: "save_new", else: "save_edit"} phx-change="update_form">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-2">
              <div :for={col <- @editable_cols} class="flex flex-col gap-1">
                <label class="text-xs font-bold text-zinc-500 uppercase tracking-wider">{col}</label>
                <.crud_field col={col} val={@form_data[col] || ""} ftype={field_type(@column_types, col)} />
              </div>
            </div>
            <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-800">
              <button type="button" phx-click="cancel_form" class="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-lg text-sm hover:bg-zinc-700">Cancel</button>
              <button type="submit" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-lg text-sm transition">{if @creating, do: "Create", else: "Save"}</button>
            </div>
          </form>
        </div>
      </div>

      <div class="flex justify-end p-3">
        <button phx-click="new" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded text-xs">+ New</button>
      </div>
      <table class="w-full">
        <thead>
          <tr class="border-b border-zinc-800 text-left">
            <th :for={col <- @columns}
              class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 whitespace-nowrap">{col}</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-24">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr :for={row <- @rows} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
            <td :for={col <- @columns}
              class="px-3 py-2 text-sm text-zinc-300 max-w-[200px] truncate whitespace-nowrap">{format_cell(row[col])}</td>
            <td class="px-3 py-2 flex gap-2">
              <button phx-click="edit" phx-value-id={row["id"]} class="text-xs text-amber-500 hover:text-amber-400">Edit</button>
              <button phx-click="delete" phx-value-id={row["id"]} data-confirm={"Delete ##{row["id"]}?"} class="text-xs text-red-500 hover:text-red-400">Del</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div :if={@rows == []} class="p-8 text-center text-zinc-600 text-sm">No records</div>
    </div>
    """
  end

  defp render_tab(assigns) do
    ~H"""
    <div class="p-8 text-center text-zinc-600 text-sm">Unknown tab</div>
    """
  end

  # ── Helpers ───────────────────────────────────────────────────────

  defp resolve_badge(val) when val in [1, true, "1", "true"] do
    Phoenix.HTML.raw(~s(<span class="text-xs px-2 py-0.5 rounded bg-green-900/50 text-green-400">Resolved</span>))
  end

  defp resolve_badge(_val) do
    Phoenix.HTML.raw(~s(<span class="text-xs px-2 py-0.5 rounded bg-red-900/50 text-red-400">Open</span>))
  end

  defp format_timestamp(nil), do: ""
  defp format_timestamp(%NaiveDateTime{} = ts), do: Calendar.strftime(ts, "%b %d %H:%M")
  defp format_timestamp(ts), do: to_string(ts)

  defp to_int(val) when is_integer(val), do: val
  defp to_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp to_int(_), do: 0
end
