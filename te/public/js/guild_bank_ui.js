// =================================================================
// GUILD BANK UI  v1.0
// =================================================================
// TEACHING: The guild bank is a shared resource pool for guild members.
// It has two compartments:
//
//   💰 Gold Pool  — a running total on the guild record itself
//      (guilds.gold_bank). Members can deposit from their wallet,
//      and officers/leaders can withdraw.
//
//   📦 Item Chest — items deposited by members (guild_bank_items).
//      Permissions work the same way: anyone can put things in,
//      but only certain ranks can take things out.
//
//   📜 Activity Log — every deposit/withdrawal is logged so the
//      guild leader can see who took what and when. Transparency
//      is important when shared resources are involved!
//
// Entry point: GuildBankUI.open(guildId)
//   — call this from the guild panel "Bank" button
//   — it loads the bank state from the server and renders the panel
//
// =================================================================

const GuildBankUI = {

    guildId:  null,
    charId:   null,
    data:     null,   // { gold, items, log, perms, rank }
    _tab:     'gold', // 'gold' | 'items' | 'log' | 'perms'
    open:     false,

    // ── Open ──────────────────────────────────────────────────────
    async open(guildId) {
        GuildBankUI.guildId = guildId;
        GuildBankUI.charId  = window.Game?.myCharId || Game.myCharId;
        GuildBankUI.open    = true;
        GuildBankUI._injectStyles();

        // Show loading panel immediately
        GuildBankUI._buildShell();

        // Fetch bank state from server
        try {
            const r = await fetch(`/api/guild/bank/${guildId}`, { credentials: 'include' });
            const d = await r.json();
            if (!d.success) {
                GuildBankUI._showError(d.error || 'Failed to load bank.');
                return;
            }
            GuildBankUI.data = d;
            GuildBankUI._render();
        } catch (e) {
            GuildBankUI._showError('Network error: ' + e.message);
        }
    },

    close() {
        GuildBankUI.open = false;
        const el = document.getElementById('guildBankPanel');
        if (el) el.remove();
    },

    // ── Shell (immediate skeleton while loading) ──────────────────
    _buildShell() {
        const old = document.getElementById('guildBankPanel');
        if (old) old.remove();

        const el = document.createElement('div');
        el.id = 'guildBankPanel';
        el.innerHTML = `
        <div class="gb-header">
            <span class="gb-title">🏦 Guild Bank</span>
            <button onclick="GuildBankUI.close()" class="gb-close">✕</button>
        </div>
        <div class="gb-body" style="display:flex;align-items:center;justify-content:center;height:200px">
            <span style="color:#484f58;font-size:12px">Loading bank…</span>
        </div>`;
        el.addEventListener('click', e => e.stopPropagation());
        document.body.appendChild(el);
    },

    _showError(msg) {
        const body = document.querySelector('#guildBankPanel .gb-body');
        if (body) body.innerHTML = `<div style="color:#f85149;font-size:12px;padding:20px">${msg}</div>`;
    },

    // ── Main render ───────────────────────────────────────────────
    _render() {
        const old = document.getElementById('guildBankPanel');
        if (old) old.remove();

        const d   = GuildBankUI.data;
        const tab = GuildBankUI._tab;

        const isLeader  = d.rank === 'LEADER';
        const isOfficer = d.rank === 'OFFICER' || isLeader;

        const tabBtn = (key, label) =>
            `<button class="gb-tab${tab===key?' gb-tab-active':''}"
                onclick="GuildBankUI._tab='${key}';GuildBankUI._render()">${label}</button>`;

        const panel = document.createElement('div');
        panel.id = 'guildBankPanel';
        panel.innerHTML = `
        <div class="gb-header">
            <span class="gb-title">🏦 Guild Bank</span>
            <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:11px;color:#ffaa00">💰 ${(d.gold||0).toLocaleString()}g in vault</span>
                <button onclick="GuildBankUI.close()" class="gb-close">✕</button>
            </div>
        </div>
        <div class="gb-tabs">
            ${tabBtn('gold',  '💰 Gold')}
            ${tabBtn('items', '📦 Items')}
            ${tabBtn('log',   '📜 Log')}
            ${isLeader ? tabBtn('perms', '🔑 Perms') : ''}
        </div>
        <div class="gb-body" id="gbBody">
            ${tab === 'gold'  ? GuildBankUI._buildGoldTab(d)  : ''}
            ${tab === 'items' ? GuildBankUI._buildItemsTab(d) : ''}
            ${tab === 'log'   ? GuildBankUI._buildLogTab(d)   : ''}
            ${tab === 'perms' && isLeader ? GuildBankUI._buildPermsTab(d) : ''}
        </div>`;

        panel.addEventListener('click', e => e.stopPropagation());
        document.body.appendChild(panel);
    },

    // ── GOLD TAB ──────────────────────────────────────────────────
    _buildGoldTab(d) {
        const p = d.perms;
        return `
        <div class="gb-section">
            <div class="gb-section-label">Vault Balance</div>
            <div style="font-size:28px;font-weight:bold;color:#ffaa00;margin:8px 0">
                💰 ${(d.gold||0).toLocaleString()}g
            </div>
            <div style="font-size:10px;color:#484f58">Shared pool for all guild members</div>
        </div>

        ${p.can_deposit_gold ? `
        <div class="gb-section">
            <div class="gb-section-label">💚 Deposit Gold</div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <input type="number" id="gbDepositAmt" min="1" placeholder="Amount"
                    class="gb-input" style="width:110px">
                <button class="gb-btn gb-btn-green" onclick="GuildBankUI._depositGold()">Deposit →</button>
                <div style="display:flex;gap:4px">
                    ${[100,500,1000,5000].map(a =>
                        `<button class="gb-quick-btn" onclick="document.getElementById('gbDepositAmt').value=${a}">${a}</button>`
                    ).join('')}
                </div>
            </div>
        </div>` : ''}

        ${p.can_withdraw_gold ? `
        <div class="gb-section">
            <div class="gb-section-label">🔴 Withdraw Gold
                ${p.gold_withdraw_limit > 0 ? `<span style="color:#484f58;font-weight:normal"> (limit: ${p.gold_withdraw_limit}g/day)</span>` : ''}
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <input type="number" id="gbWithdrawAmt" min="1" placeholder="Amount"
                    class="gb-input" style="width:110px">
                <button class="gb-btn gb-btn-red" onclick="GuildBankUI._withdrawGold()">← Withdraw</button>
            </div>
        </div>` : `
        <div class="gb-section" style="color:#484f58;font-size:11px">
            🔒 Your rank (${d.rank}) cannot withdraw gold. Ask an officer or the guild leader.
        </div>`}

        <div id="gbGoldMsg" style="padding:8px 0;font-size:12px;color:#3fb950;min-height:24px"></div>`;
    },

    // ── ITEMS TAB ─────────────────────────────────────────────────
    _buildItemsTab(d) {
        const p = d.perms;
        const items = d.items || [];

        const itemsHtml = items.length === 0
            ? '<div style="color:#484f58;font-size:12px;padding:12px 0">The item chest is empty.</div>'
            : items.map(it => `
            <div class="gb-item-row">
                <div style="display:flex;align-items:center;gap:10px;flex:1">
                    <span style="font-size:20px">${it.item_icon || '📦'}</span>
                    <div>
                        <div style="font-size:13px;font-weight:bold;color:${GuildBankUI._rarityColor(it.rarity)}">${it.item_name}</div>
                        <div style="font-size:10px;color:#484f58">
                            ×${it.quantity} · deposited by ${it.depositor_name}
                            ${it.note ? ` · <em>${it.note}</em>` : ''}
                        </div>
                    </div>
                </div>
                ${p.can_withdraw_item ? `
                <div style="display:flex;align-items:center;gap:4px">
                    <input type="number" min="1" max="${it.quantity}" value="1"
                        id="gbWQ_${it.id}" class="gb-input" style="width:50px;text-align:center">
                    <button class="gb-btn gb-btn-sm" onclick="GuildBankUI._withdrawItem(${it.id})">Take</button>
                </div>` : ''}
            </div>`).join('');

        return `
        <div class="gb-section">
            <div class="gb-section-label">📦 Item Chest (${items.length} type${items.length!==1?'s':''})</div>
            <div id="gbItemList">${itemsHtml}</div>
        </div>

        ${p.can_deposit_item ? `
        <div class="gb-section">
            <div class="gb-section-label">💚 Deposit Item from Inventory</div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <select id="gbDepositItemSel" class="gb-input" style="flex:1;min-width:160px">
                    <option value="">— pick an item —</option>
                </select>
                <input type="number" id="gbDepositItemQty" min="1" value="1" class="gb-input" style="width:60px">
                <input type="text" id="gbDepositNote" placeholder="Note (optional)" class="gb-input" style="flex:1;min-width:100px">
                <button class="gb-btn gb-btn-green" onclick="GuildBankUI._depositItem()">Deposit →</button>
            </div>
            <div id="gbItemMsg" style="padding:6px 0;font-size:12px;color:#3fb950;min-height:20px"></div>
        </div>` : ''}`;
    },

    // ── LOG TAB ───────────────────────────────────────────────────
    _buildLogTab(d) {
        const log = d.log || [];
        const ACTION_ICONS = {
            deposit_gold:   '💚 Deposited',
            withdraw_gold:  '🔴 Withdrew',
            deposit_item:   '📥 Put in',
            withdraw_item:  '📤 Took out',
        };
        const rows = log.length === 0
            ? '<div style="color:#484f58;font-size:12px">No activity yet.</div>'
            : log.map(row => {
                const icon = ACTION_ICONS[row.action] || row.action;
                const what = row.action.includes('gold')
                    ? `<span style="color:#ffaa00">${row.amount?.toLocaleString()}g</span>`
                    : `<span>×${row.item_qty} ${row.item_name}</span>`;
                const when = new Date(row.created_at).toLocaleString();
                return `<div class="gb-log-row">
                    <span style="color:#8b949e;font-size:11px">${when}</span>
                    <span style="font-size:12px"><strong>${row.character_name}</strong> ${icon} ${what}</span>
                    ${row.note ? `<span style="font-size:10px;color:#484f58;font-style:italic">${row.note}</span>` : ''}
                </div>`;
            }).join('');

        return `
        <div class="gb-section">
            <div class="gb-section-label">📜 Recent Activity (last 50)</div>
            <div style="display:flex;flex-direction:column;gap:6px">${rows}</div>
        </div>`;
    },

    // ── PERMS TAB (LEADER only) ───────────────────────────────────
    _buildPermsTab(d) {
        const existingPerms = {}; // rank → perm object
        // d.perms is the CALLER's perms, not the full set.
        // We re-fetch the full perms set on open via a separate call below.
        // For now render a placeholder that self-populates.
        const ranks = ['LEADER','OFFICER','MEMBER'];
        const DEFAULTS = {
            LEADER:  { can_deposit_gold:1,can_withdraw_gold:1,can_deposit_item:1,can_withdraw_item:1,gold_withdraw_limit:0 },
            OFFICER: { can_deposit_gold:1,can_withdraw_gold:0,can_deposit_item:1,can_withdraw_item:1,gold_withdraw_limit:0 },
            MEMBER:  { can_deposit_gold:1,can_withdraw_gold:0,can_deposit_item:1,can_withdraw_item:0,gold_withdraw_limit:0 },
        };

        const rankRow = (rank) => {
            const p = DEFAULTS[rank];
            const id = rank.toLowerCase();
            return `
            <div class="gb-perm-rank">
                <div class="gb-perm-rank-name">${rank}</div>
                <div class="gb-perm-checks">
                    ${[
                        ['can_deposit_gold',  '💚 Deposit gold'],
                        ['can_withdraw_gold', '🔴 Withdraw gold'],
                        ['can_deposit_item',  '📥 Deposit items'],
                        ['can_withdraw_item', '📤 Withdraw items'],
                    ].map(([key, label]) => `
                    <label class="gb-check-label">
                        <input type="checkbox" id="gbperm_${id}_${key}"
                            ${p[key] ? 'checked' : ''}
                            ${rank === 'LEADER' ? 'disabled checked' : ''}>
                        ${label}
                    </label>`).join('')}
                    ${rank !== 'LEADER' ? `
                    <label class="gb-check-label" style="margin-top:4px">
                        💰 Daily withdraw limit (0=unlimited):
                        <input type="number" id="gbperm_${id}_limit" min="0" value="${p.gold_withdraw_limit}"
                            class="gb-input" style="width:80px;margin-left:6px">
                    </label>` : ''}
                </div>
            </div>`;
        };

        return `
        <div class="gb-section">
            <div class="gb-section-label">🔑 Bank Permissions</div>
            <p style="font-size:11px;color:#484f58;margin-bottom:14px">
                Configure what each rank can do with the guild bank.
                Leaders always have full access.
            </p>
            ${ranks.map(rankRow).join('')}
            <button class="gb-btn gb-btn-green" style="margin-top:14px" onclick="GuildBankUI._savePerms()">
                💾 Save Permissions
            </button>
            <div id="gbPermsMsg" style="padding:6px 0;font-size:12px;color:#3fb950;min-height:20px"></div>
        </div>`;
    },

    // ── Actions ───────────────────────────────────────────────────
    async _depositGold() {
        const amt = parseInt(document.getElementById('gbDepositAmt')?.value);
        if (!amt || amt < 1) return GuildBankUI._msg('gbGoldMsg', '❌ Enter an amount.', 'red');
        const r = await GuildBankUI._post('/api/guild/bank/deposit-gold', {
            charId: GuildBankUI.charId, guildId: GuildBankUI.guildId, amount: amt
        });
        if (r.success) {
            GuildBankUI._msg('gbGoldMsg', r.message, '#3fb950');
            GuildBankUI.data.gold = (GuildBankUI.data.gold || 0) + amt;
            GuildBankUI._render();
        } else {
            GuildBankUI._msg('gbGoldMsg', '❌ ' + r.error, 'red');
        }
    },

    async _withdrawGold() {
        const amt = parseInt(document.getElementById('gbWithdrawAmt')?.value);
        if (!amt || amt < 1) return GuildBankUI._msg('gbGoldMsg', '❌ Enter an amount.', 'red');
        const r = await GuildBankUI._post('/api/guild/bank/withdraw-gold', {
            charId: GuildBankUI.charId, guildId: GuildBankUI.guildId, amount: amt
        });
        if (r.success) {
            GuildBankUI._msg('gbGoldMsg', r.message, '#3fb950');
            GuildBankUI.data.gold = Math.max(0, (GuildBankUI.data.gold || 0) - amt);
            GuildBankUI._render();
        } else {
            GuildBankUI._msg('gbGoldMsg', '❌ ' + r.error, 'red');
        }
    },

    async _depositItem() {
        const sel = document.getElementById('gbDepositItemSel');
        const invId = parseInt(sel?.value);
        if (!invId) return GuildBankUI._msg('gbItemMsg', '❌ Pick an item from your inventory.', 'red');
        const qty  = parseInt(document.getElementById('gbDepositItemQty')?.value) || 1;
        const note = document.getElementById('gbDepositNote')?.value || '';
        const r = await GuildBankUI._post('/api/guild/bank/deposit-item', {
            charId: GuildBankUI.charId, guildId: GuildBankUI.guildId,
            inventoryId: invId, quantity: qty, note
        });
        if (r.success) {
            GuildBankUI._msg('gbItemMsg', r.message, '#3fb950');
            setTimeout(() => GuildBankUI.open(GuildBankUI.guildId), 800);
        } else {
            GuildBankUI._msg('gbItemMsg', '❌ ' + r.error, 'red');
        }
    },

    async _withdrawItem(bankItemId) {
        const qty = parseInt(document.getElementById('gbWQ_' + bankItemId)?.value) || 1;
        const r = await GuildBankUI._post('/api/guild/bank/withdraw-item', {
            charId: GuildBankUI.charId, guildId: GuildBankUI.guildId,
            bankItemId, quantity: qty
        });
        if (r.success) {
            showNotification('📦 ' + r.message, 'quest');
            setTimeout(() => GuildBankUI.open(GuildBankUI.guildId), 600);
        } else {
            showNotification('❌ ' + r.error, 'damage');
        }
    },

    async _savePerms() {
        const ranks = ['officer','member'];
        const perms = ranks.map(r => {
            const rank = r.toUpperCase();
            const g = (k) => document.getElementById(`gbperm_${r}_${k}`);
            return {
                rank,
                can_deposit_gold:  g('can_deposit_gold')?.checked  ? 1 : 0,
                can_withdraw_gold: g('can_withdraw_gold')?.checked ? 1 : 0,
                can_deposit_item:  g('can_deposit_item')?.checked  ? 1 : 0,
                can_withdraw_item: g('can_withdraw_item')?.checked ? 1 : 0,
                gold_withdraw_limit: parseInt(g('limit')?.value) || 0,
            };
        });
        // Always add LEADER as full perms
        perms.unshift({ rank:'LEADER',
            can_deposit_gold:1,can_withdraw_gold:1,can_deposit_item:1,can_withdraw_item:1,gold_withdraw_limit:0 });

        const r = await GuildBankUI._post('/api/guild/bank/perms', {
            charId: GuildBankUI.charId, guildId: GuildBankUI.guildId, perms
        });
        if (r.success) {
            GuildBankUI._msg('gbPermsMsg', '✅ Permissions saved!', '#3fb950');
        } else {
            GuildBankUI._msg('gbPermsMsg', '❌ ' + r.error, 'red');
        }
    },

    // ── Helpers ───────────────────────────────────────────────────
    async _post(url, body) {
        try {
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                credentials: 'include'
            });
            return await r.json();
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    _msg(id, text, color) {
        const el = document.getElementById(id);
        if (el) { el.textContent = text; el.style.color = color; }
    },

    _rarityColor(rarity) {
        const map = { common:'#8b949e', uncommon:'#3fb950', rare:'#58a6ff',
                      epic:'#bb86fc', legendary:'#ffaa00' };
        return map[(rarity||'').toLowerCase()] || '#e8eef6';
    },

    // ── Styles ────────────────────────────────────────────────────
    _injectStyles() {
        if (document.getElementById('guildBankStyles')) return;
        const s = document.createElement('style');
        s.id = 'guildBankStyles';
        s.textContent = `
        #guildBankPanel {
            position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            width:520px;max-width:calc(100vw - 16px);
            background:rgba(5,8,14,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:12px;
            z-index:200;color:#e8eef6;font-family:'Courier New',monospace;
            box-shadow:0 8px 40px rgba(0,0,0,0.8);display:flex;flex-direction:column;max-height:86vh;
        }
        .gb-header {
            display:flex;justify-content:space-between;align-items:center;
            padding:12px 16px;border-bottom:1px solid #21262d;flex-shrink:0;
        }
        .gb-title { font-size:13px;font-weight:bold;color:#ffaa00;text-transform:uppercase;letter-spacing:1px; }
        .gb-close  { background:none;border:none;color:#484f58;cursor:pointer;font-size:16px; }
        .gb-close:hover { color:#8b949e; }
        .gb-tabs {
            display:flex;gap:0;border-bottom:1px solid #21262d;flex-shrink:0;overflow-x:auto;
        }
        .gb-tab {
            padding:8px 14px;background:none;border:none;cursor:pointer;font-size:11px;
            color:#484f58;font-family:'Courier New',monospace;white-space:nowrap;
            border-bottom:2px solid transparent;transition:.12s;
        }
        .gb-tab:hover { color:#8b949e; }
        .gb-tab-active { color:#ffaa00 !important;border-bottom-color:#ffaa00 !important; }
        .gb-body { flex:1;overflow-y:auto;scrollbar-width:thin;padding:14px 16px;
            scrollbar-color:rgba(255,255,255,0.1) transparent; }
        .gb-section { margin-bottom:18px; }
        .gb-section-label {
            font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#484f58;
            padding-bottom:6px;border-bottom:1px solid #21262d;margin-bottom:10px;font-weight:bold;
        }
        .gb-input {
            background:rgba(255,255,255,0.04);border:1px solid #21262d;border-radius:6px;
            color:#e8eef6;font-size:12px;font-family:'Courier New',monospace;padding:6px 8px;outline:none;
        }
        .gb-input:focus { border-color:#ffaa00; }
        .gb-btn {
            padding:7px 14px;border-radius:6px;cursor:pointer;font-size:11px;
            border:1px solid #30363d;background:rgba(255,255,255,0.04);
            color:#8b949e;font-family:'Courier New',monospace;transition:.12s;
        }
        .gb-btn:hover { background:rgba(255,255,255,0.08);color:#e8eef6; }
        .gb-btn-green { background:rgba(63,185,80,0.12);border-color:rgba(63,185,80,0.35);color:#3fb950; }
        .gb-btn-green:hover { background:rgba(63,185,80,0.22); }
        .gb-btn-red  { background:rgba(248,81,73,0.1);border-color:rgba(248,81,73,0.3);color:#f85149; }
        .gb-btn-red:hover  { background:rgba(248,81,73,0.2); }
        .gb-btn-sm { padding:4px 10px;font-size:10px; }
        .gb-quick-btn {
            padding:4px 8px;border-radius:5px;cursor:pointer;font-size:10px;
            border:1px solid #21262d;background:rgba(255,255,255,0.03);color:#484f58;
            font-family:'Courier New',monospace;
        }
        .gb-quick-btn:hover { color:#ffaa00;border-color:#ffaa0044; }
        .gb-item-row {
            display:flex;align-items:center;gap:10px;padding:8px 0;
            border-bottom:1px solid #21262d;
        }
        .gb-item-row:last-child { border-bottom:none; }
        .gb-log-row {
            display:flex;flex-direction:column;gap:2px;padding:8px 0;
            border-bottom:1px solid #21262d;
        }
        .gb-log-row:last-child { border-bottom:none; }
        .gb-perm-rank {
            background:rgba(255,255,255,0.02);border:1px solid #21262d;border-radius:8px;
            padding:10px 12px;margin-bottom:10px;
        }
        .gb-perm-rank-name {
            font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;
            color:#bb86fc;margin-bottom:8px;
        }
        .gb-perm-checks { display:flex;flex-direction:column;gap:5px; }
        .gb-check-label {
            display:flex;align-items:center;gap:7px;font-size:11px;color:#8b949e;cursor:pointer;
        }
        .gb-check-label input[type=checkbox] { accent-color:#ffaa00;width:14px;height:14px; }
        `;
        document.head.appendChild(s);
    },
};
