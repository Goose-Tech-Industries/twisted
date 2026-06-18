// =================================================================
// LIVE DASHBOARD — real-time server stats + recent activity
// =================================================================
const Dashboard = {
    _timer: null,

    init() {
        document.getElementById('managerTitle').textContent = '📊 Live Dashboard';
        document.getElementById('dynamicArea').innerHTML = `
        <style>
        .dash-grid  { display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:24px }
        .dash-stat  { background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:16px;text-align:center }
        .dash-num   { font-size:32px;font-weight:700;color:#bb86fc;font-family:monospace }
        .dash-lbl   { font-size:11px;color:#484f58;text-transform:uppercase;letter-spacing:1px;margin-top:4px }
        .dash-panel { background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:16px;margin-bottom:16px }
        .dash-head  { font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#484f58;margin-bottom:12px }
        .dash-row   { display:flex;justify-content:space-between;align-items:center;padding:7px 0;
                      border-bottom:1px solid #161b22;font-size:13px }
        .dash-row:last-child { border:none }
        .dot-green  { width:7px;height:7px;border-radius:50%;background:#3fb950;display:inline-block;margin-right:5px }
        .dot-red    { width:7px;height:7px;border-radius:50%;background:#f85149;display:inline-block;margin-right:5px }
        .pulse      { animation:pulse 2s ease-in-out infinite }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.5} }
        </style>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
            <div>
                <h2 style="margin:0;font-size:18px;color:#bb86fc">📊 Live Dashboard</h2>
                <div style="font-size:11px;color:#484f58;margin-top:2px">Auto-refreshes every 30s</div>
            </div>
            <button class="action-btn" onclick="Dashboard._load()" style="padding:8px 16px;font-size:12px">↺ Refresh</button>
        </div>
        <div id="dash_content"><p style="color:#484f58;text-align:center;padding:40px" class="pulse">Loading dashboard...</p></div>`;

        Dashboard._load();
        if (Dashboard._timer) clearInterval(Dashboard._timer);
        Dashboard._timer = setInterval(Dashboard._load, 30000);
    },

    async _load() {
        try {
            const r  = await fetch('/admin-panel/dashboard');
            const d  = await r.json();
            if (!d.success) throw new Error(d.message);
            const el = document.getElementById('dash_content');
            if (!el) return;

            const { stats, online, onlineList, recentUsers, topChars, totalGold } = d;
            const statCards = [
                { n: online,         l: 'Online Now',    c: online > 0 ? '#3fb950' : '#484f58' },
                { n: stats.users,    l: 'Total Accounts', c: '#bb86fc' },
                { n: stats.chars,    l: 'Characters',     c: '#42A5F5' },
                { n: stats.maps,     l: 'Active Maps',    c: '#FFA726' },
                { n: stats.npcs,     l: 'NPCs',           c: '#66BB6A' },
                { n: stats.items,    l: 'Items',          c: '#EF5350' },
                { n: stats.battles ?? '—', l: 'Active Battles', c: '#f85149' },
                { n: (totalGold||0).toLocaleString()+'g', l: 'World Gold', c: '#d29922' },
                { n: d.aiProvider||'off', l: 'AI Provider', c: d.aiProvider&&d.aiProvider!=='disabled'?'#3fb950':'#484f58' },
            ];

            let html = `<div class="dash-grid">
                ${statCards.map(s => `<div class="dash-stat">
                    <div class="dash-num" style="color:${s.c}">${s.n ?? '—'}</div>
                    <div class="dash-lbl">${s.l}</div>
                </div>`).join('')}
            </div>`;

            // Online players
            html += `<div class="dash-panel">
                <div class="dash-head">🟢 Online Players (${online})</div>
                ${onlineList.length ? onlineList.map(p => `
                <div class="dash-row">
                    <span><span class="dot-green"></span>${p.name}</span>
                    <span style="color:#484f58;font-size:11px">Lv${p.level||'?'} · ${p.mapName||'Map '+p.mapId}</span>
                </div>`).join('') : `<div style="color:#484f58;text-align:center;padding:20px">No players online</div>`}
            </div>`;

            // Top characters
            if (topChars && topChars.length) {
                html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                <div class="dash-panel">
                    <div class="dash-head">🏆 Top Characters by Level</div>
                    ${topChars.map((c,i) => `<div class="dash-row">
                        <span><span style="color:#484f58">#${i+1}</span> <b>${c.name}</b></span>
                        <span style="color:#d29922">Lv${c.level}</span>
                    </div>`).join('')}
                </div>`;

                // Recent registrations
                html += `<div class="dash-panel">
                    <div class="dash-head">🆕 Recent Accounts</div>
                    ${(recentUsers||[]).slice(0,5).map(u => `<div class="dash-row">
                        <span>${u.is_banned ? '<span style="color:#f85149">🚫</span> ' : ''}<b>${u.username}</b>
                            <span style="color:#484f58;font-size:10px;margin-left:6px">${u.role}</span></span>
                        <span style="color:#484f58;font-size:11px">${u.last_login ? new Date(u.last_login).toLocaleDateString() : 'never'}</span>
                    </div>`).join('')}
                </div></div>`;
            }

            // Quick actions
            html += `<div class="dash-panel" style="margin-top:4px">
                <div class="dash-head">⚡ Quick Actions</div>
                <div style="display:flex;gap:10px;flex-wrap:wrap">
                    <button class="action-btn" onclick="loadManager('player_manager')" style="font-size:12px;padding:8px 14px">👥 Player Manager</button>
                    <button class="action-btn" onclick="loadManager('gm_tools')" style="font-size:12px;padding:8px 14px;background:#c0392b">📢 GM Tools</button>
                    <button class="action-btn" onclick="loadManager('world_forge')" style="font-size:12px;padding:8px 14px;background:#6A1B9A">🌍 World Forge</button>
                    <button class="action-btn" onclick="Dashboard._load()" style="font-size:12px;padding:8px 14px;background:#21262d;color:#8b949e">↺ Refresh</button>
                </div>
            </div>`;

            el.innerHTML = html;
        } catch (e) {
            const el = document.getElementById('dash_content');
            if (el) el.innerHTML = `<div style="color:#f85149;padding:20px">Dashboard error: ${e.message}</div>`;
        }
    },

    destroy() { if (Dashboard._timer) { clearInterval(Dashboard._timer); Dashboard._timer = null; } }
};
