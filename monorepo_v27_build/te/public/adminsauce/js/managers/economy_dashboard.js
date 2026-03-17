// =================================================================
// ECONOMY DASHBOARD
// Shows gold circulation, distribution, richest players, per-level
// gold rates, and recent gold events.
// =================================================================
const EconomyDashboard = {

    async init() {
        document.getElementById('managerTitle').textContent = '💰 Economy Dashboard';
        document.getElementById('dynamicArea').innerHTML =
            '<p style="color:#484f58;text-align:center;padding:40px;font-family:monospace">Loading economy data…</p>';

        const r = await fetch('/admin-panel/economy');
        const d = await r.json();
        if (!d.success) {
            document.getElementById('dynamicArea').innerHTML =
                `<p style="color:#f85149;padding:20px">Error: ${d.message}</p>`;
            return;
        }
        EconomyDashboard._render(d.data);
    },

    _render(data) {
        const {
            totalGold, avgGold, maxGold, startingGold,
            theoreticalStartingGold, richest, distribution,
            levelGoldTable, recentGoldEvents
        } = data;

        const inflation = theoreticalStartingGold > 0
            ? (((totalGold - theoreticalStartingGold) / theoreticalStartingGold) * 100).toFixed(1)
            : '—';
        const inflationColor = inflation > 0 ? '#f85149' : inflation < 0 ? '#3fb950' : '#484f58';

        // Distribution buckets
        const dist = distribution || {};
        const total = parseInt(dist.total_users) || 1;
        const buckets = [
            { label: '0g  (Broke)',           key: 'broke',       color: '#484f58' },
            { label: '1–100g  (Poor)',         key: 'poor',        color: '#f85149' },
            { label: '101–500g  (Modest)',     key: 'modest',      color: '#d29922' },
            { label: '501–2k  (Comfortable)', key: 'comfortable', color: '#3fb950' },
            { label: '2k–10k  (Wealthy)',     key: 'wealthy',     color: '#42A5F5' },
            { label: '10k+  (Rich)',           key: 'rich',        color: '#bb86fc' },
        ];

        // Recent gold events
        const gEvents = (recentGoldEvents || []).slice(0, 12);

        document.getElementById('dynamicArea').innerHTML = `
<style>
.eco-grid  { display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:24px }
.eco-card  { background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:16px;text-align:center }
.eco-num   { font-size:28px;font-weight:700;font-family:monospace }
.eco-lbl   { font-size:10px;color:#484f58;text-transform:uppercase;letter-spacing:1px;margin-top:4px }
.eco-panel { background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:18px;margin-bottom:16px }
.eco-head  { font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#484f58;margin-bottom:14px }
.eco-row   { display:flex;justify-content:space-between;align-items:center;padding:7px 0;
             border-bottom:1px solid #161b22;font-size:13px }
.eco-row:last-child { border:none }
.eco-bar-bg{ height:8px;background:#161b22;border-radius:4px;overflow:hidden;flex:1;margin:0 12px }
.eco-bar-fg{ height:100%;border-radius:4px;transition:width .6s ease }
</style>

<!-- STAT CARDS -->
<h2 style="margin:0 0 20px;color:#d29922">💰 Economy Dashboard</h2>
<div class="eco-grid">
    <div class="eco-card">
        <div class="eco-num" style="color:#d29922">${Number(totalGold).toLocaleString()}</div>
        <div class="eco-lbl">Total Gold in World</div>
    </div>
    <div class="eco-card">
        <div class="eco-num" style="color:#42A5F5">${Number(avgGold).toLocaleString()}</div>
        <div class="eco-lbl">Avg Gold / Account</div>
    </div>
    <div class="eco-card">
        <div class="eco-num" style="color:#bb86fc">${Number(maxGold).toLocaleString()}</div>
        <div class="eco-lbl">Richest Account</div>
    </div>
    <div class="eco-card">
        <div class="eco-num" style="color:${inflationColor}">${inflation}%</div>
        <div class="eco-lbl">Gold Inflation vs Baseline</div>
    </div>
    <div class="eco-card">
        <div class="eco-num" style="color:#484f58">${Number(startingGold).toLocaleString()}</div>
        <div class="eco-lbl">Starting Gold</div>
    </div>
    <div class="eco-card">
        <div class="eco-num" style="color:#484f58">${Number(theoreticalStartingGold).toLocaleString()}</div>
        <div class="eco-lbl">Baseline (All Accounts × Start)</div>
    </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

<!-- DISTRIBUTION CHART -->
<div class="eco-panel">
    <div class="eco-head">📊 Wealth Distribution</div>
    ${buckets.map(b => {
        const count = parseInt(dist[b.key]) || 0;
        const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
        return `<div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                <span style="color:#8b949e">${b.label}</span>
                <span style="color:${b.color};font-weight:700">${count} <span style="color:#484f58;font-weight:400">(${pct}%)</span></span>
            </div>
            <div class="eco-bar-bg" style="margin:0">
                <div class="eco-bar-fg" style="width:${pct}%;background:${b.color}"></div>
            </div>
        </div>`;
    }).join('')}
</div>

<!-- RICHEST PLAYERS -->
<div class="eco-panel">
    <div class="eco-head">🏆 Richest Accounts (Top 15)</div>
    ${(richest || []).map((p, i) => {
        const pct = maxGold > 0 ? Math.round((p.gold / maxGold) * 100) : 0;
        const col = i === 0 ? '#d29922' : i === 1 ? '#8b949e' : i === 2 ? '#cd7f32' : '#484f58';
        return `<div class="eco-row">
            <span style="color:${col};width:20px;text-align:right;font-size:11px">#${i+1}</span>
            <span style="flex:1;margin-left:10px;color:#e8eef6">${p.username}</span>
            <div class="eco-bar-bg"><div class="eco-bar-fg" style="width:${pct}%;background:${col}"></div></div>
            <span style="color:#d29922;font-family:monospace;font-size:12px;white-space:nowrap">
                💰 ${Number(p.gold).toLocaleString()}
            </span>
        </div>`;
    }).join('')}
</div>

</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:0">

<!-- LEVEL GOLD TABLE -->
<div class="eco-panel">
    <div class="eco-head">⚔️ Gold per Battle Win (by Level)</div>
    <div style="max-height:220px;overflow-y:auto">
    ${(levelGoldTable || []).length
        ? levelGoldTable.map(lv => {
            const g = lv.gold_for_win || 0;
            const maxG = Math.max(...(levelGoldTable.map(l => l.gold_for_win || 0)), 1);
            const pct  = Math.round((g / maxG) * 100);
            return `<div class="eco-row">
                <span style="color:#484f58;font-size:11px;width:60px">Lv ${lv.level}</span>
                <div class="eco-bar-bg"><div class="eco-bar-fg" style="width:${pct}%;background:#d29922"></div></div>
                <span style="color:#d29922;font-family:monospace;font-size:12px;margin-left:8px">${g}g</span>
            </div>`;
          }).join('')
        : '<div style="color:#484f58;text-align:center;padding:20px;font-size:12px">No level table found. Set gold_for_win in your level config.</div>'}
    </div>
</div>

<!-- RECENT GOLD EVENTS -->
<div class="eco-panel">
    <div class="eco-head">🕐 Recent Gold Events</div>
    <div style="max-height:220px;overflow-y:auto">
    ${gEvents.length
        ? gEvents.map(ev => {
            const d    = ev.detail_json ? (typeof ev.detail_json === 'string' ? JSON.parse(ev.detail_json) : ev.detail_json) : {};
            const gold = d.gold || d.amount || 0;
            const col  = ev.event_type === 'gm_give_gold' ? '#bb86fc' : '#d29922';
            const icon = ev.event_type === 'gm_give_gold' ? '🎁' : '⚔️';
            const when = new Date(ev.created_at).toLocaleTimeString();
            return `<div class="eco-row">
                <span style="font-size:14px">${icon}</span>
                <span style="flex:1;margin-left:8px;font-size:12px;color:#e8eef6">${ev.actor_name || '—'}</span>
                <span style="color:${col};font-family:monospace;font-size:12px">+${gold}g</span>
                <span style="color:#484f58;font-size:10px;margin-left:8px">${when}</span>
            </div>`;
          }).join('')
        : '<div style="color:#484f58;text-align:center;padding:20px;font-size:12px">No gold events logged yet.</div>'}
    </div>
</div>

</div>`;
    }
};
