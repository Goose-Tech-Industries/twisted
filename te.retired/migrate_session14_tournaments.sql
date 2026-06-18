-- =================================================================
-- SESSION 14 — TOURNAMENT SYSTEM
-- =================================================================
-- Run ONCE after migrate_session13_fighting_styles.sql.
-- =================================================================


-- =================================================================
-- 1. TOURNAMENTS TABLE
-- =================================================================

CREATE TABLE IF NOT EXISTS game_tournaments (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(128) NOT NULL,
    description         TEXT         DEFAULT NULL,
    arena_id            INT          DEFAULT NULL,
    type                ENUM('SINGLE_ELIM','DOUBLE_ELIM','ROUND_ROBIN','SWISS') NOT NULL DEFAULT 'SINGLE_ELIM',
    status              ENUM('DRAFT','SCHEDULED','REGISTRATION','ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'DRAFT',

    -- Scheduling
    schedule_type       ENUM('once','weekly','biweekly','monthly','bimonthly','quarterly','yearly') NOT NULL DEFAULT 'once',
    schedule_day        INT          DEFAULT NULL COMMENT 'day of week (0=Sun) or day of month',
    schedule_time       TIME         DEFAULT '18:00:00',
    next_occurrence     DATETIME     DEFAULT NULL,
    auto_create         TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'auto-create next tournament on completion',

    -- Entry
    entry_fee           INT          NOT NULL DEFAULT 0,
    min_level           INT          NOT NULL DEFAULT 1,
    max_level           INT          NOT NULL DEFAULT 99,
    max_participants    INT          NOT NULL DEFAULT 16,
    level_matching      TINYINT(1)   NOT NULL DEFAULT 0,

    -- Rules
    force_nonlethal     TINYINT(1)   NOT NULL DEFAULT 1,
    allow_sig_techs     TINYINT(1)   NOT NULL DEFAULT 1,
    allow_items         TINYINT(1)   NOT NULL DEFAULT 0,
    allow_ki_channeling TINYINT(1)   NOT NULL DEFAULT 1,
    heal_between_rounds TINYINT(1)   NOT NULL DEFAULT 1,

    -- Prizes
    prize_pool_json     JSON         DEFAULT NULL COMMENT '{"1st":{"gold":1000,"items":[]},"2nd":{"gold":500},"3rd":{"gold":250}}',

    -- Registration window
    registration_start  DATETIME     DEFAULT NULL,
    registration_end    DATETIME     DEFAULT NULL,

    -- Timestamps
    started_at          DATETIME     DEFAULT NULL,
    ended_at            DATETIME     DEFAULT NULL,
    winner_char_id      INT          DEFAULT NULL,
    created_by          INT          DEFAULT NULL,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_status (status),
    INDEX idx_next (next_occurrence)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =================================================================
-- 2. PARTICIPANTS
-- =================================================================

CREATE TABLE IF NOT EXISTS game_tournament_participants (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id   INT          NOT NULL,
    character_id    INT          NOT NULL,
    seed            INT          DEFAULT NULL,
    status          ENUM('registered','active','eliminated','winner','withdrawn') NOT NULL DEFAULT 'registered',
    wins            INT          NOT NULL DEFAULT 0,
    losses          INT          NOT NULL DEFAULT 0,
    registered_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_tourney_char (tournament_id, character_id),
    FOREIGN KEY (tournament_id) REFERENCES game_tournaments(id) ON DELETE CASCADE,
    INDEX idx_tourney (tournament_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =================================================================
-- 3. ROUNDS
-- =================================================================

CREATE TABLE IF NOT EXISTS game_tournament_rounds (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id   INT          NOT NULL,
    round_number    INT          NOT NULL,
    round_name      VARCHAR(64)  DEFAULT NULL COMMENT 'Quarter-Finals, Semi-Finals, Finals, etc.',
    status          ENUM('pending','active','completed') NOT NULL DEFAULT 'pending',
    started_at      DATETIME     DEFAULT NULL,
    ended_at        DATETIME     DEFAULT NULL,
    UNIQUE KEY uq_tourney_round (tournament_id, round_number),
    FOREIGN KEY (tournament_id) REFERENCES game_tournaments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =================================================================
-- 4. MATCHES
-- =================================================================

CREATE TABLE IF NOT EXISTS game_tournament_matches (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id   INT          NOT NULL,
    round_id        INT          NOT NULL,
    match_order     INT          NOT NULL DEFAULT 0,
    p1_char_id      INT          DEFAULT NULL,
    p2_char_id      INT          DEFAULT NULL,
    winner_char_id  INT          DEFAULT NULL,
    battle_id       INT          DEFAULT NULL COMMENT 'links to game_battles for replay',
    status          ENUM('pending','active','completed','bye') NOT NULL DEFAULT 'pending',
    scheduled_at    DATETIME     DEFAULT NULL,
    completed_at    DATETIME     DEFAULT NULL,
    FOREIGN KEY (tournament_id) REFERENCES game_tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (round_id) REFERENCES game_tournament_rounds(id) ON DELETE CASCADE,
    INDEX idx_tourney_round (tournament_id, round_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =================================================================
-- 5. HISTORY / LEADERBOARD
-- =================================================================

CREATE TABLE IF NOT EXISTS game_tournament_history (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id   INT          NOT NULL,
    character_id    INT          NOT NULL,
    placement       INT          NOT NULL COMMENT '1=winner, 2=runner-up, 3=third, etc.',
    prize_json      JSON         DEFAULT NULL,
    recorded_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_char (character_id),
    INDEX idx_tourney (tournament_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =================================================================
-- 6. FEATURE FLAGS
-- =================================================================

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_tournaments',          'true'),
('tournament_auto_schedule',    'true'),
('tournament_announce_channel', 'global');
