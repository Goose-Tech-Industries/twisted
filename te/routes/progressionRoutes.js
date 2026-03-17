// =================================================================
// PROGRESSION ROUTES (XP + Level-ups)
// =================================================================
// Source of truth:
// - characters.level (column) for level
// - characters.state_json.xp for XP
// - characters.state_json.progression.unspent_points for stat points
//
// Endpoints (mounted at /api/progression):
// POST /status
// POST /award-xp
// POST /level-up
// GET  /level-requirements

const express = require('express');
const router = express.Router();

let db;

router.init = (database) => {
  db = database;
  return router;
};

function uid(req) { return req.session && req.session.userId; }


// -----------------------------
// Helpers
// -----------------------------
function safeJsonParse(str, fallback) {
  try {
    const val = JSON.parse(str);
    return (val && typeof val === 'object') ? val : fallback;
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

async function loadCharacterOwned(userId, characterId) {
  const [rows] = await db.query(
    'SELECT id, user_id, name, level, atk, def, mo, md, speed, luck, state_json FROM characters WHERE id = ? AND user_id = ? LIMIT 1',
    [characterId, userId]
  );
  if (!rows.length) {
    const err = new Error('Character not found or not owned by user');
    err.status = 403;
    throw err;
  }
  const c = rows[0];
  const state = safeJsonParse(c.state_json || '{}', {});

  if (typeof state.xp !== 'number') state.xp = 0;
  if (!state.progression || typeof state.progression !== 'object') state.progression = {};
  if (typeof state.progression.unspent_points !== 'number') state.progression.unspent_points = 0;

  return { character: c, state };
}

async function saveState(characterId, state) {
  await db.query('UPDATE characters SET state_json = ? WHERE id = ?', [JSON.stringify(state), characterId]);
}

async function getLevelTable() {
  // This table is optional. If it doesn't exist, we fallback to a formula.
  try {
    const [rows] = await db.query('SELECT level, xp_required, total_xp FROM level_requirements ORDER BY level ASC');
    return rows;
  } catch {
    return null;
  }
}

function xpNeededByFormula(level) {
  // Simple, stable curve (feel free to replace)
  // XP to gain NEXT level
  return Math.round((100 + (level * level * 15)) / 10) * 10;
}

async function getXpRequirementForNext(level) {
  const table = await getLevelTable();
  if (!table || !table.length) {
    return { xp_required: xpNeededByFormula(level), total_xp: null, using_table: false };
  }

  // level_requirements table uses per-level xp_required.
  const nextRow = table.find(r => r.level === (level + 1));
  if (!nextRow) return { xp_required: xpNeededByFormula(level), total_xp: null, using_table: false };
  return { xp_required: nextRow.xp_required, total_xp: nextRow.total_xp, using_table: true };
}

async function tryAutoLevelUps(characterId, userId, state) {
  // Auto-level up while XP >= required.
  // Each level-up grants 3 unspent points (per your design).

  // Pull fresh level from DB to avoid stale state.
  const [rows] = await db.query('SELECT level FROM characters WHERE id = ? AND user_id = ? LIMIT 1', [characterId, userId]);
  if (!rows.length) throw new Error('Character missing during level-up');
  let level = rows[0].level || 1;

  let levelsGained = 0;

  // Safety: cap leveling in one request
  for (let i = 0; i < 50; i += 1) {
    const req = await getXpRequirementForNext(level);
    if (state.xp < req.xp_required) break;

    state.xp -= req.xp_required;
    level += 1;
    levelsGained += 1;

    state.progression.unspent_points += 3;
    state.progression.last_level_up_at = nowIso();

    // Optional: you can also grant small stat bumps here if desired.
  }

  if (levelsGained > 0) {
    await db.query('UPDATE characters SET level = ? WHERE id = ? AND user_id = ?', [level, characterId, userId]);

    // ── ACHIEVEMENT: level_reached trigger ───────────────────────
    try {
        const achievementRoutes = require('./routes/achievementRoutes');
        await achievementRoutes.checkForCharacter(db, null, characterId, 'level_reached', level);
    } catch(e) { /* non-critical */ }
  }

  return { newLevel: level, levelsGained };
}

// -----------------------------
// Routes
// -----------------------------

// POST /status
router.post('/status', async (req, res) => {
  try {
    const userId = uid(req);
    const { characterId } = req.body;
    const { character, state } = await loadCharacterOwned(userId, characterId);

    // Auto-sync: if XP (from quests or other systems) has crossed a threshold,
    // we apply the level-ups here too. This keeps the UI consistent even if
    // XP was awarded outside of /award-xp.
    const leveled = await tryAutoLevelUps(characterId, userId, state);
    if (leveled.levelsGained > 0) {
      character.level = leveled.newLevel;
      await saveState(characterId, state);
    }

    const reqNext = await getXpRequirementForNext(character.level || 1);

    res.json({
      success: true,
      data: {
        level: character.level || 1,
        xp: state.xp || 0,
        xp_to_next: reqNext.xp_required,
        unspent_points: state.progression.unspent_points,
        using_level_table: reqNext.using_table,
        levels_gained: leveled.levelsGained,
      }
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// POST /award-xp
router.post('/award-xp', async (req, res) => {
  try {
    const userId = uid(req);
    const { characterId, amount, reason } = req.body;
    const { character, state } = await loadCharacterOwned(userId, characterId);

    const add = Number.isFinite(+amount) ? +amount : 0;
    if (add <= 0) return res.status(400).json({ success: false, error: 'Invalid XP amount' });

    state.xp = (state.xp || 0) + add;
    state.progression.last_xp_reason = reason || 'unspecified';
    state.progression.last_xp_at = nowIso();

    const leveled = await tryAutoLevelUps(characterId, userId, state);

    await saveState(characterId, state);

    res.json({
      success: true,
      data: {
        previous_level: character.level || 1,
        new_level: leveled.newLevel,
        levels_gained: leveled.levelsGained,
        xp_remaining: state.xp,
        unspent_points: state.progression.unspent_points,
      }
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// POST /level-up
// Spend points: { spend: { strength: 1, speed: 2 } }
router.post('/level-up', async (req, res) => {
  try {
    const userId = uid(req);
    const { characterId, spend } = req.body;
    const { character, state } = await loadCharacterOwned(userId, characterId);

    if (!spend || typeof spend !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing spend object' });
    }

    // Allowed spendable stat columns (must match characters table columns exactly)
    const allowed = ['atk', 'def', 'mo', 'md', 'speed', 'luck'];
    let total = 0;
    const deltas = {};

    for (const k of Object.keys(spend)) {
      if (!allowed.includes(k)) continue;
      const v = Number.isFinite(+spend[k]) ? Math.floor(+spend[k]) : 0;
      if (v <= 0) continue;
      deltas[k] = v;
      total += v;
    }

    if (total <= 0) return res.status(400).json({ success: false, error: 'Nothing to spend' });
    if (total > state.progression.unspent_points) {
      return res.status(400).json({ success: false, error: 'Not enough unspent points' });
    }

    // Apply changes to character base stats
    const updates = [];
    const values = [];
    for (const [k, v] of Object.entries(deltas)) {
      updates.push(`${k} = ${k} + ?`);
      values.push(v);
    }

    if (!updates.length) return res.status(400).json({ success: false, error: 'No valid stats to update' });

    values.push(characterId, userId);
    await db.query(
      `UPDATE characters SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );

    state.progression.unspent_points -= total;
    state.progression.last_spend_at = nowIso();
    state.progression.last_spend = deltas;

    await saveState(characterId, state);

    res.json({
      success: true,
      data: {
        spent: deltas,
        remaining_points: state.progression.unspent_points,
      }
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// GET /level-requirements
router.get('/level-requirements', async (req, res) => {
  try {
    const table = await getLevelTable();
    if (!table) return res.json({ success: true, data: [] });
    res.json({ success: true, data: table });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
