// =================================================================
// BUFF SYSTEM — Stacking, Categories, Cleanse, Immunity
// =================================================================
// Enhances the existing status system with:
//   - Stack rules: stackable (up to N), refresh, or overwrite
//   - Categories: offensive, defensive, utility (for targeted dispels)
//   - Cleanse/Dispel: remove enemy buffs or ally debuffs
//   - Immunity windows: can't reapply a status for X turns after removal
//   - Undispellable flag: boss enrages, story buffs
// =================================================================

// ─── Status Categories ───────────────────────────────────────────
const STATUS_CATEGORIES = {
    offensive: 'offensive',   // ATK up, crit up, damage buffs
    defensive: 'defensive',   // DEF up, regen, barriers
    utility: 'utility',       // haste, stealth, flight
    debuff: 'debuff',         // poison, burn, blind, slow
    cc: 'cc',                 // stun, freeze, sleep, charm
};

// ─── Enhanced Apply Status ───────────────────────────────────────
// Wraps the existing applyStatus with stacking + immunity logic.
// Call this INSTEAD of the raw applyStatus when stacking rules matter.

function enhancedApplyStatus(target, statusData, duration, settings, result) {
    const statusName = statusData.name || statusData;
    const statusId = statusData.id;
    const stackMode = statusData.stack_mode || settings?.default_stack_mode || 'refresh';
    // stack_mode: 'refresh' (default — reset duration), 'stack' (add another), 'overwrite' (replace), 'ignore' (don't apply if exists)
    const maxStacks = statusData.max_stacks || settings?.default_max_stacks || 5;
    const category = statusData.category || 'debuff';
    const undispellable = statusData.undispellable || false;

    // ── Immunity check ──────────────────────────────────────
    if (settings?.enable_status_immunity) {
        if (!target._statusImmunity) target._statusImmunity = {};
        const immuneUntil = target._statusImmunity[statusName];
        if (immuneUntil && immuneUntil > 0) {
            if (result) result.log.push(`${target.name} is immune to ${statusName}! (${immuneUntil} turns remaining)`);
            return false;
        }
    }

    // ── Find existing instances ─────────────────────────────
    if (!target.statuses) target.statuses = [];
    const existingAll = target.statuses.filter(s =>
        (s.id && s.id === statusId) || (s.name && s.name.toLowerCase() === String(statusName).toLowerCase())
    );

    switch (stackMode) {
        case 'refresh': {
            // Same status = reset duration (existing behavior)
            if (existingAll.length > 0) {
                existingAll[0].turns = duration;
                existingAll[0]._stacks = 1;
                if (result) result.log.push(`${statusData.icon || ''} ${target.name}'s ${statusName} refreshed! (${duration} turns)`);
                return true;
            }
            break;
        }

        case 'stack': {
            // Add another stack up to max
            const currentStacks = existingAll.reduce((sum, s) => sum + (s._stacks || 1), 0);
            if (currentStacks >= maxStacks) {
                // At max — just refresh duration of first
                if (existingAll[0]) existingAll[0].turns = Math.max(existingAll[0].turns, duration);
                if (result) result.log.push(`${statusData.icon || ''} ${statusName} at max stacks (${maxStacks})! Duration refreshed.`);
                return true;
            }
            // Increment stack count on existing
            if (existingAll.length > 0) {
                existingAll[0]._stacks = (existingAll[0]._stacks || 1) + 1;
                existingAll[0].turns = Math.max(existingAll[0].turns, duration);
                if (result) result.log.push(`${statusData.icon || ''} ${target.name}'s ${statusName} x${existingAll[0]._stacks}!`);
                return true;
            }
            break;
        }

        case 'overwrite': {
            // Remove all existing, apply fresh
            target.statuses = target.statuses.filter(s =>
                !((s.id && s.id === statusId) || (s.name && s.name.toLowerCase() === String(statusName).toLowerCase()))
            );
            break;
        }

        case 'ignore': {
            if (existingAll.length > 0) {
                if (result) result.log.push(`${target.name} already has ${statusName}.`);
                return false;
            }
            break;
        }
    }

    // Apply new status
    target.statuses.push({
        id: statusId,
        name: statusName,
        icon: statusData.icon || '',
        turns: duration,
        category,
        undispellable,
        _stacks: 1,
    });

    if (result) result.log.push(`${statusData.icon || ''} ${target.name} is afflicted with ${statusName}! (${duration} turns)`);
    return true;
}

