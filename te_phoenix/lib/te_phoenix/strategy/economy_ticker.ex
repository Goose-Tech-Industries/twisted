defmodule TePhoenix.Strategy.EconomyTicker do
  @moduledoc """
  Periodic economy tick for strategy games. Runs production, upkeep,
  and desertion for every player with buildings. Configurable interval
  (default: every 60 seconds = 1 game-hour per minute).
  """

  use GenServer
  require Logger

  alias TePhoenix.Strategy.Economy

  @default_tick_ms 60_000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def tick_now, do: GenServer.cast(__MODULE__, :tick)

  @impl true
  def init(opts) do
    interval = Keyword.get(opts, :interval_ms, @default_tick_ms)
    Economy.ensure_tables()
    seed_defaults()
    schedule_tick(interval)
    {:ok, %{interval: interval}}
  end

  @impl true
  def handle_info(:tick, state) do
    if TePhoenix.Capabilities.enabled?(:strategy_economy) do
      do_tick()
    end

    schedule_tick(state.interval)
    {:noreply, state}
  end

  def handle_info(_, state), do: {:noreply, state}

  @impl true
  def handle_cast(:tick, state) do
    do_tick()
    {:noreply, state}
  end

  defp schedule_tick(interval), do: Process.send_after(self(), :tick, interval)

  defp do_tick do
    case TePhoenix.Repo.query("SELECT DISTINCT char_id FROM game_player_buildings") do
      {:ok, %{rows: rows}} ->
        for [char_id] <- rows do
          try do
            Economy.tick(char_id)
          rescue
            e -> Logger.error("Economy tick failed for char #{char_id}: #{inspect(e)}")
          end
        end

      _ -> :ok
    end
  rescue
    _ -> :ok
  end

  defp seed_defaults do
    seed_buildings()
    seed_units()
  rescue
    _ -> :ok
  end

  defp seed_buildings do
    case TePhoenix.Repo.query("SELECT COUNT(*) FROM game_strategy_buildings") do
      {:ok, %{rows: [[0]]}} ->
        for b <- default_buildings() do
          TePhoenix.Repo.query(
            "INSERT INTO game_strategy_buildings (`key`, name, icon, description, base_yield_json, cost_base_json, cost_mult_per_level, build_time_base_seconds, build_time_mult, max_level, enabled, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,NOW())",
            [b.key, b.name, b.icon, b.desc, Jason.encode!(b.yield), Jason.encode!(b.cost), b.cost_mult, b.build_time, b.bt_mult, b.max_level]
          )
        end
      _ -> :ok
    end
  rescue
    _ -> :ok
  end

  defp seed_units do
    case TePhoenix.Repo.query("SELECT COUNT(*) FROM game_strategy_units") do
      {:ok, %{rows: [[0]]}} ->
        for u <- default_units() do
          TePhoenix.Repo.query(
            "INSERT INTO game_strategy_units (`key`, name, icon, attack, defense, hp, speed, food_upkeep, train_cost_json, train_time_seconds, enabled, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,NOW())",
            [u.key, u.name, u.icon, u.atk, u.def, u.hp, u.spd, u.food, Jason.encode!(u.cost), u.time]
          )
        end
      _ -> :ok
    end
  rescue
    _ -> :ok
  end

  defp default_buildings do
    [
      %{key: "farm", name: "Farm", icon: "🌾", desc: "Produces food per level.", yield: %{"food" => 10}, cost: %{"gold" => 50}, cost_mult: 1.4, build_time: 30, bt_mult: 1.2, max_level: 20},
      %{key: "gold_mine", name: "Gold Mine", icon: "💰", desc: "Produces gold per level.", yield: %{"gold" => 8}, cost: %{"food" => 30, "wood" => 20}, cost_mult: 1.5, build_time: 45, bt_mult: 1.3, max_level: 20},
      %{key: "lumber_mill", name: "Lumber Mill", icon: "🪵", desc: "Produces wood per level.", yield: %{"wood" => 6}, cost: %{"gold" => 40}, cost_mult: 1.4, build_time: 40, bt_mult: 1.25, max_level: 20},
      %{key: "quarry", name: "Quarry", icon: "🪨", desc: "Produces stone per level.", yield: %{"stone" => 5}, cost: %{"gold" => 60, "wood" => 30}, cost_mult: 1.5, build_time: 60, bt_mult: 1.3, max_level: 15},
      %{key: "barracks", name: "Barracks", icon: "🏛️", desc: "Unlocks + speeds up troop training. No direct yield.", yield: %{}, cost: %{"gold" => 100, "stone" => 50}, cost_mult: 1.6, build_time: 90, bt_mult: 1.4, max_level: 10},
      %{key: "wall", name: "Wall", icon: "🧱", desc: "Increases defense bonus per level. No yield.", yield: %{}, cost: %{"stone" => 80, "wood" => 40}, cost_mult: 1.5, build_time: 120, bt_mult: 1.5, max_level: 15}
    ]
  end

  defp default_units do
    [
      %{key: "militia", name: "Militia", icon: "🗡️", atk: 8, def: 4, hp: 80, spd: 10, food: 1, cost: %{"gold" => 20}, time: 15},
      %{key: "soldier", name: "Soldier", icon: "⚔️", atk: 15, def: 10, hp: 120, spd: 8, food: 2, cost: %{"gold" => 50, "iron" => 10}, time: 30},
      %{key: "archer", name: "Archer", icon: "🏹", atk: 18, def: 5, hp: 80, spd: 12, food: 1, cost: %{"gold" => 40, "wood" => 15}, time: 25},
      %{key: "cavalry", name: "Cavalry", icon: "🐴", atk: 25, def: 12, hp: 150, spd: 20, food: 4, cost: %{"gold" => 100, "food" => 30}, time: 60},
      %{key: "catapult", name: "Catapult", icon: "💣", atk: 50, def: 3, hp: 200, spd: 3, food: 3, cost: %{"gold" => 200, "wood" => 100, "stone" => 50}, time: 120},
      %{key: "spy", name: "Spy", icon: "🕵️", atk: 5, def: 2, hp: 40, spd: 25, food: 1, cost: %{"gold" => 75}, time: 45}
    ]
  end
end
