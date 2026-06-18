// =================================================================
// ENEMY MORALE SYSTEM — Fear, Flee AI, Rout
// =================================================================
// ARCHITECTURE:
//   Every combatant has a morale value (0-100, starts at 100).
//   Morale drops when:
//     - An ally dies (-20)
//     - The combatant takes a critical hit (-10)
//     - HP drops below 25% (-15)
//     - A powerful attack lands (damage > 30% max HP: -10)
//     - The leader/boss dies (-30 to all allies)
//   Morale rises when:
//     - An enemy is killed (+10)
//     - A heal is received (+5)
//     - Turn passes without taking damage (+3)
//
//   Below the flee threshold (default 20), enemies attempt to flee.
//   If the leader flees, all allies rout (forced flee).
//   Players can pursue fleeing enemies for bonus attacks.
//
// DATA-DRIVEN:
//   All thresholds configurable via battle settings.
//   AI personality (brave/coward/fanatic) modifies behavior.
// =================================================================

const MORALE_DEFAULTS = {
    starting_morale: 100,
    max_morale: 100,
    flee_threshold: 20,
    // Morale loss triggers
    ally_death_loss: 20,
    leader_death_loss: 30,
    critical_hit_loss: 10,
    heavy_damage_loss: 10,
    heavy_damage_pct: 0.30,
    low_hp_loss: 15,
    low_hp_threshold: 0.25,
    // Morale gain triggers
    enemy_kill_gain: 10,
    heal_received_gain: 5,
    idle_turn_gain: 3,
    // Personality modifiers
    personality_brave_bonus: 20,
    personality_coward_penalty: -20,
    personality_fanatic_immune: true,
    // Pursuit
    pursuit_bonus_damage_pct: 0.50,
    // Rout
    rout_on_leader_flee: true,
};

function initMorale(battle) {
    if (!battle._settings?.enable_morale) return;
    for (const c of Object.values(battle.combatants)) {
        const base = battle._settings.starting_morale ?? MORALE_DEFAULTS.starting_morale;
        const personality = (c.personality || c.ai_personality || '').toLowerCase();
        let bonus = 0;
        if (personality === 'brave') bonus = battle._settings.personality_brave_bonus ?? MORALE_DEFAULTS.personality_brave_bonus;
        if (personality === 'coward') bonus = battle._settings.personality_coward_penalty ?? MORALE_DEFAULTS.personality_coward_penalty;
        c._morale = Math.min(battle._settings.max_morale ?? MORALE_DEFAULTS.max_morale, base + bonus);
        c._moraleFanatic = personality === 'fanatic';
        c._moraleIsLeader = c.is_boss || c.isBoss || false;
    }
}

function adjustMorale(battle, combatantId, delta, reason) {
    if (!battle._settings?.enable_morale) return;
    const c = battle.combatants[combatantId];
    if (!c || !c.isAI) return; // only AI has morale
    if (c._moraleFanatic) return; // fanatics never lose morale
    const max = battle._settings.max_morale ?? MORALE_DEFAULTS.max_morale;
    c._morale = Math.max(0, Math.min(max, (c._morale || 100) + delta));
}

// Called when a combatant dies
function onCombatantDeath(battle, deadId) {
    if (!battle._settings?.enable_morale) return [];
    const dead = battle.combatants[deadId];
    if (!dead) return [];

    const deadTeam = battle.getTeamId(deadId);
    const events = [];

    // Morale boost for enemies
    for (const [tid, members] of Object.entries(battle.teams)) {
        if (tid === deadTeam) continue;
        for (const id of members) {
            adjustMorale(battle, id, battle._settings.enemy_kill_gain ?? MORALE_DEFAULTS.enemy_kill_gain, 'enemy_killed');
        }
    }

    // Morale loss for allies
    const isLeader = dead._moraleIsLeader;
    const loss = isLeader
        ? (battle._settings.leader_death_loss ?? MORALE_DEFAULTS.leader_death_loss)
        : (battle._settings.ally_death_loss ?? MORALE_DEFAULTS.ally_death_loss);

    for (const id of (battle.teams[deadTeam] || [])) {
        if (id === deadId) continue;
        adjustMorale(battle, id, -loss, isLeader ? 'leader_died' : 'ally_died');
        const c = battle.combatants[id];
        if (c && shouldFlee(battle, id)) {
            events.push({ type: 'morale_flee', combatantId: id, name: c.name, reason: isLeader ? 'leader_fell' : 'morale_broken' });
        }
    }

    return events;
}

