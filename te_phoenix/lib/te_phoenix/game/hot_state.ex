defmodule TePhoenix.Game.HotState do
  @moduledoc """
  Hot-State Decoupled Memory Cache & Write-Behind Engine.

  Decouples high-frequency game ticks (movement updates, continuous state changes)
  from disk-bound MySQL writes.

  All high-speed ticks write to in-memory ETS tables in microseconds (<0.05ms).
  A periodic background worker flushes accumulated dirty records to MySQL every 5 seconds,
  or immediately when a character stops moving (:done), changes maps, or disconnects.
  """

  use GenServer
  require Logger
  alias TePhoenix.Repo

  @pos_table :hot_state_positions
  @dirty_table :hot_state_dirty
  @flush_interval_ms 5_000

  # ── Public API ──────────────────────────────────────────────────

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Cache character position in ETS without hitting MySQL disk."
  def save_position(char_id, x, y) when is_integer(char_id) do
    ensure_tables()
    :ets.insert(@pos_table, {char_id, x, y, System.system_time(:millisecond)})
    :ets.insert(@dirty_table, {char_id, true})
    :ok
  end

  @doc "Get cached character position."
  def get_position(char_id) when is_integer(char_id) do
    ensure_tables()
    case :ets.lookup(@pos_table, char_id) do
      [{^char_id, x, y, _ts}] -> {:ok, {x, y}}
      _ -> :error
    end
  end

  @doc "Immediately flush a specific character's position to MySQL."
  def flush_char(char_id) when is_integer(char_id) do
    ensure_tables()
    case :ets.lookup(@pos_table, char_id) do
      [{^char_id, x, y, _ts}] ->
        Repo.query("UPDATE characters SET x = ?, y = ? WHERE id = ?", [x, y, char_id])
        :ets.delete(@dirty_table, char_id)
        :ok

      _ ->
        :ok
    end
  rescue
    e ->
      Logger.warning("[HotState] flush_char failed for #{char_id}: #{inspect(e)}")
      :error
  end

  @doc "Flush all dirty positions to MySQL."
  def flush_all do
    GenServer.call(__MODULE__, :flush_all, 10_000)
  end

  # ── GenServer Callbacks ─────────────────────────────────────────

  @impl true
  def init(_opts) do
    ensure_tables()
    schedule_flush()
    {:ok, %{flushes: 0}}
  end

  @impl true
  def handle_call(:flush_all, _from, state) do
    flushed_count = do_flush_all()
    {:reply, {:ok, flushed_count}, %{state | flushes: state.flushes + 1}}
  end

  @impl true
  def handle_info(:flush_tick, state) do
    do_flush_all()
    schedule_flush()
    {:noreply, %{state | flushes: state.flushes + 1}}
  end

  @impl true
  def terminate(_reason, _state) do
    Logger.info("[HotState] Shutting down, flushing all pending hot state to DB...")
    do_flush_all()
    :ok
  end

  # ── Internal Helpers ───────────────────────────────────────────

  defp ensure_tables do
    if :ets.whereis(@pos_table) == :undefined do
      :ets.new(@pos_table, [:set, :public, :named_table, read_concurrency: true, write_concurrency: true])
    end

    if :ets.whereis(@dirty_table) == :undefined do
      :ets.new(@dirty_table, [:set, :public, :named_table, read_concurrency: true, write_concurrency: true])
    end
    :ok
  end

  defp schedule_flush do
    Process.send_after(self(), :flush_tick, @flush_interval_ms)
  end

  defp do_flush_all do
    ensure_tables()
    dirty_ids = :ets.tab2list(@dirty_table) |> Enum.map(fn {id, _} -> id end)

    Enum.each(dirty_ids, fn char_id ->
      case :ets.lookup(@pos_table, char_id) do
        [{^char_id, x, y, _ts}] ->
          try do
            Repo.query("UPDATE characters SET x = ?, y = ? WHERE id = ?", [x, y, char_id])
            :ets.delete(@dirty_table, char_id)
          rescue
            _ -> :ok
          end

        _ ->
          :ets.delete(@dirty_table, char_id)
      end
    end)

    length(dirty_ids)
  end
end
