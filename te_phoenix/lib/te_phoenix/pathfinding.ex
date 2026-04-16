defmodule TePhoenix.Pathfinding do
  @moduledoc """
  A* grid pathfinding — first capability module that proves the architecture.

  This is the only entry point callers should touch. It wraps:
    * `path/4` — A* between two grid points on a passability layer
    * `path_for_player/3` — convenience wrapper that reads the player's
      current position and the target map's passability via
      `TePhoenix.Game.MapData` + `TePhoenix.Game.PlayerRegistry`
    * `enqueue/3` — append a click target to a player's path queue
    * `next_step/1` — pop the next step in the path queue
    * `clear/1` — wipe a player's queue (e.g. on cancel or interrupt)

  ## Algorithm

  Standard A* with octile heuristic on a 4-connected grid (up/down/left/right).
  Diagonals are intentionally disabled by default to keep collision and
  passability rules simple — toggle by passing `diagonals: true` to `path/4`.

  The open set is a `:gb_sets` ordered set keyed by `{f_score, x, y}` which
  gives O(log n) insert/remove without a heap dependency. For typical map
  sizes (up to 200×200) this is fast enough for click-to-move latency.

  ## Passability convention

  Tile values on the `"passability"` layer:

    * `0` — walkable
    * `1` — blocked (wall)
    * `2` — trigger only (walkable for pathing purposes)

  Out-of-bounds tiles are treated as blocked.

  ## Capability gating

  Every public function checks `TePhoenix.Capabilities.enabled?(:pathfinding)`
  and returns `{:error, :capability_disabled}` if the capability is off.
  This is the contract every capability module follows.
  """

  alias TePhoenix.Capabilities
  alias TePhoenix.Game.PlayerRegistry
  alias TePhoenix.Repo

  @typedoc "A grid coordinate."
  @type point :: {integer(), integer()}

  @typedoc "Pathfinding result — list of points from start to goal (inclusive)."
  @type path :: [point()]

  @path_queue_table :pathfinding_queues

  # ── Capability lifecycle ─────────────────────────────────────

  @doc false
  def __init__ do
    if :ets.whereis(@path_queue_table) == :undefined do
      :ets.new(@path_queue_table, [:named_table, :public, :set, read_concurrency: true])
    end

    :ok
  end

  # ── Public A* API ────────────────────────────────────────────

  @doc """
  Find a path from `start` to `goal` on a `width × height` passability layer.

  `passability` is a flat list of `width * height` tile codes (see module
  doc for the convention). Returns `{:ok, path}` where `path` is a list of
  `{x, y}` tuples from start to goal inclusive, or `{:error, :no_path}`
  if no route exists.

  Options:
    * `:diagonals` (default `false`) — allow 8-connected movement
    * `:max_iterations` (default `10_000`) — safety cap on the search
  """
  @spec path(point(), point(), [integer()], keyword()) ::
          {:ok, path()} | {:error, :no_path | :capability_disabled | :out_of_bounds}
  def path(start, goal, passability, opts \\ []) do
    with :ok <- check_capability(),
         :ok <- check_inputs(start, goal, opts) do
      width = Keyword.fetch!(opts, :width)
      height = Keyword.fetch!(opts, :height)
      diagonals = Keyword.get(opts, :diagonals, false)
      max_iters = Keyword.get(opts, :max_iterations, 10_000)

      __init__()

      pass_tuple =
        case passability do
          t when is_tuple(t) -> t
          list when is_list(list) -> List.to_tuple(list)
          _ -> {}
        end

      run_astar(start, goal, pass_tuple, width, height, diagonals, max_iters)
    end
  end

  @doc """
  Click-to-move convenience: compute and enqueue a path for a logged-in
  player from their current position to `target`. Returns the path on
  success.
  """
  @spec path_for_player(integer(), point(), keyword()) ::
          {:ok, path()} | {:error, term()}
  def path_for_player(char_id, target, opts \\ []) do
    with :ok <- check_capability(),
         %{x: x, y: y, map_id: map_id} = player <- PlayerRegistry.get(char_id),
         {:ok, %{width: w, height: h, passability: pass}} <- load_map_passability(map_id) do
      result =
        path(
          {x, y},
          target,
          pass,
          Keyword.merge([width: w, height: h], opts)
        )

      case result do
        {:ok, route} ->
          enqueue(char_id, route, %{started_at: System.system_time(:millisecond)})
          {:ok, route}

        {:error, _} = err ->
          err
      end
      |> tap(fn _ -> player end)
    else
      nil -> {:error, :player_not_online}
      err -> err
    end
  end

  # ── Path queue ───────────────────────────────────────────────

  @doc """
  Append a path to a player's queue. Replaces any existing queue.
  """
  @spec enqueue(integer(), path(), map()) :: :ok
  def enqueue(char_id, path, meta \\ %{}) do
    __init__()
    :ets.insert(@path_queue_table, {char_id, %{path: path, meta: meta}})
    :ok
  end

  @doc """
  Pop the next step. Returns `{:ok, point, remaining_path}` or `:done`
  when the queue is empty.
  """
  @spec next_step(integer()) :: {:ok, point(), path()} | :done
  def next_step(char_id) do
    case :ets.lookup(@path_queue_table, char_id) do
      [{_, %{path: [_current | [next | _] = rest]}}] ->
        :ets.insert(@path_queue_table, {char_id, %{path: rest, meta: %{}}})
        {:ok, next, rest}

      [{_, %{path: [_only]}}] ->
        :ets.delete(@path_queue_table, char_id)
        :done

      [] ->
        :done

      _ ->
        :done
    end
  end

  @doc "Discard a player's path queue (cancel button, interrupt, etc.)."
  @spec clear(integer()) :: :ok
  def clear(char_id) do
    :ets.delete(@path_queue_table, char_id)
    :ok
  end

  @doc "Peek at the current queue length."
  @spec queue_length(integer()) :: non_neg_integer()
  def queue_length(char_id) do
    case :ets.lookup(@path_queue_table, char_id) do
      [{_, %{path: p}}] -> length(p)
      _ -> 0
    end
  end

  @doc """
  Sweep stale queue entries. Drops any entry whose char_id is no longer
  present in `PlayerRegistry` — a safety net for queues that slipped
  through the PlayerRegistry.delete cascade (e.g. because the process
  crashed before reaching it, or the ETS table was populated out-of-band).

  Returns the number of entries cleared. Safe to call even when the
  pathfinding capability is off — it only reads the queue table.
  """
  @spec sweep_stale() :: non_neg_integer()
  def sweep_stale do
    __init__()

    if :ets.whereis(@path_queue_table) == :undefined do
      0
    else
      stale =
        :ets.foldl(
          fn {char_id, _entry}, acc ->
            case TePhoenix.Game.PlayerRegistry.get(char_id) do
              nil -> [char_id | acc]
              _ -> acc
            end
          end,
          [],
          @path_queue_table
        )

      Enum.each(stale, &:ets.delete(@path_queue_table, &1))
      length(stale)
    end
  end

  # ── A* core ──────────────────────────────────────────────────

  defp run_astar(start, goal, pass, w, h, diagonals?, max_iters) do
    if not walkable?(pass, w, h, goal) do
      {:error, :no_path}
    else
      open = :gb_sets.singleton({heuristic(start, goal, diagonals?), start})
      came_from = %{}
      g_score = %{start => 0}

      do_astar(open, came_from, g_score, goal, pass, w, h, diagonals?, max_iters)
    end
  end

  defp do_astar(_open, _came_from, _g, _goal, _pass, _w, _h, _diag, 0),
    do: {:error, :no_path}

  defp do_astar(open, came_from, g_score, goal, pass, w, h, diag, iters) do
    case :gb_sets.size(open) do
      0 ->
        {:error, :no_path}

      _ ->
        {{_f, current}, open} = :gb_sets.take_smallest(open)

        if current == goal do
          {:ok, reconstruct_path(came_from, current)}
        else
          {open, came_from, g_score} =
            current
            |> neighbours(diag)
            |> Enum.reduce({open, came_from, g_score}, fn n, {o, c, gs} ->
              if walkable?(pass, w, h, n) do
                tentative = Map.get(gs, current, :infinity) + step_cost(current, n)
                cur_g = Map.get(gs, n, :infinity)

                if compare_g(tentative, cur_g) do
                  f = tentative + heuristic(n, goal, diag)
                  {:gb_sets.add({f, n}, o), Map.put(c, n, current), Map.put(gs, n, tentative)}
                else
                  {o, c, gs}
                end
              else
                {o, c, gs}
              end
            end)

          do_astar(open, came_from, g_score, goal, pass, w, h, diag, iters - 1)
        end
    end
  end

  defp reconstruct_path(came_from, current, acc \\ []) do
    case Map.get(came_from, current) do
      nil -> [current | acc]
      prev -> reconstruct_path(came_from, prev, [current | acc])
    end
  end

  defp neighbours({x, y}, false), do: [{x + 1, y}, {x - 1, y}, {x, y + 1}, {x, y - 1}]

  defp neighbours({x, y}, true) do
    for dx <- -1..1, dy <- -1..1, not (dx == 0 and dy == 0), do: {x + dx, y + dy}
  end

  defp step_cost({x1, y1}, {x2, y2}) do
    if x1 != x2 and y1 != y2, do: 14, else: 10
  end

  defp heuristic({x1, y1}, {x2, y2}, false), do: (abs(x1 - x2) + abs(y1 - y2)) * 10

  defp heuristic({x1, y1}, {x2, y2}, true) do
    dx = abs(x1 - x2)
    dy = abs(y1 - y2)
    10 * max(dx, dy) + 4 * min(dx, dy)
  end

  defp compare_g(_a, :infinity), do: true
  defp compare_g(a, b), do: a < b

  defp walkable?(pass, w, h, {x, y}) when is_tuple(pass) do
    cond do
      x < 0 or y < 0 or x >= w or y >= h ->
        false

      true ->
        idx = y * w + x

        if idx >= tuple_size(pass) do
          false
        else
          case :erlang.element(idx + 1, pass) do
            0 -> true
            2 -> true
            _ -> false
          end
        end
    end
  end

  # ── Helpers ──────────────────────────────────────────────────

  defp check_capability do
    if Capabilities.enabled?(:pathfinding),
      do: :ok,
      else: {:error, :capability_disabled}
  end

  defp check_inputs(_start, _goal, opts) do
    cond do
      not Keyword.has_key?(opts, :width) -> {:error, :missing_width}
      not Keyword.has_key?(opts, :height) -> {:error, :missing_height}
      true -> :ok
    end
  end

  defp load_map_passability(map_id) do
    case Repo.query("SELECT width, height, layers_json FROM game_maps WHERE id = ?", [map_id]) do
      {:ok, %{rows: [[w, h, layers_json]]}} when is_binary(layers_json) and layers_json != "" ->
        case Jason.decode(layers_json) do
          {:ok, %{"layers" => %{"passability" => list}}} when is_list(list) ->
            {:ok, %{width: w, height: h, passability: list}}

          _ ->
            # Map exists but no passability layer — treat as fully walkable
            {:ok, %{width: w, height: h, passability: List.duplicate(0, w * h)}}
        end

      {:ok, %{rows: [[w, h, _]]}} ->
        {:ok, %{width: w, height: h, passability: List.duplicate(0, w * h)}}

      _ ->
        {:error, :map_not_found}
    end
  rescue
    _ -> {:error, :map_data_unavailable}
  end
end
