-- =================================================================
-- User Preferences — Persistent client settings (render mode, etc.)
-- Stored as JSON on the users table so all prefs travel with the account.
-- Safe to re-run (IF NOT EXISTS).
-- =================================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS preferences_json JSON DEFAULT NULL AFTER last_login;

-- preferences_json format:
-- {
--   "render_mode": "classic",    // "classic" | "2.5d"
--   "show_minimap": true,
--   "music_volume": 0.5,
--   "sfx_volume": 0.7,
--   "ui_scale": 1.0
-- }
