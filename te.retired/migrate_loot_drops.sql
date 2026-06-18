
-- =================================================================
-- RESPAWN COLUMNS (added same session as loot drops)
-- The defeat screen's "Respawn" button needs these to know where
-- to send the player. Safe to run multiple times.
-- =================================================================
ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS respawn_map_id INT UNSIGNED NOT NULL DEFAULT 1
        COMMENT 'Map to respawn on after death. Default = starting map.',
    ADD COLUMN IF NOT EXISTS respawn_x INT NOT NULL DEFAULT 10
        COMMENT 'X tile coordinate of respawn point.',
    ADD COLUMN IF NOT EXISTS respawn_y INT NOT NULL DEFAULT 10
        COMMENT 'Y tile coordinate of respawn point.';

-- =================================================================
-- NPC MOVEMENT (added with NPC wander system)
-- move_type controls whether the NPC wanders or stands still.
-- Safe to run multiple times (IF NOT EXISTS / IGNORE).
-- =================================================================
ALTER TABLE game_npcs
    ADD COLUMN IF NOT EXISTS move_type
        ENUM('STATIONARY','WANDER','PATROL') NOT NULL DEFAULT 'WANDER'
        COMMENT 'STATIONARY=never moves, WANDER=roams within radius, PATROL=future waypoints',
    ADD COLUMN IF NOT EXISTS wander_radius INT NOT NULL DEFAULT 3
        COMMENT 'Max tiles from home position NPC can wander';

-- Shopkeepers and quest-givers should default to STATIONARY
-- (this is just a hint -- admins can override per-NPC in AdminSauce)
UPDATE game_npcs SET move_type = 'STATIONARY'
WHERE name LIKE '%shop%' OR name LIKE '%merchant%' OR name LIKE '%vendor%'
   OR name LIKE '%keeper%' OR name LIKE '%innkeeper%';

-- =================================================================
-- NPC QUEST GIVERS, SCHEDULES, MEMORY & MERCHANT BARTERING
-- =================================================================
ALTER TABLE game_npcs
    ADD COLUMN IF NOT EXISTS schedule_json JSON DEFAULT NULL
        COMMENT 'Array of {hour_from,hour_to,map_id,x,y,label} schedule slots',
    ADD COLUMN IF NOT EXISTS shop_id INT UNSIGNED DEFAULT NULL
        COMMENT 'Links NPC to a shop. Interacting opens Shop/Talk choice.';

