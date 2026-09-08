defmodule TePhoenix.Game.MovementTicker do
  @moduledoc """
  Periodic consumer of the pathfinding queue.

  Every `@tick_ms` ms (default 200) the ticker walks every entry in the
  pathfinding ETS queue, pops the next step for that character, updates
  the `PlayerRegistry` row, persists the new (x, y) to the `characters`
  row, and broadcasts a `{:player_moved, char_id, x, y}` message on the
  player's map topic so other clients see the move.

  This is the bridge between A* pathfinding (which produces a queue) and
  the live game world (which needs to actually walk players). It only
  runs when the `:pathfinding` capability is enabled — checks on every
  tick and no-ops when off.

  Why a single global ticker instead of one process per moving player:
  pathfinding move queues are short-lived (you only have a queue while
  walking), there are typically <10 simultaneously-moving players, and
  the per-tick work is O(active queues). The simpler architecture wins.
  """
  use GenServer
  require Logger

  alias TePhoenix.{Capabilities, Pathfinding, Repo}
  alias TePhoenix.Game.PlayerRegistry

  @tick_ms 200
  @path_queue_table :pathfinding_queues
  @sweep_every 50  # ticks between stale-queue sweeps (~10s at 200ms)

  # ── Public API ───────────────────────────────────────────────

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Force a synchronous tick. Test/debug only."
  def sync_tick, do: GenServer.call(__MODULE__, :sync_tick, 5_000)

  # ── GenServer ────────────────────────────────────────────────

  @impl true
  def init(opts) do
    interval = Keyword.get(opts, :interval_ms, @tick_ms)
    schedule(interval)
    {:ok, %{interval: interval, ticks: 0}}
  end

  @impl true
  def handle_info(:tick, state) do
    if Capabilities.enabled?(:pathfinding) do
      do_tick()
    end

    new_ticks = state.ticks + 1

    # Periodic sweep of stale queue entries (characters no longer online).
    if rem(new_ticks, @sweep_every) == 0 do
      cleared = Pathfinding.sweep_stale()
      if cleared > 0 do
        Logger.info("[MovementTicker] swept #{cleared} stale path queues")
      end
    end

    schedule(state.interval)
    {:noreply, %{state | ticks: new_ticks}}
  end

  @impl true
  def handle_call(:sync_tick, _from, state) do
    do_tick()
    {:reply, :ok, state}
  end

  defp schedule(interval), do: Process.send_after(self(), :tick, interval)

  # ── Tick body ────────────────────────────────────────────────

  defp do_tick do
    if :ets.whereis(@path_queue_table) == :undefined do
      :ok
    else
      :ets.foldl(
        fn {char_id, _entry}, _acc ->
          advance(char_id)
          nil
        end,
        nil,
        @path_queue_table
      )
    end
  end

  defp advance(char_id) do
    case Pathfinding.next_step(char_id) do
      {:ok, {nx, ny}, _rest} ->
        case PlayerRegistry.get(char_id) do
          nil ->
            Pathfinding.clear(char_id)

          player ->
            PlayerRegistry.update(char_id, %{x: nx, y: ny})
            TePhoenix.Game.HotState.save_position(char_id, nx, ny)

            Phoenix.PubSub.broadcast(
              TePhoenix.PubSub,
              "map:#{player.map_id}",
              {:player_moved, char_id, nx, ny}
            )
        end

      :done ->
        TePhoenix.Game.HotState.flush_char(char_id)
        :ok
    end
  rescue
    e ->
      Logger.warning("[MovementTicker] advance failed for char=#{char_id}: #{inspect(e)}")
      Pathfinding.clear(char_id)
  end
end
