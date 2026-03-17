// =================================================================
// LEGENDARY ARTIFACTS ROUTES
// =================================================================
// Design goals:
// - Artifacts are server-unique items that change hands on PvP kills.
// - Ownership transfers ONLY when the current wielder dies in PvP.
// - Artifacts power-scale with kills, decay if inactive, and keep lineage.
//
// Endpoints (mounted at /api/artifacts):
// GET  /                     -> list artifacts
// GET  /:artifactId           -> artifact detail (powers + lineage + hunts)
// GET  /wielder/:characterId  -> artifacts currently held by character
// POST /hunt/create           -> create a hunt/bounty
// POST /shrine/create         -> create shrine for an artifact
// POST /shrine/worship        -> worship a shrine
//
// Hook (IMPORTANT):
//   artifactRoutes.onPvpKill(killerCharId, victimCharId, context)
//
// Context example:
//   { location: 'Arena', timestamp: Date.now(), isDuel: false }

const express = require('express');
const router = express.Router();

let db;
let io; // optional socket.io instance for global broadcasts

router.init = (database, ioInstance = null) => {
  db = database;
  io = ioInstance;
  return router;
};

function uid(req) { return req.session && req.session.userId; }


// -----------------------------
// Helpers
// -----------------------------
function nowIso() {
  return new Date().toISOString();
}

function randPct() {
  return Math.random() * 100;
}

function safeJsonParse(str, fallback) {
  try {
    const val = JSON.parse(str);
    return (val && typeof val === 'object') ? val : fallback;
  } catch {
    return fallback;
  }
}

async function getCharacterBasics(charId) {
  const [rows] = await db.query(
    'SELECT id, user_id, name, level FROM characters WHERE id = ? LIMIT 1',
    [charId]
  );
  return rows[0] || null;
}

async function logPvpKill(killerId, victimId, context) {
  try {
    await db.query(
      'INSERT INTO artifact_pvp_kill_log (killer_character_id, victim_character_id, is_duel, location, occurred_at) VALUES (?, ?, ?, ?, ?)',
      [killerId, victimId, context?.isDuel ? 1 : 0, context?.location || null, new Date(context?.timestamp || Date.now())]
    );
  } catch {
    // If the table isn't installed yet, we don't hard-crash the game.
  }
}

async function recentKillCooldownHit(killerId, victimId) {
  try {
    const [rows] = await db.query(
      `SELECT id FROM artifact_pvp_kill_log
       WHERE killer_character_id = ? AND victim_character_id = ?
         AND occurred_at > (NOW() - INTERVAL 24 HOUR)
       LIMIT 1`,
      [killerId, victimId]
    );
    return !!rows.length;
  } catch {
    return false;
  }
}

async function checkExploitRules(killerId, victimId, context) {
  if (context?.isDuel) return { ok: false, reason: 'duel_kills_do_not_count' };

  const killer = await getCharacterBasics(killerId);
  const victim = await getCharacterBasics(victimId);

  if (!killer || !victim) return { ok: false, reason: 'character_missing' };
  if (killer.user_id === victim.user_id) return { ok: false, reason: 'same_account_kill' };

  // Anti-farm: victim must be within 10 levels of killer (victim >= killer - 10)
  if ((victim.level || 1) < ((killer.level || 1) - 10)) return { ok: false, reason: 'victim_too_low_level' };

  // Cooldown: same killer-victim pair within 24h rejected
  if (await recentKillCooldownHit(killerId, victimId)) return { ok: false, reason: 'repeat_victim_cooldown' };

  return { ok: true, killer, victim };
}

async function getArtifactHeldBy(charId) {
  const [rows] = await db.query(
    'SELECT * FROM legendary_artifacts WHERE current_wielder_id = ? AND is_dormant = 0 LIMIT 1',
    [charId]
  );
  return rows[0] || null;
}

async function closeLineage(artifactId, charId, reason) {
  await db.query(
    `UPDATE artifact_lineage
     SET ended_at = NOW(), ended_reason = ?
     WHERE artifact_id = ? AND wielder_id = ? AND ended_at IS NULL`,
    [reason || 'pvp_death', artifactId, charId]
  );
}

