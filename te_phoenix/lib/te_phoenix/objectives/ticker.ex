defmodule TePhoenix.Objectives.Ticker do
  @moduledoc """
  Periodic ticker for time-based objectives.

  Every second, advances all active `hold` / `survive` / `construct`
  objectives that have players interacting. Handles:

    * Hold-to-interact: +1 per tick per interactor, multi-player
      stacking optional (capped by `max_interactors` in settings).
    * Survive: +1 per tick regardless of interaction.
    * Construct: same as hold but transitions to a destructible on
      completion.
    * Regression: if `regress_on_cancel` is set and nobody is
      interacting, progress decreases at `regress_rate` per tick.

  Broadcasts progress updates via PubSub so the client can render
  smooth progress bars. Capability-gated by `:objectives`.
  """

  use GenServer
  require Logger

  alias TePhoenix.Objectives
  alias TePhoenix.Objectives.Registry

  @tick_interval_ms 1_000

  def start_link(_opts \\ []) do
    GenServer.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  @impl true
  def init(:ok) do
    schedule_tick()
    {:ok, %{active_maps: MapSet.new()}}
  end

  @doc "Register a map_id as having active objectives worth ticking."
  def watch_map(map_id) do
    GenServer.cast(__MODULE__, {:watch, map_id})
  end

  @doc "Unregister a map."
  def unwatch_map(map_id) do
    GenServer.cast(__MODULE__, {:unwatch, map_id})
  end

  @impl true
  def handle_cast({:watch, map_id}, state) do
    {:noreply, %{state | active_maps: MapSet.put(state.active_maps, map_id)}}
  end

  def handle_cast({:unwatch, map_id}, state) do
    {:noreply, %{state | active_maps: MapSet.delete(state.active_maps, map_id)}}
  end

  @impl true
  def handle_info(:tick, state) do
    if TePhoenix.Capabilities.enabled?(:objectives) do
      tick_all_maps(state.active_maps)
    end

    schedule_tick()
    {:noreply, state}
  end

  def handle_info({:respawn_objective, instance_id}, state) do
    Objectives.reset(instance_id)
    {:noreply, state}
  end

  def handle_info(_, state), do: {:noreply, state}

  defp schedule_tick do
    Process.send_after(self(), :tick, @tick_interval_ms)
  end

  # ── Tick logic ──────────────────────────────────────────────────

  defp tick_all_maps(map_ids) do
    Enum.each(map_ids, fn map_id ->
      instances = Registry.list_instances(map_id)

      Enum.each(instances, fn inst ->
        if inst.status in ["active", "in_progress"] do
          def_ = Registry.get_def(inst.objective_key)
          if def_, do: tick_instance(inst, def_)
        end
      end)
    end)
  rescue
    e -> Logger.error("ObjectiveTicker error: #{inspect(e)}")
  end

  defp tick_instance(inst, def_) do
    case def_.type do
      "hold" -> tick_hold(inst, def_)
      "construct" -> tick_hold(inst, def_)
      "survive" -> tick_survive(inst, def_)
      "harvest" -> tick_harvest(inst, def_)
      _ -> :ok
    end
  end

  defp tick_hold(inst, def_) do
    interactors = inst.interacting || []
    settings = def_.settings || %{}
    max_int = settings["max_interactors"] || 4
    active_count = min(length(interactors), max_int)

    cond do
      active_count > 0 ->
        Objectives.advance(inst.id, active_count)

      settings["regress_on_cancel"] == true and inst.current_value > 0 ->
        rate = settings["regress_rate"] || 1.0
        regress = max(1, trunc(rate))
        new_val = max(0, inst.current_value - regress)

        Registry.update_instance_state(inst.id, [
          {:current_value, new_val},
          {:status, if(new_val == 0, do: "active", else: "in_progress")}
        ])

        broadcast(inst.map_id, {:objective_progress, inst.id, %{inst | current_value: new_val}})

      true ->
        :ok
    end
  end

  defp tick_survive(inst, _def_) do
    Objectives.advance(inst.id, 1)
  end

  defp tick_harvest(inst, def_) do
    TePhoenix.Objectives.Resources.tick_harvest(inst, def_)
  end

  defp broadcast(map_id, message) do
    Phoenix.PubSub.broadcast(TePhoenix.PubSub, "objectives:map:#{map_id}", message)
  rescue
    _ -> :ok
  end
end
