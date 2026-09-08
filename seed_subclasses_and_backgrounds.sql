
    ALTER TABLE game_backgrounds
        ADD COLUMN IF NOT EXISTS icon VARCHAR(32) NOT NULL DEFAULT '📜',
        ADD COLUMN IF NOT EXISTS bonus_atk INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS bonus_def INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS bonus_mo INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS bonus_md INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS bonus_speed INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS bonus_luck INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tag VARCHAR(64) NOT NULL DEFAULT 'wanderer',
        ADD COLUMN IF NOT EXISTS npc_reaction TEXT NULL,
        ADD COLUMN IF NOT EXISTS companion_reaction TEXT NULL,
        ADD COLUMN IF NOT EXISTS enemy_reaction TEXT NULL,
        ADD COLUMN IF NOT EXISTS reaction_json JSON NULL;
    

    ALTER TABLE characters
        ADD COLUMN IF NOT EXISTS subclass_id INT UNSIGNED NULL DEFAULT NULL;
    

    CREATE TABLE IF NOT EXISTS game_subclasses (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        class_id INT UNSIGNED NOT NULL,
        name VARCHAR(64) NOT NULL,
        archetype_title VARCHAR(64) NOT NULL,
        description TEXT NOT NULL,
        level_req INT NOT NULL DEFAULT 3,
        icon VARCHAR(32) NOT NULL DEFAULT '⚡',
        passive_name VARCHAR(64) NOT NULL,
        passive_desc TEXT NOT NULL,
        signature_ability VARCHAR(64) NOT NULL,
        stat_bonuses JSON NULL,
        INDEX idx_class (class_id)
    );
    
