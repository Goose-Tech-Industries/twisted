// =================================================================
// BRAVE / DEFAULT — Turn Banking System
// =================================================================
// ARCHITECTURE:
//   Inspired by Bravely Default's signature mechanic.
//
//   DEFAULT: Skip your action this turn to bank 1 BP (Brave Point).
//            Gain a defensive bonus (+25% defense) while defaulting.
//            Max 3 BP stored.
//
//   BRAVE:   Spend banked BP to take extra actions this turn.
//            Each BP spent = 1 additional action (up to 4 total).
//            Can go negative (up to -3): act now, pay later.
//            While in negative BP, combatant skips turns until BP >= 0.
//
//   This creates risk/reward decisions:
//     - Default to save up, then unleash 4 actions at once
//     - Brave immediately for burst damage, but be vulnerable after
//     - Banking turns for a clutch heal-chain when things go wrong
//
// DATA-DRIVEN:
//   All values configurable via battle settings.
//   Can be disabled per-battle or per-arena.
// =================================================================

const BD_DEFAULTS = {
    max_bp: 3,
    min_bp: -3,
    starting_bp: 0,
    default_defense_bonus: 0.25,
    bp_regen_per_turn: 0,    // 0 = manual only, >0 = auto regen
    negative_bp_skip_turn: true,
};

function initBraveDefault(battle) {
    if (!battle._settings?.enable_brave_default) return;
    for (const c of Object.values(battle.combatants)) {
        c._bp = battle._settings.bd_starting_bp ?? BD_DEFAULTS.starting_bp;
        c._bpMax = battle._settings.bd_max_bp ?? BD_DEFAULTS.max_bp;
        c._bpMin = battle._settings.bd_min_bp ?? BD_DEFAULTS.min_bp;
        c._isDefaulting = false;
        c._braveActions = 0; // extra actions queued this turn
    }
}

// Player chooses DEFAULT: bank 1 BP, skip action, gain defense
function resolveDefault(battle, combatantId) {
    if (!battle._settings?.enable_brave_default) return { success: false, reason: 'Brave/Default system disabled' };

    const c = battle.combatants[combatantId];
    if (!c) return { success: false, reason: 'Combatant not found' };

    const maxBp = c._bpMax ?? BD_DEFAULTS.max_bp;
    if (c._bp >= maxBp) {
        return { success: false, reason: `Already at max BP (${maxBp})` };
    }

    c._bp = Math.min(maxBp, (c._bp || 0) + 1);
    c._isDefaulting = true;

    const defBonus = battle._settings.bd_default_defense_bonus ?? BD_DEFAULTS.default_defense_bonus;

    return {
        success: true,
        action: 'default',
        combatant: c.name,
        bp: c._bp,
        defenseBonus: defBonus,
        message: `${c.name} defaults! BP: ${c._bp}/${maxBp} (+${Math.round(defBonus * 100)}% defense this turn)`,
    };
}

// Player chooses BRAVE: spend BP for extra actions
function resolveBrave(battle, combatantId, count) {
    if (!battle._settings?.enable_brave_default) return { success: false, reason: 'Brave/Default system disabled' };

    const c = battle.combatants[combatantId];
    if (!c) return { success: false, reason: 'Combatant not found' };

    const requestedActions = Math.max(1, Math.min(4, count || 1));
    const bpCost = requestedActions - 1; // first action is free
    const minBp = c._bpMin ?? BD_DEFAULTS.min_bp;
    const newBp = (c._bp || 0) - bpCost;

    if (newBp < minBp) {
        const maxActions = (c._bp || 0) - minBp + 1;
        return { success: false, reason: `Not enough BP. Max actions: ${maxActions}` };
    }

    c._bp = newBp;
    c._braveActions = requestedActions - 1; // extra actions after the first
    c._isDefaulting = false;

    return {
        success: true,
        action: 'brave',
        combatant: c.name,
        bp: c._bp,
        totalActions: requestedActions,
        message: `${c.name} braves for ${requestedActions} action${requestedActions > 1 ? 's' : ''}! BP: ${c._bp}`,
    };
}

// Check if a combatant has queued brave actions remaining
function hasBraveActionsRemaining(battle, combatantId) {
    if (!battle._settings?.enable_brave_default) return false;
    const c = battle.combatants[combatantId];
    return c && (c._braveActions || 0) > 0;
}

// Consume one brave action
function consumeBraveAction(battle, combatantId) {
    const c = battle.combatants[combatantId];
    if (!c) return;
    c._braveActions = Math.max(0, (c._braveActions || 0) - 1);
}

// Check if combatant must skip turn (negative BP)
function mustSkipTurn(battle, combatantId) {
    if (!battle._settings?.enable_brave_default) return false;
    if (!(battle._settings.bd_negative_bp_skip_turn ?? BD_DEFAULTS.negative_bp_skip_turn)) return false;
    const c = battle.combatants[combatantId];
    return c && (c._bp || 0) < 0;
}

// Called at start of each turn: regen BP if negative, clear default
function tickBP(battle, combatantId) {
    if (!battle._settings?.enable_brave_default) return;
    const c = battle.combatants[combatantId];
    if (!c) return;
    // Don't regen BP while dead or knocked out
    if (c.currentHp <= 0 || c._knockedOut) return;

    c._isDefaulting = false;
    c._braveActions = 0;

    // If negative BP, restore 1 per skipped turn
    if ((c._bp || 0) < 0) {
        c._bp += 1;
    }

    // Optional auto-regen
    const regen = battle._settings.bd_bp_regen_per_turn ?? BD_DEFAULTS.bp_regen_per_turn;
    if (regen > 0 && (c._bp || 0) >= 0) {
        const maxBp = c._bpMax ?? BD_DEFAULTS.max_bp;
        c._bp = Math.min(maxBp, (c._bp || 0) + regen);
    }
}

// Get defense modifier from defaulting
function getDefaultDefenseBonus(battle, combatantId) {
    if (!battle._settings?.enable_brave_default) return 0;
    const c = battle.combatants[combatantId];
    if (!c || !c._isDefaulting) return 0;
    return battle._settings.bd_default_defense_bonus ?? BD_DEFAULTS.default_defense_bonus;
}

function getBraveDefaultState(battle) {
    if (!battle._settings?.enable_brave_default) return null;
    const state = {};
    for (const [id, c] of Object.entries(battle.combatants)) {
        if (c._bp !== undefined) {
            state[id] = {
                bp: c._bp,
                maxBp: c._bpMax ?? BD_DEFAULTS.max_bp,
                minBp: c._bpMin ?? BD_DEFAULTS.min_bp,
                isDefaulting: c._isDefaulting || false,
                braveActionsLeft: c._braveActions || 0,
                mustSkip: (c._bp || 0) < 0,
            };
        }
    }
    return state;
}

module.exports = {
    BD_DEFAULTS,
    initBraveDefault,
    resolveDefault,
    resolveBrave,
    hasBraveActionsRemaining,
    consumeBraveAction,
    mustSkipTurn,
    tickBP,
    getDefaultDefenseBonus,
    getBraveDefaultState,
};
