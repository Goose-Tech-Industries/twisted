defmodule TePhoenixWeb.Social.MinigameHandler do
  @moduledoc """
  Minigame handlers: dice gambling, arena betting, fishing, card game, gathering, bounties.
  Ported from socket-social.js minigames section.
  """

  import Phoenix.Channel

  alias TePhoenix.Game.PlayerRegistry
  alias TePhoenix.Repo

  # ── Dice Gambling ────────────────────────────────────────────────

  def handle("dice_roll", %{"bet" => bet, "choice" => choice}, socket) do
    p = PlayerRegistry.get(get_char_id(socket))
    if is_nil(p) or bet < 1, do: {:noreply, socket}

    result = try do
      case Repo.query("SELECT currency FROM users WHERE id=?", [p.user_id]) do
        {:ok, %{rows: [[currency]]}} when currency >= bet ->
          die1 = :rand.uniform(6)
          die2 = :rand.uniform(6)
          total = die1 + die2
          is_high = total >= 7
          won = (choice == "high" and is_high) or (choice == "low" and not is_high)

          if won do
            Repo.query!("UPDATE users SET currency=currency+? WHERE id=?", [bet, p.user_id])
          else
            Repo.query!("UPDATE users SET currency=currency-? WHERE id=?", [bet, p.user_id])
          end

          %{success: true, die1: die1, die2: die2, total: total, choice: choice, won: won, payout: if(won, do: bet, else: -bet)}

        _ -> %{success: false, message: "Not enough gold."}
      end
    rescue
      e -> %{success: false, message: Exception.message(e)}
    end

    push(socket, "dice_result", result)
    {:noreply, socket}
  end

  # ── Arena Betting ────────────────────────────────────────────────

  def handle("arena_place_bet", %{"matchId" => match_id, "betOn" => bet_on, "amount" => amount}, socket) do
    p = PlayerRegistry.get(get_char_id(socket))
    if is_nil(p) or amount < 1, do: {:noreply, socket}

    result = try do
      case Repo.query("SELECT currency FROM users WHERE id=?", [p.user_id]) do
        {:ok, %{rows: [[currency]]}} when currency >= amount ->
          Repo.query!("UPDATE users SET currency=currency-? WHERE id=?", [amount, p.user_id])
          Repo.query!("INSERT INTO game_arena_bets (match_id, character_id, bet_on, amount) VALUES (?,?,?,?)",
            [match_id, p.char_id, bet_on, amount])
          %{success: true, message: "Bet #{amount} gold on fighter ##{bet_on}!"}
        _ -> %{success: false, message: "Not enough gold."}
      end
    rescue
      e -> %{success: false, message: Exception.message(e)}
    end

    push(socket, "arena_bet_result", result)
    {:noreply, socket}
  end

  # ── Fishing ──────────────────────────────────────────────────────

  def handle("fish_cast", %{"x" => x, "y" => y}, socket) do
    p = PlayerRegistry.get(get_char_id(socket))
    if is_nil(p), do: {:noreply, socket}

    case Repo.query("SELECT id, catch_time_ms FROM game_fishing_spots WHERE map_id=? AND x=? AND y=? AND is_active=1", [p.map_id, x, y]) do
      {:ok, %{rows: [[spot_id, catch_time]]}} ->
        bite_time = (catch_time || 3000) + :rand.uniform(2000)
        push(socket, "fish_bite", %{spotId: spot_id, biteTime: bite_time})
      _ ->
        push(socket, "fish_result", %{success: false, message: "No fishing spot here."})
    end

    {:noreply, socket}
  end

  def handle("fish_reel", %{"spotId" => spot_id}, socket) do
    char_id = get_char_id(socket)

    try do
      case Repo.query("SELECT fish_table FROM game_fishing_spots WHERE id=?", [spot_id]) do
        {:ok, %{rows: [[fish_table_json]]}} ->
          fish_table = parse_json(fish_table_json, [])
          if fish_table == [] do
            push(socket, "fish_result", %{success: false, message: "Nothing biting today."})
          else
            # Roll catch
            roll = :rand.uniform() * 100
            {caught, _} = Enum.reduce_while(fish_table, {nil, 0.0}, fn fish, {_, cum} ->
              new_cum = cum + (fish["chance"] || 20)
              if roll <= new_cum, do: {:halt, {fish, new_cum}}, else: {:cont, {nil, new_cum}}
            end)

            if caught do
              if caught["item_id"] do
                Repo.query!("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1",
                  [char_id, caught["item_id"]])
              end
              push(socket, "fish_result", %{success: true, message: "Caught: #{caught["name"] || "a fish"}!", fish: caught})
            else
              push(socket, "fish_result", %{success: false, message: "It got away!"})
            end
          end
        _ -> push(socket, "fish_result", %{success: false, message: "Spot not found."})
      end
    rescue
      e -> push(socket, "fish_result", %{success: false, message: Exception.message(e)})
    end

    {:noreply, socket}
  end

  # ── Card Game (Card Duel / Realm Cards) ──────────────────────────

  def handle("card_get_collection", _payload, socket) do
    char_id = get_char_id(socket)
    if is_nil(char_id) do
      {:noreply, socket}
    else
      ensure_starter_cards(char_id)
      cards = fetch_character_cards(char_id)
      push(socket, "card_collection", %{cards: cards})
      {:noreply, socket}
    end
  end

  def handle("card_game_challenge", payload, socket) do
    char_id = get_char_id(socket)

    if is_nil(char_id) do
      {:noreply, socket}
    else
      try do
        ensure_starter_cards(char_id)
        cards = fetch_character_cards(char_id)

        if length(cards) >= 5 do
          opponent_name = payload["npcName"] || "Card Master"

          {:ok, result} = Repo.query(
            "INSERT INTO game_card_matches (player1_id, npc_opponent, board_size, board_json, status) VALUES (?,?,9,?,?)",
            [char_id, opponent_name, Jason.encode!(List.duplicate(nil, 9)), "active"]
          )

          hand = Enum.take(cards, 5)

          push(socket, "card_game_start", %{
            matchId: result.last_insert_id,
            playerCards: hand,
            boardSize: 9,
            opponent: opponent_name
          })
        else
          push(socket, "card_result", %{success: false, message: "Need at least 5 cards to duel."})
        end
      rescue
        e -> push(socket, "card_result", %{success: false, message: Exception.message(e)})
      end

      {:noreply, socket}
    end
  end

  def handle("card_game_place", %{"matchId" => match_id, "cardId" => card_id, "position" => position}, socket) do
    char_id = get_char_id(socket)

    if is_nil(char_id) do
      {:noreply, socket}
    else
      try do
        case Repo.query("SELECT board_json FROM game_card_matches WHERE id=? AND player1_id=? AND status='active'", [match_id, char_id]) do
          {:ok, %{rows: [[board_json]]}} ->
            board = parse_json(board_json, List.duplicate(nil, 9))

            if position < 0 or position >= length(board) or Enum.at(board, position) != nil do
              push(socket, "card_result", %{success: false, message: "Invalid position."})
            else
              case Repo.query("SELECT id, name, icon, value_top, value_right, value_bottom, value_left, rarity, element FROM game_cards WHERE id=?", [card_id]) do
                {:ok, %{rows: [[_id, name, icon, vt, vr, vb, vl, rarity, elem]]}} ->
                  player_card = %{
                    "cardId" => card_id,
                    "name" => name,
                    "icon" => icon || "🎴",
                    "owner" => "player",
                    "value_top" => vt,
                    "value_right" => vr,
                    "value_bottom" => vb,
                    "value_left" => vl,
                    "rarity" => rarity,
                    "element" => elem
                  }
                  board = List.replace_at(board, position, player_card)

                  # Flip adjacent opposing cards
                  {board, player_flipped} = execute_flips(board, player_card, position, "player")

                  # AI counter-placement
                  empty_spots = board |> Enum.with_index() |> Enum.filter(fn {c, _} -> is_nil(c) end) |> Enum.map(fn {_, i} -> i end)
                  {board, ai_flipped} = if empty_spots != [] do
                    case Repo.query("SELECT id, name, icon, value_top, value_right, value_bottom, value_left, rarity, element FROM game_cards WHERE is_active=1 ORDER BY RAND() LIMIT 1") do
                      {:ok, %{rows: [[nid, nname, nicon, nvt, nvr, nvb, nvl, nrarity, nelem]]}} ->
                        ai_pos = Enum.random(empty_spots)
                        ai_card = %{
                          "cardId" => nid,
                          "name" => nname,
                          "icon" => nicon || "🎴",
                          "owner" => "npc",
                          "value_top" => nvt,
                          "value_right" => nvr,
                          "value_bottom" => nvb,
                          "value_left" => nvl,
                          "rarity" => nrarity,
                          "element" => nelem
                        }
                        b2 = List.replace_at(board, ai_pos, ai_card)
                        execute_flips(b2, ai_card, ai_pos, "npc")
                      _ -> {board, []}
                    end
                  else
                    {board, []}
                  end

                  # Check match completion
                  is_full = Enum.all?(board, fn c -> c != nil end)
                  player_count = Enum.count(board, fn c -> c && c["owner"] == "player" end)
                  npc_count = Enum.count(board, fn c -> c && c["owner"] == "npc" end)

                  {status, reward_card} = if is_full do
                    if player_count > npc_count do
                      # Victor card drop
                      reward = case Repo.query("SELECT id, name, icon, rarity FROM game_cards WHERE is_active=1 ORDER BY RAND() LIMIT 1") do
                        {:ok, %{rows: [[rid, rname, ricon, rrarity]]}} ->
                          Repo.query(
                            "INSERT INTO character_cards (character_id, card_id, quantity, obtained_from) VALUES (?, ?, 1, 'card_game_win') ON DUPLICATE KEY UPDATE quantity=quantity+1",
                            [char_id, rid]
                          )
                          %{id: rid, name: rname, icon: ricon, rarity: rrarity}
                        _ -> nil
                      end
                      {"completed", reward}
                    else
                      {"completed", nil}
                    end
                  else
                    {"active", nil}
                  end

                  Repo.query!("UPDATE game_card_matches SET board_json=?, status=? WHERE id=?", [Jason.encode!(board), status, match_id])

                  push(socket, "card_game_update", %{
                    matchId: match_id,
                    board: board,
                    flipped: player_flipped ++ ai_flipped,
                    status: status,
                    playerScore: player_count,
                    npcScore: npc_count,
                    rewardCard: reward_card
                  })

                _ -> push(socket, "card_result", %{success: false, message: "Card not found."})
              end
            end

          _ -> nil
        end
      rescue
        e -> push(socket, "card_result", %{success: false, message: Exception.message(e)})
      end

      {:noreply, socket}
    end
  end

  # ── Gathering ────────────────────────────────────────────────────

  def handle("gather", %{"x" => x, "y" => y}, socket) do
    char_id = get_char_id(socket)
    p = PlayerRegistry.get(char_id)
    if is_nil(p), do: {:noreply, socket}

    try do
      case Repo.query(
        "SELECT n.*, s.name AS skill_name FROM game_gathering_nodes n JOIN game_gathering_skills s ON n.skill_id=s.id WHERE n.map_id=? AND n.x=? AND n.y=? AND n.is_active=1",
        [p.map_id, x, y]
      ) do
        {:ok, %{rows: [row], columns: cols}} ->
          node = Enum.zip(cols, row) |> Map.new()

          # Check skill level
          {level, xp} = case Repo.query("SELECT level, xp FROM character_gathering_levels WHERE character_id=? AND skill_id=?", [char_id, node["skill_id"]]) do
            {:ok, %{rows: [[l, x]]}} -> {l || 1, x || 0}
            _ -> {1, 0}
          end

          if level < (node["min_level"] || 1) do
            push(socket, "gather_result", %{success: false, message: "Need #{node["skill_name"]} level #{node["min_level"]}."})
          else
            # Check tool
            has_tool = if node["tool_item_id"] do
              case Repo.query("SELECT quantity FROM character_items WHERE character_id=? AND item_id=?", [char_id, node["tool_item_id"]]) do
                {:ok, %{rows: [[q]]}} when q >= 1 -> true
                _ -> false
              end
            else
              true
            end

            if not has_tool do
              push(socket, "gather_result", %{success: false, message: "You need the right tool."})
            else
              # Roll yield table
              yields = parse_json(node["yield_table"], [])
              gathered = Enum.reduce(yields, [], fn y_entry, acc ->
                if :rand.uniform(100) <= (y_entry["chance"] || 50) do
                  qty = y_entry["qty"] || 1
                  Repo.query("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+?",
                    [char_id, y_entry["item_id"], qty, qty])
                  acc ++ [%{item_id: y_entry["item_id"], qty: qty, name: y_entry["name"] || "Item"}]
                else
                  acc
                end
              end)

              # Grant XP
              xp_gain = node["xp_reward"] || 10
              Repo.query!(
                "INSERT INTO character_gathering_levels (character_id, skill_id, level, xp, total_gathered) VALUES (?,?,1,?,1) ON DUPLICATE KEY UPDATE xp=xp+?, total_gathered=total_gathered+1",
                [char_id, node["skill_id"], xp_gain, xp_gain]
              )

              # Level up check
              xp_needed = 100 * level
              if xp + xp_gain >= xp_needed do
                Repo.query("UPDATE character_gathering_levels SET level=level+1, xp=xp-? WHERE character_id=? AND skill_id=?",
                  [xp_needed, char_id, node["skill_id"]])
                push(socket, "notification", %{type: "success", text: "#{node["skill_name"]} leveled up to #{level + 1}!"})
              end

              push(socket, "gather_result", %{success: true, gathered: gathered, xp: xp_gain, skill: node["skill_name"]})
            end
          end

        _ -> push(socket, "gather_result", %{success: false, message: "Nothing to gather here."})
      end
    rescue
      e -> push(socket, "gather_result", %{success: false, message: Exception.message(e)})
    end

    {:noreply, socket}
  end

  # ── Bounty Accept ────────────────────────────────────────────────

  def handle("bounty_accept", %{"bountyId" => bounty_id}, socket) do
    char_id = get_char_id(socket)

    result = try do
      case Repo.query("SELECT name, reward_gold, reward_xp FROM game_bounty_tasks WHERE id=? AND is_active=1", [bounty_id]) do
        {:ok, %{rows: [[name, _gold, _xp]]}} ->
          Repo.query!("INSERT INTO character_bounties (character_id, bounty_id, status) VALUES (?,?,'active') ON DUPLICATE KEY UPDATE status='active', accepted_at=NOW()",
            [char_id, bounty_id])
          %{success: true, message: "Accepted bounty: #{name}"}
        _ -> %{success: false, message: "Bounty not found."}
      end
    rescue
      e -> %{success: false, message: Exception.message(e)}
    end

    push(socket, "bounty_result", result)
    {:noreply, socket}
  end

  def handle(_, _, socket), do: {:noreply, socket}

  # ── Private ─────────────────────────────────────────────────────

  defp get_char_id(socket) do
    socket.assigns[:char_id] ||
      case Repo.query("SELECT id FROM characters WHERE user_id=? LIMIT 1", [socket.assigns.user_id]) do
        {:ok, %{rows: [[id]]}} -> id
        _ -> nil
      end
  end

  defp fetch_character_cards(char_id) do
    case Repo.query(
      """
      SELECT cc.card_id, cc.quantity, gc.name, gc.icon, gc.description, gc.rarity,
             gc.value_top, gc.value_right, gc.value_bottom, gc.value_left, gc.element
        FROM character_cards cc
        JOIN game_cards gc ON cc.card_id = gc.id
       WHERE cc.character_id = ?
       ORDER BY gc.rarity DESC, gc.id ASC
      """,
      [char_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn r -> Enum.zip(cols, r) |> Map.new() end)
      _ -> []
    end
  end

  defp ensure_starter_cards(char_id) do
    case Repo.query("SELECT COUNT(*) FROM character_cards WHERE character_id = ?", [char_id]) do
      {:ok, %{rows: [[0]]}} ->
        case Repo.query("SELECT id FROM game_cards WHERE is_active=1 ORDER BY id ASC LIMIT 5") do
          {:ok, %{rows: starter_ids}} ->
            Enum.each(starter_ids, fn [cid] ->
              Repo.query(
                "INSERT IGNORE INTO character_cards (character_id, card_id, quantity, obtained_from) VALUES (?, ?, 1, 'starter_deck')",
                [char_id, cid]
              )
            end)
          _ -> :ok
        end
      _ -> :ok
    end
  end

  defp execute_flips(board, card, position, owner) do
    size = 3
    px = rem(position, size)
    py = div(position, size)

    adjacent = [
      %{dx: 0, dy: -1, atk: "value_top", def: "value_bottom"},
      %{dx: 1, dy: 0, atk: "value_right", def: "value_left"},
      %{dx: 0, dy: 1, atk: "value_bottom", def: "value_top"},
      %{dx: -1, dy: 0, atk: "value_left", def: "value_right"}
    ]

    Enum.reduce(adjacent, {board, []}, fn adj, {b, f} ->
      nx = px + adj.dx
      ny = py + adj.dy
      if nx >= 0 and nx < size and ny >= 0 and ny < size do
        ni = ny * size + nx
        neighbor = Enum.at(b, ni)
        if neighbor && neighbor["owner"] != owner do
          if (card[adj.atk] || 0) > (neighbor[adj.def] || 0) do
            updated = Map.put(neighbor, "owner", owner)
            {List.replace_at(b, ni, updated), [ni | f]}
          else
            {b, f}
          end
        else
          {b, f}
        end
      else
        {b, f}
      end
    end)
  end

  defp parse_json(nil, d), do: d
  defp parse_json("", d), do: d
  defp parse_json(v, d) when is_binary(v) do
    case Jason.decode(v) do
      {:ok, p} -> p
      _ -> d
    end
  end
  defp parse_json(v, _) when is_map(v) or is_list(v), do: v
  defp parse_json(_, d), do: d
end
