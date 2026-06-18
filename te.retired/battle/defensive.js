// =================================================================
// DEFENSIVE SYSTEMS — Provoke/Cover + Absorption Barriers
// =================================================================

// ─── Provoke / Cover ─────────────────────────────────────────────
// A tank can "Cover" an ally — when that ally would take damage,
// the covering tank takes the hit instead (or splits it).
// Provoke forces an enemy to attack the provoker.

function applyCover(battle, protector, targetAlly) {
    if (!battle._settings?.enable_cover_system) return { success: false, reason: 'Cover system disabled' };
    if (protector.currentHp <= 0 || protector._knockedOut) return { success: false, reason: 'Protector is down' };
    if (protector.charId === targetAlly.charId) return { success: false, reason: 'Cannot cover yourself' };
    // Prevent cross-team cover — protector must be on the same team as target
    const protectorTeam = battle.getTeamId(protector.charId);
    const targetTeam = battle.getTeamId(targetAlly.charId);
    if (protectorTeam !== targetTeam) return { success: false, reason: 'Cannot cover an enemy' };

    protector._covering = {
        targetCharId: targetAlly.charId,
        turnsLeft: battle._settings.cover_duration || 2,
    };

    return {
        success: true,
        protector: protector.name,
        target: targetAlly.name,
        duration: protector._covering.turnsLeft,
    };
}

// Check if someone is covering the target — returns the coverer or null
function getCoverer(battle, targetCharId) {
    if (!battle._settings?.enable_cover_system) return null;
    for (const c of Object.values(battle.combatants)) {
        if (c._covering && c._covering.targetCharId === targetCharId &&
            c.currentHp > 0 && !c._knockedOut && !c._stunned) {
            return c;
        }
    }
    return null;
}

// Redirect damage from target to coverer. Returns modified damage info.
function resolveCoverIntercept(battle, originalTarget, damage, result) {
    const coverer = getCoverer(battle, originalTarget.charId);
    if (!coverer) return { redirected: false, damage, target: originalTarget };

    const splitPct = battle._settings?.cover_damage_split || 1.0; // 1.0 = coverer takes all
    const covererDamage = Math.floor(damage * splitPct);
    const remainingDamage = damage - covererDamage;

    result.log.push(`🛡️ ${coverer.name} jumps in front of ${originalTarget.name} and takes the hit!`);
    result.actions.push({ type: 'cover', protector: coverer.name, target: originalTarget.name, damage: covererDamage });

    return {
        redirected: true,
        coverer,
        covererDamage,
        remainingDamage, // goes to original target if split < 1.0
        target: coverer,
    };
}

function tickCover(battle) {
    for (const c of Object.values(battle.combatants)) {
        if (c._covering) {
            c._covering.turnsLeft--;
            if (c._covering.turnsLeft <= 0) {
                c._covering = null;
            }
        }
    }
}

// ─── Absorption Barriers ─────────────────────────────────────────
// Temporary HP shield that absorbs damage before real HP.
// Created by spells, items, or passive abilities.
// Has its own HP pool, optional type filter, and duration.

function applyBarrier(combatant, amount, duration, type) {
    if (!combatant) return;
    combatant._barrier = {
        hp: amount,
        maxHp: amount,
        turnsLeft: duration || 3,
        type: type || 'all', // 'all', 'physical', 'magic'
    };
}

// Absorb damage through barrier. Returns remaining damage after barrier.
function resolveBarrier(combatant, damage, damageType, result) {
    if (!combatant._barrier || combatant._barrier.hp <= 0) return damage;

    const barrier = combatant._barrier;

    // Type filter: physical barrier only blocks physical, etc.
    if (barrier.type !== 'all' && barrier.type !== damageType) return damage;

    const absorbed = Math.min(barrier.hp, damage);
    barrier.hp -= absorbed;
    const remaining = damage - absorbed;

    if (result) {
        result.log.push(`🔰 ${combatant.name}'s barrier absorbs ${absorbed} damage! (${barrier.hp}/${barrier.maxHp} remaining)`);
        result.actions.push({ type: 'barrier_absorb', target: combatant.name, absorbed, remaining: barrier.hp });
    }

    if (barrier.hp <= 0) {
        combatant._barrier = null;
        if (result) result.log.push(`💔 ${combatant.name}'s barrier shatters!`);
    }

    return remaining;
}

function tickBarrier(combatant) {
    if (!combatant._barrier) return;
    combatant._barrier.turnsLeft--;
    if (combatant._barrier.turnsLeft <= 0) {
        combatant._barrier = null;
    }
}

function getBarrierState(combatant) {
    if (!combatant._barrier) return null;
    return {
        hp: combatant._barrier.hp,
        maxHp: combatant._barrier.maxHp,
        turnsLeft: combatant._barrier.turnsLeft,
        type: combatant._barrier.type,
    };
}

module.exports = {
    applyCover, getCoverer, resolveCoverIntercept, tickCover,
    applyBarrier, resolveBarrier, tickBarrier, getBarrierState,
};
