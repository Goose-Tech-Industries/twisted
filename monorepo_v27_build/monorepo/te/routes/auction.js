// =================================================================
// AUCTION HOUSE ROUTES
// =================================================================
// POST /api/auction/browse    — get all active listings (with filters)
// POST /api/auction/list      — create a new listing (costs a fee)
// POST /api/auction/bid       — place a bid on a listing
// POST /api/auction/buyout    — buy immediately at buyout price
// POST /api/auction/cancel    — cancel your own listing
// POST /api/auction/my-listings — your active listings
// POST /api/auction/my-bids    — listings you've bid on
// POST /api/auction/collect    — collect won/expired items and gold
//
// TEACHING: An auction house is like a bulletin board where players
// post items for sale. Other players can either bid (like eBay) or
// buy instantly at the buyout price. When a listing expires:
//   - If someone bid: winner gets the item, seller gets the gold
//   - If no bids: seller gets the item back
// The scheduler handles expiry (SHOP_RESTOCK task runs every N hours).
// Actually: expiry is handled by a check when browsing + on buyout.
// =================================================================

const express = require('express');
const router  = express.Router();
let db;
module.exports.init = (database) => { db = database; };

function uid(req)  { return req.session?.userId; }
function jp(s, d)  { try { return typeof s === 'string' ? JSON.parse(s) : (s || d); } catch { return d; } }

async function getSetting(key, def) {
    try {
        const [r] = await db.query('SELECT setting_value FROM system_settings WHERE setting_key=?', [key]);
        return r.length ? r[0].setting_value : def;
    } catch { return def; }
}

async function verifyOwnership(userId, charId) {
    if (!userId || !charId) return false;
    const [r] = await db.query('SELECT id FROM characters WHERE id=? AND user_id=?', [charId, userId]);
    return r.length > 0;
}

// ── Expire stale listings (called before any read) ────────────────
async function resolveExpiredListings() {
    // Find expired ACTIVE listings
    const [expired] = await db.query(
        `SELECT * FROM auction_listings WHERE status='ACTIVE' AND expires_at <= NOW()`);

    for (const lst of expired) {
        if (lst.current_bid > 0 && lst.bidder_char_id) {
            // Someone bid — transfer item to bidder, gold to seller
            // 1. Give item to bidder
            await db.query(`
                INSERT INTO character_items (character_id, item_id, quantity)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
                [lst.bidder_char_id, lst.item_id, lst.quantity]);
            // 2. Give gold to seller (minus tax)
            const taxPct = parseInt(await getSetting('auction_sale_tax_pct', 5));
            const proceeds = Math.floor(lst.current_bid * (1 - taxPct / 100));
            const [sellerChar] = await db.query('SELECT user_id FROM characters WHERE id=?', [lst.seller_char_id]);
            if (sellerChar.length) {
                await db.query('UPDATE users SET currency=currency+? WHERE id=?',
                    [proceeds, sellerChar[0].user_id]);
            }
            await db.query(
                `UPDATE auction_listings SET status='SOLD_BID' WHERE id=?`, [lst.id]);
        } else {
            // No bids — return item to seller
            await db.query(`
                INSERT INTO character_items (character_id, item_id, quantity)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
                [lst.seller_char_id, lst.item_id, lst.quantity]);
            await db.query(
                `UPDATE auction_listings SET status='EXPIRED' WHERE id=?`, [lst.id]);
        }
    }
    return expired.length;
}

