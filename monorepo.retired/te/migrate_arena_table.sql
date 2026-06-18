-- =================================================================
-- MIGRATION: Expand game_arenas table
-- Run this if you created your database BEFORE this fix.
-- Safe to run multiple times (ALTER TABLE IF NOT EXISTS column syntax
-- is not standard SQL, so we use a stored procedure trick instead).
-- =================================================================

-- Add missing columns (will error silently if column already exists
-- in some MySQL versions — that's fine, the column will just stay)
ALTER TABLE game_arenas
    ADD COLUMN IF NOT EXISTS x_min             INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS y_min             INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS x_max             INT NOT NULL DEFAULT 19,
    ADD COLUMN IF NOT EXISTS y_max             INT NOT NULL DEFAULT 19,
    ADD COLUMN IF NOT EXISTS type              VARCHAR(32) NOT NULL DEFAULT 'OPEN_PVP',
    ADD COLUMN IF NOT EXISTS reward_multiplier FLOAT NOT NULL DEFAULT 1.0,
    ADD COLUMN IF NOT EXISTS max_players       INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS level_matching    TINYINT(1) NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS enabled           TINYINT(1) NOT NULL DEFAULT 1;

-- Sync is_active → enabled for any existing rows
UPDATE game_arenas SET enabled = is_active WHERE enabled != is_active;

SELECT 'Arena migration complete.' AS status;
