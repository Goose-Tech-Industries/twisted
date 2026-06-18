defmodule TePhoenix.Game.MagicTest do
  @moduledoc """
  Phase 2A.5 — DB-backed integration tests for the Magic runtime.
  Covers ogham unlock + idempotency, spell learn + level gate, the
  atomic cast pipeline (ogham gate, anam consume, cooldown set), and
  anam regen.

  Cast tests bypass `unlock_ogham/2` and INSERT character_oghams rows
  directly so a single character can hold multiple oghams (the
  production unique key on `character_oghams` is `(char, item, slot)`
  — multi-ogham unlock via that legacy slot system is out of scope
  for this 2A pass).
  """

  use TePhoenix.DataCase, async: false

  alias TePhoenix.Game.Magic

  setup do
    cid = insert_character(level: 10, anam_current: 100, anam_max: 100, anam_regen: 1)

    beith = insert_ogham(name: "Beith", icon: "ᚁ")
    luis = insert_ogham(name: "Luis", icon: "ᚂ")
    fearn = insert_ogham(name: "Fearn", icon: "ᚃ")

    {:ok, character_id: cid, beith: beith, luis: luis, fearn: fearn}
  end

  defp insert_character(opts) do
    {:ok, %{last_insert_id: id}} =
      Repo.query(
        """
        INSERT INTO characters
          (level, gold, experience, alignment, anam_current, anam_max, anam_regen_per_sec,
           current_hp, max_hp)
        VALUES (?, 0, 0, 'neutral', ?, ?, ?, 100, 100)
        """,
        [
          opts[:level] || 1,
          opts[:anam_current] || 100,
          opts[:anam_max] || 100,
          opts[:anam_regen] || 1
        ]
      )

    id
  end

  defp insert_ogham(opts) do
    {:ok, %{last_insert_id: id}} =
      Repo.query(
        "INSERT INTO game_oghams (name, icon, description, `rank`) VALUES (?, ?, ?, ?)",
        [opts[:name], opts[:icon] || "?", opts[:description] || "", opts[:rank] || 1]
      )

    id
  end

  defp insert_spell(opts) do
    {:ok, %{last_insert_id: id}} =
      Repo.query(
        """
        INSERT INTO game_spells
          (`key`, name, description, icon, ogham_pattern_json, anam_cost,
           cast_time_ms, cooldown_ms, effect_json, spell_school, min_level,
           is_combat_spell, is_utility_spell, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
          opts[:key] || "spell_" <> Base.encode16(:crypto.strong_rand_bytes(4), case: :lower),
          opts[:name] || "Test Spell",
          opts[:description] || "",
          opts[:icon] || "✨",
          Jason.encode!(opts[:pattern] || []),
          opts[:anam_cost] || 10,
          opts[:cast_time_ms] || 1000,
          opts[:cooldown_ms] || 0,
          Jason.encode!(opts[:effect] || %{}),
          opts[:school] || "arcane",
          opts[:min_level] || 1,
          (opts[:utility_only] && 0) || 1,
          (opts[:utility_only] && 1) || 0,
          (opts[:disabled] && 0) || 1
        ]
      )

    id
  end

  defp seed_known_ogham(cid, ogham_id, slot) do
    Repo.query(
      """
      INSERT INTO character_oghams
        (character_id, item_id, slot_index, ogham_id, current_rank,
         kill_count, corruption_points, source, unlocked_at)
      VALUES (?, 0, ?, ?, 1, 0, 0, 'test', NOW())
      """,
      [cid, slot, ogham_id]
    )
  end

  describe "unlock_ogham/2,3" do
    test "first call inserts, second is idempotent", ctx do
      assert {:ok, :unlocked} = Magic.unlock_ogham(ctx.character_id, ctx.beith)
      assert {:ok, :already_known} = Magic.unlock_ogham(ctx.character_id, ctx.beith)
    end

    test "resolves by name (case insensitive)", ctx do
      assert {:ok, :unlocked} = Magic.unlock_ogham(ctx.character_id, "BEITH")

      {:ok, %{rows: [[id]]}} =
        Repo.query(
          "SELECT ogham_id FROM character_oghams WHERE character_id = ?",
          [ctx.character_id]
        )

      assert id == ctx.beith
    end

    test "unknown name → unknown_ogham", ctx do
      assert {:error, :unknown_ogham} =
               Magic.unlock_ogham(ctx.character_id, "Nonexistent Rune")
    end

    test "default arity-2 routes through arity-3 with source='reward'", ctx do
      Magic.unlock_ogham(ctx.character_id, ctx.beith)

      {:ok, %{rows: [[src]]}} =
        Repo.query(
          "SELECT source FROM character_oghams WHERE character_id = ? AND ogham_id = ?",
          [ctx.character_id, ctx.beith]
        )

      assert src == "reward"
    end
  end

  describe "list_oghams/1" do
    test "returns rows joined with the catalogue", ctx do
      seed_known_ogham(ctx.character_id, ctx.beith, 0)
      seed_known_ogham(ctx.character_id, ctx.luis, 1)

      list = Magic.list_oghams(ctx.character_id)
      ids = list |> Enum.map(& &1.id) |> Enum.sort()
      assert ids == Enum.sort([ctx.beith, ctx.luis])
    end
  end

  describe "learn_spell/2" do
    test "first call learns, second is idempotent", ctx do
      sid = insert_spell(key: "fire_lance", min_level: 1)

      assert {:ok, :learned} = Magic.learn_spell(ctx.character_id, "fire_lance")
      assert {:ok, :already_known} = Magic.learn_spell(ctx.character_id, "fire_lance")

      {:ok, %{rows: [[count]]}} =
        Repo.query(
          "SELECT COUNT(*) FROM character_known_spells WHERE character_id = ? AND spell_id = ?",
          [ctx.character_id, sid]
        )

      assert count == 1
    end

    test "rejects when level too low", ctx do
      _sid = insert_spell(key: "high_arcana", min_level: 99)
      assert {:error, :level_too_low} = Magic.learn_spell(ctx.character_id, "high_arcana")
    end

    test "unknown spell key → unknown_spell", ctx do
      assert {:error, :unknown_spell} = Magic.learn_spell(ctx.character_id, "no_such_spell")
    end
  end

  describe "cast/3 — ogham gate" do
    test "rejects with missing_oghams when pattern includes unowned ogham", ctx do
      _sid =
        insert_spell(
          key: "fire_lance",
          pattern: ["beith", "luis"],
          anam_cost: 5,
          effect: %{"damage" => %{"amount" => 10}}
        )

      Magic.learn_spell(ctx.character_id, "fire_lance")
      seed_known_ogham(ctx.character_id, ctx.beith, 0)
      # Did NOT seed luis

      assert {:error, {:missing_oghams, missing}} =
               Magic.cast(ctx.character_id, "fire_lance")

      assert "luis" in missing
    end

    test "succeeds when every ogham unlocked, consumes anam, returns remaining", ctx do
      _sid =
        insert_spell(
          key: "fire_lance",
          pattern: ["beith", "luis"],
          anam_cost: 25,
          effect: %{"damage" => %{"amount" => 10}}
        )

      Magic.learn_spell(ctx.character_id, "fire_lance")
      seed_known_ogham(ctx.character_id, ctx.beith, 0)
      seed_known_ogham(ctx.character_id, ctx.luis, 1)

      assert {:ok, result} = Magic.cast(ctx.character_id, "fire_lance")
      assert result.anam_remaining == 75
      assert result.spell.key == "fire_lance"

      {:ok, %{rows: [[cur]]}} =
        Repo.query("SELECT anam_current FROM characters WHERE id = ?", [ctx.character_id])

      assert cur == 75
    end
  end

  describe "cast/3 — anam gate" do
    test "rejects with insufficient_anam when below cost", ctx do
      drain_to(ctx.character_id, 5)

      _sid =
        insert_spell(
          key: "expensive",
          pattern: [],
          anam_cost: 50,
          effect: %{"damage" => %{"amount" => 1}}
        )

      Magic.learn_spell(ctx.character_id, "expensive")

      assert {:error, :insufficient_anam} = Magic.cast(ctx.character_id, "expensive")

      # Anam unchanged on failed cast (transaction rolled back)
      {:ok, %{rows: [[cur]]}} =
        Repo.query("SELECT anam_current FROM characters WHERE id = ?", [ctx.character_id])

      assert cur == 5
    end
  end

  describe "cast/3 — cooldown gate" do
    test "subsequent cast within cooldown returns on_cooldown_lost_race", ctx do
      _sid =
        insert_spell(
          key: "cd_spell",
          pattern: [],
          anam_cost: 5,
          cooldown_ms: 60_000,
          effect: %{"damage" => %{"amount" => 1}}
        )

      Magic.learn_spell(ctx.character_id, "cd_spell")

      assert {:ok, _} = Magic.cast(ctx.character_id, "cd_spell")
      # Second call hits the active cooldown row
      assert {:error, :on_cooldown_lost_race} = Magic.cast(ctx.character_id, "cd_spell")
    end

    test "reset_cooldowns/1 clears the cooldown row", ctx do
      _sid =
        insert_spell(
          key: "cd_spell",
          pattern: [],
          anam_cost: 5,
          cooldown_ms: 60_000,
          effect: %{"damage" => %{"amount" => 1}}
        )

      Magic.learn_spell(ctx.character_id, "cd_spell")
      Magic.cast(ctx.character_id, "cd_spell")

      :ok = Magic.reset_cooldowns(ctx.character_id)

      assert {:ok, _} = Magic.cast(ctx.character_id, "cd_spell")
    end
  end

  describe "cast/3 — known-spell gate" do
    test "rejects when the character hasn't learned the spell", ctx do
      _sid =
        insert_spell(
          key: "unlearned",
          pattern: [],
          anam_cost: 5,
          effect: %{}
        )

      assert {:error, :not_known_to_character} = Magic.cast(ctx.character_id, "unlearned")
    end
  end

  describe "regen_anam/2" do
    test "regen scales with seconds, caps at anam_max", ctx do
      drain_to(ctx.character_id, 50)
      assert {60, 100} = Magic.regen_anam(ctx.character_id, 10)
      assert {100, 100} = Magic.regen_anam(ctx.character_id, 999)
    end
  end

  describe "list_castable_now/1" do
    test "filters out spells where pattern not satisfied or anam too low", ctx do
      easy = insert_spell(key: "easy", pattern: ["beith"], anam_cost: 5, effect: %{})

      hard =
        insert_spell(key: "hard", pattern: ["beith", "luis", "fearn"], anam_cost: 5, effect: %{})

      Magic.learn_spell(ctx.character_id, "easy")
      Magic.learn_spell(ctx.character_id, "hard")
      seed_known_ogham(ctx.character_id, ctx.beith, 0)

      keys = Magic.list_castable_now(ctx.character_id) |> Enum.map(& &1.key)
      assert "easy" in keys
      refute "hard" in keys

      _ = easy
      _ = hard
    end
  end

  defp drain_to(cid, target) do
    Repo.query("UPDATE characters SET anam_current = ? WHERE id = ?", [target, cid])
  end
end
