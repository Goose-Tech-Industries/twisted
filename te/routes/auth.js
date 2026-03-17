// ==========================================
// AUTH ROUTES v2.1 — Session-Based Auth + Email Verification
// ==========================================
// TEACHING:
//   v1 returned userId in JSON → browser stored in localStorage.
//   v2 stores userId SERVER-SIDE in req.session on login.
//   v2.1 adds optional email verification:
//
//   HOW EMAIL VERIFICATION WORKS:
//   1. User registers → server generates a random 64-char hex token
//   2. Token is stored in users.email_verify_token (expires in 24h)
//   3. If SMTP is configured in .env, an email is sent with a link
//   4. Clicking the link calls GET /verify-email?token=xxx
//   5. Server marks user as verified; they can now log in
//   6. If SMTP is NOT configured, verification is skipped entirely —
//      the game works exactly as before. This is intentional: small
//      servers often don't have email set up and shouldn't be blocked.
//
// ENV VARS (all optional):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
//   REQUIRE_EMAIL_VERIFY=true   ← set this to enforce verification
//   GAME_URL=https://yourdomain.com

const express   = require('express');
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const rateLimit = require('express-rate-limit');
const router    = express.Router();
let db;
router.init = (c) => { db = c; };

// ── Email sender (optional) ───────────────────────────────────────
// TEACHING: We try to load nodemailer. If it's not installed, or if
// no SMTP credentials are in .env, _sendMail becomes a no-op.
// The rest of the auth code doesn't need to know — it just calls
// _sendMail() and handles both the "sent" and "skipped" cases.
let _mailer = null;
(async () => {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return; // not configured
    try {
        const nodemailer = require('nodemailer');
        _mailer = nodemailer.createTransport({
            host:   process.env.SMTP_HOST,
            port:   parseInt(process.env.SMTP_PORT) || 587,
            secure: parseInt(process.env.SMTP_PORT) === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
        console.log('[Auth] SMTP mailer ready.');
    } catch {
        console.warn('[Auth] nodemailer not installed — email verification disabled.');
        console.warn('[Auth] Run: npm install nodemailer  to enable it.');
    }
})();

async function _sendVerificationEmail(email, username, token) {
    if (!_mailer) return false; // no mailer configured — silent skip
    const base    = (process.env.GAME_URL || 'http://localhost:3000').replace(/\/$/, '');
    const link    = `${base}/verify-email?token=${token}`;
    const from    = process.env.SMTP_FROM || process.env.SMTP_USER;
    try {
        await _mailer.sendMail({
            from,
            to:      email,
            subject: 'Verify your Twisted Engine account',
            text: `Hi ${username},\n\nClick the link below to verify your account:\n${link}\n\nThe link expires in 24 hours.\n\nIf you didn\'t register, ignore this email.`,
            html: `<p>Hi <strong>${username}</strong>,</p>
                   <p>Click below to verify your Twisted Engine account:</p>
                   <p><a href="${link}" style="font-size:16px;padding:10px 20px;background:#2e86c1;color:#fff;text-decoration:none;border-radius:6px">Verify My Account</a></p>
                   <p>The link expires in 24 hours.</p>
                   <p style="color:#888;font-size:12px">If you didn\'t register, ignore this email.</p>`,
        });
        return true;
    } catch (e) {
        console.error('[Auth] Email send failed:', e.message);
        return false;
    }
}

// Rate limiter: max 20 login/register attempts per IP per 15 minutes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' }
});
router.use('/login',    authLimiter);
router.use('/register', authLimiter);

// LIVE FIELD CHECK (username / email taken?)
router.post('/check-field', async (req, res) => {
    const { field, value } = req.body;
    const allowed = ['username', 'email'];
    if (!allowed.includes(field)) return res.status(400).json({ error: 'Invalid field' });
    try {
        const [rows] = await db.query('SELECT id FROM users WHERE ?? = ?', [field, value]);
        res.json({ taken: rows.length > 0 });
    } catch (err) { res.status(500).json({ error: 'Server Error' }); }
});