// Called when a combatant takes damage
function onDamageTaken(battle, targetId, damage, isCrit) {
    if (!battle._settings?.enable_morale) return;
    const target = battle.combatants[targetId];
    if (!target) return;

    if (isCrit) {
        adjustMorale(battle, targetId, -(battle._settings.critical_hit_loss ?? MORALE_DEFAULTS.critical_hit_loss), 'critical_hit');
    }

    const dmgPct = damage / Math.max(1, target.maxHp);
    if (dmgPct >= (battle._settings.heavy_damage_pct ?? MORALE_DEFAULTS.heavy_damage_pct)) {
        adjustMorale(battle, targetId, -(battle._settings.heavy_damage_loss ?? MORALE_DEFAULTS.heavy_damage_loss), 'heavy_damage');
    }

    // Low HP penalty only triggers once per combatant (not every hit)
    const hpPct = target.currentHp / Math.max(1, target.maxHp);
    if (hpPct < (battle._settings.low_hp_threshold ?? MORALE_DEFAULTS.low_hp_threshold) && !target._lowHpMoralePenaltyApplied) {
        target._lowHpMoralePenaltyApplied = true;
        adjustMorale(battle, targetId, -(battle._settings.low_hp_loss ?? MORALE_DEFAULTS.low_hp_loss), 'low_hp');
    }
}

// Called when healed
function onHealReceived(battle, targetId) {
    if (!battle._settings?.enable_morale) return;
    adjustMorale(battle, targetId, battle._settings.heal_received_gain ?? MORALE_DEFAULTS.heal_received_gain, 'healed');
}

// Called at end of turn if combatant wasn't attacked
function onIdleTurn(battle, combatantId) {
    if (!battle._settings?.enable_morale) return;
    adjustMorale(battle, combatantId, battle._settings.idle_turn_gain ?? MORALE_DEFAULTS.idle_turn_gain, 'idle_recovery');
}

function shouldFlee(battle, combatantId) {
    if (!battle._settings?.enable_morale) return false;
    const c = battle.combatants[combatantId];
    if (!c || !c.isAI) return false;
    if (c._moraleFanatic) return false;
    return (c._morale || 100) <= (battle._settings.flee_threshold ?? MORALE_DEFAULTS.flee_threshold);
}

// Rout: if a fleeing combatant is a leader, force all allies to flee
function checkRout(battle, fleeingId) {
    if (!battle._settings?.enable_morale) return [];
    if (!(battle._settings.rout_on_leader_flee ?? MORALE_DEFAULTS.rout_on_leader_flee)) return [];
    const fleeing = battle.combatants[fleeingId];
    if (!fleeing || !fleeing._moraleIsLeader) return [];

    const team = battle.getTeamId(fleeingId);
    const routed = [];
    for (const id of (battle.teams[team] || [])) {
        if (id === fleeingId) continue;
        const c = battle.combatants[id];
        if (c && c.currentHp > 0 && !c._knockedOut && !c._moraleFanatic) {
            c._morale = 0;
            routed.push({ type: 'rout', combatantId: id, name: c.name });
        }
    }
    return routed;
}

// Pursuit: bonus damage to fleeing enemies
function getPursuitBonus(battle, targetId) {
    if (!battle._settings?.enable_morale) return 0;
    if (!shouldFlee(battle, targetId)) return 0;
    return battle._settings.pursuit_bonus_damage_pct ?? MORALE_DEFAULTS.pursuit_bonus_damage_pct;
}

function getMoraleState(battle) {
    if (!battle._settings?.enable_morale) return null;
    const state = {};
    for (const [id, c] of Object.entries(battle.combatants)) {
        if (c._morale !== undefined) {
            state[id] = {
                morale: c._morale,
                fleeing: shouldFlee(battle, id),
                fanatic: c._moraleFanatic || false,
                leader: c._moraleIsLeader || false,
            };
        }
    }
    return state;
}

module.exports = {
    MORALE_DEFAULTS,
    initMorale,
    adjustMorale,
    onCombatantDeath,
    onDamageTaken,
    onHealReceived,
    onIdleTurn,
    shouldFlee,
    checkRout,
    getPursuitBonus,
    getMoraleState,
};
