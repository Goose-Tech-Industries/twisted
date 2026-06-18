-- =================================================================
-- PARTY & FRIENDS SYSTEM — SAFE MIGRATION
-- Run this on your twisted_rpg database.
-- All tables use IF NOT EXISTS so it's safe to re-run.
-- =================================================================

-- FRIENDS TABLE
-- Tracks friend requests and accepted friendships.
-- One row per directed relationship (A->B and B->A when accepted).
-- status: 'pending' | 'accepted' | 'blocked'
CREATE TABLE IF NOT EXISTS `character_friends` (
    `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `requester_id`  INT UNSIGNED NOT NULL,   -- who sent the request
    `recipient_id`  INT UNSIGNED NOT NULL,   -- who received it
    `status`        VARCHAR(16) NOT NULL DEFAULT 'pending',
    `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY `uq_pair` (`requester_id`, `recipient_id`),
    KEY `idx_recipient` (`recipient_id`, `status`),
    KEY `idx_requester` (`requester_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PARTIES TABLE
-- A party is a temporary group (max 4 members).
-- Parties are also tracked in server memory for real-time ops,
-- but persisted here so members can see party status on re-login.
CREATE TABLE IF NOT EXISTS `character_parties` (
    `id`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `leader_id`    INT UNSIGNED NOT NULL,   -- character_id of the leader
    `name`         VARCHAR(60) DEFAULT NULL, -- optional party name
    `max_size`     TINYINT UNSIGNED NOT NULL DEFAULT 4,
    `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `disbanded_at` DATETIME DEFAULT NULL,    -- set when party is disbanded
    `is_active`    TINYINT(1) NOT NULL DEFAULT 1,
    KEY `idx_leader`    (`leader_id`),
    KEY `idx_active`    (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PARTY MEMBERS TABLE
-- Links characters to parties.
CREATE TABLE IF NOT EXISTS `character_party_members` (
    `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `party_id`    INT UNSIGNED NOT NULL,
    `character_id`INT UNSIGNED NOT NULL,
    `role`        VARCHAR(16) NOT NULL DEFAULT 'member',  -- 'leader' | 'member'
    `joined_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `left_at`     DATETIME DEFAULT NULL,
    `is_active`   TINYINT(1) NOT NULL DEFAULT 1,

    UNIQUE KEY `uq_active_member` (`character_id`, `party_id`),
    KEY `idx_party`  (`party_id`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT 'Party & Friends tables created successfully!' AS status;
