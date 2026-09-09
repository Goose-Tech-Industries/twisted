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
      stash_gold INT NOT NULL DEFAULT 0,
      guard_companion_id INT NULL,
      guard_companion_name VARCHAR(64) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_prop_map (map_id),
      INDEX idx_prop_owner (owner_char_id)
    )
    """)

    # Ensure added columns exist on existing tables
    try do
      Repo.query!("ALTER TABLE game_properties ADD COLUMN IF NOT EXISTS stash_gold INT NOT NULL DEFAULT 0")
      Repo.query!("ALTER TABLE game_properties ADD COLUMN IF NOT EXISTS guard_companion_id INT NULL")
      Repo.query!("ALTER TABLE game_properties ADD COLUMN IF NOT EXISTS guard_companion_name VARCHAR(64) NULL")
    rescue
      _ -> :ok
    end

    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_property_stashes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      property_id INT NOT NULL,
      char_id INT NOT NULL,
      item_key VARCHAR(64) NOT NULL,
      item_name VARCHAR(128) NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      item_meta_json LONGTEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_prop_stash (property_id)
    )
    """)

    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_property_trophies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      property_id INT NOT NULL,
      char_id INT NOT NULL,
      trophy_key VARCHAR(64) NOT NULL,
      name VARCHAR(128) NOT NULL,
      icon VARCHAR(16) NOT NULL DEFAULT '🏆',
      buff_type VARCHAR(64) NOT NULL,
      buff_value INT NOT NULL DEFAULT 10,
      description TEXT,
      mounted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_prop_trophy (property_id)
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
           "SELECT id, building_id, map_id, name, price_gold, owner_char_id, owner_name, is_for_sale, fortifications_json, curtains_drawn, stash_gold, guard_companion_name FROM game_properties WHERE map_id = ?",
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
      {:ok, %{rows: [[_id, name, owner]]}} ->
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

  # ── Safehouse Stash Vault ──────────────────────────────────────────

  @doc """
  Retrieves safehouse stash: stored gold, items, trophies, and guard companion.
  """
  def get_safehouse_stash(player, property_id) do
    ensure_schema!()
    char_id = player[:id] || player["id"]

    case Repo.query("SELECT id, name, owner_char_id, stash_gold, guard_companion_name FROM game_properties WHERE id = ? LIMIT 1", [property_id]) do
      {:ok, %{rows: [[id, name, owner, gold, guard]]}} ->
        if owner != char_id do
          {:error, "Only the deed owner may access the safehouse stash vault."}
        else
          items = case Repo.query("SELECT id, item_key, item_name, quantity, item_meta_json FROM game_property_stashes WHERE property_id = ? ORDER BY id DESC", [id]) do
            {:ok, %{rows: rows, columns: cols}} ->
              Enum.map(rows, fn r ->
                row = Enum.zip(cols, r) |> Map.new()
                %{
                  id: row["id"],
                  item_key: row["item_key"],
                  item_name: row["item_name"],
                  quantity: row["quantity"],
                  meta: decode_json(row["item_meta_json"], %{})
                }
              end)
            _ -> []
          end

          trophies = list_trophies(player, id)

          {:ok, %{
            property_id: id,
            property_name: name,
            stash_gold: gold || 0,
            guard_companion: guard,
            items: items,
            trophies: trophies
          }}
        end

      _ ->
        {:error, "Property not found."}
    end
  end

  @doc """
  Deposits gold from the player's purse into the safehouse vault.
  """
  def deposit_stash_gold(player, property_id, amount) when is_integer(amount) and amount > 0 do
    ensure_schema!()
    char_id = player[:id] || player["id"]

    case Repo.query("SELECT id, name, owner_char_id, stash_gold FROM game_properties WHERE id = ? LIMIT 1", [property_id]) do
      {:ok, %{rows: [[id, name, owner, current_stash]]}} ->
        if owner != char_id do
          {:error, "You do not own this property."}
        else
          gold = get_player_gold(player)
          if gold < amount do
            {:error, "Insufficient gold in purse: you have #{gold}g, trying to deposit #{amount}g."}
          else
            deduct_player_gold(char_id, amount)
            new_stash = (current_stash || 0) + amount
            Repo.query("UPDATE game_properties SET stash_gold = ? WHERE id = ?", [new_stash, id])

            {:ok, %{
              success: true,
              property_name: name,
              deposited_gold: amount,
              new_stash_gold: new_stash,
              message: "Securely deposited #{amount} gold into #{name}'s iron vault. Total stored: #{new_stash}g."
            }}
          end
        end

      _ -> {:error, "Property not found."}
    end
  end

  @doc """
  Withdraws gold from the safehouse vault into the player's purse.
  """
  def withdraw_stash_gold(player, property_id, amount) when is_integer(amount) and amount > 0 do
    ensure_schema!()
    char_id = player[:id] || player["id"]

    case Repo.query("SELECT id, name, owner_char_id, stash_gold FROM game_properties WHERE id = ? LIMIT 1", [property_id]) do
      {:ok, %{rows: [[id, name, owner, current_stash]]}} ->
        if owner != char_id do
          {:error, "You do not own this property."}
        else
          current = current_stash || 0
          if current < amount do
            {:error, "Vault has insufficient funds: stored #{current}g, requested #{amount}g."}
          else
            new_stash = current - amount
            Repo.query("UPDATE game_properties SET stash_gold = ? WHERE id = ?", [new_stash, id])
            award_player_gold(char_id, amount)

            {:ok, %{
              success: true,
              property_name: name,
              withdrawn_gold: amount,
              new_stash_gold: new_stash,
              message: "Withdrew #{amount} gold from #{name}'s vault. Stash remaining: #{new_stash}g."
            }}
          end
        end

      _ -> {:error, "Property not found."}
    end
  end

  @doc """
  Stores an item or contraband into the safehouse loot stash.
  """
  def deposit_stash_item(player, property_id, item_key, item_name, quantity \\ 1, meta \\ %{}) do
    ensure_schema!()
    char_id = player[:id] || player["id"]

    case Repo.query("SELECT id, name, owner_char_id FROM game_properties WHERE id = ? LIMIT 1", [property_id]) do
      {:ok, %{rows: [[id, name, owner]]}} ->
        if owner != char_id do
          {:error, "You do not own this property."}
        else
          json = Jason.encode!(meta)
          Repo.query(
            "INSERT INTO game_property_stashes (property_id, char_id, item_key, item_name, quantity, item_meta_json) VALUES (?, ?, ?, ?, ?, ?)",
            [id, char_id, item_key, item_name, quantity, json]
          )

          {:ok, %{
            success: true,
            property_name: name,
            item_key: item_key,
            item_name: item_name,
            quantity: quantity,
            message: "Stored #{quantity}x #{item_name} safely in #{name}."
          }}
        end

      _ -> {:error, "Property not found."}
    end
  end

  @doc """
  Withdraws an item from the safehouse loot stash into player inventory.
  """
  def withdraw_stash_item(player, property_id, stash_id) do
    ensure_schema!()
    _char_id = player[:id] || player["id"]

    case Repo.query("SELECT id, property_id, item_key, item_name, quantity FROM game_property_stashes WHERE id = ? AND property_id = ? LIMIT 1", [stash_id, property_id]) do
      {:ok, %{rows: [[id, prop_id, item_key, item_name, qty]]}} ->
        Repo.query("DELETE FROM game_property_stashes WHERE id = ?", [id])

        {:ok, %{
          success: true,
          property_id: prop_id,
          item_key: item_key,
          item_name: item_name,
          quantity: qty,
          message: "Retrieved #{qty}x #{item_name} from your safehouse locker."
        }}

      _ ->
        {:error, "Item not found in stash."}
    end
  end

  # ── Trophy Wall System ──────────────────────────────────────────────

  @doc """
  Lists mounted trophies on the property's walls.
  """
  def list_trophies(_player, property_id) do
    ensure_schema!()

    case Repo.query("SELECT id, trophy_key, name, icon, buff_type, buff_value, description FROM game_property_trophies WHERE property_id = ? ORDER BY id ASC", [property_id]) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn r -> Enum.zip(cols, r) |> Map.new() end)
      _ -> []
    end
  end

  @doc """
  Mounts a legendary trophy, boss head, or guild artifact on the safehouse wall.
  """
  def mount_trophy(player, property_id, trophy_key) do
    ensure_schema!()
    char_id = player[:id] || player["id"]

    catalog = %{
      "colossus_skull" => %{
        name: "Skull of the Ashveil Colossus",
        icon: "💀",
        buff_type: "defense_bonus",
        buff_value: 15,
        desc: "Ancient runic stone skull radiating defensive wards (+15 Phys/Arcane Def in town)."
      },
      "syndicate_crest" => %{
        name: "Shadow Syndicate Inscribed Crest",
        icon: "🗡️",
        buff_type: "stealth_bonus",
        buff_value: 20,
        desc: "Mark of the Underworld Council (+20 Stealth rating)."
      },
      "golden_skeleton_key" => %{
        name: "Silas's Golden Master Key",
        icon: "🔑",
        buff_type: "fence_bonus",
        buff_value: 15,
        desc: "Increases Black Market Fence barter payout by +15%."
      },
      "masterwork_lute" => %{
        name: "Rowan's Masterwork Bardic Lute",
        icon: "🪕",
        buff_type: "rest_bonus",
        buff_value: 10,
        desc: "Enhances Well Rested buff bonus to +30% XP."
      }
    }

    case Map.get(catalog, trophy_key) do
      nil -> {:error, "Unknown trophy type."}
      t ->
        case Repo.query("SELECT id, name, owner_char_id FROM game_properties WHERE id = ? LIMIT 1", [property_id]) do
          {:ok, %{rows: [[id, name, owner]]}} ->
            if owner != char_id do
              {:error, "Only the deed owner can mount trophies on the walls."}
            else
              # Check if already mounted
              case Repo.query("SELECT id FROM game_property_trophies WHERE property_id = ? AND trophy_key = ? LIMIT 1", [id, trophy_key]) do
                {:ok, %{rows: [[_]]}} ->
                  {:error, "#{t.name} is already mounted on the wall of #{name}."}

                _ ->
                  Repo.query(
                    """
                    INSERT INTO game_property_trophies
                    (property_id, char_id, trophy_key, name, icon, buff_type, buff_value, description)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [id, char_id, trophy_key, t.name, t.icon, t.buff_type, t.buff_value, t.desc]
                  )

                  {:ok, %{
                    success: true,
                    trophy_key: trophy_key,
                    name: t.name,
                    icon: t.icon,
                    buff_type: t.buff_type,
                    buff_value: t.buff_value,
                    property_name: name,
                    message: "Mounted #{t.name} proudly on the wall of #{name}! #{t.desc}"
                  }}
              end
            end

          _ -> {:error, "Property not found."}
        end
    end
  end

  @doc """
  Removes a mounted trophy from the wall.
  """
  def remove_trophy(player, property_id, trophy_id) do
    ensure_schema!()
    char_id = player[:id] || player["id"]

    case Repo.query("SELECT id, name, owner_char_id FROM game_properties WHERE id = ? LIMIT 1", [property_id]) do
      {:ok, %{rows: [[id, name, owner]]}} ->
        if owner != char_id do
          {:error, "You do not own this property."}
        else
          Repo.query("DELETE FROM game_property_trophies WHERE id = ? AND property_id = ?", [trophy_id, id])

          {:ok, %{
            success: true,
            property_name: name,
            message: "Removed trophy from the wall of #{name}."
          }}
        end

      _ -> {:error, "Property not found."}
    end
  end

  @doc """
  Assigns a companion NPC to guard the safehouse, boosting security rating and defending against intruders.
  """
  def assign_guard_companion(player, property_id, companion_id, companion_name) do
    ensure_schema!()
    char_id = player[:id] || player["id"]

    case Repo.query("SELECT id, name, owner_char_id FROM game_properties WHERE id = ? LIMIT 1", [property_id]) do
      {:ok, %{rows: [[id, name, owner]]}} ->
        if owner != char_id do
          {:error, "You do not own this property."}
        else
          Repo.query(
            "UPDATE game_properties SET guard_companion_id = ?, guard_companion_name = ? WHERE id = ?",
            [companion_id, companion_name, id]
          )

          {:ok, %{
            success: true,
            property_name: name,
            guard_companion_name: companion_name,
            message: "#{companion_name} has been stationed to guard #{name}! Intrusion defense and alert readiness increased."
          }}
        end

      _ -> {:error, "Property not found."}
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
      curtains_drawn: row["curtains_drawn"] == 1,
      stash_gold: row["stash_gold"] || 0,
      guard_companion_name: row["guard_companion_name"]
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

  defp award_player_gold(char_id, amount) do
    Repo.query("UPDATE characters SET gold = gold + ? WHERE id = ?", [amount, char_id])
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
