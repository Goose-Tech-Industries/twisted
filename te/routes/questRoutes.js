// =================================================================
// QUEST ROUTES (state_json-first)
// =================================================================
// Templates live in SQL (quest_definitions)
// Player progress lives in characters.state_json
//
// Endpoints (mounted at /api/quests):
// POST /available
// POST /active
// POST /detail
// POST /accept
// POST /progress
// POST /complete
// POST /abandon
// GET  /npc-offers/:npcId/:characterId   (optional hook)

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
    'SELECT id, user_id, name, level, state_json FROM characters WHERE id = ? AND user_id = ? LIMIT 1',
    [characterId, userId]
  );
  if (!rows.length) {
    const err = new Error('Character not found or not owned by user');
    err.status = 403;
    throw err;
  }
  const c = rows[0];
  const state = safeJsonParse(c.state_json || '{}', {});

  // normalize core quest/progression shape
  if (!state.quests || typeof state.quests !== 'object') state.quests = {};
  if (!state.quests.active || typeof state.quests.active !== 'object') state.quests.active = {};
  if (!state.quests.completed || typeof state.quests.completed !== 'object') state.quests.completed = {};

  if (!state.progression || typeof state.progression !== 'object') state.progression = {};
  if (typeof state.progression.unspent_points !== 'number') state.progression.unspent_points = 0;

  if (typeof state.xp !== 'number') state.xp = 0;

  return { character: c, state };
}

async function saveState(characterId, state) {
  await db.query('UPDATE characters SET state_json = ? WHERE id = ?', [JSON.stringify(state), characterId]);
}

function normalizeObjectives(template) {
  // We support two formats for objectives_json:
  // 1) Array: [{ key, type, target, text }]
  // 2) Object: { key: { type, target, text } }
  const raw = template.objectives_json
    ? (typeof template.objectives_json === 'string'
      ? safeJsonParse(template.objectives_json, [])
      : template.objectives_json)
    : [];

  const list = Array.isArray(raw)
    ? raw
    : Object.entries(raw || {}).map(([key, v]) => ({ key, ...(v || {}) }));

  return list.map((o, idx) => ({
    key: o.key || `obj_${idx + 1}`,
    type: o.type || 'generic',
    target: Number.isFinite(+o.target) ? +o.target : 1,
    text: o.text || o.description || `Complete objective ${idx + 1}`,
  }));
}

function buildActiveQuestState(template) {
  const objectives = normalizeObjectives(template);
  const objectiveProgress = {};
  for (const obj of objectives) {
    objectiveProgress[obj.key] = {
      current: 0,
      target: obj.target,
      complete: false,
      type: obj.type,
      text: obj.text,
    };
  }

  return {
    quest_id: template.quest_id,
    title: template.title,
    started_at: nowIso(),
    objectives: objectiveProgress,
    // optional metadata
    quest_type: template.quest_type,
    category: template.category,
  };
}

function isQuestComplete(activeQuest) {
  const objs = activeQuest?.objectives || {};
  const keys = Object.keys(objs);
  if (!keys.length) return true;
  return keys.every(k => !!objs[k].complete);
}

function hoursBetween(isoA, isoB) {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  return Math.abs(a - b) / (1000 * 60 * 60);
}

async function getQuestTemplate(questId) {
  const [rows] = await db.query('SELECT * FROM quest_definitions WHERE quest_id = ? LIMIT 1', [questId]);
  return rows[0] || null;
}

async function listQuestTemplates() {
  const [rows] = await db.query(
    'SELECT quest_id, title, description, quest_type, category, required_level, is_repeatable, repeat_cooldown_hours, max_completions, objectives_json, rewards_json FROM quest_definitions'
  );
  return rows;
}

