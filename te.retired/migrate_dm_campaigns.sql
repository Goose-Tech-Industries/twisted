-- =============================================================
-- MIGRATION: DM Campaign System + Battle Referees
-- =============================================================
-- Supports the full DM campaign flow:
--   1. Create/manage campaigns
--   2. Invite players, track membership
--   3. Tabletop-style character sheets per campaign
--   4. Session logging with history
--   5. Battle referee permissions
-- =============================================================

-- Campaign metadata
CREATE TABLE IF NOT EXISTS game_dm_campaigns (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    dm_user_id      INT UNSIGNED NOT NULL,
    max_players     INT UNSIGNED NOT NULL DEFAULT 7,
    is_oneshot      TINYINT(1) NOT NULL DEFAULT 0,
    world_tone      VARCHAR(64) DEFAULT 'dark fantasy',
    map_id          INT UNSIGNED DEFAULT NULL,
    status          ENUM('recruiting','active','completed','archived') DEFAULT 'recruiting',
    session_count   INT UNSIGNED NOT NULL DEFAULT 0,
    -- Planet Mado specific: movement rules per campaign
    moves_per_day   INT UNSIGNED NOT NULL DEFAULT 3,
    tiles_per_move  INT UNSIGNED NOT NULL DEFAULT 3,
    flying_tiles    INT UNSIGNED NOT NULL DEFAULT 3,  -- tiles per move when flying
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_dm_campaigns_status (status),
    INDEX idx_dm_campaigns_dm (dm_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Campaign player membership & invites
CREATE TABLE IF NOT EXISTS game_dm_campaign_players (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    campaign_id     INT UNSIGNED NOT NULL,
    user_id         INT UNSIGNED NOT NULL,
    character_id    INT UNSIGNED DEFAULT NULL,
    status          ENUM('invited','accepted','declined','left') DEFAULT 'invited',
    starting_x      INT DEFAULT NULL,
    starting_y      INT DEFAULT NULL,
    joined_at       DATETIME DEFAULT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_campaign_user (campaign_id, user_id),
    INDEX idx_campaign_players_status (campaign_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabletop character sheets (DnD-style, separate from game character)
CREATE TABLE IF NOT EXISTS game_dm_character_sheets (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    campaign_id     INT UNSIGNED NOT NULL,
    user_id         INT UNSIGNED NOT NULL,
    name            VARCHAR(255) DEFAULT NULL,
    race            VARCHAR(64) DEFAULT NULL,
    class_name      VARCHAR(64) DEFAULT NULL,
    level           INT UNSIGNED NOT NULL DEFAULT 1,
    -- Ability scores (DnD style for tabletop campaigns)
    str             INT DEFAULT 10,
    dex             INT DEFAULT 10,
    con             INT DEFAULT 10,
    int_score       INT DEFAULT 10,
    wis             INT DEFAULT 10,
    cha             INT DEFAULT 10,
    -- Combat
    max_hp          INT DEFAULT 10,
    current_hp      INT DEFAULT 10,
    armor_class     INT DEFAULT 10,
    -- RP
    background      TEXT,
    alignment       VARCHAR(64) DEFAULT NULL,
    personality     TEXT,
    backstory       TEXT,
    -- JSON blobs for flexible data
    equipment_json  JSON DEFAULT NULL,
    skills_json     JSON DEFAULT NULL,
    spells_json     JSON DEFAULT NULL,
    notes           TEXT,
    portrait_url    VARCHAR(500) DEFAULT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sheet_campaign_user (campaign_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Session history/logs
CREATE TABLE IF NOT EXISTS game_dm_session_log (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    campaign_id     INT UNSIGNED NOT NULL,
    session_number  INT UNSIGNED DEFAULT NULL,
    title           VARCHAR(255) DEFAULT NULL,
    summary         TEXT,
    log_json        JSON DEFAULT NULL,  -- full chat history
    started_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at        DATETIME DEFAULT NULL,
    INDEX idx_session_log_campaign (campaign_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Battle referee permissions
CREATE TABLE IF NOT EXISTS game_battle_referees (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    battle_id       INT UNSIGNED NOT NULL,
    user_id         INT UNSIGNED NOT NULL,
    can_pause       TINYINT(1) NOT NULL DEFAULT 1,
    can_end         TINYINT(1) NOT NULL DEFAULT 1,
    joined_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_battle_referee (battle_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
