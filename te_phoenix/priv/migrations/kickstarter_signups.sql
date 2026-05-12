-- Migration: kickstarter_signups
-- Captures mailing-list signups from the public /kickstarter landing page.
-- Unique email; source + referrer track where the visitor came from.

CREATE TABLE IF NOT EXISTS kickstarter_signups (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(254) NOT NULL,
  signed_up_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source        VARCHAR(64)  DEFAULT NULL,
  referrer      VARCHAR(512) DEFAULT NULL,
  UNIQUE KEY uniq_email (email),
  KEY idx_signed_up_at (signed_up_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
