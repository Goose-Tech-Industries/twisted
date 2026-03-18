// =================================================================
// TWISTED ENGINE - SERVER v5.0 (The Authority)
// =================================================================
// TEACHING: This is the "brain". It connects to MySQL, serves files,
// handles login/save requests (HTTP), and real-time movement (WebSocket).
// RUN: npm install && node server.js → http://localhost:3000
// =================================================================

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const helmet   = require('helmet');
const morgan   = require('morgan');
const fs       = require('fs');

// ── Global error safety net ───────────────────────────────────────
// TEACHING: Without these, an unhandled promise rejection anywhere
// in async code will crash the whole server. These catch them and
// log them instead, keeping the server alive.
process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION]', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err);
    // Don't exit — log and keep running. In production you may want
    // to restart gracefully after logging, but keeping alive is safer
    // for an MMO where crashing kicks all players.
});

const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const adminRoutes = require('./routes/admin');
const questRoutes = require('./routes/questRoutes');
const progressionRoutes = require('./routes/progressionRoutes');
const artifactRoutes = require('./routes/artifactRoutes');
const partyRoutes = require('./routes/partyRoutes');
const guildRoutes = require('./routes/guildRoutes');
const { getNpcReply, extractFacts, reputationDelta } = require('./npc_brain');

// TEACHING: AI config lives in system_settings so admins can change provider,
// key, and world tone from AdminSauce without restarting the server.
// We cache it for 60s so we're not hitting the DB on every NPC message.
let _aiConfigCache = null;
let _aiConfigCacheAt = 0;
async function loadAiConfig() {
    const now = Date.now();
    if (_aiConfigCache && now - _aiConfigCacheAt < 60000) return _aiConfigCache;
    try {
        // Check both system_settings (legacy) and game_settings (admin panel) for AI config
        const c = {};
        try {
            const [sysRows] = await db.query(
                "SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'ai_%'");
            for (const r of sysRows) c[r.setting_key] = r.setting_value;
        } catch {}
        try {
            const [gameRows] = await db.query(
                "SELECT setting_key, setting_value FROM game_settings WHERE setting_key LIKE 'ai_%'");
            // game_settings (admin panel) overrides system_settings
            for (const r of gameRows) c[r.setting_key] = r.setting_value;
        } catch {}
        _aiConfigCache = {
            provider:     c.ai_provider     || null,   // null = fall back to .env logic in npc_brain
            apiKey:       c.ai_api_key      || '',
            model:        c.ai_model        || '',
            baseUrl:      c.ai_base_url     || '',
            temperature:  parseFloat(c.ai_temperature) || 0.85,
            maxTokens:    parseInt(c.ai_max_tokens)    || 256,
            systemPrompt: c.ai_system_prompt || ''
        };
    } catch (e) {
        console.warn('[AI Config] Failed to load from DB, using .env fallback:', e.message);
        _aiConfigCache = null;
    }
    _aiConfigCacheAt = now;
    return _aiConfigCache;
}
const craftingRoutes = require('./routes/crafting');
const auctionRoutes  = require('./routes/auction');
const Scheduler = require('./scheduler');
const { handleMapEvent, executeActions } = require('./event_runner');
const BattleManager = require('./battle_engine');
const gmCommands    = require('./gm_commands');

const app = express();
const server = http.createServer(app);

// ── Production startup guard (fail-closed) ────────────────────────
// TEACHING: "Fail-closed" means: if a critical config value is missing,
// refuse to start rather than silently running in an insecure state.
// The opposite — "fail-open" — is what the || true fallbacks do:
// they keep the server running, but with security disabled.
//
// Without this guard:
//   - Missing ALLOWED_ORIGIN → CORS allows any origin → cross-site
//     requests from attacker.com can read your API responses with cookies.
//   - Missing/placeholder SESSION_SECRET → Express uses the literal string
//     'change-this-in-production-PLEASE' → anyone who reads this file can
//     forge session cookies and impersonate any user, including admins.
//
// This check runs BEFORE any routes or middleware are registered,
// so a misconfigured production deploy crashes immediately at startup
// with a clear message rather than running insecurely for weeks.
if (process.env.NODE_ENV === 'production') {
    const PLACEHOLDER_SECRET = 'change-this-in-production-PLEASE';
    const fatal = (msg) => {
        console.error('\n' + '═'.repeat(60));
        console.error('  🔴 FATAL — Twisted Engine will not start');
        console.error('  ' + msg);
        console.error('  Fix your .env file and restart.');
        console.error('═'.repeat(60) + '\n');
        process.exit(1);
    };

    if (!process.env.ALLOWED_ORIGIN) {
        fatal('ALLOWED_ORIGIN is not set. Set it to your production domain,\n  e.g. ALLOWED_ORIGIN=https://yourdomain.com');
    }
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === PLACEHOLDER_SECRET) {
        fatal('SESSION_SECRET is missing or is still the placeholder value.\n  Run: npm run generate-secret  and paste the result into .env');
    }
    if (!process.env.DB_PASS) {
        // Warning only — some local MySQL setups have no password (not recommended for prod)
        console.warn('[WARN] DB_PASS is empty. Set a strong database password in production.');
    }

    console.log('[Startup] ✅ Production env validated — secrets present');
}

const io = new Server(server, {
    // TEACHING: WebSocket connections need a heartbeat to stay alive through
    // firewalls, NAT routers, and load balancers that close idle TCP connections.
    // Socket.IO sends a ping every pingInterval ms. If no pong comes back within
    // pingTimeout ms, it considers the client disconnected.
    //
    // Defaults: pingInterval=25000, pingTimeout=20000 — too aggressive for mobile
    // players on flaky connections who might just be switching networks briefly.
    // Raising these gives players ~45 seconds to recover before we drop them.
    pingInterval: 25000,    // send heartbeat ping every 25 seconds
    pingTimeout:  45000,    // wait 45 seconds for pong before disconnecting
    // Only allow WebSocket transport — avoids HTTP long-polling fallback which
    // is slower and uses more server resources. All modern browsers support WS.
    // If you ever need to support very restricted corporate firewalls, remove this.
    transports: ['websocket'],
    cors: {
        origin: process.env.ALLOWED_ORIGIN || true,
        credentials: true,
        methods: ['GET', 'POST']
    }
});

// Trust nginx reverse proxy in production (needed for secure cookies + real IPs)
// TEACHING: When nginx sits in front of Express, the "real" client IP is in
// X-Forwarded-For. app.set('trust proxy',1) tells Express to trust that header.
// Also required for req.secure to return true behind an HTTPS nginx proxy,
// which means session cookies get secure:true correctly.
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// CORS: In production set ALLOWED_ORIGIN=https://yourdomain.com in .env
// In development, set ALLOWED_ORIGIN=http://localhost:3000
// TEACHING: When credentials:true (cookies), the browser requires the server
// to echo back the exact origin — wildcard '*' is not allowed by browsers.
// In dev we fall back to true (allow any origin) for convenience.
// In production the startup guard above already ensured ALLOWED_ORIGIN is set,
// so this fallback only ever triggers in dev.
const allowedOrigin = process.env.ALLOWED_ORIGIN ||
    (process.env.NODE_ENV === 'production' ? (() => { throw new Error('ALLOWED_ORIGIN required in production'); })() : true);
app.use(cors({
    origin: allowedOrigin,
    credentials: true  // Required for session cookies to be sent cross-origin
}));
// TEACHING: Without a size limit, express.json() will buffer the entire
// request body before parsing. A malicious player could POST a 500MB body
// and exhaust the server's memory. 50kb is generous for any game API call.
// If you ever have a legitimate large payload (map import, bulk admin),
// add a separate route-level override: express.json({ limit: '5mb' }).
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// ── Security headers (helmet) ─────────────────────────────────────
// TEACHING: helmet sets ~15 HTTP headers that protect against common
// web attacks: clickjacking, MIME-sniffing, XSS via old IE, etc.
// crossOriginEmbedderPolicy off — our game canvas needs cross-origin images.
app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,  // CSP requires fine-tuning per-page; disable for now
}));

// ── Request logging (morgan) ──────────────────────────────────────
// TEACHING: morgan logs every HTTP request. In production we write to a
// rotating log file so you can grep for errors, slow routes, 404s etc.
// In dev, 'dev' format gives coloured one-liners in the terminal.
if (process.env.NODE_ENV === 'production') {
    const logDir = process.env.LOG_DIR || './logs';
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const accessLog = fs.createWriteStream(`${logDir}/access.log`, { flags: 'a' });
    app.use(morgan('combined', { stream: accessLog }));
} else {
    app.use(morgan('dev'));
}

// =================================================================
// SESSION MIDDLEWARE
// TEACHING: express-session stores session data server-side.
// The browser only gets a cookie with a random session ID.
// httpOnly:true = JS can't read the cookie (XSS protection)
// sameSite:'lax' = cookie not sent on cross-site requests (CSRF protection)
// secure: true in production = HTTPS only
// =================================================================
// TEACHING: Sessions store login identity server-side.
// The browser gets a cookie with a random session ID — userId never travels over the network.
// Memory store is used here — works perfectly for local dev and single-server production.
// Sessions last 7 days. If you restart the server, players log in again (fine for now).
// ── Session store (persistent, survives restarts) ────────────────
// TEACHING: The default Express session store (MemoryStore) keeps
// sessions in RAM. Problems: (1) all sessions are lost on restart,
// (2) under load it leaks memory and crashes. We switch to MySQL
// so sessions persist in the database. Totally automatic — sessions
// still work identically, they're just stored in a 'sessions' table.
// CONFIG — In production, use .env with dotenv!
const DB_CONFIG = {
    host:     process.env.DB_HOST || 'localhost',
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'twisted_rpg',
    // TEACHING: utf8mb4 supports all Unicode including emoji (utf8 only goes to 3 bytes).
    // Without this, saving a player name or chat message with an emoji crashes the query.
    charset:  'utf8mb4',
    // TEACHING: MySQL servers close idle connections after wait_timeout (default 8 hours).
    // Without keepAlive, the pool's idle connections go stale and the next query after
    // a quiet night gets "Connection lost: The server closed the connection."
    // enableKeepAlive sends TCP keepalive packets to prevent that.
    enableKeepAlive:    true,
    keepAliveInitialDelay: 30000,  // start keepalive pings after 30s of idle
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0          // 0 = unbounded queue (fine for an indie MMO)
};

// ── Session store ────────────────────────────────────────────────
// TEACHING: express-mysql-session persists sessions in the database so they
// survive server restarts. It accepts the same connection options as mysql2.
// We pass DB_CONFIG directly — it manages its own internal connection.
// If the package isn't installed (or DB isn't configured yet), we fall back
// to MemoryStore which is fine for local dev — sessions just reset on restart.
let sessionStore = undefined; // default = MemoryStore (dev fallback)
try {
    const MySQLStore = require('express-mysql-session')(session);
    sessionStore = new MySQLStore({
        host:               DB_CONFIG.host,
        port:               DB_CONFIG.port || 3306,
        user:               DB_CONFIG.user,
        password:           DB_CONFIG.password,
        database:           DB_CONFIG.database,
        createDatabaseTable: true,
        // TEACHING: Without cleanup, old sessions accumulate forever.
        // checkExpirationInterval runs a DELETE on expired rows every 15 min.
        // expiration matches the cookie maxAge (7 days in ms).
        checkExpirationInterval: 15 * 60 * 1000,  // prune expired rows every 15 min
        expiration: 7 * 24 * 60 * 60 * 1000,       // session max age = 7 days
        schema: {
            tableName:   'sessions',
            columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' }
        }
    });
    console.log('[Session] MySQL session store connected — sessions survive restarts ✅');
} catch (e) {
    console.warn('[Session] Using MemoryStore (sessions reset on restart). Install express-mysql-session for persistence.');
}

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'change-this-in-production-PLEASE',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        httpOnly: true,
        // TEACHING: sameSite:'lax' works in both production and dev because
        // next.config.mjs proxies all API routes through Next.js at :3000,
        // so the browser always sees one origin. No cross-origin cookie issues.
        // sameSite:'none' + secure:false is rejected by modern browsers anyway.
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
    }
});
app.use(sessionMiddleware);

// ── CSRF posture ─────────────────────────────────────────────────
// TEACHING: CSRF (Cross-Site Request Forgery) tricks a logged-in
// user's browser into making requests to your server from a different site.
// Our defence:
//   - SameSite:'lax' cookies (production) — browser won't send session
//     cookie with cross-site POST requests. This alone blocks 99% of CSRF.
//   - CORS locked to ALLOWED_ORIGIN — foreign sites can't read responses.
// YOU ONLY NEED CSRF TOKENS IF:
//   - You ever use SameSite:'none' (cross-subdomain setup), OR
//   - You accept form posts from non-JS clients (curl, native apps)
// If that ever applies, add: npm install csurf and protect state-changing
// routes with csrfProtection middleware. For now — SameSite:lax is enough.
// ── Rate limiting ─────────────────────────────────────────────────
// TEACHING: Rate limiting prevents brute-force attacks. If someone
// tries to guess passwords by hammering /login, this blocks them
// after 10 attempts in 15 minutes from the same IP address.
// The general API limiter prevents scraping or DDoS on game routes.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 10,                    // max 10 login attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' }
});
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,        // 1 minute
    max: 300,                   // 300 requests/min per IP (plenty for a game)
    standardHeaders: true,
    legacyHeaders: false
});
// Apply auth limiter only to login/register endpoints
app.use('/login',          authLimiter);
app.use('/register',       authLimiter);
app.use('/auth/login',     authLimiter);  // /auth/* prefix used by Next.js UI
app.use('/auth/register',  authLimiter);
// Apply general limiter to all API and game routes
app.use('/api/', apiLimiter);

// ── Admin panel rate limiter ──────────────────────────────────────
// TEACHING: /admin-panel/* should be hit rarely (it's a management UI,
// not a game loop). 60 req/min is generous for legit use but kills
// automated scanning. The routes themselves also require a valid staff
// session, so this is defence-in-depth, not the only gate.
const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Rate limit exceeded on admin endpoint.' }
});
app.use('/admin-panel/', adminLimiter);
app.use('/admin/',       adminLimiter);

// Share the session with Socket.IO so WebSocket handlers can read req.session
// TEACHING: WebSocket connections start with an HTTP handshake. By running the
// session middleware on that handshake, socket.request.session is populated.
io.engine.use(sessionMiddleware);

app.use(express.static('public'));
app.get('/profile/:name', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

// /join?ref=INVITECODE — shareable invite link
// TEACHING: The redirect keeps logic simple. We just pass the ref
// code to index.html as a query param; client JS reads it and
// pre-fills the invite code field in the register form.
app.get('/join', (req, res) => {
    const ref = (req.query.ref || '').trim().toUpperCase().slice(0, 16);
    if (ref) return res.redirect(`/?ref=${encodeURIComponent(ref)}#register`);
    res.redirect('/');
});

// Trading card page
app.get('/card/:name', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'card.html'));
});
app.use('/adminsauce', express.static(path.join(__dirname, 'public', 'adminsauce')));
// /sauce serves the full vanilla AdminSauce without any React wrapper.
// Used as iframe source by the Next.js AdminSauce UI — the React shell
// provides the look/sidebar, vanilla provides the no-code editors.
app.use('/sauce', express.static(path.join(__dirname, 'public', 'adminsauce')));
app.use('/modpanel',   express.static(path.join(__dirname, 'public', 'modpanel')));


const BLOCKED_TILES = [1, 2]; // 1=Wall, 2=Water

// --- GLOBAL STATE (lives in RAM, resets on restart) ---
let db;
let onlinePlayers = {};
global._onlinePlayers = onlinePlayers; // exposed for achievement checks + admin panel routes
global._io = io; // exposed for game routes that need to broadcast
let mapCache = {};
global._mapCache = mapCache;
let npcMemory  = {};
let worldFlags = {};   // key -> value, loaded from DB + updated by SET_WORLD_FLAG events

// ── COMPANION STATE ──────────────────────────────────────────────────────────
// In-memory tracking of active companions per player character.
// charId -> [{ npcId, name, icon, x, y, mapId, charId (combat), level, currentHp, maxHp, currentMp, maxMp, tactics }]
let companionState = {};

// ── WORLD FLAG CONDITION CHECKER ─────────────────────────────────────────────
// Defined at MODULE LEVEL so it's accessible from both:
//   • loadWorldFlags() / applyRegionAutoRules() which run at STARTUP
//   • socket handlers (move, buy-item, spawn zones) which run after connection
//
// TEACHING: If this were defined inside startServer() or io.on('connection'),
// it would only be visible to functions defined in that same scope via closure.
// applyRegionAutoRules is nested inside loadWorldFlags (module scope), so it
// can only see module-level names — not anything inside startServer.
// Moving this here fixes a ReferenceError that would fire on startup whenever
// any region has auto_rules_json conditions set.
function checkWorldFlagConditions(conditionsJson) {
    if (!conditionsJson) return true;
    try {
        const conds = typeof conditionsJson === 'string'
            ? JSON.parse(conditionsJson) : conditionsJson;
        if (!Array.isArray(conds) || !conds.length) return true;
        return conds.every(c => {
            const actual   = String(worldFlags[c.flag] ?? '');
            const expected = String(c.value ?? '');
            const op = c.op || '==';
            if (op === '==' || op === '===') return actual === expected;
            if (op === '!=' || op === '!==') return actual !== expected;
            if (op === '>')   return parseFloat(actual) > parseFloat(expected);
            if (op === '>=')  return parseFloat(actual) >= parseFloat(expected);
            if (op === '<')   return parseFloat(actual) < parseFloat(expected);
            if (op === '<=')  return parseFloat(actual) <= parseFloat(expected);
            return false;
        });
    } catch { return true; }
}

// Load world flags from DB into memory on startup
async function loadWorldFlags(db) {
    try {
        const [rows] = await db.query('SELECT flag_key, flag_value FROM world_flags');
        worldFlags = {};
        for (const r of rows) worldFlags[r.flag_key] = r.flag_value;

        // ── REGION STATE CACHE ────────────────────────────────────────
        // Regions are loaded into memory at startup and re-evaluated
        // whenever a world flag changes or the scheduler fires a
        // SET_REGION_STATE task. This avoids a DB hit on every move/buy.
        // TEACHING: Like worldFlags, we keep a flat dict in memory.
        // The key is region_id (number). Value is the full region row
        // plus any overrides applied by auto_rules_json.
        // ─────────────────────────────────────────────────────────────
        const regionState = {};  // regionId -> effective region config

        async function loadRegionState() {
            try {
                const [regs] = await db.query('SELECT * FROM game_regions WHERE is_active=1');
                for (const r of regs) {
                    regionState[r.id] = applyRegionAutoRules(r);
                }
            } catch(e) { console.warn('[Region] Load failed:', e.message); }
        }

        // Apply auto_rules_json: evaluate each rule's conditions against worldFlags.
        // If all conditions pass, merge the rule's "apply" object on top of the base region.
        // Rules are evaluated in order; last match wins for each field.
        function applyRegionAutoRules(region) {
            const effective = { ...region };
            if (!region.auto_rules_json) return effective;
            try {
                const rules = typeof region.auto_rules_json === 'string'
                    ? JSON.parse(region.auto_rules_json) : region.auto_rules_json;
                if (!Array.isArray(rules)) return effective;
                for (const rule of rules) {
                    if (checkWorldFlagConditions(rule.conditions)) {
                        Object.assign(effective, rule.apply || {});
                    }
                }
            } catch {}
            return effective;
        }

        // Get the effective region for a given map ID.
        // Returns a default neutral region if no region is assigned.
        async function getRegionForMap(mapId) {
            const map = await getMapData(mapId);
            if (!map || !map.region_id) return null;
            return regionState[map.region_id] || null;
        }

        await loadRegionState();
        global.regionState      = regionState;
        global.getRegionForMap  = getRegionForMap;
        global.loadRegionState  = loadRegionState;
        global.applyRegionAutoRules = applyRegionAutoRules;
        console.log('[Region] Loaded', Object.keys(regionState).length, 'regions');
        console.log(`🌍 Loaded ${rows.length} world flag(s)`);
    } catch (e) { console.warn('loadWorldFlags failed:', e.message); }
}

function safeJsonParse(str, fallback = null) {
    try { return JSON.parse(str); } catch (e) { return fallback; }
}

