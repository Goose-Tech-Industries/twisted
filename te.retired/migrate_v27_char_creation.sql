-- =================================================================
-- MIGRATION v27 — Character Creation System Expansion
-- Safe to run multiple times (uses IF NOT EXISTS / IGNORE patterns)
-- Run: mysql -u twisted_user -p twisted_rpg < migrate_v27_char_creation.sql
-- =================================================================

-- ── game_races ────────────────────────────────────────────────────
ALTER TABLE game_races
    ADD COLUMN IF NOT EXISTS icon            VARCHAR(8)   DEFAULT '🧬'   AFTER description,
    ADD COLUMN IF NOT EXISTS lore            TEXT                          AFTER icon,
    ADD COLUMN IF NOT EXISTS passive_ability VARCHAR(64)  DEFAULT NULL    AFTER bonus_luck,
    ADD COLUMN IF NOT EXISTS passive_desc    VARCHAR(255) DEFAULT NULL    AFTER passive_ability;

-- ── game_feats ────────────────────────────────────────────────────
-- Old schema only had name, description, effect_json.
-- Add icon and type for the new manager.
ALTER TABLE game_feats
    ADD COLUMN IF NOT EXISTS icon VARCHAR(8) DEFAULT '🎯' AFTER description,
    ADD COLUMN IF NOT EXISTS type VARCHAR(32) DEFAULT 'passive' AFTER icon;

-- ── game_backgrounds ─────────────────────────────────────────────
-- Old schema only had bonus_hp, bonus_mp, bonus_str.
-- Add the full stat column set to match races and classes.
ALTER TABLE game_backgrounds
    ADD COLUMN IF NOT EXISTS icon        VARCHAR(8)   DEFAULT '📖' AFTER description,
    ADD COLUMN IF NOT EXISTS lore        TEXT                       AFTER icon,
    ADD COLUMN IF NOT EXISTS bonus_atk   INT NOT NULL DEFAULT 0     AFTER bonus_mp,
    ADD COLUMN IF NOT EXISTS bonus_def   INT NOT NULL DEFAULT 0     AFTER bonus_atk,
    ADD COLUMN IF NOT EXISTS bonus_mo    INT NOT NULL DEFAULT 0     AFTER bonus_def,
    ADD COLUMN IF NOT EXISTS bonus_md    INT NOT NULL DEFAULT 0     AFTER bonus_mo,
    ADD COLUMN IF NOT EXISTS bonus_speed INT NOT NULL DEFAULT 0     AFTER bonus_md,
    ADD COLUMN IF NOT EXISTS bonus_luck  INT NOT NULL DEFAULT 0     AFTER bonus_speed;

-- ── game_classes ─────────────────────────────────────────────────
-- Already has all stat columns. Add sort_order if missing (older installs).
ALTER TABLE game_classes
    ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0 AFTER hidden;

-- ── Verify ───────────────────────────────────────────────────────
SELECT 'game_races columns:' AS info;
SHOW COLUMNS FROM game_races;

SELECT 'game_feats columns:' AS info;
SHOW COLUMNS FROM game_feats;

SELECT 'game_backgrounds columns:' AS info;
SHOW COLUMNS FROM game_backgrounds;

SELECT 'Migration v27 complete ✅' AS result;
