defmodule TePhoenix.Battle.FormationsTest do
  use ExUnit.Case, async: false

  alias TePhoenix.Battle.Formations

  describe "Formations offset calculations" do
    test "calculate_offsets(:line, 1) places single unit at origin" do
      assert Formations.calculate_offsets(:line, 1) == [{0.0, 0.0}]
    end

    test "calculate_offsets(:line, 3) centers 3 units symmetrically" do
      offsets = Formations.calculate_offsets(:line, 3)
      assert length(offsets) == 3
      assert offsets == [{0.0, -1.0}, {0.0, 0.0}, {0.0, 1.0}]
    end

    test "calculate_offsets(:column, 3) aligns units along the x-axis" do
      offsets = Formations.calculate_offsets(:column, 3)
      assert length(offsets) == 3
      assert offsets == [{-1.0, 0.0}, {0.0, 0.0}, {1.0, 0.0}]
    end

    test "calculate_offsets(:wedge, 3) creates a V-formation" do
      offsets = Formations.calculate_offsets(:wedge, 3)
      assert length(offsets) == 3
      # Unit 0 is at apex (0, 0)
      assert Enum.at(offsets, 0) == {0.0, 0.0}
      # Unit 1 is at (-1, 1)
      assert Enum.at(offsets, 1) == {-1.0, 1.0}
      # Unit 2 is at (-1, -1)
      assert Enum.at(offsets, 2) == {-1.0, -1.0}
    end

    test "calculate_offsets(:wedge, 5) expands the V-formation" do
      offsets = Formations.calculate_offsets(:wedge, 5)
      assert length(offsets) == 5
      assert Enum.at(offsets, 0) == {0.0, 0.0}
      assert Enum.at(offsets, 3) == {-2.0, 2.0}
      assert Enum.at(offsets, 4) == {-2.0, -2.0}
    end

    test "calculate_offsets(:box, 4) creates a 2x2 grid centered at origin" do
      offsets = Formations.calculate_offsets(:box, 4)
      assert length(offsets) == 4
      assert offsets == [{-0.5, -0.5}, {-0.5, 0.5}, {0.5, -0.5}, {0.5, 0.5}]
    end

    test "calculate_offsets(:circle, 1) places single unit at center" do
      assert Formations.calculate_offsets(:circle, 1) == [{0.0, 0.0}]
    end

    test "calculate_offsets(:circle, 4) creates 4 points radially spaced" do
      offsets = Formations.calculate_offsets(:circle, 4)
      assert length(offsets) == 4
      # Unit 0 should be at angle 0 (cos=1, sin=0)
      {x0, y0} = Enum.at(offsets, 0)
      assert x0 > 0.0
      assert_in_delta y0, 0.0, 0.001
    end
  end

  describe "Formations rotation math" do
    test "rotate_offsets returns identical offsets when facing is 0" do
      offsets = [{1.0, 0.0}, {0.0, 1.0}]
      assert Formations.rotate_offsets(offsets, 0) == offsets
      assert Formations.rotate_offsets(offsets, 0.0) == offsets
    end

    test "rotate_offsets rotates 90 degrees (pi/2) counterclockwise" do
      offsets = [{1.0, 0.0}]
      rotated = Formations.rotate_offsets(offsets, :math.pi() / 2)
      [{rx, ry}] = rotated
      assert_in_delta rx, 0.0, 0.001
      assert_in_delta ry, 1.0, 0.001
    end

    test "rotate_offsets rotates 180 degrees (pi)" do
      offsets = [{2.0, 3.0}]
      rotated = Formations.rotate_offsets(offsets, :math.pi())
      [{rx, ry}] = rotated
      assert_in_delta rx, -2.0, 0.001
      assert_in_delta ry, -3.0, 0.001
    end
  end

  describe "Formations.assign_formation/5" do
    test "assigns positions to units centered around (center_x, center_y)" do
      units = [101, 102, 103]
      assert {:ok, assignments} = Formations.assign_formation(units, :line, 10, 20)
      assert length(assignments) == 3

      assert {101, 10, 19} in assignments
      assert {102, 10, 20} in assignments
      assert {103, 10, 21} in assignments
    end

    test "falls back to :line when unknown formation type is passed" do
      units = [1, 2]
      assert {:ok, assignments} = Formations.assign_formation(units, :zigzag_blitz, 5, 5)
      assert length(assignments) == 2
    end

    test "assigns column formation along the vertical axis" do
      units = [1, 2, 3]
      assert {:ok, assignments} = Formations.assign_formation(units, :column, 15, 15)
      assert length(assignments) == 3
      assert {1, 14, 15} in assignments
      assert {2, 15, 15} in assignments
      assert {3, 16, 15} in assignments
    end

    test "assigns wedge formation correctly" do
      units = [1, 2, 3]
      assert {:ok, assignments} = Formations.assign_formation(units, :wedge, 20, 20)
      assert length(assignments) == 3
      assert {1, 20, 20} in assignments
      assert {2, 19, 21} in assignments
      assert {3, 19, 19} in assignments
    end

    test "handles empty unit list gracefully" do
      assert {:ok, []} = Formations.assign_formation([], :line, 10, 10)
    end
  end

  alias TePhoenix.Battle.Combatant

  describe "Formations.attack_move/4" do
    defp attack_move_state do
      %{
        combatants: %{
          1 => %Combatant{char_id: 1, name: "Soldier1", team_id: 1, grid_x: 5, grid_y: 5, current_hp: 100, max_hp: 100, knocked_out: false, has_moved: false},
          2 => %Combatant{char_id: 2, name: "Soldier2", team_id: 1, grid_x: 5, grid_y: 6, current_hp: 100, max_hp: 100, knocked_out: false, has_moved: false},
          3 => %Combatant{char_id: 3, name: "Enemy", team_id: 2, grid_x: 6, grid_y: 5, current_hp: 50, max_hp: 50, knocked_out: false, has_moved: false}
        }
      }
    end

    test "engages enemy when unit is adjacent to enemy" do
      state = attack_move_state()
      # Unit 1 is at (5,5), Enemy is at (6,5) -> adjacent!
      {_new_state, results} = Formations.attack_move(state, [1], 10, 10)
      assert {:engage, 1, 3} in results
    end

    test "moves toward target when no enemy is adjacent" do
      state = attack_move_state()
      # Remove enemy so unit can advance
      state = %{state | combatants: Map.delete(state.combatants, 3)}
      {new_state, results} = Formations.attack_move(state, [1], 7, 5)

      # Unit 1 was at (5, 5), moves one step to (6, 5)
      assert {:moving, 1, 6, 5} in results
      assert new_state.combatants[1].grid_x == 6
      assert new_state.combatants[1].grid_y == 5
    end

    test "reports arrived when unit is already at target" do
      state = attack_move_state()
      state = %{state | combatants: Map.delete(state.combatants, 3)}
      {_new_state, results} = Formations.attack_move(state, [1], 5, 5)
      assert {:arrived, 1} in results
    end

    test "skips non-existent unit in group" do
      state = attack_move_state()
      {_new_state, results} = Formations.attack_move(state, [999], 10, 10)
      assert {:skip, 999} in results
    end
  end
end
