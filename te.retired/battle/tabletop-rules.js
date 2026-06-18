// =================================================================
// TABLETOP RULES MODULE — D&D-inspired mechanics (all toggleable)
// =================================================================
// Master toggle: enable_tabletop_rules
// Each sub-system has its own toggle: tabletop_*
// All functions check settings before applying.
// Called from battle state, combat resolution, and commands.
// =================================================================

// ── PROFICIENCY BONUS ───────────────────────────────────────────
// Scales with level: Lv1-4=+2, 5-8=+3, 9-12=+4, 13-16=+5, 17+=+6
function getProficiencyBonus(level) {
    if (level >= 17) return 6;
    if (level >= 13) return 5;
    if (level >= 9) return 4;
    if (level >= 5) return 3;
    return 2;
}

// ── ARMOR CLASS ─────────────────────────────────────────────────
// Base AC = 10 + DEF modifier. Armor adds to it. Attacks must beat AC.
function calculateAC(combatant) {
    const defMod = Math.floor((combatant.def - 10) / 2);
    const armorBonus = combatant._armorAC || 0;
    const shieldBonus = combatant._shieldAC || 0;
    return 10 + defMod + armorBonus + shieldBonus;
}

// ── ABILITY MODIFIER ────────────────────────────────────────────
// Standard D&D: (score - 10) / 2, floor
function abilityMod(score) {
    return Math.floor((score - 10) / 2);
}

// ── D20 ROLL ────────────────────────────────────────────────────
function rollD20() {
    return Math.floor(Math.random() * 20) + 1;
}

// ── ADVANTAGE / DISADVANTAGE ────────────────────────────────────
// Roll 2d20, take higher (advantage) or lower (disadvantage)
function rollWithAdvantage(hasAdvantage, hasDisadvantage) {
    const r1 = rollD20(), r2 = rollD20();
    if (hasAdvantage && !hasDisadvantage) return { roll: Math.max(r1, r2), rolls: [r1, r2], type: 'advantage' };
    if (hasDisadvantage && !hasAdvantage) return { roll: Math.min(r1, r2), rolls: [r1, r2], type: 'disadvantage' };
    return { roll: r1, rolls: [r1], type: 'normal' };
}

// ── ATTACK ROLL vs AC ───────────────────────────────────────────
// Returns { hit, roll, critical, critFail, total }
function attackRoll(attacker, target, settings) {
    const profBonus = settings.tabletop_proficiency_bonus !== 'false'
        ? getProficiencyBonus(attacker.level || 1) : 0;
    const atkMod = abilityMod(attacker.atk || 10);

    // Check advantage sources
    const hasAdvantage = attacker._hasAdvantage || attacker._inspiration ||
        (attacker._flanking && settings.tabletop_flanking_bonus !== 'false');
    const hasDisadvantage = attacker._hasDisadvantage || false;

    const { roll, rolls, type } = rollWithAdvantage(hasAdvantage, hasDisadvantage);
    const critRange = parseInt(settings.tabletop_critical_range) || 20;
    const critical = roll >= critRange;
    const critFail = roll === 1;
    const total = roll + atkMod + profBonus;
    const ac = calculateAC(target);
    const hit = critical || (!critFail && total >= ac);

    // Consume inspiration after use
    if (attacker._inspiration) attacker._inspiration = false;

    return { hit, roll, rolls, total, ac, critical, critFail, type, profBonus, atkMod };
}

// ── SAVING THROW ────────────────────────────────────────────────
// stat = 'atk'|'def'|'speed'|'luck'|'mo'|'md', DC = difficulty
function savingThrow(combatant, stat, dc, settings) {
    const score = combatant[stat] || 10;
    const mod = abilityMod(score);
    const profBonus = combatant._saveProficiencies?.includes(stat)
        ? getProficiencyBonus(combatant.level || 1) : 0;
    const roll = rollD20();
    const total = roll + mod + profBonus;
    return { success: total >= dc, roll, total, dc, mod, profBonus };
}

// ── ABILITY CHECK ───────────────────────────────────────────────
function abilityCheck(combatant, stat, dc, settings) {
    const score = combatant[stat] || 10;
    const mod = abilityMod(score);
    const profBonus = combatant._skillProficiencies?.includes(stat)
        ? getProficiencyBonus(combatant.level || 1) : 0;
    const roll = rollD20();
    const total = roll + mod + profBonus;
    return { success: total >= dc, roll, total, dc };
}

