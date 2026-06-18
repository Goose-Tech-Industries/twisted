-- =================================================================
-- SESSION 13 — Fighting Styles / Martial Arts with Belt Progression
-- =================================================================
-- Run ONCE after migrate_session12_rp_engine.sql.
-- =================================================================


-- =================================================================
-- 1. FIGHTING STYLES TABLE
-- =================================================================

CREATE TABLE IF NOT EXISTS game_fighting_styles (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL UNIQUE,
    label           VARCHAR(128) NOT NULL,
    icon            VARCHAR(16)  DEFAULT '🥋',
    description     TEXT         DEFAULT NULL,
    lore_text       TEXT         DEFAULT NULL,
    style_type      ENUM('offensive','defensive','balanced','support','glass_cannon') NOT NULL DEFAULT 'balanced',
    max_rank        INT          NOT NULL DEFAULT 10,
    passive_effects JSON         DEFAULT NULL COMMENT 'effects active at all ranks: {"dodge_bonus":0.02}',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =================================================================
-- 2. RANK PROGRESSION TABLE
-- =================================================================

CREATE TABLE IF NOT EXISTS game_fighting_style_ranks (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    style_id        INT          NOT NULL,
    rank_num        INT          NOT NULL,
    label           VARCHAR(64)  NOT NULL COMMENT 'White Belt, Black Belt, Master, etc.',
    icon            VARCHAR(16)  DEFAULT '🥋',
    wins_required   INT          NOT NULL DEFAULT 5 COMMENT 'wins at this rank to promote',
    stat_bonuses    JSON         DEFAULT NULL COMMENT '{"atk":0.05,"speed":0.03} — cumulative multiplier bonuses',
    unlocked_move_ids JSON       DEFAULT NULL COMMENT '[skillId, skillId] — skills unlocked at this rank',
    passive_effects JSON         DEFAULT NULL COMMENT '{"crit_bonus":0.02,"combo_bonus":0.05}',
    description     VARCHAR(255) DEFAULT NULL,
    UNIQUE KEY uq_style_rank (style_id, rank_num),
    FOREIGN KEY (style_id) REFERENCES game_fighting_styles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =================================================================
-- 3. CHARACTER FIGHTING STYLES
-- =================================================================

CREATE TABLE IF NOT EXISTS character_fighting_styles (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    character_id    INT          NOT NULL,
    style_id        INT          NOT NULL,
    current_rank    INT          NOT NULL DEFAULT 1,
    wins_at_rank    INT          NOT NULL DEFAULT 0,
    total_wins      INT          NOT NULL DEFAULT 0,
    is_active       TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'only one style active at a time',
    learned_from_npc_id INT      DEFAULT NULL,
    learned_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_char_style (character_id, style_id),
    FOREIGN KEY (style_id) REFERENCES game_fighting_styles(id),
    INDEX idx_char_active (character_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =================================================================
-- 4. EXTEND NPCs
-- =================================================================

ALTER TABLE game_npcs
    ADD COLUMN IF NOT EXISTS teaches_style_id INT DEFAULT NULL
        AFTER training_gain_pct;


-- =================================================================
-- 5. FEATURE FLAGS
-- =================================================================

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('enable_fighting_styles',       'true'),
('style_switch_cooldown_turns',  '0');


-- =================================================================
-- 6. SEED 5 FIGHTING STYLES + RANKS
-- =================================================================

INSERT IGNORE INTO game_fighting_styles (id, name, label, icon, description, style_type, lore_text) VALUES
(1, 'iron_fist',      'Iron Fist',       '👊', 'A brutal offensive style focused on raw striking power. Each blow aims to overwhelm.',                      'offensive',     'Forged in the war camps of the northern clans, where strength determines rank.'),
(2, 'shadow_step',    'Shadow Step',     '💨', 'An evasive style emphasizing speed, positioning, and counter-strikes.',                                       'defensive',     'Developed by the Fae-touched assassins of the Otherworld mists.'),
(3, 'stone_wall',     'Stone Wall',      '🛡️', 'An immovable defensive art. Stand firm, absorb punishment, outlast your enemy.',                              'defensive',     'The dwarven shield-masters of the deep holds perfected this over centuries.'),
(4, 'druids_way',     'Druid''s Way',    '🌿', 'A support style channeling nature''s energy. Heal allies, weaken foes, control the flow of battle.',          'support',       'Ancient as the standing stones. The druids teach that true power is balance.'),
(5, 'berserker_rage', 'Berserker Rage',  '🔥', 'Sacrifice defense for devastating attack power. The more you bleed, the harder you hit.',                     'glass_cannon',  'Born from the blood-frenzied warriors who painted themselves in woad before battle.');

-- IRON FIST ranks (10 belts)
INSERT IGNORE INTO game_fighting_style_ranks (style_id, rank_num, label, icon, wins_required, stat_bonuses, passive_effects, description) VALUES
(1, 1,  'White Belt',   '⬜', 0,  '{"atk":0.03}',                     NULL,                              'You begin to learn the basics of striking.'),
(1, 2,  'Yellow Belt',  '🟨', 3,  '{"atk":0.05}',                     NULL,                              'Your punches carry weight.'),
(1, 3,  'Orange Belt',  '🟧', 6,  '{"atk":0.08}',                     '{"crit_bonus":0.02}',             'You find the weak points instinctively.'),
(1, 4,  'Green Belt',   '🟩', 10, '{"atk":0.10,"speed":0.03}',        '{"crit_bonus":0.03}',             'Speed and power begin to merge.'),
(1, 5,  'Blue Belt',    '🟦', 15, '{"atk":0.13,"speed":0.05}',        '{"crit_bonus":0.04}',             'Your strikes are hard to read.'),
(1, 6,  'Purple Belt',  '🟪', 22, '{"atk":0.16,"speed":0.06}',        '{"crit_bonus":0.05,"combo_chance":0.05}', 'Combinations flow naturally.'),
(1, 7,  'Brown Belt',   '🟫', 30, '{"atk":0.19,"speed":0.08}',        '{"crit_bonus":0.06,"combo_chance":0.08}', 'Few can match your striking power.'),
(1, 8,  'Red Belt',     '🔴', 40, '{"atk":0.22,"speed":0.10}',        '{"crit_bonus":0.07,"combo_chance":0.10}', 'Your fists are weapons unto themselves.'),
(1, 9,  'Black Belt',   '⬛', 55, '{"atk":0.25,"speed":0.12}',        '{"crit_bonus":0.08,"combo_chance":0.12}', 'Master of the Iron Fist.'),
(1, 10, 'Grandmaster',  '👑', 75, '{"atk":0.30,"speed":0.15,"luck":0.05}', '{"crit_bonus":0.10,"combo_chance":0.15}', 'Your name is spoken with reverence and fear.');

-- SHADOW STEP ranks
INSERT IGNORE INTO game_fighting_style_ranks (style_id, rank_num, label, icon, wins_required, stat_bonuses, passive_effects, description) VALUES
(2, 1,  'White Belt',   '⬜', 0,  '{"speed":0.05}',                   NULL,                              'You learn to move unseen.'),
(2, 2,  'Yellow Belt',  '🟨', 3,  '{"speed":0.08}',                   '{"dodge_bonus":0.02}',            'Your footwork improves.'),
(2, 3,  'Orange Belt',  '🟧', 6,  '{"speed":0.10}',                   '{"dodge_bonus":0.04}',            'You begin to read opponent''s tells.'),
(2, 4,  'Green Belt',   '🟩', 10, '{"speed":0.13,"luck":0.03}',       '{"dodge_bonus":0.06,"flank_bonus":0.05}', 'Positioning becomes second nature.'),
(2, 5,  'Blue Belt',    '🟦', 15, '{"speed":0.16,"luck":0.05}',       '{"dodge_bonus":0.08,"flank_bonus":0.08}', 'You strike from impossible angles.'),
(2, 6,  'Purple Belt',  '🟪', 22, '{"speed":0.19,"luck":0.07}',       '{"dodge_bonus":0.10,"flank_bonus":0.10,"counter_bonus":0.05}', 'Counter-attacks flow like water.'),
(2, 7,  'Brown Belt',   '🟫', 30, '{"speed":0.22,"luck":0.09}',       '{"dodge_bonus":0.12,"flank_bonus":0.12,"counter_bonus":0.08}', 'You are the shadow between strikes.'),
(2, 8,  'Red Belt',     '🔴', 40, '{"speed":0.25,"luck":0.11}',       '{"dodge_bonus":0.14,"flank_bonus":0.14,"counter_bonus":0.10}', 'Enemies swing at air where you were.'),
(2, 9,  'Black Belt',   '⬛', 55, '{"speed":0.28,"luck":0.13}',       '{"dodge_bonus":0.16,"flank_bonus":0.16,"counter_bonus":0.12}', 'Master of the Shadow Step.'),
(2, 10, 'Grandmaster',  '👑', 75, '{"speed":0.32,"luck":0.15,"atk":0.05}', '{"dodge_bonus":0.18,"flank_bonus":0.18,"counter_bonus":0.15}', 'You exist between moments.');

-- STONE WALL ranks
INSERT IGNORE INTO game_fighting_style_ranks (style_id, rank_num, label, icon, wins_required, stat_bonuses, passive_effects, description) VALUES
(3, 1,  'White Belt',   '⬜', 0,  '{"def":0.05}',                     NULL,                              'You learn to hold your ground.'),
(3, 2,  'Yellow Belt',  '🟨', 3,  '{"def":0.08}',                     '{"block_bonus":0.05}',            'Your blocks grow steadier.'),
(3, 3,  'Orange Belt',  '🟧', 6,  '{"def":0.10,"md":0.03}',           '{"block_bonus":0.08}',            'You shrug off blows that would fell others.'),
(3, 4,  'Green Belt',   '🟩', 10, '{"def":0.13,"md":0.06}',           '{"block_bonus":0.10,"damage_reduction":0.03}', 'Stone endures.'),
(3, 5,  'Blue Belt',    '🟦', 15, '{"def":0.16,"md":0.08}',           '{"block_bonus":0.12,"damage_reduction":0.05}', 'You are the shield others hide behind.'),
(3, 6,  'Purple Belt',  '🟪', 22, '{"def":0.19,"md":0.10,"maxHp":0.05}', '{"block_bonus":0.14,"damage_reduction":0.07}', 'Unbreakable.'),
(3, 7,  'Brown Belt',   '🟫', 30, '{"def":0.22,"md":0.12,"maxHp":0.08}', '{"block_bonus":0.16,"damage_reduction":0.09}', 'Mountains move before you do.'),
(3, 8,  'Red Belt',     '🔴', 40, '{"def":0.25,"md":0.14,"maxHp":0.10}', '{"block_bonus":0.18,"damage_reduction":0.11}', 'Your defense is legendary.'),
(3, 9,  'Black Belt',   '⬛', 55, '{"def":0.28,"md":0.16,"maxHp":0.12}', '{"block_bonus":0.20,"damage_reduction":0.13}', 'Master of the Stone Wall.'),
(3, 10, 'Grandmaster',  '👑', 75, '{"def":0.32,"md":0.18,"maxHp":0.15}', '{"block_bonus":0.22,"damage_reduction":0.15}', 'You are the immovable object.');

-- DRUID'S WAY ranks
INSERT IGNORE INTO game_fighting_style_ranks (style_id, rank_num, label, icon, wins_required, stat_bonuses, passive_effects, description) VALUES
(4, 1,  'Sapling',      '🌱', 0,  '{"mo":0.03,"md":0.03}',            NULL,                              'You attune to the natural world.'),
(4, 2,  'Seedling',     '🌿', 3,  '{"mo":0.05,"md":0.05}',            '{"heal_bonus":0.05}',             'Life energy flows through your touch.'),
(4, 3,  'Sprout',       '🌳', 6,  '{"mo":0.08,"md":0.08}',            '{"heal_bonus":0.08,"status_resist":0.05}', 'You resist corruption.'),
(4, 4,  'Rooted',       '🍃', 10, '{"mo":0.10,"md":0.10}',            '{"heal_bonus":0.10,"status_resist":0.08}', 'The earth lends you strength.'),
(4, 5,  'Branch',       '🌲', 15, '{"mo":0.13,"md":0.13}',            '{"heal_bonus":0.13,"status_resist":0.10,"regen":0.01}', 'You regenerate naturally.'),
(4, 6,  'Canopy',       '🍀', 22, '{"mo":0.16,"md":0.16}',            '{"heal_bonus":0.16,"status_resist":0.12,"regen":0.02}', 'Allies feel safer near you.'),
(4, 7,  'Ancient',      '🌕', 30, '{"mo":0.19,"md":0.19}',            '{"heal_bonus":0.19,"status_resist":0.14,"regen":0.02}', 'Your connection to the land deepens.'),
(4, 8,  'Elder',        '✨', 40, '{"mo":0.22,"md":0.22}',            '{"heal_bonus":0.22,"status_resist":0.16,"regen":0.03}', 'The spirits answer your call.'),
(4, 9,  'Archdruid',    '🌙', 55, '{"mo":0.25,"md":0.25}',            '{"heal_bonus":0.25,"status_resist":0.18,"regen":0.03}', 'Master of the Druid''s Way.'),
(4, 10, 'World Tree',   '👑', 75, '{"mo":0.30,"md":0.30,"maxHp":0.10}', '{"heal_bonus":0.30,"status_resist":0.20,"regen":0.04}', 'You are one with all living things.');

-- BERSERKER RAGE ranks
INSERT IGNORE INTO game_fighting_style_ranks (style_id, rank_num, label, icon, wins_required, stat_bonuses, passive_effects, description) VALUES
(5, 1,  'Spark',        '🔥', 0,  '{"atk":0.05,"def":-0.03}',         NULL,                              'The rage flickers within.'),
(5, 2,  'Ember',        '🔥', 3,  '{"atk":0.08,"def":-0.04}',         '{"low_hp_bonus":0.05}',           'Pain fuels you.'),
(5, 3,  'Flame',        '🔥', 6,  '{"atk":0.12,"def":-0.05}',         '{"low_hp_bonus":0.08,"combo_chance":0.05}', 'You fight harder when wounded.'),
(5, 4,  'Blaze',        '🔥', 10, '{"atk":0.16,"def":-0.06,"speed":0.03}', '{"low_hp_bonus":0.10,"combo_chance":0.08}', 'Each cut you take makes you stronger.'),
(5, 5,  'Inferno',      '🔥', 15, '{"atk":0.20,"def":-0.07,"speed":0.05}', '{"low_hp_bonus":0.13,"combo_chance":0.10}', 'You laugh at pain.'),
(5, 6,  'Firestorm',    '🔥', 22, '{"atk":0.24,"def":-0.08,"speed":0.07}', '{"low_hp_bonus":0.16,"combo_chance":0.12}', 'Enemies hesitate before engaging you.'),
(5, 7,  'Conflagration', '🔥', 30, '{"atk":0.28,"def":-0.09,"speed":0.09}', '{"low_hp_bonus":0.19,"combo_chance":0.14}', 'Your fury is an avalanche.'),
(5, 8,  'Cataclysm',    '🔥', 40, '{"atk":0.32,"def":-0.10,"speed":0.11}', '{"low_hp_bonus":0.22,"combo_chance":0.16}', 'The battlefield trembles.'),
(5, 9,  'Ragnarok',     '🔥', 55, '{"atk":0.36,"def":-0.11,"speed":0.13}', '{"low_hp_bonus":0.25,"combo_chance":0.18}', 'Master of the Berserker Rage.'),
(5, 10, 'World Ender',  '👑', 75, '{"atk":0.40,"def":-0.12,"speed":0.15,"luck":0.05}', '{"low_hp_bonus":0.30,"combo_chance":0.20}', 'You are destruction incarnate.');
