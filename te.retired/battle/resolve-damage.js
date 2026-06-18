// =================================================================
// RESOLVE DAMAGE — The core damage calculation pipeline
// =================================================================

const { safeEval } = require('../event_runner');
const { jp, buildFormulaVars } = require('./stats');
const { routeLimbDamage, getAllWoundLevels, applyWoundPenalties } = require('./limbs');
const {
    resolveDefense, aiPickDefense, trackDiminishingReturns, getKiRangedDodgeBonus,
    applyBleed, checkBreakShield, tickBreakState, getBreakDamageBonus,
    applyStaggerPressure, applyActionCommandBonus,
    checkOneMore, applyTurnDelay,
    getWeaponTriangleBonus
} = require('./systems');
const {
    evaluateFlavorText, evaluateRpDescription, generateNarration,
    resolveComboProc, trackFlavorText
} = require('./narrative');
const {
    checkElementalReaction, addThreat,
    getAiDifficultyMult
} = require('./rules');
const { applyWeatherEffects, getStealthBonus, checkBossPhase } = require('./world');

// BattleState lazy-require to avoid circular dependency
let _BattleState = null;
function getBattleState() {
    if (!_BattleState) {
        _BattleState = require('./legacy').BattleState;
    }
    return _BattleState;
}

// --- RESOLVE DAMAGE ---
async function resolveDamage(db, battle, actor, target, effects, actionName, result, targetLimb, flavorText, commandId) {
    // Lazy require combat.js functions to avoid circular dependency
    const { applyStatus, resolveStatusFromEffect, checkReactions, checkDeathOrKnockout } = require('./combat');

    const BattleState = getBattleState();
    const dmgDef = effects.damage;

    // Range check for basic Attack (default melee range=1 when grid is active)
    if (target && actor.gridX !== undefined && target.gridX !== undefined) {
        const range = effects.range !== undefined ? effects.range : 1;
        if (range !== 99 && !battle.isInRange(actor.charId, target.charId, range)) {
            const dist = BattleState.chebyshev(actor, target);
            result.log.push(`⚠️ ${target.name} is out of reach (dist ${dist}, need ≤${range}). Move closer first.`);
            return result;
        }
    }

    const vars = buildFormulaVars(actor, target);

    // Calculate base damage
    let damage = Math.floor(safeEval(dmgDef.formula || 'ATK*2-DEF', vars));

    // Randomize
    if (dmgDef.randomize) {
        const rand = 1 + (Math.random() * 2 - 1) * dmgDef.randomize;
        damage = Math.floor(damage * rand);
    }

    // Session 9/12: RP Description bonus (expanded flavor text system)
    if (flavorText) {
        // Session 12: Use the expanded RP description engine if enabled, fall back to Session 9
        if (battle._settings?.enable_rp_descriptions) {
            const rpResult = await evaluateRpDescription(db, battle, actor, flavorText, 'attack', battle._settings);
            if (rpResult.bonus > 0) {
                damage = Math.floor(damage * (1 + rpResult.bonus));
                for (const log of rpResult.log) result.log.push(log);
                result.log.push(`💬 "${flavorText}"`);
            }
        } else if (battle._settings?.enable_flavor_text) {
            // Fall back to Session 9 simple flavor text
            const flavorResult = await evaluateFlavorText(db, battle, actor, flavorText, null, commandId, battle._settings);
            if (flavorResult.bonus > 0) {
                damage = Math.floor(damage * (1 + flavorResult.bonus));
                for (const log of flavorResult.log) result.log.push(log);
                result.log.push(`💬 "${flavorText}"`);
            }
        }
        // Session 11: Track for sig tech discovery (always, regardless of which system)
        if (battle._settings?.enable_signature_techs) {
            try {
                const discovery = await trackFlavorText(db, actor.charId, flavorText, battle?.id, null, damage, battle._settings);
                if (discovery?.discovered) result._sigTechDiscovery = discovery;
            } catch {}
        }
    }

    // Session 12: Apply taunt damage bonus
    if (actor._tauntBonus?.damageBonus) {
        damage = Math.floor(damage * (1 + actor._tauntBonus.damageBonus));
        result.log.push(`😤 Taunt bonus: +${Math.round(actor._tauntBonus.damageBonus * 100)}% damage!`);
    }
    // Session 12: Apply intimidation debuff on attacker
    if (actor._intimidated?.atkReduction) {
        damage = Math.floor(damage * (1 - actor._intimidated.atkReduction));
    }
    // Session 12: Apply rally buff
    if (actor._rallied?.atkBonus) {
        damage = Math.floor(damage * (1 + actor._rallied.atkBonus));
    }

    // Session 23: Status combo bonus (from previous status interactions)
    if (target._statusComboBonus > 0) {
        damage = Math.floor(damage * (1 + target._statusComboBonus));
        result.log.push(`💥 Status combo amplifies damage! (+${Math.round(target._statusComboBonus * 100)}%)`);
        target._statusComboBonus = 0;
    }

    // Session 23: AI difficulty modifier
    if (actor.isAI) {
        damage = Math.floor(damage * getAiDifficultyMult(battle._settings));
    }

    // Session 18: Stealth bonus (first strike from hiding)
    const stealthBonus = getStealthBonus(actor, battle._settings);
    if (stealthBonus > 0) {
        damage = Math.floor(damage * (1 + stealthBonus));
        result.log.push(`🥷 Ambush! +${Math.round(stealthBonus * 100)}% damage from stealth!`);
    }

    // Session 17: Weather effects on damage + accuracy
    const skillElements = effects.elements || (effects.apply_weapon_elements ? actor.weaponElements : []);
    const isRangedAttack = effects.range && effects.range > 1;
    const weatherResult = applyWeatherEffects(battle, damage, skillElements?.[0], isRangedAttack, actor);
    damage = weatherResult.damage;
    if (weatherResult.missed) {
        result.log.push(`🌧️ ${actor.name}'s attack goes wide in the ${battle._weather?.name || 'weather'}!`);
        result.actions.push({ type: 'miss', target: target.name, weatherMiss: true });
        return result;
    }

    // ── Damage Type: True damage and % HP ──────────────────────
    const dmgType = dmgDef.type || 'physical';
    const isTrueDamage = dmgType === 'true';
    const isPctDamage = dmgType === 'percent_hp';

    if (isPctDamage) {
        // Percentage-based: formula result is treated as a % of target max HP
        damage = Math.floor(target.maxHp * (Math.abs(damage) / 100));
    }

    // ── Flat Armor / Magic Resist Reduction ──────────────────
    // Physical damage reduced by DEF, magical by MD.
    // True damage and % HP damage skip armor entirely.
    if (!isTrueDamage && !isPctDamage && damage > 0) {
        let armor = 0;
        if (dmgType === 'magic') {
            armor = target.md || 0;
        } else {
            armor = target.def || 0;
        }
        // Penetration: attacker ignores a % of armor
        const penPct = actor._penetration || 0;
        if (penPct > 0) armor = Math.floor(armor * (1 - penPct));

        // Clamp armor to 0 minimum — negative armor must never amplify damage
        armor = Math.max(0, armor);

        // Apply flat armor reduction (configurable formula)
        // Default: damage * (100 / (100 + armor)) — diminishing returns curve
        const armorReduction = 100 / (100 + armor);
        damage = Math.floor(damage * armorReduction);
    }

    // ── Critical Hit ─────────────────────────────────────────
    let crit = false;
    const baseCritChance = battle._settings?.base_crit_chance || (actor.luck || 5);
    const weatherCritBonus = battle._weather?.combatEffects?.crit_bonus || 0;
    const critResist = target._critResist || 0;
    const finalCritChance = Math.max(0, baseCritChance + weatherCritBonus * 100 - critResist);
    if (Math.random() * 100 < finalCritChance) {
        const critMult = battle._settings?.crit_damage_multiplier || 1.5;
        damage = Math.floor(damage * critMult);
        crit = true;
    }

    // ── Terrain & Flanking modifiers ─────────────────────────────
    // TEACHING: We get the terrain mods object from BattleState.
    // It looks at both combatants' tile types and whether the attacker
    // is flanking. We apply them here so every damage path (basic attack,
    // skills, AoE hits) all benefit from terrain automatically.
    if (target && battle) {
        const tmods = battle.getTerrainModifiers(actor.charId, target.charId);

        // Range bonus from high ground
        if (tmods.rangeBonus && effects.range !== undefined && effects.range !== 99) {
            effects = { ...effects, range: effects.range + tmods.rangeBonus };
        }

        // Flanking: extra crit chance
        if (tmods.flanking && !crit) {
            if (Math.random() * 100 < tmods.critBonus) {
                damage = Math.floor(damage * 1.5);
                crit = true;
            }
        }

        // Damage bonus (high ground, prone melee)
        if (tmods.damageBonus !== 1.0) {
            damage = Math.floor(damage * tmods.damageBonus);
        }

        // Cover / forest damage reduction applied to final damage
        if (tmods.coverReduction > 0) {
            damage = Math.floor(damage * (1 - tmods.coverReduction / 100));
        }

        // Log terrain notes
        for (const note of (tmods.terrainNotes || [])) {
            result.log.push(note);
        }
    }

    // Session 8: Head wound accuracy penalty stacks with Blind miss chance
    if (actor._woundFlags?.accuracy_penalty) {
        actor._missChance = (actor._missChance || 0) + actor._woundFlags.accuracy_penalty;
    }

    // Blind / miss chance check (+ wound accuracy penalties)
    if (actor._missChance && Math.random() * 100 < actor._missChance) {
        actor._missChance = 0;
        result.log.push(`${actor.name}'s attack misses!`);
        result.actions.push({ type: 'miss', target: target.name });
        return result;
    }
    actor._missChance = 0;

    // ── Session 8: Called shot accuracy penalty ──────────────────
    // Targeting a specific limb is harder than hitting torso.
    // If the called shot misses, it hits torso instead (no total whiff).
    let effectiveLimb = targetLimb || actor._targetLimb || null;
    if (effectiveLimb && battle._settings?.enable_limb_targeting && battle._settings?.enable_called_shot_penalty) {
        const zone = target._limbZones?.find(z => z.key === effectiveLimb);
        if (zone && zone.calledShotPenalty > 0) {
            if (Math.random() < zone.calledShotPenalty) {
                result.log.push(`⚠️ Called shot to ${zone.label} misses the mark — hits torso instead!`);
                effectiveLimb = 'torso';
            }
        }
    }

    // Element processing
    let elements = [];
    if (effects.apply_weapon_elements && actor.weaponElements.length) {
        elements = [...actor.weaponElements];
    }
    if (effects.elements) {
        elements = [...elements, ...effects.elements];
    }

    // --- ELEMENT SYSTEM ---
    // TEACHING: Elements work in two layers:
    //
    //   1. RESISTANCE: The attacker's element is in the target's WEAKNESS list
    //      → 50% bonus damage ("Super Effective")
    //   2. IMMUNITY: The attacker's element is in the target's STRENGTH list
    //      → damage halved ("Not very effective")
    //   3. No match → normal damage
    //
    // Target weaknesses/strengths come from their equipped items (elements JSON
    // with role='defense') and their race (future: game_races.element_affinities).
    //
    // We load all element rows once, then do set math in JavaScript — no N+1 queries.
    if (elements.length > 0) {
        const [allElems] = await db.query("SELECT * FROM game_elements");
        const elemMap = {};
        for (const e of allElems) elemMap[e.name.toLowerCase()] = e;

        // Build target's defensive element set from equipment
        const [targetEquip] = await db.query(`
            SELECT gi.elements FROM character_equipment ce
            JOIN game_items gi ON ce.item_id = gi.id
            WHERE ce.character_id = ?`, [target.charId]);

        // NEW: Use target's pre-loaded elemDefenses [{elem, role, pct}]
        // roles: weak(+%), resist(-%), nullify(0), absorb(heal)
        let absorbed = false;
        let finalMultiplier = 1.0;
        let elemLog = null;

        for (const elemName of elements) {
            const en = elemName.toLowerCase();
            // Check explicit defense entries first
            const defense = target.elemDefenses.find(d => d.elem === en);
            if (defense) {
                switch (defense.role) {
                    case 'absorb':
                        // Heal target instead of damaging
                        absorbed = true;
                        target.currentHp = Math.min(target.maxHp, target.currentHp + damage);
                        elemLog = `✨ ${target.name} absorbs the ${elemName} and recovers ${damage} HP!`;
                        break;
                    case 'nullify':
                        finalMultiplier = 0;
                        elemLog = `🛡️ ${target.name} nullifies the ${elemName}!`;
                        break;
                    case 'resist': {
                        const pct = defense.pct !== undefined ? defense.pct : 50;
                        const mult = 1 - (pct / 100);
                        if (mult < finalMultiplier) {
                            finalMultiplier = mult;
                            elemLog = `💧 ${target.name} resists ${elemName}! (-${pct}%)`;
                        }
                        break;
                    }
                    case 'weak': {
                        const pct = defense.pct !== undefined ? defense.pct : 50;
                        const mult = 1 + (pct / 100);
                        if (mult > finalMultiplier) {
                            finalMultiplier = mult;
                            elemLog = `🔥 ${target.name} is weak to ${elemName}! (+${pct}%)`;
                        }
                        break;
                    }
                }
            } else {
                // Fallback: check element strengths/weaknesses table
                const elem = elemMap[en];
                if (!elem) continue;
                const strengths  = jp(elem.strengths_json,  []).map(n => String(n).toLowerCase());
                const weaknesses = jp(elem.weaknesses_json, []).map(n => String(n).toLowerCase());
                const targetElems = target.elemDefenses.map(d => d.elem);
                const isWeak    = targetElems.some(te => strengths.includes(te)) || weaknesses.some(we => targetElems.includes(we));
                const isResist  = targetElems.some(te => weaknesses.includes(te));
                if (isWeak && !isResist) {
                    if (1.5 > finalMultiplier) { finalMultiplier = 1.5; elemLog = `🔥 Super effective! (+50%)`; }
                } else if (isResist && !isWeak) {
                    if (0.5 < finalMultiplier) { finalMultiplier = 0.5; elemLog = `💧 Not very effective... (-50%)`; }
                }
            }
        }

        if (!absorbed) {
            if (finalMultiplier === 0) {
                damage = 0;
            } else {
                damage = Math.floor(damage * finalMultiplier);
            }
            if (elemLog) result.log.push(elemLog);
        } else {
            // absorbed — skip normal damage application below
            result.log.push(elemLog);
            result.actions.push({ type: 'absorb', target: target.name, amount: damage, elements });
            return result;
        }
    }

    // POWER STANCE: physical attacker deals 1.4x damage
    if (actor._stance === 'POWER') {
        damage = Math.floor(damage * 1.4);
    }

    // GUARD STANCE on target: halves all incoming damage
    if (target._stance === 'GUARD') {
        damage = Math.floor(damage * 0.5);
        // Guard stance also fills limit faster
        target.limitbreak = Math.min(100, target.limitbreak + (damage / target.maxHp) * 100 * 0.25);
    }

    // Defending status halves damage (stacks with guard stance)
    const defendingStatus = target.statuses.find(s => s.id === 2 || s.name === 'Defending');
    if (defendingStatus) {
        damage = Math.floor(damage * 0.5);
    }

    // ── Session 8: Active Defense ────────────────────────────────
    // Resolve dodge/block/counter for the defender.
    // AI picks automatically; human uses their pre-set defense stance.
    let defenseResult = { type: 'none', success: false, reduction: 0, dodged: false, log: [] };
    if (battle._settings?.enable_active_defense && target.currentHp > 0) {
        // Track diminishing returns for attacker
        trackDiminishingReturns(actor, actionName, battle._settings);

        // Determine defense choice
        let defenseChoice = 'none';
        if (target.isAI) {
            defenseChoice = aiPickDefense(target);
        } else {
            // Human: use their pre-set defense preference (_defaultDefense)
            // This is set via socket event 'battle_set_defense'
            defenseChoice = target._defaultDefense || 'block';
        }

        defenseResult = resolveDefense(battle, actor, target, defenseChoice, damage, battle._settings);

        // Apply defense log
        for (const log of defenseResult.log) result.log.push(log);

        if (defenseResult.dodged) {
            // Full evade — shift defender 1 tile if on grid
            if (target.gridX !== undefined && battle.GRID_W) {
                // Try to shift away from attacker
                const dx = target.gridX > actor.gridX ? 1 : (target.gridX < actor.gridX ? -1 : 0);
                const dy = target.gridY > actor.gridY ? 1 : (target.gridY < actor.gridY ? -1 : 0);
                const nx = Math.max(0, Math.min(battle.GRID_W - 1, target.gridX + dx));
                const ny = Math.max(0, Math.min(battle.GRID_H - 1, target.gridY + dy));
                const occupied = Object.values(battle.combatants).some(
                    c => c.charId !== target.charId && c.currentHp > 0 && c.gridX === nx && c.gridY === ny);
                const objBlocked = battle.getObjectAt(nx, ny)?.blocking;
                if (!occupied && !objBlocked && (nx !== target.gridX || ny !== target.gridY)) {
                    target.gridX = nx;
                    target.gridY = ny;
                    result.log.push(`${target.name} shifts to (${nx},${ny})`);
                }
            }
            result.actions.push({ type: 'dodge', target: target.name, success: true });
            battle.addLog({ actor: target.name, action: 'Dodge', text: `${target.name} dodges!` });
            return result; // Full evade — skip all damage
        }

        if (defenseResult.reduction > 0) {
            damage = Math.floor(damage * (1 - defenseResult.reduction));
            result.actions.push({ type: 'block', target: target.name, reduction: defenseResult.reduction, success: true });
        }
    }

    // ── Action Command timing bonus (Mario RPG style) ─────────
    if (actionTiming && battle._settings?.enable_action_commands && battle._actionCommands) {
        const cmd = battle._actionCommands.find(c => c.trigger_on === 'attack');
        if (cmd) {
            const acResult = applyActionCommandBonus(damage, actionTiming, cmd);
            damage = acResult.damage;
            if (acResult.rating === 'perfect') {
                result.log.push(`⭐ PERFECT timing! +${Math.round(acResult.bonus * 100)}% damage!`);
                result.actions.push({ type: 'action_command', rating: 'perfect', bonus: acResult.bonus });
            } else if (acResult.rating === 'good') {
                result.log.push(`✨ Good timing! +${Math.round(acResult.bonus * 100)}% damage!`);
                result.actions.push({ type: 'action_command', rating: 'good', bonus: acResult.bonus });
            }
        }
    }

    // ── Damage Floor & Cap ─────────────────────────────────────
    damage = Math.max(1, damage);
    const dmgCap = battle._settings?.damage_cap || 0;
    if (dmgCap > 0) damage = Math.min(dmgCap, damage);

    // ── Cover intercept: tank redirects damage ──────────────────
    if (battle._settings?.enable_cover_system && typeof battle.getCoverer === 'function') {
        const coverer = battle.getCoverer(target.charId);
        if (coverer && coverer.currentHp > 0 && !coverer._knockedOut) {
            const coverRes = { log: [] };
            damage = battle.resolveCoverIntercept(target, damage, coverRes);
            for (const l of coverRes.log) result.log.push(l);
        }
    }

    // ── Barrier absorption: temp shields absorb damage first ────
    if (battle._settings?.enable_barriers && typeof battle.resolveBarrier === 'function' && target._barrier) {
        const barrierRes = { log: [] };
        const bDmgType = dmgDef.type || 'physical';
        damage = battle.resolveBarrier(target.charId, damage, bDmgType, barrierRes);
        for (const l of barrierRes.log) result.log.push(l);
    }

    // ── Session 8: Limb damage routing ──────────────────────────
    let limbResult = null;
    if (battle._settings?.enable_limb_targeting && target._limbHp && effectiveLimb) {
        limbResult = routeLimbDamage(target, damage, effectiveLimb, battle._settings);
        // Main HP takes bleed-through damage (not the full amount)
        target.currentHp = Math.max(0, target.currentHp - limbResult.mainDamage);
        // Update wound levels + apply stat penalties
        if (target._limbHp) {
            target._woundLevels = getAllWoundLevels(target._limbHp, battle._settings);
            applyWoundPenalties(target, battle._settings);
        }
    } else {
        // No limb targeting — direct HP reduction (vanilla behavior)
        target.currentHp = Math.max(0, target.currentHp - damage);
    }

    // Log
    const logText = (effects.log || `{name} attacks!`).replace('{name}', actor.name);
    result.log.push(logText);

    if (limbResult && limbResult.limbDamage > 0) {
        result.log.push(`${crit ? '💥 CRITICAL! ' : ''}${target.name}'s ${limbResult.limbLabel} takes ${limbResult.limbDamage} damage! (${limbResult.mainDamage} bleed-through)`);
        result.actions.push({ type: 'damage', target: target.name, amount: limbResult.mainDamage, limbDamage: limbResult.limbDamage, limb: limbResult.limbKey, crit, elements });
        if (limbResult.limbDisabled) {
            result.log.push(`💀 ${target.name}'s ${limbResult.limbLabel} is disabled!`);
            result.actions.push({ type: 'limb_disabled', target: target.name, limb: limbResult.limbKey, label: limbResult.limbLabel });
        }
        if (limbResult.knockedOut) {
            result.log.push(`💫 ${target.name} is knocked out from a devastating head blow!`);
            target._knockedOut = true;
            target.currentHp = 0;
        }
    } else {
        result.log.push(`${crit ? '💥 CRITICAL! ' : ''}${target.name} takes ${damage} damage!`);
        result.actions.push({ type: 'damage', target: target.name, amount: damage, crit, elements });
    }

    battle.addLog({ actor: actor.name, action: actionName, damage, crit, target: target.name });

    // Break/Shield check (Octopath)
    if (battle._settings?.enable_break_shield && elements.length) {
        checkBreakShield(battle, target, elements, result);
    }
    // Break damage bonus
    damage = Math.floor(damage * getBreakDamageBonus(target, battle._settings));

    // Stagger (FF7R) — pressure builds, staggered = bonus multiplier
    const staggerMult = applyStaggerPressure(battle, target, damage, result);
    if (staggerMult > 1.0) damage = Math.floor(damage * staggerMult);

    // Weapon Triangle (Fire Emblem)
    if (battle._settings?.enable_weapon_triangle && actor._weaponType && target._weaponType) {
        const triBonus = await getWeaponTriangleBonus(db, actor._weaponType, target._weaponType, battle._settings);
        if (triBonus.damage !== 0) {
            damage = Math.floor(damage * (1 + triBonus.damage));
            if (triBonus.damage > 0) result.log.push(`⚔️ Weapon advantage! (+${Math.round(triBonus.damage * 100)}%)`);
            else result.log.push(`⚔️ Weapon disadvantage! (${Math.round(triBonus.damage * 100)}%)`);
        }
    }

    // Passive damage reduction
    if (target._passiveDamageReduction) {
        damage = Math.floor(damage * (1 - target._passiveDamageReduction));
    }

    // Session 23: Elemental reaction check
    if (elements.length && target.currentHp > 0) {
        for (const elem of elements) {
            damage = await checkElementalReaction(db, battle, target, elem, damage, result);
        }
    }

    // Session 23: Track threat
    addThreat(battle, actor.charId, target.charId, damage, 'damage');

    // Session 12: Battle narration (DM-style description)
    if (battle._settings?.enable_battle_narration) {
        const narrType = crit ? 'crit' : 'attack';
        const narration = await generateNarration(db, narrType, {
            actorName: actor.name, targetName: target.name, damage,
            weaponType: actor._weaponType || null,
            element: elements?.[0] || null,
            terrain: battle.terrainMap?.[`${actor.gridX},${actor.gridY}`] || null,
            targetZone: effectiveLimb || null,
        }, battle._settings);
        if (narration) {
            result.log.push(`📖 ${narration}`);
            result.actions.push({ type: 'narration', text: narration });
        }
    }

    // Session 8: Stun chance on being hit (from head wounds)
    if (target._woundFlags?.stun_chance_on_hit > 0 && target.currentHp > 0) {
        if (Math.random() < target._woundFlags.stun_chance_on_hit) {
            await applyStatus(db, target, 'Stun', 1, result);
            result.log.push(`💫 ${target.name}'s head wound causes a daze!`);
        }
    }

    // Weapon status effects (chance to inflict)
    if (effects.apply_weapon_status && Object.keys(actor.weaponStatuses).length) {
        for (const [statusName, duration] of Object.entries(actor.weaponStatuses)) {
            if (Math.random() < 0.25) { // 25% chance
                await applyStatus(db, target, statusName, duration, result);
            }
        }
    }

    // Skill-based status effects
    if (effects.set_status) {
        await resolveStatusFromEffect(db, battle, actor, target, effects.set_status, result);
    }

    // Session 10: Bleed from weapon/command effects
    if (effects.bleed_tier && battle._settings?.enable_bleed_tiers && battle._bleedTiers && target.currentHp > 0) {
        applyBleed(target, effects.bleed_tier, battle._bleedTiers, result, battle._settings);
    }

    // Ogham on-hit statuses (+ curse on wielder if defined)
    if (actor.oghamStatuses && Object.keys(actor.oghamStatuses).length) {
        for (const [statusName, oghamData] of Object.entries(actor.oghamStatuses)) {
            // Handle both old format (number) and new format ({chance, curse})
            const chance = typeof oghamData === 'number' ? oghamData : (oghamData.chance || 20);
            const curse  = typeof oghamData === 'object' ? oghamData.curse : null;
            if (Math.random() * 100 < chance) {
                await applyStatus(db, target, statusName, null, result);
                // Cursed Ogham — also afflicts the wielder
                if (curse && Math.random() * 100 < (curse.chance || 100)) {
                    await applyStatus(db, actor, curse.status, curse.turns || 1, result);
                    const curseLog = (curse.log || `{name} is afflicted by the curse of their own Ogham!`)
                        .replace('{name}', actor.name);
                    result.log.push(`🔴 ${curseLog}`);
                }
            }
        }
    }

    // breaks_on_hit: remove sleep/fragile statuses from target when hit
    const toBreak = [];
    for (let i = 0; i < target.statuses.length; i++) {
        const [bRows] = await db.query("SELECT effects FROM game_statuses WHERE id=?", [target.statuses[i].id]);
        if (bRows.length) {
            const bfx = jp(bRows[0].effects, {});
            if (bfx.breaks_on_hit) toBreak.push(i);
        }
    }
    if (toBreak.length) {
        target.statuses = target.statuses.filter((_, i) => !toBreak.includes(i));
        result.log.push(`${target.name} snaps awake!`);
    }

    // Reactions — target may counter-attack
    await checkReactions(db, battle, target, actor, result, { crit });

    // Limit break fill (defender gains limit from taking damage)
    const fillRate = (damage / target.maxHp) * 100 * 0.5; // Taking damage fills bar
    target.limitbreak = Math.min(100, target.limitbreak + fillRate);

    // Session 16: Check boss phase transition before death check
    if (target._bossPhases && target.currentHp > 0) {
        await checkBossPhase(db, battle, target, result);
    }

    // Check death or knockout
    if (target.currentHp <= 0) {
        checkDeathOrKnockout(battle, actor, target, result);
    }

    // One More check (Persona) — weakness hit or crit = extra turn
    const wasWeakness = elements.length > 0 && target.elemDefenses?.some(d =>
        d.role === 'weak' && elements.includes(d.elem));
    checkOneMore(battle, actor, target, wasWeakness, crit, result);

    // Turn delay from skills
    if (effects.turn_delay && target.currentHp > 0) {
        applyTurnDelay(battle, target, effects.turn_delay, result);
    }

    // Break tick
    tickBreakState(target);

    // Session 16: Track DPS for win condition
    if (battle._winCondition?.conditionType === 'dps_check') {
        battle._dpsCheckDamage = (battle._dpsCheckDamage || 0) + damage;
    }

    // Session 9: Combo proc (basic Attack only — skills have their own combo in resolveSkill)
    if (target.currentHp > 0 && battle.status === 'ACTIVE') {
        // Load combo chance from the command
        try {
            const [cmdComboRows] = await db.query(
                'SELECT combo_chance, combo_max_chain FROM game_battle_commands WHERE id=?', [commandId || 1]);
            if (cmdComboRows.length && cmdComboRows[0].combo_chance > 0) {
                await resolveComboProc(db, battle, actor, target,
                    parseFloat(cmdComboRows[0].combo_chance),
                    parseInt(cmdComboRows[0].combo_max_chain) || 1,
                    actionName, result);
            }
        } catch {} // non-fatal
    }

    return result;
}

module.exports = { resolveDamage };
