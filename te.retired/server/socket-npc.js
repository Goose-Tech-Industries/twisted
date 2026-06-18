// =============================================================
// server/socket-npc.js — NPC interaction socket handlers
// =============================================================
// TEACHING: This module contains every socket event related to
// NPC dialogue, companion management, map event choices, and
// training/sparring. Extracted from server.js so the main file
// stays small and each domain lives in its own module.
//
// Usage (from server.js):
//   const registerNpcHandlers = require('./server/socket-npc');
//   io.on('connection', (socket) => {
//       registerNpcHandlers(socket, { db, io });
//   });
// =============================================================

const state = require('./state');
const BattleManager = require('../battle_engine');
const { getNpcReply, extractFacts, reputationDelta } = require('../npc_brain');
const { handleMapEvent, executeActions } = require('../event_runner');

module.exports = function registerNpcHandlers(socket, ctx) {
    const { db, io } = ctx;

    // ── PER-SOCKET THROTTLE ─────────────────────────────────────
    // TEACHING: This prevents rapid-fire NPC talk spam from a single
    // client. Each socket gets its own timestamp — doesn't affect
    // other players.
    let _lastNpcTalk = 0;

    // =============================================================
    // NPC TALK — initiates NPC dialogue with AI responses
    // =============================================================
    socket.on('npc_talk', async ({ x, y, message }) => {
        const _now = Date.now();
        if (_now - _lastNpcTalk < 2000) return; // silently drop rapid repeats
        _lastNpcTalk = _now;
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const map = await state.getMapData(db, p.mapId);
            if (!map) return;
            const ev = (map.events || []).find(e => e.x === x && e.y === y && e.type === 'NPC');
            if (!ev) return;

            // Load NPC persona — try live npcState first (wandering NPCs),
            // fall back to DB lookup by name for tile-event NPCs
            const liveNpcForTalk = getNpcsForMap(p.mapId).find(n => n.name === ev?.data || n.name === x);
            let npc = { name: (ev && ev.data) || x || 'Stranger' };
            if (liveNpcForTalk) {
                npc.persona = liveNpcForTalk.persona;
            } else {
                const [npcRows] = await db.query("SELECT * FROM game_npcs WHERE name = ?", [npc.name]);
                if (npcRows.length) { npc.persona = npcRows[0].persona; }
            }

            // Sanitize player message before sending to LLM or storing
            // TEACHING: The LLM sees this text — a player could try to
            // inject prompt-override instructions. Trimming and capping
            // the message length limits the attack surface significantly.
            message = String(message || '').trim().slice(0, 500);
            if (!message) return;

            const memKey = `${p.charId}_${npc.name}`;
            if (!state.npcMemory[memKey]) state.npcMemory[memKey] = [];
            const history = state.npcMemory[memKey];

            // Load persistent memory from DB (facts + reputation)
            const [memRows] = await db.query(
                'SELECT facts_json, reputation FROM npc_memories WHERE char_id=? AND npc_name=?',
                [p.charId, npc.name]
            );
            const mem = memRows.length
                ? { facts: state.safeJsonParse(memRows[0].facts_json, []), reputation: memRows[0].reputation || 0 }
                : { facts: [], reputation: 0 };

            // Build rich player context for the LLM prompt
            const [charCtx] = await db.query('SELECT level, state_json FROM characters WHERE id=?', [p.charId]);
            const talkTitle = await _deriveTitle(p.charId, db);
            const charState = charCtx.length ? state.safeJsonParse(charCtx[0].state_json, {}) : {};
            const playerCtx = {
                name:       p.name,
                title:      talkTitle,
                level:      charCtx.length ? charCtx[0].level : 1,
                mapId:      p.mapId,
                questsDone: Object.keys((charState && charState.quests) || {})
                                .filter(k => charState.quests[k] && charState.quests[k].step === -1).length
            };
            const _npcRegion = await getRegionForMap(p.mapId).catch(() => null);
            const aiConfig = await state.loadAiConfig(db);
            const reply = await getNpcReply({
                npc, player: playerCtx, message, history,
                memory: mem, worldFlags: state.worldFlags, region: _npcRegion, aiConfig
            });
            history.push({ role: 'user', text: message }, { role: 'npc', text: reply });
            if (history.length > 20) history.splice(0, 2);
            socket.emit('npc_reply', { npcName: npc.name, text: reply });

            // Update facts + reputation and persist to DB
            const newFacts = extractFacts({ playerMessage: message, npcName: npc.name, player: { name: p.name }, memory: mem });
            const newRep   = Math.max(-100, Math.min(100, mem.reputation + reputationDelta(message)));
            await _upsertMemory(db, p.charId, npc.name, newFacts, newRep);
        } catch (err) {
            console.error("NPC error:", err);
            socket.emit('npc_reply', { npcName: 'System', text: '*stares blankly* (Error)' });
        }
    });

    // =============================================================
    // ACCEPT NPC NEED — accepts ambient NPC task
    // =============================================================
    socket.on('accept_npc_need', async ({ npcId }) => {
        try {
            const p   = state.onlinePlayers[socket.id];
            const npc = getNpcState()[npcId];
            if (!p || !npc || !npc._need || npc._need.acceptedBy) return;

            npc._need.acceptedBy = p.charId;
            const { reward_gold, reward_xp } = npc._need;

            if (reward_gold) await db.query(
                'UPDATE users SET currency=currency+? WHERE id=(SELECT user_id FROM characters WHERE id=?)',
                [reward_gold, p.charId]);
            if (reward_xp) await db.query(
                'UPDATE characters SET experience=experience+? WHERE id=?', [reward_xp, p.charId]);

            // Rep boost with this NPC
            const [memR] = await db.query(
                'SELECT facts_json, reputation FROM npc_memories WHERE char_id=? AND npc_name=?',
                [p.charId, npc.name]);
            const mem  = memR.length
                ? { facts: state.safeJsonParse(memR[0].facts_json,[]), reputation: memR[0].reputation||0 }
                : { facts: [], reputation: 0 };
            const newFacts = [...mem.facts, `Helped ${npc.name} with a small task`].slice(-10);
            await _upsertMemory(db, p.charId, npc.name, newFacts, Math.min(100, mem.reputation + 8));

            // Faction rep boost
            const faction = await _getNpcFaction(db, npc.id);
            if (faction) await _updateFactionRep(db, p.charId, faction.id, 5);

            socket.emit('npc_need_resolved', {
                npcName: npc.name, reward_gold, reward_xp,
                message: `*${npc.name} thanks you.* "You have my gratitude."`
            });
            npc._need = null;
        } catch (e) { console.error('accept_npc_need error:', e); }
    });

    // =============================================================
    // NPC MENU CHOICE — player selects from NPC dialogue options
    // =============================================================
    // 4b-2. NPC MENU CHOICE (quest accept, shop open, talk, haggle)
    socket.on('npc_menu_choice', async ({ choiceId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p || !socket._talkingTo) return;
            const npc = socket._talkingTo;
            const mem = socket._talkingMem || { facts: [], reputation: 0 };

            if (choiceId.startsWith('quest_')) {
                const questId = parseInt(choiceId.replace('quest_', ''));
                const [stateRows] = await db.query('SELECT state_json FROM characters WHERE id=?', [p.charId]);
                const charState   = stateRows.length ? state.safeJsonParse(stateRows[0].state_json, {}) : {};
                const [qr]        = await db.query('SELECT * FROM game_quests WHERE id=?', [questId]);
                if (!qr.length) return;
                const quest = qr[0];

                // Already in progress? Check for completion conditions
                if (charState.quests && charState.quests[questId] && charState.quests[questId].step !== -1) {
                    // This is a quest check-in — show current progress
                    const steps = state.safeJsonParse(quest.objectives_json, []);
                    const step  = (charState.quests[questId].step || 0);
                    const obj   = steps[step];
                    const text  = obj
                        ? `"You're making progress. ${obj.description || 'Keep going.'}"`
                        : `"I think you've done what I asked. Let me reward you."`;
                    socket.emit('event_queue', [{ cmd: 'dialogue', speaker: npc.name, text }]);
                    return;
                }

                // Start the quest
                if (!charState.quests) charState.quests = {};
                charState.quests[questId] = { step: 0, started: Date.now() };
                await db.query('UPDATE characters SET state_json=? WHERE id=?',
                    [JSON.stringify(charState), p.charId]);

                const steps     = state.safeJsonParse(quest.objectives_json, []);
                const firstStep = steps[0];
                const acceptMsg = firstStep
                    ? `"Good. Here's what I need: ${firstStep.description}"`
                    : `"The task is yours. Don't disappoint me."`;

                socket.emit('event_queue', [
                    { cmd: 'dialogue',     speaker: npc.name, text: acceptMsg },
                    { cmd: 'notification', text: '📜 Quest Started: ' + quest.name, type: 'quest' }
                ]);
                // Boost reputation slightly for accepting
                await _upsertMemory(db, p.charId, npc.name, mem.facts, Math.min(100, mem.reputation + 5));

            } else if (choiceId.startsWith('shop_')) {
                const shopId = parseInt(choiceId.replace('shop_', ''));
                socket.emit('event_queue', [{ cmd: 'open_shop', shopId }]);

            } else if (choiceId.startsWith('haggle_')) {
                const shopId = parseInt(choiceId.replace('haggle_', ''));
                // Reputation-based discount offer
                const discount = mem.reputation >= 60 ? 20
                               : mem.reputation >= 40 ? 15
                               : mem.reputation >= 20 ? 10 : 0;
                if (discount > 0) {
                    socket.emit('event_queue', [
                        { cmd: 'dialogue', speaker: npc.name,
                          text: `*${npc.name} leans in.* "For you? I'll knock ${discount}% off. Don't tell the others."` },
                        { cmd: 'open_shop', shopId, discount }
                    ]);
                } else {
                    socket.emit('event_queue', [
                        { cmd: 'dialogue', speaker: npc.name,
                          text: `"Prices are prices. I don't make exceptions."` }
                    ]);
                }

            } else if (choiceId === 'companion_recruit') {
                // Recruit this NPC as a companion
                try {
                    await db.query(
                        `INSERT INTO character_companions (character_id, npc_id, is_active, tactics)
                         VALUES (?, ?, 1, 'BALANCED')
                         ON DUPLICATE KEY UPDATE is_active=1, recruited_at=NOW()`,
                        [p.charId, npc.id]
                    );
                    // Load companion data
                    const comps = await loadCompanions(p.charId);
                    spawnCompanionsAtPlayer(p);
                    const newComp = comps.find(c => c.npcId === npc.id);
                    if (newComp) {
                        socket.emit('companion_joined', newComp);
                    }
                    socket.emit('event_queue', [
                        { cmd: 'dialogue', speaker: npc.name,
                          text: `*${npc.name} nods firmly.* "I'll fight by your side. Lead the way."` },
                        { cmd: 'notification', text: `⚔️ ${npc.name} joined your party!`, type: 'info' }
                    ]);
                    // Boost reputation
                    await _upsertMemory(db, p.charId, npc.name, mem.facts, Math.min(100, mem.reputation + 10));
                } catch (e) { console.error('Companion recruit error:', e); }

            } else if (choiceId === 'companion_dismiss') {
                // Dismiss companion
                try {
                    await db.query(
                        'UPDATE character_companions SET is_active=0 WHERE character_id=? AND npc_id=?',
                        [p.charId, npc.id]
                    );
                    state.companionState[p.charId] = (state.companionState[p.charId] || []).filter(c => c.npcId !== npc.id);
                    socket.emit('companion_dismissed', { npcId: npc.id });
                    socket.emit('event_queue', [
                        { cmd: 'dialogue', speaker: npc.name,
                          text: `*${npc.name} steps back.* "I'll be here if you need me again."` }
                    ]);
                } catch (e) { console.error('Companion dismiss error:', e); }

            } else if (choiceId === 'companion_locked_rep') {
                socket.emit('event_queue', [
                    { cmd: 'dialogue', speaker: npc.name,
                      text: `*${npc.name} considers your request.* "I don't know you well enough yet. Prove yourself to me first."` }
                ]);

            } else if (choiceId === 'companion_locked_quest') {
                socket.emit('event_queue', [
                    { cmd: 'dialogue', speaker: npc.name,
                      text: `*${npc.name} shakes their head.* "There's something I need done first. Help me with that, and we'll talk."` }
                ]);

            } else if (choiceId === 'companion_full') {
                socket.emit('event_queue', [
                    { cmd: 'dialogue', speaker: npc.name,
                      text: `*${npc.name} glances at your companions.* "Looks like your hands are full already. Come back if you make room."` }
                ]);

            } else if (choiceId === 'talk') {
                socket.emit('event_queue', [{ cmd: 'npc_talk_prompt', npcName: npc.name }]);

            } else if (choiceId === 'farewell') {
                const farewell = mem.reputation > 50
                    ? `*${npc.name} waves warmly.* "Safe travels, friend."`
                    : `"Watch yourself out there."`;
                socket.emit('event_queue', [{ cmd: 'dialogue', speaker: npc.name, text: farewell }]);
            }
        } catch (err) { console.error('npc_menu_choice error:', err); }
    });

    // =============================================================
    // COMPANION MANAGEMENT
    // =============================================================
    // 4b2. COMPANION MANAGEMENT
    socket.on('companion_set_tactics', async ({ npcId, tactics }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const valid = ['AGGRESSIVE', 'BALANCED', 'DEFENSIVE', 'SUPPORT'];
            if (!valid.includes(tactics)) return;
            await db.query(
                'UPDATE character_companions SET tactics=? WHERE character_id=? AND npc_id=? AND is_active=1',
                [tactics, p.charId, npcId]
            );
            const comp = (state.companionState[p.charId] || []).find(c => c.npcId === npcId);
            if (comp) comp.tactics = tactics;
            socket.emit('companion_tactics_changed', { npcId, tactics });
        } catch (e) { console.error('companion_set_tactics error:', e); }
    });

    socket.on('companion_dismiss', async ({ npcId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            await db.query(
                'UPDATE character_companions SET is_active=0 WHERE character_id=? AND npc_id=?',
                [p.charId, npcId]
            );
            state.companionState[p.charId] = (state.companionState[p.charId] || []).filter(c => c.npcId !== npcId);
            socket.emit('companion_dismissed', { npcId });
        } catch (e) { console.error('companion_dismiss error:', e); }
    });

    // ── Companion Affinity & Quests ─────────────────────────────
    socket.on('companion_get_affinity', (data) => handleCompanionAffinity(socket, db, data));
    socket.on('companion_quest_accept', (data) => handleCompanionQuestAccept(socket, db, data));

    // =============================================================
    // EVENT CHOICE — selects map event outcome
    // =============================================================
    // 4c. CHOICE RESPONSE (Player picked an option from event_queue)
    socket.on('event_choice', async ({ optionId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p || !socket._pendingChoices) return;

            const chosen = socket._pendingChoices[optionId];
            socket._pendingChoices = null;

            if (chosen && chosen.actions) {
                const [stateRows] = await db.query("SELECT state_json, level, class_id FROM characters WHERE id=?", [p.charId]);
                const charState = stateRows.length ? state.safeJsonParse(stateRows[0].state_json, {}) : {};

                const result = await executeActions({
                    actions: chosen.actions,
                    socket, db,
                    player: { ...p, level: stateRows[0]?.level || 1, classId: stateRows[0]?.class_id || 1 },
                    state: charState
                });

                if (result && result.state) {
                    await db.query("UPDATE characters SET state_json=? WHERE id=?",
                        [JSON.stringify(result.state), p.charId]);
                }
            }
        } catch (err) { console.error("Choice error:", err); }
    });

    // =============================================================
    // MASTER TRAIN — trains with NPC master (calls BattleManager.trainUnderMaster)
    // =============================================================
    socket.on('master_train', async (data) => {
        const charId = state.onlinePlayers[socket.id]?.charId;
        if (!charId) return;
        const result = await BattleManager.trainUnderMaster(db, charId, data.npcId);
        socket.emit('master_train_result', result);
    });

    // =============================================================
    // TRAIN — character trains a skill
    // =============================================================
    // Session 25: Generic training handler (works for self_train, meditate, etc.)
    socket.on('train', async ({ trainingType }) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const [config] = await db.query("SELECT * FROM game_training_config WHERE name=? AND active=1", [trainingType || 'self_train']);
            if (!config.length) { socket.emit('train_result', { success: false, message: 'This training type is not available.' }); return; }
            const cfg = config[0];

            // Check race/class restriction
            const [charInfo] = await db.query('SELECT race_id, class_id FROM characters WHERE id=?', [p.charId]);
            if (charInfo.length) {
                try {
                    const allowedRaces = cfg.allowed_race_ids ? JSON.parse(cfg.allowed_race_ids) : null;
                    const allowedClasses = cfg.allowed_class_ids ? JSON.parse(cfg.allowed_class_ids) : null;
                    if (allowedRaces && !allowedRaces.includes(charInfo[0].race_id)) {
                        socket.emit('train_result', { success: false, message: 'Your race cannot use this training method.' }); return;
                    }
                    if (allowedClasses && !allowedClasses.includes(charInfo[0].class_id)) {
                        socket.emit('train_result', { success: false, message: 'Your class cannot use this training method.' }); return;
                    }
                } catch {}
            }

            // Check requires partner/master
            if (cfg.requires_partner) { socket.emit('train_result', { success: false, message: 'This requires a sparring partner.' }); return; }
            if (cfg.requires_master) { socket.emit('train_result', { success: false, message: 'This requires an NPC master.' }); return; }

            // Check daily limit
            const [countRow] = await db.query(
                "SELECT COUNT(*) as cnt FROM character_training_log WHERE character_id=? AND training_type=? AND DATE(trained_at)=CURDATE()",
                [p.charId, trainingType]);
            if (countRow[0].cnt >= cfg.daily_limit) { socket.emit('train_result', { success: false, message: `Daily limit reached (${cfg.daily_limit}/day).` }); return; }

            // Apply gains
            const gains = JSON.parse(cfg.stat_gains || '{}');
            const costs = cfg.stat_costs ? JSON.parse(cfg.stat_costs) : {};
            const [charRow] = await db.query('SELECT * FROM characters WHERE id=?', [p.charId]);
            if (!charRow.length) return;
            const c = charRow[0];

            const actualGains = {};
            for (const [stat, pct] of Object.entries(gains)) {
                const base = c[stat] || c['max_hp'] || 100;
                const gain = Math.max(1, Math.floor(base * pct));
                actualGains[stat] = gain;
                await db.query(`UPDATE characters SET \`${stat}\`=\`${stat}\`+? WHERE id=?`, [gain, p.charId]);
            }
            for (const [stat, pct] of Object.entries(costs)) {
                const loss = Math.max(1, Math.floor((c[stat] || 100) * pct));
                await db.query(`UPDATE characters SET \`${stat}\`=GREATEST(1,\`${stat}\`-?) WHERE id=?`, [loss, p.charId]);
            }

            await db.query('INSERT INTO character_training_log (character_id, training_type, stat_gains_json) VALUES (?,?,?)',
                [p.charId, trainingType, JSON.stringify(actualGains)]);

            socket.emit('train_result', { success: true, type: trainingType, gains: actualGains, label: cfg.label });
        } catch (e) { socket.emit('train_result', { success: false, message: e.message }); }
    });

    // =============================================================
    // SPAR REQUEST — requests practice battle
    // =============================================================
    socket.on('spar_request', async ({ targetCharId }) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        const targetEntry = Object.values(state.onlinePlayers).find(pl => pl.charId === targetCharId);
        if (!targetEntry) { socket.emit('spar_error', 'Player not found or offline.'); return; }
        const targetSockId = targetEntry.socketId;
        io.to(targetSockId).emit('spar_requested', { fromName: p.name, fromCharId: p.charId });
        socket.emit('spar_sent', { targetName: targetEntry.name });
    });

    // =============================================================
    // SPAR ACCEPT — accepts sparring challenge
    // =============================================================
    socket.on('spar_accept', async ({ fromCharId }) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const [config] = await db.query("SELECT * FROM game_training_config WHERE name='spar' AND active=1");
            if (!config.length) return;
            const cfg = config[0];
            const gains = JSON.parse(cfg.stat_gains || '{}');
            const costs = JSON.parse(cfg.stat_costs || '{}');

            // Apply to both players
            for (const charId of [p.charId, fromCharId]) {
                const [charRow] = await db.query('SELECT * FROM characters WHERE id=?', [charId]);
                if (!charRow.length) continue;
                const c = charRow[0];
                const actualGains = {};
                for (const [stat, pct] of Object.entries(gains)) {
                    const gain = Math.max(1, Math.floor((c[stat] || 100) * pct));
                    actualGains[stat] = gain;
                    await db.query(`UPDATE characters SET \`${stat}\`=\`${stat}\`+? WHERE id=?`, [gain, charId]);
                }
                for (const [stat, pct] of Object.entries(costs)) {
                    const loss = Math.max(1, Math.floor((c[stat] || 100) * pct));
                    await db.query(`UPDATE characters SET \`${stat}\`=GREATEST(1,\`${stat}\`-?) WHERE id=?`, [loss, charId]);
                }
                await db.query('INSERT INTO character_training_log (character_id, training_type, partner_char_id, stat_gains_json) VALUES (?,?,?,?)',
                    [charId, 'spar', charId === p.charId ? fromCharId : p.charId, JSON.stringify(actualGains)]);
            }

            // Notify both
            const fromEntry = Object.values(state.onlinePlayers).find(pl => pl.charId === fromCharId);
            socket.emit('train_result', { success: true, type: 'spar', partner: fromEntry?.name || 'Partner' });
            if (fromEntry) io.to(fromEntry.socketId).emit('train_result', { success: true, type: 'spar', partner: p.name });
        } catch (e) { socket.emit('train_result', { success: false, message: e.message }); }
    });
};

