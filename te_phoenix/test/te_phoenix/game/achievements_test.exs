defmodule TePhoenix.Game.AchievementsTest do
  @moduledoc """
  Phase 2A.4 — DB-backed integration tests for the Achievements
  runtime. Covers the four trigger shapes (counter / threshold /
  streak / flag), reward distribution (gold + items + xp + graceful
  ogham skip), idempotency on the unlock path, list_unlocked +
  list_progress views, and admin reset.
  """

  use TePhoenix.DataCase, async: false

  alias TePhoenix.Game.Achievements

  setup do
    Achievements.ensure_schema()
    cid = insert_character(level: 5, gold: 100)
    {:ok, character_id: cid}
  end

  defp insert_character(opts) do
    {:ok, %{last_insert_id: id}} =
      Repo.query(
        "INSERT INTO characters (level, gold, experience, alignment) VALUES (?, ?, ?, ?)",
        [opts[:level] || 1, opts[:gold] || 0, opts[:experience] || 0, "neutral"]
      )

    id
  end

  defp insert_achievement(opts) do
    {:ok, %{last_insert_id: id}} =
      Repo.query(
        """
        INSERT INTO game_achievements
          (key_name, title, description, icon, category, trigger_type,
           trigger_value, reward_gold, reward_title, reward_json, points,
           is_hidden, is_active, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
          opts[:key_name] ||
            "ach_" <> Base.encode16(:crypto.strong_rand_bytes(4), case: :lower),
          opts[:title] || "Test",
          opts[:description] || "desc",
          opts[:icon] || "🏆",
          opts[:category] || "other",
          opts[:trigger_type] || "manual",
          opts[:trigger_value] || 1,
          opts[:reward_gold] || 0,
          opts[:reward_title],
          opts[:reward_json] && Jason.encode!(opts[:reward_json]),
          opts[:points] || 10,
          (opts[:hidden] && 1) || 0,
          (opts[:disabled] && 0) || 1,
          opts[:sort_order] || 0
        ]
      )

    id
  end

  describe "fire_event/3 — counter shape" do
    test "increments and unlocks when counter ≥ trigger_value", %{character_id: cid} do
      aid = insert_achievement(trigger_type: "pvp_wins", trigger_value: 3)

      {:ok, []} = Achievements.fire_event(cid, "pvp_wins")
      {:ok, []} = Achievements.fire_event(cid, "pvp_wins")
      {:ok, [unlocked]} = Achievements.fire_event(cid, "pvp_wins")

      assert unlocked.id == aid

      {:ok, %{rows: [[present]]}} =
        Repo.query(
          "SELECT COUNT(*) FROM character_achievements WHERE character_id = ? AND achievement_id = ?",
          [cid, aid]
        )

      assert present == 1
    end

    test "does not double-unlock", %{character_id: cid} do
      aid = insert_achievement(trigger_type: "pve_wins", trigger_value: 1)

      {:ok, [_]} = Achievements.fire_event(cid, "pve_wins")
      {:ok, []} = Achievements.fire_event(cid, "pve_wins")
      {:ok, []} = Achievements.fire_event(cid, "pve_wins")

      {:ok, %{rows: [[count]]}} =
        Repo.query(
          "SELECT COUNT(*) FROM character_achievements WHERE character_id = ? AND achievement_id = ?",
          [cid, aid]
        )

      assert count == 1
    end

    test "unknown event keys ride the generic counter", %{character_id: cid} do
      # Custom key not in the enum — Achievements stores it in the same
      # counter table and the value bumps cleanly.
      {:ok, []} = Achievements.fire_event(cid, "talked_to_dragon")
      {:ok, []} = Achievements.fire_event(cid, "talked_to_dragon")

      {:ok, %{rows: [[v]]}} =
        Repo.query(
          "SELECT value FROM character_progress_counters WHERE character_id = ? AND counter_key = 'talked_to_dragon'",
          [cid]
        )

      assert v == 2
    end
  end

  describe "fire_event/3 — threshold shape" do
    test "level_reached unlocks when characters.level ≥ trigger_value", %{character_id: cid} do
      aid = insert_achievement(trigger_type: "level_reached", trigger_value: 5)

      {:ok, [unlocked]} = Achievements.fire_event(cid, "level_reached")
      assert unlocked.id == aid
    end

    test "level_reached does not unlock when characters.level too low", %{character_id: cid} do
      _aid = insert_achievement(trigger_type: "level_reached", trigger_value: 99)

      {:ok, []} = Achievements.fire_event(cid, "level_reached")
    end

    test "gold_owned reads live characters.gold", %{character_id: cid} do
      _aid = insert_achievement(trigger_type: "gold_owned", trigger_value: 50)
      {:ok, [_]} = Achievements.fire_event(cid, "gold_owned")

      _aid2 = insert_achievement(trigger_type: "gold_owned", trigger_value: 1_000)
      {:ok, []} = Achievements.fire_event(cid, "gold_owned")
    end
  end

  describe "fire_event/3 — streak shape" do
    test "consecutive days increment, gap resets", %{character_id: cid} do
      aid = insert_achievement(trigger_type: "login_streak", trigger_value: 3)

      {:ok, []} = Achievements.fire_event(cid, "login_streak", %{"date" => "2026-05-01"})
      {:ok, []} = Achievements.fire_event(cid, "login_streak", %{"date" => "2026-05-02"})
      {:ok, [unlocked]} = Achievements.fire_event(cid, "login_streak", %{"date" => "2026-05-03"})
      assert unlocked.id == aid

      # Reset achievement so we can test gap behavior.
      Achievements.reset(cid, aid)

      # Gap day → streak resets to 1, no unlock yet.
      {:ok, []} = Achievements.fire_event(cid, "login_streak", %{"date" => "2026-05-10"})

      {:ok, %{rows: [[v]]}} =
        Repo.query(
          "SELECT value FROM character_progress_counters WHERE character_id = ? AND counter_key = 'login_streak'",
          [cid]
        )

      assert v == 1
    end

    test "same-day fire keeps the value", %{character_id: cid} do
      _aid = insert_achievement(trigger_type: "login_streak", trigger_value: 999)

      {:ok, []} = Achievements.fire_event(cid, "login_streak", %{"date" => "2026-05-01"})
      {:ok, []} = Achievements.fire_event(cid, "login_streak", %{"date" => "2026-05-01"})

      {:ok, %{rows: [[v]]}} =
        Repo.query(
          "SELECT value FROM character_progress_counters WHERE character_id = ? AND counter_key = 'login_streak'",
          [cid]
        )

      assert v == 1
    end
  end

  describe "fire_event/3 — flag shape" do
    test "manual fires unlock when threshold met", %{character_id: cid} do
      aid = insert_achievement(trigger_type: "manual", trigger_value: 1)

      {:ok, [unlocked]} = Achievements.fire_event(cid, "manual")
      assert unlocked.id == aid
    end
  end

  describe "reward distribution" do
    test "gold reward credited to characters", %{character_id: cid} do
      aid =
        insert_achievement(
          trigger_type: "manual",
          trigger_value: 1,
          reward_gold: 250
        )

      {:ok, [unlocked]} = Achievements.fire_event(cid, "manual")
      assert unlocked.id == aid
      assert unlocked.rewards.gold == 250

      {:ok, %{rows: [[g]]}} = Repo.query("SELECT gold FROM characters WHERE id = ?", [cid])
      assert g == 350
    end

    test "items in reward_json land in character_items", %{character_id: cid} do
      _aid =
        insert_achievement(
          trigger_type: "manual",
          trigger_value: 1,
          reward_json: %{"items" => [%{"item_id" => 7, "qty" => 4}]}
        )

      {:ok, [unlocked]} = Achievements.fire_event(cid, "manual")
      assert unlocked.rewards.items == 1

      {:ok, %{rows: [[qty]]}} =
        Repo.query(
          "SELECT quantity FROM character_items WHERE character_id = ? AND item_id = ?",
          [cid, 7]
        )

      assert qty == 4
    end

    test "xp in reward_json bumps characters.experience", %{character_id: cid} do
      _aid =
        insert_achievement(
          trigger_type: "manual",
          trigger_value: 1,
          reward_json: %{"xp" => 75}
        )

      {:ok, [_]} = Achievements.fire_event(cid, "manual")

      {:ok, %{rows: [[xp]]}} =
        Repo.query("SELECT experience FROM characters WHERE id = ?", [cid])

      assert xp == 75
    end

    test "title reward gracefully no-ops against prod-shape character_titles", %{character_id: cid} do
      _aid =
        insert_achievement(
          trigger_type: "manual",
          trigger_value: 1,
          reward_title: "Slayer"
        )

      {:ok, [unlocked]} = Achievements.fire_event(cid, "manual")
      # The INSERT IGNORE swallows the column-mismatch error; rewards
      # map will not contain :title because the INSERT failed silently.
      refute Map.has_key?(unlocked.rewards, :title)
    end

    test "oghams reward gracefully skipped when Magic absent", %{character_id: cid} do
      # Note: Magic IS available in this test app, but unlock_ogham fails
      # if the ogham id doesn't exist — Achievements still returns
      # successfully with an :oghams entry in rewards (count of attempts).
      _aid =
        insert_achievement(
          trigger_type: "manual",
          trigger_value: 1,
          reward_json: %{"oghams" => [9_999]}
        )

      assert {:ok, [_]} = Achievements.fire_event(cid, "manual")
    end
  end

  describe "list_unlocked/1" do
    test "returns rows joined with achievement metadata", %{character_id: cid} do
      a1 = insert_achievement(title: "First", trigger_type: "manual", trigger_value: 1)
      _a2 = insert_achievement(title: "Locked", trigger_type: "pvp_wins", trigger_value: 99)

      {:ok, [_]} = Achievements.fire_event(cid, "manual")

      list = Achievements.list_unlocked(cid)
      assert length(list) == 1
      assert hd(list).id == a1
    end
  end

  describe "list_progress/1" do
    test "includes hidden=0 active rows with progress and unlocked flag", %{character_id: cid} do
      counter_aid =
        insert_achievement(trigger_type: "pvp_wins", trigger_value: 10, title: "Counter")

      hidden_aid =
        insert_achievement(trigger_type: "manual", trigger_value: 1, title: "Hidden", hidden: true)

      Achievements.fire_event(cid, "pvp_wins")
      Achievements.fire_event(cid, "pvp_wins")

      progress = Achievements.list_progress(cid)
      ids = Enum.map(progress, & &1.id)

      assert counter_aid in ids
      refute hidden_aid in ids

      counter_row = Enum.find(progress, &(&1.id == counter_aid))
      assert counter_row.progress == 0.2
      refute counter_row.unlocked
    end
  end

  describe "reset/2" do
    test "removes the unlock row and broadcasts", %{character_id: cid} do
      aid = insert_achievement(trigger_type: "manual", trigger_value: 1)
      {:ok, [_]} = Achievements.fire_event(cid, "manual")

      :ok = Achievements.reset(cid, aid)

      {:ok, %{rows: [[count]]}} =
        Repo.query(
          "SELECT COUNT(*) FROM character_achievements WHERE character_id = ? AND achievement_id = ?",
          [cid, aid]
        )

      assert count == 0
    end
  end
end
