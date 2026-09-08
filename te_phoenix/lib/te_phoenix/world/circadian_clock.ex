defmodule TePhoenix.World.CircadianClock do
  @moduledoc """
  Circadian Day/Night Engine & Nocturnal Scheduler (*An Clog Imreallach*).

  Manages realm-wide day/night progression, nocturnal denizen awakenings,
  and circadian acoustic sensitivity:
    * Circadian Phases: :dawn (06:00), :day (12:00), :dusk (18:00), :night (22:00), :midnight (02:00).
    * Diurnal vs. Nocturnal Shift:
      - When night falls, diurnal townspeople and merchants go to sleep (`is_sleeping: 1`).
      - Nocturnal NPCs (smugglers, shadow beasts, moon cultists, night watchmen) awaken (`is_nocturnal: 1`, `is_sleeping: 0`).
      - Dream consolidation pass runs on sleeping Sovereign Souls via `DreamCycle`.
    * Nocturnal Acoustics:
      - Sound travels 1.5x further in the cool, quiet night air.
      - Sleeping denizens are startled awake by loud shouting or heavy running footsteps.
  """

  use GenServer
  require Logger
  alias TePhoenix.Repo
  alias TePhoenix.AI.DreamCycle

  @phases ["dawn", "day", "dusk", "night", "midnight"]
  @default_phase "day"
  @phase_duration_ms 180_000 # 3 minutes per in-game circadian phase (15 min full day/night cycle)

  # ── Client API ────────────────────────────────────────────────────

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Returns the current in-game time of day phase ('dawn', 'day', 'dusk', 'night', 'midnight')."
  def current_time_of_day(map_id \\ 1) do
    case Process.whereis(__MODULE__) do
      nil -> @default_phase
      pid -> GenServer.call(pid, {:get_time_of_day, map_id})
    end
  end

  @doc "Returns true if the given phase (or current phase) represents nighttime."
  def night?(phase \\ nil) do
    target_phase = String.downcase(to_string(phase || current_time_of_day()))
    target_phase in ["dusk", "night", "midnight", "witching_hour"]
  end

  @doc "Forces a specific circadian phase for testing or admin commands."
  def set_time_of_day(phase, map_id \\ 1) do
    normalized = String.downcase(to_string(phase))
    if normalized in @phases do
      GenServer.call(__MODULE__, {:set_phase, normalized, map_id})
    else
      {:error, :invalid_phase}
    end
  end

  @doc "Advances to the next circadian phase."
  def advance_phase(map_id \\ 1) do
    GenServer.call(__MODULE__, {:advance_phase, map_id})
  end

  # ── GenServer Callbacks ───────────────────────────────────────────

  @impl true
  def init(opts) do
    initial_phase = Keyword.get(opts, :initial_phase, @default_phase)
    interval = Keyword.get(opts, :interval_ms, @phase_duration_ms)
    timer_ref = schedule_phase_tick(interval)

    {:ok, %{phase: initial_phase, interval: interval, timer_ref: timer_ref, map_phases: %{}}}
  end

  @impl true
  def handle_call({:get_time_of_day, map_id}, _from, state) do
    phase = Map.get(state.map_phases, map_id, state.phase)
    {:reply, phase, state}
  end

  @impl true
  def handle_call({:set_phase, new_phase, map_id}, _from, state) do
    next_map_phases = Map.put(state.map_phases, map_id, new_phase)
    apply_circadian_shift(new_phase, map_id)
    {:reply, {:ok, new_phase}, %{state | phase: new_phase, map_phases: next_map_phases}}
  end

  @impl true
  def handle_call({:advance_phase, map_id}, _from, state) do
    current = Map.get(state.map_phases, map_id, state.phase)
    idx = Enum.find_index(@phases, &(&1 == current)) || 0
    next_phase = Enum.at(@phases, rem(idx + 1, length(@phases)))
    next_map_phases = Map.put(state.map_phases, map_id, next_phase)

    apply_circadian_shift(next_phase, map_id)
    {:reply, {:ok, next_phase}, %{state | phase: next_phase, map_phases: next_map_phases}}
  end

  @impl true
  def handle_info(:phase_tick, state) do
    idx = Enum.find_index(@phases, &(&1 == state.phase)) || 0
    next_phase = Enum.at(@phases, rem(idx + 1, length(@phases)))

    # Apply to all active maps
    apply_circadian_shift(next_phase, 1)

    timer_ref = schedule_phase_tick(state.interval)
    {:noreply, %{state | phase: next_phase, timer_ref: timer_ref}}
  end

  # ── Internal Helpers ──────────────────────────────────────────────

  defp schedule_phase_tick(interval) do
    Process.send_after(self(), :phase_tick, interval)
  end

  defp apply_circadian_shift(phase, map_id) do
    is_night = night?(phase)
    acoustic_mult = if is_night, do: 1.5, else: 1.0

    # 1. Update NPC sleeping schedules in database
    update_npc_circadian_states(is_night, map_id)

    # 2. Run DreamCycle consolidation on nightfall
    if phase == "night" do
      Task.start(fn ->
        try do
          DreamCycle.process_night_cycle()
        rescue
          _ -> :ok
        end
      end)
    end

    # 3. Update building window curfews (shutters at night, ventilation by day)
    try do
      TePhoenix.World.BuildingManager.apply_circadian_window_curfew(map_id, phase)
    rescue
      _ -> :ok
    end

    payload = %{
      time_of_day: phase,
      is_night: is_night,
      acoustic_mult: acoustic_mult,
      lighting: if(is_night, do: 0.35, else: 1.0),
      timestamp: System.system_time(:second)
    }

    # 3. Broadcast phase change to map channel and voice proximity channel
    TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "circadian_shift", payload)
    TePhoenixWeb.Endpoint.broadcast("voice:proximity:#{map_id}", "circadian_shift", payload)

    Logger.info("[CircadianClock] Map #{map_id} shifted to phase: #{phase} (is_night: #{is_night})")
  end

  defp update_npc_circadian_states(is_night, map_id) do
    try do
      if is_night do
        # Diurnal NPCs sleep (unless guards or bosses)
        Repo.query(
          """
          UPDATE game_npcs
             SET is_sleeping = 1
           WHERE map_id = ?
             AND (is_nocturnal = 0 OR is_nocturnal IS NULL)
             AND role NOT IN ('guard', 'boss', 'watchman')
          """,
          [map_id]
        )

        # Nocturnal NPCs awaken
        Repo.query(
          """
          UPDATE game_npcs
             SET is_sleeping = 0
           WHERE map_id = ?
             AND is_nocturnal = 1
          """,
          [map_id]
        )
      else
        # Daytime: Diurnal NPCs awaken
        Repo.query(
          """
          UPDATE game_npcs
             SET is_sleeping = 0
           WHERE map_id = ?
             AND (is_nocturnal = 0 OR is_nocturnal IS NULL)
          """,
          [map_id]
        )

        # Nocturnal NPCs go to sleep (unless bosses)
        Repo.query(
          """
          UPDATE game_npcs
             SET is_sleeping = 1
           WHERE map_id = ?
             AND is_nocturnal = 1
             AND role != 'boss'
          """,
          [map_id]
        )
      end
    rescue
      _ -> :ok
    catch
      :exit, _ -> :ok
      _, _ -> :ok
    end
  end
end
