-- =================================================================
-- SESSION 10 — Ki Channeling + Bleed Tiers
-- =================================================================
-- Run ONCE after migrate_session9_flavor_combo.sql.
-- Safe to re-run: uses IF NOT EXISTS / INSERT IGNORE throughout.
-- =================================================================


-- =================================================================
-- 1. KI CHANNELING — Feature flags + tunable parameters
-- =================================================================
-- Ki Channeling (Planet Mado): once per battle, restore to full power
-- for N turns, then crash to a fraction of your pre-channel HP.

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_ki_channeling',    'true'),
('ki_channel_duration',     '5'),
('ki_channel_crash_pct',    '0.50'),
('ki_channel_uses_per_battle', '1');

-- Seed the Channel Ki command
-- Uses a high ID (13) to avoid conflicts with existing commands (1-12)
INSERT IGNORE INTO game_battle_commands (id, name, description, icon, effects, is_defense, defense_type, sort_order) VALUES
(13, 'Channel Ki', 'Surge to full power for 5 turns — then crash to half.', '🔥',
 '{"ki_channel":true}', 0, NULL, 13);


-- =================================================================
-- 2. BLEED TIERS TABLE
-- =================================================================
-- Three bleed severity levels, each dealing 3% of BASE maxHp per turn
-- but lasting different durations. Total damage scales with tier.
--
-- Mado rules:
--   Light:    2 turns, 6% total  (3% per turn)
--   Moderate: 4 turns, 12% total (3% per turn)
--   Heavy:    5 turns, 15% total (3% per turn)

CREATE TABLE IF NOT EXISTS game_bleed_tiers (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(32)  NOT NULL UNIQUE,
    label           VARCHAR(64)  NOT NULL,
    icon            VARCHAR(16)  NOT NULL DEFAULT '🩸',
    duration_turns  INT          NOT NULL DEFAULT 2,
    damage_pct      FLOAT        NOT NULL DEFAULT 0.03 COMMENT '% of BASE maxHp per turn',
    description     TEXT         DEFAULT NULL,
    color           VARCHAR(32)  DEFAULT NULL COMMENT 'CSS color class for UI',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_bleed_tiers (id, name, label, icon, duration_turns, damage_pct, description, color) VALUES
(1, 'light',    'Light Bleed',    '🩸', 2, 0.03, 'A shallow wound. 3% base HP per turn for 2 turns (6% total).',    'text-[oklch(0.65_0.15_25)]'),
(2, 'moderate', 'Moderate Bleed', '🩸', 4, 0.03, 'A deep cut. 3% base HP per turn for 4 turns (12% total).',       'text-[oklch(0.55_0.20_25)]'),
(3, 'heavy',    'Heavy Bleed',    '💉', 5, 0.03, 'A grievous wound. 3% base HP per turn for 5 turns (15% total).', 'text-destructive');

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_bleed_tiers', 'true');


-- =================================================================
-- 3. EXTEND SKILLS WITH BLEED TIER
-- =================================================================
-- Skills can inflict a specific bleed tier on hit.

ALTER TABLE game_skills
    ADD COLUMN IF NOT EXISTS bleed_tier VARCHAR(16) DEFAULT NULL
        AFTER combo_max_chain
        COMMENT 'light, moderate, or heavy — NULL = no bleed';


-- =================================================================
-- 4. EXTEND ARENAS WITH KI CHANNELING OVERRIDE
-- =================================================================

ALTER TABLE game_arenas
    ADD COLUMN IF NOT EXISTS override_ki_channeling ENUM('on','off','default') NOT NULL DEFAULT 'default'
        AFTER override_diminishing_returns;