// REGISTER
router.post('/register', async (req, res) => {
    const { username, password, email, honeypot, inviteCode } = req.body;
    if (honeypot && honeypot.length > 0) return res.json({ success: true });
    if (!username || !password || !email) return res.json({ success: false, message: 'All fields required.' });
    if (username.length < 3 || username.length > 20) return res.json({ success: false, message: 'Username must be 3–20 characters.' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.json({ success: false, message: 'Username can only contain letters, numbers, and underscores.' });
    if (password.length < 6) return res.json({ success: false, message: 'Password must be 6+ characters.' });
    try {
        const [existing] = await db.query('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
        if (existing.length > 0) return res.json({ success: false, message: 'Username or Email taken.' });
        const hash = await bcrypt.hash(password, 10);

        // Generate a verification token (64 hex chars = 32 random bytes)
        const verifyToken   = crypto.randomBytes(32).toString('hex');
        const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // email_verified = 1 if SMTP not configured (no point gating login)
        // email_verified = 0 if SMTP is configured AND REQUIRE_EMAIL_VERIFY=true
        const requireVerify = _mailer && process.env.REQUIRE_EMAIL_VERIFY === 'true';
        const isVerified    = requireVerify ? 0 : 1;

        await db.query(
            'INSERT INTO users (username, password_hash, email, email_verified, email_verify_token, email_verify_expires) VALUES (?, ?, ?, ?, ?, ?)',
            [username, hash, email, isVerified, verifyToken, verifyExpires]
        );

        // Try to send verification email (non-fatal if it fails)
        // ── Referral: resolve invite code ────────────────────────────
        let referrerId = null;
        if (inviteCode && inviteCode.trim()) {
            try {
                const [[referrer]] = await db.query(
                    'SELECT id FROM users WHERE invite_code = ? LIMIT 1',
                    [inviteCode.trim().toUpperCase()]
                );
                if (referrer) referrerId = referrer.id;
            } catch { /* non-critical */ }
        }

        if (referrerId) {
            // Link the new user to their referrer
            await db.query(
                'UPDATE users SET referred_by = ? WHERE username = ?',
                [referrerId, username]
            );
        }

        // Generate a unique invite code for the new user (8 chars, uppercase)
        const newInviteCode = require('crypto').randomBytes(4).toString('hex').toUpperCase();
        try {
            await db.query('UPDATE users SET invite_code = ? WHERE username = ?',
                [newInviteCode, username]);
        } catch { /* non-critical if column missing */ }

        let emailSent = false;
        if (_mailer) {
            emailSent = await _sendVerificationEmail(email, username, verifyToken);
        }

        if (requireVerify) {
            res.json({
                success: true,
                message: emailSent
                    ? 'Account created! Check your email to verify before logging in.'
                    : 'Account created, but we couldn\'t send the verification email. Contact an admin.'
            });
        } else {
            res.json({ success: true, message: 'Welcome to the Carnage.' });
        }
    } catch (err) { res.json({ success: false, message: 'Database Error' }); }
});

// VERIFY EMAIL — called when player clicks the link in their email
// GET /verify-email?token=xxxxxxx
router.get('/verify-email', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).send(verifyPage('Invalid link.', false));
    try {
        const [rows] = await db.query(
            'SELECT id, username, email_verify_expires FROM users WHERE email_verify_token = ? LIMIT 1',
            [token]
        );
        if (!rows.length) return res.send(verifyPage('This link is invalid or has already been used.', false));

        const user = rows[0];
        if (new Date(user.email_verify_expires) < new Date()) {
            return res.send(verifyPage('This link has expired. Please register again or contact an admin.', false));
        }

        await db.query(
            'UPDATE users SET email_verified=1, email_verify_token=NULL, email_verify_expires=NULL WHERE id=?',
            [user.id]
        );

        return res.send(verifyPage('Your email is verified! You can now log in.', true));
    } catch (err) {
        console.error('[Auth] verify-email error:', err);
        res.status(500).send(verifyPage('Server error. Try again later.', false));
    }
});

// RESEND VERIFICATION EMAIL
router.post('/resend-verify', authLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.json({ success: false, message: 'Email required.' });
    if (!_mailer) return res.json({ success: false, message: 'Email verification not configured on this server.' });
    try {
        const [rows] = await db.query(
            'SELECT id, username, email_verified FROM users WHERE email = ? LIMIT 1', [email]);
        if (!rows.length) return res.json({ success: true, message: 'If that email is registered, we sent a new link.' });
        if (rows[0].email_verified) return res.json({ success: false, message: 'Email is already verified.' });

        const token   = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await db.query(
            'UPDATE users SET email_verify_token=?, email_verify_expires=? WHERE id=?',
            [token, expires, rows[0].id]
        );
        await _sendVerificationEmail(email, rows[0].username, token);
        res.json({ success: true, message: 'If that email is registered, we sent a new link.' });
    } catch (err) {
        res.json({ success: false, message: 'Server error.' });
    }
});

