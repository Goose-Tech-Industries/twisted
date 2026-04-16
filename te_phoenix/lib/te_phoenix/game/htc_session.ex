defmodule TePhoenix.Game.HTCSession do
  @moduledoc """
  Hyperbolic Time Chamber — Training Session Manager

  Tracks players inside the HTC with:
  - Real-time entry/exit with max duration enforcement
  - Time dilation (configurable, default 1 real hour = 12 in-game hours)
  - Periodic training ticks that apply stat gains
  - Auto-ejection when time limit expires
  - Gravity multiplier for enhanced training

  Each HTC map has its own configuration stored in the map's
  `state_json` field (or system defaults).
  """
  use GenServer
  alias TePhoenix.Repo

  @tick_interval_ms 60_000        # Training tick every 60 seconds
  @default_max_hours 4            # Max real hours inside
  @default_time_dilation 12       # 1 real hour = 12 in-game hours
  @default_gravity_mult 10.0      # 10x gravity (affects training gains)
  @default_training_interval 300  # Seconds between auto-training ticks (5 min)

  # ── State ──────────────────────────────────────────────────────

  defstruct sessions: %{},   # char_id => session_data
            configs: %{}      # map_id => htc_config

  # ── Public API ─────────────────────────────────────────────────

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, %__MODULE__{}, name: __MODULE__)
  end

  @doc "Enter the HTC. Returns {:ok, session} or {:error, reason}"
  def enter(char_id, map_id) do
    GenServer.call(__MODULE__, {:enter, char_id, map_id})
  end

  @doc "Leave the HTC. Returns {:ok, summary} with training summary"
  def leave(char_id) do
    GenServer.call(__MODULE__, {:leave, char_id})
  end

  @doc "Get session info for a character (nil if not inside)"
  def get_session(char_id) do
    GenServer.call(__MODULE__, {:get_session, char_id})
  end

  @doc "Perform an active training action (manual, on top of passive ticks)"
  def active_train(char_id, training_type) do
    GenServer.call(__MODULE__, {:active_train, char_id, training_type})
  end

  @doc "Check if a character is inside any HTC"
  def inside?(char_id) do
    GenServer.call(__MODULE__, {:inside?, char_id})
  end

  @doc "Get time remaining (seconds) for a character"
  def time_remaining(char_id) do
    GenServer.call(__MODULE__, {:time_remaining, char_id})
  end

  # ── GenServer Callbacks ────────────────────────────────────────

  @impl true
  def init(state) do
    # Start the training tick timer
    Process.send_after(self(), :tick, @tick_interval_ms)
    {:ok, state}
  end

  @impl true
  def handle_call({:enter, char_id, map_id}, _from, state) do
    if Map.has_key?(state.sessions, char_id) do
      {:reply, {:error, "Already inside a Hyperbolic Time Chamber."}, state}
    else
      config = get_htc_config(state, map_id)
      max_seconds = (config[:max_hours] || @default_max_hours) * 3600

      session = %{
        char_id: char_id,
        map_id: map_id,
        entered_at: System.system_time(:second),
        max_seconds: max_seconds,
        time_dilation: config[:time_dilation] || @default_time_dilation,
        gravity_mult: config[:gravity_mult] || @default_gravity_mult,
        training_interval: config[:training_interval] || @default_training_interval,
        last_train_tick: System.system_time(:second),
        total_ticks: 0,
        total_gains: %{},
      }

      new_state = %{state | sessions: Map.put(state.sessions, char_id, session)}
      {:reply, {:ok, session}, new_state}
    end
  end

  @impl true
  def handle_call({:leave, char_id}, _from, state) do
    case Map.pop(state.sessions, char_id) do
      {nil, _} ->
        {:reply, {:error, "Not inside a Hyperbolic Time Chamber."}, state}

      {session, remaining} ->
        elapsed = System.system_time(:second) - session.entered_at
        in_game_hours = elapsed / 3600 * session.time_dilation

        summary = %{
          real_seconds: elapsed,
          in_game_hours: Float.round(in_game_hours, 1),
          training_ticks: session.total_ticks,
          total_gains: session.total_gains,
          gravity_mult: session.gravity_mult,
        }

        new_state = %{state | sessions: remaining}
        {:reply, {:ok, summary}, new_state}
    end
  end

  @impl true
  def handle_call({:get_session, char_id}, _from, state) do
    session = Map.get(state.sessions, char_id)
    if session do
      elapsed = System.system_time(:second) - session.entered_at
      remaining = max(0, session.max_seconds - elapsed)
      in_game_hours = elapsed / 3600 * session.time_dilation

      info = Map.merge(session, %{
        elapsed_seconds: elapsed,
        remaining_seconds: remaining,
        in_game_hours: Float.round(in_game_hours, 1),
      })
      {:reply, info, state}
    else
      {:reply, nil, state}
    end
  end

  @impl true
  def handle_call({:active_train, char_id, training_type}, _from, state) do
    case Map.get(state.sessions, char_id) do
      nil ->
        {:reply, {:error, "Not inside a Hyperbolic Time Chamber."}, state}

      session ->
        # Apply training with gravity multiplier bonus
        gains = apply_htc_training(char_id, training_type, session.gravity_mult)

        updated_session = %{session |
          total_ticks: session.total_ticks + 1,
          total_gains: merge_gains(session.total_gains, gains),
        }

        new_state = %{state | sessions: Map.put(state.sessions, char_id, updated_session)}
        {:reply, {:ok, gains}, new_state}
    end
  end

  @impl true
  def handle_call({:inside?, char_id}, _from, state) do
    {:reply, Map.has_key?(state.sessions, char_id), state}
  end

  @impl true
  def handle_call({:time_remaining, char_id}, _from, state) do
    case Map.get(state.sessions, char_id) do
      nil -> {:reply, 0, state}
      session ->
        elapsed = System.system_time(:second) - session.entered_at
        {:reply, max(0, session.max_seconds - elapsed), state}
    end
  end

  # ── Tick: periodic training + expiration check ─────────────────

  @impl true
  def handle_info(:tick, state) do
    now = System.system_time(:second)
    new_sessions = state.sessions
    |> Enum.reduce(%{}, fn {char_id, session}, acc ->
      elapsed = now - session.entered_at

      # Check expiration
      if elapsed >= session.max_seconds do
        # Time's up — eject player
        eject_player(char_id, session)
        acc
      else
        # Check if training tick is due
        since_last = now - session.last_train_tick
        if since_last >= session.training_interval do
          # Apply passive training tick
          gains = apply_htc_passive_training(char_id, session.gravity_mult, session.time_dilation)

          updated = %{session |
            last_train_tick: now,
            total_ticks: session.total_ticks + 1,
            total_gains: merge_gains(session.total_gains, gains),
          }

          # Notify client
          TePhoenixWeb.Endpoint.broadcast!(
            "user:#{char_id}",
            "htc_training_tick",
            %{gains: gains, ticks: updated.total_ticks, remaining: session.max_seconds - elapsed}
          )

          Map.put(acc, char_id, updated)
        else
          Map.put(acc, char_id, session)
        end
      end
    end)

    Process.send_after(self(), :tick, @tick_interval_ms)
    {:noreply, %{state | sessions: new_sessions}}
  end

  # ── Private helpers ────────────────────────────────────────────

  defp get_htc_config(state, map_id) do
    case Map.get(state.configs, map_id) do
      nil ->
        # Load from DB (map's state_json or defaults)
        config = try do
          case Repo.query("SELECT zone_type FROM game_maps WHERE id=?", [map_id]) do
            {:ok, %{rows: [[_zone_type]]}} ->
              %{
                max_hours: @default_max_hours,
                time_dilation: @default_time_dilation,
                gravity_mult: @default_gravity_mult,
                training_interval: @default_training_interval,
              }
            _ -> %{}
          end
        rescue
          _ -> %{}
        end
        config

      config -> config
    end
  end

  defp apply_htc_training(char_id, training_type, gravity_mult) do
    # Load training config
    try do
      case Repo.query("SELECT stat_gains, stat_costs FROM game_training_config WHERE name=? AND active=1", [training_type]) do
        {:ok, %{rows: [[gains_json, costs_json]]}} ->
          gains = Jason.decode!(gains_json || "{}")
          costs = Jason.decode!(costs_json || "{}")

          # Gravity multiplier boosts gains
          boosted_gains = gains
          |> Enum.map(fn {stat, val} -> {stat, val * gravity_mult} end)
          |> Map.new()

          apply_stat_changes(char_id, boosted_gains, costs)
          boosted_gains

        _ ->
          # Fallback: default self-training gains with gravity boost
          default_gains = %{
            "atk" => 0.003 * gravity_mult,
            "def" => 0.003 * gravity_mult,
            "speed" => 0.002 * gravity_mult,
            "max_hp" => 0.005 * gravity_mult,
          }
          apply_stat_changes(char_id, default_gains, %{"current_hp" => 0.01})
          default_gains
      end
    rescue
      _ ->
        %{"atk" => 0.003 * gravity_mult, "def" => 0.003 * gravity_mult}
    end
  end

  defp apply_htc_passive_training(char_id, gravity_mult, time_dilation) do
    # Passive gains are smaller but constant, scaled by gravity and time dilation
    multiplier = gravity_mult * (time_dilation / 12.0) * 0.5
    gains = %{
      "atk" => 0.001 * multiplier,
      "def" => 0.001 * multiplier,
      "speed" => 0.001 * multiplier,
      "max_hp" => 0.002 * multiplier,
      "max_mp" => 0.001 * multiplier,
    }

    apply_stat_changes(char_id, gains, %{})
    gains
  end

  defp apply_stat_changes(char_id, gains, costs) do
    try do
      # Load current stats
      case Repo.query(
        "SELECT atk, def, mo, md, speed, luck, max_hp, max_mp, current_hp, current_mp FROM characters WHERE id=?",
        [char_id]
      ) do
        {:ok, %{rows: [[atk, def_, mo, md, spd, luck, mhp, mmp, chp, cmp]]}} ->
          base = %{"atk" => atk, "def" => def_, "mo" => mo, "md" => md,
                   "speed" => spd, "luck" => luck, "max_hp" => mhp, "max_mp" => mmp,
                   "current_hp" => chp, "current_mp" => cmp}

          # Apply gains (percentage of base stat)
          updates = Enum.reduce(gains, [], fn {stat, pct}, acc ->
            if base_val = base[stat] do
              gain = max(1, trunc(base_val * pct))
              [{stat, gain} | acc]
            else
              acc
            end
          end)

          # Apply costs
          cost_updates = Enum.reduce(costs, [], fn {stat, pct}, acc ->
            if base_val = base[stat] do
              cost = max(1, trunc(base_val * pct))
              [{stat, -cost} | acc]
            else
              acc
            end
          end)

          all_updates = updates ++ cost_updates
          if all_updates != [] do
            set_clauses = Enum.map(all_updates, fn {stat, delta} ->
              if delta > 0 do
                "#{stat} = #{stat} + #{delta}"
              else
                "#{stat} = GREATEST(1, #{stat} + #{delta})"
              end
            end) |> Enum.join(", ")

            Repo.query!("UPDATE characters SET #{set_clauses} WHERE id=?", [char_id])
          end

        _ -> nil
      end
    rescue
      _ -> nil
    end
  end

  defp eject_player(char_id, session) do
    elapsed = System.system_time(:second) - session.entered_at
    in_game_hours = elapsed / 3600 * session.time_dilation

    summary = %{
      real_seconds: elapsed,
      in_game_hours: Float.round(in_game_hours, 1),
      training_ticks: session.total_ticks,
      total_gains: session.total_gains,
      gravity_mult: session.gravity_mult,
    }

    # Notify the client they've been ejected
    TePhoenixWeb.Endpoint.broadcast!(
      "user:#{char_id}",
      "htc_ejected",
      %{reason: "Time limit reached.", summary: summary}
    )

    # Teleport player back to their respawn point
    try do
      case Repo.query("SELECT respawn_map_id, respawn_x, respawn_y FROM characters WHERE id=?", [char_id]) do
        {:ok, %{rows: [[rmap, rx, ry]]}} when not is_nil(rmap) ->
          Repo.query!("UPDATE characters SET map_id=?, x=?, y=? WHERE id=?", [rmap, rx || 10, ry || 10, char_id])
          TePhoenix.Game.PlayerRegistry.update(char_id, %{map_id: rmap, x: rx || 10, y: ry || 10})
        _ -> nil
      end
    rescue
      _ -> nil
    end
  end

  defp merge_gains(total, new) do
    Enum.reduce(new, total, fn {stat, val}, acc ->
      Map.update(acc, stat, val, &(&1 + val))
    end)
  end
end
