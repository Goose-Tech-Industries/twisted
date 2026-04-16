defmodule TePhoenix.Strategy.Economy do
  @moduledoc """
  Passive tick-based economy for strategy games (MSWar, OGame, Tribal
  Wars, idle/incremental games, 4X).

  Every player (or team) has:
    * **Buildings** with levels — each level increases production rate
    * **Resource pools** — gold, food, wood, stone, iron, etc.
    * **Army units** — counted troops that consume food per tick
    * **Upkeep** — if food runs out, troops desert

  The `EconomyTicker` runs every N seconds (configurable per ruleset)
  and does one pass:

    1. Calculate production from all buildings
    2. Calculate upkeep from all army units
    3. Net = production - upkeep
    4. Update resource pools
    5. If food < 0, desert troops until upkeep balanced
    6. Broadcast changes to connected clients

  ## Tables (auto-created)

    * `game_strategy_buildings` — building definitions (types, base yield, cost formula)
    * `game_player_buildings` — per-player building instances with levels
    * `game_strategy_units` — unit definitions (attack, defense, food cost, training time)
    * `game_player_armies` — per-player unit counts
    * `game_player_resources` — per-player resource pools (extends team pools for solo play)

  Everything is data-driven and editable from AdminSauce.
  """

  require Logger
  alias TePhoenix.Repo

  @buildings_table "game_strategy_buildings"
  @player_buildings_table "game_player_buildings"
  @units_table "game_strategy_units"
  @player_armies_table "game_player_armies"
  @player_resources_table "game_player_resources"

  # ── Setup ───────────────────────────────────────────────────────

  def ensure_tables do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@buildings_table} (
      `key` VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      icon VARCHAR(16) DEFAULT '🏠',
      description TEXT,
      base_yield_json LONGTEXT,
      cost_base_json LONGTEXT,
      cost_mult_per_level FLOAT DEFAULT 1.5,
      build_time_base_seconds INT DEFAULT 60,
      build_time_mult FLOAT DEFAULT 1.3,
      max_level INT DEFAULT 20,
      requires_json LONGTEXT,
      enabled TINYINT(1) DEFAULT 1,
      updated_at DATETIME NOT NULL
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@player_buildings_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      char_id INT NOT NULL,
      building_key VARCHAR(80) NOT NULL,
      level INT DEFAULT 1,
      upgrading TINYINT(1) DEFAULT 0,
      upgrade_finish_at DATETIME,
      UNIQUE KEY uk_char_building (char_id, building_key)
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@units_table} (
      `key` VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      icon VARCHAR(16) DEFAULT '⚔️',
      description TEXT,
      attack INT DEFAULT 10,
      defense INT DEFAULT 5,
      hp INT DEFAULT 100,
      speed INT DEFAULT 10,
      food_upkeep INT DEFAULT 1,
      train_cost_json LONGTEXT,
      train_time_seconds INT DEFAULT 30,
      requires_json LONGTEXT,
      enabled TINYINT(1) DEFAULT 1,
      updated_at DATETIME NOT NULL
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@player_armies_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      char_id INT NOT NULL,
      unit_key VARCHAR(80) NOT NULL,
      count INT DEFAULT 0,
      training INT DEFAULT 0,
      training_finish_at DATETIME,
      UNIQUE KEY uk_char_unit (char_id, unit_key)
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@player_resources_table} (
      char_id INT NOT NULL,
      resource_type VARCHAR(32) NOT NULL,
      amount BIGINT DEFAULT 0,
      last_tick_at DATETIME,
      PRIMARY KEY (char_id, resource_type)
    )
    """)
  rescue
    e -> Logger.error("Strategy.Economy ensure_tables: #{inspect(e)}")
  end

  # ── Resource pools ──────────────────────────────────────────────

  def get_resources(char_id) do
    case Repo.query("SELECT resource_type, amount FROM #{@player_resources_table} WHERE char_id = ?", [char_id]) do
      {:ok, %{rows: rows}} -> Map.new(rows, fn [t, a] -> {t, a || 0} end)
      _ -> %{}
    end
  rescue
    _ -> %{}
  end

  def get_resource(char_id, type) do
    case Repo.query("SELECT amount FROM #{@player_resources_table} WHERE char_id = ? AND resource_type = ?", [char_id, type]) do
      {:ok, %{rows: [[a]]}} -> a || 0
      _ -> 0
    end
  rescue
    _ -> 0
  end

  def add_resource(char_id, type, amount) do
    Repo.query(
      "INSERT INTO #{@player_resources_table} (char_id, resource_type, amount, last_tick_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount), last_tick_at = NOW()",
      [char_id, type, max(0, amount)]
    )
  end

  def spend_resource(char_id, type, amount) do
    current = get_resource(char_id, type)
    if current >= amount do
      Repo.query("UPDATE #{@player_resources_table} SET amount = amount - ? WHERE char_id = ? AND resource_type = ?", [amount, char_id, type])
      {:ok, current - amount}
    else
      {:error, :insufficient}
    end
  end

  # ── Buildings ───────────────────────────────────────────────────

  def get_buildings(char_id) do
    case Repo.query("SELECT building_key, level, upgrading, upgrade_finish_at FROM #{@player_buildings_table} WHERE char_id = ?", [char_id]) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [key, lvl, upg, fin] ->
          %{key: key, level: lvl || 1, upgrading: upg == 1, upgrade_finish_at: fin}
        end)
      _ -> []
    end
  rescue
    _ -> []
  end

  def get_building_def(key) do
    case Repo.query("SELECT `key`, name, icon, description, base_yield_json, cost_base_json, cost_mult_per_level, build_time_base_seconds, build_time_mult, max_level, requires_json FROM #{@buildings_table} WHERE `key` = ? AND enabled = 1", [key]) do
      {:ok, %{rows: [row]}} -> parse_building_def(row)
      _ -> nil
    end
  rescue
    _ -> nil
  end

  def list_building_defs do
    case Repo.query("SELECT `key`, name, icon, description, base_yield_json, cost_base_json, cost_mult_per_level, build_time_base_seconds, build_time_mult, max_level, requires_json FROM #{@buildings_table} WHERE enabled = 1 ORDER BY `key`") do
      {:ok, %{rows: rows}} -> Enum.map(rows, &parse_building_def/1)
      _ -> []
    end
  rescue
    _ -> []
  end

  def build_or_upgrade(char_id, building_key) do
    bdef = get_building_def(building_key)
    if is_nil(bdef), do: {:error, :unknown_building}

    current = Enum.find(get_buildings(char_id), &(&1.key == building_key))
    current_level = (current && current.level) || 0

    if current_level >= (bdef && bdef.max_level || 20) do
      {:error, :max_level}
    else
      next_level = current_level + 1
      costs = calculate_costs(bdef, next_level)
      build_time = calculate_build_time(bdef, next_level)

      resources = get_resources(char_id)
      can_afford = Enum.all?(costs, fn {r, c} -> Map.get(resources, r, 0) >= c end)

      if not can_afford do
        {:error, :insufficient_resources}
      else
        Enum.each(costs, fn {r, c} -> spend_resource(char_id, r, c) end)

        finish_at = NaiveDateTime.add(NaiveDateTime.utc_now(), build_time)

        Repo.query(
          "INSERT INTO #{@player_buildings_table} (char_id, building_key, level, upgrading, upgrade_finish_at) VALUES (?, ?, ?, 1, ?) ON DUPLICATE KEY UPDATE level = VALUES(level), upgrading = 1, upgrade_finish_at = VALUES(upgrade_finish_at)",
          [char_id, building_key, next_level, finish_at]
        )

        {:ok, %{building: building_key, level: next_level, finish_at: finish_at, costs: costs}}
      end
    end
  end

  # ── Units / Army ────────────────────────────────────────────────

  def get_army(char_id) do
    case Repo.query("SELECT unit_key, count, training, training_finish_at FROM #{@player_armies_table} WHERE char_id = ?", [char_id]) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [key, cnt, tr, fin] ->
          %{key: key, count: cnt || 0, training: tr || 0, training_finish_at: fin}
        end)
      _ -> []
    end
  rescue
    _ -> []
  end

  def get_unit_def(key) do
    case Repo.query("SELECT `key`, name, icon, attack, defense, hp, speed, food_upkeep, train_cost_json, train_time_seconds, requires_json FROM #{@units_table} WHERE `key` = ? AND enabled = 1", [key]) do
      {:ok, %{rows: [row]}} -> parse_unit_def(row)
      _ -> nil
    end
  rescue
    _ -> nil
  end

  def list_unit_defs do
    case Repo.query("SELECT `key`, name, icon, attack, defense, hp, speed, food_upkeep, train_cost_json, train_time_seconds, requires_json FROM #{@units_table} WHERE enabled = 1 ORDER BY `key`") do
      {:ok, %{rows: rows}} -> Enum.map(rows, &parse_unit_def/1)
      _ -> []
    end
  rescue
    _ -> []
  end

  def train_units(char_id, unit_key, count) when count > 0 do
    udef = get_unit_def(unit_key)
    if is_nil(udef), do: {:error, :unknown_unit}

    costs = Map.new(udef.train_cost, fn {r, c} -> {r, c * count} end)
    resources = get_resources(char_id)
    can_afford = Enum.all?(costs, fn {r, c} -> Map.get(resources, r, 0) >= c end)

    if not can_afford do
      {:error, :insufficient_resources}
    else
      Enum.each(costs, fn {r, c} -> spend_resource(char_id, r, c) end)

      finish_at = NaiveDateTime.add(NaiveDateTime.utc_now(), udef.train_time * count)

      Repo.query(
        "INSERT INTO #{@player_armies_table} (char_id, unit_key, count, training, training_finish_at) VALUES (?, ?, 0, ?, ?) ON DUPLICATE KEY UPDATE training = training + VALUES(training), training_finish_at = VALUES(training_finish_at)",
        [char_id, unit_key, count, finish_at]
      )

      {:ok, %{unit: unit_key, count: count, finish_at: finish_at}}
    end
  end

  # ── Economy tick ────────────────────────────────────────────────

  @doc """
  Run one economy tick for a player. Call from EconomyTicker.

  1. Check building upgrades → complete finished ones
  2. Check training queues → add finished troops
  3. Calculate production from all buildings
  4. Calculate food upkeep from all troops
  5. Apply net resources
  6. If food < 0, desert troops
  """
  def tick(char_id) do
    complete_upgrades(char_id)
    complete_training(char_id)

    buildings = get_buildings(char_id)
    building_defs = Map.new(list_building_defs(), &{&1.key, &1})

    # Production
    production =
      Enum.reduce(buildings, %{}, fn b, acc ->
        bdef = Map.get(building_defs, b.key)

        if bdef && not b.upgrading do
          yields = calculate_yield(bdef, b.level)
          Enum.reduce(yields, acc, fn {r, y}, a -> Map.update(a, r, y, &(&1 + y)) end)
        else
          acc
        end
      end)

    # Upkeep
    army = get_army(char_id)
    unit_defs = Map.new(list_unit_defs(), &{&1.key, &1})

    total_upkeep =
      Enum.reduce(army, 0, fn u, acc ->
        udef = Map.get(unit_defs, u.key)
        if udef, do: acc + udef.food_upkeep * u.count, else: acc
      end)

    # Apply production
    Enum.each(production, fn {r, amount} ->
      add_resource(char_id, r, amount)
    end)

    # Apply food upkeep
    if total_upkeep > 0 do
      case spend_resource(char_id, "food", total_upkeep) do
        {:ok, _} ->
          :ok

        {:error, :insufficient} ->
          # Desert troops until upkeep balanced
          desert_troops(char_id, army, unit_defs, total_upkeep)
      end
    end

    broadcast_resources(char_id)
  end

  # ── Desertion ───────────────────────────────────────────────────

  defp desert_troops(char_id, army, unit_defs, _total_upkeep) do
    food = get_resource(char_id, "food")
    deficit = abs(min(0, food))

    if deficit > 0 do
      sorted = Enum.sort_by(army, fn u ->
        udef = Map.get(unit_defs, u.key)
        if udef, do: udef.food_upkeep, else: 0
      end, :desc)

      Enum.reduce_while(sorted, deficit, fn u, remaining ->
        udef = Map.get(unit_defs, u.key)

        if udef && u.count > 0 && remaining > 0 do
          upkeep_per = udef.food_upkeep
          to_desert = min(u.count, div(remaining, max(1, upkeep_per)) + 1)

          Repo.query(
            "UPDATE #{@player_armies_table} SET count = count - ? WHERE char_id = ? AND unit_key = ?",
            [to_desert, char_id, u.key]
          )

          saved = to_desert * upkeep_per
          new_remaining = remaining - saved

          if new_remaining <= 0, do: {:halt, 0}, else: {:cont, new_remaining}
        else
          {:cont, remaining}
        end
      end)

      add_resource(char_id, "food", deficit)
    end
  end

  # ── Upgrade/training completion ─────────────────────────────────

  defp complete_upgrades(char_id) do
    Repo.query(
      "UPDATE #{@player_buildings_table} SET upgrading = 0, upgrade_finish_at = NULL WHERE char_id = ? AND upgrading = 1 AND upgrade_finish_at <= NOW()",
      [char_id]
    )
  rescue
    _ -> :ok
  end

  defp complete_training(char_id) do
    case Repo.query(
      "SELECT unit_key, training FROM #{@player_armies_table} WHERE char_id = ? AND training > 0 AND training_finish_at <= NOW()",
      [char_id]
    ) do
      {:ok, %{rows: rows}} ->
        for [key, count] <- rows do
          Repo.query(
            "UPDATE #{@player_armies_table} SET count = count + training, training = 0, training_finish_at = NULL WHERE char_id = ? AND unit_key = ?",
            [char_id, key]
          )

          Logger.info("Training complete: #{count} #{key} for char #{char_id}")
        end

      _ -> :ok
    end
  rescue
    _ -> :ok
  end

  # ── Army-vs-army combat ─────────────────────────────────────────

  @doc """
  Resolve a mass combat between two players' armies.

  Each side's total attack/defense is calculated from unit counts ×
  unit stats. Casualties are proportional to the damage ratio.
  Winner keeps remaining troops; loser loses everything.

  Returns `{:ok, %{winner, attacker_losses, defender_losses, loot}}`.
  """
  def resolve_army_battle(attacker_id, defender_id) do
    atk_army = get_army(attacker_id)
    def_army = get_army(defender_id)
    unit_defs = Map.new(list_unit_defs(), &{&1.key, &1})

    atk_power = army_power(atk_army, unit_defs, :attack)
    def_power = army_power(def_army, unit_defs, :defense)
    atk_defense = army_power(atk_army, unit_defs, :defense)
    def_attack = army_power(def_army, unit_defs, :attack)

    atk_hp = army_hp(atk_army, unit_defs)
    def_hp = army_hp(def_army, unit_defs)

    # Damage dealt
    atk_dmg = max(1, atk_power - trunc(def_power * 0.3))
    def_dmg = max(1, def_attack - trunc(atk_defense * 0.3))

    # Casualty ratio
    atk_loss_pct = min(1.0, def_dmg / max(1, atk_hp))
    def_loss_pct = min(1.0, atk_dmg / max(1, def_hp))

    # Apply casualties
    atk_losses = apply_casualties(attacker_id, atk_army, unit_defs, atk_loss_pct)
    def_losses = apply_casualties(defender_id, def_army, unit_defs, def_loss_pct)

    winner = if def_loss_pct > atk_loss_pct, do: attacker_id, else: defender_id

    # Loot: winner takes 10% of loser's resources
    loser_id = if winner == attacker_id, do: defender_id, else: attacker_id
    loot = calculate_loot(winner, loser_id)

    {:ok, %{
      winner: winner,
      attacker_losses: atk_losses,
      defender_losses: def_losses,
      attacker_loss_pct: Float.round(atk_loss_pct * 100, 1),
      defender_loss_pct: Float.round(def_loss_pct * 100, 1),
      loot: loot
    }}
  end

  defp army_power(army, unit_defs, stat) do
    Enum.reduce(army, 0, fn u, acc ->
      udef = Map.get(unit_defs, u.key)
      if udef, do: acc + Map.get(udef, stat, 0) * u.count, else: acc
    end)
  end

  defp army_hp(army, unit_defs) do
    Enum.reduce(army, 0, fn u, acc ->
      udef = Map.get(unit_defs, u.key)
      if udef, do: acc + udef.hp * u.count, else: acc
    end)
  end

  defp apply_casualties(char_id, army, _unit_defs, loss_pct) do
    losses =
      Enum.map(army, fn u ->
        lost = trunc(u.count * loss_pct)

        if lost > 0 do
          Repo.query("UPDATE #{@player_armies_table} SET count = GREATEST(0, count - ?) WHERE char_id = ? AND unit_key = ?",
            [lost, char_id, u.key])
        end

        {u.key, lost}
      end)
      |> Map.new()

    losses
  end

  defp calculate_loot(winner_id, loser_id) do
    loser_resources = get_resources(loser_id)
    loot_pct = 0.10

    loot =
      Map.new(loser_resources, fn {r, a} ->
        take = trunc(a * loot_pct)
        {r, take}
      end)
      |> Enum.reject(fn {_r, a} -> a <= 0 end)
      |> Map.new()

    Enum.each(loot, fn {r, a} ->
      spend_resource(loser_id, r, a)
      add_resource(winner_id, r, a)
    end)

    loot
  end

  # ── Helpers ─────────────────────────────────────────────────────

  defp calculate_costs(bdef, level) do
    Enum.map(bdef.cost_base, fn {r, base} ->
      {r, trunc(base * :math.pow(bdef.cost_mult, level - 1))}
    end)
    |> Map.new()
  end

  defp calculate_build_time(bdef, level) do
    trunc(bdef.build_time_base * :math.pow(bdef.build_time_mult, level - 1))
  end

  defp calculate_yield(bdef, level) do
    Map.new(bdef.base_yield, fn {r, base} ->
      {r, trunc(base * level)}
    end)
  end

  defp parse_building_def([key, name, icon, desc, yield_j, cost_j, cost_m, bt_base, bt_m, max_l, req_j]) do
    %{
      key: key, name: name, icon: icon || "🏠", description: desc,
      base_yield: decode(yield_j, %{}), cost_base: decode(cost_j, %{}),
      cost_mult: cost_m || 1.5, build_time_base: bt_base || 60,
      build_time_mult: bt_m || 1.3, max_level: max_l || 20,
      requires: decode(req_j, [])
    }
  end

  defp parse_unit_def([key, name, icon, atk, def_, hp, spd, food, cost_j, train_t, req_j]) do
    %{
      key: key, name: name, icon: icon || "⚔️",
      attack: atk || 10, defense: def_ || 5, hp: hp || 100,
      speed: spd || 10, food_upkeep: food || 1,
      train_cost: decode(cost_j, %{}), train_time: train_t || 30,
      requires: decode(req_j, [])
    }
  end

  defp decode(nil, d), do: d
  defp decode("", d), do: d
  defp decode(s, d) when is_binary(s), do: case(Jason.decode(s), do: ({:ok, v} -> v; _ -> d))
  defp decode(v, _) when is_map(v) or is_list(v), do: v
  defp decode(_, d), do: d

  defp broadcast_resources(char_id) do
    resources = get_resources(char_id)
    Phoenix.PubSub.broadcast(TePhoenix.PubSub, "player:#{char_id}", {:resources_updated, resources})
  rescue
    _ -> :ok
  end
end
