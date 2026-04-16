defmodule TePhoenix.Game.AutoPilot do
  @moduledoc """
  Auto-Pilot Game Director — runs periodic Quick Scans and fires safe,
  low-risk events automatically without GM approval. Fires: weather changes,
  lore broadcasts, atmosphere messages. Does NOT fire: bans, gold, XP, tournaments.

  Enable/disable via system_settings key 'auto_pilot'.
  """

  use GenServer
  require Logger

  alias TePhoenix.Repo
  alias TePhoenix.Game.{GameDirector, PlayerRegistry, AdminAudit}

  @scan_interval_ms 10 * 60 * 1000  # 10 minutes
  @safe_actions ~w(weather broadcast)
  @weather_effects ~w(clear rain storm snow fog)

  # Atmospheric messages that fire randomly when players are online
  @atmosphere_messages [
    "The wind shifts through the standing stones, carrying whispers from the Otherworld...",
    "Dark clouds gather over the moorlands. The crows circle lower.",
    "The blood oghams along the trail pulse faintly — something stirs beyond the veil.",
    "A chill settles over the land. The old gods are watching.",
    "Embers dance from a distant cairn fire. The druids are restless tonight.",
    "The river runs darker than usual. Best not drink from it.",
    "A lone howl echoes across the valley — not wolf, not hound, something older.",
    "The fae lights flicker between the trees. They're closer than they should be."
  ]

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  @impl true
  def init(_) do
    schedule_scan()
    {:ok, %{last_weather: nil, last_atmosphere: nil, actions_fired: 0}}
  end

  # ── Public API ──────────────────────────────────────────────────

  def enabled? do
    case Repo.query("SELECT setting_value FROM system_settings WHERE setting_key='auto_pilot'") do
      {:ok, %{rows: [["1"]]}} -> true
      {:ok, %{rows: [["true"]]}} -> true
      _ -> false
    end
  end

  def enable do
    Repo.query("INSERT INTO system_settings (setting_key, setting_value) VALUES ('auto_pilot', '1') ON DUPLICATE KEY UPDATE setting_value='1'")
    AdminAudit.log("gm_auto_pilot", %{id: 0, name: "System"}, nil, "enabled")
    :ok
  end

  def disable do
    Repo.query("INSERT INTO system_settings (setting_key, setting_value) VALUES ('auto_pilot', '0') ON DUPLICATE KEY UPDATE setting_value='0'")
    AdminAudit.log("gm_auto_pilot", %{id: 0, name: "System"}, nil, "disabled")
    :ok
  end

  def status do
    GenServer.call(__MODULE__, :status)
  end

  # ── GenServer Callbacks ─────────────────────────────────────────

  @impl true
  def handle_info(:scan, state) do
    state = if enabled?() do
      run_scan(state)
    else
      state
    end

    schedule_scan()
    {:noreply, state}
  end

  @impl true
  def handle_call(:status, _from, state) do
    {:reply, Map.merge(state, %{enabled: enabled?()}), state}
  end

  # ── Private ─────────────────────────────────────────────────────

  defp schedule_scan do
    Process.send_after(self(), :scan, @scan_interval_ms)
  end

  defp run_scan(state) do
    players = PlayerRegistry.all()
    online_count = length(players)

    cond do
      # Nobody online — skip
      online_count == 0 ->
        state

      # Few players — send atmosphere or gentle weather
      online_count <= 3 ->
        maybe_atmosphere(state)

      # Active server — run director scan and maybe fire safe action
      true ->
        game_state = GameDirector.gather_state()
        suggestions = GameDirector.fallback_suggestions(game_state)

        # Only fire safe actions
        safe = Enum.filter(suggestions, fn s -> s.action in @safe_actions end)

        case safe do
          [top | _] ->
            fire_safe_action(top, state)
          [] ->
            # No suggestions matched — try atmosphere
            maybe_atmosphere(state)
        end
    end
  end

  defp fire_safe_action(%{action: "weather"} = _suggestion, state) do
    now = System.system_time(:second)
    # Don't change weather more than once per hour
    if state.last_weather && now - state.last_weather < 3600 do
      state
    else
      effect = Enum.random(@weather_effects)
      TePhoenixWeb.Endpoint.broadcast!("social:lobby", "weather_change", %{effect: effect})
      AdminAudit.log("gm_weather", %{id: 0, name: "AutoPilot"}, nil, effect)
      Logger.info("[AutoPilot] Weather changed to #{effect}")
      %{state | last_weather: now, actions_fired: state.actions_fired + 1}
    end
  end

  defp fire_safe_action(%{action: "broadcast", description: desc}, state) do
    now = System.system_time(:second)
    if state.last_atmosphere && now - state.last_atmosphere < 1800 do
      state
    else
      msg = String.slice(desc, 0, 200)
      TePhoenixWeb.Endpoint.broadcast!("social:lobby", "system_broadcast", %{
        message: msg, style: "saga", from: "THE WORLD", timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
      })
      AdminAudit.log("gm_broadcast", %{id: 0, name: "AutoPilot"}, nil, %{message: msg})
      Logger.info("[AutoPilot] Broadcast: #{String.slice(msg, 0, 60)}")
      %{state | last_atmosphere: now, actions_fired: state.actions_fired + 1}
    end
  end

  defp fire_safe_action(_, state), do: state

  defp maybe_atmosphere(state) do
    now = System.system_time(:second)
    # Max once per 30 min
    if state.last_atmosphere && now - state.last_atmosphere < 1800 do
      state
    else
      # 30% chance to fire atmosphere on each scan when players are online
      if :rand.uniform(100) <= 30 do
        msg = Enum.random(@atmosphere_messages)
        TePhoenixWeb.Endpoint.broadcast!("social:lobby", "system_broadcast", %{
          message: msg, style: "saga", from: "THE WORLD", timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
        })
        Logger.info("[AutoPilot] Atmosphere: #{String.slice(msg, 0, 60)}")
        %{state | last_atmosphere: now, actions_fired: state.actions_fired + 1}
      else
        state
      end
    end
  end
end