CREATE TABLE IF NOT EXISTS npc_memories (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    char_id         INT UNSIGNED NOT NULL,
    npc_name        VARCHAR(128) NOT NULL,
    facts_json      JSON         DEFAULT NULL,
    reputation      INT          NOT NULL DEFAULT 0,
    last_seen       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_mem (char_id, npc_name),
    INDEX idx_mem_char (char_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- WORLD FLAGS + NPC WITNESS SYSTEM
-- =================================================================
CREATE TABLE IF NOT EXISTS world_flags (
    flag_key    VARCHAR(128)  NOT NULL PRIMARY KEY,
    flag_value  TEXT          NOT NULL DEFAULT 'true',
    set_by      VARCHAR(128)  DEFAULT NULL,
    set_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS npc_memories (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    char_id     INT UNSIGNED NOT NULL,
    npc_name    VARCHAR(128) NOT NULL,
    facts_json  JSON         DEFAULT NULL,
    reputation  INT          NOT NULL DEFAULT 0,
    last_seen   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_mem (char_id, npc_name),
    INDEX idx_mem_char (char_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- NPC RUMORS + CROWD REACTIONS
-- =================================================================
CREATE TABLE IF NOT EXISTS npc_rumors (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    char_id         INT UNSIGNED NOT NULL,
    char_name       VARCHAR(128) NOT NULL,
    rumor_text      VARCHAR(255) NOT NULL,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    spread_count    INT          NOT NULL DEFAULT 0,
    max_spread      INT          NOT NULL DEFAULT 8,
    INDEX idx_rumors_char (char_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- MOOD, DEATH, FACTIONS
-- =================================================================
ALTER TABLE game_npcs
    ADD COLUMN IF NOT EXISTS mood             ENUM('happy','fearful','angry','grieving','excited') DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS is_dead          TINYINT(1)   NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS predecessor_name VARCHAR(128) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS death_cause      VARCHAR(255) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS factions (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(128) NOT NULL UNIQUE,
    description TEXT,
    icon        VARCHAR(8)   DEFAULT '⚔️',
    rival_id    INT UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS npc_factions (
    npc_id      INT UNSIGNED NOT NULL,
    faction_id  INT UNSIGNED NOT NULL,
    PRIMARY KEY (npc_id, faction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS player_faction_rep (
    char_id     INT UNSIGNED NOT NULL,
    faction_id  INT UNSIGNED NOT NULL,
    reputation  INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (char_id, faction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ================================================================
-- BLOOD OGHAM SYSTEM + ELEMENT OVERHAUL + NEW STATUS TYPES
-- Run this on existing databases. Safe to re-run (IF NOT EXISTS).
-- ================================================================

-- Blood Oghams: carved runes that slot into weapon/armor Ogham Grooves
CREATE TABLE IF NOT EXISTS game_oghams (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    icon            VARCHAR(8)   DEFAULT '🩸',
    description     TEXT,
    lore_text       TEXT,                        -- flavour: "A carved prayer to..."
    rank            INT NOT NULL DEFAULT 1,      -- 1=Carved, 2=Inscribed, 3=Bloodbound
    base_ogham_id   INT UNSIGNED DEFAULT NULL,   -- NULL = this IS the rank-1 root
    -- What this Ogham grants when slotted:
    grant_skill_id  INT UNSIGNED DEFAULT NULL,   -- unlocks a skill while equipped
    element_attack  VARCHAR(64)  DEFAULT NULL,   -- adds this element to weapon attacks
    stat_bonus_json JSON         DEFAULT NULL,   -- e.g. {"atk":5,"mo":10}
    on_hit_status   VARCHAR(64)  DEFAULT NULL,   -- status name inflicted on hit
    on_hit_chance   INT          DEFAULT 20,     -- % chance to inflict
    -- Progression
    kills_to_rank_up INT         DEFAULT 50,     -- kills needed at this rank to advance
    INDEX idx_base (base_ogham_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ogham Grooves: how many slots an item has (0 = not grooved)
ALTER TABLE game_items
    ADD COLUMN IF NOT EXISTS ogham_slots INT NOT NULL DEFAULT 0;

-- Which Oghams a character has slotted into which equipped item
CREATE TABLE IF NOT EXISTS character_oghams (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    item_id         INT UNSIGNED NOT NULL,   -- the item these are carved into
    slot_index      INT NOT NULL DEFAULT 0,  -- groove position (0,1,2...)
    ogham_id        INT UNSIGNED NOT NULL,
    current_rank    INT NOT NULL DEFAULT 1,
    kill_count      INT NOT NULL DEFAULT 0,  -- kills since last rank-up
    UNIQUE KEY uniq_char_item_slot (character_id, item_id, slot_index),
    INDEX idx_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Element resistances per item: replaces the old {fire:"defense"} format
-- New format: {fire: {role:"resist", pct:50}}
-- roles: "attack" | "resist" | "weak" | "nullify" | "absorb"
-- pct: used for resist/weak (e.g. 25 = -25% dmg for resist, +25% for weak)
-- existing items with old format are migrated by the engine fallback

-- Add new status effect engine hooks
-- (No schema change needed — these are new keys in the existing effects JSON)
-- sleep:    {skip_turn:true, breaks_on_hit:true}
-- paralyze: {skip_chance:50}           -- 50% chance to skip each turn
-- blind:    {miss_chance:60}           -- 60% of attacks miss
-- gravity:  dealt via skill damage formula: "ENEMY_MAXHP*0.25"

-- Sample Blood Oghams (rank 1)
INSERT IGNORE INTO game_oghams
    (id, name, icon, description, lore_text, rank, base_ogham_id,
     element_attack, on_hit_status, on_hit_chance, kills_to_rank_up)
VALUES
(1, 'Teine (Fire)',   '🔴', 'Wraps strikes in hungry flame.',
 'Carved in the shape of a consuming tongue. The steel remembers every thing it has burned.',
 1, NULL, 'fire', 'Burn', 30, 40),

(2, 'Sioc (Ice)',     '🔵', 'Breath of the frozen Otherworld.',
 'Cold enough that the air around the blade smells like winter graves.',
 1, NULL, 'ice', 'DEF Down', 25, 40),

(3, 'Toirneach (Lightning)', '⚡', 'Channels the sky-rage of the storm gods.',
 'A rune that hums when held near water. Best not ask why.',
 1, NULL, 'lightning', 'Stun', 20, 40),

(4, 'Dorchadas (Dark)', '🖤', 'Calls on what answers from the void.',
 'Some say you can hear whispering when the blade is drawn at midnight.',
 1, NULL, 'dark', 'Blind', 35, 40),

(5, 'Codladh (Sleep)', '🌙', 'A lullaby scratched in a dead tongue.',
 'The mark makes no sound. Neither does its victim.',
 1, NULL, NULL, 'Sleep', 25, 50),

(6, 'Pairilis (Paralyze)', '⚪', 'Freezes the blood in the veins.',
 'Ogham-masters argue whether this rune was invented or discovered.',
 1, NULL, NULL, 'Paralyze', 20, 50);

-- Rank 2 versions (Inscribed)
INSERT IGNORE INTO game_oghams
    (id, name, icon, description, lore_text, rank, base_ogham_id,
     element_attack, on_hit_status, on_hit_chance, stat_bonus_json, kills_to_rank_up)
VALUES
(11, 'Teine Mór (Fira)', '🔥', 'The flame grows hungrier.',
 'The second inscription feeds the first. Ash gathers at the wielder\'s feet.',
 2, 1, 'fire', 'Burn', 45, '{"mo":8}', 80),

(12, 'Sioc Mór (Blizzara)', '❄️', 'The cold deepens.',
 'Ice crystals form on the grip between strikes.',
 2, 2, 'ice', 'DEF Down', 40, '{"mo":8}', 80),

(13, 'Toirneach Mór (Thundara)', '🌩️', 'The storm finds purchase.',
 'The blade crackles with static even when sheathed.',
 2, 3, 'lightning', 'Stun', 35, '{"mo":8}', 80),

(14, 'Dorchadas Mór (Darkra)', '💀', 'The void answers louder.',
 'Shadows pool beneath the blade in broad daylight.',
 2, 4, 'dark', 'Blind', 50, '{"mo":8}', 80);

-- Add 'ogham' type to item API resolver
INSERT IGNORE INTO game_modules (module_key, module_name, is_installed)
VALUES ('blood_ogham', 'Blood Ogham System', 1);

-- ================================================================
-- NEW STATUS EFFECTS: Sleep, Paralyze, Blind, Gravity
-- ================================================================
-- effects JSON keys used by the engine:
--   skip_turn:true       — actor cannot act this turn (Sleep uses this + breaks_on_hit)
--   breaks_on_hit:true   — status removed when target takes physical damage
--   skip_chance:50       — 50% per turn actor loses their action (Paralyze)
--   miss_chance:60       — 60% of physical attacks miss (Blind)
--   damage_per_turn.formula — per-turn damage (Gravity handled as a skill/formula, not a status)

INSERT IGNORE INTO game_statuses (id, name, icon, category, default_duration, permanent, effects, description, disabled_commands)
VALUES
(10, 'Sleep',
 '💤', 'debuff', 3, 0,
 '{"skip_turn":true,"breaks_on_hit":true,"log":"{name} is fast asleep and cannot act!"}',
 'Cannot act. Wakes immediately when hit.',
 NULL),

(11, 'Paralyze',
 '⚡', 'debuff', 3, 0,
 '{"skip_chance":50,"log":"{name} is paralysed and cannot move!"}',
 '50% chance each turn to lose action.',
 NULL),

(12, 'Blind',
 '🌑', 'debuff', 3, 0,
 '{"miss_chance":60,"log":"{name} swings blindly and misses!"}',
 'Physical attacks have a 60% miss chance.',
 NULL),

(13, 'Gravity',
 '⬇️', 'debuff', 1, 0,
 '{"damage_per_turn":{"formula":"MAXHP*0.25"},"log":"{name} is crushed by gravity! (-25% max HP)"}',
 'Deals 25% of max HP as damage per turn. Duration 1 (use the skill to reapply).',
 NULL);

-- ================================================================
-- OGHAM EXPANSIONS: Cursed Oghams, Families, Set Bonuses
-- ================================================================

-- Family system: group Oghams together for set bonuses
CREATE TABLE IF NOT EXISTS game_ogham_families (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    icon            VARCHAR(8)   DEFAULT '🩸',
    description     TEXT,
    -- set_bonus_json: bonus applied when 2+ Oghams from same family equipped
    -- format: {"min_count":2, "stat_bonus":{"mo":15}, "element_attack":"dark",
    --          "on_hit_status":"Blind", "on_hit_chance":20, "label":"Void Walker"}
    set_bonus_json  JSON         DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add curse + family columns to game_oghams
ALTER TABLE game_oghams
    ADD COLUMN IF NOT EXISTS family_id    INT UNSIGNED DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS curse_json   JSON DEFAULT NULL;
    -- curse_json: {"status":"Blind","turns":1,"chance":100,"log":"{name}'s vision darkens..."}
    -- Applied to the WIELDER after the ogham fires its on_hit_status

-- Sample families
INSERT IGNORE INTO game_ogham_families (id, name, icon, description, set_bonus_json) VALUES
(1, 'The Void Court', '🖤',
 'Ancient runes carved by those who bargained with the Otherworld\'s darkest court.',
 '{"min_count":2,"stat_bonus":{"mo":20},"element_attack":"dark","label":"Void Pact: +20 MO, dark element"}'),

(2, 'The Storm Circle', '⚡',
 'Oghams forged during the great storm that split Tír na nÓg in two.',
 '{"min_count":2,"stat_bonus":{"speed":15,"luck":10},"on_hit_status":"Stun","on_hit_chance":15,"label":"Storm Blessed: +15 Speed, +10 Luck, 15% Stun"}'),

(3, 'The Frozen Burial', '❄️',
 'Inscriptions found on those who died in the northern wastes and did not stay dead.',
 '{"min_count":2,"stat_bonus":{"def":20,"md":15},"element_attack":"ice","label":"Ice Shroud: +20 DEF, +15 MD, ice element"}');

-- Assign existing sample oghams to families
UPDATE game_oghams SET family_id=2 WHERE id IN (3,13);  -- Lightning family → Storm Circle
UPDATE game_oghams SET family_id=1 WHERE id IN (4,14);  -- Dark family    → Void Court
UPDATE game_oghams SET family_id=3 WHERE id IN (2,12);  -- Ice family     → Frozen Burial

-- Add cursed variants to the dark oghams as examples
UPDATE game_oghams SET curse_json='{"status":"Blind","turns":1,"chance":50,"log":"{name} is blinded by the void!"}' WHERE id=14;

-- ================================================================
-- EVENT LOG — audit trail for battles, GM actions, level-ups, etc.
-- ================================================================
CREATE TABLE IF NOT EXISTS game_event_log (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_type  VARCHAR(32)  NOT NULL,  -- 'battle_end','gm_ban','level_up','shop_buy','gm_give_gold',...
    actor_id    INT UNSIGNED DEFAULT NULL,  -- user_id or char_id depending on context
    actor_name  VARCHAR(128) DEFAULT NULL,
    target_id   INT UNSIGNED DEFAULT NULL,
    target_name VARCHAR(128) DEFAULT NULL,
    detail_json JSON         DEFAULT NULL, -- flexible payload
    map_id      INT UNSIGNED DEFAULT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_elog_type (event_type),
    INDEX idx_elog_actor (actor_id),
    INDEX idx_elog_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ================================================================
-- v16 ADDITIONS
-- ================================================================

-- GM Notes table
CREATE TABLE IF NOT EXISTS gm_notes (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    map_id     INT UNSIGNED DEFAULT NULL,
    author_id  INT UNSIGNED NOT NULL,
    author     VARCHAR(64)  NOT NULL,
    body       TEXT         NOT NULL,
    pinned     TINYINT(1)   NOT NULL DEFAULT 0,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_gmnotes_map (map_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Shared lore bible setting
INSERT IGNORE INTO system_settings (setting_key, setting_value, description)
VALUES ('world_forge_lore_bible', '', 'Shared World Forge lore context for all GMs');

-- Character appearance (modular sprites)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS appearance_json JSON DEFAULT NULL;

-- ================================================================
-- v18 ADDITIONS — Combat Depth + World Expansion
-- ================================================================

-- Dungeon fields on game_maps
ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS zone_type       VARCHAR(32)  NOT NULL DEFAULT 'WORLD';
ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS dungeon_group_id INT UNSIGNED DEFAULT NULL;
ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS floor_number    INT          DEFAULT NULL;
ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS dungeon_name    VARCHAR(128) DEFAULT NULL;

-- Stance commands (admins can assign these to any class via battle_cmds JSON)
INSERT IGNORE INTO game_battle_commands
    (id, name, icon, description, effects, target_type, is_default, display_order)
VALUES
(10, 'Power Stance', '⚔️',  'Enter Power Stance: ATK ×1.4 until changed.',
 '{"stance":"POWER","log":"{name} enters Power Stance!"}', 'SELF', 0, 10),
(11, 'Guard Stance', '🛡️', 'Enter Guard Stance: incoming damage ×0.5, limit fills faster.',
 '{"stance":"GUARD","log":"{name} enters Guard Stance!"}', 'SELF', 0, 11),
(12, 'Magic Stance', '✨',  'Enter Magic Stance: MO ×1.4, MP costs reduced 30%.',
 '{"stance":"MAGIC","log":"{name} enters Magic Stance!"}', 'SELF', 0, 12);

-- Example skill upgrades (add combo/multi-hit/charge fields via effects_json)
-- These UPDATE existing skills to show the system working out of the box.
-- Admins can adjust values in the Skill Manager.

-- Rapid Strike: 3 hits (if a skill named 'Rapid Strike' or id=3 exists)
-- UPDATE game_skills SET effects=JSON_SET(COALESCE(effects,'{}'), '$.hits', 3) WHERE name='Rapid Strike';

-- Example: add combo_requires to a skill (requires Blind status on target)
-- UPDATE game_skills SET effects=JSON_SET(COALESCE(effects,'{}'),
--   '$.combo_requires', JSON_OBJECT('status','Blind','message','Blindside Strike!'),
--   '$.combo_bonus',    JSON_OBJECT('damage_mult',2.0,'extra_hits',1)
-- ) WHERE name='Shadow Strike';
