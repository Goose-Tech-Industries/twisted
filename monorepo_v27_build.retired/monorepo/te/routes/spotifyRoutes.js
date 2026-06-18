// =================================================================
// SPOTIFY OAUTH ROUTES  v1.0
// =================================================================
// Mounted at /api/spotify
//
// TEACHING: OAuth 2.0 is the standard way apps get permission to
// access a user's data on another service without knowing their
// password. Here's the full flow:
//
//   1. Player clicks "Connect Spotify" in their profile editor
//   2. We redirect them to Spotify's login page with our app's
//      client_id and a list of scopes (permissions) we need
//   3. Player approves → Spotify redirects back to our /callback
//      URL with a temporary "code"
//   4. We exchange that code for an access_token (valid 1 hour)
//      and a refresh_token (valid forever, used to get new access tokens)
//   5. We store both tokens in the users table
//   6. A background job (/sync) calls Spotify's API every 5 minutes
//      to check what the player is listening to and update characters
//
// Required .env vars:
//   SPOTIFY_CLIENT_ID     — from developer.spotify.com
//   SPOTIFY_CLIENT_SECRET — from developer.spotify.com
//   SPOTIFY_REDIRECT_URI  — must match what you set in Spotify dashboard
//                           e.g. https://yourdomain.com/api/spotify/callback
//
// Routes:
//   GET  /api/spotify/connect    — redirect to Spotify auth
//   GET  /api/spotify/callback   — Spotify redirects here after auth
//   POST /api/spotify/sync       — manually trigger track sync
//   POST /api/spotify/disconnect — remove tokens + clear track data
//   GET  /api/spotify/status     — is this user connected?
// =================================================================

const express  = require('express');
const router   = express.Router();
const https    = require('https');

let db;
router.init = (d) => { db = d; };

// ── Config ────────────────────────────────────────────────────────
function cfg() {
    return {
        clientId:     process.env.SPOTIFY_CLIENT_ID     || '',
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
        redirectUri:  process.env.SPOTIFY_REDIRECT_URI  || '',
    };
}

function isConfigured() {
    const { clientId, clientSecret, redirectUri } = cfg();
    return !!(clientId && clientSecret && redirectUri);
}

// ── Auth middleware ───────────────────────────────────────────────
function requireLogin(req, res, next) {
    if (!req.session?.userId) return res.json({ success: false, error: 'Not logged in.' });
    next();
}

// ── CONNECT — redirect player to Spotify ─────────────────────────
router.get('/connect', requireLogin, (req, res) => {
    if (!isConfigured()) {
        return res.status(503).send('Spotify OAuth is not configured on this server. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI in your .env file.');
    }

    const { clientId, redirectUri } = cfg();

    // TEACHING: 'scope' tells Spotify exactly what permissions we need.
    // user-read-currently-playing = see what they're listening to right now
    // user-read-playback-state    = see playback state (paused/playing)
    const scopes = 'user-read-currently-playing user-read-playback-state';

    // Store a random state value in session to prevent CSRF attacks.
    // TEACHING: CSRF (Cross-Site Request Forgery) is when a malicious site
    // tricks your browser into making a request to our server. By storing
    // a random value and checking it in the callback, we verify the
    // callback came from our own redirect, not a malicious third party.
    const state = Math.random().toString(36).slice(2, 18);
    req.session.spotifyState = state;

    const params = new URLSearchParams({
        response_type: 'code',
        client_id:      clientId,
        scope:          scopes,
        redirect_uri:   redirectUri,
        state,
        show_dialog:    'false', // don't force re-approval if already approved
    });

    res.redirect('https://accounts.spotify.com/authorize?' + params.toString());
});

