defmodule TePhoenix.Game.MapOpsConcurrencyTest do
  @moduledoc """
  True-concurrency test for `MapOps.append`. Spawns N parallel tasks
  on a non-sandboxed connection and asserts all sequences end up
  unique + contiguous (no collisions, no gaps).

  Phase 3 CRDT prep — replay determinism rests on the SELECT FOR
  UPDATE atomic-sequence pattern in `lock_and_increment_head/1`.

  ## Why @tag :skip by default

  This test bypasses the Ecto sandbox so its writes land in the test
  DB permanently. Skipped in normal `mix test` runs to avoid
  cluttering the schema with leftover map rows. Run explicitly with:

      mix test test/te_phoenix/game/map_ops_concurrency_test.exs --include concurrency

  After running, the test cleans up its own rows (game_maps + ops).
  """

  use ExUnit.Case, async: false
  alias TePhoenix.Game.MapOps
  alias TePhoenix.Repo

  @moduletag :concurrency

  setup_all do
    # Schema is set up in test_helper.exs.
    :ok
  end

  setup do
    # Non-sandboxed connection — writes survive the test.
    Ecto.Adapters.SQL.Sandbox.checkout(TePhoenix.Repo, sandbox: false)

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

    {:ok, %{last_insert_id: map_id}} =
      Repo.query(
        "INSERT INTO game_maps (name, width, height, layers_json, render_mode) VALUES (?, ?, ?, ?, ?)",
        ["concurrency_test_#{System.unique_integer([:positive])}", 4, 4, layers_json, "classic"]
      )

    on_exit(fn ->
      # Cleanup so the test DB doesn't accumulate rows over many runs.
      Ecto.Adapters.SQL.Sandbox.checkout(TePhoenix.Repo, sandbox: false)
      Repo.query("DELETE FROM game_map_ops_log WHERE map_id = ?", [map_id])
      Repo.query("DELETE FROM game_maps WHERE id = ?", [map_id])
      Ecto.Adapters.SQL.Sandbox.checkin(TePhoenix.Repo)
    end)

    {:ok, map_id: map_id}
  end

  @concurrency 20

  @tag :concurrency
  test "N concurrent appends from same map produce unique contiguous seqs", %{map_id: m} do
    parent = self()

    tasks =
      for i <- 1..@concurrency do
        Task.async(fn ->
          # Each task gets its OWN connection from the pool — true concurrency
          # contending on the same game_maps row's SELECT FOR UPDATE.
          Ecto.Adapters.SQL.Sandbox.checkout(TePhoenix.Repo, sandbox: false)

          result =
            MapOps.append(
              m,
              "conc_#{i}_" <> Base.encode16(:crypto.strong_rand_bytes(4), case: :lower),
              "paint_tile",
              %{"layer" => "ground", "x" => i, "y" => 0, "id" => 5},
              user_id: rem(i, 4) + 1
            )

          send(parent, {:done, i})
          result
        end)
      end

    results = Task.await_many(tasks, 30_000)

    seqs =
      results
      |> Enum.map(fn {:ok, %{sequence: s}} -> s end)
      |> Enum.sort()

    # All unique
    assert length(Enum.uniq(seqs)) == @concurrency,
           "expected #{@concurrency} unique sequences, got #{length(Enum.uniq(seqs))}: #{inspect(seqs)}"

    # Contiguous starting at 1 (the map was fresh)
    assert seqs == Enum.to_list(1..@concurrency),
           "expected contiguous 1..#{@concurrency}, got #{inspect(seqs)}"

    # head_seq on game_maps should match the max
    {:ok, %{rows: [[head]]}} = Repo.query("SELECT head_seq FROM game_maps WHERE id = ?", [m])
    assert head == @concurrency
  end
end
