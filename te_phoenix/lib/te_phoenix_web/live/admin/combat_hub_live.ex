defmodule TePhoenixWeb.Admin.CombatHubLive do
  @moduledoc "Combat Hub — classes, races, skills, techniques, statuses, battle templates, and more."
  use TePhoenixWeb, :live_view

  @per_page 30
  @tab_config [
    {"Classes",      "game_classes"},
    {"Races",        "game_races"},
    {"Skills",       "game_skills"},
    {"Techniques",   "game_techniques"},
    {"Sig Techs",    "game_signature_abilities"},
    {"Statuses",     "game_statuses"},
    {"Templates",    "game_battle_templates"},
    {"Commands",     "game_battle_commands"},
    {"Limits",       "game_limit_breaks"},
    {"Ki Moves",     "game_ki_moves"},
    {"Combos",       "game_combo_chains"},
    {"Finishers",    "game_finishing_moves"},
    {"Fusions",      "game_fusions"},
    {"Summons",      "game_summons"},
    {"Battle Items", "game_battle_items"},
    {"Terrain",      "game_battle_terrain"},
    {"Conditions",   "game_battle_conditions"},
    {"Formations",   "game_formation_shapes"},
    {"Elements",     "game_elements"},
    {"Immunities",   "game_status_immunities"},
    {"Enemy Scale",  "game_enemy_scaling"},
    {"Body Types",   "game_body_types"},
    {"Limb Zones",   "game_limb_zones"},
  ]

  use TePhoenixWeb.Admin.HubCrud, per_page: @per_page, tab_config: @tab_config, hub_title: "Combat Hub", active_tab: :combat
end
