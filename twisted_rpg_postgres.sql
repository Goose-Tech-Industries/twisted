DROP TABLE IF EXISTS "character_achievements";
CREATE TABLE "character_achievements" (
  "id" integer NOT NULL,
  "character_id" integer NOT NULL,
  "achievement_id" integer NOT NULL,
  "earned_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("character_id","achievement_id")
);
DROP TABLE IF EXISTS "character_cards";
CREATE TABLE "character_cards" (
  "id" integer  NOT NULL,
  "character_id" integer  NOT NULL,
  "card_id" integer  NOT NULL,
  "quantity" integer DEFAULT 1,
  "obtained_from" varchar(64) DEFAULT NULL,
  "obtained_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("character_id","card_id")
);
DROP TABLE IF EXISTS "character_companions";
CREATE TABLE "character_companions" (
  "id" integer  NOT NULL,
  "character_id" integer  NOT NULL,
  "npc_id" integer  NOT NULL,
  "recruited_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "is_active" smallint NOT NULL DEFAULT 1,
  "tactics" varchar(64) NOT NULL DEFAULT 'BALANCED',
  "affinity" integer NOT NULL DEFAULT 50,
  "affinity_level" integer NOT NULL DEFAULT 1,
  "battles_together" integer  NOT NULL DEFAULT 0,
  "gifts_given" integer  NOT NULL DEFAULT 0,
  PRIMARY KEY ("id"),
  UNIQUE ("character_id","npc_id")
);
DROP TABLE IF EXISTS "character_equipment";
CREATE TABLE "character_equipment" (
  "id" integer  NOT NULL,
  "character_id" integer  NOT NULL,
  "slot_key" varchar(32) NOT NULL,
  "item_id" integer  NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("character_id","slot_key")
);
DROP TABLE IF EXISTS "character_gathering_levels";
CREATE TABLE "character_gathering_levels" (
  "character_id" integer NOT NULL,
  "skill_id" integer NOT NULL,
  "level" integer DEFAULT 1,
  "xp" integer DEFAULT 0,
  "total_gathered" integer DEFAULT 0,
  PRIMARY KEY ("character_id","skill_id")
);
DROP TABLE IF EXISTS "character_items";
CREATE TABLE "character_items" (
  "character_id" integer NOT NULL,
  "item_id" integer NOT NULL,
  "quantity" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("character_id","item_id"),
  UNIQUE ("character_id","item_id")
);
INSERT INTO "character_items" VALUES
(1,101,26);
DROP TABLE IF EXISTS "character_known_spells";
CREATE TABLE "character_known_spells" (
  "id" integer NOT NULL,
  "character_id" integer NOT NULL,
  "spell_id" integer NOT NULL,
  "learned_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("character_id","spell_id")
);
DROP TABLE IF EXISTS "character_learned_recipes";
CREATE TABLE "character_learned_recipes" (
  "id" integer NOT NULL,
  "character_id" integer NOT NULL,
  "recipe_id" integer NOT NULL,
  "learned_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("character_id","recipe_id")
);
DROP TABLE IF EXISTS "character_oghams";
CREATE TABLE "character_oghams" (
  "id" integer NOT NULL,
  "character_id" integer NOT NULL,
  "item_id" integer NOT NULL DEFAULT 0,
  "slot_index" integer NOT NULL DEFAULT 0,
  "ogham_id" integer NOT NULL,
  "current_rank" integer NOT NULL DEFAULT 1,
  "kill_count" integer NOT NULL DEFAULT 0,
  "corruption_points" integer NOT NULL DEFAULT 0,
  "unlocked_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  "source" varchar(64) DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("character_id","item_id","slot_index")
);
DROP TABLE IF EXISTS "character_progress_counters";
CREATE TABLE "character_progress_counters" (
  "id" integer NOT NULL,
  "character_id" integer NOT NULL,
  "counter_key" varchar(64) NOT NULL,
  "value" bigint NOT NULL DEFAULT 0,
  "meta_json" text DEFAULT NULL,
  "updated_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("character_id","counter_key")
);
DROP TABLE IF EXISTS "character_seen_tiles";
CREATE TABLE "character_seen_tiles" (
  "character_id" integer NOT NULL,
  "map_id" integer NOT NULL,
  "x" integer NOT NULL,
  "y" integer NOT NULL,
  "first_seen_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("character_id","map_id","x","y")
);
DROP TABLE IF EXISTS "character_spell_cooldowns";
CREATE TABLE "character_spell_cooldowns" (
  "id" integer NOT NULL,
  "character_id" integer NOT NULL,
  "spell_key" varchar(64) NOT NULL,
  "ready_at_unix_ms" bigint NOT NULL DEFAULT 0,
  PRIMARY KEY ("id"),
  UNIQUE ("character_id","spell_key")
);
DROP TABLE IF EXISTS "character_titles";
CREATE TABLE "character_titles" (
  "id" integer NOT NULL,
  "character_id" integer NOT NULL,
  "title_id" integer NOT NULL,
  "earned_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("character_id","title_id")
);
DROP TABLE IF EXISTS "characters";
CREATE TABLE "characters" (
  "id" integer NOT NULL,
  "user_id" integer DEFAULT NULL,
  "level" integer DEFAULT 1,
  "experience" integer DEFAULT 0,
  "gold" integer DEFAULT 0,
  "alignment" varchar(32) DEFAULT 'neutral',
  "current_hp" integer DEFAULT 100,
  "max_hp" integer DEFAULT 100,
  "x" integer DEFAULT 0,
  "y" integer DEFAULT 0,
  "map_id" integer DEFAULT NULL,
  "anam_current" integer NOT NULL DEFAULT 100,
  "anam_max" integer NOT NULL DEFAULT 100,
  "anam_regen_per_sec" integer NOT NULL DEFAULT 1,
  "vision_radius" integer NOT NULL DEFAULT 5,
  "name" varchar(64) NOT NULL DEFAULT 'Wanderer',
  "class_id" integer  NOT NULL DEFAULT 1,
  "race_id" integer  NOT NULL DEFAULT 1,
  "background_id" integer  NOT NULL DEFAULT 0,
  "feat_id" integer  NOT NULL DEFAULT 0,
  "current_mp" integer NOT NULL DEFAULT 50,
  "max_mp" integer NOT NULL DEFAULT 50,
  "atk" integer NOT NULL DEFAULT 10,
  "def" integer NOT NULL DEFAULT 5,
  "mo" integer NOT NULL DEFAULT 5,
  "md" integer NOT NULL DEFAULT 5,
  "speed" integer NOT NULL DEFAULT 10,
  "luck" integer NOT NULL DEFAULT 5,
  "portrait_url" varchar(255) DEFAULT NULL,
  "sprite_url" varchar(255) DEFAULT NULL,
  "visual_prompt" text DEFAULT NULL,
  "action_map" text   DEFAULT NULL ,
  "state_json" text DEFAULT NULL,
  "subclass_id" integer  DEFAULT NULL,
  PRIMARY KEY ("id")
);
INSERT INTO "characters" VALUES
(1,NULL,1,0,22,'neutral',100,100,6,12,1,100,100,1,5,'TestHero',1,1,0,0,50,50,16,5,16,5,16,16,NULL,NULL,NULL,NULL,NULL,NULL);
DROP TABLE IF EXISTS "game_achievements";
CREATE TABLE "game_achievements" (
  "id" integer NOT NULL,
  "key_name" varchar(64) NOT NULL,
  "title" varchar(64) NOT NULL,
  "description" text DEFAULT NULL,
  "icon" varchar(16) NOT NULL DEFAULT '?',
  "category" varchar(32) NOT NULL DEFAULT 'other',
  "trigger_type" varchar(32) NOT NULL DEFAULT 'manual',
  "trigger_value" integer NOT NULL DEFAULT 1,
  "reward_gold" integer NOT NULL DEFAULT 0,
  "reward_title" varchar(64) DEFAULT NULL,
  "is_hidden" smallint NOT NULL DEFAULT 0,
  "is_active" smallint NOT NULL DEFAULT 1,
  "sort_order" integer NOT NULL DEFAULT 0,
  "reward_json" text DEFAULT NULL,
  "points" integer NOT NULL DEFAULT 10,
  PRIMARY KEY ("id"),
  UNIQUE ("key_name")
);
DROP TABLE IF EXISTS "game_action_windows";
CREATE TABLE "game_action_windows" (
  "id" integer  NOT NULL,
  "ruleset_id" integer  NOT NULL,
  "action_type" varchar(32) NOT NULL,
  "label" varchar(64) NOT NULL,
  "icon" varchar(16) DEFAULT NULL,
  "window_type" varchar(64) NOT NULL DEFAULT 'daily_pool',
  "max_uses_per_day" integer  DEFAULT NULL,
  "max_uses_per_window" integer  DEFAULT 1,
  "block_count" integer  DEFAULT 4,
  "block_start_hour" integer  DEFAULT 2,
  "reset_time" varchar(8) DEFAULT '00:00',
  "reset_timezone" varchar(32) DEFAULT 'America/New_York',
  "effect_json" text   DEFAULT NULL ,
  "min_level" integer  DEFAULT 0,
  "requires_opponent" smallint NOT NULL DEFAULT 0,
  "requires_master" smallint NOT NULL DEFAULT 0,
  "blocked_in_combat" smallint NOT NULL DEFAULT 1,
  "sort_order" integer  DEFAULT 0,
  "is_active" smallint NOT NULL DEFAULT 1,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_autotile_groups";
CREATE TABLE "game_autotile_groups" (
  "id" integer NOT NULL,
  "name" varchar(128) NOT NULL,
  "group_key" varchar(64) NOT NULL,
  "payload_json" text DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("group_key")
);
DROP TABLE IF EXISTS "game_backgrounds";
CREATE TABLE "game_backgrounds" (
  "id" integer  NOT NULL,
  "name" varchar(64) NOT NULL,
  "description" text DEFAULT NULL,
  "bonus_hp" integer NOT NULL DEFAULT 0,
  "bonus_mp" integer NOT NULL DEFAULT 0,
  "bonus_str" varchar(64) DEFAULT NULL,
  "icon" varchar(32) NOT NULL DEFAULT '?',
  "bonus_atk" integer NOT NULL DEFAULT 0,
  "bonus_def" integer NOT NULL DEFAULT 0,
  "bonus_mo" integer NOT NULL DEFAULT 0,
  "bonus_md" integer NOT NULL DEFAULT 0,
  "bonus_speed" integer NOT NULL DEFAULT 0,
  "bonus_luck" integer NOT NULL DEFAULT 0,
  "tag" varchar(64) NOT NULL DEFAULT 'wanderer',
  "npc_reaction" text DEFAULT NULL,
  "companion_reaction" text DEFAULT NULL,
  "enemy_reaction" text DEFAULT NULL,
  "reaction_json" text   DEFAULT NULL ,
  PRIMARY KEY ("id")
);
INSERT INTO "game_backgrounds" VALUES
(1,'Outlander (Wilds Wanderer)','Hardy survivor of uncharted frontiers, beast-haunted forests, and treacherous mountain passes.',25,0,'HP+25, DEF+2, ATK+1','🌲',1,2,0,1,1,0,'outlander','Wilderness guides, scouts, and hermits share hidden paths; city guards remain suspicious of your rough demeanor.','Survivalist and beast companions gain +15 Morale; sheltered highborn companions rely on your outdoor knowledge.','Wild predators hesitate before striking (15% pacify chance); beastmen enemies treat you as an alpha rival.','{"disposition": {"wilds": 25, "guards": -10, "scouts": 20}, "companion_affinity": ["survivalist", "feral", "ranger"], "enemy_pacify_mod": 15, "dialogue_tags": ["wilderness_lore", "beast_tongue", "trailblazer"]}'),
(2,'Urchin (Alley Phantom)','Raised in the shadow of gothic metropolis alleys and rooftops, surviving on pickpocketing and cunning.',10,5,'SPD+3, LCK+2, HP+10','🐀',1,0,0,1,3,2,'urchin','Street urchins, beggars, and fences share black market rumors and hidden smuggling escape routes.','Rogue and outcast companions bond deeply (+20 loyalty); lawful companions may scold opportunistic thievery.','Gutter gangs, cutthroats, and city bandits recognize gutter cant, reducing surprise ambush penalties.','{"disposition": {"underworld": 25, "nobles": -15, "guards": -15}, "companion_affinity": ["rogue", "outcast", "street"], "enemy_pacify_mod": 10, "dialogue_tags": ["streetwise", "gutter_cant", "pickpocket"]}'),
(3,'Noble Heir (Highborn Blood)','Scion of an ancient lineage with royal pedigree, ancestral heraldry, and deep political influence.',15,15,'HP+15, MP+15, LCK+3, +100 Gold','👑',1,1,1,1,0,3,'noble','Aristocrats, court envoys, and high merchants grant entry to private manors and offer luxury trade discounts.','Knightly companions swear fealty with pride; peasant or revolutionary companions question your privilege.','Humanoid bandits and mercenary captains attempt to ransom you rather than fighting to the bitter death.','{"disposition": {"nobles": 35, "merchants": 20, "rebels": -25}, "companion_affinity": ["knight", "scholar", "courtier"], "enemy_ransom_mod": 30, "dialogue_tags": ["highborn_pedigree", "court_etiquette", "heraldry"]}'),
(4,'Haunted Veteran (Grave-Marked)','Survived an unspeakable supernatural nightmare that claimed your unit, bearing icy resolve and eerie presence.',20,10,'HP+20, MDEF+3, ATK+2','🕯️',2,1,1,3,0,-1,'haunted','Occultists, morticians, and exorcists offer dark insights; superstitious townsfolk shudder in your wake.','Battle-hardened companions respect your unbreakable quiet stoicism; cheerful companions find you chilling.','Undead, specters, and tomb horrors sense your death-mark, hesitating or muttering in spectral tongues.','{"disposition": {"occult": 25, "clergy": 10, "commoners": -15}, "companion_affinity": ["veteran", "necromancer", "grim"], "enemy_fear_mod": 20, "dialogue_tags": ["supernatural_sight", "ghost_whisper", "death_resilience"]}'),
(5,'Gladiator (Pit Champion)','Crowned champion of blood-soaked arena pits, forging lethal weapon discipline and crowd showmanship.',30,0,'HP+30, ATK+3, DEF+2','🏟️',3,2,0,0,1,-1,'gladiator','Tavern patrons, weapon-masters, and bouncers cheer your fame; strict lawmakers treat you as volatile muscle.','Martial companions gain inspiration from your brutal flair, boosting their critical hit morale.','Rival humanoid combatants suffer morale penalties (-10% enemy morale); wild arena beasts fight with frenzied fury.','{"disposition": {"crowds": 30, "mercenaries": 25, "magistrates": -10}, "companion_affinity": ["warrior", "berserker", "brawler"], "enemy_morale_penalty": 15, "dialogue_tags": ["arena_swagger", "crowd_pleaser", "executioner_gauge"]}'),
(6,'Acolyte (Temple Blessed)','Devoted early years to cloistered cathedral sanctums, steeped in sacred scriptures and restorative blessings.',10,30,'MP+30, MDEF+3, MAG+2, HP+10','✨',0,1,2,3,0,1,'acolyte','Clerics, pilgrims, and temple healers offer free sanctuary, holy blessings, and medicinal triage.','Devout and righteous companions rally around your faith; heretical companions debate your dogma.','Demonic cultists prioritize you as a righteous threat; penitent outlaws may seek absolution and surrender.','{"disposition": {"clergy": 35, "pilgrims": 30, "fiends": -30}, "companion_affinity": ["cleric", "paladin", "righteous"], "enemy_surrender_mod": 20, "dialogue_tags": ["holy_scripture", "sacred_rites", "divine_empathy"]}'),
(7,'Guild Artisan (Master Forger)','Licensed guild master of metals, gems, and forge secrets, with an unmatched eye for craftsmanship and commerce.',15,10,'HP+15, DEF+2, LCK+3','🔨',1,2,1,1,0,3,'artisan','Blacksmiths, traders, and guild masters provide wholesale discounts and reveal rare crafting recipes.','Companions appreciate regular weapon and armor maintenance, gaining passive gear durability buffs.','Scavengers and goblin tinkerers can be bribed with rare alloy scrap to avoid needless bloodshed.','{"disposition": {"guilds": 30, "merchants": 25, "thieves": -10}, "companion_affinity": ["artificer", "smith", "mercantile"], "enemy_bribe_mod": 25, "dialogue_tags": ["guild_appraisal", "alloy_lore", "trade_barter"]}'),
(8,'Shadow Syndicate (Underworld Enforcer)','Veteran enforcer of black market syndicates, feared across backstreets for swift intimidation and iron oaths.',15,10,'ATK+2, SPD+2, HP+15','🗡️',2,1,0,1,2,1,'syndicate','Smugglers, fences, and crime barons grant access to illicit contraband; city magistrates mark you for scrutiny.','Morally flexible companions obey orders without question; idealistic companions question your methods.','Underworld thugs and mercenary squads recognize your rank, showing high willingness to yield in combat.','{"disposition": {"syndicate": 35, "smugglers": 25, "lawmen": -20}, "companion_affinity": ["rogue", "mercenary", "assassin"], "enemy_intimidate_mod": 25, "dialogue_tags": ["underworld_code", "racketeering", "shakedown"]}'),
(9,'Arcane Scholar (Academy Archivist)','Researcher from the Grand Athenaeum with mastery over forgotten astral scripts and forbidden historical texts.',10,35,'MP+35, MAG+3, MDEF+3, HP+10','📚',0,0,3,3,0,1,'scholar','Mages, archivists, and librarians open restricted spell repositories and decipher planar artifacts.','Spellcaster companions engage in deep arcane study with you, unlocking enhanced MP regeneration.','Enchanted arcane constructs and rune sentinels recognize academic passcodes, bypassing auto-engagement.','{"disposition": {"scholars": 35, "mages": 25, "anti_magic": -20}, "companion_affinity": ["mage", "wizard", "academic"], "enemy_bypass_constructs": 30, "dialogue_tags": ["ancient_languages", "astral_theory", "glyph_decoding"]}'),
(10,'Bounty Hunter (Grave Hound)','Relentless frontier tracker hunting marked outlaws and dangerous beasts across desolate wilderness.',20,10,'HP+20, ATK+2, SPD+2','🎯',2,1,0,1,2,1,'bounty_hunter','Sheriffs, bailiffs, and tavern keepers provide high-reward contract notices and target locations.','Pragmatic, goal-oriented companions thrive on your disciplined professionalism and fair cut splits.','Wanted bandit leaders and rogue warlords fight with desperate fury, knowing they are cornered.','{"disposition": {"lawmen": 25, "guilds": 20, "outlaws": -35}, "companion_affinity": ["ranger", "mercenary", "tracker"], "enemy_outlaw_desperation": 20, "dialogue_tags": ["manhunter", "tracking_instinct", "bounty_ledger"]}'),
(11,'Battle Medic (Frontline Healer)','Field surgeon who stitched together severed limbs and treated magical burns during grueling siege campaigns.',25,20,'HP+25, MP+20, DEF+2, MDEF+2','🩹',1,2,1,2,0,1,'battle_medic','Wounded soldiers, village healers, and guards greet you with deep reverence and gift healing salves.','All companions rest easier in camp, recovering an extra 25% health and stamina during downtime.','Intelligent enemy commanders instruct their squads to flank you, while injured grunts plead for mercy.','{"disposition": {"soldiers": 30, "villagers": 25, "apothecaries": 25}, "companion_affinity": ["all", "healer", "soldier"], "enemy_target_priority": 15, "dialogue_tags": ["triage_expert", "field_surgery", "herbal_balms"]}'),
(12,'Hermit Mystic (Star Seer)','Lived in seclusion atop solitary peaks, gazing into the celestial veil to decipher prophetic constellations.',15,25,'MP+25, LCK+3, MAG+2, HP+15','🌌',0,1,2,2,0,3,'mystic','Astrologers, wandering shamans, and seers reveal hidden astronomical portents and leylines.','Philosophical companions find calming clarity; aggressive hotheads grow impatient with your riddles.','Eldritch aberrations and void entities pause to converse in telepathic whispers before engaging.','{"disposition": {"mystics": 35, "druids": 20, "bureaucrats": -15}, "companion_affinity": ["druid", "mystic", "monk"], "enemy_eldritch_commune": 25, "dialogue_tags": ["stellar_prophecy", "cosmic_vision", "tranquil_mind"]}'),
(13,'Caravan Guard (Dune Vanguard)','Defended vital merchant supply lines across monster-infested deserts and bandit ambushes.',25,5,'HP+25, DEF+3, ATK+2','🛡️',2,3,0,1,1,0,'caravan_guard','Wandering traders, drovers, and roadhouse keepers offer free supplies and reliable escort jobs.','Companions gain teamwork defensive bonuses whenever flanked or surprised during travel.','Highwaymen and desert raiders treat you as an unmovable obstacle, requiring higher payoffs to yield.','{"disposition": {"merchants": 30, "quartermasters": 20, "raiders": -25}, "companion_affinity": ["vanguard", "defender", "team_player"], "enemy_highway_standoff": 20, "dialogue_tags": ["convoy_tactics", "perimeter_watch", "road_lore"]}'),
(14,'Court Diplomat (Silver Tongue)','Master of statecraft, negotiation, and delicate etiquette, capable of disarming hostility with a single phrase.',10,20,'LCK+3, MP+20, HP+10, DEF+1','🕊️',0,1,1,1,1,3,'diplomat','Ambassadors, lords, and town magistrates grant diplomatic immunity and permit peaceful parley.','Companion arguments are smoothed over instantly; party morale rarely plummets after setbacks.','Enemy captains and warlords are far more receptive to mid-combat truces and parley (+25% negotiation).','{"disposition": {"nobility": 25, "diplomats": 35, "fanatics": -15}, "companion_affinity": ["bard", "noble", "peacemaker"], "enemy_negotiation_mod": 25, "dialogue_tags": ["peace_broker", "de-escalation", "subtle_flattery"]}'),
(15,'Witch-Marked (Curse-Bearer)','Branded by a dark coven at infancy, surviving an ancient hex that left you resilient to black sorcery.',15,25,'HP+15, MP+25, MAG+3, MDEF+2','🔮',1,0,3,2,0,1,'witch_marked','Superstitious commoners avert their gaze; witch covens and shamans greet you as an awakened sibling.','Occult companions are fascinated by your dark mark; pious companions offer prayers to cleanse you.','Dark cultists, hags, and shadow beasts attempt to recruit or bargain rather than immediately attack.','{"disposition": {"witches": 30, "shamans": 20, "inquisition": -30}, "companion_affinity": ["warlock", "witch_hunter", "sorcerer"], "enemy_coven_recruitment": 20, "dialogue_tags": ["hex_immunity", "coven_whispers", "curse_sight"]}'),
(16,'Sailor Corsair (Storm Mariner)','Hardened salt mariner who weathered leviathan storms, privateer raids, and dangerous coastal reefs.',20,10,'HP+20, ATK+2, SPD+2','⚓',2,1,0,1,2,1,'sailor','Harbor captains, fishermen, and dockside innkeepers share nautical charts, ship passages, and rumors.','Free-spirited companions bond over sea shanties and rum, fighting with spirited camaraderie.','Pirates and sea marauders treat you as a brother of the tide; aquatic predators can be lured away.','{"disposition": {"mariners": 35, "dockworkers": 25, "landlords": -10}, "companion_affinity": ["rogue", "corsair", "brawler"], "enemy_pirate_parley": 25, "dialogue_tags": ["sea_shanty", "nautical_navigation", "tide_reading"]}'),
(17,'Dungeon Scavenger (Ruin Delver)','Plundered sunken crypts, forgotten dwarf halls, and lethal catacombs, developing sixth-sense trap avoidance.',20,15,'HP+20, MP+15, DEF+2, LCK+2','🗝️',1,2,1,1,1,2,'ruin_delver','Antiquarians, trap-smiths, and relic collectors purchase subterranean salvage at premium coin rates.','Companions receive automatic trap detection alerts and secret wall notifications while delving ruins.','Dungeon vermin, mimics, and subterranean cave crawlers fail to catch your party by surprise.','{"disposition": {"antiquarians": 30, "miners": 20, "curators": 20}, "companion_affinity": ["scout", "artisan", "treasure_seeker"], "enemy_ambush_negation": 30, "dialogue_tags": ["trap_disarm", "ancient_masonry", "dungeon_cartography"]}'),
(18,'Inquisitor Veteran (Heresy Hunter)','Steel-willed investigator for the Order of Truth, experienced in rooting out corruption, demons, and heretics.',25,15,'HP+25, DEF+2, ATK+2, MDEF+2','⚖️',2,2,1,2,0,0,'inquisitor_vet','Orthodox clerics and magistrates open restricted archives; secretive occultists scatter in panic.','Disciplined crusader companions rally to your side; magical or non-human companions guard their secrets.','Demons and heretic cult leaders taunt your zeal, fighting to the death with fanatical ferocity.','{"disposition": {"inquisition": 35, "guard": 20, "occultists": -35}, "companion_affinity": ["paladin", "cleric", "crusader"], "enemy_fanatic_clash": 25, "dialogue_tags": ["interrogation", "heresy_detection", "holy_inquest"]}'),
(19,'Fey-Touched (Dream Strider)','Wandered into an otherworldly fey crossing as a child, returning gifted with strange glamour and luck.',15,25,'MP+25, HP+15, MAG+2, SPD+2, LCK+2','🦋',0,1,2,2,2,2,'fey_touched','Woodland sprites, fey emissaries, and eccentric bards find your aura delightfully intoxicating.','Companions benefit from your whimsical fey luck, gaining an extra 5% chance for critical strikes.','Fey beasts and illusory spirits cannot bewitch or charm you; nightmare demons are drawn to your essence.','{"disposition": {"fey": 35, "bards": 25, "witch_hunters": -20}, "companion_affinity": ["fey", "sorcerer", "bard"], "enemy_charm_immunity": 100, "dialogue_tags": ["fey_glamour", "dream_weaving", "riddle_speech"]}'),
(20,'Clockwork Engineer (Machinist)','Pioneering artificer of brass cogs, steam pistons, and galvanic cells, blending craft with machine logic.',20,20,'HP+20, MP+20, DEF+2, MAG+2','⚙️',1,2,2,1,1,1,'machinist','Inventors, gunsmiths, and academic engineers trade advanced blueprints and rare galvanic components.','Mechanical and construct companions gain +30% repair efficiency and stat calibrations.','Automaton sentries, mechanical drones, and clockwork bosses can be temporarily scrambled or hacked.','{"disposition": {"inventors": 35, "machinists": 30, "primal_tribes": -15}, "companion_affinity": ["construct", "artificer", "forgeborn"], "enemy_automaton_hack": 30, "dialogue_tags": ["clockwork_diagnostics", "steam_overdrive", "galvanic_wiring"]}');
DROP TABLE IF EXISTS "game_battle_commands";
CREATE TABLE "game_battle_commands" (
  "id" integer  NOT NULL,
  "name" varchar(64) NOT NULL,
  "icon" varchar(8) DEFAULT '⚔️',
  "description" text DEFAULT NULL,
  "action_type" varchar(64) NOT NULL DEFAULT 'attack',
  "target_type" varchar(32) NOT NULL DEFAULT 'ENEMY',
  "is_default" smallint NOT NULL DEFAULT 0,
  "display_order" integer NOT NULL DEFAULT 0,
  "class_ids" text   DEFAULT NULL ,
  "effects" text   DEFAULT NULL ,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_battle_referees";
CREATE TABLE "game_battle_referees" (
  "id" integer  NOT NULL,
  "battle_id" integer  NOT NULL,
  "user_id" integer  NOT NULL,
  "can_pause" smallint NOT NULL DEFAULT 1,
  "can_end" smallint NOT NULL DEFAULT 1,
  "joined_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("battle_id","user_id")
);
DROP TABLE IF EXISTS "game_battle_rules";
CREATE TABLE "game_battle_rules" (
  "key" varchar(80) NOT NULL,
  "name" varchar(120) NOT NULL,
  "description" text DEFAULT NULL,
  "trigger_event" varchar(64) NOT NULL,
  "condition_json" text DEFAULT NULL,
  "effect_json" text NOT NULL,
  "priority" integer DEFAULT 100,
  "enabled" smallint DEFAULT 1,
  "updated_at" timestamp NOT NULL,
  PRIMARY KEY ("key")
);
INSERT INTO "game_battle_rules" VALUES
('fire_melts_freeze','Fire element melts Freeze','','damage_taken','{"element":"fire","has_status":"freeze"}','{"remove_status":"freeze","to":"victim"}',120,1,'2026-09-03 07:15:53'),
('ko_interrogation','Knockout → Interrogation Prompt','','ko','{"nonlethal":true}','{"queue_event":"interrogation_prompt","to":"victim"}',100,1,'2026-09-03 07:15:53'),
('limb_break_head','Head Break → Knockout','','limb_broken','{"limb":"head"}','{"knockout":true,"queue_event":"interrogation_prompt","to":"victim"}',100,1,'2026-09-03 07:15:53'),
('limb_break_left_arm','Left Arm Break → Cripple','','limb_broken','{"limb":"left_arm"}','{"apply_status":"cripple_arm_left","to":"victim"}',100,1,'2026-09-03 07:15:53'),
('limb_break_left_leg','Left Leg Break → Cripple','','limb_broken','{"limb":"left_leg"}','{"apply_status":"cripple_leg_left","to":"victim"}',100,1,'2026-09-03 07:15:53'),
('limb_break_right_arm','Right Arm Break → Cripple','','limb_broken','{"limb":"right_arm"}','{"apply_status":"cripple_arm_right","to":"victim"}',100,1,'2026-09-03 07:15:53'),
('limb_break_right_leg','Right Leg Break → Cripple','','limb_broken','{"limb":"right_leg"}','{"apply_status":"cripple_leg_right","to":"victim"}',100,1,'2026-09-03 07:15:53'),
('limb_break_torso','Torso Break → Wound','','limb_broken','{"limb":"torso"}','{"apply_status":"cripple_torso","to":"victim"}',100,1,'2026-09-03 07:15:53'),
('limit_gauge_on_damage','Limit Gauge Fill on Damage','','damage_taken','{}','{"increment_limit_gauge":true,"to":"victim"}',50,1,'2026-09-03 07:15:53'),
('sleep_wake_on_damage','Sleep — Wake on Damage','','damage_taken','{"has_status":"sleep"}','{"remove_status":"sleep","to":"victim"}',100,1,'2026-09-03 07:15:53');
DROP TABLE IF EXISTS "game_battle_statuses";
CREATE TABLE "game_battle_statuses" (
  "key" varchar(80) NOT NULL,
  "name" varchar(120) NOT NULL,
  "description" text DEFAULT NULL,
  "icon" varchar(16) DEFAULT '⚡',
  "category" varchar(32) DEFAULT 'debuff',
  "default_duration" integer DEFAULT 3,
  "permanent" smallint DEFAULT 0,
  "stacking" varchar(16) DEFAULT 'refresh',
  "max_stacks" integer DEFAULT 1,
  "effects_json" text DEFAULT NULL,
  "tick_json" text DEFAULT NULL,
  "disabled_commands_json" text DEFAULT NULL,
  "cure_tags_json" text DEFAULT NULL,
  "on_apply_script_id" integer DEFAULT NULL,
  "on_tick_script_id" integer DEFAULT NULL,
  "on_expire_script_id" integer DEFAULT NULL,
  "enabled" smallint DEFAULT 1,
  "updated_at" timestamp NOT NULL,
  PRIMARY KEY ("key")
);
INSERT INTO "game_battle_statuses" VALUES
('berserk','Berserk','+50% ATK, -25% DEF, auto-attacks only.','😤','control',4,0,'refresh',1,'{"atk_mult":1.5,"berserk":true,"def_mult":0.75}','{}','[]','["mind","berserk"]',NULL,NULL,NULL,1,'2026-09-03 07:15:52'),
('bleed_heavy','Heavy Bleed','Catastrophic blood loss — 5% max HP for 5 turns, slows.','💉','dot',5,0,'refresh',1,'{"atk_mult":0.9,"speed_mult":0.8}','{"amount":0.05,"damage_type":"physical","kind":"dot_pct_max"}','[]','["bleed"]',NULL,NULL,NULL,1,'2026-09-03 07:15:52'),
('bleed_light','Light Bleed','Slow blood loss — 3% max HP per turn for 2 turns.','🩸','dot',2,0,'refresh',1,'{}','{"amount":0.03,"damage_type":"physical","kind":"dot_pct_max"}','[]','["bleed"]',NULL,NULL,NULL,1,'2026-09-03 07:15:52'),
('bleed_moderate','Moderate Bleed','Serious hemorrhage — 3% max HP for 4 turns.','🩸','dot',4,0,'refresh',1,'{"speed_mult":0.9}','{"amount":0.03,"damage_type":"physical","kind":"dot_pct_max"}','[]','["bleed"]',NULL,NULL,NULL,1,'2026-09-03 07:15:52'),
('blind','Blinded','-60% accuracy.','🌑','debuff',3,0,'refresh',1,'{"miss_chance_bonus":0.6}','{}','[]','["blind"]',NULL,NULL,NULL,1,'2026-09-03 07:15:52'),
('burn','Burning','Flames devour armor — 3% max HP per turn, -15% DEF.','🔥','dot',4,0,'refresh',1,'{"def_mult":0.85}','{"amount":0.03,"damage_type":"fire","kind":"dot_pct_max"}','[]','["burn","fire"]',NULL,NULL,NULL,1,'2026-09-03 07:15:52'),
('confuse','Confused','May attack allies or self.','❓','control',3,0,'refresh',1,'{"confused":true}','{}','[]','["confuse","mind"]',NULL,NULL,NULL,1,'2026-09-03 07:15:52'),
('cripple_arm_left','Left Arm Crippled','Left arm disabled — -25% ATK, cannot dual-wield.','💔','injury',99,1,'ignore',1,'{"atk_mult":0.75,"no_dual_wield":true}','{}','[]','["injury","limb"]',NULL,NULL,NULL,1,'2026-09-03 07:15:53'),
('cripple_arm_right','Right Arm Crippled','Right arm disabled — -40% ATK, drops weapon.','💔','injury',99,1,'ignore',1,'{"atk_mult":0.6,"drop_weapon":true}','{}','[]','["injury","limb"]',NULL,NULL,NULL,1,'2026-09-03 07:15:53'),
('cripple_leg_left','Left Leg Crippled','-40% speed, dodge cap halved.','🦵','injury',99,1,'ignore',1,'{"dodge_ceiling":0.45,"speed_mult":0.6}','{}','[]','["injury","limb"]',NULL,NULL,NULL,1,'2026-09-03 07:15:53'),
('cripple_leg_right','Right Leg Crippled','-40% speed, dodge cap halved.','🦵','injury',99,1,'ignore',1,'{"dodge_ceiling":0.45,"speed_mult":0.6}','{}','[]','["injury","limb"]',NULL,NULL,NULL,1,'2026-09-03 07:15:53'),
('cripple_torso','Torso Wounded','Bleeding from the core — heavy bleed + -20% DEF.','🫀','injury',99,1,'ignore',1,'{"def_mult":0.8}','{"amount":0.04,"damage_type":"physical","kind":"dot_pct_max"}','[]','["injury","bleed"]',NULL,NULL,NULL,1,'2026-09-03 07:15:53'),
('freeze','Frozen','Encased in ice — cannot act. Fire breaks the ice.','❄️','control',2,0,'refresh',1,'{"damage_taken_mult":1.5,"prevent_action":true,"prevent_move":true}','{}','[]','["freeze","ice"]',NULL,NULL,NULL,1,'2026-09-03 07:15:52'),
('haste','Hasted','+50% speed, cooldowns tick 50% faster.','⚡','buff',4,0,'refresh',1,'{"cooldown_rate":1.5,"speed_mult":1.5}','{}','[]','[]',NULL,NULL,NULL,1,'2026-09-03 07:15:52'),
('poison','Poisoned','Toxins course through — 4% max HP per turn, 5 turns.','☠️','dot',5,0,'refresh',1,'{"atk_mult":0.9}','{"amount":0.04,"damage_type":"poison","kind":"dot_pct_max"}','[]','["poison"]',NULL,NULL,NULL,1,'2026-09-03 07:15:52'),
('regen','Regenerating','Restores 5% max HP per turn.','💚','hot',4,0,'refresh',1,'{}','{"amount":0.05,"kind":"hot_pct_max"}','[]','[]',NULL,NULL,NULL,1,'2026-09-03 07:15:52'),
('shield','Shielded','Halves incoming damage.','🛡','buff',3,0,'refresh',1,'{"damage_taken_mult":0.5}','{}','[]','[]',NULL,NULL,NULL,1,'2026-09-03 07:15:52'),
('silence','Silenced','Cannot cast magic.','🤐','control',3,0,'refresh',1,'{"prevent_magic":true}','{}','[]','["silence"]',NULL,NULL,NULL,1,'2026-09-03 07:15:52'),
('sleep','Asleep','Unconscious in battle. Damage wakes the target.','💤','control',3,0,'refresh',1,'{"damage_taken_mult":1.3,"prevent_action":true,"prevent_move":true,"wake_on_damage":true}','{}','[]','["sleep"]',NULL,NULL,NULL,1,'2026-09-03 07:15:52'),
('slow','Slowed','-40% speed, cooldowns tick 40% slower.','🐌','debuff',4,0,'refresh',1,'{"cooldown_rate":0.6,"speed_mult":0.6}','{}','[]','[]',NULL,NULL,NULL,1,'2026-09-03 07:15:52'),
('stun','Stunned','Dazed — skip next action, dodge halved.','💫','control',1,0,'refresh',1,'{"dodge_ceiling":0.45,"prevent_action":true}','{}','[]','["stun"]',NULL,NULL,NULL,1,'2026-09-03 07:15:52');
DROP TABLE IF EXISTS "game_bounty_boards";
CREATE TABLE "game_bounty_boards" (
  "id" integer NOT NULL,
  "board_key" varchar(64) NOT NULL,
  "name" varchar(128) NOT NULL,
  "location_name" varchar(128) NOT NULL DEFAULT 'Lowtown Alleyway',
  "faction" varchar(64) NOT NULL DEFAULT 'syndicate',
  "description" text DEFAULT NULL,
  "map_id" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("board_key")
);
INSERT INTO "game_bounty_boards" VALUES
(167,'syndicate_board','Lowtown Syndicate Shadow Notice','The Prancing Mare Cellar','syndicate','Unofficial contracts posted in blood and cipher by the Underworld Council.',1,'2026-09-09 10:37:18'),
(168,'iron_watch_board','Iron Watch Magistrate Warrants','Town Gate Barracks','city_watch','Official wanted posters sanctioned by Captain Vane and the Magistrate.',1,'2026-09-09 10:37:18');
DROP TABLE IF EXISTS "game_bounty_tasks";
CREATE TABLE "game_bounty_tasks" (
  "id" integer NOT NULL,
  "board_id" integer NOT NULL,
  "target_npc_id" integer DEFAULT NULL,
  "target_name" varchar(128) NOT NULL,
  "target_icon" varchar(16) NOT NULL DEFAULT '?',
  "contract_type" varchar(32) NOT NULL DEFAULT 'dead_or_alive',
  "difficulty" varchar(32) NOT NULL DEFAULT 'medium',
  "crime_desc" text NOT NULL,
  "location_hint" varchar(128) NOT NULL DEFAULT 'Old Town Quarters',
  "reward_gold" integer NOT NULL DEFAULT 150,
  "reward_xp" integer NOT NULL DEFAULT 300,
  "reward_rep" integer NOT NULL DEFAULT 25,
  "is_active" smallint NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
INSERT INTO "game_bounty_tasks" VALUES
(333,167,NULL,'Silas the Shadow Fence','🗡️','wanted_alive','hard','Embezzled five crates of smuggled Valyrian fire tincture. Bring him in breathing for syndicate questioning.','South Alley Cellar behind the tavern',320,500,40,1,'2026-09-09 10:37:18'),
(334,167,NULL,'Grendel the Shadow Prowler','👤','dead_or_alive','expert','Double-crossed the thieves'' ring and marked three scouts for assassination.','Rooftops and abandoned watchtowers',450,750,60,1,'2026-09-09 10:37:18'),
(335,168,NULL,'Malakor the Ashveil Cultist','💀','wanted_dead','lethal','Sacrificing stray guards at the Cathedral alter to summon the Ashveil Colossus.','Sunken crypts beneath the Old Cathedral',600,1200,80,1,'2026-09-09 10:37:18'),
(336,168,NULL,'Rival Cutpurse Guildmaster','🧤','wanted_alive','medium','Pickpocketed the High Inquisitor''s seal of office. Retrieve the seal and bring the thief in irons.','Crowded market square near Barnaby''s stall',220,350,30,1,'2026-09-09 10:37:18');
DROP TABLE IF EXISTS "game_buildings";
CREATE TABLE "game_buildings" (
  "id" integer NOT NULL,
  "map_id" integer NOT NULL,
  "building_key" varchar(64) NOT NULL,
  "name" varchar(128) NOT NULL,
  "building_type" varchar(32) NOT NULL DEFAULT 'house',
  "exterior_door_x" integer NOT NULL,
  "exterior_door_y" integer NOT NULL,
  "interior_map_id" integer NOT NULL,
  "interior_door_x" integer NOT NULL DEFAULT 5,
  "interior_door_y" integer NOT NULL DEFAULT 8,
  "windows_json" text DEFAULT NULL,
  "is_locked" smallint NOT NULL DEFAULT 0,
  "lock_difficulty" integer NOT NULL DEFAULT 12,
  "owner_npc_id" integer DEFAULT NULL,
  "description" text DEFAULT NULL,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("map_id","building_key")
);
INSERT INTO "game_buildings" VALUES
(1,1,'prancing_mare','The Prancing Mare Tavern','tavern',7,12,101,5,9,'[{"facing":"south","state":"open","x":6,"y":12},{"facing":"south","state":"cracked","x":8,"y":12},{"facing":"west","state":"closed","x":6,"y":10}]',0,10,101,'Raucous two-story tavern smelling of spiced mead, roasted boar, and peat fire.','2026-09-08 08:05:45'),
(2,1,'barnaby_shop','Barnaby''s Apothecary & Provisioner','shop',12,13,102,4,7,'[{"facing":"south","state":"closed","x":11,"y":13},{"facing":"south","state":"shuttered","x":13,"y":13}]',0,15,103,'Cluttered apothecary stocked with bubbling glass alembics, salves, and tempered blades.','2026-09-08 08:05:45'),
(3,1,'dawn_hearth','Sanctuary of the Dawn Hearth','sanctuary',14,7,103,6,8,'[{"facing":"south","state":"open","x":13,"y":7},{"facing":"south","state":"closed","x":15,"y":7}]',0,18,102,'Serene stone temple lined with burning votive candles and restorative herb beds.','2026-09-08 08:05:45'),
(4,1,'shadow_den','Silas''s Shadow Den & Smugglers'' Cellar','hideout',4,17,104,3,6,'[{"facing":"south","state":"shuttered","x":3,"y":17}]',0,20,106,'Concealed cellar entrance hidden beneath rotten crates, leading into an illicit black market.','2026-09-08 08:05:45');
DROP TABLE IF EXISTS "game_campaign_rulesets";
CREATE TABLE "game_campaign_rulesets" (
  "id" integer  NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text DEFAULT NULL,
  "stat_mode" varchar(64) NOT NULL DEFAULT 'standard',
  "primary_stat_name" varchar(32) DEFAULT 'Powerlevel',
  "custom_stats_json" text   DEFAULT NULL ,
  "combat_mode" varchar(64) NOT NULL DEFAULT 'turn_based',
  "moves_per_day" integer  DEFAULT NULL,
  "tiles_per_move" integer  DEFAULT 3,
  "move_reset_time" varchar(8) DEFAULT NULL,
  "move_reset_timezone" varchar(32) DEFAULT 'America/New_York',
  "near_death_enabled" smallint NOT NULL DEFAULT 0,
  "near_death_json" text   DEFAULT NULL ,
  "action_points_enabled" smallint NOT NULL DEFAULT 0,
  "action_points_per_turn" integer  DEFAULT 1,
  "bonus_actions_per_turn" integer  DEFAULT 1,
  "reactions_per_round" integer  DEFAULT 1,
  "ap_reset_mode" varchar(64) DEFAULT 'turn',
  "movement_mode" varchar(64) NOT NULL DEFAULT 'flat',
  "movement_speed_stat" varchar(32) DEFAULT NULL,
  "movement_speed_divisor" integer  DEFAULT 5,
  "allow_flying" smallint NOT NULL DEFAULT 1,
  "flying_tile_bonus" integer  DEFAULT 0,
  "allow_transformation" smallint NOT NULL DEFAULT 1,
  "permadeath" smallint NOT NULL DEFAULT 0,
  "friendly_fire" smallint NOT NULL DEFAULT 0,
  "level_cap" integer  DEFAULT NULL,
  "xp_curve" varchar(64) DEFAULT 'exponential',
  "xp_curve_json" text   DEFAULT NULL ,
  "is_active" smallint NOT NULL DEFAULT 1,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
INSERT INTO "game_campaign_rulesets" VALUES
(1,'Tabletop d20 Classic','Traditional d20 fantasy ruleset with six core attributes, spell slots, and turn-based tactical encounters.','dnd','Powerlevel',NULL,'turn_based',NULL,3,NULL,'America/New_York',0,NULL,1,1,1,1,'turn','stat',NULL,5,1,0,1,0,0,NULL,'exponential',NULL,1,'2026-09-05 10:18:19','2026-09-05 10:18:19'),
(2,'Standard Realm RPG','Standard engine ruleset featuring eight core combat attributes, active time bar pacing, and exploration perks.','standard','Powerlevel',NULL,'turn_based',NULL,3,NULL,'America/New_York',0,NULL,0,1,1,1,'turn','flat',NULL,5,1,0,1,0,0,NULL,'exponential',NULL,1,'2026-09-05 10:18:19','2026-09-05 10:18:19'),
(3,'Tactical Grid Strategy','Strategic diamond/hex tactical grid ruleset emphasizing movement range, elevation advantage, and turn order.','dnd','Powerlevel',NULL,'tactical',NULL,3,NULL,'America/New_York',0,NULL,1,1,1,1,'turn','stat',NULL,5,1,0,1,0,0,NULL,'exponential',NULL,1,'2026-09-05 10:18:19','2026-09-05 10:18:19');
DROP TABLE IF EXISTS "game_capability_state";
CREATE TABLE "game_capability_state" (
  "capability_id" varchar(80) NOT NULL,
  "enabled" smallint NOT NULL,
  "updated_at" timestamp NOT NULL,
  PRIMARY KEY ("capability_id")
);
INSERT INTO "game_capability_state" VALUES
('crafting',1,'2026-09-09 06:37:10'),
('fog_of_war',1,'2026-09-09 06:37:10'),
('magic',1,'2026-09-09 06:37:10');
DROP TABLE IF EXISTS "game_card_matches";
CREATE TABLE "game_card_matches" (
  "id" integer  NOT NULL,
  "player1_id" integer  NOT NULL,
  "player2_id" integer  DEFAULT NULL,
  "npc_opponent" varchar(64) DEFAULT NULL,
  "board_size" integer DEFAULT 9,
  "board_json" text   DEFAULT NULL ,
  "winner_id" integer  DEFAULT NULL,
  "status" varchar(64) DEFAULT 'active',
  "wager_card_id" integer  DEFAULT NULL,
  "reward_card_id" integer  DEFAULT NULL,
  "played_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_card_rules";
CREATE TABLE "game_card_rules" (
  "id" integer  NOT NULL,
  "name" varchar(64) NOT NULL,
  "description" text DEFAULT NULL,
  "rule_type" varchar(32) NOT NULL,
  "is_active" smallint DEFAULT 1,
  PRIMARY KEY ("id")
);
INSERT INTO "game_card_rules" VALUES
(1,'Open','Both duelists reveal all cards in hand.','open',1),
(2,'Same','If opposing card numbers match touching numbers on placement, they flip.','same',1),
(3,'Plus','If opposing number sums are identical, touching cards flip.','plus',1),
(4,'Elemental','Matching tile elements grant +1 to card ranks; mismatches suffer -1.','elemental',1),
(5,'Sudden Death','In the event of a draw, an immediate rematch is waged with captured cards.','sudden_death',1),
(6,'Random','Five cards are drawn at random from your vault.','random',1);
DROP TABLE IF EXISTS "game_cards";
CREATE TABLE "game_cards" (
  "id" integer  NOT NULL,
  "name" varchar(64) NOT NULL,
  "icon" varchar(20) DEFAULT NULL,
  "description" text DEFAULT NULL,
  "rarity" varchar(64) DEFAULT 'common',
  "value_top" integer DEFAULT 1,
  "value_right" integer DEFAULT 1,
  "value_bottom" integer DEFAULT 1,
  "value_left" integer DEFAULT 1,
  "element" varchar(32) DEFAULT NULL,
  "source_npc_id" integer  DEFAULT NULL,
  "source_type" varchar(64) DEFAULT 'enemy',
  "art_url" varchar(512) DEFAULT NULL,
  "is_active" smallint DEFAULT 1,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
INSERT INTO "game_cards" VALUES
(1,'Goblin Scavenger','👺','Low-tier vermin of the crags.','common',2,3,1,2,'earth',NULL,'enemy',NULL,1,'2026-09-05 10:04:25'),
(2,'Rattle Skeleton','💀','Restless dead held together by spite.','common',3,2,2,1,'dark',NULL,'enemy',NULL,1,'2026-09-05 10:04:25'),
(3,'Dire Wolf','🐺','Apex packhunter of the pine ridge.','common',1,4,2,3,'earth',NULL,'enemy',NULL,1,'2026-09-05 10:04:25'),
(4,'Bandit Cutthroat','🗡️','Ambusher waiting in the briar.','common',3,3,3,1,'air',NULL,'enemy',NULL,1,'2026-09-05 10:04:25'),
(5,'Ashveil Knight','⚔️','Fallen paladin sworn to the dark court.','uncommon',5,4,3,5,'dark',NULL,'enemy',NULL,1,'2026-09-05 10:04:25'),
(6,'Cinder Witch','🔥','Sorceress of sacrificial flames.','uncommon',3,6,4,2,'fire',NULL,'enemy',NULL,1,'2026-09-05 10:04:25'),
(7,'Grave Revenant','🪦','An unquiet spirit thirsting for warmth.','uncommon',4,5,5,3,'dark',NULL,'enemy',NULL,1,'2026-09-05 10:04:25'),
(8,'Iron Golem','🗿','Unbreakable automaton crafted in the deep forge.','rare',7,2,7,3,'earth',NULL,'enemy',NULL,1,'2026-09-05 10:04:25'),
(9,'Forest Archon','🌲','Ancient spirit defending the elder groves.','rare',6,5,7,4,'water',NULL,'enemy',NULL,1,'2026-09-05 10:04:25'),
(10,'Void Drake','🐉','Winged terror of the astral breach.','epic',8,7,6,8,'dark',NULL,'boss',NULL,1,'2026-09-05 10:04:25'),
(11,'Storm Sovereign','⚡','Incarnation of endless lightning.','epic',7,9,8,5,'air',NULL,'boss',NULL,1,'2026-09-05 10:04:25'),
(12,'The Ancient One','👁️','Cosmic slumbering deity beyond time.','legendary',9,9,8,10,'dark',NULL,'boss',NULL,1,'2026-09-05 10:04:25');
DROP TABLE IF EXISTS "game_case_clues";
CREATE TABLE "game_case_clues" (
  "id" integer NOT NULL,
  "case_id" integer NOT NULL,
  "clue_key" varchar(64) NOT NULL,
  "name" varchar(128) NOT NULL,
  "icon" varchar(16) DEFAULT '?',
  "clue_text" text NOT NULL,
  "is_discovered" smallint NOT NULL DEFAULT 0,
  "points_to_suspect_id" integer DEFAULT NULL,
  PRIMARY KEY ("id")
);
INSERT INTO "game_case_clues" VALUES
(97,33,'broken_bars','Shattered Iron Bars','⛓️','The window frame iron bars were sheared clean off with a masterwork heavy forging hammer.',0,2),
(98,33,'soot_footprints','Black Foundry Soot','👣','Heavy bootprints coated with foundry charcoal lead from the bedroom window down the alley.',0,2),
(99,33,'bloodstained_promissory','Bloodstained IOU Note','📜','A torn note in Lord Aubrey''s pocket demanding payment of 200 gold to Barnaby the Blacksmith.',0,2);
DROP TABLE IF EXISTS "game_case_suspects";
CREATE TABLE "game_case_suspects" (
  "id" integer NOT NULL,
  "case_id" integer NOT NULL,
  "suspect_id" integer NOT NULL,
  "name" varchar(128) NOT NULL,
  "role" varchar(64) NOT NULL,
  "icon" varchar(16) DEFAULT '?',
  "alibi" text DEFAULT NULL,
  "is_guilty" smallint NOT NULL DEFAULT 0,
  "interrogated_count" integer NOT NULL DEFAULT 0,
  "confessed" smallint NOT NULL DEFAULT 0,
  PRIMARY KEY ("id")
);
INSERT INTO "game_case_suspects" VALUES
(97,33,1,'Silas the Fence','Smuggler Kingpin','🗡️','I was counting coin in the cellars all evening. Several cutthroats can vouch for me.',0,0,0),
(98,33,2,'Barnaby the Blacksmith','Foundry Foreman','🔨','I was forging iron window bars. Lord Aubrey owed me 200 gold for palace grates, but I didn''t touch him.',1,0,0),
(99,33,3,'Mother Althea','High Herbalist','🧪','I was brewing valyrian salves in the apothecary garden. I heard a loud crash around midnight.',0,0,0);
DROP TABLE IF EXISTS "game_catacomb_dungeons";
CREATE TABLE "game_catacomb_dungeons" (
  "id" integer NOT NULL,
  "creator_char_id" integer NOT NULL,
  "name" varchar(128) NOT NULL,
  "theme" varchar(64) NOT NULL DEFAULT 'sunken_crypt',
  "danger_level" varchar(32) NOT NULL DEFAULT 'hard',
  "floors_count" integer NOT NULL DEFAULT 1,
  "current_floor" integer NOT NULL DEFAULT 1,
  "status" varchar(32) NOT NULL DEFAULT 'active',
  "prompt" text DEFAULT NULL,
  "created_at" timestamp NOT NULL,
  PRIMARY KEY ("id")
);
INSERT INTO "game_catacomb_dungeons" VALUES
(1,2,'Catacombs of the Drowned Patriarch','sunken_crypt','hard',1,1,'active','Test Catacomb','2026-09-09 10:28:51'),
(2,1,'Catacombs of the Drowned Patriarch','sunken_crypt','elite',1,1,'active','Spawn a flooded crypt with drowned spectres and an ancient sunken hydra','2026-09-09 10:28:52'),
(3,1,'Catacombs of the Drowned Patriarch','sunken_crypt','elite',1,1,'active','Spawn a flooded crypt with drowned spectres and an ancient sunken hydra','2026-09-09 10:28:56'),
(4,2,'Catacombs of the Drowned Patriarch','sunken_crypt','hard',1,1,'active','Test Catacomb','2026-09-09 10:28:57'),
(5,1,'Catacombs of the Drowned Patriarch','sunken_crypt','elite',1,1,'active','Spawn a flooded crypt with drowned spectres and an ancient sunken hydra','2026-09-09 10:29:12'),
(6,2,'Catacombs of the Drowned Patriarch','sunken_crypt','hard',1,1,'active','Test Catacomb','2026-09-09 10:29:12'),
(7,1,'Catacombs of the Drowned Patriarch','sunken_crypt','elite',1,1,'active','Spawn a flooded crypt with drowned spectres and an ancient sunken hydra','2026-09-09 10:37:17'),
(8,2,'Catacombs of the Drowned Patriarch','sunken_crypt','hard',1,1,'active','Test Catacomb','2026-09-09 10:37:17');
DROP TABLE IF EXISTS "game_catacomb_rooms";
CREATE TABLE "game_catacomb_rooms" (
  "id" integer NOT NULL,
  "dungeon_id" integer NOT NULL,
  "floor" integer NOT NULL DEFAULT 1,
  "room_index" integer NOT NULL,
  "room_type" varchar(32) NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text DEFAULT NULL,
  "elevation" integer NOT NULL DEFAULT 0,
  "is_cleared" smallint NOT NULL DEFAULT 0,
  "doors_json" text DEFAULT NULL,
  "occupants_json" text DEFAULT NULL,
  "loot_json" text DEFAULT NULL,
  PRIMARY KEY ("id")
);
INSERT INTO "game_catacomb_rooms" VALUES
(1,1,1,0,'entrance','Sunken Antechamber','Damp stone steps descend into murky, ankle-deep water.',0,1,'[1]','[]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(2,1,1,1,'hall','Whispering Catacomb Gallery','Wall niches lined with ancient skulls echo with faint spectral whispers.',-1,1,'[0,2]','[]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(3,1,1,2,'trap','Pressure Plate Flood Gate','Water cascades from ceiling sluices over hair-trigger pressure stones.',-2,0,'[1,3]','[{"name":"Water Sluice Mechanism","status":"armed","icon":"⚙️"}]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(4,1,1,3,'treasure','Gilded Smuggler Cache','Iron-banded strongboxes half-submerged in black water glint in torchlight.',-2,0,'[2,4]','[]','{"item":"Ancient Valyrian Relic","gold":240,"xp":350}'),
(5,1,1,4,'boss_arena','Sanctum of the Sunken Leviathan','A colossal vaulted cistern where ancient runes glow beneath turbulent water.',-3,0,'[3]','[{"name":"Abyssal Leviathan","icon":"🐲","hp":1200,"max_hp":1200}]','{"item":"Heart of the Sunken Leviathan","gold":600,"xp":1000}'),
(6,2,1,0,'entrance','Sunken Antechamber','Damp stone steps descend into murky, ankle-deep water.',0,1,'[1]','[]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(7,2,1,1,'hall','Whispering Catacomb Gallery','Wall niches lined with ancient skulls echo with faint spectral whispers.',-1,0,'[0,2]','[]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(8,2,1,2,'trap','Pressure Plate Flood Gate','Water cascades from ceiling sluices over hair-trigger pressure stones.',-2,0,'[1,3]','[{"name":"Water Sluice Mechanism","status":"armed","icon":"⚙️"}]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(9,2,1,3,'treasure','Gilded Smuggler Cache','Iron-banded strongboxes half-submerged in black water glint in torchlight.',-2,0,'[2,4]','[]','{"item":"Ancient Valyrian Relic","gold":240,"xp":350}'),
(10,2,1,4,'boss_arena','Sanctum of the Sunken Leviathan','A colossal vaulted cistern where ancient runes glow beneath turbulent water.',-3,0,'[3]','[{"name":"Abyssal Leviathan","icon":"🐲","hp":1200,"max_hp":1200}]','{"item":"Heart of the Sunken Leviathan","gold":600,"xp":1000}'),
(11,3,1,0,'entrance','Sunken Antechamber','Damp stone steps descend into murky, ankle-deep water.',0,1,'[1]','[]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(12,3,1,1,'hall','Whispering Catacomb Gallery','Wall niches lined with ancient skulls echo with faint spectral whispers.',-1,0,'[0,2]','[]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(13,3,1,2,'trap','Pressure Plate Flood Gate','Water cascades from ceiling sluices over hair-trigger pressure stones.',-2,0,'[1,3]','[{"name":"Water Sluice Mechanism","status":"armed","icon":"⚙️"}]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(14,3,1,3,'treasure','Gilded Smuggler Cache','Iron-banded strongboxes half-submerged in black water glint in torchlight.',-2,0,'[2,4]','[]','{"item":"Ancient Valyrian Relic","gold":240,"xp":350}'),
(15,3,1,4,'boss_arena','Sanctum of the Sunken Leviathan','A colossal vaulted cistern where ancient runes glow beneath turbulent water.',-3,0,'[3]','[{"name":"Abyssal Leviathan","icon":"🐲","hp":1200,"max_hp":1200}]','{"item":"Heart of the Sunken Leviathan","gold":600,"xp":1000}'),
(16,4,1,0,'entrance','Sunken Antechamber','Damp stone steps descend into murky, ankle-deep water.',0,1,'[1]','[]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(17,4,1,1,'hall','Whispering Catacomb Gallery','Wall niches lined with ancient skulls echo with faint spectral whispers.',-1,1,'[0,2]','[]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(18,4,1,2,'trap','Pressure Plate Flood Gate','Water cascades from ceiling sluices over hair-trigger pressure stones.',-2,0,'[1,3]','[{"name":"Water Sluice Mechanism","status":"armed","icon":"⚙️"}]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(19,4,1,3,'treasure','Gilded Smuggler Cache','Iron-banded strongboxes half-submerged in black water glint in torchlight.',-2,0,'[2,4]','[]','{"item":"Ancient Valyrian Relic","gold":240,"xp":350}'),
(20,4,1,4,'boss_arena','Sanctum of the Sunken Leviathan','A colossal vaulted cistern where ancient runes glow beneath turbulent water.',-3,0,'[3]','[{"name":"Abyssal Leviathan","icon":"🐲","hp":1200,"max_hp":1200}]','{"item":"Heart of the Sunken Leviathan","gold":600,"xp":1000}'),
(21,5,1,0,'entrance','Sunken Antechamber','Damp stone steps descend into murky, ankle-deep water.',0,1,'[1]','[]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(22,5,1,1,'hall','Whispering Catacomb Gallery','Wall niches lined with ancient skulls echo with faint spectral whispers.',-1,0,'[0,2]','[]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(23,5,1,2,'trap','Pressure Plate Flood Gate','Water cascades from ceiling sluices over hair-trigger pressure stones.',-2,0,'[1,3]','[{"name":"Water Sluice Mechanism","status":"armed","icon":"⚙️"}]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(24,5,1,3,'treasure','Gilded Smuggler Cache','Iron-banded strongboxes half-submerged in black water glint in torchlight.',-2,0,'[2,4]','[]','{"item":"Ancient Valyrian Relic","gold":240,"xp":350}'),
(25,5,1,4,'boss_arena','Sanctum of the Sunken Leviathan','A colossal vaulted cistern where ancient runes glow beneath turbulent water.',-3,0,'[3]','[{"name":"Abyssal Leviathan","icon":"🐲","hp":1200,"max_hp":1200}]','{"item":"Heart of the Sunken Leviathan","gold":600,"xp":1000}'),
(26,6,1,0,'entrance','Sunken Antechamber','Damp stone steps descend into murky, ankle-deep water.',0,1,'[1]','[]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(27,6,1,1,'hall','Whispering Catacomb Gallery','Wall niches lined with ancient skulls echo with faint spectral whispers.',-1,1,'[0,2]','[]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(28,6,1,2,'trap','Pressure Plate Flood Gate','Water cascades from ceiling sluices over hair-trigger pressure stones.',-2,0,'[1,3]','[{"name":"Water Sluice Mechanism","status":"armed","icon":"⚙️"}]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(29,6,1,3,'treasure','Gilded Smuggler Cache','Iron-banded strongboxes half-submerged in black water glint in torchlight.',-2,0,'[2,4]','[]','{"item":"Ancient Valyrian Relic","gold":240,"xp":350}'),
(30,6,1,4,'boss_arena','Sanctum of the Sunken Leviathan','A colossal vaulted cistern where ancient runes glow beneath turbulent water.',-3,0,'[3]','[{"name":"Abyssal Leviathan","icon":"🐲","hp":1200,"max_hp":1200}]','{"item":"Heart of the Sunken Leviathan","gold":600,"xp":1000}'),
(31,7,1,0,'entrance','Sunken Antechamber','Damp stone steps descend into murky, ankle-deep water.',0,1,'[1]','[]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(32,7,1,1,'hall','Whispering Catacomb Gallery','Wall niches lined with ancient skulls echo with faint spectral whispers.',-1,0,'[0,2]','[]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(33,7,1,2,'trap','Pressure Plate Flood Gate','Water cascades from ceiling sluices over hair-trigger pressure stones.',-2,0,'[1,3]','[{"name":"Water Sluice Mechanism","status":"armed","icon":"⚙️"}]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(34,7,1,3,'treasure','Gilded Smuggler Cache','Iron-banded strongboxes half-submerged in black water glint in torchlight.',-2,0,'[2,4]','[]','{"item":"Ancient Valyrian Relic","gold":240,"xp":350}'),
(35,7,1,4,'boss_arena','Sanctum of the Sunken Leviathan','A colossal vaulted cistern where ancient runes glow beneath turbulent water.',-3,0,'[3]','[{"name":"Abyssal Leviathan","icon":"🐲","hp":1200,"max_hp":1200}]','{"item":"Heart of the Sunken Leviathan","gold":600,"xp":1000}'),
(36,8,1,0,'entrance','Sunken Antechamber','Damp stone steps descend into murky, ankle-deep water.',0,1,'[1]','[]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(37,8,1,1,'hall','Whispering Catacomb Gallery','Wall niches lined with ancient skulls echo with faint spectral whispers.',-1,1,'[0,2]','[]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(38,8,1,2,'trap','Pressure Plate Flood Gate','Water cascades from ceiling sluices over hair-trigger pressure stones.',-2,0,'[1,3]','[{"name":"Water Sluice Mechanism","status":"armed","icon":"⚙️"}]','{"item":"Submerged Coin Purse","gold":40,"xp":60}'),
(39,8,1,3,'treasure','Gilded Smuggler Cache','Iron-banded strongboxes half-submerged in black water glint in torchlight.',-2,0,'[2,4]','[]','{"item":"Ancient Valyrian Relic","gold":240,"xp":350}'),
(40,8,1,4,'boss_arena','Sanctum of the Sunken Leviathan','A colossal vaulted cistern where ancient runes glow beneath turbulent water.',-3,0,'[3]','[{"name":"Abyssal Leviathan","icon":"🐲","hp":1200,"max_hp":1200}]','{"item":"Heart of the Sunken Leviathan","gold":600,"xp":1000}');
DROP TABLE IF EXISTS "game_character_action_log";
CREATE TABLE "game_character_action_log" (
  "id" integer  NOT NULL,
  "character_id" integer  NOT NULL,
  "campaign_id" integer  DEFAULT NULL,
  "action_type" varchar(32) NOT NULL,
  "window_key" varchar(32) NOT NULL,
  "used_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  "result_json" text   DEFAULT NULL ,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_character_bounties";
CREATE TABLE "game_character_bounties" (
  "id" integer NOT NULL,
  "char_id" integer NOT NULL,
  "task_id" integer NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'accepted',
  "capture_method" varchar(32) DEFAULT NULL,
  "accepted_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" timestamp NULL DEFAULT NULL,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_class_skills";
CREATE TABLE "game_class_skills" (
  "id" integer  NOT NULL,
  "class_id" integer  NOT NULL,
  "skill_id" integer  NOT NULL,
  "learn_level" integer NOT NULL DEFAULT 1,
  "mp_cost" integer DEFAULT NULL,
  "alt_name" varchar(64) DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("class_id","skill_id")
);
DROP TABLE IF EXISTS "game_classes";
CREATE TABLE "game_classes" (
  "id" integer  NOT NULL,
  "name" varchar(64) NOT NULL,
  "description" text DEFAULT NULL,
  "icon" varchar(8) DEFAULT '⚔️',
  "base_hp" integer NOT NULL DEFAULT 100,
  "base_mp" integer NOT NULL DEFAULT 50,
  "base_atk" integer NOT NULL DEFAULT 10,
  "base_def" integer NOT NULL DEFAULT 5,
  "base_mo" integer NOT NULL DEFAULT 5,
  "base_md" integer NOT NULL DEFAULT 5,
  "base_speed" integer NOT NULL DEFAULT 10,
  "base_luck" integer NOT NULL DEFAULT 5,
  "battle_cmds" text   DEFAULT NULL ,
  "hidden" smallint NOT NULL DEFAULT 0,
  "sort_order" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("id")
);
INSERT INTO "game_classes" VALUES
(1,'Warrior','Frontline master of steel, heavy armor, cleaving strikes, and taunts.','⚔️',120,30,14,10,2,4,9,5,'["Attack","Defend","Cleave","Taunt"]',0,1),
(2,'Paladin','Holy crusader channeling radiant smites, protective auras, and shields.','🛡️',115,50,12,11,6,7,8,6,'["Attack","Smite","LayOnHands","ShieldWall"]',0,2),
(3,'Barbarian','Primal berserker whose frenzied battle rage shrugs off mortal wounds.','🪓',135,20,16,8,1,3,10,4,'["Attack","Rage","Frenzy","Intimidate"]',0,3),
(4,'Rogue','Lethal infiltrator specializing in sneak attacks, poisons, and evasion.','🗡️',90,40,13,6,3,4,15,8,'["Attack","SneakAttack","PoisonBlade","Evade"]',0,4),
(5,'Ranger','Deadeye marksman and wild tracker striking targets from long range.','🏹',95,50,12,7,4,5,13,7,'["Attack","AimedShot","Volley","HunterMark"]',0,5),
(6,'Monk','Ascetic martial artist channeling inner ki into blinding physical flurries.','🥋',105,45,13,8,4,6,14,6,'["Attack","Flurry","StunPalm","StepWind"]',0,6),
(7,'Mage','Scholar of sorcery commanding devastating fire, frost, and arcane force.','🔮',80,90,5,4,16,10,10,6,'["Attack","Fireball","FrostNova","ArcaneBlast"]',0,7),
(8,'Sorcerer','Channeler of volatile raw magic surging directly from innate bloodlines.','⚡',85,95,6,4,17,9,11,7,'["Attack","ChaosBolt","TwinnedSpell","Metamagic"]',0,8),
(9,'Warlock','Eldritch pact-binder who curses enemy souls and drains vital essences.','👁️',90,80,7,5,14,9,10,6,'["Attack","EldritchBlast","Hex","SoulDrain"]',0,9),
(10,'Necromancer','Dark sovereign who raises undead thralls and siphons decay essence.','💀',85,85,6,5,15,10,9,5,'["Attack","RaiseDead","BoneArmor","LifeSiphon"]',0,10),
(11,'Cleric','Devout conduit of divine light who cleanses wounds and turns undead.','✨',105,75,8,8,11,12,9,6,'["Attack","Heal","HolyRadiance","TurnUndead"]',0,11),
(12,'Druid','Primeval shape-shifter commanding roots, weather, and wild predator aspects.','🐺',100,70,9,8,11,10,10,6,'["Attack","WildShape","Entangle","Regrowth"]',0,12),
(13,'Spellblade','Battle-mage who weaves arcane spells directly into two-handed blade strikes.','🪄',105,60,12,8,11,8,11,6,'["Attack","SpellSlash","FlameInfusion","BlinkStrike"]',0,13),
(14,'Hemomancer','Blood weaver who sacrifices personal lifeforce to coagulate lethal blood lances.','🩸',110,65,10,7,15,8,10,5,'["Attack","BloodLance","SanguineWard","Exsanguinate"]',0,14),
(15,'Artificer','Alchemical inventor who deploys automated clockwork turrets and volatile grenades.','⚙️',95,65,10,8,11,8,11,8,'["Attack","DeployTurret","ClusterBomb","Electrify"]',0,15),
(16,'Witch Hunter','Relentless inquisitor armed with silver hand-crossbows and silencing brands.','🎯',100,50,13,8,7,9,12,6,'["Attack","SilverBolt","SilenceGlyph","JudgementBrand"]',0,16),
(17,'Stormcaller','Weather sovereign summoning chain lightning, gale gusts, and localized squalls.','🌩️',85,85,6,5,16,9,11,6,'["Attack","ChainLightning","GaleForce","EyeOfStorm"]',0,17),
(18,'Shadow Dancer','Illusionist skirmisher warping through shadow portals with smoke decoys.','🌑',90,55,12,6,7,6,16,8,'["Attack","ShadowStep","MirrorClone","NightBlade"]',0,18),
(19,'Chronomancer','Time weaver who accelerates ally tempo and freezes adversaries in temporal stasis.','⏳',80,90,5,5,15,11,12,8,'["Attack","TimeStop","Decelerate","HasteWave"]',0,19),
(20,'Glyphwarden','Runic architect who inscribes explosive chain wards and protective barrier sigils.','💠',100,75,8,9,13,11,9,7,'["Attack","InscribeWard","RuneBurst","BarrierSigil"]',0,20);
DROP TABLE IF EXISTS "game_colossus_raids";
CREATE TABLE "game_colossus_raids" (
  "id" integer NOT NULL,
  "map_id" integer NOT NULL DEFAULT 1,
  "status" varchar(32) NOT NULL DEFAULT 'active',
  "boss_hp" integer NOT NULL DEFAULT 5000,
  "boss_max_hp" integer NOT NULL DEFAULT 5000,
  "phase" integer NOT NULL DEFAULT 1,
  "limbs_json" text DEFAULT NULL,
  "participants_json" text DEFAULT NULL,
  "active_telegraph_json" text DEFAULT NULL,
  "started_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "defeated_at" timestamp NULL DEFAULT NULL,
  PRIMARY KEY ("id")
);
INSERT INTO "game_colossus_raids" VALUES
(35,1,'active',5000,5000,1,'{"core":{"broken":false,"hp":2000,"icon":"🔮","max_hp":2000,"name":"Arcane Flame Core"},"head":{"broken":false,"hp":800,"icon":"🗿","max_hp":800,"name":"Runic Granite Helm"},"left_arm":{"broken":false,"hp":600,"icon":"🛡️","max_hp":600,"name":"Aegis Left Gauntlet"},"legs":{"broken":false,"hp":1000,"icon":"🦿","max_hp":1000,"name":"Monolithic Pillars"},"right_arm":{"broken":false,"hp":600,"icon":"🔨","max_hp":600,"name":"Crusher Right Fist"}}','[]',NULL,'2026-09-09 10:37:11',NULL);
DROP TABLE IF EXISTS "game_companion_affinity_tiers";
CREATE TABLE "game_companion_affinity_tiers" (
  "id" integer  NOT NULL,
  "tier_level" integer NOT NULL,
  "name" varchar(64) NOT NULL,
  "affinity_required" integer NOT NULL,
  "description" varchar(255) DEFAULT NULL,
  "unlock_text" varchar(255) DEFAULT NULL,
  PRIMARY KEY ("id")
);
INSERT INTO "game_companion_affinity_tiers" VALUES
(1,0,'Stranger',0,'You barely know each other.',NULL),
(2,1,'Acquaintance',25,'A growing familiarity.','{name} seems more comfortable around you.'),
(3,2,'Ally',50,'A solid battle partner.','{name} trusts your judgment in crisis.'),
(4,3,'Friend',75,'A genuine friendship has formed.','{name} considers you a steadfast friend.'),
(5,4,'Confidant',90,'Deep trust and mutual respect.','{name} confides their inner truths to you.'),
(6,5,'Bonded',100,'An unbreakable bond.','{name} would walk into oblivion at your side.');
DROP TABLE IF EXISTS "game_craft_recipes";
CREATE TABLE "game_craft_recipes" (
  "id" integer NOT NULL,
  "name" varchar(128) NOT NULL,
  "category" varchar(32) NOT NULL DEFAULT 'MISC',
  "result_item_id" integer NOT NULL,
  "result_qty" integer NOT NULL DEFAULT 1,
  "level_req" integer NOT NULL DEFAULT 1,
  "skill_req" varchar(64) DEFAULT NULL,
  "ingredients_json" text NOT NULL,
  "unlock_mode" varchar(16) NOT NULL DEFAULT 'ALWAYS',
  "description" text DEFAULT NULL,
  "icon" varchar(8) DEFAULT '?',
  "is_active" smallint NOT NULL DEFAULT 1,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_district_territories";
CREATE TABLE "game_district_territories" (
  "district_key" varchar(64) NOT NULL,
  "name" varchar(128) NOT NULL,
  "controlling_faction" varchar(32) NOT NULL DEFAULT 'watch',
  "syndicate_influence" integer NOT NULL DEFAULT 33,
  "watch_influence" integer NOT NULL DEFAULT 33,
  "cult_influence" integer NOT NULL DEFAULT 34,
  "martial_law_active" smallint NOT NULL DEFAULT 0,
  "tax_rate_pct" integer NOT NULL DEFAULT 10,
  "guard_type" varchar(64) NOT NULL DEFAULT 'City Watch',
  "updated_at" timestamp NOT NULL,
  PRIMARY KEY ("district_key")
);
INSERT INTO "game_district_territories" VALUES
('haven_plaza','Haven High Plaza & Magistrate Quarter','watch',20,70,10,0,12,'City Watch Halberdiers & Inquisitors','2026-09-09 10:37:17'),
('iron_foundry','Iron Foundry & Blacksmith Row','watch',42,48,10,0,8,'Armored Foundry Militia','2026-09-09 10:37:17'),
('lowtown','Lowtown Waterfront & Docks','syndicate',65,25,10,0,5,'Syndicate Thugs & Shadow Runners','2026-09-09 10:37:17'),
('sunken_ward','The Sunken Ward & Cisterns','cult',30,15,55,0,0,'Drowned Zealots & Void Warlocks','2026-09-09 10:37:17');
DROP TABLE IF EXISTS "game_dm_campaign_players";
CREATE TABLE "game_dm_campaign_players" (
  "id" integer  NOT NULL,
  "campaign_id" integer  NOT NULL,
  "user_id" integer  NOT NULL,
  "character_id" integer  DEFAULT NULL,
  "status" varchar(64) DEFAULT 'invited',
  "starting_x" integer DEFAULT NULL,
  "starting_y" integer DEFAULT NULL,
  "joined_at" timestamp DEFAULT NULL,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("campaign_id","user_id")
);
DROP TABLE IF EXISTS "game_dm_campaigns";
CREATE TABLE "game_dm_campaigns" (
  "id" integer  NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text DEFAULT NULL,
  "dm_user_id" integer  NOT NULL,
  "max_players" integer  NOT NULL DEFAULT 7,
  "is_oneshot" smallint NOT NULL DEFAULT 0,
  "world_tone" varchar(64) DEFAULT 'dark fantasy',
  "map_id" integer  DEFAULT NULL,
  "ruleset_id" integer  DEFAULT NULL,
  "status" varchar(64) DEFAULT 'recruiting',
  "session_count" integer  NOT NULL DEFAULT 0,
  "moves_per_day" integer  NOT NULL DEFAULT 3,
  "tiles_per_move" integer  NOT NULL DEFAULT 3,
  "flying_tiles" integer  NOT NULL DEFAULT 3,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
INSERT INTO "game_dm_campaigns" VALUES
(1,'The Sunken Citadel of Ashveil','A deep plunge into the mist-shrouded ruins beneath the caldera. Ancient guardians and forgotten relics await those brave enough to delve below.',1,6,0,'dark fantasy',1,1,'recruiting',0,3,3,3,'2026-09-05 10:18:19','2026-09-05 10:18:19');
DROP TABLE IF EXISTS "game_dm_character_sheets";
CREATE TABLE "game_dm_character_sheets" (
  "id" integer  NOT NULL,
  "campaign_id" integer  NOT NULL,
  "user_id" integer  NOT NULL,
  "name" varchar(255) DEFAULT NULL,
  "race" varchar(64) DEFAULT NULL,
  "class_name" varchar(64) DEFAULT NULL,
  "level" integer  NOT NULL DEFAULT 1,
  "str" integer DEFAULT 10,
  "dex" integer DEFAULT 10,
  "con" integer DEFAULT 10,
  "int_score" integer DEFAULT 10,
  "wis" integer DEFAULT 10,
  "cha" integer DEFAULT 10,
  "max_hp" integer DEFAULT 10,
  "current_hp" integer DEFAULT 10,
  "armor_class" integer DEFAULT 10,
  "background" text DEFAULT NULL,
  "alignment" varchar(64) DEFAULT NULL,
  "personality" text DEFAULT NULL,
  "backstory" text DEFAULT NULL,
  "equipment_json" text   DEFAULT NULL ,
  "skills_json" text   DEFAULT NULL ,
  "spells_json" text   DEFAULT NULL ,
  "notes" text DEFAULT NULL,
  "portrait_url" varchar(500) DEFAULT NULL,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("campaign_id","user_id")
);
DROP TABLE IF EXISTS "game_dm_session_log";
CREATE TABLE "game_dm_session_log" (
  "id" integer  NOT NULL,
  "campaign_id" integer  NOT NULL,
  "session_number" integer  DEFAULT NULL,
  "title" varchar(255) DEFAULT NULL,
  "summary" text DEFAULT NULL,
  "log_json" text   DEFAULT NULL ,
  "started_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" timestamp DEFAULT NULL,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_elements";
CREATE TABLE "game_elements" (
  "id" integer  NOT NULL,
  "name" varchar(64) NOT NULL,
  "icon" varchar(8) DEFAULT '?',
  "color" varchar(16) DEFAULT '#ff6600',
  "strengths_json" text   DEFAULT NULL ,
  "weaknesses_json" text   DEFAULT NULL ,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_engine_feature_flags";
CREATE TABLE "game_engine_feature_flags" (
  "feature_key" varchar(64) NOT NULL,
  "label" varchar(128) NOT NULL,
  "description" text DEFAULT NULL,
  "category" varchar(32) NOT NULL DEFAULT 'general',
  "is_enabled" smallint NOT NULL DEFAULT 1,
  "updated_at" timestamp NOT NULL,
  PRIMARY KEY ("feature_key")
);
INSERT INTO "game_engine_feature_flags" VALUES
('bounties_fence_enabled','Lowtown Bounty Notice Board & Silas Black Market Fence','Accept wanted dead/alive contracts and trade illicit contraband with the fence syndicate.','underworld',1,'2026-09-09 10:28:30'),
('colossus_raids_enabled','Apex Raid: Ashveil Colossus & Planet Mado QTE','Engage the multi-limb Colossus with 150ms Active Defense parry/dodge reactions.','combat',1,'2026-09-09 10:28:30'),
('faction_territory_enabled','Dynamic Faction Territory Wars & District Turf Control','Lowtown Syndicate vs City Watch vs Cults battling for district control, guards, and taxes.','factions',1,'2026-09-09 10:28:30'),
('forensic_mysteries_enabled','Forensic Crime Mystery & Magistrate Courtroom Trials','Autonomous murder mysteries, forensic clue collection, interrogations, and courtroom verdicts.','underworld',1,'2026-09-09 10:28:30'),
('godseye_sonar_enabled','God''s Eye Acoustic Sonar Radar & Soul Wiretap','Orbital radar grid with acoustic sonar pinging and live NPC subconscious mind telemetry.','telemetry',1,'2026-09-09 10:28:30'),
('npc_schedules_enabled','Autonomous Town Living Schedules & Circadian Shift','NPCs dynamically migrate between work stalls, taverns, and homes according to town time.','world',1,'2026-09-09 10:28:30'),
('runeforge_dispatch_enabled','Safehouse Bastion: Trophy Runeforging & Smuggler Dispatch','Carve monster trophies into socketed gear runes, brew alchemy gas, and dispatch offline missions.','crafting',1,'2026-09-09 10:28:30'),
('safehouse_vaults_enabled','Safehouse Loot Vaults, Trophy Wall & Sentry Guards','Store gold/gear, mount monster trophies for buffs, and station companions as guards.','property',1,'2026-09-09 10:28:30'),
('spoken_catacombs_enabled','Spoken Dungeon Catacombs On-Demand via Uile','Speak multi-floor procedural crypt generation prompts to Uile to instantly manifest playable dungeons.','dungeon',1,'2026-09-09 10:37:17'),
('voice_spellcraft_enabled','Real-Time Spoken Spellcrafting & Squad Voice Tactics','Mic-based voice spell incantations and tactical spoken companion voice directives.','voice',1,'2026-09-09 10:28:30');
DROP TABLE IF EXISTS "game_equip_slots";
CREATE TABLE "game_equip_slots" (
  "slot_key" varchar(32) NOT NULL,
  "name" varchar(64) NOT NULL,
  "display_order" integer NOT NULL DEFAULT 0,
  "icon" varchar(8) DEFAULT '?',
  "allows_types" varchar(255) DEFAULT NULL,
  PRIMARY KEY ("slot_key")
);
INSERT INTO "game_equip_slots" VALUES
('amulet','Amulet / Neck',3,'📿','ACCESSORY'),
('belt','Belt / Girdle',10,'🥋','ARMOR,ACCESSORY'),
('boots','Boots / Greaves',14,'👢','BOOTS,ARMOR'),
('chest','Torso / Armor',6,'🥋','ARMOR'),
('cloak','Cloak / Cape',5,'🧥','ARMOR,ACCESSORY'),
('face','Face / Mask',2,'🎭','ACCESSORY,ARMOR'),
('gloves','Gloves / Gauntlets',9,'🧤','ARMOR'),
('helmet','Headgear',1,'⛑️','HELMET,ARMOR'),
('offhand','Off-Hand Shield',8,'🛡️','ARMOR,WEAPON,ACCESSORY'),
('ring1','Left Ring',11,'💍','ACCESSORY'),
('ring2','Right Ring',12,'💍','ACCESSORY'),
('shoulders','Pauldrons / Mantle',4,'🛡️','ARMOR,ACCESSORY'),
('trinket','Trinket / Relic',13,'🧿','ACCESSORY,MISC'),
('weapon','Main Hand Weapon',7,'⚔️','WEAPON');
DROP TABLE IF EXISTS "game_faction_rep";
CREATE TABLE "game_faction_rep" (
  "char_id" integer NOT NULL,
  "faction" varchar(64) NOT NULL,
  "value" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("char_id","faction")
);
DROP TABLE IF EXISTS "game_feats";
CREATE TABLE "game_feats" (
  "id" integer  NOT NULL,
  "name" varchar(64) NOT NULL,
  "description" text DEFAULT NULL,
  "effect_json" text   DEFAULT NULL ,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_forensic_cases";
CREATE TABLE "game_forensic_cases" (
  "id" integer NOT NULL,
  "title" varchar(128) NOT NULL,
  "case_code" varchar(32) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'open',
  "crime_type" varchar(64) NOT NULL,
  "victim_name" varchar(128) NOT NULL,
  "location_hint" varchar(255) NOT NULL,
  "culprit_suspect_id" integer NOT NULL,
  "reward_gold" integer NOT NULL DEFAULT 300,
  "reward_xp" integer NOT NULL DEFAULT 500,
  "created_at" timestamp NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("case_code")
);
INSERT INTO "game_forensic_cases" VALUES
(33,'The Defenestration of Lord Aubrey','CASE-701','open','homicide','Lord Aubrey the Gilded','Rusty Anchor Tavern, 2nd Floor Room',2,450,750,'2026-09-09 10:37:17');
DROP TABLE IF EXISTS "game_gathering_skills";
CREATE TABLE "game_gathering_skills" (
  "id" integer NOT NULL,
  "key" varchar(64) DEFAULT NULL,
  "name" varchar(64) NOT NULL,
  "is_active" smallint DEFAULT 1,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_items";
CREATE TABLE "game_items" (
  "id" integer  NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text DEFAULT NULL,
  "type" varchar(64) NOT NULL DEFAULT 'MISC',
  "icon" varchar(8) DEFAULT '?',
  "slot" varchar(32) DEFAULT NULL,
  "value" integer NOT NULL DEFAULT 0,
  "bonus_hp" integer NOT NULL DEFAULT 0,
  "bonus_mp" integer NOT NULL DEFAULT 0,
  "bonus_atk" integer NOT NULL DEFAULT 0,
  "bonus_def" integer NOT NULL DEFAULT 0,
  "bonus_mo" integer NOT NULL DEFAULT 0,
  "bonus_md" integer NOT NULL DEFAULT 0,
  "bonus_speed" integer NOT NULL DEFAULT 0,
  "bonus_luck" integer NOT NULL DEFAULT 0,
  "level_req" integer NOT NULL DEFAULT 1,
  "elements" text   DEFAULT NULL ,
  "set_status" varchar(64) DEFAULT NULL,
  "stats_json" text   DEFAULT NULL ,
  "sprite_url" varchar(255) DEFAULT NULL,
  "rarity" varchar(32) DEFAULT 'common',
  "buy_price" integer DEFAULT 0,
  "sell_price" integer DEFAULT 0,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
INSERT INTO "game_items" VALUES
(1,'Iron Broadsword','A balanced double-edged iron sword forged for soldiers.','WEAPON','⚔️','weapon',50,0,0,10,2,0,0,0,2,1,NULL,NULL,NULL,'/sprites/weapon_sword.png','common',0,0,'2026-09-08 06:22:08'),
(2,'Shadow Dagger','Blackened blade that glints with poisonous edge.','WEAPON','🗡️','weapon',75,0,0,12,0,0,0,4,6,1,NULL,NULL,NULL,'/sprites/weapon_dagger.png','common',0,0,'2026-09-08 06:22:08'),
(3,'Arcane Wizard Staff','A tall gnarled staff topped with a glowing sapphire sphere.','WEAPON','🪄','weapon',90,0,30,4,0,15,5,0,2,1,NULL,NULL,NULL,'/sprites/weapon_staff.png','common',0,0,'2026-09-08 06:22:08'),
(4,'Mithril Greatsword','Lightweight yet razor sharp elven greatsword.','WEAPON','⚔️','weapon',220,15,0,24,4,0,0,2,5,1,NULL,NULL,NULL,'/sprites/weapon_sword.png','common',0,0,'2026-09-08 06:22:08'),
(5,'Hunter Longbow','Carved yew bow capable of striking across the battlefield.','WEAPON','🏹','weapon',80,0,0,11,0,0,0,3,4,1,NULL,NULL,NULL,'/sprites/weapon_bow.png','common',0,0,'2026-09-08 06:22:08'),
(6,'Bone Necro Wand','Carved bone channel that vibrates with necromantic frequencies.','WEAPON','🪄','weapon',140,0,40,6,0,18,4,1,3,1,NULL,NULL,NULL,'/sprites/weapon_staff.png','common',0,0,'2026-09-08 06:22:08'),
(7,'Leather Brigandine','Flexible studded leather cuirass granting mobility and protection.','ARMOR','🥋','chest',60,15,0,0,8,0,2,2,1,1,NULL,NULL,NULL,'/sprites/armor_leather.png','common',0,0,'2026-09-08 06:22:08'),
(8,'Steel Plate Mail','Heavy interlocking steel plates that turn away steel and claw.','ARMOR','🛡️','chest',180,40,0,0,20,0,8,-2,0,1,NULL,NULL,NULL,'/sprites/armor_plate.png','common',0,0,'2026-09-08 06:22:08'),
(9,'Arcane Silk Robes','Runed silk infused with warding sigils that pulse with mana.','ARMOR','👘','chest',130,0,35,0,6,12,14,1,3,1,NULL,NULL,NULL,'/sprites/armor_robe.png','common',0,0,'2026-09-08 06:22:08'),
(10,'Shadow Assassin Tunic','Midnight-dyed cloth that muffles sound and blends with darkness.','ARMOR','🥷','chest',150,10,10,2,9,0,3,5,5,1,NULL,NULL,NULL,'/sprites/armor_leather.png','common',0,0,'2026-09-08 06:22:08'),
(11,'Bronze Round Shield','Reinforced bronze shield with iron boss.','ARMOR','🛡️','offhand',65,15,0,0,10,0,4,-1,0,1,NULL,NULL,NULL,'/sprites/shield_bronze.png','common',0,0,'2026-09-08 06:22:08'),
(12,'Arcane Focal Orb','Hovering crystalline sphere that magnifies magical cast efficiency.','ACCESSORY','🔮','offhand',110,0,25,2,2,10,8,0,4,1,NULL,NULL,NULL,'/sprites/acc_orb.png','common',0,0,'2026-09-08 06:22:08'),
(13,'Iron Barbute','Open-faced steel helmet modeled after ancient designs.','HELMET','⛑️','helmet',45,10,0,0,5,0,2,0,0,1,NULL,NULL,NULL,'/sprites/helm_iron.png','common',0,0,'2026-09-08 06:22:08'),
(14,'Shadow Cowl','Dark cowl that obscures the face in deep violet shadows.','HELMET','🥷','helmet',70,0,10,1,3,2,2,2,3,1,NULL,NULL,NULL,'/sprites/helm_cowl.png','common',0,0,'2026-09-08 06:22:08'),
(15,'Crown of Embers','Circlet of charred gold set with smoldering rubies.','HELMET','👑','helmet',240,20,20,3,6,8,6,1,5,1,NULL,NULL,NULL,'/sprites/helm_crown.png','common',0,0,'2026-09-08 06:22:08'),
(16,'Reinforced Leather Boots','Treated leather boots designed for rugged travel and quick strides.','BOOTS','👢','boots',40,10,0,0,4,0,1,3,1,1,NULL,NULL,NULL,'/sprites/boots_leather.png','common',0,0,'2026-09-08 06:22:08'),
(17,'Steel Greaves','Heavy shin guards crafted for front-line infantry.','BOOTS','👢','boots',90,20,0,0,9,0,4,-1,0,1,NULL,NULL,NULL,'/sprites/boots_plate.png','common',0,0,'2026-09-08 06:22:08'),
(18,'Ring of Vitality','A warm silver band that pulsates with healthy vitality.','ACCESSORY','💍','ring1',120,35,0,0,2,0,2,0,3,1,NULL,NULL,NULL,'/sprites/ring_gold.png','common',0,0,'2026-09-08 06:22:08'),
(19,'Amulet of the Eclipse','Dark pendant that converts incoming spell damage into mana.','ACCESSORY','📿','amulet',160,10,25,2,2,6,8,1,4,1,NULL,NULL,NULL,'/sprites/amulet_eclipse.png','common',0,0,'2026-09-08 06:22:08'),
(20,'Health Potion','Restores 50 HP upon consumption.','CONSUMABLE','🧪',NULL,30,0,0,0,0,0,0,0,0,1,NULL,NULL,NULL,NULL,'common',0,0,'2026-09-08 06:22:08'),
(21,'Mana Potion','Restores 35 MP upon consumption.','CONSUMABLE','💙',NULL,25,0,0,0,0,0,0,0,0,1,NULL,NULL,NULL,NULL,'common',0,0,'2026-09-08 06:22:08'),
(22,'Silk Assassin Half-Mask','A breathable black silk wrap with breath filter, obscuring identity and dampening sound.','ACCESSORY','🎭','face',75,0,0,0,4,0,0,6,4,1,NULL,NULL,NULL,NULL,'common',0,0,'2026-09-08 06:22:08'),
(23,'Plague Doctor Beak Mask','Cured hardened leather mask packed with fragrant dried herbs to ward off miasma and airborne blight.','ACCESSORY','🎭','face',120,0,0,0,6,5,8,2,5,2,NULL,NULL,NULL,NULL,'common',0,0,'2026-09-08 06:22:08'),
(24,'Gilded Venetian Masquerade','Carved porcelain with gold leaf trim, granting an aura of irresistible noble mystique.','ACCESSORY','🎭','face',180,0,20,0,2,10,4,0,8,3,NULL,NULL,NULL,NULL,'common',0,0,'2026-09-08 06:22:08'),
(25,'Shadowveil Travel Cloak','Weatherproofed hooded cloak that bends dim light to shroud the traveler from road highwaymen.','ARMOR','🧥','cloak',60,20,0,0,4,0,0,4,2,1,NULL,NULL,NULL,NULL,'common',0,0,'2026-09-08 06:22:08'),
(26,'Fur-Lined Mountain Mantle','Thick direwolf pelt draped across the back, sealing in body heat against tundra blizzards.','ARMOR','🧥','cloak',110,35,0,3,7,0,0,0,0,2,NULL,NULL,NULL,NULL,'common',0,0,'2026-09-08 06:22:08'),
(27,'Archmage Celestial Cape','Velvet cape embroidered with shifting constellations that replenish the wearer''s mana reserves.','ARMOR','🧥','cloak',210,0,40,0,2,12,8,2,0,3,NULL,NULL,NULL,NULL,'common',0,0,'2026-09-08 06:22:08'),
(28,'Girdle of the Mountain Giant','Heavy boiled leather strap with an iron boulder buckle, infusing the hips with titan strength.','ARMOR','🥋','belt',130,30,0,10,4,0,0,0,0,2,NULL,NULL,NULL,NULL,'common',0,0,'2026-09-08 06:22:08'),
(29,'Alchemist Quick-Draw Sash','Treated leather belt with glass vial loops, allowing instant access to curative reagents.','ACCESSORY','🥋','belt',95,0,25,0,2,0,0,8,6,1,NULL,NULL,NULL,NULL,'common',0,0,'2026-09-08 06:22:08'),
(30,'Spiked Iron Pauldrons','Layered steel shoulder guards featuring flared blades that deflect head-high cleaves.','ARMOR','🛡️','shoulders',125,15,0,4,10,0,2,0,0,2,NULL,NULL,NULL,NULL,'common',0,0,'2026-09-08 06:22:08'),
(31,'Runed Archmage Epaulets','Silver-threaded shoulder mantle radiating an ambient spell-deflecting ward.','ARMOR','🛡️','shoulders',190,0,20,0,3,14,10,0,0,3,NULL,NULL,NULL,NULL,'common',0,0,'2026-09-08 06:22:08'),
(32,'Lucky Loaded Bone Die','Carved dragon tooth bearing six carved runes, whispering probability to the bearer.','ACCESSORY','🧿','trinket',80,0,0,0,0,0,0,5,12,1,NULL,NULL,NULL,NULL,'common',0,0,'2026-09-08 06:22:08'),
(33,'Blessed Reliquary of Light','A miniature filigree lantern containing radiant ember dust from the First Dawn.','ACCESSORY','🏺','trinket',160,25,25,0,0,0,8,0,5,2,NULL,NULL,NULL,NULL,'common',0,0,'2026-09-08 06:22:08');
DROP TABLE IF EXISTS "game_limit_breaks";
CREATE TABLE "game_limit_breaks" (
  "id" integer  NOT NULL,
  "name" varchar(64) NOT NULL,
  "description" text DEFAULT NULL,
  "class_id" integer  NOT NULL,
  "break_level" integer NOT NULL DEFAULT 1,
  "char_level_req" integer NOT NULL DEFAULT 1,
  "target_type" varchar(32) NOT NULL DEFAULT 'ENEMY',
  "icon" varchar(8) DEFAULT '?',
  "effects" text   DEFAULT NULL ,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_lottery_tickets";
CREATE TABLE "game_lottery_tickets" (
  "id" integer NOT NULL,
  "char_id" integer NOT NULL,
  "char_name" varchar(64) NOT NULL,
  "map_id" integer NOT NULL DEFAULT 1,
  "numbers" varchar(32) NOT NULL,
  "cost_gold" integer NOT NULL DEFAULT 10,
  "drawn" smallint NOT NULL DEFAULT 0,
  "payout_gold" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_map_drafts";
CREATE TABLE "game_map_drafts" (
  "id" integer NOT NULL,
  "map_id" integer NOT NULL,
  "user_id" integer NOT NULL DEFAULT 0,
  "draft_json" text NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_map_event_rows";
CREATE TABLE "game_map_event_rows" (
  "id" varchar(40) NOT NULL,
  "map_id" integer NOT NULL,
  "x" integer NOT NULL,
  "y" integer NOT NULL,
  "kind" varchar(40) NOT NULL,
  "script_id" integer DEFAULT NULL,
  "payload_json" text NOT NULL,
  "updated_at" timestamp NOT NULL,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_map_object_rows";
CREATE TABLE "game_map_object_rows" (
  "id" varchar(40) NOT NULL,
  "map_id" integer NOT NULL,
  "x" integer NOT NULL,
  "y" integer NOT NULL,
  "payload_json" text NOT NULL,
  "updated_at" timestamp NOT NULL,
  PRIMARY KEY ("id")
);
INSERT INTO "game_map_object_rows" VALUES
('brazier_0',1,23,6,'{"id": "brazier_0", "label": "Smoldering Ember Brazier", "x": 23, "y": 6, "group": "PROP", "preset": "TORCH", "sprite_url": "/sprites/brazier_fire_0.png", "sprite_anim_urls": ["/sprites/brazier_fire_0.png", "/sprites/brazier_fire_1.png", "/sprites/brazier_fire_2.png", "/sprites/brazier_fire_3.png"], "sprite_w": 32, "sprite_h": 48, "anim_fps": 6, "blocking": false, "light": {"radius": 6, "color": "#ff7700", "flicker": true}}','2026-09-03 08:09:58'),
('brazier_1',1,7,8,'{"id": "brazier_1", "label": "Smoldering Ember Brazier", "x": 7, "y": 8, "group": "PROP", "preset": "TORCH", "sprite_url": "/sprites/brazier_fire_0.png", "sprite_anim_urls": ["/sprites/brazier_fire_0.png", "/sprites/brazier_fire_1.png", "/sprites/brazier_fire_2.png", "/sprites/brazier_fire_3.png"], "sprite_w": 32, "sprite_h": 48, "anim_fps": 6, "blocking": false, "light": {"radius": 6, "color": "#ff7700", "flicker": true}}','2026-09-03 08:09:58'),
('brazier_2',1,20,6,'{"id": "brazier_2", "label": "Smoldering Ember Brazier", "x": 20, "y": 6, "group": "PROP", "preset": "TORCH", "sprite_url": "/sprites/brazier_fire_0.png", "sprite_anim_urls": ["/sprites/brazier_fire_0.png", "/sprites/brazier_fire_1.png", "/sprites/brazier_fire_2.png", "/sprites/brazier_fire_3.png"], "sprite_w": 32, "sprite_h": 48, "anim_fps": 6, "blocking": false, "light": {"radius": 6, "color": "#ff7700", "flicker": true}}','2026-09-03 08:09:58'),
('brazier_3',1,25,11,'{"id": "brazier_3", "label": "Smoldering Ember Brazier", "x": 25, "y": 11, "group": "PROP", "preset": "TORCH", "sprite_url": "/sprites/brazier_fire_0.png", "sprite_anim_urls": ["/sprites/brazier_fire_0.png", "/sprites/brazier_fire_1.png", "/sprites/brazier_fire_2.png", "/sprites/brazier_fire_3.png"], "sprite_w": 32, "sprite_h": 48, "anim_fps": 6, "blocking": false, "light": {"radius": 6, "color": "#ff7700", "flicker": true}}','2026-09-03 08:09:59'),
('brazier_4',1,9,10,'{"id": "brazier_4", "label": "Smoldering Ember Brazier", "x": 9, "y": 10, "group": "PROP", "preset": "TORCH", "sprite_url": "/sprites/brazier_fire_0.png", "sprite_anim_urls": ["/sprites/brazier_fire_0.png", "/sprites/brazier_fire_1.png", "/sprites/brazier_fire_2.png", "/sprites/brazier_fire_3.png"], "sprite_w": 32, "sprite_h": 48, "anim_fps": 6, "blocking": false, "light": {"radius": 6, "color": "#ff7700", "flicker": true}}','2026-09-03 08:09:59'),
('pillar_0',1,6,7,'{"id": "pillar_0", "label": "Fluted Basalt Pillar", "x": 6, "y": 7, "group": "PROP", "preset": "PILLAR", "sprite_url": "/sprites/gothic_pillar.png", "sprite_w": 32, "sprite_h": 64, "blocking": true, "light": null}','2026-09-03 08:09:59'),
('pillar_1',1,22,5,'{"id": "pillar_1", "label": "Fluted Basalt Pillar", "x": 22, "y": 5, "group": "PROP", "preset": "PILLAR", "sprite_url": "/sprites/gothic_pillar.png", "sprite_w": 32, "sprite_h": 64, "blocking": true, "light": null}','2026-09-03 08:09:59'),
('pillar_2',1,8,11,'{"id": "pillar_2", "label": "Fluted Basalt Pillar", "x": 8, "y": 11, "group": "PROP", "preset": "PILLAR", "sprite_url": "/sprites/gothic_pillar.png", "sprite_w": 32, "sprite_h": 64, "blocking": true, "light": null}','2026-09-03 08:09:59'),
('pillar_3',1,24,12,'{"id": "pillar_3", "label": "Fluted Basalt Pillar", "x": 24, "y": 12, "group": "PROP", "preset": "PILLAR", "sprite_url": "/sprites/gothic_pillar.png", "sprite_w": 32, "sprite_h": 64, "blocking": true, "light": null}','2026-09-03 08:09:59'),
('rubble_0',1,15,8,'{"id": "rubble_0", "label": "Citadel Rubble", "x": 15, "y": 8, "group": "DECAL", "preset": "RUBBLE", "sprite_url": "/sprites/citadel_rubble.png", "sprite_w": 32, "sprite_h": 32, "blocking": false, "light": null}','2026-09-03 08:09:59'),
('rubble_1',1,18,12,'{"id": "rubble_1", "label": "Citadel Rubble", "x": 18, "y": 12, "group": "DECAL", "preset": "RUBBLE", "sprite_url": "/sprites/citadel_rubble.png", "sprite_w": 32, "sprite_h": 32, "blocking": false, "light": null}','2026-09-03 08:09:59');
DROP TABLE IF EXISTS "game_map_ops_log";
CREATE TABLE "game_map_ops_log" (
  "id" bigint  NOT NULL,
  "map_id" integer NOT NULL,
  "branch_id" integer DEFAULT NULL,
  "op_id" varchar(64) NOT NULL,
  "op_type" varchar(32) NOT NULL,
  "patch_json" text NOT NULL,
  "author_id" integer DEFAULT NULL,
  "author_name" varchar(128) DEFAULT NULL,
  "sequence" integer  NOT NULL DEFAULT 0,
  "inverted" smallint NOT NULL DEFAULT 0,
  "parent_op_id" varchar(64) DEFAULT NULL,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("map_id","op_id")
);
DROP TABLE IF EXISTS "game_map_snapshots";
CREATE TABLE "game_map_snapshots" (
  "id" integer NOT NULL,
  "map_id" integer NOT NULL,
  "seq" bigint NOT NULL,
  "layers" text   NOT NULL ,
  "inserted_at" timestamp(6) NOT NULL,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_map_sound_zones";
CREATE TABLE "game_map_sound_zones" (
  "map_id" integer NOT NULL,
  "zones_json" text NOT NULL,
  "updated_at" timestamp NOT NULL,
  PRIMARY KEY ("map_id")
);
DROP TABLE IF EXISTS "game_map_spawn_zones";
CREATE TABLE "game_map_spawn_zones" (
  "id" integer NOT NULL,
  "map_id" integer NOT NULL,
  "zones_json" text DEFAULT NULL,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_map_stamps";
CREATE TABLE "game_map_stamps" (
  "id" integer NOT NULL,
  "name" varchar(128) NOT NULL,
  "layer" varchar(32) NOT NULL DEFAULT 'ground',
  "payload_json" text NOT NULL,
  "map_id" integer DEFAULT NULL,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_maps";
CREATE TABLE "game_maps" (
  "id" integer  NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text DEFAULT NULL,
  "width" integer NOT NULL DEFAULT 20,
  "height" integer NOT NULL DEFAULT 20,
  "tiles_json" text DEFAULT NULL,
  "collisions_json" text DEFAULT NULL,
  "objects_json" text DEFAULT NULL,
  "anims_json" text DEFAULT NULL,
  "tileset_url" varchar(500) DEFAULT NULL,
  "ambient_dark" float NOT NULL DEFAULT 0,
  "fast_travel_enabled" smallint NOT NULL DEFAULT 1,
  "min_level" integer NOT NULL DEFAULT 1,
  "is_active" smallint NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "render_mode" varchar(32) NOT NULL DEFAULT 'classic',
  "schema_version" integer NOT NULL DEFAULT 2,
  "layers_json" text DEFAULT NULL,
  "fog_of_war" integer NOT NULL DEFAULT 0,
  "ambient_visibility" float NOT NULL DEFAULT 1,
  "head_seq" bigint NOT NULL DEFAULT 0,
  "spawn_x" integer DEFAULT 5,
  "spawn_y" integer DEFAULT 5,
  "region_id" integer DEFAULT NULL,
  PRIMARY KEY ("id")
);
INSERT INTO "game_maps" VALUES
(1,'Ashveil','Ashveil, a ruined gothic citadel smothered in deep grey volcanic ash, cracked soot-stained cobblestone pathways, crumbling dark basalt brick walls, charred timber beams, and faint glowing orange embers.',30,30,NULL,NULL,'[{"id": "brazier_0", "type": "light_source", "name": "Smoldering Ember Brazier", "x": 23, "y": 6, "color": "#ff7700", "radius": 6, "flicker": true, "intensity": 0.95}, {"id": "brazier_1", "type": "light_source", "name": "Smoldering Ember Brazier", "x": 7, "y": 8, "color": "#ff7700", "radius": 6, "flicker": true, "intensity": 0.95}, {"id": "brazier_2", "type": "light_source", "name": "Smoldering Ember Brazier", "x": 20, "y": 6, "color": "#ff7700", "radius": 6, "flicker": true, "intensity": 0.95}, {"id": "brazier_3", "type": "light_source", "name": "Smoldering Ember Brazier", "x": 25, "y": 11, "color": "#ff7700", "radius": 6, "flicker": true, "intensity": 0.95}, {"id": "brazier_4", "type": "light_source", "name": "Smoldering Ember Brazier", "x": 9, "y": 10, "color": "#ff7700", "radius": 6, "flicker": true, "intensity": 0.95}]',NULL,NULL,0.85,1,1,1,'2026-09-03 11:31:15','2.5d',2,'{"layers": {"ground": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], "overlay": [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1], "fringe": [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1], "elevation": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], "passability": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]}}',0,1,0,5,5,NULL),
(101,'The Prancing Mare Tavern (Interior)','Raucous two-story tavern smelling of spiced mead, roasted boar, and peat fire.',12,12,NULL,NULL,NULL,NULL,NULL,0,1,1,1,'2026-09-08 08:05:58','classic',2,NULL,0,1,0,5,5,NULL),
(102,'Barnaby''s Apothecary & Provisioner (Interior)','Cluttered apothecary stocked with bubbling glass alembics, salves, and tempered blades.',12,12,NULL,NULL,NULL,NULL,NULL,0,1,1,1,'2026-09-08 08:05:58','classic',2,NULL,0,1,0,5,5,NULL),
(103,'Sanctuary of the Dawn Hearth (Interior)','Serene stone temple lined with burning votive candles and restorative herb beds.',12,12,NULL,NULL,NULL,NULL,NULL,0,1,1,1,'2026-09-08 08:05:58','classic',2,NULL,0,1,0,5,5,NULL),
(104,'Silas''s Shadow Den & Smugglers'' Cellar (Interior)','Concealed cellar entrance hidden beneath rotten crates, leading into an illicit black market.',12,12,NULL,NULL,NULL,NULL,NULL,0,1,1,1,'2026-09-08 08:05:58','classic',2,NULL,0,1,0,5,5,NULL);
DROP TABLE IF EXISTS "game_match_modes";
CREATE TABLE "game_match_modes" (
  "key" varchar(80) NOT NULL,
  "name" varchar(120) NOT NULL,
  "description" text DEFAULT NULL,
  "team_size" integer DEFAULT 1,
  "team_count" integer DEFAULT 2,
  "map_pool_json" text DEFAULT NULL,
  "queue_type" varchar(16) DEFAULT 'casual',
  "allow_spectators" smallint DEFAULT 1,
  "lobby_timeout_seconds" integer DEFAULT 120,
  "ready_check_seconds" integer DEFAULT 15,
  "match_time_limit_seconds" integer DEFAULT 0,
  "win_conditions_json" text DEFAULT NULL,
  "rewards_json" text DEFAULT NULL,
  "settings_json" text DEFAULT NULL,
  "enabled" smallint DEFAULT 1,
  "updated_at" timestamp NOT NULL,
  PRIMARY KEY ("key")
);
INSERT INTO "game_match_modes" VALUES
('1v1_duel','Ranked Duel','1v1 PvP combat. Best of 1.',1,2,'[]','ranked',1,60,10,300,'{"type":"last_standing"}','{"gold_loss":25,"gold_win":100,"rank_loss":-10,"rank_win":20,"xp_loss":50,"xp_win":200}','{}',1,'2026-09-03 07:15:53'),
('3v3_arena','3v3 Arena','Team deathmatch. First team to eliminate all enemies wins.',3,2,'[]','casual',1,90,15,600,'{"type":"last_standing"}','{"gold_loss":40,"gold_win":150,"xp_loss":100,"xp_win":350}','{}',1,'2026-09-03 07:15:53'),
('4v1_horror','4v1 Horror','4 survivors vs 1 killer. Repair generators, escape.',4,2,'[]','casual',1,90,15,900,'{"objective_key":"dbd_generator","required_count":5,"type":"objective"}','{"gold_loss":50,"gold_win":175,"xp_loss":150,"xp_win":400}','{"asymmetric":true,"killer_team_size":1,"survivor_team_size":4}',1,'2026-09-03 07:15:53'),
('5v5_moba','5v5 MOBA','Destroy the enemy nexus. Lanes, towers, jungle.',5,2,'[]','ranked',1,120,15,2400,'{"objective_key":"nexus","type":"objective"}','{"gold_loss":75,"gold_win":250,"rank_loss":-15,"rank_win":25,"xp_loss":200,"xp_win":600}','{"ban_count":2,"ban_phase":true,"pick_phase":true}',1,'2026-09-03 07:15:53'),
('ffa_battle_royale','Battle Royale (FFA)','Last player standing wins. Shrinking zone.',1,20,'[]','casual',1,180,10,900,'{"type":"last_standing"}','{"gold_loss":25,"gold_win":300,"xp_loss":75,"xp_win":500}','{"shrink_damage":5,"shrink_interval_seconds":60,"shrink_zone":true}',1,'2026-09-03 07:15:53'),
('td_coop','Co-op Tower Defense','Survive all waves together. One team, shared towers.',4,1,'[]','casual',1,60,10,0,'{"type":"wave_clear","wave_def_key":"td_basic"}','{"gold_win":200,"xp_win":400}','{}',1,'2026-09-03 07:15:53');
DROP TABLE IF EXISTS "game_npc_relationships";
CREATE TABLE "game_npc_relationships" (
  "id" integer  NOT NULL,
  "npc_id_a" varchar(64) NOT NULL,
  "npc_id_b" varchar(64) NOT NULL,
  "relationship" varchar(64) NOT NULL DEFAULT 'neutral',
  "strength" integer DEFAULT 50,
  "description" varchar(256) DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("npc_id_a","npc_id_b")
);
INSERT INTO "game_npc_relationships" VALUES
(1,'valerius','lyra','rival',40,'Ideological tension: Paladin dogma vs. forbidden sorcery.'),
(2,'valerius','bram','ally',75,'Brothers-in-arms: Shared military discipline and mutual combat respect.'),
(3,'lyra','bram','friend',65,'Warm rapport: Bram loves her witty remarks, and she appreciates his straightforward candor.');
DROP TABLE IF EXISTS "game_npc_schedules";
CREATE TABLE "game_npc_schedules" (
  "id" integer NOT NULL,
  "npc_name" varchar(128) NOT NULL,
  "phase" varchar(32) NOT NULL,
  "target_x" integer NOT NULL,
  "target_y" integer NOT NULL,
  "activity_name" varchar(128) NOT NULL,
  "dialogue_override" text DEFAULT NULL,
  "icon" varchar(16) NOT NULL DEFAULT '?',
  "map_id" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
INSERT INTO "game_npc_schedules" VALUES
(1,'Barnaby the Quartermaster','dawn',14,12,'Setting up apothecary stall','The morning dew is the best time to unpack dried elderberry.','📦',1,'2026-09-09 09:48:16'),
(2,'Barnaby the Quartermaster','day',15,12,'Trading apothecary wares','Finest salves and tinctures this side of the Sunken Spire!','⚖️',1,'2026-09-09 09:48:16'),
(3,'Barnaby the Quartermaster','dusk',22,18,'Nursing a tankard of stout','Ah, my feet ache from standing behind that wooden counter all day.','🍺',1,'2026-09-09 09:48:16'),
(4,'Barnaby the Quartermaster','night',8,6,'Locking his shop registers','Better count the till twice before those Lowtown pickpockets get any ideas.','🔐',1,'2026-09-09 09:48:16'),
(5,'Barnaby the Quartermaster','midnight',8,5,'Asleep in his cottage loft','*Snoring heavily with a ledger under his arm*','💤',1,'2026-09-09 09:48:16'),
(6,'Rowan the Tavern Bard','dawn',25,19,'Sleeping in tavern loft','*Muffled humming in deep slumber*','💤',1,'2026-09-09 09:48:16'),
(7,'Rowan the Tavern Bard','day',18,15,'Tuning his masterwork lute','A melody needs morning air to resonate true in the heart.','🎵',1,'2026-09-09 09:48:16'),
(8,'Rowan the Tavern Bard','dusk',24,18,'Performing drinking anthems','Raise your goblets, lads! To the brave souls who defy the encroaching mist!','🪕',1,'2026-09-09 09:48:16'),
(9,'Rowan the Tavern Bard','night',24,18,'Singing haunting Lowtown ballads','A song for the shadows that linger when the hearthfires die down...','🎶',1,'2026-09-09 09:48:16'),
(10,'Rowan the Tavern Bard','midnight',23,20,'Whispering tavern rumors','Keep your voice down, traveler. The walls have ears after midnight.','🤫',1,'2026-09-09 09:48:16'),
(11,'Captain Vane of the Night Watch','dawn',12,8,'Inspecting morning watchmen','Keep your shields up and eyes on the forest tree line!','🛡️',1,'2026-09-09 09:48:16'),
(12,'Captain Vane of the Night Watch','day',10,8,'Reviewing magistrate warrants','Too many bandits slipping past the outer palisade lately.','📜',1,'2026-09-09 09:48:16'),
(13,'Captain Vane of the Night Watch','dusk',12,22,'Reinforcing the south town gate','Close the iron grates! Curfew is coming!','⚔️',1,'2026-09-09 09:48:16'),
(14,'Captain Vane of the Night Watch','night',16,18,'Leading alleyway lantern patrol','Halt! State your business in the dark!','🏮',1,'2026-09-09 09:48:16'),
(15,'Captain Vane of the Night Watch','midnight',16,18,'Cornering nocturnal suspects','One false move and you''ll sleep in the magistrate''s iron cage!','🔦',1,'2026-09-09 09:48:16'),
(16,'Silas the Shadow Fence','dawn',5,25,'Sleeping in secret basement','*Resting with one eye open and a stiletto gripped in hand*','💤',1,'2026-09-09 09:48:16'),
(17,'Silas the Shadow Fence','day',6,24,'Polishing contraband lockpicks','Everything has a price, my friend. Even secrets.','🔑',1,'2026-09-09 09:48:16'),
(18,'Silas the Shadow Fence','dusk',20,21,'Whispering behind the stables','Got anything shiny from that last excursion? I pay clean coin.','👤',1,'2026-09-09 09:48:16'),
(19,'Silas the Shadow Fence','night',15,14,'Stalking marks from dark eaves','Watch your purse strings, stranger. Lowtown has quick fingers.','🗡️',1,'2026-09-09 09:48:16'),
(20,'Silas the Shadow Fence','midnight',14,15,'Exchanging marked gold bars','Take the parcel, deliver it to the Sunken Crypts, and speak no names.','💰',1,'2026-09-09 09:48:16');
DROP TABLE IF EXISTS "game_npc_stalker_dramas";
CREATE TABLE "game_npc_stalker_dramas" (
  "id" integer NOT NULL,
  "map_id" integer NOT NULL,
  "stalker_name" varchar(64) NOT NULL,
  "stalker_icon" varchar(16) NOT NULL DEFAULT '?️',
  "stalker_role" varchar(32) NOT NULL DEFAULT 'assassin',
  "victim_name" varchar(64) NOT NULL,
  "victim_icon" varchar(16) NOT NULL DEFAULT '?',
  "victim_role" varchar(32) NOT NULL DEFAULT 'apprentice',
  "motive" varchar(128) NOT NULL,
  "stage" varchar(32) NOT NULL DEFAULT 'stalking',
  "location_desc" varchar(128) NOT NULL,
  "stalker_x" integer NOT NULL DEFAULT 8,
  "stalker_y" integer NOT NULL DEFAULT 12,
  "victim_x" integer NOT NULL DEFAULT 10,
  "victim_y" integer NOT NULL DEFAULT 12,
  "bounty_reward" integer NOT NULL DEFAULT 120,
  "clues_json" text DEFAULT NULL,
  "witness_rumor" varchar(255) NOT NULL,
  "turn_timer" integer NOT NULL DEFAULT 6,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_npcs";
CREATE TABLE "game_npcs" (
  "id" integer NOT NULL,
  "name" varchar(128) NOT NULL,
  "icon" varchar(64) DEFAULT '?',
  "persona" text DEFAULT NULL,
  "map_id" integer DEFAULT NULL,
  "x" integer DEFAULT 5,
  "y" integer DEFAULT 5,
  "is_enemy" smallint NOT NULL DEFAULT 0,
  "move_type" varchar(32) NOT NULL DEFAULT 'STATIONARY',
  "wander_radius" integer NOT NULL DEFAULT 3,
  "shop_id" integer DEFAULT NULL,
  "base_hp" integer NOT NULL DEFAULT 100,
  "base_mp" integer NOT NULL DEFAULT 50,
  "base_atk" integer NOT NULL DEFAULT 10,
  "base_def" integer NOT NULL DEFAULT 10,
  "base_mo" integer NOT NULL DEFAULT 10,
  "base_md" integer NOT NULL DEFAULT 10,
  "base_speed" integer NOT NULL DEFAULT 10,
  "base_luck" integer NOT NULL DEFAULT 10,
  "element" varchar(32) NOT NULL DEFAULT 'PHYSICAL',
  "drop_table_json" text DEFAULT NULL,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  "sprite_url" varchar(255) DEFAULT NULL,
  "portrait_url" varchar(255) DEFAULT NULL,
  "sovereign_soul_id" varchar(64) DEFAULT NULL,
  "role" varchar(64) DEFAULT 'villager',
  "faction" varchar(64) DEFAULT 'neutral',
  "level" integer DEFAULT 1,
  "hp" integer DEFAULT 100,
  "max_hp" integer DEFAULT 100,
  "is_recruitable" smallint DEFAULT 0,
  "is_hostile" smallint DEFAULT 0,
  "is_active" smallint DEFAULT 1,
  "is_nocturnal" smallint DEFAULT 0,
  "is_sleeping" smallint DEFAULT 0,
  "current_activity" varchar(128) DEFAULT 'Idling in town',
  PRIMARY KEY ("id")
);
INSERT INTO "game_npcs" VALUES
(101,'Rowan the Tavern Bard','🪕','Jovial minstrel composing ballads of living heroes and tavern brawls.',1,8,12,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:48:15',NULL,NULL,NULL,'bard','Civilians',1,100,100,0,0,1,0,0,'Performing drinking anthems'),
(102,'Mother Althea the Priestess','🕊️','Gentle healer of the Dawn Hearth who tends to wounded travelers.',1,14,8,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:48:15',NULL,NULL,NULL,'priest','Dawn Order',1,100,100,0,0,1,0,0,'Idling in town'),
(103,'Barnaby the Quartermaster','🪙','Gruff dwarven provisioner selling tempered steel, flasks, and supplies.',1,12,14,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:48:15',NULL,NULL,NULL,'merchant','Merchants',1,100,100,0,0,1,0,0,'Nursing a tankard of stout'),
(104,'Pippin the Street Urchin','🐀','Quick-witted orphan with sharp ears who knows every alley secret.',1,6,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:48:15',NULL,NULL,NULL,'beggar','Civilians',1,100,100,0,0,1,0,0,'Idling in town'),
(105,'Master Eldrin the Astronomer','📜','Wise scholar obsessed with celestial alignments and ancient oghams.',1,18,6,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:48:15',NULL,NULL,NULL,'scholar','Academy',1,100,100,0,0,1,0,0,'Idling in town'),
(106,'Silas the Shadow Fence','🗝️','Midnight broker dealing in illicit wares and rare nocturnal trinkets.',1,20,21,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:48:15',NULL,NULL,NULL,'smuggler','Shadow Syndicate',1,100,100,0,0,1,1,0,'Whispering behind the stables'),
(107,'Captain Vane of the Night Watch','🏮','Vigilant lantern-bearer patrolling the dark cobbles to enforce curfew.',1,12,22,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:48:15',NULL,NULL,NULL,'guard','Town Watch',1,100,100,0,0,1,1,0,'Reinforcing the south town gate'),
(108,'Grendel the Shadow Prowler','🐺','Nocturnal stalker that hunts only under the shroud of darkness.',1,22,20,1,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:48:15',NULL,NULL,NULL,'beast','Wild',1,100,100,0,1,1,1,0,'Idling in town'),
(109,'Olaf the Stumbling Drunkard','🍺','Belligerent tavern regular swaying outside the Prancing Mare looking for a brawl or free ale.',1,7,13,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:05:58',NULL,NULL,NULL,'drunk','Civilians',1,80,100,0,0,1,1,0,'Idling in town'),
(901,'Barnaby the Quartermaster','👤',NULL,1,12,14,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 09:48:16',NULL,NULL,NULL,'merchant','neutral',1,100,100,0,0,1,0,0,'Nursing a tankard of stout'),
(100001,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:21:28',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100002,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:21:28',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100004,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:21:40',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100005,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:21:40',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100006,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:32:40',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100007,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:32:41',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100008,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:37:11',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100009,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:37:11',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100010,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:50:15',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100011,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:50:17',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100012,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:50:39',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100013,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:50:39',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100015,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:50:52',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100016,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 07:50:53',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100017,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:01:12',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100018,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:01:13',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100020,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:06:38',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100021,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:06:38',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100023,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:06:57',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100024,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:06:57',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100026,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:11:59',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100027,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:11:59',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100029,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:12:46',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100030,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:12:46',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100032,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:26:03',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100033,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:26:03',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100034,'Corvus the Whisper','🕵️','An agile shadow tail hired by an unknown syndicate to shadow adventurers and peek through tavern windows.',1,1,30,0,'STATIONARY',3,NULL,45,50,10,10,10,10,16,10,'PHYSICAL',NULL,'2026-09-08 08:40:47',NULL,NULL,NULL,'stalker','shadow_syndicate',1,45,45,0,0,1,1,0,'Idling in town'),
(100035,'Twitchy Fitch','🥀','A shivering dream-lotus fiend huddled in the damp alley behind the apothecary, desperate for dust or coin.',1,4,15,0,'STATIONARY',3,NULL,25,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:40:47',NULL,NULL,NULL,'addict','gutter_folk',1,25,25,0,0,1,0,0,'Idling in town'),
(100036,'Groggy Brant','🍺','A red-nosed tavern regular who sways on the cobblestones looking for anyone who spilled his drink.',1,6,12,1,'STATIONARY',3,NULL,60,50,10,10,10,10,8,10,'PHYSICAL',NULL,'2026-09-08 08:40:47',NULL,NULL,NULL,'drunk','townsfolk',1,47,60,0,1,1,0,0,'Idling in town'),
(100037,'Iron-Tooth Silas','🥊','A scarred tavern brawler with iron fillings in his teeth, always spoiling for a bare-knuckle clash.',1,8,10,1,'STATIONARY',3,NULL,85,50,10,10,10,10,11,10,'PHYSICAL',NULL,'2026-09-08 08:40:47',NULL,NULL,NULL,'brawler','townsfolk',1,78,85,0,1,1,0,0,'Idling in town'),
(100039,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:44:48',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100040,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:44:48',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100042,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:45:19',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100043,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:45:20',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100045,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:52:12',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100046,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 08:52:13',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100048,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 09:07:49',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100049,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 09:07:50',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100050,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 09:08:43',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100051,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-08 09:08:43',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100053,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 05:33:19',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100054,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 05:33:20',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100055,'Groggy Brant','🍺','A red-nosed tavern regular who sways on the cobblestones looking for anyone who spilled his drink.',1,6,12,1,'STATIONARY',3,NULL,60,50,10,10,10,10,8,10,'PHYSICAL',NULL,'2026-09-09 08:31:11',NULL,NULL,NULL,'drunk','townsfolk',1,43,60,0,1,1,0,0,'Idling in town'),
(100056,'Groggy Brant','🍺','A red-nosed tavern regular who sways on the cobblestones looking for anyone who spilled his drink.',1,6,11,1,'STATIONARY',3,NULL,60,50,10,10,10,10,8,10,'PHYSICAL',NULL,'2026-09-09 08:31:28',NULL,NULL,NULL,'drunk','townsfolk',1,56,60,0,1,1,0,0,'Idling in town'),
(100058,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 08:34:53',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100059,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 08:34:53',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100061,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 09:04:57',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100062,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 09:04:57',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100064,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 09:48:30',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100065,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 09:48:30',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100066,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 09:49:00',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100067,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 09:49:00',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100068,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 09:55:37',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100069,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 09:55:37',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100070,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 10:28:58',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100071,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 10:28:59',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100072,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 10:29:13',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town'),
(100073,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 10:29:14',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100075,'Abyssal Citadel Dreadlord','👤',NULL,103,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 10:37:19',NULL,NULL,NULL,'boss','dungeon_scourge',60,17000,17000,0,1,1,0,0,'Idling in town'),
(100076,'Citadel of the Lich King Dreadlord','👤',NULL,102,16,16,0,'STATIONARY',3,NULL,100,50,10,10,10,10,10,10,'PHYSICAL',NULL,'2026-09-09 10:37:19',NULL,NULL,NULL,'boss','dungeon_scourge',40,13000,13000,0,1,1,0,0,'Idling in town');
DROP TABLE IF EXISTS "game_objective_defs";
CREATE TABLE "game_objective_defs" (
  "key" varchar(80) NOT NULL,
  "name" varchar(120) NOT NULL,
  "description" text DEFAULT NULL,
  "icon" varchar(16) DEFAULT '?',
  "type" varchar(32) DEFAULT 'interact',
  "progress_model" varchar(16) DEFAULT 'boolean',
  "target_value" integer DEFAULT 1,
  "team_owned" smallint DEFAULT 0,
  "respawn_seconds" integer DEFAULT 0,
  "on_progress_json" text DEFAULT NULL,
  "on_complete_json" text DEFAULT NULL,
  "on_fail_json" text DEFAULT NULL,
  "settings_json" text DEFAULT NULL,
  "enabled" smallint DEFAULT 1,
  "updated_at" timestamp NOT NULL,
  PRIMARY KEY ("key")
);
INSERT INTO "game_objective_defs" VALUES
('capture_point','Capture Point','Stand in zone to capture. Contested if enemies present — progress pauses.','🚩','hold','timer',15,1,0,'{}','{"broadcast":"point_captured"}','{}','{"capture_radius":2,"contest_pauses":true,"uncaptured_regress_rate":1.0}',1,'2026-09-03 07:15:53'),
('collect_quest','Collection Objective','Collect N items or kill N enemies. Counter incremented by game events.','📦','collect','counter',5,0,0,'{"broadcast":"collect_progress"}','{"broadcast":"collect_complete"}','{}','{}',1,'2026-09-03 07:15:53'),
('crystal_vein','Crystal Vein','Rare crystal deposit. Slow but valuable.','💎','harvest','counter',200,0,0,'{}','{"broadcast":"resource_depleted"}','{}','{"depleted_respawn_seconds":300,"max_gatherers":2,"resource_type":"crystal","yield_per_tick":1}',1,'2026-09-03 07:15:53'),
('dbd_generator','Generator','Hold to repair — 30 seconds of continuous interaction. DBD-style.','⚡','hold','timer',30,0,0,'{"broadcast":"generator_progress"}','{"broadcast":"generator_complete","set_world_flag":"generator_online"}','{}','{"max_interactors":2,"regress_on_cancel":true,"regress_rate":0.5,"skill_check_interval":8,"skill_check_window":1.5}',1,'2026-09-03 07:15:53'),
('escort_npc','Escort','Escort NPC to destination. Fails if NPC dies. Counter = waypoints reached.','🚶','escort','counter',1,0,0,'{}','{"broadcast":"escort_complete"}','{"broadcast":"escort_failed"}','{"destination_x":0,"destination_y":0,"npc_id":null}',1,'2026-09-03 07:15:53'),
('gas_geyser','Vespene Geyser','Gas resource. Requires extractor building to harvest.','♨️','harvest','counter',1000,1,0,'{}','{}','{}','{"max_gatherers":3,"requires_building":"extractor","resource_type":"gas","yield_per_tick":4}',1,'2026-09-03 07:15:53'),
('gold_mine','Gold Mine','Mineable gold deposit. Workers gather gold into team pool.','💰','harvest','counter',500,0,0,'{}','{"broadcast":"resource_depleted"}','{}','{"depleted_respawn_seconds":120,"max_gatherers":3,"resource_type":"gold","yield_per_tick":5}',1,'2026-09-03 07:15:53'),
('lever','Lever','A lever that can be flipped on/off. Triggers on_complete each toggle.','🔧','toggle','boolean',1,0,0,'{}','{"set_world_flag":"lever_active","value":"toggle"}','{}','{"toggle_cooldown_seconds":2}',1,'2026-09-03 07:15:53'),
('lumber_patch','Lumber','Harvestable trees. Workers chop wood into team pool.','🪵','harvest','counter',300,0,0,'{}','{"broadcast":"resource_depleted"}','{}','{"depleted_respawn_seconds":180,"max_gatherers":2,"resource_type":"wood","yield_per_tick":3}',1,'2026-09-03 07:15:53'),
('moba_tower','Tower','Team-owned structure. Attacks nearby enemies. Falls when HP reaches 0.','🏰','destroy','hp',500,1,0,'{}','{"broadcast":"tower_destroyed","set_world_flag":"tower_down"}','{}','{"attack_damage":25,"attack_range":3,"attack_speed_ms":2000,"invulnerable_until_flag":"","target_priority":"closest_enemy"}',1,'2026-09-03 07:15:53'),
('pressure_plate','Pressure Plate','Activates when stepped on. Deactivates when left.','⬛','interact','boolean',1,0,0,'{}','{}','{}','{"auto_deactivate_on_leave":true}',1,'2026-09-03 07:15:53'),
('rts_building','Building','Build by holding interact. Once built, becomes functional. Destroyable.','🏗️','construct','timer',20,1,0,'{}','{"broadcast":"building_complete"}','{}','{"build_cost_gold":100,"constructed_hp":300,"constructed_icon":"🏠","constructed_type":"destroy"}',1,'2026-09-03 07:15:53'),
('survive_wave','Survive','Survive for N seconds. Auto-ticks while active. Fails if all players KO.','⏱️','survive','timer',60,0,0,'{}','{"broadcast":"survive_complete"}','{"broadcast":"survive_failed"}','{}',1,'2026-09-03 07:15:53'),
('td_waypoint','Waypoint','Tower defense path node. Enemies path toward this, players defend.','📍','reach','boolean',1,0,0,'{}','{}','{}','{"enemy_speed_mult":1.0,"next_waypoint_key":""}',1,'2026-09-03 07:15:53');
DROP TABLE IF EXISTS "game_objective_instances";
CREATE TABLE "game_objective_instances" (
  "id" integer NOT NULL,
  "objective_key" varchar(80) NOT NULL,
  "map_id" integer NOT NULL,
  "x" integer DEFAULT 0,
  "y" integer DEFAULT 0,
  "current_value" integer DEFAULT 0,
  "status" varchar(16) DEFAULT 'inactive',
  "team_id" integer DEFAULT NULL,
  "interacting_json" text DEFAULT NULL,
  "settings_json" text DEFAULT NULL,
  "started_at" timestamp DEFAULT NULL,
  "completed_at" timestamp DEFAULT NULL,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_ogham_families";
CREATE TABLE "game_ogham_families" (
  "id" integer  NOT NULL,
  "name" varchar(64) NOT NULL,
  "icon" varchar(8) DEFAULT '?',
  "description" text DEFAULT NULL,
  "set_bonus_json" text   DEFAULT NULL ,
  PRIMARY KEY ("id")
);
INSERT INTO "game_ogham_families" VALUES
(1,'The Void Court','🖤','Ancient runes carved by those who bargained with the Otherworld''s darkest court.','{"element_attack":"dark","label":"Void Pact: +20 MO, Dark Element","min_count":2,"stat_bonus":{"mo":20}}'),
(2,'The Storm Circle','⚡','Oghams forged during the great storm that split Tír na nÓg in two.','{"label":"Storm Blessed: +15 SPD, +10 LCK, 15% Stun","min_count":2,"on_hit_chance":15,"on_hit_status":"Stun","stat_bonus":{"luck":10,"speed":15}}'),
(3,'The Frozen Burial','❄️','Inscriptions found on those who died in the northern wastes and did not stay dead.','{"element_attack":"ice","label":"Ice Shroud: +20 DEF, +15 MD, Ice Element","min_count":2,"stat_bonus":{"def":20,"md":15}}'),
(4,'The Sylvan Canopy','🌿','Verdant woodcarvings holding primal life essence.','{"label":"Verdant Surge: +15 STR, +100 HP, 25% Bleed","min_count":2,"on_hit_chance":25,"on_hit_status":"Bleed","stat_bonus":{"max_hp":100,"str":15}}');
DROP TABLE IF EXISTS "game_oghams";
CREATE TABLE "game_oghams" (
  "id" integer NOT NULL,
  "name" varchar(64) NOT NULL,
  "icon" varchar(8) DEFAULT '?',
  "description" text DEFAULT NULL,
  "lore_text" text DEFAULT NULL,
  "rank" integer NOT NULL DEFAULT 1,
  "element_attack" varchar(64) DEFAULT NULL,
  "family_id" integer DEFAULT NULL,
  "curse_json" text   DEFAULT NULL ,
  "on_hit_status" varchar(64) DEFAULT NULL,
  "on_hit_chance" integer DEFAULT 20,
  "stat_bonus_json" text   DEFAULT NULL ,
  "kills_to_rank_up" integer DEFAULT 50,
  PRIMARY KEY ("id")
);
INSERT INTO "game_oghams" VALUES
(49,'Beith','ᚁ','Birch — beginnings and purification.','Birch — beginnings and purification.',1,'earth',4,NULL,'Bleed',20,'{"max_hp":30,"str":5}',30),
(50,'Luis','ᚂ','Rowan — ward against curses and foul hexes.','Rowan — ward against curses and foul hexes.',1,'fire',2,NULL,'Burn',25,'{"mo":8}',30),
(51,'Fearn','ᚃ','Alder — guidance through liminal waters.','Alder — guidance through liminal waters.',1,'water',3,NULL,'Slow',20,'{"def":6,"md":6}',30),
(52,'Sail','ᚄ','Willow — moonlight craft and dreaming mind.','Willow — moonlight craft and dreaming mind.',1,'water',3,NULL,NULL,0,'{"luck":8,"mp":20}',30),
(53,'Nion','ᚅ','Ash — world-tree linking the nine realms.','Ash — world-tree linking the nine realms.',2,'air',2,NULL,'Stun',15,'{"speed":10}',60),
(54,'Dair','ᚇ','Oak — kingship and oaths sworn in blood.','Oak — kingship and oaths sworn in blood.',2,'earth',4,NULL,NULL,0,'{"def":8,"str":12}',60),
(55,'Tinne','ᚈ','Holly — winter''s sacrificial flame.','Holly — winter''s sacrificial flame.',2,'fire',2,NULL,'Burn',30,'{"mo":10,"str":8}',60),
(56,'Coll','ᚉ','Hazel — deep currents of intuition.','Hazel — deep currents of intuition.',2,'water',3,NULL,'Chill',25,'{"mo":14}',60),
(57,'Fuilteach','🩸','Bloody — rune of weeping wounds.','Bloody — rune of weeping wounds.',3,'blood',1,NULL,'Bleed',35,'{"mo":15,"str":18}',100),
(58,'Dorchadas','🌑','Blackened — where the twilight sun dies.','Blackened — where the twilight sun dies.',3,'dark',1,NULL,'Blind',30,'{"md":12,"mo":22}',100),
(59,'Bás','💀','Death — the final letter spoken in silence.','Death — the final letter spoken in silence.',3,'dark',1,NULL,'Curse',25,'{"luck":15,"str":25}',150);
DROP TABLE IF EXISTS "game_party_modes";
CREATE TABLE "game_party_modes" (
  "id" integer NOT NULL,
  "key" varchar(64) NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text DEFAULT NULL,
  "min_players" integer DEFAULT 3,
  "max_players" integer DEFAULT 20,
  "rounds" integer DEFAULT 10,
  "has_judge" smallint DEFAULT 0,
  "submissions_per_player" integer DEFAULT 1,
  "voting_type" varchar(32) DEFAULT 'majority',
  "hand_size" integer DEFAULT 0,
  "uses_deck" smallint DEFAULT 0,
  "audience_can_vote" smallint DEFAULT 1,
  "audience_vote_weight" float DEFAULT 0.5,
  "phase_timers_json" text DEFAULT NULL,
  "rules_json" text DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("key")
);
INSERT INTO "game_party_modes" VALUES
(1,'cah','Cards Against Humanity','Judge draws a prompt, players submit answers from their hand, judge picks the winner. The most hilariously wrong answer wins.',3,20,10,1,1,'judge',7,1,1,0.5,'{"prompt":10,"reveal":15,"score":10,"submit":60,"vote":30}','{"draw_after_play":true,"judge_rotates":true}'),
(2,'quiplash','Quiplash / Battle Taunts','Everyone gets a prompt and writes their own answer. Everyone votes on the best one. No cards — pure wit.',3,16,8,0,1,'majority',0,0,1,0.5,'{"prompt":5,"reveal":10,"score":10,"submit":90,"vote":30}','{"quiplash_bonus":true,"unanimous_bonus":100}'),
(3,'fibbage','Fibbage / Lore Lies','One truth mixed with player-written lies. Guess which answer is real. Fool others for bonus points.',3,16,8,0,1,'majority',0,0,0,0,'{"prompt":5,"reveal":10,"score":10,"submit":90,"vote":45}','{"correct_guess":100,"fool_bonus":50,"truth_mixed_in":true}'),
(4,'trivia','Trivia','Multiple choice or free text trivia. Points for correct answers, bonus for speed.',2,50,15,0,1,'majority',0,0,0,0,'{"prompt":5,"reveal":5,"score":5,"submit":20,"vote":0}','{"max_speed_bonus":200,"speed_bonus":true,"speed_multiplier":10}'),
(5,'fill_blank','Fill in the Blank','Like Cards Against Humanity but free-text — no cards, write whatever you want.',3,20,10,1,1,'judge',0,0,1,0.5,'{"prompt":10,"reveal":15,"score":10,"submit":60,"vote":30}','{"judge_rotates":true}'),
(6,'caption','Caption This','An image or emoji scene is shown. Write the funniest caption. Everyone votes.',3,20,8,0,1,'majority',0,0,1,0.5,'{"prompt":5,"reveal":10,"score":10,"submit":60,"vote":30}','{"show_emoji":true}'),
(7,'word_association','Word Association','Given a word, everyone writes an association. The most common answer wins.',3,30,10,0,1,'majority',0,0,0,0,'{"prompt":5,"reveal":5,"score":5,"submit":15,"vote":0}','{"match_points":100,"match_scoring":true,"unique_penalty":0}'),
(8,'ranking','Ranking','Rank items from a list. Points for matching the group consensus.',3,30,8,0,1,'ranked',0,0,0,0,'{"prompt":5,"reveal":10,"score":10,"submit":30,"vote":0}','{"consensus_scoring":true,"exact_match_bonus":50}'),
(9,'two_truths','Two Truths and a Lie','Each player writes 2 truths and 1 lie about themselves. Others guess which is the lie.',3,16,0,0,3,'majority',0,0,1,0.5,'{"prompt":5,"reveal":15,"score":10,"submit":120,"vote":45}','{"fool_bonus":50,"guess_the_lie":true,"rounds_equal_players":true}'),
(10,'debate','Debate','Two players debate a silly topic. The audience votes on who wins. Comedy over logic.',4,20,5,0,1,'majority',0,0,1,1,'{"prompt":5,"reveal":30,"score":10,"submit":120,"vote":30}','{"audience_is_judge":true,"debaters_per_round":2}');
DROP TABLE IF EXISTS "game_party_players";
CREATE TABLE "game_party_players" (
  "id" integer NOT NULL,
  "room_id" integer NOT NULL,
  "player_id" integer NOT NULL,
  "name" varchar(128) NOT NULL,
  "score" integer DEFAULT 0,
  "is_spectator" smallint DEFAULT 0,
  "joined_at" timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_party_rooms";
CREATE TABLE "game_party_rooms" (
  "id" integer NOT NULL,
  "code" varchar(8) NOT NULL,
  "host_id" integer NOT NULL,
  "game_mode" varchar(64) NOT NULL,
  "settings_json" text DEFAULT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'waiting',
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("code")
);
DROP TABLE IF EXISTS "game_party_state";
CREATE TABLE "game_party_state" (
  "id" integer NOT NULL,
  "room_id" integer NOT NULL,
  "round" integer DEFAULT 1,
  "phase" varchar(32) DEFAULT 'waiting',
  "prompt_json" text DEFAULT NULL,
  "submissions_json" text DEFAULT NULL,
  "votes_json" text DEFAULT NULL,
  "judge_id" integer DEFAULT NULL,
  "timer_end_at" timestamp DEFAULT NULL,
  "revealed_indices_json" text DEFAULT NULL,
  "deck_state_json" text DEFAULT NULL,
  "hands_json" text DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("room_id")
);
DROP TABLE IF EXISTS "game_physical_shelves";
CREATE TABLE "game_physical_shelves" (
  "id" integer NOT NULL,
  "shop_id" integer NOT NULL,
  "map_id" integer NOT NULL,
  "shelf_name" varchar(64) NOT NULL,
  "icon" varchar(16) NOT NULL DEFAULT '?',
  "shelf_type" varchar(32) NOT NULL DEFAULT 'weapons',
  "x" integer NOT NULL DEFAULT 4,
  "y" integer NOT NULL DEFAULT 4,
  "items_json" text DEFAULT NULL,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_player_armies";
CREATE TABLE "game_player_armies" (
  "id" integer NOT NULL,
  "char_id" integer NOT NULL,
  "unit_key" varchar(80) NOT NULL,
  "count" integer DEFAULT 0,
  "training" integer DEFAULT 0,
  "training_finish_at" timestamp DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("char_id","unit_key")
);
DROP TABLE IF EXISTS "game_player_buildings";
CREATE TABLE "game_player_buildings" (
  "id" integer NOT NULL,
  "char_id" integer NOT NULL,
  "building_key" varchar(80) NOT NULL,
  "level" integer DEFAULT 1,
  "upgrading" smallint DEFAULT 0,
  "upgrade_finish_at" timestamp DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("char_id","building_key")
);
DROP TABLE IF EXISTS "game_player_resources";
CREATE TABLE "game_player_resources" (
  "char_id" integer NOT NULL,
  "resource_type" varchar(32) NOT NULL,
  "amount" bigint DEFAULT 0,
  "last_tick_at" timestamp DEFAULT NULL,
  PRIMARY KEY ("char_id","resource_type")
);
DROP TABLE IF EXISTS "game_player_shopping_baskets";
CREATE TABLE "game_player_shopping_baskets" (
  "id" integer NOT NULL,
  "char_id" integer NOT NULL,
  "shop_id" integer NOT NULL,
  "items_json" text DEFAULT NULL,
  "total_price" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("char_id","shop_id")
);
DROP TABLE IF EXISTS "game_properties";
CREATE TABLE "game_properties" (
  "id" integer NOT NULL,
  "building_id" integer NOT NULL,
  "map_id" integer NOT NULL,
  "name" varchar(128) NOT NULL,
  "price_gold" integer NOT NULL DEFAULT 200,
  "owner_char_id" integer DEFAULT NULL,
  "owner_name" varchar(64) DEFAULT NULL,
  "is_for_sale" smallint NOT NULL DEFAULT 1,
  "fortifications_json" text DEFAULT NULL,
  "curtains_drawn" smallint NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stash_gold" integer NOT NULL DEFAULT 0,
  "guard_companion_id" integer DEFAULT NULL,
  "guard_companion_name" varchar(64) DEFAULT NULL,
  PRIMARY KEY ("id")
);
INSERT INTO "game_properties" VALUES
(1421,1,1,'Prancing Mare Loft Room',150,NULL,NULL,1,'["velvet_soundproof_curtains"]',0,'2026-09-09 10:37:21',0,NULL,NULL),
(1422,3,1,'Sanctuary Wayfarer Cottage',350,NULL,NULL,1,'[]',0,'2026-09-09 10:37:21',0,NULL,NULL);
DROP TABLE IF EXISTS "game_property_stashes";
CREATE TABLE "game_property_stashes" (
  "id" integer NOT NULL,
  "property_id" integer NOT NULL,
  "char_id" integer NOT NULL,
  "item_key" varchar(64) NOT NULL,
  "item_name" varchar(128) NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "item_meta_json" text DEFAULT NULL,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_property_trophies";
CREATE TABLE "game_property_trophies" (
  "id" integer NOT NULL,
  "property_id" integer NOT NULL,
  "char_id" integer NOT NULL,
  "trophy_key" varchar(64) NOT NULL,
  "name" varchar(128) NOT NULL,
  "icon" varchar(16) NOT NULL DEFAULT '?',
  "buff_type" varchar(64) NOT NULL,
  "buff_value" integer NOT NULL DEFAULT 10,
  "description" text DEFAULT NULL,
  "mounted_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_quest_defs";
CREATE TABLE "game_quest_defs" (
  "id" bigint  NOT NULL,
  "key" varchar(100) NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text DEFAULT NULL,
  "icon" varchar(255) DEFAULT NULL,
  "level_required" integer NOT NULL DEFAULT 0,
  "repeatable" smallint NOT NULL DEFAULT 0,
  "enabled" smallint NOT NULL DEFAULT 1,
  "stages_json" text NOT NULL,
  "rewards_json" text NOT NULL,
  "prerequisites_json" text NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("key")
);
DROP TABLE IF EXISTS "game_quest_progress";
CREATE TABLE "game_quest_progress" (
  "char_id" integer NOT NULL,
  "quest_id" integer NOT NULL,
  "step" integer NOT NULL DEFAULT 0,
  "completed" smallint NOT NULL DEFAULT 0,
  "started_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  PRIMARY KEY ("char_id","quest_id")
);
DROP TABLE IF EXISTS "game_quests";
CREATE TABLE "game_quests" (
  "id" integer NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text DEFAULT NULL,
  "quest_type" varchar(64) DEFAULT 'side',
  "level_req" integer DEFAULT 1,
  "min_level" integer DEFAULT 1,
  "is_repeatable" smallint DEFAULT 0,
  "cooldown_hours" integer DEFAULT 0,
  "max_completions" integer DEFAULT 1,
  "is_active" smallint DEFAULT 1,
  "objectives_json" text DEFAULT NULL,
  "stages_json" text DEFAULT NULL,
  "reward_xp" integer DEFAULT 0,
  "reward_gold" integer DEFAULT 0,
  "rewards_json" text DEFAULT NULL,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_races";
CREATE TABLE "game_races" (
  "id" integer  NOT NULL,
  "name" varchar(64) NOT NULL,
  "description" text DEFAULT NULL,
  "icon" varchar(8) DEFAULT '?',
  "bonus_hp" integer NOT NULL DEFAULT 0,
  "bonus_mp" integer NOT NULL DEFAULT 0,
  "bonus_atk" integer NOT NULL DEFAULT 0,
  "bonus_def" integer NOT NULL DEFAULT 0,
  "bonus_mo" integer NOT NULL DEFAULT 0,
  "bonus_md" integer NOT NULL DEFAULT 0,
  "bonus_speed" integer NOT NULL DEFAULT 0,
  "bonus_luck" integer NOT NULL DEFAULT 0,
  "hidden" smallint NOT NULL DEFAULT 0,
  PRIMARY KEY ("id")
);
INSERT INTO "game_races" VALUES
(1,'Human','Versatile and resilient survivors of the Shattered Realms.','👤',20,10,2,2,2,2,2,2,0),
(2,'High Elf','Ancient arcane scions steeped in centuries of sorcerous discipline.','🧝',0,35,0,0,6,4,2,1,0),
(3,'Shadowkin Elf','Exiled to the subterranean gloom, masters of stealth and darkvision.','🕷️',5,20,2,1,3,2,5,3,0),
(4,'Mountain Dwarf','Hardy stoneworkers forged by subterranean bellows and cold iron.','🧔',35,0,3,6,0,3,-1,1,0),
(5,'Ironforged Deep Dwarf','Grim denizens of magma forges with obsidian-dense skin.','⛏️',25,10,3,5,1,4,-1,0,0),
(6,'Fiendblood (Hellforged)','Carrying the burning embers of infernal ancestry in their veins.','😈',10,25,2,1,5,3,1,1,0),
(7,'Draconian (Dragonkin)','Proud scaled warriors bearing the fiery breath of primeval drakes.','🐉',30,10,5,4,2,2,0,0,0),
(8,'Half-Orc','Fierce frontier warriors possessing unstoppable savage tenacity.','🐗',30,0,6,3,0,0,2,1,0),
(9,'Voidstrider (Astral)','Star-sailors attuned to the void between shattered dimensional planes.','⚔️',10,20,3,1,4,3,3,1,0),
(10,'Dawnforged (Celestial)','Touched by high solar aether, radiating restorative grace and light.','✨',15,25,1,2,3,6,1,2,0),
(11,'Gnome (Deep Tinker)','Ingenious subterranean artisans and arcane mechanism crafters.','⚙️',5,20,0,2,4,4,1,5,0),
(12,'Halfling (Shadowfoot)','Quick-footed wanderers blessed with impossible luck and nimbleness.','🍀',10,10,1,1,1,2,5,7,0),
(13,'Forgeborn (Automaton)','Brass, stone, and clockwork awakened by an elemental furnace core.','🤖',40,0,3,8,0,2,-2,0,0),
(14,'Sylvankin (Rootweaver)','Flora-infused guardians whose flesh is ironwood bark and bloom.','🌿',20,30,1,3,5,4,0,2,0),
(15,'Murkfin (Abyssal)','Bioluminescent amphibious dwellers of deep twilight ocean trenches.','🧜',15,20,2,2,4,3,4,2,0),
(16,'Aviad (Windstrider)','Keen-eyed feathered nomads commanding thermal drafts from high aeries.','🦅',10,15,3,1,2,2,7,3,0),
(17,'Myrmidon (Chitin-Kin)','Carapace-plated insectoid nomads of supreme collective martial focus.','🦂',25,10,4,6,0,1,3,0,0),
(18,'Revenant (Graveborn)','Willpower-fueled spirit re-anchored in mortal frame, defying the grave.','💀',35,10,4,4,1,2,0,-1,0),
(19,'Gloomkin (Shadow Fey)','Ethereal penumbral spirits born from the mist dividing life and death.','🌫️',5,25,1,1,5,4,5,4,0),
(20,'Solaris (Sunstrider)','Golden-skinned desert nomad infused with living celestial solar flare.','☀️',20,25,3,2,5,3,2,2,0);
DROP TABLE IF EXISTS "game_rules";
CREATE TABLE "game_rules" (
  "id" integer NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text DEFAULT NULL,
  "trigger_event" varchar(64) DEFAULT 'on_turn_start',
  "condition_json" text DEFAULT NULL,
  "effect_json" text DEFAULT NULL,
  "is_active" smallint DEFAULT 1,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_ruleset_modifiers";
CREATE TABLE "game_ruleset_modifiers" (
  "id" integer  NOT NULL,
  "ruleset_id" integer  NOT NULL,
  "target_type" varchar(64) NOT NULL DEFAULT 'race',
  "target_name" varchar(64) NOT NULL,
  "action_type" varchar(32) DEFAULT NULL,
  "stat_key" varchar(32) DEFAULT NULL,
  "multiplier" decimal(6,3) DEFAULT 1.000,
  "flat_bonus" integer DEFAULT 0,
  "extra_uses" integer DEFAULT 0,
  "tiles_per_move_override" integer DEFAULT NULL,
  "custom_json" text   DEFAULT NULL ,
  "is_active" smallint NOT NULL DEFAULT 1,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_safehouse_alembic";
CREATE TABLE "game_safehouse_alembic" (
  "id" integer NOT NULL,
  "property_id" integer NOT NULL,
  "recipe_key" varchar(64) NOT NULL,
  "concoction_name" varchar(128) NOT NULL,
  "icon" varchar(16) DEFAULT '?',
  "quantity" integer NOT NULL DEFAULT 1,
  "brew_seconds" integer NOT NULL DEFAULT 30,
  "started_at" timestamp NOT NULL,
  "finishes_at" timestamp NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'brewing',
  PRIMARY KEY ("id")
);
INSERT INTO "game_safehouse_alembic" VALUES
(1,992,'valyrian_elixir','Valyrian Restorative Elixir','🧪',1,20,'2026-09-09 10:28:51','2026-09-09 10:29:11','brewing'),
(2,992,'valyrian_elixir','Valyrian Restorative Elixir','🧪',1,20,'2026-09-09 10:28:57','2026-09-09 10:29:17','brewing'),
(3,992,'valyrian_elixir','Valyrian Restorative Elixir','🧪',1,20,'2026-09-09 10:29:12','2026-09-09 10:29:32','brewing'),
(4,992,'valyrian_elixir','Valyrian Restorative Elixir','🧪',1,20,'2026-09-09 10:37:17','2026-09-09 10:37:37','brewing');
DROP TABLE IF EXISTS "game_safehouse_dispatches";
CREATE TABLE "game_safehouse_dispatches" (
  "id" integer NOT NULL,
  "property_id" integer NOT NULL,
  "companion_id" integer NOT NULL,
  "companion_name" varchar(128) NOT NULL,
  "mission_type" varchar(64) NOT NULL,
  "mission_name" varchar(128) NOT NULL,
  "icon" varchar(16) DEFAULT '?',
  "duration_seconds" integer NOT NULL DEFAULT 30,
  "started_at" timestamp NOT NULL,
  "finishes_at" timestamp NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'active',
  "reward_gold" integer NOT NULL DEFAULT 0,
  "reward_xp" integer NOT NULL DEFAULT 0,
  "reward_item_name" varchar(128) DEFAULT NULL,
  "reward_item_key" varchar(64) DEFAULT NULL,
  PRIMARY KEY ("id")
);
INSERT INTO "game_safehouse_dispatches" VALUES
(1,993,42,'Valeria the Shieldmaiden','contraband_heist','Magistrate Cargo Interception','💼',45,'2026-09-09 10:28:52','2026-09-09 10:29:37','active',180,250,'Forged City Seal','forged_city_seal'),
(2,993,42,'Valeria the Shieldmaiden','contraband_heist','Magistrate Cargo Interception','💼',45,'2026-09-09 10:28:56','2026-09-09 10:29:41','active',180,250,'Forged City Seal','forged_city_seal'),
(3,993,42,'Valeria the Shieldmaiden','contraband_heist','Magistrate Cargo Interception','💼',45,'2026-09-09 10:29:12','2026-09-09 10:29:57','active',180,250,'Forged City Seal','forged_city_seal'),
(4,993,42,'Valeria the Shieldmaiden','contraband_heist','Magistrate Cargo Interception','💼',45,'2026-09-09 10:37:17','2026-09-09 10:38:02','active',180,250,'Forged City Seal','forged_city_seal');
DROP TABLE IF EXISTS "game_safehouse_runes";
CREATE TABLE "game_safehouse_runes" (
  "id" integer NOT NULL,
  "property_id" integer NOT NULL,
  "item_id" varchar(64) NOT NULL,
  "item_name" varchar(128) NOT NULL,
  "rune_key" varchar(64) NOT NULL,
  "rune_name" varchar(128) NOT NULL,
  "rune_icon" varchar(16) DEFAULT '✨',
  "bonus_stat" varchar(64) NOT NULL,
  "bonus_value" integer NOT NULL DEFAULT 0,
  "socket_slot" varchar(32) NOT NULL DEFAULT 'primary',
  "created_at" timestamp NOT NULL,
  PRIMARY KEY ("id")
);
INSERT INTO "game_safehouse_runes" VALUES
(5,991,'ebon_blade','Ebon Glass Blade','colossus_skull_rune','Rune of the Granite Colossus','💀','parry_window_ms',50,'primary','2026-09-09 10:37:17');
DROP TABLE IF EXISTS "game_scheduled_tasks";
CREATE TABLE "game_scheduled_tasks" (
  "id" integer NOT NULL,
  "name" varchar(128) NOT NULL,
  "task_type" varchar(64) NOT NULL DEFAULT 'SYSTEM',
  "schedule_cron" varchar(64) DEFAULT NULL,
  "is_enabled" smallint NOT NULL DEFAULT 1,
  "last_run_at" timestamp DEFAULT NULL,
  "next_run_at" timestamp DEFAULT NULL,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_skills";
CREATE TABLE "game_skills" (
  "id" integer  NOT NULL,
  "name" varchar(64) NOT NULL,
  "description" text DEFAULT NULL,
  "battle_text" varchar(255) DEFAULT NULL,
  "type" varchar(64) NOT NULL DEFAULT 'magic',
  "target_type" varchar(32) NOT NULL DEFAULT 'ENEMY',
  "elements" text   DEFAULT NULL ,
  "heal_status" text   DEFAULT NULL ,
  "icon" varchar(8) DEFAULT '✨',
  "effects" text   DEFAULT NULL ,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_social_deduction_roles";
CREATE TABLE "game_social_deduction_roles" (
  "key" varchar(80) NOT NULL,
  "name" varchar(120) NOT NULL,
  "team" varchar(20) NOT NULL DEFAULT 'crew',
  "abilities_json" text DEFAULT NULL,
  "vision_radius" integer DEFAULT 5,
  "description" text DEFAULT NULL,
  "enabled" smallint DEFAULT 1,
  "updated_at" timestamp NOT NULL,
  PRIMARY KEY ("key")
);
INSERT INTO "game_social_deduction_roles" VALUES
('crewmate','Crewmate','crew','[]',5,'Complete tasks to win. Vote out impostors.',1,'2026-09-05 08:01:04'),
('detective','Detective','crew','["investigate"]',6,'Can investigate one player per round to learn their team alignment.',1,'2026-09-05 08:01:04'),
('engineer','Engineer','crew','["vent","fix_fast"]',5,'Can use vents (crew-side) and repairs sabotages faster.',1,'2026-09-05 08:01:04'),
('guardian','Guardian','crew','["shield"]',5,'Has a one-time shield that blocks a kill attempt on the targeted player.',1,'2026-09-05 08:01:04'),
('impostor','Impostor','impostor','["kill","vent","sabotage"]',7,'Eliminate crewmates without getting caught. Can use vents.',1,'2026-09-05 08:01:04'),
('jester','Jester','neutral','[]',4,'Wins if ejected by vote. No other win condition.',1,'2026-09-05 08:01:04'),
('medic','Medic','crew','["heal"]',5,'Can protect one player per round from being killed.',1,'2026-09-05 08:01:04'),
('shapeshifter','Shapeshifter','impostor','["kill","vent","disguise"]',7,'Can disguise as another player. Impostor team.',1,'2026-09-05 08:01:04');
DROP TABLE IF EXISTS "game_spawns";
CREATE TABLE "game_spawns" (
  "id" integer NOT NULL,
  "map_id" integer NOT NULL,
  "npc_id" integer NOT NULL,
  "x" integer NOT NULL,
  "y" integer NOT NULL,
  "spawn_count" integer DEFAULT 1,
  "respawn_seconds" integer DEFAULT 60,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_spells";
CREATE TABLE "game_spells" (
  "id" integer NOT NULL,
  "key" varchar(64) NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text DEFAULT NULL,
  "icon" varchar(8) DEFAULT '✨',
  "ogham_pattern_json" text NOT NULL,
  "anam_cost" integer NOT NULL DEFAULT 10,
  "cast_time_ms" integer NOT NULL DEFAULT 1000,
  "cooldown_ms" integer NOT NULL DEFAULT 0,
  "effect_json" text NOT NULL,
  "spell_school" varchar(32) DEFAULT 'arcane',
  "min_level" integer NOT NULL DEFAULT 1,
  "is_combat_spell" smallint NOT NULL DEFAULT 1,
  "is_utility_spell" smallint NOT NULL DEFAULT 0,
  "is_active" smallint NOT NULL DEFAULT 1,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("key")
);
DROP TABLE IF EXISTS "game_stat_definitions";
CREATE TABLE "game_stat_definitions" (
  "key_name" varchar(64) NOT NULL,
  "name" varchar(64) NOT NULL,
  "description" text DEFAULT NULL,
  "default_value" integer NOT NULL DEFAULT 0,
  "min_value" integer NOT NULL DEFAULT 0,
  "max_value" integer NOT NULL DEFAULT 9999,
  "icon" varchar(8) DEFAULT '?',
  PRIMARY KEY ("key_name")
);
DROP TABLE IF EXISTS "game_statuses";
CREATE TABLE "game_statuses" (
  "id" integer  NOT NULL,
  "name" varchar(64) NOT NULL,
  "description" text DEFAULT NULL,
  "icon" varchar(8) DEFAULT '⚡',
  "type" varchar(64) NOT NULL DEFAULT 'debuff',
  "default_duration" integer NOT NULL DEFAULT 3,
  "permanent" smallint NOT NULL DEFAULT 0,
  "effects" text   DEFAULT NULL ,
  "disabled_commands" text   DEFAULT NULL ,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_strategy_buildings";
CREATE TABLE "game_strategy_buildings" (
  "key" varchar(80) NOT NULL,
  "name" varchar(120) NOT NULL,
  "icon" varchar(16) DEFAULT '?',
  "description" text DEFAULT NULL,
  "base_yield_json" text DEFAULT NULL,
  "cost_base_json" text DEFAULT NULL,
  "cost_mult_per_level" float DEFAULT 1.5,
  "build_time_base_seconds" integer DEFAULT 60,
  "build_time_mult" float DEFAULT 1.3,
  "max_level" integer DEFAULT 20,
  "requires_json" text DEFAULT NULL,
  "enabled" smallint DEFAULT 1,
  "updated_at" timestamp NOT NULL,
  PRIMARY KEY ("key")
);
INSERT INTO "game_strategy_buildings" VALUES
('barracks','Barracks','🏛️','Unlocks + speeds up troop training. No direct yield.','{}','{"gold":100,"stone":50}',1.6,90,1.4,10,NULL,1,'2026-09-03 07:15:53'),
('farm','Farm','🌾','Produces food per level.','{"food":10}','{"gold":50}',1.4,30,1.2,20,NULL,1,'2026-09-03 07:15:53'),
('gold_mine','Gold Mine','💰','Produces gold per level.','{"gold":8}','{"food":30,"wood":20}',1.5,45,1.3,20,NULL,1,'2026-09-03 07:15:53'),
('lumber_mill','Lumber Mill','🪵','Produces wood per level.','{"wood":6}','{"gold":40}',1.4,40,1.25,20,NULL,1,'2026-09-03 07:15:53'),
('quarry','Quarry','🪨','Produces stone per level.','{"stone":5}','{"gold":60,"wood":30}',1.5,60,1.3,15,NULL,1,'2026-09-03 07:15:53'),
('wall','Wall','🧱','Increases defense bonus per level. No yield.','{}','{"stone":80,"wood":40}',1.5,120,1.5,15,NULL,1,'2026-09-03 07:15:53');
DROP TABLE IF EXISTS "game_strategy_units";
CREATE TABLE "game_strategy_units" (
  "key" varchar(80) NOT NULL,
  "name" varchar(120) NOT NULL,
  "icon" varchar(16) DEFAULT '⚔️',
  "description" text DEFAULT NULL,
  "attack" integer DEFAULT 10,
  "defense" integer DEFAULT 5,
  "hp" integer DEFAULT 100,
  "speed" integer DEFAULT 10,
  "food_upkeep" integer DEFAULT 1,
  "train_cost_json" text DEFAULT NULL,
  "train_time_seconds" integer DEFAULT 30,
  "requires_json" text DEFAULT NULL,
  "enabled" smallint DEFAULT 1,
  "updated_at" timestamp NOT NULL,
  PRIMARY KEY ("key")
);
INSERT INTO "game_strategy_units" VALUES
('archer','Archer','🏹',NULL,18,5,80,12,1,'{"gold":40,"wood":15}',25,NULL,1,'2026-09-03 07:15:53'),
('catapult','Catapult','💣',NULL,50,3,200,3,3,'{"gold":200,"stone":50,"wood":100}',120,NULL,1,'2026-09-03 07:15:53'),
('cavalry','Cavalry','🐴',NULL,25,12,150,20,4,'{"food":30,"gold":100}',60,NULL,1,'2026-09-03 07:15:53'),
('militia','Militia','🗡️',NULL,8,4,80,10,1,'{"gold":20}',15,NULL,1,'2026-09-03 07:15:53'),
('soldier','Soldier','⚔️',NULL,15,10,120,8,2,'{"gold":50,"iron":10}',30,NULL,1,'2026-09-03 07:15:53'),
('spy','Spy','🕵️',NULL,5,2,40,25,1,'{"gold":75}',45,NULL,1,'2026-09-03 07:15:53');
DROP TABLE IF EXISTS "game_subclasses";
CREATE TABLE "game_subclasses" (
  "id" integer  NOT NULL,
  "class_id" integer  NOT NULL,
  "name" varchar(64) NOT NULL,
  "archetype_title" varchar(64) NOT NULL,
  "description" text NOT NULL,
  "level_req" integer NOT NULL DEFAULT 3,
  "icon" varchar(32) NOT NULL DEFAULT '⚡',
  "passive_name" varchar(64) NOT NULL,
  "passive_desc" text NOT NULL,
  "signature_ability" varchar(64) NOT NULL,
  "stat_bonuses" text   DEFAULT NULL ,
  PRIMARY KEY ("id")
);
INSERT INTO "game_subclasses" VALUES
(1,1,'Berserker','Frenzy Reaver','Channels raw battle wrath into unstoppable cleaves, sacrificing defense for relentless slaughter.',3,'🪓','Blood Frenzy','Attack power increases by up to 35% as health drops below maximum.','Whirlwind Cleave','{"atk": 4, "hp": 20, "speed": 1}'),
(2,1,'Dreadnought','Iron Bulwark','Living fortress clad in impenetrable plate, holding the frontline against impossible odds.',3,'🛡️','Iron Bastion','Shield blocks absorb 30% additional damage and grant physical stun immunity.','Shield Fortress','{"def": 5, "hp": 30, "md": 2}'),
(3,1,'Weaponmaster','Blade Savant','Master of every martial weapon, executing lightning parries, disarms, and surgical counter-strikes.',3,'⚔️','Master of Arms','Critical strikes refund stamina and grant immediate bonus attacks.','Bladestorm','{"atk": 3, "speed": 3, "luck": 2}'),
(4,1,'Warlord','Battle Tactician','Commanding general whose tactical war cries bolster allies and break enemy battle lines.',3,'🚩','Tactical Command','All party members within 4 tiles gain +15% attack and +10% critical rate.','Rallying Battle Cry','{"hp": 20, "def": 2, "mo": 2, "luck": 2}'),
(5,2,'Oath of Retribution','Avenging Justiciar','Channels holy wrath to punish villains, returning damage taken with righteous fury.',3,'⚡','Vengeance Aura','Reflects 20% of all incoming melee damage as holy solar fire.','Wrathful Smite','{"atk": 3, "mo": 3, "hp": 15}'),
(6,2,'Oath of the Aegis','Guardian Sentinel','Vows to stand between darkness and the innocent, taking wounds meant for allies.',3,'🛡️','Guardian Bulwark','Automatically intercepts 50% damage dealt to the lowest-health ally.','Bastion of Light','{"def": 4, "hp": 25, "md": 3}'),
(7,2,'Oath of Redemption','Merciful Dawn','Brings salvation, peaceful warding, and immense restorative miracles to dying comrades.',3,'🕊️','Merciful Radiance','Healing spells grant the recipient a 3-turn protective radiant shield.','Lay on Hands (Ascended)','{"mo": 4, "md": 3, "mp": 25}'),
(8,2,'Oath of the Eclipse','Twilight Crusader','Bends radiant holy and dark umbral energies, punishing oppressors from the shadows.',3,'🌑','Twilight Shroud','Attacks deal hybrid holy and shadow damage, siphoning 10% damage as MP.','Eclipse Slash','{"atk": 2, "mo": 2, "speed": 2, "luck": 2}'),
(9,3,'Juggernaut','Unstoppable Force','Brutal colossus that charges through enemy phalanxes, shattering shields and bone.',3,'🪨','Unstoppable Momentum','Completely immune to knockback, slow, and stun effects while raging.','Earthshaker Slam','{"hp": 35, "atk": 3, "def": 2}'),
(10,3,'Totemic Shaman','Spirit Conduit','Channels the ancient spirit guides of the Cave Bear, Eagle, and Dire Wolf.',3,'🐻','Spirit of the Bear','Gains +25% maximum HP and regenerates health each round.','Primal Roar','{"hp": 30, "def": 3, "mo": 2}'),
(11,3,'Storm Berserker','Tempest Rager','Infuses raging swings with superheated lightning, discharging chain static into swarms.',3,'🌩️','Static Discharge','Every melee strike shocks adjacent foes for 30% electrical splash damage.','Thunderous Leap','{"atk": 3, "speed": 3, "mo": 2}'),
(12,3,'Blood Rager','Crimson Frenzy','Feasts upon the carnage of battle, healing catastrophic wounds with every fallen enemy.',3,'🩸','Gore Feast','Critical hits restore 25% of damage inflicted as health.','Frenzied Rend','{"atk": 4, "hp": 20, "speed": 2}'),
(13,4,'Assassin','Shadow Executioner','Lethal unseen stalker specializing in first-strike decapitations and toxic envenoming.',3,'🗡️','Death Strike','Attacks from stealth guarantee critical hits that ignore 50% target defense.','Assassinate','{"atk": 4, "speed": 3, "luck": 3}'),
(14,4,'Shadow Thief','Acrobatic Phantom','Elusive shadow who slips past locks and blades alike, vanishing in smoke.',3,'💨','Slip the Noose','Dodge chance increased by 20%; dodging drops a blinding smoke cloud.','Smoke Bomb Escape','{"speed": 4, "luck": 4, "def": 1}'),
(15,4,'Duelist','Rapier Virtuoso','Fierce single-target sword dancer executing lightning parries and fatal thrusts.',3,'🤺','Riposte Mastery','Successfully parrying an attack instantly triggers a free counter-strike.','Flourish & Lunge','{"atk": 3, "speed": 3, "def": 2}'),
(16,4,'Arcane Trickster','Illusion Infiltrator','Weaves minor illusion glamours and telekinesis to baffle guards and strike from mirrors.',3,'🃏','Mirror Legerdemain','Spawns an illusionary decoy that draws enemy attacks for 2 turns.','Mirror Strike','{"mo": 3, "mp": 20, "speed": 2, "luck": 2}'),
(17,5,'Beastmaster','Pack Alpha','Forms a lifelong empathic bond with a savage predator, hunting in deadly concert.',3,'🐺','Pack Coordination','Animal companion inherits 40% of ranger''s stats and flanks targets.','Command Beast Frenzy','{"hp": 20, "atk": 2, "speed": 2}'),
(18,5,'Sharpshooter','Eagle-Eye Sniper','Pins targets to the ground from maximum range with pinpoint armor-piercing arrows.',3,'🏹','Deadly Range','Ranged attacks deal up to 40% more damage the further the target is.','Heartseeker Shot','{"atk": 4, "luck": 3, "speed": 2}'),
(19,5,'Gloom Tracker','Nightstalker','Prowls subterranean caves and pitch-black barrens, striking unseen before fading.',3,'👁️','Umbral Camouflage','Becomes fully invisible in shadows and gains night vision.','Shadow Ambush','{"speed": 3, "atk": 3, "luck": 2}'),
(20,5,'Trapper Warden','Hazard Saboteur','Controls the battlefield with explosive snares, caltrops, and paralyzing root vines.',3,'🪤','Perimeter Mastery','Traps deal 50% more damage and root caught targets for 2 turns.','Cluster Trap Detonation','{"atk": 2, "def": 2, "luck": 3}'),
(21,6,'Way of Iron Knuckle','Bonebreaker','Hardens fists into living iron, shattering heavy shields and knocking foes unconscious.',3,'👊','Stone Stance','Unarmed blows break enemy armor guard and inflict physical concussion stuns.','Crushing Mountain Palm','{"atk": 3, "def": 3, "hp": 15}'),
(22,6,'Way of Flowing Chi','Chi Master','Circulates spiritual ki energy to unleash projectile wave blasts and self-healing meditation.',3,'🌊','Chi Circulation','Landing multi-hit combos restores MP and clears negative status ailments.','Hadoken Palm Wave','{"mo": 3, "mp": 25, "speed": 2}'),
(23,6,'Way of the Shadow Fist','Silent Ninja','Blends martial acrobatics with shadow teleportation, paralyzing nerve points in silence.',3,'🥷','Shadow Step','Instantly teleports behind a target when initiating an unarmed strike.','Nerve Strike Paralyze','{"speed": 4, "atk": 2, "luck": 2}'),
(24,6,'Way of the Dragon Breath','Elemental Fist','Ignites knuckles with primal dragon flames, glacial frost, or crackling gale shocks.',3,'🐲','Dragon Aura','Cycles punches between Fire, Ice, and Lightning with explosive impact.','Dragon Breath Kick','{"atk": 2, "mo": 2, "speed": 2, "hp": 10}'),
(25,7,'Pyromancer','Flame Evoker','Commands explosive infernos, incinerating entire legions with compounding burn dots.',3,'🔥','Conflagration','Fire spells cause targets to ignite, spreading burn patches on tick.','Meteor Swarm','{"mo": 5, "mp": 25, "atk": 1}'),
(26,7,'Cryomancer','Frost Weaver','Encases the battlefield in perpetual winter, freezing enemies solid and shattering them.',3,'❄️','Glacial Shield','Surrounded by ice armor that freezes melee attackers in place.','Deep Freeze Shatter','{"mo": 4, "def": 3, "mp": 20}'),
(27,7,'Arcanist','Aether Archmage','Manipulates raw, unaligned arcane force to pierce magical shields and tear space.',3,'🔮','Arcane Acceleration','Casting consecutive spells increases magic power by 10% per stack.','Arcane Annihilation Barrage','{"mo": 5, "mp": 30, "speed": 1}'),
(28,7,'Invoker','Tri-Elementalist','Weaves fire, frost, and lightning together into catastrophic hybrid cataclysms.',3,'🌀','Elemental Fusion','Alternating distinct spell elements triggers devastating detonation bursts.','Cataclysm Nova','{"mo": 4, "md": 2, "mp": 25, "luck": 1}'),
(29,8,'Chaos Conduit','Wild Surge Weaver','Channels unstable primordial chaos, risking reality tears for miraculous damage multipliers.',3,'🎲','Wild Surge','15% chance for any spell to duplicate itself or trigger a chaotic bonus explosion.','Chaos Cascade','{"mo": 4, "luck": 4, "mp": 20}'),
(30,8,'Dragonheart','Draconic Bloodline','Inherits ancestral dragon scale armor, ancient elemental breath, and primal resilience.',3,'🐉','Draconic Scales','Grants +25% natural physical armor and elemental resistance.','Draconic Breath Inferno','{"hp": 25, "def": 3, "mo": 3}'),
(31,8,'Stormborn','Tempest Conduit','Born amid a planar thunderstorm, floating on wind currents and hurling crackling lightning.',3,'⚡','Gale Levitation','Immune to ground hazards and gains +20% movement speed.','Supercharged Thunderstrike','{"speed": 3, "mo": 4, "mp": 20}'),
(32,8,'Aether Blood','Planar Phase Shifter','Carries planar void blood that allows phasing through attacks and warping battlefield geometry.',3,'🌌','Phase Warp','20% chance to phase out of reality when struck, completely negating damage.','Aether Rift Pulse','{"speed": 3, "md": 3, "mo": 3}'),
(33,9,'Hellfire Disciple','Brimstone Pact','Swore blood allegiance to an Archfiend, casting hellish fire and summoning demonic allies.',3,'🔥','Hellfire Mantle','Enemies slain by infernal fire refund 100% of the spell''s mana cost.','Hellfire Immolation','{"mo": 4, "atk": 2, "mp": 20}'),
(34,9,'Void Caller','Aberrant Pact','Taps into eldritch terrors from beyond the stars, shattering enemy sanity with void tentacles.',3,'🐙','Gaze of the Abyss','Spells inflict psychic dread, reducing enemy attack and movement speed.','Eldritch Void Rift','{"mo": 4, "md": 3, "mp": 25}'),
(35,9,'Soul Reaper','Grave Pact','Siphons the lingering souls of the dying into glowing soul jars to fuel protective shields.',3,'💀','Soul Harvest','Each slain foe yields a soul orb that absorbs incoming damage.','Soul Feast Drain','{"hp": 20, "mo": 3, "md": 2}'),
(36,9,'Star Pact','Cosmic Entity Pact','Contracts ancient stellar entities to call down gravitational pulses and cosmic radiants.',3,'⭐','Cosmic Gravity','Spells pull enemies into dense clusters, increasing AoE susceptibility.','Supernova Hex','{"mo": 4, "luck": 3, "mp": 20}'),
(37,10,'Dread Reanimator','Lord of the Crypt','Commands permanent legions of skeletal warriors and reanimated ghoul champions.',3,'🦴','Undead Dominion','Summoned minions gain +30% health, attack, and resistance to holy smites.','Army of the Crypt','{"mo": 4, "hp": 20, "mp": 25}'),
(38,10,'Soul Syphon','Vampiric Ghost','Phases between physical and ghost realms, siphoning life directly from enemy hearts.',3,'👻','Vampiric Conduit','Converts 30% of all magical damage dealt directly into character health.','Life Syphon Ray','{"hp": 20, "mo": 4, "md": 2}'),
(39,10,'Plague Lord','Rot Harbinger','Breeds virulent supernatural contagions that spread between foes and detonate rotting corpses.',3,'☣️','Virulent Bloom','Diseases jump to adjacent foes upon tick; corpses automatically detonate.','Corpse Explosion Cloud','{"mo": 4, "luck": 2, "mp": 25}'),
(40,10,'Death Knight (Graveblade)','Bone Knight','Armored melee executioner wielding frost-runed two-handed greatswords and bone plate.',3,'🗡️','Unholy Carapace','Converts mana into bone plate armor shields when striking in melee.','Grave Strike Obliterate','{"atk": 3, "def": 3, "hp": 20}'),
(41,11,'Radiant Arbiter','Solar Justiciar','Wields blistering holy solar beams to incinerate undead and blind evil combatants.',3,'☀️','Dawn''s Blindness','Holy spells blind enemy combatants for 1 turn, imposing 50% miss chance.','Solar Pillar Judgment','{"mo": 4, "atk": 2, "md": 2}'),
(42,11,'Life Warden','Sanctuary Healer','Fountain of rejuvenation, keeping entire teams alive through devastating boss attacks.',3,'🌿','Fountain of Vitality','Emits an aura that restores 5% max HP to all nearby allies every round.','Miracle of Resurrection','{"hp": 20, "mo": 3, "mp": 30}'),
(43,11,'War Priest','Battle Apostle','Clad in blessed heavy plate, wading into combat with enchanted warhammers and zeal.',3,'🔨','Righteous Zeal','Weapon strikes scale directly with magical faith stat in place of strength.','Hammer of the Gods','{"atk": 3, "def": 3, "hp": 15}'),
(44,11,'Sanctuary Hermit','Ward Inquisitor','Draws impenetrable holy circles, warding allies against curses, fear, and possession.',3,'🕯️','Aegis of Sanctuary','Allies inside your holy aura are completely immune to curses and fear.','Banishment Sanction','{"md": 4, "def": 2, "mo": 2, "mp": 20}'),
(45,12,'Circle of the Feral','Primal Shapeshifter','Masters primal beast forms, shapeshifting into savage Dire Bears, Panthers, and Wyrms.',3,'🐾','Beast Form Mastery','Shapeshifted beast forms retain full equipment armor and stat bonuses.','Primal Savage Maul','{"atk": 3, "hp": 25, "def": 2}'),
(46,12,'Circle of Renewal','Grove Healer','Cultivates enchanted healing blooms and life-giving rains across the battlefield.',3,'🌸','Living Grove','Healing spells sprout rejuvenating flower fields that heal stepping allies.','Grove Blossom Miracle','{"mo": 3, "mp": 30, "hp": 15}'),
(47,12,'Circle of Tempest','Storm Shaman','Commands nature''s fury, summoning gale hurricanes, hailstorms, and lightning barrages.',3,'⛈️','Stormwrath','Nature spells call down passive lightning strikes on adjacent targets.','Typhoon Gale Force','{"mo": 4, "speed": 2, "mp": 20}'),
(48,12,'Circle of Rot & Spore','Symbiotic Decay','Inhabits the natural cycle of decay, releasing blinding toxic spores and fungal shields.',3,'🍄','Spore Infestation','Taking damage releases toxic fungal clouds that poison attackers.','Spore Cloud Detonation','{"hp": 20, "def": 2, "mo": 3}'),
(49,13,'Frostblade','Glacial Spellsword','Enchants steel with sub-zero frostbite, freezing targets in place with every parry.',3,'❄️','Chilled Edge','Melee strikes chill enemies, reducing action speed by 30% and stacking frost.','Glacial Impale','{"atk": 2, "mo": 2, "def": 2, "speed": 2}'),
(50,13,'Pyreweaver','Flame Bladewright','Ignites dual blades into roaring arcs of white flame, leaving scorched trails of death.',3,'🔥','Ignited Arc','Weapon swings create fiery shockwaves that scorch all foes in a cone.','Molten Cleave','{"atk": 3, "mo": 3, "hp": 10}'),
(51,13,'Aether Stalker','Blink Bladeweaver','Blinks through dimensional folds, delivering instant backstabs before enemies can react.',3,'✨','Blink Step Strike','Every melee attack teleports the user behind the target with bonus damage.','Dimensional Horizon Slash','{"speed": 4, "atk": 2, "mo": 2}'),
(52,13,'Runic Bulwark','Spell-Ward Knight','Etches glowing absorption sigils into shields and armor, feeding on hostile magic.',3,'🛡️','Spell Drain Ward','Absorbs 40% of all hostile magic damage and converts it to melee bonus damage.','Runic Discharge Strike','{"def": 3, "md": 3, "hp": 15}'),
(53,14,'Crimson Reaver','Blood Scythe Berserker','Burns own blood to summon devastating jagged scythes, dealing astronomical critical spikes.',3,'🩸','Sanguine Frenzy','Attack power increases by 2% for every 1% of current health missing.','Crimson Blood Scythe','{"atk": 4, "hp": 25, "speed": 1}'),
(54,14,'Sanguine Leech','Vampiric Drain Tank','Tethers arterial cords to all nearby enemies, continuously drinking their health.',3,'🧛','Blood Tether Aura','Constantly drains 4% max HP per round from all adjacent enemy targets.','Exsanguination Whirl','{"hp": 30, "def": 2, "mo": 2}'),
(55,14,'Blood Marionette','Hemotic Puppeteer','Seizes the arterial circulation of living targets, forcing enemies to butcher their own allies.',3,'🪆','Coagulation Lock','Enemies damaged by your spells have their action cooldowns delayed by 1 turn.','Puppet Strings Possession','{"mo": 4, "md": 2, "speed": 2}'),
(56,14,'Scarlet Weaver','Crystalline Sanguine Ward','Hardens spilled blood into ruby armor plates that deflect both blades and eldritch spells.',3,'💎','Carapace of Blood','Spilled blood forms hardened crystalline armor, granting bonus physical DEF.','Crystalline Blood Wall','{"def": 4, "hp": 20, "md": 2}'),
(57,15,'Siege Smith','Deployable Turret Master','Constructs automated Gatling turrets, mortar batteries, and tesla coils in the heat of battle.',3,'🏰','Deployable Foundry','Automatically deploys a clockwork defense turret upon entering combat.','Gatling Turret Deploy','{"def": 3, "mo": 3, "hp": 15}'),
(58,15,'Alchemical Saboteur','Volatile Bombardier','Hurls pressurized acid vials, sticky napalm, and blinding phosphorescent flashbangs.',3,'🧪','Volatile Flasks','All throwing items and concoctions have 50% larger AoE and inflict burn/melt.','Acid Cluster Concoction','{"mo": 3, "atk": 2, "luck": 3}'),
(59,15,'Exosuit Vanguard','Steam-Piston Pilot','Pilots a heavy brass exoskeleton armed with pneumatic piston fists and steam jets.',3,'🤖','Pneumatic Armor','Immune to physical stuns; melee strikes knock targets back 3 tiles.','Piston Smash Overdrive','{"hp": 25, "def": 4, "atk": 2}'),
(60,15,'Galvanic Machinist','Tesla Engineer','Powers magnetic shield drones and overcharged capacitors that stun metal-clad enemies.',3,'⚡','Overcharge Capacitor','Casting electrical skills builds a permanent shield barrier on the artificer.','EMP Capacitor Discharge','{"mo": 3, "def": 2, "speed": 3}'),
(61,16,'Inquisitor','Anti-Mage Enforcer','Roots out spellcasters with silence glyphs, mana burns, and spell-dispelling steel.',3,'⚖️','Magebane Aura','Hostile mages within 4 tiles pay double mana and take backfire damage.','Silence Inscription Glyph','{"atk": 3, "md": 3, "speed": 2}'),
(62,16,'Purifier','Consecration Gunner','Loads heavy repeating crossbows with silver-blessed bolts and consecrated oil canisters.',3,'🏹','Silver Bolt Volley','Deals +35% bonus damage against fiends, undead, and cursed monsters.','Consecrated Firestorm','{"atk": 4, "speed": 2, "luck": 2}'),
(63,16,'Grim Occultist','Forbidden Hunter','Uses the dark tools of witches against them, setting eldritch banishment circles.',3,'🕯️','Eye for Weakness','Instantly reveals all monster elemental weaknesses and vulnerabilities.','Banishment Hex Seal','{"mo": 3, "atk": 2, "luck": 3}'),
(64,16,'Exorcist Vanguard','Relic Executioner','Clad in heavy trench-coats and blessed steel plate, hunting supernatural horrors in close quarters.',3,'⚔️','Righteous Brand','Melee strikes permanently stagger aberrant and demonic entities.','Executioner''s Verdict','{"atk": 3, "def": 3, "hp": 15}'),
(65,17,'Tempest Herald','Lightning Archon','Commands violent storms, calling down forked chain lightning that arcs across enemy lines.',3,'🌩️','Arcing Current','Lightning spells automatically chain to 3 additional targets with no falloff.','Chain Lightning Deluge','{"mo": 4, "speed": 3, "mp": 20}'),
(66,17,'Skywarden','Gale Protector','Wreathes allies in impenetrable wind barriers that deflect ranged projectile attacks.',3,'💨','Gale Wind Shield','Grants party a 50% deflection chance against all incoming ranged projectiles.','Gale Force Barrier','{"def": 3, "md": 3, "hp": 15}'),
(67,17,'Vortex Mage','Gravitational Cyclone','Spawns churning mini-tornadoes that drag enemies into the eye of the vortex.',3,'🌀','Singularity Pull','Spells pull all affected enemies inward, stunning them for 1 turn.','Vortex Cyclone Whirlpool','{"mo": 4, "luck": 2, "mp": 25}'),
(68,17,'Static Striker','Storm Blade','Channels voltage directly into polearms and blades, delivering stunning thunderstrikes.',3,'⚡','Supercharged Blade','Melee hits build static voltage, discharging an electric stun burst at 3 stacks.','Thunderstrike Cleave','{"atk": 3, "mo": 2, "speed": 3}'),
(69,18,'Nightblade','Shadow Clone Duelist','Creates solid umbral mirror clones that mimic every sword slash simultaneously.',3,'👥','Shadow Mirroring','Shadow clones mimic all attacks, dealing 40% duplicate damage.','Phantom Blade Flurry','{"atk": 3, "speed": 4, "luck": 1}'),
(70,18,'Twilight Weaver','Penumbral Phase Walker','Slips seamlessly between the material realm and the shadow plane to ignore damage.',3,'🌑','Penumbral Veil','25% passive chance to phase into the shadow realm, dodging any lethal hit.','Shadow Step Ambush','{"speed": 4, "def": 2, "luck": 2}'),
(71,18,'Umbral Assassin','Choking Garrote','Strikes from the blind spot with silent garrotes and shadow-infused poisoned daggers.',3,'🗡️','Blind Spot Execution','Attacks from behind ignore 60% armor and cause severe hemorrhaging.','Umbral Garrote Choke','{"atk": 4, "speed": 3, "luck": 2}'),
(72,18,'Eclipse Dancer','Whirling Blade Acrobat','Performs an acrobatic ribbon dance of obsidian razors, severing tendons with artistic grace.',3,'💃','Whirling Momentum','Moving across the battlefield stacks critical strike chance up to +30%.','Razor Dance Torrent','{"speed": 4, "atk": 2, "luck": 3}'),
(73,19,'Riftwalker','Temporal Rewinder','Manipulates the flow of personal time, rewinding lethal wounds and undoing mistakes.',3,'⏳','Temporal Rewind','Taking fatal damage rewinds the user''s HP to its state at the start of the turn.','Time Slip Reversal','{"hp": 20, "speed": 3, "mo": 2}'),
(74,19,'Entropy Weaver','Decay Accelerant','Fast-forwards time on living flesh and metal, rapidly rusting armor and withering vitality.',3,'⌛','Accelerated Entropy','Attacks apply accelerated decay, eating away at target armor and health.','Entropic Wither Burst','{"mo": 4, "atk": 2, "mp": 20}'),
(75,19,'Time Warden','Chronos Haste Master','Accelerates ally reaction speeds while trapping enemies inside frozen time dilation bubbles.',3,'🕰️','Chrono Haste Field','All allies gain +25% turn action speed and movement range.','Time Dilation Freeze','{"speed": 4, "mo": 3, "mp": 20}'),
(76,19,'Chrono-Blade','Echo Strike Swordsman','Attacks with temporal echoes that repeat every blade strike across multiple timelines.',3,'⚔️','Temporal Echo','Every melee attack echoes 0.5 seconds later for an extra 45% true damage hit.','Chrono Flurry Multistrike','{"atk": 3, "speed": 3, "mo": 2}'),
(77,20,'Detonation Scribe','Chain Rune Saboteur','Inscribes reactive floor runes that detonate in devastating cascading chain explosions.',3,'💥','Chain Reaction','When one rune detonates, all adjacent runes detonate with +20% bonus damage.','Detonation Sigil Cascade','{"mo": 4, "atk": 2, "mp": 20}'),
(78,20,'Sanctum Weaver','Barrier Architect','Erects glowing magical barriers and impenetrable sigil domes that absorb all incoming siege damage.',3,'🛡️','Aegis Sanctuary Dome','Allies standing within inscribed circles take 40% less incoming damage.','Sanctuary Dome Shield','{"def": 4, "md": 4, "hp": 15}'),
(79,20,'Binding Runemaster','Gravitational Glyph Binder','Lays runic snares that anchor targets to the ground, preventing teleportation and movement.',3,'🪢','Runic Tethering','Enemies crossing runes are chained to the floor, rooted for 2 rounds.','Gravitational Bind Glyph','{"mo": 3, "def": 2, "speed": 2, "luck": 2}'),
(80,20,'Rune Knight','Inscribed Steel Vanguard','Etches permanent protective sigils into heavy armor and steel, erupting when struck.',3,'🗡️','Carapace Sigils','Taking physical hits triggers a retaliatory elemental shockwave.','Runic Overload Cleave','{"atk": 3, "def": 3, "mo": 2, "hp": 15}');
DROP TABLE IF EXISTS "game_tile_types";
CREATE TABLE "game_tile_types" (
  "id" integer NOT NULL,
  "name" varchar(64) NOT NULL DEFAULT 'Tile',
  "is_passable" smallint NOT NULL DEFAULT 1,
  "is_active" smallint NOT NULL DEFAULT 1,
  "speed_mult" float NOT NULL DEFAULT 1,
  "damage_per_step" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
INSERT INTO "game_tile_types" VALUES
(0,'Floor',1,1,1,0,'2026-09-03 11:15:58'),
(1,'Wall',0,1,1,0,'2026-09-03 11:15:58'),
(2,'Door',1,1,1,0,'2026-09-03 11:15:58'),
(3,'Ramp',1,1,1,0,'2026-09-03 11:15:58'),
(4,'Stone',1,1,1,0,'2026-09-03 11:15:58'),
(5,'Wood',1,1,1,0,'2026-09-03 11:15:58'),
(6,'Water',0,1,1,0,'2026-09-03 11:15:58'),
(7,'Lava',0,1,1,0,'2026-09-03 11:15:58');
DROP TABLE IF EXISTS "game_town_lottery";
CREATE TABLE "game_town_lottery" (
  "id" integer NOT NULL,
  "map_id" integer NOT NULL DEFAULT 1,
  "jackpot_pool" integer NOT NULL DEFAULT 2500,
  "last_drawn_at" timestamp NULL DEFAULT NULL,
  "winning_numbers" varchar(32) DEFAULT NULL,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
INSERT INTO "game_town_lottery" VALUES
(1,1,10760,'2026-09-09 10:37:19','12-16-19','2026-09-09 10:37:19');
DROP TABLE IF EXISTS "game_visual_scripts";
CREATE TABLE "game_visual_scripts" (
  "id" integer NOT NULL,
  "name" varchar(128) NOT NULL,
  "script_json" text DEFAULT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "game_wave_defs";
CREATE TABLE "game_wave_defs" (
  "key" varchar(80) NOT NULL,
  "name" varchar(120) NOT NULL,
  "description" text DEFAULT NULL,
  "map_id" integer DEFAULT NULL,
  "rounds_json" text NOT NULL,
  "scaling_json" text DEFAULT NULL,
  "on_wave_start_json" text DEFAULT NULL,
  "on_wave_clear_json" text DEFAULT NULL,
  "on_sequence_complete_json" text DEFAULT NULL,
  "settings_json" text DEFAULT NULL,
  "loop" smallint DEFAULT 0,
  "enabled" smallint DEFAULT 1,
  "updated_at" timestamp NOT NULL,
  PRIMARY KEY ("key")
);
INSERT INTO "game_wave_defs" VALUES
('horde_survival','Horde Survival','Endless escalating waves. Survive as long as possible.',NULL,'[{"delay_seconds":10,"spawns":[{"count":5,"interval_ms":800,"npc_template":"zombie","zone_key":"perimeter"}],"wave":1},{"delay_seconds":20,"spawns":[{"count":8,"interval_ms":600,"npc_template":"zombie","zone_key":"perimeter"},{"count":2,"interval_ms":400,"npc_template":"fast_zombie","zone_key":"perimeter"}],"wave":2},{"delay_seconds":25,"spawns":[{"count":10,"interval_ms":500,"npc_template":"zombie","zone_key":"perimeter"},{"count":4,"interval_ms":300,"npc_template":"fast_zombie","zone_key":"perimeter"},{"boss":true,"count":1,"interval_ms":0,"npc_template":"brute","zone_key":"perimeter"}],"wave":3}]','{"atk_mult_per_wave":0.1,"count_add_per_loop":2,"hp_mult_per_wave":0.15}','{}','{"broadcast":"wave_survived"}','{}','{"auto_start":false,"clear_condition":"all_dead"}',1,1,'2026-09-03 07:15:53'),
('moba_lane','MOBA Lane Minions','Infinite looping lane minion waves. 3 melee + 1 ranged every 30s.',NULL,'[{"delay_seconds":0,"spawns":[{"count":3,"interval_ms":500,"npc_template":"lane_melee","zone_key":"base_spawn"},{"count":1,"interval_ms":500,"npc_template":"lane_ranged","zone_key":"base_spawn"}],"wave":1}]','{"atk_mult_per_wave":0.01,"hp_mult_per_wave":0.02}','{}','{}','{}','{"auto_start":true,"clear_condition":"timer","wave_interval_seconds":30}',1,1,'2026-09-03 07:15:53'),
('td_basic','Basic Tower Defense','5 waves of increasing difficulty. Wave 5 is a boss.',NULL,'[{"delay_seconds":5,"spawns":[{"count":3,"interval_ms":1500,"npc_template":"goblin","zone_key":"spawn_entrance"}],"wave":1},{"delay_seconds":25,"spawns":[{"count":5,"interval_ms":1200,"npc_template":"goblin","zone_key":"spawn_entrance"}],"wave":2},{"delay_seconds":25,"spawns":[{"count":4,"interval_ms":1000,"npc_template":"goblin","zone_key":"spawn_entrance"},{"count":2,"interval_ms":2000,"npc_template":"orc","zone_key":"spawn_entrance"}],"wave":3},{"delay_seconds":30,"spawns":[{"count":5,"interval_ms":1500,"npc_template":"orc","zone_key":"spawn_entrance"},{"count":3,"interval_ms":2000,"npc_template":"goblin_archer","zone_key":"spawn_flank"}],"wave":4},{"delay_seconds":35,"spawns":[{"boss":true,"count":1,"interval_ms":0,"npc_template":"boss_troll","zone_key":"spawn_entrance"},{"count":3,"interval_ms":1000,"npc_template":"orc","zone_key":"spawn_flank"}],"wave":5}]','{"atk_mult_per_wave":0.05,"hp_mult_per_wave":0.1,"xp_mult_per_wave":0.15}','{"broadcast":"wave_start"}','{"broadcast":"wave_clear"}','{"broadcast":"sequence_complete","set_world_flag":"td_cleared"}','{"auto_start":true,"clear_condition":"all_dead"}',0,1,'2026-09-03 07:15:53');
DROP TABLE IF EXISTS "game_weather_defs";
CREATE TABLE "game_weather_defs" (
  "key" varchar(40) NOT NULL,
  "name" varchar(80) NOT NULL,
  "icon" varchar(16) DEFAULT '☀️',
  "vision_mult" float DEFAULT 1,
  "speed_mult" float DEFAULT 1,
  "surface_chance" float DEFAULT 0,
  "surface_type" varchar(40) DEFAULT NULL,
  "damage_per_turn" integer DEFAULT 0,
  "damage_type" varchar(40) DEFAULT NULL,
  "element_bonus_json" text DEFAULT NULL,
  "visual" varchar(40) DEFAULT NULL,
  "sound_loop" varchar(80) DEFAULT NULL,
  "duration_range_min" integer DEFAULT 30,
  "duration_range_max" integer DEFAULT 120,
  "weight" integer DEFAULT 10,
  "enabled" smallint DEFAULT 1,
  PRIMARY KEY ("key")
);
INSERT INTO "game_weather_defs" VALUES
('blizzard','Blizzard','❄️',0.3,0.6,0.2,'ice',3,'ice','{"ice":25}','blizzard','blizzard_loop',15,45,5,1),
('clear','Clear Sky','☀️',1,1,0,NULL,0,NULL,'{"fire":10}','clear',NULL,40,120,20,1),
('fog','Dense Fog','🌫️',0.5,1,0,NULL,0,NULL,'{}','fog','fog_loop',20,60,10,1),
('heavy_rain','Heavy Rain','⛈️',0.7,0.85,0.15,'water',0,NULL,'{"water":20,"lightning":5}','heavy_rain','heavy_rain_loop',20,60,8,1),
('rain','Rain','🌧️',0.9,0.95,0.05,'water',0,NULL,'{"water":10}','rain','rain_loop',30,90,15,1),
('sandstorm','Sandstorm','🏜️',0.4,0.7,0.1,'sand',2,'earth','{"earth":15}','sandstorm','sandstorm_loop',15,50,5,1),
('snow','Snow','🌨️',0.8,0.8,0.05,'ice',0,NULL,'{"ice":10}','snow','snow_loop',30,90,10,1),
('thunderstorm','Thunderstorm','⚡',0.6,0.9,0.1,'water',5,'lightning','{"lightning":20,"water":10}','thunderstorm','thunder_loop',10,40,7,1);
DROP TABLE IF EXISTS "gm_notes";
CREATE TABLE "gm_notes" (
  "id" integer NOT NULL,
  "body" text NOT NULL,
  "author" varchar(64) NOT NULL DEFAULT 'Admin',
  "pinned" smallint NOT NULL DEFAULT 0,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "schema_migrations";
CREATE TABLE "schema_migrations" (
  "version" bigint NOT NULL,
  "inserted_at" timestamp DEFAULT NULL,
  PRIMARY KEY ("version")
);
DROP TABLE IF EXISTS "staff_messages";
CREATE TABLE "staff_messages" (
  "id" integer NOT NULL,
  "sender_id" integer DEFAULT NULL,
  "sender_name" varchar(64) NOT NULL,
  "sender_role" varchar(32) NOT NULL DEFAULT 'STAFF',
  "body" text NOT NULL,
  "channel" varchar(32) NOT NULL DEFAULT 'general',
  "saved" smallint NOT NULL DEFAULT 0,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
DROP TABLE IF EXISTS "system_settings";
CREATE TABLE "system_settings" (
  "id" integer NOT NULL,
  "setting_key" varchar(128) NOT NULL,
  "setting_value" text DEFAULT NULL,
  "updated_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("setting_key")
);
DROP TABLE IF EXISTS "users";
CREATE TABLE "users" (
  "id" integer  NOT NULL,
  "username" varchar(64) NOT NULL,
  "email" varchar(255) NOT NULL,
  "password_hash" varchar(255) NOT NULL,
  "role" varchar(64) NOT NULL DEFAULT 'PLAYER',
  "currency" integer  NOT NULL DEFAULT 100,
  "is_banned" smallint NOT NULL DEFAULT 0,
  "email_verified" smallint NOT NULL DEFAULT 1,
  "email_verify_token" varchar(128) DEFAULT NULL,
  "email_verify_expires" timestamp DEFAULT NULL,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_login" timestamp NULL DEFAULT NULL,
  "login_streak" integer  NOT NULL DEFAULT 0,
  "last_login_date" date DEFAULT NULL,
  "chat_color" varchar(32) DEFAULT '#38bdf8',
  PRIMARY KEY ("id"),
  UNIQUE ("username"),
  UNIQUE ("email")
);
DROP TABLE IF EXISTS "vision_radius_overrides";
CREATE TABLE "vision_radius_overrides" (
  "id" integer NOT NULL,
  "entity_type" varchar(64) NOT NULL,
  "entity_id" integer NOT NULL,
  "radius" integer NOT NULL,
  "reason" varchar(128) DEFAULT NULL,
  "expires_at" timestamp NULL DEFAULT NULL,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);