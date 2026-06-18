-- =============================================================
-- MIGRATION: Transformation System — Fully Admin-Configurable
-- =============================================================
-- Supports any RPG's transformation/form system:
--   DBZ: Super Saiyan, Oozaru, Golden Frieza, Orange Namekian
--   FF:  Trance, Limit Break forms, Aeons
--   BG3: Wild Shape, Rage, Polymorph
--   Custom: Any admin-defined form chain
--
-- Key features:
--   - Race-locked form chains (SSJ1 → SSJ2 → SSJ3 → God → Blue)
--   - Power multipliers (Oozaru = 10x, SSJ = 50x)
--   - Stat modifiers (speed +50%, defense -20%)
--   - Visual overrides (aura color, hair, sprite)
--   - Unlock conditions (near-death, quest, training, PL threshold)
--   - Duration/drain (toggle, timed, ki drain per turn)
--   - Stacking tiers (Kaioken x2, x3, x10, x20)
--   - Loss conditions (tail cut, HP below threshold)
--   - Controllability (Oozaru uncontrolled unless trained)
-- =============================================================

-- ─── TRANSFORMATION DEFINITIONS ──────────────────────────────
CREATE TABLE IF NOT EXISTS game_transformations (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ruleset_id          INT UNSIGNED DEFAULT NULL,        -- NULL = global

    -- ── Identity ──
    name                VARCHAR(128) NOT NULL,             -- "Super Saiyan", "Oozaru", "Golden Form"
    description         TEXT,
    icon                VARCHAR(32) DEFAULT NULL,
    -- Chain: transformations can form a sequence (SSJ1 → SSJ2 → SSJ3)
    chain_group         VARCHAR(64) DEFAULT NULL,          -- "saiyan_ssj", "frieza_forms", "namekian"
    chain_order         INT UNSIGNED DEFAULT 0,            -- order within the chain (0=base, 1=first form, etc.)
    -- Previous form required (NULL = can activate from base)
    prerequisite_form_id INT UNSIGNED DEFAULT NULL,

    -- ── Stat Effects ──
    power_multiplier    DECIMAL(8,2) DEFAULT 1.00,         -- 10.0 = 10x power (Oozaru), 50.0 = SSJ
    -- Individual stat multipliers (NULL = use power_multiplier for all)
    stat_multipliers_json JSON DEFAULT NULL,
    -- Format: {"atk": 2.0, "speed": 1.5, "def": 0.8}
    -- For single-stat mode: {"powerlevel": 50.0}
    flat_stat_bonuses_json JSON DEFAULT NULL,               -- {"max_hp": 500, "speed": 10}

    -- ── Visuals ──
    aura_color          VARCHAR(16) DEFAULT NULL,           -- hex: "#FFD700" (gold for SSJ)
    aura_effect         VARCHAR(32) DEFAULT NULL,           -- "flame", "electric", "divine", "dark"
    hair_color          VARCHAR(16) DEFAULT NULL,           -- "#FFD700" gold
    eye_color           VARCHAR(16) DEFAULT NULL,           -- "#00FF00" green
    skin_color          VARCHAR(16) DEFAULT NULL,           -- for Frieza forms etc.
    sprite_override     VARCHAR(255) DEFAULT NULL,          -- custom sprite URL when transformed
    particle_effect     VARCHAR(32) DEFAULT NULL,           -- "lightning", "fire", "sparkle"
    screen_shake        TINYINT(1) NOT NULL DEFAULT 0,      -- shake screen on transform
    transform_dialogue  TEXT DEFAULT NULL,                   -- "HAAAAAAA!" — shown when transforming

    -- ── Unlock Conditions (all must be met) ──
    required_race       VARCHAR(64) DEFAULT NULL,           -- "saiyan", "namekian", etc. NULL = any
    required_class      VARCHAR(64) DEFAULT NULL,
    required_level      INT UNSIGNED DEFAULT 0,
    required_powerlevel INT UNSIGNED DEFAULT 0,
    required_quest_id   INT UNSIGNED DEFAULT NULL,
    required_technique_id INT UNSIGNED DEFAULT NULL,        -- must know a technique
    required_item_id    INT UNSIGNED DEFAULT NULL,          -- must have item (Moon Ball for Oozaru)
    -- Near-death unlock: transform when HP drops below X%
    near_death_unlock   TINYINT(1) NOT NULL DEFAULT 0,
    near_death_hp_pct   DECIMAL(5,2) DEFAULT 10.00,         -- unlock when HP below 10%
    -- Emotional trigger: first time an ally falls in battle
    emotional_trigger   TINYINT(1) NOT NULL DEFAULT 0,
    -- Training unlock: must train with specific NPC
    required_npc_master INT UNSIGNED DEFAULT NULL,
    required_train_sessions INT UNSIGNED DEFAULT 0,
    -- Custom condition (for DM-granted or event-based)
    custom_condition_json JSON DEFAULT NULL,
    unlock_hint         TEXT DEFAULT NULL,                   -- "Legend says a Saiyan pushed beyond limits..."

    -- ── Duration & Cost ──
    -- 'toggle'    = on/off, stays until deactivated
    -- 'timed'     = lasts N turns then reverts
    -- 'sustained' = drains ki/PL per turn to maintain
    -- 'permanent' = once activated, can't revert (rare)
    -- 'event'     = only active during specific conditions (full moon, devil's star)
    duration_type       ENUM('toggle','timed','sustained','permanent','event') DEFAULT 'toggle',
    duration_turns      INT UNSIGNED DEFAULT NULL,          -- for 'timed': how many turns
    drain_per_turn_pct  DECIMAL(5,2) DEFAULT 0,             -- for 'sustained': % of base PL drained
    activation_cost_pct DECIMAL(5,2) DEFAULT 0,             -- one-time cost to transform
    cooldown_turns      INT UNSIGNED DEFAULT 0,             -- turns before can re-transform after reverting
    -- Event-based triggers
    event_trigger       VARCHAR(64) DEFAULT NULL,            -- "full_moon", "devils_star", "rage"
    event_schedule_json JSON DEFAULT NULL,                   -- {"day_of_month": [5, 18]} for Devil's Star

    -- ── Controllability ──
    -- Uncontrolled = character acts randomly (Oozaru rage)
    controllable        TINYINT(1) NOT NULL DEFAULT 1,
    control_training_npc INT UNSIGNED DEFAULT NULL,         -- NPC that teaches control
    control_training_sessions INT UNSIGNED DEFAULT 0,       -- sessions needed for control
    uncontrolled_behavior ENUM('berserk','random','flee','frozen') DEFAULT 'berserk',
    -- Memory loss when uncontrolled
    memory_loss         TINYINT(1) NOT NULL DEFAULT 0,

    -- ── Loss Conditions ──
    -- What causes the transformation to end prematurely
    loss_conditions_json JSON DEFAULT NULL,
    -- Format: [{"type": "tail_cut", "message": "Your tail is severed! The great ape shrinks..."},
    --          {"type": "hp_below_pct", "value": 5, "message": "Too weak to maintain the form..."},
    --          {"type": "ki_depleted", "message": "Your energy is spent..."}]

    -- ── Stacking / Tiers ──
    -- For Kaioken-style: same form but different multiplier tiers
    is_stackable        TINYINT(1) NOT NULL DEFAULT 0,
    stack_tiers_json    JSON DEFAULT NULL,
    -- Format: [{"tier": 1, "name": "Kaioken", "multiplier": 2, "drain": 3},
    --          {"tier": 2, "name": "Kaioken x3", "multiplier": 3, "drain": 5},
    --          {"tier": 3, "name": "Kaioken x10", "multiplier": 10, "drain": 15},
    --          {"tier": 4, "name": "Kaioken x20", "multiplier": 20, "drain": 30, "damage_to_self_pct": 5}]

    -- ── Meta ──
    is_secret           TINYINT(1) NOT NULL DEFAULT 0,      -- hidden until unlocked (like SSJ rumors)
    sort_order          INT UNSIGNED DEFAULT 0,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_transformations_ruleset (ruleset_id),
    INDEX idx_transformations_race (required_race),
    INDEX idx_transformations_chain (chain_group, chain_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── CHARACTER TRANSFORMATIONS ───────────────────────────────
-- Tracks which transformations each character has unlocked + mastery
CREATE TABLE IF NOT EXISTS character_transformations (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id        INT UNSIGNED NOT NULL,
    transformation_id   INT UNSIGNED NOT NULL,
    unlocked            TINYINT(1) NOT NULL DEFAULT 0,
    is_controlled       TINYINT(1) NOT NULL DEFAULT 0,     -- trained to control it
    control_sessions    INT UNSIGNED DEFAULT 0,             -- training progress
    times_used          INT UNSIGNED DEFAULT 0,
    current_stack_tier  INT UNSIGNED DEFAULT 0,             -- for stackable forms
    unlocked_at         DATETIME DEFAULT NULL,
    last_used_at        DATETIME DEFAULT NULL,
    UNIQUE KEY uq_char_transform (character_id, transformation_id),
    INDEX idx_char_transforms (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── ACTIVE TRANSFORMATION STATE ─────────────────────────────
-- Currently active transformation per character (only one at a time
-- unless chain allows stacking)
CREATE TABLE IF NOT EXISTS character_active_transformation (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id        INT UNSIGNED NOT NULL,
    transformation_id   INT UNSIGNED NOT NULL,
    stack_tier          INT UNSIGNED DEFAULT 0,
    activated_at        DATETIME NOT NULL,
    turns_remaining     INT UNSIGNED DEFAULT NULL,          -- NULL = unlimited
    drain_accumulated   DECIMAL(10,2) DEFAULT 0,            -- total PL drained so far
    UNIQUE KEY uq_char_active (character_id),               -- only one active transform
    INDEX idx_active_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
