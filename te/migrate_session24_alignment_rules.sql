-- =================================================================
-- SESSION 24 — Alignment System + No-Code Battle Rule Builder
-- =================================================================


-- =================================================================
-- 1. ALIGNMENT SYSTEM (KOTOR / Mass Effect style)
-- =================================================================
-- Scale: -100 (pure evil) to +100 (pure good). 0 = neutral.
-- Alignment affects: stat bonuses, skill access, equipment,
-- NPC reactions, afterlife destination, shop prices.

-- Alignment tiers define the thresholds and bonuses at each level
CREATE TABLE IF NOT EXISTS game_alignment_tiers (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL UNIQUE COMMENT 'paragon, guardian, neutral, corrupt, tyrant, etc.',
    label           VARCHAR(128) NOT NULL,
    icon            VARCHAR(16)  DEFAULT '⚖️',
    min_value       INT          NOT NULL COMMENT 'alignment >= this',
    max_value       INT          NOT NULL COMMENT 'alignment <= this',
    stat_bonuses    JSON         DEFAULT NULL COMMENT '{"mo":0.10,"md":0.10} for light side, {"atk":0.10,"speed":0.05} for dark',
    skill_access    JSON         DEFAULT NULL COMMENT '{"grant":[5,12],"block":[8,9]} — skills granted or blocked',
    shop_price_mult FLOAT        NOT NULL DEFAULT 1.0 COMMENT 'NPC shop price modifier (evil = higher, good = lower)',
    description     TEXT         DEFAULT NULL,
    color           VARCHAR(64)  DEFAULT NULL COMMENT 'CSS color for UI display'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Actions that shift alignment
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
    ADD COLUMN IF NOT EXISTS alignment_required INT DEFAULT NULL
        COMMENT 'min alignment to equip (positive = good required, negative = evil required)';

-- Skills with alignment gating
ALTER TABLE game_skills
    ADD COLUMN IF NOT EXISTS alignment_required INT DEFAULT NULL
        COMMENT 'min alignment to use (positive = good, negative = evil)';

-- Widen the alignment column on characters (already exists from Session 23, just ensure range)
-- characters.alignment is INT, -100 to +100

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_alignment_system',     'true'),
('alignment_min',               '-100'),
('alignment_max',               '100'),
('alignment_affects_stats',     'true'),
('alignment_affects_skills',    'true'),
('alignment_affects_shops',     'true');

-- Seed alignment tiers (renamable by admin!)
INSERT IGNORE INTO game_alignment_tiers (id, name, label, icon, min_value, max_value, stat_bonuses, shop_price_mult, description, color) VALUES
(1, 'paragon',   'Paragon',      '✨', 75,  100, '{"mo":0.15,"md":0.15,"luck":0.10}',              0.85, 'A beacon of virtue. Healing and protection amplified.',     'text-[oklch(0.70_0.15_210)]'),
(2, 'guardian',  'Guardian',     '🛡️', 40,   74, '{"mo":0.08,"md":0.08,"def":0.05}',               0.90, 'Protector of the weak. Respected by most.',                 'text-[oklch(0.60_0.15_210)]'),
(3, 'virtuous',  'Virtuous',    '💙', 15,   39, '{"mo":0.04,"md":0.04}',                           0.95, 'Good-hearted. Minor bonuses to supportive abilities.',      'text-[oklch(0.55_0.12_210)]'),
(4, 'neutral',   'Neutral',     '⚖️', -14,  14, '{}',                                               1.00, 'Neither good nor evil. No alignment bonuses or penalties.', 'text-muted-foreground'),
(5, 'dubious',   'Dubious',     '🌙', -39, -15, '{"atk":0.04,"speed":0.04}',                       1.05, 'Morally grey. Minor bonuses to offensive abilities.',       'text-[oklch(0.55_0.12_25)]'),
(6, 'corrupt',   'Corrupt',     '💀', -74, -40, '{"atk":0.08,"speed":0.08,"mo":0.05}',             1.10, 'Embracing the darkness. Feared by many.',                   'text-[oklch(0.60_0.15_25)]'),
(7, 'tyrant',    'Tyrant',      '👹', -100,-75, '{"atk":0.15,"speed":0.10,"luck":0.10,"def":-0.10}',1.20, 'Pure malice. Devastating power at the cost of resilience.', 'text-destructive');

-- Seed alignment actions (admin can add more)
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


-- =================================================================
-- 2. NO-CODE BATTLE RULE BUILDER
-- =================================================================
-- Admins create custom battle rules via the ACP. Each rule is an
-- IF-THEN statement: IF condition THEN effect. Evaluated each turn
-- or on specific triggers. No code needed — all via dropdowns/inputs.

CREATE TABLE IF NOT EXISTS game_battle_rules (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT         DEFAULT NULL,
    priority        INT          NOT NULL DEFAULT 0 COMMENT 'higher = evaluated first',
    enabled         TINYINT(1)   NOT NULL DEFAULT 1,
    scope           ENUM('global','map','arena','encounter','quest') NOT NULL DEFAULT 'global',
    scope_id        INT          DEFAULT NULL COMMENT 'map_id, arena_id, etc. NULL for global',

    -- WHEN does it fire?
    trigger_event   ENUM(
        'turn_start','turn_end','battle_start','battle_end',
        'on_damage_dealt','on_damage_taken','on_kill','on_ko',
        'on_heal','on_status_applied','on_status_removed',
        'on_phase_change','on_move','on_flee_attempt',
        'hp_threshold','mp_threshold','turn_number','combatant_count'
    ) NOT NULL DEFAULT 'turn_start',

    -- WHO does it apply to?
    target_filter   ENUM(
        'all','all_players','all_enemies','all_allies',
        'active_combatant','target_combatant',
        'lowest_hp','highest_hp','random_enemy','random_ally',
        'boss','summoned','transformed','stealthed'
    ) NOT NULL DEFAULT 'all',

    -- IF condition (JSON — evaluated by engine)
    condition_json  JSON         NOT NULL COMMENT 'conditions to check',
    -- Example conditions:
    -- {"stat":"hp_pct","operator":"<","value":0.25}
    -- {"stat":"turn_number","operator":">=","value":10}
    -- {"stat":"alignment","operator":"<","value":-50}
    -- {"has_status":"Burning"}
    -- {"element_aura":"water"}
    -- {"combatant_count":"enemies","operator":"<=","value":1}

    -- THEN effect (JSON — applied by engine)
    effect_json     JSON         NOT NULL COMMENT 'effects to apply',
    -- Example effects:
    -- {"apply_status":"Enrage","duration":3}
    -- {"stat_mod":{"atk":0.20,"speed":0.10},"duration":2}
    -- {"damage":{"formula":"MAXHP*0.05","type":"fire"}}
    -- {"heal":{"formula":"MAXHP*0.10"}}
    -- {"terrain_change":{"type":"fire","radius":1}}
    -- {"summon_npc_id":5}
    -- {"announce":"The ground trembles!"}
    -- {"end_battle":{"winner":"enemies","text":"You have been overwhelmed!"}}
    -- {"apply_weather":"storm"}
    -- {"alignment_shift":-5}

    -- How often can it fire?
    max_triggers    INT          NOT NULL DEFAULT 0 COMMENT '0 = unlimited, N = max N times per battle',
    cooldown_turns  INT          NOT NULL DEFAULT 0 COMMENT 'turns between triggers',

    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_scope (scope, scope_id),
    INDEX idx_trigger (trigger_event)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_battle_rules', 'true');

-- Seed some example rules that admins can modify/duplicate
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
