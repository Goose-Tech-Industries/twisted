-- =================================================================
-- NPC Living World Systems
-- Schedules, Relationships, Dynamic Economy, Cutscenes, World Events
-- =================================================================

-- ─── 1. NPC Schedule Enhancement ────────────────────────────────
-- schedule_json already exists on game_npcs, but let's make it structured
ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS default_map_id INT UNSIGNED DEFAULT NULL;
ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS npc_level INT DEFAULT 1;
ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS npc_class VARCHAR(64) DEFAULT 'Commoner';
ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS base_hp INT DEFAULT 50;
ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS base_mp INT DEFAULT 20;
ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS base_atk INT DEFAULT 8;
ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS base_def INT DEFAULT 5;
ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS base_mo INT DEFAULT 5;
ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS base_md INT DEFAULT 5;
ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS base_speed INT DEFAULT 10;
ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS base_luck INT DEFAULT 5;
ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS element VARCHAR(32) DEFAULT NULL;
ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS skills_json JSON DEFAULT NULL;

-- ─── 2. NPC Relationship Web ────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_npc_relationships (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    npc_id_a        INT UNSIGNED NOT NULL,
    npc_id_b        INT UNSIGNED NOT NULL,
    relationship    ENUM('family','friend','rival','enemy','lover','mentor','student','ally','neutral') NOT NULL DEFAULT 'neutral',
    strength        INT DEFAULT 50,
    description     VARCHAR(256) DEFAULT NULL,
    UNIQUE KEY idx_pair (npc_id_a, npc_id_b)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Player reputation with NPCs (extends existing npc_memories)
ALTER TABLE npc_memories ADD COLUMN IF NOT EXISTS relationship_tier VARCHAR(32) DEFAULT 'stranger';
ALTER TABLE npc_memories ADD COLUMN IF NOT EXISTS total_interactions INT DEFAULT 0;
ALTER TABLE npc_memories ADD COLUMN IF NOT EXISTS last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- ─── 3. Dynamic Economy ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_economy_state (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_id         INT UNSIGNED NOT NULL,
    region_id       INT UNSIGNED DEFAULT NULL,
    supply          INT DEFAULT 100,
    demand          INT DEFAULT 50,
    price_modifier  DECIMAL(4,2) DEFAULT 1.00,
    last_updated    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY idx_item_region (item_id, region_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Track purchase/sell volume for demand calculation
CREATE TABLE IF NOT EXISTS game_economy_transactions (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_id         INT UNSIGNED NOT NULL,
    shop_id         INT UNSIGNED DEFAULT NULL,
    region_id       INT UNSIGNED DEFAULT NULL,
    transaction_type ENUM('buy','sell') NOT NULL,
    quantity        INT DEFAULT 1,
    price           INT DEFAULT 0,
    character_id    INT UNSIGNED DEFAULT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_item_date (item_id, created_at),
    INDEX idx_region_date (region_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 4. Dynamic World Events ────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_world_events (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    event_type      ENUM('random','scripted','ai_generated','recurring') DEFAULT 'random',
    region_id       INT UNSIGNED DEFAULT NULL,
    map_id          INT UNSIGNED DEFAULT NULL,
    trigger_json    JSON DEFAULT NULL,
    effects_json    JSON DEFAULT NULL,
    duration_minutes INT DEFAULT 60,
    is_active       TINYINT(1) DEFAULT 0,
    started_at      TIMESTAMP DEFAULT NULL,
    expires_at      TIMESTAMP DEFAULT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_world_events (name, description, event_type, trigger_json, effects_json, duration_minutes) VALUES
('Merchant Caravan Attack', 'A merchant caravan has been ambushed on the road! Players can investigate for rewards.', 'random',
 '{"chance_per_hour": 5}', '{"spawn_enemies": true, "bonus_loot": 1.5, "notification": "A merchant caravan has been attacked nearby!"}', 120),
('Blood Moon Rising', 'The blood moon rises, empowering dark creatures and weakening the light.', 'recurring',
 '{"time_of_day": "night", "chance_per_night": 15}', '{"element_boost": {"dark": 1.3, "light": 0.7}, "spawn_rate_mult": 2.0, "notification": "The blood moon rises... dark forces stir."}', 30),
('Wandering Merchant', 'A mysterious traveling merchant appears with rare goods.', 'random',
 '{"chance_per_hour": 10}', '{"spawn_npc": true, "npc_type": "merchant", "notification": "A wandering merchant has arrived!"}', 60);

-- ─── 5. Cutscene System ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_cutscenes (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     VARCHAR(256) DEFAULT NULL,
    trigger_type    ENUM('quest','event','map_enter','interact','manual') DEFAULT 'manual',
    trigger_value   VARCHAR(128) DEFAULT NULL,
    sequence_json   JSON NOT NULL,
    is_skippable    TINYINT(1) DEFAULT 1,
    is_active       TINYINT(1) DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_cutscenes (name, description, trigger_type, sequence_json) VALUES
('intro_example', 'Example intro cutscene', 'manual', '[
  {"cmd": "fade_out", "duration": 500},
  {"cmd": "camera_pan", "x": 10, "y": 5, "duration": 1000},
  {"cmd": "dialogue", "speaker": "Narrator", "text": "In a land shrouded by ancient mist..."},
  {"cmd": "wait", "duration": 1000},
  {"cmd": "npc_walk", "npcName": "Elder", "toX": 12, "toY": 5, "speed": 1},
  {"cmd": "dialogue", "speaker": "Elder", "text": "You have finally arrived. We have much to discuss."},
  {"cmd": "camera_pan", "toPlayer": true, "duration": 800},
  {"cmd": "fade_in", "duration": 500},
  {"cmd": "choice", "speaker": "Elder", "choices": [{"text": "Tell me everything.", "flag": "elder_quest_start"}, {"text": "I need to prepare first."}]}
]');
