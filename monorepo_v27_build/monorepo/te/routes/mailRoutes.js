// =================================================================
// PLAYER MAIL ROUTES  v1.0
// Mounted at /api/mail
//
// TEACHING: Player mail is like email inside the game.
// Players can send messages to anyone even when they're offline.
// Gold can optionally be attached and collected from the inbox.
//
// Endpoints:
//   POST /api/mail/send          — send a mail
//   GET  /api/mail/inbox/:charId — fetch inbox (undeleted messages)
//   POST /api/mail/read          — mark as read
//   POST /api/mail/delete        — delete (returns uncollected gold to sender)
//   POST /api/mail/collect-gold  — collect attached gold
//   GET  /api/mail/unread-count/:charId — just the count (for HUD badge)
// =================================================================

const express = require('express');
const router  = express.Router();
let db, io;
router.init = (database, ioInstance) => { db = database; io = ioInstance; };

function uid(req) { return req.session && req.session.userId; }

// Verify this session owns charId
async function verifyChar(userId, charId) {
    const [r] = await db.query(
        'SELECT id, name FROM characters WHERE id=? AND user_id=?', [charId, userId]);
    return r.length ? r[0] : null;
}

// Push a socket event to an online character (if they're connected)
function notifyOnline(charId, event, payload) {
    if (!io || !global._onlinePlayers) return;
    for (const [sid, p] of Object.entries(global._onlinePlayers)) {
        if (p.charId === parseInt(charId)) {
            io.to(sid).emit(event, payload);
        }
    }
}

const MAIL_LIMITS = {
    MAX_PER_INBOX: 100,     // max mail in one inbox
    SUBJECT_MAX:   120,
    BODY_MAX:      2000,
    GOLD_MAX:      1000000, // 1M gold max attachment
    DAYS_EXPIRE:   30,      // mail expires after 30 days
};

// =================================================================
// SEND MAIL
// POST /api/mail/send
// Body: { charId, recipientCharId, subject, body, goldAttachment? }
// =================================================================
router.post('/send', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });

    const { charId, recipientCharId, subject, body, goldAttachment } = req.body;
    const senderId = parseInt(charId);
    const recipId  = parseInt(recipientCharId);

    if (!senderId || !recipId)
        return res.json({ success: false, message: 'charId and recipientCharId required.' });
    if (senderId === recipId)
        return res.json({ success: false, message: 'You cannot mail yourself.' });

    try {
        const sender = await verifyChar(userId, senderId);
        if (!sender) return res.json({ success: false, message: 'Not your character.' });

        // Validate recipient exists and is not blocking sender
        const [[recip]] = await db.query('SELECT id, name FROM characters WHERE id=?', [recipId]);
        if (!recip) return res.json({ success: false, message: 'Recipient not found.' });

        // Check block relationship
        const [blocked] = await db.query(
            `SELECT id FROM character_friends
             WHERE ((requester_id=? AND recipient_id=?) OR (requester_id=? AND recipient_id=?))
             AND status='blocked'`,
            [senderId, recipId, recipId, senderId]
        );
        if (blocked.length) return res.json({ success: false, message: 'Unable to send mail to this player.' });

        // Inbox cap check
        const [[inboxCount]] = await db.query(
            'SELECT COUNT(*) AS n FROM character_mail WHERE recipient_char_id=? AND is_deleted=0',
            [recipId]
        );
        if (inboxCount.n >= MAIL_LIMITS.MAX_PER_INBOX)
            return res.json({ success: false, message: `${recip.name}'s inbox is full.` });

        // Sanitize inputs — trim, cap length, and HTML-escape so a mail
        // containing <script>alert(1)</script> is stored and displayed as
        // harmless literal text rather than executed in the recipient's browser.
        const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
        const cleanSubject = esc(String(subject || 'No subject').trim().slice(0, MAIL_LIMITS.SUBJECT_MAX));
        const cleanBody    = esc(String(body    || '').trim().slice(0, MAIL_LIMITS.BODY_MAX));
        if (!cleanBody) return res.json({ success: false, message: 'Message body is required.' });

        // Gold attachment
        const gold = Math.max(0, Math.min(parseInt(goldAttachment) || 0, MAIL_LIMITS.GOLD_MAX));
        if (gold > 0) {
            // Deduct from sender's balance immediately
            const [[senderUser]] = await db.query(
                'SELECT user_id FROM characters WHERE id=?', [senderId]);
            const [[balance]] = await db.query(
                'SELECT currency FROM users WHERE id=?', [senderUser.user_id]);
            if (balance.currency < gold)
                return res.json({ success: false, message: `You only have ${balance.currency} gold.` });
            await db.query('UPDATE users SET currency=currency-? WHERE id=?', [gold, senderUser.user_id]);
        }

        const expiresAt = new Date(Date.now() + MAIL_LIMITS.DAYS_EXPIRE * 86400000);
        await db.query(
            `INSERT INTO character_mail
             (sender_char_id, sender_name, recipient_char_id, subject, body, gold_attachment, expires_at)
             VALUES (?,?,?,?,?,?,?)`,
            [senderId, sender.name, recipId, cleanSubject, cleanBody, gold, expiresAt]
        );

        // Real-time notification if recipient is online
        notifyOnline(recipId, 'mail_received', {
            from: sender.name,
            subject: cleanSubject,
            hasGold: gold > 0,
        });

        res.json({ success: true, message: `Mail sent to ${recip.name}.` });
    } catch (e) {
        console.error('[Mail] send error:', e);
        res.json({ success: false, message: 'Server error.' });
    }
});

