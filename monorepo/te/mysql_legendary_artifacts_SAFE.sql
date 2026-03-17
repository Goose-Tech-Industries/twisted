-- =====================================================================
-- LEGENDARY ARTIFACTS (MySQL 8.x SAFE MIGRATION)
-- =====================================================================
-- SAFE to run multiple times:
-- - No DROPs
-- - Uses CREATE TABLE IF NOT EXISTS
-- - Uses INSERT IGNORE for sample artifacts/powers

SET FOREIGN_KEY_CHECKS=0;

-- -------------------------------------
-- 1) Artifact Powers
-- -------------------------------------
CREATE TABLE IF NOT EXISTS artifact_powers (
  power_id VARCHAR(64) NOT NULL,
  artifact_id VARCHAR(64) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  power_type ENUM('passive','active','ultimate') NOT NULL DEFAULT 'passive',
  unlock_kills INT NOT NULL DEFAULT 0,
  rank_max INT NOT NULL DEFAULT 1,
  effect_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (power_id),
  KEY idx_powers_artifact (artifact_id),
  KEY idx_powers_unlock (unlock_kills)
) ENGINE=InnoDB;

-- -------------------------------------
-- 2) Legendary Artifacts
-- -------------------------------------
CREATE TABLE IF NOT EXISTS legendary_artifacts (
  artifact_id VARCHAR(64) NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(40) NOT NULL,
  rarity ENUM('legendary','mythic','cosmic') NOT NULL DEFAULT 'legendary',
  theme VARCHAR(60) NULL,
  description TEXT NULL,

  current_wielder_id INT NULL,
  total_kills INT NOT NULL DEFAULT 0,
  kill_streak INT NOT NULL DEFAULT 0,

  power_multiplier DECIMAL(6,2) NOT NULL DEFAULT 1.00,
  decay_rate DECIMAL(6,2) NOT NULL DEFAULT 0.02,

  last_bloodshed_at DATETIME NULL,
  last_transfer_at DATETIME NULL,

  is_dormant TINYINT(1) NOT NULL DEFAULT 0,
  active_curses_json JSON NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (artifact_id),
  KEY idx_artifacts_wielder (current_wielder_id),
  KEY idx_artifacts_rarity (rarity)
) ENGINE=InnoDB;

-- -------------------------------------
-- 3) Lineage (ownership history)
-- -------------------------------------
CREATE TABLE IF NOT EXISTS artifact_lineage (
  lineage_id VARCHAR(64) NOT NULL,
  artifact_id VARCHAR(64) NOT NULL,
  wielder_id INT NOT NULL,
  acquired_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  ended_reason VARCHAR(50) NULL,
  PRIMARY KEY (lineage_id),
  KEY idx_lineage_artifact (artifact_id),
  KEY idx_lineage_wielder (wielder_id),
  KEY idx_lineage_open (artifact_id, ended_at)
) ENGINE=InnoDB;

-- -------------------------------------
-- 4) Hunts (bounties)
-- -------------------------------------
CREATE TABLE IF NOT EXISTS artifact_hunts (
  hunt_id VARCHAR(64) NOT NULL,
  artifact_id VARCHAR(64) NOT NULL,
  hunter_id INT NOT NULL,
  bounty_amount INT NOT NULL DEFAULT 0,
  status ENUM('active','claimed','cancelled') NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  created_at DATETIME NOT NULL,
  claimed_by INT NULL,
  claimed_at DATETIME NULL,
  PRIMARY KEY (hunt_id),
  KEY idx_hunts_artifact (artifact_id),
  KEY idx_hunts_status (status)
) ENGINE=InnoDB;

-- -------------------------------------
-- 5) Shrines + Worship Log
-- -------------------------------------
CREATE TABLE IF NOT EXISTS artifact_shrines (
  shrine_id VARCHAR(64) NOT NULL,
  artifact_id VARCHAR(64) NOT NULL,
  creator_wielder_id INT NOT NULL,
  zone_id VARCHAR(64) NULL,
  title VARCHAR(120) NOT NULL,
  message TEXT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (shrine_id),
  KEY idx_shrines_artifact (artifact_id),
  KEY idx_shrines_zone (zone_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS artifact_worship_log (
  worship_id VARCHAR(64) NOT NULL,
  shrine_id VARCHAR(64) NOT NULL,
  artifact_id VARCHAR(64) NOT NULL,
  worshipper_id INT NOT NULL,
  worshipped_at DATETIME NOT NULL,
  PRIMARY KEY (worship_id),
  KEY idx_worship_artifact (artifact_id),
  KEY idx_worship_shrine (shrine_id),
  KEY idx_worship_worshipper (worshipper_id)
) ENGINE=InnoDB;

-- -------------------------------------
-- 6) PvP Kill Log (anti-exploit)
-- -------------------------------------
CREATE TABLE IF NOT EXISTS artifact_pvp_kill_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  killer_character_id INT NOT NULL,
  victim_character_id INT NOT NULL,
  is_duel TINYINT(1) NOT NULL DEFAULT 0,
  location VARCHAR(100) NULL,
  occurred_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_killlog_pair_time (killer_character_id, victim_character_id, occurred_at),
  KEY idx_killlog_time (occurred_at)
) ENGINE=InnoDB;

