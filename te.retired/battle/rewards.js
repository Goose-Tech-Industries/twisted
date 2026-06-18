// =================================================================
// REWARDS MODULE — End Battle, Level Up, Referral Payouts
// =================================================================
// Extracted from legacy.js battle engine.
// Handles post-battle rewards, level-up checks, and referral payouts.
// Commands & broadcast logic moved to ./commands.js
// =================================================================

const { jp, queryLevelRow, queryLimitBreaksList } = require('./stats');
const { handleDeath, styleWinCredit } = require('./world');
const { activeBattles } = require('./state');
const { getAvailableCommands, broadcastBattleUpdate, getSignatureTechs } = require('./commands');

// Optional Legendary Artifacts hook.
// If your project includes routes/artifactRoutes.js (with init(db) + onPvpKill()),
// the battle engine will call it when a PvP battle ends with a kill.
let artifactRoutes = null;
try {
    artifactRoutes = require('../routes/artifactRoutes');
} catch (e) {
    // Not installed in this build — totally fine.
    artifactRoutes = null;
}

// =================================================================
// END BATTLE — Save results, give rewards
// =================================================================
async function endBattle(db, io, battle) {
    // Idempotency guard — prevent double rewards if endBattle is called multiple times
    if (battle._endBattleProcessed) return;
    battle._endBattleProcessed = true;

    // Update DB record
    await db.query("UPDATE game_battles SET status=?, winner_char_id=?, battle_log=? WHERE id=?",
        [battle.status, battle.winner, JSON.stringify(battle.log), battle.id]);

    // Sync HP/MP/Limit/Statuses back to characters table
    for (const [charId, c] of Object.entries(battle.combatants)) {
        await db.query(
            `UPDATE characters SET current_hp=?, current_mp=?, limitbreak=?, status_effects=? WHERE id=?`,
            [Math.max(0, c.currentHp), Math.max(0, c.currentMp), c.limitbreak,
             JSON.stringify(c.statuses), charId]
        );
    }

    // =========================================================
    // DEFEAT SCREEN — notify losing human players
    // =========================================================
    // TEACHING: We iterate every combatant. If they lost (hp=0, not winner)
    //   AND they're a real player (isAI === false), we emit 'battle_defeat'
    //   to their socket. This works for both PvP losers and PvE deaths.
    //   The client shows a gravestone screen with a Respawn button.
    if (battle.status === 'FINISHED') {
        try {
            const battleSockets = await io.in('battle_' + battle.id).fetchSockets();
            for (const [cid, combatant] of Object.entries(battle.combatants)) {
                const charId = parseInt(cid);
                if (combatant.isAI) continue;             // NPC — no screen needed
                if (charId === battle.winner) continue;   // They won — gets victory screen

                // This is a human who lost — find their socket and send defeat info
                const loserSocket = (battleSockets || []).find(s => s._battleCharId === charId);

                // Session 23: Afterlife — if truly dead (not KO'd), send to afterlife
                let afterlifeInfo = null;
                if (battle._settings?.enable_afterlife && !combatant._knockedOut && combatant.currentHp <= 0) {
                    afterlifeInfo = await handleDeath(db, io, charId);
                }

                const defeatPayload = {
                    won:        false,
                    enemyName:  battle.combatants[battle.winner] ? battle.combatants[battle.winner].name : 'Unknown',
                    battleType: battle.type,
                    afterlife:  afterlifeInfo
                };
                if (loserSocket) loserSocket.emit('battle_defeat', defeatPayload);
            }
        } catch(defeatErr) { console.error('battle_defeat emit error (non-fatal):', defeatErr); }

    // Post-battle action chains (on_win / on_lose from BATTLE event type)
    // Tell each human socket whether they won so _run_post_battle picks the right branch
    try {
        const allBattleSockets = await io.in('battle_' + battle.id).fetchSockets();
        for (const bs of (allBattleSockets || [])) {
            if (bs._postBattleActions) {
                const bsWon = bs._battleCharId === battle.winner;
                bs.emit('_run_post_battle', { won: bsWon });
            }
        }
    } catch { /* non-fatal */ }

    // =========================================================
    // SESSION 8: POST-BATTLE KNOCKOUT INTERACTIONS
    // =========================================================
    // Find all KO'd combatants and offer the winners choices.
    // KO'd NPCs: interrogate, recruit, loot, release
    // KO'd PvP players: spare or finish
    try {
        const koNpcs = [];
        const koPvpPlayers = [];

        for (const [cid, c] of Object.entries(battle.combatants)) {
            if (!c._knockedOut) continue;

            if (c.isAI) {
                // KO'd NPC — record in DB and prepare interaction options
                const knockedOutBy = Object.values(battle.combatants).find(
                    w => w.currentHp > 0 && !w._knockedOut && !w.isAI && w.teamId !== c.teamId
                );
                if (knockedOutBy) {
                    try {
                        await db.query(
                            `INSERT INTO game_battle_knockouts (battle_id, npc_char_id, npc_name, knocked_out_by, ko_method)
                             VALUES (?, ?, ?, ?, ?)`,
                            [battle.id, parseInt(cid), c.name, knockedOutBy.charId, 'nonlethal']
                        );
                    } catch {} // table might not exist yet

                    const actions = ['interrogate', 'loot', 'release'];
                    // Check if NPC is recruitable
                    try {
                        const [npcRow] = await db.query(
                            'SELECT is_recruitable FROM game_npcs WHERE char_id=? LIMIT 1', [parseInt(cid)]);
                        if (npcRow.length && npcRow[0].is_recruitable) actions.splice(1, 0, 'recruit');
                    } catch {}

                    koNpcs.push({
                        charId: parseInt(cid), name: c.name,
                        icon: c.icon || '💫',
                        actions
                    });
                }
            } else {
                // KO'd human player in PvP
                koPvpPlayers.push({
                    charId: parseInt(cid), name: c.name
                });
            }
        }

        // Emit KO interaction options to winning players
        if (koNpcs.length || koPvpPlayers.length) {
            const battleSockets = await io.in('battle_' + battle.id).fetchSockets();
            const winnerTeamId = battle.winnerTeamId;
            const winTeamIds = winnerTeamId ? (battle.teams[winnerTeamId] || []) : [];

            for (const wid of winTeamIds) {
                const wc = battle.combatants[wid];
                if (!wc || wc.isAI || wc.currentHp <= 0) continue;
                const sock = (battleSockets || []).find(s => s._battleCharId === wid);
                if (!sock) continue;

                if (koNpcs.length) {
                    sock.emit('battle_ko_interact', { koNpcs, battleId: battle.id });
                }
                if (koPvpPlayers.length) {
                    sock.emit('pvp_ko_choice', {
                        koPvpPlayers,
                        battleId: battle.id,
                        repBonusSpare: battle._settings?.nonlethal_rep_bonus_release || 5,
                        repPenaltyFinish: battle._settings?.nonlethal_rep_penalty_finish || -10
                    });
                }
            }
        }
    } catch (koErr) {
        console.error('[Battle] KO interaction error (non-fatal):', koErr.message);
    }
    }

    // =============================================================
    // LEGENDARY ARTIFACTS HOOK (OPTIONAL)
    // =============================================================
    // If you have routes/artifactRoutes.js with onPvpKill(), this makes
    // artifacts "come alive" automatically when a PvP battle ends with a kill.
    // It is wrapped in try/catch so missing modules never break battles.
    if (
        battle.type === 'PVP' &&
        battle.status === 'FINISHED' &&
        battle.winner &&
        artifactRoutes &&
        typeof artifactRoutes.onPvpKill === 'function'
    ) {
        const loserId = Object.keys(battle.combatants).map(Number)
            .find(id => id !== battle.winner);

        if (loserId) {
            try {
                // Pull a tiny bit of context (location) for logging / future features.
                const [posRows] = await db.query(
                    "SELECT id, map_id, x, y FROM characters WHERE id IN (?,?)",
                    [battle.winner, loserId]
                );
                const posById = {};
                for (const r of posRows) posById[r.id] = r;

                const hookRes = await artifactRoutes.onPvpKill(
                    battle.winner,
                    loserId,
                    {
                        location: {
                            mapId: posById[battle.winner]?.map_id ?? null,
                            x: posById[battle.winner]?.x ?? null,
                            y: posById[battle.winner]?.y ?? null
                        },
                        timestamp: Date.now(),
                        // Your PvP challenges are basically "duels" right now.
                        // Set to false so artifacts can transfer in normal PvP.
                        // If you later add a duel ladder, you can set this true there.
                        isDuel: false
                    }
                );

                // Optional broadcast: clients may listen for this to show global announcements.
                if (hookRes && hookRes.transferred && io && typeof io.emit === 'function') {
                    io.emit('artifact_transfer', hookRes);
                }
            } catch (e) {
                console.error('Artifact onPvpKill hook failed:', e);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // REWARDS — split across all surviving players (party-aware)
    // TEACHING: In 1v1 there's one winner. In party PvE, ALL surviving
    // players win together and share XP/gold equally. Each gets the
    // full per-fight XP from the level table divided by party size.
    // This keeps levelling fair regardless of party size.
    // ─────────────────────────────────────────────────────────────────
    if (battle.status === 'FINISHED' && battle.winner !== null) {

        // Determine who won — find the winning team
        const winnerCharId = typeof battle.winner === 'number' ? battle.winner : parseInt(battle.winner);
        const winnerTeamId = battle.winnerTeamId || Object.keys(battle.teams).find(
            tId => (battle.teams[tId] || []).includes(winnerCharId));
        // Check if the winning team has human players (not just AI)
        const winTeamMembers = winnerTeamId ? (battle.teams[winnerTeamId] || []) : [];
        const playersWon = winTeamMembers.some(id => battle.combatants[id] && !battle.combatants[id].isAI);

        if (playersWon) {
            // Get all surviving player characters from the winning team
            const survivingPlayers = winTeamMembers
                .map(id => battle.combatants[id])
                .filter(c => c && c.currentHp > 0 && !c.isAI);

            const partySize = Math.max(1, survivingPlayers.length);

            // Use the HIGHEST enemy level for XP lookup (from all losing teams)
            const losingTeamIds = Object.keys(battle.teams).filter(t => t !== winnerTeamId);
            const allEnemies = losingTeamIds.flatMap(t => (battle.teams[t] || [])
                .map(id => battle.combatants[id]).filter(Boolean));
            const topEnemy = allEnemies.sort((a, b) => b.level - a.level)[0];

            const [lvlRows] = topEnemy ? await queryLevelRow(db, topEnemy.level) : [[]];
            const baseXp    = lvlRows.length ? (lvlRows[0].xp_for_win   || 0) : 0;
            const baseGold  = lvlRows.length ? (lvlRows[0].gold_for_win || 0) : 0;

            // ── REGION MULTIPLIERS ─────────────────────────────────────
            // Check if the winning player(s) are in a region with
            // modified XP/gold rates. We use the first surviving player's
            // map as the "battle region" (all players in same area).
            let regionXpMult   = 1;
            let regionGoldMult = 1;
            try {
                const firstWinner = survivingPlayers[0];
                if (firstWinner && global.getRegionForMap) {
                    // Get player's current map from DB
                    const [pMap] = await db.query(
                        'SELECT map_id FROM characters WHERE id=?', [firstWinner.charId]);
                    if (pMap.length) {
                        const region = await global.getRegionForMap(pMap[0].map_id);
                        if (region) {
                            regionXpMult   = parseFloat(region.xp_mult   || 1);
                            regionGoldMult = parseFloat(region.gold_mult  || 1);
                        }
                    }
                }
            } catch {}
            // Apply global system multipliers + region multipliers
            const sysXpMult   = parseFloat(global.worldFlags?.['xp_multiplier']  || 1);
            const sysGoldMult = parseFloat(global.worldFlags?.['gold_multiplier'] || 1);

            // Apply active world event multipliers
            let eventXpMult = 1, eventGoldMult = 1, eventAtkMult = 1;
            try {
                const [activeEvents] = await db.query(
                    "SELECT stat_modifiers FROM game_world_events WHERE is_active=1"
                );
                for (const ev of activeEvents) {
                    const mods = typeof ev.stat_modifiers === 'string' ? JSON.parse(ev.stat_modifiers || '{}') : (ev.stat_modifiers || {});
                    if (mods.xp_mult) eventXpMult *= parseFloat(mods.xp_mult);
                    if (mods.gold_mult) eventGoldMult *= parseFloat(mods.gold_mult);
                    if (mods.enemy_atk_mult) eventAtkMult *= parseFloat(mods.enemy_atk_mult);
                }
            } catch {}

            let shareXp   = Math.max(1, Math.floor((baseXp   / partySize) * regionXpMult   * sysXpMult   * eventXpMult));
            let shareGold = Math.max(0, Math.floor((baseGold / partySize) * regionGoldMult * sysGoldMult * eventGoldMult));

            // Award each surviving player
            for (const winner of survivingPlayers) {
                // Apply per-player status effect multipliers (xp_mult, gold_mult)
                let playerXp = shareXp, playerGold = shareGold;
                try {
                    const [fxRows] = await db.query(
                        `SELECT s.effects FROM character_status_effects cse
                         JOIN game_statuses s ON s.id = cse.status_id
                         WHERE cse.character_id=? AND (cse.expires_at IS NULL OR cse.expires_at > NOW())`,
                        [winner.charId]
                    );
                    for (const r of fxRows) {
                        try {
                            const fx = typeof r.effects === 'string' ? JSON.parse(r.effects) : r.effects;
                            if (fx?.xp_mult) playerXp = Math.floor(playerXp * fx.xp_mult);
                            if (fx?.gold_mult) playerGold = Math.floor(playerGold * fx.gold_mult);
                        } catch {}
                    }
                } catch {}
                let leveledUp = false;
                if (playerXp) {
                    await db.query('UPDATE characters SET experience=experience+? WHERE id=?',
                        [playerXp, winner.charId]);
                    await db.query(
                        `UPDATE characters SET state_json=JSON_SET(COALESCE(state_json,'{}'),'$.xp',
                         COALESCE(CAST(JSON_EXTRACT(state_json,'$.xp') AS DECIMAL(20,0)),0)+?)
                         WHERE id=?`, [playerXp, winner.charId]);
                    leveledUp = await checkLevelUpStateJson(db, winner.charId);
                }
                if (playerGold && winner.userId) {
                    await db.query('UPDATE users SET currency=currency+? WHERE id=?',
                        [playerGold, winner.userId]);
                }
                // Emit battle_result to each player's socket
                try {
                    const allSocks = await io.in('battle_' + battle.id).fetchSockets();
                    const sock = (allSocks || []).find(s => s._battleCharId === winner.charId);
                    if (sock) sock.emit('battle_result', {
                        won: true, xp: playerXp, gold: playerGold,
                        leveledUp: !!leveledUp,
                        enemyName: topEnemy ? topEnemy.name : 'Enemy',
                        battleType: battle.type, partySize
                    });
                } catch {}

                // ── SESSION 13: Fighting style win credit ────────────
                try {
                    const styleResult = await styleWinCredit(db, winner.charId, battle._settings);
                    if (styleResult?.rankedUp) {
                        try {
                            const allSocks = await io.in('battle_' + battle.id).fetchSockets();
                            const wSock = (allSocks || []).find(s => s._battleCharId === winner.charId);
                            if (wSock) wSock.emit('style_rank_up', styleResult);
                        } catch {}
                    }
                } catch {}

                // ── ACHIEVEMENT: pve_wins + battles_total trigger ────
                try {
                    const achievementRoutes = require('../routes/achievementRoutes');
                    const [[pveRow]] = await db.query(
                        `SELECT CAST(JSON_EXTRACT(battle_record,'$.W') AS UNSIGNED) AS wins FROM characters WHERE id=?`,
                        [winner.charId]
                    );
                    if (pveRow) {
                        await achievementRoutes.checkForCharacter(db, io, winner.charId, 'pve_wins', pveRow.wins || 0);
                    }
                } catch(e) { /* non-critical */ }
            }

            // Win/loss record for 1v1 (only update if exactly 1v1)
            const losingTeamMembers = losingTeamIds.flatMap(t => battle.teams[t] || []);
            if (survivingPlayers.length === 1 && losingTeamMembers.length === 1) {
                const winnerId = survivingPlayers[0].charId;
                const loserId  = losingTeamMembers[0];
                await db.query(`UPDATE characters SET battle_record=JSON_SET(battle_record,'$.W',CAST(JSON_EXTRACT(battle_record,'$.W')+1 AS UNSIGNED)) WHERE id=?`, [winnerId]);
                await db.query(`UPDATE characters SET battle_record=JSON_SET(battle_record,'$.L',CAST(JSON_EXTRACT(battle_record,'$.L')+1 AS UNSIGNED)) WHERE id=?`, [loserId]);

                // ── ACHIEVEMENT: pvp_wins trigger ────────────────────
                try {
                    const achievementRoutes = require('../routes/achievementRoutes');
                    const [[wRow]] = await db.query(
                        `SELECT CAST(JSON_EXTRACT(battle_record,'$.W') AS UNSIGNED) AS wins FROM characters WHERE id=?`,
                        [winnerId]
                    );
                    if (wRow) await achievementRoutes.checkForCharacter(db, io, winnerId, 'pvp_wins', wRow.wins || 1);
                } catch(e) { /* non-critical */ }
            }

            // Event log (single entry for party)
            try {
                const enemyNames = losingTeamMembers.map(id => battle.combatants[id]?.name).filter(Boolean).join(', ');
                await db.query(
                    `INSERT INTO game_event_log (event_type,actor_id,actor_name,detail_json,map_id)
                     VALUES (?,?,?,?,?)`,
                    ['battle_end', survivingPlayers[0]?.userId || null,
                     survivingPlayers.map(p => p.name).join(', '),
                     JSON.stringify({ xp: shareXp, gold: shareGold, partySize, defeated: enemyNames }),
                     null]
                );
            } catch {}

            // ── SERVER-AUTHORITATIVE QUEST KILL CREDIT ───────────────
            // TEACHING: This is the fix for "client-trusted quest completion".
            // Before this fix, the client would call POST /quests/progress with
            // whatever amount it felt like, and the server trusted it.
            // Now: when a PvE battle ends in a player victory, WE look at which
            // NPCs actually died, find every active quest with a KILL objective
            // for those NPC types, and increment the count ourselves.
            // The client's /quests/progress endpoint now REJECTS KILL objectives —
            // only the server (this block) can advance them.
            try {
                if (battle.enemyNpcIds && battle.enemyNpcIds.length) {
                    // Get NPC names/types for the defeated enemies
                    const npcRows = await (async () => {
                        if (!battle.enemyNpcIds.length) return [];
                        const placeholders = battle.enemyNpcIds.map(() => '?').join(',');
                        const [rows] = await db.query(
                            `SELECT id, name, npc_type FROM game_npcs WHERE id IN (${placeholders})`,
                            battle.enemyNpcIds
                        );
                        return rows;
                    })();

                    if (npcRows.length) {
                        const npcIdSet   = new Set(npcRows.map(n => n.id));
                        const npcTypeSet = new Set(npcRows.map(n => (n.npc_type || '').toLowerCase()));
                        const npcNameSet = new Set(npcRows.map(n => (n.name || '').toLowerCase()));

                        for (const winner of survivingPlayers) {
                            // Load this character's state_json
                            const [cRows] = await db.query(
                                'SELECT state_json FROM characters WHERE id=?', [winner.charId]);
                            if (!cRows.length) continue;
                            let state;
                            try { state = JSON.parse(cRows[0].state_json || '{}'); } catch { continue; }
                            if (!state.quests?.active) continue;

                            let stateChanged = false;
                            for (const [questId, q] of Object.entries(state.quests.active)) {
                                if (!q.objectives) continue;
                                for (const [objKey, obj] of Object.entries(q.objectives)) {
                                    if (obj.complete) continue;
                                    if ((obj.type || '').toUpperCase() !== 'KILL') continue;

                                    // Match by npc_id, npc_type, or name (quest designers use any of these)
                                    const target = (obj.target_npc_id   !== undefined ? obj.target_npc_id   : null);
                                    const ttype  = (obj.target_npc_type || '').toLowerCase();
                                    const tname  = (obj.target_npc_name || '').toLowerCase();

                                    const matches =
                                        (target !== null && npcIdSet.has(Number(target))) ||
                                        (ttype  && npcTypeSet.has(ttype)) ||
                                        (tname  && npcNameSet.has(tname));

                                    if (!matches) continue;

                                    // Each enemy in battle counts as 1 kill
                                    const killCount = battle.enemyNpcIds.filter(id => {
                                        const row = npcRows.find(n => n.id === id);
                                        if (!row) return false;
                                        if (target !== null && row.id === Number(target)) return true;
                                        if (ttype && (row.npc_type || '').toLowerCase() === ttype) return true;
                                        if (tname && (row.name || '').toLowerCase() === tname) return true;
                                        return false;
                                    }).length;

                                    if (!killCount) continue;

                                    obj.current = Math.min(
                                        (obj.current || 0) + killCount,
                                        obj.required || obj.target || 1
                                    );
                                    if (obj.current >= (obj.required || obj.target || 1)) {
                                        obj.current  = obj.required || obj.target || 1;
                                        obj.complete = true;
                                    }
                                    stateChanged = true;
                                }
                                if (stateChanged) {
                                    // Recheck quest readiness
                                    const allDone = Object.values(q.objectives).every(o => o.complete);
                                    q.is_ready_to_turn_in = allDone;
                                }
                            }

                            if (stateChanged) {
                                await db.query(
                                    'UPDATE characters SET state_json=? WHERE id=?',
                                    [JSON.stringify(state), winner.charId]
                                );
                                // Notify client so the UI updates immediately
                                // We find the socket via io — endBattle doesn't have socketMap
                                try {
                                    const allSocks = await io.in('battle_' + battle.id).fetchSockets();
                                    const wSock = (allSocks || []).find(s => s._battleCharId === winner.charId);
                                    if (wSock) wSock.emit('quest_progress_update', { quests: state.quests.active });
                                } catch {}
                            }
                        }
                    }
                }
            } catch (qErr) {
                console.error('[Battle] Quest kill credit error (non-fatal):', qErr.message);
            }

            // ── SESSION 16: Quest WIN_CONDITION objective credit ─────
            // If this battle had a quest-linked win condition, progress those objectives
            if (battle._winCondition?.questId) {
                try {
                    for (const winner of survivingPlayers) {
                        const [cRows] = await db.query('SELECT state_json FROM characters WHERE id=?', [winner.charId]);
                        if (!cRows.length) continue;
                        let state;
                        try { state = JSON.parse(cRows[0].state_json || '{}'); } catch { continue; }
                        if (!state.quests?.active) continue;

                        const q = state.quests.active[battle._winCondition.questId];
                        if (!q || !q.objectives) continue;

                        let stateChanged = false;
                        for (const [objKey, obj] of Object.entries(q.objectives)) {
                            if (obj.complete) continue;
                            if ((obj.type || '').toUpperCase() !== 'WIN_CONDITION') continue;
                            if (obj.win_condition_id && obj.win_condition_id !== battle._winCondition.id) continue;
                            obj.current = 1;
                            obj.complete = true;
                            stateChanged = true;
                        }
                        if (stateChanged) {
                            const allDone = Object.values(q.objectives).every(o => o.complete);
                            q.is_ready_to_turn_in = allDone;
                            await db.query('UPDATE characters SET state_json=? WHERE id=?',
                                [JSON.stringify(state), winner.charId]);
                            try {
                                const allSocks = await io.in('battle_' + battle.id).fetchSockets();
                                const wSock = (allSocks || []).find(s => s._battleCharId === winner.charId);
                                if (wSock) wSock.emit('quest_progress_update', { quests: state.quests.active });
                            } catch {}
                        }
                    }
                } catch (wcErr) {
                    console.error('[Battle] Win condition quest credit error (non-fatal):', wcErr.message);
                }
            }
        } // end playersWon block

        // ── loot_drops and ogham drops are below (PvE only) ──
        // Resolve the loser for the existing loot code below
        const winner = battle.combatants[winnerCharId] || null;
        const firstLosingTeam = losingTeamIds[0] ? (battle.teams[losingTeamIds[0]] || []) : [];
        const loser  = firstLosingTeam.length ? battle.combatants[firstLosingTeam[0]] : null;
        void winner; void loser; // used in loot block below via `battle.winner`
    }  // end status=FINISHED check

            // =====================================================
            // LOOT DROPS (PvE only — never loot other players)
            // =====================================================
            if (battle.type === 'PVE' || battle.type === 'PARTY_PVE') {
                // For party battles, loot rolls for EACH enemy that died
                const allLosingIds = (losingTeamIds || Object.keys(battle.teams).filter(t => t !== winnerTeamId))
                    .flatMap(t => battle.teams[t] || []);
                const deadEnemyIds = allLosingIds.filter(
                    id => !battle.combatants[id] || battle.combatants[id].currentHp <= 0
                );
                const winTeam = winnerTeamId ? (battle.teams[winnerTeamId] || []) : [];
                const lootWinnerId = winTeam.find(
                    id => battle.combatants[id]?.currentHp > 0 && !battle.combatants[id]?.isAI
                ) || battle.winner;

                for (const deadEnemyId of deadEnemyIds) {
                try {
                    var npcRes = await db.query(
                        'SELECT drop_table_json FROM game_npcs WHERE char_id = ? AND is_enemy = 1 LIMIT 1',
                        [deadEnemyId]
                    );
                    var npcRow = npcRes[0];
                    if (npcRow.length && npcRow[0].drop_table_json) {
                        var dropTable = [];
                        try {
                            var raw = npcRow[0].drop_table_json;
                            dropTable = (typeof raw === 'string') ? JSON.parse(raw) : (raw || []);
                        } catch(e) { dropTable = []; }

                        // ── CONDITIONAL LOOT: region + world-flag filtering ──────
                        // Each drop entry can have an optional "conditions" array.
                        // Format: [{"type":"world_flag","flag":"blood_moon","value":"true"},
                        //          {"type":"region_danger","min":3},
                        //          {"type":"region_corruption","min":2},
                        //          {"type":"region_faction","faction":"undead"},
                        //          {"type":"region_tag","tag":"siege"}]
                        // All conditions must pass or the entry is skipped this kill.
                        let _lootRegion = null;
                        try {
                            const [pMapL] = await db.query(
                                'SELECT map_id FROM characters WHERE id=?', [lootWinnerId]);
                            if (pMapL.length && global.getRegionForMap) {
                                _lootRegion = await global.getRegionForMap(pMapL[0].map_id);
                            }
                        } catch {}
                        const _lootRegionMult = _lootRegion ? parseFloat(_lootRegion.loot_mult || 1) : 1;

                        function _checkLootConditions(entry) {
                            if (!entry.conditions || !entry.conditions.length) return true;
                            const wf = global.worldFlags || {};
                            const rg = _lootRegion || {};
                            return entry.conditions.every(cond => {
                                switch (cond.type) {
                                    case 'world_flag':
                                        return String(wf[cond.flag] ?? '') === String(cond.value ?? 'true');
                                    case 'world_flag_not':
                                        return String(wf[cond.flag] ?? '') !== String(cond.value ?? 'true');
                                    case 'region_danger':
                                        if (cond.min !== undefined && (rg.danger_level || 0) < cond.min) return false;
                                        if (cond.max !== undefined && (rg.danger_level || 0) > cond.max) return false;
                                        return true;
                                    case 'region_corruption':
                                        if (cond.min !== undefined && (rg.corruption_level || 0) < cond.min) return false;
                                        if (cond.max !== undefined && (rg.corruption_level || 0) > cond.max) return false;
                                        return true;
                                    case 'region_faction':
                                        return (rg.faction_control || '') === cond.faction;
                                    case 'region_tag':
                                        try {
                                            const tags = typeof rg.active_tags_json === 'string'
                                                ? JSON.parse(rg.active_tags_json) : (rg.active_tags_json || []);
                                            return tags.includes(cond.tag);
                                        } catch { return false; }
                                    case 'region_weather':
                                        return (rg.weather_override || 'CLEAR') === cond.weather;
                                    default: return true;
                                }
                            });
                        }

                        var actualDrops = [];
                        for (var di = 0; di < dropTable.length; di++) {
                            var entry = dropTable[di];
                            if (!entry.item_id || typeof entry.chance !== 'number') continue;
                            // Check conditional loot rules
                            if (!_checkLootConditions(entry)) continue;
                            // Apply region loot multiplier to drop chance
                            if (Math.random() * 100 > entry.chance * _lootRegionMult) continue;
                            var minQ = Math.max(1, parseInt(entry.min_qty) || 1);
                            var maxQ = Math.max(minQ, parseInt(entry.max_qty) || 1);
                            var qty = minQ + Math.floor(Math.random() * (maxQ - minQ + 1));
                            await db.query(
                                'INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',
                                [lootWinnerId, entry.item_id, qty]
                            );
                            var iRes = await db.query('SELECT name, icon FROM game_items WHERE id=? LIMIT 1', [entry.item_id]);
                            var iRow = iRes[0];
                            if (iRow.length) {
                                actualDrops.push({ item_id: entry.item_id, name: iRow[0].name, icon: iRow[0].icon || '📦', qty: qty });
                            }
                        }
                        if (actualDrops.length) {
                            io.to('battle_' + battle.id).emit('loot_drops', {
                                forCharId: lootWinnerId,
                                drops: actualDrops,
                                enemyName: (battle.combatants[deadEnemyId] || {}).name || 'Enemy'
                            });
                        }
                    }
                } catch(lootErr) { console.error('Loot drop error (non-fatal):', lootErr); }
                } // end deadEnemyId loop

                // --- OGHAM DROP ---
                // Roll against config_ogham_drop_chance (default 5%)
                try {
                    let dropChance = 5;
                    try {
                        for (const tbl of ['game_settings','system_settings','settings']) {
                            const [sr] = await db.query('SHOW TABLES LIKE ?', [tbl]);
                            if (!sr.length) continue;
                            const [cr] = await db.query('SHOW COLUMNS FROM ??', [tbl]);
                            const cols = cr.map(c => c.Field);
                            const kc = cols.find(n => /key|name/i.test(n));
                            const vc = cols.find(n => /val|value/i.test(n));
                            if (!kc || !vc) continue;
                            const [sv] = await db.query(
                                'SELECT ?? AS v FROM ?? WHERE ?? = ?', [vc, tbl, kc, 'config_ogham_drop_chance']);
                            if (sv.length) { dropChance = parseFloat(sv[0].v) || 5; break; }
                        }
                    } catch {}

                    if (Math.random() * 100 < dropChance) {
                        // Pick a random rank-1 ogham to drop
                        const [ogRows] = await db.query(
                            'SELECT id, name, icon, description, lore_text FROM game_oghams WHERE rank=1 ORDER BY RAND() LIMIT 1');
                        if (ogRows.length) {
                            const dropped = ogRows[0];
                            // Give it to winner: find their equipped weapon with the most free slots
                            const [equipped] = await db.query(`
                                SELECT ce.item_id, gi.ogham_slots,
                                    (gi.ogham_slots - IFNULL(used.cnt,0)) AS free_slots
                                FROM character_equipment ce
                                JOIN game_items gi ON gi.id = ce.item_id
                                LEFT JOIN (
                                    SELECT item_id, COUNT(*) as cnt FROM character_oghams
                                    WHERE character_id=? GROUP BY item_id
                                ) used ON used.item_id = ce.item_id
                                WHERE ce.character_id=? AND gi.ogham_slots > 0
                                ORDER BY free_slots DESC LIMIT 1`, [battle.winner, battle.winner]);

                            if (equipped.length && equipped[0].free_slots > 0) {
                                // Find next free slot index
                                const [usedSlots] = await db.query(
                                    'SELECT slot_index FROM character_oghams WHERE character_id=? AND item_id=?',
                                    [battle.winner, equipped[0].item_id]);
                                const usedIdx = new Set(usedSlots.map(r => r.slot_index));
                                let freeSlot = 0;
                                while (usedIdx.has(freeSlot)) freeSlot++;

                                await db.query(
                                    `INSERT INTO character_oghams (character_id, item_id, slot_index, ogham_id, current_rank, kill_count)
                                     VALUES (?,?,?,?,1,0)`,
                                    [battle.winner, equipped[0].item_id, freeSlot, dropped.id]);

                                io.to(`char_${battle.winner}`).emit('ogham_drop', {
                                    name: dropped.name,
                                    icon: dropped.icon || '🩸',
                                    description: dropped.description,
                                    lore_text: dropped.lore_text
                                });
                            } else {
                                // No free slots — add to a "pending oghams" bag (character_items via a special item)
                                // For now: notify the player they found one but couldn't slot it
                                io.to(`char_${battle.winner}`).emit('notification', {
                                    text: `🩸 Found a ${dropped.name} but have no free Ogham Grooves to carve it into.`,
                                    type: 'ogham_found_noslot'
                                });
                            }
                        }
                    }
                } catch(oghamDropErr) { console.warn('Ogham drop error (non-fatal):', oghamDropErr.message); }
            }

    // ---------------------------------------------------------
    // WITNESS SYSTEM
    // TEACHING: After any PvE win, any friendly NPC within 5 tiles
    // of the winner's last known position "witnesses" the kill.
    // We log a fact to npc_memories so the NPC can reference it
    // next time the player talks to them.
    //
    // We only do this for PvE (witnessing PvP would feel weird),
    // and we pull the winner's position from the characters table
    // since we don't have their map position here otherwise.
    // ---------------------------------------------------------
    if (battle.type === 'PVE' && battle.winner && battle.status === 'FINISHED') {
        try {
            const winner     = battle.combatants[battle.winner];
            const loser      = battle.getOpponent(battle.winner);
            const [posRows]  = await db.query(
                'SELECT map_id, x, y FROM characters WHERE id=?', [battle.winner]
            );
            if (posRows.length) {
                const { map_id, x, y } = posRows[0];

                // Get all NPCs on the same map from npcState (exported via global)
                // TEACHING: We use a module-level getter so battle_engine doesn't
                // need to import the full server — separation of concerns.
                const witnesses = typeof getNpcsForMap === 'function'
                    ? getNpcsForMap(map_id).filter(n => {
                        const dist = Math.abs(n.x - x) + Math.abs(n.y - y);
                        return dist <= 5 && !n.isEnemy;
                      })
                    : [];

                const fact = `Witnessed ${winner.name} defeat ${loser.name} in combat`;
                for (const npc of witnesses) {
                    await db.query(
                        `INSERT INTO npc_memories (char_id, npc_name, facts_json, reputation)
                         VALUES (?, ?, JSON_ARRAY(?), 0)
                         ON DUPLICATE KEY UPDATE
                             facts_json = IF(
                                 JSON_LENGTH(facts_json) < 10,
                                 JSON_ARRAY_APPEND(facts_json, '$', ?),
                                 facts_json
                             ),
                             last_seen = CURRENT_TIMESTAMP`,
                        [battle.winner, npc.name, fact, fact]
                    );
                }
                if (witnesses.length) {
                    console.log(`👁️  ${witnesses.length} NPC(s) witnessed ${winner.name} defeat ${loser.name}`);
                }

                // Blood Ogham kill tracking
                try {
                    const [oghams] = await db.query(
                        `SELECT co.*, go.kills_to_rank_up, go.base_ogham_id, go.rank as go_rank
                         FROM character_oghams co
                         JOIN game_oghams go ON go.id = co.ogham_id
                         WHERE co.character_id = ?`, [battle.winner]);
                    for (const og of oghams) {
                        const newKills = (og.kill_count || 0) + 1;
                        const threshold = og.kills_to_rank_up || 50;
                        const [nextRank] = await db.query(
                            'SELECT id, name, icon FROM game_oghams WHERE base_ogham_id=? AND rank=?',
                            [og.base_ogham_id || og.ogham_id, (og.go_rank || 1) + 1]);
                        if (newKills >= threshold && nextRank.length) {
                            await db.query(
                                'UPDATE character_oghams SET ogham_id=?, current_rank=current_rank+1, kill_count=0 WHERE id=?',
                                [nextRank[0].id, og.id]);
                            io.to(`char_${battle.winner}`).emit('notification', {
                                text: `${nextRank[0].icon} ${nextRank[0].name} — your Blood Ogham deepens!`,
                                type: 'ogham_rankup'
                            });
                        } else {
                            await db.query('UPDATE character_oghams SET kill_count=? WHERE id=?', [newKills, og.id]);
                        }
                    }
                } catch(ogErr) { console.warn('Ogham tracking error:', ogErr.message); }

                // Add a rumor so the kill spreads beyond direct witnesses over time
                if (typeof global._addRumor === 'function') {
                    await global._addRumor(db, battle.winner, winner.name,
                        `defeated ${loser.name} in combat`);
                }
            }
        } catch (witnessErr) {
            console.warn('Witness system error (non-fatal):', witnessErr.message);
        }
    }

    // Notify battle participants that battle is over (clears battle UI)
    io.to('battle_' + battle.id).emit('battle_end');

    // Notify map room that battle ended
    if (battle.mapId) {
        io.to('map_' + battle.mapId).emit('battle_ended_on_map', { battleId: battle.id });
    }

    // Clean up memory
    battle.unregisterFromMap();
    delete activeBattles[battle.id];
}

// =================================================================
// LEVEL UP CHECK (state_json-aware version)
// =================================================================
// Teaching: The old checkLevelUp compared cumulative characters.experience
// to per-level xp_required, which is wrong — a level 10 char with 5000
// total XP always has >= 100 (level 2 requirement) so would loop forever.
// The fix: read state_json.xp (XP within current level, decremented on
// each level-up by the progression system) and compare that instead.
// We also apply HP/MP growth here just like the old version did.
async function checkLevelUpStateJson(db, charId) {
    const [rows] = await db.query(
        'SELECT level, max_hp, max_mp, state_json FROM characters WHERE id=?', [charId]
    );
    if (!rows.length) return;
    const c = rows[0];
    let state = {};
    try { state = JSON.parse(c.state_json || '{}'); } catch {}
    if (typeof state.xp !== 'number') state.xp = 0;
    if (!state.progression) state.progression = { unspent_points: 0 };

    let level = c.level || 1;
    let maxHp = c.max_hp;
    let maxMp = c.max_mp;
    let leveled = false;

    // Level up loop — capped at 50 for safety
    for (let i = 0; i < 50; i++) {
        const nextRows = await queryLevelRow(db, level + 1);
        if (!nextRows.length) break; // max level
        const next = nextRows[0];
        if (state.xp < (next.xp_required || 0)) break;

        // Consume XP and level up
        state.xp -= next.xp_required;
        level++;
        maxHp += (next.hp_growth || 0);
        maxMp += (next.mp_growth || 0);
        state.progression.unspent_points = (state.progression.unspent_points || 0) + 3;
        state.progression.last_level_up_at = new Date().toISOString();
        leveled = true;
    }

    if (leveled) {
        await db.query(
            'UPDATE characters SET level=?, max_hp=?, current_hp=?, max_mp=?, current_mp=?, state_json=? WHERE id=?',
            [level, maxHp, maxHp, maxMp, maxMp, JSON.stringify(state), charId]
        );

        // ── Referral Reward Payout ────────────────────────────────
        // TEACHING: We check referral payouts inside checkLevelUpStateJson
        // because this is the single authoritative place where a level-up
        // is confirmed and written to the DB. Checking it anywhere else
        // (e.g. on login) risks double-paying if two events race.
        //
        // Flow:
        //   1. Load the threshold level from system_settings (default 5)
        //   2. Check if this level-up crossed the threshold
        //   3. Find the referrer via characters.user_id → users.referred_by
        //   4. Atomically mark referral_paid=1 (UPDATE ... WHERE referral_paid=0
        //      acts as a compare-and-swap — only one payout ever succeeds)
        //   5. Add gold to the referrer's active character
        //   6. Send them an in-game mail notification
        try {
            await _checkReferralPayout(db, charId, level);
        } catch(refErr) { console.warn('[referral] payout check failed:', refErr.message); }

        // Log level-up
        try {
            const [charRow] = await db.query('SELECT name, user_id FROM characters WHERE id=?', [charId]);
            if (charRow.length) {
                await db.query(
                    `INSERT INTO game_event_log (event_type,actor_id,actor_name,detail_json)
                     VALUES ('level_up',?,?,?)`,
                    [charRow[0].user_id, charRow[0].name,
                     JSON.stringify({ new_level: level, char_id: charId })]
                );
            }
        } catch(logErr) { /* non-fatal */ }
    } else if (state.xp !== (rows[0].state_xp)) {
        // Just save updated state_json (XP synced, no level change)
        await db.query('UPDATE characters SET state_json=? WHERE id=?', [JSON.stringify(state), charId]);
    }
    return leveled; // allows callers to detect level-ups
}

// Keep old function name as alias so existing calls don't break
async function checkLevelUp(db, charId) {
    return checkLevelUpStateJson(db, charId);
}

// =================================================================
// REFERRAL PAYOUT HELPER
// =================================================================
// Called from checkLevelUpStateJson after every confirmed level-up.
// The UPDATE WHERE referral_paid=0 acts as an atomic lock so only
// one payout ever fires, even if two events somehow race.
// =================================================================
async function _checkReferralPayout(db, charId, newLevel) {
    // 1. Read threshold + reward values from system_settings
    const [settingRows] = await db.query(
        `SELECT setting_key, setting_value FROM system_settings
         WHERE setting_key IN ('referral_threshold_level','referral_gold_reward','referral_xp_reward')`
    );
    const settings = {};
    for (const r of settingRows) settings[r.setting_key] = parseInt(r.setting_value, 10) || 0;

    const THRESHOLD = settings['referral_threshold_level'] || 5;
    const GOLD      = settings['referral_gold_reward']      || 500;
    const XP_BONUS  = settings['referral_xp_reward']        || 0;

    // 2. Only act when the player exactly reaches the threshold level
    if (newLevel !== THRESHOLD) return;

    // 3. Load the character's user + referral state
    const [[charRow]] = await db.query(
        `SELECT c.name AS char_name, c.user_id,
                u.referred_by, u.referral_paid
         FROM characters c
         JOIN users u ON u.id = c.user_id
         WHERE c.id = ?`,
        [charId]
    );
    if (!charRow || !charRow.referred_by || charRow.referral_paid) return;

    // 4. Atomic lock — only one UPDATE will get affectedRows=1
    const [lock] = await db.query(
        'UPDATE users SET referral_paid=1 WHERE id=? AND referral_paid=0',
        [charRow.user_id]
    );
    if (!lock.affectedRows) return;

    // 5. Find the referrer's primary character (highest level)
    const [[referrerChar]] = await db.query(
        `SELECT c.id AS char_id, c.name, c.gold
         FROM characters c
         WHERE c.user_id = ?
         ORDER BY c.level DESC, c.id ASC LIMIT 1`,
        [charRow.referred_by]
    );
    if (!referrerChar) return;

    // 6. Pay gold
    if (GOLD > 0) {
        await db.query('UPDATE characters SET gold = gold + ? WHERE id=?', [GOLD, referrerChar.char_id]);
    }

    // 7. Pay XP bonus via state_json
    if (XP_BONUS > 0) {
        const [[rs]] = await db.query('SELECT state_json FROM characters WHERE id=?', [referrerChar.char_id]);
        let state = {};
        try { state = JSON.parse(rs?.state_json || '{}'); } catch {}
        state.xp = (state.xp || 0) + XP_BONUS;
        await db.query('UPDATE characters SET state_json=? WHERE id=?', [JSON.stringify(state), referrerChar.char_id]);
    }

    // 8. System mail notification
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    const subject   = `🎉 Referral Reward — ${charRow.char_name} reached level ${THRESHOLD}!`;
    const body = [
        `${charRow.char_name}, who joined using your invite link, just reached level ${THRESHOLD}.`,
        ``,
        `Your referral reward:`,
        GOLD     > 0 ? `  💰 ${GOLD} gold (added to your character)` : null,
        XP_BONUS > 0 ? `  ✨ ${XP_BONUS} bonus XP` : null,
        ``,
        `Keep spreading the word — every recruit can earn you rewards!`
    ].filter(l => l !== null).join('\n');

    await db.query(
        `INSERT INTO character_mail
         (sender_char_id, sender_name, recipient_char_id, subject, body, gold_attachment, expires_at)
         VALUES (NULL, 'System', ?, ?, ?, 0, ?)`,
        [referrerChar.char_id, subject, body, expiresAt]
    );

    // 9. Event log
    await db.query(
        `INSERT INTO game_event_log (event_type, actor_id, actor_name, detail_json)
         VALUES ('referral_paid', ?, ?, ?)`,
        [charRow.referred_by, referrerChar.name,
         JSON.stringify({ referred_char: charRow.char_name, referrer_char: referrerChar.name,
                          gold: GOLD, xp: XP_BONUS, threshold: THRESHOLD })]
    ).catch(() => {});

    console.log(`[Referral] ${referrerChar.name} earned ${GOLD}g + ${XP_BONUS}xp for referring ${charRow.char_name} (Lv.${THRESHOLD})`);
}

module.exports = {
    endBattle,
    checkLevelUpStateJson,
    checkLevelUp,
    _checkReferralPayout,
    // Re-export from commands.js for backward compat
    getAvailableCommands,
    broadcastBattleUpdate,
    getSignatureTechs
};
