-- =================================================================
-- SESSIONS 17-22 — Final Combat Features
-- Weather, Stealth/Ambush, Dual/Link Attacks, Transform/Power-up,
-- Revive + Traps, Spectator Mode
-- =================================================================


-- =================================================================
-- SESSION 17: WEATHER EFFECTS
-- =================================================================

CREATE TABLE IF NOT EXISTS game_weather_effects (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL UNIQUE,
    label           VARCHAR(128) NOT NULL,
    icon            VARCHAR(16)  DEFAULT '🌤️',
    description     TEXT         DEFAULT NULL,
    combat_effects  JSON         NOT NULL COMMENT '{"fire_damage":-0.20,"ice_damage":0.15,"ranged_accuracy":-0.10,"speed":-0.05}',
    terrain_override VARCHAR(32) DEFAULT NULL COMMENT 'if set, all open tiles become this terrain',
    visibility      FLOAT        NOT NULL DEFAULT 1.0 COMMENT '1.0=full, 0.5=fog, 0.2=blizzard',
    active          TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_weather_effects (id, name, label, icon, description, combat_effects, terrain_override, visibility) VALUES
(1, 'clear',    'Clear Skies',  '☀️', 'No weather effects.',           '{}', NULL, 1.0),
(2, 'rain',     'Rain',         '🌧️', 'Fire damage reduced. Water tiles spread.', '{"fire_damage":-0.30,"lightning_damage":0.20,"ranged_accuracy":-0.05}', NULL, 0.8),
(3, 'storm',    'Thunderstorm', '⛈️', 'Lightning empowered. Ranged suffers.', '{"lightning_damage":0.30,"ranged_accuracy":-0.15,"fire_damage":-0.20}', NULL, 0.6),
(4, 'fog',      'Dense Fog',    '🌫️', 'Visibility reduced. Ranged accuracy drops.', '{"ranged_accuracy":-0.25,"dodge_bonus":0.10}', NULL, 0.4),
(5, 'snow',     'Snowfall',     '❄️', 'Ice empowered. Speed reduced.',  '{"ice_damage":0.20,"speed":-0.10,"fire_damage":-0.10}', NULL, 0.7),
(6, 'sandstorm','Sandstorm',    '🏜️', 'Earth empowered. Accuracy drops for all.', '{"earth_damage":0.20,"ranged_accuracy":-0.20,"accuracy":-0.10}', NULL, 0.3),
(7, 'blood_moon','Blood Moon',  '🌑', 'Dark empowered. Crit chance up for all.', '{"dark_damage":0.25,"crit_bonus":0.05,"heal_reduction":-0.15}', NULL, 0.8);

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_weather_effects', 'true');


-- =================================================================
-- SESSION 18: STEALTH / AMBUSH
-- =================================================================

ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS stealth_level INT NOT NULL DEFAULT 0 AFTER spell_slots_json;

ALTER TABLE game_skills
    ADD COLUMN IF NOT EXISTS is_stealth_skill TINYINT(1) NOT NULL DEFAULT 0 AFTER spell_slot_level,
    ADD COLUMN IF NOT EXISTS stealth_bonus FLOAT NOT NULL DEFAULT 0 AFTER is_stealth_skill
        COMMENT 'bonus damage multiplier when used from stealth (0.50 = +50%)';

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_stealth',              'true'),
('stealth_surprise_bonus',      '0.50'),
('stealth_first_strike',        'true'),
('stealth_detection_formula',   'SPEED+LUCK*0.5-ENEMY_SPEED');

-- Stealth command
INSERT IGNORE INTO game_battle_commands (id, name, description, icon, effects, is_defense, defense_type, sort_order) VALUES
(18, 'Stealth', 'Attempt to hide. Next attack from stealth deals bonus damage.', '🥷',
 '{"stealth":true}', 0, NULL, 18);


-- =================================================================
-- SESSION 19: DUAL / LINK ATTACKS
-- =================================================================

CREATE TABLE IF NOT EXISTS game_link_attacks (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    icon            VARCHAR(16)  DEFAULT '🤝',
    description     TEXT         DEFAULT NULL,
    initiator_class_id INT      DEFAULT NULL COMMENT 'class that starts the combo (NULL = any)',
    partner_class_id   INT      DEFAULT NULL COMMENT 'class that joins (NULL = any)',
    initiator_skill_id INT      DEFAULT NULL COMMENT 'skill the initiator must use to trigger',
    damage_formula  VARCHAR(255) NOT NULL DEFAULT 'ATK*2+PARTNER_ATK*2',
    element         VARCHAR(32)  DEFAULT NULL,
    effects         JSON         DEFAULT NULL,
    battle_text     TEXT         DEFAULT NULL,
    min_affinity    INT          NOT NULL DEFAULT 0 COMMENT 'minimum partner affinity to trigger',
    cooldown_turns  INT          NOT NULL DEFAULT 3,
    active          TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Track affinity between characters (builds through fighting together)
ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS affinity_json JSON DEFAULT NULL AFTER stealth_level
        COMMENT '{"charId":affinity_points} — builds when fighting alongside someone';

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_link_attacks',         'true'),
('link_attack_affinity_per_battle', '5');


-- =================================================================
-- SESSION 20: TRANSFORM / POWER-UP
-- =================================================================

CREATE TABLE IF NOT EXISTS game_transformations (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    icon            VARCHAR(16)  DEFAULT '⭐',
    description     TEXT         DEFAULT NULL,
    class_id        INT          DEFAULT NULL COMMENT 'class-locked (NULL = any class)',
    race_id         INT          DEFAULT NULL COMMENT 'race-locked (NULL = any race)',
    trigger_type    ENUM('manual','hp_threshold','limit_full','turn_count') NOT NULL DEFAULT 'manual',
    trigger_value   FLOAT        DEFAULT NULL COMMENT 'hp_pct threshold, turn number, etc.',
    duration        INT          NOT NULL DEFAULT 5 COMMENT 'turns the transform lasts (0 = permanent until battle ends)',
    stat_multipliers JSON        NOT NULL COMMENT '{"atk":1.5,"speed":1.3,"def":0.8} — multiplied onto stats',
    grant_skill_ids JSON         DEFAULT NULL COMMENT 'skills available only while transformed',
    remove_skill_ids JSON        DEFAULT NULL COMMENT 'skills removed while transformed',
    visual_effects  JSON         DEFAULT NULL COMMENT '{"aura":"fire","color":"oklch(0.60_0.25_25)","size":1.2}',
    battle_text     TEXT         DEFAULT NULL,
    mp_cost         INT          NOT NULL DEFAULT 0,
    hp_cost_pct     FLOAT        NOT NULL DEFAULT 0,
    cooldown_battles INT         NOT NULL DEFAULT 0 COMMENT '0 = once per battle, N = every N battles',
    level_required  INT          NOT NULL DEFAULT 1,
    active          TINYINT(1)   NOT NULL DEFAULT 1,
    INDEX idx_class (class_id),
    INDEX idx_race (race_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_transformations', 'true');

-- Transform command
INSERT IGNORE INTO game_battle_commands (id, name, description, icon, effects, is_defense, defense_type, sort_order) VALUES
(19, 'Transform', 'Unleash your inner power!', '⭐',
 '{"transform":true}', 0, NULL, 19);

-- Seed example transformations
INSERT IGNORE INTO game_transformations (id, name, icon, description, trigger_type, duration, stat_multipliers, battle_text, level_required) VALUES
(1, 'Berserker Fury',  '🔥', 'Sacrifice defense for overwhelming attack power.', 'manual', 5,
    '{"atk":1.5,"speed":1.3,"def":0.7}', '{name} roars with primal fury — their body surges with power!', 5),
(2, 'Fae Form',        '🧚', 'Channel the Otherworld. Magic amplified, body ethereal.', 'manual', 4,
    '{"mo":1.6,"md":1.4,"speed":1.2,"atk":0.6,"def":0.5}', '{name} shimmers and becomes half-light — the Fae Form awakens!', 10),
(3, 'Stone Skin',      '🗿', 'Become nearly invulnerable but unable to move.', 'manual', 3,
    '{"def":2.0,"md":1.5,"speed":0.3,"atk":0.8}', '{name}''s skin hardens to living stone!', 8);


-- =================================================================
-- SESSION 21: REVIVE + TRAPS
-- =================================================================

-- Revive: extend skills with revive capability
ALTER TABLE game_skills
    ADD COLUMN IF NOT EXISTS is_revive TINYINT(1) NOT NULL DEFAULT 0 AFTER stealth_bonus
        COMMENT 'can target dead/KO allies to bring them back',
    ADD COLUMN IF NOT EXISTS revive_hp_pct FLOAT NOT NULL DEFAULT 0.25 AFTER is_revive
        COMMENT 'revived at this % of maxHp';

-- Traps: placeable grid objects
CREATE TABLE IF NOT EXISTS game_battle_traps (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    icon            VARCHAR(16)  DEFAULT '⚠️',
    description     TEXT         DEFAULT NULL,
    damage_formula  VARCHAR(255) DEFAULT 'ATK*1.5',
    trigger_type    ENUM('step','proximity','timed') NOT NULL DEFAULT 'step',
    trigger_radius  INT          NOT NULL DEFAULT 0 COMMENT '0 = exact tile only',
    duration_turns  INT          NOT NULL DEFAULT 0 COMMENT '0 = permanent until triggered',
    status_apply    VARCHAR(32)  DEFAULT NULL COMMENT 'status to apply on trigger',
    visible_to_enemy TINYINT(1)  NOT NULL DEFAULT 0,
    uses            INT          NOT NULL DEFAULT 1 COMMENT 'times it can trigger before disappearing',
    skill_id        INT          DEFAULT NULL COMMENT 'skill that places this trap',
    active          TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_revive',   'true'),
('enable_traps',    'true');

INSERT IGNORE INTO game_battle_traps (id, name, icon, description, damage_formula, trigger_type, status_apply) VALUES
(1, 'Spike Trap',      '📌', 'Sharp spikes hidden underfoot.',           'ATK*1.0',   'step', NULL),
(2, 'Fire Rune',       '🔥', 'Explodes in flame when stepped on.',       'MO*1.5',    'step', 'Burning'),
(3, 'Frost Snare',     '❄️', 'Freezes enemies who step near it.',        'MO*0.5',    'proximity', 'Stun'),
(4, 'Poison Cloud',    '☁️', 'Releases poison gas in a radius.',         '0',          'proximity', 'Poison');


-- =================================================================
-- SESSION 22: SPECTATOR MODE
-- =================================================================

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_spectator_mode',       'true'),
('spectator_max_per_battle',    '10');

-- No table needed — spectators join a socket room 'spectate_<battleId>'
-- and receive battle_update events without being participants.
