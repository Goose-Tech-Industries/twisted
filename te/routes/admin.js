// =================================================================
// UNIVERSAL ADMIN ROUTER (AdminSauce Master Key)
// =================================================================
// Generic CRUD bridge for the AdminSauce panel.
//
// Endpoints:
//   POST /admin/get-all   { type, userId }
//   POST /admin/save      { type, id?, data, userId }
//   POST /admin/delete    { type, id, userId }
//   GET  /admin/types
//
// Notes:
// - We use an explicit allow-list (TYPE_META) to prevent arbitrary table access.
// - Some installs may have slightly different table names (older schema vs newer).
//   For those, each type can declare multiple candidate tables; we auto-resolve
//   the first table that exists.
// - This router supports non-"id" primary keys (e.g., level, key_name, module_key).

const express = require('express');
const router = express.Router();

let db;
router.init = (databaseConnection) => {
  db = databaseConnection;
};

// ---------------------------------------------------------------
// Security (server-side)
// ---------------------------------------------------------------
// Minimal staff gate:
// - If ADMIN_KEY is set, you may pass it as header x-admin-key.
// - Otherwise, we check users.role for the given userId.
//
// Allowed roles are intentionally broad for MVP; tighten later.
const STAFF_ROLES = new Set(['ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER']);

async function requireStaff(req, res, next) {
  try {
    // Optional master key bypass
    const adminKey = process.env.ADMIN_KEY;
    const suppliedKey = req.headers['x-admin-key'];
    if (adminKey && suppliedKey && String(suppliedKey) === String(adminKey)) {
      return next();
    }

    // Read userId from server-side session — never trust the request body
    const userId = req.session && req.session.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Login required' });

    const [rows] = await db.query('SELECT role FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!rows || !rows.length) return res.status(401).json({ success: false, message: 'Invalid user' });

    const role = String(rows[0].role || '').toUpperCase();
    if (!STAFF_ROLES.has(role)) {
      return res.status(403).json({ success: false, message: 'Staff role required' });
    }

    req.staffRole = role;
    next();
  } catch (err) {
    console.error('Admin auth error:', err);
    res.status(500).json({ success: false, message: 'Auth error' });
  }
}

// ---------------------------------------------------------------
// Type -> table mapping
// ---------------------------------------------------------------
// Each type defines:
//  - pk: primary key column
//  - tables: array of candidate table names (first existing wins)
//
// This is where AdminSauce “gets its powers back” — if a manager uses a type,
// it MUST exist here.
const TYPE_META = {
  // --- World ---
  map:         { pk: 'id', tables: ['game_maps'] },
  npc:         { pk: 'id', tables: ['game_npcs'] },
  shop:        { pk: 'id', tables: ['game_shops', 'game_shop'] },
  shop_supply: { pk: 'id', tables: ['game_shop_supplies', 'game_shop_supply', 'game_shop_items', 'game_shop_stock'] },
  spawn:       { pk: 'id', tables: ['game_map_spawns', 'game_spawns', 'game_spawn_points'] },
  arena:       { pk: 'id', tables: ['game_arenas', 'game_arena'] },

  // --- Character / DB ---
  item:       { pk: 'id', tables: ['game_items'] },
  ogham:        { pk: 'id', tables: ['game_oghams'] },
  ogham_family: { pk: 'id', tables: ['game_ogham_families'] },
  class:      { pk: 'id', tables: ['game_classes'] },
  race:       { pk: 'id', tables: ['game_races'] },
  bg:         { pk: 'id', tables: ['game_backgrounds'] },
  feat:       { pk: 'id', tables: ['game_feats'] },
  equip_slot: { pk: 'slot_key', tables: ['game_equip_slots', 'equip_slots'] },

  // Stat system
  stat:       { pk: 'key_name', tables: ['game_stat_definitions', 'stat_definitions'] },

  // --- Combat / Rules ---
  battle_cmd:  { pk: 'id', tables: ['game_battle_commands', 'battle_commands'] },
  skill:       { pk: 'id', tables: ['game_skills', 'skills'] },
  element:     { pk: 'id', tables: ['game_elements', 'elements'] },
  status:      { pk: 'id', tables: ['game_statuses', 'statuses', 'status_effects'] },
  limit:       { pk: 'id', tables: ['game_limit_breaks', 'limit_breaks', 'game_limits'] },
  class_skill: { pk: 'id', tables: ['game_class_skills', 'class_skills'] },

  // --- Quests + Progression ---
  quest:     { pk: 'quest_id', tables: ['quest_definitions', 'game_quests'] },
  level_req: { pk: 'level',   tables: ['level_requirements', 'game_level_requirements', 'game_levels'] },
  // alias used by GenericManager config in AdminSauce
  level:     { pk: 'level',   tables: ['level_requirements', 'game_level_requirements', 'game_levels'] },

  // --- Crafting ---
  craft_recipe: { pk: 'id', tables: ['game_craft_recipes'] },

  // --- Scheduler ---
  scheduled_task: { pk: 'id', tables: ['game_scheduled_tasks'] },

  // --- Regions ---
  region: { pk: 'id', tables: ['game_regions'] },

  // --- Quest Board ---
  quest_board:    { pk: 'id', tables: ['game_quest_board'] },

  // --- Auction ---
  auction_listing: { pk: 'id', tables: ['auction_listings'] },

  // --- Legendary Artifacts ---
  artifact:       { pk: 'artifact_id', tables: ['legendary_artifacts'] },
  artifact_power: { pk: 'power_id',    tables: ['artifact_powers'] },

  // --- Codex / Bestiary ---
  codex: { pk: 'id', tables: ['codex_entries'] },

  // --- Factions ---
  faction: { pk: 'id', tables: ['factions'] },

  // --- Config ---
  setting: { pk: 'setting_key', tables: ['game_settings', 'system_settings', 'settings'] },
  module:  { pk: 'module_key',  tables: ['game_modules', 'core_modules', 'modules'] },
  script:  { pk: 'script_key',  tables: ['game_scripts', 'scripts'] },
};

function isMissingTableErr(err) {
  // MySQL/MariaDB: ER_NO_SUCH_TABLE (errno 1146)
  return !!err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146);
}

