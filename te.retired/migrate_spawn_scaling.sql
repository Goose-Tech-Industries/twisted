-- =================================================================
-- SPAWN ZONE SCHEMA UPDATE + ENEMY SCALING
-- =================================================================

-- Extend game_map_spawns with zone-based fields the server already expects
ALTER TABLE game_map_spawns
    ADD COLUMN IF NOT EXISTS name VARCHAR(128) DEFAULT NULL AFTER map_id,
    ADD COLUMN IF NOT EXISTS x_min INT NOT NULL DEFAULT 0 AFTER name,
    ADD COLUMN IF NOT EXISTS y_min INT NOT NULL DEFAULT 0 AFTER x_min,
    ADD COLUMN IF NOT EXISTS x_max INT NOT NULL DEFAULT 19 AFTER y_min,
    ADD COLUMN IF NOT EXISTS y_max INT NOT NULL DEFAULT 19 AFTER x_max,
    ADD COLUMN IF NOT EXISTS encounter_rate INT NOT NULL DEFAULT 10 AFTER y_max,
    ADD COLUMN IF NOT EXISTS encounter_table JSON DEFAULT NULL AFTER encounter_rate,
    ADD COLUMN IF NOT EXISTS min_level INT NOT NULL DEFAULT 1 AFTER encounter_table,
    ADD COLUMN IF NOT EXISTS max_level INT NOT NULL DEFAULT 99 AFTER min_level,
    ADD COLUMN IF NOT EXISTS required_flag VARCHAR(128) DEFAULT NULL AFTER max_level,
    ADD COLUMN IF NOT EXISTS scaling_factor FLOAT NOT NULL DEFAULT 0.3 AFTER required_flag;

-- Add scaling to arenas too
ALTER TABLE game_arenas
    ADD COLUMN IF NOT EXISTS scaling_factor FLOAT NOT NULL DEFAULT 0.3 AFTER enabled,
    ADD COLUMN IF NOT EXISTS allow_mid_battle_join TINYINT(1) NOT NULL DEFAULT 0 AFTER scaling_factor,
    ADD COLUMN IF NOT EXISTS allow_free_for_all TINYINT(1) NOT NULL DEFAULT 0 AFTER allow_mid_battle_join,
    ADD COLUMN IF NOT EXISTS allow_diplomacy TINYINT(1) NOT NULL DEFAULT 0 AFTER allow_free_for_all,
    ADD COLUMN IF NOT EXISTS allow_surrender TINYINT(1) NOT NULL DEFAULT 1 AFTER allow_diplomacy,
    ADD COLUMN IF NOT EXISTS allow_battle_chat TINYINT(1) NOT NULL DEFAULT 1 AFTER allow_surrender,
    ADD COLUMN IF NOT EXISTS max_teams INT NOT NULL DEFAULT 2 AFTER allow_battle_chat,
    ADD COLUMN IF NOT EXISTS max_combatants INT NOT NULL DEFAULT 8 AFTER max_teams;

-- Global default scaling in system_settings
INSERT IGNORE INTO system_settings (setting_key, setting_value)
VALUES ('enemy_scaling_factor', '0.3');
