// =================================================================
// AUTO-BATTLE SYSTEM — AI-controlled party + speed controls
// =================================================================
// ARCHITECTURE:
//   When enabled, the AI picks actions for player characters using
//   configurable tactics presets. Players can toggle auto-battle
//   mid-fight and change tactics at any time.
//
// TACTICS:
//   aggressive  — prioritize highest damage, ignore defense
//   defensive   — guard when HP < 50%, heal allies, conserve
//   balanced    — mix of offense and healing, default
//   conserve_mp — prefer basic attacks, only use skills if needed
//   focus_heal  — prioritize healing lowest HP ally
//
// SPEED:
//   1x (normal), 2x, 4x — controls delay between auto-turns
// =================================================================

const TACTICS = {
    aggressive: {
        label: 'Aggressive',
        icon: '⚔️',
        description: 'Prioritize damage. Target weakest enemy. Ignore defense.',
        healThreshold: 0.15,
        useSkillsFreely: true,
        preferTarget: 'lowest_hp',
        guardThreshold: 0,
        buffPriority: 'attack',
    },
    defensive: {
        label: 'Defensive',
        icon: '🛡️',
        description: 'Guard when hurt. Heal allies. Play safe.',
        healThreshold: 0.50,
        useSkillsFreely: false,
        preferTarget: 'highest_threat',
        guardThreshold: 0.50,
        buffPriority: 'defense',
    },
    balanced: {
        label: 'Balanced',
        icon: '⚖️',
        description: 'Mix of offense and support. Smart target selection.',
        healThreshold: 0.35,
        useSkillsFreely: true,
        preferTarget: 'lowest_hp',
        guardThreshold: 0.25,
        buffPriority: 'attack',
    },
    conserve_mp: {
        label: 'Conserve MP',
        icon: '💎',
        description: 'Basic attacks only. Skills only in emergencies.',
        healThreshold: 0.25,
        useSkillsFreely: false,
        preferTarget: 'lowest_hp',
        guardThreshold: 0.30,
        buffPriority: 'none',
    },
    focus_heal: {
        label: 'Focus Healer',
        icon: '💚',
        description: 'Prioritize healing lowest HP ally. Attack when everyone is healthy.',
        healThreshold: 0.80,
        useSkillsFreely: true,
        preferTarget: 'lowest_hp',
        guardThreshold: 0.20,
        buffPriority: 'heal',
    },
};

const SPEED_MULTIPLIERS = { 1: 1.0, 2: 0.5, 4: 0.25 };

function pickAutoAction(battle, combatant, tactics) {
    const tactic = TACTICS[tactics] || TACTICS.balanced;
    const team = battle.getTeamId(combatant.charId);
    const allies = getTeamAlive(battle, team);
    const enemies = getEnemiesAlive(battle, team);

    if (!enemies.length) return { action: 'wait' };

    const hpPct = combatant.currentHp / Math.max(1, combatant.maxHp);
    const mpPct = combatant.currentMp / Math.max(1, combatant.maxMp || 1);

    // 1. Emergency heal self or ally
    const woundedAlly = allies.find(a =>
        (a.currentHp / Math.max(1, a.maxHp)) < tactic.healThreshold
    );
    if (woundedAlly && tactic.buffPriority === 'heal') {
        const healSkill = findSkillByType(combatant, 'heal');
        if (healSkill && mpPct > 0.15) {
            return { action: 'skill', skillId: healSkill.id, targetId: woundedAlly.charId };
        }
    }

    // 2. Guard if low HP
    if (hpPct < tactic.guardThreshold && tactic.guardThreshold > 0) {
        return { action: 'defend' };
    }

    // 3. Heal ally if needed (non-healer builds)
    if (woundedAlly && tactic.healThreshold > 0.30) {
        const healSkill = findSkillByType(combatant, 'heal');
        if (healSkill && mpPct > 0.20) {
            return { action: 'skill', skillId: healSkill.id, targetId: woundedAlly.charId };
        }
    }

    // 4. Use offensive skill
    if (tactic.useSkillsFreely && mpPct > 0.20) {
        const atkSkill = findSkillByType(combatant, 'damage');
        if (atkSkill) {
            const target = pickTarget(enemies, tactic.preferTarget);
            return { action: 'skill', skillId: atkSkill.id, targetId: target.charId };
        }
    }

    // 5. Basic attack
    const target = pickTarget(enemies, tactic.preferTarget);
    return { action: 'attack', targetId: target.charId };
}

function pickTarget(enemies, strategy) {
    if (!enemies.length) return null;
    switch (strategy) {
        case 'lowest_hp':
            return enemies.reduce((a, b) => a.currentHp < b.currentHp ? a : b);
        case 'highest_threat':
            return enemies.reduce((a, b) => (b._threat || 0) > (a._threat || 0) ? b : a);
        case 'highest_hp':
            return enemies.reduce((a, b) => a.currentHp > b.currentHp ? a : b);
        default:
            return enemies[0];
    }
}

function findSkillByType(combatant, type) {
    if (!combatant._skills) return null;
    return combatant._skills.find(s => {
        if (type === 'heal') return s.effect_type === 'heal' || s.target_type === 'ally';
        if (type === 'damage') return s.effect_type === 'damage' || !s.target_type || s.target_type === 'enemy';
        return false;
    });
}

function getTeamAlive(battle, teamId) {
    return (battle.teams[teamId] || [])
        .map(id => battle.combatants[id])
        .filter(c => c && c.currentHp > 0 && !c._knockedOut);
}

function getEnemiesAlive(battle, myTeamId) {
    const all = [];
    for (const [tid, members] of Object.entries(battle.teams)) {
        if (tid === myTeamId) continue;
        for (const id of members) {
            const c = battle.combatants[id];
            if (c && c.currentHp > 0 && !c._knockedOut) all.push(c);
        }
    }
    return all;
}

function getAutoDelay(baseDelay, speed) {
    const mult = SPEED_MULTIPLIERS[speed] || 1.0;
    return Math.max(200, baseDelay * mult);
}

module.exports = {
    TACTICS,
    SPEED_MULTIPLIERS,
    pickAutoAction,
    pickTarget,
    getAutoDelay,
    getTeamAlive,
    getEnemiesAlive,
};