// =============================================================
// PRIVATE HELPERS
// =============================================================
// TEACHING: These helpers are used by multiple handlers above but
// aren't part of the public API. They live at module scope so all
// handlers can share them without passing them around.

// --- getNpcsForMap / getNpcState ---
// TEACHING: These are exposed on `global` by server.js's NPC system
// boot code. We access them via global so this module doesn't need
// a circular require back into server.js.
function getNpcsForMap(mapId) {
    return (global.getNpcsForMap || (() => []))(mapId);
}

function getNpcState() {
    return (global._getNpcState || (() => ({})))();
}

function getRegionForMap(mapId) {
    return (global.getRegionForMap || (() => Promise.resolve(null)))(mapId);
}

// --- loadCompanions / spawnCompanionsAtPlayer ---
// TEACHING: These are still defined inside server.js's startServer()
// closure. We access them through globals until they're extracted
// into their own module.
function loadCompanions(charId) {
    if (global._loadCompanions) return global._loadCompanions(charId);
    return Promise.resolve([]);
}

function spawnCompanionsAtPlayer(p) {
    if (global._spawnCompanionsAtPlayer) return global._spawnCompanionsAtPlayer(p);
    // Fallback: position companions at player manually
    const comps = state.companionState[p.charId] || [];
    for (const comp of comps) {
        comp.mapId = p.mapId;
        comp.x = p.x;
        comp.y = p.y;
    }
}

