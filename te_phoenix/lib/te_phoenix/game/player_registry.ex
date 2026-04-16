defmodule TePhoenix.Game.PlayerRegistry do
  @moduledoc """
  In-memory registry of online players. Replaces Node.js state.onlinePlayers.
  Uses ETS for concurrent reads + an Agent for writes.

  Each entry: %{
    char_id, user_id, name, map_id, x, y, level, role, chat_color,
    presence, mount_speed_mult, in_arena, ...
  }

  Keyed by char_id (not socket_id like Node.js — Phoenix channels are per-topic).
  """

  use GenServer
  require Logger

  @table :online_players

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  @impl true
  def init(_) do
    :ets.new(@table, [:named_table, :public, :set, read_concurrency: true])
    {:ok, %{}}
  end

  # ── Public API ──────────────────────────────────────────────────

  @doc "Register an online player. Overwrites if already exists."
  def put(char_id, player_data) when is_integer(char_id) do
    data = Map.put(player_data, :char_id, char_id)
    :ets.insert(@table, {char_id, data})
    :ok
  end

  @doc "Get a player by char_id. Returns nil if offline."
  def get(char_id) do
    case :ets.lookup(@table, char_id) do
      [{_, data}] -> data
      [] -> nil
    end
  end

  @doc "Remove a player (disconnect). Cascades to pathfinding queue GC."
  def delete(char_id) do
    :ets.delete(@table, char_id)

    # Cascade: a disconnected player must have their pathfinding queue
    # cleaned up so the movement ticker doesn't advance a ghost position.
    # The clear is capability-gated internally so this is safe even when
    # pathfinding is disabled.
    try do
      TePhoenix.Pathfinding.clear(char_id)
    rescue
      _ -> :ok
    end

    :ok
  end

  @doc "Update a player's fields (partial update)."
  def update(char_id, updates) when is_map(updates) do
    case get(char_id) do
      nil -> {:error, :not_found}
      data ->
        new_data = Map.merge(data, updates)
        :ets.insert(@table, {char_id, new_data})
        {:ok, new_data}
    end
  end

  @doc "Get all players on a specific map."
  def on_map(map_id) do
    :ets.foldl(fn {_id, data}, acc ->
      if data.map_id == map_id, do: [data | acc], else: acc
    end, [], @table)
  end

  @doc "Get all online players."
  def all do
    :ets.foldl(fn {_id, data}, acc -> [data | acc] end, [], @table)
  end

  @doc "Check if a player is online."
  def online?(char_id) do
    :ets.member(@table, char_id)
  end

  @doc "Count online players."
  def count do
    :ets.info(@table, :size)
  end
end
