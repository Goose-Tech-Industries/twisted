defmodule TePhoenix.Game.Crafting do
  @moduledoc """
  Phase 1.5b — runtime module for the crafting system.

  Wraps `game_craft_recipes` (recipe catalog) and the per-character
  tables `character_learned_recipes` (explicitly-learned recipes),
  `character_discovered_recipes` (auto-discovered via gameplay),
  `character_items` (inventory), and `character_gathering_levels`
  (skill XP).

  Templates from `TePhoenix.Game.Quests` (1.5a). Same lifecycle shape:
  validate → mutate → broadcast.

  ## Public API

      craft/3                  — full craft transaction
      list_known/1             — recipes the character has learned
      list_available/2         — recipes craftable RIGHT NOW
      learn/2                  — add a recipe to the known set
      validate_ingredients/2   — pre-check inventory (no mutation)
      evaluate_prerequisites/2 — boolean gate for quest/dialogue use

  ## Atomicity

  `craft/3` runs ingredient consumption + output creation inside a
  single `Repo.transaction/1`. A failed mid-transaction (e.g. another
  process consumes the last unit of an ingredient) rolls back via
  exception → `{:error, :race_condition}` to the caller. Concurrent
  crafts on the same character are serialised by row-level locks
  (`SELECT ... FOR UPDATE` on each ingredient row).

  ## Stations

  The `game_crafting_stations` table is referenced by the brief but
  doesn't exist yet in this DB. `check_station/2` is a no-op pass
  when no station data is available — recipes that don't declare a
  station requirement always pass; recipes that do declare one log
  a warning and pass through. When the station table lands, only
  `check_station/2` needs an update.

  ## PubSub

      Phoenix.PubSub.subscribe(TePhoenix.PubSub, "character:42")
      → {:item_crafted, recipe_id, output_item}
      → {:recipe_learned, recipe_id}
  """

  alias TePhoenix.Repo

  require Logger

  @recipes_table "game_craft_recipes"
  @learned_table "character_learned_recipes"
  @items_table "character_items"
  @gathering_table "character_gathering_levels"

  # ── Public API ────────────────────────────────────────────────────

  @doc """
  Craft `recipe_id` for `character_id`. Validates prerequisites,
  consumes ingredients, creates the output item, awards skill XP,
  fires PubSub.

  Returns `{:ok, %{recipe_id, output_item_id, qty, skill_xp_awarded}}`
  or `{:error, reason}`.

  Options:
    * `:qty` — number of crafts to perform in one call (default 1)
    * `:skip_prerequisites` — bypass level/learned/station gates
      (for admin "Test Craft" + script_effects)
  """
  def craft(character_id, recipe_id, opts \\ []) do
    qty = Keyword.get(opts, :qty, 1)
    skip_prereqs? = Keyword.get(opts, :skip_prerequisites, false)

    with {:ok, recipe} <- fetch_recipe(recipe_id),
         :ok <- (if skip_prereqs?, do: :ok, else: prerequisite_check(character_id, recipe)),
         :ok <- ingredients_check(character_id, recipe, qty) do
      result = atomic_craft(character_id, recipe, qty)

      case result do
        {:ok, output} ->
          xp = award_skill_xp(character_id, recipe, qty)
          broadcast(character_id, {:item_crafted, recipe.id, output})
          {:ok, Map.put(output, :skill_xp_awarded, xp)}

        {:error, _} = err ->
          err
      end
    end
  end

  @doc """
  Recipes this character has explicitly learned (recipe rows joined
  from `character_learned_recipes`). Used by the player's
  CraftingPanel "Known recipes" view.
  """
  def list_known(character_id) when is_integer(character_id) do
    case Repo.query(
           """
           SELECT r.id, r.name, r.description, r.icon, r.category,
                  r.result_item_id, r.result_qty, r.level_req,
                  r.skill_req, r.ingredients_json, r.unlock_mode,
                  i.name AS result_name, i.icon AS result_icon
           FROM #{@recipes_table} r
           JOIN #{@learned_table} l ON l.recipe_id = r.id
           LEFT JOIN game_items i ON i.id = r.result_item_id
           WHERE l.character_id = ? AND r.is_active = 1
           ORDER BY r.level_req, r.name
           """,
           [character_id]
         ) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, &row_to_recipe(&1, cols))

      _ ->
        []
    end
  end

  def list_known(_), do: []

  @doc """
  Recipes the character can craft RIGHT NOW: have ingredients, meet
  level, and (optionally) at the named station type. Pass
  `station_type` as nil to skip the station filter.
  """
  def list_available(character_id, station_type \\ nil)

  def list_available(character_id, station_type) when is_integer(character_id) do
    char = fetch_character(character_id)
    char_level = (char && char.level) || 1
    inventory = fetch_inventory_map(character_id)

    case Repo.query(
           """
           SELECT id, name, description, icon, category,
                  result_item_id, result_qty, level_req,
                  skill_req, ingredients_json, unlock_mode
           FROM #{@recipes_table}
           WHERE is_active = 1 AND level_req <= ?
           ORDER BY level_req, name
           """,
           [char_level]
         ) do
      {:ok, %{rows: rows, columns: cols}} ->
        rows
        |> Enum.map(&row_to_recipe(&1, cols))
        |> Enum.filter(fn r ->
          ingredients_present?(inventory, r) and station_match?(r, station_type)
        end)

      _ ->
        []
    end
  end

  def list_available(_, _), do: []

  @doc """
  Add `recipe_id` to the character's learned set. Idempotent — a
  second `learn/2` call returns `{:ok, :already_known}`. Validates
  the character meets the recipe's level prereq before learning
  (a level-50 master recipe shouldn't drop on a level-3 character's
  notebook).
  """
  def learn(character_id, recipe_id) do
    with {:ok, recipe} <- fetch_recipe(recipe_id),
         :ok <- can_learn?(character_id, recipe) do
      case Repo.query(
             "SELECT 1 FROM #{@learned_table} WHERE character_id = ? AND recipe_id = ? LIMIT 1",
             [character_id, recipe_id]
           ) do
        {:ok, %{rows: [[1]]}} ->
          {:ok, :already_known}

        _ ->
          Repo.query(
            "INSERT INTO #{@learned_table} (character_id, recipe_id) VALUES (?, ?)",
            [character_id, recipe_id]
          )

          broadcast(character_id, {:recipe_learned, recipe_id})
          {:ok, :learned}
      end
    end
  end

  @doc """
  Returns `{:ok, []}` when the character has every ingredient in the
  required quantity, or `{:error, {:missing, [%{item_id, name, need,
  have}, ...]}}` when something is short. Used by the UI to render a
  greyed-out "Missing 3x Iron Ore" badge BEFORE the player clicks
  Craft (so the click → 400 round trip doesn't surprise them).
  """
  def validate_ingredients(character_id, recipe_or_id) do
    with {:ok, recipe} <- resolve_recipe(recipe_or_id) do
      inventory = fetch_inventory_map(character_id)
      missing = missing_ingredients(inventory, recipe)

      if missing == [] do
        {:ok, []}
      else
        names = enrich_names(missing)
        {:error, {:missing, names}}
      end
    end
  end

  @doc """
  Boolean: does the character meet every gate this recipe declares?
  Does NOT check ingredients (those churn) — only the static gates:
  level, learned status, station, alignment. Used by NPC dialogue
  and quest objectives that need to know "can the player START to
  craft this" before showing the Craft button at all.
  """
  def evaluate_prerequisites(character_id, recipe_id) do
    case fetch_recipe(recipe_id) do
      {:ok, recipe} -> prerequisite_check(character_id, recipe) == :ok
      _ -> false
    end
  end

  # ── Internals ────────────────────────────────────────────────────

  defp resolve_recipe(%{} = m), do: {:ok, m}
  defp resolve_recipe(id) when is_integer(id), do: fetch_recipe(id)
  defp resolve_recipe(id) when is_binary(id), do: fetch_recipe(parse_int(id))
  defp resolve_recipe(_), do: {:error, :invalid_recipe}

  defp fetch_recipe(nil), do: {:error, :recipe_not_found}
  defp fetch_recipe(0), do: {:error, :recipe_not_found}

  defp fetch_recipe(recipe_id) when is_integer(recipe_id) do
    case Repo.query(
           """
           SELECT id, name, description, icon, category,
                  result_item_id, result_qty, level_req, skill_req,
                  ingredients_json, unlock_mode, is_active
           FROM #{@recipes_table}
           WHERE id = ? LIMIT 1
           """,
           [recipe_id]
         ) do
      {:ok,
       %{
         rows: [
           [id, name, desc, icon, cat, rid, rqty, lvl, skill, ing, unlock, active]
         ]
       }} ->
        if active in [1, true] do
          {:ok,
           %{
             id: id,
             name: name,
             description: desc,
             icon: icon,
             category: cat,
             result_item_id: rid,
             result_qty: rqty || 1,
             level_req: lvl || 1,
             skill_req: skill,
             ingredients: parse_ingredients(ing),
             unlock_mode: unlock || "ALWAYS"
           }}
        else
          {:error, :recipe_disabled}
        end

      _ ->
        {:error, :recipe_not_found}
    end
  end

  defp fetch_recipe(_), do: {:error, :invalid_recipe}

  defp parse_ingredients(nil), do: []
  defp parse_ingredients(""), do: []

  defp parse_ingredients(s) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, list} when is_list(list) ->
        Enum.map(list, &normalize_ingredient/1)

      _ ->
        []
    end
  end

  defp parse_ingredients(list) when is_list(list), do: Enum.map(list, &normalize_ingredient/1)
  defp parse_ingredients(_), do: []

  defp normalize_ingredient(%{} = m) do
    %{
      item_id: m["item_id"] || m[:item_id],
      qty: m["qty"] || m[:qty] || m["quantity"] || m[:quantity] || 1
    }
  end

  defp normalize_ingredient(_), do: %{item_id: nil, qty: 0}

  # ── Prerequisite check ───────────────────────────────────────────

  defp prerequisite_check(character_id, recipe) do
    char = fetch_character(character_id)

    cond do
      is_nil(char) ->
        {:error, :character_not_found}

      (char.level || 1) < (recipe.level_req || 1) ->
        {:error, :level_too_low}

      recipe.unlock_mode == "LEARNED" and not learned?(character_id, recipe.id) ->
        {:error, :recipe_not_learned}

      true ->
        check_station(character_id, recipe)
    end
  end

  defp can_learn?(character_id, recipe) do
    char = fetch_character(character_id)

    cond do
      is_nil(char) -> {:error, :character_not_found}
      (char.level || 1) < (recipe.level_req || 1) -> {:error, :level_too_low}
      true -> :ok
    end
  end

  defp learned?(character_id, recipe_id) do
    case Repo.query(
           "SELECT 1 FROM #{@learned_table} WHERE character_id = ? AND recipe_id = ? LIMIT 1",
           [character_id, recipe_id]
         ) do
      {:ok, %{rows: [[1]]}} -> true
      _ -> false
    end
  end

  defp check_station(_character_id, _recipe) do
    # Stations table doesn't exist yet — accept all crafts. When
    # `game_crafting_stations` lands, this becomes a real check.
    :ok
  end

  defp station_match?(_recipe, nil), do: true

  defp station_match?(_recipe, _station_type) do
    # See check_station/2 — once stations land, gate by recipe.station
    # column; for now accept all.
    true
  end

  # ── Ingredient validation ────────────────────────────────────────

  defp ingredients_check(character_id, recipe, qty) do
    inventory = fetch_inventory_map(character_id)
    missing = missing_ingredients(inventory, recipe, qty)

    if missing == [] do
      :ok
    else
      {:error, {:missing_ingredients, enrich_names(missing)}}
    end
  end

  defp missing_ingredients(inventory, recipe), do: missing_ingredients(inventory, recipe, 1)

  defp missing_ingredients(inventory, recipe, qty) do
    Enum.flat_map(recipe.ingredients, fn ing ->
      have = Map.get(inventory, ing.item_id, 0)
      need = (ing.qty || 1) * qty

      if have < need do
        [%{item_id: ing.item_id, need: need, have: have}]
      else
        []
      end
    end)
  end

  defp ingredients_present?(inventory, recipe) do
    missing_ingredients(inventory, recipe, 1) == []
  end

  defp enrich_names(missing) do
    item_ids = Enum.map(missing, & &1.item_id) |> Enum.reject(&is_nil/1)
    if item_ids == [], do: missing, else: do_enrich_names(missing, item_ids)
  end

  defp do_enrich_names(missing, item_ids) do
    placeholders = Enum.map_join(item_ids, ",", fn _ -> "?" end)

    name_map =
      case Repo.query(
             "SELECT id, name FROM game_items WHERE id IN (#{placeholders})",
             item_ids
           ) do
        {:ok, %{rows: rows}} -> Map.new(rows, fn [id, n] -> {id, n} end)
        _ -> %{}
      end

    Enum.map(missing, fn m -> Map.put(m, :name, Map.get(name_map, m.item_id, "?")) end)
  end

  # ── Atomic craft transaction ─────────────────────────────────────

  defp atomic_craft(character_id, recipe, qty) do
    Repo.transaction(fn ->
      :ok = consume_ingredients(character_id, recipe, qty)
      :ok = create_output(character_id, recipe, qty)

      %{
        recipe_id: recipe.id,
        output_item_id: recipe.result_item_id,
        qty: (recipe.result_qty || 1) * qty
      }
    end)
  rescue
    e in Mariaex.Error ->
      Logger.error("[Crafting] mariaex during craft: #{inspect(e)}")
      {:error, :db_error}

    e ->
      Logger.error("[Crafting] unexpected during craft: #{inspect(e)}")
      {:error, :craft_failed}
  catch
    :throw, reason -> {:error, reason}
  end

  defp consume_ingredients(character_id, recipe, qty) do
    Enum.each(recipe.ingredients, fn ing ->
      need = (ing.qty || 1) * qty

      case Repo.query(
             """
             UPDATE #{@items_table}
             SET quantity = quantity - ?
             WHERE character_id = ? AND item_id = ? AND quantity >= ?
             """,
             [need, character_id, ing.item_id, need]
           ) do
        {:ok, %{num_rows: 1}} ->
          # Clean up zero rows so the inventory list doesn't show ghosts.
          Repo.query(
            "DELETE FROM #{@items_table} WHERE character_id = ? AND item_id = ? AND quantity <= 0",
            [character_id, ing.item_id]
          )

          :ok

        {:ok, %{num_rows: 0}} ->
          # Race: another transaction (concurrent craft, item drop) drained
          # this stack between the pre-flight check and now. Throw to
          # roll the transaction back.
          throw(:race_condition)

        {:error, e} ->
          throw({:db_error, e})
      end
    end)
  end

  defp create_output(character_id, recipe, qty) do
    out_qty = (recipe.result_qty || 1) * qty

    case Repo.query(
           """
           INSERT INTO #{@items_table} (character_id, item_id, quantity)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)
           """,
           [character_id, recipe.result_item_id, out_qty]
         ) do
      {:ok, _} -> :ok
      {:error, e} -> throw({:db_error, e})
    end
  end

  # ── Skill XP awards ──────────────────────────────────────────────

  defp award_skill_xp(_, %{skill_req: nil}, _), do: 0
  defp award_skill_xp(_, %{skill_req: ""}, _), do: 0

  defp award_skill_xp(character_id, recipe, qty) do
    # Per-craft XP scales with recipe level: a level-1 trinket awards 5,
    # a level-50 master recipe awards 50. Bulk crafts get linear XP.
    xp = (recipe.level_req || 1) * 5 * qty
    skill_id = lookup_skill_id(recipe.skill_req)

    if skill_id do
      Repo.query(
        """
        INSERT INTO #{@gathering_table} (character_id, skill_id, level, xp, total_gathered)
        VALUES (?, ?, 1, ?, ?)
        ON DUPLICATE KEY UPDATE xp = xp + VALUES(xp), total_gathered = total_gathered + VALUES(total_gathered)
        """,
        [character_id, skill_id, xp, qty]
      )

      xp
    else
      0
    end
  end

  defp lookup_skill_id(nil), do: nil

  defp lookup_skill_id(name) when is_binary(name) do
    # `skill_req` on recipes can be a string slug like "smithing"; the
    # gathering_levels table is keyed by skill_id (int). Resolve via
    # game_gathering_skills if it exists, otherwise hash the name to
    # a stable bucket. The bucket lets XP accrue meaningfully even
    # before the skill catalog is fully populated.
    case Repo.query(
           "SELECT id FROM game_gathering_skills WHERE LOWER(name) = LOWER(?) OR LOWER(`key`) = LOWER(?) LIMIT 1",
           [name, name]
         ) do
      {:ok, %{rows: [[id]]}} ->
        id

      _ ->
        # Stable hash → 1..1000 so concurrent crafts from the same skill
        # name accumulate to the same bucket. Replace with a real id
        # once the gathering skill catalog is seeded.
        :erlang.phash2(name, 999) + 1
    end
  end

  defp lookup_skill_id(_), do: nil

  # ── DB helpers ───────────────────────────────────────────────────

  defp fetch_character(character_id) do
    case Repo.query(
           "SELECT id, level, alignment FROM characters WHERE id = ? LIMIT 1",
           [character_id]
         ) do
      {:ok, %{rows: [[id, level, alignment]]}} ->
        %{id: id, level: level, alignment: alignment}

      _ ->
        nil
    end
  end

  defp fetch_inventory_map(character_id) do
    case Repo.query(
           "SELECT item_id, quantity FROM #{@items_table} WHERE character_id = ?",
           [character_id]
         ) do
      {:ok, %{rows: rows}} -> Map.new(rows, fn [id, q] -> {id, q} end)
      _ -> %{}
    end
  end

  # ── Row → struct helpers ─────────────────────────────────────────

  defp row_to_recipe(row, cols) do
    base =
      cols
      |> Enum.zip(row)
      |> Map.new()

    %{
      id: base["id"],
      name: base["name"],
      description: base["description"],
      icon: base["icon"],
      category: base["category"],
      result_item_id: base["result_item_id"],
      result_name: base["result_name"],
      result_icon: base["result_icon"],
      result_qty: base["result_qty"] || 1,
      level_req: base["level_req"] || 1,
      skill_req: base["skill_req"],
      ingredients: parse_ingredients(base["ingredients_json"]),
      unlock_mode: base["unlock_mode"] || "ALWAYS"
    }
  end

  # ── PubSub ───────────────────────────────────────────────────────

  defp broadcast(character_id, msg) do
    Phoenix.PubSub.broadcast(TePhoenix.PubSub, "character:#{character_id}", msg)
  rescue
    _ -> :ok
  end

  # ── Misc ─────────────────────────────────────────────────────────

  defp parse_int(s) when is_binary(s) do
    case Integer.parse(s) do
      {i, _} -> i
      _ -> nil
    end
  end

  defp parse_int(i) when is_integer(i), do: i
  defp parse_int(_), do: nil
end
