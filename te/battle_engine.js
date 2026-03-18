// =================================================================
// BATTLE ENGINE v1.0 — Turn-Based Combat (The Arena)
// =================================================================
// ARCHITECTURE:
//   This is a SERVER-AUTHORITATIVE battle system.
//   The client sends commands ("I use Attack", "I cast Fire").
//   The server validates everything and sends back results.
//   The client just plays animations.
//
// FLOW:
//   1. Server creates a battle (via event_runner BATTLE action or PvP challenge)
//   2. Both combatants get a "battle_start" event with full state
//   3. Each turn: active player picks a command → server resolves → broadcast
//   4. Battle ends on death, flee, timeout
//
// WHAT'S DATA-DRIVEN (from MySQL):
//   - Battle commands (Attack, Defend, Skills, Items, Run)
//   - Skills (damage formulas, elements, status effects)
//   - Status effects (poison tick, stun, stat mods, turn duration)
//   - Elements (weakness/resistance system)
//   - Items (consumable effects in combat)
//   - Limit breaks (per-class ultimate abilities)
//   - Level table (XP/gold rewards)
// =================================================================

const crypto = require('crypto');
const { safeEval } = require('./event_runner');

// Optional Legendary Artifacts hook.
// If your project includes routes/artifactRoutes.js (with init(db) + onPvpKill()),
// the battle engine will call it when a PvP battle ends with a kill.
let artifactRoutes = null;
try {
    artifactRoutes = require('./routes/artifactRoutes');
} catch (e) {
    // Not installed in this build — totally fine.
    artifactRoutes = null;
}

function jp(s, f) { try { return JSON.parse(s); } catch { return f; } }

// =================================================================
// SESSION 8 — Feature Flags + Limb System Helpers
// =================================================================
// Loads all Session 8 toggles from system_settings into a flat object.
// Called once at battle creation time, cached on the BattleState.
// Arena overrides can flip individual flags after loading globals.

async function loadBattleSettings(db) {
    const defaults = {
        enable_limb_targeting: true,
        enable_active_defense: true,
        enable_nonlethal: true,
        enable_diminishing_returns: true,
        enable_wound_degradation: true,
        enable_called_shot_penalty: true,
        limb_bleed_through_default: 0.60,
        wound_threshold_light: 0.75,
        wound_threshold_heavy: 0.50,
        wound_threshold_disable: 0.00,
        dodge_base_chance: 0.15,
        dodge_speed_factor: 0.35,
        dodge_max_chance: 0.90,
        block_die_sides: 6,
        block_success_numbers: [1, 2],
        block_one_arm_reduction: 0.25,
        block_two_arm_reduction: 0.50,
        block_stun_die_sides: 12,
        counter_base_chance: 0.25,
        counter_charge_bonus: 0.25,
        counter_max_chance: 0.90,
        diminishing_returns_per_repeat: 0.05,
        diminishing_returns_max: 0.15,
        defense_prompt_timeout_ms: 10000,
        called_shot_penalty_head: 0.20,
        called_shot_penalty_arms: 0.10,
        called_shot_penalty_legs: 0.10,
        nonlethal_rep_bonus_release: 5,
        nonlethal_rep_penalty_finish: -10,
        ko_interrogate_base_chance: 0.60,
        // Session 9
        ki_ranged_dodge_bonus: 0.15,
        enable_flavor_text: true,
        flavor_text_min_length: 20,
        flavor_text_max_bonus: 0.10,
        flavor_text_base_bonus: 0.05,
        flavor_text_keyword_bonus: 0.02,
        flavor_text_keyword_max: 3,
        enable_combo_procs: true,
        combo_chain_decay: 0.50,
        combo_crit_chance: 0.03,
        // Session 10
        enable_ki_channeling: true,
        ki_channel_duration: 5,
        ki_channel_crash_pct: 0.50,
        ki_channel_uses_per_battle: 1,
        enable_bleed_tiers: true,
        // Session 13
        enable_fighting_styles: true,
        // Session 16
        enable_boss_phases: true,
        enable_custom_win_conditions: true,
        // Sessions 17-22
        enable_weather_effects: true,
        enable_stealth: true,
        stealth_surprise_bonus: 0.50,
        enable_link_attacks: true,
        enable_transformations: true,
        enable_revive: true,
        enable_traps: true,
        enable_spectator_mode: true,
        // Session 23
        enable_elemental_reactions: true,
        enable_threat_system: true,
        threat_damage_multiplier: 1.0,
        threat_heal_multiplier: 0.50,
        enable_status_combos: true,
        enable_battle_equip_swap: true,
        ai_difficulty: 'normal',
        initiative_type: 'speed',
        enable_afterlife: true,
        // Session 24
        // Combo + Action Commands
        enable_combo_input: true,
        combo_ap_regen_per_turn: 3,
        combo_individual_hit_damage: 0.5,
        enable_action_commands: true,
        enable_alignment_system: true,
        alignment_affects_stats: true,
        alignment_affects_skills: true,
        enable_battle_rules: true,
        // Session 15
        enable_summons: true,
        max_summons_per_player: 1,
        summon_cost_type: 'mp',
        summon_mp_cost_pct: 0.20,
        summon_base_duration: 3,
        enable_spell_slots: false,
        spell_slots_refresh_on: 'rest'
    };
    try {
        const keys = Object.keys(defaults);
        const placeholders = keys.map(() => '?').join(',');
        const [rows] = await db.query(
            `SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (${placeholders})`,
            keys
        );
        for (const row of rows) {
            const k = row.setting_key;
            const v = row.setting_value;
            if (defaults[k] === undefined) continue;
            if (typeof defaults[k] === 'boolean') {
                defaults[k] = v === 'true' || v === '1';
            } else if (Array.isArray(defaults[k])) {
                defaults[k] = jp(v, defaults[k]);
            } else if (typeof defaults[k] === 'number') {
                defaults[k] = parseFloat(v) || defaults[k];
            } else {
                defaults[k] = v;
            }
        }
    } catch (e) {
        console.warn('loadBattleSettings: non-fatal error, using defaults:', e.message);
    }
    return defaults;
}

