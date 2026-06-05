defmodule TePhoenix.Game.MapData do
  @moduledoc """
  Cached map data loader. Replaces Node.js state.getMapData + mapCache.
  Uses ETS for fast lookups, loads from DB on cache miss.

  Map data includes: tiles, passability, events, objects, dimensions,
  neighbors, spawn points, fast_travel_enabled, etc.
  """

  use GenServer
  require Logger

  alias TePhoenix.Repo

  @table :map_data_cache
  @ttl_ms 300_000  # 5 minute cache TTL

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  @impl true
  def init(_) do
    :ets.new(@table, [:named_table, :public, :set, read_concurrency: true])
    Phoenix.PubSub.subscribe(TePhoenix.PubSub, "map:saved")
    {:ok, %{}}
  end

  @impl true
  def handle_info({:map_saved, map_id}, state) when is_integer(map_id) do
    :ets.delete(@table, map_id)
    {:noreply, state}
  end

  def handle_info(_, state), do: {:noreply, state}

  @doc "Get map data by map_id. Loads from DB on cache miss."
  def get(map_id) when is_integer(map_id) do
    case :ets.lookup(@table, map_id) do
      [{_, %{data: data, loaded_at: loaded_at}}] ->
        if System.system_time(:millisecond) - loaded_at < @ttl_ms do
          data
        else
          load_and_cache(map_id)
        end
      [] ->
        load_and_cache(map_id)
    end
  end
  def get(_), do: nil

  @doc "Invalidate cache for a map (after admin edit)."
  def invalidate(map_id) do
    :ets.delete(@table, map_id)
    :ok
  end

  @doc "Get NPCs for a map from DB."
  def get_npcs(map_id) do
    case Repo.query(
      "SELECT n.id, n.name, n.char_id, n.x, n.y, n.icon, n.persona, n.is_enemy, n.is_recruitable, n.shop_id, n.script_key, n.quest_offers, n.npc_type, n.recruit_rep_req, n.recruit_quest_req FROM game_npcs n WHERE n.map_id=? AND n.is_active=1 AND (n.is_dead IS NULL OR n.is_dead=0)",
      [map_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row ->
          npc = Enum.zip(cols, row) |> Map.new()
          # Parse quest_offers JSON
          quest_offers = case npc["quest_offers"] do
            nil -> []
            "" -> []
            json when is_binary(json) ->
              case Jason.decode(json) do
                {:ok, list} when is_list(list) -> list
                _ -> []
              end
            list when is_list(list) -> list
            _ -> []
          end
          Map.put(npc, "quest_offers", quest_offers)
        end)
      _ -> []
    end
  end

  @doc "Get region data for a map."
  def get_region(map_id) do
    case Repo.query(
      "SELECT r.* FROM game_regions r JOIN game_maps m ON m.region_id=r.id WHERE m.id=?",
      [map_id]
    ) do
      {:ok, %{rows: [row], columns: cols}} ->
        Enum.zip(cols, row) |> Map.new()
      _ -> nil
    end
  end

  # ── Private ─────────────────────────────────────────────────────

  defp load_and_cache(map_id) do
    case Repo.query("SELECT * FROM game_maps WHERE id=?", [map_id]) do
      {:ok, %{rows: [row], columns: cols}} ->
        raw = Enum.zip(cols, row) |> Map.new()
        w = raw["width"] || 20
        h = raw["height"] || 20

        layers = parse_layers(raw["layers_json"], raw["tiles_json"], w, h)
        ground = pad_to(Map.get(layers, "ground", []), w * h, 0)
        pass =
          case Map.get(layers, "passability") do
            list when is_list(list) and list != [] -> pad_to(list, w * h, 0)
            _ -> parse_json_field(raw["passability_json"], [])
          end

        data = %{
          id: raw["id"],
          name: raw["name"],
          width: w,
          height: h,
          layers: layers,
          tiles: ground,
          passability: pass,
          events: parse_json_field(raw["collisions_json"], []),
          objects: parse_json_field(raw["objects_json"], []),
          spawn_x: raw["spawn_x"],
          spawn_y: raw["spawn_y"],
          neighbor_north: raw["neighbor_north"],
          neighbor_south: raw["neighbor_south"],
          neighbor_east: raw["neighbor_east"],
          neighbor_west: raw["neighbor_west"],
          fast_travel_enabled: raw["fast_travel_enabled"] == 1 or raw["fast_travel_enabled"] == true,
          zone_type: raw["zone_type"] || "WORLD",
          floor_number: raw["floor_number"],
          dungeon_name: raw["dungeon_name"],
          render_mode: raw["render_mode"] || "classic",
          background_image: raw["background_image"],
          ambient_sound: raw["ambient_sound"],
          weather: raw["weather"],
          region_id: raw["region_id"]
        }

        :ets.insert(@table, {map_id, %{data: data, loaded_at: System.system_time(:millisecond)}})
        data

      _ -> nil
    end
  end

  defp parse_json_field(nil, default), do: default
  defp parse_json_field("", default), do: default
  defp parse_json_field(val, default) when is_binary(val) do
    case Jason.decode(val) do
      {:ok, parsed} -> parsed
      _ -> default
    end
  end
  defp parse_json_field(val, _default) when is_list(val) or is_map(val), do: val
  defp parse_json_field(_, default), do: default

  # Schema-2 maps store layers as `{"schema_version":2,"layers":{ground,overlay,passability,fringe,elevation}}`.
  # Schema-1 maps store a 2D `tiles_json` (number[][]) and a separate `passability_json`.
  # This unifies both into a flat-array layers map keyed by layer name.
  defp parse_layers(layers_json, tiles_json, w, h) do
    decoded =
      case parse_json_field(layers_json, nil) do
        %{"layers" => l} when is_map(l) -> l
        l when is_map(l) -> l
        _ -> nil
      end

    cond do
      is_map(decoded) ->
        %{
          "ground" => pad_to(Map.get(decoded, "ground", []), w * h, 0),
          "overlay" => pad_to(Map.get(decoded, "overlay", []), w * h, -1),
          "passability" => pad_to(Map.get(decoded, "passability", []), w * h, 0),
          "fringe" => pad_to(Map.get(decoded, "fringe", []), w * h, -1),
          "elevation" => pad_to(Map.get(decoded, "elevation", []), w * h, 0)
        }

      true ->
        ground = flatten_2d(parse_json_field(tiles_json, []), w, h)

        %{
          "ground" => pad_to(ground, w * h, 0),
          "overlay" => List.duplicate(-1, w * h),
          "passability" => List.duplicate(0, w * h),
          "fringe" => List.duplicate(-1, w * h),
          "elevation" => List.duplicate(0, w * h)
        }
    end
  end

  # Legacy tiles_json was number[][]; the rest of the runtime now expects flat
  # row-major. Accept either shape and emit flat.
  defp flatten_2d(rows, w, h) when is_list(rows) do
    cond do
      rows == [] -> []
      is_list(hd(rows)) -> rows |> List.flatten() |> Enum.take(w * h)
      true -> Enum.take(rows, w * h)
    end
  end
  defp flatten_2d(_, _, _), do: []

  defp pad_to(list, n, fill) when is_list(list) do
    case length(list) do
      len when len >= n -> Enum.take(list, n)
      len -> list ++ List.duplicate(fill, n - len)
    end
  end
  defp pad_to(_, n, fill), do: List.duplicate(fill, n)
end
