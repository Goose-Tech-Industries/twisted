-- =================================================================
-- TWISTED ENGINE — FULL DATABASE SCHEMA v10
-- =================================================================
-- Run this ONCE on a fresh database to create everything.
-- Safe to re-run (uses IF NOT EXISTS throughout).
--
-- Order matters because of foreign keys. Run top to bottom.
--
-- After this runs, start the server and go to /adminsauce to
-- fill in your game content (maps, classes, items, etc.)
-- =================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- =================================================================
-- SECTION 1: USERS & ACCOUNTS
-- =================================================================

CREATE TABLE IF NOT EXISTS users (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(64)  NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            ENUM('PLAYER','MOD','GM','ADMIN','OWNER') NOT NULL DEFAULT 'PLAYER',
    currency        INT UNSIGNED NOT NULL DEFAULT 100,  -- starting gold
    is_banned              TINYINT(1)   NOT NULL DEFAULT 0,
    email_verified         TINYINT(1)   NOT NULL DEFAULT 1,  -- 1=verified (default for servers without SMTP)
    email_verify_token     VARCHAR(128) NULL,
    email_verify_expires   DATETIME     NULL,
    created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login             TIMESTAMP    NULL,
    login_streak           INT UNSIGNED NOT NULL DEFAULT 0,
    last_login_date        DATE         NULL,  -- DATE only (no time) for streak comparison
    INDEX idx_users_role (role),
    INDEX idx_users_verify_token (email_verify_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- SECTION 2: GAME CONTENT TABLES (no FK deps)
-- =================================================================

CREATE TABLE IF NOT EXISTS game_classes (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    description     TEXT,
    icon            VARCHAR(8)   DEFAULT '⚔️',
    base_hp         INT NOT NULL DEFAULT 100,
    base_mp         INT NOT NULL DEFAULT 50,
    base_atk        INT NOT NULL DEFAULT 10,
    base_def        INT NOT NULL DEFAULT 5,
    base_mo         INT NOT NULL DEFAULT 5,   -- magic offense
    base_md         INT NOT NULL DEFAULT 5,   -- magic defense
    base_speed      INT NOT NULL DEFAULT 10,
    base_luck       INT NOT NULL DEFAULT 5,
    battle_cmds     JSON,                     -- array of extra battle_command IDs
    hidden          TINYINT(1) NOT NULL DEFAULT 0,
    sort_order      INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_races (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    description     TEXT,
    icon            VARCHAR(8)   DEFAULT '🧬',
    bonus_hp        INT NOT NULL DEFAULT 0,
    bonus_mp        INT NOT NULL DEFAULT 0,
    bonus_atk       INT NOT NULL DEFAULT 0,
    bonus_def       INT NOT NULL DEFAULT 0,
    bonus_mo        INT NOT NULL DEFAULT 0,
    bonus_md        INT NOT NULL DEFAULT 0,
    bonus_speed     INT NOT NULL DEFAULT 0,
    bonus_luck      INT NOT NULL DEFAULT 0,
    hidden          TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_backgrounds (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    description     TEXT,
    bonus_hp        INT NOT NULL DEFAULT 0,
    bonus_mp        INT NOT NULL DEFAULT 0,
    bonus_str       VARCHAR(64)  -- display string e.g. "+10 HP"
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_feats (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    description     TEXT,
    effect_json     JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_equip_slots (
    slot_key        VARCHAR(32)  NOT NULL PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    display_order   INT NOT NULL DEFAULT 0,
    icon            VARCHAR(8)   DEFAULT '📦',
    allows_types    VARCHAR(255)  -- comma-separated item types allowed
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_stat_definitions (
    key_name        VARCHAR(64)  NOT NULL PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    description     TEXT,
    default_value   INT NOT NULL DEFAULT 0,
    min_value       INT NOT NULL DEFAULT 0,
    max_value       INT NOT NULL DEFAULT 9999,
    icon            VARCHAR(8)   DEFAULT '📊'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_elements (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    icon            VARCHAR(8)   DEFAULT '🔥',
    color           VARCHAR(16)  DEFAULT '#ff6600',
    strengths_json  JSON,        -- array of element ids this beats
    weaknesses_json JSON         -- array of element ids that beat this
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_statuses (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    description     TEXT,
    icon            VARCHAR(8)   DEFAULT '⚡',
    type            ENUM('buff','debuff','neutral') NOT NULL DEFAULT 'debuff',
    default_duration INT NOT NULL DEFAULT 3,   -- turns (used if applier doesn't specify)
    permanent       TINYINT(1)   NOT NULL DEFAULT 0,  -- 1 = never expires
    effects         JSON,        -- damage_per_turn, heal_per_turn, stat_mod, skip_turn, log
    disabled_commands JSON       -- array of command IDs disabled while afflicted
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_skills (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    description     TEXT,
    battle_text     VARCHAR(255) DEFAULT NULL,   -- e.g. "{name} hurls a fireball!"
    type            ENUM('physical','magic','heal','buff','debuff','special') NOT NULL DEFAULT 'magic',
    target_type     VARCHAR(32)  NOT NULL DEFAULT 'ENEMY',  -- ENEMY, SELF, ALLY
    elements        JSON         DEFAULT NULL,   -- array: ["fire","ice"]
    heal_status     JSON         DEFAULT NULL,   -- array of status IDs to cure on target
    icon            VARCHAR(8)   DEFAULT '✨',
    effects         JSON         -- damage/heal/set_status resolver JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_class_skills (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    class_id        INT UNSIGNED NOT NULL,
    skill_id        INT UNSIGNED NOT NULL,
    learn_level     INT NOT NULL DEFAULT 1,
    mp_cost         INT DEFAULT NULL,  -- override skill default MP cost
    alt_name        VARCHAR(64) DEFAULT NULL,
    UNIQUE KEY uniq_class_skill (class_id, skill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_battle_commands (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    icon            VARCHAR(8)   DEFAULT '⚔️',
    description     TEXT,
    action_type     ENUM('attack','defend','skills','items','run','limit','custom') NOT NULL DEFAULT 'attack',
    target_type     VARCHAR(32)  NOT NULL DEFAULT 'ENEMY',
    is_default      TINYINT(1)   NOT NULL DEFAULT 0,
    display_order   INT          NOT NULL DEFAULT 0,
    class_ids       JSON,
    effects         JSON         -- resolver JSON: damage, flee, set_status, open_menu
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_limit_breaks (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    description     TEXT,
    class_id        INT UNSIGNED NOT NULL,
    break_level     INT NOT NULL DEFAULT 1,
    char_level_req  INT NOT NULL DEFAULT 1,
    target_type     VARCHAR(32)  NOT NULL DEFAULT 'ENEMY',
    icon            VARCHAR(8)   DEFAULT '💥',
    effects         JSON         -- damage/heal/set_status resolver JSON + log text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_items (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    type            ENUM('WEAPON','ARMOR','HELMET','BOOTS','ACCESSORY','CONSUMABLE','QUEST','MISC') NOT NULL DEFAULT 'MISC',
    icon            VARCHAR(8)   DEFAULT '📦',
    slot            VARCHAR(32)  DEFAULT NULL,  -- matches game_equip_slots.slot_key
    value           INT NOT NULL DEFAULT 0,
    bonus_hp        INT NOT NULL DEFAULT 0,
    bonus_mp        INT NOT NULL DEFAULT 0,
    bonus_atk       INT NOT NULL DEFAULT 0,
    bonus_def       INT NOT NULL DEFAULT 0,
    bonus_mo        INT NOT NULL DEFAULT 0,
    bonus_md        INT NOT NULL DEFAULT 0,
    bonus_speed     INT NOT NULL DEFAULT 0,
    bonus_luck      INT NOT NULL DEFAULT 0,
    level_req       INT NOT NULL DEFAULT 1,
    elements        JSON,        -- array of element names
    set_status      VARCHAR(64) DEFAULT NULL,
    stats_json      JSON         -- heal_hp, restore_mp, heal_pct, etc.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- SECTION 3: MAPS & WORLD
-- =================================================================

CREATE TABLE IF NOT EXISTS game_maps (
    id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name                 VARCHAR(128) NOT NULL,
    description          TEXT,
    width                INT NOT NULL DEFAULT 20,
    height               INT NOT NULL DEFAULT 20,
    tiles_json           MEDIUMTEXT,     -- flat array of tile indices
    collisions_json      MEDIUMTEXT,     -- array of event objects {x,y,type,data}
    objects_json         MEDIUMTEXT,     -- array of placed objects {x,y,preset,...}
    anims_json           MEDIUMTEXT,     -- array of animations {trigger,frames,fps}
    tileset_url          VARCHAR(500) DEFAULT NULL,
    ambient_dark         FLOAT NOT NULL DEFAULT 0,
    fast_travel_enabled  TINYINT(1) NOT NULL DEFAULT 1,
    min_level            INT NOT NULL DEFAULT 1,
    is_active            TINYINT(1) NOT NULL DEFAULT 1,
    created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_npcs (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name              VARCHAR(128) NOT NULL,
    persona           TEXT,
    map_id            INT UNSIGNED DEFAULT NULL,
    x                 INT NOT NULL DEFAULT 5,
    y                 INT NOT NULL DEFAULT 5,
    icon              VARCHAR(8)   DEFAULT '👤',
    script_key        VARCHAR(128) DEFAULT NULL,   -- references game_scripts
    is_enemy          TINYINT(1)   NOT NULL DEFAULT 0,
    char_id           INT UNSIGNED DEFAULT NULL,   -- combat stats character
    quest_offers_json JSON,
    -- Movement behaviour. STATIONARY = never moves (shopkeeper, quest giver).
    -- WANDER = moves 1 tile randomly every few seconds within wander_radius.
    -- PATROL = future use (follows a waypoint path).
    move_type       ENUM('STATIONARY','WANDER','PATROL') NOT NULL DEFAULT 'WANDER',
    wander_radius   INT NOT NULL DEFAULT 3,   -- max tiles from spawn point to roam
    -- Daily schedule: array of { hour_from, hour_to, map_id, x, y, label }
    -- e.g. [{"hour_from":8,"hour_to":18,"map_id":1,"x":12,"y":8,"label":"At work"},
    --        {"hour_from":18,"hour_to":24,"map_id":2,"x":5,"y":3,"label":"At tavern"}]
    -- NPCs without a matching slot stay at their spawn point.
    schedule_json   JSON         DEFAULT NULL,
    -- If set, this NPC runs a shop. Interacting opens a CHOICE: Shop / Talk.
    shop_id         INT UNSIGNED DEFAULT NULL
    -- LOOT TABLE: array of drop entries, rolled at end of PvE battle.
    -- Each entry: { item_id, chance, min_qty, max_qty }
    -- chance = 0-100 (percent). min/max_qty = how many copies can drop.
    -- Example: [{"item_id":3,"chance":80,"min_qty":1,"max_qty":3},
    --           {"item_id":7,"chance":15,"min_qty":1,"max_qty":1}]
    drop_table_json   JSON         DEFAULT NULL,
    -- Mood: transient emotional state. NULL = neutral. Set via SET_NPC_MOOD event action.
    -- Affects greetings and chatter line selection.
    mood              ENUM('happy','fearful','angry','grieving','excited') DEFAULT NULL,
    -- Death & replacement: if is_dead=1 this NPC no longer spawns.
    -- predecessor_name lets a replacement NPC reference who they replaced.
    is_dead           TINYINT(1)   NOT NULL DEFAULT 0,
    predecessor_name  VARCHAR(128) DEFAULT NULL,
    death_cause       VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- NPC RUMORS — globally notable player facts that spread between NPCs
-- =================================================================
-- Written when: player kills a named enemy, completes a quest, reaches
-- a new level milestone, or does anything "remarkable."
-- The rumor tick reads unspread rumors and copies them into npc_memories
-- for NPCs who don't know yet, simulating word traveling the world.
-- spread_count: how many NPCs have heard this. Capped at max_spread.
CREATE TABLE IF NOT EXISTS npc_rumors (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    char_id         INT UNSIGNED NOT NULL,
    char_name       VARCHAR(128) NOT NULL,
    rumor_text      VARCHAR(255) NOT NULL,  -- "defeated the Goblin King"
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    spread_count    INT          NOT NULL DEFAULT 0,
    max_spread      INT          NOT NULL DEFAULT 8,  -- stop after 8 NPCs know
    INDEX idx_rumors_char (char_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Persistent NPC memory per player. Survives server restarts.
-- facts_json: short strings the NPC "knows" about this player,
--   e.g. ["Completed goblin cave quest", "Was rude in conversation", "Level 15 warrior"]
-- reputation: -100 (hated) to 100 (beloved). Affects greetings and haggling.
CREATE TABLE IF NOT EXISTS npc_memories (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    char_id         INT UNSIGNED NOT NULL,
    npc_name        VARCHAR(128) NOT NULL,
    facts_json      JSON         DEFAULT NULL,
    reputation      INT          NOT NULL DEFAULT 0,
    last_seen       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_mem (char_id, npc_name),
    INDEX idx_mem_char (char_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_map_spawns (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    map_id          INT UNSIGNED NOT NULL,
    npc_char_id     INT UNSIGNED NOT NULL,  -- character row for enemy stats
    x               INT NOT NULL DEFAULT 5,
    y               INT NOT NULL DEFAULT 5,
    respawn_seconds INT NOT NULL DEFAULT 30,
    enabled         TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_spawns_map (map_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_shops (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    icon            VARCHAR(8)   DEFAULT '🏪',
    map_id          INT UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_shop_supplies (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    shop_id         INT UNSIGNED NOT NULL,
    item_id         INT UNSIGNED NOT NULL,
    buy_price       INT NOT NULL DEFAULT 100,
    sell_price      INT NOT NULL DEFAULT 50,
    stock           INT NOT NULL DEFAULT -1,    -- -1 = unlimited
    UNIQUE KEY uniq_shop_item (shop_id, item_id),
    INDEX idx_supply_shop (shop_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_arenas (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(128) NOT NULL,
    description         TEXT,
    map_id              INT UNSIGNED DEFAULT NULL,
    -- Zone bounds (tile coordinates)
    x_min               INT NOT NULL DEFAULT 0,
    y_min               INT NOT NULL DEFAULT 0,
    x_max               INT NOT NULL DEFAULT 19,
    y_max               INT NOT NULL DEFAULT 19,
    -- Arena type
    type                VARCHAR(32) NOT NULL DEFAULT 'OPEN_PVP',
    -- Level gates
    min_level           INT NOT NULL DEFAULT 1,
    max_level           INT NOT NULL DEFAULT 99,
    -- Economy
    entry_fee           INT NOT NULL DEFAULT 0,
    reward_multiplier   FLOAT NOT NULL DEFAULT 1.0,
    -- Matchmaking options
    max_players         INT NOT NULL DEFAULT 0,      -- 0 = unlimited
    level_matching      TINYINT(1) NOT NULL DEFAULT 1,
    enabled             TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_scripts (
    script_key      VARCHAR(128) NOT NULL PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    script_json     MEDIUMTEXT,   -- the script_editor.js workflow JSON
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- SECTION 4: QUESTS & PROGRESSION
-- =================================================================

CREATE TABLE IF NOT EXISTS quest_definitions (
    quest_id            VARCHAR(64)  NOT NULL PRIMARY KEY,
    title               VARCHAR(120) NOT NULL,
    description         TEXT,
    quest_type          VARCHAR(40)  NOT NULL DEFAULT 'side',
    category            VARCHAR(60)  DEFAULT NULL,
    required_level      INT NOT NULL DEFAULT 1,
    is_repeatable       TINYINT(1)   NOT NULL DEFAULT 0,
    repeat_cooldown_hours INT NOT NULL DEFAULT 0,
    max_completions     INT DEFAULT NULL,
    objectives_json     JSON NOT NULL,
    rewards_json        JSON NOT NULL,
    is_active           TINYINT(1)   NOT NULL DEFAULT 1,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Simpler quest table used by event_runner (older format)
CREATE TABLE IF NOT EXISTS game_quests (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    objectives_json JSON,
    rewards_json    JSON,
    is_active       TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- WORLD FLAGS — Global key/value store for world state
-- =================================================================
-- Admins and scripts set these via SET_WORLD_FLAG events.
-- NPCs read them when building dialogue prompts so they can
-- comment on things that happened in the world.
-- Examples: goblin_boss_slain=true, bridge_destroyed=true,
--           war_started=true, festival_active=true
CREATE TABLE IF NOT EXISTS world_flags (
    flag_key    VARCHAR(128)  NOT NULL PRIMARY KEY,
    flag_value  TEXT          NOT NULL DEFAULT 'true',
    set_by      VARCHAR(128)  DEFAULT NULL,  -- character name who triggered it
    set_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- FACTION SYSTEM
-- =================================================================
-- Factions are groups of NPCs (Town Guard, Merchants Guild, etc.).
-- Players accumulate faction reputation separately from NPC reputation.
-- Crowd reactions and discounts can use faction rep instead of individual rep.
CREATE TABLE IF NOT EXISTS factions (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(128) NOT NULL UNIQUE,
    description TEXT,
    icon        VARCHAR(8)   DEFAULT '⚔️',
    rival_id    INT UNSIGNED DEFAULT NULL   -- helping this faction hurts rival
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS npc_factions (
    npc_id      INT UNSIGNED NOT NULL,
    faction_id  INT UNSIGNED NOT NULL,
    PRIMARY KEY (npc_id, faction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS player_faction_rep (
    char_id     INT UNSIGNED NOT NULL,
    faction_id  INT UNSIGNED NOT NULL,
    reputation  INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (char_id, faction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS level_requirements (
    level           INT UNSIGNED NOT NULL PRIMARY KEY,
    xp_required     INT UNSIGNED NOT NULL,   -- XP needed to reach this level
    total_xp        INT UNSIGNED NOT NULL    -- cumulative XP at this level
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- SECTION 5: CHARACTERS (depends on game_classes, game_races, game_maps)
-- =================================================================

CREATE TABLE IF NOT EXISTS characters (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED NOT NULL,
    name            VARCHAR(64)  NOT NULL UNIQUE,
    class_id        INT UNSIGNED NOT NULL DEFAULT 1,
    race_id         INT UNSIGNED NOT NULL DEFAULT 1,
    background_id   INT UNSIGNED NOT NULL DEFAULT 0,
    feat_id         INT UNSIGNED NOT NULL DEFAULT 0,

    -- Core stats
    level           INT UNSIGNED NOT NULL DEFAULT 1,
    experience      INT UNSIGNED NOT NULL DEFAULT 0,
    current_hp      INT NOT NULL DEFAULT 100,
    max_hp          INT NOT NULL DEFAULT 100,
    current_mp      INT NOT NULL DEFAULT 50,
    max_mp          INT NOT NULL DEFAULT 50,
    atk             INT NOT NULL DEFAULT 10,
    def             INT NOT NULL DEFAULT 5,
    mo              INT NOT NULL DEFAULT 5,
    md              INT NOT NULL DEFAULT 5,
    speed           INT NOT NULL DEFAULT 10,
    luck            INT NOT NULL DEFAULT 5,

    -- Position
    map_id          INT UNSIGNED NOT NULL DEFAULT 1,
    x               INT NOT NULL DEFAULT 10,
    y               INT NOT NULL DEFAULT 10,

    -- Battle / progression
    limitbreak      FLOAT NOT NULL DEFAULT 0,
    breaklevel      INT NOT NULL DEFAULT 1,
    battle_record   JSON,           -- {W:0, L:0, T:0}
    status_effects  JSON,           -- active status effects in battle
    state_json      MEDIUMTEXT,     -- quest progress, flags, xp, progression points

    -- Respawn point: where the player wakes up after dying.
    -- Updated when they stand on a Binding Stone, inn, or SET_RESPAWN event.
    -- Defaults to map 1 centre so new characters always have a safe fallback.
    respawn_map_id  INT UNSIGNED NOT NULL DEFAULT 1,
    respawn_x       INT NOT NULL DEFAULT 10,
    respawn_y       INT NOT NULL DEFAULT 10,

    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_chars_user (user_id),
    INDEX idx_chars_map (map_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- SECTION 6: CHARACTER INVENTORY & EQUIPMENT
-- =================================================================

CREATE TABLE IF NOT EXISTS character_items (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    item_id         INT UNSIGNED NOT NULL,
    quantity        INT NOT NULL DEFAULT 1,
    UNIQUE KEY uniq_char_item (character_id, item_id),
    INDEX idx_items_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_equipment (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    slot_key        VARCHAR(32)  NOT NULL,
    item_id         INT UNSIGNED NOT NULL,
    UNIQUE KEY uniq_char_slot (character_id, slot_key),
    INDEX idx_equip_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_stats (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    stat_key        VARCHAR(64)  NOT NULL,
    current_value   INT NOT NULL DEFAULT 0,
    max_value       INT NOT NULL DEFAULT 0,
    UNIQUE KEY uniq_char_stat (character_id, stat_key),
    INDEX idx_stats_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- SECTION 7: BATTLES
-- =================================================================

CREATE TABLE IF NOT EXISTS game_battles (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    p1_char_id      INT UNSIGNED NOT NULL,
    p2_char_id      INT UNSIGNED NOT NULL,
    p1_user_id      INT UNSIGNED NOT NULL,
    p2_user_id      INT UNSIGNED NOT NULL,
    turn_char_id    INT UNSIGNED DEFAULT NULL,
    battle_mode     ENUM('1v1','PARTY') NOT NULL DEFAULT '1v1',
    status          ENUM('pending','active','complete','cancelled') NOT NULL DEFAULT 'pending',
    winner_char_id  INT UNSIGNED DEFAULT NULL,
    battle_log      JSON,
    access_token    VARCHAR(64) NULL,         -- random token; prevents ID enumeration attacks
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_battles_p1 (p1_char_id),
    INDEX idx_battles_p2 (p2_char_id),
    INDEX idx_battles_token (access_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =================================================================
-- PLAYER MAIL — Offline messaging system
-- Messages persist until deleted by recipient.
-- Optional gold attachment (paid on delivery, refunded if deleted unread).
-- =================================================================
CREATE TABLE IF NOT EXISTS character_mail (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sender_char_id      INT UNSIGNED NOT NULL,
    sender_name         VARCHAR(64)  NOT NULL,       -- denormalised for fast display
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
    INDEX idx_mail_sender (sender_char_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- SECTION 8: SOCIAL — FRIENDS, PARTIES, GUILDS
-- =================================================================

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

CREATE TABLE IF NOT EXISTS character_friends (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    requester_id    INT UNSIGNED NOT NULL,
    recipient_id    INT UNSIGNED NOT NULL,
    status          ENUM('pending','accepted','blocked') NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_friendship (requester_id, recipient_id),
    INDEX idx_friends_recipient (recipient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_parties (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    leader_id       INT UNSIGNED NOT NULL,
    name            VARCHAR(64) DEFAULT NULL,
    max_size        INT NOT NULL DEFAULT 4,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    disbanded_at    TIMESTAMP NULL,
    INDEX idx_parties_leader (leader_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_party_members (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    party_id        INT UNSIGNED NOT NULL,
    character_id    INT UNSIGNED NOT NULL,
    role            ENUM('LEADER','MEMBER') NOT NULL DEFAULT 'MEMBER',
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    joined_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at         TIMESTAMP NULL,
    UNIQUE KEY uniq_party_char (party_id, character_id),
    INDEX idx_party_members_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS guilds (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL UNIQUE,
    tag             VARCHAR(6)   NOT NULL,
    description     TEXT,
    emblem          VARCHAR(8)   DEFAULT '⚔️',
    leader_id       INT UNSIGNED NOT NULL,
    level           INT NOT NULL DEFAULT 1,
    xp              INT NOT NULL DEFAULT 0,
    gold_bank       INT NOT NULL DEFAULT 0,
    motd            TEXT,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    disbanded_at    TIMESTAMP NULL,
    INDEX idx_guilds_leader (leader_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS guild_members (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guild_id        INT UNSIGNED NOT NULL,
    character_id    INT UNSIGNED NOT NULL,
    rank            ENUM('LEADER','OFFICER','MEMBER') NOT NULL DEFAULT 'MEMBER',
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    joined_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at         TIMESTAMP NULL,
    contribution    INT NOT NULL DEFAULT 0,
    UNIQUE KEY uniq_guild_char (guild_id, character_id),
    INDEX idx_guild_members_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS guild_invites (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guild_id        INT UNSIGNED NOT NULL,
    inviter_id      INT UNSIGNED NOT NULL,  -- character id
    invitee_id      INT UNSIGNED NOT NULL,  -- character id
    status          ENUM('pending','accepted','declined','expired') NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 48 HOUR),
    UNIQUE KEY uniq_guild_invite (guild_id, invitee_id),
    INDEX idx_invites_invitee (invitee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- SECTION 9: TRADE LOG
-- =================================================================

CREATE TABLE IF NOT EXISTS character_trade_log (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    trade_id        VARCHAR(64) NOT NULL,
    initiator_id    INT UNSIGNED NOT NULL,
    receiver_id     INT UNSIGNED NOT NULL,
    items_json      JSON,
    gold_a          INT NOT NULL DEFAULT 0,
    gold_b          INT NOT NULL DEFAULT 0,
    completed_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_trade_initiator (initiator_id),
    INDEX idx_trade_receiver  (receiver_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- SECTION 10: LEGENDARY ARTIFACTS
-- =================================================================

CREATE TABLE IF NOT EXISTS legendary_artifacts (
    artifact_id         VARCHAR(64) NOT NULL PRIMARY KEY,
    name                VARCHAR(100) NOT NULL,
    type                VARCHAR(40) NOT NULL,
    rarity              ENUM('legendary','mythic','cosmic') NOT NULL DEFAULT 'legendary',
    theme               VARCHAR(60) DEFAULT NULL,
    description         TEXT,
    current_wielder_id  INT UNSIGNED DEFAULT NULL,
    total_kills         INT NOT NULL DEFAULT 0,
    kill_streak         INT NOT NULL DEFAULT 0,
    power_multiplier    DECIMAL(6,2) NOT NULL DEFAULT 1.00,
    decay_rate          DECIMAL(6,2) NOT NULL DEFAULT 0.02,
    last_bloodshed_at   DATETIME DEFAULT NULL,
    last_transfer_at    DATETIME DEFAULT NULL,
    is_dormant          TINYINT(1) NOT NULL DEFAULT 0,
    active_curses_json  JSON DEFAULT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_artifacts_wielder (current_wielder_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS artifact_powers (
    power_id        VARCHAR(64) NOT NULL PRIMARY KEY,
    artifact_id     VARCHAR(64) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    power_type      ENUM('passive','active','ultimate') NOT NULL DEFAULT 'passive',
    unlock_kills    INT NOT NULL DEFAULT 0,
    rank_max        INT NOT NULL DEFAULT 1,
    effect_json     JSON NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_powers_artifact (artifact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS artifact_lineage (
    lineage_id      VARCHAR(64) NOT NULL PRIMARY KEY,
    artifact_id     VARCHAR(64) NOT NULL,
    wielder_id      INT UNSIGNED NOT NULL,
    acquired_at     DATETIME NOT NULL,
    ended_at        DATETIME DEFAULT NULL,
    ended_reason    VARCHAR(50) DEFAULT NULL,
    INDEX idx_lineage_artifact (artifact_id),
    INDEX idx_lineage_wielder  (wielder_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS artifact_hunts (
    hunt_id         VARCHAR(64) NOT NULL PRIMARY KEY,
    artifact_id     VARCHAR(64) NOT NULL,
    hunter_id       INT UNSIGNED NOT NULL,
    target_id       INT UNSIGNED DEFAULT NULL,
    bounty_amount   INT NOT NULL DEFAULT 0,
    notes           TEXT,
    status          ENUM('active','claimed','expired') NOT NULL DEFAULT 'active',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMP DEFAULT NULL,
    INDEX idx_hunts_artifact (artifact_id),
    INDEX idx_hunts_hunter   (hunter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS artifact_shrines (
    shrine_id       VARCHAR(64) NOT NULL PRIMARY KEY,
    artifact_id     VARCHAR(64) NOT NULL,
    character_id    INT UNSIGNED NOT NULL,
    zone_id         VARCHAR(64) DEFAULT NULL,
    title           VARCHAR(128) NOT NULL,
    message         TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS artifact_pvp_kill_log (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    artifact_id     VARCHAR(64) NOT NULL,
    killer_id       INT UNSIGNED NOT NULL,
    victim_id       INT UNSIGNED NOT NULL,
    killed_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pvplog_artifact (artifact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS artifact_worship_log (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    artifact_id     VARCHAR(64) NOT NULL,
    character_id    INT UNSIGNED NOT NULL,
    shrine_id       VARCHAR(64) DEFAULT NULL,
    worshipped_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_worship_artifact (artifact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- SECTION 11: CONFIG TABLES
-- =================================================================

CREATE TABLE IF NOT EXISTS system_settings (
    setting_key     VARCHAR(128) NOT NULL PRIMARY KEY,
    setting_value   VARCHAR(512) NOT NULL DEFAULT '',
    description     TEXT,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS core_modules (
    module_key      VARCHAR(128) NOT NULL PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    enabled         TINYINT(1) NOT NULL DEFAULT 1,
    config_json     JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Quest progression config (used by progressionRoutes)
CREATE TABLE IF NOT EXISTS progression_config (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    key_name        VARCHAR(64) NOT NULL UNIQUE,
    value_json      JSON NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- SECTION 12: SEED DATA
-- Everything below must exist before the game is playable.
-- =================================================================

-- ── SYSTEM SETTINGS ──────────────────────────────────────────────
INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES
('max_characters_per_user', '3',      'How many characters each player can create'),
('enable_backgrounds',      'true',   'Show background selection on character creation'),
('enable_feats',            'true',   'Show feat selection on character creation'),
('enable_pvp',              'true',   'Allow PvP battles between players'),
('starting_gold',           '100',    'Gold given to new users on register'),
('xp_multiplier',           '1',      'Global XP gain multiplier'),
('gold_multiplier',         '1',      'Global gold gain multiplier'),
('server_name',             'Twisted Engine', 'Display name shown on the site'),
('max_party_size',          '4',      'Maximum players in a party'),
('max_guild_size',          '50',     'Maximum members in a guild');

-- ── EQUIP SLOTS ──────────────────────────────────────────────────
-- These slot_key values must match what game_items.slot contains.
INSERT IGNORE INTO game_equip_slots (slot_key, name, display_order, icon, allows_types) VALUES
('weapon',   'Weapon',      1,  '⚔️',  'WEAPON'),
('offhand',  'Off-Hand',    2,  '🛡️',  'ARMOR,WEAPON'),
('helmet',   'Helmet',      3,  '⛑️',  'HELMET'),
('chest',    'Chest',       4,  '🥋',  'ARMOR'),
('legs',     'Legs',        5,  '👖',  'ARMOR'),
('boots',    'Boots',       6,  '👢',  'BOOTS'),
('ring',     'Ring',        7,  '💍',  'ACCESSORY'),
('necklace', 'Necklace',    8,  '📿',  'ACCESSORY');


-- ================================================================
-- TABLES MERGED FROM MIGRATION FILES (previously missing from schema_FULL)
-- ================================================================

CREATE TABLE IF NOT EXISTS game_oghams (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    icon            VARCHAR(8)   DEFAULT '🩸',
    description     TEXT,
    lore_text       TEXT,                        -- flavour: "A carved prayer to..."
    rank            INT NOT NULL DEFAULT 1,      -- 1=Carved, 2=Inscribed, 3=Bloodbound
    base_ogham_id   INT UNSIGNED DEFAULT NULL,   -- NULL = this IS the rank-1 root
    -- What this Ogham grants when slotted:
    grant_skill_id  INT UNSIGNED DEFAULT NULL,   -- unlocks a skill while equipped
    element_attack  VARCHAR(64)  DEFAULT NULL,   -- adds this element to weapon attacks
    stat_bonus_json JSON         DEFAULT NULL,   -- e.g. {"atk":5,"mo":10}
    on_hit_status   VARCHAR(64)  DEFAULT NULL,   -- status name inflicted on hit
    on_hit_chance   INT          DEFAULT 20,     -- % chance to inflict
    -- Progression
    kills_to_rank_up INT         DEFAULT 50,     -- kills needed at this rank to advance
    INDEX idx_base (base_ogham_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_ogham_families (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL,
    icon            VARCHAR(8)   DEFAULT '🩸',
    description     TEXT,
    -- set_bonus_json: bonus applied when 2+ Oghams from same family equipped
    -- format: {"min_count":2, "stat_bonus":{"mo":15}, "element_attack":"dark",
    --          "on_hit_status":"Blind", "on_hit_chance":20, "label":"Void Walker"}
    set_bonus_json  JSON         DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_oghams (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    item_id         INT UNSIGNED NOT NULL,   -- the item these are carved into
    slot_index      INT NOT NULL DEFAULT 0,  -- groove position (0,1,2...)
    ogham_id        INT UNSIGNED NOT NULL,
    current_rank    INT NOT NULL DEFAULT 1,
    kill_count      INT NOT NULL DEFAULT 0,  -- kills since last rank-up
    UNIQUE KEY uniq_char_item_slot (character_id, item_id, slot_index),
    INDEX idx_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_event_log (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_type  VARCHAR(32)  NOT NULL,  -- 'battle_end','gm_ban','level_up','shop_buy','gm_give_gold',...
    actor_id    INT UNSIGNED DEFAULT NULL,  -- user_id or char_id depending on context
    actor_name  VARCHAR(128) DEFAULT NULL,
    target_id   INT UNSIGNED DEFAULT NULL,
    target_name VARCHAR(128) DEFAULT NULL,
    detail_json JSON         DEFAULT NULL, -- flexible payload
    map_id      INT UNSIGNED DEFAULT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_elog_type (event_type),
    INDEX idx_elog_actor (actor_id),
    INDEX idx_elog_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gm_notes (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    map_id     INT UNSIGNED DEFAULT NULL,
    author_id  INT UNSIGNED NOT NULL,
    author     VARCHAR(64)  NOT NULL,
    body       TEXT         NOT NULL,
    pinned     TINYINT(1)   NOT NULL DEFAULT 0,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_gmnotes_map (map_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_pvp_teams (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL UNIQUE,
    team_chars  JSON NOT NULL DEFAULT ('[]'),
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pvp_team_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── ELEMENTS ─────────────────────────────────────────────────────
INSERT IGNORE INTO game_elements (name, icon, color, strengths_json, weaknesses_json) VALUES
-- Fire beats Ice/Wind, weak to Water/Earth
('Fire',      '🔥', '#ff4400', '["Ice","Wind"]',       '["Water","Earth"]'),
-- Water beats Fire/Earth, weak to Lightning/Wind  
('Water',     '💧', '#0088ff', '["Fire","Earth"]',     '["Lightning","Wind"]'),
-- Earth beats Lightning/Fire, weak to Wind/Water
('Earth',     '🌍', '#884400', '["Lightning","Fire"]', '["Wind","Water"]'),
-- Wind beats Water/Earth, weak to Ice/Lightning
('Wind',      '💨', '#88cc88', '["Water","Earth"]',    '["Ice","Lightning"]'),
-- Lightning beats Water/Wind, weak to Earth/Ice
('Lightning', '⚡', '#ffcc00', '["Water","Wind"]',     '["Earth","Ice"]'),
-- Ice beats Wind/Water, weak to Fire/Lightning
('Ice',       '❄️', '#88ccff', '["Wind","Water"]',     '["Fire","Lightning"]'),
-- Light beats Dark, weak to Dark
('Light',     '✨', '#ffffaa', '["Dark"]',              '["Dark"]'),
-- Dark beats Light, weak to Light
('Dark',      '🌑', '#440044', '["Light"]',             '["Light"]'),
-- None has no element interactions
('None',      '⭕', '#888888', '[]',                   '[]');

-- ── BATTLE COMMANDS ──────────────────────────────────────────────
-- These are the default action buttons shown to every player in battle.
INSERT IGNORE INTO game_battle_commands (id, name, icon, description, action_type, target_type, is_default, display_order, effects) VALUES
(1, 'Attack', '⚔️', 'Deal physical damage to the enemy.',    'attack', 'ENEMY', 1, 1,
 '{"damage":{"formula":"ATK*2-DEF","randomize":0.15},"apply_weapon_elements":true,"apply_weapon_status":true,"log":"{name} attacks!"}'),
(2, 'Defend', '🛡️', 'Brace yourself — take half damage this turn.', 'defend', 'SELF',  1, 2,
 '{"set_status":{"target":"self","statuses":{"Defending":1}},"log":"{name} defends!"}'),
(3, 'Skills', '✨', 'Open the skill menu.',  'skills', 'MENU', 1, 3,
 '{"open_menu":"skills"}'),
(4, 'Items',  '🎒', 'Use a consumable item.', 'items',  'MENU', 1, 4,
 '{"open_menu":"items"}'),
(5, 'Limit',  '💥', 'Unleash your limit break (bar must be full).', 'limit', 'MENU', 1, 5,
 '{"open_menu":"limits"}'),
(6, 'Run',    '🏃', 'Attempt to flee the battle.',  'run',    'NONE', 1, 6,
 '{"flee":{"formula":"SPEED+LUCK*0.5-ENEMY_SPEED","log_success":"{name} escapes!","log_fail":"{name} couldn'"'"'t escape!"}}');


-- ── STATUS EFFECTS ────────────────────────────────────────────────
-- These are the in-battle status conditions referenced by skills,
-- weapons, and armor. The 'effects' JSON drives the battle engine.
-- default_duration is used when the applier doesn't specify turns.
INSERT IGNORE INTO game_statuses (id, name, icon, type, default_duration, permanent, description, effects, disabled_commands) VALUES
(1, 'Poison',    '🟣', 'debuff', 3, 0,
 'Drains HP each turn.',
 '{"damage_per_turn":{"formula":"MAXHP*0.05+5"},"log":"{name} is poisoned for "}',
 NULL),
(2, 'Defending', '🛡️', 'buff',   1, 0,
 'Reduces incoming damage by 50% this turn.',
 '{"stat_mod":{"def":2}}',
 NULL),
(3, 'Burn',      '🔥', 'debuff', 2, 0,
 'Fire damage each turn — higher but shorter than Poison.',
 '{"damage_per_turn":{"formula":"MAXHP*0.08+8"},"log":"{name} is burning!"}',
 NULL),
(4, 'Regen',     '💚', 'buff',   3, 0,
 'Restores HP each turn.',
 '{"heal_per_turn":{"formula":"MAXHP*0.06+10"},"log":"{name} regenerates."}',
 NULL),
(5, 'Blind',     '🌑', 'debuff', 2, 0,
 'Reduced accuracy — halves ATK.',
 '{"stat_mod":{"atk":0.5},"log":"{name} is blinded!"}',
 NULL),
(6, 'Stun',      '⚡', 'debuff', 1, 0,
 'Skip your next turn entirely.',
 '{"skip_turn":true,"log":"{name} is stunned and cannot act!"}',
 '[-1]'),
(7, 'ATK Up',    '⬆️', 'buff',   3, 0,
 'Increases ATK by 50%.',
 '{"stat_mod":{"atk":1.5},"log":"{name} is powered up!"}',
 NULL),
(8, 'DEF Down',  '⬇️', 'debuff', 2, 0,
 'Reduces enemy DEF by 40%.',
 '{"stat_mod":{"def":0.6},"log":"{name} defense is weakened!"}',
 NULL);

-- ── SKILLS ────────────────────────────────────────────────────────
-- Skills used by classes in combat.
-- 'effects' JSON drives the resolver: damage, heal, set_status, etc.
-- 'target_type': ENEMY (single target foe), SELF (apply to self), ALLY (party heal),
--                 ALL_ENEMIES (AoE hits every living enemy — full or split damage)
INSERT IGNORE INTO game_skills (id, name, icon, description, battle_text, type, target_type, effects) VALUES
-- ── WARRIOR SKILLS ──
(1, 'Mighty Strike', '⚔️',
 'A powerful physical blow that always ignores Defending.',
 '{name} winds up a devastating strike!',
 'physical', 'ENEMY',
 '{"damage":{"formula":"ATK*3-DEF","randomize":0.1},"log":"{name} strikes hard!"}'),

(2, 'War Cry', '📣',
 'A battle roar that raises your own ATK for 3 turns.',
 '{name} lets out a fearsome war cry!',
 'buff', 'SELF',
 '{"set_status":{"target":"self","statuses":{"ATK Up":3}}}'),

(3, 'Blade Rush', '🌀',
 'Chain of rapid slashes — lower per hit but ignores some DEF.',
 '{name} launches a flurry of blade strikes!',
 'physical', 'ENEMY',
 '{"damage":{"formula":"ATK*2.5","randomize":0.2}}'),

-- ── MAGE SKILLS ──
(4, 'Fireball', '🔥',
 'A blazing fireball with a chance to inflict Burn.',
 '{name} conjures a roaring fireball!',
 'magic', 'ENEMY',
 '{"damage":{"formula":"MO*2.5-MD","randomize":0.1},"elements":["fire"],"set_status":{"target":"enemy","chance":30,"statuses":{"Burn":2}}}'),

(5, 'Ice Shard', '❄️',
 'Shards of ice that slow the target (DEF Down).',
 '{name} launches a volley of ice shards!',
 'magic', 'ENEMY',
 '{"damage":{"formula":"MO*2-MD","randomize":0.05},"elements":["ice"],"set_status":{"target":"enemy","chance":40,"statuses":{"DEF Down":2}}}'),

(6, 'Thunder Strike', '⚡',
 'Lightning bolt with a chance to Stun.',
 '{name} calls down a bolt of lightning!',
 'magic', 'ENEMY',
 '{"damage":{"formula":"MO*3-MD","randomize":0.15},"elements":["lightning"],"set_status":{"target":"enemy","chance":25,"statuses":{"Stun":1}}}'),

(7, 'Arcane Missile', '🔮',
 'Pure arcane energy — no element, harder to resist.',
 '{name} fires a bolt of pure arcane power!',
 'magic', 'ENEMY',
 '{"damage":{"formula":"MO*2.2-MD*0.5","randomize":0.08}}'),

-- ── ROGUE SKILLS ──
(8, 'Backstab', '🗡️',
 'Strikes from the shadows — high crit chance, uses LUCK in formula.',
 '{name} lunges from the shadows!',
 'physical', 'ENEMY',
 '{"damage":{"formula":"ATK*2+LUCK*2-DEF","randomize":0.2}}'),

(9, 'Smoke Bomb', '💨',
 'Blinds the enemy for 2 turns, cutting their ATK in half.',
 '{name} hurls a smoke bomb!',
 'debuff', 'ENEMY',
 '{"set_status":{"target":"enemy","chance":90,"statuses":{"Blind":2}}}'),

(10, 'Poison Blade', '🟣',
 'A venomous strike that poisons the target.',
 '{name} coats their blade in venom!',
 'physical', 'ENEMY',
 '{"damage":{"formula":"ATK*1.5-DEF","randomize":0.1},"set_status":{"target":"enemy","chance":75,"statuses":{"Poison":3}}}'),

-- ── CLERIC SKILLS ──
(11, 'Heal', '💚',
 'Restores a moderate amount of your own HP.',
 '{name} channels holy energy!',
 'heal', 'SELF',
 '{"heal":{"formula":"MO*3+50"}}'),

(12, 'Holy Light', '✨',
 'A burst of holy light that damages undead and cures Poison.',
 '{name} calls down a ray of holy light!',
 'magic', 'ENEMY',
 '{"damage":{"formula":"MO*2.2-MD","randomize":0.1},"elements":["holy"]}'),

(13, 'Regen', '🌿',
 'Applies a regeneration buff to yourself for 3 turns.',
 '{name} blesses themselves with regeneration!',
 'buff', 'SELF',
 '{"set_status":{"target":"self","statuses":{"Regen":3}}}'),

(14, 'Smite', '⚡',
 'A powerful divine strike — scales with both ATK and MO.',
 '{name} strikes with divine fury!',
 'magic', 'ENEMY',
 '{"damage":{"formula":"(ATK+MO)*1.5-DEF","randomize":0.1},"elements":["holy"]}');

-- ── CLASS → SKILL ASSIGNMENTS ─────────────────────────────────────
-- Links skills to classes with level requirements and MP costs.
-- learn_level: minimum character level to see this skill in battle.
-- mp_cost: can override the skill's default (NULL = use skill default).
INSERT IGNORE INTO game_class_skills (class_id, skill_id, learn_level, mp_cost) VALUES
-- Warrior (class 1)
(1,  1,  1, 8),   -- Mighty Strike at level 1,  8 MP
(1,  2,  5, 12),  -- War Cry        at level 5, 12 MP
(1,  3, 10, 15),  -- Blade Rush     at level 10, 15 MP
-- Mage (class 2)
(2,  4,  1, 10),  -- Fireball       at level 1, 10 MP
(2,  7,  3, 8),   -- Arcane Missile at level 3,  8 MP
(2,  5,  6, 12),  -- Ice Shard      at level 6, 12 MP
(2,  6, 12, 18),  -- Thunder Strike at level 12, 18 MP
-- Rogue (class 3)
(3,  8,  1, 6),   -- Backstab       at level 1,  6 MP
(3,  9,  4, 8),   -- Smoke Bomb     at level 4,  8 MP
(3, 10,  8, 10),  -- Poison Blade   at level 8, 10 MP
-- Cleric (class 4)
(4, 11,  1, 10),  -- Heal           at level 1, 10 MP
(4, 13,  4, 12),  -- Regen          at level 4, 12 MP
(4, 12,  6, 14),  -- Holy Light     at level 6, 14 MP
(4, 14, 10, 16);  -- Smite          at level 10, 16 MP

-- ── LIMIT BREAKS ──────────────────────────────────────────────────
-- Each class gets one limit break per break_level tier.
-- char_level_req = minimum level to unlock this limit.
-- effects JSON drives the battle resolver same as skills.
INSERT IGNORE INTO game_limit_breaks (id, name, icon, description, class_id, break_level, char_level_req, target_type, effects) VALUES
-- Warrior
(1, 'Blade Rush',        '⚔️', 'A desperate flurry of strikes dealing massive physical damage.',
 1, 1, 1, 'ENEMY',
 '{"damage":{"formula":"ATK*5-DEF","randomize":0.15},"log":"{name} unleashes Blade Rush!"}'),
(2, 'Earthquake',        '🌍', 'Slams the ground with incredible force, ignoring all defense.',
 1, 2, 15, 'ENEMY',
 '{"damage":{"formula":"ATK*7","randomize":0.1},"log":"{name} strikes the earth with Earthquake!"}'),
-- Mage
(3, 'Arcane Explosion',  '🔮', 'A supernova of raw magic that obliterates defenses.',
 2, 1, 1, 'ENEMY',
 '{"damage":{"formula":"MO*6-MD*0.5","randomize":0.1},"elements":["arcane"],"log":"{name} detonates an Arcane Explosion!"}'),
(4, 'Meltdown',          '☀️', 'Solar flare magic that Burns the target for 4 turns.',
 2, 2, 15, 'ENEMY',
 '{"damage":{"formula":"MO*5","randomize":0.1},"elements":["fire"],"set_status":{"target":"enemy","chance":100,"statuses":{"Burn":4}},"log":"{name} triggers a Meltdown!"}'),
-- Rogue
(5, 'Shadow Storm',      '🌑', 'A storm of shadow strikes too fast to defend against.',
 3, 1, 1, 'ENEMY',
 '{"damage":{"formula":"ATK*4+LUCK*3","randomize":0.2},"log":"{name} unleashes Shadow Storm!"}'),
(6, 'Death Mark',        '💀', 'Marks the enemy — poisons and blinds them.',
 3, 2, 15, 'ENEMY',
 '{"damage":{"formula":"ATK*3+LUCK*2","randomize":0.15},"set_status":{"target":"enemy","chance":100,"statuses":{"Poison":5,"Blind":3}},"log":"{name} places a Death Mark!"}'),
-- Cleric
(7, 'Divine Intervention','✝️', 'A burst of holy light heals you and smites the enemy.',
 4, 1, 1, 'ENEMY',
 '{"damage":{"formula":"(ATK+MO)*3","randomize":0.1},"elements":["holy"],"heal":{"formula":"MAXHP*0.3"},"log":"{name} calls for Divine Intervention!"}'),
(8, 'Apocalypse',        '☁️', 'Rains divine judgment — massive holy damage.',
 4, 2, 15, 'ENEMY',
 '{"damage":{"formula":"MO*6+ATK*2","randomize":0.08},"elements":["holy"],"log":"{name} calls down Apocalypse!"}');

-- ── GAME CLASSES ─────────────────────────────────────────────────
INSERT IGNORE INTO game_classes (id, name, description, icon, base_hp, base_mp, base_atk, base_def, base_mo, base_md, base_speed, base_luck) VALUES
(1, 'Warrior',  'Masters of physical combat. High HP and ATK, low magic.', '⚔️', 150, 30, 18, 12, 5,  8,  12, 5),
(2, 'Mage',     'Wielders of arcane power. High MP and MO, fragile body.',  '🔮', 80,  120, 6, 5,  20, 15, 9,  8),
(3, 'Rogue',    'Swift and deadly. High speed and luck, moderate stats.',    '🗡️', 100, 60,  14, 8,  8,  10, 18, 15),
(4, 'Cleric',   'Holy warriors who heal and defend. Balanced magic/phys.',  '✝️', 120, 90,  10, 10, 14, 14, 10, 10);

-- ── GAME RACES ───────────────────────────────────────────────────
INSERT IGNORE INTO game_races (id, name, description, icon, bonus_hp, bonus_mp, bonus_atk, bonus_def, bonus_speed, bonus_luck) VALUES
(1, 'Human',  'Adaptable and determined. Balanced across all stats.',    '👤', 0,   0,  0,  0,  0,  5),
(2, 'Elf',    'Graceful and intelligent. Bonus MP and speed.',           '🧝', -10, 20, -2, -2, 3,  3),
(3, 'Dwarf',  'Sturdy and tough. Bonus HP and DEF, reduced speed.',      '🪨', 20,  -10, 3, 5, -3,  0),
(4, 'Orc',    'Savage and powerful. High ATK and HP, low MD and luck.',  '👹', 30,  -20, 5, 2, -2, -5);

-- ── BACKGROUNDS ──────────────────────────────────────────────────
INSERT IGNORE INTO game_backgrounds (id, name, description, bonus_hp, bonus_mp, bonus_str) VALUES
(1, 'Soldier',   'Trained in the army. Extra HP from physical conditioning.',   20, 0,  '+20 HP'),
(2, 'Scholar',   'Years of study grant extra MP and magical insight.',          0,  20, '+20 MP'),
(3, 'Street Rat','Surviving on the streets taught resourcefulness.',            10, 10, '+10 HP/MP'),
(4, 'Noble',     'A privileged upbringing. No stat bonus but high standing.',   0,  0,  'None');

-- ── FEATS ────────────────────────────────────────────────────────
INSERT IGNORE INTO game_feats (id, name, description, effect_json) VALUES
(1, 'Iron Skin',    'Your skin is tougher than it looks. Start with more DEF.', '{"bonus_def": 3}'),
(2, 'Quick Feet',   'Born with unnatural speed. +3 SPEED.',                     '{"bonus_speed": 3}'),
(3, 'Lucky Strike', 'Fortune favours you. +5 LUCK.',                            '{"bonus_luck": 5}'),
(4, 'Arcane Gift',  'Natural magic affinity. +10 MP.',                          '{"bonus_mp": 10}');

-- ── STARTING MAP ─────────────────────────────────────────────────
-- A simple 20x20 map. 0=floor, 1=wall.
-- Walls around the border, floor inside.
INSERT IGNORE INTO game_maps (id, name, description, width, height, tiles_json, fast_travel_enabled, min_level) VALUES
(1, 'Town Square', 'The central meeting place of the starting town. A fountain bubbles in the middle.',
 20, 20,
 '[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,2,2,2,0,0,2,2,2,0,0,0,0,0,1,1,0,0,0,0,0,2,3,2,0,0,2,3,2,0,0,0,0,0,1,1,0,0,0,0,0,2,2,2,0,0,2,2,2,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,4,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,2,2,2,0,0,2,2,2,0,0,0,0,0,1,1,0,0,0,0,0,2,3,2,0,0,2,3,2,0,0,0,0,0,1,1,0,0,0,0,0,2,2,2,0,0,2,2,2,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]',
 1, 1);

-- ── LEVEL REQUIREMENTS (levels 1-60) ─────────────────────────────
-- Formula: xp_required = floor(level^2.3 * 100)
INSERT IGNORE INTO level_requirements (level, xp_required, total_xp) VALUES
(1,   0,      0),
(2,   200,    200),
(3,   457,    657),
(4,   779,    1436),
(5,   1172,   2608),
(6,   1637,   4245),
(7,   2174,   6419),
(8,   2785,   9204),
(9,   3468,   12672),
(10,  4225,   16897),
(11,  5055,   21952),
(12,  5957,   27909),
(13,  6932,   34841),
(14,  7979,   42820),
(15,  9098,   51918),
(16,  10289,  62207),
(17,  11551,  73758),
(18,  12884,  86642),
(19,  14287,  100929),
(20,  15761,  116690),
(21,  17305,  133995),
(22,  18919,  152914),
(23,  20602,  173516),
(24,  22353,  195869),
(25,  24173,  220042),
(26,  26061,  246103),
(27,  28017,  274120),
(28,  30040,  304160),
(29,  32130,  336290),
(30,  34286,  370576),
(31,  36508,  407084),
(32,  38796,  445880),
(33,  41148,  487028),
(34,  43566,  530594),
(35,  46048,  576642),
(36,  48595,  625237),
(37,  51204,  676441),
(38,  53877,  730318),
(39,  56613,  786931),
(40,  59411,  846342),
(41,  62271,  908613),
(42,  65193,  973806),
(43,  68176,  1041982),
(44,  71220,  1113202),
(45,  74325,  1187527),
(46,  77491,  1265018),
(47,  80717,  1345735),
(48,  84002,  1429737),
(49,  87348,  1517085),
(50,  90752,  1607837),
(51,  100000, 1707837),
(52,  110000, 1817837),
(53,  121000, 1938837),
(54,  133100, 2071937),
(55,  146410, 2218347),
(56,  161051, 2379398),
(57,  177156, 2556554),
(58,  194871, 2751425),
(59,  214358, 2965783),
(60,  999999, 3965782);

-- ── SAMPLE ITEMS ─────────────────────────────────────────────────
INSERT IGNORE INTO game_items (id, name, description, type, icon, slot, value, bonus_atk, bonus_def, bonus_hp, bonus_mp) VALUES
(1, 'Iron Sword',      'A reliable iron sword. Standard issue.',          'WEAPON',     '⚔️',  'weapon',  50, 8,  0,  0,  0),
(2, 'Leather Armor',   'Basic leather armor. Better than nothing.',       'ARMOR',      '🥋',  'chest',   40, 0,  5,  0,  0),
(3, 'Health Potion',   'Restores 50 HP when used.',                       'CONSUMABLE', '🧪',  NULL,      30, 0,  0,  0,  0),
(4, 'Mana Potion',     'Restores 30 MP when used.',                       'CONSUMABLE', '💙',  NULL,      25, 0,  0,  0,  0),
(5, 'Bronze Shield',   'A round bronze shield. Absorbs some damage.',     'ARMOR',      '🛡️',  'offhand', 60, 0,  8,  0,  0),
(6, 'Wizard Staff',    'A gnarled staff pulsing with arcane energy.',     'WEAPON',     '🪄',  'weapon',  80, 3, 0,   0,  20),
(7, 'Iron Helmet',     'Protects your head. Slightly uncomfortable.',     'HELMET',     '⛑️',  'helmet',  35, 0,  4,  10, 0),
(8, 'Ring of Vitality','A warm ring. Glows faintly. +20 HP.',             'ACCESSORY',  '💍',  'ring',    120, 0, 0,  20, 0);

-- Update consumable stats_json
UPDATE game_items SET stats_json = '{"heal_hp": 50}' WHERE id = 3;
UPDATE game_items SET stats_json = '{"restore_mp": 30}' WHERE id = 4;

-- ── SAMPLE SHOP ──────────────────────────────────────────────────
INSERT IGNORE INTO game_shops (id, name, description, icon) VALUES
(1, 'General Store', 'Your one-stop shop for adventuring basics.', '🏪');

INSERT IGNORE INTO game_shop_supplies (shop_id, item_id, buy_price, stock) VALUES
(1, 3, 30,  -1),  -- Health Potion, unlimited
(1, 4, 25,  -1),  -- Mana Potion, unlimited
(1, 1, 50,  10),  -- Iron Sword, limited
(1, 2, 40,  10);  -- Leather Armor, limited

-- ── CORE MODULES (feature flags) ─────────────────────────────────
INSERT IGNORE INTO core_modules (module_key, name, description, enabled) VALUES
('guilds',       'Guilds',       'Player-run guilds and guild management.',  1),
('parties',      'Parties',      'Group up with other players.',             1),
('trade',        'Trading',      'Player-to-player item trading.',           1),
('pvp',          'PvP Combat',   'Player vs player battles.',                1),
('quests',       'Quests',       'Quest log and progression system.',        1),
('artifacts',    'Artifacts',    'Legendary artifact system.',               0),
('world_map',    'World Map',    'Fast travel between maps.',                1),
('achievements', 'Achievements', 'Achievement tracking system.',             0);

SET FOREIGN_KEY_CHECKS = 1;

-- =================================================================
-- DONE.
-- Next steps:
--   1. Copy .env.example to .env, fill in DB credentials + SESSION_SECRET
--   2. npm install
--   3. node server.js
--   4. Register at http://localhost:3000
--   5. Manually set your user role to ADMIN in MySQL:
--        UPDATE users SET role='ADMIN' WHERE username='yourname';
--   6. Go to /adminsauce to build your world!
-- =================================================================

-- ================================================================
-- CRAFTING SYSTEM
-- ================================================================
-- game_craft_recipes: defines how to make any item from ingredients.
--   result_item_id   = the item produced
--   result_qty       = how many you get per craft
--   level_req        = minimum character level to craft
--   skill_req        = optional skill name required (e.g. "Blacksmithing")
--   category         = 'WEAPON' | 'ARMOR' | 'POTION' | 'MISC' etc.
--   ingredients_json = [{"item_id":N,"qty":M}, ...] — what gets consumed
--   unlock_mode      = 'ALWAYS' (anyone can see it) | 'LEARNED' (must discover/buy recipe)
CREATE TABLE IF NOT EXISTS game_craft_recipes (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    category        VARCHAR(32)  NOT NULL DEFAULT 'MISC',
    result_item_id  INT UNSIGNED NOT NULL,
    result_qty      INT NOT NULL DEFAULT 1,
    level_req       INT NOT NULL DEFAULT 1,
    skill_req       VARCHAR(64)  DEFAULT NULL,
    ingredients_json JSON         NOT NULL,
    unlock_mode     ENUM('ALWAYS','LEARNED') NOT NULL DEFAULT 'ALWAYS',
    description     TEXT,
    icon            VARCHAR(8)   DEFAULT '🔨',
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    INDEX idx_recipe_category (category),
    INDEX idx_recipe_result   (result_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- character_learned_recipes: tracks which LEARNED recipes a player knows.
-- ALWAYS recipes don't need a row here — they're visible to everyone.
CREATE TABLE IF NOT EXISTS character_learned_recipes (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    recipe_id       INT UNSIGNED NOT NULL,
    learned_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_char_recipe (character_id, recipe_id),
    INDEX idx_learned_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ================================================================
-- SYSTEM 1: WORLD FLAG HOOKS — spawn conditions + shop modifiers
-- ================================================================
-- Adds world_flag_conditions to spawns (JSON array: conditions that must
-- ALL be true for this spawn to be active at runtime).
-- Adds world_flag_conditions + flag_price_modifiers to shop supplies.
ALTER TABLE game_map_spawns
  ADD COLUMN IF NOT EXISTS world_flag_conditions JSON DEFAULT NULL
    COMMENT 'e.g. [{"flag":"war_started","op":"==","value":"true"}] — all must pass';

ALTER TABLE game_shop_supplies
  ADD COLUMN IF NOT EXISTS world_flag_conditions JSON DEFAULT NULL
    COMMENT 'Item hidden from shop unless all conditions pass';
ALTER TABLE game_shop_supplies
  ADD COLUMN IF NOT EXISTS flag_price_modifiers JSON DEFAULT NULL
    COMMENT 'e.g. [{"flag":"festival_active","multiplier":0.8}] — multiplies buy price';

-- ================================================================
-- SYSTEM 2: SCHEDULED TASK ENGINE
-- ================================================================
CREATE TABLE IF NOT EXISTS game_scheduled_tasks (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    task_type       ENUM(
                        'SHOP_RESTOCK',      -- reset stock to default on all/one shop
                        'SPAWN_RESPAWN',     -- force-respawn all enemies on a map
                        'DUNGEON_RESET',     -- teleport all players out + respawn enemies
                        'SET_WORLD_FLAG',    -- set a world flag to a value
                        'SET_REGION_STATE',  -- update region modifiers at runtime
                        'GIVE_XP_ALL',       -- give XP to all online players
                        'BROADCAST'          -- send a server message to all players
                    ) NOT NULL,
    schedule_type   ENUM('HOURLY','DAILY','WEEKLY','INTERVAL_MINUTES') NOT NULL DEFAULT 'DAILY',
    -- For DAILY: run_at_hour (0-23). For WEEKLY: run_at_day (0=Sun,1=Mon...) + run_at_hour.
    -- For INTERVAL_MINUTES: interval_minutes. For HOURLY: runs every hour at :00.
    run_at_hour     TINYINT UNSIGNED DEFAULT 0,
    run_at_day      TINYINT UNSIGNED DEFAULT 1,
    interval_minutes INT UNSIGNED DEFAULT 60,
    -- Target: interpretation depends on task_type
    -- SHOP_RESTOCK: target_id = shop_id (NULL = all shops)
    -- SPAWN_RESPAWN/DUNGEON_RESET: target_id = map_id (NULL = all maps)
    -- SET_WORLD_FLAG: config_json = {"flag":"key","value":"val"}
    -- GIVE_XP_ALL: config_json = {"amount":100}
    -- BROADCAST: config_json = {"message":"Server restart in 10 min"}
    target_id       INT UNSIGNED DEFAULT NULL,
    config_json     JSON DEFAULT NULL,
    last_run_at     DATETIME DEFAULT NULL,
    is_enabled      TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sched_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed some example tasks
INSERT IGNORE INTO game_scheduled_tasks (id, name, task_type, schedule_type, run_at_hour, is_enabled) VALUES
(1, 'Daily Shop Restock', 'SHOP_RESTOCK', 'DAILY', 6, 1),
(2, 'Midnight Dungeon Reset', 'DUNGEON_RESET', 'DAILY', 0, 1);

-- ================================================================
-- SYSTEM 3: AUCTION HOUSE
-- ================================================================
CREATE TABLE IF NOT EXISTS auction_listings (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    seller_char_id  INT UNSIGNED NOT NULL,
    seller_name     VARCHAR(64)  NOT NULL,
    item_id         INT UNSIGNED NOT NULL,
    quantity        INT NOT NULL DEFAULT 1,
    buyout_price    INT NOT NULL,           -- immediate purchase price
    current_bid     INT NOT NULL DEFAULT 0, -- 0 = no bids yet
    min_bid         INT NOT NULL DEFAULT 0, -- minimum bid increment (can be 0)
    bidder_char_id  INT UNSIGNED DEFAULT NULL,
    bidder_name     VARCHAR(64)  DEFAULT NULL,
    expires_at      DATETIME NOT NULL,
    status          ENUM('ACTIVE','SOLD_BUYOUT','SOLD_BID','EXPIRED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_auction_status   (status),
    INDEX idx_auction_item     (item_id),
    INDEX idx_auction_seller   (seller_char_id),
    INDEX idx_auction_expires  (expires_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Auction house settings (editable via AdminSauce Settings)
INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES
('auction_listing_fee_pct',  '5',    'Percentage of buyout price charged to list an item (non-refundable)'),
('auction_sale_tax_pct',     '5',    'Percentage taken from sale price when item sells'),
('auction_max_listings',     '10',   'Max active listings per character'),
('auction_duration_hours',   '48',   'Default listing duration in hours'),
('auction_enabled',          'true', 'Enable the auction house');

-- ── AI BRAIN SETTINGS ─────────────────────────────────────────────
-- These control the NPC AI provider from AdminSauce → Settings → AI Brain.
-- Set ai_provider to your provider and paste your api key.
-- The server re-reads these every 60 seconds with no restart needed.
INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES
('ai_provider',      'disabled',   'NPC AI provider: disabled | gemini | anthropic | openai | ollama'),
('ai_api_key',       '',           'API key for Gemini, Anthropic, or OpenAI. Store securely.'),
('ai_model',         '',           'Model name override. Leave blank to use provider default.'),
('ai_base_url',      '',           'Base URL for Ollama or OpenAI-compatible endpoints'),
('ai_temperature',   '0.85',       'AI creativity 0.0 (robotic) to 1.0 (chaotic). 0.85 recommended.'),
('ai_max_tokens',    '256',        'Max tokens per NPC reply. 256 = 1-3 sentences.'),
('ai_system_prompt', '',           'World context injected into every NPC prompt. Blank = Celtic dark fantasy default.');

-- ================================================================
-- SYSTEM: REGIONS + REGIONAL STATE
-- ================================================================
-- A region groups one or more maps and holds runtime modifier state.
-- Modifiers affect XP, gold, loot chance, shop prices, spawn rate,
-- PvP rules, weather, and faction control. These are the levers that
-- make areas of the world feel different from one another.
--
-- TEACHING: Think of regions as the "local rules" layer that sits
-- between global world flags (server-wide) and individual map data
-- (geometry). You can have 50 maps but only 8 regions. A dungeon
-- cluster, a city district, a war front — each is one region.

CREATE TABLE IF NOT EXISTS game_regions (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(128) NOT NULL,
    description         TEXT,
    icon                VARCHAR(8)   DEFAULT '🗺️',
    -- Runtime modifiers (all multiplicative unless noted)
    danger_level        TINYINT UNSIGNED NOT NULL DEFAULT 1,   -- 1=safe, 5=lethal
    corruption_level    TINYINT UNSIGNED NOT NULL DEFAULT 0,   -- 0=clean, 5=corrupted
    faction_control     VARCHAR(64)  DEFAULT NULL,  -- faction name that controls this region
    weather_override    VARCHAR(32)  DEFAULT NULL,  -- CLEAR|RAIN|STORM|FOG|BLIZZARD|BLOOD_MOON
    -- Multipliers (stored as decimal: 1.0 = normal, 1.5 = +50%, 0.8 = -20%)
    xp_mult             DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    gold_mult           DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    loot_mult           DECIMAL(4,2) NOT NULL DEFAULT 1.00,    -- multiplies drop chance
    spawn_rate_mult     DECIMAL(4,2) NOT NULL DEFAULT 1.00,    -- multiplies encounter_rate
    shop_price_mult     DECIMAL(4,2) NOT NULL DEFAULT 1.00,    -- multiplies buy price
    -- Flags
    pvp_enabled         TINYINT(1)   NOT NULL DEFAULT 0,
    is_sanctuary        TINYINT(1)   NOT NULL DEFAULT 0,       -- no combat allowed
    movement_penalty    TINYINT(1)   NOT NULL DEFAULT 0,       -- slow movement (future)
    -- Freeform tag set for quests/events to query
    active_tags_json    JSON DEFAULT NULL,  -- e.g. ["siege","undead_surge","famine"]
    -- World-flag auto-rules: if all conditions pass, apply an override config
    auto_rules_json     JSON DEFAULT NULL,
    -- TEACHING: auto_rules_json is an array of rule objects:
    -- [{ "conditions": [...], "apply": { "danger_level": 4, "weather_override": "STORM" } }]
    -- The scheduler or flag changes trigger a re-evaluation.
    is_active           TINYINT(1)   NOT NULL DEFAULT 1,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Map → Region assignment (a map belongs to one region)
ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS region_id INT UNSIGNED DEFAULT NULL;

-- NPC patrol paths
ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS patrol_path_json JSON DEFAULT NULL
    COMMENT 'Array of {x,y,pause_ticks?} waypoints for PATROL move_type';

-- Quest gating conditions
ALTER TABLE quest_definitions ADD COLUMN IF NOT EXISTS condition_json JSON DEFAULT NULL
    COMMENT 'e.g. {"min_region_danger":2, "requires_flags":["siege_active"], "region_id":3}';
ALTER TABLE quest_definitions ADD COLUMN IF NOT EXISTS region_id INT UNSIGNED DEFAULT NULL
    COMMENT 'If set, quest is only offered by NPCs in this region';
ALTER TABLE game_quests ADD COLUMN IF NOT EXISTS condition_json JSON DEFAULT NULL;
ALTER TABLE game_quests ADD COLUMN IF NOT EXISTS region_id INT UNSIGNED DEFAULT NULL;

-- Quest board: auto-generated and event-driven quests surfaced to players
CREATE TABLE IF NOT EXISTS game_quest_board (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(120) NOT NULL,
    description     TEXT,
    quest_type      ENUM('BOARD','EVENT','FACTION','REGIONAL') NOT NULL DEFAULT 'BOARD',
    region_id       INT UNSIGNED DEFAULT NULL,  -- NULL = available everywhere
    faction         VARCHAR(64)  DEFAULT NULL,
    -- Trigger conditions (world flags + region state)
    requires_flags_json  JSON DEFAULT NULL,  -- all must be true
    requires_region_json JSON DEFAULT NULL,  -- e.g. {"min_danger":2,"faction":"undead"}
    -- Objectives + rewards (same format as game_quests)
    objectives_json JSON NOT NULL,
    rewards_json    JSON NOT NULL,
    -- Availability window
    expires_at      DATETIME DEFAULT NULL,   -- NULL = permanent
    max_completions INT UNSIGNED DEFAULT NULL,  -- NULL = unlimited
    times_completed INT UNSIGNED NOT NULL DEFAULT 0,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_board_region (region_id),
    INDEX idx_board_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed a default region
INSERT IGNORE INTO game_regions (id, name, description, icon, is_active) VALUES
(1, 'Starter Lands', 'The peaceful starting area. Safe, low rewards.', '🌿', 1),
(2, 'Ashwood Frontier', 'Dangerous frontier. High risk, high reward.', '🌑', 1);

-- Scheduler: add SET_REGION_STATE task type
-- (We add it via the existing ENUM expansion in migrate script)

-- =================================================================
-- v21.1: ACHIEVEMENTS, TITLES, REFERRALS
-- =================================================================

-- Achievement definitions (configured in AdminSauce)
CREATE TABLE IF NOT EXISTS game_achievements (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    key_name        VARCHAR(64)  NOT NULL UNIQUE,  -- 'first_blood', 'centurion', etc.
    title           VARCHAR(64)  NOT NULL,          -- display name
    description     TEXT,
    icon            VARCHAR(16)  NOT NULL DEFAULT '🏆',
    category        ENUM('combat','social','exploration','progression','other') NOT NULL DEFAULT 'other',
    -- Trigger: what event earns this. Checked server-side.
    trigger_type    ENUM('pvp_wins','pve_wins','quests_done','maps_visited','level_reached',
                         'manual','login_streak','gold_owned','battles_total') NOT NULL DEFAULT 'manual',
    trigger_value   INT UNSIGNED NOT NULL DEFAULT 1,  -- e.g. 100 for Centurion (100 PvP wins)
    -- Reward on earn
    reward_gold     INT UNSIGNED NOT NULL DEFAULT 0,
    reward_title    VARCHAR(64)  NULL,               -- shown in chat: [Title] PlayerName
    -- Display
    is_hidden       TINYINT(1)   NOT NULL DEFAULT 0, -- hidden until earned (mystery achievement)
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    sort_order      INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Player-earned achievements
CREATE TABLE IF NOT EXISTS character_achievements (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    achievement_id  INT UNSIGNED NOT NULL,
    earned_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_char_achiev (character_id, achievement_id),
    INDEX idx_ca_char (character_id),
    INDEX idx_ca_achiev (achievement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed starter achievements
INSERT IGNORE INTO game_achievements
    (key_name, title, description, icon, category, trigger_type, trigger_value, reward_gold, reward_title, sort_order)
VALUES
    ('first_blood',   'First Blood',    'Win your first PvP battle.',            '🩸', 'combat',      'pvp_wins',      1,   100, 'Bloodied',    1),
    ('centurion',     'Centurion',      'Win 100 PvP battles.',                  '⚔️', 'combat',      'pvp_wins',      100, 500, 'Centurion',   2),
    ('warlord',       'Warlord',        'Win 500 PvP battles.',                  '🗡️', 'combat',      'pvp_wins',      500, 1000,'Warlord',     3),
    ('monster_slayer','Monster Slayer', 'Win 50 PvE battles.',                   '👹', 'combat',      'pve_wins',      50,  200, 'Slayer',      4),
    ('legend',        'Living Legend',  'Win 1000 PvE battles.',                 '🌟', 'combat',      'pve_wins',      1000,1000,'Legend',      5),
    ('wanderer',      'Wanderer',       'Discover 5 different maps.',            '🗺️', 'exploration', 'maps_visited',  5,   150, 'Wanderer',    6),
    ('explorer',      'Grand Explorer', 'Discover 15 different maps.',           '🧭', 'exploration', 'maps_visited',  15,  400, 'Explorer',    7),
    ('questling',     'Questling',      'Complete your first quest.',            '📜', 'progression', 'quests_done',   1,   50,  NULL,          8),
    ('hero',          'Hero',           'Complete 25 quests.',                   '🦸', 'progression', 'quests_done',   25,  300, 'Hero',        9),
    ('max_level',     'Ascendant',      'Reach max level.',                      '💎', 'progression', 'level_reached', 99,  2000,'Ascendant',  10),
    ('week_streak',   'Devoted',        'Log in 7 days in a row.',               '📅', 'social',      'login_streak',  7,   300, 'Devoted',    11),
    ('rich',          'Gilded',         'Accumulate 10,000 gold.',               '💰', 'other',       'gold_owned',    10000,0,  'Gilded',     12);

-- Title selection on character (which earned title to display)
ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS equipped_title VARCHAR(64) NULL
        COMMENT 'The title shown in chat next to this character name';

-- Referral system columns on users
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS invite_code   VARCHAR(16)  NULL UNIQUE COMMENT 'This user invite code',
    ADD COLUMN IF NOT EXISTS referred_by   INT UNSIGNED NULL COMMENT 'user.id of who referred them',
    ADD COLUMN IF NOT EXISTS referral_paid TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 once referral reward was given';


-- =================================================================
-- v21.2: AWAY STATUS, PROFILE CUSTOMIZATION, GUILD BANK
-- =================================================================

-- Profile customization columns on characters
ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS profile_bio          TEXT            NULL COMMENT 'Player-written bio shown on profile page',
    ADD COLUMN IF NOT EXISTS profile_color        VARCHAR(7)      NOT NULL DEFAULT '#bb86fc' COMMENT 'Accent color (hex)',
    ADD COLUMN IF NOT EXISTS profile_banner_emoji VARCHAR(8)      NOT NULL DEFAULT '⚔️' COMMENT 'Large decorative emoji on banner',
    ADD COLUMN IF NOT EXISTS profile_favorite_quote TEXT          NULL,
    ADD COLUMN IF NOT EXISTS spotify_track_url    VARCHAR(512)    NULL COMMENT 'Spotify share URL — shown on profile',
    ADD COLUMN IF NOT EXISTS spotify_track_name   VARCHAR(256)    NULL COMMENT 'Track display name',
    ADD COLUMN IF NOT EXISTS spotify_artist_name  VARCHAR(256)    NULL COMMENT 'Artist display name',
    ADD COLUMN IF NOT EXISTS equipped_title       VARCHAR(64)     NULL COMMENT 'Title shown in chat next to name';

-- Away / presence status: stored on the session (onlinePlayers) and persisted
-- to the characters row so the profile page can show last status.
-- TEACHING: We store this on the CHARACTER (not user) so a player with multiple
-- characters can have different statuses per character.
ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS presence_status      ENUM('online','away','busy','lfp','invisible')
                                                  NOT NULL DEFAULT 'online',
    ADD COLUMN IF NOT EXISTS away_message         TEXT NULL COMMENT 'AIM-style personal away message';

-- Guild bank items (the "item chest" — separate from gold which is on guilds.gold_bank)
CREATE TABLE IF NOT EXISTS guild_bank_items (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guild_id        INT UNSIGNED NOT NULL,
    item_id         INT UNSIGNED NOT NULL,
    quantity        INT UNSIGNED NOT NULL DEFAULT 1,
    deposited_by    INT UNSIGNED NOT NULL COMMENT 'character_id who deposited',
    deposited_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note            VARCHAR(256) NULL COMMENT 'Optional note from depositor',
    INDEX idx_gbi_guild (guild_id),
    INDEX idx_gbi_item  (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Guild bank log — every transaction recorded for officer transparency
CREATE TABLE IF NOT EXISTS guild_bank_log (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guild_id        INT UNSIGNED NOT NULL,
    character_id    INT UNSIGNED NOT NULL,
    character_name  VARCHAR(64)  NOT NULL,
    action          ENUM('deposit_gold','withdraw_gold','deposit_item','withdraw_item') NOT NULL,
    amount          INT          NULL COMMENT 'Gold amount for gold actions',
    item_id         INT UNSIGNED NULL COMMENT 'Item for item actions',
    item_qty        INT UNSIGNED NULL,
    item_name       VARCHAR(128) NULL,
    note            VARCHAR(256) NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_gbl_guild (guild_id),
    INDEX idx_gbl_char  (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Guild bank permissions per rank
-- TEACHING: Rather than hardcoding "OFFICER can withdraw gold", we store limits
-- per rank so the guild leader can configure their own rules.
CREATE TABLE IF NOT EXISTS guild_bank_perms (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guild_id        INT UNSIGNED NOT NULL,
    rank            ENUM('LEADER','OFFICER','MEMBER') NOT NULL DEFAULT 'MEMBER',
    can_deposit_gold   TINYINT(1) NOT NULL DEFAULT 1,
    can_withdraw_gold  TINYINT(1) NOT NULL DEFAULT 0,
    can_deposit_item   TINYINT(1) NOT NULL DEFAULT 1,
    can_withdraw_item  TINYINT(1) NOT NULL DEFAULT 0,
    gold_withdraw_limit INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Max gold per day. 0=unlimited',
    UNIQUE KEY uniq_gp_guild_rank (guild_id, rank)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =================================================================
-- v21.3: SIGNATURES, VIEW COUNTER, LAST SEEN, TOP FRIENDS
-- =================================================================

ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS profile_signature  TEXT           NULL     COMMENT 'Forum-style signature shown on profile + chat hover',
    ADD COLUMN IF NOT EXISTS profile_views      INT UNSIGNED   NOT NULL DEFAULT 0 COMMENT 'How many times profile page has been visited',
    ADD COLUMN IF NOT EXISTS last_seen_at       TIMESTAMP      NULL     COMMENT 'Last activity timestamp — updated server-side on actions';

-- Top Friends: each character can pin up to 8 friends in order.
-- TEACHING: We store slot numbers 1-8 so the order is preserved.
-- A character can only appear in another character's top list once
-- (UNIQUE on character_id + friend_char_id). The friend doesn't have
-- to be a mutual friend — you can put anyone in your top 8.
CREATE TABLE IF NOT EXISTS character_top_friends (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL COMMENT 'Owner of the top-friends list',
    friend_char_id  INT UNSIGNED NOT NULL COMMENT 'Character being featured',
    slot            TINYINT UNSIGNED NOT NULL COMMENT '1 through 8',
    UNIQUE KEY uniq_tf_slot    (character_id, slot),
    UNIQUE KEY uniq_tf_friend  (character_id, friend_char_id),
    INDEX idx_tf_char  (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- v21.4: LFP BOARD, PROFILE GUESTBOOK, GUILD NEWS FEED, IMG IN SIGS
-- =================================================================

-- Profile Guestbook
-- TEACHING: A guestbook is just comments tied to a character profile.
-- The owner can delete any comment. Others can post once per day
-- (rate-limited server-side). We store both the poster's charId and
-- their name at post-time so deleted characters don't break the display.
CREATE TABLE IF NOT EXISTS profile_guestbook (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    profile_char_id INT UNSIGNED NOT NULL COMMENT 'Whose profile this comment is on',
    author_char_id  INT UNSIGNED NOT NULL COMMENT 'Who wrote it',
    author_name     VARCHAR(64)  NOT NULL COMMENT 'Name at time of posting (denormalized)',
    author_title    VARCHAR(64)  NULL     COMMENT 'Title at time of posting',
    author_color    VARCHAR(7)   NULL     COMMENT 'Accent color at time of posting',
    message         TEXT         NOT NULL COMMENT 'BBCode-lite content',
    message_html    TEXT         NOT NULL COMMENT 'Pre-parsed safe HTML',
    is_deleted      TINYINT(1)   NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_gb_profile (profile_char_id),
    INDEX idx_gb_author  (author_char_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Guild News Feed
-- TEACHING: Officers/leaders can post announcements. Bank log entries
-- can auto-post here too (action = 'bank_event'). This gives the
-- guild a sense of life and shared history.
CREATE TABLE IF NOT EXISTS guild_news (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guild_id        INT UNSIGNED NOT NULL,
    author_char_id  INT UNSIGNED NULL     COMMENT 'NULL for system-generated posts',
    author_name     VARCHAR(64)  NOT NULL DEFAULT 'System',
    title           VARCHAR(128) NOT NULL,
    body            TEXT         NOT NULL COMMENT 'BBCode content',
    body_html       TEXT         NOT NULL COMMENT 'Pre-parsed safe HTML',
    category        ENUM('announcement','event','bank','achievement','system') NOT NULL DEFAULT 'announcement',
    is_pinned       TINYINT(1)   NOT NULL DEFAULT 0,
    is_deleted      TINYINT(1)   NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_gn_guild (guild_id),
    INDEX idx_gn_pinned (guild_id, is_pinned)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- LFP Board entries (persisted so it survives disconnects briefly)
-- TEACHING: We could rely purely on onlinePlayers presence='lfp' but
-- a DB record lets players post a longer description and class role.
-- We auto-expire rows after 4 hours (scheduler job) or when the
-- player changes status away from LFP.
CREATE TABLE IF NOT EXISTS lfp_listings (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL UNIQUE,
    character_name  VARCHAR(64)  NOT NULL,
    level           INT UNSIGNED NOT NULL,
    class_name      VARCHAR(64)  NOT NULL,
    role            ENUM('DPS','Tank','Healer','Support','Any') NOT NULL DEFAULT 'Any',
    note            VARCHAR(255) NULL COMMENT 'What they are looking for',
    content_type    VARCHAR(64)  NULL COMMENT 'e.g. Dungeons, PvP, Quests, Guild',
    expires_at      TIMESTAMP    NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 4 HOUR),
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_lfp_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================
-- v21.5 additions
-- =================================================================

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
    reviewed_by         INT UNSIGNED NULL,
    INDEX idx_reports_reported (reported_char_id),
    INDEX idx_reports_status   (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

-- v21.6: Spotify OAuth
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS spotify_access_token  TEXT         NULL,
    ADD COLUMN IF NOT EXISTS spotify_refresh_token TEXT         NULL,
    ADD COLUMN IF NOT EXISTS spotify_expires_at    BIGINT       NULL;
