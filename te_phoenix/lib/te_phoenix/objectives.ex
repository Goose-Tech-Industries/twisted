defmodule TePhoenix.Objectives do
  @moduledoc """
  Public API for the generic objective/interactable system.

  Every game mode uses objectives differently, but the engine treats
  them uniformly:

    1. **Definition** (DB + ETS): what kind of objective, what the
       target is, what happens on progress/complete/fail.
    2. **Instance** (DB): a placed objective on a specific map tile
       with live state (current_value, status, who's interacting).
    3. **Lifecycle**: inactive → active → in_progress → completed/failed.
       Reset loops back to active (for respawnable objectives).

  ## Integration points

    * `world_handler.ex` — `interact_object` checks for objective,
      calls `interact_start/3` or `advance/4`.
    * `ObjectiveTicker` — ticks time-based objectives every second.
    * `MapChannel` — broadcasts state changes so clients render
      progress bars, HP bars, capture rings.
    * `EventRunner` — `on_complete` / `on_fail` fire action lists.
    * `Triggers` — objectives can fire battle trigger events.
    * `AdminSauce` — `/sauce/world/objectives` editor.

  Everything is toggleable via the `:objectives` capability module.
  """

  alias TePhoenix.Objectives.Registry
  require Logger

  # ── Queries ─────────────────────────────────────────────────────

  def get_def(key), do: Registry.get_def(key)
  def list_defs, do: Registry.list_defs()
  def list_instances(map_id), do: Registry.list_instances(map_id)
  def get_instance(id), do: Registry.get_instance(id)

  # ── Lifecycle ───────────────────────────────────────────────────

  @doc "Activate an objective instance. No-op if already active."
  def activate(instance_id) do
    inst = Registry.get_instance(instance_id)

    if inst && inst.status in ["inactive", "failed"] do
      Registry.update_instance_state(instance_id, [
        {:status, "active"},
        {:current_value, 0},
        {:started_at, now()},
        {:completed_at, nil}
      ])

      broadcast(inst.map_id, {:objective_activated, instance_id})
      :ok
    else
      {:error, :invalid_state}
    end
  end

  @doc """
  Advance an objective's progress. The `amount` meaning depends on
  the progress model:

    * `counter` — increment by amount
    * `hp` — decrement by amount (damage)
    * `timer` — increment by amount (seconds)
    * `boolean` — any non-zero amount completes it

  Returns `{:ok, new_instance}` or `{:completed, instance}` or
  `{:error, reason}`.
  """
  def advance(instance_id, amount \\ 1, opts \\ []) do
    inst = Registry.get_instance(instance_id)
    def_ = inst && Registry.get_def(inst.objective_key)

    cond do
      is_nil(inst) -> {:error, :not_found}
      is_nil(def_) -> {:error, :no_definition}
      inst.status not in ["active", "in_progress"] -> {:error, :not_active}
      def_.team_owned and opts[:team_id] == inst.team_id -> {:error, :own_team}
      true -> do_advance(inst, def_, amount, opts)
    end
  end

  defp do_advance(inst, def_, amount, opts) do
    {new_value, completed?} =
      case def_.progress_model do
        "boolean" ->
          {1, true}

        "counter" ->
          nv = (inst.current_value || 0) + amount
          {nv, nv >= def_.target_value}

        "timer" ->
          nv = (inst.current_value || 0) + amount
          {nv, nv >= def_.target_value}

        "hp" ->
          nv = max(0, (inst.current_value || def_.target_value) - amount)
          {nv, nv <= 0}

        _ ->
          {inst.current_value + amount, false}
      end

    new_status = if completed?, do: "completed", else: "in_progress"

    updates = [
      {:current_value, new_value},
      {:status, new_status}
    ]

    updates =
      if completed? do
        updates ++ [{:completed_at, now()}]
      else
        updates
      end

    Registry.update_instance_state(inst.id, updates)

    updated = %{inst | current_value: new_value, status: new_status}

    # Fire callbacks
    if completed? do
      fire_callback(def_.on_complete, updated, opts)
      broadcast(inst.map_id, {:objective_completed, inst.id, updated})

      if def_.respawn_seconds > 0 do
        schedule_respawn(inst.id, def_.respawn_seconds)
      end

      {:completed, updated}
    else
      fire_callback(def_.on_progress, updated, opts)
      broadcast(inst.map_id, {:objective_progress, inst.id, updated})
      {:ok, updated}
    end
  end

  @doc "Fail an objective instance."
  def fail(instance_id, opts \\ []) do
    inst = Registry.get_instance(instance_id)
    def_ = inst && Registry.get_def(inst.objective_key)

    if inst && inst.status in ["active", "in_progress"] do
      Registry.update_instance_state(instance_id, [
        {:status, "failed"},
        {:completed_at, now()}
      ])

      updated = %{inst | status: "failed"}
      if def_, do: fire_callback(def_.on_fail, updated, opts)
      broadcast(inst.map_id, {:objective_failed, instance_id, updated})
      :ok
    else
      {:error, :invalid_state}
    end
  end

  @doc "Reset a completed/failed objective back to active."
  def reset(instance_id) do
    inst = Registry.get_instance(instance_id)
    def_ = inst && Registry.get_def(inst.objective_key)

    if inst do
      initial_value = if def_ && def_.progress_model == "hp", do: def_.target_value, else: 0

      Registry.update_instance_state(instance_id, [
        {:status, "active"},
        {:current_value, initial_value},
        {:started_at, now()},
        {:completed_at, nil},
        {:interacting_json, "[]"}
      ])

      broadcast(inst.map_id, {:objective_reset, instance_id})
      :ok
    else
      {:error, :not_found}
    end
  end

  # ── Interaction tracking ────────────────────────────────────────

  @doc "Start interacting with a hold/construct objective."
  def interact_start(instance_id, char_id) do
    inst = Registry.get_instance(instance_id)

    if inst && inst.status in ["active", "in_progress"] do
      interacting = inst.interacting |> Enum.uniq()

      unless char_id in interacting do
        updated = interacting ++ [char_id]
        Registry.update_instance_state(instance_id, [
          {:interacting_json, Jason.encode!(updated)},
          {:status, "in_progress"}
        ])

        broadcast(inst.map_id, {:objective_interact_start, instance_id, char_id})
      end

      :ok
    else
      {:error, :not_active}
    end
  end

  @doc "Stop interacting."
  def interact_cancel(instance_id, char_id) do
    inst = Registry.get_instance(instance_id)

    if inst do
      updated = List.delete(inst.interacting, char_id)

      Registry.update_instance_state(instance_id, [
        {:interacting_json, Jason.encode!(updated)}
      ])

      broadcast(inst.map_id, {:objective_interact_cancel, instance_id, char_id})
      :ok
    else
      {:error, :not_found}
    end
  end

  @doc "Get the list of char_ids currently interacting."
  def interacting_with(instance_id) do
    case Registry.get_instance(instance_id) do
      nil -> []
      inst -> inst.interacting
    end
  end

  # ── Place on map ────────────────────────────────────────────────

  @doc "Create a new objective instance on a map."
  def place(objective_key, map_id, x, y, opts \\ []) do
    def_ = Registry.get_def(objective_key)

    if def_ do
      initial_value = if def_.progress_model == "hp", do: def_.target_value, else: 0

      inst = %{
        id: nil,
        objective_key: objective_key,
        map_id: map_id,
        x: x,
        y: y,
        current_value: initial_value,
        status: "active",
        team_id: opts[:team_id],
        interacting: [],
        settings: opts[:settings] || %{},
        started_at: now(),
        completed_at: nil
      }

      Registry.upsert_instance(inst)
      broadcast(map_id, {:objective_placed, objective_key, x, y})
      :ok
    else
      {:error, :unknown_objective}
    end
  end

  # ── Respawn ─────────────────────────────────────────────────────

  defp schedule_respawn(instance_id, seconds) do
    Process.send_after(self(), {:respawn_objective, instance_id}, seconds * 1000)
  end

  # ── Callbacks ───────────────────────────────────────────────────

  defp fire_callback(nil, _inst, _opts), do: :ok
  defp fire_callback(cb, _inst, _opts) when cb == %{}, do: :ok

  defp fire_callback(cb, inst, opts) do
    # Callbacks support:
    # - "set_world_flag" => flag_name (with optional "value")
    # - "broadcast" => event_name (PubSub broadcast to map topic)
    # - "script_id" => N (runs visual-script graph)
    # - "actions" => [...] (EventRunner action list)
    try do
      if flag = cb["set_world_flag"] do
        value = cb["value"] || "1"

        actual_value =
          if value == "toggle" do
            current = get_world_flag(flag)
            if current in [nil, "0", "false", ""], do: "1", else: "0"
          else
            value
          end

        set_world_flag(flag, actual_value)
      end

      if event = cb["broadcast"] do
        broadcast(inst.map_id, {:objective_event, event, inst.id, inst.objective_key})
      end

      if sid = cb["script_id"] do
        if is_integer(sid) and Code.ensure_loaded?(TePhoenix.Game.ScriptInterpreter) do
          char_id = opts[:char_id]
          TePhoenix.Game.ScriptInterpreter.run(%{"nodes" => [], "connections" => []},
            effects: &TePhoenix.Game.ScriptInterpreter.dry_run_effect/2,
            ctx: %{"objective" => inst.objective_key, "char_id" => char_id})
        end
      end

      if actions = cb["actions"] do
        if is_list(actions) and Code.ensure_loaded?(TePhoenix.EventRunner) do
          char_id = opts[:char_id] || 0
          TePhoenix.EventRunner.execute(actions, char_id)
        end
      end
    rescue
      e -> Logger.error("Objective callback failed: #{inspect(e)}")
    end
  end

  # ── PubSub ──────────────────────────────────────────────────────

  defp broadcast(map_id, message) do
    Phoenix.PubSub.broadcast(
      TePhoenix.PubSub,
      "objectives:map:#{map_id}",
      message
    )
  rescue
    _ -> :ok
  end

  # ── World flags (reuse existing infrastructure) ─────────────────

  defp get_world_flag(flag) do
    case TePhoenix.Repo.query("SELECT value FROM game_world_flags WHERE flag = ?", [flag]) do
      {:ok, %{rows: [[v]]}} -> v
      _ -> nil
    end
  rescue
    _ -> nil
  end

  defp set_world_flag(flag, value) do
    TePhoenix.Repo.query(
      "INSERT INTO game_world_flags (flag, value, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=NOW()",
      [flag, to_string(value)]
    )
  rescue
    _ -> :ok
  end

  defp now, do: NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)
end
