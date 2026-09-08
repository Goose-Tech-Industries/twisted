defmodule TePhoenix.World.MapGenerators do
  @moduledoc """
  Procedural map generators for Twisted Engine:
  1. BSP Dungeon - Binary Space Partitioning generates structured rooms and corridors.
  2. Cellular Automata Cave - Simulates organic natural caverns and grottos.
  3. Recursive Backtracker Maze - Generates perfect labyrinths and crypt puzzle layouts.

  Outputs ready-to-use map layer maps with ground, elevation, and passability.
  """

  @doc """
  Generates a BSP Dungeon with rooms and corridors.
  """
  def generate_dungeon(w, h, opts \\ []) do
    floor_id = Keyword.get(opts, :floor_id, 5) # 5 = cobble
    wall_id = Keyword.get(opts, :wall_id, 1)    # 1 = stone
    elevated_walls? = Keyword.get(opts, :elevated_walls, true)

    # Start with all walls
    tiles = :array.new(w * h, default: wall_id)

    # Partition and carve rooms
    {tiles_with_rooms, rooms} = split_bsp(tiles, 0, 0, w, h, 4, w, floor_id, [])

    # Connect rooms with corridors
    final_tiles = connect_rooms(tiles_with_rooms, rooms, w, floor_id)
    tiles_list = :array.to_list(final_tiles)

    # Compute elevation and passability
    elevation =
      if elevated_walls? do
        Enum.map(tiles_list, fn t -> if t == wall_id, do: 1, else: 0 end)
      else
        Enum.map(tiles_list, fn _ -> 0 end)
      end

    passability = Enum.map(tiles_list, fn t -> if t == wall_id, do: 1, else: 0 end)

    %{
      ground: tiles_list,
      elevation: elevation,
      passability: passability,
      rooms: rooms
    }
  end

  @doc """
  Generates an organic cave using cellular automata (4-5 rule).
  """
  def generate_cave(w, h, opts \\ []) do
    floor_id = Keyword.get(opts, :floor_id, 6) # 6 = cave floor
    wall_id = Keyword.get(opts, :wall_id, 1)    # 1 = stone
    elevated_walls? = Keyword.get(opts, :elevated_walls, true)
    iterations = Keyword.get(opts, :iterations, 5)

    # Initial random noise (45% walls, borders always walls)
    initial =
      for y <- 0..(h - 1), x <- 0..(w - 1) do
        if x == 0 or x == w - 1 or y == 0 or y == h - 1 do
          wall_id
        else
          if :rand.uniform() < 0.45, do: wall_id, else: floor_id
        end
      end

    arr = :array.from_list(initial)

    # Run cellular automata smoothing
    smoothed =
      Enum.reduce(1..iterations, arr, fn _iter, current_arr ->
        step_ca(current_arr, w, h, wall_id, floor_id)
      end)

    tiles_list = :array.to_list(smoothed)

    elevation =
      if elevated_walls? do
        Enum.map(tiles_list, fn t -> if t == wall_id, do: 1, else: 0 end)
      else
        Enum.map(tiles_list, fn _ -> 0 end)
      end

    passability = Enum.map(tiles_list, fn t -> if t == wall_id, do: 1, else: 0 end)

    %{
      ground: tiles_list,
      elevation: elevation,
      passability: passability
    }
  end

  @doc """
  Generates a labyrinth using recursive backtracking.
  """
  def generate_maze(w, h, opts \\ []) do
    floor_id = Keyword.get(opts, :floor_id, 5) # 5 = cobble
    wall_id = Keyword.get(opts, :wall_id, 1)    # 1 = stone
    elevated_walls? = Keyword.get(opts, :elevated_walls, true)

    # Maze grid dimensions
    mw = max(1, div(w - 1, 2))
    mh = max(1, div(h - 1, 2))

    tiles = :array.new(w * h, default: wall_id)
    visited = :array.new(mw * mh, default: false)

    # Carve start at 0, 0
    tx0 = 1
    ty0 = 1
    tiles = :array.set(ty0 * w + tx0, floor_id, tiles)
    visited = :array.set(0, true, visited)

    {final_tiles, _} = carve_maze_loop([0], tiles, visited, mw, mh, w, floor_id)
    tiles_list = :array.to_list(final_tiles)

    elevation =
      if elevated_walls? do
        Enum.map(tiles_list, fn t -> if t == wall_id, do: 1, else: 0 end)
      else
        Enum.map(tiles_list, fn _ -> 0 end)
      end

    passability = Enum.map(tiles_list, fn t -> if t == wall_id, do: 1, else: 0 end)

    %{
      ground: tiles_list,
      elevation: elevation,
      passability: passability
    }
  end

  # -- Internal BSP Helpers ------------------------------------------

  defp split_bsp(tiles, x, y, rw, rh, depth, map_w, floor_id, rooms) do
    if depth <= 0 or rw < 8 or rh < 8 do
      # Carve room
      room_w = max(3, :rand.uniform(max(1, rw - 4)) + 2)
      room_h = max(3, :rand.uniform(max(1, rh - 4)) + 2)
      rx = x + :rand.uniform(max(1, rw - room_w - 1))
      ry = y + :rand.uniform(max(1, rh - room_h - 1))

      new_tiles =
        Enum.reduce(0..(room_h - 1), tiles, fn dy, t_acc ->
          Enum.reduce(0..(room_w - 1), t_acc, fn dx, inner_acc ->
            :array.set((ry + dy) * map_w + (rx + dx), floor_id, inner_acc)
          end)
        end)

      {new_tiles, [%{x: rx, y: ry, w: room_w, h: room_h} | rooms]}
    else
      if rw > rh do
        split = div(trunc(rw * 0.35 + :rand.uniform() * rw * 0.3), 1)
        {t1, r1} = split_bsp(tiles, x, y, split, rh, depth - 1, map_w, floor_id, rooms)
        split_bsp(t1, x + split, y, rw - split, rh, depth - 1, map_w, floor_id, r1)
      else
        split = div(trunc(rh * 0.35 + :rand.uniform() * rh * 0.3), 1)
        {t1, r1} = split_bsp(tiles, x, y, rw, split, depth - 1, map_w, floor_id, rooms)
        split_bsp(t1, x, y + split, rw, rh - split, depth - 1, map_w, floor_id, r1)
      end
    end
  end

  defp connect_rooms(tiles, rooms, _map_w, _floor_id) when length(rooms) < 2, do: tiles
  defp connect_rooms(tiles, rooms, map_w, floor_id) do
    Enum.chunk_every(rooms, 2, 1, :discard)
    |> Enum.reduce(tiles, fn [a, b], acc ->
      ax = div(a.x + div(a.w, 2), 1)
      ay = div(a.y + div(a.h, 2), 1)
      bx = div(b.x + div(b.w, 2), 1)
      by = div(b.y + div(b.h, 2), 1)

      carve_corridor(acc, ax, ay, bx, by, map_w, floor_id)
    end)
  end

  defp carve_corridor(tiles, ax, ay, bx, by, map_w, floor_id) do
    step_x = if bx >= ax, do: 1, else: -1
    step_y = if by >= ay, do: 1, else: -1

    t1 =
      Enum.reduce(ax..bx//step_x, tiles, fn cx, acc ->
        :array.set(ay * map_w + cx, floor_id, acc)
      end)

    Enum.reduce(ay..by//step_y, t1, fn cy, acc ->
      :array.set(cy * map_w + bx, floor_id, acc)
    end)
  end

  # -- Internal Cellular Automata Helpers ---------------------------

  defp step_ca(arr, w, h, wall_id, floor_id) do
    new_list =
      for y <- 0..(h - 1), x <- 0..(w - 1) do
        if x == 0 or x == w - 1 or y == 0 or y == h - 1 do
          wall_id
        else
          walls = count_neighbor_walls(arr, x, y, w, h, wall_id)
          if walls >= 5, do: wall_id, else: floor_id
        end
      end

    :array.from_list(new_list)
  end

  defp count_neighbor_walls(arr, x, y, w, h, wall_id) do
    for dy <- -1..1, dx <- -1..1, reduce: 0 do
      acc ->
        nx = x + dx
        ny = y + dy

        if nx >= 0 and nx < w and ny >= 0 and ny < h do
          if :array.get(ny * w + nx, arr) == wall_id, do: acc + 1, else: acc
        else
          acc + 1
        end
    end
  end

  # -- Internal Maze Helpers ----------------------------------------

  defp carve_maze_loop([], tiles, visited, _mw, _mh, _w, _floor_id), do: {tiles, visited}

  defp carve_maze_loop([ci | rest_stack] = stack, tiles, visited, mw, mh, w, floor_id) do
    cx = rem(ci, mw)
    cy = div(ci, mw)

    dirs = [{0, -1}, {0, 1}, {-1, 0}, {1, 0}]

    neighbors =
      Enum.filter(dirs, fn {dx, dy} ->
        nx = cx + dx
        ny = cy + dy
        nx >= 0 and nx < mw and ny >= 0 and ny < mh and not :array.get(ny * mw + nx, visited)
      end)

    case neighbors do
      [] ->
        carve_maze_loop(rest_stack, tiles, visited, mw, mh, w, floor_id)

      valid_neighbors ->
        {dx, dy} = Enum.random(valid_neighbors)
        nx = cx + dx
        ny = cy + dy

        wall_x = cx * 2 + 1 + dx
        wall_y = cy * 2 + 1 + dy
        target_x = nx * 2 + 1
        target_y = ny * 2 + 1

        t1 = :array.set(wall_y * w + wall_x, floor_id, tiles)
        t2 = :array.set(target_y * w + target_x, floor_id, t1)

        ni = ny * mw + nx
        v2 = :array.set(ni, true, visited)

        carve_maze_loop([ni | stack], t2, v2, mw, mh, w, floor_id)
    end
  end
end
