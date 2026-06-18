// =================================================================
// LIMB SYSTEM — Body zones, wound levels, damage routing, penalties
// =================================================================

function jp(s, f) { try { return JSON.parse(s); } catch { return f; } }

// Load limb zones for a body type from DB
async function loadLimbZones(db, bodyTypeId) {
    try {
        const [rows] = await db.query(
            `SELECT zone_key, label, icon, hp_pct, called_shot_penalty, bleed_through,
                    wound_effects, disable_effects, sort_order
             FROM game_limb_zones WHERE body_type_id = ? ORDER BY sort_order`,
            [bodyTypeId || 1]
        );
        return rows.map(r => ({
            key:           r.zone_key,
            label:         r.label,
            icon:          r.icon || '\u{1F9B4}',
            hpPct:         parseFloat(r.hp_pct) || 0.20,
            calledShotPenalty: parseFloat(r.called_shot_penalty) || 0,
            bleedThrough:  parseFloat(r.bleed_through) || 0.60,
            woundEffects:  jp(r.wound_effects, null),
            disableEffects: jp(r.disable_effects, null),
            sortOrder:     r.sort_order || 0
        }));
    } catch (e) {
        return [
            { key: 'head',      label: 'Head',      icon: '\u{1F5E3}', hpPct: 0.25, calledShotPenalty: 0.20, bleedThrough: 0.70, woundEffects: null, disableEffects: { knockout: true }, sortOrder: 1 },
            { key: 'torso',     label: 'Torso',     icon: '\u{1FAC1}', hpPct: 0.40, calledShotPenalty: 0, bleedThrough: 1.00, woundEffects: null, disableEffects: null, sortOrder: 2 },
            { key: 'left_arm',  label: 'Left Arm',  icon: '\u{1F4AA}', hpPct: 0.15, calledShotPenalty: 0.10, bleedThrough: 0.60, woundEffects: null, disableEffects: null, sortOrder: 3 },
            { key: 'right_arm', label: 'Right Arm', icon: '\u{1F91A}', hpPct: 0.15, calledShotPenalty: 0.10, bleedThrough: 0.60, woundEffects: null, disableEffects: null, sortOrder: 4 },
            { key: 'legs',      label: 'Legs',      icon: '\u{1F9B5}', hpPct: 0.20, calledShotPenalty: 0.10, bleedThrough: 0.60, woundEffects: null, disableEffects: { prone: true, cant_flee: true }, sortOrder: 5 },
        ];
    }
}

// Initialize limb HP pools from a combatant's maxHp and their body type zones
function initLimbHp(maxHp, limbZones) {
    const limbHp = {};
    for (const zone of limbZones) {
        const zoneMax = Math.max(1, Math.round(maxHp * zone.hpPct));
        limbHp[zone.key] = { current: zoneMax, max: zoneMax };
    }
    return limbHp;
}

// Get wound level for a limb based on current/max HP and thresholds
function getWoundLevel(current, max, settings) {
    if (max <= 0) return 'normal';
    const pct = current / max;
    if (pct <= (settings?.wound_threshold_disable ?? 0))    return 'disabled';
    if (pct <= (settings?.wound_threshold_heavy ?? 0.50))   return 'heavy';
    if (pct <= (settings?.wound_threshold_light ?? 0.75))   return 'light';
    return 'normal';
}

// Get wound levels for all limbs
function getAllWoundLevels(limbHp, settings) {
    const levels = {};
    for (const [key, hp] of Object.entries(limbHp)) {
        levels[key] = getWoundLevel(hp.current, hp.max, settings);
    }
    return levels;
}

