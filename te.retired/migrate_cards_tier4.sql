-- =================================================================
-- Job Skills, Card Game, Tier 4 Battle Systems
-- =================================================================

-- ─── 1. Job Skill Unlocks ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_job_skills (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    job_id          INT UNSIGNED NOT NULL,
    skill_id        INT UNSIGNED NOT NULL,
    unlock_level    INT DEFAULT 1,
    is_passive      TINYINT(1) DEFAULT 0,
    INDEX idx_job (job_id),
    UNIQUE KEY idx_job_skill (job_id, skill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 2. Card Game System ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_cards (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64) NOT NULL,
    icon            VARCHAR(20) DEFAULT NULL,
    description     TEXT,
    rarity          ENUM('common','uncommon','rare','epic','legendary') DEFAULT 'common',
    -- Triple Triad style: 4 directional values (1-10, A=10)
    value_top       INT DEFAULT 1,
    value_right     INT DEFAULT 1,
    value_bottom    INT DEFAULT 1,
    value_left      INT DEFAULT 1,
    -- Optional: element for elemental rules
    element         VARCHAR(32) DEFAULT NULL,
    -- Source entity (auto-generate cards from NPCs/enemies)
    source_npc_id   INT UNSIGNED DEFAULT NULL,
    source_type     ENUM('npc','enemy','boss','player','special') DEFAULT 'enemy',
    -- Art
    art_url         VARCHAR(512) DEFAULT NULL,
    is_active       TINYINT(1) DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_cards (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    card_id         INT UNSIGNED NOT NULL,
    quantity        INT DEFAULT 1,
    obtained_from   VARCHAR(64) DEFAULT NULL,
    obtained_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_char_card (character_id, card_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Card game match records
CREATE TABLE IF NOT EXISTS game_card_matches (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    player1_id      INT UNSIGNED NOT NULL,
    player2_id      INT UNSIGNED DEFAULT NULL,
    npc_opponent    VARCHAR(64) DEFAULT NULL,
    board_size      INT DEFAULT 9,
    board_json      JSON DEFAULT NULL,
    winner_id       INT UNSIGNED DEFAULT NULL,
    status          ENUM('active','completed','draw') DEFAULT 'active',
    wager_card_id   INT UNSIGNED DEFAULT NULL,
    reward_card_id  INT UNSIGNED DEFAULT NULL,
    played_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Card game rules per region/NPC
CREATE TABLE IF NOT EXISTS game_card_rules (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64) NOT NULL,
    description     TEXT,
    rule_type       VARCHAR(32) NOT NULL,
    is_active       TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_card_rules (name, description, rule_type) VALUES
('Open', 'Both players can see each others cards.', 'open'),
('Same', 'If a placed card has the same value on adjacent sides as neighboring cards, flip them.', 'same'),
('Plus', 'If the sum of touching values are equal, flip both.', 'plus'),
('Elemental', 'Matching element on a tile gives +1 to all values. Mismatch gives -1.', 'elemental'),
('Sudden Death', 'If draw, replay with only captured cards.', 'sudden_death'),
('Random', 'Cards are randomly selected from your collection.', 'random');

-- Seed some cards from a template
INSERT IGNORE INTO game_cards (name, icon, rarity, value_top, value_right, value_bottom, value_left, source_type) VALUES
('Goblin',         '👺', 'common',    2, 3, 1, 2, 'enemy'),
('Skeleton',       '💀', 'common',    3, 2, 2, 1, 'enemy'),
('Wolf',           '🐺', 'common',    1, 4, 2, 3, 'enemy'),
('Dark Knight',    '⚔️', 'uncommon',  5, 4, 3, 5, 'enemy'),
('Fire Mage',      '🔥', 'uncommon',  3, 6, 4, 2, 'enemy'),
('Forest Guardian','🌲', 'rare',      6, 5, 7, 4, 'enemy'),
('Dragon',         '🐉', 'epic',      8, 7, 6, 8, 'boss'),
('Ancient One',    '👁️', 'legendary', 9, 9, 8, 9, 'boss');

-- ─── 3. Tier 4 Battle Modes ────────────────────────────────────
-- Deck-building: draw abilities from a deck each turn
ALTER TABLE characters ADD COLUMN IF NOT EXISTS battle_deck_json JSON DEFAULT NULL;

-- Siege mechanics: structures with HP
CREATE TABLE IF NOT EXISTS game_siege_structures (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64) NOT NULL,
    icon            VARCHAR(20) DEFAULT NULL,
    max_hp          INT DEFAULT 500,
    defense         INT DEFAULT 20,
    abilities_json  JSON DEFAULT NULL,
    team            ENUM('attacker','defender','neutral') DEFAULT 'neutral',
    is_active       TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_siege_structures (name, icon, max_hp, defense, team) VALUES
('Castle Wall',    '🏰', 1000, 50, 'defender'),
('Gate',           '🚪', 500, 30, 'defender'),
('Watchtower',     '🗼', 300, 20, 'defender'),
('Battering Ram',  '🪵', 200, 10, 'attacker'),
('Catapult',       '🪨', 150, 5, 'attacker');
