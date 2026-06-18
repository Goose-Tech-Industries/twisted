// =================================================================
// COMBAT.JS — Core battle action resolution
// =================================================================
// Extracted from legacy.js. Contains executeBattleAction and all
// status/reaction/death resolution functions.
// Damage pipeline → resolve-damage.js
// Skill/Item/Limit → resolve-skill.js

const { safeEval } = require('../event_runner');
const { jp, buildFormulaVars } = require('./stats');
const {
    resolveKiChannel, tickKiChannel, tickBleeds,
    tickBreakState, tickStagger, checkOneMore, applyTurnDelay,
    applyDefenseActionCommand,
    rollWithAdvantage, hasAdvantage, hasDisadvantage, queueRollingDamage,
    resolveComboInput
} = require('./systems');
const {
    resolveSignatureTech, resolveRpCommand, tickRpEffects
} = require('./narrative');
const {
    checkStatusCombo, evaluateBattleRules
} = require('./rules');
const {
    resolveStealth, resolveTransform, tickTransform,
    checkTraps, evaluateWinCondition, resolveSummon, tickSummons,
    rebuildInitiative
} = require('./world');

// Sub-module imports
const { resolveDamage } = require('./resolve-damage');
const { resolveSkill, resolveItem, resolveLimitBreak, getSignatureTechs } = require('./resolve-skill');

// BattleState is still in legacy.js (not yet extracted to state.js).
// We lazy-require to avoid circular dependency issues.
let _BattleState = null;
function getBattleState() {
    if (!_BattleState) {
        _BattleState = require('./legacy').BattleState;
    }
    return _BattleState;
}

