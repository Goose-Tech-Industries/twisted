defmodule Mix.Tasks.Twisted.MigrateMaps do
  @moduledoc """
  One-shot migration: upgrade every `game_maps` row from the legacy
  `tiles_json` formats to the new structured `layers_json` + extracted
  tables (`game_map_events`, `game_map_objects`).

  ## Legacy formats

  Two shapes exist in the wild:

    1. **Flat** — `tiles_json` is a single flat `number[]` of length
       `width * height`. This is the original jQuery-era Node format.

    2. **5-tuple** — `tiles_json` is `[ground[], overlay[], passability[],
       fringe[], elevation[]]`. This is the React-era "upgraded" format
       with multi-layer tiles.

  Both get normalized into a single structured JSON object stored in
  `game_maps.layers_json`:

      {
        "schema_version": 2,
        "layers": {
          "ground": [...],
          "overlay": [...],
          "passability": [...],
          "fringe": [...],
          "elevation": [...]
        }
      }

  ## Event + object extraction

  `collisions_json` (legacy event list) gets unpacked into
  `game_map_events` rows, one per `{x, y, type, data, ...}` entry.

  `objects_json` (legacy object list) gets unpacked into
  `game_map_objects` rows similarly.

  ## Safety

  - Fully idempotent. Running twice is a no-op (uses `schema_version`
    to detect already-migrated rows).
  - Non-destructive. The legacy `tiles_json` / `collisions_json` /
    `objects_json` columns are left untouched — migration only writes
    to the new columns and tables.
  - Per-row transactional-ish: each map is processed independently, a
    failure on map N doesn't roll back maps 1..N-1.
  - Dry-run mode: pass `--dry` to print stats without writing.

  ## Usage

      mix twisted.migrate_maps            # migrate all
      mix twisted.migrate_maps --dry      # report only
      mix twisted.migrate_maps --map 42   # single map by id
  """

  use Mix.Task
  alias TePhoenix.Repo

  @shortdoc "Upgrade game_maps rows from legacy tiles_json to the new layered format"

  @impl Mix.Task
  def run(args) do
    Mix.Task.run("app.start")

    {opts, _, _} =
      OptionParser.parse(args,
        strict: [dry: :boolean, map: :integer],
        aliases: [d: :dry, m: :map]
      )

    dry = Keyword.get(opts, :dry, false)
    only_map = Keyword.get(opts, :map)

    Mix.shell().info("[migrate_maps] starting (dry=#{dry}, only_map=#{inspect(only_map)})")

    query =
      if only_map do
        {"SELECT id, name, width, height, tiles_json, collisions_json, objects_json, schema_version FROM game_maps WHERE id = ?",
         [only_map]}
      else
        {"SELECT id, name, width, height, tiles_json, collisions_json, objects_json, schema_version FROM game_maps",
         []}
      end

    {sql, params} = query

    case Repo.query(sql, params) do
      {:ok, %{rows: rows}} ->
        stats =
          Enum.reduce(rows, %{ok: 0, skipped: 0, error: 0, events: 0, objects: 0}, fn row, acc ->
            migrate_row(row, dry, acc)
          end)

        Mix.shell().info("""
        [migrate_maps] DONE
          maps migrated:  #{stats.ok}
          maps skipped:   #{stats.skipped}
          maps errored:   #{stats.error}
          events created: #{stats.events}
          objects created: #{stats.objects}
        """)

      {:error, err} ->
        Mix.raise("Failed to query game_maps: #{inspect(err)}")
    end
  end

  # ── Per-row migration ────────────────────────────────────────

  defp migrate_row([id, name, w, h, tiles, collisions, objects, schema_v], dry, acc)
       when is_integer(schema_v) and schema_v >= 2 do
    Mix.shell().info("  skip  ##{id}  #{name}  (schema_version=#{schema_v}, already migrated)")
    _ = dry
    %{acc | skipped: acc.skipped + 1}
    |> tap(fn _ -> :ok = ensure_unused([tiles, collisions, objects, w, h]) end)
  end

  defp migrate_row([id, name, w, h, tiles_json, coll_json, obj_json, _], dry, acc) do
    with {:ok, layers} <- parse_tiles(tiles_json, w, h),
         events when is_list(events) <- parse_collisions(coll_json),
         objects_list when is_list(objects_list) <- parse_objects(obj_json) do
      layers_out =
        Jason.encode!(%{
          schema_version: 2,
          layers: layers
        })

      Mix.shell().info(
        "  ok    ##{id}  #{name}  (#{w}x#{h}, #{length(events)} events, #{length(objects_list)} objects)"
      )

      unless dry do
        Repo.query(
          "UPDATE game_maps SET layers_json = ?, schema_version = 2 WHERE id = ?",
          [layers_out, id]
        )

        for ev <- events, do: insert_event(id, ev)
        for obj <- objects_list, do: insert_object(id, obj)
      end

      %{
        acc
        | ok: acc.ok + 1,
          events: acc.events + length(events),
          objects: acc.objects + length(objects_list)
      }
    else
      err ->
        Mix.shell().error("  ERR   ##{id}  #{name}  #{inspect(err)}")
        %{acc | error: acc.error + 1}
    end
  end

  # ── Tile parsing ─────────────────────────────────────────────

  defp parse_tiles(nil, w, h), do: {:ok, empty_layers(w, h)}
  defp parse_tiles("", w, h), do: {:ok, empty_layers(w, h)}

  defp parse_tiles(json, w, h) when is_binary(json) do
    case Jason.decode(json) do
      {:ok, list} when is_list(list) -> normalize_tiles(list, w, h)
      {:ok, _} -> {:ok, empty_layers(w, h)}
      {:error, _} -> {:ok, empty_layers(w, h)}
    end
  end

  # Flat array: single ground layer, fill defaults for others.
  defp normalize_tiles(list, w, h) when is_list(list) do
    if length(list) == w * h and is_number(List.first(list) || 0) do
      {:ok,
       %{
         "ground" => list,
         "overlay" => List.duplicate(0, w * h),
         "passability" => List.duplicate(0, w * h),
         "fringe" => List.duplicate(0, w * h),
         "elevation" => List.duplicate(0, w * h)
       }}
    else
      # 5-tuple array-of-arrays
      case list do
        [ground, overlay, passability, fringe, elevation | _] ->
          {:ok,
           %{
             "ground" => ensure_len(ground, w * h),
             "overlay" => ensure_len(overlay, w * h),
             "passability" => ensure_len(passability, w * h),
             "fringe" => ensure_len(fringe, w * h),
             "elevation" => ensure_len(elevation, w * h)
           }}

        _ ->
          {:ok, empty_layers(w, h)}
      end
    end
  end

  defp empty_layers(w, h) do
    zeros = List.duplicate(0, max(w, 1) * max(h, 1))
    %{
      "ground" => zeros,
      "overlay" => zeros,
      "passability" => zeros,
      "fringe" => zeros,
      "elevation" => zeros
    }
  end

  defp ensure_len(list, target) when is_list(list) do
    cur = length(list)

    cond do
      cur == target -> list
      cur > target -> Enum.take(list, target)
      true -> list ++ List.duplicate(0, target - cur)
    end
  end

  defp ensure_len(_, target), do: List.duplicate(0, target)

  # ── Event / object parsing ───────────────────────────────────

  defp parse_collisions(nil), do: []
  defp parse_collisions(""), do: []

  defp parse_collisions(json) when is_binary(json) do
    case Jason.decode(json) do
      {:ok, list} when is_list(list) -> list
      _ -> []
    end
  end

  defp parse_objects(nil), do: []
  defp parse_objects(""), do: []

  defp parse_objects(json) when is_binary(json) do
    case Jason.decode(json) do
      {:ok, list} when is_list(list) -> list
      _ -> []
    end
  end

  defp insert_event(map_id, %{"x" => x, "y" => y, "type" => type} = ev) do
    Repo.query(
      """
      INSERT INTO game_map_events
        (map_id, x, y, event_type, data_json, trigger_type, conditions_json, actions_json, radius, width, height, required_item_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      """,
      [
        map_id,
        to_int(x),
        to_int(y),
        type,
        to_json(Map.get(ev, "data")),
        Map.get(ev, "trigger"),
        to_json(Map.get(ev, "conditions")),
        to_json(Map.get(ev, "actions")),
        Map.get(ev, "radius"),
        Map.get(ev, "width"),
        Map.get(ev, "height"),
        Map.get(ev, "required_item_id")
      ]
    )
  end

  defp insert_event(_, _), do: :skip

  defp insert_object(map_id, %{"x" => x, "y" => y, "preset" => preset, "type" => type} = obj) do
    Repo.query(
      """
      INSERT INTO game_map_objects
        (map_id, x, y, preset, object_type, icon, label, blocking, light_json, flag_key,
         sprite_url, sprite_w, sprite_h, anim_frames_json, anim_fps,
         battle_hp, battle_destroy_type, battle_destroy_damage, battle_destroy_radius, battle_cover_value)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      """,
      [
        map_id,
        to_int(x),
        to_int(y),
        preset,
        type,
        Map.get(obj, "icon"),
        Map.get(obj, "label"),
        if(Map.get(obj, "blocking"), do: 1, else: 0),
        to_json(Map.get(obj, "light")),
        Map.get(obj, "flagKey"),
        Map.get(obj, "sprite_url"),
        Map.get(obj, "sprite_w"),
        Map.get(obj, "sprite_h"),
        to_json(Map.get(obj, "anim_frames")),
        Map.get(obj, "anim_fps"),
        Map.get(obj, "battle_hp"),
        Map.get(obj, "battle_destroy_type"),
        Map.get(obj, "battle_destroy_damage"),
        Map.get(obj, "battle_destroy_radius"),
        Map.get(obj, "battle_cover_value")
      ]
    )
  end

  defp insert_object(_, _), do: :skip

  # ── Misc ─────────────────────────────────────────────────────

  defp to_int(n) when is_integer(n), do: n
  defp to_int(n) when is_float(n), do: trunc(n)

  defp to_int(n) when is_binary(n) do
    case Integer.parse(n) do
      {x, _} -> x
      _ -> 0
    end
  end

  defp to_int(_), do: 0

  defp to_json(nil), do: nil
  defp to_json(s) when is_binary(s), do: s
  defp to_json(v), do: Jason.encode!(v)

  defp ensure_unused(_), do: :ok
end