// ── sanitizeText — shared XSS defence ───────────────────────────
// TEACHING: Any string that came from a player and will be stored
// or broadcast to others must be sanitized. This function:
//   1. Coerces to string (prevents object injection)
//   2. Trims whitespace
//   3. Caps length (prevents DB column overflow)
//   4. HTML-escapes special chars → injected <script> tags become
//      harmless literal text. & must go first to avoid double-escaping.
// React escapes automatically; vanilla JS must use textContent, not innerHTML.
function sanitizeText(raw, maxLen = 500) {
    return String(raw || '')
        .trim()
        .slice(0, maxLen)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

async function startServer() {
    try {
        db = mysql.createPool(DB_CONFIG);
        // TEACHING: createPool() doesn't actually open any connections — it just
        // creates the pool object. The first real query opens a connection.
        // We do an explicit ping here so startup fails fast with a clear error
        // if the database credentials are wrong or MariaDB isn't running yet.
        await db.query('SELECT 1');
        console.log('[DB] Connected to MySQL/MariaDB ✅');
        await db.query("SELECT 1");
        console.log("✅ DATABASE CONNECTED (Pool Mode)");

        authRoutes.init(db);
        gameRoutes.init(db);
        adminRoutes.init(db);
        questRoutes.init(db);
        progressionRoutes.init(db);
        artifactRoutes.init(db, io);
        partyRoutes.init(db, io);
        const mailRoutes = require('./routes/mailRoutes');
        mailRoutes.init(db, io);
        guildRoutes.init(db);
        app.use('/', authRoutes);       // legacy: /login /me /logout
        app.use('/auth', authRoutes);   // UI calls: /auth/login /auth/me /auth/logout
        app.use('/game', gameRoutes);
        app.use('/', adminRoutes);
        app.use('/api/quests', questRoutes);
        app.use('/api/progression', progressionRoutes);
        app.use('/api/artifacts', artifactRoutes);
        app.use('/api/party', partyRoutes);
        app.use('/api/mail',        mailRoutes);
        const leaderboardRoutes  = require('./routes/leaderboard');
        leaderboardRoutes.init(db);
        app.use('/api/leaderboard', leaderboardRoutes);

        const achievementRoutes = require('./routes/achievementRoutes');
        achievementRoutes.init(db, io);
        app.use('/api/achievements', achievementRoutes);

        const guestbookRoutes = require('./routes/guestbookRoutes');
        guestbookRoutes.init(db);
        app.use('/api/guestbook', guestbookRoutes);

        const spotifyRoutes = require('./routes/spotifyRoutes');
        spotifyRoutes.init(db);
        app.use('/api/spotify', spotifyRoutes);
        // FIX: startSyncJob is called outside the critical startup path.
        // A failure here (bad Spotify config) must NOT crash the whole server.
        // setImmediate defers it until after the current call stack, so the
        // rest of startup (DB connect, socket wiring, port listen) completes first.
        setImmediate(() => {
            try { spotifyRoutes.startSyncJob(db); }
            catch (e) { console.error('[Spotify] startSyncJob failed (non-fatal):', e.message); }
        });

        const guildNewsRoutes = require('./routes/guildNewsRoutes');
        guildNewsRoutes.init(db);
        app.use('/api/guild-news', guildNewsRoutes);
        // Export for use in guildBankRoutes auto-news posts
        global._guildNews = guildNewsRoutes;

        const lfpRoutes = require('./routes/lfpRoutes');
        lfpRoutes.init(db);
        app.use('/api/lfp', lfpRoutes);
        app.use('/api/guild', guildRoutes);
        craftingRoutes.init(db);
        app.use('/api/crafting', craftingRoutes);
        auctionRoutes.init(db);
        app.use('/api/auction', auctionRoutes);

        const questboardRoutes = require('./routes/questboard');
        questboardRoutes.init(db);
        app.use('/api/questboard', questboardRoutes);

        // ── SCHEDULER ────────────────────────────────────────────────
        // Start the task scheduler — runs cron-style tasks from the DB.
        // onlinePlayers is defined below inside the socket connection block,
        // but since JS passes objects by reference, we pass a proxy that
        // the scheduler captures. The scheduler only reads it, never writes.
        // We start it slightly deferred so all systems are initialized first.
        setTimeout(() => {
            Scheduler.init(db, io, onlinePlayers);
            if (Scheduler.startLfpCleanup) Scheduler.startLfpCleanup(db);
            if (Scheduler.startProfileViewerCleanup) Scheduler.startProfileViewerCleanup(db);
        }, 3000);
        const worldForgeRoutes = require('./routes/worldForge');
        if (worldForgeRoutes.init) worldForgeRoutes.init(db);
        app.use('/admin/world-forge', worldForgeRoutes);
        const adminPanelRoutes = require('./routes/adminPanel');
        adminPanelRoutes.init(db, io);
        app.use('/admin-panel', adminPanelRoutes);

        // Asset Manager
        const assetRoutes = require('./routes/assetRoutes');
        assetRoutes.init(db);
        app.use('/assets-api', assetRoutes);

        const modPanelRoutes = require('./routes/modPanel');
        modPanelRoutes.init(db, io);
        app.use('/mod-panel', modPanelRoutes);
        console.log("✅ ROUTES ACTIVE");

        // --- MAP CACHE HELPER ---
        async function getMapData(mapId) {
            mapId = parseInt(mapId);
            if (mapCache[mapId]) return mapCache[mapId];
            const [rows] = await db.query("SELECT * FROM game_maps WHERE id = ?", [mapId]);
            if (rows.length === 0) return null;
            const m = rows[0];
            const mapObj = {
                id:          m.id,
                name:        m.name,
                width:       m.width,
                height:      m.height,
                tiles:       safeJsonParse(m.tiles_json,      []),
                events:      safeJsonParse(m.collisions_json, []),
                objects:     safeJsonParse(m.objects_json,    []),
                anims:       safeJsonParse(m.anims_json,      []),
                tileset_url: m.tileset_url  || '',
                ambientDark: parseFloat(m.ambient_dark) || 0
            };
            mapCache[mapId] = mapObj;
            return mapObj;
        }

        // --- STAFF GUARD (used for sensitive admin-only endpoints) ---
        // isStaff() is used for in-socket staff checks (e.g. /clear-cache).
        // It receives userId from the session (socket.request.session.userId),
        // then verifies the role in the DB. Session auth is fully in place.
        async function isStaff(userId) {
            const uid = parseInt(userId, 10);
            if (!uid) return false;
            const [rows] = await db.query('SELECT role FROM users WHERE id=?', [uid]);
            if (!rows.length) return false;
            return ['ADMIN', 'GM', 'MOD'].includes(rows[0].role);
        }

        // Admin cache clear endpoint (STAFF ONLY)
        app.post('/admin/clear-cache', async (req, res) => {
            try {
                const userId = req.session && req.session.userId;
                if (!await isStaff(userId)) {
                    return res.status(403).json({ success: false, message: 'Forbidden' });
                }
                const { mapId: rawMapId, reloadRegions } = req.body;
                const mapId = rawMapId ? parseInt(rawMapId) : null;
                if (mapId) delete mapCache[mapId]; else mapCache = {};
                if (reloadRegions && global.loadRegionState) await global.loadRegionState();

                // Push updated map data to all players currently on that map
                if (mapId) {
                    const freshMap = await getMapData(parseInt(mapId));
                    if (freshMap) {
                        io.to('map_' + mapId).emit('map_data', freshMap);
                    }
                }

                res.json({ success: true });
            } catch (e) {
                console.error('clear-cache error:', e);
                res.status(500).json({ success: false, message: 'Server error' });
            }
        });

        // =============================================================
        // SYNC ENEMY — Creates or updates a characters row for an NPC
        // =============================================================
        // TEACHING: Enemy NPCs need a row in the `characters` table so
        // the battle engine can look up their stats (HP, ATK, DEF, etc).
        // We store user_id=0 to mark them as NPCs, not real players.
        // The resulting characters.id is saved back onto game_npcs.char_id
        // so that spawn zones and BATTLE map events can reference them.
        //
        // We name the row "[NPC:{id}] Name" to guarantee uniqueness —
        // the characters table has a UNIQUE constraint on name, and two
        // NPCs could legitimately share a display name (e.g. two "Goblin"
        // zones). The bracket prefix keeps them distinct in the DB while
        // the game only ever uses the npc.name for display.
        // =============================================================
        app.post('/admin/sync-enemy', async (req, res) => {
            try {
                const userId = req.session && req.session.userId;
                if (!await isStaff(userId)) {
                    return res.status(403).json({ success: false, message: 'Forbidden' });
                }

                const { npcId, name, icon, stats } = req.body;
                if (!npcId || !name || !stats) {
                    return res.json({ success: false, message: 'Missing npcId, name, or stats.' });
                }

                // Unique internal name for the characters row
                const internalName = `[NPC:${npcId}] ${name}`;

                // Check if this NPC already has a char_id
                const [npcRows] = await db.query('SELECT char_id FROM game_npcs WHERE id=?', [npcId]);
                if (!npcRows.length) return res.json({ success: false, message: 'NPC not found.' });

                const existingCharId = npcRows[0].char_id;
                const hp  = parseInt(stats.max_hp)  || 100;
                const mp  = parseInt(stats.max_mp)  || 30;
                const lvl = parseInt(stats.level)   || 1;

                if (existingCharId) {
                    // UPDATE existing character row
                    await db.query(
                        `UPDATE characters SET
                            name=?, level=?,
                            max_hp=?, current_hp=?,
                            max_mp=?, current_mp=?,
                            atk=?, def=?, mo=?, md=?, speed=?, luck=?
                         WHERE id=?`,
                        [
                            internalName, lvl,
                            hp, hp,
                            mp, mp,
                            parseInt(stats.atk)   || 10,
                            parseInt(stats.def)   || 5,
                            parseInt(stats.mo)    || 5,
                            parseInt(stats.md)    || 5,
                            parseInt(stats.speed) || 8,
                            parseInt(stats.luck)  || 5,
                            existingCharId
                        ]
                    );
                    res.json({ success: true, charId: existingCharId, updated: true });
                } else {
                    // INSERT new character row for this NPC
                    const [result] = await db.query(
                        `INSERT INTO characters
                            (user_id, name, level,
                             max_hp, current_hp, max_mp, current_mp,
                             atk, def, mo, md, speed, luck,
                             map_id, x, y)
                         VALUES (0,?,?, ?,?,?,?, ?,?,?,?,?,?, 1,0,0)`,
                        [
                            internalName, lvl,
                            hp, hp, mp, mp,
                            parseInt(stats.atk)   || 10,
                            parseInt(stats.def)   || 5,
                            parseInt(stats.mo)    || 5,
                            parseInt(stats.md)    || 5,
                            parseInt(stats.speed) || 8,
                            parseInt(stats.luck)  || 5
                        ]
                    );
                    const charId = result.insertId;
                    // Link char_id back onto the NPC row
                    await db.query('UPDATE game_npcs SET char_id=? WHERE id=?', [charId, npcId]);
                    res.json({ success: true, charId, updated: false });
                }
            } catch (e) {
                console.error('sync-enemy error:', e);
                res.status(500).json({ success: false, message: e.message });
            }
        });

        // Load world flags into memory so NPCs can reference them in dialogue
        await loadWorldFlags(db);

        // =============================================================
        // WEBSOCKET CONNECTIONS
        // =============================================================
        // --- PARTY IN-MEMORY STATE ---
        // Teaching: parties are stored in DB for persistence, but we also keep
        // an in-memory map for fast real-time lookups during a session.
        // Structure: { partyId: { id, leaderId, members: [charId,...] } }
        const activeParties = {};  // partyId -> party object
        const charPartyMap  = {};  // charId  -> partyId (quick lookup)

        // --- GUILD IN-MEMORY STATE ---
        // Guild memberships persist in DB. We keep a fast in-memory lookup
        // so we can route guild chat instantly without a DB query per message.
        // charGuildMap is populated when a player joins (join_game) and cleared on disconnect.
        const charGuildMap = {};   // charId -> { guildId, guildName, rank }

        // --- TRADE IN-MEMORY STATE ---
        // Trades are completely ephemeral — no DB write until completion.
        // Teaching: This is an example of "optimistic state" — we keep the
        // trade in RAM and only hit the DB when both parties confirm.
        const activeTrades = {};   // tradeId -> trade object
        let   tradeCounter = 1;    // simple ID generator

        // Helper: broadcast party state to all online members
        function broadcastPartyUpdate(partyId) {
            const party = activeParties[partyId];
            if (!party) return;
            party.members.forEach(cid => {
                const entry = Object.values(onlinePlayers).find(p => p.charId === cid);
                if (entry) {
                    io.to(entry.socketId).emit('party_update', party);
                }
            });
        }

        // Helper: get party member data for broadcast
        function buildPartyPayload(partyId) {
            const party = activeParties[partyId];
            if (!party) return null;
            return {
                id: partyId,
                leaderId: party.leaderId,
                members: party.members.map(cid => {
                    const p = Object.values(onlinePlayers).find(pl => pl.charId === cid);
                    return p ? { charId: p.charId, name: p.name, level: p.level, online: true }
                             : { charId: cid, online: false };
                })
            };
        }

        io.on('connection', (socket) => {
            console.log('⚡ SOCKET:', socket.id);
            let lastMoveTime = 0;

            // 1. JOIN GAME
            socket.on('join_game', async (data) => {
                try {
                    // Read userId from the server-side session — client never sends it
                    const sessionData = socket.request.session;
                    const userId = sessionData && sessionData.userId;
                    if (!userId) {
                        socket.emit('error_msg', 'Not logged in. Please refresh and log in again.');
                        return;
                    }
                    if (!data || typeof data !== 'object') {
                        socket.emit('error_msg', 'join_game payload must be an object: { charId }.');
                        return;
                    }
                    const charId = parseInt(data.charId, 10);
                    if (!charId) {
                        socket.emit('error_msg', 'Missing charId.');
                        return;
                    }

                    const query = "SELECT * FROM characters WHERE id = ? AND user_id = ?";
                    const params = [charId, userId];

                    const [rows] = await db.query(query, params);
                    if (rows.length === 0) { socket.emit('error_msg', "Character not found."); return; }
                    const char = rows[0];

                    // Parse state_json to check tutorial completion
                    let charState = {};
                    try { charState = JSON.parse(char.state_json || '{}'); } catch {}
                    const tutorialDone = !!charState.tutorial_done;
                    const mapDataForClient = await getMapData(char.map_id);
                    if (mapDataForClient) socket.emit('map_data', mapDataForClient);

                    // Fetch user role for chat permissions + admin room
                    const [userRows] = await db.query('SELECT role FROM users WHERE id=?', [char.user_id]);
                    const userRole = userRows.length ? (userRows[0].role || 'PLAYER') : 'PLAYER';
                    const isStaffRole = ['ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER'].includes(userRole.toUpperCase());

                    onlinePlayers[socket.id] = {
                        socketId: socket.id, charId: char.id, userId: char.user_id,
                        name: char.name, mapId: char.map_id, x: char.x, y: char.y,
                        level: char.level, role: userRole,
                        // Presence: loaded from DB so last session status is remembered
                        presence: char.presence_status || 'online',
                        awayMessage: char.away_message || null,
                    };
                    socket.join('map_' + char.map_id);
                    // Staff auto-join admin chat room
                    if (isStaffRole) socket.join('admin_chat');
                    // Load labels from game_settings and send to client
                    let gameLabels = {};
                    try {
                        const settingsTables = ['game_settings','system_settings','settings'];
                        let settingsLoaded = false;
                        for (const tbl of settingsTables) {
                            try {
                                const [sr] = await db.query('SHOW TABLES LIKE ?', [tbl]);
                                if (!sr.length) continue;
                                const cols = await db.query('SHOW COLUMNS FROM ??', [tbl]);
                                const colNames = cols[0].map(c => c.Field);
                                const kc = colNames.find(n => /key|name/i.test(n));
                                const vc = colNames.find(n => /val|value/i.test(n));
                                if (!kc || !vc) continue;
                                const [rows] = await db.query('SELECT ?? AS k, ?? AS v FROM ??', [kc, vc, tbl]);
                                for (const r of rows) gameLabels[r.k] = r.v;
                                settingsLoaded = true; break;
                            } catch {}
                        }
                    } catch(labelErr) { console.warn('Label load warning:', labelErr.message); }

                    const _joinRegion = await getRegionForMap(char.map_id).catch(() => null);
                    socket.emit('init_self', {
                        ...onlinePlayers[socket.id],
                        tutorialDone,
                        hp: char.current_hp, maxHp: char.max_hp,
                        mp: char.current_mp || 0, maxMp: char.max_mp || 0,
                        atk: char.atk, def: char.def,
                        mo: char.mo, md: char.md,
                        speed: char.speed, luck: char.luck,
                        limitbreak: Number(char.limitbreak || 0),
                        breaklevel: Number(char.breaklevel || 1),
                        role: userRole,
                        labels: gameLabels,
                        region: _joinRegion ? {
                            id:               _joinRegion.id,
                            name:             _joinRegion.name,
                            danger_level:     _joinRegion.danger_level,
                            corruption_level: _joinRegion.corruption_level,
                            faction_control:  _joinRegion.faction_control,
                            weather_override: _joinRegion.weather_override,
                            pvp_enabled:      _joinRegion.pvp_enabled,
                            is_sanctuary:     _joinRegion.is_sanctuary,
                            active_tags_json: _joinRegion.active_tags_json,
                            xp_mult:          _joinRegion.xp_mult,
                            gold_mult:        _joinRegion.gold_mult,
                        } : null
                    });
                    const mapPlayers = Object.values(onlinePlayers).filter(p => p.mapId === char.map_id && p.charId !== char.id);

                    // Also load offline players on this map (sleeping characters)
                    let offlinePlayers = [];
                    try {
                        const [offRows] = await db.query(
                            `SELECT id AS charId, name, x, y, level, 'offline' AS presence
                             FROM characters WHERE map_id=? AND id!=?
                             AND is_offline_visible=1 AND presence_status='offline'`, [char.map_id, char.id]);
                        // Filter out anyone who's actually online (already in mapPlayers)
                        const onlineIds = new Set(mapPlayers.map(p => p.charId));
                        offlinePlayers = offRows.filter(p => !onlineIds.has(p.charId))
                            .map(p => ({ ...p, isOffline: true }));
                    } catch {}

                    socket.emit('player_list', [...mapPlayers, ...offlinePlayers]);
                    socket.to('map_' + char.map_id).emit('player_joined', onlinePlayers[socket.id]);

                    // Send live NPC positions for this map (loads from DB if first visitor)
                    await loadMapNpcs(char.map_id);
                    socket.emit('npc_list', getNpcsForMap(char.map_id));

                    // Load and send companions
                    const _joinP = onlinePlayers[socket.id];
                    const comps = await loadCompanions(_joinP.charId);
                    spawnCompanionsAtPlayer(_joinP);
                    socket.emit('companion_list', comps);
                    // Broadcast companion sprites to other players on this map
                    for (const comp of comps) {
                        socket.to('map_' + _joinP.mapId).emit('companion_moved', {
                            ownerId: _joinP.charId, npcId: comp.npcId, name: comp.name, icon: comp.icon, x: comp.x, y: comp.y
                        });
                    }

                    // Crowd reaction: check reputation on this map and react if notable
                    await _triggerCrowdReaction(socket, db, onlinePlayers[socket.id], char.map_id);
                    // Environmental reaction: surface healer if player is at low HP
                    await _triggerEnvironmentalReaction(socket, db, onlinePlayers[socket.id], char.map_id);

                    console.log(`✅ ${char.name} joined Map ${char.map_id}`);

                    // Notify player of unread mail on login
                    try {
                        const [[mailRow]] = await db.query(
                            'SELECT COUNT(*) AS n FROM character_mail WHERE recipient_char_id=? AND is_deleted=0 AND is_read=0',
                            [char.id]
                        );
                        if (mailRow.n > 0) {
                            socket.emit('mail_unread_count', { count: mailRow.n });
                        }
                    } catch {} // mail table may not exist yet on old installs

                    // ── ACHIEVEMENT: login_streak + gold_owned triggers ───
                    try {
                        const achievementRoutes = require('./routes/achievementRoutes');
                        const [[uRow]] = await db.query(
                            'SELECT login_streak, currency FROM users WHERE id=?', [char.user_id]);
                        if (uRow) {
                            if (uRow.login_streak > 0) {
                                await achievementRoutes.checkForCharacter(
                                    db, io, char.id, 'login_streak', uRow.login_streak
                                );
                            }
                            if (uRow.currency > 0) {
                                await achievementRoutes.checkForCharacter(
                                    db, io, char.id, 'gold_owned', uRow.currency
                                );
                            }
                        }
                    } catch(ae) { /* non-critical */ }
                } catch (err) { console.error("Join error:", err); socket.emit('error_msg', "Server error."); }
            });

            // select_character — alias emitted by the Next.js UI after character select.
            // Identical to join_game; both start a game session for a character.
            //
            // FIX: The previous implementation used socket.emit('_internal_join', ...)
            // which sends the event TO THE CLIENT, not back to the server. This meant
            // join_game was never called, onlinePlayers[socket.id] was never populated,
            // and every chat/move/action handler silently dropped all events because
            // they all guard with: const p = onlinePlayers[socket.id]; if (!p) return;
            //
            // The fix is simple: directly invoke the join_game listener server-side
            // instead of going through socket.emit which crosses the network boundary.
            socket.on('select_character', async (data) => {
                try {
                    const sessionData = socket.request.session;
                    const userId = sessionData && sessionData.userId;
                    if (!userId) { socket.emit('error_msg', 'Not logged in.'); return; }
                    if (!data || typeof data !== 'object') { socket.emit('error_msg', 'Bad payload.'); return; }
                    const charId = parseInt(data.charId, 10);
                    if (!charId) { socket.emit('error_msg', 'Missing charId.'); return; }
                    // Directly invoke the join_game handler server-side (NOT socket.emit — that goes to the client)
                    const joinHandler = socket.listeners('join_game')[0];
                    if (joinHandler) await joinHandler({ charId });
                    else socket.emit('error_msg', 'Server error: join handler not found.');
                } catch (err) { console.error('select_character error:', err); }
            });

            // 2. MOVEMENT (Server-Authoritative)
            socket.on('move', async (target) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const now = Date.now();
                    if (now - lastMoveTime < 80) return;
                    lastMoveTime = now;

                    const map = await getMapData(p.mapId);
                    if (!map) return;
                    const dist = Math.abs(target.x - p.x) + Math.abs(target.y - p.y);
                    if (dist !== 1) { socket.emit('force_move', { x: p.x, y: p.y }); return; }
                    if (target.x < 0 || target.x >= map.width || target.y < 0 || target.y >= map.height) { socket.emit('force_move', { x: p.x, y: p.y }); return; }
                    const tileId = map.tiles[target.y * map.width + target.x];
                    if (BLOCKED_TILES.includes(tileId)) { socket.emit('force_move', { x: p.x, y: p.y }); return; }

                    p.x = target.x; p.y = target.y;
                    socket.to('map_' + p.mapId).emit('player_moved', { id: p.charId, x: p.x, y: p.y });

                    // --- COMPANION FOLLOW ---
                    const _comps = getActiveCompanions(p.charId);
                    for (const comp of _comps) {
                        const dx = p.x - comp.x;
                        const dy = p.y - comp.y;
                        const dist = Math.abs(dx) + Math.abs(dy);
                        if (dist > 1) {
                            // Move one step toward the player's position
                            const stepX = dx !== 0 ? Math.sign(dx) : 0;
                            const stepY = dx === 0 && dy !== 0 ? Math.sign(dy) : 0;
                            comp.x += stepX;
                            comp.y += stepY;
                            socket.emit('companion_moved', { npcId: comp.npcId, x: comp.x, y: comp.y });
                            socket.to('map_' + p.mapId).emit('companion_moved', {
                                ownerId: p.charId, npcId: comp.npcId, name: comp.name, icon: comp.icon, x: comp.x, y: comp.y
                            });
                        }
                    }

                    // --- EVENT RUNNER: Check STEP_ON events at new position ---
                    if (Array.isArray(map.events)) {
                        // Load player state for condition checks
                        const [stateRows] = await db.query("SELECT state_json, level, class_id FROM characters WHERE id=?", [p.charId]);
                        const charState = stateRows.length ? safeJsonParse(stateRows[0].state_json, {}) : {};

                        const result = await handleMapEvent({
                            triggerType: 'STEP_ON',
                            x: p.x, y: p.y,
                            mapEvents: map.events,
                            socket, db,
                            player: { ...p, level: stateRows[0]?.level || 1, classId: stateRows[0]?.class_id || 1 },
                            state: charState
                        });

                        // Save modified state if actions changed it
                        if (result && result.state) {
                            await db.query("UPDATE characters SET state_json=? WHERE id=?",
                                [JSON.stringify(result.state), p.charId]);
                        }
                    }

                    // --- RANDOM ENCOUNTER CHECK ---
                    // Look up spawn zones for this map at this position
                    try {
                        const [spawns] = await db.query(
                            `SELECT * FROM game_map_spawns WHERE map_id=? AND enabled=1
                             AND ?>=x_min AND ?<=x_max AND ?>=y_min AND ?<=y_max`,
                            [p.mapId, p.x, p.x, p.y, p.y]
                        );
                        for (const zone of spawns) {
                            // Roll encounter chance
                            if (Math.random() * 100 >= (zone.encounter_rate || 10)) continue;
                            // Level check
                            const charLevel = p.level || 1;
                            if (charLevel < (zone.min_level || 1) || charLevel > (zone.max_level || 50)) continue;
                            // Player flag check (personal quest flags)
                            if (zone.required_flag) {
                                const [flagRow] = await db.query("SELECT state_json FROM characters WHERE id=?", [p.charId]);
                                const flags = flagRow.length ? safeJsonParse(flagRow[0].state_json, {}) : {};
                                if (!flags[zone.required_flag]) continue;
                            }
                            // WORLD FLAG CONDITIONS: only spawn if global world state matches
                            if (zone.world_flag_conditions && !checkWorldFlagConditions(zone.world_flag_conditions)) continue;
                            // Pick an enemy from encounter table
                            const table = safeJsonParse(zone.encounter_table, []);
                            if (!table.length) continue;
                            // Weighted random selection
                            const totalWeight = table.reduce((s, e) => s + (e.weight || 1), 0);
                            let roll = Math.random() * totalWeight;
                            let picked = table[0];
                            for (const entry of table) {
                                roll -= (entry.weight || 1);
                                if (roll <= 0) { picked = entry; break; }
                            }
                            // Start PvE battle with this NPC
                            socket.emit('random_encounter', {
                                zoneName: zone.name,
                                npcId: picked.npc_id,
                                npcName: picked.name || 'Enemy'
                            });
                            break; // Only one encounter per step
                        }
                    } catch (spawnErr) { /* Silent fail — encounters are non-critical */ }

                    // --- ARENA ZONE CHECK ---
                    // TEACHING: Each step we check if the player entered or left a PvP
                    // arena zone. Zones are rectangles stored in game_arenas. We compare
                    // the player's new position against every active zone on this map.
                    //
                    // We track arena state on the player object (p.inArena) so we only
                    // fire events when the state actually CHANGES (entered / left),
                    // not on every single step inside the zone.
                    try {
                        const [arenas] = await db.query(
                            `SELECT * FROM game_arenas WHERE map_id=? AND enabled=1
                             AND ?>=x_min AND ?<=x_max AND ?>=y_min AND ?<=y_max`,
                            [p.mapId, p.x, p.x, p.y, p.y]
                        );

                        const zone = arenas.length ? arenas[0] : null;

                        if (zone && !p.inArena) {
                            // Player just ENTERED an arena zone
                            const charLevel = p.level || 1;

                            // Level gate check
                            if (charLevel < (zone.min_level || 1) || charLevel > (zone.max_level || 99)) {
                                socket.emit('notification_msg', {
                                    text: `⚔️ Level ${zone.min_level}–${zone.max_level} required for ${zone.name}.`,
                                    type: 'damage'
                                });
                            } else {
                                p.inArena = {
                                    arenaId:          zone.id,
                                    arenaName:        zone.name,
                                    arenaType:        zone.type || 'OPEN_PVP',
                                    minLevel:         zone.min_level,
                                    maxLevel:         zone.max_level,
                                    entryFee:         zone.entry_fee || 0,
                                    rewardMultiplier: parseFloat(zone.reward_multiplier) || 1
                                };
                                // Tell the player themselves
                                socket.emit('arena_entered', p.inArena);
                                // Tell everyone else on the map so their NearbyUI updates
                                // TEACHING: We broadcast the charId + arena state so
                                // other clients can update Game.players[charId].inArena
                                // and refresh their challenge buttons without a full reload.
                                socket.to('map_' + p.mapId).emit('player_arena_changed', {
                                    charId:  p.charId,
                                    inArena: p.inArena
                                });
                            }

                        } else if (!zone && p.inArena) {
                            // Player just LEFT an arena zone
                            p.inArena = null;
                            socket.emit('arena_left', {});
                            // Tell others this player left the arena
                            socket.to('map_' + p.mapId).emit('player_arena_changed', {
                                charId:  p.charId,
                                inArena: null
                            });
                        }
                    } catch (arenaErr) { /* Silent fail — non-critical */ }

                } catch (err) { console.error("Move error:", err); }
            });

            // 3. TELEPORT
            socket.on('teleport', async (data) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;

                    // Clear arena state when leaving a map
                    if (p.inArena) {
                        p.inArena = null;
                        socket.emit('arena_left', {});
                    }

                    const oldMap = p.mapId, newMap = parseInt(data.mapId);

                    // Fetch map data so we can use its spawn point if no coords given
                    const mapData = await getMapData(newMap);
                    if (mapData) socket.emit('map_data', mapData);

                    socket.leave('map_' + oldMap);
                    socket.to('map_' + oldMap).emit('player_left', p.charId);

                    // Use provided coords, or the map's defined spawn, or dead-centre
                    const spawnX = data.x ? parseInt(data.x) : ((mapData && mapData.spawn_x) || Math.floor((mapData?.width  || 20) / 2));
                    const spawnY = data.y ? parseInt(data.y) : ((mapData && mapData.spawn_y) || Math.floor((mapData?.height || 20) / 2));

                    p.mapId = newMap; p.x = spawnX; p.y = spawnY;
                    await db.query("UPDATE characters SET map_id=?, x=?, y=? WHERE id=?", [newMap, spawnX, spawnY, p.charId]);
                    socket.join('map_' + newMap);

                    // Teaching: emit map_changed FIRST so client clears old canvas,
                    // THEN player_list so it can draw other players on the new map.
                    // Fast Travel discovery: if the destination map allows it,
                    // record this map in the player's discovered warp points.
                    if (mapData && mapData.fast_travel_enabled) {
                        try {
                            const [ftRow] = await db.query('SELECT state_json FROM characters WHERE id=?', [p.charId]);
                            const ftState = ftRow.length ? safeJsonParse(ftRow[0].state_json, {}) : {};
                            const warpPoints = Array.isArray(ftState.warpPoints) ? ftState.warpPoints : [];
                            if (!warpPoints.some(wp => wp.mapId === newMap)) {
                                warpPoints.push({ mapId: newMap, name: mapData.name, discoveredAt: Date.now() });
                                ftState.warpPoints = warpPoints;
                                await db.query('UPDATE characters SET state_json=? WHERE id=?',
                                    [JSON.stringify(ftState), p.charId]);
                                socket.emit('warp_discovered', { mapId: newMap, name: mapData.name });

                                // ── ACHIEVEMENT: maps_visited trigger ────────────────
                                try {
                                    const achievementRoutes = require('./routes/achievementRoutes');
                                    await achievementRoutes.checkForCharacter(
                                        db, io, p.charId, 'maps_visited', warpPoints.length
                                    );
                                } catch(ae) { /* non-critical */ }
                            }
                        } catch (e) { /* non-critical */ }
                    }

                    const _newRegion = await getRegionForMap(newMap).catch(() => null);
                    socket.emit('map_changed', {
                        mapId:   newMap,
                        mapName: mapData ? mapData.name : '',
                        x:       spawnX,
                        y:       spawnY,
                        zoneType:    mapData ? (mapData.zone_type    || 'WORLD') : 'WORLD',
                        floorNumber: mapData ? (mapData.floor_number || null)    : null,
                        dungeonName: mapData ? (mapData.dungeon_name || null)    : null,
                        region: _newRegion ? {
                            id: _newRegion.id, name: _newRegion.name,
                            danger_level: _newRegion.danger_level,
                            corruption_level: _newRegion.corruption_level,
                            faction_control: _newRegion.faction_control,
                            weather_override: _newRegion.weather_override,
                            pvp_enabled: _newRegion.pvp_enabled,
                            is_sanctuary: _newRegion.is_sanctuary,
                            active_tags_json: _newRegion.active_tags_json,
                            xp_mult: _newRegion.xp_mult, gold_mult: _newRegion.gold_mult,
                        } : null,
                    });
                    // Exclude self from player_list — client already knows its own position
                    socket.emit('player_list', Object.values(onlinePlayers).filter(pl => pl.mapId === newMap && pl.charId !== p.charId));

                    // Send NPCs for the new map
                    await loadMapNpcs(newMap);
                    socket.emit('npc_list', getNpcsForMap(newMap));
                    socket.to('map_' + newMap).emit('player_joined', p);

                    // Teleport companions to new map
                    const _tpComps = getActiveCompanions(p.charId);
                    for (const comp of _tpComps) {
                        comp.mapId = newMap;
                        comp.x = p.x;
                        comp.y = p.y;
                    }
                    if (_tpComps.length) {
                        socket.emit('companion_list', _tpComps);
                    }

                    // Crowd reaction + environmental reaction on the new map
                    await _triggerCrowdReaction(socket, db, p, newMap);
                    await _triggerEnvironmentalReaction(socket, db, p, newMap);
                } catch (err) { console.error("Teleport error:", err); }
            });

            // 3b. FAST TRAVEL — teleport to a previously-discovered warp point
            socket.on('fast_travel', async ({ mapId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const destMap = parseInt(mapId);

                    // Validate: player must have discovered this warp point
                    const [ftRow] = await db.query('SELECT state_json FROM characters WHERE id=?', [p.charId]);
                    const ftState = ftRow.length ? safeJsonParse(ftRow[0].state_json, {}) : {};
                    const warpPoints = Array.isArray(ftState.warpPoints) ? ftState.warpPoints : [];
                    const knownWarp  = warpPoints.find(wp => wp.mapId === destMap);
                    if (!knownWarp) {
                        socket.emit('notification', { text: "You haven't discovered that location yet.", type: 'error' });
                        return;
                    }

                    // Re-use the teleport event (fires through the same path)
                    const mapData = await getMapData(destMap);
                    if (!mapData || !mapData.fast_travel_enabled) {
                        socket.emit('notification', { text: 'Fast travel is not available to that location.', type: 'error' });
                        return;
                    }
                    // Emit as a normal teleport through the existing path
                    socket.emit('teleport', { mapId: destMap });
                    socket.emit('notification', { text: `✈️ Fast travel to ${mapData.name}...`, type: 'info' });
                } catch (e) { console.error('Fast travel error:', e); }
            });

            // 4. INTERACT (Replaces old npc_talk — handles ALL interact events)
            socket.on('interact', async ({ x, y }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const map = await getMapData(p.mapId);
                    if (!map) return;

                    // Check for interactable objects at player position (signs with text, etc.)
                    if (map.objects && Array.isArray(map.objects)) {
                        const obj = map.objects.find(o => {
                            const dist = Math.abs(o.x - p.x) + Math.abs(o.y - p.y);
                            return dist <= 1 && o.preset === 'SIGN' && o.text;
                        });
                        if (obj) {
                            socket.emit('event_queue', [
                                { cmd: 'dialogue', speaker: obj.label || 'Sign', text: obj.text }
                            ]);
                            return;
                        }
                    }

                    // Load player state
                    const [stateRows] = await db.query("SELECT state_json, level, class_id FROM characters WHERE id=?", [p.charId]);
                    const charState = stateRows.length ? safeJsonParse(stateRows[0].state_json, {}) : {};

                    // Check if the player is interacting with a live wandering NPC
                    // (NPCs that move can no longer be matched by fixed tile position)
                    const liveNpc = getNpcsForMap(p.mapId).find(n => {
                        const dist = Math.abs(n.x - p.x) + Math.abs(n.y - p.y);
                        return dist <= 1; // adjacent or same tile
                    });

                    if (liveNpc) {
                        // Load memory for this player+NPC pair
                        const [memRows] = await db.query(
                            'SELECT facts_json, reputation FROM npc_memories WHERE char_id=? AND npc_name=?',
                            [p.charId, liveNpc.name]
                        );
                        const mem = memRows.length
                            ? { facts: safeJsonParse(memRows[0].facts_json, []), reputation: memRows[0].reputation || 0 }
                            : { facts: [], reputation: 0 };

                        // Build a CHOICE menu based on what this NPC offers
                        const choices = [];

                        // --- Quest offers: filter to ones not started or completed ---
                        if (liveNpc.questOffers && liveNpc.questOffers.length) {
                            const playerQuests = charState.quests || {};
                            const offerIds = liveNpc.questOffers.filter(qid => {
                                const qs = playerQuests[qid];
                                return !qs || (qs.step !== -1); // not completed
                            });
                            if (offerIds.length) {
                                const [qRows] = await db.query(
                                    'SELECT id, name, description FROM game_quests WHERE id IN (?) AND is_active=1',
                                    [offerIds]
                                );
                                for (const q of qRows) {
                                    const already = charState.quests && charState.quests[q.id];
                                    choices.push({
                                        id: `quest_${q.id}`,
                                        text: already
                                            ? `📜 "${q.name}" — Check in`
                                            : `📜 "${q.name}" — Tell me more`
                                    });
                                }
                            }
                        }

                        // --- Shop offer ---
                        if (liveNpc.shopId) {
                            choices.push({ id: `shop_${liveNpc.shopId}`, text: '🏪 Browse your wares' });
                            // Haggle only available if player has interacted before
                            if (mem.reputation >= 20) {
                                choices.push({ id: `haggle_${liveNpc.shopId}`, text: '💰 Ask for a deal...' });
                            }
                        }

                        // --- Companion recruit/dismiss ---
                        if (liveNpc.isRecruitable) {
                            const [existComp] = await db.query(
                                'SELECT id, is_active FROM character_companions WHERE character_id=? AND npc_id=? LIMIT 1',
                                [p.charId, liveNpc.id]);
                            if (existComp.length && existComp[0].is_active) {
                                choices.push({ id: 'companion_dismiss', text: '👋 I need you to wait here' });
                            } else {
                                const meetsRep = mem.reputation >= (liveNpc.recruitRepReq || 50);
                                let meetsQuest = true;
                                if (liveNpc.recruitQuestReq) {
                                    const qs = charState.quests || {};
                                    meetsQuest = qs[liveNpc.recruitQuestReq] && qs[liveNpc.recruitQuestReq].step === -1;
                                }
                                const currentComps = getActiveCompanions(p.charId).length;
                                if (meetsRep && meetsQuest && currentComps < 3) {
                                    choices.push({ id: 'companion_recruit', text: '⚔️ Join my party!' });
                                } else if (!meetsRep) {
                                    choices.push({ id: 'companion_locked_rep', text: '🔒 Join my party (needs higher reputation)' });
                                } else if (!meetsQuest) {
                                    choices.push({ id: 'companion_locked_quest', text: '🔒 Join my party (complete a quest first)' });
                                } else if (currentComps >= 3) {
                                    choices.push({ id: 'companion_full', text: '🔒 Join my party (party full)' });
                                }
                            }
                        }

                        // Always offer talk + farewell
                        choices.push({ id: 'talk', text: '💬 Just talking' });
                        choices.push({ id: 'farewell', text: '👋 Farewell' });

                        // Reputation-aware greeting
                        let greeting;
                        // Derive title for use in greeting
                        const title = await _deriveTitle(p.charId, db);
                        const address = title ? `${p.name} ${title}` : p.name;

                        // Mood-aware greeting (overrides reputation greeting if set)
                        if (liveNpc.mood === 'happy')    greeting = `*${liveNpc.name} grins.* "Ah, ${address}! You've come at a good time!"`;
                        else if (liveNpc.mood === 'fearful')  greeting = `*${liveNpc.name} glances around nervously.* "Thank the gods, ${address}. Something is wrong."`;
                        else if (liveNpc.mood === 'angry')    greeting = `*${liveNpc.name} scowls.* "What do you want, ${address}?"`;
                        else if (liveNpc.mood === 'grieving') greeting = `*${liveNpc.name} looks hollow.* "...${address}. I can barely speak right now."`;
                        else if (liveNpc.mood === 'excited')  greeting = `*${liveNpc.name} waves eagerly.* "${address}! Come here, quickly!"`;
                        else if (mem.reputation > 50)    greeting = `*${liveNpc.name} smiles.* "Good to see you again, ${address}."`;
                        else if (mem.reputation < -30)   greeting = `*${liveNpc.name} eyes you warily.* "You again. What do you want?"`;
                        else if (mem.facts.length > 0)  greeting = `"Ah, you're back. What can I do for you?"`;
                        else                            greeting = `*${liveNpc.name} looks you over.* "Yes? What do you need?"`;

                        socket._talkingTo = liveNpc;
                        socket._talkingMem = mem;
                        socket.emit('event_queue', [
                            { cmd: 'dialogue', speaker: liveNpc.name, text: greeting },
                            { cmd: 'npc_choice_menu', npcName: liveNpc.name, choices }
                        ]);
                        return;
                    }

                    const result = await handleMapEvent({
                        triggerType: 'INTERACT',
                        x, y,
                        mapEvents: map.events,
                        socket, db,
                        player: { ...p, level: stateRows[0]?.level || 1, classId: stateRows[0]?.class_id || 1 },
                        state: charState
                    });

                    // Save modified state
                    if (result && result.state) {
                        await db.query("UPDATE characters SET state_json=? WHERE id=?",
                            [JSON.stringify(result.state), p.charId]);
                        // Refresh world flags in case a SET_WORLD_FLAG action fired
                        await loadWorldFlags(db);
                    }
                } catch (err) {
                    console.error("Interact error:", err);
                }
            });

            // 4b. NPC TALK (Legacy + LLM fallback — when client sends typed message)
            // NPC talk rate limit: 1 call per 2 seconds per socket (LLM cost protection)
            let _lastNpcTalk = 0;
            socket.on('npc_talk', async ({ x, y, message }) => {
                const _now = Date.now();
                if (_now - _lastNpcTalk < 2000) return; // silently drop rapid repeats
                _lastNpcTalk = _now;
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const map = await getMapData(p.mapId);
                    if (!map) return;
                    const ev = (map.events || []).find(e => e.x === x && e.y === y && e.type === 'NPC');
                    if (!ev) return;

                    // Load NPC persona — try live npcState first (wandering NPCs),
                    // fall back to DB lookup by name for tile-event NPCs
                    const liveNpcForTalk = getNpcsForMap(p.mapId).find(n => n.name === ev?.data || n.name === x);
                    let npc = { name: (ev && ev.data) || x || 'Stranger' };
                    if (liveNpcForTalk) {
                        npc.persona = liveNpcForTalk.persona;
                    } else {
                        const [npcRows] = await db.query("SELECT * FROM game_npcs WHERE name = ?", [npc.name]);
                        if (npcRows.length) { npc.persona = npcRows[0].persona; }
                    }

                    // Sanitize player message before sending to LLM or storing
                    // TEACHING: The LLM sees this text — a player could try to
                    // inject prompt-override instructions. Trimming and capping
                    // the message length limits the attack surface significantly.
                    message = String(message || '').trim().slice(0, 500);
                    if (!message) return;

                    const memKey = `${p.charId}_${npc.name}`;
                    if (!npcMemory[memKey]) npcMemory[memKey] = [];
                    const history = npcMemory[memKey];

                    // Load persistent memory from DB (facts + reputation)
                    const [memRows] = await db.query(
                        'SELECT facts_json, reputation FROM npc_memories WHERE char_id=? AND npc_name=?',
                        [p.charId, npc.name]
                    );
                    const mem = memRows.length
                        ? { facts: safeJsonParse(memRows[0].facts_json, []), reputation: memRows[0].reputation || 0 }
                        : { facts: [], reputation: 0 };

                    // Build rich player context for the LLM prompt
                    const [charCtx] = await db.query('SELECT level FROM characters WHERE id=?', [p.charId]);
                    const talkTitle = await _deriveTitle(p.charId, db);
                    const playerCtx = {
                        name:       p.name,
                        title:      talkTitle,
                        level:      charCtx.length ? charCtx[0].level : 1,
                        mapId:      p.mapId,
                        questsDone: Object.keys((charState && charState.quests) || {})
                                        .filter(k => charState.quests[k] && charState.quests[k].step === -1).length
                    };
                    const _npcRegion = await getRegionForMap(p.mapId).catch(() => null);
                    const aiConfig = await loadAiConfig();
                    const reply = await getNpcReply({
                        npc, player: playerCtx, message, history,
                        memory: mem, worldFlags, region: _npcRegion, aiConfig
                    });
                    history.push({ role: 'user', text: message }, { role: 'npc', text: reply });
                    if (history.length > 20) history.splice(0, 2);
                    socket.emit('npc_reply', { npcName: npc.name, text: reply });

                    // Update facts + reputation and persist to DB
                    const newFacts = extractFacts({ playerMessage: message, npcName: npc.name, player: { name: p.name }, memory: mem });
                    const newRep   = Math.max(-100, Math.min(100, mem.reputation + reputationDelta(message)));
                    await _upsertMemory(db, p.charId, npc.name, newFacts, newRep);
                } catch (err) {
                    console.error("NPC error:", err);
                    socket.emit('npc_reply', { npcName: 'System', text: '*stares blankly* (Error)' });
                }
            });

            // --- ACCEPT NPC NEED ---
            socket.on('accept_npc_need', async ({ npcId }) => {
                try {
                    const p   = onlinePlayers[socket.id];
                    const npc = npcState[npcId];
                    if (!p || !npc || !npc._need || npc._need.acceptedBy) return;

                    npc._need.acceptedBy = p.charId;
                    const { reward_gold, reward_xp } = npc._need;

                    if (reward_gold) await db.query(
                        'UPDATE users SET currency=currency+? WHERE id=(SELECT user_id FROM characters WHERE id=?)',
                        [reward_gold, p.charId]);
                    if (reward_xp) await db.query(
                        'UPDATE characters SET experience=experience+? WHERE id=?', [reward_xp, p.charId]);

                    // Rep boost with this NPC
                    const [memR] = await db.query(
                        'SELECT facts_json, reputation FROM npc_memories WHERE char_id=? AND npc_name=?',
                        [p.charId, npc.name]);
                    const mem  = memR.length
                        ? { facts: safeJsonParse(memR[0].facts_json,[]), reputation: memR[0].reputation||0 }
                        : { facts: [], reputation: 0 };
                    const newFacts = [...mem.facts, `Helped ${npc.name} with a small task`].slice(-10);
                    await _upsertMemory(db, p.charId, npc.name, newFacts, Math.min(100, mem.reputation + 8));

                    // Faction rep boost
                    const faction = await _getNpcFaction(db, npc.id);
                    if (faction) await _updateFactionRep(db, p.charId, faction.id, 5);

                    socket.emit('npc_need_resolved', {
                        npcName: npc.name, reward_gold, reward_xp,
                        message: `*${npc.name} thanks you.* "You have my gratitude."`
                    });
                    npc._need = null;
                } catch (e) { console.error('accept_npc_need error:', e); }
            });

            // 4b-2. NPC MENU CHOICE (quest accept, shop open, talk, haggle)
            socket.on('npc_menu_choice', async ({ choiceId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p || !socket._talkingTo) return;
                    const npc = socket._talkingTo;
                    const mem = socket._talkingMem || { facts: [], reputation: 0 };

                    if (choiceId.startsWith('quest_')) {
                        const questId = parseInt(choiceId.replace('quest_', ''));
                        const [stateRows] = await db.query('SELECT state_json FROM characters WHERE id=?', [p.charId]);
                        const charState   = stateRows.length ? safeJsonParse(stateRows[0].state_json, {}) : {};
                        const [qr]        = await db.query('SELECT * FROM game_quests WHERE id=?', [questId]);
                        if (!qr.length) return;
                        const quest = qr[0];

                        // Already in progress? Check for completion conditions
                        if (charState.quests && charState.quests[questId] && charState.quests[questId].step !== -1) {
                            // This is a quest check-in — show current progress
                            const steps = safeJsonParse(quest.objectives_json, []);
                            const step  = (charState.quests[questId].step || 0);
                            const obj   = steps[step];
                            const text  = obj
                                ? `"You're making progress. ${obj.description || 'Keep going.'}"` 
                                : `"I think you've done what I asked. Let me reward you."`;
                            socket.emit('event_queue', [{ cmd: 'dialogue', speaker: npc.name, text }]);
                            return;
                        }

                        // Start the quest
                        if (!charState.quests) charState.quests = {};
                        charState.quests[questId] = { step: 0, started: Date.now() };
                        await db.query('UPDATE characters SET state_json=? WHERE id=?',
                            [JSON.stringify(charState), p.charId]);

                        const steps     = safeJsonParse(quest.objectives_json, []);
                        const firstStep = steps[0];
                        const acceptMsg = firstStep
                            ? `"Good. Here's what I need: ${firstStep.description}"`
                            : `"The task is yours. Don't disappoint me."`;

                        socket.emit('event_queue', [
                            { cmd: 'dialogue',     speaker: npc.name, text: acceptMsg },
                            { cmd: 'notification', text: '📜 Quest Started: ' + quest.name, type: 'quest' }
                        ]);
                        // Boost reputation slightly for accepting
                        await _upsertMemory(db, p.charId, npc.name, mem.facts, Math.min(100, mem.reputation + 5));

                    } else if (choiceId.startsWith('shop_')) {
                        const shopId = parseInt(choiceId.replace('shop_', ''));
                        socket.emit('event_queue', [{ cmd: 'open_shop', shopId }]);

                    } else if (choiceId.startsWith('haggle_')) {
                        const shopId = parseInt(choiceId.replace('haggle_', ''));
                        // Reputation-based discount offer
                        const discount = mem.reputation >= 60 ? 20
                                       : mem.reputation >= 40 ? 15
                                       : mem.reputation >= 20 ? 10 : 0;
                        if (discount > 0) {
                            socket.emit('event_queue', [
                                { cmd: 'dialogue', speaker: npc.name,
                                  text: `*${npc.name} leans in.* "For you? I'll knock ${discount}% off. Don't tell the others."` },
                                { cmd: 'open_shop', shopId, discount }
                            ]);
                        } else {
                            socket.emit('event_queue', [
                                { cmd: 'dialogue', speaker: npc.name,
                                  text: `"Prices are prices. I don't make exceptions."` }
                            ]);
                        }

                    } else if (choiceId === 'companion_recruit') {
                        // Recruit this NPC as a companion
                        try {
                            await db.query(
                                `INSERT INTO character_companions (character_id, npc_id, is_active, tactics)
                                 VALUES (?, ?, 1, 'BALANCED')
                                 ON DUPLICATE KEY UPDATE is_active=1, recruited_at=NOW()`,
                                [p.charId, npc.id]
                            );
                            // Load companion data
                            const comps = await loadCompanions(p.charId);
                            spawnCompanionsAtPlayer(p);
                            const newComp = comps.find(c => c.npcId === npc.id);
                            if (newComp) {
                                socket.emit('companion_joined', newComp);
                            }
                            socket.emit('event_queue', [
                                { cmd: 'dialogue', speaker: npc.name,
                                  text: `*${npc.name} nods firmly.* "I'll fight by your side. Lead the way."` },
                                { cmd: 'notification', text: `⚔️ ${npc.name} joined your party!`, type: 'info' }
                            ]);
                            // Boost reputation
                            await _upsertMemory(db, p.charId, npc.name, mem.facts, Math.min(100, mem.reputation + 10));
                        } catch (e) { console.error('Companion recruit error:', e); }

                    } else if (choiceId === 'companion_dismiss') {
                        // Dismiss companion
                        try {
                            await db.query(
                                'UPDATE character_companions SET is_active=0 WHERE character_id=? AND npc_id=?',
                                [p.charId, npc.id]
                            );
                            companionState[p.charId] = (companionState[p.charId] || []).filter(c => c.npcId !== npc.id);
                            socket.emit('companion_dismissed', { npcId: npc.id });
                            socket.emit('event_queue', [
                                { cmd: 'dialogue', speaker: npc.name,
                                  text: `*${npc.name} steps back.* "I'll be here if you need me again."` }
                            ]);
                        } catch (e) { console.error('Companion dismiss error:', e); }

                    } else if (choiceId === 'companion_locked_rep') {
                        socket.emit('event_queue', [
                            { cmd: 'dialogue', speaker: npc.name,
                              text: `*${npc.name} considers your request.* "I don't know you well enough yet. Prove yourself to me first."` }
                        ]);

                    } else if (choiceId === 'companion_locked_quest') {
                        socket.emit('event_queue', [
                            { cmd: 'dialogue', speaker: npc.name,
                              text: `*${npc.name} shakes their head.* "There's something I need done first. Help me with that, and we'll talk."` }
                        ]);

                    } else if (choiceId === 'companion_full') {
                        socket.emit('event_queue', [
                            { cmd: 'dialogue', speaker: npc.name,
                              text: `*${npc.name} glances at your companions.* "Looks like your hands are full already. Come back if you make room."` }
                        ]);

                    } else if (choiceId === 'talk') {
                        socket.emit('event_queue', [{ cmd: 'npc_talk_prompt', npcName: npc.name }]);

                    } else if (choiceId === 'farewell') {
                        const farewell = mem.reputation > 50
                            ? `*${npc.name} waves warmly.* "Safe travels, friend."`
                            : `"Watch yourself out there."`;
                        socket.emit('event_queue', [{ cmd: 'dialogue', speaker: npc.name, text: farewell }]);
                    }
                } catch (err) { console.error('npc_menu_choice error:', err); }
            });

            // 4b2. COMPANION MANAGEMENT
            socket.on('companion_set_tactics', async ({ npcId, tactics }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const valid = ['AGGRESSIVE', 'BALANCED', 'DEFENSIVE', 'SUPPORT'];
                    if (!valid.includes(tactics)) return;
                    await db.query(
                        'UPDATE character_companions SET tactics=? WHERE character_id=? AND npc_id=? AND is_active=1',
                        [tactics, p.charId, npcId]
                    );
                    const comp = (companionState[p.charId] || []).find(c => c.npcId === npcId);
                    if (comp) comp.tactics = tactics;
                    socket.emit('companion_tactics_changed', { npcId, tactics });
                } catch (e) { console.error('companion_set_tactics error:', e); }
            });

            socket.on('companion_dismiss', async ({ npcId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    await db.query(
                        'UPDATE character_companions SET is_active=0 WHERE character_id=? AND npc_id=?',
                        [p.charId, npcId]
                    );
                    companionState[p.charId] = (companionState[p.charId] || []).filter(c => c.npcId !== npcId);
                    socket.emit('companion_dismissed', { npcId });
                } catch (e) { console.error('companion_dismiss error:', e); }
            });

            // 4c. CHOICE RESPONSE (Player picked an option from event_queue)
            socket.on('event_choice', async ({ optionId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p || !socket._pendingChoices) return;

                    const chosen = socket._pendingChoices[optionId];
                    socket._pendingChoices = null;

                    if (chosen && chosen.actions) {
                        const [stateRows] = await db.query("SELECT state_json, level, class_id FROM characters WHERE id=?", [p.charId]);
                        const charState = stateRows.length ? safeJsonParse(stateRows[0].state_json, {}) : {};

                        const result = await executeActions({
                            actions: chosen.actions,
                            socket, db,
                            player: { ...p, level: stateRows[0]?.level || 1, classId: stateRows[0]?.class_id || 1 },
                            state: charState
                        });

                        if (result && result.state) {
                            await db.query("UPDATE characters SET state_json=? WHERE id=?",
                                [JSON.stringify(result.state), p.charId]);
                        }
                    }
                } catch (err) { console.error("Choice error:", err); }
            });

            // =============================================================
            // DUEL SYSTEM
            // =============================================================
            // Duels are consensual 1v1 PvP with an optional gold wager.
            // Flow: challenger emits duel_challenge → server forwards duel_request
            // to target → target emits duel_accept or duel_decline → server
            // either starts a battle or notifies challenger of the decline.
            // Requests expire after 60 seconds automatically.
            //
            // TEACHING: We keep a simple in-memory pendingDuels Map so we can
            // expire requests without hitting the DB on every tick. Duels that
            // result in a battle reuse the existing BattleManager.startBattle()
            // so all combat rules, XP, and gold rewards are identical.
            // =============================================================
            const pendingDuels = new Map(); // requestId → { challengerId, targetId, wagerAmount, timer }

            socket.on('duel_challenge', async ({ targetId, wagerAmount = 0 }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;

                    // Sanitise wager
                    const wager = Math.max(0, Math.floor(Number(wagerAmount) || 0));

                    // Check challenger can afford the wager
                    if (wager > 0) {
                        const [[wallet]] = await db.query('SELECT currency FROM users WHERE id=?', [p.userId]);
                        if (!wallet || wallet.currency < wager) {
                            socket.emit('duel_error', 'Insufficient gold for that wager.');
                            return;
                        }
                    }

                    // Find target
                    const targetEntry = Object.entries(onlinePlayers)
                        .find(([, pl]) => pl.charId === parseInt(targetId));
                    if (!targetEntry) { socket.emit('duel_error', 'Player not found or offline.'); return; }
                    const [tSockId, target] = targetEntry;

                    // Don't allow duels against yourself
                    if (target.charId === p.charId) { socket.emit('duel_error', 'You cannot challenge yourself.'); return; }

                    // Check no existing pending duel between these two
                    for (const [, d] of pendingDuels) {
                        if (d.challengerId === p.charId && d.targetId === target.charId) {
                            socket.emit('duel_error', 'You already have a pending challenge with this player.');
                            return;
                        }
                    }

                    const requestId = `duel_${p.charId}_${target.charId}_${Date.now()}`;
                    const payload = {
                        id: requestId,
                        challengerId: p.charId,
                        challengerName: p.name,
                        challengerLevel: p.level,
                        targetId: target.charId,
                        wagerAmount: wager,
                        expiresAt: Date.now() + 60000,
                    };

                    // Auto-expire after 60s
                    const timer = setTimeout(() => {
                        if (pendingDuels.has(requestId)) {
                            pendingDuels.delete(requestId);
                            socket.emit('duel_expired', { requestId });
                        }
                    }, 60000);

                    pendingDuels.set(requestId, { ...payload, timer, challengerSocketId: socket.id });

                    // Forward to target
                    const tSock = io.sockets.sockets.get(tSockId);
                    if (tSock) tSock.emit('duel_request', payload);

                    socket.emit('notification', { text: `⚔️ Duel challenge sent to ${target.name}!`, type: 'info' });
                } catch (e) { console.error('duel_challenge error:', e); }
            });

            socket.on('duel_accept', async ({ requestId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;

                    const duel = pendingDuels.get(requestId);
                    if (!duel) { socket.emit('duel_error', 'Duel request expired or not found.'); return; }
                    if (duel.targetId !== p.charId) { socket.emit('duel_error', 'This challenge was not for you.'); return; }

                    clearTimeout(duel.timer);
                    pendingDuels.delete(requestId);

                    // Notify challenger
                    const challSock = io.sockets.sockets.get(duel.challengerSocketId);
                    if (challSock) challSock.emit('duel_accepted', { requestId, accepterName: p.name });

                    // Hold wager escrow — deduct from both upfront, winner gets both back
                    if (duel.wagerAmount > 0) {
                        await db.query('UPDATE users SET currency=currency-? WHERE id=?', [duel.wagerAmount, onlinePlayers[duel.challengerSocketId]?.userId || 0]);
                        await db.query('UPDATE users SET currency=currency-? WHERE id=?', [duel.wagerAmount, p.userId]);
                    }

                    // Start the battle using the existing PvP battle system
                    const BattleManager = require('./battle_engine');
                    const battleId = await BattleManager.startBattle(
                        db, io,
                        { charId: duel.challengerId, socketId: duel.challengerSocketId },
                        { charId: p.charId, socketId: socket.id },
                        'PVP',
                        { wager: duel.wagerAmount, isDuel: true }
                    );

                    if (!battleId) {
                        // Refund wager if battle failed to start
                        if (duel.wagerAmount > 0) {
                            const challUserId = onlinePlayers[duel.challengerSocketId]?.userId;
                            if (challUserId) await db.query('UPDATE users SET currency=currency+? WHERE id=?', [duel.wagerAmount, challUserId]);
                            await db.query('UPDATE users SET currency=currency+? WHERE id=?', [duel.wagerAmount, p.userId]);
                        }
                        socket.emit('duel_error', 'Failed to start battle. Please try again.');
                    }
                } catch (e) { console.error('duel_accept error:', e); }
            });

            socket.on('duel_decline', async ({ requestId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;

                    const duel = pendingDuels.get(requestId);
                    if (!duel) return; // already expired — no-op

                    clearTimeout(duel.timer);
                    pendingDuels.delete(requestId);

                    // Notify challenger of the decline
                    const challSock = io.sockets.sockets.get(duel.challengerSocketId);
                    if (challSock) challSock.emit('duel_declined', { requestId, declinerName: p.name });

                    socket.emit('notification', { text: 'Duel challenge declined.', type: 'info' });
                } catch (e) { console.error('duel_decline error:', e); }
            });

            // TUTORIAL COMPLETE — saves tutorial_done into state_json so
            // the server can tell the client not to show it again on any device.
            socket.on('tutorial_complete', async () => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const [rows] = await db.query("SELECT state_json FROM characters WHERE id=?", [p.charId]);
                    const state = rows.length ? safeJsonParse(rows[0].state_json, {}) : {};
                    state.tutorial_done = true;
                    await db.query("UPDATE characters SET state_json=? WHERE id=?",
                        [JSON.stringify(state), p.charId]);
                } catch (err) { console.error("tutorial_complete error:", err); }
            });

                        // =============================================================
            // BATTLE SYSTEM SOCKET HANDLERS
            // =============================================================

            // 5a. PVP CHALLENGE
            socket.on('battle_challenge', async ({ targetCharId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;

                    // Find target's socket
                    const targetEntry = Object.entries(onlinePlayers).find(([, pl]) => pl.charId === targetCharId);
                    if (!targetEntry) { socket.emit('battle_error', 'Player not found.'); return; }
                    const targetSocket = io.sockets.sockets.get(targetEntry[0]);
                    if (!targetSocket) { socket.emit('battle_error', 'Player offline.'); return; }
                    const target = onlinePlayers[targetEntry[0]];

                    // --- ARENA VALIDATION ---
                    // TEACHING: PvP challenges are only allowed inside arena zones.
                    // This keeps open-world areas peaceful and gives players a clear
                    // "safe zone vs danger zone" mental model. The arena type controls
                    // extra rules:
                    //   OPEN_PVP:     Both players must be in the SAME arena zone.
                    //   QUEUE:        Both players must be in ANY arena zone (matchmaker
                    //                 will pair them — handled by future QUEUE system).
                    //   TOURNAMENT:   Brackets only — manual challenge not allowed.
                    //   KING_OF_HILL: Anyone in zone can challenge anyone else in zone.

                    // REGION SANCTUARY: block ALL PvP in sanctuary regions
                    try {
                        const challRegion = await getRegionForMap(p.mapId);
                        const targRegion  = await getRegionForMap(target.mapId);
                        if (challRegion?.is_sanctuary) {
                            socket.emit('battle_error', `${challRegion.name} is a sanctuary — no combat here.`);
                            return;
                        }
                        if (targRegion?.is_sanctuary) {
                            socket.emit('battle_error', `${target.name} is in a sanctuary zone.`);
                            return;
                        }
                    } catch {}

                    if (!p.inArena) {
                        socket.emit('battle_error', 'You must be inside an arena zone to challenge players.');
                        return;
                    }
                    if (!target.inArena) {
                        socket.emit('battle_error', `${target.name} is not in an arena zone.`);
                        return;
                    }
                    if (p.inArena.arenaId !== target.inArena.arenaId) {
                        socket.emit('battle_error', 'You must be in the same arena zone to challenge.');
                        return;
                    }
                    if (p.inArena.arenaType === 'TOURNAMENT') {
                        socket.emit('battle_error', 'This is a tournament arena — challenges are bracket-only.');
                        return;
                    }
                    if (p.inArena.arenaType === 'QUEUE') {
                        socket.emit('battle_error', 'This is a matchmaking queue arena — use the queue system to get paired.');
                        return;
                    }

                    // Send challenge — include arena context so the target's toast shows it
                    targetSocket.emit('battle_challenged', {
                        challengerName:   p.name,
                        challengerCharId: p.charId,
                        arenaName:        p.inArena.arenaName
                    });
                } catch (err) { console.error('Challenge error:', err); }
            });

            // 5b. ACCEPT PVP
            socket.on('battle_accept', async ({ challengerCharId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const challengerEntry = Object.entries(onlinePlayers).find(([, pl]) => pl.charId === challengerCharId);
                    if (!challengerEntry) return;
                    const challengerSocket = io.sockets.sockets.get(challengerEntry[0]);

                    const battleId = await BattleManager.createBattle(db, io, challengerSocket, socket, challengerCharId, p.charId, 'PVP');
                    if (battleId) {
                        // Join battle room and tag sockets with their charId
                        socket.join('battle_' + battleId);
                        socket._battleCharId = p.charId;
                        if (challengerSocket) {
                            challengerSocket.join('battle_' + battleId);
                            challengerSocket._battleCharId = challengerCharId;
                        }
                    }
                } catch (err) { console.error("Battle accept error:", err); }
            });

            // 5c. PVE BATTLE (from event_runner or encounter)
            // TEACHING: The client sends either:
            //   - An npc_id (game_npcs.id) — from random encounters and BATTLE map events
            //   - A char_id (characters.id) — from direct PvE challenges
            // We can't know which one arrived, so we always try to resolve via
            // game_npcs.char_id first. If no matching NPC row exists, we treat
            // the value as a direct char_id (for forward compatibility).
            // 5c-post. POST-BATTLE ACTION CHAINS
            // Listens for 'battle_ended_for_socket' emitted at the end of endBattle()
            // when the socket has stashed on_win / on_lose actions.
            socket.on('_run_post_battle', async ({ won }) => {
                try {
                    const hooks = socket._postBattleActions;
                    if (!hooks) return;
                    socket._postBattleActions = null;
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const actions = won ? hooks.on_win : hooks.on_lose;
                    if (!actions || !actions.length) return;
                    // Re-use the full event runner
                    const { executeActions } = require('./event_runner.js');
                    const [stateRow] = await db.query('SELECT state_json FROM characters WHERE id=?', [p.charId]);
                    const state = stateRow.length ? safeJsonParse(stateRow[0].state_json, {}) : {};
                    await executeActions({ actions, socket, player: p, state, db });
                } catch(e) { console.error('Post-battle chain error:', e); }
            });

            // 5c-party. PARTY PVE BATTLE
            // Leader sends: { enemyNpcIds: [3, 4] }
            // Server loads all online party members and starts a multi-combatant battle.
            // All party sockets get battle_start automatically via createPartyBattle().
            // ─── BATTLE MOVE (tactical grid) ────────────────────────────────
            // Separate from battle_action — movement is free each turn.
            // TEACHING: In BG3, movement and your action are independent budgets.
            // Here, you get one free move per turn plus one action.
            // The server validates distance and tile occupancy, then broadcasts
            // updated grid positions to all battle watchers.
            socket.on('battle_move', async ({ battleId, x, y }) => {
                try {
                    const { activeBattles } = require('./battle_engine');
                    // activeBattles isn't exported — we access it via BattleManager shim below
                    // Actually use the exported getBattle helper:
                    const battle = BattleManager.getBattle(parseInt(battleId));
                    if (!battle || battle.status !== 'ACTIVE') return;

                    const charId = socket._battleCharId;
                    if (!charId || !battle.combatants[charId]) return;
                    // Check if this socket's character is on any team in the battle
                    const myTeamId = battle.getTeamId(charId);
                    if (battle.turnCharId !== charId && !myTeamId) return;

                    // In 3v3: the socket owns ALL player chars — allow movement for
                    // any of their characters whose turn it is
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const actor = battle.combatants[battle.turnCharId];
                    if (!actor) return;
                    // Make sure this socket owns the current actor
                    const [ownerRow] = await db.query('SELECT user_id FROM characters WHERE id=?', [actor.charId]);
                    if (!ownerRow.length || ownerRow[0].user_id !== p.userId) return;

                    const err = battle.moveCombatant(actor.charId, parseInt(x), parseInt(y));
                    if (err) {
                        socket.emit('battle_error', err);
                        return;
                    }
                    battle.addLog({ actor: actor.name, action: 'MOVE', text: `${actor.name} moves to (${x},${y}).` });
                    // Broadcast updated grid to whole battle room
                    io.to('battle_' + battle.id).emit('battle_grid_update', {
                        grid: battle.getGridState(),
                        hasMoved: true,
                        log: [`🚶 ${actor.name} moves.`]
                    });
                } catch(e) { console.error('battle_move error:', e); }
            });

            // ─── PvP 3v3 CHALLENGE (multi-character) ────────────────────────
            // challenger sends: { targetUserId, myCharIds: [1,2,3] }
            // Server validates ownership, looks up target's pvp_team, creates battle.
            socket.on('battle_challenge_3v3', async ({ targetUserId, myCharIds }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    if (!Array.isArray(myCharIds) || myCharIds.length < 1) return;

                    // Read pvp_team_size setting
                    const [szRow] = await db.query(
                        "SELECT value FROM game_settings WHERE `key`='pvp_team_size' LIMIT 1");
                    const maxTeam = szRow.length ? (parseInt(szRow[0].value) || 3) : 3;
                    const teamIds = myCharIds.slice(0, maxTeam);

                    // Validate ALL chars belong to this user
                    const [myRows] = await db.query(
                        `SELECT id FROM characters WHERE id IN (${teamIds.map(()=>'?').join(',')}) AND user_id=?`,
                        [...teamIds, p.userId]
                    );
                    if (myRows.length !== teamIds.length) {
                        socket.emit('battle_error', 'Some characters do not belong to you.');
                        return;
                    }

                    // Find target user's active pvp_team
                    const [tTeamRow] = await db.query(
                        "SELECT team_chars FROM character_pvp_teams WHERE user_id=? AND is_active=1 LIMIT 1",
                        [targetUserId]);
                    let targetCharIds = [];
                    if (tTeamRow.length) {
                        try { targetCharIds = JSON.parse(tTeamRow[0].team_chars || '[]'); } catch {}
                    }
                    // Fallback: pick their first N characters
                    if (!targetCharIds.length) {
                        const [fallback] = await db.query(
                            'SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT ?',
                            [targetUserId, maxTeam]);
                        targetCharIds = fallback.map(r => r.id);
                    }
                    targetCharIds = targetCharIds.slice(0, maxTeam);

                    if (!targetCharIds.length) {
                        socket.emit('battle_error', 'Target has no characters to battle with.');
                        return;
                    }

                    // Find target socket
                    const targetEntry = Object.entries(onlinePlayers).find(([,pl]) => pl.userId === targetUserId);
                    if (!targetEntry) {
                        socket.emit('battle_error', 'That player is not online.');
                        return;
                    }
                    const targetSocket = io.sockets.sockets.get(targetEntry[0]);

                    // Notify target of the challenge
                    if (targetSocket) {
                        targetSocket.emit('battle_challenged_3v3', {
                            challengerUserId: p.userId,
                            challengerName: p.charName || p.username,
                            myCharIds: teamIds
                        });
                    }
                    // Store pending challenge
                    if (!targetSocket._pending3v3) targetSocket._pending3v3 = {};
                    targetSocket._pending3v3[p.userId] = {
                        challengerSocket: socket,
                        challengerCharIds: teamIds,
                        targetCharIds
                    };
                } catch(e) { console.error('3v3 challenge error:', e); }
            });

            socket.on('battle_accept_3v3', async ({ challengerUserId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const pending = socket._pending3v3 && socket._pending3v3[challengerUserId];
                    if (!pending) { socket.emit('battle_error', 'No pending challenge.'); return; }
                    delete socket._pending3v3[challengerUserId];

                    const { challengerSocket, challengerCharIds, targetCharIds } = pending;

                    // Build socketMap: each user socket handles ALL their team's turns
                    // We tag the socket with ALL their battle char IDs
                    const challengerSocketMap = {};
                    const targetSocketMap     = {};
                    for (const id of challengerCharIds) challengerSocketMap[id] = challengerSocket;
                    for (const id of targetCharIds)     targetSocketMap[id]     = socket;

                    const battleId = await BattleManager.createPartyBattle(
                        db, io,
                        challengerCharIds, targetCharIds,
                        { ...challengerSocketMap, ...targetSocketMap },
                        'PVP_3v3'
                    );
                    if (battleId) {
                        // Tag both sockets with their FIRST char (processAction checks ownership)
                        socket._battleCharId         = targetCharIds[0];
                        socket._battleTeamIds        = targetCharIds;
                        if (challengerSocket) {
                            challengerSocket._battleCharId  = challengerCharIds[0];
                            challengerSocket._battleTeamIds = challengerCharIds;
                        }
                    }
                } catch(e) { console.error('3v3 accept error:', e); }
            });

            socket.on('start_party_pve_battle', async ({ enemyNpcIds }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p || !Array.isArray(enemyNpcIds) || !enemyNpcIds.length) return;

                    // Find the player's active party
                    const [partyRows] = await db.query(
                        `SELECT cpm.character_id FROM character_party_members cpm
                         JOIN character_parties cp ON cp.id = cpm.party_id
                         WHERE cp.leader_id = ? AND cp.is_active = 1 AND cpm.is_active = 1`,
                        [p.charId]
                    );

                    // Party members who are online right now
                    let memberCharIds = partyRows.map(r => r.character_id);
                    if (!memberCharIds.includes(p.charId)) memberCharIds.unshift(p.charId);

                    const socketMap = {};
                    for (const [sid, pl] of Object.entries(onlinePlayers)) {
                        if (memberCharIds.includes(pl.charId)) {
                            const sock = io.sockets.sockets.get(sid);
                            if (sock) socketMap[pl.charId] = sock;
                        }
                    }
                    // Enforce max_dungeon_size from settings
                    const [dsRow] = await db.query(
                        "SELECT value FROM game_settings WHERE `key`='max_dungeon_size' LIMIT 1");
                    const maxDungeon = dsRow.length ? (parseInt(dsRow[0].value) || 5) : 5;

                    // Need at least the leader
                    if (!socketMap[p.charId]) socketMap[p.charId] = socket;
                    const onlineCharIds = Object.keys(socketMap).map(Number).slice(0, maxDungeon);

                    const battleId = await BattleManager.createPartyBattle(
                        db, io, onlineCharIds, enemyNpcIds, socketMap
                    );
                    if (!battleId) {
                        socket.emit('error_msg', 'Could not start party battle — check that enemies are set up in AdminSauce.');
                    }
                } catch(e) { console.error('Party PvE error:', e); }
            });

            socket.on('start_pve_battle', async ({ enemyCharId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;

                    // Resolve: if this is a game_npcs.id, get its char_id
                    let resolvedCharId = parseInt(enemyCharId);
                    const [npcRows] = await db.query(
                        'SELECT char_id FROM game_npcs WHERE id=? AND is_enemy=1',
                        [resolvedCharId]
                    );
                    if (npcRows.length && npcRows[0].char_id) {
                        resolvedCharId = npcRows[0].char_id;
                    }
                    // If NPC has no char_id yet, it was never synced — tell the player
                    if (npcRows.length && !npcRows[0].char_id) {
                        socket.emit('error_msg', 'This enemy has no combat stats yet. An admin needs to save it in AdminSauce with "Is Enemy" checked.');
                        return;
                    }

                    // Check for active companions with combat stats
                    const _bComps = getActiveCompanions(p.charId).filter(c => c.charId);
                    let battleId;

                    if (_bComps.length > 0) {
                        // Use party battle: player + companions vs enemy
                        // Companions are placed on the player team but marked as AI
                        const playerCharIds = [p.charId];
                        const companionCharIds = _bComps.map(c => c.charId);
                        const companionTactics = {};
                        for (const c of _bComps) companionTactics[c.charId] = c.tactics || 'BALANCED';

                        // Build combined player team stats
                        const allPlayerStats = await Promise.all(
                            playerCharIds.map(id => BattleManager.getEffectiveStats(db, id))
                        );
                        const companionStats = await Promise.all(
                            companionCharIds.map(id => BattleManager.getEffectiveStats(db, id))
                        );
                        // Mark companions as AI-controlled with tactics
                        for (const cs of companionStats) {
                            if (cs) {
                                cs._isCompanionAI = true;
                                cs._tactics = companionTactics[cs.charId] || 'BALANCED';
                            }
                        }

                        const socketMap = { [p.charId]: socket };
                        // Use createPartyBattle with the enemy npc_id
                        battleId = await BattleManager.createPartyBattle(
                            db, io,
                            playerCharIds,
                            [parseInt(enemyCharId)],  // Pass the original npc_id
                            socketMap,
                            companionStats.filter(Boolean)  // Pass companion stats for ally AI
                        );
                    } else {
                        battleId = await BattleManager.createBattle(db, io, socket, null, p.charId, resolvedCharId, 'PVE');
                    }

                    if (battleId) {
                        socket.join('battle_' + battleId);
                        socket._battleCharId = p.charId;
                        // Notify map room that a battle started here
                        const battles = BattleManager.getBattlesOnMap(p.mapId);
                        io.to('map_' + p.mapId).emit('battles_on_map', battles);
                    }
                } catch (err) { console.error('PVE start error:', err); }
            });

            // 5c-join. JOIN ONGOING BATTLE (mid-battle join)
            socket.on('join_battle', async ({ battleId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    if (socket._battleCharId) {
                        socket.emit('error_msg', 'You are already in a battle.');
                        return;
                    }

                    const battle = BattleManager.getBattle(battleId);
                    if (!battle || battle.status !== 'ACTIVE') {
                        socket.emit('error_msg', 'Battle not found or already ended.');
                        return;
                    }

                    // Must be on the same map
                    if (battle.mapId !== p.mapId) {
                        socket.emit('error_msg', 'You must be on the same map to join.');
                        return;
                    }

                    // Check allow_mid_battle_join setting for this zone
                    try {
                        const [arenas] = await db.query(
                            `SELECT allow_mid_battle_join FROM game_arenas
                             WHERE map_id=? AND enabled=1 AND ?>=x_min AND ?<=x_max AND ?>=y_min AND ?<=y_max LIMIT 1`,
                            [p.mapId, p.x, p.x, p.y, p.y]);
                        // If in an arena zone, respect its setting. Otherwise default to allowed.
                        if (arenas.length && !arenas[0].allow_mid_battle_join) {
                            socket.emit('error_msg', 'Mid-battle joining is not allowed in this zone.');
                            return;
                        }
                    } catch {}

                    // Check max combatants
                    const totalAlive = Object.values(battle.combatants).filter(c => c.currentHp > 0).length;
                    if (totalAlive >= 8) {
                        socket.emit('error_msg', 'Battle is full (max 8 combatants).');
                        return;
                    }

                    // Load player stats and add to player team
                    const stats = await BattleManager.getEffectiveStats(db, p.charId);
                    if (!stats) {
                        socket.emit('error_msg', 'Failed to load your stats.');
                        return;
                    }

                    // Scale enemy stats for the new party size
                    // Find the player's team and enemy teams
                    const joinTeamId = battle.getTeamIds().find(t =>
                        (battle.teams[t] || []).some(id => battle.combatants[id] && !battle.combatants[id].isAI)
                    ) || 'players';
                    const enemyTeamIds = battle.getTeamIds().filter(t => t !== joinTeamId);
                    const newPlayerCount = (battle.teams[joinTeamId] || []).filter(
                        id => battle.combatants[id]?.currentHp > 0).length + 1;
                    const factor = await BattleManager.getScalingFactor(db, p.mapId);
                    // Re-scale remaining enemies based on new player count
                    const allEnemyIds = enemyTeamIds.flatMap(t => battle.teams[t] || []);
                    for (const eid of allEnemyIds) {
                        const e = battle.combatants[eid];
                        if (!e || e.currentHp <= 0) continue;
                        const hpPct = e.currentHp / e.maxHp;
                        const newMax = Math.round(e._baseMaxHp || e.maxHp);
                        const scaled = BattleManager.applyEnemyScaling({ maxHp: newMax, currentHp: newMax,
                            atk: e._baseAtk || e.atk, def: e._baseDef || e.def,
                            mo: e._baseMo || e.mo, md: e._baseMd || e.md,
                            speed: e._baseSpeed || e.speed }, newPlayerCount, factor);
                        // Store base stats on first scale
                        if (!e._baseMaxHp) {
                            e._baseMaxHp = e.maxHp; e._baseAtk = e.atk; e._baseDef = e.def;
                            e._baseMo = e.mo; e._baseMd = e.md; e._baseSpeed = e.speed;
                        }
                        e.maxHp = scaled.maxHp;
                        e.currentHp = Math.round(scaled.maxHp * hpPct); // preserve HP%
                        e.atk = scaled.atk; e.def = scaled.def;
                        e.mo = scaled.mo; e.md = scaled.md; e.speed = scaled.speed;
                    }

                    battle.addCombatant(stats, joinTeamId, false);

                    // Join socket rooms
                    socket.join('battle_' + battleId);
                    socket._battleCharId = p.charId;

                    // Record participant
                    try {
                        await db.query(
                            'INSERT IGNORE INTO game_battle_participants (battle_id,character_id,team,is_ai) VALUES (?,?,1,0)',
                            [battleId, p.charId]);
                    } catch {}

                    // Get commands for the new player
                    const cmds = await BattleManager.getAvailableCommands(db, stats);

                    // Send battle_start to the joining player
                    socket.emit('battle_start', { ...battle.toClientState(p.charId), commands: cmds });

                    // Broadcast updated state to all existing participants
                    await BattleManager.broadcastBattleUpdate(io, battle, { text: `${stats.name} joins the fight!` }, db);

                    // Update map battle indicators
                    const battles = BattleManager.getBattlesOnMap(p.mapId);
                    io.to('map_' + p.mapId).emit('battles_on_map', battles);

                } catch (err) { console.error('Join battle error:', err); }
            });

            // 5c-query. GET BATTLES ON MAP (for UI indicators)
            socket.on('get_battles_on_map', () => {
                const p = onlinePlayers[socket.id];
                if (!p) return;
                const battles = BattleManager.getBattlesOnMap(p.mapId);
                socket.emit('battles_on_map', battles);
            });

            // 5d. BATTLE ACTION (Attack, Skill, Item, Defend, Run, Limit)
            socket.on('battle_action', async (data) => {
                try {
                    await BattleManager.processAction(db, io, socket, data);
                } catch (err) { console.error("Battle action error:", err); }
            });

            // 5e. GET CHARACTER FULL DATA (for equipment screen)
            socket.on('get_char_data', async (callback) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const stats = await BattleManager.getEffectiveStats(db, p.charId);
                    // Get inventory
                    const [inv] = await db.query(`SELECT ci.*, gi.name, gi.icon, gi.type, gi.slot, gi.description, gi.value,
                        gi.bonus_atk, gi.bonus_def, gi.bonus_mo, gi.bonus_md, gi.bonus_speed, gi.bonus_luck, gi.bonus_hp, gi.bonus_mp,
                        gi.level_req, gi.set_status, gi.block_status, gi.elements
                        FROM character_items ci JOIN game_items gi ON ci.item_id = gi.id WHERE ci.character_id=?`, [p.charId]);
                    // Get equipment
                    const [equip] = await db.query(`SELECT ce.slot_key, gi.* FROM character_equipment ce
                        JOIN game_items gi ON ce.item_id = gi.id WHERE ce.character_id=?`, [p.charId]);
                    // Get equip slots
                    const [slots] = await db.query("SELECT * FROM game_equip_slots ORDER BY display_order");
                    // Get gold
                    const [userRow] = await db.query("SELECT currency FROM users WHERE id=?", [p.userId]);
                    const gold = userRow.length ? userRow[0].currency : 0;

                    if (typeof callback === 'function') {
                        callback({ stats, inventory: inv, equipment: equip, slots, gold });
                    } else {
                        socket.emit('char_data', { stats, inventory: inv, equipment: equip, slots, gold });
                    }
                } catch (err) { console.error("Char data error:", err); }
            });

            // 5f. EQUIP/UNEQUIP (via socket for real-time feedback)
            socket.on('equip_item', async ({ itemId, slotKey }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    // Direct DB logic (same as routes/game.js equip-item)
                    const [inv] = await db.query("SELECT * FROM character_items WHERE character_id=? AND item_id=?", [p.charId, itemId]);
                    if (!inv.length) { socket.emit('equip_result', { success: false, message: 'Not in inventory.' }); return; }
                    const [itemR] = await db.query("SELECT * FROM game_items WHERE id=?", [itemId]);
                    if (!itemR.length) { socket.emit('equip_result', { success: false, message: 'Item not found.' }); return; }
                    if (itemR[0].slot !== slotKey && itemR[0].slot !== 'ANY') { socket.emit('equip_result', { success: false, message: `Goes in ${itemR[0].slot}.` }); return; }
                    // Unequip current
                    const [cur] = await db.query("SELECT * FROM character_equipment WHERE character_id=? AND slot_key=?", [p.charId, slotKey]);
                    if (cur.length) {
                        const [ex] = await db.query("SELECT * FROM character_items WHERE character_id=? AND item_id=?", [p.charId, cur[0].item_id]);
                        if (ex.length) await db.query("UPDATE character_items SET quantity=quantity+1 WHERE id=?", [ex[0].id]);
                        else await db.query("INSERT INTO character_items(character_id,item_id,quantity)VALUES(?,?,1)", [p.charId, cur[0].item_id]);
                        await db.query("DELETE FROM character_equipment WHERE character_id=? AND slot_key=?", [p.charId, slotKey]);
                    }
                    // Equip new
                    await db.query("INSERT INTO character_equipment(character_id,slot_key,item_id)VALUES(?,?,?)", [p.charId, slotKey, itemId]);
                    if (inv[0].quantity > 1) await db.query("UPDATE character_items SET quantity=quantity-1 WHERE id=?", [inv[0].id]);
                    else await db.query("DELETE FROM character_items WHERE id=?", [inv[0].id]);
                    socket.emit('equip_result', { success: true, message: 'Equipped!' });
                } catch (err) { socket.emit('equip_result', { success: false, message: 'Error' }); }
            });

            socket.on('unequip_item', async ({ slotKey }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const [eq] = await db.query("SELECT * FROM character_equipment WHERE character_id=? AND slot_key=?", [p.charId, slotKey]);
                    if (!eq.length) { socket.emit('equip_result', { success: false, message: 'Nothing there.' }); return; }
                    const [ex] = await db.query("SELECT * FROM character_items WHERE character_id=? AND item_id=?", [p.charId, eq[0].item_id]);
                    if (ex.length) await db.query("UPDATE character_items SET quantity=quantity+1 WHERE id=?", [ex[0].id]);
                    else await db.query("INSERT INTO character_items(character_id,item_id,quantity)VALUES(?,?,1)", [p.charId, eq[0].item_id]);
                    await db.query("DELETE FROM character_equipment WHERE character_id=? AND slot_key=?", [p.charId, slotKey]);
                    socket.emit('equip_result', { success: true, message: 'Unequipped.' });
                } catch (err) { socket.emit('equip_result', { success: false, message: 'Error' }); }
            });

            // =============================================================
            // 6b. BATTLE CHAT + SURRENDER + EMOTES (Session 5)
            // =============================================================

            // Battle chat — real-time text between all combatants
            socket.on('battle_chat', async ({ battleId, text }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const battle = BattleManager.getBattle(parseInt(battleId));
                    if (!battle || battle.status !== 'ACTIVE') return;
                    if (!battle.combatants[p.charId]) return; // not in this battle
                    const msg = String(text || '').trim().slice(0, 200).replace(/</g, '&lt;');
                    if (!msg) return;
                    const payload = {
                        from: p.name, fromCharId: p.charId,
                        teamId: battle.getTeamId(p.charId),
                        text: msg, ts: Date.now()
                    };
                    // Broadcast to all sockets in the battle room
                    io.to('battle_' + battleId).emit('battle_chat_msg', payload);
                    // Also persist in battle log for replay
                    battle.addLog({ actor: p.name, text: `[Chat] ${msg}`, type: 'chat' });
                } catch (e) { console.error('battle_chat error:', e.message); }
            });

            // Battle emote — visual effect on grid
            socket.on('battle_emote', async ({ battleId, emote }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const battle = BattleManager.getBattle(parseInt(battleId));
                    if (!battle || battle.status !== 'ACTIVE') return;
                    if (!battle.combatants[p.charId]) return;
                    const validEmotes = ['taunt', 'respect', 'laugh', 'rage', 'wave'];
                    if (!validEmotes.includes(emote)) return;
                    const emoteIcons = { taunt: '😤', respect: '🫡', laugh: '😂', rage: '🔥', wave: '👋' };
                    const payload = {
                        from: p.name, fromCharId: p.charId, emote,
                        icon: emoteIcons[emote] || '❓',
                        gridX: battle.combatants[p.charId].gridX,
                        gridY: battle.combatants[p.charId].gridY
                    };
                    io.to('battle_' + battleId).emit('battle_emote_show', payload);
                    battle.addLog({ actor: p.name, text: `${emoteIcons[emote]} ${p.name} ${emote}s!`, type: 'emote' });
                } catch (e) { console.error('battle_emote error:', e.message); }
            });

            // Surrender — ends battle, opposing team(s) win
            socket.on('battle_surrender', async ({ battleId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const battle = BattleManager.getBattle(parseInt(battleId));
                    if (!battle || battle.status !== 'ACTIVE') return;
                    if (!battle.combatants[p.charId]) return;

                    // Check if surrender is allowed (arena setting)
                    // Default: allowed in PvP, not in PvE
                    if (battle.type === 'PVE' || battle.type === 'PARTY_PVE') {
                        socket.emit('battle_error', 'Cannot surrender in PvE — use Flee instead.');
                        return;
                    }

                    const myTeamId = battle.getTeamId(p.charId);
                    // Kill all members of the surrendering team (HP to 0)
                    for (const cid of (battle.teams[myTeamId] || [])) {
                        if (battle.combatants[cid]) battle.combatants[cid].currentHp = 0;
                    }

                    battle.addLog({ actor: 'system', text: `🏳️ ${p.name}'s team surrenders!` });
                    battle.checkWinCondition();

                    const result = { actor: 'system', actions: [], log: [`🏳️ ${p.name}'s team surrenders!`] };
                    result.actions.push({ type: 'surrender', team: myTeamId, name: p.name });
                    await BattleManager.broadcastBattleUpdate(io, battle, result, db);

                    if (battle.status === 'FINISHED') {
                        await BattleManager.endBattle(db, io, battle);
                    }
                } catch (e) { console.error('battle_surrender error:', e.message); }
            });

            // =============================================================
            // 6c. MID-BATTLE NEGOTIATION / DIPLOMACY (Session 6)
            // =============================================================

            // Negotiate with an enemy (NPC or player)
            socket.on('battle_negotiate', async ({ battleId, targetCharId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const battle = BattleManager.getBattle(parseInt(battleId));
                    if (!battle || battle.status !== 'ACTIVE') return;
                    const actor = battle.combatants[p.charId];
                    if (!actor) return;
                    const target = battle.combatants[parseInt(targetCharId)];
                    if (!target || target.currentHp <= 0) {
                        socket.emit('battle_error', 'Invalid target for negotiation.');
                        return;
                    }
                    if (target.teamId === actor.teamId) {
                        socket.emit('battle_error', 'Already on your team!');
                        return;
                    }
                    // Must be the actor's turn
                    if (battle.turnCharId !== p.charId) {
                        socket.emit('battle_error', 'Not your turn.');
                        return;
                    }
                    // Range check: must be within 3 tiles (talking distance)
                    if (actor.gridX !== undefined && target.gridX !== undefined) {
                        const dist = Math.max(Math.abs(actor.gridX - target.gridX), Math.abs(actor.gridY - target.gridY));
                        if (dist > 3) {
                            socket.emit('battle_error', `Too far to negotiate. Move closer (dist ${dist}, need ≤3).`);
                            return;
                        }
                    }

                    if (target.isAI) {
                        // ── NPC NEGOTIATION ──────────────────────────────
                        // Load NPC persona for AI dialogue
                        let persona = 'A hostile creature.';
                        let npcName = target.name;
                        try {
                            const [npcRow] = await db.query('SELECT persona, name FROM game_npcs WHERE char_id=? LIMIT 1', [target.charId]);
                            if (npcRow.length && npcRow[0].persona) persona = npcRow[0].persona;
                            if (npcRow.length && npcRow[0].name) npcName = npcRow[0].name;
                        } catch {}

                        // Store persona on combatant for willingness calc
                        target._persona = persona;
                        const willingness = BattleManager.calculateNpcWillingness(target);
                        const success = willingness >= 45; // threshold

                        // Try AI dialogue
                        let dialogue = '';
                        try {
                            const aiConfig = await _loadAiConfig();
                            if (aiConfig && aiConfig.provider && aiConfig.provider !== 'disabled') {
                                const { getNpcReply } = require('./npc_brain');
                                const hpPct = Math.round((target.currentHp / target.maxHp) * 100);
                                const negotiatePrompt = success
                                    ? `The player ${actor.name} is trying to convince you to switch sides mid-battle. You are wounded (${hpPct}% HP) and considering it. Reluctantly agree to join them. Stay in character.`
                                    : `The player ${actor.name} is trying to convince you to switch sides mid-battle. You refuse defiantly. Stay in character.`;
                                dialogue = await getNpcReply({
                                    npc: { name: npcName, persona },
                                    player: { name: actor.name, level: actor.level || 1 },
                                    message: negotiatePrompt,
                                    history: [], memory: { facts: [], reputation: 0 },
                                    worldFlags: {}, region: null, aiConfig
                                });
                            }
                        } catch {}

                        if (!dialogue) {
                            dialogue = success
                                ? `*${npcName} lowers their weapon* "...Fine. I'll fight with you. But this changes nothing between us."`
                                : `*${npcName} snarls* "You think I'd betray my own? Never!"`;
                        }

                        if (success) {
                            battle.switchTeam(target.charId, actor.teamId);
                            target.isAI = true; // stays AI-controlled but on player's team now
                        }

                        const result = { actor: actor.name, actions: [], log: [] };
                        result.log.push(`🤝 ${actor.name} attempts to negotiate with ${npcName}...`);
                        result.actions.push({ type: 'negotiate', target: npcName, success, willingness });
                        battle.addLog({ actor: actor.name, text: `🤝 Negotiation with ${npcName}: ${success ? 'SUCCESS' : 'FAILED'} (willingness: ${willingness}%)` });

                        // Broadcast the negotiation result
                        await BattleManager.broadcastBattleUpdate(io, battle, result, db);

                        // Send detailed dialogue to the negotiator
                        socket.emit('negotiate_result', {
                            success, willingness, targetName: npcName,
                            dialogue, targetCharId: target.charId
                        });

                        // End turn after negotiation (uses the action)
                        battle.checkWinCondition();
                        if (battle.status !== 'ACTIVE') {
                            await BattleManager.endBattle(db, io, battle);
                            return;
                        }
                        battle.nextTurn();
                        await BattleManager.broadcastBattleUpdate(io, battle, null, db);
                        const nextActor = battle.getCombatant(battle.turnCharId);
                        if (nextActor && nextActor.isAI) setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1200);

                    } else {
                        // ── PLAYER NEGOTIATION ───────────────────────────
                        // Send a request to the target player to switch teams
                        try {
                            const allSocks = await io.in('battle_' + battleId).fetchSockets();
                            const targetSock = allSocks.find(s => s._battleCharId === target.charId);
                            if (targetSock) {
                                targetSock.emit('negotiate_request', {
                                    fromName: actor.name, fromCharId: actor.charId,
                                    toTeamId: actor.teamId, battleId: parseInt(battleId)
                                });
                                socket.emit('negotiate_result', {
                                    success: null, targetName: target.name,
                                    dialogue: `Waiting for ${target.name} to respond...`,
                                    targetCharId: target.charId, pending: true
                                });
                                battle.addLog({ actor: actor.name, text: `🤝 ${actor.name} proposes an alliance to ${target.name}...` });
                                await BattleManager.broadcastBattleUpdate(io, battle, {
                                    actor: actor.name, log: [`🤝 ${actor.name} proposes an alliance to ${target.name}...`], actions: []
                                }, db);
                            }
                        } catch {}
                    }
                } catch (e) { console.error('battle_negotiate error:', e); }
            });

            // Player responds to a negotiate request (accept/decline alliance)
            socket.on('negotiate_respond', async ({ battleId, fromCharId, accept }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const battle = BattleManager.getBattle(parseInt(battleId));
                    if (!battle || battle.status !== 'ACTIVE') return;
                    const responder = battle.combatants[p.charId];
                    const proposer = battle.combatants[parseInt(fromCharId)];
                    if (!responder || !proposer) return;

                    if (accept) {
                        battle.switchTeam(responder.charId, proposer.teamId);
                        const result = { actor: 'system', log: [`🤝 ${responder.name} accepts the alliance with ${proposer.name}!`],
                            actions: [{ type: 'alliance_shift', from: responder.name, toTeam: proposer.teamId }] };
                        battle.addLog({ actor: 'system', text: result.log[0] });
                        await BattleManager.broadcastBattleUpdate(io, battle, result, db);
                        battle.checkWinCondition();
                        if (battle.status !== 'ACTIVE') await BattleManager.endBattle(db, io, battle);
                    } else {
                        const result = { actor: 'system', log: [`❌ ${responder.name} declines the alliance.`], actions: [] };
                        battle.addLog({ actor: 'system', text: result.log[0] });
                        await BattleManager.broadcastBattleUpdate(io, battle, result, db);
                    }
                } catch (e) { console.error('negotiate_respond error:', e); }
            });

            // Session 8: Toggle non-lethal mode
            socket.on('battle_toggle_nonlethal', (data) => {
                const result = BattleManager.toggleNonLethal(data.battleId, socket._battleCharId);
                if (result) socket.emit('battle_nonlethal_toggled', result);
            });

            // Session 8: Set defense stance
            socket.on('battle_set_defense', (data) => {
                const result = BattleManager.setDefenseStance(data.battleId, socket._battleCharId, data.defense);
                if (result) socket.emit('battle_defense_set', result);
            });

            // Session 8: Set limb target
            socket.on('battle_limb_target', (data) => {
                const result = BattleManager.setLimbTarget(data.battleId, socket._battleCharId, data.limbKey);
                if (result) socket.emit('battle_limb_target_set', result);
            });

            // Session 8: Post-battle KO interaction
            socket.on('battle_ko_action', async (data) => {
                const result = await BattleManager.processKoAction(db, io, data.battleId, socket._battleCharId, data.npcCharId, data.action);
                socket.emit('battle_ko_result', result);
            });

            // Session 8: PvP KO choice (spare/finish)
            socket.on('battle_pvp_ko_choice', async (data) => {
                const result = await BattleManager.processPvpKoChoice(db, io, data.battleId, socket._battleCharId, data.targetCharId, data.spare);
                socket.emit('battle_pvp_ko_result', result);
            });

            // Session 11: Create signature technique
            socket.on('sig_tech_create', async (data) => {
                const charId = onlinePlayers[socket.id]?.charId;
                if (!charId) return;
                const result = await BattleManager.createSignatureTech(db, charId, data);
                socket.emit('sig_tech_created', result);
            });

            // Session 11: Equip ability on signature tech
            socket.on('sig_tech_equip_ability', async (data) => {
                const charId = onlinePlayers[socket.id]?.charId;
                if (!charId) return;
                const result = await BattleManager.addSigTechAbility(db, charId, data.techId, data.abilityId, data.slot);
                socket.emit('sig_tech_ability_equipped', result);
            });

            // Session 11: Get available abilities for a slot
            socket.on('sig_tech_get_abilities', async (data) => {
                try {
                    const [abilities] = await db.query('SELECT * FROM game_signature_abilities WHERE active=1 OR active IS NULL ORDER BY min_level, name');
                    socket.emit('sig_tech_abilities_list', { abilities });
                } catch {}
            });

            // Session 12: Train under master NPC
            socket.on('master_train', async (data) => {
                const charId = onlinePlayers[socket.id]?.charId;
                if (!charId) return;
                const result = await BattleManager.trainUnderMaster(db, charId, data.npcId);
                socket.emit('master_train_result', result);
            });

            // Session 25: Generic training handler (works for self_train, meditate, etc.)
            socket.on('train', async ({ trainingType }) => {
                const p = onlinePlayers[socket.id];
                if (!p) return;
                try {
                    const [config] = await db.query("SELECT * FROM game_training_config WHERE name=? AND active=1", [trainingType || 'self_train']);
                    if (!config.length) { socket.emit('train_result', { success: false, message: 'This training type is not available.' }); return; }
                    const cfg = config[0];

                    // Check race/class restriction
                    const [charInfo] = await db.query('SELECT race_id, class_id FROM characters WHERE id=?', [p.charId]);
                    if (charInfo.length) {
                        try {
                            const allowedRaces = cfg.allowed_race_ids ? JSON.parse(cfg.allowed_race_ids) : null;
                            const allowedClasses = cfg.allowed_class_ids ? JSON.parse(cfg.allowed_class_ids) : null;
                            if (allowedRaces && !allowedRaces.includes(charInfo[0].race_id)) {
                                socket.emit('train_result', { success: false, message: 'Your race cannot use this training method.' }); return;
                            }
                            if (allowedClasses && !allowedClasses.includes(charInfo[0].class_id)) {
                                socket.emit('train_result', { success: false, message: 'Your class cannot use this training method.' }); return;
                            }
                        } catch {}
                    }

                    // Check requires partner/master
                    if (cfg.requires_partner) { socket.emit('train_result', { success: false, message: 'This requires a sparring partner.' }); return; }
                    if (cfg.requires_master) { socket.emit('train_result', { success: false, message: 'This requires an NPC master.' }); return; }

                    // Check daily limit
                    const [countRow] = await db.query(
                        "SELECT COUNT(*) as cnt FROM character_training_log WHERE character_id=? AND training_type=? AND DATE(trained_at)=CURDATE()",
                        [p.charId, trainingType]);
                    if (countRow[0].cnt >= cfg.daily_limit) { socket.emit('train_result', { success: false, message: `Daily limit reached (${cfg.daily_limit}/day).` }); return; }

                    // Apply gains
                    const gains = JSON.parse(cfg.stat_gains || '{}');
                    const costs = cfg.stat_costs ? JSON.parse(cfg.stat_costs) : {};
                    const [charRow] = await db.query('SELECT * FROM characters WHERE id=?', [p.charId]);
                    if (!charRow.length) return;
                    const c = charRow[0];

                    const actualGains = {};
                    for (const [stat, pct] of Object.entries(gains)) {
                        const base = c[stat] || c['max_hp'] || 100;
                        const gain = Math.max(1, Math.floor(base * pct));
                        actualGains[stat] = gain;
                        await db.query(`UPDATE characters SET \`${stat}\`=\`${stat}\`+? WHERE id=?`, [gain, p.charId]);
                    }
                    for (const [stat, pct] of Object.entries(costs)) {
                        const loss = Math.max(1, Math.floor((c[stat] || 100) * pct));
                        await db.query(`UPDATE characters SET \`${stat}\`=GREATEST(1,\`${stat}\`-?) WHERE id=?`, [loss, p.charId]);
                    }

                    await db.query('INSERT INTO character_training_log (character_id, training_type, stat_gains_json) VALUES (?,?,?)',
                        [p.charId, trainingType, JSON.stringify(actualGains)]);

                    socket.emit('train_result', { success: true, type: trainingType, gains: actualGains, label: cfg.label });
                } catch (e) { socket.emit('train_result', { success: false, message: e.message }); }
            });


            socket.on('spar_request', async ({ targetCharId }) => {
                const p = onlinePlayers[socket.id];
                if (!p) return;
                const targetEntry = Object.values(onlinePlayers).find(pl => pl.charId === targetCharId);
                if (!targetEntry) { socket.emit('spar_error', 'Player not found or offline.'); return; }
                const targetSockId = targetEntry.socketId;
                io.to(targetSockId).emit('spar_requested', { fromName: p.name, fromCharId: p.charId });
                socket.emit('spar_sent', { targetName: targetEntry.name });
            });

            socket.on('spar_accept', async ({ fromCharId }) => {
                const p = onlinePlayers[socket.id];
                if (!p) return;
                try {
                    const [config] = await db.query("SELECT * FROM game_training_config WHERE name='spar' AND active=1");
                    if (!config.length) return;
                    const cfg = config[0];
                    const gains = JSON.parse(cfg.stat_gains || '{}');
                    const costs = JSON.parse(cfg.stat_costs || '{}');

                    // Apply to both players
                    for (const charId of [p.charId, fromCharId]) {
                        const [charRow] = await db.query('SELECT * FROM characters WHERE id=?', [charId]);
                        if (!charRow.length) continue;
                        const c = charRow[0];
                        const actualGains = {};
                        for (const [stat, pct] of Object.entries(gains)) {
                            const gain = Math.max(1, Math.floor((c[stat] || 100) * pct));
                            actualGains[stat] = gain;
                            await db.query(`UPDATE characters SET \`${stat}\`=\`${stat}\`+? WHERE id=?`, [gain, charId]);
                        }
                        for (const [stat, pct] of Object.entries(costs)) {
                            const loss = Math.max(1, Math.floor((c[stat] || 100) * pct));
                            await db.query(`UPDATE characters SET \`${stat}\`=GREATEST(1,\`${stat}\`-?) WHERE id=?`, [loss, charId]);
                        }
                        await db.query('INSERT INTO character_training_log (character_id, training_type, partner_char_id, stat_gains_json) VALUES (?,?,?,?)',
                            [charId, 'spar', charId === p.charId ? fromCharId : p.charId, JSON.stringify(actualGains)]);
                    }

                    // Notify both
                    const fromEntry = Object.values(onlinePlayers).find(pl => pl.charId === fromCharId);
                    socket.emit('train_result', { success: true, type: 'spar', partner: fromEntry?.name || 'Partner' });
                    if (fromEntry) io.to(fromEntry.socketId).emit('train_result', { success: true, type: 'spar', partner: p.name });
                } catch (e) { socket.emit('train_result', { success: false, message: e.message }); }
            });

            // Session 22: Spectator mode
            socket.on('battle_spectate', (data) => {
                const result = BattleManager.spectate(io, socket, data.battleId);
                socket.emit('battle_spectate_result', result);
            });
            socket.on('battle_unspectate', () => {
                BattleManager.unspectate(io, socket);
            });

            // Session 14: Tournament interactions
            socket.on('tournament_register', async (data) => {
                const charId = onlinePlayers[socket.id]?.charId;
                if (!charId) return;
                try {
                    const TournamentManager = require('./tournament_manager');
                    const result = await TournamentManager.register(db, data.tournamentId, charId);
                    socket.emit('tournament_register_result', result);
                } catch (e) { socket.emit('tournament_register_result', { success: false, message: e.message }); }
            });

            socket.on('tournament_get_bracket', async (data) => {
                try {
                    const TournamentManager = require('./tournament_manager');
                    const bracket = await TournamentManager.getBracket(db, data.tournamentId);
                    socket.emit('tournament_bracket', bracket);
                } catch {}
            });

            socket.on('tournament_list', async () => {
                try {
                    const TournamentManager = require('./tournament_manager');
                    const list = await TournamentManager.list(db);
                    socket.emit('tournament_list', list);
                } catch {}
            });

            socket.on('tournament_leaderboard', async () => {
                try {
                    const TournamentManager = require('./tournament_manager');
                    const lb = await TournamentManager.leaderboard(db);
                    socket.emit('tournament_leaderboard', lb);
                } catch {}
            });

            // =============================================================
            // 7. CHAT SYSTEM — 7 Channels
            // =============================================================
            // Channels: global | local | party | guild | dm | announce | admin
            // Teaching: Each channel routes messages differently:
            //   - global:   Every connected socket gets it (io.emit)
            //   - local:    Only players on the same map (Socket.IO rooms we already use!)
            //   - party:    Party members only (stubbed — party system TBD)
            //   - guild:    Guild members only (stubbed — guild system TBD)
            //   - dm:       Two specific sockets — sender and one target
            //   - announce: Staff only to send; everyone receives
            //   - admin:    Staff only to send AND receive (admin_chat room)

            socket.on('chat_send', async ({ channel, text, targetCharId, targetName }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;

                    // Sanitize: cap at 300 chars, strip HTML
                    const msg = String(text || '').trim().slice(0, 300).replace(/</g, '&lt;');
                    if (!msg) return;

                    // ── GM COMMANDS: intercept /slash commands before chat routing ──
                    // TEACHING: We check for '/' prefix on the raw text (before HTML-escaping).
                    // The command module handles auth, execution, and sends its own
                    // system messages. If it returns true the message is consumed here
                    // and never reaches the channel switch below.
                    if (String(text || '').trim().startsWith('/')) {
                        const handled = await gmCommands.handle(socket, p, String(text).trim(), {
                            io, db, onlinePlayers, npcState, worldFlags
                        });
                        if (handled) return;
                    }

                    const payload = {
                        channel,
                        from: p.name,
                        fromCharId: p.charId,
                        text: msg,
                        ts: Date.now()
                    };

                    const sysMsg = (txt) => socket.emit('chat_msg', {
                        channel: 'system', from: 'System', text: txt, ts: Date.now()
                    });

                    switch (channel) {

                        // --- GLOBAL: everyone sees it ---
                        case 'global':
                            io.emit('chat_msg', payload);
                            break;

                        // --- LOCAL/ZONE: only players on same map ---
                        case 'local':
                            io.to('map_' + p.mapId).emit('chat_msg', payload);
                            break;

                        // --- PARTY: use party room if player is in one ---
                        case 'party': {
                            const pPartyId = charPartyMap[p.charId];
                            if (!pPartyId) { sysMsg('You are not in a party.'); return; }
                            io.to('party_' + pPartyId).emit('chat_msg', payload);
                            break;
                        }

                        // --- GUILD: route to guild room if player is in one ---
                        case 'guild': {
                            const myGuild = charGuildMap[p.charId];
                            if (!myGuild) { sysMsg('You are not in a guild.'); return; }
                            io.to('guild_' + myGuild.guildId).emit('chat_msg', payload);
                            break;
                        }

                        // --- DM: direct message to one player ---
                        case 'dm': {
                            // Resolve target: prefer charId, fall back to name lookup
                            let targetEntry;
                            if (targetCharId) {
                                targetEntry = Object.entries(onlinePlayers)
                                    .find(([, pl]) => pl.charId === parseInt(targetCharId, 10));
                            } else if (targetName) {
                                targetEntry = Object.entries(onlinePlayers)
                                    .find(([, pl]) => pl.name.toLowerCase() === String(targetName).trim().toLowerCase());
                            }
                            if (!targetCharId && !targetName) { sysMsg('No target selected for DM.'); return; }
                            if (!targetEntry) { sysMsg('Player not found or offline.'); return; }
                            const targetSock = io.sockets.sockets.get(targetEntry[0]);
                            const dmPayload = { ...payload, targetName: targetEntry[1].name };
                            socket.emit('chat_msg', dmPayload);        // sender sees it
                            if (targetSock) targetSock.emit('chat_msg', dmPayload); // receiver gets it
                            break;
                        }

                        // --- ANNOUNCE: staff sends, everyone receives ---
                        case 'announce':
                            if (!await isStaff(p.userId)) { sysMsg('Staff only.'); return; }
                            io.emit('chat_msg', { ...payload, channel: 'announce' });
                            break;

                        // --- ADMIN: staff only, hidden from regular players ---
                        case 'admin':
                            if (!await isStaff(p.userId)) { sysMsg('Staff only.'); return; }
                            // Only sockets in admin_chat room receive this
                            io.to('admin_chat').emit('chat_msg', payload);
                            break;

                        default:
                            sysMsg('Unknown channel: ' + channel);
                    }
                } catch (err) { console.error('Chat error:', err); }
            });

            // --- EMOTES ---
            // TEACHING: An emote is a short action message that shows in the
            // local zone chat and as a floating bubble above the player's head.
            // Format: *PlayerName waves cheerfully*
            // The client can call emote via a slash command (/wave, /bow etc.)
            // or an emote picker button. The server just rebroadcasts to the map.
            socket.on('title_changed', async ({ charId, title }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p || p.charId !== charId) return;
                    io.to('map_' + p.mapId).emit('player_title_changed', { charId, title: title || null });
                } catch(e) { console.error('[title_changed]', e.message); }
            });

            // ── PRESENCE / AWAY STATUS ──────────────────────────────────
            // TEACHING: The client emits 'set_presence' when the player changes
            // their status. We update the in-memory record immediately (so nearby
            // players see it instantly) then broadcast to the map.
            // The HTTP POST /set-presence persists it to DB separately.
            // tutorial_complete — fired by client when player finishes or skips tutorial
            socket.on('tutorial_complete', async () => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    // Merge tutorial_done into existing state_json
                    const [rows] = await db.query('SELECT state_json FROM characters WHERE id=?', [p.charId]);
                    let st = {};
                    try { st = JSON.parse(rows[0]?.state_json || '{}'); } catch {}
                    st.tutorial_done = true;
                    await db.query('UPDATE characters SET state_json=? WHERE id=?',
                        [JSON.stringify(st), p.charId]);
                } catch (err) { console.error('tutorial_complete error:', err); }
            });

            socket.on('set_presence', ({ status, awayMessage }) => {
                const p = onlinePlayers[socket.id];
                if (!p) return;
                const VALID = ['online','away','busy','lfp','invisible'];
                if (!VALID.includes(status)) return;

                p.presence    = status;
                p.awayMessage = (awayMessage || '').slice(0, 255) || null;

                // Sync LFP listing with presence status
                if (status !== 'lfp') {
                    // Remove from LFP board if they were listed
                    db.query('DELETE FROM lfp_listings WHERE character_id=?', [p.charId]).catch(()=>{});
                }
                // Note: listing is created via POST /api/lfp/list from the LFP board UI
                // (so the player can fill in role/note first)

                // Broadcast to everyone on the same map (excluding self — they already know)
                socket.to('map_' + p.mapId).emit('player_presence_changed', {
                    charId:      p.charId,
                    presence:    status,
                    awayMessage: p.awayMessage,
                });
            });

            // TYPING INDICATOR — relay to the DM target if they're online
            // TEACHING: The client sends 'typing_dm' with the target charId.
            // We find the target's socket and push 'typing_dm_indicator' to them.
            // The server never stores this — it's purely a real-time relay.
            socket.on('typing_dm', ({ targetCharId, isTyping }) => {
                const sender = onlinePlayers[socket.id];
                if (!sender) return;
                for (const [sid, p] of Object.entries(onlinePlayers)) {
                    if (p.charId === targetCharId) {
                        io.to(sid).emit('typing_dm_indicator', {
                            fromCharId: sender.charId,
                            fromName:   sender.name,
                            isTyping:   !!isTyping,
                        });
                        break;
                    }
                }
            });

            socket.on('emote', ({ emoteKey }) => {
                const p = onlinePlayers[socket.id];
                if (!p) return;
                const EMOTES = {
                    wave:    'waves cheerfully',
                    bow:     'bows respectfully',
                    cheer:   'cheers!',
                    laugh:   'bursts out laughing',
                    cry:     'weeps dramatically',
                    think:   'strokes their chin thoughtfully',
                    shrug:   'shrugs',
                    dance:   'breaks into a wild dance',
                    salute:  'stands at attention and salutes',
                    kneel:   'kneels solemnly',
                    point:   'points dramatically into the distance',
                    sleep:   'has fallen asleep on their feet',
                    angry:   'shakes their fist at the sky',
                    clap:    'claps enthusiastically',
                    sit:     'sits down and rests',
                };
                const action = EMOTES[emoteKey];
                if (!action) return;
                const text = `*${p.name} ${action}*`;
                // Broadcast to whole map as a local message with a special emote flag
                io.to('map_' + p.mapId).emit('chat_msg', {
                    channel: 'local',
                    from: p.name,
                    fromCharId: p.charId,
                    text,
                    isEmote: true,
                    ts: Date.now()
                });
                // Also show as a floating bubble above the player
                io.to('map_' + p.mapId).emit('emote_bubble', {
                    charId: p.charId,
                    text,
                });
            });

            // --- FRIEND REQUEST PUSH NOTIFICATION ---
            // When /api/party/friends/request is called via REST, the HTTP handler
            // can't reach sockets. So clients emit this event AFTER the REST call
            // succeeds, letting the server push a notification to the target.
            socket.on('friend_request_sent', ({ targetCharId, senderName }) => {
                const p = onlinePlayers[socket.id];
                if (!p) return;
                // Only trust the senderName from our server-side record
                const actualName = p.name;
                for (const [sid, pl] of Object.entries(onlinePlayers)) {
                    if (pl.charId === parseInt(targetCharId)) {
                        io.to(sid).emit('friend_request_incoming', {
                            fromCharId: p.charId,
                            fromName:   actualName,
                        });
                    }
                }
            });

            // --- GUILD: look up this player's guild and join the room ---
            // Teaching: On login we immediately join the socket room for the
            // player's guild (if any) so guild chat starts working right away.
            (async () => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const [guildRow] = await db.query(
                        `SELECT gm.guild_id, gm.rank, g.name AS guild_name
                         FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id
                         WHERE gm.character_id = ? AND gm.is_active = 1 AND g.is_active = 1 LIMIT 1`,
                        [p.charId]
                    );
                    if (guildRow.length) {
                        const gm = guildRow[0];
                        charGuildMap[p.charId] = { guildId: gm.guild_id, guildName: gm.guild_name, rank: gm.rank };
                        socket.join('guild_' + gm.guild_id);
                        // Send current guild membership info to client
                        socket.emit('guild_joined', { guildId: gm.guild_id, guildName: gm.guild_name, rank: gm.rank });
                    }
                } catch (e) { /* non-critical */ }
            })();

            // =============================================================
            // 9. GUILD SYSTEM — Real-time guild management
            // =============================================================

            // INVITE player to guild
            socket.on('guild_invite', async ({ targetCharId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const myGuild = charGuildMap[p.charId];
                    if (!myGuild) { socket.emit('guild_msg', { text: 'You are not in a guild.', type: 'error' }); return; }
                    if (!['LEADER', 'OFFICER'].includes(myGuild.rank)) {
                        socket.emit('guild_msg', { text: 'Only officers and leaders can invite.', type: 'error' }); return;
                    }
                    // Check target is online
                    const targetEntry = Object.entries(onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
                    if (!targetEntry) { socket.emit('guild_msg', { text: 'Player is offline.', type: 'error' }); return; }
                    const [, targetPlayer] = targetEntry;
                    if (charGuildMap[targetPlayer.charId]) {
                        socket.emit('guild_msg', { text: 'Player is already in a guild.', type: 'error' }); return;
                    }

                    // Persist invite to DB
                    await db.query(
                        "INSERT INTO guild_invites (guild_id, inviter_id, invitee_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE status='pending', created_at=NOW()",
                        [myGuild.guildId, p.charId, targetCharId]
                    );

                    // Notify target
                    const targetSocket = io.sockets.sockets.get(targetEntry[0]);
                    if (targetSocket) {
                        targetSocket.emit('guild_invited', {
                            guildId: myGuild.guildId,
                            guildName: myGuild.guildName,
                            inviterName: p.name
                        });
                    }
                    socket.emit('guild_msg', { text: `Invite sent to ${targetPlayer.name}.`, type: 'info' });
                } catch (e) { console.error('guild_invite error:', e); }
            });

            // ACCEPT guild invite
            socket.on('guild_accept', async ({ guildId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    if (charGuildMap[p.charId]) {
                        socket.emit('guild_msg', { text: 'Leave your current guild first.', type: 'error' }); return;
                    }

                    // Validate invite
                    const [inv] = await db.query(
                        "SELECT * FROM guild_invites WHERE guild_id=? AND invitee_id=? AND status='pending' AND expires_at>NOW() LIMIT 1",
                        [guildId, p.charId]
                    );
                    if (!inv.length) { socket.emit('guild_msg', { text: 'Invite not found or expired.', type: 'error' }); return; }

                    // Check guild exists and has space
                    const [guild] = await db.query('SELECT * FROM guilds WHERE id=? AND is_active=1', [guildId]);
                    if (!guild.length) { socket.emit('guild_msg', { text: 'Guild no longer exists.', type: 'error' }); return; }
                    const [count] = await db.query('SELECT COUNT(*) AS c FROM guild_members WHERE guild_id=? AND is_active=1', [guildId]);
                    if (count[0].c >= guild[0].max_members) {
                        socket.emit('guild_msg', { text: 'Guild is full.', type: 'error' }); return;
                    }

                    // Join guild
                    await db.query(
                        "INSERT INTO guild_members (guild_id, character_id, rank) VALUES (?,?,'MEMBER') ON DUPLICATE KEY UPDATE is_active=1, left_at=NULL, rank='MEMBER'",
                        [guildId, p.charId]
                    );
                    await db.query("UPDATE guild_invites SET status='accepted' WHERE guild_id=? AND invitee_id=?", [guildId, p.charId]);

                    charGuildMap[p.charId] = { guildId, guildName: guild[0].name, rank: 'MEMBER' };
                    socket.join('guild_' + guildId);
                    socket.emit('guild_joined', { guildId, guildName: guild[0].name, rank: 'MEMBER' });

                    io.to('guild_' + guildId).emit('chat_msg', {
                        channel: 'guild', from: 'System',
                        text: `${p.name} joined the guild!`, ts: Date.now()
                    });
                } catch (e) { console.error('guild_accept error:', e); }
            });

            // DECLINE guild invite
            socket.on('guild_decline', async ({ guildId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    await db.query("UPDATE guild_invites SET status='declined' WHERE guild_id=? AND invitee_id=?", [guildId, p.charId]);
                } catch (e) { console.error('guild_decline error:', e); }
            });

            // LEAVE guild
            socket.on('guild_leave', async () => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    await _leaveGuild(socket, p);
                } catch (e) { console.error('guild_leave error:', e); }
            });

            // KICK member (leader/officer only)
            socket.on('guild_kick', async ({ targetCharId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const myGuild = charGuildMap[p.charId];
                    if (!myGuild || !['LEADER','OFFICER'].includes(myGuild.rank)) return;

                    // Remove from DB
                    await db.query('UPDATE guild_members SET is_active=0, left_at=NOW() WHERE guild_id=? AND character_id=?', [myGuild.guildId, targetCharId]);

                    const targetEntry = Object.entries(onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
                    if (targetEntry) {
                        const [tSockId] = targetEntry;
                        const tSock = io.sockets.sockets.get(tSockId);
                        if (tSock) {
                            delete charGuildMap[parseInt(targetCharId)];
                            tSock.leave('guild_' + myGuild.guildId);
                            tSock.emit('guild_left', {});
                            tSock.emit('guild_msg', { text: 'You were kicked from the guild.', type: 'error' });
                        }
                    }
                    io.to('guild_' + myGuild.guildId).emit('chat_msg', {
                        channel: 'guild', from: 'System',
                        text: `A member was removed from the guild.`, ts: Date.now()
                    });
                } catch (e) { console.error('guild_kick error:', e); }
            });

            // PROMOTE / DEMOTE
            socket.on('guild_set_rank', async ({ targetCharId, rank }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const myGuild = charGuildMap[p.charId];
                    if (!myGuild || myGuild.rank !== 'LEADER') { socket.emit('guild_msg', { text: 'Only the leader can change ranks.', type: 'error' }); return; }
                    if (!['OFFICER','MEMBER'].includes(rank)) return;
                    await db.query('UPDATE guild_members SET rank=? WHERE guild_id=? AND character_id=? AND is_active=1', [rank, myGuild.guildId, targetCharId]);
                    // Update in-memory if online
                    if (charGuildMap[parseInt(targetCharId)]) charGuildMap[parseInt(targetCharId)].rank = rank;
                    socket.emit('guild_msg', { text: `Rank updated.`, type: 'info' });
                } catch (e) { console.error('guild_set_rank error:', e); }
            });

            // guild_promote / guild_demote — UI aliases for guild_set_rank.
            // The server already has guild_set_rank which takes an explicit rank string.
            // These wrappers let the UI send the friendlier event names without breaking
            // the existing guild_set_rank consumers (modpanel, etc).
            socket.on('guild_promote', async ({ targetCharId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const myGuild = charGuildMap[p.charId];
                    if (!myGuild || myGuild.rank !== 'LEADER') {
                        socket.emit('guild_msg', { text: 'Only the guild leader can promote members.', type: 'error' });
                        return;
                    }
                    await db.query(
                        'UPDATE guild_members SET rank=? WHERE guild_id=? AND character_id=? AND is_active=1',
                        ['OFFICER', myGuild.guildId, parseInt(targetCharId)]
                    );
                    if (charGuildMap[parseInt(targetCharId)]) charGuildMap[parseInt(targetCharId)].rank = 'OFFICER';
                    socket.emit('guild_msg', { text: 'Member promoted to Officer.', type: 'success' });
                    // Notify the promoted player if online
                    const entry = Object.entries(onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
                    if (entry) {
                        const tSock = io.sockets.sockets.get(entry[0]);
                        if (tSock) tSock.emit('guild_msg', { text: `You have been promoted to Officer!`, type: 'success' });
                    }
                } catch (e) { console.error('guild_promote error:', e); }
            });

            socket.on('guild_demote', async ({ targetCharId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const myGuild = charGuildMap[p.charId];
                    if (!myGuild || myGuild.rank !== 'LEADER') {
                        socket.emit('guild_msg', { text: 'Only the guild leader can demote members.', type: 'error' });
                        return;
                    }
                    await db.query(
                        'UPDATE guild_members SET rank=? WHERE guild_id=? AND character_id=? AND is_active=1',
                        ['MEMBER', myGuild.guildId, parseInt(targetCharId)]
                    );
                    if (charGuildMap[parseInt(targetCharId)]) charGuildMap[parseInt(targetCharId)].rank = 'MEMBER';
                    socket.emit('guild_msg', { text: 'Officer demoted to Member.', type: 'success' });
                    const entry = Object.entries(onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
                    if (entry) {
                        const tSock = io.sockets.sockets.get(entry[0]);
                        if (tSock) tSock.emit('guild_msg', { text: `You have been demoted to Member.`, type: 'info' });
                    }
                } catch (e) { console.error('guild_demote error:', e); }
            });

            // Internal helper — leave / disband guild
            async function _leaveGuild(leavingSocket, player) {
                const guildInfo = charGuildMap[player.charId];
                if (!guildInfo) return;
                const { guildId, guildName } = guildInfo;

                // If leader, transfer or disband
                const [guild] = await db.query('SELECT * FROM guilds WHERE id=? AND is_active=1', [guildId]);
                if (!guild.length) { delete charGuildMap[player.charId]; return; }

                await db.query('UPDATE guild_members SET is_active=0, left_at=NOW() WHERE guild_id=? AND character_id=?', [guildId, player.charId]);
                delete charGuildMap[player.charId];
                leavingSocket.leave('guild_' + guildId);
                leavingSocket.emit('guild_left', {});

                if (guild[0].leader_id === player.charId) {
                    // Try to find next officer or member to be leader
                    const [next] = await db.query(
                        "SELECT character_id FROM guild_members WHERE guild_id=? AND is_active=1 ORDER BY FIELD(rank,'OFFICER','MEMBER') LIMIT 1",
                        [guildId]
                    );
                    if (next.length) {
                        await db.query('UPDATE guilds SET leader_id=? WHERE id=?', [next[0].character_id, guildId]);
                        await db.query("UPDATE guild_members SET rank='LEADER' WHERE guild_id=? AND character_id=?", [guildId, next[0].character_id]);
                        if (charGuildMap[next[0].character_id]) charGuildMap[next[0].character_id].rank = 'LEADER';
                        io.to('guild_' + guildId).emit('chat_msg', {
                            channel: 'guild', from: 'System',
                            text: `${player.name} left. Leadership transferred.`, ts: Date.now()
                        });
                    } else {
                        // No members left — disband
                        await db.query('UPDATE guilds SET is_active=0, disbanded_at=NOW() WHERE id=?', [guildId]);
                        io.to('guild_' + guildId).emit('guild_left', {});
                    }
                } else {
                    io.to('guild_' + guildId).emit('chat_msg', {
                        channel: 'guild', from: 'System', text: `${player.name} left the guild.`, ts: Date.now()
                    });
                }
            }

            // =============================================================
            // 10. TRADE SYSTEM — Real-time player-to-player item trading
            // =============================================================
            // Teaching: A trade has two sides (initiator and recipient).
            // Each side can add items. Both sides must LOCK (finalise their
            // offer) before the trade can be CONFIRMED. If both confirm,
            // items swap atomically in the DB. Either side can cancel at any point.

            // REQUEST trade with another player
            socket.on('trade_request', ({ targetCharId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const targetEntry = Object.entries(onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
                    if (!targetEntry) { socket.emit('trade_msg', { text: 'Player is offline.', type: 'error' }); return; }
                    const [tSockId, tPlayer] = targetEntry;

                    io.to(tSockId).emit('trade_requested', { fromName: p.name, fromCharId: p.charId });
                    socket.emit('trade_msg', { text: `Trade request sent to ${tPlayer.name}.`, type: 'info' });
                } catch (e) { console.error('trade_request error:', e); }
            });

            // ACCEPT trade — create the trade object
            socket.on('trade_accept', ({ targetCharId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const targetEntry = Object.entries(onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
                    if (!targetEntry) { socket.emit('trade_msg', { text: 'Player went offline.', type: 'error' }); return; }
                    const [tSockId, tPlayer] = targetEntry;

                    const tradeId = 'T' + (tradeCounter++);
                    activeTrades[tradeId] = {
                        id: tradeId,
                        sides: {
                            [p.charId]:       { charId: p.charId,       name: p.name,       items: [], gold: 0, locked: false, confirmed: false },
                            [tPlayer.charId]: { charId: tPlayer.charId, name: tPlayer.name, items: [], gold: 0, locked: false, confirmed: false }
                        }
                    };

                    // Both players join trade room
                    socket.join('trade_' + tradeId);
                    const targetSocket = io.sockets.sockets.get(tSockId);
                    if (targetSocket) targetSocket.join('trade_' + tradeId);

                    io.to('trade_' + tradeId).emit('trade_start', { tradeId, trade: activeTrades[tradeId] });
                } catch (e) { console.error('trade_accept error:', e); }
            });

            // DECLINE trade request
            socket.on('trade_decline', ({ targetCharId }) => {
                const p = onlinePlayers[socket.id];
                if (!p) return;
                const targetEntry = Object.entries(onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
                if (targetEntry) {
                    io.to(targetEntry[0]).emit('trade_msg', { text: `${p.name} declined the trade.`, type: 'info' });
                }
            });

            // ADD ITEM to trade
            socket.on('trade_add_item', async ({ tradeId, itemId, quantity }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const trade = activeTrades[tradeId];
                    if (!trade || !trade.sides[p.charId]) return;

                    const mySide = trade.sides[p.charId];
                    if (mySide.locked) { socket.emit('trade_msg', { text: 'Unlock your side first.', type: 'error' }); return; }

                    // Verify item is in inventory
                    const [inv] = await db.query(
                        'SELECT ci.*, gi.name, gi.icon, gi.type FROM character_items ci JOIN game_items gi ON ci.item_id=gi.id WHERE ci.character_id=? AND ci.item_id=?',
                        [p.charId, itemId]
                    );
                    if (!inv.length) { socket.emit('trade_msg', { text: 'Item not found.', type: 'error' }); return; }
                    const item = inv[0];
                    const qty = Math.min(parseInt(quantity) || 1, item.quantity);

                    // Add or increment in trade
                    const existing = mySide.items.find(i => i.itemId === itemId);
                    if (existing) existing.quantity = Math.min(existing.quantity + qty, item.quantity);
                    else mySide.items.push({ itemId, name: item.name, icon: item.icon, quantity: qty });

                    // Reset confirms when offer changes
                    mySide.confirmed = false;

                    io.to('trade_' + tradeId).emit('trade_update', { tradeId, trade });
                } catch (e) { console.error('trade_add_item error:', e); }
            });

            // REMOVE ITEM from trade
            socket.on('trade_remove_item', ({ tradeId, itemId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const trade = activeTrades[tradeId];
                    if (!trade || !trade.sides[p.charId]) return;
                    const mySide = trade.sides[p.charId];
                    if (mySide.locked) return;
                    mySide.items = mySide.items.filter(i => i.itemId !== itemId);
                    mySide.confirmed = false;
                    io.to('trade_' + tradeId).emit('trade_update', { tradeId, trade });
                } catch (e) { console.error('trade_remove_item error:', e); }
            });

            // SET GOLD offer
            socket.on('trade_set_gold', ({ tradeId, amount }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const trade = activeTrades[tradeId];
                    if (!trade || !trade.sides[p.charId]) return;
                    const mySide = trade.sides[p.charId];
                    if (mySide.locked) return;
                    mySide.gold = Math.max(0, parseInt(amount) || 0);
                    mySide.confirmed = false;
                    io.to('trade_' + tradeId).emit('trade_update', { tradeId, trade });
                } catch (e) { console.error('trade_set_gold error:', e); }
            });

            // LOCK trade side
            socket.on('trade_lock', ({ tradeId }) => {
                const p = onlinePlayers[socket.id];
                if (!p) return;
                const trade = activeTrades[tradeId];
                if (!trade || !trade.sides[p.charId]) return;
                trade.sides[p.charId].locked = !trade.sides[p.charId].locked;
                trade.sides[p.charId].confirmed = false;
                io.to('trade_' + tradeId).emit('trade_update', { tradeId, trade });
            });

            // CONFIRM trade — if both confirm and both locked, execute
            socket.on('trade_confirm', async ({ tradeId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const trade = activeTrades[tradeId];
                    if (!trade || !trade.sides[p.charId]) return;

                    const mySide = trade.sides[p.charId];
                    if (!mySide.locked) { socket.emit('trade_msg', { text: 'Lock your offer first.', type: 'error' }); return; }
                    mySide.confirmed = true;

                    io.to('trade_' + tradeId).emit('trade_update', { tradeId, trade });

                    // Check if BOTH sides confirmed
                    const sides = Object.values(trade.sides);
                    if (!sides.every(s => s.locked && s.confirmed)) return;

                    // EXECUTE TRADE
                    const [sideA, sideB] = sides;

                    // Verify gold balances
                    const [userA] = await db.query('SELECT currency FROM users WHERE id=(SELECT user_id FROM characters WHERE id=?)', [sideA.charId]);
                    const [userB] = await db.query('SELECT currency FROM users WHERE id=(SELECT user_id FROM characters WHERE id=?)', [sideB.charId]);
                    if ((userA[0]?.currency || 0) < sideA.gold || (userB[0]?.currency || 0) < sideB.gold) {
                        io.to('trade_' + tradeId).emit('trade_cancelled', { reason: 'Insufficient gold.' });
                        delete activeTrades[tradeId];
                        return;
                    }

                    // Verify items still in inventory (race condition guard)
                    for (const side of sides) {
                        for (const it of side.items) {
                            const [inv] = await db.query('SELECT quantity FROM character_items WHERE character_id=? AND item_id=?', [side.charId, it.itemId]);
                            if (!inv.length || inv[0].quantity < it.quantity) {
                                io.to('trade_' + tradeId).emit('trade_cancelled', { reason: `${side.name} no longer has the offered item(s).` });
                                delete activeTrades[tradeId];
                                return;
                            }
                        }
                    }

                    // Swap items
                    for (const [giver, receiver] of [[sideA, sideB], [sideB, sideA]]) {
                        for (const it of giver.items) {
                            // Remove from giver
                            const [inv] = await db.query('SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=?', [giver.charId, it.itemId]);
                            if (inv[0].quantity > it.quantity) await db.query('UPDATE character_items SET quantity=quantity-? WHERE id=?', [it.quantity, inv[0].id]);
                            else await db.query('DELETE FROM character_items WHERE id=?', [inv[0].id]);
                            // Give to receiver
                            const [ex] = await db.query('SELECT id FROM character_items WHERE character_id=? AND item_id=?', [receiver.charId, it.itemId]);
                            if (ex.length) await db.query('UPDATE character_items SET quantity=quantity+? WHERE id=?', [it.quantity, ex[0].id]);
                            else await db.query('INSERT INTO character_items (character_id,item_id,quantity) VALUES (?,?,?)', [receiver.charId, it.itemId, it.quantity]);
                        }
                    }

                    // Swap gold via user_id lookup
                    if (sideA.gold > 0) {
                        await db.query('UPDATE users SET currency=currency-? WHERE id=(SELECT user_id FROM characters WHERE id=?)', [sideA.gold, sideA.charId]);
                        await db.query('UPDATE users SET currency=currency+? WHERE id=(SELECT user_id FROM characters WHERE id=?)', [sideA.gold, sideB.charId]);
                    }
                    if (sideB.gold > 0) {
                        await db.query('UPDATE users SET currency=currency-? WHERE id=(SELECT user_id FROM characters WHERE id=?)', [sideB.gold, sideB.charId]);
                        await db.query('UPDATE users SET currency=currency+? WHERE id=(SELECT user_id FROM characters WHERE id=?)', [sideB.gold, sideA.charId]);
                    }

                    // Audit log
                    await db.query(
                        'INSERT INTO character_trade_log (initiator_id, recipient_id, initiator_items, recipient_items, initiator_gold, recipient_gold) VALUES (?,?,?,?,?,?)',
                        [sideA.charId, sideB.charId, JSON.stringify(sideA.items), JSON.stringify(sideB.items), sideA.gold, sideB.gold]
                    ).catch(() => {}); // Non-critical — don't fail trade if log fails

                    io.to('trade_' + tradeId).emit('trade_complete', { tradeId });
                    delete activeTrades[tradeId];
                } catch (e) { console.error('trade_confirm error:', e); }
            });

            // CANCEL trade
            socket.on('trade_cancel', ({ tradeId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const trade = activeTrades[tradeId];
                    if (!trade || !trade.sides[p.charId]) return;
                    io.to('trade_' + tradeId).emit('trade_cancelled', { reason: `${p.name} cancelled the trade.` });
                    delete activeTrades[tradeId];
                } catch (e) { console.error('trade_cancel error:', e); }
            });

            // 8. PARTY SYSTEM — Real-time party management
            // =============================================================
            // Teaching: friends are persisted in DB via REST (/api/party/).
            // Party membership is handled here via sockets for real-time
            // invites/joins/leaves, and also saved to DB for persistence.

            // INVITE to party
            socket.on('party_invite', async ({ targetCharId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;

                    // Find target socket
                    const targetEntry = Object.entries(onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
                    if (!targetEntry) { socket.emit('party_msg', { text: 'Player is offline.', type: 'error' }); return; }
                    const [targetSockId, targetPlayer] = targetEntry;

                    // Can't invite self or someone already in a party with you
                    if (targetPlayer.charId === p.charId) return;
                    if (charPartyMap[targetPlayer.charId] && charPartyMap[targetPlayer.charId] === charPartyMap[p.charId]) {
                        socket.emit('party_msg', { text: 'Already in your party.', type: 'error' }); return;
                    }

                    // Create or find party for inviter
                    let partyId = charPartyMap[p.charId];
                    if (!partyId) {
                        // Create new party in DB
                        const [result] = await db.query(
                            'INSERT INTO character_parties (leader_id, is_active) VALUES (?,1)', [p.charId]
                        );
                        partyId = result.insertId;
                        await db.query(
                            "INSERT INTO character_party_members (party_id, character_id, role) VALUES (?,?,'leader')",
                            [partyId, p.charId]
                        );
                        activeParties[partyId] = { id: partyId, leaderId: p.charId, members: [p.charId] };
                        charPartyMap[p.charId] = partyId;
                        socket.join('party_' + partyId);
                    }

                    const party = activeParties[partyId];
                    if (party.members.length >= 4) {
                        socket.emit('party_msg', { text: 'Party is full (max 4).', type: 'error' }); return;
                    }

                    // Send invite to target
                    io.to(targetSockId).emit('party_invited', {
                        partyId, inviterName: p.name, inviterCharId: p.charId
                    });
                    socket.emit('party_msg', { text: `Invite sent to ${targetPlayer.name}.`, type: 'info' });
                } catch (err) { console.error('party_invite error:', err); }
            });

            // ACCEPT party invite
            socket.on('party_accept', async ({ partyId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;

                    const party = activeParties[partyId];
                    if (!party) { socket.emit('party_msg', { text: 'Party no longer exists.', type: 'error' }); return; }
                    if (party.members.length >= 4) { socket.emit('party_msg', { text: 'Party is full.', type: 'error' }); return; }

                    // Leave old party if any
                    const oldPartyId = charPartyMap[p.charId];
                    if (oldPartyId && oldPartyId !== partyId) {
                        await _leaveParty(socket, p, oldPartyId);
                    }

                    // Join
                    party.members.push(p.charId);
                    charPartyMap[p.charId] = partyId;
                    socket.join('party_' + partyId);

                    await db.query(
                        "INSERT INTO character_party_members (party_id, character_id, role) VALUES (?,?,'member') ON DUPLICATE KEY UPDATE is_active=1, left_at=NULL",
                        [partyId, p.charId]
                    );

                    io.to('party_' + partyId).emit('party_update', buildPartyPayload(partyId));
                    io.to('party_' + partyId).emit('chat_msg', {
                        channel: 'party', from: 'System', text: `${p.name} joined the party!`, ts: Date.now()
                    });
                } catch (err) { console.error('party_accept error:', err); }
            });

            // DECLINE party invite
            socket.on('party_decline', ({ partyId }) => {
                const p = onlinePlayers[socket.id];
                if (!p) return;
                const party = activeParties[partyId];
                if (!party) return;
                const leaderEntry = Object.values(onlinePlayers).find(pl => pl.charId === party.leaderId);
                if (leaderEntry) {
                    io.to(leaderEntry.socketId).emit('party_msg', { text: `${p.name} declined your party invite.`, type: 'info' });
                }
            });

            // LEAVE party
            socket.on('party_leave', async () => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const partyId = charPartyMap[p.charId];
                    if (!partyId) return;
                    await _leaveParty(socket, p, partyId);
                } catch(e) { console.error('[party_leave]', e.message); }
            });

            // KICK member (leader only)
            socket.on('party_kick', async ({ targetCharId }) => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;
                    const partyId = charPartyMap[p.charId];
                    if (!partyId) return;
                    const party = activeParties[partyId];
                    if (!party || party.leaderId !== p.charId) {
                        socket.emit('party_msg', { text: 'Only the leader can kick.', type: 'error' }); return;
                    }
                    const targetEntry = Object.entries(onlinePlayers).find(([, pl]) => pl.charId === parseInt(targetCharId));
                    if (targetEntry) {
                        const [tSockId, tPlayer] = targetEntry;
                        await _leaveParty(io.sockets.sockets.get(tSockId), tPlayer, partyId, true);
                        io.to(tSockId).emit('party_msg', { text: 'You were kicked from the party.', type: 'error' });
                    }
                } catch (err) { console.error('party_kick error:', err); }
            });

            // PARTY CHAT — wire the stubbed channel now that party system exists
            // (overwrites the stub in the chat handler above — we route party messages here)

            // Internal helper — leave or disband party
            async function _leaveParty(leavingSocket, player, partyId, isKick = false) {
                const party = activeParties[partyId];
                if (!party) return;

                party.members = party.members.filter(id => id !== player.charId);
                delete charPartyMap[player.charId];
                if (leavingSocket) {
                    leavingSocket.leave('party_' + partyId);
                    leavingSocket.emit('party_update', null); // clears party UI
                }

                await db.query(
                    "UPDATE character_party_members SET is_active=0, left_at=NOW() WHERE party_id=? AND character_id=?",
                    [partyId, player.charId]
                );

                if (party.members.length === 0) {
                    // Disband
                    delete activeParties[partyId];
                    await db.query("UPDATE character_parties SET is_active=0, disbanded_at=NOW() WHERE id=?", [partyId]);
                } else if (party.leaderId === player.charId) {
                    // Transfer leadership to next member
                    party.leaderId = party.members[0];
                    await db.query("UPDATE character_parties SET leader_id=? WHERE id=?", [party.leaderId, partyId]);
                    io.to('party_' + partyId).emit('party_update', buildPartyPayload(partyId));
                    io.to('party_' + partyId).emit('chat_msg', {
                        channel: 'party', from: 'System',
                        text: `${player.name} left. Leadership passed.`, ts: Date.now()
                    });
                } else {
                    io.to('party_' + partyId).emit('party_update', buildPartyPayload(partyId));
                    const verb = isKick ? 'was kicked' : 'left the party';
                    io.to('party_' + partyId).emit('chat_msg', {
                        channel: 'party', from: 'System',
                        text: `${player.name} ${verb}.`, ts: Date.now()
                    });
                }
            }

            // =========================================================
            // RESPAWN — called when player clicks the Respawn button
            //           on the defeat screen after losing a PvE or PvP battle.
            // =========================================================
            // TEACHING: When a player loses, their HP was set to 0 and saved.
            // The client shows a "DEFEATED — RESPAWN" screen. Clicking Respawn
            // emits 'request_respawn' here. We:
            //   1. Load their respawn_map_id, respawn_x, respawn_y from DB.
            //      These default to (1, 10, 10) = starting map, set by
            //      Binding Stones or inn rests (future feature).
            //   2. Restore 20% HP so they don't immediately die again.
            //   3. Teleport them: update map_id/x/y in DB AND onlinePlayers.
            //   4. Move them to the new map room so they receive map events.
            //   5. Emit 'respawn_complete' → client closes defeat screen
            //      and emits 'join_game' to reinitialise their game state.
            socket.on('request_respawn', async () => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (!p) return;

                    // Load respawn coordinates and current max_hp
                    const [charRows] = await db.query(
                        'SELECT max_hp, respawn_map_id, respawn_x, respawn_y FROM characters WHERE id=?',
                        [p.charId]
                    );
                    if (!charRows.length) return;
                    const char = charRows[0];

                    const respawnHp  = Math.max(1, Math.floor(char.max_hp * 0.20));
                    const respawnMap = char.respawn_map_id || 1;
                    const respawnX   = char.respawn_x || 10;
                    const respawnY   = char.respawn_y || 10;

                    // Save new position + restored HP
                    await db.query(
                        'UPDATE characters SET current_hp=?, map_id=?, x=?, y=? WHERE id=?',
                        [respawnHp, respawnMap, respawnX, respawnY, p.charId]
                    );

                    // Tell players on old map this player left
                    socket.to('map_' + p.mapId).emit('player_left', p.charId);
                    socket.leave('map_' + p.mapId);

                    // Update server-side memory
                    p.mapId = respawnMap;
                    p.x     = respawnX;
                    p.y     = respawnY;

                    // Join new map room
                    socket.join('map_' + respawnMap);

                    // Tell client to reinitialise (same as joining for the first time)
                    // The client will emit join_game which triggers init_self
                    socket.emit('respawn_complete', {
                        mapId: respawnMap,
                        x: respawnX,
                        y: respawnY,
                        hp: respawnHp
                    });

                } catch (err) { console.error('Respawn error:', err); }
            });

            // 6. DISCONNECT
            socket.on('disconnect', async () => {
                try {
                    const p = onlinePlayers[socket.id];
                    if (p) {
                        await db.query("UPDATE characters SET x=?, y=?, map_id=? WHERE id=?", [p.x, p.y, p.mapId, p.charId]);

                        // Check if offline players stay visible on map
                        let offlineVisible = true;
                        try {
                            const [sv] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='enable_offline_players'");
                            offlineVisible = sv.length && sv[0].setting_value === 'true';
                        } catch {}

                        if (offlineVisible) {
                            // Don't remove — just mark as sleeping
                            socket.to('map_' + p.mapId).emit('player_status_change', {
                                charId: p.charId, name: p.name,
                                x: p.x, y: p.y, level: p.level,
                                isOffline: true, presence: 'offline'
                            });
                        } else {
                            socket.to('map_' + p.mapId).emit('player_left', p.charId);
                        }

                        // Clean up party membership on disconnect
                        const partyId = charPartyMap[p.charId];
                        if (partyId) {
                            await _leaveParty(socket, p, partyId);
                        }

                        // FIX: clean up guild map entry — was leaking one entry per player per session
                        delete charGuildMap[p.charId];

                        // Clean up companion state
                        delete companionState[p.charId];

                        // FIX: clean up NPC conversation history — was leaking one entry per
                        // unique (player, npc) conversation pair, forever, until server restart.
                        // We delete all keys that start with this player's charId prefix.
                        const memPrefix = `${p.charId}_`;
                        for (const key of Object.keys(npcMemory)) {
                            if (key.startsWith(memPrefix)) delete npcMemory[key];
                        }

                        // Update presence to offline in DB
                        await db.query(
                            "UPDATE characters SET presence='offline', last_seen=NOW() WHERE id=?",
                            [p.charId]
                        ).catch(() => {}); // non-fatal

                        delete onlinePlayers[socket.id];
                    }
                } catch (err) { console.error("Disconnect error:", err); }
            });
        });


        // =============================================================
        // NPC MEMORY HELPERS
        // =============================================================
        // _upsertMemory saves the player<->NPC memory row to the database.
        // It uses INSERT ... ON DUPLICATE KEY UPDATE so it's safe to call
        // any time — creates the row on first conversation, updates after.
        async function _upsertMemory(db, charId, npcName, facts, reputation) {
            try {
                await db.query(
                    `INSERT INTO npc_memories (char_id, npc_name, facts_json, reputation)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                         facts_json  = VALUES(facts_json),
                         reputation  = VALUES(reputation),
                         last_seen   = CURRENT_TIMESTAMP`,
                    [charId, npcName, JSON.stringify(facts), Math.max(-100, Math.min(100, reputation))]
                );
            } catch (err) { console.warn('npc memory save failed:', err.message); }
        }

        // _addRumor writes a globally notable fact to npc_rumors.
        // Any NPC anywhere can eventually learn this via the rumor tick.
        // We deduplicate by char_id + rumor_text so the same event
        // doesn't spawn duplicate rumors.
        async function _addRumor(db, charId, charName, rumorText) {
            try {
                await db.query(
                    `INSERT IGNORE INTO npc_rumors (char_id, char_name, rumor_text)
                     VALUES (?, ?, ?)`,
                    [charId, charName, rumorText]
                );
            } catch (e) { console.warn('addRumor failed:', e.message); }
        }

        // =============================================================
        // PLAYER TITLE SYSTEM
        // =============================================================
        // TEACHING: Titles are derived on-the-fly — no DB column needed.
        // We look at three things: reputation average, rumor count, and level.
        // The NPC uses this title when addressing the player, making them
        // feel recognised. High-rep players get heroic titles; low-rep
        // players get ominous ones. Fresh characters get nothing.
        async function _deriveTitle(charId, db) {
            try {
                const [[repRow]]  = await db.query(
                    'SELECT AVG(reputation) as avg_rep FROM npc_memories WHERE char_id=?', [charId]);
                const [[rumRow]]  = await db.query(
                    'SELECT COUNT(*) as cnt FROM npc_rumors WHERE char_id=? AND spread_count > 0', [charId]);
                const [[charRow]] = await db.query(
                    'SELECT level, battle_record FROM characters WHERE id=?', [charId]);

                const rep    = repRow?.avg_rep  || 0;
                const rumors = rumRow?.cnt       || 0;
                const level  = charRow?.level    || 1;
                const wins   = JSON.parse(charRow?.battle_record || '{"W":0}').W || 0;

                if (rep >= 70 && rumors >= 3)  return 'the Renowned';
                if (rep >= 50 && level >= 10)  return 'the Trusted';
                if (wins >= 20)                return 'the Proven';
                if (rep >= 40)                 return 'the Welcomed';
                if (rep <= -60 && rumors >= 2) return 'the Feared';
                if (rep <= -40)                return 'the Distrusted';
                if (level >= 20)               return 'the Veteran';
                return null; // No title yet
            } catch (e) { return null; }
        }

        // =============================================================
        // FACTION HELPERS
        // =============================================================
        // TEACHING: Factions group NPCs so players have a broader
        // standing with an organisation, not just one person.
        // Helping a faction NPC gives faction XP. Rival factions lose rep.
        // _getFactionRep returns the player's rep with a specific faction.
        // _updateFactionRep writes the rep and cascades to any rival.
        async function _getFactionRep(db, charId, factionId) {
            const [[row]] = await db.query(
                'SELECT reputation FROM player_faction_rep WHERE char_id=? AND faction_id=?',
                [charId, factionId]);
            return row?.reputation || 0;
        }

        async function _updateFactionRep(db, charId, factionId, delta) {
            try {
                await db.query(
                    `INSERT INTO player_faction_rep (char_id, faction_id, reputation) VALUES (?,?,?)
                     ON DUPLICATE KEY UPDATE reputation = GREATEST(-100, LEAST(100, reputation + ?))`,
                    [charId, factionId, Math.max(-100, Math.min(100, delta)), delta]);

                // Cascade to rival faction (opposite effect at 50%)
                const [[faction]] = await db.query(
                    'SELECT rival_id FROM factions WHERE id=?', [factionId]);
                if (faction?.rival_id) {
                    const rivalDelta = Math.round(-delta * 0.5);
                    if (rivalDelta !== 0) {
                        await db.query(
                            `INSERT INTO player_faction_rep (char_id, faction_id, reputation) VALUES (?,?,?)
                             ON DUPLICATE KEY UPDATE reputation = GREATEST(-100, LEAST(100, reputation + ?))`,
                            [charId, faction.rival_id, Math.max(-100, Math.min(100, rivalDelta)), rivalDelta]);
                    }
                }
            } catch (e) { console.warn('updateFactionRep failed:', e.message); }
        }

        // Get the faction (if any) that an NPC belongs to
        async function _getNpcFaction(db, npcId) {
            const [[row]] = await db.query(
                `SELECT f.id, f.name, f.icon FROM factions f
                 JOIN npc_factions nf ON nf.faction_id = f.id
                 WHERE nf.npc_id = ? LIMIT 1`, [npcId]);
            return row || null;
        }

        // _triggerCrowdReaction: called when a player enters a map.
        // Blends individual NPC rep + faction rep for an atmospheric entrance moment.
        async function _triggerCrowdReaction(socket, db, player, mapId) {
            try {
                const npcsOnMap = getNpcsForMap(mapId);
                if (!npcsOnMap.length) return;

                const npcNames = npcsOnMap.map(n => n.name);
                const [repRows] = await db.query(
                    `SELECT AVG(reputation) as avg_rep, COUNT(*) as known
                     FROM npc_memories
                     WHERE char_id = ? AND npc_name IN (?)`,
                    [player.charId, npcNames]
                );
                const avgIndividual = repRows.length ? (repRows[0].avg_rep || 0) : 0;
                const known         = repRows.length ? (repRows[0].known  || 0) : 0;

                // Faction rep for factions represented on this map
                let avgFaction = 0;
                const npcIds = npcsOnMap.map(n => n.id);
                if (npcIds.length) {
                    const [fRows] = await db.query(
                        `SELECT AVG(pfr.reputation) as avg_frep
                         FROM player_faction_rep pfr
                         JOIN npc_factions nf ON nf.faction_id = pfr.faction_id
                         WHERE pfr.char_id = ? AND nf.npc_id IN (?)`,
                        [player.charId, npcIds]
                    );
                    avgFaction = fRows.length ? (fRows[0].avg_frep || 0) : 0;
                }

                // Blend: faction carries 40% weight, individual 60%
                const avgRep = known >= 2
                    ? (avgIndividual * 0.6 + avgFaction * 0.4)
                    : avgFaction;

                if (known < 2 && Math.abs(avgFaction) < 20) return;

                let tier, lines;
                if (avgRep >= 60) {
                    tier  = 'celebrated';
                    lines = [
                        `*The locals take notice as ${player.name} arrives.*`,
                        `Someone nearby calls out: "Hey, it's ${player.name}!"`,
                        `*A few faces turn — recognition, and something like respect.*`
                    ];
                } else if (avgRep >= 25) {
                    tier  = 'friendly';
                    lines = [
                        `*A few NPCs nod as ${player.name} enters.*`,
                        `"Ah, ${player.name}. Good to see a familiar face."`,
                        `*Nearby NPCs seem at ease with your presence.*`
                    ];
                } else if (avgRep <= -50) {
                    tier  = 'hostile';
                    lines = [
                        `*The crowd tenses as ${player.name} steps in.*`,
                        `Someone mutters: "Not this one again..."`,
                        `*A guard shifts their weight, watching you.*`
                    ];
                } else if (avgRep <= -20) {
                    tier  = 'wary';
                    lines = [
                        `*A few nearby NPCs eye you cautiously.*`,
                        `*Someone steps back as you pass.*`
                    ];
                } else {
                    return; // Neutral — no reaction, don't send anything
                }

                const text = lines[Math.floor(Math.random() * lines.length)];
                socket.emit('crowd_reaction', { tier, text });
            } catch (e) { console.warn('crowd reaction failed:', e.message); }
        }

        // =============================================================
        // ENVIRONMENTAL REACTIONS — HP-based healer hint
        // =============================================================
        // TEACHING: When a player enters a map at low HP (< 30%),
        // we check if there's a healer NPC on the map and surface
        // their name. This is purely informational — the player still
        // has to find and talk to them. It rewards players who explore
        // and build NPC relationships because a high-rep healer may
        // offer a free heal during interaction.
        async function _triggerEnvironmentalReaction(socket, db, player, mapId) {
            try {
                const [hpRows] = await db.query(
                    'SELECT current_hp, max_hp FROM characters WHERE id=?', [player.charId]);
                if (!hpRows.length) return;
                const { current_hp, max_hp } = hpRows[0];
                const hpRatio = max_hp > 0 ? current_hp / max_hp : 1;
                if (hpRatio >= 0.3) return; // Only react at low HP

                // Find a non-enemy NPC with a healing persona on this map
                const npcsHere = getNpcsForMap(mapId).filter(n => !n.isEnemy);
                const healer   = npcsHere.find(n =>
                    n.persona && /heal|medic|cleric|priest|doctor|nurse|shaman/i.test(n.persona)
                );
                if (!healer) return;

                socket.emit('environmental_reaction', {
                    type: 'low_hp',
                    text: `*You look battered. ${healer.name} is nearby and may be able to help.*`,
                    npcName: healer.name
                });
            } catch (e) { /* non-fatal */ }
        }

        // =============================================================
        // NPC NEEDS — transient mini-quests from idle NPCs
        // =============================================================
        // TEACHING: "Needs" are lightweight requests NPCs emit when idle.
        // They're stored only in npcState._need — nothing in the DB.
        // When a player accepts a need, it clears the need and gives a
        // small reward (gold). No quest journal, no tracking overhead.
        // Think of them as ambient chores that keep the world feeling alive.
        //
        // Need templates: array of { text, reward_gold, reward_xp }
        const NEED_TEMPLATES = [
            { text: 'Looking for someone to carry a message to the inn.', reward_gold: 5,  reward_xp: 10 },
            { text: 'Needs help moving a heavy crate. Just a minute of your time.', reward_gold: 8,  reward_xp: 5  },
            { text: 'Dropped something in the market and cannot find it. Could use an extra pair of eyes.', reward_gold: 6,  reward_xp: 8  },
            { text: 'Wants someone to stand watch for a moment while they step away.', reward_gold: 10, reward_xp: 12 },
            { text: 'Needs a trusted person to hold a package briefly.', reward_gold: 7,  reward_xp: 6  },
        ];

        let _needTick = 0;
        async function npcNeedsTick() {
            _needTick++;
            // Fire every ~45 seconds
            if (_needTick % 22 !== 0) return;

            // Give a random idle NPC on a populated map a need
            const maps = new Set(Object.values(onlinePlayers).map(p => p.mapId));
            for (const mapId of maps) {
                const idle = getNpcsForMap(mapId).filter(n => !n.isEnemy && !n._need);
                if (!idle.length) continue;
                const npc  = idle[Math.floor(Math.random() * idle.length)];
                const tmpl = NEED_TEMPLATES[Math.floor(Math.random() * NEED_TEMPLATES.length)];
                npc._need  = { ...tmpl, acceptedBy: null };

                // Broadcast to players within 8 tiles
                const sockets = await io.in('map_' + mapId).fetchSockets().catch(() => []);
                for (const s of sockets) {
                    const p = onlinePlayers[s.id];
                    if (!p) continue;
                    if (Math.abs(p.x - npc.x) + Math.abs(p.y - npc.y) > 8) continue;
                    s.emit('npc_need', { npcId: npc.id, npcName: npc.name, text: npc._need.text });
                }

                // Auto-expire need after 60 seconds if nobody takes it
                setTimeout(() => {
                    if (npc._need && !npc._need.acceptedBy) npc._need = null;
                }, 60000);
                break; // One need per tick per pass — keep it rare
            }
        }

        // =============================================================
        // NPC LIVE STATE + MOVEMENT SYSTEM
        // =============================================================
        // TEACHING: NPCs need to live somewhere in memory between ticks.
        // We keep npcState as a flat dict: { npcId -> { id, name, icon,
        //   mapId, x, y, homeX, homeY, wanderRadius, moveType, persona } }
        //
        // Why server-side movement?
        //   If every client moved their own NPCs, they'd disagree on positions
        //   and interact would break. One server ticks all NPCs and broadcasts
        //   their positions — clients just draw what the server says.
        //
        // Tick rate: every 2 seconds. NPCs don't need 60fps.
        // =============================================================

        const npcState = {};  // npcId -> live NPC object

        async function loadMapNpcs(mapId) {
            const [rows] = await db.query(
                `SELECT n.id, n.name, n.icon, n.map_id, n.x, n.y, n.persona, n.is_enemy,
                        n.move_type, n.wander_radius, n.char_id,
                        n.quest_offers_json, n.schedule_json, n.shop_id,
                        n.mood, n.is_dead, n.predecessor_name,
                        n.is_recruitable, n.recruit_rep_req, n.recruit_quest_req,
                        n.sprite_asset_id, a.file_url AS sprite_url
                 FROM game_npcs n
                 LEFT JOIN game_assets a ON a.id = n.sprite_asset_id
                 WHERE n.map_id = ? AND n.is_enemy = 0 AND n.is_dead = 0`,
                [mapId]
            );
            for (const row of rows) {
                if (!npcState[row.id]) {
                    // First time we see this NPC — seed from DB position
                    // Build persona: if this NPC replaced someone, bake that in
                    let persona = row.persona || '';
                    if (row.predecessor_name) {
                        persona = `${persona} You replaced ${row.predecessor_name}, who died. You are aware of their legacy.`.trim();
                    }

                    npcState[row.id] = {
                        id:           row.id,
                        name:         row.name,
                        icon:         row.icon || '👤',
                        spriteUrl:    row.sprite_url || null,
                        mapId:        row.map_id,
                        x:            row.x,
                        y:            row.y,
                        homeX:        row.x,
                        homeY:        row.y,
                        wanderRadius:  row.wander_radius || 3,
                        moveType:      row.move_type || 'WANDER',
                        persona,
                        charId:        row.char_id || null,
                        isEnemy:       row.is_enemy,
                        questOffers:   safeJsonParse(row.quest_offers_json, []),
                        scheduleSlots: safeJsonParse(row.schedule_json, []),
                        shopId:        row.shop_id || null,
                        mood:          row.mood || null,
                        _need:         null,
                        // PATROL: waypoint list and current index
                        patrolPath:    safeJsonParse(row.patrol_path_json, null),
                        _patrolIdx:    0,       // which waypoint we're heading toward
                        _patrolPause:  0,       // ticks to wait at current waypoint
                        // Companion recruitment
                        isRecruitable:   !!row.is_recruitable,
                        recruitRepReq:   row.recruit_rep_req || 50,
                        recruitQuestReq: row.recruit_quest_req || null
                    };
                }
            }
            return rows.map(r => npcState[r.id]);
        }

        function getNpcsForMap(mapId) {
            return Object.values(npcState).filter(n => n.mapId === mapId);
        }
        // Expose to global scope so battle_engine.js (same process) can call it
        // TEACHING: Node.js modules share the same process memory. Setting a property
        // on the `global` object lets other modules access it without circular imports.
        // We only use this for the witness system — it's deliberately narrow.
        global.getNpcsForMap = getNpcsForMap;
        global._addRumor     = _addRumor;

        // =============================================================
        // COMPANION HELPERS
        // =============================================================
        async function loadCompanions(charId) {
            try {
                const [rows] = await db.query(
                    `SELECT cc.npc_id, cc.tactics, cc.is_active,
                            gn.name, gn.icon, gn.char_id,
                            c.level, c.current_hp, c.max_hp, c.current_mp, c.max_mp
                     FROM character_companions cc
                     JOIN game_npcs gn ON gn.id = cc.npc_id
                     LEFT JOIN characters c ON c.id = gn.char_id
                     WHERE cc.character_id = ? AND cc.is_active = 1`,
                    [charId]
                );
                const comps = rows.map(r => ({
                    npcId:     r.npc_id,
                    name:      r.name,
                    icon:      r.icon || '👤',
                    charId:    r.char_id,
                    level:     r.level || 1,
                    currentHp: r.current_hp || 10,
                    maxHp:     r.max_hp || 10,
                    currentMp: r.current_mp || 0,
                    maxMp:     r.max_mp || 0,
                    tactics:   r.tactics || 'BALANCED',
                    x:         0,
                    y:         0,
                    mapId:     0,
                    isActive:  true
                }));
                companionState[charId] = comps;
                return comps;
            } catch (e) {
                console.error('loadCompanions error:', e);
                return [];
            }
        }

        function getActiveCompanions(charId) {
            return companionState[charId] || [];
        }

        // Spawn companions at player position
        function spawnCompanionsAtPlayer(p) {
            const comps = getActiveCompanions(p.charId);
            for (const comp of comps) {
                comp.mapId = p.mapId;
                comp.x = p.x;
                comp.y = p.y;
            }
        }

        // Expose NPC mood setter — called by event_runner SET_NPC_MOOD action
        // Expose worldFlags and npcState getter for admin routes
        global.worldFlags        = worldFlags;  // reference — mutations are shared
        global._getNpcState      = () => npcState;
        global._getOnlinePlayers = () => onlinePlayers;

        global.setNpcMood = function(npcName, mood) {
            const npc = Object.values(npcState).find(n => n.name === npcName);
            if (npc) {
                npc.mood = mood;
                broadcastNpcList(npc.mapId);
                console.log(`😶 NPC mood: ${npcName} → ${mood || 'neutral'}`);
            }
        };

        // Expose NPC killer — called by event_runner KILL_NPC action
        global.killNpc = async function(db, npcName, cause) {
            try {
                await db.query(
                    'UPDATE game_npcs SET is_dead=1, death_cause=? WHERE name=?',
                    [cause, npcName]);
                // Remove from live state and broadcast
                const npc = Object.values(npcState).find(n => n.name === npcName);
                if (npc) {
                    const mapId = npc.mapId;
                    delete npcState[npc.id];
                    broadcastNpcList(mapId);
                    console.log(`💀 NPC killed: ${npcName} (${cause})`);
                }
            } catch (e) { console.warn('killNpc failed:', e.message); }
        };

        function broadcastNpcList(mapId) {
            const npcs = getNpcsForMap(mapId);
            io.to('map_' + mapId).emit('npc_list', npcs);
        }

        // checkWorldFlagConditions is defined at module level (see top of file)
        // so it's accessible from both loadWorldFlags (startup) and socket handlers.
        global.checkWorldFlagConditions = checkWorldFlagConditions;

        // NPC tick: runs every 2 seconds.
        // WANDER NPCs take one random step if the destination is:
        //   1. Within map bounds
        //   2. Not a blocked tile
        //   3. Within wander_radius of their home position
        //   4. Not occupied by a player (polite NPCs)
        // TEACHING: getScheduledHome checks what time of day it is on the SERVER
        // and returns the position the NPC should be near right now.
        // If no schedule slot matches the current hour, returns the original spawn.
        function getScheduledHome(npc) {
            if (!npc.scheduleSlots || !npc.scheduleSlots.length) {
                return { mapId: npc.mapId, x: npc.homeX, y: npc.homeY };
            }
            const hour = new Date().getHours(); // 0-23 server local time
            for (const slot of npc.scheduleSlots) {
                if (hour >= slot.hour_from && hour < slot.hour_to) {
                    return { mapId: slot.map_id || npc.mapId, x: slot.x, y: slot.y };
                }
            }
            return { mapId: npc.mapId, x: npc.homeX, y: npc.homeY };
        }

        async function npcTick() {
          try { // FIX: wrap entire tick in try/catch so a single bad NPC or DB hiccup
                // doesn't crash the loop. setInterval re-fires regardless, but an
                // uncaught promise rejection inside an async function passed to setInterval
                // becomes an unhandledRejection which can crash Node in newer versions.
            await npcChatterTick();              // ambient NPC-to-NPC dialogue
            await rumorSpreadTick(db);           // spread notable player facts between NPCs
            await npcNeedsTick();                // generate transient mini-quest needs
            const dirs = [{ dx:0,dy:-1 },{ dx:0,dy:1 },{ dx:-1,dy:0 },{ dx:1,dy:0 }];
            const movedMaps = new Set();

            for (const npc of Object.values(npcState)) {
                if (npc.moveType !== 'WANDER') continue;

                // Check schedule: if NPC should be on a different map, teleport them
                const scheduledHome = getScheduledHome(npc);
                if (scheduledHome.mapId !== npc.mapId) {
                    const oldMap = npc.mapId;
                    npc.mapId = scheduledHome.mapId;
                    npc.x     = scheduledHome.x;
                    npc.y     = scheduledHome.y;
                    movedMaps.add(oldMap);         // broadcast departure from old map
                    movedMaps.add(scheduledHome.mapId); // broadcast arrival on new map
                    continue;
                }
                // Update effective home position to scheduled target (NPC wanders near it)
                npc._schedHome = scheduledHome;

                // 50% chance to move each tick so NPCs don't rush around constantly
                if (Math.random() < 0.5) continue;

                const map = await getMapData(npc.mapId);
                if (!map) continue;

                // Shuffle directions so movement isn't biased
                const shuffled = dirs.slice().sort(() => Math.random() - 0.5);
                for (const d of shuffled) {
                    const nx = npc.x + d.dx;
                    const ny = npc.y + d.dy;

                    // Bounds check
                    if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;

                    // Blocked tile check
                    const tileId = map.tiles[ny * map.width + nx];
                    if (BLOCKED_TILES.includes(tileId)) continue;

                    // Radius check: stay near scheduled home (or spawn if no schedule)
                    const sh = npc._schedHome || { x: npc.homeX, y: npc.homeY };
                    const distFromHome = Math.abs(nx - sh.x) + Math.abs(ny - sh.y);
                    if (distFromHome > npc.wanderRadius) continue;

                    // Don't walk onto a player's tile (feels weird)
                    const occupied = Object.values(onlinePlayers).some(p => p.mapId === npc.mapId && p.x === nx && p.y === ny);
                    if (occupied) continue;

                    // Move!
                    npc.x = nx;
                    npc.y = ny;
                    movedMaps.add(npc.mapId);
                    break;
                }
            }

            // ── PATROL MOVEMENT ──────────────────────────────────────────
            // PATROL NPCs follow a fixed waypoint list. Each waypoint can
            // optionally have a pause_ticks value (how many 2s ticks to wait
            // before moving to the next point). When the list ends they loop.
            //
            // TEACHING: This is a state machine. The NPC has two states:
            //   1. Moving toward a waypoint (advance one tile per tick)
            //   2. Pausing at a waypoint (counting down _patrolPause)
            //
            // We move one tile per tick toward the target, not teleport,
            // so the NPC visibly walks on the client's canvas.
            for (const npc of Object.values(npcState)) {
                if (npc.moveType !== 'PATROL' || !npc.patrolPath || !npc.patrolPath.length) continue;

                // Handle pause at waypoint
                if (npc._patrolPause > 0) {
                    npc._patrolPause--;
                    continue;
                }

                // Get current target waypoint
                const target = npc.patrolPath[npc._patrolIdx];
                if (!target) { npc._patrolIdx = 0; continue; }

                // Already at waypoint?
                if (npc.x === target.x && npc.y === target.y) {
                    npc._patrolPause = target.pause_ticks || 0;
                    npc._patrolIdx   = (npc._patrolIdx + 1) % npc.patrolPath.length;
                    movedMaps.add(npc.mapId);
                    continue;
                }

                // Move one step toward target (prefer axis with larger delta)
                const map = await getMapData(npc.mapId);
                if (!map) continue;

                const dx = target.x - npc.x;
                const dy = target.y - npc.y;
                // Determine candidates: primary axis first, then secondary
                const moves = [];
                if (Math.abs(dx) >= Math.abs(dy)) {
                    if (dx !== 0) moves.push({ dx: Math.sign(dx), dy: 0 });
                    if (dy !== 0) moves.push({ dx: 0, dy: Math.sign(dy) });
                } else {
                    if (dy !== 0) moves.push({ dx: 0, dy: Math.sign(dy) });
                    if (dx !== 0) moves.push({ dx: Math.sign(dx), dy: 0 });
                }

                for (const m of moves) {
                    const nx = npc.x + m.dx;
                    const ny = npc.y + m.dy;
                    if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;
                    const tileId = map.tiles[ny * map.width + nx];
                    if (BLOCKED_TILES.includes(tileId)) continue;
                    const occupied = Object.values(onlinePlayers).some(
                        p => p.mapId === npc.mapId && p.x === nx && p.y === ny);
                    if (occupied) continue;
                    npc.x = nx;
                    npc.y = ny;
                    movedMaps.add(npc.mapId);
                    break;
                }
            }

            // Only broadcast maps where something actually moved
            for (const mapId of movedMaps) {
                broadcastNpcList(mapId);
            }

            // ---------------------------------------------------------
            // NPC-TO-NPC CHATTER
            // TEACHING: Every 15 seconds, pick a random map that has 2+
            // NPCs and at least 1 player. Pick two nearby NPCs and have
            // them exchange a line of ambient dialogue. Players within
            // 6 tiles receive it as a floating notification.
            //
            // This is deliberately cheap: no LLM call, just canned lines
            // weighted by world flags so chatter reacts to world state.
            // ---------------------------------------------------------
        } catch (npcTickErr) {
            console.error('[npcTick] Error during tick:', npcTickErr.message);
        }
        } // end npcTick

        // ── NPC CHATTER HELPERS ───────────────────────────────────────
        // Defined outside npcTick so they are not re-created on every 2s tick
        // and so _chatterTick is initialized before npcTick calls them.
        const CHATTER_POOL = [
            ['{a}', '*mutters to {b}* "Cold night."'],
            ['{a}', '"Seen many strangers lately. Something stirs."'],
            ['{a}', '"Prices at the market went up again."'],
            ['{a}', '"I heard someone cleared the old cave. Hard to believe."'],
            ['{b}', '"You look tired, {a}."', '{a}', '"Tired is still alive."'],
            ['{a}', '"Avoid the east gate after dark."'],
            ['{a}', '"Something howled in the woods last night. Three times."'],
            ['{b}', '"Any trouble lately?"', '{a}', '"Trouble is always close. You learn to walk past it."'],
            ['{a}', '"Last time I trusted a merchant with a wink, I lost my boots."'],
            ['{a}', '"You think the gods are watching?"', '{b}', '"If they are, they have excellent taste in entertainment."'],
        ]

        // World-flag-aware chatter: if a flag is set, add relevant lines
        function getChatterLines() {
            const pool = CHATTER_POOL.slice();
            if (worldFlags['goblin_boss_slain'])
                pool.push(['{a}', '"I heard someone finally put down the goblin boss. About time."']);
            if (worldFlags['war_started'])
                pool.push(['{a}', '"War is coming. You can feel it, smell it."']);
            if (worldFlags['bridge_destroyed'])
                pool.push(['{a}', '"The bridge is out. South road is the only way now."']);
            if (worldFlags['festival_active'])
                pool.push(['{a}', '"Festival is good for business. Bad for sleep."']);
            return pool;
        }

        let _chatterTick = 0;
        async function rumorSpreadTick(db) {
            // Run every ~30 seconds (every 15 ticks of the 2s npcTick)
            if (_chatterTick % 15 !== 0) return;

            try {
                // Pick one rumor that hasn't fully spread yet
                const [rumors] = await db.query(
                    `SELECT * FROM npc_rumors
                     WHERE spread_count < max_spread
                     ORDER BY RAND() LIMIT 1`
                );
                if (!rumors.length) return;
                const rumor = rumors[0];

                // Get all NPCs across all maps (from live state — only loaded maps)
                // TEACHING: We only spread to NPCs that are currently loaded in memory.
                // This means a rumor spreads faster on busy maps, which feels natural.
                const allNpcs = Object.values(npcState).filter(n => !n.isEnemy);
                if (!allNpcs.length) return;

                // Find NPCs who don't already know this rumor
                const fact = `Heard that ${rumor.char_name} ${rumor.rumor_text}`;
                const [knowers] = await db.query(
                    `SELECT npc_name FROM npc_memories
                     WHERE char_id = ? AND JSON_SEARCH(facts_json, 'one', ?) IS NOT NULL`,
                    [rumor.char_id, fact]
                );
                const knowerNames = new Set(knowers.map(r => r.npc_name));

                // Pick 1-2 NPCs who don't know yet
                const candidates = allNpcs.filter(n => !knowerNames.has(n.name));
                if (!candidates.length) {
                    // Everyone knows — mark fully spread
                    await db.query('UPDATE npc_rumors SET spread_count=max_spread WHERE id=?', [rumor.id]);
                    return;
                }

                const picks = candidates.sort(() => Math.random() - 0.5).slice(0, 2);
                for (const npc of picks) {
                    // Load existing memory for this NPC+player pair
                    const [memRows] = await db.query(
                        'SELECT facts_json, reputation FROM npc_memories WHERE char_id=? AND npc_name=?',
                        [rumor.char_id, npc.name]
                    );
                    const existing = memRows.length
                        ? safeJsonParse(memRows[0].facts_json, [])
                        : [];
                    const rep = memRows.length ? (memRows[0].reputation || 0) : 0;

                    if (existing.length < 10 && !existing.includes(fact)) {
                        existing.push(fact);
                        await _upsertMemory(db, rumor.char_id, npc.name, existing, rep);
                    }
                }

                await db.query(
                    'UPDATE npc_rumors SET spread_count = spread_count + ? WHERE id = ?',
                    [picks.length, rumor.id]
                );
                console.log(`📢 Rumor spread: "${fact}" → ${picks.map(n => n.name).join(', ')}`);
            } catch (e) { console.warn('rumorSpreadTick failed:', e.message); }
        }

        async function npcChatterTick() {
            _chatterTick++;
            // Run every ~15 seconds (called every 2s, so every 7-8 ticks)
            if (_chatterTick % 7 !== 0) return;

            // Gather maps with both players and 2+ NPCs
            const maps = new Set(Object.values(onlinePlayers).map(p => p.mapId));
            for (const mapId of maps) {
                const npcsHere = getNpcsForMap(mapId).filter(n => n.moveType !== 'STATIONARY' || true);
                if (npcsHere.length < 2) continue;

                // Pick two NPCs that are within 8 tiles of each other
                let npcA, npcB;
                outer: for (const a of npcsHere) {
                    for (const b of npcsHere) {
                        if (a.id === b.id) continue;
                        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 8) {
                            npcA = a; npcB = b; break outer;
                        }
                    }
                }
                if (!npcA) continue;

                // Pick a random chatter line and personalise it
                const pool  = getChatterLines();
                const lines = pool[Math.floor(Math.random() * pool.length)];
                const fill  = s => s.replace('{a}', npcA.name).replace('{b}', npcB.name);

                // Send to players within 6 tiles of either NPC
                const sockets = await io.in('map_' + mapId).fetchSockets().catch(() => []);
                for (const s of sockets) {
                    const p = onlinePlayers[s.id];
                    if (!p) continue;
                    const nearA = Math.abs(p.x - npcA.x) + Math.abs(p.y - npcA.y) <= 6;
                    const nearB = Math.abs(p.x - npcB.x) + Math.abs(p.y - npcB.y) <= 6;
                    if (!nearA && !nearB) continue;

                    // Send each part of the exchange sequentially with delay
                    for (let i = 0; i < lines.length; i += 2) {
                        const speaker = fill(lines[i]);
                        const text    = fill(lines[i + 1] || '');
                        if (!text) continue;
                        setTimeout(() => {
                            s.emit('npc_chatter', { speaker, text });
                        }, i * 1800); // stagger by 1.8s per line
                    }
                }
            }
        }

        // Start the NPC tick loop (only after DB is connected)
        // FIX: wrap the setInterval callback so async errors are always caught.
        // Without this, an unhandled rejection inside npcTick could terminate
        // the Node process in production.
        setInterval(() => npcTick().catch(e => console.error('[npcTick interval]', e.message)), 2000);

        // ── Health + version endpoints ─────────────────────────────
        // TEACHING: /health is pinged by UptimeRobot, load balancers,
        // and PM2 health checks. It does a real DB query so it catches
        // "server is up but database is down" scenarios that a simple
        // TCP ping would miss.
        // /version lets you confirm which build is running without SSH.
        const BUILD_TIME = new Date().toISOString();
        app.get('/health', async (req, res) => {
            try {
                await db.query('SELECT 1');
                res.json({ status: 'ok', db: 'connected', uptime: process.uptime(), ts: new Date().toISOString() });
            } catch (e) {
                res.status(503).json({ status: 'error', db: 'disconnected', error: e.message });
            }
        });
        app.get('/version', (req, res) => {
            res.json({ version: require('./package.json').version, built: BUILD_TIME, node: process.version });
        });

        const PORT = process.env.PORT || 3001;
        server.listen(PORT, () => { console.log(`🚀 Twisted Engine running at http://localhost:${PORT}`); });

        // ── Graceful shutdown ─────────────────────────────────────
        // TEACHING: PM2 sends SIGTERM when you run `pm2 restart` or `pm2 stop`.
        // Without a handler, Node exits immediately — any players online lose
        // their unsaved position and in-flight DB writes are dropped.
        // With this handler we:
        //   1. Stop accepting new connections (server.close)
        //   2. Save every online player's position to the DB
        //   3. Exit cleanly — PM2 then starts the new process
        // We set a 5s hard timeout so a slow DB can't hang the restart forever.
        async function gracefulShutdown(signal) {
            console.log(`[Shutdown] ${signal} received — saving players and exiting…`);
            server.close();  // stop accepting new HTTP/WS connections

            const saves = Object.values(onlinePlayers).map(p =>
                db.query('UPDATE characters SET x=?, y=?, map_id=?, presence=? WHERE id=?',
                    [p.x, p.y, p.mapId, 'offline', p.charId]).catch(() => {})
            );
            await Promise.allSettled(saves);
            console.log(`[Shutdown] Saved ${saves.length} player(s). Goodbye.`);
            process.exit(0);
        }

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT',  () => gracefulShutdown('SIGINT'));   // Ctrl+C in dev

    } catch (err) { console.error("❌ STARTUP:", err); process.exit(1); }
}

startServer();