TRUNCATE TABLE game_backgrounds;

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            1, 'Outlander (Wilds Wanderer)', 'outlander', '🌲', 'Hardy survivor of uncharted frontiers, beast-haunted forests, and treacherous mountain passes.',
            25, 0, 1, 2,
            0, 1, 1, 0,
            'HP+25, DEF+2, ATK+1', 'Wilderness guides, scouts, and hermits share hidden paths; city guards remain suspicious of your rough demeanor.', 'Survivalist and beast companions gain +15 Morale; sheltered highborn companions rely on your outdoor knowledge.', 'Wild predators hesitate before striking (15% pacify chance); beastmen enemies treat you as an alpha rival.', '{"disposition": {"wilds": 25, "guards": -10, "scouts": 20}, "companion_affinity": ["survivalist", "feral", "ranger"], "enemy_pacify_mod": 15, "dialogue_tags": ["wilderness_lore", "beast_tongue", "trailblazer"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            2, 'Urchin (Alley Phantom)', 'urchin', '🐀', 'Raised in the shadow of gothic metropolis alleys and rooftops, surviving on pickpocketing and cunning.',
            10, 5, 1, 0,
            0, 1, 3, 2,
            'SPD+3, LCK+2, HP+10', 'Street urchins, beggars, and fences share black market rumors and hidden smuggling escape routes.', 'Rogue and outcast companions bond deeply (+20 loyalty); lawful companions may scold opportunistic thievery.', 'Gutter gangs, cutthroats, and city bandits recognize gutter cant, reducing surprise ambush penalties.', '{"disposition": {"underworld": 25, "nobles": -15, "guards": -15}, "companion_affinity": ["rogue", "outcast", "street"], "enemy_pacify_mod": 10, "dialogue_tags": ["streetwise", "gutter_cant", "pickpocket"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            3, 'Noble Heir (Highborn Blood)', 'noble', '👑', 'Scion of an ancient lineage with royal pedigree, ancestral heraldry, and deep political influence.',
            15, 15, 1, 1,
            1, 1, 0, 3,
            'HP+15, MP+15, LCK+3, +100 Gold', 'Aristocrats, court envoys, and high merchants grant entry to private manors and offer luxury trade discounts.', 'Knightly companions swear fealty with pride; peasant or revolutionary companions question your privilege.', 'Humanoid bandits and mercenary captains attempt to ransom you rather than fighting to the bitter death.', '{"disposition": {"nobles": 35, "merchants": 20, "rebels": -25}, "companion_affinity": ["knight", "scholar", "courtier"], "enemy_ransom_mod": 30, "dialogue_tags": ["highborn_pedigree", "court_etiquette", "heraldry"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            4, 'Haunted Veteran (Grave-Marked)', 'haunted', '🕯️', 'Survived an unspeakable supernatural nightmare that claimed your unit, bearing icy resolve and eerie presence.',
            20, 10, 2, 1,
            1, 3, 0, -1,
            'HP+20, MDEF+3, ATK+2', 'Occultists, morticians, and exorcists offer dark insights; superstitious townsfolk shudder in your wake.', 'Battle-hardened companions respect your unbreakable quiet stoicism; cheerful companions find you chilling.', 'Undead, specters, and tomb horrors sense your death-mark, hesitating or muttering in spectral tongues.', '{"disposition": {"occult": 25, "clergy": 10, "commoners": -15}, "companion_affinity": ["veteran", "necromancer", "grim"], "enemy_fear_mod": 20, "dialogue_tags": ["supernatural_sight", "ghost_whisper", "death_resilience"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            5, 'Gladiator (Pit Champion)', 'gladiator', '🏟️', 'Crowned champion of blood-soaked arena pits, forging lethal weapon discipline and crowd showmanship.',
            30, 0, 3, 2,
            0, 0, 1, -1,
            'HP+30, ATK+3, DEF+2', 'Tavern patrons, weapon-masters, and bouncers cheer your fame; strict lawmakers treat you as volatile muscle.', 'Martial companions gain inspiration from your brutal flair, boosting their critical hit morale.', 'Rival humanoid combatants suffer morale penalties (-10% enemy morale); wild arena beasts fight with frenzied fury.', '{"disposition": {"crowds": 30, "mercenaries": 25, "magistrates": -10}, "companion_affinity": ["warrior", "berserker", "brawler"], "enemy_morale_penalty": 15, "dialogue_tags": ["arena_swagger", "crowd_pleaser", "executioner_gauge"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            6, 'Acolyte (Temple Blessed)', 'acolyte', '✨', 'Devoted early years to cloistered cathedral sanctums, steeped in sacred scriptures and restorative blessings.',
            10, 30, 0, 1,
            2, 3, 0, 1,
            'MP+30, MDEF+3, MAG+2, HP+10', 'Clerics, pilgrims, and temple healers offer free sanctuary, holy blessings, and medicinal triage.', 'Devout and righteous companions rally around your faith; heretical companions debate your dogma.', 'Demonic cultists prioritize you as a righteous threat; penitent outlaws may seek absolution and surrender.', '{"disposition": {"clergy": 35, "pilgrims": 30, "fiends": -30}, "companion_affinity": ["cleric", "paladin", "righteous"], "enemy_surrender_mod": 20, "dialogue_tags": ["holy_scripture", "sacred_rites", "divine_empathy"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            7, 'Guild Artisan (Master Forger)', 'artisan', '🔨', 'Licensed guild master of metals, gems, and forge secrets, with an unmatched eye for craftsmanship and commerce.',
            15, 10, 1, 2,
            1, 1, 0, 3,
            'HP+15, DEF+2, LCK+3', 'Blacksmiths, traders, and guild masters provide wholesale discounts and reveal rare crafting recipes.', 'Companions appreciate regular weapon and armor maintenance, gaining passive gear durability buffs.', 'Scavengers and goblin tinkerers can be bribed with rare alloy scrap to avoid needless bloodshed.', '{"disposition": {"guilds": 30, "merchants": 25, "thieves": -10}, "companion_affinity": ["artificer", "smith", "mercantile"], "enemy_bribe_mod": 25, "dialogue_tags": ["guild_appraisal", "alloy_lore", "trade_barter"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            8, 'Shadow Syndicate (Underworld Enforcer)', 'syndicate', '🗡️', 'Veteran enforcer of black market syndicates, feared across backstreets for swift intimidation and iron oaths.',
            15, 10, 2, 1,
            0, 1, 2, 1,
            'ATK+2, SPD+2, HP+15', 'Smugglers, fences, and crime barons grant access to illicit contraband; city magistrates mark you for scrutiny.', 'Morally flexible companions obey orders without question; idealistic companions question your methods.', 'Underworld thugs and mercenary squads recognize your rank, showing high willingness to yield in combat.', '{"disposition": {"syndicate": 35, "smugglers": 25, "lawmen": -20}, "companion_affinity": ["rogue", "mercenary", "assassin"], "enemy_intimidate_mod": 25, "dialogue_tags": ["underworld_code", "racketeering", "shakedown"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            9, 'Arcane Scholar (Academy Archivist)', 'scholar', '📚', 'Researcher from the Grand Athenaeum with mastery over forgotten astral scripts and forbidden historical texts.',
            10, 35, 0, 0,
            3, 3, 0, 1,
            'MP+35, MAG+3, MDEF+3, HP+10', 'Mages, archivists, and librarians open restricted spell repositories and decipher planar artifacts.', 'Spellcaster companions engage in deep arcane study with you, unlocking enhanced MP regeneration.', 'Enchanted arcane constructs and rune sentinels recognize academic passcodes, bypassing auto-engagement.', '{"disposition": {"scholars": 35, "mages": 25, "anti_magic": -20}, "companion_affinity": ["mage", "wizard", "academic"], "enemy_bypass_constructs": 30, "dialogue_tags": ["ancient_languages", "astral_theory", "glyph_decoding"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            10, 'Bounty Hunter (Grave Hound)', 'bounty_hunter', '🎯', 'Relentless frontier tracker hunting marked outlaws and dangerous beasts across desolate wilderness.',
            20, 10, 2, 1,
            0, 1, 2, 1,
            'HP+20, ATK+2, SPD+2', 'Sheriffs, bailiffs, and tavern keepers provide high-reward contract notices and target locations.', 'Pragmatic, goal-oriented companions thrive on your disciplined professionalism and fair cut splits.', 'Wanted bandit leaders and rogue warlords fight with desperate fury, knowing they are cornered.', '{"disposition": {"lawmen": 25, "guilds": 20, "outlaws": -35}, "companion_affinity": ["ranger", "mercenary", "tracker"], "enemy_outlaw_desperation": 20, "dialogue_tags": ["manhunter", "tracking_instinct", "bounty_ledger"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            11, 'Battle Medic (Frontline Healer)', 'battle_medic', '🩹', 'Field surgeon who stitched together severed limbs and treated magical burns during grueling siege campaigns.',
            25, 20, 1, 2,
            1, 2, 0, 1,
            'HP+25, MP+20, DEF+2, MDEF+2', 'Wounded soldiers, village healers, and guards greet you with deep reverence and gift healing salves.', 'All companions rest easier in camp, recovering an extra 25% health and stamina during downtime.', 'Intelligent enemy commanders instruct their squads to flank you, while injured grunts plead for mercy.', '{"disposition": {"soldiers": 30, "villagers": 25, "apothecaries": 25}, "companion_affinity": ["all", "healer", "soldier"], "enemy_target_priority": 15, "dialogue_tags": ["triage_expert", "field_surgery", "herbal_balms"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            12, 'Hermit Mystic (Star Seer)', 'mystic', '🌌', 'Lived in seclusion atop solitary peaks, gazing into the celestial veil to decipher prophetic constellations.',
            15, 25, 0, 1,
            2, 2, 0, 3,
            'MP+25, LCK+3, MAG+2, HP+15', 'Astrologers, wandering shamans, and seers reveal hidden astronomical portents and leylines.', 'Philosophical companions find calming clarity; aggressive hotheads grow impatient with your riddles.', 'Eldritch aberrations and void entities pause to converse in telepathic whispers before engaging.', '{"disposition": {"mystics": 35, "druids": 20, "bureaucrats": -15}, "companion_affinity": ["druid", "mystic", "monk"], "enemy_eldritch_commune": 25, "dialogue_tags": ["stellar_prophecy", "cosmic_vision", "tranquil_mind"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            13, 'Caravan Guard (Dune Vanguard)', 'caravan_guard', '🛡️', 'Defended vital merchant supply lines across monster-infested deserts and bandit ambushes.',
            25, 5, 2, 3,
            0, 1, 1, 0,
            'HP+25, DEF+3, ATK+2', 'Wandering traders, drovers, and roadhouse keepers offer free supplies and reliable escort jobs.', 'Companions gain teamwork defensive bonuses whenever flanked or surprised during travel.', 'Highwaymen and desert raiders treat you as an unmovable obstacle, requiring higher payoffs to yield.', '{"disposition": {"merchants": 30, "quartermasters": 20, "raiders": -25}, "companion_affinity": ["vanguard", "defender", "team_player"], "enemy_highway_standoff": 20, "dialogue_tags": ["convoy_tactics", "perimeter_watch", "road_lore"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            14, 'Court Diplomat (Silver Tongue)', 'diplomat', '🕊️', 'Master of statecraft, negotiation, and delicate etiquette, capable of disarming hostility with a single phrase.',
            10, 20, 0, 1,
            1, 1, 1, 3,
            'LCK+3, MP+20, HP+10, DEF+1', 'Ambassadors, lords, and town magistrates grant diplomatic immunity and permit peaceful parley.', 'Companion arguments are smoothed over instantly; party morale rarely plummets after setbacks.', 'Enemy captains and warlords are far more receptive to mid-combat truces and parley (+25% negotiation).', '{"disposition": {"nobility": 25, "diplomats": 35, "fanatics": -15}, "companion_affinity": ["bard", "noble", "peacemaker"], "enemy_negotiation_mod": 25, "dialogue_tags": ["peace_broker", "de-escalation", "subtle_flattery"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            15, 'Witch-Marked (Curse-Bearer)', 'witch_marked', '🔮', 'Branded by a dark coven at infancy, surviving an ancient hex that left you resilient to black sorcery.',
            15, 25, 1, 0,
            3, 2, 0, 1,
            'HP+15, MP+25, MAG+3, MDEF+2', 'Superstitious commoners avert their gaze; witch covens and shamans greet you as an awakened sibling.', 'Occult companions are fascinated by your dark mark; pious companions offer prayers to cleanse you.', 'Dark cultists, hags, and shadow beasts attempt to recruit or bargain rather than immediately attack.', '{"disposition": {"witches": 30, "shamans": 20, "inquisition": -30}, "companion_affinity": ["warlock", "witch_hunter", "sorcerer"], "enemy_coven_recruitment": 20, "dialogue_tags": ["hex_immunity", "coven_whispers", "curse_sight"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            16, 'Sailor Corsair (Storm Mariner)', 'sailor', '⚓', 'Hardened salt mariner who weathered leviathan storms, privateer raids, and dangerous coastal reefs.',
            20, 10, 2, 1,
            0, 1, 2, 1,
            'HP+20, ATK+2, SPD+2', 'Harbor captains, fishermen, and dockside innkeepers share nautical charts, ship passages, and rumors.', 'Free-spirited companions bond over sea shanties and rum, fighting with spirited camaraderie.', 'Pirates and sea marauders treat you as a brother of the tide; aquatic predators can be lured away.', '{"disposition": {"mariners": 35, "dockworkers": 25, "landlords": -10}, "companion_affinity": ["rogue", "corsair", "brawler"], "enemy_pirate_parley": 25, "dialogue_tags": ["sea_shanty", "nautical_navigation", "tide_reading"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            17, 'Dungeon Scavenger (Ruin Delver)', 'ruin_delver', '🗝️', 'Plundered sunken crypts, forgotten dwarf halls, and lethal catacombs, developing sixth-sense trap avoidance.',
            20, 15, 1, 2,
            1, 1, 1, 2,
            'HP+20, MP+15, DEF+2, LCK+2', 'Antiquarians, trap-smiths, and relic collectors purchase subterranean salvage at premium coin rates.', 'Companions receive automatic trap detection alerts and secret wall notifications while delving ruins.', 'Dungeon vermin, mimics, and subterranean cave crawlers fail to catch your party by surprise.', '{"disposition": {"antiquarians": 30, "miners": 20, "curators": 20}, "companion_affinity": ["scout", "artisan", "treasure_seeker"], "enemy_ambush_negation": 30, "dialogue_tags": ["trap_disarm", "ancient_masonry", "dungeon_cartography"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            18, 'Inquisitor Veteran (Heresy Hunter)', 'inquisitor_vet', '⚖️', 'Steel-willed investigator for the Order of Truth, experienced in rooting out corruption, demons, and heretics.',
            25, 15, 2, 2,
            1, 2, 0, 0,
            'HP+25, DEF+2, ATK+2, MDEF+2', 'Orthodox clerics and magistrates open restricted archives; secretive occultists scatter in panic.', 'Disciplined crusader companions rally to your side; magical or non-human companions guard their secrets.', 'Demons and heretic cult leaders taunt your zeal, fighting to the death with fanatical ferocity.', '{"disposition": {"inquisition": 35, "guard": 20, "occultists": -35}, "companion_affinity": ["paladin", "cleric", "crusader"], "enemy_fanatic_clash": 25, "dialogue_tags": ["interrogation", "heresy_detection", "holy_inquest"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            19, 'Fey-Touched (Dream Strider)', 'fey_touched', '🦋', 'Wandered into an otherworldly fey crossing as a child, returning gifted with strange glamour and luck.',
            15, 25, 0, 1,
            2, 2, 2, 2,
            'MP+25, HP+15, MAG+2, SPD+2, LCK+2', 'Woodland sprites, fey emissaries, and eccentric bards find your aura delightfully intoxicating.', 'Companions benefit from your whimsical fey luck, gaining an extra 5% chance for critical strikes.', 'Fey beasts and illusory spirits cannot bewitch or charm you; nightmare demons are drawn to your essence.', '{"disposition": {"fey": 35, "bards": 25, "witch_hunters": -20}, "companion_affinity": ["fey", "sorcerer", "bard"], "enemy_charm_immunity": 100, "dialogue_tags": ["fey_glamour", "dream_weaving", "riddle_speech"]}'
        );
        

        INSERT INTO game_backgrounds (
            id, name, tag, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def,
            bonus_mo, bonus_md, bonus_speed, bonus_luck, bonus_str,
            npc_reaction, companion_reaction, enemy_reaction, reaction_json
        ) VALUES (
            20, 'Clockwork Engineer (Machinist)', 'machinist', '⚙️', 'Pioneering artificer of brass cogs, steam pistons, and galvanic cells, blending craft with machine logic.',
            20, 20, 1, 2,
            2, 1, 1, 1,
            'HP+20, MP+20, DEF+2, MAG+2', 'Inventors, gunsmiths, and academic engineers trade advanced blueprints and rare galvanic components.', 'Mechanical and construct companions gain +30% repair efficiency and stat calibrations.', 'Automaton sentries, mechanical drones, and clockwork bosses can be temporarily scrambled or hacked.', '{"disposition": {"inventors": 35, "machinists": 30, "primal_tribes": -15}, "companion_affinity": ["construct", "artificer", "forgeborn"], "enemy_automaton_hack": 30, "dialogue_tags": ["clockwork_diagnostics", "steam_overdrive", "galvanic_wiring"]}'
        );
        