async function resolveType(type) {
  const meta = TYPE_META[type];
  if (!meta) {
    const e = new Error('Invalid Type');
    e.status = 400;
    throw e;
  }

  // Cache resolved table (first existing)
  if (meta._resolvedTable) {
    return { ...meta, table: meta._resolvedTable };
  }

  const candidates = Array.isArray(meta.tables) ? meta.tables : [meta.table];
  let lastMissing = null;

  for (const t of candidates) {
    if (!t) continue;
    try {
      // Probing existence safely.
      // NOTE: Using ?? placeholder prevents identifier injection.
      await db.query('SELECT 1 FROM ?? LIMIT 1', [t]);
      meta._resolvedTable = t;
      return { ...meta, table: t };
    } catch (err) {
      if (isMissingTableErr(err)) {
        lastMissing = err;
        continue;
      }
      throw err;
    }
  }

  // None of the tables exist
  const e = new Error('DB table missing for this module. Run the relevant schema / migration, then reload AdminSauce.');
  e.status = 400;
  e._missing = lastMissing;
  throw e;
}

function safeColumnName(col) {
  // allow letters, numbers, underscore only
  return typeof col === 'string' && /^[a-zA-Z0-9_]+$/.test(col);
}

router.get('/admin/types', requireStaff, (req, res) => {
  res.json({ success: true, data: Object.keys(TYPE_META).sort() });
});

// -----------------------------------------------------------------
// 1) GET ALL
// -----------------------------------------------------------------
router.post('/admin/get-all', requireStaff, async (req, res) => {
  try {
    const { type } = req.body;
    const { table, pk } = await resolveType(type);

    const [rows] = await db.query('SELECT * FROM ?? ORDER BY ?? DESC', [table, pk]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'DB Error' });
  }
});

