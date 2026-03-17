// =================================================================
// MAIL UI  v1.0
// =================================================================
// Teaching: Player mail lets you leave messages for offline players.
// It works like real email: compose → sent to server → stored in DB
// → recipient sees it next time they log in.
//
// Gold attachments: gold is deducted from sender immediately.
// Recipient must click "Collect" to receive it. If they delete the
// mail without collecting, gold is returned to sender automatically.
//
// Entry: MailUI.init(charId) — called from game_engine init_self
// Toggle: MailUI.toggle()
// =================================================================

const MailUI = {

    // ── State ─────────────────────────────────────────────────────
    charId:      null,
    open:        false,
    tab:         'inbox',       // 'inbox' | 'compose'
    inbox:       [],
    selectedId:  null,
    unreadCount: 0,

    // ── Init ──────────────────────────────────────────────────────
    init(charId) {
        MailUI.charId = charId;
        MailUI._buildButton();
        MailUI._bindSocketEvents();
    },

    // ── HUD Button ────────────────────────────────────────────────
    _buildButton() {
        const hud = document.getElementById('hud');
        if (!hud) return;
        const btn = document.createElement('div');
        btn.id    = 'mailHudBtn';
        btn.title = 'Player Mail';
        btn.innerHTML = `📬 <span id="mailBadge" style="display:none"></span>`;
        btn.onclick = () => MailUI.toggle();
        hud.appendChild(btn);
        MailUI._injectStyles();
    },

    _setUnread(n) {
        MailUI.unreadCount = n;
        const badge = document.getElementById('mailBadge');
        if (!badge) return;
        badge.style.display = n > 0 ? 'inline' : 'none';
        badge.textContent   = n > 99 ? '99+' : n;
    },

    // ── Toggle ────────────────────────────────────────────────────
    toggle() {
        MailUI.open ? MailUI.close() : MailUI._openPanel();
    },

    close() {
        MailUI.open = false;
        const el = document.getElementById('mailPanel');
        if (el) el.remove();
        document.removeEventListener('click', MailUI._outsideClick);
    },

    _openPanel() {
        MailUI.open = true;
        MailUI._buildPanel();
        MailUI._loadInbox();
        setTimeout(() => document.addEventListener('click', MailUI._outsideClick), 50);
    },

    _outsideClick(e) {
        const panel = document.getElementById('mailPanel');
        const btn   = document.getElementById('mailHudBtn');
        if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
            MailUI.close();
        }
    },

    // ── Build Panel ───────────────────────────────────────────────
    _buildPanel() {
        const el = document.getElementById('mailPanel');
        if (el) el.remove();

        const hudEl   = document.getElementById('hud');
        const hudRect = hudEl ? hudEl.getBoundingClientRect() : { left: 10, bottom: 50 };

        const panel = document.createElement('div');
        panel.id = 'mailPanel';
        panel.style.cssText = `
            position:fixed;left:${hudRect.left}px;top:${hudRect.bottom+8}px;
            width:380px;max-height:480px;background:rgba(5,8,14,0.97);
            border:1px solid rgba(187,134,252,0.2);border-radius:10px;
            z-index:51;color:#e8eef6;font-family:'Courier New',monospace;
            box-shadow:0 4px 24px rgba(0,0,0,0.6);display:flex;flex-direction:column;
        `;
        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;
                 padding:10px 14px 8px;border-bottom:1px solid #21262d">
                <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;
                      color:#bb86fc;font-weight:bold">📬 Mailbox</span>
                <div style="display:flex;gap:6px;align-items:center">
                    <button class="mail-tab-btn active" id="mailtab-inbox"
                        onclick="MailUI.switchTab('inbox')">Inbox</button>
                    <button class="mail-tab-btn" id="mailtab-compose"
                        onclick="MailUI.switchTab('compose')">✏️ Compose</button>
                    <button onclick="MailUI.close()"
                        style="background:none;border:none;color:#484f58;cursor:pointer;font-size:16px;line-height:1">✕</button>
                </div>
            </div>
            <div id="mailContent" style="flex:1;overflow-y:auto;scrollbar-width:thin;
                 scrollbar-color:rgba(255,255,255,0.1) transparent">
                <div style="color:#484f58;text-align:center;padding:20px;font-size:12px">Loading…</div>
            </div>`;
        document.body.appendChild(panel);
    },

    // ── Tab Switching ─────────────────────────────────────────────
    switchTab(tab) {
        MailUI.tab = tab;
        document.querySelectorAll('.mail-tab-btn').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('mailtab-' + tab);
        if (btn) btn.classList.add('active');
        if (tab === 'inbox')   MailUI._renderInbox();
        if (tab === 'compose') MailUI._renderCompose();
    },

    // ── Load Inbox ────────────────────────────────────────────────
    async _loadInbox() {
        try {
            const r = await fetch(`/api/mail/inbox/${MailUI.charId}`);
            const d = await r.json();
            if (!d.success) return;
            MailUI.inbox = d.data || [];
            MailUI._setUnread(MailUI.inbox.filter(m => !m.is_read).length);
            if (MailUI.tab === 'inbox') MailUI._renderInbox();
        } catch {}
    },

    // ── Render Inbox ──────────────────────────────────────────────
    _renderInbox() {
        const box = document.getElementById('mailContent');
        if (!box) return;
        if (!MailUI.inbox.length) {
            box.innerHTML = `<div style="color:#484f58;text-align:center;padding:28px;font-size:12px">
                No mail. <button class="mail-link-btn" onclick="MailUI.switchTab('compose')">Send some?</button></div>`;
            return;
        }

        // List view if no message selected; detail view if selected
        if (!MailUI.selectedId) {
            box.innerHTML = MailUI.inbox.map(m => `
                <div class="mail-row ${!m.is_read ? 'mail-unread' : ''}"
                     onclick="MailUI.openMail(${m.id})">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <span style="font-weight:${m.is_read ? 'normal' : 'bold'};color:${m.is_read ? '#8b949e' : '#e8eef6'};font-size:13px">
                            ${MailUI._esc(m.sender_name)}
                            ${m.gold_attachment && !m.gold_collected ? '<span style="color:#ffaa00;font-size:11px"> 💰</span>' : ''}
                        </span>
                        <span style="color:#484f58;font-size:10px">${MailUI._relTime(m.sent_at)}</span>
                    </div>
                    <div style="font-size:11px;color:#484f58;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                        ${MailUI._esc(m.subject)}
                    </div>
                </div>`).join('');
        }
    },

    async openMail(mailId) {
        MailUI.selectedId = mailId;
        const m = MailUI.inbox.find(x => x.id === mailId);
        if (!m) return;

        // Mark as read
        if (!m.is_read) {
            await fetch('/api/mail/read', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ charId: MailUI.charId, mailId })
            });
            m.is_read = 1;
            MailUI._setUnread(MailUI.inbox.filter(x => !x.is_read).length);
        }

        const box = document.getElementById('mailContent');
        if (!box) return;

        const expiresStr = m.expires_at ? `Expires: ${new Date(m.expires_at).toLocaleDateString()}` : '';

        box.innerHTML = `
            <div style="padding:12px 14px">
                <button class="mail-link-btn" onclick="MailUI.selectedId=null;MailUI._renderInbox()"
                    style="margin-bottom:10px">← Back to inbox</button>
                <div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #21262d">
                    <div style="font-weight:bold;font-size:14px;color:#e8eef6;margin-bottom:3px">
                        ${MailUI._esc(m.subject)}</div>
                    <div style="font-size:11px;color:#484f58">
                        From: <span style="color:#8b949e">${MailUI._esc(m.sender_name)}</span>
                        &nbsp;·&nbsp; ${new Date(m.sent_at).toLocaleString()}
                        ${expiresStr ? `&nbsp;·&nbsp; <span style="color:#d29922">${expiresStr}</span>` : ''}
                    </div>
                </div>

                <div style="font-size:13px;color:#c9d1d9;white-space:pre-wrap;line-height:1.6;margin-bottom:14px">
                    ${MailUI._esc(m.body)}</div>

                ${m.gold_attachment > 0 ? `
                    <div style="background:rgba(255,170,0,0.08);border:1px solid rgba(255,170,0,0.25);
                         border-radius:7px;padding:10px 12px;margin-bottom:12px;display:flex;
                         align-items:center;justify-content:space-between">
                        <span style="color:#ffaa00;font-size:13px">💰 ${m.gold_attachment.toLocaleString()} gold attached</span>
                        ${m.gold_collected
                            ? `<span style="color:#484f58;font-size:11px">Collected</span>`
                            : `<button class="mail-btn mail-btn-gold"
                                   onclick="MailUI.collectGold(${mailId})">Collect Gold</button>`}
                    </div>` : ''}

                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <button class="mail-btn" onclick="MailUI.replyTo('${MailUI._esc(m.sender_name)}')">↩ Reply</button>
                    <button class="mail-btn mail-btn-danger" onclick="MailUI.deleteMail(${mailId})">🗑 Delete</button>
                </div>
            </div>`;
    },

    async collectGold(mailId) {
        const r = await fetch('/api/mail/collect-gold', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId: MailUI.charId, mailId })
        });
        const d = await r.json();
        if (d.success) {
            showNotification(`💰 Collected ${d.gold} gold!`, 'gold');
            const m = MailUI.inbox.find(x => x.id === mailId);
            if (m) m.gold_collected = 1;
            MailUI.openMail(mailId);
        } else {
            showNotification('❌ ' + d.message, 'error');
        }
    },

    async deleteMail(mailId) {
        const m = MailUI.inbox.find(x => x.id === mailId);
        if (m?.gold_attachment && !m.gold_collected) {
            if (!confirm('This mail has uncollected gold. Deleting it will return the gold to the sender. Continue?')) return;
        }
        await fetch('/api/mail/delete', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId: MailUI.charId, mailId })
        });
        MailUI.inbox = MailUI.inbox.filter(x => x.id !== mailId);
        MailUI.selectedId = null;
        MailUI._setUnread(MailUI.inbox.filter(x => !x.is_read).length);
        MailUI._renderInbox();
    },

    replyTo(name) {
        MailUI.switchTab('compose');
        setTimeout(() => {
            const inp = document.getElementById('mailToInput');
            if (inp) inp.value = name;
            const sub = document.getElementById('mailSubjectInput');
            if (sub) sub.value = 'Re: ';
            document.getElementById('mailBodyInput')?.focus();
        }, 50);
    },

    // ── Compose ───────────────────────────────────────────────────
    _renderCompose(prefill = {}) {
        const box = document.getElementById('mailContent');
        if (!box) return;
        box.innerHTML = `
            <div style="padding:12px 14px;display:flex;flex-direction:column;gap:8px">
                <div>
                    <div class="mail-label">To (character name)</div>
                    <input id="mailToInput" class="mail-input" type="text"
                           value="${MailUI._esc(prefill.to || '')}" placeholder="Recipient's name…">
                </div>
                <div>
                    <div class="mail-label">Subject</div>
                    <input id="mailSubjectInput" class="mail-input" type="text" maxlength="120"
                           value="${MailUI._esc(prefill.subject || '')}" placeholder="Subject…">
                </div>
                <div>
                    <div class="mail-label">Message</div>
                    <textarea id="mailBodyInput" class="mail-input" rows="5" maxlength="2000"
                        style="resize:vertical" placeholder="Your message…">${MailUI._esc(prefill.body || '')}</textarea>
                </div>
                <div>
                    <div class="mail-label">Gold Attachment (optional)</div>
                    <input id="mailGoldInput" class="mail-input" type="number" min="0" max="1000000"
                           value="0" placeholder="0">
                </div>
                <div style="display:flex;gap:8px;margin-top:4px">
                    <button class="mail-btn mail-btn-send" onclick="MailUI.sendMail()">📤 Send</button>
                    <button class="mail-btn" onclick="MailUI.switchTab('inbox')">Cancel</button>
                </div>
                <div id="mailSendStatus" style="font-size:11px;min-height:16px"></div>
            </div>`;
    },

    async sendMail() {
        const to      = document.getElementById('mailToInput')?.value.trim();
        const subject = document.getElementById('mailSubjectInput')?.value.trim() || 'No subject';
        const body    = document.getElementById('mailBodyInput')?.value.trim();
        const gold    = parseInt(document.getElementById('mailGoldInput')?.value) || 0;
        const status  = document.getElementById('mailSendStatus');

        if (!to || !body) {
            if (status) { status.textContent = '❌ To and message are required.'; status.style.color = '#f85149'; }
            return;
        }

        // Resolve recipient charId by name (look in online players first, then API)
        const online = typeof Game !== 'undefined' ? Object.values(Game.players) : [];
        let found = online.find(p => p.name.toLowerCase() === to.toLowerCase());
        let recipientCharId = found ? found.charId : null;

        if (!recipientCharId) {
            // Try name lookup endpoint
            const nr = await fetch(`/api/party/friends/find-by-name?name=${encodeURIComponent(to)}`);
            const nd = await nr.json();
            if (!nd.success || !nd.charId) {
                if (status) { status.textContent = '❌ Player not found.'; status.style.color = '#f85149'; }
                return;
            }
            recipientCharId = nd.charId;
        }

        const r = await fetch('/api/mail/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                charId: MailUI.charId,
                recipientCharId,
                subject, body,
                goldAttachment: gold
            })
        });
        const d = await r.json();
        if (d.success) {
            if (status) { status.textContent = '✅ ' + d.message; status.style.color = '#3fb950'; }
            setTimeout(() => MailUI.switchTab('inbox'), 1500);
        } else {
            if (status) { status.textContent = '❌ ' + d.message; status.style.color = '#f85149'; }
        }
    },

    // ── Public: open compose pre-filled (e.g. from NearbyUI) ──────
    composeTo(name) {
        if (!MailUI.open) MailUI._openPanel();
        MailUI.switchTab('compose');
        setTimeout(() => {
            const inp = document.getElementById('mailToInput');
            if (inp) { inp.value = name; document.getElementById('mailBodyInput')?.focus(); }
        }, 80);
    },

    // ── Socket Events ─────────────────────────────────────────────
    _bindSocketEvents() {
        const tryBind = () => {
            if (typeof Game === 'undefined' || !Game.socket) { setTimeout(tryBind, 200); return; }

            // Unread count pushed on login from server.js
            Game.socket.on('mail_unread_count', ({ count }) => {
                MailUI._setUnread(count);
                if (count > 0) showNotification(`📬 You have ${count} unread mail${count===1?'':'s'}!`, 'quest');
            });

            // New mail arrived while online
            Game.socket.on('mail_received', ({ from, subject, hasGold }) => {
                showNotification(`📬 New mail from ${from}: "${subject}"${hasGold ? ' 💰' : ''}`, 'quest');
                MailUI._setUnread(MailUI.unreadCount + 1);
                if (MailUI.open) MailUI._loadInbox();
            });

            // Gold refund notification
            Game.socket.on('mail_gold_refund', ({ text }) => {
                showNotification(text, 'gold');
            });
        };
        tryBind();
    },

    // ── Styles ────────────────────────────────────────────────────
    _injectStyles() {
        if (document.getElementById('mailUIStyles')) return;
        const s = document.createElement('style');
        s.id = 'mailUIStyles';
        s.textContent = `
        #mailHudBtn {
            display:inline-flex;align-items:center;gap:4px;
            padding:4px 10px;border-radius:6px;cursor:pointer;
            font-size:12px;color:#8b949e;font-family:'Courier New',monospace;transition:.15s;
        }
        #mailHudBtn:hover { color:#bb86fc; }
        #mailBadge {
            background:#f85149;color:#fff;border-radius:8px;
            font-size:9px;padding:0 4px;min-width:14px;text-align:center;
        }
        .mail-tab-btn {
            padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;
            color:#484f58;border:none;background:none;font-family:'Courier New',monospace;transition:.12s;
        }
        .mail-tab-btn:hover { color:#8b949e; }
        .mail-tab-btn.active { color:#e8eef6;background:rgba(255,255,255,0.06); }
        .mail-row {
            padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.04);
            cursor:pointer;transition:.12s;
        }
        .mail-row:hover { background:rgba(255,255,255,0.04); }
        .mail-unread { border-left:3px solid #bb86fc; }
        .mail-label { font-size:10px;color:#484f58;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px; }
        .mail-input {
            width:100%;padding:6px 10px;background:rgba(255,255,255,0.05);
            border:1px solid rgba(187,134,252,0.2);color:#e8eef6;
            border-radius:6px;font-family:'Courier New',monospace;font-size:12px;
            outline:none;box-sizing:border-box;transition:.12s;
        }
        .mail-input:focus { border-color:rgba(187,134,252,0.5); }
        textarea.mail-input { resize:vertical;min-height:90px; }
        .mail-btn {
            padding:7px 14px;border-radius:7px;cursor:pointer;font-size:12px;
            background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);
            color:#8b949e;font-family:'Courier New',monospace;transition:.12s;
        }
        .mail-btn:hover { color:#e8eef6; }
        .mail-btn-send { background:rgba(187,134,252,0.15);color:#bb86fc;border-color:rgba(187,134,252,0.35); }
        .mail-btn-send:hover { background:rgba(187,134,252,0.28); }
        .mail-btn-gold { background:rgba(255,170,0,.15);color:#ffaa00;border:1px solid rgba(255,170,0,.35);
            padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-family:'Courier New',monospace; }
        .mail-btn-gold:hover { background:rgba(255,170,0,.28); }
        .mail-btn-danger { background:rgba(248,81,73,.1);color:#f85149;border-color:rgba(248,81,73,.25); }
        .mail-btn-danger:hover { background:rgba(248,81,73,.22); }
        .mail-link-btn {
            background:none;border:none;color:#bb86fc;cursor:pointer;
            font-size:11px;font-family:'Courier New',monospace;text-decoration:underline;
        }
        `;
        document.head.appendChild(s);
    },

    // ── Util ──────────────────────────────────────────────────────
    _esc(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;');
    },
    _relTime(iso) {
        if (!iso) return '';
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff/60000);
        if (m < 2)   return 'just now';
        if (m < 60)  return `${m}m ago`;
        const h = Math.floor(m/60);
        if (h < 24)  return `${h}h ago`;
        return `${Math.floor(h/24)}d ago`;
    },
};
