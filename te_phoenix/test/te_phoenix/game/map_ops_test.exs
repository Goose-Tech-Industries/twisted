defmodule TePhoenix.Game.MapOpsTest do
  @moduledoc """
  Phase 2B round-trip tests for the op log apply/invert pair.

  These exercise pure logic only — no DB. The append/list/replay path
  needs a real Repo and is covered by integration tests when they land.
  """

  use ExUnit.Case, async: true

  alias TePhoenix.Game.MapOps

  defp blank_state(w \\ 4, h \\ 4) do
    %{
      width: w,
      height: h,
      layers: %{
        "ground" => List.duplicate(-1, w * h),
        "passability" => List.duplicate(0, w * h)
      },
      objects: [],
      events: [],
      properties: %{}
    }
  end

  defp at(state, layer, x, y) do
    Enum.at(state.layers[layer], y * state.width + x)
  end

  describe "paint_tile" do
    test "applies a single-cell paint" do
      s0 = blank_state()
      op = %{op_type: "paint_tile", patch: %{"layer" => "ground", "x" => 1, "y" => 2, "id" => 5, "prev_id" => -1}}
      s1 = MapOps.apply_op(op, s0)
      assert at(s1, "ground", 1, 2) == 5
    end

    test "round-trip: apply → invert → apply restores original" do
      s0 = blank_state()
      op = %{op_type: "paint_tile", patch: %{"layer" => "ground", "x" => 0, "y" => 0, "id" => 7, "prev_id" => -1}}
      s1 = MapOps.apply_op(op, s0)
      assert at(s1, "ground", 0, 0) == 7

      inv = MapOps.invert_op(op)
      assert inv.op_type == "paint_tile"
      assert inv.patch["id"] == -1
      s2 = MapOps.apply_op(inv, s1)
      assert at(s2, "ground", 0, 0) == -1
      assert s2.layers["ground"] == s0.layers["ground"]
    end
  end

  describe "rect" do
    test "applies a rect of cells with a value" do
      s0 = blank_state()
      cells = [%{"x" => 0, "y" => 0}, %{"x" => 1, "y" => 0}, %{"x" => 2, "y" => 0}]
      op = %{op_type: "rect", patch: %{"layer" => "ground", "value" => 9, "cells" => cells}}
      s1 = MapOps.apply_op(op, s0)
      assert at(s1, "ground", 0, 0) == 9
      assert at(s1, "ground", 1, 0) == 9
      assert at(s1, "ground", 2, 0) == 9
      assert at(s1, "ground", 3, 0) == -1
    end
  end

  describe "replace_layers" do
    test "wholesale replaces the layers map" do
      s0 = blank_state()
      new_layers = %{"ground" => List.duplicate(15, 16), "passability" => List.duplicate(1, 16)}
      op = %{op_type: "replace_layers", patch: %{"layers" => new_layers}}
      s1 = MapOps.apply_op(op, s0)
      assert s1.layers == new_layers
    end
  end

  describe "place_object / delete_object" do
    test "place adds object to state.objects" do
      s0 = blank_state()
      obj = %{"id" => "abc", "x" => 3, "y" => 1, "preset" => "TORCH"}
      op = %{op_type: "place_object", patch: %{"object" => obj}}
      s1 = MapOps.apply_op(op, s0)
      assert obj in s1.objects
    end

    test "delete removes object by id" do
      s0 = blank_state() |> Map.put(:objects, [%{"id" => "abc", "x" => 1, "y" => 1}])
      op = %{op_type: "delete_object", patch: %{"object_id" => "abc"}}
      s1 = MapOps.apply_op(op, s0)
      assert s1.objects == []
    end

    test "round-trip: place → invert → no objects" do
      s0 = blank_state()
      obj = %{"id" => "xyz", "x" => 2, "y" => 2}
      place = %{op_type: "place_object", patch: %{"object" => obj}}
      s1 = MapOps.apply_op(place, s0)
      assert length(s1.objects) == 1

      inv = MapOps.invert_op(place)
      assert inv.op_type == "delete_object"
      s2 = MapOps.apply_op(inv, s1)
      assert s2.objects == []
    end
  end

  describe "set_property" do
    test "updates a property by field name" do
      s0 = blank_state()
      op = %{op_type: "set_property", patch: %{"field" => "render_mode", "prev" => "classic", "new" => "isometric"}}
      s1 = MapOps.apply_op(op, s0)
      assert s1.properties["render_mode"] == "isometric"
    end

    test "round-trip: invert restores prior value" do
      s0 = blank_state() |> Map.put(:properties, %{"render_mode" => "classic"})
      op = %{op_type: "set_property", patch: %{"field" => "render_mode", "prev" => "classic", "new" => "isometric"}}
      s1 = MapOps.apply_op(op, s0)
      assert s1.properties["render_mode"] == "isometric"

      inv = MapOps.invert_op(op)
      s2 = MapOps.apply_op(inv, s1)
      assert s2.properties["render_mode"] == "classic"
    end
  end

  describe "unknown op_type" do
    test "is a no-op (forward compatibility)" do
      s0 = blank_state()
      op = %{op_type: "future_thing_we_dont_know_yet", patch: %{}}
      assert MapOps.apply_op(op, s0) == s0
    end
  end

  describe "should_snapshot?/1" do
    test "fires every 500 ops, no-op otherwise" do
      assert MapOps.should_snapshot?(500)
      assert MapOps.should_snapshot?(1000)
      assert MapOps.should_snapshot?(2500)

      refute MapOps.should_snapshot?(1)
      refute MapOps.should_snapshot?(499)
      refute MapOps.should_snapshot?(501)
      refute MapOps.should_snapshot?(0)
      refute MapOps.should_snapshot?(-1)
      refute MapOps.should_snapshot?(nil)
    end
  end

  describe "set_spawn (D10)" do
    test "applies (x, y) to state.spawn_x / spawn_y" do
      s0 = blank_state()
      op = %{op_type: "set_spawn", patch: %{"x" => 5, "y" => 7, "prev_x" => nil, "prev_y" => nil}}
      s1 = MapOps.apply_op(op, s0)
      assert s1.spawn_x == 5
      assert s1.spawn_y == 7
    end

    test "round-trip: invert restores prior coords" do
      s0 = blank_state() |> Map.merge(%{spawn_x: 2, spawn_y: 3})
      op = %{op_type: "set_spawn", patch: %{"x" => 8, "y" => 9, "prev_x" => 2, "prev_y" => 3}}
      s1 = MapOps.apply_op(op, s0)
      assert s1.spawn_x == 8 and s1.spawn_y == 9

      inv = MapOps.invert_op(op)
      s2 = MapOps.apply_op(inv, s1)
      assert s2.spawn_x == 2 and s2.spawn_y == 3
    end

    test "does NOT touch :play_x / :play_y (transient playmode position)" do
      # Phase 2A regression: an early version risked aliasing spawn ←→ play.
      # set_spawn must persist spawn_*, not the transient play_* — the two
      # are independent (player can wander after spawn, spawn stays put).
      s0 = blank_state() |> Map.merge(%{spawn_x: 1, spawn_y: 1, play_x: 4, play_y: 4})
      op = %{op_type: "set_spawn", patch: %{"x" => 10, "y" => 10, "prev_x" => 1, "prev_y" => 1}}
      s1 = MapOps.apply_op(op, s0)
      assert s1.spawn_x == 10 and s1.spawn_y == 10
      assert s1.play_x == 4 and s1.play_y == 4
    end
  end

  describe "deterministic replay" do
    test "applying a sequence in order produces a stable state" do
      s0 = blank_state()

      ops = [
        %{op_type: "paint_tile", patch: %{"layer" => "ground", "x" => 0, "y" => 0, "id" => 1}},
        %{op_type: "paint_tile", patch: %{"layer" => "ground", "x" => 1, "y" => 0, "id" => 2}},
        %{op_type: "rect", patch: %{"layer" => "ground", "value" => 5, "cells" => [%{"x" => 0, "y" => 1}, %{"x" => 1, "y" => 1}]}},
        %{op_type: "paint_tile", patch: %{"layer" => "ground", "x" => 2, "y" => 2, "id" => 9}}
      ]

      s_a = Enum.reduce(ops, s0, &MapOps.apply_op/2)
      s_b = Enum.reduce(ops, s0, &MapOps.apply_op/2)
      assert s_a == s_b
      assert at(s_a, "ground", 0, 0) == 1
      assert at(s_a, "ground", 1, 0) == 2
      assert at(s_a, "ground", 0, 1) == 5
      assert at(s_a, "ground", 1, 1) == 5
      assert at(s_a, "ground", 2, 2) == 9
    end
  end
end