// --- _upsertMemory ---
// Persist NPC memory (facts + reputation) to the database.
async function _upsertMemory(db, charId, npcName, facts, reputation) {
    try {
        await db.query(
            `INSERT INTO npc_memories (char_id, npc_name, facts_json, reputation)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                 facts_json  = VALUES(facts_json),
                 reputation  = VALUES(reputation),
                 last_seen   = CURRENT_TIMESTAMP`,
            [charId, npcName, JSON.stringify(facts), Math.max(-100, Math.min(100, reputation))]
        );
    } catch (err) { console.warn('npc memory save failed:', err.message); }
}

// =============================================================
// PLAYER TITLE SYSTEM
// =============================================================
// TEACHING: Titles are derived on-the-fly — no DB column needed.
// We look at three things: reputation average, rumor count, and level.
// The NPC uses this title when addressing the player, making them
// feel recognised. High-rep players get heroic titles; low-rep
// players get ominous ones. Fresh characters get nothing.
async function _deriveTitle(charId, db) {
    try {
        const [[repRow]]  = await db.query(
            'SELECT AVG(reputation) as avg_rep FROM npc_memories WHERE char_id=?', [charId]);
        const [[rumRow]]  = await db.query(
            'SELECT COUNT(*) as cnt FROM npc_rumors WHERE char_id=? AND spread_count > 0', [charId]);
        const [[charRow]] = await db.query(
            'SELECT level, battle_record FROM characters WHERE id=?', [charId]);

        const rep    = repRow?.avg_rep  || 0;
        const rumors = rumRow?.cnt       || 0;
        const level  = charRow?.level    || 1;
        const wins   = JSON.parse(charRow?.battle_record || '{"W":0}').W || 0;

        if (rep >= 70 && rumors >= 3)  return 'the Renowned';
        if (rep >= 50 && level >= 10)  return 'the Trusted';
        if (wins >= 20)                return 'the Proven';
        if (rep >= 40)                 return 'the Welcomed';
        if (rep <= -60 && rumors >= 2) return 'the Feared';
        if (rep <= -40)                return 'the Distrusted';
        if (level >= 20)               return 'the Veteran';
        return null; // No title yet
    } catch (e) { return null; }
}

