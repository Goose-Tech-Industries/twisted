const { safeEval } = require('../event_runner');
const { jp } = require('./stats');

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
        const { applyStatus } = require('./combat');
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
            const { applyStatus } = require('./combat');
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
                if (combo.apply_status) {
                    const { applyStatus } = require('./combat');
                    await applyStatus(db, target, combo.apply_status, 2, result);
                }
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

module.exports = {
    loadBattleRules,
    evaluateRuleCondition,
    applyRuleEffect,
    evaluateBattleRules,
    checkElementalReaction,
    addThreat,
    getHighestThreatTarget,
    checkStatusCombo,
    getAiDifficultyMult
};
