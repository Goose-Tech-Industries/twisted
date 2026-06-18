// =================================================================
// AUCTION HOUSE UI
// =================================================================
// Opens via: Game.openAuction() — bound to 'H' key or NPC event
// Three tabs: Browse, My Listings, Post Item
// =================================================================

const AuctionUI = {
    _open: false,
    _charId: null,
    _tab: 'browse',
    _listings: [],
    _myListings: [],
    _inventory: [],
    _page: 1,
    _total: 0,
    _filter: { search: '', category: '', sort: 'price_asc' },

    open: async (charId) => {
        AuctionUI._charId = charId;
        AuctionUI._open = true;
        AuctionUI._tab = 'browse';
        AuctionUI._ensurePanel();
        AuctionUI.switchTab('browse');
    },

    close: () => {
        AuctionUI._open = false;
        const el = document.getElementById('auction_panel');
        if (el) el.remove();
    },

    _ensurePanel: () => {
        let el = document.getElementById('auction_panel');
        if (el) return;
        el = document.createElement('div');
        el.id = 'auction_panel';
        el.style.cssText = `
            position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
            width:min(95vw,800px); height:min(90vh,580px);
            background:#0d0d1a; border:1px solid #2a2a4a;
            border-radius:12px; box-shadow:0 0 40px rgba(0,0,0,.8);
            display:flex; flex-direction:column; z-index:1000;
            font-family:'Courier New',monospace; color:#e8eef6;
        `;
        el.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;
            padding:14px 18px;border-bottom:1px solid #1a1a2a;background:#08081a;border-radius:12px 12px 0 0">
            <div style="font-size:14px;font-weight:700;color:#bb86fc">🏛️ AUCTION HOUSE</div>
            <div style="display:flex;gap:6px">
                <button onclick="AuctionUI.switchTab('browse')" id="atab_browse"
                    class="atab active">Browse</button>
                <button onclick="AuctionUI.switchTab('sell')" id="atab_sell"
                    class="atab">Post Item</button>
                <button onclick="AuctionUI.switchTab('mine')" id="atab_mine"
                    class="atab">My Listings</button>
                <button onclick="AuctionUI.close()"
                    style="padding:5px 12px;background:transparent;border:1px solid #333;color:#888;
                    cursor:pointer;border-radius:6px;font-family:monospace;font-size:12px">✕</button>
            </div>
        </div>
        <style>
            .atab { padding:5px 14px;background:transparent;border:1px solid #222;color:#888;
                cursor:pointer;border-radius:6px;font-family:monospace;font-size:12px; }
            .atab.active { background:#1a1a3a;border-color:#3a3a6a;color:#bb86fc; }
            .auction-row { display:grid;grid-template-columns:2fr 80px 80px 80px 80px 120px;
                gap:8px;padding:8px 12px;border-bottom:1px solid #111;align-items:center;
                font-size:12px; }
            .auction-row:hover { background:rgba(255,255,255,.02); }
            #auction_body { overflow-y:auto;flex:1;padding:12px; }
        </style>
        <div id="auction_body">Loading...</div>`;
        document.body.appendChild(el);
    },

    switchTab: async (tab) => {
        AuctionUI._tab = tab;
        document.querySelectorAll('.atab').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('atab_' + tab);
        if (btn) btn.classList.add('active');
        AuctionUI._page = 1;
        await AuctionUI._render();
    },

    _render: async () => {
        const body = document.getElementById('auction_body');
        if (!body) return;
        body.innerHTML = '<div style="text-align:center;padding:40px;color:#555">Loading...</div>';

        if (AuctionUI._tab === 'browse') await AuctionUI._renderBrowse();
        else if (AuctionUI._tab === 'sell') await AuctionUI._renderSell();
        else if (AuctionUI._tab === 'mine') await AuctionUI._renderMine();
    },

    _post: async (url, data) => {
        const r = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return r.json();
    },

    _renderBrowse: async () => {
        const f = AuctionUI._filter;
        const j = await AuctionUI._post('/api/auction/browse', {
            charId: AuctionUI._charId,
            ...f,
            page: AuctionUI._page
        });

        const body = document.getElementById('auction_body');
        if (!body) return;

        if (!j.success) { body.innerHTML = `<p style="color:#f55;padding:20px">${j.message}</p>`; return; }

        const listings = j.listings || [];
        AuctionUI._listings = listings;
        AuctionUI._total = j.total || 0;

        let h = `
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
            <input placeholder="Search item name..." value="${f.search}"
                style="flex:2;min-width:150px;padding:6px;background:#111;border:1px solid #222;
                color:#e8eef6;border-radius:4px;font-family:monospace"
                oninput="AuctionUI._filter.search=this.value;AuctionUI._page=1;AuctionUI._renderBrowse()">
            <select style="padding:6px;background:#111;border:1px solid #222;color:#e8eef6;border-radius:4px"
                onchange="AuctionUI._filter.category=this.value;AuctionUI._page=1;AuctionUI._renderBrowse()">
                <option value="">All Types</option>
                ${['WEAPON','ARMOR','HELMET','BOOTS','ACCESSORY','CONSUMABLE','MISC'].map(t =>
                    `<option value="${t}" ${f.category===t?'selected':''}>${t}</option>`).join('')}
            </select>
            <select style="padding:6px;background:#111;border:1px solid #222;color:#e8eef6;border-radius:4px"
                onchange="AuctionUI._filter.sort=this.value;AuctionUI._page=1;AuctionUI._renderBrowse()">
                <option value="price_asc" ${f.sort==='price_asc'?'selected':''}>Price ↑</option>
                <option value="price_desc" ${f.sort==='price_desc'?'selected':''}>Price ↓</option>
                <option value="newest" ${f.sort==='newest'?'selected':''}>Newest</option>
                <option value="expiring" ${f.sort==='expiring'?'selected':''}>Expiring Soon</option>
            </select>
        </div>`;

        if (!listings.length) {
            h += `<div style="text-align:center;padding:40px;color:#555">No listings found.</div>`;
        } else {
            h += `<div class="auction-row" style="border-bottom:2px solid #2a2a4a;font-size:10px;color:#777;font-weight:700">
                <span>ITEM</span><span>TYPE</span><span>QTY</span>
                <span>BUYOUT</span><span>BID</span><span>EXPIRES</span>
            </div>`;

            for (const l of listings) {
                const hoursLeft = l.hours_left >= 0 ? l.hours_left : 0;
                const timeStr = hoursLeft < 2 ? `<span style="color:#f55">${hoursLeft}h</span>`
                    : hoursLeft < 12 ? `<span style="color:#fa0">${hoursLeft}h</span>`
                    : `${hoursLeft}h`;
                h += `<div class="auction-row">
                    <div>
                        <span style="font-size:16px">${l.item_icon||'📦'}</span>
                        <b style="color:#e8eef6"> ${l.item_name}</b>
                        <div style="font-size:10px;color:#555">by ${l.seller_name}</div>
                    </div>
                    <span style="color:#888;font-size:10px">${l.item_type}</span>
                    <span>×${l.quantity}</span>
                    <span style="color:#ffd700">${l.buyout_price}g
                        <button onclick="AuctionUI.buyout(${l.id},'${l.item_name}',${l.buyout_price})"
                            style="display:block;margin-top:2px;padding:2px 8px;background:#1a3a00;
                            border:1px solid #0a4;color:#0f0;cursor:pointer;border-radius:4px;
                            font-family:monospace;font-size:10px">BUY</button>
                    </span>
                    <span style="color:#8af">
                        ${l.current_bid > 0 ? l.current_bid+'g' : '<span style="color:#444">—</span>'}
                        <button onclick="AuctionUI.showBidDialog(${l.id},'${l.item_name}',${l.current_bid},${l.min_bid})"
                            style="display:block;margin-top:2px;padding:2px 8px;background:#001a3a;
                            border:1px solid #08f;color:#8af;cursor:pointer;border-radius:4px;
                            font-family:monospace;font-size:10px">BID</button>
                    </span>
                    <span style="color:#555;font-size:10px">${timeStr}</span>
                </div>`;
            }
        }

        // Pagination
        const pages = j.pages || 1;
        if (pages > 1) {
            h += `<div style="display:flex;justify-content:center;gap:8px;margin-top:12px">`;
            for (let p = 1; p <= pages; p++) {
                h += `<button onclick="AuctionUI._page=${p};AuctionUI._renderBrowse()"
                    style="padding:4px 10px;background:${p===AuctionUI._page?'#2a2a4a':'#111'};
                    border:1px solid #2a2a4a;color:#e8eef6;cursor:pointer;border-radius:4px;font-family:monospace">${p}</button>`;
            }
            h += '</div>';
        }

        // body was already declared above — reuse it
        if (body) body.innerHTML = h;
    },

    buyout: async (listingId, itemName, price) => {
        if (!confirm(`Buy ${itemName} for ${price}g?`)) return;
        const j = await AuctionUI._post('/api/auction/buyout',
            { charId: AuctionUI._charId, listingId });
        AuctionUI._notify(j.message, j.success);
        if (j.success) AuctionUI._renderBrowse();
    },

    showBidDialog: (listingId, itemName, currentBid, minBid) => {
        const minAcceptable = Math.max(currentBid + 1, minBid || 1);
        const amount = prompt(`Bid on ${itemName}\nCurrent bid: ${currentBid}g\nMinimum: ${minAcceptable}g\n\nEnter your bid:`);
        if (!amount) return;
        const bid = parseInt(amount);
        if (isNaN(bid)) { AuctionUI._notify('Invalid amount.', false); return; }
        AuctionUI._post('/api/auction/bid',
            { charId: AuctionUI._charId, listingId, bidAmount: bid })
            .then(j => { AuctionUI._notify(j.message, j.success); if (j.success) AuctionUI._renderBrowse(); });
    },

    _renderSell: async () => {
        // Load full char data for inventory

        // Get inventory via existing socket/fetch
        const body = document.getElementById('auction_body');
        const charJ = await fetch('/get-char-full', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId: AuctionUI._charId })
        }).then(r => r.json()).catch(() => ({}));

        const inv = charJ.inventory || [];
        if (!inv.length) {
            body.innerHTML = '<div style="text-align:center;padding:40px;color:#555">Your inventory is empty.</div>';
            return;
        }

        let h = `<div style="font-size:11px;color:#555;margin-bottom:12px">
            Select an item from your inventory to list. A listing fee is charged upfront.
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px">`;

        for (const item of inv) {
            if (!item.quantity || item.quantity < 1) continue;
            h += `
            <div id="sell_card_${item.item_id}" style="background:#0d0d1a;border:1px solid #1a1a2a;
                border-radius:8px;padding:12px">
                <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
                    <span style="font-size:22px">${item.icon||'📦'}</span>
                    <div style="flex:1">
                        <div style="font-weight:700;font-size:13px">${item.name}</div>
                        <div style="font-size:10px;color:#555">${item.type} · ${item.quantity} in inventory</div>
                    </div>
                </div>
                <div style="display:flex;gap:6px;align-items:flex-end">
                    <div style="flex:1">
                        <div style="font-size:10px;color:#777;margin-bottom:2px">QTY</div>
                        <input type="number" id="aq_qty_${item.item_id}" value="1"
                            min="1" max="${item.quantity}" style="width:50px;padding:4px;
                            background:#111;border:1px solid #222;color:#e8eef6;border-radius:4px">
                    </div>
                    <div style="flex:2">
                        <div style="font-size:10px;color:#777;margin-bottom:2px">BUYOUT PRICE</div>
                        <input type="number" id="aq_price_${item.item_id}"
                            value="${Math.max(1, (item.value||1) * 2)}" min="1"
                            style="width:80px;padding:4px;background:#111;border:1px solid #222;
                            color:#ffd700;border-radius:4px">
                    </div>
                    <button onclick="AuctionUI.listItem(${item.item_id})"
                        style="padding:5px 12px;background:#1a0a00;border:1px solid #8b6914;
                        color:#ffd700;cursor:pointer;border-radius:6px;font-family:monospace;font-size:11px">
                        LIST
                    </button>
                </div>
            </div>`;
        }
        h += '</div>';
        body.innerHTML = h;
    },

    listItem: async (itemId) => {
        const qty   = parseInt(document.getElementById('aq_qty_' + itemId)?.value) || 1;
        const price = parseInt(document.getElementById('aq_price_' + itemId)?.value);
        if (!price) { AuctionUI._notify('Enter a price.', false); return; }

        const j = await AuctionUI._post('/api/auction/list', {
            charId: AuctionUI._charId, itemId, quantity: qty, buyoutPrice: price
        });
        AuctionUI._notify(j.message, j.success);
        if (j.success) AuctionUI.switchTab('mine');
    },

    _renderMine: async () => {
        const j = await AuctionUI._post('/api/auction/my-listings',
            { charId: AuctionUI._charId });
        const body = document.getElementById('auction_body');
        if (!j.success) { body.innerHTML = `<p style="color:#f55;padding:20px">${j.message}</p>`; return; }

        const listings = j.listings || [];
        if (!listings.length) {
            body.innerHTML = '<div style="text-align:center;padding:40px;color:#555">You have no active listings.</div>';
            return;
        }

        let h = `<div class="auction-row" style="border-bottom:2px solid #2a2a4a;font-size:10px;color:#777;font-weight:700">
            <span>ITEM</span><span>QTY</span><span>BUYOUT</span><span>BID</span><span>EXPIRES</span><span>STATUS / ACTION</span>
        </div>`;

        for (const l of listings) {
            const hoursLeft = l.hours_left ?? '?';
            const isActive  = l.status === 'ACTIVE';
            h += `<div class="auction-row">
                <div><span style="font-size:16px">${l.item_icon||'📦'}</span> <b>${l.item_name}</b></div>
                <span>×${l.quantity}</span>
                <span style="color:#ffd700">${l.buyout_price}g</span>
                <span style="color:#8af">${l.current_bid > 0 ? l.current_bid+'g ('+l.bidder_name+')' : '—'}</span>
                <span style="color:#555;font-size:10px">${isActive ? hoursLeft+'h left' : '—'}</span>
                <span>
                    <span style="font-size:11px;color:${l.status==='ACTIVE'?'#0cf':'#555'}">${l.status}</span>
                    ${isActive ? `<button onclick="AuctionUI.cancelListing(${l.id})"
                        style="display:block;margin-top:3px;padding:2px 8px;background:#1a0000;
                        border:1px solid #600;color:#f55;cursor:pointer;border-radius:4px;
                        font-family:monospace;font-size:10px">CANCEL</button>` : ''}
                </span>
            </div>`;
        }
        body.innerHTML = h;
    },

    cancelListing: async (listingId) => {
        if (!confirm('Cancel this listing? Item will be returned. Listing fee is non-refundable.')) return;
        const j = await AuctionUI._post('/api/auction/cancel',
            { charId: AuctionUI._charId, listingId });
        AuctionUI._notify(j.message, j.success);
        if (j.success) AuctionUI._renderMine();
    },

    _notify: (msg, ok) => {
        if (typeof showNotification === 'function') {
            showNotification(msg, ok ? 'xp' : 'damage');
        } else {
            alert(msg);
        }
    }
};
