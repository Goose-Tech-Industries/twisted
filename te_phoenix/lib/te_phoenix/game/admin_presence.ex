defmodule TePhoenix.Game.AdminPresence do
  @moduledoc """
  Tracks which staff are on AdminSauce and what page they're viewing.
  ETS-based, keyed by user_id. Auto-cleans up when LiveView process dies.
  """

  use GenServer

  @table :admin_presence

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  @impl true
  def init(_) do
    :ets.new(@table, [:named_table, :public, :set, read_concurrency: true])
    {:ok, %{monitors: %{}}}
  end

  # ── Public API ──────────────────────────────────────────────────

  @doc "Register an admin user as present. Monitors calling process for auto-cleanup."
  def track(user_id, data) when is_integer(user_id) and user_id > 0 do
    entry = Map.merge(data, %{user_id: user_id, pid: self(), connected_at: System.system_time(:second)})
    :ets.insert(@table, {user_id, entry})
    GenServer.cast(__MODULE__, {:monitor, user_id, self()})
    :ok
  end

  @doc "Update which page a tracked user is on."
  def update_page(user_id, page) when is_integer(user_id) do
    case get(user_id) do
      nil -> :ok
      data ->
        :ets.insert(@table, {user_id, Map.put(data, :page, page)})
        :ok
    end
  end

  @doc "Remove a user."
  def untrack(user_id) when is_integer(user_id) do
    :ets.delete(@table, user_id)
    :ok
  end

  def get(user_id) do
    case :ets.lookup(@table, user_id) do
      [{_, data}] -> data
      [] -> nil
    end
  end

  def all do
    :ets.foldl(fn {_id, data}, acc -> [data | acc] end, [], @table)
  end

  def online_user_ids do
    :ets.foldl(fn {id, _data}, acc -> [id | acc] end, [], @table)
    |> MapSet.new()
  end

  # ── GenServer callbacks ─────────────────────────────────────────

  @impl true
  def handle_cast({:monitor, user_id, pid}, %{monitors: monitors} = state) do
    # If we already monitor a different pid for this user, demonitor the old one
    monitors = case Map.get(monitors, user_id) do
      {old_ref, old_pid} when old_pid != pid ->
        Process.demonitor(old_ref, [:flush])
        Map.delete(monitors, user_id)
      _ -> monitors
    end

    ref = Process.monitor(pid)
    {:noreply, %{state | monitors: Map.put(monitors, user_id, {ref, pid})}}
  end

  @impl true
  def handle_info({:DOWN, ref, :process, pid, _reason}, %{monitors: monitors} = state) do
    # Find which user_id this was and clean up
    {user_id, monitors} = Enum.reduce(monitors, {nil, monitors}, fn {uid, {r, p}}, {found, acc} ->
      if r == ref and p == pid do
        {uid, Map.delete(acc, uid)}
      else
        {found, acc}
      end
    end)

    if user_id, do: :ets.delete(@table, user_id)
    {:noreply, %{state | monitors: monitors}}
  end

  def handle_info(_, state), do: {:noreply, state}
end
