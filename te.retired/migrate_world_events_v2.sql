-- =================================================================
-- World Events v2 — Phases, Participation, Rewards
-- Extends the existing game_world_events system with multi-phase
-- progression, player participation tracking, and completion rewards.
-- Safe to re-run (IF NOT EXISTS).
-- =================================================================

-- ── Extend world events with phase support ─────────────────────
ALTER TABLE game_world_events
    ADD COLUMN IF NOT EXISTS icon          VARCHAR(8) DEFAULT NULL AFTER description,
    ADD COLUMN IF NOT EXISTS phase_count   INT NOT NULL DEFAULT 1 AFTER duration_minutes,
    ADD COLUMN IF NOT EXISTS current_phase INT NOT NULL DEFAULT 0 AFTER phase_count,
    ADD COLUMN IF NOT EXISTS phases_json   JSON DEFAULT NULL AFTER current_phase,
    ADD COLUMN IF NOT EXISTS rewards_json  JSON DEFAULT NULL AFTER phases_json,
    ADD COLUMN IF NOT EXISTS min_level     INT NOT NULL DEFAULT 1 AFTER rewards_json,
    ADD COLUMN IF NOT EXISTS max_participants INT NOT NULL DEFAULT 0 AFTER min_level,
    ADD COLUMN IF NOT EXISTS lore_text     TEXT DEFAULT NULL AFTER max_participants,
    ADD COLUMN IF NOT EXISTS announce_text VARCHAR(255) DEFAULT NULL AFTER lore_text,
    ADD COLUMN IF NOT EXISTS recur_interval_hours INT DEFAULT NULL AFTER announce_text;

-- ── Participation tracking ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_world_event_participants (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id        INT UNSIGNED NOT NULL,
    character_id    INT UNSIGNED NOT NULL,
    contribution    INT NOT NULL DEFAULT 0,
    joined_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rewarded        TINYINT(1) NOT NULL DEFAULT 0,

    UNIQUE KEY uq_event_char (event_id, character_id),
    INDEX idx_event (event_id),
    INDEX idx_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Event completion log ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_world_event_history (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id        INT UNSIGNED NOT NULL,
    event_name      VARCHAR(128) NOT NULL,
    outcome         ENUM('completed','failed','expired','cancelled') NOT NULL DEFAULT 'completed',
    participant_count INT NOT NULL DEFAULT 0,
    duration_actual INT NOT NULL DEFAULT 0,
    ended_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_event (event_id),
    INDEX idx_ended (ended_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Done ───────────────────────────────────────────────────────
