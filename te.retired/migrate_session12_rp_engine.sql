-- =================================================================
-- SESSION 12 — RP ENGINE: Master Training, Description Engine,
--              Battle Narration, RP Combat Commands
-- =================================================================
-- Run ONCE after migrate_session11_signature_techs.sql.
-- Safe to re-run: uses IF NOT EXISTS / INSERT IGNORE throughout.
-- =================================================================


-- =================================================================
-- 1. MASTER TRAINING SYSTEM
-- =================================================================

-- Characters: gate signature tech creation behind masters/quests
ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS can_create_sig_tech TINYINT(1) NOT NULL DEFAULT 0
        AFTER status_effects,
    ADD COLUMN IF NOT EXISTS master_training_json JSON DEFAULT NULL
        AFTER can_create_sig_tech;

-- NPCs: master teaching capabilities
ALTER TABLE game_npcs
    ADD COLUMN IF NOT EXISTS is_master TINYINT(1) NOT NULL DEFAULT 0 AFTER body_type_id,
    ADD COLUMN IF NOT EXISTS teaches_sig_tech_id INT DEFAULT NULL
        AFTER is_master
        COMMENT 'specific pre-made sig tech this master teaches (NULL = teaches creation ability)',
    ADD COLUMN IF NOT EXISTS unlocks_sig_tech_creation TINYINT(1) NOT NULL DEFAULT 0
        AFTER teaches_sig_tech_id
        COMMENT 'if true, training under this master unlocks can_create_sig_tech',
    ADD COLUMN IF NOT EXISTS master_skill_ids JSON DEFAULT NULL
        AFTER unlocks_sig_tech_creation
        COMMENT 'array of skill IDs this master can teach',
    ADD COLUMN IF NOT EXISTS training_gain_pct FLOAT NOT NULL DEFAULT 0.02
        AFTER master_skill_ids
        COMMENT 'stat gain per training session (0.02 = 2% of base)';

-- Training log
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

-- Gate the existing sig tech discovery behind the flag
-- (flavor text discovery only works if can_create_sig_tech=1 OR as rare natural talent)
INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('sig_tech_require_unlock',         'true'),
('sig_tech_natural_talent_chance',  '0.05');


-- =================================================================
-- 2. RP DESCRIPTION ENGINE (expanded flavor text)
-- =================================================================

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
    ADD COLUMN IF NOT EXISTS action_type VARCHAR(32) DEFAULT 'attack'
        AFTER category
        COMMENT 'attack/defense/heal/move/item/taunt',
    ADD COLUMN IF NOT EXISTS context_matches INT NOT NULL DEFAULT 0
        AFTER action_type
        COMMENT 'number of context-aware keyword matches',
    ADD COLUMN IF NOT EXISTS party_chain TINYINT(1) NOT NULL DEFAULT 0
        AFTER context_matches
        COMMENT 'was this part of a party RP chain';


-- =================================================================
-- 3. BATTLE NARRATION SYSTEM (DM-style descriptions)
-- =================================================================

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

