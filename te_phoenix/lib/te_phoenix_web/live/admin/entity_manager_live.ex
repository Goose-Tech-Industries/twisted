defmodule TePhoenixWeb.Admin.EntityManagerLive do
  @moduledoc """
  Generic CRUD manager for any game table. Dynamic column detection,
  create/edit/delete forms, search, pagination. This single component
  gives admin access to every entity type in the engine.
  """
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo

  # Every table in the database is available for admin editing.
  # Grouped by domain for the table picker dropdown.
  @table_groups %{
    "Core" => ~w(game_items game_skills game_classes game_races game_backgrounds game_feats game_elements game_statuses game_settings system_settings),
    "World" => ~w(game_maps game_npcs game_regions game_shops game_shop_supplies game_map_spawns game_spawn_waves game_arenas game_inns game_tile_types game_tile_animations game_worlds game_world_events game_cutscenes game_map_hazards game_map_sound_zones game_region_weather game_region_rep_gates game_travel_routes game_weather_effects game_structure_templates game_deployed_structures),
    "Combat" => ~w(game_battle_templates game_battle_commands game_battle_conditions game_battle_items game_battle_terrain game_battle_rules game_battle_traps game_defense_formulas game_formation_shapes game_terrain_interactions game_siege_structures game_win_conditions game_boss_phases game_link_attacks game_weapon_triangle game_bleed_tiers game_death_penalties game_limb_zones game_body_types game_battle_knockouts game_enemy_scaling),
    "Abilities" => ~w(game_techniques game_technique_abilities game_technique_learn_rules game_signature_abilities game_premade_sig_techs game_limit_breaks game_ki_moves game_combo_chains game_combo_arts game_finishing_moves game_fusions game_fusion_types game_summons game_transformations game_passive_abilities game_fighting_styles game_fighting_style_ranks),
    "Magic" => ~w(game_oghams game_ogham_families game_ogham_awakenings game_ogham_shards game_shard_recipes game_ogham_fusions game_ogham_corruption_tiers game_spell_tomes game_elemental_affinities game_elemental_reactions game_item_curses game_enchantments game_magic_schools game_rituals game_magic_resistances game_spell_slot_table),
    "Content" => ~w(game_quests game_quest_board game_quest_battle_overrides game_loot_tables game_achievements game_craft_recipes game_capsule_items game_flavor_texts game_flavor_keywords game_discovery_themes game_scripts codex_entries),
    "Gameplay" => ~w(game_gathering_skills game_gathering_nodes game_capture_items game_season_effects game_bounty_boards game_bounty_tasks game_treasure_trails game_mounts game_housing_plots game_furniture game_cards game_card_rules game_dice_tables game_fishing_spots game_puzzles game_minigames),
    "Social" => ~w(game_roles game_titles game_themes game_tournaments game_arena_seasons game_scheduled_tasks game_scheduled_events game_world_events guilds game_dm_campaigns),
    "Artifacts" => ~w(legendary_artifacts artifact_powers artifact_hunts artifact_shrines game_relic_sets game_relic_radars),
    "Stats" => ~w(game_stat_definitions game_stat_caps game_ability_scores game_ability_effects game_race_ability_bonuses game_class_ability_bonuses game_background_ability_bonuses game_subclasses game_class_mastery game_class_skills game_race_class_access game_racial_abilities level_requirements game_equip_slots),
    "Config" => ~w(game_campaign_rulesets game_action_windows game_ruleset_modifiers game_config_profiles game_training_config game_scouter_tiers game_sensing_rules game_terminology game_templates progression_config),
    "NPCs" => ~w(game_npc_patrols game_npc_schedules game_npc_relationships game_npc_techniques game_companion_quests npc_factions npc_memories npc_rumors),
    "Admin" => ~w(game_auto_mod_rules staff_permissions staff_broadcast_templates game_webhooks admin_role_sections gm_notes),
  }

  @allowed_tables @table_groups |> Map.values() |> List.flatten()

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket,
      active_tab: :entities,
      table: "game_items",
      page: 1,
      limit: 50,
      total: 0,
      rows: [],
      columns: [],
      column_types: %{},
      search: "",
      table_groups: @table_groups,
      # CRUD state
      editing: nil,        # nil | %{row data}
      creating: false,
      form_data: %{},
      form_errors: []
    ) |> load_entities()}
  end

  @impl true
  def handle_params(params, _uri, socket) do
    table = params["table"] || socket.assigns.table
    page = to_int(params["page"], 1)
    {:noreply, assign(socket, table: table, page: page, editing: nil, creating: false) |> load_entities()}
  end

  # ── Data Loading ─────────────────────────────────────────────────
  defp load_entities(socket) do
    table = socket.assigns.table
    if table not in @allowed_tables do
      assign(socket, rows: [], columns: [], column_types: %{}, total: 0)
    else
      page = socket.assigns.page
      limit = socket.assigns.limit
      offset = (page - 1) * limit
      search = String.trim(socket.assigns.search || "")

      # Get column metadata
      column_types = case Repo.query("SHOW COLUMNS FROM #{table}") do
        {:ok, %{rows: rows}} ->
          for [field, type, _null, _key, default, _extra] <- rows, into: %{} do
            {field, %{type: type, default: default}}
          end
        _ -> %{}
      end

      columns = Map.keys(column_types) |> Enum.sort_by(fn c -> if c == "id", do: "0", else: c end)

      # Count with search
      {count_sql, count_params} = if search != "" do
        where = columns
          |> Enum.map(fn c -> "CAST(`#{c}` AS CHAR) LIKE ?" end)
          |> Enum.join(" OR ")
        {"SELECT COUNT(*) FROM #{table} WHERE #{where}", List.duplicate("%#{search}%", length(columns))}
      else
        {"SELECT COUNT(*) FROM #{table}", []}
      end

      total = case Repo.query(count_sql, count_params) do
        {:ok, %{rows: [[c]]}} -> c
        _ -> 0
      end

      # Fetch rows with search
      {select_sql, select_params} = if search != "" do
        where = columns
          |> Enum.map(fn c -> "CAST(`#{c}` AS CHAR) LIKE ?" end)
          |> Enum.join(" OR ")
        {"SELECT * FROM #{table} WHERE #{where} ORDER BY id DESC LIMIT ? OFFSET ?",
         List.duplicate("%#{search}%", length(columns)) ++ [limit, offset]}
      else
        {"SELECT * FROM #{table} ORDER BY id DESC LIMIT ? OFFSET ?", [limit, offset]}
      end

      {rows, _cols} = case Repo.query(select_sql, select_params) do
        {:ok, %{rows: r, columns: c}} -> {r, c}
        _ -> {[], []}
      end

      row_maps = Enum.map(rows, fn row -> Enum.zip(columns, row) |> Map.new() end)

      assign(socket, rows: row_maps, columns: columns, column_types: column_types, total: total)
    end
  end

  # ── Events ────────────────────────────────────────────────────────
  @impl true
  def handle_event("change_table", %{"table" => table}, socket) do
    {:noreply, push_patch(socket, to: ~p"/sauce/entities?table=#{table}")}
  end

  def handle_event("search", %{"search" => term}, socket) do
    {:noreply, assign(socket, search: term, page: 1) |> load_entities()}
  end

  def handle_event("prev_page", _p, socket) do
    page = max(1, socket.assigns.page - 1)
    {:noreply, push_patch(socket, to: ~p"/sauce/entities?table=#{socket.assigns.table}&page=#{page}")}
  end

  def handle_event("next_page", _p, socket) do
    max_page = max(1, ceil(socket.assigns.total / socket.assigns.limit))
    page = min(max_page, socket.assigns.page + 1)
    {:noreply, push_patch(socket, to: ~p"/sauce/entities?table=#{socket.assigns.table}&page=#{page}")}
  end

  # ── Create ─────────────────────────────────────────────────────
  def handle_event("new", _p, socket) do
    # Pre-fill form with column defaults
    defaults = for {col, meta} <- socket.assigns.column_types, col != "id", into: %{} do
      {col, meta.default || ""}
    end
    {:noreply, assign(socket, creating: true, editing: nil, form_data: defaults, form_errors: [])}
  end

  def handle_event("save_new", params, socket) do
    table = socket.assigns.table
    form = params["entity"] || %{}
    columns = socket.assigns.columns -- ["id"]

    # Build INSERT
    cols = columns |> Enum.filter(fn c -> form[c] != nil and form[c] != "" end)
    if cols == [] do
      {:noreply, assign(socket, form_errors: ["At least one field is required"])}
    else
      placeholders = Enum.map(cols, fn _ -> "?" end) |> Enum.join(", ")
      col_names = Enum.map(cols, fn c -> "`#{c}`" end) |> Enum.join(", ")
      values = Enum.map(cols, fn c -> cast_value(form[c], socket.assigns.column_types[c]) end)

      case Repo.query("INSERT INTO #{table} (#{col_names}) VALUES (#{placeholders})", values) do
        {:ok, _} ->
          {:noreply, socket
            |> assign(creating: false, form_data: %{}, form_errors: [])
            |> put_flash(:info, "Created new #{table} record.")
            |> load_entities()}
        {:error, err} ->
          {:noreply, assign(socket, form_errors: [inspect(err)])}
      end
    end
  end

  # ── Edit ───────────────────────────────────────────────────────
  def handle_event("edit", %{"id" => id}, socket) do
    row = Enum.find(socket.assigns.rows, fn r -> to_string(r["id"]) == to_string(id) end)
    if row do
      form = for {k, v} <- row, into: %{}, do: {k, if(is_nil(v), do: "", else: to_string(v))}
      {:noreply, assign(socket, editing: row, creating: false, form_data: form, form_errors: [])}
    else
      {:noreply, socket}
    end
  end

  def handle_event("save_edit", params, socket) do
    table = socket.assigns.table
    form = params["entity"] || %{}
    row_id = socket.assigns.editing["id"]
    columns = socket.assigns.columns -- ["id"]

    sets = columns
      |> Enum.map(fn c -> "`#{c}` = ?" end)
      |> Enum.join(", ")
    values = Enum.map(columns, fn c -> cast_value(form[c], socket.assigns.column_types[c]) end) ++ [row_id]

    case Repo.query("UPDATE #{table} SET #{sets} WHERE id = ?", values) do
      {:ok, _} ->
        {:noreply, socket
          |> assign(editing: nil, form_data: %{}, form_errors: [])
          |> put_flash(:info, "Updated #{table} ##{row_id}.")
          |> load_entities()}
      {:error, err} ->
        {:noreply, assign(socket, form_errors: [inspect(err)])}
    end
  end

  # ── Delete ─────────────────────────────────────────────────────
  def handle_event("delete", %{"id" => id}, socket) do
    table = socket.assigns.table
    case Repo.query("DELETE FROM #{table} WHERE id=?", [to_int(id, 0)]) do
      {:ok, %{num_rows: n}} when n > 0 ->
        {:noreply, socket |> put_flash(:info, "Deleted ##{id}.") |> load_entities()}
      _ ->
        {:noreply, put_flash(socket, :error, "Delete failed.")}
    end
  end

  # ── Cancel form ────────────────────────────────────────────────
  def handle_event("cancel_form", _p, socket) do
    {:noreply, assign(socket, editing: nil, creating: false, form_data: %{}, form_errors: [])}
  end

  def handle_event("update_form", %{"entity" => data}, socket) do
    {:noreply, assign(socket, form_data: Map.merge(socket.assigns.form_data, data))}
  end

  # ── Render ─────────────────────────────────────────────────────
  @impl true
  def render(assigns) do
    max_page = max(1, ceil(assigns.total / assigns.limit))
    show_form = assigns.creating || assigns.editing != nil
    form_title = if assigns.creating, do: "Create New", else: "Edit ##{assigns.editing && assigns.editing["id"]}"
    editable_cols = assigns.columns -- ["id"]

    assigns = assign(assigns, max_page: max_page, show_form: show_form, form_title: form_title, editable_cols: editable_cols)

    ~H"""
    <div>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-amber-400">Entity Manager</h2>
        <button phx-click="new" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-lg text-sm transition">
          + New Record
        </button>
      </div>

      <%!-- Table Picker (grouped) --%>
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <select phx-change="change_table" name="table"
          class="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none min-w-[220px]">
          <optgroup :for={{group, tables} <- @table_groups} label={group}>
            <option :for={t <- tables} value={t} selected={t == @table}>{t}</option>
          </optgroup>
        </select>

        <form phx-change="search" class="flex-1 max-w-sm">
          <input type="text" name="search" value={@search} placeholder="Search..."
            phx-debounce="300"
            class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
        </form>

        <span class="text-xs text-zinc-500">{@total} records</span>

        <div class="ml-auto flex items-center gap-2">
          <button phx-click="prev_page" disabled={@page <= 1}
            class="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs hover:bg-zinc-700 disabled:opacity-30">Prev</button>
          <span class="text-xs text-zinc-500">{@page} / {@max_page}</span>
          <button phx-click="next_page" disabled={@page >= @max_page}
            class="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs hover:bg-zinc-700 disabled:opacity-30">Next</button>
        </div>
      </div>

      <%!-- Create / Edit Form Modal --%>
      <div :if={@show_form} class="fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-12 overflow-y-auto">
        <div class="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-2xl mb-12 shadow-2xl">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-amber-400">{@form_title} — {@table}</h3>
            <button phx-click="cancel_form" class="text-zinc-500 hover:text-zinc-300 text-xl">&times;</button>
          </div>

          <div :for={err <- @form_errors} class="mb-3 p-2 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">{err}</div>

          <form phx-submit={if @creating, do: "save_new", else: "save_edit"} phx-change="update_form">
            <div class="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-2">
              <div :for={col <- @editable_cols} class="flex flex-col gap-1">
                <label class="text-xs font-bold text-zinc-500 uppercase tracking-wider">{col}</label>
                <%= render_field(assigns, col) %>
              </div>
            </div>

            <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-800">
              <button type="button" phx-click="cancel_form"
                class="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-lg text-sm hover:bg-zinc-700">Cancel</button>
              <button type="submit"
                class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-lg text-sm transition">
                {if @creating, do: "Create", else: "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <%!-- Data Table --%>
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-zinc-800 text-left">
              <th :for={col <- @columns}
                class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 whitespace-nowrap">{col}</th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-24 sticky right-0 bg-zinc-900">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr :for={row <- @rows} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
              <td :for={col <- @columns}
                class="px-3 py-2 text-sm text-zinc-300 max-w-[200px] truncate whitespace-nowrap">{format_cell(row[col])}</td>
              <td class="px-3 py-2 flex gap-2 sticky right-0 bg-zinc-900">
                <button phx-click="edit" phx-value-id={row["id"]}
                  class="text-xs text-amber-500 hover:text-amber-400 font-medium">Edit</button>
                <button phx-click="delete" phx-value-id={row["id"]}
                  data-confirm={"Delete ##{row["id"]} from #{@table}?"}
                  class="text-xs text-red-500 hover:text-red-400">Del</button>
              </td>
            </tr>
          </tbody>
        </table>

        <div :if={@rows == []} class="p-8 text-center text-zinc-600 text-sm">No records in {@table}</div>
      </div>
    </div>
    """
  end

  # ── Field Rendering ────────────────────────────────────────────
  defp render_field(assigns, col) do
    type_info = assigns.column_types[col] || %{type: "varchar(255)"}
    type_str = String.downcase(to_string(type_info.type))
    value = assigns.form_data[col] || ""
    is_bool = type_str =~ ~r/tinyint\(1\)|boolean|bool/
    is_text = type_str =~ ~r/text|longtext|mediumtext|json/
    is_number = type_str =~ ~r/int|decimal|float|double/ and not is_bool

    assigns = assign(assigns, field_col: col, field_value: value, field_bool: is_bool, field_text: is_text, field_number: is_number)

    ~H"""
    <div>
      <input :if={@field_bool} type="checkbox" name={"entity[#{@field_col}]"} value="1"
        checked={@field_value in ["1", "true", true]}
        class="rounded bg-zinc-800 border-zinc-600 text-amber-500 focus:ring-amber-500" />

      <textarea :if={@field_text and not @field_bool} name={"entity[#{@field_col}]"} rows="3"
        class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none font-mono"
      >{@field_value}</textarea>

      <input :if={@field_number and not @field_bool and not @field_text}
        type="number" name={"entity[#{@field_col}]"} value={@field_value}
        class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />

      <input :if={not @field_bool and not @field_text and not @field_number}
        type="text" name={"entity[#{@field_col}]"} value={@field_value}
        class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
    </div>
    """
  end

  # ── Helpers ────────────────────────────────────────────────────
  defp cast_value(nil, _meta), do: nil
  defp cast_value("", _meta), do: nil
  defp cast_value(val, %{type: type}) do
    type_str = String.downcase(to_string(type))
    cond do
      type_str =~ ~r/tinyint\(1\)|boolean/ -> if val in ["1", "true", "on"], do: 1, else: 0
      type_str =~ ~r/int/ ->
        case Integer.parse(to_string(val)) do
          {n, _} -> n
          :error -> val
        end
      type_str =~ ~r/decimal|float|double/ ->
        case Float.parse(to_string(val)) do
          {n, _} -> n
          :error -> val
        end
      true -> to_string(val)
    end
  end
  defp cast_value(val, _), do: to_string(val)

  defp format_cell(nil), do: ""
  defp format_cell(val) when is_binary(val) do
    if String.length(val) > 80, do: String.slice(val, 0, 80) <> "...", else: val
  end
  defp format_cell(%DateTime{} = dt), do: Calendar.strftime(dt, "%Y-%m-%d %H:%M")
  defp format_cell(%NaiveDateTime{} = dt), do: Calendar.strftime(dt, "%Y-%m-%d %H:%M")
  defp format_cell(%Date{} = d), do: Date.to_iso8601(d)
  defp format_cell(val), do: to_string(val)

  defp to_int(nil, default), do: default
  defp to_int(val, _default) when is_integer(val), do: val
  defp to_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> default
    end
  end
  defp to_int(_, default), do: default
end