// ── CALLBACK — Spotify sends the player back here ─────────────────
router.get('/callback', requireLogin, async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        return res.redirect('/?spotify=denied');
    }

    // CSRF check
    if (!state || state !== req.session.spotifyState) {
        return res.redirect('/?spotify=csrf_error');
    }
    delete req.session.spotifyState;

    if (!code) return res.redirect('/?spotify=no_code');

    const { clientId, clientSecret, redirectUri } = cfg();

    try {
        // Exchange the code for tokens
        // TEACHING: We POST to Spotify's token endpoint with our credentials
        // (client_id + client_secret, encoded as Base64) and the code we received.
        // This gives us two tokens:
        //   access_token  — short-lived (1 hour), used for API calls
        //   refresh_token — long-lived, used to get new access tokens when old one expires
        const tokenData = await spotifyPost('https://accounts.spotify.com/api/token', {
            grant_type:   'authorization_code',
            code,
            redirect_uri: redirectUri,
        }, clientId, clientSecret);

        if (!tokenData.access_token) {
            console.error('[Spotify OAuth] No access token in response:', tokenData);
            return res.redirect('/?spotify=token_error');
        }

        const expiresAt = Date.now() + (tokenData.expires_in * 1000);

        // Store tokens in the users table
        await db.query(
            'UPDATE users SET spotify_access_token=?, spotify_refresh_token=?, spotify_expires_at=? WHERE id=?',
            [tokenData.access_token, tokenData.refresh_token || null, expiresAt, req.session.userId]
        );

        // Immediately sync the current track so the player sees it right away
        await syncTrackForUser(req.session.userId, db);

        res.redirect('/?spotify=connected');
    } catch(e) {
        console.error('[Spotify callback error]', e.message);
        res.redirect('/?spotify=error');
    }
});

