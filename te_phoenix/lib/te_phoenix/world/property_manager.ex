defmodule TePhoenix.World.PropertyManager do
  @moduledoc """
  Player Real Estate, Deeds & Fortification Engine (*Bainisteoir Maoine*).

  Allows players to purchase real estate deeds in town:
    * **Property Deeds**: Purchase cottage, tavern loft room, or townhouse.
    * **Window & Door Fortifications**:
      - `iron_window_bars`: Prevents break-ins, window climbing, and defenestration.
      - `alarm_glyph`: Inscribed rune that alerts the owner upon window or door breach.
      - `velvet_soundproof_curtains`: Heavy acoustic drapes reducing sound transmission to 0.02×,
        making private party voice chat completely eavesdrop-proof!
    * **Sanctuary Rest**: Resting in your deeded home restores full HP/MP and grants
      the "Well Rested" buff (+20% XP gain).
  """

  alias TePhoenix.Repo
  require Logger

  @doc """
  Ensures the `game_properties` database schema exists.
  """
  def ensure_schema! do
    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_properties (
      id INT AUTO_INCREMENT PRIMARY KEY,
      building_id INT NOT NULL,
      map_id INT NOT NULL,
      name VARCHAR(128) NOT NULL,
      price_gold INT NOT NULL DEFAULT 200,
      owner_char_id INT NULL,
      owner_name VARCHAR(64) NULL,
      is_for_sale TINYINT(1) NOT NULL DEFAULT 1,
      fortifications_json LONGTEXT,
      curtains_drawn TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_prop_map (map_id),
      INDEX idx_prop_owner (owner_char_id)
    )
    """)
    :ok
  end

  @doc """
  Seeds default purchasable real estate properties.
  """
  def seed_default_properties!(map_id \\ 1) do
    ensure_schema!()

    defaults = [
      %{
        building_id: 1,
        map_id: map_id,
        name: "Prancing Mare Loft Room",
        price_gold: 150,
        fortifications: ["velvet_soundproof_curtains"]
      },
      %{
        building_id: 3,
        map_id: map_id,
        name: "Sanctuary Wayfarer Cottage",
        price_gold: 350,
        fortifications: []
      }
    ]

    Enum.each(defaults, fn p ->
      case Repo.query("SELECT id FROM game_properties WHERE map_id = ? AND name = ? LIMIT 1", [p.map_id, p.name]) do
        {:ok, %{rows: []}} ->
          json = Jason.encode!(p.fortifications)
          Repo.query(
            "INSERT INTO game_properties (building_id, map_id, name, price_gold, fortifications_json) VALUES (?, ?, ?, ?, ?)",
            [p.building_id, p.map_id, p.name, p.price_gold, json]
          )

        _ -> :ok
      end
    end)
    :ok
  end

  @doc """
  Lists all real estate properties for a map.
  """
  def list_properties(map_id) do
    ensure_schema!()

    case Repo.query(
           "SELECT id, building_id, map_id, name, price_gold, owner_char_id, owner_name, is_for_sale, fortifications_json, curtains_drawn FROM game_properties WHERE map_id = ?",
           [map_id]
         ) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn r ->
          row = Enum.zip(cols, r) |> Map.new()
          parse_property_row(row)
        end)

      _ -> []
    end
  end

  @doc """
  Purchases a property with player gold.
  """
  def purchase_property(player, property_id) do
    ensure_schema!()
    char_id = player[:id] || player["id"]
    char_name = player[:name] || player["name"] || "Adventurer"

    case Repo.query("SELECT id, name, price_gold, is_for_sale FROM game_properties WHERE id = ? LIMIT 1", [property_id]) do
      {:ok, %{rows: [[id, name, price, is_sale]]}} ->
        if is_sale != 1 do
          {:error, "#{name} is not for sale."}
        else
          gold = get_player_gold(player)
          if gold < price do
            {:error, "Insufficient funds: #{name} costs #{price} gold (you have #{gold}g)."}
          else
            deduct_player_gold(char_id, price)
            Repo.query("UPDATE game_properties SET owner_char_id = ?, owner_name = ?, is_for_sale = 0 WHERE id = ?", [char_id, char_name, id])

            TePhoenixWeb.Endpoint.broadcast("map:#{player[:map_id] || 1}", "property_purchased", %{
              property_id: id,
              name: name,
              owner_name: char_name,
              price: price
            })

            {:ok, %{
              success: true,
              property_id: id,
              name: name,
              owner_name: char_name,
              price_paid: price,
              message: "Congratulations! You purchased #{name} for #{price} gold! The deed is signed and the keys are yours!"
            }}
          end
        end

      _ ->
        {:error, "Property not found."}
    end
  end

  @doc """
  Installs a fortification upgrade onto the property.
  Types:
    * `"iron_window_bars"` (50g): Blocks window climbing and defenestration.
    * `"alarm_glyph"` (75g): Arcane intrusion rune notifying the owner.
    * `"velvet_soundproof_curtains"` (40g): Soundproof acoustic barrier.
  """
  def add_fortification(player, property_id, fort_type) do
    ensure_schema!()
    char_id = player[:id] || player["id"]

    costs = %{
      "iron_window_bars" => 50,
      "alarm_glyph" => 75,
      "velvet_soundproof_curtains" => 40
    }

    cost = Map.get(costs, fort_type, 50)

    case Repo.query("SELECT id, name, owner_char_id, fortifications_json FROM game_properties WHERE id = ? LIMIT 1", [property_id]) do
      {:ok, %{rows: [[id, name, owner, json]]}} ->
        if owner != char_id do
          {:error, "Only the deed owner can install fortifications."}
        else
          gold = get_player_gold(player)
          if gold < cost do
            {:error, "Installing #{fort_type} requires #{cost} gold (you have #{gold}g)."}
          else
            existing = decode_json(json, [])
            if fort_type in existing do
              {:error, "#{fort_type} is already installed on #{name}."}
            else
              deduct_player_gold(char_id, cost)
              updated = [fort_type | existing]
              Repo.query("UPDATE game_properties SET fortifications_json = ? WHERE id = ?", [Jason.encode!(updated), id])

              {:ok, %{
                success: true,
                fortification: fort_type,
                cost_gold: cost,
                property_name: name,
                fortifications: updated,
                message: "Successfully installed #{fort_type} on #{name}!"
              }}
            end
          end
        end

      _ ->
        {:error, "Property not found."}
    end
  end

  @doc """
  Toggles velvet soundproof curtains on or off.
  When drawn, sound transmission drops to 0.02x (eavesdrop-proof!).
  """
  def toggle_soundproof_curtains(player, property_id, drawn) do
    ensure_schema!()
    char_id = player[:id] || player["id"]

    case Repo.query("SELECT id, name, owner_char_id, fortifications_json FROM game_properties WHERE id = ? LIMIT 1", [property_id]) do
      {:ok, %{rows: [[id, name, owner, json]]}} ->
        if owner != char_id do
          {:error, "Only the property owner can adjust the curtains."}
        else
          forts = decode_json(json, [])
          if "velvet_soundproof_curtains" not in forts do
            {:error, "#{name} does not have velvet soundproof curtains installed."}
          else
            val = if drawn, do: 1, else: 0
            Repo.query("UPDATE game_properties SET curtains_drawn = ? WHERE id = ?", [val, id])

            desc = if drawn, do: "drawn shut. Interior voices are completely sealed inside (0.02x sound)!", else: "opened wide to the street."

            {:ok, %{
              success: true,
              curtains_drawn: drawn,
              property_name: name,
              sound_multiplier: if(drawn, do: 0.02, else: 0.95),
              message: "The heavy velvet soundproof curtains of #{name} were #{desc}"
            }}
          end
        end

      _ ->
        {:error, "Property not found."}
    end
  end

  @doc """
  Rests in deeded property sanctuary, restoring HP/MP and granting Well Rested buff.
  """
  def rest_in_sanctuary(player, property_id) do
    ensure_schema!()
    char_id = player[:id] || player["id"]

    case Repo.query("SELECT id, name, owner_char_id FROM game_properties WHERE id = ? LIMIT 1", [property_id]) do
      {:ok, %{rows: [[id, name, owner]]}} ->
        if owner != char_id do
          {:error, "You do not own #{name}. Trespassing in private quarters is forbidden."}
        else
          Repo.query("UPDATE characters SET current_hp = max_hp, current_mp = max_mp WHERE id = ?", [char_id])

          {:ok, %{
            success: true,
            property_name: name,
            hp_restored: true,
            mp_restored: true,
            buff: %{name: "Well Rested", bonus_xp_pct: 20, duration_seconds: 3600},
            message: "You sleep soundly in the safety of #{name}. Your health and mana are completely replenished, and you awaken Well Rested (+20% XP for 1 hour)!"
          }}
        end

      _ ->
        {:error, "Property not found."}
    end
  end

  # ── Helpers ────────────────────────────────────────────────────────

  defp parse_property_row(row) do
    %{
      id: row["id"],
      building_id: row["building_id"],
      map_id: row["map_id"],
      name: row["name"],
      price_gold: row["price_gold"],
      owner_char_id: row["owner_char_id"],
      owner_name: row["owner_name"],
      is_for_sale: row["is_for_sale"] == 1,
      fortifications: decode_json(row["fortifications_json"], []),
      curtains_drawn: row["curtains_drawn"] == 1
    }
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
