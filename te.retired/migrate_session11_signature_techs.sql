-- =================================================================
-- SESSION 11 — Signature Techniques (Player-Created Skills via RP)
-- =================================================================
-- Run ONCE after migrate_session10_ki_bleed.sql.
-- Safe to re-run: uses IF NOT EXISTS / INSERT IGNORE throughout.
-- =================================================================


-- =================================================================
-- 1. SIGNATURE LEVEL PROGRESSION TABLE
-- =================================================================
-- 10-level progression matching Planet Mado's system.
-- damage_pct / cost_pct are the technique's power at that level.
-- ability_slots tracks cumulative unlocked special ability slots.
-- xp_required is total XP needed to reach this level.

CREATE TABLE IF NOT EXISTS game_signature_levels (
    level           INT          NOT NULL PRIMARY KEY,
    damage_pct      FLOAT        NOT NULL COMMENT 'for ki_attack type: % of powerlevel as damage',
    cost_pct        FLOAT        NOT NULL COMMENT 'for ki_attack type: % of current HP as cost',
    heal_pct        FLOAT        NOT NULL DEFAULT 0 COMMENT 'for ki_heal type: % of target HP healed',
    ability_slots   INT          NOT NULL DEFAULT 0 COMMENT 'cumulative special ability slots unlocked at this level',
    xp_required     INT          NOT NULL DEFAULT 0 COMMENT 'total XP needed to reach this level',
    description     VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Mado progression for Ki Attack signature techs:
-- Level 1: 10% dmg, 1% cost | Level 2: 11%, 2% | Level 3: 12%, 3% (+1 ability)
-- Level 4: 14%, 4% | Level 5: 16%, 5% (+1 ability) | Level 6: 18%, 6%
-- Level 7: 20%, 8% | Level 8: 23%, 10% (+1 ability) | Level 9: 26%, 12%
-- Level 10: 30%, 14% (+1 ability)
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


-- =================================================================
-- 2. SIGNATURE SPECIAL ABILITIES
-- =================================================================
-- Available abilities players can slot into their techniques at
-- certain levels. Each has tradeoffs (cost/damage modifiers).
-- Based on Planet Mado's custom technique special abilities.

CREATE TABLE IF NOT EXISTS game_signature_abilities (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL UNIQUE,
    label           VARCHAR(128) NOT NULL,
    icon            VARCHAR(16)  DEFAULT '⚡',
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

-- Seed abilities from Planet Mado rules
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


-- =================================================================
-- 3. CHARACTER SIGNATURE TECHNIQUES
-- =================================================================

CREATE TABLE IF NOT EXISTS character_signature_techs (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    character_id    INT          NOT NULL,
    name            VARCHAR(128) NOT NULL,
    icon            VARCHAR(16)  DEFAULT '⚡',
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


-- =================================================================
-- 4. EQUIPPED ABILITIES ON SIGNATURE TECHS
-- =================================================================

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


-- =================================================================
-- 5. FLAVOR TEXT HISTORY — Tracks RP for technique discovery
-- =================================================================
-- Every flavor text a player uses is logged here. The pattern
-- detection system analyzes this to discover emerging techniques.

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


-- =================================================================
-- 6. FEATURE FLAGS
-- =================================================================

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_signature_techs',          'true'),
('sig_tech_discovery_threshold',    '10'),
('sig_tech_xp_per_use',            '10'),
('sig_tech_max_per_character',      '3'),
('sig_tech_min_flavor_length',      '15');


-- =================================================================
-- 7. ARENA OVERRIDE
-- =================================================================

ALTER TABLE game_arenas
    ADD COLUMN IF NOT EXISTS override_signature_techs ENUM('on','off','default') NOT NULL DEFAULT 'default'
        AFTER override_ki_channeling;
