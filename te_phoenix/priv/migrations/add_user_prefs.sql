-- Tier α P1: per-user preference store. PowerUserField persists its
-- structured/raw toggle here so a user's choice on each form field
-- survives page reloads. Schema is intentionally generic — any
-- key/value preference pair can land in this table.

CREATE TABLE IF NOT EXISTS user_prefs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  pref_key VARCHAR(255) NOT NULL,
  pref_value VARCHAR(2048) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_pref (user_id, pref_key),
  KEY idx_user (user_id)
);
