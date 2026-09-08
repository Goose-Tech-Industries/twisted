defmodule TePhoenix.World.AutonomousSociety do
  @moduledoc """
  The Autonomous Living Society Engine ("Westworld Engine").

  NPCs live self-directed, emergent lives whether players are present or not:
    * Economic: Merchants adjust inventories, travelers purchase supplies, bounty hunters seek targets.
    * Social: NPCs exchange news, deepen friendships, harbor grudges, and resolve conflicts.
    * Factions: Border skirmishes between Iron Vanguard, Moonveil Coven, and Ashfall Cult.
  """

  use GenServer
  require Logger
  alias TePhoenix.Repo

  @tick_interval_ms 30_000
  @max_recent_events 50

  @default_territories %{
    1 => %{map_id: 1, dominant: "Iron Vanguard", influence: 70, contested_by: "Ashveil Syndicate", contested_influence: 30},
    2 => %{map_id: 2, dominant: "Ashveil Syndicate", influence: 65, contested_by: "Vermilion Cult", contested_influence: 35},
    3 => %{map_id: 3, dominant: "Silver Dawn", influence: 80, contested_by: "Iron Vanguard", contested_influence: 20}
  }

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    # Schedule recurring simulation pulse
    if Application.get_env(:te_phoenix, :autonomous_society_enabled, true) do
      Process.send_after(self(), :pulse, 5_000)
    end

    {:ok, %{events: [], tick_count: 0, territories: @default_territories}}
  end

  @doc "Triggers an immediate autonomous simulation step on demand."
  def tick do
    GenServer.call(__MODULE__, :tick)
  end

  @doc "Retrieves recent emergent society events."
  def recent_events do
    GenServer.call(__MODULE__, :get_events)
  end

  @doc "Retrieves the current territorial hegemony matrix across all maps."
  def territory_matrix do
    GenServer.call(__MODULE__, :get_territories)
  end

  @doc "Retrieves territory control data for a specific map."
  def territory_for_map(map_id) do
    GenServer.call(__MODULE__, {:get_territory, map_id})
  end

  @doc "Manually or scriptedly shifts territorial influence on a map."
  def shift_influence(map_id, faction, delta) do
    GenServer.call(__MODULE__, {:shift_influence, map_id, faction, delta})
  end

  @impl true
  def handle_call(:tick, _from, state) do
    {new_event, new_state} = run_simulation_step(state)
    {:reply, {:ok, new_event}, new_state}
  end

  @impl true
  def handle_call(:get_events, _from, state) do
    {:reply, state.events, state}
  end

  @impl true
  def handle_call(:get_territories, _from, state) do
    {:reply, state.territories, state}
  end

  @impl true
  def handle_call({:get_territory, map_id}, _from, state) do
    entry = Map.get(state.territories, map_id) || Map.get(state.territories, to_string(map_id)) || %{
      map_id: map_id,
      dominant: "Unaligned",
      influence: 50,
      contested_by: "Wilderness",
      contested_influence: 50
    }
    {:reply, entry, state}
  end

  @impl true
  def handle_call({:shift_influence, map_id, faction, delta}, _from, state) do
    {entry, updated_territories} = apply_influence_shift(state.territories, map_id, faction, delta)
    {:reply, {:ok, entry}, %{state | territories: updated_territories}}
  end

  @impl true
  def handle_info(:pulse, state) do
    {_event, new_state} = run_simulation_step(state)
    Process.send_after(self(), :pulse, @tick_interval_ms)
    {:noreply, new_state}
  end

  # ── Simulation Step Core ──────────────────────────────────────────

  defp run_simulation_step(state) do
    # Fetch active NPCs from database
    case Repo.query("SELECT id, name, role, faction, map_id FROM game_npcs WHERE is_active=1 LIMIT 20") do
      {:ok, %{rows: rows}} when length(rows) >= 2 ->
        npc_a = Enum.random(rows)
        npc_b = Enum.random(rows -- [npc_a])

        event = generate_interaction(npc_a, npc_b)
        [_id_a, _name_a, _role_a, fac_a, map_a] = npc_a

        # Shift faction influence if action is conflict or trade
        {_entry, updated_territories} =
          if event.category in [:skirmish, :commerce] and fac_a != nil and map_a != nil do
            delta = if event.category == :skirmish, do: -6, else: 4
            apply_influence_shift(state.territories, map_a, fac_a, delta)
          else
            {nil, state.territories}
          end

        # Broadcast highlight across realm
        try do
          TePhoenixWeb.Endpoint.broadcast("game:events", "society_news", %{
            event: event.text,
            category: event.category,
            timestamp: event.timestamp
          })
        rescue
          _ -> :ok
        end

        updated_events = Enum.take([event | state.events], @max_recent_events)
        {event, %{state | events: updated_events, tick_count: state.tick_count + 1, territories: updated_territories}}

      _ ->
        default_event = %{
          id: "soc_#{System.system_time(:millisecond)}",
          text: "Wandering caravans traversed the outer borders without incident.",
          category: :travel,
          timestamp: System.system_time(:second)
        }

        updated_events = Enum.take([default_event | state.events], @max_recent_events)
        {default_event, %{state | events: updated_events, tick_count: state.tick_count + 1}}
    end
  end

  defp apply_influence_shift(territories, map_id, faction, delta) do
    current =
      Map.get(territories, map_id) || %{
        map_id: map_id,
        dominant: faction || "Iron Vanguard",
        influence: 60,
        contested_by: "Wilderness",
        contested_influence: 40
      }

    {dominant, influence, contested, contested_inf} =
      if current.dominant == faction do
        new_inf = max(0, min(100, current.influence + delta))
        if new_inf < 50 do
          {current.contested_by, 100 - new_inf, current.dominant, new_inf}
        else
          {current.dominant, new_inf, current.contested_by, 100 - new_inf}
        end
      else
        new_contested_inf = max(0, min(100, current.contested_influence + delta))
        if new_contested_inf > 50 do
          {faction, new_contested_inf, current.dominant, 100 - new_contested_inf}
        else
          {current.dominant, 100 - new_contested_inf, faction, new_contested_inf}
        end
      end

    hegemony_shifted? = dominant != current.dominant

    updated = %{
      current |
      dominant: dominant,
      influence: influence,
      contested_by: contested,
      contested_influence: contested_inf
    }

    if hegemony_shifted? do
      try do
        TePhoenixWeb.Endpoint.broadcast("game:events", "hegemony_shift", %{
          map_id: map_id,
          dominant: dominant,
          previous: current.dominant,
          influence: influence,
          text: "🚩 Hegemony Shift: #{dominant} has seized control of Map ##{map_id} from #{current.dominant}!"
        })

        TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "territory_update", %{
          map_id: map_id,
          dominant: dominant,
          influence: influence
        })
      rescue
        _ -> :ok
      end
    end

    {updated, Map.put(territories, map_id, updated)}
  end

  defp generate_interaction([id_a, name_a, role_a, fac_a, map_a], [_id_b, name_b, role_b, fac_b, _map_b]) do
    categories = [:commerce, :diplomacy, :skirmish, :lore]
    cat = Enum.random(categories)

    text =
      case cat do
        :commerce ->
          "#{name_a} (#{role_a}) brokered a shipment of raw medicinal herbs with #{name_b} on Map ##{map_a}."

        :diplomacy ->
          "#{name_a} and #{name_b} shared a flagon in the square, exchanging whispered warnings about rising unrest in #{fac_b || "the outer rim"}."

        :skirmish ->
          "Tensions erupted between #{fac_a || "an outsider"} and #{fac_b || "the local garrison"}: #{name_a} drew steel against #{name_b} before guards intervened."

        :lore ->
          "#{name_a} was spotted reading ancient sigils near the boundary stones, muttering about dreams of the First Flame."
      end

    %{
      id: "soc_#{System.system_time(:millisecond)}",
      npc_a_id: id_a,
      text: text,
      category: cat,
      timestamp: System.system_time(:second)
    }
  end
end
