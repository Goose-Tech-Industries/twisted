defmodule TePhoenix.Battle.ActiveDefenseTest do
  use ExUnit.Case, async: true

  alias TePhoenix.Battle.{ActiveDefense, Combatant, Limb}

  defp build_combatant(attrs \\ %{}) do
    base = %Combatant{
      char_id: 1,
      name: "Defender",
      current_hp: 100,
      max_hp: 100,
      current_mp: 50,
      max_mp: 50,
      speed: 15,
      atk: 10,
      def: 12,
      luck: 8,
      limb_hp: Limb.init(100),
      default_defense: nil
    }

    Map.merge(base, Map.new(attrs))
  end

  describe "ActiveDefense.choose/2 default behavior" do
    test "1. picks :dodge when speed >= def and legs are healthy" do
      c = build_combatant(%{speed: 20, def: 10})
      assert ActiveDefense.choose(c, %{}) == :dodge
    end

    test "2. picks :parry when def > speed and arms are healthy" do
      c = build_combatant(%{speed: 10, def: 20})
      assert ActiveDefense.choose(c, %{}) == :parry
    end

    test "3. falls back to :dodge if def > speed but arms are broken" do
      hp = Map.put(Limb.init(100), :l_arm, 0) |> Map.put(:r_arm, 0)
      c = build_combatant(%{speed: 10, def: 20, limb_hp: hp})
      assert ActiveDefense.choose(c, %{}) == :dodge
    end

    test "4. falls back to :parry if speed >= def but legs are broken" do
      hp = Map.put(Limb.init(100), :l_leg, 0) |> Map.put(:r_leg, 0)
      c = build_combatant(%{speed: 20, def: 10, limb_hp: hp})
      assert ActiveDefense.choose(c, %{}) == :parry
    end

    test "5. returns :none when all arms and legs are broken" do
      hp =
        Limb.init(100)
        |> Map.put(:l_arm, 0)
        |> Map.put(:r_arm, 0)
        |> Map.put(:l_leg, 0)
        |> Map.put(:r_leg, 0)

      c = build_combatant(%{limb_hp: hp})
      assert ActiveDefense.choose(c, %{}) == :none
    end

    test "6. honors user preferred default_defense if capable" do
      c = build_combatant(%{default_defense: :block})
      assert ActiveDefense.choose(c, %{}) == :block
    end

    test "7. overrides preferred :dodge if legs are broken" do
      hp = Map.put(Limb.init(100), :l_leg, 0) |> Map.put(:r_leg, 0)
      c = build_combatant(%{default_defense: :dodge, limb_hp: hp})
      assert ActiveDefense.choose(c, %{}) == :parry
    end

    test "8. overrides preferred :parry if arms are broken" do
      hp = Map.put(Limb.init(100), :l_arm, 0) |> Map.put(:r_arm, 0)
      c = build_combatant(%{default_defense: :parry, limb_hp: hp})
      assert ActiveDefense.choose(c, %{}) == :dodge
    end
  end

  describe "ActiveDefense.resolve/3 - Type :none or insufficient resources" do
    test "9. resolve returns {:hit, defender} when type is :none" do
      attacker = build_combatant(%{char_id: 2, name: "Attacker"})
      defender = build_combatant()
      assert {:hit, ^defender} = ActiveDefense.resolve(attacker, defender, type: :none)
    end

    test "10. dodge fails with {:hit, defender} when MP is less than 4" do
      attacker = build_combatant(%{char_id: 2})
      defender = build_combatant(%{current_mp: 3})
      assert {:hit, ^defender} = ActiveDefense.resolve(attacker, defender, type: :dodge)
    end

    test "11. parry fails with {:hit, defender} when MP is less than 6" do
      attacker = build_combatant(%{char_id: 2})
      defender = build_combatant(%{current_mp: 5})
      assert {:hit, ^defender} = ActiveDefense.resolve(attacker, defender, type: :parry)
    end

    test "12. block fails with {:hit, defender} when MP is less than 3" do
      attacker = build_combatant(%{char_id: 2})
      defender = build_combatant(%{current_mp: 2})
      assert {:hit, ^defender} = ActiveDefense.resolve(attacker, defender, type: :block)
    end

    test "13. dodge fails with {:hit, defender} when legs are broken even with timing" do
      attacker = build_combatant(%{char_id: 2})
      hp = Map.put(Limb.init(100), :l_leg, 0) |> Map.put(:r_leg, 0)
      defender = build_combatant(%{limb_hp: hp, current_mp: 50})

      assert {:hit, ^defender} = ActiveDefense.resolve(attacker, defender, type: :dodge, timing_ms: 0)
    end

    test "14. parry fails with {:hit, defender} when arms are broken even with timing" do
      attacker = build_combatant(%{char_id: 2})
      hp = Map.put(Limb.init(100), :l_arm, 0) |> Map.put(:r_arm, 0)
      defender = build_combatant(%{limb_hp: hp, current_mp: 50})

      assert {:hit, ^defender} = ActiveDefense.resolve(attacker, defender, type: :parry, timing_ms: 0)
    end

    test "15. block fails with {:hit, defender} when arms are broken" do
      attacker = build_combatant(%{char_id: 2})
      hp = Map.put(Limb.init(100), :l_arm, 0) |> Map.put(:r_arm, 0)
      defender = build_combatant(%{limb_hp: hp, current_mp: 50})

      assert {:hit, ^defender} = ActiveDefense.resolve(attacker, defender, type: :block, timing_ms: 0)
    end
  end

  describe "ActiveDefense.resolve/3 - Perfect Timing Windows" do
    test "16. perfect dodge window (abs(timing) <= 150ms) guarantees negate and spends 4 MP" do
      attacker = build_combatant(%{char_id: 2})
      defender = build_combatant(%{current_mp: 20})

      assert {:negated, def_after, :perfect_dodge} =
               ActiveDefense.resolve(attacker, defender, type: :dodge, timing_ms: 50)
      assert def_after.current_mp == 16
    end

    test "17. perfect parry window (abs(timing) <= 150ms) guarantees negate and spends 6 MP" do
      attacker = build_combatant(%{char_id: 2})
      defender = build_combatant(%{current_mp: 20})

      assert {:negated, def_after, :perfect_parry} =
               ActiveDefense.resolve(attacker, defender, type: :parry, timing_ms: -120)
      assert def_after.current_mp == 14
    end

    test "18. perfect block window reduces damage to 0.15 mult and spends 3 MP" do
      attacker = build_combatant(%{char_id: 2})
      defender = build_combatant(%{current_mp: 20})

      assert {:mitigated, def_after, 0.15, :perfect_block} =
               ActiveDefense.resolve(attacker, defender, type: :block, timing_ms: 100)
      assert def_after.current_mp == 17
    end
  end

  describe "ActiveDefense.resolve/3 - Block Mitigation & Arms" do
    test "19. standard two-arm block deducts 3 MP and mitigates incoming damage" do
      attacker = build_combatant(%{char_id: 2, atk: 12})
      defender = build_combatant(%{def: 12, current_mp: 30})

      assert {:mitigated, def_after, mult, :block} =
               ActiveDefense.resolve(attacker, defender, type: :block)
      assert def_after.current_mp == 27
      assert mult < 1.0 and mult > 0.0
    end

    test "20. single-arm block provides less damage reduction than two-arm block" do
      attacker = build_combatant(%{char_id: 2, atk: 10})
      two_arm_def = build_combatant(%{def: 10})
      hp_one_arm = Map.put(Limb.init(100), :l_arm, 0)
      one_arm_def = build_combatant(%{def: 10, limb_hp: hp_one_arm})

      {:mitigated, _, two_arm_mult, :block} = ActiveDefense.resolve(attacker, two_arm_def, type: :block)
      {:mitigated, _, one_arm_mult, :block} = ActiveDefense.resolve(attacker, one_arm_def, type: :block)

      # Higher multiplier means more damage taken (less mitigation)
      assert one_arm_mult > two_arm_mult
    end

    test "21. block multiplier is clamped between 0.10 and 1.0" do
      attacker = build_combatant(%{char_id: 2, atk: 0})
      defender = build_combatant(%{def: 100})

      {:mitigated, _, mult, :block} = ActiveDefense.resolve(attacker, defender, type: :block)
      assert mult >= 0.10 and mult <= 1.0
    end
  end

  describe "ActiveDefense.resolve/3 - Probability bounds and timing penalty" do
    test "22. late timing (> 350ms) applies timing penalty without crashing" do
      attacker = build_combatant(%{char_id: 2})
      defender = build_combatant(%{current_mp: 20})

      result = ActiveDefense.resolve(attacker, defender, type: :dodge, timing_ms: 400)
      assert elem(result, 0) in [:negated, :hit]
    end

    test "23. dodge resolution returns either negated or hit and properly updates MP" do
      attacker = build_combatant(%{char_id: 2})
      defender = build_combatant(%{current_mp: 20})

      result = ActiveDefense.resolve(attacker, defender, type: :dodge)
      case result do
        {:negated, def_after, :dodge} -> assert def_after.current_mp == 16
        {:hit, def_after} -> assert def_after.current_mp in [16, 20]
      end
    end

    test "24. parry resolution returns either negated or hit" do
      attacker = build_combatant(%{char_id: 2})
      defender = build_combatant(%{current_mp: 20})

      result = ActiveDefense.resolve(attacker, defender, type: :parry)
      assert elem(result, 0) in [:negated, :hit]
    end

    test "25. unrecognized defense action falls through to {:hit, defender}" do
      attacker = build_combatant(%{char_id: 2})
      defender = build_combatant()

      assert {:hit, ^defender} = ActiveDefense.resolve(attacker, defender, type: :unknown_dance)
    end
  end
end
