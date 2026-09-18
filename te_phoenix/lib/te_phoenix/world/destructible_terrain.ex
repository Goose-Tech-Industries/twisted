defmodule TePhoenix.World.DestructibleTerrain do
  @moduledoc """
  Runtime map tile modification from combat and abilities.

  Tiles can be destroyed, transformed, or restored at runtime without
  modifying the map's base data. All modifications are tracked in the
  `game_map_modifications` table and can be bulk-reset at match end.

  ## Damage type interactions

    * `:fire` — burns trees to ash (passable), ignites grass
    * `:ice` — freezes water to ice (passable), slows on grass
    * `:explosion` — creates crater (passable pit), destroys walls
    * `:lightning` — scorches terrain, shatters ice back to water
    * `:earth` — raises walls from floor, fills craters
    * `:water` — floods craters, extinguishes fire surfaces

  ## Integration

    * `Battle.Surfaces` — destruction can leave surfaces behind
    * `MapChannel` — PubSub broadcast triggers client re-render
    * `Vision` — destroyed walls open sight lines
    * `Movement` — passability changes affect pathfinding
  """

  require Logger
  alias TePhoenix.Repo

  @mods_table "game_map_modifications"

  # Tile type constants (matching MapTemplates)
  @floor 0
  @wall 1
  @water 2
  @tree 3
  @road 4
  @sand 5
  @grass 7
  @ice 8
  @lava 9

  # Derived tiles from destruction
  @ash 20
  @crater 21
  @scorched 22
  @rubble 23
  @frozen_water 24

  # ── Setup ───────────────────────────────────────────────────────

  def ensure_tables do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@mods_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      map_id INT NOT NULL,
      x INT NOT NULL,
      y INT NOT NULL,
      original_tile INT NOT NULL,
      current_tile INT NOT NULL,
      surface_left VARCHAR(40),
      modified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      modified_by INT,
      UNIQUE KEY uk_map_pos (map_id, x, y),
      INDEX idx_map (map_id)
    )
    """)

    Logger.info("[DestructibleTerrain] tables ensured")
  end

  # ── Core API ───────────────────────────────────────────────────

  @doc """
  Destroy or transform a single tile at runtime based on damage type.

  `state` is the current map state map containing at minimum:
    * `:map_id` — the map's database ID
    * `:tiles` — 2D list of tile values (or will be fetched from DB)

  Returns `{:ok, new_tile, surface_left}` or `{:error, reason}`.
  The surface_left value (if any) should be passed to `Surfaces.place`.
  """
  def destroy_tile(state, x, y, damage_type) do
    ensure_tables()
    map_id = state[:map_id] || state["map_id"]

    unless map_id do
      {:error, :no_map_id}
    else
      original = get_tile_at(state, x, y)
      {new_tile, surface} = transform_tile(original, damage_type)

      if new_tile == original do
        {:ok, original, nil}
      else
        save_modification(map_id, x, y, original, new_tile, surface, state[:modified_by])
        broadcast_modification(map_id, x, y, new_tile, surface)
        {:ok, new_tile, surface}
      end
    end
  end

  @doc """
  Restore a tile to its original state.
  Removes the modification record and broadcasts the change.
  """
  def repair_tile(state, x, y) do
    ensure_tables()
    map_id = state[:map_id] || state["map_id"]

    case Repo.query(
           "SELECT original_tile FROM #{@mods_table} WHERE map_id = ? AND x = ? AND y = ?",
           [map_id, x, y]
         ) do
      {:ok, %{rows: [[original_tile]]}} ->
        Repo.query(
          "DELETE FROM #{@mods_table} WHERE map_id = ? AND x = ? AND y = ?",
          [map_id, x, y]
        )

        broadcast_modification(map_id, x, y, original_tile, nil)
        {:ok, original_tile}

      _ ->
        {:ok, get_tile_at(state, x, y)}
    end
  end

  @doc """
  Apply area-of-effect destruction in a radius around a center point.

  Used by projectile AoE misses, boss phase terrain changes, siege weapons.
  Returns a list of `{x, y, new_tile, surface}` for all modified tiles.
  """
  def apply_aoe_destruction(state, center_x, center_y, radius, damage_type) do
    ensure_tables()

    modifications =
      for dx <- -radius..radius,
          dy <- -radius..radius,
          dx * dx + dy * dy <= radius * radius,
          tx = center_x + dx,
          ty = center_y + dy,
          tx >= 0 and ty >= 0 do
        case destroy_tile(state, tx, ty, damage_type) do
          {:ok, new_tile, surface} -> {tx, ty, new_tile, surface}
          _ -> nil
        end
      end
      |> Enum.reject(&is_nil/1)

    Logger.info(
      "[DestructibleTerrain] AoE #{damage_type} at (#{center_x},#{center_y}) r=#{radius}: #{length(modifications)} tiles modified"
    )

    {:ok, modifications}
  end

  @doc "Get all runtime tile modifications for a map."
  def get_modifications(map_id) do
    ensure_tables()

    case Repo.query(
           "SELECT x, y, original_tile, current_tile, surface_left, modified_at, modified_by FROM #{@mods_table} WHERE map_id = ? ORDER BY modified_at",
           [map_id]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [x, y, orig, current, surface, modified_at, modified_by] ->
          %{
            x: x, y: y,
            original_tile: orig, current_tile: current,
            surface_left: surface,
            modified_at: modified_at, modified_by: modified_by
          }
        end)

      _ ->
        []
    end
  end

  @doc """
  Restore all tiles on a map to their original state.
  Used for match-end cleanup or map reset.
  """
  def reset_modifications(map_id) do
    ensure_tables()

    case Repo.query("SELECT COUNT(*) FROM #{@mods_table} WHERE map_id = ?", [map_id]) do
      {:ok, %{rows: [[count]]}} ->
        Repo.query("DELETE FROM #{@mods_table} WHERE map_id = ?", [map_id])

        Phoenix.PubSub.broadcast(
          TePhoenix.PubSub,
          "terrain:map:#{map_id}",
          {:terrain_reset, map_id}
        )

        Logger.info("[DestructibleTerrain] reset #{count} modifications on map #{map_id}")
        {:ok, count}

      _ ->
        {:ok, 0}
    end
  rescue
    _ -> {:ok, 0}
  end

  # ── Tile Transformation Rules ──────────────────────────────────

  @doc """
  Pure calculation of resulting tile ID and surface from original tile and damage type.
  """
  def transform_tile(original, damage_type) do
    case {original, damage_type} do
      # Fire effects
      {@tree, :fire} -> {@ash, "fire"}
      {@grass, :fire} -> {@scorched, "fire"}
      {@ice, :fire} -> {@water, nil}
      {24, :fire} -> {@water, nil}

      # Ice effects
      {@water, :ice} -> {@frozen_water, "ice"}
      {@grass, :ice} -> {@grass, "ice"}
      {@lava, :ice} -> {@floor, nil}

      # Explosion effects
      {@wall, :explosion} -> {@rubble, nil}
      {@tree, :explosion} -> {@crater, "fire"}
      {@floor, :explosion} -> {@crater, nil}
      {@grass, :explosion} -> {@crater, nil}
      {@road, :explosion} -> {@crater, nil}
      {@sand, :explosion} -> {@crater, nil}

      # Lightning effects
      {@ice, :lightning} -> {@water, nil}
      {24, :lightning} -> {@water, nil}
      {@tree, :lightning} -> {@scorched, "fire"}
      {@grass, :lightning} -> {@scorched, nil}

      # Earth effects (constructive)
      {@floor, :earth} -> {@wall, nil}
      {@crater, :earth} -> {@floor, nil}
      {@water, :earth} -> {@floor, nil}

      # Water effects
      {@crater, :water} -> {@water, nil}
      {@scorched, :water} -> {@floor, nil}
      {@ash, :water} -> {@floor, nil}
      {_, :water} when original == @lava -> {@floor, "steam"}

      # No transformation for unhandled combinations
      _ -> {original, nil}
    end
  end

  # ── Persistence ────────────────────────────────────────────────

  defp save_modification(map_id, x, y, original, current, surface, modified_by) do
    Repo.query(
      """
      INSERT INTO #{@mods_table} (map_id, x, y, original_tile, current_tile, surface_left, modified_by, modified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        current_tile = VALUES(current_tile),
        surface_left = VALUES(surface_left),
        modified_by = VALUES(modified_by),
        modified_at = NOW()
      """,
      [map_id, x, y, original, current, surface, modified_by]
    )
  end

  defp broadcast_modification(map_id, x, y, new_tile, surface) do
    Phoenix.PubSub.broadcast(
      TePhoenix.PubSub,
      "terrain:map:#{map_id}",
      {:terrain_modified, map_id, %{x: x, y: y, tile: new_tile, surface: surface}}
    )
  rescue
    _ -> :ok
  end

  # ── Tile Access ────────────────────────────────────────────────

  defp get_tile_at(state, x, y) do
    tiles = state[:tiles] || state["tiles"]

    cond do
      is_list(tiles) ->
        row = Enum.at(tiles, y, [])
        Enum.at(row, x, @floor)

      true ->
        # Fallback: check modifications table, then assume floor
        map_id = state[:map_id] || state["map_id"]

        case Repo.query(
               "SELECT current_tile FROM #{@mods_table} WHERE map_id = ? AND x = ? AND y = ?",
               [map_id, x, y]
             ) do
          {:ok, %{rows: [[tile]]}} -> tile
          _ -> @floor
        end
    end
  end
end
