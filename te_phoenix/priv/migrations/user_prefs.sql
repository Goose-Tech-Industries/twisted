-- Per-user UI preferences (e.g. PowerUserField raw vs structured view,
-- saved filters, sidebar collapse state). Created lazily by
-- TePhoenix.UserPrefs.ensure_table/0 on first call.
--
-- Pure key/value: small, denormalized, scoped per-user.

CREATE TABLE IF NOT EXISTS user_prefs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  pref_key VARCHAR(160) NOT NULL,
  pref_value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_key (user_id, pref_key),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
