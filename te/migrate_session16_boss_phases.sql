-- =================================================================
-- SESSION 16 — BOSS PHASES + CUSTOM WIN CONDITIONS
-- =================================================================

-- =================================================================
-- 1. BOSS PHASES
-- =================================================================
-- Each NPC enemy can have multiple phases. When their HP drops below
-- a threshold, they transition: stat changes, new skills, heals, adds.

CREATE TABLE IF NOT EXISTS game_boss_phases (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    npc_id          INT          NOT NULL COMMENT 'game_npcs.id that this phase belongs to',
    phase_number    INT          NOT NULL DEFAULT 1,
    trigger_type    ENUM('hp_pct','turn','manual') NOT NULL DEFAULT 'hp_pct',
    trigger_value   FLOAT        NOT NULL DEFAULT 0.50 COMMENT 'hp_pct: 0.50=at 50% HP. turn: turn number.',
    name            VARCHAR(128) DEFAULT NULL COMMENT 'Phase name: "Enraged", "Final Form"',
    description     TEXT         DEFAULT NULL,
    icon            VARCHAR(16)  DEFAULT '⚡',
    battle_text     TEXT         DEFAULT NULL COMMENT 'Announced when phase triggers: "The dragon roars and flames erupt!"',
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


-- =================================================================
-- 2. WIN CONDITIONS
-- =================================================================

CREATE TABLE IF NOT EXISTS game_win_conditions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    condition_type  ENUM('kill_all','survive_turns','protect_npc','kill_target','dps_check','capture_point','escape','no_deaths','pacifist','steal_item','phase_clear','turn_limit','custom') NOT NULL DEFAULT 'kill_all',
    params          JSON         NOT NULL COMMENT 'type-specific params',
    description     VARCHAR(255) DEFAULT NULL COMMENT 'shown to player at battle start',
    success_text    VARCHAR(255) DEFAULT NULL,
    fail_text       VARCHAR(255) DEFAULT NULL,
    icon            VARCHAR(16)  DEFAULT '🎯',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed common win condition templates
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


-- =================================================================
-- 3. QUEST WIN CONDITION INTEGRATION
-- =================================================================
-- Quests can reference win conditions as objectives.
-- objectives_json format: [{"type":"WIN_CONDITION","win_condition_id":3,"label":"Protect the healer in the cave battle"}]
-- When a battle ends with a matching win condition fulfilled, the quest auto-progresses.
--
-- Quests can also INJECT win conditions into encounters:
-- quest_battle_overrides: map win_condition_ids to specific encounter/map contexts

CREATE TABLE IF NOT EXISTS game_quest_battle_overrides (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    quest_id        VARCHAR(64)  NOT NULL COMMENT 'quest_definitions.quest_id',
    map_id          INT          DEFAULT NULL COMMENT 'only applies on this map (NULL = any)',
    npc_id          INT          DEFAULT NULL COMMENT 'only applies when fighting this NPC (NULL = any)',
    win_condition_id INT         NOT NULL,
    inject_protect_char_id INT   DEFAULT NULL COMMENT 'dynamically set protect_npc target (e.g. escort NPC)',
    active          TINYINT(1)   NOT NULL DEFAULT 1,
    INDEX idx_quest (quest_id),
    INDEX idx_map (map_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =================================================================
-- 4. EXTEND ENCOUNTERS
-- =================================================================

ALTER TABLE game_map_spawns
    ADD COLUMN IF NOT EXISTS win_condition_id INT DEFAULT NULL
        AFTER scaling_factor
        COMMENT 'custom win condition for this encounter (NULL = standard kill_all)',
    ADD COLUMN IF NOT EXISTS boss_phase_npc_ids JSON DEFAULT NULL
        AFTER win_condition_id
        COMMENT 'NPC IDs that have boss phases in this encounter';


-- =================================================================
-- 4. SETTINGS
-- =================================================================

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_boss_phases',          'true'),
('enable_custom_win_conditions','true');