// ── INITIATIVE (DEX-based) ──────────────────────────────────────
function rollInitiative(combatant) {
    const dexMod = abilityMod(combatant.speed || 10);
    const roll = rollD20();
    return { total: roll + dexMod, roll, mod: dexMod };
}

// Sort combatants by initiative roll
function buildInitiativeOrder(combatants) {
    const results = [];
    for (const c of Object.values(combatants)) {
        if (c.currentHp <= 0) continue;
        const init = rollInitiative(c);
        results.push({ charId: c.charId, initiative: init.total, roll: init.roll });
    }
    results.sort((a, b) => b.initiative - a.initiative);
    return results.map(r => r.charId);
}

// ── DEATH SAVES ─────────────────────────────────────────────────
// 3 successes = stabilize, 3 failures = death, nat 20 = revive with 1 HP
function deathSaveRoll(combatant) {
    if (!combatant._deathSaves) combatant._deathSaves = { successes: 0, failures: 0 };
    const roll = rollD20();

    if (roll === 20) {
        // Natural 20: revive with 1 HP
        combatant._deathSaves = { successes: 0, failures: 0 };
        return { roll, result: 'revive', message: `Natural 20! ${combatant.name} regains consciousness with 1 HP!` };
    }
    if (roll === 1) {
        // Natural 1: two failures
        combatant._deathSaves.failures += 2;
    } else if (roll >= 10) {
        combatant._deathSaves.successes++;
    } else {
        combatant._deathSaves.failures++;
    }

    if (combatant._deathSaves.successes >= 3) {
        combatant._deathSaves = { successes: 0, failures: 0 };
        return { roll, result: 'stabilized', message: `${combatant.name} is stabilized! (3 successes)` };
    }
    if (combatant._deathSaves.failures >= 3) {
        combatant._deathSaves = { successes: 0, failures: 0 };
        return { roll, result: 'death', message: `${combatant.name} has died. (3 failures)` };
    }

    return {
        roll, result: 'pending',
        message: `Death save: ${roll} — ${combatant._deathSaves.successes}/3 successes, ${combatant._deathSaves.failures}/3 failures`
    };
}

// ── EXHAUSTION ───────────────────────────────────────────────────
// 6 levels of cumulative penalties
// 1: disadvantage on ability checks
// 2: speed halved
// 3: disadvantage on attacks and saves
// 4: HP max halved
// 5: speed reduced to 0
// 6: death
function applyExhaustion(combatant) {
    const level = combatant._exhaustion || 0;
    if (level >= 1) combatant._hasDisadvantage = true; // ability checks
    if (level >= 2) combatant.speed = Math.floor((combatant._baseSpeed || combatant.speed) * 0.5);
    if (level >= 3) combatant._hasDisadvantage = true; // attacks + saves
    if (level >= 4) combatant.maxHp = Math.floor((combatant._baseMaxHp || combatant.maxHp) * 0.5);
    if (level >= 5) combatant.speed = 0;
    if (level >= 6) combatant.currentHp = 0; // death
}

// ── CONCENTRATION ───────────────────────────────────────────────
// When concentrating on a spell, taking damage requires a CON save
// DC = max(10, damage/2). Fail = spell ends.
function concentrationCheck(combatant, damageTaken, settings) {
    const dc = Math.max(10, Math.floor(damageTaken / 2));
    const save = savingThrow(combatant, 'def', dc, settings); // DEF as CON proxy
    return {
        maintained: save.success,
        dc, roll: save.roll, total: save.total,
        message: save.success
            ? `${combatant.name} maintains concentration! (${save.total} vs DC ${dc})`
            : `${combatant.name} loses concentration! (${save.total} vs DC ${dc})`
    };
}

