defmodule TePhoenixWeb.Admin.EconomyHubLive do
  @moduledoc "Economy — shops, crafting, loot tables, items, trade audit."
  use TePhoenixWeb, :live_view

  @per_page 30
  @tab_config [
    {"Items",         "game_items"},
    {"Shops",         "game_shops"},
    {"Shop Stock",    "game_shop_supplies"},
    {"Loot Tables",   "game_loot_tables"},
    {"Craft Recipes", "game_craft_recipes"},
    {"Capsules",      "game_capsule_items"},
    {"Item Sets",     "game_item_sets"},
    {"Item Curses",   "game_item_curses"},
    {"Equip Slots",   "game_equip_slots"},
    {"Auctions",      "auction_listings"},
    {"Inns",          "game_inns"},
  ]

  use TePhoenixWeb.Admin.HubCrud, per_page: @per_page, tab_config: @tab_config, hub_title: "Economy Hub", active_tab: :economy
end
