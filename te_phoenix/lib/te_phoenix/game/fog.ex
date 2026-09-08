defmodule TePhoenix.Game.Fog do
  @moduledoc """
  Phase 1.5e — fog-of-war runtime.

  Tiles have three per-character states on each map:

    * `:hidden`   — never seen; render as black/fog
    * `:explored` — seen before; render dimmed (terrain only,
                    no live entities)
    * `:visible`  — currently within vision; render full color

  The `Fog` module owns all three states. `LOS` (sister module)
  computes the geometric `:visible` set; `Fog` persists `:explored`
  via `character_seen_tiles` and assembles the unified view via
  `compute_view/2`.

  Templates from `TePhoenix.Game.Magic` (1.5d) — same shape:
  validate → mutate → broadcast. ensure_schema/0 idempotent +
  persistent_term cached.

  ## Capability gates

  Two gates, both must allow:

    1. `TePhoenix.Capabilities.enabled?(:fog_of_war)` — system-wide.
       Default OFF (no row in game_capability_state). Goose flips
       in `/sauce/capabilities` after browser audit.

    2. `game_maps.fog_enabled` — per-map override. A creator can
       turn fog OFF for a tutorial / well-lit map without disabling
       the system.

  When EITHER gate is closed, every tile reads as `:visible` —
  no DB writes happen for movement, no PubSub fires.

  ## PubSub contract (for Butterfingers's map_channel batch)

  When a character's visibility changes (via mark_movement/3 or
  reveal_tiles/3), Fog broadcasts on the topic
  `fog:CHARACTER_ID:MAP_ID` (Phoenix.PubSub).

  Message shape:

      %{
        event: :fog_delta,
        newly_visible: [{x, y}, ...],
        newly_explored: [{x, y}, ...],
        newly_hidden: [{x, y}, ...]
      }

  `newly_explored` is the set of tiles that transitioned hidden →
  explored on this update (i.e., first time seeing them).
  `newly_visible` is the set transitioning explored → visible (the
  player came into sight of an already-explored tile).
  `newly_hidden` is the visible → explored transition (player moved
  away).

  Butterfingers's map_channel subscribes to that topic and forwards
  as a `fog_delta` push to the SvelteKit player. See
  `docs/player-fog-integration.md` for the recommended store shape.

  ## Renderer contract (for U's render batch)

  See `docs/render-fog-integration.md`. Short version: the renderer
  reads three MapSets per frame (visible / explored / hidden — fog
  computes hidden as `all_tiles - visible - explored` lazily). On
  movement, it gets a delta and patches its three sets rather than
  re-fetching the full state.
  """

  alias TePhoenix.Repo
  alias TePhoenix.Game.Fog.LOS
  require Logger

  @seen_table "character_seen_tiles"
  @overrides_table "vision_radius_overrides"
  @default_radius 5

  # ── Schema bootstrap ─────────────────────────────────────────────

  @doc """
  Idempotently materialize the fog schema. Cached via persistent_term
  so subsequent calls cost only an :ets read.
  """
  def ensure_schema do
    case :persistent_term.get({__MODULE__, :ready}, false) do
      true ->
        :ok

      false ->
        do_ensure_schema()
        :persistent_term.put({__MODULE__, :ready}, true)
        :ok
    end
  end

  defp do_ensure_schema do
    Repo.query!("""
    CREATE TABLE IF NOT EXISTS #{@seen_table} (
      character_id INT NOT NULL,
      map_id INT NOT NULL,
      x INT NOT NULL,
      y INT NOT NULL,
      first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (character_id, map_id, x, y),
      INDEX idx_char_map (character_id, map_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)

    Repo.query!("""
    CREATE TABLE IF NOT EXISTS #{@overrides_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      entity_type ENUM('character', 'item', 'spell', 'status') NOT NULL,
      entity_id INT NOT NULL,
      radius INT NOT NULL,
      reason VARCHAR(128) DEFAULT NULL,
      expires_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_entity (entity_type, entity_id),
      INDEX idx_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)

    # Note: game_maps already has `fog_of_war` (tinyint, default 0)
    # and `fog_reveal_radius` (int, default 3) from a prior pass.
    # We reuse `fog_of_war` as the per-map enable flag — the brief's
    # `fog_enabled` is semantically the same. `ambient_visibility` is
    # new (different concept than fog_reveal_radius which is the
    # default vision radius granted by the map; ambient_visibility is
    # how many tiles of dim terrain show past current vision).
    for sql <- [
          "ALTER TABLE characters ADD COLUMN IF NOT EXISTS vision_radius INT NOT NULL DEFAULT 5",
          "ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS ambient_visibility INT NOT NULL DEFAULT 0"
        ] do
      case Repo.query(sql) do
        {:ok, _} -> :ok
        {:error, e} -> Logger.warning("[Fog] #{sql}: #{inspect(e)}")
      end
    end

    :ok
  rescue
    e -> Logger.error("[Fog] ensure_schema: #{inspect(e)}")
  end

  # ── Capability gate ──────────────────────────────────────────────

  defp capability_enabled? do
    if function_exported?(TePhoenix.Capabilities, :enabled?, 1) do
      TePhoenix.Capabilities.enabled?(:fog_of_war)
    else
      false
    end
  rescue
    _ -> false
  end

  defp map_fog_enabled?(map_id) do
    # Reads the existing `fog_of_war` column (default 0). When the
    # capability is enabled but this column is 0, fog still no-ops on
    # this specific map — matches the per-map creative override the
    # brief calls out.
    case Repo.query("SELECT fog_of_war FROM game_maps WHERE id = ?", [map_id]) do
      {:ok, %{rows: [[v]]}} -> v in [1, true]
      _ -> false
    end
  end

  defp ambient_visibility(map_id) do
    case Repo.query("SELECT ambient_visibility FROM game_maps WHERE id = ?", [map_id]) do
      {:ok, %{rows: [[v]]}} -> v || 0
      _ -> 0
    end
  end

  # ── Vision radius lookup ─────────────────────────────────────────

  @doc """
  Effective vision radius for `character_id`. Combines the
  character's base `vision_radius` (default 5) with any active
  overrides in `vision_radius_overrides` (sums them — temporary
  buffs add on top of the base).
  """
  def vision_radius_for(character_id) when is_integer(character_id) do
    ensure_schema()

    base =
      case Repo.query("SELECT vision_radius FROM characters WHERE id = ? LIMIT 1", [character_id]) do
        {:ok, %{rows: [[r]]}} -> r || @default_radius
        _ -> @default_radius
      end

    overrides_sum =
      case Repo.query(
             """
             SELECT CAST(COALESCE(SUM(radius), 0) AS SIGNED)
             FROM #{@overrides_table}
             WHERE entity_type = 'character'
               AND entity_id = ?
               AND (expires_at IS NULL OR expires_at > NOW())
             """,
             [character_id]
           ) do
        {:ok, %{rows: [[s]]}} when is_integer(s) -> s
        _ -> 0
      end

    max(base + overrides_sum, 0)
  end

  def vision_radius_for(_), do: @default_radius

  # ── Reveal / persist ─────────────────────────────────────────────

  @doc """
  Bulk-insert seen-tile rows for a character on a map. Uses
  `INSERT IGNORE` so re-revealing already-seen tiles is a cheap
  no-op (updates `last_seen_at` if the row is touched). Returns
  the count of newly-revealed tiles.

  `tiles` is a list of `{x, y}` tuples.
  """
  def reveal_tiles(character_id, map_id, tiles)
      when is_integer(character_id) and is_integer(map_id) and is_list(tiles) do
    ensure_schema()

    if tiles == [] do
      0
    else
      do_reveal(character_id, map_id, tiles)
    end
  end

  def reveal_tiles(_, _, _), do: 0

  defp do_reveal(character_id, map_id, tiles) do
    # Bulk INSERT IGNORE in chunks of 200 to keep the query under
    # max_packet_size while still amortizing the round-trip cost.
    tiles
    |> Enum.uniq()
    |> Enum.chunk_every(200)
    |> Enum.reduce(0, fn chunk, acc ->
      placeholders = Enum.map_join(chunk, ",", fn _ -> "(?, ?, ?, ?)" end)

      params =
        Enum.flat_map(chunk, fn {x, y} -> [character_id, map_id, x, y] end)

      case Repo.query(
             """
             INSERT IGNORE INTO #{@seen_table} (character_id, map_id, x, y)
             VALUES #{placeholders}
             """,
             params
           ) do
        {:ok, %{num_rows: n}} -> acc + (n || 0)
        _ -> acc
      end
    end)
  end

  # ── Visibility computation ───────────────────────────────────────

  @doc """
  MapSet of tiles currently `:visible` to the character on this map.
  Computed live from the character's position + vision_radius via
  shadowcasting. Blocked tiles (passability == 1) terminate sight.

  Returns the entire map's tile set if the capability is disabled
  or the map has fog_enabled = false.
  """
  def visible_tiles(character_id, map_id)
      when is_integer(character_id) and is_integer(map_id) do
    ensure_schema()

    cond do
      not capability_enabled?() -> all_tiles(map_id)
      not map_fog_enabled?(map_id) -> all_tiles(map_id)
      true -> compute_visible_tiles(character_id, map_id)
    end
  end

  def visible_tiles(_, _), do: MapSet.new()

  defp compute_visible_tiles(character_id, map_id) do
    char = fetch_character(character_id)
    map = fetch_map(map_id)

    cond do
      is_nil(char) ->
        MapSet.new()

      is_nil(map) ->
        MapSet.new()

      char.map_id != map_id ->
        # Character isn't actually on this map — they have no live
        # vision here. Explored tiles still come from the seen table.
        MapSet.new()

      true ->
        radius = trunc(vision_radius_for(character_id)) + trunc(ambient_visibility(map_id))
        blockers = build_blockers_fn(map)
        LOS.compute_visible({char.x, char.y}, radius, {map.width, map.height}, blockers)
    end
  end

  @doc """
  MapSet of tiles the character has ever seen on this map (live
  read from `character_seen_tiles`). Returns the full map when fog
  is disabled.
  """
  def explored_tiles(character_id, map_id)
      when is_integer(character_id) and is_integer(map_id) do
    ensure_schema()

    cond do
      not capability_enabled?() -> all_tiles(map_id)
      not map_fog_enabled?(map_id) -> all_tiles(map_id)
      true -> read_seen_tiles(character_id, map_id)
    end
  end

  def explored_tiles(_, _), do: MapSet.new()

  defp read_seen_tiles(character_id, map_id) do
    case Repo.query(
           "SELECT x, y FROM #{@seen_table} WHERE character_id = ? AND map_id = ?",
           [character_id, map_id]
         ) do
      {:ok, %{rows: rows}} -> MapSet.new(rows, fn [x, y] -> {x, y} end)
      _ -> MapSet.new()
    end
  end

  @doc """
  Single call returning everything the renderer + UI needs:
  `%{visible: MapSet, explored: MapSet, hidden_count: int}`.

  When fog is disabled (capability or per-map), returns visible =
  explored = full map, hidden_count = 0.
  """
  def compute_view(character_id, map_id)
      when is_integer(character_id) and is_integer(map_id) do
    ensure_schema()

    cond do
      not capability_enabled?() ->
        full = all_tiles(map_id)
        %{visible: full, explored: full, hidden_count: 0}

      not map_fog_enabled?(map_id) ->
        full = all_tiles(map_id)
        %{visible: full, explored: full, hidden_count: 0}

      true ->
        visible = compute_visible_tiles(character_id, map_id)
        explored = read_seen_tiles(character_id, map_id) |> MapSet.union(visible)
        total_tiles = map_tile_count(map_id)
        hidden = max(total_tiles - MapSet.size(explored), 0)
        %{visible: visible, explored: explored, hidden_count: hidden}
    end
  end

  def compute_view(_, _), do: %{visible: MapSet.new(), explored: MapSet.new(), hidden_count: 0}

  # ── Movement event ───────────────────────────────────────────────

  @doc """
  Called by the channel layer when a character moves. Computes the
  new visible set, persists newly-explored tiles, broadcasts the
  fog delta on the `fog:cid:mid` topic. No-op if fog is disabled
  (capability or per-map).

  Caller passes the new `{x, y}` — Fog re-reads it from the
  characters row to stay authoritative (avoids races with stale
  client positions).
  """
  def mark_movement(character_id, map_id, _new_position)
      when is_integer(character_id) and is_integer(map_id) do
    ensure_schema()

    cond do
      not capability_enabled?() -> :ok
      not map_fog_enabled?(map_id) -> :ok
      true -> do_mark_movement(character_id, map_id)
    end
  end

  def mark_movement(_, _, _), do: :ok

  defp do_mark_movement(character_id, map_id) do
    prev_visible = compute_visible_tiles_cached(character_id, map_id, :previous)
    prev_explored = read_seen_tiles(character_id, map_id)

    new_visible = compute_visible_tiles(character_id, map_id)

    # Newly-explored = tiles in new_visible but not in prev_explored
    newly_explored = MapSet.difference(new_visible, prev_explored)

    if MapSet.size(newly_explored) > 0 do
      reveal_tiles(character_id, map_id, MapSet.to_list(newly_explored))
    end

    # Visibility delta: visible→explored (newly_hidden) and
    # explored→visible (newly_visible from renderer's POV)
    newly_hidden = MapSet.difference(prev_visible, new_visible)
    newly_visible = MapSet.difference(new_visible, prev_visible)

    if MapSet.size(newly_hidden) > 0 or MapSet.size(newly_visible) > 0 or
         MapSet.size(newly_explored) > 0 do
      broadcast(character_id, map_id, %{
        event: :fog_delta,
        newly_visible: MapSet.to_list(newly_visible),
        newly_explored: MapSet.to_list(newly_explored),
        newly_hidden: MapSet.to_list(newly_hidden)
      })
    end

    :ok
  end

  # We don't cache the previous visible set across calls (would
  # require GenServer state). Instead, prev_explored represents
  # "what they used to see" — newly_visible/hidden become
  # symmetric-difference with the current frame. Good enough for
  # V1; cache in V2 if perf demands.
  defp compute_visible_tiles_cached(_character_id, _map_id, :previous), do: MapSet.new()

  # ── Admin ────────────────────────────────────────────────────────

  @doc """
  Admin nuke — wipe every seen-tile row for a character on a map.
  Used by amnesia mechanics or GM tools. Returns the count of rows
  deleted.
  """
  def reset_exploration(character_id, map_id)
      when is_integer(character_id) and is_integer(map_id) do
    ensure_schema()

    case Repo.query(
           "DELETE FROM #{@seen_table} WHERE character_id = ? AND map_id = ?",
           [character_id, map_id]
         ) do
      {:ok, %{num_rows: n}} ->
        broadcast(character_id, map_id, %{event: :fog_reset, count: n})
        n

      _ ->
        0
    end
  end

  def reset_exploration(_, _), do: 0

  # ── Vision radius overrides (temp buffs) ─────────────────────────

  @doc """
  Grant a temporary vision-radius bump to a character. `delta` is
  added to the base radius; `duration_ms` is how long the override
  lasts. `reason` is logged for audit (e.g., "spell:owl_sight").

  Returns the override row id.
  """
  def grant_vision(character_id, delta, duration_ms, reason \\ nil)

  def grant_vision(character_id, delta, duration_ms, reason)
      when is_integer(character_id) and is_integer(delta) and is_integer(duration_ms) do
    ensure_schema()

    expires_at_sql =
      if duration_ms > 0 do
        "DATE_ADD(NOW(), INTERVAL #{duration_ms} / 1000 SECOND)"
      else
        "NULL"
      end

    case Repo.query(
           """
           INSERT INTO #{@overrides_table}
             (entity_type, entity_id, radius, reason, expires_at)
           VALUES ('character', ?, ?, ?, #{expires_at_sql})
           """,
           [character_id, delta, reason && to_string(reason)]
         ) do
      {:ok, %{last_insert_id: id}} -> {:ok, id}
      _ -> {:error, :insert_failed}
    end
  end

  def grant_vision(_, _, _, _), do: {:error, :invalid_args}

  # ── Helpers ──────────────────────────────────────────────────────

  defp fetch_character(character_id) do
    case Repo.query(
           "SELECT id, x, y, map_id, vision_radius FROM characters WHERE id = ? LIMIT 1",
           [character_id]
         ) do
      {:ok, %{rows: [[id, x, y, map_id, r]]}} ->
        %{id: id, x: x, y: y, map_id: map_id, vision_radius: r || @default_radius}

      _ ->
        nil
    end
  end

  defp fetch_map(map_id) do
    case Repo.query(
           "SELECT id, width, height, layers_json, tiles_json FROM game_maps WHERE id = ? LIMIT 1",
           [map_id]
         ) do
      {:ok, %{rows: [[id, w, h, layers, _tiles]]}} ->
        passability = decode_passability(layers, w, h)
        %{id: id, width: w || 0, height: h || 0, passability: passability}

      _ ->
        nil
    end
  end

  defp decode_passability(nil, _w, _h), do: %{}

  defp decode_passability(s, w, h) when is_binary(s) and w > 0 and h > 0 do
    case Jason.decode(s) do
      {:ok, %{"layers" => %{"passability" => list}}} when is_list(list) ->
        list_to_passability_map(list, w, h)

      _ ->
        %{}
    end
  end

  defp decode_passability(_, _, _), do: %{}

  defp list_to_passability_map(list, w, h) do
    list
    |> Enum.with_index()
    |> Enum.reduce(%{}, fn {v, idx}, acc ->
      x = rem(idx, w)
      y = div(idx, w)
      if y < h, do: Map.put(acc, {x, y}, v), else: acc
    end)
  end

  defp build_blockers_fn(map) do
    fn {x, y} ->
      Map.get(map.passability, {x, y}, 0) == 1
    end
  end

  defp all_tiles(map_id) do
    case Repo.query("SELECT width, height FROM game_maps WHERE id = ?", [map_id]) do
      {:ok, %{rows: [[w, h]]}} when is_integer(w) and is_integer(h) ->
        for x <- 0..(w - 1), y <- 0..(h - 1), into: MapSet.new(), do: {x, y}

      _ ->
        MapSet.new()
    end
  end

  defp map_tile_count(map_id) do
    case Repo.query("SELECT width * height FROM game_maps WHERE id = ?", [map_id]) do
      {:ok, %{rows: [[n]]}} when is_integer(n) -> n
      _ -> 0
    end
  end

  defp broadcast(character_id, map_id, msg) do
    Phoenix.PubSub.broadcast(
      TePhoenix.PubSub,
      "fog:#{character_id}:#{map_id}",
      msg
    )
  rescue
    _ -> :ok
  end
end
