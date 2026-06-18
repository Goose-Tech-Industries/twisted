-- =============================================================
-- MIGRATION: Fusion System — Character Merging
-- =============================================================
-- Supports all fusion types:
--   - Namekian Fusion (permanent, one absorbs the other)
--   - Fusion Dance (timed, requires similar PL, specific pose/sync)
--   - Potara Earrings (timed or permanent, no PL requirement)
--   - Absorption (villains absorb others, gain their power)
--   - Custom admin-defined fusion methods
--
-- Key features:
--   - Combined stats from both characters
--   - Shared or merged technique pool
--   - Timed or permanent duration
--   - Defuse conditions (damage threshold, time limit, item removal)
--   - New appearance/name (configurable: combined names, custom)
--   - Admin-defined fusion types (not hardcoded)
-- =============================================================

-- ─── FUSION TYPES ────────────────────────────────────────────
-- Admin defines available fusion methods per ruleset.
CREATE TABLE IF NOT EXISTS game_fusion_types (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ruleset_id          INT UNSIGNED DEFAULT NULL,
    name                VARCHAR(128) NOT NULL,             -- "Fusion Dance", "Namekian Fusion", "Potara"
    description         TEXT,
    icon                VARCHAR(32) DEFAULT NULL,

    -- ── Method ──
    method              ENUM('dance','item','permanent','absorption','ritual','custom') NOT NULL DEFAULT 'dance',
    -- 'dance'       = Fusion Dance — both must perform, timed, PL match required
    -- 'item'        = Item-based (Potara earrings) — use item, timed
    -- 'permanent'   = One absorbs the other permanently (Namekian Fusion)
    -- 'absorption'  = Villain absorbs target, gains power (Cell, Buu)
    -- 'ritual'      = Requires multiple participants + conditions
    -- 'custom'      = DM-controlled

    -- ── Requirements ──
    required_item_id    INT UNSIGNED DEFAULT NULL,          -- Potara earrings, etc.
    item_consumed       TINYINT(1) NOT NULL DEFAULT 1,      -- item used up on fusion
    required_race_a     VARCHAR(64) DEFAULT NULL,            -- first fusee race (NULL=any)
    required_race_b     VARCHAR(64) DEFAULT NULL,            -- second fusee race (NULL=any)
    same_race_required  TINYINT(1) NOT NULL DEFAULT 0,       -- both must be same race
    pl_match_required   TINYINT(1) NOT NULL DEFAULT 0,       -- must have similar PL
    pl_match_tolerance  DECIMAL(5,2) DEFAULT 10.00,          -- within X% of each other
    min_level           INT UNSIGNED DEFAULT 0,
    both_must_consent   TINYINT(1) NOT NULL DEFAULT 1,       -- both players agree

    -- ── NPC Fusion (trust-gated) ──
    -- For fusing with NPCs (Piccolo+Nail, Piccolo+Kami).
    -- Requires high affinity/trust with the NPC companion.
    allow_npc_fusion    TINYINT(1) NOT NULL DEFAULT 0,       -- can fuse with NPC companions
    required_affinity_tier VARCHAR(32) DEFAULT 'bonded',     -- min affinity tier: confidant, bonded
    required_affinity   INT UNSIGNED DEFAULT 300,            -- raw affinity score needed (bonded=500, confidant=300)
    npc_must_be_companion TINYINT(1) NOT NULL DEFAULT 1,     -- NPC must be an active companion
    npc_willingness_check TINYINT(1) NOT NULL DEFAULT 1,     -- NPC personality affects consent
    -- What happens to the NPC after permanent fusion
    npc_absorbed        TINYINT(1) NOT NULL DEFAULT 1,       -- NPC ceases to exist as separate entity
    npc_personality_blend TINYINT(1) NOT NULL DEFAULT 1,     -- fused char gains NPC personality traits

    -- ── Result Stats ──
    -- How to combine the two characters' stats
    stat_combine_mode   ENUM('add','average','dominant','multiply','custom') DEFAULT 'add',
    -- 'add'       = A + B (Namekian Fusion)
    -- 'average'   = (A + B) / 2 then multiplied
    -- 'dominant'  = higher of each stat
    -- 'multiply'  = A * B / base (for dramatic power scaling)
    -- 'custom'    = use stat_formula_json
    stat_multiplier     DECIMAL(8,2) DEFAULT 1.00,          -- applied after combination (10x for Fusion Dance)
    stat_formula_json   JSON DEFAULT NULL,                   -- custom: {"atk": "a.atk + b.atk * 2", ...}

    -- ── Techniques ──
    technique_merge     ENUM('union','intersection','dominant','custom') DEFAULT 'union',
    -- 'union'        = knows ALL techniques from both characters
    -- 'intersection' = only techniques both know
    -- 'dominant'     = only the dominant character's techniques
    -- 'custom'       = admin picks

    -- ── Duration ──
    duration_type       ENUM('permanent','timed','until_defuse','battle_only') DEFAULT 'timed',
    duration_minutes    INT UNSIGNED DEFAULT 30,             -- real-time minutes (Fusion Dance = 30)
    duration_turns      INT UNSIGNED DEFAULT NULL,           -- battle turns (alternative to minutes)

    -- ── Defuse Conditions ──
    defuse_on_ko        TINYINT(1) NOT NULL DEFAULT 1,       -- defuse if fused char is KO'd
    defuse_on_damage_pct DECIMAL(5,2) DEFAULT NULL,          -- defuse if HP drops below X%
    defuse_on_item_remove TINYINT(1) NOT NULL DEFAULT 0,     -- remove Potara = defuse
    defuse_on_ki_depleted TINYINT(1) NOT NULL DEFAULT 0,
    manual_defuse       TINYINT(1) NOT NULL DEFAULT 0,       -- can voluntarily defuse

    -- ── Appearance ──
    naming_mode         ENUM('combined','dominant','custom') DEFAULT 'combined',
    -- 'combined'  = "Vegito" (Vegeta + Kakarot), "Gotenks" (Goten + Trunks)
    -- 'dominant'  = keep dominant character's name
    -- 'custom'    = player chooses
    appearance_mode     ENUM('blend','dominant_a','dominant_b','custom') DEFAULT 'blend',
    aura_color          VARCHAR(16) DEFAULT NULL,
    sprite_override     VARCHAR(255) DEFAULT NULL,

    -- ── Failure ──
    can_fail            TINYINT(1) NOT NULL DEFAULT 0,       -- Fusion Dance can fail (Fat Gotenks)
    fail_chance_pct     DECIMAL(5,2) DEFAULT 5.00,
    fail_stat_penalty   DECIMAL(4,2) DEFAULT 0.10,           -- 10% stats on failed fusion
    fail_duration_minutes INT UNSIGNED DEFAULT 30,            -- stuck in failed form for this long

    -- ── Cooldown ──
    cooldown_minutes    INT UNSIGNED DEFAULT 60,              -- can't re-fuse for this long after defuse

    sort_order          INT UNSIGNED DEFAULT 0,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_fusion_types_ruleset (ruleset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── ACTIVE FUSIONS ──────────────────────────────────────────
-- Currently fused characters
CREATE TABLE IF NOT EXISTS character_fusions (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    fusion_type_id      INT UNSIGNED NOT NULL,
    -- The two source characters
    character_a_id      INT UNSIGNED NOT NULL,               -- dominant / initiator
    character_b_id      INT UNSIGNED NOT NULL,               -- secondary
    -- The fused result (created as a temporary character or overlay)
    fused_char_id       INT UNSIGNED DEFAULT NULL,            -- temp character row if needed
    fused_name          VARCHAR(128) DEFAULT NULL,
    -- Combined stats snapshot
    fused_stats_json    JSON DEFAULT NULL,                    -- {"atk": 50000, "def": 30000, ...}
    fused_techniques_json JSON DEFAULT NULL,                  -- [tech_id, tech_id, ...]
    -- State
    status              ENUM('active','defused','failed','expired') DEFAULT 'active',
    is_failed_fusion    TINYINT(1) NOT NULL DEFAULT 0,
    -- Timing
    fused_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at          DATETIME DEFAULT NULL,
    defused_at          DATETIME DEFAULT NULL,
    cooldown_until      DATETIME DEFAULT NULL,
    INDEX idx_fusions_active (status),
    INDEX idx_fusions_char_a (character_a_id),
    INDEX idx_fusions_char_b (character_b_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
