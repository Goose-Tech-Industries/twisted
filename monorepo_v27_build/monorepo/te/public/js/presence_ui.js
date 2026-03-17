// =================================================================
// PRESENCE UI  v1.0
// =================================================================
// TEACHING: This is the "away status" system — inspired by AIM
// (AOL Instant Messenger), which was iconic for letting people set
// custom away messages in the 2000s.
//
// Four statuses:
//   🟢 Online    — normal active play
//   🌙 Away      — idle/stepped away; shows away message
//   🔴 Busy      — Do Not Disturb; DMs still come through
//   ⚔️ LFP       — Looking For Party; shows in nearby panel
//   👻 Invisible — appears offline to others (but still plays)
//
// The away message is a freeform text box — players can write
// anything: "BRB food", "listening to music", "at work lol".
// It's the personal touch that makes the game feel like a community.
//
// Architecture:
//   - PresenceUI.setStatus() → emits socket 'set_presence' + HTTP POST
//   - game_engine.js listens for 'player_presence_changed' and updates
//     the local player map so NearbyUI reflects it immediately
//   - The status badge shows in the HUD next to the player name
//
// =================================================================

const PresenceUI = {

    // Status definitions
    STATUSES: {
        online:    { label: 'Online',    icon: '🟢', color: '#3fb950', desc: 'Actively playing' },
        away:      { label: 'Away',      icon: '🌙', color: '#e3b341', desc: 'Stepped away' },
        busy:      { label: 'Busy',      icon: '🔴', color: '#f85149', desc: 'Do Not Disturb' },
        lfp:       { label: 'LFP',       icon: '⚔️', color: '#58a6ff', desc: 'Looking For Party' },
        invisible: { label: 'Invisible', icon: '👻', color: '#484f58', desc: 'Appear offline' },
    },

    current:      'online',
    awayMessage:  '',
    charId:       null,
    _open:        false,

    // ── Init ──────────────────────────────────────────────────────
    init(charId) {
        PresenceUI.charId = charId;
        PresenceUI._injectStyles();
        PresenceUI._buildHudWidget();
        PresenceUI._listenSocket();
        PresenceUI._startAutoAway();
    },

    // ── Auto-away ─────────────────────────────────────────────────
    // TEACHING: We watch for mouse/keyboard/touch activity. If nothing
    // happens for 10 minutes and the player is currently "online",
    // we automatically switch them to "away" with the message "AFK".
    // The moment they move or press a key, we restore "online".
    //
    // This is pure client-side — no server round-trip until status
    // changes. The socket emit in _applyStatus handles the broadcast.
    _autoAwayTimer: null,
    _wasAutoAway: false,
    _AUTO_AWAY_MS: 10 * 60 * 1000, // 10 minutes

    _startAutoAway() {
        const reset = () => {
            clearTimeout(PresenceUI._autoAwayTimer);
            // If we were auto-afk'd, restore to online
            if (PresenceUI._wasAutoAway) {
                PresenceUI._wasAutoAway = false;
                PresenceUI._applyStatus('online', '');
            }
            // Schedule next auto-away
            PresenceUI._autoAwayTimer = setTimeout(() => {
                // Only auto-away if currently online (don't override busy/lfp/invisible)
                if (PresenceUI.current === 'online') {
                    PresenceUI._wasAutoAway = true;
                    PresenceUI._applyStatus('away', 'AFK');
                }
            }, PresenceUI._AUTO_AWAY_MS);
        };

        ['mousemove','keydown','mousedown','touchstart','wheel'].forEach(ev =>
            document.addEventListener(ev, reset, { passive: true })
        );
        reset(); // arm immediately
    },

    _buildHudWidget() {
        // Find the HUD level badge area to attach to
        const hudLevel = document.getElementById('hudLevel');
        if (!hudLevel) return;

        // Insert a small clickable status dot next to the level badge
        const widget = document.createElement('div');
        widget.id = 'presenceWidget';
        widget.innerHTML = `
            <span id="presenceDot" class="presence-dot presence-online" title="Set status"
                  onclick="PresenceUI.togglePicker()">🟢</span>
        `;
        // Insert after the HUD level element
        hudLevel.parentNode.insertBefore(widget, hudLevel.nextSibling);
    },

    // ── Toggle picker ─────────────────────────────────────────────
    togglePicker() {
        PresenceUI._open ? PresenceUI.closePicker() : PresenceUI.openPicker();
    },

    openPicker() {
        PresenceUI._open = true;
        const old = document.getElementById('presencePicker');
        if (old) old.remove();

        const s = PresenceUI.STATUSES;
        const picker = document.createElement('div');
        picker.id = 'presencePicker';

        const optionsHtml = Object.entries(s).map(([key, def]) => `
            <div class="pp-option ${PresenceUI.current === key ? 'pp-active' : ''}"
                 onclick="PresenceUI.selectStatus('${key}')">
                <span class="pp-icon">${def.icon}</span>
                <div>
                    <div class="pp-label" style="color:${def.color}">${def.label}</div>
                    <div class="pp-desc">${def.desc}</div>
                </div>
            </div>`).join('');

        picker.innerHTML = `
            <div class="pp-header">Set Status</div>
            ${optionsHtml}
            <div class="pp-divider"></div>
            <div class="pp-away-section" id="ppAwaySection"
                 style="${['away','busy'].includes(PresenceUI.current) ? '' : 'display:none'}">
                <div class="pp-away-label">💬 Away Message</div>
                <textarea id="ppAwayMsg" class="pp-away-input"
                    placeholder="What are you up to? (AIM-style 😄)"
                    maxlength="255"
                >${PresenceUI.awayMessage}</textarea>
                <button class="pp-save-btn" onclick="PresenceUI.saveAwayMessage()">Save</button>
            </div>`;

        document.body.appendChild(picker);

        // Position near the presence dot
        const dot = document.getElementById('presenceDot');
        if (dot) {
            const r = dot.getBoundingClientRect();
            picker.style.top  = (r.bottom + 6) + 'px';
            picker.style.left = Math.max(4, r.left - 160) + 'px';
        }

        // Close on outside click
        setTimeout(() => document.addEventListener('click', PresenceUI._outsideClick), 30);
    },

    closePicker() {
        PresenceUI._open = false;
        const el = document.getElementById('presencePicker');
        if (el) el.remove();
        document.removeEventListener('click', PresenceUI._outsideClick);
    },

    _outsideClick(e) {
        const p = document.getElementById('presencePicker');
        const d = document.getElementById('presenceDot');
        if (p && !p.contains(e.target) && (!d || !d.contains(e.target))) {
            PresenceUI.closePicker();
        }
    },

    // ── Select status ─────────────────────────────────────────────
    selectStatus(status) {
        PresenceUI.current = status;

        // Update all option highlights
        document.querySelectorAll('.pp-option').forEach(el => el.classList.remove('pp-active'));
        const opts = document.querySelectorAll('.pp-option');
        const keys = Object.keys(PresenceUI.STATUSES);
        const idx  = keys.indexOf(status);
        if (opts[idx]) opts[idx].classList.add('pp-active');

        // Show away message textarea for away/busy
        const awaySection = document.getElementById('ppAwaySection');
        if (awaySection) {
            awaySection.style.display = ['away','busy'].includes(status) ? '' : 'none';
        }

        // Apply immediately
        const awayMsg = document.getElementById('ppAwayMsg')?.value || PresenceUI.awayMessage;
        PresenceUI._applyStatus(status, awayMsg);
    },

    saveAwayMessage() {
        const msg = document.getElementById('ppAwayMsg')?.value || '';
        PresenceUI.awayMessage = msg;
        PresenceUI._applyStatus(PresenceUI.current, msg);
        PresenceUI.closePicker();
        showNotification('✅ Status updated', 'quest');
    },

    // ── Apply status (socket + HTTP) ──────────────────────────────
    _applyStatus(status, awayMessage) {
        PresenceUI.current     = status;
        PresenceUI.awayMessage = awayMessage || '';
        PresenceUI._updateDot(status);

        // Socket (instant broadcast to map)
        if (typeof Game !== 'undefined' && Game.socket) {
            Game.socket.emit('set_presence', { status, awayMessage: PresenceUI.awayMessage });
        }

        // HTTP (persist to DB)
        fetch('/set-presence', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId: PresenceUI.charId, status, awayMessage: PresenceUI.awayMessage })
        }).catch(() => {}); // non-critical
    },

    _updateDot(status) {
        const dot  = document.getElementById('presenceDot');
        const def  = PresenceUI.STATUSES[status] || PresenceUI.STATUSES.online;
        if (!dot) return;
        dot.textContent = def.icon;
        dot.title = def.label + (PresenceUI.awayMessage ? ': ' + PresenceUI.awayMessage : '');
        dot.className = 'presence-dot';
    },

    // ── Socket listener (others' status changes) ─────────────────
    _listenSocket() {
        if (typeof Game === 'undefined' || !Game.socket) {
            setTimeout(() => PresenceUI._listenSocket(), 400);
            return;
        }
        Game.socket.on('player_presence_changed', ({ charId, presence, awayMessage }) => {
            // Update the in-memory player list so NearbyUI re-renders correctly
            if (typeof Game.players !== 'undefined' && Game.players[charId]) {
                Game.players[charId].presence    = presence;
                Game.players[charId].awayMessage = awayMessage;
            }
            // If NearbyUI is open, refresh it
            if (typeof NearbyUI !== 'undefined' && NearbyUI.open) NearbyUI.refresh();
        });
    },

    // ── Helpers ───────────────────────────────────────────────────
    // Returns the status icon for a given status string (used by NearbyUI, inspect card)
    getIcon(status) {
        return (PresenceUI.STATUSES[status] || PresenceUI.STATUSES.online).icon;
    },

    getLabel(status) {
        return (PresenceUI.STATUSES[status] || PresenceUI.STATUSES.online).label;
    },

    // ── Styles ────────────────────────────────────────────────────
    _injectStyles() {
        if (document.getElementById('presenceStyles')) return;
        const s = document.createElement('style');
        s.id = 'presenceStyles';
        s.textContent = `
        #presenceWidget { display:inline; }
        .presence-dot {
            font-size:14px;cursor:pointer;margin-left:6px;
            vertical-align:middle;transition:.15s;display:inline-block;
        }
        .presence-dot:hover { transform:scale(1.2); }

        #presencePicker {
            position:fixed;z-index:300;
            background:rgba(5,8,14,0.97);border:1px solid rgba(255,255,255,0.1);
            border-radius:10px;padding:8px;width:220px;
            box-shadow:0 8px 32px rgba(0,0,0,0.7);
            font-family:'Courier New',monospace;
        }
        .pp-header {
            font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#484f58;
            padding:4px 8px 8px;
        }
        .pp-option {
            display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:7px;
            cursor:pointer;transition:.1s;
        }
        .pp-option:hover  { background:rgba(255,255,255,0.06); }
        .pp-option.pp-active { background:rgba(187,134,252,0.1);border:1px solid rgba(187,134,252,0.2); }
        .pp-icon   { font-size:16px;flex-shrink:0; }
        .pp-label  { font-size:12px;font-weight:bold; }
        .pp-desc   { font-size:9px;color:#484f58;margin-top:1px; }
        .pp-divider { height:1px;background:#21262d;margin:6px 0; }
        .pp-away-section { padding:4px 6px 6px; }
        .pp-away-label { font-size:10px;color:#8b949e;margin-bottom:5px; }
        .pp-away-input {
            width:100%;background:rgba(255,255,255,0.04);border:1px solid #21262d;
            border-radius:6px;color:#e8eef6;font-size:11px;font-family:'Courier New',monospace;
            padding:8px;resize:none;height:64px;outline:none;
        }
        .pp-away-input:focus { border-color:#bb86fc; }
        .pp-save-btn {
            margin-top:6px;width:100%;padding:6px;background:rgba(187,134,252,0.15);
            border:1px solid rgba(187,134,252,0.3);color:#bb86fc;border-radius:6px;
            cursor:pointer;font-family:'Courier New',monospace;font-size:11px;
        }
        .pp-save-btn:hover { background:rgba(187,134,252,0.25); }
        `;
        document.head.appendChild(s);
    },
};
