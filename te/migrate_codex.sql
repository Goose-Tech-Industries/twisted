-- =================================================================
-- CODEX / BESTIARY TABLES
-- =================================================================

-- Master codex entries — creatures, items, lore, locations, oghams
-- Some categories (items, oghams, locations) auto-populate from existing
-- game tables; lore and creature entries are authored here directly.
CREATE TABLE IF NOT EXISTS codex_entries (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category        ENUM('creatures','items','lore','locations','oghams') NOT NULL,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    icon            VARCHAR(8)   DEFAULT NULL,
    rarity          ENUM('common','uncommon','rare','epic','legendary') DEFAULT NULL,
    -- Creature fields
    level           INT          DEFAULT NULL,
    element         VARCHAR(64)  DEFAULT NULL,
    weakness        VARCHAR(64)  DEFAULT NULL,
    drop_table_json JSON         DEFAULT NULL,   -- ["Wolf Pelt","Fangs"]
    -- Location fields
    region          VARCHAR(128) DEFAULT NULL,
    min_level       INT          DEFAULT NULL,
    -- Item fields
    item_type       VARCHAR(64)  DEFAULT NULL,    -- weapon, armor, artifact, etc.
    stats_json      JSON         DEFAULT NULL,    -- {"atk":150,"spd":30}
    -- Lore fields
    chapter         INT          DEFAULT NULL,
    -- Links to existing game tables (NULL = standalone codex entry)
    ref_npc_id      INT UNSIGNED DEFAULT NULL,    -- game_npcs.id for creatures
    ref_item_id     INT UNSIGNED DEFAULT NULL,    -- game_items.id
    ref_map_id      INT UNSIGNED DEFAULT NULL,    -- game_maps.id
    ref_ogham_id    INT UNSIGNED DEFAULT NULL,    -- game_oghams.id
    hidden          TINYINT(1)   NOT NULL DEFAULT 0,
    INDEX idx_codex_cat (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Per-character discovery tracking
CREATE TABLE IF NOT EXISTS codex_discoveries (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    character_id    INT UNSIGNED NOT NULL,
    codex_entry_id  INT UNSIGNED NOT NULL,
    discovered_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_char_entry (character_id, codex_entry_id),
    INDEX idx_disc_char (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
