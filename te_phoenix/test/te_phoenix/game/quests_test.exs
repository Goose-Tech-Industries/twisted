defmodule TePhoenix.Game.QuestsTest do
  @moduledoc """
  Phase 1.5a (deferred follow-up) — DB-backed integration tests for the
  Quests runtime module. Covers start/advance/complete lifecycle, prereq
  gates, and reward distribution. Uses the 2B.1 sandbox + DataCase.
  """

  use TePhoenix.DataCase, async: false

  alias TePhoenix.Game.Quests

  setup do
    cid = insert_character(level: 5, gold: 100, experience: 0)
    qid = insert_quest_def(level_required: 0, stages: 3, rewards: %{"xp" => 50, "gold" => 25})
    {:ok, character_id: cid, quest_id: qid}
  end

  defp insert_character(opts) do
    {:ok, %{last_insert_id: id}} =
      Repo.query(
        "INSERT INTO characters (level, gold, experience, alignment) VALUES (?, ?, ?, ?)",
        [opts[:level] || 1, opts[:gold] || 0, opts[:experience] || 0, opts[:alignment] || "neutral"]
      )

    id
  end

  defp insert_quest_def(opts) do
    stages = List.duplicate(%{}, opts[:stages] || 1)

    {:ok, %{last_insert_id: id}} =
      Repo.query(
        """
        INSERT INTO game_quest_defs
          (`key`, name, level_required, repeatable, enabled, stages_json, rewards_json, prerequisites_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
          "test_q_" <> Base.encode16(:crypto.strong_rand_bytes(4), case: :lower),
          opts[:name] || "Test Quest",
          opts[:level_required] || 0,
          (opts[:repeatable] && 1) || 0,
          (opts[:disabled] && 0) || 1,
          Jason.encode!(stages),
          Jason.encode!(opts[:rewards] || %{}),
          Jason.encode!(opts[:prereqs] || [])
        ]
      )

    id
  end

  describe "start/3" do
    test "inserts progress row at step 0", %{character_id: cid, quest_id: qid} do
      {:ok, progress} = Quests.start(cid, qid)

      assert progress.step == 0
      assert progress.completed == false

      assert {:ok, %{rows: [[step, completed]]}} =
               Repo.query("SELECT step, completed FROM game_quest_progress WHERE char_id = ? AND quest_id = ?", [cid, qid])

      assert step == 0
      assert completed == 0
    end

    test "rejects when level too low", %{character_id: cid} do
      qid = insert_quest_def(level_required: 99, stages: 1)
      assert {:error, :level_too_low} = Quests.start(cid, qid)
    end

    test "rejects when prereq quest not completed", %{character_id: cid} do
      gate = insert_quest_def(stages: 1)
      target = insert_quest_def(stages: 1, prereqs: [%{"type" => "completed", "quest_id" => gate}])

      assert {:error, :prerequisites_unmet} = Quests.start(cid, target)

      {:ok, _} = Quests.start(cid, gate)
      {:ok, _} = Quests.complete(cid, gate)

      assert {:ok, _} = Quests.start(cid, target)
    end

    test "rejects when quest disabled", %{character_id: cid} do
      qid = insert_quest_def(stages: 1, disabled: true)
      assert {:error, :quest_disabled} = Quests.start(cid, qid)
    end

    test "skip_prerequisites: true bypasses gates", %{character_id: cid} do
      qid = insert_quest_def(level_required: 999, stages: 1)
      assert {:ok, _} = Quests.start(cid, qid, skip_prerequisites: true)
    end
  end

  describe "advance/4" do
    test "bumps step", %{character_id: cid, quest_id: qid} do
      {:ok, _} = Quests.start(cid, qid)
      {:ok, progress} = Quests.advance(cid, qid)
      assert progress.step == 1
    end

    test "auto-completes when step reaches stage count + distributes rewards", %{character_id: cid, quest_id: qid} do
      {:ok, _} = Quests.start(cid, qid)

      # 3 stages, 3 advances
      {:ok, _} = Quests.advance(cid, qid)
      {:ok, _} = Quests.advance(cid, qid)
      {:ok, completed} = Quests.advance(cid, qid)

      assert completed.completed == true

      # Rewards distributed: xp 50, gold 25
      {:ok, %{rows: [[xp, gold]]}} =
        Repo.query("SELECT experience, gold FROM characters WHERE id = ?", [cid])

      assert xp == 50
      assert gold == 125
    end

    test "delta > 1 advances multiple steps", %{character_id: cid, quest_id: qid} do
      {:ok, _} = Quests.start(cid, qid)
      {:ok, progress} = Quests.advance(cid, qid, nil, 2)
      assert progress.step == 2
    end
  end

  describe "complete/2" do
    test "second call is idempotent (no double rewards)", %{character_id: cid, quest_id: qid} do
      {:ok, _} = Quests.start(cid, qid)
      {:ok, _} = Quests.complete(cid, qid)
      {:ok, %{rows: [[gold_after_first]]}} =
        Repo.query("SELECT gold FROM characters WHERE id = ?", [cid])

      {:ok, _} = Quests.complete(cid, qid)
      {:ok, %{rows: [[gold_after_second]]}} =
        Repo.query("SELECT gold FROM characters WHERE id = ?", [cid])

      assert gold_after_first == gold_after_second
    end
  end

  describe "list_active/1 + list_completed/1" do
    test "active excludes completed, completed excludes active", %{character_id: cid, quest_id: qid} do
      qid2 = insert_quest_def(stages: 1)
      {:ok, _} = Quests.start(cid, qid)
      {:ok, _} = Quests.start(cid, qid2)
      {:ok, _} = Quests.complete(cid, qid2)

      active = Quests.list_active(cid)
      completed = Quests.list_completed(cid)

      assert Enum.any?(active, &(&1.quest_id == qid))
      refute Enum.any?(active, &(&1.quest_id == qid2))
      assert Enum.any?(completed, &(&1.quest_id == qid2))
      refute Enum.any?(completed, &(&1.quest_id == qid))
    end
  end

  describe "evaluate_prerequisites/2" do
    test "true when prereqs met, false otherwise", %{character_id: cid} do
      easy = insert_quest_def(level_required: 1, stages: 1)
      hard = insert_quest_def(level_required: 99, stages: 1)

      assert Quests.evaluate_prerequisites(cid, easy)
      refute Quests.evaluate_prerequisites(cid, hard)
    end
  end

  describe "reward distribution" do
    test "items reward inserts character_items rows", %{character_id: cid} do
      qid =
        insert_quest_def(stages: 1, rewards: %{"items" => [%{"item_id" => 42, "qty" => 3}]})

      {:ok, _} = Quests.start(cid, qid)
      {:ok, _} = Quests.complete(cid, qid)

      {:ok, %{rows: [[qty]]}} =
        Repo.query(
          "SELECT quantity FROM character_items WHERE character_id = ? AND item_id = ?",
          [cid, 42]
        )

      assert qty == 3
    end

    test "faction_rep reward upserts game_faction_rep", %{character_id: cid} do
      qid =
        insert_quest_def(stages: 1, rewards: %{"faction_rep" => %{"druids" => 10}})

      {:ok, _} = Quests.start(cid, qid)
      {:ok, _} = Quests.complete(cid, qid)

      {:ok, %{rows: [[v]]}} =
        Repo.query(
          "SELECT value FROM game_faction_rep WHERE char_id = ? AND faction = ?",
          [cid, "druids"]
        )

      assert v == 10
    end

    test "oghams reward gracefully skipped (Magic STUB)", %{character_id: cid} do
      qid =
        insert_quest_def(stages: 1, rewards: %{"oghams" => [1, 2, 3]})

      # Should not raise; logs warning + returns ok
      {:ok, _} = Quests.start(cid, qid)
      {:ok, _} = Quests.complete(cid, qid)
    end
  end
end
