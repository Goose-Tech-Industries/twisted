// =================================================================
// FORMATION SYSTEM — Front/Back Row + Formation Shapes
// =================================================================
// ARCHITECTURE:
//   Each combatant has a `row` property: 'front' or 'back'.
//   Front row: full melee damage dealt/taken, can be targeted by melee.
//   Back row: melee damage dealt reduced, melee damage taken reduced,
//             ranged/magic damage unaffected. Cannot be melee targeted
//             if front row has living members (they block).
//
//   Formation shapes give team bonuses when X+ members are positioned
//   correctly. Shapes are optional — row system works without them.
//
// DATA-DRIVEN:
//   Shapes stored in game_formation_shapes table.
//   Row assignment is per-combatant, changeable mid-battle (costs turn).
// =================================================================

// ─── Row Defaults ────────────────────────────────────────────────
const ROW_DEFAULTS = {
    front_melee_bonus: 0,        // extra melee damage from front row (0 = no bonus)
    back_melee_penalty: 0.30,    // melee damage dealt reduced by 30% from back row
    back_melee_reduction: 0.50,  // melee damage TAKEN reduced by 50% in back row
    back_ranged_bonus: 0.10,     // ranged/magic damage bonus from back row safety
    row_swap_costs_turn: true,   // swapping row uses your action
};

// ─── Assign default rows based on class/weapon ───────────────────
function assignDefaultRow(combatant) {
    // Ranged/caster classes default to back, melee to front
    const rangedTypes = ['mage', 'archer', 'healer', 'caster', 'ranger', 'priest', 'bard'];
    const classType = (combatant.className || combatant.class_name || '').toLowerCase();
    const weaponType = (combatant.weaponType || combatant.weapon_type || '').toLowerCase();

    if (rangedTypes.some(t => classType.includes(t)) ||
        ['bow', 'staff', 'wand', 'tome', 'gun', 'crossbow'].includes(weaponType)) {
        combatant.row = 'back';
    } else {
        combatant.row = 'front';
    }
    return combatant.row;
}

// ─── Initialize formation for a battle ───────────────────────────
function initFormation(battle) {
    if (!battle._settings?.enable_formations) return;

    for (const c of Object.values(battle.combatants)) {
        if (!c.row) assignDefaultRow(c);
    }

    // Load formation shapes if available
    battle._formationShapes = {};
    battle._activeFormations = {};
}

async function loadFormationShapes(db, battle) {
    if (!battle._settings?.enable_formations) return;
    try {
        const [rows] = await db.query(
            'SELECT * FROM game_formation_shapes WHERE active=1 ORDER BY min_members'
        );
        for (const r of rows) {
            battle._formationShapes[r.name] = {
                id: r.id,
                name: r.name,
                icon: r.icon || '',
                label: r.label || r.name,
                min_members: r.min_members || 2,
                shape_type: r.shape_type, // 'v_shape', 'line', 'diamond', 'wedge', 'circle'
                bonuses: safeParseJSON(r.bonuses_json, {}),
                description: r.description || '',
            };
        }
    } catch { /* table may not exist yet */ }
}

function safeParseJSON(str, fallback) {
    try { return typeof str === 'string' ? JSON.parse(str) : (str || fallback); }
    catch { return fallback; }
}

// ─── Row-based targeting rules ───────────────────────────────────
// Melee attacks can only target back row if no front row defenders alive
function canMeleeTarget(battle, attacker, target) {
    if (!battle._settings?.enable_formations) return true;
    if (target.row !== 'back') return true; // front row always targetable

    // Check if target's team has living front row members
    const teamId = battle.getTeamId(target.charId);
    const teamMembers = (battle.teams[teamId] || [])
        .map(id => battle.combatants[id])
        .filter(c => c && c.currentHp > 0 && !c._knockedOut && c.charId !== target.charId);

    const hasFrontRow = teamMembers.some(c => c.row === 'front');

    // If front row exists, back row is protected from melee
    return !hasFrontRow;
}

// Ranged/magic can always target any row
function canRangedTarget(battle, attacker, target) {
    return true; // no row restriction for ranged
}

