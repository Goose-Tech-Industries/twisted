// =================================================================
// BATTLE ENGINE — Legacy Re-export Layer
// =================================================================
// This file re-exports everything from the modular battle subsystems
// so that any existing `require('./legacy')` continues to work.
//
// The actual code now lives in:
//   stats.js      — getEffectiveStats, buildFormulaVars, scaling
//   state.js      — BattleState class, activeBattles, battlesByMap
//   limbs.js      — Limb zones, wounds, damage routing
//   systems.js    — Active defense, ki, bleed, break, stagger, combos, alignment
//   world.js      — Weather, stealth, transforms, summons, styles, bosses
//   narrative.js  — Flavor text, RP, narration, sig techs, master training
//   rules.js      — Battle rules, elemental reactions, threat, status combos
//   combat.js     — Core resolvers (damage, skill, item, limit, status, reactions)
//   rewards.js    — endBattle, levelUp, loot, commands, broadcast
//   settings.js   — Feature flags, arena overrides (pre-existing)
// =================================================================

const { BattleState, activeBattles, battlesByMap } = require('./state');
const stats = require('./stats');
const limbs = require('./limbs');
const systems = require('./systems');
const world = require('./world');
const narrative = require('./narrative');
const rules = require('./rules');
const combat = require('./combat');
const rewards = require('./rewards');
const { loadBattleSettings, applyArenaOverrides } = require('./settings');

// =================================================================
// BATTLE MANAGER — assembled from modular pieces
// =================================================================
// createBattle, createPartyBattle, createFFABattle, processAction,
// and aiTurn remain here since they orchestrate across all modules.
// They were defined as BattleManager methods in the original.
// =================================================================

const crypto = require('crypto');
const { safeEval } = require('../event_runner');

// Optional Legendary Artifacts hook
let artifactRoutes = null;
try {
    artifactRoutes = require('../routes/artifactRoutes');
} catch (e) {
    artifactRoutes = null;
}

