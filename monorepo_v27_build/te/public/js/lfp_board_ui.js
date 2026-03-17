// =================================================================
// LFP BOARD UI  v1.0
// =================================================================
// TEACHING: LFP = "Looking For Party." This panel does two things:
//
//   1. Shows a live board of everyone currently looking for a group,
//      with their class, level, role, and what content they want.
//      You can click a name to inspect them or hit DM to message them.
//
//   2. Lets YOU post your own listing — choose your role (DPS/Tank/
//      Healer/Support), write a note ("Need dungeon run, have healer"),
//      and pick what content type you want.
//
// Setting your status to ⚔️ LFP via PresenceUI is the quick version.
// Using this board is the full version — it gives other players
// enough info to actually decide if you're a good fit for their group.
//
// The board auto-refreshes every 60 seconds. Listings expire after
// 4 hours server-side (handled by the scheduler cleanup job).
//
// Entry: LFPBoardUI.toggle()
// HUD button is added in init().
// =================================================================

const LFPBoardUI = {

    open:     false,
    charId:   null,
    charData: null,
    _listings: [],
    _myListing: null,
    _refreshTimer: null,

    ROLE_ICONS: { DPS:'⚔️', Tank:'🛡️', Healer:'💚', Support:'✨', Any:'🎲' },
    CLASS_ICONS: { Warrior:'⚔️', Mage:'🔮', Rogue:'🗡️', Healer:'💚',
                   Ranger:'🏹', Necromancer:'💀', Paladin:'🛡️', Druid:'🌿' },
    CONTENT_TYPES: ['Dungeons','PvP','Quests','Exploration','Guild Run','Boss Hunt','Any'],

    // ── Init ──────────────────────────────────────────────────────
    init(charId, charData) {
        LFPBoardUI.charId   = charId;
        LFPBoardUI.charData = charData || {};
        LFPBoardUI._injectStyles();
        LFPBoardUI._buildHudButton();
    },

    _buildHudButton() {
        const bar = document.getElementById('topButtons');
        if (!bar) return;
        const btn = document.createElement('button');
        btn.className = 'hud-btn';
        btn.id = 'lfpBtn';
        btn.innerHTML = '⚔️ LFP';
        btn.title = 'Looking For Party Board';
        btn.onclick = () => LFPBoardUI.toggle();
        bar.appendChild(btn);
    },

    // ── Toggle ────────────────────────────────────────────────────
    toggle() {
        LFPBoardUI.open ? LFPBoardUI.close() : LFPBoardUI._openBoard();
    },

    close() {
        LFPBoardUI.open = false;
        clearInterval(LFPBoardUI._refreshTimer);
        const el = document.getElementById('lfpBoardPanel');
        if (el) el.remove();
    },

    async _openBoard() {
        LFPBoardUI.open = true;
        LFPBoardUI._buildShell();
        await LFPBoardUI._loadBoard();
        // Auto-refresh every 60s
        LFPBoardUI._refreshTimer = setInterval(() => LFPBoardUI._loadBoard(), 60000);
    },

    _buildShell() {
        const old = document.getElementById('lfpBoardPanel');
        if (old) old.remove();
        const el = document.createElement('div');
        el.id = 'lfpBoardPanel';
        el.innerHTML = `
        <div class="lfp-header">
            <span class="lfp-title">⚔️ Looking For Party</span>
            <button onclick="LFPBoardUI.close()" class="lfp-close">✕</button>
        </div>
        <div class="lfp-body" style="display:flex;align-items:center;justify-content:center;padding:40px">
            <span style="color:#484f58;font-size:12px">Loading board…</span>
        </div>`;
        el.addEventListener('click', e => e.stopPropagation());
        document.body.appendChild(el);
    },

    // ── Load board data ───────────────────────────────────────────
    async _loadBoard() {
        try {
            const r = await fetch('/api/lfp/board', { credentials: 'include' });
            const d = await r.json();
            if (!d.success) return;
            LFPBoardUI._listings = d.listings || [];
            LFPBoardUI._myListing = LFPBoardUI._listings.find(l => l.character_id === LFPBoardUI.charId) || null;
            LFPBoardUI._render();
        } catch(e) {
            const body = document.querySelector('#lfpBoardPanel .lfp-body');
            if (body) body.innerHTML = `<div style="color:#f85149;font-size:12px">Error: ${e.message}</div>`;
        }
    },

    // ── Render ────────────────────────────────────────────────────
    _render() {
        const old = document.getElementById('lfpBoardPanel');
        if (old) old.remove();
        if (!LFPBoardUI.open) return;

        const listings  = LFPBoardUI._listings;
        const myListing = LFPBoardUI._myListing;
        const isListed  = !!myListing;

        const panel = document.createElement('div');
        panel.id = 'lfpBoardPanel';
        panel.innerHTML = `
        <div class="lfp-header">
            <div>
                <span class="lfp-title">⚔️ Looking For Party</span>
                <span style="font-size:10px;color:#484f58;margin-left:10px">${listings.length} player${listings.length!==1?'s':''} looking</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
                <button class="lfp-refresh-btn" onclick="LFPBoardUI._loadBoard()" title="Refresh">↻</button>
                <button onclick="LFPBoardUI.close()" class="lfp-close">✕</button>
            </div>
        </div>

        <!-- My listing status bar -->
        <div class="lfp-my-status">
            ${isListed ? `
            <div class="lfp-listed-bar">
                <span>⚔️ You are listed — <strong>${LFPBoardUI.ROLE_ICONS[myListing.role]} ${myListing.role}</strong>
                ${myListing.note ? ` · <em style="color:#8b949e">${LFPBoardUI._esc(myListing.note)}</em>` : ''}
                </span>
                <button class="lfp-btn lfp-btn-red" onclick="LFPBoardUI._unlist()">✕ Unlist Me</button>
            </div>` : `
            <button class="lfp-btn lfp-btn-post" onclick="LFPBoardUI._togglePostForm()">
                ⚔️ Post My Listing
            </button>`}
        </div>

        <!-- Post form (hidden by default) -->
        <div id="lfpPostForm" class="lfp-post-form" style="display:none">
            <div class="lfp-form-grid">
                <div class="lfp-field">
                    <label>My Role</label>
                    <div class="lfp-role-grid">
                        ${Object.entries(LFPBoardUI.ROLE_ICONS).map(([role, icon]) =>
                            `<button class="lfp-role-btn" id="lfpRole_${role}"
                                onclick="LFPBoardUI._selectRole('${role}')">${icon} ${role}</button>`
                        ).join('')}
                    </div>
                </div>
                <div class="lfp-field">
                    <label>Content</label>
                    <select id="lfpContent" class="lfp-input">
                        <option value="">— Any content —</option>
                        ${LFPBoardUI.CONTENT_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="lfp-field">
                <label>Note <span style="color:#484f58;font-size:10px">(optional, 255 chars)</span></label>
                <input id="lfpNote" type="text" class="lfp-input" maxlength="255"
                    placeholder="e.g. Need tank for dungeon, have healer ready">
            </div>
            <div style="display:flex;gap:8px;margin-top:8px">
                <button class="lfp-btn lfp-btn-post" onclick="LFPBoardUI._submitListing()">⚔️ Post Listing</button>
                <button class="lfp-btn" onclick="LFPBoardUI._togglePostForm()">Cancel</button>
            </div>
            <div id="lfpPostMsg" style="font-size:11px;min-height:18px;margin-top:4px;color:#3fb950"></div>
        </div>

        <!-- Board -->
        <div class="lfp-body">
            ${listings.length === 0
                ? `<div style="text-align:center;padding:30px;color:#484f58;font-size:12px">
                    No one is listed right now.<br>
                    <span style="font-size:11px">Be the first — post your listing above!</span>
                   </div>`
                : `<div class="lfp-list">
                    ${listings.map(l => LFPBoardUI._renderRow(l)).join('')}
                   </div>`
            }
        </div>`;

        panel.addEventListener('click', e => e.stopPropagation());
        document.body.appendChild(panel);

        // Pre-select role if already listed
        if (!isListed) LFPBoardUI._selectRole('Any');
    },

    _renderRow(l) {
        const isMe      = l.character_id === LFPBoardUI.charId;
        const roleIcon  = LFPBoardUI.ROLE_ICONS[l.role]  || '🎲';
        const classIcon = LFPBoardUI.CLASS_ICONS[l.class_name] || '⚔️';
        const accent    = l.profile_color || '#bb86fc';
        const online    = l.is_online ? '🟢' : '⚫';
        const expires   = LFPBoardUI._formatExpiry(l.expires_at);

        return `
        <div class="lfp-row${isMe ? ' lfp-row-me' : ''}">
            <div class="lfp-row-left">
                <div class="lfp-row-icons">
                    <span title="${l.class_name}">${classIcon}</span>
                    <span title="${l.role}" class="lfp-role-badge">${roleIcon}</span>
                </div>
                <div class="lfp-row-info">
                    <div class="lfp-row-name">
                        <span style="color:${accent};font-weight:bold">${LFPBoardUI._esc(l.character_name)}</span>
                        ${l.equipped_title ? `<span style="font-size:10px;color:${accent}">[${LFPBoardUI._esc(l.equipped_title)}]</span>` : ''}
                        <span style="font-size:11px">${online}</span>
                        ${isMe ? '<span style="font-size:10px;color:#ffaa00">(you)</span>' : ''}
                    </div>
                    <div class="lfp-row-sub">
                        ${classIcon} ${LFPBoardUI._esc(l.class_name)} · Lv.${l.level}
                        ${l.content_type ? ` · <span style="color:#58a6ff">${LFPBoardUI._esc(l.content_type)}</span>` : ''}
                        · <span style="color:#484f58">${expires}</span>
                    </div>
                    ${l.note ? `<div class="lfp-row-note">"${LFPBoardUI._esc(l.note)}"</div>` : ''}
                </div>
            </div>
            <div class="lfp-row-actions">
                ${!isMe ? `
                <button class="lfp-action-btn" title="View Profile"
                    onclick="PlayerInspect.open(${l.character_id})">👤</button>
                <button class="lfp-action-btn" title="Send DM"
                    onclick="ChatUI.startDM(${l.character_id},'${LFPBoardUI._esc(l.character_name)}')">💬</button>
                ` : ''}
            </div>
        </div>`;
    },

    // ── Form actions ──────────────────────────────────────────────
    _selectedRole: 'Any',

    _togglePostForm() {
        const f = document.getElementById('lfpPostForm');
        if (f) f.style.display = f.style.display === 'none' ? '' : 'none';
    },

    _selectRole(role) {
        LFPBoardUI._selectedRole = role;
        document.querySelectorAll('.lfp-role-btn').forEach(btn => btn.classList.remove('lfp-role-active'));
        const btn = document.getElementById('lfpRole_' + role);
        if (btn) btn.classList.add('lfp-role-active');
    },

    async _submitListing() {
        const note        = document.getElementById('lfpNote')?.value || '';
        const contentType = document.getElementById('lfpContent')?.value || '';
        const msg         = document.getElementById('lfpPostMsg');

        try {
            const r = await fetch('/api/lfp/list', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    charId: LFPBoardUI.charId,
                    role:   LFPBoardUI._selectedRole,
                    note, contentType
                })
            });
            const d = await r.json();
            if (d.success) {
                // Also update PresenceUI to show LFP
                if (typeof PresenceUI !== 'undefined') PresenceUI._applyStatus('lfp', 'Looking for Party');
                showNotification('⚔️ You are now listed on the LFP board!', 'quest');
                await LFPBoardUI._loadBoard();
            } else {
                if (msg) { msg.style.color = '#f85149'; msg.textContent = '❌ ' + d.error; }
            }
        } catch(e) {
            if (msg) { msg.style.color = '#f85149'; msg.textContent = '❌ Error: ' + e.message; }
        }
    },

    async _unlist() {
        try {
            const r = await fetch('/api/lfp/unlist', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ charId: LFPBoardUI.charId })
            });
            const d = await r.json();
            if (d.success) {
                if (typeof PresenceUI !== 'undefined') PresenceUI._applyStatus('online', '');
                showNotification('✅ Removed from LFP board.', 'quest');
                await LFPBoardUI._loadBoard();
            }
        } catch {}
    },

    // ── Helpers ───────────────────────────────────────────────────
    _formatExpiry(ts) {
        if (!ts) return '';
        const mins = Math.round((new Date(ts) - Date.now()) / 60000);
        if (mins <= 0) return 'expiring…';
        if (mins < 60) return `${mins}m left`;
        return `${Math.floor(mins/60)}h left`;
    },

    _esc(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    },

    // ── Styles ────────────────────────────────────────────────────
    _injectStyles() {
        if (document.getElementById('lfpStyles')) return;
        const s = document.createElement('style');
        s.id = 'lfpStyles';
        s.textContent = `
        #lfpBoardPanel {
            position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            width:540px;max-width:calc(100vw - 16px);
            background:rgba(5,8,14,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:12px;
            z-index:200;color:#e8eef6;font-family:'Courier New',monospace;
            box-shadow:0 8px 40px rgba(0,0,0,0.8);display:flex;flex-direction:column;max-height:86vh;
        }
        .lfp-header {
            display:flex;justify-content:space-between;align-items:center;
            padding:12px 16px;border-bottom:1px solid #21262d;flex-shrink:0;
        }
        .lfp-title { font-size:13px;font-weight:bold;color:#58a6ff;text-transform:uppercase;letter-spacing:1px; }
        .lfp-close { background:none;border:none;color:#484f58;cursor:pointer;font-size:16px; }
        .lfp-close:hover { color:#8b949e; }
        .lfp-refresh-btn {
            background:none;border:1px solid #21262d;color:#484f58;border-radius:5px;
            width:24px;height:24px;cursor:pointer;font-size:14px;
        }
        .lfp-refresh-btn:hover { color:#8b949e;border-color:#484f58; }
        .lfp-my-status {
            padding:10px 16px;border-bottom:1px solid #21262d;flex-shrink:0;
            display:flex;align-items:center;gap:8px;
        }
        .lfp-listed-bar {
            display:flex;justify-content:space-between;align-items:center;width:100%;
            background:rgba(88,166,255,0.07);border:1px solid rgba(88,166,255,0.2);
            border-radius:7px;padding:8px 12px;font-size:12px;
        }
        .lfp-post-form {
            padding:12px 16px;border-bottom:1px solid #21262d;flex-shrink:0;
            background:rgba(255,255,255,0.02);
        }
        .lfp-form-grid { display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px; }
        .lfp-field { display:flex;flex-direction:column;gap:5px; }
        .lfp-field label { font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px; }
        .lfp-role-grid { display:flex;flex-wrap:wrap;gap:5px; }
        .lfp-role-btn {
            padding:4px 10px;border-radius:6px;border:1px solid #21262d;background:rgba(255,255,255,0.03);
            color:#484f58;cursor:pointer;font-size:11px;font-family:'Courier New',monospace;transition:.1s;
        }
        .lfp-role-btn:hover { color:#8b949e;border-color:#484f58; }
        .lfp-role-active { background:rgba(88,166,255,0.12);border-color:rgba(88,166,255,0.4);color:#58a6ff !important; }
        .lfp-input {
            background:rgba(255,255,255,0.04);border:1px solid #21262d;border-radius:6px;
            color:#e8eef6;font-size:12px;font-family:'Courier New',monospace;padding:6px 8px;outline:none;
        }
        .lfp-input:focus { border-color:#58a6ff; }
        .lfp-btn {
            padding:7px 14px;border-radius:6px;cursor:pointer;font-size:11px;
            border:1px solid #30363d;background:rgba(255,255,255,0.04);
            color:#8b949e;font-family:'Courier New',monospace;transition:.12s;white-space:nowrap;
        }
        .lfp-btn:hover { background:rgba(255,255,255,0.08);color:#e8eef6; }
        .lfp-btn-post { background:rgba(88,166,255,0.12);border-color:rgba(88,166,255,0.35);color:#58a6ff; }
        .lfp-btn-post:hover { background:rgba(88,166,255,0.22); }
        .lfp-btn-red  { background:rgba(248,81,73,0.1);border-color:rgba(248,81,73,0.3);color:#f85149; }
        .lfp-btn-red:hover { background:rgba(248,81,73,0.2); }
        .lfp-body {
            flex:1;overflow-y:auto;scrollbar-width:thin;
            scrollbar-color:rgba(255,255,255,0.1) transparent;
        }
        .lfp-list { padding:4px 0; }
        .lfp-row {
            display:flex;justify-content:space-between;align-items:center;
            padding:10px 16px;border-bottom:1px solid #21262d;transition:.1s;
        }
        .lfp-row:last-child { border-bottom:none; }
        .lfp-row:hover { background:rgba(255,255,255,0.02); }
        .lfp-row-me { background:rgba(88,166,255,0.04); }
        .lfp-row-left { display:flex;gap:12px;align-items:flex-start;flex:1; }
        .lfp-row-icons { display:flex;flex-direction:column;gap:3px;font-size:18px;flex-shrink:0; }
        .lfp-role-badge { font-size:12px; }
        .lfp-row-info { flex:1;min-width:0; }
        .lfp-row-name { display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px; }
        .lfp-row-sub  { font-size:10px;color:#484f58;margin-bottom:3px; }
        .lfp-row-note { font-size:11px;color:#8b949e;font-style:italic; }
        .lfp-row-actions { display:flex;gap:5px;flex-shrink:0;margin-left:10px; }
        .lfp-action-btn {
            width:28px;height:28px;border-radius:6px;border:1px solid #21262d;
            background:rgba(255,255,255,0.03);cursor:pointer;font-size:13px;
            display:flex;align-items:center;justify-content:center;
        }
        .lfp-action-btn:hover { background:rgba(255,255,255,0.08);border-color:#484f58; }
        `;
        document.head.appendChild(s);
    },
};
