// =================================================================
// LOOT SYSTEM — Steal, Drop Tables, Overkill, Chain, Rating
// =================================================================

const { jp } = require('./shared');

// ─── Steal Action ────────────────────────────────────────────────
// Mid-battle steal: roll against target's steal table.
// Two pools: common (high chance) and rare (low chance).
// Steal chance = (attacker.luck + attacker.speed*0.5) vs target level.

async function resolveSteal(db, battle, actor, target, result) {
    if (!battle._settings?.enable_steal) {
        result.log.push('Steal is not available.');
        return result;
    }

    if (target._alreadyStolen) {
        result.log.push(`${target.name} has nothing left to steal!`);
        return result;
    }

    // Prevent stealing from allies
    const actorTeam = battle.getTeamId(actor.charId);
    const targetTeam = battle.getTeamId(target.charId);
    if (actorTeam && targetTeam && actorTeam === targetTeam) {
        result.log.push(`${actor.name} can't steal from an ally!`);
        return result;
    }

    // Load steal table from NPC data
    let stealTable = null;
    try {
        const [rows] = await db.query(
            'SELECT steal_table_json, drop_table_json FROM game_npcs WHERE char_id=? LIMIT 1',
            [target.charId]
        );
        if (rows.length) {
            stealTable = jp(rows[0].steal_table_json, null) || jp(rows[0].drop_table_json, null);
        }
    } catch {}

    if (!stealTable || !stealTable.length) {
        result.log.push(`${target.name} has nothing to steal.`);
        return result;
    }

    // Steal chance: base 50% + (luck * 2) + (speed * 0.5) - (target_level * 3), min 10%, max 95%
    const baseChance = battle._settings.steal_base_chance || 50;
    const chance = Math.min(95, Math.max(10,
        baseChance + (actor.luck || 0) * 2 + (actor.speed || 0) * 0.5 - (target.level || 1) * 3
    ));

    if (Math.random() * 100 > chance) {
        result.log.push(`${actor.name} tries to steal from ${target.name}... but fails! (${Math.round(chance)}% chance)`);
        result.actions.push({ type: 'steal', actor: actor.name, target: target.name, success: false });
        return result;
    }

    // Try rare first, then common
    let stolen = null;
    const rareItems = stealTable.filter(e => e.rarity === 'rare');
    const commonItems = stealTable.filter(e => e.rarity !== 'rare');

    // Rare steal: 20% of the time (if rare items exist)
    if (rareItems.length && Math.random() < (battle._settings.steal_rare_chance || 0.20)) {
        const pick = rareItems[Math.floor(Math.random() * rareItems.length)];
        stolen = pick;
    }

    if (!stolen && commonItems.length) {
        const pick = commonItems[Math.floor(Math.random() * commonItems.length)];
        stolen = pick;
    }

    if (!stolen) {
        result.log.push(`${actor.name} rummages through ${target.name}'s pockets... nothing!`);
        return result;
    }

    // Give item to actor
    try {
        const qty = stolen.qty || 1;
        await db.query(
            'INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',
            [actor.charId, stolen.item_id, qty]
        );
        const [itemRow] = await db.query('SELECT name, icon FROM game_items WHERE id=?', [stolen.item_id]);
        const itemName = itemRow.length ? itemRow[0].name : `Item #${stolen.item_id}`;
        const itemIcon = itemRow.length ? itemRow[0].icon : '📦';

        result.log.push(`${itemIcon} ${actor.name} steals ${itemName}${qty > 1 ? ` x${qty}` : ''} from ${target.name}!`);
        result.actions.push({
            type: 'steal', actor: actor.name, target: target.name, success: true,
            item: { id: stolen.item_id, name: itemName, icon: itemIcon, qty, rare: stolen.rarity === 'rare' }
        });
    } catch (e) {
        result.log.push(`${actor.name} steals something but it crumbles to dust!`);
    }

    target._alreadyStolen = true;
    return result;
}

// ─── Auto Drop on Defeat ─────────────────────────────────────────
// Roll drop table when an enemy dies (not just KO loot action).
// Called from endBattle or checkDeathOrKnockout.

async function rollDropTable(db, enemyCharId, killerCharId, overkillDamage, settings) {
    const drops = [];
    try {
        const [rows] = await db.query(
            'SELECT drop_table_json FROM game_npcs WHERE char_id=? LIMIT 1',
            [enemyCharId]
        );
        if (!rows.length || !rows[0].drop_table_json) return drops;

        const table = jp(rows[0].drop_table_json, []);
        const overkillBonus = settings?.enable_overkill_bonus ? getOverkillMultiplier(overkillDamage, settings) : 1.0;

        for (const entry of table) {
            if (!entry.item_id) continue;
            const adjustedChance = Math.min(100, (entry.chance || 0) * overkillBonus);
            if (Math.random() * 100 > adjustedChance) continue;

            const qty = Math.max(1, entry.min_qty || 1);
            await db.query(
                'INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',
                [killerCharId, entry.item_id, qty]
            );
            const [iRow] = await db.query('SELECT name, icon FROM game_items WHERE id=?', [entry.item_id]);
            drops.push({
                name: iRow.length ? iRow[0].name : `Item #${entry.item_id}`,
                icon: iRow.length ? iRow[0].icon : '📦',
                qty,
            });
        }
    } catch {}
    return drops;
}

