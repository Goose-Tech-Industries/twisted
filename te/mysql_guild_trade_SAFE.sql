-- =================================================================
-- GUILD & TRADE SYSTEM — SAFE MIGRATION
-- Run this on your twisted_rpg database.
-- All tables use IF NOT EXISTS so it's safe to re-run.
-- =================================================================

-- GUILDS TABLE
-- A guild is a persistent named group with a hierarchy of ranks.
-- Unlike parties (max 4, temporary), guilds are permanent.
CREATE TABLE IF NOT EXISTS `guilds` (
    `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`        VARCHAR(64)  NOT NULL UNIQUE,
    `tag`         VARCHAR(8)   NOT NULL,         -- Short 2-6 char tag [TAG]
    `leader_id`   INT UNSIGNED NOT NULL,          -- character_id of leader
    `description` VARCHAR(255) DEFAULT NULL,
    `emblem`      VARCHAR(8)   DEFAULT '⚔️',       -- emoji emblem
    `max_members` SMALLINT UNSIGNED NOT NULL DEFAULT 50,
    `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `disbanded_at`DATETIME DEFAULT NULL,
    `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
    KEY `idx_leader`  (`leader_id`),
    KEY `idx_active`  (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- GUILD MEMBERS TABLE
-- Each character can belong to at most one active guild.
-- rank: 'LEADER' | 'OFFICER' | 'MEMBER'
CREATE TABLE IF NOT EXISTS `guild_members` (
    `id`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `guild_id`     INT UNSIGNED NOT NULL,
    `character_id` INT UNSIGNED NOT NULL,
    `rank`         VARCHAR(16)  NOT NULL DEFAULT 'MEMBER',
    `joined_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `left_at`      DATETIME DEFAULT NULL,
    `is_active`    TINYINT(1)   NOT NULL DEFAULT 1,

    UNIQUE KEY `uq_active_member` (`character_id`, `guild_id`),
    KEY `idx_guild` (`guild_id`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- GUILD INVITES TABLE
-- Pending invitations from guild officers/leaders.
CREATE TABLE IF NOT EXISTS `guild_invites` (
    `id`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `guild_id`     INT UNSIGNED NOT NULL,
    `inviter_id`   INT UNSIGNED NOT NULL,   -- character_id of inviter
    `invitee_id`   INT UNSIGNED NOT NULL,   -- character_id of invitee
    `status`       VARCHAR(16)  NOT NULL DEFAULT 'pending', -- pending | accepted | declined | expired
    `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `expires_at`   DATETIME NOT NULL DEFAULT (NOW() + INTERVAL 24 HOUR),
    KEY `idx_invitee` (`invitee_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- TRADE LOG TABLE (audit trail — real-time trades happen in memory)
-- Teaching: The trade itself happens in Node.js server memory
-- (fast, no latency). This table is an immutable audit trail
-- written AFTER a trade completes, for dispute resolution.
CREATE TABLE IF NOT EXISTS `character_trade_log` (
    `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `initiator_id`    INT UNSIGNED NOT NULL,   -- who started the trade
    `recipient_id`    INT UNSIGNED NOT NULL,   -- who accepted
    `initiator_items` JSON DEFAULT NULL,        -- items the initiator gave
    `recipient_items` JSON DEFAULT NULL,        -- items the recipient gave
    `initiator_gold`  INT UNSIGNED NOT NULL DEFAULT 0,
    `recipient_gold`  INT UNSIGNED NOT NULL DEFAULT 0,
    `status`          VARCHAR(16)  NOT NULL DEFAULT 'completed', -- completed | cancelled
    `completed_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_initiator` (`initiator_id`),
    KEY `idx_recipient` (`recipient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT 'Guild & Trade tables created successfully!' AS status;
