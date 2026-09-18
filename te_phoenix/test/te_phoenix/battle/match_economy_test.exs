defmodule TePhoenix.Battle.MatchEconomyTest do
  use ExUnit.Case, async: true

  alias TePhoenix.Battle.MatchEconomy

  defp build_state(settings \\ %{}) do
    combatants = %{
      1 => %{char_id: 1, name: "Carry", current_hp: 100, team_id: 1},
      2 => %{char_id: 2, name: "Support", current_hp: 80, team_id: 1},
      3 => %{char_id: 3, name: "Enemy Offlaner", current_hp: 120, team_id: 2}
    }

    base = %{
      battle_id: "moba_match_1",
      combatants: combatants
    }

    MatchEconomy.init(base, settings)
  end

  describe "MatchEconomy.init/2 and state initialization" do
    test "1. initializes zero starting gold by default for all combatants" do
      state = build_state()
      assert MatchEconomy.get_gold(state, 1) == 0
      assert MatchEconomy.get_gold(state, 2) == 0
      assert MatchEconomy.get_gold(state, 3) == 0
    end

    test "2. initializes custom starting gold when configured in settings" do
      state = build_state(%{starting_gold: 600})
      assert MatchEconomy.get_gold(state, 1) == 600
      assert MatchEconomy.get_gold(state, 2) == 600
      assert MatchEconomy.get_gold(state, 3) == 600
    end

    test "3. initializes empty purchased items list for all combatants" do
      state = build_state()
      assert MatchEconomy.get_purchased(state, 1) == []
      assert MatchEconomy.get_purchased(state, 2) == []
    end

    test "4. get_gold/2 returns 0 for combatant not in match" do
      state = build_state()
      assert MatchEconomy.get_gold(state, 999) == 0
    end

    test "5. get_purchased/2 returns empty list for combatant not in match" do
      state = build_state()
      assert MatchEconomy.get_purchased(state, 999) == []
    end

    test "6. stores default economy rates when no overrides provided" do
      state = build_state()
      settings = state.match_economy.settings
      assert settings.gold_per_kill == 300
      assert settings.gold_per_assist == 150
      assert settings.gold_per_objective == 200
      assert settings.gold_per_tick == 0
      assert settings.sell_refund_pct == 0.50
    end
  end

  describe "MatchEconomy.award_gold/4 basic rewards" do
    test "7. adds gold amount to combatant balance" do
      state = build_state()
      {state, _} = MatchEconomy.award_gold(state, 1, 250, "bounty")
      assert MatchEconomy.get_gold(state, 1) == 250
    end

    test "8. stacks multiple gold awards sequentially" do
      state = build_state()
      {state, _} = MatchEconomy.award_gold(state, 1, 100, "wave 1")
      {state, _} = MatchEconomy.award_gold(state, 1, 150, "wave 2")
      assert MatchEconomy.get_gold(state, 1) == 250
    end

    test "9. logs transaction message in result" do
      state = build_state()
      {_state, result} = MatchEconomy.award_gold(state, 1, 75, "minion")
      assert hd(result.log) =~ "Carry earned 75 gold (minion)"
    end

    test "10. generates gold_awarded action map with complete details" do
      state = build_state()
      {_state, result} = MatchEconomy.award_gold(state, 2, 50, "assist")
      action = hd(result.actions)

      assert action.type == :gold_awarded
      assert action.char_id == 2
      assert action.amount == 50
      assert action.reason == "assist"
      assert action.total == 50
    end

    test "11. zero or negative gold award leaves state and log unchanged" do
      state = build_state(%{starting_gold: 100})
      {s1, r1} = MatchEconomy.award_gold(state, 1, 0, "nothing")
      assert MatchEconomy.get_gold(s1, 1) == 100
      assert r1.actions == []

      {s2, r2} = MatchEconomy.award_gold(state, 1, -50, "penalty")
      assert MatchEconomy.get_gold(s2, 1) == 100
      assert r2.actions == []
    end

    test "12. awarding gold to one combatant does not modify others" do
      state = build_state()
      {state, _} = MatchEconomy.award_gold(state, 1, 300, "first blood")
      assert MatchEconomy.get_gold(state, 1) == 300
      assert MatchEconomy.get_gold(state, 2) == 0
      assert MatchEconomy.get_gold(state, 3) == 0
    end
  end

  describe "MatchEconomy game event rewards" do
    test "13. award_kill_gold/3 awards default 300 gold" do
      state = build_state()
      {state, result} = MatchEconomy.award_kill_gold(state, 1, 3)
      assert MatchEconomy.get_gold(state, 1) == 300
      assert hd(result.log) =~ "kill on Enemy Offlaner"
    end

    test "14. award_kill_gold/3 respects custom gold_per_kill setting" do
      state = build_state(%{gold_per_kill: 450})
      {state, _} = MatchEconomy.award_kill_gold(state, 1, 3)
      assert MatchEconomy.get_gold(state, 1) == 450
    end

    test "15. award_assist_gold/3 awards default 150 gold" do
      state = build_state()
      {state, result} = MatchEconomy.award_assist_gold(state, 2, 3)
      assert MatchEconomy.get_gold(state, 2) == 150
      assert hd(result.log) =~ "assist on Enemy Offlaner"
    end

    test "16. award_assist_gold/3 respects custom gold_per_assist setting" do
      state = build_state(%{gold_per_assist: 175})
      {state, _} = MatchEconomy.award_assist_gold(state, 2, 3)
      assert MatchEconomy.get_gold(state, 2) == 175
    end

    test "17. award_objective_gold/3 awards default 200 gold with objective name in reason" do
      state = build_state()
      {state, result} = MatchEconomy.award_objective_gold(state, 1, "Roshan Slain")
      assert MatchEconomy.get_gold(state, 1) == 200
      assert hd(result.log) =~ "objective: Roshan Slain"
    end

    test "18. award_objective_gold/3 respects custom gold_per_objective setting" do
      state = build_state(%{gold_per_objective: 350})
      {state, _} = MatchEconomy.award_objective_gold(state, 1, "Tower 1")
      assert MatchEconomy.get_gold(state, 1) == 350
    end
  end

  describe "MatchEconomy.tick_passive_gold/1" do
    test "19. returns empty result when gold_per_tick is 0" do
      state = build_state(%{gold_per_tick: 0})
      {new_state, result} = MatchEconomy.tick_passive_gold(state)
      assert MatchEconomy.get_gold(new_state, 1) == 0
      assert result == %{log: [], actions: []}
    end

    test "20. awards passive gold to all living combatants" do
      state = build_state(%{gold_per_tick: 10})
      {state, result} = MatchEconomy.tick_passive_gold(state)

      assert MatchEconomy.get_gold(state, 1) == 10
      assert MatchEconomy.get_gold(state, 2) == 10
      assert MatchEconomy.get_gold(state, 3) == 10
      assert length(result.actions) == 3
    end

    test "21. dead combatants (0 HP) do not receive passive gold" do
      state = build_state(%{gold_per_tick: 20})
      # Kill combatant 3
      state = put_in(state.combatants[3].current_hp, 0)

      {state, result} = MatchEconomy.tick_passive_gold(state)

      assert MatchEconomy.get_gold(state, 1) == 20
      assert MatchEconomy.get_gold(state, 2) == 20
      assert MatchEconomy.get_gold(state, 3) == 0
      assert length(result.actions) == 2
    end

    test "22. consecutive passive ticks accumulate accurately" do
      state = build_state(%{gold_per_tick: 15})
      {s1, _} = MatchEconomy.tick_passive_gold(state)
      {s2, _} = MatchEconomy.tick_passive_gold(s1)
      {s3, _} = MatchEconomy.tick_passive_gold(s2)

      assert MatchEconomy.get_gold(s3, 1) == 45
    end
  end

  describe "MatchEconomy fallback initialization and resilience" do
    test "23. award_gold initializes economy automatically if state lacks match_economy" do
      raw_state = %{
        combatants: %{
          1 => %{char_id: 1, name: "Lone Wanderer", current_hp: 100}
        }
      }

      {updated, result} = MatchEconomy.award_gold(raw_state, 1, 100, "recovery")
      assert MatchEconomy.get_gold(updated, 1) == 100
      assert length(result.actions) == 1
    end

    test "24. preserves battle_id and combatants across economy operations" do
      state = build_state()
      {new_state, _} = MatchEconomy.award_gold(state, 1, 100, "test")
      assert new_state.battle_id == state.battle_id
      assert Map.keys(new_state.combatants) == Map.keys(state.combatants)
    end

    test "25. sell_refund_pct is preserved in match settings" do
      state = build_state(%{sell_refund_pct: 0.70})
      assert state.match_economy.settings.sell_refund_pct == 0.70
    end
  end
end
