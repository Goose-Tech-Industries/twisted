defmodule TePhoenix.World.SpawnZoneTicker do
  @moduledoc """
  Periodic NPC spawner that drives every enabled spawn zone on every map.

  On each tick (default 30 s) the ticker:

    1. Reads `game_map_spawn_zones` for every map
    2. For each enabled zone whose `flag` (if set) is satisfied, rolls the
       weighted `encounter_table` to pick an NPC template id
    3. Picks a random walkable cell inside the rect
    4. Inserts a row into `game_npcs` with `is_enemy = true` at that cell
    5. Caps spawns per zone via `scaling_factor` (rounded up) so a zone
       can't infinitely flood the map

  The ticker only runs when the `:spawn_zones` capability is enabled — it
  checks `Capabilities.enabled?/1` on every tick and no-ops when off.
  This is the contract every capability-backed runtime follows.
  """
  use GenServer
  require Logger

  alias TePhoenix.{Capabilities, Repo}

  @default_tick_ms 30_000
  @max_spawns_per_zone 8
  @pass_cache :spawn_pass_cache
  @invalidation_topic "map:saved"

  # ── Public API ───────────────────────────────────────────────

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Force an immediate tick (useful for tests + debug)."
  def tick_now, do: GenServer.cast(__MODULE__, :tick)

  @doc "Synchronous tick — blocks until the spawn pass completes. Test/debug only."
  def sync_tick, do: GenServer.call(__MODULE__, :sync_tick, 30_000)

  # ── GenServer ────────────────────────────────────────────────

  @impl true
  def init(opts) do
    interval = Keyword.get(opts, :interval_ms, @default_tick_ms)

    # Passability cache lives in an ETS table keyed by map_id. Loaded on
    # miss, reused across every tick. Invalidated via PubSub when a map
    # is saved in the editor.
    case :ets.whereis(@pass_cache) do
      :undefined ->
        :ets.new(@pass_cache, [:named_table, :public, :set, read_concurrency: true])

      _ ->
        :ok
    end

    Phoenix.PubSub.subscribe(TePhoenix.PubSub, @invalidation_topic)

    schedule_tick(interval)
    {:ok, %{interval: interval}}
  end

  @impl true
  def handle_info(:tick, state) do
    if Capabilities.enabled?(:spawn_zones) or Capabilities.enabled?(:npc_behavior) do
      do_tick()
    end

    schedule_tick(state.interval)
    {:noreply, state}
  end

  # PubSub invalidation — a map was saved, drop its passability cache so
  # the next spawn tick reloads with the fresh layer data.
  def handle_info({:map_saved, map_id}, state) when is_integer(map_id) do
    :ets.delete(@pass_cache, map_id)
    {:noreply, state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  @impl true
  def handle_cast(:tick, state) do
    do_tick()
    {:noreply, state}
  end

  @impl true
  def handle_call(:sync_tick, _from, state) do
    do_tick()
    {:reply, :ok, state}
  end

  defp schedule_tick(interval), do: Process.send_after(self(), :tick, interval)

  # ── Tick body ────────────────────────────────────────────────

  defp do_tick do
    zones = load_all_zones()

    Enum.each(zones, fn %{map_id: map_id, zone: zone} ->
      try do
        maybe_spawn(map_id, zone)
      rescue
        e ->
          Logger.warning("[SpawnZoneTicker] map=#{map_id} zone=#{zone["id"]} error=#{inspect(e)}")
      end
    end)
  end

  defp load_all_zones do
    case Repo.query("SELECT map_id, zones_json FROM game_map_spawn_zones") do
      {:ok, %{rows: rows}} ->
        rows
        |> Enum.flat_map(fn [map_id, json] ->
          case Jason.decode(json || "[]") do
            {:ok, list} when is_list(list) ->
              Enum.map(list, fn zone -> %{map_id: map_id, zone: zone} end)

            _ ->
              []
          end
        end)
        |> Enum.filter(fn %{zone: z} -> z["enabled"] != false end)
        |> Enum.filter(fn %{zone: z} -> flag_satisfied?(z["flag"]) end)

      _ ->
        []
    end
  rescue
    _ -> []
  end

  defp flag_satisfied?(nil), do: true
  defp flag_satisfied?(""), do: true

  defp flag_satisfied?(flag) do
    case Repo.query("SELECT value FROM game_world_flags WHERE flag = ?", [flag]) do
      {:ok, %{rows: [[v]]}} -> v > 0
      _ -> false
    end
  end

  defp maybe_spawn(map_id, zone) do
    encounters = zone["encounter_table"] || []
    cap = cap_for(zone)
    existing = count_existing(map_id, zone)
    Logger.debug("[SpawnZoneTicker] map=#{map_id} encounters=#{length(encounters)} existing=#{existing} cap=#{cap}")

    cond do
      encounters == [] ->
        Logger.debug("[SpawnZoneTicker] skip: no encounters")
        :ok

      existing >= cap ->
        Logger.debug("[SpawnZoneTicker] skip: cap reached")
        :ok

      true ->
        case roll(encounters) do
          nil ->
            Logger.debug("[SpawnZoneTicker] skip: roll nil")
            :ok

          npc_template_id ->
            case pick_walkable(map_id, zone["rect"]) do
              nil ->
                Logger.warning("[SpawnZoneTicker] skip: pick_walkable nil for map=#{map_id} rect=#{inspect(zone["rect"])}")
                :ok

              {x, y} ->
                Logger.info("[SpawnZoneTicker] spawning npc=#{npc_template_id} at (#{x},#{y}) on map #{map_id}")
                spawn_npc(map_id, npc_template_id, x, y, zone)
            end
        end
    end
  end

  defp count_existing(map_id, zone) do
    rect = zone["rect"] || %{}
    x1 = rect["x1"] || 0
    y1 = rect["y1"] || 0
    x2 = rect["x2"] || 0
    y2 = rect["y2"] || 0

    case Repo.query(
           "SELECT COUNT(*) FROM game_npcs WHERE map_id = ? AND is_enemy = 1 AND x BETWEEN ? AND ? AND y BETWEEN ? AND ?",
           [map_id, x1, x2, y1, y2]
         ) do
      {:ok, %{rows: [[n]]}} -> n
      _ -> 0
    end
  end

  defp cap_for(zone) do
    base = ceil((zone["scaling_factor"] || 1.0) * 4)
    min(base, @max_spawns_per_zone)
  end

  defp roll(table) do
    weights =
      Enum.map(table, fn entry ->
        {(entry["npc_id"] || entry["template_id"]), entry["weight"] || 1}
      end)
      |> Enum.filter(fn {id, _} -> not is_nil(id) end)

    total = Enum.reduce(weights, 0, fn {_, w}, acc -> acc + w end)

    if total <= 0 do
      nil
    else
      pick = :rand.uniform(total)
      walk_weights(weights, pick)
    end
  end

  defp walk_weights([{id, w} | _], pick) when pick <= w, do: id
  defp walk_weights([{_, w} | rest], pick), do: walk_weights(rest, pick - w)
  defp walk_weights([], _), do: nil

  # Pick a random tile inside the rect that's walkable on the map's
  # passability layer. Tries 12 random cells before giving up.
  defp pick_walkable(map_id, rect) when is_map(rect) do
    {pass, w, _h} = load_passability(map_id)

    if pass == nil do
      nil
    else
      x1 = rect["x1"] || 0
      y1 = rect["y1"] || 0
      x2 = rect["x2"] || 0
      y2 = rect["y2"] || 0

      Enum.find_value(1..12, nil, fn _ ->
        x = x1 + :rand.uniform(max(x2 - x1 + 1, 1)) - 1
        y = y1 + :rand.uniform(max(y2 - y1 + 1, 1)) - 1
        idx = y * w + x

        case :array.get(idx, pass) do
          0 -> {x, y}
          2 -> {x, y}
          _ -> nil
        end
      end)
    end
  end

  defp pick_walkable(_, _), do: nil

  defp load_passability(map_id) do
    case :ets.lookup(@pass_cache, map_id) do
      [{^map_id, cached}] ->
        cached

      [] ->
        loaded = do_load_passability(map_id)
        :ets.insert(@pass_cache, {map_id, loaded})
        loaded
    end
  end

  defp do_load_passability(map_id) do
    case Repo.query("SELECT width, height, layers_json, tiles_json FROM game_maps WHERE id = ?", [map_id]) do
      {:ok, %{rows: [[w, h, layers_json, tiles_json]]}} ->
        pass_list = extract_passability(layers_json, tiles_json, w, h)
        {:array.from_list(pass_list, 1), w, h}

      _ ->
        {nil, 0, 0}
    end
  rescue
    _ -> {nil, 0, 0}
  end

  defp extract_passability(json, _tiles, _w, _h) when is_binary(json) and json != "" do
    case Jason.decode(json) do
      {:ok, %{"layers" => %{"passability" => list}}} when is_list(list) -> list
      _ -> []
    end
  end

  defp extract_passability(_, _, w, h), do: List.duplicate(0, w * h)

  defp spawn_npc(map_id, template_id, x, y, _zone) do
    case Repo.query(
           """
           INSERT INTO game_npcs (name, map_id, x, y, is_enemy, char_id, icon, move_type, wander_radius, mood, is_dead)
           VALUES (?, ?, ?, ?, 1, ?, '👹', 'WANDER', 2, 'angry', 0)
           """,
           ["Spawn ##{template_id}", map_id, x, y, template_id]
         ) do
      {:ok, _} ->
        :ok

      {:error, reason} ->
        Logger.warning("[SpawnZoneTicker] insert failed: #{inspect(reason)}")
        :ok
    end
  end
end