// ── STATUS — is this user connected? ─────────────────────────────
router.get('/status', requireLogin, async (req, res) => {
    try {
        const [[u]] = await db.query(
            'SELECT spotify_access_token IS NOT NULL AS connected FROM users WHERE id=?',
            [req.session.userId]
        );
        res.json({ success: true, connected: !!(u?.connected), configured: isConfigured() });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── SYNC — manually refresh current track ────────────────────────
router.post('/sync', requireLogin, async (req, res) => {
    try {
        const track = await syncTrackForUser(req.session.userId, db);
        res.json({ success: true, track });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── DISCONNECT — remove tokens + clear track ─────────────────────
router.post('/disconnect', requireLogin, async (req, res) => {
    try {
        await db.query(
            'UPDATE users SET spotify_access_token=NULL, spotify_refresh_token=NULL, spotify_expires_at=NULL WHERE id=?',
            [req.session.userId]
        );
        // Clear track data from all their characters
        await db.query(
            `UPDATE characters SET spotify_track_url=NULL, spotify_track_name=NULL, spotify_artist_name=NULL
             WHERE user_id=?`,
            [req.session.userId]
        );
        res.json({ success: true });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// =================================================================
// CORE SYNC LOGIC — exported for scheduler use
// =================================================================
// TEACHING: This function does the actual Spotify API call.
// It's called by:
//   1. The /sync route (manual trigger from the profile editor)
//   2. The background scheduler (every 5 minutes)
// The function handles token refresh automatically — if the access
// token is expired, it uses the refresh token to get a new one.
// =================================================================
async function syncTrackForUser(userId, dbConn) {
    const [[u]] = await dbConn.query(
        'SELECT spotify_access_token, spotify_refresh_token, spotify_expires_at FROM users WHERE id=?',
        [userId]
    );
    if (!u || !u.spotify_access_token) return null;

    const { clientId, clientSecret } = cfg();
    let accessToken = u.spotify_access_token;

    // Refresh the access token if it's expired or about to expire (within 5 min)
    if (u.spotify_expires_at && Date.now() > u.spotify_expires_at - 300000) {
        if (!u.spotify_refresh_token) {
            // No refresh token — user needs to reconnect
            await dbConn.query(
                'UPDATE users SET spotify_access_token=NULL, spotify_expires_at=NULL WHERE id=?',
                [userId]
            );
            return null;
        }
        try {
            const refreshed = await spotifyPost('https://accounts.spotify.com/api/token', {
                grant_type:    'refresh_token',
                refresh_token: u.spotify_refresh_token,
            }, clientId, clientSecret);

            accessToken = refreshed.access_token;
            const newExpiry = Date.now() + (refreshed.expires_in * 1000);
            await dbConn.query(
                'UPDATE users SET spotify_access_token=?, spotify_expires_at=? WHERE id=?',
                [accessToken, newExpiry, userId]
            );
        } catch(e) {
            console.error('[Spotify refresh error]', e.message);
            return null;
        }
    }

    // Call the Spotify "currently playing" endpoint
    let track = null;
    try {
        const data = await spotifyGet(
            'https://api.spotify.com/v1/me/player/currently-playing',
            accessToken
        );

        if (data && data.item && data.is_playing) {
            track = {
                name:     data.item.name,
                artist:   data.item.artists?.map(a => a.name).join(', ') || '',
                url:      data.item.external_urls?.spotify || '',
                albumArt: data.item.album?.images?.[1]?.url || null, // medium size
            };
        }
        // data === null means 204 (nothing playing) — that's fine
    } catch(e) {
        console.error('[Spotify currently-playing error]', e.message);
        return null;
    }

    // Update all of this user's characters with the track info
    if (track) {
        await dbConn.query(
            `UPDATE characters SET
                spotify_track_name=?, spotify_artist_name=?, spotify_track_url=?
             WHERE user_id=?`,
            [track.name.slice(0, 100), track.artist.slice(0, 100), track.url, userId]
        );
    } else {
        // Not playing anything — clear the track (don't leave stale data showing)
        await dbConn.query(
            `UPDATE characters SET
                spotify_track_name=NULL, spotify_artist_name=NULL, spotify_track_url=NULL
             WHERE user_id=?`,
            [userId]
        );
    }

    return track;
}

// ── HTTP helpers ──────────────────────────────────────────────────
// TEACHING: Node.js's built-in https module doesn't support
// async/await natively, so we wrap it in a Promise.
// We could use axios/node-fetch instead but this keeps dependencies minimal.

function spotifyPost(url, params, clientId, clientSecret) {
    return new Promise((resolve, reject) => {
        const body = new URLSearchParams(params).toString();
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path:     urlObj.pathname + urlObj.search,
            method:   'POST',
            headers: {
                'Authorization':  'Basic ' + auth,
                'Content-Type':   'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
            },
        };
        const req = https.request(options, res => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch(e) { reject(new Error('Bad JSON: ' + data.slice(0, 100))); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function spotifyGet(url, accessToken) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path:     urlObj.pathname + urlObj.search,
            method:   'GET',
            headers: { 'Authorization': 'Bearer ' + accessToken },
        };
        const req = https.request(options, res => {
            if (res.statusCode === 204) return resolve(null); // no content = not playing
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch(e) { reject(new Error('Bad JSON: ' + data.slice(0, 100))); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// ── Scheduler integration ─────────────────────────────────────────
// Call this from server.js after DB is ready:
// spotifyRoutes.startSyncJob(db);
router.startSyncJob = function(dbConn) {
    if (!isConfigured()) {
        console.log('[Spotify] OAuth not configured — auto-sync disabled. Set SPOTIFY_CLIENT_ID etc. in .env to enable.');
        return;
    }

    // FIX: Use a running flag to prevent overlapping sync runs.
    // TEACHING: If a sync takes longer than 5 minutes (e.g. Spotify API is slow),
    // the next setInterval tick would fire and start a SECOND overlapping sync.
    // That would double the API calls, possibly hit rate limits, and cause race
    // conditions writing to the same DB rows. The flag prevents this.
    let syncRunning = false;

    const syncAll = async () => {
        if (syncRunning) {
            console.log('[Spotify] Sync already running — skipping this tick.');
            return;
        }
        syncRunning = true;
        try {
            const [users] = await dbConn.query(
                'SELECT id FROM users WHERE spotify_access_token IS NOT NULL'
            );
            // FIX: Run syncs concurrently with Promise.allSettled instead of
            // sequential for-await. This is faster (all users sync in parallel)
            // and one failure doesn't stall the rest.
            // Promise.allSettled (unlike Promise.all) never throws — it always
            // resolves with an array of {status, value/reason} results.
            const results = await Promise.allSettled(
                users.map(u => syncTrackForUser(u.id, dbConn))
            );
            const failed = results.filter(r => r.status === 'rejected').length;
            if (users.length > 0) {
                console.log(`[Spotify] Synced ${users.length} user(s)${failed ? `, ${failed} failed` : ''}.`);
            }
        } catch(e) {
            console.error('[Spotify syncAll error]', e.message);
        } finally {
            syncRunning = false;
        }
    };

    // Run once 10s after startup (gives DB a moment to settle), then every 5 min
    setTimeout(syncAll, 10000);
    setInterval(syncAll, 5 * 60 * 1000);
    console.log('[Spotify] Auto-sync job started (every 5 minutes).');
};

module.exports = router;
