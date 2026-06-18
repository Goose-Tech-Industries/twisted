// =================================================================
// BATTLE SYSTEMS — Active Defense, Ki, Bleed, Final 8 RPG Mechanics,
//                  Combo Input, Action Commands, Alignment, DR
// =================================================================
// Extracted from legacy.js for modular organization.

const { safeEval } = require('../event_runner');
const { jp, buildFormulaVars } = require('./stats');

// =================================================================
// SESSION 8: ACTIVE DEFENSE SYSTEM (Dodge / Block / Counter)
// =================================================================
// Inspired by Planet Mado's defense mechanics. When a combatant is
// attacked, they can choose to dodge, block, or counter.
//
// For human defenders: emits a prompt, waits for response (with timeout).
// For AI defenders: resolves instantly based on tactics.
//
// This is implemented as a synchronous resolution (no async pause) —
// the defense choice is either pre-set by the defender or auto-resolved.
// Human players set their "default defense" stance which applies
// automatically, OR the defense is resolved per-attack if they have
// quick enough reflexes (client-side prediction, server validates).

// Resolve a defense action. Returns { type, success, reduction, dodged, counterResult }
function resolveDefense(battle, attacker, defender, defenseType, damage, settings, extraDodgeBonus = 0) {
    const result = {
        type: defenseType || 'none',
        success: false,
        reduction: 0,     // damage multiplier reduction (0.25 = 25% blocked)
        dodged: false,     // full evade
        counterResult: null,
        log: []
    };

    if (!defenseType || defenseType === 'none' || !settings?.enable_active_defense) {
        return result;
    }

    // Stun halves all defense chances
    const isStunned = defender.statuses?.some(s =>
        s.name === 'Stun' || s.name === 'Stunned' || s.name === 'Stunned'
    );
    const stunMult = isStunned ? 0.5 : 1.0;

    switch (defenseType) {
        case 'dodge': {
            // Dodge: speed differential + base chance. Success = full evade.
            const baseChance = settings.dodge_base_chance || 0.15;
            const speedFactor = settings.dodge_speed_factor || 0.35;
            const maxChance = settings.dodge_max_chance || 0.90;

            // Speed ratio: every 2x speed advantage = +speedFactor
            const speedRatio = (defender.speed || 1) / Math.max(1, attacker.speed || 1);
            let chance = baseChance;
            if (speedRatio >= 2) chance += speedFactor * Math.floor(Math.log2(speedRatio));

            // Diminishing returns from repeated attacks
            if (attacker._diminishingReturns > 0) {
                chance += attacker._diminishingReturns;
            }

            // Session 9: Ki/ranged dodge bonus
            if (extraDodgeBonus > 0) chance += extraDodgeBonus;

            // Session 13: Fighting style dodge bonus
            if (defender._fightingStyle?.rankPassives?.dodge_bonus) {
                chance += defender._fightingStyle.rankPassives.dodge_bonus;
            }

            chance = Math.min(maxChance, chance * stunMult);

            if (Math.random() < chance) {
                result.success = true;
                result.dodged = true;
                result.log.push(`💨 ${defender.name} dodges the attack!`);
            } else {
                result.log.push(`${defender.name} tries to dodge but fails!`);
            }
            break;
        }
        case 'block': {
            // Block: Mado-style two d6 rolls. 1 or 2 = block arm.
            // One arm = 25% reduction, both arms (diff numbers) = 50%
            let dieSides = isStunned
                ? (settings.block_stun_die_sides || 12)
                : (settings.block_die_sides || 6);
            const successNums = settings.block_success_numbers || [1, 2];
            let oneArmReduction = settings.block_one_arm_reduction || 0.25;
            let twoArmReduction = settings.block_two_arm_reduction || 0.50;
            // Session 13: Style block bonus — reduces die sides (easier to block)
            if (defender._fightingStyle?.rankPassives?.block_bonus) {
                const blockBonus = defender._fightingStyle.rankPassives.block_bonus;
                oneArmReduction += blockBonus * 0.5;
                twoArmReduction += blockBonus * 0.5;
            }

            const roll1 = Math.floor(Math.random() * dieSides) + 1;
            const roll2 = Math.floor(Math.random() * dieSides) + 1;
            const hit1 = successNums.includes(roll1);
            const hit2 = successNums.includes(roll2);

            if (hit1 && hit2 && roll1 !== roll2) {
                // Both arms, different numbers — full block
                result.success = true;
                result.reduction = twoArmReduction;
                result.log.push(`🛡️ ${defender.name} blocks with both arms! (-${Math.round(twoArmReduction * 100)}% damage) [${roll1},${roll2}]`);
            } else if (hit1 || hit2) {
                // One arm block
                result.success = true;
                result.reduction = oneArmReduction;
                result.log.push(`🛡️ ${defender.name} partially blocks! (-${Math.round(oneArmReduction * 100)}% damage) [${roll1},${roll2}]`);
            } else {
                result.log.push(`${defender.name} tries to block but fails! [${roll1},${roll2}]`);
            }
            break;
        }
        case 'counter': {
            // Counter: base chance, must have a reaction skill
            const baseChance = settings.counter_base_chance || 0.25;
            const chargeBonus = defender._charging ? (settings.counter_charge_bonus || 0.25) : 0;
            const maxChance = settings.counter_max_chance || 0.90;

            let chance = Math.min(maxChance, (baseChance + chargeBonus) * stunMult);

            if (!defender.reactions || !defender.reactions.length) {
                result.log.push(`${defender.name} has no counter skills!`);
                break;
            }

            if (Math.random() < chance) {
                result.success = true;
                // Counter also reduces incoming damage by 25%
                result.reduction = 0.25;
                // The actual counter-attack is handled by the existing reaction system
                // We just flag it so checkReactions gets a bonus
                result.counterResult = { triggered: true };
                result.log.push(`↩️ ${defender.name} counters the attack!`);
            } else {
                result.log.push(`${defender.name} tries to counter but fails!`);
            }
            break;
        }
    }

    return result;
}