// Apply per-arena overrides to battle settings
function applyArenaOverrides(settings, arena) {
    if (!arena) return settings;
    const overrideMap = {
        override_limb_targeting:       'enable_limb_targeting',
        override_active_defense:       'enable_active_defense',
        override_nonlethal:            'enable_nonlethal',
        override_diminishing_returns:  'enable_diminishing_returns',
        override_ki_channeling:        'enable_ki_channeling',
        override_summons:              'enable_summons',
        override_signature_techs:      'enable_signature_techs'
    };
    for (const [arenaCol, settingKey] of Object.entries(overrideMap)) {
        const val = arena[arenaCol];
        if (val === 'on')  settings[settingKey] = true;
        if (val === 'off') settings[settingKey] = false;
        // 'default' = keep global setting
    }
    return settings;
}

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
            icon:          r.icon || '🦴',
            hpPct:         parseFloat(r.hp_pct) || 0.20,
            calledShotPenalty: parseFloat(r.called_shot_penalty) || 0,
            bleedThrough:  parseFloat(r.bleed_through) || 0.60,
            woundEffects:  jp(r.wound_effects, null),
            disableEffects: jp(r.disable_effects, null),
            sortOrder:     r.sort_order || 0
        }));
    } catch (e) {
        // Table doesn't exist yet or other error — return humanoid defaults
        return [
            { key: 'head',      label: 'Head',      icon: '🗣️', hpPct: 0.25, calledShotPenalty: 0.20, bleedThrough: 0.70, woundEffects: null, disableEffects: { knockout: true }, sortOrder: 1 },
            { key: 'torso',     label: 'Torso',     icon: '🫁', hpPct: 0.40, calledShotPenalty: 0, bleedThrough: 1.00, woundEffects: null, disableEffects: null, sortOrder: 2 },
            { key: 'left_arm',  label: 'Left Arm',  icon: '💪', hpPct: 0.15, calledShotPenalty: 0.10, bleedThrough: 0.60, woundEffects: null, disableEffects: null, sortOrder: 3 },
            { key: 'right_arm', label: 'Right Arm', icon: '🤚', hpPct: 0.15, calledShotPenalty: 0.10, bleedThrough: 0.60, woundEffects: null, disableEffects: null, sortOrder: 4 },
            { key: 'legs',      label: 'Legs',      icon: '🦵', hpPct: 0.20, calledShotPenalty: 0.10, bleedThrough: 0.60, woundEffects: null, disableEffects: { prone: true, cant_flee: true }, sortOrder: 5 },
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
        // No limb system on this combatant — all damage goes to main HP
        return { limbDamage: 0, mainDamage: damage, limbDisabled: false, knockedOut: false, woundLevel: null };
    }

    // Default to torso if no limb specified or invalid
    const limb = targetLimb && target._limbHp[targetLimb] ? targetLimb : 'torso';
    const limbData = target._limbHp[limb];
    const zone = target._limbZones.find(z => z.key === limb);

    if (!limbData || !zone) {
        return { limbDamage: 0, mainDamage: damage, limbDisabled: false, knockedOut: false, woundLevel: null };
    }

    // Apply damage to limb HP
    const limbBefore = limbData.current;
    limbData.current = Math.max(0, limbData.current - damage);
    const actualLimbDmg = limbBefore - limbData.current;

    // Bleed-through: fraction of limb damage also hits main HP
    const bleedThrough = zone.bleedThrough !== undefined ? zone.bleedThrough : (settings?.limb_bleed_through_default ?? 0.60);
    const mainDamage = Math.max(1, Math.round(actualLimbDmg * bleedThrough));

    // Check if limb just became disabled
    const newWound = getWoundLevel(limbData.current, limbData.max, settings);
    const wasDisabled = limbBefore <= 0;
    const limbDisabled = !wasDisabled && limbData.current <= 0;

    // Head disabled = knockout (from disable_effects.knockout)
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
function applyBleed(combatant, tierName, bleedTiers, result) {
    const tier = bleedTiers[tierName];
    if (!tier) return;

    if (!combatant._bleeds) combatant._bleeds = [];

    // Check if same tier already active — refresh duration
    const existing = combatant._bleeds.find(b => b.tier === tierName);
    if (existing) {
        existing.turnsLeft = tier.duration;
        result.log.push(`${tier.icon} ${combatant.name}'s ${tier.label} is refreshed! (${tier.duration} turns)`);
    } else {
        combatant._bleeds.push({
            tier: tierName,
            turnsLeft: tier.duration,
            damagePct: tier.damagePct,
            icon: tier.icon,
            label: tier.label
        });
        result.log.push(`${tier.icon} ${combatant.name} is afflicted with ${tier.label}! (${tier.duration} turns)`);
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
// SESSION 11: SIGNATURE TECHNIQUES — Discovery via Flavor Text
// =================================================================

// Extract meaningful combat keywords from flavor text
function extractKeywords(text) {
    if (!text || typeof text !== 'string') return [];
    const lower = text.toLowerCase();
    // Combat-relevant word categories
    const combatWords = new Set([
        // Elements
        'fire','flame','burn','blaze','inferno','ice','frost','freeze','cold','lightning','thunder','shock','bolt',
        'earth','stone','rock','quake','dark','shadow','void','light','holy','radiant',
        // Actions
        'slash','cut','strike','punch','kick','smash','crush','pierce','stab','thrust','sweep','spin',
        'charge','leap','dash','lunge','slam','uppercut','overhead','backstab','flank',
        // Body/targeting
        'head','skull','leg','arm','chest','torso','neck','throat','eye','knee','spine',
        // Style
        'rapid','swift','heavy','brutal','graceful','precise','reckless','savage','fury','rage',
        'feint','parry','counter','riposte','dodge','weave',
        // Environment
        'wall','ground','air','sky','above','below','behind','tree','water','cliff'
    ]);
    const words = lower.split(/[\s,.\-!?;:'"+]+/).filter(w => w.length > 2);
    return [...new Set(words.filter(w => combatWords.has(w)))];
}

// Save flavor text to history and check for technique discovery
async function trackFlavorText(db, charId, flavorText, battleId, skillId, damage, settings) {
    if (!settings?.enable_signature_techs) return null;
    if (!flavorText || flavorText.length < (settings.sig_tech_min_flavor_length || 15)) return null;

    const keywords = extractKeywords(flavorText);
    if (keywords.length === 0) return null;

    // Save to history
    try {
        await db.query(
            `INSERT INTO character_flavor_history (character_id, flavor_text, keywords_json, category, battle_id, skill_id, damage_dealt)
             VALUES (?, ?, ?, 'attack', ?, ?, ?)`,
            [charId, flavorText.substring(0, 500), JSON.stringify(keywords), battleId, skillId, damage || 0]
        );
    } catch {} // non-fatal if table doesn't exist

    // Check for technique discovery
    return await checkTechDiscovery(db, charId, settings);
}

// Analyze flavor history for emerging technique patterns
async function checkTechDiscovery(db, charId, settings) {
    const threshold = settings?.sig_tech_discovery_threshold || 10;
    const maxTechs = settings?.sig_tech_max_per_character || 3;

    // Session 12: Check if player has unlocked sig tech creation
    // (either from master training or as a rare natural talent)
    if (settings?.sig_tech_require_unlock !== false) {
        try {
            const [charRow] = await db.query('SELECT can_create_sig_tech FROM characters WHERE id=?', [charId]);
            if (charRow.length && !charRow[0].can_create_sig_tech) {
                // Not unlocked — check for natural talent (very rare)
                const naturalChance = settings?.sig_tech_natural_talent_chance || 0.05;
                if (Math.random() >= naturalChance) return null;
                // Natural talent triggered! Auto-unlock
                await db.query('UPDATE characters SET can_create_sig_tech=1 WHERE id=?', [charId]);
            }
        } catch {}
    }

    // Check if player already has max techs
    try {
        const [countRow] = await db.query(
            'SELECT COUNT(*) as cnt FROM character_signature_techs WHERE character_id=?', [charId]);
        if (countRow[0].cnt >= maxTechs) return null;
    } catch { return null; }

    // Get recent flavor history (last 50 entries)
    let history;
    try {
        const [rows] = await db.query(
            `SELECT keywords_json FROM character_flavor_history
             WHERE character_id=? ORDER BY used_at DESC LIMIT 50`, [charId]);
        history = rows;
    } catch { return null; }

    if (history.length < threshold) return null;

    // Count keyword frequency across all entries
    const kwCounts = {};
    for (const row of history) {
        const kws = jp(row.keywords_json, []);
        for (const kw of kws) {
            kwCounts[kw] = (kwCounts[kw] || 0) + 1;
        }
    }

    // Find dominant keyword clusters (keywords that appear >= threshold times)
    const dominant = Object.entries(kwCounts)
        .filter(([_, count]) => count >= threshold)
        .sort((a, b) => b[1] - a[1]);

    if (dominant.length === 0) return null;

    // Check if we already have a tech with these keywords
    try {
        const [existing] = await db.query(
            'SELECT origin_keywords FROM character_signature_techs WHERE character_id=?', [charId]);
        for (const row of existing) {
            const existingKws = jp(row.origin_keywords, []);
            const overlap = dominant.filter(([kw]) => existingKws.includes(kw));
            if (overlap.length >= dominant.length * 0.6) return null; // too similar to existing tech
        }
    } catch {}

    // Determine element and type from dominant keywords
    const elementMap = {
        fire: ['fire','flame','burn','blaze','inferno'],
        ice: ['ice','frost','freeze','cold'],
        lightning: ['lightning','thunder','shock','bolt'],
        earth: ['earth','stone','rock','quake'],
        dark: ['dark','shadow','void'],
        light: ['light','holy','radiant']
    };
    let suggestedElement = null;
    for (const [elem, words] of Object.entries(elementMap)) {
        if (dominant.some(([kw]) => words.includes(kw))) {
            suggestedElement = elem;
            break;
        }
    }

    const physicalWords = ['slash','cut','punch','kick','smash','crush','uppercut','backstab'];
    const isPhysical = dominant.some(([kw]) => physicalWords.includes(kw));
    const suggestedType = isPhysical ? 'physical' : 'ki_attack';

    // Build suggested name from top 2 keywords
    const topWords = dominant.slice(0, 2).map(([kw]) => kw.charAt(0).toUpperCase() + kw.slice(1));
    const suggestedName = topWords.join(' ') + (suggestedType === 'ki_attack' ? ' Blast' : ' Strike');

    return {
        discovered: true,
        suggestedName,
        suggestedType,
        suggestedElement,
        dominantKeywords: dominant.map(([kw, count]) => ({ keyword: kw, count })),
        originKeywords: dominant.map(([kw]) => kw)
    };
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
// SESSION 24B: NO-CODE BATTLE RULE EVALUATOR
// =================================================================

// Load applicable rules for a battle
async function loadBattleRules(db, battle) {
    try {
        let query = `SELECT * FROM game_battle_rules WHERE enabled=1 AND (scope='global'`;
        const params = [];
        if (battle.mapId) { query += ` OR (scope='map' AND scope_id=?)`; params.push(battle.mapId); }
        query += `) ORDER BY priority DESC`;
        const [rows] = await db.query(query, params);
        return rows.map(r => ({
            ...r,
            condition: jp(r.condition_json, {}),
            effect: jp(r.effect_json, {}),
            _triggerCount: 0,
            _lastTriggeredTurn: 0
        }));
    } catch { return []; }
}

// Evaluate a single rule condition against battle state
function evaluateRuleCondition(condition, battle, combatant) {
    if (!condition || !Object.keys(condition).length) return true; // empty = always true

    const c = combatant;

    // Stat comparisons
    if (condition.stat) {
        let val = 0;
        switch (condition.stat) {
            case 'hp_pct': val = c ? (c.currentHp / c.maxHp) : 0; break;
            case 'mp_pct': val = c ? (c.currentMp / c.maxMp) : 0; break;
            case 'turn_number': val = battle.turnNumber; break;
            case 'alignment': val = c?.alignment || 0; break;
            case 'level': val = c?.level || 1; break;
            default: val = c?.[condition.stat] || 0;
        }
        const target = parseFloat(condition.value) || 0;
        switch (condition.operator) {
            case '<':  return val < target;
            case '<=': return val <= target;
            case '>':  return val > target;
            case '>=': return val >= target;
            case '==': return val === target;
            case '!=': return val !== target;
            default: return false;
        }
    }

    // Status check
    if (condition.has_status) {
        return c?.statuses?.some(s => s.name === condition.has_status) || false;
    }

    // Element aura
    if (condition.element_aura) {
        return c?._elementAuras?.includes(condition.element_aura) || false;
    }

    // Combatant count
    if (condition.combatant_count) {
        const team = condition.combatant_count === 'allies'
            ? (c ? battle.getAllyTeam(c.charId) : [])
            : battle.getEnemyTeam(c?.charId || battle.turnCharId);
        const count = team.length + (condition.combatant_count === 'allies' ? 1 : 0); // include self for allies
        const target = parseInt(condition.value) || 1;
        switch (condition.operator) {
            case '<':  return count < target;
            case '<=': return count <= target;
            case '>':  return count > target;
            case '>=': return count >= target;
            default: return false;
        }
    }

    // Target type check
    if (condition.target_is) {
        const myTeam = Object.keys(battle.teams)[0];
        if (condition.target_is === 'enemy') return c?.teamId !== myTeam;
        if (condition.target_is === 'ally') return c?.teamId === myTeam;
    }

    return false;
}

// Apply a rule's effect to a combatant
async function applyRuleEffect(db, battle, effect, combatant, result) {
    if (!effect || !combatant) return;

    // Apply status
    if (effect.apply_status) {
        await applyStatus(db, combatant, effect.apply_status, effect.duration || 2, result);
    }

    // Stat modifier
    if (effect.stat_mod) {
        for (const [stat, mult] of Object.entries(effect.stat_mod)) {
            if (combatant[stat] !== undefined) {
                combatant[stat] = Math.max(1, Math.round(combatant[stat] * (1 + mult)));
            }
        }
    }

    // Direct damage
    if (effect.damage) {
        const vars = { MAXHP: combatant.maxHp, ATK: combatant.atk, MO: combatant.mo, LVL: combatant.level };
        const dmg = Math.max(1, Math.floor(safeEval(effect.damage.formula || '10', vars)));
        combatant.currentHp = Math.max(0, combatant.currentHp - dmg);
        result.log.push(`${combatant.name} takes ${dmg} rule damage!`);
    }

    // Heal
    if (effect.heal) {
        const vars = { MAXHP: combatant.maxHp, MO: combatant.mo };
        const heal = Math.floor(safeEval(effect.heal.formula || 'MAXHP*0.10', vars));
        combatant.currentHp = Math.min(combatant.maxHp, combatant.currentHp + heal);
        result.log.push(`${combatant.name} heals ${heal} HP!`);
    }

    // Terrain change
    if (effect.terrain_change && combatant.gridX !== undefined) {
        const radius = effect.terrain_change.radius || 0;
        const terrain = effect.terrain_change.type || 'fire';
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const tx = combatant.gridX + dx, ty = combatant.gridY + dy;
                if (tx >= 0 && tx < battle.GRID_W && ty >= 0 && ty < battle.GRID_H) {
                    battle.terrainMap[`${tx},${ty}`] = terrain;
                }
            }
        }
    }

    // Announcement
    if (effect.announce) {
        const text = (effect.announce || '').replace('{name}', combatant.name);
        result.log.push(`📜 ${text}`);
        result.actions.push({ type: 'rule_announce', text });
        battle.addLog({ actor: 'system', text });
    }

    // End battle
    if (effect.end_battle) {
        battle.status = 'FINISHED';
        if (effect.end_battle.winner === 'enemies') {
            battle.winner = null;
        }
        result.log.push(effect.end_battle.text || 'The battle ends!');
    }

    // Alignment shift
    if (effect.alignment_shift && combatant.charId) {
        try {
            await db.query(
                'UPDATE characters SET alignment = GREATEST(-100, LEAST(100, alignment + ?)) WHERE id=?',
                [effect.alignment_shift, combatant.charId]);
        } catch {}
    }
}

// Main rule evaluation — called at trigger points
async function evaluateBattleRules(db, battle, triggerEvent, triggerCombatant, result) {
    if (!battle._settings?.enable_battle_rules || !battle._battleRules) return;

    for (const rule of battle._battleRules) {
        if (rule.trigger_event !== triggerEvent) continue;
        if (!rule.enabled) continue;

        // Check max triggers
        if (rule.max_triggers > 0 && rule._triggerCount >= rule.max_triggers) continue;

        // Check cooldown
        if (rule.cooldown_turns > 0 && battle.turnNumber - rule._lastTriggeredTurn < rule.cooldown_turns) continue;

        // Determine targets based on filter
        let targets = [];
        switch (rule.target_filter) {
            case 'all': targets = Object.values(battle.combatants).filter(c => c.currentHp > 0); break;
            case 'all_players': targets = Object.values(battle.combatants).filter(c => c.currentHp > 0 && !c.isAI); break;
            case 'all_enemies': targets = Object.values(battle.combatants).filter(c => c.currentHp > 0 && c.isAI); break;
            case 'active_combatant': targets = triggerCombatant ? [triggerCombatant] : []; break;
            case 'target_combatant': targets = triggerCombatant ? [triggerCombatant] : []; break;
            case 'boss': targets = Object.values(battle.combatants).filter(c => c._isBoss && c.currentHp > 0); break;
            default: targets = triggerCombatant ? [triggerCombatant] : [];
        }

        // Evaluate condition for each target
        for (const target of targets) {
            if (!evaluateRuleCondition(rule.condition, battle, target)) continue;

            // RULE TRIGGERED!
            rule._triggerCount++;
            rule._lastTriggeredTurn = battle.turnNumber;
            await applyRuleEffect(db, battle, rule.effect, target, result);
            break; // one target per rule per evaluation
        }
    }
}

// =================================================================
// SESSION 23: ELEMENTAL REACTIONS, AGGRO, STATUS COMBOS,
//             AI DIFFICULTY, INITIATIVE, EQUIPMENT SWAP, AFTERLIFE
// =================================================================

// 23A: Elemental Reactions — check if applying an element triggers a reaction
async function checkElementalReaction(db, battle, target, newElement, damage, result) {
    if (!battle._settings?.enable_elemental_reactions || !newElement) return damage;
    if (!target._elementAuras) target._elementAuras = [];

    // Check for reaction with existing auras
    for (const aura of target._elementAuras) {
        const reaction = battle._elementReactions?.find(r =>
            (r.element_a === aura && r.element_b === newElement) ||
            (r.element_a === newElement && r.element_b === aura)
        );
        if (!reaction) continue;

        // REACTION TRIGGERED!
        const bonusDmg = Math.max(1, Math.floor(damage * (parseFloat(reaction.damage_bonus) || 0.30)));
        result.log.push(`\n💥 ${reaction.reaction_name}! ${reaction.battle_text || ''}`);
        result.actions.push({ type: 'elemental_reaction', name: reaction.reaction_name, icon: reaction.icon, bonus: bonusDmg });

        // AoE splash from reaction
        if (reaction.aoe_radius > 0 && target.gridX !== undefined) {
            const nearby = Object.values(battle.combatants).filter(c =>
                c.charId !== target.charId && c.currentHp > 0 && !c._knockedOut &&
                c.teamId === target.teamId &&
                BattleState.chebyshev(c, target) <= reaction.aoe_radius
            );
            for (const n of nearby) {
                const splashDmg = Math.floor(bonusDmg * 0.5);
                n.currentHp = Math.max(0, n.currentHp - splashDmg);
                result.log.push(`  → ${n.name} caught in the reaction! (${splashDmg} splash)`);
            }
        }

        // Apply reaction status
        if (reaction.apply_status) {
            await applyStatus(db, target, reaction.apply_status, 2, result);
        }

        // Clear element auras after reaction
        if (reaction.remove_elements) {
            target._elementAuras = [];
        }

        damage += bonusDmg;
        break; // one reaction per hit
    }

    // Apply the new element as an aura (for future reactions)
    if (!target._elementAuras.includes(newElement)) {
        target._elementAuras.push(newElement);
        // Max 2 auras at a time
        if (target._elementAuras.length > 2) target._elementAuras.shift();
    }

    return damage;
}

// 23B: Threat/Aggro — track threat generated by actions
function addThreat(battle, actorCharId, targetCharId, amount, type) {
    if (!battle._settings?.enable_threat_system) return;
    if (!battle._threatTable) battle._threatTable = {};
    const key = `${targetCharId}`;
    if (!battle._threatTable[key]) battle._threatTable[key] = {};
    const mult = type === 'heal'
        ? (battle._settings.threat_heal_multiplier || 0.50)
        : (battle._settings.threat_damage_multiplier || 1.0);
    battle._threatTable[key][actorCharId] = (battle._threatTable[key][actorCharId] || 0) + Math.floor(amount * mult);
}

// AI uses threat table to pick target
function getHighestThreatTarget(battle, aiCharId) {
    if (!battle._settings?.enable_threat_system || !battle._threatTable) return null;
    const threatForMe = battle._threatTable[aiCharId];
    if (!threatForMe) return null;
    let highest = null, highestVal = 0;
    for (const [charId, threat] of Object.entries(threatForMe)) {
        const c = battle.combatants[charId];
        if (!c || c.currentHp <= 0 || c._knockedOut || c.teamId === battle.getTeamId(aiCharId)) continue;
        if (threat > highestVal) { highest = parseInt(charId); highestVal = threat; }
    }
    return highest ? battle.combatants[highest] : null;
}

// 23C: Status Combos — check if applying a status triggers a combo
async function checkStatusCombo(db, battle, target, newStatusName, result) {
    if (!battle._settings?.enable_status_combos || !battle._statusCombos) return;
    const existing = (target.statuses || []).map(s => s.name);
    for (const combo of battle._statusCombos) {
        const hasA = existing.includes(combo.status_a) && combo.status_b.toLowerCase() === newStatusName.toLowerCase();
        const hasB = existing.includes(combo.status_b) && combo.status_a.toLowerCase() === newStatusName.toLowerCase();
        if (!hasA && !hasB) continue;

        result.log.push(`💥 Status Combo: ${combo.combo_name}! ${combo.description || ''}`);
        result.actions.push({ type: 'status_combo', name: combo.combo_name, icon: combo.icon });

        switch (combo.effect_type) {
            case 'bonus_damage':
                // Next hit on this target gets bonus damage
                target._statusComboBonus = (target._statusComboBonus || 0) + (combo.effect_value || 0.50);
                break;
            case 'guaranteed_crit':
                target._guaranteedCrit = true;
                break;
            case 'remove_both':
                target.statuses = target.statuses.filter(s => s.name !== combo.status_a && s.name !== combo.status_b);
                break;
            case 'apply_new':
                if (combo.apply_status) await applyStatus(db, target, combo.apply_status, 2, result);
                break;
            case 'heal_block':
                target._healBlocked = 2; // turns
                break;
        }
        break; // one combo per status application
    }
}

// 23D: AI Difficulty modifier
function getAiDifficultyMult(settings) {
    const diff = settings?.ai_difficulty || 'normal';
    if (diff === 'easy') return parseFloat(settings.ai_difficulty_easy_mult) || 0.80;
    if (diff === 'hard') return parseFloat(settings.ai_difficulty_hard_mult) || 1.20;
    return 1.0;
}

// 23E: Initiative variants — rebuild turn queue based on type
function rebuildInitiative(battle) {
    const type = battle._settings?.initiative_type || 'speed';
    const all = Object.values(battle.combatants).filter(c => c.currentHp > 0 && !c._knockedOut);

    switch (type) {
        case 'roll': {
            // D&D style: d20 + speed/10, re-rolled each round
            const diceSides = battle._settings?.initiative_roll_dice || 20;
            const sorted = all.map(c => ({
                charId: c.charId,
                roll: Math.floor(Math.random() * diceSides) + 1 + Math.floor((c.speed || 0) / 10)
            })).sort((a, b) => b.roll - a.roll);
            battle.turnQueue = sorted.map(s => s.charId);
            break;
        }
        case 'phased': {
            // Side turns: all of team 1, then all of team 2, etc.
            const teamOrder = Object.keys(battle.teams);
            const queue = [];
            for (const teamId of teamOrder) {
                const members = (battle.teams[teamId] || [])
                    .map(id => battle.combatants[id])
                    .filter(c => c && c.currentHp > 0 && !c._knockedOut)
                    .sort((a, b) => b.speed - a.speed);
                queue.push(...members.map(c => c.charId));
            }
            battle.turnQueue = queue;
            break;
        }
        default: // 'speed' — already handled by existing _rebuildTurnQueue
            break;
    }
}

// 23F: Handle death → afterlife
async function handleDeath(db, io, charId) {
    try {
        const [charRow] = await db.query('SELECT * FROM characters WHERE id=?', [charId]);
        if (!charRow.length) return;
        const char = charRow[0];
        const deathCount = (char.death_count || 0) + 1;
        const alignment = char.alignment || 0;

        // Find appropriate afterlife world based on alignment
        const [worlds] = await db.query(
            `SELECT * FROM game_afterlife_worlds WHERE active=1
             AND (alignment_min IS NULL OR alignment_min <= ?)
             AND (alignment_max IS NULL OR alignment_max >= ?)
             ORDER BY type ASC LIMIT 1`, [alignment, alignment]);

        let afterlifeId = null, stayDays = 7, worldName = 'The Between';
        if (worlds.length) {
            afterlifeId = worlds[0].id;
            stayDays = worlds[0].stay_duration_days;
            worldName = worlds[0].label;
        }

        const returnAt = new Date(Date.now() + stayDays * 24 * 60 * 60 * 1000);

        // Apply death penalty
        const [penaltyRow] = await db.query(
            'SELECT base_stat_loss_pct FROM game_death_penalties WHERE death_count<=? ORDER BY death_count DESC LIMIT 1',
            [deathCount]);
        const penaltyPct = penaltyRow.length ? parseFloat(penaltyRow[0].base_stat_loss_pct) : 0.05;

        // Reduce base stats permanently
        await db.query(
            `UPDATE characters SET
                death_count=?,
                current_afterlife_id=?,
                afterlife_return_at=?,
                max_hp = GREATEST(10, FLOOR(max_hp * ?)),
                atk = GREATEST(1, FLOOR(atk * ?)),
                def = GREATEST(1, FLOOR(def * ?)),
                mo = GREATEST(1, FLOOR(mo * ?)),
                md = GREATEST(1, FLOOR(md * ?)),
                speed = GREATEST(1, FLOOR(speed * ?))
             WHERE id=?`,
            [deathCount, afterlifeId, returnAt,
             1 - penaltyPct, 1 - penaltyPct, 1 - penaltyPct,
             1 - penaltyPct, 1 - penaltyPct, 1 - penaltyPct,
             charId]);

        // Teleport to afterlife map if one exists
        if (worlds.length && worlds[0].map_id) {
            await db.query('UPDATE characters SET map_id=?, x=5, y=5 WHERE id=?', [worlds[0].map_id, charId]);
        }

        return {
            deathCount, afterlifeId, worldName, stayDays,
            returnAt: returnAt.toISOString(),
            penaltyPct: Math.round(penaltyPct * 100)
        };
    } catch (e) {
        console.error('[Afterlife] Error:', e.message);
        return null;
    }
}

// =================================================================
// SESSIONS 17-22: WEATHER, STEALTH, LINK ATTACKS, TRANSFORMS,
//                 REVIVE, TRAPS, SPECTATOR
// =================================================================

// SESSION 17: Apply weather effects to damage/accuracy
function applyWeatherEffects(battle, damage, element, isRanged, actor) {
    if (!battle._weather || !battle._settings?.enable_weather_effects) return damage;
    const fx = battle._weather.combatEffects || {};
    let mult = 1.0;
    // Element damage modifiers
    if (element && fx[`${element}_damage`]) mult += fx[`${element}_damage`];
    // Ranged accuracy (applied as damage reduction for simplicity)
    if (isRanged && fx.ranged_accuracy) mult += fx.ranged_accuracy;
    // General accuracy
    if (fx.accuracy) mult += fx.accuracy;
    return Math.max(1, Math.floor(damage * Math.max(0.1, mult)));
}

// Load weather for a map at battle start
async function loadWeather(db, mapId) {
    try {
        // Check region weather override first, then map default
        if (global.getRegionForMap) {
            const region = await global.getRegionForMap(mapId);
            if (region?.weather_override && region.weather_override !== 'CLEAR') {
                const [rows] = await db.query('SELECT * FROM game_weather_effects WHERE name=? LIMIT 1',
                    [region.weather_override.toLowerCase()]);
                if (rows.length) return {
                    name: rows[0].name, label: rows[0].label, icon: rows[0].icon,
                    combatEffects: jp(rows[0].combat_effects, {}), visibility: rows[0].visibility
                };
            }
        }
    } catch {}
    return null; // clear weather
}

// SESSION 18: Stealth system
function resolveStealth(battle, actor, result) {
    if (!battle._settings?.enable_stealth) {
        result.log.push('Stealth is not available.');
        return result;
    }
    if (actor._isStealthed) {
        result.log.push(`${actor.name} is already hidden!`);
        return result;
    }
    // Stealth check: speed+luck vs enemy perception
    const enemies = battle.getEnemyTeam(actor.charId);
    const bestPerception = enemies.reduce((max, e) => Math.max(max, (e.speed || 0) + (e.luck || 0) * 0.5), 0);
    const stealthRoll = (actor.speed || 0) + (actor.luck || 0) * 0.5 + (actor.stealth_level || 0) * 2;
    if (stealthRoll > bestPerception || Math.random() < 0.3) {
        actor._isStealthed = true;
        result.log.push(`🥷 ${actor.name} vanishes into the shadows!`);
        result.actions.push({ type: 'stealth', actor: actor.name, success: true });
    } else {
        result.log.push(`${actor.name} tries to hide but is spotted!`);
        result.actions.push({ type: 'stealth', actor: actor.name, success: false });
    }
    battle.addLog({ actor: actor.name, action: 'Stealth', text: `${actor.name} attempts to hide` });
    return result;
}

// Apply stealth bonus to damage (called in resolveDamage/resolveSkill)
function getStealthBonus(actor, settings) {
    if (!actor._isStealthed) return 0;
    actor._isStealthed = false; // breaks stealth on attack
    return settings?.stealth_surprise_bonus || 0.50;
}

// SESSION 19: Check for link attack opportunity
async function checkLinkAttack(db, battle, actor, target, skillId) {
    if (!battle._settings?.enable_link_attacks) return null;
    try {
        const [links] = await db.query(
            `SELECT * FROM game_link_attacks WHERE active=1
             AND (initiator_class_id IS NULL OR initiator_class_id=?)
             AND (initiator_skill_id IS NULL OR initiator_skill_id=?)`,
            [actor.classId, skillId]);
        if (!links.length) return null;

        // Check if an eligible partner is adjacent and alive
        const allies = battle.getAllyTeam(actor.charId);
        for (const link of links) {
            const partner = allies.find(a => {
                if (link.partner_class_id && a.classId !== link.partner_class_id) return false;
                if (actor.gridX === undefined || a.gridX === undefined) return true;
                return BattleState.chebyshev(actor, a) <= 2; // within 2 tiles
            });
            if (!partner) continue;

            // Check affinity
            const affinity = jp(actor.affinity_json, {})?.[partner.charId] || 0;
            if (affinity < (link.min_affinity || 0)) continue;

            // Check cooldown
            if (actor._linkCooldown?.[link.id] > 0) continue;

            return { link, partner };
        }
    } catch {}
    return null;
}

// SESSION 20: Resolve transformation
async function resolveTransform(db, battle, actor, result) {
    if (!battle._settings?.enable_transformations) {
        result.log.push('Transformations are not available.');
        return result;
    }
    if (actor._transformed) {
        result.log.push(`${actor.name} is already transformed!`);
        return result;
    }

    // Find available transformation for this character
    let transform = null;
    try {
        const [rows] = await db.query(
            `SELECT * FROM game_transformations WHERE active=1
             AND (class_id IS NULL OR class_id=?) AND (race_id IS NULL OR race_id=?)
             AND level_required <= ? AND trigger_type='manual'
             ORDER BY level_required DESC LIMIT 1`,
            [actor.classId, actor.raceId, actor.level]);
        if (rows.length) transform = rows[0];
    } catch {}

    if (!transform) {
        result.log.push(`${actor.name} has no transformation available!`);
        return result;
    }

    // Cost
    if (transform.mp_cost > 0 && actor.currentMp < transform.mp_cost) {
        result.log.push(`Not enough MP! Need ${transform.mp_cost}.`);
        return result;
    }
    if (transform.mp_cost > 0) actor.currentMp -= transform.mp_cost;
    if (transform.hp_cost_pct > 0) {
        actor.currentHp = Math.max(1, actor.currentHp - Math.floor(actor.maxHp * transform.hp_cost_pct));
    }

    // Save base stats for reverting
    if (!actor._transformBaseStats) {
        actor._transformBaseStats = {
            atk: actor.atk, def: actor.def, mo: actor.mo, md: actor.md,
            speed: actor.speed, luck: actor.luck, maxHp: actor.maxHp
        };
    }

    // Apply stat multipliers
    const mults = jp(transform.stat_multipliers, {});
    for (const [stat, mult] of Object.entries(mults)) {
        if (actor._transformBaseStats[stat] !== undefined) {
            actor[stat] = Math.round(actor._transformBaseStats[stat] * mult);
        }
    }

    actor._transformed = {
        id: transform.id,
        name: transform.name,
        icon: transform.icon,
        turnsLeft: transform.duration || 5,
        visual: jp(transform.visual_effects, null)
    };

    const text = (transform.battle_text || '{name} transforms!').replace('{name}', actor.name);
    result.log.push(`⭐ ${text}`);
    result.actions.push({
        type: 'transform', actor: actor.name, name: transform.name,
        icon: transform.icon, visual: actor._transformed.visual
    });
    battle.addLog({ actor: actor.name, action: 'Transform', text });
    return result;
}

// Tick transform duration
function tickTransform(combatant, tickResult) {
    if (!combatant._transformed) return;
    combatant._transformed.turnsLeft--;
    if (combatant._transformed.turnsLeft <= 0) {
        // Revert stats
        if (combatant._transformBaseStats) {
            for (const [stat, val] of Object.entries(combatant._transformBaseStats)) {
                combatant[stat] = val;
            }
        }
        tickResult.log.push(`⭐ ${combatant.name}'s ${combatant._transformed.name} fades!`);
        tickResult.actions.push({ type: 'transform_end', target: combatant.name });
        combatant._transformed = null;
        combatant._transformBaseStats = null;
    }
}

// SESSION 21: Resolve revive skill
function resolveRevive(battle, actor, target, reviveHpPct, result) {
    if (!battle._settings?.enable_revive) return;
    if (!target || (target.currentHp > 0 && !target._knockedOut)) {
        result.log.push(`${target?.name || 'Target'} doesn't need reviving!`);
        return;
    }
    const reviveHp = Math.max(1, Math.floor(target.maxHp * (reviveHpPct || 0.25)));
    target.currentHp = reviveHp;
    target._knockedOut = false;
    result.log.push(`✨ ${target.name} is revived with ${reviveHp} HP!`);
    result.actions.push({ type: 'revive', target: target.name, hp: reviveHp });
    battle.addLog({ actor: actor.name, text: `${actor.name} revives ${target.name}!` });
}

// SESSION 21: Check traps on movement
async function checkTraps(db, battle, charId, x, y, result) {
    if (!battle._settings?.enable_traps || !battle._traps) return;
    const key = `${x},${y}`;
    const trap = battle._traps[key];
    if (!trap || trap.triggered) return;
    if (trap.ownerId === charId) return; // don't trigger own traps

    const mover = battle.combatants[charId];
    if (!mover) return;

    trap.uses--;
    if (trap.uses <= 0) trap.triggered = true;

    // Damage
    if (trap.damageFormula) {
        const vars = { ATK: trap.ownerAtk || 10, MO: trap.ownerMo || 10 };
        const dmg = Math.max(1, Math.floor(safeEval(trap.damageFormula, vars)));
        mover.currentHp = Math.max(0, mover.currentHp - dmg);
        result.log.push(`⚠️ ${mover.name} triggers a ${trap.name}! (${dmg} damage)`);
        result.actions.push({ type: 'trap_trigger', target: mover.name, trapName: trap.name, damage: dmg });
    }

    // Status
    if (trap.statusApply) {
        await applyStatus(db, mover, trap.statusApply, 2, result);
    }

    battle.addLog({ actor: 'trap', text: `${mover.name} triggers ${trap.name}!` });
}

// =================================================================
// SESSION 16: BOSS PHASES + CUSTOM WIN CONDITIONS
// =================================================================

// Load boss phases for an NPC from DB
async function loadBossPhases(db, npcId) {
    try {
        const [rows] = await db.query(
            'SELECT * FROM game_boss_phases WHERE npc_id=? ORDER BY phase_number', [npcId]);
        return rows.map(r => ({
            phase: r.phase_number,
            triggerType: r.trigger_type,
            triggerValue: parseFloat(r.trigger_value),
            name: r.name,
            battleText: r.battle_text,
            icon: r.icon || '⚡',
            statChanges: jp(r.stat_changes, {}),
            newSkillIds: jp(r.new_skill_ids, []),
            removeSkillIds: jp(r.remove_skill_ids, []),
            healPct: parseFloat(r.heal_pct) || 0,
            summonNpcIds: jp(r.summon_npc_ids, []),
            elementShift: r.element_shift,
            terrainChange: jp(r.terrain_change, null)
        }));
    } catch { return []; }
}

// Check and trigger boss phase transitions after damage
async function checkBossPhase(db, battle, npc, result) {
    if (!battle._settings?.enable_boss_phases) return;
    if (!npc._bossPhases || !npc._bossPhases.length) return;
    if (npc.currentHp <= 0) return;

    const currentPhase = npc._currentPhase || 0;
    const hpPct = npc.currentHp / npc.maxHp;

    for (const phase of npc._bossPhases) {
        if (phase.phase <= currentPhase) continue; // already passed this phase

        let triggered = false;
        if (phase.triggerType === 'hp_pct' && hpPct <= phase.triggerValue) triggered = true;
        if (phase.triggerType === 'turn' && battle.turnNumber >= phase.triggerValue) triggered = true;

        if (!triggered) continue;

        // PHASE TRANSITION!
        npc._currentPhase = phase.phase;

        // Announce
        const announcement = phase.battleText || `⚡ ${npc.name} enters Phase ${phase.phase}: ${phase.name || 'New Form'}!`;
        result.log.push(`\n🔥 ${announcement}`);
        result.actions.push({
            type: 'boss_phase', target: npc.name,
            phase: phase.phase, name: phase.name, icon: phase.icon
        });
        battle.addLog({ actor: 'system', text: announcement });

        // Apply stat changes (multiplicative from base)
        if (!npc._phaseBaseStats) {
            npc._phaseBaseStats = { atk: npc.atk, def: npc.def, mo: npc.mo, md: npc.md, speed: npc.speed };
        }
        const base = npc._phaseBaseStats;
        for (const [stat, mult] of Object.entries(phase.statChanges)) {
            if (base[stat] !== undefined) {
                npc[stat] = Math.round(base[stat] * (1 + mult));
            }
        }
        if (phase.statChanges.atk) result.log.push(`💪 ${npc.name}'s ATK increases!`);
        if (phase.statChanges.speed) result.log.push(`💨 ${npc.name} becomes faster!`);

        // Heal on transition
        if (phase.healPct > 0) {
            const healAmt = Math.floor(npc.maxHp * phase.healPct);
            npc.currentHp = Math.min(npc.maxHp, npc.currentHp + healAmt);
            result.log.push(`💚 ${npc.name} recovers ${healAmt} HP!`);
        }

        // Element shift
        if (phase.elementShift) {
            npc.weaponElements = [phase.elementShift];
            result.log.push(`🌀 ${npc.name}'s attacks become ${phase.elementShift}!`);
        }

        // Terrain change around boss
        if (phase.terrainChange && npc.gridX !== undefined && battle.terrainMap) {
            const radius = phase.terrainChange.radius || 1;
            const terrain = phase.terrainChange.type || 'fire';
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    const tx = npc.gridX + dx, ty = npc.gridY + dy;
                    if (tx >= 0 && tx < battle.GRID_W && ty >= 0 && ty < battle.GRID_H) {
                        battle.terrainMap[`${tx},${ty}`] = terrain;
                    }
                }
            }
            result.log.push(`🌋 The ground around ${npc.name} transforms to ${terrain}!`);
        }

        // Summon adds
        if (phase.summonNpcIds.length && db) {
            for (const addNpcId of phase.summonNpcIds) {
                try {
                    const [npcRow] = await db.query('SELECT char_id FROM game_npcs WHERE id=?', [addNpcId]);
                    if (npcRow.length && npcRow[0].char_id) {
                        const addStats = await getEffectiveStats(db, npcRow[0].char_id);
                        if (addStats) {
                            addStats._isBossAdd = true;
                            battle.addCombatant(addStats, npc.teamId, true);
                            result.log.push(`👹 ${addStats.name} joins the fight!`);
                            result.actions.push({ type: 'boss_add', name: addStats.name });
                        }
                    }
                } catch {}
            }
        }

        // Only trigger one phase per damage event
        break;
    }
}

// Evaluate custom win conditions each turn
function evaluateWinCondition(battle) {
    const wc = battle._winCondition;
    if (!wc || !battle._settings?.enable_custom_win_conditions) return null;

    switch (wc.condition_type || wc.conditionType) {
        case 'kill_all':
            // Default behavior — handled by checkWinCondition() already
            return null;

        case 'survive_turns': {
            const target = wc.params?.turns || 10;
            if (battle.turnNumber >= target) {
                // Check if players are still alive
                const playerTeamId = Object.keys(battle.teams)[0];
                const alive = (battle.teams[playerTeamId] || []).some(id => {
                    const c = battle.combatants[id];
                    return c && c.currentHp > 0 && !c._knockedOut && !c.isAI;
                });
                if (alive) return { won: true, text: wc.success_text || 'You survived!' };
            }
            return null;
        }

        case 'protect_npc': {
            const protectId = wc.params?.protect_char_id;
            if (!protectId) return null;
            const protectTarget = battle.combatants[protectId];
            if (protectTarget && (protectTarget.currentHp <= 0 || protectTarget._knockedOut)) {
                return { won: false, text: wc.fail_text || 'The one you were protecting has fallen!' };
            }
            return null;
        }

        case 'kill_target': {
            const targetId = wc.params?.target_char_id;
            if (!targetId) return null;
            const killTarget = battle.combatants[targetId];
            if (killTarget && (killTarget.currentHp <= 0 || killTarget._knockedOut)) {
                return { won: true, text: wc.success_text || 'Target eliminated!' };
            }
            return null;
        }

        case 'dps_check': {
            const required = wc.params?.damage_required || 500;
            const turnLimit = wc.params?.turn_limit || 5;
            if (!battle._dpsCheckDamage) battle._dpsCheckDamage = 0;
            if (battle.turnNumber > turnLimit && battle._dpsCheckDamage < required) {
                return { won: false, text: wc.fail_text || wc.failText || 'DPS check failed!' };
            }
            if (battle._dpsCheckDamage >= required) {
                return { won: true, text: wc.success_text || wc.successText || 'DPS check passed!' };
            }
            return null;
        }

        case 'capture_point': {
            const px = wc.params?.x ?? 4, py = wc.params?.y ?? 2;
            const holdNeeded = wc.params?.hold_turns || 3;
            // Check if a player is standing on the point
            const playerTeamId = Object.keys(battle.teams)[0];
            const onPoint = (battle.teams[playerTeamId] || []).some(id => {
                const c = battle.combatants[id];
                return c && c.currentHp > 0 && !c._knockedOut && c.gridX === px && c.gridY === py;
            });
            if (onPoint) {
                battle._captureHeld = (battle._captureHeld || 0) + 1;
                if (battle._captureHeld >= holdNeeded) {
                    return { won: true, text: wc.success_text || wc.successText || 'Point captured!' };
                }
            } else {
                battle._captureHeld = 0; // reset if nobody on point
            }
            return null;
        }

        case 'escape': {
            const tx = wc.params?.target_x ?? 7, ty = wc.params?.target_y ?? 4;
            const playerTeamId = Object.keys(battle.teams)[0];
            const escaped = (battle.teams[playerTeamId] || []).some(id => {
                const c = battle.combatants[id];
                return c && c.currentHp > 0 && !c._knockedOut && !c.isAI && c.gridX === tx && c.gridY === ty;
            });
            if (escaped) return { won: true, text: wc.success_text || wc.successText || 'You escaped!' };
            return null;
        }

        case 'no_deaths': {
            // This is a BONUS condition — checked at battle end, not mid-battle
            // Standard kill_all still applies, this just tracks if anyone died
            const playerTeamId = Object.keys(battle.teams)[0];
            const anyDead = (battle.teams[playerTeamId] || []).some(id => {
                const c = battle.combatants[id];
                return c && !c.isAI && (c.currentHp <= 0 || c._knockedOut);
            });
            if (anyDead) return { won: false, text: wc.fail_text || wc.failText || 'An ally has fallen!' };
            return null; // keep fighting — standard kill_all handles the actual win
        }

        case 'pacifist': {
            // Check if any enemy was killed (not KO'd)
            for (const c of Object.values(battle.combatants)) {
                if (c.teamId !== Object.keys(battle.teams)[0] && c.currentHp <= 0 && !c._knockedOut) {
                    return { won: false, text: wc.fail_text || wc.failText || 'You killed one!' };
                }
            }
            // Check if all enemies are KO'd
            const allKOd = Object.values(battle.combatants).every(c =>
                c.teamId === Object.keys(battle.teams)[0] || c._knockedOut || c.currentHp <= 0
            );
            if (allKOd) {
                const anyKill = Object.values(battle.combatants).some(c =>
                    c.teamId !== Object.keys(battle.teams)[0] && c.currentHp <= 0 && !c._knockedOut
                );
                if (!anyKill) return { won: true, text: wc.success_text || wc.successText || 'All subdued!' };
            }
            return null;
        }

        case 'phase_clear': {
            const targetId = wc.params?.target_char_id;
            if (!targetId) return null;
            const boss = battle.combatants[targetId];
            if (!boss || !boss._bossPhases) return null;
            if (boss._currentPhase >= boss._bossPhases.length) {
                return { won: true, text: wc.success_text || wc.successText || 'All phases cleared!' };
            }
            return null;
        }

        case 'turn_limit': {
            const maxTurns = wc.params?.max_turns || 8;
            if (battle.turnNumber > maxTurns) {
                // Check if standard kill_all was also met
                const aliveEnemies = Object.values(battle.combatants).some(c =>
                    c.teamId !== Object.keys(battle.teams)[0] && c.currentHp > 0 && !c._knockedOut
                );
                if (aliveEnemies) {
                    return { won: false, text: wc.fail_text || wc.failText || 'Too slow!' };
                }
            }
            return null;
        }

        case 'steal_item': {
            // Checked via a separate steal action — flagged on battle state
            if (battle._stolenItem) {
                return { won: true, text: wc.success_text || wc.successText || 'Item stolen!' };
            }
            return null;
        }

        default:
            return null;
    }
}

// =================================================================
// SESSION 15: SUMMONS VIA RARE OGHAMS
// =================================================================

// Check if a combatant has a summon ogham equipped
async function getSummonOgham(db, charId) {
    try {
        const [rows] = await db.query(
            `SELECT co.ogham_id, go.name, go.icon, go.summon_npc_id, go.summon_duration,
                    go.summon_mp_cost, go.summon_slot_level,
                    go.summon_scaling_json, go.rank AS ogham_rank
             FROM character_oghams co
             JOIN game_oghams go ON go.id = co.ogham_id
             WHERE co.character_id = ? AND go.summon_npc_id IS NOT NULL LIMIT 1`, [charId]);
        if (!rows.length) return null;
        return {
            oghamId: rows[0].ogham_id,
            oghamName: rows[0].name,
            oghamIcon: rows[0].icon,
            summonNpcId: rows[0].summon_npc_id,
            duration: rows[0].summon_duration || 3,
            mpCost: rows[0].summon_mp_cost || 0,
            slotLevel: rows[0].summon_slot_level || 1,
            scaling: jp(rows[0].summon_scaling_json, {}),
            rank: rows[0].ogham_rank || 1
        };
    } catch { return null; }
}

// Resolve a summon action
async function resolveSummon(db, battle, actor, result) {
    const settings = battle._settings || {};
    if (!settings.enable_summons) {
        result.log.push('Summons are not enabled.');
        return result;
    }

    // Check if already has an active summon
    const maxSummons = settings.max_summons_per_player || 1;
    const activeSummons = Object.values(battle.combatants).filter(
        c => c._summonedBy === actor.charId && c.currentHp > 0 && !c._knockedOut
    ).length;
    if (activeSummons >= maxSummons) {
        result.log.push(`${actor.name} already has a summon active!`);
        return result;
    }

    // Get summon ogham
    const ogham = await getSummonOgham(db, actor.charId);
    if (!ogham) {
        result.log.push(`${actor.name} has no summon ogham equipped!`);
        return result;
    }

    // ── Cost: MP-based OR Spell Slot-based (togglable) ─────────
    const costType = settings.summon_cost_type || 'mp';

    if (costType === 'spell_slot' && settings.enable_spell_slots) {
        // BG3-style: consume a spell slot of the required level
        const requiredLevel = ogham.slotLevel || 1;
        const slots = jp(actor._spellSlots, null);
        if (!slots || !slots[requiredLevel] || slots[requiredLevel].current <= 0) {
            result.log.push(`No level ${requiredLevel} spell slots remaining!`);
            return result;
        }
        slots[requiredLevel].current--;
        actor._spellSlots = slots;
        // Sync back to DB (non-blocking)
        try {
            await db.query('UPDATE characters SET spell_slots_json=? WHERE id=?',
                [JSON.stringify(slots), actor.charId]);
        } catch {}
        result.log.push(`(Spell slot level ${requiredLevel} consumed)`);
    } else {
        // Classic: MP cost (flat from ogham or % of max)
        const mpCost = ogham.mpCost || Math.max(1, Math.floor(actor.maxMp * (settings.summon_mp_cost_pct || 0.20)));
        if (actor.currentMp < mpCost) {
            result.log.push(`Not enough MP! Need ${mpCost} MP to summon.`);
            return result;
        }
        actor.currentMp -= mpCost;
        result.log.push(`(${mpCost} MP consumed)`);
    }

    // Load summon NPC stats
    const summonStats = await getEffectiveStats(db, ogham.summonNpcId);
    if (!summonStats) {
        result.log.push(`The summon spirit fails to manifest...`);
        return result;
    }

    // Scale summon by ogham rank
    const scaling = ogham.scaling;
    const rank = ogham.rank;
    if (scaling) {
        const statKeys = ['maxHp', 'currentHp', 'atk', 'def', 'mo', 'md', 'speed'];
        for (const sk of statKeys) {
            const perRank = scaling[`${sk.toLowerCase()}_per_rank`] || scaling.all_per_rank || 0;
            if (perRank && summonStats[sk]) {
                summonStats[sk] = Math.round(summonStats[sk] * (1 + perRank * rank));
            }
        }
    }

    // Duration scales with rank
    const baseDuration = ogham.duration || (settings.summon_base_duration || 3);
    const duration = baseDuration + Math.floor(rank / 3);

    // Add to battle as temporary ally
    summonStats._isSummon = true;
    summonStats._summonedBy = actor.charId;
    summonStats._summonTurnsLeft = duration;
    summonStats._isCompanionAI = true;

    const actorTeamId = battle.getTeamId(actor.charId);
    battle.addCombatant(summonStats, actorTeamId, true);

    // Init limb system for summon if enabled
    if (battle._settings?.enable_limb_targeting) {
        const c = battle.combatants[summonStats.charId];
        if (c) {
            const zones = await loadLimbZones(db, summonStats.bodyTypeId || 1);
            if (zones.length > 1 || zones[0]?.key !== 'core') {
                c._limbZones = zones;
                c._limbHp = initLimbHp(c.maxHp, zones);
                c._woundLevels = getAllWoundLevels(c._limbHp, battle._settings);
            }
        }
    }

    result.log.push(`👻 ${actor.name} invokes ${ogham.oghamName} — ${summonStats.name} materializes! (${duration} turns)`);
    result.actions.push({
        type: 'summon', actor: actor.name,
        summonName: summonStats.name, summonCharId: summonStats.charId,
        duration, oghamName: ogham.oghamName, oghamIcon: ogham.oghamIcon
    });
    battle.addLog({ actor: actor.name, action: 'Summon', text: `${actor.name} summons ${summonStats.name}!` });
    return result;
}

// Tick summon duration — called in processStatusEffects
function tickSummons(battle, tickResult) {
    for (const c of Object.values(battle.combatants)) {
        if (!c._isSummon || c.currentHp <= 0) continue;
        c._summonTurnsLeft--;
        if (c._summonTurnsLeft <= 0) {
            c.currentHp = 0; // despawn
            tickResult.log.push(`👻 ${c.name} fades back to the spirit realm.`);
            tickResult.actions.push({ type: 'summon_despawn', target: c.name });
        }
    }
}

// =================================================================
// SESSION 13: FIGHTING STYLES / MARTIAL ARTS
// =================================================================

// Load a character's active fighting style + rank bonuses
async function loadActiveStyle(db, charId) {
    try {
        const [rows] = await db.query(
            `SELECT cfs.*, gfs.name AS style_name, gfs.label AS style_label, gfs.icon AS style_icon,
                    gfs.style_type, gfs.passive_effects AS style_passives,
                    gfsr.stat_bonuses, gfsr.passive_effects AS rank_passives, gfsr.label AS rank_label,
                    gfsr.unlocked_move_ids
             FROM character_fighting_styles cfs
             JOIN game_fighting_styles gfs ON gfs.id = cfs.style_id
             JOIN game_fighting_style_ranks gfsr ON gfsr.style_id = cfs.style_id AND gfsr.rank_num = cfs.current_rank
             WHERE cfs.character_id = ? AND cfs.is_active = 1 LIMIT 1`, [charId]);
        if (!rows.length) return null;
        const r = rows[0];
        return {
            styleId: r.style_id,
            styleName: r.style_name,
            styleLabel: r.style_label,
            styleIcon: r.style_icon,
            styleType: r.style_type,
            rank: r.current_rank,
            rankLabel: r.rank_label,
            winsAtRank: r.wins_at_rank,
            totalWins: r.total_wins,
            statBonuses: jp(r.stat_bonuses, {}),
            rankPassives: jp(r.rank_passives, {}),
            stylePassives: jp(r.style_passives, {}),
            unlockedMoveIds: jp(r.unlocked_move_ids, [])
        };
    } catch { return null; }
}

// Apply style stat bonuses to a combatant (multiplicative, like wounds)
function applyStyleBonuses(combatant, settings) {
    if (!settings?.enable_fighting_styles) return;
    const style = combatant._fightingStyle;
    if (!style) return;

    const bonuses = style.statBonuses;
    const statKeys = ['atk', 'def', 'mo', 'md', 'speed', 'luck'];
    for (const sk of statKeys) {
        if (bonuses[sk] !== undefined) {
            combatant[sk] = Math.max(1, Math.round(combatant[sk] * (1 + bonuses[sk])));
        }
    }
    if (bonuses.maxHp) {
        combatant.maxHp = Math.max(1, Math.round(combatant.maxHp * (1 + bonuses.maxHp)));
    }
}

// After a battle win, increment style wins + check for rank-up
async function styleWinCredit(db, charId, settings) {
    if (!settings?.enable_fighting_styles) return null;
    try {
        const [active] = await db.query(
            `SELECT cfs.id, cfs.style_id, cfs.current_rank, cfs.wins_at_rank,
                    gfsr.wins_required, gfs.max_rank
             FROM character_fighting_styles cfs
             JOIN game_fighting_styles gfs ON gfs.id = cfs.style_id
             JOIN game_fighting_style_ranks gfsr ON gfsr.style_id = cfs.style_id AND gfsr.rank_num = cfs.current_rank
             WHERE cfs.character_id = ? AND cfs.is_active = 1 LIMIT 1`, [charId]);
        if (!active.length) return null;

        const row = active[0];
        const newWins = row.wins_at_rank + 1;

        // Check for rank-up
        if (newWins >= row.wins_required && row.current_rank < row.max_rank) {
            const newRank = row.current_rank + 1;
            await db.query(
                'UPDATE character_fighting_styles SET current_rank=?, wins_at_rank=0, total_wins=total_wins+1 WHERE id=?',
                [newRank, row.id]);
            // Get new rank info
            const [rankInfo] = await db.query(
                'SELECT label, icon FROM game_fighting_style_ranks WHERE style_id=? AND rank_num=?',
                [row.style_id, newRank]);
            return {
                rankedUp: true, newRank, rankLabel: rankInfo.length ? rankInfo[0].label : `Rank ${newRank}`,
                rankIcon: rankInfo.length ? rankInfo[0].icon : '🥋'
            };
        } else {
            await db.query(
                'UPDATE character_fighting_styles SET wins_at_rank=?, total_wins=total_wins+1 WHERE id=?',
                [newWins, row.id]);
            return { rankedUp: false, winsAtRank: newWins, winsRequired: row.wins_required };
        }
    } catch { return null; }
}

// =================================================================
// SESSION 12A: MASTER TRAINING SYSTEM
// =================================================================

// Train under a master NPC. Returns training result.
async function trainUnderMaster(db, charId, npcId) {
    const [npcRow] = await db.query('SELECT * FROM game_npcs WHERE id=? AND is_master=1', [npcId]);
    if (!npcRow.length) return { success: false, message: 'Not a master' };
    const master = npcRow[0];

    const [charRow] = await db.query('SELECT * FROM characters WHERE id=?', [charId]);
    if (!charRow.length) return { success: false, message: 'Character not found' };
    const char = charRow[0];

    const result = { success: true, type: null, data: {} };

    // Unlock sig tech creation
    if (master.unlocks_sig_tech_creation && !char.can_create_sig_tech) {
        await db.query('UPDATE characters SET can_create_sig_tech=1 WHERE id=?', [charId]);
        result.type = 'unlock_creation';
        result.data = { message: `${master.name} teaches you the art of creating your own techniques!` };
    }
    // Teach a specific pre-made sig tech
    else if (master.teaches_sig_tech_id) {
        const [premade] = await db.query('SELECT * FROM game_premade_sig_techs WHERE id=?', [master.teaches_sig_tech_id]);
        if (premade.length) {
            const pm = premade[0];
            // Check if player already knows it
            const [existing] = await db.query(
                'SELECT id FROM character_signature_techs WHERE character_id=? AND name=?', [charId, pm.name]);
            if (existing.length) {
                return { success: false, message: `You already know ${pm.name}!` };
            }
            // Create the tech for the player
            await db.query(
                `INSERT INTO character_signature_techs
                 (character_id, name, icon, description, tech_type, element, battle_text, current_level, current_xp)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
                [charId, pm.name, pm.icon, pm.description, pm.tech_type, pm.element, pm.battle_text]
            );
            result.type = 'learn_sig_tech';
            result.data = { techName: pm.name, lore: pm.lore_text, message: `${master.name} teaches you ${pm.name}!` };
        }
    }
    // Stat training (default)
    else {
        const gainPct = parseFloat(master.training_gain_pct) || 0.02;
        const baseHp = char.max_hp;
        const gain = Math.max(1, Math.floor(baseHp * gainPct));
        // Training costs current HP (you get tired) but raises base stats
        await db.query(
            'UPDATE characters SET max_hp=max_hp+?, current_hp=GREATEST(1, current_hp-?) WHERE id=?',
            [Math.floor(gain * 0.1), Math.floor(gain * 0.5), charId]
        );
        result.type = 'stat_train';
        result.data = { gain, message: `Training under ${master.name} strengthens you! (+${Math.floor(gain * 0.1)} max HP)` };
    }

    // Log the training
    try {
        await db.query(
            'INSERT INTO game_master_training_log (character_id, npc_id, training_type, result_json) VALUES (?,?,?,?)',
            [charId, npcId, result.type || 'stat_train', JSON.stringify(result.data)]
        );
    } catch {}

    return result;
}

// =================================================================
// SESSION 12B: EXPANDED RP DESCRIPTION ENGINE
// =================================================================
// Replaces the simple flavor text evaluator with a richer system that:
// - Scales bonus by description length/detail
// - Checks context (terrain, wounds, nearby allies/enemies)
// - Detects party chains (building on ally's description)
// - Works on ALL action types, not just attacks

async function evaluateRpDescription(db, battle, actor, text, actionType, settings) {
    const result = { bonus: 0, contextMatches: 0, partyChain: false, log: [] };
    if (!settings?.enable_rp_descriptions) return result;
    if (!text || typeof text !== 'string') return result;

    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();
    const minShort = settings.rp_desc_min_short || 20;
    const minDetailed = settings.rp_desc_min_detailed || 50;
    const shortBonus = settings.rp_desc_short_bonus || 0.05;
    const detailedBonus = settings.rp_desc_detailed_bonus || 0.07;
    const contextBonus = settings.rp_desc_context_bonus || 0.03;
    const chainBonus = settings.rp_desc_party_chain_bonus || 0.03;
    const maxBonus = settings.rp_desc_max_bonus || 0.12;

    // Check which action types are eligible
    const allowedTypes = (settings.rp_desc_applies_to || 'attack,skill').split(',').map(s => s.trim());
    if (!allowedTypes.includes(actionType) && !allowedTypes.includes('all')) return result;

    if (trimmed.length < minShort) return result;

    // Length-based bonus (scaling)
    if (trimmed.length >= minDetailed) {
        result.bonus = detailedBonus;
        result.log.push(`🎭 Detailed description! (+${Math.round(detailedBonus * 100)}%)`);
    } else {
        result.bonus = shortBonus;
        result.log.push(`🎭 RP description (+${Math.round(shortBonus * 100)}%)`);
    }

    // Context awareness — check if description references actual battle state
    const actorTerrain = battle?.terrainMap?.[`${actor.gridX},${actor.gridY}`] || 'open';
    const contextChecks = [
        // Terrain references
        { words: ['tree', 'forest', 'branch', 'trunk'], terrain: 'forest' },
        { words: ['high ground', 'above', 'ledge', 'cliff'], terrain: 'high_ground' },
        { words: ['water', 'wade', 'splash', 'river'], terrain: 'water' },
        { words: ['fire', 'flame', 'burning', 'blaze'], terrain: 'fire' },
        { words: ['wall', 'cover', 'stone', 'rock'], terrain: 'cover' },
    ];
    let contextHits = 0;
    for (const check of contextChecks) {
        if (check.words.some(w => lower.includes(w))) {
            if (check.terrain === actorTerrain || !check.terrain) {
                contextHits++;
            }
        }
    }

    // Wound references (mentioning the target's actual wounded limbs)
    const target = battle?.getOpponent?.(actor.charId);
    if (target?._woundLevels) {
        const woundedLimbs = Object.entries(target._woundLevels)
            .filter(([_, level]) => level !== 'normal')
            .map(([key]) => key);
        for (const limb of woundedLimbs) {
            const limbWords = {
                head: ['head', 'skull', 'face', 'temple'],
                torso: ['chest', 'torso', 'ribs', 'gut'],
                left_arm: ['left arm', 'shield arm', 'off hand'],
                right_arm: ['right arm', 'weapon arm', 'sword arm'],
                legs: ['leg', 'knee', 'ankle', 'shin']
            };
            if (limbWords[limb]?.some(w => lower.includes(w))) contextHits++;
        }
    }

    if (contextHits > 0) {
        const ctxBonusTotal = Math.min(contextBonus * 2, contextBonus * contextHits);
        result.bonus += ctxBonusTotal;
        result.contextMatches = contextHits;
        result.log.push(`🎯 Context-aware! ${contextHits} battlefield reference${contextHits > 1 ? 's' : ''} (+${Math.round(ctxBonusTotal * 100)}%)`);
    }

    // Party chain detection — check if description references an ally's recent action
    if (battle) {
        const recentLogs = battle.log.slice(-5);
        const allyTeam = battle.getAllyTeam?.(actor.charId) || [];
        const allyNames = allyTeam.map(a => a.name.toLowerCase());

        for (const log of recentLogs) {
            if (allyNames.some(n => lower.includes(n))) {
                result.partyChain = true;
                result.bonus += chainBonus;
                result.log.push(`🤝 Party chain! Building on ally's action (+${Math.round(chainBonus * 100)}%)`);
                break;
            }
        }
        // Also check for coordination keywords
        const chainWords = ['while', 'as they', 'together', 'following up', 'pinned', 'distracted', 'opening'];
        if (!result.partyChain && allyTeam.length > 0) {
            if (chainWords.some(w => lower.includes(w))) {
                result.partyChain = true;
                result.bonus += chainBonus;
                result.log.push(`🤝 Coordinated action! (+${Math.round(chainBonus * 100)}%)`);
            }
        }
    }

    result.bonus = Math.min(maxBonus, result.bonus);
    return result;
}

// =================================================================
// SESSION 12C: BATTLE NARRATION — DM-style descriptions
// =================================================================

// Pick a narration template matching the context, fill in placeholders
async function generateNarration(db, actionType, context, settings) {
    if (!settings?.enable_battle_narration) return null;
    try {
        // Build query conditions for best-match template
        let query = 'SELECT text_template, weight FROM game_battle_narrations WHERE active=1 AND action_type=?';
        const params = [actionType];

        const [allTemplates] = await db.query(query, params);
        if (!allTemplates.length) return null;

        // Score templates by specificity match
        const scored = allTemplates.map(t => {
            let score = t.weight || 1;
            // Bonus for matching weapon/element/terrain/zone
            if (context.weaponType && t.weapon_type === context.weaponType) score += 5;
            else if (t.weapon_type && t.weapon_type !== context.weaponType) score -= 3;
            if (context.element && t.element === context.element) score += 5;
            else if (t.element && t.element !== context.element) score -= 3;
            if (context.terrain && t.terrain === context.terrain) score += 4;
            else if (t.terrain && t.terrain !== context.terrain) score -= 2;
            if (context.targetZone && t.target_zone === context.targetZone) score += 4;
            else if (t.target_zone && t.target_zone !== context.targetZone) score -= 2;
            return { ...t, score: Math.max(0, score) };
        }).filter(t => t.score > 0);

        if (!scored.length) return null;

        // Weighted random selection
        const totalWeight = scored.reduce((sum, t) => sum + t.score, 0);
        let roll = Math.random() * totalWeight;
        let selected = scored[0];
        for (const t of scored) {
            roll -= t.score;
            if (roll <= 0) { selected = t; break; }
        }

        // Fill placeholders
        let text = selected.text_template;
        text = text.replace(/\{actor\}/g, context.actorName || 'The attacker');
        text = text.replace(/\{target\}/g, context.targetName || 'the enemy');
        text = text.replace(/\{damage\}/g, String(context.damage || 0));
        text = text.replace(/\{skill\}/g, context.skillName || 'their attack');
        text = text.replace(/\{limb\}/g, context.limbLabel || 'body');
        text = text.replace(/\{terrain\}/g, context.terrain || 'the ground');
        text = text.replace(/\{weapon\}/g, context.weaponType || 'weapon');

        return text;
    } catch { return null; }
}

// =================================================================
// SESSION 12D: RP COMBAT COMMANDS (Taunt, Intimidate, Rally)
// =================================================================

async function resolveRpCommand(db, battle, actor, target, rpType, effects, result, flavorText) {
    const settings = battle._settings || {};
    if (!settings.enable_rp_commands) {
        result.log.push('RP commands are not enabled.');
        return result;
    }

    // RP descriptions on RP commands get extra bonus
    let rpBonus = 0;
    if (flavorText && settings.enable_rp_descriptions) {
        const rpResult = await evaluateRpDescription(db, battle, actor, flavorText, 'taunt', settings);
        rpBonus = rpResult.bonus;
        for (const log of rpResult.log) result.log.push(log);
        if (flavorText.trim()) result.log.push(`💬 "${flavorText.trim()}"`);
    }

    switch (rpType) {
        case 'taunt': {
            const dmgBonus = (parseFloat(effects.self_damage_bonus) || 0.10) + rpBonus;
            const duration = effects.bonus_duration || 1;
            actor._tauntBonus = { damageBonus: dmgBonus, turnsLeft: duration };

            // Force AI to target the taunter
            if (target) target._taunted = { by: actor.charId, turnsLeft: effects.aggro_duration || 1 };

            // Narration
            const narration = await generateNarration(db, 'taunt', {
                actorName: actor.name, targetName: target?.name
            }, settings);

            result.log.push(narration || `😤 ${actor.name} taunts ${target?.name || 'the enemy'}!`);
            result.log.push(`Next attack: +${Math.round(dmgBonus * 100)}% damage!`);
            result.actions.push({ type: 'taunt', actor: actor.name, target: target?.name, dmgBonus });
            battle.addLog({ actor: actor.name, action: 'Taunt', text: `${actor.name} taunts!` });
            break;
        }
        case 'intimidate': {
            const baseChance = (parseFloat(effects.base_chance) || 0.50) + rpBonus;
            const atkReduction = parseFloat(effects.atk_reduction) || 0.15;
            const accReduction = parseFloat(effects.accuracy_reduction) || 0.10;
            const duration = effects.duration || 2;

            // Level-based check: higher level = more intimidating
            const levelRatio = (actor.level || 1) / Math.max(1, target?.level || 1);
            const chance = Math.min(0.90, baseChance * Math.min(2, levelRatio));

            const narration = await generateNarration(db, 'intimidate', {
                actorName: actor.name, targetName: target?.name
            }, settings);

            if (Math.random() < chance) {
                if (target) {
                    target._intimidated = {
                        atkReduction, accReduction,
                        turnsLeft: duration
                    };
                }
                result.log.push(narration || `👁️ ${actor.name} intimidates ${target?.name || 'the enemy'}!`);
                result.log.push(`${target?.name} is shaken! (-${Math.round(atkReduction * 100)}% ATK, -${Math.round(accReduction * 100)}% accuracy for ${duration} turns)`);
                result.actions.push({ type: 'intimidate', success: true, actor: actor.name, target: target?.name });
            } else {
                result.log.push(`${actor.name} tries to intimidate but ${target?.name || 'the enemy'} stands firm!`);
                result.actions.push({ type: 'intimidate', success: false, actor: actor.name });
            }
            battle.addLog({ actor: actor.name, action: 'Intimidate', text: `${actor.name} attempts intimidation` });
            break;
        }
        case 'rally': {
            const atkBonus = parseFloat(effects.atk_bonus) || 0.10;
            const spdBonus = parseFloat(effects.speed_bonus) || 0.10;
            const duration = effects.duration || 2;
            const totalBonus = atkBonus + rpBonus;

            // Rally affects all living allies
            const allies = battle.getAllyTeam?.(actor.charId) || [];
            for (const ally of allies) {
                ally._rallied = { atkBonus: totalBonus, speedBonus: spdBonus, turnsLeft: duration };
            }
            // Also affects self
            actor._rallied = { atkBonus: totalBonus, speedBonus: spdBonus, turnsLeft: duration };

            const narration = await generateNarration(db, 'rally', {
                actorName: actor.name
            }, settings);

            result.log.push(narration || `📣 ${actor.name} rallies the party!`);
            result.log.push(`All allies: +${Math.round(totalBonus * 100)}% ATK, +${Math.round(spdBonus * 100)}% Speed for ${duration} turns!`);
            result.actions.push({ type: 'rally', actor: actor.name, atkBonus: totalBonus, spdBonus, allies: allies.length + 1 });
            battle.addLog({ actor: actor.name, action: 'Rally', text: `${actor.name} rallies the party!` });
            break;
        }
    }

    return result;
}

// Tick RP buffs/debuffs at turn end
function tickRpEffects(combatant) {
    // Taunt bonus
    if (combatant._tauntBonus) {
        combatant._tauntBonus.turnsLeft--;
        if (combatant._tauntBonus.turnsLeft <= 0) combatant._tauntBonus = null;
    }
    // Taunted (aggro draw)
    if (combatant._taunted) {
        combatant._taunted.turnsLeft--;
        if (combatant._taunted.turnsLeft <= 0) combatant._taunted = null;
    }
    // Intimidated
    if (combatant._intimidated) {
        combatant._intimidated.turnsLeft--;
        if (combatant._intimidated.turnsLeft <= 0) combatant._intimidated = null;
    }
    // Rallied
    if (combatant._rallied) {
        combatant._rallied.turnsLeft--;
        if (combatant._rallied.turnsLeft <= 0) combatant._rallied = null;
    }
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
// SESSION 9B: FLAVOR TEXT / RP BONUS
// =================================================================
// Evaluates a player's flavor text for damage bonus. Checks:
// 1. Minimum length → base bonus
// 2. Keyword matches (terrain-aware) → bonus per keyword
// 3. Admin template match → full template bonus
// Returns { bonus: 0-0.10, log: string[] }

async function evaluateFlavorText(db, battle, actor, flavorText, skillId, commandId, settings) {
    const result = { bonus: 0, log: [] };
    if (!settings?.enable_flavor_text || !flavorText) return result;
    if (typeof flavorText !== 'string') return result;

    const text = flavorText.trim();
    const textLower = text.toLowerCase();
    const minLength = settings.flavor_text_min_length || 20;
    const maxBonus = settings.flavor_text_max_bonus || 0.10;
    const baseBonus = settings.flavor_text_base_bonus || 0.05;
    const kwBonus = settings.flavor_text_keyword_bonus || 0.02;
    const kwMax = settings.flavor_text_keyword_max || 3;

    // 1. Length check — base bonus for writing anything meaningful
    if (text.length >= minLength) {
        result.bonus += baseBonus;
    } else {
        return result; // Too short — no bonus
    }

    // 2. Keyword matches
    try {
        const [keywords] = await db.query(
            'SELECT keyword, bonus_pct, terrain_match FROM game_flavor_keywords WHERE active=1');
        let kwMatches = 0;
        const actorTerrain = battle?.terrainMap?.[`${actor.gridX},${actor.gridY}`] || 'open';

        for (const kw of keywords) {
            if (kwMatches >= kwMax) break;
            if (!textLower.includes(kw.keyword.toLowerCase())) continue;
            // Terrain-aware keywords only give bonus if terrain matches
            if (kw.terrain_match && kw.terrain_match !== actorTerrain) continue;
            result.bonus += parseFloat(kw.bonus_pct) || kwBonus;
            kwMatches++;
        }
        if (kwMatches > 0) {
            result.log.push(`🎭 ${kwMatches} keyword${kwMatches > 1 ? 's' : ''} matched!`);
        }
    } catch {} // non-fatal

    // 3. Template match — check if text closely matches an admin-created template
    try {
        let templateQuery = 'SELECT text, bonus_pct FROM game_flavor_texts WHERE active=1 AND approved=1 AND is_template=1';
        const params = [];
        if (skillId) {
            templateQuery += ' AND (skill_id=? OR skill_id IS NULL)';
            params.push(skillId);
        }
        if (commandId) {
            templateQuery += ' AND (command_id=? OR command_id IS NULL)';
            params.push(commandId);
        }
        const [templates] = await db.query(templateQuery, params);
        for (const tmpl of templates) {
            const tmplLower = (tmpl.text || '').toLowerCase();
            // Simple similarity: check if player text contains most of the template words
            const tmplWords = tmplLower.split(/\s+/).filter(w => w.length > 3);
            const matchCount = tmplWords.filter(w => textLower.includes(w)).length;
            if (tmplWords.length > 0 && matchCount / tmplWords.length >= 0.6) {
                // Template match — use the template's bonus instead of base
                result.bonus = Math.max(result.bonus, parseFloat(tmpl.bonus_pct) || baseBonus);
                result.log.push(`🎭 Flavor text matches a known technique!`);
                break;
            }
        }
    } catch {} // non-fatal

    // Cap at max
    result.bonus = Math.min(maxBonus, result.bonus);
    if (result.bonus > 0) {
        result.log.push(`🎭 RP Bonus: +${Math.round(result.bonus * 100)}% damage!`);
    }

    // Session 11: Track flavor text for signature technique discovery
    // (async, non-blocking — discovery check happens in background)
    result._trackPromise = trackFlavorText(db, actor.charId, text, battle?.id, skillId, 0, settings);

    return result;
}

// =================================================================
// SESSION 9C: COMBO PROC SYSTEM
// =================================================================
// After a physical attack (or skill with combo_chance), roll for a free
// extra attack. Lower damage attacks have higher combo chance (Mado rule).
// Each chain hit reduces the proc chance by decay factor (default 50%).

async function resolveComboProc(db, battle, actor, target, comboChance, maxChain, actionName, result) {
    if (!battle._settings?.enable_combo_procs) return;
    if (!comboChance || comboChance <= 0 || maxChain <= 0) return;
    if (!target || target.currentHp <= 0 || target._knockedOut) return;

    const decay = battle._settings?.combo_chain_decay || 0.50;
    const comboCrit = battle._settings?.combo_crit_chance || 0.03;
    let currentChance = comboChance;

    for (let chain = 0; chain < maxChain; chain++) {
        if (Math.random() >= currentChance) break;

        // COMBO! Extra attack
        result.log.push(`⚡ COMBO! ${actor.name} follows up with another strike!`);
        result.actions.push({ type: 'combo_proc', actor: actor.name, chain: chain + 1 });

        // Calculate combo hit damage (basic ATK formula, reduced)
        let comboDmg = Math.max(1, Math.floor(actor.atk * 1.5));

        // Combo crit check (3% from Mado)
        let comboCritHit = false;
        if (Math.random() < comboCrit) {
            comboDmg = Math.floor(comboDmg * 1.5);
            comboCritHit = true;
        }

        // Apply to target (with limb routing if active)
        const effectiveLimb = actor._targetLimb || null;
        if (battle._settings?.enable_limb_targeting && target._limbHp && effectiveLimb) {
            const limbRes = routeLimbDamage(target, comboDmg, effectiveLimb, battle._settings);
            target.currentHp = Math.max(0, target.currentHp - limbRes.mainDamage);
            if (target._limbHp) {
                target._woundLevels = getAllWoundLevels(target._limbHp, battle._settings);
                applyWoundPenalties(target, battle._settings);
            }
            result.log.push(`${comboCritHit ? '💥 CRIT! ' : ''}${target.name}'s ${limbRes.limbLabel} takes ${limbRes.limbDamage} combo damage!`);
            if (limbRes.limbDisabled) {
                result.log.push(`💀 ${target.name}'s ${limbRes.limbLabel} is disabled!`);
                result.actions.push({ type: 'limb_disabled', target: target.name, limb: limbRes.limbKey });
            }
            if (limbRes.knockedOut) {
                target._knockedOut = true;
                target.currentHp = 0;
            }
        } else {
            target.currentHp = Math.max(0, target.currentHp - comboDmg);
            result.log.push(`${comboCritHit ? '💥 CRIT! ' : ''}${target.name} takes ${comboDmg} combo damage!`);
        }

        result.actions.push({ type: 'combo_damage', target: target.name, amount: comboDmg, crit: comboCritHit, chain: chain + 1 });
        battle.addLog({ actor: actor.name, action: `Combo ${chain + 1}`, damage: comboDmg, crit: comboCritHit, target: target.name });

        // Check death from combo
        if (target.currentHp <= 0) {
            checkDeathOrKnockout(battle, actor, target, result);
            break;
        }

        // Decay chance for next chain
        currentChance *= decay;
    }
}

// =================================================================
// =================================================================
// SESSION 11: RESOLVE SIGNATURE TECHNIQUE IN COMBAT
// =================================================================

async function resolveSignatureTech(db, battle, actor, target, sigTech, result, targetLimb) {
    const settings = battle._settings || {};

    // Battle text
    const text = (sigTech.battleText || '{name} uses {skill}!')
        .replace('{name}', actor.name).replace('{skill}', sigTech.name);
    result.log.push(`⚡ ${text}`);
    result.actions.push({ type: 'sig_tech', name: sigTech.name, icon: sigTech.icon, actor: actor.name });

    if (sigTech.techType === 'ki_attack' || sigTech.techType === 'physical') {
        // Cost: % of current HP (ki) or flat MP (physical)
        const cost = Math.max(1, Math.floor(actor.currentHp * sigTech.costPct));
        if (sigTech.techType === 'ki_attack') {
            actor.currentHp = Math.max(1, actor.currentHp - cost); // can't kill yourself
            result.log.push(`(Cost: ${cost} HP)`);
        }

        // Damage: % of ATK or MO * modifier
        const baseStat = sigTech.techType === 'physical' ? actor.atk : actor.mo;
        let damage = Math.max(1, Math.floor(baseStat * (sigTech.damagePct / 0.10) * 2)); // scaled formula

        // Ability effects
        const fx = sigTech.abilityEffects || {};

        // Piercing: ignore % of defense
        if (fx.piercing) {
            const ignoreRate = fx.piercing;
            const defReduction = Math.floor((target.def || 0) * ignoreRate);
            damage += defReduction; // effectively ignoring that much defense
        }

        // Stun
        if (fx.stun_turns && target.currentHp > 0) {
            await applyStatus(db, target, 'Stun', fx.stun_turns, result);
        }

        // Guard crush — skip block defense (handled by flagging)
        // Guaranteed hit — skip dodge
        // These flags are checked by the caller or resolveDefense

        // Multi-hit
        const hits = fx.multi_hit || 1;
        const perHitDmg = hits > 1 ? Math.floor(damage / hits) : damage;
        let totalDmg = 0;

        for (let h = 0; h < hits; h++) {
            let hitDmg = Math.max(1, perHitDmg);

            // Element bonus
            if (sigTech.element) {
                // Simple: +10% for having an element
                hitDmg = Math.floor(hitDmg * 1.10);
            }

            // Limb routing
            if (settings.enable_limb_targeting && target._limbHp && targetLimb) {
                const limbRes = routeLimbDamage(target, hitDmg, targetLimb, settings);
                target.currentHp = Math.max(0, target.currentHp - limbRes.mainDamage);
                if (target._limbHp) {
                    target._woundLevels = getAllWoundLevels(target._limbHp, settings);
                    applyWoundPenalties(target, settings);
                }
                totalDmg += limbRes.mainDamage;
                if (hits > 1) result.log.push(`Hit ${h+1}: ${target.name}'s ${limbRes.limbLabel} takes ${limbRes.limbDamage}!`);
                else result.log.push(`${target.name}'s ${limbRes.limbLabel} takes ${limbRes.limbDamage} damage! (${limbRes.mainDamage} bleed-through)`);
            } else {
                target.currentHp = Math.max(0, target.currentHp - hitDmg);
                totalDmg += hitDmg;
                if (hits > 1) result.log.push(`Hit ${h+1}: ${target.name} takes ${hitDmg} damage!`);
                else result.log.push(`${target.name} takes ${hitDmg} damage!`);
            }

            result.actions.push({ type: 'sig_tech_damage', target: target.name, amount: hitDmg, hit: h+1, totalHits: hits });
            if (target.currentHp <= 0) break;
        }

        // Bleed from ability
        if (fx.bleed_tier && battle._bleedTiers && target.currentHp > 0) {
            applyBleed(target, fx.bleed_tier, battle._bleedTiers, result);
        }

        battle.addLog({ actor: actor.name, action: sigTech.name, damage: totalDmg, target: target.name });

        // Limit fill for defender
        if (target.maxHp > 0) {
            target.limitbreak = Math.min(100, (target.limitbreak || 0) + (totalDmg / target.maxHp) * 100 * 0.5);
        }

    } else if (sigTech.techType === 'ki_heal') {
        // Healing tech
        const cost = Math.max(1, Math.floor(actor.currentHp * sigTech.costPct));
        actor.currentHp = Math.max(1, actor.currentHp - cost);
        const healAmount = Math.floor(actor.maxHp * sigTech.healPct);
        const healTarget = target.teamId === actor.teamId ? target : actor;
        healTarget.currentHp = Math.min(healTarget.maxHp, healTarget.currentHp + healAmount);
        result.log.push(`${healTarget.name} recovers ${healAmount} HP! (Cost: ${cost} HP)`);
        result.actions.push({ type: 'sig_tech_heal', target: healTarget.name, amount: healAmount });

        // Regen limb ability
        const fx = sigTech.abilityEffects || {};
        if (fx.regen_limb && healTarget._limbHp && settings.enable_limb_targeting) {
            // Heal the most damaged limb fully
            let worstLimb = null, worstPct = 1;
            for (const [key, hp] of Object.entries(healTarget._limbHp)) {
                const pct = hp.current / hp.max;
                if (pct < worstPct) { worstLimb = key; worstPct = pct; }
            }
            if (worstLimb && worstPct < 1) {
                healTarget._limbHp[worstLimb].current = healTarget._limbHp[worstLimb].max;
                healTarget._woundLevels = getAllWoundLevels(healTarget._limbHp, settings);
                applyWoundPenalties(healTarget, settings);
                const zone = healTarget._limbZones?.find(z => z.key === worstLimb);
                result.log.push(`🩹 ${healTarget.name}'s ${zone?.label || worstLimb} is fully restored!`);
            }
        }
    }

    // Death/KO check
    if (target.currentHp <= 0) {
        checkDeathOrKnockout(battle, actor, target, result);
    }

    // XP and level-up
    await sigTechGainXP(db, sigTech.techId, settings);

    return result;
}

// Grant XP to a signature tech and check for level-up
async function sigTechGainXP(db, techId, settings) {
    const xpPerUse = settings?.sig_tech_xp_per_use || 10;
    try {
        await db.query(
            'UPDATE character_signature_techs SET total_uses=total_uses+1, current_xp=current_xp+? WHERE id=?',
            [xpPerUse, techId]);

        // Check level-up
        const [techRow] = await db.query('SELECT current_level, current_xp FROM character_signature_techs WHERE id=?', [techId]);
        if (!techRow.length) return null;
        const { current_level, current_xp } = techRow[0];

        const [nextLevel] = await db.query(
            'SELECT level, xp_required FROM game_signature_levels WHERE level=?', [current_level + 1]);
        if (!nextLevel.length) return null; // already max level

        if (current_xp >= nextLevel[0].xp_required) {
            await db.query(
                'UPDATE character_signature_techs SET current_level=? WHERE id=?',
                [current_level + 1, techId]);

            // Check if new ability slot unlocked
            const [newLevelInfo] = await db.query(
                'SELECT ability_slots FROM game_signature_levels WHERE level=?', [current_level + 1]);
            const [oldLevelInfo] = await db.query(
                'SELECT ability_slots FROM game_signature_levels WHERE level=?', [current_level]);
            const newSlots = newLevelInfo.length ? newLevelInfo[0].ability_slots : 0;
            const oldSlots = oldLevelInfo.length ? oldLevelInfo[0].ability_slots : 0;

            return {
                leveledUp: true,
                newLevel: current_level + 1,
                newAbilitySlot: newSlots > oldSlots
            };
        }
        return null;
    } catch { return null; }
}

// SESSION 8: WOUND DEGRADATION — Stat penalties from limb damage
// =================================================================
// Called after any limb HP change. Reads the wound_effects JSON from
// each zone definition and applies cumulative stat multipliers.
// Base stats are snapshotted at battle start so penalties are always
// relative to the original values, not compounding.
//
// wound_effects format (from game_limb_zones):
//   {"light":{"speed":-0.15,"move_range":-1},"heavy":{"speed":-0.30,"move_range":-2,"cant_flee":true}}
// disable_effects format:
//   {"prone":true,"speed":-0.50,"move_range":-99,"cant_flee":true,"cant_move":true}
//
// Stat keys: atk, def, mo, md, speed, luck, accuracy (miss chance modifier),
//            move_range (additive tiles), maxHp (% reduction)
// Boolean flags: cant_flee, cant_move, cant_use_items, cant_dual_wield,
//                cant_two_hand, prone, knockout, stun_chance_on_hit

function applyWoundPenalties(combatant, settings) {
    if (!combatant._limbZones || !combatant._limbHp || !combatant._woundLevels) return;
    if (!settings?.enable_wound_degradation && !settings?.enable_limb_targeting) return;

    // Snapshot base stats on first call (so we always apply from clean slate)
    if (!combatant._baseStats) {
        combatant._baseStats = {
            atk: combatant.atk, def: combatant.def,
            mo: combatant.mo, md: combatant.md,
            speed: combatant.speed, luck: combatant.luck,
            maxHp: combatant.maxHp
        };
    }

    // Reset to base before applying
    const base = combatant._baseStats;
    combatant.atk   = base.atk;
    combatant.def   = base.def;
    combatant.mo    = base.mo;
    combatant.md    = base.md;
    combatant.speed = base.speed;
    combatant.luck  = base.luck;
    // maxHp reduction is tricky — only reduce max, clamp current
    combatant.maxHp = base.maxHp;

    // Clear wound flags
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
            // Light or heavy — pull from wound_effects
            effects = zone.woundEffects?.[woundLevel];
        } else {
            // Wound degradation disabled — only apply effects at disabled level
            continue;
        }

        if (!effects) continue;

        // Apply stat multipliers (negative = penalty, e.g. -0.30 = -30%)
        const statKeys = ['atk', 'def', 'mo', 'md', 'speed', 'luck'];
        for (const sk of statKeys) {
            if (effects[sk] !== undefined && typeof effects[sk] === 'number') {
                // Multiplicative: -0.30 means multiply by 0.70
                combatant[sk] = Math.max(1, Math.round(combatant[sk] * (1 + effects[sk])));
            }
        }

        // maxHp reduction (e.g. -0.10 = lose 10% max HP)
        if (effects.maxHp !== undefined) {
            combatant.maxHp = Math.max(1, Math.round(combatant.maxHp * (1 + effects.maxHp)));
            if (combatant.currentHp > combatant.maxHp) combatant.currentHp = combatant.maxHp;
        }

        // Move range modifier (additive: -1, -2, -99)
        if (effects.move_range !== undefined) {
            combatant._woundFlags.move_range_mod += effects.move_range;
        }

        // Accuracy penalty (added to miss chance)
        if (effects.accuracy !== undefined) {
            combatant._woundFlags.accuracy_penalty += Math.abs(effects.accuracy) * 100; // convert to %
        }

        // Stun chance on being hit (head wounds)
        if (effects.stun_chance_on_hit !== undefined) {
            combatant._woundFlags.stun_chance_on_hit = Math.max(
                combatant._woundFlags.stun_chance_on_hit,
                effects.stun_chance_on_hit
            );
        }

        // Boolean flags — any zone setting it = active
        if (effects.cant_flee)       combatant._woundFlags.cant_flee = true;
        if (effects.cant_move)       combatant._woundFlags.cant_move = true;
        if (effects.cant_use_items)  combatant._woundFlags.cant_use_items = true;
        if (effects.cant_dual_wield) combatant._woundFlags.cant_dual_wield = true;
        if (effects.cant_two_hand)   combatant._woundFlags.cant_two_hand = true;
        if (effects.prone)           combatant._woundFlags.prone = true;
    }
}

// =================================================================
// STAT CALCULATOR — Equipment + Status Modifiers
// =================================================================
// This is called BEFORE every action to get the "effective" stats.
// Base stats come from the character table.
// Equipment bonuses come from character_equipment + game_items.
// Status mods (ATK Up, etc.) come from active status_effects.
// Returns the final stat block used in all formulas.

async function getEffectiveStats(db, charId) {
    // 1. Base stats
    const [charRows] = await db.query("SELECT * FROM characters WHERE id=?", [charId]);
    if (!charRows.length) return null;
    const c = charRows[0];

    const stats = {
        charId: c.id,
        userId: c.user_id,
        name: c.name,
        level: c.level,
        classId: c.class_id,
        raceId: c.race_id,
        // HP/MP (current, not max — max is calculated)
        currentHp: c.current_hp,
        maxHp: c.max_hp,
        currentMp: c.current_mp,
        maxMp: c.max_mp,
        // Base combat stats
        atk: c.atk,
        def: c.def,
        mo: c.mo,      // Magic Offense
        md: c.md,       // Magic Defense
        speed: c.speed,
        luck: c.luck,
        // Limit break
        limitbreak: parseFloat(c.limitbreak) || 0,
        breaklevel: c.breaklevel || 1,
        // Status effects
        statuses: jp(c.status_effects, []),
        // Equipment info (filled below)
        weaponElements: [],
        weaponStatuses: {},
        armorBlockStatuses: [],
        // Element defenses: [{elemName, role, pct}]  role = resist|weak|nullify|absorb
        elemDefenses: [],
        // Blood Ogham bonuses (merged in below)
        oghamElements: [],
        oghamStatuses: {},  // {statusName: chance}
        experience: c.experience || 0
    };

    // 2. Equipment bonuses
    const [equip] = await db.query(`
        SELECT ce.slot_key, gi.* FROM character_equipment ce
        JOIN game_items gi ON ce.item_id = gi.id
        WHERE ce.character_id = ?`, [charId]);

    for (const item of equip) {
        stats.atk += (item.bonus_atk || 0);
        stats.def += (item.bonus_def || 0);
        stats.mo  += (item.bonus_mo || 0);
        stats.md  += (item.bonus_md || 0);
        stats.speed += (item.bonus_speed || 0);
        stats.luck  += (item.bonus_luck || 0);
        stats.maxHp += (item.bonus_hp || 0);
        stats.maxMp += (item.bonus_mp || 0);

        // Elements — new format: {fire:{role:'resist',pct:50}} OR legacy {fire:'defense'}
        const elems = jp(item.elements, null);
        if (elems) {
            for (const [elemName, val] of Object.entries(elems)) {
                const en = elemName.toLowerCase();
                if (typeof val === 'object' && val !== null) {
                    // New format
                    const role = val.role || 'resist';
                    const pct  = val.pct !== undefined ? val.pct : 50;
                    if (role === 'attack') {
                        stats.weaponElements.push(en);
                    } else {
                        stats.elemDefenses.push({ elem: en, role, pct });
                    }
                } else {
                    // Legacy format: 'attack' or 'defense'
                    if (val === 'attack') stats.weaponElements.push(en);
                    else stats.elemDefenses.push({ elem: en, role: 'resist', pct: 50 });
                }
            }
        }

        // Weapon on-hit status (from item field, not ogham)
        if (item.slot_key === 'MAIN_HAND' || item.slot_key === 'OFF_HAND') {
            const ws = jp(item.set_status, null);
            if (ws) Object.assign(stats.weaponStatuses, ws);
        }

        // Armor blocked statuses
        const blocked = jp(item.block_status, null);
        if (blocked) stats.armorBlockStatuses.push(...blocked);
    }

    // 3. Status effect modifiers (ATK Up = multiply ATK by 1.5, etc)
    for (const status of stats.statuses) {
        const [sRows] = await db.query("SELECT * FROM game_statuses WHERE id=?", [status.id]);
        if (!sRows.length) continue;
        const effects = jp(sRows[0].effects, {});
        if (effects.stat_mod) {
            for (const [statKey, multiplier] of Object.entries(effects.stat_mod)) {
                if (stats[statKey] !== undefined && typeof stats[statKey] === 'number') {
                    stats[statKey] = Math.floor(stats[statKey] * multiplier);
                }
            }
        }
    }

    // 4. Blood Ogham bonuses — load from character_oghams
    const [oghams] = await db.query(`
        SELECT co.*, go.element_attack, go.on_hit_status, go.on_hit_chance,
               go.stat_bonus_json, go.grant_skill_id, go.curse_json, go.family_id
        FROM character_oghams co
        JOIN game_oghams go ON go.id = co.ogham_id
        WHERE co.character_id = ?`, [charId]);

    for (const og of oghams) {
        if (og.element_attack) stats.oghamElements.push(og.element_attack.toLowerCase());
        if (og.on_hit_status) {
            stats.oghamStatuses[og.on_hit_status] = {
                chance: og.on_hit_chance || 20,
                curse:  jp(og.curse_json, null)
            };
        }
        const bonus = jp(og.stat_bonus_json, null);
        if (bonus) {
            for (const [k, v] of Object.entries(bonus)) {
                if (typeof stats[k] === 'number') stats[k] += v;
            }
        }
    }

    // --- SET BONUS: 2+ Oghams from same family = set bonus activates ---
    const familyCounts = {};
    for (const og of oghams) {
        if (og.family_id) familyCounts[og.family_id] = (familyCounts[og.family_id] || 0) + 1;
    }
    const activeFamily = Object.keys(familyCounts).filter(fid => familyCounts[fid] >= 2);
    if (activeFamily.length) {
        try {
            const [families] = await db.query(
                'SELECT * FROM game_ogham_families WHERE id IN (?)', [activeFamily]);
            for (const fam of families) {
                const sb = jp(fam.set_bonus_json, null);
                if (!sb) continue;
                if (sb.stat_bonus) {
                    for (const [k, v] of Object.entries(sb.stat_bonus)) {
                        if (typeof stats[k] === 'number') stats[k] += v;
                    }
                }
                if (sb.element_attack) stats.oghamElements.push(sb.element_attack.toLowerCase());
                if (sb.on_hit_status) {
                    stats.oghamStatuses[sb.on_hit_status] = {
                        chance: sb.on_hit_chance || 20, curse: null
                    };
                }
                if (!stats.activeSets) stats.activeSets = [];
                stats.activeSets.push({ name: fam.name, label: sb.label || fam.name });
            }
        } catch(setErr) { console.warn('Set bonus error (non-fatal):', setErr.message); }
    }

    // 5. Passive reaction skills (fire on_hit, on_crit, etc.)
    // TEACHING: Reactions are skills that have  "reaction": { "trigger": "on_hit", "chance": 30 }
    // in their effects JSON. They're assigned to a class like normal skills, but rather than
    // the player choosing them from the menu, they trigger automatically when the condition fires.
    try {
        const [reactRows] = await db.query(`
            SELECT gs.id, gs.name, gs.icon, gs.effects, gcs.learn_level
            FROM game_class_skills gcs
            JOIN game_skills gs ON gcs.skill_id = gs.id
            WHERE gcs.class_id = ? AND gcs.learn_level <= ?`, [stats.classId, stats.level]);
        stats.reactions = [];
        for (const r of reactRows) {
            const rfx = jp(r.effects, {});
            if (rfx.reaction && rfx.reaction.trigger) {
                stats.reactions.push({
                    skillId: r.id,
                    name:    r.name,
                    icon:    r.icon,
                    trigger: rfx.reaction.trigger,   // 'on_hit' | 'on_crit' | 'on_kill'
                    chance:  rfx.reaction.chance || 25
                });
            }
        }
    } catch { stats.reactions = []; }

    // 6. Body type (for limb targeting system — Session 8)
    // NPC body_type_id comes from game_npcs; player characters default to humanoid.
    stats.bodyTypeId = 1; // humanoid default
    try {
        const [npcRow] = await db.query(
            'SELECT body_type_id FROM game_npcs WHERE char_id=? LIMIT 1', [charId]);
        if (npcRow.length && npcRow[0].body_type_id) {
            stats.bodyTypeId = npcRow[0].body_type_id;
        }
    } catch {} // non-fatal — defaults to humanoid

    // Merge ogham elements into weapon elements
    stats.weaponElements = [...new Set([...stats.weaponElements, ...stats.oghamElements])];

    // Clamp HP to max
    if (stats.currentHp > stats.maxHp) stats.currentHp = stats.maxHp;
    if (stats.currentMp > stats.maxMp) stats.currentMp = stats.maxMp;

    return stats;
}

// Build the vars object for safeEval formulas
function buildFormulaVars(attacker, defender) {
    // TEACHING: These variables are available in skill/limit/command formula strings.
    // Examples:
    //   "MAXHP - HP"           → damage equal to attacker's missing HP
    //   "HP_PCT < 25 ? ATK*3 : ATK*1.5"  → conditional burst at low HP
    //   "LIMITBREAK * ATK"     → scales with how full limit bar is
    //   "ENEMY_HP_PCT < 30 ? MO*4 : MO*2" → execute-style spell
    return {
        ATK:        attacker.atk,
        DEF:        defender.def,
        MO:         attacker.mo,
        MD:         defender.md,
        SPEED:      attacker.speed,
        LUCK:       attacker.luck,
        HP:         attacker.currentHp,
        MP:         attacker.currentMp,
        MAXHP:      attacker.maxHp,
        MAXMP:      attacker.maxMp,
        HP_PCT:     attacker.maxHp > 0 ? Math.floor((attacker.currentHp / attacker.maxHp) * 100) : 0,
        LIMITBREAK: attacker.limitbreak || 0,
        LVL:        attacker.level,
        ENEMY_ATK:      defender.atk,
        ENEMY_DEF:      defender.def,
        ENEMY_MO:       defender.mo,
        ENEMY_MD:       defender.md,
        ENEMY_SPEED:    defender.speed,
        ENEMY_LUCK:     defender.luck,
        ENEMY_HP:       defender.currentHp,
        ENEMY_MAXHP:    defender.maxHp,
        ENEMY_HP_PCT:   defender.maxHp > 0 ? Math.floor((defender.currentHp / defender.maxHp) * 100) : 0,
        ENEMY_LVL:      defender.level
    };
}

// =================================================================
// TABLE COMPATIBILITY HELPERS
// =================================================================
// The project supports two naming conventions depending on which
// SQL migration was run first.  These helpers try the new GPT-style
// name first, then fall back to the original project name so the
// game works regardless of which schema version is installed.

async function queryLevelRow(db, level) {
    for (const tbl of ['level_requirements', 'game_levels']) {
        try {
            const [rows] = await db.query(`SELECT * FROM \`${tbl}\` WHERE level=?`, [level]);
            return rows;
        } catch (e) {
            if (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146) continue;
            throw e;
        }
    }
    return [];
}

async function queryLimitBreakRow(db, id, classId) {
    for (const tbl of ['game_limit_breaks', 'game_limits']) {
        try {
            const [rows] = await db.query(`SELECT * FROM \`${tbl}\` WHERE id=? AND class_id=?`, [id, classId]);
            return rows;
        } catch (e) {
            if (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146) continue;
            throw e;
        }
    }
    return [];
}

async function queryLimitBreaksList(db, classId, charLevel, breakLevel) {
    for (const tbl of ['game_limit_breaks', 'game_limits']) {
        try {
            const [rows] = await db.query(
                `SELECT * FROM \`${tbl}\` WHERE class_id=? AND char_level_req<=? AND break_level<=? ORDER BY break_level`,
                [classId, charLevel, breakLevel]
            );
            return rows;
        } catch (e) {
            if (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146) continue;
            throw e;
        }
    }
    return [];
}

// =================================================================
// BATTLE STATE — In-memory battle tracker
// =================================================================
const activeBattles = {};   // battleId -> BattleState
const battlesByMap  = {};   // mapId -> Set<battleId>  // battleId -> BattleState

// =================================================================
// BATTLE STATE — multi-combatant, team-aware
// =================================================================
// TEACHING: The battle state now supports N vs M combatants organised
// into two named teams: 'players' and 'enemies'.
//
// For 1v1 PvP: players=[humanStats], enemies=[humanStats]  (both isAI:false)
// For 1v1 PvE: players=[humanStats], enemies=[npcStats]    (enemies isAI:true)
// For party PvE: players=[p1,p2,p3], enemies=[boss1,boss2]
//
// All existing code that calls battle.getOpponent(charId) still works —
// it returns the first LIVING enemy on the opposing team.
//
// Turn order is a SPEED-SORTED QUEUE that cycles across all living
// combatants. Think FF7's ATB order rather than a simple back-and-forth.
// =================================================================
class BattleState {
    constructor(id, teams, type = 'PVP') {
        this.id       = id;
        this.type     = type;   // 'PVP' | 'PVE' | 'PARTY_PVE'
        this.status   = 'ACTIVE';
        this.winner   = null;   // 'players' | 'enemies' | charId (1v1 compat)
        this.turnNumber = 1;
        this.log      = [];

        // teams: { players: [statsObj,...], enemies: [statsObj,...] }
        //   OR multi-team: { team_1: [...], team_2: [...], team_3: [...] }
        // Each statsObj gets teamId injected.
        this.combatants = {};
        this.teams = {};

        // Detect multi-team format vs legacy 2-team format
        const teamKeys = Object.keys(teams);
        const isLegacy = teamKeys.includes('players') || teamKeys.includes('enemies');

        if (isLegacy) {
            // Legacy 2-team: players vs enemies
            this.teams.players = [];
            this.teams.enemies = [];
            for (const s of (teams.players || [])) {
                this.combatants[s.charId] = { ...s, isAI: false, teamId: 'players' };
                this.teams.players.push(s.charId);
            }
            for (const s of (teams.enemies || [])) {
                this.combatants[s.charId] = { ...s, isAI: true, teamId: 'enemies' };
                this.teams.enemies.push(s.charId);
            }
        } else {
            // Multi-team (FFA / N-team): { team_1: [{stats, isAI},...], ... }
            for (const [teamId, members] of Object.entries(teams)) {
                this.teams[teamId] = [];
                for (const s of (members || [])) {
                    const isAI = s.isAI !== undefined ? s.isAI : false;
                    this.combatants[s.charId] = { ...s, isAI, teamId };
                    this.teams[teamId].push(s.charId);
                }
            }
        }

        // Build speed-sorted turn queue and set first actor
        this._rebuildTurnQueue();
        this.turnQueueIdx = 0;
        this.turnCharId   = this.turnQueue[0] || null;

        // Movement tracking: resets each turn
        this._hasMoved = {};
        for (const id of Object.keys(this.combatants)) this._hasMoved[id] = false;

        // Assign starting grid positions
        this._assignGridPositions();

        // ── Terrain map ────────────────────────────────────────────
        // TEACHING: Terrain is stored as a flat object keyed by "x,y".
        // Values: 'forest' | 'high_ground' | 'water' | 'cover'
        // Loaded from the map's TERRAIN events when a battle starts.
        // If no map terrain is loaded, all tiles default to 'open'.
        this.terrainMap = {};

        // ── Battle objects (Session 3) ────────────────────────────
        // Destructible objects on the battle grid: barrels, crates, chandeliers.
        // Keyed by "x,y". Each has HP, a preset type, and destruction effects.
        this.battleObjects = {};

        // ── Security token ─────────────────────────────────────────
        // A random 32-char hex token assigned at creation.
        // Stored in game_battles.access_token so future HTTP routes
        // can verify a caller actually participated in this battle,
        // rather than just guessing sequential integer IDs.
        this.accessToken = crypto.randomBytes(16).toString('hex');

        // ── NPC tracking for quest kill credit ────────────────────
        this.enemyNpcIds = [];

        // ── Map location ─────────────────────────────────────────
        // Set after construction by createBattle/createPartyBattle.
        // Used for mid-battle join: other players on the same map
        // can see active battles and request to join.
        this.mapId = null;
        this.mapX  = null;
        this.mapY  = null;

        // ── Session 8: Battle settings (feature flags) ───────────
        // Loaded async after construction via initSettings().
        this._settings = null;

        // ── Session 8: Limb targeting state ──────────────────────
        // Populated by initLimbSystem() after construction.
        // Per-combatant: _limbHp, _limbZones, _woundLevels, _knockedOut, _nonLethal
        // _lastAttackUsed: for diminishing returns tracking
    }

    // Async init — call after construction to load feature flags + limb zones
    async initSettings(db, arenaRow) {
        this._settings = await loadBattleSettings(db);
        if (arenaRow) applyArenaOverrides(this._settings, arenaRow);
    }

    // Session 13: Load fighting styles for all combatants
    async initFightingStyles(db) {
        if (!this._settings?.enable_fighting_styles) return;
        for (const c of Object.values(this.combatants)) {
            if (!c.isAI || c._isCompanionAI) {
                // Load active style for human players and companions
                c._fightingStyle = await loadActiveStyle(db, c.charId);
            } else {
                // AI enemies could have a style too (set by admin on NPC character)
                try {
                    c._fightingStyle = await loadActiveStyle(db, c.charId);
                } catch { c._fightingStyle = null; }
            }
            // Apply style stat bonuses
            applyStyleBonuses(c, this._settings);
        }
    }

    // Combo Input + Action Commands init
    async initComboSystem(db) {
        if (this._settings?.enable_combo_input) {
            for (const c of Object.values(this.combatants)) {
                c._comboArts = await loadComboArts(db, c.classId, c.level || 1);
                c._currentAp = c.maxAp || 6;
                c._maxAp = c.maxAp || 6;
                // Load discovered arts
                if (!c.isAI) {
                    try {
                        const [disc] = await db.query(
                            'SELECT art_id FROM character_discovered_arts WHERE character_id=?', [c.charId]);
                        c._discoveredArtIds = new Set(disc.map(r => r.art_id));
                    } catch { c._discoveredArtIds = new Set(); }
                }
            }
        }
        if (this._settings?.enable_action_commands) {
            this._actionCommands = await loadActionCommands(db);
        }
    }

    // Session 24: Load alignment + battle rules
    async initSession24(db) {
        // Alignment bonuses
        if (this._settings?.enable_alignment_system) {
            for (const c of Object.values(this.combatants)) {
                if (c.isAI) continue;
                try {
                    const [charRow] = await db.query('SELECT alignment FROM characters WHERE id=?', [c.charId]);
                    if (charRow.length) {
                        c.alignment = charRow[0].alignment || 0;
                        const tier = await getAlignmentTier(db, c.alignment);
                        if (tier) {
                            c._alignmentTier = tier;
                            applyAlignmentBonuses(c, tier, this._settings);
                        }
                    }
                } catch {}
            }
        }
        // Battle rules
        if (this._settings?.enable_battle_rules) {
            this._battleRules = await loadBattleRules(db, this);
        }
    }

    // Session 23: Load elemental reactions + status combos + threat init
    async initSession23(db) {
        // Elemental reactions
        if (this._settings?.enable_elemental_reactions) {
            try {
                const [rows] = await db.query('SELECT * FROM game_elemental_reactions WHERE active=1');
                this._elementReactions = rows.map(r => ({
                    element_a: r.element_a, element_b: r.element_b,
                    reaction_name: r.reaction_name, icon: r.icon,
                    damage_bonus: parseFloat(r.damage_bonus), aoe_radius: r.aoe_radius,
                    apply_status: r.apply_status, remove_elements: r.remove_elements,
                    battle_text: r.battle_text
                }));
            } catch { this._elementReactions = []; }
        }
        // Status combos
        if (this._settings?.enable_status_combos) {
            try {
                const [rows] = await db.query('SELECT * FROM game_status_combos WHERE active=1');
                this._statusCombos = rows;
            } catch { this._statusCombos = []; }
        }
        // Threat table
        if (this._settings?.enable_threat_system) {
            this._threatTable = {};
        }
        // Per-combatant element auras
        for (const c of Object.values(this.combatants)) {
            c._elementAuras = [];
            c._statusComboBonus = 0;
        }
    }

    // Sessions 17-22: Weather + combat state init
    async initCombatExtras(db) {
        // Weather
        if (this._settings?.enable_weather_effects && this.mapId) {
            this._weather = await loadWeather(db, this.mapId);
        }
        // Traps
        this._traps = {};
        // Per-combatant state
        for (const c of Object.values(this.combatants)) {
            c._isStealthed = false;
            c._transformed = null;
            c._linkCooldown = {};
        }
    }

    // Session 16: Load boss phases + win conditions
    async initBossPhases(db) {
        if (!this._settings?.enable_boss_phases) return;
        for (const c of Object.values(this.combatants)) {
            if (!c.isAI) continue;
            // Check if this NPC has boss phases
            try {
                const [npcRow] = await db.query('SELECT id FROM game_npcs WHERE char_id=?', [c.charId]);
                if (npcRow.length) {
                    const phases = await loadBossPhases(db, npcRow[0].id);
                    if (phases.length) {
                        c._bossPhases = phases;
                        c._currentPhase = 0;
                        c._isBoss = true;
                    }
                }
            } catch {}
        }
    }

    async initWinCondition(db, winConditionId) {
        if (!this._settings?.enable_custom_win_conditions) return;

        // Direct win condition from encounter
        if (winConditionId) {
            try {
                const [rows] = await db.query('SELECT * FROM game_win_conditions WHERE id=?', [winConditionId]);
                if (rows.length) {
                    this._winCondition = {
                        id: rows[0].id,
                        conditionType: rows[0].condition_type,
                        params: jp(rows[0].params, {}),
                        description: rows[0].description,
                        successText: rows[0].success_text,
                        failText: rows[0].fail_text,
                        icon: rows[0].icon
                    };
                }
            } catch {}
        }

        // Quest-injected win conditions — check if any active quest overrides this battle
        if (this.mapId) {
            try {
                // Get all human player char IDs in the battle
                const humanIds = Object.values(this.combatants)
                    .filter(c => !c.isAI).map(c => c.charId);
                for (const hId of humanIds) {
                    const [charRow] = await db.query('SELECT state_json FROM characters WHERE id=?', [hId]);
                    if (!charRow.length) continue;
                    const state = jp(charRow[0].state_json, {});
                    if (!state.quests?.active) continue;

                    // Check each active quest for battle overrides
                    for (const [qId] of Object.entries(state.quests.active)) {
                        const [overrides] = await db.query(
                            `SELECT qbo.*, wc.* FROM game_quest_battle_overrides qbo
                             JOIN game_win_conditions wc ON wc.id = qbo.win_condition_id
                             WHERE qbo.quest_id=? AND qbo.active=1
                             AND (qbo.map_id IS NULL OR qbo.map_id=?)`,
                            [qId, this.mapId]);
                        if (overrides.length) {
                            const ov = overrides[0];
                            // Override the win condition
                            this._winCondition = {
                                id: ov.win_condition_id,
                                conditionType: ov.condition_type,
                                params: jp(ov.params, {}),
                                description: ov.description,
                                successText: ov.success_text,
                                failText: ov.fail_text,
                                icon: ov.icon,
                                questId: qId
                            };
                            // Inject dynamic protect target if specified
                            if (ov.inject_protect_char_id && this._winCondition.conditionType === 'protect_npc') {
                                this._winCondition.params.protect_char_id = ov.inject_protect_char_id;
                            }
                            break; // first match wins
                        }
                    }
                    if (this._winCondition?.questId) break;
                }
            } catch {} // non-fatal
        }
    }

    // Session 15: Load spell slots for combatants
    async initSpellSlots(db) {
        if (!this._settings?.enable_spell_slots) return;
        for (const c of Object.values(this.combatants)) {
            if (c.isAI && !c._isCompanionAI) continue;
            try {
                const [row] = await db.query('SELECT spell_slots_json FROM characters WHERE id=?', [c.charId]);
                if (row.length && row[0].spell_slots_json) {
                    c._spellSlots = jp(row[0].spell_slots_json, null);
                }
                // If no slots saved, generate from the slot table
                if (!c._spellSlots) {
                    const [slotRows] = await db.query(
                        'SELECT slot_level, slot_count FROM game_spell_slot_table WHERE character_level<=? ORDER BY slot_level',
                        [c.level || 1]);
                    if (slotRows.length) {
                        c._spellSlots = {};
                        for (const sr of slotRows) {
                            if (!c._spellSlots[sr.slot_level] || sr.slot_count > c._spellSlots[sr.slot_level].max) {
                                c._spellSlots[sr.slot_level] = { max: sr.slot_count, current: sr.slot_count };
                            }
                        }
                    }
                }
            } catch { c._spellSlots = null; }
        }
    }

    // Session 10: Load bleed tier definitions + init ki channel state
    async initSession10(db) {
        if (this._settings?.enable_bleed_tiers) {
            this._bleedTiers = await loadBleedTiers(db);
        }
        for (const c of Object.values(this.combatants)) {
            c._kiChanneled = null;
            c._kiChannelUsed = 0;
            c._bleeds = [];
        }
    }

    // Initialize limb HP for all combatants. Must be called after initSettings.
    async initLimbSystem(db) {
        if (!this._settings?.enable_limb_targeting) return;

        // Cache body type zones to avoid repeated queries
        const zoneCache = {};

        for (const c of Object.values(this.combatants)) {
            const btId = c.bodyTypeId || 1;
            if (!zoneCache[btId]) {
                zoneCache[btId] = await loadLimbZones(db, btId);
            }
            const zones = zoneCache[btId];

            // Amorphous (single 'core' zone) effectively has no limb targeting
            if (zones.length <= 1 && zones[0]?.key === 'core') {
                c._limbHp = null;
                c._limbZones = null;
                c._woundLevels = null;
            } else {
                c._limbZones = zones;
                c._limbHp = initLimbHp(c.maxHp, zones);
                c._woundLevels = getAllWoundLevels(c._limbHp, this._settings);
            }

            // Session 8 per-combatant state
            c._knockedOut = false;
            c._nonLethal = false;
            c._lastAttackUsed = null;
            c._diminishingReturns = 0;
        }
    }

    // ── Map index helpers ────────────────────────────────────────
    registerOnMap(mapId, x, y) {
        this.mapId = parseInt(mapId);
        this.mapX  = x;
        this.mapY  = y;
        if (!battlesByMap[this.mapId]) battlesByMap[this.mapId] = new Set();
        battlesByMap[this.mapId].add(this.id);
    }

    unregisterFromMap() {
        if (this.mapId && battlesByMap[this.mapId]) {
            battlesByMap[this.mapId].delete(this.id);
            if (battlesByMap[this.mapId].size === 0) delete battlesByMap[this.mapId];
        }
    }

    // ── Add combatant mid-battle ─────────────────────────────────
    addCombatant(stats, teamId = 'players', isAI = false) {
        this.combatants[stats.charId] = { ...stats, isAI, teamId };
        if (!this.teams[teamId]) this.teams[teamId] = [];
        this.teams[teamId].push(stats.charId);
        this._hasMoved[stats.charId] = true; // can't move on the turn they join
        // Assign grid position based on team spawn corner
        const spawns = [
            { col: 1, row: 0 },
            { col: this.GRID_W - 2, row: 0 },
            { col: Math.floor(this.GRID_W / 2), row: 0 },
            { col: Math.floor(this.GRID_W / 2), row: this.GRID_H - 1 }
        ];
        const teamIdx = Object.keys(this.teams).indexOf(teamId);
        const spawn = spawns[teamIdx >= 0 ? teamIdx % spawns.length : 0];
        let placed = false;
        for (let y = 0; y < this.GRID_H && !placed; y++) {
            const occupied = Object.values(this.combatants).some(
                c => c.gridX === spawn.col && c.gridY === y && c.currentHp > 0);
            const objBlocked = this.getObjectAt(spawn.col, y)?.blocking;
            if (!occupied && !objBlocked) {
                this.combatants[stats.charId].gridX = spawn.col;
                this.combatants[stats.charId].gridY = y;
                placed = true;
            }
        }
        if (!placed) {
            this.combatants[stats.charId].gridX = spawn.col;
            this.combatants[stats.charId].gridY = 0;
        }
        // Rebuild turn queue to include the new combatant
        this._rebuildTurnQueue();

        // Session 8: init limb state for the new combatant
        const c = this.combatants[stats.charId];
        c._knockedOut = false;
        c._nonLethal = false;
        c._lastAttackUsed = null;
        c._diminishingReturns = 0;
        // Limb init is done by caller after addCombatant (needs async DB call)

        this.addLog({ actor: 'system', text: `${stats.name} joins the battle!` });
    }

    // ── Turn queue ─────────────────────────────────────────────────
    _rebuildTurnQueue() {
        const all = Object.values(this.combatants)
            .sort((a, b) => (b.speed + b.luck * 0.1) - (a.speed + a.luck * 0.1));
        this.turnQueue = all.map(c => c.charId);
    }

    nextTurn() {
        // Advance through the speed-sorted queue, skipping dead/KO'd combatants
        const max = this.turnQueue.length * 2;
        for (let i = 1; i <= max; i++) {
            const idx = (this.turnQueueIdx + i) % this.turnQueue.length;
            const c   = this.combatants[this.turnQueue[idx]];
            if (c && c.currentHp > 0 && !c._knockedOut) {
                this.turnQueueIdx = idx;
                this.turnCharId   = this.turnQueue[idx];
                this.turnNumber++;
                // Reset movement for the new actor
                this.resetMoveForTurn(this.turnCharId);
                return;
            }
        }
        // All dead — shouldn't reach here but failsafe
        this.status = 'FINISHED';
    }

    // ── Team helpers ───────────────────────────────────────────────
    getTeamId(charId)  { return this.combatants[charId]?.teamId; }

    // Returns ALL living enemies across all opposing teams (N-team aware)
    getEnemyTeam(charId) {
        const myTeam = this.getTeamId(charId);
        return Object.values(this.combatants)
            .filter(c => c.teamId !== myTeam && c.currentHp > 0 && !c._knockedOut);
    }

    getAllyTeam(charId) {
        const myTeam = this.getTeamId(charId);
        return Object.values(this.combatants)
            .filter(c => c.teamId === myTeam && c.charId !== charId && c.currentHp > 0 && !c._knockedOut);
    }

    // Backward-compatible single-target accessor — picks lowest HP enemy
    getOpponent(charId) {
        const enemies = this.getEnemyTeam(charId);
        if (!enemies.length) return null;
        return enemies.reduce((a, b) => a.currentHp < b.currentHp ? a : b);
    }

    // Get all team IDs
    getTeamIds() { return Object.keys(this.teams); }

    // ── Switch a combatant to a different team (diplomacy / alliance shift) ──
    switchTeam(charId, newTeamId) {
        const c = this.combatants[charId];
        if (!c) return false;
        const oldTeamId = c.teamId;
        if (oldTeamId === newTeamId) return false;
        // Remove from old team
        if (this.teams[oldTeamId]) {
            this.teams[oldTeamId] = this.teams[oldTeamId].filter(id => id !== charId);
            if (this.teams[oldTeamId].length === 0) delete this.teams[oldTeamId];
        }
        // Add to new team
        if (!this.teams[newTeamId]) this.teams[newTeamId] = [];
        this.teams[newTeamId].push(charId);
        c.teamId = newTeamId;
        this.addLog({ actor: 'system', text: `⚔️→🤝 ${c.name} switches to ${newTeamId}!` });
        return true;
    }

    getCombatant(charId) { return this.combatants[charId]; }

    addLog(entry) {
        this.log.push({ turn: this.turnNumber, time: Date.now(), ...entry });
    }

    // ── Grid positioning ──────────────────────────────────────────
    // TEACHING: We use a configurable grid (default 8×5). Columns 0-2 are
    // player side, right side is enemy side. Row 2 is center.
    // Chebyshev distance: diagonals count as 1 (like a chess king).
    // Grid dimensions are read from game_settings at battle creation time
    // and stored here. Change them in AdminSauce → Settings → Gameplay.
    GRID_W = 8;
    GRID_H = 5;

    _assignGridPositions() {
        const teamIds = Object.keys(this.teams);
        // Spawn positions for up to 4 teams: left, right, top, bottom
        // Each spawn is { col, rowCenter, spread:'vertical'|'horizontal' }
        const spawns = [
            { col: 1,                row: Math.floor(this.GRID_H / 2), spread: 'v' },  // left
            { col: this.GRID_W - 2,  row: Math.floor(this.GRID_H / 2), spread: 'v' },  // right
            { col: Math.floor(this.GRID_W / 2), row: 0,                spread: 'h' },   // top
            { col: Math.floor(this.GRID_W / 2), row: this.GRID_H - 1,  spread: 'h' },  // bottom
        ];

        teamIds.forEach((teamId, teamIdx) => {
            const members = (this.teams[teamId] || []).map(id => this.combatants[id]).filter(Boolean);
            const spawn = spawns[teamIdx % spawns.length];
            members.forEach((m, i) => {
                if (spawn.spread === 'v') {
                    const row = spawn.row + (i % 2 === 0 ? Math.floor(i/2) : -Math.ceil(i/2));
                    m.gridX = spawn.col;
                    m.gridY = Math.max(0, Math.min(this.GRID_H - 1, row));
                } else {
                    const col = spawn.col + (i % 2 === 0 ? Math.floor(i/2) : -Math.ceil(i/2));
                    m.gridX = Math.max(0, Math.min(this.GRID_W - 1, col));
                    m.gridY = spawn.row;
                }
            });
        });
    }

    // ── Battle Object presets ─────────────────────────────────────
    // TEACHING: Each preset defines HP, an icon, whether it blocks movement,
    // and what happens when it's destroyed. Destruction effects can deal AoE
    // damage, change terrain, or remove cover. This is the BG3-style
    // "shoot the barrel" gameplay.
    static OBJECT_PRESETS = {
        barrel:      { hp: 20, icon: '🛢️', label: 'Oil Barrel',   blocking: true,  coverValue: 0,
                       onDestroy: { type: 'fire_aoe', radius: 1, damage: 15, terrain: 'fire',
                                    message: '💥 The barrel explodes in a burst of flame!' } },
        crate:       { hp: 30, icon: '📦', label: 'Crate',         blocking: true,  coverValue: 30,
                       onDestroy: { type: 'remove_cover',
                                    message: '📦 The crate shatters!' } },
        chandelier:  { hp: 15, icon: '🕯️', label: 'Chandelier',   blocking: false, coverValue: 0,
                       onDestroy: { type: 'crush', damage: 30,
                                    message: '💥 The chandelier crashes down!' } },
        pot:         { hp: 10, icon: '🏺', label: 'Pot',           blocking: true,  coverValue: 10,
                       onDestroy: { type: 'remove_cover',
                                    message: '🏺 The pot shatters!' } },
        torch:       { hp: 12, icon: '🔥', label: 'Torch Stand',   blocking: true,  coverValue: 0,
                       onDestroy: { type: 'fire_aoe', radius: 0, damage: 10, terrain: 'fire',
                                    message: '🔥 The torch topples and ignites the ground!' } },
    };

    // Load map objects into the battle grid.
    // Called at battle creation time. Filters to objects within grid bounds
    // and that match known presets.
    loadObjects(mapObjects) {
        if (!mapObjects || !Array.isArray(mapObjects)) return;
        for (const obj of mapObjects) {
            const presetKey = (obj.preset || '').toLowerCase();
            const preset = BattleState.OBJECT_PRESETS[presetKey];
            if (!preset) continue;
            // Only load objects within grid bounds
            if (obj.x < 0 || obj.x >= this.GRID_W || obj.y < 0 || obj.y >= this.GRID_H) continue;
            const key = `${obj.x},${obj.y}`;
            // Don't place objects on occupied tiles (combatant starting positions)
            const occupied = Object.values(this.combatants).some(
                c => c.gridX === obj.x && c.gridY === obj.y);
            if (occupied) continue;

            // Admin overrides from map object editor (battle_hp, battle_destroy_type, etc.)
            const hp = obj.battle_hp || preset.hp;
            let onDestroy = preset.onDestroy;
            if (obj.battle_destroy_type) {
                onDestroy = { type: obj.battle_destroy_type,
                    damage: obj.battle_destroy_damage || (preset.onDestroy?.damage || 0),
                    radius: obj.battle_destroy_radius || (preset.onDestroy?.radius || 0),
                    terrain: obj.battle_destroy_type === 'fire_aoe' ? 'fire' : undefined,
                    message: preset.onDestroy?.message || `${obj.label || preset.label} is destroyed!` };
            } else if (obj.battle_destroy_type === '') {
                onDestroy = null; // Explicitly disabled
            }

            this.battleObjects[key] = {
                x: obj.x, y: obj.y,
                preset: presetKey,
                icon: obj.icon || preset.icon,
                label: obj.label || preset.label,
                maxHp: hp,
                currentHp: hp,
                blocking: obj.blocking !== undefined ? obj.blocking : preset.blocking,
                coverValue: obj.battle_cover_value || preset.coverValue || 0,
                onDestroy,
                destroyed: false
            };
        }
    }

    // Damage an object at (x,y). Returns destruction result or null.
    damageObject(x, y, damage, battle) {
        const key = `${x},${y}`;
        const obj = this.battleObjects[key];
        if (!obj || obj.destroyed) return null;

        obj.currentHp = Math.max(0, obj.currentHp - damage);
        const result = { objectKey: key, label: obj.label, icon: obj.icon, damage,
                         currentHp: obj.currentHp, maxHp: obj.maxHp, destroyed: false,
                         effects: [] };

        if (obj.currentHp <= 0) {
            obj.destroyed = true;
            result.destroyed = true;

            const fx = obj.onDestroy;
            if (!fx) return result;

            if (fx.type === 'fire_aoe') {
                // Set terrain to fire at this position
                if (fx.terrain) this.terrainMap[key] = fx.terrain;
                // AoE damage to combatants within radius
                const aoeTargets = Object.values(this.combatants).filter(c =>
                    c.currentHp > 0 && BattleState.chebyshev(c, { gridX: x, gridY: y }) <= (fx.radius || 0));
                for (const t of aoeTargets) {
                    t.currentHp = Math.max(0, t.currentHp - (fx.damage || 0));
                    result.effects.push({ type: 'fire_aoe', target: t.name, charId: t.charId,
                                          damage: fx.damage || 0 });
                    // Set fire terrain on their tile too if within radius
                    if (fx.terrain && fx.radius >= 1) {
                        this.terrainMap[`${t.gridX},${t.gridY}`] = fx.terrain;
                    }
                }
                // Also set fire on adjacent empty tiles within radius
                if (fx.radius >= 1 && fx.terrain) {
                    for (let dx = -fx.radius; dx <= fx.radius; dx++) {
                        for (let dy = -fx.radius; dy <= fx.radius; dy++) {
                            const tx = x + dx, ty = y + dy;
                            if (tx >= 0 && tx < this.GRID_W && ty >= 0 && ty < this.GRID_H) {
                                const tk = `${tx},${ty}`;
                                if ((this.terrainMap[tk] || 'open') !== 'water') {
                                    this.terrainMap[tk] = fx.terrain;
                                }
                            }
                        }
                    }
                }
            } else if (fx.type === 'crush') {
                // Damage to whoever is standing on this exact tile
                const crushed = Object.values(this.combatants).filter(c =>
                    c.currentHp > 0 && c.gridX === x && c.gridY === y);
                for (const t of crushed) {
                    t.currentHp = Math.max(0, t.currentHp - (fx.damage || 0));
                    result.effects.push({ type: 'crush', target: t.name, charId: t.charId,
                                          damage: fx.damage || 0 });
                }
            }
            // remove_cover: nothing extra needed — the object is just gone
        }
        return result;
    }

    // Get object at position (for targeting, cover checks)
    getObjectAt(x, y) {
        const obj = this.battleObjects[`${x},${y}`];
        return (obj && !obj.destroyed) ? obj : null;
    }

    // ── Terrain helpers ───────────────────────────────────────────
    // Load terrain from the map's TERRAIN events (collisions_json).
    // Called at battle creation time when we know the mapId.
    loadTerrain(events) {
        this.terrainMap = {};
        for (const ev of (events || [])) {
            if (ev.type === 'TERRAIN' && ev.terrain) {
                this.terrainMap[`${ev.x},${ev.y}`] = ev.terrain;
            }
        }
    }

    getTerrainAt(x, y) {
        return this.terrainMap[`${x},${y}`] || 'open';
    }

    // TEACHING: Flanking — you're flanking if you attack from BEHIND the
    // target (i.e. your gridX is ≥ target's gridX for enemies, or ≤ for players)
    // and you're adjacent (Chebyshev dist = 1). This gives a crit chance bonus.
    isFlanking(actorId, targetId) {
        const a = this.combatants[actorId];
        const t = this.combatants[targetId];
        if (!a || !t || a.gridX === undefined) return false;
        const dist = BattleState.chebyshev(a, t);
        if (dist > 1) return false; // must be adjacent
        // Flanking: attacker is on the SAME side as target faces away from
        // Players face right (enemies are to their right). Enemies face left.
        // A player flanks an enemy by being at gridX > enemy.gridX (behind them).
        // An enemy flanks a player by being at gridX < player.gridX.
        if (a.teamId === 'players' && a.gridX > t.gridX) return true;
        if (a.teamId === 'enemies' && a.gridX < t.gridX) return true;
        return false;
    }

    // Returns an object of active terrain modifiers for a damage calculation.
    // All values are multipliers or booleans — consumed by resolveDamage.
    getTerrainModifiers(actorId, targetId) {
        const a = this.combatants[actorId];
        const t = this.combatants[targetId];
        if (!a || !t || a.gridX === undefined) return {};

        const actorTerrain  = this.getTerrainAt(a.gridX, a.gridY);
        const targetTerrain = this.getTerrainAt(t.gridX, t.gridY);

        const mods = {
            damageBonus:     1.0,   // multiplied into final damage
            coverReduction:  0,     // flat % damage reduction for the defender
            critBonus:       0,     // added to crit chance
            rangeBonus:      0,     // added to skill range
            flanking:        false,
            terrainNotes:    []
        };

        // HIGH GROUND — attacker on high_ground gets +1 range and +15% damage
        if (actorTerrain === 'high_ground') {
            mods.damageBonus  *= 1.15;
            mods.rangeBonus   += 1;
            mods.terrainNotes.push('⛰️ High ground! (+15% dmg, +1 range)');
        }

        // FOREST — defender in forest gets 20% cover damage reduction
        if (targetTerrain === 'forest') {
            mods.coverReduction += 20;
            mods.terrainNotes.push('🌲 Forest cover! (-20% dmg)');
        }

        // COVER — solid cover object tile: 30% damage reduction
        if (targetTerrain === 'cover') {
            mods.coverReduction += 30;
            mods.terrainNotes.push('🧱 Cover! (-30% dmg)');
        }

        // WATER — attacker in water gets -10% damage (slowed)
        if (actorTerrain === 'water') {
            mods.damageBonus  *= 0.9;
            mods.terrainNotes.push('🌊 Wading through water (-10% dmg)');
        }

        // FLANKING — adjacent + behind: +20% crit chance, +1 extra crit multiplier
        if (this.isFlanking(actorId, targetId)) {
            mods.flanking   = true;
            mods.critBonus += 20;
            mods.terrainNotes.push('🗡️ Flanking! (+20% crit chance)');
        }

        // OBJECT COVER — if the target is adjacent to a non-destroyed object
        // with coverValue > 0, they get damage reduction from it.
        if (this.battleObjects) {
            for (const obj of Object.values(this.battleObjects)) {
                if (obj.destroyed || !obj.coverValue) continue;
                if (BattleState.chebyshev(t, { gridX: obj.x, gridY: obj.y }) <= 1) {
                    mods.coverReduction += obj.coverValue;
                    mods.terrainNotes.push(`${obj.icon} ${obj.label} cover! (-${obj.coverValue}% dmg)`);
                    break; // only best cover applies
                }
            }
        }

        // PRONE status on target — melee bonus, ranged penalty
        if (t.statuses?.Prone) {
            const dist = BattleState.chebyshev(a, t);
            if (dist <= 1) {
                mods.damageBonus  *= 1.25;
                mods.terrainNotes.push('⬇️ Target is Prone! (melee +25%)');
            } else {
                mods.coverReduction += 15;
                mods.terrainNotes.push('⬇️ Target is Prone (ranged -15%)');
            }
        }

        return mods;
    }

    static chebyshev(a, b) {
        return Math.max(Math.abs(a.gridX - b.gridX), Math.abs(a.gridY - b.gridY));
    }

    // Move a combatant to (x,y). Returns error string or null on success.
    moveCombatant(charId, x, y) {
        const actor = this.combatants[charId];
        if (!actor) return 'Combatant not found.';
        if (this._hasMoved[charId]) return 'Already moved this turn.';
        // ROOTED status prevents movement
        if (actor.statuses?.Rooted) return `${actor.name} is Rooted and cannot move!`;
        // Session 8: Wound-based movement restrictions
        if (actor._woundFlags?.cant_move) return `${actor.name}'s legs are disabled — cannot move!`;
        if (x < 0 || x >= this.GRID_W || y < 0 || y >= this.GRID_H) return 'Out of bounds.';
        // Check tile not occupied by combatant
        const occupied = Object.values(this.combatants).find(
            c => c.charId !== charId && c.currentHp > 0 && c.gridX === x && c.gridY === y
        );
        if (occupied) return `${occupied.name} is already there.`;
        // Check tile not blocked by an object
        const blockObj = this.getObjectAt(x, y);
        if (blockObj && blockObj.blocking) return `${blockObj.label} is in the way.`;
        // Check move range: speed/30 tiles, min 2, apply wound modifier
        let moveRange = Math.max(2, Math.floor((actor.speed || 10) / 30));
        if (actor._woundFlags?.move_range_mod) {
            moveRange = Math.max(0, moveRange + actor._woundFlags.move_range_mod);
        }
        if (moveRange <= 0) return `${actor.name} is too wounded to move!`;
        const dist = BattleState.chebyshev(actor, { gridX: x, gridY: y });
        if (dist > moveRange) return `Too far. Move range: ${moveRange} tile(s).`;
        actor.gridX = x;
        actor.gridY = y;
        this._hasMoved[charId] = true;
        return null;
    }

    resetMoveForTurn(charId) {
        this._hasMoved[charId] = false;
    }

    // ── Range check ────────────────────────────────────────────────
    // TEACHING: Skills declare `range` in their effects JSON.
    //   range: 1  = melee (default — must be adjacent)
    //   range: 3  = short magic / thrown
    //   range: 6  = bow / long-range
    //   range: 99 = global (no range check)
    // If no range specified, default to 1 (melee) for damage skills.
    isInRange(actorId, targetId, skillRange) {
        const a = this.combatants[actorId];
        const b = this.combatants[targetId];
        if (!a || !b) return false;
        if (a.gridX === undefined || b.gridX === undefined) return true; // no grid — always in range
        const dist = BattleState.chebyshev(a, b);
        return dist <= (skillRange || 1);
    }

    // ── Grid snapshot for clients ──────────────────────────────────
    getGridState() {
        return {
            width:  this.GRID_W,
            height: this.GRID_H,
            tokens: Object.values(this.combatants).map(c => ({
                charId: c.charId, name: c.name, teamId: c.teamId,
                gridX: c.gridX, gridY: c.gridY,
                dead: c.currentHp <= 0 && !c._knockedOut,
                knockedOut: c._knockedOut || false,
                hp: c.currentHp, maxHp: c.maxHp
            })),
            objects: Object.values(this.battleObjects || {}).map(o => ({
                x: o.x, y: o.y,
                preset: o.preset, icon: o.icon, label: o.label,
                hp: o.currentHp, maxHp: o.maxHp,
                destroyed: o.destroyed, blocking: o.blocking,
                coverValue: o.coverValue || 0
            }))
        };
    }

    // ── Win condition (N-team aware: last team standing) ──────────
    checkWinCondition() {
        // Session 8: KO'd combatants count as out for win-condition purposes
        const aliveTeams = Object.entries(this.teams)
            .filter(([_, ids]) => ids.some(id => {
                const c = this.combatants[id];
                return c && c.currentHp > 0 && !c._knockedOut;
            }))
            .map(([teamId]) => teamId);

        if (aliveTeams.length <= 1) {
            this.status = 'FINISHED';
            if (aliveTeams.length === 1) {
                const winTeamId = aliveTeams[0];
                const winMembers = this.teams[winTeamId].filter(id => this.combatants[id]?.currentHp > 0);
                this.winner = winMembers[0] || this.teams[winTeamId][0];
                this.winnerTeamId = winTeamId;
            } else {
                // All dead — draw
                this.winner = null;
                this.winnerTeamId = null;
            }
        }
    }

    // ── Turn-order preview for the UI ──────────────────────────────
    // Returns the next `count` actors in queue order (living only)
    getTurnOrder(count = 5) {
        const result = [];
        let idx = this.turnQueueIdx;
        for (let i = 0; result.length < count && i < this.turnQueue.length * 2; i++) {
            const cid = this.turnQueue[idx % this.turnQueue.length];
            const c   = this.combatants[cid];
            if (c && c.currentHp > 0 && !c._knockedOut) {
                result.push({
                    charId: c.charId, name: c.name, teamId: c.teamId,
                    isAI: c.isAI, isCurrent: i === 0
                });
            }
            idx++;
        }
        return result;
    }

    // ── Snapshot helpers ───────────────────────────────────────────
    _snap(c) {
        if (!c) return null;
        const snap = {
            charId: c.charId, name: c.name,
            hp: c.currentHp, maxHp: c.maxHp,
            mp: c.currentMp, maxMp: c.maxMp,
            statuses: c.statuses, limitbreak: c.limitbreak,
            stance: c._stance || null, isAI: c.isAI, teamId: c.teamId,
            dead: c.currentHp <= 0,
            // Session 8
            knockedOut: c._knockedOut || false,
            nonLethal: c._nonLethal || false,
            prone: c._woundFlags?.prone || false,
            woundFlags: c._woundFlags ? {
                cantFlee: c._woundFlags.cant_flee,
                cantMove: c._woundFlags.cant_move,
                cantUseItems: c._woundFlags.cant_use_items,
                cantDualWield: c._woundFlags.cant_dual_wield,
                moveRangeMod: c._woundFlags.move_range_mod,
            } : null,
            defaultDefense: c._defaultDefense || 'block',
            // Session 10
            kiChanneled: c._kiChanneled ? { turnsLeft: c._kiChanneled.turnsLeft } : null,
            bleeds: (c._bleeds || []).map(b => ({ tier: b.tier, turnsLeft: b.turnsLeft, icon: b.icon, label: b.label })),
            // Session 12: RP effects
            taunted: c._taunted ? { by: c._taunted.by, turnsLeft: c._taunted.turnsLeft } : null,
            intimidated: c._intimidated ? { turnsLeft: c._intimidated.turnsLeft } : null,
            rallied: c._rallied ? { turnsLeft: c._rallied.turnsLeft, atkBonus: c._rallied.atkBonus } : null,
            tauntBonus: c._tauntBonus ? { turnsLeft: c._tauntBonus.turnsLeft } : null,
            // Combo/Action
            currentAp: c._currentAp ?? null,
            maxAp: c._maxAp ?? null,
            discoveredArts: c._discoveredArtIds ? c._discoveredArtIds.size : 0,
            // Session 24
            alignment: c.alignment || 0,
            alignmentTier: c._alignmentTier ? { name: c._alignmentTier.label, icon: c._alignmentTier.icon, color: c._alignmentTier.color } : null,
            // Sessions 17-22
            isStealthed: c._isStealthed || false,
            transformed: c._transformed ? { name: c._transformed.name, icon: c._transformed.icon, turnsLeft: c._transformed.turnsLeft, visual: c._transformed.visual } : null,
            // Session 16
            isBoss: c._isBoss || false,
            currentPhase: c._currentPhase || 0,
            bossPhaseCount: c._bossPhases?.length || 0,
            // Session 15
            spellSlots: c._spellSlots || null,
            isSummon: c._isSummon || false,
            summonTurnsLeft: c._summonTurnsLeft || null,
            summonedBy: c._summonedBy || null,
            // Session 13
            fightingStyle: c._fightingStyle ? {
                styleName: c._fightingStyle.styleLabel, styleIcon: c._fightingStyle.styleIcon,
                rank: c._fightingStyle.rank, rankLabel: c._fightingStyle.rankLabel,
                styleType: c._fightingStyle.styleType
            } : null,
        };
        // Include limb data if system is active
        if (c._limbHp && this._settings?.enable_limb_targeting) {
            snap.limbHp = c._limbHp;
            snap.woundLevels = c._woundLevels || {};
            snap.bodyTypeId = c.bodyTypeId || 1;
            snap.limbZones = (c._limbZones || []).map(z => ({
                key: z.key, label: z.label, icon: z.icon, sortOrder: z.sortOrder
            }));
        }
        return snap;
    }

    _mySnap(c) {
        if (!c) return null;
        return {
            ...this._snap(c),
            breaklevel: c.breaklevel,
            charging: c._charging
                ? { skillId: c._charging.skillId, turnsLeft: c._charging.turnsLeft, skillName: c._charging.skillName }
                : null
        };
    }

    // ── Client state ───────────────────────────────────────────────
    toClientState(forCharId) {
        const turnOrder  = this.getTurnOrder(6);

        // Multi-team: build allTeams map
        const allTeams = {};
        for (const [teamId, ids] of Object.entries(this.teams)) {
            allTeams[teamId] = ids.map(id => this._snap(this.combatants[id]));
        }

        // Backward compat: playerTeam/enemyTeam for 2-team battles
        const teamIds = Object.keys(this.teams);
        const myTeamId = forCharId ? this.getTeamId(forCharId) : teamIds[0];
        const playerTeam = allTeams[myTeamId] || allTeams[teamIds[0]] || [];
        // enemyTeam = all non-ally teams flattened (for legacy UI)
        const enemyTeam = teamIds
            .filter(t => t !== myTeamId)
            .flatMap(t => allTeams[t] || []);

        const base = {
            battleId: this.id, turn: this.turnNumber,
            isMyTurn: this.turnCharId === forCharId,
            turnCharId: this.turnCharId,
            turnOrder,
            playerTeam, enemyTeam,
            allTeams,
            myTeamId: myTeamId || null,
            teamCount: teamIds.length,
            grid: this.getGridState(),
            terrainMap: this.terrainMap || {},
            hasMoved: forCharId ? !!this._hasMoved[forCharId] : false,
            moveRange: (() => {
                if (!forCharId || !this.combatants[forCharId]) return 2;
                const mc = this.combatants[forCharId];
                let range = Math.max(2, Math.floor((mc.speed || 10) / 30));
                if (mc._woundFlags?.move_range_mod) range = Math.max(0, range + mc._woundFlags.move_range_mod);
                if (mc._woundFlags?.cant_move) range = 0;
                return range;
            })(),
            status: this.status, winner: this.winner,
            winnerTeamId: this.winnerTeamId || null,
            log: this.log.slice(-10)
        };

        // Session 17: Weather
        if (this._weather) {
            base.weather = {
                name: this._weather.name, label: this._weather.label,
                icon: this._weather.icon, visibility: this._weather.visibility
            };
        }

        // Session 16: win condition info for display
        if (this._winCondition) {
            base.winCondition = {
                type: this._winCondition.conditionType,
                description: this._winCondition.description,
                icon: this._winCondition.icon,
                params: this._winCondition.params
            };
        }

        // Session 8: include battle settings so client knows which features are on
        if (this._settings) {
            base.settings = {
                enableLimbTargeting:      this._settings.enable_limb_targeting,
                enableActiveDefense:      this._settings.enable_active_defense,
                enableNonlethal:          this._settings.enable_nonlethal,
                enableDiminishingReturns: this._settings.enable_diminishing_returns,
                enableWoundDegradation:   this._settings.enable_wound_degradation,
                enableCalledShotPenalty:  this._settings.enable_called_shot_penalty,
                defensePromptTimeoutMs:   this._settings.defense_prompt_timeout_ms,
                // Session 9
                enableFlavorText:        this._settings.enable_flavor_text,
                enableComboProcs:        this._settings.enable_combo_procs,
                enableKiChanneling:      this._settings.enable_ki_channeling,
                enableBleedTiers:        this._settings.enable_bleed_tiers,
                // Session 12
                enableBossPhases:        this._settings.enable_boss_phases,
                enableCustomWinConditions: this._settings.enable_custom_win_conditions,
                enableSummons:           this._settings.enable_summons,
                enableSpellSlots:        this._settings.enable_spell_slots,
                summonCostType:          this._settings.summon_cost_type,
                enableFightingStyles:    this._settings.enable_fighting_styles,
                // Session 23
                // Session 24
                enableComboInput:        this._settings.enable_combo_input,
                enableActionCommands:    this._settings.enable_action_commands,
                enableAlignmentSystem:   this._settings.enable_alignment_system,
                enableBattleRules:       this._settings.enable_battle_rules,
                enableElementalReactions: this._settings.enable_elemental_reactions,
                enableThreatSystem:      this._settings.enable_threat_system,
                enableStatusCombos:      this._settings.enable_status_combos,
                enableEquipSwap:         this._settings.enable_battle_equip_swap,
                enableAfterlife:         this._settings.enable_afterlife,
                aiDifficulty:            this._settings.ai_difficulty,
                initiativeType:          this._settings.initiative_type,
                enableRpDescriptions:    this._settings.enable_rp_descriptions,
                enableBattleNarration:   this._settings.enable_battle_narration,
                enableRpCommands:        this._settings.enable_rp_commands,
                enableSignatureTechs:    this._settings.enable_signature_techs,
            };
        }

        // me / opponent for backward compat with 1v1 render path
        const me  = forCharId ? this.combatants[forCharId] : null;
        const opp = me ? this.getOpponent(forCharId) : null;
        if (me) {
            base.me       = this._mySnap(me);
            base.opponent = this._snap(opp);
        }
        return base;
    }
}

// =================================================================
// ENEMY SCALING — Scale enemy stats based on party size
// =================================================================
// Formula: stat * (1 + (partySize - 1) * scalingFactor)
// Default factor 0.3: solo=1x, duo=1.3x, trio=1.6x, quad=1.9x
// Scaling applies to: maxHp, currentHp, atk, def, mo, md, speed
// Does NOT scale: level, luck, limitbreak, experience (those affect rewards)
function applyEnemyScaling(enemyStats, playerCount, scalingFactor = 0.3) {
    if (playerCount <= 1 || scalingFactor <= 0) return enemyStats;
    const mult = 1 + (playerCount - 1) * scalingFactor;
    const scaled = { ...enemyStats };
    scaled.maxHp     = Math.round(scaled.maxHp * mult);
    scaled.currentHp = Math.round(scaled.currentHp * mult);
    scaled.atk       = Math.round(scaled.atk * mult);
    scaled.def       = Math.round(scaled.def * mult);
    scaled.mo        = Math.round(scaled.mo * mult);
    scaled.md        = Math.round(scaled.md * mult);
    scaled.speed     = Math.round(scaled.speed * (1 + (playerCount - 1) * scalingFactor * 0.3)); // speed scales less
    return scaled;
}

async function getScalingFactor(db, mapId) {
    // Check spawn zone scaling for this map, fall back to global setting
    try {
        const [zones] = await db.query(
            'SELECT scaling_factor FROM game_map_spawns WHERE map_id=? AND enabled=1 AND scaling_factor > 0 LIMIT 1',
            [mapId]);
        if (zones.length) return parseFloat(zones[0].scaling_factor) || 0.3;
    } catch {}
    try {
        const [rows] = await db.query(
            "SELECT setting_value FROM system_settings WHERE setting_key='enemy_scaling_factor' LIMIT 1");
        if (rows.length) return parseFloat(rows[0].setting_value) || 0.3;
    } catch {}
    return 0.3;
}

// =================================================================
// NPC NEGOTIATION WILLINGNESS (Session 6)
// =================================================================
// Returns 0-100 willingness score. Higher = more likely to switch sides.
// Factors: HP% (low HP = desperate), personality keywords in persona,
// and an optional reputation value.
function calculateNpcWillingness(npc, reputation = 0) {
    let willingness = 0;
    // HP factor: below 50% starts adding willingness, below 20% = very willing
    const hpPct = npc.maxHp > 0 ? (npc.currentHp / npc.maxHp) : 1;
    if (hpPct < 0.20) willingness += 50;
    else if (hpPct < 0.35) willingness += 35;
    else if (hpPct < 0.50) willingness += 20;
    else willingness += 5;

    // Personality keywords from persona (if available)
    const persona = (npc._persona || '').toLowerCase();
    if (persona.includes('coward') || persona.includes('mercenary') || persona.includes('opportunist'))
        willingness += 25;
    if (persona.includes('loyal') || persona.includes('fanatic') || persona.includes('zealot'))
        willingness -= 30;
    if (persona.includes('pragmatic') || persona.includes('survivor'))
        willingness += 15;

    // Reputation bonus (0-100 scale, higher = friendlier)
    willingness += Math.floor(reputation * 0.2);

    // Random variance ±10
    willingness += Math.floor(Math.random() * 21) - 10;

    return Math.max(0, Math.min(100, willingness));
}

// =================================================================
// BATTLE MANAGER — Create, Run, End battles
// =================================================================
const BattleManager = {

    // --- CREATE BATTLE (1v1 PvP or 1v1 PvE) ---
    // TEACHING: This is the original path for 1v1. It still works exactly
    // as before. The new createPartyBattle() below handles multi-combatant.
    createBattle: async (db, io, p1Socket, p2Socket, p1CharId, p2CharId, type = 'PVP') => {
        const p1Stats = await getEffectiveStats(db, p1CharId);
        let p2Stats = await getEffectiveStats(db, p2CharId);
        if (!p1Stats || !p2Stats) return null;

        // Scale enemy stats in PvE based on party size
        // (1v1 PvE: playerCount=1, no scaling. Future party battles use createPartyBattle.)
        if (type === 'PVE') {
            // Check if the player is in a party — count online party members on same map
            let playerCount = 1;
            try {
                const [party] = await db.query(
                    `SELECT COUNT(*) as cnt FROM character_party_members pm
                     JOIN character_parties p ON p.id = pm.party_id
                     WHERE p.id = (SELECT party_id FROM character_party_members WHERE character_id = ? LIMIT 1)`,
                    [p1CharId]);
                if (party.length && party[0].cnt > 1) playerCount = party[0].cnt;
            } catch {}
            if (playerCount > 1) {
                const factor = await getScalingFactor(db, p1Stats.mapId || 0);
                p2Stats = applyEnemyScaling(p2Stats, playerCount, factor);
            }
        }

        const [res] = await db.query(
            `INSERT INTO game_battles (p1_char_id, p2_char_id, p1_user_id, p2_user_id, turn_char_id, status, battle_mode, access_token)
             VALUES (?,?,?,?,?,?,'1v1',?)`,
            [p1CharId, p2CharId, p1Stats.userId, p2Stats.userId,
             p1Stats.speed >= p2Stats.speed ? p1CharId : p2CharId, 'ACTIVE',
             crypto.randomBytes(16).toString('hex')]
        );
        const battleId = res.insertId;

        // 1v1 uses team arrays of one each
        // Read grid dimensions from settings (non-fatal — uses defaults on error)
        try {
            const [gw] = await db.query("SELECT value FROM game_settings WHERE `key`='battle_grid_w' LIMIT 1");
            const [gh] = await db.query("SELECT value FROM game_settings WHERE `key`='battle_grid_h' LIMIT 1");
            if (gw.length) p1Stats._gridW = parseInt(gw[0].value) || 8;
            if (gh.length) p1Stats._gridH = parseInt(gh[0].value) || 5;
        } catch {}

        const battle = new BattleState(battleId,
            { players: [p1Stats], enemies: [p2Stats] }, type);
        if (p1Stats._gridW) battle.GRID_W = p1Stats._gridW;
        if (p1Stats._gridH) battle.GRID_H = p1Stats._gridH;
        activeBattles[battleId] = battle;
        battle._assignGridPositions(); // re-assign now that dimensions are set

        // Session 8: load feature flags + initialize limb system
        await battle.initSettings(db);
        await battle.initLimbSystem(db);
        await battle.initSession10(db);
        await battle.initFightingStyles(db);
        await battle.initSpellSlots(db);
        await battle.initBossPhases(db);
        await battle.initCombatExtras(db);
        await battle.initSession23(db);
        await battle.initSession24(db);
        await battle.initComboSystem(db);

        // Register battle location on the map for mid-battle join visibility
        try {
            const [posRows] = await db.query('SELECT map_id, x, y FROM characters WHERE id=?', [p1CharId]);
            if (posRows.length) battle.registerOnMap(posRows[0].map_id, posRows[0].x, posRows[0].y);
        } catch {}

        // Load terrain + objects from the map where the battle takes place
        try {
            const [mapPos] = await db.query(
                'SELECT map_id FROM characters WHERE id=? LIMIT 1', [p1CharId]);
            if (mapPos.length) {
                const mapId = mapPos[0].map_id;
                const [mapRow] = await db.query(
                    'SELECT collisions_json, objects_json FROM game_maps WHERE id=? LIMIT 1', [mapId]);
                if (mapRow.length) {
                    let events = [];
                    try { events = JSON.parse(mapRow[0].collisions_json || '[]'); } catch {}
                    battle.loadTerrain(events);
                    // Session 3: Load destructible objects into battle grid
                    let mapObjects = [];
                    try { mapObjects = JSON.parse(mapRow[0].objects_json || '[]'); } catch {}
                    battle.loadObjects(mapObjects);
                }
            }
        } catch {} // terrain + objects are non-fatal

        // Record participants (non-fatal — forward compat)
        try {
            await db.query(
                `INSERT IGNORE INTO game_battle_participants (battle_id,character_id,team,is_ai)
                 VALUES (?,?,1,0),(?,?,2,?)`,
                [battleId, p1CharId, battleId, p2CharId, type === 'PVE' ? 1 : 0]
            );
        } catch {}

        const p1Cmds = await getAvailableCommands(db, p1Stats);
        const p2Cmds = await getAvailableCommands(db, p2Stats);

        if (p1Socket) p1Socket.emit('battle_start', { ...battle.toClientState(p1CharId), commands: p1Cmds });
        if (p2Socket) p2Socket.emit('battle_start', { ...battle.toClientState(p2CharId), commands: p2Cmds });

        battle.addLog({ actor: 'system', text: `Battle begins! ${p1Stats.name} vs ${p2Stats.name}!` });

        if (type === 'PVE' && battle.turnCharId === p2CharId) {
            setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1500);
        }
        return battleId;
    },

    // --- CREATE PARTY BATTLE (N players vs M enemies) ---
    // TEACHING: Party PvE. playerCharIds = array of human char IDs already
    // in a party. enemyCharIds = NPC char_ids (from game_npcs.char_id).
    // socketMap = { charId -> socket } so we can notify each player.
    //
    // XP + gold are split evenly across the surviving player team at end.
    //
    // Turn order: all combatants speed-sorted. Players and enemies alternate
    // naturally based on speed — no artificial ping-pong.
    createPartyBattle: async (db, io, playerCharIds, enemyNpcIds, socketMap = {}, companionStats = []) => {
        // Resolve NPC ids → char_ids
        const enemyCharIds = [];
        const npcNames     = {};
        for (const npcId of enemyNpcIds) {
            const [rows] = await db.query(
                'SELECT char_id, name FROM game_npcs WHERE id=? AND is_enemy=1', [npcId]);
            if (!rows.length || !rows[0].char_id) continue;
            enemyCharIds.push(rows[0].char_id);
            npcNames[rows[0].char_id] = rows[0].name;
        }
        if (!enemyCharIds.length) return null;

        // Load stats for everyone
        const playerStats = (await Promise.all(playerCharIds.map(id => getEffectiveStats(db, id)))).filter(Boolean);
        let enemyStats  = (await Promise.all(enemyCharIds.map(id => getEffectiveStats(db, id)))).filter(Boolean);
        if (!playerStats.length || !enemyStats.length) return null;

        // Scale enemies based on total player-side count (players + companions)
        const totalPlayerSide = playerStats.length + companionStats.length;
        if (totalPlayerSide > 1) {
            const mapId = playerStats[0].mapId || 0;
            const factor = await getScalingFactor(db, mapId);
            enemyStats = enemyStats.map(es => applyEnemyScaling(es, totalPlayerSide, factor));
        }

        // Build combined player team: human players + companion AI allies
        const allPlayerTeam = [...playerStats];
        for (const cs of companionStats) {
            // Mark companions as AI-controlled allies on the player team
            allPlayerTeam.push({ ...cs, _isCompanionAI: true });
        }

        // Use first player + first enemy for the game_battles anchor row (backward compat)
        const firstPlayer = playerStats[0];
        const firstEnemy  = enemyStats[0];
        const accessToken = crypto.randomBytes(16).toString('hex');

        // Determine first turn by speed across all combatants
        const allCombatants = [...allPlayerTeam, ...enemyStats];
        const fastestCharId = allCombatants.sort((a,b) => b.speed - a.speed)[0].charId;

        const [res] = await db.query(
            `INSERT INTO game_battles (p1_char_id, p2_char_id, p1_user_id, p2_user_id,
              turn_char_id, status, battle_mode, access_token)
             VALUES (?,?,?,?,?,'ACTIVE','PARTY',?)`,
            [firstPlayer.charId, firstEnemy.charId, firstPlayer.userId,
             firstEnemy.userId || 0,
             fastestCharId,
             accessToken]
        );
        const battleId = res.insertId;

        // Use multi-team format so we can set per-member isAI flags
        const playerTeamMembers = allPlayerTeam.map(s => ({
            ...s,
            isAI: !!s._isCompanionAI
        }));
        const enemyTeamMembers = enemyStats.map(s => ({ ...s, isAI: true }));

        const battle = new BattleState(battleId,
            { team_1: playerTeamMembers, team_2: enemyTeamMembers }, 'PARTY_PVE');
        battle.accessToken  = accessToken;
        battle.enemyNpcIds  = [...enemyNpcIds];
        activeBattles[battleId] = battle;

        // Session 8: load feature flags + initialize limb system
        await battle.initSettings(db);
        await battle.initLimbSystem(db);
        await battle.initSession10(db);
        await battle.initFightingStyles(db);
        await battle.initSpellSlots(db);
        await battle.initBossPhases(db);
        await battle.initCombatExtras(db);
        await battle.initSession23(db);
        await battle.initSession24(db);
        await battle.initComboSystem(db);

        // Register battle location + load terrain & objects
        try {
            const [posRows] = await db.query('SELECT map_id, x, y FROM characters WHERE id=?', [firstPlayer.charId]);
            if (posRows.length) {
                battle.registerOnMap(posRows[0].map_id, posRows[0].x, posRows[0].y);
                const [mapRow] = await db.query(
                    'SELECT collisions_json, objects_json FROM game_maps WHERE id=? LIMIT 1', [posRows[0].map_id]);
                if (mapRow.length) {
                    let events = [];
                    try { events = JSON.parse(mapRow[0].collisions_json || '[]'); } catch {}
                    battle.loadTerrain(events);
                    let mapObjects = [];
                    try { mapObjects = JSON.parse(mapRow[0].objects_json || '[]'); } catch {}
                    battle.loadObjects(mapObjects);
                }
            }
        } catch {}

        // Record all participants (players + companions + enemies)
        try {
            const vals = [
                ...playerCharIds.map(id => [battleId, id, 1, 0]),
                ...companionStats.map(cs => [battleId, cs.charId, 1, 1]),  // companions are team 1, AI
                ...enemyCharIds.map(id  => [battleId, id, 2, 1])
            ];
            for (const v of vals) {
                await db.query(
                    'INSERT IGNORE INTO game_battle_participants (battle_id,character_id,team,is_ai) VALUES (?,?,?,?)',
                    v
                );
            }
        } catch {}

        // Send battle_start to every human player socket
        const names = [...allPlayerTeam, ...enemyStats].map(s => s.name).join(', ');
        battle.addLog({ actor: 'system', text: `Party battle begins! ${names}` });

        for (const ps of playerStats) {
            const sock = socketMap[ps.charId];
            if (!sock) continue;
            const cmds = await getAvailableCommands(db, ps);
            sock.emit('battle_start', { ...battle.toClientState(ps.charId), commands: cmds });
            sock.join('battle_' + battleId);
            sock._battleCharId = ps.charId;
        }

        // If first actor is AI, queue its turn
        const firstActor = battle.getCombatant(battle.turnCharId);
        if (firstActor && firstActor.isAI) {
            setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1500);
        }
        return battleId;
    },

    // --- CREATE FFA BATTLE (N teams, free-for-all or team FFA) ---
    // TEACHING: FFA supports 1v1v1, 2v2v2, or battle royale (everyone solo).
    // teams is an object: { team_1: [charId,...], team_2: [charId,...], ... }
    // socketMap = { charId -> socket }
    // aiTeams = array of team IDs that are AI-controlled
    createFFABattle: async (db, io, teams, socketMap = {}, aiTeams = []) => {
        // Load stats for everyone
        const allTeams = {};
        const allStats = [];
        for (const [teamId, charIds] of Object.entries(teams)) {
            const isAI = aiTeams.includes(teamId);
            const stats = (await Promise.all(charIds.map(id => getEffectiveStats(db, id)))).filter(Boolean);
            stats.forEach(s => { s.isAI = isAI; });
            allTeams[teamId] = stats;
            allStats.push(...stats);
        }
        if (allStats.length < 2) return null;

        // Create DB record
        const accessToken = crypto.randomBytes(16).toString('hex');
        const fastest = allStats.sort((a, b) => b.speed - a.speed)[0];
        const [res] = await db.query(
            `INSERT INTO game_battles (p1_char_id, p2_char_id, p1_user_id, p2_user_id,
              turn_char_id, status, battle_mode, access_token)
             VALUES (?,?,?,?,?,'ACTIVE','FFA',?)`,
            [allStats[0].charId, allStats[1].charId, allStats[0].userId || 0,
             allStats[1].userId || 0, fastest.charId, accessToken]
        );
        const battleId = res.insertId;

        const battle = new BattleState(battleId, allTeams, 'FFA');
        battle.accessToken = accessToken;
        activeBattles[battleId] = battle;

        // Session 8: load feature flags + initialize limb system
        await battle.initSettings(db);
        await battle.initLimbSystem(db);
        await battle.initSession10(db);
        await battle.initFightingStyles(db);
        await battle.initSpellSlots(db);
        await battle.initBossPhases(db);
        await battle.initCombatExtras(db);
        await battle.initSession23(db);
        await battle.initSession24(db);
        await battle.initComboSystem(db);

        // Register location + load terrain & objects
        try {
            const firstHuman = allStats.find(s => !s.isAI) || allStats[0];
            const [posRows] = await db.query('SELECT map_id, x, y FROM characters WHERE id=?', [firstHuman.charId]);
            if (posRows.length) {
                battle.registerOnMap(posRows[0].map_id, posRows[0].x, posRows[0].y);
                const [mapRow] = await db.query(
                    'SELECT collisions_json, objects_json FROM game_maps WHERE id=? LIMIT 1', [posRows[0].map_id]);
                if (mapRow.length) {
                    try { battle.loadTerrain(JSON.parse(mapRow[0].collisions_json || '[]')); } catch {}
                    try { battle.loadObjects(JSON.parse(mapRow[0].objects_json || '[]')); } catch {}
                }
            }
        } catch {}

        // Record participants
        try {
            for (const [teamId, stats] of Object.entries(allTeams)) {
                const teamNum = Object.keys(allTeams).indexOf(teamId) + 1;
                for (const s of stats) {
                    await db.query(
                        'INSERT IGNORE INTO game_battle_participants (battle_id,character_id,team,is_ai) VALUES (?,?,?,?)',
                        [battleId, s.charId, teamNum, s.isAI ? 1 : 0]);
                }
            }
        } catch {}

        // Notify all players
        const allNames = allStats.map(s => s.name).join(', ');
        battle.addLog({ actor: 'system', text: `Free-for-all battle begins! ${allNames}` });

        for (const s of allStats) {
            if (s.isAI) continue;
            const sock = socketMap[s.charId];
            if (!sock) continue;
            const cmds = await getAvailableCommands(db, s);
            sock.emit('battle_start', { ...battle.toClientState(s.charId), commands: cmds });
            sock.join('battle_' + battleId);
            sock._battleCharId = s.charId;
        }

        // If first actor is AI, queue its turn
        const firstActor = battle.getCombatant(battle.turnCharId);
        if (firstActor && firstActor.isAI) {
            setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1500);
        }
        return battleId;
    },

    // --- GET AVAILABLE COMMANDS ---
    // Returns the command menu for a combatant (filtered by status effects)
    getAvailableCommands,

    // --- PROCESS PLAYER ACTION ---
    processAction: async (db, io, socket, { battleId, commandId, skillId, itemId, limitId, targetId, targetObjectKey, targetLimb, flavorText, sigTechId, comboInput, actionTiming }) => {
        const battle = activeBattles[battleId];
        if (!battle || battle.status !== 'ACTIVE') {
            socket.emit('battle_error', 'No active battle.');
            return;
        }

        // Verify this socket is actually a participant in THIS battle.
        //
        // Security: socket._battleCharId is set by the SERVER when the battle
        // starts (see the start_pve_battle / battle_accept handlers). Clients
        // cannot forge it — it comes from onlinePlayers[socket.id].charId.
        //
        // We intentionally do NOT fall back to "find any non-AI combatant"
        // because that fallback would let any logged-in socket send actions
        // in a battle they're not part of by guessing the battleId (which is
        // a simple auto-increment integer).
        const charId = socket._battleCharId;
        if (!charId) {
            socket.emit('battle_error', 'Not in a battle.');
            return;
        }
        if (!battle.combatants[charId]) {
            socket.emit('battle_error', 'Not a participant in this battle.');
            return;
        }
        // Multi-char teams: socket owns multiple charIds (3v3 PvP).
        const teamIds = socket._battleTeamIds || [charId];
        if (!teamIds.includes(battle.turnCharId)) {
            socket.emit('battle_error', 'Not your turn.');
            return;
        }

        // Act as the current turn's character (in 3v3, may differ from socket._battleCharId)
        const actingCharId = battle.turnCharId;
        const actor = battle.getCombatant(actingCharId);
        // targetId lets party-battle players choose which enemy to hit.
        // Fall back to getOpponent (first living enemy) for 1v1.
        let target = battle.getOpponent(actingCharId);
        if (targetId) {
            const manual = battle.getCombatant(parseInt(targetId));
            if (manual && manual.teamId !== actor.teamId && manual.currentHp > 0) {
                target = manual;
            }
        }

        // ── Object targeting (Session 3) ──────────────────────────────
        // If the player targeted a destructible object instead of a combatant,
        // resolve damage against the object and broadcast results.
        if (targetObjectKey && !skillId && !itemId && !limitId) {
            const [ox, oy] = targetObjectKey.split(',').map(Number);
            const obj = battle.getObjectAt(ox, oy);
            if (!obj) { socket.emit('battle_error', 'No targetable object there.'); return; }
            // Range check (melee = adjacent)
            if (actor.gridX !== undefined) {
                const dist = BattleState.chebyshev(actor, { gridX: ox, gridY: oy });
                if (dist > 1) { socket.emit('battle_error', `Too far from ${obj.label}. Move closer.`); return; }
            }
            // Calculate damage (use basic ATK formula)
            let dmg = Math.max(1, Math.floor(actor.atk * 1.5));
            if (actor._stance === 'POWER') dmg = Math.floor(dmg * 1.4);
            const objResult = battle.damageObject(ox, oy, dmg, battle);
            const result = { actor: actor.name, actions: [], log: [] };
            result.log.push(`${actor.name} strikes the ${obj.label}! (${dmg} damage)`);
            result.actions.push({ type: 'object_damage', objectKey: targetObjectKey, label: obj.label, damage: dmg });
            if (objResult && objResult.destroyed) {
                result.log.push(obj.onDestroy?.message || `${obj.label} is destroyed!`);
                result.actions.push({ type: 'object_destroyed', objectKey: targetObjectKey, label: obj.label });
                for (const fx of (objResult.effects || [])) {
                    result.log.push(`  → ${fx.target} takes ${fx.damage} ${fx.type} damage!`);
                    result.actions.push({ type: fx.type, target: fx.target, amount: fx.damage });
                }
            }
            battle.addLog({ actor: actor.name, action: 'Object Attack', text: `${actor.name} attacks ${obj.label}` });
            await broadcastBattleUpdate(io, battle, result, db);
            checkDeaths(battle);
            if (battle.status !== 'ACTIVE') { await broadcastBattleUpdate(io, battle, { text: 'Battle Over!' }, db); await endBattle(db, io, battle); return; }
            const _tickR = await processStatusEffects(db, battle); if (_tickR.log.length) await broadcastBattleUpdate(io, battle, _tickR, db);
            checkDeaths(battle);
            if (battle.status !== 'ACTIVE') { await broadcastBattleUpdate(io, battle, { text: 'Battle Over!' }, db); await endBattle(db, io, battle); return; }
            battle.nextTurn();
            await broadcastBattleUpdate(io, battle, null, db);
            const nextAct2 = battle.getCombatant(battle.turnCharId);
            if (nextAct2 && nextAct2.isAI) setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1200);
            return;
        }

        // If actor has a charging skill ready this turn, auto-fire it
        // (override whatever the client sent — charge fires itself)
        if (actor._charging && actor._charging.turnsLeft <= 0) {
            const chargedId = actor._charging.skillId;
            actor._charging = null;
            actor._chargingFire = true; // flag so executeBattleAction skips charge re-init
            const result = await executeBattleAction(db, battle, actor, target, { skillId: chargedId });
            actor._chargingFire = false;
            await broadcastBattleUpdate(io, battle, result, db);
            if (battle.status !== 'ACTIVE') { await endBattle(db, io, battle); return; }
            const _tickR = await processStatusEffects(db, battle); if (_tickR.log.length) await broadcastBattleUpdate(io, battle, _tickR, db);
            checkDeaths(battle);
            if (battle.status !== 'ACTIVE') { await broadcastBattleUpdate(io, battle, { text: 'Battle Over!' }, db); await endBattle(db, io, battle); return; }
            battle.nextTurn();
            await broadcastBattleUpdate(io, battle, null, db);
            const nextAct = battle.getCombatant(battle.turnCharId);
            if (nextAct.isAI) setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1200);
            return;
        }

        // Execute the action
        const result = await executeBattleAction(db, battle, actor, target, { commandId, skillId, itemId, limitId, targetLimb, flavorText, sigTechId, comboInput, actionTiming });

        // Send result to both players
        await broadcastBattleUpdate(io, battle, result, db);

        // Session 16: Evaluate custom win condition
        if (battle._winCondition && battle.status === 'ACTIVE') {
            const wcResult = evaluateWinCondition(battle);
            if (wcResult) {
                if (wcResult.won) {
                    battle.status = 'FINISHED';
                    // Find first living human player as "winner"
                    const playerTeamId = Object.keys(battle.teams)[0];
                    const firstLiving = (battle.teams[playerTeamId] || []).find(id =>
                        battle.combatants[id]?.currentHp > 0 && !battle.combatants[id]?.isAI);
                    battle.winner = firstLiving || null;
                    battle.winnerTeamId = playerTeamId;
                } else {
                    battle.status = 'FINISHED';
                    battle.winner = null; // players lost
                }
                await broadcastBattleUpdate(io, battle, { log: [wcResult.text], actions: [{ type: 'win_condition', won: wcResult.won, text: wcResult.text }] }, db);
                await endBattle(db, io, battle);
                return;
            }
        }

        // Session 11: Emit signature tech discovery if found
        if (result._sigTechDiscovery) {
            socket.emit('sig_tech_discovery', result._sigTechDiscovery);
        }

        // Check for battle end
        if (battle.status !== 'ACTIVE') {
            await endBattle(db, io, battle);
            return;
        }

        // Process turn-end status effects, then next turn
        const tickResult = await processStatusEffects(db, battle);

        // If ticks produced output, broadcast them as a mini-action so popups fire
        if (tickResult.log.length) {
            await broadcastBattleUpdate(io, battle, tickResult, db);
        }

        // Check deaths from status effects
        checkDeaths(battle);
        if (battle.status !== 'ACTIVE') {
            await broadcastBattleUpdate(io, battle, { text: 'Battle Over!' }, db);
            await endBattle(db, io, battle);
            return;
        }

        // Decrement charge counters for the NEXT actor (was just set this turn)
        for (const cid of Object.keys(battle.combatants)) {
            const c = battle.combatants[cid];
            if (c._charging && c._charging.turnsLeft > 0) {
                c._charging.turnsLeft--;
            }
        }

        battle.nextTurn();
        await broadcastBattleUpdate(io, battle, null, db);

        // AI turn
        const nextActor = battle.getCombatant(battle.turnCharId);
        if (nextActor.isAI) {
            setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1200);
        }
    },

    // --- AI TURN ---
    // TEACHING: A good RPG AI feels like it's "thinking" even when it isn't.
    // This one has three priority tiers:
    //   1. HEAL: If HP is critically low AND has a healing skill → use it.
    //   2. SKILL: 50% chance to use a random available skill (if has MP).
    //   3. ATTACK: Default physical attack.
    //      Also randomly defends (~15% chance) as a "bluffing" move.
    //
    // Enemy NPCs are assigned skills through the normal class system
    // (class_id on their characters row), so the AI automatically gets
    // whatever skills belong to their class. No special NPC logic needed.
    aiTurn: async (db, io, battleId) => {
        const battle = activeBattles[battleId];
        if (!battle || battle.status !== 'ACTIVE') return;

        const ai        = battle.getCombatant(battle.turnCharId);
        // Targeting priority: Taunt > Threat > Lowest HP
        const enemyTeam = battle.getEnemyTeam(battle.turnCharId);
        let player;
        // Session 12: If taunted, target the taunter
        if (ai._taunted?.by) {
            const taunter = battle.getCombatant(ai._taunted.by);
            if (taunter && taunter.currentHp > 0 && !taunter._knockedOut) player = taunter;
        }
        // Session 23: Threat-based targeting
        if (!player && battle._settings?.enable_threat_system) {
            player = getHighestThreatTarget(battle, ai.charId);
        }
        // Fallback: lowest-HP
        if (!player) {
            player = enemyTeam.length
                ? enemyTeam.reduce((a, b) => a.currentHp < b.currentHp ? a : b)
                : battle.getOpponent(battle.turnCharId);
        }

        if (!player) return; // no targets — battle should have ended

        // ── Session 8: AI limb targeting strategy ──────────────────
        let aiTargetLimb = null;
        if (battle._settings?.enable_limb_targeting && player._limbHp && player._limbZones) {
            const zones = Object.keys(player._limbHp).filter(k => player._limbHp[k].current > 0);
            if (zones.length > 1) {
                switch (tactics) {
                    case 'AGGRESSIVE': {
                        // Go for head 30% of the time (risky KO shot), otherwise weakest limb
                        if (zones.includes('head') && Math.random() < 0.30) {
                            aiTargetLimb = 'head';
                        } else {
                            // Target the limb with lowest HP% to finish disabling it
                            let weakest = null, weakestPct = 1;
                            for (const z of zones) {
                                const hp = player._limbHp[z];
                                const pct = hp.current / hp.max;
                                if (pct < weakestPct && z !== 'torso') { weakest = z; weakestPct = pct; }
                            }
                            aiTargetLimb = weakest || 'torso';
                        }
                        break;
                    }
                    case 'DEFENSIVE': {
                        // Target arms to reduce enemy damage output
                        const arms = zones.filter(z => z.includes('arm'));
                        aiTargetLimb = arms.length ? arms[Math.floor(Math.random() * arms.length)] : 'torso';
                        break;
                    }
                    case 'SUPPORT': {
                        // Target legs to reduce mobility (helps allies)
                        aiTargetLimb = zones.includes('legs') ? 'legs'
                            : zones.includes('hind_legs') ? 'hind_legs' : 'torso';
                        break;
                    }
                    default: { // BALANCED
                        // Weighted random: torso 50%, arms 20%, legs 15%, head 10%, other 5%
                        const roll = Math.random();
                        if (roll < 0.50) aiTargetLimb = 'torso';
                        else if (roll < 0.70) aiTargetLimb = zones.find(z => z.includes('arm')) || 'torso';
                        else if (roll < 0.85) aiTargetLimb = zones.find(z => z.includes('leg')) || 'torso';
                        else if (roll < 0.95) aiTargetLimb = zones.includes('head') ? 'head' : 'torso';
                        else aiTargetLimb = zones[Math.floor(Math.random() * zones.length)];
                        break;
                    }
                }
            }
        }

        // ── Session 10: AI ki channeling (use when critically low HP) ──
        if (battle._settings?.enable_ki_channeling && !ai._kiChanneled &&
            (ai._kiChannelUsed || 0) < (battle._settings.ki_channel_uses_per_battle || 1) &&
            ai.currentHp / ai.maxHp < 0.20) {
            // Channel Ki instead of normal action
            const channelResult = resolveKiChannel(battle, ai, { actor: ai.name, actions: [], log: [] });
            await broadcastBattleUpdate(io, battle, channelResult, db);
            if (battle.status !== 'ACTIVE') { await endBattle(db, io, battle); return; }
            battle.nextTurn();
            await broadcastBattleUpdate(io, battle, null, db);
            const nextAfterChannel = battle.getCombatant(battle.turnCharId);
            if (nextAfterChannel?.isAI && battle.status === 'ACTIVE') {
                setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1200);
            }
            return;
        }

        // ── Session 8: AI nonlethal logic ──────────────────────────
        // Guards and NPCs with merciful/honorable persona use nonlethal
        if (battle._settings?.enable_nonlethal && !ai._nonLethal) {
            const persona = (ai._persona || '').toLowerCase();
            if (persona.includes('guard') || persona.includes('merciful') ||
                persona.includes('honorable') || persona.includes('pacifist') ||
                persona.includes('lawful')) {
                ai._nonLethal = true;
            }
        }

        const available = await getAvailableCommands(db, ai);

        let commandId = null;
        let skillId   = null;
        let limitId   = null;

        // Companion tactics modify AI behavior
        const tactics = ai._tactics || 'BALANCED';

        // SUPPORT tactics: prioritize healing allies first
        if (tactics === 'SUPPORT') {
            const allies = battle.getAllyTeam ? battle.getAllyTeam(battle.turnCharId) : [];
            const woundedAlly = allies.find(a => a.currentHp > 0 && a.currentHp / a.maxHp < 0.60);
            if (woundedAlly) {
                const healSkills = (available.skills || []).filter(sk =>
                    (sk.targetType === 'SELF' || sk.targetType === 'ALLY' || sk.targetType === 'ALL_ALLIES')
                    && ai.currentMp >= sk.mpCost
                );
                if (healSkills.length) {
                    skillId = healSkills[0].id;
                }
            }
        }

        // --- Priority 1: Limit break if bar is full ---
        if (!skillId && ai.limitbreak >= 100 && available.limits && available.limits.length) {
            limitId = available.limits[0].id; // Use first available limit
        }

        // --- Priority 2: Heal if HP low (threshold varies by tactics) ---
        const healThreshold = tactics === 'DEFENSIVE' ? 0.50
                            : tactics === 'SUPPORT' ? 0.40
                            : 0.30;
        if (!skillId && !limitId && ai.currentHp / ai.maxHp < healThreshold) {
            const healSkills = (available.skills || []).filter(sk => {
                return sk.targetType === 'SELF';
            });
            if (healSkills.length && ai.currentMp >= healSkills[0].mpCost) {
                skillId = healSkills[0].id;
            }
        }

        // --- Priority 3: Use a combo-ready skill if available ---
        if (!skillId && !limitId && !commandId) {
            const comboReady = (available.skills || []).filter(sk =>
                sk.comboReady && ai.currentMp >= sk.mpCost
            );
            if (comboReady.length) {
                skillId = comboReady[Math.floor(Math.random() * comboReady.length)].id;
            }
        }

        // --- Priority 4: Use a random skill (chance varies by tactics) ---
        const skillChance = tactics === 'AGGRESSIVE' ? 0.70
                          : tactics === 'DEFENSIVE' ? 0.30
                          : tactics === 'SUPPORT' ? 0.40
                          : 0.50;
        if (!skillId && !limitId && !commandId && available.skills && available.skills.length) {
            if (Math.random() < skillChance) {
                const usable = available.skills.filter(sk =>
                    sk.targetType !== 'SELF' && ai.currentMp >= sk.mpCost
                );
                if (usable.length) {
                    skillId = usable[Math.floor(Math.random() * usable.length)].id;
                }
            }
        }

        // --- Priority 4b: Target a destructible object if it would splash enemies ---
        // AI will target a barrel/torch if an enemy combatant is adjacent to it
        if (!skillId && !limitId && !commandId && battle.battleObjects && ai.gridX !== undefined) {
            for (const obj of Object.values(battle.battleObjects)) {
                if (obj.destroyed || !obj.onDestroy || obj.onDestroy.type !== 'fire_aoe') continue;
                const distToObj = BattleState.chebyshev(ai, { gridX: obj.x, gridY: obj.y });
                if (distToObj > 1) continue; // must be adjacent to hit it
                // Check if any enemy is near the object
                const nearbyEnemies = enemyTeam.filter(e =>
                    e.currentHp > 0 && BattleState.chebyshev(e, { gridX: obj.x, gridY: obj.y }) <= (obj.onDestroy.radius || 0));
                if (nearbyEnemies.length > 0 && Math.random() < 0.60) {
                    // Attack the object instead — simulate via damageObject directly
                    let dmg = Math.max(1, Math.floor(ai.atk * 1.5));
                    if (ai._stance === 'POWER') dmg = Math.floor(dmg * 1.4);
                    const objRes = battle.damageObject(obj.x, obj.y, dmg, battle);
                    const objResult = { actor: ai.name, actions: [], log: [] };
                    objResult.log.push(`${ai.name} strikes the ${obj.label}! (${dmg} damage)`);
                    objResult.actions.push({ type: 'object_damage', objectKey: `${obj.x},${obj.y}`, label: obj.label, damage: dmg });
                    if (objRes && objRes.destroyed) {
                        objResult.log.push(obj.onDestroy.message || `${obj.label} is destroyed!`);
                        objResult.actions.push({ type: 'object_destroyed', objectKey: `${obj.x},${obj.y}`, label: obj.label });
                        for (const fx of (objRes.effects || [])) {
                            objResult.log.push(`  → ${fx.target} takes ${fx.damage} ${fx.type} damage!`);
                            objResult.actions.push({ type: fx.type, target: fx.target, amount: fx.damage });
                        }
                    }
                    battle.addLog({ actor: ai.name, action: 'Object Attack', text: `${ai.name} attacks ${obj.label}` });
                    await broadcastBattleUpdate(io, battle, objResult, db);
                    checkDeaths(battle);
                    if (battle.status !== 'ACTIVE') { await broadcastBattleUpdate(io, battle, { text: 'Battle Over!' }, db); await endBattle(db, io, battle); return; }
                    const _tickR = await processStatusEffects(db, battle); if (_tickR.log.length) await broadcastBattleUpdate(io, battle, _tickR, db);
                    checkDeaths(battle);
                    if (battle.status !== 'ACTIVE') { await broadcastBattleUpdate(io, battle, { text: 'Battle Over!' }, db); await endBattle(db, io, battle); return; }
                    battle.nextTurn();
                    await broadcastBattleUpdate(io, battle, null, db);
                    const nextAct3 = battle.getCombatant(battle.turnCharId);
                    if (nextAct3 && nextAct3.isAI) setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1200);
                    return;
                }
            }
        }

        // --- Priority 5: Physical attack (or defend — chance varies by tactics) ---
        if (!skillId && !limitId && !commandId) {
            const roll = Math.random();
            const defendChance = tactics === 'DEFENSIVE' ? 0.30
                               : tactics === 'AGGRESSIVE' ? 0.05
                               : 0.15;
            if (roll < 0.10 && !ai._stance && tactics !== 'DEFENSIVE') {
                // Enter POWER stance occasionally for variety (not if defensive)
                const stanceCmds = (available.commands || []).filter(cmd =>
                    cmd.name === 'Power Stance' || cmd.name === 'Guard Stance'
                );
                if (stanceCmds.length) commandId = stanceCmds[0].id;
            }
            if (!commandId) commandId = roll < defendChance ? 2 : 1; // 2=Defend, 1=Attack
        }

        const result = await executeBattleAction(db, battle, ai, player, { commandId, skillId, limitId, targetLimb: aiTargetLimb });
        await broadcastBattleUpdate(io, battle, result, db);

        if (battle.status !== 'ACTIVE') {
            await endBattle(db, io, battle);
            return;
        }

        await processStatusEffects(db, battle);
        checkDeaths(battle);
        if (battle.status !== 'ACTIVE') {
            await broadcastBattleUpdate(io, battle, { text: 'Battle Over!' }, db);
            await endBattle(db, io, battle);
            return;
        }

        battle.nextTurn();
        await broadcastBattleUpdate(io, battle, null, db);

        // Chain AI turn if next actor is also AI (companions or multi-enemy)
        const nextAI = battle.getCombatant(battle.turnCharId);
        if (nextAI && nextAI.isAI && battle.status === 'ACTIVE') {
            setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1200);
        }
    },

    // ── SESSION 8: Set default defense stance ─────────────────────
    setDefenseStance: (battleId, charId, defenseType) => {
        const battle = activeBattles[battleId];
        if (!battle) return null;
        const c = battle.combatants[charId];
        if (!c) return null;
        if (!battle._settings?.enable_active_defense) return { enabled: false };
        const valid = ['dodge', 'block', 'counter', 'none'];
        c._defaultDefense = valid.includes(defenseType) ? defenseType : 'block';
        return { enabled: true, defense: c._defaultDefense, name: c.name };
    },

    // ── SESSION 8: Toggle non-lethal mode ─────────────────────────
    toggleNonLethal: (battleId, charId) => {
        const battle = activeBattles[battleId];
        if (!battle) return null;
        const c = battle.combatants[charId];
        if (!c) return null;
        if (!battle._settings?.enable_nonlethal) return { enabled: false, reason: 'Non-lethal mode is disabled' };
        c._nonLethal = !c._nonLethal;
        return { enabled: true, nonLethal: c._nonLethal, name: c.name };
    },

    // ── SESSION 8: Set limb target ─────────────────────────────────
    setLimbTarget: (battleId, charId, limbKey) => {
        const battle = activeBattles[battleId];
        if (!battle) return null;
        const c = battle.combatants[charId];
        if (!c) return null;
        if (!battle._settings?.enable_limb_targeting) return null;
        c._targetLimb = limbKey || null;
        return { limbKey: c._targetLimb };
    },

    // ── SESSION 8: Process KO interaction ──────────────────────────
    processKoAction: async (db, io, battleId, actorCharId, npcCharId, action) => {
        const battle = activeBattles[battleId];
        if (!battle) return { success: false, message: 'Battle not found' };

        const npc = battle.combatants[npcCharId];
        if (!npc || !npc._knockedOut) return { success: false, message: 'Target not knocked out' };

        const result = { success: true, action, npcName: npc.name, data: {} };

        switch (action) {
            case 'interrogate': {
                // Roll against base chance, modified by NPC willingness
                const chance = battle._settings?.ko_interrogate_base_chance || 0.60;
                const willingness = calculateNpcWillingness(npc, 0);
                const adjustedChance = Math.min(0.95, chance + (willingness / 200));
                const success = Math.random() < adjustedChance;
                result.data = {
                    success,
                    willingness,
                    dialogue: success
                        ? `*coughs* ...Fine. What do you want to know?`
                        : `*spits* I'll tell you nothing!`
                };
                // Record interaction
                try {
                    await db.query(
                        `UPDATE game_battle_knockouts SET interaction=?, interaction_result=?
                         WHERE battle_id=? AND npc_char_id=?`,
                        ['interrogate', JSON.stringify(result.data), battleId, npcCharId]
                    );
                } catch {}
                break;
            }
            case 'recruit': {
                const willingness = calculateNpcWillingness(npc, 0);
                const success = willingness >= 40;
                if (success) {
                    // Add as companion
                    try {
                        const [npcRow] = await db.query(
                            'SELECT id FROM game_npcs WHERE char_id=? LIMIT 1', [npcCharId]);
                        if (npcRow.length) {
                            // Check companion limit (max 3)
                            const [countRow] = await db.query(
                                'SELECT COUNT(*) as cnt FROM character_companions WHERE character_id=? AND is_active=1',
                                [actorCharId]);
                            if (countRow[0].cnt < 3) {
                                await db.query(
                                    `INSERT IGNORE INTO character_companions (character_id, npc_id, is_active, tactics)
                                     VALUES (?, ?, 1, 'BALANCED')`,
                                    [actorCharId, npcRow[0].id]
                                );
                            }
                        }
                    } catch {}
                }
                result.data = {
                    success, willingness,
                    dialogue: success
                        ? `...You spared my life. I'll fight alongside you.`
                        : `I'd rather die than serve you.`
                };
                try {
                    await db.query(
                        `UPDATE game_battle_knockouts SET interaction=?, interaction_result=?
                         WHERE battle_id=? AND npc_char_id=?`,
                        ['recruit', JSON.stringify(result.data), battleId, npcCharId]
                    );
                } catch {}
                break;
            }
            case 'loot': {
                // Drop loot as normal (same as kill)
                try {
                    const [npcRow] = await db.query(
                        'SELECT drop_table_json FROM game_npcs WHERE char_id=? LIMIT 1', [npcCharId]);
                    if (npcRow.length && npcRow[0].drop_table_json) {
                        const dropTable = jp(npcRow[0].drop_table_json, []);
                        const drops = [];
                        for (const entry of dropTable) {
                            if (!entry.item_id || Math.random() * 100 > (entry.chance || 0)) continue;
                            const qty = Math.max(1, entry.min_qty || 1);
                            await db.query(
                                'INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',
                                [actorCharId, entry.item_id, qty]
                            );
                            const [iRow] = await db.query('SELECT name, icon FROM game_items WHERE id=?', [entry.item_id]);
                            if (iRow.length) drops.push({ name: iRow[0].name, icon: iRow[0].icon || '📦', qty });
                        }
                        result.data = { drops };
                    }
                } catch {}
                try {
                    await db.query(
                        `UPDATE game_battle_knockouts SET interaction=? WHERE battle_id=? AND npc_char_id=?`,
                        ['loot', battleId, npcCharId]
                    );
                } catch {}
                break;
            }
            case 'release': {
                // Reputation bonus for mercy
                try {
                    const repBonus = battle._settings?.nonlethal_rep_bonus_release || 5;
                    // Future: apply reputation change to actorCharId
                    result.data = { repBonus, dialogue: `...I won't forget this mercy.` };
                    await db.query(
                        `UPDATE game_battle_knockouts SET interaction=?, interaction_result=?
                         WHERE battle_id=? AND npc_char_id=?`,
                        ['release', JSON.stringify(result.data), battleId, npcCharId]
                    );
                } catch {}
                break;
            }
            default:
                return { success: false, message: 'Unknown action' };
        }

        return result;
    },

    // ── SESSION 8: Process PvP KO choice (spare/finish) ────────────
    processPvpKoChoice: async (db, io, battleId, actorCharId, targetCharId, spare) => {
        const battle = activeBattles[battleId];
        if (!battle) return { success: false };

        const target = battle.combatants[targetCharId];
        if (!target || !target._knockedOut) return { success: false };

        if (spare) {
            // Spare — reputation bonus, target stays KO'd but alive
            const repBonus = battle._settings?.nonlethal_rep_bonus_release || 5;
            return { success: true, spared: true, repBonus };
        } else {
            // Finish — reputation penalty, target is now dead
            target._knockedOut = false;
            target.currentHp = 0;
            const repPenalty = battle._settings?.nonlethal_rep_penalty_finish || -10;
            return { success: true, spared: false, repPenalty };
        }
    },

    // ── SESSION 22: Spectator mode ───────────────────────────────
    spectate: (io, socket, battleId) => {
        const battle = activeBattles[battleId];
        if (!battle) return { success: false, message: 'Battle not found' };
        // Join spectator room
        socket.join('battle_' + battleId);
        socket._spectating = battleId;
        // Send current state
        const state = battle.toClientState(null);
        socket.emit('battle_update', { state, action: null, commands: null, spectator: true });
        return { success: true, battleId };
    },

    unspectate: (io, socket) => {
        if (socket._spectating) {
            socket.leave('battle_' + socket._spectating);
            socket._spectating = null;
        }
    },

    // ── SESSION 12: Train under a master NPC ─────────────────────
    trainUnderMaster: async (db, charId, npcId) => {
        return await trainUnderMaster(db, charId, npcId);
    },

    // ── SESSION 11: Create a signature technique ─────────────────
    createSignatureTech: async (db, charId, { name, techType, element, originText, originKeywords }) => {
        const settings = await loadBattleSettings(db);
        if (!settings.enable_signature_techs) return { success: false, message: 'Signature techniques are disabled' };

        const maxTechs = settings.sig_tech_max_per_character || 3;
        try {
            const [countRow] = await db.query(
                'SELECT COUNT(*) as cnt FROM character_signature_techs WHERE character_id=?', [charId]);
            if (countRow[0].cnt >= maxTechs) return { success: false, message: `Maximum ${maxTechs} signature techniques reached` };
        } catch { return { success: false, message: 'Database error' }; }

        const battleText = `{name} unleashes ${name}!`;
        try {
            const [res] = await db.query(
                `INSERT INTO character_signature_techs
                 (character_id, name, tech_type, element, origin_text, origin_keywords, battle_text, current_level, current_xp)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
                [charId, name, techType || 'ki_attack', element || null,
                 originText || null, JSON.stringify(originKeywords || []), battleText]
            );
            return { success: true, techId: res.insertId, name, techType, element };
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') return { success: false, message: 'You already have a technique with that name' };
            return { success: false, message: e.message };
        }
    },

    // ── SESSION 11: Add ability to a signature tech slot ───────────
    addSigTechAbility: async (db, charId, techId, abilityId, slot) => {
        // Verify ownership
        try {
            const [techRow] = await db.query(
                'SELECT * FROM character_signature_techs WHERE id=? AND character_id=?', [techId, charId]);
            if (!techRow.length) return { success: false, message: 'Technique not found' };
            const tech = techRow[0];

            // Get level info for slot count
            const [levelRow] = await db.query(
                'SELECT ability_slots FROM game_signature_levels WHERE level=?', [tech.current_level]);
            const maxSlots = levelRow.length ? levelRow[0].ability_slots : 0;
            if (slot > maxSlots) return { success: false, message: `Only ${maxSlots} ability slots available at level ${tech.current_level}` };

            // Check ability exists and min level
            const [abilRow] = await db.query('SELECT * FROM game_signature_abilities WHERE id=?', [abilityId]);
            if (!abilRow.length) return { success: false, message: 'Ability not found' };
            if (abilRow[0].min_level > tech.current_level) return { success: false, message: `Requires tech level ${abilRow[0].min_level}` };

            // Check exclusivity
            const exclusive = jp(abilRow[0].exclusive_with, []);
            if (exclusive.length) {
                const [equipped] = await db.query(
                    'SELECT ability_id FROM character_sig_tech_abilities WHERE tech_id=?', [techId]);
                const equippedIds = equipped.map(r => r.ability_id);
                const conflict = exclusive.find(id => equippedIds.includes(id));
                if (conflict) return { success: false, message: 'Conflicts with an already equipped ability' };
            }

            await db.query(
                `INSERT INTO character_sig_tech_abilities (tech_id, ability_id, slot_number, unlocked_at_level)
                 VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE ability_id=VALUES(ability_id)`,
                [techId, abilityId, slot, tech.current_level]
            );
            return { success: true, abilityName: abilRow[0].label };
        } catch (e) { return { success: false, message: e.message }; }
    },

    // ── SESSION 11: Get player's signature techs for battle commands ──
    getSignatureTechs: async (db, charId) => {
        try {
            const [techs] = await db.query(
                `SELECT st.*, sl.damage_pct, sl.cost_pct, sl.heal_pct
                 FROM character_signature_techs st
                 JOIN game_signature_levels sl ON sl.level = st.current_level
                 WHERE st.character_id = ?`, [charId]);

            const result = [];
            for (const tech of techs) {
                // Load equipped abilities
                const [abilities] = await db.query(
                    `SELECT sa.* FROM character_sig_tech_abilities csa
                     JOIN game_signature_abilities sa ON sa.id = csa.ability_id
                     WHERE csa.tech_id = ?`, [tech.id]);

                // Calculate modified damage/cost from abilities
                let damagePct = parseFloat(tech.damage_pct);
                let costPct = parseFloat(tech.cost_pct);
                let healPct = parseFloat(tech.heal_pct);
                let dodgeMod = 0;
                const abilityEffects = {};
                for (const ab of abilities) {
                    damagePct += parseFloat(ab.damage_modifier) || 0;
                    costPct += parseFloat(ab.cost_modifier) || 0;
                    dodgeMod += parseFloat(ab.dodge_modifier) || 0;
                    const fx = jp(ab.effects, {});
                    Object.assign(abilityEffects, fx);
                }

                result.push({
                    techId: tech.id,
                    name: tech.name,
                    icon: tech.icon || '⚡',
                    techType: tech.tech_type,
                    level: tech.current_level,
                    xp: tech.current_xp,
                    totalUses: tech.total_uses,
                    element: tech.element,
                    battleText: tech.battle_text,
                    damagePct: Math.max(0.01, damagePct),
                    costPct: Math.max(0, costPct),
                    healPct: Math.max(0, healPct),
                    dodgeMod,
                    abilities: abilities.map(a => ({ id: a.id, name: a.name, label: a.label, icon: a.icon })),
                    abilityEffects,
                    isSigTech: true
                });
            }
            return result;
        } catch { return []; }
    },

    // Expose for server.js
    activeBattles,
    getEffectiveStats
};

// =================================================================
// EXECUTE BATTLE ACTION — The core resolver
// =================================================================
async function executeBattleAction(db, battle, actor, target, { commandId, skillId, itemId, limitId, targetLimb, flavorText, sigTechId, comboInput, actionTiming }) {
    const result = { actor: actor.name, actions: [], log: [] };

    // Check actor status effects that prevent / impair action
    for (const s of actor.statuses) {
        const [sRows] = await db.query("SELECT * FROM game_statuses WHERE id=?", [s.id]);
        if (!sRows.length) continue;
        const fx = jp(sRows[0].effects, {});

        // Stun / Sleep — guaranteed skip
        if (fx.skip_turn) {
            const logText = (fx.log || '{name} cannot act!').replace('{name}', actor.name);
            result.log.push(logText);
            battle.addLog({ actor: actor.name, action: 'STUNNED', text: logText });
            return result;
        }

        // Paralyze — skip_chance % to lose turn
        if (fx.skip_chance && Math.random() * 100 < fx.skip_chance) {
            const logText = (fx.log || '{name} is paralysed and cannot move!').replace('{name}', actor.name);
            result.log.push(logText);
            battle.addLog({ actor: actor.name, action: 'PARALYSED', text: logText });
            return result;
        }

        // Blind — miss_chance % on physical damage commands (not skills/items)
        if (fx.miss_chance) {
            actor._missChance = (actor._missChance || 0) + fx.miss_chance;
        }
    }

    // --- COMBO INPUT (Legaia-style) ---
    // If the player submitted a directional combo sequence, resolve it instead of normal action
    if (comboInput && battle._settings?.enable_combo_input) {
        return await resolveComboInput(db, battle, actor, target, comboInput, result);
    }

    // --- STANCE COMMAND ---
    // Stances store a persistent mode on the combatant object (_stance field).
    // They re-use the normal command path — any game_battle_command whose effects
    // JSON contains { "stance": "POWER" } is treated as a stance toggle.
    if (commandId) {
        const [cmdRows] = await db.query('SELECT * FROM game_battle_commands WHERE id=?', [commandId]);
        if (cmdRows.length) {
            const fx = jp(cmdRows[0].effects || '{}', {});
            if (fx.stance) {
                const newStance = fx.stance;
                if (actor._stance === newStance) {
                    actor._stance = null;
                    result.log.push(`${actor.name} drops their stance.`);
                } else {
                    actor._stance = newStance;
                    const msgs = {
                        POWER: `⚔️ ${actor.name} enters Power Stance! ATK x1.4 this round.`,
                        GUARD: `🛡️ ${actor.name} enters Guard Stance! Incoming damage halved.`,
                        MAGIC: `✨ ${actor.name} enters Magic Stance! MO x1.4 & MP costs reduced.`
                    };
                    result.log.push(msgs[newStance] || `${actor.name} takes a new stance.`);
                }
                result.actions.push({ type: 'stance', stance: actor._stance, actor: actor.name });
                return result;
            }
            // Session 10: Ki Channeling command
            if (fx.ki_channel) {
                return resolveKiChannel(battle, actor, result);
            }
            // Session 18: Stealth command
            if (fx.stealth) {
                return resolveStealth(battle, actor, result);
            }
            // Session 20: Transform command
            if (fx.transform) {
                return await resolveTransform(db, battle, actor, result);
            }
            // Session 15: Summon command
            if (fx.summon) {
                return await resolveSummon(db, battle, actor, result);
            }
            // Session 12: RP commands (Taunt, Intimidate, Rally)
            if (fx.rp_command) {
                return await resolveRpCommand(db, battle, actor, target, fx.rp_command, fx, result, flavorText);
            }
        }
    }

    // --- SKILL (with charge + combo checks) ---
    if (skillId) {
        // Check if this skill requires a charge-up turn
        const [skPreRows] = await db.query('SELECT effects, name FROM game_skills WHERE id=?', [skillId]);
        if (skPreRows.length) {
            const fxPre = jp(skPreRows[0].effects, {});
            // Only initiate charge if NOT already firing from _charging auto-fire path
            if (fxPre.charge_turns && !actor._chargingFire) {
                actor._charging = {
                    skillId,
                    turnsLeft:  fxPre.charge_turns - 1,
                    skillName:  skPreRows[0].name
                };
                const chargeMsg = (fxPre.charge_message || '{name} begins charging {skill}!')
                    .replace('{name}', actor.name)
                    .replace('{skill}', actor._charging.skillName);
                result.log.push(`⚡ ${chargeMsg}`);
                result.actions.push({ type: 'charge_start', actor: actor.name, skill: actor._charging.skillName });
                return result;
            }
        }
        return await resolveSkill(db, battle, actor, target, skillId, result, targetLimb, flavorText);
    }

    // --- SIGNATURE TECHNIQUE (Session 11) ---
    if (sigTechId && battle._settings?.enable_signature_techs) {
        const sigTechs = await BattleManager.getSignatureTechs(db, actor.charId);
        const tech = sigTechs.find(t => t.techId === parseInt(sigTechId));
        if (tech) {
            return await resolveSignatureTech(db, battle, actor, target, tech, result, targetLimb);
        }
        result.log.push(`${actor.name} tries to use an unknown technique...`);
        return result;
    }

    // --- ITEM ---
    if (itemId) {
        return await resolveItem(db, battle, actor, target, itemId, result);
    }
    // --- LIMIT BREAK ---
    if (limitId) {
        return await resolveLimitBreak(db, battle, actor, target, limitId, result, targetLimb);
    }


    // --- COMMAND ---
    const [cmdRows] = await db.query("SELECT * FROM game_battle_commands WHERE id=?", [commandId || 1]);
    if (!cmdRows.length) {
        result.log.push(`${actor.name} hesitates...`);
        return result;
    }

    const cmd = cmdRows[0];
    const effects = jp(cmd.effects, {});

    // OPEN MENU commands (Skills, Items) — client handles these, shouldn't reach here
    if (effects.open_menu) {
        result.log.push(`${actor.name} opens ${effects.open_menu} menu.`);
        return result;
    }

    // FLEE
    if (effects.flee) {
        return resolveFlee(battle, actor, target, effects.flee, result);
    }

    // DEFEND
    if (effects.set_status) {
        return resolveSetStatus(db, battle, actor, target, effects, cmd.name, result);
    }

    // ATTACK (damage command)
    if (effects.damage) {
        return await resolveDamage(db, battle, actor, target, effects, cmd.name, result, targetLimb, flavorText, commandId);
    }

    result.log.push(`${actor.name} does nothing.`);
    return result;
}

// --- RESOLVE DAMAGE ---
async function resolveDamage(db, battle, actor, target, effects, actionName, result, targetLimb, flavorText, commandId) {
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

    // Session 17: Weather effects on damage
    const skillElements = effects.elements || (effects.apply_weapon_elements ? actor.weaponElements : []);
    const isRangedAttack = effects.range && effects.range > 1;
    damage = applyWeatherEffects(battle, damage, skillElements?.[0], isRangedAttack, actor);

    // Critical hit check (luck-based)
    let crit = false;
    const weatherCritBonus = battle._weather?.combatEffects?.crit_bonus || 0;
    if (Math.random() * 100 < (actor.luck || 5) + weatherCritBonus * 100) {
        damage = Math.floor(damage * 1.5);
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

    // Minimum 1 damage
    damage = Math.max(1, damage);

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
        applyBleed(target, effects.bleed_tier, battle._bleedTiers, result);
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

// --- RESOLVE SKILL ---
// Teaching: This is the busiest function in the engine. It handles:
//   • Stance multipliers (POWER = physical ×1.4, MAGIC = magic ×1.4)
//   • Combo bonuses (if opponent has required status, deal more damage / extra hit)
//   • Multi-hit (fire damage loop N times, each hit can proc on-hit effects)
//   • Charge check (handled upstream in executeBattleAction)
//   • Normal offensive / healing / status / cure flows
async function resolveSkill(db, battle, actor, target, skillId, result, targetLimb, flavorText) {
    const [skillRows] = await db.query("SELECT * FROM game_skills WHERE id=?", [skillId]);
    if (!skillRows.length) {
        result.log.push(`${actor.name} tries to cast... nothing.`);
        return result;
    }
    const skill   = skillRows[0];
    const effects = jp(skill.effects, {});

    // Class-specific MP cost (with MAGIC stance discount applied)
    const [csRows] = await db.query("SELECT * FROM game_class_skills WHERE class_id=? AND skill_id=?",
        [actor.classId, skillId]);
    let mpCost = csRows.length ? csRows[0].mp_cost : 0;
    if (actor._stance === 'MAGIC') mpCost = Math.floor(mpCost * 0.7);

    if (actor.currentMp < mpCost) {
        result.log.push(`${actor.name} doesn't have enough MP! (Need ${mpCost})`);
        return result;
    }
    actor.currentMp -= mpCost;

    // Battle announce text
    const displayName = (csRows.length && csRows[0].alt_name) ? csRows[0].alt_name : skill.name;

    // ── Range check ─────────────────────────────────────────────────────
    // Only fires when both combatants have grid positions.
    // AoE (ALL_ENEMIES) and SELF skills skip range — they work regardless.
    if (target && effects.range !== undefined && effects.range !== 99
        && skill.target_type !== 'ALL_ENEMIES' && skill.target_type !== 'SELF') {
        if (!battle.isInRange(actor.charId, target.charId, effects.range)) {
            const dist = actor.gridX !== undefined && target.gridX !== undefined
                ? BattleState.chebyshev(actor, target) : '?';
            result.log.push(`⚠️ ${target.name} is out of range! (dist ${dist}, need ≤${effects.range}). Move closer.`);
            return result;
        }
    }

    const battleText  = (skill.battle_text || '{name} uses {skill}!')
        .replace('{name}', actor.name).replace('{skill}', displayName);
    result.log.push(battleText);

    // ── COMBO CHECK ─────────────────────────────────────────────────────
    // combo_requires: { status: "Blind", message: "Blindside!" }
    // combo_bonus:    { damage_mult: 2.0, extra_hits: 1 }
    let comboActive = false;
    let comboDamageMult = 1.0;
    let comboExtraHits  = 0;
    if (effects.combo_requires) {
        const reqStatus  = (effects.combo_requires.status || '').toLowerCase();
        const hasStatus  = target.statuses.some(s => s.name.toLowerCase() === reqStatus);
        if (hasStatus) {
            comboActive = true;
            const bonus = effects.combo_bonus || {};
            comboDamageMult = bonus.damage_mult || 1.5;
            comboExtraHits  = bonus.extra_hits  || 0;
            const comboMsg  = effects.combo_requires.message || `💥 COMBO: ${displayName}!`;
            result.log.push(`🔥 ${comboMsg}`);
            result.actions.push({ type: 'combo', skill: displayName, target: target.name });
        }
    }

    const vars     = buildFormulaVars(actor, target);
    const skillElems = jp(skill.elements, []);

    // ── AoE: radius-based (BG3 style) or flat ALL_ENEMIES ───────────────
    if (effects.damage && (skill.target_type === 'ALL_ENEMIES' || effects.aoe_radius)) {
        let targets;
        if (effects.aoe_radius && target && target.gridX !== undefined) {
            // Radius-based: hit all enemies within N tiles of the chosen target tile
            const allEnemies = battle.getEnemyTeam(actor.charId);
            targets = allEnemies.filter(e =>
                BattleState.chebyshev(e, target) <= effects.aoe_radius
            );
            result.log.push(`💥 ${displayName} — AoE radius ${effects.aoe_radius} around ${target.name}!`);
        } else {
            // Flat ALL_ENEMIES: hit everything
            targets = battle.getEnemyTeam(actor.charId);
            result.log.push(`💥 ${displayName} — strikes all enemies!`);
        }
        if (!targets.length) { result.log.push('No enemies left!'); return result; }
        result.log.push(`💥 ${displayName} — strikes all enemies!`);
        let grandTotal = 0;
        for (const aoeTarget of targets) {
            let dmg = Math.floor(safeEval(effects.damage.formula || 'MO*2-MD',
                buildFormulaVars(actor, aoeTarget)));
            if (effects.damage.randomize)
                dmg = Math.floor(dmg * (1 + (Math.random()*2-1)*effects.damage.randomize));
            if (actor._stance === 'POWER' && effects.damage.type !== 'magic') dmg = Math.floor(dmg * 1.4);
            if (actor._stance === 'MAGIC' && effects.damage.type === 'magic')  dmg = Math.floor(dmg * 1.4);
            if (comboActive) dmg = Math.floor(dmg * comboDamageMult);
            if (aoeTarget._stance === 'GUARD') dmg = Math.floor(dmg * 0.5);
            if (effects.aoe_split) dmg = Math.floor(dmg / Math.max(1, targets.length));
            dmg = Math.max(1, dmg);
            aoeTarget.currentHp = Math.max(0, aoeTarget.currentHp - dmg);
            grandTotal += dmg;
            result.log.push(`  → ${aoeTarget.name} takes ${dmg} damage!`);
            result.actions.push({ type: 'aoe_hit', target: aoeTarget.name, amount: dmg });
            aoeTarget.limitbreak = Math.min(100, aoeTarget.limitbreak + (dmg / aoeTarget.maxHp) * 50);
            await checkReactions(db, battle, aoeTarget, actor, result);
        }
        // AoE also damages battle objects in radius
        if (effects.aoe_radius && target && battle.battleObjects) {
            for (const obj of Object.values(battle.battleObjects)) {
                if (obj.destroyed) continue;
                const objDist = BattleState.chebyshev({ gridX: obj.x, gridY: obj.y }, target);
                if (objDist <= effects.aoe_radius) {
                    const objDmg = Math.max(1, Math.floor(safeEval(effects.damage.formula || 'MO*2-MD', vars) * 0.5));
                    const objRes = battle.damageObject(obj.x, obj.y, objDmg, battle);
                    if (objRes) {
                        result.log.push(`  → ${obj.label} takes ${objDmg} damage!`);
                        result.actions.push({ type: 'object_damage', objectKey: `${obj.x},${obj.y}`, label: obj.label, damage: objDmg });
                        if (objRes.destroyed) {
                            result.log.push(obj.onDestroy?.message || `${obj.label} is destroyed!`);
                            result.actions.push({ type: 'object_destroyed', objectKey: `${obj.x},${obj.y}`, label: obj.label });
                            for (const fx of (objRes.effects || [])) {
                                result.log.push(`  → ${fx.target} takes ${fx.damage} ${fx.type} damage!`);
                                result.actions.push({ type: fx.type, target: fx.target, amount: fx.damage });
                            }
                        }
                    }
                }
            }
        }
        battle.addLog({ actor: actor.name, action: displayName, aoe: true, total: grandTotal });
        if (effects.set_status) {
            for (const aoeTarget of targets)
                await resolveStatusFromEffect(db, battle, actor, aoeTarget, effects.set_status, result);
        }
        battle.checkWinCondition();
        if (battle.status !== 'ACTIVE') result.log.push(`The battle is over!`);
        return result;
    }

    // ── OFFENSIVE ───────────────────────────────────────────────────────
    if (effects.damage) {
        // Session 8: Active defense on skills (resolved once before the hit loop)
        let skillDefenseReduction = 0;
        if (battle._settings?.enable_active_defense && target && target.currentHp > 0) {
            trackDiminishingReturns(actor, displayName, battle._settings);
            const defChoice = target.isAI ? aiPickDefense(target) : (target._defaultDefense || 'block');
            // Estimate damage for defense context
            const estDmg = Math.floor(safeEval(effects.damage.formula || 'MO*2-MD', vars));
            const kiDodgeBonus = getKiRangedDodgeBonus(effects, battle._settings);
            const skillDefResult = resolveDefense(battle, actor, target, defChoice, estDmg, battle._settings, kiDodgeBonus);
            for (const log of skillDefResult.log) result.log.push(log);
            if (skillDefResult.dodged) {
                // Full dodge — shift and skip entire skill damage
                if (target.gridX !== undefined && battle.GRID_W) {
                    const ddx = target.gridX > actor.gridX ? 1 : (target.gridX < actor.gridX ? -1 : 0);
                    const ddy = target.gridY > actor.gridY ? 1 : (target.gridY < actor.gridY ? -1 : 0);
                    const nnx = Math.max(0, Math.min(battle.GRID_W - 1, target.gridX + ddx));
                    const nny = Math.max(0, Math.min(battle.GRID_H - 1, target.gridY + ddy));
                    const occ = Object.values(battle.combatants).some(
                        c => c.charId !== target.charId && c.currentHp > 0 && c.gridX === nnx && c.gridY === nny);
                    if (!occ && !battle.getObjectAt(nnx, nny)?.blocking && (nnx !== target.gridX || nny !== target.gridY)) {
                        target.gridX = nnx; target.gridY = nny;
                    }
                }
                result.actions.push({ type: 'dodge', target: target.name, success: true, skill: displayName });
                // Skip damage but still consume MP (spell was cast, just missed)
                battle.addLog({ actor: target.name, action: 'Dodge', text: `${target.name} dodges ${displayName}!` });
                // Still apply set_status / heal / cure below
                // But skip the damage block entirely
                // We use a goto-style flag
            } else {
                skillDefenseReduction = skillDefResult.reduction;
                if (skillDefResult.reduction > 0) {
                    result.actions.push({ type: 'block', target: target.name, reduction: skillDefResult.reduction, skill: displayName });
                }
            }
            // If dodged, skip the damage hit loop
            if (skillDefResult.dodged) {
                // Jump past the damage block to HEALING section
                // We'll use a condition below
            }
        }

        // Number of hits: base hits * (combo extra hits if active)
        const baseHits = effects.hits || 1;
        const totalHits = baseHits + (comboActive ? comboExtraHits : 0);
        const _skillDodged = battle._settings?.enable_active_defense && result.actions.some(a => a.type === 'dodge' && a.skill === displayName);

        // Preload elements once
        let allElems = [];
        if (skillElems.length && !_skillDodged) {
            [allElems] = await db.query("SELECT * FROM game_elements");
        }

        // Session 9: Flavor text RP bonus (evaluated once, applied per hit)
        let skillFlavorBonus = 0;
        if (flavorText && battle._settings?.enable_flavor_text && !_skillDodged) {
            const flavorResult = await evaluateFlavorText(db, battle, actor, flavorText, skillId, null, battle._settings);
            if (flavorResult.bonus > 0) {
                skillFlavorBonus = flavorResult.bonus;
                for (const log of flavorResult.log) result.log.push(log);
                result.log.push(`💬 "${flavorText}"`);
            }
        }

        let totalDamage = 0;
        if (_skillDodged) {
            // Skill was fully dodged — skip damage loop
            result.log.push(`${displayName} deals no damage!`);
        }
        for (let hit = 0; hit < totalHits && !_skillDodged; hit++) {
            let damage = Math.floor(safeEval(effects.damage.formula || 'MO*2-MD', vars));

            // Apply flavor text bonus
            if (skillFlavorBonus > 0) damage = Math.floor(damage * (1 + skillFlavorBonus));

            if (effects.damage.randomize) {
                damage = Math.floor(damage * (1 + (Math.random() * 2 - 1) * effects.damage.randomize));
            }

            // Stance multipliers
            if (actor._stance === 'POWER' && (effects.damage.type !== 'magic')) {
                damage = Math.floor(damage * 1.4);
            }
            if (actor._stance === 'MAGIC' && effects.damage.type === 'magic') {
                damage = Math.floor(damage * 1.4);
            }

            // Combo damage multiplier
            if (comboActive) damage = Math.floor(damage * comboDamageMult);

            // Multi-hit: each hit does 1/totalHits of normal (so total is roughly same)
            // But extra combo hits deal half per hit (bonus not penalty)
            if (baseHits > 1) damage = Math.floor(damage / baseHits);
            else if (hit >= baseHits) damage = Math.floor(damage * 0.5); // extra combo hits

            // Element bonuses
            for (const en of skillElems) {
                const elem = allElems.find(e => e.name.toLowerCase() === en.toLowerCase());
                if (elem) damage = Math.floor(damage * (1 + (elem.bonus_damage_pct || 0) / 100));
            }

            // Target GUARD stance halves incoming skill damage
            if (target._stance === 'GUARD') damage = Math.floor(damage * 0.5);

            // Session 8: Apply block reduction from active defense (resolved above)
            if (skillDefenseReduction > 0) {
                damage = Math.floor(damage * (1 - skillDefenseReduction));
            }

            damage = Math.max(1, damage);

            // ── Session 8: Limb routing for single-target skills ────
            let skillLimbResult = null;
            if (battle._settings?.enable_limb_targeting && target._limbHp && targetLimb) {
                // Called shot penalty for skills (only on first hit of multi-hit)
                let effectiveSkillLimb = targetLimb;
                if (hit === 0 && battle._settings?.enable_called_shot_penalty) {
                    const zone = target._limbZones?.find(z => z.key === targetLimb);
                    if (zone && zone.calledShotPenalty > 0 && Math.random() < zone.calledShotPenalty) {
                        effectiveSkillLimb = 'torso';
                        result.log.push(`⚠️ Called shot to ${zone.label} grazes — hits torso!`);
                    }
                }
                skillLimbResult = routeLimbDamage(target, damage, effectiveSkillLimb, battle._settings);
                target.currentHp = Math.max(0, target.currentHp - skillLimbResult.mainDamage);
                if (target._limbHp) {
                    target._woundLevels = getAllWoundLevels(target._limbHp, battle._settings);
                    applyWoundPenalties(target, battle._settings);
                }
            } else {
                target.currentHp = Math.max(0, target.currentHp - damage);
            }
            totalDamage += skillLimbResult ? skillLimbResult.mainDamage : damage;

            // Hit log (show each hit for multi-hit)
            if (skillLimbResult && skillLimbResult.limbDamage > 0) {
                const limbMsg = totalHits > 1 ? `Hit ${hit + 1}: ` : '';
                result.log.push(`${limbMsg}${target.name}'s ${skillLimbResult.limbLabel} takes ${skillLimbResult.limbDamage} damage! (${skillLimbResult.mainDamage} bleed-through)`);
                if (skillLimbResult.limbDisabled) {
                    result.log.push(`💀 ${target.name}'s ${skillLimbResult.limbLabel} is disabled!`);
                    result.actions.push({ type: 'limb_disabled', target: target.name, limb: skillLimbResult.limbKey, label: skillLimbResult.limbLabel });
                }
                if (skillLimbResult.knockedOut) {
                    result.log.push(`💫 ${target.name} is knocked out!`);
                    target._knockedOut = true;
                    target.currentHp = 0;
                }
            } else if (totalHits > 1) {
                result.log.push(`Hit ${hit + 1}: ${target.name} takes ${damage} damage!`);
            } else {
                result.log.push(`${target.name} takes ${damage} damage!`);
            }

            result.actions.push({ type: 'skill_damage', skill: displayName, target: target.name,
                                   amount: skillLimbResult ? skillLimbResult.mainDamage : damage,
                                   limbDamage: skillLimbResult?.limbDamage || 0,
                                   limb: skillLimbResult?.limbKey || null,
                                   elements: skillElems, hit: hit + 1, totalHits });

            // On-hit Ogham statuses proc per hit
            if (actor.oghamStatuses && Object.keys(actor.oghamStatuses).length) {
                for (const [statusName, oghamData] of Object.entries(actor.oghamStatuses)) {
                    const chance = typeof oghamData === 'number' ? oghamData : (oghamData.chance || 20);
                    if (Math.random() * 100 < chance) {
                        await applyStatus(db, target, statusName, null, result);
                    }
                }
            }

            // Early exit if target dies mid-combo
            if (target.currentHp <= 0) break;
        }

        battle.addLog({ actor: actor.name, action: displayName, damage: totalDamage,
                        hits: totalHits, combo: comboActive, target: target.name });

        // Reactions — target may counter-attack after taking skill damage
        if (target.currentHp > 0) {
            await checkReactions(db, battle, target, actor, result);
        }

        // Limit fill for defender (based on total combo damage)
        target.limitbreak = Math.min(100, target.limitbreak + (totalDamage / target.maxHp) * 100 * 0.5);
        // GUARD stance also fills limit faster when taking damage
        if (target._stance === 'GUARD') {
            target.limitbreak = Math.min(100, target.limitbreak + (totalDamage / target.maxHp) * 100 * 0.25);
        }

        // Session 9: Combo proc for skills with combo_chance
        if (target.currentHp > 0 && battle.status === 'ACTIVE' && skill.combo_chance > 0) {
            await resolveComboProc(db, battle, actor, target,
                parseFloat(skill.combo_chance),
                parseInt(skill.combo_max_chain) || 1,
                displayName, result);
        }
    }

    // ── HEALING ─────────────────────────────────────────────────────────
    if (effects.heal) {
        let heal = Math.floor(safeEval(effects.heal.formula || 'MO*3+50', vars));
        if (actor._stance === 'MAGIC') heal = Math.floor(heal * 1.4); // MAGIC stance boosts heals too
        const healTarget = (skill.target_type === 'SELF' || skill.target_type === 'ALLY') ? actor : target;
        healTarget.currentHp = Math.min(healTarget.maxHp, healTarget.currentHp + heal);
        result.log.push(`${healTarget.name} recovers ${heal} HP!`);
        result.actions.push({ type: 'heal', target: healTarget.name, amount: heal });
    }

    // ── Session 8: LIMB HEALING ─────────────────────────────────────
    // Skills with heal_limb column heal a specific limb zone.
    // heal_limb = 'head', 'legs', etc. OR 'any' (player chose via targetLimb)
    if (skill.heal_limb && battle._settings?.enable_limb_targeting) {
        const healTarget = (skill.target_type === 'SELF' || skill.target_type === 'ALLY') ? actor : target;
        if (healTarget._limbHp) {
            const limbKey = skill.heal_limb === 'any' ? (targetLimb || 'torso') : skill.heal_limb;
            const limbData = healTarget._limbHp[limbKey];
            if (limbData) {
                let limbHeal = Math.floor(safeEval(
                    effects.heal?.formula || effects.heal_limb?.formula || 'MO*2+30', vars
                ));
                if (actor._stance === 'MAGIC') limbHeal = Math.floor(limbHeal * 1.4);
                const before = limbData.current;
                limbData.current = Math.min(limbData.max, limbData.current + limbHeal);
                const actualHeal = limbData.current - before;
                if (actualHeal > 0) {
                    healTarget._woundLevels = getAllWoundLevels(healTarget._limbHp, battle._settings);
                    applyWoundPenalties(healTarget, battle._settings);
                    const zone = healTarget._limbZones?.find(z => z.key === limbKey);
                    result.log.push(`🩹 ${healTarget.name}'s ${zone?.label || limbKey} recovers ${actualHeal} HP!`);
                    result.actions.push({ type: 'limb_heal', target: healTarget.name, limb: limbKey, amount: actualHeal });
                }
            }
        } else {
            // Limb targeting disabled — limb heal just adds to main HP
            let fallbackHeal = Math.floor(safeEval(effects.heal?.formula || 'MO*2+30', vars));
            if (actor._stance === 'MAGIC') fallbackHeal = Math.floor(fallbackHeal * 1.4);
            healTarget.currentHp = Math.min(healTarget.maxHp, healTarget.currentHp + fallbackHeal);
            result.log.push(`${healTarget.name} recovers ${fallbackHeal} HP!`);
            result.actions.push({ type: 'heal', target: healTarget.name, amount: fallbackHeal });
        }
    }

    // ── STATUS EFFECTS ───────────────────────────────────────────────────
    if (effects.set_status) {
        await resolveStatusFromEffect(db, battle, actor, target, effects.set_status, result);
    }

    // ── Session 10: BLEED APPLICATION ────────────────────────────────────
    if (skill.bleed_tier && battle._settings?.enable_bleed_tiers && battle._bleedTiers && target.currentHp > 0) {
        applyBleed(target, skill.bleed_tier, battle._bleedTiers, result);
    }

    // ── Session 21: REVIVE ──────────────────────────────────────────────
    if (skill.is_revive && target && (target.currentHp <= 0 || target._knockedOut)) {
        resolveRevive(battle, actor, target, parseFloat(skill.revive_hp_pct) || 0.25, result);
    }

    // ── CURE STATUSES ────────────────────────────────────────────────────
    const healStatus = jp(skill.heal_status, []);
    if (healStatus.length) {
        const cureTarget = skill.target_type === 'SELF' ? actor : target;
        cureTarget.statuses = cureTarget.statuses.filter(s => !healStatus.includes(s.id));
        result.log.push(`${cureTarget.name}'s status ailments are cured!`);
    }

    // ── DEATH / KNOCKOUT CHECK ─────────────────────────────────────────
    if (target.currentHp <= 0) {
        const isNonLethalSkill = !!(skill.is_nonlethal);
        checkDeathOrKnockout(battle, actor, target, result, { isNonLethalSkill });
    }

    return result;
}

// --- RESOLVE ITEM ---
async function resolveItem(db, battle, actor, target, itemId, result) {
    // Session 8: Right arm disabled = can't use items
    if (actor._woundFlags?.cant_use_items) {
        result.log.push(`${actor.name}'s arm is too wounded to use items!`);
        return result;
    }

    // Check inventory
    const [inv] = await db.query("SELECT * FROM character_items WHERE character_id=? AND item_id=?",
        [actor.charId, itemId]);
    if (!inv.length || inv[0].quantity < 1) {
        result.log.push(`${actor.name} doesn't have that item!`);
        return result;
    }

    // Get item data
    const [itemRows] = await db.query("SELECT * FROM game_items WHERE id=?", [itemId]);
    if (!itemRows.length || itemRows[0].type !== 'CONSUMABLE') {
        result.log.push(`${actor.name} can't use that in battle!`);
        return result;
    }

    const item = itemRows[0];
    const effects = jp(item.effects, {});

    result.log.push(`${actor.name} uses ${item.icon || '🧪'} ${item.name}!`);

    // Heal HP
    if (effects.heal_hp) {
        const vars = buildFormulaVars(actor, target);
        const heal = Math.floor(safeEval(effects.heal_hp.formula || '50', vars));
        actor.currentHp = Math.min(actor.maxHp, actor.currentHp + heal);
        result.log.push(`${actor.name} recovers ${heal} HP!`);
        result.actions.push({ type: 'heal', target: actor.name, amount: heal });
    }

    // Heal MP
    if (effects.heal_mp) {
        const vars = buildFormulaVars(actor, target);
        const heal = Math.floor(safeEval(effects.heal_mp.formula || '30', vars));
        actor.currentMp = Math.min(actor.maxMp, actor.currentMp + heal);
        result.log.push(`${actor.name} recovers ${heal} MP!`);
    }

    // Cure statuses
    if (effects.cure_status) {
        const toCure = Array.isArray(effects.cure_status) ? effects.cure_status : [effects.cure_status];
        actor.statuses = actor.statuses.filter(s => !toCure.includes(s.id));
        result.log.push(`Status cured!`);
    }

    // Session 8: Heal a specific limb (e.g. splint, bandage, bone-mend potion)
    // Item effects: { "heal_limb": { "limb": "legs", "amount": 50 } }
    // OR: { "heal_limb": { "limb": "any", "amount": 30 } } (player chooses via targetLimb)
    if (effects.heal_limb && battle._settings?.enable_limb_targeting && actor._limbHp) {
        const limbKey = effects.heal_limb.limb === 'any'
            ? (actor._targetLimb || 'torso')
            : effects.heal_limb.limb;
        const limbData = actor._limbHp[limbKey];
        if (limbData) {
            const amount = effects.heal_limb.amount || 30;
            const before = limbData.current;
            limbData.current = Math.min(limbData.max, limbData.current + amount);
            const actualHeal = limbData.current - before;
            if (actualHeal > 0) {
                actor._woundLevels = getAllWoundLevels(actor._limbHp, battle._settings);
                applyWoundPenalties(actor, battle._settings);
                const zone = actor._limbZones?.find(z => z.key === limbKey);
                result.log.push(`🩹 ${actor.name}'s ${zone?.label || limbKey} recovers ${actualHeal} HP!`);
                result.actions.push({ type: 'limb_heal', target: actor.name, limb: limbKey, amount: actualHeal });
            }
        }
    }

    // Consume the item
    if (inv[0].quantity > 1) {
        await db.query("UPDATE character_items SET quantity=quantity-1 WHERE id=?", [inv[0].id]);
    } else {
        await db.query("DELETE FROM character_items WHERE id=?", [inv[0].id]);
    }

    return result;
}

// --- RESOLVE LIMIT BREAK ---
async function resolveLimitBreak(db, battle, actor, target, limitId, result, targetLimb) {
    // Get limit data
    const [limRows] = await queryLimitBreakRow(db, limitId, actor.classId);
    if (!limRows.length) {
        result.log.push(`${actor.name} can't use that limit break!`);
        return result;
    }

    const limit = limRows[0];

    // Check bar is full and break level matches
    if (actor.limitbreak < 100) {
        result.log.push(`Limit break bar not full!`);
        return result;
    }
    if (limit.break_level > actor.breaklevel) {
        result.log.push(`Limit break level too low!`);
        return result;
    }
    if (limit.char_level_req > actor.level) {
        result.log.push(`Character level too low for this limit!`);
        return result;
    }

    // Consume limit bar
    actor.limitbreak = 0;

    const effects = jp(limit.effects, {});
    const vars = buildFormulaVars(actor, target);

    const logText = (effects.log || `{name} unleashes ${limit.name}!`).replace('{name}', actor.name);
    result.log.push(`💥 LIMIT BREAK: ${logText}`);
    result.actions.push({ type: 'limit_break', name: limit.name, icon: limit.icon });

    // Damage
    if (effects.damage) {
        let damage = Math.floor(safeEval(effects.damage.formula || 'ATK*4', vars));
        if (effects.damage.randomize) {
            damage = Math.floor(damage * (1 + (Math.random() * 2 - 1) * effects.damage.randomize));
        }
        // Apply stance multipliers to limit breaks too
        if (actor._stance === 'POWER' && effects.damage.type !== 'magic') damage = Math.floor(damage * 1.4);
        if (actor._stance === 'MAGIC' && effects.damage.type === 'magic')  damage = Math.floor(damage * 1.4);
        if (target._stance === 'GUARD') damage = Math.floor(damage * 0.5);
        damage = Math.max(1, damage);

        // Session 8: Limb routing for limit breaks
        let limitLimbResult = null;
        if (battle._settings?.enable_limb_targeting && target._limbHp && targetLimb) {
            limitLimbResult = routeLimbDamage(target, damage, targetLimb, battle._settings);
            target.currentHp = Math.max(0, target.currentHp - limitLimbResult.mainDamage);
            if (target._limbHp) {
                target._woundLevels = getAllWoundLevels(target._limbHp, battle._settings);
                applyWoundPenalties(target, battle._settings);
            }
        } else {
            target.currentHp = Math.max(0, target.currentHp - damage);
        }

        if (limitLimbResult && limitLimbResult.limbDamage > 0) {
            result.log.push(`${target.name}'s ${limitLimbResult.limbLabel} takes ${limitLimbResult.limbDamage} damage! (${limitLimbResult.mainDamage} bleed-through)`);
            if (limitLimbResult.limbDisabled) {
                result.log.push(`💀 ${target.name}'s ${limitLimbResult.limbLabel} is disabled!`);
                result.actions.push({ type: 'limb_disabled', target: target.name, limb: limitLimbResult.limbKey });
            }
            if (limitLimbResult.knockedOut) {
                target._knockedOut = true;
                target.currentHp = 0;
            }
        } else {
            result.log.push(`${target.name} takes ${damage} damage!`);
        }
        result.actions.push({ type: 'limit_damage', target: target.name, amount: limitLimbResult ? limitLimbResult.mainDamage : damage,
                              limbDamage: limitLimbResult?.limbDamage || 0, limb: limitLimbResult?.limbKey || null });
    }

    // Heal
    if (effects.heal) {
        const heal = Math.floor(safeEval(effects.heal.formula || 'MAXHP*0.3', vars));
        actor.currentHp = Math.min(actor.maxHp, actor.currentHp + heal);
        result.log.push(`${actor.name} recovers ${heal} HP!`);
    }

    // Status
    if (effects.set_status) {
        await resolveStatusFromEffect(db, battle, actor, target, effects.set_status, result);
    }

    // Check death or knockout
    if (target.currentHp <= 0) {
        checkDeathOrKnockout(battle, actor, target, result);
    }

    return result;
}

// =================================================================
// SESSION 8: UNIFIED DEATH / KNOCKOUT CHECK
// =================================================================
// Replaces the scattered inline `if (target.currentHp <= 0)` checks.
// Determines whether a finishing blow results in KILL or KNOCKOUT.
//
// KO triggers when:
//   1. Attacker has _nonLethal toggled on, OR
//   2. The skill/command that dealt the blow has is_nonlethal flag, OR
//   3. Head limb was disabled (knockout from wound system)
//
// KO'd combatants are out of the fight (same as dead for win condition)
// but alive for post-battle interaction (interrogate, recruit, loot, release).

function checkDeathOrKnockout(battle, actor, target, result, { isNonLethalSkill = false } = {}) {
    if (target.currentHp > 0 && !target._knockedOut) return; // still alive
    if (target._knockedOut) return; // already handled by head-disable KO

    const settings = battle._settings || {};
    const nonLethalEnabled = settings.enable_nonlethal;

    // Determine if this is a knockout or a kill
    const isKO = nonLethalEnabled && (
        actor._nonLethal ||
        isNonLethalSkill ||
        false // head-disable KO is handled inline in routeLimbDamage
    );

    if (isKO) {
        target._knockedOut = true;
        target.currentHp = 0;
        result.log.push(`💫 ${target.name} is knocked unconscious!`);
        result.actions.push({ type: 'knockout', target: target.name, actor: actor.name });
        battle.addLog({ actor: actor.name, text: `${target.name} knocked out!`, knockout: true });
    } else {
        result.log.push(`${target.name} has been defeated!`);
        result.actions.push({ type: 'kill', target: target.name, actor: actor.name });
    }

    // In both cases, check if battle is over
    // Use team-aware check instead of setting winner directly
    battle.checkWinCondition();
    if (battle.status === 'FINISHED') {
        result.log.push('The battle is over!');
    }
}

// --- RESOLVE FLEE ---
function resolveFlee(battle, actor, target, fleeDef, result) {
    // TEACHING: You can never flee a PvP battle — that would let a losing player
    // deny the winner their reward. Fleeing is only for PvE encounters.
    if (battle.type === 'PVP') {
        result.log.push(`${actor.name} cannot flee a PvP battle!`);
        return result;
    }

    // Session 8: Leg wounds can prevent fleeing
    if (actor._woundFlags?.cant_flee) {
        result.log.push(`${actor.name}'s legs are too wounded to flee!`);
        return result;
    }

    const vars = buildFormulaVars(actor, target);
    const check = safeEval(fleeDef.formula || 'SPEED+LUCK*0.5-ENEMY_SPEED', vars);

    if (check > 0 || Math.random() < 0.3) { // Speed advantage or 30% base chance
        battle.status = 'FLED';
        battle.winner = null; // No winner on flee
        const logText = (fleeDef.log_success || '{name} escapes!').replace('{name}', actor.name);
        result.log.push(logText);
    } else {
        const logText = (fleeDef.log_fail || "{name} couldn't escape!").replace('{name}', actor.name);
        result.log.push(logText);
    }
    return result;
}

// --- RESOLVE SET STATUS (from commands like Defend) ---
async function resolveSetStatus(db, battle, actor, target, effects, actionName, result) {
    const logText = (effects.log || `{name} uses ${actionName}!`).replace('{name}', actor.name);
    result.log.push(logText);

    if (effects.set_status) {
        await resolveStatusFromEffect(db, battle, actor, target, effects.set_status, result);
    }
    return result;
}

// --- APPLY STATUS FROM EFFECT JSON ---
async function resolveStatusFromEffect(db, battle, actor, target, statusEffect, result) {
    const setTarget = statusEffect.target === 'self' ? actor : target;
    const chance = statusEffect.chance || 100;
    const statuses = statusEffect.statuses || {};

    for (const [statusName, duration] of Object.entries(statuses)) {
        // Chance check
        if (Math.random() * 100 > chance) continue;

        // Check if armor blocks this status
        if (setTarget.armorBlockStatuses.length) {
            const [sRow] = await db.query("SELECT id FROM game_statuses WHERE name=?", [statusName]);
            if (sRow.length && setTarget.armorBlockStatuses.includes(sRow[0].id)) {
                result.log.push(`${setTarget.name}'s armor blocks ${statusName}!`);
                continue;
            }
        }

        await applyStatus(db, setTarget, statusName, duration, result);
    }
}

// --- APPLY A SINGLE STATUS ---
async function applyStatus(db, target, statusName, duration, result) {
    // Look up by name (case insensitive)
    const [sRows] = await db.query("SELECT * FROM game_statuses WHERE LOWER(name)=LOWER(?)", [statusName]);
    if (!sRows.length) return;

    const status = sRows[0];

    // Check if already has this status
    const existing = target.statuses.findIndex(s => s.id === status.id);
    if (existing >= 0) {
        // Refresh duration
        target.statuses[existing].turns = duration || status.default_duration;
    } else {
        target.statuses.push({
            id: status.id,
            name: status.name,
            icon: status.icon,
            turns: duration || status.default_duration
        });
        result.log.push(`${target.name} is afflicted with ${status.icon} ${status.name}!`);
    }
}

// =================================================================
// REACTIONS — passive on-hit skill triggers
// =================================================================
// TEACHING: Reactions let defenders "fire back" automatically.
// A skill marked as a reaction has  effects.reaction.trigger = "on_hit"
// (or "on_crit"). After damage lands, we roll each reaction.
// Reactions call resolveSkill in reverse: the VICTIM is the actor.
//
// Example skill effects JSON that creates a reaction:
//   {
//     "reaction": { "trigger": "on_hit", "chance": 30 },
//     "damage": { "formula": "ATK*1.5", "type": "physical" },
//     "log": "{name} counter-attacks!"
//   }
//
// crit = boolean, was this a critical hit (for "on_crit" reactions)
async function checkReactions(db, battle, victim, attacker, result, { crit = false } = {}) {
    if (!victim.reactions || !victim.reactions.length) return;
    if (victim.currentHp <= 0) return; // dead, can't react

    for (const reaction of victim.reactions) {
        // Check trigger condition
        if (reaction.trigger === 'on_crit' && !crit) continue;
        if (reaction.trigger === 'on_kill') continue; // on_kill is checked elsewhere

        // Roll chance
        if (Math.random() * 100 >= reaction.chance) continue;

        result.log.push(`↩️ ${reaction.icon} ${victim.name}'s ${reaction.name} triggers!`);
        result.actions.push({ type: 'reaction', name: reaction.name, icon: reaction.icon, actor: victim.name });

        // Fire the reaction skill (victim attacks attacker)
        // We clone result so sub-logs appear inline
        const subResult = { actor: victim.name, actions: [], log: [] };
        victim._chargingFire = true; // skip charge check for reactions
        await resolveSkill(db, battle, victim, attacker, reaction.skillId, subResult);
        victim._chargingFire = false;

        // Merge sub logs into main result
        result.log.push(...subResult.log);
        result.actions.push(...subResult.actions);

        // Only fire ONE reaction per hit (first that rolls in)
        break;
    }
}

// =================================================================
// STATUS EFFECTS — End-of-turn processing
// =================================================================
async function processStatusEffects(db, battle) {
    // TEACHING: Returns a tickResult so the caller can broadcast status
    // notifications as popups. Without this, Poison damage is silent.
    const tickResult = { actor: 'status', actions: [], log: [] };

    for (const charId of Object.keys(battle.combatants)) {
        const c = battle.combatants[charId];
        const toRemove = [];
        const sortedStatuses = [...c.statuses];

        for (let i = 0; i < sortedStatuses.length; i++) {
            const s = sortedStatuses[i];
            const [sRows] = await db.query("SELECT * FROM game_statuses WHERE id=?", [s.id]);
            if (!sRows.length) { toRemove.push(i); continue; }

            const effects = jp(sRows[0].effects, {});

            // Damage per turn (Poison, Burn)
            if (effects.damage_per_turn) {
                const vars = { MAXHP: c.maxHp, MO: c.mo, LVL: c.level, ATK: c.atk };
                const dmg = Math.max(1, Math.floor(safeEval(effects.damage_per_turn.formula || '10', vars)));
                c.currentHp = Math.max(0, c.currentHp - dmg);
                const logText = (effects.log || `{name} takes ${dmg} status damage!`).replace('{name}', c.name);
                battle.addLog({ actor: 'status', text: logText });
                tickResult.log.push(`${s.icon} ${logText}`);
                tickResult.actions.push({ type: 'status_damage', target: c.name, amount: dmg, status: s.name });
            }

            // Heal per turn (Regen)
            if (effects.heal_per_turn) {
                const vars = { MAXHP: c.maxHp, MO: c.mo, LVL: c.level, MLVL: c.level };
                const heal = Math.floor(safeEval(effects.heal_per_turn.formula || '20', vars));
                c.currentHp = Math.min(c.maxHp, c.currentHp + heal);
                const logText = (effects.log || `{name} regenerates.`).replace('{name}', c.name);
                battle.addLog({ actor: 'status', text: logText });
                tickResult.log.push(`${s.icon} ${logText}`);
                tickResult.actions.push({ type: 'status_heal', target: c.name, amount: heal, status: s.name });
            }

            // Decrement duration
            s.turns--;
            if (s.turns <= 0 && !sRows[0].permanent) {
                toRemove.push(i);
                const wearOff = `${s.icon} ${s.name} wears off ${c.name}.`;
                battle.addLog({ actor: 'status', text: wearOff });
                tickResult.log.push(wearOff);
            }
        }

        c.statuses = c.statuses.filter((_, i) => !toRemove.includes(i));

        // ── Burning terrain spread ─────────────────────────────────
        // TEACHING: If a combatant has the 'Burning' status and they're
        // standing on a non-water tile, their tile becomes a 'fire' terrain.
        // Adjacent living combatants on 'fire' terrain take 8 flat damage.
        // Water terrain extinguishes fire automatically.
        // This is "environmental hazard" gameplay — positioning matters!
        const isBurning = c.statuses.find(s => s.name === 'Burning');
        if (isBurning && c.currentHp > 0 && c.gridX !== undefined && battle.terrainMap) {
            const tileKey = `${c.gridX},${c.gridY}`;
            const currentTile = battle.terrainMap[tileKey] || 'open';

            // Water extinguishes
            if (currentTile === 'water') {
                // Remove Burning status
                c.statuses = c.statuses.filter(s => s.name !== 'Burning');
                battle.addLog({ actor: 'status', text: `💧 ${c.name}'s Burning is extinguished by water!` });
                tickResult.log.push(`💧 ${c.name}'s Burning doused by water!`);
            } else {
                // Set tile to fire
                battle.terrainMap[tileKey] = 'fire';
                // Tick fire damage to anyone on adjacent fire tiles
                const adjacents = Object.values(battle.combatants).filter(other =>
                    other.charId !== c.charId &&
                    other.currentHp > 0 &&
                    other.gridX !== undefined &&
                    BattleState.chebyshev(c, other) <= 1 &&
                    (battle.terrainMap[`${other.gridX},${other.gridY}`] === 'fire')
                );
                for (const burned of adjacents) {
                    const fireDmg = 8;
                    burned.currentHp = Math.max(0, burned.currentHp - fireDmg);
                    battle.addLog({ actor: 'status', text: `🔥 ${burned.name} is scorched by spreading fire! (${fireDmg} dmg)` });
                    tickResult.log.push(`🔥 ${burned.name} takes ${fireDmg} fire terrain dmg`);
                    tickResult.actions.push({ type: 'status_damage', target: burned.name, amount: fireDmg, status: 'Fire Terrain' });
                }
            }
        }
    }

    // Session 10: Ki channeling tick + Bleed ticks
    for (const charId of Object.keys(battle.combatants)) {
        const c = battle.combatants[charId];
        if (c.currentHp <= 0 || c._knockedOut) continue;

        // Ki channel countdown
        if (battle._settings?.enable_ki_channeling) {
            tickKiChannel(c, tickResult);
        }

        // Bleed ticks
        if (battle._settings?.enable_bleed_tiers) {
            tickBleeds(c, tickResult);
        }

        // Session 12: RP effect ticks (taunt, intimidate, rally)
        if (battle._settings?.enable_rp_commands) {
            tickRpEffects(c);
        }
    }

    // Session 15: Summon duration ticks
    if (battle._settings?.enable_summons) {
        tickSummons(battle, tickResult);
    }

    // Combo AP regen
    if (battle._settings?.enable_combo_input) {
        const apRegen = parseInt(battle._settings.combo_ap_regen_per_turn) || 3;
        for (const c of Object.values(battle.combatants)) {
            if (c.currentHp > 0 && !c._knockedOut && c._currentAp !== undefined) {
                c._currentAp = Math.min(c._maxAp || 6, c._currentAp + apRegen);
            }
        }
    }

    // Session 20: Transform duration ticks
    if (battle._settings?.enable_transformations) {
        for (const c of Object.values(battle.combatants)) {
            if (c.currentHp > 0 && !c._knockedOut) tickTransform(c, tickResult);
        }
    }

    // Session 24: Evaluate battle rules on turn_end
    const turnActor = battle.combatants[battle.turnCharId];
    await evaluateBattleRules(db, battle, 'turn_end', turnActor, tickResult);

    return tickResult; // caller uses this to broadcast popup notifications
}

function checkDeaths(battle) {
    // Delegate to the new team-aware win condition check
    battle.checkWinCondition();
}

// =================================================================
// END BATTLE — Save results, give rewards
// =================================================================
async function endBattle(db, io, battle) {
    // Update DB record
    await db.query("UPDATE game_battles SET status=?, winner_char_id=?, battle_log=? WHERE id=?",
        [battle.status, battle.winner, JSON.stringify(battle.log), battle.id]);

    // Sync HP/MP/Limit/Statuses back to characters table
    for (const [charId, c] of Object.entries(battle.combatants)) {
        await db.query(
            `UPDATE characters SET current_hp=?, current_mp=?, limitbreak=?, status_effects=? WHERE id=?`,
            [Math.max(0, c.currentHp), Math.max(0, c.currentMp), c.limitbreak,
             JSON.stringify(c.statuses), charId]
        );
    }

    // =========================================================
    // DEFEAT SCREEN — notify losing human players
    // =========================================================
    // TEACHING: We iterate every combatant. If they lost (hp=0, not winner)
    //   AND they're a real player (isAI === false), we emit 'battle_defeat'
    //   to their socket. This works for both PvP losers and PvE deaths.
    //   The client shows a gravestone screen with a Respawn button.
    if (battle.status === 'FINISHED') {
        try {
            const battleSockets = await io.in('battle_' + battle.id).fetchSockets();
            for (const [cid, combatant] of Object.entries(battle.combatants)) {
                const charId = parseInt(cid);
                if (combatant.isAI) continue;             // NPC — no screen needed
                if (charId === battle.winner) continue;   // They won — gets victory screen

                // This is a human who lost — find their socket and send defeat info
                const loserSocket = (battleSockets || []).find(s => s._battleCharId === charId);

                // Session 23: Afterlife — if truly dead (not KO'd), send to afterlife
                let afterlifeInfo = null;
                if (battle._settings?.enable_afterlife && !combatant._knockedOut && combatant.currentHp <= 0) {
                    afterlifeInfo = await handleDeath(db, io, charId);
                }

                const defeatPayload = {
                    won:        false,
                    enemyName:  battle.combatants[battle.winner] ? battle.combatants[battle.winner].name : 'Unknown',
                    battleType: battle.type,
                    afterlife:  afterlifeInfo
                };
                if (loserSocket) loserSocket.emit('battle_defeat', defeatPayload);
            }
        } catch(defeatErr) { console.error('battle_defeat emit error (non-fatal):', defeatErr); }

    // Post-battle action chains (on_win / on_lose from BATTLE event type)
    // Tell each human socket whether they won so _run_post_battle picks the right branch
    try {
        const allBattleSockets = await io.in('battle_' + battle.id).fetchSockets();
        for (const bs of (allBattleSockets || [])) {
            if (bs._postBattleActions) {
                const bsWon = bs._battleCharId === battle.winner;
                bs.emit('_run_post_battle', { won: bsWon });
            }
        }
    } catch { /* non-fatal */ }

    // =========================================================
    // SESSION 8: POST-BATTLE KNOCKOUT INTERACTIONS
    // =========================================================
    // Find all KO'd combatants and offer the winners choices.
    // KO'd NPCs: interrogate, recruit, loot, release
    // KO'd PvP players: spare or finish
    try {
        const koNpcs = [];
        const koPvpPlayers = [];

        for (const [cid, c] of Object.entries(battle.combatants)) {
            if (!c._knockedOut) continue;

            if (c.isAI) {
                // KO'd NPC — record in DB and prepare interaction options
                const knockedOutBy = Object.values(battle.combatants).find(
                    w => w.currentHp > 0 && !w._knockedOut && !w.isAI && w.teamId !== c.teamId
                );
                if (knockedOutBy) {
                    try {
                        await db.query(
                            `INSERT INTO game_battle_knockouts (battle_id, npc_char_id, npc_name, knocked_out_by, ko_method)
                             VALUES (?, ?, ?, ?, ?)`,
                            [battle.id, parseInt(cid), c.name, knockedOutBy.charId, 'nonlethal']
                        );
                    } catch {} // table might not exist yet

                    const actions = ['interrogate', 'loot', 'release'];
                    // Check if NPC is recruitable
                    try {
                        const [npcRow] = await db.query(
                            'SELECT is_recruitable FROM game_npcs WHERE char_id=? LIMIT 1', [parseInt(cid)]);
                        if (npcRow.length && npcRow[0].is_recruitable) actions.splice(1, 0, 'recruit');
                    } catch {}

                    koNpcs.push({
                        charId: parseInt(cid), name: c.name,
                        icon: c.icon || '💫',
                        actions
                    });
                }
            } else {
                // KO'd human player in PvP
                koPvpPlayers.push({
                    charId: parseInt(cid), name: c.name
                });
            }
        }

        // Emit KO interaction options to winning players
        if (koNpcs.length || koPvpPlayers.length) {
            const battleSockets = await io.in('battle_' + battle.id).fetchSockets();
            const winnerTeamId = battle.winnerTeamId;
            const winTeamIds = winnerTeamId ? (battle.teams[winnerTeamId] || []) : [];

            for (const wid of winTeamIds) {
                const wc = battle.combatants[wid];
                if (!wc || wc.isAI || wc.currentHp <= 0) continue;
                const sock = (battleSockets || []).find(s => s._battleCharId === wid);
                if (!sock) continue;

                if (koNpcs.length) {
                    sock.emit('battle_ko_interact', { koNpcs, battleId: battle.id });
                }
                if (koPvpPlayers.length) {
                    sock.emit('pvp_ko_choice', {
                        koPvpPlayers,
                        battleId: battle.id,
                        repBonusSpare: battle._settings?.nonlethal_rep_bonus_release || 5,
                        repPenaltyFinish: battle._settings?.nonlethal_rep_penalty_finish || -10
                    });
                }
            }
        }
    } catch (koErr) {
        console.error('[Battle] KO interaction error (non-fatal):', koErr.message);
    }
    }

    // =============================================================
    // LEGENDARY ARTIFACTS HOOK (OPTIONAL)
    // =============================================================
    // If you have routes/artifactRoutes.js with onPvpKill(), this makes
    // artifacts "come alive" automatically when a PvP kill happens.
    // It is wrapped in try/catch so missing modules never break battles.
    if (
        battle.type === 'PVP' &&
        battle.status === 'FINISHED' &&
        battle.winner &&
        artifactRoutes &&
        typeof artifactRoutes.onPvpKill === 'function'
    ) {
        const loserId = Object.keys(battle.combatants).map(Number)
            .find(id => id !== battle.winner);

        if (loserId) {
            try {
                // Pull a tiny bit of context (location) for logging / future features.
                const [posRows] = await db.query(
                    "SELECT id, map_id, x, y FROM characters WHERE id IN (?,?)",
                    [battle.winner, loserId]
                );
                const posById = {};
                for (const r of posRows) posById[r.id] = r;

                const hookRes = await artifactRoutes.onPvpKill(
                    battle.winner,
                    loserId,
                    {
                        location: {
                            mapId: posById[battle.winner]?.map_id ?? null,
                            x: posById[battle.winner]?.x ?? null,
                            y: posById[battle.winner]?.y ?? null
                        },
                        timestamp: Date.now(),
                        // Your PvP challenges are basically "duels" right now.
                        // Set to false so artifacts can transfer in normal PvP.
                        // If you later add a duel ladder, you can set this true there.
                        isDuel: false
                    }
                );

                // Optional broadcast: clients may listen for this to show global announcements.
                if (hookRes && hookRes.transferred && io && typeof io.emit === 'function') {
                    io.emit('artifact_transfer', hookRes);
                }
            } catch (e) {
                console.error('Artifact onPvpKill hook failed:', e);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // REWARDS — split across all surviving players (party-aware)
    // TEACHING: In 1v1 there's one winner. In party PvE, ALL surviving
    // players win together and share XP/gold equally. Each gets the
    // full per-fight XP from the level table divided by party size.
    // This keeps levelling fair regardless of party size.
    // ─────────────────────────────────────────────────────────────────
    if (battle.status === 'FINISHED' && battle.winner !== null) {

        // Determine who won — find the winning team
        const winnerCharId = typeof battle.winner === 'number' ? battle.winner : parseInt(battle.winner);
        const winnerTeamId = battle.winnerTeamId || Object.keys(battle.teams).find(
            tId => (battle.teams[tId] || []).includes(winnerCharId));
        // Check if the winning team has human players (not just AI)
        const winTeamMembers = winnerTeamId ? (battle.teams[winnerTeamId] || []) : [];
        const playersWon = winTeamMembers.some(id => battle.combatants[id] && !battle.combatants[id].isAI);

        if (playersWon) {
            // Get all surviving player characters from the winning team
            const survivingPlayers = winTeamMembers
                .map(id => battle.combatants[id])
                .filter(c => c && c.currentHp > 0 && !c.isAI);

            const partySize = Math.max(1, survivingPlayers.length);

            // Use the HIGHEST enemy level for XP lookup (from all losing teams)
            const losingTeamIds = Object.keys(battle.teams).filter(t => t !== winnerTeamId);
            const allEnemies = losingTeamIds.flatMap(t => (battle.teams[t] || [])
                .map(id => battle.combatants[id]).filter(Boolean));
            const topEnemy = allEnemies.sort((a, b) => b.level - a.level)[0];

            const [lvlRows] = topEnemy ? await queryLevelRow(db, topEnemy.level) : [[]];
            const baseXp    = lvlRows.length ? (lvlRows[0].xp_for_win   || 0) : 0;
            const baseGold  = lvlRows.length ? (lvlRows[0].gold_for_win || 0) : 0;

            // ── REGION MULTIPLIERS ─────────────────────────────────────
            // Check if the winning player(s) are in a region with
            // modified XP/gold rates. We use the first surviving player's
            // map as the "battle region" (all players in same area).
            let regionXpMult   = 1;
            let regionGoldMult = 1;
            try {
                const firstWinner = survivingPlayers[0];
                if (firstWinner && global.getRegionForMap) {
                    // Get player's current map from DB
                    const [pMap] = await db.query(
                        'SELECT map_id FROM characters WHERE id=?', [firstWinner.charId]);
                    if (pMap.length) {
                        const region = await global.getRegionForMap(pMap[0].map_id);
                        if (region) {
                            regionXpMult   = parseFloat(region.xp_mult   || 1);
                            regionGoldMult = parseFloat(region.gold_mult  || 1);
                        }
                    }
                }
            } catch {}
            // Apply global system multipliers + region multipliers
            const sysXpMult   = parseFloat(global.worldFlags?.['xp_multiplier']  || 1);
            const sysGoldMult = parseFloat(global.worldFlags?.['gold_multiplier'] || 1);

            const shareXp   = Math.max(1, Math.floor((baseXp   / partySize) * regionXpMult   * sysXpMult));
            const shareGold = Math.max(0, Math.floor((baseGold / partySize) * regionGoldMult * sysGoldMult));

            // Award each surviving player
            for (const winner of survivingPlayers) {
                let leveledUp = false;
                if (shareXp) {
                    await db.query('UPDATE characters SET experience=experience+? WHERE id=?',
                        [shareXp, winner.charId]);
                    await db.query(
                        `UPDATE characters SET state_json=JSON_SET(COALESCE(state_json,'{}'),'$.xp',
                         COALESCE(CAST(JSON_EXTRACT(state_json,'$.xp') AS DECIMAL(20,0)),0)+?)
                         WHERE id=?`, [shareXp, winner.charId]);
                    leveledUp = await checkLevelUpStateJson(db, winner.charId);
                }
                if (shareGold && winner.userId) {
                    await db.query('UPDATE users SET currency=currency+? WHERE id=?',
                        [shareGold, winner.userId]);
                }
                // Emit battle_result to each player's socket
                try {
                    const allSocks = await io.in('battle_' + battle.id).fetchSockets();
                    const sock = (allSocks || []).find(s => s._battleCharId === winner.charId);
                    if (sock) sock.emit('battle_result', {
                        won: true, xp: shareXp, gold: shareGold,
                        leveledUp: !!leveledUp,
                        enemyName: topEnemy ? topEnemy.name : 'Enemy',
                        battleType: battle.type, partySize
                    });
                } catch {}

                // ── SESSION 13: Fighting style win credit ────────────
                try {
                    const styleResult = await styleWinCredit(db, winner.charId, battle._settings);
                    if (styleResult?.rankedUp) {
                        try {
                            const allSocks = await io.in('battle_' + battle.id).fetchSockets();
                            const wSock = (allSocks || []).find(s => s._battleCharId === winner.charId);
                            if (wSock) wSock.emit('style_rank_up', styleResult);
                        } catch {}
                    }
                } catch {}

                // ── ACHIEVEMENT: pve_wins + battles_total trigger ────
                try {
                    const achievementRoutes = require('./routes/achievementRoutes');
                    const [[pveRow]] = await db.query(
                        `SELECT CAST(JSON_EXTRACT(battle_record,'$.W') AS UNSIGNED) AS wins FROM characters WHERE id=?`,
                        [winner.charId]
                    );
                    if (pveRow) {
                        await achievementRoutes.checkForCharacter(db, io, winner.charId, 'pve_wins', pveRow.wins || 0);
                    }
                } catch(e) { /* non-critical */ }
            }

            // Win/loss record for 1v1 (only update if exactly 1v1)
            const losingTeamMembers = losingTeamIds.flatMap(t => battle.teams[t] || []);
            if (survivingPlayers.length === 1 && losingTeamMembers.length === 1) {
                const winnerId = survivingPlayers[0].charId;
                const loserId  = losingTeamMembers[0];
                await db.query(`UPDATE characters SET battle_record=JSON_SET(battle_record,'$.W',CAST(JSON_EXTRACT(battle_record,'$.W')+1 AS UNSIGNED)) WHERE id=?`, [winnerId]);
                await db.query(`UPDATE characters SET battle_record=JSON_SET(battle_record,'$.L',CAST(JSON_EXTRACT(battle_record,'$.L')+1 AS UNSIGNED)) WHERE id=?`, [loserId]);

                // ── ACHIEVEMENT: pvp_wins trigger ────────────────────
                try {
                    const achievementRoutes = require('./routes/achievementRoutes');
                    const [[wRow]] = await db.query(
                        `SELECT CAST(JSON_EXTRACT(battle_record,'$.W') AS UNSIGNED) AS wins FROM characters WHERE id=?`,
                        [winnerId]
                    );
                    if (wRow) await achievementRoutes.checkForCharacter(db, io, winnerId, 'pvp_wins', wRow.wins || 1);
                } catch(e) { /* non-critical */ }
            }

            // Event log (single entry for party)
            try {
                const enemyNames = losingTeamMembers.map(id => battle.combatants[id]?.name).filter(Boolean).join(', ');
                await db.query(
                    `INSERT INTO game_event_log (event_type,actor_id,actor_name,detail_json,map_id)
                     VALUES (?,?,?,?,?)`,
                    ['battle_end', survivingPlayers[0]?.userId || null,
                     survivingPlayers.map(p => p.name).join(', '),
                     JSON.stringify({ xp: shareXp, gold: shareGold, partySize, defeated: enemyNames }),
                     null]
                );
            } catch {}

            // ── SERVER-AUTHORITATIVE QUEST KILL CREDIT ───────────────
            // TEACHING: This is the fix for "client-trusted quest completion".
            // Before this fix, the client would call POST /quests/progress with
            // whatever amount it felt like, and the server trusted it.
            // Now: when a PvE battle ends in a player victory, WE look at which
            // NPCs actually died, find every active quest with a KILL objective
            // for those NPC types, and increment the count ourselves.
            // The client's /quests/progress endpoint now REJECTS KILL objectives —
            // only the server (this block) can advance them.
            try {
                if (battle.enemyNpcIds && battle.enemyNpcIds.length) {
                    // Get NPC names/types for the defeated enemies
                    const npcRows = await (async () => {
                        if (!battle.enemyNpcIds.length) return [];
                        const placeholders = battle.enemyNpcIds.map(() => '?').join(',');
                        const [rows] = await db.query(
                            `SELECT id, name, npc_type FROM game_npcs WHERE id IN (${placeholders})`,
                            battle.enemyNpcIds
                        );
                        return rows;
                    })();

                    if (npcRows.length) {
                        const npcIdSet   = new Set(npcRows.map(n => n.id));
                        const npcTypeSet = new Set(npcRows.map(n => (n.npc_type || '').toLowerCase()));
                        const npcNameSet = new Set(npcRows.map(n => (n.name || '').toLowerCase()));

                        for (const winner of survivingPlayers) {
                            // Load this character's state_json
                            const [cRows] = await db.query(
                                'SELECT state_json FROM characters WHERE id=?', [winner.charId]);
                            if (!cRows.length) continue;
                            let state;
                            try { state = JSON.parse(cRows[0].state_json || '{}'); } catch { continue; }
                            if (!state.quests?.active) continue;

                            let stateChanged = false;
                            for (const [questId, q] of Object.entries(state.quests.active)) {
                                if (!q.objectives) continue;
                                for (const [objKey, obj] of Object.entries(q.objectives)) {
                                    if (obj.complete) continue;
                                    if ((obj.type || '').toUpperCase() !== 'KILL') continue;

                                    // Match by npc_id, npc_type, or name (quest designers use any of these)
                                    const target = (obj.target_npc_id   !== undefined ? obj.target_npc_id   : null);
                                    const ttype  = (obj.target_npc_type || '').toLowerCase();
                                    const tname  = (obj.target_npc_name || '').toLowerCase();

                                    const matches =
                                        (target !== null && npcIdSet.has(Number(target))) ||
                                        (ttype  && npcTypeSet.has(ttype)) ||
                                        (tname  && npcNameSet.has(tname));

                                    if (!matches) continue;

                                    // Each enemy in battle counts as 1 kill
                                    const killCount = battle.enemyNpcIds.filter(id => {
                                        const row = npcRows.find(n => n.id === id);
                                        if (!row) return false;
                                        if (target !== null && row.id === Number(target)) return true;
                                        if (ttype && (row.npc_type || '').toLowerCase() === ttype) return true;
                                        if (tname && (row.name || '').toLowerCase() === tname) return true;
                                        return false;
                                    }).length;

                                    if (!killCount) continue;

                                    obj.current = Math.min(
                                        (obj.current || 0) + killCount,
                                        obj.required || obj.target || 1
                                    );
                                    if (obj.current >= (obj.required || obj.target || 1)) {
                                        obj.current  = obj.required || obj.target || 1;
                                        obj.complete = true;
                                    }
                                    stateChanged = true;
                                }
                                if (stateChanged) {
                                    // Recheck quest readiness
                                    const allDone = Object.values(q.objectives).every(o => o.complete);
                                    q.is_ready_to_turn_in = allDone;
                                }
                            }

                            if (stateChanged) {
                                await db.query(
                                    'UPDATE characters SET state_json=? WHERE id=?',
                                    [JSON.stringify(state), winner.charId]
                                );
                                // Notify client so the UI updates immediately
                                // We find the socket via io — endBattle doesn't have socketMap
                                try {
                                    const allSocks = await io.in('battle_' + battle.id).fetchSockets();
                                    const wSock = (allSocks || []).find(s => s._battleCharId === winner.charId);
                                    if (wSock) wSock.emit('quest_progress_update', { quests: state.quests.active });
                                } catch {}
                            }
                        }
                    }
                }
            } catch (qErr) {
                console.error('[Battle] Quest kill credit error (non-fatal):', qErr.message);
            }

            // ── SESSION 16: Quest WIN_CONDITION objective credit ─────
            // If this battle had a quest-linked win condition, progress those objectives
            if (battle._winCondition?.questId) {
                try {
                    for (const winner of survivingPlayers) {
                        const [cRows] = await db.query('SELECT state_json FROM characters WHERE id=?', [winner.charId]);
                        if (!cRows.length) continue;
                        let state;
                        try { state = JSON.parse(cRows[0].state_json || '{}'); } catch { continue; }
                        if (!state.quests?.active) continue;

                        const q = state.quests.active[battle._winCondition.questId];
                        if (!q || !q.objectives) continue;

                        let stateChanged = false;
                        for (const [objKey, obj] of Object.entries(q.objectives)) {
                            if (obj.complete) continue;
                            if ((obj.type || '').toUpperCase() !== 'WIN_CONDITION') continue;
                            if (obj.win_condition_id && obj.win_condition_id !== battle._winCondition.id) continue;
                            obj.current = 1;
                            obj.complete = true;
                            stateChanged = true;
                        }
                        if (stateChanged) {
                            const allDone = Object.values(q.objectives).every(o => o.complete);
                            q.is_ready_to_turn_in = allDone;
                            await db.query('UPDATE characters SET state_json=? WHERE id=?',
                                [JSON.stringify(state), winner.charId]);
                            try {
                                const allSocks = await io.in('battle_' + battle.id).fetchSockets();
                                const wSock = (allSocks || []).find(s => s._battleCharId === winner.charId);
                                if (wSock) wSock.emit('quest_progress_update', { quests: state.quests.active });
                            } catch {}
                        }
                    }
                } catch (wcErr) {
                    console.error('[Battle] Win condition quest credit error (non-fatal):', wcErr.message);
                }
            }
        } // end playersWon block

        // ── loot_drops and ogham drops are below (PvE only) ──
        // Resolve the loser for the existing loot code below
        const winner = battle.combatants[winnerCharId] || null;
        const firstLosingTeam = losingTeamIds[0] ? (battle.teams[losingTeamIds[0]] || []) : [];
        const loser  = firstLosingTeam.length ? battle.combatants[firstLosingTeam[0]] : null;
        void winner; void loser; // used in loot block below via `battle.winner`
    }  // end status=FINISHED check

            // =====================================================
            // LOOT DROPS (PvE only — never loot other players)
            // =====================================================
            if (battle.type === 'PVE' || battle.type === 'PARTY_PVE') {
                // For party battles, loot rolls for EACH enemy that died
                const allLosingIds = (losingTeamIds || Object.keys(battle.teams).filter(t => t !== winnerTeamId))
                    .flatMap(t => battle.teams[t] || []);
                const deadEnemyIds = allLosingIds.filter(
                    id => !battle.combatants[id] || battle.combatants[id].currentHp <= 0
                );
                const winTeam = winnerTeamId ? (battle.teams[winnerTeamId] || []) : [];
                const lootWinnerId = winTeam.find(
                    id => battle.combatants[id]?.currentHp > 0 && !battle.combatants[id]?.isAI
                ) || battle.winner;

                for (const deadEnemyId of deadEnemyIds) {
                try {
                    var npcRes = await db.query(
                        'SELECT drop_table_json FROM game_npcs WHERE char_id = ? AND is_enemy = 1 LIMIT 1',
                        [deadEnemyId]
                    );
                    var npcRow = npcRes[0];
                    if (npcRow.length && npcRow[0].drop_table_json) {
                        var dropTable = [];
                        try {
                            var raw = npcRow[0].drop_table_json;
                            dropTable = (typeof raw === 'string') ? JSON.parse(raw) : (raw || []);
                        } catch(e) { dropTable = []; }

                        // ── CONDITIONAL LOOT: region + world-flag filtering ──────
                        // Each drop entry can have an optional "conditions" array.
                        // Format: [{"type":"world_flag","flag":"blood_moon","value":"true"},
                        //          {"type":"region_danger","min":3},
                        //          {"type":"region_corruption","min":2},
                        //          {"type":"region_faction","faction":"undead"},
                        //          {"type":"region_tag","tag":"siege"}]
                        // All conditions must pass or the entry is skipped this kill.
                        let _lootRegion = null;
                        try {
                            const [pMapL] = await db.query(
                                'SELECT map_id FROM characters WHERE id=?', [lootWinnerId]);
                            if (pMapL.length && global.getRegionForMap) {
                                _lootRegion = await global.getRegionForMap(pMapL[0].map_id);
                            }
                        } catch {}
                        const _lootRegionMult = _lootRegion ? parseFloat(_lootRegion.loot_mult || 1) : 1;

                        function _checkLootConditions(entry) {
                            if (!entry.conditions || !entry.conditions.length) return true;
                            const wf = global.worldFlags || {};
                            const rg = _lootRegion || {};
                            return entry.conditions.every(cond => {
                                switch (cond.type) {
                                    case 'world_flag':
                                        return String(wf[cond.flag] ?? '') === String(cond.value ?? 'true');
                                    case 'world_flag_not':
                                        return String(wf[cond.flag] ?? '') !== String(cond.value ?? 'true');
                                    case 'region_danger':
                                        if (cond.min !== undefined && (rg.danger_level || 0) < cond.min) return false;
                                        if (cond.max !== undefined && (rg.danger_level || 0) > cond.max) return false;
                                        return true;
                                    case 'region_corruption':
                                        if (cond.min !== undefined && (rg.corruption_level || 0) < cond.min) return false;
                                        if (cond.max !== undefined && (rg.corruption_level || 0) > cond.max) return false;
                                        return true;
                                    case 'region_faction':
                                        return (rg.faction_control || '') === cond.faction;
                                    case 'region_tag':
                                        try {
                                            const tags = typeof rg.active_tags_json === 'string'
                                                ? JSON.parse(rg.active_tags_json) : (rg.active_tags_json || []);
                                            return tags.includes(cond.tag);
                                        } catch { return false; }
                                    case 'region_weather':
                                        return (rg.weather_override || 'CLEAR') === cond.weather;
                                    default: return true;
                                }
                            });
                        }

                        var actualDrops = [];
                        for (var di = 0; di < dropTable.length; di++) {
                            var entry = dropTable[di];
                            if (!entry.item_id || typeof entry.chance !== 'number') continue;
                            // Check conditional loot rules
                            if (!_checkLootConditions(entry)) continue;
                            // Apply region loot multiplier to drop chance
                            if (Math.random() * 100 > entry.chance * _lootRegionMult) continue;
                            var minQ = Math.max(1, parseInt(entry.min_qty) || 1);
                            var maxQ = Math.max(minQ, parseInt(entry.max_qty) || 1);
                            var qty = minQ + Math.floor(Math.random() * (maxQ - minQ + 1));
                            await db.query(
                                'INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',
                                [lootWinnerId, entry.item_id, qty]
                            );
                            var iRes = await db.query('SELECT name, icon FROM game_items WHERE id=? LIMIT 1', [entry.item_id]);
                            var iRow = iRes[0];
                            if (iRow.length) {
                                actualDrops.push({ item_id: entry.item_id, name: iRow[0].name, icon: iRow[0].icon || '📦', qty: qty });
                            }
                        }
                        if (actualDrops.length) {
                            io.to('battle_' + battle.id).emit('loot_drops', {
                                forCharId: lootWinnerId,
                                drops: actualDrops,
                                enemyName: (battle.combatants[deadEnemyId] || {}).name || 'Enemy'
                            });
                        }
                    }
                } catch(lootErr) { console.error('Loot drop error (non-fatal):', lootErr); }
                } // end deadEnemyId loop

                // --- OGHAM DROP ---
                // Roll against config_ogham_drop_chance (default 5%)
                try {
                    let dropChance = 5;
                    try {
                        for (const tbl of ['game_settings','system_settings','settings']) {
                            const [sr] = await db.query('SHOW TABLES LIKE ?', [tbl]);
                            if (!sr.length) continue;
                            const [cr] = await db.query('SHOW COLUMNS FROM ??', [tbl]);
                            const cols = cr.map(c => c.Field);
                            const kc = cols.find(n => /key|name/i.test(n));
                            const vc = cols.find(n => /val|value/i.test(n));
                            if (!kc || !vc) continue;
                            const [sv] = await db.query(
                                'SELECT ?? AS v FROM ?? WHERE ?? = ?', [vc, tbl, kc, 'config_ogham_drop_chance']);
                            if (sv.length) { dropChance = parseFloat(sv[0].v) || 5; break; }
                        }
                    } catch {}

                    if (Math.random() * 100 < dropChance) {
                        // Pick a random rank-1 ogham to drop
                        const [ogRows] = await db.query(
                            'SELECT id, name, icon, description, lore_text FROM game_oghams WHERE rank=1 ORDER BY RAND() LIMIT 1');
                        if (ogRows.length) {
                            const dropped = ogRows[0];
                            // Give it to winner: find their equipped weapon with the most free slots
                            const [equipped] = await db.query(`
                                SELECT ce.item_id, gi.ogham_slots,
                                    (gi.ogham_slots - IFNULL(used.cnt,0)) AS free_slots
                                FROM character_equipment ce
                                JOIN game_items gi ON gi.id = ce.item_id
                                LEFT JOIN (
                                    SELECT item_id, COUNT(*) as cnt FROM character_oghams
                                    WHERE character_id=? GROUP BY item_id
                                ) used ON used.item_id = ce.item_id
                                WHERE ce.character_id=? AND gi.ogham_slots > 0
                                ORDER BY free_slots DESC LIMIT 1`, [battle.winner, battle.winner]);

                            if (equipped.length && equipped[0].free_slots > 0) {
                                // Find next free slot index
                                const [usedSlots] = await db.query(
                                    'SELECT slot_index FROM character_oghams WHERE character_id=? AND item_id=?',
                                    [battle.winner, equipped[0].item_id]);
                                const usedIdx = new Set(usedSlots.map(r => r.slot_index));
                                let freeSlot = 0;
                                while (usedIdx.has(freeSlot)) freeSlot++;

                                await db.query(
                                    `INSERT INTO character_oghams (character_id, item_id, slot_index, ogham_id, current_rank, kill_count)
                                     VALUES (?,?,?,?,1,0)`,
                                    [battle.winner, equipped[0].item_id, freeSlot, dropped.id]);

                                io.to(`char_${battle.winner}`).emit('ogham_drop', {
                                    name: dropped.name,
                                    icon: dropped.icon || '🩸',
                                    description: dropped.description,
                                    lore_text: dropped.lore_text
                                });
                            } else {
                                // No free slots — add to a "pending oghams" bag (character_items via a special item)
                                // For now: notify the player they found one but couldn't slot it
                                io.to(`char_${battle.winner}`).emit('notification', {
                                    text: `🩸 Found a ${dropped.name} but have no free Ogham Grooves to carve it into.`,
                                    type: 'ogham_found_noslot'
                                });
                            }
                        }
                    }
                } catch(oghamDropErr) { console.warn('Ogham drop error (non-fatal):', oghamDropErr.message); }
            }

    // ---------------------------------------------------------
    // WITNESS SYSTEM
    // TEACHING: After any PvE win, any friendly NPC within 5 tiles
    // of the winner's last known position "witnesses" the kill.
    // We log a fact to npc_memories so the NPC can reference it
    // next time the player talks to them.
    //
    // We only do this for PvE (witnessing PvP would feel weird),
    // and we pull the winner's position from the characters table
    // since we don't have their map position here otherwise.
    // ---------------------------------------------------------
    if (battle.type === 'PVE' && battle.winner && battle.status === 'FINISHED') {
        try {
            const winner     = battle.combatants[battle.winner];
            const loser      = battle.getOpponent(battle.winner);
            const [posRows]  = await db.query(
                'SELECT map_id, x, y FROM characters WHERE id=?', [battle.winner]
            );
            if (posRows.length) {
                const { map_id, x, y } = posRows[0];

                // Get all NPCs on the same map from npcState (exported via global)
                // TEACHING: We use a module-level getter so battle_engine doesn't
                // need to import the full server — separation of concerns.
                const witnesses = typeof getNpcsForMap === 'function'
                    ? getNpcsForMap(map_id).filter(n => {
                        const dist = Math.abs(n.x - x) + Math.abs(n.y - y);
                        return dist <= 5 && !n.isEnemy;
                      })
                    : [];

                const fact = `Witnessed ${winner.name} defeat ${loser.name} in combat`;
                for (const npc of witnesses) {
                    await db.query(
                        `INSERT INTO npc_memories (char_id, npc_name, facts_json, reputation)
                         VALUES (?, ?, JSON_ARRAY(?), 0)
                         ON DUPLICATE KEY UPDATE
                             facts_json = IF(
                                 JSON_LENGTH(facts_json) < 10,
                                 JSON_ARRAY_APPEND(facts_json, '$', ?),
                                 facts_json
                             ),
                             last_seen = CURRENT_TIMESTAMP`,
                        [battle.winner, npc.name, fact, fact]
                    );
                }
                if (witnesses.length) {
                    console.log(`👁️  ${witnesses.length} NPC(s) witnessed ${winner.name} defeat ${loser.name}`);
                }

                // Blood Ogham kill tracking
                try {
                    const [oghams] = await db.query(
                        `SELECT co.*, go.kills_to_rank_up, go.base_ogham_id, go.rank as go_rank
                         FROM character_oghams co
                         JOIN game_oghams go ON go.id = co.ogham_id
                         WHERE co.character_id = ?`, [battle.winner]);
                    for (const og of oghams) {
                        const newKills = (og.kill_count || 0) + 1;
                        const threshold = og.kills_to_rank_up || 50;
                        const [nextRank] = await db.query(
                            'SELECT id, name, icon FROM game_oghams WHERE base_ogham_id=? AND rank=?',
                            [og.base_ogham_id || og.ogham_id, (og.go_rank || 1) + 1]);
                        if (newKills >= threshold && nextRank.length) {
                            await db.query(
                                'UPDATE character_oghams SET ogham_id=?, current_rank=current_rank+1, kill_count=0 WHERE id=?',
                                [nextRank[0].id, og.id]);
                            io.to(`char_${battle.winner}`).emit('notification', {
                                text: `${nextRank[0].icon} ${nextRank[0].name} — your Blood Ogham deepens!`,
                                type: 'ogham_rankup'
                            });
                        } else {
                            await db.query('UPDATE character_oghams SET kill_count=? WHERE id=?', [newKills, og.id]);
                        }
                    }
                } catch(ogErr) { console.warn('Ogham tracking error:', ogErr.message); }

                // Add a rumor so the kill spreads beyond direct witnesses over time
                if (typeof global._addRumor === 'function') {
                    await global._addRumor(db, battle.winner, winner.name,
                        `defeated ${loser.name} in combat`);
                }
            }
        } catch (witnessErr) {
            console.warn('Witness system error (non-fatal):', witnessErr.message);
        }
    }

    // Notify map room that battle ended
    if (battle.mapId) {
        io.to('map_' + battle.mapId).emit('battle_ended_on_map', { battleId: battle.id });
    }

    // Clean up memory
    battle.unregisterFromMap();
    delete activeBattles[battle.id];
}

// =================================================================
// LEVEL UP CHECK (state_json-aware version)
// =================================================================
// Teaching: The old checkLevelUp compared cumulative characters.experience
// to per-level xp_required, which is wrong — a level 10 char with 5000
// total XP always has >= 100 (level 2 requirement) so would loop forever.
// The fix: read state_json.xp (XP within current level, decremented on
// each level-up by the progression system) and compare that instead.
// We also apply HP/MP growth here just like the old version did.
async function checkLevelUpStateJson(db, charId) {
    const [rows] = await db.query(
        'SELECT level, max_hp, max_mp, state_json FROM characters WHERE id=?', [charId]
    );
    if (!rows.length) return;
    const c = rows[0];
    let state = {};
    try { state = JSON.parse(c.state_json || '{}'); } catch {}
    if (typeof state.xp !== 'number') state.xp = 0;
    if (!state.progression) state.progression = { unspent_points: 0 };

    let level = c.level || 1;
    let maxHp = c.max_hp;
    let maxMp = c.max_mp;
    let leveled = false;

    // Level up loop — capped at 50 for safety
    for (let i = 0; i < 50; i++) {
        const nextRows = await queryLevelRow(db, level + 1);
        if (!nextRows.length) break; // max level
        const next = nextRows[0];
        if (state.xp < (next.xp_required || 0)) break;

        // Consume XP and level up
        state.xp -= next.xp_required;
        level++;
        maxHp += (next.hp_growth || 0);
        maxMp += (next.mp_growth || 0);
        state.progression.unspent_points = (state.progression.unspent_points || 0) + 3;
        state.progression.last_level_up_at = new Date().toISOString();
        leveled = true;
    }

    if (leveled) {
        await db.query(
            'UPDATE characters SET level=?, max_hp=?, current_hp=?, max_mp=?, current_mp=?, state_json=? WHERE id=?',
            [level, maxHp, maxHp, maxMp, maxMp, JSON.stringify(state), charId]
        );

        // ── Referral Reward Payout ────────────────────────────────
        // TEACHING: We check referral payouts inside checkLevelUpStateJson
        // because this is the single authoritative place where a level-up
        // is confirmed and written to the DB. Checking it anywhere else
        // (e.g. on login) risks double-paying if two events race.
        //
        // Flow:
        //   1. Load the threshold level from system_settings (default 5)
        //   2. Check if this level-up crossed the threshold
        //   3. Find the referrer via characters.user_id → users.referred_by
        //   4. Atomically mark referral_paid=1 (UPDATE ... WHERE referral_paid=0
        //      acts as a compare-and-swap — only one payout ever succeeds)
        //   5. Add gold to the referrer's active character
        //   6. Send them an in-game mail notification
        try {
            await _checkReferralPayout(db, charId, level);
        } catch(refErr) { console.warn('[referral] payout check failed:', refErr.message); }

        // Log level-up
        try {
            const [charRow] = await db.query('SELECT name, user_id FROM characters WHERE id=?', [charId]);
            if (charRow.length) {
                await db.query(
                    `INSERT INTO game_event_log (event_type,actor_id,actor_name,detail_json)
                     VALUES ('level_up',?,?,?)`,
                    [charRow[0].user_id, charRow[0].name,
                     JSON.stringify({ new_level: level, char_id: charId })]
                );
            }
        } catch(logErr) { /* non-fatal */ }
    } else if (state.xp !== (rows[0].state_xp)) {
        // Just save updated state_json (XP synced, no level change)
        await db.query('UPDATE characters SET state_json=? WHERE id=?', [JSON.stringify(state), charId]);
    }
    return leveled; // allows callers to detect level-ups
}

// Keep old function name as alias so existing calls don't break
async function checkLevelUp(db, charId) {
    return checkLevelUpStateJson(db, charId);
}

// =================================================================
// HELPERS
// =================================================================
async function getAvailableCommands(db, stats) {
    // Get default commands
    const [defaults] = await db.query("SELECT * FROM game_battle_commands WHERE is_default=1 ORDER BY display_order");

    // Get class-specific commands
    const [classRow] = await db.query("SELECT battle_cmds FROM game_classes WHERE id=?", [stats.classId]);
    let extraCmds = [];
    if (classRow.length) {
        const extraIds = jp(classRow[0].battle_cmds, []);
        if (extraIds.length) {
            const [extras] = await db.query("SELECT * FROM game_battle_commands WHERE id IN (?) ORDER BY display_order", [extraIds]);
            extraCmds = extras;
        }
    }

    // Get available skills for this class at this level
    const [skills] = await db.query(`
        SELECT gs.*, gcs.mp_cost, gcs.alt_name FROM game_class_skills gcs
        JOIN game_skills gs ON gcs.skill_id = gs.id
        WHERE gcs.class_id = ? AND gcs.learn_level <= ?
        ORDER BY gcs.learn_level`, [stats.classId, stats.level]);

    // Ogham-granted bonus skills (grant_skill_id on equipped oghams)
    // TEACHING: Some legendary oghams grant a skill you wouldn't normally have.
    // We load those skills here and merge them in with a special ogham_granted flag.
    const oghamSkillIds = [];
    if (stats.charId) {
        try {
            const [ogRows] = await db.query(
                `SELECT go.grant_skill_id FROM character_oghams co
                 JOIN game_oghams go ON go.id = co.ogham_id
                 WHERE co.character_id = ? AND go.grant_skill_id IS NOT NULL`,
                [stats.charId]
            );
            for (const r of ogRows) if (r.grant_skill_id) oghamSkillIds.push(r.grant_skill_id);
        } catch { /* non-critical */ }
    }
    let oghamSkills = [];
    if (oghamSkillIds.length) {
        // Avoid duplicates with already-known class skills
        const knownIds = new Set(skills.map(s => s.id));
        const newIds   = oghamSkillIds.filter(id => !knownIds.has(id));
        if (newIds.length) {
            const [granted] = await db.query(
                'SELECT *, 0 AS mp_cost, NULL AS alt_name FROM game_skills WHERE id IN (?)',
                [newIds]
            );
            oghamSkills = granted.map(s => ({ ...s, oghamGranted: true }));
        }
    }
    const allSkills = [...skills, ...oghamSkills];

    // Get available limit breaks
    const limits = await queryLimitBreaksList(db, stats.classId, stats.level, stats.breaklevel);

    // Get consumable items
    const [items] = await db.query(`
        SELECT gi.*, ci.quantity FROM character_items ci
        JOIN game_items gi ON ci.item_id = gi.id
        WHERE ci.character_id = ? AND gi.type = 'CONSUMABLE'`,
        [stats.charId]);

    // Filter out disabled commands (from status effects)
    let disabledCmds = [];
    for (const s of stats.statuses) {
        const [sRows] = await db.query("SELECT disabled_commands FROM game_statuses WHERE id=?", [s.id]);
        if (sRows.length) {
            const disabled = jp(sRows[0].disabled_commands, []);
            if (disabled.includes(-1)) disabledCmds = [-1]; // -1 = all disabled
            else disabledCmds.push(...disabled);
        }
    }

    const cmds = [...defaults, ...extraCmds].map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        description: c.description,
        targetType: c.target_type,
        disabled: disabledCmds.includes(-1) || disabledCmds.includes(c.id)
    }));

    // Build opponent status name set for combo detection
    // NOTE: at command-build time we don't have the live opponent object,
    // so we pass it in via stats._opponentStatuses (set in processAction before
    // calling getAvailableCommands for the re-send after each turn).
    const oppStatuses = new Set((stats._opponentStatuses || []).map(s => s.name.toLowerCase()));

    return {
        commands: cmds,
        skills: allSkills.map(s => {
            const fx = jp(s.effects, {});
            const req = fx.combo_requires;
            const comboReady = req && req.status && oppStatuses.has(req.status.toLowerCase());
            const mpBase = s.mp_cost;
            // MAGIC STANCE: 30% MP discount
            const mpCost = stats._stance === 'MAGIC'
                ? Math.floor(mpBase * 0.7)
                : mpBase;
            return {
                id: s.id,
                name: s.alt_name || s.name,
                icon: s.icon,
                mpCost,
                type: s.type,
                targetType: s.target_type,
                description: s.description,
                comboReady,
                comboLabel: req ? req.message || `COMBO: ${req.status}` : null,
                hits: fx.hits || 1,
                chargeTurns: fx.charge_turns || 0,
            };
        }),
        limits: limits.map(l => ({
            id: l.id,
            name: l.name,
            icon: l.icon,
            breakLevel: l.break_level,
            targetType: l.target_type,
            description: l.description
        })),
        items: items.map(i => ({
            id: i.id,
            name: i.name,
            icon: i.icon,
            quantity: i.quantity
        })),
        // Session 11: Signature techniques (loaded separately)
        signatureTechs: [] // populated by caller if sig techs are enabled
    };
}

// In battle_engine.js

// -----------------------------------------------------------------
// BROADCAST UPDATE (Fixed)
// -----------------------------------------------------------------
async function broadcastBattleUpdate(io, battle, actionResult, db) {
    const room = `battle_${battle.id}`;

    try {
        const sockets = await io.in(room).fetchSockets();
        if (sockets && sockets.length) {
            for (const s of sockets) {
                const viewerCharId = s._battleCharId;
                const state = battle.toClientState(viewerCharId);

                // Re-build available commands with LIVE opponent statuses + stance
                // so the combo badge and MP costs are always accurate this turn.
                let commands = null;
                if (viewerCharId && battle.combatants[viewerCharId] && db) {
                    try {
                        const liveCombatant = battle.combatants[viewerCharId];
                        const liveOpponent  = battle.getOpponent(viewerCharId);
                        // Inject live fields into the stats snapshot (we don't have
                        // the original stats object here, so we build a minimal shim)
                        const statsShim = {
                            ...liveCombatant,
                            _opponentStatuses: liveOpponent ? liveOpponent.statuses : [],
                            _stance:           liveCombatant._stance || null
                        };
                        commands = await getAvailableCommands(db, statsShim);
                        // Session 11: Include signature techs
                        if (battle._settings?.enable_signature_techs) {
                            try {
                                commands.signatureTechs = await BattleManager.getSignatureTechs(db, viewerCharId);
                            } catch {}
                        }
                    } catch { /* non-fatal — client falls back to last known commands */ }
                }

                s.emit('battle_update', { state, action: actionResult || null, commands });
            }
            return;
        }
    } catch (e) {
        // Fall through to the public update.
    }

    const publicState = battle.toClientState(null);
    io.to(room).emit('battle_update', { state: publicState, action: actionResult || null });
}

BattleManager.getBattle = (id) => activeBattles[id] || null;

// =================================================================
// REFERRAL PAYOUT HELPER
// =================================================================
// Called from checkLevelUpStateJson after every confirmed level-up.
// The UPDATE WHERE referral_paid=0 acts as an atomic lock so only
// one payout ever fires, even if two events somehow race.
// =================================================================
async function _checkReferralPayout(db, charId, newLevel) {
    // 1. Read threshold + reward values from system_settings
    const [settingRows] = await db.query(
        `SELECT setting_key, setting_value FROM system_settings
         WHERE setting_key IN ('referral_threshold_level','referral_gold_reward','referral_xp_reward')`
    );
    const settings = {};
    for (const r of settingRows) settings[r.setting_key] = parseInt(r.setting_value, 10) || 0;

    const THRESHOLD = settings['referral_threshold_level'] || 5;
    const GOLD      = settings['referral_gold_reward']      || 500;
    const XP_BONUS  = settings['referral_xp_reward']        || 0;

    // 2. Only act when the player exactly reaches the threshold level
    if (newLevel !== THRESHOLD) return;

    // 3. Load the character's user + referral state
    const [[charRow]] = await db.query(
        `SELECT c.name AS char_name, c.user_id,
                u.referred_by, u.referral_paid
         FROM characters c
         JOIN users u ON u.id = c.user_id
         WHERE c.id = ?`,
        [charId]
    );
    if (!charRow || !charRow.referred_by || charRow.referral_paid) return;

    // 4. Atomic lock — only one UPDATE will get affectedRows=1
    const [lock] = await db.query(
        'UPDATE users SET referral_paid=1 WHERE id=? AND referral_paid=0',
        [charRow.user_id]
    );
    if (!lock.affectedRows) return;

    // 5. Find the referrer's primary character (highest level)
    const [[referrerChar]] = await db.query(
        `SELECT c.id AS char_id, c.name, c.gold
         FROM characters c
         WHERE c.user_id = ?
         ORDER BY c.level DESC, c.id ASC LIMIT 1`,
        [charRow.referred_by]
    );
    if (!referrerChar) return;

    // 6. Pay gold
    if (GOLD > 0) {
        await db.query('UPDATE characters SET gold = gold + ? WHERE id=?', [GOLD, referrerChar.char_id]);
    }

    // 7. Pay XP bonus via state_json
    if (XP_BONUS > 0) {
        const [[rs]] = await db.query('SELECT state_json FROM characters WHERE id=?', [referrerChar.char_id]);
        let state = {};
        try { state = JSON.parse(rs?.state_json || '{}'); } catch {}
        state.xp = (state.xp || 0) + XP_BONUS;
        await db.query('UPDATE characters SET state_json=? WHERE id=?', [JSON.stringify(state), referrerChar.char_id]);
    }

    // 8. System mail notification
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    const subject   = `🎉 Referral Reward — ${charRow.char_name} reached level ${THRESHOLD}!`;
    const body = [
        `${charRow.char_name}, who joined using your invite link, just reached level ${THRESHOLD}.`,
        ``,
        `Your referral reward:`,
        GOLD     > 0 ? `  💰 ${GOLD} gold (added to your character)` : null,
        XP_BONUS > 0 ? `  ✨ ${XP_BONUS} bonus XP` : null,
        ``,
        `Keep spreading the word — every recruit can earn you rewards!`
    ].filter(l => l !== null).join('\n');

    await db.query(
        `INSERT INTO character_mail
         (sender_char_id, sender_name, recipient_char_id, subject, body, gold_attachment, expires_at)
         VALUES (NULL, 'System', ?, ?, ?, 0, ?)`,
        [referrerChar.char_id, subject, body, expiresAt]
    );

    // 9. Event log
    await db.query(
        `INSERT INTO game_event_log (event_type, actor_id, actor_name, detail_json)
         VALUES ('referral_paid', ?, ?, ?)`,
        [charRow.referred_by, referrerChar.name,
         JSON.stringify({ referred_char: charRow.char_name, referrer_char: referrerChar.name,
                          gold: GOLD, xp: XP_BONUS, threshold: THRESHOLD })]
    ).catch(() => {});

    console.log(`[Referral] ${referrerChar.name} earned ${GOLD}g + ${XP_BONUS}xp for referring ${charRow.char_name} (Lv.${THRESHOLD})`);
}

BattleManager.getEffectiveStats    = getEffectiveStats;
BattleManager.applyEnemyScaling    = applyEnemyScaling;
BattleManager.getScalingFactor     = getScalingFactor;
BattleManager.broadcastBattleUpdate = broadcastBattleUpdate;
BattleManager.endBattle             = endBattle;
BattleManager.calculateNpcWillingness = calculateNpcWillingness;
BattleManager.activeBattles     = activeBattles;
BattleManager.battlesByMap      = battlesByMap;

// Get summary of active battles on a map (for map UI indicators)
BattleManager.getBattlesOnMap = (mapId) => {
    const ids = battlesByMap[parseInt(mapId)];
    if (!ids || !ids.size) return [];
    return [...ids].map(bid => {
        const b = activeBattles[bid];
        if (!b || b.status !== 'ACTIVE') return null;
        // Gather names from all teams, split into human vs AI
        const teamIds = Object.keys(b.teams);
        const playerNames = [];
        const enemyNames = [];
        let playerCount = 0, enemyCount = 0;
        for (const tId of teamIds) {
            for (const cid of (b.teams[tId] || [])) {
                const c = b.combatants[cid];
                if (!c) continue;
                if (c.isAI) {
                    enemyNames.push(c.name);
                    if (c.currentHp > 0) enemyCount++;
                } else {
                    playerNames.push(c.name);
                    if (c.currentHp > 0) playerCount++;
                }
            }
        }
        return {
            battleId: b.id,
            x: b.mapX, y: b.mapY,
            playerCount, enemyCount,
            playerNames, enemyNames,
            teamCount: teamIds.length,
            type: b.type
        };
    }).filter(Boolean);
};

module.exports = BattleManager;
