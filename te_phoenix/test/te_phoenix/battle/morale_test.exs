defmodule TePhoenix.Battle.MoraleTest do
  use ExUnit.Case, async: true

  alias TePhoenix.Battle.Morale

  defp base_state(opts \\ []) do
    enabled = Keyword.get(opts, :enable_morale, true)

    %{
      settings: %{
        enable_morale: enabled,
        starting_morale: 100,
        max_morale: 100,
        flee_threshold: 20,
        personality_brave_bonus: 20,
        personality_coward_penalty: -20,
        critical_hit_loss: 10,
        heavy_damage_loss: 10,
        heavy_damage_pct: 0.30,
        low_hp_threshold: 0.25,
        low_hp_loss: 15,
        heal_received_gain: 5,
        idle_turn_gain: 3,
        enemy_kill_gain: 10,
        ally_death_loss: 20,
        leader_death_loss: 30,
        rout_on_leader_flee: true
      },
      teams: %{
        1 => [1, 2],
        2 => [3, 4]
      },
      combatants: %{
        1 => %{id: 1, name: "GoblinGrunt", team_id: 1, is_ai: true, current_hp: 50, max_hp: 50, personality: "standard"},
        2 => %{id: 2, name: "GoblinBoss", team_id: 1, is_ai: true, current_hp: 120, max_hp: 120, personality: "brave", is_boss: true},
        3 => %{id: 3, name: "Hero", team_id: 2, is_ai: false, current_hp: 100, max_hp: 100, personality: "standard"},
        4 => %{id: 4, name: "FanaticCultist", team_id: 2, is_ai: true, current_hp: 60, max_hp: 60, personality: "fanatic"}
      }
    }
  end

  describe "Morale.init_morale/1" do
    test "initializes morale for standard combatant to starting value" do
      state = base_state() |> Morale.init_morale()
      assert state.combatants[1].morale == 100
      assert state.combatants[1].morale_fanatic == false
      assert state.combatants[1].morale_is_leader == false
    end

    test "marks boss as morale_is_leader and caps at max_morale" do
      state = base_state() |> Morale.init_morale()
      assert state.combatants[2].morale_is_leader == true
      # 100 + 20 brave bonus capped at max_morale 100
      assert state.combatants[2].morale == 100
    end

    test "marks fanatic personality as morale_fanatic" do
      state = base_state() |> Morale.init_morale()
      assert state.combatants[4].morale_fanatic == true
    end

    test "applies coward penalty when configured" do
      state = base_state()
      c = %{state.combatants[1] | personality: "coward"}
      state = %{state | combatants: Map.put(state.combatants, 1, c)}
      state = Morale.init_morale(state)
      assert state.combatants[1].morale == 80
    end

    test "does nothing when morale is disabled" do
      state = base_state(enable_morale: false) |> Morale.init_morale()
      refute Map.has_key?(state.combatants[1], :morale)
    end
  end

  describe "Morale.adjust_morale/3" do
    test "increases morale up to max_morale" do
      state = base_state() |> Morale.init_morale()
      state = Morale.adjust_morale(state, 1, -30)
      assert state.combatants[1].morale == 70

      state = Morale.adjust_morale(state, 1, 15)
      assert state.combatants[1].morale == 85

      state = Morale.adjust_morale(state, 1, 50)
      assert state.combatants[1].morale == 100
    end

    test "clamps morale at 0 on heavy loss" do
      state = base_state() |> Morale.init_morale()
      state = Morale.adjust_morale(state, 1, -200)
      assert state.combatants[1].morale == 0
    end

    test "fanatics are immune to morale adjustments" do
      state = base_state() |> Morale.init_morale()
      state = Morale.adjust_morale(state, 4, -50)
      assert state.combatants[4].morale == 100
    end

    test "non-AI combatants ignore morale adjustments" do
      state = base_state() |> Morale.init_morale()
      state = Morale.adjust_morale(state, 3, -50)
      assert state.combatants[3].morale == 100
    end

    test "handles unknown combatant id gracefully" do
      state = base_state() |> Morale.init_morale()
      assert Morale.adjust_morale(state, 999, -10) == state
    end
  end

  describe "Morale.on_combatant_death/2" do
    test "boosts enemy morale and drops ally morale when a combatant dies" do
      state = base_state() |> Morale.init_morale()
      # Set starting morale lower to see both drops and gains clearly
      state = Morale.adjust_morale(state, 1, -40)
      state = Morale.adjust_morale(state, 2, -40)

      {new_state, flee_events} = Morale.on_combatant_death(state, 1)

      # Ally (GoblinBoss id 2) loses 20 ally_death_loss (60 - 20 = 40)
      assert new_state.combatants[2].morale == 40
      # Enemies (team 2) gain 10 morale (Hero id 3 is non-AI so ignored, but Fanatic id 4 is fanatic)
      assert is_list(flee_events)
    end

    test "ally death triggers leader_death_loss when fallen unit is leader" do
      state = base_state() |> Morale.init_morale()
      state = Morale.adjust_morale(state, 1, -50) # Grunt now at 50

      # Boss (id 2) dies -> leader loss is 30
      {new_state, _flee_events} = Morale.on_combatant_death(state, 2)
      assert new_state.combatants[1].morale == 20
    end

    test "generates flee event when morale drops to or below flee_threshold" do
      state = base_state() |> Morale.init_morale()
      state = Morale.adjust_morale(state, 1, -70) # Grunt now at 30

      # Boss dies -> Grunt loses 30 -> drops to 0 (below threshold 20) -> flees!
      {_new_state, flee_events} = Morale.on_combatant_death(state, 2)
      assert length(flee_events) == 1
      [event] = flee_events
      assert event.type == :morale_flee
      assert event.combatant_id == 1
      assert event.reason == :leader_fell
    end

    test "returns empty events when dead combatant does not exist" do
      state = base_state() |> Morale.init_morale()
      assert {_s, []} = Morale.on_combatant_death(state, 999)
    end
  end

  describe "Morale.on_damage_taken/4" do
    test "penalizes critical hits" do
      state = base_state() |> Morale.init_morale()
      state = Morale.on_damage_taken(state, 1, 5, true)
      assert state.combatants[1].morale == 90
    end

    test "penalizes heavy damage exceeding threshold percentage" do
      state = base_state() |> Morale.init_morale()
      # Max HP is 50. 20 damage is 40% (exceeds heavy_damage_pct of 30%)
      state = Morale.on_damage_taken(state, 1, 20, false)
      assert state.combatants[1].morale == 90
    end

    test "applies combined critical and heavy damage loss" do
      state = base_state() |> Morale.init_morale()
      # 20 damage on 50 HP with crit -> 10 crit loss + 10 heavy loss = -20
      state = Morale.on_damage_taken(state, 1, 20, true)
      assert state.combatants[1].morale == 80
    end
  end

  describe "Morale recovery mechanics" do
    test "on_heal_received restores morale" do
      state = base_state() |> Morale.init_morale()
      state = Morale.adjust_morale(state, 1, -20)
      assert state.combatants[1].morale == 80

      state = Morale.on_heal_received(state, 1)
      assert state.combatants[1].morale == 85
    end

    test "on_idle_turn restores idle morale" do
      state = base_state() |> Morale.init_morale()
      state = Morale.adjust_morale(state, 1, -10)
      assert state.combatants[1].morale == 90

      state = Morale.on_idle_turn(state, 1)
      assert state.combatants[1].morale == 93
    end
  end

  describe "Morale.should_flee?/2" do
    test "returns true when morale is at or below flee threshold" do
      state = base_state() |> Morale.init_morale()
      state = Morale.adjust_morale(state, 1, -85) # Morale is 15 <= 20
      assert Morale.should_flee?(state, 1) == true
    end

    test "returns false when morale is above flee threshold" do
      state = base_state() |> Morale.init_morale()
      assert Morale.should_flee?(state, 1) == false
    end

    test "returns false for fanatic even when morale would be low" do
      state = base_state() |> Morale.init_morale()
      assert Morale.should_flee?(state, 4) == false
    end
  end
end
