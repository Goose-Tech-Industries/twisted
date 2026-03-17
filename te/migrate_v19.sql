-- ================================================================
-- TWISTED ENGINE v19 MIGRATION
-- Party PvE · Turn Order Bar · AoE Skills
-- Run this on existing installs. Safe to re-run (all IF NOT EXISTS).
-- ================================================================

-- 1. game_battles: add battle_mode column (1v1 vs PARTY)
ALTER TABLE game_battles
    ADD COLUMN IF NOT EXISTS battle_mode ENUM('1v1','PARTY') NOT NULL DEFAULT '1v1' AFTER status;

-- 2. New table: tracks every participant in a battle (supports N vs M)
CREATE TABLE IF NOT EXISTS game_battle_participants (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    battle_id    INT UNSIGNED NOT NULL,
    character_id INT UNSIGNED NOT NULL,
    team         TINYINT NOT NULL COMMENT '1=players, 2=enemies',
    is_ai        TINYINT(1) NOT NULL DEFAULT 0,
    joined_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_battle_char (battle_id, character_id),
    INDEX idx_bp_battle  (battle_id),
    INDEX idx_bp_char    (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Add ALL_ENEMIES target_type to schema docs (comment only — no enum change needed,
--    target_type is VARCHAR(32) already so 'ALL_ENEMIES' just works)

-- 4. Seed: example AoE skill — Whirlwind Strike
-- Hits all enemies for physical damage. No aoe_split so each takes full damage.
INSERT IGNORE INTO game_skills
    (id, name, icon, description, battle_text, type, target_type, mp_cost, effects)
VALUES
    (901, 'Whirlwind Strike', '🌀', 'A spinning attack that strikes all enemies.',
     '{name} unleashes a whirlwind!', 'physical', 'ALL_ENEMIES', 8,
     '{"damage":{"formula":"ATK*1.2-MD","type":"physical","randomize":0.1}}'),
    (902, 'Blizzara', '❄️', 'A wide ice spell hitting all enemies for split magic damage.',
     '{name} calls down a blizzard!', 'magic', 'ALL_ENEMIES', 14,
     '{"damage":{"formula":"MO*2.5-MD","type":"magic","randomize":0.05},"aoe_split":true,"set_status":{"id":4,"chance":25}}');

-- ── v19.1 additions (tactical grid / 3v3 / dungeon size) ──────────

-- PvP team rosters (one row per user, JSON array of charIds)
CREATE TABLE IF NOT EXISTS character_pvp_teams (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL UNIQUE,
    team_chars  JSON NOT NULL DEFAULT ('[]'),
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pvp_team_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- New settings (safe to re-run via INSERT IGNORE)
INSERT IGNORE INTO game_settings (`key`, value, description) VALUES
  ('pvp_team_size',      '3', 'Max characters per user in 3v3 PvP (1–6)'),
  ('max_dungeon_size',   '5', 'Max players allowed in a dungeon party (1–6)');

-- Seed: example ranged skill (range:5) so designers can see the pattern
INSERT IGNORE INTO game_skills
    (id, name, icon, description, battle_text, type, target_type, mp_cost, effects)
VALUES
    (903, 'Arrow Shot', '🏹', 'A ranged attack. Can strike from 5 tiles away.',
     '{name} fires an arrow!', 'physical', 'ENEMY', 0,
     '{"damage":{"formula":"ATK*1.8-DEF","type":"physical","randomize":0.2},"range":5}'),
    (904, 'Fireball', '🔥', 'Lobs a fireball. 3-tile range, 2-tile blast radius.',
     '{name} hurls a fireball!', 'magic', 'ENEMY', 12,
     '{"damage":{"formula":"MO*2.8-MD","type":"magic","randomize":0.1},"range":3,"aoe_radius":2}');

-- ================================================================
-- v19.2 MIGRATION — Terrain + PvP roster + new conditions
-- ================================================================

-- Seeded statuses for terrain-related conditions
-- (Only inserts if they don't already exist by name)
INSERT IGNORE INTO game_statuses (id, name, icon, description, effects, permanent, is_debuff)
VALUES
  (20, 'Rooted',  '⚓', 'Cannot move on the tactical grid. Can still act.',
   '{"stat_mod":{},"skip_turn":false,"log":"{name} is Rooted!"}', 0, 1),
  (21, 'Prone',   '⬇️', 'Knocked flat. Melee hits you harder; ranged miss more.',
   '{"stat_mod":{},"log":"{name} is Prone!"}', 0, 1),
  (22, 'Burning', '🔥', 'On fire. Spreads fire terrain on your tile each turn. Water extinguishes.',
   '{"damage_per_turn":{"formula":"10"},"log":"{name} burns!"}', 0, 1);

-- ================================================================
-- CRAFTING SYSTEM (v19.3+)
-- ================================================================
CREATE TABLE IF NOT EXISTS game_craft_recipes (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    category        VARCHAR(32)  NOT NULL DEFAULT 'MISC',
    result_item_id  INT UNSIGNED NOT NULL,
    result_qty      INT NOT NULL DEFAULT 1,
    level_req       INT NOT NULL DEFAULT 1,
    skill_req       VARCHAR(64)  DEFAULT NULL,
    ingredients_json JSON        NOT NULL,
    unlock_mode     ENUM('ALWAYS','LEARNED') NOT NULL DEFAULT 'ALWAYS',
    description     TEXT,
    icon            VARCHAR(8)   DEFAULT '🔨',
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    INDEX idx_recipe_category (category),
    INDEX idx_recipe_result   (result_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_learned_recipes (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    recipe_id       INT UNSIGNED NOT NULL,
    learned_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_char_recipe (character_id, recipe_id),
    INDEX idx_learned_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ================================================================
-- v19.4 ADDITIONS: World Flags, Scheduler, Auction House
-- ================================================================
ALTER TABLE game_map_spawns
  ADD COLUMN IF NOT EXISTS world_flag_conditions JSON DEFAULT NULL;

ALTER TABLE game_shop_supplies
  ADD COLUMN IF NOT EXISTS world_flag_conditions JSON DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS flag_price_modifiers  JSON DEFAULT NULL;

CREATE TABLE IF NOT EXISTS game_scheduled_tasks (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    task_type       ENUM('SHOP_RESTOCK','SPAWN_RESPAWN','DUNGEON_RESET','SET_WORLD_FLAG','GIVE_XP_ALL','BROADCAST') NOT NULL,
    schedule_type   ENUM('HOURLY','DAILY','WEEKLY','INTERVAL_MINUTES') NOT NULL DEFAULT 'DAILY',
    run_at_hour     TINYINT UNSIGNED DEFAULT 0,
    run_at_day      TINYINT UNSIGNED DEFAULT 1,
    interval_minutes INT UNSIGNED DEFAULT 60,
    target_id       INT UNSIGNED DEFAULT NULL,
    config_json     JSON DEFAULT NULL,
    last_run_at     DATETIME DEFAULT NULL,
    is_enabled      TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_scheduled_tasks (id, name, task_type, schedule_type, run_at_hour, is_enabled) VALUES
(1, 'Daily Shop Restock', 'SHOP_RESTOCK', 'DAILY', 6, 1),
(2, 'Midnight Dungeon Reset', 'DUNGEON_RESET', 'DAILY', 0, 1);

CREATE TABLE IF NOT EXISTS auction_listings (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    seller_char_id  INT UNSIGNED NOT NULL,
    seller_name     VARCHAR(64)  NOT NULL,
    item_id         INT UNSIGNED NOT NULL,
    quantity        INT NOT NULL DEFAULT 1,
    buyout_price    INT NOT NULL,
    current_bid     INT NOT NULL DEFAULT 0,
    min_bid         INT NOT NULL DEFAULT 0,
    bidder_char_id  INT UNSIGNED DEFAULT NULL,
    bidder_name     VARCHAR(64)  DEFAULT NULL,
    expires_at      DATETIME NOT NULL,
    status          ENUM('ACTIVE','SOLD_BUYOUT','SOLD_BID','EXPIRED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_auction_status  (status),
    INDEX idx_auction_item    (item_id),
    INDEX idx_auction_seller  (seller_char_id),
    INDEX idx_auction_expires (expires_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES
('auction_listing_fee_pct',  '5',    'Percentage of buyout price charged to list an item'),
('auction_sale_tax_pct',     '5',    'Percentage taken from sale price when item sells'),
('auction_max_listings',     '10',   'Max active listings per character'),
('auction_duration_hours',   '48',   'Default listing duration in hours'),
('auction_enabled',          'true', 'Enable the auction house');

-- ================================================================
-- v19.5 → v20: Regions, Patrol, Conditional Loot, Quest Board
-- ================================================================
CREATE TABLE IF NOT EXISTS game_regions (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(128) NOT NULL,
    description         TEXT,
    icon                VARCHAR(8)   DEFAULT '🗺️',
    danger_level        TINYINT UNSIGNED NOT NULL DEFAULT 1,
    corruption_level    TINYINT UNSIGNED NOT NULL DEFAULT 0,
    faction_control     VARCHAR(64)  DEFAULT NULL,
    weather_override    VARCHAR(32)  DEFAULT NULL,
    xp_mult             DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    gold_mult           DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    loot_mult           DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    spawn_rate_mult     DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    shop_price_mult     DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    pvp_enabled         TINYINT(1)   NOT NULL DEFAULT 0,
    is_sanctuary        TINYINT(1)   NOT NULL DEFAULT 0,
    movement_penalty    TINYINT(1)   NOT NULL DEFAULT 0,
    active_tags_json    JSON DEFAULT NULL,
    auto_rules_json     JSON DEFAULT NULL,
    is_active           TINYINT(1)   NOT NULL DEFAULT 1,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS region_id INT UNSIGNED DEFAULT NULL;
ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS patrol_path_json JSON DEFAULT NULL;
ALTER TABLE quest_definitions ADD COLUMN IF NOT EXISTS condition_json JSON DEFAULT NULL;
ALTER TABLE quest_definitions ADD COLUMN IF NOT EXISTS region_id INT UNSIGNED DEFAULT NULL;
ALTER TABLE game_quests ADD COLUMN IF NOT EXISTS condition_json JSON DEFAULT NULL;
ALTER TABLE game_quests ADD COLUMN IF NOT EXISTS region_id INT UNSIGNED DEFAULT NULL;

CREATE TABLE IF NOT EXISTS game_quest_board (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(120) NOT NULL,
    description     TEXT,
    quest_type      ENUM('BOARD','EVENT','FACTION','REGIONAL') NOT NULL DEFAULT 'BOARD',
    region_id       INT UNSIGNED DEFAULT NULL,
    faction         VARCHAR(64)  DEFAULT NULL,
    requires_flags_json  JSON DEFAULT NULL,
    requires_region_json JSON DEFAULT NULL,
    objectives_json JSON NOT NULL,
    rewards_json    JSON NOT NULL,
    expires_at      DATETIME DEFAULT NULL,
    max_completions INT UNSIGNED DEFAULT NULL,
    times_completed INT UNSIGNED NOT NULL DEFAULT 0,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_board_region (region_id),
    INDEX idx_board_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_regions (id, name, description, icon, is_active) VALUES
(1, 'Starter Lands', 'Peaceful starting area. Safe, low rewards.', '🌿', 1),
(2, 'Ashwood Frontier', 'Dangerous frontier. High risk, high reward.', '🌑', 1);

-- v20.5: AI Brain settings (configurable from AdminSauce)
INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES
('ai_provider',      'disabled',   'NPC AI provider: disabled | gemini | anthropic | openai | ollama'),
('ai_api_key',       '',           'API key for Gemini, Anthropic, or OpenAI'),
('ai_model',         '',           'Model override. Leave blank for provider default.'),
('ai_base_url',      '',           'Base URL for Ollama or OpenAI-compatible endpoints'),
('ai_temperature',   '0.85',       'AI creativity 0.0-1.0'),
('ai_max_tokens',    '256',        'Max tokens per NPC reply'),
('ai_system_prompt', '',           'World context prompt. Blank = Celtic dark fantasy default.');

-- =================================================================
-- v20.7: Security & Reliability Hardening
-- Run this if upgrading from ANY previous version.
-- Safe to run multiple times (uses IF NOT EXISTS / IGNORE patterns).
-- =================================================================

-- 1. Email verification columns on users table
--    Default email_verified=1 so existing accounts are not locked out.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_verified       TINYINT(1)   NOT NULL DEFAULT 1
        COMMENT '1=verified. Default 1 so existing accounts keep working.',
    ADD COLUMN IF NOT EXISTS email_verify_token   VARCHAR(128) NULL,
    ADD COLUMN IF NOT EXISTS email_verify_expires DATETIME     NULL;

-- Index for fast token lookups during verification
CREATE INDEX IF NOT EXISTS idx_users_verify_token ON users (email_verify_token);

-- 2. Battle access token — prevents sequential ID probing
--    Existing battles get NULL (harmless — socket auth still works for active battles).
ALTER TABLE game_battles
    ADD COLUMN IF NOT EXISTS access_token VARCHAR(64) NULL
        COMMENT 'Random hex token assigned at creation. Prevents ID enumeration.';

CREATE INDEX IF NOT EXISTS idx_battles_token ON game_battles (access_token);

-- =================================================================
-- End of v20.7 migration
-- =================================================================

-- =================================================================
-- v20.9: Social Features — Friends UI, Player Mail, Emotes, Block
-- =================================================================

-- Player mail table
CREATE TABLE IF NOT EXISTS character_mail (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sender_char_id      INT UNSIGNED NOT NULL,
    sender_name         VARCHAR(64)  NOT NULL,
    recipient_char_id   INT UNSIGNED NOT NULL,
    subject             VARCHAR(120) NOT NULL DEFAULT 'No subject',
    body                TEXT         NOT NULL,
    gold_attachment     INT UNSIGNED NOT NULL DEFAULT 0,
    gold_collected      TINYINT(1)   NOT NULL DEFAULT 0,
    is_read             TINYINT(1)   NOT NULL DEFAULT 0,
    is_deleted          TINYINT(1)   NOT NULL DEFAULT 0,
    sent_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at          TIMESTAMP    NULL,
    INDEX idx_mail_recipient (recipient_char_id, is_deleted, is_read),
    INDEX idx_mail_sender    (sender_char_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- End of v20.9 migration

-- =================================================================
-- v21.0: Gold HUD + Daily Login Reward + Leaderboards + Player Inspect
-- =================================================================

-- Daily login streak columns (safe to re-run — IF NOT EXISTS)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS login_streak   INT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_login_date DATE NULL COMMENT 'DATE only for streak comparison';

-- End of v21.0 migration

-- =================================================================
-- v21.1: Achievements, Titles, Referrals (from previous session)
-- =================================================================
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS login_streak    INT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_login_date DATE NULL,
    ADD COLUMN IF NOT EXISTS invite_code     VARCHAR(16)  NULL UNIQUE,
    ADD COLUMN IF NOT EXISTS referred_by     INT UNSIGNED NULL,
    ADD COLUMN IF NOT EXISTS referral_paid   TINYINT(1)   NOT NULL DEFAULT 0;

ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS equipped_title VARCHAR(64) NULL;

CREATE TABLE IF NOT EXISTS game_achievements (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    key_name VARCHAR(64) NOT NULL UNIQUE, title VARCHAR(64) NOT NULL,
    description TEXT, icon VARCHAR(16) NOT NULL DEFAULT '🏆',
    category ENUM('combat','social','exploration','progression','other') NOT NULL DEFAULT 'other',
    trigger_type ENUM('pvp_wins','pve_wins','quests_done','maps_visited','level_reached',
                      'manual','login_streak','gold_owned','battles_total') NOT NULL DEFAULT 'manual',
    trigger_value INT UNSIGNED NOT NULL DEFAULT 1,
    reward_gold INT UNSIGNED NOT NULL DEFAULT 0, reward_title VARCHAR(64) NULL,
    is_hidden TINYINT(1) NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_achievements (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id INT UNSIGNED NOT NULL, achievement_id INT UNSIGNED NOT NULL,
    earned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_char_achiev (character_id, achievement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- v21.2: Presence/Away, Profile Customization, Guild Bank
-- =================================================================
ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS profile_bio           TEXT NULL,
    ADD COLUMN IF NOT EXISTS profile_color         VARCHAR(7) NOT NULL DEFAULT '#bb86fc',
    ADD COLUMN IF NOT EXISTS profile_banner_emoji  VARCHAR(8) NOT NULL DEFAULT '⚔️',
    ADD COLUMN IF NOT EXISTS profile_favorite_quote TEXT NULL,
    ADD COLUMN IF NOT EXISTS spotify_track_url     VARCHAR(512) NULL,
    ADD COLUMN IF NOT EXISTS spotify_track_name    VARCHAR(256) NULL,
    ADD COLUMN IF NOT EXISTS spotify_artist_name   VARCHAR(256) NULL,
    ADD COLUMN IF NOT EXISTS presence_status       ENUM('online','away','busy','lfp','invisible') NOT NULL DEFAULT 'online',
    ADD COLUMN IF NOT EXISTS away_message          TEXT NULL;

CREATE TABLE IF NOT EXISTS guild_bank_items (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guild_id INT UNSIGNED NOT NULL, item_id INT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL DEFAULT 1,
    deposited_by INT UNSIGNED NOT NULL,
    deposited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note VARCHAR(256) NULL,
    INDEX idx_gbi_guild (guild_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS guild_bank_log (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guild_id INT UNSIGNED NOT NULL, character_id INT UNSIGNED NOT NULL,
    character_name VARCHAR(64) NOT NULL,
    action ENUM('deposit_gold','withdraw_gold','deposit_item','withdraw_item') NOT NULL,
    amount INT NULL, item_id INT UNSIGNED NULL, item_qty INT UNSIGNED NULL,
    item_name VARCHAR(128) NULL, note VARCHAR(256) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_gbl_guild (guild_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS guild_bank_perms (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guild_id INT UNSIGNED NOT NULL,
    rank ENUM('LEADER','OFFICER','MEMBER') NOT NULL DEFAULT 'MEMBER',
    can_deposit_gold TINYINT(1) NOT NULL DEFAULT 1,
    can_withdraw_gold TINYINT(1) NOT NULL DEFAULT 0,
    can_deposit_item TINYINT(1) NOT NULL DEFAULT 1,
    can_withdraw_item TINYINT(1) NOT NULL DEFAULT 0,
    gold_withdraw_limit INT UNSIGNED NOT NULL DEFAULT 0,
    UNIQUE KEY uniq_gp_guild_rank (guild_id, rank)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- End of v21.2 migration

-- =================================================================
-- v21.3: Signatures, View Counter, Last Seen, Top Friends
-- =================================================================
ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS profile_signature  TEXT           NULL,
    ADD COLUMN IF NOT EXISTS profile_views      INT UNSIGNED   NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_seen_at       TIMESTAMP      NULL;

CREATE TABLE IF NOT EXISTS character_top_friends (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    friend_char_id  INT UNSIGNED NOT NULL,
    slot            TINYINT UNSIGNED NOT NULL,
    UNIQUE KEY uniq_tf_slot   (character_id, slot),
    UNIQUE KEY uniq_tf_friend (character_id, friend_char_id),
    INDEX idx_tf_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- End of v21.3 migration

-- =================================================================
-- v21.4: LFP Board, Profile Guestbook, Guild News Feed
-- =================================================================
CREATE TABLE IF NOT EXISTS profile_guestbook (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    profile_char_id INT UNSIGNED NOT NULL,
    author_char_id  INT UNSIGNED NOT NULL,
    author_name     VARCHAR(64)  NOT NULL,
    author_title    VARCHAR(64)  NULL,
    author_color    VARCHAR(7)   NULL,
    message         TEXT         NOT NULL,
    message_html    TEXT         NOT NULL,
    is_deleted      TINYINT(1)   NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_gb_profile (profile_char_id),
    INDEX idx_gb_author  (author_char_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS guild_news (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guild_id        INT UNSIGNED NOT NULL,
    author_char_id  INT UNSIGNED NULL,
    author_name     VARCHAR(64)  NOT NULL DEFAULT 'System',
    title           VARCHAR(128) NOT NULL,
    body            TEXT         NOT NULL,
    body_html       TEXT         NOT NULL,
    category        ENUM('announcement','event','bank','achievement','system') NOT NULL DEFAULT 'announcement',
    is_pinned       TINYINT(1)   NOT NULL DEFAULT 0,
    is_deleted      TINYINT(1)   NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_gn_guild (guild_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lfp_listings (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL UNIQUE,
    character_name  VARCHAR(64)  NOT NULL,
    level           INT UNSIGNED NOT NULL,
    class_name      VARCHAR(64)  NOT NULL,
    role            ENUM('DPS','Tank','Healer','Support','Any') NOT NULL DEFAULT 'Any',
    note            VARCHAR(255) NULL,
    content_type    VARCHAR(64)  NULL,
    expires_at      TIMESTAMP    NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 4 HOUR),
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_lfp_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- End of v21.4 migration

-- =================================================================
-- v21.5: Mutual friends, reports, profile viewers, friend count,
--        invite links
-- =================================================================

-- Player reports
-- TEACHING: When someone hits "Report" on a profile or inspect card,
-- we write a row here. Moderators review via the mod panel.
-- We store snapshot data (name, reason) so the report is readable
-- even after the reported character is deleted.
CREATE TABLE IF NOT EXISTS player_reports (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    reporter_char_id    INT UNSIGNED NOT NULL,
    reporter_name       VARCHAR(64)  NOT NULL,
    reported_char_id    INT UNSIGNED NOT NULL,
    reported_name       VARCHAR(64)  NOT NULL,
    reason              ENUM('harassment','cheating','spam','offensive_name','bug_abuse','other') NOT NULL,
    details             VARCHAR(500) NULL,
    status              ENUM('open','reviewed','dismissed','actioned') NOT NULL DEFAULT 'open',
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at         TIMESTAMP    NULL,
    reviewed_by         INT UNSIGNED NULL COMMENT 'mod/admin user id',
    INDEX idx_reports_reported (reported_char_id),
    INDEX idx_reports_status   (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Profile viewers (opt-in "who viewed my profile")
-- TEACHING: ON DUPLICATE KEY UPDATE means if the same person views
-- twice, we just update the timestamp instead of adding a new row.
-- This keeps the table small and deduplicated per viewer.
-- Auto-purge rows older than 30 days (scheduled cleanup job).
CREATE TABLE IF NOT EXISTS profile_viewers (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    profile_char_id  INT UNSIGNED NOT NULL,
    viewer_char_id   INT UNSIGNED NOT NULL,
    viewer_name      VARCHAR(64)  NOT NULL,
    viewer_color     VARCHAR(7)   NULL,
    viewer_title     VARCHAR(64)  NULL,
    viewed_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_view (profile_char_id, viewer_char_id),
    INDEX idx_pv_profile (profile_char_id),
    INDEX idx_pv_viewed  (viewed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Opt-in toggle for profile viewer list
ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS show_profile_viewers TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = show who viewed my profile (opt-in)';

-- End of v21.5 migration

-- =================================================================
-- v21.5: player_reports, profile_viewers, show_profile_viewers
-- (already in migrate above — schema additions)

-- =================================================================
-- v21.6: Trading Card page + Spotify OAuth token storage
-- =================================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS spotify_access_token  TEXT         NULL,
    ADD COLUMN IF NOT EXISTS spotify_refresh_token TEXT         NULL,
    ADD COLUMN IF NOT EXISTS spotify_expires_at    BIGINT       NULL COMMENT 'Unix ms timestamp';

-- End of v21.6 migration

-- =================================================================
-- v21.8: Referral reward system settings
-- =================================================================
INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES
    ('referral_threshold_level', '5',   'Level a referred player must reach to trigger the referral reward'),
    ('referral_gold_reward',     '500', 'Gold awarded to the referrer when threshold is reached'),
    ('referral_xp_reward',       '0',   'Bonus XP awarded to the referrer (0 = disabled)');

-- End of v21.8 migration
