// =================================================================
// TWISTED ENGINE - SERVER v5.0 (The Authority)
// =================================================================
// TEACHING: This is the "brain". It connects to MySQL, serves files,
// handles login/save requests (HTTP), and real-time movement (WebSocket).
// RUN: npm install && node server.js → http://localhost:3000
//
// MODULES:
//   server/state.js         — shared in-memory state + helpers
//   server/socket-game.js   — join, move, teleport, interact, equip
//   server/socket-npc.js    — NPC talk, companions, training
//   server/socket-battle.js — all combat socket handlers
//   server/socket-social.js — chat, guild, trade, party, minigames
//   server/npc-systems.js   — NPC memory, reputation, chatter, rumors
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
process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION]', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err);
});

// ── Route imports ────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const adminRoutes = require('./routes/admin');
const questRoutes = require('./routes/questRoutes');
const progressionRoutes = require('./routes/progressionRoutes');
const artifactRoutes = require('./routes/artifactRoutes');
const partyRoutes = require('./routes/partyRoutes');
const guildRoutes = require('./routes/guildRoutes');
const craftingRoutes = require('./routes/crafting');
const auctionRoutes  = require('./routes/auction');
const Scheduler = require('./scheduler');
const { handleMapEvent, executeActions } = require('./event_runner');
const redisModule = require('./server/redis');
const BattleManager = require('./battle_engine');
const gmCommands    = require('./gm_commands');

// ── Shared state ─────────────────────────────────────────────────
const state = require('./server/state');

// ── Socket handler modules ───────────────────────────────────────
const registerGameHandlers   = require('./server/socket-game');
const registerNpcHandlers    = require('./server/socket-npc');
const registerBattleHandlers = require('./server/socket-battle');
const registerSocialHandlers = require('./server/socket-social');
const npcSystems             = require('./server/npc-systems');

// =================================================================
// EXPRESS APP + HTTP SERVER
// =================================================================
const app = express();
const server = http.createServer(app);

// ── Production startup guard (fail-closed) ────────────────────────
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
        console.warn('[WARN] DB_PASS is empty. Set a strong database password in production.');
    }
    console.log('[Startup] ✅ Production env validated — secrets present');
}

const io = new Server(server, {
    pingInterval: 25000,
    pingTimeout:  45000,
    transports: ['websocket'],
    cors: {
        origin: process.env.ALLOWED_ORIGIN || true,
        credentials: true,
        methods: ['GET', 'POST']
    }
});

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// ── CORS ─────────────────────────────────────────────────────────
const allowedOrigin = process.env.ALLOWED_ORIGIN ||
    (process.env.NODE_ENV === 'production' ? (() => { throw new Error('ALLOWED_ORIGIN required in production'); })() : true);
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// ── Security headers ─────────────────────────────────────────────
app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));

// ── Request logging ──────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
    const logDir = process.env.LOG_DIR || './logs';
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const accessLog = fs.createWriteStream(`${logDir}/access.log`, { flags: 'a' });
    app.use(morgan('combined', { stream: accessLog }));
} else {
    app.use(morgan('dev'));
}

// ── Session middleware ────────────────────────────────────────────
const DB_CONFIG = {
    host:     process.env.DB_HOST || 'localhost',
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'twisted_rpg',
    charset:  'utf8mb4',
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Try Redis session store first (for multi-instance), fall back to MySQL, then memory
let sessionStore = undefined;
const redisSessionStore = redisModule.createSessionStore(session);
if (redisSessionStore) {
    sessionStore = redisSessionStore;
} else {
    try {
        const MySQLStore = require('express-mysql-session')(session);
        sessionStore = new MySQLStore({
            host: DB_CONFIG.host, port: DB_CONFIG.port || 3306,
            user: DB_CONFIG.user, password: DB_CONFIG.password,
            database: DB_CONFIG.database, charset: 'utf8mb4',
            enableKeepAlive: true, keepAliveInitialDelay: 30000,
            createDatabaseTable: true,
            checkExpirationInterval: 15 * 60 * 1000,
            expiration: 7 * 24 * 60 * 60 * 1000,
            schema: { tableName: 'sessions', columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' } }
        });
        console.log('[Session] MySQL session store connected — sessions survive restarts ✅');
    } catch (e) {
        console.warn('[Session] Using MemoryStore. Install express-mysql-session for persistence.');
    }
}

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'change-this-in-production-PLEASE',
    resave: false, saveUninitialized: false, store: sessionStore,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 }
});
app.use(sessionMiddleware);

