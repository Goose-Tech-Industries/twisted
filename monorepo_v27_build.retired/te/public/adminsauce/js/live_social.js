// =================================================================
// PARTY & GUILD LIVE VIEWER
// Real-time overview of active parties and guilds with online status.
// =================================================================
const LiveSocial = {
    _timer: null,

    async init() {
        // TEACHING: These elements are created by the AdminSauce layout.
        // If this module loads before the layout renders (e.g. via postMessage
        // from the React wrapper), the elements won't exist yet → null crash.
        const titleEl = document.getElementById('managerTitle');
        const dynEl   = document.getElementById('dynamicArea');
        if (!titleEl || !dynEl) {
            console.warn('[LiveSocial] Host elements not ready — retrying in 300ms');
            setTimeout(() => LiveSocial.init(), 300);
            return;
        }
        titleEl.textContent = '👥 Live Social';
        dynEl.innerHTML = `
<style>
.ls-panel  { background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:16px;margin-bottom:14px }
.ls-head   { font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#484f58;margin-bottom:12px }
.ls-member { display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #161b22;font-size:12px }
.ls-member:last-child { border:none }
.ls-dot    { width:6px;height:6px;border-radius:50%;flex-shrink:0 }
.ls-online { background:#3fb950 }
.ls-offline{ background:#484f58 }
.ls-grid   { display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px }
.ls-stat   { display:flex;justify-content:space-between;align-items:center }
.ls-badge  { font-size:10px;padding:2px 6px;border-radius:10px;font-weight:700 }
.ls-leader { background:rgba(210,153,34,.15);color:#d29922 }
.ls-rank   { background:rgba(187,134,252,.1);color:#bb86fc }
.ls-none   { color:#484f58;text-align:center;padding:30px;font-style:italic;font-size:13px }
</style>

<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <div>
        <h2 style="margin:0;color:#42A5F5">👥 Live Social Viewer</h2>
        <div style="font-size:11px;color:#484f58;margin-top:2px">Active parties and guilds — auto-refreshes every 20s</div>
    </div>
    <button class="action-btn" onclick="LiveSocial._load()" style="padding:8px 14px;font-size:12px">↺ Refresh</button>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px" id="ls_summary"></div>
<div id="ls_tabs" style="display:flex;gap:8px;margin-bottom:16px">
    <button id="ls_tab_parties" class="action-btn" onclick="LiveSocial._showTab('parties')"
        style="padding:8px 16px;font-size:12px">⚔️ Parties</button>
    <button id="ls_tab_guilds" class="edit-btn" onclick="LiveSocial._showTab('guilds')"
        style="padding:8px 16px;font-size:12px">🏰 Guilds</button>
</div>
<div id="ls_parties"></div>
<div id="ls_guilds" style="display:none"></div>`;

        await LiveSocial._load();
        if (LiveSocial._timer) clearInterval(LiveSocial._timer);
        LiveSocial._timer = setInterval(LiveSocial._load, 20000);
    },

    destroy() {
        if (LiveSocial._timer) { clearInterval(LiveSocial._timer); LiveSocial._timer = null; }
    },

    _showTab(tab) {
        document.getElementById('ls_parties').style.display = tab === 'parties' ? '' : 'none';
        document.getElementById('ls_guilds').style.display  = tab === 'guilds'  ? '' : 'none';
        document.getElementById('ls_tab_parties').className = tab === 'parties' ? 'action-btn' : 'edit-btn';
        document.getElementById('ls_tab_guilds').className  = tab === 'guilds'  ? 'action-btn' : 'edit-btn';
        document.getElementById('ls_tab_parties').style.cssText = 'padding:8px 16px;font-size:12px';
        document.getElementById('ls_tab_guilds').style.cssText  = 'padding:8px 16px;font-size:12px';
    },

    async _load() {
        const r = await fetch('/admin-panel/live-social');
        const d = await r.json();
        if (!d.success) return;
        const { parties, guilds } = d;

        // Summary cards
        const totalOnlineInParty = parties.reduce((s,p) => s + p.members.filter(m => m.online).length, 0);
        const totalOnlineInGuild = guilds.reduce((s,g) => s + g.onlineCount, 0);
        document.getElementById('ls_summary').innerHTML = `
            <div style="background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:16px;text-align:center">
                <div style="font-size:32px;font-weight:700;color:#42A5F5;font-family:monospace">${parties.length}</div>
                <div style="font-size:10px;color:#484f58;text-transform:uppercase;letter-spacing:1px;margin-top:4px">Active Parties</div>
                <div style="font-size:11px;color:#3fb950;margin-top:4px">${totalOnlineInParty} members online</div>
            </div>
            <div style="background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:16px;text-align:center">
                <div style="font-size:32px;font-weight:700;color:#bb86fc;font-family:monospace">${guilds.length}</div>
                <div style="font-size:10px;color:#484f58;text-transform:uppercase;letter-spacing:1px;margin-top:4px">Active Guilds</div>
                <div style="font-size:11px;color:#3fb950;margin-top:4px">${totalOnlineInGuild} members online</div>
            </div>`;

        // Parties
        const pEl = document.getElementById('ls_parties');
        pEl.innerHTML = parties.length ? `<div class="ls-grid">${parties.map(p => `
            <div class="ls-panel">
                <div class="ls-head ls-stat">
                    <span>⚔️ ${p.name || 'Unnamed Party'} <span style="color:#484f58;font-weight:normal">#${p.id}</span></span>
                    <span style="color:#3fb950;font-size:11px">${p.members.filter(m=>m.online).length}/${p.members.length} online</span>
                </div>
                ${p.members.map(m => `
                <div class="ls-member">
                    <span class="ls-dot ${m.online ? 'ls-online' : 'ls-offline'}"></span>
                    <span style="flex:1;color:${m.online?'#e8eef6':'#484f58'}">${m.name}</span>
                    ${m.is_leader ? '<span class="ls-badge ls-leader">Leader</span>' : ''}
                    <span style="color:#484f58;font-size:10px">Lv${m.level}</span>
                    ${m.online ? `<button class="gmn-btn" style="font-size:10px;color:#f85149;border-color:rgba(248,81,73,.3);background:transparent;border-radius:4px;padding:2px 6px;cursor:pointer"
                        onclick="PlayerManager.viewPlayer(${m.id})">VIEW</button>` : ''}
                </div>`).join('')}
            </div>`).join('')}</div>`
        : '<div class="ls-none">No active parties found.</div>';

        // Guilds
        const gEl = document.getElementById('ls_guilds');
        gEl.innerHTML = guilds.length ? `<div class="ls-grid">${guilds.map(g => {
            const onlineMembers = g.members.filter(m => m.online);
            return `
            <div class="ls-panel">
                <div class="ls-head ls-stat">
                    <span>🏰 ${g.name} <span style="color:#484f58;font-weight:normal">[${g.tag||'??'}]</span></span>
                    <span style="color:#3fb950;font-size:11px">${g.onlineCount}/${g.total_members} online</span>
                </div>
                <div style="font-size:11px;color:#484f58;margin-bottom:8px">Guild Level ${g.guild_level} · ${g.total_members} total members</div>
                ${onlineMembers.length ? onlineMembers.map(m => `
                <div class="ls-member">
                    <span class="ls-dot ls-online"></span>
                    <span style="flex:1;color:#e8eef6">${m.name}</span>
                    <span class="ls-badge ls-rank">${m.rank||'Member'}</span>
                    <span style="color:#484f58;font-size:10px">Lv${m.level}</span>
                </div>`).join('')
                : `<div style="color:#484f58;font-size:12px;padding:8px 0;font-style:italic">No members currently online</div>`}
                ${g.total_members > onlineMembers.length
                    ? `<div style="color:#484f58;font-size:11px;margin-top:8px;border-top:1px solid #161b22;padding-top:8px">+${g.total_members - onlineMembers.length} offline members</div>`
                    : ''}
            </div>`;
        }).join('')}</div>`
        : '<div class="ls-none">No guilds found.</div>';
    }
};
