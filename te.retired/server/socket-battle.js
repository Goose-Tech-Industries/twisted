// =================================================================
// server/socket-battle.js — All battle-related socket handlers
// =================================================================
// TEACHING: This is the largest socket handler module because combat
// touches everything — PvE, PvP, duels, 3v3, parties, companions,
// negotiations, spectating, tournaments, real-time combat, raids,
// async PvP, blue mage skill learning, and the job system.
//
// Every handler follows the same pattern:
//   1. Look up the player via state.onlinePlayers[socket.id]
//   2. Validate inputs (is the player online? is it their turn? etc.)
//   3. Call BattleManager for the heavy lifting
//   4. Emit results back to the relevant sockets
//
// The `ctx` object provides { db, io } so we don't import globals.
// =================================================================

const state = require('./state');
const BattleManager = require('../battle_engine');
const ai = require('./ai-features');

// TEACHING: We keep a simple in-memory pendingDuels Map so we can
// expire requests without hitting the DB on every tick. Duels that
// result in a battle reuse the existing BattleManager.startBattle()
// so all combat rules, XP, and gold rewards are identical.
const pendingDuels = new Map(); // requestId → { challengerId, targetId, wagerAmount, timer }

module.exports = function registerBattleHandlers(socket, ctx) {
    const { db, io } = ctx;

    // =============================================================
    // DUEL SYSTEM
    // =============================================================
    // Requests expire after 60 seconds automatically.

    socket.on('duel_challenge', async ({ targetId, wagerAmount = 0 }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;

            // Sanitise wager
            const wager = Math.max(0, Math.floor(Number(wagerAmount) || 0));

            // Check challenger can afford the wager
            if (wager > 0) {
                const [[wallet]] = await db.query('SELECT currency FROM users WHERE id=?', [p.userId]);
                if (!wallet || wallet.currency < wager) {
                    socket.emit('duel_error', 'Insufficient gold for that wager.');
                    return;
                }
            }

            // Find target
            const targetEntry = Object.entries(state.onlinePlayers)
                .find(([, pl]) => pl.charId === parseInt(targetId));
            if (!targetEntry) { socket.emit('duel_error', 'Player not found or offline.'); return; }
            const [tSockId, target] = targetEntry;

            // Don't allow duels against yourself
            if (target.charId === p.charId) { socket.emit('duel_error', 'You cannot challenge yourself.'); return; }

            // Check no existing pending duel between these two
            for (const [, d] of pendingDuels) {
                if (d.challengerId === p.charId && d.targetId === target.charId) {
                    socket.emit('duel_error', 'You already have a pending challenge with this player.');
                    return;
                }
            }

            const requestId = `duel_${p.charId}_${target.charId}_${Date.now()}`;
            const payload = {
                id: requestId,
                challengerId: p.charId,
                challengerName: p.name,
                challengerLevel: p.level,
                targetId: target.charId,
                wagerAmount: wager,
                expiresAt: Date.now() + 60000,
            };

            // Auto-expire after 60s
            const timer = setTimeout(() => {
                if (pendingDuels.has(requestId)) {
                    pendingDuels.delete(requestId);
                    socket.emit('duel_expired', { requestId });
                }
            }, 60000);

            pendingDuels.set(requestId, { ...payload, timer, challengerSocketId: socket.id });

            // Forward to target
            const tSock = io.sockets.sockets.get(tSockId);
            if (tSock) tSock.emit('duel_request', payload);

            socket.emit('notification', { text: `⚔️ Duel challenge sent to ${target.name}!`, type: 'info' });
        } catch (e) { console.error('duel_challenge error:', e); }
    });

    socket.on('duel_accept', async ({ requestId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;

            const duel = pendingDuels.get(requestId);
            if (!duel) { socket.emit('duel_error', 'Duel request expired or not found.'); return; }
            if (duel.targetId !== p.charId) { socket.emit('duel_error', 'This challenge was not for you.'); return; }

            clearTimeout(duel.timer);
            pendingDuels.delete(requestId);

            // Notify challenger
            const challSock = io.sockets.sockets.get(duel.challengerSocketId);
            if (challSock) challSock.emit('duel_accepted', { requestId, accepterName: p.name });

            // Hold wager escrow — deduct from both upfront, winner gets both back
            if (duel.wagerAmount > 0) {
                await db.query('UPDATE users SET currency=currency-? WHERE id=?', [duel.wagerAmount, state.onlinePlayers[duel.challengerSocketId]?.userId || 0]);
                await db.query('UPDATE users SET currency=currency-? WHERE id=?', [duel.wagerAmount, p.userId]);
            }

            // Start the battle using the existing PvP battle system
            const battleId = await BattleManager.startBattle(
                db, io,
                { charId: duel.challengerId, socketId: duel.challengerSocketId },
                { charId: p.charId, socketId: socket.id },
                'PVP',
                { wager: duel.wagerAmount, isDuel: true }
            );

            if (!battleId) {
                // Refund wager if battle failed to start
                if (duel.wagerAmount > 0) {
                    const challUserId = state.onlinePlayers[duel.challengerSocketId]?.userId;
                    if (challUserId) await db.query('UPDATE users SET currency=currency+? WHERE id=?', [duel.wagerAmount, challUserId]);
                    await db.query('UPDATE users SET currency=currency+? WHERE id=?', [duel.wagerAmount, p.userId]);
                }
                socket.emit('duel_error', 'Failed to start battle. Please try again.');
            }
        } catch (e) { console.error('duel_accept error:', e); }
    });

    socket.on('duel_decline', async ({ requestId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;

            const duel = pendingDuels.get(requestId);
            if (!duel) return; // already expired — no-op

            clearTimeout(duel.timer);
            pendingDuels.delete(requestId);

            // Notify challenger of the decline
            const challSock = io.sockets.sockets.get(duel.challengerSocketId);
            if (challSock) challSock.emit('duel_declined', { requestId, declinerName: p.name });

            socket.emit('notification', { text: 'Duel challenge declined.', type: 'info' });
        } catch (e) { console.error('duel_decline error:', e); }
    });

    // =============================================================
    // BATTLE SYSTEM SOCKET HANDLERS
    // =============================================================

    // 5a. PVP CHALLENGE
    socket.on('battle_challenge', async ({ targetCharId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;

            // Find target's socket
            const targetEntry = Object.entries(state.onlinePlayers).find(([, pl]) => pl.charId === targetCharId);
            if (!targetEntry) { socket.emit('battle_error', 'Player not found.'); return; }
            const targetSocket = io.sockets.sockets.get(targetEntry[0]);
            if (!targetSocket) { socket.emit('battle_error', 'Player offline.'); return; }
            const target = state.onlinePlayers[targetEntry[0]];

            // --- ARENA VALIDATION ---
            // TEACHING: PvP challenges are only allowed inside arena zones.
            // This keeps open-world areas peaceful and gives players a clear
            // "safe zone vs danger zone" mental model. The arena type controls
            // extra rules:
            //   OPEN_PVP:     Both players must be in the SAME arena zone.
            //   QUEUE:        Both players must be in ANY arena zone (matchmaker
            //                 will pair them — handled by future QUEUE system).
            //   TOURNAMENT:   Brackets only — manual challenge not allowed.
            //   KING_OF_HILL: Anyone in zone can challenge anyone else in zone.

            // REGION SANCTUARY: block ALL PvP in sanctuary regions
            try {
                const getRegionForMap = global.getRegionForMap;
                const challRegion = await getRegionForMap(p.mapId);
                const targRegion  = await getRegionForMap(target.mapId);
                if (challRegion?.is_sanctuary) {
                    socket.emit('battle_error', `${challRegion.name} is a sanctuary — no combat here.`);
                    return;
                }
                if (targRegion?.is_sanctuary) {
                    socket.emit('battle_error', `${target.name} is in a sanctuary zone.`);
                    return;
                }
            } catch {}

            if (!p.inArena) {
                socket.emit('battle_error', 'You must be inside an arena zone to challenge players.');
                return;
            }
            if (!target.inArena) {
                socket.emit('battle_error', `${target.name} is not in an arena zone.`);
                return;
            }
            if (p.inArena.arenaId !== target.inArena.arenaId) {
                socket.emit('battle_error', 'You must be in the same arena zone to challenge.');
                return;
            }
            if (p.inArena.arenaType === 'TOURNAMENT') {
                socket.emit('battle_error', 'This is a tournament arena — challenges are bracket-only.');
                return;
            }
            if (p.inArena.arenaType === 'QUEUE') {
                socket.emit('battle_error', 'This is a matchmaking queue arena — use the queue system to get paired.');
                return;
            }

            // Send challenge — include arena context so the target's toast shows it
            targetSocket.emit('battle_challenged', {
                challengerName:   p.name,
                challengerCharId: p.charId,
                arenaName:        p.inArena.arenaName
            });
        } catch (err) { console.error('Challenge error:', err); }
    });

    // 5b. ACCEPT PVP
    socket.on('battle_accept', async ({ challengerCharId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const challengerEntry = Object.entries(state.onlinePlayers).find(([, pl]) => pl.charId === challengerCharId);
            if (!challengerEntry) return;
            const challengerSocket = io.sockets.sockets.get(challengerEntry[0]);

            const battleId = await BattleManager.createBattle(db, io, challengerSocket, socket, challengerCharId, p.charId, 'PVP');
            if (battleId) {
                // Join battle room and tag sockets with their charId
                socket.join('battle_' + battleId);
                socket._battleCharId = p.charId;
                if (challengerSocket) {
                    challengerSocket.join('battle_' + battleId);
                    challengerSocket._battleCharId = challengerCharId;
                }
            }
        } catch (err) { console.error("Battle accept error:", err); }
    });

    // 5c-post. POST-BATTLE ACTION CHAINS
    // Listens for 'battle_ended_for_socket' emitted at the end of endBattle()
    // when the socket has stashed on_win / on_lose actions.
    socket.on('_run_post_battle', async ({ won }) => {
        try {
            const hooks = socket._postBattleActions;
            if (!hooks) return;
            socket._postBattleActions = null;
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const actions = won ? hooks.on_win : hooks.on_lose;
            if (!actions || !actions.length) return;
            // Re-use the full event runner
            const { executeActions } = require('../event_runner.js');
            const [stateRow] = await db.query('SELECT state_json FROM characters WHERE id=?', [p.charId]);
            const charState = stateRow.length ? state.safeJsonParse(stateRow[0].state_json, {}) : {};
            await executeActions({ actions, socket, player: p, state: charState, db });
        } catch(e) { console.error('Post-battle chain error:', e); }
    });

    // ─── BATTLE MOVE (tactical grid) ────────────────────────────────
    // Separate from battle_action — movement is free each turn.
    // TEACHING: In BG3, movement and your action are independent budgets.
    // Here, you get one free move per turn plus one action.
    // The server validates distance and tile occupancy, then broadcasts
    // updated grid positions to all battle watchers.
    socket.on('battle_move', async ({ battleId, x, y }) => {
        try {
            // activeBattles isn't exported — we access it via BattleManager shim below
            // Actually use the exported getBattle helper:
            const battle = BattleManager.getBattle(parseInt(battleId));
            if (!battle || battle.status !== 'ACTIVE') return;

            const charId = socket._battleCharId;
            if (!charId || !battle.combatants[charId]) return;
            // Check if this socket's character is on any team in the battle
            const myTeamId = battle.getTeamId(charId);
            if (battle.turnCharId !== charId && !myTeamId) return;

            // In 3v3: the socket owns ALL player chars — allow movement for
            // any of their characters whose turn it is
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const actor = battle.combatants[battle.turnCharId];
            if (!actor) return;
            // Make sure this socket owns the current actor
            const [ownerRow] = await db.query('SELECT user_id FROM characters WHERE id=?', [actor.charId]);
            if (!ownerRow.length || ownerRow[0].user_id !== p.userId) return;

            // Save previous position for opportunity attack check
            actor._prevGridX = actor.gridX;
            actor._prevGridY = actor.gridY;

            const err = battle.moveCombatant(actor.charId, parseInt(x), parseInt(y));
            if (err) {
                socket.emit('battle_error', err);
                return;
            }

            const moveLogs = [`🚶 ${actor.name} moves.`];

            // Tabletop: opportunity attacks when leaving melee range
            const tabletop = require('./battle/tabletop-rules');
            if (tabletop.isSubEnabled(battle._settings, 'tabletop_opportunity_attacks')) {
                const oaResults = tabletop.checkOpportunityAttack(actor, battle, battle._settings);
                for (const oa of oaResults) {
                    moveLogs.push(oa.message);
                    battle.addLog({ actor: oa.attacker, action: 'OA', text: oa.message });
                }
            }

            battle.addLog({ actor: actor.name, action: 'MOVE', text: `${actor.name} moves to (${x},${y}).` });
            io.to('battle_' + battle.id).emit('battle_grid_update', {
                grid: battle.getGridState(),
                hasMoved: true,
                log: moveLogs
            });
        } catch(e) { console.error('battle_move error:', e); }
    });

    // ─── PvP 3v3 CHALLENGE (multi-character) ────────────────────────
    // challenger sends: { targetUserId, myCharIds: [1,2,3] }
    // Server validates ownership, looks up target's pvp_team, creates battle.
    socket.on('battle_challenge_3v3', async ({ targetUserId, myCharIds }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            if (!Array.isArray(myCharIds) || myCharIds.length < 1) return;

            // Read max team size from battle settings (supports up to 20v20)
            let maxTeam = 10;
            try {
                const [szRow] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='max_team_size' LIMIT 1");
                if (szRow.length) maxTeam = parseInt(szRow[0].setting_value) || 10;
            } catch {}
            const teamIds = myCharIds.slice(0, maxTeam);

            // Validate ALL chars belong to this user
            const [myRows] = await db.query(
                `SELECT id FROM characters WHERE id IN (${teamIds.map(()=>'?').join(',')}) AND user_id=?`,
                [...teamIds, p.userId]
            );
            if (myRows.length !== teamIds.length) {
                socket.emit('battle_error', 'Some characters do not belong to you.');
                return;
            }

            // Find target user's active pvp_team
            const [tTeamRow] = await db.query(
                "SELECT team_chars FROM character_pvp_teams WHERE user_id=? AND is_active=1 LIMIT 1",
                [targetUserId]);
            let targetCharIds = [];
            if (tTeamRow.length) {
                try { targetCharIds = JSON.parse(tTeamRow[0].team_chars || '[]'); } catch {}
            }
            // Fallback: pick their first N characters
            if (!targetCharIds.length) {
                const [fallback] = await db.query(
                    'SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT ?',
                    [targetUserId, maxTeam]);
                targetCharIds = fallback.map(r => r.id);
            }
            targetCharIds = targetCharIds.slice(0, maxTeam);

            if (!targetCharIds.length) {
                socket.emit('battle_error', 'Target has no characters to battle with.');
                return;
            }

            // Find target socket
            const targetEntry = Object.entries(state.onlinePlayers).find(([,pl]) => pl.userId === targetUserId);
            if (!targetEntry) {
                socket.emit('battle_error', 'That player is not online.');
                return;
            }
            const targetSocket = io.sockets.sockets.get(targetEntry[0]);

            // Notify target of the challenge
            if (targetSocket) {
                targetSocket.emit('battle_challenged_3v3', {
                    challengerUserId: p.userId,
                    challengerName: p.charName || p.username,
                    myCharIds: teamIds
                });
            }
            // Store pending challenge
            if (!targetSocket._pending3v3) targetSocket._pending3v3 = {};
            targetSocket._pending3v3[p.userId] = {
                challengerSocket: socket,
                challengerCharIds: teamIds,
                targetCharIds
            };
        } catch(e) { console.error('3v3 challenge error:', e); }
    });

    socket.on('battle_accept_3v3', async ({ challengerUserId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const pending = socket._pending3v3 && socket._pending3v3[challengerUserId];
            if (!pending) { socket.emit('battle_error', 'No pending challenge.'); return; }
            delete socket._pending3v3[challengerUserId];

            const { challengerSocket, challengerCharIds, targetCharIds } = pending;

            // Build socketMap: each user socket handles ALL their team's turns
            // We tag the socket with ALL their battle char IDs
            const challengerSocketMap = {};
            const targetSocketMap     = {};
            for (const id of challengerCharIds) challengerSocketMap[id] = challengerSocket;
            for (const id of targetCharIds)     targetSocketMap[id]     = socket;

            const battleId = await BattleManager.createPartyBattle(
                db, io,
                challengerCharIds, targetCharIds,
                { ...challengerSocketMap, ...targetSocketMap },
                'PVP_3v3'
            );
            if (battleId) {
                // Tag both sockets with their FIRST char (processAction checks ownership)
                socket._battleCharId         = targetCharIds[0];
                socket._battleTeamIds        = targetCharIds;
                if (challengerSocket) {
                    challengerSocket._battleCharId  = challengerCharIds[0];
                    challengerSocket._battleTeamIds = challengerCharIds;
                }
            }
        } catch(e) { console.error('3v3 accept error:', e); }
    });

    // 5c-party. PARTY PVE BATTLE
    // Leader sends: { enemyNpcIds: [3, 4] }
    // Server loads all online party members and starts a multi-combatant battle.
    // All party sockets get battle_start automatically via createPartyBattle().
    socket.on('start_party_pve_battle', async ({ enemyNpcIds }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p || !Array.isArray(enemyNpcIds) || !enemyNpcIds.length) return;

            // Find the player's active party
            const [partyRows] = await db.query(
                `SELECT cpm.character_id FROM character_party_members cpm
                 JOIN character_parties cp ON cp.id = cpm.party_id
                 WHERE cp.leader_id = ? AND cp.is_active = 1 AND cpm.is_active = 1`,
                [p.charId]
            );

            // Party members who are online right now
            let memberCharIds = partyRows.map(r => r.character_id);
            if (!memberCharIds.includes(p.charId)) memberCharIds.unshift(p.charId);

            const socketMap = {};
            for (const [sid, pl] of Object.entries(state.onlinePlayers)) {
                if (memberCharIds.includes(pl.charId)) {
                    const sock = io.sockets.sockets.get(sid);
                    if (sock) socketMap[pl.charId] = sock;
                }
            }
            // Enforce max_dungeon_size from settings
            const [dsRow] = await db.query(
                "SELECT value FROM game_settings WHERE `key`='max_dungeon_size' LIMIT 1");
            const maxDungeon = dsRow.length ? (parseInt(dsRow[0].value) || 5) : 5;

            // Need at least the leader
            if (!socketMap[p.charId]) socketMap[p.charId] = socket;
            const onlineCharIds = Object.keys(socketMap).map(Number).slice(0, maxDungeon);

            const battleId = await BattleManager.createPartyBattle(
                db, io, onlineCharIds, enemyNpcIds, socketMap
            );
            if (!battleId) {
                socket.emit('error_msg', 'Could not start party battle — check that enemies are set up in AdminSauce.');
            }
        } catch(e) { console.error('Party PvE error:', e); }
    });

    // 5c. PVE BATTLE (from event_runner or encounter)
    // TEACHING: The client sends either:
    //   - An npc_id (game_npcs.id) — from random encounters and BATTLE map events
    //   - A char_id (characters.id) — from direct PvE challenges
    // We can't know which one arrived, so we always try to resolve via
    // game_npcs.char_id first. If no matching NPC row exists, we treat
    // the value as a direct char_id (for forward compatibility).
    socket.on('start_pve_battle', async ({ enemyCharId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;

            // Resolve: if this is a game_npcs.id, get its char_id
            let resolvedCharId = parseInt(enemyCharId);
            const [npcRows] = await db.query(
                'SELECT char_id FROM game_npcs WHERE id=? AND is_enemy=1',
                [resolvedCharId]
            );
            if (npcRows.length && npcRows[0].char_id) {
                resolvedCharId = npcRows[0].char_id;
            }
            // If NPC has no char_id yet, it was never synced — tell the player
            if (npcRows.length && !npcRows[0].char_id) {
                socket.emit('error_msg', 'This enemy has no combat stats yet. An admin needs to save it in AdminSauce with "Is Enemy" checked.');
                return;
            }

            // Check for active companions with combat stats
            const _bComps = getActiveCompanions(p.charId).filter(c => c.charId);
            let battleId;

            if (_bComps.length > 0) {
                // Use party battle: player + companions vs enemy
                // Companions are placed on the player team but marked as AI
                const playerCharIds = [p.charId];
                const companionCharIds = _bComps.map(c => c.charId);
                const companionTactics = {};
                for (const c of _bComps) companionTactics[c.charId] = c.tactics || 'BALANCED';

                // Build combined player team stats
                const allPlayerStats = await Promise.all(
                    playerCharIds.map(id => BattleManager.getEffectiveStats(db, id))
                );
                const companionStats = await Promise.all(
                    companionCharIds.map(id => BattleManager.getEffectiveStats(db, id))
                );
                // Mark companions as AI-controlled with tactics
                for (const cs of companionStats) {
                    if (cs) {
                        cs._isCompanionAI = true;
                        cs._tactics = companionTactics[cs.charId] || 'BALANCED';
                    }
                }

                const socketMap = { [p.charId]: socket };
                // Use createPartyBattle with the enemy npc_id
                battleId = await BattleManager.createPartyBattle(
                    db, io,
                    playerCharIds,
                    [parseInt(enemyCharId)],  // Pass the original npc_id
                    socketMap,
                    companionStats.filter(Boolean)  // Pass companion stats for ally AI
                );
            } else {
                battleId = await BattleManager.createBattle(db, io, socket, null, p.charId, resolvedCharId, 'PVE');
            }

            if (battleId) {
                socket.join('battle_' + battleId);
                socket._battleCharId = p.charId;
                // Notify map room that a battle started here
                const battles = BattleManager.getBattlesOnMap(p.mapId);
                io.to('map_' + p.mapId).emit('battles_on_map', battles);
            }
        } catch (err) { console.error('PVE start error:', err); }
    });

    // 5c-join. JOIN ONGOING BATTLE (mid-battle join)
    socket.on('join_battle', async ({ battleId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            if (socket._battleCharId) {
                socket.emit('error_msg', 'You are already in a battle.');
                return;
            }

            const battle = BattleManager.getBattle(battleId);
            if (!battle || battle.status !== 'ACTIVE') {
                socket.emit('error_msg', 'Battle not found or already ended.');
                return;
            }

            // Must be on the same map
            if (battle.mapId !== p.mapId) {
                socket.emit('error_msg', 'You must be on the same map to join.');
                return;
            }

            // Check allow_mid_battle_join setting for this zone
            try {
                const [arenas] = await db.query(
                    `SELECT allow_mid_battle_join FROM game_arenas
                     WHERE map_id=? AND enabled=1 AND ?>=x_min AND ?<=x_max AND ?>=y_min AND ?<=y_max LIMIT 1`,
                    [p.mapId, p.x, p.x, p.y, p.y]);
                // If in an arena zone, respect its setting. Otherwise default to allowed.
                if (arenas.length && !arenas[0].allow_mid_battle_join) {
                    socket.emit('error_msg', 'Mid-battle joining is not allowed in this zone.');
                    return;
                }
            } catch {}

            // Check max combatants
            const totalAlive = Object.values(battle.combatants).filter(c => c.currentHp > 0).length;
            if (totalAlive >= 8) {
                socket.emit('error_msg', 'Battle is full (max 8 combatants).');
                return;
            }

            // Load player stats and add to player team
            const stats = await BattleManager.getEffectiveStats(db, p.charId);
            if (!stats) {
                socket.emit('error_msg', 'Failed to load your stats.');
                return;
            }

            // Scale enemy stats for the new party size
            // Find the player's team and enemy teams
            const joinTeamId = battle.getTeamIds().find(t =>
                (battle.teams[t] || []).some(id => battle.combatants[id] && !battle.combatants[id].isAI)
            ) || 'players';
            const enemyTeamIds = battle.getTeamIds().filter(t => t !== joinTeamId);
            const newPlayerCount = (battle.teams[joinTeamId] || []).filter(
                id => battle.combatants[id]?.currentHp > 0).length + 1;
            const factor = await BattleManager.getScalingFactor(db, p.mapId);
            // Re-scale remaining enemies based on new player count
            const allEnemyIds = enemyTeamIds.flatMap(t => battle.teams[t] || []);
            for (const eid of allEnemyIds) {
                const e = battle.combatants[eid];
                if (!e || e.currentHp <= 0) continue;
                const hpPct = e.currentHp / e.maxHp;
                const newMax = Math.round(e._baseMaxHp || e.maxHp);
                const scaled = BattleManager.applyEnemyScaling({ maxHp: newMax, currentHp: newMax,
                    atk: e._baseAtk || e.atk, def: e._baseDef || e.def,
                    mo: e._baseMo || e.mo, md: e._baseMd || e.md,
                    speed: e._baseSpeed || e.speed }, newPlayerCount, factor);
                // Store base stats on first scale
                if (!e._baseMaxHp) {
                    e._baseMaxHp = e.maxHp; e._baseAtk = e.atk; e._baseDef = e.def;
                    e._baseMo = e.mo; e._baseMd = e.md; e._baseSpeed = e.speed;
                }
                e.maxHp = scaled.maxHp;
                e.currentHp = Math.round(scaled.maxHp * hpPct); // preserve HP%
                e.atk = scaled.atk; e.def = scaled.def;
                e.mo = scaled.mo; e.md = scaled.md; e.speed = scaled.speed;
            }

            battle.addCombatant(stats, joinTeamId, false);

            // Join socket rooms
            socket.join('battle_' + battleId);
            socket._battleCharId = p.charId;

            // Record participant
            try {
                await db.query(
                    'INSERT IGNORE INTO game_battle_participants (battle_id,character_id,team,is_ai) VALUES (?,?,1,0)',
                    [battleId, p.charId]);
            } catch {}

            // Get commands for the new player
            const cmds = await BattleManager.getAvailableCommands(db, stats);

            // Send battle_start to the joining player
            socket.emit('battle_start', { ...battle.toClientState(p.charId), commands: cmds });

            // Broadcast updated state to all existing participants
            await BattleManager.broadcastBattleUpdate(io, battle, { text: `${stats.name} joins the fight!` }, db);

            // Update map battle indicators
            const battles = BattleManager.getBattlesOnMap(p.mapId);
            io.to('map_' + p.mapId).emit('battles_on_map', battles);

        } catch (err) { console.error('Join battle error:', err); }
    });

    // 5c-query. GET BATTLES ON MAP (for UI indicators)
    socket.on('get_battles_on_map', () => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        const battles = BattleManager.getBattlesOnMap(p.mapId);
        socket.emit('battles_on_map', battles);
    });

    // 5d. BATTLE ACTION (Attack, Skill, Item, Defend, Run, Limit)
    socket.on('battle_action', async (data) => {
        try {
            await BattleManager.processAction(db, io, socket, data);
        } catch (err) { console.error("Battle action error:", err); }
    });

    // =============================================================
    // 6b. BATTLE CHAT + SURRENDER + EMOTES (Session 5)
    // =============================================================

    // Battle chat — real-time text between all combatants
    socket.on('battle_chat', async ({ battleId, text }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const battle = BattleManager.getBattle(parseInt(battleId));
            if (!battle || battle.status !== 'ACTIVE') return;
            if (!battle.combatants[p.charId]) return; // not in this battle
            const msg = String(text || '').trim().slice(0, 200).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            if (!msg) return;
            const payload = {
                from: p.name, fromCharId: p.charId,
                teamId: battle.getTeamId(p.charId),
                text: msg, ts: Date.now()
            };
            // Broadcast to all sockets in the battle room
            io.to('battle_' + battleId).emit('battle_chat_msg', payload);
            // Also persist in battle log for replay
            battle.addLog({ actor: p.name, text: `[Chat] ${msg}`, type: 'chat' });
        } catch (e) { console.error('battle_chat error:', e.message); }
    });

    // Battle emote — visual effect on grid
    socket.on('battle_emote', async ({ battleId, emote }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const battle = BattleManager.getBattle(parseInt(battleId));
            if (!battle || battle.status !== 'ACTIVE') return;
            if (!battle.combatants[p.charId]) return;
            const validEmotes = ['taunt', 'respect', 'laugh', 'rage', 'wave'];
            if (!validEmotes.includes(emote)) return;
            const emoteIcons = { taunt: '😤', respect: '🫡', laugh: '😂', rage: '🔥', wave: '👋' };
            const payload = {
                from: p.name, fromCharId: p.charId, emote,
                icon: emoteIcons[emote] || '❓',
                gridX: battle.combatants[p.charId].gridX,
                gridY: battle.combatants[p.charId].gridY
            };
            io.to('battle_' + battleId).emit('battle_emote_show', payload);
            battle.addLog({ actor: p.name, text: `${emoteIcons[emote]} ${p.name} ${emote}s!`, type: 'emote' });
        } catch (e) { console.error('battle_emote error:', e.message); }
    });

    // Surrender — ends battle, opposing team(s) win
    socket.on('battle_surrender', async ({ battleId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const battle = BattleManager.getBattle(parseInt(battleId));
            if (!battle || battle.status !== 'ACTIVE') return;
            if (!battle.combatants[p.charId]) return;

            // Check if surrender is allowed (arena setting)
            // Default: allowed in PvP, not in PvE
            if (battle.type === 'PVE' || battle.type === 'PARTY_PVE') {
                socket.emit('battle_error', 'Cannot surrender in PvE — use Flee instead.');
                return;
            }

            const myTeamId = battle.getTeamId(p.charId);
            // Kill all members of the surrendering team (HP to 0)
            for (const cid of (battle.teams[myTeamId] || [])) {
                if (battle.combatants[cid]) battle.combatants[cid].currentHp = 0;
            }

            battle.addLog({ actor: 'system', text: `🏳️ ${p.name}'s team surrenders!` });
            battle.checkWinCondition();

            const result = { actor: 'system', actions: [], log: [`🏳️ ${p.name}'s team surrenders!`] };
            result.actions.push({ type: 'surrender', team: myTeamId, name: p.name });
            await BattleManager.broadcastBattleUpdate(io, battle, result, db);

            if (battle.status === 'FINISHED') {
                await BattleManager.endBattle(db, io, battle);
            }
        } catch (e) { console.error('battle_surrender error:', e.message); }
    });

    // =============================================================
    // 6c. MID-BATTLE NEGOTIATION / DIPLOMACY (Session 6)
    // =============================================================

    // Negotiate with an enemy (NPC or player)
    socket.on('battle_negotiate', async ({ battleId, targetCharId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const battle = BattleManager.getBattle(parseInt(battleId));
            if (!battle || battle.status !== 'ACTIVE') return;
            const actor = battle.combatants[p.charId];
            if (!actor) return;
            const target = battle.combatants[parseInt(targetCharId)];
            if (!target || target.currentHp <= 0) {
                socket.emit('battle_error', 'Invalid target for negotiation.');
                return;
            }
            if (target.teamId === actor.teamId) {
                socket.emit('battle_error', 'Already on your team!');
                return;
            }
            // Must be the actor's turn
            if (battle.turnCharId !== p.charId) {
                socket.emit('battle_error', 'Not your turn.');
                return;
            }
            // Range check: must be within 3 tiles (talking distance)
            if (actor.gridX !== undefined && target.gridX !== undefined) {
                const dist = Math.max(Math.abs(actor.gridX - target.gridX), Math.abs(actor.gridY - target.gridY));
                if (dist > 3) {
                    socket.emit('battle_error', `Too far to negotiate. Move closer (dist ${dist}, need ≤3).`);
                    return;
                }
            }

            if (target.isAI) {
                // ── NPC NEGOTIATION ──────────────────────────────
                // Load NPC persona for AI dialogue
                let persona = 'A hostile creature.';
                let npcName = target.name;
                try {
                    const [npcRow] = await db.query('SELECT persona, name FROM game_npcs WHERE char_id=? LIMIT 1', [target.charId]);
                    if (npcRow.length && npcRow[0].persona) persona = npcRow[0].persona;
                    if (npcRow.length && npcRow[0].name) npcName = npcRow[0].name;
                } catch {}

                // Store persona on combatant for willingness calc
                target._persona = persona;
                const willingness = BattleManager.calculateNpcWillingness(target);
                const success = willingness >= 45; // threshold

                // Try AI dialogue
                let dialogue = '';
                try {
                    const aiConfig = await state.loadAiConfig(db);
                    if (aiConfig && aiConfig.provider && aiConfig.provider !== 'disabled') {
                        const { getNpcReply } = require('../npc_brain');
                        const hpPct = Math.round((target.currentHp / target.maxHp) * 100);
                        const negotiatePrompt = success
                            ? `The player ${actor.name} is trying to convince you to switch sides mid-battle. You are wounded (${hpPct}% HP) and considering it. Reluctantly agree to join them. Stay in character.`
                            : `The player ${actor.name} is trying to convince you to switch sides mid-battle. You refuse defiantly. Stay in character.`;
                        dialogue = await getNpcReply({
                            npc: { name: npcName, persona },
                            player: { name: actor.name, level: actor.level || 1 },
                            message: negotiatePrompt,
                            history: [], memory: { facts: [], reputation: 0 },
                            worldFlags: {}, region: null, aiConfig
                        });
                    }
                } catch {}

                if (!dialogue) {
                    dialogue = success
                        ? `*${npcName} lowers their weapon* "...Fine. I'll fight with you. But this changes nothing between us."`
                        : `*${npcName} snarls* "You think I'd betray my own? Never!"`;
                }

                if (success) {
                    battle.switchTeam(target.charId, actor.teamId);
                    target.isAI = true; // stays AI-controlled but on player's team now
                }

                const result = { actor: actor.name, actions: [], log: [] };
                result.log.push(`🤝 ${actor.name} attempts to negotiate with ${npcName}...`);
                result.actions.push({ type: 'negotiate', target: npcName, success, willingness });
                battle.addLog({ actor: actor.name, text: `🤝 Negotiation with ${npcName}: ${success ? 'SUCCESS' : 'FAILED'} (willingness: ${willingness}%)` });

                // Broadcast the negotiation result
                await BattleManager.broadcastBattleUpdate(io, battle, result, db);

                // Send detailed dialogue to the negotiator
                socket.emit('negotiate_result', {
                    success, willingness, targetName: npcName,
                    dialogue, targetCharId: target.charId
                });

                // End turn after negotiation (uses the action)
                battle.checkWinCondition();
                if (battle.status !== 'ACTIVE') {
                    await BattleManager.endBattle(db, io, battle);
                    return;
                }
                battle.nextTurn();
                await BattleManager.broadcastBattleUpdate(io, battle, null, db);
                const nextActor = battle.getCombatant(battle.turnCharId);
                if (nextActor && nextActor.isAI) setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1200);

            } else {
                // ── PLAYER NEGOTIATION ───────────────────────────
                // Send a request to the target player to switch teams
                try {
                    const allSocks = await io.in('battle_' + battleId).fetchSockets();
                    const targetSock = allSocks.find(s => s._battleCharId === target.charId);
                    if (targetSock) {
                        targetSock.emit('negotiate_request', {
                            fromName: actor.name, fromCharId: actor.charId,
                            toTeamId: actor.teamId, battleId: parseInt(battleId)
                        });
                        socket.emit('negotiate_result', {
                            success: null, targetName: target.name,
                            dialogue: `Waiting for ${target.name} to respond...`,
                            targetCharId: target.charId, pending: true
                        });
                        battle.addLog({ actor: actor.name, text: `🤝 ${actor.name} proposes an alliance to ${target.name}...` });
                        await BattleManager.broadcastBattleUpdate(io, battle, {
                            actor: actor.name, log: [`🤝 ${actor.name} proposes an alliance to ${target.name}...`], actions: []
                        }, db);
                    }
                } catch {}
            }
        } catch (e) { console.error('battle_negotiate error:', e); }
    });

    // Player responds to a negotiate request (accept/decline alliance)
    socket.on('negotiate_respond', async ({ battleId, fromCharId, accept }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const battle = BattleManager.getBattle(parseInt(battleId));
            if (!battle || battle.status !== 'ACTIVE') return;
            const responder = battle.combatants[p.charId];
            const proposer = battle.combatants[parseInt(fromCharId)];
            if (!responder || !proposer) return;

            if (accept) {
                battle.switchTeam(responder.charId, proposer.teamId);
                const result = { actor: 'system', log: [`🤝 ${responder.name} accepts the alliance with ${proposer.name}!`],
                    actions: [{ type: 'alliance_shift', from: responder.name, toTeam: proposer.teamId }] };
                battle.addLog({ actor: 'system', text: result.log[0] });
                await BattleManager.broadcastBattleUpdate(io, battle, result, db);
                battle.checkWinCondition();
                if (battle.status !== 'ACTIVE') await BattleManager.endBattle(db, io, battle);
            } else {
                const result = { actor: 'system', log: [`❌ ${responder.name} declines the alliance.`], actions: [] };
                battle.addLog({ actor: 'system', text: result.log[0] });
                await BattleManager.broadcastBattleUpdate(io, battle, result, db);
            }
        } catch (e) { console.error('negotiate_respond error:', e); }
    });

    // Session 8: Toggle non-lethal mode
    socket.on('battle_toggle_nonlethal', (data) => {
        const result = BattleManager.toggleNonLethal(data.battleId, socket._battleCharId);
        if (result) socket.emit('battle_nonlethal_toggled', result);
    });

    // Session 8: Set defense stance
    socket.on('battle_set_defense', (data) => {
        const result = BattleManager.setDefenseStance(data.battleId, socket._battleCharId, data.defense);
        if (result) socket.emit('battle_defense_set', result);
    });

    // Session 8: Set limb target
    socket.on('battle_limb_target', (data) => {
        const result = BattleManager.setLimbTarget(data.battleId, socket._battleCharId, data.limbKey);
        if (result) socket.emit('battle_limb_target_set', result);
    });

    // Session 8: Post-battle KO interaction
    socket.on('battle_ko_action', async (data) => {
        const result = await BattleManager.processKoAction(db, io, data.battleId, socket._battleCharId, data.npcCharId, data.action);
        socket.emit('battle_ko_result', result);
    });

    // Session 8: PvP KO choice (spare/finish)
    socket.on('battle_pvp_ko_choice', async (data) => {
        const result = await BattleManager.processPvpKoChoice(db, io, data.battleId, socket._battleCharId, data.targetCharId, data.spare);
        socket.emit('battle_pvp_ko_result', result);
    });

    // Session 11: Create signature technique
    socket.on('sig_tech_create', async (data) => {
        const charId = state.onlinePlayers[socket.id]?.charId;
        if (!charId) return;
        const result = await BattleManager.createSignatureTech(db, charId, data);
        socket.emit('sig_tech_created', result);
    });

    // Session 11: Equip ability on signature tech
    socket.on('sig_tech_equip_ability', async (data) => {
        const charId = state.onlinePlayers[socket.id]?.charId;
        if (!charId) return;
        const result = await BattleManager.addSigTechAbility(db, charId, data.techId, data.abilityId, data.slot);
        socket.emit('sig_tech_ability_equipped', result);
    });

    // Session 11: Get available abilities for a slot
    socket.on('sig_tech_get_abilities', async (data) => {
        try {
            const [abilities] = await db.query('SELECT * FROM game_signature_abilities WHERE active=1 OR active IS NULL ORDER BY min_level, name');
            socket.emit('sig_tech_abilities_list', { abilities });
        } catch {}
    });

    // Session 22: Spectator mode
    socket.on('battle_spectate', (data) => {
        const result = BattleManager.spectate(io, socket, data.battleId);
        socket.emit('battle_spectate_result', result);
    });
    socket.on('battle_unspectate', () => {
        BattleManager.unspectate(io, socket);
    });

    // Session 28: Auto-battle, damage preview, brave/default
    socket.on('battle_auto_toggle', (data) => {
        const charId = state.onlinePlayers[socket.id]?.charId;
        if (!charId) return;
        const battle = BattleManager.getBattleByCharId(charId);
        if (!battle) return;
        const c = battle.combatants[charId];
        if (!c) return;
        c._autoBattle = data.enabled || false;
        c._autoTactics = data.tactics || 'balanced';
        c._autoSpeed = data.speed || 1;
        socket.emit('battle_auto_status', { enabled: c._autoBattle, tactics: c._autoTactics, speed: c._autoSpeed });
    });

    socket.on('battle_preview', (data) => {
        const charId = state.onlinePlayers[socket.id]?.charId;
        if (!charId) return;
        const battle = BattleManager.getBattleByCharId(charId);
        if (!battle || !battle._settings?.enable_damage_preview) return;
        const result = battle.previewAttack(charId, data.targetId, data.skillId || null);
        socket.emit('battle_preview_result', result);
    });

    socket.on('battle_brave', (data) => {
        const charId = state.onlinePlayers[socket.id]?.charId;
        if (!charId) return;
        const battle = BattleManager.getBattleByCharId(charId);
        if (!battle) return;
        const result = battle.resolveBrave(charId, data.count || 2);
        socket.emit('battle_brave_result', result);
        if (result.success) {
            io.to('battle_' + battle.id).emit('battle_update', battle.toClientState());
        }
    });

    socket.on('battle_default', () => {
        const charId = state.onlinePlayers[socket.id]?.charId;
        if (!charId) return;
        const battle = BattleManager.getBattleByCharId(charId);
        if (!battle) return;
        const result = battle.resolveDefault(charId);
        socket.emit('battle_default_result', result);
        if (result.success) {
            io.to('battle_' + battle.id).emit('battle_update', battle.toClientState());
        }
    });

    // Session 14: Tournament interactions
    socket.on('tournament_register', async (data) => {
        const charId = state.onlinePlayers[socket.id]?.charId;
        if (!charId) return;
        try {
            const TournamentManager = require('../tournament_manager');
            const result = await TournamentManager.register(db, data.tournamentId, charId);
            socket.emit('tournament_register_result', result);
        } catch (e) { socket.emit('tournament_register_result', { success: false, message: e.message }); }
    });

    socket.on('tournament_get_bracket', async (data) => {
        try {
            const TournamentManager = require('../tournament_manager');
            const bracket = await TournamentManager.getBracket(db, data.tournamentId);
            socket.emit('tournament_bracket', bracket);
        } catch {}
    });

    socket.on('tournament_list', async () => {
        try {
            const TournamentManager = require('../tournament_manager');
            const list = await TournamentManager.list(db);
            socket.emit('tournament_list', list);
        } catch {}
    });

    socket.on('tournament_leaderboard', async () => {
        try {
            const TournamentManager = require('../tournament_manager');
            const lb = await TournamentManager.leaderboard(db);
            socket.emit('tournament_leaderboard', lb);
        } catch {}
    });

    // ── Battle Chat Rooms + Referee System ────────────────────────
    socket.on('battle_chat_send', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const { battleId, body, channel, targetId } = data;
            if (!body?.trim() || !battleId) return;

            const senderRole = data.asReferee ? 'referee' : 'player';
            const msg = {
                battle_id: battleId,
                sender_id: p.charId,
                sender_name: p.name,
                sender_role: senderRole,
                channel: channel || 'all',
                target_id: targetId || null,
                body: body.trim(),
                created_at: new Date().toISOString(),
            };

            await db.query('INSERT INTO game_battle_chat SET ?', [msg]);

            // Route message based on channel
            if (channel === 'dm' && targetId) {
                // DM: only send to target
                const targetSocket = Object.entries(state.onlinePlayers).find(([, op]) => op.charId === targetId)?.[0];
                if (targetSocket) io.to(targetSocket).emit('battle_chat_msg', msg);
                socket.emit('battle_chat_msg', msg); // Echo to sender
            } else if (channel === 'team') {
                // Team chat: only to same team
                const battle = BattleManager.getBattleByCharId?.(p.charId) || BattleManager.activeBattles?.[battleId];
                if (battle) {
                    const myTeam = battle.getTeamId?.(p.charId) || Object.entries(battle.teams).find(([, m]) => m.includes(p.charId))?.[0];
                    if (myTeam) {
                        for (const cid of (battle.teams[myTeam] || [])) {
                            const sock = Object.entries(state.onlinePlayers).find(([, op]) => op.charId === cid)?.[0];
                            if (sock) io.to(sock).emit('battle_chat_msg', msg);
                        }
                    }
                }
            } else if (channel === 'referee') {
                // Referee channel: only to refs + system
                io.to('battle_ref_' + battleId).emit('battle_chat_msg', msg);
                socket.emit('battle_chat_msg', msg);
            } else {
                // All: broadcast to battle room
                io.to('battle_' + battleId).emit('battle_chat_msg', msg);
            }
        } catch {}
    });

    // Join as referee
    socket.on('battle_ref_join', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            await db.query('INSERT INTO game_battle_referees (battle_id, user_id) VALUES (?,?)', [data.battleId, p.userId]);
            socket.join('battle_ref_' + data.battleId);
            socket.join('battle_' + data.battleId);
            io.to('battle_' + data.battleId).emit('battle_chat_msg', {
                sender_name: 'System', sender_role: 'system', channel: 'all',
                body: `${p.name} has joined as referee.`, created_at: new Date().toISOString(),
            });
            socket.emit('battle_ref_joined', { battleId: data.battleId });
        } catch {}
    });

    // Referee actions
    socket.on('battle_ref_action', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            // Verify referee
            const [ref] = await db.query('SELECT * FROM game_battle_referees WHERE battle_id=? AND user_id=?', [data.battleId, p.userId]);
            if (!ref.length) return;

            if (data.action === 'pause' && ref[0].can_pause) {
                io.to('battle_' + data.battleId).emit('battle_ref_pause', { paused: true, refName: p.name });
            } else if (data.action === 'resume') {
                io.to('battle_' + data.battleId).emit('battle_ref_pause', { paused: false, refName: p.name });
            } else if (data.action === 'ruling') {
                io.to('battle_' + data.battleId).emit('battle_chat_msg', {
                    sender_name: `Ref: ${p.name}`, sender_role: 'referee', channel: 'all',
                    body: `⚖️ RULING: ${data.ruling}`, created_at: new Date().toISOString(),
                });
            } else if (data.action === 'end' && ref[0].can_end) {
                io.to('battle_' + data.battleId).emit('battle_chat_msg', {
                    sender_name: 'System', sender_role: 'system', channel: 'all',
                    body: `🛑 Battle ended by referee ${p.name}. ${data.reason || ''}`, created_at: new Date().toISOString(),
                });
            }
        } catch {}
    });

    // Get battle chat history
    socket.on('battle_chat_history', async (data) => {
        try {
            const [msgs] = await db.query(
                'SELECT * FROM game_battle_chat WHERE battle_id=? ORDER BY created_at DESC LIMIT 50',
                [data.battleId]
            );
            socket.emit('battle_chat_history', { battleId: data.battleId, messages: msgs.reverse() });
        } catch {}
    });

    // ── Real-Time Combat ──────────────────────────────────────────
    // RT combat handlers — SECURITY: only allow commands for YOUR OWN charId
    // p.charId comes from the server-side session, not from client data.
    // The RT engine also checks !c.isAI, so players can't command NPCs.
    socket.on('rt_combat_target', (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        const battle = BattleManager.activeBattles?.[data.battleId];
        if (!battle) return;
        // Verify this player is IN this battle
        if (!battle.combatants?.[p.charId]) return;
        if (battle.setTarget) battle.setTarget(p.charId, data.targetId);
    });

    socket.on('rt_combat_move', (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        const battle = BattleManager.activeBattles?.[data.battleId];
        if (!battle || !battle.combatants?.[p.charId]) return;
        if (battle.moveTo) battle.moveTo(p.charId, data.x, data.y);
    });

    socket.on('rt_combat_ability', (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        const battle = BattleManager.activeBattles?.[data.battleId];
        if (!battle || !battle.combatants?.[p.charId]) return;
        if (battle.queueAbility) battle.queueAbility(p.charId, data.skillId, data.targetId, data.power, data.mpCost, data.cooldown);
    });

    socket.on('rt_combat_pause', (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        const battle = BattleManager.activeBattles?.[data.battleId];
        if (!battle || !battle.combatants?.[p.charId]) return;
        if (battle.pause) {
            const result = battle.pause(p.charId);
            socket.emit('rt_combat_paused', result);
        }
    });

    // ── Skill Learning (Blue Mage) ────────────────────────────────
    socket.on('devour_enemy', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const battle = BattleManager.getBattleByCharId(p.charId);
            if (!battle) return;
            const target = battle.combatants[data.targetId];
            if (!target || !target.isAI || target.currentHp > 0) return socket.emit('learn_result', { success: false, message: 'Target must be defeated.' });

            // Get target's skills
            const [npcRow] = await db.query('SELECT skills_json FROM game_npcs WHERE char_id=?', [target.charId]);
            const skills = npcRow.length && npcRow[0].skills_json ? (typeof npcRow[0].skills_json === 'string' ? JSON.parse(npcRow[0].skills_json) : npcRow[0].skills_json) : [];
            if (!skills.length) return socket.emit('learn_result', { success: false, message: 'Nothing to learn from this enemy.' });

            // Check learnable skills
            const learnableIds = skills.filter(s => s.learnable_by_enemy).map(s => s.id || s.skill_id);
            if (!learnableIds.length) return socket.emit('learn_result', { success: false, message: 'No learnable skills.' });

            // Try to learn a random one
            const skillId = learnableIds[Math.floor(Math.random() * learnableIds.length)];
            const [existing] = await db.query('SELECT id FROM character_learned_enemy_skills WHERE character_id=? AND skill_id=?', [p.charId, skillId]);
            if (existing.length) return socket.emit('learn_result', { success: false, message: 'Already know this skill.' });

            await db.query('INSERT INTO character_learned_enemy_skills (character_id, skill_id, learned_from) VALUES (?,?,?)', [p.charId, skillId, target.name]);
            const [skillRow] = await db.query('SELECT name, icon FROM game_skills WHERE id=?', [skillId]);
            const skillName = skillRow.length ? skillRow[0].name : 'Unknown Skill';
            socket.emit('learn_result', { success: true, message: `Learned ${skillName} from ${target.name}!`, skillName });
        } catch (e) { socket.emit('learn_result', { success: false, message: e.message }); }
    });

    // ── Raid Boss System ─────────────────────────────────────────
    socket.on('raid_join', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const [raid] = await db.query('SELECT * FROM game_raid_bosses WHERE id=? AND is_active=1', [data.raidId]);
            if (!raid.length) return socket.emit('raid_result', { success: false, message: 'Raid not found.' });

            // Find or create instance
            let [instance] = await db.query("SELECT * FROM game_raid_instances WHERE raid_id=? AND status='forming' ORDER BY created_at DESC LIMIT 1", [data.raidId]);
            if (!instance.length) {
                const bossHp = (raid[0].hp_multiplier || 5) * 1000;
                const [result] = await db.query('INSERT INTO game_raid_instances (raid_id, boss_hp, boss_max_hp, parties_json) VALUES (?,?,?,?)',
                    [data.raidId, bossHp, bossHp, JSON.stringify([])]);
                [instance] = await db.query('SELECT * FROM game_raid_instances WHERE id=?', [result.insertId]);
            }

            const parties = typeof instance[0].parties_json === 'string' ? JSON.parse(instance[0].parties_json) : (instance[0].parties_json || []);
            if (parties.length >= raid[0].max_parties) return socket.emit('raid_result', { success: false, message: 'Raid is full.' });

            parties.push({ charId: p.charId, name: p.name, joinedAt: Date.now() });
            await db.query('UPDATE game_raid_instances SET parties_json=? WHERE id=?', [JSON.stringify(parties), instance[0].id]);

            socket.join('raid_' + instance[0].id);
            io.to('raid_' + instance[0].id).emit('raid_update', { instanceId: instance[0].id, parties, bossHp: instance[0].boss_hp, bossMaxHp: instance[0].boss_max_hp });
            socket.emit('raid_result', { success: true, message: `Joined raid! ${parties.length}/${raid[0].max_parties} parties.`, instanceId: instance[0].id });
        } catch (e) { socket.emit('raid_result', { success: false, message: e.message }); }
    });

    // ── Async PvP ────────────────────────────────────────────────
    socket.on('async_pvp_set_defense', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            await db.query('INSERT INTO character_pvp_defense_teams (character_id, team_json, formation, tactics) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE team_json=VALUES(team_json), formation=VALUES(formation), tactics=VALUES(tactics)',
                [p.charId, JSON.stringify(data.team || []), data.formation || 'line', data.tactics || 'balanced']);
            socket.emit('async_pvp_result', { success: true, message: 'Defense team saved!' });
        } catch (e) { socket.emit('async_pvp_result', { success: false, message: e.message }); }
    });

    socket.on('async_pvp_challenge', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const [defTeam] = await db.query('SELECT * FROM character_pvp_defense_teams WHERE character_id=?', [data.defenderId]);
            if (!defTeam.length) return socket.emit('async_pvp_result', { success: false, message: 'Player has no defense team set.' });

            // Simulate battle (simplified — full implementation would run BattleManager)
            const result = Math.random() > 0.5 ? 'win' : 'loss';
            const ratingChange = result === 'win' ? 15 : -10;

            await db.query('INSERT INTO character_pvp_async_log (attacker_id, defender_id, result, rating_change) VALUES (?,?,?,?)',
                [p.charId, data.defenderId, result, ratingChange]);

            socket.emit('async_pvp_result', { success: true, result, ratingChange, message: result === 'win' ? 'Victory!' : 'Defeat...' });
        } catch (e) { socket.emit('async_pvp_result', { success: false, message: e.message }); }
    });

    // ── Job System ───────────────────────────────────────────────
    socket.on('job_switch', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const { jobId, slot } = data; // slot: 'primary' or 'secondary'
            const [job] = await db.query('SELECT * FROM game_jobs WHERE id=? AND is_active=1', [jobId]);
            if (!job.length) return socket.emit('job_result', { success: false, message: 'Job not found.' });

            // Check prerequisites
            const prereqs = typeof job[0].prerequisite_jobs === 'string' ? JSON.parse(job[0].prerequisite_jobs || '[]') : (job[0].prerequisite_jobs || []);
            if (prereqs.length) {
                const [charJobs] = await db.query('SELECT job_id, job_level FROM character_jobs WHERE character_id=? AND job_id IN (?)', [p.charId, prereqs]);
                const metAll = prereqs.every(pj => charJobs.some(cj => cj.job_id === pj.id && cj.job_level >= (pj.level || 1)));
                if (!metAll) return socket.emit('job_result', { success: false, message: 'Prerequisites not met.' });
            }

            // Unlock if not already
            await db.query('INSERT IGNORE INTO character_jobs (character_id, job_id) VALUES (?,?)', [p.charId, jobId]);

            // Set as primary or secondary
            if (slot === 'primary') {
                await db.query('UPDATE character_jobs SET is_primary=0 WHERE character_id=?', [p.charId]);
                await db.query('UPDATE character_jobs SET is_primary=1 WHERE character_id=? AND job_id=?', [p.charId, jobId]);
            } else {
                await db.query('UPDATE character_jobs SET is_secondary=0 WHERE character_id=?', [p.charId]);
                await db.query('UPDATE character_jobs SET is_secondary=1 WHERE character_id=? AND job_id=?', [p.charId, jobId]);
            }

            socket.emit('job_result', { success: true, message: `Switched ${slot} job to ${job[0].name}!` });
        } catch (e) { socket.emit('job_result', { success: false, message: e.message }); }
    });
};

// =============================================================
// HELPER: getActiveCompanions
// =============================================================
// TEACHING: Companions are tracked in state.companionState as an
// in-memory map (charId -> array of companion objects). This helper
// just returns the array or an empty list, keeping handler code clean.
function getActiveCompanions(charId) {
    return state.companionState[charId] || [];
}
