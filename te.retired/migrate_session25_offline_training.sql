-- =================================================================
-- SESSION 25 — Offline Player Persistence + Spar/Train System
-- =================================================================


-- =================================================================
-- 1. OFFLINE PLAYER PERSISTENCE
-- =================================================================
-- Characters stay on the map when offline, shown as sleeping.
-- After X days inactive, vulnerable to attack/theft (Mado rule).

ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS is_offline_visible TINYINT(1) NOT NULL DEFAULT 1
        AFTER alignment
        COMMENT 'show on map when offline (sleeping)',
    ADD COLUMN IF NOT EXISTS last_seen DATETIME DEFAULT NULL
        AFTER is_offline_visible,
    ADD COLUMN IF NOT EXISTS presence_status VARCHAR(32) NOT NULL DEFAULT 'online'
        AFTER last_seen;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_offline_players',       'true'),
('offline_sleep_after_days',     '3'),
('offline_vulnerable_after_days','3'),
('offline_attack_bonus',         '0.30');


-- =================================================================
-- 2. SPAR / TRAINING SYSTEM
-- =================================================================

CREATE TABLE IF NOT EXISTS game_training_config (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL UNIQUE,
    label           VARCHAR(128) NOT NULL,
    description     TEXT         DEFAULT NULL,
    training_type   ENUM('self_train','spar','master_train','meditate') NOT NULL,
    stat_gains      JSON         NOT NULL COMMENT '{"max_hp":0.01,"atk":0.005} — % of base stat gained per session',
    stat_costs      JSON         DEFAULT NULL COMMENT '{"current_hp":0.01} — % of base stat lost per session (fatigue)',
    daily_limit     INT          NOT NULL DEFAULT 4 COMMENT 'max times per day',
    cooldown_minutes INT         NOT NULL DEFAULT 0 COMMENT 'minutes between sessions',
    requires_partner TINYINT(1)  NOT NULL DEFAULT 0 COMMENT 'spar requires another player',
    requires_master  TINYINT(1)  NOT NULL DEFAULT 0 COMMENT 'needs an NPC master',
    min_level       INT          NOT NULL DEFAULT 1,
    weighted_clothing_bonus FLOAT NOT NULL DEFAULT 0 COMMENT 'extra gain if wearing weighted gear',
    gravity_multiplier TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'gains multiplied by planet/room gravity',
    allowed_race_ids JSON DEFAULT NULL COMMENT 'array of race IDs that can use this, NULL = all races',
    allowed_class_ids JSON DEFAULT NULL COMMENT 'array of class IDs that can use this, NULL = all classes',
    active          TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Track training per character per day
CREATE TABLE IF NOT EXISTS character_training_log (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    character_id    INT          NOT NULL,
    training_type   VARCHAR(32)  NOT NULL,
    partner_char_id INT          DEFAULT NULL,
    master_npc_id   INT          DEFAULT NULL,
    stat_gains_json JSON         DEFAULT NULL,
    trained_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_char_day (character_id, trained_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_training_system',       'true');

-- Seed training types (Mado-inspired)
INSERT IGNORE INTO game_training_config (id, name, label, training_type, stat_gains, stat_costs, daily_limit, description) VALUES
(1, 'self_train',   'Self Training',    'self_train',
   '{"max_hp":0.005,"atk":0.003,"def":0.003,"speed":0.002}',
   '{"current_hp":0.01}',
   4, 'Train alone. Modest gains, costs stamina. Available anywhere.'),
(2, 'spar',         'Spar',             'spar',
   '{"max_hp":0.01,"atk":0.005,"def":0.005,"speed":0.004}',
   '{"current_hp":0.01}',
   3, 'Spar with another player. Both gain stats. Must be nearby.'),
(3, 'master_train', 'Train Under Master','master_train',
   '{"max_hp":0.02,"atk":0.008,"def":0.008,"mo":0.008,"md":0.008,"speed":0.005}',
   '{"current_hp":0.015}',
   3, 'Train under an NPC master. Best gains, but master must be stronger than you.'),
(4, 'meditate',     'Meditate',         'meditate',
   '{"max_hp":0.003,"mo":0.005,"md":0.005,"current_hp":0.01}',
   NULL,
   3, 'Meditate to restore and grow. No stamina cost. Heals while training. Race-restricted by default — configure allowed_race_ids in AdminSauce.');

-- Spar request command (player-to-player)
INSERT IGNORE INTO game_battle_commands (id, name, description, icon, effects, is_defense, defense_type, sort_order) VALUES
(21, 'Spar', 'Request a friendly spar with a nearby player.', '🤝',
 '{"spar":true}', 0, NULL, 21);
