defmodule TePhoenixWeb.Admin.CampaignHubLive do
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo
  alias TePhoenix.Game.SagaEngine
  alias TePhoenixWeb.Admin.{SmartFields, FieldDescriptions}

  @tabs ~w(rulesets campaigns scheduler sagas action_windows modifiers)

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket,
      active_tab: :campaign,
      tab: "rulesets",
      tabs: @tabs,
      search: "",
      page: 1,
      rows: [],
      columns: [],
      total: 0,
      # Saga state
      sagas: [],
      saga_detail: nil,
      saga_chapters: [],
      saga_participants: [],
      saga_lore: [],
      saga_generating: false,
      saga_seed: "",
      saga_chapters_count: "3",
      saga_recap: nil,
      saga_manual_mode: false,
      column_types: %{},
      current_table: nil,
      editing: nil,
      creating: false,
      form_data: %{},
      form_errors: [],
      saga_form: nil,
      show_form: false
    ) |> load_tab()}
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

  def handle_event("toggle_task", %{"id" => id}, socket) do
    case Repo.query("SELECT is_enabled FROM game_scheduled_tasks WHERE id=?", [to_int(id)]) do
      {:ok, %{rows: [[current]]}} ->
        new_val = if current == 1, do: 0, else: 1
        Repo.query("UPDATE game_scheduled_tasks SET is_enabled=? WHERE id=?", [new_val, to_int(id)])
        {:noreply, socket |> put_flash(:info, "Task #{if new_val == 1, do: "enabled", else: "disabled"}.") |> load_tab()}
      _ ->
        {:noreply, put_flash(socket, :error, "Task not found.")}
    end
  end

  # ── CRUD for all tabs ────────────────────────────────────────────

  def handle_event("new_record", _params, socket) do
    form = Map.new(socket.assigns.columns -- ["id", "created_at", "updated_at"], fn col -> {col, ""} end)
    {:noreply, assign(socket, creating: true, editing: nil, form_data: form)}
  end

  def handle_event("edit_record", %{"id" => id}, socket) do
    table = current_table_for_tab(socket.assigns.tab)
    case Repo.query("SELECT * FROM #{table} WHERE id = ?", [to_int(id)]) do
      {:ok, %{rows: [row], columns: cols}} ->
        form = Enum.zip(cols, row) |> Map.new()
        {:noreply, assign(socket, editing: id, creating: false, form_data: form)}
      _ ->
        {:noreply, socket}
    end
  end

  def handle_event("cancel_record", _params, socket) do
    {:noreply, assign(socket, creating: false, editing: nil, form_data: %{})}
  end

  def handle_event("delete_record", %{"id" => id}, socket) do
    table = current_table_for_tab(socket.assigns.tab)
    Repo.query("DELETE FROM #{table} WHERE id = ?", [to_int(id)])
    {:noreply, assign(socket, creating: false, editing: nil) |> load_tab()}
  end

  def handle_event("save_new_record", %{"record" => params}, socket) do
    table = current_table_for_tab(socket.assigns.tab)
    cols = Map.keys(params) |> Enum.reject(&(&1 in ["id", "created_at", "updated_at"]))
    col_str = Enum.map(cols, &"`#{&1}`") |> Enum.join(", ")
    placeholders = Enum.map(cols, fn _ -> "?" end) |> Enum.join(", ")
    vals = Enum.map(cols, &Map.get(params, &1, ""))

    Repo.query("INSERT INTO #{table} (#{col_str}) VALUES (#{placeholders})", vals)
    {:noreply, assign(socket, creating: false, form_data: %{}) |> load_tab()}
  rescue
    e ->
      {:noreply, socket |> put_flash(:error, "Create failed: #{Exception.message(e)}")}
  end

  def handle_event("save_edit_record", %{"record" => params}, socket) do
    table = current_table_for_tab(socket.assigns.tab)
    id = socket.assigns.editing
    cols = Map.keys(params) |> Enum.reject(&(&1 in ["id", "created_at", "updated_at"]))
    set_str = Enum.map(cols, &"`#{&1}` = ?") |> Enum.join(", ")
    vals = Enum.map(cols, &Map.get(params, &1, ""))

    Repo.query("UPDATE #{table} SET #{set_str} WHERE id = ?", vals ++ [to_int(id)])
    {:noreply, assign(socket, editing: nil, form_data: %{}) |> load_tab()}
  rescue
    e ->
      {:noreply, socket |> put_flash(:error, "Save failed: #{Exception.message(e)}")}
  end

  defp current_table_for_tab(tab) do
    %{
      "rulesets" => "game_campaign_rulesets",
      "campaigns" => "game_dm_campaigns",
      "scheduler" => "game_scheduled_tasks",
      "action_windows" => "game_action_windows",
      "modifiers" => "game_ruleset_modifiers"
    }[tab] || "game_campaign_rulesets"
  end

  # ── Generic CRUD events for action_windows, modifiers tabs ──
  def handle_event("new", _, s) do
    defaults = for {c, m} <- (s.assigns[:column_types] || %{}), c != "id", into: %{}, do: {c, m.default || ""}
    {:noreply, assign(s, creating: true, editing: nil, form_data: defaults, form_errors: [])}
  end
  def handle_event("save_new", params, s) do
    import TePhoenixWeb.Admin.CrudHelpers
    form = params["entity"] || %{}
    table = s.assigns[:current_table]
    case create_record(table, form, s.assigns[:column_types] || %{}) do
      :ok -> {:noreply, s |> assign(creating: false, form_data: %{}, form_errors: []) |> put_flash(:info, "Created!") |> load_tab()}
      {:error, msg} -> {:noreply, assign(s, form_errors: [msg])}
    end
  end
  def handle_event("edit", %{"id" => id}, s) do
    row = Enum.find(s.assigns.rows, &(to_string(&1["id"]) == to_string(id)))
    if row do
      form = for {k, v} <- row, into: %{}, do: {k, if(is_nil(v), do: "", else: to_string(v))}
      {:noreply, assign(s, editing: row, creating: false, form_data: form, form_errors: [])}
    else {:noreply, s} end
  end
  def handle_event("save_edit", params, s) do
    import TePhoenixWeb.Admin.CrudHelpers
    form = params["entity"] || %{}
    table = s.assigns[:current_table]
    case update_record(table, s.assigns.editing["id"], form, s.assigns[:columns] || [], s.assigns[:column_types] || %{}) do
      :ok -> {:noreply, s |> assign(editing: nil, form_data: %{}, form_errors: []) |> put_flash(:info, "Updated!") |> load_tab()}
      {:error, msg} -> {:noreply, assign(s, form_errors: [msg])}
    end
  end
  def handle_event("delete", %{"id" => id}, s) do
    import TePhoenixWeb.Admin.CrudHelpers
    table = s.assigns[:current_table]
    if table do
      case delete_record(table, id) do
        :ok -> {:noreply, s |> put_flash(:info, "Deleted!") |> load_tab()}
        {:error, msg} -> {:noreply, put_flash(s, :error, msg)}
      end
    else
      {:noreply, s}
    end
  end
  def handle_event("cancel_form", _, s), do: {:noreply, assign(s, editing: nil, creating: false, form_data: %{}, form_errors: [])}
  def handle_event("update_form", %{"entity" => d}, s), do: {:noreply, assign(s, form_data: Map.merge(s.assigns[:form_data] || %{}, d))}

  # ── Saga Event Handlers ──────────────────────────────────────────

  def handle_event("saga_seed_change", %{"seed" => seed}, socket) do
    {:noreply, assign(socket, saga_seed: seed)}
  end

  def handle_event("saga_chapters_change", %{"chapters" => c}, socket) do
    {:noreply, assign(socket, saga_chapters_count: c)}
  end

  def handle_event("generate_saga", _params, socket) do
    socket = assign(socket, saga_generating: true)
    pid = self()
    seed = socket.assigns.saga_seed
    chapters = to_int(socket.assigns.saga_chapters_count)
    chapters = if chapters < 2, do: 3, else: min(chapters, 8)

    Task.start(fn ->
      result = SagaEngine.generate_saga(%{chapters: chapters, seed_prompt: seed})
      send(pid, {:saga_generated, result})
    end)
    {:noreply, socket}
  end

  def handle_event("view_saga", %{"id" => id}, socket) do
    saga_id = to_int(id)
    saga = SagaEngine.get_saga(saga_id)
    chapters = SagaEngine.get_all_chapters(saga_id)
    participants = SagaEngine.get_participants(saga_id)
    lore = SagaEngine.get_lore(saga_id)
    {:noreply, assign(socket, saga_detail: saga, saga_chapters: chapters, saga_participants: participants, saga_lore: lore, saga_recap: nil)}
  end

  def handle_event("close_saga", _params, socket) do
    {:noreply, assign(socket, saga_detail: nil, saga_chapters: [], saga_participants: [], saga_lore: [], saga_recap: nil)}
  end

  def handle_event("start_saga", %{"id" => id}, socket) do
    SagaEngine.start_saga(to_int(id))
    reload_saga(socket, to_int(id))
  end

  def handle_event("advance_chapter", %{"id" => id}, socket) do
    SagaEngine.advance_chapter(to_int(id))
    reload_saga(socket, to_int(id))
  end

  def handle_event("fail_chapter", %{"id" => id}, socket) do
    SagaEngine.fail_chapter(to_int(id))
    reload_saga(socket, to_int(id))
  end

  def handle_event("complete_saga", %{"id" => id}, socket) do
    SagaEngine.complete_saga(to_int(id))
    reload_saga(socket, to_int(id))
  end

  def handle_event("delete_saga", %{"id" => id}, socket) do
    saga_id = to_int(id)
    Repo.query("DELETE FROM game_saga_events WHERE saga_id=?", [saga_id])
    Repo.query("DELETE FROM game_saga_participants WHERE saga_id=?", [saga_id])
    Repo.query("DELETE FROM game_saga_lore WHERE saga_id=?", [saga_id])
    Repo.query("DELETE FROM game_saga_chapters WHERE saga_id=?", [saga_id])
    Repo.query("DELETE FROM game_sagas WHERE id=?", [saga_id])
    {:noreply, assign(socket, saga_detail: nil) |> load_sagas()}
  end

  def handle_event("generate_recap", %{"id" => id}, socket) do
    case SagaEngine.generate_recap(to_int(id)) do
      {:ok, recap} -> {:noreply, assign(socket, saga_recap: recap)}
      _ -> {:noreply, assign(socket, saga_recap: "Could not generate recap.")}
    end
  end

  def handle_event("toggle_manual_saga", _params, socket) do
    if socket.assigns.saga_manual_mode do
      {:noreply, assign(socket, saga_manual_mode: false, saga_form: nil)}
    else
      form = %{"name" => "", "description" => "", "icon" => "📜", "villain_name" => "", "villain_description" => "",
               "total_chapters" => "3", "difficulty_base" => "1", "scaling_mode" => "player_count"}
      {:noreply, assign(socket, saga_manual_mode: true, saga_form: form)}
    end
  end

  def handle_event("manual_saga_change", params, socket) do
    form = socket.assigns.saga_form || %{}
    updated = Map.merge(form, Map.take(params, Map.keys(form)))
    {:noreply, assign(socket, saga_form: updated)}
  end

  def handle_event("save_manual_saga", params, socket) do
    form = Map.merge(socket.assigns.saga_form || %{}, params)
    name = String.trim(form["name"] || "")
    if name == "" do
      {:noreply, put_flash(socket, :error, "Saga name is required.")}
    else
      chapters_count = to_int(form["total_chapters"]) |> max(1) |> min(8)

      case Repo.query("""
        INSERT INTO game_sagas (name, description, icon, villain_name, villain_description, total_chapters, difficulty_base, scaling_mode, ai_generated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      """, [name, form["description"], form["icon"] || "📜", form["villain_name"], form["villain_description"],
            chapters_count, to_int(form["difficulty_base"]), form["scaling_mode"] || "player_count"]) do
        {:ok, %{last_insert_id: saga_id}} ->
          # Create empty chapter stubs
          for i <- 1..chapters_count do
            Repo.query("""
              INSERT INTO game_saga_chapters (saga_id, chapter_number, title, description, trigger_type)
              VALUES (?, ?, ?, '', 'manual')
            """, [saga_id, i, "Chapter #{i}"])
          end

          # Add villain lore if provided
          if String.trim(form["villain_name"] || "") != "" do
            Repo.query("INSERT INTO game_saga_lore (saga_id, title, body, category) VALUES (?, ?, ?, 'villain')",
              [saga_id, form["villain_name"], form["villain_description"] || "A mysterious threat."])
          end

          saga = SagaEngine.get_saga(saga_id)
          chapters = SagaEngine.get_all_chapters(saga_id)
          lore = SagaEngine.get_lore(saga_id)
          {:noreply, assign(socket, saga_manual_mode: false, saga_form: nil, saga_detail: saga, saga_chapters: chapters, saga_lore: lore, saga_participants: []) |> put_flash(:info, "Saga created!") |> load_sagas()}

        _ ->
          {:noreply, put_flash(socket, :error, "Failed to create saga.")}
      end
    end
  end

  def handle_event("edit_chapter", %{"id" => id, "field" => field, "value" => value}, socket) do
    safe = ~w(title description narrative_intro narrative_outro boss_name boss_level countdown_hours reward_xp reward_gold trigger_type)
    if field in safe do
      int_fields = ~w(boss_level countdown_hours reward_xp reward_gold)
      val = if field in int_fields, do: to_int(value), else: value
      Repo.query("UPDATE game_saga_chapters SET `#{field}`=? WHERE id=?", [val, to_int(id)])
      # Reload
      saga_id = socket.assigns.saga_detail["id"]
      chapters = SagaEngine.get_all_chapters(saga_id)
      {:noreply, assign(socket, saga_chapters: chapters)}
    else
      {:noreply, socket}
    end
  end

  @impl true
  def handle_info({:saga_generated, {:ok, saga_id}}, socket) do
    {:noreply, socket |> assign(saga_generating: false, saga_seed: "") |> put_flash(:info, "Saga generated!") |> load_sagas() |> then(fn s ->
      saga = SagaEngine.get_saga(saga_id)
      chapters = SagaEngine.get_all_chapters(saga_id)
      lore = SagaEngine.get_lore(saga_id)
      assign(s, saga_detail: saga, saga_chapters: chapters, saga_participants: [], saga_lore: lore)
    end)}
  end

  def handle_info({:saga_generated, {:error, reason}}, socket) do
    {:noreply, assign(socket, saga_generating: false) |> put_flash(:error, "Generation failed: #{reason}")}
  end

  def handle_info({:saga_generated, _}, socket) do
    {:noreply, assign(socket, saga_generating: false) |> put_flash(:error, "Generation failed.")}
  end

  defp reload_saga(socket, saga_id) do
    saga = SagaEngine.get_saga(saga_id)
    chapters = SagaEngine.get_all_chapters(saga_id)
    participants = SagaEngine.get_participants(saga_id)
    lore = SagaEngine.get_lore(saga_id)
    {:noreply, assign(socket, saga_detail: saga, saga_chapters: chapters, saga_participants: participants, saga_lore: lore) |> load_sagas()}
  end

  defp load_sagas(socket) do
    sagas = SagaEngine.list_sagas()
    assign(socket, sagas: sagas)
  end

  # ── Tab Loading ─────────────────────────────────────────────────

  defp load_tab(socket) do
    case socket.assigns.tab do
      "rulesets" -> load_rulesets(socket)
      "campaigns" -> load_campaigns(socket)
      "scheduler" -> load_scheduler(socket)
      "sagas" -> load_sagas(socket)
      tab when tab in ~w(action_windows modifiers) ->
        table = %{"action_windows" => "game_action_windows", "modifiers" => "game_ruleset_modifiers"}[tab]
        import TePhoenixWeb.Admin.CrudHelpers
        socket |> assign(current_table: table) |> load_tab_data(table, per_page: 30)
      _ -> socket
    end
  end

  defp load_rulesets(socket) do
    search = socket.assigns.search
    {offset, limit} = pagination(socket)

    {where, params} = search_clause(search, "name")

    total = count_rows("game_campaign_rulesets", where, params)

    rows = query_rows(
      "SELECT id, name, stat_mode, combat_mode, movement_mode, is_active, created_at FROM game_campaign_rulesets #{where} ORDER BY id DESC LIMIT ? OFFSET ?",
      params ++ [limit, offset]
    )

    assign(socket, rows: rows, total: total, columns: ~w(id name stat_mode combat_mode movement_mode is_active))
  end

  defp load_campaigns(socket) do
    search = socket.assigns.search
    {offset, limit} = pagination(socket)

    {where, params} = search_clause(search, "name")

    total = count_rows("game_dm_campaigns", where, params)

    rows = query_rows(
      "SELECT id, name, dm_user_id, status, max_players, ruleset_id, created_at FROM game_dm_campaigns #{where} ORDER BY id DESC LIMIT ? OFFSET ?",
      params ++ [limit, offset]
    )

    assign(socket, rows: rows, total: total, columns: ~w(id name status max_players ruleset_id created_at))
  end

  defp load_scheduler(socket) do
    search = socket.assigns.search
    {offset, limit} = pagination(socket)

    {where, params} = search_clause(search, "name")

    total = count_rows("game_scheduled_tasks", where, params)

    rows = query_rows(
      "SELECT id, name, task_type, schedule_type, is_enabled, last_run_at FROM game_scheduled_tasks #{where} ORDER BY id DESC LIMIT ? OFFSET ?",
      params ++ [limit, offset]
    )

    assign(socket, rows: rows, total: total, columns: ~w(id name task_type schedule_type is_enabled last_run_at))
  end

  defp pagination(socket) do
    limit = 30
    offset = (socket.assigns.page - 1) * limit
    {offset, limit}
  end

  defp search_clause("", _col), do: {"", []}
  defp search_clause(q, col), do: {"WHERE #{col} LIKE ?", ["%#{q}%"]}

  defp count_rows(table, where, params) do
    case Repo.query("SELECT COUNT(*) FROM #{table} #{where}", params) do
      {:ok, %{rows: [[c]]}} -> c
      _ -> 0
    end
  end

  defp query_rows(sql, params) do
    case Repo.query(sql, params) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
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

  @impl true
  def render(assigns) do
    max_page = max(1, ceil(assigns.total / 30))
    assigns = assign(assigns, :max_page, max_page)

    ~H"""
    <div>
      <h2 class="text-2xl font-bold text-amber-400 mb-6">Campaigns & Scheduling</h2>

      <!-- Tab Bar -->
      <div class="flex gap-1 mb-6 border-b border-zinc-800 pb-3">
        <button :for={t <- @tabs} phx-click="change_tab" phx-value-tab={t}
          class={["px-3 py-1.5 rounded-t text-sm font-medium transition-colors",
            @tab == t && "bg-amber-600 text-white",
            @tab != t && "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"]}>
          {tab_label(t)}
        </button>
      </div>

      <%= if @tab == "sagas" do %>
        <.render_sagas {assigns} />
      <% else %>
      <!-- Controls -->
      <div class="flex items-center gap-3 mb-4">
        <form phx-change="search" class="flex-1 max-w-sm">
          <input type="text" name="search" value={@search} placeholder="Search..."
            phx-debounce="300"
            class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
        </form>
        <span class="text-xs text-zinc-600">{@total} records</span>
        <button :if={@tab != "scheduler" and not @creating and @editing == nil} phx-click="new_record"
          class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-lg text-sm transition">
          + New {tab_label(@tab)}
        </button>
        <div class="ml-auto flex items-center gap-2">
          <button phx-click="prev_page" disabled={@page <= 1}
            class="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs hover:bg-zinc-700 disabled:opacity-30">Prev</button>
          <span class="text-xs text-zinc-500">{@page} / {@max_page}</span>
          <button phx-click="next_page" disabled={@page >= @max_page}
            class="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs hover:bg-zinc-700 disabled:opacity-30">Next</button>
        </div>
      </div>

      <%!-- Create/Edit Form --%>
      <div :if={@creating or @editing != nil} class="mb-6 p-4 border border-amber-700 rounded bg-zinc-950">
        <h3 class="text-sm font-bold text-amber-400 mb-3">{if @creating, do: "Create New", else: "Edit"} {tab_label(@tab)}</h3>
        <form phx-submit={if @creating, do: "save_new_record", else: "save_edit_record"} class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div :for={col <- @columns -- ["id", "created_at", "updated_at"]} class="flex flex-col gap-1">
              <label class="text-xs font-bold text-zinc-500 uppercase">{humanize_col(col)}</label>
              <%= case SmartFields.smart_type(col) do %>
                <% {:enum, options} -> %>
                  <select name={"record[#{col}]"} class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200">
                    <option value="">(select)</option>
                    <%= for opt <- options do %>
                      <option value={opt} selected={to_string((@form_data || %{})[col]) == opt}>{opt}</option>
                    <% end %>
                  </select>
                <% {:fk, table} -> %>
                  <select name={"record[#{col}]"} class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200">
                    <option value="">(none)</option>
                    <%= for opt <- SmartFields.fk_options(table) do %>
                      <option value={opt.id} selected={to_string((@form_data || %{})[col]) == to_string(opt.id)}>{opt.name} (#{opt.id})</option>
                    <% end %>
                  </select>
                <% :textarea -> %>
                  <textarea name={"record[#{col}]"} rows="3" class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200">{(@form_data || %{})[col] || ""}</textarea>
                <% _ -> %>
                  <input type="text" name={"record[#{col}]"} value={(@form_data || %{})[col] || ""}
                    class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200" />
              <% end %>
              <p :if={FieldDescriptions.get(col)} class="text-[10px] text-zinc-600 leading-snug">{FieldDescriptions.get(col)}</p>
            </div>
          </div>
          <div class="flex gap-2 pt-2">
            <button type="submit" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded text-sm">Save</button>
            <button type="button" phx-click="cancel_record" class="px-4 py-2 bg-zinc-800 text-zinc-400 rounded text-sm">Cancel</button>
          </div>
        </form>
      </div>

      <!-- Data Table -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
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
              <td :for={col <- @columns} class="px-3 py-2 text-sm text-zinc-300 max-w-[200px] truncate whitespace-nowrap">
                {format_cell(col, row[col])}
              </td>
              <td class="px-3 py-2 flex gap-2">
                <button phx-click="edit_record" phx-value-id={row["id"]} class="text-xs text-amber-500 hover:text-amber-400">Edit</button>
                <button phx-click="delete_record" phx-value-id={row["id"]} data-confirm={"Delete ##{row["id"]}?"} class="text-xs text-red-500 hover:text-red-400">Del</button>
                <button :if={@tab == "scheduler"} phx-click="toggle_task" phx-value-id={row["id"]}
                  class={["text-xs px-2 py-0.5 rounded",
                    row["is_enabled"] == 1 && "bg-green-900/50 text-green-400",
                    row["is_enabled"] != 1 && "bg-zinc-800 text-zinc-500"]}>
                  {if row["is_enabled"] == 1, do: "On", else: "Off"}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div :if={@rows == []} class="p-8 text-center text-zinc-600 text-sm">No records yet. Click <strong>+ New</strong> to create one.</div>
      </div>
      <% end %>
    </div>
    """
  end

  defp humanize_col(col) do
    col |> String.replace("_json", "") |> String.replace("_id", "") |> String.replace("_", " ") |> String.split(" ") |> Enum.map(&String.capitalize/1) |> Enum.join(" ")
  end

  defp tab_label("rulesets"), do: "Rulesets"
  defp tab_label("campaigns"), do: "DM Campaigns"
  defp tab_label("scheduler"), do: "Scheduler"
  defp tab_label("sagas"), do: "📜 Sagas"
  defp tab_label(t), do: String.capitalize(t)

  # ── Saga Tab Render ─────────────────────────────────────────────

  defp render_sagas(assigns) do
    ~H"""
    <div class="space-y-4">
      <!-- Generator -->
      <div class="bg-zinc-900 border border-amber-800/30 rounded-xl p-5">
        <div class="flex items-center gap-3 mb-4">
          <span class="text-xl">🧠</span>
          <div>
            <h3 class="text-sm font-bold text-amber-400 uppercase tracking-wider">AI Saga Generator</h3>
            <p class="text-[10px] text-zinc-500">Generate multi-chapter story arcs with AI or fallback templates</p>
          </div>
        </div>
        <div class="flex gap-3 items-end">
          <div class="flex-1">
            <label class="text-[10px] text-zinc-500 uppercase block mb-1">Seed Idea (optional)</label>
            <input type="text" value={@saga_seed} phx-keyup="saga_seed_change" phx-value-seed=""
              name="seed" placeholder="e.g. A fomorian army rises from the sea..."
              class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-600" />
          </div>
          <div class="w-24">
            <label class="text-[10px] text-zinc-500 uppercase block mb-1">Chapters</label>
            <input type="number" value={@saga_chapters_count} min="2" max="8"
              phx-keyup="saga_chapters_change" name="chapters"
              class="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-200 text-center" />
          </div>
          <button phx-click="generate_saga" disabled={@saga_generating}
            class={["px-4 py-2 rounded text-sm font-medium transition-colors",
              @saga_generating && "bg-zinc-700 text-zinc-500 cursor-wait",
              !@saga_generating && "bg-amber-600 hover:bg-amber-500 text-white"]}>
            {if @saga_generating, do: "Generating...", else: "Generate Saga"}
          </button>
        </div>
        <div :if={@saga_generating} class="flex items-center gap-2 mt-3">
          <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          <span class="text-xs text-zinc-400">AI is writing your saga... this may take a moment</span>
        </div>
      </div>

      <!-- Manual Saga Creation — equal prominence to AI -->
      <div class="flex items-center gap-3 mb-4">
        <button phx-click="toggle_manual_saga"
          class={["px-4 py-2 rounded text-sm font-bold transition-colors",
            @saga_manual_mode && "bg-zinc-700 text-zinc-300",
            !@saga_manual_mode && "bg-emerald-700 hover:bg-emerald-600 text-white"]}>
          {if @saga_manual_mode, do: "✕ Cancel Manual Create", else: "✍️ Create Saga Manually"}
        </button>
        <span class="text-xs text-zinc-500">No AI required — full control over name, chapters, villain, and story.</span>
      </div>

      <div :if={@saga_manual_mode} class="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
        <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4">Manual Saga Creation</h3>
        <form phx-submit="save_manual_saga" phx-change="manual_saga_change" class="space-y-3">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="col-span-2">
              <label class="text-[10px] text-zinc-500 uppercase block mb-1">Saga Name</label>
              <input type="text" name="name" value={@saga_form["name"]}
                class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200" />
            </div>
            <div>
              <label class="text-[10px] text-zinc-500 uppercase block mb-1">Icon</label>
              <input type="text" name="icon" value={@saga_form["icon"]}
                class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200" />
            </div>
            <div>
              <label class="text-[10px] text-zinc-500 uppercase block mb-1">Chapters</label>
              <input type="number" name="total_chapters" value={@saga_form["total_chapters"]} min="1" max="8"
                class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200" />
            </div>
          </div>
          <div>
            <label class="text-[10px] text-zinc-500 uppercase block mb-1">Description</label>
            <textarea name="description" rows="2" class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200">{@saga_form["description"]}</textarea>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[10px] text-zinc-500 uppercase block mb-1">Villain Name</label>
              <input type="text" name="villain_name" value={@saga_form["villain_name"]}
                class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200" />
            </div>
            <div>
              <label class="text-[10px] text-zinc-500 uppercase block mb-1">Scaling Mode</label>
              <select name="scaling_mode" class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200">
                <option value="player_count" selected={@saga_form["scaling_mode"] == "player_count"}>Player Count</option>
                <option value="fixed" selected={@saga_form["scaling_mode"] == "fixed"}>Fixed</option>
                <option value="adaptive" selected={@saga_form["scaling_mode"] == "adaptive"}>Adaptive</option>
              </select>
            </div>
          </div>
          <div>
            <label class="text-[10px] text-zinc-500 uppercase block mb-1">Villain Description</label>
            <textarea name="villain_description" rows="2" class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200">{@saga_form["villain_description"]}</textarea>
          </div>
          <button type="submit" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium">Create Saga</button>
        </form>
      </div>

      <!-- Saga Detail View -->
      <div :if={@saga_detail} class="bg-zinc-900 border border-amber-800/30 rounded-xl p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <span class="text-2xl">{@saga_detail["icon"] || "📜"}</span>
            <div>
              <h3 class="text-lg font-bold text-amber-400">{@saga_detail["name"]}</h3>
              <p class="text-xs text-zinc-400">{@saga_detail["description"]}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class={["text-[10px] px-2 py-0.5 rounded font-medium",
              @saga_detail["status"] == "active" && "bg-green-900/50 text-green-400",
              @saga_detail["status"] == "completed" && "bg-blue-900/50 text-blue-400",
              @saga_detail["status"] == "draft" && "bg-zinc-800 text-zinc-400",
              @saga_detail["status"] == "paused" && "bg-yellow-900/50 text-yellow-400"]}>{@saga_detail["status"]}</span>
            <button phx-click="close_saga" class="text-zinc-500 hover:text-zinc-300 text-sm">✕</button>
          </div>
        </div>

        <!-- Villain -->
        <div :if={@saga_detail["villain_name"]} class="mb-4 px-4 py-3 bg-red-950/30 border border-red-900/30 rounded-lg">
          <div class="text-xs text-red-400 font-bold uppercase mb-1">Antagonist</div>
          <div class="text-sm text-zinc-200 font-medium">{@saga_detail["villain_name"]}</div>
          <div class="text-xs text-zinc-400">{@saga_detail["villain_description"]}</div>
        </div>

        <!-- Chapters -->
        <div class="mb-4">
          <h4 class="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Chapters ({length(@saga_chapters)})</h4>
          <div class="space-y-2">
            <%= for ch <- @saga_chapters do %>
            <div class={["px-4 py-3 rounded-lg border",
              ch["status"] == "active" && "bg-amber-950/20 border-amber-800/40",
              ch["status"] == "completed" && "bg-green-950/20 border-green-800/30",
              ch["status"] == "failed" && "bg-red-950/20 border-red-800/30",
              ch["status"] == "locked" && "bg-zinc-950/50 border-zinc-800/30",
              ch["status"] == "skipped" && "bg-zinc-950/30 border-zinc-800/20"]}>
              <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-2">
                  <span class="text-xs text-zinc-500 font-mono">Ch.{ch["chapter_number"]}</span>
                  <span class="text-sm font-medium text-zinc-200">{ch["title"]}</span>
                  <span :if={ch["boss_name"]} class="text-[10px] text-red-400">💀 {ch["boss_name"]} Lv.{ch["boss_level"]}</span>
                </div>
                <span class={["text-[10px] px-1.5 py-0.5 rounded",
                  ch["status"] == "active" && "bg-amber-900/50 text-amber-400",
                  ch["status"] == "completed" && "bg-green-900/50 text-green-400",
                  ch["status"] == "failed" && "bg-red-900/50 text-red-400",
                  ch["status"] == "locked" && "bg-zinc-800 text-zinc-500"]}>{ch["status"]}</span>
              </div>
              <div class="text-xs text-zinc-400 mb-1">{ch["description"]}</div>
              <div :if={ch["narrative_intro"]} class="text-[11px] text-zinc-500 italic mb-1">"{String.slice(ch["narrative_intro"] || "", 0, 120)}..."</div>
              <div class="flex gap-3 text-[10px] text-zinc-500">
                <span :if={ch["reward_xp"] && ch["reward_xp"] > 0}>⚡ {ch["reward_xp"]} XP</span>
                <span :if={ch["reward_gold"] && ch["reward_gold"] > 0}>💰 {ch["reward_gold"]}g</span>
                <span :if={ch["countdown_hours"]}>⏱️ {ch["countdown_hours"]}h countdown</span>
              </div>
            </div>
            <% end %>
          </div>
        </div>

        <!-- Participants -->
        <div :if={@saga_participants != []} class="mb-4">
          <h4 class="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Participants ({length(@saga_participants)})</h4>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div :for={p <- @saga_participants} class="px-3 py-2 bg-zinc-950/50 border border-zinc-800 rounded text-xs">
              <div class="text-zinc-200 font-medium">{p["char_name"] || "Char ##{p["character_id"]}"}</div>
              <div class="text-zinc-500">Lv.{p["char_level"]} · Score: {p["contribution_score"]} · Deaths: {p["deaths"]}</div>
            </div>
          </div>
        </div>

        <!-- Lore -->
        <div :if={@saga_lore != []} class="mb-4">
          <h4 class="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Lore Entries</h4>
          <div :for={l <- @saga_lore} class="px-3 py-2 bg-zinc-950/50 border border-zinc-800 rounded mb-1">
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400 mr-2">{l["category"]}</span>
            <span class="text-xs text-amber-400 font-medium">{l["title"]}</span>
            <div class="text-xs text-zinc-400 mt-1">{l["body"]}</div>
          </div>
        </div>

        <!-- Recap -->
        <div :if={@saga_recap} class="mb-4 px-4 py-3 bg-zinc-950/50 border border-amber-800/20 rounded-lg">
          <div class="text-[10px] text-amber-400 uppercase mb-1">Previously on {String.upcase(@saga_detail["name"] || "")}...</div>
          <div class="text-sm text-zinc-300 italic">{@saga_recap}</div>
        </div>

        <!-- Actions -->
        <div class="flex gap-2 flex-wrap pt-3 border-t border-zinc-800">
          <button :if={@saga_detail["status"] == "draft"}
            phx-click="start_saga" phx-value-id={@saga_detail["id"]}
            data-confirm="Start this saga? Chapter 1 will activate and broadcast to all players."
            class="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-xs">▶ Start Saga</button>
          <button :if={@saga_detail["status"] == "active"}
            phx-click="advance_chapter" phx-value-id={@saga_detail["id"]}
            data-confirm="Advance to next chapter?"
            class="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs">⏭ Advance Chapter</button>
          <button :if={@saga_detail["status"] == "active"}
            phx-click="fail_chapter" phx-value-id={@saga_detail["id"]}
            data-confirm="Fail the current chapter? This may trigger branching."
            class="px-3 py-1.5 bg-red-900/50 text-red-400 border border-red-800 rounded text-xs hover:bg-red-800/50">💀 Fail Chapter</button>
          <button :if={@saga_detail["status"] == "active"}
            phx-click="complete_saga" phx-value-id={@saga_detail["id"]}
            data-confirm="Complete this saga early?"
            class="px-3 py-1.5 bg-blue-900/50 text-blue-400 border border-blue-800 rounded text-xs hover:bg-blue-800/50">✓ Complete</button>
          <button :if={@saga_detail["status"] in ["active", "completed"]}
            phx-click="generate_recap" phx-value-id={@saga_detail["id"]}
            class="px-3 py-1.5 bg-purple-900/50 text-purple-400 border border-purple-800 rounded text-xs hover:bg-purple-800/50">📖 Generate Recap</button>
          <button phx-click="delete_saga" phx-value-id={@saga_detail["id"]}
            data-confirm="Permanently delete this saga and all its data?"
            class="px-3 py-1.5 bg-zinc-800 text-red-400 rounded text-xs hover:bg-zinc-700 ml-auto">Delete</button>
        </div>
      </div>

      <!-- Saga List -->
      <div :if={!@saga_detail} class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div :if={@sagas == []} class="p-8 text-center text-zinc-600 text-sm">
          No sagas yet — generate one above
        </div>
        <table :if={@sagas != []} class="w-full">
          <thead>
            <tr class="border-b border-zinc-800 text-left">
              <th class="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Saga</th>
              <th class="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Villain</th>
              <th class="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Chapters</th>
              <th class="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Status</th>
              <th class="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Created</th>
              <th class="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-16"></th>
            </tr>
          </thead>
          <tbody>
            <tr :for={s <- @sagas} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
              <td class="px-4 py-2.5">
                <span class="mr-1">{s["icon"] || "📜"}</span>
                <span class="text-sm text-zinc-200 font-medium">{s["name"]}</span>
                <span :if={s["ai_generated"] == 1} class="ml-1 text-[9px] text-purple-400">AI</span>
              </td>
              <td class="px-4 py-2.5 text-sm text-red-400/80">{s["villain_name"] || "—"}</td>
              <td class="px-4 py-2.5 text-sm text-zinc-400">{s["total_chapters"]}</td>
              <td class="px-4 py-2.5">
                <span class={["text-[10px] px-2 py-0.5 rounded",
                  s["status"] == "active" && "bg-green-900/50 text-green-400",
                  s["status"] == "completed" && "bg-blue-900/50 text-blue-400",
                  s["status"] == "draft" && "bg-zinc-800 text-zinc-400"]}>{s["status"]}</span>
              </td>
              <td class="px-4 py-2.5 text-xs text-zinc-500">{format_cell("created_at", s["created_at"])}</td>
              <td class="px-4 py-2.5">
                <button phx-click="view_saga" phx-value-id={s["id"]} class="text-xs text-amber-500 hover:text-amber-400">View</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    """
  end

  defp format_cell("is_active", 1), do: "Active"
  defp format_cell("is_active", 0), do: "Inactive"
  defp format_cell("is_enabled", 1), do: "Enabled"
  defp format_cell("is_enabled", 0), do: "Disabled"
  defp format_cell(_, nil), do: "-"
  defp format_cell(_, val) when is_binary(val) do
    if String.length(val) > 50, do: String.slice(val, 0, 50) <> "...", else: val
  end
  defp format_cell(_, val), do: to_string(val)
end