-- Seed narration templates
INSERT IGNORE INTO game_battle_narrations (id, action_type, weapon_type, element, terrain, target_zone, text_template, weight) VALUES
-- Basic attacks
(1,  'attack', 'sword', NULL, NULL, NULL, '{actor} lunges forward, blade singing through the air, and carves a vicious arc across {target}!', 2),
(2,  'attack', 'sword', NULL, NULL, 'head', '{actor} feints low, then whips the blade upward toward {target}''s skull!', 2),
(3,  'attack', 'axe', NULL, NULL, NULL, '{actor} heaves the axe overhead and brings it crashing down on {target}!', 2),
(4,  'attack', 'staff', NULL, NULL, NULL, '{actor} spins the staff and drives it into {target}''s ribs with a sharp crack!', 2),
(5,  'attack', 'bow', NULL, NULL, NULL, '{actor} draws, exhales, and looses — the arrow streaks toward {target}!', 2),
(6,  'attack', 'fist', NULL, NULL, NULL, '{actor} surges forward and drives a thunderous fist into {target}!', 2),
(7,  'attack', NULL, NULL, NULL, NULL, '{actor} strikes at {target} with practiced precision!', 1),
(8,  'attack', NULL, NULL, NULL, 'legs', '{actor} sweeps low, aiming to take {target}''s legs out from under them!', 2),
(9,  'attack', NULL, NULL, NULL, 'left_arm', '{actor} targets {target}''s weapon arm with a brutal chop!', 2),
-- Crits
(10, 'crit', NULL, NULL, NULL, NULL, 'The blow lands with devastating force — bone crunches and {target} staggers!', 3),
(11, 'crit', NULL, NULL, NULL, 'head', 'A sickening crack echoes as the strike connects squarely with {target}''s skull!', 3),
(12, 'crit', 'sword', NULL, NULL, NULL, 'The blade bites deep, finding the gap in {target}''s guard — a perfect strike!', 3),
-- Dodges
(13, 'dodge', NULL, NULL, NULL, NULL, '{target} reads the attack and sidesteps at the last instant!', 2),
(14, 'dodge', NULL, NULL, 'forest', NULL, '{target} ducks behind a tree trunk — the attack whistles past!', 3),
(15, 'dodge', NULL, NULL, NULL, NULL, '{target} twists away, the blow grazing harmlessly past!', 1),
-- Blocks
(16, 'block', NULL, NULL, NULL, NULL, '{target} raises their guard — the impact jars their arms but holds!', 2),
(17, 'block', NULL, NULL, NULL, NULL, '{target} braces and catches the blow on crossed forearms!', 2),
-- Misses
(18, 'miss', NULL, NULL, NULL, NULL, '{actor}''s strike goes wide, cutting only air!', 2),
(19, 'miss', NULL, NULL, NULL, NULL, '{actor} overextends — the attack misses entirely!', 1),
-- Kills
(20, 'kill', NULL, NULL, NULL, NULL, '{target} crumples, the light fading from their eyes. It is done.', 3),
(21, 'kill', 'sword', NULL, NULL, NULL, '{actor}''s blade finds {target}''s heart. They fall without a sound.', 3),
-- Knockouts
(22, 'ko', NULL, NULL, NULL, NULL, '{target} slumps to the ground, unconscious but breathing.', 2),
(23, 'ko', NULL, NULL, NULL, 'head', '{target}''s eyes roll back as the blow to the head sends them into darkness.', 3),
-- Healing
(24, 'heal', NULL, NULL, NULL, NULL, 'Warm light flows from {actor}''s hands, knitting flesh and easing pain.', 2),
(25, 'heal', NULL, 'light', NULL, NULL, 'Holy radiance engulfs {target}, their wounds closing before your eyes!', 3),
-- Combos
(26, 'combo', NULL, NULL, NULL, NULL, '{actor} presses the advantage — another strike follows before {target} can recover!', 2),
(27, 'combo', 'fist', NULL, NULL, NULL, '{actor}''s fists blur into a rapid combination!', 3),
-- Ki Channel
(28, 'ki_channel', NULL, NULL, NULL, NULL, 'The air crackles as {actor} draws upon their deepest reserves — raw power erupts from within!', 3),
-- Limb disabled
(29, 'limb_disabled', NULL, NULL, NULL, 'legs', '{target}''s leg buckles, shattered — they collapse to one knee!', 3),
(30, 'limb_disabled', NULL, NULL, NULL, 'left_arm', '{target}''s arm goes limp at their side, useless!', 3),
(31, 'limb_disabled', NULL, NULL, NULL, 'right_arm', 'A sickening pop — {target}''s arm hangs at a wrong angle!', 3),
(32, 'limb_disabled', NULL, NULL, NULL, 'head', '{target}''s head snaps back — their eyes go glassy!', 3),
-- Flee
(33, 'flee', NULL, NULL, NULL, NULL, '{actor} breaks away, scrambling for the exit — they escape!', 2),
(34, 'flee_fail', NULL, NULL, NULL, NULL, '{actor} turns to run but {target} cuts off their escape!', 2),
-- Skill usage
(35, 'skill', NULL, 'fire', NULL, NULL, 'Flames roar to life around {actor}''s hands — {skill} engulfs {target}!', 3),
(36, 'skill', NULL, 'ice', NULL, NULL, 'The temperature plummets as {actor} invokes {skill} — frost races across {target}''s skin!', 3),
(37, 'skill', NULL, 'lightning', NULL, NULL, 'Lightning arcs from {actor}''s fingertips — {skill} strikes {target} with a deafening crack!', 3),
(38, 'skill', NULL, 'dark', NULL, NULL, 'Shadows coil around {actor} as they whisper the words of {skill} — darkness lashes at {target}!', 3),
(39, 'skill', NULL, NULL, NULL, NULL, '{actor} channels their energy and unleashes {skill}!', 1),
-- Taunt/Intimidate/Rally
(40, 'taunt', NULL, NULL, NULL, NULL, '{actor} locks eyes with {target} and snarls a challenge — "Face me, coward!"', 2),
(41, 'intimidate', NULL, NULL, NULL, NULL, '{actor} steps forward, their presence crushing — {target} falters!', 2),
(42, 'rally', NULL, NULL, NULL, NULL, '{actor} raises their weapon high and roars — "Stand fast! We fight as one!"', 2);


