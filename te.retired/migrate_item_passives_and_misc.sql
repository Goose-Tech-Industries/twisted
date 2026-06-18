-- =============================================================
-- MIGRATION: Item Passive Effects + Missing Game Systems
-- =============================================================
-- Adds special passive/active effects to items so equipment
-- like Power Pole, Nimbus, Weighted Clothing, Scouters, etc.
-- can have unique abilities beyond flat stat bonuses.
--
-- Also adds several missing general-purpose RPG systems.
-- =============================================================

-- ─── ITEM SPECIAL EFFECTS ────────────────────────────────────
-- Extends game_items with passive abilities and use effects.
ALTER TABLE game_items
    ADD COLUMN IF NOT EXISTS passive_effects_json JSON DEFAULT NULL,
    -- Format: [
    --   {"type":"flight","label":"Grants flight","overworld_only":true},
    --   {"type":"training_mult","value":1.10,"label":"+10% training gains"},
    --   {"type":"dodge_penalty","value":-0.05,"label":"-5% dodge"},
    --   {"type":"melee_range","value":"extended","label":"Extended melee range"},
    --   {"type":"regen_hp_pct","value":0.02,"per":"turn","label":"Regen 2% HP/turn"},
    --   {"type":"sense_pl","range":20,"precision":"exact"},
    --   {"type":"auto_revive","hp_pct":50,"cooldown_hours":168,"label":"Phoenix Armor"},
    --   {"type":"damage_reflect","pct":5,"label":"Reflect 5% damage"},
    --   {"type":"stealth","label":"Hidden from scouters"},
    --   {"type":"gravity_resist","value":10,"label":"Resist 10x gravity"}
    -- ]

    ADD COLUMN IF NOT EXISTS use_effects_json JSON DEFAULT NULL,
    -- For consumables / activated items:
    -- [
    --   {"type":"heal_full","label":"Restores all HP"},
    --   {"type":"heal_pct","value":50,"label":"Restores 50% HP"},
    --   {"type":"cure_status","status":"all"},
    --   {"type":"grant_flight","duration_minutes":30},
    --   {"type":"teleport_home","label":"Return to last save point"},
    --   {"type":"summon_minion","npc_id":5,"pl_pct":25,"count":1},
    --   {"type":"buff_stat","stat":"atk","mult":1.5,"duration_turns":3},
    --   {"type":"scan","range":20,"precision":"exact"}
    -- ]

    ADD COLUMN IF NOT EXISTS max_uses INT UNSIGNED DEFAULT NULL,       -- NULL=unlimited, 1=single use
    ADD COLUMN IF NOT EXISTS current_uses INT UNSIGNED DEFAULT NULL,   -- tracked per character_inventory
    ADD COLUMN IF NOT EXISTS cooldown_seconds INT UNSIGNED DEFAULT 0,  -- cooldown between uses
    ADD COLUMN IF NOT EXISTS durability INT UNSIGNED DEFAULT NULL,     -- NULL=indestructible, degrades per use/hit
    ADD COLUMN IF NOT EXISTS alignment_min INT DEFAULT NULL,           -- alignment gating
    ADD COLUMN IF NOT EXISTS alignment_max INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS required_race VARCHAR(64) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS required_class VARCHAR(64) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS is_tradeable TINYINT(1) NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS is_unique TINYINT(1) NOT NULL DEFAULT 0,  -- only 1 per character
    ADD COLUMN IF NOT EXISTS rarity ENUM('common','uncommon','rare','epic','legendary','mythic') DEFAULT 'common',
    ADD COLUMN IF NOT EXISTS lore_text TEXT DEFAULT NULL;               -- flavor text / backstory

-- ─── PET / MOUNT PASSIVE EFFECTS ─────────────────────────────
-- Mounts already exist but need passive effect support
ALTER TABLE game_mounts
    ADD COLUMN IF NOT EXISTS passive_effects_json JSON DEFAULT NULL;
    -- Same format as item passives:
    -- [{"type":"flight","label":"This mount can fly"},
    --  {"type":"speed_mult","value":2.0}]

