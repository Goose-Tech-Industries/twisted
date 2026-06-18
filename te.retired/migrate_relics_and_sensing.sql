-- =============================================================
-- MIGRATION: Relic Collection System + Power Sensing
-- =============================================================
-- Supports Dragon Ball-style collectibles and ki sensing:
--   - Admin places relics on maps (hidden on specific tiles)
--   - Only visible if player is on the same tile OR has a radar
--   - Collect all N in a set to activate (summon dragon, etc.)
--   - Wishes/rewards are admin-configurable per set
--   - After activation, relics scatter to new random locations
--   - Power sensing as a learnable passive (replaces scouter)
-- =============================================================

-- ─── RELIC SETS ──────────────────────────────────────────────
-- A set is "Earth Dragon Balls" (7), "Namek Dragon Balls" (7),
-- "Chaos Emeralds" (7), or any admin-defined collection.
CREATE TABLE IF NOT EXISTS game_relic_sets (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ruleset_id          INT UNSIGNED DEFAULT NULL,
    name                VARCHAR(128) NOT NULL,              -- "Earth Dragon Balls"
    description         TEXT,
    icon                VARCHAR(32) DEFAULT NULL,            -- emoji
    collect_count       INT UNSIGNED NOT NULL DEFAULT 7,     -- how many to collect
    -- Activation
    activation_type     ENUM('wish','reward','summon','event','custom') DEFAULT 'wish',
    summon_name         VARCHAR(128) DEFAULT NULL,           -- "Shenron", "Porunga"
    summon_dialogue     TEXT DEFAULT NULL,                    -- "I am the Eternal Dragon..."
    -- Wishes (if activation_type = 'wish')
    max_wishes          INT UNSIGNED DEFAULT 1,              -- Earth=1, Namek=3
    available_wishes_json JSON DEFAULT NULL,
    -- Format: [
    --   {"id":"revive","label":"Revive a fallen warrior","effect":"revive_player","max_uses":1},
    --   {"id":"power","label":"Grant me power!","effect":"stat_boost","value":{"stat":"atk","amount":5000}},
    --   {"id":"immortal","label":"Make me immortal","effect":"status","value":{"status":"immortal","duration":168}},
    --   {"id":"knowledge","label":"Tell me a secret","effect":"reveal_hidden_technique","value":{"random":true}},
    --   {"id":"teleport","label":"Take me somewhere","effect":"teleport_choice"},
    --   {"id":"custom","label":"Custom wish","effect":"dm_decide"}
    -- ]
    -- Rewards (if activation_type = 'reward')
    reward_json         JSON DEFAULT NULL,                   -- {"gold":10000,"xp":5000,"item_id":42}
    -- After Activation
    scatter_after_use   TINYINT(1) NOT NULL DEFAULT 1,       -- scatter to new locations
    scatter_delay_hours INT UNSIGNED DEFAULT 168,             -- 1 week before relics reappear
    cooldown_hours      INT UNSIGNED DEFAULT 0,               -- per-player cooldown
    -- Radar
    -- ── Wish Activation ──
    wish_channel_turns  INT UNSIGNED DEFAULT 3,               -- turns to channel/summon (can be interrupted)
    wish_interruptable  TINYINT(1) NOT NULL DEFAULT 1,        -- combat interrupts wish activation
    wish_range_darken   INT UNSIGNED DEFAULT 5,               -- tiles around summoner go dark during activation

    -- ── Radar Tiers ──
    -- Multiple radar items can detect this set, each with different range.
    -- Stored in game_relic_radars table (not a single item_id).
    radar_default_range INT UNSIGNED DEFAULT 0,               -- 0 = must be on tile without a radar
    -- Restrictions
    region_lock_ids     VARCHAR(255) DEFAULT NULL,             -- comma-separated region IDs where relics spawn
    min_level           INT UNSIGNED DEFAULT 0,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_relic_sets_ruleset (ruleset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── RELIC RADARS ────────────────────────────────────────────
-- Different radar items for different relic sets, with tier-based range.
-- E.g. Dragon Radar (1250 gold, 15 tile range, Earth balls only)
--      Namek Radar (7500 gold, 20 tile range, Namek balls only)
--      Ultimate Radar (quest reward, 50 tile range, all sets)
CREATE TABLE IF NOT EXISTS game_relic_radars (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_id             INT UNSIGNED NOT NULL,              -- which inventory item acts as this radar
    relic_set_id        INT UNSIGNED DEFAULT NULL,           -- NULL = works for ALL relic sets
    range_tiles         INT UNSIGNED NOT NULL DEFAULT 15,    -- detection range
    shows_exact_tile    TINYINT(1) NOT NULL DEFAULT 0,       -- 0 = shows direction only. 1 = shows exact tile
    shows_on_minimap    TINYINT(1) NOT NULL DEFAULT 1,       -- show blip on minimap
    max_detect_count    INT UNSIGNED DEFAULT NULL,            -- NULL = detect all. 1 = only closest
    description         VARCHAR(255) DEFAULT NULL,            -- "Beeps faster as you get closer"
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_radars_item (item_id),
    INDEX idx_radars_set (relic_set_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── WISH ACTIVATION STATE ───────────────────────────────────
-- Tracks in-progress wish channeling (takes multiple turns)
CREATE TABLE IF NOT EXISTS game_relic_wish_state (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id        INT UNSIGNED NOT NULL,
    relic_set_id        INT UNSIGNED NOT NULL,
    turns_channeled     INT UNSIGNED NOT NULL DEFAULT 0,
    turns_needed        INT UNSIGNED NOT NULL DEFAULT 3,
    status              ENUM('channeling','interrupted','completed','cancelled') DEFAULT 'channeling',
    started_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    map_id              INT UNSIGNED DEFAULT NULL,
    x                   INT DEFAULT NULL,
    y                   INT DEFAULT NULL,
    UNIQUE KEY uq_wish_active (character_id, relic_set_id),
    INDEX idx_wish_state_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── RELIC INSTANCES ─────────────────────────────────────────
-- Individual relics placed on the map. Each row = one physical
-- relic in the world (e.g. the 4-Star Dragon Ball on Earth map 7).
CREATE TABLE IF NOT EXISTS game_relic_instances (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    relic_set_id        INT UNSIGNED NOT NULL,
    ordinal             INT UNSIGNED NOT NULL DEFAULT 1,     -- 1-Star, 2-Star, etc.
    name                VARCHAR(128) DEFAULT NULL,            -- "Four-Star Ball", "Two-Star Ball"
    icon                VARCHAR(32) DEFAULT NULL,             -- specific icon/emoji

    -- ── Current Location ──
    map_id              INT UNSIGNED DEFAULT NULL,            -- which map it's on
    x                   INT NOT NULL DEFAULT 0,
    y                   INT NOT NULL DEFAULT 0,
    -- Hiding
    is_hidden           TINYINT(1) NOT NULL DEFAULT 1,        -- hidden unless on tile or radar
    hide_description    VARCHAR(255) DEFAULT NULL,             -- "Hidden behind a waterfall"

    -- ── State ──
    status              ENUM('placed','collected','scattered','inactive') DEFAULT 'placed',
    collected_by        INT UNSIGNED DEFAULT NULL,             -- character_id who holds it
    collected_at        DATETIME DEFAULT NULL,
    scatter_available_at DATETIME DEFAULT NULL,                -- when it reappears after set use

    INDEX idx_relic_instances_set (relic_set_id),
    INDEX idx_relic_instances_map (map_id, status),
    INDEX idx_relic_instances_collector (collected_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── RELIC ACTIVATION LOG ────────────────────────────────────
-- History of every time a relic set was activated
CREATE TABLE IF NOT EXISTS game_relic_activation_log (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    relic_set_id        INT UNSIGNED NOT NULL,
    activated_by        INT UNSIGNED NOT NULL,               -- character_id
    wish_chosen         VARCHAR(64) DEFAULT NULL,             -- wish ID from available_wishes_json
    wish_target         INT UNSIGNED DEFAULT NULL,            -- target character for revive etc.
    result_json         JSON DEFAULT NULL,                    -- what actually happened
    activated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_relic_log_set (relic_set_id),
    INDEX idx_relic_log_char (activated_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── POWER SENSING ───────────────────────────────────────────
-- Configurable per-ruleset. When a character knows the "sense"
-- technique, they can detect nearby fighters and their PL.
-- Different from scouter: no item needed, no breaking, but may
-- be less precise or have range limits.
--
-- This uses the existing game_techniques table — just create a
-- technique with category='utility' and set these rules.
CREATE TABLE IF NOT EXISTS game_sensing_rules (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ruleset_id          INT UNSIGNED DEFAULT NULL,

    -- ── Technique-based Sensing ──
    -- If the character knows a technique with this flag, they can sense
    technique_id        INT UNSIGNED DEFAULT NULL,            -- technique that grants sensing (NULL = use name match)
    technique_name      VARCHAR(64) DEFAULT 'Sense Power',    -- fallback: match by name

    -- ── Range & Precision ──
    sense_range_tiles   INT UNSIGNED DEFAULT 10,              -- how far they can sense
    sense_range_map     TINYINT(1) NOT NULL DEFAULT 0,        -- 1 = entire map, ignore tile range
    sense_range_planet  TINYINT(1) NOT NULL DEFAULT 0,        -- 1 = entire planet (advanced)
    -- Precision: how accurate the PL reading is
    -- 'exact'    = shows exact number
    -- 'estimate' = shows range (e.g. "between 5000-6000")
    -- 'relative' = shows comparison ("much stronger than you")
    -- 'vague'    = shows tier ("extremely powerful")
    `precision`         ENUM('exact','estimate','relative','vague') DEFAULT 'estimate',
    estimate_variance_pct DECIMAL(5,2) DEFAULT 10.00,         -- +/- 10% for 'estimate'

    -- ── Suppression ──
    -- Characters can suppress their PL to hide from sensing
    suppression_enabled TINYINT(1) NOT NULL DEFAULT 1,
    suppression_technique_id INT UNSIGNED DEFAULT NULL,       -- technique needed to suppress
    suppression_min_ratio DECIMAL(4,2) DEFAULT 0.01,          -- can suppress down to 1% of base

    -- Scouter tiers are defined in game_scouter_tiers table, not here

    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_sensing_ruleset (ruleset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── SCOUTER TIERS ───────────────────────────────────────────
-- Each scouter item maps to a tier with different capabilities.
-- Admin can create any number of tiers.
CREATE TABLE IF NOT EXISTS game_scouter_tiers (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_id             INT UNSIGNED NOT NULL,               -- which inventory item is this scouter
    name                VARCHAR(64) NOT NULL,                 -- "Basic Scouter", "Advanced Scouter", "Elite Scouter"
    ruleset_id          INT UNSIGNED DEFAULT NULL,

    -- ── Capabilities ──
    `precision`         ENUM('exact','estimate','relative','vague') DEFAULT 'exact',
    range_tiles         INT UNSIGNED DEFAULT 20,
    can_record_moves    TINYINT(1) NOT NULL DEFAULT 0,        -- Advanced: records techniques in battle
    record_learn_chance DECIMAL(5,2) DEFAULT 75.00,           -- % chance to learn recorded move
    record_learn_days   INT UNSIGNED DEFAULT 2,               -- days of study before learn attempt

    -- ── Breaking ──
    can_break           TINYINT(1) NOT NULL DEFAULT 1,        -- 0 = never breaks (elite tier)
    break_threshold     INT UNSIGNED DEFAULT 20000,           -- PL above this = scouter explodes
    break_message       VARCHAR(255) DEFAULT 'Your scouter sparks and shatters! It''s over 9000!!!',
    -- Damage on break (optional)
    break_damage_pct    DECIMAL(5,2) DEFAULT 0,               -- % of wearer's HP lost when scouter breaks

    -- ── Detection Features ──
    detect_suppressed   TINYINT(1) NOT NULL DEFAULT 0,        -- can see through PL suppression
    detect_hidden       TINYINT(1) NOT NULL DEFAULT 0,        -- can detect hidden/cloaked fighters
    shows_battle_power  TINYINT(1) NOT NULL DEFAULT 1,        -- shows combat power or just base
    shows_race          TINYINT(1) NOT NULL DEFAULT 0,        -- shows target's race
    shows_techniques    TINYINT(1) NOT NULL DEFAULT 0,        -- shows target's known techniques

    cost                INT UNSIGNED DEFAULT 1000,             -- shop price
    sort_order          INT UNSIGNED DEFAULT 0,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_scouter_item (item_id),
    INDEX idx_scouter_ruleset (ruleset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;