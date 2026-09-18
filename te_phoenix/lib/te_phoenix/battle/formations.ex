defmodule TePhoenix.Battle.Formations do
  @moduledoc """
  RTS-style formation and group movement system for battle units.

  Supports five formation types (:line, :wedge, :box, :circle, :column),
  group pathfinding with spacing, attack-move, and patrol loops.

  All public functions are gated on the `enable_formations` battle setting.
  Formation positions are calculated as offsets from a center point, rotated
  by the group's facing angle. Group pathfinding delegates to
  `TePhoenix.Pathfinding` with per-unit offset so units don't stack.
  """

  alias TePhoenix.Battle.{Combatant, Settings}
  alias TePhoenix.Pathfinding

  @formation_types [:line, :wedge, :box, :circle, :column]

  @typedoc "A position assignment for one unit."
  @type assignment :: {char_id :: integer(), target_x :: integer(), target_y :: integer()}

  @typedoc "A waypoint coordinate."
  @type waypoint :: {integer(), integer()}

  # ── Formation assignment ───────────────────────────────────────

  @doc """
  Assign formation positions for a list of units around a center point.

  Returns a list of `{char_id, target_x, target_y}` tuples. Units are
  placed in order, with their offset positions rotated by `facing` radians
  (0 = east, pi/2 = north). Unrecognized formation types fall back to `:line`.
  """
  @spec assign_formation([integer()], atom(), number(), number(), number()) ::
          {:ok, [assignment()]} | {:error, atom()}
  def assign_formation([], _type, _cx, _cy, _facing), do: {:ok, []}

  def assign_formation(units, type, center_x, center_y, facing \\ 0.0) do
    with :ok <- check_enabled() do
      type = if type in @formation_types, do: type, else: :line
      offsets = calculate_offsets(type, length(units))
      rotated = rotate_offsets(offsets, facing)

      assignments =
        units
        |> Enum.zip(rotated)
        |> Enum.map(fn {char_id, {dx, dy}} ->
          {char_id, round(center_x + dx), round(center_y + dy)}
        end)

      {:ok, assignments}
    end
  end

  # ── Attack-move ────────────────────────────────────────────────

  @doc """
  Move the group toward `{target_x, target_y}`, engaging any enemies found
  along the path.

  For each unit, checks whether any enemy combatant occupies a tile adjacent
  to the unit's current position on the path. If so, the unit stops and
  the result includes an `{:engage, char_id, enemy_id}` entry. Units that
  reach the destination without encountering enemies get `{:arrived, char_id}`.

  Returns `{state, results}` where results is a list of per-unit outcomes.
  """
  @spec attack_move(map(), [integer()], integer(), integer()) ::
          {:error, atom()} | {map(), list()}
  def attack_move(state, group_char_ids, target_x, target_y) do
    with :ok <- check_enabled() do
      combatants = state.combatants
      enemies = find_enemies(combatants, group_char_ids)

      results =
        Enum.map(group_char_ids, fn char_id ->
          case Map.get(combatants, char_id) do
            nil ->
              {:skip, char_id}

            unit ->
              # Check if any enemy is within melee range (adjacent tile)
              adjacent_enemy =
                Enum.find(enemies, fn {_eid, enemy} ->
                  dx = abs(enemy.grid_x - unit.grid_x)
                  dy = abs(enemy.grid_y - unit.grid_y)
                  dx <= 1 and dy <= 1 and Combatant.alive?(enemy)
                end)

              case adjacent_enemy do
                {enemy_id, _enemy} ->
                  {:engage, char_id, enemy_id}

                nil ->
                  # Move one step toward target
                  {step_x, step_y} = step_toward(unit.grid_x, unit.grid_y, target_x, target_y)

                  if step_x == unit.grid_x and step_y == unit.grid_y do
                    {:arrived, char_id}
                  else
                    {:moving, char_id, step_x, step_y}
                  end
              end
          end
        end)

      # Apply movement to state for units that are moving
      updated_combatants =
        Enum.reduce(results, combatants, fn
          {:moving, char_id, x, y}, acc ->
            case Map.get(acc, char_id) do
              nil -> acc
              c -> Map.put(acc, char_id, %{c | grid_x: x, grid_y: y, has_moved: true})
            end

          _, acc ->
            acc
        end)

      new_state = %{state | combatants: updated_combatants}
      {new_state, results}
    end
  end

  # ── Patrol ─────────────────────────────────────────────────────

  @doc """
  Set up a patrol loop for a group of units cycling through the given
  waypoints. Stores patrol data in the battle state under `:patrol_groups`.

  Each patrol group tracks the current waypoint index and advances when
  the group center is within 1 tile of the current waypoint. Call
  `advance_patrol/2` each tick to step the patrol forward.

  Returns `{:ok, updated_state}`.
  """
  @spec patrol(map(), [integer()], [waypoint()]) :: {:error, atom()} | {:ok, map()}
  def patrol(state, group_char_ids, waypoints) when is_list(waypoints) and length(waypoints) >= 2 do
    with :ok <- check_enabled() do
      group_key = make_group_key(group_char_ids)

      patrol_data = %{
        char_ids: group_char_ids,
        waypoints: waypoints,
        current_wp_idx: 0,
        laps: 0,
        started_at: System.system_time(:millisecond)
      }

      patrols = Map.get(state, :patrol_groups, %{})
      new_state = Map.put(state, :patrol_groups, Map.put(patrols, group_key, patrol_data))

      {:ok, new_state}
    end
  end

  def patrol(_state, _ids, _waypoints), do: {:error, :need_at_least_two_waypoints}

  @doc """
  Advance all patrol groups one step. For each group, if the group center
  is within range of the current waypoint, advance to the next waypoint
  (wrapping around). Then move each unit one step toward the current
  waypoint with formation spacing.

  Returns `{updated_state, movements}` where movements is a list of
  `{char_id, new_x, new_y}` tuples.
  """
  @spec advance_patrol(map(), atom()) :: {map(), [assignment()]}
  def advance_patrol(state, formation_type \\ :column) do
    patrols = Map.get(state, :patrol_groups, %{})

    if map_size(patrols) == 0 do
      {state, []}
    else
      {new_patrols, all_movements, new_combatants} =
        Enum.reduce(patrols, {%{}, [], state.combatants}, fn {key, pd}, {pacc, macc, combs} ->
          {wp_x, wp_y} = Enum.at(pd.waypoints, pd.current_wp_idx)
          {cx, cy} = group_center(combs, pd.char_ids)

          # Advance waypoint if center is close enough
          dist = abs(cx - wp_x) + abs(cy - wp_y)

          pd =
            if dist <= 1 do
              next_idx = rem(pd.current_wp_idx + 1, length(pd.waypoints))
              laps = if next_idx == 0, do: pd.laps + 1, else: pd.laps
              %{pd | current_wp_idx: next_idx, laps: laps}
            else
              pd
            end

          # Move units toward current waypoint in formation
          {cur_wp_x, cur_wp_y} = Enum.at(pd.waypoints, pd.current_wp_idx)
          facing = :math.atan2(cur_wp_y - cy, cur_wp_x - cx)

          case assign_formation(pd.char_ids, formation_type, cur_wp_x, cur_wp_y, facing) do
            {:ok, assignments} ->
              {movements, combs2} =
                Enum.reduce(assignments, {[], combs}, fn {cid, tx, ty}, {mvs, cs} ->
                  case Map.get(cs, cid) do
                    nil ->
                      {mvs, cs}

                    c ->
                      {sx, sy} = step_toward(c.grid_x, c.grid_y, tx, ty)
                      c2 = %{c | grid_x: sx, grid_y: sy}
                      {[{cid, sx, sy} | mvs], Map.put(cs, cid, c2)}
                  end
                end)

              {Map.put(pacc, key, pd), movements ++ macc, combs2}

            _ ->
              {Map.put(pacc, key, pd), macc, combs}
          end
        end)

      new_state = %{state | combatants: new_combatants, patrol_groups: new_patrols}
      {new_state, all_movements}
    end
  end

  @doc """
  Remove a patrol group. Pass the same char_ids used to create the patrol.
  """
  @spec cancel_patrol(map(), [integer()]) :: map()
  def cancel_patrol(state, group_char_ids) do
    key = make_group_key(group_char_ids)
    patrols = Map.get(state, :patrol_groups, %{})
    Map.put(state, :patrol_groups, Map.delete(patrols, key))
  end

  # ── Group pathfinding ──────────────────────────────────────────

  @doc """
  Find paths for all units in a group to positions near `{target_x, target_y}`,
  with spacing offsets so they don't stack on the same tile.

  Delegates to `TePhoenix.Pathfinding.path/4` for each unit. Units are
  assigned offset destinations based on their position in the group (spread
  out in a circle around the target).

  Requires passability data in `opts` (`:width`, `:height`, and the passability
  list). Returns `{:ok, path_map}` where path_map is `%{char_id => path}`,
  or `{:error, reason}` if pathfinding is disabled.
  """
  @spec group_pathfind(map(), [integer()], integer(), integer(), keyword()) ::
          {:ok, %{integer() => list()}} | {:error, atom()}
  def group_pathfind(state, group_char_ids, target_x, target_y, opts \\ []) do
    with :ok <- check_enabled() do
      combatants = state.combatants
      count = length(group_char_ids)
      # Spread units in a circle around the target to avoid stacking
      offsets = spacing_offsets(count)

      path_map =
        group_char_ids
        |> Enum.zip(offsets)
        |> Enum.reduce(%{}, fn {char_id, {dx, dy}}, acc ->
          case Map.get(combatants, char_id) do
            nil ->
              acc

            c ->
              dest_x = target_x + dx
              dest_y = target_y + dy
              start = {c.grid_x, c.grid_y}
              goal = {dest_x, dest_y}

              case Pathfinding.path(start, goal, Keyword.get(opts, :passability, []), opts) do
                {:ok, path} -> Map.put(acc, char_id, path)
                {:error, _} -> Map.put(acc, char_id, [start])
              end
          end
        end)

      {:ok, path_map}
    end
  end

  # ── Formation math ─────────────────────────────────────────────

  @doc false
  def calculate_offsets(:line, count) do
    half = (count - 1) / 2.0
    for i <- 0..(count - 1), do: {0.0, i - half}
  end

  def calculate_offsets(:column, count) do
    half = (count - 1) / 2.0
    for i <- 0..(count - 1), do: {i - half, 0.0}
  end

  def calculate_offsets(:wedge, count) do
    # V-shape: leader at front, units fan out behind
    for i <- 0..(count - 1) do
      if i == 0 do
        {0.0, 0.0}
      else
        side = if rem(i, 2) == 1, do: 1, else: -1
        depth = div(i + 1, 2)
        {-depth * 1.0, side * depth * 1.0}
      end
    end
  end

  def calculate_offsets(:box, count) do
    # Square/rectangle: fill row by row
    side_len = max(1, ceil(:math.sqrt(count)))
    half_x = (side_len - 1) / 2.0
    half_y = (side_len - 1) / 2.0

    for i <- 0..(count - 1) do
      row = div(i, side_len)
      col = rem(i, side_len)
      {row - half_y, col - half_x}
    end
  end

  def calculate_offsets(:circle, count) do
    if count == 1 do
      [{0.0, 0.0}]
    else
      radius = max(1.0, count / (2.0 * :math.pi()))

      for i <- 0..(count - 1) do
        angle = 2.0 * :math.pi() * i / count
        {:math.cos(angle) * radius, :math.sin(angle) * radius}
      end
    end
  end

  @doc false
  def rotate_offsets(offsets, facing) when facing == 0 or facing == 0.0, do: offsets

  def rotate_offsets(offsets, facing) do
    cos_f = :math.cos(facing)
    sin_f = :math.sin(facing)

    Enum.map(offsets, fn {dx, dy} ->
      {dx * cos_f - dy * sin_f, dx * sin_f + dy * cos_f}
    end)
  end

  # ── Internal helpers ───────────────────────────────────────────

  defp check_enabled do
    settings = Settings.load()

    if Map.get(settings, :enable_formations, true) do
      :ok
    else
      {:error, :formations_disabled}
    end
  end

  defp find_enemies(combatants, group_char_ids) do
    group_set = MapSet.new(group_char_ids)

    first_unit =
      Enum.find_value(group_char_ids, fn cid ->
        Map.get(combatants, cid)
      end)

    team_id = if first_unit, do: first_unit.team_id, else: nil

    combatants
    |> Enum.reject(fn {cid, c} ->
      MapSet.member?(group_set, cid) or c.team_id == team_id or not Combatant.alive?(c)
    end)
  end

  defp step_toward(from_x, from_y, to_x, to_y) do
    dx = to_x - from_x
    dy = to_y - from_y

    step_x =
      cond do
        dx > 0 -> from_x + 1
        dx < 0 -> from_x - 1
        true -> from_x
      end

    step_y =
      cond do
        dy > 0 -> from_y + 1
        dy < 0 -> from_y - 1
        true -> from_y
      end

    {step_x, step_y}
  end

  defp group_center(combatants, char_ids) do
    positions =
      char_ids
      |> Enum.map(&Map.get(combatants, &1))
      |> Enum.reject(&is_nil/1)

    if positions == [] do
      {0, 0}
    else
      count = length(positions)
      sum_x = Enum.sum(Enum.map(positions, & &1.grid_x))
      sum_y = Enum.sum(Enum.map(positions, & &1.grid_y))
      {div(sum_x, count), div(sum_y, count)}
    end
  end

  defp spacing_offsets(count) when count <= 1, do: [{0, 0}]

  defp spacing_offsets(count) do
    # Place first unit at target, rest spread in a circle at radius 1-2
    [{0, 0} |
      for i <- 1..(count - 1) do
        angle = 2.0 * :math.pi() * (i - 1) / (count - 1)
        radius = if count <= 5, do: 1, else: 2
        {round(:math.cos(angle) * radius), round(:math.sin(angle) * radius)}
      end]
  end

  defp make_group_key(char_ids) do
    char_ids |> Enum.sort() |> Enum.join(",")
  end
end
