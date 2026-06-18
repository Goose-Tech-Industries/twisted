-- ================================================================
-- Migration v28: Schema documentation catch-up
-- All tables/columns below already exist in the live database.
-- This file documents them for schema_FULL.sql parity.
-- Safe to re-run (all CREATE IF NOT EXISTS / ADD IF NOT EXISTS).
-- ================================================================

-- ── Users table: add referral & invite columns ─────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS invite_code      VARCHAR(16)  NULL AFTER login_streak,
  ADD COLUMN IF NOT EXISTS referred_by      INT UNSIGNED NULL AFTER invite_code,
  ADD COLUMN IF NOT EXISTS referral_code    VARCHAR(16)  NULL AFTER referred_by,
  ADD COLUMN IF NOT EXISTS referral_count   INT UNSIGNED NOT NULL DEFAULT 0 AFTER referral_code,
  ADD COLUMN IF NOT EXISTS referred_by_code VARCHAR(16)  NULL AFTER referral_count;

ALTER TABLE users
  ADD UNIQUE INDEX IF NOT EXISTS idx_users_invite_code (invite_code),
  ADD INDEX IF NOT EXISTS idx_users_referral_code (referral_code);

-- ── Referrals table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS game_referrals (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    referrer_user_id  INT UNSIGNED NOT NULL,
    referred_user_id  INT UNSIGNED NOT NULL,
    referral_code     VARCHAR(16)  NOT NULL,
    status            ENUM('pending','qualified','rewarded','expired') NOT NULL DEFAULT 'pending',
    referred_level    INT UNSIGNED NULL,
    qualified_at      DATETIME     NULL,
    reward_gold       INT UNSIGNED NULL,
    reward_item_id    INT UNSIGNED NULL,
    rewarded_at       DATETIME     NULL,
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_referrals_referrer (referrer_user_id),
    INDEX idx_referrals_referred (referred_user_id),
    UNIQUE INDEX idx_referrals_referred_unique (referred_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Ability Score System ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS game_ability_scores (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    key_name    VARCHAR(32)  NOT NULL UNIQUE,
    name        VARCHAR(64)  NOT NULL,
    description TEXT,
    icon        VARCHAR(8)   DEFAULT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    min_value   INT NOT NULL DEFAULT 8,
    max_value   INT NOT NULL DEFAULT 15,
    default_val INT NOT NULL DEFAULT 10
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default D&D-style ability scores
INSERT IGNORE INTO game_ability_scores (key_name, name, description, icon, sort_order, min_value, max_value, default_val) VALUES
('str', 'Strength',     'Physical power and carrying capacity',        NULL, 1, 8, 15, 10),
('dex', 'Dexterity',    'Agility, reflexes, and balance',              NULL, 2, 8, 15, 10),
('con', 'Constitution', 'Health, stamina, and vital force',            NULL, 3, 8, 15, 10),
('int', 'Intelligence', 'Reasoning, memory, and analytical skill',     NULL, 4, 8, 15, 10),
('wis', 'Wisdom',       'Awareness, intuition, and insight',           NULL, 5, 8, 15, 10),
('cha', 'Charisma',     'Force of personality and leadership',         NULL, 6, 8, 15, 10);

CREATE TABLE IF NOT EXISTS game_ability_effects (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ability_id   INT UNSIGNED NOT NULL,
    stat_key     VARCHAR(32)  NOT NULL,
    formula      VARCHAR(128) NOT NULL DEFAULT 'floor((value - 10) / 2)',
    description  TEXT,
    INDEX idx_ability_effects_ability (ability_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_race_ability_bonuses (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    race_id     INT UNSIGNED NOT NULL,
    ability_id  INT UNSIGNED NOT NULL,
    bonus       INT NOT NULL DEFAULT 0,
    INDEX idx_rab_race (race_id),
    UNIQUE INDEX idx_rab_unique (race_id, ability_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_class_ability_bonuses (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    class_id    INT UNSIGNED NOT NULL,
    ability_id  INT UNSIGNED NOT NULL,
    bonus       INT NOT NULL DEFAULT 0,
    INDEX idx_cab_class (class_id),
    UNIQUE INDEX idx_cab_unique (class_id, ability_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_background_ability_bonuses (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    background_id   INT UNSIGNED NOT NULL,
    ability_id      INT UNSIGNED NOT NULL,
    bonus           INT NOT NULL DEFAULT 0,
    INDEX idx_bab_bg (background_id),
    UNIQUE INDEX idx_bab_unique (background_id, ability_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_race_class_access (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    race_id     INT UNSIGNED NOT NULL,
    class_id    INT UNSIGNED NOT NULL,
    allowed     TINYINT(1)   NOT NULL DEFAULT 1,
    UNIQUE INDEX idx_rca_unique (race_id, class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Character Ability Scores (per-character) ───────────────────

CREATE TABLE IF NOT EXISTS character_ability_scores (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    ability_key     VARCHAR(32)  NOT NULL,
    base_value      INT NOT NULL DEFAULT 10,
    bonus_value     INT NOT NULL DEFAULT 0,
    INDEX idx_cas_char (character_id),
    UNIQUE INDEX idx_cas_unique (character_id, ability_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Titles table (if not already created) ──────────────────────

CREATE TABLE IF NOT EXISTS game_titles (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(64)  NOT NULL,
    description TEXT,
    rarity      ENUM('common','uncommon','rare','epic','legendary') DEFAULT 'common',
    hidden      TINYINT(1) NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Done ───────────────────────────────────────────────────────
