defmodule TePhoenixWeb.Admin.MapConnectionsLive do
  @moduledoc """
  Bird's-eye view of all TELEPORT events across every map.

  Reads `game_maps.collisions_json` for every map, picks out events with
  `kind == "TELEPORT"`, and groups them by source map. Each row shows
  source map, source coordinate, destination map (resolved to name), and
  destination coordinate. Useful for sanity-checking warps without opening
  the map editor on each end.

  Route: `/sauce/world/map-connections` (admin_sauce live_session).
  """
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:active_tab, :world)
     |> assign(:page_title, "Map Connections")
     |> assign(:groups, load_connections())}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="p-6 max-w-5xl mx-auto">
      <header class="mb-6">
        <a href={~p"/sauce/world"} class="text-[10px] text-zinc-500 hover:text-zinc-300">← Back to World</a>
        <h1 class="text-xl font-bold text-amber-400 mt-1">Map Connections</h1>
        <p class="text-xs text-zinc-500 mt-1">All teleport events across every map, grouped by source. {total_count(@groups)} total.</p>
      </header>

      <div :if={@groups == []} class="text-center text-zinc-500 text-sm py-12">
        No teleport events found in any map.
      </div>

      <div :for={group <- @groups} class="mb-6 bg-zinc-900/60 border border-zinc-800 rounded">
        <div class="px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
          <h2 class="text-sm font-bold text-amber-300">{group.map_name} <span class="text-zinc-500 font-normal">(#{group.map_id})</span></h2>
          <a href={~p"/sauce/world/maps/#{group.map_id}/edit"}
            class="text-[10px] text-amber-500 hover:text-amber-300">Open editor →</a>
        </div>
        <table class="w-full text-xs">
          <thead class="text-zinc-500 text-[10px] uppercase tracking-widest">
            <tr>
              <th class="text-left px-4 py-2">From</th>
              <th class="text-left px-4 py-2">→ Destination</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-800">
            <tr :for={warp <- group.warps} class="hover:bg-zinc-800/40">
              <td class="px-4 py-2 font-mono text-zinc-400">({warp.x}, {warp.y})</td>
              <td class="px-4 py-2">
                <span class="text-amber-400">{warp.dest_map_name || "map ##{warp.dest_map_id}"}</span>
                <span class="text-zinc-500"> ({warp.dest_x}, {warp.dest_y})</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    """
  end

  defp load_connections do
    case Repo.query("SELECT id, name, collisions_json FROM game_maps WHERE collisions_json IS NOT NULL AND collisions_json != ''") do
      {:ok, %{rows: rows}} ->
        name_lookup = Map.new(rows, fn [id, name, _] -> {id, name} end)

        rows
        |> Enum.map(fn [id, name, json] ->
          warps = parse_warps(json, name_lookup)
          %{map_id: id, map_name: name, warps: warps}
        end)
        |> Enum.filter(&(&1.warps != []))
        |> Enum.sort_by(& &1.map_name)

      _ ->
        []
    end
  rescue
    _ -> []
  end

  defp parse_warps(json, name_lookup) do
    case Jason.decode(json) do
      {:ok, list} when is_list(list) ->
        list
        |> Enum.filter(&teleport?/1)
        |> Enum.map(fn ev ->
          {dest_map_id, dx, dy} = parse_teleport_data(ev["data"])

          %{
            x: ev["x"],
            y: ev["y"],
            dest_map_id: dest_map_id,
            dest_x: dx,
            dest_y: dy,
            dest_map_name: Map.get(name_lookup, dest_map_id)
          }
        end)

      _ ->
        []
    end
  end

  defp teleport?(%{"kind" => "TELEPORT"}), do: true
  defp teleport?(%{"type" => "TELEPORT"}), do: true
  defp teleport?(_), do: false

  defp parse_teleport_data(data) when is_binary(data) do
    case String.split(data, ",") do
      [m, x, y] ->
        {to_int(m), to_int(x), to_int(y)}

      _ ->
        {nil, 0, 0}
    end
  end

  defp parse_teleport_data(%{"map_id" => m, "x" => x, "y" => y}), do: {m, x, y}
  defp parse_teleport_data(_), do: {nil, 0, 0}

  defp to_int(v) when is_integer(v), do: v

  defp to_int(v) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      _ -> 0
    end
  end

  defp to_int(_), do: 0

  defp total_count(groups), do: groups |> Enum.map(&length(&1.warps)) |> Enum.sum()
end