// ── Rate limiting ────────────────────────────────────────────────
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' } });
const apiLimiter  = rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
const adminLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Rate limit exceeded on admin endpoint.' } });
app.use('/login', authLimiter); app.use('/register', authLimiter);
app.use('/auth/login', authLimiter); app.use('/auth/register', authLimiter);
app.use('/api/', apiLimiter);
app.use('/admin-panel/', adminLimiter); app.use('/admin/', adminLimiter);

io.engine.use(sessionMiddleware);

// ── Static routes ────────────────────────────────────────────────
app.use(express.static('public'));
app.get('/profile/:name', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'profile.html')); });
app.get('/join', (req, res) => {
    const ref = (req.query.ref || '').trim().toUpperCase().slice(0, 16);
    if (ref) return res.redirect(`/?ref=${encodeURIComponent(ref)}#register`);
    res.redirect('/');
});
app.get('/card/:name', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'card.html')); });
app.use('/adminsauce', express.static(path.join(__dirname, 'public', 'adminsauce')));
app.use('/sauce', express.static(path.join(__dirname, 'public', 'adminsauce')));
app.use('/modpanel', express.static(path.join(__dirname, 'public', 'modpanel')));

// =================================================================
// START SERVER
// =================================================================
async function startServer() {
    try {
        // ── Redis (optional — for multi-instance scaling) ────────
        await redisModule.initRedis();
        await redisModule.attachSocketAdapter(io);

        const db = mysql.createPool(DB_CONFIG);
        await db.query('SELECT 1');
        console.log('[DB] Connected to MySQL/MariaDB ✅');
        await db.query("SELECT 1");
        console.log("✅ DATABASE CONNECTED (Pool Mode)");

        // Store db globally for state helpers
        state._db = db;
        global._io = io;

        // ── Initialize routes ────────────────────────────────────
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
        app.use('/', authRoutes);
        app.use('/auth', authRoutes);
        app.use('/game', gameRoutes);
        app.use('/', adminRoutes);
        app.use('/api/quests', questRoutes);
        app.use('/api/progression', progressionRoutes);
        app.use('/api/artifacts', artifactRoutes);
        app.use('/api/party', partyRoutes);
        app.use('/api/mail', mailRoutes);

        const leaderboardRoutes = require('./routes/leaderboard');
        leaderboardRoutes.init(db); app.use('/api/leaderboard', leaderboardRoutes);
        const achievementRoutes = require('./routes/achievementRoutes');
        achievementRoutes.init(db, io); app.use('/api/achievements', achievementRoutes);
        const guestbookRoutes = require('./routes/guestbookRoutes');
        guestbookRoutes.init(db); app.use('/api/guestbook', guestbookRoutes);
        const spotifyRoutes = require('./routes/spotifyRoutes');
        spotifyRoutes.init(db); app.use('/api/spotify', spotifyRoutes);
        setImmediate(() => { try { spotifyRoutes.startSyncJob(db); } catch (e) { console.error('[Spotify] startSyncJob failed (non-fatal):', e.message); } });
        const guildNewsRoutes = require('./routes/guildNewsRoutes');
        guildNewsRoutes.init(db); app.use('/api/guild-news', guildNewsRoutes);
        global._guildNews = guildNewsRoutes;
        const lfpRoutes = require('./routes/lfpRoutes');
        lfpRoutes.init(db); app.use('/api/lfp', lfpRoutes);
        app.use('/api/guild', guildRoutes);
        craftingRoutes.init(db); app.use('/api/crafting', craftingRoutes);
        auctionRoutes.init(db); app.use('/api/auction', auctionRoutes);
        const questboardRoutes = require('./routes/questboard');
        questboardRoutes.init(db); app.use('/api/questboard', questboardRoutes);
        const worldForgeRoutes = require('./routes/worldForge');
        if (worldForgeRoutes.init) worldForgeRoutes.init(db);
        app.use('/admin/world-forge', worldForgeRoutes);
        const adminPanelRoutes = require('./routes/adminPanel');
        adminPanelRoutes.init(db, io); app.use('/admin-panel', adminPanelRoutes);
        const assetRoutes = require('./routes/assetRoutes');
        assetRoutes.init(db); app.use('/assets-api', assetRoutes);
        const modPanelRoutes = require('./routes/modPanel');
        modPanelRoutes.init(db, io); app.use('/mod-panel', modPanelRoutes);
        const rulesetRoutes = require('./routes/rulesetRoutes');
        app.use('/admin/api', rulesetRoutes(db));
        console.log("✅ ROUTES ACTIVE");

        // ── Admin endpoints ──────────────────────────────────────
        app.post('/admin/clear-cache', async (req, res) => {
            try {
                const userId = req.session && req.session.userId;
                if (!await state.isStaff(db, userId)) return res.status(403).json({ success: false, message: 'Forbidden' });
                const { mapId: rawMapId, reloadRegions } = req.body;
                const mapId = rawMapId ? parseInt(rawMapId) : null;
                if (mapId) delete state.mapCache[mapId]; else Object.keys(state.mapCache).forEach(k => delete state.mapCache[k]);
                if (reloadRegions && global.loadRegionState) await global.loadRegionState();
                if (mapId) {
                    const freshMap = await state.getMapData(db, parseInt(mapId));
                    if (freshMap) io.to('map_' + mapId).emit('map_data', freshMap);
                }
                res.json({ success: true });
            } catch (e) { console.error('clear-cache error:', e); res.status(500).json({ success: false, message: 'Server error' }); }
        });

        app.post('/admin/sync-enemy', async (req, res) => {
            try {
                const userId = req.session && req.session.userId;
                if (!await state.isStaff(db, userId)) return res.status(403).json({ success: false, message: 'Forbidden' });
                const { npcId, name, icon, stats: npcStats } = req.body;
                if (!npcId || !name || !npcStats) return res.json({ success: false, message: 'Missing npcId, name, or stats.' });
                const internalName = `[NPC:${npcId}] ${name}`;
                const [npcRows] = await db.query('SELECT char_id FROM game_npcs WHERE id=?', [npcId]);
                if (!npcRows.length) return res.json({ success: false, message: 'NPC not found.' });
                const existingCharId = npcRows[0].char_id;
                const hp = parseInt(npcStats.max_hp) || 100, mp = parseInt(npcStats.max_mp) || 30, lvl = parseInt(npcStats.level) || 1;
                if (existingCharId) {
                    await db.query(`UPDATE characters SET name=?, level=?, max_hp=?, current_hp=?, max_mp=?, current_mp=?, atk=?, def=?, mo=?, md=?, speed=?, luck=? WHERE id=?`,
                        [internalName, lvl, hp, hp, mp, mp, parseInt(npcStats.atk)||10, parseInt(npcStats.def)||5, parseInt(npcStats.mo)||5, parseInt(npcStats.md)||5, parseInt(npcStats.speed)||8, parseInt(npcStats.luck)||5, existingCharId]);
                    res.json({ success: true, charId: existingCharId, updated: true });
                } else {
                    const [result] = await db.query(`INSERT INTO characters (user_id, name, level, max_hp, current_hp, max_mp, current_mp, atk, def, mo, md, speed, luck, map_id, x, y) VALUES (0,?,?,?,?,?,?,?,?,?,?,?,?,1,0,0)`,
                        [internalName, lvl, hp, hp, mp, mp, parseInt(npcStats.atk)||10, parseInt(npcStats.def)||5, parseInt(npcStats.mo)||5, parseInt(npcStats.md)||5, parseInt(npcStats.speed)||8, parseInt(npcStats.luck)||5]);
                    await db.query('UPDATE game_npcs SET char_id=? WHERE id=?', [result.insertId, npcId]);
                    res.json({ success: true, charId: result.insertId, updated: false });
                }
            } catch (e) { console.error('sync-enemy error:', e); res.status(500).json({ success: false, message: e.message }); }
        });

        // ── Load world flags ─────────────────────────────────────
        await state.loadWorldFlags(db);

        // ── Scheduler + intervals ────────────────────────────────
        setTimeout(() => {
            Scheduler.init(db, io, state.onlinePlayers);
            if (Scheduler.startLfpCleanup) Scheduler.startLfpCleanup(db);
            if (Scheduler.startProfileViewerCleanup) Scheduler.startProfileViewerCleanup(db);

            // Day/Night Cycle
            if (!global._worldTime) global._worldTime = {};
            setInterval(async () => {
                try {
                    const [worlds] = await db.query('SELECT id, day_cycle_enabled, day_cycle_minutes, day_start_hour, night_start_hour FROM game_worlds WHERE is_active=1');
                    for (const w of worlds) {
                        if (!w.day_cycle_enabled) continue;
                        const cycleMs = (w.day_cycle_minutes || 360) * 60 * 1000;
                        const progress = (Date.now() % cycleMs) / cycleMs;
                        const hour = Math.floor(progress * 24);
                        const dayStart = w.day_start_hour || 6, nightStart = w.night_start_hour || 20;
                        let phase;
                        if (hour >= dayStart && hour < dayStart + 2) phase = 'dawn';
                        else if (hour >= dayStart + 2 && hour < nightStart - 1) phase = 'day';
                        else if (hour >= nightStart - 1 && hour < nightStart + 1) phase = 'dusk';
                        else phase = 'night';
                        const darkness = phase === 'night' ? 0.6 : phase === 'dusk' ? 0.3 : phase === 'dawn' ? 0.2 : 0;
                        global._worldTime[w.id] = { hour, phase, darkness, progress };
                    }
                    io.emit('world_time', global._worldTime);
                } catch {}
            }, 30000);

            // NPC Schedule
            setInterval(async () => {
                try {
                    const [npcs] = await db.query("SELECT id, name, map_id, default_map_id, schedule_json, x, y FROM game_npcs WHERE schedule_json IS NOT NULL AND is_dead=0");
                    const hour = global._worldTime?.[1]?.hour ?? new Date().getHours();
                    for (const npc of npcs) {
                        try {
                            const schedule = typeof npc.schedule_json === 'string' ? JSON.parse(npc.schedule_json) : npc.schedule_json;
                            if (!Array.isArray(schedule)) continue;
                            const entry = schedule.find(s => hour >= s.start_hour && hour < s.end_hour);
                            if (!entry) continue;
                            const targetMap = entry.map_id || npc.default_map_id || npc.map_id;
                            const targetX = entry.x ?? npc.x, targetY = entry.y ?? npc.y;
                            if (targetMap !== npc.map_id || targetX !== npc.x || targetY !== npc.y) {
                                await db.query('UPDATE game_npcs SET map_id=?, x=?, y=? WHERE id=?', [targetMap, targetX, targetY, npc.id]);
                                if (targetMap !== npc.map_id) {
                                    io.to('map_' + npc.map_id).emit('npc_left', { npcId: npc.id, name: npc.name });
                                    io.to('map_' + targetMap).emit('npc_arrived', { npcId: npc.id, name: npc.name, x: targetX, y: targetY });
                                }
                            }
                        } catch {}
                    }
                } catch {}
            }, 60000);

            // Dynamic Economy
            setInterval(async () => {
                try {
                    const [txns] = await db.query(`SELECT item_id, region_id, SUM(CASE WHEN transaction_type='buy' THEN quantity ELSE 0 END) as bought, SUM(CASE WHEN transaction_type='sell' THEN quantity ELSE 0 END) as sold FROM game_economy_transactions WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR) GROUP BY item_id, region_id`);
                    for (const tx of txns) {
                        const modifier = Math.max(0.5, Math.min(2.0, 1.0 + (tx.bought || 0) * 0.02 - (tx.sold || 0) * 0.015));
                        await db.query(`INSERT INTO game_economy_state (item_id, region_id, price_modifier, demand, supply) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE price_modifier=VALUES(price_modifier), demand=VALUES(demand), supply=VALUES(supply)`, [tx.item_id, tx.region_id, modifier, tx.bought || 0, tx.sold || 0]);
                    }
                    await db.query(`UPDATE game_economy_state SET price_modifier = price_modifier * 0.95 + 0.05 WHERE last_updated < DATE_SUB(NOW(), INTERVAL 30 MINUTE) AND price_modifier != 1.00`);
                } catch {}
            }, 300000);

            // Dynamic World Events
            setInterval(async () => {
                try {
                    const [events] = await db.query("SELECT * FROM game_world_events WHERE (event_type='random' OR event_type='recurring') AND is_active=0 AND trigger_json IS NOT NULL");
                    for (const ev of events) {
                        const trigger = typeof ev.trigger_json === 'string' ? JSON.parse(ev.trigger_json) : ev.trigger_json;
                        const chance = (trigger?.chance_per_hour || 5) / 12;
                        if (Math.random() * 100 > chance) continue;
                        if (trigger?.time_of_day && global._worldTime?.[1]?.phase !== trigger.time_of_day) continue;
                        const duration = ev.duration_minutes || 60;
                        await db.query('UPDATE game_world_events SET is_active=1, started_at=NOW(), expires_at=DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id=?', [duration, ev.id]);
                        const effects = typeof ev.effects_json === 'string' ? JSON.parse(ev.effects_json) : ev.effects_json;
                        if (effects?.notification) io.emit('world_event', { id: ev.id, name: ev.name, description: ev.description, notification: effects.notification, duration });
                        console.log(`[WorldEvent] Activated: ${ev.name} (${duration}min)`);
                        break;
                    }
                    // Expire finished events + log history
                    const [expiring] = await db.query('SELECT * FROM game_world_events WHERE is_active=1 AND expires_at < NOW()');
                    for (const exp of expiring) {
                        const [[pCount]] = await db.query('SELECT COUNT(*) as c FROM game_world_event_participants WHERE event_id=?', [exp.id]);
                        await db.query(
                            `INSERT INTO game_world_event_history (event_id, event_name, outcome, participant_count, duration_actual) VALUES (?,?,?,?,?)`,
                            [exp.id, exp.name, 'completed', pCount?.c || 0, exp.duration_minutes || 60]);
                        await db.query('UPDATE game_world_events SET is_active=0, current_phase=0 WHERE id=?', [exp.id]);
                        io.emit('world_event', { id: exp.id, name: exp.name, type: 'event_ended', notification: `${exp.name} has ended!` });
                        console.log(`[WorldEvent] Expired: ${exp.name} (${pCount?.c || 0} participants)`);
                    }
                } catch {}
            }, 300000);
        }, 3000);

        // ── NPC Systems globals ───────────────────────────────────
        global.getNpcsForMap = npcSystems.getNpcsForMap;
        global._addRumor = npcSystems._addRumor;
        global._getNpcState = () => npcSystems.npcState;

        // ── Socket connection handler ────────────────────────────
        io.on('connection', (socket) => {
            console.log('⚡ SOCKET:', socket.id);
            const ctx = {
                db, io, state, BattleManager, handleMapEvent, executeActions, gmCommands, npcSystems,
                // NPC system methods (bind db where needed)
                loadMapNpcs:                  (mapId) => npcSystems.loadMapNpcs(db, mapId),
                getNpcsForMap:                npcSystems.getNpcsForMap,
                loadCompanions:               (charId) => npcSystems.loadCompanions(db, charId),
                getActiveCompanions:          npcSystems.getActiveCompanions,
                spawnCompanionsAtPlayer:       npcSystems.spawnCompanionsAtPlayer,
                _triggerCrowdReaction:         npcSystems._triggerCrowdReaction,
                _triggerEnvironmentalReaction:  npcSystems._triggerEnvironmentalReaction,
                _deriveTitle:                  npcSystems._deriveTitle,
            };
            registerGameHandlers(socket, ctx);
            registerNpcHandlers(socket, ctx);
            registerBattleHandlers(socket, ctx);
            registerSocialHandlers(socket, ctx);
        });

        // ── NPC tick intervals ───────────────────────────────────
        setInterval(() => npcSystems.npcMoveTick(db, io).catch(e => console.error('[npcMove]', e.message)), 2000);
        setInterval(() => npcSystems.npcNeedsTick(db, io).catch(e => console.error('[npcNeeds]', e.message)), 45000);
        setInterval(() => npcSystems.npcChatterTick(db, io).catch(e => console.error('[npcChatter]', e.message)), 15000);
        setInterval(() => npcSystems.rumorSpreadTick(db).catch(e => console.error('[rumorSpread]', e.message)), 30000);

        // ── Ground item & structure expiry cleanup (every 60s) ──
        setInterval(async () => {
            try {
                await db.query('DELETE FROM game_map_ground_items WHERE expires_at IS NOT NULL AND expires_at < NOW()');
                await db.query('UPDATE game_deployed_structures SET is_active=0 WHERE expires_at IS NOT NULL AND expires_at < NOW() AND is_active=1');
            } catch {}
        }, 60000);

        // ── Health + version endpoints ───────────────────────────
        const BUILD_TIME = new Date().toISOString();
        app.get('/health', async (req, res) => {
            try { await db.query('SELECT 1'); res.json({ status: 'ok', db: 'connected', uptime: process.uptime(), ts: new Date().toISOString() }); }
            catch (e) { res.status(503).json({ status: 'error', db: 'disconnected', error: e.message }); }
        });
        app.get('/version', (req, res) => {
            res.json({ version: require('./package.json').version, built: BUILD_TIME, node: process.version });
        });

        const PORT = process.env.PORT || 3001;
        server.listen(PORT, () => { console.log(`🚀 Twisted Engine running at http://localhost:${PORT}`); });

        // ── Graceful shutdown ────────────────────────────────────
        async function gracefulShutdown(signal) {
            console.log(`[Shutdown] ${signal} received — saving players and exiting…`);
            server.close();
            const saves = Object.values(state.onlinePlayers).map(p =>
                db.query('UPDATE characters SET x=?, y=?, map_id=?, presence=? WHERE id=?',
                    [p.x, p.y, p.mapId, 'offline', p.charId]).catch(() => {})
            );
            await Promise.allSettled(saves);
            await redisModule.shutdown();
            console.log(`[Shutdown] Saved ${saves.length} player(s). Goodbye.`);
            process.exit(0);
        }
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

    } catch (err) { console.error("❌ STARTUP:", err); process.exit(1); }
}

startServer();
