-- Migration: Create character_status_effects and game_scheduled_task_signups tables
-- These tables are referenced in Phoenix code but were missing from the schema.
-- Uses INT UNSIGNED to match existing characters/game_statuses/game_scheduled_tasks PKs.

CREATE TABLE IF NOT EXISTS character_status_effects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  character_id INT UNSIGNED NOT NULL,
  status_id INT UNSIGNED NOT NULL,
  source VARCHAR(100) DEFAULT NULL,
  expires_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cse_character (character_id),
  INDEX idx_cse_expires (expires_at),
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (status_id) REFERENCES game_statuses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_scheduled_task_signups (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  character_id INT UNSIGNED NOT NULL,
  signed_up_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_char (event_id, character_id),
  INDEX idx_stsu_event (event_id),
  INDEX idx_stsu_char (character_id),
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES game_scheduled_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
