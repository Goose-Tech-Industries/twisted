defmodule TePhoenix.Battle.FireEmblemSupportTest do
  use ExUnit.Case, async: true
  alias TePhoenix.Battle.{Combatant, Damage, State}

  describe "Fire Emblem Support & Synergy" do
    test "resolve_support_rank_between detects default and explicit bonds" do
      valerius = %Combatant{name: "Valerius", char_id: "c_valerius"}
      bram = %Combatant{name: "Bram Ironfoot", char_id: "c_bram"}
      lyra = %Combatant{name: "Lyra Shadowsong", char_id: "c_lyra"}

      assert Damage.resolve_support_rank_between(valerius, bram) == "B"
      assert Damage.resolve_support_rank_between(valerius, lyra) == "C"
      assert Damage.resolve_support_rank_between(lyra, bram) == "B"

      custom_a = %Combatant{name: "A", char_id: 1, support_bonds: %{"2" => "S"}}
      custom_b = %Combatant{name: "B", char_id: 2}
      assert Damage.resolve_support_rank_between(custom_a, custom_b) == "S"
    end

    test "Dual Guard intercepts and mitigates damage for bonded ally" do
      target = %Combatant{name: "Lyra", char_id: 1, team_id: 1, max_hp: 100, current_hp: 50, def: 0}
      guardian = %Combatant{name: "Bram", char_id: 2, team_id: 1, max_hp: 100, current_hp: 100}
      attacker = %Combatant{name: "Goblin", char_id: 3, team_id: 2, atk: 30}

      state = %State{
        combatants: %{
          1 => target,
          2 => guardian,
          3 => attacker
        },
        settings: %{enable_dual_guard: true, base_crit_chance: 0}
      }

      effects = %{"damage" => 40, "type" => "physical"}
      result = %{log: [], actions: []}

      {_updated_state, action_result} =
        Damage.resolve(state, attacker, target, effects, "Strike", result, %{force_dual_guard: true})

      assert Enum.any?(action_result.actions, fn a -> a[:type] == :dual_guard end)
      guard_action = Enum.find(action_result.actions, fn a -> a[:type] == :dual_guard end)
      assert guard_action.guardian == "Bram"
      assert guard_action.target == "Lyra"
      assert guard_action.negated_damage > 0
    end

    test "Dual Strike triggers follow-up synchronized assault" do
      actor = %Combatant{name: "Valerius", char_id: 1, team_id: 1, atk: 25}
      partner = %Combatant{name: "Lyra", char_id: 2, team_id: 1, atk: 30}
      target = %Combatant{name: "Orc Brute", char_id: 3, team_id: 2, max_hp: 200, current_hp: 150, def: 0}

      state = %State{
        combatants: %{
          1 => actor,
          2 => partner,
          3 => target
        },
        settings: %{enable_dual_strike: true, base_crit_chance: 0}
      }

      effects = %{"damage" => 20, "type" => "physical"}
      result = %{log: [], actions: []}

      {updated_state, action_result} =
        Damage.resolve(state, actor, target, effects, "Slash", result, %{force_dual_strike: true})

      assert Enum.any?(action_result.actions, fn a -> a[:type] == :dual_strike end)
      strike_action = Enum.find(action_result.actions, fn a -> a[:type] == :dual_strike end)
      assert strike_action.partner == "Lyra"
      assert strike_action.target == "Orc Brute"
      assert strike_action.damage > 0

      final_target = Map.get(updated_state.combatants, 3)
      assert final_target.current_hp < 130
    end

    test "Triangle Attack triggers synchronized 3-way strike when 3 bonded allies are present" do
      actor = %Combatant{
        name: "Valerius",
        char_id: 1,
        team_id: 1,
        atk: 30,
        support_bonds: %{"2" => "A", "3" => "A"}
      }

      partner1 = %Combatant{
        name: "Bram",
        char_id: 2,
        team_id: 1,
        atk: 28,
        support_bonds: %{"1" => "A", "3" => "A"}
      }

      partner2 = %Combatant{
        name: "Lyra",
        char_id: 3,
        team_id: 1,
        atk: 35,
        support_bonds: %{"1" => "A", "2" => "A"}
      }

      target = %Combatant{
        name: "Dragon Wyrmling",
        char_id: 4,
        team_id: 2,
        max_hp: 500,
        current_hp: 400,
        def: 20
      }

      state = %State{
        combatants: %{
          1 => actor,
          2 => partner1,
          3 => partner2,
          4 => target
        },
        settings: %{
          enable_triangle_attack: true,
          enable_dual_strike: true,
          base_crit_chance: 0
        }
      }

      effects = %{"damage" => 25, "type" => "physical"}
      result = %{log: [], actions: []}

      {updated_state, action_result} =
        Damage.resolve(state, actor, target, effects, "Slash", result, %{force_triangle_attack: true})

      tri_action = Enum.find(action_result.actions, fn a -> a[:type] == :triangle_attack end)
      assert tri_action != nil
      assert tri_action.initiator == "Valerius"
      assert tri_action.partner_1 in ["Bram", "Lyra"]
      assert tri_action.partner_2 in ["Bram", "Lyra"]
      assert tri_action.damage > 0
      assert tri_action.crit == true

      assert Enum.any?(action_result.log, fn l -> String.contains?(l, "TRIANGLE ATTACK") end)

      final_target = Map.get(updated_state.combatants, 4)
      assert final_target.current_hp < 350
    end

    test "Camp Meal Buff boosts combat stats during battle" do
      actor = %Combatant{
        name: "Valerius",
        char_id: 1,
        team_id: 1,
        atk: 20,
        meal_buff: %{"atk" => 15, "crit" => 20}
      }

      target = %Combatant{
        name: "Training Dummy",
        char_id: 2,
        team_id: 2,
        max_hp: 200,
        current_hp: 200,
        def: 0,
        meal_buff: %{"def" => 10}
      }

      state = %State{
        combatants: %{1 => actor, 2 => target},
        settings: %{base_crit_chance: 0, crit_damage_multiplier: 1.5}
      }

      effects = %{"damage" => 20, "type" => "physical"}
      result = %{log: [], actions: []}

      {updated_target_state, _res} =
        Damage.resolve(state, actor, target, effects, "Strike", result, %{})

      final_target = Map.get(updated_target_state.combatants, 2)
      assert final_target.current_hp < 180
    end
  end
end
