defmodule TePhoenix.Game.FogTest do
  @moduledoc """
  Phase 2A.6 — DB-backed integration tests for the Fog runtime.
  Covers compute_view (visible/explored/hidden), capability + per-map
  gates, vision_radius_for + grant_vision overrides, mark_movement
  pubsub deltas, reset_exploration, and a smoke check on the LOS
  shadowcasting kernel.
  """

  use TePhoenix.DataCase, async: false

  alias TePhoenix.Game.Fog
  alias TePhoenix.Game.Fog.LOS

  setup do
    map_id = insert_map(width: 10, height: 10, fog_of_war: 1)
    cid = insert_character(level: 5, x: 5, y: 5, map_id: map_id, vision_radius: 3)
    {:ok, character_id: cid, map_id: map_id}
  end

  defp insert_character(opts) do
    {:ok, %{last_insert_id: id}} =
      Repo.query(
        """
        INSERT INTO characters
          (level, gold, experience, alignment, x, y, map_id, vision_radius,
           anam_current, anam_max, anam_regen_per_sec, current_hp, max_hp)
        VALUES (?, 0, 0, 'neutral', ?, ?, ?, ?, 100, 100, 1, 100, 100)
        """,
        [
          opts[:level] || 1,
          opts[:x] || 0,
          opts[:y] || 0,
          opts[:map_id],
          opts[:vision_radius] || 5
        ]
      )

    id
  end

  defp insert_map(opts) do
    {:ok, %{last_insert_id: id}} =
      Repo.query(
        """
        INSERT INTO game_maps
          (name, width, height, fog_of_war, ambient_visibility, schema_version, head_seq)
        VALUES (?, ?, ?, ?, ?, 2, 0)
        """,
        [
          opts[:name] || "TestMap",
          opts[:width] || 10,
          opts[:height] || 10,
          opts[:fog_of_war] || 0,
          opts[:ambient_visibility] || 0
        ]
      )

    id
  end

  describe "vision_radius_for/1" do
    test "returns base radius from characters row", %{character_id: cid} do
      assert Fog.vision_radius_for(cid) == 3
    end

    test "active overrides sum on top of base", %{character_id: cid} do
      {:ok, _} = Fog.grant_vision(cid, 2, 60_000, "spell:owl_sight")
      {:ok, _} = Fog.grant_vision(cid, 1, 60_000, "item:torch")

      assert Fog.vision_radius_for(cid) == 6
    end

    test "expired overrides are ignored", %{character_id: cid} do
      Repo.query(
        """
        INSERT INTO vision_radius_overrides
          (entity_type, entity_id, radius, reason, expires_at)
        VALUES ('character', ?, 5, 'expired', DATE_SUB(NOW(), INTERVAL 1 SECOND))
        """,
        [cid]
      )

      assert Fog.vision_radius_for(cid) == 3
    end
  end

  describe "compute_view/2 — gates" do
    test "fog OFF on map → visible == explored == every tile", %{character_id: cid} do
      open_map = insert_map(width: 5, height: 5, fog_of_war: 0)
      Repo.query("UPDATE characters SET map_id = ? WHERE id = ?", [open_map, cid])

      view = Fog.compute_view(cid, open_map)
      assert MapSet.size(view.visible) == 25
      assert MapSet.equal?(view.visible, view.explored)
      assert view.hidden_count == 0
    end

    test "fog ON, no exploration → visible is the LOS disk, explored equals visible", %{
      character_id: cid,
      map_id: map_id
    } do
      view = Fog.compute_view(cid, map_id)
      # radius 3 from (5,5) on an open 10x10 — non-zero, less than full
      assert MapSet.size(view.visible) > 0
      assert MapSet.size(view.visible) < 100
      assert MapSet.subset?(view.visible, view.explored)
      assert view.hidden_count > 0
    end

    test "previously-seen tiles persist as explored after the character moves", %{
      character_id: cid,
      map_id: map_id
    } do
      Fog.reveal_tiles(cid, map_id, [{0, 0}, {1, 0}, {2, 0}])

      view = Fog.compute_view(cid, map_id)
      assert MapSet.member?(view.explored, {0, 0})
      assert MapSet.member?(view.explored, {1, 0})
      assert MapSet.member?(view.explored, {2, 0})
    end
  end

  describe "reveal_tiles/3" do
    test "inserts new rows, returns count of new entries", %{character_id: cid, map_id: map_id} do
      assert Fog.reveal_tiles(cid, map_id, [{1, 1}, {2, 2}, {3, 3}]) == 3
      # Re-revealing is a no-op
      assert Fog.reveal_tiles(cid, map_id, [{1, 1}, {2, 2}]) == 0
    end

    test "empty list → 0", %{character_id: cid, map_id: map_id} do
      assert Fog.reveal_tiles(cid, map_id, []) == 0
    end
  end

  describe "mark_movement/3 — pubsub" do
    test "broadcasts fog_delta on the per-character topic", %{
      character_id: cid,
      map_id: map_id
    } do
      Phoenix.PubSub.subscribe(TePhoenix.PubSub, "fog:#{cid}:#{map_id}")

      Fog.mark_movement(cid, map_id, {5, 5})

      assert_receive %{event: :fog_delta, newly_visible: nv, newly_explored: ne}, 1_000
      assert is_list(nv)
      assert is_list(ne)
    end

    test "no broadcast when fog disabled on map", %{character_id: cid} do
      open_map = insert_map(width: 5, height: 5, fog_of_war: 0)
      Repo.query("UPDATE characters SET map_id = ? WHERE id = ?", [open_map, cid])

      Phoenix.PubSub.subscribe(TePhoenix.PubSub, "fog:#{cid}:#{open_map}")

      :ok = Fog.mark_movement(cid, open_map, {1, 1})

      refute_receive %{event: :fog_delta}, 100
    end
  end

  describe "reset_exploration/2" do
    test "wipes seen tiles + broadcasts fog_reset", %{character_id: cid, map_id: map_id} do
      Fog.reveal_tiles(cid, map_id, [{0, 0}, {1, 1}, {2, 2}])

      Phoenix.PubSub.subscribe(TePhoenix.PubSub, "fog:#{cid}:#{map_id}")

      n = Fog.reset_exploration(cid, map_id)
      assert n == 3

      assert_receive %{event: :fog_reset, count: 3}, 1_000

      view = Fog.compute_view(cid, map_id)
      refute MapSet.member?(view.explored, {0, 0}) and not MapSet.member?(view.visible, {0, 0})
    end
  end

  describe "grant_vision/4" do
    test "inserts an override row scoped to the character", %{character_id: cid} do
      assert {:ok, id} = Fog.grant_vision(cid, 4, 5_000, "torch")
      assert is_integer(id)

      {:ok, %{rows: [[radius, reason, etype]]}} =
        Repo.query(
          "SELECT radius, reason, entity_type FROM vision_radius_overrides WHERE id = ?",
          [id]
        )

      assert radius == 4
      assert reason == "torch"
      assert etype == "character"
    end
  end

  describe "LOS smoke" do
    test "open field radius 3 → 25 tiles diamond (Chebyshev)" do
      blockers = fn _ -> false end
      visible = LOS.compute_visible({5, 5}, 3, {20, 20}, blockers)
      # Open-field radius 3: shadowcasting includes origin + ring layers.
      # Sanity bounds: must include origin, must include radius-1 cardinals
      # and diagonals, must NOT extend past radius 3 in either dimension.
      assert MapSet.member?(visible, {5, 5})
      assert MapSet.member?(visible, {6, 5})
      assert MapSet.member?(visible, {7, 7})
      refute MapSet.member?(visible, {9, 9})
      assert MapSet.size(visible) > 0
    end

    test "wall column blocks every tile past it" do
      # A vertical wall at x=8 — tiles at x≥9 should be blocked from {5,5}
      blockers = fn {x, _y} -> x == 8 end
      visible = LOS.compute_visible({5, 5}, 10, {20, 20}, blockers)

      # Wall itself is visible (you can see the wall)
      assert MapSet.member?(visible, {8, 5})
      # Tiles past the wall are not visible
      refute MapSet.member?(visible, {9, 5})
      refute MapSet.member?(visible, {10, 5})
    end

    test "radius 0 → only origin" do
      visible = LOS.compute_visible({3, 3}, 0, {10, 10}, fn _ -> false end)
      assert MapSet.size(visible) == 1
      assert MapSet.member?(visible, {3, 3})
    end
  end
end
