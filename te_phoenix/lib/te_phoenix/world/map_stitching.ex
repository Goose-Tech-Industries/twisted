defmodule TePhoenix.World.MapStitching do
  @moduledoc """
  Connect maps edge-to-edge for seamless open-world traversal.

  Maps can be linked at their edges (north/south/east/west) with an optional
  offset. When a player walks off one edge, `resolve_crossing/4` returns the
  destination map and translated coordinates.

  ## Table

    * `game_map_edges` — directional edge links between maps with offset

  ## Integration

    * `MapChannel` — calls `resolve_crossing` when player position goes out of bounds
    * `Minimap` — calls `get_world_view` to render adjacent map outlines
    * `AdminSauce` — `auto_stitch` for bulk grid layout
  """

  require Logger
  alias TePhoenix.Repo

  @edges_table "game_map_edges"
  @valid_edges ~w(north south east west)

  # ── Setup ───────────────────────────────────────────────────────

  def ensure_tables do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@edges_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      from_map_id INT NOT NULL,
      edge VARCHAR(10) NOT NULL,
      to_map_id INT NOT NULL,
      offset_x INT DEFAULT 0,
      offset_y INT DEFAULT 0,
      UNIQUE KEY uk_from_edge (from_map_id, edge),
      INDEX idx_to_map (to_map_id)
    )
    """)

    Logger.info("[MapStitching] tables ensured")
  end

  # ── Connect / Disconnect ──────────────────────────────────────

  @doc """
  Link two maps at an edge. `offset` shifts the coordinate mapping
  (e.g., offset_x=5 means the destination map's x starts 5 tiles
  shifted relative to the source).

  Automatically creates the reciprocal connection.
  """
  def connect(from_map_id, edge, to_map_id, offset \\ {0, 0})

  def connect(from_map_id, edge, to_map_id, {offset_x, offset_y})
      when edge in @valid_edges do
    ensure_tables()
    edge_str = to_string(edge)
    opposite = opposite_edge(edge_str)

    # Forward link
    Repo.query(
      """
      INSERT INTO #{@edges_table} (from_map_id, edge, to_map_id, offset_x, offset_y)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE to_map_id = VALUES(to_map_id),
        offset_x = VALUES(offset_x), offset_y = VALUES(offset_y)
      """,
      [from_map_id, edge_str, to_map_id, offset_x, offset_y]
    )

    # Reciprocal link (inverted offset)
    Repo.query(
      """
      INSERT INTO #{@edges_table} (from_map_id, edge, to_map_id, offset_x, offset_y)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE to_map_id = VALUES(to_map_id),
        offset_x = VALUES(offset_x), offset_y = VALUES(offset_y)
      """,
      [to_map_id, opposite, from_map_id, -offset_x, -offset_y]
    )

    Logger.info("[MapStitching] connected map #{from_map_id} #{edge_str} -> map #{to_map_id}")
    :ok
  end

  def connect(_, edge, _, _) do
    Logger.warning("[MapStitching] invalid edge: #{inspect(edge)}")
    {:error, :invalid_edge}
  end

  @doc "Remove an edge connection (and its reciprocal)."
  def disconnect(from_map_id, edge) when edge in @valid_edges do
    ensure_tables()
    edge_str = to_string(edge)
    opposite = opposite_edge(edge_str)

    # Find the target to remove reciprocal
    case Repo.query(
           "SELECT to_map_id FROM #{@edges_table} WHERE from_map_id = ? AND edge = ?",
           [from_map_id, edge_str]
         ) do
      {:ok, %{rows: [[to_map_id]]}} ->
        Repo.query("DELETE FROM #{@edges_table} WHERE from_map_id = ? AND edge = ?", [from_map_id, edge_str])
        Repo.query("DELETE FROM #{@edges_table} WHERE from_map_id = ? AND edge = ?", [to_map_id, opposite])
        Logger.info("[MapStitching] disconnected map #{from_map_id} #{edge_str}")
        :ok

      _ ->
        :ok
    end
  end

  # ── Query ──────────────────────────────────────────────────────

  @doc "Get all edge connections for a map."
  def get_connections(map_id) do
    ensure_tables()

    case Repo.query(
           "SELECT edge, to_map_id, offset_x, offset_y FROM #{@edges_table} WHERE from_map_id = ?",
           [map_id]
         ) do
      {:ok, %{rows: rows}} ->
        Map.new(rows, fn [edge, to_id, ox, oy] ->
          {edge, %{map_id: to_id, offset_x: ox, offset_y: oy}}
        end)

      _ ->
        %{}
    end
  end

  @doc """
  Resolve a player crossing a map boundary.

  Given the current map, player position (x, y), and movement direction,
  returns `{:ok, new_map_id, new_x, new_y}` if there's an adjacent map,
  or `{:error, :no_connection}` if the edge is unlinked.

  Requires the current map's dimensions to detect the crossing.
  """
  def resolve_crossing(map_id, x, y, direction) when direction in @valid_edges do
    ensure_tables()
    dir_str = to_string(direction)

    case Repo.query(
           "SELECT to_map_id, offset_x, offset_y FROM #{@edges_table} WHERE from_map_id = ? AND edge = ?",
           [map_id, dir_str]
         ) do
      {:ok, %{rows: [[to_map_id, offset_x, offset_y]]}} ->
        # Get destination map dimensions
        {dest_w, dest_h} = get_map_dimensions(to_map_id)

        {new_x, new_y} =
          case dir_str do
            "north" -> {x + offset_x, dest_h - 1}
            "south" -> {x + offset_x, 0}
            "east" -> {0, y + offset_y}
            "west" -> {dest_w - 1, y + offset_y}
          end

        # Clamp to destination bounds
        new_x = max(0, min(new_x, dest_w - 1))
        new_y = max(0, min(new_y, dest_h - 1))

        {:ok, to_map_id, new_x, new_y}

      _ ->
        {:error, :no_connection}
    end
  end

  @doc """
  Get the center map and all directly adjacent maps for minimap rendering.

  Returns `%{center: map_id, north: map_id | nil, south: ..., east: ..., west: ...}`.
  """
  def get_world_view(center_map_id) do
    connections = get_connections(center_map_id)

    %{
      center: center_map_id,
      north: get_in(connections, ["north", :map_id]),
      south: get_in(connections, ["south", :map_id]),
      east: get_in(connections, ["east", :map_id]),
      west: get_in(connections, ["west", :map_id]),
      connections: connections
    }
  end

  @doc """
  Automatically connect a list of map IDs in a grid pattern.

  Maps are laid out left-to-right, top-to-bottom with `cols` columns.
  E.g., `auto_stitch([1,2,3,4,5,6], cols: 3)` creates a 3x2 grid.
  """
  def auto_stitch(map_ids, opts \\ []) when is_list(map_ids) do
    cols = Keyword.get(opts, :cols, ceil(:math.sqrt(length(map_ids))) |> trunc())

    grid =
      map_ids
      |> Enum.with_index()
      |> Enum.map(fn {id, idx} ->
        row = div(idx, cols)
        col = rem(idx, cols)
        {row, col, id}
      end)

    grid_map =
      Map.new(grid, fn {row, col, id} -> {{row, col}, id} end)

    results =
      Enum.map(grid, fn {row, col, id} ->
        # Connect east
        east_result =
          case Map.get(grid_map, {row, col + 1}) do
            nil -> nil
            east_id -> connect(id, "east", east_id)
          end

        # Connect south
        south_result =
          case Map.get(grid_map, {row + 1, col}) do
            nil -> nil
            south_id -> connect(id, "south", south_id)
          end

        {id, east_result, south_result}
      end)

    Logger.info("[MapStitching] auto-stitched #{length(map_ids)} maps in #{cols}-column grid")
    {:ok, results}
  end

  # ── Helpers ────────────────────────────────────────────────────

  defp opposite_edge("north"), do: "south"
  defp opposite_edge("south"), do: "north"
  defp opposite_edge("east"), do: "west"
  defp opposite_edge("west"), do: "east"

  defp get_map_dimensions(map_id) do
    case Repo.query("SELECT width, height FROM game_maps WHERE id = ?", [map_id]) do
      {:ok, %{rows: [[w, h]]}} -> {w || 20, h || 20}
      _ -> {20, 20}
    end
  end
end