-- =================================================================
-- 4. RP COMBAT COMMANDS (Taunt, Intimidate, Rally)
-- =================================================================

INSERT IGNORE INTO game_battle_commands (id, name, description, icon, effects, is_defense, defense_type, sort_order) VALUES
(14, 'Taunt',      'Draw enemy attention. +10% damage on your next attack.', '😤',
     '{"rp_command":"taunt","aggro_duration":1,"self_damage_bonus":0.10,"bonus_duration":1}', 0, NULL, 14),
(15, 'Intimidate', 'Attempt to shake the enemy. May reduce their ATK and accuracy.', '👁️',
     '{"rp_command":"intimidate","base_chance":0.50,"atk_reduction":0.15,"accuracy_reduction":0.10,"duration":2}', 0, NULL, 15),
(16, 'Rally',      'Inspire your allies! Boosts party ATK and speed for 2 turns.', '📣',
     '{"rp_command":"rally","atk_bonus":0.10,"speed_bonus":0.10,"duration":2}', 0, NULL, 16);

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_rp_commands', 'true');


-- =================================================================
-- 5. EXTEND QUEST REWARDS FOR SIG TECH UNLOCKS
-- =================================================================
-- Quest rewards_json can now include:
--   "unlock_sig_tech_creation": true
--   "teach_sig_tech_id": 5  (specific pre-made technique)
-- No schema change needed — rewards_json is already flexible JSON.
-- Just documenting the format here for reference.


-- =================================================================
-- 6. PRE-MADE SIGNATURE TECHS (admin-created, taught by masters)
-- =================================================================
-- These are signature techs that exist as templates — when a master
-- teaches one, a copy is created for the player at level 1.

CREATE TABLE IF NOT EXISTS game_premade_sig_techs (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    icon            VARCHAR(16)  DEFAULT '⚡',
    description     TEXT         DEFAULT NULL,
    tech_type       ENUM('ki_attack','physical','ki_heal') NOT NULL DEFAULT 'ki_attack',
    element         VARCHAR(32)  DEFAULT NULL,
    battle_text     VARCHAR(255) DEFAULT NULL,
    preset_abilities JSON        DEFAULT NULL COMMENT 'array of ability IDs auto-equipped at creation',
    lore_text       TEXT         DEFAULT NULL COMMENT 'story/lore behind this technique',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed a few example pre-made techniques
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
