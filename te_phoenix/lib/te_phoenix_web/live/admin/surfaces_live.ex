defmodule TePhoenixWeb.Admin.SurfacesLive do
  @moduledoc """
  No-code editor for battle surface type definitions (`/sauce/combat/surfaces`).

  Every surface in the engine — fire, ice, oil, poison cloud, electrified
  water, blessed ground, and anything the user invents — is a row in
  `game_surface_defs` and is edited here. The battle pipeline reads
  definitions at runtime via `Surfaces.get_def/1`; saves here go live
  immediately.
  """
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo

  @defs_table "game_surface_defs"

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:active_tab, :combat)
     |> assign(:page_title, "Surface Types")
     |> assign(:surfaces, list_surfaces())
     |> assign(:editing, nil)
     |> assign(:flash_msg, nil)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="p-6 max-w-6xl mx-auto">
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-amber-400">Surface Types</h1>
          <p class="text-xs text-zinc-500 mt-1">
            <%= length(@surfaces) %> surface types defined. Fire, ice, oil, poison — all data-driven.
          </p>
        </div>
        <button phx-click="new" class="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm font-bold">
          + New Surface
        </button>
      </header>

      <div :if={@flash_msg} class="mb-4 p-3 bg-emerald-900/40 border border-emerald-700 text-emerald-200 text-sm rounded">
        <%= @flash_msg %>
      </div>

      <div :if={@editing} class="mb-6 p-4 border border-amber-700 rounded bg-zinc-950">
        <form phx-submit="save" class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="text-xs text-zinc-400">Key (unique id)</span>
              <input name="key" value={@editing["key"]} required
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Display Name</span>
              <input name="name" value={@editing["name"]}
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Icon</span>
              <input name="icon" value={@editing["icon"]}
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Visual</span>
              <input name="visual" value={@editing["visual"]}
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Damage Per Turn</span>
              <input name="damage_per_turn" type="number" value={@editing["damage_per_turn"]}
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Damage Type</span>
              <input name="damage_type" value={@editing["damage_type"]}
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Status On Enter (status key)</span>
              <input name="status_on_enter" value={@editing["status_on_enter"]}
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Duration (turns)</span>
              <input name="duration_turns" type="number" value={@editing["duration_turns"]}
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Spread To (comma-separated surface keys)</span>
              <input name="spread_to" value={@editing["spread_to"]}
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono" />
            </label>
            <label class="flex items-center gap-2 mt-4">
              <input type="checkbox" name="blocks_movement" value="1" checked={@editing["blocks_movement"] == true} />
              <span class="text-xs text-zinc-400">Blocks Movement</span>
            </label>
          </div>

          <.live_component module={TePhoenixWeb.Components.RuleBuilder} id="surf_reacts" field_name="reacts_with_json" schema={:surface_reaction} label="Reacts With" value={@editing["reacts_with_json"]} />

          <div class="flex gap-2 pt-2">
            <button type="submit" class="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm font-bold">
              Save
            </button>
            <button type="button" phx-click="cancel"
              class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-sm">
              Cancel
            </button>
          </div>
        </form>
      </div>

      <table class="w-full text-sm border-collapse">
        <thead class="text-zinc-500 text-xs">
          <tr class="border-b border-zinc-800">
            <th class="text-left py-2">Icon</th>
            <th class="text-left py-2">Key</th>
            <th class="text-left py-2">Name</th>
            <th class="text-left py-2">Dmg/Turn</th>
            <th class="text-left py-2">Type</th>
            <th class="text-left py-2">Status</th>
            <th class="text-left py-2">Duration</th>
            <th class="text-left py-2">Blocks</th>
            <th class="text-right py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          <%= for s <- @surfaces do %>
            <tr class="border-b border-zinc-900 hover:bg-zinc-900/40">
              <td class="py-2"><%= s.icon %></td>
              <td class="py-2 font-mono text-xs text-zinc-400"><%= s.key %></td>
              <td class="py-2"><%= s.name %></td>
              <td class="py-2 text-xs text-zinc-500"><%= s.damage_per_turn %></td>
              <td class="py-2 text-xs text-zinc-500"><%= s.damage_type %></td>
              <td class="py-2 text-xs font-mono text-zinc-500"><%= s.status_on_enter || "-" %></td>
              <td class="py-2 text-xs text-zinc-500"><%= s.duration_turns %></td>
              <td class="py-2 text-xs text-zinc-500"><%= if s.blocks_movement, do: "yes", else: "-" %></td>
              <td class="py-2 text-right">
                <button phx-click="edit" phx-value-key={s.key}
                  class="text-xs text-amber-400 hover:underline mr-3">edit</button>
                <button phx-click="delete" phx-value-key={s.key}
                  data-confirm={"Delete surface #{s.key}?"}
                  class="text-xs text-red-400 hover:underline">delete</button>
              </td>
            </tr>
          <% end %>
        </tbody>
      </table>
    </div>
    """
  end

  # ── Events ──

  @impl true
  def handle_event("new", _, socket) do
    {:noreply, assign(socket, :editing, blank())}
  end

  def handle_event("edit", %{"key" => key}, socket) do
    case get_surface(key) do
      nil -> {:noreply, socket}
      s -> {:noreply, assign(socket, :editing, surface_to_form(s))}
    end
  end

  def handle_event("cancel", _, socket), do: {:noreply, assign(socket, :editing, nil)}

  def handle_event("delete", %{"key" => key}, socket) do
    Repo.query("DELETE FROM #{@defs_table} WHERE `key` = ?", [key])

    {:noreply,
     socket
     |> assign(:surfaces, list_surfaces())
     |> assign(:flash_msg, "Deleted #{key}")}
  end

  def handle_event("save", params, socket) do
    s = form_to_surface(params)

    Repo.query(
      """
      INSERT INTO #{@defs_table}
        (`key`, name, icon, damage_per_turn, damage_type, status_on_enter,
         duration_turns, spread_to_json, reacts_with_json, blocks_movement, visual, enabled, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,1,NOW())
      ON DUPLICATE KEY UPDATE
        name=VALUES(name), icon=VALUES(icon), damage_per_turn=VALUES(damage_per_turn),
        damage_type=VALUES(damage_type), status_on_enter=VALUES(status_on_enter),
        duration_turns=VALUES(duration_turns), spread_to_json=VALUES(spread_to_json),
        reacts_with_json=VALUES(reacts_with_json), blocks_movement=VALUES(blocks_movement),
        visual=VALUES(visual), updated_at=NOW()
      """,
      [
        s.key, s.name, s.icon, s.damage_per_turn, s.damage_type,
        s.status_on_enter, s.duration_turns,
        Jason.encode!(s.spread_to), Jason.encode!(s.reacts_with),
        if(s.blocks_movement, do: 1, else: 0), s.visual
      ]
    )

    {:noreply,
     socket
     |> assign(:editing, nil)
     |> assign(:surfaces, list_surfaces())
     |> assign(:flash_msg, "Saved #{s.key}")}
  end

  # ── Data access ──

  defp list_surfaces do
    case Repo.query(
           "SELECT `key`, name, icon, damage_per_turn, damage_type, status_on_enter, duration_turns, spread_to_json, reacts_with_json, blocks_movement, visual FROM #{@defs_table} WHERE enabled = 1 ORDER BY `key`"
         ) do
      {:ok, %{rows: rows}} -> Enum.map(rows, &parse_row/1)
      _ -> []
    end
  rescue
    _ -> []
  end

  defp get_surface(key) do
    case Repo.query(
           "SELECT `key`, name, icon, damage_per_turn, damage_type, status_on_enter, duration_turns, spread_to_json, reacts_with_json, blocks_movement, visual FROM #{@defs_table} WHERE `key` = ?",
           [key]
         ) do
      {:ok, %{rows: [row]}} -> parse_row(row)
      _ -> nil
    end
  rescue
    _ -> nil
  end

  defp parse_row([key, name, icon, dmg, dtype, status, dur, spread_j, react_j, blocks, visual]) do
    %{
      key: key,
      name: name,
      icon: icon || "🔥",
      damage_per_turn: dmg || 0,
      damage_type: dtype || "fire",
      status_on_enter: status,
      duration_turns: dur || 3,
      spread_to: decode_list(spread_j),
      reacts_with: decode_map(react_j),
      blocks_movement: blocks == 1 or blocks == true,
      visual: visual || "default"
    }
  end

  # ── Form helpers ──

  defp blank do
    %{
      "key" => "",
      "name" => "",
      "icon" => "🔥",
      "damage_per_turn" => 0,
      "damage_type" => "fire",
      "status_on_enter" => "",
      "duration_turns" => 3,
      "spread_to" => "",
      "blocks_movement" => false,
      "reacts_with_json" => "{}",
      "visual" => "default"
    }
  end

  defp surface_to_form(s) do
    %{
      "key" => s.key,
      "name" => s.name,
      "icon" => s.icon,
      "damage_per_turn" => s.damage_per_turn,
      "damage_type" => s.damage_type || "",
      "status_on_enter" => s.status_on_enter || "",
      "duration_turns" => s.duration_turns,
      "spread_to" => Enum.join(s.spread_to, ","),
      "blocks_movement" => s.blocks_movement,
      "reacts_with_json" => Jason.encode!(s.reacts_with),
      "visual" => s.visual || "default"
    }
  end

  defp form_to_surface(p) do
    %{
      key: p["key"] || "",
      name: p["name"] || "",
      icon: p["icon"] || "🔥",
      damage_per_turn: to_int(p["damage_per_turn"], 0),
      damage_type: empty_to_nil(p["damage_type"]),
      status_on_enter: empty_to_nil(p["status_on_enter"]),
      duration_turns: to_int(p["duration_turns"], 3),
      spread_to: parse_csv(p["spread_to"]),
      reacts_with: decode_map(p["reacts_with_json"]),
      blocks_movement: p["blocks_movement"] == "1",
      visual: p["visual"] || "default"
    }
  end

  defp parse_csv(nil), do: []
  defp parse_csv(""), do: []

  defp parse_csv(s) when is_binary(s) do
    s
    |> String.split(",")
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
  end

  defp empty_to_nil(nil), do: nil
  defp empty_to_nil(""), do: nil
  defp empty_to_nil(s), do: s

  defp to_int(nil, d), do: d
  defp to_int("", d), do: d
  defp to_int(s, d) when is_binary(s), do: case(Integer.parse(s), do: ({i, _} -> i; _ -> d))
  defp to_int(i, _) when is_integer(i), do: i
  defp to_int(_, d), do: d

  defp decode_map(nil), do: %{}
  defp decode_map(""), do: %{}
  defp decode_map(s) when is_binary(s), do: case(Jason.decode(s), do: ({:ok, %{} = m} -> m; _ -> %{}))
  defp decode_map(m) when is_map(m), do: m
  defp decode_map(_), do: %{}

  defp decode_list(nil), do: []
  defp decode_list(""), do: []
  defp decode_list(s) when is_binary(s), do: case(Jason.decode(s), do: ({:ok, l} when is_list(l) -> l; _ -> []))
  defp decode_list(l) when is_list(l), do: l
  defp decode_list(_), do: []
end
