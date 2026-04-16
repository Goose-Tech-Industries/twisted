defmodule TePhoenix.World.MapTemplates do
  @moduledoc """
  One-click genre-specific map generation.

  Generates complete map data structures with tiles, objects, events, and spawn
  zones for various game genres. Uses procedural generation techniques:
    * BSP (Binary Space Partitioning) for dungeon rooms + corridors
    * Perlin-like noise for terrain variation
    * Symmetric mirroring for competitive arenas
    * Lane-based layouts for MOBA maps

  ## Supported genres

    * `:moba_3lane` — 60x40 with 3 lanes, jungle, bases, towers, river
    * `:td_path` — 30x20 tower defense with winding path
    * `:dungeon_crawler` — BSP rooms + corridors with treasure and traps
    * `:arena_pvp` — 20x20 symmetric arena with obstacles
    * `:town_rpg` — 30x30 village with buildings, paths, NPCs
    * `:horror_mansion` — 25x25 mansion with rooms, hiding spots, vents
    * `:open_world_region` — 50x50 with biome zones and roads
    * `:battle_royale` — 80x80 with loot zones and shrink boundaries
  """

  require Logger
  alias TePhoenix.Repo

  @type tile :: non_neg_integer()
  @type coord :: {non_neg_integer(), non_neg_integer()}

  # Tile type constants
  @floor 0
  @wall 1
  @water 2
  @tree 3
  @road 4
  @sand 5
  @mountain 6
  @grass 7
  @ice 8
  @lava 9
  @bridge 10
  @door 11

  # ── Public API ─────────────────────────────────────────────────

  @doc """
  Generate a complete map data structure for the given genre.

  Returns `%{tiles: [[...]], objects: [...], events: [...], spawn_zones: [...], metadata: %{}}`.

  Options:
    * `:seed` — random seed for reproducible generation (default: random)
    * `:width` / `:height` — override default dimensions
  """
  def generate(genre, opts \\ []) do
    seed = Keyword.get(opts, :seed, :rand.uniform(999_999))
    :rand.seed(:exsss, {seed, seed + 1, seed + 2})

    case genre do
      :moba_3lane -> gen_moba(opts)
      :td_path -> gen_td(opts)
      :dungeon_crawler -> gen_dungeon(opts)
      :arena_pvp -> gen_arena(opts)
      :town_rpg -> gen_town(opts)
      :horror_mansion -> gen_horror(opts)
      :open_world_region -> gen_open_world(opts)
      :battle_royale -> gen_battle_royale(opts)
      _ -> {:error, :unknown_genre}
    end
  end

  @doc "Returns available templates with descriptions."
  def list_templates do
    [
      %{genre: :moba_3lane, name: "MOBA 3-Lane", description: "60x40 map with 3 lanes, jungle, 2 bases, tower positions, shop areas, river", default_size: {60, 40}},
      %{genre: :td_path, name: "Tower Defense", description: "30x20 with winding path from spawn to base, tower placement zones", default_size: {30, 20}},
      %{genre: :dungeon_crawler, name: "Dungeon Crawler", description: "BSP rooms + corridors, treasure, traps, boss room at end", default_size: {40, 30}},
      %{genre: :arena_pvp, name: "PvP Arena", description: "20x20 symmetric arena with obstacles, spawn points per team", default_size: {20, 20}},
      %{genre: :town_rpg, name: "RPG Town", description: "30x30 village with buildings, paths, NPC positions", default_size: {30, 30}},
      %{genre: :horror_mansion, name: "Horror Mansion", description: "25x25 mansion with rooms, hallways, hiding spots, vents, generators", default_size: {25, 25}},
      %{genre: :open_world_region, name: "Open World Region", description: "50x50 with biome zones, roads, points of interest", default_size: {50, 50}},
      %{genre: :battle_royale, name: "Battle Royale", description: "80x80 large map with loot zones, shrink boundaries, drop points", default_size: {80, 80}}
    ]
  end

  @doc """
  Generate a template and save it to an existing map in the database.
  Updates the map's tiles_json, objects_json, width, and height.
  """
  def apply_template(map_id, genre, opts \\ []) do
    case generate(genre, opts) do
      {:error, reason} ->
        {:error, reason}

      result ->
        tiles_json = Jason.encode!(result.tiles)
        objects_json = Jason.encode!(result.objects)
        w = length(List.first(result.tiles) || [])
        h = length(result.tiles)

        case Repo.query(
               "UPDATE game_maps SET tiles_json = ?, objects_json = ?, width = ?, height = ? WHERE id = ?",
               [tiles_json, objects_json, w, h, map_id]
             ) do
          {:ok, _} ->
            Logger.info("[MapTemplates] applied #{genre} template to map #{map_id}")
            {:ok, result}

          {:error, reason} ->
            {:error, reason}
        end
    end
  end

  # ── MOBA 3-Lane ────────────────────────────────────────────────

  defp gen_moba(opts) do
    w = Keyword.get(opts, :width, 60)
    h = Keyword.get(opts, :height, 40)
    tiles = make_grid(w, h, @grass)

    # River down the middle
    tiles = draw_hline(tiles, 0, w - 1, div(h, 2), @water)
    tiles = draw_hline(tiles, 0, w - 1, div(h, 2) - 1, @water)

    # Three bridges
    tiles = draw_rect(tiles, div(w, 4) - 1, div(h, 2) - 1, 3, 2, @bridge)
    tiles = draw_rect(tiles, div(w, 2) - 1, div(h, 2) - 1, 3, 2, @bridge)
    tiles = draw_rect(tiles, 3 * div(w, 4) - 1, div(h, 2) - 1, 3, 2, @bridge)

    # Top lane (row 2)
    tiles = draw_hline(tiles, 3, w - 4, 2, @road)
    # Middle lane
    tiles = draw_hline(tiles, 3, w - 4, div(h, 2), @road)
    # Bottom lane
    tiles = draw_hline(tiles, 3, w - 4, h - 3, @road)

    # Lane connectors (left side)
    tiles = draw_vline(tiles, 3, 2, h - 3, @road)
    # Lane connectors (right side)
    tiles = draw_vline(tiles, w - 4, 2, h - 3, @road)

    # Bases
    tiles = draw_rect(tiles, 0, div(h, 2) - 3, 3, 6, @wall)
    tiles = draw_rect(tiles, w - 3, div(h, 2) - 3, 3, 6, @wall)

    # Jungle trees
    tiles = scatter(tiles, @tree, 80, [{4, 4, div(w, 2) - 3, div(h, 2) - 3}, {div(w, 2) + 2, div(h, 2) + 2, w - 5, h - 5}])

    objects = [
      # Towers
      %{type: "tower", team: "blue", x: 5, y: 2, hp: 2000},
      %{type: "tower", team: "blue", x: 5, y: div(h, 2), hp: 2000},
      %{type: "tower", team: "blue", x: 5, y: h - 3, hp: 2000},
      %{type: "tower", team: "red", x: w - 6, y: 2, hp: 2000},
      %{type: "tower", team: "red", x: w - 6, y: div(h, 2), hp: 2000},
      %{type: "tower", team: "red", x: w - 6, y: h - 3, hp: 2000},
      # Shops
      %{type: "shop", team: "blue", x: 1, y: div(h, 2)},
      %{type: "shop", team: "red", x: w - 2, y: div(h, 2)}
    ]

    spawn_zones = [
      %{team: "blue", x: 1, y: div(h, 2) - 2, w: 2, h: 4},
      %{team: "red", x: w - 3, y: div(h, 2) - 2, w: 2, h: 4}
    ]

    %{tiles: tiles, objects: objects, events: [], spawn_zones: spawn_zones,
      metadata: %{genre: :moba_3lane, width: w, height: h}}
  end

  # ── Tower Defense ──────────────────────────────────────────────

  defp gen_td(opts) do
    w = Keyword.get(opts, :width, 30)
    h = Keyword.get(opts, :height, 20)
    tiles = make_grid(w, h, @grass)

    # Winding path from left to right with zigzag
    path_points = [
      {0, div(h, 2)}, {6, div(h, 2)}, {6, 3}, {12, 3},
      {12, h - 4}, {18, h - 4}, {18, 3}, {24, 3},
      {24, div(h, 2)}, {w - 1, div(h, 2)}
    ]

    tiles = draw_path(tiles, path_points, @road, 2)

    objects = [
      %{type: "wave_spawn", x: 0, y: div(h, 2)},
      %{type: "base", x: w - 1, y: div(h, 2), hp: 5000}
    ]

    # Tower placement zones along the path
    spawn_zones =
      for {px, py} <- [{8, 5}, {8, h - 6}, {14, 5}, {14, h - 6}, {20, 5}, {20, h - 6}] do
        %{type: "tower_zone", x: px, y: py, w: 2, h: 2}
      end

    %{tiles: tiles, objects: objects, events: [], spawn_zones: spawn_zones,
      metadata: %{genre: :td_path, width: w, height: h}}
  end

  # ── Dungeon Crawler (BSP) ─────────────────────────────────────

  defp gen_dungeon(opts) do
    w = Keyword.get(opts, :width, 40)
    h = Keyword.get(opts, :height, 30)
    tiles = make_grid(w, h, @wall)

    rooms = bsp_split(%{x: 1, y: 1, w: w - 2, h: h - 2}, 4, [])
    rooms = Enum.map(rooms, &shrink_room/1)

    # Carve rooms
    tiles =
      Enum.reduce(rooms, tiles, fn room, acc ->
        draw_rect(acc, room.x, room.y, room.w, room.h, @floor)
      end)

    # Connect rooms with corridors
    sorted = Enum.sort_by(rooms, fn r -> {r.y, r.x} end)

    tiles =
      sorted
      |> Enum.chunk_every(2, 1, :discard)
      |> Enum.reduce(tiles, fn [a, b], acc ->
        cx_a = a.x + div(a.w, 2)
        cy_a = a.y + div(a.h, 2)
        cx_b = b.x + div(b.w, 2)
        cy_b = b.y + div(b.h, 2)
        acc = draw_hline(acc, min(cx_a, cx_b), max(cx_a, cx_b), cy_a, @floor)
        draw_vline(acc, cx_b, min(cy_a, cy_b), max(cy_a, cy_b), @floor)
      end)

    # Place objects: treasure in random rooms, boss in last room
    treasure_rooms = Enum.take_random(rooms, min(3, length(rooms) - 1))
    boss_room = List.last(sorted)
    start_room = List.first(sorted)

    objects =
      Enum.map(treasure_rooms, fn r ->
        %{type: "treasure", x: r.x + div(r.w, 2), y: r.y + div(r.h, 2)}
      end) ++
      [%{type: "boss_spawn", x: boss_room.x + div(boss_room.w, 2), y: boss_room.y + div(boss_room.h, 2)}]

    # Traps in corridors
    events =
      for _ <- 1..5 do
        rx = :rand.uniform(w - 2)
        ry = :rand.uniform(h - 2)
        %{type: "trap", x: rx, y: ry, damage: 10 + :rand.uniform(20)}
      end

    spawn_zones = [
      %{type: "player_start", x: start_room.x + 1, y: start_room.y + 1, w: 2, h: 2}
    ]

    %{tiles: tiles, objects: objects, events: events, spawn_zones: spawn_zones,
      metadata: %{genre: :dungeon_crawler, width: w, height: h, room_count: length(rooms)}}
  end

  # ── PvP Arena ──────────────────────────────────────────────────

  defp gen_arena(opts) do
    w = Keyword.get(opts, :width, 20)
    h = Keyword.get(opts, :height, 20)
    tiles = make_grid(w, h, @floor)

    # Walls around edge
    tiles = draw_border(tiles, w, h, @wall)

    # Symmetric obstacles (generate left half, mirror to right)
    obstacle_positions = [
      {3, 3, 2, 2}, {3, h - 5, 2, 2},
      {div(w, 2) - 1, 4, 2, 3}, {div(w, 2) - 1, h - 7, 2, 3},
      {5, div(h, 2) - 1, 3, 2}
    ]

    tiles =
      Enum.reduce(obstacle_positions, tiles, fn {x, y, ow, oh}, acc ->
        acc = draw_rect(acc, x, y, ow, oh, @wall)
        # Mirror horizontally
        draw_rect(acc, w - x - ow, y, ow, oh, @wall)
      end)

    objects = []

    spawn_zones = [
      %{team: "alpha", x: 1, y: div(h, 2) - 1, w: 2, h: 2},
      %{team: "bravo", x: w - 3, y: div(h, 2) - 1, w: 2, h: 2}
    ]

    %{tiles: tiles, objects: objects, events: [], spawn_zones: spawn_zones,
      metadata: %{genre: :arena_pvp, width: w, height: h}}
  end

  # ── RPG Town ───────────────────────────────────────────────────

  defp gen_town(opts) do
    w = Keyword.get(opts, :width, 30)
    h = Keyword.get(opts, :height, 30)
    tiles = make_grid(w, h, @grass)

    # Main road cross
    tiles = draw_hline(tiles, 0, w - 1, div(h, 2), @road)
    tiles = draw_vline(tiles, div(w, 2), 0, h - 1, @road)

    # Buildings as wall rectangles with door openings
    buildings = [
      %{name: "inn", x: 3, y: 3, w: 5, h: 4, door_side: :south},
      %{name: "shop", x: 12, y: 3, w: 4, h: 4, door_side: :south},
      %{name: "blacksmith", x: 3, y: h - 8, w: 5, h: 4, door_side: :north},
      %{name: "guild_hall", x: w - 10, y: 3, w: 7, h: 5, door_side: :south},
      %{name: "temple", x: w - 8, y: h - 8, w: 5, h: 4, door_side: :north},
      %{name: "tavern", x: 12, y: h - 8, w: 5, h: 4, door_side: :north}
    ]

    tiles =
      Enum.reduce(buildings, tiles, fn bldg, acc ->
        acc = draw_rect_outline(acc, bldg.x, bldg.y, bldg.w, bldg.h, @wall)
        acc = draw_rect(acc, bldg.x + 1, bldg.y + 1, bldg.w - 2, bldg.h - 2, @floor)

        # Door
        door_pos = case bldg.door_side do
          :south -> {bldg.x + div(bldg.w, 2), bldg.y + bldg.h - 1}
          :north -> {bldg.x + div(bldg.w, 2), bldg.y}
          :east -> {bldg.x + bldg.w - 1, bldg.y + div(bldg.h, 2)}
          :west -> {bldg.x, bldg.y + div(bldg.h, 2)}
        end

        {dx, dy} = door_pos
        set_tile(acc, dx, dy, @door)
      end)

    # Decorative trees
    tiles = scatter(tiles, @tree, 15, [{0, 0, w - 1, h - 1}])

    objects =
      Enum.map(buildings, fn bldg ->
        %{type: "building", name: bldg.name, x: bldg.x, y: bldg.y, w: bldg.w, h: bldg.h}
      end)

    # NPC positions
    npc_spawns = [
      %{type: "npc_spawn", role: "innkeeper", x: 5, y: 5},
      %{type: "npc_spawn", role: "merchant", x: 13, y: 5},
      %{type: "npc_spawn", role: "blacksmith", x: 5, y: h - 6},
      %{type: "npc_spawn", role: "guild_master", x: w - 7, y: 5},
      %{type: "npc_spawn", role: "priest", x: w - 6, y: h - 6},
      %{type: "npc_spawn", role: "barkeeper", x: 14, y: h - 6}
    ]

    spawn_zones = [
      %{type: "player_spawn", x: div(w, 2) - 1, y: h - 2, w: 2, h: 1}
    ]

    %{tiles: tiles, objects: objects ++ npc_spawns, events: [], spawn_zones: spawn_zones,
      metadata: %{genre: :town_rpg, width: w, height: h, building_count: length(buildings)}}
  end

  # ── Horror Mansion ─────────────────────────────────────────────

  defp gen_horror(opts) do
    w = Keyword.get(opts, :width, 25)
    h = Keyword.get(opts, :height, 25)
    tiles = make_grid(w, h, @wall)

    # Rooms carved into the mansion
    rooms = [
      %{name: "foyer", x: 10, y: h - 6, w: 5, h: 5},
      %{name: "dining_room", x: 2, y: h - 10, w: 7, h: 5},
      %{name: "kitchen", x: 2, y: h - 16, w: 5, h: 5},
      %{name: "library", x: 16, y: h - 10, w: 7, h: 5},
      %{name: "study", x: 16, y: h - 16, w: 5, h: 5},
      %{name: "master_bedroom", x: 8, y: 2, w: 9, h: 5},
      %{name: "bathroom", x: 2, y: 2, w: 4, h: 4},
      %{name: "attic_access", x: 18, y: 2, w: 5, h: 4},
      %{name: "basement_stairs", x: 10, y: 10, w: 5, h: 4}
    ]

    # Carve rooms
    tiles =
      Enum.reduce(rooms, tiles, fn room, acc ->
        draw_rect(acc, room.x, room.y, room.w, room.h, @floor)
      end)

    # Hallways connecting rooms
    hallways = [
      {12, h - 7, 12, h - 11},    # Foyer to central
      {9, h - 8, 2, h - 8},       # To dining room
      {15, h - 8, 16, h - 8},     # To library
      {4, h - 11, 4, h - 12},     # Dining to kitchen
      {18, h - 11, 18, h - 12},   # Library to study
      {12, 13, 12, 7},             # Central to master
      {7, 4, 8, 4},               # Bathroom corridor
      {17, 4, 18, 4},             # Attic corridor
    ]

    tiles =
      Enum.reduce(hallways, tiles, fn {x1, y1, x2, y2}, acc ->
        acc = draw_hline(acc, min(x1, x2), max(x1, x2), y1, @floor)
        draw_vline(acc, x2, min(y1, y2), max(y1, y2), @floor)
      end)

    objects =
      Enum.map(rooms, fn r ->
        %{type: "room", name: r.name, x: r.x, y: r.y, w: r.w, h: r.h}
      end)

    # Hiding spots
    hiding_spots =
      for r <- Enum.take_random(rooms, 4) do
        %{type: "hiding_spot", x: r.x + 1, y: r.y + 1}
      end

    # Vent connections (fast travel between rooms)
    vents = [
      %{type: "vent", from: "kitchen", to: "bathroom", x1: 3, y1: h - 12, x2: 3, y2: 4},
      %{type: "vent", from: "library", to: "attic_access", x1: 21, y1: h - 7, x2: 21, y2: 4}
    ]

    # Generators (for power mechanic)
    generators = [
      %{type: "generator", x: 3, y: h - 14, powered: false},
      %{type: "generator", x: 20, y: h - 14, powered: false},
      %{type: "generator", x: 12, y: 3, powered: false}
    ]

    spawn_zones = [
      %{type: "survivor_spawn", x: 11, y: h - 4, w: 3, h: 2},
      %{type: "killer_spawn", x: 10, y: 3, w: 2, h: 2}
    ]

    %{tiles: tiles, objects: objects ++ hiding_spots ++ vents ++ generators,
      events: [], spawn_zones: spawn_zones,
      metadata: %{genre: :horror_mansion, width: w, height: h, room_count: length(rooms)}}
  end

  # ── Open World Region ─────────────────────────────────────────

  defp gen_open_world(opts) do
    w = Keyword.get(opts, :width, 50)
    h = Keyword.get(opts, :height, 50)

    # Generate biome zones using simple noise
    tiles =
      for y <- 0..(h - 1) do
        for x <- 0..(w - 1) do
          noise_val = pseudo_noise(x, y, w, h)

          cond do
            noise_val < 0.15 -> @water        # Lake
            noise_val < 0.25 -> @sand          # Beach / desert
            noise_val < 0.55 -> @grass         # Plains
            noise_val < 0.75 -> @tree          # Forest
            noise_val < 0.90 -> @mountain      # Mountains
            true -> @ice                        # Peaks
          end
        end
      end

    # Roads connecting POIs
    road_points = [
      {5, div(h, 2)}, {div(w, 4), div(h, 2)}, {div(w, 2), div(h, 4)},
      {div(w, 2), div(h, 2)}, {div(w, 2), 3 * div(h, 4)},
      {3 * div(w, 4), div(h, 2)}, {w - 5, div(h, 2)}
    ]

    tiles = draw_path(tiles, road_points, @road, 1)

    pois = [
      %{type: "poi", name: "Village", x: 5, y: div(h, 2), icon: "village"},
      %{type: "poi", name: "Ruins", x: div(w, 2), y: div(h, 4), icon: "ruins"},
      %{type: "poi", name: "Cave", x: 3 * div(w, 4), y: div(h, 4), icon: "cave"},
      %{type: "poi", name: "Shrine", x: div(w, 4), y: 3 * div(h, 4), icon: "shrine"},
      %{type: "poi", name: "Tower", x: 3 * div(w, 4), y: 3 * div(h, 4), icon: "tower"},
      %{type: "poi", name: "Camp", x: div(w, 2), y: 3 * div(h, 4), icon: "camp"}
    ]

    spawn_zones = [
      %{type: "player_spawn", x: 4, y: div(h, 2) - 1, w: 3, h: 3}
    ]

    %{tiles: tiles, objects: pois, events: [], spawn_zones: spawn_zones,
      metadata: %{genre: :open_world_region, width: w, height: h, poi_count: length(pois)}}
  end

  # ── Battle Royale ──────────────────────────────────────────────

  defp gen_battle_royale(opts) do
    w = Keyword.get(opts, :width, 80)
    h = Keyword.get(opts, :height, 80)

    # Mixed terrain using noise
    tiles =
      for y <- 0..(h - 1) do
        for x <- 0..(w - 1) do
          noise_val = pseudo_noise(x, y, w, h)

          cond do
            noise_val < 0.10 -> @water
            noise_val < 0.20 -> @sand
            noise_val < 0.60 -> @grass
            noise_val < 0.80 -> @tree
            true -> @mountain
          end
        end
      end

    # Roads
    tiles = draw_hline(tiles, 0, w - 1, div(h, 2), @road)
    tiles = draw_vline(tiles, div(w, 2), 0, h - 1, @road)
    tiles = draw_hline(tiles, 0, w - 1, div(h, 4), @road)
    tiles = draw_hline(tiles, 0, w - 1, 3 * div(h, 4), @road)

    # Loot zones (named areas)
    loot_zones = [
      %{type: "loot_zone", name: "Military Base", x: 5, y: 5, w: 10, h: 8, tier: "high"},
      %{type: "loot_zone", name: "Town Center", x: div(w, 2) - 5, y: div(h, 2) - 5, w: 10, h: 10, tier: "high"},
      %{type: "loot_zone", name: "Farm", x: w - 15, y: 5, w: 10, h: 8, tier: "medium"},
      %{type: "loot_zone", name: "Docks", x: 5, y: h - 13, w: 10, h: 8, tier: "medium"},
      %{type: "loot_zone", name: "Forest Camp", x: w - 15, y: h - 13, w: 10, h: 8, tier: "low"},
      %{type: "loot_zone", name: "Ruins", x: div(w, 4), y: div(h, 4), w: 6, h: 6, tier: "medium"},
      %{type: "loot_zone", name: "Lighthouse", x: 3 * div(w, 4), y: div(h, 4), w: 4, h: 4, tier: "low"},
      %{type: "loot_zone", name: "Bunker", x: div(w, 4), y: 3 * div(h, 4), w: 6, h: 6, tier: "high"}
    ]

    # Shrink boundaries (concentric zones)
    events = [
      %{type: "shrink_zone", phase: 1, x: 5, y: 5, w: w - 10, h: h - 10, delay_seconds: 120},
      %{type: "shrink_zone", phase: 2, x: 15, y: 15, w: w - 30, h: h - 30, delay_seconds: 90},
      %{type: "shrink_zone", phase: 3, x: 25, y: 25, w: w - 50, h: h - 50, delay_seconds: 60},
      %{type: "shrink_zone", phase: 4, x: 33, y: 33, w: 14, h: 14, delay_seconds: 45}
    ]

    # Drop points around the perimeter
    spawn_zones =
      for i <- 0..7 do
        angle = i * :math.pi() / 4
        cx = div(w, 2) + round(:math.cos(angle) * (div(w, 2) - 5))
        cy = div(h, 2) + round(:math.sin(angle) * (div(h, 2) - 5))
        %{type: "drop_point", index: i, x: cx, y: cy, w: 3, h: 3}
      end

    %{tiles: tiles, objects: loot_zones, events: events, spawn_zones: spawn_zones,
      metadata: %{genre: :battle_royale, width: w, height: h, loot_zone_count: length(loot_zones)}}
  end

  # ── Grid Helpers ───────────────────────────────────────────────

  defp make_grid(w, h, tile) do
    for _ <- 0..(h - 1), do: List.duplicate(tile, w)
  end

  defp set_tile(tiles, x, y, tile) do
    if y >= 0 and y < length(tiles) do
      row = Enum.at(tiles, y)

      if x >= 0 and x < length(row) do
        List.replace_at(tiles, y, List.replace_at(row, x, tile))
      else
        tiles
      end
    else
      tiles
    end
  end

  defp draw_rect(tiles, x, y, w, h, tile) do
    Enum.reduce(y..(y + h - 1), tiles, fn cy, acc ->
      Enum.reduce(x..(x + w - 1), acc, fn cx, acc2 ->
        set_tile(acc2, cx, cy, tile)
      end)
    end)
  end

  defp draw_rect_outline(tiles, x, y, w, h, tile) do
    tiles
    |> draw_hline(x, x + w - 1, y, tile)
    |> draw_hline(x, x + w - 1, y + h - 1, tile)
    |> draw_vline(x, y, y + h - 1, tile)
    |> draw_vline(x + w - 1, y, y + h - 1, tile)
  end

  defp draw_hline(tiles, x1, x2, y, tile) do
    Enum.reduce(x1..x2, tiles, fn cx, acc -> set_tile(acc, cx, y, tile) end)
  end

  defp draw_vline(tiles, x, y1, y2, tile) do
    Enum.reduce(y1..y2, tiles, fn cy, acc -> set_tile(acc, x, cy, tile) end)
  end

  defp draw_border(tiles, w, h, tile) do
    tiles
    |> draw_hline(0, w - 1, 0, tile)
    |> draw_hline(0, w - 1, h - 1, tile)
    |> draw_vline(0, 0, h - 1, tile)
    |> draw_vline(w - 1, 0, h - 1, tile)
  end

  defp draw_path(tiles, points, tile, width) do
    points
    |> Enum.chunk_every(2, 1, :discard)
    |> Enum.reduce(tiles, fn [{x1, y1}, {x2, y2}], acc ->
      acc = if x1 != x2, do: draw_wide_hline(acc, min(x1, x2), max(x1, x2), y1, tile, width), else: acc
      if y1 != y2, do: draw_wide_vline(acc, x2, min(y1, y2), max(y1, y2), tile, width), else: acc
    end)
  end

  defp draw_wide_hline(tiles, x1, x2, y, tile, width) do
    Enum.reduce(0..(width - 1), tiles, fn offset, acc ->
      draw_hline(acc, x1, x2, y + offset, tile)
    end)
  end

  defp draw_wide_vline(tiles, x, y1, y2, tile, width) do
    Enum.reduce(0..(width - 1), tiles, fn offset, acc ->
      draw_vline(acc, x + offset, y1, y2, tile)
    end)
  end

  defp scatter(tiles, tile, count, regions) do
    Enum.reduce(1..count, tiles, fn _, acc ->
      {x1, y1, x2, y2} = Enum.random(regions)
      rx = x1 + :rand.uniform(max(x2 - x1, 1)) - 1
      ry = y1 + :rand.uniform(max(y2 - y1, 1)) - 1

      # Only place on grass/floor tiles
      row = Enum.at(acc, ry, [])
      current = Enum.at(row, rx, @wall)

      if current in [@grass, @floor, @sand] do
        set_tile(acc, rx, ry, tile)
      else
        acc
      end
    end)
  end

  # ── BSP (Binary Space Partitioning) ───────────────────────────

  defp bsp_split(rect, 0, acc), do: [rect | acc]
  defp bsp_split(%{w: w, h: h} = rect, _depth, acc) when w < 8 or h < 8, do: [rect | acc]

  defp bsp_split(rect, depth, acc) do
    if rect.w > rect.h do
      # Split vertically
      split = rect.x + 4 + :rand.uniform(max(rect.w - 8, 1))

      if split >= rect.x + rect.w - 3 do
        [rect | acc]
      else
        left = %{x: rect.x, y: rect.y, w: split - rect.x, h: rect.h}
        right = %{x: split, y: rect.y, w: rect.x + rect.w - split, h: rect.h}
        bsp_split(left, depth - 1, []) ++ bsp_split(right, depth - 1, acc)
      end
    else
      # Split horizontally
      split = rect.y + 4 + :rand.uniform(max(rect.h - 8, 1))

      if split >= rect.y + rect.h - 3 do
        [rect | acc]
      else
        top = %{x: rect.x, y: rect.y, w: rect.w, h: split - rect.y}
        bottom = %{x: rect.x, y: split, w: rect.w, h: rect.y + rect.h - split}
        bsp_split(top, depth - 1, []) ++ bsp_split(bottom, depth - 1, acc)
      end
    end
  end

  defp shrink_room(rect) do
    padding_x = min(1, div(rect.w, 4))
    padding_y = min(1, div(rect.h, 4))

    %{
      x: rect.x + padding_x,
      y: rect.y + padding_y,
      w: max(rect.w - padding_x * 2, 3),
      h: max(rect.h - padding_y * 2, 3)
    }
  end

  # ── Pseudo noise (deterministic, no dependencies) ─────────────

  defp pseudo_noise(x, y, w, h) do
    # Simple hash-based noise normalized to 0.0..1.0
    # Uses multiple octaves for natural-looking terrain
    n1 = hash_noise(x, y, 7)
    n2 = hash_noise(div(x, 3), div(y, 3), 13) * 0.5
    n3 = hash_noise(div(x, 7), div(y, 7), 31) * 0.25

    # Distance from center creates island shape
    cx = x / max(w, 1) - 0.5
    cy = y / max(h, 1) - 0.5
    dist = :math.sqrt(cx * cx + cy * cy) * 1.4

    raw = (n1 + n2 + n3) / 1.75
    max(0.0, min(1.0, raw - dist * 0.3))
  end

  defp hash_noise(x, y, seed) do
    # Simple integer hash → float
    n = x * 374761393 + y * 668265263 + seed
    n = Bitwise.band(n * (n * n * 15731 + 789221) + 1376312589, 0x7FFFFFFF)
    n / 0x7FFFFFFF
  end
end
