-- =================================================================
-- Worlds System + Map Editor Tier 2 Features
-- =================================================================

-- ─── 1. Worlds Table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_worlds (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    icon            VARCHAR(20) DEFAULT NULL,
    sort_order      INT DEFAULT 0,
    is_active       TINYINT(1) DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed a default world
INSERT IGNORE INTO game_worlds (id, name, description, icon, sort_order) VALUES
(1, 'Planet Mado', 'The primary world where most adventures take place.', '🌍', 0);

-- Add world_id to regions
ALTER TABLE game_regions ADD COLUMN IF NOT EXISTS world_id INT UNSIGNED DEFAULT 1;

-- Link existing regions to the default world
UPDATE game_regions SET world_id = 1 WHERE world_id IS NULL OR world_id = 0;

-- ─── 2. Map Editor Tier 2 columns ──────────────────────────────
-- Parallax background
ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS parallax_url VARCHAR(512) DEFAULT NULL;
ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS parallax_speed_x DECIMAL(4,2) DEFAULT 0.50;
ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS parallax_speed_y DECIMAL(4,2) DEFAULT 0.25;

-- Fog of war
ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS fog_of_war TINYINT(1) DEFAULT 0;
ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS fog_reveal_radius INT DEFAULT 3;

-- Sound zones (stored in map JSON, but add a default ambient)
ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS ambient_sound_url VARCHAR(512) DEFAULT NULL;

-- Map template flag
ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS is_template TINYINT(1) DEFAULT 0;
ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS template_category VARCHAR(64) DEFAULT NULL;

-- ─── 3. Character exploration state (fog of war) ───────────────
CREATE TABLE IF NOT EXISTS character_map_exploration (
    character_id    INT UNSIGNED NOT NULL,
    map_id          INT UNSIGNED NOT NULL,
    explored_tiles  LONGTEXT,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id, map_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 4. Map sound zones table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS game_map_sound_zones (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    map_id          INT UNSIGNED NOT NULL,
    name            VARCHAR(64) DEFAULT 'Ambient Zone',
    sound_asset_id  INT UNSIGNED DEFAULT NULL,
    sound_url       VARCHAR(512) DEFAULT NULL,
    x_min           INT NOT NULL DEFAULT 0,
    y_min           INT NOT NULL DEFAULT 0,
    x_max           INT NOT NULL DEFAULT 10,
    y_max           INT NOT NULL DEFAULT 10,
    volume          DECIMAL(3,2) DEFAULT 0.50,
    loop_sound      TINYINT(1) DEFAULT 1,
    is_active       TINYINT(1) DEFAULT 1,
    INDEX idx_map (map_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── 5. Tile animation definitions ─────────────────────────────
CREATE TABLE IF NOT EXISTS game_tile_animations (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64) NOT NULL,
    description     VARCHAR(256) DEFAULT NULL,
    tileset_url     VARCHAR(512) DEFAULT NULL,
    frame_tiles     JSON NOT NULL,
    fps             INT DEFAULT 4,
    is_active       TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_tile_animations (name, description, frame_tiles, fps) VALUES
('water_flow', 'Gentle water ripple animation', '[0,1,2,1]', 3),
('lava_bubble', 'Bubbling lava surface', '[0,1,2,3]', 2),
('waterfall', 'Cascading waterfall', '[0,1,2,3,4,5]', 6),
('torch_flicker', 'Flickering torch flame', '[0,1,0,2]', 4),
('crystal_pulse', 'Glowing crystal pulse', '[0,1,2,1]', 2);