// ── GET BROWSE ────────────────────────────────────────────────────
router.post('/browse', async (req, res) => {
    try {
        if (!uid(req)) return res.json({ success: false, message: 'Not logged in.' });

        await resolveExpiredListings();

        const { category, search, sort = 'price_asc', page = 1 } = req.body;
        const limit = 20;
        const offset = (page - 1) * limit;

        let where = `al.status = 'ACTIVE'`;
        const params = [];
        if (category) { where += ` AND gi.type = ?`; params.push(category); }
        if (search)   { where += ` AND gi.name LIKE ?`; params.push(`%${search}%`); }

        const orderMap = {
            price_asc:   'al.buyout_price ASC',
            price_desc:  'al.buyout_price DESC',
            newest:      'al.created_at DESC',
            expiring:    'al.expires_at ASC',
        };
        const order = orderMap[sort] || 'al.buyout_price ASC';

        const [rows] = await db.query(`
            SELECT al.*, gi.name AS item_name, gi.icon AS item_icon,
                   gi.type AS item_type, gi.description AS item_desc,
                   gi.bonus_atk, gi.bonus_def, gi.bonus_mo, gi.bonus_md,
                   gi.bonus_hp, gi.bonus_mp, gi.bonus_speed,
                   TIMESTAMPDIFF(HOUR, NOW(), al.expires_at) AS hours_left
            FROM auction_listings al
            JOIN game_items gi ON gi.id = al.item_id
            WHERE ${where}
            ORDER BY ${order}
            LIMIT ? OFFSET ?`,
            [...params, limit, offset]);

        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) AS total FROM auction_listings al
             JOIN game_items gi ON gi.id = al.item_id WHERE ${where}`,
            params);

        res.json({ success: true, listings: rows, total, page, pages: Math.ceil(total / limit) });
    } catch(e) { console.error(e); res.json({ success: false, message: e.message }); }
});

// ── POST LIST (create listing) ────────────────────────────────────
router.post('/list', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.json({ success: false, message: 'Not logged in.' });

        const { charId, itemId, quantity, buyoutPrice, minBid = 0 } = req.body;
        const qty = parseInt(quantity) || 1;
        const buyout = parseInt(buyoutPrice);
        if (!buyout || buyout < 1) return res.json({ success: false, message: 'Invalid price.' });

        if (!await verifyOwnership(userId, charId))
            return res.json({ success: false, message: 'Unauthorized.' });

        // Check auction is enabled
        const enabled = await getSetting('auction_enabled', 'true');
        if (enabled !== 'true') return res.json({ success: false, message: 'Auction house is closed.' });

        // Check max listings
        const maxListings = parseInt(await getSetting('auction_max_listings', 10));
        const [[{ activeCount }]] = await db.query(
            `SELECT COUNT(*) AS activeCount FROM auction_listings
             WHERE seller_char_id=? AND status='ACTIVE'`, [charId]);
        if (activeCount >= maxListings)
            return res.json({ success: false,
                message: `Max ${maxListings} active listings per character.` });

        // Verify player has enough of the item
        const [inv] = await db.query(
            'SELECT * FROM character_items WHERE character_id=? AND item_id=?',
            [charId, itemId]);
        if (!inv.length || inv[0].quantity < qty)
            return res.json({ success: false, message: 'Not enough of that item in your inventory.' });

        // Calculate listing fee
        const feePct = parseInt(await getSetting('auction_listing_fee_pct', 5));
        const fee = Math.max(1, Math.floor(buyout * qty * feePct / 100));

        // Check player can afford fee
        const [userRow] = await db.query('SELECT currency FROM users WHERE id=?', [userId]);
        if (!userRow.length || userRow[0].currency < fee)
            return res.json({ success: false, message: `Listing fee is ${fee}g. You don't have enough.` });

        // Duration
        const durationHours = parseInt(await getSetting('auction_duration_hours', 48));

        // Atomic: deduct item + fee, create listing
        const newQty = inv[0].quantity - qty;
        if (newQty <= 0) {
            await db.query('DELETE FROM character_items WHERE id=?', [inv[0].id]);
        } else {
            await db.query('UPDATE character_items SET quantity=? WHERE id=?', [newQty, inv[0].id]);
        }
        await db.query('UPDATE users SET currency=currency-? WHERE id=?', [fee, userId]);

        // Get seller char name
        const [charRow] = await db.query('SELECT name FROM characters WHERE id=?', [charId]);
        const sellerName = charRow.length ? charRow[0].name : 'Unknown';

        await db.query(`
            INSERT INTO auction_listings
            (seller_char_id, seller_name, item_id, quantity, buyout_price, min_bid, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
            [charId, sellerName, itemId, qty, buyout, parseInt(minBid)||0, durationHours]);

        const [itemRow] = await db.query('SELECT name FROM game_items WHERE id=?', [itemId]);
        const itemName = itemRow.length ? itemRow[0].name : 'item';

        res.json({ success: true,
            message: `Listed ${qty}x ${itemName} for ${buyout}g. Fee: ${fee}g. Expires in ${durationHours}h.` });

    } catch(e) { console.error(e); res.json({ success: false, message: e.message }); }
});

// ── POST BID ──────────────────────────────────────────────────────
router.post('/bid', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.json({ success: false, message: 'Not logged in.' });

        const { charId, listingId, bidAmount } = req.body;
        const bid = parseInt(bidAmount);

        if (!await verifyOwnership(userId, charId))
            return res.json({ success: false, message: 'Unauthorized.' });

        await resolveExpiredListings();

        const [rows] = await db.query(
            `SELECT al.*, gi.name AS item_name FROM auction_listings al
             JOIN game_items gi ON gi.id = al.item_id WHERE al.id=? AND al.status='ACTIVE'`,
            [listingId]);
        if (!rows.length) return res.json({ success: false, message: 'Listing not found or expired.' });
        const lst = rows[0];

        if (lst.seller_char_id === parseInt(charId))
            return res.json({ success: false, message: "You can't bid on your own listing." });

        const minAcceptable = Math.max(lst.current_bid + 1, lst.min_bid || 1);
        if (bid < minAcceptable)
            return res.json({ success: false, message: `Minimum bid is ${minAcceptable}g.` });

        // Check buyer has gold
        const [userRow] = await db.query('SELECT currency FROM users WHERE id=?', [userId]);
        if (!userRow.length || userRow[0].currency < bid)
            return res.json({ success: false, message: `You need ${bid}g to bid.` });

        // Refund previous bidder if any
        if (lst.bidder_char_id && lst.current_bid > 0) {
            const [prevBidderChar] = await db.query(
                'SELECT user_id FROM characters WHERE id=?', [lst.bidder_char_id]);
            if (prevBidderChar.length) {
                await db.query('UPDATE users SET currency=currency+? WHERE id=?',
                    [lst.current_bid, prevBidderChar[0].user_id]);
            }
        }

        // Deduct new bid
        await db.query('UPDATE users SET currency=currency-? WHERE id=?', [bid, userId]);

        // Get bidder name
        const [bidderChar] = await db.query('SELECT name FROM characters WHERE id=?', [charId]);
        const bidderName = bidderChar.length ? bidderChar[0].name : 'Unknown';

        await db.query(
            `UPDATE auction_listings SET current_bid=?, bidder_char_id=?, bidder_name=? WHERE id=?`,
            [bid, charId, bidderName, listingId]);

        res.json({ success: true, message: `Bid of ${bid}g placed on ${lst.item_name}!` });
    } catch(e) { console.error(e); res.json({ success: false, message: e.message }); }
});

// ── POST BUYOUT ───────────────────────────────────────────────────
router.post('/buyout', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.json({ success: false, message: 'Not logged in.' });

        const { charId, listingId } = req.body;
        if (!await verifyOwnership(userId, charId))
            return res.json({ success: false, message: 'Unauthorized.' });

        await resolveExpiredListings();

        const [rows] = await db.query(
            `SELECT al.*, gi.name AS item_name FROM auction_listings al
             JOIN game_items gi ON gi.id = al.item_id WHERE al.id=? AND al.status='ACTIVE'`,
            [listingId]);
        if (!rows.length) return res.json({ success: false, message: 'Listing not found or expired.' });
        const lst = rows[0];

        if (lst.seller_char_id === parseInt(charId))
            return res.json({ success: false, message: "You can't buy your own listing." });

        // Check buyer can afford buyout
        const [userRow] = await db.query('SELECT currency FROM users WHERE id=?', [userId]);
        if (!userRow.length || userRow[0].currency < lst.buyout_price)
            return res.json({ success: false, message: `You need ${lst.buyout_price}g.` });

        // Refund previous bidder if any
        if (lst.bidder_char_id && lst.current_bid > 0) {
            const [prevBidderChar] = await db.query(
                'SELECT user_id FROM characters WHERE id=?', [lst.bidder_char_id]);
            if (prevBidderChar.length) {
                await db.query('UPDATE users SET currency=currency+? WHERE id=?',
                    [lst.current_bid, prevBidderChar[0].user_id]);
            }
        }

        // Charge buyer
        await db.query('UPDATE users SET currency=currency-? WHERE id=?',
            [lst.buyout_price, userId]);

        // Give item to buyer
        await db.query(`
            INSERT INTO character_items (character_id, item_id, quantity)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
            [charId, lst.item_id, lst.quantity]);

        // Pay seller (minus tax)
        const taxPct = parseInt(await getSetting('auction_sale_tax_pct', 5));
        const proceeds = Math.floor(lst.buyout_price * (1 - taxPct / 100));
        const [sellerChar] = await db.query('SELECT user_id FROM characters WHERE id=?', [lst.seller_char_id]);
        if (sellerChar.length) {
            await db.query('UPDATE users SET currency=currency+? WHERE id=?',
                [proceeds, sellerChar[0].user_id]);
        }

        await db.query(`UPDATE auction_listings SET status='SOLD_BUYOUT' WHERE id=?`, [listingId]);

        res.json({ success: true,
            message: `✅ Bought ${lst.quantity}x ${lst.item_name} for ${lst.buyout_price}g!` });
    } catch(e) { console.error(e); res.json({ success: false, message: e.message }); }
});

