-- =================================================================
-- CONSOLIDATED MIGRATION: Sessions 8-26
-- MariaDB 10.11 Compatible
-- =================================================================
-- Generated from individual migration files.
-- Safe to re-run: uses IF NOT EXISTS / INSERT IGNORE throughout.
-- =================================================================
-- MariaDB 10.11 compatibility notes applied:
--   - VARCHAR columns with emoji defaults use DEFAULT NULL instead
--   - icon columns use VARCHAR(64) instead of VARCHAR(16)
--   - ALTER TABLE ADD COLUMN IF NOT EXISTS has no COMMENT clauses
--   - game_battle_commands uses `display_order` not `sort_order`
--   - INSERT IGNORE and CREATE TABLE IF NOT EXISTS everywhere
-- =================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;


-- =================================================================
-- SESSION 8: BODY TYPES + LIMB ZONES
-- =================================================================

CREATE TABLE IF NOT EXISTS game_body_types (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(64)  NOT NULL UNIQUE,
    label       VARCHAR(128) NOT NULL DEFAULT '',
    description TEXT         DEFAULT NULL,
    icon        VARCHAR(64)  DEFAULT NULL,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_limb_zones (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    body_type_id    INT          NOT NULL,
    zone_key        VARCHAR(32)  NOT NULL,
    label           VARCHAR(64)  NOT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
    hp_pct          FLOAT        NOT NULL DEFAULT 0.20,
    called_shot_penalty FLOAT    NOT NULL DEFAULT 0.0,
    bleed_through   FLOAT        NOT NULL DEFAULT 0.60 COMMENT 'fraction of limb damage that also hits main HP',
    wound_effects   JSON         DEFAULT NULL COMMENT '{"light":{"speed":-0.15},"heavy":{"speed":-0.30}}',
    disable_effects JSON         DEFAULT NULL COMMENT '{"prone":true,"cant_flee":true,"speed":-0.50}',
    sort_order      INT          NOT NULL DEFAULT 0,
    UNIQUE KEY uq_body_zone (body_type_id, zone_key),
    FOREIGN KEY (body_type_id) REFERENCES game_body_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_battle_knockouts (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    battle_id       INT          NOT NULL,
    npc_char_id     INT          NOT NULL,
    npc_name        VARCHAR(128) NOT NULL DEFAULT '',
    knocked_out_by  INT          NOT NULL COMMENT 'character_id of the player who KOd them',
    ko_method       VARCHAR(32)  NOT NULL DEFAULT 'nonlethal' COMMENT 'nonlethal|head_disabled|surrender',
    interaction     VARCHAR(32)  DEFAULT NULL COMMENT 'interrogate|recruit|loot|release — set after battle',
    interaction_result JSON DEFAULT NULL COMMENT 'result data (dialogue, items looted, etc)',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_battle (battle_id),
    INDEX idx_ko_by (knocked_out_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_battle_limb_state (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    battle_id       INT          NOT NULL,
    character_id    INT          NOT NULL,
    limb_hp_json    JSON         NOT NULL COMMENT '{"head":{"current":50,"max":50},"torso":{"current":80,"max":80},...}',
    wound_levels_json JSON       DEFAULT NULL COMMENT '{"head":"normal","legs":"heavy",...}',
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_battle_char (battle_id, character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed body types
INSERT IGNORE INTO game_body_types (id, name, label, icon, description) VALUES
(1, 'humanoid',  'Humanoid',  '🧍', 'Standard bipedal — head, torso, two arms, legs. Humans, elves, dwarves, etc.'),
(2, 'beast',     'Beast',     '🐺', 'Four-legged creature — head, body, front legs, hind legs, tail.'),
(3, 'serpent',   'Serpent',   '🐍', 'Elongated body — head, body, tail. Snakes, wyrms, eels.'),
(4, 'amorphous', 'Amorphous', '🫧', 'Formless — core only. Slimes, spirits, elementals. Cannot be limb-targeted.');

-- Seed limb zones
INSERT IGNORE INTO game_limb_zones (body_type_id, zone_key, label, icon, hp_pct, called_shot_penalty, bleed_through, wound_effects, disable_effects, sort_order) VALUES
-- HUMANOID
(1, 'head',      'Head',      '🗣️', 0.25, 0.20, 0.70,
    '{"light":{"accuracy":-0.10},"heavy":{"accuracy":-0.25,"stun_chance_on_hit":0.15}}',
    '{"knockout":true}',
    1),
(1, 'torso',     'Torso',     '🫁', 0.40, 0.00, 1.00,
    '{"light":{"def":-0.10},"heavy":{"def":-0.20,"maxHp":-0.10}}',
    '{"def":-0.40,"maxHp":-0.20}',
    2),
(1, 'left_arm',  'Left Arm',  '💪', 0.15, 0.10, 0.60,
    '{"light":{"atk":-0.15},"heavy":{"atk":-0.30,"cant_dual_wield":true}}',
    '{"atk":-0.50,"cant_dual_wield":true,"cant_two_hand":true}',
    3),
(1, 'right_arm', 'Right Arm', '🤚', 0.15, 0.10, 0.60,
    '{"light":{"mo":-0.15},"heavy":{"mo":-0.30,"cant_use_items":true}}',
    '{"mo":-0.50,"cant_use_items":true}',
    4),
(1, 'legs',      'Legs',      '🦵', 0.20, 0.10, 0.60,
    '{"light":{"speed":-0.15,"move_range":-1},"heavy":{"speed":-0.30,"move_range":-2,"cant_flee":true}}',
    '{"prone":true,"speed":-0.50,"move_range":-99,"cant_flee":true,"cant_move":true}',
    5),
-- BEAST
(2, 'head',       'Head',       '🐺', 0.20, 0.20, 0.70,
    '{"light":{"accuracy":-0.10},"heavy":{"accuracy":-0.25,"stun_chance_on_hit":0.15}}',
    '{"knockout":true}',
    1),
(2, 'body',       'Body',       '🦴', 0.40, 0.00, 1.00,
    '{"light":{"def":-0.10},"heavy":{"def":-0.20}}',
    '{"def":-0.40}',
    2),
(2, 'front_legs', 'Front Legs', '🐾', 0.20, 0.10, 0.60,
    '{"light":{"atk":-0.15,"speed":-0.10},"heavy":{"atk":-0.30,"speed":-0.20}}',
    '{"atk":-0.50,"speed":-0.30,"move_range":-2}',
    3),
(2, 'hind_legs',  'Hind Legs',  '🦿', 0.15, 0.10, 0.60,
    '{"light":{"speed":-0.15,"move_range":-1},"heavy":{"speed":-0.30,"move_range":-2,"cant_flee":true}}',
    '{"prone":true,"speed":-0.50,"move_range":-99,"cant_flee":true}',
    4),
(2, 'tail',       'Tail',       '🐕', 0.05, 0.15, 0.40,
    '{"light":{"luck":-0.10},"heavy":{"luck":-0.25}}',
    '{"luck":-0.40}',
    5),
-- SERPENT
(3, 'head',  'Head',  '🐍', 0.25, 0.20, 0.70,
    '{"light":{"accuracy":-0.10},"heavy":{"accuracy":-0.25}}',
    '{"knockout":true}',
    1),
(3, 'body',  'Body',  '🪱', 0.60, 0.00, 1.00,
    '{"light":{"def":-0.10},"heavy":{"def":-0.20}}',
    '{"def":-0.40}',
    2),
(3, 'tail',  'Tail',  '🐍', 0.15, 0.10, 0.60,
    '{"light":{"speed":-0.15},"heavy":{"speed":-0.30,"cant_flee":true}}',
    '{"speed":-0.50,"cant_flee":true}',
    3),
-- AMORPHOUS
(4, 'core',  'Core',  '🫧', 1.00, 0.00, 1.00,
    NULL,
    NULL,
    1);

-- Extend game_npcs with body type
ALTER TABLE game_npcs
    ADD COLUMN IF NOT EXISTS body_type_id INT NOT NULL DEFAULT 1 AFTER is_recruitable;

-- Extend game_skills with non-lethal flag
ALTER TABLE game_skills
    ADD COLUMN IF NOT EXISTS is_nonlethal TINYINT(1) NOT NULL DEFAULT 0 AFTER target_type;

-- Extend game_skills with limb heal
ALTER TABLE game_skills
    ADD COLUMN IF NOT EXISTS heal_limb VARCHAR(32) DEFAULT NULL AFTER is_nonlethal;

-- Session 8 feature flags
INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_limb_targeting',       'true'),
('enable_active_defense',       'true'),
('enable_nonlethal',            'true'),
('enable_diminishing_returns',  'true'),
('enable_wound_degradation',    'true'),
('enable_called_shot_penalty',  'true');

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('limb_bleed_through_default',  '0.60'),
('called_shot_penalty_head',    '0.20'),
('called_shot_penalty_arms',    '0.10'),
('called_shot_penalty_legs',    '0.10'),
('wound_threshold_light',       '0.75'),
('wound_threshold_heavy',       '0.50'),
('wound_threshold_disable',     '0.00'),
('dodge_base_chance',           '0.15'),
('dodge_speed_factor',          '0.35'),
('dodge_max_chance',            '0.90'),
('block_die_sides',             '6'),
('block_success_numbers',       '[1,2]'),
('block_one_arm_reduction',     '0.25'),
('block_two_arm_reduction',     '0.50'),
('block_stun_die_sides',        '12'),
('counter_base_chance',         '0.25'),
('counter_charge_bonus',        '0.25'),
('counter_max_chance',          '0.90'),
('diminishing_returns_per_repeat', '0.05'),
('diminishing_returns_max',     '0.15'),
('defense_prompt_timeout_ms',   '10000'),
('nonlethal_rep_bonus_release', '5'),
('nonlethal_rep_penalty_finish','-10'),
('ko_interrogate_base_chance',  '0.60');

-- Extend game_arenas with session 8 overrides
ALTER TABLE game_arenas
    ADD COLUMN IF NOT EXISTS override_limb_targeting    ENUM('on','off','default') NOT NULL DEFAULT 'default' AFTER max_combatants,
    ADD COLUMN IF NOT EXISTS override_active_defense    ENUM('on','off','default') NOT NULL DEFAULT 'default' AFTER override_limb_targeting,
    ADD COLUMN IF NOT EXISTS override_nonlethal         ENUM('on','off','default') NOT NULL DEFAULT 'default' AFTER override_active_defense,
    ADD COLUMN IF NOT EXISTS override_diminishing_returns ENUM('on','off','default') NOT NULL DEFAULT 'default' AFTER override_nonlethal;

-- Extend game_battle_commands for defense types
ALTER TABLE game_battle_commands
    ADD COLUMN IF NOT EXISTS is_defense     TINYINT(1) NOT NULL DEFAULT 0 AFTER effects,
    ADD COLUMN IF NOT EXISTS defense_type   ENUM('dodge','block','counter') DEFAULT NULL AFTER is_defense;

-- Seed defense commands (uses display_order for MariaDB compat)
INSERT IGNORE INTO game_battle_commands (id, name, description, icon, effects, is_defense, defense_type, display_order) VALUES
(10, 'Dodge',   'Attempt to evade the attack entirely.',     '💨', '{"defense":"dodge"}',   1, 'dodge',   10),
(11, 'Block',   'Brace and try to absorb the blow.',         '🛡️', '{"defense":"block"}',   1, 'block',   11),
(12, 'Counter', 'Attempt to turn the attack back on them.',  '↩️', '{"defense":"counter"}', 1, 'counter', 12);


-- =================================================================
-- SESSION 9: FLAVOR TEXT + COMBO PROCS
-- =================================================================

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

CREATE TABLE IF NOT EXISTS game_flavor_keywords (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    keyword         VARCHAR(64)  NOT NULL,
    bonus_pct       FLOAT        NOT NULL DEFAULT 0.02 COMMENT '0.02 = +2% per keyword match',
    category        VARCHAR(32)  NOT NULL DEFAULT 'general' COMMENT 'terrain, weapon, element, general',
    terrain_match   VARCHAR(32)  DEFAULT NULL COMMENT 'if set, keyword only gives bonus on this terrain type',
    active          TINYINT(1)   NOT NULL DEFAULT 1,
    UNIQUE KEY uq_keyword (keyword)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

INSERT IGNORE INTO game_flavor_texts (id, skill_id, command_id, text, bonus_pct, category) VALUES
(1, NULL, 1, 'lunges forward with a powerful overhead strike', 0.07, 'attack'),
(2, NULL, 1, 'feints left then delivers a crushing blow from the right', 0.08, 'attack'),
(3, NULL, 1, 'drops low and sweeps upward in a vicious arc', 0.06, 'attack'),
(4, NULL, 1, 'channels their rage into a devastating two-handed swing', 0.08, 'attack'),
(5, NULL, 1, 'dashes forward with blinding speed and strikes', 0.07, 'attack'),
(6, NULL, NULL, 'locks eyes with the enemy before unleashing a precise strike', 0.06, 'attack'),
(7, NULL, NULL, 'lets out a battle cry and brings their weapon down with full force', 0.07, 'attack'),
(8, NULL, NULL, 'uses the terrain to their advantage, striking from an unexpected angle', 0.09, 'attack');

-- Extend commands + skills with combo chance
ALTER TABLE game_battle_commands
    ADD COLUMN IF NOT EXISTS combo_chance   FLOAT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS combo_max_chain INT   NOT NULL DEFAULT 1;

ALTER TABLE game_skills
    ADD COLUMN IF NOT EXISTS combo_chance   FLOAT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS combo_max_chain INT   NOT NULL DEFAULT 1;

-- Seed combo chances on basic Attack command
UPDATE game_battle_commands SET combo_chance = 0.20, combo_max_chain = 1 WHERE id = 1;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_flavor_text',          'true'),
('flavor_text_min_length',      '20'),
('flavor_text_max_bonus',       '0.10'),
('flavor_text_base_bonus',      '0.05'),
('flavor_text_keyword_bonus',   '0.02'),
('flavor_text_keyword_max',     '3'),
('enable_combo_procs',          'true'),
('combo_chain_decay',           '0.50'),
('combo_crit_chance',           '0.03'),
('ki_ranged_dodge_bonus',       '0.15');


-- =================================================================
-- SESSION 10: KI CHANNELING + BLEED TIERS
-- =================================================================

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_ki_channeling',    'true'),
('ki_channel_duration',     '5'),
('ki_channel_crash_pct',    '0.50'),
('ki_channel_uses_per_battle', '1');

INSERT IGNORE INTO game_battle_commands (id, name, description, icon, effects, is_defense, defense_type, display_order) VALUES
(13, 'Channel Ki', 'Surge to full power for 5 turns — then crash to half.', '🔥',
 '{"ki_channel":true}', 0, NULL, 13);

CREATE TABLE IF NOT EXISTS game_bleed_tiers (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(32)  NOT NULL UNIQUE,
    label           VARCHAR(64)  NOT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
    duration_turns  INT          NOT NULL DEFAULT 2,
    damage_pct      FLOAT        NOT NULL DEFAULT 0.03 COMMENT '% of BASE maxHp per turn',
    description     TEXT         DEFAULT NULL,
    color           VARCHAR(32)  DEFAULT NULL COMMENT 'CSS color class for UI',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_bleed_tiers (id, name, label, icon, duration_turns, damage_pct, description, color) VALUES
(1, 'light',    'Light Bleed',    '🩸', 2, 0.03, 'A shallow wound. 3% base HP per turn for 2 turns (6% total).',    'text-[oklch(0.65_0.15_25)]'),
(2, 'moderate', 'Moderate Bleed', '🩸', 4, 0.03, 'A deep cut. 3% base HP per turn for 4 turns (12% total).',       'text-[oklch(0.55_0.20_25)]'),
(3, 'heavy',    'Heavy Bleed',    '💉', 5, 0.03, 'A grievous wound. 3% base HP per turn for 5 turns (15% total).', 'text-destructive');

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_bleed_tiers', 'true');

-- Extend skills with bleed tier
ALTER TABLE game_skills
    ADD COLUMN IF NOT EXISTS bleed_tier VARCHAR(16) DEFAULT NULL AFTER combo_max_chain;

-- Extend arenas with ki channeling override
ALTER TABLE game_arenas
    ADD COLUMN IF NOT EXISTS override_ki_channeling ENUM('on','off','default') NOT NULL DEFAULT 'default' AFTER override_diminishing_returns;


-- =================================================================
-- SESSION 11: SIGNATURE TECHNIQUES
-- =================================================================

CREATE TABLE IF NOT EXISTS game_signature_levels (
    level           INT          NOT NULL PRIMARY KEY,
    damage_pct      FLOAT        NOT NULL COMMENT 'for ki_attack type: % of powerlevel as damage',
    cost_pct        FLOAT        NOT NULL COMMENT 'for ki_attack type: % of current HP as cost',
    heal_pct        FLOAT        NOT NULL DEFAULT 0 COMMENT 'for ki_heal type: % of target HP healed',
    ability_slots   INT          NOT NULL DEFAULT 0 COMMENT 'cumulative special ability slots unlocked at this level',
    xp_required     INT          NOT NULL DEFAULT 0 COMMENT 'total XP needed to reach this level',
    description     VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_signature_levels (level, damage_pct, cost_pct, heal_pct, ability_slots, xp_required, description) VALUES
(1,  0.10, 0.01, 0.10, 0,  0,    'Nascent technique. A raw expression of your fighting spirit.'),
(2,  0.11, 0.02, 0.15, 0,  50,   'The form solidifies. Muscle memory begins to take hold.'),
(3,  0.12, 0.03, 0.22, 1,  150,  'First breakthrough — unlock a special ability.'),
(4,  0.14, 0.04, 0.30, 1,  300,  'Growing confidence. The technique flows naturally.'),
(5,  0.16, 0.05, 0.40, 2,  500,  'Second breakthrough — unlock another ability.'),
(6,  0.18, 0.06, 0.50, 2,  750,  'The technique becomes an extension of your will.'),
(7,  0.20, 0.08, 0.60, 2,  1050, 'Masterful control. Opponents begin to fear this move.'),
(8,  0.23, 0.10, 0.70, 3,  1400, 'Third breakthrough — another ability slot opens.'),
(9,  0.26, 0.12, 0.80, 3,  1800, 'Near perfection. The technique defines your legend.'),
(10, 0.30, 0.14, 0.90, 4,  2500, 'Mastered. This technique is uniquely yours — your signature.');

CREATE TABLE IF NOT EXISTS game_signature_abilities (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL UNIQUE,
    label           VARCHAR(128) NOT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
    description     TEXT         NOT NULL,
    category        ENUM('offense','defense','utility','heal') NOT NULL DEFAULT 'offense',
    effects         JSON         NOT NULL COMMENT 'what it does: {"stun_turns":1}, {"guard_crush":true}, etc.',
    damage_modifier FLOAT        NOT NULL DEFAULT 0 COMMENT 'added to damage_pct (-0.10 = -10% damage)',
    cost_modifier   FLOAT        NOT NULL DEFAULT 0 COMMENT 'added to cost_pct (+0.04 = +4% cost)',
    dodge_modifier  FLOAT        NOT NULL DEFAULT 0 COMMENT 'added to opponent dodge chance',
    min_level       INT          NOT NULL DEFAULT 1 COMMENT 'minimum tech level to equip this ability',
    exclusive_with  JSON         DEFAULT NULL COMMENT 'ability IDs that conflict with this one',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_signature_abilities (id, name, label, icon, description, category, effects, damage_modifier, cost_modifier, dodge_modifier, min_level, exclusive_with) VALUES
(1,  'stun_1',          '1-Turn Stun',       '💫', 'Stuns the target for 1 turn on hit.',
     'offense', '{"stun_turns":1}', -0.10, 0, 0, 3, '[2]'),
(2,  'stun_2',          '2-Turn Stun',       '💫', 'Stuns the target for 2 turns on hit. Requires 30%+ damage.',
     'offense', '{"stun_turns":2}', -0.20, 0, 0, 5, '[1]'),
(3,  'guaranteed_hit',  'Guaranteed Hit',    '🎯', 'This technique cannot be dodged. Requires 15%+ damage.',
     'offense', '{"guaranteed_hit":true}', -0.10, 0, 0, 3, '[10]'),
(4,  'guard_crush',     'Guard Crush',       '🔨', 'Unblockable — ignores block defense entirely.',
     'offense', '{"guard_crush":true}', 0, 0.04, 0, 5, NULL),
(5,  'cost_reduction',  'Cost Reduction',    '💧', 'Reduces the HP/MP cost of this technique.',
     'utility', '{"cost_reduction":0.02}', -0.02, -0.02, 0, 3, NULL),
(6,  'bleed_apply',     'Hemorrhage',        '🩸', 'Applies Moderate Bleed on hit.',
     'offense', '{"bleed_tier":"moderate"}', 0, 0.03, 0, 5, NULL),
(7,  'multi_hit',       'Scatter Shot',      '💥', 'Splits into 3 hits across multiple targets. 1/3 damage each.',
     'offense', '{"multi_hit":3}', 0, 0.05, 0, 8, NULL),
(8,  'piercing',        'Piercing Strike',   '🗡️', 'Ignores 50% of target defense.',
     'offense', '{"piercing":0.50}', 0, 0.04, 0, 5, NULL),
(9,  'power_surge',     'Power Surge',       '⬆️', 'Increases damage but gives the opponent extra dodge chance.',
     'offense', '{"damage_bonus":true}', 0.01, 0.005, 0.015, 3, '[3]'),
(10, 'extra_dodge',     'Reckless Style',    '💨', 'More damage, but opponent can dodge more easily. Cannot combine with Guaranteed Hit.',
     'offense', '{"damage_bonus":true}', 0.01, 0.005, 0.015, 3, '[3]'),
(11, 'heal_extra_use',  'Restorative Echo',  '💚', 'Allows one extra use of this healing technique per day.',
     'heal', '{"extra_daily_use":1}', 0, 0.05, 0, 3, NULL),
(12, 'heal_dodge_buff', 'Invigorating Heal', '🛡️', 'Target gains +5% dodge for the rest of battle.',
     'heal', '{"dodge_buff":0.05}', 0, 0.02, 0, 5, NULL),
(13, 'heal_regen_limb', 'Mending Touch',     '🩹', 'Can regenerate a disabled limb.',
     'heal', '{"regen_limb":true}', 0, 0.05, 0, 8, NULL);

CREATE TABLE IF NOT EXISTS character_signature_techs (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    character_id    INT          NOT NULL,
    name            VARCHAR(128) NOT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
    description     TEXT         DEFAULT NULL,
    tech_type       ENUM('ki_attack','physical','ki_heal') NOT NULL DEFAULT 'ki_attack',
    current_level   INT          NOT NULL DEFAULT 1,
    current_xp      INT          NOT NULL DEFAULT 0,
    total_uses      INT          NOT NULL DEFAULT 0,
    daily_uses      INT          NOT NULL DEFAULT 0 COMMENT 'for ki_heal: uses today',
    daily_max       INT          NOT NULL DEFAULT 1 COMMENT 'for ki_heal: max uses per day',
    last_daily_reset DATE        DEFAULT NULL,
    origin_text     TEXT         DEFAULT NULL COMMENT 'the flavor text pattern that spawned this technique',
    origin_keywords JSON         DEFAULT NULL COMMENT 'keyword cluster that triggered discovery',
    element         VARCHAR(32)  DEFAULT NULL,
    battle_text     VARCHAR(255) DEFAULT NULL COMMENT 'custom battle announcement text',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_char (character_id),
    UNIQUE KEY uq_char_name (character_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_sig_tech_abilities (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    tech_id         INT          NOT NULL,
    ability_id      INT          NOT NULL,
    slot_number     INT          NOT NULL DEFAULT 1,
    unlocked_at_level INT        NOT NULL DEFAULT 3,
    UNIQUE KEY uq_tech_slot (tech_id, slot_number),
    FOREIGN KEY (tech_id) REFERENCES character_signature_techs(id) ON DELETE CASCADE,
    FOREIGN KEY (ability_id) REFERENCES game_signature_abilities(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_flavor_history (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    character_id    INT          NOT NULL,
    flavor_text     TEXT         NOT NULL,
    keywords_json   JSON         DEFAULT NULL COMMENT 'extracted keywords from this text',
    category        VARCHAR(32)  DEFAULT 'attack',
    battle_id       INT          DEFAULT NULL,
    skill_id        INT          DEFAULT NULL,
    damage_dealt    INT          DEFAULT 0,
    used_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_char (character_id),
    INDEX idx_char_time (character_id, used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_signature_techs',          'true'),
('sig_tech_discovery_threshold',    '10'),
('sig_tech_xp_per_use',            '10'),
('sig_tech_max_per_character',      '3'),
('sig_tech_min_flavor_length',      '15');

ALTER TABLE game_arenas
    ADD COLUMN IF NOT EXISTS override_signature_techs ENUM('on','off','default') NOT NULL DEFAULT 'default' AFTER override_ki_channeling;


-- =================================================================
-- SESSION 12: RP ENGINE
-- =================================================================

-- Characters: gate sig tech creation behind masters/quests
ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS can_create_sig_tech TINYINT(1) NOT NULL DEFAULT 0 AFTER status_effects,
    ADD COLUMN IF NOT EXISTS master_training_json JSON DEFAULT NULL AFTER can_create_sig_tech;

-- NPCs: master teaching capabilities
ALTER TABLE game_npcs
    ADD COLUMN IF NOT EXISTS is_master TINYINT(1) NOT NULL DEFAULT 0 AFTER body_type_id,
    ADD COLUMN IF NOT EXISTS teaches_sig_tech_id INT DEFAULT NULL AFTER is_master,
    ADD COLUMN IF NOT EXISTS unlocks_sig_tech_creation TINYINT(1) NOT NULL DEFAULT 0 AFTER teaches_sig_tech_id,
    ADD COLUMN IF NOT EXISTS master_skill_ids JSON DEFAULT NULL AFTER unlocks_sig_tech_creation,
    ADD COLUMN IF NOT EXISTS training_gain_pct FLOAT NOT NULL DEFAULT 0.02 AFTER master_skill_ids;

CREATE TABLE IF NOT EXISTS game_master_training_log (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    character_id    INT          NOT NULL,
    npc_id          INT          NOT NULL,
    training_type   ENUM('stat_train','learn_skill','learn_sig_tech','unlock_creation') NOT NULL,
    result_json     JSON         DEFAULT NULL,
    trained_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_char (character_id),
    INDEX idx_npc (npc_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('sig_tech_require_unlock',         'true'),
('sig_tech_natural_talent_chance',  '0.05');

-- RP description engine settings
INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_rp_descriptions',      'true'),
('rp_desc_min_short',           '20'),
('rp_desc_min_detailed',        '50'),
('rp_desc_short_bonus',         '0.05'),
('rp_desc_detailed_bonus',      '0.07'),
('rp_desc_context_bonus',       '0.03'),
('rp_desc_party_chain_bonus',   '0.03'),
('rp_desc_max_bonus',           '0.12'),
('rp_desc_applies_to',          'attack,skill,defense,heal,move,item');

-- Extend flavor history with richer tracking
ALTER TABLE character_flavor_history
    ADD COLUMN IF NOT EXISTS action_type VARCHAR(32) DEFAULT 'attack' AFTER category,
    ADD COLUMN IF NOT EXISTS context_matches INT NOT NULL DEFAULT 0 AFTER action_type,
    ADD COLUMN IF NOT EXISTS party_chain TINYINT(1) NOT NULL DEFAULT 0 AFTER context_matches;

-- Battle narration system
CREATE TABLE IF NOT EXISTS game_battle_narrations (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    action_type     VARCHAR(32)  NOT NULL COMMENT 'attack/skill/defend/dodge/block/heal/kill/ko/miss/crit/combo/flee/ki_channel/limb_disabled/taunt/intimidate/rally',
    weapon_type     VARCHAR(32)  DEFAULT NULL COMMENT 'sword/axe/staff/bow/fist — NULL = any weapon',
    element         VARCHAR(32)  DEFAULT NULL COMMENT 'fire/ice/etc — NULL = any element',
    terrain         VARCHAR(32)  DEFAULT NULL COMMENT 'forest/high_ground/etc — NULL = any terrain',
    target_zone     VARCHAR(32)  DEFAULT NULL COMMENT 'head/torso/legs — NULL = any zone',
    text_template   TEXT         NOT NULL COMMENT 'uses {actor},{target},{damage},{skill},{limb},{terrain},{weapon} placeholders',
    weight          INT          NOT NULL DEFAULT 1 COMMENT 'higher = more likely to be picked',
    active          TINYINT(1)   NOT NULL DEFAULT 1,
    INDEX idx_action (action_type),
    INDEX idx_weapon (weapon_type),
    INDEX idx_element (element)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_battle_narration', 'true');

INSERT IGNORE INTO game_battle_narrations (id, action_type, weapon_type, element, terrain, target_zone, text_template, weight) VALUES
(1,  'attack', 'sword', NULL, NULL, NULL, '{actor} lunges forward, blade singing through the air, and carves a vicious arc across {target}!', 2),
(2,  'attack', 'sword', NULL, NULL, 'head', '{actor} feints low, then whips the blade upward toward {target}''s skull!', 2),
(3,  'attack', 'axe', NULL, NULL, NULL, '{actor} heaves the axe overhead and brings it crashing down on {target}!', 2),
(4,  'attack', 'staff', NULL, NULL, NULL, '{actor} spins the staff and drives it into {target}''s ribs with a sharp crack!', 2),
(5,  'attack', 'bow', NULL, NULL, NULL, '{actor} draws, exhales, and looses — the arrow streaks toward {target}!', 2),
(6,  'attack', 'fist', NULL, NULL, NULL, '{actor} surges forward and drives a thunderous fist into {target}!', 2),
(7,  'attack', NULL, NULL, NULL, NULL, '{actor} strikes at {target} with practiced precision!', 1),
(8,  'attack', NULL, NULL, NULL, 'legs', '{actor} sweeps low, aiming to take {target}''s legs out from under them!', 2),
(9,  'attack', NULL, NULL, NULL, 'left_arm', '{actor} targets {target}''s weapon arm with a brutal chop!', 2),
(10, 'crit', NULL, NULL, NULL, NULL, 'The blow lands with devastating force — bone crunches and {target} staggers!', 3),
(11, 'crit', NULL, NULL, NULL, 'head', 'A sickening crack echoes as the strike connects squarely with {target}''s skull!', 3),
(12, 'crit', 'sword', NULL, NULL, NULL, 'The blade bites deep, finding the gap in {target}''s guard — a perfect strike!', 3),
(13, 'dodge', NULL, NULL, NULL, NULL, '{target} reads the attack and sidesteps at the last instant!', 2),
(14, 'dodge', NULL, NULL, 'forest', NULL, '{target} ducks behind a tree trunk — the attack whistles past!', 3),
(15, 'dodge', NULL, NULL, NULL, NULL, '{target} twists away, the blow grazing harmlessly past!', 1),
(16, 'block', NULL, NULL, NULL, NULL, '{target} raises their guard — the impact jars their arms but holds!', 2),
(17, 'block', NULL, NULL, NULL, NULL, '{target} braces and catches the blow on crossed forearms!', 2),
(18, 'miss', NULL, NULL, NULL, NULL, '{actor}''s strike goes wide, cutting only air!', 2),
(19, 'miss', NULL, NULL, NULL, NULL, '{actor} overextends — the attack misses entirely!', 1),
(20, 'kill', NULL, NULL, NULL, NULL, '{target} crumples, the light fading from their eyes. It is done.', 3),
(21, 'kill', 'sword', NULL, NULL, NULL, '{actor}''s blade finds {target}''s heart. They fall without a sound.', 3),
(22, 'ko', NULL, NULL, NULL, NULL, '{target} slumps to the ground, unconscious but breathing.', 2),
(23, 'ko', NULL, NULL, NULL, 'head', '{target}''s eyes roll back as the blow to the head sends them into darkness.', 3),
(24, 'heal', NULL, NULL, NULL, NULL, 'Warm light flows from {actor}''s hands, knitting flesh and easing pain.', 2),
(25, 'heal', NULL, 'light', NULL, NULL, 'Holy radiance engulfs {target}, their wounds closing before your eyes!', 3),
(26, 'combo', NULL, NULL, NULL, NULL, '{actor} presses the advantage — another strike follows before {target} can recover!', 2),
(27, 'combo', 'fist', NULL, NULL, NULL, '{actor}''s fists blur into a rapid combination!', 3),
(28, 'ki_channel', NULL, NULL, NULL, NULL, 'The air crackles as {actor} draws upon their deepest reserves — raw power erupts from within!', 3),
(29, 'limb_disabled', NULL, NULL, NULL, 'legs', '{target}''s leg buckles, shattered — they collapse to one knee!', 3),
(30, 'limb_disabled', NULL, NULL, NULL, 'left_arm', '{target}''s arm goes limp at their side, useless!', 3),
(31, 'limb_disabled', NULL, NULL, NULL, 'right_arm', 'A sickening pop — {target}''s arm hangs at a wrong angle!', 3),
(32, 'limb_disabled', NULL, NULL, NULL, 'head', '{target}''s head snaps back — their eyes go glassy!', 3),
(33, 'flee', NULL, NULL, NULL, NULL, '{actor} breaks away, scrambling for the exit — they escape!', 2),
(34, 'flee_fail', NULL, NULL, NULL, NULL, '{actor} turns to run but {target} cuts off their escape!', 2),
(35, 'skill', NULL, 'fire', NULL, NULL, 'Flames roar to life around {actor}''s hands — {skill} engulfs {target}!', 3),
(36, 'skill', NULL, 'ice', NULL, NULL, 'The temperature plummets as {actor} invokes {skill} — frost races across {target}''s skin!', 3),
(37, 'skill', NULL, 'lightning', NULL, NULL, 'Lightning arcs from {actor}''s fingertips — {skill} strikes {target} with a deafening crack!', 3),
(38, 'skill', NULL, 'dark', NULL, NULL, 'Shadows coil around {actor} as they whisper the words of {skill} — darkness lashes at {target}!', 3),
(39, 'skill', NULL, NULL, NULL, NULL, '{actor} channels their energy and unleashes {skill}!', 1),
(40, 'taunt', NULL, NULL, NULL, NULL, '{actor} locks eyes with {target} and snarls a challenge — "Face me, coward!"', 2),
(41, 'intimidate', NULL, NULL, NULL, NULL, '{actor} steps forward, their presence crushing — {target} falters!', 2),
(42, 'rally', NULL, NULL, NULL, NULL, '{actor} raises their weapon high and roars — "Stand fast! We fight as one!"', 2);

-- RP combat commands
INSERT IGNORE INTO game_battle_commands (id, name, description, icon, effects, is_defense, defense_type, display_order) VALUES
(14, 'Taunt',      'Draw enemy attention. +10% damage on your next attack.', '😤',
     '{"rp_command":"taunt","aggro_duration":1,"self_damage_bonus":0.10,"bonus_duration":1}', 0, NULL, 14),
(15, 'Intimidate', 'Attempt to shake the enemy. May reduce their ATK and accuracy.', '👁️',
     '{"rp_command":"intimidate","base_chance":0.50,"atk_reduction":0.15,"accuracy_reduction":0.10,"duration":2}', 0, NULL, 15),
(16, 'Rally',      'Inspire your allies! Boosts party ATK and speed for 2 turns.', '📣',
     '{"rp_command":"rally","atk_bonus":0.10,"speed_bonus":0.10,"duration":2}', 0, NULL, 16);

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_rp_commands', 'true');

-- Pre-made signature techs
CREATE TABLE IF NOT EXISTS game_premade_sig_techs (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
    description     TEXT         DEFAULT NULL,
    tech_type       ENUM('ki_attack','physical','ki_heal') NOT NULL DEFAULT 'ki_attack',
    element         VARCHAR(32)  DEFAULT NULL,
    battle_text     VARCHAR(255) DEFAULT NULL,
    preset_abilities JSON        DEFAULT NULL COMMENT 'array of ability IDs auto-equipped at creation',
    lore_text       TEXT         DEFAULT NULL COMMENT 'story/lore behind this technique',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_premade_sig_techs (id, name, icon, description, tech_type, element, battle_text, lore_text) VALUES
(1, 'Soulfire Blast',    '🔥', 'A concentrated beam of spiritual fire, passed down through generations of Celtic warriors.',
    'ki_attack', 'fire', '{name} channels ancestral flame and unleashes the Soulfire Blast!',
    'Legend says the first wielder learned this from the eternal flame beneath Tara Hill.'),
(2, 'Phantom Strike',    '👻', 'A physical technique that phases through armor — the striker becomes momentarily ethereal.',
    'physical', 'dark', '{name} flickers like a ghost and delivers the Phantom Strike!',
    'Taught only in the shadow monasteries of the Otherworld.'),
(3, 'Heartmend',         '💚', 'Ancient healing art that channels life energy from the earth itself.',
    'ki_heal', 'light', '{name} places their hands on the earth and channels the Heartmend!',
    'The druids of old used this to heal entire villages after raids.');


-- =================================================================
-- SESSION 13: FIGHTING STYLES
-- =================================================================

CREATE TABLE IF NOT EXISTS game_fighting_styles (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL UNIQUE,
    label           VARCHAR(128) NOT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
    description     TEXT         DEFAULT NULL,
    lore_text       TEXT         DEFAULT NULL,
    style_type      ENUM('offensive','defensive','balanced','support','glass_cannon') NOT NULL DEFAULT 'balanced',
    max_rank        INT          NOT NULL DEFAULT 10,
    passive_effects JSON         DEFAULT NULL COMMENT 'effects active at all ranks: {"dodge_bonus":0.02}',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_fighting_style_ranks (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    style_id        INT          NOT NULL,
    rank_num        INT          NOT NULL,
    label           VARCHAR(64)  NOT NULL COMMENT 'White Belt, Black Belt, Master, etc.',
    icon            VARCHAR(64)  DEFAULT NULL,
    wins_required   INT          NOT NULL DEFAULT 5 COMMENT 'wins at this rank to promote',
    stat_bonuses    JSON         DEFAULT NULL COMMENT '{"atk":0.05,"speed":0.03} — cumulative multiplier bonuses',
    unlocked_move_ids JSON       DEFAULT NULL COMMENT '[skillId, skillId] — skills unlocked at this rank',
    passive_effects JSON         DEFAULT NULL COMMENT '{"crit_bonus":0.02,"combo_bonus":0.05}',
    description     VARCHAR(255) DEFAULT NULL,
    UNIQUE KEY uq_style_rank (style_id, rank_num),
    FOREIGN KEY (style_id) REFERENCES game_fighting_styles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_fighting_styles (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    character_id    INT          NOT NULL,
    style_id        INT          NOT NULL,
    current_rank    INT          NOT NULL DEFAULT 1,
    wins_at_rank    INT          NOT NULL DEFAULT 0,
    total_wins      INT          NOT NULL DEFAULT 0,
    is_active       TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'only one style active at a time',
    learned_from_npc_id INT      DEFAULT NULL,
    learned_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_char_style (character_id, style_id),
    FOREIGN KEY (style_id) REFERENCES game_fighting_styles(id),
    INDEX idx_char_active (character_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE game_npcs
    ADD COLUMN IF NOT EXISTS teaches_style_id INT DEFAULT NULL AFTER training_gain_pct;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_fighting_styles',       'true'),
('style_switch_cooldown_turns',  '0');

INSERT IGNORE INTO game_fighting_styles (id, name, label, icon, description, style_type, lore_text) VALUES
(1, 'iron_fist',      'Iron Fist',       '👊', 'A brutal offensive style focused on raw striking power. Each blow aims to overwhelm.',                      'offensive',     'Forged in the war camps of the northern clans, where strength determines rank.'),
(2, 'shadow_step',    'Shadow Step',     '💨', 'An evasive style emphasizing speed, positioning, and counter-strikes.',                                       'defensive',     'Developed by the Fae-touched assassins of the Otherworld mists.'),
(3, 'stone_wall',     'Stone Wall',      '🛡️', 'An immovable defensive art. Stand firm, absorb punishment, outlast your enemy.',                              'defensive',     'The dwarven shield-masters of the deep holds perfected this over centuries.'),
(4, 'druids_way',     'Druid''s Way',    '🌿', 'A support style channeling nature''s energy. Heal allies, weaken foes, control the flow of battle.',          'support',       'Ancient as the standing stones. The druids teach that true power is balance.'),
(5, 'berserker_rage', 'Berserker Rage',  '🔥', 'Sacrifice defense for devastating attack power. The more you bleed, the harder you hit.',                     'glass_cannon',  'Born from the blood-frenzied warriors who painted themselves in woad before battle.');

-- IRON FIST ranks
INSERT IGNORE INTO game_fighting_style_ranks (style_id, rank_num, label, icon, wins_required, stat_bonuses, passive_effects, description) VALUES
(1, 1,  'White Belt',   '⬜', 0,  '{"atk":0.03}',                     NULL,                              'You begin to learn the basics of striking.'),
(1, 2,  'Yellow Belt',  '🟨', 3,  '{"atk":0.05}',                     NULL,                              'Your punches carry weight.'),
(1, 3,  'Orange Belt',  '🟧', 6,  '{"atk":0.08}',                     '{"crit_bonus":0.02}',             'You find the weak points instinctively.'),
(1, 4,  'Green Belt',   '🟩', 10, '{"atk":0.10,"speed":0.03}',        '{"crit_bonus":0.03}',             'Speed and power begin to merge.'),
(1, 5,  'Blue Belt',    '🟦', 15, '{"atk":0.13,"speed":0.05}',        '{"crit_bonus":0.04}',             'Your strikes are hard to read.'),
(1, 6,  'Purple Belt',  '🟪', 22, '{"atk":0.16,"speed":0.06}',        '{"crit_bonus":0.05,"combo_chance":0.05}', 'Combinations flow naturally.'),
(1, 7,  'Brown Belt',   '🟫', 30, '{"atk":0.19,"speed":0.08}',        '{"crit_bonus":0.06,"combo_chance":0.08}', 'Few can match your striking power.'),
(1, 8,  'Red Belt',     '🔴', 40, '{"atk":0.22,"speed":0.10}',        '{"crit_bonus":0.07,"combo_chance":0.10}', 'Your fists are weapons unto themselves.'),
(1, 9,  'Black Belt',   '⬛', 55, '{"atk":0.25,"speed":0.12}',        '{"crit_bonus":0.08,"combo_chance":0.12}', 'Master of the Iron Fist.'),
(1, 10, 'Grandmaster',  '👑', 75, '{"atk":0.30,"speed":0.15,"luck":0.05}', '{"crit_bonus":0.10,"combo_chance":0.15}', 'Your name is spoken with reverence and fear.');

-- SHADOW STEP ranks
INSERT IGNORE INTO game_fighting_style_ranks (style_id, rank_num, label, icon, wins_required, stat_bonuses, passive_effects, description) VALUES
(2, 1,  'White Belt',   '⬜', 0,  '{"speed":0.05}',                   NULL,                              'You learn to move unseen.'),
(2, 2,  'Yellow Belt',  '🟨', 3,  '{"speed":0.08}',                   '{"dodge_bonus":0.02}',            'Your footwork improves.'),
(2, 3,  'Orange Belt',  '🟧', 6,  '{"speed":0.10}',                   '{"dodge_bonus":0.04}',            'You begin to read opponent''s tells.'),
(2, 4,  'Green Belt',   '🟩', 10, '{"speed":0.13,"luck":0.03}',       '{"dodge_bonus":0.06,"flank_bonus":0.05}', 'Positioning becomes second nature.'),
(2, 5,  'Blue Belt',    '🟦', 15, '{"speed":0.16,"luck":0.05}',       '{"dodge_bonus":0.08,"flank_bonus":0.08}', 'You strike from impossible angles.'),
(2, 6,  'Purple Belt',  '🟪', 22, '{"speed":0.19,"luck":0.07}',       '{"dodge_bonus":0.10,"flank_bonus":0.10,"counter_bonus":0.05}', 'Counter-attacks flow like water.'),
(2, 7,  'Brown Belt',   '🟫', 30, '{"speed":0.22,"luck":0.09}',       '{"dodge_bonus":0.12,"flank_bonus":0.12,"counter_bonus":0.08}', 'You are the shadow between strikes.'),
(2, 8,  'Red Belt',     '🔴', 40, '{"speed":0.25,"luck":0.11}',       '{"dodge_bonus":0.14,"flank_bonus":0.14,"counter_bonus":0.10}', 'Enemies swing at air where you were.'),
(2, 9,  'Black Belt',   '⬛', 55, '{"speed":0.28,"luck":0.13}',       '{"dodge_bonus":0.16,"flank_bonus":0.16,"counter_bonus":0.12}', 'Master of the Shadow Step.'),
(2, 10, 'Grandmaster',  '👑', 75, '{"speed":0.32,"luck":0.15,"atk":0.05}', '{"dodge_bonus":0.18,"flank_bonus":0.18,"counter_bonus":0.15}', 'You exist between moments.');

-- STONE WALL ranks
INSERT IGNORE INTO game_fighting_style_ranks (style_id, rank_num, label, icon, wins_required, stat_bonuses, passive_effects, description) VALUES
(3, 1,  'White Belt',   '⬜', 0,  '{"def":0.05}',                     NULL,                              'You learn to hold your ground.'),
(3, 2,  'Yellow Belt',  '🟨', 3,  '{"def":0.08}',                     '{"block_bonus":0.05}',            'Your blocks grow steadier.'),
(3, 3,  'Orange Belt',  '🟧', 6,  '{"def":0.10,"md":0.03}',           '{"block_bonus":0.08}',            'You shrug off blows that would fell others.'),
(3, 4,  'Green Belt',   '🟩', 10, '{"def":0.13,"md":0.06}',           '{"block_bonus":0.10,"damage_reduction":0.03}', 'Stone endures.'),
(3, 5,  'Blue Belt',    '🟦', 15, '{"def":0.16,"md":0.08}',           '{"block_bonus":0.12,"damage_reduction":0.05}', 'You are the shield others hide behind.'),
(3, 6,  'Purple Belt',  '🟪', 22, '{"def":0.19,"md":0.10,"maxHp":0.05}', '{"block_bonus":0.14,"damage_reduction":0.07}', 'Unbreakable.'),
(3, 7,  'Brown Belt',   '🟫', 30, '{"def":0.22,"md":0.12,"maxHp":0.08}', '{"block_bonus":0.16,"damage_reduction":0.09}', 'Mountains move before you do.'),
(3, 8,  'Red Belt',     '🔴', 40, '{"def":0.25,"md":0.14,"maxHp":0.10}', '{"block_bonus":0.18,"damage_reduction":0.11}', 'Your defense is legendary.'),
(3, 9,  'Black Belt',   '⬛', 55, '{"def":0.28,"md":0.16,"maxHp":0.12}', '{"block_bonus":0.20,"damage_reduction":0.13}', 'Master of the Stone Wall.'),
(3, 10, 'Grandmaster',  '👑', 75, '{"def":0.32,"md":0.18,"maxHp":0.15}', '{"block_bonus":0.22,"damage_reduction":0.15}', 'You are the immovable object.');

-- DRUID'S WAY ranks
INSERT IGNORE INTO game_fighting_style_ranks (style_id, rank_num, label, icon, wins_required, stat_bonuses, passive_effects, description) VALUES
(4, 1,  'Sapling',      '🌱', 0,  '{"mo":0.03,"md":0.03}',            NULL,                              'You attune to the natural world.'),
(4, 2,  'Seedling',     '🌿', 3,  '{"mo":0.05,"md":0.05}',            '{"heal_bonus":0.05}',             'Life energy flows through your touch.'),
(4, 3,  'Sprout',       '🌳', 6,  '{"mo":0.08,"md":0.08}',            '{"heal_bonus":0.08,"status_resist":0.05}', 'You resist corruption.'),
(4, 4,  'Rooted',       '🍃', 10, '{"mo":0.10,"md":0.10}',            '{"heal_bonus":0.10,"status_resist":0.08}', 'The earth lends you strength.'),
(4, 5,  'Branch',       '🌲', 15, '{"mo":0.13,"md":0.13}',            '{"heal_bonus":0.13,"status_resist":0.10,"regen":0.01}', 'You regenerate naturally.'),
(4, 6,  'Canopy',       '🍀', 22, '{"mo":0.16,"md":0.16}',            '{"heal_bonus":0.16,"status_resist":0.12,"regen":0.02}', 'Allies feel safer near you.'),
(4, 7,  'Ancient',      '🌕', 30, '{"mo":0.19,"md":0.19}',            '{"heal_bonus":0.19,"status_resist":0.14,"regen":0.02}', 'Your connection to the land deepens.'),
(4, 8,  'Elder',        '✨', 40, '{"mo":0.22,"md":0.22}',            '{"heal_bonus":0.22,"status_resist":0.16,"regen":0.03}', 'The spirits answer your call.'),
(4, 9,  'Archdruid',    '🌙', 55, '{"mo":0.25,"md":0.25}',            '{"heal_bonus":0.25,"status_resist":0.18,"regen":0.03}', 'Master of the Druid''s Way.'),
(4, 10, 'World Tree',   '👑', 75, '{"mo":0.30,"md":0.30,"maxHp":0.10}', '{"heal_bonus":0.30,"status_resist":0.20,"regen":0.04}', 'You are one with all living things.');

-- BERSERKER RAGE ranks
INSERT IGNORE INTO game_fighting_style_ranks (style_id, rank_num, label, icon, wins_required, stat_bonuses, passive_effects, description) VALUES
(5, 1,  'Spark',        '🔥', 0,  '{"atk":0.05,"def":-0.03}',         NULL,                              'The rage flickers within.'),
(5, 2,  'Ember',        '🔥', 3,  '{"atk":0.08,"def":-0.04}',         '{"low_hp_bonus":0.05}',           'Pain fuels you.'),
(5, 3,  'Flame',        '🔥', 6,  '{"atk":0.12,"def":-0.05}',         '{"low_hp_bonus":0.08,"combo_chance":0.05}', 'You fight harder when wounded.'),
(5, 4,  'Blaze',        '🔥', 10, '{"atk":0.16,"def":-0.06,"speed":0.03}', '{"low_hp_bonus":0.10,"combo_chance":0.08}', 'Each cut you take makes you stronger.'),
(5, 5,  'Inferno',      '🔥', 15, '{"atk":0.20,"def":-0.07,"speed":0.05}', '{"low_hp_bonus":0.13,"combo_chance":0.10}', 'You laugh at pain.'),
(5, 6,  'Firestorm',    '🔥', 22, '{"atk":0.24,"def":-0.08,"speed":0.07}', '{"low_hp_bonus":0.16,"combo_chance":0.12}', 'Enemies hesitate before engaging you.'),
(5, 7,  'Conflagration', '🔥', 30, '{"atk":0.28,"def":-0.09,"speed":0.09}', '{"low_hp_bonus":0.19,"combo_chance":0.14}', 'Your fury is an avalanche.'),
(5, 8,  'Cataclysm',    '🔥', 40, '{"atk":0.32,"def":-0.10,"speed":0.11}', '{"low_hp_bonus":0.22,"combo_chance":0.16}', 'The battlefield trembles.'),
(5, 9,  'Ragnarok',     '🔥', 55, '{"atk":0.36,"def":-0.11,"speed":0.13}', '{"low_hp_bonus":0.25,"combo_chance":0.18}', 'Master of the Berserker Rage.'),
(5, 10, 'World Ender',  '👑', 75, '{"atk":0.40,"def":-0.12,"speed":0.15,"luck":0.05}', '{"low_hp_bonus":0.30,"combo_chance":0.20}', 'You are destruction incarnate.');


-- =================================================================
-- SESSION 14: TOURNAMENTS
-- =================================================================

CREATE TABLE IF NOT EXISTS game_tournaments (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(128) NOT NULL,
    description         TEXT         DEFAULT NULL,
    arena_id            INT          DEFAULT NULL,
    type                ENUM('SINGLE_ELIM','DOUBLE_ELIM','ROUND_ROBIN','SWISS') NOT NULL DEFAULT 'SINGLE_ELIM',
    status              ENUM('DRAFT','SCHEDULED','REGISTRATION','ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
    schedule_type       ENUM('once','weekly','biweekly','monthly','bimonthly','quarterly','yearly') NOT NULL DEFAULT 'once',
    schedule_day        INT          DEFAULT NULL COMMENT 'day of week (0=Sun) or day of month',
    schedule_time       TIME         DEFAULT '18:00:00',
    next_occurrence     DATETIME     DEFAULT NULL,
    auto_create         TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'auto-create next tournament on completion',
    entry_fee           INT          NOT NULL DEFAULT 0,
    min_level           INT          NOT NULL DEFAULT 1,
    max_level           INT          NOT NULL DEFAULT 99,
    max_participants    INT          NOT NULL DEFAULT 16,
    level_matching      TINYINT(1)   NOT NULL DEFAULT 0,
    force_nonlethal     TINYINT(1)   NOT NULL DEFAULT 1,
    allow_sig_techs     TINYINT(1)   NOT NULL DEFAULT 1,
    allow_items         TINYINT(1)   NOT NULL DEFAULT 0,
    allow_ki_channeling TINYINT(1)   NOT NULL DEFAULT 1,
    heal_between_rounds TINYINT(1)   NOT NULL DEFAULT 1,
    prize_pool_json     JSON         DEFAULT NULL COMMENT '{"1st":{"gold":1000,"items":[]},"2nd":{"gold":500},"3rd":{"gold":250}}',
    registration_start  DATETIME     DEFAULT NULL,
    registration_end    DATETIME     DEFAULT NULL,
    started_at          DATETIME     DEFAULT NULL,
    ended_at            DATETIME     DEFAULT NULL,
    winner_char_id      INT          DEFAULT NULL,
    created_by          INT          DEFAULT NULL,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_next (next_occurrence)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_tournament_participants (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id   INT          NOT NULL,
    character_id    INT          NOT NULL,
    seed            INT          DEFAULT NULL,
    status          ENUM('registered','active','eliminated','winner','withdrawn') NOT NULL DEFAULT 'registered',
    wins            INT          NOT NULL DEFAULT 0,
    losses          INT          NOT NULL DEFAULT 0,
    registered_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_tourney_char (tournament_id, character_id),
    FOREIGN KEY (tournament_id) REFERENCES game_tournaments(id) ON DELETE CASCADE,
    INDEX idx_tourney (tournament_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_tournament_rounds (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id   INT          NOT NULL,
    round_number    INT          NOT NULL,
    round_name      VARCHAR(64)  DEFAULT NULL COMMENT 'Quarter-Finals, Semi-Finals, Finals, etc.',
    status          ENUM('pending','active','completed') NOT NULL DEFAULT 'pending',
    started_at      DATETIME     DEFAULT NULL,
    ended_at        DATETIME     DEFAULT NULL,
    UNIQUE KEY uq_tourney_round (tournament_id, round_number),
    FOREIGN KEY (tournament_id) REFERENCES game_tournaments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_tournament_matches (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id   INT          NOT NULL,
    round_id        INT          NOT NULL,
    match_order     INT          NOT NULL DEFAULT 0,
    p1_char_id      INT          DEFAULT NULL,
    p2_char_id      INT          DEFAULT NULL,
    winner_char_id  INT          DEFAULT NULL,
    battle_id       INT          DEFAULT NULL COMMENT 'links to game_battles for replay',
    status          ENUM('pending','active','completed','bye') NOT NULL DEFAULT 'pending',
    scheduled_at    DATETIME     DEFAULT NULL,
    completed_at    DATETIME     DEFAULT NULL,
    FOREIGN KEY (tournament_id) REFERENCES game_tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (round_id) REFERENCES game_tournament_rounds(id) ON DELETE CASCADE,
    INDEX idx_tourney_round (tournament_id, round_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_tournament_history (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id   INT          NOT NULL,
    character_id    INT          NOT NULL,
    placement       INT          NOT NULL COMMENT '1=winner, 2=runner-up, 3=third, etc.',
    prize_json      JSON         DEFAULT NULL,
    recorded_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_char (character_id),
    INDEX idx_tourney (tournament_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_tournaments',          'true'),
('tournament_auto_schedule',    'true'),
('tournament_announce_channel', 'global');


-- =================================================================
-- SESSION 15: SUMMONS + SPELL SLOTS
-- =================================================================

-- Extend oghams with summon capability
ALTER TABLE game_oghams
    ADD COLUMN IF NOT EXISTS summon_npc_id INT DEFAULT NULL AFTER grant_skill_id,
    ADD COLUMN IF NOT EXISTS summon_duration INT NOT NULL DEFAULT 3 AFTER summon_npc_id,
    ADD COLUMN IF NOT EXISTS summon_mp_cost INT NOT NULL DEFAULT 0 AFTER summon_duration,
    ADD COLUMN IF NOT EXISTS summon_slot_level INT NOT NULL DEFAULT 1 AFTER summon_mp_cost,
    ADD COLUMN IF NOT EXISTS summon_scaling_json JSON DEFAULT NULL AFTER summon_slot_level;

-- Characters: spell slots
ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS spell_slots_json JSON DEFAULT NULL AFTER can_create_sig_tech;

CREATE TABLE IF NOT EXISTS game_spell_slot_table (
    character_level INT NOT NULL,
    slot_level      INT NOT NULL,
    slot_count      INT NOT NULL DEFAULT 0,
    PRIMARY KEY (character_level, slot_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_spell_slot_table (character_level, slot_level, slot_count) VALUES
(1,1,2),  (2,1,3),  (3,1,4), (3,2,2), (4,1,4), (4,2,3),
(5,1,4),  (5,2,3),  (5,3,2), (6,1,4), (6,2,3), (6,3,3),
(7,1,4),  (7,2,3),  (7,3,3), (7,4,1), (8,1,4), (8,2,3), (8,3,3), (8,4,2),
(9,1,4),  (9,2,3),  (9,3,3), (9,4,3), (9,5,1),
(10,1,4), (10,2,3), (10,3,3),(10,4,3),(10,5,2),
(11,1,4), (11,2,3), (11,3,3),(11,4,3),(11,5,2),
(12,1,4), (12,2,3), (12,3,3),(12,4,3),(12,5,2),
(13,1,4), (13,2,3), (13,3,3),(13,4,3),(13,5,2),
(14,1,4), (14,2,3), (14,3,3),(14,4,3),(14,5,2),
(15,1,4), (15,2,3), (15,3,3),(15,4,3),(15,5,2),
(16,1,4), (16,2,3), (16,3,3),(16,4,3),(16,5,2),
(17,1,4), (17,2,3), (17,3,3),(17,4,3),(17,5,2),
(18,1,4), (18,2,3), (18,3,3),(18,4,3),(18,5,3),
(19,1,4), (19,2,3), (19,3,3),(19,4,3),(19,5,3),
(20,1,4), (20,2,3), (20,3,3),(20,4,3),(20,5,3);

-- Extend skills with spell slot cost
ALTER TABLE game_skills
    ADD COLUMN IF NOT EXISTS spell_slot_level INT DEFAULT NULL AFTER bleed_tier;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_summons',              'true'),
('max_summons_per_player',      '1'),
('summon_cost_type',            'mp'),
('summon_mp_cost_pct',          '0.20'),
('summon_base_duration',        '3'),
('enable_spell_slots',          'false'),
('spell_slots_refresh_on',      'rest');

INSERT IGNORE INTO game_battle_commands (id, name, description, icon, effects, is_defense, defense_type, display_order) VALUES
(17, 'Summon', 'Call forth a spirit bound to your Ogham.', '👻',
 '{"summon":true}', 0, NULL, 17);

ALTER TABLE game_arenas
    ADD COLUMN IF NOT EXISTS override_summons ENUM('on','off','default') NOT NULL DEFAULT 'default' AFTER override_signature_techs;


-- =================================================================
-- SESSION 16: BOSS PHASES + WIN CONDITIONS
-- =================================================================

CREATE TABLE IF NOT EXISTS game_boss_phases (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    npc_id          INT          NOT NULL COMMENT 'game_npcs.id that this phase belongs to',
    phase_number    INT          NOT NULL DEFAULT 1,
    trigger_type    ENUM('hp_pct','turn','manual') NOT NULL DEFAULT 'hp_pct',
    trigger_value   FLOAT        NOT NULL DEFAULT 0.50 COMMENT 'hp_pct: 0.50=at 50% HP. turn: turn number.',
    name            VARCHAR(128) DEFAULT NULL COMMENT 'Phase name: "Enraged", "Final Form"',
    description     TEXT         DEFAULT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
    battle_text     TEXT         DEFAULT NULL COMMENT 'Announced when phase triggers',
    stat_changes    JSON         DEFAULT NULL COMMENT '{"atk":0.30,"speed":0.20} — multiplier bonuses applied on transition',
    new_skill_ids   JSON         DEFAULT NULL COMMENT '[5,12] — skill IDs unlocked in this phase',
    remove_skill_ids JSON        DEFAULT NULL COMMENT '[3] — skill IDs removed in this phase',
    heal_pct        FLOAT        NOT NULL DEFAULT 0 COMMENT '0.20 = heal 20% of maxHp on transition',
    summon_npc_ids  JSON         DEFAULT NULL COMMENT '[7,8] — NPC IDs to summon as adds on transition',
    element_shift   VARCHAR(32)  DEFAULT NULL COMMENT 'boss changes element on phase shift',
    terrain_change  JSON         DEFAULT NULL COMMENT '{"type":"fire","radius":2} — change terrain around boss',
    UNIQUE KEY uq_npc_phase (npc_id, phase_number),
    INDEX idx_npc (npc_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_win_conditions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    condition_type  ENUM('kill_all','survive_turns','protect_npc','kill_target','dps_check','capture_point','escape','no_deaths','pacifist','steal_item','phase_clear','turn_limit','custom') NOT NULL DEFAULT 'kill_all',
    params          JSON         NOT NULL COMMENT 'type-specific params',
    description     VARCHAR(255) DEFAULT NULL COMMENT 'shown to player at battle start',
    success_text    VARCHAR(255) DEFAULT NULL,
    fail_text       VARCHAR(255) DEFAULT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_win_conditions (id, name, condition_type, params, description, success_text, fail_text, icon) VALUES
(1, 'Standard Battle',     'kill_all',       '{}',                                    'Defeat all enemies.',                           'Victory!',              'Defeat.',             '⚔️'),
(2, 'Survive 10 Turns',    'survive_turns',  '{"turns":10}',                          'Survive for 10 turns!',                         'You endured!',          'You fell before time.','⏳'),
(3, 'Protect the Healer',  'protect_npc',    '{"protect_char_id":null}',              'Keep the healer alive!',                        'The healer survived!',  'The healer has fallen!','🛡️'),
(4, 'Slay the Boss',       'kill_target',    '{"target_char_id":null}',               'Defeat the boss — ignore the minions.',          'The boss is slain!',    'The boss survived.',  '👑'),
(5, 'DPS Race',            'dps_check',      '{"damage_required":500,"turn_limit":5}','Deal 500 damage in 5 turns or the boss enrages!','You beat the check!',  'Too slow! Boss enrages!','💥'),
(6, 'Hold the Point',      'capture_point',  '{"x":4,"y":2,"hold_turns":3}',         'Hold the ritual circle for 3 turns!',           'The ritual is complete!','The circle was lost!', '📍'),
(7, 'Escape!',             'escape',         '{"target_x":7,"target_y":4}',           'Reach the exit tile!',                          'You escaped!',          'Trapped!',            '🚪'),
(8, 'Perfect Clear',       'no_deaths',      '{}',                                    'Win without any ally falling.',                  'Flawless victory!',     'An ally has fallen.',  '✨'),
(9, 'Take Them Alive',     'pacifist',       '{}',                                    'Subdue all enemies without killing.',            'All subdued!',          'You killed one!',     '🕊️'),
(10,'Steal the Artifact',  'steal_item',     '{"item_id":null,"target_char_id":null}','Steal the artifact during battle!',              'Artifact secured!',     'Failed to steal it.',  '💎'),
(11,'Break All Seals',     'phase_clear',    '{"target_char_id":null}',               'Push the boss through all phases.',              'All seals broken!',     'Seals remain.',       '🔓'),
(12,'Speed Run',           'turn_limit',     '{"max_turns":8}',                       'Win within 8 turns for bonus rewards!',          'Lightning fast!',       'Too slow!',           '⚡');

CREATE TABLE IF NOT EXISTS game_quest_battle_overrides (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    quest_id        VARCHAR(64)  NOT NULL COMMENT 'quest_definitions.quest_id',
    map_id          INT          DEFAULT NULL COMMENT 'only applies on this map (NULL = any)',
    npc_id          INT          DEFAULT NULL COMMENT 'only applies when fighting this NPC (NULL = any)',
    win_condition_id INT         NOT NULL,
    inject_protect_char_id INT   DEFAULT NULL COMMENT 'dynamically set protect_npc target',
    active          TINYINT(1)   NOT NULL DEFAULT 1,
    INDEX idx_quest (quest_id),
    INDEX idx_map (map_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Extend encounters
ALTER TABLE game_map_spawns
    ADD COLUMN IF NOT EXISTS win_condition_id INT DEFAULT NULL AFTER scaling_factor,
    ADD COLUMN IF NOT EXISTS boss_phase_npc_ids JSON DEFAULT NULL AFTER win_condition_id;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_boss_phases',          'true'),
('enable_custom_win_conditions','true');


-- =================================================================
-- SESSION 17: WEATHER EFFECTS
-- =================================================================

CREATE TABLE IF NOT EXISTS game_weather_effects (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL UNIQUE,
    label           VARCHAR(128) NOT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
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

-- Extend skills for stealth
ALTER TABLE game_skills
    ADD COLUMN IF NOT EXISTS is_stealth_skill TINYINT(1) NOT NULL DEFAULT 0 AFTER spell_slot_level,
    ADD COLUMN IF NOT EXISTS stealth_bonus FLOAT NOT NULL DEFAULT 0 AFTER is_stealth_skill;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_stealth',              'true'),
('stealth_surprise_bonus',      '0.50'),
('stealth_first_strike',        'true'),
('stealth_detection_formula',   'SPEED+LUCK*0.5-ENEMY_SPEED');

INSERT IGNORE INTO game_battle_commands (id, name, description, icon, effects, is_defense, defense_type, display_order) VALUES
(18, 'Stealth', 'Attempt to hide. Next attack from stealth deals bonus damage.', '🥷',
 '{"stealth":true}', 0, NULL, 18);


-- =================================================================
-- SESSION 19: DUAL / LINK ATTACKS
-- =================================================================

CREATE TABLE IF NOT EXISTS game_link_attacks (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
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

-- Track affinity between characters
ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS affinity_json JSON DEFAULT NULL AFTER stealth_level;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_link_attacks',         'true'),
('link_attack_affinity_per_battle', '5');


-- =================================================================
-- SESSION 20: TRANSFORM / POWER-UP
-- =================================================================

CREATE TABLE IF NOT EXISTS game_transformations (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
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

INSERT IGNORE INTO game_battle_commands (id, name, description, icon, effects, is_defense, defense_type, display_order) VALUES
(19, 'Transform', 'Unleash your inner power!', '⭐',
 '{"transform":true}', 0, NULL, 19);

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

-- Extend skills with revive
ALTER TABLE game_skills
    ADD COLUMN IF NOT EXISTS is_revive TINYINT(1) NOT NULL DEFAULT 0 AFTER stealth_bonus,
    ADD COLUMN IF NOT EXISTS revive_hp_pct FLOAT NOT NULL DEFAULT 0.25 AFTER is_revive;

CREATE TABLE IF NOT EXISTS game_battle_traps (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
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


-- =================================================================
-- SESSION 23: ELEMENTAL REACTIONS, THREAT, EQUIP SWAP, AI,
--             STATUS COMBOS, INITIATIVE, AFTERLIFE
-- =================================================================

CREATE TABLE IF NOT EXISTS game_elemental_reactions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    element_a       VARCHAR(32)  NOT NULL,
    element_b       VARCHAR(32)  NOT NULL,
    reaction_name   VARCHAR(64)  NOT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
    description     TEXT         DEFAULT NULL,
    damage_bonus    FLOAT        NOT NULL DEFAULT 0.30 COMMENT 'bonus damage multiplier on trigger',
    aoe_radius      INT          NOT NULL DEFAULT 0 COMMENT '0 = single target, 1+ = splash',
    apply_status    VARCHAR(32)  DEFAULT NULL COMMENT 'status to apply on reaction',
    remove_elements TINYINT(1)   NOT NULL DEFAULT 1 COMMENT 'clear the element auras after reaction',
    battle_text     VARCHAR(255) DEFAULT NULL,
    active          TINYINT(1)   NOT NULL DEFAULT 1,
    UNIQUE KEY uq_elements (element_a, element_b)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_elemental_reactions (element_a, element_b, reaction_name, icon, description, damage_bonus, aoe_radius, apply_status, battle_text) VALUES
('water','lightning', 'Electro-Charged', '⚡', 'Water conducts lightning — chain damage!',        0.40, 1, 'Stun',    'Lightning arcs through the water — Electro-Charged!'),
('water','ice',       'Frozen',          '🧊', 'Water freezes solid — target immobilized!',       0.10, 0, 'Stun',    'Ice crystallizes — the target is Frozen solid!'),
('water','fire',      'Vaporize',        '💨', 'Steam explosion — massive damage!',               0.50, 0, NULL,      'Fire meets water — a massive Vaporize explosion!'),
('fire','ice',        'Melt',            '💧', 'Ice melts under intense heat — bonus damage!',    0.40, 0, NULL,      'The ice Melts away under searing flame!'),
('fire','earth',      'Magma',           '🌋', 'Earth superheats — creates lava terrain!',        0.25, 1, 'Burning', 'The ground erupts into Magma!'),
('ice','lightning',   'Superconduct',    '❄️', 'Frozen shell shatters — defense stripped!',       0.20, 0, 'DEF Down','The frozen shell Superconducts and shatters!'),
('dark','light',      'Annihilation',    '✨', 'Light and dark collide — devastating burst!',     0.60, 1, NULL,      'Dark and light Annihilate each other in a blinding flash!'),
('earth','water',     'Mudslide',        '🌊', 'Mud slows everyone — speed reduced!',             0.15, 1, NULL,      'A Mudslide engulfs the area!'),
('lightning','earth', 'Overload',        '💥', 'Energy overloads through the ground — AoE blast!',0.35, 2, NULL,      'Lightning Overloads through the earth — everything explodes!');

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_elemental_reactions', 'true');

-- Threat / aggro
INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_threat_system',        'true'),
('threat_damage_multiplier',    '1.0'),
('threat_heal_multiplier',      '0.50'),
('threat_taunt_flat',           '50');

-- Equipment swap mid-battle
INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_battle_equip_swap',    'true'),
('equip_swap_costs_turn',       'true');

INSERT IGNORE INTO game_battle_commands (id, name, description, icon, effects, is_defense, defense_type, display_order) VALUES
(20, 'Swap Gear', 'Change your equipped weapon mid-battle. Costs your turn.', '🔄',
 '{"equip_swap":true}', 0, NULL, 20);

-- AI difficulty
INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('ai_difficulty',               'normal'),
('ai_difficulty_easy_mult',     '0.80'),
('ai_difficulty_hard_mult',     '1.20'),
('ai_difficulty_hard_skill_pct','0.80'),
('ai_difficulty_easy_skill_pct','0.30');

-- Status combos
CREATE TABLE IF NOT EXISTS game_status_combos (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    status_a        VARCHAR(64)  NOT NULL COMMENT 'existing status on target',
    status_b        VARCHAR(64)  NOT NULL COMMENT 'status being applied',
    combo_name      VARCHAR(64)  NOT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
    effect_type     ENUM('bonus_damage','guaranteed_crit','remove_both','apply_new','heal_block') NOT NULL,
    effect_value    FLOAT        NOT NULL DEFAULT 0.50 COMMENT 'multiplier or value depending on type',
    apply_status    VARCHAR(32)  DEFAULT NULL,
    description     TEXT         DEFAULT NULL,
    active          TINYINT(1)   NOT NULL DEFAULT 1,
    UNIQUE KEY uq_combo (status_a, status_b)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_status_combos (status_a, status_b, combo_name, icon, effect_type, effect_value, apply_status, description) VALUES
('Burning','Poison',   'Toxic Inferno',   '☠️', 'bonus_damage', 0.50, NULL,       'Poison ignites — devastating explosion!'),
('Stun','Stun',        'Concussion',      '💫', 'bonus_damage', 0.30, NULL,       'Double stun — guaranteed crit window!'),
('Burning','Bleeding',  'Cauterize',      '🩹', 'remove_both',  0,    NULL,       'Fire cauterizes the wound — both effects removed but damage spike!'),
('Blind','Poison',     'Miasma',          '☁️', 'apply_new',    0,    'DEF Down', 'Toxic blindness — defense crumbles!'),
('DEF Down','Burning', 'Exposed Flame',   '🔥', 'bonus_damage', 0.40, NULL,       'No defense against the flames!'),
('Stun','Blind',       'Helpless',        '😵', 'guaranteed_crit', 0, NULL,       'Stunned and blind — any hit is a critical!');

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_status_combos', 'true');

-- Initiative variants
INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('initiative_type',             'speed'),
('initiative_roll_dice',        '20'),
('initiative_roll_bonus_stat',  'speed');

-- Afterlife worlds
CREATE TABLE IF NOT EXISTS game_afterlife_worlds (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL COMMENT 'admin-renamable: "Heaven", "Hell", "King Kai Planet"',
    label           VARCHAR(128) NOT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
    description     TEXT         DEFAULT NULL,
    map_id          INT          DEFAULT NULL COMMENT 'the actual game map for this afterlife world',
    type            ENUM('upper','lower','neutral') NOT NULL DEFAULT 'neutral' COMMENT 'upper=heaven, lower=hell',
    alignment_min   INT          DEFAULT NULL COMMENT 'only go here if alignment >= this',
    alignment_max   INT          DEFAULT NULL COMMENT 'only go here if alignment <= this',
    stay_duration_days INT       NOT NULL DEFAULT 7 COMMENT 'how many real days you stay',
    training_bonus  FLOAT        NOT NULL DEFAULT 0.01 COMMENT 'bonus stat gain while training here',
    has_masters     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'special afterlife masters available',
    max_visits      INT          NOT NULL DEFAULT 0 COMMENT '0=unlimited',
    active          TINYINT(1)   NOT NULL DEFAULT 1,
    INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_death_penalties (
    death_count     INT          NOT NULL PRIMARY KEY,
    base_stat_loss_pct FLOAT     NOT NULL DEFAULT 0.05 COMMENT '% of base stats permanently lost',
    description     VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Character death tracking
ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS death_count INT NOT NULL DEFAULT 0 AFTER affinity_json,
    ADD COLUMN IF NOT EXISTS current_afterlife_id INT DEFAULT NULL AFTER death_count,
    ADD COLUMN IF NOT EXISTS afterlife_return_at DATETIME DEFAULT NULL AFTER current_afterlife_id,
    ADD COLUMN IF NOT EXISTS alignment INT NOT NULL DEFAULT 0 AFTER afterlife_return_at;

INSERT IGNORE INTO game_afterlife_worlds (id, name, label, icon, description, type, alignment_min, alignment_max, stay_duration_days, training_bonus, has_masters) VALUES
(1, 'The Upper Realm', 'Heaven / Tír na nÓg', '☁️',
   'A peaceful realm of eternal light. Heroes train under celestial masters. The worthy may find powerful techniques here.',
   'upper', 1, 10, 7, 0.02, 1),
(2, 'The Lower Realm', 'Hell / Tech Duinn',   '🔥',
   'A harsh realm of shadows and flame. The wicked are tested. Survive and grow stronger — or be broken.',
   'lower', -10, 0, 7, 0.03, 1),
(3, 'The Between',     'Limbo / The Grey',     '🌫️',
   'Neither above nor below. A quiet void where souls wait. Limited training, but peaceful.',
   'neutral', NULL, NULL, 5, 0.01, 0);

INSERT IGNORE INTO game_death_penalties (death_count, base_stat_loss_pct, description) VALUES
(1, 0.05, 'First death: 5% of base stats permanently lost.'),
(2, 0.10, 'Second death: 10% of base stats permanently lost.'),
(3, 0.20, 'Third death: 20% of base stats permanently lost.'),
(4, 0.40, 'Fourth death: 40% of base stats permanently lost.'),
(5, 0.40, 'Fifth+ death: 40% of base stats permanently lost. Cannot visit special afterlife masters.');

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_afterlife',            'true'),
('afterlife_wish_bypass',       'true'),
('afterlife_default_stay_days', '7'),
('afterlife_return_at_half_stats','true');


-- =================================================================
-- SESSION 24: ALIGNMENT SYSTEM + BATTLE RULE BUILDER
-- =================================================================

CREATE TABLE IF NOT EXISTS game_alignment_tiers (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL UNIQUE COMMENT 'paragon, guardian, neutral, corrupt, tyrant, etc.',
    label           VARCHAR(128) NOT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
    min_value       INT          NOT NULL COMMENT 'alignment >= this',
    max_value       INT          NOT NULL COMMENT 'alignment <= this',
    stat_bonuses    JSON         DEFAULT NULL COMMENT 'stat bonus multipliers',
    skill_access    JSON         DEFAULT NULL COMMENT '{"grant":[5,12],"block":[8,9]}',
    shop_price_mult FLOAT        NOT NULL DEFAULT 1.0 COMMENT 'NPC shop price modifier',
    description     TEXT         DEFAULT NULL,
    color           VARCHAR(64)  DEFAULT NULL COMMENT 'CSS color for UI display'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_alignment_actions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    action_key      VARCHAR(64)  NOT NULL UNIQUE COMMENT 'kill_innocent, heal_ally, spare_enemy, steal, etc.',
    label           VARCHAR(128) NOT NULL,
    shift_amount    INT          NOT NULL COMMENT 'positive = toward good, negative = toward evil',
    description     VARCHAR(255) DEFAULT NULL,
    active          TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Equipment with alignment requirements
ALTER TABLE game_items
    ADD COLUMN IF NOT EXISTS alignment_required INT DEFAULT NULL;

-- Skills with alignment gating
ALTER TABLE game_skills
    ADD COLUMN IF NOT EXISTS alignment_required INT DEFAULT NULL;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_alignment_system',     'true'),
('alignment_min',               '-100'),
('alignment_max',               '100'),
('alignment_affects_stats',     'true'),
('alignment_affects_skills',    'true'),
('alignment_affects_shops',     'true');

INSERT IGNORE INTO game_alignment_tiers (id, name, label, icon, min_value, max_value, stat_bonuses, shop_price_mult, description, color) VALUES
(1, 'paragon',   'Paragon',      '✨', 75,  100, '{"mo":0.15,"md":0.15,"luck":0.10}',              0.85, 'A beacon of virtue. Healing and protection amplified.',     'text-[oklch(0.70_0.15_210)]'),
(2, 'guardian',  'Guardian',     '🛡️', 40,   74, '{"mo":0.08,"md":0.08,"def":0.05}',               0.90, 'Protector of the weak. Respected by most.',                 'text-[oklch(0.60_0.15_210)]'),
(3, 'virtuous',  'Virtuous',    '💙', 15,   39, '{"mo":0.04,"md":0.04}',                           0.95, 'Good-hearted. Minor bonuses to supportive abilities.',      'text-[oklch(0.55_0.12_210)]'),
(4, 'neutral',   'Neutral',     '⚖️', -14,  14, '{}',                                               1.00, 'Neither good nor evil. No alignment bonuses or penalties.', 'text-muted-foreground'),
(5, 'dubious',   'Dubious',     '🌙', -39, -15, '{"atk":0.04,"speed":0.04}',                       1.05, 'Morally grey. Minor bonuses to offensive abilities.',       'text-[oklch(0.55_0.12_25)]'),
(6, 'corrupt',   'Corrupt',     '💀', -74, -40, '{"atk":0.08,"speed":0.08,"mo":0.05}',             1.10, 'Embracing the darkness. Feared by many.',                   'text-[oklch(0.60_0.15_25)]'),
(7, 'tyrant',    'Tyrant',      '👹', -100,-75, '{"atk":0.15,"speed":0.10,"luck":0.10,"def":-0.10}',1.20, 'Pure malice. Devastating power at the cost of resilience.', 'text-destructive');

INSERT IGNORE INTO game_alignment_actions (id, action_key, label, shift_amount, description) VALUES
(1,  'spare_enemy',       'Spare a defeated enemy',        5,   'Show mercy after battle.'),
(2,  'release_ko',        'Release a knocked-out NPC',     3,   'Let them go free.'),
(3,  'heal_ally',         'Heal an injured ally',           1,   'Aid a friend in need.'),
(4,  'protect_innocent',  'Protect an innocent NPC',        8,   'Defend those who cannot fight.'),
(5,  'complete_good_quest','Complete a virtuous quest',     10,  'Do good work.'),
(6,  'kill_innocent',     'Kill an innocent NPC',           -10, 'Murder the defenseless.'),
(7,  'steal',             'Steal from someone',             -3,  'Take what isn''t yours.'),
(8,  'torture_ko',        'Interrogate cruelly',            -5,  'Extract information through pain.'),
(9,  'finish_downed',     'Finish a downed PvP opponent',   -8,  'Kill when you could have spared.'),
(10, 'complete_evil_quest','Complete a villainous quest',   -10, 'Serve dark purposes.'),
(11, 'betray_ally',       'Betray an ally',                 -15, 'The ultimate treachery.');

-- No-code battle rule builder
CREATE TABLE IF NOT EXISTS game_battle_rules (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT         DEFAULT NULL,
    priority        INT          NOT NULL DEFAULT 0 COMMENT 'higher = evaluated first',
    enabled         TINYINT(1)   NOT NULL DEFAULT 1,
    scope           ENUM('global','map','arena','encounter','quest') NOT NULL DEFAULT 'global',
    scope_id        INT          DEFAULT NULL COMMENT 'map_id, arena_id, etc. NULL for global',
    trigger_event   ENUM(
        'turn_start','turn_end','battle_start','battle_end',
        'on_damage_dealt','on_damage_taken','on_kill','on_ko',
        'on_heal','on_status_applied','on_status_removed',
        'on_phase_change','on_move','on_flee_attempt',
        'hp_threshold','mp_threshold','turn_number','combatant_count'
    ) NOT NULL DEFAULT 'turn_start',
    target_filter   ENUM(
        'all','all_players','all_enemies','all_allies',
        'active_combatant','target_combatant',
        'lowest_hp','highest_hp','random_enemy','random_ally',
        'boss','summoned','transformed','stealthed'
    ) NOT NULL DEFAULT 'all',
    condition_json  JSON         NOT NULL COMMENT 'conditions to check',
    effect_json     JSON         NOT NULL COMMENT 'effects to apply',
    max_triggers    INT          NOT NULL DEFAULT 0 COMMENT '0 = unlimited, N = max N times per battle',
    cooldown_turns  INT          NOT NULL DEFAULT 0 COMMENT 'turns between triggers',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_scope (scope, scope_id),
    INDEX idx_trigger (trigger_event)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_battle_rules', 'true');

INSERT IGNORE INTO game_battle_rules (id, name, description, trigger_event, target_filter, condition_json, effect_json, scope, priority) VALUES
(1, 'Low HP Enrage',
   'When any enemy drops below 25% HP, they enrage (+20% ATK for 3 turns).',
   'on_damage_taken', 'target_combatant',
   '{"stat":"hp_pct","operator":"<","value":0.25,"target_is":"enemy"}',
   '{"apply_status":"ATK Up","duration":3,"announce":"{name} flies into a rage!"}',
   'global', 10),
(2, 'Overtime Pressure',
   'After turn 15, all combatants take 5% max HP damage per turn.',
   'turn_start', 'all',
   '{"stat":"turn_number","operator":">=","value":15}',
   '{"damage":{"formula":"MAXHP*0.05","type":"neutral"},"announce":"The battlefield grows hostile!"}',
   'global', 5),
(3, 'Last Stand',
   'When only 1 ally remains, they get +30% to all stats.',
   'on_kill', 'all_players',
   '{"combatant_count":"allies","operator":"<=","value":1}',
   '{"stat_mod":{"atk":0.30,"def":0.30,"speed":0.30},"duration":99,"announce":"{name} fights with the fury of the fallen!"}',
   'global', 8),
(4, 'Dark Alignment Aura',
   'Characters with evil alignment (-50 or lower) radiate dark damage to adjacent enemies each turn.',
   'turn_start', 'active_combatant',
   '{"stat":"alignment","operator":"<","value":-50}',
   '{"aoe_damage":{"formula":"MO*0.1","radius":1,"type":"dark"},"announce":"Dark energy radiates from {name}!"}',
   'global', 3);


-- =================================================================
-- SESSION 25: OFFLINE PLAYERS + TRAINING SYSTEM
-- =================================================================

ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS is_offline_visible TINYINT(1) NOT NULL DEFAULT 1 AFTER alignment,
    ADD COLUMN IF NOT EXISTS last_seen DATETIME DEFAULT NULL AFTER is_offline_visible,
    ADD COLUMN IF NOT EXISTS presence_status VARCHAR(32) NOT NULL DEFAULT 'online' AFTER last_seen;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_offline_players',       'true'),
('offline_sleep_after_days',     '3'),
('offline_vulnerable_after_days','3'),
('offline_attack_bonus',         '0.30');

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

INSERT IGNORE INTO game_battle_commands (id, name, description, icon, effects, is_defense, defense_type, display_order) VALUES
(21, 'Spar', 'Request a friendly spar with a nearby player.', '🤝',
 '{"spar":true}', 0, NULL, 21);


-- =================================================================
-- SESSION 26: GAME TERMINOLOGY
-- =================================================================

CREATE TABLE IF NOT EXISTS game_terminology (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    term_key        VARCHAR(64)  NOT NULL UNIQUE COMMENT 'internal key: hp, mp, atk, ki, alignment, etc.',
    display_name    VARCHAR(128) NOT NULL COMMENT 'what the players see',
    short_name      VARCHAR(32)  DEFAULT NULL COMMENT 'abbreviated: HP, MP, ATK',
    icon            VARCHAR(64)  DEFAULT NULL,
    description     VARCHAR(255) DEFAULT NULL COMMENT 'tooltip text',
    category        VARCHAR(32)  NOT NULL DEFAULT 'general' COMMENT 'stats, combat, magic, social, meta',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_terminology (term_key, display_name, short_name, icon, description, category) VALUES
('hp',          'Health Points',    'HP',   '❤️', 'How much damage you can take.',              'stats'),
('mp',          'Mana Points',      'MP',   '💧', 'Resource for casting skills.',               'stats'),
('atk',         'Attack',           'ATK',  '⚔️', 'Physical damage power.',                     'stats'),
('def',         'Defense',          'DEF',  '🛡️', 'Physical damage resistance.',                'stats'),
('mo',          'Magic Offense',    'MO',   '✨', 'Magical damage power.',                      'stats'),
('md',          'Magic Defense',    'MD',   '🔮', 'Magical damage resistance.',                 'stats'),
('speed',       'Speed',            'SPD',  '💨', 'Turn order and dodge chance.',               'stats'),
('luck',        'Luck',             'LCK',  '🍀', 'Critical hit chance and rare drops.',        'stats'),
('level',       'Level',            'Lv.',  '⬆️', 'Character power tier.',                      'stats'),
('experience',  'Experience',       'XP',   '📊', 'Points toward next level.',                  'stats'),
('gold',        'Gold',             'G',    '🪙', 'Currency.',                                  'stats'),
('ki',          'Ki',               'Ki',   '🔥', 'Inner energy for special techniques.',       'combat'),
('limitbreak',  'Limit Break',      'LB',   '⚡', 'Ultimate ability meter.',                    'combat'),
('combo',       'Combo',            'CMB',  '💥', 'Chain of rapid attacks.',                    'combat'),
('crit',        'Critical Hit',     'CRIT', '💢', 'A strike that deals bonus damage.',         'combat'),
('dodge',       'Dodge',            'DDG',  '💨', 'Evade an attack entirely.',                 'combat'),
('block',       'Block',            'BLK',  '🛡️', 'Reduce incoming damage.',                   'combat'),
('counter',     'Counter',          'CTR',  '↩️', 'Strike back after defending.',              'combat'),
('flee',        'Flee',             'FLE',  '🏃', 'Escape from battle.',                       'combat'),
('taunt',       'Taunt',            'TNT',  '😤', 'Draw enemy attention.',                     'combat'),
('intimidate',  'Intimidate',       'INT',  '👁️', 'Shake the enemy.',                          'combat'),
('rally',       'Rally',            'RLY',  '📣', 'Inspire allies.',                           'combat'),
('stealth',     'Stealth',          'STL',  '🥷', 'Hide from enemies.',                        'combat'),
('limb_targeting','Limb Targeting', NULL,   '🦴', 'Target specific body parts.',               'systems'),
('active_defense','Active Defense', NULL,   '🛡️', 'Choose how to defend each attack.',         'systems'),
('nonlethal',   'Non-Lethal',       NULL,   '💫', 'Knock out instead of kill.',                'systems'),
('wound_system','Wound System',     NULL,   '🩸', 'Injuries degrade stats as limbs take damage.','systems'),
('channel_ki',  'Channel Ki',       NULL,   '🔥', 'Surge to full power temporarily.',          'systems'),
('spell_slots', 'Spell Slots',      NULL,   '📖', 'Limited-use ability charges.',              'systems'),
('summon',      'Summon',           NULL,   '👻', 'Call a spirit creature to fight.',          'systems'),
('transform',   'Transform',        NULL,   '⭐', 'Change form for a power boost.',            'systems'),
('sig_tech',    'Signature Technique',NULL,  '⚡', 'Your own custom technique.',                'systems'),
('flavor_text', 'Battle Description',NULL,  '🎭', 'Describe your action for a bonus.',        'rp'),
('narration',   'Battle Narration', NULL,   '📖', 'DM-style combat descriptions.',            'rp'),
('rp_commands', 'RP Commands',      NULL,   '🎭', 'Taunt, Intimidate, Rally.',                'rp'),
('alignment',   'Alignment',        NULL,   '⚖️', 'Moral compass: good vs evil.',             'social'),
('afterlife',   'Afterlife',        NULL,   '👻', 'Where you go when you die.',               'meta'),
('tournament',  'Tournament',       NULL,   '🏆', 'Scheduled competitive events.',            'meta'),
('fighting_style','Fighting Style', NULL,   '🥋', 'Martial arts with rank progression.',      'meta'),
('weather',     'Weather',          NULL,   '🌤️', 'Environmental combat effects.',            'meta'),
('boss_phase',  'Boss Phase',       NULL,   '👑', 'Multi-stage boss encounters.',             'meta');


-- =================================================================
-- RE-ENABLE FOREIGN KEY CHECKS
-- =================================================================

SET FOREIGN_KEY_CHECKS = 1;
