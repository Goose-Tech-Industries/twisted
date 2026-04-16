defmodule TePhoenix.ClipboardServer do
  @moduledoc """
  Per-user, server-side clipboard for the visual-scripting editor (and
  eventually the map editor). Keyed by `{user_id, kind}` so a user can
  have one active script clipboard and one active map-stamp clipboard
  without them stepping on each other.

  ## Why server-side

  The script editor originally used a JS Map in the hook for Ctrl+C/V.
  That means if a designer copies nodes in one browser tab and switches
  to another tab, the clipboard is gone — not how any real tool works.
  Storing the clipboard server-side lets a user copy in tab A and paste
  in tab B, or copy on desktop and paste on a tablet session, as long as
  the user_id is the same.

  ## Storage

  Backed by a named, public ETS table so lookups are O(1) and the writes
  don't need to round-trip through a GenServer's mailbox. The GenServer
  is only here to own the table's lifecycle (created in `init`, cleaned
  up if the owner dies) and to evict old entries periodically.

  ## Eviction

  Every `@evict_interval_ms` the server walks the table and drops any
  entry older than `@entry_ttl_ms`. 24h TTL is long enough for a
  multi-day work session; old entries are discarded silently.
  """
  use GenServer

  @table :clipboard_store
  @evict_interval_ms 60 * 60 * 1_000
  @entry_ttl_ms 24 * 60 * 60 * 1_000

  # ── Public API ───────────────────────────────────────────────

  def start_link(_opts \\ []) do
    GenServer.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  @doc """
  Store a clipboard entry for `user_id` under `kind` (an atom, e.g.
  `:script_nodes`). Overwrites any previous entry for that key.
  """
  @spec put(integer() | String.t(), atom(), term()) :: :ok
  def put(user_id, kind, payload) when is_atom(kind) do
    ensure_table()
    :ets.insert(@table, {{user_id, kind}, payload, System.system_time(:millisecond)})
    :ok
  end

  @doc """
  Fetch a clipboard entry. Returns `{:ok, payload}` or `:empty`.
  """
  @spec get(integer() | String.t(), atom()) :: {:ok, term()} | :empty
  def get(user_id, kind) when is_atom(kind) do
    ensure_table()

    case :ets.lookup(@table, {user_id, kind}) do
      [{_, payload, _ts}] -> {:ok, payload}
      [] -> :empty
    end
  end

  @doc "Forget a clipboard entry."
  @spec clear(integer() | String.t(), atom()) :: :ok
  def clear(user_id, kind) when is_atom(kind) do
    :ets.delete(@table, {user_id, kind})
    :ok
  end

  # ── GenServer ────────────────────────────────────────────────

  @impl true
  def init(:ok) do
    ensure_table()
    schedule_evict()
    {:ok, %{}}
  end

  @impl true
  def handle_info(:evict, state) do
    cutoff = System.system_time(:millisecond) - @entry_ttl_ms

    stale =
      :ets.foldl(
        fn {key, _payload, ts}, acc ->
          if ts < cutoff, do: [key | acc], else: acc
        end,
        [],
        @table
      )

    Enum.each(stale, &:ets.delete(@table, &1))
    schedule_evict()
    {:noreply, state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  defp schedule_evict, do: Process.send_after(self(), :evict, @evict_interval_ms)

  defp ensure_table do
    case :ets.whereis(@table) do
      :undefined ->
        :ets.new(@table, [:named_table, :public, :set, read_concurrency: true])

      _ ->
        :ok
    end
  end
end