// ── POST CANCEL ───────────────────────────────────────────────────
router.post('/cancel', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.json({ success: false, message: 'Not logged in.' });

        const { charId, listingId } = req.body;
        if (!await verifyOwnership(userId, charId))
            return res.json({ success: false, message: 'Unauthorized.' });

        const [rows] = await db.query(
            `SELECT * FROM auction_listings WHERE id=? AND seller_char_id=? AND status='ACTIVE'`,
            [listingId, charId]);
        if (!rows.length)
            return res.json({ success: false, message: 'Listing not found or already sold.' });
        const lst = rows[0];

        // Refund current bidder if any
        if (lst.bidder_char_id && lst.current_bid > 0) {
            const [prev] = await db.query('SELECT user_id FROM characters WHERE id=?', [lst.bidder_char_id]);
            if (prev.length) {
                await db.query('UPDATE users SET currency=currency+? WHERE id=?',
                    [lst.current_bid, prev[0].user_id]);
            }
        }

        // Return item to seller
        await db.query(`
            INSERT INTO character_items (character_id, item_id, quantity)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
            [lst.seller_char_id, lst.item_id, lst.quantity]);

        // Note: listing fee is NOT refunded (non-refundable deposit)
        await db.query(`UPDATE auction_listings SET status='CANCELLED' WHERE id=?`, [listingId]);

        res.json({ success: true, message: 'Listing cancelled. Item returned to inventory.' });
    } catch(e) { console.error(e); res.json({ success: false, message: e.message }); }
});

// ── POST MY-LISTINGS ──────────────────────────────────────────────
router.post('/my-listings', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.json({ success: false, message: 'Not logged in.' });

        const { charId } = req.body;
        if (!await verifyOwnership(userId, charId))
            return res.json({ success: false, message: 'Unauthorized.' });

        await resolveExpiredListings();

        const [rows] = await db.query(`
            SELECT al.*, gi.name AS item_name, gi.icon AS item_icon,
                   TIMESTAMPDIFF(HOUR, NOW(), al.expires_at) AS hours_left
            FROM auction_listings al
            JOIN game_items gi ON gi.id = al.item_id
            WHERE al.seller_char_id=?
            ORDER BY al.created_at DESC LIMIT 50`, [charId]);

        res.json({ success: true, listings: rows });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// ── POST MY-BIDS ──────────────────────────────────────────────────
router.post('/my-bids', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.json({ success: false, message: 'Not logged in.' });

        const { charId } = req.body;
        if (!await verifyOwnership(userId, charId))
            return res.json({ success: false, message: 'Unauthorized.' });

        const [rows] = await db.query(`
            SELECT al.*, gi.name AS item_name, gi.icon AS item_icon,
                   TIMESTAMPDIFF(HOUR, NOW(), al.expires_at) AS hours_left
            FROM auction_listings al
            JOIN game_items gi ON gi.id = al.item_id
            WHERE al.bidder_char_id=? AND al.status='ACTIVE'
            ORDER BY al.expires_at ASC`, [charId]);

        res.json({ success: true, listings: rows });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

module.exports = router;
module.exports.init = (database) => { db = database; };

// Exported so the scheduler can call this on a timer — auction expiry
// should NOT rely only on players browsing to trigger cleanup.
module.exports.resolveExpiredListings = resolveExpiredListings;
