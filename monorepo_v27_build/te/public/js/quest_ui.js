// =================================================================
// QUEST UI v2 — Quest Log + HUD Tracker
// =================================================================
// Teaching notes scattered throughout so you can follow along.
//
// How data flows:
//   Server DB (quest_definitions) → /api/quests/available  → QuestUI.available[]
//   Server state_json (characters) → /api/quests/active    → QuestUI.activeQuests{}
//
// Three tabs:
//   Active    — in-progress quests with live objective progress bars
//   Board     — quests available to accept + locked quests below
//   Completed — finished quests, most recent first
//
// HUD tracker: calls updateQuestTracker() in game_engine.js after
// every load so the mini-widget below the HUD stays in sync.
//
// Hotkey: [Q] toggles the log. [ESC] closes it.
// =================================================================

const QuestUI = {

    // ─── STATE ───────────────────────────────────────────────────
    open:         false,
    tab:          'active',
    activeQuests: {},    // { questId: { title, objectives, quest_type, started_at, … } }
    available:    [],    // array from /available (includes is_active, can_accept, is_completed)

    // ─── OPEN / CLOSE / TOGGLE ───────────────────────────────────
    async toggle() {
        QuestUI.open ? QuestUI.close() : await QuestUI.openLog();
    },

    async openLog(tab) {
        if (typeof BattleUI !== 'undefined' && BattleUI.active) return;
        if (typeof Panels   !== 'undefined' && Panels.open)     return;
        QuestUI.open = true;
        if (tab) QuestUI.tab = tab;
        if (typeof Game !== 'undefined') Game.dialogueOpen = true;
        QuestUI._buildShell();
        await QuestUI.load();
    },

    close() {
        QuestUI.open = false;
        if (typeof Game !== 'undefined') Game.dialogueOpen = false;
        const el = document.getElementById('questOverlay');
        if (el) el.remove();
    },

    // ─── DATA LOAD ───────────────────────────────────────────────
    // Teaching: We always fetch both active AND available in parallel
    // (Promise.all). That means one round-trip instead of two sequential
    // ones, which is noticeably faster.
    async load() {
        QuestUI._loading(true);
                const charId = typeof Game !== 'undefined' ? Game.myCharId : null;
        if (!charId) {
            QuestUI._setContent('<p style="color:#f85149;text-align:center;padding:24px">Not logged in.</p>');
            return;
        }

        try {
            const body = JSON.stringify({ characterId: charId });
            const hdrs = { 'Content-Type': 'application/json' };

            const [activeRes, availRes] = await Promise.all([
                fetch('/api/quests/active',    { method: 'POST', headers: hdrs, body }).then(r => r.json()),
                fetch('/api/quests/available', { method: 'POST', headers: hdrs, body }).then(r => r.json()),
            ]);

            QuestUI.activeQuests = (activeRes.success && activeRes.data)  ? activeRes.data  : {};
            QuestUI.available    = (availRes.success  && availRes.data)   ? availRes.data   : [];

        } catch (e) {
            console.error('Quest load error:', e);
            QuestUI._setContent('<p style="color:#f85149;text-align:center;padding:24px">Failed to load quests. Is the server running?</p>');
            return;
        }

        QuestUI._loading(false);
        QuestUI.render();

        // Sync HUD tracker
        if (typeof updateQuestTracker === 'function') updateQuestTracker();
    },

    // ─── RENDER ROUTER ───────────────────────────────────────────
    render() {
        // Update tab button styles
        ['active', 'board', 'completed'].forEach(t => {
            const btn = document.getElementById('qtab-' + t);
            if (btn) btn.classList.toggle('qt-active', t === QuestUI.tab);
        });
        switch (QuestUI.tab) {
            case 'active':    QuestUI._renderActive();    break;
            case 'board':     QuestUI._renderBoard();     break;
            case 'completed': QuestUI._renderCompleted(); break;
        }
    },

    // ─── TAB: ACTIVE ─────────────────────────────────────────────
    _renderActive() {
        const keys = Object.keys(QuestUI.activeQuests);
        if (!keys.length) {
            QuestUI._setContent(`
                <div style="text-align:center;padding:50px;color:#484f58">
                    <div style="font-size:48px;margin-bottom:14px">📜</div>
                    <div style="font-size:15px">No active quests.</div>
                    <div style="font-size:12px;margin-top:8px;color:#30363d">
                        Switch to the <b style="color:#8b949e">Board</b> tab to find quests!
                    </div>
                </div>`);
            return;
        }
        QuestUI._setContent(keys.map(id => QuestUI._questCard(id, QuestUI.activeQuests[id])).join(''));
    },

    _questCard(questId, q) {
        const objs    = q.objectives || {};
        const objKeys = Object.keys(objs);
        const done    = objKeys.filter(k => objs[k].complete).length;
        const total   = objKeys.length;
        const allDone = total > 0 && done === total;
        const pct     = total ? Math.round(done / total * 100) : 100;

        const objRows = objKeys.map(k => {
            const o   = objs[k];
            const op  = o.target > 0 ? Math.min(100, Math.round(o.current / o.target * 100)) : 100;
            return `
            <div style="margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
                    <span style="color:${o.complete ? '#3fb950' : '#c9d1d9'}">
                        ${o.complete ? '✅' : '⬜'} ${QuestUI._esc(o.text)}
                    </span>
                    <span style="color:#484f58;font-size:11px">${o.current}/${o.target}</span>
                </div>
                <div style="height:5px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden">
                    <div style="width:${op}%;height:100%;border-radius:3px;
                         background:${o.complete ? '#3fb950' : '#bb86fc'};transition:width .4s"></div>
                </div>
            </div>`;
        }).join('');

        const startDate = q.started_at ? new Date(q.started_at).toLocaleDateString() : '';

        return `
        <div class="q-card">
            <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px">
                <div style="flex:1">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px">
                        <span style="font-size:15px;font-weight:bold;color:#e8eef6">${QuestUI._esc(q.title || questId)}</span>
                        ${QuestUI._typeBadge(q.quest_type)}
                    </div>
                    ${startDate ? `<div style="color:#484f58;font-size:10px">Started ${startDate}</div>` : ''}
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div style="font-size:20px;font-weight:bold;color:${allDone ? '#3fb950' : '#bb86fc'}">${pct}%</div>
                    <div style="font-size:9px;color:#484f58">${done}/${total}</div>
                </div>
            </div>
            <div style="margin-bottom:12px">
                ${objRows || '<div style="color:#484f58;font-size:12px">No objectives defined.</div>'}
            </div>
            <div style="display:flex;gap:8px">
                <button class="q-btn q-btn-ok" onclick="QuestUI.complete('${questId}')"
                    ${allDone ? '' : 'disabled style="opacity:.3;cursor:not-allowed"'}>
                    🏆 Turn In
                </button>
                <button class="q-btn q-btn-danger" onclick="QuestUI.abandon('${questId}','${QuestUI._esc(q.title||questId)}')">
                    ✕ Abandon
                </button>
            </div>
        </div>`;
    },

    // ─── TAB: BOARD ──────────────────────────────────────────────
    _renderBoard() {
        // Filter: exclude already-active quests (they're in the Active tab)
        const acceptable = QuestUI.available.filter(q =>  q.can_accept && !q.is_active);
        const locked     = QuestUI.available.filter(q => !q.can_accept && !q.is_completed && !q.is_active);

        if (!acceptable.length && !locked.length) {
            QuestUI._setContent(`
                <div style="text-align:center;padding:50px;color:#484f58">
                    <div style="font-size:48px;margin-bottom:14px">📋</div>
                    <div style="font-size:15px">No quests available right now.</div>
                    <div style="font-size:12px;margin-top:8px;color:#30363d">
                        Level up to unlock more quests!
                    </div>
                </div>`);
            return;
        }

        let html = '';

        if (acceptable.length) {
            html += `<div class="q-sect">Available</div>`;
            html += acceptable.map(q => `
                <div class="q-card">
                    <div style="display:flex;align-items:flex-start;gap:10px">
                        <div style="flex:1">
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px">
                                <span style="font-weight:bold;color:#e8eef6;font-size:14px">${QuestUI._esc(q.title)}</span>
                                ${QuestUI._typeBadge(q.quest_type)}
                                ${q.is_repeatable ? '<span style="color:#d29922;font-size:10px">🔁 Repeatable</span>' : ''}
                            </div>
                            ${q.description ? `<div style="color:#8b949e;font-size:12px;margin-bottom:8px">${QuestUI._esc(q.description)}</div>` : ''}
                            ${QuestUI._rewardsPreview(q.rewards_json)}
                        </div>
                        <div style="flex-shrink:0;text-align:right">
                            <div style="color:#484f58;font-size:10px">Lv.${q.required_level||1}+</div>
                        </div>
                    </div>
                    <div style="margin-top:10px">
                        <button class="q-btn q-btn-ok" onclick="QuestUI.accept('${q.quest_id}')">
                            📜 Accept
                        </button>
                    </div>
                </div>`).join('');
        }

        if (locked.length) {
            html += `<div class="q-sect" style="margin-top:20px;color:#484f58">Locked</div>`;
            html += locked.map(q => `
                <div class="q-card" style="opacity:.4">
                    <div style="display:flex;align-items:center;gap:10px">
                        <span style="font-size:20px">🔒</span>
                        <div style="flex:1">
                            <div style="font-weight:bold;color:#8b949e">${QuestUI._esc(q.title)}</div>
                            <div style="color:#484f58;font-size:11px">${QuestUI._blockReason(q.blocked_reason)}</div>
                        </div>
                        ${QuestUI._typeBadge(q.quest_type)}
                    </div>
                </div>`).join('');
        }

        QuestUI._setContent(html);
    },

    // ─── TAB: COMPLETED ──────────────────────────────────────────
    _renderCompleted() {
        const completed = QuestUI.available.filter(q => q.is_completed);
        if (!completed.length) {
            QuestUI._setContent(`
                <div style="text-align:center;padding:50px;color:#484f58">
                    <div style="font-size:48px;margin-bottom:14px">🏆</div>
                    <div style="font-size:15px">No completed quests yet.</div>
                </div>`);
            return;
        }
        QuestUI._setContent(completed.map(q => `
            <div class="q-card" style="opacity:.75">
                <div style="display:flex;align-items:center;gap:10px">
                    <span style="color:#3fb950;font-size:22px">✅</span>
                    <div style="flex:1">
                        <div style="font-weight:bold;color:#c9d1d9">${QuestUI._esc(q.title)}</div>
                        ${q.description ? `<div style="color:#484f58;font-size:11px;margin-top:2px">${QuestUI._esc(q.description)}</div>` : ''}
                    </div>
                    ${QuestUI._typeBadge(q.quest_type)}
                </div>
            </div>`).join(''));
    },

    // ─── ACTIONS ─────────────────────────────────────────────────
    // Teaching: Every action POSTs to the server, then calls load()
    // to refresh the data. This ensures the UI always reflects the
    // real DB state — never just optimistically updates locally.

    async accept(questId) {
        const { charId } = QuestUI._ids();
        const r = await fetch('/api/quests/accept', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterId: charId, questId })
        }).then(r => r.json());

        if (r.success) {
            QuestUI._toast('📜 Quest accepted!', 'item');
            QuestUI.tab = 'active';
        } else {
            QuestUI._toast(r.error || 'Could not accept quest', 'damage');
        }
        await QuestUI.load();
    },

    async complete(questId) {
        const { charId } = QuestUI._ids();
        const r = await fetch('/api/quests/complete', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterId: charId, questId })
        }).then(r => r.json());

        if (r.success) {
            const xp = r.data?.xp_awarded || 0;
            QuestUI._toast(`🏆 Quest complete! +${xp} ${LABELS.get('label_experience','XP')}`, 'gold');
            // Also award XP into the progression system so level-ups fire
            if (xp > 0) {
                fetch('/api/progression/award-xp', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ characterId: charId, amount: xp, reason: 'quest_complete' })
                }).then(r => r.json()).then(j => {
                    if (j.success && j.data.levels_gained > 0) {
                        QuestUI._toast(`⬆️ Level Up! → Lv.${j.data.new_level} (+${j.data.unspent_points} pts)`, 'item');
                        if (typeof loadCharData === 'function') loadCharData(); // refresh HUD bars
                    }
                }).catch(() => {});
            }
        } else {
            QuestUI._toast(r.error || 'Could not complete quest', 'damage');
        }
        await QuestUI.load();
    },

    async abandon(questId, title) {
        if (!confirm(`Abandon "${title}"? Your progress will be lost.`)) return;
        const { charId } = QuestUI._ids();
        const r = await fetch('/api/quests/abandon', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterId: charId, questId })
        }).then(r => r.json());

        QuestUI._toast(r.success ? 'Quest abandoned.' : (r.error || 'Error'), r.success ? 'damage' : 'damage');
        await QuestUI.load();
    },

    // ─── SWITCH TAB ──────────────────────────────────────────────
    switchTab(tab) {
        QuestUI.tab = tab;
        QuestUI.render();
    },

    // ─── DOM SHELL ───────────────────────────────────────────────
    // Teaching: We build the outer chrome once, then _setContent()
    // swaps only the inner content area as tabs change. This avoids
    // re-building the whole overlay on every render.
    _buildShell() {
        let el = document.getElementById('questOverlay');
        if (el) el.remove();

        el = document.createElement('div');
        el.id = 'questOverlay';
        el.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;z-index:120;
            background:rgba(0,0,0,0.93);overflow-y:auto;padding:30px;color:#e8eef6;`;

        el.innerHTML = `
            ${QuestUI._styles()}
            <div style="max-width:720px;margin:0 auto">
                <!-- Header -->
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;
                     border-bottom:1px solid #21262d;padding-bottom:14px">
                    <span style="font-size:26px">📜</span>
                    <h1 style="margin:0;font-size:20px;color:#bb86fc;letter-spacing:1px;font-family:'Courier New',monospace">
                        QUEST LOG
                    </h1>
                    <!-- Tab buttons -->
                    <div style="margin-left:auto;display:flex;gap:6px">
                        <button id="qtab-active"    class="q-tab" onclick="QuestUI.switchTab('active')">⚔️ Active</button>
                        <button id="qtab-board"     class="q-tab" onclick="QuestUI.switchTab('board')">📋 Board</button>
                        <button id="qtab-completed" class="q-tab" onclick="QuestUI.switchTab('completed')">🏆 Done</button>
                    </div>
                    <button onclick="QuestUI.close()" class="q-close-btn">[Q] Close</button>
                </div>
                <!-- Dynamic content -->
                <div id="questContent">
                    <div style="text-align:center;padding:40px;color:#484f58">Loading…</div>
                </div>
            </div>`;

        document.body.appendChild(el);
    },

    _styles() {
        if (document.getElementById('questStyles')) return '';
        const s = document.createElement('style');
        s.id = 'questStyles';
        s.textContent = `
        .q-tab {
            background: rgba(255,255,255,0.04); border: 1px solid #30363d;
            color: #8b949e; padding: 7px 14px; cursor: pointer;
            border-radius: 7px; font-family: 'Courier New',monospace; font-size: 12px; transition: .15s;
        }
        .q-tab:hover { color: #e8eef6; background: rgba(255,255,255,0.08); }
        .q-tab.qt-active {
            background: rgba(187,134,252,0.15); border-color: rgba(187,134,252,0.4); color: #bb86fc;
        }
        .q-close-btn {
            background: transparent; border: 1px solid #484f58; color: #8b949e;
            padding: 6px 12px; cursor: pointer; border-radius: 7px;
            font-family: 'Courier New',monospace; font-size: 12px; transition: .15s;
        }
        .q-close-btn:hover { border-color: #f85149; color: #f85149; }
        .q-card {
            background: #161b22; border: 1px solid #30363d; border-radius: 9px;
            padding: 16px; margin-bottom: 10px; transition: border-color .15s;
        }
        .q-card:hover { border-color: #484f58; }
        .q-sect {
            color: #bb86fc; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
            margin: 6px 0 10px; padding-bottom: 5px; border-bottom: 1px solid #21262d;
            font-family: 'Courier New',monospace;
        }
        .q-btn {
            padding: 7px 16px; border-radius: 7px; cursor: pointer;
            font-family: 'Courier New',monospace; font-size: 12px; font-weight: 700; transition: .15s;
        }
        .q-btn-ok     { background: rgba(63,185,80,0.12);  border: 1px solid rgba(63,185,80,0.35);  color: #3fb950; }
        .q-btn-ok:hover:not(:disabled) { background: rgba(63,185,80,0.25); }
        .q-btn-danger { background: rgba(248,81,73,0.1);   border: 1px solid rgba(248,81,73,0.28);  color: #f85149; }
        .q-btn-danger:hover { background: rgba(248,81,73,0.2); }
        .q-type-badge {
            font-size: 10px; padding: 2px 8px; border-radius: 10px;
            font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
        }`;
        document.head.appendChild(s);
        return '';
    },

    // ─── HELPERS ─────────────────────────────────────────────────
    _setContent(html) {
        const el = document.getElementById('questContent');
        if (el) el.innerHTML = html;
    },

    _loading(on) {
        if (on) QuestUI._setContent('<div style="text-align:center;padding:40px;color:#484f58">Loading…</div>');
    },

    _toast(text, type) {
        if (typeof showNotification === 'function') showNotification(text, type);
    },

    _ids() {
        return {
            charId: typeof Game !== 'undefined' ? Game.myCharId : null
        };
    },

    _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;'); },

    _typeBadge(type) {
        const map = {
            main:  { label:'Main',  bg:'rgba(187,134,252,0.15)', color:'#bb86fc' },
            side:  { label:'Side',  bg:'rgba(3,218,198,0.1)',    color:'#03dac6' },
            daily: { label:'Daily', bg:'rgba(210,153,34,0.15)',  color:'#d29922' },
            guild: { label:'Guild', bg:'rgba(255,170,68,0.12)',  color:'#ffaa44' },
        };
        const cfg = map[type] || { label: type || 'Quest', bg:'rgba(255,255,255,0.07)', color:'#8b949e' };
        return `<span class="q-type-badge" style="background:${cfg.bg};color:${cfg.color}">${cfg.label}</span>`;
    },

    _rewardsPreview(rewardsJson) {
        let r = null;
        try { r = typeof rewardsJson === 'string' ? JSON.parse(rewardsJson) : rewardsJson; } catch {}
        if (!r) return '';
        const parts = [];
        if (r.xp)    parts.push(`<span style="color:#3fb950">+${r.xp} ${LABELS.get('label_experience','XP')}</span>`);
        if (r.gold)  parts.push(`<span style="color:#d29922">+${r.gold} 💰</span>`);
        if (r.items?.length) parts.push(`<span style="color:#bb86fc">+Items</span>`);
        return parts.length ? `<div style="font-size:11px;color:#8b949e">Rewards: ${parts.join('  ')}</div>` : '';
    },

    _blockReason(reason) {
        return {
            level_too_low:     'Level too low',
            already_completed: 'Already completed',
            max_completions:   'Max completions reached',
            cooldown:          'On cooldown — try again later',
            already_active:    'Already active',
            too_many_active:   'Too many active quests (max 10)',
        }[reason] || reason || 'Not available';
    },
};
