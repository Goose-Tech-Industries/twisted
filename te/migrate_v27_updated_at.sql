-- =================================================================
-- MIGRATION v27b — Add updated_at to characters table
-- Safe to run multiple times (uses IF NOT EXISTS pattern via MariaDB/MySQL 10.x+)
-- Run: mysql -u twisted_user -p twisted_rpg < migrate_v27_updated_at.sql
-- =================================================================
--
-- TEACHING: Several queries (fast-travel, achievement profile viewer)
-- used ORDER BY updated_at which didn't exist, causing crashes.
-- v27 hotfix changed those queries to ORDER BY id DESC, which works
-- because new characters always have higher IDs. But updated_at is
-- genuinely useful for "most recently played" sorting, so we add it
-- here for future use. ON UPDATE CURRENT_TIMESTAMP means MySQL
-- automatically updates this column whenever any field on the row
-- changes — no application code needed.
-- =================================================================

ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- Back-fill existing rows so updated_at = created_at (not NULL)
UPDATE characters SET updated_at = created_at WHERE updated_at IS NULL;

SELECT 'characters.updated_at added ✅' AS result;
