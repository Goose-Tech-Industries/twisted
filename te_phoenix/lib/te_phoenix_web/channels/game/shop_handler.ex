defmodule TePhoenixWeb.Game.ShopHandler do
  @moduledoc """
  Shop buy/sell handlers. Players buy items from NPC shops and sell items back.
  Supports: haggle discounts, stock tracking, player-sold items appearing in shop.
  """

  import Phoenix.Channel
  require Logger

  alias TePhoenix.Repo

  # ── Get Shop Items ──────────────────────────────────────────────

  def handle("shop_get_items", %{"shopId" => shop_id}, socket) do
    char_id = socket.assigns[:char_id]
    if is_nil(char_id), do: {:noreply, socket}

    discount = socket.assigns[:shop_discount] || 0

    items = case Repo.query("""
      SELECT ss.id, ss.item_id, ss.buy_price, ss.sell_price, ss.stock,
             gi.name, gi.icon, gi.type, gi.rarity, gi.level_req, gi.description, gi.slot,
             gi.bonus_hp, gi.bonus_mp, gi.bonus_atk, gi.bonus_def, gi.bonus_speed
      FROM game_shop_supplies ss
      JOIN game_items gi ON gi.id = ss.item_id
      WHERE ss.shop_id=? AND (ss.stock != 0)
      ORDER BY gi.type, gi.name
    """, [shop_id]) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, item_id, buy, sell, stock, name, icon, type, rarity, lvl, desc, slot,
                            bhp, bmp, batk, bdef, bspd] ->
          adjusted_buy = if discount > 0, do: round(buy * (100 - discount) / 100), else: buy
          %{
            supply_id: id, item_id: item_id,
            buy_price: adjusted_buy, sell_price: sell, stock: stock,
            name: name, icon: icon, type: type, rarity: rarity,
            level_req: lvl || 0, description: desc, slot: slot,
            bonus_hp: bhp, bonus_mp: bmp, bonus_atk: batk, bonus_def: bdef, bonus_speed: bspd
          }
        end)
      _ -> []
    end

    # Get player's current gold
    user_id = socket.assigns.user_id
    gold = case Repo.query("SELECT currency FROM users WHERE id=?", [user_id]) do
      {:ok, %{rows: [[g]]}} -> g || 0
      _ -> 0
    end

    # Get player's inventory for sell tab
    inventory = case Repo.query("""
      SELECT ci.item_id, ci.quantity, gi.name, gi.icon, gi.type, gi.rarity, gi.value
      FROM character_items ci
      JOIN game_items gi ON gi.id = ci.item_id
      WHERE ci.character_id=?
      ORDER BY gi.type, gi.name
    """, [char_id]) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [item_id, qty, name, icon, type, rarity, value] ->
          # Sell price: check if shop buys this item (has a supply entry), otherwise use item base value / 2
          shop_sell = case Repo.query("SELECT sell_price FROM game_shop_supplies WHERE shop_id=? AND item_id=?", [shop_id, item_id]) do
            {:ok, %{rows: [[sp]]}} -> sp
            _ -> max(div(value || 0, 2), 1)
          end
          %{item_id: item_id, quantity: qty, name: name, icon: icon, type: type, rarity: rarity, sell_price: shop_sell}
        end)
      _ -> []
    end

    push(socket, "shop_items", %{
      shop_id: shop_id,
      items: items,
      inventory: inventory,
      gold: gold,
      discount: discount
    })

    {:noreply, socket}
  end

  # ── Buy Item ────────────────────────────────────────────────────

  def handle("shop_buy_item", %{"shopId" => shop_id, "itemId" => item_id} = params, socket) do
    char_id = socket.assigns[:char_id]
    user_id = socket.assigns.user_id
    quantity = params["quantity"] || 1
    discount = socket.assigns[:shop_discount] || 0

    if is_nil(char_id) do
      {:noreply, socket}
    else
      result = do_buy(shop_id, item_id, quantity, char_id, user_id, discount)

      case result do
        {:ok, msg, new_gold} ->
          # Log the purchase
          log_event("buy_item", user_id, char_id, %{shop_id: shop_id, item_id: item_id, quantity: quantity})
          push(socket, "buy_result", %{success: true, message: msg, gold: new_gold})

        {:error, msg} ->
          push(socket, "buy_result", %{success: false, message: msg})
      end

      {:noreply, socket}
    end
  end

  # ── Sell Item ───────────────────────────────────────────────────

  def handle("shop_sell_item", %{"shopId" => shop_id, "itemId" => item_id} = params, socket) do
    char_id = socket.assigns[:char_id]
    user_id = socket.assigns.user_id
    quantity = params["quantity"] || 1

    if is_nil(char_id) do
      {:noreply, socket}
    else
      result = do_sell(shop_id, item_id, quantity, char_id, user_id)

      case result do
        {:ok, msg, new_gold} ->
          log_event("sell_item", user_id, char_id, %{shop_id: shop_id, item_id: item_id, quantity: quantity})
          push(socket, "sell_result", %{success: true, message: msg, gold: new_gold})

        {:error, msg} ->
          push(socket, "sell_result", %{success: false, message: msg})
      end

      {:noreply, socket}
    end
  end

  # ── Private: Buy Logic ──────────────────────────────────────────

  defp do_buy(shop_id, item_id, quantity, char_id, user_id, discount) do
    quantity = max(1, quantity)

    # Get supply entry
    case Repo.query("SELECT id, buy_price, stock FROM game_shop_supplies WHERE shop_id=? AND item_id=?", [shop_id, item_id]) do
      {:ok, %{rows: [[supply_id, base_price, stock]]}} ->
        price = if discount > 0, do: round(base_price * (100 - discount) / 100), else: base_price
        total_cost = price * quantity

        # Check stock
        if stock != -1 and stock < quantity do
          {:error, "Not enough in stock (#{stock} available)."}
        else
          # Check player gold
          case Repo.query("SELECT currency FROM users WHERE id=?", [user_id]) do
            {:ok, %{rows: [[gold]]}} when gold >= total_cost ->
              # Deduct gold
              Repo.query("UPDATE users SET currency=currency-? WHERE id=?", [total_cost, user_id])

              # Add to inventory (stack if exists)
              case Repo.query("SELECT id FROM character_items WHERE character_id=? AND item_id=?", [char_id, item_id]) do
                {:ok, %{rows: [[ci_id]]}} ->
                  Repo.query("UPDATE character_items SET quantity=quantity+? WHERE id=?", [quantity, ci_id])
                _ ->
                  Repo.query("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?, ?, ?)", [char_id, item_id, quantity])
              end

              # Deduct stock if not infinite
              if stock != -1 do
                Repo.query("UPDATE game_shop_supplies SET stock=stock-? WHERE id=?", [quantity, supply_id])
              end

              new_gold = gold - total_cost
              {:ok, "Purchased #{quantity}x for #{total_cost}g.", new_gold}

            {:ok, %{rows: [[gold]]}} ->
              {:error, "Not enough gold (need #{total_cost}g, have #{gold}g)."}

            _ ->
              {:error, "Could not check your gold."}
          end
        end

      _ ->
        {:error, "Item not available in this shop."}
    end
  end

  # ── Private: Sell Logic ─────────────────────────────────────────

  defp do_sell(shop_id, item_id, quantity, char_id, user_id) do
    quantity = max(1, quantity)

    # Check player has the item
    case Repo.query("SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=?", [char_id, item_id]) do
      {:ok, %{rows: [[ci_id, owned_qty]]}} when owned_qty >= quantity ->
        # Get sell price — shop-specific or fallback to item value / 2
        sell_price = case Repo.query("SELECT sell_price FROM game_shop_supplies WHERE shop_id=? AND item_id=?", [shop_id, item_id]) do
          {:ok, %{rows: [[sp]]}} -> sp
          _ ->
            case Repo.query("SELECT value FROM game_items WHERE id=?", [item_id]) do
              {:ok, %{rows: [[v]]}} -> max(div(v || 0, 2), 1)
              _ -> 1
            end
        end

        total_gold = sell_price * quantity

        # Remove from inventory
        if owned_qty == quantity do
          Repo.query("DELETE FROM character_items WHERE id=?", [ci_id])
        else
          Repo.query("UPDATE character_items SET quantity=quantity-? WHERE id=?", [quantity, ci_id])
        end

        # Grant gold
        Repo.query("UPDATE users SET currency=currency+? WHERE id=?", [total_gold, user_id])

        # Add stock back to shop (if shop carries this item and stock isn't infinite)
        case Repo.query("SELECT id, stock FROM game_shop_supplies WHERE shop_id=? AND item_id=?", [shop_id, item_id]) do
          {:ok, %{rows: [[supply_id, stock]]}} when stock != -1 ->
            Repo.query("UPDATE game_shop_supplies SET stock=stock+? WHERE id=?", [quantity, supply_id])
          {:ok, %{rows: [[_, -1]]}} ->
            :ok  # Infinite stock, don't change
          _ ->
            # Shop doesn't carry this item — add it as player-sold stock
            Repo.query("""
              INSERT INTO game_shop_supplies (shop_id, item_id, buy_price, sell_price, stock)
              VALUES (?, ?, ?, ?, ?)
            """, [shop_id, item_id, sell_price * 2, sell_price, quantity])
        end

        new_gold = case Repo.query("SELECT currency FROM users WHERE id=?", [user_id]) do
          {:ok, %{rows: [[g]]}} -> g
          _ -> 0
        end

        {:ok, "Sold #{quantity}x for #{total_gold}g.", new_gold}

      {:ok, %{rows: [[_, owned_qty]]}} ->
        {:error, "You only have #{owned_qty}."}

      _ ->
        {:error, "You don't have that item."}
    end
  end

  # ── Private: Logging ────────────────────────────────────────────

  defp log_event(event_type, user_id, char_id, detail) do
    # Get player name for the log
    name = case Repo.query("SELECT name FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[n]]}} -> n
      _ -> "Unknown"
    end

    detail_json = Jason.encode!(detail)
    Repo.query(
      "INSERT INTO game_event_log (event_type, actor_id, actor_name, detail_json, created_at) VALUES (?, ?, ?, ?, NOW())",
      [event_type, user_id, name, detail_json]
    )
  end
end
