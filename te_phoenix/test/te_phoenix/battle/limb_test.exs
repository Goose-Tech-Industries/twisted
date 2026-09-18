defmodule TePhoenix.Battle.LimbTest do
  use ExUnit.Case, async: true

  alias TePhoenix.Battle.Limb

  describe "Limb.limbs/0 and initialization" do
    test "1. returns list of all six anatomical combat limbs" do
      limbs = Limb.limbs()
      assert length(limbs) == 6
      assert :head in limbs
      assert :torso in limbs
      assert :l_arm in limbs
      assert :r_arm in limbs
      assert :l_leg in limbs
      assert :r_leg in limbs
    end

    test "2. init/1 calculates correct HP proportion for 100 max HP" do
      hp_map = Limb.init(100)
      assert hp_map.head == 20
      assert hp_map.torso == 35
      assert hp_map.l_arm == 10
      assert hp_map.r_arm == 10
      assert hp_map.l_leg == 13
      assert hp_map.r_leg == 13
    end

    test "3. init/1 scales proportionally for higher max HP" do
      hp_map = Limb.init(1000)
      assert hp_map.head == 200
      assert hp_map.torso == 350
      assert hp_map.l_arm == 100
      assert hp_map.r_arm == 100
      assert hp_map.l_leg == 125
      assert hp_map.r_leg == 125
    end

    test "4. init/1 falls back to 100 max HP when given invalid or non-integer input" do
      hp_map = Limb.init(nil)
      assert hp_map == Limb.init(100)
    end

    test "5. max_for/2 returns correct limb max value for each limb type" do
      assert Limb.max_for(:head, 200) == 40
      assert Limb.max_for(:torso, 200) == 70
      assert Limb.max_for(:l_arm, 200) == 20
      assert Limb.max_for(:r_arm, 200) == 20
      assert Limb.max_for(:l_leg, 200) == 25
      assert Limb.max_for(:r_leg, 200) == 25
    end

    test "6. max_for/2 guarantees at least 1 HP even for small max_hp values" do
      assert Limb.max_for(:l_arm, 5) >= 1
      assert Limb.max_for(:head, 2) >= 1
    end
  end

  describe "Limb.apply_to/4 damage absorption and bleed-through" do
    test "7. partial damage to limb is fully absorbed without overflow" do
      hp_map = Limb.init(100)
      {updated_map, core_damage} = Limb.apply_to(hp_map, :head, 15)

      assert updated_map.head == 5
      assert core_damage == 15
    end

    test "8. exact damage reducing limb to 0 returns exact damage to core" do
      hp_map = Limb.init(100)
      {updated_map, core_damage} = Limb.apply_to(hp_map, :l_arm, 10)

      assert updated_map.l_arm == 0
      assert core_damage == 10
    end

    test "9. damage overflowing limb HP scales remainder by bleed_through to core" do
      hp_map = Limb.init(100)
      # l_arm has 10 HP. 30 damage: 10 absorbed, 20 overflow * 0.60 = 12 bleed -> 22 total core
      {updated_map, core_damage} = Limb.apply_to(hp_map, :l_arm, 30, 0.60)

      assert updated_map.l_arm == 0
      assert core_damage == 22
    end

    test "10. damage to already broken limb (0 HP) bleeds through entirely at specified rate" do
      hp_map = Map.put(Limb.init(100), :r_arm, 0)
      {updated_map, core_damage} = Limb.apply_to(hp_map, :r_arm, 50, 0.50)

      assert updated_map.r_arm == 0
      assert core_damage == 25
    end

    test "11. apply_to/4 with zero damage leaves limb intact and returns zero core damage" do
      hp_map = Limb.init(100)
      {updated_map, core_damage} = Limb.apply_to(hp_map, :torso, 0)

      assert updated_map.torso == hp_map.torso
      assert core_damage == 0
    end

    test "12. apply_to/4 preserves health of all other limbs" do
      hp_map = Limb.init(100)
      {updated_map, _core} = Limb.apply_to(hp_map, :head, 10)

      assert updated_map.torso == hp_map.torso
      assert updated_map.l_arm == hp_map.l_arm
      assert updated_map.r_arm == hp_map.r_arm
      assert updated_map.l_leg == hp_map.l_leg
      assert updated_map.r_leg == hp_map.r_leg
    end
  end

  describe "Limb.disabled?/2 and disabled_limbs/1" do
    test "13. disabled?/2 returns true when limb HP is 0" do
      hp_map = Map.put(Limb.init(100), :head, 0)
      assert Limb.disabled?(hp_map, :head) == true
    end

    test "14. disabled?/2 returns true when limb HP is negative" do
      hp_map = Map.put(Limb.init(100), :l_leg, -5)
      assert Limb.disabled?(hp_map, :l_leg) == true
    end

    test "15. disabled?/2 returns false when limb has positive HP" do
      hp_map = Limb.init(100)
      assert Limb.disabled?(hp_map, :head) == false
      assert Limb.disabled?(hp_map, :torso) == false
    end

    test "16. disabled_limbs/1 returns empty list when all limbs healthy" do
      hp_map = Limb.init(100)
      assert Limb.disabled_limbs(hp_map) == []
    end

    test "17. disabled_limbs/1 lists all limbs currently at or below 0 HP" do
      hp_map =
        Limb.init(100)
        |> Map.put(:l_arm, 0)
        |> Map.put(:r_arm, 0)

      disabled = Limb.disabled_limbs(hp_map)
      assert length(disabled) == 2
      assert :l_arm in disabled
      assert :r_arm in disabled
    end
  end

  describe "Limb.restrictions/1" do
    test "18. fully intact body imposes no movement or combat restrictions" do
      hp_map = Limb.init(100)
      r = Limb.restrictions(hp_map)

      assert r.cannot_dodge == false
      assert r.cannot_parry == false
      assert r.cannot_block == false
      assert r.head_broken == false
      assert r.torso_broken == false
    end

    test "19. single leg disabled still allows dodging" do
      hp_map = Map.put(Limb.init(100), :l_leg, 0)
      r = Limb.restrictions(hp_map)
      assert r.cannot_dodge == false
    end

    test "20. both legs disabled sets cannot_dodge to true" do
      hp_map =
        Limb.init(100)
        |> Map.put(:l_leg, 0)
        |> Map.put(:r_leg, 0)

      r = Limb.restrictions(hp_map)
      assert r.cannot_dodge == true
    end

    test "21. single arm disabled still allows parrying and blocking with the other arm" do
      hp_map = Map.put(Limb.init(100), :r_arm, 0)
      r = Limb.restrictions(hp_map)

      assert r.cannot_parry == false
      assert r.cannot_block == false
    end

    test "22. both arms disabled sets cannot_parry and cannot_block to true" do
      hp_map =
        Limb.init(100)
        |> Map.put(:l_arm, 0)
        |> Map.put(:r_arm, 0)

      r = Limb.restrictions(hp_map)
      assert r.cannot_parry == true
      assert r.cannot_block == true
    end

    test "23. broken head flags head_broken for unconsciousness checks" do
      hp_map = Map.put(Limb.init(100), :head, 0)
      r = Limb.restrictions(hp_map)
      assert r.head_broken == true
    end
  end

  describe "Limb.wound_level/3" do
    test "24. identifies :ok (> 75%), :light (51-75%), and :heavy (1-50%) damage tiers" do
      # Head max is 20 for 100 max HP
      hp_18 = %{head: 18}
      hp_12 = %{head: 12}
      hp_6 = %{head: 6}

      assert Limb.wound_level(hp_18, :head, 100) == :ok
      assert Limb.wound_level(hp_12, :head, 100) == :light
      assert Limb.wound_level(hp_6, :head, 100) == :heavy
    end

    test "25. identifies :disabled when limb HP is 0 or negative" do
      assert Limb.wound_level(%{torso: 0}, :torso, 100) == :disabled
      assert Limb.wound_level(%{torso: -10}, :torso, 100) == :disabled
    end
  end
end
