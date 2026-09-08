defmodule TePhoenix.World.MapGeneratorsTest do
  use ExUnit.Case, async: true
  alias TePhoenix.World.MapGenerators

  describe "generate_dungeon/3" do
    test "generates a BSP dungeon with correct dimensions, floors, and 2.5D elevated walls" do
      w = 20
      h = 20
      result = MapGenerators.generate_dungeon(w, h, floor_id: 5, wall_id: 1, elevated_walls: true)

      assert length(result.ground) == w * h
      assert length(result.elevation) == w * h
      assert length(result.passability) == w * h

      # Must have both floors and walls
      assert 5 in result.ground
      assert 1 in result.ground

      # In 2.5D mode, wall tiles have elevation = 1, floors have elevation = 0
      for {ground, elev, pass} <- Enum.zip([result.ground, result.elevation, result.passability]) do
        if ground == 1 do
          assert elev == 1
          assert pass == 1
        else
          assert elev == 0
          assert pass == 0
        end
      end

      # Rooms were carved
      assert length(result.rooms) >= 2
    end
  end

  describe "generate_cave/3" do
    test "generates a cellular automata cave with enclosed perimeter walls" do
      w = 25
      h = 25
      result = MapGenerators.generate_cave(w, h, floor_id: 6, wall_id: 1, elevated_walls: true)

      assert length(result.ground) == w * h

      # Perimeter must be solid walls
      for x <- 0..(w - 1) do
        assert Enum.at(result.ground, 0 * w + x) == 1
        assert Enum.at(result.ground, (h - 1) * w + x) == 1
      end

      for y <- 0..(h - 1) do
        assert Enum.at(result.ground, y * w + 0) == 1
        assert Enum.at(result.ground, y * w + (w - 1)) == 1
      end

      # Must have carved interior cave floors
      assert 6 in result.ground
    end
  end

  describe "generate_maze/3" do
    test "generates a recursive labyrinth with carved corridors" do
      w = 17
      h = 17
      result = MapGenerators.generate_maze(w, h, floor_id: 5, wall_id: 1, elevated_walls: true)

      assert length(result.ground) == w * h

      # Starting cell at (1, 1) is carved
      assert Enum.at(result.ground, 1 * w + 1) == 5

      # Must have both floors and walls
      assert 5 in result.ground
      assert 1 in result.ground
    end
  end
end
