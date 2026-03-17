// =================================================================
// PLAYER INSPECT  v1.0
// =================================================================
// Teaching: This is the "right-click a player to see their profile"
// feature that every MMO has. We reuse the existing /get-char-full
// endpoint — it already returns everything we need. We just need to
// call it with someone ELSE's charId (the server allows this for
// public profile data; it only guards private actions like equipping).
//
// The inspect card shows:
//   - Name, class, race, level, guild
//   - HP/MP bars (current values are private — show max only)
//   - Battle record (W/L/T)
//   - Current location (map name)
//   - Quick actions: DM, Add Friend, Mail, Trade
//
// Entry: PlayerInspect.open(charId)
// Can be called from:
//   - Leaderboard player name clicks
//   - Chat message name clicks (we wire into ChatUI)
//   - Nearby Players panel
// =================================================================

const PlayerInspect = {

    currentCharId: null,

    // ── Open ──────────────────────────────────────────────────────
    async open(charId) {
        if (!charId) return;
        PlayerInspect.currentCharId = charId;

        // Remove any existing card
        const old = document.getElementById('inspectCard');
        if (old) old.remove();

        // Build loading state
        const card = PlayerInspect._buildCard();
        document.body.appendChild(card);
        PlayerInspect._injectStyles();

        // Fetch profile data
        try {
            const r = await fetch('/get-char-full', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ charId })
            });
            const d = await r.json();
            if (!d.success) {
                PlayerInspect._setContent(card, `<div class="ic-empty">Player not found.</div>`);
                return;
            }
            PlayerInspect._populate(card, d, charId);
        } catch {
            PlayerInspect._setContent(card, `<div class="ic-empty">Failed to load profile.</div>`);
        }
    },

    close() {
        const card = document.getElementById('inspectCard');
        if (card) card.remove();
        PlayerInspect.currentCharId = null;
    },

    // ── Build Card Shell ──────────────────────────────────────────
    _buildCard() {
        const card = document.createElement('div');
        card.id = 'inspectCard';
        card.innerHTML = `
            <div class="ic-header">
                <span class="ic-title">👤 Player Profile</span>
                <button class="ic-close" onclick="PlayerInspect.close()">✕</button>
            </div>
            <div id="icBody" class="ic-body">
                <div class="ic-empty">Loading…</div>
            </div>`;

        // Close on click outside
        card.addEventListener('click', (e) => e.stopPropagation());
        setTimeout(() => {
            document.addEventListener('click', PlayerInspect._outsideClick);
        }, 50);

        return card;
    },

    _outsideClick(e) {
        const card = document.getElementById('inspectCard');
        if (card && !card.contains(e.target)) {
            PlayerInspect.close();
            document.removeEventListener('click', PlayerInspect._outsideClick);
        }
    },

    _setContent(card, html) {
        const body = card.querySelector('#icBody');
        if (body) body.innerHTML = html;
    },

    // ── Populate ──────────────────────────────────────────────────
    _populate(card, d, charId) {
        const c  = d.character;
        const es = d.effectiveStats;
        const br = d.battleRecord || { W: 0, L: 0, T: 0 };
        const isSelf = (typeof Game !== 'undefined' && Game.myCharId === charId);

        // Guild membership — look up by checking guild_members (d.guild may be present)
        const guildName = d.guild?.name || null;

        // Check if they're online
        const isOnline = typeof Game !== 'undefined'
            && Object.values(Game.players || {}).some(p => p.charId === charId);

        // W/L ratio
        const ratio = br.L > 0 ? (br.W / br.L).toFixed(2) : br.W + '.00';

        // Class icon mapping (simple fallback)
        const CLASS_ICONS = { Warrior:'⚔️', Mage:'🔮', Rogue:'🗡️', Healer:'💚',
                               Ranger:'🏹', Paladin:'🛡️', Necromancer:'💀', Bard:'🎵' };
        const classIcon = CLASS_ICONS[c.class_name] || '⚔️';

        const body = card.querySelector('#icBody');
        if (!body) return;

        body.innerHTML = `
            <!-- Name + status -->
            <div class="ic-name-row">
                <div>
                    <div class="ic-name">${PlayerInspect._esc(c.name)}</div>
                    <div class="ic-sub">
                        ${classIcon} ${PlayerInspect._esc(c.class_name || '?')} ·
                        ${PlayerInspect._esc(c.race_name || '?')} ·
                        <span style="color:#bb86fc">Lv.${c.level}</span>
                    </div>
                    ${guildName ? `<div class="ic-guild">🏰 ${PlayerInspect._esc(guildName)}</div>` : ''}
                    ${c.equipped_title ? `<div style="font-size:10px;color:#03dac6;margin-top:2px">[${PlayerInspect._esc(c.equipped_title)}]</div>` : ''}
                    ${c.presence && c.presence !== 'online' ? `<div style="font-size:10px;color:#e3b341;margin-top:2px">
                        ${c.presence==='away'?'🌙':c.presence==='busy'?'🔴':c.presence==='lfp'?'⚔️':'👻'}
                        ${c.presence.toUpperCase()}${c.away_message ? ' — ' + PlayerInspect._esc(c.away_message) : ''}
                    </div>` : ''}
                </div>
                <div class="ic-online-dot ${isOnline ? 'ic-online' : 'ic-offline'}"
                     title="${isOnline ? 'Online' : 'Offline'}"></div>
            </div>

            <!-- Stats row -->
            <div class="ic-stats-row">
                <div class="ic-stat">
                    <div class="ic-stat-label">Max HP</div>
                    <div class="ic-stat-val" style="color:#e74c3c">${es.maxHp}</div>
                </div>
                <div class="ic-stat">
                    <div class="ic-stat-label">Max MP</div>
                    <div class="ic-stat-val" style="color:#2e86c1">${es.maxMp}</div>
                </div>
                <div class="ic-stat">
                    <div class="ic-stat-label">ATK</div>
                    <div class="ic-stat-val">${es.atk}</div>
                </div>
                <div class="ic-stat">
                    <div class="ic-stat-label">DEF</div>
                    <div class="ic-stat-val">${es.def}</div>
                </div>
                <div class="ic-stat">
                    <div class="ic-stat-label">SPD</div>
                    <div class="ic-stat-val">${es.speed}</div>
                </div>
            </div>

            <!-- Battle record -->
            <div class="ic-record">
                <span class="ic-record-label">Battle Record</span>
                <span style="color:#3fb950">${br.W}W</span>
                <span style="color:#484f58">/</span>
                <span style="color:#f85149">${br.L}L</span>
                <span style="color:#484f58">/</span>
                <span style="color:#8b949e">${br.T || 0}T</span>
                <span class="ic-ratio">(${ratio})</span>
            </div>

            ${!isSelf ? `
            <!-- Actions -->
            <div class="ic-actions">
                <button class="ic-btn ic-btn-dm"
                    onclick="PlayerInspect._dm(${charId},'${PlayerInspect._esc(c.name)}')">💬 DM</button>
                <button class="ic-btn ic-btn-friend"
                    onclick="PlayerInspect._addFriend(${charId},'${PlayerInspect._esc(c.name)}')">👥 Friend</button>
                <button class="ic-btn ic-btn-mail"
                    onclick="PlayerInspect._mail('${PlayerInspect._esc(c.name)}')">📬 Mail</button>
                <a class="ic-btn ic-btn-card" href="/card/${encodeURIComponent(c.name)}" target="_blank">🃏 Card</a>
                ${isOnline ? `<button class="ic-btn ic-btn-trade"
                    onclick="PlayerInspect._trade(${charId})">🤝 Trade</button>` : ''}
                <button class="ic-btn ic-btn-report"
                    onclick="PlayerInspect._report(${charId},'${PlayerInspect._esc(c.name)}')">🚩</button>
            </div>` : `<div class="ic-empty" style="font-size:11px;padding:8px 0">This is you 👋</div>`}
        `;
    },

    // ── Quick Actions ─────────────────────────────────────────────
    _dm(charId, name) {
        if (typeof ChatUI !== 'undefined') ChatUI.startDM(charId, name);
        PlayerInspect.close();
    },

    async _addFriend(charId, name) {
        if (!confirm(`Send a friend request to ${name}?`)) return;
        const myCharId = typeof Game !== 'undefined' ? Game.myCharId : null;
        if (!myCharId) return;

        const r = await fetch('/api/party/friends/request', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId: myCharId, targetCharId: charId })
        });
        const d = await r.json();
        if (d.success) {
            showNotification(`👥 Friend request sent to ${name}!`, 'quest');
            // Socket push so they see it in real time
            if (typeof Game !== 'undefined' && Game.socket) {
                Game.socket.emit('friend_request_sent', { targetCharId: charId });
            }
        } else {
            showNotification('❌ ' + (d.error || d.message), 'error');
        }
        PlayerInspect.close();
    },

    _mail(name) {
        if (typeof MailUI !== 'undefined') MailUI.composeTo(name);
        PlayerInspect.close();
    },

    _trade(charId) {
        if (typeof TradeUI !== 'undefined') TradeUI.requestTrade(charId);
        else if (typeof Game !== 'undefined') Game.socket.emit('trade_request', { targetCharId: charId });
        PlayerInspect.close();
    },

    // ── Report ────────────────────────────────────────────────────
    _report(reportedCharId, reportedName) {
        PlayerInspect.close();
        const old = document.getElementById('inspectReportModal');
        if (old) old.remove();
        const modal = document.createElement('div');
        modal.id = 'inspectReportModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:500;display:flex;align-items:center;justify-content:center;';
        modal.innerHTML = `
        <div style="background:#0d1117;border:1px solid #30363d;border-radius:12px;
                    padding:22px;width:340px;max-width:calc(100vw - 24px);font-family:'Courier New',monospace">
            <div style="font-size:13px;font-weight:bold;margin-bottom:14px;color:#e8eef6">
                🚩 Report ${PlayerInspect._esc(reportedName)}
            </div>
            <select id="irReason" style="width:100%;background:#161b22;border:1px solid #30363d;
                border-radius:6px;color:#e8eef6;padding:7px;font-size:12px;margin-bottom:10px;outline:none">
                <option value="harassment">Harassment</option>
                <option value="cheating">Cheating / Exploiting</option>
                <option value="spam">Spam</option>
                <option value="offensive_name">Offensive Name</option>
                <option value="bug_abuse">Bug Abuse</option>
                <option value="other">Other</option>
            </select>
            <textarea id="irDetails" maxlength="500" placeholder="Details (optional)…"
                style="width:100%;background:#161b22;border:1px solid #30363d;border-radius:6px;
                       color:#e8eef6;padding:7px;font-size:12px;resize:none;min-height:54px;
                       outline:none;box-sizing:border-box;margin-bottom:12px"></textarea>
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button onclick="document.getElementById('inspectReportModal').remove()"
                    style="padding:7px 14px;border-radius:6px;border:1px solid #30363d;
                           background:none;color:#8b949e;cursor:pointer;font-size:11px">Cancel</button>
                <button onclick="PlayerInspect._submitReport(${reportedCharId})"
                    style="padding:7px 14px;border-radius:6px;border:1px solid rgba(248,81,73,.4);
                           background:rgba(248,81,73,.12);color:#f85149;cursor:pointer;font-size:11px">
                    Submit
                </button>
            </div>
            <div id="irMsg" style="font-size:11px;min-height:16px;margin-top:8px;text-align:center"></div>
        </div>`;
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    },

    async _submitReport(reportedCharId) {
        const reason  = document.getElementById('irReason')?.value;
        const details = document.getElementById('irDetails')?.value?.trim();
        const msgEl   = document.getElementById('irMsg');
        try {
            const r = await fetch('/api/auth/report-player', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reporterCharId: typeof Game !== 'undefined' ? Game.myCharId : null,
                    reportedCharId, reason, details
                })
            });
            const d = await r.json();
            if (d.success) {
                msgEl.style.color = '#3fb950';
                msgEl.textContent = '✅ Reported. Thank you.';
                setTimeout(() => document.getElementById('inspectReportModal')?.remove(), 2000);
            } else {
                msgEl.style.color = '#f85149';
                msgEl.textContent = '❌ ' + (d.error || 'Failed.');
            }
        } catch(e) {
            msgEl.style.color = '#f85149';
            msgEl.textContent = '❌ ' + e.message;
        }
    },

    // ── Wire into ChatUI names ────────────────────────────────────
    // TEACHING: ChatUI renders player names as clickable spans with
    // onclick="ChatUI.startDM(...)". We override that to show the inspect
    // card instead, which gives the player MORE options (not just DM).
    // We do this by monkey-patching _renderMessage after ChatUI is ready.
    _patchChatUI() {
        if (typeof ChatUI === 'undefined') { setTimeout(PlayerInspect._patchChatUI, 300); return; }
        const orig = ChatUI._renderMessage.bind(ChatUI);
        ChatUI._renderMessage = function(msg, forceShow = false) {
            orig(msg, forceShow);
            // After rendering, find the name span we just added and update its onclick
            const box = document.getElementById('chatMessages');
            if (!box) return;
            const last = box.lastElementChild;
            if (!last) return;
            const nameEl = last.querySelector('.chat-name[onclick]');
            if (nameEl && msg.fromCharId) {
                const charId = msg.fromCharId;
                const name   = PlayerInspect._esc(msg.from);
                nameEl.setAttribute('onclick', `PlayerInspect.open(${charId})`);
                nameEl.setAttribute('title', `View ${name}'s profile`);
            }
        };
    },

    // ── Styles ────────────────────────────────────────────────────
    _injectStyles() {
        if (document.getElementById('inspectStyles')) return;
        const s = document.createElement('style');
        s.id = 'inspectStyles';
        s.textContent = `
        #inspectCard {
            position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            width:320px;background:rgba(5,8,14,0.97);
            border:1px solid rgba(3,218,198,0.25);border-radius:12px;
            z-index:210;color:#e8eef6;font-family:'Courier New',monospace;
            box-shadow:0 8px 40px rgba(0,0,0,0.8);
        }
        .ic-header {
            display:flex;justify-content:space-between;align-items:center;
            padding:10px 14px;border-bottom:1px solid #21262d;
        }
        .ic-title { font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#03dac6;font-weight:bold; }
        .ic-close { background:none;border:none;color:#484f58;cursor:pointer;font-size:16px;line-height:1; }
        .ic-close:hover { color:#8b949e; }
        .ic-body { padding:14px; }
        .ic-empty { color:#484f58;text-align:center;font-size:12px;padding:16px; }
        .ic-name-row { display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px; }
        .ic-name { font-size:16px;font-weight:bold;color:#e8eef6; }
        .ic-sub  { font-size:11px;color:#8b949e;margin-top:3px; }
        .ic-guild { font-size:11px;color:#ffaa44;margin-top:2px; }
        .ic-online-dot {
            width:10px;height:10px;border-radius:50%;flex-shrink:0;margin-top:4px;
        }
        .ic-online  { background:#3fb950;box-shadow:0 0 6px #3fb950; }
        .ic-offline { background:#30363d; }
        .ic-stats-row {
            display:flex;gap:6px;margin-bottom:12px;
            padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;
        }
        .ic-stat { flex:1;text-align:center; }
        .ic-stat-label { font-size:9px;color:#484f58;text-transform:uppercase;letter-spacing:.4px; }
        .ic-stat-val   { font-size:13px;font-weight:bold;color:#c9d1d9;margin-top:2px; }
        .ic-record {
            display:flex;align-items:center;gap:6px;font-size:12px;
            padding:8px;background:rgba(255,255,255,0.03);border-radius:8px;
            margin-bottom:12px;
        }
        .ic-record-label { color:#484f58;font-size:10px;text-transform:uppercase;letter-spacing:.4px;margin-right:4px; }
        .ic-ratio { color:#03dac6;font-size:11px;margin-left:2px; }
        .ic-actions { display:flex;gap:6px;flex-wrap:wrap; }
        .ic-btn {
            flex:1;min-width:60px;padding:7px 6px;border-radius:7px;cursor:pointer;
            font-size:11px;border:none;font-family:'Courier New',monospace;transition:.12s;
        }
        .ic-btn-dm     { background:rgba(187,134,252,.15);color:#bb86fc;border:1px solid rgba(187,134,252,.3); }
        .ic-btn-friend { background:rgba(3,218,198,.12);color:#03dac6;border:1px solid rgba(3,218,198,.3); }
        .ic-btn-mail   { background:rgba(255,170,0,.12);color:#ffaa00;border:1px solid rgba(255,170,0,.3); }
        .ic-btn-trade  { background:rgba(63,185,80,.12);color:#3fb950;border:1px solid rgba(63,185,80,.3); }
        .ic-btn-report { background:rgba(248,81,73,.08);color:#f85149;border:1px solid rgba(248,81,73,.25);padding:6px 8px; }
        .ic-btn-report:hover { background:rgba(248,81,73,.2); }
        .ic-btn-card   { background:rgba(187,134,252,.1);color:#bb86fc;border:1px solid rgba(187,134,252,.3);text-decoration:none;display:inline-flex;align-items:center;justify-content:center; }
        .ic-btn-card:hover { background:rgba(187,134,252,.2); }
        .ic-btn-report:hover { background:rgba(248,81,73,.2); }
        .ic-btn:hover  { filter:brightness(1.3); }
        `;
        document.head.appendChild(s);
    },

    _esc(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;');
    },
};
