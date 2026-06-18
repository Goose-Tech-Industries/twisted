// =================================================================
// server/redis.js — Optional Redis integration for horizontal scaling
// =================================================================
// When REDIS_URL is set, this module provides:
//   1. Socket.IO Redis adapter (multi-instance pub/sub)
//   2. Shared real-time state (onlinePlayers, companionState)
//   3. Optional Redis session store (connect-redis)
//
// When REDIS_URL is NOT set, everything degrades gracefully to
// in-memory — the server works identically to single-instance mode.
// =================================================================

let redis = null;
let pubClient = null;
let subClient = null;
let isConnected = false;

const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_HOST;
const KEY_PREFIX = 'tw:';

// ── Initialize Redis if configured ─────────────────────────────
async function initRedis() {
    if (!REDIS_URL) {
        console.log('[Redis] No REDIS_URL configured — using in-memory state (single instance mode)');
        return null;
    }

    try {
        const Redis = require('ioredis');
        const url = REDIS_URL.startsWith('redis://') ? REDIS_URL : `redis://${REDIS_URL}`;

        pubClient = new Redis(url, {
            retryStrategy: (times) => Math.min(times * 200, 5000),
            maxRetriesPerRequest: 3,
            lazyConnect: true,
        });
        subClient = pubClient.duplicate();

        await pubClient.connect();
        await subClient.connect();

        redis = pubClient;
        isConnected = true;
        console.log('[Redis] Connected — horizontal scaling enabled ✅');
        return { pubClient, subClient, redis };
    } catch (e) {
        console.warn(`[Redis] Connection failed: ${e.message} — falling back to in-memory`);
        redis = null;
        isConnected = false;
        return null;
    }
}

// ── Socket.IO Redis Adapter ────────────────────────────────────
async function attachSocketAdapter(io) {
    if (!isConnected || !pubClient || !subClient) return false;
    try {
        const { createAdapter } = require('@socket.io/redis-adapter');
        io.adapter(createAdapter(pubClient, subClient));
        console.log('[Redis] Socket.IO Redis adapter attached — multi-instance broadcasting enabled');
        return true;
    } catch (e) {
        console.warn(`[Redis] Socket.IO adapter failed: ${e.message} — using default adapter`);
        return false;
    }
}

// ── Session Store (optional upgrade from MySQL) ────────────────
function createSessionStore(session) {
    if (!isConnected || !redis) return null;
    try {
        const RedisStore = require('connect-redis').default;
        const store = new RedisStore({
            client: redis,
            prefix: KEY_PREFIX + 'sess:',
            ttl: 7 * 24 * 60 * 60, // 7 days in seconds
        });
        console.log('[Redis] Session store created — sessions shared across instances');
        return store;
    } catch (e) {
        console.warn(`[Redis] Session store failed: ${e.message} — using MySQL sessions`);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
// SHARED STATE HELPERS
// When Redis is available, state is shared via Redis hashes.
// When not, these are no-ops and state.js handles everything.
// ═══════════════════════════════════════════════════════════════

// ── Player presence (used by admin panel, "who's online") ──────
async function setPlayerOnline(charId, data) {
    if (!redis) return;
    try {
        await redis.hset(KEY_PREFIX + 'online', String(charId), JSON.stringify(data));
    } catch {}
}

async function removePlayerOnline(charId) {
    if (!redis) return;
    try {
        await redis.hdel(KEY_PREFIX + 'online', String(charId));
    } catch {}
}

async function getOnlineCount() {
    if (!redis) return null; // caller falls back to Object.keys(onlinePlayers).length
    try {
        return await redis.hlen(KEY_PREFIX + 'online');
    } catch { return null; }
}

async function getAllOnlinePlayers() {
    if (!redis) return null;
    try {
        const all = await redis.hgetall(KEY_PREFIX + 'online');
        const result = {};
        for (const [k, v] of Object.entries(all)) {
            try { result[k] = JSON.parse(v); } catch {}
        }
        return result;
    } catch { return null; }
}

// ── Pub/Sub for cross-instance events ──────────────────────────
async function publish(channel, data) {
    if (!redis) return;
    try {
        await redis.publish(KEY_PREFIX + channel, JSON.stringify(data));
    } catch {}
}

async function subscribe(channel, callback) {
    if (!subClient) return;
    try {
        await subClient.subscribe(KEY_PREFIX + channel);
        subClient.on('message', (ch, msg) => {
            if (ch === KEY_PREFIX + channel) {
                try { callback(JSON.parse(msg)); } catch {}
            }
        });
    } catch {}
}

// ── Cache helpers (TTL-based) ──────────────────────────────────
async function cacheGet(key) {
    if (!redis) return null;
    try {
        const val = await redis.get(KEY_PREFIX + key);
        return val ? JSON.parse(val) : null;
    } catch { return null; }
}

async function cacheSet(key, value, ttlSeconds = 300) {
    if (!redis) return;
    try {
        await redis.set(KEY_PREFIX + key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {}
}

// ── Cleanup ────────────────────────────────────────────────────
async function shutdown() {
    if (pubClient) { try { await pubClient.quit(); } catch {} }
    if (subClient) { try { await subClient.quit(); } catch {} }
}

// ═══════════════════════════════════════════════════════════════
module.exports = {
    initRedis,
    attachSocketAdapter,
    createSessionStore,
    setPlayerOnline,
    removePlayerOnline,
    getOnlineCount,
    getAllOnlinePlayers,
    publish,
    subscribe,
    cacheGet,
    cacheSet,
    shutdown,
    get isConnected() { return isConnected; },
    get client() { return redis; },
};
