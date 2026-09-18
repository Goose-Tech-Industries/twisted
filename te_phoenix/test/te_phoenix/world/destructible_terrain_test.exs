defmodule TePhoenix.World.DestructibleTerrainTest do
  use ExUnit.Case, async: true

  alias TePhoenix.World.DestructibleTerrain

  # Tile IDs matching TePhoenix.World.DestructibleTerrain constants
  @floor 0
  @wall 1
  @water 2
  @tree 3
  @road 4
  @sand 5
  @grass 7
  @ice 8
  @lava 9

  @ash 20
  @crater 21
  @scorched 22
  @rubble 23
  @frozen_water 24

  describe "DestructibleTerrain.transform_tile/2 - Fire interactions" do
    test "1. burns tree to ash leaving fire surface" do
      assert DestructibleTerrain.transform_tile(@tree, :fire) == {@ash, "fire"}
    end

    test "2. ignites grass leaving scorched earth and fire surface" do
      assert DestructibleTerrain.transform_tile(@grass, :fire) == {@scorched, "fire"}
    end

    test "3. melts ice into water" do
      assert DestructibleTerrain.transform_tile(@ice, :fire) == {@water, nil}
    end

    test "4. melts frozen_water back into normal water" do
      assert DestructibleTerrain.transform_tile(@frozen_water, :fire) == {@water, nil}
    end
  end

  describe "DestructibleTerrain.transform_tile/2 - Ice interactions" do
    test "5. freezes water into frozen_water leaving ice surface" do
      assert DestructibleTerrain.transform_tile(@water, :ice) == {@frozen_water, "ice"}
    end

    test "6. coats grass in ice leaving surface without altering underlying tile" do
      assert DestructibleTerrain.transform_tile(@grass, :ice) == {@grass, "ice"}
    end

    test "7. rapidly cools lava into solid stone floor" do
      assert DestructibleTerrain.transform_tile(@lava, :ice) == {@floor, nil}
    end
  end

  describe "DestructibleTerrain.transform_tile/2 - Explosion interactions" do
    test "8. collapses solid wall into rubble" do
      assert DestructibleTerrain.transform_tile(@wall, :explosion) == {@rubble, nil}
    end

    test "9. blasts tree into burning crater" do
      assert DestructibleTerrain.transform_tile(@tree, :explosion) == {@crater, "fire"}
    end

    test "10. blasts stone floor into a crater pit" do
      assert DestructibleTerrain.transform_tile(@floor, :explosion) == {@crater, nil}
    end

    test "11. blasts grass into a crater pit" do
      assert DestructibleTerrain.transform_tile(@grass, :explosion) == {@crater, nil}
    end

    test "12. blasts paved road into a crater pit" do
      assert DestructibleTerrain.transform_tile(@road, :explosion) == {@crater, nil}
    end

    test "13. blasts sand dunes into a crater pit" do
      assert DestructibleTerrain.transform_tile(@sand, :explosion) == {@crater, nil}
    end
  end

  describe "DestructibleTerrain.transform_tile/2 - Lightning interactions" do
    test "14. shatters ice blocks back to water" do
      assert DestructibleTerrain.transform_tile(@ice, :lightning) == {@water, nil}
    end

    test "15. lightning strikes tree into scorched wood with residual fire" do
      assert DestructibleTerrain.transform_tile(@tree, :lightning) == {@scorched, "fire"}
    end

    test "16. lightning scorches grass" do
      assert DestructibleTerrain.transform_tile(@grass, :lightning) == {@scorched, nil}
    end
  end

  describe "DestructibleTerrain.transform_tile/2 - Earth and Water interactions" do
    test "17. earth manipulation raises stone wall from floor" do
      assert DestructibleTerrain.transform_tile(@floor, :earth) == {@wall, nil}
    end

    test "18. earth fills explosion crater back to level floor" do
      assert DestructibleTerrain.transform_tile(@crater, :earth) == {@floor, nil}
    end

    test "19. water extinguishes scorched ground returning to floor" do
      assert DestructibleTerrain.transform_tile(@scorched, :water) == {@floor, nil}
    end
  end
end
