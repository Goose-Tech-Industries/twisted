defmodule TePhoenixWeb.Admin.WorldHubLive do
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo

  @per_page 30
  @tabs ~w(maps npcs regions spawns connections versions worldforge)

  @weather_options ~w(CLEAR RAIN STORM FOG BLIZZARD BLOOD_MOON)
  @move_types ~w(STATIONARY WANDER PATROL)
  @render_modes ~w(classic 2.5d isometric hex side-scroll first-person 3d DEFAULT ISOMETRIC SIDE_SCROLL TOP_DOWN)

  # ── Mount ──────────────────────────────────────────────────────────

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(
       active_tab: :world,
       tab: "maps",
       tabs: @tabs,
       search: "",
       page: 1,
       rows: [],
       total: 0,
       maps_list: [],
       # CRUD state
       editing_id: nil,
       creating: false,
       form_data: %{},
       # NPC filters
       npc_map_filter: "",
       npc_enemy_filter: "",
       # Dropdown data
       regions_list: [],
       shops_list: [],
       # Worldforge / other tabs
       connections: [],
       versions: [],
       lore_bible: "",
       ai_provider: "",
       ai_model: "",
       lore_saved: false
     )
     |> load_maps_list()
     |> load_regions_list()
     |> load_shops_list()
     |> load_tab()}
  end

  # ── Events ─────────────────────────────────────────────────────────

  @impl true
  def handle_event("change_tab", %{"tab" => tab}, socket) do
    {:noreply, assign(socket, tab: tab, search: "", page: 1, editing_id: nil, creating: false, form_data: %{}) |> load_tab()}
  end

  def handle_event("search", %{"search" => q}, socket) do
    {:noreply, assign(socket, search: q, page: 1) |> load_tab()}
  end

  def handle_event("filter_map", %{"map_id" => map_id}, socket) do
    {:noreply, assign(socket, npc_map_filter: map_id, page: 1) |> load_tab()}
  end

  def handle_event("toggle_enemy_filter", %{"enemy" => val}, socket) do
    {:noreply, assign(socket, npc_enemy_filter: val, page: 1) |> load_tab()}
  end

  def handle_event("prev_page", _params, socket) do
    {:noreply, assign(socket, page: max(1, socket.assigns.page - 1)) |> load_tab()}
  end

  def handle_event("next_page", _params, socket) do
    max_p = max(1, ceil(socket.assigns.total / @per_page))
    {:noreply, assign(socket, page: min(max_p, socket.assigns.page + 1)) |> load_tab()}
  end

  # ── CRUD: Maps ─────────────────────────────────────────────────────

  def handle_event("create_map", _p, socket) do
    {:noreply, assign(socket,
      creating: true,
      editing_id: nil,
      form_data: %{
        "name" => "", "description" => "", "width" => "24", "height" => "24",
        "ambient_dark" => "0", "min_level" => "1", "region_id" => "",
        "is_active" => "1", "render_mode" => "DEFAULT", "fog_of_war" => "0"
      }
    )}
  end

  def handle_event("edit_map", %{"id" => id}, socket) do
    int_id = to_int(id)
    case Repo.query(
      "SELECT id, name, description, width, height, ambient_dark, min_level, region_id, is_active, render_mode, fog_of_war FROM game_maps WHERE id = ?",
      [int_id]
    ) do
      {:ok, %{rows: [row], columns: cols}} ->
        data = Enum.zip(cols, row) |> Map.new() |> stringify_vals()
        {:noreply, assign(socket, editing_id: int_id, creating: false, form_data: data)}
      _ ->
        {:noreply, socket}
    end
  end

  def handle_event("save_map", params, socket) do
    data = Map.get(params, "form", %{})
    if socket.assigns.editing_id do
      Repo.query(
        "UPDATE game_maps SET name = ?, description = ?, width = ?, height = ?, ambient_dark = ?, min_level = ?, region_id = ?, is_active = ?, render_mode = ?, fog_of_war = ? WHERE id = ?",
        [
          data["name"], data["description"], to_int(data["width"]), to_int(data["height"]),
          to_float(data["ambient_dark"]), to_int(data["min_level"]), null_or_int(data["region_id"]),
          to_int(data["is_active"]), data["render_mode"], to_int(data["fog_of_war"]),
          socket.assigns.editing_id
        ]
      )
    else
      Repo.query(
        "INSERT INTO game_maps (name, description, width, height, ambient_dark, min_level, region_id, is_active, render_mode, fog_of_war) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          data["name"], data["description"], to_int(data["width"]), to_int(data["height"]),
          to_float(data["ambient_dark"]), to_int(data["min_level"]), null_or_int(data["region_id"]),
          to_int(data["is_active"]), data["render_mode"], to_int(data["fog_of_war"])
        ]
      )
    end

    {:noreply, assign(socket, editing_id: nil, creating: false, form_data: %{}) |> load_maps_list() |> load_tab()}
  end

  def handle_event("delete_map", %{"id" => id}, socket) do
    Repo.query("DELETE FROM game_maps WHERE id = ?", [to_int(id)])
    {:noreply, socket |> load_maps_list() |> load_tab()}
  end

  # ── CRUD: NPCs ─────────────────────────────────────────────────────

  def handle_event("create_npc", _p, socket) do
    {:noreply, assign(socket,
      creating: true,
      editing_id: nil,
      form_data: %{
        "name" => "", "icon" => "", "persona" => "", "map_id" => "", "x" => "0", "y" => "0",
        "is_enemy" => "0", "move_type" => "STATIONARY", "wander_radius" => "3", "shop_id" => "",
        "base_hp" => "100", "base_mp" => "50", "base_atk" => "10", "base_def" => "10",
        "base_mo" => "10", "base_md" => "10", "base_speed" => "10", "base_luck" => "5",
        "element" => "", "drop_table_json" => "[]"
      }
    )}
  end

  def handle_event("edit_npc", %{"id" => id}, socket) do
    int_id = to_int(id)
    case Repo.query(
      "SELECT id, name, icon, persona, map_id, x, y, is_enemy, move_type, wander_radius, shop_id, base_hp, base_mp, base_atk, base_def, base_mo, base_md, base_speed, base_luck, element, drop_table_json FROM game_npcs WHERE id = ?",
      [int_id]
    ) do
      {:ok, %{rows: [row], columns: cols}} ->
        data = Enum.zip(cols, row) |> Map.new() |> stringify_vals()
        {:noreply, assign(socket, editing_id: int_id, creating: false, form_data: data)}
      _ ->
        {:noreply, socket}
    end
  end

  def handle_event("save_npc", params, socket) do
    data = Map.get(params, "form", %{})
    if socket.assigns.editing_id do
      Repo.query(
        "UPDATE game_npcs SET name = ?, icon = ?, persona = ?, map_id = ?, x = ?, y = ?, is_enemy = ?, move_type = ?, wander_radius = ?, shop_id = ?, base_hp = ?, base_mp = ?, base_atk = ?, base_def = ?, base_mo = ?, base_md = ?, base_speed = ?, base_luck = ?, element = ?, drop_table_json = ? WHERE id = ?",
        [
          data["name"], data["icon"], data["persona"], null_or_int(data["map_id"]),
          to_int(data["x"]), to_int(data["y"]), to_int(data["is_enemy"]),
          data["move_type"], to_int(data["wander_radius"]), null_or_int(data["shop_id"]),
          to_int(data["base_hp"]), to_int(data["base_mp"]), to_int(data["base_atk"]),
          to_int(data["base_def"]), to_int(data["base_mo"]), to_int(data["base_md"]),
          to_int(data["base_speed"]), to_int(data["base_luck"]),
          data["element"], data["drop_table_json"],
          socket.assigns.editing_id
        ]
      )
    else
      Repo.query(
        "INSERT INTO game_npcs (name, icon, persona, map_id, x, y, is_enemy, move_type, wander_radius, shop_id, base_hp, base_mp, base_atk, base_def, base_mo, base_md, base_speed, base_luck, element, drop_table_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          data["name"], data["icon"], data["persona"], null_or_int(data["map_id"]),
          to_int(data["x"]), to_int(data["y"]), to_int(data["is_enemy"]),
          data["move_type"], to_int(data["wander_radius"]), null_or_int(data["shop_id"]),
          to_int(data["base_hp"]), to_int(data["base_mp"]), to_int(data["base_atk"]),
          to_int(data["base_def"]), to_int(data["base_mo"]), to_int(data["base_md"]),
          to_int(data["base_speed"]), to_int(data["base_luck"]),
          data["element"], data["drop_table_json"]
        ]
      )
    end

    {:noreply, assign(socket, editing_id: nil, creating: false, form_data: %{}) |> load_tab()}
  end

  def handle_event("delete_npc", %{"id" => id}, socket) do
    Repo.query("DELETE FROM game_npcs WHERE id = ?", [to_int(id)])
    {:noreply, load_tab(socket)}
  end

  # ── CRUD: Regions ──────────────────────────────────────────────────

  def handle_event("create_region", _p, socket) do
    {:noreply, assign(socket,
      creating: true,
      editing_id: nil,
      form_data: %{
        "name" => "", "icon" => "", "description" => "", "danger_level" => "1",
        "corruption_level" => "0", "xp_mult" => "1.0", "gold_mult" => "1.0",
        "loot_mult" => "1.0", "spawn_rate_mult" => "1.0", "shop_price_mult" => "1.0",
        "pvp_enabled" => "0", "is_sanctuary" => "0", "weather_override" => "CLEAR",
        "auto_rules_json" => "[]"
      }
    )}
  end

  def handle_event("edit_region", %{"id" => id}, socket) do
    int_id = to_int(id)
    case Repo.query(
      "SELECT id, name, icon, description, danger_level, corruption_level, xp_mult, gold_mult, loot_mult, spawn_rate_mult, shop_price_mult, pvp_enabled, is_sanctuary, weather_override, auto_rules_json FROM game_regions WHERE id = ?",
      [int_id]
    ) do
      {:ok, %{rows: [row], columns: cols}} ->
        data = Enum.zip(cols, row) |> Map.new() |> stringify_vals()
        {:noreply, assign(socket, editing_id: int_id, creating: false, form_data: data)}
      _ ->
        {:noreply, socket}
    end
  end

  def handle_event("save_region", params, socket) do
    data = Map.get(params, "form", %{})
    if socket.assigns.editing_id do
      Repo.query(
        "UPDATE game_regions SET name = ?, icon = ?, description = ?, danger_level = ?, corruption_level = ?, xp_mult = ?, gold_mult = ?, loot_mult = ?, spawn_rate_mult = ?, shop_price_mult = ?, pvp_enabled = ?, is_sanctuary = ?, weather_override = ?, auto_rules_json = ? WHERE id = ?",
        [
          data["name"], data["icon"], data["description"], to_int(data["danger_level"]),
          to_int(data["corruption_level"]), to_float(data["xp_mult"]), to_float(data["gold_mult"]),
          to_float(data["loot_mult"]), to_float(data["spawn_rate_mult"]), to_float(data["shop_price_mult"]),
          to_int(data["pvp_enabled"]), to_int(data["is_sanctuary"]),
          data["weather_override"], data["auto_rules_json"],
          socket.assigns.editing_id
        ]
      )
    else
      Repo.query(
        "INSERT INTO game_regions (name, icon, description, danger_level, corruption_level, xp_mult, gold_mult, loot_mult, spawn_rate_mult, shop_price_mult, pvp_enabled, is_sanctuary, weather_override, auto_rules_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          data["name"], data["icon"], data["description"], to_int(data["danger_level"]),
          to_int(data["corruption_level"]), to_float(data["xp_mult"]), to_float(data["gold_mult"]),
          to_float(data["loot_mult"]), to_float(data["spawn_rate_mult"]), to_float(data["shop_price_mult"]),
          to_int(data["pvp_enabled"]), to_int(data["is_sanctuary"]),
          data["weather_override"], data["auto_rules_json"]
        ]
      )
    end

    {:noreply, assign(socket, editing_id: nil, creating: false, form_data: %{}) |> load_regions_list() |> load_tab()}
  end

  def handle_event("delete_region", %{"id" => id}, socket) do
    Repo.query("DELETE FROM game_regions WHERE id = ?", [to_int(id)])
    {:noreply, socket |> load_regions_list() |> load_tab()}
  end

  # ── Form change (live update form_data) ────────────────────────────

  def handle_event("form_change", %{"form" => form_params}, socket) do
    {:noreply, assign(socket, form_data: Map.merge(socket.assigns.form_data, form_params))}
  end

  def handle_event("cancel_form", _p, socket) do
    {:noreply, assign(socket, editing_id: nil, creating: false, form_data: %{})}
  end

  # ── Worldforge events ─────────────────────────────────────────────

  def handle_event("save_lore", %{"lore" => lore}, socket) do
    Repo.query(
      "INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?",
      ["world_forge_lore_bible", lore, lore]
    )
    {:noreply, assign(socket, lore_bible: lore, lore_saved: true)}
  end

  def handle_event("update_lore", %{"lore" => lore}, socket) do
    {:noreply, assign(socket, lore_bible: lore, lore_saved: false)}
  end

  # ── Data Loading ──────────────────────────────────────────────────

  defp load_maps_list(socket) do
    maps =
      case Repo.query("SELECT id, name FROM game_maps ORDER BY name") do
        {:ok, %{rows: rows}} -> Enum.map(rows, fn [id, name] -> %{id: id, name: name} end)
        _ -> []
      end
    assign(socket, maps_list: maps)
  end

  defp load_regions_list(socket) do
    regions =
      case Repo.query("SELECT id, name FROM game_regions ORDER BY name") do
        {:ok, %{rows: rows}} -> Enum.map(rows, fn [id, name] -> %{id: id, name: name} end)
        _ -> []
      end
    assign(socket, regions_list: regions)
  end

  defp load_shops_list(socket) do
    shops =
      case Repo.query("SELECT id, name FROM game_shops ORDER BY name") do
        {:ok, %{rows: rows}} -> Enum.map(rows, fn [id, name] -> %{id: id, name: name} end)
        _ -> []
      end
    assign(socket, shops_list: shops)
  end

  defp load_tab(%{assigns: %{tab: "maps"}} = socket), do: load_maps(socket)
  defp load_tab(%{assigns: %{tab: "npcs"}} = socket), do: load_npcs(socket)
  defp load_tab(%{assigns: %{tab: "regions"}} = socket), do: load_regions(socket)
  defp load_tab(%{assigns: %{tab: "spawns"}} = socket), do: load_spawns(socket)
  defp load_tab(%{assigns: %{tab: "connections"}} = socket), do: load_connections(socket)
  defp load_tab(%{assigns: %{tab: "versions"}} = socket), do: load_versions(socket)
  defp load_tab(%{assigns: %{tab: "worldforge"}} = socket), do: load_worldforge(socket)
  defp load_tab(socket), do: assign(socket, rows: [], total: 0)

  defp load_maps(socket) do
    search = socket.assigns.search
    offset = (socket.assigns.page - 1) * @per_page
    {where, params} = search_where(search, "name")

    total = count_query("game_maps", where, params)

    rows =
      case Repo.query(
             "SELECT id, name, description, width, height, ambient_dark, min_level, region_id, is_active, render_mode, fog_of_war FROM game_maps#{where} ORDER BY id DESC LIMIT ? OFFSET ?",
             params ++ [to_int(@per_page), offset]
           ) do
        {:ok, %{rows: r, columns: c}} -> to_maps(r, c)
        _ -> []
      end

    assign(socket, rows: rows, total: total)
  end

  defp load_npcs(socket) do
    search = socket.assigns.search
    map_filter = socket.assigns.npc_map_filter
    enemy_filter = socket.assigns.npc_enemy_filter
    offset = (socket.assigns.page - 1) * @per_page

    {clauses, params} = {[], []}

    {clauses, params} =
      if search != "" do
        {clauses ++ ["name LIKE ?"], params ++ ["%#{search}%"]}
      else
        {clauses, params}
      end

    {clauses, params} =
      if map_filter != "" do
        {clauses ++ ["map_id = ?"], params ++ [to_int(map_filter)]}
      else
        {clauses, params}
      end

    {clauses, params} =
      case enemy_filter do
        "enemy" -> {clauses ++ ["is_enemy = 1"], params}
        "friendly" -> {clauses ++ ["is_enemy = 0"], params}
        _ -> {clauses, params}
      end

    where = if clauses == [], do: "", else: " WHERE " <> Enum.join(clauses, " AND ")

    total = count_query("game_npcs", where, params)

    rows =
      case Repo.query(
             "SELECT id, name, icon, map_id, is_enemy, move_type, is_active, persona FROM game_npcs#{where} ORDER BY id DESC LIMIT ? OFFSET ?",
             params ++ [to_int(@per_page), offset]
           ) do
        {:ok, %{rows: r, columns: c}} -> to_maps(r, c)
        _ -> []
      end

    assign(socket, rows: rows, total: total)
  end

  defp load_regions(socket) do
    search = socket.assigns.search
    offset = (socket.assigns.page - 1) * @per_page
    {where, params} = search_where(search, "name")

    total = count_query("game_regions", where, params)

    rows =
      case Repo.query(
             "SELECT r.id, r.name, r.icon, r.description, r.danger_level, r.corruption_level, r.xp_mult, r.gold_mult, r.loot_mult, r.spawn_rate_mult, r.shop_price_mult, r.pvp_enabled, r.is_sanctuary, r.weather_override, (SELECT COUNT(*) FROM game_maps WHERE region_id = r.id) as map_count FROM game_regions r#{where} ORDER BY r.id DESC LIMIT ? OFFSET ?",
             params ++ [to_int(@per_page), offset]
           ) do
        {:ok, %{rows: r, columns: c}} -> to_maps(r, c)
        _ -> []
      end

    assign(socket, rows: rows, total: total)
  end

  defp load_spawns(socket) do
    search = socket.assigns.search
    offset = (socket.assigns.page - 1) * @per_page
    {where, params} = search_where(search, "name")

    base_where = " WHERE is_enemy = 1"
    full_where = if where == "", do: base_where, else: base_where <> " AND " <> String.trim_leading(where, " WHERE ")

    total = count_query("game_npcs", full_where, params)

    rows =
      case Repo.query(
             "SELECT id, name, map_id, level, respawn_seconds, is_active FROM game_npcs#{full_where} ORDER BY id DESC LIMIT ? OFFSET ?",
             params ++ [to_int(@per_page), offset]
           ) do
        {:ok, %{rows: r, columns: c}} -> to_maps(r, c)
        _ -> []
      end

    assign(socket, rows: rows, total: total)
  end

  defp load_connections(socket) do
    connections =
      case Repo.query("SHOW TABLES LIKE 'game_map_connections'") do
        {:ok, %{rows: [_ | _]}} ->
          case Repo.query("""
            SELECT mc.id, gm1.name as source_name, gm2.name as dest_name,
                   mc.source_x, mc.source_y, mc.dest_x, mc.dest_y
            FROM game_map_connections mc
            JOIN game_maps gm1 ON gm1.id = mc.source_map_id
            JOIN game_maps gm2 ON gm2.id = mc.dest_map_id
            ORDER BY gm1.name, gm2.name
            LIMIT 200
          """) do
            {:ok, %{rows: rows, columns: cols}} -> to_maps(rows, cols)
            _ -> []
          end
        _ ->
          parse_teleport_connections()
      end

    total = length(connections)
    assign(socket, rows: connections, total: total, connections: connections)
  end

  defp parse_teleport_connections do
    case Repo.query("SELECT id, name, collisions_json FROM game_maps WHERE is_active = 1 ORDER BY name") do
      {:ok, %{rows: rows}} ->
        Enum.flat_map(rows, fn [_id, name, json] ->
          parse_teleports_from_json(name, json)
        end)
      _ -> []
    end
  end

  defp parse_teleports_from_json(_name, nil), do: []
  defp parse_teleports_from_json(name, json) when is_binary(json) do
    case Jason.decode(json) do
      {:ok, data} when is_list(data) ->
        data
        |> Enum.filter(fn entry ->
          is_map(entry) && (Map.get(entry, "type") == "TELEPORT" || Map.get(entry, "event") == "TELEPORT")
        end)
        |> Enum.map(fn entry ->
          dest_map = Map.get(entry, "dest_map") || Map.get(entry, "target_map") || "?"
          dest_x = Map.get(entry, "dest_x") || Map.get(entry, "target_x") || "?"
          dest_y = Map.get(entry, "dest_y") || Map.get(entry, "target_y") || "?"
          %{"source_name" => name, "dest_name" => to_string(dest_map),
            "dest_x" => dest_x, "dest_y" => dest_y,
            "source_x" => Map.get(entry, "x", "?"), "source_y" => Map.get(entry, "y", "?")}
        end)
      _ -> []
    end
  end
  defp parse_teleports_from_json(_name, _), do: []

  defp load_versions(socket) do
    versions =
      case Repo.query("SHOW TABLES LIKE 'game_map_versions'") do
        {:ok, %{rows: [_ | _]}} ->
          case Repo.query("""
            SELECT v.id, gm.name as map_name, v.version_num, v.created_by AS changed_by, v.created_at
            FROM game_map_versions v
            LEFT JOIN game_maps gm ON gm.id = v.map_id
            ORDER BY v.created_at DESC
            LIMIT 50
          """) do
            {:ok, %{rows: rows, columns: cols}} -> to_maps(rows, cols)
            _ -> []
          end
        _ -> :no_table
      end

    total = if is_list(versions), do: length(versions), else: 0
    assign(socket, rows: if(is_list(versions), do: versions, else: []), total: total, versions: versions)
  end

  defp load_worldforge(socket) do
    lore =
      case Repo.query("SELECT setting_value FROM system_settings WHERE setting_key = ?", ["world_forge_lore_bible"]) do
        {:ok, %{rows: [[val]]}} -> val || ""
        _ -> ""
      end

    provider =
      case Repo.query("SELECT setting_value FROM system_settings WHERE setting_key = ?", ["ai_provider"]) do
        {:ok, %{rows: [[val]]}} -> val || "Not configured"
        _ -> "Not configured"
      end

    model =
      case Repo.query("SELECT setting_value FROM system_settings WHERE setting_key = ?", ["ai_model"]) do
        {:ok, %{rows: [[val]]}} -> val || "Not configured"
        _ -> "Not configured"
      end

    assign(socket, rows: [], total: 0, lore_bible: lore, ai_provider: provider, ai_model: model, lore_saved: false)
  end

  # ── Render ────────────────────────────────────────────────────────

  @impl true
  def render(assigns) do
    max_page = max(1, ceil(assigns.total / @per_page))
    assigns =
      assigns
      |> Map.put(:max_page, max_page)
      |> Map.put(:weather_options, @weather_options)
      |> Map.put(:move_types, @move_types)
      |> Map.put(:render_modes, @render_modes)

    ~H"""
    <div>
      <h2 class="text-2xl font-bold text-amber-400 mb-6">World Hub</h2>

      <%!-- Tab Bar --%>
      <div class="flex gap-1 mb-6 border-b border-zinc-800 pb-3">
        <button :for={t <- @tabs} phx-click="change_tab" phx-value-tab={t}
          class={["px-3 py-1.5 rounded-t text-sm font-medium transition-colors",
            @tab == t && "bg-amber-600 text-white",
            @tab != t && "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"]}>
          {tab_label(t)}
        </button>
      </div>

      <%!-- Search + Controls --%>
      <div :if={@tab not in ~w(worldforge)} class="flex items-center gap-3 mb-4 flex-wrap">
        <form phx-change="search" class="flex-1 max-w-xs">
          <input type="text" name="search" value={@search} placeholder="Search by name..."
            phx-debounce="300"
            class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
        </form>

        <%= if @tab == "npcs" do %>
          <form phx-change="filter_map">
            <select name="map_id"
              class="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
              <option value="">All Maps</option>
              <option :for={m <- @maps_list} value={m.id} selected={to_string(m.id) == @npc_map_filter}>{m.name}</option>
            </select>
          </form>
          <form phx-change="toggle_enemy_filter">
            <select name="enemy"
              class="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
              <option value="" selected={@npc_enemy_filter == ""}>All NPCs</option>
              <option value="enemy" selected={@npc_enemy_filter == "enemy"}>Enemies Only</option>
              <option value="friendly" selected={@npc_enemy_filter == "friendly"}>Friendly Only</option>
            </select>
          </form>
        <% end %>

        <%!-- Create buttons for CRUD tabs --%>
        <%= if @tab == "maps" do %>
          <button phx-click="create_map" class="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium rounded transition-colors">+ Create Map</button>
        <% end %>
        <%= if @tab == "npcs" do %>
          <button phx-click="create_npc" class="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium rounded transition-colors">+ Create NPC</button>
        <% end %>
        <%= if @tab == "regions" do %>
          <button phx-click="create_region" class="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium rounded transition-colors">+ Create Region</button>
        <% end %>

        <span class="text-xs text-zinc-600">{@total} records</span>

        <div class="ml-auto flex items-center gap-2">
          <button phx-click="prev_page" disabled={@page <= 1}
            class="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs hover:bg-zinc-700 disabled:opacity-30">Prev</button>
          <span class="text-xs text-zinc-500">{@page} / {@max_page}</span>
          <button phx-click="next_page" disabled={@page >= @max_page}
            class="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs hover:bg-zinc-700 disabled:opacity-30">Next</button>
        </div>
      </div>

      <%!-- Tab Content --%>
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
        <%= case @tab do %>
          <% "maps" -> %>
            <%!-- Map Create/Edit Form --%>
            <div :if={@creating || @editing_id} class="bg-zinc-900 border-b border-amber-800/30 p-5">
              <h3 class="text-sm font-bold uppercase tracking-wider text-amber-400 mb-4">
                {if @editing_id, do: "Edit Map", else: "Create New Map"}
              </h3>
              <form phx-submit="save_map" phx-change="form_change" class="space-y-3">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div class="col-span-2">
                    <label class="block text-xs text-zinc-500 mb-1">Name</label>
                    <input type="text" name="form[name]" value={@form_data["name"]} required
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Width</label>
                    <input type="number" name="form[width]" value={@form_data["width"]} min="1" max="200"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Height</label>
                    <input type="number" name="form[height]" value={@form_data["height"]} min="1" max="200"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label class="block text-xs text-zinc-500 mb-1">Description</label>
                  <textarea name="form[description]" rows="2"
                    class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none resize-y">{@form_data["description"]}</textarea>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Ambient Dark (0-1)</label>
                    <input type="range" name="form[ambient_dark]" value={@form_data["ambient_dark"]} min="0" max="1" step="0.05"
                      class="w-full" />
                    <span class="text-xs text-zinc-500">{@form_data["ambient_dark"]}</span>
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Min Level</label>
                    <input type="number" name="form[min_level]" value={@form_data["min_level"]} min="0"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Region</label>
                    <select name="form[region_id]"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
                      <option value="">None</option>
                      <option :for={r <- @regions_list} value={r.id} selected={to_string(r.id) == to_string(@form_data["region_id"])}>{r.name}</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Render Mode</label>
                    <select name="form[render_mode]"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
                      <option :for={rm <- @render_modes} value={rm} selected={rm == @form_data["render_mode"]}>{rm}</option>
                    </select>
                  </div>
                </div>
                <div class="flex items-center gap-6">
                  <label class="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                    <input type="hidden" name="form[is_active]" value="0" />
                    <input type="checkbox" name="form[is_active]" value="1" checked={to_string(@form_data["is_active"]) == "1"}
                      class="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500" />
                    Active
                  </label>
                  <label class="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                    <input type="hidden" name="form[fog_of_war]" value="0" />
                    <input type="checkbox" name="form[fog_of_war]" value="1" checked={to_string(@form_data["fog_of_war"]) == "1"}
                      class="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500" />
                    Fog of War
                  </label>
                </div>
                <div class="flex gap-2 pt-2">
                  <button type="submit" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded transition-colors">
                    {if @editing_id, do: "Update Map", else: "Create Map"}
                  </button>
                  <button type="button" phx-click="cancel_form" class="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded transition-colors">Cancel</button>
                </div>
              </form>
            </div>

            <table class="w-full">
              <thead>
                <tr class="border-b border-zinc-800 text-left">
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">ID</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Name</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Size</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Dark</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Min Lvl</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Region</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Mode</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">FoW</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Active</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr :for={row <- @rows} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td class="px-3 py-2 text-sm text-zinc-500">{row["id"]}</td>
                  <td class="px-3 py-2 text-sm text-zinc-200 font-medium">{row["name"]}</td>
                  <td class="px-3 py-2 text-sm text-zinc-400">{row["width"]}x{row["height"]}</td>
                  <td class="px-3 py-2 text-sm text-zinc-400">{row["ambient_dark"]}</td>
                  <td class="px-3 py-2 text-sm text-zinc-400">{row["min_level"]}</td>
                  <td class="px-3 py-2 text-sm text-zinc-400">{region_name(row["region_id"], @regions_list)}</td>
                  <td class="px-3 py-2 text-sm text-zinc-500">{row["render_mode"]}</td>
                  <td class="px-3 py-2 text-sm">{yes_no_badge(row["fog_of_war"])}</td>
                  <td class="px-3 py-2 text-sm">{active_badge(row["is_active"])}</td>
                  <td class="px-3 py-2 text-sm">
                    <div class="flex gap-1">
                      <button phx-click="edit_map" phx-value-id={row["id"]} class="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-xs transition-colors">Edit</button>
                      <button phx-click="delete_map" phx-value-id={row["id"]} data-confirm="Delete this map? This cannot be undone." class="px-2 py-1 bg-red-900/50 hover:bg-red-800 text-red-300 rounded text-xs transition-colors">Del</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

          <% "npcs" -> %>
            <%!-- NPC Create/Edit Form --%>
            <div :if={@creating || @editing_id} class="bg-zinc-900 border-b border-amber-800/30 p-5">
              <h3 class="text-sm font-bold uppercase tracking-wider text-amber-400 mb-4">
                {if @editing_id, do: "Edit NPC", else: "Create New NPC"}
              </h3>
              <form phx-submit="save_npc" phx-change="form_change" class="space-y-3">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div class="col-span-2">
                    <label class="block text-xs text-zinc-500 mb-1">Name</label>
                    <input type="text" name="form[name]" value={@form_data["name"]} required
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Icon</label>
                    <input type="text" name="form[icon]" value={@form_data["icon"]}
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Map</label>
                    <select name="form[map_id]"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
                      <option value="">None</option>
                      <option :for={m <- @maps_list} value={m.id} selected={to_string(m.id) == to_string(@form_data["map_id"])}>{m.name}</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label class="block text-xs text-zinc-500 mb-1">Persona</label>
                  <textarea name="form[persona]" rows="3"
                    class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none resize-y">{@form_data["persona"]}</textarea>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">X</label>
                    <input type="number" name="form[x]" value={@form_data["x"]} min="0"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Y</label>
                    <input type="number" name="form[y]" value={@form_data["y"]} min="0"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Move Type</label>
                    <select name="form[move_type]"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
                      <option :for={mt <- @move_types} value={mt} selected={mt == @form_data["move_type"]}>{mt}</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Wander Radius</label>
                    <input type="number" name="form[wander_radius]" value={@form_data["wander_radius"]} min="0"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Shop</label>
                    <select name="form[shop_id]"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
                      <option value="">None</option>
                      <option :for={s <- @shops_list} value={s.id} selected={to_string(s.id) == to_string(@form_data["shop_id"])}>{s.name}</option>
                    </select>
                  </div>
                  <div class="flex items-end pb-2">
                    <label class="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                      <input type="hidden" name="form[is_enemy]" value="0" />
                      <input type="checkbox" name="form[is_enemy]" value="1" checked={to_string(@form_data["is_enemy"]) == "1"}
                        class="rounded border-zinc-600 bg-zinc-800 text-red-500 focus:ring-red-500" />
                      Enemy
                    </label>
                  </div>
                </div>

                <%!-- Combat stats section (shown when is_enemy checked) --%>
                <div :if={to_string(@form_data["is_enemy"]) == "1"} class="bg-zinc-950 border border-red-900/30 rounded-lg p-4 space-y-3">
                  <h4 class="text-xs font-bold uppercase tracking-wider text-red-400">Combat Stats</h4>
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label class="block text-xs text-zinc-500 mb-1">Base HP</label>
                      <input type="number" name="form[base_hp]" value={@form_data["base_hp"]} min="1"
                        class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-red-500 focus:outline-none" />
                    </div>
                    <div>
                      <label class="block text-xs text-zinc-500 mb-1">Base MP</label>
                      <input type="number" name="form[base_mp]" value={@form_data["base_mp"]} min="0"
                        class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-red-500 focus:outline-none" />
                    </div>
                    <div>
                      <label class="block text-xs text-zinc-500 mb-1">Base ATK</label>
                      <input type="number" name="form[base_atk]" value={@form_data["base_atk"]} min="0"
                        class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-red-500 focus:outline-none" />
                    </div>
                    <div>
                      <label class="block text-xs text-zinc-500 mb-1">Base DEF</label>
                      <input type="number" name="form[base_def]" value={@form_data["base_def"]} min="0"
                        class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-red-500 focus:outline-none" />
                    </div>
                    <div>
                      <label class="block text-xs text-zinc-500 mb-1">Base MO</label>
                      <input type="number" name="form[base_mo]" value={@form_data["base_mo"]} min="0"
                        class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-red-500 focus:outline-none" />
                    </div>
                    <div>
                      <label class="block text-xs text-zinc-500 mb-1">Base MD</label>
                      <input type="number" name="form[base_md]" value={@form_data["base_md"]} min="0"
                        class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-red-500 focus:outline-none" />
                    </div>
                    <div>
                      <label class="block text-xs text-zinc-500 mb-1">Base Speed</label>
                      <input type="number" name="form[base_speed]" value={@form_data["base_speed"]} min="0"
                        class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-red-500 focus:outline-none" />
                    </div>
                    <div>
                      <label class="block text-xs text-zinc-500 mb-1">Base Luck</label>
                      <input type="number" name="form[base_luck]" value={@form_data["base_luck"]} min="0"
                        class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-red-500 focus:outline-none" />
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs text-zinc-500 mb-1">Element</label>
                      <input type="text" name="form[element]" value={@form_data["element"]} placeholder="FIRE, ICE, etc."
                        class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-red-500 focus:outline-none" />
                    </div>
                    <div>
                      <label class="block text-xs text-zinc-500 mb-1">Drop Table JSON</label>
                      <input type="text" name="form[drop_table_json]" value={@form_data["drop_table_json"]} placeholder="[]"
                        class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 font-mono focus:border-red-500 focus:outline-none" />
                    </div>
                  </div>
                </div>

                <div class="flex gap-2 pt-2">
                  <button type="submit" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded transition-colors">
                    {if @editing_id, do: "Update NPC", else: "Create NPC"}
                  </button>
                  <button type="button" phx-click="cancel_form" class="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded transition-colors">Cancel</button>
                </div>
              </form>
            </div>

            <table class="w-full">
              <thead>
                <tr class="border-b border-zinc-800 text-left">
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">ID</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Name</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Map</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Enemy</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Move</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Active</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Persona</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr :for={row <- @rows} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td class="px-3 py-2 text-sm text-zinc-500">{row["id"]}</td>
                  <td class="px-3 py-2 text-sm text-zinc-200 font-medium">
                    <span :if={row["icon"]} class="mr-1">{row["icon"]}</span>
                    {row["name"]}
                  </td>
                  <td class="px-3 py-2 text-sm text-zinc-400">{map_name(row["map_id"], @maps_list)}</td>
                  <td class="px-3 py-2 text-sm">{yes_no_badge(row["is_enemy"])}</td>
                  <td class="px-3 py-2 text-sm text-zinc-400">{row["move_type"]}</td>
                  <td class="px-3 py-2 text-sm">{active_badge(row["is_active"])}</td>
                  <td class="px-3 py-2 text-sm text-zinc-500 max-w-[200px] truncate">{truncate(row["persona"], 50)}</td>
                  <td class="px-3 py-2 text-sm">
                    <div class="flex gap-1">
                      <button phx-click="edit_npc" phx-value-id={row["id"]} class="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-xs transition-colors">Edit</button>
                      <button phx-click="delete_npc" phx-value-id={row["id"]} data-confirm="Delete this NPC? This cannot be undone." class="px-2 py-1 bg-red-900/50 hover:bg-red-800 text-red-300 rounded text-xs transition-colors">Del</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

          <% "regions" -> %>
            <%!-- Region Create/Edit Form --%>
            <div :if={@creating || @editing_id} class="bg-zinc-900 border-b border-amber-800/30 p-5">
              <h3 class="text-sm font-bold uppercase tracking-wider text-amber-400 mb-4">
                {if @editing_id, do: "Edit Region", else: "Create New Region"}
              </h3>
              <form phx-submit="save_region" phx-change="form_change" class="space-y-3">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div class="col-span-2">
                    <label class="block text-xs text-zinc-500 mb-1">Name</label>
                    <input type="text" name="form[name]" value={@form_data["name"]} required
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Icon</label>
                    <input type="text" name="form[icon]" value={@form_data["icon"]}
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Danger Level (1-5)</label>
                    <select name="form[danger_level]"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
                      <option value="1" selected={to_string(@form_data["danger_level"]) == "1"} class="text-emerald-400">1 - Safe</option>
                      <option value="2" selected={to_string(@form_data["danger_level"]) == "2"} class="text-yellow-400">2 - Caution</option>
                      <option value="3" selected={to_string(@form_data["danger_level"]) == "3"} class="text-orange-400">3 - Dangerous</option>
                      <option value="4" selected={to_string(@form_data["danger_level"]) == "4"} class="text-red-400">4 - Deadly</option>
                      <option value="5" selected={to_string(@form_data["danger_level"]) == "5"} class="text-red-700">5 - Apocalyptic</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label class="block text-xs text-zinc-500 mb-1">Description</label>
                  <textarea name="form[description]" rows="2"
                    class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none resize-y">{@form_data["description"]}</textarea>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Corruption Level</label>
                    <input type="number" name="form[corruption_level]" value={@form_data["corruption_level"]} min="0"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">XP Mult</label>
                    <input type="number" name="form[xp_mult]" value={@form_data["xp_mult"]} min="0" step="0.1"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Gold Mult</label>
                    <input type="number" name="form[gold_mult]" value={@form_data["gold_mult"]} min="0" step="0.1"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Loot Mult</label>
                    <input type="number" name="form[loot_mult]" value={@form_data["loot_mult"]} min="0" step="0.1"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Spawn Rate Mult</label>
                    <input type="number" name="form[spawn_rate_mult]" value={@form_data["spawn_rate_mult"]} min="0" step="0.1"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                  </div>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Shop Price Mult</label>
                    <input type="number" name="form[shop_price_mult]" value={@form_data["shop_price_mult"]} min="0" step="0.1"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
                  </div>
                  <div>
                    <label class="block text-xs text-zinc-500 mb-1">Weather Override</label>
                    <select name="form[weather_override]"
                      class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
                      <option :for={w <- @weather_options} value={w} selected={w == to_string(@form_data["weather_override"])}>{w}</option>
                    </select>
                  </div>
                  <div class="flex items-end pb-2 gap-4">
                    <label class="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                      <input type="hidden" name="form[pvp_enabled]" value="0" />
                      <input type="checkbox" name="form[pvp_enabled]" value="1" checked={to_string(@form_data["pvp_enabled"]) == "1"}
                        class="rounded border-zinc-600 bg-zinc-800 text-red-500 focus:ring-red-500" />
                      PvP
                    </label>
                    <label class="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                      <input type="hidden" name="form[is_sanctuary]" value="0" />
                      <input type="checkbox" name="form[is_sanctuary]" value="1" checked={to_string(@form_data["is_sanctuary"]) == "1"}
                        class="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500" />
                      Sanctuary
                    </label>
                  </div>
                </div>
                <div>
                  <label class="block text-xs text-zinc-500 mb-1">Auto Rules JSON</label>
                  <textarea name="form[auto_rules_json]" rows="3"
                    class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 font-mono focus:border-amber-500 focus:outline-none resize-y">{@form_data["auto_rules_json"]}</textarea>
                </div>
                <div class="flex gap-2 pt-2">
                  <button type="submit" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded transition-colors">
                    {if @editing_id, do: "Update Region", else: "Create Region"}
                  </button>
                  <button type="button" phx-click="cancel_form" class="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded transition-colors">Cancel</button>
                </div>
              </form>
            </div>

            <table class="w-full">
              <thead>
                <tr class="border-b border-zinc-800 text-left">
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">ID</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Name</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Danger</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">XP</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Gold</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Loot</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">PvP</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Sanctuary</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Maps</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr :for={row <- @rows} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td class="px-3 py-2 text-sm text-zinc-500">{row["id"]}</td>
                  <td class="px-3 py-2 text-sm text-zinc-200 font-medium">
                    <span :if={row["icon"]} class="mr-1">{row["icon"]}</span>
                    {row["name"]}
                  </td>
                  <td class="px-3 py-2 text-sm">
                    <span class={danger_color(row["danger_level"])}>{row["danger_level"]}</span>
                  </td>
                  <td class="px-3 py-2 text-sm text-zinc-400">{row["xp_mult"]}x</td>
                  <td class="px-3 py-2 text-sm text-zinc-400">{row["gold_mult"]}x</td>
                  <td class="px-3 py-2 text-sm text-zinc-400">{row["loot_mult"]}x</td>
                  <td class="px-3 py-2 text-sm">{yes_no_badge(row["pvp_enabled"])}</td>
                  <td class="px-3 py-2 text-sm">{yes_no_badge(row["is_sanctuary"])}</td>
                  <td class="px-3 py-2 text-sm text-zinc-400">{row["map_count"]}</td>
                  <td class="px-3 py-2 text-sm">
                    <div class="flex gap-1">
                      <button phx-click="edit_region" phx-value-id={row["id"]} class="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-xs transition-colors">Edit</button>
                      <button phx-click="delete_region" phx-value-id={row["id"]} data-confirm="Delete this region? This cannot be undone." class="px-2 py-1 bg-red-900/50 hover:bg-red-800 text-red-300 rounded text-xs transition-colors">Del</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

          <% "spawns" -> %>
            <table class="w-full">
              <thead>
                <tr class="border-b border-zinc-800 text-left">
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">ID</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Name</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Map</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Level</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Respawn (s)</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Active</th>
                </tr>
              </thead>
              <tbody>
                <tr :for={row <- @rows} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td class="px-3 py-2 text-sm text-zinc-500">{row["id"]}</td>
                  <td class="px-3 py-2 text-sm text-zinc-200 font-medium">{row["name"]}</td>
                  <td class="px-3 py-2 text-sm text-zinc-400">{row["map_id"]}</td>
                  <td class="px-3 py-2 text-sm text-zinc-400">{row["level"]}</td>
                  <td class="px-3 py-2 text-sm text-zinc-400">{row["respawn_seconds"]}</td>
                  <td class="px-3 py-2 text-sm">{active_badge(row["is_active"])}</td>
                </tr>
              </tbody>
            </table>

          <% "connections" -> %>
            <table class="w-full">
              <thead>
                <tr class="border-b border-zinc-800 text-left">
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Source Map</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Source (X,Y)</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500"></th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Dest Map</th>
                  <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Dest (X,Y)</th>
                </tr>
              </thead>
              <tbody>
                <tr :for={row <- @rows} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td class="px-3 py-2 text-sm text-zinc-200 font-medium">{row["source_name"]}</td>
                  <td class="px-3 py-2 text-sm text-zinc-400">{row["source_x"]}, {row["source_y"]}</td>
                  <td class="px-3 py-2 text-sm text-amber-500 font-bold">&rarr;</td>
                  <td class="px-3 py-2 text-sm text-zinc-200 font-medium">{row["dest_name"]}</td>
                  <td class="px-3 py-2 text-sm text-zinc-400">{row["dest_x"]}, {row["dest_y"]}</td>
                </tr>
              </tbody>
            </table>

          <% "versions" -> %>
            <%= if @versions == :no_table do %>
              <div class="p-8 text-center">
                <p class="text-zinc-500 text-sm">Map versioning not configured</p>
                <p class="text-zinc-600 text-xs mt-1">Versions are tracked when maps are edited in World Forge</p>
              </div>
            <% else %>
              <table class="w-full">
                <thead>
                  <tr class="border-b border-zinc-800 text-left">
                    <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">ID</th>
                    <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Map</th>
                    <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Version</th>
                    <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Changed By</th>
                    <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr :for={row <- @rows} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td class="px-3 py-2 text-sm text-zinc-500">{row["id"]}</td>
                    <td class="px-3 py-2 text-sm text-zinc-200 font-medium">{row["map_name"]}</td>
                    <td class="px-3 py-2 text-sm text-zinc-400">{row["version_num"]}</td>
                    <td class="px-3 py-2 text-sm text-zinc-400">{row["changed_by"]}</td>
                    <td class="px-3 py-2 text-sm text-zinc-500">{row["created_at"]}</td>
                  </tr>
                </tbody>
              </table>
            <% end %>

          <% "worldforge" -> %>
            <div class="p-6 space-y-6">
              <%!-- AI Status --%>
              <div class="flex gap-6 flex-wrap">
                <div class="bg-zinc-800 rounded-lg px-4 py-3 flex-1 min-w-[200px]">
                  <p class="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">AI Provider</p>
                  <p class="text-sm text-zinc-200">{@ai_provider}</p>
                </div>
                <div class="bg-zinc-800 rounded-lg px-4 py-3 flex-1 min-w-[200px]">
                  <p class="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">AI Model</p>
                  <p class="text-sm text-zinc-200">{@ai_model}</p>
                </div>
                <div class="bg-zinc-800 rounded-lg px-4 py-3 flex-1 min-w-[200px]">
                  <p class="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Lore Bible Length</p>
                  <p class="text-sm text-zinc-200">{String.length(@lore_bible)} characters</p>
                </div>
              </div>

              <%!-- Lore Bible Editor --%>
              <div>
                <div class="flex items-center justify-between mb-2">
                  <h3 class="text-lg font-semibold text-amber-400">Lore Bible</h3>
                  <span :if={@lore_saved} class="text-xs text-emerald-400 font-medium">Saved!</span>
                </div>
                <form phx-submit="save_lore" phx-change="update_lore">
                  <textarea name="lore" rows="16"
                    class="w-full px-4 py-3 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-zinc-200 font-mono leading-relaxed focus:border-amber-500 focus:outline-none resize-y"
                    placeholder="Enter your world's lore bible here. This text is used by AI systems for world-consistent generation...">{@lore_bible}</textarea>
                  <div class="flex items-center justify-between mt-3">
                    <span class="text-xs text-zinc-600">{String.length(@lore_bible)} characters</span>
                    <button type="submit"
                      class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded transition-colors">
                      Save Lore Bible
                    </button>
                  </div>
                </form>
              </div>
            </div>

          <% _ -> %>
            <div class="p-8 text-center text-zinc-600 text-sm">Unknown tab</div>
        <% end %>

        <div :if={@rows == [] and @tab not in ~w(worldforge versions)} class="p-8 text-center text-zinc-600 text-sm">No records found</div>
      </div>
    </div>
    """
  end

  # ── Helpers ───────────────────────────────────────────────────────

  defp search_where("", _col), do: {"", []}
  defp search_where(q, col), do: {" WHERE #{col} LIKE ?", ["%#{q}%"]}

  defp count_query(table, where, params) do
    case Repo.query("SELECT COUNT(*) FROM #{table}#{where}", params) do
      {:ok, %{rows: [[c]]}} -> c
      _ -> 0
    end
  end

  defp to_maps(rows, columns) do
    Enum.map(rows, fn row -> Enum.zip(columns, row) |> Map.new() end)
  end

  defp truncate(nil, _len), do: ""
  defp truncate(val, len) when is_binary(val) do
    if String.length(val) > len, do: String.slice(val, 0, len) <> "...", else: val
  end
  defp truncate(val, _len), do: to_string(val)

  defp active_badge(1), do: Phoenix.HTML.raw(~s(<span class="text-emerald-400 text-xs font-medium">Yes</span>))
  defp active_badge(_), do: Phoenix.HTML.raw(~s(<span class="text-zinc-600 text-xs">No</span>))

  defp yes_no_badge(1), do: Phoenix.HTML.raw(~s(<span class="text-amber-400 text-xs font-medium">Yes</span>))
  defp yes_no_badge(_), do: Phoenix.HTML.raw(~s(<span class="text-zinc-600 text-xs">No</span>))

  defp danger_color(1), do: "text-emerald-400 font-medium"
  defp danger_color(2), do: "text-yellow-400 font-medium"
  defp danger_color(3), do: "text-orange-400 font-medium"
  defp danger_color(4), do: "text-red-400 font-bold"
  defp danger_color(5), do: "text-red-700 font-bold"
  defp danger_color(_), do: "text-zinc-400"

  defp region_name(nil, _list), do: "-"
  defp region_name(id, list) do
    case Enum.find(list, fn r -> r.id == id end) do
      %{name: name} -> name
      _ -> to_string(id)
    end
  end

  defp map_name(nil, _list), do: "-"
  defp map_name(id, list) do
    case Enum.find(list, fn m -> m.id == id end) do
      %{name: name} -> name
      _ -> to_string(id)
    end
  end

  defp tab_label("worldforge"), do: "World Forge"
  defp tab_label(t), do: String.capitalize(t)

  defp to_int(val) when is_integer(val), do: val
  defp to_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp to_int(_), do: 0

  defp to_float(val) when is_float(val), do: val
  defp to_float(val) when is_integer(val), do: val / 1
  defp to_float(val) when is_binary(val) do
    case Float.parse(val) do
      {n, _} -> n
      :error -> 0.0
    end
  end
  defp to_float(_), do: 0.0

  defp null_or_int(""), do: nil
  defp null_or_int(nil), do: nil
  defp null_or_int(val), do: to_int(val)

  defp stringify_vals(map) do
    Map.new(map, fn {k, v} ->
      {k, if(is_nil(v), do: "", else: to_string(v))}
    end)
  end
end
