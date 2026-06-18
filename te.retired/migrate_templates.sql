-- =================================================================
-- TEMPLATE PACK SYSTEM — Pre-built game worlds
-- =================================================================

CREATE TABLE IF NOT EXISTS game_templates (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL UNIQUE,
    label           VARCHAR(128) NOT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
    description     TEXT         DEFAULT NULL,
    preview_image   VARCHAR(255) DEFAULT NULL,
    author          VARCHAR(128) DEFAULT 'Twisted Engine',
    version         VARCHAR(16)  DEFAULT '1.0',
    -- What the template includes
    terminology_json JSON        DEFAULT NULL COMMENT 'overrides for game_terminology',
    settings_json   JSON         DEFAULT NULL COMMENT 'overrides for system_settings',
    classes_json    JSON         DEFAULT NULL COMMENT 'array of class definitions',
    races_json      JSON         DEFAULT NULL COMMENT 'array of race definitions',
    items_json      JSON         DEFAULT NULL COMMENT 'starter items',
    skills_json     JSON         DEFAULT NULL COMMENT 'starter skills',
    maps_json       JSON         DEFAULT NULL COMMENT 'starter maps with tiles/events',
    npcs_json       JSON         DEFAULT NULL COMMENT 'starter NPCs',
    quests_json     JSON         DEFAULT NULL COMMENT 'starter quests',
    battle_config_json JSON      DEFAULT NULL COMMENT 'which battle features to enable/disable',
    styles_json     JSON         DEFAULT NULL COMMENT 'fighting styles for this theme',
    -- Meta
    is_default      TINYINT(1)   NOT NULL DEFAULT 0,
    installed       TINYINT(1)   NOT NULL DEFAULT 0,
    installed_at    DATETIME     DEFAULT NULL,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Track which template is active
INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('active_template', 'celtic_fantasy'),
('template_installed', 'false');