// AI picks a defense based on tactics
function aiPickDefense(combatant) {
    const tactics = combatant._tactics || 'BALANCED';
    const hasCounter = combatant.reactions && combatant.reactions.length > 0;
    const roll = Math.random();

    switch (tactics) {
        case 'AGGRESSIVE':
            if (hasCounter && roll < 0.10) return 'counter';
            if (roll < 0.40) return 'block';
            if (roll < 0.70) return 'dodge';
            return 'block';
        case 'DEFENSIVE':
            if (hasCounter && roll < 0.20) return 'counter';
            if (roll < 0.60) return 'dodge';
            return 'block';
        case 'SUPPORT':
            if (roll < 0.50) return 'dodge';
            if (hasCounter && roll < 0.60) return 'counter';
            return 'block';
        default: // BALANCED
            if (hasCounter && roll < 0.15) return 'counter';
            if (roll < 0.48) return 'dodge';
            return 'block';
    }
}

// Track diminishing returns: same attack repeated = opponent gets dodge bonus
function trackDiminishingReturns(attacker, actionName, settings) {
    if (!settings?.enable_diminishing_returns) return;
    const perRepeat = settings.diminishing_returns_per_repeat || 0.05;
    const max = settings.diminishing_returns_max || 0.15;

    if (attacker._lastAttackUsed === actionName) {
        attacker._diminishingReturns = Math.min(max, (attacker._diminishingReturns || 0) + perRepeat);
    } else {
        attacker._lastAttackUsed = actionName;
        attacker._diminishingReturns = 0;
    }
}

// =================================================================
// SESSION 10A: KI CHANNELING
// =================================================================
// Once per battle: restore HP to max for N turns, then crash to a
// fraction of pre-channel HP. Mado: "5 turns at full power, then
// your powerlevel goes down to half of what it was before."

function resolveKiChannel(battle, actor, result) {
    const settings = battle._settings || {};
    if (!settings.enable_ki_channeling) {
        result.log.push(`Ki channeling is not available.`);
        return result;
    }
    const maxUses = settings.ki_channel_uses_per_battle || 1;
    if ((actor._kiChannelUsed || 0) >= maxUses) {
        result.log.push(`${actor.name} has already channeled their ki this battle!`);
        return result;
    }
    if (actor._kiChanneled) {
        result.log.push(`${actor.name} is already channeling!`);
        return result;
    }

    const duration = settings.ki_channel_duration || 5;
    const savedHp = actor.currentHp;

    actor._kiChanneled = {
        turnsLeft: duration,
        savedHp: savedHp,
        crashPct: settings.ki_channel_crash_pct || 0.50
    };
    actor._kiChannelUsed = (actor._kiChannelUsed || 0) + 1;

    // Restore to full HP
    actor.currentHp = actor.maxHp;

    result.log.push(`🔥 ${actor.name} CHANNELS THEIR KI! Full power for ${duration} turns!`);
    result.actions.push({
        type: 'ki_channel', actor: actor.name,
        duration, savedHp, restoredHp: actor.maxHp
    });
    battle.addLog({ actor: actor.name, action: 'Channel Ki', text: `${actor.name} surges to full power!` });
    return result;
}

