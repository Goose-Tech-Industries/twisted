// =============================================================
// server/action-slots.js — Fixed Time-Window Action Slot Engine
// =============================================================
// Generic system for enforcing action limits within time windows.
// Supports multiple modes:
//   - fixed_blocks:  Day split into N equal blocks (e.g. 4x 6hr)
//   - daily_pool:    X uses per day, reset at a fixed time
//   - per_window:    X uses per fixed block
//   - unlimited:     No restriction
//
// Used by training, sparring, movement, meditation — anything
// that needs rate limiting within a campaign's ruleset.
// =============================================================

// ── Cache ────────────────────────────────────────────────────
// Rulesets and action windows are cached for 5 minutes to avoid
// hitting the DB on every action check.
const _cache = {};
const CACHE_TTL = 300000; // 5 min

/**
 * Get the ruleset for a campaign (cached).
 */
async function getRuleset(db, campaignId) {
    const key = `ruleset_${campaignId}`;
    if (_cache[key] && Date.now() - _cache[key].at < CACHE_TTL) return _cache[key].data;

    const [[campaign]] = await db.query(
        'SELECT ruleset_id FROM game_dm_campaigns WHERE id=?', [campaignId]);
    if (!campaign?.ruleset_id) return null;

    const [[ruleset]] = await db.query(
        'SELECT * FROM game_campaign_rulesets WHERE id=? AND is_active=1', [campaign.ruleset_id]);
    if (!ruleset) return null;

    _cache[key] = { data: ruleset, at: Date.now() };
    return ruleset;
}

/**
 * Get action windows for a ruleset (cached).
 */
async function getActionWindows(db, rulesetId) {
    const key = `windows_${rulesetId}`;
    if (_cache[key] && Date.now() - _cache[key].at < CACHE_TTL) return _cache[key].data;

    const [rows] = await db.query(
        'SELECT * FROM game_action_windows WHERE ruleset_id=? AND is_active=1 ORDER BY sort_order', [rulesetId]);

    _cache[key] = { data: rows, at: Date.now() };
    return rows;
}

/**
 * Get modifiers for a race/class within a ruleset (cached).
 */
async function getModifiers(db, rulesetId, raceName, className) {
    const key = `mods_${rulesetId}_${raceName}_${className}`;
    if (_cache[key] && Date.now() - _cache[key].at < CACHE_TTL) return _cache[key].data;

    const [rows] = await db.query(
        `SELECT * FROM game_ruleset_modifiers
         WHERE ruleset_id=? AND is_active=1
         AND ((target_type='race' AND target_name=?) OR (target_type='class' AND target_name=?) OR target_type='status')`,
        [rulesetId, (raceName || '').toLowerCase(), (className || '').toLowerCase()]);

    _cache[key] = { data: rows, at: Date.now() };
    return rows;
}

/**
 * Compute the current time window key for an action.
 * Returns { windowKey, windowIndex, windowStart, windowEnd, isValid }
 */
function getCurrentWindow(actionWindow, now = new Date()) {
    const tz = actionWindow.reset_timezone || 'America/New_York';
    // Get current time in the configured timezone
    const tzNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const hour = tzNow.getHours();
    const dateStr = `${tzNow.getFullYear()}-${String(tzNow.getMonth() + 1).padStart(2, '0')}-${String(tzNow.getDate()).padStart(2, '0')}`;

    if (actionWindow.window_type === 'daily_pool') {
        // Daily pool: everything resets at reset_time
        const [resetH, resetM] = (actionWindow.reset_time || '00:00').split(':').map(Number);
        const resetMinutes = resetH * 60 + resetM;
        const nowMinutes = hour * 60 + tzNow.getMinutes();
        // If before reset time, we're in "yesterday's" pool
        const poolDate = nowMinutes < resetMinutes
            ? new Date(tzNow.getTime() - 86400000)
            : tzNow;
        const poolDateStr = `${poolDate.getFullYear()}-${String(poolDate.getMonth() + 1).padStart(2, '0')}-${String(poolDate.getDate()).padStart(2, '0')}`;
        return {
            windowKey: `${poolDateStr}_daily`,
            windowIndex: 0,
            isValid: true,
        };
    }

    if (actionWindow.window_type === 'fixed_blocks' || actionWindow.window_type === 'per_window') {
        const blockCount = actionWindow.block_count || 4;
        const blockStartHour = actionWindow.block_start_hour ?? 0;
        const hoursPerBlock = 24 / blockCount;

        // Calculate which block we're in
        let adjustedHour = (hour - blockStartHour + 24) % 24;
        const blockIndex = Math.floor(adjustedHour / hoursPerBlock);

        // Handle day boundary: if block start pushes us to "previous day"
        let blockDate = dateStr;
        if (hour < blockStartHour) {
            const yesterday = new Date(tzNow.getTime() - 86400000);
            blockDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
        }

        return {
            windowKey: `${blockDate}_W${blockIndex}`,
            windowIndex: blockIndex,
            blockStartHour: (blockStartHour + blockIndex * hoursPerBlock) % 24,
            blockEndHour: (blockStartHour + (blockIndex + 1) * hoursPerBlock) % 24,
            isValid: true,
        };
    }

    // unlimited
    return { windowKey: 'unlimited', windowIndex: 0, isValid: true };
}

