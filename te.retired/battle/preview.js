// =================================================================
// DAMAGE PREVIEW — Show expected results before committing
// =================================================================
// ARCHITECTURE:
//   Before a player confirms an action, the client can request a
//   preview. The server calculates estimated damage, hit chance,
//   crit chance, element effectiveness, and whether it will kill,
//   break shield, or trigger a status — without actually applying
//   anything. Returns a read-only preview object.
//
// This runs the same formulas as the real combat pipeline but
// discards the result. No state mutation, no DB writes.
// =================================================================

function previewAttack(battle, attackerId, targetId, skillId) {
    const attacker = battle.combatants[attackerId];
    const target = battle.combatants[targetId];
    if (!attacker || !target) return null;

    const settings = battle._settings || {};
    const preview = {
        attacker: attacker.name,
        target: target.name,
        type: skillId ? 'skill' : 'attack',
        damage: { min: 0, max: 0, avg: 0 },
        hitChance: 100,
        critChance: 0,
        critMultiplier: 1.5,
        elementEffectiveness: 'neutral',
        willKill: false,
        willBreakShield: false,
        willStagger: false,
        statusApply: null,
        coverWarning: null,
        rowPenalty: null,
        elevationBonus: 0,
    };

    // Base damage from stats
    const atkStat = attacker.attack || attacker.strength || 10;
    const defStat = target.defense || target.vitality || 5;
    const baseDmg = Math.max(1, atkStat - defStat * 0.5);

    // Skill multiplier
    let skillMult = 1.0;
    let skillElement = null;
    let isRanged = false;
    let statusEffect = null;

    if (skillId && attacker._skills) {
        const skill = attacker._skills.find(s => s.id === skillId);
        if (skill) {
            skillMult = skill.power_mult || skill.damage_mult || 1.0;
            skillElement = skill.element || null;
            isRanged = skill.range_type === 'ranged' || skill.is_ranged;
            if (skill.status_apply) statusEffect = skill.status_apply;
        }
    }

    // Weapon type detection for ranged
    const weaponType = (attacker.weaponType || attacker.weapon_type || '').toLowerCase();
    if (['bow', 'gun', 'crossbow', 'staff', 'wand'].includes(weaponType)) isRanged = true;

    // Formation row modifier
    if (settings.enable_formations && battle.getRowDamageModifier) {
        const rowMod = battle.getRowDamageModifier(attacker, target, isRanged);
        const rowFactor = rowMod.dealt * rowMod.taken;
        if (rowFactor < 1.0) {
            preview.rowPenalty = `${Math.round((1 - rowFactor) * 100)}% row penalty`;
        }
        skillMult *= rowFactor;
    }

    // Elevation bonus
    if (settings.enable_elevation && battle.getElevationBonus) {
        const elev = battle.getElevationBonus(attacker, target);
        // getElevationBonus returns {damage, accuracy, dodge} — use the damage component
        const elevDmg = (typeof elev === 'object') ? (elev.damage || 0) : (elev || 0);
        if (elevDmg !== 0) {
            preview.elevationBonus = Math.round(elevDmg * 100);
            skillMult *= (1 + elevDmg);
        }
    }

    // Element effectiveness
    if (skillElement && target.element) {
        const effectiveness = getElementEffectiveness(skillElement, target.element);
        preview.elementEffectiveness = effectiveness.label;
        skillMult *= effectiveness.multiplier;
    }

    // Crit
    preview.critChance = Math.min(95, settings.base_crit_chance || 5);
    preview.critMultiplier = settings.crit_damage_multiplier || 1.5;

    // Calculate damage range (90%-110% variance)
    const raw = baseDmg * skillMult;
    preview.damage.min = Math.max(1, Math.floor(raw * 0.90));
    preview.damage.max = Math.max(1, Math.ceil(raw * 1.10));
    preview.damage.avg = Math.max(1, Math.round(raw));

    // Crit damage range
    preview.damage.critMin = Math.floor(preview.damage.min * preview.critMultiplier);
    preview.damage.critMax = Math.ceil(preview.damage.max * preview.critMultiplier);

    // Will kill?
    preview.willKill = preview.damage.avg >= target.currentHp;

    // Will break shield?
    if (settings.enable_break_shield && target._breakShield) {
        preview.willBreakShield = preview.damage.avg >= (target._breakShield.remaining || 0);
    }

    // Will stagger?
    if (settings.enable_stagger_system && target._staggerGauge !== undefined) {
        const staggerIncrease = settings.stagger_base_increase || 5;
        preview.willStagger = (target._staggerGauge + staggerIncrease) >= (target._staggerMax || 100);
    }

    // Status apply
    if (statusEffect) {
        preview.statusApply = statusEffect;
    }

    // Cover warning
    if (settings.enable_cover_system && battle.getCoverer) {
        const coverer = battle.getCoverer(targetId);
        if (coverer) {
            preview.coverWarning = `${coverer.name} will intercept this attack`;
        }
    }

    // Hit chance (base 95%, modified by accuracy/evasion)
    const accuracy = attacker.accuracy || attacker.dexterity || 10;
    const evasion = target.evasion || target.agility || 5;
    preview.hitChance = Math.min(99, Math.max(5, 85 + (accuracy - evasion) * 2));

    return preview;
}

function getElementEffectiveness(atkElement, defElement) {
    const chart = {
        fire:      { weak: 'ice',    resist: 'water',  label_weak: 'super effective', label_resist: 'resisted' },
        ice:       { weak: 'fire',   resist: 'wind',   label_weak: 'super effective', label_resist: 'resisted' },
        wind:      { weak: 'earth',  resist: 'ice',    label_weak: 'super effective', label_resist: 'resisted' },
        earth:     { weak: 'wind',   resist: 'fire',   label_weak: 'super effective', label_resist: 'resisted' },
        water:     { weak: 'fire',   resist: 'earth',  label_weak: 'super effective', label_resist: 'resisted' },
        lightning: { weak: 'water',  resist: 'earth',  label_weak: 'super effective', label_resist: 'resisted' },
        light:     { weak: 'dark',   resist: 'light',  label_weak: 'super effective', label_resist: 'absorbed' },
        dark:      { weak: 'light',  resist: 'dark',   label_weak: 'super effective', label_resist: 'absorbed' },
    };

    const entry = chart[atkElement];
    if (!entry) return { label: 'neutral', multiplier: 1.0 };

    if (defElement === entry.weak) return { label: entry.label_weak, multiplier: 1.5 };
    if (defElement === entry.resist) return { label: entry.label_resist, multiplier: 0.5 };
    return { label: 'neutral', multiplier: 1.0 };
}

module.exports = { previewAttack, getElementEffectiveness };
