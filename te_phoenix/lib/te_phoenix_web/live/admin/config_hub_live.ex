defmodule TePhoenixWeb.Admin.ConfigHubLive do
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo

  @tabs ~w(battle terminology lore)

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(
       active_tab: :config,
       tab: "battle",
       tabs: @tabs,
       settings: [],
       grouped_settings: %{},
       terms: [],
       lore: "",
       lore_saved: false,
       editing_term: nil
     )
     |> load_tab()}
  end

  @impl true
  def handle_event("change_tab", %{"tab" => tab}, socket) do
    {:noreply, assign(socket, tab: tab, lore_saved: false, editing_term: nil) |> load_tab()}
  end

  def handle_event("toggle_setting", %{"key" => key}, socket) do
    current =
      Enum.find(socket.assigns.settings, fn s -> s["setting_key"] == key end)

    new_val =
      if current && current["setting_value"] in ["true", "1"], do: "false", else: "true"

    case Repo.query("UPDATE system_settings SET setting_value = ? WHERE setting_key = ?", [new_val, key]) do
      {:ok, _} -> {:noreply, load_tab(socket)}
      _ -> {:noreply, put_flash(socket, :error, "Failed to update setting.")}
    end
  end

  def handle_event("update_setting", %{"key" => key, "value" => value}, socket) do
    case Repo.query("UPDATE system_settings SET setting_value = ? WHERE setting_key = ?", [value, key]) do
      {:ok, _} -> {:noreply, load_tab(socket)}
      _ -> {:noreply, put_flash(socket, :error, "Failed to update setting.")}
    end
  end

  def handle_event("edit_term", %{"id" => id}, socket) do
    {:noreply, assign(socket, editing_term: to_int(id))}
  end

  def handle_event("cancel_edit", _params, socket) do
    {:noreply, assign(socket, editing_term: nil)}
  end

  def handle_event("save_term", %{"term_id" => id, "display_name" => display_name}, socket) do
    case Repo.query("UPDATE game_terminology SET display_name = ? WHERE id = ?", [display_name, to_int(id)]) do
      {:ok, _} -> {:noreply, assign(socket, editing_term: nil) |> load_tab()}
      _ -> {:noreply, put_flash(socket, :error, "Failed to update term.")}
    end
  end

  def handle_event("update_lore", %{"lore" => lore}, socket) do
    {:noreply, assign(socket, lore: lore, lore_saved: false)}
  end

  def handle_event("save_lore", _params, socket) do
    lore = socket.assigns.lore

    result =
      case Repo.query("SELECT COUNT(*) FROM system_settings WHERE setting_key = 'world_forge_lore_bible'") do
        {:ok, %{rows: [[0]]}} ->
          Repo.query("INSERT INTO system_settings (setting_key, setting_value) VALUES ('world_forge_lore_bible', ?)", [lore])

        _ ->
          Repo.query("UPDATE system_settings SET setting_value = ? WHERE setting_key = 'world_forge_lore_bible'", [lore])
      end

    case result do
      {:ok, _} -> {:noreply, assign(socket, lore_saved: true) |> put_flash(:info, "Lore bible saved.")}
      _ -> {:noreply, put_flash(socket, :error, "Failed to save lore bible.")}
    end
  end

  # ── Data Loading ──────────────────────────────────────────────────

  defp load_tab(%{assigns: %{tab: "battle"}} = socket), do: load_battle(socket)
  defp load_tab(%{assigns: %{tab: "terminology"}} = socket), do: load_terminology(socket)
  defp load_tab(%{assigns: %{tab: "lore"}} = socket), do: load_lore(socket)
  defp load_tab(socket), do: socket

  defp load_battle(socket) do
    settings =
      case Repo.query(
             "SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'enable_%' OR setting_key LIKE 'battle_%' OR setting_key LIKE 'combat_%' ORDER BY setting_key"
           ) do
        {:ok, %{rows: r, columns: c}} -> to_maps(r, c)
        _ -> []
      end

    grouped =
      Enum.group_by(settings, fn s ->
        key = s["setting_key"] || ""
        cond do
          String.starts_with?(key, "enable_") -> "enable"
          String.starts_with?(key, "battle_") -> "battle"
          String.starts_with?(key, "combat_") -> "combat"
          true -> "other"
        end
      end)

    assign(socket, settings: settings, grouped_settings: grouped)
  end

  defp load_terminology(socket) do
    terms =
      case Repo.query("SELECT id, term_key, display_name, description, category FROM game_terminology ORDER BY category, term_key") do
        {:ok, %{rows: r, columns: c}} -> to_maps(r, c)
        _ -> load_terminology_fallback()
      end

    assign(socket, terms: terms)
  end

  defp load_terminology_fallback do
    case Repo.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'term_%' ORDER BY setting_key") do
      {:ok, %{rows: r, columns: c}} ->
        to_maps(r, c)
        |> Enum.map(fn s ->
          %{"id" => nil, "term_key" => s["setting_key"], "display_name" => s["setting_value"], "description" => "", "category" => "system_settings"}
        end)

      _ ->
        []
    end
  end

  defp load_lore(socket) do
    lore =
      case Repo.query("SELECT setting_value FROM system_settings WHERE setting_key='world_forge_lore_bible'") do
        {:ok, %{rows: [[val]]}} when is_binary(val) -> val
        _ -> ""
      end

    assign(socket, lore: lore, lore_saved: false)
  end

  # ── Render ────────────────────────────────────────────────────────

  @impl true
  def render(assigns) do
    ~H"""
    <div>
      <h2 class="text-2xl font-bold text-amber-400 mb-6">Config Hub</h2>

      <!-- Tab Bar -->
      <div class="flex gap-1 mb-6 border-b border-zinc-800 pb-3">
        <button :for={t <- @tabs} phx-click="change_tab" phx-value-tab={t}
          class={["px-3 py-1.5 rounded-t text-sm font-medium transition-colors",
            @tab == t && "bg-amber-600 text-white",
            @tab != t && "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"]}>
          {String.capitalize(t)}
        </button>
      </div>

      {render_tab(assigns)}
    </div>
    """
  end

  defp render_tab(%{tab: "battle"} = assigns) do
    ~H"""
    <div class="space-y-6">
      <div :for={{group, items} <- @grouped_settings} class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 class="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-4">{group} settings</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div :for={s <- items} class="flex items-center justify-between px-3 py-2.5 bg-zinc-950 rounded-lg border border-zinc-800">
            <span class="text-sm text-zinc-300 font-mono">{s["setting_key"]}</span>
            <%= if is_boolean_setting(s["setting_value"]) do %>
              <button phx-click="toggle_setting" phx-value-key={s["setting_key"]}
                class={["relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  s["setting_value"] in ["true", "1"] && "bg-amber-600",
                  s["setting_value"] not in ["true", "1"] && "bg-zinc-700"]}>
                <span class={["inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  s["setting_value"] in ["true", "1"] && "translate-x-6",
                  s["setting_value"] not in ["true", "1"] && "translate-x-1"]} />
              </button>
            <% else %>
              <form phx-change="update_setting" class="flex items-center gap-2">
                <input type="hidden" name="key" value={s["setting_key"]} />
                <input type="text" name="value" value={s["setting_value"]}
                  phx-debounce="500"
                  class="w-24 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 text-right focus:border-amber-500 focus:outline-none" />
              </form>
            <% end %>
          </div>
        </div>
      </div>
      <div :if={@settings == []} class="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-600 text-sm">
        No battle settings found
      </div>
    </div>
    """
  end

  defp render_tab(%{tab: "terminology"} = assigns) do
    ~H"""
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-zinc-800 text-left">
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Key</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Display Name</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Description</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Category</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-20">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr :for={t <- @terms} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
            <td class="px-3 py-2 text-sm text-zinc-400 font-mono">{t["term_key"] || t["setting_key"]}</td>
            <td class="px-3 py-2 text-sm">
              <%= if @editing_term == t["id"] and t["id"] != nil do %>
                <form phx-submit="save_term" class="flex items-center gap-2">
                  <input type="hidden" name="term_id" value={t["id"]} />
                  <input type="text" name="display_name" value={t["display_name"]}
                    autofocus
                    class="w-full px-2 py-1 bg-zinc-950 border border-amber-500 rounded text-sm text-zinc-200 focus:outline-none" />
                  <button type="submit" class="text-xs px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-500">Save</button>
                  <button type="button" phx-click="cancel_edit" class="text-xs px-2 py-1 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600">Cancel</button>
                </form>
              <% else %>
                <span class="text-zinc-200 cursor-pointer hover:text-amber-400 transition-colors"
                  phx-click={if t["id"], do: "edit_term", else: nil}
                  phx-value-id={t["id"]}>{t["display_name"] || t["setting_value"]}</span>
              <% end %>
            </td>
            <td class="px-3 py-2 text-sm text-zinc-500 max-w-[250px] truncate">{t["description"]}</td>
            <td class="px-3 py-2 text-sm text-zinc-500">{t["category"]}</td>
            <td class="px-3 py-2">
              <button :if={t["id"] != nil and @editing_term != t["id"]}
                phx-click="edit_term" phx-value-id={t["id"]}
                class="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors">
                Edit
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div :if={@terms == []} class="p-8 text-center text-zinc-600 text-sm">No terminology entries found</div>
    </div>
    """
  end

  defp render_tab(%{tab: "lore"} = assigns) do
    ~H"""
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-3xl">
      <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-2">World Forge Lore Bible</h3>
      <p class="text-xs text-zinc-600 mb-4">This lore is injected into all World Forge AI prompts as canonical truth.</p>

      <form phx-submit="save_lore" phx-change="update_lore" class="space-y-4">
        <textarea
          name="lore"
          rows="20"
          phx-debounce="300"
          placeholder="Write your world's canonical lore here..."
          class="w-full px-4 py-3 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:outline-none resize-y font-mono leading-relaxed"
        >{@lore}</textarea>

        <div class="flex items-center justify-between">
          <span class="text-xs text-zinc-600">{String.length(@lore)} characters</span>
          <div class="flex items-center gap-3">
            <span :if={@lore_saved} class="text-xs text-emerald-400">Saved</span>
            <button type="submit"
              class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded transition-colors">
              Save Lore Bible
            </button>
          </div>
        </div>
      </form>
    </div>
    """
  end

  defp render_tab(assigns) do
    ~H"""
    <div class="p-8 text-center text-zinc-600 text-sm">Unknown tab</div>
    """
  end

  # ── Helpers ───────────────────────────────────────────────────────

  defp is_boolean_setting(val) when val in ["true", "false", "1", "0"], do: true
  defp is_boolean_setting(_), do: false

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
