// =================================================================
// TURN SYSTEMS — ATB (Active Time Battle) + CTB (Conditional Turn-Based)
// =================================================================
// Three initiative modes:
//   'speed'     — classic: sorted by speed each round (existing)
//   'roll'      — d20 + speed modifier (existing)
//   'atb'       — real-time bars fill based on speed (FF4-9, Chrono Trigger)
//   'ctb'       — timeline where speed determines turn frequency (FFX)
//   'phased'    — all players act, then all enemies act (existing)
//   'countdown' — turns cost "ticks", speed determines tick rate (existing)
// =================================================================

// ─── ATB (Active Time Battle) ────────────────────────────────────
// Each combatant has an ATB gauge (0-1000). Every server tick, the
// gauge increases by (speed * atb_speed_factor). When gauge hits 1000,
// that combatant's turn triggers. Multiple combatants can fill in the
// same tick — fastest goes first.
//
// Wait Mode: ATB pauses while a player has the command menu open.
// Active Mode: ATB never pauses.

const ATB_MAX = 1000;

function initATB(battle) {
    if (battle._settings?.initiative_type !== 'atb') return;

    battle._atb = {
        gauges: {},        // charId → current gauge value (0-1000)
        paused: false,     // Wait Mode: pause while menu open
        waitMode: battle._settings.atb_wait_mode ?? true,
        speedFactor: battle._settings.atb_speed_factor || 5.0,
        tickRate: battle._settings.atb_tick_rate || 500, // ms between ticks
        lastTick: Date.now(),
    };

    for (const c of Object.values(battle.combatants)) {
        if (c.currentHp <= 0) continue;
        // Start with random offset so turns don't all fire at once
        battle._atb.gauges[c.charId] = Math.floor(Math.random() * 300);
    }
}

// Tick all ATB gauges. Returns array of combatant IDs whose gauges are full.
function tickATB(battle) {
    if (!battle._atb) return [];
    if (battle._atb.paused) return [];
    if (battle.status !== 'ACTIVE') return [];

    const now = Date.now();
    const elapsed = now - battle._atb.lastTick;
    if (elapsed < battle._atb.tickRate) return [];
    battle._atb.lastTick = now;

    const ready = [];
    const factor = battle._atb.speedFactor;

    for (const c of Object.values(battle.combatants)) {
        if (c.currentHp <= 0 || c._knockedOut || c._stunned) continue;
        const charId = c.charId;
        const gauge = battle._atb.gauges[charId] || 0;
        const speed = c.speed || 10;

        // Haste doubles fill rate, Slow halves it
        let speedMod = 1.0;
        if (c._hasHaste) speedMod = 2.0;
        if (c._hasSlow) speedMod = 0.5;
        // Stagger slows ATB fill
        if (c._staggered) speedMod *= 0.5;

        const gain = Math.floor(speed * factor * speedMod);
        const newGauge = Math.min(ATB_MAX, gauge + gain);
        battle._atb.gauges[charId] = newGauge;

        if (newGauge >= ATB_MAX) {
            ready.push({ charId, speed: newGauge }); // speed as tiebreaker
        }
    }

    // Sort ready by who filled first (highest gauge = filled first)
    ready.sort((a, b) => b.speed - a.speed);
    return ready.map(r => r.charId);
}

// After a combatant acts, reset their gauge
function resetATBGauge(battle, charId, actionWeight) {
    if (!battle._atb) return;
    // Heavy actions (casting, charged attacks) start with less gauge
    // Light actions (defend, item) start with some gauge retained
    const weight = actionWeight || 1.0; // 1.0 = normal, 0.5 = light, 1.5 = heavy
    const retained = Math.max(0, Math.floor(ATB_MAX * (1 - weight) * 0.3));
    battle._atb.gauges[charId] = retained;
}

// Pause/unpause ATB (Wait Mode: pause when player menu opens)
function setATBPause(battle, paused) {
    if (!battle._atb) return;
    if (!battle._atb.waitMode && paused) return; // Active Mode ignores pause
    battle._atb.paused = paused;
}

function getATBState(battle) {
    if (!battle._atb) return null;
    const gauges = {};
    for (const [charId, value] of Object.entries(battle._atb.gauges)) {
        gauges[charId] = { value, max: ATB_MAX, pct: Math.round((value / ATB_MAX) * 100) };
    }
    return {
        gauges,
        paused: battle._atb.paused,
        waitMode: battle._atb.waitMode,
    };
}

// ─── CTB (Conditional Turn-Based) ────────────────────────────────
// Each combatant has a "tick counter" that counts down. When it hits 0,
// that combatant gets their turn. After acting, the counter resets based
// on: base recovery time / speed. Heavy abilities add more ticks.
// The timeline shows predicted future turns.

