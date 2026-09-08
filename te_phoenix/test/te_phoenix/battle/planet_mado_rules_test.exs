defmodule TePhoenix.Battle.PlanetMadoRulesTest do
  use ExUnit.Case, async: true

  alias TePhoenix.Battle.{ActiveDefense, Combatant, Settings, Tactics}

  describe "Planet Mado Elevation Rules" do
    test "high ground grants +15% damage bonus and +2 range bonus" do
      state = %{
        settings: Settings.defaults(),
        elevation_map: %{
          "2,3" => 1,
          "2,5" => 0
        }
      }

      high_attacker = %Combatant{char_id: 1, name: "Archer", grid_x: 2, grid_y: 3}
      low_defender = %Combatant{char_id: 2, name: "Goblin", grid_x: 2, grid_y: 5}

      adv = Tactics.elevation_advantage(state, high_attacker, low_defender)

      assert adv.has_high_ground == true
      assert adv.damage_mult == 1.15
      assert adv.hit_rate_bonus == 0.15
      assert adv.range_bonus == 2

      # Base range 1 becomes 3 with elevation >= 1
      assert Tactics.effective_range(state, high_attacker, 1) == 3
    end

    test "low ground grants penalty against higher opponent" do
      state = %{
        settings: Settings.defaults(),
        elevation_map: %{
          "2,3" => 1,
          "2,5" => 0
        }
      }

      low_attacker = %Combatant{char_id: 2, name: "Goblin", grid_x: 2, grid_y: 5}
      high_defender = %Combatant{char_id: 1, name: "Archer", grid_x: 2, grid_y: 3}

      adv = Tactics.elevation_advantage(state, low_attacker, high_defender)

      assert adv.has_high_ground == false
      assert adv.damage_mult == 0.90
      assert adv.range_bonus == 0
    end
  end

  describe "Planet Mado Active Defense Timing" do
    test "perfect timing (<= 150ms) guarantees dodge and parry negation" do
      attacker = %Combatant{char_id: 1, name: "Knight", atk: 50, speed: 20}
      defender = %Combatant{char_id: 2, name: "Rogue", def: 10, speed: 10, current_mp: 50, limb_hp: %{l_leg: 10, r_leg: 10, l_arm: 10, r_arm: 10}}

      # Perfect dodge timing within 150ms
      assert {:negated, def_after, :perfect_dodge} =
               ActiveDefense.resolve(attacker, defender, type: :dodge, timing_ms: 120)
      assert def_after.current_mp < defender.current_mp

      # Perfect parry timing within 150ms
      assert {:negated, def_after2, :perfect_parry} =
               ActiveDefense.resolve(attacker, defender, type: :parry, timing_ms: -80)
      assert def_after2.current_mp < defender.current_mp
    end
  end
end