// ── OPPORTUNITY ATTACK ──────────────────────────────────────────
// Triggered when an enemy leaves melee range (adjacent tile)
function checkOpportunityAttack(mover, battle, settings) {
    if (settings.tabletop_opportunity_attacks === 'false') return [];
    const oaResults = [];
    if (mover.gridX === undefined) return oaResults;

    for (const c of Object.values(battle.combatants)) {
        if (c.charId === mover.charId) continue;
        if (c.currentHp <= 0 || c._knockedOut) continue;
        if (c.teamId === mover.teamId) continue; // allies don't OA
        if (c._reactionUsed) continue; // one reaction per round
        if (c.gridX === undefined) continue;

        // Was adjacent before move?
        const dist = Math.abs(c.gridX - mover._prevGridX) + Math.abs(c.gridY - mover._prevGridY);
        if (dist <= 1) {
            // Moved away — trigger OA
            const newDist = Math.abs(c.gridX - mover.gridX) + Math.abs(c.gridY - mover.gridY);
            if (newDist > 1) {
                const atkResult = attackRoll(c, mover, settings);
                c._reactionUsed = true;
                if (atkResult.hit) {
                    const dmg = Math.max(1, Math.floor(c.atk * 0.5));
                    mover.currentHp = Math.max(0, mover.currentHp - dmg);
                    oaResults.push({
                        attacker: c.name, target: mover.name, damage: dmg,
                        roll: atkResult.roll, hit: true,
                        message: `⚔️ ${c.name} makes an opportunity attack! [d20: ${atkResult.roll}] ${dmg} damage!`
                    });
                } else {
                    oaResults.push({
                        attacker: c.name, target: mover.name, damage: 0,
                        roll: atkResult.roll, hit: false,
                        message: `⚔️ ${c.name} swings an opportunity attack but misses! [d20: ${atkResult.roll}]`
                    });
                }
            }
        }
    }
    return oaResults;
}

// ── FLANKING ────────────────────────────────────────────────────
// Melee attacker gets advantage if an ally is on the opposite side
function checkFlanking(attacker, target, battle) {
    if (attacker.gridX === undefined || target.gridX === undefined) return false;
    for (const c of Object.values(battle.combatants)) {
        if (c.charId === attacker.charId) continue;
        if (c.teamId !== attacker.teamId) continue; // must be ally
        if (c.currentHp <= 0) continue;
        if (c.gridX === undefined) continue;
        // Check if ally is on opposite side of target from attacker
        const dx1 = attacker.gridX - target.gridX;
        const dy1 = attacker.gridY - target.gridY;
        const dx2 = c.gridX - target.gridX;
        const dy2 = c.gridY - target.gridY;
        // Opposite side = opposite signs on at least one axis, both adjacent
        const dist1 = Math.abs(dx1) + Math.abs(dy1);
        const dist2 = Math.abs(dx2) + Math.abs(dy2);
        if (dist1 <= 1 && dist2 <= 1 && (dx1 * dx2 < 0 || dy1 * dy2 < 0)) {
            return true;
        }
    }
    return false;
}

// ── SNEAK ATTACK ────────────────────────────────────────────────
// Extra damage when attacker has advantage or an adjacent ally
function sneakAttackDamage(attacker, target, battle, hasAdvantage) {
    if (!hasAdvantage && !checkFlanking(attacker, target, battle)) return 0;
    // Damage scales with level: 1d6 per 2 levels
    const dice = Math.max(1, Math.floor((attacker.level || 1) / 2));
    let total = 0;
    for (let i = 0; i < dice; i++) total += Math.floor(Math.random() * 6) + 1;
    return total;
}

// ── SPELL SLOTS ─────────────────────────────────────────────────
// Initialize spell slots based on class/level
function initSpellSlots(combatant) {
    const level = combatant.level || 1;
    // Simple slot table (half-caster gets fewer)
    const isCaster = combatant._isCaster;
    if (!isCaster) return {};
    const slots = {};
    if (level >= 1) slots[1] = { max: 2 + Math.floor(level / 4), current: 2 + Math.floor(level / 4) };
    if (level >= 3) slots[2] = { max: Math.max(1, Math.floor(level / 3)), current: Math.max(1, Math.floor(level / 3)) };
    if (level >= 5) slots[3] = { max: Math.max(1, Math.floor(level / 4)), current: Math.max(1, Math.floor(level / 4)) };
    if (level >= 7) slots[4] = { max: Math.max(1, Math.floor(level / 6)), current: Math.max(1, Math.floor(level / 6)) };
    if (level >= 9) slots[5] = { max: Math.max(1, Math.floor(level / 8)), current: Math.max(1, Math.floor(level / 8)) };
    return slots;
}

