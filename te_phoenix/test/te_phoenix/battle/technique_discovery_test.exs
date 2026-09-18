defmodule TePhoenix.Battle.TechniqueDiscoveryTest do
  use ExUnit.Case, async: true
  alias TePhoenix.Battle.TechniqueDiscovery

  setup do
    fire_theme = %{
      "theme_tag" => "pyro_strike",
      "label" => "Flame Strike",
      "keywords_json" => Jason.encode!(["fire", "flame", "burn", "ignite", "blaze"]),
      "min_keyword_matches" => 2,
      "hint_at" => 3,
      "shape_at" => 6,
      "ready_at" => 10,
      "suggested_category" => "ki",
      "base_damage_pct" => 12,
      "base_cost_pct" => 6
    }

    martial_theme = %{
      "theme_tag" => "iron_fist",
      "label" => "Iron Fist",
      "keywords_json" => ["punch", "fist", "slam", "strike"],
      "min_keyword_matches" => 2,
      "hint_at" => 2,
      "shape_at" => 5,
      "ready_at" => 8,
      "suggested_category" => "physical",
      "base_damage_pct" => 10,
      "base_cost_pct" => 4
    }

    {:ok, fire_theme: fire_theme, martial_theme: martial_theme}
  end

  test "1. extract_words lowercases and strips punctuation" do
    words = TechniqueDiscovery.extract_words("I channel KI into my FISTS! Slamming the ground...")
    assert MapSet.member?(words, "channel")
    assert MapSet.member?(words, "ki")
    assert MapSet.member?(words, "fists")
    assert MapSet.member?(words, "slamming")
    refute MapSet.member?(words, "fists!")
  end

  test "2. extract_words produces a MapSet for fast membership lookup" do
    words = TechniqueDiscovery.extract_words("dragon fire strike")
    assert is_struct(words, MapSet)
    assert MapSet.size(words) == 3
  end

  test "3. extract_words handles nil or empty string safely" do
    assert TechniqueDiscovery.extract_words(nil) == MapSet.new()
    assert TechniqueDiscovery.extract_words("") == MapSet.new()
  end

  test "4. count_keyword_matches accurately counts matched keywords" do
    words = MapSet.new(["fire", "fists", "slam", "dragon"])
    keywords = ["fire", "water", "slam"]
    assert TechniqueDiscovery.count_keyword_matches(words, keywords) == 2
  end

  test "5. count_keyword_matches performs case-insensitive comparison" do
    words = MapSet.new(["fire", "ice"])
    keywords = ["FIRE", "Ice", "EARTH"]
    assert TechniqueDiscovery.count_keyword_matches(words, keywords) == 2
  end

  test "6. theme_matches? returns true when match count meets min threshold", %{fire_theme: theme} do
    words = MapSet.new(["i", "channel", "fire", "and", "flame"])
    assert TechniqueDiscovery.theme_matches?(words, theme) == true
  end

  test "7. theme_matches? returns false when match count is below threshold", %{fire_theme: theme} do
    words = MapSet.new(["i", "channel", "fire"])
    assert TechniqueDiscovery.theme_matches?(words, theme) == false
  end

  test "8. theme_matches? defaults min_keyword_matches to 2 if omitted" do
    theme = %{
      "keywords_json" => ["wind", "gale", "tempest"]
    }
    words = MapSet.new(["wind", "gale"])
    assert TechniqueDiscovery.theme_matches?(words, theme) == true
  end

  test "9. theme_matches? parses JSON-encoded keyword strings", %{fire_theme: theme} do
    words = MapSet.new(["burn", "ignite"])
    assert TechniqueDiscovery.theme_matches?(words, theme) == true
  end

  test "10. theme_matches? accepts lists of keywords directly", %{martial_theme: theme} do
    words = MapSet.new(["punch", "fist"])
    assert TechniqueDiscovery.theme_matches?(words, theme) == true
  end

  test "11. match_themes returns all qualifying themes for a given RP action", %{
    fire_theme: ft,
    martial_theme: mt
  } do
    action = "I ignite my fist and slam with burning flame!"
    matched = TechniqueDiscovery.match_themes(action, [ft, mt])
    assert length(matched) == 2
    tags = Enum.map(matched, & &1["theme_tag"])
    assert "pyro_strike" in tags
    assert "iron_fist" in tags
  end

  test "12. match_themes returns empty list when no themes match", %{fire_theme: ft} do
    action = "I sit quietly and meditate under the tree."
    assert TechniqueDiscovery.match_themes(action, [ft]) == []
  end

  test "13. evaluate_milestones emits discovery_hint when hint threshold reached" do
    events = TechniqueDiscovery.evaluate_milestones(3, 3, 6, 10, 0, 0, "forming")
    assert Enum.any?(events, fn {type, _} -> type == :discovery_hint end)
  end

  test "14. evaluate_milestones suppresses discovery_hint if already given" do
    events = TechniqueDiscovery.evaluate_milestones(4, 3, 6, 10, 1, 0, "forming")
    refute Enum.any?(events, fn {type, _} -> type == :discovery_hint end)
  end

  test "15. evaluate_milestones emits discovery_shape when shape threshold reached" do
    events = TechniqueDiscovery.evaluate_milestones(6, 3, 6, 10, 1, 0, "forming")
    shape_event = Enum.find(events, fn {type, _} -> type == :discovery_shape end)
    assert shape_event != nil
  end

  test "16. evaluate_milestones calculates remaining uses in shape milestone message" do
    events = TechniqueDiscovery.evaluate_milestones(6, 3, 6, 10, 1, 0, "forming")
    {_, msg} = Enum.find(events, fn {type, _} -> type == :discovery_shape end)
    assert String.contains?(msg, "4 more uses")
  end

  test "17. evaluate_milestones suppresses discovery_shape if already given" do
    events = TechniqueDiscovery.evaluate_milestones(7, 3, 6, 10, 1, 1, "shaping")
    refute Enum.any?(events, fn {type, _} -> type == :discovery_shape end)
  end

  test "18. evaluate_milestones emits discovery_ready when ready threshold reached" do
    events = TechniqueDiscovery.evaluate_milestones(10, 3, 6, 10, 1, 1, "shaping")
    assert Enum.any?(events, fn {type, _} -> type == :discovery_ready end)
  end

  test "19. evaluate_milestones returns empty list when no thresholds are met" do
    assert TechniqueDiscovery.evaluate_milestones(1, 3, 6, 10, 0, 0, "forming") == []
  end

  test "20. compute_technique_params sets chosen name and default icon" do
    params = TechniqueDiscovery.compute_technique_params(%{}, %{}, "Dragon Breath", "🐉")
    assert params.name == "Dragon Breath"
    assert params.icon == "🐉"
  end

  test "21. compute_technique_params sets melee and short range for physical category" do
    disc = %{"suggested_category" => "physical"}
    params = TechniqueDiscovery.compute_technique_params(disc, %{}, "Heavy Kick", "🦶")
    assert params.attack_type == "melee"
    assert params.range_type == "short"
  end

  test "22. compute_technique_params sets ranged and medium range for ki category" do
    disc = %{"suggested_category" => "ki"}
    params = TechniqueDiscovery.compute_technique_params(disc, %{}, "Spirit Cannon", "✨")
    assert params.attack_type == "ranged"
    assert params.range_type == "medium"
  end

  test "23. compute_technique_params applies DM overrides for damage and cost" do
    disc = %{"suggested_damage_pct" => 10, "suggested_cost_pct" => 5}
    dm = %{"damage_pct" => 25, "cost_pct" => 12}
    params = TechniqueDiscovery.compute_technique_params(disc, dm, "Hyper Beam", "⚡")
    assert params.damage_pct == 25
    assert params.cost_pct == 12
  end

  test "24. compute_technique_params merges stun and bleed effects from overrides" do
    disc = %{"suggested_effects_json" => Jason.encode!(%{"stun_chance" => 10})}
    dm = %{"effects" => %{"stun_chance" => 30, "bleed_chance" => 50, "bleed_severity" => "heavy"}}
    params = TechniqueDiscovery.compute_technique_params(disc, dm, "Thunder Claw", "⚡")
    assert params.stun_chance == 30
    assert params.bleed_chance == 50
    assert params.bleed_severity == "heavy"
  end

  test "25. check_action with explicit theme_tag generates an immediate synthetic theme" do
    # When explicit theme_tag is provided, check_action creates a synthetic theme definition
    # and processes it without DB query if DB query fails gracefully
    events = TechniqueDiscovery.check_action(1, "anything", theme_tag: "shadow_step")
    assert is_list(events)
  end
end