// =============================================================
// FACTION HELPERS
// =============================================================
// TEACHING: Factions group NPCs so players have a broader
// standing with an organisation, not just one person.
// Helping a faction NPC gives faction XP. Rival factions lose rep.

async function _updateFactionRep(db, charId, factionId, delta) {
    try {
        await db.query(
            `INSERT INTO player_faction_rep (char_id, faction_id, reputation) VALUES (?,?,?)
             ON DUPLICATE KEY UPDATE reputation = GREATEST(-100, LEAST(100, reputation + ?))`,
            [charId, factionId, Math.max(-100, Math.min(100, delta)), delta]);

        // Cascade to rival faction (opposite effect at 50%)
        const [[faction]] = await db.query(
            'SELECT rival_id FROM factions WHERE id=?', [factionId]);
        if (faction?.rival_id) {
            const rivalDelta = Math.round(-delta * 0.5);
            if (rivalDelta !== 0) {
                await db.query(
                    `INSERT INTO player_faction_rep (char_id, faction_id, reputation) VALUES (?,?,?)
                     ON DUPLICATE KEY UPDATE reputation = GREATEST(-100, LEAST(100, reputation + ?))`,
                    [charId, faction.rival_id, Math.max(-100, Math.min(100, rivalDelta)), rivalDelta]);
            }
        }
    } catch (e) { console.warn('updateFactionRep failed:', e.message); }
}

