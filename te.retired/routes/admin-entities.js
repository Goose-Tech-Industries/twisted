// =================================================================
// ADMIN PANEL — Generic Entity CRUD Sub-Router
// ENTITY_TABLE_MAP, list/get/create/update/delete for all entity types,
// terminology routes, trash/restore, dependencies checker, webhooks
// =================================================================
const express = require('express');
const router  = express.Router();
let db, io;

router.init = (database, ioInstance) => { db = database; io = ioInstance; };

// ── Auth ──────────────────────────────────────────────────────────
async function requireStaff(req, res, next) {
    const userId = req.session && req.session.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Login required' });
    const [rows] = await db.query('SELECT role FROM users WHERE id=? LIMIT 1', [userId]);
    if (!rows.length) return res.status(401).json({ success: false, message: 'User not found' });
    const role = rows[0].role;
    if (!['ADMIN','GM','MOD','STAFF','OWNER'].includes(role))
        return res.status(403).json({ success: false, message: 'Staff only' });
    req.staffRole = role;
    next();
}

// ── Event Log Helper ─────────────────────────────────────────────
async function logEvent(type, actorId, actorName, targetId, targetName, detail = {}, mapId = null) {
    try {
        await db.query(
            `INSERT INTO game_event_log (event_type,actor_id,actor_name,target_id,target_name,detail_json,map_id)
             VALUES (?,?,?,?,?,?,?)`,
            [type, actorId||null, actorName||null, targetId||null, targetName||null,
             JSON.stringify(detail), mapId||null]
        );
    } catch(e) { /* non-fatal */ }
}

