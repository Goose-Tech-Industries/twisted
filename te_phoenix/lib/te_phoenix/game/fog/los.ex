defmodule TePhoenix.Game.Fog.LOS do
  @moduledoc """
  Recursive shadowcasting line-of-sight per Albert Ford's reference
  algorithm — https://www.albertford.com/shadowcasting/

  Eight octants are scanned independently. Each octant walks rows
  outward from the origin, tracking a "slope window" of visibility
  that narrows when blocking tiles are encountered. The same tile
  hit by multiple octants is just inserted into the result MapSet
  twice (idempotent).

  ## Public API

      compute_visible(origin, radius, map_size, blockers_fn)
      → MapSet.t({integer, integer})

  ### Args

    * `origin` — `{x, y}` of the viewer (always included in result)
    * `radius` — vision range in tiles (Chebyshev distance)
    * `map_size` — `{width, height}` for boundary clipping
    * `blockers_fn` — `({x, y}) -> boolean`. Return true if the tile
      blocks vision. The blocker tile itself IS visible (you can see
      the wall, just not through it) — only tiles past it are dark.

  ## Performance

  Scanning radius 10 on a 50×50 map runs in ~5-15ms on the dev box.
  The `blockers_fn` is called O(visible_tiles) times — pre-build a
  passability map outside this call rather than hitting the DB per
  tile.

  ## Future tuning

  - Diagonal weighting: shadowcasting treats diagonals as 1 step;
    if combat balance wants stricter line-of-sight, swap to symmetric
    shadowcasting (same source, "Symmetric" subsection).
  - Caching: compute_visible is pure, so the caller can memo by
    `{origin, radius, blockers_hash}`. We don't memo here — the
    `Fog.compute_view/2` caller decides.
  """

  @type point :: {integer(), integer()}
  @type bounds :: {integer(), integer()}
  @type blockers_fn :: (point -> boolean())

  @doc """
  Compute the set of `{x, y}` tiles visible from `origin` within
  `radius`. Returns a `MapSet`.
  """
  def compute_visible({ox, oy} = origin, radius, {map_w, map_h} = bounds, blockers_fn)
      when is_integer(ox) and is_integer(oy) and is_integer(radius) and radius >= 0 do
    initial =
      if in_bounds?(origin, bounds), do: MapSet.new([origin]), else: MapSet.new()

    if radius == 0 do
      initial
    else
      Enum.reduce(0..7, initial, fn octant, acc ->
        scan_octant(octant, origin, 1, 1.0, 0.0, radius, bounds, blockers_fn, acc)
      end)
      |> clip_to_radius(origin, radius)
      |> clip_to_bounds(map_w, map_h)
    end
  end

  def compute_visible(_, _, _, _), do: MapSet.new()

  # ── Recursive shadowcasting core ────────────────────────────────

  # `octant` is 0-7. Each octant transforms (row, col) → (dx, dy)
  # relative to origin, then we add origin to get world coords.
  # Octants:
  #   0: +X, +Y (NE)        4: -X, -Y (SW)
  #   1: +X, -Y (NW)        5: -X, +Y (SE)
  #   2: +Y, +X (E)         6: -Y, -X (W)
  #   3: +Y, -X (W)         7: -Y, +X (E)
  defp scan_octant(_octant, _origin, _row, start_slope, end_slope, _max_row, _bounds, _blockers, acc)
       when start_slope < end_slope do
    acc
  end

  defp scan_octant(_octant, _origin, row, _start_slope, _end_slope, max_row, _bounds, _blockers, acc)
       when row > max_row do
    acc
  end

  defp scan_octant(octant, origin, row, start_slope, end_slope, max_row, bounds, blockers, acc) do
    # Iterate columns in this row from the inside out. start_slope is
    # the steeper edge; end_slope is the shallower. We track whether
    # the previous column was a blocker so a run of blockers narrows
    # the slope window when we recurse for the next row.
    {acc, _next_start, blocked_at_end?} =
      Enum.reduce(row..0, {acc, start_slope, false}, fn col, {a, cur_start, was_blocked} ->
        l_slope = (col + 0.5) / (row - 0.5)
        r_slope = (col - 0.5) / (row + 0.5)

        cond do
          cur_start < r_slope ->
            {a, cur_start, was_blocked}

          end_slope > l_slope ->
            {a, cur_start, was_blocked}

          true ->
            tile = transform(octant, row, col, origin)
            in_radius? = (col * col + row * row) <= max_row * max_row
            in_bounds? = in_bounds?(tile, bounds)

            a =
              if in_radius? and in_bounds? do
                MapSet.put(a, tile)
              else
                a
              end

            blocking? = in_bounds? and blockers.(tile)

            cond do
              was_blocked and blocking? ->
                # Still in a run of blockers — keep scanning to track
                # the run's leading edge but no recurse yet.
                {a, l_slope, true}

              was_blocked and not blocking? ->
                # Run of blockers ended; new clear column. Reset
                # cur_start to this column's left slope.
                {a, l_slope, false}

              not was_blocked and blocking? ->
                # First blocker after a clear run. Recurse for the
                # next row using the slope window above this blocker.
                a2 =
                  scan_octant(
                    octant,
                    origin,
                    row + 1,
                    cur_start,
                    l_slope,
                    max_row,
                    bounds,
                    blockers,
                    a
                  )

                {a2, l_slope, true}

              true ->
                # Open tile in an open run — keep scanning.
                {a, cur_start, false}
            end
        end
      end)

    # If the row ended without entering a blocker, recurse to the
    # next row with the original slope window. If it ended IN a
    # blocker, no more visibility past that point in this octant.
    if blocked_at_end? do
      acc
    else
      scan_octant(octant, origin, row + 1, start_slope, end_slope, max_row, bounds, blockers, acc)
    end
  end

  # ── Octant transforms ────────────────────────────────────────────

  defp transform(0, row, col, {ox, oy}), do: {ox + col, oy - row}
  defp transform(1, row, col, {ox, oy}), do: {ox + row, oy - col}
  defp transform(2, row, col, {ox, oy}), do: {ox + row, oy + col}
  defp transform(3, row, col, {ox, oy}), do: {ox + col, oy + row}
  defp transform(4, row, col, {ox, oy}), do: {ox - col, oy + row}
  defp transform(5, row, col, {ox, oy}), do: {ox - row, oy + col}
  defp transform(6, row, col, {ox, oy}), do: {ox - row, oy - col}
  defp transform(7, row, col, {ox, oy}), do: {ox - col, oy - row}

  # ── Helpers ──────────────────────────────────────────────────────

  defp in_bounds?({x, y}, {w, h}), do: x >= 0 and y >= 0 and x < w and y < h

  defp clip_to_radius(set, {ox, oy}, radius) do
    r2 = radius * radius

    set
    |> Enum.filter(fn {x, y} ->
      dx = x - ox
      dy = y - oy
      dx * dx + dy * dy <= r2
    end)
    |> MapSet.new()
  end

  defp clip_to_bounds(set, w, h) do
    set
    |> Enum.filter(fn {x, y} -> x >= 0 and y >= 0 and x < w and y < h end)
    |> MapSet.new()
  end
end