// Called each turn for channeled combatants — ticks down, crashes when done
function tickKiChannel(combatant, tickResult) {
    if (!combatant._kiChanneled) return;
    combatant._kiChanneled.turnsLeft--;

    if (combatant._kiChanneled.turnsLeft <= 0) {
        // CRASH — drop to savedHp * crashPct
        const crashHp = Math.max(1, Math.floor(
            combatant._kiChanneled.savedHp * combatant._kiChanneled.crashPct
        ));
        combatant.currentHp = Math.min(combatant.currentHp, crashHp);
        tickResult.log.push(`💥 ${combatant.name}'s ki channeling ends! Power crashes to ${crashHp} HP!`);
        tickResult.actions.push({
            type: 'ki_channel_crash', target: combatant.name,
            crashHp, previousHp: combatant._kiChanneled.savedHp
        });
        combatant._kiChanneled = null;
    } else {
        tickResult.log.push(`🔥 ${combatant.name}'s ki burns bright! (${combatant._kiChanneled.turnsLeft} turns left)`);
    }
}

// =================================================================
// SESSION 10B: BLEED TIERS
// =================================================================
// Three severity levels of bleeding. Damage is % of BASE maxHp per
// turn, bypasses defense. Same tier refreshes duration, different
// tiers stack.

// Load bleed tier definitions from DB (cached on battle)
async function loadBleedTiers(db) {
    try {
        const [rows] = await db.query('SELECT * FROM game_bleed_tiers ORDER BY id');
        const tiers = {};
        for (const r of rows) {
            tiers[r.name] = {
                id: r.id,
                name: r.name,
                label: r.label,
                icon: r.icon || '🩸',
                duration: r.duration_turns,
                damagePct: parseFloat(r.damage_pct) || 0.03,
                color: r.color || 'text-destructive'
            };
        }
        return tiers;
    } catch {
        // Fallback defaults if table doesn't exist
        return {
            light:    { id: 1, name: 'light',    label: 'Light Bleed',    icon: '🩸', duration: 2, damagePct: 0.03, color: 'text-[oklch(0.65_0.15_25)]' },
            moderate: { id: 2, name: 'moderate', label: 'Moderate Bleed', icon: '🩸', duration: 4, damagePct: 0.03, color: 'text-[oklch(0.55_0.20_25)]' },
            heavy:    { id: 3, name: 'heavy',    label: 'Heavy Bleed',    icon: '💉', duration: 5, damagePct: 0.03, color: 'text-destructive' }
        };
    }
}

// Apply a bleed to a combatant. Same tier refreshes, different tiers stack.
function applyBleed(combatant, tierName, bleedTiers, result, settings) {
    const tier = bleedTiers[tierName];
    if (!tier) return;

    if (!combatant._bleeds) combatant._bleeds = [];

    // Configurable caps (AdminSauce editable via system_settings)
    const maxStacks = settings?.bleed_max_stacks || 2;
    const maxDuration = settings?.bleed_max_duration || 4;
    const cappedDuration = Math.min(tier.duration, maxDuration);

    // Check if same tier already active — refresh duration
    const existing = combatant._bleeds.find(b => b.tier === tierName);
    if (existing) {
        existing.turnsLeft = cappedDuration;
        result.log.push(`${tier.icon} ${combatant.name}'s ${tier.label} is refreshed! (${cappedDuration} turns)`);
    } else if (combatant._bleeds.length >= maxStacks) {
        // At max stacks — refresh the oldest bleed instead of adding new
        const oldest = combatant._bleeds[0];
        oldest.tier = tierName;
        oldest.turnsLeft = cappedDuration;
        oldest.damagePct = tier.damagePct;
        oldest.icon = tier.icon;
        oldest.label = tier.label;
        result.log.push(`${tier.icon} ${combatant.name}'s bleed intensifies to ${tier.label}! (${cappedDuration} turns, max stacks)`);
    } else {
        combatant._bleeds.push({
            tier: tierName,
            turnsLeft: cappedDuration,
            damagePct: tier.damagePct,
            icon: tier.icon,
            label: tier.label
        });
        result.log.push(`${tier.icon} ${combatant.name} is afflicted with ${tier.label}! (${cappedDuration} turns)`);
    }
    result.actions.push({ type: 'bleed_applied', target: combatant.name, tier: tierName, label: tier.label });
}

