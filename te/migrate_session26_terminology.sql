-- =================================================================
-- SESSION 26 — Game Terminology + Battle Config Mega-Panel
-- =================================================================

CREATE TABLE IF NOT EXISTS game_terminology (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    term_key        VARCHAR(64)  NOT NULL UNIQUE COMMENT 'internal key: hp, mp, atk, ki, alignment, etc.',
    display_name    VARCHAR(128) NOT NULL COMMENT 'what the players see',
    short_name      VARCHAR(32)  DEFAULT NULL COMMENT 'abbreviated: HP, MP, ATK',
    icon            VARCHAR(16)  DEFAULT NULL,
    description     VARCHAR(255) DEFAULT NULL COMMENT 'tooltip text',
    category        VARCHAR(32)  NOT NULL DEFAULT 'general' COMMENT 'stats, combat, magic, social, meta',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed all renamable terms with sensible defaults
INSERT IGNORE INTO game_terminology (term_key, display_name, short_name, icon, description, category) VALUES
-- Stats
('hp',          'Health Points',    'HP',   '❤️', 'How much damage you can take.',              'stats'),
('mp',          'Mana Points',      'MP',   '💧', 'Resource for casting skills.',               'stats'),
('atk',         'Attack',           'ATK',  '⚔️', 'Physical damage power.',                     'stats'),
('def',         'Defense',          'DEF',  '🛡️', 'Physical damage resistance.',                'stats'),
('mo',          'Magic Offense',    'MO',   '✨', 'Magical damage power.',                      'stats'),
('md',          'Magic Defense',    'MD',   '🔮', 'Magical damage resistance.',                 'stats'),
('speed',       'Speed',            'SPD',  '💨', 'Turn order and dodge chance.',               'stats'),
('luck',        'Luck',             'LCK',  '🍀', 'Critical hit chance and rare drops.',        'stats'),
('level',       'Level',            'Lv.',  '⬆️', 'Character power tier.',                      'stats'),
('experience',  'Experience',       'XP',   '📊', 'Points toward next level.',                  'stats'),
('gold',        'Gold',             'G',    '🪙', 'Currency.',                                  'stats'),
-- Combat
('ki',          'Ki',               'Ki',   '🔥', 'Inner energy for special techniques.',       'combat'),
('limitbreak',  'Limit Break',      'LB',   '⚡', 'Ultimate ability meter.',                    'combat'),
('combo',       'Combo',            'CMB',  '💥', 'Chain of rapid attacks.',                    'combat'),
('crit',        'Critical Hit',     'CRIT', '💢', 'A strike that deals bonus damage.',         'combat'),
('dodge',       'Dodge',            'DDG',  '💨', 'Evade an attack entirely.',                 'combat'),
('block',       'Block',            'BLK',  '🛡️', 'Reduce incoming damage.',                   'combat'),
('counter',     'Counter',          'CTR',  '↩️', 'Strike back after defending.',              'combat'),
('flee',        'Flee',             'FLE',  '🏃', 'Escape from battle.',                       'combat'),
('taunt',       'Taunt',            'TNT',  '😤', 'Draw enemy attention.',                     'combat'),
('intimidate',  'Intimidate',       'INT',  '👁️', 'Shake the enemy.',                          'combat'),
('rally',       'Rally',            'RLY',  '📣', 'Inspire allies.',                           'combat'),
('stealth',     'Stealth',          'STL',  '🥷', 'Hide from enemies.',                        'combat'),
-- Systems
('limb_targeting','Limb Targeting', NULL,   '🦴', 'Target specific body parts.',               'systems'),
('active_defense','Active Defense', NULL,   '🛡️', 'Choose how to defend each attack.',         'systems'),
('nonlethal',   'Non-Lethal',       NULL,   '💫', 'Knock out instead of kill.',                'systems'),
('wound_system','Wound System',     NULL,   '🩸', 'Injuries degrade stats as limbs take damage.','systems'),
('channel_ki',  'Channel Ki',       NULL,   '🔥', 'Surge to full power temporarily.',          'systems'),
('spell_slots', 'Spell Slots',      NULL,   '📖', 'Limited-use ability charges.',              'systems'),
('summon',      'Summon',           NULL,   '👻', 'Call a spirit creature to fight.',          'systems'),
('transform',   'Transform',        NULL,   '⭐', 'Change form for a power boost.',            'systems'),
('sig_tech',    'Signature Technique',NULL,  '⚡', 'Your own custom technique.',                'systems'),
-- RP
('flavor_text', 'Battle Description',NULL,  '🎭', 'Describe your action for a bonus.',        'rp'),
('narration',   'Battle Narration', NULL,   '📖', 'DM-style combat descriptions.',            'rp'),
('rp_commands', 'RP Commands',      NULL,   '🎭', 'Taunt, Intimidate, Rally.',                'rp'),
('alignment',   'Alignment',        NULL,   '⚖️', 'Moral compass: good vs evil.',             'social'),
-- Meta
('afterlife',   'Afterlife',        NULL,   '👻', 'Where you go when you die.',               'meta'),
('tournament',  'Tournament',       NULL,   '🏆', 'Scheduled competitive events.',            'meta'),
('fighting_style','Fighting Style', NULL,   '🥋', 'Martial arts with rank progression.',      'meta'),
('weather',     'Weather',          NULL,   '🌤️', 'Environmental combat effects.',            'meta'),
('boss_phase',  'Boss Phase',       NULL,   '👑', 'Multi-stage boss encounters.',             'meta');