// Get the faction (if any) that an NPC belongs to
async function _getNpcFaction(db, npcId) {
    const [[row]] = await db.query(
        `SELECT f.id, f.name, f.icon FROM factions f
         JOIN npc_factions nf ON nf.faction_id = f.id
         WHERE nf.npc_id = ? LIMIT 1`, [npcId]);
    return row || null;
}

// ═══════════════════════════════════════════════════════════════
// COMPANION AFFINITY & QUEST HANDLERS
// ═══════════════════════════════════════════════════════════════

async function handleCompanionAffinity(socket, db, data) {
    const charId = state.onlinePlayers[socket.id]?.charId;
    if (!charId || !data?.npcId) return;

    try {
        // Get companion affinity
        const [[comp]] = await db.query(
            'SELECT affinity, affinity_level FROM character_companions WHERE character_id=? AND npc_id=?',
            [charId, data.npcId]);
        const affinity = comp?.affinity || 0;

        // Get tiers
        const [tiers] = await db.query(
            'SELECT * FROM game_companion_affinity_tiers ORDER BY affinity_required ASC');
        let currentTierName = 'Stranger';
        let nextTier = null;
        for (let i = 0; i < tiers.length; i++) {
            if (affinity >= tiers[i].affinity_required) {
                currentTierName = tiers[i].name;
                nextTier = tiers[i + 1] || null;
            }
        }

        // Get companion quests for this NPC
        const [allQuests] = await db.query(
            `SELECT cq.*, COALESCE(p.status, 'locked') as status, p.progress_json
             FROM game_companion_quests cq
             LEFT JOIN character_companion_quest_progress p
               ON p.companion_quest_id = cq.id AND p.character_id = ?
             WHERE cq.npc_id = ? AND cq.is_active = 1
             ORDER BY cq.quest_order ASC`,
            [charId, data.npcId]);

        // Compute availability for locked quests
        const quests = allQuests.map(q => {
            if (q.status === 'locked') {
                const affinityMet = affinity >= q.affinity_required;
                const prereqMet = !q.prerequisite_quest_id ||
                    allQuests.some(pq => pq.id === q.prerequisite_quest_id && pq.status === 'completed');
                if (affinityMet && prereqMet) q.status = 'available';
            }
            return q;
        });

        socket.emit('companion_affinity', {
            npcId: data.npcId, affinity, tierName: currentTierName, nextTier, quests
        });
    } catch (e) { console.warn('companion_get_affinity failed:', e.message); }
}