// Tick bleeds at end of turn. Returns damage dealt.
function tickBleeds(combatant, tickResult) {
    if (!combatant._bleeds || !combatant._bleeds.length) return;
    if (combatant.currentHp <= 0) return;

    // Use BASE maxHp for bleed damage (not wound-reduced)
    const baseMaxHp = combatant._baseStats?.maxHp || combatant.maxHp;
    const toRemove = [];

    for (let i = 0; i < combatant._bleeds.length; i++) {
        const bleed = combatant._bleeds[i];
        const dmg = Math.max(1, Math.floor(baseMaxHp * bleed.damagePct));
        combatant.currentHp = Math.max(0, combatant.currentHp - dmg);

        tickResult.log.push(`${bleed.icon} ${combatant.name} bleeds for ${dmg} damage! (${bleed.label})`);
        tickResult.actions.push({
            type: 'bleed_tick', target: combatant.name,
            amount: dmg, tier: bleed.tier
        });

        bleed.turnsLeft--;
        if (bleed.turnsLeft <= 0) {
            toRemove.push(i);
            tickResult.log.push(`${bleed.icon} ${combatant.name}'s ${bleed.label} stops.`);
        }
    }

    if (toRemove.length) {
        combatant._bleeds = combatant._bleeds.filter((_, i) => !toRemove.includes(i));
    }
}

// =================================================================
// FINAL 8 RPG MECHANICS
// =================================================================

// 1. BREAK/SHIELD (Octopath) — reduce shield on weakness hit, break = stun + bonus dmg
function checkBreakShield(battle, target, elements, result) {
    if (!battle._settings?.enable_break_shield) return;
    if (!target._shieldPoints || target._shieldPoints <= 0) return;
    if (target._isBroken) return;

    const weaknesses = target._shieldWeaknesses || [];
    const hitWeakness = elements.some(e => weaknesses.includes(e));
    if (!hitWeakness) return;

    target._shieldPoints--;
    result.log.push(`🛡️ Shield crack! ${target._shieldPoints} shields remaining.`);
    result.actions.push({ type: 'shield_hit', target: target.name, remaining: target._shieldPoints });

    if (target._shieldPoints <= 0) {
        target._isBroken = true;
        target._brokenTurns = parseInt(battle._settings.break_stun_turns) || 1;
        result.log.push(`💥 BREAK! ${target.name}'s defenses shatter!`);
        result.actions.push({ type: 'break', target: target.name });
    }
}

// Tick break recovery
function tickBreakState(combatant) {
    if (!combatant._isBroken) return;
    combatant._brokenTurns--;
    if (combatant._brokenTurns <= 0) {
        combatant._isBroken = false;
        combatant._shieldPoints = combatant._maxShieldPoints || 3;
    }
}

// Break damage bonus multiplier
function getBreakDamageBonus(target, settings) {
    if (!target._isBroken) return 1.0;
    return 1.0 + (parseFloat(settings?.break_damage_bonus) || 0.50);
}

// 1b. STAGGER GAUGE (FF7 Remake) — pressure builds from all damage, stagger = bonus window
function applyStaggerPressure(battle, target, damage, result) {
    if (!battle._settings?.enable_stagger_system) return 1.0;
    if (!target._staggerThreshold || target._staggerThreshold <= 0) return 1.0;

    let mult = 1.0;

    if (target._isStaggered) {
        // During stagger: damage multiplier increases with each hit
        target._staggerMult = Math.min(3.0, (target._staggerMult || target._staggerBaseMult || 1.50) + 0.10);
        mult = target._staggerMult;
        result.log.push(`💫 STAGGERED! Damage x${target._staggerMult.toFixed(1)}!`);
        result.actions.push({ type: 'stagger_hit', target: target.name, mult: target._staggerMult });
    } else {
        // Build pressure
        const increase = (parseFloat(battle._settings.stagger_base_increase) || 5) + Math.floor(damage / 10);
        target._staggerGauge = (target._staggerGauge || 0) + increase;
        if (target._staggerGauge >= target._staggerThreshold) {
            // STAGGERED!
            target._isStaggered = true;
            target._staggerTurnsLeft = target._staggerDuration || 3;
            target._staggerMult = target._staggerBaseMult || 1.50;
            target._staggerGauge = 0;
            result.log.push(`💥 ${target.name} is STAGGERED!`);
            result.actions.push({ type: 'stagger', target: target.name, duration: target._staggerTurnsLeft });
        }
    }
    return mult;
}

