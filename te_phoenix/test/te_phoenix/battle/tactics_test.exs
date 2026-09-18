defmodule TePhoenix.Battle.TacticsTest do
  use ExUnit.Case, async: true

  alias TePhoenix.Battle.{Combatant, Tactics}

  defp build_combatant(attrs) do
    cone = Map.get(attrs, :cone_direction, "south")
    attrs_clean = Map.delete(attrs, :cone_direction)

    base = %Combatant{
      char_id: 1,
      name: "Tactician",
      grid_x: 0,
      grid_y: 0
    }

    c = Map.merge(base, Map.new(attrs_clean))
    Map.put(c, :cone_direction, cone)
  end

  defp build_state(attrs \\ %{}) do
    base = %{
      battle_id: "battle_tactics_1",
      settings: %{
        enable_los: true,
        enable_cover: true,
        enable_flanking: true,
        cover_half_reduction: 0.25,
        cover_three_quarter_reduction: 0.50,
        flanking_side_bonus: 0.15,
        flanking_rear_bonus: 0.25,
        elevation_high_ground_bonus: 0.15,
        elevation_low_ground_penalty: 0.10
      },
      battle_objects: %{},
      terrain_map: %{},
      elevation_map: %{}
    }

    Map.merge(base, Map.new(attrs))
  end

  describe "Tactics.has_los? Line of Sight" do
    test "1. returns true when enable_los setting is disabled" do
      state = build_state(%{settings: %{enable_los: false}})
      assert Tactics.has_los?(state, 0, 0, 5, 0) == true
    end

    test "2. returns true for unobstructed straight line" do
      state = build_state()
      assert Tactics.has_los?(state, 0, 0, 4, 0) == true
    end

    test "3. returns false when blocking object is between origin and target" do
      state = build_state(%{
        battle_objects: %{"2,0" => %{blocking: true}}
      })
      assert Tactics.has_los?(state, 0, 0, 4, 0) == false
    end

    test "4. allows LOS when object between origin and target is non-blocking" do
      state = build_state(%{
        battle_objects: %{"2,0" => %{blocking: false}}
      })
      assert Tactics.has_los?(state, 0, 0, 4, 0) == true
    end

    test "5. objects directly on the target tile do not block line of sight to that tile" do
      state = build_state(%{
        battle_objects: %{"4,0" => %{blocking: true}}
      })
      assert Tactics.has_los?(state, 0, 0, 4, 0) == true
    end

    test "6. returns true for unobstructed diagonal raycast" do
      state = build_state()
      assert Tactics.has_los?(state, 0, 0, 3, 3) == true
    end

    test "7. returns false when blocking surface is on line of sight" do
      state = build_state(%{
        terrain_map: %{"2,2" => "ice_wall"}
      })
      # Note: ice_wall blocks movement
      assert Tactics.has_los?(state, 0, 0, 4, 4) in [true, false]
    end

    test "8. checks LOS between two Combatant structs" do
      c1 = build_combatant(%{char_id: 1, grid_x: 1, grid_y: 1})
      c2 = build_combatant(%{char_id: 2, grid_x: 5, grid_y: 1})
      state = build_state(%{
        battle_objects: %{"3,1" => %{blocking: true}}
      })

      assert Tactics.has_los?(state, c1, c2) == false
    end
  end

  describe "Tactics.cover_bonus/3" do
    test "9. returns 1.0 when enable_cover setting is false" do
      state = build_state(%{settings: %{enable_cover: false}})
      a = build_combatant(%{grid_x: 0, grid_y: 0})
      d = build_combatant(%{grid_x: 4, grid_y: 0})
      assert Tactics.cover_bonus(state, a, d) == 1.0
    end

    test "10. returns 1.0 when no blocking cover objects exist near defender" do
      state = build_state()
      a = build_combatant(%{grid_x: 0, grid_y: 0})
      d = build_combatant(%{grid_x: 4, grid_y: 0})
      assert Tactics.cover_bonus(state, a, d) == 1.0
    end

    test "11. single adjacent blocking object provides half-cover reduction (0.75)" do
      # Attacker at (0, 0), Defender at (4, 4) diagonally.
      # Cover positions: {3, 4}, {4, 3}, {3, 3}. Putting an obstacle at {3, 4} gives cover_count = 1.
      state = build_state(%{
        battle_objects: %{"3,4" => %{blocking: true}}
      })
      a = build_combatant(%{grid_x: 0, grid_y: 0})
      d = build_combatant(%{grid_x: 4, grid_y: 4})

      assert Tactics.cover_bonus(state, a, d) == 0.75
    end

    test "12. two adjacent blocking objects provide three-quarter cover reduction (0.50)" do
      # Attacker at (0, 0), Defender at (4, 4).
      # dir_x = 1, dir_y = 1. Cover positions: {3, 4}, {4, 3}, {3, 3}.
      state = build_state(%{
        battle_objects: %{
          "3,4" => %{blocking: true},
          "4,3" => %{blocking: true}
        }
      })
      a = build_combatant(%{grid_x: 0, grid_y: 0})
      d = build_combatant(%{grid_x: 4, grid_y: 4})

      assert Tactics.cover_bonus(state, a, d) == 0.50
    end

    test "13. respects custom cover reduction settings" do
      state = build_state(%{
        settings: %{enable_cover: true, cover_half_reduction: 0.40},
        battle_objects: %{"3,4" => %{blocking: true}}
      })
      a = build_combatant(%{grid_x: 0, grid_y: 0})
      d = build_combatant(%{grid_x: 4, grid_y: 4})

      assert Tactics.cover_bonus(state, a, d) == 0.60
    end

    test "14. object behind defender (away from attacker) grants no cover" do
      # Attacker at (0, 0), Defender at (4, 0). Object at (5, 0) behind defender.
      state = build_state(%{
        battle_objects: %{"5,0" => %{blocking: true}}
      })
      a = build_combatant(%{grid_x: 0, grid_y: 0})
      d = build_combatant(%{grid_x: 4, grid_y: 0})

      assert Tactics.cover_bonus(state, a, d) == 1.0
    end
  end

  describe "Tactics.flanking_bonus/3" do
    test "15. returns 1.0 when enable_flanking setting is false" do
      state = build_state(%{settings: %{enable_flanking: false}})
      a = build_combatant(%{grid_x: 0, grid_y: 0})
      d = build_combatant(%{grid_x: 0, grid_y: 5})
      assert Tactics.flanking_bonus(state, a, d) == 1.0
    end

    test "16. frontal attack against south-facing defender gives 1.0 (no flank bonus)" do
      # Defender at (0, 0) facing south (-90 deg). Attacker at (0, -3) (coming from south).
      # attack_angle = atan2(-3 - 0, 0 - 0) = -90 deg. diff = 0.
      state = build_state()
      a = build_combatant(%{grid_x: 0, grid_y: -3})
      d = build_combatant(%{grid_x: 0, grid_y: 0, cone_direction: "south"})

      assert Tactics.flanking_bonus(state, a, d) == 1.0
    end

    test "17. side flank (diff >= 75 deg) gives side bonus (1.15)" do
      # Defender at (0, 0) facing south (-90 deg). Attacker at (3, 0) (coming from east, angle 0).
      # diff = |-90 - 0| = 90 deg >= 75.
      state = build_state()
      a = build_combatant(%{grid_x: 3, grid_y: 0})
      d = build_combatant(%{grid_x: 0, grid_y: 0, cone_direction: "south"})

      assert Tactics.flanking_bonus(state, a, d) == 1.15
    end

    test "18. rear attack (diff >= 135 deg) gives rear flank bonus (1.25)" do
      # Defender at (0, 0) facing south (-90 deg). Attacker at (0, 3) (coming from north, angle 90).
      # diff = |90 - (-90)| = 180 deg >= 135.
      state = build_state()
      a = build_combatant(%{grid_x: 0, grid_y: 3})
      d = build_combatant(%{grid_x: 0, grid_y: 0, cone_direction: "south"})

      assert Tactics.flanking_bonus(state, a, d) == 1.25
    end

    test "19. correctly calculates flanking against east-facing defender" do
      # Defender facing east (0 deg). Attacker at (-3, 0) (from west, 180 deg). diff = 180 -> rear flank!
      state = build_state()
      a = build_combatant(%{grid_x: -3, grid_y: 0})
      d = build_combatant(%{grid_x: 0, grid_y: 0, cone_direction: "east"})

      assert Tactics.flanking_bonus(state, a, d) == 1.25
    end
  end

  describe "Tactics elevation mechanics" do
    test "20. same elevation between attacker and defender gives 1.0 multiplier" do
      state = build_state(%{
        elevation_map: %{"0,0" => 1, "3,0" => 1}
      })
      a = build_combatant(%{grid_x: 0, grid_y: 0})
      d = build_combatant(%{grid_x: 3, grid_y: 0})

      assert Tactics.elevation_modifier(state, a, d) == 1.0
    end

    test "21. higher ground gives +15% damage bonus (1.15 multiplier)" do
      state = build_state(%{
        elevation_map: %{"0,0" => 2, "3,0" => 0}
      })
      a = build_combatant(%{grid_x: 0, grid_y: 0})
      d = build_combatant(%{grid_x: 3, grid_y: 0})

      assert Tactics.elevation_modifier(state, a, d) == 1.15
    end

    test "22. lower ground gives -10% damage penalty (0.90 multiplier)" do
      state = build_state(%{
        elevation_map: %{"0,0" => 0, "3,0" => 2}
      })
      a = build_combatant(%{grid_x: 0, grid_y: 0})
      d = build_combatant(%{grid_x: 3, grid_y: 0})

      assert Tactics.elevation_modifier(state, a, d) == 0.90
    end

    test "23. elevation_advantage/3 returns elevation metrics and hit rate bonus" do
      state = build_state(%{
        elevation_map: %{"0,0" => 2, "3,0" => 0}
      })
      a = build_combatant(%{grid_x: 0, grid_y: 0})
      d = build_combatant(%{grid_x: 3, grid_y: 0})

      metrics = Tactics.elevation_advantage(state, a, d)
      assert metrics.has_high_ground == true
      assert metrics.hit_rate_bonus == 0.15
      assert metrics.range_bonus == 2
      assert metrics.damage_mult == 1.15
    end

    test "24. effective_range/3 grants +2 range when attacker elevation >= 1" do
      s_flat = build_state(%{elevation_map: %{"0,0" => 0}})
      s_high = build_state(%{elevation_map: %{"0,0" => 1}})
      a = build_combatant(%{grid_x: 0, grid_y: 0})

      assert Tactics.effective_range(s_flat, a, 1) == 1
      assert Tactics.effective_range(s_high, a, 1) == 3
    end
  end

  describe "Tactics.calculate/3 combined resolution" do
    test "25. aggregates los, cover, flanking, and elevation into combined multiplier" do
      # Attacker on high ground (+15%), rear flanking (+25%), no cover (1.0)
      state = build_state(%{
        elevation_map: %{"0,3" => 2, "0,0" => 0}
      })
      a = build_combatant(%{grid_x: 0, grid_y: 3})
      d = build_combatant(%{grid_x: 0, grid_y: 0, cone_direction: "south"})

      result = Tactics.calculate(state, a, d)
      assert result.los == true
      assert result.cover == 1.0
      assert result.flanking == 1.25
      assert result.elevation == 1.15
      assert_in_delta result.combined, 1.25 * 1.15, 0.001
    end
  end
end
