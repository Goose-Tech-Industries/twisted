// =================================================================
// GUILD UI — Guild management panel
// =================================================================
// Teaching: Guilds are like parties but permanent and larger.
// - A guild persists in the DB even when all members log off.
// - Real-time events (invite, accept, chat) go through sockets.
// - Persistent data (create, search, member list) uses REST.
//
// This panel has 4 tabs:
//   My Guild   — your current guild info + member roster
//   Roster     — member management (promote, demote, kick)
//   Search     — find and apply to other guilds
//   Invites    — pending invitations you've received
//
// Socket events emitted:
//   guild_invite   { targetCharId }
//   guild_accept   { guildId }
//   guild_decline  { guildId }
//   guild_leave    {}
//   guild_kick     { targetCharId }
//   guild_set_rank { targetCharId, rank }
//
// Socket events received:
//   guild_joined   { guildId, guildName, rank }
//   guild_left     {}
//   guild_invited  { guildId, guildName, inviterName }
//   guild_msg      { text, type }
//
// REST (via /api/guild):
//   GET  /my/:charId/:userId
//   GET  /search?q=name
//   POST /create
//   POST /disband
// =================================================================

const GuildUI = {

    // ─── STATE ───────────────────────────────────────────────────
    open:         false,
    tab:          'my',         // 'my' | 'roster' | 'search' | 'invites'
    guild:        null,         // my guild object (or null)
    members:      [],           // guild member list
    invites:      [],           // pending invites I received
    myRank:       null,         // 'LEADER' | 'OFFICER' | 'MEMBER'
    _pendingInvite: null,

    // ─── OPEN / CLOSE ────────────────────────────────────────────
    async toggle() {
        GuildUI.open ? GuildUI.close() : await GuildUI.openPanel();
    },

    async openPanel(tab) {
        if (typeof BattleUI !== 'undefined' && BattleUI.active) return;
        GuildUI.open = true;
        if (tab) GuildUI.tab = tab;
        if (typeof Game !== 'undefined') Game.dialogueOpen = true;
        GuildUI._buildShell();
        await GuildUI.load();
    },

    close() {
        GuildUI.open = false;
        if (typeof Game !== 'undefined') Game.dialogueOpen = false;
        const el = document.getElementById('guildOverlay');
        if (el) el.remove();
    },

    // ─── DATA LOAD ───────────────────────────────────────────────
    async load() {
        GuildUI._setContent('<div style="text-align:center;padding:40px;color:#484f58">Loading…</div>');
        const charId = typeof Game !== 'undefined' ? Game.myCharId : null;
                if (!charId) return;

        try {
            const res = await fetch(`/api/guild/my/${charId}`).then(r => r.json());
            if (res.success && res.data) {
                GuildUI.guild   = res.data.guild;
                GuildUI.members = res.data.members || [];
                GuildUI.invites = res.data.pendingInvites || [];
                const me = GuildUI.members.find(m => m.char_id === charId);
                GuildUI.myRank  = me ? me.rank : null;
            } else {
                GuildUI.guild   = null;
                GuildUI.members = [];
                GuildUI.myRank  = null;
                // Still fetch pending invites
                const invRes = await fetch(`/api/guild/my/${charId}`).then(r => r.json());
                if (invRes.success && invRes.data) GuildUI.invites = invRes.data.pendingInvites || [];
            }
        } catch (e) {
            console.error('Guild load error:', e);
        }

        GuildUI.render();
    },

    // ─── RENDER DISPATCH ─────────────────────────────────────────
    render() {
        const tabs = ['my', 'roster', 'news', 'search', 'invites'];
        tabs.forEach(t => {
            const btn = document.getElementById('gtab-' + t);
            if (btn) {
                btn.classList.toggle('g-tab-active', t === GuildUI.tab);
                // Badge for invites
                if (t === 'invites' && GuildUI.invites.length) {
                    btn.textContent = `📨 Invites (${GuildUI.invites.length})`;
                }
            }
        });
        switch (GuildUI.tab) {
            case 'my':      return GuildUI._renderMy();
            case 'roster':  return GuildUI._renderRoster();
            case 'news':    return GuildUI._renderNews();
            case 'search':  return GuildUI._renderSearch();
            case 'invites': return GuildUI._renderInvites();
        }
    },

    // ─── TAB: MY GUILD ───────────────────────────────────────────
    _renderMy() {
        const invite = GuildUI._pendingInvite
            ? `<div style="margin-bottom:14px;padding:12px 14px;
               background:rgba(243,156,18,0.1);border:1px solid rgba(243,156,18,0.3);border-radius:8px">
               <div style="color:#f39c12;font-weight:bold;margin-bottom:8px">
                   📨 Guild invite from <b>${GuildUI._esc(GuildUI._pendingInvite.inviterName)}</b>
                   of <b>${GuildUI._esc(GuildUI._pendingInvite.guildName)}</b>
               </div>
               <div style="display:flex;gap:8px">
                   <button class="g-btn g-btn-ok" onclick="GuildUI.acceptInvite(${GuildUI._pendingInvite.guildId})">✅ Accept</button>
                   <button class="g-btn g-btn-danger" onclick="GuildUI.declineInvite(${GuildUI._pendingInvite.guildId})">✕ Decline</button>
               </div></div>` : '';

        if (!GuildUI.guild) {
            GuildUI._setContent(`
                ${invite}
                <div style="text-align:center;padding:40px;color:#484f58">
                    <div style="font-size:44px;margin-bottom:14px">🏰</div>
                    <div style="font-size:15px">You're not in a guild.</div>
                    <div style="font-size:12px;margin-top:8px;color:#30363d">
                        Search for a guild in the <b style="color:#8b949e">Search</b> tab, or create your own below.
                    </div>
                    <div style="margin-top:24px;padding:16px;background:rgba(255,255,255,0.03);
                         border:1px solid #21262d;border-radius:8px;text-align:left">
                        <div class="g-sect">Create a Guild</div>
                        <input id="guildName" placeholder="Guild Name (2-64 chars)" class="g-input" style="width:100%;margin-bottom:8px"/>
                        <div style="display:flex;gap:8px;margin-bottom:8px">
                            <input id="guildTag" placeholder="[TAG] (2-6 chars)" class="g-input" style="width:100px"/>
                            <input id="guildEmblem" placeholder="Emblem 🔥" class="g-input" style="width:90px"/>
                        </div>
                        <input id="guildDesc" placeholder="Description (optional)" class="g-input" style="width:100%;margin-bottom:12px"/>
                        <button class="g-btn g-btn-ok" onclick="GuildUI.createGuild()" style="width:100%">⚔️ Found Guild</button>
                    </div>
                </div>`);
            return;
        }

        const g = GuildUI.guild;
        const isLeader = GuildUI.myRank === 'LEADER';
        const memberCount = GuildUI.members.length;

        GuildUI._setContent(`
            ${invite}
            <div style="background:rgba(255,255,255,0.03);border:1px solid #21262d;border-radius:10px;padding:16px;margin-bottom:14px">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
                    <div style="font-size:36px">${GuildUI._esc(g.emblem || '⚔️')}</div>
                    <div style="flex:1">
                        <div style="font-size:18px;font-weight:bold;color:#f39c12">${GuildUI._esc(g.name)}</div>
                        <div style="color:#484f58;font-size:12px">[${GuildUI._esc(g.tag)}] · ${memberCount}/${g.max_members} members</div>
                    </div>
                    <div style="text-align:right">
                        <div style="color:#bb86fc;font-size:12px;font-weight:bold">${GuildUI.myRank}</div>
                    </div>
                </div>
                ${g.description ? `<div style="color:#8b949e;font-size:12px;border-top:1px solid #21262d;padding-top:8px">${GuildUI._esc(g.description)}</div>` : ''}
            </div>
            <div class="g-sect">Officers & Leader</div>
            ${GuildUI.members.filter(m => m.rank !== 'MEMBER').map(m => GuildUI._memberRow(m, false)).join('') || '<div style="color:#484f58;font-size:12px">No officers yet.</div>'}
            <div class="g-sect" style="margin-top:12px">Members</div>
            ${GuildUI.members.filter(m => m.rank === 'MEMBER').slice(0, 10).map(m => GuildUI._memberRow(m, false)).join('') || '<div style="color:#484f58;font-size:12px">No members yet.</div>'}
            ${GuildUI.members.filter(m => m.rank === 'MEMBER').length > 10
                ? `<div style="color:#484f58;font-size:11px;text-align:center;margin-top:6px">+${GuildUI.members.filter(m => m.rank === 'MEMBER').length - 10} more — see Roster tab</div>` : ''}
            <div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
                <button class="g-btn" style="color:#ffaa00;border-color:#ffaa0044"
                    onclick="GuildBankUI.open(${GuildUI.guild.id})">🏦 Bank</button>
                ${isLeader
                    ? `<button class="g-btn g-btn-danger" onclick="GuildUI.disband()">💀 Disband</button>`
                    : `<button class="g-btn g-btn-danger" onclick="GuildUI.leave()">🚪 Leave Guild</button>`}
            </div>`);
    },

    // ─── TAB: NEWS ───────────────────────────────────────────────
    _renderNews() {
        if (!GuildUI.guild) return;
        // TEACHING: We set the innerHTML first so the container exists in the DOM,
        // then call loadForGuild which fetches posts and calls render() with the container.
        GuildUI._setContent(`
        <div style="padding:4px 0">
            <div id="guildNewsContainer" style="min-height:100px">
                <div style="color:#484f58;font-size:12px;padding:20px;text-align:center">Loading feed…</div>
            </div>
        </div>`);

        if (typeof GuildNewsUI === 'undefined') return;
        GuildNewsUI.injectStyles();
        const myCharId = typeof Game !== 'undefined' ? Game.myCharId : null;
        const myRank   = GuildUI.myRank || 'MEMBER';

        // If same guild already loaded, just render immediately
        if (GuildNewsUI.guildId === GuildUI.guild.id) {
            GuildNewsUI.myCharId = myCharId;
            GuildNewsUI.myRank   = myRank;
            const container = document.getElementById('guildNewsContainer');
            if (container) GuildNewsUI.render(container);
            return;
        }

        // Otherwise fetch fresh data
        GuildNewsUI.loadForGuild(GuildUI.guild.id, myCharId, myRank).then(() => {
            const container = document.getElementById('guildNewsContainer');
            if (container) GuildNewsUI.render(container);
        });
    },

    // ─── TAB: ROSTER ─────────────────────────────────────────────
    _renderRoster() {
        if (!GuildUI.guild) {
            GuildUI.tab = 'my';
            return GuildUI._renderMy();
        }
        const canManage = ['LEADER', 'OFFICER'].includes(GuildUI.myRank);
        GuildUI._setContent(`
            <div class="g-sect">${GuildUI._esc(GuildUI.guild.name)} — Full Roster (${GuildUI.members.length})</div>
            ${GuildUI.members.map(m => GuildUI._memberRow(m, canManage)).join('')}
            ${canManage
                ? `<div style="margin-top:14px;display:flex;gap:8px">
                       <input id="inviteByName" class="g-input" placeholder="Character name to invite…" style="flex:1"/>
                       <button class="g-btn g-btn-ok" onclick="GuildUI.inviteByName()">Invite</button>
                   </div>` : ''}`);
    },

    _memberRow(m, showActions) {
        const myCharId  = typeof Game !== 'undefined' ? Game.myCharId : null;
        const isMe      = m.char_id === myCharId;
        const isLeader  = GuildUI.myRank === 'LEADER';
        const rankColor = { LEADER: '#f39c12', OFFICER: '#bb86fc', MEMBER: '#8b949e' }[m.rank] || '#8b949e';

        return `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;
             background:rgba(255,255,255,0.03);border:1px solid #21262d;border-radius:7px;margin-bottom:5px">
            <div style="flex:1">
                <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-weight:bold;color:${isMe ? '#ffcc00' : '#c9d1d9'}">${GuildUI._esc(m.name)}</span>
                    ${isMe ? '<span style="color:#484f58;font-size:10px">(you)</span>' : ''}
                </div>
                <div style="color:#484f58;font-size:11px">Lv.${m.level} ${m.class_name ? '· ' + GuildUI._esc(m.class_name) : ''}</div>
            </div>
            <div style="color:${rankColor};font-size:11px;font-weight:bold">${m.rank}</div>
            ${showActions && !isMe ? `
                <div style="display:flex;gap:4px">
                    ${isLeader && m.rank === 'MEMBER'
                        ? `<button class="g-btn" style="font-size:10px;padding:3px 8px;background:rgba(187,134,252,0.1);border:1px solid rgba(187,134,252,0.3);color:#bb86fc"
                               onclick="GuildUI.setRank(${m.char_id},'OFFICER')">↑ Officer</button>` : ''}
                    ${isLeader && m.rank === 'OFFICER'
                        ? `<button class="g-btn" style="font-size:10px;padding:3px 8px;background:rgba(255,255,255,0.05);border:1px solid #30363d;color:#8b949e"
                               onclick="GuildUI.setRank(${m.char_id},'MEMBER')">↓ Member</button>` : ''}
                    <button class="g-btn g-btn-danger" style="font-size:10px;padding:3px 8px"
                        onclick="GuildUI.kick(${m.char_id},'${GuildUI._esc(m.name)}')">Kick</button>
                </div>` : ''}
        </div>`;
    },

    // ─── TAB: SEARCH ─────────────────────────────────────────────
    async _renderSearch() {
        GuildUI._setContent(`
            <div style="display:flex;gap:6px;margin-bottom:14px">
                <input id="guildSearchInput" class="g-input" placeholder="Search guild name or [TAG]…" style="flex:1"
                    onkeydown="if(event.key==='Enter')GuildUI.searchGuilds()"/>
                <button class="g-btn g-btn-ok" onclick="GuildUI.searchGuilds()">Search</button>
            </div>
            <div id="guildSearchResults">
                <div style="color:#484f58;font-size:12px;text-align:center;padding:30px">Search above to find guilds.</div>
            </div>`);
        await GuildUI.searchGuilds('');
    },

    async searchGuilds(q) {
        const query = q !== undefined ? q : (document.getElementById('guildSearchInput')?.value?.trim() || '');
        const resultsEl = document.getElementById('guildSearchResults');
        if (!resultsEl) return;
        resultsEl.innerHTML = '<div style="color:#484f58;text-align:center;padding:20px">Searching…</div>';
        try {
            const res = await fetch(`/api/guild/search?q=${encodeURIComponent(query)}`).then(r => r.json());
            if (!res.success || !res.data.length) {
                resultsEl.innerHTML = '<div style="color:#484f58;text-align:center;padding:30px">No guilds found.</div>';
                return;
            }
            resultsEl.innerHTML = res.data.map(g => `
                <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;
                     background:rgba(255,255,255,0.03);border:1px solid #21262d;border-radius:8px;margin-bottom:6px">
                    <div style="font-size:28px">${GuildUI._esc(g.emblem || '⚔️')}</div>
                    <div style="flex:1">
                        <div style="font-weight:bold;color:#f39c12">${GuildUI._esc(g.name)}
                            <span style="color:#484f58;font-size:11px;font-weight:normal">[${GuildUI._esc(g.tag)}]</span></div>
                        ${g.description ? `<div style="color:#8b949e;font-size:11px">${GuildUI._esc(g.description)}</div>` : ''}
                        <div style="color:#484f58;font-size:10px">${g.member_count} members</div>
                    </div>
                    ${!GuildUI.guild
                        ? `<button class="g-btn g-btn-ok" style="font-size:11px;padding:4px 12px">Apply</button>`
                        : '<span style="color:#484f58;font-size:10px">In a guild</span>'}
                </div>`).join('');
        } catch (e) {
            resultsEl.innerHTML = '<div style="color:#f85149;text-align:center;padding:20px">Error loading guilds.</div>';
        }
    },

    // ─── TAB: INVITES ─────────────────────────────────────────────
    _renderInvites() {
        if (!GuildUI.invites.length) {
            GuildUI._setContent(`<div style="text-align:center;padding:40px;color:#484f58">
                <div style="font-size:32px;margin-bottom:12px">📨</div>No pending guild invites.</div>`);
            return;
        }
        GuildUI._setContent(GuildUI.invites.map(inv => `
            <div style="padding:14px;background:rgba(243,156,18,0.07);border:1px solid rgba(243,156,18,0.25);
                 border-radius:8px;margin-bottom:8px">
                <div style="color:#f39c12;font-weight:bold;margin-bottom:4px">
                    ${GuildUI._esc(inv.emblem || '⚔️')} ${GuildUI._esc(inv.guild_name)} [${GuildUI._esc(inv.tag)}]
                </div>
                <div style="color:#8b949e;font-size:12px;margin-bottom:10px">Invited by ${GuildUI._esc(inv.inviter_name)}</div>
                <div style="display:flex;gap:8px">
                    <button class="g-btn g-btn-ok" onclick="GuildUI.acceptInvite(${inv.guild_id})">✅ Accept</button>
                    <button class="g-btn g-btn-danger" onclick="GuildUI.declineInvite(${inv.guild_id})">✕ Decline</button>
                </div>
            </div>`).join(''));
    },

    // ─── ACTIONS ─────────────────────────────────────────────────
    async createGuild() {
        const name   = document.getElementById('guildName')?.value?.trim();
        const tag    = document.getElementById('guildTag')?.value?.trim();
        const desc   = document.getElementById('guildDesc')?.value?.trim();
        const emblem = document.getElementById('guildEmblem')?.value?.trim() || '⚔️';
        if (!name || !tag) { GuildUI._toast('Name and tag are required.', 'damage'); return; }
        const charId = typeof Game !== 'undefined' ? Game.myCharId : null;
                const res = await fetch('/api/guild/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId, name, tag, description: desc, emblem })
        }).then(r => r.json());
        if (res.success) {
            GuildUI._toast(`Guild "${res.guildName}" founded!`, 'item');
            // Server will emit guild_joined socket event — we reload to reflect
            await GuildUI.load();
        } else {
            GuildUI._toast(res.error || 'Could not create guild.', 'damage');
        }
    },

    async disband() {
        if (!confirm(`Disband ${GuildUI.guild?.name}? This cannot be undone.`)) return;
        const charId = typeof Game !== 'undefined' ? Game.myCharId : null;
                const res = await fetch('/api/guild/disband', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId, guildId: GuildUI.guild.id })
        }).then(r => r.json());
        GuildUI._toast(res.success ? 'Guild disbanded.' : (res.error || 'Error'), res.success ? 'damage' : 'damage');
        if (res.success) { GuildUI.guild = null; GuildUI.members = []; await GuildUI.load(); }
    },

    leave() {
        if (!confirm('Leave the guild?')) return;
        if (typeof Game !== 'undefined') Game.socket.emit('guild_leave');
        GuildUI.guild = null; GuildUI.members = [];
        GuildUI.render();
    },

    kick(targetCharId, name) {
        if (!confirm(`Kick ${name} from the guild?`)) return;
        if (typeof Game !== 'undefined') Game.socket.emit('guild_kick', { targetCharId });
    },

    setRank(targetCharId, rank) {
        if (typeof Game !== 'undefined') Game.socket.emit('guild_set_rank', { targetCharId, rank });
        GuildUI._toast(`Rank updated.`, 'item');
        // Update local state optimistically
        const m = GuildUI.members.find(m => m.char_id === targetCharId);
        if (m) m.rank = rank;
        GuildUI.render();
    },

    async inviteByName() {
        const name = document.getElementById('inviteByName')?.value?.trim();
        if (!name) return;
        const res = await fetch('/get-char-by-name', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        }).then(r => r.json());
        if (!res.success) { GuildUI._toast(`Character "${name}" not found.`, 'damage'); return; }
        if (typeof Game !== 'undefined') Game.socket.emit('guild_invite', { targetCharId: res.charId });
        GuildUI._toast(`Invite sent to ${res.name}.`, 'item');
        const inp = document.getElementById('inviteByName');
        if (inp) inp.value = '';
    },

    acceptInvite(guildId) {
        if (typeof Game !== 'undefined') Game.socket.emit('guild_accept', { guildId });
        GuildUI._pendingInvite = null;
        GuildUI.invites = GuildUI.invites.filter(i => i.guild_id !== guildId);
        GuildUI.tab = 'my';
        GuildUI._toast('Joining guild…', 'item');
    },

    declineInvite(guildId) {
        if (typeof Game !== 'undefined') Game.socket.emit('guild_decline', { guildId });
        GuildUI._pendingInvite = null;
        GuildUI.invites = GuildUI.invites.filter(i => i.guild_id !== guildId);
        GuildUI.render();
    },

    // ─── SOCKET WIRING ───────────────────────────────────────────
    initSockets() {
        const tryBind = () => {
            if (typeof Game === 'undefined' || !Game.socket) { setTimeout(tryBind, 100); return; }

            Game.socket.on('guild_joined', ({ guildId, guildName, rank }) => {
                if (GuildUI.open) GuildUI.load();
                GuildUI._toast(`Joined guild: ${guildName}`, 'item');
            });

            Game.socket.on('guild_left', () => {
                GuildUI.guild = null; GuildUI.members = []; GuildUI.myRank = null;
                if (GuildUI.open) GuildUI.render();
            });

            Game.socket.on('guild_invited', (data) => {
                GuildUI._pendingInvite = data;
                GuildUI._toastInvite(data);
                if (GuildUI.open) GuildUI.render();
                // Badge update
                const tab = document.getElementById('gtab-invites');
                if (tab) tab.textContent = '📨 Invites (!)';
            });

            Game.socket.on('guild_msg', ({ text, type }) => {
                GuildUI._toast(text, type === 'error' ? 'damage' : 'item');
            });
        };
        tryBind();
    },

    _toastInvite(data) {
        const n = document.createElement('div');
        n.style.cssText = `position:fixed;top:80px;right:20px;background:rgba(5,8,14,0.95);
            border:1px solid rgba(243,156,18,0.5);border-radius:10px;padding:12px 16px;z-index:200;color:#e8eef6;font-size:13px;`;
        n.innerHTML = `<div style="color:#f39c12;font-weight:bold;margin-bottom:8px">🏰 Guild Invite from ${GuildUI._esc(data.inviterName)}<br><span style="font-size:11px">${GuildUI._esc(data.guildName)}</span></div>
            <div style="display:flex;gap:8px">
                <button onclick="GuildUI.acceptInvite(${data.guildId});this.closest('[style]').remove()"
                    style="padding:5px 14px;background:rgba(63,185,80,0.2);border:1px solid #3fb950;color:#3fb950;cursor:pointer;border-radius:6px;font-size:12px">Accept</button>
                <button onclick="GuildUI.declineInvite(${data.guildId});this.closest('[style]').remove()"
                    style="padding:5px 14px;background:rgba(248,81,73,0.1);border:1px solid #f85149;color:#f85149;cursor:pointer;border-radius:6px;font-size:12px">Decline</button>
            </div>`;
        document.body.appendChild(n);
        setTimeout(() => { if (n.parentNode) n.remove(); }, 15000);
    },

    // ─── DOM SHELL ───────────────────────────────────────────────
    _buildShell() {
        let el = document.getElementById('guildOverlay');
        if (el) el.remove();
        el = document.createElement('div');
        el.id = 'guildOverlay';
        el.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;z-index:120;
            background:rgba(0,0,0,0.92);overflow-y:auto;padding:30px;color:#e8eef6;`;
        el.innerHTML = `
            ${GuildUI._styles()}
            <div style="max-width:640px;margin:0 auto">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;
                     border-bottom:1px solid #21262d;padding-bottom:14px">
                    <span style="font-size:24px">🏰</span>
                    <h1 style="margin:0;font-size:20px;color:#f39c12;letter-spacing:1px;font-family:'Courier New',monospace">GUILD</h1>
                    <div style="margin-left:auto;display:flex;gap:6px">
                        <button id="gtab-my"      class="g-tab" onclick="GuildUI.tab='my';     GuildUI.render()">🏰 My Guild</button>
                        <button id="gtab-roster"  class="g-tab" onclick="GuildUI.tab='roster'; GuildUI.render()">👥 Roster</button>
                        <button id="gtab-news"    class="g-tab" onclick="GuildUI.tab='news';   GuildUI.render()">📰 News</button>
                        <button id="gtab-search"  class="g-tab" onclick="GuildUI.tab='search'; GuildUI._renderSearch()">🔍 Search</button>
                        <button id="gtab-invites" class="g-tab" onclick="GuildUI.tab='invites';GuildUI.render()">📨 Invites</button>
                    </div>
                    <button onclick="GuildUI.close()" class="g-close-btn">[G] Close</button>
                </div>
                <div id="guildContent">
                    <div style="text-align:center;padding:40px;color:#484f58">Loading…</div>
                </div>
            </div>`;
        document.body.appendChild(el);
    },

    _styles() {
        if (document.getElementById('guildStyles')) return '';
        const s = document.createElement('style');
        s.id = 'guildStyles';
        s.textContent = `
        .g-tab { background:rgba(255,255,255,0.04);border:1px solid #30363d;color:#8b949e;padding:7px 12px;
            cursor:pointer;border-radius:7px;font-family:'Courier New',monospace;font-size:11px;transition:.15s; }
        .g-tab:hover { color:#e8eef6;background:rgba(255,255,255,0.08); }
        .g-tab.g-tab-active { background:rgba(243,156,18,0.15);border-color:rgba(243,156,18,0.4);color:#f39c12; }
        .g-close-btn { background:transparent;border:1px solid #484f58;color:#8b949e;padding:6px 12px;
            cursor:pointer;border-radius:7px;font-family:'Courier New',monospace;font-size:12px;transition:.15s; }
        .g-close-btn:hover { border-color:#f85149;color:#f85149; }
        .g-sect { color:#f39c12;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin:6px 0 8px;
            padding-bottom:4px;border-bottom:1px solid #21262d;font-family:'Courier New',monospace; }
        .g-btn { padding:6px 14px;border-radius:7px;cursor:pointer;font-family:'Courier New',monospace;font-size:12px;font-weight:600;transition:.15s; }
        .g-btn-ok { background:rgba(63,185,80,0.12);border:1px solid rgba(63,185,80,0.35);color:#3fb950; }
        .g-btn-ok:hover { background:rgba(63,185,80,0.25); }
        .g-btn-danger { background:rgba(248,81,73,0.1);border:1px solid rgba(248,81,73,0.28);color:#f85149; }
        .g-btn-danger:hover { background:rgba(248,81,73,0.2); }
        .g-input { background:rgba(255,255,255,0.05);border:1px solid #30363d;color:#e8eef6;
            padding:8px 10px;border-radius:7px;font-family:inherit;font-size:12px;outline:none;box-sizing:border-box; }
        .g-input:focus { border-color:rgba(243,156,18,0.4); }`;
        document.head.appendChild(s);
        return '';
    },

    _setContent(html) { const el = document.getElementById('guildContent'); if (el) el.innerHTML = html; },
    _toast(t, type) { if (typeof showNotification === 'function') showNotification(t, type); },
    _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;'); },
};
