
-- 1. Upgrade characters table schema
ALTER TABLE characters 
    ADD COLUMN IF NOT EXISTS name VARCHAR(64) NOT NULL DEFAULT 'Wanderer',
    ADD COLUMN IF NOT EXISTS class_id INT UNSIGNED NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS race_id INT UNSIGNED NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS background_id INT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS feat_id INT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS current_mp INT NOT NULL DEFAULT 50,
    ADD COLUMN IF NOT EXISTS max_mp INT NOT NULL DEFAULT 50,
    ADD COLUMN IF NOT EXISTS atk INT NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS def INT NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS mo INT NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS md INT NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS speed INT NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS luck INT NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS portrait_url VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS sprite_url VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS visual_prompt TEXT NULL,
    ADD COLUMN IF NOT EXISTS action_map JSON NULL,
    ADD COLUMN IF NOT EXISTS state_json MEDIUMTEXT NULL;

-- 2. Seed Expanded Races (12 Diverse Fantasy & Planar Lineages)
TRUNCATE TABLE game_races;
INSERT INTO game_races (id, name, description, icon, bonus_hp, bonus_mp, bonus_atk, bonus_def, bonus_mo, bonus_md, bonus_speed, bonus_luck, hidden) VALUES
(1, 'Human', 'Versatile, ambitious, and adaptable across all combat styles.', '👤', 10, 5, 1, 1, 1, 1, 1, 1, 0),
(2, 'High Elf', 'Ancient grace and innate arcane affinity; masters of magic and archery.', '🧝', 0, 20, 0, 0, 3, 2, 2, 1, 0),
(3, 'Drow (Dark Elf)', 'Subterranean predators with superior darkvision, poison resistance, and lethal agility.', '🕷️', 5, 10, 1, 0, 2, 1, 3, 2, 0),
(4, 'Mountain Dwarf', 'Unyielding stone-dwellers with dense bone and thick armor affinity.', '🧔', 25, 0, 2, 3, 0, 2, -1, 1, 0),
(5, 'Duergar (Deep Dwarf)', 'Grim subterranean smiths gifted with innate psionic resilience and malice.', '⛏️', 20, 10, 2, 2, 1, 3, -1, 0, 0),
(6, 'Tiefling (Hellforged)', 'Bearing the infernal heritage of the Lower Planes; flame-resistant and charismatic.', '😈', 10, 15, 1, 0, 3, 2, 1, 2, 0),
(7, 'Dragonborn', 'Carrying the proud blood and elemental breath of ancient dragons.', '🐉', 20, 5, 3, 2, 1, 1, 0, 0, 0),
(8, 'Half-Orc', 'Relentless ferocity and brutal physical endurance in the thick of battle.', '🐗', 25, 0, 4, 1, -1, 0, 1, 0, 0),
(9, 'Githyanki (Astral)', 'Planar warriors forged in the Silver Void; gifted with psionic martial speed.', '⚔️', 10, 10, 3, 1, 1, 1, 3, 0, 0),
(10, 'Aasimar (Celestial)', 'Infused with the radiant light of the Upper Heavens; holy protectors and healers.', '✨', 15, 20, 0, 1, 2, 4, 0, 2, 0),
(11, 'Gnome (Deep Tinker)', 'Inventive, eccentric illusionists with uncanny mental resistance.', '⚙️', 0, 15, -1, 1, 2, 3, 1, 3, 0),
(12, 'Halfling (Shadowfoot)', 'Naturally lucky, quiet-footed wanderers who slip past danger unseen.', '🍀', 5, 5, 0, 0, 0, 1, 3, 5, 0);