const BattleManager = {
    // --- CREATE BATTLE (1v1 PvP or 1v1 PvE) ---
    createBattle: async (db, io, p1Socket, p2Socket, p1CharId, p2CharId, type = 'PVP') => {
        const p1Stats = await stats.getEffectiveStats(db, p1CharId);
        let p2Stats = await stats.getEffectiveStats(db, p2CharId);
        if (!p1Stats || !p2Stats) return null;

        if (type === 'PVE') {
            let playerCount = 1;
            try {
                const [party] = await db.query(
                    `SELECT COUNT(*) as cnt FROM character_party_members pm
                     JOIN character_parties p ON p.id = pm.party_id
                     WHERE p.id = (SELECT party_id FROM character_party_members WHERE character_id = ? LIMIT 1)`,
                    [p1CharId]);
                if (party.length && party[0].cnt > 1) playerCount = party[0].cnt;
            } catch {}
            if (playerCount > 1) {
                const factor = await stats.getScalingFactor(db, p1Stats.mapId || 0);
                p2Stats = stats.applyEnemyScaling(p2Stats, playerCount, factor);
            }
        }

        const [res] = await db.query(
            `INSERT INTO game_battles (p1_char_id, p2_char_id, p1_user_id, p2_user_id, turn_char_id, status, battle_mode, access_token)
             VALUES (?,?,?,?,?,?,'1v1',?)`,
            [p1CharId, p2CharId, p1Stats.userId, p2Stats.userId,
             p1Stats.speed >= p2Stats.speed ? p1CharId : p2CharId, 'ACTIVE',
             crypto.randomBytes(16).toString('hex')]
        );
        const battleId = res.insertId;

        try {
            const [gw] = await db.query("SELECT value FROM game_settings WHERE `key`='battle_grid_w' LIMIT 1");
            const [gh] = await db.query("SELECT value FROM game_settings WHERE `key`='battle_grid_h' LIMIT 1");
            if (gw.length) p1Stats._gridW = parseInt(gw[0].value) || 8;
            if (gh.length) p1Stats._gridH = parseInt(gh[0].value) || 5;
        } catch {}

        const battle = new BattleState(battleId,
            { players: [p1Stats], enemies: [p2Stats] }, type);
        if (p1Stats._gridW) battle.GRID_W = p1Stats._gridW;
        if (p1Stats._gridH) battle.GRID_H = p1Stats._gridH;

        const totalCombatants = Object.keys(battle.combatants).length;
        if (totalCombatants > 6 && battle.GRID_W <= 8) {
            battle.GRID_W = Math.min(20, Math.max(battle.GRID_W, Math.ceil(totalCombatants * 1.5)));
            battle.GRID_H = Math.min(15, Math.max(battle.GRID_H, Math.ceil(totalCombatants * 0.8)));
        }

        activeBattles[battleId] = battle;
        battle._assignGridPositions();

        await battle.initSettings(db);
        await battle.initLimbSystem(db);
        await battle.initSession10(db);
        await battle.initFightingStyles(db);
        await battle.initSpellSlots(db);
        await battle.initBossPhases(db);
        await battle.initCombatExtras(db);
        await battle.initSession23(db);
        await battle.initSession24(db);
        await battle.initComboSystem(db);
        await battle.initFinal8(db);

        if (battle._settings?.enable_formations && typeof battle.initFormation === 'function') {
            battle.initFormation();
            if (typeof battle.loadFormationShapes === 'function') {
                try { await battle.loadFormationShapes(db); } catch {}
            }
        }
        if (typeof battle.initATB === 'function') battle.initATB();
        if (typeof battle.initCTB === 'function') battle.initCTB();

        try {
            const [posRows] = await db.query('SELECT map_id, x, y FROM characters WHERE id=?', [p1CharId]);
            if (posRows.length) battle.registerOnMap(posRows[0].map_id, posRows[0].x, posRows[0].y);
        } catch {}

        try {
            const [mapPos] = await db.query('SELECT map_id FROM characters WHERE id=? LIMIT 1', [p1CharId]);
            if (mapPos.length) {
                const mapId = mapPos[0].map_id;
                const [mapRow] = await db.query('SELECT collisions_json, objects_json FROM game_maps WHERE id=? LIMIT 1', [mapId]);
                if (mapRow.length) {
                    let events = [];
                    try { events = JSON.parse(mapRow[0].collisions_json || '[]'); } catch {}
                    battle.loadTerrain(events);
                    let mapObjects = [];
                    try { mapObjects = JSON.parse(mapRow[0].objects_json || '[]'); } catch {}
                    battle.loadObjects(mapObjects);
                }
            }
        } catch {}

        try {
            await db.query(
                `INSERT IGNORE INTO game_battle_participants (battle_id,character_id,team,is_ai)
                 VALUES (?,?,1,0),(?,?,2,?)`,
                [battleId, p1CharId, battleId, p2CharId, type === 'PVE' ? 1 : 0]
            );
        } catch {}

        const p1Cmds = await rewards.getAvailableCommands(db, p1Stats);
        const p2Cmds = await rewards.getAvailableCommands(db, p2Stats);

        if (p1Socket) p1Socket.emit('battle_start', { ...battle.toClientState(p1CharId), commands: p1Cmds });
        if (p2Socket) p2Socket.emit('battle_start', { ...battle.toClientState(p2CharId), commands: p2Cmds });

        battle.addLog({ actor: 'system', text: `Battle begins! ${p1Stats.name} vs ${p2Stats.name}!` });

        if (type === 'PVE' && battle.turnCharId === p2CharId) {
            setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1500);
        }
        return battleId;
    },

    // --- CREATE PARTY BATTLE ---
    createPartyBattle: async (db, io, playerCharIds, enemyNpcIds, socketMap = {}, companionStats = []) => {
        const enemyCharIds = [];
        const npcNames = {};
        for (const npcId of enemyNpcIds) {
            const [rows] = await db.query('SELECT char_id, name FROM game_npcs WHERE id=? AND is_enemy=1', [npcId]);
            if (!rows.length || !rows[0].char_id) continue;
            enemyCharIds.push(rows[0].char_id);
            npcNames[rows[0].char_id] = rows[0].name;
        }
        if (!enemyCharIds.length) return null;

        const playerStats = (await Promise.all(playerCharIds.map(id => stats.getEffectiveStats(db, id)))).filter(Boolean);
        let enemyStats = (await Promise.all(enemyCharIds.map(id => stats.getEffectiveStats(db, id)))).filter(Boolean);
        if (!playerStats.length || !enemyStats.length) return null;

        const totalPlayerSide = playerStats.length + companionStats.length;
        if (totalPlayerSide > 1) {
            const mapId = playerStats[0].mapId || 0;
            const factor = await stats.getScalingFactor(db, mapId);
            enemyStats = enemyStats.map(es => stats.applyEnemyScaling(es, totalPlayerSide, factor));
        }

        const allPlayerTeam = [...playerStats];
        for (const cs of companionStats) {
            allPlayerTeam.push({ ...cs, _isCompanionAI: true });
        }

        const firstPlayer = playerStats[0];
        const firstEnemy = enemyStats[0];
        const accessToken = crypto.randomBytes(16).toString('hex');
        const allCombatants = [...allPlayerTeam, ...enemyStats];
        const fastestCharId = allCombatants.sort((a, b) => b.speed - a.speed)[0].charId;

        const [res] = await db.query(
            `INSERT INTO game_battles (p1_char_id, p2_char_id, p1_user_id, p2_user_id,
              turn_char_id, status, battle_mode, access_token)
             VALUES (?,?,?,?,?,'ACTIVE','PARTY',?)`,
            [firstPlayer.charId, firstEnemy.charId, firstPlayer.userId,
             firstEnemy.userId || 0, fastestCharId, accessToken]
        );
        const battleId = res.insertId;

        const playerTeamMembers = allPlayerTeam.map(s => ({ ...s, isAI: !!s._isCompanionAI }));
        const enemyTeamMembers = enemyStats.map(s => ({ ...s, isAI: true }));

        const battle = new BattleState(battleId,
            { team_1: playerTeamMembers, team_2: enemyTeamMembers }, 'PARTY_PVE');
        battle.accessToken = accessToken;
        battle.enemyNpcIds = [...enemyNpcIds];
        activeBattles[battleId] = battle;

        await battle.initSettings(db);
        await battle.initLimbSystem(db);
        await battle.initSession10(db);
        await battle.initFightingStyles(db);
        await battle.initSpellSlots(db);
        await battle.initBossPhases(db);
        await battle.initCombatExtras(db);
        await battle.initSession23(db);
        await battle.initSession24(db);
        await battle.initComboSystem(db);
        await battle.initFinal8(db);

        if (battle._settings?.enable_formations && typeof battle.initFormation === 'function') {
            battle.initFormation();
            if (typeof battle.loadFormationShapes === 'function') {
                try { await battle.loadFormationShapes(db); } catch {}
            }
        }
        if (typeof battle.initATB === 'function') battle.initATB();
        if (typeof battle.initCTB === 'function') battle.initCTB();

        try {
            const [posRows] = await db.query('SELECT map_id, x, y FROM characters WHERE id=?', [firstPlayer.charId]);
            if (posRows.length) {
                battle.registerOnMap(posRows[0].map_id, posRows[0].x, posRows[0].y);
                const [mapRow] = await db.query('SELECT collisions_json, objects_json FROM game_maps WHERE id=? LIMIT 1', [posRows[0].map_id]);
                if (mapRow.length) {
                    let events = [];
                    try { events = JSON.parse(mapRow[0].collisions_json || '[]'); } catch {}
                    battle.loadTerrain(events);
                    let mapObjects = [];
                    try { mapObjects = JSON.parse(mapRow[0].objects_json || '[]'); } catch {}
                    battle.loadObjects(mapObjects);
                }
            }
        } catch {}

        try {
            const vals = [
                ...playerCharIds.map(id => [battleId, id, 1, 0]),
                ...companionStats.map(cs => [battleId, cs.charId, 1, 1]),
                ...enemyCharIds.map(id => [battleId, id, 2, 1])
            ];
            for (const v of vals) {
                await db.query('INSERT IGNORE INTO game_battle_participants (battle_id,character_id,team,is_ai) VALUES (?,?,?,?)', v);
            }
        } catch {}

        const names = [...allPlayerTeam, ...enemyStats].map(s => s.name).join(', ');
        battle.addLog({ actor: 'system', text: `Party battle begins! ${names}` });

        for (const ps of playerStats) {
            const sock = socketMap[ps.charId];
            if (!sock) continue;
            const cmds = await rewards.getAvailableCommands(db, ps);
            sock.emit('battle_start', { ...battle.toClientState(ps.charId), commands: cmds });
            sock.join('battle_' + battleId);
            sock._battleCharId = ps.charId;
        }

        const firstActor = battle.getCombatant(battle.turnCharId);
        if (firstActor && firstActor.isAI) {
            setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1500);
        }
        return battleId;
    },

    // --- CREATE FFA BATTLE ---
    createFFABattle: async (db, io, teams, socketMap = {}, aiTeams = []) => {
        const allTeams = {};
        const allStats = [];
        for (const [teamId, charIds] of Object.entries(teams)) {
            const isAI = aiTeams.includes(teamId);
            const teamStats = (await Promise.all(charIds.map(id => stats.getEffectiveStats(db, id)))).filter(Boolean);
            teamStats.forEach(s => { s.isAI = isAI; });
            allTeams[teamId] = teamStats;
            allStats.push(...teamStats);
        }
        if (allStats.length < 2) return null;

        const accessToken = crypto.randomBytes(16).toString('hex');
        const fastest = allStats.sort((a, b) => b.speed - a.speed)[0];
        const [res] = await db.query(
            `INSERT INTO game_battles (p1_char_id, p2_char_id, p1_user_id, p2_user_id,
              turn_char_id, status, battle_mode, access_token)
             VALUES (?,?,?,?,?,'ACTIVE','FFA',?)`,
            [allStats[0].charId, allStats[1].charId, allStats[0].userId || 0,
             allStats[1].userId || 0, fastest.charId, accessToken]
        );
        const battleId = res.insertId;

        const battle = new BattleState(battleId, allTeams, 'FFA');
        battle.accessToken = accessToken;
        activeBattles[battleId] = battle;

        await battle.initSettings(db);
        await battle.initLimbSystem(db);
        await battle.initSession10(db);
        await battle.initFightingStyles(db);
        await battle.initSpellSlots(db);
        await battle.initBossPhases(db);
        await battle.initCombatExtras(db);
        await battle.initSession23(db);
        await battle.initSession24(db);
        await battle.initComboSystem(db);
        await battle.initFinal8(db);

        if (battle._settings?.enable_formations && typeof battle.initFormation === 'function') {
            battle.initFormation();
            if (typeof battle.loadFormationShapes === 'function') {
                try { await battle.loadFormationShapes(db); } catch {}
            }
        }
        if (typeof battle.initATB === 'function') battle.initATB();
        if (typeof battle.initCTB === 'function') battle.initCTB();

        try {
            const firstHuman = allStats.find(s => !s.isAI) || allStats[0];
            const [posRows] = await db.query('SELECT map_id, x, y FROM characters WHERE id=?', [firstHuman.charId]);
            if (posRows.length) {
                battle.registerOnMap(posRows[0].map_id, posRows[0].x, posRows[0].y);
                const [mapRow] = await db.query('SELECT collisions_json, objects_json FROM game_maps WHERE id=? LIMIT 1', [posRows[0].map_id]);
                if (mapRow.length) {
                    try { battle.loadTerrain(JSON.parse(mapRow[0].collisions_json || '[]')); } catch {}
                    try { battle.loadObjects(JSON.parse(mapRow[0].objects_json || '[]')); } catch {}
                }
            }
        } catch {}

        try {
            for (const [teamId, teamStats] of Object.entries(allTeams)) {
                const teamNum = Object.keys(allTeams).indexOf(teamId) + 1;
                for (const s of teamStats) {
                    await db.query('INSERT IGNORE INTO game_battle_participants (battle_id,character_id,team,is_ai) VALUES (?,?,?,?)',
                        [battleId, s.charId, teamNum, s.isAI ? 1 : 0]);
                }
            }
        } catch {}

        const allNames = allStats.map(s => s.name).join(', ');
        battle.addLog({ actor: 'system', text: `Free-for-all battle begins! ${allNames}` });

        for (const s of allStats) {
            if (s.isAI) continue;
            const sock = socketMap[s.charId];
            if (!sock) continue;
            const cmds = await rewards.getAvailableCommands(db, s);
            sock.emit('battle_start', { ...battle.toClientState(s.charId), commands: cmds });
            sock.join('battle_' + battleId);
            sock._battleCharId = s.charId;
        }

        const firstActor = battle.getCombatant(battle.turnCharId);
        if (firstActor && firstActor.isAI) {
            setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1500);
        }
        return battleId;
    },

    getAvailableCommands: rewards.getAvailableCommands,

    // --- PROCESS PLAYER ACTION ---
    processAction: async (db, io, socket, { battleId, commandId, skillId, itemId, limitId, targetId, targetObjectKey, targetLimb, flavorText, sigTechId, comboInput, actionTiming }) => {
        const battle = activeBattles[battleId];
        if (!battle || battle.status !== 'ACTIVE') {
            socket.emit('battle_error', 'No active battle.');
            return;
        }

        const charId = socket._battleCharId;
        if (!charId) { socket.emit('battle_error', 'Not in a battle.'); return; }
        if (!battle.combatants[charId]) { socket.emit('battle_error', 'Not a participant in this battle.'); return; }

        const teamIds = socket._battleTeamIds || [charId];
        if (!teamIds.includes(battle.turnCharId)) { socket.emit('battle_error', 'Not your turn.'); return; }

        const actingCharId = battle.turnCharId;
        const actor = battle.getCombatant(actingCharId);
        let target = battle.getOpponent(actingCharId);
        if (targetId) {
            const manual = battle.getCombatant(parseInt(targetId));
            if (manual && manual.teamId !== actor.teamId && manual.currentHp > 0) target = manual;
        }

        // Object targeting
        if (targetObjectKey && !skillId && !itemId && !limitId) {
            const [ox, oy] = targetObjectKey.split(',').map(Number);
            const obj = battle.getObjectAt(ox, oy);
            if (!obj) { socket.emit('battle_error', 'No targetable object there.'); return; }
            if (actor.gridX !== undefined) {
                const dist = BattleState.chebyshev(actor, { gridX: ox, gridY: oy });
                if (dist > 1) { socket.emit('battle_error', `Too far from ${obj.label}. Move closer.`); return; }
            }
            let dmg = Math.max(1, Math.floor(actor.atk * 1.5));
            if (actor._stance === 'POWER') dmg = Math.floor(dmg * 1.4);
            const objResult = battle.damageObject(ox, oy, dmg, battle);
            const result = { actor: actor.name, actions: [], log: [] };
            result.log.push(`${actor.name} strikes the ${obj.label}! (${dmg} damage)`);
            result.actions.push({ type: 'object_damage', objectKey: targetObjectKey, label: obj.label, damage: dmg });
            if (objResult && objResult.destroyed) {
                result.log.push(obj.onDestroy?.message || `${obj.label} is destroyed!`);
                result.actions.push({ type: 'object_destroyed', objectKey: targetObjectKey, label: obj.label });
                for (const fx of (objResult.effects || [])) {
                    result.log.push(`  \u2192 ${fx.target} takes ${fx.damage} ${fx.type} damage!`);
                    result.actions.push({ type: fx.type, target: fx.target, amount: fx.damage });
                }
            }
            battle.addLog({ actor: actor.name, action: 'Object Attack', text: `${actor.name} attacks ${obj.label}` });
            await rewards.broadcastBattleUpdate(io, battle, result, db);
            combat.checkDeaths(battle);
            if (battle.status !== 'ACTIVE') { await rewards.broadcastBattleUpdate(io, battle, { text: 'Battle Over!' }, db); await rewards.endBattle(db, io, battle); return; }
            const _tickR = await combat.processStatusEffects(db, battle); if (_tickR.log.length) await rewards.broadcastBattleUpdate(io, battle, _tickR, db);
            combat.checkDeaths(battle);
            if (battle.status !== 'ACTIVE') { await rewards.broadcastBattleUpdate(io, battle, { text: 'Battle Over!' }, db); await rewards.endBattle(db, io, battle); return; }
            battle.nextTurn();
            await rewards.broadcastBattleUpdate(io, battle, null, db);
            const nextAct2 = battle.getCombatant(battle.turnCharId);
            if (nextAct2 && nextAct2.isAI) setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1200);
            return;
        }

        // Charged skill auto-fire
        if (actor._charging && actor._charging.turnsLeft <= 0) {
            const chargedId = actor._charging.skillId;
            actor._charging = null;
            actor._chargingFire = true;
            const result = await combat.executeBattleAction(db, battle, actor, target, { skillId: chargedId });
            actor._chargingFire = false;
            await rewards.broadcastBattleUpdate(io, battle, result, db);
            if (battle.status !== 'ACTIVE') { await rewards.endBattle(db, io, battle); return; }
            const _tickR = await combat.processStatusEffects(db, battle); if (_tickR.log.length) await rewards.broadcastBattleUpdate(io, battle, _tickR, db);
            combat.checkDeaths(battle);
            if (battle.status !== 'ACTIVE') { await rewards.broadcastBattleUpdate(io, battle, { text: 'Battle Over!' }, db); await rewards.endBattle(db, io, battle); return; }
            battle.nextTurn();
            await rewards.broadcastBattleUpdate(io, battle, null, db);
            const nextAct = battle.getCombatant(battle.turnCharId);
            if (nextAct.isAI) setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1200);
            return;
        }

        const result = await combat.executeBattleAction(db, battle, actor, target, { commandId, skillId, itemId, limitId, targetLimb, flavorText, sigTechId, comboInput, actionTiming });
        await rewards.broadcastBattleUpdate(io, battle, result, db);

        // Custom win condition
        if (battle._winCondition && battle.status === 'ACTIVE') {
            const wcResult = world.evaluateWinCondition(battle);
            if (wcResult) {
                if (wcResult.won) {
                    battle.status = 'FINISHED';
                    const playerTeamId = Object.keys(battle.teams)[0];
                    const firstLiving = (battle.teams[playerTeamId] || []).find(id =>
                        battle.combatants[id]?.currentHp > 0 && !battle.combatants[id]?.isAI);
                    battle.winner = firstLiving || null;
                    battle.winnerTeamId = playerTeamId;
                } else {
                    battle.status = 'FINISHED';
                    battle.winner = null;
                }
                await rewards.broadcastBattleUpdate(io, battle, { log: [wcResult.text], actions: [{ type: 'win_condition', won: wcResult.won, text: wcResult.text }] }, db);
                await rewards.endBattle(db, io, battle);
                return;
            }
        }

        if (result._sigTechDiscovery) socket.emit('sig_tech_discovery', result._sigTechDiscovery);
        if (battle.status !== 'ACTIVE') { await rewards.endBattle(db, io, battle); return; }

        const tickResult = await combat.processStatusEffects(db, battle);
        if (tickResult.log.length) await rewards.broadcastBattleUpdate(io, battle, tickResult, db);

        combat.checkDeaths(battle);
        if (battle.status !== 'ACTIVE') {
            await rewards.broadcastBattleUpdate(io, battle, { text: 'Battle Over!' }, db);
            await rewards.endBattle(db, io, battle);
            return;
        }

        for (const cid of Object.keys(battle.combatants)) {
            const c = battle.combatants[cid];
            if (c._charging && c._charging.turnsLeft > 0) c._charging.turnsLeft--;
        }

        if (battle._oneMoreActive === battle.turnCharId) {
            battle._oneMoreActive = null;
            await rewards.broadcastBattleUpdate(io, battle, null, db);
            return;
        }
        battle._oneMoreActive = null;

        battle.nextTurn();
        await rewards.broadcastBattleUpdate(io, battle, null, db);

        const nextActor = battle.getCombatant(battle.turnCharId);
        if (nextActor.isAI) setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1200);
    },

    // --- AI TURN ---
    aiTurn: async (db, io, battleId) => {
        const battle = activeBattles[battleId];
        if (!battle || battle.status !== 'ACTIVE') return;

        const ai = battle.getCombatant(battle.turnCharId);
        const enemyTeam = battle.getEnemyTeam(battle.turnCharId);
        let player;

        if (ai._taunted?.by) {
            const taunter = battle.getCombatant(ai._taunted.by);
            if (taunter && taunter.currentHp > 0 && !taunter._knockedOut) player = taunter;
        }
        if (!player && battle._settings?.enable_threat_system) {
            player = rules.getHighestThreatTarget(battle, ai.charId);
        }
        if (!player) {
            player = enemyTeam.length
                ? enemyTeam.reduce((a, b) => a.currentHp < b.currentHp ? a : b)
                : battle.getOpponent(battle.turnCharId);
        }
        if (!player) return;

        const tactics = ai._tactics || 'BALANCED';

        // AI limb targeting
        let aiTargetLimb = null;
        if (battle._settings?.enable_limb_targeting && player._limbHp && player._limbZones) {
            const zones = Object.keys(player._limbHp).filter(k => player._limbHp[k].current > 0);
            if (zones.length > 1) {
                switch (tactics) {
                    case 'AGGRESSIVE': {
                        if (zones.includes('head') && Math.random() < 0.30) { aiTargetLimb = 'head'; }
                        else {
                            let weakest = null, weakestPct = 1;
                            for (const z of zones) {
                                const hp = player._limbHp[z];
                                const pct = hp.current / hp.max;
                                if (pct < weakestPct && z !== 'torso') { weakest = z; weakestPct = pct; }
                            }
                            aiTargetLimb = weakest || 'torso';
                        }
                        break;
                    }
                    case 'DEFENSIVE': {
                        const arms = zones.filter(z => z.includes('arm'));
                        aiTargetLimb = arms.length ? arms[Math.floor(Math.random() * arms.length)] : 'torso';
                        break;
                    }
                    case 'SUPPORT': {
                        aiTargetLimb = zones.includes('legs') ? 'legs' : zones.includes('hind_legs') ? 'hind_legs' : 'torso';
                        break;
                    }
                    default: {
                        const roll = Math.random();
                        if (roll < 0.50) aiTargetLimb = 'torso';
                        else if (roll < 0.70) aiTargetLimb = zones.find(z => z.includes('arm')) || 'torso';
                        else if (roll < 0.85) aiTargetLimb = zones.find(z => z.includes('leg')) || 'torso';
                        else if (roll < 0.95) aiTargetLimb = zones.includes('head') ? 'head' : 'torso';
                        else aiTargetLimb = zones[Math.floor(Math.random() * zones.length)];
                        break;
                    }
                }
            }
        }

        // AI ki channeling
        if (battle._settings?.enable_ki_channeling && !ai._kiChanneled &&
            (ai._kiChannelUsed || 0) < (battle._settings.ki_channel_uses_per_battle || 1) &&
            ai.currentHp / ai.maxHp < 0.20) {
            const channelResult = systems.resolveKiChannel(battle, ai, { actor: ai.name, actions: [], log: [] });
            await rewards.broadcastBattleUpdate(io, battle, channelResult, db);
            if (battle.status !== 'ACTIVE') { await rewards.endBattle(db, io, battle); return; }
            battle.nextTurn();
            await rewards.broadcastBattleUpdate(io, battle, null, db);
            const nextAfterChannel = battle.getCombatant(battle.turnCharId);
            if (nextAfterChannel?.isAI && battle.status === 'ACTIVE') {
                setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1200);
            }
            return;
        }

        // AI nonlethal
        if (battle._settings?.enable_nonlethal && !ai._nonLethal) {
            const persona = (ai._persona || '').toLowerCase();
            if (persona.includes('guard') || persona.includes('merciful') ||
                persona.includes('honorable') || persona.includes('pacifist') ||
                persona.includes('lawful')) {
                ai._nonLethal = true;
            }
        }

        const available = await rewards.getAvailableCommands(db, ai);
        let commandId = null;
        let skillId = null;
        let limitId = null;

        // SUPPORT: heal wounded ally
        if (tactics === 'SUPPORT') {
            const allies = battle.getAllyTeam ? battle.getAllyTeam(battle.turnCharId) : [];
            const woundedAlly = allies.find(a => a.currentHp > 0 && a.currentHp / a.maxHp < 0.60);
            if (woundedAlly) {
                const healSkills = (available.skills || []).filter(sk =>
                    (sk.targetType === 'SELF' || sk.targetType === 'ALLY' || sk.targetType === 'ALL_ALLIES') && ai.currentMp >= sk.mpCost);
                if (healSkills.length) skillId = healSkills[0].id;
            }
        }

        // Limit break
        if (!skillId && ai.limitbreak >= 100 && available.limits && available.limits.length) {
            limitId = available.limits[0].id;
        }

        // Heal if low
        const healThreshold = tactics === 'DEFENSIVE' ? 0.50 : tactics === 'SUPPORT' ? 0.40 : 0.30;
        if (!skillId && !limitId && ai.currentHp / ai.maxHp < healThreshold) {
            const healSkills = (available.skills || []).filter(sk => sk.targetType === 'SELF');
            if (healSkills.length && ai.currentMp >= healSkills[0].mpCost) skillId = healSkills[0].id;
        }

        // Combo-ready skill
        if (!skillId && !limitId && !commandId) {
            const comboReady = (available.skills || []).filter(sk => sk.comboReady && ai.currentMp >= sk.mpCost);
            if (comboReady.length) skillId = comboReady[Math.floor(Math.random() * comboReady.length)].id;
        }

        // Random skill
        const skillChance = tactics === 'AGGRESSIVE' ? 0.70 : tactics === 'DEFENSIVE' ? 0.30 : tactics === 'SUPPORT' ? 0.40 : 0.50;
        if (!skillId && !limitId && !commandId && available.skills && available.skills.length) {
            if (Math.random() < skillChance) {
                const usable = available.skills.filter(sk => sk.targetType !== 'SELF' && ai.currentMp >= sk.mpCost);
                if (usable.length) skillId = usable[Math.floor(Math.random() * usable.length)].id;
            }
        }

        // Target destructible objects
        if (!skillId && !limitId && !commandId && battle.battleObjects && ai.gridX !== undefined) {
            for (const obj of Object.values(battle.battleObjects)) {
                if (obj.destroyed || !obj.onDestroy || obj.onDestroy.type !== 'fire_aoe') continue;
                const distToObj = BattleState.chebyshev(ai, { gridX: obj.x, gridY: obj.y });
                if (distToObj > 1) continue;
                const nearbyEnemies = enemyTeam.filter(e =>
                    e.currentHp > 0 && BattleState.chebyshev(e, { gridX: obj.x, gridY: obj.y }) <= (obj.onDestroy.radius || 0));
                if (nearbyEnemies.length > 0 && Math.random() < 0.60) {
                    let dmg = Math.max(1, Math.floor(ai.atk * 1.5));
                    if (ai._stance === 'POWER') dmg = Math.floor(dmg * 1.4);
                    const objRes = battle.damageObject(obj.x, obj.y, dmg, battle);
                    const objResult = { actor: ai.name, actions: [], log: [] };
                    objResult.log.push(`${ai.name} strikes the ${obj.label}! (${dmg} damage)`);
                    objResult.actions.push({ type: 'object_damage', objectKey: `${obj.x},${obj.y}`, label: obj.label, damage: dmg });
                    if (objRes && objRes.destroyed) {
                        objResult.log.push(obj.onDestroy.message || `${obj.label} is destroyed!`);
                        objResult.actions.push({ type: 'object_destroyed', objectKey: `${obj.x},${obj.y}`, label: obj.label });
                        for (const fx of (objRes.effects || [])) {
                            objResult.log.push(`  \u2192 ${fx.target} takes ${fx.damage} ${fx.type} damage!`);
                            objResult.actions.push({ type: fx.type, target: fx.target, amount: fx.damage });
                        }
                    }
                    battle.addLog({ actor: ai.name, action: 'Object Attack', text: `${ai.name} attacks ${obj.label}` });
                    await rewards.broadcastBattleUpdate(io, battle, objResult, db);
                    combat.checkDeaths(battle);
                    if (battle.status !== 'ACTIVE') { await rewards.broadcastBattleUpdate(io, battle, { text: 'Battle Over!' }, db); await rewards.endBattle(db, io, battle); return; }
                    const _tickR = await combat.processStatusEffects(db, battle); if (_tickR.log.length) await rewards.broadcastBattleUpdate(io, battle, _tickR, db);
                    combat.checkDeaths(battle);
                    if (battle.status !== 'ACTIVE') { await rewards.broadcastBattleUpdate(io, battle, { text: 'Battle Over!' }, db); await rewards.endBattle(db, io, battle); return; }
                    battle.nextTurn();
                    await rewards.broadcastBattleUpdate(io, battle, null, db);
                    const nextAct3 = battle.getCombatant(battle.turnCharId);
                    if (nextAct3 && nextAct3.isAI) setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1200);
                    return;
                }
            }
        }

        // Default: attack or defend
        if (!skillId && !limitId && !commandId) {
            const roll = Math.random();
            const defendChance = tactics === 'DEFENSIVE' ? 0.30 : tactics === 'AGGRESSIVE' ? 0.05 : 0.15;
            if (roll < 0.10 && !ai._stance && tactics !== 'DEFENSIVE') {
                const stanceCmds = (available.commands || []).filter(cmd =>
                    cmd.name === 'Power Stance' || cmd.name === 'Guard Stance');
                if (stanceCmds.length) commandId = stanceCmds[0].id;
            }
            if (!commandId) commandId = roll < defendChance ? 2 : 1;
        }

        const result = await combat.executeBattleAction(db, battle, ai, player, { commandId, skillId, limitId, targetLimb: aiTargetLimb });
        await rewards.broadcastBattleUpdate(io, battle, result, db);

        if (battle.status !== 'ACTIVE') { await rewards.endBattle(db, io, battle); return; }

        await combat.processStatusEffects(db, battle);
        combat.checkDeaths(battle);
        if (battle.status !== 'ACTIVE') {
            await rewards.broadcastBattleUpdate(io, battle, { text: 'Battle Over!' }, db);
            await rewards.endBattle(db, io, battle);
            return;
        }

        battle.nextTurn();
        await rewards.broadcastBattleUpdate(io, battle, null, db);

        const nextAI = battle.getCombatant(battle.turnCharId);
        if (nextAI && nextAI.isAI && battle.status === 'ACTIVE') {
            setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1200);
        }
    },

    // --- Defense / Nonlethal / Limb target ---
    setDefenseStance: (battleId, charId, defenseType) => {
        const battle = activeBattles[battleId];
        if (!battle) return null;
        const c = battle.combatants[charId];
        if (!c) return null;
        if (!battle._settings?.enable_active_defense) return { enabled: false };
        const valid = ['dodge', 'block', 'counter', 'none'];
        c._defaultDefense = valid.includes(defenseType) ? defenseType : 'block';
        return { enabled: true, defense: c._defaultDefense, name: c.name };
    },

    toggleNonLethal: (battleId, charId) => {
        const battle = activeBattles[battleId];
        if (!battle) return null;
        const c = battle.combatants[charId];
        if (!c) return null;
        if (!battle._settings?.enable_nonlethal) return { enabled: false, reason: 'Non-lethal mode is disabled' };
        c._nonLethal = !c._nonLethal;
        return { enabled: true, nonLethal: c._nonLethal, name: c.name };
    },

    setLimbTarget: (battleId, charId, limbKey) => {
        const battle = activeBattles[battleId];
        if (!battle) return null;
        const c = battle.combatants[charId];
        if (!c) return null;
        if (!battle._settings?.enable_limb_targeting) return null;
        c._targetLimb = limbKey || null;
        return { limbKey: c._targetLimb };
    },

    processKoAction: async (db, io, battleId, actorCharId, npcCharId, action) => {
        const battle = activeBattles[battleId];
        if (!battle) return { success: false, message: 'Battle not found' };
        const npc = battle.combatants[npcCharId];
        if (!npc || !npc._knockedOut) return { success: false, message: 'Target not knocked out' };

        const result = { success: true, action, npcName: npc.name, data: {} };
        const jp = stats.jp;

        switch (action) {
            case 'interrogate': {
                const chance = battle._settings?.ko_interrogate_base_chance || 0.60;
                const willingness = world.calculateNpcWillingness(npc, 0);
                const adjustedChance = Math.min(0.95, chance + (willingness / 200));
                const success = Math.random() < adjustedChance;
                result.data = { success, willingness, dialogue: success ? `*coughs* ...Fine. What do you want to know?` : `*spits* I'll tell you nothing!` };
                try { await db.query(`UPDATE game_battle_knockouts SET interaction=?, interaction_result=? WHERE battle_id=? AND npc_char_id=?`, ['interrogate', JSON.stringify(result.data), battleId, npcCharId]); } catch {}
                break;
            }
            case 'recruit': {
                const willingness = world.calculateNpcWillingness(npc, 0);
                const success = willingness >= 40;
                if (success) {
                    try {
                        const [npcRow] = await db.query('SELECT id FROM game_npcs WHERE char_id=? LIMIT 1', [npcCharId]);
                        if (npcRow.length) {
                            const [countRow] = await db.query('SELECT COUNT(*) as cnt FROM character_companions WHERE character_id=? AND is_active=1', [actorCharId]);
                            if (countRow[0].cnt < 3) {
                                await db.query(`INSERT IGNORE INTO character_companions (character_id, npc_id, is_active, tactics) VALUES (?, ?, 1, 'BALANCED')`, [actorCharId, npcRow[0].id]);
                            }
                        }
                    } catch {}
                }
                result.data = { success, willingness, dialogue: success ? `...You spared my life. I'll fight alongside you.` : `I'd rather die than serve you.` };
                try { await db.query(`UPDATE game_battle_knockouts SET interaction=?, interaction_result=? WHERE battle_id=? AND npc_char_id=?`, ['recruit', JSON.stringify(result.data), battleId, npcCharId]); } catch {}
                break;
            }
            case 'loot': {
                try {
                    const [npcRow] = await db.query('SELECT drop_table_json FROM game_npcs WHERE char_id=? LIMIT 1', [npcCharId]);
                    if (npcRow.length && npcRow[0].drop_table_json) {
                        const dropTable = jp(npcRow[0].drop_table_json, []);
                        const drops = [];
                        for (const entry of dropTable) {
                            if (!entry.item_id || Math.random() * 100 > (entry.chance || 0)) continue;
                            const qty = Math.max(1, entry.min_qty || 1);
                            await db.query('INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)', [actorCharId, entry.item_id, qty]);
                            const [iRow] = await db.query('SELECT name, icon FROM game_items WHERE id=?', [entry.item_id]);
                            if (iRow.length) drops.push({ name: iRow[0].name, icon: iRow[0].icon || '\u{1F4E6}', qty });
                        }
                        result.data = { drops };
                    }
                } catch {}
                try { await db.query(`UPDATE game_battle_knockouts SET interaction=? WHERE battle_id=? AND npc_char_id=?`, ['loot', battleId, npcCharId]); } catch {}
                break;
            }
            case 'release': {
                try {
                    const repBonus = battle._settings?.nonlethal_rep_bonus_release || 5;
                    result.data = { repBonus, dialogue: `...I won't forget this mercy.` };
                    await db.query(`UPDATE game_battle_knockouts SET interaction=?, interaction_result=? WHERE battle_id=? AND npc_char_id=?`, ['release', JSON.stringify(result.data), battleId, npcCharId]);
                } catch {}
                break;
            }
            default: return { success: false, message: 'Unknown action' };
        }
        return result;
    },

    processPvpKoChoice: async (db, io, battleId, actorCharId, targetCharId, spare) => {
        const battle = activeBattles[battleId];
        if (!battle) return { success: false };
        const target = battle.combatants[targetCharId];
        if (!target || !target._knockedOut) return { success: false };
        if (spare) {
            const repBonus = battle._settings?.nonlethal_rep_bonus_release || 5;
            return { success: true, spared: true, repBonus };
        } else {
            target._knockedOut = false;
            target.currentHp = 0;
            const repPenalty = battle._settings?.nonlethal_rep_penalty_finish || -10;
            return { success: true, spared: false, repPenalty };
        }
    },

    spectate: (io, socket, battleId) => {
        const battle = activeBattles[battleId];
        if (!battle) return { success: false, message: 'Battle not found' };
        socket.join('battle_' + battleId);
        socket._spectating = battleId;
        const state = battle.toClientState(null);
        socket.emit('battle_update', { state, action: null, commands: null, spectator: true });
        return { success: true, battleId };
    },

    unspectate: (io, socket) => {
        if (socket._spectating) {
            socket.leave('battle_' + socket._spectating);
            socket._spectating = null;
        }
    },

    trainUnderMaster: async (db, charId, npcId) => {
        return await narrative.trainUnderMaster(db, charId, npcId);
    },

    createSignatureTech: async (db, charId, { name, techType, element, originText, originKeywords }) => {
        const { loadBattleSettings } = require('./settings');
        const settings = await loadBattleSettings(db);
        if (!settings.enable_signature_techs) return { success: false, message: 'Signature techniques are disabled' };

        const maxTechs = settings.sig_tech_max_per_character || 3;
        try {
            const [countRow] = await db.query('SELECT COUNT(*) as cnt FROM character_signature_techs WHERE character_id=?', [charId]);
            if (countRow[0].cnt >= maxTechs) return { success: false, message: `Maximum ${maxTechs} signature techniques reached` };
        } catch { return { success: false, message: 'Database error' }; }

        const battleText = `{name} unleashes ${name}!`;
        try {
            const [res] = await db.query(
                `INSERT INTO character_signature_techs (character_id, name, tech_type, element, origin_text, origin_keywords, battle_text, current_level, current_xp) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
                [charId, name, techType || 'ki_attack', element || null, originText || null, JSON.stringify(originKeywords || []), battleText]
            );
            return { success: true, techId: res.insertId, name, techType, element };
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') return { success: false, message: 'You already have a technique with that name' };
            return { success: false, message: e.message };
        }
    },

    addSigTechAbility: async (db, charId, techId, abilityId, slot) => {
        const jp = stats.jp;
        try {
            const [techRow] = await db.query('SELECT * FROM character_signature_techs WHERE id=? AND character_id=?', [techId, charId]);
            if (!techRow.length) return { success: false, message: 'Technique not found' };
            const tech = techRow[0];
            const [levelRow] = await db.query('SELECT ability_slots FROM game_signature_levels WHERE level=?', [tech.current_level]);
            const maxSlots = levelRow.length ? levelRow[0].ability_slots : 0;
            if (slot > maxSlots) return { success: false, message: `Only ${maxSlots} ability slots available at level ${tech.current_level}` };
            const [abilRow] = await db.query('SELECT * FROM game_signature_abilities WHERE id=?', [abilityId]);
            if (!abilRow.length) return { success: false, message: 'Ability not found' };
            if (abilRow[0].min_level > tech.current_level) return { success: false, message: `Requires tech level ${abilRow[0].min_level}` };
            const exclusive = jp(abilRow[0].exclusive_with, []);
            if (exclusive.length) {
                const [equipped] = await db.query('SELECT ability_id FROM character_sig_tech_abilities WHERE tech_id=?', [techId]);
                const equippedIds = equipped.map(r => r.ability_id);
                const conflict = exclusive.find(id => equippedIds.includes(id));
                if (conflict) return { success: false, message: 'Conflicts with an already equipped ability' };
            }
            await db.query(
                `INSERT INTO character_sig_tech_abilities (tech_id, ability_id, slot_number, unlocked_at_level) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE ability_id=VALUES(ability_id)`,
                [techId, abilityId, slot, tech.current_level]);
            return { success: true, abilityName: abilRow[0].label };
        } catch (e) { return { success: false, message: e.message }; }
    },

    getSignatureTechs: rewards.getSignatureTechs || combat.getSignatureTechs,

    activeBattles,
    getEffectiveStats: stats.getEffectiveStats,
    applyEnemyScaling: stats.applyEnemyScaling,
    getScalingFactor: stats.getScalingFactor,
    broadcastBattleUpdate: rewards.broadcastBattleUpdate,
    endBattle: rewards.endBattle,
    calculateNpcWillingness: world.calculateNpcWillingness,
    battlesByMap,

    getBattle: (id) => activeBattles[id] || null,

    getBattlesOnMap: (mapId) => {
        const ids = battlesByMap[parseInt(mapId)];
        if (!ids || !ids.size) return [];
        return [...ids].map(bid => {
            const b = activeBattles[bid];
            if (!b || b.status !== 'ACTIVE') return null;
            const teamIds = Object.keys(b.teams);
            const playerNames = [];
            const enemyNames = [];
            let playerCount = 0, enemyCount = 0;
            for (const tId of teamIds) {
                for (const cid of (b.teams[tId] || [])) {
                    const c = b.combatants[cid];
                    if (!c) continue;
                    if (c.isAI) { enemyNames.push(c.name); if (c.currentHp > 0) enemyCount++; }
                    else { playerNames.push(c.name); if (c.currentHp > 0) playerCount++; }
                }
            }
            return { battleId: b.id, x: b.mapX, y: b.mapY, playerCount, enemyCount, playerNames, enemyNames, teamCount: teamIds.length, type: b.type };
        }).filter(Boolean);
    }
};

module.exports = { BattleManager, BattleState };