// LOGIN — stores userId in session, returns only display info
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (!users.length) return res.json({ success: false, message: 'User not found.' });
        const user = users[0];
        if (user.is_banned) return res.json({ success: false, message: 'Account suspended.' });

        // Block login if email verification is required and not done
        const requireVerify = _mailer && process.env.REQUIRE_EMAIL_VERIFY === 'true';
        if (requireVerify && !user.email_verified) {
            return res.json({
                success: false,
                message: 'Please verify your email before logging in. Check your inbox.',
                needsVerify: true
            });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.json({ success: false, message: 'Wrong password.' });

        req.session.userId   = user.id;
        req.session.username = user.username;
        req.session.role     = user.role;

        // ── Daily Login Reward ─────────────────────────────────────
        // TEACHING: We compare DATE only (not time) so a player who logs in
        // at 11:59 PM and again at 12:01 AM the next day still gets the reward.
        // Streak rules:
        //   - Same day as last_login_date → no reward (already claimed today)
        //   - Yesterday → increment streak, give reward
        //   - Anything older → streak resets to 1, give day-1 reward
        //
        // Reward table (gold per day, caps at day 7 then repeats):
        //   Day 1: 50g  Day 2: 100g  Day 3: 150g  Day 4: 200g
        //   Day 5: 300g Day 6: 400g  Day 7: 500g + bonus message
        let dailyReward = null;
        try {
            // Read rewards from system_settings DB (configurable in AdminSauce)
            // Fallback to defaults if not configured yet
            let REWARDS = [50, 100, 150, 200, 300, 400, 500];
            try {
                const [[rewardRow]] = await db.query(
                    "SELECT setting_value FROM system_settings WHERE setting_key='daily_login_rewards' LIMIT 1"
                );
                if (rewardRow && rewardRow.setting_value) {
                    const parsed = JSON.parse(rewardRow.setting_value);
                    if (Array.isArray(parsed) && parsed.length > 0) REWARDS = parsed;
                }
            } catch { /* use defaults */ }
            const today     = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
            const lastDate  = user.last_login_date
                ? new Date(user.last_login_date).toISOString().slice(0, 10)
                : null;

            if (lastDate !== today) {
                const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
                let newStreak = (lastDate === yesterday) ? (user.login_streak || 0) + 1 : 1;

                const rewardGold = REWARDS[Math.min(newStreak - 1, REWARDS.length - 1)];
                const isWeekly   = newStreak % 7 === 0;

                await db.query(
                    `UPDATE users SET
                        last_login      = NOW(),
                        last_login_date = ?,
                        login_streak    = ?,
                        currency        = currency + ?
                     WHERE id=?`,
                    [today, newStreak, rewardGold, user.id]
                );

                dailyReward = {
                    gold:   rewardGold,
                    streak: newStreak,
                    bonus:  isWeekly,
                    message: isWeekly
                        ? `🎉 ${newStreak}-day streak! Bonus reward: ${rewardGold}g!`
                        : `📅 Day ${newStreak} login reward: ${rewardGold}g!`
                };
            } else {
                // Same day — just update last_login timestamp
                await db.query('UPDATE users SET last_login=NOW() WHERE id=?', [user.id]);
            }
        } catch (rewardErr) {
            // Streak columns may not exist on old installs — fail silently
            console.warn('[daily reward] skipped:', rewardErr.message);
            try { await db.query('UPDATE users SET last_login=NOW() WHERE id=?', [user.id]); } catch {}
        }

        req.session.save(err => {
            if (err) console.error('[session save]', err);
            console.log(`🔓 LOGIN: ${username} (session set)`);
            res.json({ success: true, username: user.username, role: user.role, dailyReward });
        });
    } catch (err) { res.json({ success: false, message: 'Server Error' }); }
});

