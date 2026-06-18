// =================================================================
// BATTLE STATS — Effective stat calculator, formula vars, scaling
// =================================================================

const { safeEval } = require('../event_runner');

function jp(s, f) { try { return JSON.parse(s); } catch { return f; } }

// =================================================================
// TABLE COMPATIBILITY HELPERS
// =================================================================
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
// STAT CALCULATOR — Equipment + Status Modifiers
// =================================================================
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
        currentHp: c.current_hp,
        maxHp: c.max_hp,
        currentMp: c.current_mp,
        maxMp: c.max_mp,
        atk: c.atk,
        def: c.def,
        mo: c.mo,
        md: c.md,
        speed: c.speed,
        luck: c.luck,
        limitbreak: parseFloat(c.limitbreak) || 0,
        breaklevel: c.breaklevel || 1,
        statuses: jp(c.status_effects, []),
        weaponElements: [],
        weaponStatuses: {},
        armorBlockStatuses: [],
        elemDefenses: [],
        _penetration: 0,
        _critResist: 0,
        oghamElements: [],
        oghamStatuses: {},
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

        const itemExtras = jp(item.combat_bonuses, null);
        if (itemExtras) {
            if (itemExtras.penetration) stats._penetration += parseFloat(itemExtras.penetration) || 0;
            if (itemExtras.crit_resist) stats._critResist += parseFloat(itemExtras.crit_resist) || 0;
        }

        const elems = jp(item.elements, null);
        if (elems) {
            for (const [elemName, val] of Object.entries(elems)) {
                const en = elemName.toLowerCase();
                if (typeof val === 'object' && val !== null) {
                    const role = val.role || 'resist';
                    const pct  = val.pct !== undefined ? val.pct : 50;
                    if (role === 'attack') {
                        stats.weaponElements.push(en);
                    } else {
                        stats.elemDefenses.push({ elem: en, role, pct });
                    }
                } else {
                    if (val === 'attack') stats.weaponElements.push(en);
                    else stats.elemDefenses.push({ elem: en, role: 'resist', pct: 50 });
                }
            }
        }

        if (item.slot_key === 'MAIN_HAND' || item.slot_key === 'OFF_HAND') {
            const ws = jp(item.set_status, null);
            if (ws) Object.assign(stats.weaponStatuses, ws);
        }

        const blocked = jp(item.block_status, null);
        if (blocked) stats.armorBlockStatuses.push(...blocked);
    }

    // 3. Status effect modifiers
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
        // Aggregate special combat modifiers from status effects
        if (effects.element_resist) {
            if (!stats._elementResist) stats._elementResist = {};
            for (const [elem, mult] of Object.entries(effects.element_resist)) {
                stats._elementResist[elem] = (stats._elementResist[elem] || 1) * mult;
            }
        }
        if (effects.element_infuse) {
            if (!stats._elementInfuse) stats._elementInfuse = [];
            stats._elementInfuse.push(effects.element_infuse);
        }
        if (effects.thorns) stats._thorns = (stats._thorns || 0) + effects.thorns;
        if (effects.counter_chance) stats._counterChance = Math.min(100, (stats._counterChance || 0) + effects.counter_chance);
        if (effects.crit_chance_mod) stats._critChanceMod = (stats._critChanceMod || 0) + effects.crit_chance_mod;
        if (effects.evasion_mod) stats._evasionMod = (stats._evasionMod || 0) + effects.evasion_mod;
    }

    // 4. Blood Ogham bonuses
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

    // Set bonus: 2+ Oghams from same family
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

    // 5. Passive reaction skills
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
                    trigger: rfx.reaction.trigger,
                    chance:  rfx.reaction.chance || 25
                });
            }
        }
    } catch { stats.reactions = []; }

    // 6. Body type (for limb targeting)
    stats.bodyTypeId = 1;
    try {
        const [npcRow] = await db.query(
            'SELECT body_type_id FROM game_npcs WHERE char_id=? LIMIT 1', [charId]);
        if (npcRow.length && npcRow[0].body_type_id) {
            stats.bodyTypeId = npcRow[0].body_type_id;
        }
    } catch {}

    // Merge ogham elements into weapon elements
    stats.weaponElements = [...new Set([...stats.weaponElements, ...stats.oghamElements])];

    // Clamp HP to max
    if (stats.currentHp > stats.maxHp) stats.currentHp = stats.maxHp;
    if (stats.currentMp > stats.maxMp) stats.currentMp = stats.maxMp;

    return stats;
}

// Build the vars object for safeEval formulas
function buildFormulaVars(attacker, defender) {
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
// ENEMY SCALING
// =================================================================
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
    scaled.speed     = Math.round(scaled.speed * (1 + (playerCount - 1) * scalingFactor * 0.3));
    return scaled;
}

async function getScalingFactor(db, mapId) {
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

module.exports = {
    jp,
    getEffectiveStats,
    buildFormulaVars,
    queryLevelRow,
    queryLimitBreakRow,
    queryLimitBreaksList,
    applyEnemyScaling,
    getScalingFactor
};
