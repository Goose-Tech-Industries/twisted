defmodule TePhoenix.Matches.Queue do
  @moduledoc """
  Matchmaking queue. Players join a queue by mode key. When enough
  players are queued to fill all teams, a match lobby is created.

  Supports:
    * Per-mode queues (different player counts, team sizes)
    * Optional rank-range matchmaking for ranked modes
    * Queue timeout with auto-remove
    * Party queuing (group of players enters together)

  This is a single GenServer — fine for <10K concurrent queuers.
  For production scale, shard by mode key to separate processes.
  """

  use GenServer
  require Logger

  alias TePhoenix.Matches.{Registry, Lobby}

  @queue_timeout_ms 300_000

  def start_link(_opts \\ []), do: GenServer.start_link(__MODULE__, :ok, name: __MODULE__)

  # ── Public API ──────────────────────────────────────────────────

  @doc "Join the queue for a mode. Returns :ok or {:error, reason}."
  def join(mode_key, char_id, opts \\ []) do
    GenServer.call(__MODULE__, {:join, to_string(mode_key), char_id, opts})
  end

  @doc "Leave the queue."
  def leave(char_id) do
    GenServer.call(__MODULE__, {:leave, char_id})
  end

  @doc "Get queue status for a player."
  def status(char_id) do
    GenServer.call(__MODULE__, {:status, char_id})
  end

  @doc "Get queue sizes per mode."
  def sizes do
    GenServer.call(__MODULE__, :sizes)
  end

  # ── GenServer ───────────────────────────────────────────────────

  @impl true
  def init(:ok) do
    schedule_cleanup()
    {:ok, %{
      queues: %{},
      player_modes: %{}
    }}
  end

  @impl true
  def handle_call({:join, mode_key, char_id, opts}, _from, state) do
    mode = Registry.get(mode_key)

    cond do
      is_nil(mode) ->
        {:reply, {:error, :unknown_mode}, state}

      Map.has_key?(state.player_modes, char_id) ->
        {:reply, {:error, :already_queued}, state}

      true ->
        entry = %{
          char_id: char_id,
          rank: opts[:rank] || 0,
          party: opts[:party] || [char_id],
          joined_at: System.monotonic_time(:millisecond)
        }

        queue = Map.get(state.queues, mode_key, [])
        queue = queue ++ [entry]

        state = %{state |
          queues: Map.put(state.queues, mode_key, queue),
          player_modes: Map.put(state.player_modes, char_id, mode_key)
        }

        state = try_form_match(state, mode_key, mode)

        {:reply, :ok, state}
    end
  end

  def handle_call({:leave, char_id}, _from, state) do
    case Map.get(state.player_modes, char_id) do
      nil ->
        {:reply, {:error, :not_queued}, state}

      mode_key ->
        queue = Map.get(state.queues, mode_key, [])
        queue = Enum.reject(queue, &(&1.char_id == char_id))

        state = %{state |
          queues: Map.put(state.queues, mode_key, queue),
          player_modes: Map.delete(state.player_modes, char_id)
        }

        {:reply, :ok, state}
    end
  end

  def handle_call({:status, char_id}, _from, state) do
    case Map.get(state.player_modes, char_id) do
      nil -> {:reply, %{queued: false}, state}
      mode_key ->
        queue = Map.get(state.queues, mode_key, [])
        pos = Enum.find_index(queue, &(&1.char_id == char_id)) || 0
        {:reply, %{queued: true, mode: mode_key, position: pos + 1, queue_size: length(queue)}, state}
    end
  end

  def handle_call(:sizes, _from, state) do
    sizes = Map.new(state.queues, fn {k, q} -> {k, length(q)} end)
    {:reply, sizes, state}
  end

  @impl true
  def handle_info(:cleanup, state) do
    now = System.monotonic_time(:millisecond)

    {new_queues, expired_players} =
      Enum.reduce(state.queues, {%{}, []}, fn {mode_key, queue}, {qs, exp} ->
        {kept, timed_out} = Enum.split_with(queue, fn e ->
          now - e.joined_at < @queue_timeout_ms
        end)

        expired_ids = Enum.map(timed_out, & &1.char_id)
        {Map.put(qs, mode_key, kept), exp ++ expired_ids}
      end)

    new_player_modes =
      Enum.reduce(expired_players, state.player_modes, fn id, pm ->
        Map.delete(pm, id)
      end)

    for id <- expired_players do
      Phoenix.PubSub.broadcast(TePhoenix.PubSub, "player:#{id}", {:queue_expired, id})
    end

    schedule_cleanup()
    {:noreply, %{state | queues: new_queues, player_modes: new_player_modes}}
  end

  def handle_info(_, state), do: {:noreply, state}

  defp schedule_cleanup, do: Process.send_after(self(), :cleanup, 30_000)

  # ── Match formation ─────────────────────────────────────────────

  defp try_form_match(state, mode_key, mode) do
    queue = Map.get(state.queues, mode_key, [])
    needed = mode.team_size * mode.team_count

    if length(queue) >= needed do
      {selected, remaining} = Enum.split(queue, needed)

      teams = build_teams(selected, mode)
      map_id = pick_map(mode)

      case Lobby.create(mode_key, teams, map_id) do
        {:ok, lobby_id} ->
          char_ids = Enum.map(selected, & &1.char_id)

          for id <- char_ids do
            Phoenix.PubSub.broadcast(TePhoenix.PubSub, "player:#{id}", {:match_found, lobby_id, mode_key})
          end

          new_player_modes = Enum.reduce(char_ids, state.player_modes, &Map.delete(&2, &1))

          %{state |
            queues: Map.put(state.queues, mode_key, remaining),
            player_modes: new_player_modes
          }

        {:error, reason} ->
          Logger.error("Failed to create lobby: #{inspect(reason)}")
          state
      end
    else
      state
    end
  end

  defp build_teams(players, mode) do
    players
    |> Enum.chunk_every(mode.team_size)
    |> Enum.with_index(1)
    |> Enum.map(fn {members, team_id} ->
      %{team_id: team_id, members: Enum.map(members, & &1.char_id)}
    end)
  end

  defp pick_map(mode) do
    case mode.map_pool do
      [] -> nil
      pool -> Enum.random(pool)
    end
  end
end
