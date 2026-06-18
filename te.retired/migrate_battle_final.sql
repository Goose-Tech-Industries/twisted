-- =================================================================
-- Final Battle Systems: Skill Learning, Environment, Mount Combat,
-- Raid Bosses, Async PvP, Job System
-- =================================================================

-- ─── 1. Skill Learning (Blue Mage) ─────────────────────────────
CREATE TABLE IF NOT EXISTS character_learned_enemy_skills (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    skill_id        INT UNSIGNED NOT NULL,
    learned_from    VARCHAR(64) DEFAULT NULL,
    learned_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_char_skill (character_id, skill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE game_skills ADD COLUMN IF NOT EXISTS learnable_by_enemy TINYINT(1) DEFAULT 0;
ALTER TABLE game_skills ADD COLUMN IF NOT EXISTS learn_chance INT DEFAULT 25;
ALTER TABLE game_skills ADD COLUMN IF NOT EXISTS learn_method ENUM('on_hit','devour','sketch','auto') DEFAULT 'on_hit';

-- ─── 2. Environmental Interaction Rules ─────────────────────────
CREATE TABLE IF NOT EXISTS game_terrain_interactions (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    terrain_a       VARCHAR(32) NOT NULL,
    element_or_terrain_b VARCHAR(32) NOT NULL,
    result_terrain  VARCHAR(32) NOT NULL,
    description     VARCHAR(256) DEFAULT NULL,
    damage          INT DEFAULT 0,
    status_apply    VARCHAR(32) DEFAULT NULL,
    is_active       TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_terrain_interactions (terrain_a, element_or_terrain_b, result_terrain, description, damage) VALUES
('open',    'fire',      'fire',       'Grass catches fire from fire attacks.', 5),
('forest',  'fire',      'fire',       'Forest burns when hit by fire.', 8),
('water',   'lightning', 'electrified','Water becomes electrified by lightning.', 12),
('water',   'ice',       'ice',        'Water freezes into ice.', 0),
('ice',     'fire',      'water',      'Ice melts into water.', 0),
('fire',    'water',     'open',       'Water extinguishes fire.', 0),
('open',    'earth',     'mud',        'Earth magic turns ground to mud.', 0);

-- ─── 3. Mount Combat ────────────────────────────────────────────
ALTER TABLE game_mounts ADD COLUMN IF NOT EXISTS battle_hp INT DEFAULT 100;
ALTER TABLE game_mounts ADD COLUMN IF NOT EXISTS battle_atk_bonus INT DEFAULT 5;
ALTER TABLE game_mounts ADD COLUMN IF NOT EXISTS battle_def_bonus INT DEFAULT 3;
ALTER TABLE game_mounts ADD COLUMN IF NOT EXISTS battle_speed_bonus INT DEFAULT 10;
ALTER TABLE game_mounts ADD COLUMN IF NOT EXISTS battle_move_bonus INT DEFAULT 2;
ALTER TABLE game_mounts ADD COLUMN IF NOT EXISTS mounted_skills_json JSON DEFAULT NULL;

-- ─── 4. Raid Boss System ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_raid_bosses (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    npc_id          INT UNSIGNED NOT NULL,
    description     TEXT,
    icon            VARCHAR(20) DEFAULT NULL,
    max_parties     INT DEFAULT 4,
    min_level       INT DEFAULT 10,
    hp_multiplier   DECIMAL(5,2) DEFAULT 5.00,
    reward_xp       INT DEFAULT 1000,
    reward_gold     INT DEFAULT 500,
    reward_items    JSON DEFAULT NULL,
    cooldown_hours  INT DEFAULT 24,
    grid_width      INT DEFAULT 16,
    grid_height     INT DEFAULT 12,
    is_active       TINYINT(1) DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_raid_instances (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    raid_id         INT UNSIGNED NOT NULL,
    battle_id       VARCHAR(64) DEFAULT NULL,
    status          ENUM('forming','active','completed','failed') DEFAULT 'forming',
    parties_json    JSON DEFAULT NULL,
    boss_hp         INT DEFAULT 0,
    boss_max_hp     INT DEFAULT 0,
    started_at      TIMESTAMP DEFAULT NULL,
    completed_at    TIMESTAMP DEFAULT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_raid (raid_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 5. Async PvP (Ghost Battles) ──────────────────────────────
CREATE TABLE IF NOT EXISTS character_pvp_defense_teams (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    team_json       JSON NOT NULL,
    formation       VARCHAR(32) DEFAULT 'line',
    tactics         VARCHAR(32) DEFAULT 'balanced',
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY idx_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_pvp_async_log (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    attacker_id     INT UNSIGNED NOT NULL,
    defender_id     INT UNSIGNED NOT NULL,
    result          ENUM('win','loss','draw') NOT NULL,
    rating_change   INT DEFAULT 0,
    replay_json     JSON DEFAULT NULL,
    fought_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_attacker (attacker_id),
    INDEX idx_defender (defender_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 6. Job System ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_jobs (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64) NOT NULL,
    icon            VARCHAR(20) DEFAULT NULL,
    description     TEXT,
    stat_bonuses_json JSON DEFAULT NULL,
    skills_json     JSON DEFAULT NULL,
    prerequisite_jobs JSON DEFAULT NULL,
    max_level       INT DEFAULT 20,
    jp_per_action   INT DEFAULT 10,
    is_active       TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_jobs (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    job_id          INT UNSIGNED NOT NULL,
    job_level       INT DEFAULT 1,
    jp              INT DEFAULT 0,
    is_primary      TINYINT(1) DEFAULT 0,
    is_secondary    TINYINT(1) DEFAULT 0,
    unlocked_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_char_job (character_id, job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_jobs (name, icon, description, stat_bonuses_json, skills_json) VALUES
('Squire',   '⚔️', 'Basic combat training. Foundation for all other jobs.', '{"atk":2,"def":1}', '[]'),
('Knight',   '🛡️', 'Heavy armor specialist. Defensive powerhouse.', '{"def":5,"hp":20,"speed":-2}', '[]'),
('Mage',     '🔮', 'Arcane scholar. Master of offensive magic.', '{"mo":5,"mp":15,"def":-2}', '[]'),
('Priest',   '✨', 'Divine healer. Restores and protects allies.', '{"md":4,"mp":10,"mo":2}', '[]'),
('Thief',    '🗡️', 'Fast and agile. Steals items and strikes from shadows.', '{"speed":5,"luck":3,"atk":2}', '[]'),
('Archer',   '🏹', 'Ranged specialist. High accuracy from distance.', '{"atk":3,"speed":3,"luck":2}', '[]'),
('Monk',     '👊', 'Martial artist. High HP and unarmed damage.', '{"atk":4,"hp":15,"speed":2}', '[]'),
('Summoner', '🐉', 'Calls powerful creatures to aid in battle.', '{"mo":4,"mp":20}', '[]');