// =================================================================
// ENTITY TABLE MAP
// =================================================================
const ENTITY_TABLE_MAP = {
    // ── original types ────────────────────────────────────────────
    item: 'game_items', skill: 'game_skills', npc: 'game_npcs',
    map: 'game_maps', quest: 'quest_definitions', class: 'game_classes',
    race: 'game_races', ogham: 'game_oghams', ogham_family: 'game_ogham_families',
    shop: 'game_shops', arena: 'game_arenas', artifact: 'legendary_artifacts',
    status: 'game_statuses', feat: 'game_feats', loot_table: 'game_loot_tables',
    spawn: 'game_map_spawns', battle_cmd: 'game_battle_commands', background: 'game_backgrounds',
    // ── added for React admin panels ──────────────────────────────
    stat:           'game_stat_definitions',
    shop_supply:    'game_shop_supplies',
    artifact_power: 'artifact_powers',
    quest_board:    'game_quest_board',
    region:         'game_regions',
    faction:        'factions',
    scheduled_task: 'game_scheduled_tasks',
    craft_recipe:   'game_craft_recipes',
    auction_listing:'auction_listings',
    limit:          'game_limit_breaks',
    // ── Session 8: Limb Targeting / Combat Options ──────────────────
    body_type:      'game_body_types',
    limb_zone:      'game_limb_zones',
    battle_knockout:'game_battle_knockouts',
    // ── Session 9: Flavor Text / Combo ─────────────────────────────
    flavor_text:    'game_flavor_texts',
    flavor_keyword: 'game_flavor_keywords',
    // ── Session 10: Ki Channeling / Bleed ──────────────────────────
    bleed_tier:     'game_bleed_tiers',
    // ── Session 11: Signature Techniques ───────────────────────────
    sig_level:      'game_signature_levels',
    sig_ability:    'game_signature_abilities',
    sig_tech:       'character_signature_techs',
    // ── Fighting Styles ───────────────────────────────────────────
    // ── Tournaments ───────────────────────────────────────────────
    // ── Boss Phases / Win Conditions ──────────────────────────────
    // ── Final Systems ─────────────────────────────────────────────
    // ── Alignment + Battle Rules ──────────────────────────────────
    // ── Training ──────────────────────────────────────────────────
    autotile_group: 'game_autotile_groups',
    template:       'game_templates',
    terminology:    'game_terminology',
    training_config:'game_training_config',
    alignment_tier: 'game_alignment_tiers',
    alignment_action:'game_alignment_actions',
    battle_rule:    'game_battle_rules',
    elem_reaction:  'game_elemental_reactions',
    status_combo:   'game_status_combos',
    afterlife:      'game_afterlife_worlds',
    death_penalty:  'game_death_penalties',
    transformation: 'game_transformations',
    link_attack:    'game_link_attacks',
    trap:           'game_battle_traps',
    weather:        'game_weather_effects',
    boss_phase:     'game_boss_phases',
    win_condition:  'game_win_conditions',
    quest_battle_override: 'game_quest_battle_overrides',
    tournament:     'game_tournaments',
    tourney_match:  'game_tournament_matches',
    tourney_history:'game_tournament_history',
    fighting_style: 'game_fighting_styles',
    style_rank:     'game_fighting_style_ranks',
    char_style:     'character_fighting_styles',
    narration:      'game_battle_narrations',
    premade_sig:    'game_premade_sig_techs',
    training_log:   'game_master_training_log',
    // ── Ability Scores (data-driven) ────────────────────────────────
    region_weather: 'game_region_weather',
    npc_patrol:     'game_npc_patrols',
    world_event:    'game_world_events',
    spawn_wave:     'game_spawn_waves',
    region_rep_gate:'game_region_rep_gates',
    ability_score:  'game_ability_scores',
    ability_effect: 'game_ability_effects',
    race_ability_bonus: 'game_race_ability_bonuses',
    class_ability_bonus: 'game_class_ability_bonuses',
    bg_ability_bonus: 'game_background_ability_bonuses',
    race_class_access: 'game_race_class_access',
    level_req:      'level_requirements',
    script:         'game_scripts',
    item_set:       'game_item_sets',
    npc_schedule:   'game_npc_schedules',
    enemy_scaling:  'game_enemy_scaling',
    subclass:       'game_subclasses',
    racial_ability: 'game_racial_abilities',
    class_mastery:  'game_class_mastery',
    stat_cap:       'game_stat_caps',
    title:          'game_titles',
    char_transform: 'character_transformations',
    arena_match:    'game_arena_matches',
    arena_ranking:  'game_arena_rankings',
    combo_chain:    'game_combo_chains',
    summon:         'game_summons',
    battle_replay:  'game_battle_replays',
    arena_season:   'game_arena_seasons',
    map_hazard:     'game_map_hazards',
    status_immunity:'game_status_immunities',
    referral:       'game_referrals',
    battle_template:'game_battle_templates',
    staff_activity: 'staff_activity_log',
    shift_note:     'staff_shift_notes',
    auto_mod_rule:  'game_auto_mod_rules',
    player_warning: 'player_warnings',
    staff_perm:     'staff_permissions',
    broadcast_tmpl: 'staff_broadcast_templates',
    player_appeal:  'player_appeals',
    staff_audit:    'staff_audit_log',
    config_snapshot:'game_config_snapshots',
    config_profile: 'game_config_profiles',
    settings_log:   'settings_change_log',
    ogham_awakening:'game_ogham_awakenings',
    spell_tome:     'game_spell_tomes',
    elem_affinity:  'game_elemental_affinities',
    item_curse:     'game_item_curses',
    ogham_fusion:   'game_ogham_fusions',
    ogham_shard:    'game_ogham_shards',
    shard_recipe:   'game_shard_recipes',
    corruption_tier:'game_ogham_corruption_tiers',
    magic_school:   'game_magic_schools',
    enchantment:    'game_enchantments',
    ritual:         'game_rituals',
    magic_resist:   'game_magic_resistances',
    artifact_rivalry:'game_artifact_rivalries',
    ki_move:        'game_ki_moves',
    fusion:         'game_fusions',
    battle_terrain: 'game_battle_terrain',
    battle_item:    'game_battle_items',
    finishing_move: 'game_finishing_moves',
    battle_condition:'game_battle_conditions',
    formation_shapes:'game_formation_shapes',
    world:          'game_worlds',
    sound_zone:     'game_map_sound_zones',
    tile_animation: 'game_tile_animations',
    npc_relationship: 'game_npc_relationships',
    economy_state:  'game_economy_state',
    world_event:    'game_world_events',
    cutscene:       'game_cutscenes',
    economy_tx:     'game_economy_transactions',
    inn:            'game_inns',
    gathering_skill:'game_gathering_skills',
    gathering_node: 'game_gathering_nodes',
    capture_item:   'game_capture_items',
    creature:       'character_creatures',
    season_effect:  'game_season_effects',
    bounty_board:   'game_bounty_boards',
    bounty_task:    'game_bounty_tasks',
    treasure_trail: 'game_treasure_trails',
    mount:          'game_mounts',
    housing_plot:   'game_housing_plots',
    furniture:      'game_furniture',
    webhook:        'game_webhooks',
    role_section:   'admin_role_sections',
    terrain_interaction: 'game_terrain_interactions',
    raid_boss:      'game_raid_bosses',
    job:            'game_jobs',
    job_skill:      'game_job_skills',
    card:           'game_cards',
    card_rule:      'game_card_rules',
    siege_structure:'game_siege_structures',
    dice_table:     'game_dice_tables',
    fishing_spot:   'game_fishing_spots',
    puzzle:         'game_puzzles',
    minigame:       'game_minigames',
    battle_referee: 'game_battle_referees',
    level_req:      'level_requirements',
    // ── Companion Quests ────────────────────────────────────────────
    companion_quest: 'game_companion_quests',
    companion_quest_progress: 'character_companion_quest_progress',
    companion_affinity_tier: 'game_companion_affinity_tiers',
    // ── World Events v2 ─────────────────────────────────────────────
    world_event_participant: 'game_world_event_participants',
    world_event_history: 'game_world_event_history',
};