function computeCanAccept(template, character, state) {
  // Level check
  if ((character.level || 1) < (template.required_level || 1)) return { ok: false, reason: 'level_too_low' };

  const completed = state.quests.completed[template.quest_id];
  const isRepeatable = !!template.is_repeatable;

  if (completed && !isRepeatable) return { ok: false, reason: 'already_completed' };

  if (completed && isRepeatable) {
    const max = template.max_completions;
    if (max && (completed.times_completed || 1) >= max) return { ok: false, reason: 'max_completions' };

    const cd = template.repeat_cooldown_hours || 0;
    if (cd > 0 && completed.last_completed_at) {
      const hrs = hoursBetween(completed.last_completed_at, nowIso());
      if (hrs < cd) return { ok: false, reason: 'cooldown' };
    }
  }

  if (state.quests.active[template.quest_id]) return { ok: false, reason: 'already_active' };

  // Soft limit (can be moved to progression_config later)
  const activeCount = Object.keys(state.quests.active).length;
  if (activeCount >= 10) return { ok: false, reason: 'too_many_active' };

  return { ok: true };
}

// -----------------------------
// Routes
// -----------------------------

// POST /available
router.post('/available', async (req, res) => {
  try {
    const userId = uid(req);
    const { characterId } = req.body;
    const { character, state } = await loadCharacterOwned(userId, characterId);

    const templates = await listQuestTemplates();

    const available = templates.map(t => {
      const can = computeCanAccept(t, character, state);
      return {
        ...t,
        can_accept: can.ok,
        blocked_reason: can.ok ? null : can.reason,
        is_active: !!state.quests.active[t.quest_id],
        is_completed: !!state.quests.completed[t.quest_id],
      };
    });

    res.json({ success: true, data: available });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// POST /active
router.post('/active', async (req, res) => {
  try {
    const userId = uid(req);
    const { characterId } = req.body;
    const { state } = await loadCharacterOwned(userId, characterId);

    res.json({ success: true, data: state.quests.active });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// POST /detail
router.post('/detail', async (req, res) => {
  try {
    const { questId } = req.body;
    const t = await getQuestTemplate(questId);
    if (!t) return res.status(404).json({ success: false, error: 'Quest not found' });

    res.json({ success: true, data: t });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /accept
router.post('/accept', async (req, res) => {
  try {
    const userId = uid(req);
    const { characterId, questId } = req.body;
    const { character, state } = await loadCharacterOwned(userId, characterId);

    const t = await getQuestTemplate(questId);
    if (!t) return res.status(404).json({ success: false, error: 'Quest not found' });

    const can = computeCanAccept(t, character, state);
    if (!can.ok) return res.status(400).json({ success: false, error: can.reason });

    state.quests.active[questId] = buildActiveQuestState(t);
    await saveState(characterId, state);

    res.json({ success: true, data: state.quests.active[questId] });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// POST /progress
// Body: { userId, characterId, questId, objectiveKey, amount }
router.post('/progress', async (req, res) => {
  try {
    const userId = uid(req);
    const { characterId, questId, objectiveKey, amount } = req.body;
    const { state } = await loadCharacterOwned(userId, characterId);

    const q = state.quests.active[questId];
    if (!q) return res.status(404).json({ success: false, error: 'Quest not active' });

    const obj = q.objectives?.[objectiveKey];
    if (!obj) return res.status(400).json({ success: false, error: 'Objective not found' });

    // SECURITY: KILL-type objectives are advanced server-side at battle end
    // (battle_engine.js quest kill credit block). Clients cannot self-report
    // kills — if they try, we reject it so players can't fake enemy deaths.
    if ((obj.type || '').toUpperCase() === 'KILL') {
        return res.status(403).json({
            success: false,
            error: 'KILL objectives are verified server-side via battle results.'
        });
    }

    const inc = Number.isFinite(+amount) ? +amount : 1;
    obj.current = Math.max(0, (obj.current || 0) + inc);

    if (obj.current >= (obj.target || 1)) {
      obj.current = obj.target || obj.current;
      obj.complete = true;
    }

    // If everything is done, mark quest completeable (but do not auto-complete)
    q.is_ready_to_turn_in = isQuestComplete(q);

    await saveState(characterId, state);

    res.json({ success: true, data: q });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// POST /complete
router.post('/complete', async (req, res) => {
  try {
    const userId = uid(req);
    const { characterId, questId } = req.body;
    const { character, state } = await loadCharacterOwned(userId, characterId);

    const q = state.quests.active[questId];
    if (!q) return res.status(404).json({ success: false, error: 'Quest not active' });
    if (!isQuestComplete(q)) return res.status(400).json({ success: false, error: 'Quest not complete' });

    const t = await getQuestTemplate(questId);
    if (!t) return res.status(404).json({ success: false, error: 'Quest template missing' });

    // Rewards
    const rewards = t.rewards_json ? safeJsonParse(t.rewards_json, {}) : {};
    const xpReward = Number.isFinite(+rewards.xp) ? +rewards.xp : 0;

    // Move active -> completed
    delete state.quests.active[questId];
    const prev = state.quests.completed[questId] || {};
    const times = (prev.times_completed || 0) + 1;
    state.quests.completed[questId] = {
      quest_id: questId,
      title: t.title,
      last_completed_at: nowIso(),
      times_completed: times,
    };

    // Award XP into state_json (leveling is handled by /api/progression/award-xp)
    state.xp = (state.xp || 0) + xpReward;

    await saveState(characterId, state);

    // ── ACHIEVEMENT: quests_done trigger ────────────────────────
    try {
        const achievementRoutes = require('./routes/achievementRoutes');
        const totalDone = Object.keys(state.quests.completed || {}).length;
        await achievementRoutes.checkForCharacter(db, null, characterId, 'quests_done', totalDone);
    } catch(e) { /* non-critical */ }

    res.json({
      success: true,
      data: {
        completed: state.quests.completed[questId],
        xp_awarded: xpReward,
        character_level: character.level,
        state_xp: state.xp,
      }
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// POST /abandon
router.post('/abandon', async (req, res) => {
  try {
    const userId = uid(req);
    const { characterId, questId } = req.body;
    const { state } = await loadCharacterOwned(userId, characterId);

    if (!state.quests.active[questId]) {
      return res.status(404).json({ success: false, error: 'Quest not active' });
    }

    delete state.quests.active[questId];
    await saveState(characterId, state);

    res.json({ success: true, message: 'Abandoned' });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// OPTIONAL: NPC quest offers hook
// GET /npc-offers/:npcId/:characterId?userId=...
router.get('/npc-offers/:npcId/:characterId', async (req, res) => {
  try {
    const { npcId, characterId } = req.params;
    const userId = uid(req);

    if (!userId) return res.status(401).json({ success: false, error: 'Not logged in' });

    const { character, state } = await loadCharacterOwned(userId, characterId);

    // Attempt to read quest_offers_json from game_npcs.
    // If your schema doesn't have this yet, this will return an empty list.
    let offers = [];
    try {
      const [npcRows] = await db.query('SELECT quest_offers_json FROM game_npcs WHERE id = ? LIMIT 1', [npcId]);
      if (npcRows.length && npcRows[0].quest_offers_json) {
        offers = safeJsonParse(npcRows[0].quest_offers_json, []);
        if (!Array.isArray(offers)) offers = [];
      }
    } catch {
      offers = [];
    }

    if (!offers.length) return res.json({ success: true, data: [] });

    // Fetch offered quest templates
    const placeholders = offers.map(() => '?').join(',');
    const [qRows] = await db.query(
      `SELECT quest_id, title, description, quest_type, category, required_level, is_repeatable, repeat_cooldown_hours, max_completions, objectives_json, rewards_json
       FROM quest_definitions WHERE quest_id IN (${placeholders})`,
      offers
    );

    const enriched = qRows.map(t => {
      const can = computeCanAccept(t, character, state);
      return {
        ...t,
        can_accept: can.ok,
        blocked_reason: can.ok ? null : can.reason,
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

module.exports = router;
