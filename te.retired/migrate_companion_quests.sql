-- =================================================================
-- Companion Personal Questlines
-- Adds affinity tracking + quest chains tied to companion NPCs.
-- Safe to re-run (IF NOT EXISTS).
-- =================================================================

-- ── Affinity tracking per companion ────────────────────────────
ALTER TABLE character_companions
    ADD COLUMN IF NOT EXISTS affinity       INT NOT NULL DEFAULT 0 AFTER tactics,
    ADD COLUMN IF NOT EXISTS affinity_level INT NOT NULL DEFAULT 0 AFTER affinity,
    ADD COLUMN IF NOT EXISTS battles_together INT UNSIGNED NOT NULL DEFAULT 0 AFTER affinity_level,
    ADD COLUMN IF NOT EXISTS gifts_given    INT UNSIGNED NOT NULL DEFAULT 0 AFTER battles_together;

-- ── Companion quest definitions ────────────────────────────────
CREATE TABLE IF NOT EXISTS game_companion_quests (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    npc_id          INT UNSIGNED NOT NULL,
    quest_order     INT NOT NULL DEFAULT 1,
    title           VARCHAR(128) NOT NULL,
    description     TEXT,
    icon            VARCHAR(8) DEFAULT NULL,

    -- Unlock conditions
    affinity_required   INT NOT NULL DEFAULT 0,
    level_required      INT NOT NULL DEFAULT 1,
    prerequisite_quest_id INT UNSIGNED DEFAULT NULL,

    -- Objectives & rewards
    objectives_json JSON NOT NULL,
    rewards_json    JSON DEFAULT NULL,
    completion_dialogue TEXT DEFAULT NULL,

    -- Affinity reward on completion
    affinity_reward INT NOT NULL DEFAULT 25,

    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_npc (npc_id),
    INDEX idx_npc_order (npc_id, quest_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Player progress on companion quests ────────────────────────
CREATE TABLE IF NOT EXISTS character_companion_quest_progress (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    companion_quest_id INT UNSIGNED NOT NULL,
    status          ENUM('locked','available','active','completed') NOT NULL DEFAULT 'locked',
    progress_json   JSON DEFAULT NULL,
    started_at      TIMESTAMP NULL,
    completed_at    TIMESTAMP NULL,

    UNIQUE KEY uq_char_cquest (character_id, companion_quest_id),
    INDEX idx_char (character_id),
    FOREIGN KEY (companion_quest_id) REFERENCES game_companion_quests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Affinity thresholds & titles ───────────────────────────────
CREATE TABLE IF NOT EXISTS game_companion_affinity_tiers (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tier_level      INT NOT NULL,
    name            VARCHAR(64) NOT NULL,
    affinity_required INT NOT NULL,
    description     VARCHAR(255) DEFAULT NULL,
    stat_bonus_json JSON DEFAULT NULL,
    unlock_text     VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_companion_affinity_tiers (tier_level, name, affinity_required, description, unlock_text) VALUES
(0, 'Stranger',    0,    'You barely know each other.',          NULL),
(1, 'Acquaintance', 25,  'A growing familiarity.',              '{name} seems more comfortable around you.'),
(2, 'Ally',         75,  'A solid battle partner.',              '{name} trusts you in combat.'),
(3, 'Friend',       150, 'A genuine friendship has formed.',    '{name} considers you a true friend.'),
(4, 'Confidant',    300, 'Deep trust and mutual respect.',       '{name} shares their deepest secret with you.'),
(5, 'Bonded',       500, 'An unbreakable bond.',                '{name} would follow you anywhere.');

-- ── Done ───────────────────────────────────────────────────────