// -----------------------------------------------------------------
// 2) SAVE / UPDATE
// -----------------------------------------------------------------
router.post('/admin/save', requireStaff, async (req, res) => {
  try {
    const { type, id, data } = req.body;
    const { table, pk } = await resolveType(type);

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ success: false, message: 'Missing data' });
    }

    // Prevent accidental PK mutation on updates
    const payload = { ...data };
    if (id !== undefined && id !== null && String(id) !== '' && pk in payload) {
      delete payload[pk];
    }

    // Validate keys (avoid injection via column names)
    for (const k of Object.keys(payload)) {
      if (!safeColumnName(k)) {
        return res.status(400).json({ success: false, message: `Invalid column name: ${k}` });
      }
    }

    const hasId = (id !== undefined && id !== null && String(id) !== '');

    if (hasId) {
      const keys = Object.keys(payload);
      if (!keys.length) return res.json({ success: true, message: 'Nothing to update' });

      const setClause = keys.map(k => `\`${k}\` = ?`).join(', ');
      const values = keys.map(k => payload[k]);

      const [result] = await db.query(
        `UPDATE \`${table}\` SET ${setClause} WHERE \`${pk}\` = ?`,
        [...values, id]
      );

      // If the record didn't exist AND this table uses a non-auto primary key,
      // treat this as an UPSERT so the ACP can create records with explicit IDs.
      if (result.affectedRows === 0 && pk !== 'id') {
        const insertPayload = { ...payload, [pk]: id };
        await db.query('INSERT INTO ?? SET ?', [table, insertPayload]);
        return res.json({ success: true, message: 'Created!' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Record not found' });
      }

      // Invalidate map cache when a map is saved
      if (type === 'map' && global._mapCache) delete global._mapCache[id];

      return res.json({ success: true, message: 'Updated!' });
    }

    // CREATE
    const [result] = await db.query('INSERT INTO ?? SET ?', [table, payload]);

    // Invalidate map cache for new maps too
    if (type === 'map' && global._mapCache && result.insertId) delete global._mapCache[result.insertId];

    res.json({ success: true, message: 'Created!', insertId: result.insertId || null });

  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'DB Error' });
  }
});

// -----------------------------------------------------------------
// 3) DELETE
// -----------------------------------------------------------------
router.post('/admin/delete', requireStaff, async (req, res) => {
  try {
    const { type, id } = req.body;
    const { table, pk } = await resolveType(type);

    if (id === undefined || id === null || id === '') {
      return res.status(400).json({ success: false, message: 'Missing id' });
    }

    const [result] = await db.query('DELETE FROM ?? WHERE ?? = ?', [table, pk, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    res.json({ success: true, message: 'Deleted.' });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'DB Error' });
  }
});



// -----------------------------------------------------------------
// 4) SETTINGS (Key/Value convenience endpoints)
// -----------------------------------------------------------------
// Some older AdminSauce managers treat settings as a simple key/value map.
// These endpoints keep that UX intact.

const _tableColumnsCache = new Map();

async function getTableColumns(tableName) {
  if (_tableColumnsCache.has(tableName)) return _tableColumnsCache.get(tableName);
  const [rows] = await db.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [tableName]
  );
  const cols = new Set((rows || []).map(r => r.COLUMN_NAME));
  _tableColumnsCache.set(tableName, cols);
  return cols;
}

async function resolveSettingsKV() {
  const meta = await resolveType('setting');
  const table = meta.table;
  const cols = await getTableColumns(table);

  const keyCandidates = ['setting_key', 'key_name', 'key', 'name'];
  const valCandidates = ['setting_value', 'value', 'value_json', 'value_text'];

  const keyCol = keyCandidates.find(c => cols.has(c));
  const valCol = valCandidates.find(c => cols.has(c));

  if (!keyCol || !valCol) {
    const e = new Error(`Settings table schema mismatch. Need key/value columns (found: ${[...cols].join(', ')})`);
    e.status = 400;
    throw e;
  }

  return { table, keyCol, valCol };
}

router.post('/admin/get-settings', requireStaff, async (req, res) => {
  try {
    const { table, keyCol, valCol } = await resolveSettingsKV();
    const [rows] = await db.query('SELECT ?? AS k, ?? AS v FROM ??', [keyCol, valCol, table]);
    const out = {};
    for (const r of (rows || [])) out[r.k] = r.v;
    res.json({ success: true, data: out });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'DB Error' });
  }
});

router.post('/admin/save-setting', requireStaff, async (req, res) => {
  try {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ success: false, message: 'Missing key' });

    const { table, keyCol, valCol } = await resolveSettingsKV();

    // Key column should be PK/unique for ON DUPLICATE KEY to work.
    await db.query(
      'INSERT INTO ?? (??, ??) VALUES (?, ?) ON DUPLICATE KEY UPDATE ?? = VALUES(??)',
      [table, keyCol, valCol, key, value, valCol, valCol]
    );

    res.json({ success: true, message: 'Saved' });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'DB Error' });
  }
});

router.post('/admin/delete-setting', requireStaff, async (req, res) => {
  try {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ success: false, message: 'Missing key' });

    const { table, keyCol } = await resolveSettingsKV();
    const [result] = await db.query('DELETE FROM ?? WHERE ?? = ?', [table, keyCol, key]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'DB Error' });
  }
});