// ─── Row-based damage modifiers ──────────────────────────────────
function getRowDamageModifier(battle, attacker, target, isRanged) {
    if (!battle._settings?.enable_formations) return { dealt: 1.0, taken: 1.0 };

    const settings = battle._settings;
    let dealtMod = 1.0;
    let takenMod = 1.0;

    if (!isRanged) {
        // Melee from back row deals less damage
        if (attacker.row === 'back') {
            dealtMod -= (settings.back_melee_penalty || ROW_DEFAULTS.back_melee_penalty);
        }
        // Front row bonus for melee
        if (attacker.row === 'front') {
            dealtMod += (settings.front_melee_bonus || ROW_DEFAULTS.front_melee_bonus);
        }
        // Back row takes less melee damage
        if (target.row === 'back') {
            takenMod -= (settings.back_melee_reduction || ROW_DEFAULTS.back_melee_reduction);
        }
    } else {
        // Ranged from back row gets a small bonus (safety advantage)
        if (attacker.row === 'back') {
            dealtMod += (settings.back_ranged_bonus || ROW_DEFAULTS.back_ranged_bonus);
        }
    }

    return { dealt: Math.max(0.1, dealtMod), taken: Math.max(0.1, takenMod) };
}

// ─── Row Swap Action ─────────────────────────────────────────────
function swapRow(battle, combatantId) {
    if (!battle._settings?.enable_formations) return { success: false, reason: 'Formation system disabled' };

    const c = battle.combatants[combatantId];
    if (!c) return { success: false, reason: 'Combatant not found' };
    if (c.currentHp <= 0 || c._knockedOut) return { success: false, reason: 'Cannot swap while incapacitated' };

    const oldRow = c.row || 'front';
    const newRow = oldRow === 'front' ? 'back' : 'front';
    c.row = newRow;

    return {
        success: true,
        combatant: c.name,
        from: oldRow,
        to: newRow,
        costsTurn: battle._settings.row_swap_costs_turn ?? ROW_DEFAULTS.row_swap_costs_turn,
    };
}

// ─── Formation Shape Detection ───────────────────────────────────
// Check if a team's positioning matches any formation shape.
// Returns active formation with bonuses, or null.

function checkFormationShape(battle, teamId) {
    if (!battle._formationShapes || Object.keys(battle._formationShapes).length === 0) return null;

    const members = (battle.teams[teamId] || [])
        .map(id => battle.combatants[id])
        .filter(c => c && c.currentHp > 0 && !c._knockedOut);

    if (members.length < 2) return null;

    const frontCount = members.filter(c => c.row === 'front').length;
    const backCount = members.filter(c => c.row === 'back').length;

    for (const shape of Object.values(battle._formationShapes)) {
        if (members.length < shape.min_members) continue;

        let matches = false;
        switch (shape.shape_type) {
            case 'v_shape':
                // V: 1 front point, 2+ back flanks
                matches = frontCount === 1 && backCount >= 2;
                break;
            case 'line':
                // All same row
                matches = frontCount === members.length || backCount === members.length;
                break;
            case 'diamond':
                // 1 front, 2+ middle (front), 1 back — need 4+ members
                matches = members.length >= 4 && frontCount >= 1 && backCount >= 1;
                break;
            case 'wedge':
                // 2+ front, 1 back (inverse V)
                matches = frontCount >= 2 && backCount === 1;
                break;
            case 'wall':
                // All front row — defensive line
                matches = frontCount === members.length && members.length >= 3;
                break;
        }

        if (matches) {
            battle._activeFormations[teamId] = shape;
            return shape;
        }
    }

    battle._activeFormations[teamId] = null;
    return null;
}

// Get formation bonuses for a combatant's team
function getFormationBonus(battle, combatantId) {
    const teamId = battle.getTeamId(combatantId);
    const shape = battle._activeFormations?.[teamId];
    if (!shape || !shape.bonuses) return {};
    return shape.bonuses; // { attack_pct: 0.10, defense_pct: 0.05, speed_pct: 0 }
}

// ─── Client State ────────────────────────────────────────────────
function getFormationState(battle) {
    if (!battle._settings?.enable_formations) return null;

    const formations = {};
    for (const teamId of Object.keys(battle.teams)) {
        const members = (battle.teams[teamId] || [])
            .map(id => battle.combatants[id])
            .filter(Boolean);

        formations[teamId] = {
            rows: {
                front: members.filter(c => c.row === 'front').map(c => c.charId),
                back: members.filter(c => c.row === 'back').map(c => c.charId),
            },
            activeShape: battle._activeFormations?.[teamId] || null,
        };
    }
    return formations;
}

module.exports = {
    ROW_DEFAULTS,
    assignDefaultRow,
    initFormation,
    loadFormationShapes,
    canMeleeTarget,
    canRangedTarget,
    getRowDamageModifier,
    swapRow,
    checkFormationShape,
    getFormationBonus,
    getFormationState,
};
