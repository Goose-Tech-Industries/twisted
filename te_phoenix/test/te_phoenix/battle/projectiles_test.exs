defmodule TePhoenix.Battle.ProjectilesTest do
  use ExUnit.Case, async: true

  alias TePhoenix.Battle.{Combatant, Projectiles}

  defp build_fighter(attrs) do
    base = %Combatant{
      char_id: 1,
      name: "Mage",
      team_id: 1,
      current_hp: 100,
      max_hp: 100,
      grid_x: 0,
      grid_y: 0,
      statuses: []
    }

    Map.merge(base, Map.new(attrs))
  end

  defp build_state(attrs \\ %{}) do
    actor = build_fighter(%{char_id: 1, team_id: 1, grid_x: 0, grid_y: 0})
    enemy = build_fighter(%{char_id: 2, team_id: 2, grid_x: 4, grid_y: 0})

    base = %{
      battle_id: "battle_proj_1",
      combatants: %{1 => actor, 2 => enemy},
      active_projectiles: [],
      settings: %{},
      terrain_map: %{},
      battle_objects: %{},
      elevation_map: %{}
    }

    Map.merge(base, Map.new(attrs))
  end

  describe "Projectiles.spawn_projectile/5" do
    test "1. creates a projectile and adds it to state.active_projectiles" do
      state = build_state()
      actor = state.combatants[1]
      target = state.combatants[2]
      config = %{"speed" => 2, "trajectory" => "line", "visual" => "fireball"}

      {new_state, result} = Projectiles.spawn_projectile(state, actor, target, config, "Firebolt")

      assert length(new_state.active_projectiles) == 1
      proj = hd(new_state.active_projectiles)
      assert proj.owner_id == actor.char_id
      assert proj.target_id == target.char_id
      assert proj.speed == 2
      assert proj.trajectory == "line"
      assert proj.visual == "fireball"
      assert proj.tiles_traveled == 0
      assert hd(result.actions).type == :projectile_spawned
    end

    test "2. defaults speed to 3 when not specified in config" do
      state = build_state()
      {new_state, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], %{}, "Dart")
      proj = hd(new_state.active_projectiles)
      assert proj.speed == 3
    end

    test "3. defaults trajectory to line when not specified" do
      state = build_state()
      {new_state, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], %{}, "Dart")
      proj = hd(new_state.active_projectiles)
      assert proj.trajectory == "line"
    end

    test "4. defaults max_range to 8 tiles" do
      state = build_state()
      {new_state, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], %{}, "Dart")
      proj = hd(new_state.active_projectiles)
      assert proj.max_range == 8
    end

    test "5. sets piercing flag correctly when configured" do
      state = build_state()
      cfg = %{"piercing" => true}
      {new_state, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], cfg, "Railgun")
      proj = hd(new_state.active_projectiles)
      assert proj.piercing == true
    end

    test "6. defaults piercing flag to false when omitted" do
      state = build_state()
      {new_state, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], %{}, "Arrow")
      proj = hd(new_state.active_projectiles)
      assert proj.piercing == false
    end

    test "7. configures aoe_radius and aoe_shape" do
      state = build_state()
      cfg = %{"aoe_radius" => 2, "aoe_shape" => "cone"}
      {new_state, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], cfg, "Blast")
      proj = hd(new_state.active_projectiles)
      assert proj.aoe_radius == 2
      assert proj.aoe_shape == "cone"
    end

    test "8. handles nil target gracefully using actor position as target" do
      state = build_state()
      actor = state.combatants[1]
      {new_state, _} = Projectiles.spawn_projectile(state, actor, nil, %{}, "Blind Shot")
      proj = hd(new_state.active_projectiles)
      assert proj.target_id == nil
      assert proj.target_x == actor.grid_x
      assert proj.target_y == actor.grid_y
    end
  end

  describe "Projectiles.tick_projectiles/2 movement & flight" do
    test "9. tick_projectiles with no active projectiles returns unchanged state" do
      state = build_state()
      {new_state, result} = Projectiles.tick_projectiles(state)
      assert new_state.active_projectiles == []
      assert result == %{log: [], actions: []}
    end

    test "10. moves projectile closer to target on each tick" do
      state = build_state()
      # Target is at x=4, y=0. Actor at x=0, y=0. Speed=1.
      config = %{"speed" => 1, "max_range" => 10}
      {state, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], config, "Bullet")

      {state1, _} = Projectiles.tick_projectiles(state)
      proj1 = hd(state1.active_projectiles)
      assert proj1.current_x > 0.0
      assert proj1.tiles_traveled == 1
    end

    test "11. projectile increments tiles_traveled on every tick" do
      state = build_state()
      config = %{"speed" => 1, "max_range" => 10}
      {state, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], config, "Slow Orb")

      {state1, _} = Projectiles.tick_projectiles(state)
      {state2, _} = Projectiles.tick_projectiles(state1)

      proj = hd(state2.active_projectiles)
      assert proj.tiles_traveled == 2
    end

    test "12. despawns projectile when tiles_traveled reaches max_range" do
      state = build_state()
      # max_range = 2, target is far away at x=10
      far_enemy = build_fighter(%{char_id: 3, team_id: 2, grid_x: 10, grid_y: 0})
      state = put_in(state.combatants[3], far_enemy)
      config = %{"speed" => 1, "max_range" => 2}
      {state, _} = Projectiles.spawn_projectile(state, state.combatants[1], far_enemy, config, "Short Spark")

      {state, _} = Projectiles.tick_projectiles(state) # tick 1
      assert length(state.active_projectiles) == 1

      {state, result} = Projectiles.tick_projectiles(state) # tick 2 -> despawns
      assert state.active_projectiles == []
      assert Enum.any?(result.actions, & &1.type == :projectile_despawn)
    end

    test "13. homing projectile updates its destination if target moves" do
      state = build_state()
      config = %{"speed" => 1, "trajectory" => "homing", "max_range" => 10}
      {state, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], config, "Homing Seeker")

      # Enemy moves from (4,0) to (4,3)
      state = update_in(state.combatants[2], & %{&1 | grid_y: 3})

      {state, _} = Projectiles.tick_projectiles(state)
      proj = hd(state.active_projectiles)
      assert proj.target_y == 3
    end

    test "14. arc trajectory computes Y-axis parabolic height" do
      state = build_state()
      config = %{"speed" => 1, "trajectory" => "arc", "max_range" => 10}
      {state, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], config, "Mortar")

      {state, _} = Projectiles.tick_projectiles(state)
      proj = hd(state.active_projectiles)
      # In 2D grid screen space, negative Y represents upward arc
      assert is_float(proj.current_y)
    end
  end

  describe "Projectiles collision & hit resolution" do
    test "15. projectile hits enemy when entering enemy tile" do
      state = build_state()
      # Place enemy at (1, 0), actor at (0, 0), speed = 1
      enemy = build_fighter(%{char_id: 2, team_id: 2, grid_x: 1, grid_y: 0})
      state = put_in(state.combatants[2], enemy)
      config = %{"speed" => 1, "max_range" => 5, "piercing" => false}
      {state, _} = Projectiles.spawn_projectile(state, state.combatants[1], enemy, config, "Direct Shot")

      {new_state, result} = Projectiles.tick_projectiles(state)
      # Non-piercing projectile is consumed on hit
      assert new_state.active_projectiles == []
      assert Enum.any?(result.actions, fn a -> a.type == :projectile_hit or a[:type] == :projectile_hit end)
    end

    test "16. friendly allies on flight path are not struck by default" do
      state = build_state()
      # Place friendly ally at (1, 0), enemy at (3, 0)
      ally = build_fighter(%{char_id: 99, team_id: 1, grid_x: 1, grid_y: 0})
      state = put_in(state.combatants[99], ally)
      config = %{"speed" => 1, "max_range" => 5}
      {state, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], config, "Arrow")

      {new_state, result} = Projectiles.tick_projectiles(state)
      # Ally was not hit, projectile continues through ally's square
      assert length(new_state.active_projectiles) == 1
      refute Enum.any?(result.actions, & &1.type == :projectile_hit)
    end

    test "17. piercing projectile hits enemy and continues moving forward" do
      state = build_state()
      # Place enemy at (1, 0) and another enemy at (2, 0)
      e1 = build_fighter(%{char_id: 2, team_id: 2, grid_x: 1, grid_y: 0})
      e2 = build_fighter(%{char_id: 3, team_id: 2, grid_x: 2, grid_y: 0})
      state = %{state | combatants: %{1 => state.combatants[1], 2 => e1, 3 => e2}}
      config = %{"speed" => 1, "max_range" => 5, "piercing" => true}

      {state, _} = Projectiles.spawn_projectile(state, state.combatants[1], e2, config, "Piercing Laser")

      # Tick 1: hits e1 at (1, 0), but stays alive because it is piercing!
      {state1, _} = Projectiles.tick_projectiles(state)
      assert length(state1.active_projectiles) == 1
      proj = hd(state1.active_projectiles)
      assert MapSet.member?(proj.hit_ids, 2)
    end

    test "18. piercing projectile does not hit the same enemy twice" do
      state = build_state()
      e1 = build_fighter(%{char_id: 2, team_id: 2, grid_x: 1, grid_y: 0})
      state = put_in(state.combatants[2], e1)
      config = %{"speed" => 0.1, "max_range" => 5, "piercing" => true}
      {state, _} = Projectiles.spawn_projectile(state, state.combatants[1], e1, config, "Slow Cloud")

      # Force projectile to already have hit enemy 2
      proj = hd(state.active_projectiles)
      proj = %{proj | current_x: 1.0, current_y: 0.0, hit_ids: MapSet.new([2])}
      state = %{state | active_projectiles: [proj]}

      {_state, result} = Projectiles.tick_projectiles(state)
      refute Enum.any?(result.actions, & &1.type == :projectile_hit)
    end

    test "19. dead enemies on trajectory are ignored" do
      state = build_state()
      dead_enemy = build_fighter(%{char_id: 2, team_id: 2, current_hp: 0, grid_x: 1, grid_y: 0})
      state = put_in(state.combatants[2], dead_enemy)
      config = %{"speed" => 1, "max_range" => 5}

      {state, _} = Projectiles.spawn_projectile(state, state.combatants[1], dead_enemy, config, "Dart")
      {new_state, result} = Projectiles.tick_projectiles(state)

      # Projectile did not collide with dead combatant
      assert length(new_state.active_projectiles) == 1
      refute Enum.any?(result.actions, & &1.type == :projectile_hit)
    end

    test "20. multiple projectiles tick concurrently in the same state" do
      state = build_state()
      config = %{"speed" => 1, "max_range" => 10}
      {state, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], config, "Bullet 1")
      {state, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], config, "Bullet 2")

      assert length(state.active_projectiles) == 2
      {state, _} = Projectiles.tick_projectiles(state)
      assert length(state.active_projectiles) == 2
      assert Enum.all?(state.active_projectiles, & &1.tiles_traveled == 1)
    end

    test "21. on_hit_status is recorded in projectile struct" do
      state = build_state()
      config = %{"on_hit_status" => "burn_major"}
      {state, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], config, "Fire Arrow")
      proj = hd(state.active_projectiles)
      assert proj.on_hit_status == "burn_major"
    end

    test "22. on_miss_terrain is recorded in projectile struct" do
      state = build_state()
      config = %{"on_miss_terrain" => "fire"}
      {state, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], config, "Ignite")
      proj = hd(state.active_projectiles)
      assert proj.on_miss_terrain == "fire"
    end

    test "23. action_name is preserved in projectile metadata" do
      state = build_state()
      {state, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], %{}, "Volley")
      proj = hd(state.active_projectiles)
      assert proj.action_name == "Volley"
    end

    test "24. origin coordinates match actor initial position" do
      state = build_state()
      actor = build_fighter(%{char_id: 1, grid_x: 3, grid_y: 5})
      state = put_in(state.combatants[1], actor)

      {state, _} = Projectiles.spawn_projectile(state, actor, state.combatants[2], %{}, "Shot")
      proj = hd(state.active_projectiles)
      assert proj.origin_x == 3
      assert proj.origin_y == 5
      assert proj.current_x == 3.0
      assert proj.current_y == 5.0
    end

    test "25. dodge_window_ms matches config or falls back to default 400ms" do
      state = build_state()
      {s1, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], %{}, "Default")
      assert hd(s1.active_projectiles).dodge_window_ms == 400

      {s2, _} = Projectiles.spawn_projectile(state, state.combatants[1], state.combatants[2], %{"dodge_window_ms" => 750}, "Custom")
      assert hd(s2.active_projectiles).dodge_window_ms == 750
    end
  end
end