// ─── Cleanse (remove debuffs from ally) ──────────────────────────
function cleanse(target, options, settings, result) {
    if (!target.statuses || !target.statuses.length) {
        if (result) result.log.push(`${target.name} has no statuses to cleanse.`);
        return 0;
    }

    const category = options?.category || null;       // null = all debuffs, or specific category
    const statusName = options?.statusName || null;   // specific status name to remove
    const maxRemove = options?.maxRemove || 99;       // how many to remove
    const immunityDuration = settings?.cleanse_immunity_duration || 0;

    let removed = 0;
    const toRemove = [];

    for (let i = 0; i < target.statuses.length && removed < maxRemove; i++) {
        const s = target.statuses[i];
        if (s.undispellable) continue;

        // Category filter
        if (category && s.category !== category) continue;
        // Name filter
        if (statusName && s.name.toLowerCase() !== statusName.toLowerCase()) continue;
        // Default: only remove debuffs and CC
        if (!category && !statusName && s.category !== 'debuff' && s.category !== 'cc') continue;

        toRemove.push(i);
        removed++;

        if (result) result.log.push(`${s.icon} ${s.name} cleansed from ${target.name}!`);

        // Apply immunity window
        if (immunityDuration > 0 && settings?.enable_status_immunity) {
            if (!target._statusImmunity) target._statusImmunity = {};
            target._statusImmunity[s.name] = immunityDuration;
        }
    }

    target.statuses = target.statuses.filter((_, i) => !toRemove.includes(i));
    return removed;
}

// ─── Dispel (remove buffs from enemy) ────────────────────────────
function dispel(target, options, settings, result) {
    if (!target.statuses || !target.statuses.length) {
        if (result) result.log.push(`${target.name} has no buffs to dispel.`);
        return 0;
    }

    const category = options?.category || null;       // null = all buffs, or specific
    const maxRemove = options?.maxRemove || 99;

    let removed = 0;
    const toRemove = [];

    for (let i = 0; i < target.statuses.length && removed < maxRemove; i++) {
        const s = target.statuses[i];
        if (s.undispellable) continue;

        // Category filter
        if (category && s.category !== category) continue;
        // Default: only remove offensive, defensive, utility (buffs)
        if (!category && s.category !== 'offensive' && s.category !== 'defensive' && s.category !== 'utility') continue;

        toRemove.push(i);
        removed++;

        if (result) result.log.push(`${s.icon} ${s.name} dispelled from ${target.name}!`);
    }

    target.statuses = target.statuses.filter((_, i) => !toRemove.includes(i));
    return removed;
}

// ─── Tick Immunity Windows ───────────────────────────────────────
function tickImmunity(combatant) {
    if (!combatant._statusImmunity) return;
    for (const name of Object.keys(combatant._statusImmunity)) {
        combatant._statusImmunity[name]--;
        if (combatant._statusImmunity[name] <= 0) {
            delete combatant._statusImmunity[name];
        }
    }
}

// ─── Get Stack Count ─────────────────────────────────────────────
function getStacks(combatant, statusName) {
    const s = combatant.statuses?.find(s => s.name?.toLowerCase() === statusName.toLowerCase());
    return s ? (s._stacks || 1) : 0;
}

// ─── Get All Statuses by Category ────────────────────────────────
function getStatusesByCategory(combatant, category) {
    return (combatant.statuses || []).filter(s => s.category === category);
}

module.exports = {
    STATUS_CATEGORIES,
    enhancedApplyStatus,
    cleanse,
    dispel,
    tickImmunity,
    getStacks,
    getStatusesByCategory,
};