function tickStagger(combatant, settings) {
    if (combatant._isStaggered) {
        combatant._staggerTurnsLeft--;
        if (combatant._staggerTurnsLeft <= 0) {
            combatant._isStaggered = false;
            combatant._staggerMult = null;
            combatant._staggerGauge = 0;
        }
    } else if (combatant._staggerGauge > 0) {
        // Decay pressure when not being hit
        const decay = parseFloat(settings?.stagger_decay_per_turn) || 10;
        combatant._staggerGauge = Math.max(0, combatant._staggerGauge - decay);
    }
}

// 2. ONE MORE + BATON PASS (Persona)
function checkOneMore(battle, actor, target, wasWeakness, wasCrit, result) {
    if (!battle._settings?.enable_one_more) return false;
    const onCrit = battle._settings.one_more_on_crit === 'true';
    if (wasWeakness || (onCrit && wasCrit)) {
        result.log.push(`🎯 ONE MORE! ${actor.name} gets an extra action!`);
        result.actions.push({ type: 'one_more', actor: actor.name });
        battle._oneMoreActive = actor.charId;
        return true;
    }
    return false;
}

// 3. TURN MANIPULATION (Grandia) — delay enemy turn or cancel charge
function applyTurnDelay(battle, target, delayAmount, result) {
    if (!battle._settings?.enable_turn_manipulation || delayAmount <= 0) return;
    // Move target back in the turn queue
    const idx = battle.turnQueue.indexOf(target.charId);
    if (idx >= 0) {
        battle.turnQueue.splice(idx, 1);
        const newIdx = Math.min(battle.turnQueue.length, idx + delayAmount);
        battle.turnQueue.splice(newIdx, 0, target.charId);
        result.log.push(`⏳ ${target.name}'s turn is delayed!`);
        result.actions.push({ type: 'turn_delay', target: target.name, delay: delayAmount });
    }
    // Cancel charge if charging
    if (target._charging) {
        target._charging = null;
        result.log.push(`❌ ${target.name}'s charge is cancelled!`);
        result.actions.push({ type: 'charge_cancel', target: target.name });
    }
}

// 4. MID-BATTLE PARTY SWAP (Pokemon)
function resolvePartySwap(battle, actor, swapInCharId, result) {
    if (!battle._settings?.enable_party_swap) {
        result.log.push('Party swap is not enabled.'); return result;
    }
    const swapIn = battle._reserves?.[swapInCharId];
    if (!swapIn) { result.log.push('No reserve found.'); return result; }

    // Move active out to reserves
    const teamId = battle.getTeamId(actor.charId);
    battle._reserves[actor.charId] = { ...actor };
    delete battle.combatants[actor.charId];
    battle.teams[teamId] = battle.teams[teamId].filter(id => id !== actor.charId);

    // Move reserve in
    battle.combatants[swapInCharId] = swapIn;
    battle.teams[teamId].push(swapInCharId);
    delete battle._reserves[swapInCharId];

    battle._rebuildTurnQueue();
    result.log.push(`🔄 ${actor.name} swaps out! ${swapIn.name} enters the battle!`);
    result.actions.push({ type: 'party_swap', out: actor.name, in: swapIn.name });
    return result;
}

// 5. WEAPON TRIANGLE (Fire Emblem)
async function getWeaponTriangleBonus(db, attackerWeaponType, defenderWeaponType, settings) {
    if (!settings?.enable_weapon_triangle || !attackerWeaponType || !defenderWeaponType) return { damage: 0, accuracy: 0 };
    try {
        const [rows] = await db.query(
            'SELECT bonus_damage, bonus_accuracy FROM game_weapon_triangle WHERE weapon_type_a=? AND beats=?',
            [attackerWeaponType, defenderWeaponType]);
        if (rows.length) return { damage: parseFloat(rows[0].bonus_damage) || 0, accuracy: parseFloat(rows[0].bonus_accuracy) || 0 };
        // Check reverse (disadvantage)
        const [rev] = await db.query(
            'SELECT bonus_damage, bonus_accuracy FROM game_weapon_triangle WHERE weapon_type_a=? AND beats=?',
            [defenderWeaponType, attackerWeaponType]);
        if (rev.length) return { damage: -(parseFloat(rev[0].bonus_damage) || 0), accuracy: -(parseFloat(rev[0].bonus_accuracy) || 0) };
    } catch {}
    return { damage: 0, accuracy: 0 };
}

