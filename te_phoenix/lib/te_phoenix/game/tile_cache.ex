defmodule TePhoenix.Game.TileCache do
  @moduledoc """
  Boot-time tile passability cache. Seeded once at application start
  so `tile_passable_by_type?/1` never hits the cold-cache fallback
  (which assumes any non-zero tile ID is walkable).
  """

  alias TePhoenix.Repo

  @doc "Warm the per-tile passability cache from game_tile_types."
  def warm do
    case Repo.query(
      "SELECT id, is_passable FROM game_tile_types WHERE is_active=1"
    ) do
      {:ok, %{rows: rows}} ->
        for [id, is_passable] <- rows do
          # DB column: TINYINT — 1 = walkable, 0 = blocked
          :persistent_term.put({:tile_is_passable, id}, is_passable != 0)
        end

        :ok

      _ ->
        :ok
    end
  end

  @doc "Check if a tile ID is passable. Used by tile_passable_by_type?/1."
  def passable?(tile_id) when is_integer(tile_id) do
    case :persistent_term.get({:tile_is_passable, tile_id}, :not_cached) do
      :not_cached -> tile_id > 0
      val -> val
    end
  end

  @doc "Check if a tile ID is passable (nil-safe)."
  def passable?(nil), do: false
end
