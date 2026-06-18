defmodule TePhoenix.Game.CraftingTest do
  @moduledoc """
  Phase 2A.3 — DB-backed integration tests for the Crafting runtime
  module. Covers the full craft pipeline (validate → consume → output
  → award xp), learn lifecycle, list_known/list_available views,
  prerequisite gates, and the atomic race-protection guard.
  """

  use TePhoenix.DataCase, async: false

  alias TePhoenix.Game.Crafting

  setup do
    cid = insert_character(level: 10)
    iron = insert_item(name: "Iron Ore")
    coal = insert_item(name: "Coal")
    sword = insert_item(name: "Iron Sword")

    rid =
      insert_recipe(
        name: "Forge Iron Sword",
        result_item_id: sword,
        result_qty: 1,
        level_req: 1,
        skill_req: "smithing",
        ingredients: [%{"item_id" => iron, "qty" => 2}, %{"item_id" => coal, "qty" => 1}]
      )

    {:ok,
     character_id: cid,
     recipe_id: rid,
     iron: iron,
     coal: coal,
     sword: sword}
  end

  defp insert_character(opts) do
    {:ok, %{last_insert_id: id}} =
      Repo.query(
        "INSERT INTO characters (level, gold, experience, alignment) VALUES (?, ?, ?, ?)",
        [opts[:level] || 1, opts[:gold] || 0, opts[:experience] || 0, "neutral"]
      )

    id
  end

  defp insert_item(opts) do
    {:ok, %{last_insert_id: id}} =
      Repo.query(
        "INSERT INTO game_items (name, type, icon) VALUES (?, ?, ?)",
        [opts[:name] || "Item", opts[:type] || "MISC", opts[:icon] || "?"]
      )

    id
  end

  defp insert_recipe(opts) do
    {:ok, %{last_insert_id: id}} =
      Repo.query(
        """
        INSERT INTO game_craft_recipes
          (name, category, result_item_id, result_qty, level_req, skill_req,
           ingredients_json, unlock_mode, description, icon, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
          opts[:name] || "Recipe",
          opts[:category] || "MISC",
          opts[:result_item_id],
          opts[:result_qty] || 1,
          opts[:level_req] || 1,
          opts[:skill_req],
          Jason.encode!(opts[:ingredients] || []),
          opts[:unlock_mode] || "ALWAYS",
          opts[:description],
          opts[:icon] || "?",
          (opts[:disabled] && 0) || 1
        ]
      )

    id
  end

  defp grant_items(cid, item_id, qty) do
    Repo.query(
      """
      INSERT INTO character_items (character_id, item_id, quantity)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)
      """,
      [cid, item_id, qty]
    )
  end

  defp inventory_qty(cid, item_id) do
    case Repo.query(
           "SELECT quantity FROM character_items WHERE character_id = ? AND item_id = ?",
           [cid, item_id]
         ) do
      {:ok, %{rows: [[q]]}} -> q
      _ -> 0
    end
  end

  describe "craft/3" do
    test "consumes ingredients, creates output, broadcasts", ctx do
      grant_items(ctx.character_id, ctx.iron, 5)
      grant_items(ctx.character_id, ctx.coal, 3)

      assert {:ok, output} = Crafting.craft(ctx.character_id, ctx.recipe_id)
      assert output.recipe_id == ctx.recipe_id
      assert output.output_item_id == ctx.sword
      assert output.qty == 1
      assert output.skill_xp_awarded > 0

      assert inventory_qty(ctx.character_id, ctx.iron) == 3
      assert inventory_qty(ctx.character_id, ctx.coal) == 2
      assert inventory_qty(ctx.character_id, ctx.sword) == 1
    end

    test "rejects when ingredients insufficient", ctx do
      grant_items(ctx.character_id, ctx.iron, 1)
      grant_items(ctx.character_id, ctx.coal, 0)

      assert {:error, {:missing_ingredients, missing}} =
               Crafting.craft(ctx.character_id, ctx.recipe_id)

      ids = Enum.map(missing, & &1.item_id) |> Enum.sort()
      assert ids == Enum.sort([ctx.iron, ctx.coal])

      # No partial consumption
      assert inventory_qty(ctx.character_id, ctx.iron) == 1
      assert inventory_qty(ctx.character_id, ctx.sword) == 0
    end

    test "rejects when level too low", ctx do
      hard =
        insert_recipe(
          result_item_id: ctx.sword,
          level_req: 99,
          ingredients: [%{"item_id" => ctx.iron, "qty" => 1}]
        )

      grant_items(ctx.character_id, ctx.iron, 5)
      assert {:error, :level_too_low} = Crafting.craft(ctx.character_id, hard)
    end

    test "rejects LEARNED recipe when not learned, accepts after learn/2", ctx do
      learned_only =
        insert_recipe(
          result_item_id: ctx.sword,
          unlock_mode: "LEARNED",
          ingredients: [%{"item_id" => ctx.iron, "qty" => 1}]
        )

      grant_items(ctx.character_id, ctx.iron, 5)

      assert {:error, :recipe_not_learned} =
               Crafting.craft(ctx.character_id, learned_only)

      assert {:ok, :learned} = Crafting.learn(ctx.character_id, learned_only)
      assert {:ok, _} = Crafting.craft(ctx.character_id, learned_only)
    end

    test "skip_prerequisites bypasses level + LEARNED gates", ctx do
      gated =
        insert_recipe(
          result_item_id: ctx.sword,
          level_req: 99,
          unlock_mode: "LEARNED",
          ingredients: [%{"item_id" => ctx.iron, "qty" => 1}]
        )

      grant_items(ctx.character_id, ctx.iron, 5)

      assert {:ok, _} =
               Crafting.craft(ctx.character_id, gated, skip_prerequisites: true)
    end

    test "qty multiplier consumes proportionally and outputs proportionally", ctx do
      grant_items(ctx.character_id, ctx.iron, 10)
      grant_items(ctx.character_id, ctx.coal, 10)

      assert {:ok, output} = Crafting.craft(ctx.character_id, ctx.recipe_id, qty: 3)
      assert output.qty == 3
      assert inventory_qty(ctx.character_id, ctx.iron) == 4
      assert inventory_qty(ctx.character_id, ctx.coal) == 7
      assert inventory_qty(ctx.character_id, ctx.sword) == 3
    end

    test "race-condition: concurrent craft cannot double-consume the last ingredient", ctx do
      # Exactly enough for one craft
      grant_items(ctx.character_id, ctx.iron, 2)
      grant_items(ctx.character_id, ctx.coal, 1)

      parent = self()

      tasks =
        for _ <- 1..10 do
          Task.async(fn ->
            Ecto.Adapters.SQL.Sandbox.allow(TePhoenix.Repo, parent, self())
            Crafting.craft(ctx.character_id, ctx.recipe_id)
          end)
        end

      results = Task.await_many(tasks, 5000)

      successes = Enum.count(results, &match?({:ok, _}, &1))
      assert successes == 1, "exactly one craft should win the race, got #{successes}"

      # Inventory must equal one sword, no negative consumables
      assert inventory_qty(ctx.character_id, ctx.sword) == 1
      assert inventory_qty(ctx.character_id, ctx.iron) == 0
      assert inventory_qty(ctx.character_id, ctx.coal) == 0
    end

    test "unknown recipe id is rejected", ctx do
      assert {:error, :recipe_not_found} = Crafting.craft(ctx.character_id, 999_999)
    end

    test "disabled recipe is rejected", ctx do
      disabled =
        insert_recipe(
          result_item_id: ctx.sword,
          ingredients: [%{"item_id" => ctx.iron, "qty" => 1}],
          disabled: true
        )

      grant_items(ctx.character_id, ctx.iron, 5)
      assert {:error, :recipe_disabled} = Crafting.craft(ctx.character_id, disabled)
    end
  end

  describe "learn/2" do
    test "first call inserts, second is idempotent", ctx do
      assert {:ok, :learned} = Crafting.learn(ctx.character_id, ctx.recipe_id)
      assert {:ok, :already_known} = Crafting.learn(ctx.character_id, ctx.recipe_id)
    end

    test "learn rejects when level too low", ctx do
      hard =
        insert_recipe(
          result_item_id: ctx.sword,
          level_req: 99,
          ingredients: []
        )

      assert {:error, :level_too_low} = Crafting.learn(ctx.character_id, hard)
    end
  end

  describe "list_known/1" do
    test "returns only learned recipes", ctx do
      other =
        insert_recipe(
          result_item_id: ctx.sword,
          ingredients: [%{"item_id" => ctx.iron, "qty" => 1}]
        )

      assert Crafting.list_known(ctx.character_id) == []

      Crafting.learn(ctx.character_id, ctx.recipe_id)
      ids = Crafting.list_known(ctx.character_id) |> Enum.map(& &1.id)

      assert ids == [ctx.recipe_id]
      refute other in ids
    end
  end

  describe "list_available/2" do
    test "filters by level and ingredient sufficiency", ctx do
      grant_items(ctx.character_id, ctx.iron, 5)
      grant_items(ctx.character_id, ctx.coal, 5)

      _too_high =
        insert_recipe(
          name: "Master Plate",
          result_item_id: ctx.sword,
          level_req: 99,
          ingredients: [%{"item_id" => ctx.iron, "qty" => 1}]
        )

      ids = Crafting.list_available(ctx.character_id) |> Enum.map(& &1.id)

      assert ctx.recipe_id in ids
    end

    test "missing ingredients excludes recipe", ctx do
      ids = Crafting.list_available(ctx.character_id) |> Enum.map(& &1.id)
      refute ctx.recipe_id in ids
    end
  end

  describe "validate_ingredients/2" do
    test "ok when enough", ctx do
      grant_items(ctx.character_id, ctx.iron, 5)
      grant_items(ctx.character_id, ctx.coal, 5)

      assert {:ok, []} = Crafting.validate_ingredients(ctx.character_id, ctx.recipe_id)
    end

    test "missing list when short", ctx do
      grant_items(ctx.character_id, ctx.iron, 1)
      assert {:error, {:missing, missing}} =
               Crafting.validate_ingredients(ctx.character_id, ctx.recipe_id)

      assert Enum.any?(missing, &(&1.item_id == ctx.iron and &1.have == 1 and &1.need == 2))
      assert Enum.any?(missing, &(&1.item_id == ctx.coal and &1.have == 0))
    end
  end

  describe "evaluate_prerequisites/2" do
    test "true when prereqs met, false otherwise", ctx do
      assert Crafting.evaluate_prerequisites(ctx.character_id, ctx.recipe_id)

      hard =
        insert_recipe(
          result_item_id: ctx.sword,
          level_req: 99,
          ingredients: []
        )

      refute Crafting.evaluate_prerequisites(ctx.character_id, hard)
    end
  end

  describe "skill xp award" do
    test "gathering row updated when craft succeeds", ctx do
      grant_items(ctx.character_id, ctx.iron, 5)
      grant_items(ctx.character_id, ctx.coal, 5)

      {:ok, %{skill_xp_awarded: xp}} = Crafting.craft(ctx.character_id, ctx.recipe_id)
      assert xp > 0

      {:ok, %{rows: [[total_xp]]}} =
        Repo.query(
          "SELECT CAST(SUM(xp) AS SIGNED) FROM character_gathering_levels WHERE character_id = ?",
          [ctx.character_id]
        )

      assert total_xp == xp
    end

    test "no skill_req → no xp awarded, craft still succeeds", ctx do
      no_skill =
        insert_recipe(
          name: "Skill-less recipe",
          result_item_id: ctx.sword,
          ingredients: [%{"item_id" => ctx.iron, "qty" => 1}]
        )

      grant_items(ctx.character_id, ctx.iron, 5)

      {:ok, %{skill_xp_awarded: xp}} = Crafting.craft(ctx.character_id, no_skill)
      assert xp == 0
    end
  end
end
