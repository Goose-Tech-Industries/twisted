
            CREATE SEQUENCE IF NOT EXISTS "characters_id_seq";
            ALTER TABLE "characters" ALTER COLUMN "id" SET DEFAULT nextval('"characters_id_seq"');
            ALTER SEQUENCE "characters_id_seq" OWNED BY "characters"."id";
            SELECT setval('"characters_id_seq"', COALESCE((SELECT MAX("id") FROM "characters"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "character_achievements_id_seq";
            ALTER TABLE "character_achievements" ALTER COLUMN "id" SET DEFAULT nextval('"character_achievements_id_seq"');
            ALTER SEQUENCE "character_achievements_id_seq" OWNED BY "character_achievements"."id";
            SELECT setval('"character_achievements_id_seq"', COALESCE((SELECT MAX("id") FROM "character_achievements"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "character_cards_id_seq";
            ALTER TABLE "character_cards" ALTER COLUMN "id" SET DEFAULT nextval('"character_cards_id_seq"');
            ALTER SEQUENCE "character_cards_id_seq" OWNED BY "character_cards"."id";
            SELECT setval('"character_cards_id_seq"', COALESCE((SELECT MAX("id") FROM "character_cards"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "character_companions_id_seq";
            ALTER TABLE "character_companions" ALTER COLUMN "id" SET DEFAULT nextval('"character_companions_id_seq"');
            ALTER SEQUENCE "character_companions_id_seq" OWNED BY "character_companions"."id";
            SELECT setval('"character_companions_id_seq"', COALESCE((SELECT MAX("id") FROM "character_companions"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "character_equipment_id_seq";
            ALTER TABLE "character_equipment" ALTER COLUMN "id" SET DEFAULT nextval('"character_equipment_id_seq"');
            ALTER SEQUENCE "character_equipment_id_seq" OWNED BY "character_equipment"."id";
            SELECT setval('"character_equipment_id_seq"', COALESCE((SELECT MAX("id") FROM "character_equipment"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "character_known_spells_id_seq";
            ALTER TABLE "character_known_spells" ALTER COLUMN "id" SET DEFAULT nextval('"character_known_spells_id_seq"');
            ALTER SEQUENCE "character_known_spells_id_seq" OWNED BY "character_known_spells"."id";
            SELECT setval('"character_known_spells_id_seq"', COALESCE((SELECT MAX("id") FROM "character_known_spells"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "character_learned_recipes_id_seq";
            ALTER TABLE "character_learned_recipes" ALTER COLUMN "id" SET DEFAULT nextval('"character_learned_recipes_id_seq"');
            ALTER SEQUENCE "character_learned_recipes_id_seq" OWNED BY "character_learned_recipes"."id";
            SELECT setval('"character_learned_recipes_id_seq"', COALESCE((SELECT MAX("id") FROM "character_learned_recipes"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "character_oghams_id_seq";
            ALTER TABLE "character_oghams" ALTER COLUMN "id" SET DEFAULT nextval('"character_oghams_id_seq"');
            ALTER SEQUENCE "character_oghams_id_seq" OWNED BY "character_oghams"."id";
            SELECT setval('"character_oghams_id_seq"', COALESCE((SELECT MAX("id") FROM "character_oghams"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "character_progress_counters_id_seq";
            ALTER TABLE "character_progress_counters" ALTER COLUMN "id" SET DEFAULT nextval('"character_progress_counters_id_seq"');
            ALTER SEQUENCE "character_progress_counters_id_seq" OWNED BY "character_progress_counters"."id";
            SELECT setval('"character_progress_counters_id_seq"', COALESCE((SELECT MAX("id") FROM "character_progress_counters"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "character_spell_cooldowns_id_seq";
            ALTER TABLE "character_spell_cooldowns" ALTER COLUMN "id" SET DEFAULT nextval('"character_spell_cooldowns_id_seq"');
            ALTER SEQUENCE "character_spell_cooldowns_id_seq" OWNED BY "character_spell_cooldowns"."id";
            SELECT setval('"character_spell_cooldowns_id_seq"', COALESCE((SELECT MAX("id") FROM "character_spell_cooldowns"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "character_titles_id_seq";
            ALTER TABLE "character_titles" ALTER COLUMN "id" SET DEFAULT nextval('"character_titles_id_seq"');
            ALTER SEQUENCE "character_titles_id_seq" OWNED BY "character_titles"."id";
            SELECT setval('"character_titles_id_seq"', COALESCE((SELECT MAX("id") FROM "character_titles"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_achievements_id_seq";
            ALTER TABLE "game_achievements" ALTER COLUMN "id" SET DEFAULT nextval('"game_achievements_id_seq"');
            ALTER SEQUENCE "game_achievements_id_seq" OWNED BY "game_achievements"."id";
            SELECT setval('"game_achievements_id_seq"', COALESCE((SELECT MAX("id") FROM "game_achievements"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_action_windows_id_seq";
            ALTER TABLE "game_action_windows" ALTER COLUMN "id" SET DEFAULT nextval('"game_action_windows_id_seq"');
            ALTER SEQUENCE "game_action_windows_id_seq" OWNED BY "game_action_windows"."id";
            SELECT setval('"game_action_windows_id_seq"', COALESCE((SELECT MAX("id") FROM "game_action_windows"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_autotile_groups_id_seq";
            ALTER TABLE "game_autotile_groups" ALTER COLUMN "id" SET DEFAULT nextval('"game_autotile_groups_id_seq"');
            ALTER SEQUENCE "game_autotile_groups_id_seq" OWNED BY "game_autotile_groups"."id";
            SELECT setval('"game_autotile_groups_id_seq"', COALESCE((SELECT MAX("id") FROM "game_autotile_groups"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_backgrounds_id_seq";
            ALTER TABLE "game_backgrounds" ALTER COLUMN "id" SET DEFAULT nextval('"game_backgrounds_id_seq"');
            ALTER SEQUENCE "game_backgrounds_id_seq" OWNED BY "game_backgrounds"."id";
            SELECT setval('"game_backgrounds_id_seq"', COALESCE((SELECT MAX("id") FROM "game_backgrounds"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_battle_commands_id_seq";
            ALTER TABLE "game_battle_commands" ALTER COLUMN "id" SET DEFAULT nextval('"game_battle_commands_id_seq"');
            ALTER SEQUENCE "game_battle_commands_id_seq" OWNED BY "game_battle_commands"."id";
            SELECT setval('"game_battle_commands_id_seq"', COALESCE((SELECT MAX("id") FROM "game_battle_commands"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_battle_referees_id_seq";
            ALTER TABLE "game_battle_referees" ALTER COLUMN "id" SET DEFAULT nextval('"game_battle_referees_id_seq"');
            ALTER SEQUENCE "game_battle_referees_id_seq" OWNED BY "game_battle_referees"."id";
            SELECT setval('"game_battle_referees_id_seq"', COALESCE((SELECT MAX("id") FROM "game_battle_referees"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_bounty_boards_id_seq";
            ALTER TABLE "game_bounty_boards" ALTER COLUMN "id" SET DEFAULT nextval('"game_bounty_boards_id_seq"');
            ALTER SEQUENCE "game_bounty_boards_id_seq" OWNED BY "game_bounty_boards"."id";
            SELECT setval('"game_bounty_boards_id_seq"', COALESCE((SELECT MAX("id") FROM "game_bounty_boards"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_bounty_tasks_id_seq";
            ALTER TABLE "game_bounty_tasks" ALTER COLUMN "id" SET DEFAULT nextval('"game_bounty_tasks_id_seq"');
            ALTER SEQUENCE "game_bounty_tasks_id_seq" OWNED BY "game_bounty_tasks"."id";
            SELECT setval('"game_bounty_tasks_id_seq"', COALESCE((SELECT MAX("id") FROM "game_bounty_tasks"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_buildings_id_seq";
            ALTER TABLE "game_buildings" ALTER COLUMN "id" SET DEFAULT nextval('"game_buildings_id_seq"');
            ALTER SEQUENCE "game_buildings_id_seq" OWNED BY "game_buildings"."id";
            SELECT setval('"game_buildings_id_seq"', COALESCE((SELECT MAX("id") FROM "game_buildings"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_campaign_rulesets_id_seq";
            ALTER TABLE "game_campaign_rulesets" ALTER COLUMN "id" SET DEFAULT nextval('"game_campaign_rulesets_id_seq"');
            ALTER SEQUENCE "game_campaign_rulesets_id_seq" OWNED BY "game_campaign_rulesets"."id";
            SELECT setval('"game_campaign_rulesets_id_seq"', COALESCE((SELECT MAX("id") FROM "game_campaign_rulesets"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_cards_id_seq";
            ALTER TABLE "game_cards" ALTER COLUMN "id" SET DEFAULT nextval('"game_cards_id_seq"');
            ALTER SEQUENCE "game_cards_id_seq" OWNED BY "game_cards"."id";
            SELECT setval('"game_cards_id_seq"', COALESCE((SELECT MAX("id") FROM "game_cards"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_card_matches_id_seq";
            ALTER TABLE "game_card_matches" ALTER COLUMN "id" SET DEFAULT nextval('"game_card_matches_id_seq"');
            ALTER SEQUENCE "game_card_matches_id_seq" OWNED BY "game_card_matches"."id";
            SELECT setval('"game_card_matches_id_seq"', COALESCE((SELECT MAX("id") FROM "game_card_matches"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_card_rules_id_seq";
            ALTER TABLE "game_card_rules" ALTER COLUMN "id" SET DEFAULT nextval('"game_card_rules_id_seq"');
            ALTER SEQUENCE "game_card_rules_id_seq" OWNED BY "game_card_rules"."id";
            SELECT setval('"game_card_rules_id_seq"', COALESCE((SELECT MAX("id") FROM "game_card_rules"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_case_clues_id_seq";
            ALTER TABLE "game_case_clues" ALTER COLUMN "id" SET DEFAULT nextval('"game_case_clues_id_seq"');
            ALTER SEQUENCE "game_case_clues_id_seq" OWNED BY "game_case_clues"."id";
            SELECT setval('"game_case_clues_id_seq"', COALESCE((SELECT MAX("id") FROM "game_case_clues"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_case_suspects_id_seq";
            ALTER TABLE "game_case_suspects" ALTER COLUMN "id" SET DEFAULT nextval('"game_case_suspects_id_seq"');
            ALTER SEQUENCE "game_case_suspects_id_seq" OWNED BY "game_case_suspects"."id";
            SELECT setval('"game_case_suspects_id_seq"', COALESCE((SELECT MAX("id") FROM "game_case_suspects"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_catacomb_dungeons_id_seq";
            ALTER TABLE "game_catacomb_dungeons" ALTER COLUMN "id" SET DEFAULT nextval('"game_catacomb_dungeons_id_seq"');
            ALTER SEQUENCE "game_catacomb_dungeons_id_seq" OWNED BY "game_catacomb_dungeons"."id";
            SELECT setval('"game_catacomb_dungeons_id_seq"', COALESCE((SELECT MAX("id") FROM "game_catacomb_dungeons"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_catacomb_rooms_id_seq";
            ALTER TABLE "game_catacomb_rooms" ALTER COLUMN "id" SET DEFAULT nextval('"game_catacomb_rooms_id_seq"');
            ALTER SEQUENCE "game_catacomb_rooms_id_seq" OWNED BY "game_catacomb_rooms"."id";
            SELECT setval('"game_catacomb_rooms_id_seq"', COALESCE((SELECT MAX("id") FROM "game_catacomb_rooms"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_character_action_log_id_seq";
            ALTER TABLE "game_character_action_log" ALTER COLUMN "id" SET DEFAULT nextval('"game_character_action_log_id_seq"');
            ALTER SEQUENCE "game_character_action_log_id_seq" OWNED BY "game_character_action_log"."id";
            SELECT setval('"game_character_action_log_id_seq"', COALESCE((SELECT MAX("id") FROM "game_character_action_log"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_character_bounties_id_seq";
            ALTER TABLE "game_character_bounties" ALTER COLUMN "id" SET DEFAULT nextval('"game_character_bounties_id_seq"');
            ALTER SEQUENCE "game_character_bounties_id_seq" OWNED BY "game_character_bounties"."id";
            SELECT setval('"game_character_bounties_id_seq"', COALESCE((SELECT MAX("id") FROM "game_character_bounties"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_classes_id_seq";
            ALTER TABLE "game_classes" ALTER COLUMN "id" SET DEFAULT nextval('"game_classes_id_seq"');
            ALTER SEQUENCE "game_classes_id_seq" OWNED BY "game_classes"."id";
            SELECT setval('"game_classes_id_seq"', COALESCE((SELECT MAX("id") FROM "game_classes"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_class_skills_id_seq";
            ALTER TABLE "game_class_skills" ALTER COLUMN "id" SET DEFAULT nextval('"game_class_skills_id_seq"');
            ALTER SEQUENCE "game_class_skills_id_seq" OWNED BY "game_class_skills"."id";
            SELECT setval('"game_class_skills_id_seq"', COALESCE((SELECT MAX("id") FROM "game_class_skills"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_colossus_raids_id_seq";
            ALTER TABLE "game_colossus_raids" ALTER COLUMN "id" SET DEFAULT nextval('"game_colossus_raids_id_seq"');
            ALTER SEQUENCE "game_colossus_raids_id_seq" OWNED BY "game_colossus_raids"."id";
            SELECT setval('"game_colossus_raids_id_seq"', COALESCE((SELECT MAX("id") FROM "game_colossus_raids"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_companion_affinity_tiers_id_seq";
            ALTER TABLE "game_companion_affinity_tiers" ALTER COLUMN "id" SET DEFAULT nextval('"game_companion_affinity_tiers_id_seq"');
            ALTER SEQUENCE "game_companion_affinity_tiers_id_seq" OWNED BY "game_companion_affinity_tiers"."id";
            SELECT setval('"game_companion_affinity_tiers_id_seq"', COALESCE((SELECT MAX("id") FROM "game_companion_affinity_tiers"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_craft_recipes_id_seq";
            ALTER TABLE "game_craft_recipes" ALTER COLUMN "id" SET DEFAULT nextval('"game_craft_recipes_id_seq"');
            ALTER SEQUENCE "game_craft_recipes_id_seq" OWNED BY "game_craft_recipes"."id";
            SELECT setval('"game_craft_recipes_id_seq"', COALESCE((SELECT MAX("id") FROM "game_craft_recipes"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_dm_campaigns_id_seq";
            ALTER TABLE "game_dm_campaigns" ALTER COLUMN "id" SET DEFAULT nextval('"game_dm_campaigns_id_seq"');
            ALTER SEQUENCE "game_dm_campaigns_id_seq" OWNED BY "game_dm_campaigns"."id";
            SELECT setval('"game_dm_campaigns_id_seq"', COALESCE((SELECT MAX("id") FROM "game_dm_campaigns"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_dm_campaign_players_id_seq";
            ALTER TABLE "game_dm_campaign_players" ALTER COLUMN "id" SET DEFAULT nextval('"game_dm_campaign_players_id_seq"');
            ALTER SEQUENCE "game_dm_campaign_players_id_seq" OWNED BY "game_dm_campaign_players"."id";
            SELECT setval('"game_dm_campaign_players_id_seq"', COALESCE((SELECT MAX("id") FROM "game_dm_campaign_players"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_dm_character_sheets_id_seq";
            ALTER TABLE "game_dm_character_sheets" ALTER COLUMN "id" SET DEFAULT nextval('"game_dm_character_sheets_id_seq"');
            ALTER SEQUENCE "game_dm_character_sheets_id_seq" OWNED BY "game_dm_character_sheets"."id";
            SELECT setval('"game_dm_character_sheets_id_seq"', COALESCE((SELECT MAX("id") FROM "game_dm_character_sheets"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_dm_session_log_id_seq";
            ALTER TABLE "game_dm_session_log" ALTER COLUMN "id" SET DEFAULT nextval('"game_dm_session_log_id_seq"');
            ALTER SEQUENCE "game_dm_session_log_id_seq" OWNED BY "game_dm_session_log"."id";
            SELECT setval('"game_dm_session_log_id_seq"', COALESCE((SELECT MAX("id") FROM "game_dm_session_log"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_elements_id_seq";
            ALTER TABLE "game_elements" ALTER COLUMN "id" SET DEFAULT nextval('"game_elements_id_seq"');
            ALTER SEQUENCE "game_elements_id_seq" OWNED BY "game_elements"."id";
            SELECT setval('"game_elements_id_seq"', COALESCE((SELECT MAX("id") FROM "game_elements"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_feats_id_seq";
            ALTER TABLE "game_feats" ALTER COLUMN "id" SET DEFAULT nextval('"game_feats_id_seq"');
            ALTER SEQUENCE "game_feats_id_seq" OWNED BY "game_feats"."id";
            SELECT setval('"game_feats_id_seq"', COALESCE((SELECT MAX("id") FROM "game_feats"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_forensic_cases_id_seq";
            ALTER TABLE "game_forensic_cases" ALTER COLUMN "id" SET DEFAULT nextval('"game_forensic_cases_id_seq"');
            ALTER SEQUENCE "game_forensic_cases_id_seq" OWNED BY "game_forensic_cases"."id";
            SELECT setval('"game_forensic_cases_id_seq"', COALESCE((SELECT MAX("id") FROM "game_forensic_cases"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_gathering_skills_id_seq";
            ALTER TABLE "game_gathering_skills" ALTER COLUMN "id" SET DEFAULT nextval('"game_gathering_skills_id_seq"');
            ALTER SEQUENCE "game_gathering_skills_id_seq" OWNED BY "game_gathering_skills"."id";
            SELECT setval('"game_gathering_skills_id_seq"', COALESCE((SELECT MAX("id") FROM "game_gathering_skills"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_items_id_seq";
            ALTER TABLE "game_items" ALTER COLUMN "id" SET DEFAULT nextval('"game_items_id_seq"');
            ALTER SEQUENCE "game_items_id_seq" OWNED BY "game_items"."id";
            SELECT setval('"game_items_id_seq"', COALESCE((SELECT MAX("id") FROM "game_items"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_limit_breaks_id_seq";
            ALTER TABLE "game_limit_breaks" ALTER COLUMN "id" SET DEFAULT nextval('"game_limit_breaks_id_seq"');
            ALTER SEQUENCE "game_limit_breaks_id_seq" OWNED BY "game_limit_breaks"."id";
            SELECT setval('"game_limit_breaks_id_seq"', COALESCE((SELECT MAX("id") FROM "game_limit_breaks"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_lottery_tickets_id_seq";
            ALTER TABLE "game_lottery_tickets" ALTER COLUMN "id" SET DEFAULT nextval('"game_lottery_tickets_id_seq"');
            ALTER SEQUENCE "game_lottery_tickets_id_seq" OWNED BY "game_lottery_tickets"."id";
            SELECT setval('"game_lottery_tickets_id_seq"', COALESCE((SELECT MAX("id") FROM "game_lottery_tickets"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_maps_id_seq";
            ALTER TABLE "game_maps" ALTER COLUMN "id" SET DEFAULT nextval('"game_maps_id_seq"');
            ALTER SEQUENCE "game_maps_id_seq" OWNED BY "game_maps"."id";
            SELECT setval('"game_maps_id_seq"', COALESCE((SELECT MAX("id") FROM "game_maps"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_map_drafts_id_seq";
            ALTER TABLE "game_map_drafts" ALTER COLUMN "id" SET DEFAULT nextval('"game_map_drafts_id_seq"');
            ALTER SEQUENCE "game_map_drafts_id_seq" OWNED BY "game_map_drafts"."id";
            SELECT setval('"game_map_drafts_id_seq"', COALESCE((SELECT MAX("id") FROM "game_map_drafts"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_map_ops_log_id_seq";
            ALTER TABLE "game_map_ops_log" ALTER COLUMN "id" SET DEFAULT nextval('"game_map_ops_log_id_seq"');
            ALTER SEQUENCE "game_map_ops_log_id_seq" OWNED BY "game_map_ops_log"."id";
            SELECT setval('"game_map_ops_log_id_seq"', COALESCE((SELECT MAX("id") FROM "game_map_ops_log"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_map_snapshots_id_seq";
            ALTER TABLE "game_map_snapshots" ALTER COLUMN "id" SET DEFAULT nextval('"game_map_snapshots_id_seq"');
            ALTER SEQUENCE "game_map_snapshots_id_seq" OWNED BY "game_map_snapshots"."id";
            SELECT setval('"game_map_snapshots_id_seq"', COALESCE((SELECT MAX("id") FROM "game_map_snapshots"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_map_spawn_zones_id_seq";
            ALTER TABLE "game_map_spawn_zones" ALTER COLUMN "id" SET DEFAULT nextval('"game_map_spawn_zones_id_seq"');
            ALTER SEQUENCE "game_map_spawn_zones_id_seq" OWNED BY "game_map_spawn_zones"."id";
            SELECT setval('"game_map_spawn_zones_id_seq"', COALESCE((SELECT MAX("id") FROM "game_map_spawn_zones"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_map_stamps_id_seq";
            ALTER TABLE "game_map_stamps" ALTER COLUMN "id" SET DEFAULT nextval('"game_map_stamps_id_seq"');
            ALTER SEQUENCE "game_map_stamps_id_seq" OWNED BY "game_map_stamps"."id";
            SELECT setval('"game_map_stamps_id_seq"', COALESCE((SELECT MAX("id") FROM "game_map_stamps"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_npcs_id_seq";
            ALTER TABLE "game_npcs" ALTER COLUMN "id" SET DEFAULT nextval('"game_npcs_id_seq"');
            ALTER SEQUENCE "game_npcs_id_seq" OWNED BY "game_npcs"."id";
            SELECT setval('"game_npcs_id_seq"', COALESCE((SELECT MAX("id") FROM "game_npcs"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_npc_relationships_id_seq";
            ALTER TABLE "game_npc_relationships" ALTER COLUMN "id" SET DEFAULT nextval('"game_npc_relationships_id_seq"');
            ALTER SEQUENCE "game_npc_relationships_id_seq" OWNED BY "game_npc_relationships"."id";
            SELECT setval('"game_npc_relationships_id_seq"', COALESCE((SELECT MAX("id") FROM "game_npc_relationships"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_npc_schedules_id_seq";
            ALTER TABLE "game_npc_schedules" ALTER COLUMN "id" SET DEFAULT nextval('"game_npc_schedules_id_seq"');
            ALTER SEQUENCE "game_npc_schedules_id_seq" OWNED BY "game_npc_schedules"."id";
            SELECT setval('"game_npc_schedules_id_seq"', COALESCE((SELECT MAX("id") FROM "game_npc_schedules"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_npc_stalker_dramas_id_seq";
            ALTER TABLE "game_npc_stalker_dramas" ALTER COLUMN "id" SET DEFAULT nextval('"game_npc_stalker_dramas_id_seq"');
            ALTER SEQUENCE "game_npc_stalker_dramas_id_seq" OWNED BY "game_npc_stalker_dramas"."id";
            SELECT setval('"game_npc_stalker_dramas_id_seq"', COALESCE((SELECT MAX("id") FROM "game_npc_stalker_dramas"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_objective_instances_id_seq";
            ALTER TABLE "game_objective_instances" ALTER COLUMN "id" SET DEFAULT nextval('"game_objective_instances_id_seq"');
            ALTER SEQUENCE "game_objective_instances_id_seq" OWNED BY "game_objective_instances"."id";
            SELECT setval('"game_objective_instances_id_seq"', COALESCE((SELECT MAX("id") FROM "game_objective_instances"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_oghams_id_seq";
            ALTER TABLE "game_oghams" ALTER COLUMN "id" SET DEFAULT nextval('"game_oghams_id_seq"');
            ALTER SEQUENCE "game_oghams_id_seq" OWNED BY "game_oghams"."id";
            SELECT setval('"game_oghams_id_seq"', COALESCE((SELECT MAX("id") FROM "game_oghams"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_ogham_families_id_seq";
            ALTER TABLE "game_ogham_families" ALTER COLUMN "id" SET DEFAULT nextval('"game_ogham_families_id_seq"');
            ALTER SEQUENCE "game_ogham_families_id_seq" OWNED BY "game_ogham_families"."id";
            SELECT setval('"game_ogham_families_id_seq"', COALESCE((SELECT MAX("id") FROM "game_ogham_families"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_party_modes_id_seq";
            ALTER TABLE "game_party_modes" ALTER COLUMN "id" SET DEFAULT nextval('"game_party_modes_id_seq"');
            ALTER SEQUENCE "game_party_modes_id_seq" OWNED BY "game_party_modes"."id";
            SELECT setval('"game_party_modes_id_seq"', COALESCE((SELECT MAX("id") FROM "game_party_modes"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_party_players_id_seq";
            ALTER TABLE "game_party_players" ALTER COLUMN "id" SET DEFAULT nextval('"game_party_players_id_seq"');
            ALTER SEQUENCE "game_party_players_id_seq" OWNED BY "game_party_players"."id";
            SELECT setval('"game_party_players_id_seq"', COALESCE((SELECT MAX("id") FROM "game_party_players"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_party_rooms_id_seq";
            ALTER TABLE "game_party_rooms" ALTER COLUMN "id" SET DEFAULT nextval('"game_party_rooms_id_seq"');
            ALTER SEQUENCE "game_party_rooms_id_seq" OWNED BY "game_party_rooms"."id";
            SELECT setval('"game_party_rooms_id_seq"', COALESCE((SELECT MAX("id") FROM "game_party_rooms"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_party_state_id_seq";
            ALTER TABLE "game_party_state" ALTER COLUMN "id" SET DEFAULT nextval('"game_party_state_id_seq"');
            ALTER SEQUENCE "game_party_state_id_seq" OWNED BY "game_party_state"."id";
            SELECT setval('"game_party_state_id_seq"', COALESCE((SELECT MAX("id") FROM "game_party_state"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_physical_shelves_id_seq";
            ALTER TABLE "game_physical_shelves" ALTER COLUMN "id" SET DEFAULT nextval('"game_physical_shelves_id_seq"');
            ALTER SEQUENCE "game_physical_shelves_id_seq" OWNED BY "game_physical_shelves"."id";
            SELECT setval('"game_physical_shelves_id_seq"', COALESCE((SELECT MAX("id") FROM "game_physical_shelves"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_player_armies_id_seq";
            ALTER TABLE "game_player_armies" ALTER COLUMN "id" SET DEFAULT nextval('"game_player_armies_id_seq"');
            ALTER SEQUENCE "game_player_armies_id_seq" OWNED BY "game_player_armies"."id";
            SELECT setval('"game_player_armies_id_seq"', COALESCE((SELECT MAX("id") FROM "game_player_armies"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_player_buildings_id_seq";
            ALTER TABLE "game_player_buildings" ALTER COLUMN "id" SET DEFAULT nextval('"game_player_buildings_id_seq"');
            ALTER SEQUENCE "game_player_buildings_id_seq" OWNED BY "game_player_buildings"."id";
            SELECT setval('"game_player_buildings_id_seq"', COALESCE((SELECT MAX("id") FROM "game_player_buildings"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_player_shopping_baskets_id_seq";
            ALTER TABLE "game_player_shopping_baskets" ALTER COLUMN "id" SET DEFAULT nextval('"game_player_shopping_baskets_id_seq"');
            ALTER SEQUENCE "game_player_shopping_baskets_id_seq" OWNED BY "game_player_shopping_baskets"."id";
            SELECT setval('"game_player_shopping_baskets_id_seq"', COALESCE((SELECT MAX("id") FROM "game_player_shopping_baskets"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_properties_id_seq";
            ALTER TABLE "game_properties" ALTER COLUMN "id" SET DEFAULT nextval('"game_properties_id_seq"');
            ALTER SEQUENCE "game_properties_id_seq" OWNED BY "game_properties"."id";
            SELECT setval('"game_properties_id_seq"', COALESCE((SELECT MAX("id") FROM "game_properties"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_property_stashes_id_seq";
            ALTER TABLE "game_property_stashes" ALTER COLUMN "id" SET DEFAULT nextval('"game_property_stashes_id_seq"');
            ALTER SEQUENCE "game_property_stashes_id_seq" OWNED BY "game_property_stashes"."id";
            SELECT setval('"game_property_stashes_id_seq"', COALESCE((SELECT MAX("id") FROM "game_property_stashes"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_property_trophies_id_seq";
            ALTER TABLE "game_property_trophies" ALTER COLUMN "id" SET DEFAULT nextval('"game_property_trophies_id_seq"');
            ALTER SEQUENCE "game_property_trophies_id_seq" OWNED BY "game_property_trophies"."id";
            SELECT setval('"game_property_trophies_id_seq"', COALESCE((SELECT MAX("id") FROM "game_property_trophies"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_quests_id_seq";
            ALTER TABLE "game_quests" ALTER COLUMN "id" SET DEFAULT nextval('"game_quests_id_seq"');
            ALTER SEQUENCE "game_quests_id_seq" OWNED BY "game_quests"."id";
            SELECT setval('"game_quests_id_seq"', COALESCE((SELECT MAX("id") FROM "game_quests"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_quest_defs_id_seq";
            ALTER TABLE "game_quest_defs" ALTER COLUMN "id" SET DEFAULT nextval('"game_quest_defs_id_seq"');
            ALTER SEQUENCE "game_quest_defs_id_seq" OWNED BY "game_quest_defs"."id";
            SELECT setval('"game_quest_defs_id_seq"', COALESCE((SELECT MAX("id") FROM "game_quest_defs"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_races_id_seq";
            ALTER TABLE "game_races" ALTER COLUMN "id" SET DEFAULT nextval('"game_races_id_seq"');
            ALTER SEQUENCE "game_races_id_seq" OWNED BY "game_races"."id";
            SELECT setval('"game_races_id_seq"', COALESCE((SELECT MAX("id") FROM "game_races"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_rules_id_seq";
            ALTER TABLE "game_rules" ALTER COLUMN "id" SET DEFAULT nextval('"game_rules_id_seq"');
            ALTER SEQUENCE "game_rules_id_seq" OWNED BY "game_rules"."id";
            SELECT setval('"game_rules_id_seq"', COALESCE((SELECT MAX("id") FROM "game_rules"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_ruleset_modifiers_id_seq";
            ALTER TABLE "game_ruleset_modifiers" ALTER COLUMN "id" SET DEFAULT nextval('"game_ruleset_modifiers_id_seq"');
            ALTER SEQUENCE "game_ruleset_modifiers_id_seq" OWNED BY "game_ruleset_modifiers"."id";
            SELECT setval('"game_ruleset_modifiers_id_seq"', COALESCE((SELECT MAX("id") FROM "game_ruleset_modifiers"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_safehouse_alembic_id_seq";
            ALTER TABLE "game_safehouse_alembic" ALTER COLUMN "id" SET DEFAULT nextval('"game_safehouse_alembic_id_seq"');
            ALTER SEQUENCE "game_safehouse_alembic_id_seq" OWNED BY "game_safehouse_alembic"."id";
            SELECT setval('"game_safehouse_alembic_id_seq"', COALESCE((SELECT MAX("id") FROM "game_safehouse_alembic"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_safehouse_dispatches_id_seq";
            ALTER TABLE "game_safehouse_dispatches" ALTER COLUMN "id" SET DEFAULT nextval('"game_safehouse_dispatches_id_seq"');
            ALTER SEQUENCE "game_safehouse_dispatches_id_seq" OWNED BY "game_safehouse_dispatches"."id";
            SELECT setval('"game_safehouse_dispatches_id_seq"', COALESCE((SELECT MAX("id") FROM "game_safehouse_dispatches"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_safehouse_runes_id_seq";
            ALTER TABLE "game_safehouse_runes" ALTER COLUMN "id" SET DEFAULT nextval('"game_safehouse_runes_id_seq"');
            ALTER SEQUENCE "game_safehouse_runes_id_seq" OWNED BY "game_safehouse_runes"."id";
            SELECT setval('"game_safehouse_runes_id_seq"', COALESCE((SELECT MAX("id") FROM "game_safehouse_runes"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_scheduled_tasks_id_seq";
            ALTER TABLE "game_scheduled_tasks" ALTER COLUMN "id" SET DEFAULT nextval('"game_scheduled_tasks_id_seq"');
            ALTER SEQUENCE "game_scheduled_tasks_id_seq" OWNED BY "game_scheduled_tasks"."id";
            SELECT setval('"game_scheduled_tasks_id_seq"', COALESCE((SELECT MAX("id") FROM "game_scheduled_tasks"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_skills_id_seq";
            ALTER TABLE "game_skills" ALTER COLUMN "id" SET DEFAULT nextval('"game_skills_id_seq"');
            ALTER SEQUENCE "game_skills_id_seq" OWNED BY "game_skills"."id";
            SELECT setval('"game_skills_id_seq"', COALESCE((SELECT MAX("id") FROM "game_skills"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_spawns_id_seq";
            ALTER TABLE "game_spawns" ALTER COLUMN "id" SET DEFAULT nextval('"game_spawns_id_seq"');
            ALTER SEQUENCE "game_spawns_id_seq" OWNED BY "game_spawns"."id";
            SELECT setval('"game_spawns_id_seq"', COALESCE((SELECT MAX("id") FROM "game_spawns"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_spells_id_seq";
            ALTER TABLE "game_spells" ALTER COLUMN "id" SET DEFAULT nextval('"game_spells_id_seq"');
            ALTER SEQUENCE "game_spells_id_seq" OWNED BY "game_spells"."id";
            SELECT setval('"game_spells_id_seq"', COALESCE((SELECT MAX("id") FROM "game_spells"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_statuses_id_seq";
            ALTER TABLE "game_statuses" ALTER COLUMN "id" SET DEFAULT nextval('"game_statuses_id_seq"');
            ALTER SEQUENCE "game_statuses_id_seq" OWNED BY "game_statuses"."id";
            SELECT setval('"game_statuses_id_seq"', COALESCE((SELECT MAX("id") FROM "game_statuses"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_subclasses_id_seq";
            ALTER TABLE "game_subclasses" ALTER COLUMN "id" SET DEFAULT nextval('"game_subclasses_id_seq"');
            ALTER SEQUENCE "game_subclasses_id_seq" OWNED BY "game_subclasses"."id";
            SELECT setval('"game_subclasses_id_seq"', COALESCE((SELECT MAX("id") FROM "game_subclasses"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_town_lottery_id_seq";
            ALTER TABLE "game_town_lottery" ALTER COLUMN "id" SET DEFAULT nextval('"game_town_lottery_id_seq"');
            ALTER SEQUENCE "game_town_lottery_id_seq" OWNED BY "game_town_lottery"."id";
            SELECT setval('"game_town_lottery_id_seq"', COALESCE((SELECT MAX("id") FROM "game_town_lottery"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "game_visual_scripts_id_seq";
            ALTER TABLE "game_visual_scripts" ALTER COLUMN "id" SET DEFAULT nextval('"game_visual_scripts_id_seq"');
            ALTER SEQUENCE "game_visual_scripts_id_seq" OWNED BY "game_visual_scripts"."id";
            SELECT setval('"game_visual_scripts_id_seq"', COALESCE((SELECT MAX("id") FROM "game_visual_scripts"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "gm_notes_id_seq";
            ALTER TABLE "gm_notes" ALTER COLUMN "id" SET DEFAULT nextval('"gm_notes_id_seq"');
            ALTER SEQUENCE "gm_notes_id_seq" OWNED BY "gm_notes"."id";
            SELECT setval('"gm_notes_id_seq"', COALESCE((SELECT MAX("id") FROM "gm_notes"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "staff_messages_id_seq";
            ALTER TABLE "staff_messages" ALTER COLUMN "id" SET DEFAULT nextval('"staff_messages_id_seq"');
            ALTER SEQUENCE "staff_messages_id_seq" OWNED BY "staff_messages"."id";
            SELECT setval('"staff_messages_id_seq"', COALESCE((SELECT MAX("id") FROM "staff_messages"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "system_settings_id_seq";
            ALTER TABLE "system_settings" ALTER COLUMN "id" SET DEFAULT nextval('"system_settings_id_seq"');
            ALTER SEQUENCE "system_settings_id_seq" OWNED BY "system_settings"."id";
            SELECT setval('"system_settings_id_seq"', COALESCE((SELECT MAX("id") FROM "system_settings"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "users_id_seq";
            ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT nextval('"users_id_seq"');
            ALTER SEQUENCE "users_id_seq" OWNED BY "users"."id";
            SELECT setval('"users_id_seq"', COALESCE((SELECT MAX("id") FROM "users"), 1));
        

            CREATE SEQUENCE IF NOT EXISTS "vision_radius_overrides_id_seq";
            ALTER TABLE "vision_radius_overrides" ALTER COLUMN "id" SET DEFAULT nextval('"vision_radius_overrides_id_seq"');
            ALTER SEQUENCE "vision_radius_overrides_id_seq" OWNED BY "vision_radius_overrides"."id";
            SELECT setval('"vision_radius_overrides_id_seq"', COALESCE((SELECT MAX("id") FROM "vision_radius_overrides"), 1));
        