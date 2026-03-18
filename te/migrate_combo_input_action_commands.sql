-- =================================================================
-- COMBO INPUT SYSTEM (Legaia) + TIMED ACTION COMMANDS (Mario RPG)
-- =================================================================

-- =================================================================
-- 1. COMBO INPUT / ARTS SYSTEM (Legend of Legaia style)
-- =================================================================
-- Players input directional sequences per turn using Action Points.
-- Specific sequences trigger "Arts" (discovered special moves).

-- Action Points config per class
ALTER TABLE game_classes ADD COLUMN IF NOT EXISTS base_ap INT NOT NULL DEFAULT 6;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS current_ap INT NOT NULL DEFAULT 6;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS max_ap INT NOT NULL DEFAULT 6;

-- Arts: combo sequences that trigger special moves
CREATE TABLE IF NOT EXISTS game_combo_arts (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
    description     TEXT         DEFAULT NULL,
    input_sequence  VARCHAR(64)  NOT NULL COMMENT 'e.g. H,H,L or L,R,L,R or U,D,U',
    ap_cost         INT          NOT NULL DEFAULT 3 COMMENT 'how many AP inputs this uses',
    damage_formula  VARCHAR(255) NOT NULL DEFAULT 'ATK*3',
    element         VARCHAR(32)  DEFAULT NULL,
    status_apply    VARCHAR(32)  DEFAULT NULL,
    battle_text     VARCHAR(255) DEFAULT NULL,
    class_id        INT          DEFAULT NULL COMMENT 'NULL = any class can discover',
    level_required  INT          NOT NULL DEFAULT 1,
    is_hidden       TINYINT(1)   NOT NULL DEFAULT 1 COMMENT 'must be discovered by inputting the sequence',
    active          TINYINT(1)   NOT NULL DEFAULT 1,
    UNIQUE KEY uq_sequence (input_sequence, class_id),
    INDEX idx_class (class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Track which arts each character has discovered
CREATE TABLE IF NOT EXISTS character_discovered_arts (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    character_id    INT NOT NULL,
    art_id          INT NOT NULL,
    times_used      INT NOT NULL DEFAULT 0,
    discovered_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_char_art (character_id, art_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed some starter Arts (H=High, L=Low, R=Right, U=Up)
INSERT IGNORE INTO game_combo_arts (id, name, icon, input_sequence, ap_cost, damage_formula, battle_text, description) VALUES
(1,  'Cross Cut',       '⚔️', 'H,H',       2, 'ATK*2',     '{name} delivers a swift Cross Cut!',         'Basic two-strike combo.'),
(2,  'Somersault',      '🌀', 'H,H,L',     3, 'ATK*3',     '{name} flips and strikes with Somersault!',  'Rising kick into overhead slash.'),
(3,  'Tornado Dance',   '🌪️', 'L,R,L,R',   4, 'ATK*3.5',   '{name} unleashes the Tornado Dance!',        'Rapid alternating strikes.'),
(4,  'Rising Upper',    '👊', 'L,L,H',     3, 'ATK*2.5',   '{name} launches a Rising Upper!',             'Low strikes into devastating uppercut.'),
(5,  'Hyper Elbow',     '💪', 'H,L,H',     3, 'ATK*2.8',   '{name} charges with Hyper Elbow!',            'Fake high, go low, strike high.'),
(6,  'Power Punch',     '💥', 'H,H,H',     3, 'ATK*3.2',   '{name} unleashes a Power Punch!',             'Triple high strike, maximum force.'),
(7,  'Sweep Combo',     '🦵', 'L,L,L',     3, 'ATK*2.5',   '{name} executes a Sweep Combo!',              'Low strikes to topple the opponent.'),
(8,  'Hurricane Kick',  '🌊', 'L,R,L,R,H', 5, 'ATK*4.5',   '{name} roars with Hurricane Kick!',           'Devastating 5-hit combo. Rare discovery.'),
(9,  'Mystic Arte',     '✨', 'H,L,H,L,H', 5, 'ATK*5+MO*2','{name} channels the Mystic Arte!',           'Ultimate combo. Mixes physical and magical.'),
(10, 'Thunder Fist',    '⚡', 'H,H,H,H',   4, 'ATK*4',     '{name} rains Thunder Fists!',                 'Relentless high barrage.');

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_combo_input',          'true'),
('combo_ap_regen_per_turn',     '3'),
('combo_individual_hit_damage', '0.5'),
('combo_miss_on_wrong_input',   'false');


-- =================================================================
-- 2. TIMED ACTION COMMANDS (Super Mario RPG style)
-- =================================================================
-- During attack/defense, a timing prompt appears. Hitting the button
-- at the right moment = bonus effect. Adds real-time skill element.

CREATE TABLE IF NOT EXISTS game_action_commands (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    trigger_on      ENUM('attack','defend','skill','item','limit') NOT NULL DEFAULT 'attack',
    timing_type     ENUM('single_press','multi_press','hold','rhythm') NOT NULL DEFAULT 'single_press',
    window_ms       INT          NOT NULL DEFAULT 500 COMMENT 'timing window in milliseconds',
    perfect_window_ms INT        NOT NULL DEFAULT 100 COMMENT 'perfect timing window (smaller = harder)',
    bonus_damage_pct FLOAT       NOT NULL DEFAULT 0.25 COMMENT 'bonus on successful timing',
    perfect_bonus_pct FLOAT      NOT NULL DEFAULT 0.50 COMMENT 'bonus on perfect timing',
    defense_reduction FLOAT      NOT NULL DEFAULT 0.25 COMMENT 'damage reduction on successful defend timing',
    multi_press_count INT        NOT NULL DEFAULT 1 COMMENT 'for multi_press: how many presses needed',
    skill_id        INT          DEFAULT NULL COMMENT 'specific skill this applies to (NULL = all)',
    description     VARCHAR(255) DEFAULT NULL,
    active          TINYINT(1)   NOT NULL DEFAULT 1,
    INDEX idx_trigger (trigger_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default action commands
INSERT IGNORE INTO game_action_commands (id, name, trigger_on, timing_type, window_ms, perfect_window_ms, bonus_damage_pct, perfect_bonus_pct, defense_reduction, description) VALUES
(1, 'Attack Timing',  'attack',  'single_press', 600, 150, 0.25, 0.50, 0,    'Press at impact for bonus damage!'),
(2, 'Defend Timing',  'defend',  'single_press', 500, 120, 0,    0,    0.30, 'Press as the attack hits to reduce damage!'),
(3, 'Skill Power-Up', 'skill',   'hold',         800, 200, 0.20, 0.40, 0,    'Hold and release at peak for bonus!'),
(4, 'Limit Burst',    'limit',   'multi_press',  1000,300, 0.30, 0.60, 0,    'Mash rapidly during limit break for extra power!'),
(5, 'Item Mastery',   'item',    'single_press', 700, 180, 0.30, 0.50, 0,    'Time the use perfectly for enhanced effect!');

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_action_commands',      'true'),
('action_command_show_timing',  'true');
