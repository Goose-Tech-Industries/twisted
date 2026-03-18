-- =================================================================
-- Session 7: NPC Companions — Database Migration
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS column)
-- =================================================================

-- New table: tracks recruited NPC companions per player character
CREATE TABLE IF NOT EXISTS character_companions (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,       -- the player who recruited this companion
    npc_id          INT UNSIGNED NOT NULL,       -- references game_npcs.id
    recruited_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,  -- 1 = in party, 0 = dismissed/benched
    tactics         ENUM('AGGRESSIVE','BALANCED','DEFENSIVE','SUPPORT') NOT NULL DEFAULT 'BALANCED',
    UNIQUE KEY uq_char_npc (character_id, npc_id),
    KEY idx_char_active (character_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add recruitability columns to game_npcs
ALTER TABLE game_npcs
    ADD COLUMN IF NOT EXISTS is_recruitable     TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS recruit_rep_req    INT NOT NULL DEFAULT 50,
    ADD COLUMN IF NOT EXISTS recruit_quest_req  INT UNSIGNED DEFAULT NULL;