// 6. ADVANTAGE / DISADVANTAGE (D&D)
function rollWithAdvantage(baseChance, hasAdvantage, hasDisadvantage) {
    if (hasAdvantage && !hasDisadvantage) {
        // Roll twice, take best
        return Math.max(Math.random(), Math.random()) < baseChance;
    }
    if (hasDisadvantage && !hasAdvantage) {
        // Roll twice, take worst
        return Math.min(Math.random(), Math.random()) < baseChance;
    }
    return Math.random() < baseChance;
}

function hasAdvantage(combatant) {
    return combatant.statuses?.some(s => {
        try { const fx = typeof s.effects === 'string' ? JSON.parse(s.effects) : s.effects; return fx?.advantage; } catch { return false; }
    }) || false;
}
function hasDisadvantage(combatant) {
    return combatant.statuses?.some(s => {
        try { const fx = typeof s.effects === 'string' ? JSON.parse(s.effects) : s.effects; return fx?.disadvantage; } catch { return false; }
    }) || false;
}

// 7. PASSIVE ABILITIES — apply at battle start
async function loadPassiveAbilities(db, charId) {
    try {
        const [rows] = await db.query(
            `SELECT gpa.* FROM character_passive_abilities cpa
             JOIN game_passive_abilities gpa ON gpa.id = cpa.ability_id
             WHERE cpa.character_id=? AND gpa.active=1`, [charId]);
        return rows.map(r => ({ id: r.id, name: r.name, label: r.label, icon: r.icon, effects: typeof r.effects === 'string' ? JSON.parse(r.effects) : r.effects }));
    } catch { return []; }
}

function applyPassiveAbilities(combatant, settings) {
    if (!settings?.enable_passive_abilities || !combatant._passives) return;
    for (const p of combatant._passives) {
        const fx = p.effects;
        if (fx.atk_bonus) combatant.atk = Math.round(combatant.atk * (1 + fx.atk_bonus));
        if (fx.def_penalty) combatant.def = Math.max(1, Math.round(combatant.def * (1 + fx.def_penalty)));
        if (fx.dodge_bonus) combatant._passiveDodgeBonus = (combatant._passiveDodgeBonus || 0) + fx.dodge_bonus;
        if (fx.crit_bonus) combatant._passiveCritBonus = (combatant._passiveCritBonus || 0) + fx.crit_bonus;
        if (fx.counter_bonus) combatant._passiveCounterBonus = (combatant._passiveCounterBonus || 0) + fx.counter_bonus;
        if (fx.damage_reduction) combatant._passiveDamageReduction = (combatant._passiveDamageReduction || 0) + fx.damage_reduction;
        if (fx.guaranteed_block) combatant._guaranteedBlock = fx.guaranteed_block;
    }
}

// 8. ROLLING HP (Earthbound) — damage queued, ticks down over time
// This is primarily a CLIENT-SIDE visual effect, but the server tracks pending damage
function queueRollingDamage(combatant, damage, settings) {
    if (!settings?.enable_rolling_hp) {
        combatant.currentHp = Math.max(0, combatant.currentHp - damage);
        return;
    }
    if (!combatant._rollingDamage) combatant._rollingDamage = 0;
    combatant._rollingDamage += damage;
    // Server still applies damage immediately for game logic (death checks etc)
    // but sends the rolling amount so client can animate the odometer
    combatant.currentHp = Math.max(0, combatant.currentHp - damage);
}

// =================================================================
// COMBO INPUT SYSTEM (Legend of Legaia) + ACTION COMMANDS (Mario RPG)
// =================================================================

// Load combo arts for a class (+ universal arts)
async function loadComboArts(db, classId, level) {
    try {
        const [rows] = await db.query(
            `SELECT * FROM game_combo_arts WHERE active=1
             AND (class_id IS NULL OR class_id=?) AND level_required<=?
             ORDER BY ap_cost`, [classId, level]);
        return rows.map(r => ({
            id: r.id, name: r.name, icon: r.icon,
            sequence: r.input_sequence.split(',').map(s => s.trim()),
            sequenceStr: r.input_sequence,
            apCost: r.ap_cost, damageFormula: r.damage_formula,
            element: r.element, statusApply: r.status_apply,
            battleText: r.battle_text, isHidden: r.is_hidden
        }));
    } catch { return []; }
}

