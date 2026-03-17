-- =================================================================
-- MIGRATION v10: New columns added after v9
-- Run this ONCE against your existing database.
-- Safe to run multiple times (uses IF NOT EXISTS).
-- =================================================================

-- Tileset support (step 7)
ALTER TABLE game_maps
    ADD COLUMN IF NOT EXISTS tileset_url VARCHAR(500) DEFAULT NULL
    COMMENT 'URL to tileset image file (32x32 tiles, left-to-right top-to-bottom)';

-- Objects layer + ambient lighting (step 8)
ALTER TABLE game_maps
    ADD COLUMN IF NOT EXISTS objects_json MEDIUMTEXT DEFAULT NULL
    COMMENT 'Array of placed objects: [{x,y,preset,icon,label,type,blocking,light:{radius,color,flicker},flagKey}]';

ALTER TABLE game_maps
    ADD COLUMN IF NOT EXISTS ambient_dark FLOAT DEFAULT 0
    COMMENT 'Darkness level 0.0 (fully lit) to 1.0 (pitch black)';

-- Animated tiles (step 9)
ALTER TABLE game_maps
    ADD COLUMN IF NOT EXISTS anims_json MEDIUMTEXT DEFAULT NULL
    COMMENT 'Array of tile animations: [{trigger:<tileIndex>, frames:[idx,...], fps:<number>}]';

-- NPC enemy system (step 6 era)
ALTER TABLE game_npcs
    ADD COLUMN IF NOT EXISTS is_enemy TINYINT(1) DEFAULT 0
    COMMENT '1 = this NPC is a battle enemy';

ALTER TABLE game_npcs
    ADD COLUMN IF NOT EXISTS char_id INT DEFAULT NULL
    COMMENT 'Links to characters.id — combat stats for enemy NPCs';
