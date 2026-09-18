defmodule TePhoenix.Battle.ReactionsTest do
  use ExUnit.Case, async: true
  alias TePhoenix.Battle.{Reactions, Combatant}

  setup do
    c1 = %Combatant{
      char_id: "c1",
      name: "Rook",
      team_id: 1,
      current_hp: 80,
      max_hp: 100,
      atk: 20,
      def: 10
    }

    c2 = %Combatant{
      char_id: "c2",
      name: "Viper",
      team_id: 2,
      current_hp: 90,
      max_hp: 100,
      atk: 25,
      def: 8
    }

    ally = %Combatant{
      char_id: "c3",
      name: "Una",
      team_id: 1,
      current_hp: 40,
      max_hp: 100,
      atk: 15,
      def: 5
    }

    state = %{
      settings: %{enable_reactions: true},
      combatants: %{"c1" => c1, "c2" => c2, "c3" => ally}
    }

    initial_result = %{log: [], actions: []}

    {:ok, state: state, c1: c1, c2: c2, ally: ally, result: initial_result}
  end

  test "1. check_reactions returns unchanged when enable_reactions is false", %{state: state, c1: c1, result: res} do
    disabled_state = %{state | settings: %{enable_reactions: false}}
    {s, r} = Reactions.check_reactions(disabled_state, c1, "damage_taken", [], res)
    assert s == disabled_state
    assert r == res
  end

  test "2. check_reactions returns unchanged when combatant has 0 reactions_remaining", %{state: state, c1: c1, result: res} do
    exhausted_c1 = %{c1 | reactions_remaining: 0}
    {s, r} = Reactions.check_reactions(state, exhausted_c1, "damage_taken", [], res)
    assert s == state
    assert r == res
  end

  test "3. reset_charges resets reactions_remaining to 1", %{c1: c1} do
    c = %{c1 | reactions_remaining: 0}
    reset = Reactions.reset_charges(c)
    assert reset.reactions_remaining == 1
  end

  test "4. condition_match? returns true for nil or empty condition", %{c1: c1} do
    assert Reactions.condition_match?(nil, [], c1) == true
    assert Reactions.condition_match?(%{}, [], c1) == true
  end

  test "5. condition_match? checks damage_type accurately", %{c1: c1} do
    cond_phys = %{"damage_type" => "physical"}
    assert Reactions.condition_match?(cond_phys, [damage_type: "physical"], c1) == true
    assert Reactions.condition_match?(cond_phys, [damage_type: "magical"], c1) == false
  end

  test "6. condition_match? checks hp_below_pct accurately", %{c1: c1} do
    # c1 has 80/100 = 0.8
    cond_low = %{"hp_below_pct" => 0.5}
    cond_high = %{"hp_below_pct" => 0.9}
    assert Reactions.condition_match?(cond_low, [], c1) == false
    assert Reactions.condition_match?(cond_high, [], c1) == true
  end

  test "7. condition_match? checks hp_above_pct accurately", %{c1: c1} do
    # c1 has 80/100 = 0.8
    cond_threshold = %{"hp_above_pct" => 0.7}
    cond_too_high = %{"hp_above_pct" => 0.85}
    assert Reactions.condition_match?(cond_threshold, [], c1) == true
    assert Reactions.condition_match?(cond_too_high, [], c1) == false
  end

  test "8. condition_match? checks element string match", %{c1: c1} do
    cond_fire = %{"element" => "fire"}
    assert Reactions.condition_match?(cond_fire, [element: "fire"], c1) == true
    assert Reactions.condition_match?(cond_fire, [element: "ice"], c1) == false
  end

  test "9. condition_match? checks is_ranged and is_melee range values", %{c1: c1} do
    cond_ranged = %{"is_ranged" => true}
    cond_melee = %{"is_melee" => true}

    assert Reactions.condition_match?(cond_ranged, [range: 3], c1) == true
    assert Reactions.condition_match?(cond_ranged, [range: 1], c1) == false

    assert Reactions.condition_match?(cond_melee, [range: 1], c1) == true
    assert Reactions.condition_match?(cond_melee, [], c1) == true
    assert Reactions.condition_match?(cond_melee, [range: 2], c1) == false
  end

  test "10. fires passive reaction even if not in equipped list", %{state: state, c1: c1, c2: c2, result: res} do
    passive_counter = %{
      key: "auto_counter",
      name: "Auto Counter",
      trigger_event: "damage_taken",
      condition: %{},
      effect_type: "counter_attack",
      effect: %{"damage_formula" => "ATK*1"},
      priority: 10,
      passive: true,
      icon: "⚡"
    }

    ctx = [definitions: [passive_counter], attacker: c2]
    {new_state, new_res} = Reactions.check_reactions(state, c1, "damage_taken", ctx, res)

    # c1 reactions remaining consumed
    updated_c1 = new_state.combatants["c1"]
    assert updated_c1.reactions_remaining == 0

    # attacker took counter damage
    updated_c2 = new_state.combatants["c2"]
    assert updated_c2.current_hp < c2.current_hp
    assert Enum.any?(new_res.actions, &(&1.type == :reaction_counter))
  end

  test "11. ignores unequipped non-passive reaction", %{state: state, c1: c1, c2: c2, result: res} do
    active_counter = %{
      key: "parry_strike",
      name: "Parry Strike",
      trigger_event: "damage_taken",
      condition: %{},
      effect_type: "counter_attack",
      effect: %{"damage_formula" => "ATK*1"},
      priority: 10,
      passive: false,
      icon: "⚡"
    }

    c1_unequipped = Map.put(c1, :equipped_reactions, [])
    ctx = [definitions: [active_counter], attacker: c2]
    {_new_state, new_res} = Reactions.check_reactions(state, c1_unequipped, "damage_taken", ctx, res)

    assert new_res.actions == []
  end

  test "12. fires equipped non-passive reaction", %{state: state, c1: c1, c2: c2, result: res} do
    active_counter = %{
      key: "parry_strike",
      name: "Parry Strike",
      trigger_event: "damage_taken",
      condition: %{},
      effect_type: "counter_attack",
      effect: %{"damage_formula" => "ATK*1"},
      priority: 10,
      passive: false,
      icon: "⚡"
    }

    c1_equipped = Map.put(c1, :equipped_reactions, ["parry_strike"])
    ctx = [definitions: [active_counter], attacker: c2]
    {new_state, new_res} = Reactions.check_reactions(state, c1_equipped, "damage_taken", ctx, res)

    assert Enum.any?(new_res.actions, &(&1.type == :reaction_counter))
    assert new_state.combatants["c1"].reactions_remaining == 0
  end

  test "13. consumes exactly one reaction charge when triggered", %{state: state, c1: c1, c2: c2, result: res} do
    reaction = %{
      key: "heal_on_hit",
      name: "Hit Recovery",
      trigger_event: "damage_taken",
      condition: %{},
      effect_type: "auto_heal",
      effect: %{"heal_pct" => 0.1},
      priority: 10,
      passive: true,
      icon: "💚"
    }

    c1_with_charges = Map.put(c1, :reactions_remaining, 1)
    ctx = [definitions: [reaction], attacker: c2]
    {new_state, _res} = Reactions.check_reactions(state, c1_with_charges, "damage_taken", ctx, res)

    assert new_state.combatants["c1"].reactions_remaining == 0
  end

  test "14. prioritizes reaction with higher priority value", %{state: state, c1: c1, c2: c2, result: res} do
    low_prio = %{
      key: "low_prio",
      name: "Low Prio",
      trigger_event: "damage_taken",
      condition: %{},
      effect_type: "auto_heal",
      effect: %{"heal_pct" => 0.1},
      priority: 10,
      passive: true,
      icon: "💚"
    }

    high_prio = %{
      key: "high_prio",
      name: "High Prio",
      trigger_event: "damage_taken",
      condition: %{},
      effect_type: "counter_attack",
      effect: %{"damage_formula" => "ATK*1"},
      priority: 100,
      passive: true,
      icon: "⚡"
    }

    ctx = [definitions: [low_prio, high_prio], attacker: c2]
    {_new_state, new_res} = Reactions.check_reactions(state, c1, "damage_taken", ctx, res)

    # High priority counter should execute, not auto_heal
    assert Enum.any?(new_res.actions, &(Map.get(&1, :reaction) == "high_prio"))
    refute Enum.any?(new_res.actions, &(Map.get(&1, :reaction) == "low_prio"))
  end

  test "15. counter_attack deals damage and logs hit against attacker", %{state: state, c1: c1, c2: c2, result: res} do
    counter = %{
      key: "counter",
      name: "Counter",
      trigger_event: "damage_taken",
      condition: %{},
      effect_type: "counter_attack",
      effect: %{"damage_formula" => "ATK*1"},
      priority: 50,
      passive: true,
      icon: "↩️"
    }

    ctx = [definitions: [counter], attacker: c2]
    {new_state, new_res} = Reactions.check_reactions(state, c1, "damage_taken", ctx, res)

    updated_c2 = new_state.combatants["c2"]
    assert updated_c2.current_hp < c2.current_hp
    assert Enum.any?(new_res.log, &String.contains?(&1, "counters for"))
  end

  test "16. counter_attack does nothing if attacker is dead or nil", %{state: state, c1: c1, c2: c2, result: res} do
    dead_c2 = %{c2 | current_hp: 0}
    counter = %{
      key: "counter",
      name: "Counter",
      trigger_event: "damage_taken",
      condition: %{},
      effect_type: "counter_attack",
      effect: %{"damage_formula" => "ATK*1"},
      priority: 50,
      passive: true,
      icon: "↩️"
    }

    ctx = [definitions: [counter], attacker: dead_c2]
    {_new_state, new_res} = Reactions.check_reactions(state, c1, "damage_taken", ctx, res)

    refute Enum.any?(new_res.actions, &(&1.type == :reaction_counter))
  end

  test "17. auto_heal restores HP to combatant", %{state: state, c1: c1, result: res} do
    hurt_c1 = %{c1 | current_hp: 30, max_hp: 100}
    state = put_in(state.combatants["c1"], hurt_c1)

    auto_heal = %{
      key: "emergency_heal",
      name: "Emergency Heal",
      trigger_event: "turn_start",
      condition: %{},
      effect_type: "auto_heal",
      effect: %{"heal_pct" => 0.25},
      priority: 50,
      passive: true,
      icon: "💚"
    }

    ctx = [definitions: [auto_heal]]
    {new_state, new_res} = Reactions.check_reactions(state, hurt_c1, "turn_start", ctx, res)

    updated_c1 = new_state.combatants["c1"]
    assert updated_c1.current_hp == 55
    assert Enum.any?(new_res.actions, &(&1.type == :reaction_heal))
  end

  test "18. opportunity_attack strikes fleeing mover", %{state: state, c1: c1, c2: c2, result: res} do
    opp = %{
      key: "flank_strike",
      name: "Flank Strike",
      trigger_event: "enemy_move",
      condition: %{},
      effect_type: "opportunity_attack",
      effect: %{"damage_formula" => "ATK*1"},
      priority: 50,
      passive: true,
      icon: "⚔️"
    }

    ctx = [definitions: [opp], mover: c2]
    {new_state, new_res} = Reactions.check_reactions(state, c1, "enemy_move", ctx, res)

    updated_c2 = new_state.combatants["c2"]
    assert updated_c2.current_hp < c2.current_hp
    assert Enum.any?(new_res.actions, &(&1.type == :opportunity_attack))
  end

  test "19. guard_ally takes damage for an injured ally", %{state: state, c1: c1, ally: ally, result: res} do
    guard = %{
      key: "shield_wall",
      name: "Shield Wall",
      trigger_event: "ally_hit",
      condition: %{},
      effect_type: "guard_ally",
      effect: %{},
      priority: 50,
      passive: true,
      icon: "🛡️"
    }

    ctx = [definitions: [guard], victim: ally, damage: 15]
    {new_state, new_res} = Reactions.check_reactions(state, c1, "ally_hit", ctx, res)

    updated_guardian = new_state.combatants["c1"]
    assert updated_guardian.current_hp == c1.current_hp - 15
    assert Enum.any?(new_res.actions, &(&1.type == :guard_ally))
  end

  test "20. guard_ally does nothing if victim is the guardian themselves", %{state: state, c1: c1, result: res} do
    guard = %{
      key: "shield_wall",
      name: "Shield Wall",
      trigger_event: "ally_hit",
      condition: %{},
      effect_type: "guard_ally",
      effect: %{},
      priority: 50,
      passive: true,
      icon: "🛡️"
    }

    ctx = [definitions: [guard], victim: c1, damage: 15]
    {new_state, new_res} = Reactions.check_reactions(state, c1, "ally_hit", ctx, res)

    assert new_state.combatants["c1"].current_hp == c1.current_hp
    refute Enum.any?(new_res.actions, &(&1.type == :guard_ally))
  end

  test "21. evasion attempts an evade roll and logs success or failure", %{state: state, c1: c1, result: res} do
    evade = %{
      key: "shadow_step",
      name: "Shadow Step",
      trigger_event: "damage_taken",
      condition: %{},
      effect_type: "evasion",
      effect: %{"evasion_chance" => 1.0},
      priority: 50,
      passive: true,
      icon: "💨"
    }

    ctx = [definitions: [evade]]
    {_new_state, new_res} = Reactions.check_reactions(state, c1, "damage_taken", ctx, res)

    evasion_action = Enum.find(new_res.actions, &(&1.type == :reaction_evasion))
    assert evasion_action != nil
    assert evasion_action.success == true
  end

  test "22. reflect damages attacker with half incoming damage", %{state: state, c1: c1, c2: c2, result: res} do
    reflect = %{
      key: "mirror_shield",
      name: "Mirror Shield",
      trigger_event: "damage_taken",
      condition: %{},
      effect_type: "reflect",
      effect: %{},
      priority: 50,
      passive: true,
      icon: "🪞"
    }

    ctx = [definitions: [reflect], attacker: c2, damage: 40]
    {new_state, new_res} = Reactions.check_reactions(state, c1, "damage_taken", ctx, res)

    updated_c2 = new_state.combatants["c2"]
    assert updated_c2.current_hp == c2.current_hp - 20
    assert Enum.any?(new_res.actions, &(&1.type == :reaction_reflect))
  end

  test "23. reflect does nothing if damage is 0 or negative", %{state: state, c1: c1, c2: c2, result: res} do
    reflect = %{
      key: "mirror_shield",
      name: "Mirror Shield",
      trigger_event: "damage_taken",
      condition: %{},
      effect_type: "reflect",
      effect: %{},
      priority: 50,
      passive: true,
      icon: "🪞"
    }

    ctx = [definitions: [reflect], attacker: c2, damage: 0]
    {new_state, new_res} = Reactions.check_reactions(state, c1, "damage_taken", ctx, res)

    assert new_state.combatants["c2"].current_hp == c2.current_hp
    refute Enum.any?(new_res.actions, &(&1.type == :reaction_reflect))
  end

  test "24. baton_pass passes turn to an alive teammate", %{state: state, c1: c1, ally: _ally, result: res} do
    baton = %{
      key: "relay",
      name: "Relay",
      trigger_event: "weakness_hit",
      condition: %{},
      effect_type: "baton_pass",
      effect: %{},
      priority: 50,
      passive: true,
      icon: "🤝"
    }

    ctx = [definitions: [baton]]
    {_new_state, new_res} = Reactions.check_reactions(state, c1, "weakness_hit", ctx, res)

    pass_action = Enum.find(new_res.actions, &(&1.type == :baton_pass))
    assert pass_action != nil
    assert pass_action.from == "Rook"
    assert pass_action.to == "Una"
    assert pass_action.to_id == "c3"
  end

  test "25. apply_status applies status to combatant or attacker", %{state: state, c1: c1, c2: c2, result: res} do
    thorn = %{
      key: "thorns",
      name: "Thorns",
      trigger_event: "damage_taken",
      condition: %{},
      effect_type: "apply_status",
      effect: %{"to" => "attacker", "status" => "poison"},
      priority: 50,
      passive: true,
      icon: "🌿"
    }

    ctx = [definitions: [thorn], attacker: c2]
    {new_state, _new_res} = Reactions.check_reactions(state, c1, "damage_taken", ctx, res)

    updated_c2 = new_state.combatants["c2"]
    assert Enum.any?(updated_c2.statuses, &(Map.get(&1, :key) == "poison"))
  end
end
