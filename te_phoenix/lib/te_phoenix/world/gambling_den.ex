defmodule TePhoenix.World.GamblingDen do
  @moduledoc """
  Underworld Casino, Sovereign Scratch-Offs & Town Lottery Engine (*Teach Cearrbhachais*).

  Provides fully interactive gambling and games of chance:
    * **Sovereign Scratch-Offs ("Silver Serpent Scratchers")**:
      - Buyable foil cards across 3 tiers (Copper 5g, Silver 25g, Imperial 100g).
      - 3×3 grid of 9 concealed runes/symbols:
        💎 Diamond (Jackpot 250×), 👑 Crown (50×), 🗡️ Dagger (20×), 🪙 Gold Coin (10×), ⭐ Star (5×), 💀 Skull (Loss).
      - Matching 3 symbols anywhere on the card wins the payout!
    * **Tavern Dice ("Crowns & Skulls")**:
      - 3 D6 contested dice game played against autonomous tavern gamblers.
      - Win payouts on higher total, with 3× bonus for triples or straights.
    * **The Sovereign Town Lottery**:
      - Daily jackpot pool with persistent ticket registry.
      - Players pick 3 lucky numbers (1 to 20) for 10 gold.
      - Midnight drawing awards rolling jackpot or increases the grand prize!
  """

  alias TePhoenix.Repo
  require Logger

  @symbols [
    %{symbol: "💎", name: "Diamond", mult: 250, weight: 3},
    %{symbol: "👑", name: "Crown", mult: 50, weight: 8},
    %{symbol: "🗡️", name: "Dagger", mult: 20, weight: 15},
    %{symbol: "🪙", name: "Gold Coin", mult: 10, weight: 25},
    %{symbol: "⭐", name: "Star", mult: 5, weight: 35},
    %{symbol: "💀", name: "Skull", mult: 0, weight: 60}
  ]

  @doc """
  Ensures database schema for tickets and the lottery jackpot pool exists.
  """
  def ensure_schema! do
    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_town_lottery (
      id INT AUTO_INCREMENT PRIMARY KEY,
      map_id INT NOT NULL DEFAULT 1,
      jackpot_pool INT NOT NULL DEFAULT 2500,
      last_drawn_at TIMESTAMP NULL,
      winning_numbers VARCHAR(32) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
    """)

    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_lottery_tickets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      char_id INT NOT NULL,
      char_name VARCHAR(64) NOT NULL,
      map_id INT NOT NULL DEFAULT 1,
      numbers VARCHAR(32) NOT NULL,
      cost_gold INT NOT NULL DEFAULT 10,
      drawn TINYINT(1) NOT NULL DEFAULT 0,
      payout_gold INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_lottery_drawn (drawn, map_id)
    )
    """)

    case Repo.query("SELECT id FROM game_town_lottery WHERE map_id = 1 LIMIT 1") do
      {:ok, %{rows: []}} ->
        Repo.query("INSERT INTO game_town_lottery (map_id, jackpot_pool) VALUES (1, 2500)")
      _ -> :ok
    end

    :ok
  end

  # ── 1. Sovereign Scratch-Off Cards ─────────────────────────────────

  @doc """
  Generates and purchases a 3×3 scratch card.
  Tiers:
    * `"copper"`: 5 gold ticket. Max win: 1,250 gold.
    * `"silver"`: 25 gold ticket. Max win: 6,250 gold.
    * `"imperial"`: 100 gold ticket. Max win: 25,000 gold.
  """
  def buy_scratch_card(player, tier \\ "silver") do
    ensure_schema!()
    char_id = player[:id] || player["id"]
    gold = get_player_gold(player)

    cost = case tier do
      "copper" -> 5
      "imperial" -> 100
      _ -> 25
    end

    if gold < cost do
      {:error, "You need #{cost} gold to purchase a #{tier} scratch ticket."}
    else
      deduct_player_gold(char_id, cost)

      # Generate 3x3 grid (9 cells)
      cells = generate_scratch_grid()
      {winning_symbol, win_mult, is_winner} = evaluate_scratch_card(cells)
      payout = if is_winner, do: cost * win_mult, else: 0

      if payout > 0 do
        award_player_gold(char_id, payout)
      end

      # Feed 10% of ticket cost into the town lottery jackpot
      Repo.query("UPDATE game_town_lottery SET jackpot_pool = jackpot_pool + ? WHERE map_id = 1", [max(1, div(cost, 10))])

      {:ok, %{
        ticket_id: "scr_#{System.system_time(:millisecond)}",
        tier: tier,
        cost: cost,
        cells: cells,
        is_winner: is_winner,
        winning_symbol: winning_symbol,
        multiplier: win_mult,
        payout_gold: payout,
        remaining_gold: gold - cost + payout,
        message: if is_winner do
          "JACKPOT WIN! You scratched 3 matching #{winning_symbol} symbols! Payout: #{payout} Gold (#{win_mult}× multiplier)!"
        else
          "Better luck next card! You uncovered skulls and mixed symbols."
        end
      }}
    end
  end

  defp generate_scratch_grid do
    # Force ~35% chance of generating a winning 3-match
    roll = :rand.uniform(100)

    if roll <= 35 do
      # Pick a winning non-skull symbol
      win_sym = Enum.take(@symbols, 5) |> Enum.random()
      other_syms = Enum.reject(@symbols, &(&1.symbol == win_sym.symbol))

      # Place 3 winning symbols at random indices, 6 filler symbols
      grid = List.duplicate(nil, 9)
      win_indices = Enum.take_random(0..8, 3)

      Enum.map(0..8, fn idx ->
        if idx in win_indices do
          win_sym.symbol
        else
          pick_weighted_symbol(other_syms)
        end
      end)
    else
      # Loss grid: ensure no symbol appears 3 times
      fill_loss_grid()
    end
  end

  defp fill_loss_grid do
    # Generate random cells with cap of 2 for any symbol
    Enum.reduce(0..8, {[], %{}}, fn _idx, {acc, counts} ->
      sym = pick_weighted_symbol(@symbols)
      current_count = Map.get(counts, sym, 0)

      chosen = if current_count >= 2 do
        # Fallback to skull or another symbol
        "💀"
      else
        sym
      end

      {[chosen | acc], Map.put(counts, chosen, Map.get(counts, chosen, 0) + 1)}
    end)
    |> elem(0)
    |> Enum.reverse()
  end

  defp pick_weighted_symbol(sym_list) do
    total_weight = Enum.reduce(sym_list, 0, &(&1.weight + &2))
    rand_val = :rand.uniform(total_weight)

    Enum.reduce_while(sym_list, 0, fn sym, acc ->
      new_acc = acc + sym.weight
      if rand_val <= new_acc do
        {:halt, sym.symbol}
      else
        {:cont, new_acc}
      end
    end)
  end

  defp evaluate_scratch_card(cells) do
    frequencies = Enum.frequencies(cells)

    winning_entry = Enum.find(frequencies, fn {sym, count} ->
      sym != "💀" and count >= 3
    end)

    case winning_entry do
      {sym, _count} ->
        info = Enum.find(@symbols, &(&1.symbol == sym))
        {sym, info.mult, true}

      nil ->
        {nil, 0, false}
    end
  end

  # ── 2. Tavern Dice Game ("Crowns & Skulls") ────────────────────────

  @doc """
  Plays a tavern dice match against an NPC gambler (betting 5–100 gold).
  Both roll 3 D6 dice. High total wins. Triples pay 3×.
  """
  def play_tavern_dice(player, bet_amount \\ 10) do
    ensure_schema!()
    char_id = player[:id] || player["id"]
    char_name = player[:name] || player["name"] || "Gambler"
    gold = get_player_gold(player)
    bet = max(5, min(100, bet_amount))

    if gold < bet do
      {:error, "Insufficient gold to place a #{bet} gold bet."}
    else
      deduct_player_gold(char_id, bet)

      player_dice = [:rand.uniform(6), :rand.uniform(6), :rand.uniform(6)]
      house_dice = [:rand.uniform(6), :rand.uniform(6), :rand.uniform(6)]

      player_total = Enum.sum(player_dice)
      house_total = Enum.sum(house_dice)

      player_triple = length(Enum.uniq(player_dice)) == 1
      house_triple = length(Enum.uniq(house_dice)) == 1

      {result, payout, msg} = cond do
        player_triple and not house_triple ->
          p = bet * 3
          award_player_gold(char_id, p)
          {:win_triple, p, "TRIPLE CRUST! You rolled matching #{Enum.at(player_dice, 0)}'s! You scoop #{p} gold (3× payout)!"}

        player_total > house_total ->
          p = bet * 2
          award_player_gold(char_id, p)
          {:win, p, "VICTORY! Your #{player_total} beats the house's #{house_total}! You win #{p} gold!"}

        player_total == house_total ->
          award_player_gold(char_id, bet)
          {:push, bet, "STANDOFF! Both sides rolled #{player_total}. Your #{bet} gold bet is pushed back."}

        true ->
          # Loss
          Repo.query("UPDATE game_town_lottery SET jackpot_pool = jackpot_pool + ? WHERE map_id = 1", [div(bet, 2)])
          {:loss, 0, "HOUSE WINS! Your #{player_total} fell short of the house's #{house_total}. You forfeit #{bet} gold."}
      end

      {:ok, %{
        result: result,
        bet: bet,
        player_dice: player_dice,
        house_dice: house_dice,
        player_total: player_total,
        house_total: house_total,
        payout: payout,
        remaining_gold: gold - bet + payout,
        message: msg
      }}
    end
  end

  # ── 3. Town Daily Sovereign Lottery ────────────────────────────────

  @doc """
  Buys a town lottery ticket with 3 selected numbers (1 to 20). Cost: 10 gold.
  """
  def buy_lottery_ticket(player, numbers, map_id \\ 1) when is_list(numbers) and length(numbers) == 3 do
    ensure_schema!()
    char_id = player[:id] || player["id"]
    char_name = player[:name] || player["name"] || "Citizen"
    gold = get_player_gold(player)
    cost = 10

    if gold < cost do
      {:error, "A lottery ticket costs 10 gold."}
    else
      sorted_numbers = Enum.sort(numbers)
      num_str = Enum.join(sorted_numbers, "-")

      deduct_player_gold(char_id, cost)
      # 80% goes to the jackpot pool
      Repo.query!("UPDATE game_town_lottery SET jackpot_pool = jackpot_pool + 8 WHERE map_id = ?", [map_id])

      Repo.query!("""
      INSERT INTO game_lottery_tickets (char_id, char_name, map_id, numbers, cost_gold)
      VALUES (?, ?, ?, ?, ?)
      """, [char_id, char_name, map_id, num_str, cost])

      jackpot = get_current_jackpot(map_id)

      {:ok, %{
        success: true,
        numbers: sorted_numbers,
        cost: cost,
        current_jackpot: jackpot,
        message: "You purchased Lottery Ticket ##{num_str}! The current Town Jackpot stands at #{jackpot} Gold! Drawing occurs daily at midnight!"
      }}
    end
  end

  @doc """
  Draws the town lottery and calculates payouts.
  """
  def draw_daily_lottery(map_id \\ 1) do
    ensure_schema!()

    # Draw 3 unique random numbers from 1 to 20
    winning = Enum.take_random(1..20, 3) |> Enum.sort()
    win_str = Enum.join(winning, "-")

    jackpot = get_current_jackpot(map_id)

    # Find pending tickets
    case Repo.query("SELECT id, char_id, char_name, numbers FROM game_lottery_tickets WHERE map_id = ? AND drawn = 0", [map_id]) do
      {:ok, %{rows: rows}} ->
        winners = Enum.map(rows, fn [t_id, c_id, c_name, nums_raw] ->
          t_nums = String.split(nums_raw, "-") |> Enum.map(&String.to_integer/1)
          matches = length(t_nums -- (t_nums -- winning))

          payout = case matches do
            3 -> jackpot
            2 -> 25
            1 -> 2
            _ -> 0
          end

          if payout > 0 do
            award_player_gold(c_id, payout)
          end

          Repo.query!("UPDATE game_lottery_tickets SET drawn = 1, payout_gold = ? WHERE id = ?", [payout, t_id])

          %{
            ticket_id: t_id,
            char_id: c_id,
            char_name: c_name,
            matches: matches,
            payout: payout
          }
        end)

        grand_winner = Enum.find(winners, &(&1.matches == 3))

        # Reset or increase jackpot
        new_jackpot = if grand_winner do
          Repo.query!("UPDATE game_town_lottery SET jackpot_pool = 2500, winning_numbers = ?, last_drawn_at = NOW() WHERE map_id = ?", [win_str, map_id])
          2500
        else
          # Roll over: add 500 gold seed
          Repo.query!("UPDATE game_town_lottery SET jackpot_pool = jackpot_pool + 500, winning_numbers = ?, last_drawn_at = NOW() WHERE map_id = ?", [win_str, map_id])
          jackpot + 500
        end

        {:ok, %{
          winning_numbers: winning,
          grand_winner: grand_winner,
          total_tickets: length(rows),
          winners: Enum.filter(winners, &(&1.payout > 0)),
          next_jackpot: new_jackpot,
          message: "TOWN LOTTERY DRAWN: Winning numbers are #{win_str}! #{if grand_winner, do: "GRAND JACKPOT WON BY #{grand_winner.char_name}!", else: "No jackpot winner—pot rolls over to #{new_jackpot} Gold!"}"
        }}

      _ ->
        {:ok, %{winning_numbers: winning, next_jackpot: jackpot, message: "No tickets were sold today."}}
    end
  end

  @doc """
  Gets the current town lottery jackpot pool amount.
  """
  def get_current_jackpot(map_id \\ 1) do
    ensure_schema!()
    case Repo.query("SELECT jackpot_pool FROM game_town_lottery WHERE map_id = ? LIMIT 1", [map_id]) do
      {:ok, %{rows: [[pool]]}} -> pool
      _ -> 2500
    end
  end

  # ── Helpers ────────────────────────────────────────────────────────

  defp get_player_gold(player_or_id) do
    cond do
      is_map(player_or_id) and (Map.has_key?(player_or_id, :gold) or Map.has_key?(player_or_id, "gold")) ->
        player_or_id[:gold] || player_or_id["gold"] || 0

      is_integer(player_or_id) ->
        case Repo.query("SELECT gold FROM characters WHERE id = ? LIMIT 1", [player_or_id]) do
          {:ok, %{rows: [[g]]}} -> g || 0
          _ -> 0
        end

      is_map(player_or_id) and (Map.has_key?(player_or_id, :id) or Map.has_key?(player_or_id, "id")) ->
        get_player_gold(player_or_id[:id] || player_or_id["id"])

      true -> 0
    end
  end

  defp deduct_player_gold(char_id, amount) do
    Repo.query("UPDATE characters SET gold = GREATEST(0, gold - ?) WHERE id = ?", [amount, char_id])
  rescue
    _ -> :ok
  end

  defp award_player_gold(char_id, amount) do
    Repo.query("UPDATE characters SET gold = gold + ? WHERE id = ?", [amount, char_id])
  rescue
    _ -> :ok
  end
end