async function openLineage(artifactId, charId) {
  await db.query(
    `INSERT INTO artifact_lineage (lineage_id, artifact_id, wielder_id, acquired_at)
     VALUES (UUID(), ?, ?, NOW())`,
    [artifactId, charId]
  );
}

async function resolveHuntsOnTransfer(artifactId, newWielderId, killerId) {
  // If there are active hunts on this artifact, the killer gets payout when they win it.
  // We close hunts when artifact changes hands.
  const [hunts] = await db.query(
    `SELECT hunt_id, bounty_amount FROM artifact_hunts
     WHERE artifact_id = ? AND status = 'active'`,
    [artifactId]
  );

  if (!hunts.length) return { closed: 0, paid: 0 };

  let paid = 0;
  for (const h of hunts) {
    // Pay bounty to killer (simple gold injection stub; you can route into your economy)
    paid += Number(h.bounty_amount || 0);

    await db.query(
      `UPDATE artifact_hunts
       SET status = 'claimed', claimed_by = ?, claimed_at = NOW()
       WHERE hunt_id = ?`,
      [killerId, h.hunt_id]
    );
  }

  return { closed: hunts.length, paid };
}

async function applyRandomCurse(artifactId) {
  // 10% chance to apply a curse to the artifact itself
  if (randPct() > 10) return null;

  const curses = [
    { id: 'blood_price', name: 'Blood Price', text: 'Lose 1% max HP per kill until fed again.' },
    { id: 'whispers', name: 'Whispers', text: 'Randomly taunts nearby players (lore hook).' },
    { id: 'hunger', name: 'Hunger', text: 'Decay accelerates until next PvP kill.' },
  ];

  const pick = curses[Math.floor(Math.random() * curses.length)];

  // Store curse as JSON on artifact
  const [rows] = await db.query('SELECT active_curses_json FROM legendary_artifacts WHERE artifact_id = ? LIMIT 1', [artifactId]);
  const existing = rows.length ? safeJsonParse(rows[0].active_curses_json || '[]', []) : [];
  existing.push({ ...pick, applied_at: nowIso(), expires_at: null });

  await db.query(
    'UPDATE legendary_artifacts SET active_curses_json = ? WHERE artifact_id = ?',
    [JSON.stringify(existing), artifactId]
  );

  return pick;
}

