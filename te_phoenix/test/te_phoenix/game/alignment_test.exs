defmodule TePhoenix.Game.AlignmentTest do
  use ExUnit.Case, async: false

  alias TePhoenix.Game.Alignment

  describe "Alignment.get_tier/1 default tiers" do
    test "returns Paragon tier for alignment 75 to 100" do
      tier100 = Alignment.get_tier(100)
      tier75 = Alignment.get_tier(75)

      name100 = tier100["name"] || tier100[:name]
      name75 = tier75["name"] || tier75[:name]

      assert name100 == "Paragon"
      assert name75 == "Paragon"
    end

    test "returns Guardian tier for alignment 40 to 74" do
      tier = Alignment.get_tier(55)
      name = tier["name"] || tier[:name]
      assert name == "Guardian"
    end

    test "returns Virtuous tier for alignment 15 to 39" do
      tier = Alignment.get_tier(20)
      name = tier["name"] || tier[:name]
      assert name == "Virtuous"
    end

    test "returns Neutral tier for alignment -14 to 14" do
      tier0 = Alignment.get_tier(0)
      tier10 = Alignment.get_tier(10)
      tier_neg10 = Alignment.get_tier(-10)

      assert (tier0["name"] || tier0[:name]) == "Neutral"
      assert (tier10["name"] || tier10[:name]) == "Neutral"
      assert (tier_neg10["name"] || tier_neg10[:name]) == "Neutral"
    end

    test "returns Dubious tier for alignment -39 to -15" do
      tier = Alignment.get_tier(-25)
      name = tier["name"] || tier[:name]
      assert name == "Dubious"
    end

    test "returns Corrupt tier for alignment -74 to -40" do
      tier = Alignment.get_tier(-60)
      name = tier["name"] || tier[:name]
      assert name == "Corrupt"
    end

    test "returns Tyrant tier for alignment -100 to -75" do
      tier_neg100 = Alignment.get_tier(-100)
      tier_neg80 = Alignment.get_tier(-80)

      name100 = tier_neg100["name"] || tier_neg100[:name]
      name80 = tier_neg80["name"] || tier_neg80[:name]

      assert name100 == "Tyrant"
      assert name80 == "Tyrant"
    end
  end

  describe "Alignment.apply_bonuses/2" do
    test "neutral alignment leaves base stats unaffected" do
      base_stats = %{"atk" => 50, "def" => 30, "speed" => 20}
      modified = Alignment.apply_bonuses(base_stats, 0)
      assert modified == base_stats
    end

    test "paragon alignment boosts magical stats and luck" do
      base_stats = %{"mo" => 100, "md" => 100, "luck" => 100, "atk" => 50}
      modified = Alignment.apply_bonuses(base_stats, 90)

      # Paragon has +15% MO, +15% MD, +10% LCK
      assert modified["mo"] == 115
      assert modified["md"] == 115
      assert modified["luck"] == 110
      assert modified["atk"] == 50
    end

    test "tyrant alignment boosts physical attack and speed while penalizing defense" do
      base_stats = %{"atk" => 100, "speed" => 100, "def" => 100}
      modified = Alignment.apply_bonuses(base_stats, -90)

      # Tyrant has +15% ATK, +10% SPD, -10% DEF
      assert modified["atk"] == 115
      assert modified["speed"] == 110
      assert modified["def"] == 90
    end

    test "modified stats never drop below 1" do
      base_stats = %{"def" => 1}
      modified = Alignment.apply_bonuses(base_stats, -90)
      assert modified["def"] >= 1
    end
  end

  describe "Alignment.meets_requirement?/2" do
    test "nil required alignment always returns true" do
      assert Alignment.meets_requirement?(123, nil) == true
    end
  end
end