// Resolve a combo input sequence
async function resolveComboInput(db, battle, actor, target, inputSequence, result) {
    // Lazy require to avoid circular deps
    const { applyStatus, checkDeathOrKnockout } = require('./combat');
    const { checkElementalReaction } = require('./rules');

    const settings = battle._settings || {};
    if (!settings.enable_combo_input) return result;

    const inputs = Array.isArray(inputSequence) ? inputSequence : (inputSequence || '').split(',').map(s => s.trim());
    if (!inputs.length) { result.log.push(`${actor.name} hesitates...`); return result; }

    // Check AP
    const apCost = inputs.length;
    const currentAp = actor._currentAp || actor.maxAp || 6;
    if (apCost > currentAp) {
        result.log.push(`Not enough AP! Need ${apCost}, have ${currentAp}.`);
        return result;
    }
    actor._currentAp = currentAp - apCost;

    // Display the input sequence
    const inputIcons = { H: '⬆️', L: '⬇️', R: '➡️', U: '⬆️' };
    const inputDisplay = inputs.map(i => inputIcons[i] || i).join(' ');
    result.log.push(`🎮 ${actor.name}: ${inputDisplay}`);
    result.actions.push({ type: 'combo_input', actor: actor.name, inputs, display: inputDisplay });

    // Check if this sequence matches a known Art
    const allArts = actor._comboArts || [];
    const inputStr = inputs.join(',');
    const matchedArt = allArts.find(a => a.sequenceStr === inputStr);

    if (matchedArt) {
        // ART TRIGGERED!
        const text = (matchedArt.battleText || '{name} uses {skill}!')
            .replace('{name}', actor.name).replace('{skill}', matchedArt.name);
        result.log.push(`⚡ ART DISCOVERED: ${matchedArt.name}!`);
        result.log.push(text);
        result.actions.push({ type: 'combo_art', name: matchedArt.name, icon: matchedArt.icon, actor: actor.name });

        // Calculate Art damage
        const vars = buildFormulaVars(actor, target);
        let damage = Math.max(1, Math.floor(safeEval(matchedArt.damageFormula || 'ATK*3', vars)));

        // Apply element
        if (matchedArt.element) {
            damage = await checkElementalReaction(db, battle, target, matchedArt.element, damage, result);
        }

        target.currentHp = Math.max(0, target.currentHp - damage);
        result.log.push(`${target.name} takes ${damage} damage!`);
        result.actions.push({ type: 'combo_art_damage', target: target.name, amount: damage, art: matchedArt.name });

        // Apply status
        if (matchedArt.statusApply) {
            await applyStatus(db, target, matchedArt.statusApply, 2, result);
        }

        // Track discovery
        try {
            await db.query(
                `INSERT INTO character_discovered_arts (character_id, art_id, times_used)
                 VALUES (?,?,1) ON DUPLICATE KEY UPDATE times_used=times_used+1`,
                [actor.charId, matchedArt.id]);
        } catch {}

        battle.addLog({ actor: actor.name, action: matchedArt.name, damage, target: target.name });
    } else {
        // No Art matched — each input does individual weak hits
        const hitDmg = parseFloat(settings.combo_individual_hit_damage) || 0.5;
        let totalDmg = 0;
        for (let i = 0; i < inputs.length; i++) {
            const dmg = Math.max(1, Math.floor(actor.atk * hitDmg));
            target.currentHp = Math.max(0, target.currentHp - dmg);
            totalDmg += dmg;
            const dirName = { H: 'High', L: 'Low', R: 'Right', U: 'Up' }[inputs[i]] || inputs[i];
            result.log.push(`  ${dirName} strike: ${dmg} damage!`);
            if (target.currentHp <= 0) break;
        }
        result.actions.push({ type: 'combo_hits', target: target.name, amount: totalDmg, hits: inputs.length });
        battle.addLog({ actor: actor.name, action: 'Combo', damage: totalDmg, target: target.name });
    }

    // Death check
    if (target.currentHp <= 0) {
        checkDeathOrKnockout(battle, actor, target, result);
    }

    return result;
}

// Load action command configs
async function loadActionCommands(db) {
    try {
        const [rows] = await db.query('SELECT * FROM game_action_commands WHERE active=1');
        return rows;
    } catch { return []; }
}

// Resolve an action command timing result
// timingResult: { type: 'perfect'|'good'|'miss', responseMs }
function applyActionCommandBonus(damage, timingResult, actionCommand) {
    if (!actionCommand || !timingResult) return { damage, bonus: 0, rating: 'none' };

    switch (timingResult.type) {
        case 'perfect':
            return {
                damage: Math.floor(damage * (1 + (actionCommand.perfect_bonus_pct || 0.50))),
                bonus: actionCommand.perfect_bonus_pct || 0.50,
                rating: 'perfect'
            };
        case 'good':
            return {
                damage: Math.floor(damage * (1 + (actionCommand.bonus_damage_pct || 0.25))),
                bonus: actionCommand.bonus_damage_pct || 0.25,
                rating: 'good'
            };
        default: // miss
            return { damage, bonus: 0, rating: 'miss' };
    }
}

