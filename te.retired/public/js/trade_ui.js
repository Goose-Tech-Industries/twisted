// =================================================================
// TRADE UI — Player-to-player item trading panel
// =================================================================
// Teaching: Trading is one of the most complex real-time UX patterns
// in an MMO. Here's how it works:
//
//   1. Player A clicks "Trade" on Player B (from the nearby player list
//      or friends list). A trade_request socket event fires.
//   2. Player B gets a trade_requested event with a popup to accept/decline.
//   3. If accepted, BOTH players get a trade_start event with a tradeId.
//   4. Each player can add/remove items and set a gold amount from
//      their side. Every change triggers a trade_update broadcast to both.
//   5. When ready, each player clicks LOCK — this freezes their offer.
//      If a locked player changes anything, they must unlock first.
//   6. Once BOTH sides are locked, each must click CONFIRM.
//   7. When BOTH are confirmed, the server atomically swaps items + gold
//      and fires trade_complete to both players.
//   8. Either player can click CANCEL at any time to abort the trade.
//
// Socket events emitted:
//   trade_request    { targetCharId }     — initiate
//   trade_accept     { targetCharId }     — accept an incoming request
//   trade_decline    { targetCharId }     — decline
//   trade_add_item   { tradeId, itemId, quantity }
//   trade_remove_item{ tradeId, itemId }
//   trade_set_gold   { tradeId, amount }
//   trade_lock       { tradeId }          — toggle lock
//   trade_confirm    { tradeId }          — final confirm
//   trade_cancel     { tradeId }          — abort
//
// Socket events received:
//   trade_requested  { fromName, fromCharId }  — incoming trade request
//   trade_start      { tradeId, trade }        — trade window opens
//   trade_update     { tradeId, trade }        — offer changed
//   trade_complete   { tradeId }               — success!
//   trade_cancelled  { reason }               — aborted
//   trade_msg        { text, type }            — system messages
// =================================================================

