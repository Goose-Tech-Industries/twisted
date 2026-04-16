defmodule TePhoenix.Waves.Scheduler do
  @moduledoc """
  Runtime wave scheduler. Manages active wave sequences per map.

  Each running sequence tracks:
    * Which wave definition it's running
    * Current wave number
    * Spawn queue (enemies left to spawn this wave, staggered by interval)
    * Active NPCs spawned this wave (for all_dead clear condition)
    * Loop counter (for scaling on repeat)

  The scheduler ticks every second. On each tick it:
    1. Checks if the current wave's delay has elapsed → starts spawning
    2. Pops enemies from the spawn queue at their scheduled time
    3. Checks clear condition (all_dead / timer) → advances to next wave
    4. On sequence complete → fires callback, optionally loops

  ## Usage

      Waves.start("td_basic", map_id: 3)
      Waves.stop(map_id: 3)
      Waves.current_wave(map_id: 3)

  ## Integration

    * Spawn zones: each spawn entry's `zone_key` maps to a named
      spawn zone on the map. The scheduler picks a random position
      within that zone's rect.
    * Objectives: `survive_wave` objectives auto-advance when waves
      are cleared. The scheduler fires `"wave_clear"` on the
      `objectives:map:N` PubSub topic.
    * Channels: `MapChannel` receives wave lifecycle broadcasts so
      clients can show "Wave 3/5" UI, countdown timers, boss alerts.
  """

  use GenServer
  require Logger

  alias TePhoenix.Waves.Registry
  alias TePhoenix.{Capabilities, Repo}

  @tick_ms 1_000

  defstruct [
    :def_key,
    :map_id,
    :wave_number,
    :loop_count,
    :started_at,
    :wave_started_at,
    :spawn_queue,
    :spawned_npc_ids,
    :status
  ]

  # ── Public API ──────────────────────────────────────────────────

  def start_link(_opts \\ []), do: GenServer.start_link(__MODULE__, :ok, name: __MODULE__)

  @doc "Start a wave sequence on a map."
  def start(def_key, opts \\ []) do
    GenServer.call(__MODULE__, {:start, to_string(def_key), opts})
  end

  @doc "Stop the active sequence on a map."
  def stop(map_id) do
    GenServer.call(__MODULE__, {:stop, map_id})
  end

  @doc "Get the current wave state for a map."
  def current(map_id) do
    GenServer.call(__MODULE__, {:current, map_id})
  end

  @doc "List all active sequences."
  def list_active do
    GenServer.call(__MODULE__, :list_active)
  end

  @doc "Notify that an NPC was killed (for all_dead tracking)."
  def npc_killed(map_id, npc_id) do
    GenServer.cast(__MODULE__, {:npc_killed, map_id, npc_id})
  end

  # ── GenServer ───────────────────────────────────────────────────

  @impl true
  def init(:ok) do
    schedule_tick()
    {:ok, %{sequences: %{}}}
  end

  @impl true
  def handle_call({:start, def_key, opts}, _from, state) do
    wave_def = Registry.get(def_key)

    if wave_def do
      map_id = opts[:map_id] || wave_def.map_id

      if map_id do
        seq = %__MODULE__{
          def_key: def_key,
          map_id: map_id,
          wave_number: 0,
          loop_count: 0,
          started_at: now_ms(),
          wave_started_at: nil,
          spawn_queue: [],
          spawned_npc_ids: [],
          status: :waiting
        }

        seq = advance_wave(seq, wave_def)
        state = put_in(state.sequences[map_id], seq)

        broadcast(map_id, "wave_sequence_started", %{key: def_key, total_waves: length(wave_def.rounds)})
        {:reply, {:ok, seq.wave_number}, state}
      else
        {:reply, {:error, :no_map_id}, state}
      end
    else
      {:reply, {:error, :unknown_def}, state}
    end
  end

  def handle_call({:stop, map_id}, _from, state) do
    state = %{state | sequences: Map.delete(state.sequences, map_id)}
    broadcast(map_id, "wave_sequence_stopped", %{})
    {:reply, :ok, state}
  end

  def handle_call({:current, map_id}, _from, state) do
    {:reply, Map.get(state.sequences, map_id), state}
  end

  def handle_call(:list_active, _from, state) do
    {:reply, Map.values(state.sequences), state}
  end

  @impl true
  def handle_cast({:npc_killed, map_id, npc_id}, state) do
    state =
      case Map.get(state.sequences, map_id) do
        nil ->
          state

        seq ->
          seq = %{seq | spawned_npc_ids: List.delete(seq.spawned_npc_ids, npc_id)}
          put_in(state.sequences[map_id], seq)
      end

    {:noreply, state}
  end

  @impl true
  def handle_info(:tick, state) do
    state =
      if Capabilities.enabled?(:waves) do
        tick_all(state)
      else
        state
      end

    schedule_tick()
    {:noreply, state}
  end

  def handle_info(_, state), do: {:noreply, state}

  defp schedule_tick, do: Process.send_after(self(), :tick, @tick_ms)

  # ── Tick logic ──────────────────────────────────────────────────

  defp tick_all(state) do
    updated =
      Enum.reduce(state.sequences, state.sequences, fn {map_id, seq}, acc ->
        wave_def = Registry.get(seq.def_key)

        if wave_def do
          seq = tick_sequence(seq, wave_def)
          Map.put(acc, map_id, seq)
        else
          acc
        end
      end)

    # Remove completed non-looping sequences
    cleaned =
      Enum.reject(updated, fn {_map_id, seq} -> seq.status == :complete end)
      |> Map.new()

    %{state | sequences: cleaned}
  end

  defp tick_sequence(%{status: :complete} = seq, _def), do: seq

  defp tick_sequence(%{status: :waiting} = seq, wave_def) do
    round = Enum.at(wave_def.rounds, seq.wave_number - 1)
    delay_ms = ((round && round["delay_seconds"]) || 5) * 1000

    if now_ms() - (seq.wave_started_at || seq.started_at) >= delay_ms do
      broadcast(seq.map_id, "wave_start", %{
        wave: seq.wave_number,
        total: length(wave_def.rounds),
        loop: seq.loop_count
      })

      fire_callback(wave_def.on_wave_start, seq)

      queue = build_spawn_queue(round, seq, wave_def)
      %{seq | status: :spawning, spawn_queue: queue, wave_started_at: now_ms()}
    else
      seq
    end
  end

  defp tick_sequence(%{status: :spawning} = seq, wave_def) do
    now = now_ms()

    {to_spawn, remaining} =
      Enum.split_with(seq.spawn_queue, fn entry -> entry.spawn_at <= now end)

    seq = Enum.reduce(to_spawn, seq, fn entry, s ->
      npc_id = do_spawn(entry, s.map_id, wave_def)
      %{s | spawned_npc_ids: [npc_id | s.spawned_npc_ids]}
    end)

    seq = %{seq | spawn_queue: remaining}

    if remaining == [] do
      %{seq | status: :clearing}
    else
      seq
    end
  end

  defp tick_sequence(%{status: :clearing} = seq, wave_def) do
    _round = Enum.at(wave_def.rounds, seq.wave_number - 1)
    settings = wave_def.settings || %{}
    clear_cond = settings["clear_condition"] || "all_dead"

    cleared? =
      case clear_cond do
        "all_dead" ->
          seq.spawned_npc_ids == [] or
            Enum.all?(seq.spawned_npc_ids, &npc_dead?/1)

        "timer" ->
          timer_ms = (settings["wave_interval_seconds"] || 30) * 1000
          now_ms() - seq.wave_started_at >= timer_ms

        _ ->
          seq.spawned_npc_ids == []
      end

    if cleared? do
      broadcast(seq.map_id, "wave_clear", %{wave: seq.wave_number})
      fire_callback(wave_def.on_wave_clear, seq)

      # Advance objective progress if a survive_wave objective is active
      advance_survive_objectives(seq.map_id)

      if seq.wave_number >= length(wave_def.rounds) do
        if wave_def.loop do
          broadcast(seq.map_id, "wave_loop", %{loop: seq.loop_count + 1})
          seq = %{seq | wave_number: 0, loop_count: seq.loop_count + 1, spawned_npc_ids: []}
          advance_wave(seq, wave_def)
        else
          broadcast(seq.map_id, "wave_sequence_complete", %{})
          fire_callback(wave_def.on_sequence_complete, seq)
          %{seq | status: :complete}
        end
      else
        seq = %{seq | spawned_npc_ids: []}
        advance_wave(seq, wave_def)
      end
    else
      seq
    end
  end

  defp tick_sequence(seq, _def), do: seq

  # ── Wave advancement ────────────────────────────────────────────

  defp advance_wave(seq, _wave_def) do
    %{seq | wave_number: seq.wave_number + 1, status: :waiting, wave_started_at: now_ms(), spawn_queue: []}
  end

  # ── Spawn queue builder ─────────────────────────────────────────

  defp build_spawn_queue(nil, _seq, _def), do: []

  defp build_spawn_queue(round, seq, wave_def) do
    base_time = now_ms()
    scaling = wave_def.scaling || %{}
    loop = seq.loop_count
    wave = seq.wave_number

    spawns = round["spawns"] || []

    Enum.flat_map(spawns, fn spawn_entry ->
      template = spawn_entry["npc_template"] || spawn_entry["npc_id"]
      count_add = trunc((scaling["count_add_per_loop"] || 0) * loop)
      count = (spawn_entry["count"] || 1) + count_add
      interval = spawn_entry["interval_ms"] || 1000
      zone_key = spawn_entry["zone_key"]
      is_boss = spawn_entry["boss"] == true

      hp_scale = 1.0 + (scaling["hp_mult_per_wave"] || 0) * (wave - 1 + loop * length(wave_def.rounds))
      atk_scale = 1.0 + (scaling["atk_mult_per_wave"] || 0) * (wave - 1 + loop * length(wave_def.rounds))

      for i <- 0..(count - 1) do
        %{
          template: template,
          zone_key: zone_key,
          is_boss: is_boss,
          hp_scale: hp_scale,
          atk_scale: atk_scale,
          spawn_at: base_time + i * interval
        }
      end
    end)
    |> Enum.sort_by(& &1.spawn_at)
  end

  # ── Spawner ─────────────────────────────────────────────────────

  defp do_spawn(entry, map_id, _wave_def) do
    # Insert a scaled NPC on the map. Uses the existing game_npcs table
    # pattern from SpawnZoneTicker. Returns the new NPC row id.
    try do
      hp = trunc(100 * entry.hp_scale)
      atk = trunc(10 * entry.atk_scale)
      name = if entry.is_boss, do: "BOSS: #{entry.template}", else: to_string(entry.template)

      case Repo.query(
        "INSERT INTO game_npcs (name, map_id, x, y, hp, max_hp, atk, is_enemy, spawn_zone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())",
        [name, map_id, :rand.uniform(20), :rand.uniform(20), hp, hp, atk, entry.zone_key]
      ) do
        {:ok, %{last_insert_id: id}} -> id
        _ -> nil
      end
    rescue
      e ->
        Logger.error("Wave spawn failed: #{inspect(e)}")
        nil
    end
  end

  # ── NPC liveness check ──────────────────────────────────────────

  defp npc_dead?(nil), do: true

  defp npc_dead?(npc_id) do
    case Repo.query("SELECT hp FROM game_npcs WHERE id = ?", [npc_id]) do
      {:ok, %{rows: [[hp]]}} -> (hp || 0) <= 0
      _ -> true
    end
  rescue
    _ -> true
  end

  # ── Objective integration ───────────────────────────────────────

  defp advance_survive_objectives(map_id) do
    try do
      instances = TePhoenix.Objectives.list_instances(map_id)

      Enum.each(instances, fn inst ->
        def_ = TePhoenix.Objectives.get_def(inst.objective_key)

        if def_ && def_.type == "survive" && inst.status in ["active", "in_progress"] do
          TePhoenix.Objectives.advance(inst.id, 1)
        end
      end)
    rescue
      _ -> :ok
    end
  end

  # ── Callbacks ───────────────────────────────────────────────────

  defp fire_callback(nil, _seq), do: :ok
  defp fire_callback(cb, _seq) when cb == %{}, do: :ok

  defp fire_callback(cb, seq) do
    try do
      if flag = cb["set_world_flag"] do
        Repo.query(
          "INSERT INTO game_world_flags (flag, value, updated_at) VALUES (?, '1', NOW()) ON DUPLICATE KEY UPDATE value='1', updated_at=NOW()",
          [flag]
        )
      end

      if event = cb["broadcast"] do
        broadcast(seq.map_id, event, %{wave: seq.wave_number, loop: seq.loop_count})
      end
    rescue
      e -> Logger.error("Wave callback failed: #{inspect(e)}")
    end
  end

  # ── PubSub ──────────────────────────────────────────────────────

  defp broadcast(map_id, event, payload) do
    Phoenix.PubSub.broadcast(TePhoenix.PubSub, "waves:map:#{map_id}", {:wave_event, event, payload})
    Phoenix.PubSub.broadcast(TePhoenix.PubSub, "objectives:map:#{map_id}", {:wave_event, event, payload})
  rescue
    _ -> :ok
  end

  defp now_ms, do: System.monotonic_time(:millisecond)
end
