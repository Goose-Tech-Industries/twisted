// =================================================================
// PLAYER MAIL ROUTES  v2.0
// Mounted at /api/mail
//
// Full-featured mail system: messages, gold, items, COD,
// reply threading, starred, sent folder, system mail,
// bulk actions, forward, templates.
//
// Endpoints:
//   POST /api/mail/send             — send mail (gold/item/COD attachments)
//   GET  /api/mail/inbox/:charId    — fetch inbox
//   GET  /api/mail/sent/:charId     — fetch sent mail
//   POST /api/mail/read             — mark as read
//   POST /api/mail/star             — toggle starred
//   POST /api/mail/delete           — delete (refunds uncollected attachments)
//   POST /api/mail/collect-gold     — collect gold attachment
//   POST /api/mail/collect-item     — collect item attachment (pay COD if set)
//   POST /api/mail/collect-all      — collect all gold/items from all mail
//   POST /api/mail/bulk-delete      — delete multiple mails
//   POST /api/mail/forward          — forward a mail to another player
//   POST /api/mail/reply            — reply to a mail (creates thread)
//   POST /api/mail/system-send      — send system mail (staff only)
//   GET  /api/mail/unread-count/:charId — badge count
//   GET  /api/mail/templates        — quick-send templates
// =================================================================

const express = require('express');
const router  = express.Router();
let db, io;
router.init = (database, ioInstance) => { db = database; io = ioInstance; };

function uid(req) { return req.session && req.session.userId; }

async function verifyChar(userId, charId) {
    const [r] = await db.query(
        'SELECT id, name FROM characters WHERE id=? AND user_id=?', [charId, userId]);
    return r.length ? r[0] : null;
}

function notifyOnline(charId, event, payload) {
    if (!io || !global._onlinePlayers) return;
    for (const [sid, p] of Object.entries(global._onlinePlayers)) {
        if (p.charId === parseInt(charId)) {
            io.to(sid).emit(event, payload);
        }
    }
}

const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');

const LIMITS = {
    MAX_PER_INBOX: 100,
    SUBJECT_MAX:   120,
    BODY_MAX:      2000,
    GOLD_MAX:      1000000,
    DAYS_EXPIRE:   30,
    COD_MAX:       1000000,
};

const MAIL_SELECT = `id, sender_char_id, sender_name, recipient_char_id, subject, body,
    gold_attachment, gold_collected, item_attachment_id, item_attachment_qty,
    item_collected, cod_price, cod_paid, is_read, is_starred, is_system,
    reply_to_id, is_deleted, sender_deleted, sent_at, expires_at`;

