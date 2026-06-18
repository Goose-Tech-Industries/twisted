-- =============================================================
-- MIGRATION: Create missing tables referenced by admin routes
-- =============================================================
-- These tables are referenced in admin-entities.js and
-- admin-settings.js but were never created.
-- =============================================================

-- Loot Tables — defines loot drop pools for enemies/bosses
CREATE TABLE IF NOT EXISTS game_loot_tables (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    min_items       INT UNSIGNED NOT NULL DEFAULT 1,
    max_items       INT UNSIGNED NOT NULL DEFAULT 3,
    entries_json    JSON DEFAULT NULL,       -- array of { item_id, weight, min_qty, max_qty }
    level_min       INT UNSIGNED NOT NULL DEFAULT 0,
    level_max       INT UNSIGNED NOT NULL DEFAULT 999,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Templates — reusable entity templates (NPC presets, encounter groups, etc.)
CREATE TABLE IF NOT EXISTS game_templates (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    type            VARCHAR(32) NOT NULL DEFAULT 'generic',  -- npc, encounter, item_set, etc.
    description     TEXT,
    data_json       JSON DEFAULT NULL,       -- template payload
    tags            VARCHAR(255) DEFAULT NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Dice Tables — random roll tables (loot, encounter, event outcomes)
CREATE TABLE IF NOT EXISTS game_dice_tables (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    dice_formula    VARCHAR(32) DEFAULT '1d100',  -- e.g. 1d6, 2d10, 1d100
    entries_json    JSON DEFAULT NULL,       -- array of { min, max, result, weight }
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Admin Activity Log — audit trail for admin/GM actions
CREATE TABLE IF NOT EXISTS admin_activity_log (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED DEFAULT NULL,
    username        VARCHAR(64) DEFAULT NULL,
    action          VARCHAR(64) NOT NULL,       -- create, update, delete, etc.
    entity_type     VARCHAR(64) DEFAULT NULL,
    entity_id       INT UNSIGNED DEFAULT NULL,
    details         TEXT DEFAULT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_activity_user (user_id),
    INDEX idx_activity_action (action),
    INDEX idx_activity_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Admin Role Sections — controls which admin panel sections each role can access
CREATE TABLE IF NOT EXISTS admin_role_sections (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    role            VARCHAR(32) NOT NULL UNIQUE,  -- admin, gm, moderator, etc.
    allowed_sections JSON DEFAULT NULL,            -- array of section names
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
