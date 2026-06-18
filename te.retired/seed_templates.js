// =================================================================
// SEED TEMPLATES — Run once to insert the 3 starter templates
// Usage: node seed_templates.js
// =================================================================

const templates = [
    // ── 1. DARK CELTIC FANTASY (Default Twisted Engine theme) ──────
    {
        name: 'celtic_fantasy',
        label: 'Dark Celtic Fantasy',
        icon: '🗡️',
        description: 'A dark world of ancient druids, blood oghams, and warring clans. Inspired by Celtic mythology, with twisted creatures lurking in the mists.',
        author: 'Twisted Engine',
        is_default: 1,
        terminology: {
            ki: { display_name: 'Druidic Spirit', icon: '🌀', description: 'The old power that flows through standing stones.' },
            mp: { display_name: 'Mana', icon: '💧', description: 'Magical energy drawn from the ley lines.' },
            channel_ki: { display_name: 'Spirit Eruption', icon: '🌀', description: 'Channel the raw energy of the land.' },
            alignment: { display_name: 'Druidic Balance', icon: '☯️', description: 'The balance between light and shadow.' },
            afterlife: { display_name: 'The Otherworld', icon: '🌙', description: 'Where spirits dwell between lives.' },
            sig_tech: { display_name: 'Blood Technique', icon: '🩸', description: 'A technique forged from your own essence.' },
            spell_slots: { display_name: 'Ritual Charges', icon: '📿', description: 'Power stored in carved oghams.' },
            summon: { display_name: 'Spirit Summon', icon: '👻', description: 'Call a bound spirit from the Otherworld.' },
            transform: { display_name: 'Wild Shape', icon: '🐺', description: 'Take the form of a beast or spirit.' },
            fighting_style: { display_name: 'War Art', icon: '⚔️', description: 'Ancient combat traditions passed through clans.' },
            tournament: { display_name: 'The Great Trial', icon: '🏆', description: 'Prove your worth in ritual combat.' },
        },
        settings: {
            game_title: 'Twisted Engine',
            game_subtitle: 'Dark Celtic Fantasy RPG',
        },
        battle_config: {
            enable_limb_targeting: 'true', enable_active_defense: 'true', enable_nonlethal: 'true',
            enable_wound_degradation: 'true', enable_ki_channeling: 'true', enable_fighting_styles: 'true',
            enable_signature_techs: 'true', enable_rp_descriptions: 'true', enable_battle_narration: 'true',
            enable_rp_commands: 'true', enable_alignment_system: 'true', enable_afterlife: 'true',
            enable_elemental_reactions: 'true', enable_boss_phases: 'true', enable_summons: 'true',
            enable_weather_effects: 'true', enable_stealth: 'true', enable_transformations: 'true',
        },
        classes: [
            { name: 'Warrior', icon: '⚔️', description: 'Frontline fighter. High HP and ATK.', base_hp: 120, base_mp: 30, base_atk: 14, base_def: 10, base_mo: 3, base_md: 5, base_speed: 6, base_luck: 4 },
            { name: 'Mage', icon: '🔮', description: 'Arcane spellcaster. High MO and MP.', base_hp: 70, base_mp: 100, base_atk: 4, base_def: 4, base_mo: 15, base_md: 10, base_speed: 5, base_luck: 6 },
            { name: 'Rogue', icon: '🗡️', description: 'Swift and cunning. High Speed and Luck.', base_hp: 85, base_mp: 50, base_atk: 10, base_def: 6, base_mo: 5, base_md: 5, base_speed: 14, base_luck: 10 },
            { name: 'Cleric', icon: '✨', description: 'Holy healer. High MO and MD.', base_hp: 90, base_mp: 80, base_atk: 6, base_def: 8, base_mo: 12, base_md: 12, base_speed: 5, base_luck: 7 },
        ],
        races: [
            { name: 'Human', icon: '🧑', description: 'Versatile and adaptive. Balanced stats.', bonus_hp: 5, bonus_luck: 3 },
            { name: 'Fae-Touched', icon: '🧝', description: 'Otherworldly grace. High magic, fragile.', bonus_mo: 5, bonus_md: 3, bonus_hp: -10, bonus_speed: 3 },
            { name: 'Dwarf', icon: '⛏️', description: 'Stout and resilient. High defense.', bonus_hp: 15, bonus_def: 5, bonus_speed: -3 },
            { name: 'Woad-Painted', icon: '💀', description: 'Fierce tribal warriors. High ATK, low magic defense.', bonus_atk: 5, bonus_speed: 3, bonus_md: -3 },
        ],
        items: [
            { name: 'Iron Sword', icon: '🗡️', type: 'weapon', rarity: 'common', value: 50, equip_slot: 'weapon' },
            { name: 'Oak Staff', icon: '🪄', type: 'weapon', rarity: 'common', value: 45, equip_slot: 'weapon' },
            { name: 'Leather Armor', icon: '🧥', type: 'armor', rarity: 'common', value: 40, equip_slot: 'body' },
            { name: 'Health Potion', icon: '🧪', type: 'consumable', rarity: 'common', value: 20 },
            { name: 'Mana Tonic', icon: '💧', type: 'consumable', rarity: 'common', value: 25 },
        ],
        maps: [
            { name: 'Tara Village', description: 'A small settlement at the base of the Hill of Tara.', width: 20, height: 20, min_level: 1 },
            { name: 'Darkwood Forest', description: 'Ancient trees twisted by shadow. Beware what lurks.', width: 25, height: 25, min_level: 3 },
            { name: 'The Standing Stones', description: 'A circle of power where the veil is thin.', width: 15, height: 15, min_level: 5 },
        ],
        npcs: [
            { name: 'Elder Brigid', icon: '👵', persona: 'A wise druid elder who guides newcomers.', is_enemy: 0, map_id: 1, x: 10, y: 10, is_master: 1 },
            { name: 'Shadow Wolf', icon: '🐺', persona: 'A corrupted beast prowling the forest edge.', is_enemy: 1, map_id: 2, x: 12, y: 8 },
            { name: 'Merchant Cian', icon: '🧔', persona: 'A traveling merchant with rare wares.', is_enemy: 0, map_id: 1, x: 7, y: 12 },
        ],
        styles: [
            { name: 'iron_fist', label: 'Iron Fist', icon: '👊', style_type: 'offensive', description: 'Raw striking power from the war camps.' },
            { name: 'shadow_step', label: 'Shadow Step', icon: '💨', style_type: 'defensive', description: 'Evasive Fae-touched combat arts.' },
        ],
    },

    // ── 2. SCI-FI SPACE OPERA ─────────────────────────────────────
    {
        name: 'scifi_opera',
        label: 'Sci-Fi Space Opera',
        icon: '🚀',
        description: 'Explore the galaxy, command starships, and master plasma weapons. A space adventure with alien races and cosmic powers.',
        author: 'Twisted Engine',
        is_default: 0,
        terminology: {
            hp: { display_name: 'Shield Points', icon: '🛡️', description: 'Energy shields protecting you.' },
            mp: { display_name: 'Energy', icon: '⚡', description: 'Power cell charge for abilities.' },
            ki: { display_name: 'Psi Energy', icon: '🧠', description: 'Psychic energy from neural amplifiers.' },
            atk: { display_name: 'Firepower', icon: '🔫', description: 'Weapon damage output.' },
            def: { display_name: 'Armor', icon: '🛡️', description: 'Damage absorption rating.' },
            mo: { display_name: 'Psi Power', icon: '🧠', description: 'Psychic ability strength.' },
            md: { display_name: 'Psi Shield', icon: '🔮', description: 'Psychic defense rating.' },
            channel_ki: { display_name: 'Overcharge', icon: '⚡', description: 'Push your reactor to maximum output.' },
            alignment: { display_name: 'Faction Standing', icon: '⚖️', description: 'Your reputation across factions.' },
            afterlife: { display_name: 'Clone Bay', icon: '🧬', description: 'Where your backup clone activates.' },
            sig_tech: { display_name: 'Custom Mod', icon: '🔧', description: 'Your personal weapon modification.' },
            spell_slots: { display_name: 'Ammo Clips', icon: '🔋', description: 'Limited special ammunition.' },
            summon: { display_name: 'Deploy Drone', icon: '🤖', description: 'Activate a combat drone.' },
            transform: { display_name: 'Power Armor', icon: '🦾', description: 'Activate your mech suit.' },
            fighting_style: { display_name: 'Combat Protocol', icon: '📡', description: 'Trained combat subroutines.' },
            tournament: { display_name: 'Arena Championship', icon: '🏟️', description: 'Galactic combat tournament.' },
            gold: { display_name: 'Credits', icon: '💳', description: 'Universal currency.' },
            experience: { display_name: 'Data Points', icon: '📊', description: 'Experience accumulated from missions.' },
        },
        battle_config: {
            enable_limb_targeting: 'true', enable_active_defense: 'true', enable_nonlethal: 'true',
            enable_spell_slots: 'true', summon_cost_type: 'spell_slot',
            enable_stealth: 'true', enable_transformations: 'true',
            enable_elemental_reactions: 'false', enable_weather_effects: 'false',
        },
        classes: [
            { name: 'Soldier', icon: '🔫', description: 'Frontline combatant. Heavy armor and firepower.', base_hp: 120, base_mp: 40, base_atk: 14, base_def: 10, base_mo: 3, base_md: 4, base_speed: 6, base_luck: 3 },
            { name: 'Engineer', icon: '🔧', description: 'Tech specialist. Drones and gadgets.', base_hp: 90, base_mp: 70, base_atk: 8, base_def: 6, base_mo: 10, base_md: 8, base_speed: 7, base_luck: 5 },
            { name: 'Psion', icon: '🧠', description: 'Psychic operative. Mind over matter.', base_hp: 70, base_mp: 100, base_atk: 4, base_def: 4, base_mo: 16, base_md: 12, base_speed: 5, base_luck: 6 },
            { name: 'Infiltrator', icon: '🥷', description: 'Stealth specialist. Strike from shadows.', base_hp: 80, base_mp: 60, base_atk: 12, base_def: 5, base_mo: 5, base_md: 5, base_speed: 14, base_luck: 10 },
        ],
        races: [
            { name: 'Human', icon: '🧑', description: 'Adaptable colonists. Balanced stats.', bonus_hp: 5, bonus_luck: 3 },
            { name: 'Zephyran', icon: '👽', description: 'Tall, elegant aliens with psychic gifts.', bonus_mo: 5, bonus_md: 5, bonus_hp: -10 },
            { name: 'Krell', icon: '🦎', description: 'Reptilian warriors. Tough and strong.', bonus_hp: 15, bonus_atk: 5, bonus_speed: -3, bonus_mo: -3 },
            { name: 'Synth', icon: '🤖', description: 'Synthetic humanoid. High speed, no magic.', bonus_speed: 8, bonus_def: 3, bonus_mo: -5, bonus_md: -5 },
        ],
        items: [
            { name: 'Plasma Pistol', icon: '🔫', type: 'weapon', rarity: 'common', value: 100, equip_slot: 'weapon' },
            { name: 'Energy Shield', icon: '🛡️', type: 'armor', rarity: 'common', value: 80, equip_slot: 'body' },
            { name: 'Medkit', icon: '🩹', type: 'consumable', rarity: 'common', value: 30 },
            { name: 'Energy Cell', icon: '🔋', type: 'consumable', rarity: 'common', value: 25 },
        ],
        maps: [
            { name: 'Station Alpha', description: 'A bustling space station on the frontier.', width: 20, height: 20, min_level: 1 },
            { name: 'Derelict Freighter', description: 'An abandoned cargo ship. Something still moves inside.', width: 18, height: 12, min_level: 3 },
            { name: 'Alien Ruins', description: 'Ancient structures on an uncharted world.', width: 22, height: 22, min_level: 5 },
        ],
        npcs: [
            { name: 'Commander Vex', icon: '👨‍✈️', persona: 'Station commander. Gives missions to new recruits.', is_enemy: 0, map_id: 1, x: 10, y: 10, is_master: 1 },
            { name: 'Rogue Drone', icon: '🤖', persona: 'A malfunctioning security drone.', is_enemy: 1, map_id: 2, x: 8, y: 5 },
        ],
    },

    // ── 3. ANIME FIGHTER (DBZ / Mado inspired) ────────────────────
    {
        name: 'anime_fighter',
        label: 'Anime Fighter',
        icon: '⚡',
        description: 'Power up, train under masters, and clash in epic battles! Inspired by Dragon Ball Z, Naruto, and classic anime fighters.',
        author: 'Twisted Engine (Planet Mado tribute)',
        is_default: 0,
        terminology: {
            hp: { display_name: 'Vitality', icon: '❤️', description: 'Your life force.' },
            mp: { display_name: 'Ki', icon: '🔥', description: 'Inner energy for powerful techniques.' },
            ki: { display_name: 'Ki', icon: '🔥', description: 'The power within all living things.' },
            atk: { display_name: 'Power', icon: '💪', description: 'Physical striking force.' },
            def: { display_name: 'Endurance', icon: '🛡️', description: 'Ability to withstand hits.' },
            mo: { display_name: 'Ki Control', icon: '✨', description: 'Energy blast potency.' },
            md: { display_name: 'Ki Defense', icon: '🌀', description: 'Resistance to energy attacks.' },
            speed: { display_name: 'Speed', icon: '💨', description: 'Movement and reaction time.' },
            level: { display_name: 'Power Level', icon: '📊', description: 'Overall combat rating.' },
            gold: { display_name: 'Zeni', icon: '💰', description: 'Money.' },
            channel_ki: { display_name: 'Power Up', icon: '🔥', description: 'Unleash your full power!' },
            alignment: { display_name: 'Alignment', icon: '⚖️', description: 'Good vs Evil.' },
            afterlife: { display_name: 'Other World', icon: '☁️', description: 'Train under King Kai or explore Hell.' },
            sig_tech: { display_name: 'Signature Move', icon: '⚡', description: 'Your own unique technique!' },
            spell_slots: { display_name: 'Ki Reserves', icon: '🔋', description: 'Stored energy for powerful moves.' },
            summon: { display_name: 'Call Ally', icon: '📣', description: 'Call a fighter to your aid.' },
            transform: { display_name: 'Transformation', icon: '⭐', description: 'Ascend to a new form!' },
            fighting_style: { display_name: 'Martial Art', icon: '🥋', description: 'Your fighting discipline.' },
            tournament: { display_name: 'World Tournament', icon: '🏆', description: 'The greatest fighters compete!' },
            limb_targeting: { display_name: 'Body Targeting', icon: '🎯', description: 'Aim for specific body parts.' },
            nonlethal: { display_name: 'Knock Out', icon: '💫', description: 'Defeat without killing.' },
        },
        battle_config: {
            enable_limb_targeting: 'true', enable_active_defense: 'true', enable_nonlethal: 'true',
            enable_ki_channeling: 'true', enable_fighting_styles: 'true',
            enable_signature_techs: 'true', enable_rp_descriptions: 'true',
            enable_combo_procs: 'true', enable_diminishing_returns: 'true',
            enable_transformations: 'true', enable_afterlife: 'true',
            enable_tournaments: 'true', enable_training_system: 'true',
            enable_spell_slots: 'false', summon_cost_type: 'mp',
            enable_weather_effects: 'false', enable_stealth: 'false',
            ki_channel_duration: '5', ki_channel_crash_pct: '0.50',
        },
        classes: [
            { name: 'Martial Artist', icon: '🥋', description: 'Master of hand-to-hand combat.', base_hp: 110, base_mp: 60, base_atk: 12, base_def: 8, base_mo: 8, base_md: 6, base_speed: 10, base_luck: 5 },
            { name: 'Ki Warrior', icon: '🔥', description: 'Channels devastating energy blasts.', base_hp: 90, base_mp: 90, base_atk: 8, base_def: 6, base_mo: 14, base_md: 10, base_speed: 7, base_luck: 5 },
            { name: 'Speed Fighter', icon: '💨', description: 'Too fast to hit. Strikes before you blink.', base_hp: 80, base_mp: 50, base_atk: 10, base_def: 5, base_mo: 6, base_md: 5, base_speed: 16, base_luck: 8 },
            { name: 'Tank', icon: '🛡️', description: 'Absorbs everything. Hits like a truck.', base_hp: 150, base_mp: 40, base_atk: 13, base_def: 14, base_mo: 4, base_md: 8, base_speed: 4, base_luck: 3 },
        ],
        races: [
            { name: 'Human', icon: '🧑', description: 'Determined fighters. Gain power through sheer will.', bonus_hp: 5, bonus_luck: 5 },
            { name: 'Saiyan', icon: '🦁', description: 'Born warriors. Gain power from every defeat.', bonus_atk: 5, bonus_speed: 3, bonus_hp: -5 },
            { name: 'Namekian', icon: '🐸', description: 'Wise and regenerative. Can meditate to grow stronger.', bonus_mo: 5, bonus_md: 5, bonus_hp: 10 },
            { name: 'Android', icon: '🤖', description: 'Infinite energy. Cannot train normally — absorbs power from defeated foes.', bonus_atk: 3, bonus_def: 3, bonus_speed: 3, bonus_mo: -5 },
        ],
        items: [
            { name: 'Senzu Bean', icon: '🫘', type: 'consumable', rarity: 'rare', value: 500 },
            { name: 'Weighted Clothing', icon: '🏋️', type: 'armor', rarity: 'uncommon', value: 200, equip_slot: 'body' },
            { name: 'Power Pole', icon: '🏑', type: 'weapon', rarity: 'rare', value: 300, equip_slot: 'weapon' },
            { name: 'Scouter', icon: '📡', type: 'accessory', rarity: 'uncommon', value: 150, equip_slot: 'amulet' },
        ],
        maps: [
            { name: 'Kame House Island', description: 'A small island where legendary masters train warriors.', width: 15, height: 15, min_level: 1 },
            { name: 'Wasteland Arena', description: 'A barren landscape perfect for all-out battles.', width: 20, height: 20, min_level: 3 },
            { name: 'King Kai\'s Planet', description: 'A tiny planet with 10x gravity. Train here to grow powerful.', width: 10, height: 10, min_level: 10 },
        ],
        npcs: [
            { name: 'Master Roshi', icon: '👴', persona: 'An ancient martial arts master. Eccentric but powerful.', is_enemy: 0, map_id: 1, x: 7, y: 7, is_master: 1 },
            { name: 'Saibaman', icon: '🌱', persona: 'A plant creature bred for combat.', is_enemy: 1, map_id: 2, x: 10, y: 10 },
            { name: 'King Kai', icon: '👑', persona: 'The lord of the North Galaxy. Trains the worthy.', is_enemy: 0, map_id: 3, x: 5, y: 5, is_master: 1 },
        ],
        styles: [
            { name: 'turtle_school', label: 'Turtle School', icon: '🐢', style_type: 'balanced', description: 'The foundation of all martial arts.' },
            { name: 'crane_school', label: 'Crane School', icon: '🦅', style_type: 'offensive', description: 'Aggressive aerial techniques.' },
        ],
    },
];