function initCTB(battle) {
    if (battle._settings?.initiative_type !== 'ctb') return;

    battle._ctb = {
        counters: {},      // charId → ticks until next turn
        baseRecovery: battle._settings.ctb_base_recovery || 100,
        speedDivisor: battle._settings.ctb_speed_divisor || 10,
        timelineLength: battle._settings.ctb_timeline_length || 10,
    };

    // Initialize counters based on speed (faster = lower initial counter)
    for (const c of Object.values(battle.combatants)) {
        if (c.currentHp <= 0) continue;
        const speed = c.speed || 10;
        battle._ctb.counters[c.charId] = Math.floor(battle._ctb.baseRecovery / (speed / battle._ctb.speedDivisor));
    }
}

// Advance CTB by one tick. Returns charId of whoever reaches 0 first.
function advanceCTB(battle) {
    if (!battle._ctb) return null;
    if (battle.status !== 'ACTIVE') return null;

    // Find the minimum counter value
    let minTicks = Infinity;
    let nextCharId = null;

    for (const [charId, ticks] of Object.entries(battle._ctb.counters)) {
        const c = battle.combatants[charId];
        if (!c || c.currentHp <= 0 || c._knockedOut) continue;
        if (c._stunned) continue; // stunned combatants skip

        let adjustedTicks = ticks;
        if (c._hasSlow) adjustedTicks = Math.floor(adjustedTicks * 1.5);
        if (c._hasHaste) adjustedTicks = Math.floor(adjustedTicks * 0.5);

        if (adjustedTicks < minTicks) {
            minTicks = adjustedTicks;
            nextCharId = charId;
        }
    }

    if (!nextCharId) return null;

    // Subtract minTicks from all counters (advance time)
    for (const charId of Object.keys(battle._ctb.counters)) {
        const c = battle.combatants[charId];
        if (!c || c.currentHp <= 0 || c._knockedOut) continue;
        battle._ctb.counters[charId] = Math.max(0, battle._ctb.counters[charId] - minTicks);
    }

    return nextCharId;
}

// After acting, reset the combatant's counter based on action weight
function resetCTBCounter(battle, charId, actionWeight) {
    if (!battle._ctb) return;
    const c = battle.combatants[charId];
    if (!c) return;

    const speed = c.speed || 10;
    const base = battle._ctb.baseRecovery;
    const divisor = battle._ctb.speedDivisor;
    const weight = actionWeight || 1.0; // heavy abilities = 1.5+, light = 0.5

    const recovery = Math.floor((base * weight) / (speed / divisor));
    battle._ctb.counters[charId] = Math.max(1, recovery);
}

// Generate predicted timeline (next N turns)
function getCTBTimeline(battle) {
    if (!battle._ctb) return [];
    const length = battle._ctb.timelineLength || 10;

    // Simulate future turns without modifying actual state
    const simCounters = { ...battle._ctb.counters };
    const timeline = [];

    for (let i = 0; i < length; i++) {
        let minTicks = Infinity;
        let nextCharId = null;

        for (const [charId, ticks] of Object.entries(simCounters)) {
            const c = battle.combatants[charId];
            if (!c || c.currentHp <= 0 || c._knockedOut || c._stunned) continue;

            let adj = ticks;
            if (c._hasSlow) adj = Math.floor(adj * 1.5);
            if (c._hasHaste) adj = Math.floor(adj * 0.5);

            if (adj < minTicks) {
                minTicks = adj;
                nextCharId = charId;
            }
        }

        if (!nextCharId) break;

        // Advance all counters
        for (const cid of Object.keys(simCounters)) {
            const c = battle.combatants[cid];
            if (!c || c.currentHp <= 0 || c._knockedOut) continue;
            simCounters[cid] = Math.max(0, simCounters[cid] - minTicks);
        }

        const c = battle.combatants[nextCharId];
        timeline.push({
            charId: nextCharId,
            name: c?.name || '???',
            teamId: c?.teamId || '',
            isAI: c?.isAI || false,
        });

        // Reset this combatant's counter for simulation
        const speed = c?.speed || 10;
        simCounters[nextCharId] = Math.floor(
            (battle._ctb.baseRecovery * 1.0) / (speed / battle._ctb.speedDivisor)
        );
    }

    return timeline;
}

function getCTBState(battle) {
    if (!battle._ctb) return null;
    return {
        counters: { ...battle._ctb.counters },
        timeline: getCTBTimeline(battle),
    };
}

module.exports = {
    ATB_MAX,
    initATB, tickATB, resetATBGauge, setATBPause, getATBState,
    initCTB, advanceCTB, resetCTBCounter, getCTBTimeline, getCTBState,
};