// Resolve defense action command (reduces incoming damage)
function applyDefenseActionCommand(damage, timingResult, actionCommand) {
    if (!actionCommand || !timingResult) return damage;
    if (timingResult.type === 'perfect' || timingResult.type === 'good') {
        const reduction = actionCommand.defense_reduction || 0.25;
        return Math.floor(damage * (1 - reduction));
    }
    return damage;
}

// =================================================================
// SESSION 24A: ALIGNMENT SYSTEM
// =================================================================

// Get a character's alignment tier and stat bonuses
async function getAlignmentTier(db, alignment) {
    try {
        const [rows] = await db.query(
            'SELECT * FROM game_alignment_tiers WHERE min_value <= ? AND max_value >= ? LIMIT 1',
            [alignment, alignment]);
        if (!rows.length) return null;
        return {
            name: rows[0].name, label: rows[0].label, icon: rows[0].icon,
            statBonuses: jp(rows[0].stat_bonuses, {}),
            skillAccess: jp(rows[0].skill_access, {}),
            shopPriceMult: parseFloat(rows[0].shop_price_mult) || 1.0,
            color: rows[0].color
        };
    } catch { return null; }
}

// Apply alignment stat bonuses to a combatant
function applyAlignmentBonuses(combatant, tier, settings) {
    if (!settings?.alignment_affects_stats || !tier?.statBonuses) return;
    const statKeys = ['atk', 'def', 'mo', 'md', 'speed', 'luck'];
    for (const sk of statKeys) {
        if (tier.statBonuses[sk]) {
            combatant[sk] = Math.max(1, Math.round(combatant[sk] * (1 + tier.statBonuses[sk])));
        }
    }
    if (tier.statBonuses.def && tier.statBonuses.def < 0) {
        combatant.def = Math.max(1, Math.round(combatant.def * (1 + tier.statBonuses.def)));
    }
}

// Shift alignment from a battle action
async function shiftAlignment(db, charId, actionKey) {
    try {
        const [rows] = await db.query(
            'SELECT shift_amount FROM game_alignment_actions WHERE action_key=? AND active=1', [actionKey]);
        if (!rows.length) return;
        const shift = rows[0].shift_amount;
        await db.query(
            'UPDATE characters SET alignment = GREATEST(-100, LEAST(100, alignment + ?)) WHERE id=?',
            [shift, charId]);
    } catch {}
}

// =================================================================
// SESSION 9A: DIMINISHING RETURNS POLISH
// =================================================================
// Ki/ranged/magic skills give the defender a base dodge bonus (Mado rule:
// all ki blasts have a base +15% dodge). This is separate from the
// repeat-attack diminishing returns from Session 8.

function getKiRangedDodgeBonus(effects, settings) {
    if (!settings?.enable_diminishing_returns) return 0;
    const isRanged = effects?.range && effects.range > 1 && effects.range !== 99;
    const isMagic = effects?.damage?.type === 'magic';
    if (isRanged || isMagic) return settings.ki_ranged_dodge_bonus || 0.15;
    return 0;
}

// =================================================================
// EXPORTS
// =================================================================
module.exports = {
    // Active Defense
    resolveDefense,
    aiPickDefense,
    trackDiminishingReturns,
    // Ki Channeling
    resolveKiChannel,
    tickKiChannel,
    // Bleed Tiers
    loadBleedTiers,
    applyBleed,
    tickBleeds,
    // Final 8 RPG Mechanics
    checkBreakShield,
    tickBreakState,
    getBreakDamageBonus,
    applyStaggerPressure,
    tickStagger,
    checkOneMore,
    applyTurnDelay,
    resolvePartySwap,
    getWeaponTriangleBonus,
    rollWithAdvantage,
    hasAdvantage,
    hasDisadvantage,
    loadPassiveAbilities,
    applyPassiveAbilities,
    queueRollingDamage,
    // Combo Input + Action Commands
    loadComboArts,
    resolveComboInput,
    loadActionCommands,
    applyActionCommandBonus,
    applyDefenseActionCommand,
    // Alignment
    getAlignmentTier,
    applyAlignmentBonuses,
    shiftAlignment,
    // Diminishing Returns
    getKiRangedDodgeBonus
};
