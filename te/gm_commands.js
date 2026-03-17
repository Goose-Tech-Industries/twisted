// =================================================================
// GM COMMANDS  v1.0
// =================================================================
// Handles all /command parsing for GMs, Mods, and Admins in-game.
//
// TEACHING: This module is called from the chat_send socket handler
// in server.js. It receives the player object, the raw command text,
// and references to the live server state (onlinePlayers, npcState,
// worldFlags, io, db). It returns true if it handled the command
// (so server.js knows not to broadcast it as chat), false otherwise.
//
// ROLES (in order of power):
//   OWNER > ADMIN > GM > MOD > STAFF > PLAYER
//
// Command access levels:
//   MOD+  : /tp /goto /tphere /heal /npcmood /weather /help
//   GM+   : /givegold /givexp /spawnnpc /setflag /killnpc
//   ADMIN+: /setlevel /kick
// =================================================================

'use strict';

// ── Role helpers ──────────────────────────────────────────────────
const ROLE_RANK = { OWNER: 5, ADMIN: 4, GM: 3, MOD: 2, STAFF: 1, PLAYER: 0 };

function rank(role) {
    return ROLE_RANK[(role || '').toUpperCase()] || 0;
}
function isMod(role)   { return rank(role) >= 2; }
function isGM(role)    { return rank(role) >= 3; }
function isAdmin(role) { return rank(role) >= 4; }

// ── System message helpers ────────────────────────────────────────
function sysTo(socket, text, color = '#8b949e') {
    socket.emit('chat_msg', {
        channel: 'system',
        from:    '⚙️ GM',
        text,
        color,
        ts: Date.now()
    });
}
function sysOk(socket, text)  { sysTo(socket, text, '#3fb950'); }
function sysErr(socket, text) { sysTo(socket, text, '#f85149'); }

// Send a "server announcement" style message to a specific socket
function announce(socket, text) {
    socket.emit('chat_msg', {
        channel: 'announce',
        from:    '⚙️ GM',
        text,
        ts: Date.now()
    });
}

// ── Find player by name (case-insensitive) ────────────────────────
function findPlayer(name, onlinePlayers) {
    const lower = name.toLowerCase();
    const entry = Object.entries(onlinePlayers).find(
        ([, p]) => p.name.toLowerCase() === lower
    );
    return entry ? { socketId: entry[0], player: entry[1] } : null;
}

// ── Teleport a player's socket to a new map+position ─────────────
// TEACHING: We can't call the teleport socket handler directly —
// that's bound to a specific socket instance inside a closure.
// Instead we emit 'gm_teleport' back to the target socket, and the
// client handles it exactly like a normal teleport event.
// The server-side onlinePlayers and DB are updated here first.
async function teleportPlayer(io, db, targetSocket, targetPlayer, mapId, x, y) {
    const newMapId = parseInt(mapId, 10);

    // Fetch map so we can use its spawn if no coords given
    const [mapRows] = await db.query('SELECT * FROM game_maps WHERE id=?', [newMapId]);
    if (!mapRows.length) return false;
    const mapData = mapRows[0];

    const spawnX = (x !== undefined && x !== null) ? parseInt(x, 10) : (mapData.spawn_x || Math.floor(mapData.width  / 2));
    const spawnY = (y !== undefined && y !== null) ? parseInt(y, 10) : (mapData.spawn_y || Math.floor(mapData.height / 2));

    const oldMapId = targetPlayer.mapId;

    // Update DB
    await db.query('UPDATE characters SET map_id=?, x=?, y=? WHERE id=?',
        [newMapId, spawnX, spawnY, targetPlayer.charId]);

    // Update live state
    targetPlayer.mapId = newMapId;
    targetPlayer.x     = spawnX;
    targetPlayer.y     = spawnY;

    // Move socket rooms
    targetSocket.to('map_' + oldMapId).emit('player_left', targetPlayer.charId);
    targetSocket.leave('map_' + oldMapId);
    targetSocket.join('map_' + newMapId);

    // TEACHING: We send a 'teleport' event (same as the normal teleport handler
    // sends). The client already knows how to handle this — it clears the old
    // map and loads the new one. We don't need to invent a new event type.
    const tiles = JSON.parse(mapData.tiles_json || '[]');
    targetSocket.emit('teleport', {
        mapId:   newMapId,
        mapName: mapData.name,
        x:       spawnX,
        y:       spawnY,
        width:   mapData.width,
        height:  mapData.height,
        tiles,
        events:  JSON.parse(mapData.collisions_json || '[]'),
        objects: JSON.parse(mapData.objects_json    || '[]'),
    });

    // Tell players on new map this player arrived
    const others = Object.values(io.sockets.sockets)
        .map(s => ({ s, p: global._getOnlinePlayers?.()[s.id] }))
        .filter(({ p }) => p && p.mapId === newMapId && p.charId !== targetPlayer.charId);

    targetSocket.to('map_' + newMapId).emit('player_joined', {
        id:     targetPlayer.charId,
        name:   targetPlayer.name,
        x:      spawnX,
        y:      spawnY,
        level:  targetPlayer.level,
        mapId:  newMapId,
    });

    return true;
}

