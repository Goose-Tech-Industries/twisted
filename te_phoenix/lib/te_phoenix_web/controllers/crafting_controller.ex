defmodule TePhoenixWeb.CraftingController do
  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  def list_recipes(conn, _params) do
    recipes = query_rows("SELECT r.id, r.name, r.description, r.result_item_id, r.result_quantity, r.ingredients_json, r.skill_required, r.level_required, i.name AS result_name, i.icon AS result_icon, i.rarity AS result_rarity FROM game_craft_recipes r JOIN game_items i ON i.id=r.result_item_id WHERE r.is_active=1 ORDER BY r.level_required, r.name")
    json(conn, %{success: true, recipes: recipes})
  end

  def craft_item(conn, %{"recipeId" => recipe_id}) do
    user_id = conn.assigns.user_id

    case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        case Repo.query("SELECT * FROM game_craft_recipes WHERE id=? AND is_active=1", [recipe_id]) do
          {:ok, %{rows: [row], columns: cols}} ->
            recipe = Enum.zip(cols, row) |> Map.new()
            ingredients = case Jason.decode(to_string(recipe["ingredients_json"] || "[]")) do
              {:ok, list} when is_list(list) -> list
              _ -> []
            end

            # Verify all ingredients in inventory
            missing = Enum.find(ingredients, fn ing ->
              item_id = ing["item_id"]
              qty = ing["quantity"] || 1
              case Repo.query("SELECT quantity FROM character_items WHERE character_id=? AND item_id=?", [char_id, item_id]) do
                {:ok, %{rows: [[have]]}} -> have < qty
                _ -> true
              end
            end)

            if missing do
              json(conn, %{success: false, message: "Missing ingredients."})
            else
              # Consume ingredients
              Enum.each(ingredients, fn ing ->
                Repo.query!("UPDATE character_items SET quantity=quantity-? WHERE character_id=? AND item_id=?",
                  [ing["quantity"] || 1, char_id, ing["item_id"]])
                # Clean up zero-quantity items
                Repo.query("DELETE FROM character_items WHERE character_id=? AND item_id=? AND quantity<=0", [char_id, ing["item_id"]])
              end)

              # Give result
              result_qty = recipe["result_quantity"] || 1
              Repo.query!("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+?",
                [char_id, recipe["result_item_id"], result_qty, result_qty])

              result_name = case Repo.query("SELECT name FROM game_items WHERE id=?", [recipe["result_item_id"]]) do
                {:ok, %{rows: [[n]]}} -> n
                _ -> "item"
              end

              json(conn, %{success: true, message: "Crafted #{result_qty}x #{result_name}!"})
            end

          _ -> json(conn, %{success: false, message: "Recipe not found."})
        end
      _ -> json(conn, %{success: false})
    end
  end

  defp query_rows(sql, params \\ []) do
    case Repo.query(sql, params) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
  end
end