// Use a spell slot — returns false if none available
function useSpellSlot(combatant, slotLevel) {
    if (!combatant._spellSlots) return false;
    // Try exact level first, then upcast
    for (let l = slotLevel; l <= 9; l++) {
        if (combatant._spellSlots[l] && combatant._spellSlots[l].current > 0) {
            combatant._spellSlots[l].current--;
            return l; // actual slot level used (may be upcast)
        }
    }
    return false;
}

// ── SHORT REST / LONG REST ──────────────────────────────────────
// Short rest: spend hit dice to heal, recover some resources
function shortRest(combatant) {
    const results = [];
    // Spend hit dice to heal
    const hitDice = combatant._hitDice || { max: combatant.level || 1, current: combatant.level || 1, size: 8 };
    if (hitDice.current > 0 && combatant.currentHp < combatant.maxHp) {
        const diceToSpend = Math.min(hitDice.current, Math.ceil((combatant.maxHp - combatant.currentHp) / hitDice.size));
        let totalHeal = 0;
        for (let i = 0; i < diceToSpend; i++) {
            totalHeal += Math.floor(Math.random() * hitDice.size) + 1 + abilityMod(combatant.def || 10);
            hitDice.current--;
        }
        totalHeal = Math.max(0, totalHeal);
        combatant.currentHp = Math.min(combatant.maxHp, combatant.currentHp + totalHeal);
        results.push(`Healed ${totalHeal} HP (spent ${diceToSpend} hit dice)`);
    }
    combatant._hitDice = hitDice;
    return results;
}

function longRest(combatant) {
    combatant.currentHp = combatant.maxHp;
    if (combatant.currentMp !== undefined) combatant.currentMp = combatant.maxMp || combatant.currentMp;
    // Recover spell slots
    if (combatant._spellSlots) {
        for (const slot of Object.values(combatant._spellSlots)) {
            slot.current = slot.max;
        }
    }
    // Recover half hit dice
    const hitDice = combatant._hitDice || { max: combatant.level || 1, current: combatant.level || 1, size: 8 };
    hitDice.current = Math.min(hitDice.max, hitDice.current + Math.max(1, Math.floor(hitDice.max / 2)));
    combatant._hitDice = hitDice;
    // Reduce exhaustion by 1
    if (combatant._exhaustion) combatant._exhaustion = Math.max(0, combatant._exhaustion - 1);
    // Reset reactions
    combatant._reactionUsed = false;
    return [`Full HP/MP restored, half hit dice recovered${combatant._exhaustion ? ', exhaustion reduced' : ''}`];
}

// ── ATTUNEMENT ──────────────────────────────────────────────────
const MAX_ATTUNEMENT = 3;
function canAttune(combatant) {
    return (combatant._attunedItems || []).length < MAX_ATTUNEMENT;
}

// ── ENCUMBRANCE ─────────────────────────────────────────────────
function getCarryCapacity(combatant) {
    return (combatant.atk || 10) * 15; // STR * 15 lbs
}

function isEncumbered(combatant, totalWeight) {
    const capacity = getCarryCapacity(combatant);
    if (totalWeight > capacity) return 'over'; // can't move
    if (totalWeight > capacity * 2/3) return 'heavy'; // speed -20
    if (totalWeight > capacity * 1/3) return 'light'; // speed -10
    return 'none';
}

// ── RESET REACTIONS PER ROUND ───────────────────────────────────
function resetRoundResources(battle) {
    for (const c of Object.values(battle.combatants)) {
        if (c.currentHp > 0) c._reactionUsed = false;
    }
}

// ── CHECK IF TABLETOP RULES ENABLED ─────────────────────────────
function isEnabled(settings) {
    return settings?.enable_tabletop_rules === 'true' || settings?.enable_tabletop_rules === true;
}

function isSubEnabled(settings, key) {
    return isEnabled(settings) && (settings?.[key] !== 'false');
}

module.exports = {
    // Core
    isEnabled, isSubEnabled,
    getProficiencyBonus, abilityMod, rollD20, rollWithAdvantage,
    // Combat
    calculateAC, attackRoll, savingThrow, abilityCheck,
    rollInitiative, buildInitiativeOrder,
    checkOpportunityAttack, checkFlanking, sneakAttackDamage,
    // Resources
    initSpellSlots, useSpellSlot,
    shortRest, longRest,
    deathSaveRoll, applyExhaustion,
    concentrationCheck, resetRoundResources,
    // Items
    canAttune, MAX_ATTUNEMENT, getCarryCapacity, isEncumbered,
};
