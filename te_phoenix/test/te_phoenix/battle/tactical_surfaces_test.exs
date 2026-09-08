defmodule TePhoenix.Battle.TacticalSurfacesTest do
  use ExUnit.Case, async: true
  alias TePhoenix.Battle.{Combatant, Damage, State, Surfaces}

  describe "Environmental Chemistry & Tactical Battle Surfaces" do
    test "Oil puddle explodes when struck with fire, dealing bonus damage and setting ground ablaze" do
      attacker = %Combatant{name: "Lyra", char_id: 1, team_id: 1, atk: 20, grid_x: 2, grid_y: 1}
      target = %Combatant{name: "Orc", char_id: 2, team_id: 2, max_hp: 100, current_hp: 80, def: 0, grid_x: 2, grid_y: 2}

      state = %State{
        combatants: %{1 => attacker, 2 => target},
        terrain_map: %{"2,2" => "oil"},
        surface_durations: %{"2,2" => 4},
        settings: %{enable_surfaces: true, base_crit_chance: 0, enable_active_defense: false}
      }

      effects = %{"damage" => 20, "elements" => ["fire"]}
      result = %{log: [], actions: []}

      {updated_state, action_result} = Damage.resolve(state, attacker, target, effects, "Fireball", result)

      # Target took attack damage + 15 bonus explosion damage
      updated_target = Map.get(updated_state.combatants, 2)
      assert updated_target.current_hp < 50

      # Explosion reaction action emitted
      assert Enum.any?(action_result.actions, fn a -> a[:type] == :surface_reaction && a[:reaction] == "explosion" end)

      # Tile 2,2 is now fire
      assert Map.get(updated_state.terrain_map, "2,2") == "fire"
    end

    test "Water puddle struck with lightning electrifies, dealing bonus shock damage and stunning target" do
      attacker = %Combatant{name: "Mage", char_id: 1, team_id: 1, atk: 20, grid_x: 3, grid_y: 2}
      target = %Combatant{name: "Brigand", char_id: 2, team_id: 2, max_hp: 100, current_hp: 80, def: 0, grid_x: 3, grid_y: 1}

      state = %State{
        combatants: %{1 => attacker, 2 => target},
        terrain_map: %{"3,1" => "water"},
        surface_durations: %{"3,1" => 3},
        settings: %{enable_surfaces: true, base_crit_chance: 0, enable_active_defense: false}
      }

      effects = %{"damage" => 20, "elements" => ["lightning"]}
      result = %{log: [], actions: []}

      {updated_state, action_result} = Damage.resolve(state, attacker, target, effects, "Lightning Bolt", result)

      updated_target = Map.get(updated_state.combatants, 2)
      assert updated_target.current_hp < 55

      # Conductive surge reaction action emitted
      assert Enum.any?(action_result.actions, fn a -> a[:type] == :surface_reaction && a[:reaction] == "conductive" end)

      # Stun applied to target
      assert Enum.any?(updated_target.statuses, fn s -> (is_map(s) && (s[:key] == "stun" || s[:name] == "Stunned" || s["key"] == "stun")) end)

      # Tile 3,1 is now electrified_water
      assert Map.get(updated_state.terrain_map, "3,1") == "electrified_water"
    end

    test "Water struck with ice flash-freezes into frozen ground" do
      attacker = %Combatant{name: "Frost Mage", char_id: 1, team_id: 1, atk: 15, grid_x: 1, grid_y: 2}
      target = %Combatant{name: "Wolf", char_id: 2, team_id: 2, max_hp: 60, current_hp: 60, def: 0, grid_x: 1, grid_y: 1}

      state = %State{
        combatants: %{1 => attacker, 2 => target},
        terrain_map: %{"1,1" => "water"},
        surface_durations: %{"1,1" => 2},
        settings: %{enable_surfaces: true, base_crit_chance: 0, enable_active_defense: false}
      }

      effects = %{"damage" => 15, "elements" => ["ice"]}
      result = %{log: [], actions: []}

      {updated_state, action_result} = Damage.resolve(state, attacker, target, effects, "Frost Spike", result)

      assert Enum.any?(action_result.actions, fn a -> a[:type] == :surface_reaction && a[:reaction] == "freeze" end)
      assert Map.get(updated_state.terrain_map, "1,1") == "frozen"
    end

    test "Poison cloud struck with fire triggers thermobaric concussive blast" do
      attacker = %Combatant{name: "Pyromancer", char_id: 1, team_id: 1, atk: 20, grid_x: 4, grid_y: 1}
      target = %Combatant{name: "Ogre", char_id: 2, team_id: 2, max_hp: 150, current_hp: 120, def: 0, grid_x: 4, grid_y: 2}

      state = %State{
        combatants: %{1 => attacker, 2 => target},
        terrain_map: %{"4,2" => "poison_cloud"},
        surface_durations: %{"4,2" => 3},
        settings: %{enable_surfaces: true, base_crit_chance: 0, enable_active_defense: false}
      }

      effects = %{"damage" => 20, "elements" => ["fire"]}
      result = %{log: [], actions: []}

      {updated_state, action_result} = Damage.resolve(state, attacker, target, effects, "Flame Arc", result)

      # 20 base attack + 20 thermobaric blast damage
      updated_target = Map.get(updated_state.combatants, 2)
      assert updated_target.current_hp <= 80

      assert Enum.any?(action_result.actions, fn a -> a[:type] == :surface_reaction && a[:reaction] == "thermobaric" end)
      assert Map.get(updated_state.terrain_map, "4,2") == "fire"
    end

    test "Surfaces.tick decrements duration and damages combatants on hazardous ground" do
      target = %Combatant{name: "Scout", char_id: 2, team_id: 2, max_hp: 50, current_hp: 40, grid_x: 1, grid_y: 1}

      state = %State{
        combatants: %{2 => target},
        terrain_map: %{"1,1" => "fire"},
        surface_durations: %{"1,1" => 1}
      }

      result = %{log: [], actions: []}
      {updated_state, tick_result} = Surfaces.tick(state, result)

      # Fire surface damages combatant (default 8 dmg)
      updated_target = Map.get(updated_state.combatants, 2)
      assert updated_target.current_hp < 40

      # Surface expired after 1 turn
      assert Map.get(updated_state.terrain_map, "1,1") == nil
      assert Enum.any?(tick_result.actions, fn a -> a[:type] == :surface_expired end)
    end
  end
end
