-- =================================================================
-- SESSION 8 — Limb Targeting, Non-Lethal Knockout, Active Defense
-- =================================================================
-- Run ONCE after all prior migrations.
-- Safe to re-run: uses IF NOT EXISTS / INSERT IGNORE throughout.
-- =================================================================


-- =================================================================
-- 1. BODY TYPES — Templates for what zones a combatant has
-- =================================================================
-- Each body type defines which limbs/zones can be targeted.
-- Humanoids have head/torso/arms/legs. Beasts have head/body/legs/tail.
-- A slime (amorphous) has only a core — no limb targeting at all.

CREATE TABLE IF NOT EXISTS game_body_types (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(64)  NOT NULL UNIQUE,
    label       VARCHAR(128) NOT NULL DEFAULT '',
    description TEXT         DEFAULT NULL,
    icon        VARCHAR(16)  DEFAULT '🧍',
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =================================================================
-- 2. LIMB ZONES — Per-body-type zone definitions
-- =================================================================
-- Each row is one targetable zone on a body type.
-- hp_pct:           what fraction of maxHp this zone has (0.25 = 25%)
-- called_shot_penalty: accuracy penalty for targeting this zone (0.0 = none, 0.20 = -20%)
-- wound_effects:    JSON — stat penalties at each wound tier
-- disable_effects:  JSON — what happens when zone HP hits 0
-- sort_order:       display order in the UI body diagram

CREATE TABLE IF NOT EXISTS game_limb_zones (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    body_type_id    INT          NOT NULL,
    zone_key        VARCHAR(32)  NOT NULL,
    label           VARCHAR(64)  NOT NULL,
    icon            VARCHAR(16)  DEFAULT '🦴',
    hp_pct          FLOAT        NOT NULL DEFAULT 0.20,
    called_shot_penalty FLOAT    NOT NULL DEFAULT 0.0,
    bleed_through   FLOAT        NOT NULL DEFAULT 0.60 COMMENT 'fraction of limb damage that also hits main HP',
    wound_effects   JSON         DEFAULT NULL COMMENT '{"light":{"speed":-0.15},"heavy":{"speed":-0.30}}',
    disable_effects JSON         DEFAULT NULL COMMENT '{"prone":true,"cant_flee":true,"speed":-0.50}',
    sort_order      INT          NOT NULL DEFAULT 0,
    UNIQUE KEY uq_body_zone (body_type_id, zone_key),
    FOREIGN KEY (body_type_id) REFERENCES game_body_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =================================================================
-- 3. SEED BODY TYPES
-- =================================================================

INSERT IGNORE INTO game_body_types (id, name, label, icon, description) VALUES
(1, 'humanoid',  'Humanoid',  '🧍', 'Standard bipedal — head, torso, two arms, legs. Humans, elves, dwarves, etc.'),
(2, 'beast',     'Beast',     '🐺', 'Four-legged creature — head, body, front legs, hind legs, tail.'),
(3, 'serpent',   'Serpent',   '🐍', 'Elongated body — head, body, tail. Snakes, wyrms, eels.'),
(4, 'amorphous', 'Amorphous', '🫧', 'Formless — core only. Slimes, spirits, elementals. Cannot be limb-targeted.');


-- =================================================================
-- 4. SEED LIMB ZONES — Humanoid
-- =================================================================
-- HP distribution: Head 25%, Torso 40%, Left Arm 15%, Right Arm 15%, Legs 20%
-- Note: total exceeds 100% intentionally — limbs are independent pools
-- (like Mado's approach where each body part has its own durability)

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

-- AMORPHOUS (single zone — core only, no called shots)
(4, 'core',  'Core',  '🫧', 1.00, 0.00, 1.00,
    NULL,
    NULL,
    1);


-- =================================================================
-- 5. EXTEND game_npcs WITH BODY TYPE
-- =================================================================
-- Default = 1 (humanoid). Admins can set beast/serpent/amorphous per NPC.

ALTER TABLE game_npcs
    ADD COLUMN IF NOT EXISTS body_type_id INT NOT NULL DEFAULT 1 AFTER is_recruitable;


-- =================================================================
-- 6. EXTEND game_skills WITH NON-LETHAL FLAG
-- =================================================================
-- Skills flagged nonlethal will KO instead of kill when they deal the
-- finishing blow (e.g. a "Pommel Strike" or "Sleeper Hold" skill).

ALTER TABLE game_skills
    ADD COLUMN IF NOT EXISTS is_nonlethal TINYINT(1) NOT NULL DEFAULT 0
        AFTER target_type;


-- =================================================================
-- 7. EXTEND game_skills WITH LIMB HEAL SUPPORT
-- =================================================================
-- Skills can specify which limb they heal. NULL = heals main HP only.
-- 'any' = player picks the limb at cast time.

ALTER TABLE game_skills
    ADD COLUMN IF NOT EXISTS heal_limb VARCHAR(32) DEFAULT NULL
        AFTER is_nonlethal
        COMMENT 'Zone key to heal (head/torso/etc), "any" for player choice, NULL for main HP only';


-- =================================================================
-- 8. FEATURE FLAGS in system_settings
-- =================================================================
-- Every Session 8 mechanic is togglable. OFF = vanilla FF7-style battles.

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_limb_targeting',       'true'),
('enable_active_defense',       'true'),
('enable_nonlethal',            'true'),
('enable_diminishing_returns',  'true'),
('enable_wound_degradation',    'true'),
('enable_called_shot_penalty',  'true');

-- Tunable parameters (admins can tweak these in AdminSauce → Settings)
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


-- =================================================================
-- 9. EXTEND game_arenas WITH SESSION 8 OVERRIDES
-- =================================================================
-- Per-arena overrides: some arenas might force nonlethal (tournament),
-- or disable limb targeting for fairness, etc.

ALTER TABLE game_arenas
    ADD COLUMN IF NOT EXISTS override_limb_targeting    ENUM('on','off','default') NOT NULL DEFAULT 'default' AFTER max_combatants,
    ADD COLUMN IF NOT EXISTS override_active_defense    ENUM('on','off','default') NOT NULL DEFAULT 'default' AFTER override_limb_targeting,
    ADD COLUMN IF NOT EXISTS override_nonlethal         ENUM('on','off','default') NOT NULL DEFAULT 'default' AFTER override_active_defense,
    ADD COLUMN IF NOT EXISTS override_diminishing_returns ENUM('on','off','default') NOT NULL DEFAULT 'default' AFTER override_nonlethal;


-- =================================================================
-- 10. EXTEND game_battle_commands FOR DEFENSE TYPES
-- =================================================================
-- Commands like "Dodge", "Block", "Counter" used in the active defense
-- prompt. These are separate from normal attack commands — they fire
-- during the defender's response window, not on their turn.

ALTER TABLE game_battle_commands
    ADD COLUMN IF NOT EXISTS is_defense     TINYINT(1) NOT NULL DEFAULT 0 AFTER effects,
    ADD COLUMN IF NOT EXISTS defense_type   ENUM('dodge','block','counter') DEFAULT NULL AFTER is_defense;

-- Seed defense commands (these won't show in the normal attack menu —
-- they only appear in the defense prompt overlay)
INSERT IGNORE INTO game_battle_commands (id, name, description, icon, effects, is_defense, defense_type, sort_order) VALUES
(10, 'Dodge',   'Attempt to evade the attack entirely.',     '💨', '{"defense":"dodge"}',   1, 'dodge',   10),
(11, 'Block',   'Brace and try to absorb the blow.',         '🛡️', '{"defense":"block"}',   1, 'block',   11),
(12, 'Counter', 'Attempt to turn the attack back on them.',  '↩️', '{"defense":"counter"}', 1, 'counter', 12);


-- =================================================================
-- 11. KO TRACKING TABLE — Post-battle interaction with KO'd NPCs
-- =================================================================
-- When an NPC is knocked out (not killed), a row is created here.
-- The winning player(s) can then interact with the KO'd NPC after
-- the battle ends: interrogate, recruit, loot, or release.

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


-- =================================================================
-- 12. BATTLE LIMB STATE TABLE — Persists limb HP across reconnects
-- =================================================================
-- In-memory during battle, but snapshotted here on disconnect/reconnect
-- and at battle end for replay/logging. Optional — engine works without it.

CREATE TABLE IF NOT EXISTS game_battle_limb_state (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    battle_id       INT          NOT NULL,
    character_id    INT          NOT NULL,
    limb_hp_json    JSON         NOT NULL COMMENT '{"head":{"current":50,"max":50},"torso":{"current":80,"max":80},...}',
    wound_levels_json JSON       DEFAULT NULL COMMENT '{"head":"normal","legs":"heavy",...}',
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_battle_char (battle_id, character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