const ENTITY_PK_MAP = {
    artifact:       'artifact_id',
    artifact_power: 'power_id',
    quest:          'quest_id',
    stat:           'id',
    script:         'script_key',
    loot_table:     'id',
    spawn:          'id',
    sig_level:      'level',
    death_penalty:  'death_count',
    level_req:      'level',
};

function getTable(type) {
    const t = ENTITY_TABLE_MAP[type];
    if (!t) throw Object.assign(new Error(`Unknown entity type: ${type}`), { status: 400 });
    return t;
}
function getPk(type) { return ENTITY_PK_MAP[type] || 'id'; }

// ── type union used by the generic CRUD routes ────────────────────
const ENTITY_TYPES = Object.keys(ENTITY_TABLE_MAP).join('|');

// =================================================================
// TERMINOLOGY ROUTES
// =================================================================
router.get('/terminology', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='custom_terminology'");
        const terms = rows.length ? JSON.parse(rows[0].setting_value || '{}') : {};
        res.json({ success: true, terms });
    } catch(e) { res.json({ success: true, terms: {} }); }
});

router.post('/terminology', requireStaff, async (req, res) => {
    try {
        const terms = JSON.stringify(req.body.terms || {});
        await db.query("INSERT INTO system_settings (setting_key, setting_value) VALUES ('custom_terminology',?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)", [terms]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// TRASH / RESTORE
// =================================================================
router.get('/trash', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, entity_type, entity_id, deleted_by, deleted_at FROM admin_trash WHERE expires_at > NOW() ORDER BY deleted_at DESC LIMIT 50');
        res.json({ success: true, items: rows });
    } catch(e) { res.json({ success: true, items: [] }); }
});

router.post('/trash/:id/restore', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM admin_trash WHERE id=?', [req.params.id]);
        if (!rows.length) return res.json({ success: false, message: 'Not found in trash' });
        const item = rows[0];
        const table = getTable(item.entity_type);
        if (!table) return res.json({ success: false, message: 'Unknown entity type' });
        const data = JSON.parse(item.entity_data);
        delete data.id; // Let DB auto-assign new ID
        await db.query('INSERT INTO ?? SET ?', [table, data]);
        await db.query('DELETE FROM admin_trash WHERE id=?', [req.params.id]);
        res.json({ success: true, message: `Restored ${item.entity_type} #${item.entity_id}` });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// DEPENDENCIES CHECKER
// =================================================================
router.get('/dependencies/:type/:id', requireStaff, async (req, res) => {
    try {
        const { type, id } = req.params;
        const deps = [];
        // Check common foreign key patterns
        const checks = [
            { table: 'game_npcs', col: 'shop_id', label: 'NPC shops', when: type === 'shop' },
            { table: 'game_npcs', col: 'map_id', label: 'NPCs on map', when: type === 'map' },
            { table: 'game_shop_supplies', col: 'item_id', label: 'Shop supplies', when: type === 'item' },
            { table: 'game_shop_supplies', col: 'shop_id', label: 'Shop items', when: type === 'shop' },
            { table: 'character_items', col: 'item_id', label: 'Player inventories', when: type === 'item' },
            { table: 'game_maps', col: 'region_id', label: 'Maps in region', when: type === 'region' },
            { table: 'game_class_skills', col: 'skill_id', label: 'Class skills', when: type === 'skill' },
            { table: 'game_class_skills', col: 'class_id', label: 'Skills for class', when: type === 'class' },
            { table: 'game_gathering_nodes', col: 'map_id', label: 'Gathering nodes', when: type === 'map' },
            { table: 'game_bounty_tasks', col: 'target_npc_id', label: 'Bounty targets', when: type === 'npc' },
        ];
        for (const check of checks) {
            if (!check.when) continue;
            try {
                const [rows] = await db.query(`SELECT COUNT(*) as cnt FROM ?? WHERE ??=?`, [check.table, check.col, id]);
                if (rows[0].cnt > 0) deps.push({ label: check.label, count: rows[0].cnt, table: check.table });
            } catch {}
        }
        res.json({ success: true, dependencies: deps, hasDeps: deps.length > 0 });
    } catch(e) { res.json({ success: true, dependencies: [], hasDeps: false }); }
});

// =================================================================
// WEBHOOK SYSTEM
// =================================================================
router.post('/webhook/fire', requireStaff, async (req, res) => {
    try {
        const { event, data } = req.body;
        const [hooks] = await db.query('SELECT * FROM game_webhooks WHERE is_active=1');
        let sent = 0;
        for (const hook of hooks) {
            const events = typeof hook.events === 'string' ? JSON.parse(hook.events) : hook.events;
            if (events && !events.includes('*') && !events.includes(event)) continue;
            try {
                await fetch(hook.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        embeds: [{
                            title: `🎮 ${event}`,
                            description: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
                            color: 0x8a0000,
                            timestamp: new Date().toISOString(),
                            footer: { text: 'Twisted Engine' },
                        }]
                    }),
                });
                sent++;
            } catch {}
        }
        res.json({ success: true, sent });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// GENERIC CRUD — List, Get, Delete, Update, Create
// =================================================================

// GET /admin-panel/:type — list all entities of a type
router.get(`/:type(${ENTITY_TYPES})`, requireStaff, async (req, res) => {
    try {
        const table = getTable(req.params.type);
        const pk = getPk(req.params.type);
        const [rows] = await db.query('SELECT * FROM ?? ORDER BY ?? DESC', [table, pk]);
        res.json({ success: true, data: rows });
    } catch(e) { res.status(e.status||500).json({ success: false, message: e.message }); }
});

// GET /admin-panel/:type/:id — single entity
router.get(`/:type(${ENTITY_TYPES})/:id`, requireStaff, async (req, res) => {
    try {
        const table = getTable(req.params.type);
        const pk = getPk(req.params.type);
        const [rows] = await db.query('SELECT * FROM ?? WHERE ??=? LIMIT 1', [table, pk, req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, data: rows[0] });
    } catch(e) { res.status(e.status||500).json({ success: false, message: e.message }); }
});

// POST /admin-panel/:type/:id/delete — delete
router.post(`/:type(${ENTITY_TYPES})/:id/delete`, requireStaff, async (req, res) => {
    try {
        const table = getTable(req.params.type);
        const pk = getPk(req.params.type);
        // Soft delete: save to trash before deleting
        try {
            const [rows] = await db.query('SELECT * FROM ?? WHERE ??=?', [table, pk, req.params.id]);
            if (rows.length) {
                await db.query('INSERT INTO admin_trash (entity_type, entity_id, entity_data, deleted_by) VALUES (?,?,?,?)',
                    [req.params.type, req.params.id, JSON.stringify(rows[0]), req.session?.username || 'admin']);
            }
        } catch {}
        // Log activity
        try {
            await db.query('INSERT INTO admin_activity_log (user_id, username, action, entity_type, entity_id) VALUES (?,?,?,?,?)',
                [req.session?.userId || 0, req.session?.username || 'admin', 'delete', req.params.type, req.params.id]);
        } catch {}
        await db.query('DELETE FROM ?? WHERE ??=?', [table, pk, req.params.id]);
        res.json({ success: true });
    } catch(e) { res.status(e.status||500).json({ success: false, message: e.message }); }
});

// POST /admin-panel/:type/:id — update existing entity
router.post(`/:type(${ENTITY_TYPES})/:id([\\w.-]+)`, requireStaff, async (req, res) => {
    try {
        const table = getTable(req.params.type);
        const pk = getPk(req.params.type);
        // Strip fields that don't exist as columns (prevents "Unknown column" errors)
        const [cols] = await db.query('SHOW COLUMNS FROM ??', [table]);
        const validCols = new Set(cols.map(c => c.Field));
        const data = {};
        for (const [k, v] of Object.entries(req.body)) {
            if (validCols.has(k) && k !== pk) data[k] = v;
        }
        if (!Object.keys(data).length) return res.status(400).json({ success: false, message: 'No data' });
        await db.query('UPDATE ?? SET ? WHERE ??=?', [table, data, pk, req.params.id]);
        // Log admin activity
        try {
            const username = req.session?.username || 'admin';
            await db.query('INSERT INTO admin_activity_log (user_id, username, action, entity_type, entity_id, details) VALUES (?,?,?,?,?,?)',
                [req.session?.userId || 0, username, 'update', req.params.type, req.params.id, JSON.stringify(Object.keys(data)).slice(0, 200)]);
        } catch {}
        // Auto-generate battle stats for NPCs
        if (req.params.type === 'npc') {
            try {
                const [npcRow] = await db.query('SELECT id, char_id, name, npc_level, base_hp, base_atk, base_def, base_speed, base_mo, base_md, base_mp, base_luck, is_enemy, icon FROM game_npcs WHERE id=?', [req.params.id]);
                if (npcRow.length && !npcRow[0].char_id && npcRow[0].base_hp > 0) {
                    const n = npcRow[0];
                    const [charResult] = await db.query(
                        `INSERT INTO characters (user_id, name, level, max_hp, current_hp, max_mp, current_mp, atk, \`def\`, mo, md, speed, luck, is_active)
                         VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                        [n.name, n.npc_level || 1, n.base_hp, n.base_hp, n.base_mp || 20, n.base_mp || 20, n.base_atk || 8, n.base_def || 5, n.base_mo || 5, n.base_md || 5, n.base_speed || 10, n.base_luck || 5]
                    );
                    await db.query('UPDATE game_npcs SET char_id=? WHERE id=?', [charResult.insertId, n.id]);
                    console.log(`[NPC] Auto-generated battle stats for "${n.name}" → char_id ${charResult.insertId}`);
                }
            } catch(npcErr) { console.warn('[NPC] Auto-stat gen failed:', npcErr.message); }
        }
        // Auto-version maps on save
        if (req.params.type === 'map' && (data.tiles_json || data.collisions_json || data.objects_json)) {
            try {
                const [mapRow] = await db.query('SELECT * FROM game_maps WHERE id=?', [req.params.id]);
                if (mapRow.length) {
                    const m = mapRow[0];
                    const [lastVer] = await db.query('SELECT MAX(version_num) as v FROM game_map_versions WHERE map_id=?', [m.id]);
                    const nextVer = (lastVer[0]?.v || 0) + 1;
                    await db.query(
                        'INSERT INTO game_map_versions (map_id, version_num, tiles_json, collisions_json, objects_json, anims_json, width, height) VALUES (?,?,?,?,?,?,?,?)',
                        [m.id, nextVer, m.tiles_json, m.collisions_json, m.objects_json, m.anims_json, m.width, m.height]
                    );
                    // Keep only last 20 versions per map
                    await db.query('DELETE FROM game_map_versions WHERE map_id=? AND version_num < ?', [m.id, nextVer - 20]);
                }
            } catch(verErr) { console.warn('[MapVersion] Failed to save version:', verErr.message); }
        }
        const [rows] = await db.query('SELECT * FROM ?? WHERE ??=?', [table, pk, req.params.id]);
        res.json({ success: true, data: rows[0] || null });
    } catch(e) { res.status(e.status||500).json({ success: false, message: e.message }); }
});

// POST /admin-panel/:type — create new entity
router.post(`/:type(${ENTITY_TYPES})`, requireStaff, async (req, res) => {
    try {
        const table = getTable(req.params.type);
        const pk = getPk(req.params.type);
        // Strip fields that don't exist as columns (prevents "Unknown column" errors)
        const [cols] = await db.query('SHOW COLUMNS FROM ??', [table]);
        const validCols = new Set(cols.map(c => c.Field));
        const data = {};
        for (const [k, v] of Object.entries(req.body)) {
            if (validCols.has(k) && k !== pk) data[k] = v;
        }
        if (!Object.keys(data).length) return res.status(400).json({ success: false, message: 'No valid data' });
        const [result] = await db.query('INSERT INTO ?? SET ?', [table, data]);
        const insertId = result.insertId;
        const [rows] = await db.query('SELECT * FROM ?? WHERE ??=?', [table, pk, insertId]);
        res.json({ success: true, data: rows[0] || null });
    } catch(e) { res.status(e.status||500).json({ success: false, message: e.message }); }
});

module.exports = router;
