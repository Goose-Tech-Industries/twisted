-- =================================================================
-- SESSION 15 — SUMMONS VIA RARE OGHAMS (MP or Spell Slot based)
-- =================================================================

-- Extend oghams with summon capability
ALTER TABLE game_oghams
    ADD COLUMN IF NOT EXISTS summon_npc_id INT DEFAULT NULL
        AFTER grant_skill_id
        COMMENT 'NPC char_id to summon in battle (rare oghams only)',
    ADD COLUMN IF NOT EXISTS summon_duration INT NOT NULL DEFAULT 3
        AFTER summon_npc_id
        COMMENT 'how many turns the summon lasts (scaled by rank)',
    ADD COLUMN IF NOT EXISTS summon_mp_cost INT NOT NULL DEFAULT 0
        AFTER summon_duration
        COMMENT 'flat MP cost to summon (used when summon_cost_type=mp)',
    ADD COLUMN IF NOT EXISTS summon_slot_level INT NOT NULL DEFAULT 1
        AFTER summon_mp_cost
        COMMENT 'spell slot level required (used when summon_cost_type=spell_slot)',
    ADD COLUMN IF NOT EXISTS summon_scaling_json JSON DEFAULT NULL
        AFTER summon_slot_level
        COMMENT '{"hp_per_rank":0.10,"atk_per_rank":0.05} — stat boost per ogham rank';

-- =================================================================
-- SPELL SLOT SYSTEM (BG3-style, togglable)
-- =================================================================
-- Characters have spell slots per level that refresh on rest.
-- Used for summons, powerful skills, or anything the admin gates behind slots.

ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS spell_slots_json JSON DEFAULT NULL
        AFTER can_create_sig_tech
        COMMENT '{"1":{"max":4,"current":4},"2":{"max":3,"current":3},...}';

-- Spell slot config: how many slots per level based on character level
CREATE TABLE IF NOT EXISTS game_spell_slot_table (
    character_level INT NOT NULL,
    slot_level      INT NOT NULL,
    slot_count      INT NOT NULL DEFAULT 0,
    PRIMARY KEY (character_level, slot_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed D&D 5e-inspired spell slot progression (simplified, levels 1-20)
-- Slot levels 1-5 (can extend to 9 if needed)
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

-- Extend skills with optional spell slot cost
ALTER TABLE game_skills
    ADD COLUMN IF NOT EXISTS spell_slot_level INT DEFAULT NULL
        AFTER bleed_tier
        COMMENT 'if set, this skill costs a spell slot of this level instead of / in addition to MP';

-- =================================================================
-- SETTINGS
-- =================================================================

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_summons',              'true'),
('max_summons_per_player',      '1'),
('summon_cost_type',            'mp'),
('summon_mp_cost_pct',          '0.20'),
('summon_base_duration',        '3'),
('enable_spell_slots',          'false'),
('spell_slots_refresh_on',      'rest');

-- Summon command
INSERT IGNORE INTO game_battle_commands (id, name, description, icon, effects, is_defense, defense_type, sort_order) VALUES
(17, 'Summon', 'Call forth a spirit bound to your Ogham.', '👻',
 '{"summon":true}', 0, NULL, 17);

-- Arena override
ALTER TABLE game_arenas
    ADD COLUMN IF NOT EXISTS override_summons ENUM('on','off','default') NOT NULL DEFAULT 'default'
        AFTER override_signature_techs;
