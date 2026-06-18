-- =============================================================
-- MIGRATION: Technique System — Fully Admin-Configurable
-- =============================================================
-- Supports any RPG's attack/ability system:
--   - Basic physical (Punch, Kick, Uppercut)
--   - Ki/Magic attacks with cost % and damage %
--   - Signature techniques with level scaling + ability slots
--   - Hidden/secret techniques with unlock conditions
--   - Fighting styles with mastery progression
--   - Defense types (dodge, block, counter, absorb)
-- All values editable in AdminSauce. Per-ruleset.
-- =============================================================

-- ─── TECHNIQUES ──────────────────────────────────────────────
-- Every attack, ability, defense, and special move
CREATE TABLE IF NOT EXISTS game_techniques (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ruleset_id          INT UNSIGNED DEFAULT NULL,    -- NULL = global (available to all rulesets)

    -- ── Identity ──
    name                VARCHAR(128) NOT NULL,
    description         TEXT,
    icon                VARCHAR(32) DEFAULT NULL,      -- emoji or icon name
    category            ENUM('physical','ki','signature','defense','healing','utility','transformation','hidden') NOT NULL DEFAULT 'physical',
    subcategory         VARCHAR(64) DEFAULT NULL,      -- 'punch', 'kick', 'beam', 'blast', 'aura', etc.

    -- ── Damage & Cost ──
    -- All values as percentages of current powerlevel (single-stat mode)
    -- or as flat values / formulas (multi-stat mode)
    damage_pct          DECIMAL(6,2) DEFAULT 0,        -- % of attacker's current PL (e.g. 5.00 = 5%)
    damage_formula      VARCHAR(128) DEFAULT NULL,      -- custom: "atk * 1.5 + level * 2" (overrides pct if set)
    cost_pct            DECIMAL(6,2) DEFAULT 0,         -- % of user's PL deducted on use
    cost_formula        VARCHAR(128) DEFAULT NULL,       -- custom cost formula
    min_damage_pct      DECIMAL(6,2) DEFAULT NULL,       -- physical attacks: minimum = half max. NULL = no floor

    -- ── Combat Properties ──
    attack_type         ENUM('melee','ranged','beam','blast','aura','self','passive') DEFAULT 'melee',
    range_type          ENUM('short','medium','long','self') DEFAULT 'short',
    targets             ENUM('single','multi','aoe','self','ally') DEFAULT 'single',
    multi_hit_count     INT UNSIGNED DEFAULT 1,         -- multi-hit: splits damage among N targets
    can_be_dodged       TINYINT(1) NOT NULL DEFAULT 1,
    can_be_blocked      TINYINT(1) NOT NULL DEFAULT 1,
    can_be_countered    TINYINT(1) NOT NULL DEFAULT 0,  -- only energy attacks
    dodge_modifier      DECIMAL(5,2) DEFAULT 0,         -- +15% opponent dodge for ki attacks
    guard_crush         TINYINT(1) NOT NULL DEFAULT 0,  -- bypasses blocking
    guaranteed_hit      TINYINT(1) NOT NULL DEFAULT 0,  -- bypasses dodge
    piercing            TINYINT(1) NOT NULL DEFAULT 0,  -- ignores armor/defense

    -- ── Status Effects ──
    stun_chance_pct     DECIMAL(5,2) DEFAULT 0,         -- % chance to stun
    stun_duration       INT UNSIGNED DEFAULT 0,          -- turns of stun
    bleed_chance_pct    DECIMAL(5,2) DEFAULT 0,
    bleed_severity      ENUM('none','light','moderate','heavy') DEFAULT 'none',
    crit_chance_pct     DECIMAL(5,2) DEFAULT 3.00,       -- default 3% for physical
    crit_damage_mult    DECIMAL(4,2) DEFAULT 1.50,       -- 150% damage on crit
    combo_chance_pct    DECIMAL(5,2) DEFAULT 0,          -- chance to proc extra attack

    -- ── Requirements ──
    min_level           INT UNSIGNED DEFAULT 0,
    min_powerlevel      INT UNSIGNED DEFAULT 0,
    required_race       VARCHAR(64) DEFAULT NULL,         -- NULL = any race
    required_class      VARCHAR(64) DEFAULT NULL,
    required_style_id   INT UNSIGNED DEFAULT NULL,        -- must have this fighting style
    required_style_wins INT UNSIGNED DEFAULT 0,           -- wins needed in that style
    required_technique_id INT UNSIGNED DEFAULT NULL,      -- must know prerequisite technique

    -- ── Signature Scaling ──
    -- If is_signature=1, this technique has levels 1-10 with scaling
    is_signature        TINYINT(1) NOT NULL DEFAULT 0,
    signature_type      ENUM('ki_manipulation','ki_healing','custom') DEFAULT NULL,
    max_level           INT UNSIGNED DEFAULT 10,
    level_damage_scale  JSON DEFAULT NULL,  -- [{"level":1,"damage_pct":10,"cost_pct":1}, ...]
    ability_slot_levels JSON DEFAULT NULL,  -- [3, 5, 8, 10] — levels that unlock ability slots

    -- ── Hidden/Secret ──
    is_hidden           TINYINT(1) NOT NULL DEFAULT 0,   -- not shown until discovered
    discovery_method    ENUM('quest','npc','location','achievement','combat','dm_grant','item') DEFAULT NULL,
    discovery_hint      TEXT DEFAULT NULL,                 -- vague hint shown to players

    -- ── Charging ──
    can_charge          TINYINT(1) NOT NULL DEFAULT 0,    -- multi-turn charge
    charge_damage_bonus_pct DECIMAL(5,2) DEFAULT 0,       -- +% damage per charge turn
    charge_cost_per_turn    DECIMAL(5,2) DEFAULT 0,       -- PL cost per charge turn

    -- ── Meta ──
    sort_order          INT UNSIGNED DEFAULT 0,
    is_starter          TINYINT(1) NOT NULL DEFAULT 0,    -- given to new characters
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_techniques_ruleset (ruleset_id),
    INDEX idx_techniques_category (category),
    INDEX idx_techniques_hidden (is_hidden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── TECHNIQUE ABILITY SLOTS ─────────────────────────────────
-- Customizable abilities that slot into signature techniques.
-- Admin defines the available pool; players pick when they unlock a slot.
CREATE TABLE IF NOT EXISTS game_technique_abilities (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ruleset_id          INT UNSIGNED DEFAULT NULL,

    name                VARCHAR(128) NOT NULL,           -- "1 Turn Stun", "Guard Crush", "Bleed", etc.
    description         TEXT,
    icon                VARCHAR(32) DEFAULT NULL,
    slot_type           ENUM('ki_manipulation','ki_healing','custom') NOT NULL,

    -- ── Effects (applied when slotted) ──
    damage_modifier_pct DECIMAL(5,2) DEFAULT 0,          -- -10% for stun, +10% for damage boost
    cost_modifier_pct   DECIMAL(5,2) DEFAULT 0,          -- +4% for guard crush
    stun_duration       INT UNSIGNED DEFAULT 0,
    bleed_severity      ENUM('none','light','moderate','heavy') DEFAULT 'none',
    guaranteed_hit      TINYINT(1) NOT NULL DEFAULT 0,
    guard_crush         TINYINT(1) NOT NULL DEFAULT 0,
    multi_hit_count     INT UNSIGNED DEFAULT 0,           -- 0 = no change
    piercing            TINYINT(1) NOT NULL DEFAULT 0,
    heal_modifier_pct   DECIMAL(5,2) DEFAULT 0,           -- for ki_healing: +healing
    extra_uses          INT UNSIGNED DEFAULT 0,            -- for ki_healing: +daily uses
    dodge_boost_pct     DECIMAL(5,2) DEFAULT 0,            -- for ki_healing: +dodge after heal
    limb_regeneration   TINYINT(1) NOT NULL DEFAULT 0,     -- for ki_healing
    custom_effect_json  JSON DEFAULT NULL,                  -- any other effect

    -- ── Requirements ──
    min_base_damage_pct DECIMAL(5,2) DEFAULT 0,            -- "requires >= 10% base damage"
    min_technique_level INT UNSIGNED DEFAULT 0,

    sort_order          INT UNSIGNED DEFAULT 0,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_tech_abilities_ruleset (ruleset_id),
    INDEX idx_tech_abilities_type (slot_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── CHARACTER TECHNIQUES ────────────────────────────────────
-- Which techniques each character knows + their level in signatures
CREATE TABLE IF NOT EXISTS character_techniques (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id        INT UNSIGNED NOT NULL,
    technique_id        INT UNSIGNED NOT NULL,
    current_level       INT UNSIGNED NOT NULL DEFAULT 1,  -- for signatures
    slotted_abilities   JSON DEFAULT NULL,                 -- array of ability IDs slotted
    times_used          INT UNSIGNED DEFAULT 0,
    discovered_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_char_tech (character_id, technique_id),
    INDEX idx_char_techniques (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── FIGHTING STYLES ─────────────────────────────────────────
-- Martial arts styles that unlock/boost certain techniques
CREATE TABLE IF NOT EXISTS game_fighting_styles (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ruleset_id          INT UNSIGNED DEFAULT NULL,
    name                VARCHAR(128) NOT NULL,            -- "Turtle School", "Crane School", etc.
    description         TEXT,
    icon                VARCHAR(32) DEFAULT NULL,

    -- ── Passive Bonuses (while active) ──
    damage_bonus_pct    DECIMAL(5,2) DEFAULT 0,           -- +% damage to matching attacks
    dodge_bonus_pct     DECIMAL(5,2) DEFAULT 0,
    block_bonus_pct     DECIMAL(5,2) DEFAULT 0,
    counter_bonus_pct   DECIMAL(5,2) DEFAULT 0,
    custom_bonus_json   JSON DEFAULT NULL,                 -- any other bonus

    -- ── Mastery ──
    -- Wins while using this style progress mastery
    mastery_levels_json JSON DEFAULT NULL,
    -- Format: [{"wins": 10, "name": "Novice", "bonus": 0}, {"wins": 50, "name": "Adept", "bonus": 5}, ...]

    -- ── Availability ──
    required_race       VARCHAR(64) DEFAULT NULL,
    required_npc_master INT UNSIGNED DEFAULT NULL,         -- NPC that teaches this style
    min_level           INT UNSIGNED DEFAULT 0,

    sort_order          INT UNSIGNED DEFAULT 0,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_styles_ruleset (ruleset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── CHARACTER FIGHTING STYLES ───────────────────────────────
CREATE TABLE IF NOT EXISTS character_fighting_styles (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id        INT UNSIGNED NOT NULL,
    style_id            INT UNSIGNED NOT NULL,
    is_active           TINYINT(1) NOT NULL DEFAULT 0,    -- only one active at a time
    wins                INT UNSIGNED DEFAULT 0,
    losses              INT UNSIGNED DEFAULT 0,
    learned_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_char_style (character_id, style_id),
    INDEX idx_char_styles (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── DEFENSE FORMULAS (per-ruleset) ──────────────────────────
-- Instead of hardcoding dodge/block/counter rules, store them
-- as configurable formulas per ruleset.
CREATE TABLE IF NOT EXISTS game_defense_formulas (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ruleset_id          INT UNSIGNED NOT NULL,

    defense_type        ENUM('dodge','block','counter','absorb','parry') NOT NULL,
    label               VARCHAR(64) NOT NULL,
    description         TEXT,

    -- ── Base Chance ──
    base_chance_pct     DECIMAL(5,2) NOT NULL DEFAULT 15, -- 15% dodge at equal PL
    -- ── Scaling ──
    -- How chance scales with power difference
    -- 'pl_ratio'   = PM style: +35% per 2x PL advantage
    -- 'stat_diff'  = BG3 style: AC vs attack roll
    -- 'flat'       = fixed chance regardless of stats
    -- 'formula'    = custom formula in scale_formula
    scale_mode          ENUM('pl_ratio','stat_diff','flat','formula') DEFAULT 'pl_ratio',
    scale_value         DECIMAL(6,2) DEFAULT 35,           -- +35% per doubling (PM)
    scale_formula       VARCHAR(256) DEFAULT NULL,          -- custom: "15 + (defender_pl / attacker_pl - 1) * 35"
    max_chance_pct      DECIMAL(5,2) DEFAULT 90,            -- cap

    -- ── Block specifics ──
    block_dice          VARCHAR(16) DEFAULT 'd6',           -- d6, d12 (stunned), d20
    block_success_range VARCHAR(16) DEFAULT '1-2',          -- which die results = success
    block_reduction_single DECIMAL(5,2) DEFAULT 25,         -- one block = 25% reduction
    block_reduction_double DECIMAL(5,2) DEFAULT 50,         -- two blocks = 50%
    consumes_turn       TINYINT(1) NOT NULL DEFAULT 0,      -- blocking doesn't use your turn (PM)

    -- ── Counter specifics ──
    counter_requires_stronger TINYINT(1) NOT NULL DEFAULT 1, -- must be stronger blast
    counter_charging_bonus_pct DECIMAL(5,2) DEFAULT 25,      -- +25% if already charging

    -- ── Stun Penalty ──
    stun_penalty_pct    DECIMAL(5,2) DEFAULT 50,             -- -50% to this defense when stunned
    stun_partial_block_reduces DECIMAL(5,2) DEFAULT 25,      -- partial block reduces penalty to -25%

    -- ── Diminishing Returns (same-attack repeat) ──
    repeat_dodge_bonus_pct DECIMAL(5,2) DEFAULT 5,           -- +5% per repeat
    repeat_dodge_max_pct   DECIMAL(5,2) DEFAULT 15,          -- max +15%

    -- ── Ki Attack Penalty ──
    ki_dodge_bonus_pct  DECIMAL(5,2) DEFAULT 15,             -- ki attacks give +15% dodge to opponent

    sort_order          INT UNSIGNED DEFAULT 0,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_defense_formulas_ruleset (ruleset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── NPC TECHNIQUE TEACHING ──────────────────────────────────
-- Links NPCs to the techniques they can teach, with conditions.
-- Example: Roshi (NPC #42) teaches Kamehameha (tech #15)
--   when: player completes quest #7 AND has trained 3 times with him
CREATE TABLE IF NOT EXISTS game_npc_techniques (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    npc_id              INT UNSIGNED NOT NULL,           -- which NPC teaches this
    technique_id        INT UNSIGNED NOT NULL,           -- what they teach

    -- ── Unlock Conditions (all must be met) ──
    -- Leave NULL to skip a condition
    required_quest_id   INT UNSIGNED DEFAULT NULL,        -- must complete this quest first
    required_affinity   INT UNSIGNED DEFAULT 0,           -- companion affinity with this NPC
    required_train_count INT UNSIGNED DEFAULT 0,          -- times trained with this NPC
    required_powerlevel INT UNSIGNED DEFAULT 0,           -- minimum PL to learn
    required_level      INT UNSIGNED DEFAULT 0,           -- minimum character level
    required_gold       INT UNSIGNED DEFAULT 0,           -- gold cost to learn
    required_item_id    INT UNSIGNED DEFAULT NULL,         -- must have this item
    required_technique_id INT UNSIGNED DEFAULT NULL,       -- must know this technique first
    custom_condition_json JSON DEFAULT NULL,                -- any other conditions

    -- ── Teaching Details ──
    teach_dialogue      TEXT DEFAULT NULL,                  -- what the NPC says when teaching
    refuse_dialogue     TEXT DEFAULT NULL,                  -- what NPC says if conditions not met
    hint_dialogue       TEXT DEFAULT NULL,                  -- vague hint before conditions met
    -- e.g. "I see potential in you... but you're not ready yet. Come back when you're stronger."

    -- ── Teaching Method ──
    -- 'instant'     = learn immediately on talking to NPC
    -- 'training'    = requires N training sessions with this NPC
    -- 'quest'       = NPC gives a quest, technique granted on completion
    -- 'combat'      = must defeat the NPC in a spar
    -- 'observation' = watch NPC use it in combat (DM triggers this)
    teach_method        ENUM('instant','training','quest','combat','observation') DEFAULT 'instant',
    training_sessions_needed INT UNSIGNED DEFAULT 0,       -- for 'training' method

    sort_order          INT UNSIGNED DEFAULT 0,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY uq_npc_tech (npc_id, technique_id),
    INDEX idx_npc_techniques_npc (npc_id),
    INDEX idx_npc_techniques_tech (technique_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── CHARACTER NPC TRAINING PROGRESS ─────────────────────────
-- Tracks how many times a character has trained with a specific NPC
-- (for the 'training' teach method)
CREATE TABLE IF NOT EXISTS character_npc_training (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id        INT UNSIGNED NOT NULL,
    npc_id              INT UNSIGNED NOT NULL,
    sessions_completed  INT UNSIGNED NOT NULL DEFAULT 0,
    last_trained_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_char_npc (character_id, npc_id),
    INDEX idx_char_training (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── TECHNIQUE EXPOSURE / OBSERVATION LEARNING ───────────────
-- Tracks how many times a character has SEEN a technique used
-- (against them, by an ally, or by an NPC in the world).
-- After enough exposures, they can learn it — either automatically
-- or with a % chance roll each time.
--
-- Examples:
--   - Goku sees Kamehameha once → learns it (genius threshold: 1)
--   - Average fighter sees Final Flash 5 times → 75% learn chance
--   - Advanced Scouter records a move → counts as 3 exposures
CREATE TABLE IF NOT EXISTS character_technique_exposure (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id        INT UNSIGNED NOT NULL,
    technique_id        INT UNSIGNED NOT NULL,
    times_seen          INT UNSIGNED NOT NULL DEFAULT 0,   -- total times witnessed
    times_hit_by        INT UNSIGNED NOT NULL DEFAULT 0,   -- times hit by it (subset)
    times_used_against  INT UNSIGNED NOT NULL DEFAULT 0,   -- times opponent used it on you
    scouter_recorded    TINYINT(1) NOT NULL DEFAULT 0,     -- Advanced Scouter captured it
    first_seen_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    learned             TINYINT(1) NOT NULL DEFAULT 0,     -- set to 1 when learned
    learned_at          DATETIME DEFAULT NULL,
    UNIQUE KEY uq_char_exposure (character_id, technique_id),
    INDEX idx_exposure_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── TECHNIQUE LEARNING RULES ────────────────────────────────
-- Per-technique (or per-ruleset default) config for how observation
-- learning works. Admins set these — no hardcoding.
--
-- If a technique has no row here, it can't be learned by observation.
CREATE TABLE IF NOT EXISTS game_technique_learn_rules (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    technique_id        INT UNSIGNED DEFAULT NULL,          -- specific technique. NULL = ruleset default
    ruleset_id          INT UNSIGNED DEFAULT NULL,          -- ruleset-wide defaults

    -- ── Observation Learning ──
    can_learn_by_observation TINYINT(1) NOT NULL DEFAULT 0, -- can this move be copied?
    exposures_needed    INT UNSIGNED DEFAULT 5,             -- times seen before learn chance triggers
    learn_chance_pct    DECIMAL(5,2) DEFAULT 75.00,         -- % chance per exposure after threshold
    learn_chance_per_extra DECIMAL(5,2) DEFAULT 10.00,      -- +% per extra exposure past threshold
    max_learn_chance    DECIMAL(5,2) DEFAULT 95.00,

    -- ── Scouter Bonus ──
    scouter_exposure_bonus INT UNSIGNED DEFAULT 3,          -- recording counts as N extra exposures
    scouter_learn_chance_bonus DECIMAL(5,2) DEFAULT 25.00,  -- +% to learn chance if scouter recorded

    -- ── Requirements to copy ──
    min_powerlevel_ratio DECIMAL(4,2) DEFAULT 0.50,         -- must be at least 50% of user's PL
    required_race       VARCHAR(64) DEFAULT NULL,            -- only certain races can copy (NULL = any)
    blocked_races       VARCHAR(255) DEFAULT NULL,           -- comma-separated races that CAN'T copy

    -- ── Difficulty Modifiers ──
    -- Higher-level techniques are harder to learn by watching
    difficulty_multiplier DECIMAL(4,2) DEFAULT 1.00,        -- 2.0 = twice as hard to learn

    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY uq_learn_rule (technique_id, ruleset_id),
    INDEX idx_learn_rules_tech (technique_id),
    INDEX idx_learn_rules_ruleset (ruleset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── TECHNIQUE DISCOVERY (RP-BASED CREATION) ─────────────────
-- Tracks when a player repeatedly describes similar actions in
-- DM sessions or combat RP. After enough repetitions of a theme,
-- the system signals "you feel a technique taking shape" and
-- eventually lets them crystallize it into a real technique.
--
-- Flow:
--   1. Player says "I channel ki into my fist and strike" (DM session)
--   2. System/DM tags it as theme: "ki_fist" or "fire_punch" etc.
--   3. After N uses of that theme → "You feel something forming..."
--   4. After M uses → "A technique is taking shape! Name it."
--   5. Player names it, DM/system creates the technique with stats
--      derived from the action theme + player's current power
CREATE TABLE IF NOT EXISTS character_technique_discoveries (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id        INT UNSIGNED NOT NULL,
    campaign_id         INT UNSIGNED DEFAULT NULL,

    -- ── Pattern Tracking ──
    theme_tag           VARCHAR(64) NOT NULL,              -- admin/AI assigned: "ki_fist", "fire_beam", "rapid_strikes"
    theme_description   VARCHAR(255) DEFAULT NULL,         -- what the player has been describing
    keywords_json       JSON DEFAULT NULL,                 -- ["fire", "fist", "channel", "ki"] — matched from RP text

    -- ── Progress ──
    times_used          INT UNSIGNED NOT NULL DEFAULT 0,   -- how many times they've done this action
    -- Thresholds (from ruleset or defaults):
    hint_threshold      INT UNSIGNED DEFAULT 3,            -- "you feel something forming..."
    shape_threshold     INT UNSIGNED DEFAULT 6,            -- "a technique is taking shape!"
    ready_threshold     INT UNSIGNED DEFAULT 10,           -- "ready to crystallize — name your technique"
    hint_given          TINYINT(1) NOT NULL DEFAULT 0,
    shape_given         TINYINT(1) NOT NULL DEFAULT 0,

    -- ── Crystallization ──
    status              ENUM('forming','shaping','ready','crystallized','abandoned') DEFAULT 'forming',
    technique_id        INT UNSIGNED DEFAULT NULL,         -- set when crystallized into a real technique
    chosen_name         VARCHAR(128) DEFAULT NULL,          -- player-chosen name
    chosen_icon         VARCHAR(32) DEFAULT NULL,

    -- ── Base Stats (suggested by system, tweaked by DM) ──
    -- Derived from the theme and player's current stats
    suggested_category  ENUM('physical','ki','signature','healing','utility') DEFAULT 'ki',
    suggested_damage_pct DECIMAL(6,2) DEFAULT 8,
    suggested_cost_pct  DECIMAL(6,2) DEFAULT 5,
    suggested_effects_json JSON DEFAULT NULL,               -- {"stun_chance": 10, "bleed": "light"} etc.
    dm_override_json    JSON DEFAULT NULL,                  -- DM can override any suggested stats

    first_used_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    crystallized_at     DATETIME DEFAULT NULL,
    INDEX idx_discoveries_char (character_id, status),
    INDEX idx_discoveries_theme (theme_tag)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── DISCOVERY THEME TEMPLATES ───────────────────────────────
-- Admin-defined themes that the system recognizes from RP text.
-- When a player's action matches keywords, it maps to a theme.
-- Admins can pre-define common patterns or let AI detect them.
CREATE TABLE IF NOT EXISTS game_discovery_themes (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ruleset_id          INT UNSIGNED DEFAULT NULL,

    theme_tag           VARCHAR(64) NOT NULL,               -- "ki_fist", "fire_beam", "speed_blitz"
    label               VARCHAR(128) NOT NULL,              -- "Ki-Infused Strike", "Fire Beam", "Speed Blitz"
    description         TEXT,

    -- ── Keyword Matching ──
    -- If a player's RP text contains N of these keywords, tag the action
    keywords_json       JSON NOT NULL,                      -- ["ki", "fist", "channel", "punch", "infuse"]
    min_keyword_matches INT UNSIGNED DEFAULT 2,             -- must match at least 2 keywords

    -- ── Suggested Outcome ──
    suggested_category  ENUM('physical','ki','signature','healing','utility') DEFAULT 'ki',
    base_damage_pct     DECIMAL(6,2) DEFAULT 8,             -- starting damage for crystallized tech
    base_cost_pct       DECIMAL(6,2) DEFAULT 5,
    suggested_effects_json JSON DEFAULT NULL,

    -- ── Thresholds ──
    hint_at             INT UNSIGNED DEFAULT 3,
    shape_at            INT UNSIGNED DEFAULT 6,
    ready_at            INT UNSIGNED DEFAULT 10,

    -- ── Scaling ──
    -- Crystallized technique's power scales with player stats at time of creation
    damage_scale_formula VARCHAR(128) DEFAULT NULL,         -- "base + (powerlevel / 10000)" — extra % based on PL
    cost_scale_formula   VARCHAR(128) DEFAULT NULL,

    sort_order          INT UNSIGNED DEFAULT 0,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_themes_ruleset (ruleset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
