defmodule TePhoenix.World.ShopTransactions do
  @moduledoc """
  Shop buy/sell transaction logic — server-authoritative gold/inventory mutations.
  Used by ShopHandler channel events and can be called directly from scripts.
  """

  require Logger
  alias TePhoenix.Repo

  # ══════════════════════════════════════════════════════════════════
  # BUY
  # ══════════════════════════════════════════════════════════════════

  @doc """
  Buy an item from a shop. Validates gold, stock, and inventory space.
  Returns {:ok, %{gold_remaining: n, item_name: s}} or {:error, reason}.
  """
  def buy_item(char_id, shop_id, item_id, qty \\ 1) do
    qty = max(1, qty)

    with {:ok, supply} <- get_supply(shop_id, item_id),
         :ok <- check_stock(supply, qty),
         {:ok, user_id} <- get_user_id(char_id),
         {:ok, gold} <- get_gold(user_id),
         total_cost = supply.buy_price * qty,
         :ok <- check_afford(gold, total_cost) do

      # Deduct gold
      Repo.query!("UPDATE users SET currency=currency-? WHERE id=?", [total_cost, user_id])

      # Add to inventory (upsert)
      Repo.query!(
        "INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)",
        [char_id, item_id, qty]
      )

      # Deduct stock if not infinite (-1 = infinite)
      if supply.stock != -1 do
        Repo.query!("UPDATE game_shop_supplies SET stock=stock-? WHERE id=?", [qty, supply.supply_id])
      end

      item_name = get_item_name(item_id)
      Logger.info("Shop buy: char=#{char_id} item=#{item_id} qty=#{qty} cost=#{total_cost}")

      {:ok, %{gold_remaining: gold - total_cost, item_name: item_name, total_cost: total_cost}}
    end
  rescue
    e ->
      Logger.error("ShopTransactions.buy_item failed: #{inspect(e)}")
      {:error, "Transaction failed."}
  end

  # ══════════════════════════════════════════════════════════════════
  # SELL
  # ══════════════════════════════════════════════════════════════════

  @doc """
  Sell an item back to a shop. Awards gold at sell_pct of buy price.
  Returns {:ok, %{gold_gained: n, gold_remaining: n}} or {:error, reason}.
  """
  def sell_item(char_id, item_id, qty \\ 1, sell_pct \\ 0.5) do
    qty = max(1, qty)

    with {:ok, user_id} <- get_user_id(char_id),
         {:ok, inv_id, owned_qty} <- check_inventory(char_id, item_id, qty),
         {:ok, base_value} <- get_item_value(item_id) do

      sell_price = max(1, trunc(base_value * sell_pct))
      total_gold = sell_price * qty

      # Remove from inventory
      if owned_qty <= qty do
        Repo.query!("DELETE FROM character_items WHERE id=?", [inv_id])
      else
        Repo.query!("UPDATE character_items SET quantity=quantity-? WHERE id=?", [qty, inv_id])
      end

      # Award gold
      Repo.query!("UPDATE users SET currency=currency+? WHERE id=?", [total_gold, user_id])

      new_gold = case Repo.query("SELECT currency FROM users WHERE id=?", [user_id]) do
        {:ok, %{rows: [[g]]}} -> g
        _ -> 0
      end

      Logger.info("Shop sell: char=#{char_id} item=#{item_id} qty=#{qty} gold=#{total_gold}")

      {:ok, %{gold_gained: total_gold, gold_remaining: new_gold}}
    end
  rescue
    e ->
      Logger.error("ShopTransactions.sell_item failed: #{inspect(e)}")
      {:error, "Transaction failed."}
  end

  # ══════════════════════════════════════════════════════════════════
  # QUERIES
  # ══════════════════════════════════════════════════════════════════

  @doc "List items available at a shop with prices."
  def get_shop_items(shop_id) do
    case Repo.query("""
      SELECT ss.id, ss.item_id, ss.buy_price, ss.sell_price, ss.stock,
             gi.name, gi.icon, gi.type, gi.rarity, gi.description
      FROM game_shop_supplies ss
      JOIN game_items gi ON gi.id = ss.item_id
      WHERE ss.shop_id=? AND (ss.stock != 0)
      ORDER BY gi.type, gi.name
    """, [shop_id]) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [supply_id, item_id, buy, sell, stock, name, icon, type, rarity, desc] ->
          %{
            supply_id: supply_id, item_id: item_id,
            buy_price: buy, sell_price: sell, stock: stock,
            name: name, icon: icon, type: type, rarity: rarity, description: desc
          }
        end)
      _ -> []
    end
  end

  @doc "Check if a character can afford a given price."
  def can_afford?(char_id, price) do
    case get_user_id(char_id) do
      {:ok, user_id} ->
        case get_gold(user_id) do
          {:ok, gold} -> gold >= price
          _ -> false
        end
      _ -> false
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # PRIVATE HELPERS
  # ══════════════════════════════════════════════════════════════════

  defp get_supply(shop_id, item_id) do
    case Repo.query(
      "SELECT id, buy_price, sell_price, stock FROM game_shop_supplies WHERE shop_id=? AND item_id=?",
      [shop_id, item_id]
    ) do
      {:ok, %{rows: [[id, buy, sell, stock]]}} ->
        {:ok, %{supply_id: id, buy_price: buy, sell_price: sell, stock: stock}}
      _ ->
        {:error, "Item not available in this shop."}
    end
  end

  defp check_stock(%{stock: -1}, _qty), do: :ok
  defp check_stock(%{stock: stock}, qty) when stock >= qty, do: :ok
  defp check_stock(%{stock: stock}, _qty), do: {:error, "Not enough in stock (#{stock} available)."}

  defp get_user_id(char_id) do
    case Repo.query("SELECT user_id FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[uid]]}} -> {:ok, uid}
      _ -> {:error, "Character not found."}
    end
  end

  defp get_gold(user_id) do
    case Repo.query("SELECT currency FROM users WHERE id=?", [user_id]) do
      {:ok, %{rows: [[gold]]}} -> {:ok, gold || 0}
      _ -> {:error, "Could not check gold."}
    end
  end

  defp check_afford(gold, cost) when gold >= cost, do: :ok
  defp check_afford(gold, cost), do: {:error, "Not enough gold (need #{cost}g, have #{gold}g)."}

  defp check_inventory(char_id, item_id, qty) do
    case Repo.query(
      "SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=?",
      [char_id, item_id]
    ) do
      {:ok, %{rows: [[inv_id, owned]]}} when owned >= qty ->
        {:ok, inv_id, owned}
      {:ok, %{rows: [[_, owned]]}} ->
        {:error, "You only have #{owned}."}
      _ ->
        {:error, "You don't have that item."}
    end
  end

  defp get_item_value(item_id) do
    case Repo.query("SELECT value FROM game_items WHERE id=?", [item_id]) do
      {:ok, %{rows: [[v]]}} -> {:ok, v || 0}
      _ -> {:ok, 0}
    end
  end

  defp get_item_name(item_id) do
    case Repo.query("SELECT name FROM game_items WHERE id=?", [item_id]) do
      {:ok, %{rows: [[name]]}} -> name
      _ -> "Item"
    end
  end
end
