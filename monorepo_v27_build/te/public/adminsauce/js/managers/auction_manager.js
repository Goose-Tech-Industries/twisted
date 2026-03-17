// =================================================================
// AUCTION MANAGER — Monitor and moderate the auction house
// =================================================================

const AuctionManager = {
    _listings: [],
    _items: [],

    init: async () => {
        document.getElementById('pageTitle').innerText = '🏛️ AUCTION HOUSE';
        const [lr, ir] = await Promise.all([
            API.getAll('auction_listing'),
            API.getAll('item')
        ]);
        AuctionManager._listings = lr.success ? lr.data : [];
        AuctionManager._items    = ir.success ? ir.data : [];
        AuctionManager.renderDashboard();
    },

    renderDashboard: () => {
        const listings = AuctionManager._listings;
        const items    = AuctionManager._items;
        const itemMap  = {};
        for (const it of items) itemMap[it.id] = it;

        const active   = listings.filter(l => l.status === 'ACTIVE').length;
        const soldBuy  = listings.filter(l => l.status === 'SOLD_BUYOUT').length;
        const soldBid  = listings.filter(l => l.status === 'SOLD_BID').length;
        const expired  = listings.filter(l => l.status === 'EXPIRED').length;
        const cancelled= listings.filter(l => l.status === 'CANCELLED').length;

        let h = `
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px">
            <div class="stat-card"><div class="stat-val" style="color:#0cf">${active}</div><div class="stat-lbl">ACTIVE</div></div>
            <div class="stat-card"><div class="stat-val" style="color:#0a0">${soldBuy}</div><div class="stat-lbl">SOLD (BUYOUT)</div></div>
            <div class="stat-card"><div class="stat-val" style="color:#0c0">${soldBid}</div><div class="stat-lbl">SOLD (BID)</div></div>
            <div class="stat-card"><div class="stat-val" style="color:#555">${expired}</div><div class="stat-lbl">EXPIRED</div></div>
            <div class="stat-card"><div class="stat-val" style="color:#a55">${cancelled}</div><div class="stat-lbl">CANCELLED</div></div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h3 style="margin:0;color:var(--a)">All Listings</h3>
            <button class="del-btn" onclick="AuctionManager.clearExpired()">🗑️ Clear Expired/Cancelled</button>
        </div>

        <table><thead><tr>
            <th>ITEM</th><th>SELLER</th><th>BUYOUT</th><th>CURRENT BID</th><th>BIDDER</th><th>EXPIRES</th><th>STATUS</th><th>ACTIONS</th>
        </tr></thead><tbody>`;

        const STATUS_COLOR = {
            ACTIVE: '#0cf', SOLD_BUYOUT: '#0a0', SOLD_BID: '#0c0', EXPIRED: '#555', CANCELLED: '#a55'
        };

        for (const l of listings) {
            const it = itemMap[l.item_id];
            h += `<tr>
                <td>${it ? `${it.icon||'📦'} <b>${it.name}</b>` : '#'+l.item_id}
                    <span style="color:#555;font-size:10px"> ×${l.quantity}</span></td>
                <td style="font-size:11px">${l.seller_name}</td>
                <td style="color:#ffd700">${l.buyout_price}g</td>
                <td>${l.current_bid > 0 ? l.current_bid+'g' : '—'}</td>
                <td style="font-size:11px">${l.bidder_name || '—'}</td>
                <td style="font-size:10px;color:#555">${l.expires_at ? new Date(l.expires_at).toLocaleString() : '—'}</td>
                <td><span style="color:${STATUS_COLOR[l.status]||'#aaa'};font-size:11px">${l.status}</span></td>
                <td><button class="del-btn" onclick="AuctionManager.removeListing(${l.id})">DEL</button></td>
            </tr>`;
        }
        h += '</tbody></table>';

        h += `
        <div style="margin-top:24px;background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:16px">
            <h4 style="margin:0 0 12px;color:var(--a)">⚙️ Auction Settings</h4>
            <div style="font-size:11px;color:#555;margin-bottom:12px">
                These settings are in AdminSauce → ⚙️ Settings. Key names:
                <code>auction_listing_fee_pct</code>, <code>auction_sale_tax_pct</code>,
                <code>auction_max_listings</code>, <code>auction_duration_hours</code>,
                <code>auction_enabled</code>
            </div>
            <button class="edit-btn" onclick="loadManager('setting')">Open Settings Manager →</button>
        </div>`;

        document.getElementById('dynamicArea').innerHTML = h;
    },

    removeListing: async (id) => {
        if (!confirm('Force-remove this listing? Item will NOT be returned.')) return;
        await API.delete('auction_listing', id);
        AuctionManager.init();
    },

    clearExpired: async () => {
        if (!confirm('Delete all EXPIRED and CANCELLED listings from the table?')) return;
        const toDelete = AuctionManager._listings
            .filter(l => l.status === 'EXPIRED' || l.status === 'CANCELLED');
        for (const l of toDelete) await API.delete('auction_listing', l.id);
        AuctionManager.init();
    }
};