const TradeUI = {

    // ─── STATE ───────────────────────────────────────────────────
    active:       false,
    tradeId:      null,
    trade:        null,       // full trade object from server
    _pendingFrom: null,       // incoming trade request not yet accepted

    // ─── INITIATE TRADE ──────────────────────────────────────────
    // Call this when you want to trade with a specific character ID.
    // Usually wired to a button on the player list or friends list.
    requestTrade(targetCharId) {
        if (TradeUI.active) { showNotification('Already in a trade.', 'damage'); return; }
        if (typeof Game !== 'undefined') {
            Game.socket.emit('trade_request', { targetCharId });
        }
        showNotification('Trade request sent…', 'item');
    },

    // ─── OPEN TRADE WINDOW ───────────────────────────────────────
    _open(tradeId, trade) {
        TradeUI.active  = true;
        TradeUI.tradeId = tradeId;
        TradeUI.trade   = trade;
        if (typeof Game !== 'undefined') Game.dialogueOpen = true;
        TradeUI._buildWindow();
        TradeUI._render();
    },

    // ─── CLOSE TRADE WINDOW ──────────────────────────────────────
    close(cancelled) {
        TradeUI.active  = false;
        TradeUI.tradeId = null;
        TradeUI.trade   = null;
        if (typeof Game !== 'undefined') Game.dialogueOpen = false;
        const el = document.getElementById('tradeWindow');
        if (el) el.remove();
        if (cancelled) showNotification('Trade cancelled.', 'damage');
    },

    cancel() {
        if (!TradeUI.tradeId) { TradeUI.close(true); return; }
        if (typeof Game !== 'undefined') {
            Game.socket.emit('trade_cancel', { tradeId: TradeUI.tradeId });
        }
        TradeUI.close(true);
    },

    // ─── RENDER TRADE WINDOW ─────────────────────────────────────
    _render() {
        const container = document.getElementById('tradeContent');
        if (!container || !TradeUI.trade) return;

        const myCharId  = typeof Game !== 'undefined' ? Game.myCharId : null;
        const sides     = Object.values(TradeUI.trade.sides);
        const mySide    = sides.find(s => s.charId === myCharId);
        const theirSide = sides.find(s => s.charId !== myCharId);

        if (!mySide || !theirSide) return;

        const bothLocked   = mySide.locked && theirSide.locked;
        const canConfirm   = mySide.locked && !mySide.confirmed;

        container.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <!-- MY SIDE -->
            <div style="background:rgba(255,255,255,0.03);border:1px solid ${mySide.locked ? 'rgba(63,185,80,0.4)' : '#21262d'};border-radius:8px;padding:12px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <div style="font-weight:bold;color:${mySide.locked ? '#3fb950' : '#ffcc00'}">
                        You ${mySide.locked ? '🔒' : ''} ${mySide.confirmed ? '✅' : ''}
                    </div>
                </div>
                <div class="t-sect">Offering</div>
                ${mySide.items.length
                    ? mySide.items.map(it => `
                        <div style="display:flex;justify-content:space-between;align-items:center;
                             padding:5px 8px;background:rgba(255,255,255,0.03);border-radius:5px;margin-bottom:4px">
                            <span style="color:#c9d1d9;font-size:12px">${TradeUI._esc(it.name)} ×${it.quantity}</span>
                            ${!mySide.locked
                                ? `<button onclick="TradeUI.removeItem(${it.itemId})" style="background:none;border:none;color:#f85149;cursor:pointer;font-size:12px">✕</button>`
                                : ''}
                        </div>`).join('')
                    : '<div style="color:#484f58;font-size:11px;padding:8px 0">Nothing offered yet.</div>'}
                <div style="margin-top:8px;display:flex;align-items:center;gap:6px">
                    <span style="color:#f39c12;font-size:12px">💰</span>
                    ${!mySide.locked
                        ? `<input id="goldOffer" type="number" min="0" value="${mySide.gold}"
                               class="t-input" style="width:80px"
                               onchange="TradeUI.setGold(this.value)"/>`
                        : `<span style="color:#f39c12;font-size:12px">${mySide.gold}g</span>`}
                </div>
            </div>
            <!-- THEIR SIDE -->
            <div style="background:rgba(255,255,255,0.03);border:1px solid ${theirSide.locked ? 'rgba(63,185,80,0.4)' : '#21262d'};border-radius:8px;padding:12px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <div style="font-weight:bold;color:${theirSide.locked ? '#3fb950' : '#c9d1d9'}">
                        ${TradeUI._esc(theirSide.name)} ${theirSide.locked ? '🔒' : ''} ${theirSide.confirmed ? '✅' : ''}
                    </div>
                </div>
                <div class="t-sect">Offering</div>
                ${theirSide.items.length
                    ? theirSide.items.map(it => `
                        <div style="padding:5px 8px;background:rgba(255,255,255,0.03);border-radius:5px;margin-bottom:4px">
                            <span style="color:#c9d1d9;font-size:12px">${TradeUI._esc(it.name)} ×${it.quantity}</span>
                        </div>`).join('')
                    : '<div style="color:#484f58;font-size:11px;padding:8px 0">Nothing offered yet.</div>'}
                <div style="margin-top:8px;display:flex;align-items:center;gap:6px">
                    <span style="color:#f39c12;font-size:12px">💰</span>
                    <span style="color:#f39c12;font-size:12px">${theirSide.gold}g</span>
                </div>
            </div>
        </div>

        <!-- ADD ITEM from inventory -->
        ${!mySide.locked ? `
        <div style="margin-bottom:12px">
            <div class="t-sect">Add Item from Your Inventory</div>
            <select id="tradeItemSelect" class="t-input" style="width:100%;margin-bottom:6px">
                <option value="">— select an item —</option>
                ${TradeUI._inventoryOptions()}
            </select>
            <div style="display:flex;gap:8px">
                <input id="tradeQty" type="number" min="1" value="1" class="t-input" style="width:70px" placeholder="Qty"/>
                <button class="t-btn t-btn-ok" onclick="TradeUI.addItem()" style="flex:1">Add Item ➕</button>
            </div>
        </div>` : ''}

        <!-- STATUS LINE -->
        <div style="text-align:center;color:#484f58;font-size:11px;margin-bottom:10px">
            ${bothLocked && !mySide.confirmed && !theirSide.confirmed
                ? '🔒 Both sides locked — confirm to complete trade'
                : mySide.locked && !theirSide.locked
                    ? '⏳ Waiting for the other player to lock their offer…'
                    : ''}
        </div>

        <!-- ACTION BUTTONS -->
        <div style="display:flex;gap:8px;justify-content:center">
            <button class="t-btn ${mySide.locked ? '' : 't-btn-ok'}" onclick="TradeUI.toggleLock()"
                style="${mySide.locked ? 'background:rgba(255,255,255,0.05);border:1px solid #30363d;color:#8b949e;padding:8px 20px;border-radius:7px;cursor:pointer;font-size:13px;font-weight:600' : ''}">
                ${mySide.locked ? '🔓 Unlock' : '🔒 Lock Offer'}
            </button>
            ${bothLocked && !mySide.confirmed
                ? `<button class="t-btn t-btn-ok" onclick="TradeUI.confirm()">✅ Confirm Trade</button>` : ''}
            <button class="t-btn t-btn-danger" onclick="TradeUI.cancel()">✕ Cancel</button>
        </div>`;
    },

    // ─── HELPERS: BUILD INVENTORY OPTIONS ────────────────────────
    _inventoryOptions() {
        // Teaching: We use the cached character data from Panels or Game
        // so we don't need an extra fetch just to populate this dropdown.
        const charFull = (typeof Panels !== 'undefined' && Panels.charFull)
                       ? Panels.charFull
                       : (typeof Game !== 'undefined' && Game.charFull ? Game.charFull : null);
        if (!charFull || !charFull.inventory) return '<option value="">No items</option>';
        return charFull.inventory
            .filter(i => i.type !== 'KEY') // Key items can't be traded
            .map(i => `<option value="${i.item_id}" data-max="${i.quantity}">${TradeUI._esc(i.name)} (×${i.quantity})</option>`)
            .join('');
    },

    // ─── ACTIONS ─────────────────────────────────────────────────
    addItem() {
        const sel = document.getElementById('tradeItemSelect');
        const qty = parseInt(document.getElementById('tradeQty')?.value || '1', 10);
        if (!sel?.value) { showNotification('Select an item first.', 'damage'); return; }
        const max = parseInt(sel.selectedOptions[0]?.dataset?.max || '999', 10);
        if (qty < 1 || qty > max) { showNotification(`You only have ${max} of that item.`, 'damage'); return; }
        if (typeof Game !== 'undefined') {
            Game.socket.emit('trade_add_item', { tradeId: TradeUI.tradeId, itemId: parseInt(sel.value), quantity: qty });
        }
    },

    removeItem(itemId) {
        if (typeof Game !== 'undefined') {
            Game.socket.emit('trade_remove_item', { tradeId: TradeUI.tradeId, itemId });
        }
    },

    setGold(amount) {
        if (typeof Game !== 'undefined') {
            Game.socket.emit('trade_set_gold', { tradeId: TradeUI.tradeId, amount: Math.max(0, parseInt(amount) || 0) });
        }
    },

    toggleLock() {
        if (typeof Game !== 'undefined') {
            Game.socket.emit('trade_lock', { tradeId: TradeUI.tradeId });
        }
    },

    confirm() {
        if (!confirm('Confirm this trade? This cannot be undone.')) return;
        if (typeof Game !== 'undefined') {
            Game.socket.emit('trade_confirm', { tradeId: TradeUI.tradeId });
        }
    },

    // ─── SOCKET WIRING ───────────────────────────────────────────
    initSockets() {
        const tryBind = () => {
            if (typeof Game === 'undefined' || !Game.socket) { setTimeout(tryBind, 100); return; }

            // Incoming trade request — show a toast popup
            Game.socket.on('trade_requested', ({ fromName, fromCharId }) => {
                TradeUI._pendingFrom = { fromName, fromCharId };
                TradeUI._toastRequest(fromName, fromCharId);
            });

            // Trade window opens (both parties accepted)
            Game.socket.on('trade_start', ({ tradeId, trade }) => {
                // Refresh inventory cache before opening (needed for item dropdown)
                if (typeof Panels !== 'undefined' && !Panels.charFull) Panels.fetchChar().catch(() => {});
                TradeUI._open(tradeId, trade);
            });

            // Offer changed
            Game.socket.on('trade_update', ({ tradeId, trade }) => {
                if (TradeUI.tradeId !== tradeId) return;
                TradeUI.trade = trade;
                TradeUI._render();
            });

            // Trade completed successfully
            Game.socket.on('trade_complete', ({ tradeId }) => {
                if (TradeUI.tradeId !== tradeId) return;
                TradeUI.close(false);
                showNotification('✅ Trade complete!', 'item');
                // Refresh inventory so the player sees changes immediately
                if (typeof Panels !== 'undefined' && Panels.open === 'inventory') Panels.openInventory();
                if (typeof Panels !== 'undefined') Panels.fetchChar();
                loadCharData && loadCharData();
            });

            // Trade cancelled by other party or server
            Game.socket.on('trade_cancelled', ({ reason }) => {
                if (!TradeUI.active) return;
                TradeUI.close(false);
                showNotification(`Trade cancelled: ${reason || 'Other player cancelled.'}`, 'damage');
            });

            // System messages
            Game.socket.on('trade_msg', ({ text, type }) => {
                showNotification(text, type === 'error' ? 'damage' : 'item');
            });
        };
        tryBind();
    },

    _toastRequest(fromName, fromCharId) {
        const n = document.createElement('div');
        n.style.cssText = `position:fixed;top:80px;right:20px;background:rgba(5,8,14,0.95);
            border:1px solid rgba(3,218,198,0.5);border-radius:10px;padding:12px 16px;z-index:200;color:#e8eef6;font-size:13px;`;
        n.innerHTML = `<div style="color:#03dac6;font-weight:bold;margin-bottom:8px">
                🤝 Trade request from <b>${TradeUI._esc(fromName)}</b></div>
            <div style="display:flex;gap:8px">
                <button onclick="Game.socket.emit('trade_accept',{targetCharId:${fromCharId}});this.closest('[style]').remove()"
                    style="padding:5px 14px;background:rgba(63,185,80,0.2);border:1px solid #3fb950;color:#3fb950;cursor:pointer;border-radius:6px;font-size:12px">Accept</button>
                <button onclick="Game.socket.emit('trade_decline',{targetCharId:${fromCharId}});this.closest('[style]').remove()"
                    style="padding:5px 14px;background:rgba(248,81,73,0.1);border:1px solid #f85149;color:#f85149;cursor:pointer;border-radius:6px;font-size:12px">Decline</button>
            </div>`;
        document.body.appendChild(n);
        setTimeout(() => { if (n.parentNode) n.remove(); }, 15000);
    },

    // ─── DOM SHELL ───────────────────────────────────────────────
    _buildWindow() {
        let el = document.getElementById('tradeWindow');
        if (el) el.remove();
        el = document.createElement('div');
        el.id = 'tradeWindow';
        el.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            width:600px;max-width:95vw;max-height:85vh;overflow-y:auto;
            background:rgba(5,8,14,0.97);border:1px solid rgba(3,218,198,0.3);
            border-radius:12px;padding:20px;z-index:150;color:#e8eef6;`;
        el.innerHTML = `
            ${TradeUI._styles()}
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;border-bottom:1px solid #21262d;padding-bottom:12px">
                <span style="font-size:22px">🤝</span>
                <h2 style="margin:0;font-size:18px;color:#03dac6;font-family:'Courier New',monospace">TRADE</h2>
            </div>
            <div id="tradeContent">Loading…</div>`;
        document.body.appendChild(el);
    },

    _styles() {
        if (document.getElementById('tradeStyles')) return '';
        const s = document.createElement('style');
        s.id = 'tradeStyles';
        s.textContent = `
        .t-sect { color:#03dac6;font-size:10px;text-transform:uppercase;letter-spacing:1px;
            margin:6px 0 6px;border-bottom:1px solid #21262d;padding-bottom:3px;font-family:'Courier New',monospace; }
        .t-btn { padding:8px 20px;border-radius:7px;cursor:pointer;font-family:'Courier New',monospace;font-size:13px;font-weight:600;transition:.15s; }
        .t-btn-ok { background:rgba(63,185,80,0.15);border:1px solid rgba(63,185,80,0.4);color:#3fb950; }
        .t-btn-ok:hover { background:rgba(63,185,80,0.28); }
        .t-btn-danger { background:rgba(248,81,73,0.1);border:1px solid rgba(248,81,73,0.3);color:#f85149; }
        .t-btn-danger:hover { background:rgba(248,81,73,0.22); }
        .t-input { background:rgba(255,255,255,0.05);border:1px solid #30363d;color:#e8eef6;
            padding:7px 10px;border-radius:6px;font-family:inherit;font-size:12px;outline:none; }
        .t-input:focus { border-color:rgba(3,218,198,0.4); }`;
        document.head.appendChild(s);
        return '';
    },

    _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;'); },
};