// =================================================================
// EXECUTE BATTLE ACTION — The core resolver
// =================================================================
async function executeBattleAction(db, battle, actor, target, { commandId, skillId, itemId, limitId, targetLimb, flavorText, sigTechId, comboInput, actionTiming }) {
    const result = { actor: actor.name, actions: [], log: [] };

    // Tabletop: unconscious actors make death saves instead of acting
    if (actor._unconscious) {
        const tabletop = require('./tabletop-rules');
        const save = tabletop.deathSaveRoll(actor);
        result.log.push(save.message);
        result.actions.push({ type: 'death_save', target: actor.name, roll: save.roll, result: save.result });
        if (save.result === 'revive') {
            actor._unconscious = false;
            actor.currentHp = 1;
        } else if (save.result === 'death') {
            actor._unconscious = false;
            actor.currentHp = 0;
        }
        battle.addLog({ actor: actor.name, action: 'DEATH_SAVE', text: save.message });
        return result;
    }

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
            // BG3-style: Shove — push target 1 tile, into hazards
            if (fx.shove) {
                if (!target) { result.log.push('Select a target to shove!'); return result; }
                // STR check
                const shoveChance = Math.min(90, 40 + (actor.atk || 0) - (target.def || 0));
                if (Math.random() * 100 < shoveChance && target.gridX !== undefined) {
                    const dx = Math.sign(target.gridX - (actor.gridX || 0));
                    const dy = Math.sign(target.gridY - (actor.gridY || 0));
                    const newX = target.gridX + (dx || 1);
                    const newY = target.gridY + (dy || 0);
                    const gridW = battle._settings?.grid_width || 12;
                    const gridH = battle._settings?.grid_height || 8;
                    target.gridX = Math.max(0, Math.min(newX, gridW - 1));
                    target.gridY = Math.max(0, Math.min(newY, gridH - 1));
                    result.log.push(`💪 ${actor.name} shoves ${target.name}!`);
                    result.actions.push({ type: 'shove', actor: actor.name, target: target.name, x: target.gridX, y: target.gridY });
                    // Check if shoved into hazard terrain
                    const tKey = `${target.gridX},${target.gridY}`;
                    const terrain = battle.terrainMap?.[tKey];
                    if (terrain === 'fire') {
                        const fireDmg = 10;
                        target.currentHp = Math.max(0, target.currentHp - fireDmg);
                        result.log.push(`🔥 ${target.name} is shoved into fire for ${fireDmg} damage!`);
                    } else if (terrain === 'water') {
                        result.log.push(`🌊 ${target.name} is soaked!`);
                    }
                } else {
                    result.log.push(`${target.name} resists the shove!`);
                }
                return result;
            }
            // BG3-style: Dip weapon — coat weapon in a surface element
            if (fx.dip_weapon) {
                if (actor.gridX === undefined) { result.log.push('Grid position required for dipping.'); return result; }
                const tKey = `${actor.gridX},${actor.gridY}`;
                const surface = battle.terrainMap?.[tKey];
                if (!surface || surface === 'open') {
                    result.log.push(`No surface to dip weapon in.`);
                    return result;
                }
                const elementMap = { fire: 'fire', poison: 'poison', ice: 'ice', water: 'water', oil: 'fire', acid: 'acid' };
                const element = elementMap[surface] || surface;
                actor._dippedElement = element;
                actor._dippedTurns = 3;
                result.log.push(`${actor.name} dips their weapon in ${surface}! Attacks deal bonus ${element} damage for 3 turns.`);
                result.actions.push({ type: 'dip_weapon', actor: actor.name, element, surface });
                return result;
            }

            // Session 12: RP commands (Taunt, Intimidate, Rally)
            if (fx.rp_command) {
                return await resolveRpCommand(db, battle, actor, target, fx.rp_command, fx, result, flavorText);
            }
            // Steal command — uses loot.js resolveSteal
            if (fx.steal) {
                if (!target) {
                    result.log.push('Select a target to steal from!');
                    return result;
                }
                return await battle.resolveSteal(db, actor.charId, target.charId, result);
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
        const sigTechs = await getSignatureTechs(db, actor.charId);
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

    // Tabletop: Death saves instead of instant death
    const tabletop = require('./tabletop-rules');
    if (target.currentHp <= 0 && !target.isAI && tabletop.isSubEnabled(settings, 'tabletop_death_saves')) {
        if (!target._unconscious) {
            target._unconscious = true;
            target._deathSaves = { successes: 0, failures: 0 };
            target.currentHp = 0;
            result.log.push(`💫 ${target.name} falls unconscious! Death saves begin...`);
            result.actions.push({ type: 'unconscious', target: target.name });
            return; // don't process as kill — they get death saves on their turn
        }
    }

    // Auto-revive / Reraise check — if target has a status with auto_revive, revive instead of dying
    if (target.currentHp <= 0 && target.statuses) {
        for (let i = 0; i < target.statuses.length; i++) {
            const s = target.statuses[i];
            try {
                const fx = s._cachedEffects || {};
                if (fx.auto_revive) {
                    const reviveHp = typeof fx.auto_revive === 'number'
                        ? Math.floor(target.maxHp * fx.auto_revive)
                        : Math.floor(target.maxHp * 0.25);
                    target.currentHp = Math.max(1, reviveHp);
                    target.statuses.splice(i, 1); // consume the reraise
                    result.log.push(`✨ ${target.name} is revived by ${s.name}! (${target.currentHp} HP)`);
                    result.actions.push({ type: 'auto_revive', target: target.name, hp: target.currentHp });
                    return; // don't process death
                }
            } catch {}
        }
    }

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
        const cachedFx = jp(status.effects, {});
        target.statuses.push({
            id: status.id,
            name: status.name,
            icon: status.icon,
            turns: duration || status.default_duration,
            _cachedEffects: cachedFx,
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
    const BattleState = getBattleState();
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

            // Doom countdown: instant KO when timer hits 0
            if (effects.doom && s.turns === 1) {
                c.currentHp = 0;
                const doomMsg = effects.log ? effects.log.replace('{name}', c.name) : `💀 ${c.name} succumbs to doom!`;
                battle.addLog({ actor: 'status', text: doomMsg });
                tickResult.log.push(`${s.icon} ${doomMsg}`);
                tickResult.actions.push({ type: 'doom_kill', target: c.name });
            }

            // MP drain per turn (Curse, Mana Burn)
            if (effects.mp_drain_per_turn && c.currentMp !== undefined) {
                const drain = Math.max(1, Math.floor(safeEval(effects.mp_drain_per_turn.formula || '10', { MAXMP: c.maxMp || 100, LEVEL: c.level })));
                c.currentMp = Math.max(0, c.currentMp - drain);
                tickResult.log.push(`${s.icon} ${c.name} loses ${drain} MP!`);
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

    // Stagger tick
    if (battle._settings?.enable_stagger_system) {
        for (const c of Object.values(battle.combatants)) {
            if (c.currentHp > 0) tickStagger(c, battle._settings);
        }
    }

    // Session 5: Tick status immunity windows + barriers + cover
    for (const c of Object.values(battle.combatants)) {
        if (c._statusImmunity) {
            for (const name of Object.keys(c._statusImmunity)) {
                c._statusImmunity[name]--;
                if (c._statusImmunity[name] <= 0) delete c._statusImmunity[name];
            }
        }
        // Barrier duration tick
        if (c._barrier) {
            c._barrier.turnsLeft--;
            if (c._barrier.turnsLeft <= 0) { c._barrier = null; }
        }
        // Cover duration tick
        if (c._covering) {
            c._covering.turnsLeft--;
            if (c._covering.turnsLeft <= 0) { c._covering = null; }
        }
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
// EXPORTS
// =================================================================
module.exports = {
    getSignatureTechs,
    executeBattleAction,
    resolveDamage,
    resolveSkill,
    resolveItem,
    resolveLimitBreak,
    checkDeathOrKnockout,
    resolveFlee,
    resolveSetStatus,
    resolveStatusFromEffect,
    applyStatus,
    checkReactions,
    processStatusEffects,
    checkDeaths
};
