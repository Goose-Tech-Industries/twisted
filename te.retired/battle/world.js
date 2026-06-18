// =================================================================
// BATTLE WORLD — Weather, Stealth, Link Attacks, Transforms,
//                Revive, Traps, Boss Phases, Win Conditions,
//                Summons, Fighting Styles, Initiative, Death,
//                NPC Negotiation
// =================================================================

const { safeEval } = require('../event_runner');
const { jp, getEffectiveStats } = require('./stats');
const { loadLimbZones, initLimbHp, getAllWoundLevels } = require('./limbs');

// =================================================================
// SESSIONS 17-22: WEATHER, STEALTH, LINK ATTACKS, TRANSFORMS,
//                 REVIVE, TRAPS, SPECTATOR
// =================================================================

// SESSION 17: Apply weather effects to damage/accuracy
// Returns { damage, missed } — caller must check missed flag
function applyWeatherEffects(battle, damage, element, isRanged, actor) {
    if (!battle._weather || !battle._settings?.enable_weather_effects) return { damage, missed: false };
    const fx = battle._weather.combatEffects || {};
    let mult = 1.0;
    // Element damage modifiers
    if (element && fx[`${element}_damage`]) mult += fx[`${element}_damage`];

    // Accuracy as true miss chance (negative accuracy = miss %)
    // e.g. ranged_accuracy: -0.30 means 30% miss chance for ranged attacks
    let missChance = 0;
    if (isRanged && fx.ranged_accuracy && fx.ranged_accuracy < 0) {
        missChance += Math.abs(fx.ranged_accuracy);
    }
    if (fx.accuracy && fx.accuracy < 0) {
        missChance += Math.abs(fx.accuracy);
    }
    if (missChance > 0 && Math.random() < missChance) {
        return { damage: 0, missed: true };
    }

    // Positive accuracy/ranged_accuracy still boost damage
    if (isRanged && fx.ranged_accuracy && fx.ranged_accuracy > 0) mult += fx.ranged_accuracy;
    if (fx.accuracy && fx.accuracy > 0) mult += fx.accuracy;

    return { damage: Math.max(1, Math.floor(damage * Math.max(0.1, mult))), missed: false };
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
        const { BattleState } = require('./legacy');
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

    // Alignment check
    if (transform.alignment_required && transform.alignment_required !== 'any') {
        try {
            const [alignRow] = await db.query('SELECT alignment_score FROM characters WHERE id=?', [actor.charId]);
            const score = alignRow.length ? (alignRow[0].alignment_score || 0) : 0;
            if (transform.alignment_required === 'good' && score < (transform.alignment_min || 0)) {
                result.log.push(`${actor.name}'s heart is not pure enough for this form.`);
                return result;
            }
            if (transform.alignment_required === 'evil' && score > -(transform.alignment_min || 0)) {
                result.log.push(`${actor.name} has not embraced enough darkness for this form.`);
                return result;
            }
        } catch {}
    }

    // Prerequisite transform check
    if (transform.prerequisite_transform_id) {
        try {
            const [prereq] = await db.query(
                'SELECT is_unlocked FROM character_transformations WHERE character_id=? AND transformation_id=?',
                [actor.charId, transform.prerequisite_transform_id]);
            if (!prereq.length || !prereq[0].is_unlocked) {
                result.log.push(`${actor.name} must first master a previous form!`);
                return result;
            }
        } catch {}
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
        const { applyStatus } = require('./combat');
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
        case 'atb': {
            // ATB: init gauges, no turn queue — tickATB() drives turn order
            if (typeof battle.initATB === 'function') battle.initATB();
            battle.turnQueue = []; // ATB doesn't use a static queue
            break;
        }
        case 'ctb': {
            // CTB: init counters, advance to find first turn
            if (typeof battle.initCTB === 'function') battle.initCTB();
            const first = typeof battle.advanceCTB === 'function' ? battle.advanceCTB() : null;
            if (first) battle.turnQueue = [first];
            else battle.turnQueue = all.sort((a, b) => b.speed - a.speed).map(c => c.charId);
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
// EXPORTS
// =================================================================
module.exports = {
    // Weather
    applyWeatherEffects,
    loadWeather,
    // Stealth
    resolveStealth,
    getStealthBonus,
    // Link Attacks
    checkLinkAttack,
    // Transforms
    resolveTransform,
    tickTransform,
    // Revive + Traps
    resolveRevive,
    checkTraps,
    // Boss Phases + Win Conditions
    loadBossPhases,
    checkBossPhase,
    evaluateWinCondition,
    // Summons
    getSummonOgham,
    resolveSummon,
    // Fighting Styles
    loadActiveStyle,
    applyStyleBonuses,
    styleWinCredit,
    // Initiative
    rebuildInitiative,
    // Death/Afterlife
    handleDeath,
    // NPC Negotiation
    calculateNpcWillingness,
};
