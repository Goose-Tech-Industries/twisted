// =================================================================
// FRIENDS UI  v1.0
// =================================================================
// Teaching: The friends system has two parts:
//   1. REST calls (/api/party/friends/*) that read/write the DB
//   2. Real-time socket events that push notifications without polling
//
// This file handles ONLY the client-side display.
// The backend routes already existed in partyRoutes.js.
//
// Features:
//   - Friends list with online/offline status
//   - Pending incoming requests (accept/decline)
//   - Add friend by name
//   - Block player (from nearby panel or friends list)
//   - One-click DM, invite to party, from friends list
//
// Entry point: FriendsUI.init(charId)
// Toggle panel: FriendsUI.toggle()
// =================================================================

const FriendsUI = {

    // ── State ─────────────────────────────────────────────────────
    charId:   null,
    open:     false,
    tab:      'friends',   // 'friends' | 'requests' | 'add'
    data:     { accepted: [], incoming: [], outgoing: [] },
    _pendingCount: 0,

    // ── Init ──────────────────────────────────────────────────────
    init(charId) {
        FriendsUI.charId = charId;
        FriendsUI._buildButton();
        FriendsUI._bindSocketEvents();
        FriendsUI._refresh(); // load counts for badge
    },

    // ── HUD Button ────────────────────────────────────────────────
    _buildButton() {
        const hud = document.getElementById('hud');
        if (!hud) return;
        const btn = document.createElement('div');
        btn.id = 'friendsHudBtn';
        btn.innerHTML = `👥 <span id="friendsLabel">Friends</span><span id="friendsBadge" style="display:none"></span>`;
        btn.title = 'Friends List';
        btn.onclick = () => FriendsUI.toggle();
        hud.appendChild(btn);
        FriendsUI._injectStyles();
    },

    // ── Toggle ────────────────────────────────────────────────────
    toggle() {
        FriendsUI.open ? FriendsUI.close() : FriendsUI._openPanel();
    },

    close() {
        FriendsUI.open = false;
        const el = document.getElementById('friendsPanel');
        if (el) el.remove();
        document.removeEventListener('click', FriendsUI._outsideClick);
    },

    _openPanel() {
        FriendsUI.open = true;
        FriendsUI._buildPanel();
        FriendsUI._refresh();
        setTimeout(() => document.addEventListener('click', FriendsUI._outsideClick), 50);
    },

    _outsideClick(e) {
        const panel = document.getElementById('friendsPanel');
        const btn   = document.getElementById('friendsHudBtn');
        if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
            FriendsUI.close();
        }
    },

    // ── Build Panel DOM ───────────────────────────────────────────
    _buildPanel() {
        let el = document.getElementById('friendsPanel');
        if (el) el.remove();

        const btn = document.getElementById('friendsHudBtn');
        const hudEl = document.getElementById('hud');
        const hudRect = hudEl ? hudEl.getBoundingClientRect() : { left: 10, bottom: 50 };

        el = document.createElement('div');
        el.id = 'friendsPanel';
        el.style.cssText = `
            position:fixed;left:${hudRect.left}px;top:${hudRect.bottom+8}px;
            width:280px;max-height:420px;background:rgba(5,8,14,0.97);
            border:1px solid rgba(3,218,198,0.2);border-radius:10px;
            z-index:51;color:#e8eef6;font-family:'Courier New',monospace;
            box-shadow:0 4px 24px rgba(0,0,0,0.6);display:flex;flex-direction:column;
        `;
        el.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;
                 padding:10px 14px 8px;border-bottom:1px solid #21262d">
                <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;
                      color:#03dac6;font-weight:bold">👥 Friends</span>
                <button onclick="FriendsUI.close()"
                    style="background:none;border:none;color:#484f58;cursor:pointer;font-size:16px;line-height:1">✕</button>
            </div>
            <div id="friendsTabs" style="display:flex;gap:2px;padding:6px 8px 0;border-bottom:1px solid #21262d">
                <button class="fr-tab active" id="ftab-friends" onclick="FriendsUI.switchTab('friends')">Friends</button>
                <button class="fr-tab" id="ftab-requests" onclick="FriendsUI.switchTab('requests')">
                    Requests <span id="frReqBadge" style="display:none;background:#f85149;color:#fff;
                    border-radius:8px;font-size:9px;padding:0 4px">0</span>
                </button>
                <button class="fr-tab" id="ftab-add" onclick="FriendsUI.switchTab('add')">+ Add</button>
            </div>
            <div id="friendsContent" style="flex:1;overflow-y:auto;padding:8px;scrollbar-width:thin;
                 scrollbar-color:rgba(255,255,255,0.1) transparent">
                <div style="color:#484f58;font-size:12px;text-align:center;padding:20px">Loading…</div>
            </div>`;
        document.body.appendChild(el);
    },

    // ── Tab Switching ─────────────────────────────────────────────
    switchTab(tab) {
        FriendsUI.tab = tab;
        document.querySelectorAll('.fr-tab').forEach(b => b.classList.remove('active'));
        const tabBtn = document.getElementById('ftab-' + tab);
        if (tabBtn) tabBtn.classList.add('active');
        FriendsUI._render();
    },

    // ── Render ────────────────────────────────────────────────────
    _render() {
        const box = document.getElementById('friendsContent');
        if (!box) return;
        if (FriendsUI.tab === 'friends')  { FriendsUI._renderFriends(box);  return; }
        if (FriendsUI.tab === 'requests') { FriendsUI._renderRequests(box); return; }
        if (FriendsUI.tab === 'add')      { FriendsUI._renderAdd(box);      return; }
    },

    _renderFriends(box) {
        const { accepted } = FriendsUI.data;
        if (!accepted.length) {
            box.innerHTML = `<div style="color:#484f58;font-size:12px;text-align:center;padding:20px">
                No friends yet.<br><br>
                <button class="fr-btn fr-btn-add" onclick="FriendsUI.switchTab('add')">+ Add a friend</button>
            </div>`;
            return;
        }

        // Mark online friends
        const onlineIds = new Set(Object.values(
            typeof Game !== 'undefined' ? Game.players : {}
        ).map(p => p.charId));

        // Sort: online first, then alphabetical
        const sorted = [...accepted].sort((a, b) => {
            const ao = onlineIds.has(a.friend_char_id);
            const bo = onlineIds.has(b.friend_char_id);
            if (ao !== bo) return ao ? -1 : 1;
            return a.friend_name.localeCompare(b.friend_name);
        });

        box.innerHTML = sorted.map(f => {
            const online = onlineIds.has(f.friend_char_id);
            return `<div class="fr-row">
                <span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;
                    background:${online ? '#3fb950' : '#30363d'};display:inline-block"></span>
                <span style="flex:1;font-size:13px;font-weight:bold;
                    color:${online ? '#e8eef6' : '#8b949e'}">${FriendsUI._esc(f.friend_name)}</span>
                <div style="display:flex;gap:3px">
                    <button class="fr-btn fr-btn-sm" title="Send DM"
                        onclick="FriendsUI.dm(${f.friend_char_id},'${FriendsUI._esc(f.friend_name)}')">💬</button>
                    ${online ? `<button class="fr-btn fr-btn-sm" title="Invite to party"
                        onclick="FriendsUI.invite(${f.friend_char_id})">⚔️</button>` : ''}
                    <button class="fr-btn fr-btn-sm fr-btn-danger" title="Remove friend"
                        onclick="FriendsUI.remove(${f.friend_char_id},'${FriendsUI._esc(f.friend_name)}')">✕</button>
                </div>
            </div>`;
        }).join('');
    },

    _renderRequests(box) {
        const { incoming, outgoing } = FriendsUI.data;
        if (!incoming.length && !outgoing.length) {
            box.innerHTML = `<div style="color:#484f58;font-size:12px;text-align:center;padding:20px">No pending requests.</div>`;
            return;
        }

        let html = '';
        if (incoming.length) {
            html += `<div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;
                color:#484f58;padding:4px 2px 6px">Incoming</div>`;
            html += incoming.map(r => `
                <div class="fr-row">
                    <span style="flex:1;font-size:13px;color:#c9d1d9">${FriendsUI._esc(r.requester_name)}</span>
                    <div style="display:flex;gap:3px">
                        <button class="fr-btn fr-btn-sm fr-btn-accept"
                            onclick="FriendsUI.accept(${r.requester_id},'${FriendsUI._esc(r.requester_name)}')">✓ Accept</button>
                        <button class="fr-btn fr-btn-sm fr-btn-danger"
                            onclick="FriendsUI.decline(${r.requester_id})">✕</button>
                    </div>
                </div>`).join('');
        }
        if (outgoing.length) {
            html += `<div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;
                color:#484f58;padding:10px 2px 6px">Outgoing (pending)</div>`;
            html += outgoing.map(r => `
                <div class="fr-row">
                    <span style="flex:1;font-size:13px;color:#8b949e">${FriendsUI._esc(r.recipient_name)}</span>
                    <button class="fr-btn fr-btn-sm fr-btn-danger"
                        onclick="FriendsUI.cancel(${r.recipient_id})">Cancel</button>
                </div>`).join('');
        }
        box.innerHTML = html;
    },

    _renderAdd(box) {
        box.innerHTML = `
            <div style="padding:8px 4px">
                <div style="font-size:11px;color:#8b949e;margin-bottom:8px">
                    Enter a player's character name:
                </div>
                <div style="display:flex;gap:6px">
                    <input id="frAddInput" type="text" placeholder="Character name…"
                        style="flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(3,218,198,0.3);
                        color:#e8eef6;padding:6px 10px;border-radius:6px;font-family:'Courier New',monospace;
                        font-size:12px;outline:none"
                        onkeydown="if(event.key==='Enter')FriendsUI.sendRequest()">
                    <button class="fr-btn fr-btn-add" onclick="FriendsUI.sendRequest()">Add</button>
                </div>
                <div id="frAddStatus" style="margin-top:8px;font-size:11px;min-height:16px"></div>
                <div style="margin-top:16px;padding-top:12px;border-top:1px solid #21262d;
                     font-size:10px;color:#484f58">
                    TIP: You can also click any player's name in chat to DM or right-click their character in the Nearby panel.
                </div>
            </div>`;
        setTimeout(() => document.getElementById('frAddInput')?.focus(), 50);
    },

    // ── Actions ───────────────────────────────────────────────────
    async sendRequest() {
        const input  = document.getElementById('frAddInput');
        const status = document.getElementById('frAddStatus');
        const name   = (input?.value || '').trim();
        if (!name) return;

        // Find charId by name
        const players = typeof Game !== 'undefined' ? Object.values(Game.players) : [];
        let targetChar = players.find(p => p.name.toLowerCase() === name.toLowerCase());

        if (!targetChar) {
            // Player offline — need to resolve via API
            // We'll search via nearby or just try the request and let server reject if not found
        }

        // If online, get charId; otherwise let the server search by name
        // We need to add a name-lookup endpoint or search friends by name
        // For now use the online list, fall back to a name lookup
        let targetCharId = targetChar ? targetChar.charId : null;
        if (!targetCharId) {
            // Server will look up by name
            const r = await fetch(`/api/party/friends/find-by-name?name=${encodeURIComponent(name)}`);
            const d = await r.json();
            if (!d.success) {
                if (status) { status.textContent = '❌ Player not found.'; status.style.color = '#f85149'; }
                return;
            }
            targetCharId = d.charId;
        }

        const r = await fetch('/api/party/friends/request', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId: FriendsUI.charId, targetCharId })
        });
        const d = await r.json();
        if (d.success) {
            if (status) { status.textContent = `✅ Request sent to ${d.targetName}.`; status.style.color = '#3fb950'; }
            if (input) input.value = '';
            // Push real-time notification to target if online
            if (typeof Game !== 'undefined' && Game.socket) {
                Game.socket.emit('friend_request_sent', {
                    targetCharId,
                    senderName: typeof Game.myHero !== 'undefined' ? Game.myHero.name : ''
                });
            }
        } else {
            if (status) { status.textContent = '❌ ' + (d.error || d.message); status.style.color = '#f85149'; }
        }
    },

    async accept(requesterId, name) {
        const r = await fetch('/api/party/friends/accept', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId: FriendsUI.charId, requesterId })
        });
        const d = await r.json();
        if (d.success) {
            showNotification(`✅ You are now friends with ${name}!`, 'quest');
            await FriendsUI._refresh();
            FriendsUI._render();
        }
    },

    async decline(targetId) {
        await fetch('/api/party/friends/remove', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId: FriendsUI.charId, targetCharId: targetId })
        });
        await FriendsUI._refresh();
        FriendsUI._render();
    },

    async cancel(targetId) { return FriendsUI.decline(targetId); },

    async remove(targetId, name) {
        if (!confirm(`Remove ${name} from friends?`)) return;
        await fetch('/api/party/friends/remove', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId: FriendsUI.charId, targetCharId: targetId })
        });
        await FriendsUI._refresh();
        FriendsUI._render();
    },

    async block(targetCharId, name) {
        if (!confirm(`Block ${name}? They won't be able to DM you or send friend requests.`)) return;
        await fetch('/api/party/friends/block', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId: FriendsUI.charId, targetCharId })
        });
        showNotification(`🚫 ${name} has been blocked.`, 'info');
        await FriendsUI._refresh();
        FriendsUI._render();
    },

    dm(charId, name) {
        if (typeof ChatUI !== 'undefined') ChatUI.startDM(charId, name);
        FriendsUI.close();
    },

    invite(charId) {
        if (typeof Game !== 'undefined' && Game.socket) {
            Game.socket.emit('party_invite', { targetCharId: charId });
            showNotification('📨 Party invite sent!', 'info');
        }
        FriendsUI.close();
    },

    // ── Data Refresh ──────────────────────────────────────────────
    async _refresh() {
        if (!FriendsUI.charId) return;
        try {
            const r = await fetch(`/api/party/friends/${FriendsUI.charId}`);
            const d = await r.json();
            if (!d.success) return;
            FriendsUI.data = d.data;

            // Update badge
            const pending = d.data.incoming.length;
            FriendsUI._pendingCount = pending;
            const badge   = document.getElementById('friendsBadge');
            const reqBadge = document.getElementById('frReqBadge');
            if (badge) {
                badge.style.display = pending > 0 ? 'inline' : 'none';
                badge.textContent   = pending;
            }
            if (reqBadge) {
                reqBadge.style.display = pending > 0 ? 'inline' : 'none';
                reqBadge.textContent   = pending;
            }
        } catch {}
    },

    // ── Socket Events ─────────────────────────────────────────────
    _bindSocketEvents() {
        const tryBind = () => {
            if (typeof Game === 'undefined' || !Game.socket) { setTimeout(tryBind, 200); return; }

            // Incoming friend request while playing
            Game.socket.on('friend_request_incoming', ({ fromCharId, fromName }) => {
                showNotification(`👥 Friend request from ${fromName}!`, 'quest');
                FriendsUI._refresh();
                if (FriendsUI.open && FriendsUI.tab === 'requests') FriendsUI._render();
            });

            // Someone came online — refresh if panel is open
            Game.socket.on('player_joined', () => {
                if (FriendsUI.open && FriendsUI.tab === 'friends') FriendsUI._renderFriends(
                    document.getElementById('friendsContent')
                );
            });
            Game.socket.on('player_left', () => {
                if (FriendsUI.open && FriendsUI.tab === 'friends') FriendsUI._renderFriends(
                    document.getElementById('friendsContent')
                );
            });
        };
        tryBind();
    },

    // ── Styles ────────────────────────────────────────────────────
    _injectStyles() {
        if (document.getElementById('friendsUIStyles')) return;
        const s = document.createElement('style');
        s.id = 'friendsUIStyles';
        s.textContent = `
        #friendsHudBtn {
            display:inline-flex;align-items:center;gap:5px;
            padding:4px 10px;border-radius:6px;cursor:pointer;
            font-size:12px;color:#8b949e;font-family:'Courier New',monospace;
            transition:.15s;position:relative;
        }
        #friendsHudBtn:hover { color:#03dac6; }
        #friendsBadge {
            background:#f85149;color:#fff;border-radius:8px;
            font-size:9px;padding:0 4px;min-width:14px;text-align:center;
        }
        .fr-tab {
            padding:5px 10px;border-radius:6px 6px 0 0;cursor:pointer;
            font-size:11px;color:#484f58;border:none;background:none;
            font-family:'Courier New',monospace;transition:.12s;
        }
        .fr-tab:hover { color:#8b949e; }
        .fr-tab.active { color:#e8eef6;background:rgba(255,255,255,0.06); }
        .fr-row {
            display:flex;align-items:center;gap:8px;padding:7px 4px;
            border-radius:7px;transition:.12s;
        }
        .fr-row:hover { background:rgba(255,255,255,0.04); }
        .fr-btn {
            padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;
            border:none;font-family:'Courier New',monospace;transition:.12s;
        }
        .fr-btn-sm   { padding:3px 7px;font-size:12px; }
        .fr-btn-add  { background:rgba(3,218,198,0.15);color:#03dac6;border:1px solid rgba(3,218,198,0.3); }
        .fr-btn-add:hover { background:rgba(3,218,198,0.28); }
        .fr-btn-accept { background:rgba(63,185,80,.15);color:#3fb950;border:1px solid rgba(63,185,80,.3); }
        .fr-btn-accept:hover { background:rgba(63,185,80,.28); }
        .fr-btn-danger { background:rgba(248,81,73,.1);color:#f85149;border:1px solid rgba(248,81,73,.25); }
        .fr-btn-danger:hover { background:rgba(248,81,73,.22); }
        `;
        document.head.appendChild(s);
    },

    _esc(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;');
    },
};
