defmodule TePhoenix.Matches.Lobby do
  @moduledoc """
  Match lobby state machine.

  Lifecycle:
    `ready_check` → `character_select` → `countdown` → `playing` → `results`

  Each lobby is a GenServer process spawned by the Queue when enough
  players are matched. The lobby:

    1. Sends a ready check to all players (accept within N seconds)
    2. If all accept → character select phase (optional, mode-dependent)
    3. Countdown (3-2-1) → transitions to playing
    4. Creates the battle via Manager + starts wave sequences if configured
    5. On match end → calculates results, distributes rewards, broadcasts

  Players who don't accept the ready check are removed and re-queued.
  The lobby dissolves and the remaining players go back to queue.
  """

  use GenServer
  require Logger

  alias TePhoenix.Matches.Registry

  defstruct [
    :id,
    :mode_key,
    :mode,
    :map_id,
    :teams,
    :phase,
    :battle_id,
    :created_at,
    :ready_players,
    :ready_timer,
    :match_timer,
    :results
  ]

  # ── Public API ──────────────────────────────────────────────────

  def create(mode_key, teams, map_id) do
    id = :crypto.strong_rand_bytes(8) |> Base.encode16(case: :lower)
    mode = Registry.get(mode_key)

    if mode do
      case DynamicSupervisor.start_child(
        TePhoenix.Matches.Supervisor,
        {__MODULE__, id: id, mode_key: mode_key, mode: mode, teams: teams, map_id: map_id}
      ) do
        {:ok, _pid} -> {:ok, id}
        error -> error
      end
    else
      {:error, :unknown_mode}
    end
  end

  def start_link(opts) do
    id = Keyword.fetch!(opts, :id)
    GenServer.start_link(__MODULE__, opts, name: via(id))
  end

  def ready(lobby_id, char_id) do
    GenServer.call(via(lobby_id), {:ready, char_id})
  end

  def decline(lobby_id, char_id) do
    GenServer.call(via(lobby_id), {:decline, char_id})
  end

  def get_state(lobby_id) do
    GenServer.call(via(lobby_id), :get_state)
  end

  defp via(id), do: {:via, Registry, {TePhoenix.MatchLobbyRegistry, id}}

  # ── GenServer ───────────────────────────────────────────────────

  @impl true
  def init(opts) do
    mode = Keyword.fetch!(opts, :mode)

    lobby = %__MODULE__{
      id: Keyword.fetch!(opts, :id),
      mode_key: Keyword.fetch!(opts, :mode_key),
      mode: mode,
      map_id: Keyword.fetch!(opts, :map_id),
      teams: Keyword.fetch!(opts, :teams),
      phase: :ready_check,
      created_at: System.monotonic_time(:millisecond),
      ready_players: MapSet.new(),
      results: nil
    }

    timeout_ms = (mode.ready_check_seconds || 15) * 1000
    timer = Process.send_after(self(), :ready_timeout, timeout_ms)
    lobby = %{lobby | ready_timer: timer}

    broadcast(lobby, "lobby_created", %{
      lobby_id: lobby.id,
      mode: lobby.mode_key,
      teams: lobby.teams,
      phase: "ready_check",
      timeout_seconds: mode.ready_check_seconds
    })

    {:ok, lobby}
  end

  @impl true
  def handle_call({:ready, char_id}, _from, %{phase: :ready_check} = lobby) do
    ready = MapSet.put(lobby.ready_players, char_id)
    lobby = %{lobby | ready_players: ready}
    all_ids = all_char_ids(lobby)

    broadcast(lobby, "player_ready", %{char_id: char_id, ready_count: MapSet.size(ready), needed: length(all_ids)})

    if MapSet.size(ready) >= length(all_ids) do
      if lobby.ready_timer, do: Process.cancel_timer(lobby.ready_timer)
      lobby = transition_to_countdown(lobby)
      {:reply, :ok, lobby}
    else
      {:reply, :ok, lobby}
    end
  end

  def handle_call({:ready, _}, _from, lobby), do: {:reply, {:error, :wrong_phase}, lobby}

  def handle_call({:decline, char_id}, _from, %{phase: :ready_check} = lobby) do
    broadcast(lobby, "player_declined", %{char_id: char_id})
    if lobby.ready_timer, do: Process.cancel_timer(lobby.ready_timer)
    dissolve(lobby, :player_declined)
    {:stop, :normal, :ok, lobby}
  end

  def handle_call({:decline, _}, _from, lobby), do: {:reply, {:error, :wrong_phase}, lobby}

  def handle_call(:get_state, _from, lobby) do
    {:reply, %{
      id: lobby.id,
      mode: lobby.mode_key,
      phase: lobby.phase,
      teams: lobby.teams,
      map_id: lobby.map_id,
      ready_count: MapSet.size(lobby.ready_players),
      battle_id: lobby.battle_id,
      results: lobby.results
    }, lobby}
  end

  @impl true
  def handle_info(:ready_timeout, %{phase: :ready_check} = lobby) do
    broadcast(lobby, "ready_timeout", %{})
    dissolve(lobby, :ready_timeout)
    {:stop, :normal, lobby}
  end

  def handle_info(:countdown_done, %{phase: :countdown} = lobby) do
    lobby = start_match(lobby)
    {:noreply, lobby}
  end

  def handle_info(:match_time_limit, %{phase: :playing} = lobby) do
    lobby = end_match(lobby, :time_limit)
    {:noreply, lobby}
  end

  def handle_info({:match_ended, winner_team}, %{phase: :playing} = lobby) do
    lobby = end_match(lobby, {:winner, winner_team})
    {:noreply, lobby}
  end

  def handle_info(:cleanup, _lobby) do
    {:stop, :normal, nil}
  end

  def handle_info(_, lobby), do: {:noreply, lobby}

  # ── Phase transitions ───────────────────────────────────────────

  defp transition_to_countdown(lobby) do
    lobby = %{lobby | phase: :countdown, ready_timer: nil}
    broadcast(lobby, "countdown", %{seconds: 3})
    Process.send_after(self(), :countdown_done, 3_000)
    lobby
  end

  defp start_match(lobby) do
    battle_id = create_battle(lobby)
    lobby = %{lobby | phase: :playing, battle_id: battle_id}

    # Start match timer if configured
    lobby =
      if lobby.mode.match_time_limit_seconds > 0 do
        timer = Process.send_after(self(), :match_time_limit, lobby.mode.match_time_limit_seconds * 1000)
        %{lobby | match_timer: timer}
      else
        lobby
      end

    broadcast(lobby, "match_started", %{
      battle_id: battle_id,
      map_id: lobby.map_id,
      mode: lobby.mode_key
    })

    # Start wave sequences if the mode has them
    start_waves(lobby)

    lobby
  end

  defp end_match(lobby, reason) do
    if lobby.match_timer, do: Process.cancel_timer(lobby.match_timer)

    results = calculate_results(lobby, reason)
    lobby = %{lobby | phase: :results, results: results}

    distribute_rewards(results, lobby)

    broadcast(lobby, "match_results", %{
      results: results,
      mode: lobby.mode_key
    })

    Process.send_after(self(), :cleanup, 30_000)
    lobby
  end

  defp dissolve(lobby, reason) do
    broadcast(lobby, "lobby_dissolved", %{reason: to_string(reason)})
  end

  # ── Battle creation ─────────────────────────────────────────────

  defp create_battle(lobby) do
    team_specs =
      Enum.map(lobby.teams, fn team ->
        {team.team_id, Enum.map(team.members, fn char_id ->
          %{char_id: char_id, is_ai: false}
        end)}
      end)

    try do
      case TePhoenix.Battle.Manager.create_battle(team_specs, lobby.map_id) do
        {:ok, battle_id} -> battle_id
        _ -> nil
      end
    rescue
      _ -> nil
    end
  end

  # ── Wave integration ────────────────────────────────────────────

  defp start_waves(lobby) do
    case lobby.mode.win_conditions do
      %{"wave_def_key" => wave_key} when is_binary(wave_key) ->
        TePhoenix.Waves.Scheduler.start(wave_key, map_id: lobby.map_id)

      _ ->
        :ok
    end
  rescue
    _ -> :ok
  end

  # ── Results ─────────────────────────────────────────────────────

  defp calculate_results(lobby, reason) do
    winner_team =
      case reason do
        {:winner, team_id} -> team_id
        :time_limit -> determine_winner_by_score(lobby)
        _ -> nil
      end

    %{
      winner_team: winner_team,
      reason: format_reason(reason),
      teams: Enum.map(lobby.teams, fn team ->
        %{
          team_id: team.team_id,
          members: team.members,
          won: team.team_id == winner_team
        }
      end),
      duration_seconds: div(System.monotonic_time(:millisecond) - lobby.created_at, 1000)
    }
  end

  defp determine_winner_by_score(_lobby), do: 1

  defp format_reason({:winner, _}), do: "team_eliminated"
  defp format_reason(:time_limit), do: "time_limit"
  defp format_reason(other), do: to_string(other)

  # ── Rewards ─────────────────────────────────────────────────────

  defp distribute_rewards(results, lobby) do
    rewards = lobby.mode.rewards || %{}

    for team <- results.teams, char_id <- team.members do
      xp = if team.won, do: rewards["xp_win"] || 0, else: rewards["xp_loss"] || 0
      gold = if team.won, do: rewards["gold_win"] || 0, else: rewards["gold_loss"] || 0
      rank_delta = if team.won, do: rewards["rank_win"] || 0, else: rewards["rank_loss"] || 0

      try do
        if xp > 0 or gold > 0 do
          TePhoenix.Repo.query(
            "UPDATE characters SET xp = xp + ?, gold = gold + ? WHERE id = ?",
            [xp, gold, char_id]
          )
        end

        if rank_delta != 0 and lobby.mode.queue_type == "ranked" do
          TePhoenix.Repo.query(
            "UPDATE characters SET rank_points = GREATEST(0, rank_points + ?) WHERE id = ?",
            [rank_delta, char_id]
          )
        end

        Phoenix.PubSub.broadcast(TePhoenix.PubSub, "player:#{char_id}",
          {:match_rewards, %{xp: xp, gold: gold, rank_delta: rank_delta, won: team.won}})
      rescue
        e -> Logger.error("Reward distribution failed for char #{char_id}: #{inspect(e)}")
      end
    end
  end

  # ── PubSub ──────────────────────────────────────────────────────

  defp broadcast(lobby, event, payload) do
    for char_id <- all_char_ids(lobby) do
      Phoenix.PubSub.broadcast(TePhoenix.PubSub, "player:#{char_id}", {:lobby_event, event, payload})
    end

    Phoenix.PubSub.broadcast(TePhoenix.PubSub, "match:#{lobby.id}", {:lobby_event, event, payload})
  end

  defp all_char_ids(lobby) do
    Enum.flat_map(lobby.teams, & &1.members)
  end
end
