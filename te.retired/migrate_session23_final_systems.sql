-- =================================================================
-- SESSION 23 — Final Systems: Elemental Reactions, Aggro/Threat,
--   Equipment Swap, AI Difficulty, Status Combos, Initiative
--   Variants, Death/Afterlife World System
-- =================================================================


-- =================================================================
-- 1. ELEMENTAL REACTIONS (Genshin-style)
-- =================================================================
-- When two elements interact on a target, a reaction triggers.
-- e.g. Wet + Lightning = Electro-Charged (bonus damage + chain)

CREATE TABLE IF NOT EXISTS game_elemental_reactions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    element_a       VARCHAR(32)  NOT NULL,
    element_b       VARCHAR(32)  NOT NULL,
    reaction_name   VARCHAR(64)  NOT NULL,
    icon            VARCHAR(16)  DEFAULT '💥',
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


-- =================================================================
-- 2. THREAT / AGGRO TABLE
-- =================================================================

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_threat_system',        'true'),
('threat_damage_multiplier',    '1.0'),
('threat_heal_multiplier',      '0.50'),
('threat_taunt_flat',           '50');

-- No new table needed — threat tracked in-memory per combatant during battle.
-- Tracked as: combatant._threatTable = { targetCharId: threatValue }


-- =================================================================
-- 3. EQUIPMENT SWAP MID-BATTLE
-- =================================================================

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_battle_equip_swap',    'true'),
('equip_swap_costs_turn',       'true');

-- Command
INSERT IGNORE INTO game_battle_commands (id, name, description, icon, effects, is_defense, defense_type, sort_order) VALUES
(20, 'Swap Gear', 'Change your equipped weapon mid-battle. Costs your turn.', '🔄',
 '{"equip_swap":true}', 0, NULL, 20);


-- =================================================================
-- 4. AI DIFFICULTY LEVELS
-- =================================================================

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('ai_difficulty',               'normal'),
('ai_difficulty_easy_mult',     '0.80'),
('ai_difficulty_hard_mult',     '1.20'),
('ai_difficulty_hard_skill_pct','0.80'),
('ai_difficulty_easy_skill_pct','0.30');


-- =================================================================
-- 5. STATUS COMBOS
-- =================================================================
-- When a target has status A and gets hit with status B, a combo triggers.

CREATE TABLE IF NOT EXISTS game_status_combos (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    status_a        VARCHAR(64)  NOT NULL COMMENT 'existing status on target',
    status_b        VARCHAR(64)  NOT NULL COMMENT 'status being applied',
    combo_name      VARCHAR(64)  NOT NULL,
    icon            VARCHAR(16)  DEFAULT '💥',
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


-- =================================================================
-- 6. INITIATIVE VARIANTS
-- =================================================================

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('initiative_type',             'speed'),
('initiative_roll_dice',        '20'),
('initiative_roll_bonus_stat',  'speed');

-- initiative_type options:
-- 'speed'     = current system (speed-sorted queue, FF7 ATB style)
-- 'roll'      = D&D style (d20 + speed modifier, re-rolled each round)
-- 'phased'    = side turns (all of team 1 goes, then all of team 2)
-- 'countdown' = FF Tactics style (speed determines countdown, faster = more turns)


-- =================================================================
-- 7. DEATH / AFTERLIFE WORLD SYSTEM
-- =================================================================
-- When a character dies (not KO'd), they go to an afterlife world.
-- They stay for X real-time days, can train/explore there.
-- On return: stat penalties based on death count. All renamable.

CREATE TABLE IF NOT EXISTS game_afterlife_worlds (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL COMMENT 'admin-renamable: "Heaven", "Hell", "King Kai Planet"',
    label           VARCHAR(128) NOT NULL,
    icon            VARCHAR(16)  DEFAULT '👻',
    description     TEXT         DEFAULT NULL,
    map_id          INT          DEFAULT NULL COMMENT 'the actual game map for this afterlife world',
    type            ENUM('upper','lower','neutral') NOT NULL DEFAULT 'neutral' COMMENT 'upper=heaven, lower=hell',
    alignment_min   INT          DEFAULT NULL COMMENT 'only go here if alignment >= this',
    alignment_max   INT          DEFAULT NULL COMMENT 'only go here if alignment <= this',
    stay_duration_days INT       NOT NULL DEFAULT 7 COMMENT 'how many real days you stay',
    training_bonus  FLOAT        NOT NULL DEFAULT 0.01 COMMENT 'bonus stat gain while training here',
    has_masters     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'special afterlife masters available',
    max_visits      INT          NOT NULL DEFAULT 0 COMMENT '0=unlimited, 5=after 5 deaths cant return to this world',
    active          TINYINT(1)   NOT NULL DEFAULT 1,
    INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_death_penalties (
    death_count     INT          NOT NULL PRIMARY KEY,
    base_stat_loss_pct FLOAT     NOT NULL DEFAULT 0.05 COMMENT '% of base stats permanently lost',
    description     VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Track character deaths
ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS death_count INT NOT NULL DEFAULT 0 AFTER affinity_json,
    ADD COLUMN IF NOT EXISTS current_afterlife_id INT DEFAULT NULL AFTER death_count,
    ADD COLUMN IF NOT EXISTS afterlife_return_at DATETIME DEFAULT NULL AFTER current_afterlife_id,
    ADD COLUMN IF NOT EXISTS alignment INT NOT NULL DEFAULT 0 AFTER afterlife_return_at
        COMMENT '-10 to +10 alignment scale';

-- Seed afterlife worlds (admin-renamable!)
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

-- Seed death penalties (Mado: 5% first death, 10% second, 20%, 40%, then stays at 40%)
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