/**
 * Check if a character can perform an action right now.
 * Returns { allowed, remaining, reason, windowInfo }
 */
async function canPerformAction(db, { characterId, campaignId, actionType, raceName, className }) {
    const ruleset = await getRuleset(db, campaignId);
    if (!ruleset) return { allowed: true, remaining: null, reason: 'No ruleset — unrestricted' };

    const windows = await getActionWindows(db, ruleset.id);
    const actionWindow = windows.find(w => w.action_type === actionType);
    if (!actionWindow) return { allowed: true, remaining: null, reason: 'Action not configured — unrestricted' };

    if (actionWindow.window_type === 'unlimited') {
        return { allowed: true, remaining: null, reason: 'Unlimited' };
    }

    const windowInfo = getCurrentWindow(actionWindow);

    // Get modifiers for extra uses
    const modifiers = await getModifiers(db, ruleset.id, raceName, className);
    const extraUses = modifiers
        .filter(m => !m.action_type || m.action_type === actionType)
        .reduce((sum, m) => sum + (m.extra_uses || 0), 0);

    // Determine max uses for this check
    let maxUses;
    if (actionWindow.window_type === 'daily_pool') {
        maxUses = (actionWindow.max_uses_per_day || 99) + extraUses;
    } else {
        // per_window or fixed_blocks
        maxUses = (actionWindow.max_uses_per_window || 1) + extraUses;
    }

    // Count existing uses in this window
    const [[countRow]] = await db.query(
        `SELECT COUNT(*) as c FROM game_character_action_log
         WHERE character_id=? AND action_type=? AND window_key=?
         ${campaignId ? 'AND campaign_id=?' : ''}`,
        campaignId
            ? [characterId, actionType, windowInfo.windowKey, campaignId]
            : [characterId, actionType, windowInfo.windowKey]
    );
    const used = countRow?.c || 0;
    const remaining = Math.max(0, maxUses - used);

    if (used >= maxUses) {
        return {
            allowed: false,
            remaining: 0,
            used,
            maxUses,
            reason: `${actionWindow.label} limit reached (${used}/${maxUses} this window)`,
            windowInfo,
        };
    }

    return { allowed: true, remaining, used, maxUses, windowInfo };
}

/**
 * Record that a character performed an action.
 */
async function recordAction(db, { characterId, campaignId, actionType, resultJson }) {
    const ruleset = campaignId ? await getRuleset(db, campaignId) : null;
    let windowKey = 'unlimited';

    if (ruleset) {
        const windows = await getActionWindows(db, ruleset.id);
        const actionWindow = windows.find(w => w.action_type === actionType);
        if (actionWindow && actionWindow.window_type !== 'unlimited') {
            windowKey = getCurrentWindow(actionWindow).windowKey;
        }
    }

    await db.query(
        `INSERT INTO game_character_action_log (character_id, campaign_id, action_type, window_key, result_json)
         VALUES (?,?,?,?,?)`,
        [characterId, campaignId || null, actionType, windowKey, resultJson ? JSON.stringify(resultJson) : null]
    );
}

/**
 * Get all action slot statuses for a character (for UI display).
 * Returns array of { actionType, label, icon, used, maxUses, remaining, windowInfo }
 */
async function getActionSlotStatus(db, { characterId, campaignId, raceName, className }) {
    const ruleset = await getRuleset(db, campaignId);
    if (!ruleset) return [];

    const windows = await getActionWindows(db, ruleset.id);
    const modifiers = await getModifiers(db, ruleset.id, raceName, className);
    const results = [];

    for (const aw of windows) {
        if (aw.window_type === 'unlimited') {
            results.push({
                actionType: aw.action_type, label: aw.label, icon: aw.icon,
                used: 0, maxUses: null, remaining: null, unlimited: true,
            });
            continue;
        }

        const windowInfo = getCurrentWindow(aw);
        const extraUses = modifiers
            .filter(m => !m.action_type || m.action_type === aw.action_type)
            .reduce((sum, m) => sum + (m.extra_uses || 0), 0);

        let maxUses = aw.window_type === 'daily_pool'
            ? (aw.max_uses_per_day || 99) + extraUses
            : (aw.max_uses_per_window || 1) + extraUses;

        const [[countRow]] = await db.query(
            `SELECT COUNT(*) as c FROM game_character_action_log
             WHERE character_id=? AND action_type=? AND window_key=?
             ${campaignId ? 'AND campaign_id=?' : ''}`,
            campaignId
                ? [characterId, aw.action_type, windowInfo.windowKey, campaignId]
                : [characterId, aw.action_type, windowInfo.windowKey]
        );
        const used = countRow?.c || 0;

        results.push({
            actionType: aw.action_type, label: aw.label, icon: aw.icon,
            used, maxUses, remaining: Math.max(0, maxUses - used),
            windowInfo,
            requiresOpponent: !!aw.requires_opponent,
            requiresMaster: !!aw.requires_master,
        });
    }

    return results;
}

