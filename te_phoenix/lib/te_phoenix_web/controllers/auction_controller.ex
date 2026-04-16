defmodule TePhoenixWeb.AuctionController do
  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  def list_auctions(conn, params) do
    search = params["search"] || ""
    sort = if params["sort"] in ~w(price_asc price_desc newest), do: params["sort"], else: "newest"

    order = case sort do
      "price_asc" -> "a.price ASC"
      "price_desc" -> "a.price DESC"
      _ -> "a.created_at DESC"
    end

    query = if search != "" do
      {"SELECT a.id, a.item_id, a.quantity, a.price, a.seller_char_id, a.created_at, a.expires_at, i.name, i.icon, i.rarity, i.type AS item_type, c.name AS seller_name FROM game_auction_listings a JOIN game_items i ON i.id=a.item_id JOIN characters c ON c.id=a.seller_char_id WHERE a.status='active' AND (a.expires_at IS NULL OR a.expires_at > NOW()) AND i.name LIKE ? ORDER BY #{order} LIMIT 50",
       ["%#{search}%"]}
    else
      {"SELECT a.id, a.item_id, a.quantity, a.price, a.seller_char_id, a.created_at, a.expires_at, i.name, i.icon, i.rarity, i.type AS item_type, c.name AS seller_name FROM game_auction_listings a JOIN game_items i ON i.id=a.item_id JOIN characters c ON c.id=a.seller_char_id WHERE a.status='active' AND (a.expires_at IS NULL OR a.expires_at > NOW()) ORDER BY #{order} LIMIT 50",
       []}
    end

    {sql, params_list} = query
    listings = query_rows(sql, params_list)
    json(conn, %{success: true, listings: listings})
  end

  def create_listing(conn, params) do
    user_id = conn.assigns.user_id
    item_id = params["itemId"]
    quantity = max(1, params["quantity"] || 1)
    price = max(1, params["price"] || 1)

    case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        # Verify item in inventory
        case Repo.query("SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=? AND quantity>=?", [char_id, item_id, quantity]) do
          {:ok, %{rows: [[inv_id, inv_qty]]}} ->
            # Remove from inventory
            if inv_qty <= quantity, do: Repo.query!("DELETE FROM character_items WHERE id=?", [inv_id]),
              else: Repo.query!("UPDATE character_items SET quantity=quantity-? WHERE id=?", [quantity, inv_id])

            # Create listing (expires in 48h)
            Repo.query!("INSERT INTO game_auction_listings (item_id, quantity, price, seller_char_id, expires_at) VALUES (?,?,?,?,DATE_ADD(NOW(), INTERVAL 48 HOUR))",
              [item_id, quantity, price, char_id])

            json(conn, %{success: true, message: "Listed on auction house!"})

          _ -> json(conn, %{success: false, message: "Item not in inventory."})
        end
      _ -> json(conn, %{success: false})
    end
  end

  def buy_listing(conn, %{"listingId" => listing_id}) do
    user_id = conn.assigns.user_id

    case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        case Repo.query("SELECT a.*, i.name FROM game_auction_listings a JOIN game_items i ON i.id=a.item_id WHERE a.id=? AND a.status='active'", [listing_id]) do
          {:ok, %{rows: [row], columns: cols}} ->
            listing = Enum.zip(cols, row) |> Map.new()
            price = listing["price"]

            # Can't buy own listing
            if listing["seller_char_id"] == char_id do
              json(conn, %{success: false, message: "Can't buy your own listing."})
            else
              # Check gold
              case Repo.query("SELECT currency FROM users WHERE id=?", [user_id]) do
                {:ok, %{rows: [[currency]]}} when currency >= price ->
                  # Execute trade
                  Repo.query!("UPDATE users SET currency=currency-? WHERE id=?", [price, user_id])
                  Repo.query!("UPDATE users SET currency=currency+? WHERE id=(SELECT user_id FROM characters WHERE id=?)",
                    [price, listing["seller_char_id"]])
                  Repo.query!("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+?",
                    [char_id, listing["item_id"], listing["quantity"], listing["quantity"]])
                  Repo.query!("UPDATE game_auction_listings SET status='sold', buyer_char_id=? WHERE id=?", [char_id, listing_id])

                  json(conn, %{success: true, message: "Purchased #{listing["name"]}!"})

                _ -> json(conn, %{success: false, message: "Not enough gold."})
              end
            end

          _ -> json(conn, %{success: false, message: "Listing not found."})
        end
      _ -> json(conn, %{success: false})
    end
  end

  def cancel_listing(conn, %{"listingId" => listing_id}) do
    user_id = conn.assigns.user_id
    case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        case Repo.query("SELECT item_id, quantity FROM game_auction_listings WHERE id=? AND seller_char_id=? AND status='active'", [listing_id, char_id]) do
          {:ok, %{rows: [[item_id, qty]]}} ->
            Repo.query!("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+?",
              [char_id, item_id, qty, qty])
            Repo.query!("UPDATE game_auction_listings SET status='cancelled' WHERE id=?", [listing_id])
            json(conn, %{success: true, message: "Listing cancelled. Item returned."})
          _ -> json(conn, %{success: false, message: "Listing not found."})
        end
      _ -> json(conn, %{success: false})
    end
  end

  defp query_rows(sql, params) do
    case Repo.query(sql, params) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
  end
end
