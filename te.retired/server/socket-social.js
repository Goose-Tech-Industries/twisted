// =================================================================
// server/socket-social.js — Social, community & world socket handlers
// =================================================================
// TEACHING: This is the second-largest socket module. It covers every
// real-time feature that ISN'T movement/core-game or battle:
//   • Chat (global, local, party, guild, DM, announce, admin)
//   • Emotes & presence (typing indicators, away status)
//   • Social interactions (greet, inspect, profile, guestbook)
//   • Guilds (invite/accept/decline/leave/kick/promote/demote)
//   • Trading (request/accept/decline/add/remove/lock/confirm/cancel)
//   • Parties (invite/accept/decline/leave/kick)
//   • Staff messenger panel
//   • Minigames (dice, arena betting, fishing, card game, gathering)
//   • Bank, mounts, housing, creature capture, bounties
//   • Cutscenes, NPC relationships, interactive objects
//   • Collaborative map editor
//
// All handlers follow the same pattern:
//   1. Read player from state.onlinePlayers[socket.id]
//   2. Validate input
//   3. Hit DB if needed
//   4. Emit result back to sender and/or broadcast to room
//
// Shared mutable state (onlinePlayers, activeParties, activeTrades, etc.)
// lives in server/state.js. We import it once and reference through `state.*`.
// =================================================================

const state = require('./state');
const gmCommands = require('../gm_commands');
const BattleManager = require('../battle_engine');
const ai = require('./ai-features');

