-- =================================================================
-- CONSTRAINT FIX — SAFE MIGRATION FOR EXISTING INSTALLS
-- Run this if you already ran mysql_guild_trade_SAFE.sql or
-- mysql_party_friends_SAFE.sql. Safe to re-run.
--
-- Problem: The original migrations created UNIQUE KEY on
-- (character_id, is_active). This allows only ONE inactive row
-- per character — so a player who joins a guild, leaves, then
-- joins another guild crashes with a duplicate key error on the
-- second leave (two rows with is_active=0).
--
-- Fix: Change the unique key to (character_id, guild_id) /
-- (character_id, party_id). This correctly enforces "one record
-- per character per guild/party" while allowing multiple
-- inactive history rows across different guilds/parties.
--
-- The ON DUPLICATE KEY UPDATE logic in server.js works correctly
-- with this constraint: rejoining the same guild updates the
-- existing row rather than inserting a new one.
-- =================================================================

-- ── guild_members ─────────────────────────────────────────────
-- Only run if the old wrong constraint exists
SET @guild_constraint = (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'guild_members'
      AND INDEX_NAME   = 'uq_active_member'
      AND COLUMN_NAME  = 'is_active'
);

-- Drop the bad constraint if present
SET @drop_guild = IF(@guild_constraint > 0,
    'ALTER TABLE guild_members DROP INDEX uq_active_member',
    'SELECT 1'
);
PREPARE stmt FROM @drop_guild;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add the correct constraint (if not already correct)
SET @guild_correct = (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'guild_members'
      AND INDEX_NAME   = 'uq_active_member'
      AND COLUMN_NAME  = 'guild_id'
);

SET @add_guild = IF(@guild_correct = 0,
    'ALTER TABLE guild_members ADD UNIQUE KEY uq_active_member (character_id, guild_id)',
    'SELECT 1'
);
PREPARE stmt FROM @add_guild;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── character_party_members ────────────────────────────────────
SET @party_constraint = (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'character_party_members'
      AND INDEX_NAME   = 'uq_active_member'
      AND COLUMN_NAME  = 'is_active'
);

SET @drop_party = IF(@party_constraint > 0,
    'ALTER TABLE character_party_members DROP INDEX uq_active_member',
    'SELECT 1'
);
PREPARE stmt FROM @drop_party;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @party_correct = (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'character_party_members'
      AND INDEX_NAME   = 'uq_active_member'
      AND COLUMN_NAME  = 'party_id'
);

SET @add_party = IF(@party_correct = 0,
    'ALTER TABLE character_party_members ADD UNIQUE KEY uq_active_member (character_id, party_id)',
    'SELECT 1'
);
PREPARE stmt FROM @add_party;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Constraint fix complete.' AS status;
