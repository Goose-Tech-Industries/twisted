defmodule TePhoenix.World.BountyAndScheduleTest do
  use ExUnit.Case, async: false

  alias TePhoenix.Repo
  alias TePhoenix.World.{BountyManager, NpcSchedules, PropertyManager}

  setup do
    :ok = Ecto.Adapters.SQL.Sandbox.checkout(Repo)
    Ecto.Adapters.SQL.Sandbox.mode(Repo, {:shared, self()})

    BountyManager.ensure_schema!()
    NpcSchedules.ensure_schema!()
    PropertyManager.ensure_schema!()

    try do
      Repo.query("DELETE FROM game_character_bounties")
      Repo.query("DELETE FROM game_bounty_tasks")
      Repo.query("DELETE FROM game_bounty_boards")
      Repo.query("DELETE FROM game_property_stashes")
      Repo.query("DELETE FROM game_property_trophies")
      Repo.query("DELETE FROM game_properties")
    rescue
      _ -> :ok
    end

    Repo.query("""
    INSERT INTO characters (id, name, level, current_hp, max_hp, current_mp, max_mp, gold, experience, map_id, x, y)
    VALUES (1, 'TestHero', 1, 100, 100, 50, 50, 500, 0, 1, 6, 12)
    ON DUPLICATE KEY UPDATE gold = 500, current_hp = 100, map_id = 1, experience = 0
    """)

    BountyManager.seed_default_bounties!()
    NpcSchedules.seed_default_schedules!(1)
    PropertyManager.seed_default_properties!(1)

    :ok
  end

  describe "Lowtown Bounty Board & Syndicate Contracts" do
    test "lists seeded bounty boards and tasks" do
      result = BountyManager.list_boards_with_tasks(1)
      assert length(result.boards) >= 2
      assert length(result.tasks) >= 4

      silas_task = Enum.find(result.tasks, &(&1["target_name"] == "Silas the Shadow Fence"))
      assert silas_task != nil
      assert silas_task["contract_type"] == "wanted_alive"
      assert silas_task["reward_gold"] == 320
    end

    test "accepts a bounty contract and prevents duplicates" do
      result = BountyManager.list_boards_with_tasks(1)
      task = hd(result.tasks)

      assert {:ok, res} = BountyManager.accept_bounty(1, task["id"])
      assert res.success == true
      assert res.task_id == task["id"]

      # Duplicate acceptance should fail
      assert {:error, msg} = BountyManager.accept_bounty(1, task["id"])
      assert msg =~ "already accepted"
    end

    test "turns in wanted_alive contract with subdual bonus" do
      result = BountyManager.list_boards_with_tasks(1)
      alive_task = Enum.find(result.tasks, &(&1["contract_type"] == "wanted_alive"))
      assert alive_task != nil

      {:ok, _} = BountyManager.accept_bounty(1, alive_task["id"])

      player = %{id: 1, name: "TestHero", gold: 500}
      assert {:ok, res} = BountyManager.turn_in_bounty(player, alive_task["id"], "sleeping_gas")
      assert res.success == true
      assert res.gold_awarded > alive_task["reward_gold"] # Subdual bonus!
      assert res.message =~ "Delivered pristine"
    end

    test "penalizes wanted_alive contract if target was killed" do
      result = BountyManager.list_boards_with_tasks(1)
      alive_task = Enum.find(result.tasks, &(&1["contract_type"] == "wanted_alive"))
      assert alive_task != nil

      {:ok, _} = BountyManager.accept_bounty(1, alive_task["id"])

      player = %{id: 1, name: "TestHero", gold: 500}
      assert {:ok, res} = BountyManager.turn_in_bounty(player, alive_task["id"], "executed")
      assert res.success == true
      assert res.gold_awarded < alive_task["reward_gold"] # 60% penalty
      assert res.message =~ "PENALTY"
    end

    test "fences crime scene contraband for clean gold" do
      player = %{id: 1, name: "TestHero", gold: 100}
      assert {:ok, res} = BountyManager.fence_sell_loot(player, "bloodstained_dagger", 2)
      assert res.success == true
      assert res.gold_earned == 130
      assert res.message =~ "Silas inspected"
    end

    test "purchases black market contraband from fence" do
      player = %{id: 1, name: "TestHero", gold: 200}
      assert {:ok, res} = BountyManager.fence_buy_contraband(player, "skeleton_key")
      assert res.success == true
      assert res.cost == 50
      assert res.item_type == "skeleton_key"
    end
  end

  describe "Autonomous NPC Living Schedules" do
    test "applies circadian schedules and updates NPC positions & activities" do
      # Seed an NPC in DB if not present
      Repo.query("""
      INSERT INTO game_npcs (id, name, role, map_id, x, y, is_active)
      VALUES (901, 'Barnaby the Quartermaster', 'merchant', 1, 1, 1, 1)
      ON DUPLICATE KEY UPDATE x = 1, y = 1
      """)

      assert {:ok, updates} = NpcSchedules.apply_schedules_for_phase(1, "dusk")
      assert length(updates) >= 1

      barnaby = Enum.find(updates, &(&1.npc_name == "Barnaby the Quartermaster"))
      assert barnaby != nil
      assert barnaby.x == 22
      assert barnaby.y == 18
      assert barnaby.activity =~ "tankard of stout"

      # Check DB reflects updated coords and activity
      case Repo.query("SELECT x, y, current_activity FROM game_npcs WHERE name = 'Barnaby the Quartermaster' LIMIT 1") do
        {:ok, %{rows: [[x, y, act]]}} ->
          assert x == 22
          assert y == 18
          assert act =~ "tankard"
        _ -> flunk("Barnaby coordinates not updated in DB")
      end
    end

    test "lists active schedules for map" do
      schedules = NpcSchedules.list_active_schedules(1)
      assert is_list(schedules)
    end
  end

  describe "Safehouse Stash Vault, Trophy Wall & Deed Economy" do
    test "purchases property and manages gold stash vault" do
      player = %{id: 1, name: "TestHero", gold: 500, map_id: 1}
      props = PropertyManager.list_properties(1)
      prop = hd(props)

      # Purchase deed
      assert {:ok, p_res} = PropertyManager.purchase_property(player, prop.id)
      assert p_res.success == true

      # Deposit gold into vault
      assert {:ok, dep_res} = PropertyManager.deposit_stash_gold(player, prop.id, 100)
      assert dep_res.deposited_gold == 100
      assert dep_res.new_stash_gold == 100

      # Withdraw gold from vault
      assert {:ok, w_res} = PropertyManager.withdraw_stash_gold(player, prop.id, 40)
      assert w_res.withdrawn_gold == 40
      assert w_res.new_stash_gold == 60
    end

    test "deposits and withdraws items from safehouse stash" do
      player = %{id: 1, name: "TestHero", gold: 500, map_id: 1}
      props = PropertyManager.list_properties(1)
      prop = hd(props)
      {:ok, _} = PropertyManager.purchase_property(player, prop.id)

      # Deposit item
      assert {:ok, dep_item} = PropertyManager.deposit_stash_item(player, prop.id, "skeleton_key", "Masterwork Skeleton Key", 3)
      assert dep_item.success == true

      # View stash
      assert {:ok, stash} = PropertyManager.get_safehouse_stash(player, prop.id)
      assert length(stash.items) == 1
      stored_item = hd(stash.items)
      assert stored_item.item_key == "skeleton_key"
      assert stored_item.quantity == 3

      # Withdraw item
      assert {:ok, w_item} = PropertyManager.withdraw_stash_item(player, prop.id, stored_item.id)
      assert w_item.success == true
      assert w_item.quantity == 3
    end

    test "mounts and displays wall trophies with sanctuary passive buffs" do
      player = %{id: 1, name: "TestHero", gold: 500, map_id: 1}
      props = PropertyManager.list_properties(1)
      prop = hd(props)
      {:ok, _} = PropertyManager.purchase_property(player, prop.id)

      # Mount Colossus skull
      assert {:ok, t_res} = PropertyManager.mount_trophy(player, prop.id, "colossus_skull")
      assert t_res.success == true
      assert t_res.buff_type == "defense_bonus"
      assert t_res.buff_value == 15

      # List trophies
      trophies = PropertyManager.list_trophies(player, prop.id)
      assert length(trophies) == 1
      assert hd(trophies)["trophy_key"] == "colossus_skull"

      # Remove trophy
      trophy_id = hd(trophies)["id"]
      assert {:ok, rm_res} = PropertyManager.remove_trophy(player, prop.id, trophy_id)
      assert rm_res.success == true
      assert PropertyManager.list_trophies(player, prop.id) == []
    end

    test "assigns companion NPC to guard safehouse" do
      player = %{id: 1, name: "TestHero", gold: 500, map_id: 1}
      props = PropertyManager.list_properties(1)
      prop = hd(props)
      {:ok, _} = PropertyManager.purchase_property(player, prop.id)

      assert {:ok, g_res} = PropertyManager.assign_guard_companion(player, prop.id, 42, "Valeria the Shieldmaiden")
      assert g_res.success == true
      assert g_res.guard_companion_name == "Valeria the Shieldmaiden"
    end
  end
end
