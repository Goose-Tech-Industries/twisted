-- =============================================================
-- MIGRATION: Alignment Gating for NPCs, Shops, Quests
-- =============================================================
-- Adds alignment requirements to NPCs, shops, and quests so
-- evil NPCs only deal with evil players, good NPCs refuse evil, etc.
-- =============================================================

-- ── NPCs: alignment range for interaction ──
ALTER TABLE game_npcs
    ADD COLUMN IF NOT EXISTS alignment_min INT DEFAULT NULL,        -- NULL = any alignment can talk
    ADD COLUMN IF NOT EXISTS alignment_max INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS alignment_refuse_msg VARCHAR(255) DEFAULT NULL,  -- "I don't deal with your kind."
    ADD COLUMN IF NOT EXISTS alignment_faction ENUM('good','neutral','evil','any') DEFAULT 'any';

-- ── Shops: alignment-based pricing and access ──
ALTER TABLE game_shops
    ADD COLUMN IF NOT EXISTS alignment_min INT DEFAULT NULL,        -- NULL = open to all
    ADD COLUMN IF NOT EXISTS alignment_max INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS alignment_refuse_msg VARCHAR(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS evil_discount_pct DECIMAL(5,2) DEFAULT 0,    -- evil shops discount for evil players
    ADD COLUMN IF NOT EXISTS good_discount_pct DECIMAL(5,2) DEFAULT 0,    -- good shops discount for good players
    ADD COLUMN IF NOT EXISTS alignment_price_mult_json JSON DEFAULT NULL;
    -- Format: {"evil": 0.80, "neutral": 1.00, "good": 1.30}
    -- Evil shop: evil players pay 80%, good players pay 130%

-- ── Quests: alignment requirements and shifts ──
ALTER TABLE game_quests
    ADD COLUMN IF NOT EXISTS alignment_min INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS alignment_max INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS alignment_shift_on_accept INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS alignment_shift_on_complete INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS alignment_refuse_msg VARCHAR(255) DEFAULT NULL;

-- ── Items: alignment requirements to equip/use ──
ALTER TABLE game_items
    ADD COLUMN IF NOT EXISTS alignment_min INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS alignment_max INT DEFAULT NULL;

-- ── Techniques: alignment requirements to learn ──
-- (already has required_race/class, add alignment)
ALTER TABLE game_techniques
    ADD COLUMN IF NOT EXISTS alignment_min INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS alignment_max INT DEFAULT NULL;
