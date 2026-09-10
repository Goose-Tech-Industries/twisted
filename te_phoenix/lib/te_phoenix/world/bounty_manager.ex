defmodule TePhoenix.World.BountyManager do
  @moduledoc """
  Lowtown Underworld Bounty Board & Black Market Fence Syndicate (*Bord Bountaí & Margadh Dubh*).

  Provides:
    * **Dynamic Bounty Boards**:
      - "Lowtown Syndicate Board" (Shadows, cutpurses, and illicit hits)
      - "Iron Watch High Magistrate Board" (Escaped convicts, wanted bandits, cultists)
    * **Dead or Alive Contracts**:
      - "Wanted Alive": Requires non-lethal knockout (blunt strike, chloroform, or sleeping gas)
      - "Wanted Dead": High lethality target elimination
    * **The Shadow Fence & Contraband Market**:
      - Fencing crime scene loot and stolen contraband for clean coin
      - Purchasing covert underworld tools (skeleton keys, knockout vials, skunkweed gas, forged papers)
  """

  alias TePhoenix.Repo
  require Logger

  @doc """
  Ensures tables for bounty boards, tasks, character bounties, and contraband inventory exist.
  """
  def ensure_schema! do
    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_bounty_boards (
      id INT AUTO_INCREMENT PRIMARY KEY,
      board_key VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(128) NOT NULL,
      location_name VARCHAR(128) NOT NULL DEFAULT 'Lowtown Alleyway',
      faction VARCHAR(64) NOT NULL DEFAULT 'syndicate',
      description TEXT,
      map_id INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """)

    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_bounty_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      board_id INT NOT NULL,
      target_npc_id INT NULL,
      target_name VARCHAR(128) NOT NULL,
      target_icon VARCHAR(16) NOT NULL DEFAULT '🎯',
      contract_type VARCHAR(32) NOT NULL DEFAULT 'dead_or_alive',
      difficulty VARCHAR(32) NOT NULL DEFAULT 'medium',
      crime_desc TEXT NOT NULL,
      location_hint VARCHAR(128) NOT NULL DEFAULT 'Old Town Quarters',
      reward_gold INT NOT NULL DEFAULT 150,
      reward_xp INT NOT NULL DEFAULT 300,
      reward_rep INT NOT NULL DEFAULT 25,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_board (board_id),
      INDEX idx_active (is_active)
    )
    """)

    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_character_bounties (
      id INT AUTO_INCREMENT PRIMARY KEY,
      char_id INT NOT NULL,
      task_id INT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'accepted',
      capture_method VARCHAR(32) NULL,
      accepted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL,
      INDEX idx_char_task (char_id, task_id)
    )
    """)

    :ok
  end

  @doc """
  Seeds default bounty boards and default high-value criminal contracts.
  """
  def seed_default_bounties! do
    ensure_schema!()

    # 1. Seed Boards
    boards = [
      %{
        board_key: "syndicate_board",
        name: "Lowtown Syndicate Shadow Notice",
        location_name: "The Prancing Mare Cellar",
        faction: "syndicate",
        description: "Unofficial contracts posted in blood and cipher by the Underworld Council.",
        map_id: 1
      },
      %{
        board_key: "iron_watch_board",
        name: "Iron Watch Magistrate Warrants",
        location_name: "Town Gate Barracks",
        faction: "city_watch",
        description: "Official wanted posters sanctioned by Captain Vane and the Magistrate.",
        map_id: 1
      }
    ]

    Enum.each(boards, fn b ->
      case Repo.query("SELECT id FROM game_bounty_boards WHERE board_key = ? LIMIT 1", [b.board_key]) do
        {:ok, %{rows: []}} ->
          Repo.query(
            "INSERT INTO game_bounty_boards (board_key, name, location_name, faction, description, map_id) VALUES (?, ?, ?, ?, ?, ?)",
            [b.board_key, b.name, b.location_name, b.faction, b.description, b.map_id]
          )
        _ -> :ok
      end
    end)

    # 2. Get Board IDs
    syndicate_id = case Repo.query("SELECT id FROM game_bounty_boards WHERE board_key = 'syndicate_board' LIMIT 1") do
      {:ok, %{rows: [[id]]}} -> id
      _ -> 1
    end

    watch_id = case Repo.query("SELECT id FROM game_bounty_boards WHERE board_key = 'iron_watch_board' LIMIT 1") do
      {:ok, %{rows: [[id]]}} -> id
      _ -> 2
    end

    # 3. Seed Bounty Tasks
    tasks = [
      %{
        board_id: syndicate_id,
        target_name: "Silas the Shadow Fence",
        target_icon: "🗡️",
        contract_type: "wanted_alive",
        difficulty: "hard",
        crime_desc: "Embezzled five crates of smuggled Valyrian fire tincture. Bring him in breathing for syndicate questioning.",
        location_hint: "South Alley Cellar behind the tavern",
        reward_gold: 320,
        reward_xp: 500,
        reward_rep: 40
      },
      %{
        board_id: syndicate_id,
        target_name: "Grendel the Shadow Prowler",
        target_icon: "👤",
        contract_type: "dead_or_alive",
        difficulty: "expert",
        crime_desc: "Double-crossed the thieves' ring and marked three scouts for assassination.",
        location_hint: "Rooftops and abandoned watchtowers",
        reward_gold: 450,
        reward_xp: 750,
        reward_rep: 60
      },
      %{
        board_id: watch_id,
        target_name: "Malakor the Ashveil Cultist",
        target_icon: "💀",
        contract_type: "wanted_dead",
        difficulty: "lethal",
        crime_desc: "Sacrificing stray guards at the Cathedral alter to summon the Ashveil Colossus.",
        location_hint: "Sunken crypts beneath the Old Cathedral",
        reward_gold: 600,
        reward_xp: 1200,
        reward_rep: 80
      },
      %{
        board_id: watch_id,
        target_name: "Rival Cutpurse Guildmaster",
        target_icon: "🧤",
        contract_type: "wanted_alive",
        difficulty: "medium",
        crime_desc: "Pickpocketed the High Inquisitor's seal of office. Retrieve the seal and bring the thief in irons.",
        location_hint: "Crowded market square near Barnaby's stall",
        reward_gold: 220,
        reward_xp: 350,
        reward_rep: 30
      }
    ]

    Enum.each(tasks, fn t ->
      case Repo.query("SELECT id FROM game_bounty_tasks WHERE board_id = ? AND target_name = ? LIMIT 1", [t.board_id, t.target_name]) do
        {:ok, %{rows: []}} ->
          Repo.query(
            """
            INSERT INTO game_bounty_tasks
            (board_id, target_name, target_icon, contract_type, difficulty, crime_desc, location_hint, reward_gold, reward_xp, reward_rep, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            [t.board_id, t.target_name, t.target_icon, t.contract_type, t.difficulty, t.crime_desc, t.location_hint, t.reward_gold, t.reward_xp, t.reward_rep]
          )
        _ -> :ok
      end
    end)

    :ok
  end

  @doc """
  Lists all active bounty boards with their contracts.
  """
  def list_boards_with_tasks(char_id \\ nil) do
    ensure_schema!()

    boards = case Repo.query("SELECT id, board_key, name, location_name, faction, description, map_id FROM game_bounty_boards ORDER BY id ASC") do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn r -> Enum.zip(cols, r) |> Map.new() end)
      _ -> []
    end

    tasks = case Repo.query("""
      SELECT bt.id, bt.board_id, bt.target_name, bt.target_icon, bt.contract_type,
             bt.difficulty, bt.crime_desc, bt.location_hint, bt.reward_gold, bt.reward_xp,
             bt.reward_rep, bt.is_active, bb.name as board_name
      FROM game_bounty_tasks bt
      JOIN game_bounty_boards bb ON bb.id = bt.board_id
      WHERE bt.is_active = 1
      ORDER BY bt.reward_gold DESC
    """) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn r -> Enum.zip(cols, r) |> Map.new() end)
      _ -> []
    end

    # If char_id provided, annotate with claimed status
    claimed_ids = if char_id do
      case Repo.query("SELECT task_id, status FROM game_character_bounties WHERE char_id = ?", [char_id]) do
        {:ok, %{rows: rows}} -> Map.new(rows, fn [t_id, status] -> {t_id, status} end)
        _ -> %{}
      end
    else
      %{}
    end

    annotated_tasks = Enum.map(tasks, fn t ->
      status = Map.get(claimed_ids, t["id"], "unclaimed")
      Map.put(t, "claim_status", status)
    end)

    %{boards: boards, tasks: annotated_tasks}
  end

  @doc """
  Accepts a bounty contract for a character.
  """
  def accept_bounty(char_id, task_id) do
    ensure_schema!()

    case Repo.query("SELECT id, target_name, contract_type, reward_gold FROM game_bounty_tasks WHERE id = ? AND is_active = 1 LIMIT 1", [task_id]) do
      {:ok, %{rows: [[id, target_name, contract_type, gold]]}} ->
        case Repo.query("SELECT id, status FROM game_character_bounties WHERE char_id = ? AND task_id = ? LIMIT 1", [char_id, id]) do
          {:ok, %{rows: [[_, "accepted"]]}} ->
            {:error, "You have already accepted the bounty contract for #{target_name}."}

          {:ok, %{rows: [[_, "completed"]]}} ->
            {:error, "You have already completed the bounty contract for #{target_name}."}

          _ ->
            Repo.query(
              "INSERT INTO game_character_bounties (char_id, task_id, status, accepted_at) VALUES (?, ?, 'accepted', NOW())",
              [char_id, id]
            )

            {:ok, %{
              success: true,
              task_id: id,
              target_name: target_name,
              contract_type: contract_type,
              reward_gold: gold,
              message: "Bounty accepted: Hunt down #{target_name} (#{contract_type}) for #{gold} gold!"
            }}
        end

      _ ->
        {:error, "Bounty contract not found or already expired."}
    end
  end

  @doc """
  Turns in a bounty contract.
  Validates capture method:
    * "alive" / "knockout" / "sleeping_gas" satisfies `wanted_alive` and `dead_or_alive`.
    * "executed" / "dead" satisfies `wanted_dead` and `dead_or_alive`.
    * If `wanted_alive` is turned in "dead", reward is penalized 60%!
  """
  def turn_in_bounty(player, task_id, capture_method \\ "alive") do
    ensure_schema!()
    char_id = player[:id] || player["id"]

    case Repo.query("""
      SELECT cb.id, bt.id, bt.target_name, bt.contract_type, bt.reward_gold, bt.reward_xp, bt.reward_rep
      FROM game_character_bounties cb
      JOIN game_bounty_tasks bt ON bt.id = cb.task_id
      WHERE cb.char_id = ? AND cb.task_id = ? AND cb.status = 'accepted'
      LIMIT 1
    """, [char_id, task_id]) do
      {:ok, %{rows: [[cb_id, t_id, target_name, contract_type, gold, xp, rep]]}} ->
        # Calculate penalty or bonus based on contract requirements
        is_subdual = capture_method in ["alive", "knockout", "sleeping_gas", "chloroform"]

        {final_gold, final_xp, msg_suffix} = cond do
          contract_type == "wanted_alive" and not is_subdual ->
            penalized_gold = round(gold * 0.4)
            penalized_xp = round(xp * 0.5)
            {penalized_gold, penalized_xp, " (PENALTY: Target was wanted ALIVE for interrogation! Reward cut by 60%.)"}

          contract_type == "wanted_alive" and is_subdual ->
            bonus_gold = round(gold * 1.15)
            {bonus_gold, xp, " (BONUS: Delivered pristine and unharmed for interrogation!)"}

          true ->
            {gold, xp, ""}
        end

        # Award gold and XP
        award_player_gold(char_id, final_gold)
        award_player_xp(char_id, final_xp)

        # Mark completed
        Repo.query(
          "UPDATE game_character_bounties SET status = 'completed', capture_method = ?, completed_at = NOW() WHERE id = ?",
          [capture_method, cb_id]
        )

        {:ok, %{
          success: true,
          task_id: t_id,
          target_name: target_name,
          gold_awarded: final_gold,
          xp_awarded: final_xp,
          rep_awarded: rep,
          capture_method: capture_method,
          message: "Contract Fulfilled! Delivered #{target_name} (#{capture_method}). Awarded #{final_gold} gold and #{final_xp} XP!#{msg_suffix}"
        }}

      _ ->
        {:error, "No active accepted contract found for this bounty."}
    end
  end

  @doc """
  Fences stolen goods or forensic crime scene evidence to Silas the Shadow Fence for clean gold.
  """
  def fence_sell_loot(player, loot_type, quantity \\ 1) do
    char_id = player[:id] || player["id"]

    loot_values = %{
      "bloodstained_dagger" => 65,
      "stolen_gold_watch" => 120,
      "forged_city_seal" => 180,
      "poison_vial" => 50,
      "shadow_coin" => 40,
      "forensic_fiber" => 35,
      "contraband_valyrian_tincture" => 250
    }

    price_per = Map.get(loot_values, loot_type, 30)
    total_gold = price_per * max(1, quantity)

    award_player_gold(char_id, total_gold)

    {:ok, %{
      success: true,
      loot_type: loot_type,
      quantity: quantity,
      gold_earned: total_gold,
      message: "Silas inspected the #{loot_type} with a sly grin, slipping #{total_gold} clean gold pieces into your palm."
    }}
  end

  @doc """
  Purchases black market underworld gear from the fence.
  """
  def fence_buy_contraband(player, item_type) do
    char_id = player[:id] || player["id"]

    items = %{
      "skeleton_key" => %{cost: 50, name: "Masterwork Skeleton Key", desc: "Opens low-tier locked chests and safehouse doors without breaking."},
      "chloroform_knockout_vial" => %{cost: 45, name: "Chloroform Knockout Vial", desc: "Instant silent subdual weapon for Wanted Alive bounties."},
      "skunkweed_tear_gas" => %{cost: 40, name: "Skunkweed Tear Gas", desc: "Blinds all occupants in an interior room through open windows."},
      "forged_identity_papers" => %{cost: 120, name: "Forged Identity Papers", desc: "Wipes criminal infamy and clears City Watch wanted level."}
    }

    case Map.get(items, item_type) do
      nil -> {:error, "Unknown black market contraband."}
      item ->
        gold = get_player_gold(player)
        if gold < item.cost do
          {:error, "Insufficient gold: #{item.name} costs #{item.cost}g (you have #{gold}g)."}
        else
          deduct_player_gold(char_id, item.cost)

          {:ok, %{
            success: true,
            item_type: item_type,
            name: item.name,
            cost: item.cost,
            message: "Purchased #{item.name} from Silas for #{item.cost} gold. Use it wisely in the shadows."
          }}
        end
    end
  end

  # --- Internal Helpers ---

  defp get_player_gold(player) do
    char_id = player[:id] || player["id"]
    case Repo.query("SELECT gold FROM characters WHERE id = ? LIMIT 1", [char_id]) do
      {:ok, %{rows: [[gold]]}} -> gold || 0
      _ -> player[:gold] || player["gold"] || 0
    end
  end

  defp deduct_player_gold(char_id, amount) do
    Repo.query("UPDATE characters SET gold = GREATEST(0, gold - ?) WHERE id = ?", [amount, char_id])
  end

  defp award_player_gold(char_id, amount) do
    Repo.query("UPDATE characters SET gold = gold + ? WHERE id = ?", [amount, char_id])
  end

  defp award_player_xp(char_id, amount) do
    Repo.query("UPDATE characters SET experience = experience + ? WHERE id = ?", [amount, char_id])
  end
end
