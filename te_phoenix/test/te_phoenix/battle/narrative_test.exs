defmodule TePhoenix.Battle.NarrativeTest do
  use ExUnit.Case, async: true
  alias TePhoenix.Battle.{Narrative, Combatant}

  setup do
    hero = %Combatant{
      char_id: "hero",
      name: "Rook",
      team_id: 1,
      current_hp: 100,
      max_hp: 100,
      atk: 20,
      mo: 18,
      def: 10,
      level: 5
    }

    ally = %Combatant{
      char_id: "ally",
      name: "Una",
      team_id: 1,
      current_hp: 80,
      max_hp: 100,
      atk: 15,
      mo: 22,
      def: 8,
      level: 5
    }

    enemy = %Combatant{
      char_id: "enemy",
      name: "Goblin Raider",
      team_id: 2,
      current_hp: 60,
      max_hp: 60,
      atk: 12,
      mo: 5,
      def: 6,
      level: 3
    }

    state = %{
      settings: %{
        enable_rp_commands: true,
        enable_rp_descriptions: true,
        enable_combo_procs: true,
        flavor_text_min_length: 15,
        flavor_text_base_bonus: 0.05,
        flavor_text_max_bonus: 0.15,
        flavor_text_keyword_bonus: 0.03,
        flavor_text_keyword_max: 3
      },
      combatants: %{
        "hero" => hero,
        "ally" => ally,
        "enemy" => enemy
      }
    }

    res = %{log: [], actions: []}

    {:ok, state: state, hero: hero, ally: ally, enemy: enemy, res: res}
  end

  test "1. resolve_rp_command rejects command when enable_rp_commands is false", %{
    state: state,
    hero: hero,
    enemy: enemy,
    res: res
  } do
    disabled_state = put_in(state.settings[:enable_rp_commands], false)
    {_s, r} = Narrative.resolve_rp_command(disabled_state, hero, enemy, "taunt", %{}, res)
    assert Enum.any?(r.log, &String.contains?(&1, "RP commands are not enabled"))
  end

  test "2. resolve_rp_command handles unknown rp command gracefully", %{
    state: state,
    hero: hero,
    enemy: enemy,
    res: res
  } do
    {_s, r} = Narrative.resolve_rp_command(state, hero, enemy, "sing_song", %{}, res)
    assert Enum.any?(r.log, &String.contains?(&1, "Unknown RP command"))
  end

  test "3. resolve_rp_command includes flavor text quote in combat log", %{
    state: state,
    hero: hero,
    enemy: enemy,
    res: res
  } do
    quote = "You will feel the fury of a thousand storms!"
    {_s, r} = Narrative.resolve_rp_command(state, hero, enemy, "taunt", %{}, res, quote)
    assert Enum.any?(r.log, &String.contains?(&1, quote))
  end

  test "4. taunt sets taunt_bonus on actor with damage bonus", %{
    state: state,
    hero: hero,
    enemy: enemy,
    res: res
  } do
    effects = %{"self_damage_bonus" => 0.20, "bonus_duration" => 2}
    {s, _r} = Narrative.resolve_rp_command(state, hero, enemy, "taunt", effects, res)
    actor = s.combatants["hero"]
    assert actor.taunt_bonus.damage_bonus >= 0.20
    assert actor.taunt_bonus.turns_left == 2
  end

  test "5. taunt sets taunted targeting on enemy", %{
    state: state,
    hero: hero,
    enemy: enemy,
    res: res
  } do
    effects = %{"aggro_duration" => 3}
    {s, _r} = Narrative.resolve_rp_command(state, hero, enemy, "taunt", effects, res)
    target = s.combatants["enemy"]
    assert target.taunted.by == "hero"
    assert target.taunted.turns_left == 3
  end

  test "6. taunt records :taunt action in result", %{
    state: state,
    hero: hero,
    enemy: enemy,
    res: res
  } do
    {_s, r} = Narrative.resolve_rp_command(state, hero, enemy, "taunt", %{}, res)
    assert Enum.any?(r.actions, &(&1.type == :taunt and &1.actor == "Rook"))
  end

  test "7. intimidate sets intimidated debuff on target on success", %{
    state: state,
    hero: hero,
    enemy: enemy,
    res: res
  } do
    :rand.seed(:exsplus, {1, 2, 3})
    effects = %{"base_chance" => 1.0, "atk_reduction" => 0.25, "accuracy_reduction" => 0.15, "duration" => 3}
    {s, r} = Narrative.resolve_rp_command(state, hero, enemy, "intimidate", effects, res)
    action = Enum.find(r.actions, &(&1.type == :intimidate))
    assert action != nil
    if action.success do
      target = s.combatants["enemy"]
      assert target.intimidated.atk_reduction == 0.25
      assert target.intimidated.turns_left == 3
    else
      assert Enum.any?(r.log, &String.contains?(&1, "stands firm"))
    end
  end

  test "8. intimidate logs failure when roll fails", %{
    state: state,
    hero: hero,
    enemy: enemy,
    res: res
  } do
    # 0% chance guaranteed
    effects = %{"base_chance" => -1.0}
    {_s, r} = Narrative.resolve_rp_command(state, hero, enemy, "intimidate", effects, res)
    assert Enum.any?(r.actions, &(&1.type == :intimidate and &1.success == false))
  end

  test "9. rally buffs living allies on same team with rallied status", %{
    state: state,
    hero: hero,
    res: res
  } do
    effects = %{"atk_bonus" => 0.15, "speed_bonus" => 0.10, "duration" => 2}
    {s, _r} = Narrative.resolve_rp_command(state, hero, nil, "rally", effects, res)
    ally = s.combatants["ally"]
    assert ally.rallied.atk_bonus >= 0.15
    assert ally.rallied.speed_bonus == 0.10
    assert ally.rallied.turns_left == 2
  end

  test "10. rally buffs the actor themselves", %{
    state: state,
    hero: hero,
    res: res
  } do
    effects = %{"atk_bonus" => 0.15, "duration" => 2}
    {s, _r} = Narrative.resolve_rp_command(state, hero, nil, "rally", effects, res)
    actor = s.combatants["hero"]
    assert actor.rallied.atk_bonus >= 0.15
  end

  test "11. rally does not buff dead allies or opposing team members", %{
    state: state,
    hero: hero,
    enemy: enemy,
    res: res
  } do
    dead_ally = %Combatant{char_id: "dead", team_id: 1, current_hp: 0}
    state = put_in(state.combatants["dead"], dead_ally)

    {s, _r} = Narrative.resolve_rp_command(state, hero, nil, "rally", %{}, res)
    assert Map.get(s.combatants["dead"], :rallied) == nil
    assert Map.get(s.combatants[enemy.char_id], :rallied) == nil
  end

  test "12. tick_rp_effects decrements taunt_bonus turns_left" do
    c = %Combatant{taunt_bonus: %{damage_bonus: 0.1, turns_left: 3}}
    ticked = Narrative.tick_rp_effects(c)
    assert ticked.taunt_bonus.turns_left == 2
  end

  test "13. tick_rp_effects removes taunt_bonus when turns reach 1 or 0" do
    c = %Combatant{taunt_bonus: %{damage_bonus: 0.1, turns_left: 1}}
    ticked = Narrative.tick_rp_effects(c)
    assert ticked.taunt_bonus == nil
  end

  test "14. tick_rp_effects decrements and clears intimidated" do
    c2 = %Combatant{intimidated: %{turns_left: 2}}
    assert Narrative.tick_rp_effects(c2).intimidated.turns_left == 1

    c1 = %Combatant{intimidated: %{turns_left: 1}}
    assert Narrative.tick_rp_effects(c1).intimidated == nil
  end

  test "15. tick_rp_effects decrements and clears rallied" do
    c = %Combatant{rallied: %{turns_left: 1}}
    assert Narrative.tick_rp_effects(c).rallied == nil
  end

  test "16. tick_rp_effects decrements and deletes taunted" do
    c = Map.put(%Combatant{}, :taunted, %{by: "hero", turns_left: 1})
    assert Map.get(Narrative.tick_rp_effects(c), :taunted) == nil
  end

  test "17. extract_keywords finds known combat keywords in text" do
    keywords = Narrative.extract_keywords("I charge with radiant fire, delivering a brutal kick to the chest!")
    assert "charge" in keywords
    assert "radiant" in keywords
    assert "fire" in keywords
    assert "brutal" in keywords
    assert "kick" in keywords
    assert "chest" in keywords
  end

  test "18. extract_keywords returns empty list for text with no combat words or nil" do
    assert Narrative.extract_keywords(nil) == []
    assert Narrative.extract_keywords("hello there, nice day") == []
  end

  test "19. evaluate_flavor_bonus returns 0 if text is below min length", %{state: state} do
    short = "kick him"
    assert Narrative.evaluate_flavor_bonus(short, state.settings) == 0
  end

  test "20. evaluate_flavor_bonus adds keyword bonuses capped at max_bonus", %{state: state} do
    long_action = "I leap forward with blazing fire and slash with a brutal strike across the chest!"
    bonus = Narrative.evaluate_flavor_bonus(long_action, state.settings)
    assert bonus >= 0.08
    assert bonus <= 0.15
  end

  test "21. resolve_signature_tech interpolates name and skill into battle text", %{
    state: state,
    hero: hero,
    enemy: enemy,
    res: res
  } do
    tech = %{
      name: "Solar Flare",
      tech_type: "physical",
      battle_text: "{name} commands the heavens with {skill}!",
      damage_pct: 0.50
    }
    {_s, r} = Narrative.resolve_signature_tech(state, hero, enemy, tech, res)
    assert Enum.any?(r.log, &String.contains?(&1, "Rook commands the heavens with Solar Flare!"))
  end

  test "22. resolve_signature_tech physical attack costs no HP and damages target", %{
    state: state,
    hero: hero,
    enemy: enemy,
    res: res
  } do
    tech = %{
      name: "Iron Breaker",
      tech_type: "physical",
      damage_pct: 0.50
    }
    {s, _r} = Narrative.resolve_signature_tech(state, hero, enemy, tech, res)
    updated_hero = s.combatants["hero"]
    updated_enemy = s.combatants["enemy"]
    assert updated_hero.current_hp == hero.current_hp
    assert updated_enemy.current_hp < enemy.current_hp
  end

  test "23. resolve_signature_tech ki_attack deducts HP cost and deals MO-based damage", %{
    state: state,
    hero: hero,
    enemy: enemy,
    res: res
  } do
    tech = %{
      name: "Spirit Blast",
      tech_type: "ki_attack",
      cost_pct: 0.10,
      damage_pct: 0.60
    }
    {s, _r} = Narrative.resolve_signature_tech(state, hero, enemy, tech, res)
    updated_hero = s.combatants["hero"]
    updated_enemy = s.combatants["enemy"]
    assert updated_hero.current_hp < hero.current_hp
    assert updated_enemy.current_hp < enemy.current_hp
  end

  test "24. resolve_signature_tech ki_heal restores HP to damaged ally", %{
    state: state,
    hero: hero,
    ally: ally,
    res: res
  } do
    hurt_ally = %{ally | current_hp: 40}
    state = put_in(state.combatants["ally"], hurt_ally)

    tech = %{
      name: "Healing Aura",
      tech_type: "ki_heal",
      cost_pct: 0.10,
      heal_pct: 0.30
    }
    {s, r} = Narrative.resolve_signature_tech(state, hero, hurt_ally, tech, res)
    updated_ally = s.combatants["ally"]
    assert updated_ally.current_hp == 70
    assert Enum.any?(r.actions, &(&1.type == :sig_tech_heal))
  end

  test "25. resolve_combo_proc returns unchanged when combo_procs disabled or chance is 0", %{
    state: state,
    hero: hero,
    enemy: enemy,
    res: res
  } do
    disabled_state = put_in(state.settings[:enable_combo_procs], false)
    {s, r} = Narrative.resolve_combo_proc(disabled_state, hero, enemy, 0.5, 3, res)
    assert s == disabled_state
    assert r == res

    {s2, r2} = Narrative.resolve_combo_proc(state, hero, enemy, 0, 3, res)
    assert s2 == state
    assert r2 == res
  end
end
