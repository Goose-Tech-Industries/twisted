defmodule TePhoenix.Battle.ChargeMechanicsTest do
  use ExUnit.Case, async: true

  alias TePhoenix.Battle.ChargeMechanics

  describe "ChargeMechanics.can_brace?/1" do
    test "returns true when charging is a map" do
      combatant = %{name: "Mage", charging: %{skill_id: 1, skill_name: "Fireball", turns_left: 2}}
      assert ChargeMechanics.can_brace?(combatant) == true
    end

    test "returns false when charging is nil" do
      combatant = %{name: "Mage", charging: nil}
      assert ChargeMechanics.can_brace?(combatant) == false
    end

    test "returns false when charging is false" do
      combatant = %{name: "Mage", charging: false}
      assert ChargeMechanics.can_brace?(combatant) == false
    end
  end

  describe "ChargeMechanics.start_charge/2" do
    test "initializes charging state with skill_id, skill_name, turns_left, and charge_limb" do
      combatant = %{name: "Wizard"}
      opts = [skill_id: 10, skill_name: "Meteor", turns: 3, charge_limb: "right_arm"]
      updated = ChargeMechanics.start_charge(combatant, opts)

      assert is_map(updated.charging)
      assert updated.charging.skill_id == 10
      assert updated.charging.skill_name == "Meteor"
      assert updated.charging.turns_left == 3
      assert updated.charging.charge_limb == "right_arm"
    end

    test "supports charge without specifying charge_limb" do
      combatant = %{name: "Monk"}
      opts = [skill_id: 5, skill_name: "Spirit Blast", turns: 1]
      updated = ChargeMechanics.start_charge(combatant, opts)

      assert updated.charging.charge_limb == nil
      assert updated.charging.turns_left == 1
    end

    test "raises KeyError when required options are missing" do
      combatant = %{name: "Archer"}
      assert_raise KeyError, fn ->
        ChargeMechanics.start_charge(combatant, [skill_id: 1, turns: 2])
      end
    end
  end

  describe "ChargeMechanics.tick_charge/1" do
    test "returns :no_charge when combatant is not charging" do
      combatant = %{name: "Fighter", charging: nil}
      assert {^combatant, :no_charge} = ChargeMechanics.tick_charge(combatant)
    end

    test "decrements turns_left and remains in :charging state if turns remain" do
      combatant = %{name: "Sorcerer", charging: %{skill_id: 1, skill_name: "Blizzard", turns_left: 3}}
      {updated, status} = ChargeMechanics.tick_charge(combatant)

      assert status == :charging
      assert updated.charging.turns_left == 2
    end

    test "clears charging and flags charging_fire when turns_left reaches 0" do
      combatant = %{name: "Sorcerer", charging: %{skill_id: 1, skill_name: "Blizzard", turns_left: 1}}
      {updated, status} = ChargeMechanics.tick_charge(combatant)

      assert status == :ready
      assert updated.charging == nil
      assert updated.charging_fire == true
    end
  end

  describe "ChargeMechanics.check_charge_interrupt/3" do
    test "returns non-interrupted result when combatant is not charging" do
      combatant = %{name: "Warrior", charging: nil}
      {_c, result} = ChargeMechanics.check_charge_interrupt(combatant, {:stun_applied, :stun})
      assert result.interrupted == false
    end

    test "interrupts charge when stun status is applied" do
      combatant = %{name: "Warrior", charging: %{skill_id: 2, skill_name: "Smite", turns_left: 2}}
      {updated, result} = ChargeMechanics.check_charge_interrupt(combatant, {:stun_applied, :deep_freeze})

      assert result.interrupted == true
      assert result.reason == :stun
      assert result.skill_name == "Smite"
      assert updated.charging == nil
      assert updated.charging_fire == false
    end

    test "interrupts charge when channeled limb is disabled" do
      combatant = %{
        name: "Cleric",
        charging: %{skill_id: 7, skill_name: "Holy Light", turns_left: 1, charge_limb: "left_hand"}
      }

      {updated, result} = ChargeMechanics.check_charge_interrupt(combatant, {:limb_disabled, "left_hand"})
      assert result.interrupted == true
      assert result.reason == :limb_disabled
      assert updated.charging == nil
    end

    test "limb matching is case-insensitive and trims whitespace" do
      combatant = %{
        name: "Cleric",
        charging: %{skill_id: 7, skill_name: "Holy Light", turns_left: 1, charge_limb: "Right_Arm "}
      }

      {_updated, result} = ChargeMechanics.check_charge_interrupt(combatant, {:limb_disabled, "right_arm"})
      assert result.interrupted == true
    end

    test "limb matching handles atom vs string comparison" do
      combatant = %{
        name: "Cleric",
        charging: %{skill_id: 7, skill_name: "Holy Light", turns_left: 1, charge_limb: :head}
      }

      {_updated, result} = ChargeMechanics.check_charge_interrupt(combatant, {:limb_disabled, "head"})
      assert result.interrupted == true
    end

    test "does NOT interrupt when a different limb is disabled" do
      combatant = %{
        name: "Cleric",
        charging: %{skill_id: 7, skill_name: "Holy Light", turns_left: 1, charge_limb: "right_arm"}
      }

      {updated, result} = ChargeMechanics.check_charge_interrupt(combatant, {:limb_disabled, "left_leg"})
      assert result.interrupted == false
      assert updated.charging != nil
    end

    test "does NOT interrupt on unhandled events" do
      combatant = %{name: "Mage", charging: %{skill_id: 1, skill_name: "Flare", turns_left: 2}}
      {_updated, result} = ChargeMechanics.check_charge_interrupt(combatant, {:bleed_applied, :light_bleed})
      assert result.interrupted == false
    end

    test "includes context turn in interrupt result" do
      combatant = %{name: "Mage", charging: %{skill_id: 1, skill_name: "Flare", turns_left: 2}}
      {_updated, result} = ChargeMechanics.check_charge_interrupt(combatant, {:stun_applied, :paralysis}, %{turn: 5})
      assert result.turn == 5
    end
  end

  describe "ChargeMechanics brace defensive mechanics" do
    test "apply_brace sets bracing: true when charging" do
      combatant = %{name: "Knight", charging: %{skill_id: 3, skill_name: "Charge", turns_left: 1}}
      braced = ChargeMechanics.apply_brace(combatant)
      assert braced.bracing == true
    end

    test "apply_brace does not set bracing when not charging" do
      combatant = %{name: "Knight", charging: nil}
      braced = ChargeMechanics.apply_brace(combatant)
      refute Map.get(braced, :bracing, false)
    end

    test "consume_brace resets bracing to false" do
      combatant = %{name: "Knight", bracing: true}
      unbraced = ChargeMechanics.consume_brace(combatant)
      assert unbraced.bracing == false
    end

    test "bracing? checks whether bracing is currently active" do
      assert ChargeMechanics.bracing?(%{bracing: true}) == true
      assert ChargeMechanics.bracing?(%{bracing: false}) == false
      assert ChargeMechanics.bracing?(%{}) == false
    end

    test "apply_brace_reduction halves incoming damage and consumes brace" do
      combatant = %{name: "Guardian", bracing: true}
      initial_result = %{log: [], actions: []}

      {updated, reduced, result} = ChargeMechanics.apply_brace_reduction(combatant, 60, initial_result)

      assert reduced == 30
      assert updated.bracing == false
      assert length(result.log) == 1
      assert hd(result.actions).type == :brace_reduction
    end

    test "apply_brace_reduction guarantees minimum damage of 1" do
      combatant = %{name: "Guardian", bracing: true}
      {_updated, reduced, _result} = ChargeMechanics.apply_brace_reduction(combatant, 1, %{log: [], actions: []})
      assert reduced == 1
    end
  end

  describe "ChargeMechanics.defense_options/1" do
    test "includes :brace in defense options when charging" do
      combatant = %{charging: %{skill_id: 1, turns_left: 1}}
      options = ChargeMechanics.defense_options(combatant)
      assert :brace in options
      assert :dodge in options
      assert :block in options
      assert :counter in options
    end

    test "excludes :brace when not charging" do
      combatant = %{charging: nil}
      options = ChargeMechanics.defense_options(combatant)
      refute :brace in options
      assert options == [:dodge, :block, :counter]
    end
  end
end
