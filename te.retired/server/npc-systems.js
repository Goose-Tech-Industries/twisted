// =============================================================
// server/npc-systems.js — All NPC behavior systems extracted from server.js
// =============================================================
// TEACHING: This module owns everything about NPC life: memory, rumors,
// titles, crowd reactions, environmental hints, needs, companions,
// chatter, and the live NPC state container. Socket handlers and the
// battle engine call into these functions; they never manage NPC state
// directly. Shared mutable state (onlinePlayers, worldFlags, etc.)
// comes from state.js so there's one source of truth.
// =============================================================

const state = require('./state');

// =============================================================
// NPC MEMORY HELPERS
// =============================================================
// _upsertMemory saves the player<->NPC memory row to the database.
// It uses INSERT ... ON DUPLICATE KEY UPDATE so it's safe to call
// any time — creates the row on first conversation, updates after.
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

// _addRumor writes a globally notable fact to npc_rumors.
// Any NPC anywhere can eventually learn this via the rumor tick.
// We deduplicate by char_id + rumor_text so the same event
// doesn't spawn duplicate rumors.
async function _addRumor(db, charId, charName, rumorText) {
    try {
        await db.query(
            `INSERT IGNORE INTO npc_rumors (char_id, char_name, rumor_text)
             VALUES (?, ?, ?)`,
            [charId, charName, rumorText]
        );
    } catch (e) { console.warn('addRumor failed:', e.message); }
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
// _getFactionRep returns the player's rep with a specific faction.
// _updateFactionRep writes the rep and cascades to any rival.
async function _getFactionRep(db, charId, factionId) {
    const [[row]] = await db.query(
        'SELECT reputation FROM player_faction_rep WHERE char_id=? AND faction_id=?',
        [charId, factionId]);
    return row?.reputation || 0;
}

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

// _triggerCrowdReaction: called when a player enters a map.
// Blends individual NPC rep + faction rep for an atmospheric entrance moment.
async function _triggerCrowdReaction(socket, db, player, mapId) {
    try {
        const npcsOnMap = getNpcsForMap(mapId);
        if (!npcsOnMap.length) return;

        const npcNames = npcsOnMap.map(n => n.name);
        const [repRows] = await db.query(
            `SELECT AVG(reputation) as avg_rep, COUNT(*) as known
             FROM npc_memories
             WHERE char_id = ? AND npc_name IN (?)`,
            [player.charId, npcNames]
        );
        const avgIndividual = repRows.length ? (repRows[0].avg_rep || 0) : 0;
        const known         = repRows.length ? (repRows[0].known  || 0) : 0;

        // Faction rep for factions represented on this map
        let avgFaction = 0;
        const npcIds = npcsOnMap.map(n => n.id);
        if (npcIds.length) {
            const [fRows] = await db.query(
                `SELECT AVG(pfr.reputation) as avg_frep
                 FROM player_faction_rep pfr
                 JOIN npc_factions nf ON nf.faction_id = pfr.faction_id
                 WHERE pfr.char_id = ? AND nf.npc_id IN (?)`,
                [player.charId, npcIds]
            );
            avgFaction = fRows.length ? (fRows[0].avg_frep || 0) : 0;
        }

        // Blend: faction carries 40% weight, individual 60%
        const avgRep = known >= 2
            ? (avgIndividual * 0.6 + avgFaction * 0.4)
            : avgFaction;

        if (known < 2 && Math.abs(avgFaction) < 20) return;

        let tier, lines;
        if (avgRep >= 60) {
            tier  = 'celebrated';
            lines = [
                `*The locals take notice as ${player.name} arrives.*`,
                `Someone nearby calls out: "Hey, it's ${player.name}!"`,
                `*A few faces turn — recognition, and something like respect.*`
            ];
        } else if (avgRep >= 25) {
            tier  = 'friendly';
            lines = [
                `*A few NPCs nod as ${player.name} enters.*`,
                `"Ah, ${player.name}. Good to see a familiar face."`,
                `*Nearby NPCs seem at ease with your presence.*`
            ];
        } else if (avgRep <= -50) {
            tier  = 'hostile';
            lines = [
                `*The crowd tenses as ${player.name} steps in.*`,
                `Someone mutters: "Not this one again..."`,
                `*A guard shifts their weight, watching you.*`
            ];
        } else if (avgRep <= -20) {
            tier  = 'wary';
            lines = [
                `*A few nearby NPCs eye you cautiously.*`,
                `*Someone steps back as you pass.*`
            ];
        } else {
            return; // Neutral — no reaction, don't send anything
        }

        const text = lines[Math.floor(Math.random() * lines.length)];
        socket.emit('crowd_reaction', { tier, text });
    } catch (e) { console.warn('crowd reaction failed:', e.message); }
}

// =============================================================
// ENVIRONMENTAL REACTIONS — HP-based healer hint
// =============================================================
// TEACHING: When a player enters a map at low HP (< 30%),
// we check if there's a healer NPC on the map and surface
// their name. This is purely informational — the player still
// has to find and talk to them. It rewards players who explore
// and build NPC relationships because a high-rep healer may
// offer a free heal during interaction.
async function _triggerEnvironmentalReaction(socket, db, player, mapId) {
    try {
        const [hpRows] = await db.query(
            'SELECT current_hp, max_hp FROM characters WHERE id=?', [player.charId]);
        if (!hpRows.length) return;
        const { current_hp, max_hp } = hpRows[0];
        const hpRatio = max_hp > 0 ? current_hp / max_hp : 1;
        if (hpRatio >= 0.3) return; // Only react at low HP

        // Find a non-enemy NPC with a healing persona on this map
        const npcsHere = getNpcsForMap(mapId).filter(n => !n.isEnemy);
        const healer   = npcsHere.find(n =>
            n.persona && /heal|medic|cleric|priest|doctor|nurse|shaman/i.test(n.persona)
        );
        if (!healer) return;

        socket.emit('environmental_reaction', {
            type: 'low_hp',
            text: `*You look battered. ${healer.name} is nearby and may be able to help.*`,
            npcName: healer.name
        });
    } catch (e) { /* non-fatal */ }
}

// =============================================================
// NPC NEEDS — transient mini-quests from idle NPCs
// =============================================================
// TEACHING: "Needs" are lightweight requests NPCs emit when idle.
// They're stored only in npcState._need — nothing in the DB.
// When a player accepts a need, it clears the need and gives a
// small reward (gold). No quest journal, no tracking overhead.
// Think of them as ambient chores that keep the world feeling alive.
//
// Need templates: array of { text, reward_gold, reward_xp }
const NEED_TEMPLATES = [
    { text: 'Looking for someone to carry a message to the inn.', reward_gold: 5,  reward_xp: 10 },
    { text: 'Needs help moving a heavy crate. Just a minute of your time.', reward_gold: 8,  reward_xp: 5  },
    { text: 'Dropped something in the market and cannot find it. Could use an extra pair of eyes.', reward_gold: 6,  reward_xp: 8  },
    { text: 'Wants someone to stand watch for a moment while they step away.', reward_gold: 10, reward_xp: 12 },
    { text: 'Needs a trusted person to hold a package briefly.', reward_gold: 7,  reward_xp: 6  },
];

let _needTick = 0;
async function npcNeedsTick(io) {
    _needTick++;
    // Fire every ~45 seconds
    if (_needTick % 22 !== 0) return;

    // Give a random idle NPC on a populated map a need
    const maps = new Set(Object.values(state.onlinePlayers).map(p => p.mapId));
    for (const mapId of maps) {
        const idle = getNpcsForMap(mapId).filter(n => !n.isEnemy && !n._need);
        if (!idle.length) continue;
        const npc  = idle[Math.floor(Math.random() * idle.length)];
        const tmpl = NEED_TEMPLATES[Math.floor(Math.random() * NEED_TEMPLATES.length)];
        npc._need  = { ...tmpl, acceptedBy: null };

        // Broadcast to players within 8 tiles
        const sockets = await io.in('map_' + mapId).fetchSockets().catch(() => []);
        for (const s of sockets) {
            const p = state.onlinePlayers[s.id];
            if (!p) continue;
            if (Math.abs(p.x - npc.x) + Math.abs(p.y - npc.y) > 8) continue;
            s.emit('npc_need', { npcId: npc.id, npcName: npc.name, text: npc._need.text });
        }

        // Auto-expire need after 60 seconds if nobody takes it
        setTimeout(() => {
            if (npc._need && !npc._need.acceptedBy) npc._need = null;
        }, 60000);
        break; // One need per tick per pass — keep it rare
    }
}

// =============================================================
// NPC LIVE STATE + MOVEMENT SYSTEM
// =============================================================
// TEACHING: NPCs need to live somewhere in memory between ticks.
// We keep npcState as a flat dict: { npcId -> { id, name, icon,
//   mapId, x, y, homeX, homeY, wanderRadius, moveType, persona } }
//
// Why server-side movement?
//   If every client moved their own NPCs, they'd disagree on positions
//   and interact would break. One server ticks all NPCs and broadcasts
//   their positions — clients just draw what the server says.
//
// Tick rate: every 2 seconds. NPCs don't need 60fps.
// =============================================================

const npcState = {};  // npcId -> live NPC object

async function loadMapNpcs(db, mapId) {
    const [rows] = await db.query(
        `SELECT n.id, n.name, n.icon, n.map_id, n.x, n.y, n.persona, n.is_enemy,
                n.move_type, n.wander_radius, n.char_id,
                n.quest_offers_json, n.schedule_json, n.shop_id,
                n.mood, n.is_dead, n.predecessor_name,
                n.is_recruitable, n.recruit_rep_req, n.recruit_quest_req,
                n.script_key, n.sprite_asset_id, a.file_url AS sprite_url
         FROM game_npcs n
         LEFT JOIN game_assets a ON a.id = n.sprite_asset_id
         WHERE n.map_id = ? AND n.is_enemy = 0 AND n.is_dead = 0`,
        [mapId]
    );
    for (const row of rows) {
        if (!npcState[row.id]) {
            // First time we see this NPC — seed from DB position
            // Build persona: if this NPC replaced someone, bake that in
            let persona = row.persona || '';
            if (row.predecessor_name) {
                persona = `${persona} You replaced ${row.predecessor_name}, who died. You are aware of their legacy.`.trim();
            }

            npcState[row.id] = {
                id:           row.id,
                name:         row.name,
                icon:         row.icon || '👤',
                spriteUrl:    row.sprite_url || null,
                mapId:        row.map_id,
                x:            row.x,
                y:            row.y,
                homeX:        row.x,
                homeY:        row.y,
                wanderRadius:  row.wander_radius || 3,
                moveType:      row.move_type || 'WANDER',
                persona,
                charId:        row.char_id || null,
                isEnemy:       row.is_enemy,
                questOffers:   state.safeJsonParse(row.quest_offers_json, []),
                scheduleSlots: state.safeJsonParse(row.schedule_json, []),
                shopId:        row.shop_id || null,
                mood:          row.mood || null,
                _need:         null,
                // PATROL: waypoint list and current index
                patrolPath:    state.safeJsonParse(row.patrol_path_json, null),
                _patrolIdx:    0,       // which waypoint we're heading toward
                _patrolPause:  0,       // ticks to wait at current waypoint
                // Companion recruitment
                isRecruitable:   !!row.is_recruitable,
                recruitRepReq:   row.recruit_rep_req || 50,
                recruitQuestReq: row.recruit_quest_req || null,
                scriptKey:       row.script_key || null
            };
        }
    }
    return rows.map(r => npcState[r.id]);
}

function getNpcsForMap(mapId) {
    return Object.values(npcState).filter(n => n.mapId === mapId);
}

// =============================================================
// NPC MOVEMENT TICK — wander + patrol
// =============================================================
// Runs every 2 seconds. Only moves NPCs on maps with players.
// WANDER: random 1-tile step within wanderRadius of home.
// PATROL: follow patrolPath waypoints in order, pause briefly at each.
// STATIONARY: never moves.
async function npcMoveTick(db, io) {
    const maps = new Set(Object.values(state.onlinePlayers).map(p => p.mapId));
    for (const mapId of maps) {
        const npcs = getNpcsForMap(mapId);
        for (const npc of npcs) {
            if (npc.moveType === 'STATIONARY' || npc.isEnemy) continue;

            let newX = npc.x, newY = npc.y, moved = false;

            if (npc.moveType === 'PATROL' && npc.patrolPath?.length) {
                // Pause at waypoint
                if (npc._patrolPause > 0) { npc._patrolPause--; continue; }
                const wp = npc.patrolPath[npc._patrolIdx];
                if (!wp) continue;
                // Step toward waypoint
                const dx = Math.sign(wp.x - npc.x), dy = Math.sign(wp.y - npc.y);
                newX = npc.x + dx; newY = npc.y + dy;
                if (newX === wp.x && newY === wp.y) {
                    npc._patrolIdx = (npc._patrolIdx + 1) % npc.patrolPath.length;
                    npc._patrolPause = wp.pause || 2;
                }
                moved = true;
            } else if (npc.moveType === 'WANDER') {
                // 40% chance to move each tick
                if (Math.random() > 0.4) continue;
                const dir = Math.floor(Math.random() * 4);
                const dx = [0, 0, -1, 1][dir], dy = [-1, 1, 0, 0][dir];
                newX = npc.x + dx; newY = npc.y + dy;
                // Stay within wander radius of home
                if (Math.abs(newX - npc.homeX) > npc.wanderRadius ||
                    Math.abs(newY - npc.homeY) > npc.wanderRadius) continue;
                if (newX < 0 || newY < 0) continue;
                moved = true;
            }

            if (moved && (newX !== npc.x || newY !== npc.y)) {
                npc.x = newX; npc.y = newY;
                io.to('map_' + mapId).emit('npc_moved', { id: npc.id, x: newX, y: newY });
            }
        }
    }
}

// Expose to global scope so battle_engine.js (same process) can call it
// TEACHING: Node.js modules share the same process memory. Setting a property
// on the `global` object lets other modules access it without circular imports.
// We only use this for the witness system — it's deliberately narrow.
global.getNpcsForMap = getNpcsForMap;
global._addRumor     = _addRumor;

// =============================================================
// COMPANION HELPERS
// =============================================================
async function loadCompanions(db, charId) {
    try {
        const [rows] = await db.query(
            `SELECT cc.npc_id, cc.tactics, cc.is_active,
                    gn.name, gn.icon, gn.char_id,
                    c.level, c.current_hp, c.max_hp, c.current_mp, c.max_mp
             FROM character_companions cc
             JOIN game_npcs gn ON gn.id = cc.npc_id
             LEFT JOIN characters c ON c.id = gn.char_id
             WHERE cc.character_id = ? AND cc.is_active = 1`,
            [charId]
        );
        const comps = rows.map(r => ({
            npcId:     r.npc_id,
            name:      r.name,
            icon:      r.icon || '👤',
            charId:    r.char_id,
            level:     r.level || 1,
            currentHp: r.current_hp || 10,
            maxHp:     r.max_hp || 10,
            currentMp: r.current_mp || 0,
            maxMp:     r.max_mp || 0,
            tactics:   r.tactics || 'BALANCED',
            x:         0,
            y:         0,
            mapId:     0,
            isActive:  true
        }));
        state.companionState[charId] = comps;
        return comps;
    } catch (e) {
        console.error('loadCompanions error:', e);
        return [];
    }
}

function getActiveCompanions(charId) {
    return state.companionState[charId] || [];
}

// Spawn companions at player position
function spawnCompanionsAtPlayer(p) {
    const comps = getActiveCompanions(p.charId);
    for (const comp of comps) {
        comp.mapId = p.mapId;
        comp.x = p.x;
        comp.y = p.y;
    }
}

// ── NPC CHATTER HELPERS ───────────────────────────────────────
// Defined outside npcTick so they are not re-created on every 2s tick
// and so _chatterTick is initialized before npcTick calls them.
const CHATTER_POOL = [
    ['{a}', '*mutters to {b}* "Cold night."'],
    ['{a}', '"Seen many strangers lately. Something stirs."'],
    ['{a}', '"Prices at the market went up again."'],
    ['{a}', '"I heard someone cleared the old cave. Hard to believe."'],
    ['{b}', '"You look tired, {a}."', '{a}', '"Tired is still alive."'],
    ['{a}', '"Avoid the east gate after dark."'],
    ['{a}', '"Something howled in the woods last night. Three times."'],
    ['{b}', '"Any trouble lately?"', '{a}', '"Trouble is always close. You learn to walk past it."'],
    ['{a}', '"Last time I trusted a merchant with a wink, I lost my boots."'],
    ['{a}', '"You think the gods are watching?"', '{b}', '"If they are, they have excellent taste in entertainment."'],
];

// World-flag-aware chatter: if a flag is set, add relevant lines
function getChatterLines() {
    const pool = CHATTER_POOL.slice();
    if (state.worldFlags['goblin_boss_slain'])
        pool.push(['{a}', '"I heard someone finally put down the goblin boss. About time."']);
    if (state.worldFlags['war_started'])
        pool.push(['{a}', '"War is coming. You can feel it, smell it."']);
    if (state.worldFlags['bridge_destroyed'])
        pool.push(['{a}', '"The bridge is out. South road is the only way now."']);
    if (state.worldFlags['festival_active'])
        pool.push(['{a}', '"Festival is good for business. Bad for sleep."']);
    return pool;
}

let _chatterTick = 0;
async function rumorSpreadTick(db) {
    // Run every ~30 seconds (every 15 ticks of the 2s npcTick)
    if (_chatterTick % 15 !== 0) return;

    try {
        // Pick one rumor that hasn't fully spread yet
        const [rumors] = await db.query(
            `SELECT * FROM npc_rumors
             WHERE spread_count < max_spread
             ORDER BY RAND() LIMIT 1`
        );
        if (!rumors.length) return;
        const rumor = rumors[0];

        // Get all NPCs across all maps (from live state — only loaded maps)
        // TEACHING: We only spread to NPCs that are currently loaded in memory.
        // This means a rumor spreads faster on busy maps, which feels natural.
        const allNpcs = Object.values(npcState).filter(n => !n.isEnemy);
        if (!allNpcs.length) return;

        // Find NPCs who don't already know this rumor
        const fact = `Heard that ${rumor.char_name} ${rumor.rumor_text}`;
        const [knowers] = await db.query(
            `SELECT npc_name FROM npc_memories
             WHERE char_id = ? AND JSON_SEARCH(facts_json, 'one', ?) IS NOT NULL`,
            [rumor.char_id, fact]
        );
        const knowerNames = new Set(knowers.map(r => r.npc_name));

        // Pick 1-2 NPCs who don't know yet
        const candidates = allNpcs.filter(n => !knowerNames.has(n.name));
        if (!candidates.length) {
            // Everyone knows — mark fully spread
            await db.query('UPDATE npc_rumors SET spread_count=max_spread WHERE id=?', [rumor.id]);
            return;
        }

        const picks = candidates.sort(() => Math.random() - 0.5).slice(0, 2);
        for (const npc of picks) {
            // Load existing memory for this NPC+player pair
            const [memRows] = await db.query(
                'SELECT facts_json, reputation FROM npc_memories WHERE char_id=? AND npc_name=?',
                [rumor.char_id, npc.name]
            );
            const existing = memRows.length
                ? state.safeJsonParse(memRows[0].facts_json, [])
                : [];
            const rep = memRows.length ? (memRows[0].reputation || 0) : 0;

            if (existing.length < 10 && !existing.includes(fact)) {
                existing.push(fact);
                await _upsertMemory(db, rumor.char_id, npc.name, existing, rep);
            }
        }

        await db.query(
            'UPDATE npc_rumors SET spread_count = spread_count + ? WHERE id = ?',
            [picks.length, rumor.id]
        );
        console.log(`📢 Rumor spread: "${fact}" → ${picks.map(n => n.name).join(', ')}`);
    } catch (e) { console.warn('rumorSpreadTick failed:', e.message); }
}

async function npcChatterTick(db, io) {
    _chatterTick++;
    // Run every ~15 seconds (called every 2s, so every 7-8 ticks)
    if (_chatterTick % 7 !== 0) return;

    // Gather maps with both players and 2+ NPCs
    const maps = new Set(Object.values(state.onlinePlayers).map(p => p.mapId));
    for (const mapId of maps) {
        const npcsHere = getNpcsForMap(mapId).filter(n => n.moveType !== 'STATIONARY' || true);
        if (npcsHere.length < 2) continue;

        // Pick two NPCs that are within 8 tiles of each other
        let npcA, npcB;
        outer: for (const a of npcsHere) {
            for (const b of npcsHere) {
                if (a.id === b.id) continue;
                if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 8) {
                    npcA = a; npcB = b; break outer;
                }
            }
        }
        if (!npcA) continue;

        // Pick a random chatter line and personalise it
        const pool  = getChatterLines();
        const lines = pool[Math.floor(Math.random() * pool.length)];
        const fill  = s => s.replace('{a}', npcA.name).replace('{b}', npcB.name);

        // Send to players within 6 tiles of either NPC
        const sockets = await io.in('map_' + mapId).fetchSockets().catch(() => []);
        for (const s of sockets) {
            const p = state.onlinePlayers[s.id];
            if (!p) continue;
            const nearA = Math.abs(p.x - npcA.x) + Math.abs(p.y - npcA.y) <= 6;
            const nearB = Math.abs(p.x - npcB.x) + Math.abs(p.y - npcB.y) <= 6;
            if (!nearA && !nearB) continue;

            // Send each part of the exchange sequentially with delay
            for (let i = 0; i < lines.length; i += 2) {
                const speaker = fill(lines[i]);
                const text    = fill(lines[i + 1] || '');
                if (!text) continue;
                setTimeout(() => {
                    s.emit('npc_chatter', { speaker, text });
                }, i * 1800); // stagger by 1.8s per line
            }
        }
    }
}

// =============================================================
// EXPORT
// =============================================================
module.exports = {
    // Memory + rumor helpers
    _upsertMemory,
    _addRumor,
    _deriveTitle,

    // Faction helpers
    _getFactionRep,
    _updateFactionRep,
    _getNpcFaction,

    // Crowd + environmental reactions
    _triggerCrowdReaction,
    _triggerEnvironmentalReaction,

    // NPC needs
    NEED_TEMPLATES,
    npcNeedsTick,

    // NPC live state + movement
    npcState,
    loadMapNpcs,
    getNpcsForMap,
    npcMoveTick,

    // Companion helpers
    loadCompanions,
    getActiveCompanions,
    spawnCompanionsAtPlayer,

    // Chatter + rumors
    CHATTER_POOL,
    getChatterLines,
    rumorSpreadTick,
    npcChatterTick,
};
