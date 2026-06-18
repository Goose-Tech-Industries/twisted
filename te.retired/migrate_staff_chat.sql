-- =====================================================================
-- Staff Messenger — missing table + column
-- Run once: mysql -u root twisted < migrate_staff_chat.sql
-- =====================================================================

-- 1. Staff chat message persistence
CREATE TABLE IF NOT EXISTS staff_messages (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sender_id     INT UNSIGNED NOT NULL,
    sender_name   VARCHAR(64)  NOT NULL,
    sender_role   ENUM('ADMIN','GM','MOD','STAFF','OWNER') NOT NULL,
    channel       VARCHAR(32)  NOT NULL,
    body          VARCHAR(500) NOT NULL,
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_channel_created (channel, created_at),
    INDEX idx_sender_id (sender_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Custom name color for ADMIN/OWNER in staff chat
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_color VARCHAR(7) DEFAULT NULL;