// GET /invite-code — returns the logged-in user's invite code
router.get('/invite-code', async (req, res) => {
    if (!req.session?.userId) return res.json({ success: false });
    try {
        let [[u]] = await db.query('SELECT invite_code FROM users WHERE id=?', [req.session.userId]);
        if (!u) return res.json({ success: false });
        // Generate code if missing (old accounts)
        if (!u.invite_code) {
            const newCode = require('crypto').randomBytes(4).toString('hex').toUpperCase();
            await db.query('UPDATE users SET invite_code=? WHERE id=?', [newCode, req.session.userId]);
            u = { invite_code: newCode };
        }
        res.json({ success: true, code: u.invite_code });
    } catch(e) { res.json({ success: false }); }
});

// ME — always re-reads role from DB so manual role changes take effect immediately.
router.get('/me', async (req, res) => {
    try {
        if (!req.session || !req.session.userId) return res.json({ success: false });
        const [rows] = await db.query('SELECT role FROM users WHERE id = ? LIMIT 1', [req.session.userId]);
        if (!rows || !rows.length) return res.json({ success: false });
        const role = rows[0].role;
        req.session.role = role;

        // TEACHING: Also return the user's active character ID so that
        // client pages (profile, etc.) know who is viewing without an
        // extra round trip. We grab the most recently used character.
        const [[charRow]] = await db.query(
            'SELECT id FROM characters WHERE user_id=? ORDER BY id DESC LIMIT 1',
            [req.session.userId]
        );
        const charId = charRow ? charRow.id : null;

        res.json({ success: true, username: req.session.username, role, charId });
    } catch (err) {
        console.error('/me error:', err);
        res.json({ success: false });
    }
});

// LOGOUT — destroys the session on the server
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// ── Inline HTML page for email verify result ──────────────────────
function verifyPage(message, success) {
    const color = success ? '#3fb950' : '#f85149';
    const icon  = success ? '✅' : '❌';
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Email Verification — Twisted Engine</title>
    <style>body{background:#0b0f14;color:#c9d8e8;font-family:sans-serif;
    display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
    .box{background:#111820;border:1px solid #1e2a3a;border-radius:12px;padding:40px;
    text-align:center;max-width:440px}
    h2{color:${color};font-size:22px;margin-bottom:12px}
    p{color:#4a6380;margin-bottom:24px}
    a{display:inline-block;padding:10px 24px;background:#2e86c1;color:#fff;
    text-decoration:none;border-radius:8px;font-weight:700}
    </style></head><body>
    <div class="box"><h2>${icon} ${message}</h2>
    <p>Twisted Engine</p>
    <a href="/">Go to Login</a></div></body></html>`;
}

// ── REPORT PLAYER ────────────────────────────────────────────────
// POST /api/auth/report-player
// Any logged-in player can report any other player once per 24h.
// TEACHING: We rate-limit reports to prevent harassment-via-reporting.
// Moderators see these in the mod panel.
router.post('/report-player', async (req, res) => {
    try {
        if (!req.session?.userId) return res.json({ success: false, error: 'Not logged in.' });
        const { reporterCharId, reportedCharId, reason, details } = req.body;

        const VALID_REASONS = ['harassment','cheating','spam','offensive_name','bug_abuse','other'];
        if (!VALID_REASONS.includes(reason))
            return res.json({ success: false, error: 'Invalid reason.' });

        // Verify reporter owns the character
        const [[reporter]] = await db.query(
            'SELECT id, name FROM characters WHERE id=? AND user_id=?',
            [reporterCharId, req.session.userId]
        );
        if (!reporter) return res.json({ success: false, error: 'Unauthorized.' });

        // Get reported name
        const [[reported]] = await db.query('SELECT id, name FROM characters WHERE id=?', [reportedCharId]);
        if (!reported) return res.json({ success: false, error: 'Player not found.' });

        if (reporter.id === reported.id)
            return res.json({ success: false, error: "You can't report yourself." });

        // Rate limit: one report per reporter per reported per 24h
        const [[recent]] = await db.query(
            `SELECT id FROM player_reports
             WHERE reporter_char_id=? AND reported_char_id=?
             AND created_at > NOW() - INTERVAL 24 HOUR LIMIT 1`,
            [reporter.id, reported.id]
        );
        if (recent) return res.json({ success: false, error: 'You already reported this player today.' });

        await db.query(
            `INSERT INTO player_reports
                (reporter_char_id, reporter_name, reported_char_id, reported_name, reason, details)
             VALUES (?,?,?,?,?,?)`,
            [reporter.id, reporter.name, reported.id, reported.name,
             reason, (details || '').slice(0, 500) || null]
        );
        res.json({ success: true });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

module.exports = router;
