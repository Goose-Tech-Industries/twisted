# ── Step 0 seed: one shop, 5 items, linked NPC ─────────────────
#
#     mix run priv/repo/seed_test_shop.exs
#
# Idempotent: duplicate runs are a no-op for the shop and items.
# Supplies are rebuilt fresh each run (DELETE + re-INSERT).
# NPC link is idempotent (UPDATE, not INSERT).

alias TePhoenix.Repo

# ── Helpers ─────────────────────────────────────────────────────

defmodule ShopSeeder do
  def insert_shop(name, description, icon, map_id) do
    existing =
      Repo.query!("SELECT id FROM game_shops WHERE name = ?", [name])

    case existing.rows do
      [[id]] ->
        IO.puts("  Shop '#{name}' already exists (id=#{id}). Skipping insert.")
        id

      [] ->
        {:ok, result} =
          Repo.query(
            "INSERT INTO game_shops (name, description, icon, map_id) VALUES (?, ?, ?, ?)",
            [name, description, icon, map_id]
          )

        id = result.last_insert_id
        IO.puts("  Created shop '#{name}' (id=#{id})")
        id
    end
  end

  def ensure_item(attrs) do
    existing =
      Repo.query!("SELECT id FROM game_items WHERE name = ?", [attrs.name])

    case existing.rows do
      [[id]] ->
        id

      [] ->
        {:ok, result} =
          Repo.query(
            """
            INSERT INTO game_items
              (name, description, type, icon, slot, value,
               bonus_atk, bonus_def, bonus_hp, bonus_mp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
              attrs.name,
              attrs.description,
              attrs.type,
              attrs.icon,
              attrs.slot,
              attrs.value,
              attrs.bonus_atk || 0,
              attrs.bonus_def || 0,
              attrs.bonus_hp || 0,
              attrs.bonus_mp || 0
            ]
          )

        id = result.last_insert_id
        IO.puts("  Created item '#{attrs.name}' (id=#{id})")
        id
    end
  end

  def rebuild_supplies(shop_id, supplies) do
    {:ok, _} = Repo.query("DELETE FROM game_shop_supplies WHERE shop_id = ?", [shop_id])

    Enum.each(supplies, fn %{item_id: item_id, buy_price: buy, sell_price: sell} ->
      Repo.query!(
        "INSERT INTO game_shop_supplies (shop_id, item_id, buy_price, sell_price, stock) VALUES (?, ?, ?, ?, -1)",
        [shop_id, item_id, buy, sell]
      )
    end)

    IO.puts("  Inserted #{length(supplies)} supplies for shop #{shop_id}")
  end

  def link_npc(npc_id, shop_id) do
    {:ok, _} =
      Repo.query("UPDATE game_npcs SET shop_id = ? WHERE id = ?", [shop_id, npc_id])

    IO.puts("  Linked NPC id=#{npc_id} to shop id=#{shop_id}")
  end
end

# ── Main ────────────────────────────────────────────────────────

IO.puts("=== seed_test_shop.exs ===")
IO.puts("")

# 1. Find the best active map: one with a friendly NPC, preferring the
#    onboarding-seeded "Old Knight" if available.
npc_result =
  Repo.query!(
    """
    SELECT n.id, n.name, n.x, n.y, n.icon, n.is_enemy, n.shop_id,
           m.id AS map_id, m.name AS map_name, m.width, m.height,
           COALESCE(m.spawn_x, FLOOR(m.width / 2)) AS spawn_x,
           COALESCE(m.spawn_y, FLOOR(m.height / 2)) AS spawn_y
    FROM game_npcs n
    JOIN game_maps m ON n.map_id = m.id
    WHERE n.is_enemy = 0 AND m.is_active = 1
    ORDER BY
      CASE WHEN n.name = 'Old Knight' THEN 0 ELSE 1 END,
      m.id ASC, n.id ASC
    LIMIT 1
    """
  )

{npc_id, npc_name, npc_x, npc_y, npc_icon, _is_enemy, npc_shop_id,
 map_id, map_name, _w, _h, spawn_x, spawn_y} =
  case npc_result.rows do
    [[nid, nname, nx, ny, nicon, nis_enemy, nshop_id,
      mid, mname, mw, mh, msx, msy]] ->
      {nid, nname, nx, ny, nicon, nis_enemy, nshop_id,
       mid, mname, mw, mh, msx, msy}

    [] ->
      IO.puts("ERROR: No active map with a friendly NPC found.")
      IO.puts("Run the onboarding seeder (RPG genre) or place an NPC via /sauce.")
      System.halt(1)
  end

IO.puts("Map ##{map_id} '#{map_name}' found. Spawn: (#{spawn_x}, #{spawn_y})")

IO.puts(
  "Found NPC '#{npc_name}' #{npc_icon} (id=#{npc_id}) at (#{npc_x}, #{npc_y}) on '#{map_name}'"
)

if npc_shop_id && npc_shop_id > 0 do
  IO.puts("  NPC already has shop_id=#{npc_shop_id}. It will be overwritten.")
end

# 3. Create the shop on the same map as the NPC
IO.puts("")
shop_id =
  ShopSeeder.insert_shop(
    "Test Smithy",
    "A humble smithy offering basic arms and armor for the road ahead.",
    "⚔️",
    map_id
  )

# 4. Idempotent items
IO.puts("")
items_to_seed = [
  %{
    name: "Iron Sword",
    description: "A sturdy iron blade, well-worn but reliable.",
    type: "WEAPON",
    icon: "🗡️",
    slot: "WEAPON",
    value: 50,
    bonus_atk: 5,
    bonus_def: 0,
    bonus_hp: 0,
    bonus_mp: 0
  },
  %{
    name: "Health Potion",
    description: "A crimson vial that knits flesh and eases pain.",
    type: "CONSUMABLE",
    icon: "❤️",
    slot: nil,
    value: 25,
    bonus_atk: 0,
    bonus_def: 0,
    bonus_hp: 50,
    bonus_mp: 0
  },
  %{
    name: "Leather Armor",
    description: "Boiled leather jerkin, scarred but unbroken.",
    type: "ARMOR",
    icon: "🦺",
    slot: "ARMOR",
    value: 40,
    bonus_atk: 0,
    bonus_def: 3,
    bonus_hp: 0,
    bonus_mp: 0
  },
  %{
    name: "Wooden Shield",
    description: "A round oak targe bound with iron.",
    type: "ARMOR",
    icon: "🛡️",
    slot: "ARMOR",
    value: 35,
    bonus_atk: 0,
    bonus_def: 2,
    bonus_hp: 0,
    bonus_mp: 0
  },
  %{
    name: "Mana Potion",
    description: "A cobalt draught that restores focus and will.",
    type: "CONSUMABLE",
    icon: "💙",
    slot: nil,
    value: 30,
    bonus_atk: 0,
    bonus_def: 0,
    bonus_hp: 0,
    bonus_mp: 30
  }
]

item_ids =
  Enum.map(items_to_seed, fn item ->
    ShopSeeder.ensure_item(item)
  end)

# 5. Insert supplies (delete-then-insert for idempotency)
IO.puts("")
supplies = [
  %{item_id: Enum.at(item_ids, 0), buy_price: 75, sell_price: 25},
  %{item_id: Enum.at(item_ids, 1), buy_price: 35, sell_price: 10},
  %{item_id: Enum.at(item_ids, 2), buy_price: 60, sell_price: 20},
  %{item_id: Enum.at(item_ids, 3), buy_price: 50, sell_price: 15},
  %{item_id: Enum.at(item_ids, 4), buy_price: 45, sell_price: 15}
]

ShopSeeder.rebuild_supplies(shop_id, supplies)

# 6. Link NPC to shop
IO.puts("")
ShopSeeder.link_npc(npc_id, shop_id)

# ── Summary ─────────────────────────────────────────────────────

IO.puts("")
IO.puts("═══════════════════════════════════════════════════════")
IO.puts("  Created shop ID #{shop_id} with #{length(supplies)} supplies,")
IO.puts("  linked to NPC '#{npc_name}' #{npc_icon} (id=#{npc_id})")
IO.puts("  on map '#{map_name}' (id=#{map_id}) at (#{npc_x}, #{npc_y}).")
IO.puts("")
IO.puts("  Test URL:")
IO.puts("    http://localhost:5173/play/{charId}")
IO.puts("")
IO.puts("  Walk to tile (#{npc_x}, #{npc_y}) on '#{map_name}'")
IO.puts("  and press E to interact.")
IO.puts("  The NPC should offer '🏪 Browse your wares' option.")
IO.puts("═══════════════════════════════════════════════════════")