// =================================================================
// INBOX
// GET /api/mail/inbox/:charId
// Returns all undeleted mail sorted newest first.
// =================================================================
router.get('/inbox/:charId', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });

    const charId = parseInt(req.params.charId);
    try {
        const owner = await verifyChar(userId, charId);
        if (!owner) return res.json({ success: false, message: 'Not your character.' });

        // Auto-expire old mail
        await db.query(
            `UPDATE character_mail SET is_deleted=1
             WHERE recipient_char_id=? AND is_deleted=0 AND expires_at IS NOT NULL AND expires_at <= NOW()`,
            [charId]
        );

        const [rows] = await db.query(
            `SELECT id, sender_char_id, sender_name, subject, body,
                    gold_attachment, gold_collected, is_read, sent_at, expires_at
             FROM character_mail
             WHERE recipient_char_id=? AND is_deleted=0
             ORDER BY sent_at DESC
             LIMIT 100`,
            [charId]
        );

        res.json({ success: true, data: rows });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// UNREAD COUNT (lightweight — used for HUD badge)
// GET /api/mail/unread-count/:charId
// =================================================================
router.get('/unread-count/:charId', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });
    const charId = parseInt(req.params.charId);
    try {
        if (!await verifyChar(userId, charId)) return res.json({ success: false, message: 'Unauthorized.' });
        const [[row]] = await db.query(
            'SELECT COUNT(*) AS n FROM character_mail WHERE recipient_char_id=? AND is_deleted=0 AND is_read=0',
            [charId]
        );
        res.json({ success: true, count: row.n });
    } catch (e) {
        res.json({ success: false, count: 0 });
    }
});

// =================================================================
// MARK AS READ
// POST /api/mail/read   { charId, mailId }
// =================================================================
router.post('/read', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });
    const { charId, mailId } = req.body;
    try {
        if (!await verifyChar(userId, charId)) return res.json({ success: false, message: 'Not your character.' });
        await db.query(
            'UPDATE character_mail SET is_read=1 WHERE id=? AND recipient_char_id=?',
            [mailId, charId]
        );
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// COLLECT GOLD ATTACHMENT
// POST /api/mail/collect-gold   { charId, mailId }
// =================================================================
router.post('/collect-gold', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });
    const { charId, mailId } = req.body;
    try {
        const owner = await verifyChar(userId, charId);
        if (!owner) return res.json({ success: false, message: 'Not your character.' });

        const [[mail]] = await db.query(
            'SELECT gold_attachment, gold_collected FROM character_mail WHERE id=? AND recipient_char_id=? AND is_deleted=0',
            [mailId, charId]
        );
        if (!mail)               return res.json({ success: false, message: 'Mail not found.' });
        if (mail.gold_collected) return res.json({ success: false, message: 'Gold already collected.' });
        if (!mail.gold_attachment || mail.gold_attachment <= 0)
            return res.json({ success: false, message: 'No gold in this mail.' });

        // Give gold to recipient's user account
        const [[ch]] = await db.query('SELECT user_id FROM characters WHERE id=?', [charId]);
        await db.query('UPDATE users SET currency=currency+? WHERE id=?',
            [mail.gold_attachment, ch.user_id]);
        await db.query('UPDATE character_mail SET gold_collected=1, is_read=1 WHERE id=?', [mailId]);

        res.json({ success: true, gold: mail.gold_attachment, message: `Collected ${mail.gold_attachment} gold.` });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// DELETE MAIL
// POST /api/mail/delete   { charId, mailId }
// Refunds uncollected gold to SENDER.
// =================================================================
router.post('/delete', async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.json({ success: false, message: 'Not logged in.' });
    const { charId, mailId } = req.body;
    try {
        if (!await verifyChar(userId, charId)) return res.json({ success: false, message: 'Not your character.' });

        const [[mail]] = await db.query(
            'SELECT gold_attachment, gold_collected, sender_char_id FROM character_mail WHERE id=? AND recipient_char_id=? AND is_deleted=0',
            [mailId, charId]
        );
        if (!mail) return res.json({ success: false, message: 'Mail not found.' });

        // Refund uncollected gold to sender
        if (mail.gold_attachment > 0 && !mail.gold_collected) {
            const [[senderCh]] = await db.query('SELECT user_id FROM characters WHERE id=?', [mail.sender_char_id]);
            if (senderCh) {
                await db.query('UPDATE users SET currency=currency+? WHERE id=?',
                    [mail.gold_attachment, senderCh.user_id]);
                // Notify sender if online
                notifyOnline(mail.sender_char_id, 'mail_gold_refund', {
                    gold: mail.gold_attachment,
                    text: `📬 Gold returned: your mail's ${mail.gold_attachment}g attachment was refunded (mail deleted unread).`
                });
            }
        }

        await db.query('UPDATE character_mail SET is_deleted=1 WHERE id=?', [mailId]);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

module.exports = router;
