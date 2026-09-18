defmodule TePhoenix.Battle.DeescalationTest do
  use ExUnit.Case, async: true
  alias TePhoenix.Battle.Deescalation

  setup do
    actor = %{
      char_id: 1,
      name: "Rook",
      level: 5
    }

    target_guard = %{
      id: 10,
      name: "Town Guard",
      role: "guard",
      level: 3
    }

    target_drunk = %{
      id: 11,
      name: "Old Barnaby",
      role: "drunk",
      level: 1
    }

    target_boss = %{
      id: 12,
      name: "Warlord Malakor",
      role: "boss",
      level: 10
    }

    {:ok, actor: actor, guard: target_guard, drunk: target_drunk, boss: target_boss}
  end

  test "1. normalize_approach preserves atom approaches" do
    assert Deescalation.normalize_approach(:persuasion) == :persuasion
    assert Deescalation.normalize_approach(:intimidation) == :intimidation
    assert Deescalation.normalize_approach(:bribe) == :bribe
  end

  test "2. normalize_approach maps persuasion synonyms to :persuasion" do
    assert Deescalation.normalize_approach("persuasion") == :persuasion
    assert Deescalation.normalize_approach("persuade") == :persuasion
    assert Deescalation.normalize_approach("silver_tongue") == :persuasion
  end

  test "3. normalize_approach maps intimidation synonyms to :intimidation" do
    assert Deescalation.normalize_approach("intimidation") == :intimidation
    assert Deescalation.normalize_approach("intimidate") == :intimidation
  end

  test "4. normalize_approach maps bribe synonyms to :bribe" do
    assert Deescalation.normalize_approach("bribe") == :bribe
    assert Deescalation.normalize_approach("gold") == :bribe
  end

  test "5. normalize_approach maps deception synonyms to :deception" do
    assert Deescalation.normalize_approach("deception") == :deception
    assert Deescalation.normalize_approach("deceive") == :deception
    assert Deescalation.normalize_approach("bluff") == :deception
  end

  test "6. normalize_approach maps drink synonyms to :buy_drink" do
    assert Deescalation.normalize_approach("buy_drink") == :buy_drink
    assert Deescalation.normalize_approach("drink") == :buy_drink
    assert Deescalation.normalize_approach("ale") == :buy_drink
  end

  test "7. normalize_approach falls back to :persuasion for unknown input" do
    assert Deescalation.normalize_approach("unknown_style") == :persuasion
    assert Deescalation.normalize_approach(nil) == :persuasion
  end

  test "8. calculate_modifiers assigns correct base DC for roles" do
    {_, _, drunk_dc} = Deescalation.calculate_modifiers(:persuasion, 1, 1, 1, "drunk", nil)
    {_, _, guard_dc} = Deescalation.calculate_modifiers(:persuasion, 1, 1, 1, "guard", nil)
    {_, _, boss_dc} = Deescalation.calculate_modifiers(:persuasion, 1, 1, 1, "boss", nil)

    assert drunk_dc == 9
    assert guard_dc == 14
    assert boss_dc == 18
  end

  test "9. calculate_modifiers calculates persuasion stat mod from level difference" do
    # level diff: 5 - 3 = 2 -> round(2 * 0.5) + 3 = 4
    {stat_mod, _, _} = Deescalation.calculate_modifiers(:persuasion, 1, 5, 3, "guard", nil)
    assert stat_mod == 4
  end

  test "10. calculate_modifiers calculates intimidation stat mod scaled and capped" do
    # level diff: 8 - 2 = 6 -> 6 * 2 = 12 -> capped at 8
    {stat_mod, _, _} = Deescalation.calculate_modifiers(:intimidation, 1, 8, 2, "guard", nil)
    assert stat_mod == 8
  end

  test "11. calculate_modifiers grants +5 background bonus for diplomat persuasion" do
    {_, bg_bonus, _} = Deescalation.calculate_modifiers(:persuasion, 1, 1, 1, "guard", "diplomat")
    assert bg_bonus == 5
  end

  test "12. calculate_modifiers grants +6 background bonus for gladiator intimidation" do
    {_, bg_bonus, _} = Deescalation.calculate_modifiers(:intimidation, 1, 1, 1, "guard", "gladiator")
    assert bg_bonus == 6
  end

  test "13. calculate_modifiers grants +5 background bonus for syndicate deception" do
    {_, bg_bonus, _} = Deescalation.calculate_modifiers(:deception, 1, 1, 1, "guard", "syndicate")
    assert bg_bonus == 5
  end

  test "14. calculate_modifiers grants +4 background bonus for merchant bribe" do
    {_, bg_bonus, _} = Deescalation.calculate_modifiers(:bribe, 1, 1, 1, "guard", "merchant")
    assert bg_bonus == 4
  end

  test "15. attempt_deescalation critically succeeds on natural 20", %{actor: actor, boss: boss} do
    res = Deescalation.attempt_deescalation(actor, boss, :persuasion, %{roll: 20})
    assert res.is_crit == true
    assert res.success == true
    assert res.pacified == true
  end

  test "16. attempt_deescalation critically fails on natural 1", %{actor: actor, drunk: drunk} do
    res = Deescalation.attempt_deescalation(actor, drunk, :persuasion, %{roll: 1})
    assert res.success == false
    assert res.pacified == false
    assert String.contains?(res.dialogue, "spits in disgust")
  end

  test "17. attempt_deescalation succeeds when total roll meets DC", %{actor: actor, guard: guard} do
    # Actor lvl 5, guard lvl 3 -> diff 2 -> stat_mod 4. DC is 14.
    # Roll 10 + 4 = 14 >= 14 -> success
    res = Deescalation.attempt_deescalation(actor, guard, :persuasion, %{roll: 10})
    assert res.success == true
    assert res.pacified == true
    assert res.total_roll >= res.dc
  end

  test "18. attempt_deescalation fails when total roll is below DC", %{actor: actor, guard: guard} do
    # Roll 2 + 4 = 6 < 14 -> fail
    res = Deescalation.attempt_deescalation(actor, guard, :persuasion, %{roll: 2})
    assert res.success == false
    assert res.pacified == false
    assert res.total_roll < res.dc
  end

  test "19. attempt_deescalation awards diplomacy XP on success", %{actor: actor, guard: guard} do
    res = Deescalation.attempt_deescalation(actor, guard, :persuasion, %{roll: 15})
    # XP formula: target_level (3) * 40 + 50 = 170
    assert res.diplomacy_xp == 170
  end

  test "20. attempt_deescalation awards 0 diplomacy XP on failure", %{actor: actor, guard: guard} do
    res = Deescalation.attempt_deescalation(actor, guard, :persuasion, %{roll: 2})
    assert res.diplomacy_xp == 0
  end

  test "21. buy_drink pacifies tavern drunks for 5 gold", %{actor: actor, drunk: drunk} do
    res = Deescalation.attempt_deescalation(actor, drunk, :buy_drink, %{gold: 10})
    assert res.success == true
    assert res.cost_gold == 5
    assert String.contains?(res.dialogue, "buys ale is a brother for life")
  end

  test "22. buy_drink fails if actor has insufficient gold", %{actor: actor, drunk: drunk} do
    res = Deescalation.attempt_deescalation(actor, drunk, :buy_drink, %{gold: 2})
    assert res.success == false
    assert res.cost_gold == 0
    assert String.contains?(res.dialogue, "empty pockets")
  end

  test "23. buy_drink refuses non-drinkers unless natural 20", %{actor: actor, boss: boss} do
    # Normal roll against boss
    res = Deescalation.attempt_deescalation(actor, boss, :buy_drink, %{roll: 15, gold: 100})
    assert res.success == false

    # Nat 20 roll against boss
    crit_res = Deescalation.attempt_deescalation(actor, boss, :buy_drink, %{roll: 20, gold: 100})
    assert crit_res.success == true
  end

  test "24. bribe auto-succeeds on guards if gold is sufficient", %{actor: actor, guard: guard} do
    # Guard level 3 * 15 = 45 gold cost
    res = Deescalation.attempt_deescalation(actor, guard, :bribe, %{gold: 100})
    assert res.success == true
    assert res.cost_gold == 45
    assert String.contains?(res.dialogue, "pockets the coin")
  end

  test "25. generate_dialogue produces appropriate reaction for critical intimidation" do
    dialogue =
      Deescalation.generate_dialogue(
        "Bandit Leader",
        "bandit",
        "",
        "Rook",
        :intimidation,
        true,
        true,
        false,
        :roll_outcome
      )

    assert String.contains?(dialogue, "trembles violently")
    assert String.contains?(dialogue, "quarrel with a legend")
  end
end