// ── MAIN ENTRY POINT ──────────────────────────────────────────────
// Returns true if command was handled, false if unknown / not a command.
// Called from server.js chat_send handler BEFORE the channel switch.
async function handle(socket, p, text, { io, db, onlinePlayers, npcState, worldFlags }) {
    if (!text.startsWith('/')) return false;

    // Split: "/givegold 500 Goose" → ['givegold', '500', 'Goose']
    const parts = text.slice(1).trim().split(/\s+/);
    const cmd   = parts[0].toLowerCase();
    const args  = parts.slice(1);

    // Must be at least MOD to use any command
    if (!isMod(p.role)) {
        sysErr(socket, `Unknown command: /${cmd}`);
        return true; // handled — don't broadcast
    }

    // ── /help ─────────────────────────────────────────────────────
    if (cmd === 'help') {
        const lines = [
            '<b style="color:#bb86fc">── GM Commands ──</b>',
            '<b>Movement</b>',
            '  /tp &lt;mapId&gt; [x] [y] — teleport yourself',
            '  /goto &lt;player&gt; — jump to a player',
            '  /tphere &lt;player&gt; — pull a player to you',
            '<b>World</b>',
            '  /setflag &lt;key&gt; &lt;value&gt; — set a world flag',
            '  /npcmood &lt;name&gt; &lt;mood&gt; — change NPC mood',
            '  /killnpc &lt;name&gt; — kill an NPC',
            '  /weather &lt;shake|flash|fade&gt; — map screen effect',
            '  /spawnnpc &lt;id&gt; [x] [y] — temp spawn NPC',
            '<b>Rewards</b>',
            '  /givegold &lt;amount&gt; [player] — give gold',
            '  /givexp &lt;amount&gt; [player] — give XP',
            '  /heal [player] — fully restore HP & MP',
            '<b>Admin only</b>',
            '  /setlevel &lt;level&gt; [player] — set level',
            '  /kick &lt;player&gt; — disconnect a player',
        ].join('\n');
        sysTo(socket, lines, '#8b949e');
        return true;
    }

    // ── /tp <mapId> [x] [y] ──────────────────────────────────────
    if (cmd === 'tp') {
        if (!args[0]) { sysErr(socket, 'Usage: /tp <mapId> [x] [y]'); return true; }
        const mapId = parseInt(args[0], 10);
        if (isNaN(mapId)) { sysErr(socket, 'mapId must be a number.'); return true; }
        try {
            const ok = await teleportPlayer(io, db, socket, p, mapId, args[1], args[2]);
            if (ok) sysOk(socket, `Teleported to map ${mapId}.`);
            else    sysErr(socket, `Map ${mapId} not found.`);
        } catch (e) { sysErr(socket, 'Teleport failed: ' + e.message); }
        return true;
    }

    // ── /goto <playerName> ───────────────────────────────────────
    if (cmd === 'goto') {
        if (!args[0]) { sysErr(socket, 'Usage: /goto <player>'); return true; }
        const target = findPlayer(args[0], onlinePlayers);
        if (!target) { sysErr(socket, `Player "${args[0]}" not found online.`); return true; }
        try {
            const ok = await teleportPlayer(io, db, socket, p, target.player.mapId, target.player.x, target.player.y);
            if (ok) sysOk(socket, `Jumped to ${target.player.name}.`);
        } catch (e) { sysErr(socket, 'Goto failed: ' + e.message); }
        return true;
    }

    // ── /tphere <playerName> ─────────────────────────────────────
    if (cmd === 'tphere') {
        if (!args[0]) { sysErr(socket, 'Usage: /tphere <player>'); return true; }
        const target = findPlayer(args[0], onlinePlayers);
        if (!target) { sysErr(socket, `Player "${args[0]}" not found online.`); return true; }
        if (target.player.charId === p.charId) { sysErr(socket, "Can't pull yourself."); return true; }
        const targetSock = io.sockets.sockets.get(target.socketId);
        if (!targetSock) { sysErr(socket, 'Socket not found.'); return true; }
        try {
            const ok = await teleportPlayer(io, db, targetSock, target.player, p.mapId, p.x, p.y);
            if (ok) {
                sysOk(socket, `Pulled ${target.player.name} to your location.`);
                announce(targetSock, `A GM has teleported you to ${p.name}'s location.`);
            }
        } catch (e) { sysErr(socket, 'Tphere failed: ' + e.message); }
        return true;
    }

    // ── /heal [playerName] ───────────────────────────────────────
    if (cmd === 'heal') {
        let targetCharId = p.charId;
        let targetSocket = socket;
        let targetName   = p.name;

        if (args[0]) {
            const found = findPlayer(args[0], onlinePlayers);
            if (!found) { sysErr(socket, `Player "${args[0]}" not found.`); return true; }
            targetCharId = found.player.charId;
            targetSocket = io.sockets.sockets.get(found.socketId) || socket;
            targetName   = found.player.name;
        }

        try {
            // Get current max stats
            const [rows] = await db.query('SELECT max_hp, max_mp FROM characters WHERE id=?', [targetCharId]);
            if (!rows.length) { sysErr(socket, 'Character not found in DB.'); return true; }
            const { max_hp, max_mp } = rows[0];

            await db.query('UPDATE characters SET current_hp=?, current_mp=? WHERE id=?',
                [max_hp, max_mp, targetCharId]);

            // Tell client to refresh stats — emit get_char_data response
            targetSocket.emit('gm_heal', { hp: max_hp, maxHp: max_hp, mp: max_mp, maxMp: max_mp });
            sysOk(socket, `Fully healed ${targetName}. (${max_hp} HP / ${max_mp} MP)`);
            if (targetCharId !== p.charId) announce(targetSocket, 'A GM has fully restored your HP & MP! ✨');
        } catch (e) { sysErr(socket, 'Heal failed: ' + e.message); }
        return true;
    }

    // ── /givegold <amount> [playerName] ─────────────────────────
    if (cmd === 'givegold') {
        if (!isGM(p.role)) { sysErr(socket, 'GM+ required.'); return true; }
        const amount = parseInt(args[0], 10);
        if (!args[0] || isNaN(amount) || amount <= 0) { sysErr(socket, 'Usage: /givegold <amount> [player]'); return true; }

        let targetUserId = null;
        let targetCharId = p.charId;
        let targetName   = p.name;
        let targetSocket = socket;

        if (args[1]) {
            const found = findPlayer(args[1], onlinePlayers);
            if (!found) { sysErr(socket, `Player "${args[1]}" not found.`); return true; }
            targetCharId = found.player.charId;
            targetUserId = found.player.userId;
            targetName   = found.player.name;
            targetSocket = io.sockets.sockets.get(found.socketId) || socket;
        } else {
            targetUserId = p.userId;
        }

        try {
            await db.query(
                'UPDATE users SET currency = currency + ? WHERE id = ?',
                [amount, targetUserId]
            );
            // Push refresh to recipient
            targetSocket.emit('gm_gold_update', { delta: amount });
            sysOk(socket, `Gave ${amount.toLocaleString()} gold to ${targetName}.`);
            if (targetCharId !== p.charId) announce(targetSocket, `A GM has given you ${amount.toLocaleString()} 💰 gold!`);
        } catch (e) { sysErr(socket, 'Give gold failed: ' + e.message); }
        return true;
    }

    // ── /givexp <amount> [playerName] ────────────────────────────
    if (cmd === 'givexp') {
        if (!isGM(p.role)) { sysErr(socket, 'GM+ required.'); return true; }
        const amount = parseInt(args[0], 10);
        if (!args[0] || isNaN(amount) || amount <= 0) { sysErr(socket, 'Usage: /givexp <amount> [player]'); return true; }

        let targetCharId = p.charId;
        let targetName   = p.name;
        let targetSocket = socket;

        if (args[1]) {
            const found = findPlayer(args[1], onlinePlayers);
            if (!found) { sysErr(socket, `Player "${args[1]}" not found.`); return true; }
            targetCharId = found.player.charId;
            targetName   = found.player.name;
            targetSocket = io.sockets.sockets.get(found.socketId) || socket;
        }

        try {
            // Read current state_json
            const [rows] = await db.query('SELECT state_json FROM characters WHERE id=?', [targetCharId]);
            const state = rows.length ? JSON.parse(rows[0].state_json || '{}') : {};
            if (!state.progression) state.progression = {};
            state.progression.xp = (state.progression.xp || 0) + amount;

            await db.query('UPDATE characters SET state_json=? WHERE id=?',
                [JSON.stringify(state), targetCharId]);

            // Trigger level-up check via BattleManager
            const BattleManager = require('./battle_engine');
            const leveled = await BattleManager.checkLevelUp?.(db, targetCharId)
                .catch(() => null);

            targetSocket.emit('gm_xp_update', { delta: amount, leveled: !!leveled });
            sysOk(socket, `Gave ${amount.toLocaleString()} XP to ${targetName}.${leveled ? ' They leveled up!' : ''}`);
            if (targetCharId !== p.charId) {
                announce(targetSocket, `A GM has given you ${amount.toLocaleString()} ⭐ XP!`);
            }
        } catch (e) { sysErr(socket, 'Give XP failed: ' + e.message); }
        return true;
    }

    // ── /setflag <key> <value> ───────────────────────────────────
    if (cmd === 'setflag') {
        if (!isGM(p.role)) { sysErr(socket, 'GM+ required.'); return true; }
        if (!args[0] || args[1] === undefined) { sysErr(socket, 'Usage: /setflag <key> <value>'); return true; }
        const key = args[0];
        let value = args.slice(1).join(' ');
        // Coerce type
        if (value === 'true')  value = true;
        else if (value === 'false') value = false;
        else if (!isNaN(value) && value !== '') value = Number(value);

        worldFlags[key] = value;
        try {
            await db.query(
                'INSERT INTO world_flags (flag_key, flag_value) VALUES (?,?) ON DUPLICATE KEY UPDATE flag_value=?',
                [key, String(value), String(value)]
            );
            sysOk(socket, `World flag set: ${key} = ${value}`);
            // Broadcast to all GMs
            io.to('admin_chat').emit('chat_msg', {
                channel: 'system', from: '⚙️ GM', text: `[${p.name}] /setflag ${key} = ${value}`, ts: Date.now()
            });
        } catch (e) { sysErr(socket, 'setflag failed: ' + e.message); }
        return true;
    }

    // ── /npcmood <name> <mood> ───────────────────────────────────
    if (cmd === 'npcmood') {
        const MOODS = ['happy','fearful','angry','grieving','excited'];
        if (!args[0] || !args[1]) { sysErr(socket, `Usage: /npcmood <name> <${MOODS.join('|')}|clear>`); return true; }
        const npcName = args[0];
        const mood    = args[1].toLowerCase() === 'clear' ? null : args[1].toLowerCase();
        if (mood && !MOODS.includes(mood)) { sysErr(socket, `Unknown mood. Pick: ${MOODS.join(', ')} or clear`); return true; }

        try {
            if (global.setNpcMood) {
                global.setNpcMood(npcName, mood);
                await db.query('UPDATE game_npcs SET mood=? WHERE name=?', [mood, npcName]);
                sysOk(socket, `${npcName}'s mood → ${mood || 'neutral'}.`);
            } else {
                sysErr(socket, 'NPC system not ready.');
            }
        } catch (e) { sysErr(socket, 'npcmood failed: ' + e.message); }
        return true;
    }

    // ── /killnpc <name> ──────────────────────────────────────────
    if (cmd === 'killnpc') {
        if (!isGM(p.role)) { sysErr(socket, 'GM+ required.'); return true; }
        if (!args[0]) { sysErr(socket, 'Usage: /killnpc <npcName>'); return true; }
        const npcName = args.join(' ');
        try {
            if (global.killNpc) {
                await global.killNpc(db, npcName, `Slain by GM ${p.name}`);
                sysOk(socket, `${npcName} has been killed.`);
                io.to('map_' + p.mapId).emit('chat_msg', {
                    channel: 'local', from: 'System',
                    text: `💀 ${npcName} has fallen.`, ts: Date.now()
                });
            } else {
                sysErr(socket, 'NPC system not ready.');
            }
        } catch (e) { sysErr(socket, 'killnpc failed: ' + e.message); }
        return true;
    }

    // ── /weather <effect> ────────────────────────────────────────
    // Sends a screen effect to everyone on the GM's current map
    if (cmd === 'weather') {
        const EFFECTS = ['shake','flash','fade','rain','snow'];
        const effect  = args[0]?.toLowerCase();
        if (!effect) { sysErr(socket, `Usage: /weather <${EFFECTS.join('|')}>`); return true; }
        io.to('map_' + p.mapId).emit('screen_effect', { effect, duration: parseInt(args[1],10) || 2000 });
        sysOk(socket, `Screen effect "${effect}" sent to map ${p.mapId}.`);
        return true;
    }

    // ── /spawnnpc <id> [x] [y] ───────────────────────────────────
    // Creates a TEMPORARY NPC instance on the GM's current map.
    // It disappears on server restart (not saved to DB map_id).
    // TEACHING: We add an entry to npcState directly, exactly as
    // getMapData does when loading a map, then broadcast npc_list.
    if (cmd === 'spawnnpc') {
        if (!isGM(p.role)) { sysErr(socket, 'GM+ required.'); return true; }
        if (!args[0]) { sysErr(socket, 'Usage: /spawnnpc <npcId> [x] [y]'); return true; }
        const npcId = parseInt(args[0], 10);
        if (isNaN(npcId)) { sysErr(socket, 'npcId must be a number.'); return true; }

        try {
            const [rows] = await db.query('SELECT * FROM game_npcs WHERE id=?', [npcId]);
            if (!rows.length) { sysErr(socket, `NPC id ${npcId} not found.`); return true; }
            const row    = rows[0];
            const spawnX = parseInt(args[1], 10) || p.x;
            const spawnY = parseInt(args[2], 10) || p.y;

            // Create a temp copy in npcState with a unique key so it
            // doesn't collide with the NPC's real home-map instance
            const tempKey = `gm_${Date.now()}_${npcId}`;
            npcState[tempKey] = {
                id:           tempKey,  // string key — won't conflict with real DB ids
                _realId:      npcId,
                _temporary:   true,
                name:         row.name + ' (temp)',
                icon:         row.icon || '👤',
                mapId:        p.mapId,
                x:            spawnX,
                y:            spawnY,
                homeX:        spawnX,
                homeY:        spawnY,
                wanderRadius: 2,
                moveType:     'WANDER',
                persona:      row.persona || '',
                isEnemy:      false,
                questOffers:  [],
                scheduleSlots:[],
                shopId:       null,
                mood:         null,
                _need:        null,
                patrolPath:   null,
                _patrolIdx:   0,
                _patrolPause: 0,
            };

            // Broadcast updated NPC list to everyone on this map
            const npcsHere = Object.values(npcState).filter(n => n.mapId === p.mapId);
            io.to('map_' + p.mapId).emit('npc_list', npcsHere);

            sysOk(socket, `Spawned ${row.name} (temp) at (${spawnX}, ${spawnY}) on map ${p.mapId}.`);
            io.to('admin_chat').emit('chat_msg', {
                channel: 'system', from: '⚙️ GM',
                text: `[${p.name}] spawned NPC ${row.name} on map ${p.mapId}`, ts: Date.now()
            });
        } catch (e) { sysErr(socket, 'spawnnpc failed: ' + e.message); }
        return true;
    }

    // ── /setlevel <level> [playerName] ── ADMIN only ─────────────
    if (cmd === 'setlevel') {
        if (!isAdmin(p.role)) { sysErr(socket, 'Admin only.'); return true; }
        const level = parseInt(args[0], 10);
        if (!args[0] || isNaN(level) || level < 1 || level > 999) {
            sysErr(socket, 'Usage: /setlevel <1-999> [player]');
            return true;
        }

        let targetCharId = p.charId;
        let targetName   = p.name;
        let targetSocket = socket;

        if (args[1]) {
            const found = findPlayer(args[1], onlinePlayers);
            if (!found) { sysErr(socket, `Player "${args[1]}" not found.`); return true; }
            targetCharId = found.player.charId;
            targetName   = found.player.name;
            targetSocket = io.sockets.sockets.get(found.socketId) || socket;
        }

        try {
            await db.query('UPDATE characters SET level=? WHERE id=?', [level, targetCharId]);
            // Update live state too
            const targetP = Object.values(onlinePlayers).find(pl => pl.charId === targetCharId);
            if (targetP) targetP.level = level;

            targetSocket.emit('gm_level_set', { level });
            sysOk(socket, `Set ${targetName}'s level to ${level}.`);
            if (targetCharId !== p.charId) {
                announce(targetSocket, `An admin has set your level to ${level}! 🎉`);
            }
        } catch (e) { sysErr(socket, 'setlevel failed: ' + e.message); }
        return true;
    }

    // ── /kick <playerName> ── ADMIN only ─────────────────────────
    if (cmd === 'kick') {
        if (!isAdmin(p.role)) { sysErr(socket, 'Admin only.'); return true; }
        if (!args[0]) { sysErr(socket, 'Usage: /kick <player>'); return true; }

        const target = findPlayer(args[0], onlinePlayers);
        if (!target) { sysErr(socket, `Player "${args[0]}" not found.`); return true; }
        if (target.player.charId === p.charId) { sysErr(socket, "Can't kick yourself."); return true; }

        const targetSock = io.sockets.sockets.get(target.socketId);
        if (targetSock) {
            announce(targetSock, 'You have been disconnected by a GM.');
            setTimeout(() => targetSock.disconnect(true), 500);
        }
        sysOk(socket, `Kicked ${target.player.name}.`);
        io.to('admin_chat').emit('chat_msg', {
            channel: 'system', from: '⚙️ GM',
            text: `[${p.name}] kicked ${target.player.name}`, ts: Date.now()
        });
        return true;
    }

    // Unknown command
    sysErr(socket, `Unknown command: /${cmd}. Type /help for the list.`);
    return true;
}

module.exports = { handle, isMod, isGM, isAdmin };
