-- =================================================================
-- FINAL 8 RPG MECHANICS — Covers every major RPG's unique system
-- =================================================================

-- =================================================================
-- 1. BREAK/SHIELD SYSTEM (Octopath Traveler)
-- =================================================================
-- Enemies have shield points + weakness list. Hit a weakness = reduce
-- shield by 1. Shield reaches 0 = BREAK (stunned + take extra damage).

ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS shield_points INT NOT NULL DEFAULT 0;
ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS shield_weaknesses JSON DEFAULT NULL;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_break_shield',         'true'),
('break_stun_turns',            '1'),
('break_damage_bonus',          '0.50');


-- =================================================================
-- 2. ONE MORE + BATON PASS (Persona 5)
-- =================================================================
-- Hit an enemy weakness = get an extra action (One More).
-- Can pass that extra action to an ally (Baton Pass) for a damage boost.

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_one_more',             'true'),
('one_more_on_crit',            'true'),
('baton_pass_damage_bonus',     '0.25');


-- =================================================================
-- 3. TURN MANIPULATION (Grandia)
-- =================================================================
-- Certain attacks can push enemies back on the turn order bar,
-- or cancel their action if they're charging.

ALTER TABLE game_skills ADD COLUMN IF NOT EXISTS turn_delay INT NOT NULL DEFAULT 0;
ALTER TABLE game_skills ADD COLUMN IF NOT EXISTS cancels_charge TINYINT(1) NOT NULL DEFAULT 0;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_turn_manipulation',    'true');


-- =================================================================
-- 4. MID-BATTLE PARTY SWAP (Pokemon)
-- =================================================================
-- Players can swap which characters are active mid-fight.
-- Requires a bench/reserve system.

ALTER TABLE characters ADD COLUMN IF NOT EXISTS is_reserve TINYINT(1) NOT NULL DEFAULT 0;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_party_swap',           'true'),
('party_swap_costs_turn',       'true'),
('max_active_party',            '4'),
('max_reserve_party',           '4');


-- =================================================================
-- 5. WEAPON TRIANGLE (Fire Emblem)
-- =================================================================
-- Rock-paper-scissors for weapon categories.

CREATE TABLE IF NOT EXISTS game_weapon_triangle (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    weapon_type_a   VARCHAR(32)  NOT NULL,
    beats           VARCHAR(32)  NOT NULL,
    bonus_damage    FLOAT        NOT NULL DEFAULT 0.15,
    bonus_accuracy  FLOAT        NOT NULL DEFAULT 0.10,
    UNIQUE KEY uq_triangle (weapon_type_a, beats)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_weapon_triangle (weapon_type_a, beats, bonus_damage, bonus_accuracy) VALUES
('sword', 'axe',   0.15, 0.10),
('axe',   'lance', 0.15, 0.10),
('lance', 'sword', 0.15, 0.10),
('bow',   'staff', 0.10, 0.15),
('staff', 'dagger',0.10, 0.15),
('dagger','bow',   0.10, 0.15);

ALTER TABLE game_items ADD COLUMN IF NOT EXISTS weapon_type VARCHAR(32) DEFAULT NULL;

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_weapon_triangle',      'true');


-- =================================================================
-- 6. ADVANTAGE / DISADVANTAGE (D&D 5e / BG3)
-- =================================================================
-- Certain conditions grant advantage (roll twice, take best) or
-- disadvantage (roll twice, take worst) on attacks/defense.

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_advantage_system',     'true');

-- Conditions are tracked as status effects with adv/disadv flags.
-- Existing status system handles this via effects JSON:
-- {"advantage": true} or {"disadvantage": true}


-- =================================================================
-- 7. PASSIVE ABILITIES (Pokemon Abilities / FF9 Support)
-- =================================================================

CREATE TABLE IF NOT EXISTS game_passive_abilities (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL UNIQUE,
    label           VARCHAR(128) NOT NULL,
    icon            VARCHAR(64)  DEFAULT NULL,
    description     TEXT         DEFAULT NULL,
    effects         JSON         NOT NULL,
    slot_type       ENUM('innate','equippable','class','race') NOT NULL DEFAULT 'equippable',
    class_id        INT          DEFAULT NULL,
    race_id         INT          DEFAULT NULL,
    max_equip       INT          NOT NULL DEFAULT 1,
    active          TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_passive_abilities (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    character_id    INT NOT NULL,
    ability_id      INT NOT NULL,
    slot_number     INT NOT NULL DEFAULT 1,
    UNIQUE KEY uq_char_slot (character_id, slot_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_passive_abilities (id, name, label, icon, description, slot_type, effects) VALUES
(1,  'iron_will',     'Iron Will',      '🛡️', 'Reduces all incoming damage by 5%.',           'equippable', '{"damage_reduction":0.05}'),
(2,  'quick_feet',    'Quick Feet',     '💨', '+10% dodge chance.',                            'equippable', '{"dodge_bonus":0.10}'),
(3,  'heavy_hitter',  'Heavy Hitter',   '💪', '+10% physical damage.',                         'equippable', '{"atk_bonus":0.10}'),
(4,  'mana_flow',     'Mana Flow',      '💧', 'Regenerate 3% MP per turn.',                    'equippable', '{"mp_regen_pct":0.03}'),
(5,  'last_stand',    'Last Stand',     '🔥', '+25% ATK when below 25% HP.',                   'equippable', '{"low_hp_atk_bonus":0.25,"threshold":0.25}'),
(6,  'lucky_strike',  'Lucky Strike',   '🍀', '+5% crit chance.',                              'equippable', '{"crit_bonus":0.05}'),
(7,  'elemental_body','Elemental Body', '🌀', 'Nullify one elemental hit per battle.',          'equippable', '{"element_nullify_once":true}'),
(8,  'counter_stance','Counter Stance', '↩️', '+15% counter chance.',                          'equippable', '{"counter_bonus":0.15}'),
(9,  'shield_master', 'Shield Master',  '🛡️', 'Block always reduces at least 25% damage.',     'equippable', '{"guaranteed_block":0.25}'),
(10, 'berserker_soul','Berserker Soul', '😡', '+20% ATK but -10% DEF permanently.',             'equippable', '{"atk_bonus":0.20,"def_penalty":-0.10}');

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_passive_abilities',    'true'),
('max_passive_slots',           '3');


-- =================================================================
-- 8. ROLLING HP (Earthbound / Mother)
-- =================================================================
-- Damage doesn't apply instantly — it ticks down like an odometer.
-- Player can heal or end the battle before HP reaches 0.

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_rolling_hp',           'false'),
('rolling_hp_tick_rate_ms',     '100'),
('rolling_hp_damage_per_tick',  '5');
