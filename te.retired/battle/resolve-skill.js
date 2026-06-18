// =================================================================
// RESOLVE SKILL / ITEM / LIMIT BREAK — Skill-based action resolution
// =================================================================

const { safeEval } = require('../event_runner');
const { jp, buildFormulaVars, queryLimitBreakRow } = require('./stats');
const { routeLimbDamage, getAllWoundLevels, applyWoundPenalties } = require('./limbs');
const {
    resolveDefense, aiPickDefense, trackDiminishingReturns, getKiRangedDodgeBonus,
    applyBleed
} = require('./systems');
const {
    evaluateFlavorText, resolveComboProc
} = require('./narrative');
const { resolveRevive } = require('./world');

// BattleState lazy-require to avoid circular dependency
let _BattleState = null;
function getBattleState() {
    if (!_BattleState) {
        _BattleState = require('./legacy').BattleState;
    }
    return _BattleState;
}

// ── SESSION 11: Get player's signature techs for battle commands ──
async function getSignatureTechs(db, charId) {
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
}

// --- RESOLVE SKILL ---
// Teaching: This is the busiest function in the engine. It handles:
//   • Stance multipliers (POWER = physical ×1.4, MAGIC = magic ×1.4)
//   • Combo bonuses (if opponent has required status, deal more damage / extra hit)
//   • Multi-hit (fire damage loop N times, each hit can proc on-hit effects)
//   • Charge check (handled upstream in executeBattleAction)
//   • Normal offensive / healing / status / cure flows
async function resolveSkill(db, battle, actor, target, skillId, result, targetLimb, flavorText) {
    // Lazy require combat.js functions to avoid circular dependency
    const { applyStatus, resolveStatusFromEffect, checkReactions, checkDeathOrKnockout } = require('./combat');

    const BattleState = getBattleState();
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

            // ── TABLETOP: Attack roll vs AC ──
            const tabletop = require('./tabletop-rules');
            if (tabletop.isSubEnabled(battle._settings, 'tabletop_armor_class') && target) {
                // Check flanking for advantage
                if (tabletop.isSubEnabled(battle._settings, 'tabletop_flanking_bonus')) {
                    actor._flanking = tabletop.checkFlanking(actor, target, battle);
                    if (actor._flanking) actor._hasAdvantage = true;
                }
                const atkResult = tabletop.attackRoll(actor, target, battle._settings);
                if (hit === 0) {
                    const rollMsg = atkResult.type !== 'normal' ? ` (${atkResult.type})` : '';
                    result.log.push(`[d20: ${atkResult.roll}${rollMsg}] + ${atkResult.atkMod} + ${atkResult.profBonus} = ${atkResult.total} vs AC ${atkResult.ac}`);
                }
                if (atkResult.critFail) {
                    result.log.push('Critical fumble!');
                    damage = 0;
                    continue;
                }
                if (!atkResult.hit) {
                    result.log.push('Miss!');
                    damage = 0;
                    continue;
                }
                if (atkResult.critical) {
                    damage = Math.floor(damage * 2);
                    if (hit === 0) result.log.push('CRITICAL HIT! Double damage!');
                }
                // Sneak attack
                if (tabletop.isSubEnabled(battle._settings, 'tabletop_sneak_attack') && actor._sneakAttack) {
                    const sneakDmg = tabletop.sneakAttackDamage(actor, target, battle, actor._hasAdvantage);
                    if (sneakDmg > 0) {
                        damage += sneakDmg;
                        if (hit === 0) result.log.push(`🗡️ Sneak attack! +${sneakDmg} damage!`);
                    }
                }
                actor._hasAdvantage = false;
                actor._flanking = false;
            }

            // BG3-style: Height advantage — higher elevation = +20% damage
            if (battle._settings?.enable_tabletop_rules || battle._settings?.tabletop_flanking_bonus) {
                if (actor.gridY !== undefined && target && target.gridY !== undefined) {
                    const actorElev = battle._elevation?.[`${actor.gridX},${actor.gridY}`] || 0;
                    const targetElev = battle._elevation?.[`${target.gridX},${target.gridY}`] || 0;
                    if (actorElev > targetElev) {
                        damage = Math.floor(damage * 1.2);
                        if (hit === 0) result.log.push('⬆️ Height advantage!');
                    }
                }
            }

            // BG3-style: Dipped weapon bonus element damage
            if (actor._dippedElement && actor._dippedTurns > 0) {
                const dipBonus = Math.max(1, Math.floor(damage * 0.15));
                damage += dipBonus;
                if (hit === 0) result.log.push(`${actor._dippedElement} coating adds ${dipBonus} bonus damage!`);
                actor._dippedTurns--;
                if (actor._dippedTurns <= 0) actor._dippedElement = null;
            }

            // Apply flavor text bonus
            if (skillFlavorBonus > 0) damage = Math.floor(damage * (1 + skillFlavorBonus));

            if (effects.damage.randomize) {
                damage = Math.floor(damage * (1 + (Math.random() * 2 - 1) * effects.damage.randomize));
            }

            // ── Damage type: True / % HP ─────────────────────────
            const skillDmgType = effects.damage.type || 'magic';
            const skillIsTrueDmg = skillDmgType === 'true';
            const skillIsPctDmg = skillDmgType === 'percent_hp';

            if (skillIsPctDmg) {
                damage = Math.floor(target.maxHp * (Math.abs(damage) / 100));
            }

            // ── Flat Armor / Magic Resist ────────────────────────
            if (!skillIsTrueDmg && !skillIsPctDmg && damage > 0) {
                let armor = (skillDmgType === 'magic') ? (target.md || 0) : (target.def || 0);
                const penPct = actor._penetration || 0;
                if (penPct > 0) armor = Math.floor(armor * (1 - penPct));
                armor = Math.max(0, armor); // Clamp — negative armor must never amplify damage
                damage = Math.floor(damage * (100 / (100 + armor)));
            }

            // Stance multipliers
            if (actor._stance === 'POWER' && (skillDmgType !== 'magic')) {
                damage = Math.floor(damage * 1.4);
            }
            if (actor._stance === 'MAGIC' && skillDmgType === 'magic') {
                damage = Math.floor(damage * 1.4);
            }

            // ── Crit check (per hit) ────────────────────────────
            let skillCrit = false;
            const skillCritChance = Math.max(0, (battle._settings?.base_crit_chance || (actor.luck || 5)) - (target._critResist || 0));
            if (Math.random() * 100 < skillCritChance) {
                damage = Math.floor(damage * (battle._settings?.crit_damage_multiplier || 1.5));
                skillCrit = true;
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

            // ── Damage floor & cap ──────────────────────────────
            damage = Math.max(1, damage);
            const skillDmgCap = battle._settings?.damage_cap || 0;
            if (skillDmgCap > 0) damage = Math.min(skillDmgCap, damage);

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

        // ── Status-based on-hit effects ──
        // ── TABLETOP: Concentration check on damage ──
        if (totalDamage > 0 && target && target._concentratingOn) {
            const tabletop = require('./tabletop-rules');
            if (tabletop.isSubEnabled(battle._settings, 'tabletop_concentration')) {
                const concCheck = tabletop.concentrationCheck(target, totalDamage, battle._settings);
                result.log.push(concCheck.message);
                if (!concCheck.maintained) {
                    const spellName = target._concentratingOn;
                    target._concentratingOn = null;
                    // Remove concentration status
                    target.statuses = target.statuses.filter(s => s._concentration !== true);
                    result.actions.push({ type: 'concentration_broken', target: target.name, spell: spellName });
                }
            }
        }

        // Thorns: flat damage back to attacker when hit
        if (totalDamage > 0 && target.currentHp > 0 && target._thorns) {
            const thornsDmg = target._thorns;
            actor.currentHp = Math.max(0, actor.currentHp - thornsDmg);
            result.log.push(`🌿 ${actor.name} takes ${thornsDmg} thorns damage!`);
            result.actions.push({ type: 'thorns_damage', target: actor.name, amount: thornsDmg });
        }

        // Damage reflect: target has a status with damage_reflect (e.g. 0.3 = 30%)
        if (totalDamage > 0 && target.currentHp > 0 && target.statuses) {
            for (const s of target.statuses) {
                try {
                    const [sr] = await db.query("SELECT effects FROM game_statuses WHERE id=?", [s.id]);
                    if (!sr.length) continue;
                    const fx = jp(sr[0].effects, {});
                    if (fx.damage_reflect) {
                        const reflected = Math.floor(totalDamage * fx.damage_reflect);
                        if (reflected > 0) {
                            actor.currentHp = Math.max(0, actor.currentHp - reflected);
                            result.log.push(`🪞 ${target.name} reflects ${reflected} damage back!`);
                            result.actions.push({ type: 'reflect_damage', target: actor.name, amount: reflected });
                        }
                    }
                } catch {}
            }
        }
        // HP drain / lifesteal: actor's skill or status has hp_drain (e.g. 0.2 = 20%)
        if (totalDamage > 0 && effects.hp_drain) {
            const drained = Math.floor(totalDamage * effects.hp_drain);
            if (drained > 0) {
                actor.currentHp = Math.min(actor.maxHp, actor.currentHp + drained);
                result.log.push(`🩸 ${actor.name} drains ${drained} HP!`);
                result.actions.push({ type: 'hp_drain', actor: actor.name, amount: drained });
            }
        }
        // MP drain: skill steals MP
        if (totalDamage > 0 && effects.mp_drain && target.currentMp !== undefined) {
            const mpStolen = Math.floor(totalDamage * effects.mp_drain);
            if (mpStolen > 0 && target.currentMp > 0) {
                const actual = Math.min(mpStolen, target.currentMp);
                target.currentMp -= actual;
                actor.currentMp = Math.min(actor.maxMp || 999, (actor.currentMp || 0) + actual);
                result.log.push(`💧 ${actor.name} drains ${actual} MP from ${target.name}!`);
            }
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
        applyBleed(target, skill.bleed_tier, battle._bleedTiers, result, battle._settings);
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
    const { jp: _jp, buildFormulaVars: _bfv } = require('./stats');
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

    // ── BG3-STYLE: Any item can be thrown (even non-consumables) ──
    // If throw_target is set OR the item is explicitly being thrown (via targetId != actor)
    const isThrown = target && target.charId !== actor.charId;
    if (isThrown && !effects.throw_target && item.type !== 'CONSUMABLE') {
        // Generic throw: use item weight/value as damage, STR-based
        const throwDmg = Math.max(1, Math.floor((item.value || 5) * 0.3 + (actor.atk || 10) * 0.2));
        result.log.push(`${actor.name} hurls ${item.icon || '📦'} ${item.name} at ${target.name}!`);
        target.currentHp = Math.max(0, target.currentHp - throwDmg);
        result.log.push(`${target.name} takes ${throwDmg} damage!`);
        result.actions.push({ type: 'throw_damage', target: target.name, amount: throwDmg, item: item.name });

        // Consume the item
        if (inv[0].quantity > 1) await db.query("UPDATE character_items SET quantity=quantity-1 WHERE character_id=? AND item_id=?", [actor.charId, itemId]);
        else await db.query("DELETE FROM character_items WHERE character_id=? AND item_id=?", [actor.charId, itemId]);

        // Create surface if item has element (potion of fire creates fire surface, etc.)
        if (effects.surface_on_throw && battle.terrainMap && target.gridX !== undefined) {
            const key = `${target.gridX},${target.gridY}`;
            battle.terrainMap[key] = effects.surface_on_throw;
            result.log.push(`${effects.surface_on_throw} surface created!`);
            result.actions.push({ type: 'surface_created', x: target.gridX, y: target.gridY, surface: effects.surface_on_throw });
        }
        return result;
    }

    // Determine target: items with throw_target can target allies or enemies
    // throw_target: "self" (default), "ally", "enemy", "any"
    const throwTarget = effects.throw_target || 'self';
    const itemTarget = (throwTarget === 'self') ? actor
        : (throwTarget === 'enemy' && target) ? target
        : (throwTarget === 'ally' && target) ? target
        : (throwTarget === 'any' && target) ? target
        : actor;

    const throwVerb = itemTarget === actor ? 'uses' : 'throws';
    const onText = itemTarget === actor ? '' : ` on ${itemTarget.name}`;
    result.log.push(`${actor.name} ${throwVerb} ${item.icon || '🧪'} ${item.name}${onText}!`);

    // Heal HP
    if (effects.heal_hp) {
        const vars = buildFormulaVars(actor, itemTarget);
        const heal = Math.floor(safeEval(effects.heal_hp.formula || '50', vars));
        itemTarget.currentHp = Math.min(itemTarget.maxHp, itemTarget.currentHp + heal);
        result.log.push(`${itemTarget.name} recovers ${heal} HP!`);
        result.actions.push({ type: 'heal', target: itemTarget.name, amount: heal });
    }

    // Heal MP
    if (effects.heal_mp) {
        const vars = buildFormulaVars(actor, itemTarget);
        const heal = Math.floor(safeEval(effects.heal_mp.formula || '30', vars));
        itemTarget.currentMp = Math.min(itemTarget.maxMp, itemTarget.currentMp + heal);
        result.log.push(`${itemTarget.name} recovers ${heal} MP!`);
    }

    // Damage (thrown damage items — bombs, acid flasks, etc.)
    if (effects.throw_damage) {
        const vars = buildFormulaVars(actor, itemTarget);
        const dmg = Math.max(1, Math.floor(safeEval(effects.throw_damage.formula || '20', vars)));
        itemTarget.currentHp = Math.max(0, itemTarget.currentHp - dmg);
        result.log.push(`${itemTarget.name} takes ${dmg} damage!`);
        result.actions.push({ type: 'item_damage', target: itemTarget.name, amount: dmg, item: item.name });
    }

    // Apply status effect (throw debuff at enemy, buff at ally)
    if (effects.apply_status) {
        const statusName = effects.apply_status.name || effects.apply_status;
        const duration = effects.apply_status.duration || 3;
        await applyStatus(db, itemTarget, statusName, duration, result);
    }

    // Cure statuses
    if (effects.cure_status) {
        const toCure = Array.isArray(effects.cure_status) ? effects.cure_status : [effects.cure_status];
        itemTarget.statuses = itemTarget.statuses.filter(s => !toCure.includes(s.id));
        result.log.push(`Status cured!`);
    }

    // BG3-style: thrown potions create surfaces at the target position
    if (effects.surface_on_throw && itemTarget !== actor && battle.terrainMap && itemTarget.gridX !== undefined) {
        const key = `${itemTarget.gridX},${itemTarget.gridY}`;
        battle.terrainMap[key] = effects.surface_on_throw;
        result.log.push(`💧 ${effects.surface_on_throw} surface created at ${itemTarget.name}'s position!`);
        result.actions.push({ type: 'surface_created', x: itemTarget.gridX, y: itemTarget.gridY, surface: effects.surface_on_throw });
        // Spread to adjacent tiles if splash
        if (effects.surface_radius) {
            for (let dy = -effects.surface_radius; dy <= effects.surface_radius; dy++) {
                for (let dx = -effects.surface_radius; dx <= effects.surface_radius; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    if (Math.abs(dx) + Math.abs(dy) > effects.surface_radius) continue;
                    const sk = `${itemTarget.gridX + dx},${itemTarget.gridY + dy}`;
                    battle.terrainMap[sk] = effects.surface_on_throw;
                }
            }
        }
    }

    // Session 8: Heal a specific limb (e.g. splint, bandage, bone-mend potion)
    // Item effects: { "heal_limb": { "limb": "legs", "amount": 50 } }
    // OR: { "heal_limb": { "limb": "any", "amount": 30 } } (player chooses via targetLimb)
    if (effects.heal_limb && battle._settings?.enable_limb_targeting && itemTarget._limbHp) {
        const limbKey = effects.heal_limb.limb === 'any'
            ? (itemTarget._targetLimb || 'torso')
            : effects.heal_limb.limb;
        const limbData = itemTarget._limbHp[limbKey];
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
    // Lazy require combat.js functions to avoid circular dependency
    const { resolveStatusFromEffect, checkDeathOrKnockout } = require('./combat');

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

module.exports = { getSignatureTechs, resolveSkill, resolveItem, resolveLimitBreak };
