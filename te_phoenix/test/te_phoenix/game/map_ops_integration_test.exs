defmodule TePhoenix.Game.MapOpsIntegrationTest do
  @moduledoc """
  Phase 2B.1 — DB-backed integration tests for MapOps.

  Pure-logic tests for apply/invert live in `map_ops_test.exs`. This
  file exercises the Ecto-sandboxed read/write path: `append/5`,
  `list/2`, `replay/3`, `write_snapshot/2`. Determinism of replay is
  the foundation for Phase 3 CRDT, so these tests are the contract.
  """

  use TePhoenix.DataCase, async: false

  alias TePhoenix.Game.MapOps

  setup do
    # Schema is set up once in test_helper.exs (DDL can't run inside the
    # sandbox transaction since MySQL auto-commits it). Each test gets a
    # fresh map row inside the sandboxed transaction.
    {:ok, map_id: insert_blank_map()}
  end

  defp insert_blank_map do
    layers_json =
      Jason.encode!(%{
        "layers" => %{
          "ground" => List.duplicate(-1, 16),
          "overlay" => List.duplicate(-1, 16),
          "passability" => List.duplicate(0, 16),
          "fringe" => List.duplicate(-1, 16),
          "elevation" => List.duplicate(0, 16)
        }
      })

    {:ok, %{last_insert_id: id}} =
      Repo.query(
        "INSERT INTO game_maps (name, width, height, layers_json, render_mode) VALUES (?, ?, ?, ?, ?)",
        ["test", 4, 4, layers_json, "classic"]
      )

    id
  end

  defp uuid, do: "test_" <> Base.encode16(:crypto.strong_rand_bytes(6), case: :lower)

  defp paint_op(layer, x, y, id, prev_id \\ -1),
    do: %{"layer" => layer, "x" => x, "y" => y, "id" => id, "prev_id" => prev_id}

  defp blank_state(map_id) do
    %{
      id: map_id,
      width: 4,
      height: 4,
      layers: %{
        "ground" => List.duplicate(-1, 16),
        "overlay" => List.duplicate(-1, 16),
        "passability" => List.duplicate(0, 16),
        "fringe" => List.duplicate(-1, 16),
        "elevation" => List.duplicate(0, 16)
      },
      objects: [],
      events: [],
      properties: %{}
    }
  end

  describe "append/5" do
    test "inserts op with monotonic seq for the map", %{map_id: m} do
      {:ok, op1} = MapOps.append(m, uuid(), "paint_tile", paint_op("ground", 0, 0, 5))
      {:ok, op2} = MapOps.append(m, uuid(), "paint_tile", paint_op("ground", 1, 0, 5))
      {:ok, op3} = MapOps.append(m, uuid(), "paint_tile", paint_op("ground", 2, 0, 5))

      assert op1.sequence == 1
      assert op2.sequence == 2
      assert op3.sequence == 3
    end

    test "is idempotent on duplicate op_id (returns existing row, no second insert)", %{map_id: m} do
      id = uuid()
      {:ok, first} = MapOps.append(m, id, "paint_tile", paint_op("ground", 0, 0, 5))
      {:ok, second} = MapOps.append(m, id, "paint_tile", paint_op("ground", 0, 0, 5))

      assert first.sequence == second.sequence
      assert first.op_id == second.op_id

      ops = MapOps.list(m)
      assert length(ops) == 1
    end

    # Sandbox shares one DB connection, so true OS-level concurrency
    # isn't testable here — the test verifies the contract that the
    # SELECT FOR UPDATE + UPDATE atomic pattern in `lock_and_increment_head`
    # produces unique monotonic sequences across rapid repeated calls,
    # which is the property concurrency testing would also verify.
    # A real concurrency test belongs in a separate suite hitting a
    # non-sandboxed connection (Phase 3 prep).
    test "rapid sequential appends from same user produce unique monotonic seqs", %{map_id: m} do
      results =
        for i <- 1..10 do
          {:ok, r} = MapOps.append(m, "u1_op_#{i}", "paint_tile", paint_op("ground", i, 0, 5), user_id: 1)
          r
        end

      seqs = Enum.map(results, & &1.sequence) |> Enum.sort()
      assert seqs == Enum.to_list(1..10)
    end

    test "rapid appends from different users still produce contiguous seqs", %{map_id: m} do
      results =
        for i <- 1..6 do
          uid = rem(i, 3) + 1

          {:ok, r} =
            MapOps.append(m, "u#{uid}_op_#{i}", "paint_tile", paint_op("ground", i, 0, 5),
              user_id: uid,
              user_name: "user#{uid}"
            )

          r
        end

      seqs = Enum.map(results, & &1.sequence) |> Enum.sort()
      assert seqs == Enum.to_list(1..6)
    end
  end

  describe "list/2" do
    test "orders by sequence ASC", %{map_id: m} do
      for i <- 1..5 do
        MapOps.append(m, "lst_#{i}_" <> uuid(), "paint_tile", paint_op("ground", i, 0, 5))
      end

      ops = MapOps.list(m)
      seqs = Enum.map(ops, & &1.sequence)
      assert seqs == [1, 2, 3, 4, 5]
    end

    test "filters by since/up_to", %{map_id: m} do
      for i <- 1..5 do
        MapOps.append(m, "lst2_#{i}_" <> uuid(), "paint_tile", paint_op("ground", i, 0, 5))
      end

      mid = MapOps.list(m, since: 1, up_to: 3)
      assert Enum.map(mid, & &1.sequence) == [2, 3]
    end

    test "skips inverted by default", %{map_id: m} do
      {:ok, op1} = MapOps.append(m, uuid(), "paint_tile", paint_op("ground", 0, 0, 5))
      {:ok, _op2} = MapOps.append(m, uuid(), "paint_tile", paint_op("ground", 1, 0, 5))

      Repo.query!("UPDATE game_map_ops_log SET inverted = 1 WHERE map_id = ? AND op_id = ?", [m, op1.op_id])

      visible = MapOps.list(m)
      assert length(visible) == 1
      assert hd(visible).sequence == 2

      both = MapOps.list(m, include_inverted: true)
      assert length(both) == 2
    end
  end

  describe "replay/3" do
    test "replays from genesis when no snapshot", %{map_id: m} do
      {:ok, _} = MapOps.append(m, uuid(), "paint_tile", paint_op("ground", 0, 0, 7))
      {:ok, _} = MapOps.append(m, uuid(), "paint_tile", paint_op("ground", 1, 1, 9))

      state = MapOps.replay(m, blank_state(m))
      ground = state.layers["ground"]
      assert Enum.at(ground, 0) == 7
      assert Enum.at(ground, 1 + 1 * 4) == 9
    end

    test "skips inverted ops during replay", %{map_id: m} do
      {:ok, op1} = MapOps.append(m, uuid(), "paint_tile", paint_op("ground", 0, 0, 7))
      {:ok, _} = MapOps.append(m, uuid(), "paint_tile", paint_op("ground", 1, 0, 9))

      Repo.query!("UPDATE game_map_ops_log SET inverted = 1 WHERE map_id = ? AND op_id = ?", [m, op1.op_id])

      state = MapOps.replay(m, blank_state(m))
      ground = state.layers["ground"]
      # op1 inverted → cell (0,0) stays at the blank sentinel -1
      assert Enum.at(ground, 0) == -1
      # op2 still applied
      assert Enum.at(ground, 1) == 9
    end

    test "stops at up_to_seq", %{map_id: m} do
      {:ok, _} = MapOps.append(m, uuid(), "paint_tile", paint_op("ground", 0, 0, 7))
      {:ok, _} = MapOps.append(m, uuid(), "paint_tile", paint_op("ground", 1, 0, 8))
      {:ok, _} = MapOps.append(m, uuid(), "paint_tile", paint_op("ground", 2, 0, 9))

      state = MapOps.replay(m, blank_state(m), up_to: 2)
      ground = state.layers["ground"]
      assert Enum.at(ground, 0) == 7
      assert Enum.at(ground, 1) == 8
      assert Enum.at(ground, 2) == -1
    end

    test "replays from snapshot when one exists", %{map_id: m} do
      # Seed 3 ops, snapshot at seq 3, then 2 more ops on top.
      for x <- 0..2 do
        {:ok, _} = MapOps.append(m, uuid(), "paint_tile", paint_op("ground", x, 0, 5))
      end

      # Update game_maps.layers_json to reflect post-op-3 state
      # (simulates the editor saving its current view before snapshot).
      post3_layers =
        Jason.encode!(%{
          "ground" => [5, 5, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
          "overlay" => List.duplicate(-1, 16),
          "passability" => List.duplicate(0, 16),
          "fringe" => List.duplicate(-1, 16),
          "elevation" => List.duplicate(0, 16)
        })

      Repo.query!("UPDATE game_maps SET layers_json = ? WHERE id = ?", [post3_layers, m])
      :ok = MapOps.write_snapshot(m, 3)

      # Add 2 more ops AFTER the snapshot.
      {:ok, _} = MapOps.append(m, uuid(), "paint_tile", paint_op("ground", 0, 1, 9))
      {:ok, _} = MapOps.append(m, uuid(), "paint_tile", paint_op("ground", 1, 1, 9))

      state = MapOps.replay(m, blank_state(m))
      ground = state.layers["ground"]
      # Snapshot loaded → first row painted with 5s
      assert Enum.at(ground, 0) == 5
      assert Enum.at(ground, 1) == 5
      assert Enum.at(ground, 2) == 5
      # Post-snapshot ops applied on top
      assert Enum.at(ground, 0 + 1 * 4) == 9
      assert Enum.at(ground, 1 + 1 * 4) == 9
    end
  end

  describe "write_snapshot/2" do
    test "writes a snapshot row at given seq", %{map_id: m} do
      :ok = MapOps.write_snapshot(m, 100)

      {:ok, %{rows: rows}} =
        Repo.query("SELECT seq FROM game_map_snapshots WHERE map_id = ?", [m])

      assert [[100]] = rows
    end

    test "old snapshots are not deleted (history preserved)", %{map_id: m} do
      :ok = MapOps.write_snapshot(m, 100)
      :ok = MapOps.write_snapshot(m, 200)
      :ok = MapOps.write_snapshot(m, 300)

      {:ok, %{rows: rows}} =
        Repo.query("SELECT seq FROM game_map_snapshots WHERE map_id = ? ORDER BY seq", [m])

      assert rows == [[100], [200], [300]]
    end
  end

  describe "round-trip per op type (apply + invert)" do
    test "paint_tile", %{map_id: m} do
      {:ok, op} = MapOps.append(m, uuid(), "paint_tile", paint_op("ground", 0, 0, 7))

      s0 = blank_state(m)
      s1 = MapOps.apply_op(op, s0)
      assert Enum.at(s1.layers["ground"], 0) == 7

      inv = MapOps.invert_op(op)
      s2 = MapOps.apply_op(inv, s1)
      assert s2.layers["ground"] == s0.layers["ground"]
    end

    test "set_property", %{map_id: m} do
      payload = %{"field" => "render_mode", "prev" => "classic", "new" => "isometric"}
      {:ok, op} = MapOps.append(m, uuid(), "set_property", payload)

      s0 = %{blank_state(m) | properties: %{"render_mode" => "classic"}}
      s1 = MapOps.apply_op(op, s0)
      assert s1.properties["render_mode"] == "isometric"

      inv = MapOps.invert_op(op)
      s2 = MapOps.apply_op(inv, s1)
      assert s2.properties["render_mode"] == "classic"
    end

    test "set_spawn", %{map_id: m} do
      payload = %{"x" => 5, "y" => 7, "prev_x" => 1, "prev_y" => 1}
      {:ok, op} = MapOps.append(m, uuid(), "set_spawn", payload)

      s0 = blank_state(m) |> Map.merge(%{spawn_x: 1, spawn_y: 1})
      s1 = MapOps.apply_op(op, s0)
      assert s1.spawn_x == 5 and s1.spawn_y == 7

      inv = MapOps.invert_op(op)
      s2 = MapOps.apply_op(inv, s1)
      assert s2.spawn_x == 1 and s2.spawn_y == 1
    end
  end
end
