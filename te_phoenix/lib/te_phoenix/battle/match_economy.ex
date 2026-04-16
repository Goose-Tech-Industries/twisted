defmodule TePhoenix.Battle.MatchEconomy do
  @moduledoc """
  Per-match gold economy for MOBA/arena battle modes.

  Gold is tracked on the battle state (not persisted to DB) and resets
  each match. Combatants earn gold from kills, assists, and objectives,
  then spend it in the match shop to buy stat-boosting items.

  ## Gold Sources

  - Kill: `gold_per_kill` (default 300)
  - Assist: `gold_per_assist` (default 150)
  - Objective: `gold_per_objective` (default 200)
  - Passive: `gold_per_tick` (default 0, configurable)
  - Custom: `award_gold/4` with any reason string

  ## Shop Items

  Stored in `game_match_shop_items` table. Each item has a gold cost
  and a stat bonus map. When purchased, the bonus is applied as a
  synthetic status on the combatant (category "item", permanent, no
  tick). Selling refunds 50%.

  ## State Shape

  Gold and purchased items are stored on `state.match_economy`:

      %{
        gold: %{char_id => amount},
        purchased: %{char_id => [%{key: "longsword", cost: 500, ...}, ...]},
        settings: %{gold_per_kill: 300, ...}
      }

  Initialize with `init/1` at battle start for MOBA/arena modes.
  """

  require Logger
  alias TePhoenix.Repo

  @table "game_match_shop_items"

  # ── Table setup ────────────────────────────────────────────────

  def ensure_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@table} (
      `key` VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      icon VARCHAR(16) DEFAULT '🗡️',
      description TEXT,
      gold_cost INT NOT NULL DEFAULT 500,
      category VARCHAR(40) DEFAULT 'weapon',
      stat_bonuses_json LONGTEXT,
      prerequisites_json LONGTEXT,
      max_stacks INT DEFAULT 1,
      enabled TINYINT(1) DEFAULT 1,
      updated_at DATETIME NOT NULL
    )
    """)

    seed_defaults()
  rescue
    e -> Logger.error("MatchEconomy ensure_table: #{inspect(e)}")
  end

  # ── Init ───────────────────────────────────────────────────────

  @doc """
  Initialize match economy on a battle state. Call at battle start
  for MOBA/arena modes. `settings` overrides default gold values.

  Returns the state with `match_economy` key populated.
  """
  def init(state, settings \\ %{}) do
    char_ids =
      state.combatants
      |> Map.keys()

    gold = Map.new(char_ids, fn id -> {id, Map.get(settings, :starting_gold, 0)} end)
    purchased = Map.new(char_ids, fn id -> {id, []} end)

    economy = %{
      gold: gold,
      purchased: purchased,
      settings: %{
        gold_per_kill: Map.get(settings, :gold_per_kill, 300),
        gold_per_assist: Map.get(settings, :gold_per_assist, 150),
        gold_per_objective: Map.get(settings, :gold_per_objective, 200),
        gold_per_tick: Map.get(settings, :gold_per_tick, 0),
        starting_gold: Map.get(settings, :starting_gold, 0),
        sell_refund_pct: Map.get(settings, :sell_refund_pct, 0.50)
      }
    }

    Map.put(state, :match_economy, economy)
  end

  # ── Gold queries ───────────────────────────────────────────────

  @doc "Get current gold for a combatant."
  def get_gold(state, char_id) do
    case deep_get(state, [:match_economy, :gold, char_id]) do
      nil -> 0
      amount -> amount
    end
  end

  @doc "Get all purchased items for a combatant."
  def get_purchased(state, char_id) do
    case deep_get(state, [:match_economy, :purchased, char_id]) do
      nil -> []
      items -> items
    end
  end

  # ── Award gold ─────────────────────────────────────────────────

  @doc """
  Award gold to a combatant. `reason` is a string for logging/events.

  Returns `{state, result}` with log entries appended.
  """
  def award_gold(state, char_id, amount, reason) when is_integer(amount) and amount > 0 do
    economy = Map.get(state, :match_economy) || init_economy_fallback(state)
    current = Map.get(economy.gold, char_id, 0)
    new_gold = current + amount

    economy = put_in(economy.gold[char_id], new_gold)
    state = Map.put(state, :match_economy, economy)

    char_name = get_char_name(state, char_id)

    result = %{
      log: ["#{char_name} earned #{amount} gold (#{reason}) — total: #{new_gold}"],
      actions: [
        %{
          type: :gold_awarded,
          char_id: char_id,
          amount: amount,
          reason: reason,
          total: new_gold
        }
      ]
    }

    Logger.debug("[MatchEconomy] #{char_name} +#{amount}g (#{reason}) = #{new_gold}g")
    {state, result}
  end

  def award_gold(state, _char_id, _amount, _reason) do
    {state, %{log: [], actions: []}}
  end

  @doc """
  Award gold for a kill. Uses the match settings for amount.
  """
  def award_kill_gold(state, killer_id, victim_id) do
    settings = get_settings(state)
    amount = Map.get(settings, :gold_per_kill, 300)
    victim_name = get_char_name(state, victim_id)
    award_gold(state, killer_id, amount, "kill on #{victim_name}")
  end

  @doc """
  Award gold for an assist. Uses the match settings for amount.
  """
  def award_assist_gold(state, assister_id, victim_id) do
    settings = get_settings(state)
    amount = Map.get(settings, :gold_per_assist, 150)
    victim_name = get_char_name(state, victim_id)
    award_gold(state, assister_id, amount, "assist on #{victim_name}")
  end

  @doc """
  Award gold for completing an objective.
  """
  def award_objective_gold(state, char_id, objective_name) do
    settings = get_settings(state)
    amount = Map.get(settings, :gold_per_objective, 200)
    award_gold(state, char_id, amount, "objective: #{objective_name}")
  end

  @doc """
  Award passive gold to all living combatants (call each turn tick).
  Returns `{state, result}`.
  """
  def tick_passive_gold(state) do
    settings = get_settings(state)
    amount = Map.get(settings, :gold_per_tick, 0)

    if amount <= 0 do
      {state, %{log: [], actions: []}}
    else
      living_ids =
        state.combatants
        |> Enum.filter(fn {_id, c} -> Map.get(c, :current_hp, 0) > 0 end)
        |> Enum.map(fn {id, _c} -> id end)

      Enum.reduce(living_ids, {state, %{log: [], actions: []}}, fn id, {st, acc_result} ->
        {st, r} = award_gold(st, id, amount, "passive income")
        merged = %{log: acc_result.log ++ r.log, actions: acc_result.actions ++ r.actions}
        {st, merged}
      end)
    end
  end

  # ── Shop ───────────────────────────────────────────────────────

  @doc "List all enabled shop items from the DB."
  def list_shop_items do
    case Repo.query(
           "SELECT `key`, name, icon, description, gold_cost, category, stat_bonuses_json, prerequisites_json, max_stacks FROM #{@table} WHERE enabled = 1 ORDER BY gold_cost ASC"
         ) do
      {:ok, %{rows: rows}} -> Enum.map(rows, &parse_item_row/1)
      _ -> []
    end
  rescue
    _ -> []
  end

  @doc "Get a single shop item by key."
  def get_shop_item(key) do
    case Repo.query(
           "SELECT `key`, name, icon, description, gold_cost, category, stat_bonuses_json, prerequisites_json, max_stacks FROM #{@table} WHERE `key` = ? AND enabled = 1",
           [key]
         ) do
      {:ok, %{rows: [row]}} -> parse_item_row(row)
      _ -> nil
    end
  rescue
    _ -> nil
  end

  # ── Buy ────────────────────────────────────────────────────────

  @doc """
  Buy an item from the match shop. Deducts gold, adds item to the
  combatant's purchased list, and applies stat bonuses as a synthetic
  status effect on the combatant.

  Returns `{:ok, state, result}` or `{:error, reason}`.
  """
  def buy_item(state, char_id, item_key) do
    item = get_shop_item(item_key)

    cond do
      is_nil(item) ->
        {:error, :item_not_found}

      true ->
        gold = get_gold(state, char_id)
        purchased = get_purchased(state, char_id)
        owned_count = Enum.count(purchased, fn p -> p.key == item_key end)

        cond do
          gold < item.gold_cost ->
            {:error, :insufficient_gold}

          owned_count >= item.max_stacks ->
            {:error, :max_stacks_reached}

          not prerequisites_met?(purchased, item.prerequisites) ->
            {:error, :prerequisites_not_met}

          true ->
            do_buy(state, char_id, item, gold)
        end
    end
  end

  defp do_buy(state, char_id, item, gold) do
    economy = Map.get(state, :match_economy)

    # Deduct gold
    new_gold = gold - item.gold_cost
    economy = put_in(economy.gold[char_id], new_gold)

    # Add to purchased list
    purchased = Map.get(economy.purchased, char_id, [])
    economy = put_in(economy.purchased[char_id], purchased ++ [item])

    state = Map.put(state, :match_economy, economy)

    # Apply stat bonuses as a synthetic status on the combatant
    state = apply_item_stats(state, char_id, item)

    char_name = get_char_name(state, char_id)

    result = %{
      log: ["#{item.icon} #{char_name} purchased #{item.name} for #{item.gold_cost} gold (#{new_gold} remaining)"],
      actions: [
        %{
          type: :item_purchased,
          char_id: char_id,
          item_key: item.key,
          item_name: item.name,
          cost: item.gold_cost,
          gold_remaining: new_gold
        }
      ]
    }

    Logger.info("[MatchEconomy] #{char_name} bought #{item.name} for #{item.gold_cost}g")
    {:ok, state, result}
  end

  # ── Sell ───────────────────────────────────────────────────────

  @doc """
  Sell an item back. Refunds 50% of gold cost (configurable via
  `sell_refund_pct`). Removes the item from purchased list and
  removes its stat bonuses.

  Returns `{:ok, state, result}` or `{:error, reason}`.
  """
  def sell_item(state, char_id, item_key) do
    purchased = get_purchased(state, char_id)
    item_index = Enum.find_index(purchased, fn p -> p.key == item_key end)

    if is_nil(item_index) do
      {:error, :item_not_owned}
    else
      item = Enum.at(purchased, item_index)
      economy = Map.get(state, :match_economy)
      settings = get_settings(state)
      refund_pct = Map.get(settings, :sell_refund_pct, 0.50)
      refund = trunc(item.gold_cost * refund_pct)

      # Refund gold
      current_gold = Map.get(economy.gold, char_id, 0)
      new_gold = current_gold + refund
      economy = put_in(economy.gold[char_id], new_gold)

      # Remove from purchased
      new_purchased = List.delete_at(purchased, item_index)
      economy = put_in(economy.purchased[char_id], new_purchased)

      state = Map.put(state, :match_economy, economy)

      # Remove stat bonuses
      state = remove_item_stats(state, char_id, item)

      char_name = get_char_name(state, char_id)

      result = %{
        log: ["#{char_name} sold #{item.name} for #{refund} gold (#{new_gold} total)"],
        actions: [
          %{
            type: :item_sold,
            char_id: char_id,
            item_key: item.key,
            item_name: item.name,
            refund: refund,
            gold_remaining: new_gold
          }
        ]
      }

      Logger.info("[MatchEconomy] #{char_name} sold #{item.name} for #{refund}g")
      {:ok, state, result}
    end
  end

  # ── Stat application ───────────────────────────────────────────

  defp apply_item_stats(state, char_id, item) do
    bonuses = item.stat_bonuses

    if bonuses == %{} do
      state
    else
      combatant = Map.get(state.combatants, char_id)

      if is_nil(combatant) do
        state
      else
        # Build a synthetic status representing this item's bonuses
        status = %{
          key: "shop_item_#{item.key}",
          name: item.name,
          icon: item.icon,
          category: "item",
          duration: nil,
          permanent: true,
          stacks: 1,
          source_id: nil,
          effects: bonuses,
          tick: %{},
          disabled_commands: [],
          cure_tags: []
        }

        existing_statuses = Map.get(combatant, :statuses, []) || []
        combatant = Map.put(combatant, :statuses, existing_statuses ++ [status])

        # Also apply flat stat bonuses directly (HP, MP, atk, def, etc.)
        combatant = apply_flat_bonuses(combatant, bonuses)

        %{state | combatants: Map.put(state.combatants, char_id, combatant)}
      end
    end
  end

  defp remove_item_stats(state, char_id, item) do
    combatant = Map.get(state.combatants, char_id)

    if is_nil(combatant) do
      state
    else
      status_key = "shop_item_#{item.key}"
      statuses = Map.get(combatant, :statuses, []) || []

      # Remove the first matching instance (in case of stacking)
      case Enum.find_index(statuses, fn s -> s[:key] == status_key end) do
        nil ->
          state

        idx ->
          combatant = Map.put(combatant, :statuses, List.delete_at(statuses, idx))
          combatant = remove_flat_bonuses(combatant, item.stat_bonuses)
          %{state | combatants: Map.put(state.combatants, char_id, combatant)}
      end
    end
  end

  defp apply_flat_bonuses(combatant, bonuses) do
    combatant
    |> apply_flat(:max_hp, bonuses, "max_hp_bonus")
    |> apply_flat(:current_hp, bonuses, "max_hp_bonus")
    |> apply_flat(:max_mp, bonuses, "max_mp_bonus")
    |> apply_flat(:current_mp, bonuses, "max_mp_bonus")
    |> apply_flat(:atk, bonuses, "atk_bonus")
    |> apply_flat(:def, bonuses, "def_bonus")
    |> apply_flat(:mo, bonuses, "mo_bonus")
    |> apply_flat(:md, bonuses, "md_bonus")
    |> apply_flat(:speed, bonuses, "speed_bonus")
    |> apply_flat(:luck, bonuses, "luck_bonus")
  end

  defp remove_flat_bonuses(combatant, bonuses) do
    combatant
    |> remove_flat(:max_hp, bonuses, "max_hp_bonus")
    |> remove_flat(:max_mp, bonuses, "max_mp_bonus")
    |> remove_flat(:atk, bonuses, "atk_bonus")
    |> remove_flat(:def, bonuses, "def_bonus")
    |> remove_flat(:mo, bonuses, "mo_bonus")
    |> remove_flat(:md, bonuses, "md_bonus")
    |> remove_flat(:speed, bonuses, "speed_bonus")
    |> remove_flat(:luck, bonuses, "luck_bonus")
    |> clamp_hp_mp()
  end

  defp apply_flat(combatant, stat, bonuses, bonus_key) do
    case Map.get(bonuses, bonus_key) do
      v when is_number(v) and v != 0 ->
        current = Map.get(combatant, stat, 0)
        Map.put(combatant, stat, current + trunc(v))

      _ ->
        combatant
    end
  end

  defp remove_flat(combatant, stat, bonuses, bonus_key) do
    case Map.get(bonuses, bonus_key) do
      v when is_number(v) and v != 0 ->
        current = Map.get(combatant, stat, 0)
        Map.put(combatant, stat, max(1, current - trunc(v)))

      _ ->
        combatant
    end
  end

  defp clamp_hp_mp(combatant) do
    combatant
    |> Map.update!(:current_hp, fn hp -> min(hp, Map.get(combatant, :max_hp, hp)) end)
    |> Map.update!(:current_mp, fn mp -> min(mp, Map.get(combatant, :max_mp, mp)) end)
  end

  # ── Helpers ────────────────────────────────────────────────────

  defp get_settings(state) do
    case deep_get(state, [:match_economy, :settings]) do
      nil -> %{}
      s -> s
    end
  end

  defp get_char_name(state, char_id) do
    case Map.get(state.combatants, char_id) do
      nil -> "Unknown"
      c -> Map.get(c, :name, "Combatant")
    end
  end

  defp init_economy_fallback(state) do
    %{
      gold: Map.new(Map.keys(state.combatants), fn id -> {id, 0} end),
      purchased: Map.new(Map.keys(state.combatants), fn id -> {id, []} end),
      settings: %{
        gold_per_kill: 300,
        gold_per_assist: 150,
        gold_per_objective: 200,
        gold_per_tick: 0,
        starting_gold: 0,
        sell_refund_pct: 0.50
      }
    }
  end

  defp prerequisites_met?(_purchased, nil), do: true
  defp prerequisites_met?(_purchased, []), do: true

  defp prerequisites_met?(purchased, prereqs) when is_list(prereqs) do
    owned_keys = MapSet.new(Enum.map(purchased, fn p -> p.key end))
    Enum.all?(prereqs, fn key -> MapSet.member?(owned_keys, key) end)
  end

  defp prerequisites_met?(_, _), do: true

  defp deep_get(map, keys) when is_map(map) do
    Enum.reduce_while(keys, map, fn key, acc ->
      case acc do
        %{} -> {:cont, Map.get(acc, key)}
        _ -> {:halt, nil}
      end
    end)
  end

  # ── Parse ──────────────────────────────────────────────────────

  defp parse_item_row([key, name, icon, desc, cost, category, bonuses_j, prereqs_j, max_stacks]) do
    %{
      key: key,
      name: name,
      icon: icon || "🗡️",
      description: desc || "",
      gold_cost: cost || 500,
      category: category || "weapon",
      stat_bonuses: decode_map(bonuses_j),
      prerequisites: decode_list(prereqs_j),
      max_stacks: max_stacks || 1
    }
  end

  defp decode_map(nil), do: %{}
  defp decode_map(""), do: %{}
  defp decode_map(s) when is_binary(s), do: case(Jason.decode(s), do: ({:ok, %{} = m} -> m; _ -> %{}))
  defp decode_map(m) when is_map(m), do: m
  defp decode_map(_), do: %{}

  defp decode_list(nil), do: []
  defp decode_list(""), do: []
  defp decode_list(s) when is_binary(s), do: case(Jason.decode(s), do: ({:ok, l} when is_list(l) -> l; _ -> []))
  defp decode_list(l) when is_list(l), do: l
  defp decode_list(_), do: []

  # ── Seed defaults ──────────────────────────────────────────────

  defp seed_defaults do
    case Repo.query("SELECT COUNT(*) FROM #{@table}") do
      {:ok, %{rows: [[0]]}} ->
        for item <- default_items() do
          Repo.query(
            "INSERT INTO #{@table} (`key`, name, icon, description, gold_cost, category, stat_bonuses_json, prerequisites_json, max_stacks, enabled, updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,NOW())",
            [
              item.key, item.name, item.icon, item.desc, item.cost, item.category,
              Jason.encode!(item.bonuses), Jason.encode!(item.prereqs), item.max_stacks
            ]
          )
        end

      _ ->
        :ok
    end
  rescue
    _ -> :ok
  end

  defp default_items do
    [
      %{
        key: "longsword",
        name: "Longsword",
        icon: "🗡️",
        desc: "A sturdy blade that increases attack power.",
        cost: 500,
        category: "weapon",
        bonuses: %{"atk_bonus" => 15, "damage_dealt_mult" => 1.1},
        prereqs: [],
        max_stacks: 1
      },
      %{
        key: "iron_shield",
        name: "Iron Shield",
        icon: "🛡️",
        desc: "A heavy shield that bolsters defense.",
        cost: 450,
        category: "armor",
        bonuses: %{"def_bonus" => 20, "damage_taken_mult" => 0.9},
        prereqs: [],
        max_stacks: 1
      },
      %{
        key: "swift_boots",
        name: "Swift Boots",
        icon: "👢",
        desc: "Enchanted boots that increase speed and dodge.",
        cost: 400,
        category: "accessory",
        bonuses: %{"speed_bonus" => 10, "speed_mult" => 1.15},
        prereqs: [],
        max_stacks: 1
      },
      %{
        key: "health_crystal",
        name: "Health Crystal",
        icon: "💎",
        desc: "A glowing crystal that expands your life force.",
        cost: 600,
        category: "accessory",
        bonuses: %{"max_hp_bonus" => 100},
        prereqs: [],
        max_stacks: 2
      },
      %{
        key: "mana_potion",
        name: "Mana Elixir",
        icon: "🧪",
        desc: "A potent elixir that increases magical reserves.",
        cost: 350,
        category: "consumable",
        bonuses: %{"max_mp_bonus" => 40, "mo_bonus" => 5},
        prereqs: [],
        max_stacks: 2
      },
      %{
        key: "ward_stone",
        name: "Ward Stone",
        icon: "🪨",
        desc: "A protective rune stone that reduces magic damage taken.",
        cost: 500,
        category: "accessory",
        bonuses: %{"md_bonus" => 15, "damage_taken_mult" => 0.92},
        prereqs: [],
        max_stacks: 1
      },
      %{
        key: "berserker_axe",
        name: "Berserker Axe",
        icon: "🪓",
        desc: "A brutal axe — more damage dealt but more damage taken.",
        cost: 800,
        category: "weapon",
        bonuses: %{"atk_bonus" => 30, "damage_dealt_mult" => 1.25, "damage_taken_mult" => 1.1},
        prereqs: ["longsword"],
        max_stacks: 1
      },
      %{
        key: "cloak_of_shadows",
        name: "Cloak of Shadows",
        icon: "🧥",
        desc: "A dark cloak that boosts critical strikes and evasion.",
        cost: 700,
        category: "accessory",
        bonuses: %{"crit_mult_bonus" => 0.25, "speed_bonus" => 5, "luck_bonus" => 10},
        prereqs: ["swift_boots"],
        max_stacks: 1
      }
    ]
  end
end
