-- =====================================================================
-- QUESTS + PROGRESSION (MySQL 8.x SAFE MIGRATION)
-- =====================================================================
-- This file is designed to be SAFE to run multiple times:
-- - No table DROPs
-- - Uses CREATE TABLE IF NOT EXISTS
-- - Uses INSERT IGNORE for sample data
--
-- Architecture:
-- - Quest templates live in quest_definitions (objectives + rewards in JSON)
-- - Player quest progress + XP live in characters.state_json
-- - Player level lives in characters.level
--
-- OPTIONAL:
-- - Adds game_npcs.quest_offers_json via a helper procedure (safe add)

SET FOREIGN_KEY_CHECKS=0;

-- -------------------------------------
-- 1) Quest Templates
-- -------------------------------------
CREATE TABLE IF NOT EXISTS quest_definitions (
  quest_id VARCHAR(64) NOT NULL,
  title VARCHAR(120) NOT NULL,
  description TEXT NULL,
  quest_type VARCHAR(40) NOT NULL DEFAULT 'side',
  category VARCHAR(60) NULL,
  required_level INT NOT NULL DEFAULT 1,
  is_repeatable TINYINT(1) NOT NULL DEFAULT 0,
  repeat_cooldown_hours INT NOT NULL DEFAULT 0,
  max_completions INT NULL,
  objectives_json JSON NOT NULL,
  rewards_json JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (quest_id)
) ENGINE=InnoDB;

-- MySQL doesn't support CREATE INDEX IF NOT EXISTS.
-- We'll add a safe helper below and use it.

-- -------------------------------------
-- 2) Level Requirements (optional table)
-- -------------------------------------
CREATE TABLE IF NOT EXISTS level_requirements (
  level INT NOT NULL,
  xp_required INT NOT NULL,
  total_xp INT NOT NULL,
  PRIMARY KEY (level)
) ENGINE=InnoDB;

-- -------------------------------------
-- 3) Progression Config (optional)
-- -------------------------------------
CREATE TABLE IF NOT EXISTS progression_config (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  key_name VARCHAR(64) NOT NULL,
  value_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_progression_cfg_key (key_name)
) ENGINE=InnoDB;

-- -------------------------------------
-- 4) Safe helper: add a column if missing
-- -------------------------------------
DROP PROCEDURE IF EXISTS sp_add_column_if_not_exists;
DELIMITER $$
CREATE PROCEDURE sp_add_column_if_not_exists(
  IN p_table VARCHAR(128),
  IN p_column VARCHAR(128),
  IN p_definition TEXT
)
BEGIN
  DECLARE v_count INT DEFAULT 0;

  SELECT COUNT(*) INTO v_count
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = p_table
    AND COLUMN_NAME = p_column;

  IF v_count = 0 THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- Safe helper: add an index if missing
DROP PROCEDURE IF EXISTS sp_add_index_if_not_exists;
DELIMITER $$
CREATE PROCEDURE sp_add_index_if_not_exists(
  IN p_table VARCHAR(128),
  IN p_index VARCHAR(128),
  IN p_columns VARCHAR(255)
)
BEGIN
  DECLARE v_count INT DEFAULT 0;

  SELECT COUNT(*) INTO v_count
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = p_table
    AND INDEX_NAME = p_index;

  IF v_count = 0 THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (', p_columns, ')');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL sp_add_index_if_not_exists('quest_definitions', 'idx_quest_required_level', 'required_level');

-- OPTIONAL NPC hook: npc.quest_offers_json = ["quest_id_1", "quest_id_2"]
-- If your NPC table is named game_npcs and uses id primary key, this is the recommended hook.
-- If your host blocks procedures, just run the ALTER TABLE manually.
CALL sp_add_column_if_not_exists('game_npcs', 'quest_offers_json', 'JSON NULL');

-- -------------------------------------
-- 5) Generate a simple level curve (1-100)
-- -------------------------------------
-- We only insert rows that don't exist yet (INSERT IGNORE)
DROP PROCEDURE IF EXISTS sp_seed_level_requirements;
DELIMITER $$
CREATE PROCEDURE sp_seed_level_requirements()
BEGIN
  DECLARE lvl INT DEFAULT 1;
  DECLARE xp INT;
  DECLARE total INT DEFAULT 0;

  WHILE lvl <= 100 DO
    -- XP to gain NEXT level (curve you can change later)
    SET xp = ROUND((100 + (lvl * lvl * 15)) / 10) * 10;
    SET total = total + xp;

    INSERT IGNORE INTO level_requirements (level, xp_required, total_xp)
    VALUES (lvl, xp, total);

    SET lvl = lvl + 1;
  END WHILE;
END$$
DELIMITER ;

CALL sp_seed_level_requirements();

-- -------------------------------------
-- 6) Sample Quest Data (safe)
-- -------------------------------------
INSERT IGNORE INTO quest_definitions (
  quest_id, title, description, quest_type, category, required_level,
  is_repeatable, repeat_cooldown_hours, max_completions,
  objectives_json, rewards_json, is_active
) VALUES
(
  'daily_pest_control',
  'Daily: Pest Control',
  'The local fields are crawling with pests. Clear them out and report back.',
  'daily',
  'Village',
  1,
  1,
  24,
  NULL,
  JSON_ARRAY(
    JSON_OBJECT('key','kill_pests','type','kill','target',5,'text','Defeat 5 pests')
  ),
  JSON_OBJECT('xp', 60, 'gold', 25),
  1
),
(
  'eldoria_sword_01',
  'The Lost Sword of Eldoria',
  'An ancient blade has resurfaced in rumor. Follow the trail and recover it.',
  'epic',
  'Eldoria',
  5,
  0,
  0,
  1,
  JSON_ARRAY(
    JSON_OBJECT('key','talk_to_captain','type','talk','target',1,'text','Speak with Captain Thorne'),
    JSON_OBJECT('key','recover_sword','type','loot','target',1,'text','Recover the lost sword'),
    JSON_OBJECT('key','return_to_king','type','talk','target',1,'text','Return to King Aldric')
  ),
  JSON_OBJECT('xp', 500, 'gold', 250, 'items', JSON_ARRAY(JSON_OBJECT('item_id', 1, 'qty', 1))),
  1
);

SET FOREIGN_KEY_CHECKS=1;