async function handleCompanionQuestAccept(socket, db, data) {
    const charId = state.onlinePlayers[socket.id]?.charId;
    if (!charId || !data?.questId) return;

    try {
        const [[quest]] = await db.query(
            'SELECT * FROM game_companion_quests WHERE id=? AND is_active=1', [data.questId]);
        if (!quest) return socket.emit('companion_quest_result', { success: false, message: 'Quest not found', npcId: data.npcId });

        // Check affinity
        const [[comp]] = await db.query(
            'SELECT affinity FROM character_companions WHERE character_id=? AND npc_id=?',
            [charId, quest.npc_id]);
        if (!comp || comp.affinity < quest.affinity_required) {
            return socket.emit('companion_quest_result', { success: false, message: 'Not enough affinity', npcId: quest.npc_id });
        }

        // Check prerequisite
        if (quest.prerequisite_quest_id) {
            const [[prereq]] = await db.query(
                'SELECT status FROM character_companion_quest_progress WHERE character_id=? AND companion_quest_id=?',
                [charId, quest.prerequisite_quest_id]);
            if (!prereq || prereq.status !== 'completed') {
                return socket.emit('companion_quest_result', { success: false, message: 'Complete the previous quest first', npcId: quest.npc_id });
            }
        }

        // Accept
        await db.query(
            `INSERT INTO character_companion_quest_progress (character_id, companion_quest_id, status, started_at)
             VALUES (?,?,?,NOW()) ON DUPLICATE KEY UPDATE status='active', started_at=NOW()`,
            [charId, data.questId, 'active']);

        socket.emit('companion_quest_result', { success: true, message: `Quest accepted: ${quest.title}`, npcId: quest.npc_id });
    } catch (e) { console.warn('companion_quest_accept failed:', e.message); }
}
