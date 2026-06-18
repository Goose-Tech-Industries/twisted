// =================================================================
// PLAYER MANAGER — search, inspect, ban, give items, change roles
// =================================================================
const PlayerManager = {
    _items: [],

    async init() {
        document.getElementById('managerTitle').textContent = '👥 Player Manager';
        // Pre-load items for give-item dropdown
        const r = await API.getAll('item').catch(() => ({ success: false }));
        PlayerManager._items = r.success ? r.data : [];
        PlayerManager._renderSearch();
    },

    _renderSearch(q = '') {
        document.getElementById('dynamicArea').innerHTML = `
        <style>
        .pm-table { width:100%;border-collapse:collapse;margin-top:16px }
        .pm-table th { text-align:left;color:#484f58;font-size:11px;text-transform:uppercase;
            letter-spacing:.5px;border-bottom:1px solid #21262d;padding:10px 12px }
        .pm-table td { padding:10px 12px;border-bottom:1px solid #161b22;font-size:13px }
        .pm-table tr:hover td { background:rgba(255,255,255,.02) }
        .role-badge { display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700 }
        .role-OWNER { background:rgba(255,215,0,.15);color:gold }
        .role-ADMIN { background:rgba(248,81,73,.15);color:#f85149 }
        .role-GM    { background:rgba(187,134,252,.15);color:#bb86fc }
        .role-MOD   { background:rgba(66,165,245,.15);color:#42A5F5 }
        .role-PLAYER{ background:rgba(255,255,255,.05);color:#484f58 }
        </style>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px;flex-wrap:wrap">
            <input id="pm_search" placeholder="Search username or email…" value="${q}"
                style="flex:1;min-width:200px;max-width:400px"
                onkeydown="if(event.key==='Enter') PlayerManager._search()">
            <button class="action-btn" onclick="PlayerManager._search()">🔍 Search</button>
            <button class="edit-btn" onclick="PlayerManager._search('')">Show All</button>
        </div>
        <div id="pm_results"><p style="color:#484f58;text-align:center;padding:40px">Enter a search term or press "Show All"</p></div>`;
        if (q) PlayerManager._search(q);
    },

    async _search(q) {
        if (q === undefined) q = document.getElementById('pm_search')?.value || '';
        const res = document.getElementById('pm_results');
        res.innerHTML = '<p style="color:#484f58;text-align:center;padding:20px">Loading…</p>';
        const r = await fetch(`/admin-panel/players?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        if (!d.success) { res.innerHTML = `<p style="color:#f85149">${d.message}</p>`; return; }
        const players = d.data;
        if (!players.length) { res.innerHTML = '<p style="color:#484f58;text-align:center;padding:20px">No players found.</p>'; return; }

        res.innerHTML = `<table class="pm-table">
        <thead><tr>
            <th></th><th>Username</th><th>Role</th><th>Gold</th>
            <th>Chars</th><th>Last Login</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${players.map(p => `
        <tr>
            <td><span style="font-size:8px;color:${p.online ? '#3fb950' : '#484f58'}" title="${p.online ? 'Online' : 'Offline'}">●</span></td>
            <td><b style="color:#e8eef6">${p.username}</b><br><span style="color:#484f58;font-size:10px">${p.email||''}</span></td>
            <td><span class="role-badge role-${p.role}">${p.role}</span></td>
            <td style="color:#d29922">💰 ${(p.gold||0).toLocaleString()}</td>
            <td style="color:#8b949e">${p.char_count}</td>
            <td style="color:#484f58;font-size:11px">${p.last_login ? new Date(p.last_login).toLocaleDateString() : '—'}</td>
            <td>${p.is_banned ? '<span style="color:#f85149;font-size:11px">🚫 Banned</span>' : '<span style="color:#3fb950;font-size:11px">✓ Active</span>'}</td>
            <td><button class="edit-btn" onclick="PlayerManager.viewPlayer(${p.id})">VIEW</button></td>
        </tr>`).join('')}
        </tbody></table>`;
    },

    async viewPlayer(userId) {
        const r = await fetch(`/admin-panel/player/${userId}`);
        const d = await r.json();
        if (!d.success) { alert(d.message); return; }
        const { user, chars, online } = d.data;

        const roleOpts = ['PLAYER','MOD','GM','ADMIN','OWNER']
            .map(r => `<option value="${r}" ${r===user.role?'selected':''}>${r}</option>`).join('');

        const itemOpts = PlayerManager._items
            .map(i => `<option value="${i.id}">${i.icon||'📦'} ${i.name}</option>`).join('');

        const charOpts = chars
            .map(c => `<option value="${c.id}">${c.name} (Lv${c.level})</option>`).join('');

        document.getElementById('dynamicArea').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
            <div>
                <h2 style="margin:0;color:#e8eef6">${user.username}
                    <span style="font-size:8px;color:${online?'#3fb950':'#484f58'};margin-left:8px">●${online?' Online':' Offline'}</span>
                </h2>
                <div style="color:#484f58;font-size:12px">${user.email} · Joined ${new Date(user.created_at).toLocaleDateString()}</div>
            </div>
            <button class="edit-btn" onclick="PlayerManager._renderSearch()">← Back</button>
        </div>

        <!-- STAT ROW -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
            ${[
                ['Role', `<span class="role-badge role-${user.role}">${user.role}</span>`],
                ['Gold', `💰 ${(user.gold||0).toLocaleString()}`],
                ['Characters', chars.length],
                ['Status', user.is_banned ? '🚫 Banned' : '✓ Active']
            ].map(([l,v]) => `<div style="background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:12px;text-align:center">
                <div style="font-size:11px;color:#484f58;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${l}</div>
                <div style="font-size:14px;font-weight:600">${v}</div>
            </div>`).join('')}
        </div>

        <!-- CHARACTERS -->
        <div style="background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:16px;margin-bottom:16px">
            <div style="font-size:11px;color:#484f58;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">⚔️ Characters</div>
            ${chars.length ? chars.map(c => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #161b22">
                <div>
                    <b style="color:#e8eef6">${c.name}</b>
                    <span style="color:#484f58;font-size:11px;margin-left:8px">${c.race_name||''} ${c.class_name||''} · Lv${c.level}</span>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                    <span style="color:#484f58;font-size:11px">❤️ ${c.current_hp}/${c.max_hp} · ${c.inv_count} items</span>
                    <button class="edit-btn" style="font-size:11px;padding:4px 8px" onclick="PlayerManager._healChar(${userId}, ${c.id})">⚕️ Restore HP</button>
                    <button class="edit-btn" style="font-size:11px;padding:4px 8px" onclick="PlayerManager._openGiveItem(${userId}, ${c.id}, '${c.name}')">🎁 Give Item</button>
                </div>
            </div>`).join('') : '<div style="color:#484f58;text-align:center;padding:20px">No characters</div>'}
        </div>

        <!-- GM ACTIONS -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

            <!-- Gold -->
            <div style="background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:16px">
                <div style="font-size:11px;color:#484f58;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">💰 Adjust Gold (Account)</div>
                <div style="display:flex;gap:8px">
                    <input type="number" id="pm_gold" placeholder="Amount (+/-)" style="flex:1">
                    <button class="action-btn save-btn" onclick="PlayerManager._giveGold(${userId})">Apply</button>
                </div>
                <div style="font-size:11px;color:#484f58;margin-top:6px">Use negative numbers to remove gold.</div>
            </div>

            <!-- Role -->
            <div style="background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:16px">
                <div style="font-size:11px;color:#484f58;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">🎭 Change Role</div>
                <div style="display:flex;gap:8px">
                    <select id="pm_role" style="flex:1">${roleOpts}</select>
                    <button class="action-btn" onclick="PlayerManager._setRole(${userId})">Set</button>
                </div>
            </div>

            <!-- DM -->
            <div style="background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:16px">
                <div style="font-size:11px;color:#484f58;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">📨 Send Private Message</div>
                <div style="display:flex;gap:8px">
                    <input id="pm_dm" placeholder="Message to player…" style="flex:1">
                    <button class="action-btn" onclick="PlayerManager._dm(${userId})">Send</button>
                </div>
            </div>

            <!-- Ban / Kick -->
            <div style="background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:16px">
                <div style="font-size:11px;color:#484f58;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">🚫 Account Actions</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    ${user.is_banned
                        ? `<button class="action-btn save-btn" onclick="PlayerManager._unban(${userId})">✅ Unban</button>`
                        : `<button class="action-btn" style="background:#c0392b" onclick="PlayerManager._ban(${userId})">🚫 Ban</button>`}
                    <button class="edit-btn" onclick="PlayerManager._kick(${userId})">⚡ Kick</button>
                </div>
            </div>
        </div>`;
    },

    async _giveGold(userId) {
        const amount = parseInt(document.getElementById('pm_gold')?.value);
        if (!amount) return alert('Enter a non-zero amount.');
        const r = await fetch(`/admin-panel/player/${userId}/give-gold`, {
            method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ amount })
        });
        const d = await r.json();
        alert(d.message); if (d.success) PlayerManager.viewPlayer(userId);
    },

    async _setRole(userId) {
        const role = document.getElementById('pm_role')?.value;
        if (!confirm(`Set role to ${role}?`)) return;
        const r = await fetch(`/admin-panel/player/${userId}/role`, {
            method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ role })
        });
        const d = await r.json();
        alert(d.message); if (d.success) PlayerManager.viewPlayer(userId);
    },

    async _dm(userId) {
        const message = document.getElementById('pm_dm')?.value;
        if (!message) return;
        const r = await fetch('/admin-panel/broadcast-player', {
            method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId, message })
        });
        const d = await r.json();
        if (d.success) { alert('DM sent!'); document.getElementById('pm_dm').value = ''; }
        else alert(d.message);
    },

    _ban(userId) {
        const modal = document.createElement('div');
        modal.id = 'pm_ban_modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center';
        modal.innerHTML = `
        <div style="background:#161b22;border:1px solid #f85149;border-radius:12px;padding:24px;min-width:380px">
            <h3 style="margin:0 0 4px;color:#f85149">🚫 Ban Player</h3>
            <p style="color:#484f58;font-size:12px;margin:0 0 14px">This will immediately lock the account. The reason is shown to the player.</p>
            <label style="font-size:12px;color:#8b949e">Ban Reason</label>
            <input id="pm_ban_reason" placeholder="e.g. Exploiting, harassment..." style="margin-bottom:16px">
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="edit-btn" onclick="document.getElementById('pm_ban_modal').remove()">Cancel</button>
                <button style="padding:8px 18px;background:#c0392b;border:none;color:#fff;border-radius:6px;cursor:pointer;font-weight:700" onclick="PlayerManager._doBan(${userId})">🚫 Ban Account</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('pm_ban_reason')?.focus(), 50);
    },

    async _doBan(userId) {
        const reason = document.getElementById('pm_ban_reason')?.value || '';
        document.getElementById('pm_ban_modal')?.remove();
        const r = await fetch(`/admin-panel/player/\${userId}/ban`, {
            method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ reason })
        });
        const d = await r.json();
        if (d.success) PlayerManager.viewPlayer(userId); else alert(d.message);
    },

    async _unban(userId) {
        const r = await fetch(`/admin-panel/player/${userId}/unban`, {
            method:'POST', headers:{'Content-Type':'application/json'}
        });
        const d = await r.json();
        alert(d.message); if (d.success) PlayerManager.viewPlayer(userId);
    },

    _kick(userId) {
        const modal = document.createElement('div');
        modal.id = 'pm_kick_modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center';
        modal.innerHTML = `
        <div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:24px;min-width:360px">
            <h3 style="margin:0 0 4px;color:#e8eef6">⚡ Kick Player</h3>
            <p style="color:#484f58;font-size:12px;margin:0 0 14px">Disconnects the player immediately. They can log back in.</p>
            <label style="font-size:12px;color:#8b949e">Kick Reason (shown to player)</label>
            <input id="pm_kick_reason" value="Kicked by GM." style="margin-bottom:16px">
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="edit-btn" onclick="document.getElementById('pm_kick_modal').remove()">Cancel</button>
                <button style="padding:8px 18px;background:#444;border:none;color:#fff;border-radius:6px;cursor:pointer;font-weight:700" onclick="PlayerManager._doKick(${userId})">⚡ Kick</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('pm_kick_reason')?.focus(), 50);
    },

    async _doKick(userId) {
        const reason = document.getElementById('pm_kick_reason')?.value || 'Kicked by GM.';
        document.getElementById('pm_kick_modal')?.remove();
        const r = await fetch('/admin-panel/kick', {
            method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId, reason })
        });
        const d = await r.json();
        if (d.success) alert('Player kicked.'); else alert(d.message);
    },

    async _healChar(userId, charId) {
        const r = await fetch(`/admin-panel/player/${userId}/reset-hp`, {
            method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ charId })
        });
        const d = await r.json();
        alert(d.message);
    },

    _openGiveItem(userId, charId, charName) {
        const itemOpts = PlayerManager._items
            .map(i => `<option value="${i.id}">${i.icon||'📦'} ${i.name}</option>`).join('');
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:9999;display:flex;align-items:center;justify-content:center';
        modal.innerHTML = `
        <div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:24px;min-width:360px">
            <h3 style="margin:0 0 16px;color:#e8eef6">🎁 Give Item to ${charName}</h3>
            <label>Item</label><select id="gi_item" style="margin-bottom:10px">${itemOpts}</select>
            <label>Quantity</label><input type="number" id="gi_qty" value="1" min="1" max="99" style="margin-bottom:16px">
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="edit-btn" onclick="this.closest('div[style*=fixed]').remove()">Cancel</button>
                <button class="action-btn save-btn" onclick="PlayerManager._giveItem(${userId},${charId},this)">Give</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
    },

    async _giveItem(userId, charId, btn) {
        const itemId = document.getElementById('gi_item')?.value;
        const qty    = document.getElementById('gi_qty')?.value;
        btn.disabled = true; btn.textContent = '…';
        const r = await fetch(`/admin-panel/player/${userId}/give-item`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ charId, itemId, qty })
        });
        const d = await r.json();
        alert(d.message);
        btn.closest('div[style*="fixed"]')?.remove();
    }
};
