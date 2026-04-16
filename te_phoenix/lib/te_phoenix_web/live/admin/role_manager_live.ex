defmodule TePhoenixWeb.Admin.RoleManagerLive do
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket,
      active_tab: :roles,
      roles: [],
      editing_id: nil,
      creating: false,
      form: default_form()
    ) |> load_roles()}
  end

  defp default_form do
    %{"name" => "", "display_name" => "", "color" => "", "weight" => "0",
      "can_custom_name" => "0", "is_staff" => "0", "is_premium" => "0", "badge_icon" => ""}
  end

  defp load_roles(socket) do
    roles = case Repo.query("SELECT * FROM game_roles ORDER BY weight DESC") do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    # Count users per role
    user_counts = case Repo.query("SELECT role, COUNT(*) FROM users GROUP BY role") do
      {:ok, %{rows: rows}} -> Map.new(rows, fn [r, c] -> {r, c} end)
      _ -> %{}
    end

    assign(socket, roles: roles, user_counts: user_counts)
  end

  @impl true
  def handle_event("toggle_create", _p, socket) do
    {:noreply, assign(socket, creating: !socket.assigns.creating, editing_id: nil, form: default_form())}
  end

  def handle_event("edit", %{"id" => id}, socket) do
    role = Enum.find(socket.assigns.roles, & &1["id"] == to_int(id))
    if role do
      form = %{
        "name" => role["name"] || "",
        "display_name" => role["display_name"] || "",
        "color" => role["color"] || "",
        "weight" => to_string(role["weight"] || 0),
        "can_custom_name" => to_string(role["can_custom_name"] || 0),
        "is_staff" => to_string(role["is_staff"] || 0),
        "is_premium" => to_string(role["is_premium"] || 0),
        "badge_icon" => role["badge_icon"] || ""
      }
      {:noreply, assign(socket, editing_id: to_int(id), creating: false, form: form)}
    else
      {:noreply, socket}
    end
  end

  def handle_event("cancel", _p, socket) do
    {:noreply, assign(socket, editing_id: nil, creating: false, form: default_form())}
  end

  def handle_event("form_change", params, socket) do
    {:noreply, assign(socket, :form, Map.merge(socket.assigns.form, params))}
  end

  def handle_event("save", params, socket) do
    form = Map.merge(socket.assigns.form, params)
    name = String.trim(form["name"] || "") |> String.upcase() |> String.replace(~r/[^A-Z0-9_]/, "")
    display = String.trim(form["display_name"] || "")

    if name == "" or display == "" do
      {:noreply, put_flash(socket, :error, "Name and display name required.")}
    else
      color = case String.trim(form["color"] || "") do
        "" -> nil
        c -> c
      end

      if socket.assigns.editing_id do
        Repo.query(
          "UPDATE game_roles SET display_name=?, color=?, weight=?, can_custom_name=?, is_staff=?, is_premium=?, badge_icon=? WHERE id=?",
          [display, color, to_int(form["weight"]), to_int(form["can_custom_name"]), to_int(form["is_staff"]),
           to_int(form["is_premium"]), form["badge_icon"], socket.assigns.editing_id]
        )
        {:noreply, socket |> put_flash(:info, "Role updated.") |> assign(editing_id: nil, form: default_form()) |> load_roles()}
      else
        case Repo.query(
          "INSERT INTO game_roles (name, display_name, color, weight, can_custom_name, is_staff, is_premium, badge_icon) VALUES (?,?,?,?,?,?,?,?)",
          [name, display, color, to_int(form["weight"]), to_int(form["can_custom_name"]),
           to_int(form["is_staff"]), to_int(form["is_premium"]), form["badge_icon"]]
        ) do
          {:ok, _} ->
            {:noreply, socket |> put_flash(:info, "Role '#{name}' created.") |> assign(creating: false, form: default_form()) |> load_roles()}
          _ ->
            {:noreply, put_flash(socket, :error, "Role already exists or DB error.")}
        end
      end
    end
  end

  def handle_event("delete", %{"id" => id}, socket) do
    # Don't allow deleting built-in roles
    role = Enum.find(socket.assigns.roles, & &1["id"] == to_int(id))
    if role && role["name"] in ~w(OWNER ADMIN PLAYER) do
      {:noreply, put_flash(socket, :error, "Cannot delete built-in role.")}
    else
      Repo.query("DELETE FROM game_roles WHERE id=?", [to_int(id)])
      {:noreply, socket |> put_flash(:info, "Role deleted.") |> load_roles()}
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-amber-400">Role Manager</h2>
        <button phx-click="toggle_create"
          class={"px-3 py-1.5 rounded text-xs font-medium transition-colors #{if @creating, do: "bg-zinc-700 text-zinc-300", else: "bg-amber-600 hover:bg-amber-500 text-white"}"}>
          {if @creating, do: "Cancel", else: "+ New Role"}
        </button>
      </div>

      <!-- Create/Edit Form -->
      <div :if={@creating || @editing_id} class="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4">
          {if @editing_id, do: "Edit Role", else: "Create New Role"}
        </h3>
        <form phx-submit="save" phx-change="form_change" class="space-y-3">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">System Name</label>
              <input type="text" name="name" value={@form["name"]} placeholder="PREMIUM"
                disabled={@editing_id != nil}
                class={"px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 w-full #{if @editing_id, do: "opacity-50"}"} />
            </div>
            <div>
              <label class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Display Name</label>
              <input type="text" name="display_name" value={@form["display_name"]} placeholder="Premium Member"
                class="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 w-full" />
            </div>
            <div>
              <label class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Badge Icon</label>
              <input type="text" name="badge_icon" value={@form["badge_icon"]} placeholder="⭐"
                class="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 w-full" />
            </div>
            <div>
              <label class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Weight (sort order)</label>
              <input type="number" name="weight" value={@form["weight"]}
                class="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 w-full" />
            </div>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Name Color/Gradient</label>
              <input type="text" name="color" value={@form["color"]} placeholder="#f87171 or gradient:..."
                class="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 w-full" />
            </div>
            <label class="flex items-center gap-2 py-2 cursor-pointer">
              <input type="hidden" name="can_custom_name" value="0" />
              <input type="checkbox" name="can_custom_name" value="1" checked={@form["can_custom_name"] == "1"}
                class="rounded bg-zinc-800 border-zinc-600" />
              <span class="text-xs text-zinc-300">Can Set Custom Name</span>
            </label>
            <label class="flex items-center gap-2 py-2 cursor-pointer">
              <input type="hidden" name="is_staff" value="0" />
              <input type="checkbox" name="is_staff" value="1" checked={@form["is_staff"] == "1"}
                class="rounded bg-zinc-800 border-zinc-600" />
              <span class="text-xs text-zinc-300">Is Staff</span>
            </label>
            <label class="flex items-center gap-2 py-2 cursor-pointer">
              <input type="hidden" name="is_premium" value="0" />
              <input type="checkbox" name="is_premium" value="1" checked={@form["is_premium"] == "1"}
                class="rounded bg-zinc-800 border-zinc-600" />
              <span class="text-xs text-zinc-300">Is Premium</span>
            </label>
          </div>

          <div class="flex gap-2">
            <button type="submit" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium">
              {if @editing_id, do: "Save Changes", else: "Create Role"}
            </button>
            <button type="button" phx-click="cancel" class="px-4 py-2 bg-zinc-700 text-zinc-300 rounded text-xs">Cancel</button>
          </div>
        </form>
      </div>

      <!-- Roles Table -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-zinc-800 text-left">
              <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Role</th>
              <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Display</th>
              <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Badge</th>
              <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Weight</th>
              <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Perms</th>
              <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Users</th>
              <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr :for={role <- @roles} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
              <td class="px-4 py-2.5">
                <.styled_name name={role["name"]} role={role["name"]} chat_color={role["color"]} class="text-sm font-mono font-bold" />
              </td>
              <td class="px-4 py-2.5 text-sm text-zinc-300">{role["display_name"]}</td>
              <td class="px-4 py-2.5 text-lg">{role["badge_icon"]}</td>
              <td class="px-4 py-2.5 text-sm text-zinc-400 font-mono">{role["weight"]}</td>
              <td class="px-4 py-2.5">
                <div class="flex gap-1 flex-wrap">
                  <span :if={role["can_custom_name"] == 1} class="text-[9px] px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-800/30">Custom Name</span>
                  <span :if={role["is_staff"] == 1} class="text-[9px] px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 border border-blue-800/30">Staff</span>
                  <span :if={role["is_premium"] == 1} class="text-[9px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400 border border-purple-800/30">Premium</span>
                </div>
              </td>
              <td class="px-4 py-2.5 text-sm text-zinc-500 font-mono">{Map.get(@user_counts, role["name"], 0)}</td>
              <td class="px-4 py-2.5">
                <div class="flex gap-2">
                  <button phx-click="edit" phx-value-id={role["id"]}
                    class="text-xs text-amber-500 hover:text-amber-400">Edit</button>
                  <button :if={role["name"] not in ~w(OWNER ADMIN PLAYER)}
                    phx-click="delete" phx-value-id={role["id"]}
                    data-confirm={"Delete role '#{role["name"]}'?"}
                    class="text-xs text-red-500 hover:text-red-400">Delete</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    """
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
