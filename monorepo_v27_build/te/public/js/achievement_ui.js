// =================================================================
// ACHIEVEMENT UI  v1.0
// =================================================================
// TEACHING: This file does two things:
//
// 1. POPUP NOTIFICATION — when the server emits 'achievement_earned',
//    a toast slides in from the bottom-right showing the achievement
//    icon, title, and reward. It auto-dismisses after 5 seconds.
//    This is the "ding" moment every player loves.
//
// 2. ACHIEVEMENT PANEL — accessed via the 🏆 Achievements button.
//    Shows all achievements grouped by category. Earned ones are
//    bright; unearned ones are dim (hidden ones show as "???").
//    Players can also select which earned title to display in chat.
//
// The panel fetches two things:
//   - All achievement definitions (GET /api/achievements/definitions)
//     so it can show locked achievements too
//   - Player's earned achievements (GET /api/achievements/character/:id)
//     so it knows which are earned and shows the earned date
//
// Entry:
//   AchievementUI.init(charId)   — call after join_game
//   AchievementUI.toggle()       — open/close panel
//   (socket 'achievement_earned' is handled here too)
// =================================================================

const AchievementUI = {
    charId:   null,
    open:     false,
    defs:     [],       // all definitions from server
    earned:   [],       // earned by this character
    earnedSet: new Set(), // achievement IDs earned (for fast lookup)
    equippedTitle: null,

    // ── Init ──────────────────────────────────────────────────────
    init(charId) {
        AchievementUI.charId = charId;
        AchievementUI._injectStyles();
        AchievementUI._buildHudButton();
        AchievementUI._listenSocket();
    },

    _buildHudButton() {
        const bar = document.getElementById('topButtons');
        if (!bar) return;
        const btn = document.createElement('button');
        btn.className = 'hud-btn';
        btn.id        = 'achievBtn';
        btn.title     = 'Achievements';
        btn.innerHTML = '🎖️ Feats';
        btn.onclick   = () => AchievementUI.toggle();
        bar.appendChild(btn);
    },

    _listenSocket() {
        if (typeof Game === 'undefined' || !Game.socket) {
            setTimeout(() => AchievementUI._listenSocket(), 500);
            return;
        }
        Game.socket.on('achievement_earned', (data) => {
            AchievementUI._showPopup(data);
            // Refresh panel if open
            if (AchievementUI.open) AchievementUI._loadAndRender();
        });
    },

    // ── Toggle ────────────────────────────────────────────────────
    toggle() {
        AchievementUI.open ? AchievementUI.close() : AchievementUI._openPanel();
    },

    close() {
        AchievementUI.open = false;
        const el = document.getElementById('achievPanel');
        if (el) el.remove();
    },

    _openPanel() {
        AchievementUI.open = true;
        AchievementUI._buildPanel();
        AchievementUI._loadAndRender();
    },

    // ── Achievement Popup (Toast) ─────────────────────────────────
    // TEACHING: A "toast" is a small notification that briefly appears
    // and fades out on its own — no buttons needed. Used for low-friction
    // feedback. We use CSS animation (slide-in + fade-out) instead of
    // JS setTimeout for the visual part — cleaner and more reliable.
    _showPopup(data) {
        const container = document.getElementById('achievToasts') || AchievementUI._createToastContainer();

        const toast = document.createElement('div');
        toast.className = 'achiev-toast' + (data.bonus ? ' achiev-toast-bonus' : '');
        toast.innerHTML = `
            <div class="at-icon">${data.icon || '🏆'}</div>
            <div class="at-body">
                <div class="at-label">Achievement Unlocked!</div>
                <div class="at-title">${AchievementUI._esc(data.title)}</div>
                ${data.rewardGold  ? `<div class="at-reward">+${data.rewardGold}g</div>` : ''}
                ${data.newTitle    ? `<div class="at-new-title">Title: [${AchievementUI._esc(data.newTitle)}] unlocked!</div>` : ''}
            </div>`;

        container.appendChild(toast);

        // Play a simple beep via Web Audio if available
        AchievementUI._playDing();

        // Auto-remove after animation
        setTimeout(() => {
            toast.classList.add('at-fade');
            setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 600);
        }, 5000);
    },

    _createToastContainer() {
        const c = document.createElement('div');
        c.id = 'achievToasts';
        document.body.appendChild(c);
        return c;
    },

    _playDing() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.setValueAtTime(1108, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
        } catch { /* audio not available */ }
    },

    // ── Panel ─────────────────────────────────────────────────────
    _buildPanel() {
        const old = document.getElementById('achievPanel');
        if (old) old.remove();

        const panel = document.createElement('div');
        panel.id = 'achievPanel';
        panel.innerHTML = `
            <div class="ap-header">
                <span class="ap-title">🎖️ Achievements</span>
                <div style="display:flex;gap:6px;align-items:center">
                    <span id="apCount" class="ap-count"></span>
                    <button onclick="AchievementUI.close()" class="ap-close">✕</button>
                </div>
            </div>
            <div id="apTitleRow" class="ap-title-row hidden">
                <span style="color:#8b949e;font-size:11px">Active title:</span>
                <span id="apActiveTitle" class="ap-active-title">None</span>
                <button class="ap-unequip-btn" id="apUnequipBtn" onclick="AchievementUI.equipTitle(null)" style="display:none">Remove</button>
            </div>
            <div id="apBody" class="ap-body">
                <div class="ap-loading">Loading achievements…</div>
            </div>`;

        // Close on outside click
        panel.addEventListener('click', e => e.stopPropagation());
        setTimeout(() => document.addEventListener('click', AchievementUI._outsideClick), 50);
        document.body.appendChild(panel);
    },

    _outsideClick(e) {
        const panel = document.getElementById('achievPanel');
        if (panel && !panel.contains(e.target)) {
            AchievementUI.close();
            document.removeEventListener('click', AchievementUI._outsideClick);
        }
    },

    // ── Load data then render ─────────────────────────────────────
    async _loadAndRender() {
        try {
            const [defsRes, earnedRes] = await Promise.all([
                fetch('/api/achievements/definitions').then(r => r.json()),
                fetch(`/api/achievements/character/${AchievementUI.charId}`).then(r => r.json()),
            ]);
            if (defsRes.success)   AchievementUI.defs   = defsRes.data   || [];
            if (earnedRes.success) {
                AchievementUI.earned       = earnedRes.data || [];
                AchievementUI.earnedSet    = new Set(AchievementUI.earned.map(e => e.id));
                AchievementUI.equippedTitle = earnedRes.equippedTitle;
            }
            AchievementUI._render();
        } catch(e) {
            const body = document.getElementById('apBody');
            if (body) body.innerHTML = '<div class="ap-loading">Failed to load.</div>';
        }
    },

    // ── Render ────────────────────────────────────────────────────
    _render() {
        const body = document.getElementById('apBody');
        if (!body) return;

        // Update count badge
        const count = document.getElementById('apCount');
        if (count) count.textContent = `${AchievementUI.earned.length} / ${AchievementUI.defs.filter(d => !d.is_hidden).length}`;

        // Title row
        const titleRow = document.getElementById('apTitleRow');
        const activeTitle = document.getElementById('apActiveTitle');
        const unequipBtn  = document.getElementById('apUnequipBtn');
        if (titleRow && AchievementUI.equippedTitle) {
            titleRow.classList.remove('hidden');
            activeTitle.textContent = '[' + AchievementUI.equippedTitle + ']';
            unequipBtn.style.display = 'inline-block';
        } else if (titleRow) {
            titleRow.classList.remove('hidden');
            activeTitle.textContent = 'None';
            if (unequipBtn) unequipBtn.style.display = 'none';
        }

        // Group defs by category
        const CATEGORY_LABELS = {
            combat: '⚔️ Combat', exploration: '🗺️ Exploration',
            progression: '📈 Progression', social: '👥 Social', other: '⭐ Other',
        };
        const groups = {};
        for (const def of AchievementUI.defs) {
            if (!groups[def.category]) groups[def.category] = [];
            groups[def.category].push(def);
        }

        let html = '';
        for (const [cat, catDefs] of Object.entries(groups)) {
            const earnedInCat = catDefs.filter(d => AchievementUI.earnedSet.has(d.id)).length;
            html += `<div class="ap-cat-header">${CATEGORY_LABELS[cat] || cat} <span class="ap-cat-count">${earnedInCat}/${catDefs.length}</span></div>`;
            html += '<div class="ap-cat-grid">';
            for (const def of catDefs) {
                const isEarned = AchievementUI.earnedSet.has(def.id);
                const earnedData = AchievementUI.earned.find(e => e.id === def.id);
                const isHidden   = def.is_hidden && !isEarned;
                const hasTitle   = isEarned && def.reward_title;
                const isEquipped = AchievementUI.equippedTitle === def.reward_title;

                html += `<div class="ap-card ${isEarned ? 'ap-earned' : 'ap-locked'} ${isHidden ? 'ap-hidden' : ''}">
                    <div class="ap-card-icon">${isHidden ? '🔒' : def.icon}</div>
                    <div class="ap-card-body">
                        <div class="ap-card-name">${isHidden ? '???' : AchievementUI._esc(def.title)}</div>
                        ${!isHidden ? `<div class="ap-card-desc">${AchievementUI._esc(def.description || '')}</div>` : ''}
                        ${isEarned && earnedData ? `<div class="ap-card-date">Earned ${AchievementUI._formatDate(earnedData.earned_at)}</div>` : ''}
                        ${!isEarned && !isHidden && def.reward_gold ? `<div class="ap-card-reward">Reward: ${def.reward_gold}g${def.reward_title ? ` + [${AchievementUI._esc(def.reward_title)}]` : ''}</div>` : ''}
                        ${hasTitle ? `<button class="ap-title-btn ${isEquipped ? 'ap-title-equipped' : ''}"
                            onclick="AchievementUI.equipTitle('${AchievementUI._esc(def.reward_title)}')">
                            ${isEquipped ? '✓ Equipped' : 'Equip Title'}</button>` : ''}
                    </div>
                </div>`;
            }
            html += '</div>';
        }

        body.innerHTML = html || '<div class="ap-loading">No achievements defined yet.</div>';
    },

    // ── Equip/unequip title ───────────────────────────────────────
    async equipTitle(title) {
        try {
            const r = await fetch('/api/achievements/equip-title', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ charId: AchievementUI.charId, title })
            });
            const d = await r.json();
            if (d.success) {
                AchievementUI.equippedTitle = d.title;
                showNotification(d.title ? `Title [${d.title}] equipped!` : 'Title removed.', 'quest');
                AchievementUI._render();
                // Push to server so chat shows updated title
                if (typeof Game !== 'undefined' && Game.socket) {
                    Game.socket.emit('title_changed', { charId: AchievementUI.charId, title: d.title });
                }
            } else {
                showNotification('❌ ' + d.message, 'damage');
            }
        } catch(e) {
            showNotification('Network error.', 'damage');
        }
    },

    // ── Helpers ───────────────────────────────────────────────────
    _formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    },

    _esc(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/'/g,'&#39;').replace(/"/g,'&quot;');
    },

    // ── Styles ────────────────────────────────────────────────────
    _injectStyles() {
        if (document.getElementById('achievStyles')) return;
        const s = document.createElement('style');
        s.id = 'achievStyles';
        s.textContent = `
        /* ── Toast container ── */
        #achievToasts {
            position:fixed;bottom:80px;right:16px;
            display:flex;flex-direction:column;gap:8px;
            z-index:500;pointer-events:none;
        }
        .achiev-toast {
            display:flex;align-items:center;gap:12px;
            background:rgba(5,8,14,0.96);
            border:1px solid rgba(255,170,0,0.4);border-radius:10px;
            padding:12px 16px;min-width:260px;max-width:320px;
            box-shadow:0 4px 24px rgba(0,0,0,0.6);
            animation: achievSlideIn 0.4s ease forwards;
            font-family:'Courier New',monospace;
        }
        .achiev-toast-bonus { border-color:rgba(187,134,252,0.5);background:rgba(15,5,30,0.97); }
        .achiev-toast.at-fade { animation: achievFadeOut 0.6s ease forwards; }
        @keyframes achievSlideIn {
            from { opacity:0; transform:translateX(60px); }
            to   { opacity:1; transform:translateX(0); }
        }
        @keyframes achievFadeOut {
            to { opacity:0; transform:translateX(40px); }
        }
        .at-icon  { font-size:28px;flex-shrink:0; }
        .at-label { font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#ffaa00;margin-bottom:2px; }
        .achiev-toast-bonus .at-label { color:#bb86fc; }
        .at-title { font-size:13px;font-weight:bold;color:#e8eef6; }
        .at-reward    { font-size:11px;color:#3fb950;margin-top:2px; }
        .at-new-title { font-size:11px;color:#03dac6;margin-top:2px; }

        /* ── Panel ── */
        #achievPanel {
            position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            width:580px;max-width:calc(100vw - 20px);
            background:rgba(5,8,14,0.97);border:1px solid rgba(255,170,0,0.2);border-radius:12px;
            z-index:200;color:#e8eef6;font-family:'Courier New',monospace;
            box-shadow:0 8px 40px rgba(0,0,0,0.7);
            display:flex;flex-direction:column;max-height:82vh;
        }
        .ap-header {
            display:flex;justify-content:space-between;align-items:center;
            padding:12px 16px;border-bottom:1px solid #21262d;flex-shrink:0;
        }
        .ap-title  { font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#ffaa00;font-weight:bold; }
        .ap-count  { font-size:11px;color:#484f58;margin-right:8px; }
        .ap-close  { background:none;border:none;color:#484f58;cursor:pointer;font-size:16px;line-height:1; }
        .ap-close:hover { color:#8b949e; }
        .ap-title-row {
            display:flex;align-items:center;gap:10px;padding:8px 16px;
            border-bottom:1px solid #21262d;flex-shrink:0;font-size:12px;
        }
        .ap-title-row.hidden { display:none; }
        .ap-active-title { color:#03dac6;font-weight:bold; }
        .ap-unequip-btn  {
            background:none;border:1px solid #30363d;color:#484f58;cursor:pointer;
            font-size:10px;border-radius:4px;padding:2px 8px;font-family:'Courier New',monospace;
        }
        .ap-unequip-btn:hover { color:#8b949e;border-color:#484f58; }
        .ap-body {
            flex:1;overflow-y:auto;scrollbar-width:thin;
            scrollbar-color:rgba(255,255,255,0.1) transparent;padding:12px 14px;
        }
        .ap-loading { text-align:center;color:#484f58;font-size:12px;padding:30px; }
        .ap-cat-header {
            font-size:10px;text-transform:uppercase;letter-spacing:.8px;
            color:#484f58;margin:14px 0 8px;padding-bottom:4px;
            border-bottom:1px solid #21262d;display:flex;justify-content:space-between;
        }
        .ap-cat-header:first-child { margin-top:0; }
        .ap-cat-count { color:#30363d; }
        .ap-cat-grid  { display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px; }
        .ap-card {
            display:flex;align-items:flex-start;gap:10px;
            padding:10px 12px;border-radius:8px;border:1px solid transparent;transition:.12s;
        }
        .ap-earned { background:rgba(255,170,0,0.06);border-color:rgba(255,170,0,0.15); }
        .ap-locked { background:rgba(255,255,255,0.02);filter:grayscale(0.6);opacity:0.55; }
        .ap-hidden { opacity:0.35; }
        .ap-card-icon { font-size:22px;flex-shrink:0;margin-top:1px; }
        .ap-card-name { font-size:12px;font-weight:bold;color:#c9d1d9; }
        .ap-earned .ap-card-name { color:#ffaa00; }
        .ap-card-desc   { font-size:10px;color:#484f58;margin-top:2px;line-height:1.4; }
        .ap-card-date   { font-size:10px;color:#3fb950;margin-top:3px; }
        .ap-card-reward { font-size:10px;color:#8b949e;margin-top:3px; }
        .ap-title-btn {
            margin-top:5px;padding:3px 10px;border-radius:5px;cursor:pointer;font-size:10px;
            border:1px solid rgba(3,218,198,0.3);background:rgba(3,218,198,0.08);
            color:#03dac6;font-family:'Courier New',monospace;transition:.12s;
        }
        .ap-title-btn:hover { background:rgba(3,218,198,0.18); }
        .ap-title-equipped { background:rgba(3,218,198,0.2);border-color:#03dac6;color:#03dac6; }
        `;
        document.head.appendChild(s);
    },
};
