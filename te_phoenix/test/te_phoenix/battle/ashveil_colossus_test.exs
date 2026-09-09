defmodule TePhoenix.Battle.AshveilColossusTest do
  use ExUnit.Case, async: false

  alias TePhoenix.Repo
  alias TePhoenix.Battle.AshveilColossus

  setup do
    :ok = Ecto.Adapters.SQL.Sandbox.checkout(Repo)
    Ecto.Adapters.SQL.Sandbox.mode(Repo, {:shared, self()})

    AshveilColossus.ensure_schema!()

    try do
      Repo.query("DELETE FROM game_colossus_raids")
    rescue
      _ -> :ok
    end

    Repo.query("""
    INSERT INTO characters (id, name, level, current_hp, max_hp, current_mp, max_mp, gold, xp, map_id, x, y)
    VALUES (1, 'TestHero', 1, 100, 100, 50, 50, 500, 0, 1, 6, 12)
    ON DUPLICATE KEY UPDATE gold = 500, current_hp = 100, map_id = 1, xp = 0
    """)

    :ok
  end

  describe "Ashveil Colossus Apex Raid & Multi-Limb Engine" do
    test "spawns or retrieves active raid instance with default limbs" do
      raid = AshveilColossus.get_or_spawn_raid(1)
      assert raid.status == "active"
      assert raid.boss_hp == 5000
      assert raid.phase == 1
      assert raid.limbs["head"]["hp"] == 800
      assert raid.limbs["core"]["hp"] == 2000
      assert raid.limbs["left_arm"]["hp"] == 600
    end

    test "strikes specific limb and triggers limb destruction" do
      raid = AshveilColossus.get_or_spawn_raid(1)
      player = %{id: 1, name: "TestHero"}

      # Deal 300 damage to left arm
      assert {:ok, res} = AshveilColossus.strike_limb(raid.id, player, "left_arm", 300)
      assert res.success == true
      assert res.limb_name == "left_arm"
      assert res.damage_dealt == 300
      assert res.limb_broken == false

      # Deal remaining 300 damage to shatter left arm
      assert {:ok, break_res} = AshveilColossus.strike_limb(raid.id, player, "left_arm", 300)
      assert break_res.limb_broken == true
      assert break_res.message =~ "LIMB SHATTERED"
    end

    test "triggers phase transitions as HP drops" do
      raid = AshveilColossus.get_or_spawn_raid(1)
      player = %{id: 1, name: "TestHero"}

      # Drop boss HP below 70% (3500 HP) -> Phase 2 Molten Core Enrage
      # Deal 1600 damage to Core
      assert {:ok, p2_res} = AshveilColossus.strike_limb(raid.id, player, "core", 1600)
      assert p2_res.phase == 2
      assert p2_res.message =~ "PHASE SHIFT"
    end

    test "telegraphs heavy attack and resolves Planet Mado Active Defense" do
      raid = AshveilColossus.get_or_spawn_raid(1)
      player = %{id: 1, name: "TestHero"}

      # Boss telegraphs overhead slam
      assert {:ok, telegraph} = AshveilColossus.trigger_telegraph(raid.id, "overhead_slam")
      assert telegraph.attack_type == "overhead_slam"
      assert telegraph.damage == 220

      # Player reacts with Perfect Parry (timing <= 150ms)
      assert {:ok, parry_res} = AshveilColossus.react_active_defense(player, raid.id, "parry", 90)
      assert parry_res.success == true
      assert parry_res.action == "perfect_parry"
      assert parry_res.damage_taken == 0
      assert parry_res.staggered_boss == true
      assert parry_res.message =~ "PERFECT PARRY"

      # Trigger another telegraph for mistimed defense
      {:ok, _} = AshveilColossus.trigger_telegraph(raid.id, "overhead_slam")
      assert {:ok, fail_res} = AshveilColossus.react_active_defense(player, raid.id, "parry", 450)
      assert fail_res.damage_taken > 0
    end

    test "claims raid rewards when Colossus is defeated" do
      raid = AshveilColossus.get_or_spawn_raid(1)
      player = %{id: 1, name: "TestHero"}

      # Defeating Colossus
      Repo.query!("UPDATE game_colossus_raids SET boss_hp = 0, status = 'defeated' WHERE id = ?", [raid.id])

      assert {:ok, loot} = AshveilColossus.claim_raid_loot(player, raid.id)
      assert loot.success == true
      assert loot.gold_awarded == 500
      assert loot.xp_awarded == 1200
      assert loot.trophy_item == "colossus_skull"
      assert loot.message =~ "Skull of the Ashveil Colossus"
    end
  end
end