-- 3. Seed Expanded Classes (12 Deep Archetypes)
TRUNCATE TABLE game_classes;
INSERT INTO game_classes (id, name, description, icon, base_hp, base_mp, base_atk, base_def, base_mo, base_md, base_speed, base_luck, battle_cmds, hidden, sort_order) VALUES
(1, 'Warrior', 'Heavy vanguard weapon master; excels at cleaves, counter-attacks, and defensive stances.', '⚔️', 120, 30, 14, 8, 2, 4, 10, 5, '["ATTACK","DEFEND","CLEAVE","SHIELD_BASH"]', 0, 1),
(2, 'Paladin', 'Holy armored crusader wielding divine smites, protective auras, and laying on hands.', '🛡️', 115, 60, 12, 8, 8, 8, 8, 6, '["ATTACK","DEFEND","SMITE","LAY_ON_HANDS"]', 0, 2),
(3, 'Barbarian', 'Primal juggernaut fueled by unbridled rage, reckless swings, and massive vitality.', '🪓', 140, 20, 16, 6, 1, 2, 11, 4, '["ATTACK","DEFEND","RAGE","OVERHEAD_STRIKE"]', 0, 3),
(4, 'Rogue', 'Cunning assassin and acrobat; masters sneak attacks, dual daggers, and evasion.', '🗡️', 90, 45, 13, 5, 4, 4, 15, 10, '["ATTACK","DEFEND","SNEAK_ATTACK","POISON_BLADE"]', 0, 4),
(5, 'Ranger', 'Wilderness tracker and deadly marksman; pairs rapid bow volleys with beast companion tactics.', '🏹', 100, 50, 12, 6, 5, 5, 13, 7, '["ATTACK","DEFEND","AIMED_SHOT","VOLLEY"]', 0, 5),
(6, 'Monk', 'Unarmed martial artist channeling ki energy into lightning-fast multi-strike combos.', '🥋', 100, 55, 12, 7, 6, 7, 16, 6, '["ATTACK","DEFEND","FLURRY_OF_BLOWS","KI_STRIKE"]', 0, 6),
(7, 'Mage', 'Master of destructive elemental evocation; unleashes firestorms, frost lances, and lightning.', '🔮', 75, 120, 4, 3, 16, 10, 9, 7, '["ATTACK","DEFEND","FIREBALL","FROST_LANCE"]', 0, 7),
(8, 'Sorcerer', 'Innate conduit of raw chaotic magic; bends spells with explosive wild surges.', '⚡', 80, 110, 5, 4, 15, 9, 10, 8, '["ATTACK","DEFEND","CHAOS_BOLT","METAMAGIC"]', 0, 8),
(9, 'Warlock', 'Bound by pact to an otherworldly patron; casts devastating eldritch hexes and blasts.', '👁️', 85, 90, 8, 5, 14, 10, 10, 6, '["ATTACK","DEFEND","ELDRITCH_BLAST","HEX"]', 0, 9),
(10, 'Necromancer', 'Dark occultist commanding the grave; drains life essence and summons skeletal servants.', '💀', 80, 110, 6, 4, 15, 11, 8, 6, '["ATTACK","DEFEND","LIFE_DRAIN","RAISE_DEAD"]', 0, 10),
(11, 'Cleric', 'Devout servant of the gods; weaves life-saving restorative miracles and holy retribution.', '✨', 105, 90, 9, 7, 10, 12, 8, 7, '["ATTACK","DEFEND","HEAL","DIVINE_RADIANCE"]', 0, 11),
(12, 'Druid', 'Guardian of the primal balance; calls down thunderous nature storms and shapeshifts.', '🐺', 105, 85, 10, 6, 11, 10, 9, 7, '["ATTACK","DEFEND","THORN_WHIP","WILD_SHAPE"]', 0, 12);

-- 4. Seed Rich Roleplay Backgrounds (8 Origins)
TRUNCATE TABLE game_backgrounds;
INSERT INTO game_backgrounds (id, name, description, bonus_hp, bonus_mp, bonus_str) VALUES
(1, 'Outlander', 'Grew up surviving the unforgiving wilds, barrens, and beast-haunted frontiers.', 15, 0, 'HP+15'),
(2, 'Urchin', 'Grew up scavenging the back alleys and rooftops of a gothic metropolis.', 0, 5, 'SPD+2'),
(3, 'Noble', 'Heir to an ancient noble house with family armory, royal pedigree, and coin.', 5, 5, 'GOLD+100'),
(4, 'Haunted One', 'Survived an unspeakable supernatural nightmare; marked by an icy, unbreakable resolve.', 10, 10, 'MDEF+3'),
(5, 'Gladiator', 'Fought for survival in blood-soaked amphitheaters and fighting pits.', 15, 0, 'ATK+2'),
(6, 'Acolyte', 'Devoted life to a cloistered temple, steeped in forgotten scripture and sacred rites.', 0, 20, 'MP+20'),
(7, 'Guild Artisan', 'Master craftsperson with an eagle eye for rare materials, trade, and forge secrets.', 5, 5, 'LCK+3'),
(8, 'Shadow Mercenary', 'A ruthless contractor who sold their blade in dark alleyways and planar wars.', 10, 5, 'ATK+1, SPD+1');
