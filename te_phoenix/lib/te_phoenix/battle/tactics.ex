defmodule TePhoenix.Battle.Tactics do
  @moduledoc """
  Grid tactics: line-of-sight, cover, flanking, elevation advantage.

  ## Line of Sight (LOS)

  Bresenham's line algorithm on the battle grid. A tile blocks LOS if
  it has a blocking object (`battle_objects`) or a blocking surface.
  Ranged attacks and spells require LOS to the target unless the skill
  has `"ignore_los": true`.

  ## Cover

  Objects on the grid (crates, walls, pillars) provide cover to
  combatants adjacent to them. Cover reduces incoming ranged damage:

    * Half cover (one side): -25% ranged damage
    * Three-quarter cover (two sides): -50% ranged damage
    * Full cover (behind wall): blocks targeting entirely

  Cover only applies to ranged attacks. Melee ignores cover.

  ## Flanking

  Attacking from behind or the sides grants a flanking bonus:

    * Side flank (90° from facing): +15% damage
    * Rear flank (behind target): +25% damage + ignore cover

  Facing is determined by the target's last movement direction or
  their `cone_direction` from the vision system.

  ## Elevation

  Tiles at different elevation levels affect combat:

    * Higher ground: +10% damage, +1 range
    * Lower ground: -10% damage, -1 range
    * Same level: no modifier

  All values are settings-driven and editable.
  """

  alias TePhoenix.Battle.Combatant

  # ── Line of Sight ───────────────────────────────────────────────

  @doc """
  Check if there's a clear line of sight between two grid positions.
  Uses Bresenham's line algorithm. Returns `true` if LOS is clear.
  """
  def has_los?(state, x1, y1, x2, y2) do
    if not (state.settings[:enable_los] || false) do
      true
    else
      blocking = blocking_tiles(state)
      bresenham_clear?(x1, y1, x2, y2, blocking)
    end
  end

  @doc "Check LOS between two combatants."
  def has_los?(state, %Combatant{} = a, %Combatant{} = b) do
    has_los?(state, a.grid_x, a.grid_y, b.grid_x, b.grid_y)
  end

  defp blocking_tiles(state) do
    objects = state.battle_objects || %{}

    obj_tiles =
      objects
      |> Enum.filter(fn {_key, obj} -> obj[:blocking] == true end)
      |> Enum.map(fn {key, _obj} ->
        case String.split(key, ",") do
          [xs, ys] -> {String.to_integer(xs), String.to_integer(ys)}
          _ -> nil
        end
      end)
      |> Enum.reject(&is_nil/1)
      |> MapSet.new()

    # Also check surfaces that block
    surface_tiles =
      (state.terrain_map || %{})
      |> Enum.filter(fn {_key, surface_key} ->
        sdef = TePhoenix.Battle.Surfaces.get_def(surface_key)
        sdef && sdef.blocks_movement
      end)
      |> Enum.map(fn {key, _} ->
        case String.split(key, ",") do
          [xs, ys] -> {String.to_integer(xs), String.to_integer(ys)}
          _ -> nil
        end
      end)
      |> Enum.reject(&is_nil/1)
      |> MapSet.new()

    MapSet.union(obj_tiles, surface_tiles)
  end

  defp bresenham_clear?(x1, y1, x2, y2, blocking) do
    dx = abs(x2 - x1)
    dy = abs(y2 - y1)
    sx = if x1 < x2, do: 1, else: -1
    sy = if y1 < y2, do: 1, else: -1

    walk_bresenham(x1, y1, x2, y2, dx, dy, sx, sy, dx - dy, blocking)
  end

  defp walk_bresenham(x, y, x2, y2, _dx, _dy, _sx, _sy, _err, _blocking) when x == x2 and y == y2, do: true

  defp walk_bresenham(x, y, x2, y2, dx, dy, sx, sy, err, blocking) do
    # Skip start and end tiles
    if {x, y} != {x2, y2} and MapSet.member?(blocking, {x, y}) do
      false
    else
      e2 = 2 * err
      {x, err} = if e2 > -dy, do: {x + sx, err - dy}, else: {x, err}
      {y, err} = if e2 < dx, do: {y + sy, err + dx}, else: {y, err}
      walk_bresenham(x, y, x2, y2, dx, dy, sx, sy, err, blocking)
    end
  end

  # ── Cover ───────────────────────────────────────────────────────

  @doc """
  Calculate the cover bonus for a defender against an attacker.
  Returns a damage reduction multiplier (1.0 = no cover, 0.5 = half).
  """
  def cover_bonus(state, attacker, defender) do
    if not (state.settings[:enable_cover] || false) do
      1.0
    else
      objects = state.battle_objects || %{}

      # Check tiles adjacent to defender for blocking objects
      # that are between attacker and defender
      ax = attacker.grid_x
      ay = attacker.grid_y
      dx = defender.grid_x
      dy = defender.grid_y

      # Direction from attacker to defender
      dir_x = sign(dx - ax)
      dir_y = sign(dy - ay)

      # Check tiles that would provide cover (between attacker and defender)
      cover_positions = [
        {dx - dir_x, dy},
        {dx, dy - dir_y},
        {dx - dir_x, dy - dir_y}
      ]

      cover_count =
        Enum.count(cover_positions, fn {cx, cy} ->
          key = "#{cx},#{cy}"
          obj = Map.get(objects, key)
          obj && obj[:blocking] == true
        end)

      half = state.settings[:cover_half_reduction] || 0.25
      three_quarter = state.settings[:cover_three_quarter_reduction] || 0.50

      cond do
        cover_count >= 2 -> 1.0 - three_quarter
        cover_count == 1 -> 1.0 - half
        true -> 1.0
      end
    end
  end

  # ── Flanking ────────────────────────────────────────────────────

  @doc """
  Calculate the flanking bonus for an attacker hitting a defender.
  Returns a damage multiplier (1.0 = no flank, 1.25 = rear flank).
  """
  def flanking_bonus(state, attacker, defender) do
    if not (state.settings[:enable_flanking] || false) do
      1.0
    else
      facing = Map.get(defender, :cone_direction, "south")

      ax = attacker.grid_x
      ay = attacker.grid_y
      dx = defender.grid_x
      dy = defender.grid_y

      attack_angle = :math.atan2(ay - dy, ax - dx) * 180 / :math.pi()

      facing_angle =
        case facing do
          "east" -> 0
          "northeast" -> 45
          "north" -> 90
          "northwest" -> 135
          "west" -> 180
          "southwest" -> -135
          "south" -> -90
          "southeast" -> -45
          _ -> -90
        end

      diff = abs(attack_angle - facing_angle)
      diff = if diff > 180, do: 360 - diff, else: diff

      side_bonus = state.settings[:flanking_side_bonus] || 0.15
      rear_bonus = state.settings[:flanking_rear_bonus] || 0.25

      cond do
        diff >= 135 -> 1.0 + rear_bonus
        diff >= 75 -> 1.0 + side_bonus
        true -> 1.0
      end
    end
  end

  # ── Elevation ───────────────────────────────────────────────────

  @doc """
  Calculate elevation advantage modifier.
  Returns a damage multiplier.
  """
  def elevation_modifier(state, attacker, defender) do
    if not (state.settings[:enable_elevation_combat] || false) do
      1.0
    else
      elev_map = state.elevation_map || %{}
      a_elev = Map.get(elev_map, "#{attacker.grid_x},#{attacker.grid_y}", 0)
      d_elev = Map.get(elev_map, "#{defender.grid_x},#{defender.grid_y}", 0)

      high_bonus = state.settings[:elevation_high_ground_bonus] || 0.10
      low_penalty = state.settings[:elevation_low_ground_penalty] || 0.10

      cond do
        a_elev > d_elev -> 1.0 + high_bonus
        a_elev < d_elev -> 1.0 - low_penalty
        true -> 1.0
      end
    end
  end

  # ── Combined tactical modifier ──────────────────────────────────

  @doc """
  Calculate all tactical modifiers in one call. Returns a map:
  `%{cover: 0.75, flanking: 1.25, elevation: 1.10, los: true, combined: mult}`.
  """
  def calculate(state, attacker, defender) do
    los = has_los?(state, attacker, defender)
    cover = cover_bonus(state, attacker, defender)
    flank = flanking_bonus(state, attacker, defender)
    elev = elevation_modifier(state, attacker, defender)

    combined = cover * flank * elev

    %{
      los: los,
      cover: cover,
      flanking: flank,
      elevation: elev,
      combined: combined
    }
  end

  defp sign(0), do: 0
  defp sign(n) when n > 0, do: 1
  defp sign(_), do: -1
end
