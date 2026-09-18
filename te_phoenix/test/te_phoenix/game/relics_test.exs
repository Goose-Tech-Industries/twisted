defmodule TePhoenix.Game.RelicsTest do
  use ExUnit.Case, async: true
  alias TePhoenix.Game.Relics

  setup do
    relic_1 = %{
      "id" => 1,
      "relic_set_id" => 10,
      "set_name" => "Dragon Spheres",
      "ordinal" => 1,
      "name" => "One-Star Sphere",
      "map_id" => 1,
      "x" => 10,
      "y" => 10,
      "hide_description" => "A smooth amber sphere nestled in moss."
    }

    relic_far = %{
      "id" => 2,
      "relic_set_id" => 10,
      "set_name" => "Dragon Spheres",
      "ordinal" => 2,
      "name" => "Two-Star Sphere",
      "map_id" => 1,
      "x" => 25,
      "y" => 5
    }

    basic_radar = %{
      "id" => 101,
      "item_id" => 501,
      "relic_set_id" => 10,
      "range_tiles" => 15,
      "shows_exact_tile" => 0
    }

    advanced_radar = %{
      "id" => 102,
      "item_id" => 502,
      "relic_set_id" => 10,
      "range_tiles" => 30,
      "shows_exact_tile" => 1
    }

    wishes = [
      %{"id" => "immortality", "name" => "Eternal Youth"},
      %{"id" => "wealth", "name" => "Mountain of Gold"}
    ]

    {:ok,
     relic_1: relic_1,
     relic_far: relic_far,
     basic_radar: basic_radar,
     advanced_radar: advanced_radar,
     wishes: wishes}
  end

  test "1. manhattan_distance returns 0 for identical coordinates" do
    assert Relics.manhattan_distance(5, 5, 5, 5) == 0
  end

  test "2. manhattan_distance computes horizontal distance accurately" do
    assert Relics.manhattan_distance(2, 10, 8, 10) == 6
  end

  test "3. manhattan_distance computes vertical distance accurately" do
    assert Relics.manhattan_distance(4, 3, 4, 15) == 12
  end

  test "4. manhattan_distance computes combined grid distance" do
    assert Relics.manhattan_distance(1, 1, 4, 5) == 7
  end

  test "5. direction_hint returns 'very close' for proximity within 2 tiles" do
    assert Relics.direction_hint(10, 10, 11, 11) == "very close"
    assert Relics.direction_hint(10, 10, 10, 10) == "very close"
  end

  test "6. direction_hint returns 'east' when target is to the east" do
    assert Relics.direction_hint(10, 10, 15, 10) == "east"
  end

  test "7. direction_hint returns 'west' when target is to the west" do
    assert Relics.direction_hint(10, 10, 5, 10) == "west"
  end

  test "8. direction_hint returns 'south' when target is to the south" do
    assert Relics.direction_hint(10, 10, 10, 16) == "south"
  end

  test "9. direction_hint returns 'north' when target is to the north" do
    assert Relics.direction_hint(10, 10, 10, 4) == "north"
  end

  test "10. direction_hint returns 'northeast' for northeast target" do
    assert Relics.direction_hint(10, 10, 15, 5) == "northeast"
  end

  test "11. direction_hint returns 'southwest' for southwest target" do
    assert Relics.direction_hint(10, 10, 4, 16) == "southwest"
  end

  test "12. filter_visible_relics detects relic when player is on the exact tile without radar", %{
    relic_1: r1
  } do
    visible = Relics.filter_visible_relics([r1], [], 10, 10)
    assert length(visible) == 1
    assert hd(visible).id == 1
  end

  test "13. filter_visible_relics sets can_collect: true on exact tile", %{relic_1: r1} do
    [v] = Relics.filter_visible_relics([r1], [], 10, 10)
    assert v.can_collect == true
    assert v.detected_by == "found"
    assert v.hide_description == "A smooth amber sphere nestled in moss."
  end

  test "14. filter_visible_relics hides relic if not on tile and no radar", %{relic_1: r1} do
    visible = Relics.filter_visible_relics([r1], [], 12, 12)
    assert visible == []
  end

  test "15. filter_visible_relics detects relic when in radar range", %{
    relic_1: r1,
    basic_radar: radar
  } do
    # Player at (14, 10), distance = 4 <= 15
    visible = Relics.filter_visible_relics([r1], [radar], 14, 10)
    assert length(visible) == 1
    assert hd(visible).detected_by == "radar"
    assert hd(visible).can_collect == false
  end

  test "16. filter_visible_relics reveals exact coords with advanced radar", %{
    relic_1: r1,
    advanced_radar: radar
  } do
    [v] = Relics.filter_visible_relics([r1], [radar], 14, 10)
    assert v.x == 10
    assert v.y == 10
    assert v.direction == nil
  end

  test "17. filter_visible_relics obscures coords and provides direction hint on basic radar", %{
    relic_1: r1,
    basic_radar: radar
  } do
    # Player at (5, 10), relic at (10, 10) -> target is east
    [v] = Relics.filter_visible_relics([r1], [radar], 5, 10)
    assert v.x == nil
    assert v.y == nil
    assert v.direction == "east"
  end

  test "18. filter_visible_relics ignores radar with mismatched relic_set_id", %{
    relic_1: r1,
    basic_radar: radar
  } do
    mismatched_radar = %{radar | "relic_set_id" => 999}
    visible = Relics.filter_visible_relics([r1], [mismatched_radar], 14, 10)
    assert visible == []
  end

  test "19. evaluate_collection succeeds when player is on relic tile and map", %{relic_1: r1} do
    {:ok, result} = Relics.evaluate_collection(r1, 10, 10, 1, 2, 7)
    assert result.relic_name == "One-Star Sphere"
    assert result.collected == 3
    assert result.needed == 7
    assert result.set_complete == false
  end

  test "20. evaluate_collection fails when player is on wrong tile", %{relic_1: r1} do
    assert {:error, "You must be standing on the relic's tile to collect it."} =
             Relics.evaluate_collection(r1, 11, 10, 1, 2, 7)
  end

  test "21. evaluate_collection fails when player is on wrong map", %{relic_1: r1} do
    assert {:error, "You must be standing on the relic's tile to collect it."} =
             Relics.evaluate_collection(r1, 10, 10, 2, 2, 7)
  end

  test "22. evaluate_collection marks set_complete when final relic is gathered", %{relic_1: r1} do
    {:ok, result} = Relics.evaluate_collection(r1, 10, 10, 1, 6, 7)
    assert result.collected == 7
    assert result.set_complete == true
  end

  test "23. calculate_channel_progress tracks turns remaining", %{} do
    progress = Relics.calculate_channel_progress(1, 3)
    assert progress.complete == false
    assert progress.turns_channeled == 2
    assert progress.turns_left == 1
  end

  test "24. calculate_channel_progress completes when turns needed reached", %{} do
    progress = Relics.calculate_channel_progress(2, 3)
    assert progress.complete == true
    assert progress.turns_channeled == 3
    assert progress.turns_left == 0
  end

  test "25. validate_wish_selection confirms valid wish and rejects invalid wish", %{wishes: w} do
    assert {:ok, wish} = Relics.validate_wish_selection(w, "immortality")
    assert wish["name"] == "Eternal Youth"

    assert {:error, "Invalid wish."} = Relics.validate_wish_selection(w, "flying_car")
  end
end