// -----------------------------------------------------------------
// 5) MODULES (Key/Value convenience endpoints, mirrors settings)
// -----------------------------------------------------------------
// Allows AdminSauce to GET/SAVE/DELETE individual module records
// via /admin/get-modules, /admin/save-module, /admin/delete-module

async function resolveModulesKV() {
  const meta = await resolveType('module');
  const table = meta.table;
  const cols = await getTableColumns(table);

  const keyCandidates = ['module_key', 'key_name', 'key', 'name'];
  const keyCol = keyCandidates.find(c => cols.has(c));
  if (!keyCol) {
    const e = new Error(`Modules table schema mismatch. Need a key column (found: ${[...cols].join(', ')})`);
    e.status = 400;
    throw e;
  }
  return { table, keyCol, pk: meta.pk, allCols: cols };
}

router.post('/admin/get-modules', requireStaff, async (req, res) => {
  try {
    const { table, pk } = await resolveType('module');
    const [rows] = await db.query('SELECT * FROM ?? ORDER BY ?? ASC', [table, pk]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'DB Error' });
  }
});

router.post('/admin/save-module', requireStaff, async (req, res) => {
  try {
    const { key, data } = req.body || {};
    if (!key) return res.status(400).json({ success: false, message: 'Missing key' });

    const { table, pk } = await resolveType('module');
    const payload = { ...(data || {}), [pk]: key };

    // Validate column names
    for (const k of Object.keys(payload)) {
      if (!safeColumnName(k)) {
        return res.status(400).json({ success: false, message: `Invalid column: ${k}` });
      }
    }

    await db.query('INSERT INTO ?? SET ? ON DUPLICATE KEY UPDATE ?', [table, payload, data || {}]);
    res.json({ success: true, message: 'Module saved' });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'DB Error' });
  }
});

router.post('/admin/delete-module', requireStaff, async (req, res) => {
  try {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ success: false, message: 'Missing key' });

    const { table, pk } = await resolveType('module');
    const [result] = await db.query('DELETE FROM ?? WHERE ?? = ?', [table, pk, key]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'DB Error' });
  }
});

// =================================================================
// BLOOD OGHAM ROUTES
// =================================================================

