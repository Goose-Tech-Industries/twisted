defmodule TePhoenixWeb.Admin.MapEditorTemplates do
  @moduledoc """
  Map templates and procedural generators for the visual map editor.

  Three generator families are implemented:

    * **BSP dungeon** — recursive Binary Space Partitioning produces a set of
      rectangular rooms connected by L-shaped corridors. Good for classic
      JRPG dungeons and crawler-style layouts.

    * **Cellular automata cave** — randomised wall noise smoothed by
      neighbour-count rules. Good for organic caves and chambers.

    * **Recursive backtracker maze** — perfect mazes on a half-resolution
      grid. Good for puzzle areas and prison floors.

  Each generator returns a `%{ground: [int], overlay: [int], passability: [int]}`
  map sized exactly `w * h`. The caller is responsible for grafting these into
  the active map's layers via the editor's stamp protocol.

  Tile ids used (matched against the default 64-tile palette):
    * floor   = 0   (grass / open)
    * wall    = 1   (stone)
    * dirt    = 2   (corridor floor variant)
    * water   = 3
    * cave    = 6

  Five hard-coded room templates are also available via `room_template/2`.
  These are small (5×5 to 12×12) reusable footprints that paste into a
  selected region of an existing map — useful as quick puzzle/encounter rooms.
  """

  @floor 0
  @wall 1
  @dirt 2
  @cave 6

  @typedoc "A `w × h` flat tile-id list."
  @type layer :: [integer()]

  @typedoc "Generator output: three flat layers, all `w * h` long."
  @type generated :: %{ground: layer(), overlay: layer(), passability: layer()}

  # ── Public API ─────────────────────────────────────────────────

  @doc """
  Generate a `w × h` BSP dungeon. `opts` may contain:
    * `:min_room` (default 5) — minimum room side length
    * `:max_depth` (default 5) — maximum BSP recursion depth
    * `:seed` — integer seed for reproducibility (omit for random)
  """
  @spec bsp_dungeon(pos_integer(), pos_integer(), keyword()) :: generated()
  def bsp_dungeon(w, h, opts \\ []) do
    seed_rng(opts[:seed])
    min_room = opts[:min_room] || 5
    max_depth = opts[:max_depth] || 5

    grid = solid_grid(w, h, @wall)
    rect = {1, 1, w - 2, h - 2}
    rooms = bsp_partition(rect, max_depth, min_room)
    grid = Enum.reduce(rooms, grid, fn r, acc -> carve_room(acc, w, h, r) end)
    grid = connect_rooms(grid, w, h, rooms)

    %{
      ground: ground_layer_from_walls(grid, w, h, @floor, @floor),
      overlay: List.duplicate(-1, w * h),
      passability: passability_from_walls(grid, w, h)
    }
  end

  @doc """
  Generate a `w × h` cellular automata cave.
  """
  @spec ca_cave(pos_integer(), pos_integer(), keyword()) :: generated()
  def ca_cave(w, h, opts \\ []) do
    seed_rng(opts[:seed])
    fill_pct = opts[:fill_pct] || 0.45
    iterations = opts[:iterations] || 5
    birth = opts[:birth] || 5
    survive = opts[:survive] || 4

    grid =
      for y <- 0..(h - 1), x <- 0..(w - 1), into: [] do
        cond do
          x == 0 or y == 0 or x == w - 1 or y == h - 1 -> @wall
          :rand.uniform() < fill_pct -> @wall
          true -> @floor
        end
      end

    grid = Enum.reduce(1..iterations, grid, fn _, g -> ca_step(g, w, h, birth, survive) end)

    %{
      ground: Enum.map(grid, fn t -> if t == @wall, do: @cave, else: @floor end),
      overlay: List.duplicate(-1, w * h),
      passability: Enum.map(grid, fn t -> if t == @wall, do: 1, else: 0 end)
    }
  end

  @doc """
  Generate a `w × h` perfect maze via recursive backtracker on a half-resolution
  cell grid (so passages are 1 tile wide with 1-tile walls between them).
  """
  @spec maze(pos_integer(), pos_integer(), keyword()) :: generated()
  def maze(w, h, opts \\ []) do
    seed_rng(opts[:seed])
    cw = div(w - 1, 2)
    ch = div(h - 1, 2)

    visited = MapSet.new()
    grid = solid_grid(w, h, @wall)

    {grid, _visited} = carve_maze(grid, w, h, 0, 0, cw, ch, visited)

    %{
      ground: Enum.map(grid, fn t -> if t == @wall, do: @wall, else: @dirt end),
      overlay: List.duplicate(-1, w * h),
      passability: Enum.map(grid, fn t -> if t == @wall, do: 1, else: 0 end)
    }
  end

  @doc """
  Return one of the 5 hard-coded room templates by name. Each template returns
  a `%{w, h, cells: [{x, y, tile_id}]}` shape suitable for the editor's
  region-stamp protocol.

  Available names: `"campfire"`, `"shrine"`, `"prison"`, `"crypt"`, `"barracks"`.
  Any unknown name returns the campfire fallback.
  """
  @spec room_template(String.t()) :: %{w: pos_integer(), h: pos_integer(), cells: [%{x: integer(), y: integer(), value: integer()}]}
  def room_template(name)

  def room_template("campfire") do
    %{
      w: 7,
      h: 7,
      cells:
        ring(7, 7, @wall) ++ interior(7, 7, @floor) ++ [%{x: 3, y: 3, value: 4}]
    }
  end

  def room_template("shrine") do
    %{
      w: 9,
      h: 9,
      cells: ring(9, 9, @wall) ++ interior(9, 9, @floor) ++ pillars_4(9, 9)
    }
  end

  def room_template("prison") do
    cells = ring(11, 7, @wall) ++ interior(11, 7, @dirt)
    bars = for x <- [3, 5, 7], y <- 1..5, do: %{x: x, y: y, value: @wall}
    %{w: 11, h: 7, cells: cells ++ bars}
  end

  def room_template("crypt") do
    %{
      w: 9,
      h: 9,
      cells: ring(9, 9, @wall) ++ interior(9, 9, 7) ++ pillars_4(9, 9)
    }
  end

  def room_template("barracks") do
    cells = ring(12, 8, @wall) ++ interior(12, 8, @floor)
    beds = for x <- [2, 5, 8], y <- [2, 5], do: %{x: x, y: y, value: 4}
    %{w: 12, h: 8, cells: cells ++ beds}
  end

  def room_template(_), do: room_template("campfire")

  @doc "List of available template names paired with display labels."
  def template_index do
    [
      %{key: "campfire", label: "Campfire room", w: 7, h: 7},
      %{key: "shrine", label: "Shrine", w: 9, h: 9},
      %{key: "prison", label: "Prison cells", w: 11, h: 7},
      %{key: "crypt", label: "Crypt", w: 9, h: 9},
      %{key: "barracks", label: "Barracks", w: 12, h: 8},
      %{key: "shop", label: "Shop interior", w: 8, h: 6},
      %{key: "tavern", label: "Tavern interior", w: 12, h: 10},
      %{key: "house", label: "Small house", w: 7, h: 6},
      %{key: "well", label: "Well (outdoor)", w: 3, h: 3},
      %{key: "bridge_h", label: "Bridge (horizontal)", w: 6, h: 3},
      %{key: "bridge_v", label: "Bridge (vertical)", w: 3, h: 6},
      %{key: "garden", label: "Garden plot", w: 5, h: 5},
      %{key: "tower", label: "Tower floor", w: 7, h: 7},
      %{key: "throne_room", label: "Throne room", w: 11, h: 9}
    ]
  end

  # ── Additional room templates ─────────────────────────────────

  def room_template("shop") do
    # 8x6 shop: walls, wood floor, counter at row 3
    cells = ring(8, 6, @wall) ++ interior(8, 6, 4)
    counter = for x <- 2..5, do: %{x: x, y: 3, value: 5}  # cobble = counter
    shelves = for x <- [1, 6], y <- [1, 2], do: %{x: x, y: y, value: 5}
    %{w: 8, h: 6, cells: cells ++ counter ++ shelves}
  end

  def room_template("tavern") do
    # 12x10 tavern: walls, wood floor, bar area, tables
    cells = ring(12, 10, @wall) ++ interior(12, 10, 4)
    # Bar counter across the back
    bar = for x <- 2..5, do: %{x: x, y: 2, value: 5}
    # Tables (4 of them)
    tables = for {tx, ty} <- [{3, 5}, {7, 5}, {3, 7}, {7, 7}], do: %{x: tx, y: ty, value: 2}
    # Chairs around tables
    chairs = for {tx, ty} <- [{2, 5}, {4, 5}, {6, 5}, {8, 5}, {2, 7}, {4, 7}, {6, 7}, {8, 7}], do: %{x: tx, y: ty, value: 4}
    %{w: 12, h: 10, cells: cells ++ bar ++ tables ++ chairs}
  end

  def room_template("house") do
    # 7x6 house: walls, wood floor, bed, table
    cells = ring(7, 6, @wall) ++ interior(7, 6, 4)
    furniture = [
      %{x: 1, y: 1, value: 2},  # bed
      %{x: 2, y: 1, value: 2},
      %{x: 4, y: 3, value: 5},  # table
      %{x: 1, y: 4, value: 5}   # chest
    ]
    %{w: 7, h: 6, cells: cells ++ furniture}
  end

  def room_template("well") do
    # 3x3 well: stone ring with water center
    cells = [
      %{x: 0, y: 0, value: 5}, %{x: 1, y: 0, value: 5}, %{x: 2, y: 0, value: 5},
      %{x: 0, y: 1, value: 5}, %{x: 1, y: 1, value: 3}, %{x: 2, y: 1, value: 5},
      %{x: 0, y: 2, value: 5}, %{x: 1, y: 2, value: 5}, %{x: 2, y: 2, value: 5}
    ]
    %{w: 3, h: 3, cells: cells}
  end

  def room_template("bridge_h") do
    # 6x3 horizontal bridge: water with wood path
    cells = []
    water = for x <- 0..5, y <- 0..2, do: %{x: x, y: y, value: 3}
    planks = for x <- 0..5, do: %{x: x, y: 1, value: 4}
    %{w: 6, h: 3, cells: water ++ planks}
  end

  def room_template("bridge_v") do
    cells = []
    water = for x <- 0..2, y <- 0..5, do: %{x: x, y: y, value: 3}
    planks = for y <- 0..5, do: %{x: 1, y: y, value: 4}
    %{w: 3, h: 6, cells: water ++ planks}
  end

  def room_template("garden") do
    # 5x5 garden: dirt border, grass inside with dirt rows
    border = ring(5, 5, @dirt)
    inside = interior(5, 5, @floor)
    rows = for x <- [1, 3], y <- 1..3, do: %{x: x, y: y, value: @dirt}
    %{w: 5, h: 5, cells: border ++ inside ++ rows}
  end

  def room_template("tower") do
    # 7x7 circular tower: stone walls, wood floor, spiral stair hint
    cells = ring(7, 7, @wall) ++ interior(7, 7, 4)
    # Round corners with wall
    corners = for {cx, cy} <- [{1, 1}, {5, 1}, {1, 5}, {5, 5}], do: %{x: cx, y: cy, value: @wall}
    stair = %{x: 3, y: 3, value: 5}
    %{w: 7, h: 7, cells: cells ++ corners ++ [stair]}
  end

  def room_template("throne_room") do
    # 11x9 throne room: grand hall, throne at back, carpet
    cells = ring(11, 9, @wall) ++ interior(11, 9, 5)
    # Red carpet (dirt = carpet color)
    carpet = for y <- 1..7, do: %{x: 5, y: y, value: @dirt}
    carpet2 = for x <- 3..7, do: %{x: x, y: 2, value: @dirt}
    # Throne
    throne = [%{x: 5, y: 1, value: 4}, %{x: 4, y: 1, value: 4}, %{x: 6, y: 1, value: 4}]
    # Pillars
    pillars = for {px, py} <- [{2, 3}, {8, 3}, {2, 6}, {8, 6}], do: %{x: px, y: py, value: @wall}
    %{w: 11, h: 9, cells: cells ++ carpet ++ carpet2 ++ throne ++ pillars}
  end

  # ── Town generator ────────────────────────────────────────────

  @doc """
  Generate a `w × h` town with buildings, paths, and open spaces.
  Buildings have walls, wood floors, and doors. Paths connect them.
  Returns the same `%{ground, overlay, passability}` shape as other generators.
  """
  @spec town(pos_integer(), pos_integer(), keyword()) :: generated()
  def town(w, h, opts \\ []) do
    seed_rng(opts[:seed])

    # Start with grass
    ground = List.duplicate(@floor, w * h)
    overlay = List.duplicate(-1, w * h)
    passability = List.duplicate(0, w * h)

    # Place 4-8 buildings randomly
    num_buildings = 4 + :rand.uniform(5)
    building_types = ["house", "shop", "tavern", "shrine", "barracks"]

    {ground, passability, buildings} =
      Enum.reduce(1..num_buildings, {ground, passability, []}, fn _, {g, p, bldgs} ->
        bw = 6 + :rand.uniform(6)  # building width 7-12
        bh = 5 + :rand.uniform(5)  # building height 6-10
        bx = 2 + :rand.uniform(max(1, w - bw - 4))
        by = 2 + :rand.uniform(max(1, h - bh - 4))

        # Check no overlap with existing buildings (1-tile buffer)
        overlaps = Enum.any?(bldgs, fn {ox, oy, ow, oh} ->
          bx < ox + ow + 1 and bx + bw + 1 > ox and by < oy + oh + 1 and by + bh + 1 > oy
        end)

        if overlaps do
          {g, p, bldgs}
        else
          # Place building: walls on perimeter, wood floor inside
          {g2, p2} = Enum.reduce(by..(by + bh - 1), {g, p}, fn y, {ga, pa} ->
            Enum.reduce(bx..(bx + bw - 1), {ga, pa}, fn x, {gb, pb} ->
              if x >= 0 and x < w and y >= 0 and y < h do
                idx = y * w + x
                is_wall = x == bx or x == bx + bw - 1 or y == by or y == by + bh - 1
                tile = if is_wall, do: @wall, else: 4  # 4 = wood
                pass = if is_wall, do: 1, else: 0
                {List.replace_at(gb, idx, tile), List.replace_at(pb, idx, pass)}
              else
                {gb, pb}
              end
            end)
          end)

          # Add door on south wall
          door_x = bx + div(bw, 2)
          door_y = by + bh - 1
          if door_x >= 0 and door_x < w and door_y >= 0 and door_y < h do
            door_idx = door_y * w + door_x
            g3 = List.replace_at(g2, door_idx, 4)
            p3 = List.replace_at(p2, door_idx, 0)
            {g3, p3, [{bx, by, bw, bh} | bldgs]}
          else
            {g2, p2, [{bx, by, bw, bh} | bldgs]}
          end
        end
      end)

    # Lay cobblestone paths between buildings
    ground = if length(buildings) >= 2 do
      centers = Enum.map(buildings, fn {bx, by, bw, bh} -> {bx + div(bw, 2), by + bh} end)
      Enum.reduce(Enum.chunk_every(centers, 2, 1, :discard), ground, fn [{x1, y1}, {x2, y2}], g ->
        # Horizontal then vertical L-path
        path_tiles =
          (for x <- min(x1, x2)..max(x1, x2), do: {x, y1}) ++
          (for y <- min(y1, y2)..max(y1, y2), do: {x2, y})
        Enum.reduce(path_tiles, g, fn {px, py}, ga ->
          if px >= 0 and px < w and py >= 0 and py < h do
            idx = py * w + px
            # Only place path on grass (don't overwrite buildings)
            if Enum.at(ga, idx) == @floor, do: List.replace_at(ga, idx, 5), else: ga
          else
            ga
          end
        end)
      end)
    else
      ground
    end

    # Add a well or fountain in an open area
    well_x = div(w, 2)
    well_y = div(h, 2)
    well_idx = well_y * w + well_x
    ground = if Enum.at(ground, well_idx) == @floor do
      ground
      |> List.replace_at(well_idx, 3)  # water center
      |> List.replace_at((well_y - 1) * w + well_x, 5)  # stone surround
      |> List.replace_at((well_y + 1) * w + well_x, 5)
      |> List.replace_at(well_y * w + well_x - 1, 5)
      |> List.replace_at(well_y * w + well_x + 1, 5)
    else
      ground
    end

    %{ground: ground, overlay: overlay, passability: passability}
  end

  # ── BSP internals ──────────────────────────────────────────────

  defp bsp_partition({_x, _y, w, h} = rect, depth, min_room) when depth <= 0 or w < min_room * 2 + 1 or h < min_room * 2 + 1 do
    [carve_padding(rect, min_room)]
  end

  defp bsp_partition({x, y, w, h} = rect, depth, min_room) do
    horizontal? =
      cond do
        w > h * 1.25 -> false
        h > w * 1.25 -> true
        true -> :rand.uniform(2) == 1
      end

    cond do
      horizontal? and h >= min_room * 2 + 1 ->
        split = min_room + :rand.uniform(h - min_room * 2)
        bsp_partition({x, y, w, split}, depth - 1, min_room) ++
          bsp_partition({x, y + split, w, h - split}, depth - 1, min_room)

      not horizontal? and w >= min_room * 2 + 1 ->
        split = min_room + :rand.uniform(w - min_room * 2)
        bsp_partition({x, y, split, h}, depth - 1, min_room) ++
          bsp_partition({x + split, y, w - split, h}, depth - 1, min_room)

      true ->
        [carve_padding(rect, min_room)]
    end
  end

  # Reduce a BSP leaf rect to an actual room rect with a 1-tile inner pad
  # and a small randomised inset so rooms don't all hug the partition lines.
  defp carve_padding({x, y, w, h}, min_room) do
    pad_x = max(1, div(w - min_room, 4))
    pad_y = max(1, div(h - min_room, 4))
    rx = x + :rand.uniform(pad_x)
    ry = y + :rand.uniform(pad_y)
    rw = max(min_room, w - pad_x * 2)
    rh = max(min_room, h - pad_y * 2)
    {rx, ry, rw, rh}
  end

  defp carve_room(grid, w, _h, {rx, ry, rw, rh}) do
    Enum.reduce(ry..(ry + rh - 1), grid, fn y, g_acc ->
      Enum.reduce(rx..(rx + rw - 1), g_acc, fn x, g ->
        idx = y * w + x
        if idx >= 0 and idx < length(g), do: List.replace_at(g, idx, @floor), else: g
      end)
    end)
  end

  # Connect each room to the next by an L-corridor between centres.
  defp connect_rooms(grid, w, h, rooms) do
    rooms
    |> Enum.chunk_every(2, 1, :discard)
    |> Enum.reduce(grid, fn [a, b], acc ->
      {ax, ay} = room_center(a)
      {bx, by} = room_center(b)
      acc
      |> carve_h_corridor(w, h, ax, bx, ay)
      |> carve_v_corridor(w, h, ay, by, bx)
    end)
  end

  defp room_center({x, y, w, h}), do: {x + div(w, 2), y + div(h, 2)}

  defp carve_h_corridor(grid, w, _h, x1, x2, y) do
    Enum.reduce(min(x1, x2)..max(x1, x2), grid, fn x, acc ->
      idx = y * w + x
      if idx >= 0 and idx < length(acc), do: List.replace_at(acc, idx, @floor), else: acc
    end)
  end

  defp carve_v_corridor(grid, w, _h, y1, y2, x) do
    Enum.reduce(min(y1, y2)..max(y1, y2), grid, fn y, acc ->
      idx = y * w + x
      if idx >= 0 and idx < length(acc), do: List.replace_at(acc, idx, @floor), else: acc
    end)
  end

  # ── CA internals ───────────────────────────────────────────────

  defp ca_step(grid, w, h, birth, survive) do
    arr = List.to_tuple(grid)

    for y <- 0..(h - 1), x <- 0..(w - 1) do
      walls = count_wall_neighbours(arr, w, h, x, y)
      cur = elem(arr, y * w + x)

      cond do
        x == 0 or y == 0 or x == w - 1 or y == h - 1 -> @wall
        cur == @wall and walls >= survive -> @wall
        cur == @floor and walls >= birth -> @wall
        true -> @floor
      end
    end
  end

  defp count_wall_neighbours(arr, w, h, cx, cy) do
    for dy <- -1..1, dx <- -1..1, not (dx == 0 and dy == 0), reduce: 0 do
      n ->
        x = cx + dx
        y = cy + dy

        if x < 0 or y < 0 or x >= w or y >= h do
          n + 1
        else
          if elem(arr, y * w + x) == @wall, do: n + 1, else: n
        end
    end
  end

  # ── Maze internals ─────────────────────────────────────────────

  defp carve_maze(grid, w, _h, cx, cy, _cw, _ch, visited) do
    # Convert cell coords to tile coords (1-indexed odd lattice)
    tx = cx * 2 + 1
    ty = cy * 2 + 1

    grid =
      if tx < w - 1 do
        idx = ty * w + tx
        List.replace_at(grid, idx, @floor)
      else
        grid
      end

    visited = MapSet.put(visited, {cx, cy})

    [{0, -1}, {1, 0}, {0, 1}, {-1, 0}]
    |> Enum.shuffle()
    |> Enum.reduce({grid, visited}, fn {dx, dy}, {g, v} ->
      ncx = cx + dx
      ncy = cy + dy

      if MapSet.member?(v, {ncx, ncy}) or ncx < 0 or ncy < 0 do
        {g, v}
      else
        # Knock down the wall between (cx, cy) and (ncx, ncy)
        wall_x = tx + dx
        wall_y = ty + dy

        g2 =
          if wall_x > 0 and wall_y > 0 and wall_x < w - 1 do
            idx = wall_y * w + wall_x
            List.replace_at(g, idx, @floor)
          else
            g
          end

        carve_maze(g2, w, w, ncx, ncy, ncx, ncy, v)
      end
    end)
  end

  # ── Helpers ────────────────────────────────────────────────────

  defp solid_grid(w, h, val), do: List.duplicate(val, w * h)

  defp ground_layer_from_walls(grid, _w, _h, floor_id, _wall_id) do
    Enum.map(grid, fn t -> if t == @wall, do: t, else: floor_id end)
  end

  defp passability_from_walls(grid, _w, _h) do
    Enum.map(grid, fn t -> if t == @wall, do: 1, else: 0 end)
  end

  defp ring(w, h, val) do
    for y <- 0..(h - 1), x <- 0..(w - 1), x == 0 or y == 0 or x == w - 1 or y == h - 1 do
      %{x: x, y: y, value: val}
    end
  end

  defp interior(w, h, val) do
    for y <- 1..(h - 2), x <- 1..(w - 2), do: %{x: x, y: y, value: val}
  end

  defp pillars_4(w, h) do
    [
      %{x: 2, y: 2, value: @wall},
      %{x: w - 3, y: 2, value: @wall},
      %{x: 2, y: h - 3, value: @wall},
      %{x: w - 3, y: h - 3, value: @wall}
    ]
  end

  defp seed_rng(nil), do: :rand.seed(:exsplus)
  defp seed_rng(seed) when is_integer(seed), do: :rand.seed(:exsplus, {seed, seed * 7 + 1, seed * 13 + 3})
  defp seed_rng(_), do: :rand.seed(:exsplus)
end
