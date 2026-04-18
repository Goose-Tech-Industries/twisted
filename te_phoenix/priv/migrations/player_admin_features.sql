-- Player Admin Features Migration
-- Adds: timed bans/mutes, moderation history, system messages, freeze, comparison support

-- ── Timed bans & mutes ──────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_expires_at DATETIME NULL DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mute_expires_at DATETIME NULL DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_muted TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_frozen TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS freeze_reason VARCHAR(255) NULL DEFAULT NULL;

-- ── Moderation action history ───────────────────────────────────
CREATE TABLE IF NOT EXISTS moderation_actions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  action_type ENUM('ban','unban','mute','unmute','kick','freeze','unfreeze','warn','wipe','item_recall') NOT NULL,
  reason TEXT NULL,
  duration_minutes INT NULL,
  expires_at DATETIME NULL,
  performed_by_id BIGINT NOT NULL,
  performed_by_name VARCHAR(100) NOT NULL,
  lifted_at DATETIME NULL,
  lifted_by_name VARCHAR(100) NULL,
  detail_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mod_user (user_id),
  INDEX idx_mod_type (action_type),
  INDEX idx_mod_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── System messages (admin -> player inbox) ─────────────────────
CREATE TABLE IF NOT EXISTS system_messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  sender_name VARCHAR(100) NOT NULL DEFAULT 'System',
  sender_id BIGINT NULL,
  subject VARCHAR(255) NOT NULL DEFAULT 'System Message',
  body TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  message_type ENUM('system','admin','gift','warning','announcement') NOT NULL DEFAULT 'admin',
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME NULL,
  INDEX idx_sysmsg_user (user_id),
  INDEX idx_sysmsg_unread (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Gift packages ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gift_packages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  character_id BIGINT NOT NULL,
  sent_by_id BIGINT NOT NULL,
  sent_by_name VARCHAR(100) NOT NULL,
  gold_amount INT NOT NULL DEFAULT 0,
  xp_amount INT NOT NULL DEFAULT 0,
  items_json JSON NULL,
  message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gift_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