TRUNCATE TABLE game_subclasses;

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            1, 1, 'Berserker', 'Frenzy Reaver', 'Channels raw battle wrath into unstoppable cleaves, sacrificing defense for relentless slaughter.',
            3, '🪓', 'Blood Frenzy', 'Attack power increases by up to 35% as health drops below maximum.', 'Whirlwind Cleave', '{"atk": 4, "hp": 20, "speed": 1}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            2, 1, 'Dreadnought', 'Iron Bulwark', 'Living fortress clad in impenetrable plate, holding the frontline against impossible odds.',
            3, '🛡️', 'Iron Bastion', 'Shield blocks absorb 30% additional damage and grant physical stun immunity.', 'Shield Fortress', '{"def": 5, "hp": 30, "md": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            3, 1, 'Weaponmaster', 'Blade Savant', 'Master of every martial weapon, executing lightning parries, disarms, and surgical counter-strikes.',
            3, '⚔️', 'Master of Arms', 'Critical strikes refund stamina and grant immediate bonus attacks.', 'Bladestorm', '{"atk": 3, "speed": 3, "luck": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            4, 1, 'Warlord', 'Battle Tactician', 'Commanding general whose tactical war cries bolster allies and break enemy battle lines.',
            3, '🚩', 'Tactical Command', 'All party members within 4 tiles gain +15% attack and +10% critical rate.', 'Rallying Battle Cry', '{"hp": 20, "def": 2, "mo": 2, "luck": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            5, 2, 'Oath of Retribution', 'Avenging Justiciar', 'Channels holy wrath to punish villains, returning damage taken with righteous fury.',
            3, '⚡', 'Vengeance Aura', 'Reflects 20% of all incoming melee damage as holy solar fire.', 'Wrathful Smite', '{"atk": 3, "mo": 3, "hp": 15}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            6, 2, 'Oath of the Aegis', 'Guardian Sentinel', 'Vows to stand between darkness and the innocent, taking wounds meant for allies.',
            3, '🛡️', 'Guardian Bulwark', 'Automatically intercepts 50% damage dealt to the lowest-health ally.', 'Bastion of Light', '{"def": 4, "hp": 25, "md": 3}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            7, 2, 'Oath of Redemption', 'Merciful Dawn', 'Brings salvation, peaceful warding, and immense restorative miracles to dying comrades.',
            3, '🕊️', 'Merciful Radiance', 'Healing spells grant the recipient a 3-turn protective radiant shield.', 'Lay on Hands (Ascended)', '{"mo": 4, "md": 3, "mp": 25}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            8, 2, 'Oath of the Eclipse', 'Twilight Crusader', 'Bends radiant holy and dark umbral energies, punishing oppressors from the shadows.',
            3, '🌑', 'Twilight Shroud', 'Attacks deal hybrid holy and shadow damage, siphoning 10% damage as MP.', 'Eclipse Slash', '{"atk": 2, "mo": 2, "speed": 2, "luck": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            9, 3, 'Juggernaut', 'Unstoppable Force', 'Brutal colossus that charges through enemy phalanxes, shattering shields and bone.',
            3, '🪨', 'Unstoppable Momentum', 'Completely immune to knockback, slow, and stun effects while raging.', 'Earthshaker Slam', '{"hp": 35, "atk": 3, "def": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            10, 3, 'Totemic Shaman', 'Spirit Conduit', 'Channels the ancient spirit guides of the Cave Bear, Eagle, and Dire Wolf.',
            3, '🐻', 'Spirit of the Bear', 'Gains +25% maximum HP and regenerates health each round.', 'Primal Roar', '{"hp": 30, "def": 3, "mo": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            11, 3, 'Storm Berserker', 'Tempest Rager', 'Infuses raging swings with superheated lightning, discharging chain static into swarms.',
            3, '🌩️', 'Static Discharge', 'Every melee strike shocks adjacent foes for 30% electrical splash damage.', 'Thunderous Leap', '{"atk": 3, "speed": 3, "mo": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            12, 3, 'Blood Rager', 'Crimson Frenzy', 'Feasts upon the carnage of battle, healing catastrophic wounds with every fallen enemy.',
            3, '🩸', 'Gore Feast', 'Critical hits restore 25% of damage inflicted as health.', 'Frenzied Rend', '{"atk": 4, "hp": 20, "speed": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            13, 4, 'Assassin', 'Shadow Executioner', 'Lethal unseen stalker specializing in first-strike decapitations and toxic envenoming.',
            3, '🗡️', 'Death Strike', 'Attacks from stealth guarantee critical hits that ignore 50% target defense.', 'Assassinate', '{"atk": 4, "speed": 3, "luck": 3}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            14, 4, 'Shadow Thief', 'Acrobatic Phantom', 'Elusive shadow who slips past locks and blades alike, vanishing in smoke.',
            3, '💨', 'Slip the Noose', 'Dodge chance increased by 20%; dodging drops a blinding smoke cloud.', 'Smoke Bomb Escape', '{"speed": 4, "luck": 4, "def": 1}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            15, 4, 'Duelist', 'Rapier Virtuoso', 'Fierce single-target sword dancer executing lightning parries and fatal thrusts.',
            3, '🤺', 'Riposte Mastery', 'Successfully parrying an attack instantly triggers a free counter-strike.', 'Flourish & Lunge', '{"atk": 3, "speed": 3, "def": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            16, 4, 'Arcane Trickster', 'Illusion Infiltrator', 'Weaves minor illusion glamours and telekinesis to baffle guards and strike from mirrors.',
            3, '🃏', 'Mirror Legerdemain', 'Spawns an illusionary decoy that draws enemy attacks for 2 turns.', 'Mirror Strike', '{"mo": 3, "mp": 20, "speed": 2, "luck": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            17, 5, 'Beastmaster', 'Pack Alpha', 'Forms a lifelong empathic bond with a savage predator, hunting in deadly concert.',
            3, '🐺', 'Pack Coordination', 'Animal companion inherits 40% of ranger''s stats and flanks targets.', 'Command Beast Frenzy', '{"hp": 20, "atk": 2, "speed": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            18, 5, 'Sharpshooter', 'Eagle-Eye Sniper', 'Pins targets to the ground from maximum range with pinpoint armor-piercing arrows.',
            3, '🏹', 'Deadly Range', 'Ranged attacks deal up to 40% more damage the further the target is.', 'Heartseeker Shot', '{"atk": 4, "luck": 3, "speed": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            19, 5, 'Gloom Tracker', 'Nightstalker', 'Prowls subterranean caves and pitch-black barrens, striking unseen before fading.',
            3, '👁️', 'Umbral Camouflage', 'Becomes fully invisible in shadows and gains night vision.', 'Shadow Ambush', '{"speed": 3, "atk": 3, "luck": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            20, 5, 'Trapper Warden', 'Hazard Saboteur', 'Controls the battlefield with explosive snares, caltrops, and paralyzing root vines.',
            3, '🪤', 'Perimeter Mastery', 'Traps deal 50% more damage and root caught targets for 2 turns.', 'Cluster Trap Detonation', '{"atk": 2, "def": 2, "luck": 3}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            21, 6, 'Way of Iron Knuckle', 'Bonebreaker', 'Hardens fists into living iron, shattering heavy shields and knocking foes unconscious.',
            3, '👊', 'Stone Stance', 'Unarmed blows break enemy armor guard and inflict physical concussion stuns.', 'Crushing Mountain Palm', '{"atk": 3, "def": 3, "hp": 15}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            22, 6, 'Way of Flowing Chi', 'Chi Master', 'Circulates spiritual ki energy to unleash projectile wave blasts and self-healing meditation.',
            3, '🌊', 'Chi Circulation', 'Landing multi-hit combos restores MP and clears negative status ailments.', 'Hadoken Palm Wave', '{"mo": 3, "mp": 25, "speed": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            23, 6, 'Way of the Shadow Fist', 'Silent Ninja', 'Blends martial acrobatics with shadow teleportation, paralyzing nerve points in silence.',
            3, '🥷', 'Shadow Step', 'Instantly teleports behind a target when initiating an unarmed strike.', 'Nerve Strike Paralyze', '{"speed": 4, "atk": 2, "luck": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            24, 6, 'Way of the Dragon Breath', 'Elemental Fist', 'Ignites knuckles with primal dragon flames, glacial frost, or crackling gale shocks.',
            3, '🐲', 'Dragon Aura', 'Cycles punches between Fire, Ice, and Lightning with explosive impact.', 'Dragon Breath Kick', '{"atk": 2, "mo": 2, "speed": 2, "hp": 10}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            25, 7, 'Pyromancer', 'Flame Evoker', 'Commands explosive infernos, incinerating entire legions with compounding burn dots.',
            3, '🔥', 'Conflagration', 'Fire spells cause targets to ignite, spreading burn patches on tick.', 'Meteor Swarm', '{"mo": 5, "mp": 25, "atk": 1}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            26, 7, 'Cryomancer', 'Frost Weaver', 'Encases the battlefield in perpetual winter, freezing enemies solid and shattering them.',
            3, '❄️', 'Glacial Shield', 'Surrounded by ice armor that freezes melee attackers in place.', 'Deep Freeze Shatter', '{"mo": 4, "def": 3, "mp": 20}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            27, 7, 'Arcanist', 'Aether Archmage', 'Manipulates raw, unaligned arcane force to pierce magical shields and tear space.',
            3, '🔮', 'Arcane Acceleration', 'Casting consecutive spells increases magic power by 10% per stack.', 'Arcane Annihilation Barrage', '{"mo": 5, "mp": 30, "speed": 1}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            28, 7, 'Invoker', 'Tri-Elementalist', 'Weaves fire, frost, and lightning together into catastrophic hybrid cataclysms.',
            3, '🌀', 'Elemental Fusion', 'Alternating distinct spell elements triggers devastating detonation bursts.', 'Cataclysm Nova', '{"mo": 4, "md": 2, "mp": 25, "luck": 1}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            29, 8, 'Chaos Conduit', 'Wild Surge Weaver', 'Channels unstable primordial chaos, risking reality tears for miraculous damage multipliers.',
            3, '🎲', 'Wild Surge', '15% chance for any spell to duplicate itself or trigger a chaotic bonus explosion.', 'Chaos Cascade', '{"mo": 4, "luck": 4, "mp": 20}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            30, 8, 'Dragonheart', 'Draconic Bloodline', 'Inherits ancestral dragon scale armor, ancient elemental breath, and primal resilience.',
            3, '🐉', 'Draconic Scales', 'Grants +25% natural physical armor and elemental resistance.', 'Draconic Breath Inferno', '{"hp": 25, "def": 3, "mo": 3}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            31, 8, 'Stormborn', 'Tempest Conduit', 'Born amid a planar thunderstorm, floating on wind currents and hurling crackling lightning.',
            3, '⚡', 'Gale Levitation', 'Immune to ground hazards and gains +20% movement speed.', 'Supercharged Thunderstrike', '{"speed": 3, "mo": 4, "mp": 20}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            32, 8, 'Aether Blood', 'Planar Phase Shifter', 'Carries planar void blood that allows phasing through attacks and warping battlefield geometry.',
            3, '🌌', 'Phase Warp', '20% chance to phase out of reality when struck, completely negating damage.', 'Aether Rift Pulse', '{"speed": 3, "md": 3, "mo": 3}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            33, 9, 'Hellfire Disciple', 'Brimstone Pact', 'Swore blood allegiance to an Archfiend, casting hellish fire and summoning demonic allies.',
            3, '🔥', 'Hellfire Mantle', 'Enemies slain by infernal fire refund 100% of the spell''s mana cost.', 'Hellfire Immolation', '{"mo": 4, "atk": 2, "mp": 20}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            34, 9, 'Void Caller', 'Aberrant Pact', 'Taps into eldritch terrors from beyond the stars, shattering enemy sanity with void tentacles.',
            3, '🐙', 'Gaze of the Abyss', 'Spells inflict psychic dread, reducing enemy attack and movement speed.', 'Eldritch Void Rift', '{"mo": 4, "md": 3, "mp": 25}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            35, 9, 'Soul Reaper', 'Grave Pact', 'Siphons the lingering souls of the dying into glowing soul jars to fuel protective shields.',
            3, '💀', 'Soul Harvest', 'Each slain foe yields a soul orb that absorbs incoming damage.', 'Soul Feast Drain', '{"hp": 20, "mo": 3, "md": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            36, 9, 'Star Pact', 'Cosmic Entity Pact', 'Contracts ancient stellar entities to call down gravitational pulses and cosmic radiants.',
            3, '⭐', 'Cosmic Gravity', 'Spells pull enemies into dense clusters, increasing AoE susceptibility.', 'Supernova Hex', '{"mo": 4, "luck": 3, "mp": 20}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            37, 10, 'Dread Reanimator', 'Lord of the Crypt', 'Commands permanent legions of skeletal warriors and reanimated ghoul champions.',
            3, '🦴', 'Undead Dominion', 'Summoned minions gain +30% health, attack, and resistance to holy smites.', 'Army of the Crypt', '{"mo": 4, "hp": 20, "mp": 25}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            38, 10, 'Soul Syphon', 'Vampiric Ghost', 'Phases between physical and ghost realms, siphoning life directly from enemy hearts.',
            3, '👻', 'Vampiric Conduit', 'Converts 30% of all magical damage dealt directly into character health.', 'Life Syphon Ray', '{"hp": 20, "mo": 4, "md": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            39, 10, 'Plague Lord', 'Rot Harbinger', 'Breeds virulent supernatural contagions that spread between foes and detonate rotting corpses.',
            3, '☣️', 'Virulent Bloom', 'Diseases jump to adjacent foes upon tick; corpses automatically detonate.', 'Corpse Explosion Cloud', '{"mo": 4, "luck": 2, "mp": 25}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            40, 10, 'Death Knight (Graveblade)', 'Bone Knight', 'Armored melee executioner wielding frost-runed two-handed greatswords and bone plate.',
            3, '🗡️', 'Unholy Carapace', 'Converts mana into bone plate armor shields when striking in melee.', 'Grave Strike Obliterate', '{"atk": 3, "def": 3, "hp": 20}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            41, 11, 'Radiant Arbiter', 'Solar Justiciar', 'Wields blistering holy solar beams to incinerate undead and blind evil combatants.',
            3, '☀️', 'Dawn''s Blindness', 'Holy spells blind enemy combatants for 1 turn, imposing 50% miss chance.', 'Solar Pillar Judgment', '{"mo": 4, "atk": 2, "md": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            42, 11, 'Life Warden', 'Sanctuary Healer', 'Fountain of rejuvenation, keeping entire teams alive through devastating boss attacks.',
            3, '🌿', 'Fountain of Vitality', 'Emits an aura that restores 5% max HP to all nearby allies every round.', 'Miracle of Resurrection', '{"hp": 20, "mo": 3, "mp": 30}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            43, 11, 'War Priest', 'Battle Apostle', 'Clad in blessed heavy plate, wading into combat with enchanted warhammers and zeal.',
            3, '🔨', 'Righteous Zeal', 'Weapon strikes scale directly with magical faith stat in place of strength.', 'Hammer of the Gods', '{"atk": 3, "def": 3, "hp": 15}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            44, 11, 'Sanctuary Hermit', 'Ward Inquisitor', 'Draws impenetrable holy circles, warding allies against curses, fear, and possession.',
            3, '🕯️', 'Aegis of Sanctuary', 'Allies inside your holy aura are completely immune to curses and fear.', 'Banishment Sanction', '{"md": 4, "def": 2, "mo": 2, "mp": 20}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            45, 12, 'Circle of the Feral', 'Primal Shapeshifter', 'Masters primal beast forms, shapeshifting into savage Dire Bears, Panthers, and Wyrms.',
            3, '🐾', 'Beast Form Mastery', 'Shapeshifted beast forms retain full equipment armor and stat bonuses.', 'Primal Savage Maul', '{"atk": 3, "hp": 25, "def": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            46, 12, 'Circle of Renewal', 'Grove Healer', 'Cultivates enchanted healing blooms and life-giving rains across the battlefield.',
            3, '🌸', 'Living Grove', 'Healing spells sprout rejuvenating flower fields that heal stepping allies.', 'Grove Blossom Miracle', '{"mo": 3, "mp": 30, "hp": 15}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            47, 12, 'Circle of Tempest', 'Storm Shaman', 'Commands nature''s fury, summoning gale hurricanes, hailstorms, and lightning barrages.',
            3, '⛈️', 'Stormwrath', 'Nature spells call down passive lightning strikes on adjacent targets.', 'Typhoon Gale Force', '{"mo": 4, "speed": 2, "mp": 20}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            48, 12, 'Circle of Rot & Spore', 'Symbiotic Decay', 'Inhabits the natural cycle of decay, releasing blinding toxic spores and fungal shields.',
            3, '🍄', 'Spore Infestation', 'Taking damage releases toxic fungal clouds that poison attackers.', 'Spore Cloud Detonation', '{"hp": 20, "def": 2, "mo": 3}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            49, 13, 'Frostblade', 'Glacial Spellsword', 'Enchants steel with sub-zero frostbite, freezing targets in place with every parry.',
            3, '❄️', 'Chilled Edge', 'Melee strikes chill enemies, reducing action speed by 30% and stacking frost.', 'Glacial Impale', '{"atk": 2, "mo": 2, "def": 2, "speed": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            50, 13, 'Pyreweaver', 'Flame Bladewright', 'Ignites dual blades into roaring arcs of white flame, leaving scorched trails of death.',
            3, '🔥', 'Ignited Arc', 'Weapon swings create fiery shockwaves that scorch all foes in a cone.', 'Molten Cleave', '{"atk": 3, "mo": 3, "hp": 10}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            51, 13, 'Aether Stalker', 'Blink Bladeweaver', 'Blinks through dimensional folds, delivering instant backstabs before enemies can react.',
            3, '✨', 'Blink Step Strike', 'Every melee attack teleports the user behind the target with bonus damage.', 'Dimensional Horizon Slash', '{"speed": 4, "atk": 2, "mo": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            52, 13, 'Runic Bulwark', 'Spell-Ward Knight', 'Etches glowing absorption sigils into shields and armor, feeding on hostile magic.',
            3, '🛡️', 'Spell Drain Ward', 'Absorbs 40% of all hostile magic damage and converts it to melee bonus damage.', 'Runic Discharge Strike', '{"def": 3, "md": 3, "hp": 15}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            53, 14, 'Crimson Reaver', 'Blood Scythe Berserker', 'Burns own blood to summon devastating jagged scythes, dealing astronomical critical spikes.',
            3, '🩸', 'Sanguine Frenzy', 'Attack power increases by 2% for every 1% of current health missing.', 'Crimson Blood Scythe', '{"atk": 4, "hp": 25, "speed": 1}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            54, 14, 'Sanguine Leech', 'Vampiric Drain Tank', 'Tethers arterial cords to all nearby enemies, continuously drinking their health.',
            3, '🧛', 'Blood Tether Aura', 'Constantly drains 4% max HP per round from all adjacent enemy targets.', 'Exsanguination Whirl', '{"hp": 30, "def": 2, "mo": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            55, 14, 'Blood Marionette', 'Hemotic Puppeteer', 'Seizes the arterial circulation of living targets, forcing enemies to butcher their own allies.',
            3, '🪆', 'Coagulation Lock', 'Enemies damaged by your spells have their action cooldowns delayed by 1 turn.', 'Puppet Strings Possession', '{"mo": 4, "md": 2, "speed": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            56, 14, 'Scarlet Weaver', 'Crystalline Sanguine Ward', 'Hardens spilled blood into ruby armor plates that deflect both blades and eldritch spells.',
            3, '💎', 'Carapace of Blood', 'Spilled blood forms hardened crystalline armor, granting bonus physical DEF.', 'Crystalline Blood Wall', '{"def": 4, "hp": 20, "md": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            57, 15, 'Siege Smith', 'Deployable Turret Master', 'Constructs automated Gatling turrets, mortar batteries, and tesla coils in the heat of battle.',
            3, '🏰', 'Deployable Foundry', 'Automatically deploys a clockwork defense turret upon entering combat.', 'Gatling Turret Deploy', '{"def": 3, "mo": 3, "hp": 15}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            58, 15, 'Alchemical Saboteur', 'Volatile Bombardier', 'Hurls pressurized acid vials, sticky napalm, and blinding phosphorescent flashbangs.',
            3, '🧪', 'Volatile Flasks', 'All throwing items and concoctions have 50% larger AoE and inflict burn/melt.', 'Acid Cluster Concoction', '{"mo": 3, "atk": 2, "luck": 3}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            59, 15, 'Exosuit Vanguard', 'Steam-Piston Pilot', 'Pilots a heavy brass exoskeleton armed with pneumatic piston fists and steam jets.',
            3, '🤖', 'Pneumatic Armor', 'Immune to physical stuns; melee strikes knock targets back 3 tiles.', 'Piston Smash Overdrive', '{"hp": 25, "def": 4, "atk": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            60, 15, 'Galvanic Machinist', 'Tesla Engineer', 'Powers magnetic shield drones and overcharged capacitors that stun metal-clad enemies.',
            3, '⚡', 'Overcharge Capacitor', 'Casting electrical skills builds a permanent shield barrier on the artificer.', 'EMP Capacitor Discharge', '{"mo": 3, "def": 2, "speed": 3}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            61, 16, 'Inquisitor', 'Anti-Mage Enforcer', 'Roots out spellcasters with silence glyphs, mana burns, and spell-dispelling steel.',
            3, '⚖️', 'Magebane Aura', 'Hostile mages within 4 tiles pay double mana and take backfire damage.', 'Silence Inscription Glyph', '{"atk": 3, "md": 3, "speed": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            62, 16, 'Purifier', 'Consecration Gunner', 'Loads heavy repeating crossbows with silver-blessed bolts and consecrated oil canisters.',
            3, '🏹', 'Silver Bolt Volley', 'Deals +35% bonus damage against fiends, undead, and cursed monsters.', 'Consecrated Firestorm', '{"atk": 4, "speed": 2, "luck": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            63, 16, 'Grim Occultist', 'Forbidden Hunter', 'Uses the dark tools of witches against them, setting eldritch banishment circles.',
            3, '🕯️', 'Eye for Weakness', 'Instantly reveals all monster elemental weaknesses and vulnerabilities.', 'Banishment Hex Seal', '{"mo": 3, "atk": 2, "luck": 3}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            64, 16, 'Exorcist Vanguard', 'Relic Executioner', 'Clad in heavy trench-coats and blessed steel plate, hunting supernatural horrors in close quarters.',
            3, '⚔️', 'Righteous Brand', 'Melee strikes permanently stagger aberrant and demonic entities.', 'Executioner''s Verdict', '{"atk": 3, "def": 3, "hp": 15}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            65, 17, 'Tempest Herald', 'Lightning Archon', 'Commands violent storms, calling down forked chain lightning that arcs across enemy lines.',
            3, '🌩️', 'Arcing Current', 'Lightning spells automatically chain to 3 additional targets with no falloff.', 'Chain Lightning Deluge', '{"mo": 4, "speed": 3, "mp": 20}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            66, 17, 'Skywarden', 'Gale Protector', 'Wreathes allies in impenetrable wind barriers that deflect ranged projectile attacks.',
            3, '💨', 'Gale Wind Shield', 'Grants party a 50% deflection chance against all incoming ranged projectiles.', 'Gale Force Barrier', '{"def": 3, "md": 3, "hp": 15}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            67, 17, 'Vortex Mage', 'Gravitational Cyclone', 'Spawns churning mini-tornadoes that drag enemies into the eye of the vortex.',
            3, '🌀', 'Singularity Pull', 'Spells pull all affected enemies inward, stunning them for 1 turn.', 'Vortex Cyclone Whirlpool', '{"mo": 4, "luck": 2, "mp": 25}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            68, 17, 'Static Striker', 'Storm Blade', 'Channels voltage directly into polearms and blades, delivering stunning thunderstrikes.',
            3, '⚡', 'Supercharged Blade', 'Melee hits build static voltage, discharging an electric stun burst at 3 stacks.', 'Thunderstrike Cleave', '{"atk": 3, "mo": 2, "speed": 3}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            69, 18, 'Nightblade', 'Shadow Clone Duelist', 'Creates solid umbral mirror clones that mimic every sword slash simultaneously.',
            3, '👥', 'Shadow Mirroring', 'Shadow clones mimic all attacks, dealing 40% duplicate damage.', 'Phantom Blade Flurry', '{"atk": 3, "speed": 4, "luck": 1}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            70, 18, 'Twilight Weaver', 'Penumbral Phase Walker', 'Slips seamlessly between the material realm and the shadow plane to ignore damage.',
            3, '🌑', 'Penumbral Veil', '25% passive chance to phase into the shadow realm, dodging any lethal hit.', 'Shadow Step Ambush', '{"speed": 4, "def": 2, "luck": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            71, 18, 'Umbral Assassin', 'Choking Garrote', 'Strikes from the blind spot with silent garrotes and shadow-infused poisoned daggers.',
            3, '🗡️', 'Blind Spot Execution', 'Attacks from behind ignore 60% armor and cause severe hemorrhaging.', 'Umbral Garrote Choke', '{"atk": 4, "speed": 3, "luck": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            72, 18, 'Eclipse Dancer', 'Whirling Blade Acrobat', 'Performs an acrobatic ribbon dance of obsidian razors, severing tendons with artistic grace.',
            3, '💃', 'Whirling Momentum', 'Moving across the battlefield stacks critical strike chance up to +30%.', 'Razor Dance Torrent', '{"speed": 4, "atk": 2, "luck": 3}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            73, 19, 'Riftwalker', 'Temporal Rewinder', 'Manipulates the flow of personal time, rewinding lethal wounds and undoing mistakes.',
            3, '⏳', 'Temporal Rewind', 'Taking fatal damage rewinds the user''s HP to its state at the start of the turn.', 'Time Slip Reversal', '{"hp": 20, "speed": 3, "mo": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            74, 19, 'Entropy Weaver', 'Decay Accelerant', 'Fast-forwards time on living flesh and metal, rapidly rusting armor and withering vitality.',
            3, '⌛', 'Accelerated Entropy', 'Attacks apply accelerated decay, eating away at target armor and health.', 'Entropic Wither Burst', '{"mo": 4, "atk": 2, "mp": 20}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            75, 19, 'Time Warden', 'Chronos Haste Master', 'Accelerates ally reaction speeds while trapping enemies inside frozen time dilation bubbles.',
            3, '🕰️', 'Chrono Haste Field', 'All allies gain +25% turn action speed and movement range.', 'Time Dilation Freeze', '{"speed": 4, "mo": 3, "mp": 20}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            76, 19, 'Chrono-Blade', 'Echo Strike Swordsman', 'Attacks with temporal echoes that repeat every blade strike across multiple timelines.',
            3, '⚔️', 'Temporal Echo', 'Every melee attack echoes 0.5 seconds later for an extra 45% true damage hit.', 'Chrono Flurry Multistrike', '{"atk": 3, "speed": 3, "mo": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            77, 20, 'Detonation Scribe', 'Chain Rune Saboteur', 'Inscribes reactive floor runes that detonate in devastating cascading chain explosions.',
            3, '💥', 'Chain Reaction', 'When one rune detonates, all adjacent runes detonate with +20% bonus damage.', 'Detonation Sigil Cascade', '{"mo": 4, "atk": 2, "mp": 20}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            78, 20, 'Sanctum Weaver', 'Barrier Architect', 'Erects glowing magical barriers and impenetrable sigil domes that absorb all incoming siege damage.',
            3, '🛡️', 'Aegis Sanctuary Dome', 'Allies standing within inscribed circles take 40% less incoming damage.', 'Sanctuary Dome Shield', '{"def": 4, "md": 4, "hp": 15}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            79, 20, 'Binding Runemaster', 'Gravitational Glyph Binder', 'Lays runic snares that anchor targets to the ground, preventing teleportation and movement.',
            3, '🪢', 'Runic Tethering', 'Enemies crossing runes are chained to the floor, rooted for 2 rounds.', 'Gravitational Bind Glyph', '{"mo": 3, "def": 2, "speed": 2, "luck": 2}'
        );
        

        INSERT INTO game_subclasses (
            id, class_id, name, archetype_title, description, level_req, icon,
            passive_name, passive_desc, signature_ability, stat_bonuses
        ) VALUES (
            80, 20, 'Rune Knight', 'Inscribed Steel Vanguard', 'Etches permanent protective sigils into heavy armor and steel, erupting when struck.',
            3, '🗡️', 'Carapace Sigils', 'Taking physical hits triggers a retaliatory elemental shockwave.', 'Runic Overload Cleave', '{"atk": 3, "def": 3, "mo": 2, "hp": 15}'
        );
        