// =================================================================
// SEND MAIL
// =================================================================
router.post('/send', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });

    const { charId, recipientName, recipientCharId, subject, body,
            goldAttachment, itemId, itemQty, codPrice, replyToId } = req.body;
    const senderId = parseInt(charId);

    // Resolve recipient by name or ID
    let recipId = parseInt(recipientCharId) || 0;
    if (!recipId && recipientName) {
        const [rr] = await db.query('SELECT id FROM characters WHERE LOWER(name)=LOWER(?)', [recipientName.trim()]);
        if (rr.length) recipId = rr[0].id;
    }

    if (!senderId || !recipId) return res.json({ success: false, message: 'Recipient not found.' });
    if (senderId === recipId) return res.json({ success: false, message: 'You cannot mail yourself.' });

    try {
        const sender = await verifyChar(userId, senderId);
        if (!sender) return res.json({ success: false, message: 'Not your character.' });

        const [[recip]] = await db.query('SELECT id, name FROM characters WHERE id=?', [recipId]);
        if (!recip) return res.json({ success: false, message: 'Recipient not found.' });

        // Block check
        const [blocked] = await db.query(
            `SELECT id FROM character_friends
             WHERE ((requester_id=? AND recipient_id=?) OR (requester_id=? AND recipient_id=?))
             AND status='blocked'`, [senderId, recipId, recipId, senderId]);
        if (blocked.length) return res.json({ success: false, message: 'Unable to send mail to this player.' });

        // Inbox cap
        const [[inboxCount]] = await db.query(
            'SELECT COUNT(*) AS n FROM character_mail WHERE recipient_char_id=? AND is_deleted=0', [recipId]);
        if (inboxCount.n >= LIMITS.MAX_PER_INBOX)
            return res.json({ success: false, message: `${recip.name}'s inbox is full.` });

        const cleanSubject = esc(String(subject || 'No subject').trim().slice(0, LIMITS.SUBJECT_MAX));
        const cleanBody    = esc(String(body || '').trim().slice(0, LIMITS.BODY_MAX));
        if (!cleanBody) return res.json({ success: false, message: 'Message body is required.' });

        // Gold attachment
        const gold = Math.max(0, Math.min(parseInt(goldAttachment) || 0, LIMITS.GOLD_MAX));
        if (gold > 0) {
            const [[senderUser]] = await db.query('SELECT user_id FROM characters WHERE id=?', [senderId]);
            const [[balance]] = await db.query('SELECT currency FROM users WHERE id=?', [senderUser.user_id]);
            if (balance.currency < gold)
                return res.json({ success: false, message: `You only have ${balance.currency} gold.` });
            await db.query('UPDATE users SET currency=currency-? WHERE id=?', [gold, senderUser.user_id]);
        }

        // Item attachment
        let attachItemId = null, attachItemQty = 0, attachCod = 0;
        if (itemId && parseInt(itemId) > 0) {
            attachItemId = parseInt(itemId);
            attachItemQty = Math.max(1, parseInt(itemQty) || 1);
            attachCod = Math.max(0, Math.min(parseInt(codPrice) || 0, LIMITS.COD_MAX));

            // Verify sender has the item
            const [[inv]] = await db.query(
                'SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=?',
                [senderId, attachItemId]);
            if (!inv || inv.quantity < attachItemQty)
                return res.json({ success: false, message: 'You don\'t have enough of that item.' });

            // Deduct from sender inventory
            if (inv.quantity === attachItemQty) {
                await db.query('DELETE FROM character_items WHERE id=?', [inv.id]);
            } else {
                await db.query('UPDATE character_items SET quantity=quantity-? WHERE id=?', [attachItemQty, inv.id]);
            }
        }

        const expiresAt = new Date(Date.now() + LIMITS.DAYS_EXPIRE * 86400000);
        await db.query(
            `INSERT INTO character_mail
             (sender_char_id, sender_name, recipient_char_id, subject, body,
              gold_attachment, item_attachment_id, item_attachment_qty, cod_price,
              reply_to_id, expires_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [senderId, sender.name, recipId, cleanSubject, cleanBody,
             gold, attachItemId, attachItemQty, attachCod,
             parseInt(replyToId) || null, expiresAt]
        );

        notifyOnline(recipId, 'mail_received', {
            from: sender.name, subject: cleanSubject,
            hasGold: gold > 0, hasItem: !!attachItemId, hasCod: attachCod > 0,
        });
        // Update unread count
        const [[unread]] = await db.query(
            'SELECT COUNT(*) AS n FROM character_mail WHERE recipient_char_id=? AND is_deleted=0 AND is_read=0', [recipId]);
        notifyOnline(recipId, 'mail_unread_count', { count: unread.n });

        res.json({ success: true, message: `Mail sent to ${recip.name}.` });
    } catch (e) {
        console.error('[Mail] send error:', e);
        res.json({ success: false, message: 'Server error.' });
    }
});

// =================================================================
// INBOX
// =================================================================
router.get('/inbox/:charId', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });
    const charId = parseInt(req.params.charId);
    try {
        if (!await verifyChar(userId, charId)) return res.json({ success: false, message: 'Unauthorized.' });

        // Auto-expire old mail
        await db.query(
            `UPDATE character_mail SET is_deleted=1
             WHERE recipient_char_id=? AND is_deleted=0 AND expires_at IS NOT NULL AND expires_at <= NOW()`,
            [charId]);

        const [rows] = await db.query(
            `SELECT m.${MAIL_SELECT},
                    gi.name AS item_name, gi.icon AS item_icon, gi.type AS item_type, gi.rarity AS item_rarity
             FROM character_mail m
             LEFT JOIN game_items gi ON gi.id = m.item_attachment_id
             WHERE m.recipient_char_id=? AND m.is_deleted=0
             ORDER BY m.is_starred DESC, m.sent_at DESC
             LIMIT 100`, [charId]);

        res.json({ success: true, data: rows });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// SENT FOLDER
// =================================================================
router.get('/sent/:charId', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });
    const charId = parseInt(req.params.charId);
    try {
        if (!await verifyChar(userId, charId)) return res.json({ success: false, message: 'Unauthorized.' });

        const [rows] = await db.query(
            `SELECT m.${MAIL_SELECT},
                    rc.name AS recipient_name,
                    gi.name AS item_name, gi.icon AS item_icon
             FROM character_mail m
             LEFT JOIN characters rc ON rc.id = m.recipient_char_id
             LEFT JOIN game_items gi ON gi.id = m.item_attachment_id
             WHERE m.sender_char_id=? AND m.sender_deleted=0
             ORDER BY m.sent_at DESC
             LIMIT 100`, [charId]);

        res.json({ success: true, data: rows });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// UNREAD COUNT
// =================================================================
router.get('/unread-count/:charId', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, count: 0 });
    const charId = parseInt(req.params.charId);
    try {
        if (!await verifyChar(userId, charId)) return res.json({ success: false, count: 0 });
        const [[row]] = await db.query(
            'SELECT COUNT(*) AS n FROM character_mail WHERE recipient_char_id=? AND is_deleted=0 AND is_read=0',
            [charId]);
        res.json({ success: true, count: row.n });
    } catch (e) {
        res.json({ success: false, count: 0 });
    }
});

// =================================================================
// MARK AS READ
// =================================================================
router.post('/read', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });
    const { charId, mailId } = req.body;
    try {
        if (!await verifyChar(userId, charId)) return res.json({ success: false, message: 'Unauthorized.' });
        await db.query('UPDATE character_mail SET is_read=1 WHERE id=? AND recipient_char_id=?', [mailId, charId]);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// TOGGLE STARRED
// =================================================================
router.post('/star', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });
    const { charId, mailId } = req.body;
    try {
        if (!await verifyChar(userId, charId)) return res.json({ success: false, message: 'Unauthorized.' });
        await db.query(
            'UPDATE character_mail SET is_starred = NOT is_starred WHERE id=? AND recipient_char_id=?',
            [mailId, charId]);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// COLLECT GOLD
// =================================================================
router.post('/collect-gold', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });
    const { charId, mailId } = req.body;
    try {
        const owner = await verifyChar(userId, charId);
        if (!owner) return res.json({ success: false, message: 'Unauthorized.' });

        const [[mail]] = await db.query(
            'SELECT gold_attachment, gold_collected FROM character_mail WHERE id=? AND recipient_char_id=? AND is_deleted=0',
            [mailId, charId]);
        if (!mail) return res.json({ success: false, message: 'Mail not found.' });
        if (mail.gold_collected) return res.json({ success: false, message: 'Already collected.' });
        if (!mail.gold_attachment || mail.gold_attachment <= 0)
            return res.json({ success: false, message: 'No gold to collect.' });

        const [[ch]] = await db.query('SELECT user_id FROM characters WHERE id=?', [charId]);
        await db.query('UPDATE users SET currency=currency+? WHERE id=?', [mail.gold_attachment, ch.user_id]);
        await db.query('UPDATE character_mail SET gold_collected=1, is_read=1 WHERE id=?', [mailId]);

        res.json({ success: true, gold: mail.gold_attachment, message: `Collected ${mail.gold_attachment} gold.` });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// COLLECT ITEM (with COD payment)
// =================================================================
router.post('/collect-item', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });
    const { charId, mailId } = req.body;
    try {
        const owner = await verifyChar(userId, charId);
        if (!owner) return res.json({ success: false, message: 'Unauthorized.' });

        const [[mail]] = await db.query(
            `SELECT item_attachment_id, item_attachment_qty, item_collected, cod_price, cod_paid, sender_char_id
             FROM character_mail WHERE id=? AND recipient_char_id=? AND is_deleted=0`, [mailId, charId]);
        if (!mail) return res.json({ success: false, message: 'Mail not found.' });
        if (mail.item_collected) return res.json({ success: false, message: 'Item already collected.' });
        if (!mail.item_attachment_id) return res.json({ success: false, message: 'No item to collect.' });

        // COD payment
        if (mail.cod_price > 0 && !mail.cod_paid) {
            const [[ch]] = await db.query('SELECT user_id FROM characters WHERE id=?', [charId]);
            const [[balance]] = await db.query('SELECT currency FROM users WHERE id=?', [ch.user_id]);
            if (balance.currency < mail.cod_price)
                return res.json({ success: false, message: `COD requires ${mail.cod_price} gold. You have ${balance.currency}.` });

            // Pay COD
            await db.query('UPDATE users SET currency=currency-? WHERE id=?', [mail.cod_price, ch.user_id]);

            // Send gold to original sender
            const [[senderCh]] = await db.query('SELECT user_id FROM characters WHERE id=?', [mail.sender_char_id]);
            if (senderCh) {
                await db.query('UPDATE users SET currency=currency+? WHERE id=?', [mail.cod_price, senderCh.user_id]);
                notifyOnline(mail.sender_char_id, 'notification', {
                    type: 'item', message: `💰 COD payment received: ${mail.cod_price}g`
                });
            }
            await db.query('UPDATE character_mail SET cod_paid=1 WHERE id=?', [mailId]);
        }

        // Give item to recipient
        const [[existing]] = await db.query(
            'SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=?',
            [charId, mail.item_attachment_id]);
        if (existing) {
            await db.query('UPDATE character_items SET quantity=quantity+? WHERE id=?',
                [mail.item_attachment_qty, existing.id]);
        } else {
            await db.query('INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?)',
                [charId, mail.item_attachment_id, mail.item_attachment_qty]);
        }

        await db.query('UPDATE character_mail SET item_collected=1, is_read=1 WHERE id=?', [mailId]);

        const [[itemInfo]] = await db.query('SELECT name FROM game_items WHERE id=?', [mail.item_attachment_id]);
        res.json({ success: true, message: `Collected ${mail.item_attachment_qty}x ${itemInfo?.name || 'item'}.` });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// COLLECT ALL (bulk gold + items from all mail)
// =================================================================
router.post('/collect-all', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });
    const { charId } = req.body;
    try {
        if (!await verifyChar(userId, charId)) return res.json({ success: false, message: 'Unauthorized.' });
        const [[ch]] = await db.query('SELECT user_id FROM characters WHERE id=?', [charId]);

        // Collect all uncollected gold (no COD mail)
        const [goldMails] = await db.query(
            `SELECT id, gold_attachment FROM character_mail
             WHERE recipient_char_id=? AND is_deleted=0 AND gold_collected=0 AND gold_attachment>0`,
            [charId]);
        let totalGold = 0;
        for (const m of goldMails) {
            totalGold += m.gold_attachment;
            await db.query('UPDATE character_mail SET gold_collected=1, is_read=1 WHERE id=?', [m.id]);
        }
        if (totalGold > 0) {
            await db.query('UPDATE users SET currency=currency+? WHERE id=?', [totalGold, ch.user_id]);
        }

        // Collect all uncollected items (skip COD items — those need individual acceptance)
        const [itemMails] = await db.query(
            `SELECT id, item_attachment_id, item_attachment_qty FROM character_mail
             WHERE recipient_char_id=? AND is_deleted=0 AND item_collected=0
             AND item_attachment_id IS NOT NULL AND cod_price=0`,
            [charId]);
        let itemCount = 0;
        for (const m of itemMails) {
            const [[existing]] = await db.query(
                'SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=?',
                [charId, m.item_attachment_id]);
            if (existing) {
                await db.query('UPDATE character_items SET quantity=quantity+? WHERE id=?',
                    [m.item_attachment_qty, existing.id]);
            } else {
                await db.query('INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?)',
                    [charId, m.item_attachment_id, m.item_attachment_qty]);
            }
            await db.query('UPDATE character_mail SET item_collected=1, is_read=1 WHERE id=?', [m.id]);
            itemCount += m.item_attachment_qty;
        }

        const parts = [];
        if (totalGold > 0) parts.push(`${totalGold} gold`);
        if (itemCount > 0) parts.push(`${itemCount} item(s)`);
        res.json({ success: true, message: parts.length ? `Collected: ${parts.join(', ')}.` : 'Nothing to collect.' });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// DELETE MAIL (refunds uncollected attachments)
// =================================================================
router.post('/delete', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });
    const { charId, mailId } = req.body;
    try {
        if (!await verifyChar(userId, charId)) return res.json({ success: false, message: 'Unauthorized.' });

        const [[mail]] = await db.query(
            `SELECT gold_attachment, gold_collected, item_attachment_id, item_attachment_qty,
                    item_collected, sender_char_id
             FROM character_mail WHERE id=? AND recipient_char_id=? AND is_deleted=0`, [mailId, charId]);
        if (!mail) return res.json({ success: false, message: 'Mail not found.' });

        // Refund uncollected gold to sender
        if (mail.gold_attachment > 0 && !mail.gold_collected) {
            const [[senderCh]] = await db.query('SELECT user_id FROM characters WHERE id=?', [mail.sender_char_id]);
            if (senderCh) {
                await db.query('UPDATE users SET currency=currency+? WHERE id=?', [mail.gold_attachment, senderCh.user_id]);
                notifyOnline(mail.sender_char_id, 'notification', {
                    type: 'info', message: `📬 Your ${mail.gold_attachment}g mail attachment was returned.`
                });
            }
        }

        // Return uncollected items to sender
        if (mail.item_attachment_id && !mail.item_collected) {
            const [[existing]] = await db.query(
                'SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=?',
                [mail.sender_char_id, mail.item_attachment_id]);
            if (existing) {
                await db.query('UPDATE character_items SET quantity=quantity+? WHERE id=?',
                    [mail.item_attachment_qty, existing.id]);
            } else {
                await db.query('INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?)',
                    [mail.sender_char_id, mail.item_attachment_id, mail.item_attachment_qty]);
            }
            notifyOnline(mail.sender_char_id, 'notification', {
                type: 'info', message: `📬 Your item attachment was returned (mail deleted).`
            });
        }

        await db.query('UPDATE character_mail SET is_deleted=1 WHERE id=?', [mailId]);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// BULK DELETE
// =================================================================
router.post('/bulk-delete', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });
    const { charId, mailIds, deleteRead } = req.body;
    try {
        if (!await verifyChar(userId, charId)) return res.json({ success: false, message: 'Unauthorized.' });

        let ids = [];
        if (deleteRead) {
            // Delete all read mail (with no uncollected attachments)
            const [rows] = await db.query(
                `SELECT id FROM character_mail
                 WHERE recipient_char_id=? AND is_deleted=0 AND is_read=1 AND is_starred=0
                 AND (gold_attachment=0 OR gold_collected=1)
                 AND (item_attachment_id IS NULL OR item_collected=1)`, [charId]);
            ids = rows.map(r => r.id);
        } else if (Array.isArray(mailIds)) {
            ids = mailIds.map(Number).filter(n => n > 0);
        }

        if (ids.length > 0) {
            await db.query(
                `UPDATE character_mail SET is_deleted=1
                 WHERE id IN (${ids.map(() => '?').join(',')}) AND recipient_char_id=?`,
                [...ids, charId]);
        }
        res.json({ success: true, deleted: ids.length });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// REPLY (creates threaded mail)
// =================================================================
router.post('/reply', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });
    const { charId, mailId, body, goldAttachment } = req.body;
    try {
        const sender = await verifyChar(userId, charId);
        if (!sender) return res.json({ success: false, message: 'Unauthorized.' });

        // Get original mail to find sender
        const [[original]] = await db.query(
            'SELECT sender_char_id, sender_name, subject FROM character_mail WHERE id=? AND recipient_char_id=?',
            [mailId, charId]);
        if (!original) return res.json({ success: false, message: 'Original mail not found.' });

        const reSubject = original.subject.startsWith('Re:') ? original.subject : `Re: ${original.subject}`;
        const cleanBody = esc(String(body || '').trim().slice(0, LIMITS.BODY_MAX));
        if (!cleanBody) return res.json({ success: false, message: 'Reply body required.' });

        const gold = Math.max(0, Math.min(parseInt(goldAttachment) || 0, LIMITS.GOLD_MAX));
        if (gold > 0) {
            const [[senderUser]] = await db.query('SELECT user_id FROM characters WHERE id=?', [charId]);
            const [[balance]] = await db.query('SELECT currency FROM users WHERE id=?', [senderUser.user_id]);
            if (balance.currency < gold)
                return res.json({ success: false, message: `Not enough gold.` });
            await db.query('UPDATE users SET currency=currency-? WHERE id=?', [gold, senderUser.user_id]);
        }

        const expiresAt = new Date(Date.now() + LIMITS.DAYS_EXPIRE * 86400000);
        await db.query(
            `INSERT INTO character_mail
             (sender_char_id, sender_name, recipient_char_id, subject, body,
              gold_attachment, reply_to_id, expires_at)
             VALUES (?,?,?,?,?,?,?,?)`,
            [charId, sender.name, original.sender_char_id,
             esc(reSubject.slice(0, LIMITS.SUBJECT_MAX)), cleanBody, gold, mailId, expiresAt]);

        notifyOnline(original.sender_char_id, 'mail_received', {
            from: sender.name, subject: reSubject, hasGold: gold > 0 });

        res.json({ success: true, message: `Reply sent to ${original.sender_name}.` });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// FORWARD
// =================================================================
router.post('/forward', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });
    const { charId, mailId, recipientName, note } = req.body;
    try {
        const sender = await verifyChar(userId, charId);
        if (!sender) return res.json({ success: false, message: 'Unauthorized.' });

        const [[original]] = await db.query(
            'SELECT sender_name, subject, body FROM character_mail WHERE id=? AND recipient_char_id=?',
            [mailId, charId]);
        if (!original) return res.json({ success: false, message: 'Mail not found.' });

        const fwdBody = (note ? esc(note.trim().slice(0, 500)) + '\n\n--- Forwarded ---\n' : '--- Forwarded ---\n')
            + `From: ${original.sender_name}\n${original.body}`;
        const fwdSubject = original.subject.startsWith('Fwd:') ? original.subject : `Fwd: ${original.subject}`;

        // Resolve recipient
        let recipId = 0;
        if (recipientName) {
            const [rr] = await db.query('SELECT id FROM characters WHERE LOWER(name)=LOWER(?)', [recipientName.trim()]);
            if (rr.length) recipId = rr[0].id;
        }
        if (!recipId) return res.json({ success: false, message: 'Recipient not found.' });

        const expiresAt = new Date(Date.now() + LIMITS.DAYS_EXPIRE * 86400000);
        await db.query(
            `INSERT INTO character_mail
             (sender_char_id, sender_name, recipient_char_id, subject, body, expires_at)
             VALUES (?,?,?,?,?,?)`,
            [charId, sender.name, recipId,
             esc(fwdSubject.slice(0, LIMITS.SUBJECT_MAX)), fwdBody.slice(0, LIMITS.BODY_MAX), expiresAt]);

        const [[recip]] = await db.query('SELECT name FROM characters WHERE id=?', [recipId]);
        notifyOnline(recipId, 'mail_received', { from: sender.name, subject: fwdSubject });

        res.json({ success: true, message: `Forwarded to ${recip?.name || 'player'}.` });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// SYSTEM MAIL (staff only — for quest rewards, auction results, etc.)
// =================================================================
router.post('/system-send', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });

    // Verify staff role
    const [[user]] = await db.query('SELECT role FROM users WHERE id=?', [userId]);
    if (!user || !['ADMIN', 'OWNER', 'GM'].includes(user.role))
        return res.json({ success: false, message: 'Staff only.' });

    const { recipientCharId, subject, body, goldAttachment, itemId, itemQty } = req.body;
    const recipId = parseInt(recipientCharId);
    if (!recipId) return res.json({ success: false, message: 'Recipient required.' });

    try {
        const cleanSubject = esc(String(subject || 'System Message').trim().slice(0, LIMITS.SUBJECT_MAX));
        const cleanBody = esc(String(body || '').trim().slice(0, LIMITS.BODY_MAX));
        const gold = Math.max(0, parseInt(goldAttachment) || 0);
        const attachItemId = parseInt(itemId) || null;
        const attachQty = Math.max(0, parseInt(itemQty) || 0);

        const expiresAt = new Date(Date.now() + LIMITS.DAYS_EXPIRE * 86400000);
        await db.query(
            `INSERT INTO character_mail
             (sender_char_id, sender_name, recipient_char_id, subject, body,
              gold_attachment, item_attachment_id, item_attachment_qty, is_system, expires_at)
             VALUES (0, 'System', ?, ?, ?, ?, ?, ?, 1, ?)`,
            [recipId, cleanSubject, cleanBody, gold, attachItemId, attachQty, expiresAt]);

        notifyOnline(recipId, 'mail_received', { from: 'System', subject: cleanSubject, hasGold: gold > 0, hasItem: !!attachItemId });
        res.json({ success: true, message: 'System mail sent.' });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// QUICK-SEND TEMPLATES
// =================================================================
router.get('/templates', (req, res) => {
    res.json({ success: true, templates: [
        { id: 'thanks_trade', subject: 'Thanks!', body: 'Thanks for the trade! Pleasure doing business.' },
        { id: 'gg',           subject: 'GG!', body: 'Good game! That was a great fight.' },
        { id: 'guild_invite', subject: 'Guild Invitation', body: 'Hey! Our guild would love to have you. Let me know if you\'re interested!' },
        { id: 'welcome',      subject: 'Welcome!', body: 'Welcome to the game! If you need any help, don\'t hesitate to ask.' },
        { id: 'party_up',     subject: 'Party Up?', body: 'Want to party up and run some content together?' },
        { id: 'nice_gear',    subject: 'Nice Gear!', body: 'I noticed your equipment — really impressive setup!' },
        { id: 'rematch',      subject: 'Rematch?', body: 'That fight was close! Want to go again sometime?' },
        { id: 'gift',         subject: 'A Gift For You', body: 'Here\'s a little something. Enjoy!' },
    ]});
});

module.exports = router;