-- ─── WEATHER EFFECTS ON COMBAT ───────────────────────────────
-- Weather affects combat stats — rain = electric attacks stronger,
-- sandstorm = accuracy penalty, etc.
CREATE TABLE IF NOT EXISTS game_weather_effects (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ruleset_id          INT UNSIGNED DEFAULT NULL,
    weather_type        VARCHAR(32) NOT NULL,                -- RAIN, SNOW, STORM, FOG, etc.
    label               VARCHAR(64) NOT NULL,
    description         TEXT,
    -- Stat modifiers during this weather
    stat_mods_json      JSON DEFAULT NULL,
    -- {"speed": -0.10, "dodge": -0.05}  (sandstorm = slower, harder to dodge)
    -- {"electric_damage": 1.30}          (rain = electric attacks 30% stronger)
    -- {"fire_damage": 0.70}              (rain = fire attacks 30% weaker)
    element_mods_json   JSON DEFAULT NULL,
    -- {"fire": 0.70, "electric": 1.30, "ice": 1.10}
    visibility_reduction DECIMAL(4,2) DEFAULT 0,             -- 0-1, affects sensing/scouter range
    movement_penalty     DECIMAL(4,2) DEFAULT 0,             -- 0-1, reduces movement speed
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_weather_ruleset (ruleset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── PLANET / WORLD TRAVEL ───────────────────────────────────
-- Spaceship-based travel between planets/worlds.
-- Ships are items with travel capabilities.
CREATE TABLE IF NOT EXISTS game_travel_routes (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    from_map_id         INT UNSIGNED NOT NULL,               -- departure map (spaceport)
    to_map_id           INT UNSIGNED NOT NULL,               -- arrival map
    from_planet         VARCHAR(64) DEFAULT NULL,
    to_planet           VARCHAR(64) DEFAULT NULL,
    travel_time_hours   INT UNSIGNED DEFAULT 1,              -- real-time hours to travel
    required_ship_item_id INT UNSIGNED DEFAULT NULL,          -- need a ship item
    required_ship_pl    INT UNSIGNED DEFAULT 0,               -- ship must handle this PL (protection)
    fuel_cost           INT UNSIGNED DEFAULT 0,               -- gold cost
    can_train_during    TINYINT(1) NOT NULL DEFAULT 0,        -- ship has training room
    training_gravity    DECIMAL(4,1) DEFAULT 1.0,             -- gravity mult during travel
    max_passengers      INT UNSIGNED DEFAULT 1,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_routes_from (from_map_id),
    INDEX idx_routes_to (to_map_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── CHARACTER TRAVEL STATE ──────────────────────────────────
CREATE TABLE IF NOT EXISTS character_travel (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id        INT UNSIGNED NOT NULL,
    route_id            INT UNSIGNED NOT NULL,
    departed_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    arrives_at          DATETIME NOT NULL,
    ship_item_id        INT UNSIGNED DEFAULT NULL,
    passengers_json     JSON DEFAULT NULL,                    -- [char_id, char_id, ...]
    status              ENUM('traveling','arrived','cancelled') DEFAULT 'traveling',
    UNIQUE KEY uq_char_travel (character_id),
    INDEX idx_travel_arrives (arrives_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── TITLE / EPITHET SYSTEM ──────────────────────────────────
-- Earned titles displayed under character name.
-- "Goku, the Super Saiyan" / "Vegeta, Prince of All Saiyans"
CREATE TABLE IF NOT EXISTS game_titles (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ruleset_id          INT UNSIGNED DEFAULT NULL,
    name                VARCHAR(128) NOT NULL,                -- "the Super Saiyan", "Prince of All Saiyans"
    description         TEXT,
    icon                VARCHAR(32) DEFAULT NULL,
    color               VARCHAR(16) DEFAULT NULL,             -- hex color for display
    -- Unlock conditions
    unlock_type         ENUM('achievement','level','powerlevel','alignment','quest','kill_count','dm_grant','fusion','transformation','technique') DEFAULT 'achievement',
    unlock_value_json   JSON DEFAULT NULL,
    -- {"achievement_id": 5} or {"level": 50} or {"alignment_min": 75} or {"kill_count": 100}
    -- Passive bonuses when equipped as active title
    stat_bonuses_json   JSON DEFAULT NULL,                    -- {"atk": 100, "speed": 5}
    sort_order          INT UNSIGNED DEFAULT 0,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_titles_ruleset (ruleset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_titles (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id        INT UNSIGNED NOT NULL,
    title_id            INT UNSIGNED NOT NULL,
    is_active           TINYINT(1) NOT NULL DEFAULT 0,        -- only one active at a time
    earned_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_char_title (character_id, title_id),
    INDEX idx_char_titles (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── BOUNTY BOARD (PLAYER-SET) ───────────────────────────────
-- Players can place bounties on other players.
-- Evil players can set kill bounties, good players can set capture bounties.
CREATE TABLE IF NOT EXISTS game_player_bounties (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    posted_by           INT UNSIGNED NOT NULL,                -- who placed the bounty
    target_char_id      INT UNSIGNED NOT NULL,                -- who it's on
    bounty_type         ENUM('kill','capture','defeat','humiliate') DEFAULT 'defeat',
    reward_gold         INT UNSIGNED NOT NULL DEFAULT 0,
    reward_item_id      INT UNSIGNED DEFAULT NULL,
    reason              VARCHAR(255) DEFAULT NULL,             -- "For destroying my village"
    status              ENUM('active','claimed','expired','cancelled') DEFAULT 'active',
    claimed_by          INT UNSIGNED DEFAULT NULL,
    expires_at          DATETIME DEFAULT NULL,
    posted_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_bounties_target (target_char_id, status),
    INDEX idx_bounties_active (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
