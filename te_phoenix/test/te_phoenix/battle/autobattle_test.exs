defmodule TePhoenix.Battle.AutoBattleTest do
  use ExUnit.Case, async: true

  alias TePhoenix.Battle.{AutoBattle, Combatant}

  defp build_fighter(attrs) do
    skills = Map.get(attrs, :skills, [])
    attrs_clean = Map.delete(attrs, :skills)

    base = %Combatant{
      char_id: 1,
      name: "Fighter",
      team_id: 1,
      current_hp: 100,
      max_hp: 100,
      current_mp: 50,
      max_mp: 50,
      current_ap: 5,
      max_ap: 5,
      threat: 10,
      combo_arts: [],
      limb_hp: %{}
    }

    c = Map.merge(base, Map.new(attrs_clean))
    Map.put(c, :skills, skills)
  end

  defp build_state(attrs \\ %{}) do
    f1 = build_fighter(%{char_id: 1, team_id: 1, name: "Hero"})
    f2 = build_fighter(%{char_id: 2, team_id: 2, name: "Goblin", current_hp: 40, threat: 5})
    f3 = build_fighter(%{char_id: 3, team_id: 2, name: "Ogre", current_hp: 150, threat: 30})

    base = %{
      battle_id: "battle_auto_1",
      combatants: %{1 => f1, 2 => f2, 3 => f3},
      teams: %{1 => [1], 2 => [2, 3]}
    }

    Map.merge(base, Map.new(attrs))
  end

  describe "AutoBattle presets, multipliers & delays" do
    test "1. tactics/0 returns the 5 tactical presets" do
      t = AutoBattle.tactics()
      assert Map.has_key?(t, "aggressive")
      assert Map.has_key?(t, "defensive")
      assert Map.has_key?(t, "balanced")
      assert Map.has_key?(t, "conserve_mp")
      assert Map.has_key?(t, "focus_heal")
    end

    test "2. speed_multipliers/0 defines speed factors for 1x, 2x, and 4x" do
      mults = AutoBattle.speed_multipliers()
      assert mults[1] == 1.0
      assert mults[2] == 0.5
      assert mults[4] == 0.25
    end

    test "3. auto_delay/2 scales base delay by speed factor with 200ms floor" do
      assert AutoBattle.auto_delay(1000, 1) == 1000
      assert AutoBattle.auto_delay(1000, 2) == 500
      assert AutoBattle.auto_delay(1000, 4) == 250
      assert AutoBattle.auto_delay(100, 4) == 200
    end
  end

  describe "AutoBattle target selection strategies" do
    test "4. pick_target :lowest_hp selects enemy with lowest current_hp" do
      e1 = %{char_id: 1, current_hp: 100}
      e2 = %{char_id: 2, current_hp: 25}
      e3 = %{char_id: 3, current_hp: 80}

      target = AutoBattle.pick_target([e1, e2, e3], :lowest_hp)
      assert target.char_id == 2
    end

    test "5. pick_target :highest_threat selects enemy with highest threat rating" do
      e1 = %{char_id: 1, threat: 10}
      e2 = %{char_id: 2, threat: 50}
      e3 = %{char_id: 3, threat: 20}

      target = AutoBattle.pick_target([e1, e2, e3], :highest_threat)
      assert target.char_id == 2
    end

    test "6. pick_target :highest_hp selects enemy with highest current_hp" do
      e1 = %{char_id: 1, current_hp: 50}
      e2 = %{char_id: 2, current_hp: 200}
      e3 = %{char_id: 3, current_hp: 120}

      target = AutoBattle.pick_target([e1, e2, e3], :highest_hp)
      assert target.char_id == 2
    end

    test "7. pick_target default falls back to first enemy in list" do
      e1 = %{char_id: 10}
      e2 = %{char_id: 20}

      target = AutoBattle.pick_target([e1, e2], :random_unknown)
      assert target.char_id == 10
    end
  end

  describe "AutoBattle skill querying" do
    test "8. find_skill_by_type finds damage skills" do
      skills = [
        %{id: 1, name: "Heal", effect_type: "heal", target_type: "ally"},
        %{id: 2, name: "Slash", effect_type: "damage", target_type: "enemy"}
      ]
      c = build_fighter(%{skills: skills})

      skill = AutoBattle.find_skill_by_type(c, :damage)
      assert skill.id == 2
    end

    test "9. find_skill_by_type finds healing skills" do
      skills = [
        %{id: 1, name: "Slash", effect_type: "damage", target_type: "enemy"},
        %{id: 2, name: "Greater Heal", effect_type: "heal", target_type: "ally"}
      ]
      c = build_fighter(%{skills: skills})

      skill = AutoBattle.find_skill_by_type(c, :heal)
      assert skill.id == 2
    end

    test "10. find_skill_by_type returns nil when no matching skill exists" do
      c = build_fighter(%{skills: [%{id: 1, effect_type: "buff", target_type: "self"}]})
      assert AutoBattle.find_skill_by_type(c, :damage) == nil
      assert AutoBattle.find_skill_by_type(c, :heal) == nil
    end
  end

  describe "AutoBattle team and enemy alive queries" do
    test "11. get_team_alive/2 returns living members of specified team" do
      state = build_state()
      alive_team1 = AutoBattle.get_team_alive(state, 1)
      assert length(alive_team1) == 1
      assert hd(alive_team1).char_id == 1

      alive_team2 = AutoBattle.get_team_alive(state, 2)
      assert length(alive_team2) == 2
    end

    test "12. get_team_alive/2 filters out dead combatants (0 HP)" do
      state = build_state()
      state = put_in(state.combatants[2], %{state.combatants[2] | current_hp: 0})

      alive_team2 = AutoBattle.get_team_alive(state, 2)
      assert length(alive_team2) == 1
      assert hd(alive_team2).char_id == 3
    end

    test "13. get_enemies_alive/2 returns all living enemies across opposing teams" do
      state = build_state()
      enemies = AutoBattle.get_enemies_alive(state, 1)
      assert length(enemies) == 2
      assert Enum.map(enemies, & &1.char_id) == [2, 3]
    end

    test "14. get_enemies_alive/2 excludes dead enemies" do
      state = build_state()
      state = put_in(state.combatants[3], %{state.combatants[3] | current_hp: 0})

      enemies = AutoBattle.get_enemies_alive(state, 1)
      assert length(enemies) == 1
      assert hd(enemies).char_id == 2
    end
  end

  describe "AutoBattle.pick_action/3 decisions" do
    test "15. returns %{action: :wait} when no living enemies remain" do
      state = build_state()
      # Kill all enemies
      state = put_in(state.combatants[2], %{state.combatants[2] | current_hp: 0})
      state = put_in(state.combatants[3], %{state.combatants[3] | current_hp: 0})
      hero = state.combatants[1]

      assert AutoBattle.pick_action(state, hero) == %{action: :wait}
    end

    test "16. defensive tactic guards (%{action: :defend}) when HP is below guard_threshold (50%)" do
      state = build_state()
      # Hero at 40% HP (threshold is 50%)
      hero = %{state.combatants[1] | current_hp: 40, max_hp: 100}
      state = put_in(state.combatants[1], hero)

      action = AutoBattle.pick_action(state, hero, "defensive")
      assert action.action == :defend
    end

    test "17. aggressive tactic attacks weakest enemy even when hurt" do
      state = build_state()
      # Goblin has 40 HP, Ogre has 150 HP
      hero = state.combatants[1]

      action = AutoBattle.pick_action(state, hero, "aggressive")
      assert action.action in [:attack, :skill]
      assert action.target_id == 2 # targets Goblin with 40 HP
    end

    test "18. defensive tactic targets highest threat enemy when healthy" do
      state = build_state()
      # Hero at 100% HP (above 50% guard threshold). Ogre has threat 30, Goblin has threat 5.
      hero = state.combatants[1]

      action = AutoBattle.pick_action(state, hero, "defensive")
      assert action.target_id == 3 # targets Ogre with 30 threat
    end

    test "19. conserve_mp tactic chooses basic attack rather than offensive skills" do
      skills = [%{id: 99, name: "Meteor", effect_type: "damage", target_type: "enemy"}]
      state = build_state()
      hero = %{state.combatants[1] | current_mp: 50, max_mp: 50} |> Map.put(:skills, skills)
      state = put_in(state.combatants[1], hero)

      action = AutoBattle.pick_action(state, hero, "conserve_mp")
      assert action.action == :attack
    end

    test "20. aggressive tactic uses offensive skill if available and MP > 20%" do
      skills = [%{id: 42, name: "Fireball", effect_type: "damage", target_type: "enemy"}]
      state = build_state()
      hero = %{state.combatants[1] | current_mp: 40, max_mp: 50} |> Map.put(:skills, skills)
      state = put_in(state.combatants[1], hero)

      action = AutoBattle.pick_action(state, hero, "aggressive")
      assert action.action == :skill
      assert action.skill_id == 42
    end

    test "21. aggressive tactic falls back to basic attack when MP is below 20%" do
      skills = [%{id: 42, name: "Fireball", effect_type: "damage", target_type: "enemy"}]
      state = build_state()
      hero = %{state.combatants[1] | current_mp: 5, max_mp: 50} |> Map.put(:skills, skills) # 10% MP
      state = put_in(state.combatants[1], hero)

      action = AutoBattle.pick_action(state, hero, "aggressive")
      assert action.action == :attack
    end

    test "22. focus_heal tactic casts heal on wounded ally" do
      state = build_state()
      # Ally 4 is wounded
      ally = build_fighter(%{char_id: 4, team_id: 1, current_hp: 20, max_hp: 100})
      heal_skill = %{id: 77, name: "Curaga", effect_type: "heal", target_type: "ally"}
      hero = %{state.combatants[1] | current_mp: 50, max_mp: 50} |> Map.put(:skills, [heal_skill])

      state =
        state
        |> put_in([:combatants, 4], ally)
        |> put_in([:teams, 1], [1, 4])
        |> put_in([:combatants, 1], hero)

      action = AutoBattle.pick_action(state, hero, "focus_heal")
      assert action.action == :skill
      assert action.skill_id == 77
      assert action.target_id == 4
    end

    test "23. picks combo art sequence when combatant has AP and combo arts" do
      arts = [%{name: "Cross Cut", sequence_str: "H,H"}]
      state = build_state()
      hero = %{state.combatants[1] | combo_arts: arts, current_ap: 4}
      state = put_in(state.combatants[1], hero)

      action = AutoBattle.pick_action(state, hero, "balanced")
      assert action.combo_input == "H,H"
    end

    test "24. falls back to default 2-input jab combo when no art fits current AP" do
      # 4-input art but only 2 AP
      arts = [%{name: "Tornado Dance", sequence_str: "L,R,L,R"}]
      state = build_state()
      hero = %{state.combatants[1] | combo_arts: arts, current_ap: 2}
      state = put_in(state.combatants[1], hero)

      action = AutoBattle.pick_action(state, hero, "balanced")
      assert action.combo_input == "H,L"
    end

    test "25. targets head when target is critically wounded (< 35% HP)" do
      state = build_state()
      # Enemy Goblin at 20% HP with healthy head
      goblin = %{state.combatants[2] | current_hp: 20, max_hp: 100, limb_hp: %{"head" => 15}}
      state = put_in(state.combatants[2], goblin)
      hero = state.combatants[1]

      action = AutoBattle.pick_action(state, hero, "aggressive")
      assert action.target_limb == "head"
    end
  end
end
