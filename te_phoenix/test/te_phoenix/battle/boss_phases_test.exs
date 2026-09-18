defmodule TePhoenix.Battle.BossPhasesTest do
  use ExUnit.Case, async: true
  alias TePhoenix.Battle.{BossPhases, Combatant}

  setup do
    boss = %Combatant{
      char_id: "boss_1",
      name: "Gorgon Prime",
      team_id: 2,
      boss_npc_id: 101,
      boss_current_phase: 0,
      current_hp: 1000,
      max_hp: 1000,
      atk: 50,
      def: 30,
      speed: 15,
      statuses: []
    }

    state = %{
      map_id: 1,
      grid_w: 8,
      grid_h: 8,
      combatants: %{"boss_1" => boss},
      terrain_map: %{}
    }

    phases = [
      %{
        phase: 1,
        hp_threshold_pct: 0.75,
        name: "Phase 1: Awoken",
        on_enter: %{"dialogue" => "You test my patience!", "stat_mults" => %{"atk" => 1.2}}
      },
      %{
        phase: 2,
        hp_threshold_pct: 0.50,
        name: "Phase 2: Enraged",
        on_enter: %{
          "dialogue" => "Feel the earth shatter!",
          "terrain_change" => %{"lava" => [[2, 2], [2, 3]]},
          "stat_mults" => %{"atk" => 1.5, "speed" => 1.3}
        }
      },
      %{
        phase: 3,
        hp_threshold_pct: 0.20,
        name: "Phase 3: Final Form",
        on_enter: %{
          "dialogue" => "THIS IS NOT EVEN MY FINAL FORM!",
          "transform" => %{
            "name" => "Cataclysm Gorgon",
            "icon" => "🐉",
            "sprite_url" => "/sprites/cataclysm.png",
            "new_max_hp" => 1500,
            "restore_hp_pct" => 0.5,
            "stat_overrides" => %{"atk" => 99, "def" => 60},
            "limb_hp" => %{"tail" => 100, "head" => 200},
            "moveset_skill_ids" => [901, 902],
            "clear_statuses" => true,
            "clear_cooldowns" => true
          }
        }
      }
    ]

    res = %{log: [], actions: []}

    {:ok, boss: boss, state: state, phases: phases, res: res}
  end

  test "1. returns unchanged if combatant has no boss_npc_id", %{state: state, res: res, phases: phases} do
    non_boss = %Combatant{char_id: "grunt", name: "Grunt", current_hp: 10, max_hp: 100}
    {s, c, r} = BossPhases.check_phase_transition(state, non_boss, res, phases)
    assert s == state
    assert c == non_boss
    assert r == res
  end

  test "2. returns unchanged if combatant is dead", %{state: state, boss: boss, res: res, phases: phases} do
    dead_boss = %{boss | current_hp: 0}
    {s, c, r} = BossPhases.check_phase_transition(state, dead_boss, res, phases)
    assert s == state
    assert c == dead_boss
    assert r == res
  end

  test "3. does not transition if HP% is above all phase thresholds", %{state: state, boss: boss, res: res, phases: phases} do
    healthy_boss = %{boss | current_hp: 800, max_hp: 1000}
    {_s, c, r} = BossPhases.check_phase_transition(state, healthy_boss, res, phases)
    assert c.boss_current_phase == 0
    assert r.actions == []
  end

  test "4. transitions into phase 1 when HP drops below 75%", %{state: state, boss: boss, res: res, phases: phases} do
    damaged_boss = %{boss | current_hp: 700, max_hp: 1000}
    {_s, c, r} = BossPhases.check_phase_transition(state, damaged_boss, res, phases)
    assert c.boss_current_phase == 1
    assert Enum.any?(r.actions, &(&1.type == :boss_phase and &1.phase == 1))
  end

  test "5. transitions into phase 2 when HP drops below 50%", %{state: state, boss: boss, res: res, phases: phases} do
    heavy_damaged_boss = %{boss | current_hp: 450, max_hp: 1000, boss_current_phase: 1}
    {_s, c, r} = BossPhases.check_phase_transition(state, heavy_damaged_boss, res, phases)
    assert c.boss_current_phase == 2
    assert Enum.any?(r.actions, &(&1.type == :boss_phase and &1.phase == 2))
  end

  test "6. does not revert to earlier phase if boss is healed", %{state: state, boss: boss, res: res, phases: phases} do
    # Boss is in phase 2, but gets healed to 90%
    healed_boss = %{boss | current_hp: 900, max_hp: 1000, boss_current_phase: 2}
    {_s, c, r} = BossPhases.check_phase_transition(state, healed_boss, res, phases)
    assert c.boss_current_phase == 2
    assert r.actions == []
  end

  test "7. updates boss_current_phase in state combatants map", %{state: state, boss: boss, res: res, phases: phases} do
    damaged_boss = %{boss | current_hp: 700, max_hp: 1000}
    {s, _c, _r} = BossPhases.check_phase_transition(state, damaged_boss, res, phases)
    assert s.combatants["boss_1"].boss_current_phase == 1
  end

  test "8. records boss_phase action with old_name and boss name", %{state: state, boss: boss, res: res, phases: phases} do
    damaged_boss = %{boss | current_hp: 700, max_hp: 1000}
    {_s, _c, r} = BossPhases.check_phase_transition(state, damaged_boss, res, phases)
    action = Enum.find(r.actions, &(&1.type == :boss_phase))
    assert action != nil
    assert action.old_name == "Gorgon Prime"
    assert action.boss == "Gorgon Prime"
  end

  test "9. apply_transformation updates name and icon", %{boss: boss} do
    transform = %{"transform" => %{"name" => "Omega Gorgon", "icon" => "👑"}}
    transformed = BossPhases.apply_transformation(boss, transform)
    assert transformed.name == "Omega Gorgon"
    assert transformed.icon == "👑"
  end

  test "10. apply_transformation updates sprite_url", %{boss: boss} do
    transform = %{"transform" => %{"sprite_url" => "/sprites/omega.png"}}
    transformed = BossPhases.apply_transformation(boss, transform)
    assert transformed.sprite_url == "/sprites/omega.png"
  end

  test "11. apply_transformation adjusts max_hp and current_hp via restore_hp_pct", %{boss: boss} do
    transform = %{
      "transform" => %{
        "new_max_hp" => 2000,
        "restore_hp_pct" => 0.5
      }
    }
    transformed = BossPhases.apply_transformation(boss, transform)
    assert transformed.max_hp == 2000
    assert transformed.current_hp == 1000
  end

  test "12. apply_transformation preserves existing hp if new_max_hp is nil", %{boss: boss} do
    transform = %{"transform" => %{"name" => "Quick Gorgon"}}
    transformed = BossPhases.apply_transformation(boss, transform)
    assert transformed.max_hp == 1000
    assert transformed.current_hp == 1000
  end

  test "13. apply_transformation overrides combat stats", %{boss: boss} do
    transform = %{
      "transform" => %{
        "stat_overrides" => %{
          "atk" => 120,
          "def" => 75,
          "mo" => 40,
          "md" => 45,
          "speed" => 35,
          "luck" => 20
        }
      }
    }
    transformed = BossPhases.apply_transformation(boss, transform)
    assert transformed.atk == 120
    assert transformed.def == 75
    assert transformed.mo == 40
    assert transformed.md == 45
    assert transformed.speed == 35
    assert transformed.luck == 20
  end

  test "14. apply_transformation ignores empty stat_overrides", %{boss: boss} do
    transform = %{"transform" => %{"stat_overrides" => %{}}}
    transformed = BossPhases.apply_transformation(boss, transform)
    assert transformed.atk == boss.atk
    assert transformed.def == boss.def
  end

  test "15. apply_transformation replaces limb_hp and resets wound_levels", %{boss: boss} do
    boss_with_wounds = %{boss | limb_hp: %{"arm" => 10}, wound_levels: %{"arm" => 2}}
    transform = %{
      "transform" => %{
        "limb_hp" => %{"wing_left" => 150, "wing_right" => 150}
      }
    }
    transformed = BossPhases.apply_transformation(boss_with_wounds, transform)
    assert transformed.limb_hp == %{"wing_left" => 150, "wing_right" => 150}
    assert transformed.wound_levels == %{}
  end

  test "16. apply_transformation updates moveset skills list", %{boss: boss} do
    transform = %{
      "transform" => %{
        "moveset_skill_ids" => [10, 20, 30]
      }
    }
    transformed = BossPhases.apply_transformation(boss, transform)
    assert transformed.skills == [10, 20, 30]
  end

  test "17. apply_transformation clears statuses if clear_statuses is true", %{boss: boss} do
    boss_with_statuses = %{boss | statuses: [%{key: "poison", name: "Poison"}]}
    transform = %{"transform" => %{"clear_statuses" => true}}
    transformed = BossPhases.apply_transformation(boss_with_statuses, transform)
    assert transformed.statuses == []
  end

  test "18. apply_transformation keeps statuses if clear_statuses is not set", %{boss: boss} do
    boss_with_statuses = %{boss | statuses: [%{key: "poison", name: "Poison"}]}
    transform = %{"transform" => %{"name" => "Omega"}}
    transformed = BossPhases.apply_transformation(boss_with_statuses, transform)
    assert length(transformed.statuses) == 1
  end

  test "19. apply_transformation clears cooldowns when requested", %{boss: boss} do
    boss_with_cd = Map.put(boss, :cooldowns, %{101 => 2})
    transform = %{"transform" => %{"clear_cooldowns" => true}}
    transformed = BossPhases.apply_transformation(boss_with_cd, transform)
    assert transformed.cooldowns == %{}
  end

  test "20. apply_phase_stat_mults creates synthetic boss_phase_buff status", %{boss: boss} do
    on_enter = %{"stat_mults" => %{"atk" => 1.5, "speed" => 1.2}}
    updated = BossPhases.apply_phase_stat_mults(boss, on_enter)
    buff = Enum.find(updated.statuses, &(&1[:key] == "boss_phase_buff"))
    assert buff != nil
    assert buff[:permanent] == true
    assert buff[:effects]["atk_mult"] == 1.5
    assert buff[:effects]["speed_mult"] == 1.2
  end

  test "21. apply_phase_stat_mults replaces existing boss_phase_buff without stacking duplicate keys", %{boss: boss} do
    on_enter1 = %{"stat_mults" => %{"atk" => 1.2}}
    on_enter2 = %{"stat_mults" => %{"atk" => 1.8}}

    stage1 = BossPhases.apply_phase_stat_mults(boss, on_enter1)
    stage2 = BossPhases.apply_phase_stat_mults(stage1, on_enter2)

    buffs = Enum.filter(stage2.statuses, &(&1[:key] == "boss_phase_buff"))
    assert length(buffs) == 1
    assert hd(buffs)[:effects]["atk_mult"] == 1.8
  end

  test "22. apply_phase_stat_mults returns unchanged if stat_mults is nil or empty", %{boss: boss} do
    assert BossPhases.apply_phase_stat_mults(boss, %{}) == boss
    assert BossPhases.apply_phase_stat_mults(boss, %{"stat_mults" => %{}}) == boss
  end

  test "23. apply_terrain_changes maps terrain types to grid coordinates", %{state: state} do
    on_enter = %{
      "terrain_change" => %{
        "fire" => [[1, 1], [1, 2]],
        "acid" => [[3, 3]]
      }
    }
    updated_state = BossPhases.apply_terrain_changes(state, on_enter)
    assert updated_state.terrain_map["1,1"] == "fire"
    assert updated_state.terrain_map["1,2"] == "fire"
    assert updated_state.terrain_map["3,3"] == "acid"
  end

  test "24. apply_terrain_changes safely ignores non-list coordinate formats", %{state: state} do
    on_enter = %{
      "terrain_change" => %{
        "fire" => "invalid_coords",
        "ice" => [nil, 123]
      }
    }
    updated_state = BossPhases.apply_terrain_changes(state, on_enter)
    assert is_map(updated_state.terrain_map)
  end

  test "25. enter_phase records boss dialogue action and log", %{state: state, boss: boss, res: res} do
    phase_def = %{
      phase: 1,
      name: "Enraged",
      on_enter: %{"dialogue" => "You will suffer!"}
    }

    {_s, _c, r} = BossPhases.enter_phase(state, boss, phase_def, res)
    dialogue_action = Enum.find(r.actions, &(&1.type == :boss_dialogue))
    assert dialogue_action != nil
    assert dialogue_action.text == "You will suffer!"
    assert Enum.any?(r.log, &String.contains?(&1, "You will suffer!"))
  end
end
