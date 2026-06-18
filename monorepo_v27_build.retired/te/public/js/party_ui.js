// =================================================================
// PARTY UI — Friends list + Party management panel
// =================================================================
// Teaching: This file handles everything the player sees when
// managing their friends and party. The DATA comes from two places:
//
//   1. REST (/api/party/friends/...) — persistent DB data: who you're
//      friends with, pending requests. Works even when offline.
//
//   2. Socket events — real-time: party invites, joins, leaves.
//      These fire instantly because both players are connected.
//
// Socket events emitted TO server:
//   party_invite   { targetCharId }
//   party_accept   { partyId }
//   party_decline  { partyId }
//   party_leave    {}
//   party_kick     { targetCharId }
//
// Socket events received FROM server:
//   party_update   — full party state (or null if disbanded/left)
//   party_invited  — you received an invite
//   party_msg      — party system messages (kick notice, etc.)
//
// Hotkey: [P] opens/closes the panel
// =================================================================

const PartyUI = {

    // ─── STATE ───────────────────────────────────────────────────
    open:    false,
    tab:     'party',        // 'party' | 'friends'
    party:   null,           // current party data from server
    friends: { accepted:[], incoming:[], outgoing:[] },

    // ─── OPEN / CLOSE ────────────────────────────────────────────
    async toggle() {
        PartyUI.open ? PartyUI.close() : await PartyUI.openPanel();
    },

    async openPanel(tab) {
        if (typeof BattleUI !== 'undefined' && BattleUI.active) return;
        if (typeof Panels   !== 'undefined' && Panels.open)     return;
        PartyUI.open = true;
        if (tab) PartyUI.tab = tab;
        if (typeof Game !== 'undefined') Game.dialogueOpen = true;
        PartyUI._buildShell();
        await PartyUI.load();
    },

    close() {
        PartyUI.open = false;
        if (typeof Game !== 'undefined') Game.dialogueOpen = false;
        const el = document.getElementById('partyOverlay');
        if (el) el.remove();
    },

    // ─── DATA LOAD ───────────────────────────────────────────────
    async load() {
        PartyUI._setContent('<div style="text-align:center;padding:30px;color:#484f58">Loading…</div>');
        const charId = typeof Game !== 'undefined' ? Game.myCharId : null;
                if (!charId) return;

        try {
            const [friendsRes, partyRes] = await Promise.all([
                fetch(`/api/party/friends/${charId}`).then(r => r.json()),
                fetch(`/api/party/current/${charId}`).then(r => r.json()),
            ]);
            if (friendsRes.success) PartyUI.friends = friendsRes.data;
            if (partyRes.success)   PartyUI.party   = partyRes.data;
        } catch (e) {
            console.error('Party load error:', e);
        }

        PartyUI.render();
    },

    // ─── RENDER ──────────────────────────────────────────────────
    render() {
        ['party', 'friends'].forEach(t => {
            const btn = document.getElementById('ptab-' + t);
            if (btn) btn.classList.toggle('p-tab-active', t === PartyUI.tab);
        });
        PartyUI.tab === 'party' ? PartyUI._renderParty() : PartyUI._renderFriends();
    },

    // ─── TAB: PARTY ──────────────────────────────────────────────
    _renderParty() {
        const myCharId = typeof Game !== 'undefined' ? Game.myCharId : null;
        const party    = PartyUI.party;

        // Check if there's a pending invite notification
        const inviteNotice = PartyUI._pendingInvite
            ? `<div style="margin-bottom:14px;padding:12px 14px;background:rgba(187,134,252,0.12);
                border:1px solid rgba(187,134,252,0.35);border-radius:8px;">
                <div style="color:#bb86fc;font-weight:bold;margin-bottom:6px">
                    📨 Party Invite from <b>${PartyUI._esc(PartyUI._pendingInvite.inviterName)}</b>
                </div>
                <div style="display:flex;gap:8px">
                    <button class="p-btn p-btn-ok"
                        onclick="PartyUI.acceptInvite(${PartyUI._pendingInvite.partyId})">✅ Accept</button>
                    <button class="p-btn p-btn-danger"
                        onclick="PartyUI.declineInvite(${PartyUI._pendingInvite.partyId})">✕ Decline</button>
                </div>
               </div>`
            : '';

        if (!party) {
            // Not in a party
            PartyUI._setContent(`
                ${inviteNotice}
                <div style="text-align:center;padding:40px;color:#484f58">
                    <div style="font-size:44px;margin-bottom:14px">⚔️</div>
                    <div style="font-size:15px">You're not in a party.</div>
                    <div style="font-size:12px;margin-top:8px;color:#30363d">
                        Invite a friend from the <b style="color:#8b949e">Friends</b> tab, or accept an invite above.
                    </div>
                </div>`);
            return;
        }

        const isLeader = party.party?.leader_id === myCharId;
        const members  = party.members || [];

        const memberRows = members.map(m => {
            const isMe = m.char_id === myCharId;
            const isPartyLeader = m.char_id === party.party?.leader_id;
            return `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;
                 background:rgba(255,255,255,0.03);border:1px solid #21262d;border-radius:7px;margin-bottom:6px">
                <div style="flex:1">
                    <div style="display:flex;align-items:center;gap:6px">
                        <span style="font-weight:bold;color:${isMe ? '#ffcc00' : '#c9d1d9'}">${PartyUI._esc(m.name)}</span>
                        ${isPartyLeader ? '<span style="color:#f39c12;font-size:10px">👑 Leader</span>' : ''}
                        ${isMe ? '<span style="color:#484f58;font-size:10px">(you)</span>' : ''}
                    </div>
                    <div style="color:#484f58;font-size:11px">Lv.${m.level} ${m.class_name ? '· ' + PartyUI._esc(m.class_name) : ''}</div>
                </div>
                ${!isMe && isLeader
                    ? `<button class="p-btn p-btn-danger" style="font-size:11px;padding:4px 10px"
                           onclick="PartyUI.kick(${m.char_id})">Kick</button>`
                    : ''}
                ${isMe && !isPartyLeader
                    ? `<button class="p-btn p-btn-danger" style="font-size:11px;padding:4px 10px"
                           onclick="PartyUI.leave()">Leave</button>`
                    : ''}
            </div>`;
        }).join('');

        PartyUI._setContent(`
            ${inviteNotice}
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                <div style="font-size:14px;font-weight:bold;color:#e8eef6">
                    Party (${members.length}/4)
                </div>
                ${isLeader
                    ? `<button class="p-btn p-btn-danger" style="margin-left:auto;font-size:11px;padding:4px 12px"
                           onclick="PartyUI.leave()">Disband</button>`
                    : `<button class="p-btn p-btn-danger" style="margin-left:auto;font-size:11px;padding:4px 12px"
                           onclick="PartyUI.leave()">Leave Party</button>`}
            </div>
            ${memberRows}
            ${members.length < 4
                ? `<div style="color:#484f58;font-size:11px;margin-top:10px;text-align:center">
                       Invite friends from the Friends tab to fill remaining ${4 - members.length} slot(s).
                   </div>`
                : ''}`);
    },

    // ─── TAB: FRIENDS ────────────────────────────────────────────
    _renderFriends() {
        const myCharId  = typeof Game !== 'undefined' ? Game.myCharId : null;
        const { accepted, incoming, outgoing } = PartyUI.friends;

        // Online status from Game.players
        const onlineIds = new Set(Object.values(
            (typeof Game !== 'undefined' && Game.players) ? Game.players : {}
        ).map(p => p.charId));

        let html = '';

        // ── Search / Add ─────────────────────────────────────────
        html += `
        <div style="display:flex;gap:6px;margin-bottom:16px">
            <input id="friendSearch" type="text" placeholder="Search by character name…"
                   style="flex:1;background:rgba(255,255,255,0.05);border:1px solid #30363d;color:#e8eef6;
                          padding:8px 10px;border-radius:7px;font-family:inherit;font-size:12px;outline:none"
                   onkeydown="if(event.key==='Enter')PartyUI.sendRequest()" />
            <button class="p-btn p-btn-ok" onclick="PartyUI.sendRequest()">Add Friend</button>
        </div>`;

        // ── Incoming requests ─────────────────────────────────────
        if (incoming.length) {
            html += `<div class="p-sect">Incoming Requests (${incoming.length})</div>`;
            html += incoming.map(r => `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;
                 background:rgba(187,134,252,0.07);border:1px solid rgba(187,134,252,0.2);
                 border-radius:7px;margin-bottom:5px">
                <span style="color:#bb86fc;font-weight:bold;flex:1">${PartyUI._esc(r.requester_name)}</span>
                <button class="p-btn p-btn-ok" style="font-size:11px;padding:4px 10px"
                    onclick="PartyUI.acceptRequest(${r.requester_id})">Accept</button>
                <button class="p-btn p-btn-danger" style="font-size:11px;padding:4px 10px"
                    onclick="PartyUI.declineRequest(${r.requester_id})">Decline</button>
            </div>`).join('');
        }

        // ── Accepted friends ─────────────────────────────────────
        html += `<div class="p-sect">Friends (${accepted.length})</div>`;
        if (!accepted.length) {
            html += `<div style="color:#484f58;font-size:12px;padding:16px 0;text-align:center">
                No friends yet. Search for a character name above to add one!
            </div>`;
        } else {
            const inParty = PartyUI.party?.members?.map(m => m.char_id) || [];
            html += accepted.map(f => {
                const online     = onlineIds.has(f.friend_char_id);
                const alrInParty = inParty.includes(f.friend_char_id);
                return `
                <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;
                     background:rgba(255,255,255,0.03);border:1px solid #21262d;border-radius:7px;margin-bottom:5px">
                    <div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;
                         background:${online ? '#3fb950' : '#484f58'}" title="${online ? 'Online' : 'Offline'}"></div>
                    <div style="flex:1">
                        <span style="font-weight:bold;color:#c9d1d9">${PartyUI._esc(f.friend_name)}</span>
                        <span style="color:#484f58;font-size:10px;margin-left:6px">${online ? 'online' : 'offline'}</span>
                    </div>
                    ${online && !alrInParty
                        ? `<button class="p-btn p-btn-ok" style="font-size:11px;padding:4px 10px"
                               onclick="PartyUI.inviteToParty(${f.friend_char_id})">Invite to Party</button>`
                        : ''}
                    ${alrInParty
                        ? `<span style="color:#3fb950;font-size:10px">In Party</span>` : ''}
                    ${online
                        ? `<button class="p-btn" style="font-size:11px;padding:4px 10px;
                               background:rgba(46,134,193,0.1);border:1px solid rgba(46,134,193,0.3);color:#2e86c1"
                               onclick="if(typeof ChatUI!=='undefined')ChatUI.startDM(${f.friend_char_id},'${PartyUI._esc(f.friend_name)}');PartyUI.close()">DM</button>`
                        : ''}
                    <button class="p-btn p-btn-danger" style="font-size:11px;padding:4px 8px"
                        onclick="PartyUI.removeFriend(${f.friend_char_id})">✕</button>
                </div>`;
            }).join('');
        }

        // ── Outgoing requests ─────────────────────────────────────
        if (outgoing.length) {
            html += `<div class="p-sect" style="margin-top:14px">Pending Sent (${outgoing.length})</div>`;
            html += outgoing.map(r => `
            <div style="display:flex;align-items:center;gap:8px;padding:7px 12px;
                 background:rgba(255,255,255,0.02);border:1px solid #21262d;border-radius:7px;margin-bottom:5px">
                <span style="color:#8b949e;flex:1">${PartyUI._esc(r.recipient_name)}</span>
                <span style="color:#484f58;font-size:10px">pending…</span>
                <button class="p-btn p-btn-danger" style="font-size:11px;padding:4px 8px"
                    onclick="PartyUI.cancelRequest(${r.recipient_id})">Cancel</button>
            </div>`).join('');
        }

        PartyUI._setContent(html);
    },

    // ─── ACTIONS ─────────────────────────────────────────────────
    async sendRequest() {
        const input = document.getElementById('friendSearch');
        const name  = (input?.value || '').trim();
        if (!name) return;

        // Search by character name on server
        const charId = typeof Game !== 'undefined' ? Game.myCharId : null;
        
        // First find the character ID by name
        try {
            const searchRes = await fetch('/get-char-by-name', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            }).then(r => r.json());

            if (!searchRes.success) {
                PartyUI._toast(`Character "${name}" not found.`, 'damage'); return;
            }

            const targetCharId = searchRes.charId;
            const res = await fetch('/api/party/friends/request', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ charId, targetCharId })
            }).then(r => r.json());

            if (res.success) {
                PartyUI._toast(`Friend request sent to ${res.targetName}!`, 'item');
                if (input) input.value = '';
                await PartyUI.load();
            } else {
                PartyUI._toast(res.error || 'Could not send request', 'damage');
            }
        } catch (e) {
            PartyUI._toast('Error searching for player', 'damage');
        }
    },

    async acceptRequest(requesterId) {
        const charId = typeof Game !== 'undefined' ? Game.myCharId : null;
                const res = await fetch('/api/party/friends/accept', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId, requesterId })
        }).then(r => r.json());
        PartyUI._toast(res.success ? `Friends with ${res.requesterName}!` : (res.error || 'Error'), res.success ? 'item' : 'damage');
        if (res.success) await PartyUI.load();
    },

    async declineRequest(requesterId) {
        const charId = typeof Game !== 'undefined' ? Game.myCharId : null;
                await fetch('/api/party/friends/remove', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId, targetCharId: requesterId })
        });
        await PartyUI.load();
    },

    async cancelRequest(targetCharId) {
        await PartyUI.declineRequest(targetCharId);
    },

    async removeFriend(targetCharId) {
        if (!confirm('Remove this friend?')) return;
        const charId = typeof Game !== 'undefined' ? Game.myCharId : null;
                await fetch('/api/party/friends/remove', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId, targetCharId })
        });
        PartyUI._toast('Friend removed.', 'damage');
        await PartyUI.load();
    },

    inviteToParty(targetCharId) {
        if (typeof Game !== 'undefined') {
            Game.socket.emit('party_invite', { targetCharId });
        }
        PartyUI._toast('Party invite sent!', 'item');
    },

    acceptInvite(partyId) {
        if (typeof Game !== 'undefined') {
            Game.socket.emit('party_accept', { partyId });
        }
        PartyUI._pendingInvite = null;
        PartyUI.tab = 'party';
        PartyUI.render();
    },

    declineInvite(partyId) {
        if (typeof Game !== 'undefined') {
            Game.socket.emit('party_decline', { partyId });
        }
        PartyUI._pendingInvite = null;
        PartyUI.render();
    },

    leave() {
        if (!confirm('Leave the party?')) return;
        if (typeof Game !== 'undefined') {
            Game.socket.emit('party_leave');
        }
        PartyUI.party = null;
        PartyUI.render();
    },

    kick(targetCharId) {
        if (!confirm('Kick this player?')) return;
        if (typeof Game !== 'undefined') {
            Game.socket.emit('party_kick', { targetCharId });
        }
    },

    // ─── SOCKET EVENT WIRING ─────────────────────────────────────
    // Teaching: Call this once after Game.socket is available.
    // We wire socket events here so the party panel reacts in real-time.
    initSockets() {
        const tryBind = () => {
            if (typeof Game === 'undefined' || !Game.socket) { setTimeout(tryBind, 100); return; }

            // Server sends full party state whenever it changes
            Game.socket.on('party_update', (party) => {
                PartyUI.party = party;
                // Update minimap party colors
                if (typeof MinimapUI !== 'undefined') MinimapUI.partyIds = party
                    ? party.members.map(m => m.charId || m.char_id).filter(Boolean)
                    : [];
                // Re-render if panel is open on party tab
                if (PartyUI.open && PartyUI.tab === 'party') PartyUI._renderParty();
                // Update party chat: if we have a party, enable the tab
                if (typeof ChatUI !== 'undefined') {
                    // Refresh the tab — party is now real
                }
            });

            // Someone invited us to a party
            Game.socket.on('party_invited', (data) => {
                PartyUI._pendingInvite = data;
                // Show toast with quick accept/decline
                PartyUI._toastInvite(data);
                // If panel is open on party tab, refresh to show invite
                if (PartyUI.open && PartyUI.tab === 'party') PartyUI._renderParty();
            });

            // Party system messages
            Game.socket.on('party_msg', ({ text, type }) => {
                PartyUI._toast(text, type === 'error' ? 'damage' : 'item');
            });
        };
        tryBind();
    },

    _toastInvite(data) {
        const n = document.createElement('div');
        n.style.cssText = `position:fixed;top:80px;right:20px;background:rgba(5,8,14,0.95);
            border:1px solid rgba(187,134,252,0.5);border-radius:10px;padding:12px 16px;z-index:200;color:#e8eef6;font-size:13px;`;
        n.innerHTML = `<div style="color:#bb86fc;font-weight:bold;margin-bottom:8px">📨 Party Invite from <b>${PartyUI._esc(data.inviterName)}</b></div>
            <div style="display:flex;gap:8px">
                <button onclick="PartyUI.acceptInvite(${data.partyId});this.closest('div[style]').remove()"
                    style="padding:5px 14px;background:rgba(63,185,80,0.2);border:1px solid #3fb950;color:#3fb950;
                    cursor:pointer;border-radius:6px;font-size:12px">Accept</button>
                <button onclick="PartyUI.declineInvite(${data.partyId});this.closest('div[style]').remove()"
                    style="padding:5px 14px;background:rgba(248,81,73,0.1);border:1px solid #f85149;color:#f85149;
                    cursor:pointer;border-radius:6px;font-size:12px">Decline</button>
            </div>`;
        document.body.appendChild(n);
        setTimeout(() => { if (n.parentNode) n.remove(); }, 12000);
    },

    // ─── DOM SHELL ───────────────────────────────────────────────
    _buildShell() {
        let el = document.getElementById('partyOverlay');
        if (el) el.remove();
        el = document.createElement('div');
        el.id = 'partyOverlay';
        el.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;z-index:120;
            background:rgba(0,0,0,0.92);overflow-y:auto;padding:30px;color:#e8eef6;`;

        el.innerHTML = `
            ${PartyUI._styles()}
            <div style="max-width:620px;margin:0 auto">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;
                     border-bottom:1px solid #21262d;padding-bottom:14px">
                    <span style="font-size:24px">⚔️</span>
                    <h1 style="margin:0;font-size:20px;color:#bb86fc;letter-spacing:1px;font-family:'Courier New',monospace">PARTY & FRIENDS</h1>
                    <div style="margin-left:auto;display:flex;gap:6px">
                        <button id="ptab-party"   class="p-tab" onclick="PartyUI.tab='party';PartyUI.render()">⚔️ Party</button>
                        <button id="ptab-friends" class="p-tab" onclick="PartyUI.tab='friends';PartyUI.render()">💚 Friends</button>
                    </div>
                    <button onclick="PartyUI.close()" class="p-close-btn">[P] Close</button>
                </div>
                <div id="partyContent">
                    <div style="text-align:center;padding:30px;color:#484f58">Loading…</div>
                </div>
            </div>`;
        document.body.appendChild(el);
    },

    _styles() {
        if (document.getElementById('partyStyles')) return '';
        const s = document.createElement('style');
        s.id = 'partyStyles';
        s.textContent = `
        .p-tab {
            background: rgba(255,255,255,0.04); border: 1px solid #30363d;
            color: #8b949e; padding: 7px 14px; cursor: pointer;
            border-radius: 7px; font-family: 'Courier New',monospace; font-size: 12px; transition: .15s;
        }
        .p-tab:hover { color: #e8eef6; background: rgba(255,255,255,0.08); }
        .p-tab.p-tab-active { background: rgba(187,134,252,0.15); border-color: rgba(187,134,252,0.4); color: #bb86fc; }
        .p-close-btn {
            background: transparent; border: 1px solid #484f58; color: #8b949e;
            padding: 6px 12px; cursor: pointer; border-radius: 7px;
            font-family: 'Courier New',monospace; font-size: 12px; transition: .15s;
        }
        .p-close-btn:hover { border-color: #f85149; color: #f85149; }
        .p-sect {
            color: #bb86fc; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
            margin: 6px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #21262d;
            font-family: 'Courier New',monospace;
        }
        .p-btn {
            padding: 6px 14px; border-radius: 7px; cursor: pointer;
            font-family: 'Courier New',monospace; font-size: 12px; font-weight: 600; transition: .15s;
        }
        .p-btn-ok     { background: rgba(63,185,80,0.12); border: 1px solid rgba(63,185,80,0.35); color: #3fb950; }
        .p-btn-ok:hover { background: rgba(63,185,80,0.25); }
        .p-btn-danger { background: rgba(248,81,73,0.1); border: 1px solid rgba(248,81,73,0.28); color: #f85149; }
        .p-btn-danger:hover { background: rgba(248,81,73,0.2); }`;
        document.head.appendChild(s);
        return '';
    },

    switchTab(tab) {
        PartyUI.tab = tab;
        PartyUI.render();
    },

    _setContent(html) {
        const el = document.getElementById('partyContent');
        if (el) el.innerHTML = html;
    },

    _toast(text, type) {
        if (typeof showNotification === 'function') showNotification(text, type);
    },

    _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;'); },
};