// Get all oghams slotted on a character
router.get('/admin/character-oghams/:charId', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT co.*, go.name, go.icon, go.rank, go.description,
                   go.element_attack, go.on_hit_status, go.on_hit_chance,
                   go.stat_bonus_json, gi.name as item_name
            FROM character_oghams co
            JOIN game_oghams go ON go.id = co.ogham_id
            JOIN game_items gi ON gi.id = co.item_id
            WHERE co.character_id = ?`, [req.params.charId]);
        res.json({ success: true, data: rows });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// Slot an ogham into an item for a character (admin override)
router.post('/admin/slot-ogham', requireStaff, async (req, res) => {
    try {
        const { character_id, item_id, slot_index, ogham_id } = req.body;
        await db.query(
            `INSERT INTO character_oghams (character_id, item_id, slot_index, ogham_id, current_rank, kill_count)
             VALUES (?,?,?,?,1,0)
             ON DUPLICATE KEY UPDATE ogham_id=VALUES(ogham_id), current_rank=1, kill_count=0`,
            [character_id, item_id, slot_index, ogham_id]);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// Remove an ogham from a slot
router.delete('/admin/slot-ogham/:id', requireStaff, async (req, res) => {
    try {
        await db.query('DELETE FROM character_oghams WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// =================================================================
// WORLD STATE ROUTES — for WorldManager admin panel
// =================================================================

// WORLD FLAGS
router.get('/admin/world-flags', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM world_flags ORDER BY set_at DESC');
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/admin/world-flags', requireStaff, async (req, res) => {
    try {
        const { key, value, setBy } = req.body;
        if (!key) return res.status(400).json({ success: false, message: 'Missing key' });
        await db.query(
            `INSERT INTO world_flags (flag_key, flag_value, set_by)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE flag_value=VALUES(flag_value), set_by=VALUES(set_by), set_at=CURRENT_TIMESTAMP`,
            [key, value || 'true', setBy || 'Admin']
        );
        // Sync in-memory worldFlags
        if (global.worldFlags) global.worldFlags[key] = value || 'true';
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/admin/world-flags/:key', requireStaff, async (req, res) => {
    try {
        await db.query('DELETE FROM world_flags WHERE flag_key=?', [req.params.key]);
        if (global.worldFlags) delete global.worldFlags[req.params.key];
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// NPC MOODS — read from live npcState (via global getNpcsForMap)
router.get('/admin/npc-moods', requireStaff, async (req, res) => {
    try {
        // Join DB NPC list with live npcState mood
        const [rows] = await db.query(
            `SELECT n.id, n.name, n.icon, n.map_id, m.name as map_name
             FROM game_npcs n
             LEFT JOIN game_maps m ON m.id = n.map_id
             WHERE n.is_dead = 0 AND n.is_enemy = 0`);
        // Attach live mood from in-memory npcState if available
        const liveNpcs = typeof global.getNpcsForMap === 'function'
            ? Object.values(global._getNpcState ? global._getNpcState() : {})
            : [];
        const moodMap = {};
        liveNpcs.forEach(n => { if (n.mood) moodMap[n.id] = n.mood; });
        const result = rows.map(r => ({ ...r, mood: moodMap[r.id] || null }));
        res.json({ success: true, data: result });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/admin/npc-mood', requireStaff, async (req, res) => {
    try {
        const { npcName, mood } = req.body;
        if (!npcName) return res.status(400).json({ success: false, message: 'Missing npcName' });
        const moodVal = (mood === '(clear)' || !mood) ? null : mood;
        if (typeof global.setNpcMood === 'function') global.setNpcMood(npcName, moodVal);
        // Also persist to DB so it survives server restart
        await db.query('UPDATE game_npcs SET mood=? WHERE name=?', [moodVal, npcName]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DEAD NPCs
router.get('/admin/dead-npcs', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT n.id, n.name, n.icon, n.map_id, n.death_cause, m.name as map_name
             FROM game_npcs n
             LEFT JOIN game_maps m ON m.id = n.map_id
             WHERE n.is_dead = 1`);
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/admin/resurrect-npc/:id', requireStaff, async (req, res) => {
    try {
        await db.query(
            'UPDATE game_npcs SET is_dead=0, death_cause=NULL WHERE id=?', [req.params.id]);
        // Reload this NPC into live state if getNpcsForMap is available
        const [[row]] = await db.query('SELECT * FROM game_npcs WHERE id=?', [req.params.id]);
        if (row && typeof global._reloadNpc === 'function') global._reloadNpc(row);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// FACTIONS
router.get('/admin/factions', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT f.*, COUNT(nf.npc_id) as npc_count
             FROM factions f
             LEFT JOIN npc_factions nf ON nf.faction_id = f.id
             GROUP BY f.id ORDER BY f.name`);
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/admin/factions', requireStaff, async (req, res) => {
    try {
        const { name, icon, description, rival_id } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Name required' });
        const [result] = await db.query(
            'INSERT INTO factions (name, icon, description, rival_id) VALUES (?,?,?,?)',
            [name, icon || '⚔️', description || null, rival_id || null]);
        res.json({ success: true, id: result.insertId });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/admin/factions/:id', requireStaff, async (req, res) => {
    try {
        const { name, icon, description, rival_id } = req.body;
        await db.query(
            'UPDATE factions SET name=?, icon=?, description=?, rival_id=? WHERE id=?',
            [name, icon || '⚔️', description || null, rival_id || null, req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/admin/factions/:id', requireStaff, async (req, res) => {
    try {
        await db.query('DELETE FROM player_faction_rep WHERE faction_id=?', [req.params.id]);
        await db.query('DELETE FROM npc_factions WHERE faction_id=?', [req.params.id]);
        await db.query('DELETE FROM factions WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// RUMORS
router.get('/admin/rumors', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM npc_rumors ORDER BY created_at DESC LIMIT 100');
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/admin/rumors/:id', requireStaff, async (req, res) => {
    try {
        // Set max_spread = spread_count to stop it spreading further
        await db.query('UPDATE npc_rumors SET max_spread=spread_count WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── SCHEDULER: RUN NOW (admin) ────────────────────────────────────
router.post('/scheduler/run-now', requireStaff, async (req, res) => {
    try {
        const { taskId } = req.body;
        const [rows] = await db.query('SELECT * FROM game_scheduled_tasks WHERE id=?', [taskId]);
        if (!rows.length) return res.json({ success: false, message: 'Task not found.' });

        // Import scheduler and run the task immediately
        const Scheduler = require('../scheduler');
        await Scheduler.runDueTasks();   // runs all due — or we could expose a run-one API

        // Actually for admin "run now" we want to force-run just this task
        // The simplest approach: temporarily zero out last_run_at, call runDueTasks
        await db.query('UPDATE game_scheduled_tasks SET last_run_at=NULL WHERE id=?', [taskId]);
        // Run again so it picks this specific one up
        await Scheduler.runDueTasks();

        res.json({ success: true, message: `Task triggered.` });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// ── TEST AI CONNECTION ─────────────────────────────────────────────
// AdminSauce → Settings → AI Brain → Test button hits this endpoint.
// It loads the current DB config, fires a quick test prompt, and
// returns the reply + metadata so the admin can verify it works.
router.post('/admin/test-ai', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'ai_%'"
        );
        const c = {};
        for (const r of rows) c[r.setting_key] = r.setting_value;

        const provider    = c.ai_provider    || 'disabled';
        const apiKey      = c.ai_api_key     || '';
        const model       = c.ai_model       || '';
        const baseUrl     = c.ai_base_url    || '';
        const temperature = parseFloat(c.ai_temperature) || 0.85;
        const maxTokens   = Math.min(parseInt(c.ai_max_tokens) || 256, 128); // cap test to 128

        if (provider === 'disabled') {
            return res.json({ success: true, reply: '(Rule-based fallback active — no AI provider selected)', provider: 'rule-based', ms: 0 });
        }

        const { getNpcReply } = require('../npc_brain');
        const start = Date.now();
        const testNpc    = { name: 'Aldric', persona: 'A gruff but fair town guard who has seen too much.' };
        const testPlayer = { name: 'Tester', level: 1, questsDone: 0 };
        const reply = await getNpcReply({
            npc: testNpc, player: testPlayer,
            message: 'What do you do around here?',
            history: [], memory: { facts: [], reputation: 0 },
            worldFlags: {}, region: null,
            aiConfig: { provider, apiKey, model, baseUrl, temperature, maxTokens, systemPrompt: c.ai_system_prompt || '' }
        });
        const ms = Date.now() - start;

        res.json({ success: true, reply, provider, model: model || '(default)', ms });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// PLAYER REPORTS — Admin API
// =================================================================
// GET  /api/admin/reports?status=open   — list reports (filtered)
// POST /api/admin/reports/update        — change report status
// TEACHING: requireStaff middleware ensures only mods/admins can
// access these. The status filter lets mods focus on open reports
// first, then review/dismiss/action them one by one.

router.get('/api/admin/reports', requireStaff, async (req, res) => {
    try {
        const status = req.query.status || 'open';
        const whereClause = status === 'all' ? '' : 'WHERE status = ?';
        const params = status === 'all' ? [] : [status];

        const [reports] = await db.query(
            `SELECT id, reporter_char_id, reporter_name, reported_char_id, reported_name,
                    reason, details, status, created_at, reviewed_at
             FROM player_reports
             ${whereClause}
             ORDER BY created_at DESC
             LIMIT 200`,
            params
        );
        res.json({ success: true, reports });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

router.post('/api/admin/reports/update', requireStaff, async (req, res) => {
    try {
        const { reportId, status } = req.body;
        const VALID = ['open','reviewed','dismissed','actioned'];
        if (!VALID.includes(status)) return res.json({ success: false, error: 'Invalid status.' });

        await db.query(
            `UPDATE player_reports
             SET status=?, reviewed_at=NOW(), reviewed_by=?
             WHERE id=?`,
            [status, req.session.userId, reportId]
        );
        res.json({ success: true });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// =================================================================
// REFERRAL STATS — Admin API
// =================================================================
// GET /api/admin/referrals  — overview + top referrers

router.get('/api/admin/referrals', requireStaff, async (req, res) => {
    try {
        // Top referrers by total referred users
        const [topReferrers] = await db.query(
            `SELECT
                referrer_u.id          AS user_id,
                referrer_c.name        AS char_name,
                COUNT(*)               AS total_referred,
                SUM(u.referral_paid)   AS total_paid
             FROM users u
             JOIN users referrer_u ON referrer_u.id = u.referred_by
             LEFT JOIN characters referrer_c ON referrer_c.user_id = referrer_u.id
                AND referrer_c.id = (
                    SELECT id FROM characters WHERE user_id = referrer_u.id
                    ORDER BY level DESC LIMIT 1
                )
             WHERE u.referred_by IS NOT NULL
             GROUP BY referrer_u.id
             ORDER BY total_referred DESC
             LIMIT 25`
        );

        // Overall totals
        const [[totals]] = await db.query(
            `SELECT
                COUNT(*) AS total_referred,
                SUM(referral_paid) AS total_paid
             FROM users WHERE referred_by IS NOT NULL`
        );

        res.json({ success: true, topReferrers, totals });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

module.exports = router;