// ─── Overkill Bonus ──────────────────────────────────────────────
// If the killing blow exceeds the target's remaining HP by a large margin,
// grant bonus XP/gold and better drop rates.

function getOverkillMultiplier(overkillDamage, settings) {
    if (!settings?.enable_overkill_bonus || !overkillDamage || overkillDamage <= 0) return 1.0;
    // Overkill thresholds: 50% over = small bonus, 100% over = medium, 200% = large
    const pct = overkillDamage; // raw excess damage
    if (pct >= (settings.overkill_threshold_large || 200)) return settings.overkill_mult_large || 2.0;
    if (pct >= (settings.overkill_threshold_medium || 100)) return settings.overkill_mult_medium || 1.5;
    if (pct >= (settings.overkill_threshold_small || 50)) return settings.overkill_mult_small || 1.25;
    return 1.0;
}

function getOverkillXpBonus(overkillDamage, settings) {
    const mult = getOverkillMultiplier(overkillDamage, settings);
    return mult - 1.0; // e.g. 0.5 = +50% XP
}

// ─── Battle Chain ────────────────────────────────────────────────
// Consecutive battles without resting increase drop rates and XP.
// Tracked per-character in memory (resets on rest/inn/death).

function getBattleChainBonus(character, settings) {
    if (!settings?.enable_battle_chain) return { xpMult: 1.0, dropMult: 1.0, chain: 0 };
    const chain = character._battleChain || 0;
    const xpPerChain = settings.chain_xp_bonus || 0.05;
    const dropPerChain = settings.chain_drop_bonus || 0.10;
    const maxChainBonus = settings.chain_max_bonus || 0.50;

    return {
        xpMult: 1.0 + Math.min(maxChainBonus, chain * xpPerChain),
        dropMult: 1.0 + Math.min(maxChainBonus, chain * dropPerChain),
        chain,
    };
}

function incrementBattleChain(character) {
    character._battleChain = (character._battleChain || 0) + 1;
}

function resetBattleChain(character) {
    character._battleChain = 0;
}

// ─── Battle Performance Rating ───────────────────────────────────
// S/A/B/C/D rank based on: turns taken, damage taken, no-death bonus,
// abilities used variety, overkill. Affects XP/gold multiplier.

function calculateBattleRating(battle, winnerTeamId, settings) {
    if (!settings?.enable_battle_rating) return null;

    const members = (battle.teams[winnerTeamId] || [])
        .map(id => battle.combatants[id])
        .filter(c => c && !c.isAI);
    if (!members.length) return null;

    let score = 100; // start at 100, subtract penalties, add bonuses

    // Turns taken: fewer = better
    const turnCount = battle.turnCount || battle.log?.length || 10;
    const targetTurns = settings.rating_target_turns || 8;
    if (turnCount <= targetTurns) score += 20;
    else if (turnCount <= targetTurns * 1.5) score += 0;
    else if (turnCount <= targetTurns * 2) score -= 15;
    else score -= 30;

    // Damage taken: less = better
    const totalMaxHp = members.reduce((s, c) => s + c.maxHp, 0);
    const totalCurrentHp = members.reduce((s, c) => s + Math.max(0, c.currentHp), 0);
    const hpPct = totalCurrentHp / Math.max(1, totalMaxHp);
    if (hpPct >= 0.90) score += 25;       // barely scratched
    else if (hpPct >= 0.70) score += 10;   // took some hits
    else if (hpPct >= 0.40) score -= 5;
    else score -= 20;                       // barely survived

    // No-death bonus
    const anyDied = members.some(c => c.currentHp <= 0 || c._knockedOut);
    if (!anyDied) score += 15;
    else score -= 10;

    // Determine rank
    let rank, label, xpMult, goldMult;
    if (score >= 140) { rank = 'S'; label = 'Perfect'; xpMult = settings.rating_s_xp_mult || 1.50; goldMult = settings.rating_s_gold_mult || 2.00; }
    else if (score >= 110) { rank = 'A'; label = 'Excellent'; xpMult = settings.rating_a_xp_mult || 1.25; goldMult = settings.rating_a_gold_mult || 1.50; }
    else if (score >= 80) { rank = 'B'; label = 'Good'; xpMult = 1.0; goldMult = 1.0; }
    else if (score >= 50) { rank = 'C'; label = 'Average'; xpMult = 0.90; goldMult = 0.90; }
    else { rank = 'D'; label = 'Poor'; xpMult = 0.75; goldMult = 0.75; }

    return { rank, label, score, xpMult, goldMult, turns: turnCount, hpPct: Math.round(hpPct * 100), noDeath: !anyDied };
}

module.exports = {
    resolveSteal,
    rollDropTable,
    getOverkillMultiplier, getOverkillXpBonus,
    getBattleChainBonus, incrementBattleChain, resetBattleChain,
    calculateBattleRating,
};