/**
 * Get move limit for a campaign.
 * Returns { allowed, remaining, maxMoves, tilesPerMove, flyingBonus }
 */
async function checkMoveLimit(db, { characterId, campaignId, raceName, className, isFlying }) {
    const ruleset = await getRuleset(db, campaignId);
    if (!ruleset || !ruleset.moves_per_day) return { allowed: true, remaining: null };

    const tz = ruleset.move_reset_timezone || 'America/New_York';
    const now = new Date();
    const tzNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));

    // Determine pool date based on move_reset_time
    let poolDate = tzNow;
    if (ruleset.move_reset_time) {
        const [resetH, resetM] = ruleset.move_reset_time.split(':').map(Number);
        const resetMinutes = resetH * 60 + resetM;
        const nowMinutes = tzNow.getHours() * 60 + tzNow.getMinutes();
        if (nowMinutes < resetMinutes) {
            poolDate = new Date(tzNow.getTime() - 86400000);
        }
    }
    const dateStr = `${poolDate.getFullYear()}-${String(poolDate.getMonth() + 1).padStart(2, '0')}-${String(poolDate.getDate()).padStart(2, '0')}`;
    const windowKey = `${dateStr}_move`;

    // Modifiers for extra moves or tile overrides
    const modifiers = await getModifiers(db, ruleset.id, raceName, className);
    const extraMoves = modifiers
        .filter(m => !m.action_type || m.action_type === 'move')
        .reduce((sum, m) => sum + (m.extra_uses || 0), 0);

    const maxMoves = ruleset.moves_per_day + extraMoves;
    let tilesPerMove = ruleset.tiles_per_move || 3;
    const flyingBonus = ruleset.flying_tile_bonus || 0;

    // Check for tile override from race modifier
    const tileOverride = modifiers.find(m =>
        m.tiles_per_move_override && (!m.action_type || m.action_type === 'move'));
    if (tileOverride) tilesPerMove = tileOverride.tiles_per_move_override;
    if (isFlying) tilesPerMove += flyingBonus;

    const [[countRow]] = await db.query(
        `SELECT COUNT(*) as c FROM game_character_action_log
         WHERE character_id=? AND action_type='move' AND window_key=?
         ${campaignId ? 'AND campaign_id=?' : ''}`,
        campaignId
            ? [characterId, windowKey, campaignId]
            : [characterId, windowKey]
    );
    const used = countRow?.c || 0;
    const remaining = Math.max(0, maxMoves - used);

    return {
        allowed: used < maxMoves,
        remaining,
        used,
        maxMoves,
        tilesPerMove,
        flyingBonus,
        windowKey,
        reason: used >= maxMoves ? `Movement limit reached (${maxMoves} moves/day). Resets at ${ruleset.move_reset_time || 'midnight'}.` : null,
    };
}

/**
 * Get training gain multiplier for a race/class/action combo.
 */
async function getGainMultiplier(db, { rulesetId, raceName, className, actionType }) {
    const modifiers = await getModifiers(db, rulesetId, raceName, className);
    let multiplier = 1.0;
    let flatBonus = 0;

    for (const mod of modifiers) {
        if (mod.action_type && mod.action_type !== actionType) continue;
        multiplier *= parseFloat(mod.multiplier) || 1.0;
        flatBonus += mod.flat_bonus || 0;
    }

    return { multiplier, flatBonus };
}

/**
 * Clear the cache (call after admin edits a ruleset).
 */
function clearCache(rulesetId) {
    if (rulesetId) {
        for (const key of Object.keys(_cache)) {
            if (key.includes(`_${rulesetId}`) || key.includes(`ruleset_`)) {
                delete _cache[key];
            }
        }
    } else {
        for (const key of Object.keys(_cache)) delete _cache[key];
    }
}

module.exports = {
    getRuleset,
    getActionWindows,
    getModifiers,
    getCurrentWindow,
    canPerformAction,
    recordAction,
    getActionSlotStatus,
    checkMoveLimit,
    getGainMultiplier,
    clearCache,
};
