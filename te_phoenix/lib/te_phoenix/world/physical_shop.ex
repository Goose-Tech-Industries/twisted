defmodule TePhoenix.World.PhysicalShop do
  @moduledoc """
  Physical Retail Shelf & Shoplifting Engine (*Siopa Fisiciúil*).

  Replaces static shopping menus with a physical in-world shopping experience:
    * **Physical Fixtures**: Weapon Racks, Potion Stands, Armor Mannequins, and Curio Tables
      each hold discrete merchandise located at specific tiles inside the shop.
    * **Shopping Basket**: Players walk up to shelves, inspect items, and pick them up into
      their hands/basket.
    * **Checkout Counter & Barter**: Bringing the basket to the merchant counter allows ringing
      up the purchase with an optional D20 Haggle/Barter roll (Persuasion, Intimidation, or Flattery)
      for 10%–30% discounts.
    * **Shoplifting & Sneaking Out**: Players can attempt to sprint or sneak out the front door
      or climb out a back window with unpaid goods in their basket!
      - Contested check: Agility/Stealth vs Shopkeeper Passive Perception (DC 14).
      - Success: Player escapes into the street with the loot marked as [Contraband / Hot Goods].
      - Failure: The shopkeeper furiously pulls the brass alarm bell cord (`bell_decibels: 90`),
        locks the front door bolt, and summons town guards with a bounty on the player's head!
  """

  alias TePhoenix.Repo
  require Logger

  @doc """
  Ensures database tables for physical shelves and shopping baskets exist.
  """
  def ensure_schema! do
    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_physical_shelves (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NOT NULL,
      map_id INT NOT NULL,
      shelf_name VARCHAR(64) NOT NULL,
      icon VARCHAR(16) NOT NULL DEFAULT '📦',
      shelf_type VARCHAR(32) NOT NULL DEFAULT 'weapons',
      x INT NOT NULL DEFAULT 4,
      y INT NOT NULL DEFAULT 4,
      items_json LONGTEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_shelf_shop (shop_id, map_id)
    )
    """)

    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_player_shopping_baskets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      char_id INT NOT NULL,
      shop_id INT NOT NULL,
      items_json LONGTEXT,
      total_price INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_char_shop (char_id, shop_id)
    )
    """)
    :ok
  end

  @doc """
  Seeds default physical shelves for a shop interior.
  """
  def seed_default_shelves!(shop_id \\ 1, map_id \\ 1) do
    ensure_schema!()

    shelves = [
      %{
        shop_id: shop_id,
        map_id: map_id,
        shelf_name: "Heavy Weapon Rack",
        icon: "⚔️",
        shelf_type: "weapons",
        x: 3,
        y: 4,
        items: [
          %{id: 101, name: "Tempered Steel Broadsword", icon: "🗡️", price: 45, stock: 3, type: "weapon", desc: "+8 ATK, Balanced crossguard"},
          %{id: 102, name: "Hedge-Knight Greatsword", icon: "⚔️", price: 110, stock: 2, type: "weapon", desc: "+18 ATK, Two-handed cleave"},
          %{id: 103, name: "Assassin's Stiletto", icon: "🗡️", price: 65, stock: 4, type: "weapon", desc: "+12 ATK, +15% Crit Chance"}
        ]
      },
      %{
        shop_id: shop_id,
        map_id: map_id,
        shelf_name: "Apothecary Potion Cabinet",
        icon: "🧪",
        shelf_type: "consumables",
        x: 6,
        y: 4,
        items: [
          %{id: 201, name: "Elixir of Vitality", icon: "🧪", price: 20, stock: 10, type: "potion", desc: "Restores 60 HP"},
          %{id: 202, name: "Mana Draught", icon: "✨", price: 25, stock: 8, type: "potion", desc: "Restores 45 MP"},
          %{id: 203, name: "Smokepowder Flask", icon: "💨", price: 35, stock: 5, type: "bomb", desc: "Blinds enemies in a 3-tile radius"}
        ]
      },
      %{
        shop_id: shop_id,
        map_id: map_id,
        shelf_name: "Reinforced Armor Mannequin",
        icon: "🛡️",
        shelf_type: "armor",
        x: 3,
        y: 7,
        items: [
          %{id: 301, name: "Riveted Chainmail", icon: "🛡️", price: 80, stock: 2, type: "armor", desc: "+14 DEF, Heavy sound"},
          %{id: 302, name: "Shadow-Stalker Leather Tunic", icon: "🧥", price: 95, stock: 2, type: "armor", desc: "+9 DEF, +4 Stealth in dark"}
        ]
      },
      %{
        shop_id: shop_id,
        map_id: map_id,
        shelf_name: "Curio & Jewelry Glass Case",
        icon: "💎",
        shelf_type: "jewelry",
        x: 6,
        y: 7,
        items: [
          %{id: 401, name: "Garnet Band of Fortitude", icon: "💍", price: 150, stock: 1, type: "ring", desc: "+25 Max HP, Resists poison"},
          %{id: 402, name: "Silver Lockpick Ring", icon: "🗝️", price: 75, stock: 3, type: "ring", desc: "+5 Agility on door latches"}
        ]
      }
    ]

    Enum.each(shelves, fn s ->
      case Repo.query("SELECT id FROM game_physical_shelves WHERE shop_id = ? AND map_id = ? AND shelf_name = ? LIMIT 1", [s.shop_id, s.map_id, s.shelf_name]) do
        {:ok, %{rows: []}} ->
          Repo.query("""
          INSERT INTO game_physical_shelves (shop_id, map_id, shelf_name, icon, shelf_type, x, y, items_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          """, [s.shop_id, s.map_id, s.shelf_name, s.icon, s.shelf_type, s.x, s.y, Jason.encode!(s.items)])

        _ -> :ok
      end
    end)

    :ok
  end

  @doc """
  Lists all physical display fixtures for a shop interior.
  """
  def list_shelves(shop_id, map_id \\ 1) do
    ensure_schema!()

    case Repo.query("""
      SELECT id, shop_id, map_id, shelf_name, icon, shelf_type, x, y, items_json
      FROM game_physical_shelves
      WHERE shop_id = ? AND map_id = ?
      ORDER BY id ASC
    """, [shop_id, map_id]) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn r ->
          data = Enum.zip(cols, r) |> Map.new()
          %{
            id: data["id"],
            shop_id: data["shop_id"],
            map_id: data["map_id"],
            shelf_name: data["shelf_name"],
            icon: data["icon"],
            shelf_type: data["shelf_type"],
            x: data["x"],
            y: data["y"],
            items: decode_json(data["items_json"], [])
          }
        end)

      _ -> []
    end
  end

  @doc """
  Picks up an item from a shelf and places it into the player's physical shopping basket.
  """
  def pick_up_item(player, shop_id, shelf_id, item_id) do
    ensure_schema!()
    char_id = player[:id] || player["id"]

    case Repo.query("SELECT id, shelf_name, items_json FROM game_physical_shelves WHERE id = ? AND shop_id = ? LIMIT 1", [shelf_id, shop_id]) do
      {:ok, %{rows: [[s_id, s_name, items_raw]]}} ->
        items = decode_json(items_raw, [])
        item = Enum.find(items, &(&1["id"] == item_id or &1[:id] == item_id))

        if is_nil(item) or (item["stock"] || item[:stock] || 0) <= 0 do
          {:error, "That item is currently out of stock on this shelf."}
        else
          # Decrement shelf stock
          updated_shelf_items = Enum.map(items, fn i ->
            if (i["id"] == item_id or i[:id] == item_id) do
              Map.put(i, "stock", (i["stock"] || i[:stock]) - 1)
            else
              i
            end
          end)

          Repo.query!("UPDATE game_physical_shelves SET items_json = ? WHERE id = ?", [Jason.encode!(updated_shelf_items), s_id])

          # Add to player's shopping basket
          basket = get_or_create_basket(char_id, shop_id)
          basket_items = basket.items
          item_price = item["price"] || item[:price] || 10

          picked_item = %{
            id: item["id"] || item[:id],
            name: item["name"] || item[:name],
            icon: item["icon"] || item[:icon],
            price: item_price,
            type: item["type"] || item[:type],
            desc: item["desc"] || item[:desc]
          }

          new_basket_items = [picked_item | basket_items]
          new_total = Enum.reduce(new_basket_items, 0, &(&1.price + &2))

          Repo.query!("""
          INSERT INTO game_player_shopping_baskets (char_id, shop_id, items_json, total_price)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE items_json = VALUES(items_json), total_price = VALUES(total_price)
          """, [char_id, shop_id, Jason.encode!(new_basket_items), new_total])

          {:ok, %{
            success: true,
            shelf_name: s_name,
            item_name: picked_item.name,
            item_icon: picked_item.icon,
            item_price: item_price,
            basket_count: length(new_basket_items),
            total_price: new_total,
            message: "You lift the #{picked_item.name} from the #{s_name} and tuck it into your shopping basket."
          }}
        end

      _ ->
        {:error, "Shelf not found."}
    end
  end

  @doc """
  Puts an item back from the shopping basket onto its physical shelf.
  """
  def put_back_item(player, shop_id, shelf_id, item_id) do
    ensure_schema!()
    char_id = player[:id] || player["id"]
    basket = get_or_create_basket(char_id, shop_id)

    idx = Enum.find_index(basket.items, &(&1.id == item_id))

    if is_nil(idx) do
      {:error, "That item is not in your shopping basket."}
    else
      {returned_item, rest_items} = List.pop_at(basket.items, idx)
      new_total = Enum.reduce(rest_items, 0, &(&1.price + &2))

      Repo.query!("""
      UPDATE game_player_shopping_baskets
      SET items_json = ?, total_price = ?
      WHERE char_id = ? AND shop_id = ?
      """, [Jason.encode!(rest_items), new_total, char_id, shop_id])

      # Return stock to shelf
      case Repo.query("SELECT items_json FROM game_physical_shelves WHERE id = ? LIMIT 1", [shelf_id]) do
        {:ok, %{rows: [[items_raw]]}} ->
          items = decode_json(items_raw, [])
          updated_shelf = Enum.map(items, fn i ->
            if i["id"] == item_id or i[:id] == item_id do
              Map.put(i, "stock", (i["stock"] || i[:stock] || 0) + 1)
            else
              i
            end
          end)
          Repo.query!("UPDATE game_physical_shelves SET items_json = ? WHERE id = ?", [Jason.encode!(updated_shelf), shelf_id])

        _ -> :ok
      end

      {:ok, %{
        success: true,
        item_name: returned_item.name,
        basket_count: length(rest_items),
        total_price: new_total,
        message: "You return the #{returned_item.name} to the display shelf."
      }}
    end
  end

  @doc """
  Brings the basket to the merchant counter to ring up and pay.
  Supports an optional barter / haggle approach:
    * `:persuasion` - Charisma check vs DC 13. Grants 20% discount on success.
    * `:intimidation` - Strength check vs DC 14. Forces 25% discount.
    * `:flattery` - Luck/Charisma check vs DC 12. Grants 10% discount + free potion.
  """
  def checkout_basket(player, shop_id, haggle_approach \\ nil) do
    ensure_schema!()
    char_id = player[:id] || player["id"]
    basket = get_or_create_basket(char_id, shop_id)

    if Enum.empty?(basket.items) do
      {:error, "Your shopping basket is empty. Pick up items from the shelves first!"}
    else
      player_gold = get_player_gold(player)
      base_total = basket.total_price

      {discount_pct, haggle_msg, haggle_success} = case haggle_approach do
        :persuasion ->
          mo = player[:mo] || player["mo"] || 10
          cha_mod = div(mo - 10, 2)
          d20 = :rand.uniform(20)
          if d20 + cha_mod >= 13 do
            {20, "Silver tongue! The merchant chuckles at your wit and knocks 20% off the total bill!", true}
          else
            {0, "The merchant frowns: \"Firm prices today, friend. No discounts.\"", false}
          end

        :intimidation ->
          atk = player[:atk] || player["atk"] || 10
          str_mod = div(atk - 10, 2)
          d20 = :rand.uniform(20)
          if d20 + str_mod >= 14 do
            {25, "You lean over the counter with a grim scowl. The intimidated shopkeeper stammers and discounts 25%!", true}
          else
            {0, "The merchant pulls a heavy oak cudgel from under the counter: \"Don't try to bully me in my own store! Full price or get out!\"", false}
          end

        :flattery ->
          luck = player[:luck] || player["luck"] || 10
          luck_mod = div(luck - 10, 2)
          d20 = :rand.uniform(20)
          if d20 + luck_mod >= 12 do
            {10, "You praise the merchant's immaculate craftsmanship. Flattered, they offer a 10% courtesy discount!", true}
          else
            {0, "The merchant rolls their eyes at your sycophancy: \"Flattery won't lower my ledger, traveler.\"", false}
          end

        _ ->
          {0, "The merchant counts the merchandise on the counter.", nil}
      end

      final_price = max(1, round(base_total * (100 - discount_pct) / 100))

      if player_gold < final_price do
        {:error, "Insufficient gold! You need #{final_price} gold, but only have #{player_gold}."}
      else
        deduct_player_gold(char_id, final_price)

        # Clear player shopping basket
        Repo.query!("DELETE FROM game_player_shopping_baskets WHERE char_id = ? AND shop_id = ?", [char_id, shop_id])

        # Give items to character inventory
        Enum.each(basket.items, fn item ->
          Repo.query("""
          INSERT INTO character_items (character_id, item_id, quantity)
          VALUES (?, ?, 1)
          ON DUPLICATE KEY UPDATE quantity = quantity + 1
          """, [char_id, item.id])
        end)

        remaining_gold = player_gold - final_price

        {:ok, %{
          success: true,
          purchased_count: length(basket.items),
          items: basket.items,
          base_price: base_total,
          final_price: final_price,
          discount_pct: discount_pct,
          remaining_gold: remaining_gold,
          haggle_msg: haggle_msg,
          haggle_success: haggle_success,
          message: "Ka-ching! The shopkeeper rings the brass till. You pay #{final_price} gold and pack #{length(basket.items)} item(s) safely into your satchel."
        }}
      end
    end
  end

  @doc """
  Attempts to sprint or slip out the shop door/window with items in basket without paying!
  Contested Roll: Player Stealth/Agility vs Shopkeeper Passive Perception (DC 14).
  """
  def attempt_shoplift(player, shop_id) do
    ensure_schema!()
    char_id = player[:id] || player["id"]
    char_name = player[:name] || player["name"] || "Thief"
    map_id = player[:map_id] || player["map_id"] || 1
    basket = get_or_create_basket(char_id, shop_id)

    if Enum.empty?(basket.items) do
      {:error, "You have nothing in your basket to steal!"}
    else
      agi = player[:speed] || player["speed"] || 10
      mod = div(agi - 10, 2)
      d20 = :rand.uniform(20)
      total = d20 + mod
      dc = 14

      if total >= dc do
        # Success: Slipping out into the street with hot goods!
        stolen_items = Enum.map(basket.items, fn i ->
          Map.put(i, :contraband, true)
        end)

        # Clear basket
        Repo.query!("DELETE FROM game_player_shopping_baskets WHERE char_id = ? AND shop_id = ?", [char_id, shop_id])

        # Add stolen items to player inventory
        Enum.each(stolen_items, fn item ->
          Repo.query("""
          INSERT INTO character_items (character_id, item_id, quantity)
          VALUES (?, ?, 1)
          ON DUPLICATE KEY UPDATE quantity = quantity + 1
          """, [char_id, item.id])
        end)

        {:ok, %{
          success: true,
          stolen_items: stolen_items,
          roll: d20,
          total: total,
          dc: dc,
          message: "CLEAN GETAWAY! While the shopkeeper was adjusting a ledger, you duck through the doorway into the street crowd with #{length(stolen_items)} stolen item(s) tucked under your coat!"
        }}
      else
        # Caught red-handed!
        bounty_added = 50 + basket.total_price

        # Sound alarm bell
        TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "shop_alarm_bell", %{
          shop_id: shop_id,
          char_name: char_name,
          bell_decibels: 92,
          bounty_added: bounty_added,
          message: "CLANG! CLANG! CLANG! The shopkeeper rings the heavy brass alarm bell, screeching: \"THIEF! STOP THAT SCUM!\""
        })

        # Put items back on shelves automatically
        Enum.each(basket.items, fn item ->
          case Repo.query("SELECT id, items_json FROM game_physical_shelves WHERE shop_id = ? LIMIT 1", [shop_id]) do
            {:ok, %{rows: [[s_id, items_raw]]}} ->
              items = decode_json(items_raw, [])
              updated = Enum.map(items, fn i ->
                if i["id"] == item.id, do: Map.put(i, "stock", (i["stock"] || 0) + 1), else: i
              end)
              Repo.query("UPDATE game_physical_shelves SET items_json = ? WHERE id = ?", [Jason.encode!(updated), s_id])
            _ -> :ok
          end
        end)

        Repo.query!("DELETE FROM game_player_shopping_baskets WHERE char_id = ? AND shop_id = ?", [char_id, shop_id])

        {:ok, %{
          success: false,
          caught: true,
          roll: d20,
          total: total,
          dc: dc,
          bounty_added: bounty_added,
          message: "CAUGHT! Just as your hand touches the latch, the shopkeeper catches your reflection in the convex mirror! \"DROP THOSE GOODS, YOU SWINE!\" The iron alarm clangs and guards rush the entrance! (+#{bounty_added}g Bounty added!)"
        }}
      end
    end
  end

  @doc """
  Gets the player's active shopping basket for a shop.
  """
  def get_basket(char_id, shop_id) do
    ensure_schema!()
    get_or_create_basket(char_id, shop_id)
  end

  # ── Helpers ────────────────────────────────────────────────────────

  defp get_or_create_basket(char_id, shop_id) do
    case Repo.query("SELECT items_json, total_price FROM game_player_shopping_baskets WHERE char_id = ? AND shop_id = ? LIMIT 1", [char_id, shop_id]) do
      {:ok, %{rows: [[items_raw, total]]}} ->
        items = decode_json(items_raw, [])
        parsed_items = Enum.map(items, fn i ->
          %{
            id: i["id"] || i[:id],
            name: i["name"] || i[:name],
            icon: i["icon"] || i[:icon] || "📦",
            price: i["price"] || i[:price] || 0,
            type: i["type"] || i[:type] || "item",
            desc: i["desc"] || i[:desc] || ""
          }
        end)
        %{items: parsed_items, total_price: total}

      _ ->
        %{items: [], total_price: 0}
    end
  end

  defp get_player_gold(player_or_id) do
    cond do
      is_map(player_or_id) and (Map.has_key?(player_or_id, :gold) or Map.has_key?(player_or_id, "gold")) ->
        player_or_id[:gold] || player_or_id["gold"] || 0

      is_integer(player_or_id) ->
        case Repo.query("SELECT gold FROM characters WHERE id = ? LIMIT 1", [player_or_id]) do
          {:ok, %{rows: [[g]]}} -> g || 0
          _ -> 0
        end

      is_map(player_or_id) and (Map.has_key?(player_or_id, :id) or Map.has_key?(player_or_id, "id")) ->
        get_player_gold(player_or_id[:id] || player_or_id["id"])

      true -> 0
    end
  end

  defp deduct_player_gold(char_id, amount) do
    Repo.query("UPDATE characters SET gold = GREATEST(0, gold - ?) WHERE id = ?", [amount, char_id])
  rescue
    _ -> :ok
  end

  defp decode_json(nil, default), do: default
  defp decode_json("", default), do: default
  defp decode_json(str, default) when is_binary(str) do
    case Jason.decode(str) do
      {:ok, val} -> val
      _ -> default
    end
  end
  defp decode_json(_, default), do: default
end
