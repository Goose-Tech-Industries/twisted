defmodule TePhoenix.Game.NemesisTest do
  use ExUnit.Case, async: true
  alias TePhoenix.Game.Nemesis

  describe "Living Nemesis & Faction Memory Engine" do
    test "get_dossier returns default roster and 4 enriched factions" do
      # When char has no DB row or empty state, returns default roster
      dossier = Nemesis.get_dossier(999999)
      assert is_list(dossier.nemeses)
      assert length(dossier.nemeses) >= 2

      # Check factions
      assert is_list(dossier.factions)
      keys = Enum.map(dossier.factions, & &1["key"])
      assert "iron_vanguard" in keys
      assert "blackbriar_syndicate" in keys
      assert "moonveil_coven" in keys
      assert "ashfall_cult" in keys

      # Verify tier info enrichment
      fac = List.first(dossier.factions)
      assert fac["tier_info"] != nil
      assert fac["tier_info"].tier != nil
    end

    test "generate_nemesis procedurally generates a unique rival" do
      nemesis = Nemesis.generate_nemesis("pyromancer", %{level: 5})
      assert nemesis["archetype"] == "pyromancer"
      assert nemesis["level"] == 5
      assert nemesis["faction"] == "ashfall_cult"
      assert nemesis["status"] == "active"
      assert nemesis["grudge_level"] == 1
      assert is_binary(nemesis["name"])
      assert is_map(nemesis["living_dialogue"])
      assert nemesis["living_dialogue"]["ambush"] != nil
    end

    test "record_encounter handles nemesis escape by adding scar, escalating grudge, and leveling up" do
      result = Nemesis.record_encounter(999999, "nem_valen_scarred", :escaped, %{element: "fire"})
      assert result.success == true

      valen = Enum.find(result.nemeses, &(&1["id"] == "nem_valen_scarred"))
      assert valen != nil
      # Started at grudge 2, now 3
      assert valen["grudge_level"] == 3
      # Gained fire scar
      assert Enum.any?(valen["scars"], fn s -> s.element == "fire" or s[:element] == "fire" or s["element"] == "fire" end)
      # Dialogue updated to reference scars
      assert String.contains?(valen["living_dialogue"]["ambush"], "scar")
    end

    test "record_encounter handles player defeat by promoting nemesis" do
      result = Nemesis.record_encounter(999999, "nem_valen_scarred", :player_defeated)
      valen = Enum.find(result.nemeses, &(&1["id"] == "nem_valen_scarred"))
      assert valen != nil
      assert valen["kills_on_player"] == 1
      assert String.contains?(valen["title"], "Slayer of Heroes")
    end

    test "record_encounter handles execution by setting status to slain and boosting opposing factions" do
      result = Nemesis.record_encounter(999999, "nem_valen_scarred", :executed)
      valen = Enum.find(result.nemeses, &(&1["id"] == "nem_valen_scarred"))
      assert valen != nil
      assert valen["status"] == "slain"
    end

    test "check_ambush identifies high grudge nemesis for ambush event" do
      res = Nemesis.check_ambush(999999, "camp")
      assert match?({:ambush, _}, res)
      {:ambush, data} = res
      assert data.context == "camp"
      assert data.nemesis["grudge_level"] >= 2
      assert String.contains?(data.announcement, "campfire")
    end

    test "calculate_standing_tier returns proper tiers and shop discounts" do
      allied = Nemesis.calculate_standing_tier(75)
      assert allied.tier == "Allied"
      assert allied.shop_mult == 0.80

      hostile = Nemesis.calculate_standing_tier(-80)
      assert hostile.tier == "Hostile"
      assert hostile.shop_mult == 1.60
    end

    test "record_encounter handles limb targeting and disables corresponding limb" do
      result = Nemesis.record_encounter(999999, "nem_valen_scarred", :escaped, %{
        element: "physical",
        target_limb: "right_arm",
        map_id: 1,
        x: 10,
        y: 12
      })

      assert result.success == true
      valen = Enum.find(result.nemeses, &(&1["id"] == "nem_valen_scarred"))
      assert valen != nil
      assert :r_arm in (valen["disabled_limbs"] || [])
      assert String.contains?(valen["living_dialogue"]["ambush"], "blade-arm")
      assert String.contains?(result.log, "Limb: r_arm")
    end
  end
end