module.exports = function registerSocialHandlers(socket, ctx) {
    const { db, io } = ctx;

    // =============================================================
    // 1. CHAT — global, local, party, guild, DM, announce, admin
    // =============================================================
    socket.on('chat_send', async ({ channel, text, targetCharId, targetName }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;

            // Sanitize: cap at 300 chars, strip HTML
            const msg = String(text || '').trim().slice(0, 300).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            if (!msg) return;

            // AI chat moderation (non-blocking — doesn't delay the message for safe messages)
            ai.moderateChat(db, { message: msg, playerName: p.name }).then(result => {
                if (!result.safe) {
                    socket.emit('notification', { type: 'warning', message: 'Your message was flagged for review.' });
                    // Log for staff review
                    db.query('INSERT INTO auto_mod_log (character_id, message, flagged_at) VALUES (?,?,NOW())',
                        [p.charId, msg]).catch(() => {});
                }
            }).catch(() => {});

            // ── GM COMMANDS: intercept /slash commands before chat routing ──
            // TEACHING: We check for '/' prefix on the raw text (before HTML-escaping).
            // The command module handles auth, execution, and sends its own
            // system messages. If it returns true the message is consumed here
            // and never reaches the channel switch below.
            if (String(text || '').trim().startsWith('/')) {
                const handled = await gmCommands.handle(socket, p, String(text).trim(), {
                    io, db, onlinePlayers: state.onlinePlayers, npcState: ctx.npcState, worldFlags: state.worldFlags
                });
                if (handled) return;
            }

            const payload = {
                channel,
                from: p.name,
                fromCharId: p.charId,
                role: p.role || 'PLAYER',
                chatColor: p.chatColor || null,
                text: msg,
                ts: Date.now()
            };

            const sysMsg = (txt) => socket.emit('chat_msg', {
                channel: 'system', from: 'System', text: txt, ts: Date.now()
            });

            switch (channel) {

                // --- GLOBAL: everyone sees it ---
                case 'global':
                    io.emit('chat_msg', payload);
                    break;

                // --- LOCAL/ZONE: only players on same map ---
                case 'local':
                    io.to('map_' + p.mapId).emit('chat_msg', payload);
                    break;

                // --- PARTY: use party room if player is in one ---
                case 'party': {
                    const pPartyId = state.charPartyMap[p.charId];
                    if (!pPartyId) { sysMsg('You are not in a party.'); return; }
                    io.to('party_' + pPartyId).emit('chat_msg', payload);
                    break;
                }

                // --- GUILD: route to guild room if player is in one ---
                case 'guild': {
                    const myGuild = state.charGuildMap[p.charId];
                    if (!myGuild) { sysMsg('You are not in a guild.'); return; }
                    io.to('guild_' + myGuild.guildId).emit('chat_msg', payload);
                    break;
                }

                // --- DM: direct message to one player ---
                case 'dm': {
                    // Resolve target: prefer charId, fall back to name lookup
                    let targetEntry;
                    if (targetCharId) {
                        targetEntry = Object.entries(state.onlinePlayers)
                            .find(([, pl]) => pl.charId === parseInt(targetCharId, 10));
                    } else if (targetName) {
                        targetEntry = Object.entries(state.onlinePlayers)
                            .find(([, pl]) => pl.name.toLowerCase() === String(targetName).trim().toLowerCase());
                    }
                    if (!targetCharId && !targetName) { sysMsg('No target selected for DM.'); return; }
                    if (!targetEntry) { sysMsg('Player not found or offline.'); return; }
                    const targetSock = io.sockets.sockets.get(targetEntry[0]);
                    const dmPayload = { ...payload, targetName: targetEntry[1].name };
                    socket.emit('chat_msg', dmPayload);        // sender sees it
                    if (targetSock) targetSock.emit('chat_msg', dmPayload); // receiver gets it
                    break;
                }

                // --- ANNOUNCE: staff sends, everyone receives ---
                case 'announce':
                    if (!await state.isStaff(db, p.userId)) { sysMsg('Staff only.'); return; }
                    io.emit('chat_msg', { ...payload, channel: 'announce' });
                    break;

                // --- ADMIN: staff only, hidden from regular players ---
                case 'admin':
                    if (!await state.isStaff(db, p.userId)) { sysMsg('Staff only.'); return; }
                    // Only sockets in admin_chat room receive this
                    io.to('admin_chat').emit('chat_msg', payload);
                    break;

                default:
                    sysMsg('Unknown channel: ' + channel);
            }
        } catch (err) { console.error('Chat error:', err); }
    });

    // --- EMOTES ---
    // TEACHING: An emote is a short action message that shows in the
    // local zone chat and as a floating bubble above the player's head.
    // Format: *PlayerName waves cheerfully*
    // The client can call emote via a slash command (/wave, /bow etc.)
    // or an emote picker button. The server just rebroadcasts to the map.
    socket.on('title_changed', async ({ charId, title }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p || p.charId !== charId) return;
            io.to('map_' + p.mapId).emit('player_title_changed', { charId, title: title || null });
        } catch(e) { console.error('[title_changed]', e.message); }
    });

    // ── PRESENCE / AWAY STATUS ──────────────────────────────────
    // TEACHING: The client emits 'set_presence' when the player changes
    // their status. We update the in-memory record immediately (so nearby
    // players see it instantly) then broadcast to the map.
    // The HTTP POST /set-presence persists it to DB separately.
    socket.on('set_presence', ({ status, awayMessage }) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        const VALID = ['online','away','busy','lfp','invisible'];
        if (!VALID.includes(status)) return;

        p.presence    = status;
        p.awayMessage = (awayMessage || '').slice(0, 255) || null;

        // Sync LFP listing with presence status
        if (status !== 'lfp') {
            // Remove from LFP board if they were listed
            db.query('DELETE FROM lfp_listings WHERE character_id=?', [p.charId]).catch(()=>{});
        }
        // Note: listing is created via POST /api/lfp/list from the LFP board UI
        // (so the player can fill in role/note first)

        // Broadcast to everyone on the same map (excluding self — they already know)
        socket.to('map_' + p.mapId).emit('player_presence_changed', {
            charId:      p.charId,
            presence:    status,
            awayMessage: p.awayMessage,
        });
    });

    // TYPING INDICATOR — relay to the DM target if they're online
    // TEACHING: The client sends 'typing_dm' with the target charId.
    // We find the target's socket and push 'typing_dm_indicator' to them.
    // The server never stores this — it's purely a real-time relay.
    socket.on('typing_dm', ({ targetCharId, isTyping }) => {
        const sender = state.onlinePlayers[socket.id];
        if (!sender) return;
        for (const [sid, p] of Object.entries(state.onlinePlayers)) {
            if (p.charId === targetCharId) {
                io.to(sid).emit('typing_dm_indicator', {
                    fromCharId: sender.charId,
                    fromName:   sender.name,
                    isTyping:   !!isTyping,
                });
                break;
            }
        }
    });

    socket.on('emote', ({ emoteKey }) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        const EMOTES = {
            wave:    'waves cheerfully',
            bow:     'bows respectfully',
            cheer:   'cheers!',
            laugh:   'bursts out laughing',
            cry:     'weeps dramatically',
            think:   'strokes their chin thoughtfully',
            shrug:   'shrugs',
            dance:   'breaks into a wild dance',
            salute:  'stands at attention and salutes',
            kneel:   'kneels solemnly',
            point:   'points dramatically into the distance',
            sleep:   'has fallen asleep on their feet',
            angry:   'shakes their fist at the sky',
            clap:    'claps enthusiastically',
            sit:     'sits down and rests',
        };
        const action = EMOTES[emoteKey];
        if (!action) return;
        const text = `*${p.name} ${action}*`;
        // Broadcast to whole map as a local message with a special emote flag
        io.to('map_' + p.mapId).emit('chat_msg', {
            channel: 'local',
            from: p.name,
            fromCharId: p.charId,
            text,
            isEmote: true,
            ts: Date.now()
        });
        // Also show as a floating bubble above the player
        io.to('map_' + p.mapId).emit('emote_bubble', {
            charId: p.charId,
            text,
        });
    });

    // --- FRIEND REQUEST PUSH NOTIFICATION ---
    // When /api/party/friends/request is called via REST, the HTTP handler
    // can't reach sockets. So clients emit this event AFTER the REST call
    // succeeds, letting the server push a notification to the target.
    socket.on('friend_request_sent', ({ targetCharId, senderName }) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        // Only trust the senderName from our server-side record
        const actualName = p.name;
        for (const [sid, pl] of Object.entries(state.onlinePlayers)) {
            if (pl.charId === parseInt(targetCharId)) {
                io.to(sid).emit('friend_request_incoming', {
                    fromCharId: p.charId,
                    fromName:   actualName,
                });
            }
        }
    });

    // --- GREET SYSTEM (Planet Mado inspired) ---
    // When enable_greet_system is ON, player names are hidden until greeted.
    // ONE-WAY: When you greet someone, YOUR name is revealed to THEM.
    // They still appear as "Unknown" to you until they greet you back.
    // This creates a social handshake — both players must greet to fully know each other.
    socket.on('greet_player', async ({ targetCharId }) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        const tid = parseInt(targetCharId);
        if (!tid || tid === p.charId) return;

        try {
            // One-way: the TARGET now knows the greeter's name.
            // We add the greeter's charId to the TARGET's greeted list.
            const [targetRows] = await db.query('SELECT state_json FROM characters WHERE id=?', [tid]);
            const tState = targetRows.length ? (typeof targetRows[0].state_json === 'string' ? JSON.parse(targetRows[0].state_json || '{}') : (targetRows[0].state_json || {})) : {};
            if (!tState.greeted) tState.greeted = [];
            if (!tState.greeted.includes(p.charId)) {
                tState.greeted.push(p.charId);
                await db.query('UPDATE characters SET state_json=? WHERE id=?', [JSON.stringify(tState), tid]);
            }

            // Also track who the greeter has greeted (for UI: show "Greeted" badge, disable re-greet)
            const [charRows] = await db.query('SELECT state_json FROM characters WHERE id=?', [p.charId]);
            const myState = charRows.length ? (typeof charRows[0].state_json === 'string' ? JSON.parse(charRows[0].state_json || '{}') : (charRows[0].state_json || {})) : {};
            if (!myState.hasGreeted) myState.hasGreeted = [];
            if (!myState.hasGreeted.includes(tid)) {
                myState.hasGreeted.push(tid);
                await db.query('UPDATE characters SET state_json=? WHERE id=?', [JSON.stringify(myState), p.charId]);
            }

            // Tell the greeter their greet was sent (they still can't see target's name)
            socket.emit('greet_ack', { targetCharId: tid, sent: true });

            // Tell the target: "Someone greeted you!" — their name is now revealed to the target
            for (const [sid, pl] of Object.entries(state.onlinePlayers)) {
                if (pl.charId === tid) {
                    io.to(sid).emit('greet_received', { fromCharId: p.charId, fromName: p.name });
                }
            }
        } catch (e) {
            console.error('[Greet] Error:', e.message);
        }
    });

    // --- PLAYER INSPECT ---
    // Returns public info about a character for the inspect panel
    socket.on('inspect_player', async ({ targetCharId }) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        const tid = parseInt(targetCharId);
        if (!tid) return;

        try {
            const [rows] = await db.query(
                `SELECT c.id, c.name, c.level, c.class_id, c.race_id, c.title,
                        c.profile_bio,
                        cl.name AS class_name, cl.icon AS class_icon,
                        r.name AS race_name,
                        gm.guild_id, g.name AS guild_name, gm.rank AS guild_rank
                 FROM characters c
                 LEFT JOIN game_classes cl ON cl.id = c.class_id
                 LEFT JOIN game_races r ON r.id = c.race_id
                 LEFT JOIN guild_members gm ON gm.character_id = c.id
                 LEFT JOIN guilds g ON g.id = gm.guild_id
                 WHERE c.id=? LIMIT 1`, [tid]);
            if (!rows.length) return socket.emit('inspect_result', { success: false });

            const char = rows[0];
            // Get equipped items
            const [equip] = await db.query(
                `SELECT ce.slot, i.name, i.icon, i.type, i.rarity
                 FROM character_equipment ce
                 JOIN game_items i ON i.id = ce.item_id
                 WHERE ce.character_id=?`, [tid]);

            socket.emit('inspect_result', {
                success: true,
                character: {
                    charId: char.id, name: char.name, level: char.level,
                    className: char.class_name, classIcon: char.class_icon,
                    raceName: char.race_name, title: char.title,
                    description: char.profile_bio || null,
                    guildName: char.guild_name, guildRank: char.guild_rank,
                    equipment: equip || []
                }
            });
        } catch (e) {
            console.error('[Inspect] Error:', e.message);
            socket.emit('inspect_result', { success: false });
        }
    });

    // --- PUBLIC PROFILE VIEW (MySpace-style) ---
    socket.on('view_profile', async ({ targetCharId }) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        const tid = parseInt(targetCharId);
        if (!tid) return;

        try {
            // Increment view count (only if not viewing own profile)
            if (tid !== p.charId) {
                await db.query('UPDATE characters SET profile_views = profile_views + 1 WHERE id=?', [tid]);
            }

            const [rows] = await db.query(
                `SELECT c.id, c.name, c.level, c.equipped_title,
                        c.profile_bio, c.profile_color, c.profile_banner_emoji,
                        c.profile_favorite_quote, c.profile_signature,
                        c.profile_views, c.presence_status,
                        c.profile_music_url, c.profile_background,
                        c.profile_status, c.profile_pinned_achievements,
                        c.show_profile_viewers,
                        c.spotify_track_url, c.spotify_track_name, c.spotify_artist_name,
                        cl.name AS class_name, cl.icon AS class_icon,
                        r.name AS race_name,
                        gm.guild_id, g.name AS guild_name, gm.rank AS guild_rank
                 FROM characters c
                 LEFT JOIN game_classes cl ON cl.id = c.class_id
                 LEFT JOIN game_races r ON r.id = c.race_id
                 LEFT JOIN guild_members gm ON gm.character_id = c.id
                 LEFT JOIN guilds g ON g.id = gm.guild_id
                 WHERE c.id=? LIMIT 1`, [tid]);
            if (!rows.length) return socket.emit('profile_data', { success: false });

            const char = rows[0];

            // Equipment
            const [equip] = await db.query(
                `SELECT ce.slot, i.name, i.icon, i.type, i.rarity
                 FROM character_equipment ce
                 JOIN game_items i ON i.id = ce.item_id
                 WHERE ce.character_id=?`, [tid]);

            // Top 8 Friends
            const [topFriends] = await db.query(
                `SELECT tf.slot, tf.friend_char_id,
                        c2.name, c2.level, c2.equipped_title, c2.profile_color,
                        c2.presence_status, cl2.name AS class_name
                 FROM character_top_friends tf
                 JOIN characters c2 ON c2.id = tf.friend_char_id
                 LEFT JOIN game_classes cl2 ON cl2.id = c2.class_id
                 WHERE tf.character_id=?
                 ORDER BY tf.slot`, [tid]);

            // Guestbook (latest 20)
            const [guestbook] = await db.query(
                `SELECT id, author_char_id, author_name, author_title, author_color,
                        message, message_html, created_at
                 FROM profile_guestbook
                 WHERE profile_char_id=? AND is_deleted=0
                 ORDER BY created_at DESC LIMIT 20`, [tid]);

            socket.emit('profile_data', {
                success: true,
                profile: {
                    charId: char.id, name: char.name, level: char.level,
                    title: char.equipped_title,
                    bio: char.profile_bio, color: char.profile_color,
                    bannerEmoji: char.profile_banner_emoji,
                    quote: char.profile_favorite_quote,
                    signature: char.profile_signature,
                    views: char.show_profile_viewers ? char.profile_views + (tid !== p.charId ? 1 : 0) : null,
                    presence: char.presence_status,
                    musicUrl: char.profile_music_url || null,
                    background: char.profile_background || null,
                    status: char.profile_status || null,
                    pinnedAchievements: (() => { try { return JSON.parse(char.profile_pinned_achievements || '[]'); } catch { return []; } })(),
                    spotify: char.spotify_track_url ? {
                        url: char.spotify_track_url,
                        track: char.spotify_track_name,
                        artist: char.spotify_artist_name
                    } : null,
                    className: char.class_name, classIcon: char.class_icon,
                    raceName: char.race_name,
                    guildName: char.guild_name, guildRank: char.guild_rank,
                    equipment: equip || [],
                    topFriends: topFriends || [],
                    guestbook: guestbook || [],
                    isOwnProfile: tid === p.charId
                }
            });
        } catch (e) {
            console.error('[Profile] Error:', e.message);
            socket.emit('profile_data', { success: false });
        }
    });

    // --- GUESTBOOK POST (via socket for real-time) ---
    socket.on('guestbook_post', async ({ targetCharId, message }) => {
        const p = state.onlinePlayers[socket.id];
        if (!p || !message?.trim()) return;
        const tid = parseInt(targetCharId);
        if (!tid) return;

        try {
            // Rate limit: 1 per char per profile per 24h
            const [recent] = await db.query(
                `SELECT id FROM profile_guestbook
                 WHERE profile_char_id=? AND author_char_id=? AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
                [tid, p.charId]);
            if (recent.length) {
                return socket.emit('guestbook_result', { success: false, message: 'You can only post once per profile every 24 hours.' });
            }

            const text = message.trim().slice(0, 500);
            // Parse BBCode to safe HTML
            let html = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            html = html
                .replace(/\[b\](.*?)\[\/b\]/gis, '<strong>$1</strong>')
                .replace(/\[i\](.*?)\[\/i\]/gis, '<em>$1</em>')
                .replace(/\[u\](.*?)\[\/u\]/gis, '<span style="text-decoration:underline">$1</span>')
                .replace(/\[color=(#[0-9a-fA-F]{3,6})\](.*?)\[\/color\]/gis, '<span style="color:$1">$2</span>')
                .replace(/\[url=(https?:\/\/[^\]]{1,300})\](.*?)\[\/url\]/gis, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#58a6ff">$2</a>')
                .replace(/\n/g, '<br>');

            const [[myChar]] = await db.query(
                'SELECT name, equipped_title, profile_color FROM characters WHERE id=?', [p.charId]);

            await db.query(
                `INSERT INTO profile_guestbook (profile_char_id, author_char_id, author_name, author_title, author_color, message, message_html)
                 VALUES (?,?,?,?,?,?,?)`,
                [tid, p.charId, myChar.name, myChar.equipped_title || null, myChar.profile_color || null, text, html]);

            socket.emit('guestbook_result', { success: true });

            // Notify the profile owner if they're online
            for (const [sid, pl] of Object.entries(state.onlinePlayers)) {
                if (pl.charId === tid) {
                    io.to(sid).emit('notification', { type: 'info', message: `${myChar.name} left a message on your profile!` });
                }
            }
        } catch (e) {
            console.error('[Guestbook] Error:', e.message);
            socket.emit('guestbook_result', { success: false, message: 'Error posting.' });
        }
    });

    // =============================================================
    // 2. GUILD SYSTEM — Real-time guild management
    // =============================================================

    // --- GUILD: look up this player's guild and join the room ---
    // Teaching: On login we immediately join the socket room for the
    // player's guild (if any) so guild chat starts working right away.
    (async () => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const [guildRow] = await db.query(
                `SELECT gm.guild_id, gm.rank, g.name AS guild_name
                 FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id
                 WHERE gm.character_id = ? AND gm.is_active = 1 AND g.is_active = 1 LIMIT 1`,
                [p.charId]
            );
            if (guildRow.length) {
                const gm = guildRow[0];
                state.charGuildMap[p.charId] = { guildId: gm.guild_id, guildName: gm.guild_name, rank: gm.rank };
                socket.join('guild_' + gm.guild_id);
                // Send current guild membership info to client
                socket.emit('guild_joined', { guildId: gm.guild_id, guildName: gm.guild_name, rank: gm.rank });
            }
        } catch (e) { /* non-critical */ }
    })();

    // INVITE player to guild
    socket.on('guild_invite', async ({ targetCharId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const myGuild = state.charGuildMap[p.charId];
            if (!myGuild) { socket.emit('guild_msg', { text: 'You are not in a guild.', type: 'error' }); return; }
            if (!['LEADER', 'OFFICER'].includes(myGuild.rank)) {
                socket.emit('guild_msg', { text: 'Only officers and leaders can invite.', type: 'error' }); return;
            }
            // Check target is online
            const targetEntry = Object.entries(state.onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
            if (!targetEntry) { socket.emit('guild_msg', { text: 'Player is offline.', type: 'error' }); return; }
            const [, targetPlayer] = targetEntry;
            if (state.charGuildMap[targetPlayer.charId]) {
                socket.emit('guild_msg', { text: 'Player is already in a guild.', type: 'error' }); return;
            }

            // Persist invite to DB
            await db.query(
                "INSERT INTO guild_invites (guild_id, inviter_id, invitee_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE status='pending', created_at=NOW()",
                [myGuild.guildId, p.charId, targetCharId]
            );

            // Notify target
            const targetSocket = io.sockets.sockets.get(targetEntry[0]);
            if (targetSocket) {
                targetSocket.emit('guild_invited', {
                    guildId: myGuild.guildId,
                    guildName: myGuild.guildName,
                    inviterName: p.name
                });
            }
            socket.emit('guild_msg', { text: `Invite sent to ${targetPlayer.name}.`, type: 'info' });
        } catch (e) { console.error('guild_invite error:', e); }
    });

    // ACCEPT guild invite
    socket.on('guild_accept', async ({ guildId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            if (state.charGuildMap[p.charId]) {
                socket.emit('guild_msg', { text: 'Leave your current guild first.', type: 'error' }); return;
            }

            // Validate invite
            const [inv] = await db.query(
                "SELECT * FROM guild_invites WHERE guild_id=? AND invitee_id=? AND status='pending' AND expires_at>NOW() LIMIT 1",
                [guildId, p.charId]
            );
            if (!inv.length) { socket.emit('guild_msg', { text: 'Invite not found or expired.', type: 'error' }); return; }

            // Check guild exists and has space
            const [guild] = await db.query('SELECT * FROM guilds WHERE id=? AND is_active=1', [guildId]);
            if (!guild.length) { socket.emit('guild_msg', { text: 'Guild no longer exists.', type: 'error' }); return; }
            const [count] = await db.query('SELECT COUNT(*) AS c FROM guild_members WHERE guild_id=? AND is_active=1', [guildId]);
            if (count[0].c >= guild[0].max_members) {
                socket.emit('guild_msg', { text: 'Guild is full.', type: 'error' }); return;
            }

            // Join guild
            await db.query(
                "INSERT INTO guild_members (guild_id, character_id, rank) VALUES (?,?,'MEMBER') ON DUPLICATE KEY UPDATE is_active=1, left_at=NULL, rank='MEMBER'",
                [guildId, p.charId]
            );
            await db.query("UPDATE guild_invites SET status='accepted' WHERE guild_id=? AND invitee_id=?", [guildId, p.charId]);

            state.charGuildMap[p.charId] = { guildId, guildName: guild[0].name, rank: 'MEMBER' };
            socket.join('guild_' + guildId);
            socket.emit('guild_joined', { guildId, guildName: guild[0].name, rank: 'MEMBER' });

            io.to('guild_' + guildId).emit('chat_msg', {
                channel: 'guild', from: 'System',
                text: `${p.name} joined the guild!`, ts: Date.now()
            });
            io.to('guild_' + guildId).emit('guild_update');
        } catch (e) { console.error('guild_accept error:', e); }
    });

    // DECLINE guild invite
    socket.on('guild_decline', async ({ guildId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            await db.query("UPDATE guild_invites SET status='declined' WHERE guild_id=? AND invitee_id=?", [guildId, p.charId]);
        } catch (e) { console.error('guild_decline error:', e); }
    });

    // LEAVE guild
    socket.on('guild_leave', async () => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            await _leaveGuild(socket, p);
        } catch (e) { console.error('guild_leave error:', e); }
    });

    // KICK member (leader/officer only)
    socket.on('guild_kick', async ({ targetCharId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const myGuild = state.charGuildMap[p.charId];
            if (!myGuild || !['LEADER','OFFICER'].includes(myGuild.rank)) return;

            // Remove from DB
            await db.query('UPDATE guild_members SET is_active=0, left_at=NOW() WHERE guild_id=? AND character_id=?', [myGuild.guildId, targetCharId]);

            const targetEntry = Object.entries(state.onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
            if (targetEntry) {
                const [tSockId] = targetEntry;
                const tSock = io.sockets.sockets.get(tSockId);
                if (tSock) {
                    delete state.charGuildMap[parseInt(targetCharId)];
                    tSock.leave('guild_' + myGuild.guildId);
                    tSock.emit('guild_left', {});
                    tSock.emit('guild_msg', { text: 'You were kicked from the guild.', type: 'error' });
                }
            }
            io.to('guild_' + myGuild.guildId).emit('chat_msg', {
                channel: 'guild', from: 'System',
                text: `A member was removed from the guild.`, ts: Date.now()
            });
            io.to('guild_' + myGuild.guildId).emit('guild_update');
        } catch (e) { console.error('guild_kick error:', e); }
    });

    // PROMOTE / DEMOTE
    socket.on('guild_set_rank', async ({ targetCharId, rank }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const myGuild = state.charGuildMap[p.charId];
            if (!myGuild || myGuild.rank !== 'LEADER') { socket.emit('guild_msg', { text: 'Only the leader can change ranks.', type: 'error' }); return; }
            if (!['OFFICER','MEMBER'].includes(rank)) return;
            await db.query('UPDATE guild_members SET rank=? WHERE guild_id=? AND character_id=? AND is_active=1', [rank, myGuild.guildId, targetCharId]);
            // Update in-memory if online
            if (state.charGuildMap[parseInt(targetCharId)]) state.charGuildMap[parseInt(targetCharId)].rank = rank;
            socket.emit('guild_msg', { text: `Rank updated.`, type: 'info' });
            io.to('guild_' + myGuild.guildId).emit('guild_update');
        } catch (e) { console.error('guild_set_rank error:', e); }
    });

    // guild_promote / guild_demote — UI aliases for guild_set_rank.
    // The server already has guild_set_rank which takes an explicit rank string.
    // These wrappers let the UI send the friendlier event names without breaking
    // the existing guild_set_rank consumers (modpanel, etc).
    socket.on('guild_promote', async ({ targetCharId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const myGuild = state.charGuildMap[p.charId];
            if (!myGuild || myGuild.rank !== 'LEADER') {
                socket.emit('guild_msg', { text: 'Only the guild leader can promote members.', type: 'error' });
                return;
            }
            await db.query(
                'UPDATE guild_members SET rank=? WHERE guild_id=? AND character_id=? AND is_active=1',
                ['OFFICER', myGuild.guildId, parseInt(targetCharId)]
            );
            if (state.charGuildMap[parseInt(targetCharId)]) state.charGuildMap[parseInt(targetCharId)].rank = 'OFFICER';
            socket.emit('guild_msg', { text: 'Member promoted to Officer.', type: 'success' });
            // Notify the promoted player if online
            const entry = Object.entries(state.onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
            if (entry) {
                const tSock = io.sockets.sockets.get(entry[0]);
                if (tSock) tSock.emit('guild_msg', { text: `You have been promoted to Officer!`, type: 'success' });
            }
        } catch (e) { console.error('guild_promote error:', e); }
    });

    socket.on('guild_demote', async ({ targetCharId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const myGuild = state.charGuildMap[p.charId];
            if (!myGuild || myGuild.rank !== 'LEADER') {
                socket.emit('guild_msg', { text: 'Only the guild leader can demote members.', type: 'error' });
                return;
            }
            await db.query(
                'UPDATE guild_members SET rank=? WHERE guild_id=? AND character_id=? AND is_active=1',
                ['MEMBER', myGuild.guildId, parseInt(targetCharId)]
            );
            if (state.charGuildMap[parseInt(targetCharId)]) state.charGuildMap[parseInt(targetCharId)].rank = 'MEMBER';
            socket.emit('guild_msg', { text: 'Officer demoted to Member.', type: 'success' });
            const entry = Object.entries(state.onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
            if (entry) {
                const tSock = io.sockets.sockets.get(entry[0]);
                if (tSock) tSock.emit('guild_msg', { text: `You have been demoted to Member.`, type: 'info' });
            }
        } catch (e) { console.error('guild_demote error:', e); }
    });

    // Internal helper — leave / disband guild
    async function _leaveGuild(leavingSocket, player) {
        const guildInfo = state.charGuildMap[player.charId];
        if (!guildInfo) return;
        const { guildId, guildName } = guildInfo;

        // If leader, transfer or disband
        const [guild] = await db.query('SELECT * FROM guilds WHERE id=? AND is_active=1', [guildId]);
        if (!guild.length) { delete state.charGuildMap[player.charId]; return; }

        await db.query('UPDATE guild_members SET is_active=0, left_at=NOW() WHERE guild_id=? AND character_id=?', [guildId, player.charId]);
        delete state.charGuildMap[player.charId];
        leavingSocket.leave('guild_' + guildId);
        leavingSocket.emit('guild_left', {});

        if (guild[0].leader_id === player.charId) {
            // Try to find next officer or member to be leader
            const [next] = await db.query(
                "SELECT character_id FROM guild_members WHERE guild_id=? AND is_active=1 ORDER BY FIELD(rank,'OFFICER','MEMBER') LIMIT 1",
                [guildId]
            );
            if (next.length) {
                await db.query('UPDATE guilds SET leader_id=? WHERE id=?', [next[0].character_id, guildId]);
                await db.query("UPDATE guild_members SET rank='LEADER' WHERE guild_id=? AND character_id=?", [guildId, next[0].character_id]);
                if (state.charGuildMap[next[0].character_id]) state.charGuildMap[next[0].character_id].rank = 'LEADER';
                io.to('guild_' + guildId).emit('chat_msg', {
                    channel: 'guild', from: 'System',
                    text: `${player.name} left. Leadership transferred.`, ts: Date.now()
                });
            } else {
                // No members left — disband
                await db.query('UPDATE guilds SET is_active=0, disbanded_at=NOW() WHERE id=?', [guildId]);
                io.to('guild_' + guildId).emit('guild_left', {});
            }
        } else {
            io.to('guild_' + guildId).emit('chat_msg', {
                channel: 'guild', from: 'System', text: `${player.name} left the guild.`, ts: Date.now()
            });
        }
        io.to('guild_' + guildId).emit('guild_update');
    }

    // =============================================================
    // 3. TRADE SYSTEM — Real-time player-to-player item trading
    // =============================================================
    // Teaching: A trade has two sides (initiator and recipient).
    // Each side can add items. Both sides must LOCK (finalise their
    // offer) before the trade can be CONFIRMED. If both confirm,
    // items swap atomically in the DB. Either side can cancel at any point.

    // REQUEST trade with another player
    socket.on('trade_request', ({ targetCharId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const targetEntry = Object.entries(state.onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
            if (!targetEntry) { socket.emit('trade_msg', { text: 'Player is offline.', type: 'error' }); return; }
            const [tSockId, tPlayer] = targetEntry;

            io.to(tSockId).emit('trade_requested', { fromName: p.name, fromCharId: p.charId });
            socket.emit('trade_msg', { text: `Trade request sent to ${tPlayer.name}.`, type: 'info' });
        } catch (e) { console.error('trade_request error:', e); }
    });

    // ACCEPT trade — create the trade object
    socket.on('trade_accept', ({ targetCharId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const targetEntry = Object.entries(state.onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
            if (!targetEntry) { socket.emit('trade_msg', { text: 'Player went offline.', type: 'error' }); return; }
            const [tSockId, tPlayer] = targetEntry;

            const tradeId = 'T' + (state.tradeCounter++);
            state.activeTrades[tradeId] = {
                id: tradeId,
                sides: {
                    [p.charId]:       { charId: p.charId,       name: p.name,       items: [], gold: 0, locked: false, confirmed: false },
                    [tPlayer.charId]: { charId: tPlayer.charId, name: tPlayer.name, items: [], gold: 0, locked: false, confirmed: false }
                }
            };

            // Both players join trade room
            socket.join('trade_' + tradeId);
            const targetSocket = io.sockets.sockets.get(tSockId);
            if (targetSocket) targetSocket.join('trade_' + tradeId);

            io.to('trade_' + tradeId).emit('trade_start', { tradeId, trade: state.activeTrades[tradeId] });
        } catch (e) { console.error('trade_accept error:', e); }
    });

    // DECLINE trade request
    socket.on('trade_decline', ({ targetCharId }) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        const targetEntry = Object.entries(state.onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
        if (targetEntry) {
            io.to(targetEntry[0]).emit('trade_msg', { text: `${p.name} declined the trade.`, type: 'info' });
        }
    });

    // ADD ITEM to trade
    socket.on('trade_add_item', async ({ tradeId, itemId, quantity }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const trade = state.activeTrades[tradeId];
            if (!trade || !trade.sides[p.charId]) return;

            const mySide = trade.sides[p.charId];
            if (mySide.locked) { socket.emit('trade_msg', { text: 'Unlock your side first.', type: 'error' }); return; }

            // Verify item is in inventory
            const [inv] = await db.query(
                'SELECT ci.*, gi.name, gi.icon, gi.type FROM character_items ci JOIN game_items gi ON ci.item_id=gi.id WHERE ci.character_id=? AND ci.item_id=?',
                [p.charId, itemId]
            );
            if (!inv.length) { socket.emit('trade_msg', { text: 'Item not found.', type: 'error' }); return; }
            const item = inv[0];
            const qty = Math.min(parseInt(quantity) || 1, item.quantity);

            // Add or increment in trade
            const existing = mySide.items.find(i => i.itemId === itemId);
            if (existing) existing.quantity = Math.min(existing.quantity + qty, item.quantity);
            else mySide.items.push({ itemId, name: item.name, icon: item.icon, quantity: qty });

            // Reset confirms when offer changes
            mySide.confirmed = false;

            io.to('trade_' + tradeId).emit('trade_update', { tradeId, trade });
        } catch (e) { console.error('trade_add_item error:', e); }
    });

    // REMOVE ITEM from trade
    socket.on('trade_remove_item', ({ tradeId, itemId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const trade = state.activeTrades[tradeId];
            if (!trade || !trade.sides[p.charId]) return;
            const mySide = trade.sides[p.charId];
            if (mySide.locked) return;
            mySide.items = mySide.items.filter(i => i.itemId !== itemId);
            mySide.confirmed = false;
            io.to('trade_' + tradeId).emit('trade_update', { tradeId, trade });
        } catch (e) { console.error('trade_remove_item error:', e); }
    });

    // SET GOLD offer
    socket.on('trade_set_gold', ({ tradeId, amount }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const trade = state.activeTrades[tradeId];
            if (!trade || !trade.sides[p.charId]) return;
            const mySide = trade.sides[p.charId];
            if (mySide.locked) return;
            mySide.gold = Math.max(0, parseInt(amount) || 0);
            mySide.confirmed = false;
            io.to('trade_' + tradeId).emit('trade_update', { tradeId, trade });
        } catch (e) { console.error('trade_set_gold error:', e); }
    });

    // LOCK trade side
    socket.on('trade_lock', ({ tradeId }) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        const trade = state.activeTrades[tradeId];
        if (!trade || !trade.sides[p.charId]) return;
        trade.sides[p.charId].locked = !trade.sides[p.charId].locked;
        trade.sides[p.charId].confirmed = false;
        io.to('trade_' + tradeId).emit('trade_update', { tradeId, trade });
    });

    // CONFIRM trade — if both confirm and both locked, execute
    socket.on('trade_confirm', async ({ tradeId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const trade = state.activeTrades[tradeId];
            if (!trade || !trade.sides[p.charId]) return;

            const mySide = trade.sides[p.charId];
            if (!mySide.locked) { socket.emit('trade_msg', { text: 'Lock your offer first.', type: 'error' }); return; }
            mySide.confirmed = true;

            io.to('trade_' + tradeId).emit('trade_update', { tradeId, trade });

            // Check if BOTH sides confirmed
            const sides = Object.values(trade.sides);
            if (!sides.every(s => s.locked && s.confirmed)) return;

            // EXECUTE TRADE — wrapped in a transaction with row locks to prevent duplication
            const [sideA, sideB] = sides;
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();

                // Verify gold balances with FOR UPDATE lock
                const [userA] = await conn.query('SELECT currency FROM users WHERE id=(SELECT user_id FROM characters WHERE id=?) FOR UPDATE', [sideA.charId]);
                const [userB] = await conn.query('SELECT currency FROM users WHERE id=(SELECT user_id FROM characters WHERE id=?) FOR UPDATE', [sideB.charId]);
                if ((userA[0]?.currency || 0) < sideA.gold || (userB[0]?.currency || 0) < sideB.gold) {
                    await conn.rollback(); conn.release();
                    io.to('trade_' + tradeId).emit('trade_cancelled', { reason: 'Insufficient gold.' });
                    delete state.activeTrades[tradeId];
                    return;
                }

                // Verify items still in inventory with FOR UPDATE lock (prevents race condition)
                for (const side of sides) {
                    for (const it of side.items) {
                        const [inv] = await conn.query('SELECT quantity FROM character_items WHERE character_id=? AND item_id=? FOR UPDATE', [side.charId, it.itemId]);
                        if (!inv.length || inv[0].quantity < it.quantity) {
                            await conn.rollback(); conn.release();
                            io.to('trade_' + tradeId).emit('trade_cancelled', { reason: `${side.name} no longer has the offered item(s).` });
                            delete state.activeTrades[tradeId];
                            return;
                        }
                    }
                }

                // Swap items (inside transaction — atomic)
                for (const [giver, receiver] of [[sideA, sideB], [sideB, sideA]]) {
                    for (const it of giver.items) {
                        const [inv] = await conn.query('SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=?', [giver.charId, it.itemId]);
                        if (inv[0].quantity > it.quantity) await conn.query('UPDATE character_items SET quantity=quantity-? WHERE id=?', [it.quantity, inv[0].id]);
                        else await conn.query('DELETE FROM character_items WHERE id=?', [inv[0].id]);
                        const [ex] = await conn.query('SELECT id FROM character_items WHERE character_id=? AND item_id=?', [receiver.charId, it.itemId]);
                        if (ex.length) await conn.query('UPDATE character_items SET quantity=quantity+? WHERE id=?', [it.quantity, ex[0].id]);
                        else await conn.query('INSERT INTO character_items (character_id,item_id,quantity) VALUES (?,?,?)', [receiver.charId, it.itemId, it.quantity]);
                    }
                }

                // Swap gold (inside transaction)
                if (sideA.gold > 0) {
                    await conn.query('UPDATE users SET currency=currency-? WHERE id=(SELECT user_id FROM characters WHERE id=?)', [sideA.gold, sideA.charId]);
                    await conn.query('UPDATE users SET currency=currency+? WHERE id=(SELECT user_id FROM characters WHERE id=?)', [sideA.gold, sideB.charId]);
                }
                if (sideB.gold > 0) {
                    await conn.query('UPDATE users SET currency=currency-? WHERE id=(SELECT user_id FROM characters WHERE id=?)', [sideB.gold, sideB.charId]);
                    await conn.query('UPDATE users SET currency=currency+? WHERE id=(SELECT user_id FROM characters WHERE id=?)', [sideB.gold, sideA.charId]);
                }

                // Audit log (inside transaction)
                await conn.query(
                    'INSERT INTO character_trade_log (initiator_id, recipient_id, initiator_items, recipient_items, initiator_gold, recipient_gold) VALUES (?,?,?,?,?,?)',
                    [sideA.charId, sideB.charId, JSON.stringify(sideA.items), JSON.stringify(sideB.items), sideA.gold, sideB.gold]
                ).catch(() => {});

                await conn.commit();
                conn.release();
            } catch (txErr) {
                await conn.rollback().catch(() => {});
                conn.release();
                io.to('trade_' + tradeId).emit('trade_cancelled', { reason: 'Trade failed. Please try again.' });
                delete state.activeTrades[tradeId];
                return;
            }

            io.to('trade_' + tradeId).emit('trade_complete', { tradeId });
            delete state.activeTrades[tradeId];
        } catch (e) { console.error('trade_confirm error:', e); }
    });

    // CANCEL trade
    socket.on('trade_cancel', ({ tradeId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const trade = state.activeTrades[tradeId];
            if (!trade || !trade.sides[p.charId]) return;
            io.to('trade_' + tradeId).emit('trade_cancelled', { reason: `${p.name} cancelled the trade.` });
            delete state.activeTrades[tradeId];
        } catch (e) { console.error('trade_cancel error:', e); }
    });

    // =============================================================
    // 4. PARTY SYSTEM — Real-time party management
    // =============================================================
    // Teaching: friends are persisted in DB via REST (/api/party/).
    // Party membership is handled here via sockets for real-time
    // invites/joins/leaves, and also saved to DB for persistence.

    // INVITE to party
    socket.on('party_invite', async ({ targetCharId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;

            // Find target socket
            const targetEntry = Object.entries(state.onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
            if (!targetEntry) { socket.emit('party_msg', { text: 'Player is offline.', type: 'error' }); return; }
            const [targetSockId, targetPlayer] = targetEntry;

            // Can't invite self or someone already in a party with you
            if (targetPlayer.charId === p.charId) return;
            if (state.charPartyMap[targetPlayer.charId] && state.charPartyMap[targetPlayer.charId] === state.charPartyMap[p.charId]) {
                socket.emit('party_msg', { text: 'Already in your party.', type: 'error' }); return;
            }

            // Create or find party for inviter
            let partyId = state.charPartyMap[p.charId];
            if (!partyId) {
                // Create new party in DB
                const [result] = await db.query(
                    'INSERT INTO character_parties (leader_id, is_active) VALUES (?,1)', [p.charId]
                );
                partyId = result.insertId;
                await db.query(
                    "INSERT INTO character_party_members (party_id, character_id, role) VALUES (?,?,'leader')",
                    [partyId, p.charId]
                );
                state.activeParties[partyId] = { id: partyId, leaderId: p.charId, members: [p.charId] };
                state.charPartyMap[p.charId] = partyId;
                socket.join('party_' + partyId);
            }

            const party = state.activeParties[partyId];
            if (party.members.length >= 4) {
                socket.emit('party_msg', { text: 'Party is full (max 4).', type: 'error' }); return;
            }

            // Send invite to target
            io.to(targetSockId).emit('party_invited', {
                partyId, inviterName: p.name, inviterCharId: p.charId
            });
            socket.emit('party_msg', { text: `Invite sent to ${targetPlayer.name}.`, type: 'info' });
        } catch (err) { console.error('party_invite error:', err); }
    });

    // ACCEPT party invite
    socket.on('party_accept', async ({ partyId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;

            const party = state.activeParties[partyId];
            if (!party) { socket.emit('party_msg', { text: 'Party no longer exists.', type: 'error' }); return; }
            if (party.members.length >= 4) { socket.emit('party_msg', { text: 'Party is full.', type: 'error' }); return; }

            // Leave old party if any
            const oldPartyId = state.charPartyMap[p.charId];
            if (oldPartyId && oldPartyId !== partyId) {
                await _leaveParty(socket, p, oldPartyId);
            }

            // Join
            party.members.push(p.charId);
            state.charPartyMap[p.charId] = partyId;
            socket.join('party_' + partyId);

            await db.query(
                "INSERT INTO character_party_members (party_id, character_id, role) VALUES (?,?,'member') ON DUPLICATE KEY UPDATE is_active=1, left_at=NULL",
                [partyId, p.charId]
            );

            io.to('party_' + partyId).emit('party_update', state.buildPartyPayload(partyId));
            io.to('party_' + partyId).emit('chat_msg', {
                channel: 'party', from: 'System', text: `${p.name} joined the party!`, ts: Date.now()
            });
        } catch (err) { console.error('party_accept error:', err); }
    });

    // DECLINE party invite
    socket.on('party_decline', ({ partyId }) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        const party = state.activeParties[partyId];
        if (!party) return;
        const leaderEntry = Object.values(state.onlinePlayers).find(pl => pl.charId === party.leaderId);
        if (leaderEntry) {
            io.to(leaderEntry.socketId).emit('party_msg', { text: `${p.name} declined your party invite.`, type: 'info' });
        }
    });

    // LEAVE party
    socket.on('party_leave', async () => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const partyId = state.charPartyMap[p.charId];
            if (!partyId) return;
            await _leaveParty(socket, p, partyId);
        } catch(e) { console.error('[party_leave]', e.message); }
    });

    // KICK member (leader only)
    socket.on('party_kick', async ({ targetCharId }) => {
        try {
            const p = state.onlinePlayers[socket.id];
            if (!p) return;
            const partyId = state.charPartyMap[p.charId];
            if (!partyId) return;
            const party = state.activeParties[partyId];
            if (!party || party.leaderId !== p.charId) {
                socket.emit('party_msg', { text: 'Only the leader can kick.', type: 'error' }); return;
            }
            const targetEntry = Object.entries(state.onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
            if (targetEntry) {
                const [tSockId, tPlayer] = targetEntry;
                await _leaveParty(io.sockets.sockets.get(tSockId), tPlayer, partyId, true);
                io.to(tSockId).emit('party_msg', { text: 'You were kicked from the party.', type: 'error' });
            }
        } catch (err) { console.error('party_kick error:', err); }
    });

    // Internal helper — leave or disband party
    async function _leaveParty(leavingSocket, player, partyId, isKick = false) {
        const party = state.activeParties[partyId];
        if (!party) return;

        party.members = party.members.filter(id => id !== player.charId);
        delete state.charPartyMap[player.charId];
        if (leavingSocket) {
            leavingSocket.leave('party_' + partyId);
            leavingSocket.emit('party_update', null); // clears party UI
        }

        await db.query(
            "UPDATE character_party_members SET is_active=0, left_at=NOW() WHERE party_id=? AND character_id=?",
            [partyId, player.charId]
        );

        if (party.members.length === 0) {
            // Disband
            delete state.activeParties[partyId];
            await db.query("UPDATE character_parties SET is_active=0, disbanded_at=NOW() WHERE id=?", [partyId]);
        } else if (party.leaderId === player.charId) {
            // Transfer leadership to next member
            party.leaderId = party.members[0];
            await db.query("UPDATE character_parties SET leader_id=? WHERE id=?", [party.leaderId, partyId]);
            io.to('party_' + partyId).emit('party_update', state.buildPartyPayload(partyId));
            io.to('party_' + partyId).emit('chat_msg', {
                channel: 'party', from: 'System',
                text: `${player.name} left. Leadership passed.`, ts: Date.now()
            });
        } else {
            io.to('party_' + partyId).emit('party_update', state.buildPartyPayload(partyId));
            const verb = isKick ? 'was kicked' : 'left the party';
            io.to('party_' + partyId).emit('chat_msg', {
                channel: 'party', from: 'System',
                text: `${player.name} ${verb}.`, ts: Date.now()
            });
        }
    }

    // =============================================================
    // 5. STAFF MESSENGER PANEL
    // =============================================================
    // Staff join/leave the admin panel — separate from game presence.
    // Tracks who has AdminSauce open with away messages.

    socket.on('staff_panel_join', async () => {
        const sessionData = socket.request.session;
        const userId = sessionData && sessionData.userId;
        if (!userId) return;
        const [rows] = await db.query('SELECT username, role, chat_color FROM users WHERE id=?', [userId]).catch(() => [[]]);
        if (!rows.length) return;
        const role = (rows[0].role || '').toUpperCase();
        if (!['ADMIN','GM','MOD','STAFF','OWNER'].includes(role)) return;

        socket.join('staff_panel');
        if (!global._staffPanel) global._staffPanel = {};
        global._staffPanel[socket.id] = {
            socketId: socket.id, userId, username: rows[0].username,
            role, status: 'online', awayMessage: '', joinedAt: Date.now(),
            chatColor: rows[0].chat_color || null
        };
        // Notify others that someone signed on
        socket.to('staff_panel').emit('staff_sign_on', { username: rows[0].username, role });
        // Broadcast updated staff list — filter out invisible users for non-self
        const visibleList = Object.values(global._staffPanel).filter(s => s.status !== 'invisible');
        // Each user gets the full list if they're invisible (so they can see chat), otherwise filtered
        for (const [sid, s] of Object.entries(global._staffPanel)) {
            const list = s.status === 'invisible'
                ? Object.values(global._staffPanel)
                : visibleList;
            io.to(sid).emit('staff_panel_presence', list);
        }
    });

    socket.on('staff_panel_status', (data) => {
        if (!global._staffPanel?.[socket.id]) return;
        const validStatuses = ['online', 'away', 'busy', 'invisible'];
        const status = validStatuses.includes(data?.status) ? data.status : 'online';
        const wasInvisible = global._staffPanel[socket.id].status === 'invisible';
        const goingInvisible = status === 'invisible';
        global._staffPanel[socket.id].status = status;
        global._staffPanel[socket.id].awayMessage = typeof data?.awayMessage === 'string' ? data.awayMessage.slice(0, 120) : '';
        // Broadcast presence — invisible users hidden from others
        const visibleList = Object.values(global._staffPanel).filter(s => s.status !== 'invisible');
        for (const [sid, s] of Object.entries(global._staffPanel)) {
            const list = s.status === 'invisible'
                ? Object.values(global._staffPanel)
                : visibleList;
            io.to(sid).emit('staff_panel_presence', list);
        }
        // Sign on/off notifications for invisible transitions
        if (goingInvisible && !wasInvisible) {
            socket.to('staff_panel').emit('staff_sign_off', { username: global._staffPanel[socket.id].username, role: global._staffPanel[socket.id].role });
        } else if (wasInvisible && !goingInvisible) {
            socket.to('staff_panel').emit('staff_sign_on', { username: global._staffPanel[socket.id].username, role: global._staffPanel[socket.id].role });
        }
    });

    socket.on('staff_set_color', async (data) => {
        if (!global._staffPanel?.[socket.id]) return;
        const s = global._staffPanel[socket.id];
        // Only ADMIN and OWNER can set custom colors
        if (!['ADMIN', 'OWNER'].includes(s.role)) return;
        const color = typeof data?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(data.color) ? data.color : null;
        s.chatColor = color;
        await db.query('UPDATE users SET chat_color=? WHERE id=?', [color, s.userId]).catch(() => {});
        // Broadcast updated presence
        const visibleList = Object.values(global._staffPanel).filter(st => st.status !== 'invisible');
        for (const [sid, st] of Object.entries(global._staffPanel)) {
            io.to(sid).emit('staff_panel_presence', st.status === 'invisible' ? Object.values(global._staffPanel) : visibleList);
        }
    });

    socket.on('staff_chat_send', async (data) => {
        if (!global._staffPanel?.[socket.id]) return;
        const sender = global._staffPanel[socket.id];
        const body = typeof data?.body === 'string' ? data.body.trim().slice(0, 500) : '';
        const channel = typeof data?.channel === 'string' ? data.channel.slice(0, 32) : 'general';
        if (!body) return;
        // DM channels: "dm:lowerId:higherId" — only deliver to participants
        const isDM = channel.startsWith('dm:');
        // Persist
        await db.query(
            'INSERT INTO staff_messages (sender_id, sender_name, sender_role, channel, body) VALUES (?,?,?,?,?)',
            [sender.userId, sender.username, sender.role, channel, body]
        ).catch(err => console.error('[StaffChat] DB error:', err.message));
        const msg = {
            sender_id: sender.userId, sender_name: sender.username,
            sender_role: sender.role, sender_color: sender.chatColor || null,
            channel, body, created_at: new Date().toISOString()
        };
        if (isDM) {
            // Only send to the two participants
            const parts = channel.split(':');
            const id1 = parseInt(parts[1]), id2 = parseInt(parts[2]);
            for (const [sid, s] of Object.entries(global._staffPanel)) {
                if (s.userId === id1 || s.userId === id2) {
                    io.to(sid).emit('staff_chat_msg', msg);
                }
            }
        } else {
            io.to('staff_panel').emit('staff_chat_msg', msg);
        }
    });

    socket.on('staff_chat_history', async (data) => {
        if (!global._staffPanel?.[socket.id]) return;
        const channel = typeof data?.channel === 'string' ? data.channel.slice(0, 32) : 'general';
        const [rows] = await db.query(
            'SELECT sender_id, sender_name, sender_role, channel, body, created_at FROM staff_messages WHERE channel=? ORDER BY created_at DESC LIMIT 50',
            [channel]
        ).catch(() => [[]]);
        socket.emit('staff_chat_history', { channel, messages: rows.reverse() });
    });

    // Typing indicator — broadcast to channel participants
    socket.on('staff_typing', (data) => {
        if (!global._staffPanel?.[socket.id]) return;
        const sender = global._staffPanel[socket.id];
        const channel = typeof data?.channel === 'string' ? data.channel : 'general';
        const isDM = channel.startsWith('dm:');
        const payload = { userId: sender.userId, username: sender.username, channel };
        if (isDM) {
            const parts = channel.split(':');
            const id1 = parseInt(parts[1]), id2 = parseInt(parts[2]);
            for (const [sid, s] of Object.entries(global._staffPanel)) {
                if (sid !== socket.id && (s.userId === id1 || s.userId === id2)) {
                    io.to(sid).emit('staff_typing', payload);
                }
            }
        } else {
            socket.to('staff_panel').emit('staff_typing', payload);
        }
    });

    // Nudge/Buzz — send to a specific user
    socket.on('staff_nudge', (data) => {
        if (!global._staffPanel?.[socket.id]) return;
        const sender = global._staffPanel[socket.id];
        const targetUserId = parseInt(data?.targetUserId);
        if (!targetUserId) return;
        for (const [sid, s] of Object.entries(global._staffPanel)) {
            if (s.userId === targetUserId) {
                io.to(sid).emit('staff_nudge', { from: sender.username, fromRole: sender.role });
            }
        }
    });

    // =============================================================
    // 6. MINIGAMES
    // =============================================================

    // ── Dice Gambling ─────────────────────────────────────────────
    socket.on('dice_roll', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const { bet, choice } = data; // choice: 'high' or 'low'
            if (!bet || bet < 1) return;
            const [user] = await db.query('SELECT currency FROM users WHERE id=?', [p.userId]);
            if (!user.length || user[0].currency < bet) return socket.emit('dice_result', { success: false, message: 'Not enough gold.' });

            const die1 = Math.floor(Math.random() * 6) + 1;
            const die2 = Math.floor(Math.random() * 6) + 1;
            const total = die1 + die2;
            const isHigh = total >= 7;
            const won = (choice === 'high' && isHigh) || (choice === 'low' && !isHigh);

            if (won) {
                await db.query('UPDATE users SET currency=currency+? WHERE id=?', [bet, p.userId]);
            } else {
                await db.query('UPDATE users SET currency=currency-? WHERE id=?', [bet, p.userId]);
            }

            socket.emit('dice_result', { success: true, die1, die2, total, choice, won, payout: won ? bet : -bet });
        } catch (e) { socket.emit('dice_result', { success: false, message: e.message }); }
    });

    // ── Arena Betting ─────────────────────────────────────────────
    socket.on('arena_place_bet', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const { matchId, betOn, amount } = data;
            if (!amount || amount < 1) return;
            const [user] = await db.query('SELECT currency FROM users WHERE id=?', [p.userId]);
            if (!user.length || user[0].currency < amount) return socket.emit('arena_bet_result', { success: false, message: 'Not enough gold.' });

            await db.query('UPDATE users SET currency=currency-? WHERE id=?', [amount, p.userId]);
            await db.query('INSERT INTO game_arena_bets (match_id, character_id, bet_on, amount) VALUES (?,?,?,?)',
                [matchId, p.charId, betOn, amount]);
            socket.emit('arena_bet_result', { success: true, message: `Bet ${amount} gold on fighter #${betOn}!` });
        } catch (e) { socket.emit('arena_bet_result', { success: false, message: e.message }); }
    });

    // ── Fishing Minigame ──────────────────────────────────────────
    socket.on('fish_cast', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const [spots] = await db.query('SELECT * FROM game_fishing_spots WHERE map_id=? AND x=? AND y=? AND is_active=1', [p.mapId, data.x, data.y]);
            if (!spots.length) return socket.emit('fish_result', { success: false, message: 'No fishing spot here.' });
            const spot = spots[0];

            // Start fishing — send bite time to client
            const biteTime = (spot.catch_time_ms || 3000) + Math.floor(Math.random() * 2000);
            socket.emit('fish_bite', { spotId: spot.id, biteTime });
        } catch {}
    });

    socket.on('fish_reel', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const [spots] = await db.query('SELECT * FROM game_fishing_spots WHERE id=?', [data.spotId]);
            if (!spots.length) return;
            const spot = spots[0];

            // Check timing window (client sends reelTime, should be within 500ms of biteTime)
            const fishTable = typeof spot.fish_table === 'string' ? JSON.parse(spot.fish_table) : (spot.fish_table || []);
            if (!fishTable.length) return socket.emit('fish_result', { success: false, message: 'Nothing biting today.' });

            // Roll catch
            const roll = Math.random() * 100;
            let caught = null;
            let cumChance = 0;
            for (const fish of fishTable) {
                cumChance += (fish.chance || 20);
                if (roll <= cumChance) { caught = fish; break; }
            }

            if (!caught) return socket.emit('fish_result', { success: false, message: 'It got away!' });

            // Add to inventory
            if (caught.item_id) {
                await db.query('INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1',
                    [p.charId, caught.item_id]);
            }

            socket.emit('fish_result', { success: true, message: `Caught: ${caught.name || 'a fish'}!`, fish: caught });
        } catch (e) { socket.emit('fish_result', { success: false, message: e.message }); }
    });

    // ── Card Game (Triple Triad) ─────────────────────────────────
    socket.on('card_game_challenge', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            // Get player's cards
            const [cards] = await db.query(
                `SELECT cc.card_id, gc.name, gc.icon, gc.value_top, gc.value_right, gc.value_bottom, gc.value_left, gc.rarity, gc.element
                 FROM character_cards cc JOIN game_cards gc ON cc.card_id=gc.id WHERE cc.character_id=?`,
                [p.charId]
            );
            if (cards.length < 5) return socket.emit('card_result', { success: false, message: 'Need at least 5 cards to play.' });

            // Create match
            const [result] = await db.query(
                'INSERT INTO game_card_matches (player1_id, npc_opponent, board_size, board_json, status) VALUES (?,?,?,?,?)',
                [p.charId, data.npcName || null, 9, JSON.stringify(new Array(9).fill(null)), 'active']
            );

            socket.emit('card_game_start', {
                matchId: result.insertId,
                playerCards: cards,
                boardSize: 9,
                opponent: data.npcName || 'Player',
                rules: data.rules || [],
            });
        } catch (e) { socket.emit('card_result', { success: false, message: e.message }); }
    });

    socket.on('card_game_place', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const { matchId, cardId, position } = data;
            const [match] = await db.query('SELECT * FROM game_card_matches WHERE id=? AND player1_id=? AND status=?', [matchId, p.charId, 'active']);
            if (!match.length) return;

            const board = typeof match[0].board_json === 'string' ? JSON.parse(match[0].board_json) : match[0].board_json;
            if (position < 0 || position >= board.length || board[position]) return socket.emit('card_result', { success: false, message: 'Invalid position.' });

            // Get card stats
            const [card] = await db.query('SELECT * FROM game_cards WHERE id=?', [cardId]);
            if (!card.length) return;

            // Place card
            board[position] = { cardId, owner: 'player', ...card[0] };

            // Triple Triad flip logic — check adjacent cards
            const size = Math.sqrt(board.length); // 3x3
            const x = position % size, y = Math.floor(position / size);
            const adjacent = [
                { dir: 'top', dx: 0, dy: -1, atk: 'value_top', def: 'value_bottom' },
                { dir: 'right', dx: 1, dy: 0, atk: 'value_right', def: 'value_left' },
                { dir: 'bottom', dx: 0, dy: 1, atk: 'value_bottom', def: 'value_top' },
                { dir: 'left', dx: -1, dy: 0, atk: 'value_left', def: 'value_right' },
            ];
            const flipped = [];
            for (const adj of adjacent) {
                const nx = x + adj.dx, ny = y + adj.dy;
                if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
                const ni = ny * size + nx;
                const neighbor = board[ni];
                if (!neighbor || neighbor.owner === 'player') continue;
                // Compare values
                if (card[0][adj.atk] > neighbor[adj.def]) {
                    board[ni].owner = 'player';
                    flipped.push(ni);
                }
            }

            // AI opponent places a card (simple: random empty spot)
            const emptySpots = board.map((c, i) => c ? -1 : i).filter(i => i >= 0);
            if (emptySpots.length > 0) {
                const [npcCards] = await db.query('SELECT * FROM game_cards WHERE is_active=1 ORDER BY RAND() LIMIT 1');
                if (npcCards.length) {
                    const aiPos = emptySpots[Math.floor(Math.random() * emptySpots.length)];
                    board[aiPos] = { cardId: npcCards[0].id, owner: 'npc', ...npcCards[0] };
                    // AI flip check
                    const ax = aiPos % size, ay = Math.floor(aiPos / size);
                    for (const adj of adjacent) {
                        const nx = ax + adj.dx, ny = ay + adj.dy;
                        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
                        const ni = ny * size + nx;
                        const neighbor = board[ni];
                        if (!neighbor || neighbor.owner === 'npc') continue;
                        if (npcCards[0][adj.atk] > neighbor[adj.def]) {
                            board[ni].owner = 'npc';
                        }
                    }
                }
            }

            // Check if game over (board full)
            const isFull = board.every(c => c !== null);
            let status = 'active';
            if (isFull) {
                const playerCount = board.filter(c => c?.owner === 'player').length;
                const npcCount = board.filter(c => c?.owner === 'npc').length;
                status = playerCount > npcCount ? 'completed' : playerCount < npcCount ? 'completed' : 'draw';
                if (playerCount > npcCount) {
                    // Winner gets a random card
                    const [reward] = await db.query('SELECT id FROM game_cards WHERE is_active=1 ORDER BY RAND() LIMIT 1');
                    if (reward.length) {
                        await db.query('INSERT INTO character_cards (character_id, card_id, obtained_from) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+1',
                            [p.charId, reward[0].id, 'card_game_win']);
                    }
                }
            }

            await db.query('UPDATE game_card_matches SET board_json=?, status=? WHERE id=?', [JSON.stringify(board), status, matchId]);
            socket.emit('card_game_update', { matchId, board, flipped, status, playerScore: board.filter(c => c?.owner === 'player').length });
        } catch (e) { socket.emit('card_result', { success: false, message: e.message }); }
    });

    // ── Gathering System ─────────────────────────────────────────
    socket.on('gather', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const [nodes] = await db.query(
                'SELECT n.*, s.name as skill_name FROM game_gathering_nodes n JOIN game_gathering_skills s ON n.skill_id=s.id WHERE n.map_id=? AND n.x=? AND n.y=? AND n.is_active=1',
                [p.mapId, data.x, data.y]
            );
            if (!nodes.length) return socket.emit('gather_result', { success: false, message: 'Nothing to gather here.' });
            const node = nodes[0];

            // Check skill level
            const [lvlRow] = await db.query('SELECT level, xp FROM character_gathering_levels WHERE character_id=? AND skill_id=?', [p.charId, node.skill_id]);
            const level = lvlRow.length ? lvlRow[0].level : 1;
            if (level < node.min_level) return socket.emit('gather_result', { success: false, message: `Need ${node.skill_name} level ${node.min_level}.` });

            // Check tool requirement
            if (node.tool_item_id) {
                const [tool] = await db.query('SELECT quantity FROM character_items WHERE character_id=? AND item_id=?', [p.charId, node.tool_item_id]);
                if (!tool.length || tool[0].quantity < 1) return socket.emit('gather_result', { success: false, message: 'You need the right tool.' });
            }

            // Roll yield table
            const yields = typeof node.yield_table === 'string' ? JSON.parse(node.yield_table) : (node.yield_table || []);
            const gathered = [];
            for (const y of yields) {
                if (Math.random() * 100 <= (y.chance || 50)) {
                    const qty = y.qty || 1;
                    await db.query('INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+?', [p.charId, y.item_id, qty, qty]);
                    gathered.push({ item_id: y.item_id, qty, name: y.name || `Item #${y.item_id}` });
                }
            }

            // Grant XP
            const xpGain = node.xp_reward || 10;
            await db.query(
                'INSERT INTO character_gathering_levels (character_id, skill_id, level, xp, total_gathered) VALUES (?,?,1,?,1) ON DUPLICATE KEY UPDATE xp=xp+?, total_gathered=total_gathered+1',
                [p.charId, node.skill_id, xpGain, xpGain]
            );

            // Check level up — XP formula from skill or default 100 * level
            if (lvlRow.length) {
                const newXp = lvlRow[0].xp + xpGain;
                let xpNeeded = 100 * level;
                try {
                    const [sk] = await db.query('SELECT xp_formula FROM game_gathering_skills WHERE id=?', [node.skill_id]);
                    if (sk.length && sk[0].xp_formula) {
                        // Safe formula: replace BASE and LEVEL then calculate
                        const formula = String(sk[0].xp_formula).replace(/BASE/g, '100').replace(/LEVEL/g, String(level));
                        // Only allow numbers, operators, and parentheses
                        if (/^[\d\s+\-*/().]+$/.test(formula)) {
                            xpNeeded = Function('"use strict"; return (' + formula + ')')();
                        }
                    }
                } catch {}
                if (newXp >= xpNeeded) {
                    await db.query('UPDATE character_gathering_levels SET level=level+1, xp=xp-? WHERE character_id=? AND skill_id=?', [xpNeeded, p.charId, node.skill_id]);
                    socket.emit('notification', { type: 'success', text: `${node.skill_name} leveled up to ${level + 1}!` });
                }
            }

            socket.emit('gather_result', { success: true, gathered, xp: xpGain, skill: node.skill_name });
        } catch (e) { socket.emit('gather_result', { success: false, message: e.message }); }
    });

    // ── Bank System ─────────────────────────────────────────────
    socket.on('bank_deposit', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const { item_id, quantity } = data;
            if (!quantity || quantity < 1 || !Number.isInteger(quantity)) return;
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                const [inv] = await conn.query('SELECT quantity FROM character_items WHERE character_id=? AND item_id=? FOR UPDATE', [p.charId, item_id]);
                if (!inv.length || inv[0].quantity < quantity) { await conn.rollback(); conn.release(); return socket.emit('bank_result', { success: false, message: 'Not enough items.' }); }
                const [bankCount] = await conn.query('SELECT COUNT(*) as cnt FROM character_bank WHERE character_id=?', [p.charId]);
                const [charRow] = await conn.query('SELECT bank_slots FROM characters WHERE id=?', [p.charId]);
                const maxSlots = charRow.length ? charRow[0].bank_slots : 50;
                if (bankCount[0].cnt >= maxSlots) { await conn.rollback(); conn.release(); return socket.emit('bank_result', { success: false, message: 'Bank is full.' }); }
                await conn.query('UPDATE character_items SET quantity=quantity-? WHERE character_id=? AND item_id=?', [quantity, p.charId, item_id]);
                await conn.query('INSERT INTO character_bank (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+?', [p.charId, item_id, quantity, quantity]);
                await conn.query('DELETE FROM character_items WHERE character_id=? AND item_id=? AND quantity<=0', [p.charId, item_id]);
                await conn.commit();
                conn.release();
            } catch (txErr) { await conn.rollback().catch(() => {}); conn.release(); throw txErr; }
            socket.emit('bank_result', { success: true, action: 'deposit', item_id, quantity });
        } catch (e) { socket.emit('bank_result', { success: false, message: e.message }); }
    });

    socket.on('bank_withdraw', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const { item_id, quantity } = data;
            if (!quantity || quantity < 1 || !Number.isInteger(quantity)) return;
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                const [bank] = await conn.query('SELECT quantity FROM character_bank WHERE character_id=? AND item_id=? FOR UPDATE', [p.charId, item_id]);
                if (!bank.length || bank[0].quantity < quantity) { await conn.rollback(); conn.release(); return socket.emit('bank_result', { success: false, message: 'Not in bank.' }); }
                await conn.query('UPDATE character_bank SET quantity=quantity-? WHERE character_id=? AND item_id=?', [quantity, p.charId, item_id]);
                await conn.query('INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+?', [p.charId, item_id, quantity, quantity]);
                await conn.query('DELETE FROM character_bank WHERE character_id=? AND item_id=? AND quantity<=0', [p.charId, item_id]);
                await conn.commit();
                conn.release();
            } catch (txErr) { await conn.rollback().catch(() => {}); conn.release(); throw txErr; }
            socket.emit('bank_result', { success: true, action: 'withdraw', item_id, quantity });
        } catch (e) { socket.emit('bank_result', { success: false, message: e.message }); }
    });

    // ── Creature Capture ─────────────────────────────────────────
    socket.on('capture_creature', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const { npc_id, capture_item_id } = data;
            // Check capture item in inventory
            const [itemRow] = await db.query('SELECT ci.quantity, gc.catch_rate_bonus FROM character_items ci JOIN game_capture_items gc ON ci.item_id=gc.item_id WHERE ci.character_id=? AND ci.item_id=?', [p.charId, capture_item_id]);
            if (!itemRow.length || itemRow[0].quantity < 1) return socket.emit('capture_result', { success: false, message: 'No capture items.' });

            // Check creature storage limit
            const [creatureCount] = await db.query('SELECT COUNT(*) as cnt FROM character_creatures WHERE character_id=?', [p.charId]);
            // Read storage max from settings
            let creatureStorageMax = 30;
            try { const [sv] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='creature_storage_max'"); if (sv.length) creatureStorageMax = parseInt(sv[0].setting_value) || 30; } catch {}
            if (creatureCount[0].cnt >= creatureStorageMax) return socket.emit('capture_result', { success: false, message: `Creature storage full (${creatureStorageMax} max).` });

            // Calculate catch rate (base 30% + item bonus, modified by target HP%)
            // Read capture rate from settings
            let baseRate = 30;
            try { const [sv] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='capture_base_rate'"); if (sv.length) baseRate = parseInt(sv[0].setting_value) || 30; } catch {}
            const bonus = parseFloat(itemRow[0].catch_rate_bonus) || 1.0;
            const catchChance = Math.min(95, baseRate * bonus);

            // Use the capture item
            await db.query('UPDATE character_items SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [p.charId, capture_item_id]);

            if (Math.random() * 100 > catchChance) {
                return socket.emit('capture_result', { success: false, message: 'The creature broke free!', chance: Math.round(catchChance) });
            }

            // Capture successful
            const [npc] = await db.query('SELECT name, npc_level, base_hp FROM game_npcs WHERE id=?', [npc_id]);
            const npcName = npc.length ? npc[0].name : 'Creature';
            await db.query('INSERT INTO character_creatures (character_id, npc_id, nickname, level, max_hp, current_hp) VALUES (?,?,?,?,?,?)',
                [p.charId, npc_id, npcName, npc[0]?.npc_level || 1, npc[0]?.base_hp || 50, npc[0]?.base_hp || 50]);
            socket.emit('capture_result', { success: true, message: `Captured ${npcName}!`, name: npcName });
        } catch (e) { socket.emit('capture_result', { success: false, message: e.message }); }
    });

    // ── Bounty Board ─────────────────────────────────────────────
    socket.on('bounty_accept', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const [task] = await db.query('SELECT * FROM game_bounty_tasks WHERE id=? AND is_active=1', [data.task_id]);
            if (!task.length) return socket.emit('bounty_result', { success: false, message: 'Task not found.' });
            // Check not already active
            const [existing] = await db.query("SELECT id FROM character_bounties WHERE character_id=? AND task_id=? AND status='active'", [p.charId, data.task_id]);
            if (existing.length) return socket.emit('bounty_result', { success: false, message: 'Already accepted.' });
            await db.query('INSERT INTO character_bounties (character_id, task_id) VALUES (?,?)', [p.charId, data.task_id]);
            socket.emit('bounty_result', { success: true, message: `Accepted: ${task[0].name}` });
        } catch (e) { socket.emit('bounty_result', { success: false, message: e.message }); }
    });

    // =============================================================
    // 7. HOUSING & WORLD
    // =============================================================

    // ── Mount System ─────────────────────────────────────────────
    socket.on('mount_toggle', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            if (data.dismount) {
                await db.query('UPDATE character_mounts SET is_active=0 WHERE character_id=?', [p.charId]);
                socket.emit('mount_result', { success: true, mounted: false });
                return;
            }
            const [mount] = await db.query('SELECT cm.*, gm.name, gm.speed_mult, gm.icon FROM character_mounts cm JOIN game_mounts gm ON cm.mount_id=gm.id WHERE cm.character_id=? AND cm.mount_id=?', [p.charId, data.mount_id]);
            if (!mount.length) return socket.emit('mount_result', { success: false, message: 'Mount not found.' });
            await db.query('UPDATE character_mounts SET is_active=0 WHERE character_id=?', [p.charId]);
            await db.query('UPDATE character_mounts SET is_active=1 WHERE character_id=? AND mount_id=?', [p.charId, data.mount_id]);
            socket.emit('mount_result', { success: true, mounted: true, name: mount[0].name, speed: mount[0].speed_mult, icon: mount[0].icon });
        } catch (e) { socket.emit('mount_result', { success: false, message: e.message }); }
    });

    // ── Housing System ───────────────────────────────────────────
    socket.on('housing_purchase', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const [plot] = await db.query('SELECT * FROM game_housing_plots WHERE id=? AND is_available=1 AND owner_char_id IS NULL', [data.plot_id]);
            if (!plot.length) return socket.emit('housing_result', { success: false, message: 'Plot not available.' });
            const [user] = await db.query('SELECT currency FROM users WHERE id=?', [p.userId]);
            if (!user.length || user[0].currency < plot[0].price) return socket.emit('housing_result', { success: false, message: `Need ${plot[0].price} gold.` });
            await db.query('UPDATE users SET currency=currency-? WHERE id=?', [plot[0].price, p.userId]);
            await db.query('UPDATE game_housing_plots SET owner_char_id=?, is_available=0 WHERE id=?', [p.charId, data.plot_id]);
            await db.query('INSERT INTO character_housing (character_id, plot_id, furniture_json) VALUES (?,?,?)', [p.charId, data.plot_id, '[]']);
            socket.emit('housing_result', { success: true, message: `Purchased plot for ${plot[0].price} gold!` });
        } catch (e) { socket.emit('housing_result', { success: false, message: e.message }); }
    });

    socket.on('housing_place_furniture', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const { plot_id, furniture_id, x, y } = data;
            const [house] = await db.query('SELECT * FROM character_housing WHERE character_id=? AND plot_id=?', [p.charId, plot_id]);
            if (!house.length) return socket.emit('housing_result', { success: false, message: 'Not your house.' });
            // Check furniture in inventory
            const [furn] = await db.query('SELECT * FROM game_furniture WHERE id=?', [furniture_id]);
            if (!furn.length) return;
            const existing = typeof house[0].furniture_json === 'string' ? JSON.parse(house[0].furniture_json) : (house[0].furniture_json || []);
            let maxFurniture = 20;
            try { const [sv] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='housing_max_furniture'"); if (sv.length) maxFurniture = parseInt(sv[0].setting_value) || 20; } catch {}
            if (existing.length >= maxFurniture) return socket.emit('housing_result', { success: false, message: `Max furniture reached (${maxFurniture}).` });
            existing.push({ furniture_id, x, y, name: furn[0].name, icon: furn[0].icon });
            await db.query('UPDATE character_housing SET furniture_json=? WHERE character_id=? AND plot_id=?', [JSON.stringify(existing), p.charId, plot_id]);
            socket.emit('housing_result', { success: true, message: `Placed ${furn[0].name}!` });
        } catch (e) { socket.emit('housing_result', { success: false, message: e.message }); }
    });

    // ── Cutscene System ──────────────────────────────────────────
    socket.on('trigger_cutscene', async (data) => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const [rows] = await db.query('SELECT * FROM game_cutscenes WHERE name=? AND is_active=1 LIMIT 1', [data.name || data.id]);
            if (!rows.length) return;
            const cs = rows[0];
            const seq = typeof cs.sequence_json === 'string' ? JSON.parse(cs.sequence_json) : cs.sequence_json;
            socket.emit('cutscene_play', { id: cs.id, name: cs.name, sequence: seq, skippable: !!cs.is_skippable });
        } catch {}
    });

    // ── NPC Relationship Query ───────────────────────────────────
    socket.on('npc_get_relationships', async (data) => {
        try {
            const [rels] = await db.query(
                `SELECT r.*, a.name as name_a, b.name as name_b
                 FROM game_npc_relationships r
                 JOIN game_npcs a ON r.npc_id_a = a.id
                 JOIN game_npcs b ON r.npc_id_b = b.id
                 WHERE r.npc_id_a = ? OR r.npc_id_b = ?`,
                [data.npcId, data.npcId]
            );
            socket.emit('npc_relationships', { npcId: data.npcId, relationships: rels });
        } catch {}
    });

    // interact_object handler lives in socket-game.js (single source of truth)

    // =============================================================
    // 8. COLLABORATIVE MAP EDITOR
    // =============================================================
    if (!global._mapEditors) global._mapEditors = {}; // { mapId: { socketId: { username, color, cursor } } }

    socket.on('map_editor_join', (data) => {
        const mapId = data?.mapId;
        if (!mapId) return;
        const p = state.onlinePlayers[socket.id];
        const username = p?.name || global._staffPanel?.[socket.id]?.username || 'Admin';
        const colors = ['#ff6b6b','#4ecdc4','#45b7d1','#96ceb4','#ffeaa7','#dda0dd','#98d8c8','#f7dc6f'];
        if (!global._mapEditors[mapId]) global._mapEditors[mapId] = {};
        const editorCount = Object.keys(global._mapEditors[mapId]).length;
        global._mapEditors[mapId][socket.id] = {
            username, color: colors[editorCount % colors.length],
            cursor: null, joinedAt: Date.now()
        };
        socket.join('map_edit_' + mapId);
        socket._editingMapId = mapId;
        // Broadcast editor list to all editors on this map
        io.to('map_edit_' + mapId).emit('map_editor_presence', Object.values(global._mapEditors[mapId]));
    });

    socket.on('map_editor_leave', () => {
        const mapId = socket._editingMapId;
        if (mapId && global._mapEditors?.[mapId]) {
            delete global._mapEditors[mapId][socket.id];
            if (!Object.keys(global._mapEditors[mapId]).length) delete global._mapEditors[mapId];
            else io.to('map_edit_' + mapId).emit('map_editor_presence', Object.values(global._mapEditors[mapId]));
        }
        socket.leave('map_edit_' + mapId);
        delete socket._editingMapId;
    });

    socket.on('map_editor_cursor', (data) => {
        const mapId = socket._editingMapId;
        if (!mapId || !global._mapEditors?.[mapId]?.[socket.id]) return;
        global._mapEditors[mapId][socket.id].cursor = { x: data.x, y: data.y };
        socket.to('map_edit_' + mapId).emit('map_editor_cursor_update', {
            socketId: socket.id,
            username: global._mapEditors[mapId][socket.id].username,
            color: global._mapEditors[mapId][socket.id].color,
            x: data.x, y: data.y
        });
    });

    socket.on('map_editor_tile_change', (data) => {
        const mapId = socket._editingMapId;
        if (!mapId) return;
        // Broadcast tile change to other editors (not back to sender)
        socket.to('map_edit_' + mapId).emit('map_editor_tile_change', {
            layer: data.layer, // 'tiles', 'tilesOverlay', 'tilesFringe', 'passability', 'elevation'
            changes: data.changes, // [{ index, value }]
            username: global._mapEditors?.[mapId]?.[socket.id]?.username || 'Unknown'
        });
    });

    socket.on('map_editor_event_change', (data) => {
        const mapId = socket._editingMapId;
        if (!mapId) return;
        socket.to('map_edit_' + mapId).emit('map_editor_event_change', {
            events: data.events,
            username: global._mapEditors?.[mapId]?.[socket.id]?.username || 'Unknown'
        });
    });

    socket.on('map_editor_object_change', (data) => {
        const mapId = socket._editingMapId;
        if (!mapId) return;
        socket.to('map_edit_' + mapId).emit('map_editor_object_change', {
            objects: data.objects,
            username: global._mapEditors?.[mapId]?.[socket.id]?.username || 'Unknown'
        });
    });
};
