-- =============================================================
-- MIGRATION: Campaign Rulesets — Generic RPG System Configuration
-- =============================================================
-- Lets admins define any RPG system without code changes:
--   - Single-stat (powerlevel) or multi-stat (BG3 D&D) or custom
--   - Fixed time-window action slots (train 1x per 6hr block)
--   - Per-race/class training modifiers (+25% Saiyan bonus, etc.)
--   - Move limits with custom reset times
--   - Near-death/low-HP bonuses
--   - Turn-based or real-time combat modes
-- =============================================================

-- ─── RULESETS ────────────────────────────────────────────────
-- Each campaign links to one ruleset. Rulesets are reusable
-- across campaigns (e.g. "DBZ Ruleset" used by multiple seasons).
CREATE TABLE IF NOT EXISTS game_campaign_rulesets (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(128) NOT NULL,
    description         TEXT,

    -- ── Stat Mode ──
    -- 'single'    = one stat (powerlevel). Uses `primary_stat_name` label.
    -- 'standard'  = engine default (atk/def/mo/md/speed/luck/hp/mp)
    -- 'dnd'       = D&D style (str/dex/con/int/wis/cha + AC + HP)
    -- 'custom'    = admin defines stats in custom_stats_json
    stat_mode           ENUM('single','standard','dnd','custom') NOT NULL DEFAULT 'standard',
    primary_stat_name   VARCHAR(32) DEFAULT 'Powerlevel',  -- label for single-stat mode
    custom_stats_json   JSON DEFAULT NULL,  -- [{key, label, default, min, max}] for custom mode

    -- ── Combat Mode ──
    -- 'turn_based'  = classic turn order (FF, DQ, Persona)
    -- 'atb'         = active time battle (FF7, Chrono Trigger)
    -- 'tactical'    = grid-based tactics (FFT, Disgaea, Fire Emblem)
    -- 'real_time'   = action combat (BG3, Legend of Legaia)
    -- 'narrative'   = DM-described, no mechanical combat
    combat_mode         ENUM('turn_based','atb','tactical','real_time','narrative') NOT NULL DEFAULT 'turn_based',

    -- ── Movement Rules ──
    moves_per_day       INT UNSIGNED DEFAULT NULL,  -- NULL = unlimited
    tiles_per_move      INT UNSIGNED DEFAULT 3,
    move_reset_time     VARCHAR(8) DEFAULT NULL,    -- HH:MM in 24hr (e.g. '22:00'). NULL = rolling 24hr
    move_reset_timezone VARCHAR(32) DEFAULT 'America/New_York',

    -- ── Action Windows ──
    -- Defined in game_action_windows table (linked by ruleset_id)
    -- If no windows defined, actions are unlimited

    -- ── Race/Class Modifiers ──
    -- Defined in game_ruleset_modifiers table (linked by ruleset_id)

    -- ── Near-Death / Low-HP Bonus ──
    near_death_enabled  TINYINT(1) NOT NULL DEFAULT 0,
    near_death_json     JSON DEFAULT NULL,
    -- Format: {"threshold_pct": 25, "bonus_pct_per_missing": 0.5, "max_bonus_pct": 50,
    --          "race_overrides": {"saiyan": {"bonus_pct_per_missing": 1.0, "max_bonus_pct": 75}}}

    -- ── BG3-Style Action Economy ──
    -- If action_points_enabled, characters get AP/bonus/reaction per turn/rest
    action_points_enabled TINYINT(1) NOT NULL DEFAULT 0,
    action_points_per_turn INT UNSIGNED DEFAULT 1,      -- BG3: 1 action per turn
    bonus_actions_per_turn INT UNSIGNED DEFAULT 1,      -- BG3: 1 bonus action per turn
    reactions_per_round   INT UNSIGNED DEFAULT 1,       -- BG3: 1 reaction per round
    -- How AP resets: 'turn' (BG3/DnD), 'short_rest', 'long_rest', 'daily'
    ap_reset_mode         ENUM('turn','short_rest','long_rest','daily') DEFAULT 'turn',

    -- ── Movement (stat-based or flat) ──
    -- 'flat'      = everyone gets tiles_per_move (simple RPGs)
    -- 'stat'      = derived from a character stat (BG3: speed/5 = tiles)
    -- 'race'      = set per race via modifiers table
    movement_mode         ENUM('flat','stat','race') NOT NULL DEFAULT 'flat',
    movement_speed_stat   VARCHAR(32) DEFAULT NULL,     -- e.g. 'speed' — character column to derive tiles from
    movement_speed_divisor INT UNSIGNED DEFAULT 5,      -- stat / divisor = tiles (BG3: 30ft / 5 = 6 tiles)

    -- ── Misc Toggles ──
    allow_flying        TINYINT(1) NOT NULL DEFAULT 1,
    flying_tile_bonus   INT UNSIGNED DEFAULT 0,     -- extra tiles per move when flying
    allow_transformation TINYINT(1) NOT NULL DEFAULT 1,
    permadeath          TINYINT(1) NOT NULL DEFAULT 0,
    friendly_fire       TINYINT(1) NOT NULL DEFAULT 0,
    level_cap           INT UNSIGNED DEFAULT NULL,   -- NULL = no cap
    xp_curve            ENUM('linear','exponential','flat','custom') DEFAULT 'exponential',
    xp_curve_json       JSON DEFAULT NULL,           -- custom curve: [{level, xp_required}]

    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── ACTION WINDOWS ──────────────────────────────────────────
-- Defines fixed time windows in which actions can be performed.
-- Each row = one action type (train, spar, master_train, meditate, etc.)
-- with its own window boundaries and usage limits.
CREATE TABLE IF NOT EXISTS game_action_windows (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ruleset_id          INT UNSIGNED NOT NULL,
    action_type         VARCHAR(32) NOT NULL,        -- 'self_train', 'spar', 'master_train', 'meditate', 'move', etc.
    label               VARCHAR(64) NOT NULL,        -- display name: "Self Training", "Sparring", etc.
    icon                VARCHAR(16) DEFAULT NULL,     -- emoji or icon name

    -- ── Window Configuration ──
    -- 'fixed_blocks'  = day split into equal blocks (e.g. 4x 6hr)
    -- 'daily_pool'    = X uses per day, reset at reset_time
    -- 'per_window'    = X uses per fixed block
    -- 'unlimited'     = no restriction
    window_type         ENUM('fixed_blocks','daily_pool','per_window','unlimited') NOT NULL DEFAULT 'daily_pool',

    max_uses_per_day    INT UNSIGNED DEFAULT NULL,    -- total daily cap (daily_pool mode)
    max_uses_per_window INT UNSIGNED DEFAULT 1,       -- uses per fixed block (per_window mode)
    block_count         INT UNSIGNED DEFAULT 4,       -- how many blocks per day (fixed_blocks/per_window)
    block_start_hour    INT UNSIGNED DEFAULT 2,       -- first block starts at this hour (0-23)
    reset_time          VARCHAR(8) DEFAULT '00:00',   -- HH:MM daily reset (daily_pool mode)
    reset_timezone      VARCHAR(32) DEFAULT 'America/New_York',

    -- ── Effect ──
    -- What happens when the action is used. Stored as JSON formula.
    -- Examples:
    --   {"type":"stat_gain","stat":"powerlevel","formula":"base * 0.02"}
    --   {"type":"stat_gain","stat":"xp","formula":"50 + level * 10"}
    --   {"type":"custom","handler":"self_train"}  -- delegates to backend handler
    effect_json         JSON DEFAULT NULL,

    -- ── Requirements ──
    min_level           INT UNSIGNED DEFAULT 0,
    requires_opponent   TINYINT(1) NOT NULL DEFAULT 0,  -- sparring needs another player
    requires_master     TINYINT(1) NOT NULL DEFAULT 0,  -- master training needs NPC
    blocked_in_combat   TINYINT(1) NOT NULL DEFAULT 1,  -- can't use while in battle

    sort_order          INT UNSIGNED DEFAULT 0,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_action_windows_ruleset (ruleset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── RULESET MODIFIERS ───────────────────────────────────────
-- Per-race or per-class bonuses/penalties within a ruleset.
-- Applies multipliers or flat bonuses to specific action types.
CREATE TABLE IF NOT EXISTS game_ruleset_modifiers (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ruleset_id          INT UNSIGNED NOT NULL,
    -- What this modifier applies to: a race, class, or status effect
    target_type         ENUM('race','class','status','background') NOT NULL DEFAULT 'race',
    target_name         VARCHAR(64) NOT NULL,        -- 'saiyan', 'namekian', 'warrior', etc.

    -- What it modifies
    action_type         VARCHAR(32) DEFAULT NULL,     -- NULL = all actions. 'self_train', 'spar', etc.
    stat_key            VARCHAR(32) DEFAULT NULL,     -- NULL = all stats. 'powerlevel', 'atk', etc.

    -- How it modifies
    multiplier          DECIMAL(6,3) DEFAULT 1.000,   -- 1.25 = +25% gain
    flat_bonus          INT DEFAULT 0,                -- +50 flat added after multiplier
    extra_uses          INT DEFAULT 0,                -- +1 extra daily use of this action
    tiles_per_move_override INT DEFAULT NULL,          -- override tiles per move (flying races)
    custom_json         JSON DEFAULT NULL,             -- any extra race-specific data

    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_modifiers_ruleset (ruleset_id),
    INDEX idx_modifiers_target (target_type, target_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── CHARACTER ACTION LOG ────────────────────────────────────
-- Tracks how many times each character has used each action
-- within the current time window. Used to enforce limits.
CREATE TABLE IF NOT EXISTS game_character_action_log (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id        INT UNSIGNED NOT NULL,
    campaign_id         INT UNSIGNED DEFAULT NULL,
    action_type         VARCHAR(32) NOT NULL,
    window_key          VARCHAR(32) NOT NULL,         -- e.g. '2026-04-05_W2' (date + window index)
    used_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    result_json         JSON DEFAULT NULL,            -- outcome stored for history
    INDEX idx_action_log_char (character_id, action_type, window_key),
    INDEX idx_action_log_campaign (campaign_id, action_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── LINK CAMPAIGNS TO RULESETS ──────────────────────────────
ALTER TABLE game_dm_campaigns
    ADD COLUMN IF NOT EXISTS ruleset_id INT UNSIGNED DEFAULT NULL AFTER map_id;
