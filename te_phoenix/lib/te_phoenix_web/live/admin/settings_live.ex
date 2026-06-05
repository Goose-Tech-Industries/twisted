defmodule TePhoenixWeb.Admin.SettingsLive do
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket,
      active_tab: :settings,
      settings: [],
      categories: [],
      active_category: nil,
      search: "",
      editing_key: nil,
      edit_value: "",
      revealed_keys: MapSet.new()
    ) |> load_settings()}
  end

  defp load_settings(socket) do
    system = case Repo.query("SELECT setting_key, setting_value, description, updated_at FROM system_settings ORDER BY setting_key") do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    game = case Repo.query("SELECT setting_key, setting_value, description, updated_at FROM game_settings ORDER BY setting_key") do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    # Merge: game_settings overrides system_settings for same key
    merged = Map.merge(
      Map.new(system, fn s -> {s["setting_key"], s} end),
      Map.new(game, fn s -> {s["setting_key"], s} end)
    ) |> Map.values() |> Enum.sort_by(& &1["setting_key"])

    # Derive pseudo-category from key prefix (before first underscore)
    settings = Enum.map(merged, fn s ->
      prefix = case String.split(to_string(s["setting_key"]), "_", parts: 2) do
        [p, _rest] -> p
        [p] -> p
      end
      Map.put(s, "category", prefix)
    end)

    categories = settings |> Enum.map(& &1["category"]) |> Enum.uniq() |> Enum.sort()

    assign(socket, settings: settings, categories: categories)
  end

  @impl true
  def handle_event("filter_category", %{"category" => cat}, socket) do
    active = if cat == "" or cat == socket.assigns.active_category, do: nil, else: cat
    {:noreply, assign(socket, active_category: active)}
  end

  def handle_event("search", %{"search" => search}, socket) do
    {:noreply, assign(socket, search: search)}
  end

  def handle_event("edit", %{"key" => key}, socket) do
    setting = Enum.find(socket.assigns.settings, & &1["setting_key"] == key)
    value = if setting, do: to_string(setting["setting_value"] || ""), else: ""
    {:noreply, assign(socket, editing_key: key, edit_value: value)}
  end

  def handle_event("cancel_edit", _params, socket) do
    {:noreply, assign(socket, editing_key: nil, edit_value: "")}
  end

  def handle_event("update_edit", %{"value" => value}, socket) do
    {:noreply, assign(socket, edit_value: value)}
  end

  def handle_event("reveal", %{"key" => key}, socket) do
    {:noreply, assign(socket, revealed_keys: MapSet.put(socket.assigns.revealed_keys, key))}
  end

  def handle_event("hide", %{"key" => key}, socket) do
    {:noreply, assign(socket, revealed_keys: MapSet.delete(socket.assigns.revealed_keys, key))}
  end

  def handle_event("save", %{"key" => key}, socket) do
    value = socket.assigns.edit_value

    # Try system_settings first, then game_settings
    result = case Repo.query("UPDATE system_settings SET setting_value=? WHERE setting_key=?", [value, key]) do
      {:ok, %{num_rows: n}} when n > 0 -> :ok
      _ ->
        case Repo.query("UPDATE game_settings SET setting_value=? WHERE setting_key=?", [value, key]) do
          {:ok, %{num_rows: n}} when n > 0 -> :ok
          _ -> :error
        end
    end

    case result do
      :ok ->
        {:noreply, socket
          |> put_flash(:info, "Setting '#{key}' updated.")
          |> assign(editing_key: nil, edit_value: "")
          |> load_settings()}

      :error ->
        {:noreply, put_flash(socket, :error, "Failed to update setting.")}
    end
  end

  defp filtered_settings(settings, category, search) do
    settings
    |> then(fn s ->
      if category, do: Enum.filter(s, & &1["category"] == category), else: s
    end)
    |> then(fn s ->
      if search != "" do
        q = String.downcase(search)
        Enum.filter(s, fn setting ->
          key = to_string(setting["setting_key"] || "")
          val = to_string(setting["setting_value"] || "")
          String.contains?(String.downcase(key), q) or
            (not sensitive?(key) and String.contains?(String.downcase(val), q))
        end)
      else
        s
      end
    end)
  end

  # Settings whose value should be masked by default. Suffix-based detection
  # so future _api_key / _secret / _token / _password settings inherit masking
  # automatically without code changes.
  defp sensitive?(key) when is_binary(key) do
    k = String.downcase(key)
    String.ends_with?(k, "_api_key") or
      String.ends_with?(k, "_secret") or
      String.ends_with?(k, "_token") or
      String.ends_with?(k, "_password") or
      String.contains?(k, "private_key")
  end
  defp sensitive?(_), do: false

  defp mask_value(nil), do: ""
  defp mask_value(""), do: ""
  defp mask_value(_val), do: "••••••••••••"

  @impl true
  def render(assigns) do
    assigns = assign(assigns, :filtered, filtered_settings(assigns.settings, assigns.active_category, assigns.search))

    ~H"""
    <div>
      <h2 class="text-2xl font-bold text-amber-400 mb-6">System Settings</h2>

      <!-- Controls -->
      <div class="flex items-center gap-3 mb-6 flex-wrap">
        <input type="text" value={@search} phx-keyup="search" phx-key="Enter" name="search"
          placeholder="Search settings..."
          class="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 w-64 focus:border-amber-500 focus:outline-none"
          phx-debounce="300" />

        <div class="flex gap-1.5 flex-wrap">
          <button :for={cat <- @categories}
            phx-click="filter_category" phx-value-category={cat}
            class={[
              "px-2.5 py-1 rounded text-xs font-medium transition-colors",
              @active_category == cat && "bg-amber-600 text-white",
              @active_category != cat && "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            ]}>
            {cat}
          </button>
        </div>

        <span class="text-xs text-zinc-600 ml-auto">{length(@filtered)} settings</span>
      </div>

      <!-- Settings Table -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-zinc-800 text-left">
              <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Key</th>
              <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Value</th>
              <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Group</th>
              <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-20">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr :for={setting <- @filtered} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
              <td class="px-4 py-2.5 text-sm font-mono text-amber-400/80">{setting["setting_key"]}</td>
              <td class="px-4 py-2.5 text-sm text-zinc-300 max-w-md">
                <div :if={@editing_key == setting["setting_key"]}>
                  <form phx-submit="save" phx-value-key={setting["setting_key"]} class="flex gap-2">
                    <input
                      type={if sensitive?(setting["setting_key"]) and not MapSet.member?(@revealed_keys, setting["setting_key"]), do: "password", else: "text"}
                      name="value" value={@edit_value} phx-keyup="update_edit" phx-value-value={@edit_value}
                      class="flex-1 px-2 py-1 bg-zinc-800 border border-amber-600 rounded text-sm text-zinc-200 focus:outline-none"
                      autocomplete="off"
                      autofocus />
                    <button type="submit" class="px-2 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-xs">Save</button>
                    <button type="button" phx-click="cancel_edit" class="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-xs">Cancel</button>
                  </form>
                </div>
                <div :if={@editing_key != setting["setting_key"]} class="flex items-center gap-2">
                  <%= cond do %>
                    <% sensitive?(setting["setting_key"]) and not MapSet.member?(@revealed_keys, setting["setting_key"]) -> %>
                      <span class="font-mono text-zinc-500 tracking-widest">{mask_value(setting["setting_value"])}</span>
                      <button type="button" phx-click="reveal" phx-value-key={setting["setting_key"]}
                        class="text-[10px] px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded">Reveal</button>
                    <% sensitive?(setting["setting_key"]) -> %>
                      <span class="truncate block font-mono text-amber-300/80">{truncate(setting["setting_value"])}</span>
                      <button type="button" phx-click="hide" phx-value-key={setting["setting_key"]}
                        class="text-[10px] px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded">Hide</button>
                    <% true -> %>
                      <span class="truncate block">{truncate(setting["setting_value"])}</span>
                  <% end %>
                </div>
              </td>
              <td class="px-4 py-2.5">
                <span class="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-500">{setting["category"]}</span>
              </td>
              <td class="px-4 py-2.5">
                <button :if={@editing_key != setting["setting_key"]}
                  phx-click="edit" phx-value-key={setting["setting_key"]}
                  class="text-xs text-amber-500 hover:text-amber-400">Edit</button>
              </td>
            </tr>
          </tbody>
        </table>

        <div :if={@filtered == []} class="p-8 text-center text-zinc-600 text-sm">No settings found</div>
      </div>
    </div>
    """
  end

  defp truncate(nil), do: ""
  defp truncate(val) do
    s = to_string(val)
    if String.length(s) > 80, do: String.slice(s, 0, 80) <> "...", else: s
  end
end
