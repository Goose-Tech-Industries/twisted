defmodule TePhoenix.Battle.PowerLevelTest do
  use ExUnit.Case, async: true

  alias TePhoenix.Battle.{Combatant, PowerLevel}

  defp build_fighter(attrs \\ %{}) do
    base = %Combatant{
      char_id: 10,
      name: "Goku",
      level: 5,
      current_hp: 100,
      max_hp: 100,
      current_mp: 50,
      max_mp: 50,
      atk: 20,
      def: 15,
      mo: 10,
      md: 10,
      speed: 25,
      statuses: []
    }

    Map.merge(base, Map.new(attrs))
  end

  describe "PowerLevel.calculate_pl/1 formula" do
    test "1. calculates PL combining core stats (atk+def+mo+md+speed) with level" do
      # base = 20 + 15 + 10 + 10 + 25 = 80
      # level = 1, full hp ratio = 1.0 -> hp_bonus = 80 * 0.2 = 16
      # pl = 80 * 1 + 16 = 96
      c = build_fighter(%{level: 1, current_hp: 100, max_hp: 100})
      assert PowerLevel.calculate_pl(c) == 96
    end

    test "2. scales proportionally with higher fighter level" do
      # base = 80, level = 5, hp_bonus = 16 -> pl = 80 * 5 + 16 = 416
      c = build_fighter(%{level: 5, current_hp: 100, max_hp: 100})
      assert PowerLevel.calculate_pl(c) == 416
    end

    test "3. incorporates HP ratio bonus so full health fighter has higher PL than wounded" do
      c_full = build_fighter(%{current_hp: 100, max_hp: 100})
      c_half = build_fighter(%{current_hp: 50, max_hp: 100})
      c_critical = build_fighter(%{current_hp: 1, max_hp: 100})

      pl_full = PowerLevel.calculate_pl(c_full)
      pl_half = PowerLevel.calculate_pl(c_half)
      pl_critical = PowerLevel.calculate_pl(c_critical)

      assert pl_full > pl_half
      assert pl_half > pl_critical
    end

    test "4. zero current HP gives zero HP ratio bonus but preserves base stat PL" do
      # base = 80, level = 1, hp_bonus = 0 -> pl = 80
      c = build_fighter(%{level: 1, current_hp: 0, max_hp: 100})
      assert PowerLevel.calculate_pl(c) == 80
    end

    test "5. treats nil level as level 1 safely" do
      c = build_fighter(%{level: nil, current_hp: 100, max_hp: 100})
      assert PowerLevel.calculate_pl(c) == 96
    end

    test "6. zero max_hp does not cause division by zero error" do
      c = build_fighter(%{max_hp: 0, current_hp: 0, level: 1})
      assert is_integer(PowerLevel.calculate_pl(c))
    end
  end

  describe "PowerLevel KI management (MP mapping)" do
    test "7. get_ki/1 returns fighter current_mp" do
      c = build_fighter(%{current_mp: 42})
      assert PowerLevel.get_ki(c) == 42
    end

    test "8. get_max_ki/1 returns fighter max_mp" do
      c = build_fighter(%{max_mp: 80})
      assert PowerLevel.get_max_ki(c) == 80
    end

    test "9. consume_ki/2 successfully spends KI when current KI is sufficient" do
      c = build_fighter(%{current_mp: 50})
      assert {:ok, updated} = PowerLevel.consume_ki(c, 20)
      assert updated.current_mp == 30
    end

    test "10. consume_ki/2 returns {:error, :insufficient_ki} when KI is insufficient" do
      c = build_fighter(%{current_mp: 10})
      assert PowerLevel.consume_ki(c, 25) == {:error, :insufficient_ki}
    end

    test "11. consume_ki/2 with 0 cost succeeds without modifying combatant" do
      c = build_fighter(%{current_mp: 15})
      assert {:ok, ^c} = PowerLevel.consume_ki(c, 0)
    end

    test "12. restore_ki/2 increases KI up to maximum KI limit" do
      c = build_fighter(%{current_mp: 20, max_mp: 50})
      updated = PowerLevel.restore_ki(c, 15)
      assert updated.current_mp == 35
    end

    test "13. restore_ki/2 clamps excess KI to max_mp" do
      c = build_fighter(%{current_mp: 40, max_mp: 50})
      updated = PowerLevel.restore_ki(c, 30)
      assert updated.current_mp == 50
    end
  end

  describe "PowerLevel.check_move_requirements/2" do
    test "14. returns :ok when skill has no pl_required restriction" do
      c = build_fighter()
      assert PowerLevel.check_move_requirements(c, %{}) == :ok
      assert PowerLevel.check_move_requirements(c, %{"damage" => 100}) == :ok
    end

    test "15. returns :ok when pl_required is 0 or negative" do
      c = build_fighter()
      assert PowerLevel.check_move_requirements(c, %{"pl_required" => 0}) == :ok
    end

    test "16. returns :ok when fighter PL meets or exceeds requirement" do
      c = build_fighter(%{level: 5, current_hp: 100}) # PL = 416
      assert PowerLevel.check_move_requirements(c, %{"pl_required" => 300}) == :ok
      assert PowerLevel.check_move_requirements(c, %{"pl_required" => 416}) == :ok
    end

    test "17. returns descriptive error when fighter PL is below requirement" do
      c = build_fighter(%{level: 1, current_hp: 100}) # PL = 96
      assert {:error, msg} = PowerLevel.check_move_requirements(c, %{"pl_required" => 500})
      assert msg =~ "PL 96 is below the required 500"
    end

    test "18. non-map effects automatically pass check" do
      c = build_fighter()
      assert PowerLevel.check_move_requirements(c, nil) == :ok
      assert PowerLevel.check_move_requirements(c, "invalid") == :ok
    end
  end

  describe "PowerLevel.check_chain_opportunity/3 combo triggers" do
    test "19. non-crit hits do not trigger chain combo" do
      c = build_fighter()
      assert PowerLevel.check_chain_opportunity(c, "head", false) == :no_chain
      assert PowerLevel.check_chain_opportunity(c, "torso", false) == :no_chain
    end

    test "20. critical hit to head triggers head stun chain combo" do
      c = build_fighter()
      assert {:chain, reason} = PowerLevel.check_chain_opportunity(c, "head", true)
      assert reason =~ "Critical hit to the head"
    end

    test "21. critical hit to HEAD (uppercase) triggers head stun chain combo" do
      c = build_fighter()
      assert {:chain, _} = PowerLevel.check_chain_opportunity(c, "HEAD", true)
    end

    test "22. critical hit to torso or chest triggers stagger chain combo" do
      c = build_fighter()
      assert {:chain, reason1} = PowerLevel.check_chain_opportunity(c, "torso", true)
      assert reason1 =~ "Devastating body blow"

      assert {:chain, reason2} = PowerLevel.check_chain_opportunity(c, "chest", true)
      assert reason2 =~ "Devastating body blow"
    end

    test "23. critical hit to limbs other than head/torso does not trigger chain" do
      c = build_fighter()
      assert PowerLevel.check_chain_opportunity(c, "l_arm", true) == :no_chain
      assert PowerLevel.check_chain_opportunity(c, "r_leg", true) == :no_chain
    end
  end

  describe "PowerLevel.serialize_for_viewer/2 visibility" do
    test "24. viewer looking at self always sees accurate power level and stats" do
      c = build_fighter(%{char_id: 1, level: 2})
      serialized = PowerLevel.serialize_for_viewer(c, c)

      assert serialized.char_id == 1
      assert is_integer(serialized.power_level)
      assert serialized.power_level != "???"
      assert serialized.atk == c.atk
      assert serialized.def == c.def
    end

    test "25. serialize includes alive flag and HP stats" do
      c = build_fighter(%{char_id: 2, current_hp: 50, max_hp: 100})
      serialized = PowerLevel.serialize_for_viewer(c, c)

      assert serialized.current_hp == 50
      assert serialized.max_hp == 100
      assert serialized.is_alive == true
    end
  end
end
