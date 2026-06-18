-- =================================================================
-- Gameplay Systems: Gathering, Bank, Creatures, Seasons,
-- Keys, Bounties, Treasure Hunts, Mounts, Housing
-- =================================================================

-- ─── 1. Gathering Skills ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_gathering_skills (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64) NOT NULL,
    icon            VARCHAR(20) DEFAULT NULL,
    description     TEXT,
    max_level       INT DEFAULT 99,
    xp_formula      VARCHAR(128) DEFAULT 'BASE * LEVEL',
    is_active       TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_gathering_skills (name, icon, description) VALUES
('Mining', '⛏️', 'Extract ores and gems from rock nodes.'),
('Fishing', '🎣', 'Catch fish and aquatic creatures from water tiles.'),
('Woodcutting', '🪓', 'Chop trees for lumber and rare wood.'),
('Herbalism', '🌿', 'Gather herbs, mushrooms, and alchemical ingredients.'),
('Cooking', '🍳', 'Prepare food items that grant temporary buffs.'),
('Smithing', '🔨', 'Forge weapons and armor from raw materials.');

-- Gathering nodes (placed on maps)
CREATE TABLE IF NOT EXISTS game_gathering_nodes (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    skill_id        INT UNSIGNED NOT NULL,
    name            VARCHAR(64) NOT NULL,
    icon            VARCHAR(20) DEFAULT NULL,
    map_id          INT UNSIGNED DEFAULT NULL,
    x               INT DEFAULT 0,
    y               INT DEFAULT 0,
    min_level       INT DEFAULT 1,
    xp_reward       INT DEFAULT 10,
    respawn_seconds INT DEFAULT 300,
    yield_table     JSON DEFAULT NULL,
    tool_item_id    INT UNSIGNED DEFAULT NULL,
    is_active       TINYINT(1) DEFAULT 1,
    INDEX idx_map (map_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Player skill levels
CREATE TABLE IF NOT EXISTS character_gathering_levels (
    character_id    INT UNSIGNED NOT NULL,
    skill_id        INT UNSIGNED NOT NULL,
    level           INT DEFAULT 1,
    xp              INT DEFAULT 0,
    total_gathered  INT DEFAULT 0,
    PRIMARY KEY (character_id, skill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 2. Bank / Vault ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS character_bank (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    item_id         INT UNSIGNED NOT NULL,
    quantity        INT DEFAULT 1,
    tab_index       TINYINT DEFAULT 0,
    slot_index      INT DEFAULT 0,
    deposited_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_char_item_tab (character_id, item_id, tab_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE characters ADD COLUMN IF NOT EXISTS bank_slots INT DEFAULT 50;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS bank_tabs INT DEFAULT 1;

-- ─── 3. Creature Capture / Taming ───────────────────────────────
CREATE TABLE IF NOT EXISTS game_capture_items (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_id         INT UNSIGNED NOT NULL,
    name            VARCHAR(64) NOT NULL,
    icon            VARCHAR(20) DEFAULT NULL,
    catch_rate_bonus DECIMAL(4,2) DEFAULT 1.00,
    description     TEXT,
    is_active       TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_creatures (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    npc_id          INT UNSIGNED NOT NULL,
    nickname        VARCHAR(64) DEFAULT NULL,
    level           INT DEFAULT 1,
    xp              INT DEFAULT 0,
    current_hp      INT DEFAULT 50,
    max_hp          INT DEFAULT 50,
    is_in_party     TINYINT(1) DEFAULT 0,
    is_in_storage   TINYINT(1) DEFAULT 1,
    captured_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_char (character_id),
    INDEX idx_party (character_id, is_in_party)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 4. Seasons System ──────────────────────────────────────────
ALTER TABLE game_worlds ADD COLUMN IF NOT EXISTS seasons_enabled TINYINT(1) DEFAULT 0;
ALTER TABLE game_worlds ADD COLUMN IF NOT EXISTS season_length_days INT DEFAULT 7;
ALTER TABLE game_worlds ADD COLUMN IF NOT EXISTS current_season ENUM('spring','summer','fall','winter') DEFAULT 'spring';
ALTER TABLE game_worlds ADD COLUMN IF NOT EXISTS season_started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS game_season_effects (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    season          ENUM('spring','summer','fall','winter') NOT NULL,
    world_id        INT UNSIGNED DEFAULT NULL,
    weather_weight  JSON DEFAULT NULL,
    gathering_mult  DECIMAL(3,2) DEFAULT 1.00,
    spawn_rate_mult DECIMAL(3,2) DEFAULT 1.00,
    shop_price_mult DECIMAL(3,2) DEFAULT 1.00,
    description     TEXT,
    is_active       TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_season_effects (season, description, gathering_mult, spawn_rate_mult) VALUES
('spring', 'New growth. Herbs abundant, fish spawning.', 1.25, 0.90),
('summer', 'Peak season. Everything thrives.', 1.00, 1.00),
('fall', 'Harvest time. Rare materials appear.', 1.10, 1.10),
('winter', 'Harsh conditions. Gathering harder, enemies stronger.', 0.75, 1.30);

-- ─── 5. Key / Lock System ───────────────────────────────────────
-- Uses existing item system (type=KEY) + event conditions
-- No new tables needed — key items check via has_item condition in event scripts
-- Adding a convenience column to map events:
-- (Handled in collisions_json event data with conditions)

-- ─── 6. Slayer / Bounty Tasks ───────────────────────────────────
CREATE TABLE IF NOT EXISTS game_bounty_boards (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    map_id          INT UNSIGNED DEFAULT NULL,
    x               INT DEFAULT 0,
    y               INT DEFAULT 0,
    max_active      INT DEFAULT 3,
    refresh_hours   INT DEFAULT 24,
    icon            VARCHAR(20) DEFAULT NULL,
    is_active       TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_bounty_tasks (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    board_id        INT UNSIGNED DEFAULT NULL,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    target_npc_id   INT UNSIGNED DEFAULT NULL,
    target_name     VARCHAR(64) DEFAULT NULL,
    kill_count      INT DEFAULT 5,
    reward_xp       INT DEFAULT 100,
    reward_gold     INT DEFAULT 50,
    reward_items    JSON DEFAULT NULL,
    min_level       INT DEFAULT 1,
    max_level       INT DEFAULT 99,
    is_daily        TINYINT(1) DEFAULT 0,
    is_active       TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_bounties (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    task_id         INT UNSIGNED NOT NULL,
    kills           INT DEFAULT 0,
    status          ENUM('active','completed','claimed') DEFAULT 'active',
    accepted_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at    TIMESTAMP DEFAULT NULL,
    INDEX idx_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 7. Treasure Hunt / Clue Scrolls ───────────────────────────
CREATE TABLE IF NOT EXISTS game_treasure_trails (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    tier            ENUM('easy','medium','hard','elite','master') DEFAULT 'easy',
    steps_json      JSON NOT NULL,
    reward_table    JSON DEFAULT NULL,
    is_active       TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_treasure_progress (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    trail_id        INT UNSIGNED NOT NULL,
    current_step    INT DEFAULT 0,
    started_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_char_trail (character_id, trail_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_treasure_trails (name, tier, steps_json, reward_table) VALUES
('Beginner Clue', 'easy', '[
  {"type":"riddle","text":"Where the water meets the stone, seek what lies beneath alone.","answer_map_id":1,"answer_x":5,"answer_y":10},
  {"type":"coordinate","map_id":1,"x":15,"y":8,"hint":"Dig at these coordinates."},
  {"type":"npc_talk","npc_name":"Elder","hint":"Speak to the Elder for the final clue."}
]', '{"xp":200,"gold":100,"items":[]}');

-- ─── 8. Mount / Vehicle System ──────────────────────────────────
CREATE TABLE IF NOT EXISTS game_mounts (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64) NOT NULL,
    icon            VARCHAR(20) DEFAULT NULL,
    description     TEXT,
    speed_mult      DECIMAL(3,2) DEFAULT 1.50,
    sprite_url      VARCHAR(512) DEFAULT NULL,
    obtain_type     ENUM('quest','purchase','tame','craft','drop') DEFAULT 'purchase',
    obtain_value    VARCHAR(128) DEFAULT NULL,
    is_active       TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_mounts (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    mount_id        INT UNSIGNED NOT NULL,
    nickname        VARCHAR(64) DEFAULT NULL,
    is_active       TINYINT(1) DEFAULT 0,
    obtained_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_char_mount (character_id, mount_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_mounts (name, icon, description, speed_mult, obtain_type) VALUES
('War Horse', '🐴', 'A sturdy warhorse. 50% faster overworld travel.', 1.50, 'purchase'),
('Shadow Wolf', '🐺', 'A massive dark wolf. Silent and swift.', 1.75, 'tame'),
('Flying Carpet', '🧞', 'A magical carpet. Ignores terrain penalties.', 2.00, 'quest');

-- ─── 9. Player Housing ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_housing_plots (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    map_id          INT UNSIGNED NOT NULL,
    x               INT NOT NULL,
    y               INT NOT NULL,
    width           INT DEFAULT 5,
    height          INT DEFAULT 5,
    price           INT DEFAULT 5000,
    owner_char_id   INT UNSIGNED DEFAULT NULL,
    plot_name       VARCHAR(64) DEFAULT 'Plot',
    is_available    TINYINT(1) DEFAULT 1,
    INDEX idx_map (map_id),
    INDEX idx_owner (owner_char_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_furniture (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64) NOT NULL,
    icon            VARCHAR(20) DEFAULT NULL,
    description     TEXT,
    type            ENUM('decoration','storage','functional','light','crafting') DEFAULT 'decoration',
    width           INT DEFAULT 1,
    height          INT DEFAULT 1,
    effects_json    JSON DEFAULT NULL,
    price           INT DEFAULT 100,
    is_active       TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_housing (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    plot_id         INT UNSIGNED NOT NULL,
    furniture_json  JSON DEFAULT NULL,
    storage_json    JSON DEFAULT NULL,
    visitors_allowed TINYINT(1) DEFAULT 1,
    purchased_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_char_plot (character_id, plot_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_furniture (name, icon, description, type, price) VALUES
('Wooden Table', '🪑', 'A simple wooden table.', 'decoration', 50),
('Storage Chest', '📦', 'Extra storage for your home. +10 bank slots.', 'storage', 500),
('Torch Sconce', '🔥', 'Wall-mounted torch. Provides light.', 'light', 75),
('Bed', '🛏️', 'Rest here to restore HP/MP for free.', 'functional', 200),
('Cooking Pot', '🍲', 'Cook recipes at home.', 'crafting', 300),
('Trophy Case', '🏆', 'Display your achievements and rare items.', 'decoration', 1000),
('Garden Plot', '🌱', 'Grow herbs at home.', 'crafting', 400),
('Anvil', '⚒️', 'Craft weapons and armor at home.', 'crafting', 800);