-- -------------------------------------
-- 7) Sample Artifacts + Powers
-- -------------------------------------
INSERT IGNORE INTO legendary_artifacts
(artifact_id, name, type, rarity, theme, description, current_wielder_id, total_kills, kill_streak, power_multiplier, decay_rate, is_dormant, active_curses_json)
VALUES
('Soulreaver', 'Soulreaver', 'Sword', 'legendary', 'Blood', 'A blade that drinks victory. It does not forgive weakness.', NULL, 0, 0, 1.00, 0.02, 0, JSON_ARRAY()),
('Voidstring', 'Voidstring', 'Bow', 'legendary', 'Void', 'A bow whose arrows arrive before they are fired.', NULL, 0, 0, 1.00, 0.02, 0, JSON_ARRAY()),
('ScepterOfDominance', 'Scepter of Dominance', 'Staff', 'legendary', 'Mind', 'A scepter that makes thoughts heavy and choices expensive.', NULL, 0, 0, 1.00, 0.02, 0, JSON_ARRAY());

-- Soulreaver Powers
INSERT IGNORE INTO artifact_powers
(power_id, artifact_id, name, description, power_type, unlock_kills, rank_max, effect_json)
VALUES
('Soulreaver_Bloodlust_1', 'Soulreaver', 'Bloodlust I', 'Gain +5% damage per kill streak (stacks).', 'passive', 0, 5, JSON_OBJECT('type','damage_per_streak','base_pct',5)),
('Soulreaver_Echo_1', 'Soulreaver', 'Immortal Echo I', '10% chance to cheat death (revive at 1 HP).', 'passive', 10, 5, JSON_OBJECT('type','cheat_death','chance_pct',10)),
('Soulreaver_Execute_1', 'Soulreaver', 'Execute I', 'Finish targets under 15% HP (cooldown applies).', 'active', 25, 5, JSON_OBJECT('type','execute','threshold_pct',15)),
('Soulreaver_Apocalypse', 'Soulreaver', 'Apocalypse', '500% AoE strike (endgame ultimate).', 'ultimate', 500, 1, JSON_OBJECT('type','aoe_multiplier','multiplier_pct',500));

-- Voidstring Powers
INSERT IGNORE INTO artifact_powers
(power_id, artifact_id, name, description, power_type, unlock_kills, rank_max, effect_json)
VALUES
('Voidstring_Execute_1', 'Voidstring', 'Execute I', 'Kill targets under 15% HP.', 'active', 0, 5, JSON_OBJECT('type','execute','threshold_pct',15)),
('Voidstring_Echo_1', 'Voidstring', 'Immortal Echo I', '10% chance to cheat death.', 'passive', 10, 5, JSON_OBJECT('type','cheat_death','chance_pct',10)),
('Voidstring_Apocalypse', 'Voidstring', 'Apocalypse', '500% AoE arrow storm.', 'ultimate', 500, 1, JSON_OBJECT('type','aoe_multiplier','multiplier_pct',500));

-- Scepter Powers
INSERT IGNORE INTO artifact_powers
(power_id, artifact_id, name, description, power_type, unlock_kills, rank_max, effect_json)
VALUES
('Scepter_MindCrush_1', 'ScepterOfDominance', 'Mind Crush', 'Will damage (scales with streak).', 'active', 0, 5, JSON_OBJECT('type','will_damage','base',25,'per_streak',5)),
('Scepter_Echo_1', 'ScepterOfDominance', 'Immortal Echo I', '10% chance to cheat death.', 'passive', 10, 5, JSON_OBJECT('type','cheat_death','chance_pct',10)),
('Scepter_Apocalypse', 'ScepterOfDominance', 'Apocalypse', '500% psychic shockwave.', 'ultimate', 500, 1, JSON_OBJECT('type','aoe_multiplier','multiplier_pct',500));

SET FOREIGN_KEY_CHECKS=1;
