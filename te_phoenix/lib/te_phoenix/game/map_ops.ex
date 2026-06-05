defmodule TePhoenix.Game.MapOps do
  @moduledoc """
  Operational log for the map editor — Phase 2B.

  Builds on top of the existing `game_map_ops_log` table (214 ops already
  persisted in prod). Each editor mutation appends one op with a
  monotonic `sequence` per `map_id`, so replay can reconstruct any
  point-in-time state.

  Design:

    - Append-only. Undo flips `inverted = 1` rather than deleting; the
      replay path skips inverted ops. Redo flips it back.
    - `op_id` is a client-or-server UUID for idempotency under retries
      (`INSERT IGNORE` on the unique `(map_id, op_id)` constraint).
    - `sequence` is a monotonic per-map counter assigned at insert time;
      readers order by `(map_id, sequence)`.
    - Snapshots in `game_map_snapshots` accelerate replay — `replay/3`
      finds the nearest snapshot ≤ `up_to_seq` and only replays ops since.
    - One `apply_op/2` clause per `op_type`. Adding a new op type =
      add `apply_op/2` and `invert_op/1` clauses; everything else is
      generic.

  Op types currently supported:

    - `replace_layers` — full layers blob (legacy bulk save)
    - `rect`           — rectangular fill
    - `fill`           — flood fill
    - `stamp`          — paste a clip at a position
    - `paint_tile`     — single-cell paint (added in Phase 2B)
    - `place_object`   — drop an object at (x, y)
    - `delete_object`  — remove an object by id
    - `place_event`    — drop an event at (x, y)
    - `delete_event`   — remove an event by id
    - `set_property`   — change a top-level map property
    - `seed_from_snapshot` — initial root op for a brand-new map history
  """

  alias TePhoenix.Repo

  @snapshot_every 500

  # ── Append ───────────────────────────────────────────────────────

  @doc """
  Append a new op. Idempotent on `(map_id, op_id)`. Returns the
  full op record on insert, or the existing one if `op_id` is a duplicate.

  Sequence assignment is atomic: a transaction takes `SELECT FOR UPDATE`
  on the `game_maps` row, then bumps `head_seq` and inserts with the
  new value. Concurrent appends serialize at the row lock — no
  read-after-write hazard, no duplicate sequences.
  """
  def append(map_id, op_id, op_type, payload, opts \\ []) do
    user_id = Keyword.get(opts, :user_id)
    user_name = Keyword.get(opts, :user_name, "editor")
    parent = Keyword.get(opts, :parent_op_id)
    patch_json = if is_binary(payload), do: payload, else: Jason.encode!(payload)
    op_type_str = op_type_to_string(op_type)

    Repo.transaction(fn ->
      # If the op_id is already persisted (idempotent retry), return the
      # existing row WITHOUT bumping head_seq.
      case fetch_by_op_id(map_id, op_id) do
        {:ok, existing} ->
          existing

        _ ->
          case lock_and_increment_head(map_id) do
            {:ok, next} ->
              case Repo.query(
                     """
                     INSERT IGNORE INTO game_map_ops_log
                       (map_id, op_id, op_type, patch_json, author_id, author_name, sequence, parent_op_id, inverted)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
                     """,
                     [map_id, op_id, op_type_str, patch_json, user_id, user_name, next, parent]
                   ) do
                {:ok, %{num_rows: 1}} ->
                  maybe_snapshot(map_id, next)

                  %{
                    map_id: map_id,
                    op_id: op_id,
                    op_type: op_type_str,
                    patch: payload,
                    sequence: next,
                    inverted: false,
                    parent_op_id: parent,
                    user_id: user_id,
                    user_name: user_name
                  }

                {:ok, %{num_rows: 0}} ->
                  # Race: head_seq bumped, but insert hit duplicate op_id.
                  # Roll back the head_seq bump and return the existing row.
                  Repo.query!("UPDATE game_maps SET head_seq = head_seq - 1 WHERE id = ?", [map_id])

                  case fetch_by_op_id(map_id, op_id) do
                    {:ok, existing} -> existing
                    _ -> Repo.rollback(:duplicate_op_id_race)
                  end

                {:error, e} ->
                  Repo.rollback(e)
              end

            {:error, e} ->
              Repo.rollback(e)
          end
      end
    end)
    |> case do
      {:ok, record} -> {:ok, record}
      {:error, reason} -> {:error, reason}
    end
  end

  # Atomic: SELECT ... FOR UPDATE locks the map row, then UPDATE bumps
  # head_seq, returning the new value. Inside a transaction, both queries
  # share the same snapshot + write set so the returned head_seq is
  # guaranteed unique even under concurrent appenders.
  defp lock_and_increment_head(map_id) do
    case Repo.query("SELECT head_seq FROM game_maps WHERE id = ? FOR UPDATE", [map_id]) do
      {:ok, %{rows: [[current]]}} when is_integer(current) ->
        next = current + 1

        case Repo.query("UPDATE game_maps SET head_seq = ? WHERE id = ?", [next, map_id]) do
          {:ok, _} -> {:ok, next}
          err -> err
        end

      {:ok, %{rows: []}} ->
        {:error, :map_not_found}

      err ->
        err
    end
  end

  # ── Read ─────────────────────────────────────────────────────────

  @doc """
  List ops for replay or display.

  Options:
    - `:since`      — start sequence (exclusive); default 0
    - `:up_to`      — end sequence (inclusive); default `:max`
    - `:include_inverted` — include rows where `inverted = 1`; default false
  """
  def list(map_id, opts \\ []) do
    since = Keyword.get(opts, :since, 0)
    up_to = Keyword.get(opts, :up_to, :max)
    include_inv = Keyword.get(opts, :include_inverted, false)

    {clauses, params} =
      [{"map_id = ?", map_id}, {"sequence > ?", since}]
      |> maybe_add(up_to != :max, {"sequence <= ?", up_to})
      |> maybe_add(not include_inv, {"inverted = 0", :_skip})
      |> Enum.unzip()

    params = Enum.reject(params, &(&1 == :_skip))

    sql = """
    SELECT id, map_id, op_id, op_type, patch_json, author_id, author_name, sequence, inverted, parent_op_id, created_at
    FROM game_map_ops_log
    WHERE #{Enum.join(clauses, " AND ")}
    ORDER BY sequence ASC
    """

    case Repo.query(sql, params) do
      {:ok, %{rows: rows}} -> Enum.map(rows, &row_to_op/1)
      _ -> []
    end
  end

  defp maybe_add(list, true, item), do: list ++ [item]
  defp maybe_add(list, false, _), do: list

  defp fetch_by_op_id(map_id, op_id) do
    case Repo.query(
           """
           SELECT id, map_id, op_id, op_type, patch_json, author_id, author_name, sequence, inverted, parent_op_id, created_at
           FROM game_map_ops_log
           WHERE map_id = ? AND op_id = ?
           LIMIT 1
           """,
           [map_id, op_id]
         ) do
      {:ok, %{rows: [row]}} -> {:ok, row_to_op(row)}
      _ -> {:error, :not_found}
    end
  end

  defp row_to_op([_id, map_id, op_id, op_type, patch_json, author_id, author_name, sequence, inverted, parent_op_id, created_at]) do
    patch =
      case Jason.decode(patch_json || "null") do
        {:ok, p} -> p
        _ -> nil
      end

    %{
      map_id: map_id,
      op_id: op_id,
      op_type: op_type,
      patch: patch,
      user_id: author_id,
      user_name: author_name,
      sequence: sequence,
      inverted: inverted == 1,
      parent_op_id: parent_op_id,
      created_at: created_at
    }
  end

  # ── Replay ───────────────────────────────────────────────────────

  @doc """
  Reconstruct a map state by replaying ops onto a base.

  `base_state` should at minimum have `:layers`, `:width`, `:height`. Use
  the nearest snapshot ≤ `up_to_seq` as a starting point if available.
  """
  def replay(map_id, base_state, opts \\ []) do
    up_to = Keyword.get(opts, :up_to, :max)

    {since, base} =
      case nearest_snapshot(map_id, up_to) do
        nil ->
          {0, base_state}

        snap ->
          {snap.sequence, %{base_state | layers: snap.layers}}
      end

    list(map_id, since: since, up_to: up_to)
    |> Enum.reduce(base, &apply_op/2)
  end

  # ── Snapshots ────────────────────────────────────────────────────

  # Public for testability. Returns true on snapshot-trigger sequences
  # (every @snapshot_every ops). Pure — no side effects.
  def should_snapshot?(seq) when is_integer(seq) and seq > 0,
    do: rem(seq, @snapshot_every) == 0

  def should_snapshot?(_), do: false

  @doc """
  Synchronous snapshot write. Reads `game_maps.layers_json` and inserts a
  row into `game_map_snapshots` at the given `seq`. Returns `:ok` on
  success, `{:error, _}` on failure. Old snapshots are NOT deleted —
  history is preserved.
  """
  def write_snapshot(map_id, seq) do
    case Repo.query("SELECT layers_json FROM game_maps WHERE id = ?", [map_id]) do
      {:ok, %{rows: [[layers_json]]}} when is_binary(layers_json) ->
        inserted_at = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:microsecond)

        case Repo.query(
               """
               INSERT INTO game_map_snapshots (map_id, seq, layers, inserted_at)
               VALUES (?, ?, ?, ?)
               """,
               [map_id, seq, layers_json, inserted_at]
             ) do
          {:ok, _} -> :ok
          err -> err
        end

      {:ok, _} ->
        {:error, :map_has_no_layers}

      err ->
        err
    end
  end

  # Auto-snapshot: fire-and-forget Task that writes the current layers
  # blob to game_map_snapshots so future replays can resume from it.
  # Best-effort: a failed write doesn't affect correctness, only replay
  # speed.
  defp maybe_snapshot(map_id, seq) do
    if should_snapshot?(seq) do
      Task.start(fn -> write_snapshot(map_id, seq) end)
    end

    :ok
  end

  defp nearest_snapshot(map_id, :max), do: nearest_snapshot(map_id, 9_223_372_036_854_775_807)

  defp nearest_snapshot(map_id, up_to) do
    case Repo.query(
           """
           SELECT seq, layers
           FROM game_map_snapshots
           WHERE map_id = ? AND seq <= ?
           ORDER BY seq DESC
           LIMIT 1
           """,
           [map_id, up_to]
         ) do
      {:ok, %{rows: [[seq, layers_json]]}} ->
        case Jason.decode(layers_json) do
          {:ok, layers} -> %{sequence: seq, layers: layers}
          _ -> nil
        end

      _ ->
        nil
    end
  end

  # ── Undo / redo ──────────────────────────────────────────────────

  @doc """
  Mark the latest non-inverted op for `map_id` (optionally filtered by
  `user_id`) as inverted. Returns `{:ok, op}` or `{:error, :nothing_to_undo}`.
  """
  def undo(map_id, opts \\ []) do
    user_id = Keyword.get(opts, :user_id)

    {sql, params} =
      if user_id do
        {"""
         SELECT id, sequence FROM game_map_ops_log
         WHERE map_id = ? AND inverted = 0 AND author_id = ?
         ORDER BY sequence DESC LIMIT 1
         """, [map_id, user_id]}
      else
        {"""
         SELECT id, sequence FROM game_map_ops_log
         WHERE map_id = ? AND inverted = 0
         ORDER BY sequence DESC LIMIT 1
         """, [map_id]}
      end

    case Repo.query(sql, params) do
      {:ok, %{rows: [[id, seq]]}} ->
        Repo.query("UPDATE game_map_ops_log SET inverted = 1 WHERE id = ?", [id])
        {:ok, %{op_pk: id, sequence: seq}}

      _ ->
        {:error, :nothing_to_undo}
    end
  end

  @doc """
  Flip the most recently-inverted op back to applied.
  """
  def redo(map_id, opts \\ []) do
    user_id = Keyword.get(opts, :user_id)

    {sql, params} =
      if user_id do
        {"""
         SELECT id, sequence FROM game_map_ops_log
         WHERE map_id = ? AND inverted = 1 AND author_id = ?
         ORDER BY sequence DESC LIMIT 1
         """, [map_id, user_id]}
      else
        {"""
         SELECT id, sequence FROM game_map_ops_log
         WHERE map_id = ? AND inverted = 1
         ORDER BY sequence DESC LIMIT 1
         """, [map_id]}
      end

    case Repo.query(sql, params) do
      {:ok, %{rows: [[id, seq]]}} ->
        Repo.query("UPDATE game_map_ops_log SET inverted = 0 WHERE id = ?", [id])
        {:ok, %{op_pk: id, sequence: seq}}

      _ ->
        {:error, :nothing_to_redo}
    end
  end

  # ── Apply ────────────────────────────────────────────────────────
  #
  # `state` shape: %{layers: %{layer_name => list}, width: w, height: h,
  # objects: list, events: list, properties: map}.

  def apply_op(%{op_type: "paint_tile", patch: %{"layer" => layer, "x" => x, "y" => y, "id" => id}}, state) do
    set_layer_cell(state, layer, x, y, id)
  end

  def apply_op(%{op_type: "rect", patch: %{"layer" => layer, "cells" => cells, "value" => value}}, state)
      when is_list(cells) do
    Enum.reduce(cells, state, fn %{"x" => x, "y" => y}, s ->
      set_layer_cell(s, layer, x, y, value)
    end)
  end

  def apply_op(%{op_type: "fill", patch: %{"layer" => layer, "cells" => cells, "value" => value}}, state)
      when is_list(cells) do
    Enum.reduce(cells, state, fn %{"x" => x, "y" => y}, s ->
      set_layer_cell(s, layer, x, y, value)
    end)
  end

  def apply_op(%{op_type: "replace_layers", patch: %{"layers" => layers}}, state) when is_map(layers) do
    %{state | layers: layers}
  end

  def apply_op(%{op_type: "stamp", patch: %{"layer" => layer, "x" => ox, "y" => oy, "data" => cells}}, state)
      when is_list(cells) do
    Enum.reduce(cells, state, fn cell, s ->
      cx = (cell["dx"] || 0) + ox
      cy = (cell["dy"] || 0) + oy
      set_layer_cell(s, layer, cx, cy, cell["value"])
    end)
  end

  def apply_op(%{op_type: "place_object", patch: %{"object" => obj}}, state) do
    Map.update(state, :objects, [obj], fn objs -> [obj | (objs || [])] end)
  end

  def apply_op(%{op_type: "delete_object", patch: %{"object_id" => oid}}, state) do
    Map.update(state, :objects, [], fn objs ->
      Enum.reject(objs || [], fn o -> Map.get(o, "id") == oid or Map.get(o, :id) == oid end)
    end)
  end

  def apply_op(%{op_type: "place_event", patch: %{"event" => ev}}, state) do
    Map.update(state, :events, [ev], fn evs -> [ev | (evs || [])] end)
  end

  def apply_op(%{op_type: "delete_event", patch: %{"event_id" => eid}}, state) do
    Map.update(state, :events, [], fn evs ->
      Enum.reject(evs || [], fn e -> Map.get(e, "id") == eid or Map.get(e, :id) == eid end)
    end)
  end

  def apply_op(%{op_type: "set_property", patch: %{"field" => field, "new" => value}}, state) do
    Map.update(state, :properties, %{field => value}, fn props -> Map.put(props || %{}, field, value) end)
  end

  def apply_op(%{op_type: "seed_from_snapshot", patch: %{"layers" => layers}}, state) when is_map(layers) do
    %{state | layers: layers}
  end

  def apply_op(%{op_type: "edit_object", patch: %{"object_id" => oid, "fields" => fields}}, state) when is_map(fields) do
    Map.update(state, :objects, [], fn objs ->
      Enum.map(objs || [], fn o ->
        if Map.get(o, "id") == oid or Map.get(o, :id) == oid do
          Enum.reduce(fields, o, fn {k, v}, acc -> Map.put(acc, k, v) end)
        else
          o
        end
      end)
    end)
  end

  # Spawn / sound zone ops. These mutate :spawn_zones / :sound_zones in
  # state. Replay treats zones as keyed by id; place adds, delete removes,
  # edit replaces matching keys.
  def apply_op(%{op_type: "place_spawn_zone", patch: %{"zone" => z}}, state) do
    Map.update(state, :spawn_zones, [z], fn zs -> [z | (zs || [])] end)
  end

  def apply_op(%{op_type: "delete_spawn_zone", patch: %{"zone_id" => zid}}, state) do
    Map.update(state, :spawn_zones, [], fn zs ->
      Enum.reject(zs || [], fn z -> Map.get(z, "id") == zid or Map.get(z, :id) == zid end)
    end)
  end

  def apply_op(%{op_type: "edit_spawn_zone", patch: %{"zone_id" => zid, "fields" => fields}}, state) when is_map(fields) do
    Map.update(state, :spawn_zones, [], fn zs ->
      Enum.map(zs || [], fn z ->
        if Map.get(z, "id") == zid or Map.get(z, :id) == zid do
          Enum.reduce(fields, z, fn {k, v}, acc -> Map.put(acc, k, v) end)
        else
          z
        end
      end)
    end)
  end

  def apply_op(%{op_type: "edit_spawn_encounter", patch: %{"zone_id" => zid, "row" => row, "field" => field, "new" => v}}, state) do
    Map.update(state, :spawn_zones, [], fn zs ->
      Enum.map(zs || [], fn z ->
        zid_match = Map.get(z, "id") == zid or Map.get(z, :id) == zid

        if zid_match do
          tab = Map.get(z, "encounter_table") || Map.get(z, :encounter_table) || []

          new_tab =
            List.update_at(tab, row, fn r -> Map.put(r || %{}, field, v) end)

          z
          |> Map.put("encounter_table", new_tab)
          |> Map.put(:encounter_table, new_tab)
        else
          z
        end
      end)
    end)
  end

  def apply_op(%{op_type: "place_sound_zone", patch: %{"zone" => z}}, state) do
    Map.update(state, :sound_zones, [z], fn zs -> [z | (zs || [])] end)
  end

  def apply_op(%{op_type: "delete_sound_zone", patch: %{"zone_id" => zid}}, state) do
    Map.update(state, :sound_zones, [], fn zs ->
      Enum.reject(zs || [], fn z -> Map.get(z, "id") == zid or Map.get(z, :id) == zid end)
    end)
  end

  def apply_op(%{op_type: "edit_sound_zone", patch: %{"zone_id" => zid, "fields" => fields}}, state) when is_map(fields) do
    Map.update(state, :sound_zones, [], fn zs ->
      Enum.map(zs || [], fn z ->
        if Map.get(z, "id") == zid or Map.get(z, :id) == zid do
          Enum.reduce(fields, z, fn {k, v}, acc -> Map.put(acc, k, v) end)
        else
          z
        end
      end)
    end)
  end

  # Spawn-point (single tile) — distinct from spawn_zones. Stored on the
  # map row, but recorded as an op so undo/redo reaches it via the same
  # history surface.
  def apply_op(%{op_type: "set_spawn", patch: %{"x" => x, "y" => y}}, state) do
    state
    |> Map.put(:spawn_x, x)
    |> Map.put(:spawn_y, y)
  end

  # Unknown op types are no-ops in replay (forward compatibility — newer
  # editors may emit op types older replayers don't know about).
  def apply_op(_op, state), do: state

  # ── Invert ───────────────────────────────────────────────────────

  def invert_op(%{op_type: "paint_tile", patch: %{"prev_id" => prev} = p}) do
    %{op_type: "paint_tile", patch: %{p | "id" => prev, "prev_id" => p["id"]}}
  end

  def invert_op(%{op_type: "rect", patch: %{"prev_cells" => prev_cells} = p}) when is_list(prev_cells) do
    %{op_type: "rect", patch: %{p | "cells" => prev_cells, "prev_cells" => p["cells"]}}
  end

  def invert_op(%{op_type: "fill", patch: %{"prev_cells" => prev_cells} = p}) when is_list(prev_cells) do
    %{op_type: "fill", patch: %{p | "cells" => prev_cells, "prev_cells" => p["cells"]}}
  end

  def invert_op(%{op_type: "place_object", patch: %{"object" => obj}}) do
    %{op_type: "delete_object", patch: %{"object_id" => Map.get(obj, "id") || Map.get(obj, :id)}}
  end

  def invert_op(%{op_type: "delete_object", patch: %{"prev_object" => prev}}) do
    %{op_type: "place_object", patch: %{"object" => prev}}
  end

  def invert_op(%{op_type: "place_event", patch: %{"event" => ev}}) do
    %{op_type: "delete_event", patch: %{"event_id" => Map.get(ev, "id") || Map.get(ev, :id)}}
  end

  def invert_op(%{op_type: "delete_event", patch: %{"prev_event" => prev}}) do
    %{op_type: "place_event", patch: %{"event" => prev}}
  end

  def invert_op(%{op_type: "set_property", patch: p}) do
    %{op_type: "set_property", patch: %{"field" => p["field"], "new" => p["prev"], "prev" => p["new"]}}
  end

  def invert_op(%{op_type: "edit_object", patch: %{"object_id" => oid, "fields" => f, "prev_fields" => pf}}) do
    %{op_type: "edit_object", patch: %{"object_id" => oid, "fields" => pf, "prev_fields" => f}}
  end

  def invert_op(%{op_type: "place_spawn_zone", patch: %{"zone" => z}}) do
    %{op_type: "delete_spawn_zone", patch: %{"zone_id" => Map.get(z, "id") || Map.get(z, :id)}}
  end

  def invert_op(%{op_type: "delete_spawn_zone", patch: %{"prev_zone" => prev}}) do
    %{op_type: "place_spawn_zone", patch: %{"zone" => prev}}
  end

  def invert_op(%{op_type: "place_sound_zone", patch: %{"zone" => z}}) do
    %{op_type: "delete_sound_zone", patch: %{"zone_id" => Map.get(z, "id") || Map.get(z, :id)}}
  end

  def invert_op(%{op_type: "delete_sound_zone", patch: %{"prev_zone" => prev}}) do
    %{op_type: "place_sound_zone", patch: %{"zone" => prev}}
  end

  def invert_op(%{op_type: "edit_spawn_zone", patch: %{"zone_id" => zid, "fields" => f, "prev_fields" => pf}}) do
    %{op_type: "edit_spawn_zone", patch: %{"zone_id" => zid, "fields" => pf, "prev_fields" => f}}
  end

  def invert_op(%{op_type: "edit_spawn_encounter", patch: %{"new" => n, "prev" => p} = patch}) do
    %{op_type: "edit_spawn_encounter", patch: %{patch | "new" => p, "prev" => n}}
  end

  def invert_op(%{op_type: "edit_sound_zone", patch: %{"zone_id" => zid, "fields" => f, "prev_fields" => pf}}) do
    %{op_type: "edit_sound_zone", patch: %{"zone_id" => zid, "fields" => pf, "prev_fields" => f}}
  end

  def invert_op(%{op_type: "set_spawn", patch: %{"x" => x, "y" => y, "prev_x" => px, "prev_y" => py}}) do
    %{op_type: "set_spawn", patch: %{"x" => px, "y" => py, "prev_x" => x, "prev_y" => y}}
  end

  # Ops without enough info to invert pass through unchanged. The caller
  # should treat this as "not invertible without a snapshot."
  def invert_op(op), do: op

  # ── Helpers ──────────────────────────────────────────────────────

  defp set_layer_cell(state, layer, x, y, value) do
    width = state.width || state[:mapWidth] || 0
    return = state

    case Map.get(state.layers, layer) do
      data when is_list(data) ->
        idx = y * width + x
        %{state | layers: Map.put(state.layers, layer, List.replace_at(data, idx, value))}

      _ ->
        return
    end
  end

  defp op_type_to_string(t) when is_atom(t), do: Atom.to_string(t)
  defp op_type_to_string(t) when is_binary(t), do: t
end