// Route damage to a limb. Returns { limbDamage, mainDamage, limbDisabled, knockedOut, woundLevel }
function routeLimbDamage(target, damage, targetLimb, settings) {
    if (!target._limbHp || !target._limbZones) {
        return { limbDamage: 0, mainDamage: damage, limbDisabled: false, knockedOut: false, woundLevel: null };
    }

    const limb = targetLimb && target._limbHp[targetLimb] ? targetLimb : 'torso';
    const limbData = target._limbHp[limb];
    const zone = target._limbZones.find(z => z.key === limb);

    if (!limbData || !zone) {
        return { limbDamage: 0, mainDamage: damage, limbDisabled: false, knockedOut: false, woundLevel: null };
    }

    const limbBefore = limbData.current;
    limbData.current = Math.max(0, limbData.current - damage);
    const actualLimbDmg = limbBefore - limbData.current;

    const bleedThrough = zone.bleedThrough !== undefined ? zone.bleedThrough : (settings?.limb_bleed_through_default ?? 0.60);
    const mainDamage = Math.max(1, Math.round(actualLimbDmg * bleedThrough));

    const newWound = getWoundLevel(limbData.current, limbData.max, settings);
    const wasDisabled = limbBefore <= 0;
    const limbDisabled = !wasDisabled && limbData.current <= 0;
    const knockedOut = limbDisabled && zone.disableEffects?.knockout === true;

    return {
        limbDamage: actualLimbDmg,
        mainDamage,
        limbDisabled,
        knockedOut,
        woundLevel: newWound,
        limbKey: limb,
        limbLabel: zone.label
    };
}

// Wound degradation — stat penalties from limb damage
function applyWoundPenalties(combatant, settings) {
    if (!combatant._limbZones || !combatant._limbHp || !combatant._woundLevels) return;
    if (!settings?.enable_wound_degradation && !settings?.enable_limb_targeting) return;

    if (!combatant._baseStats) {
        combatant._baseStats = {
            atk: combatant.atk, def: combatant.def,
            mo: combatant.mo, md: combatant.md,
            speed: combatant.speed, luck: combatant.luck,
            maxHp: combatant.maxHp
        };
    }

    const base = combatant._baseStats;
    combatant.atk   = base.atk;
    combatant.def   = base.def;
    combatant.mo    = base.mo;
    combatant.md    = base.md;
    combatant.speed = base.speed;
    combatant.luck  = base.luck;
    combatant.maxHp = base.maxHp;

    combatant._woundFlags = {
        cant_flee: false, cant_move: false, cant_use_items: false,
        cant_dual_wield: false, cant_two_hand: false, prone: false,
        stun_chance_on_hit: 0, accuracy_penalty: 0, move_range_mod: 0
    };

    for (const zone of combatant._limbZones) {
        const woundLevel = combatant._woundLevels[zone.key];
        if (!woundLevel || woundLevel === 'normal') continue;

        let effects = null;
        if (woundLevel === 'disabled') {
            effects = zone.disableEffects;
        } else if (settings?.enable_wound_degradation) {
            effects = zone.woundEffects?.[woundLevel];
        } else {
            continue;
        }

        if (!effects) continue;

        const statKeys = ['atk', 'def', 'mo', 'md', 'speed', 'luck'];
        for (const sk of statKeys) {
            if (effects[sk] !== undefined && typeof effects[sk] === 'number') {
                combatant[sk] = Math.max(1, Math.round(combatant[sk] * (1 + effects[sk])));
            }
        }

        if (effects.maxHp !== undefined) {
            combatant.maxHp = Math.max(1, Math.round(combatant.maxHp * (1 + effects.maxHp)));
            if (combatant.currentHp > combatant.maxHp) combatant.currentHp = combatant.maxHp;
        }

        if (effects.move_range !== undefined) {
            combatant._woundFlags.move_range_mod += effects.move_range;
        }
        if (effects.accuracy !== undefined) {
            combatant._woundFlags.accuracy_penalty += Math.abs(effects.accuracy) * 100;
        }
        if (effects.stun_chance_on_hit !== undefined) {
            combatant._woundFlags.stun_chance_on_hit = Math.max(
                combatant._woundFlags.stun_chance_on_hit,
                effects.stun_chance_on_hit
            );
        }

        if (effects.cant_flee)       combatant._woundFlags.cant_flee = true;
        if (effects.cant_move)       combatant._woundFlags.cant_move = true;
        if (effects.cant_use_items)  combatant._woundFlags.cant_use_items = true;
        if (effects.cant_dual_wield) combatant._woundFlags.cant_dual_wield = true;
        if (effects.cant_two_hand)   combatant._woundFlags.cant_two_hand = true;
        if (effects.prone)           combatant._woundFlags.prone = true;
    }
}

module.exports = {
    loadLimbZones,
    initLimbHp,
    getWoundLevel,
    getAllWoundLevels,
    routeLimbDamage,
    applyWoundPenalties
};
