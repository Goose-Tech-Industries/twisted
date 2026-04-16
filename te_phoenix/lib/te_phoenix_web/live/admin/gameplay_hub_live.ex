defmodule TePhoenixWeb.Admin.GameplayHubLive do
  @moduledoc "Gameplay Systems — arenas, gathering, fishing, mounts, housing, cards, dice, bounties."
  use TePhoenixWeb, :live_view
  import TePhoenixWeb.Admin.CrudHelpers

  @per_page 30
  @hub_title "Gameplay Hub"
  @tab_config [
    {"Arenas",       "game_arenas"},
    {"Tournaments",  "game_tournaments"},
    {"Seasons",      "game_arena_seasons"},
    {"Achievements", "game_achievements"},
    {"Gathering",    "game_gathering_skills"},
    {"Nodes",        "game_gathering_nodes"},
    {"Fishing",      "game_fishing_spots"},
    {"Mounts",       "game_mounts"},
    {"Housing",      "game_housing_plots"},
    {"Furniture",    "game_furniture"},
    {"Cards",        "game_cards"},
    {"Card Rules",   "game_card_rules"},
    {"Dice",         "game_dice_tables"},
    {"Bounty Boards","game_bounty_boards"},
    {"Bounty Tasks", "game_bounty_tasks"},
    {"Treasure",     "game_treasure_trails"},
    {"Capture",      "game_capture_items"},
    {"Minigames",    "game_minigames"},
    {"Puzzles",      "game_puzzles"},
    {"Season FX",    "game_season_effects"},
  ]

  use TePhoenixWeb.Admin.HubCrud, per_page: @per_page, tab_config: @tab_config, hub_title: @hub_title, active_tab: :gameplay
end
