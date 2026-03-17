// =================================================================
// LEADERBOARD UI  v1.0
// =================================================================
// Teaching: The leaderboard fetches pre-computed data from the
// server. We don't do the SQL here — the server already ran the
// queries and cached the results. The client just displays them.
//
// Four boards:
//   ⚔️  PvP   — most wins + W/L ratio
//   📈  Level — highest level + class
//   💰  Wealth — most gold
//   🏰  Guilds — highest avg member level
//
// Entry: LeaderboardUI.init()
// Toggle: LeaderboardUI.toggle()
// Called from a HUD button added by this file.
// =================================================================

const LeaderboardUI = {

    open:   false,
    tab:    'pvp',
    data:   null,
    loading: false,

    // ── Init ──────────────────────────────────────────────────────
    init() {
        LeaderboardUI._buildButton();
        LeaderboardUI._injectStyles();
    },

    _buildButton() {
        // Add a button to the top-right button bar
        const bar = document.getElementById('topButtons');
        if (!bar) return;
        const btn = document.createElement('button');
        btn.className = 'hud-btn';
        btn.id        = 'lbBtn';
        btn.title     = '[L] Leaderboard';
        btn.innerHTML = '🏆 Ranks';
        btn.onclick   = () => LeaderboardUI.toggle();
        bar.appendChild(btn);

        // Hotkey L
        window.addEventListener('keydown', (e) => {
            if (document.activeElement?.tagName === 'INPUT') return;
            if (document.activeElement?.tagName === 'TEXTAREA') return;
            if (e.key === 'l' || e.key === 'L') LeaderboardUI.toggle();
        });
    },

    // ── Toggle ────────────────────────────────────────────────────
    toggle() {
        LeaderboardUI.open ? LeaderboardUI.close() : LeaderboardUI._openPanel();
    },

    close() {
        LeaderboardUI.open = false;
        const el = document.getElementById('lbPanel');
        if (el) el.remove();
    },

    _openPanel() {
        LeaderboardUI.open = true;
        LeaderboardUI._buildPanel();
        if (!LeaderboardUI.data) {
            LeaderboardUI._loadData();
        } else {
            LeaderboardUI._render();
        }
    },

    // ── Build Panel ───────────────────────────────────────────────
    _buildPanel() {
        const el = document.getElementById('lbPanel');
        if (el) el.remove();

        const panel = document.createElement('div');
        panel.id = 'lbPanel';
        panel.innerHTML = `
            <div class="lb-header">
                <span class="lb-title">🏆 Leaderboards</span>
                <div style="display:flex;gap:6px;align-items:center">
                    <button class="lb-refresh" onclick="LeaderboardUI._loadData(true)" title="Refresh">↻</button>
                    <button class="lb-close" onclick="LeaderboardUI.close()">✕</button>
                </div>
            </div>
            <div class="lb-tabs">
                <button class="lb-tab active" id="lbtab-pvp"    onclick="LeaderboardUI.switchTab('pvp')">⚔️ PvP</button>
                <button class="lb-tab"        id="lbtab-level"  onclick="LeaderboardUI.switchTab('level')">📈 Level</button>
                <button class="lb-tab"        id="lbtab-wealth" onclick="LeaderboardUI.switchTab('wealth')">💰 Wealth</button>
                <button class="lb-tab"        id="lbtab-guilds" onclick="LeaderboardUI.switchTab('guilds')">🏰 Guilds</button>
            </div>
            <div id="lbContent" class="lb-content">
                <div class="lb-loading">Loading…</div>
            </div>
            <div class="lb-footer">Updates every 60 seconds · <span id="lbUpdated"></span></div>`;
        document.body.appendChild(panel);
    },

    switchTab(tab) {
        LeaderboardUI.tab = tab;
        document.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('lbtab-' + tab);
        if (btn) btn.classList.add('active');
        LeaderboardUI._render();
    },

    // ── Load Data ─────────────────────────────────────────────────
    async _loadData(force = false) {
        if (LeaderboardUI.loading) return;
        LeaderboardUI.loading = true;
        const box = document.getElementById('lbContent');
        if (box) box.innerHTML = '<div class="lb-loading">Fetching rankings…</div>';

        try {
            const r = await fetch('/api/leaderboard/all');
            const d = await r.json();
            if (d.success) {
                LeaderboardUI.data = d;
                LeaderboardUI._lastLoad = Date.now();
                LeaderboardUI._render();
                const updated = document.getElementById('lbUpdated');
                if (updated) updated.textContent = 'Updated just now';
            } else {
                if (box) box.innerHTML = '<div class="lb-loading">Failed to load rankings.</div>';
            }
        } catch (e) {
            if (box) box.innerHTML = '<div class="lb-loading">Network error.</div>';
        }
        LeaderboardUI.loading = false;
    },

    // ── Render ────────────────────────────────────────────────────
    _render() {
        const box = document.getElementById('lbContent');
        if (!box || !LeaderboardUI.data) return;

        const myCharId = typeof Game !== 'undefined' ? Game.myCharId : null;

        switch (LeaderboardUI.tab) {
            case 'pvp':    box.innerHTML = LeaderboardUI._renderPvp(myCharId);    break;
            case 'level':  box.innerHTML = LeaderboardUI._renderLevel(myCharId);  break;
            case 'wealth': box.innerHTML = LeaderboardUI._renderWealth(myCharId); break;
            case 'guilds': box.innerHTML = LeaderboardUI._renderGuilds();         break;
        }

        // Wire inspect buttons
        box.querySelectorAll('[data-inspect]').forEach(btn => {
            btn.addEventListener('click', () => {
                PlayerInspect.open(parseInt(btn.dataset.inspect));
            });
        });
    },

    _renderPvp(myCharId) {
        const rows = LeaderboardUI.data.pvp || [];
        if (!rows.length) return '<div class="lb-empty">No PvP battles recorded yet.</div>';

        return `<table class="lb-table">
            <thead><tr>
                <th>#</th><th>Player</th><th>Class</th><th>W</th><th>L</th><th>Ratio</th>
            </tr></thead>
            <tbody>${rows.map(r => `
                <tr class="${r.charId === myCharId ? 'lb-me' : ''}">
                    <td class="lb-rank">${LeaderboardUI._rankIcon(r.rank)}</td>
                    <td>
                        <span class="lb-name" data-inspect="${r.charId}">${LeaderboardUI._esc(r.name)}</span>
                        ${r.guildName ? `<span class="lb-guild">[${LeaderboardUI._esc(r.guildName)}]</span>` : ''}
                    </td>
                    <td class="lb-dim">${LeaderboardUI._esc(r.className)}</td>
                    <td class="lb-win">${r.wins}</td>
                    <td class="lb-dim">${r.losses}</td>
                    <td class="lb-ratio">${r.ratio}</td>
                </tr>`).join('')}
            </tbody></table>`;
    },

    _renderLevel(myCharId) {
        const rows = LeaderboardUI.data.level || [];
        if (!rows.length) return '<div class="lb-empty">No characters yet.</div>';

        return `<table class="lb-table">
            <thead><tr>
                <th>#</th><th>Player</th><th>Class</th><th>Race</th><th>Level</th>
            </tr></thead>
            <tbody>${rows.map(r => `
                <tr class="${r.charId === myCharId ? 'lb-me' : ''}">
                    <td class="lb-rank">${LeaderboardUI._rankIcon(r.rank)}</td>
                    <td>
                        <span class="lb-name" data-inspect="${r.charId}">${LeaderboardUI._esc(r.name)}</span>
                        ${r.guildName ? `<span class="lb-guild">[${LeaderboardUI._esc(r.guildName)}]</span>` : ''}
                    </td>
                    <td class="lb-dim">${LeaderboardUI._esc(r.className)}</td>
                    <td class="lb-dim">${LeaderboardUI._esc(r.raceName)}</td>
                    <td style="color:#bb86fc;font-weight:bold">${r.level}</td>
                </tr>`).join('')}
            </tbody></table>`;
    },

    _renderWealth(myCharId) {
        const rows = LeaderboardUI.data.wealth || [];
        if (!rows.length) return '<div class="lb-empty">No rich players yet.</div>';

        return `<table class="lb-table">
            <thead><tr>
                <th>#</th><th>Player</th><th>Class</th><th>Lv</th><th>Gold</th>
            </tr></thead>
            <tbody>${rows.map(r => `
                <tr class="${r.charId === myCharId ? 'lb-me' : ''}">
                    <td class="lb-rank">${LeaderboardUI._rankIcon(r.rank)}</td>
                    <td>
                        <span class="lb-name" data-inspect="${r.charId}">${LeaderboardUI._esc(r.name)}</span>
                        ${r.guildName ? `<span class="lb-guild">[${LeaderboardUI._esc(r.guildName)}]</span>` : ''}
                    </td>
                    <td class="lb-dim">${LeaderboardUI._esc(r.className)}</td>
                    <td class="lb-dim">${r.level}</td>
                    <td style="color:#ffaa00;font-weight:bold">💰 ${r.gold.toLocaleString()}g</td>
                </tr>`).join('')}
            </tbody></table>`;
    },

    _renderGuilds() {
        const rows = LeaderboardUI.data.guilds || [];
        if (!rows.length) return '<div class="lb-empty">No guilds yet.</div>';

        return `<table class="lb-table">
            <thead><tr>
                <th>#</th><th>Guild</th><th>Members</th><th>Avg Lv</th><th>Top Lv</th><th>Wins</th>
            </tr></thead>
            <tbody>${rows.map(r => `
                <tr>
                    <td class="lb-rank">${LeaderboardUI._rankIcon(r.rank)}</td>
                    <td>
                        <span style="color:#ffaa44;font-weight:bold">${LeaderboardUI._esc(r.name)}</span>
                        ${r.tag ? `<span class="lb-dim"> [${LeaderboardUI._esc(r.tag)}]</span>` : ''}
                    </td>
                    <td class="lb-dim">${r.memberCount}</td>
                    <td style="color:#bb86fc">${r.avgLevel}</td>
                    <td class="lb-dim">${r.maxLevel}</td>
                    <td class="lb-win">${r.totalWins}</td>
                </tr>`).join('')}
            </tbody></table>`;
    },

    _rankIcon(rank) {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `<span style="color:#484f58">${rank}</span>`;
    },

    _esc(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;');
    },

    // ── Styles ────────────────────────────────────────────────────
    _injectStyles() {
        if (document.getElementById('lbStyles')) return;
        const s = document.createElement('style');
        s.id = 'lbStyles';
        s.textContent = `
        #lbPanel {
            position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            width:520px;max-width:calc(100vw - 20px);
            background:rgba(5,8,14,0.97);
            border:1px solid rgba(187,134,252,0.25);border-radius:12px;
            z-index:200;color:#e8eef6;font-family:'Courier New',monospace;
            box-shadow:0 8px 40px rgba(0,0,0,0.7);display:flex;flex-direction:column;
            max-height:80vh;
        }
        .lb-header {
            display:flex;justify-content:space-between;align-items:center;
            padding:12px 16px;border-bottom:1px solid #21262d;flex-shrink:0;
        }
        .lb-title { font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#bb86fc;font-weight:bold; }
        .lb-close,.lb-refresh {
            background:none;border:none;color:#484f58;cursor:pointer;font-size:16px;line-height:1;
            padding:2px 6px;border-radius:4px;transition:.12s;
        }
        .lb-close:hover,.lb-refresh:hover { color:#8b949e;background:rgba(255,255,255,0.06); }
        .lb-tabs {
            display:flex;gap:2px;padding:8px 10px 0;border-bottom:1px solid #21262d;flex-shrink:0;
        }
        .lb-tab {
            padding:6px 14px;border-radius:7px 7px 0 0;cursor:pointer;font-size:12px;
            color:#484f58;border:none;background:none;font-family:'Courier New',monospace;transition:.12s;
        }
        .lb-tab:hover  { color:#8b949e; }
        .lb-tab.active { color:#e8eef6;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.08);border-bottom:none; }
        .lb-content {
            flex:1;overflow-y:auto;scrollbar-width:thin;
            scrollbar-color:rgba(255,255,255,0.1) transparent;
        }
        .lb-loading,.lb-empty {
            text-align:center;color:#484f58;font-size:12px;padding:30px;
        }
        .lb-table {
            width:100%;border-collapse:collapse;font-size:12px;
        }
        .lb-table thead th {
            padding:8px 12px;color:#484f58;font-weight:normal;
            text-transform:uppercase;font-size:10px;letter-spacing:.5px;
            border-bottom:1px solid #21262d;text-align:left;position:sticky;top:0;
            background:rgba(5,8,14,0.97);
        }
        .lb-table tbody tr {
            border-bottom:1px solid rgba(255,255,255,0.04);transition:.12s;
        }
        .lb-table tbody tr:hover { background:rgba(255,255,255,0.04); }
        .lb-table td { padding:9px 12px;vertical-align:middle; }
        .lb-rank { font-size:16px;text-align:center;width:36px; }
        .lb-name {
            color:#c9d1d9;font-weight:bold;cursor:pointer;
            transition:.12s;
        }
        .lb-name:hover { color:#bb86fc;text-decoration:underline; }
        .lb-guild { color:#484f58;font-size:10px;margin-left:4px; }
        .lb-dim   { color:#484f58; }
        .lb-win   { color:#3fb950;font-weight:bold; }
        .lb-ratio { color:#03dac6; }
        .lb-me td { background:rgba(187,134,252,0.06) !important; }
        .lb-me .lb-name { color:#bb86fc; }
        .lb-footer {
            padding:8px 14px;border-top:1px solid #21262d;
            font-size:10px;color:#30363d;flex-shrink:0;
        }
        `;
        document.head.appendChild(s);
    },
};