// Installer script
async function seedTemplates() {
    const mysql = require('mysql2/promise');
    const dotenv = require('dotenv');
    dotenv.config();

    const db = await mysql.createPool({
        host: process.env.DB_HOST, user: process.env.DB_USER,
        password: process.env.DB_PASS, database: process.env.DB_NAME,
        charset: 'utf8mb4'
    });

    for (const t of templates) {
        try {
            await db.query(
                `INSERT INTO game_templates (name, label, icon, description, author, is_default,
                    terminology_json, settings_json, classes_json, races_json, items_json,
                    skills_json, maps_json, npcs_json, battle_config_json, styles_json)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE label=VALUES(label), description=VALUES(description),
                    terminology_json=VALUES(terminology_json), settings_json=VALUES(settings_json),
                    classes_json=VALUES(classes_json), races_json=VALUES(races_json),
                    items_json=VALUES(items_json), maps_json=VALUES(maps_json),
                    npcs_json=VALUES(npcs_json), battle_config_json=VALUES(battle_config_json),
                    styles_json=VALUES(styles_json)`,
                [t.name, t.label, t.icon, t.description, t.author, t.is_default || 0,
                 JSON.stringify(t.terminology || {}), JSON.stringify(t.settings || {}),
                 JSON.stringify(t.classes || []), JSON.stringify(t.races || []),
                 JSON.stringify(t.items || []), JSON.stringify(t.skills || []),
                 JSON.stringify(t.maps || []), JSON.stringify(t.npcs || []),
                 JSON.stringify(t.battle_config || {}), JSON.stringify(t.styles || [])]
            );
            console.log(`✅ Seeded template: ${t.label}`);
        } catch (e) {
            console.error(`❌ Error seeding ${t.name}:`, e.message);
        }
    }

    await db.end();
    console.log('Done!');
}

seedTemplates();
