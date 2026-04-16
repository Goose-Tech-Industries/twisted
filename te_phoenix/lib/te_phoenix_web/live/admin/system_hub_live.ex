defmodule TePhoenixWeb.Admin.SystemHubLive do
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo

  @tabs ~w(health terminology templates import_export trash danger_zone)

  @impl true
  def mount(_params, _session, socket) do
    if connected?(socket), do: :timer.send_interval(10_000, self(), :refresh_health)

    {:ok,
     socket
     |> assign(
       active_tab: :system,
       tab: "health",
       tabs: @tabs,
       search: "",
       # health
       health: %{},
       # terminology
       terms: [],
       editing_term: nil,
       edit_display_name: "",
       # templates
       templates: [],
       # import_export
       export_json: "",
       import_json: "",
       maps_list: [],
       export_map_id: "",
       export_map_json: "",
       import_status: nil,
       # trash
       trash_items: [],
       trash_available: false,
       # danger_zone
       confirm_reset_players: "",
       confirm_reset_world: "",
       confirm_purge_log: "",
       danger_status: nil
     )
     |> load_tab()}
  end

  @impl true
  def handle_info(:refresh_health, socket) do
    if socket.assigns.tab == "health" do
      {:noreply, load_health(socket)}
    else
      {:noreply, socket}
    end
  end

  @impl true
  def handle_event("change_tab", %{"tab" => tab}, socket) do
    {:noreply, assign(socket, tab: tab, search: "") |> load_tab()}
  end

  def handle_event("search", %{"search" => q}, socket) do
    {:noreply, assign(socket, search: q) |> load_tab()}
  end

  # ── Terminology Events ───────────────────────────────────────────

  def handle_event("edit_term", %{"key" => key}, socket) do
    term = Enum.find(socket.assigns.terms, &(&1["term_key"] == key))
    display = if term, do: term["display_name"] || "", else: ""
    {:noreply, assign(socket, editing_term: key, edit_display_name: display)}
  end

  def handle_event("cancel_edit", _params, socket) do
    {:noreply, assign(socket, editing_term: nil, edit_display_name: "")}
  end

  def handle_event("update_display_name", %{"value" => val}, socket) do
    {:noreply, assign(socket, edit_display_name: val)}
  end

  def handle_event("save_term", _params, socket) do
    key = socket.assigns.editing_term
    display = socket.assigns.edit_display_name

    try do
      Repo.query(
        "UPDATE game_terminology SET display_name = ? WHERE term_key = ?",
        [display, key]
      )
    rescue
      _ -> :ok
    end

    {:noreply, assign(socket, editing_term: nil, edit_display_name: "") |> load_terminology()}
  end

  # ── Template Events ──────────────────────────────────────────────

  def handle_event("install_template", %{"id" => id_str}, socket) do
    id = to_int(id_str)

    try do
      Repo.query("UPDATE game_templates SET installed = 0 WHERE installed = 1", [])
      Repo.query("UPDATE game_templates SET installed = 1, installed_at = NOW() WHERE id = ?", [id])
    rescue
      _ -> :ok
    end

    {:noreply, load_templates(socket)}
  end

  # ── Import/Export Events ─────────────────────────────────────────

  def handle_event("export_settings", _params, socket) do
    json =
      try do
        case Repo.query("SELECT setting_key, setting_value FROM system_settings ORDER BY setting_key") do
          {:ok, %{rows: rows, columns: cols}} ->
            to_maps(rows, cols) |> Jason.encode!(pretty: true)

          _ ->
            "{\"error\": \"Could not load settings\"}"
        end
      rescue
        _ -> "{\"error\": \"Query failed\"}"
      end

    {:noreply, assign(socket, export_json: json)}
  end

  def handle_event("select_export_map", %{"map_id" => map_id}, socket) do
    {:noreply, assign(socket, export_map_id: map_id, export_map_json: "")}
  end

  def handle_event("export_map", _params, socket) do
    map_id = socket.assigns.export_map_id

    json =
      if map_id == "" do
        ""
      else
        try do
          case Repo.query("SELECT * FROM game_maps WHERE id = ?", [to_int(map_id)]) do
            {:ok, %{rows: [row], columns: cols}} ->
              map_data = Enum.zip(cols, row) |> Map.new()
              %{"map" => map_data} |> Jason.encode!(pretty: true)

            _ ->
              "{\"error\": \"Map not found\"}"
          end
        rescue
          _ -> "{\"error\": \"Query failed\"}"
        end
      end

    {:noreply, assign(socket, export_map_json: json)}
  end

  def handle_event("update_import_json", %{"value" => val}, socket) do
    {:noreply, assign(socket, import_json: val)}
  end

  def handle_event("import_settings", _params, socket) do
    result =
      try do
        case Jason.decode(socket.assigns.import_json) do
          {:ok, settings} when is_list(settings) ->
            Enum.each(settings, fn item ->
              key = item["setting_key"]
              val = item["setting_value"]

              if key do
                Repo.query(
                  "INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?",
                  [key, val, val]
                )
              end
            end)

            "Imported #{length(settings)} settings successfully."

          {:ok, _} ->
            "Invalid format: expected a JSON array of settings."

          {:error, _} ->
            "Invalid JSON."
        end
      rescue
        e -> "Import failed: #{Exception.message(e)}"
      end

    {:noreply, assign(socket, import_status: result)}
  end

  # ── Trash Events ─────────────────────────────────────────────────

  def handle_event("restore_item", %{"id" => id_str}, socket) do
    id = to_int(id_str)

    try do
      case Repo.query("SELECT entity_type, entity_id, entity_data FROM admin_trash WHERE id = ?", [id]) do
        {:ok, %{rows: [[_type, _eid, _data]]}} ->
          Repo.query("DELETE FROM admin_trash WHERE id = ?", [id])

        _ ->
          :ok
      end
    rescue
      _ -> :ok
    end

    {:noreply, load_trash(socket)}
  end

  # ── Danger Zone Events ──────────────────────────────────────────

  def handle_event("update_confirm", %{"field" => field, "value" => val}, socket) do
    key =
      case field do
        "reset_players" -> :confirm_reset_players
        "reset_world" -> :confirm_reset_world
        "purge_log" -> :confirm_purge_log
        _ -> nil
      end

    if key do
      {:noreply, assign(socket, [{key, val}])}
    else
      {:noreply, socket}
    end
  end

  def handle_event("reset_players", _params, socket) do
    if socket.assigns.confirm_reset_players == "CONFIRM" do
      try do
        Repo.query("DELETE FROM characters", [])
        {:noreply, assign(socket, danger_status: "All player characters deleted.", confirm_reset_players: "")}
      rescue
        e -> {:noreply, assign(socket, danger_status: "Failed: #{Exception.message(e)}")}
      end
    else
      {:noreply, assign(socket, danger_status: "Type CONFIRM to proceed.")}
    end
  end

  def handle_event("reset_world", _params, socket) do
    if socket.assigns.confirm_reset_world == "CONFIRM" do
      try do
        Repo.query("DELETE FROM world_flags", [])
        {:noreply, assign(socket, danger_status: "World state reset.", confirm_reset_world: "")}
      rescue
        e -> {:noreply, assign(socket, danger_status: "Failed: #{Exception.message(e)}")}
      end
    else
      {:noreply, assign(socket, danger_status: "Type CONFIRM to proceed.")}
    end
  end

  def handle_event("purge_log", _params, socket) do
    if socket.assigns.confirm_purge_log == "CONFIRM" do
      try do
        Repo.query("TRUNCATE TABLE game_event_log", [])
        {:noreply, assign(socket, danger_status: "Event log purged.", confirm_purge_log: "")}
      rescue
        e -> {:noreply, assign(socket, danger_status: "Failed: #{Exception.message(e)}")}
      end
    else
      {:noreply, assign(socket, danger_status: "Type CONFIRM to proceed.")}
    end
  end

  # ── Data Loading ─────────────────────────────────────────────────

  defp load_tab(%{assigns: %{tab: "health"}} = socket), do: load_health(socket)
  defp load_tab(%{assigns: %{tab: "terminology"}} = socket), do: load_terminology(socket)
  defp load_tab(%{assigns: %{tab: "templates"}} = socket), do: load_templates(socket)
  defp load_tab(%{assigns: %{tab: "import_export"}} = socket), do: load_import_export(socket)
  defp load_tab(%{assigns: %{tab: "trash"}} = socket), do: load_trash(socket)
  defp load_tab(%{assigns: %{tab: "danger_zone"}} = socket), do: assign(socket, danger_status: nil)
  defp load_tab(socket), do: socket

  defp load_health(socket) do
    {wall_ms, _} = :erlang.statistics(:wall_clock)
    uptime_hours = div(wall_ms, 3_600_000)
    uptime_mins = div(rem(wall_ms, 3_600_000), 60_000)

    mem = :erlang.memory()

    db_status =
      try do
        case Repo.query("SELECT 1") do
          {:ok, _} -> "Connected"
          _ -> "Error"
        end
      rescue
        _ -> "Unreachable"
      end

    db_connections =
      try do
        case Repo.query("SHOW STATUS LIKE 'Threads_connected'") do
          {:ok, %{rows: [[_, val]]}} -> val
          _ -> "?"
        end
      rescue
        _ -> "?"
      end

    table_count =
      try do
        case Repo.query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='twisted_rpg'") do
          {:ok, %{rows: [[c]]}} -> c
          _ -> "?"
        end
      rescue
        _ -> "?"
      end

    db_size =
      try do
        case Repo.query(
               "SELECT ROUND(SUM(data_length + index_length)/1024/1024, 2) FROM information_schema.TABLES WHERE TABLE_SCHEMA='twisted_rpg'"
             ) do
          {:ok, %{rows: [[s]]}} -> s
          _ -> "?"
        end
      rescue
        _ -> "?"
      end

    online =
      try do
        TePhoenix.Game.PlayerRegistry.count()
      rescue
        _ -> 0
      end

    health = %{
      uptime: "#{uptime_hours}h #{uptime_mins}m",
      mem_total: format_mb(mem[:total]),
      mem_process: format_mb(mem[:processes]),
      mem_system: format_mb(mem[:system]),
      mem_atom: format_mb(mem[:atom]),
      mem_binary: format_mb(mem[:binary]),
      db_status: db_status,
      db_connections: db_connections,
      table_count: table_count,
      db_size: db_size,
      online_players: online
    }

    assign(socket, health: health)
  end

  defp load_terminology(socket) do
    search = socket.assigns.search

    terms =
      try do
        case Repo.query("SELECT term_key, display_name, category FROM game_terminology ORDER BY category, term_key") do
          {:ok, %{rows: rows, columns: cols}} ->
            result = to_maps(rows, cols)

            if search != "" do
              Enum.filter(result, fn t ->
                String.contains?(String.downcase(t["term_key"] || ""), String.downcase(search))
              end)
            else
              result
            end

          _ ->
            load_terminology_fallback(search)
        end
      rescue
        _ -> load_terminology_fallback(search)
      end

    assign(socket, terms: terms)
  end

  defp load_terminology_fallback(search) do
    try do
      case Repo.query("SELECT setting_value FROM system_settings WHERE setting_key='custom_terminology'") do
        {:ok, %{rows: [[json]]}} when is_binary(json) ->
          case Jason.decode(json) do
            {:ok, map} when is_map(map) ->
              result =
                Enum.map(map, fn {k, v} ->
                  %{"term_key" => k, "display_name" => v, "category" => "custom"}
                end)

              if search != "" do
                Enum.filter(result, fn t ->
                  String.contains?(String.downcase(t["term_key"] || ""), String.downcase(search))
                end)
              else
                result
              end

            _ ->
              []
          end

        _ ->
          []
      end
    rescue
      _ -> []
    end
  end

  defp load_templates(socket) do
    templates =
      try do
        case Repo.query("SELECT id, name, description, installed AS is_active FROM game_templates ORDER BY id") do
          {:ok, %{rows: rows, columns: cols}} -> to_maps(rows, cols)
          _ -> []
        end
      rescue
        _ -> []
      end

    assign(socket, templates: templates)
  end

  defp load_import_export(socket) do
    maps =
      try do
        case Repo.query("SELECT id, name FROM game_maps ORDER BY name") do
          {:ok, %{rows: rows}} -> Enum.map(rows, fn [id, name] -> %{id: id, name: name} end)
          _ -> []
        end
      rescue
        _ -> []
      end

    assign(socket, maps_list: maps, export_json: "", export_map_json: "", import_status: nil)
  end

  defp load_trash(socket) do
    {available, items} =
      try do
        case Repo.query("SHOW TABLES LIKE 'admin_trash'") do
          {:ok, %{rows: [_ | _]}} ->
            case Repo.query("SELECT id, entity_type, entity_id, deleted_by, deleted_at FROM admin_trash ORDER BY deleted_at DESC") do
              {:ok, %{rows: rows, columns: cols}} -> {true, to_maps(rows, cols)}
              _ -> {true, []}
            end

          _ ->
            {false, []}
        end
      rescue
        _ -> {false, []}
      end

    assign(socket, trash_available: available, trash_items: items)
  end

  # ── Render ───────────────────────────────────────────────────────

  @impl true
  def render(assigns) do
    ~H"""
    <div>
      <h2 class="text-2xl font-bold text-amber-400 mb-6">System Hub</h2>

      <!-- Tab Bar -->
      <div class="flex gap-1 mb-6 border-b border-zinc-800 pb-3 flex-wrap">
        <button :for={t <- @tabs} phx-click="change_tab" phx-value-tab={t}
          class={["px-3 py-1.5 rounded-t text-sm font-medium transition-colors",
            @tab == t && "bg-amber-600 text-white",
            @tab != t && "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"]}>
          {tab_label(t)}
        </button>
      </div>

      <!-- Tab Content -->
      <%= case @tab do %>
        <% "health" -> %>
          {render_health(assigns)}
        <% "terminology" -> %>
          {render_terminology(assigns)}
        <% "templates" -> %>
          {render_templates(assigns)}
        <% "import_export" -> %>
          {render_import_export(assigns)}
        <% "trash" -> %>
          {render_trash(assigns)}
        <% "danger_zone" -> %>
          {render_danger_zone(assigns)}
        <% _ -> %>
          <div class="p-8 text-center text-zinc-600 text-sm">Unknown tab</div>
      <% end %>
    </div>
    """
  end

  defp render_health(assigns) do
    ~H"""
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <.health_stat label="BEAM Uptime" value={@health[:uptime] || "?"} color="amber" />
      <.health_stat label="Memory (Total)" value={@health[:mem_total] || "?"} color="blue" />
      <.health_stat label="Memory (Process)" value={@health[:mem_process] || "?"} color="blue" />
      <.health_stat label="Memory (System)" value={@health[:mem_system] || "?"} color="blue" />
      <.health_stat label="Memory (Atom)" value={@health[:mem_atom] || "?"} color="purple" />
      <.health_stat label="Memory (Binary)" value={@health[:mem_binary] || "?"} color="purple" />
      <.health_stat label="DB Status" value={@health[:db_status] || "?"} color={if @health[:db_status] == "Connected", do: "emerald", else: "red"} />
      <.health_stat label="DB Connections" value={to_string(@health[:db_connections] || "?")} color="zinc" />
      <.health_stat label="Tables" value={to_string(@health[:table_count] || "?")} color="zinc" />
      <.health_stat label="DB Size (MB)" value={to_string(@health[:db_size] || "?")} color="zinc" />
      <.health_stat label="Online Players" value={to_string(@health[:online_players] || 0)} color="emerald" />
    </div>
    <p class="text-xs text-zinc-600 mt-4">Auto-refreshes every 10 seconds</p>
    """
  end

  attr :label, :string, required: true
  attr :value, :string, required: true
  attr :color, :string, default: "zinc"

  defp health_stat(assigns) do
    ~H"""
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div class="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">{@label}</div>
      <div class={["text-xl font-bold", color_class(@color)]}>{@value}</div>
    </div>
    """
  end

  defp render_terminology(assigns) do
    ~H"""
    <div>
      <form phx-change="search" class="mb-4 max-w-xs">
        <input type="text" name="search" value={@search} placeholder="Search by key..."
          phx-debounce="300"
          class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
      </form>

      <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-zinc-800 text-left">
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Key</th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Display Name</th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Category</th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr :for={term <- @terms} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
              <td class="px-3 py-2 text-sm text-zinc-200 font-medium">{term["term_key"]}</td>
              <td class="px-3 py-2 text-sm text-zinc-400">
                <%= if @editing_term == term["term_key"] do %>
                  <div class="flex items-center gap-2">
                    <input type="text" value={@edit_display_name}
                      phx-keyup="update_display_name"
                      phx-key="*"
                      class="px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                    <button phx-click="save_term" class="px-2 py-1 bg-amber-600 text-white text-xs rounded hover:bg-amber-500">Save</button>
                    <button phx-click="cancel_edit" class="px-2 py-1 bg-zinc-700 text-zinc-300 text-xs rounded hover:bg-zinc-600">Cancel</button>
                  </div>
                <% else %>
                  {term["display_name"]}
                <% end %>
              </td>
              <td class="px-3 py-2 text-sm text-zinc-500">{term["category"]}</td>
              <td class="px-3 py-2 text-sm">
                <button :if={@editing_term != term["term_key"]} phx-click="edit_term" phx-value-key={term["term_key"]}
                  class="text-xs text-amber-400 hover:text-amber-300">Edit</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div :if={@terms == []} class="p-8 text-center text-zinc-600 text-sm">No terminology records found</div>
      </div>
    </div>
    """
  end

  defp render_templates(assigns) do
    ~H"""
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-zinc-800 text-left">
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">ID</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Name</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Description</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Status</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr :for={tpl <- @templates} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
            <td class="px-3 py-2 text-sm text-zinc-500">{tpl["id"]}</td>
            <td class="px-3 py-2 text-sm text-zinc-200 font-medium">{tpl["name"]}</td>
            <td class="px-3 py-2 text-sm text-zinc-500 max-w-[300px] truncate">{tpl["description"]}</td>
            <td class="px-3 py-2 text-sm">
              <%= if tpl["is_active"] == 1 do %>
                <span class="text-emerald-400 text-xs font-bold uppercase">Active</span>
              <% else %>
                <span class="text-zinc-600 text-xs">Inactive</span>
              <% end %>
            </td>
            <td class="px-3 py-2 text-sm">
              <%= if tpl["is_active"] != 1 do %>
                <button phx-click="install_template" phx-value-id={tpl["id"]}
                  class="px-2 py-1 bg-amber-600 text-white text-xs rounded hover:bg-amber-500">Install</button>
              <% end %>
            </td>
          </tr>
        </tbody>
      </table>
      <div :if={@templates == []} class="p-8 text-center text-zinc-600 text-sm">No templates found</div>
    </div>
    """
  end

  defp render_import_export(assigns) do
    ~H"""
    <div class="space-y-6">
      <!-- Export Settings -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 class="text-sm font-bold text-amber-400 uppercase tracking-wider mb-3">Export Settings</h3>
        <button phx-click="export_settings"
          class="px-3 py-2 bg-amber-600 text-white text-sm rounded hover:bg-amber-500 mb-3">Export All Settings</button>
        <div :if={@export_json != ""}>
          <textarea readonly rows="12"
            class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-xs text-zinc-300 font-mono">{@export_json}</textarea>
          <p class="text-xs text-zinc-600 mt-1">Copy the JSON above to save your settings.</p>
        </div>
      </div>

      <!-- Export Map -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 class="text-sm font-bold text-amber-400 uppercase tracking-wider mb-3">Export Map</h3>
        <div class="flex items-center gap-3 mb-3">
          <form phx-change="select_export_map">
            <select name="map_id"
              class="px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
              <option value="">Select a map...</option>
              <option :for={m <- @maps_list} value={m.id}>{m.name}</option>
            </select>
          </form>
          <button phx-click="export_map" disabled={@export_map_id == ""}
            class="px-3 py-2 bg-amber-600 text-white text-sm rounded hover:bg-amber-500 disabled:opacity-30">Export</button>
        </div>
        <div :if={@export_map_json != ""}>
          <textarea readonly rows="12"
            class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-xs text-zinc-300 font-mono">{@export_map_json}</textarea>
        </div>
      </div>

      <!-- Import Settings -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 class="text-sm font-bold text-amber-400 uppercase tracking-wider mb-3">Import Settings</h3>
        <textarea rows="8" phx-keyup="update_import_json" phx-key="*"
          placeholder="Paste settings JSON here..."
          class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-xs text-zinc-300 font-mono mb-3">{@import_json}</textarea>
        <button phx-click="import_settings"
          class="px-3 py-2 bg-amber-600 text-white text-sm rounded hover:bg-amber-500">Import</button>
        <p :if={@import_status} class="text-sm text-zinc-400 mt-2">{@import_status}</p>
      </div>
    </div>
    """
  end

  defp render_trash(assigns) do
    ~H"""
    <div>
      <%= if @trash_available do %>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-zinc-800 text-left">
                <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">ID</th>
                <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Entity Type</th>
                <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Entity ID</th>
                <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Deleted By</th>
                <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Deleted At</th>
                <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr :for={item <- @trash_items} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                <td class="px-3 py-2 text-sm text-zinc-500">{item["id"]}</td>
                <td class="px-3 py-2 text-sm text-zinc-200 font-medium">{item["entity_type"]}</td>
                <td class="px-3 py-2 text-sm text-zinc-400">{item["entity_id"]}</td>
                <td class="px-3 py-2 text-sm text-zinc-400">{item["deleted_by"]}</td>
                <td class="px-3 py-2 text-sm text-zinc-500">{item["deleted_at"]}</td>
                <td class="px-3 py-2 text-sm">
                  <button phx-click="restore_item" phx-value-id={item["id"]}
                    class="px-2 py-1 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-500">Restore</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div :if={@trash_items == []} class="p-8 text-center text-zinc-600 text-sm">Trash is empty</div>
        </div>
      <% else %>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p class="text-zinc-500 text-sm">Trash system not configured</p>
          <p class="text-zinc-600 text-xs mt-1">The admin_trash table does not exist.</p>
        </div>
      <% end %>
    </div>
    """
  end

  defp render_danger_zone(assigns) do
    ~H"""
    <div>
      <!-- Warning Banner -->
      <div class="bg-red-950 border border-red-800 rounded-xl p-4 mb-6">
        <h3 class="text-red-400 font-bold text-lg mb-1">DANGER ZONE</h3>
        <p class="text-red-300 text-sm">These actions are destructive and cannot be undone. Type CONFIRM to enable each action.</p>
      </div>

      <p :if={@danger_status} class="text-sm text-amber-400 mb-4 bg-zinc-900 border border-zinc-800 rounded p-3">{@danger_status}</p>

      <div class="space-y-4">
        <!-- Reset Players -->
        <div class="bg-zinc-900 border border-red-900/50 rounded-xl p-4">
          <h4 class="text-sm font-bold text-red-400 mb-2">Reset All Player Data</h4>
          <p class="text-xs text-zinc-500 mb-3">Deletes all characters from game_characters. This cannot be undone.</p>
          <div class="flex items-center gap-3">
            <input type="text" value={@confirm_reset_players} placeholder="Type CONFIRM"
              phx-keyup="update_confirm" phx-value-field="reset_players"
              class="px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-red-500 focus:outline-none w-40" />
            <button phx-click="reset_players" disabled={@confirm_reset_players != "CONFIRM"}
              class="px-3 py-2 bg-red-700 text-white text-sm rounded hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed">Reset Players</button>
          </div>
        </div>

        <!-- Reset World -->
        <div class="bg-zinc-900 border border-red-900/50 rounded-xl p-4">
          <h4 class="text-sm font-bold text-red-400 mb-2">Reset World State</h4>
          <p class="text-xs text-zinc-500 mb-3">Resets world_flags and game_events. This cannot be undone.</p>
          <div class="flex items-center gap-3">
            <input type="text" value={@confirm_reset_world} placeholder="Type CONFIRM"
              phx-keyup="update_confirm" phx-value-field="reset_world"
              class="px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-red-500 focus:outline-none w-40" />
            <button phx-click="reset_world" disabled={@confirm_reset_world != "CONFIRM"}
              class="px-3 py-2 bg-red-700 text-white text-sm rounded hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed">Reset World</button>
          </div>
        </div>

        <!-- Purge Event Log -->
        <div class="bg-zinc-900 border border-red-900/50 rounded-xl p-4">
          <h4 class="text-sm font-bold text-red-400 mb-2">Purge Event Log</h4>
          <p class="text-xs text-zinc-500 mb-3">Truncates game_event_log. This cannot be undone.</p>
          <div class="flex items-center gap-3">
            <input type="text" value={@confirm_purge_log} placeholder="Type CONFIRM"
              phx-keyup="update_confirm" phx-value-field="purge_log"
              class="px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-red-500 focus:outline-none w-40" />
            <button phx-click="purge_log" disabled={@confirm_purge_log != "CONFIRM"}
              class="px-3 py-2 bg-red-700 text-white text-sm rounded hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed">Purge Log</button>
          </div>
        </div>
      </div>
    </div>
    """
  end

  # ── Helpers ──────────────────────────────────────────────────────

  defp tab_label("health"), do: "Health"
  defp tab_label("terminology"), do: "Terminology"
  defp tab_label("templates"), do: "Templates"
  defp tab_label("import_export"), do: "Import/Export"
  defp tab_label("trash"), do: "Trash"
  defp tab_label("danger_zone"), do: "Danger Zone"
  defp tab_label(t), do: String.capitalize(t)

  defp color_class("amber"), do: "text-amber-400"
  defp color_class("blue"), do: "text-blue-400"
  defp color_class("emerald"), do: "text-emerald-400"
  defp color_class("red"), do: "text-red-400"
  defp color_class("purple"), do: "text-purple-400"
  defp color_class(_), do: "text-zinc-300"

  defp format_mb(bytes) when is_integer(bytes) do
    mb = bytes / (1024 * 1024)
    :erlang.float_to_binary(mb, decimals: 1) <> " MB"
  end

  defp format_mb(_), do: "?"

  defp to_maps(rows, columns) do
    Enum.map(rows, fn row -> Enum.zip(columns, row) |> Map.new() end)
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