// -----------------------------
// The Critical Hook: onPvpKill
// -----------------------------
async function onPvpKill(killerCharId, victimCharId, context = {}) {
  // 1) Is victim holding an artifact?
  const artifact = await getArtifactHeldBy(victimCharId);
  if (!artifact) {
    await logPvpKill(killerCharId, victimCharId, context);
    return { transferred: false, reason: 'no_artifact_on_victim' };
  }

  // 2) Anti-exploit checks
  const rules = await checkExploitRules(killerCharId, victimCharId, context);
  if (!rules.ok) {
    await logPvpKill(killerCharId, victimCharId, context);
    return { transferred: false, reason: rules.reason, artifact_id: artifact.artifact_id };
  }

  // 3) Transfer transaction
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Lock artifact row
    const [aRows] = await conn.query(
      'SELECT * FROM legendary_artifacts WHERE artifact_id = ? FOR UPDATE',
      [artifact.artifact_id]
    );
    const a = aRows[0];
    if (!a || a.current_wielder_id !== Number(victimCharId) || a.is_dormant) {
      await conn.rollback();
      await logPvpKill(killerCharId, victimCharId, context);
      return { transferred: false, reason: 'artifact_state_changed' };
    }

    // Update artifact stats
    const totalKills = Number(a.total_kills || 0) + 1;
    const streak = Number(a.kill_streak || 0) + 1;

    await conn.query(
      `UPDATE legendary_artifacts
       SET total_kills = ?, kill_streak = ?, last_bloodshed_at = NOW(), current_wielder_id = ?, last_transfer_at = NOW()
       WHERE artifact_id = ?`,
      [totalKills, streak, killerCharId, a.artifact_id]
    );

    // Close victim lineage + open killer lineage
    await conn.query(
      `UPDATE artifact_lineage
       SET ended_at = NOW(), ended_reason = 'pvp_death'
       WHERE artifact_id = ? AND wielder_id = ? AND ended_at IS NULL`,
      [a.artifact_id, victimCharId]
    );

    await conn.query(
      `INSERT INTO artifact_lineage (lineage_id, artifact_id, wielder_id, acquired_at)
       VALUES (UUID(), ?, ?, NOW())`,
      [a.artifact_id, killerCharId]
    );

    // Resolve active hunts
    const [hunts] = await conn.query(
      `SELECT hunt_id, bounty_amount FROM artifact_hunts
       WHERE artifact_id = ? AND status = 'active'`,
      [a.artifact_id]
    );

    let paid = 0;
    if (hunts.length) {
      for (const h of hunts) {
        paid += Number(h.bounty_amount || 0);
        await conn.query(
          `UPDATE artifact_hunts
           SET status = 'claimed', claimed_by = ?, claimed_at = NOW()
           WHERE hunt_id = ?`,
          [killerCharId, h.hunt_id]
        );
      }
    }

    await conn.commit();

    // Non-transactional extras
    const curse = await applyRandomCurse(a.artifact_id);
    await logPvpKill(killerCharId, victimCharId, context);

    const payload = {
      transferred: true,
      artifact_id: a.artifact_id,
      artifact_name: a.name,
      from_character_id: victimCharId,
      to_character_id: killerCharId,
      total_kills: totalKills,
      kill_streak: streak,
      bounty_paid: paid,
      curse_applied: curse,
    };

    // Broadcast globally (if socket.io is wired)
    if (io) io.emit('artifact_transfer', payload);

    return payload;

  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

router.onPvpKill = onPvpKill;

// -----------------------------
// API Endpoints
// -----------------------------

// GET /
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.*, c.name AS wielder_name
       FROM legendary_artifacts a
       LEFT JOIN characters c ON a.current_wielder_id = c.id
       ORDER BY a.rarity DESC, a.name ASC`
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /wielder/:characterId
router.get('/wielder/:characterId', async (req, res) => {
  try {
    const charId = Number(req.params.characterId);
    const [rows] = await db.query(
      'SELECT * FROM legendary_artifacts WHERE current_wielder_id = ? AND is_dormant = 0',
      [charId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /:artifactId
router.get('/:artifactId', async (req, res) => {
  try {
    const artifactId = req.params.artifactId;

    const [[artifact]] = await db.query(
      `SELECT a.*, c.name AS wielder_name
       FROM legendary_artifacts a
       LEFT JOIN characters c ON a.current_wielder_id = c.id
       WHERE a.artifact_id = ? LIMIT 1`,
      [artifactId]
    );

    if (!artifact) return res.status(404).json({ success: false, error: 'Artifact not found' });

    const [powers] = await db.query(
      'SELECT * FROM artifact_powers WHERE artifact_id = ? ORDER BY unlock_kills ASC',
      [artifactId]
    );

    const [lineage] = await db.query(
      `SELECT l.*, c.name AS wielder_name
       FROM artifact_lineage l
       LEFT JOIN characters c ON l.wielder_id = c.id
       WHERE l.artifact_id = ?
       ORDER BY l.acquired_at DESC
       LIMIT 50`,
      [artifactId]
    );

    const [hunts] = await db.query(
      `SELECT h.*, c.name AS hunter_name
       FROM artifact_hunts h
       LEFT JOIN characters c ON h.hunter_id = c.id
       WHERE h.artifact_id = ?
       ORDER BY h.created_at DESC
       LIMIT 50`,
      [artifactId]
    );

    res.json({
      success: true,
      data: {
        artifact,
        powers,
        lineage,
        hunts,
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /hunt/create
// Body: { userId, characterId, artifactId, bountyAmount, notes }
router.post('/hunt/create', async (req, res) => {
  try {
    const userId = uid(req);
    const { characterId, artifactId, bountyAmount, notes } = req.body;

    // Basic ownership validation (hunter must own the character)
    const [rows] = await db.query(
      'SELECT id FROM characters WHERE id = ? AND user_id = ? LIMIT 1',
      [characterId, userId]
    );
    if (!rows.length) return res.status(403).json({ success: false, error: 'Not your character' });

    const huntId = require('crypto').randomUUID();
    const bounty = Number.isFinite(+bountyAmount) ? Math.max(0, +bountyAmount) : 0;

    await db.query(
      `INSERT INTO artifact_hunts (hunt_id, artifact_id, hunter_id, bounty_amount, status, notes, created_at)
       VALUES (?, ?, ?, ?, 'active', ?, NOW())`,
      [huntId, artifactId, characterId, bounty, notes || null]
    );

    res.json({ success: true, data: { hunt_id: huntId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /shrine/create
// Body: { userId, characterId, artifactId, zoneId, title, message }
router.post('/shrine/create', async (req, res) => {
  try {
    const userId = uid(req);
    const { characterId, artifactId, zoneId, title, message } = req.body;

    // Only the current wielder can create a shrine
    const [aRows] = await db.query(
      'SELECT current_wielder_id FROM legendary_artifacts WHERE artifact_id = ? LIMIT 1',
      [artifactId]
    );
    if (!aRows.length) return res.status(404).json({ success: false, error: 'Artifact not found' });

    const wielderId = aRows[0].current_wielder_id;
    if (Number(wielderId) !== Number(characterId)) {
      return res.status(403).json({ success: false, error: 'Only the wielder can create a shrine' });
    }

    // Validate user owns the wielder character
    const [cRows] = await db.query('SELECT id FROM characters WHERE id = ? AND user_id = ? LIMIT 1', [characterId, userId]);
    if (!cRows.length) return res.status(403).json({ success: false, error: 'Not your character' });

    const shrineId = require('crypto').randomUUID();
    await db.query(
      `INSERT INTO artifact_shrines (shrine_id, artifact_id, creator_wielder_id, zone_id, title, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [shrineId, artifactId, characterId, zoneId || null, title || 'Shrine', message || null]
    );

    res.json({ success: true, data: { shrine_id: shrineId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /shrine/worship
// Body: { userId, characterId, shrineId }
router.post('/shrine/worship', async (req, res) => {
  try {
    const userId = uid(req);
    const { characterId, shrineId } = req.body;

    // Validate user owns this character
    const [cRows] = await db.query('SELECT id FROM characters WHERE id = ? AND user_id = ? LIMIT 1', [characterId, userId]);
    if (!cRows.length) return res.status(403).json({ success: false, error: 'Not your character' });

    const [sRows] = await db.query('SELECT * FROM artifact_shrines WHERE shrine_id = ? LIMIT 1', [shrineId]);
    if (!sRows.length) return res.status(404).json({ success: false, error: 'Shrine not found' });

    const shrine = sRows[0];

    // Simple worship log (blessings can be handled later)
    const worshipId = require('crypto').randomUUID();
    await db.query(
      `INSERT INTO artifact_worship_log (worship_id, shrine_id, artifact_id, worshipper_id, worshipped_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [worshipId, shrineId, shrine.artifact_id, characterId]
    );

    res.json({ success: true, data: { worship_id: worshipId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DEV ONLY: simulate a PvP kill to test transfers
// POST /dev/pvp-kill  Body: { killerCharId, victimCharId, context }
router.post('/dev/pvp-kill', async (req, res) => {
  try {
    if (String(process.env.ENABLE_DEV_ENDPOINTS || '0') !== '1') {
      return res.status(403).json({ success: false, error: 'Dev endpoints disabled' });
    }

    const { killerCharId, victimCharId, context } = req.body;
    const out = await onPvpKill(Number(killerCharId), Number(victimCharId), context || {});
    res.json({ success: true, data: out });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
