-- =================================================================
-- SESSION 9 — Diminishing Returns Polish, Flavor Text RP Bonus,
--             Combo Proc System
-- =================================================================
-- Run ONCE after migrate_session8_limbs.sql.
-- Safe to re-run: uses IF NOT EXISTS / INSERT IGNORE throughout.
-- =================================================================


-- =================================================================
-- 1. FLAVOR TEXT TABLE — Admin-created or player-submitted RP lines
-- =================================================================
-- Flavor texts are optional descriptions players add to their attacks
-- for a damage bonus. Admins can create templates per-skill, or leave
-- them global. Players can submit custom ones for approval.

CREATE TABLE IF NOT EXISTS game_flavor_texts (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    skill_id        INT          DEFAULT NULL COMMENT 'NULL = works for any skill/attack',
    command_id      INT          DEFAULT NULL COMMENT 'NULL = works for any command',
    text            TEXT         NOT NULL,
    bonus_pct       FLOAT        NOT NULL DEFAULT 0.05 COMMENT '0.05 = 5% damage bonus',
    category        ENUM('attack','defense','heal','movement','taunt') NOT NULL DEFAULT 'attack',
    min_length      INT          NOT NULL DEFAULT 0 COMMENT 'minimum char length to qualify (0 = this template only)',
    is_template     TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1 = admin-created, 0 = player submission',
    created_by_char_id INT       DEFAULT NULL,
    approved        TINYINT(1)   NOT NULL DEFAULT 1 COMMENT 'player submissions need approval',
    active          TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_skill (skill_id),
    INDEX idx_cmd (command_id),
    INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =================================================================
-- 2. FLAVOR KEYWORDS — Terrain/context-aware bonus words
-- =================================================================
-- When a player's flavor text contains one of these keywords AND the
-- battle context matches (e.g. 'wall' keyword + combatant near cover),
-- they get an extra bonus. This rewards players who pay attention to
-- the battlefield.

CREATE TABLE IF NOT EXISTS game_flavor_keywords (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    keyword         VARCHAR(64)  NOT NULL,
    bonus_pct       FLOAT        NOT NULL DEFAULT 0.02 COMMENT '0.02 = +2% per keyword match',
    category        VARCHAR(32)  NOT NULL DEFAULT 'general' COMMENT 'terrain, weapon, element, general',
    terrain_match   VARCHAR(32)  DEFAULT NULL COMMENT 'if set, keyword only gives bonus on this terrain type',
    active          TINYINT(1)   NOT NULL DEFAULT 1,
    UNIQUE KEY uq_keyword (keyword)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed some keywords
INSERT IGNORE INTO game_flavor_keywords (keyword, bonus_pct, category, terrain_match) VALUES
('wall',        0.02, 'terrain', 'cover'),
('tree',        0.02, 'terrain', 'forest'),
('trees',       0.02, 'terrain', 'forest'),
('flames',      0.02, 'terrain', 'fire'),
('fire',        0.02, 'terrain', 'fire'),
('water',       0.02, 'terrain', 'water'),
('high ground', 0.02, 'terrain', 'high_ground'),
('above',       0.02, 'terrain', 'high_ground'),
('flank',       0.02, 'general', NULL),
('behind',      0.02, 'general', NULL),
('overhead',    0.02, 'general', NULL),
('charge',      0.02, 'general', NULL),
('leap',        0.02, 'general', NULL),
('spin',        0.02, 'general', NULL),
('feint',       0.02, 'general', NULL),
('roar',        0.01, 'taunt',   NULL),
('scream',      0.01, 'taunt',   NULL);

-- Seed some attack flavor text templates
INSERT IGNORE INTO game_flavor_texts (id, skill_id, command_id, text, bonus_pct, category) VALUES
(1, NULL, 1, 'lunges forward with a powerful overhead strike', 0.07, 'attack'),
(2, NULL, 1, 'feints left then delivers a crushing blow from the right', 0.08, 'attack'),
(3, NULL, 1, 'drops low and sweeps upward in a vicious arc', 0.06, 'attack'),
(4, NULL, 1, 'channels their rage into a devastating two-handed swing', 0.08, 'attack'),
(5, NULL, 1, 'dashes forward with blinding speed and strikes', 0.07, 'attack'),
(6, NULL, NULL, 'locks eyes with the enemy before unleashing a precise strike', 0.06, 'attack'),
(7, NULL, NULL, 'lets out a battle cry and brings their weapon down with full force', 0.07, 'attack'),
(8, NULL, NULL, 'uses the terrain to their advantage, striking from an unexpected angle', 0.09, 'attack');


-- =================================================================
-- 3. EXTEND COMMANDS + SKILLS WITH COMBO CHANCE
-- =================================================================

ALTER TABLE game_battle_commands
    ADD COLUMN IF NOT EXISTS combo_chance   FLOAT NOT NULL DEFAULT 0 COMMENT '0-1 probability of extra attack',
    ADD COLUMN IF NOT EXISTS combo_max_chain INT   NOT NULL DEFAULT 1 COMMENT 'max extra hits from combo';

ALTER TABLE game_skills
    ADD COLUMN IF NOT EXISTS combo_chance   FLOAT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS combo_max_chain INT   NOT NULL DEFAULT 1;

-- Seed combo chances on the basic Attack command (id=1)
-- Lower damage attacks get higher combo chance (Mado rule)
UPDATE game_battle_commands SET combo_chance = 0.20, combo_max_chain = 1 WHERE id = 1;


-- =================================================================
-- 4. FEATURE FLAGS + TUNABLE PARAMETERS
-- =================================================================

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
-- Flavor text
('enable_flavor_text',          'true'),
('flavor_text_min_length',      '20'),
('flavor_text_max_bonus',       '0.10'),
('flavor_text_base_bonus',      '0.05'),
('flavor_text_keyword_bonus',   '0.02'),
('flavor_text_keyword_max',     '3'),
-- Combo procs
('enable_combo_procs',          'true'),
('combo_chain_decay',           '0.50'),
('combo_crit_chance',           '0.03'),
-- Diminishing returns polish
('ki_ranged_dodge_bonus',       '0.15');
