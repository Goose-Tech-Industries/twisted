defmodule TePhoenix.World.DefenestrationTest do
  use ExUnit.Case, async: true
  alias TePhoenix.World.Defenestration

  setup do
    normal_window = %{
      building_id: 10,
      window_x: 5,
      window_y: 6,
      state: "closed",
      iron_bars: false,
      interior_map_id: 2,
      interior_door_x: 3,
      interior_door_y: 4
    }

    barred_window = %{
      building_id: 10,
      window_x: 5,
      window_y: 6,
      state: "closed",
      iron_bars: true,
      interior_map_id: 2,
      interior_door_x: 3,
      interior_door_y: 4
    }

    open_window = %{
      building_id: 10,
      window_x: 5,
      window_y: 6,
      state: "open",
      iron_bars: false,
      interior_map_id: 2,
      interior_door_x: 3,
      interior_door_y: 4
    }

    strong_attacker = %{name: "Brute", atk: 24, id: 1, is_player: true}
    weak_target = %{name: "Scout", def: 6, id: 2, is_player: true}

    {:ok,
     normal_window: normal_window,
     barred_window: barred_window,
     open_window: open_window,
     strong_attacker: strong_attacker,
     weak_target: weak_target}
  end

  test "1. stat_modifier calculates positive modifier correctly" do
    assert Defenestration.stat_modifier(18) == 4
    assert Defenestration.stat_modifier(20) == 5
  end

  test "2. stat_modifier returns 0 for baseline scores 10 and 11" do
    assert Defenestration.stat_modifier(10) == 0
    assert Defenestration.stat_modifier(11) == 0
  end

  test "3. stat_modifier calculates negative modifiers correctly" do
    assert Defenestration.stat_modifier(8) == -1
    assert Defenestration.stat_modifier(6) == -2
  end

  test "4. stat_modifier handles nil safely" do
    assert Defenestration.stat_modifier(nil) == 0
  end

  test "5. calculate_shatter inflicts glass shatter and bleeding on closed window" do
    {shattered, damage, bleeding} = Defenestration.calculate_shatter("closed")
    assert shattered == true
    assert damage >= 3 and damage <= 8
    assert bleeding == true
  end

  test "6. calculate_shatter inflicts glass shatter and bleeding on cracked window" do
    {shattered, damage, bleeding} = Defenestration.calculate_shatter("cracked")
    assert shattered == true
    assert damage >= 3 and damage <= 8
    assert bleeding == true
  end

  test "7. calculate_shatter does not break glass on open window" do
    {shattered, damage, bleeding} = Defenestration.calculate_shatter("open")
    assert shattered == false
    assert damage >= 1 and damage <= 4
    assert bleeding == false
  end

  test "8. calculate_shatter does not break glass on broken window" do
    {shattered, damage, bleeding} = Defenestration.calculate_shatter("broken")
    assert shattered == false
    assert damage >= 1 and damage <= 4
    assert bleeding == false
  end

  test "9. calculate_shatter puncture damage is within bounds (1d6+2)" do
    Enum.each(1..20, fn _ ->
      {_, damage, _} = Defenestration.calculate_shatter("closed")
      assert damage in 3..8
    end)
  end

  test "10. determine_destination correctly detects ejection from interior out to exterior", %{normal_window: window} do
    # When current map is interior_map_id (2)
    {dest_map, dest_x, dest_y, desc} = Defenestration.determine_destination(2, window)
    assert is_integer(dest_map)
    assert dest_x == 5
    assert dest_y == 6
    assert desc == "the cobblestone street below"
  end

  test "11. determine_destination correctly detects ejection from exterior into interior", %{normal_window: window} do
    # When current map is exterior (1)
    {dest_map, dest_x, dest_y, desc} = Defenestration.determine_destination(1, window)
    assert dest_map == 2
    assert dest_x == 3
    assert dest_y == 4
    assert desc == "the interior floorboards"
  end

  test "12. determine_destination provides non-empty location descriptions", %{normal_window: window} do
    {_, _, _, desc_ext} = Defenestration.determine_destination(2, window)
    {_, _, _, desc_int} = Defenestration.determine_destination(1, window)
    assert String.length(desc_ext) > 0
    assert String.length(desc_int) > 0
  end

  test "13. returns error when no window exists in reach", %{strong_attacker: atk, weak_target: tgt} do
    assert {:error, "No window within reach for defenestration."} =
             Defenestration.defenestrate(atk, tgt, 1, 10, 10, nil)
  end

  test "14. returns blocked_by_bars when window is reinforced with iron bars", %{
    barred_window: window,
    strong_attacker: atk,
    weak_target: tgt
  } do
    {:ok, result} = Defenestration.defenestrate(atk, tgt, 1, 5, 6, window)
    assert result.success == false
    assert result.blocked_by_bars == true
    assert String.contains?(result.message, "Heavy iron bars block the window")
  end

  test "15. applies exactly 3 damage when blocked by iron bars", %{
    barred_window: window,
    strong_attacker: atk,
    weak_target: tgt
  } do
    {:ok, result} = Defenestration.defenestrate(atk, tgt, 1, 5, 6, window)
    assert result.damage == 3
  end

  test "16. reports contested roll failure when defender rolls higher", %{normal_window: window} do
    weakling = %{name: "Weakling", atk: 1, id: 1}
    titan = %{name: "Titan", def: 99, id: 2}

    {:ok, result} = Defenestration.defenestrate(weakling, titan, 1, 5, 6, window)
    assert result.success == false
    assert String.contains?(result.message, "reversed the grapple")
  end

  test "17. failure result contains both attacker and defender roll totals", %{normal_window: window} do
    weakling = %{name: "Weakling", atk: 1, id: 1}
    titan = %{name: "Titan", def: 99, id: 2}

    {:ok, result} = Defenestration.defenestrate(weakling, titan, 1, 5, 6, window)
    assert is_integer(result.attacker_roll)
    assert is_integer(result.defender_roll)
    assert result.attacker_roll < result.defender_roll
  end

  test "18. succeeds when attacker has massive strength advantage", %{
    normal_window: window
  } do
    god_attacker = %{name: "Thor", atk: 100, id: 1}
    helpless_target = %{name: "Fly", def: 1, id: 2}

    {:ok, result} = Defenestration.defenestrate(god_attacker, helpless_target, 1, 5, 6, window)
    assert result.success == true
  end

  test "19. successful defenestration knocks the target prone", %{
    normal_window: window
  } do
    god_attacker = %{name: "Thor", atk: 100, id: 1}
    helpless_target = %{name: "Fly", def: 1, id: 2}

    {:ok, result} = Defenestration.defenestrate(god_attacker, helpless_target, 1, 5, 6, window)
    assert result.prone == true
  end

  test "20. successful defenestration through closed window inflicts bleeding", %{
    normal_window: window
  } do
    god_attacker = %{name: "Thor", atk: 100, id: 1}
    helpless_target = %{name: "Fly", def: 1, id: 2}

    {:ok, result} = Defenestration.defenestrate(god_attacker, helpless_target, 1, 5, 6, window)
    assert result.glass_shattered == true
    assert result.bleeding == true
  end

  test "21. successful defenestration through open window does not inflict glass bleeding", %{
    open_window: window
  } do
    god_attacker = %{name: "Thor", atk: 100, id: 1}
    helpless_target = %{name: "Fly", def: 1, id: 2}

    {:ok, result} = Defenestration.defenestrate(god_attacker, helpless_target, 1, 5, 6, window)
    assert result.glass_shattered == false
    assert result.bleeding == false
  end

  test "22. calculates total damage as glass damage plus fall damage", %{
    normal_window: window
  } do
    god_attacker = %{name: "Thor", atk: 100, id: 1}
    helpless_target = %{name: "Fly", def: 1, id: 2}

    {:ok, result} = Defenestration.defenestrate(god_attacker, helpless_target, 1, 5, 6, window)
    assert result.total_damage == result.glass_damage + result.fall_damage
    assert result.fall_damage in 1..8
  end

  test "23. sets destination coordinates correctly in success payload", %{
    normal_window: window
  } do
    god_attacker = %{name: "Thor", atk: 100, id: 1}
    helpless_target = %{name: "Fly", def: 1, id: 2}

    # exterior (map 1) to interior (map 2)
    {:ok, result} = Defenestration.defenestrate(god_attacker, helpless_target, 1, 5, 6, window)
    assert result.dest_map_id == 2
    assert result.dest_x == 3
    assert result.dest_y == 4
  end

  test "24. works seamlessly with string-keyed combatant maps", %{
    normal_window: window
  } do
    str_atk = %{"name" => "Brutus", "atk" => 100, "id" => 10}
    str_tgt = %{"name" => "Caesar", "def" => 1, "id" => 11}

    {:ok, result} = Defenestration.defenestrate(str_atk, str_tgt, 1, 5, 6, window)
    assert result.success == true
    assert String.contains?(result.message, "Brutus")
    assert String.contains?(result.message, "Caesar")
  end

  test "25. generates dramatic victory message on defenestration", %{
    normal_window: window
  } do
    god_attacker = %{name: "Hulk", atk: 100, id: 1}
    helpless_target = %{name: "Loki", def: 1, id: 2}

    {:ok, result} = Defenestration.defenestrate(god_attacker, helpless_target, 1, 5, 6, window)
    assert String.contains?(result.message, "DEFENESTRATED!")
    assert String.contains?(result.message, "Hulk launched Loki through the window!")
  end
end
