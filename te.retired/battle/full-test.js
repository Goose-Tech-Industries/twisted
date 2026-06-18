// =================================================================
// FULL SYSTEM TEST — Every game feature, every code path
// Run: node battle/full-test.js
// =================================================================

console.log('\n========================================================');
console.log('  TWISTED ENGINE — FULL SYSTEM TEST');
console.log('  Testing every battle system, route, and integration');
console.log('========================================================\n');

const movement = require('./movement');
const formation = require('./formation');
const turns = require('./turns');
const defensive = require('./defensive');
const buffs = require('./buffs');
const loot = require('./loot');
const autobattle = require('./autobattle');
const preview = require('./preview');
const morale = require('./morale');
const bd = require('./bravedefault');
const { RealtimeBattle } = require('./realtime');
const { safeEval } = require('./shared');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0, sections = {};
let currentSection = '';

function section(name) { currentSection = name; sections[name] = { p: 0, f: 0 }; console.log(`\n--- ${name} ---`); }
function test(name, fn) {
    try {
        const err = fn();
        if (err) { console.log(`  \x1b[31mFAIL\x1b[0m ${name}: ${err}`); failed++; sections[currentSection].f++; }
        else { console.log(`  \x1b[32mPASS\x1b[0m ${name}`); passed++; sections[currentSection].p++; }
    } catch (e) {
        console.log(`  \x1b[31mERR \x1b[0m ${name}: ${e.message}`);
        failed++; sections[currentSection].f++;
    }
}

// ─── Helpers ─────────────────────────────────────────────────────
function makeBattle(ov = {}) {
    return {
        _settings: {
            enable_morale: true, starting_morale: 100, max_morale: 100, flee_threshold: 20,
            ally_death_loss: 20, leader_death_loss: 30, critical_hit_loss: 10,
            heavy_damage_loss: 10, heavy_damage_pct: 0.30, low_hp_loss: 15, low_hp_threshold: 0.25,
            enemy_kill_gain: 10, heal_received_gain: 5, idle_turn_gain: 3,
            personality_brave_bonus: 20, personality_coward_penalty: -20,
            enable_brave_default: true, bd_starting_bp: 0, bd_max_bp: 3, bd_min_bp: -3,
            bd_default_defense_bonus: 0.25, bd_negative_bp_skip_turn: true, bd_bp_regen_per_turn: 0,
            enable_cover_system: true, cover_duration: 2, cover_damage_split: 1.0,
            enable_steal: true, enable_formations: true, enable_elevation: true,
            elevation_height_bonus: 0.15, enable_damage_preview: true,
            enable_buff_stacking: true, default_stack_mode: 'refresh', default_max_stacks: 5,
            enable_status_immunity: true, cleanse_immunity_duration: 2,
            enable_barriers: true, base_crit_chance: 5, crit_damage_multiplier: 1.5,
            enable_difficult_terrain: true, difficult_terrain_cost: 2,
            enable_opportunity_attacks: true, opportunity_attack_damage_pct: 0.50,
            enable_zone_of_control: true, enable_aoe_shapes: true,
            grid_width: 8, grid_height: 5,
            front_melee_bonus: 0, back_melee_penalty: 0.30, back_melee_reduction: 0.50,
            back_ranged_bonus: 0.10, row_swap_costs_turn: true,
            initiative_type: 'speed', atb_wait_mode: true, atb_speed_factor: 5.0, atb_tick_rate: 500,
            ctb_base_recovery: 100, ctb_speed_divisor: 10, ctb_timeline_length: 10,
            enable_auto_battle: true, auto_battle_default_tactics: 'balanced',
            enable_morale: true, enable_brave_default: true,
            steal_base_chance: 50, steal_rare_chance: 0.20,
            enable_overkill_bonus: true, overkill_threshold_small: 50, overkill_mult_small: 1.25,
            overkill_threshold_medium: 100, overkill_mult_medium: 1.50,
            overkill_threshold_large: 200, overkill_mult_large: 2.00,
            enable_battle_chain: true, chain_xp_bonus: 0.05, chain_drop_bonus: 0.10, chain_max_bonus: 0.50,
            enable_battle_rating: true, rating_target_turns: 8,
            enable_cleanse: true, enable_dispel: true,
            stagger_base_increase: 5, stagger_decay_per_turn: 10,
            ...ov,
        },
        combatants: {}, teams: {}, status: 'ACTIVE', GRID_W: 8, GRID_H: 5,
        elevationMap: {}, terrainMap: {}, battleObjects: {},
        turnCount: 0, log: [],
        getTeamId(id) { for (const [t, m] of Object.entries(this.teams)) if (m.includes(id)) return t; return null; },
        getTerrainAt(x, y) { return this.terrainMap[`${x},${y}`] || 'normal'; },
    };
}
function makeC(id, name, o = {}) {
    return {
        charId: id, name, currentHp: o.hp ?? 100, maxHp: o.maxHp ?? 100,
        currentMp: o.mp ?? 50, maxMp: o.maxMp ?? 50, level: o.level ?? 5,
        isAI: o.isAI ?? false, is_boss: o.isBoss ?? false,
        personality: o.personality ?? '',
        attack: o.attack ?? 15, defense: o.defense ?? 8, def: o.def ?? 8,
        md: o.md ?? 5, mo: o.mo ?? 5, luck: o.luck ?? 10, speed: o.speed ?? 10,
        statuses: [], gridX: o.gridX ?? 0, gridY: o.gridY ?? 0,
        row: o.row ?? 'front', className: o.className ?? 'warrior',
        weaponType: o.weaponType ?? 'sword',
        _skills: o.skills ?? [], ...o,
    };
}

// =================================================================
// 1. MOVEMENT & PATHFINDING
// =================================================================
section('Movement & Pathfinding');

test('chebyshev distance', () => {
    const d = movement.chebyshev({ gridX: 0, gridY: 0 }, { gridX: 3, gridY: 2 });
    if (d !== 3) return `Expected 3, got ${d}`;
    return null;
});

test('manhattan distance', () => {
    const d = movement.manhattan({ gridX: 0, gridY: 0 }, { gridX: 3, gridY: 2 });
    if (d !== 5) return `Expected 5, got ${d}`;
    return null;
});

test('findPath — straight line no obstacles', () => {
    const b = makeBattle();
    b.combatants = {};
    const p = movement.findPath(b, 0, 0, 3, 0, 10);
    if (!p) return `No path found`;
    if (p[p.length - 1].x !== 3 || p[p.length - 1].y !== 0) return `Path doesn't reach destination`;
    return null;
});

test('findPath — blocked by combatant', () => {
    const b = makeBattle();
    const blocker = makeC('b1', 'Wall', { gridX: 1, gridY: 0 });
    b.combatants = { b1: blocker };
    const p = movement.findPath(b, 0, 0, 2, 0, 10);
    if (!p) return `Should find path around blocker`;
    // Path should go around, not through (1,0)
    if (p.some(t => t.x === 1 && t.y === 0)) return `Path goes through blocked tile`;
    return null;
});

test('findPath — out of range returns null', () => {
    const b = makeBattle();
    b.combatants = {};
    const p = movement.findPath(b, 0, 0, 7, 4, 2);
    if (p !== null) return `Should return null for out-of-range`;
    return null;
});

test('findPath — out of bounds returns null', () => {
    const b = makeBattle();
    b.combatants = {};
    const p = movement.findPath(b, 0, 0, -1, 0, 10);
    if (p !== null) return `Should return null for out-of-bounds`;
    return null;
});

test('isDifficultTerrain', () => {
    if (!movement.isDifficultTerrain('mud')) return `mud should be difficult`;
    if (!movement.isDifficultTerrain('swamp')) return `swamp should be difficult`;
    if (movement.isDifficultTerrain('normal')) return `normal should not be difficult`;
    if (movement.isDifficultTerrain('grass')) return `grass should not be difficult`;
    return null;
});

test('elevation bonus — attacking downhill', () => {
    const b = makeBattle();
    b.elevationMap = { '0,0': 3, '2,2': 0 };
    const r = movement.getElevationBonus(b, { gridX: 0, gridY: 0 }, { gridX: 2, gridY: 2 });
    if (r.damage <= 0) return `Downhill should give damage bonus, got ${r.damage}`;
    if (r.accuracy <= 0) return `Downhill should give accuracy bonus`;
    return null;
});

test('elevation bonus — attacking uphill', () => {
    const b = makeBattle();
    b.elevationMap = { '0,0': 0, '2,2': 3 };
    const r = movement.getElevationBonus(b, { gridX: 0, gridY: 0 }, { gridX: 2, gridY: 2 });
    if (r.accuracy >= 0) return `Uphill should give accuracy penalty, got ${r.accuracy}`;
    if (r.dodge <= 0) return `Target should get dodge bonus`;
    return null;
});

test('elevation bonus — same level = zero', () => {
    const b = makeBattle();
    b.elevationMap = { '0,0': 1, '2,2': 1 };
    const r = movement.getElevationBonus(b, { gridX: 0, gridY: 0 }, { gridX: 2, gridY: 2 });
    if (r.damage !== 0 || r.accuracy !== 0 || r.dodge !== 0) return `Same level should be all zeros`;
    return null;
});

test('getAoeTiles — circle radius 1', () => {
    const b = makeBattle();
    const tiles = movement.getAoeTiles({ x: 3, y: 2 }, { type: 'circle', radius: 1 }, null, b);
    if (!tiles || tiles.length === 0) return `No tiles returned`;
    if (tiles.length < 5) return `Circle r=1 should have ~5+ tiles, got ${tiles.length}`;
    // Center should be included
    if (!tiles.some(t => t.x === 3 && t.y === 2)) return `Center tile missing`;
    return null;
});

test('getMoveRange returns a number', () => {
    const c = makeC('c1', 'Runner', { speed: 15 });
    const r = movement.getMoveRange(c, {});
    if (typeof r !== 'number' || r <= 0) return `Expected positive number, got ${r}`;
    return null;
});

// =================================================================
// 2. FORMATION SYSTEM
// =================================================================
section('Formation System');

test('assignDefaultRow — warrior = front', () => {
    const c = makeC('c1', 'Warrior', { className: 'warrior' });
    const row = formation.assignDefaultRow(c);
    if (row !== 'front') return `Expected front, got ${row}`;
    return null;
});

test('assignDefaultRow — mage = back', () => {
    const c = makeC('c1', 'Mage', { className: 'mage' });
    const row = formation.assignDefaultRow(c);
    if (row !== 'back') return `Expected back, got ${row}`;
    return null;
});

test('assignDefaultRow — archer = back', () => {
    const c = makeC('c1', 'Archer', { className: 'archer' });
    const row = formation.assignDefaultRow(c);
    if (row !== 'back') return `Expected back, got ${row}`;
    return null;
});

test('canMeleeTarget — front row always targetable', () => {
    const b = makeBattle();
    const a = makeC('a1', 'Attacker', { row: 'front' });
    const t = makeC('t1', 'Target', { row: 'front' });
    b.combatants = { a1: a, t1: t }; b.teams = { e: ['t1'], p: ['a1'] };
    if (!formation.canMeleeTarget(b, a, t)) return `Front row should be targetable`;
    return null;
});

test('canMeleeTarget — back row protected when front exists', () => {
    const b = makeBattle();
    const front = makeC('f1', 'FrontGuard', { row: 'front', hp: 100 });
    const back = makeC('b1', 'BackMage', { row: 'back' });
    const atk = makeC('a1', 'Attacker', { row: 'front' });
    b.combatants = { f1: front, b1: back, a1: atk };
    b.teams = { enemies: ['f1', 'b1'], players: ['a1'] };
    if (formation.canMeleeTarget(b, atk, back)) return `Back row should be protected`;
    return null;
});

test('canMeleeTarget — back row exposed when front dead', () => {
    const b = makeBattle();
    const front = makeC('f1', 'DeadGuard', { row: 'front', hp: 0 });
    const back = makeC('b1', 'BackMage', { row: 'back' });
    const atk = makeC('a1', 'Attacker');
    b.combatants = { f1: front, b1: back, a1: atk };
    b.teams = { enemies: ['f1', 'b1'], players: ['a1'] };
    if (!formation.canMeleeTarget(b, atk, back)) return `Back row should be exposed when front dead`;
    return null;
});

test('getRowDamageModifier — back row melee penalty', () => {
    const b = makeBattle();
    const a = makeC('a1', 'BackAttacker', { row: 'back' });
    const t = makeC('t1', 'Target', { row: 'front' });
    const m = formation.getRowDamageModifier(b, a, t, false);
    if (m.dealt >= 1.0) return `Back row melee should have penalty, got dealt=${m.dealt}`;
    return null;
});

test('getRowDamageModifier — back row ranged bonus', () => {
    const b = makeBattle();
    const a = makeC('a1', 'BackArcher', { row: 'back' });
    const t = makeC('t1', 'Target', { row: 'front' });
    const m = formation.getRowDamageModifier(b, a, t, true);
    if (m.dealt <= 1.0) return `Back row ranged should have bonus, got dealt=${m.dealt}`;
    return null;
});

test('swapRow — front to back', () => {
    const b = makeBattle();
    const c = makeC('c1', 'Warrior', { row: 'front', hp: 100 });
    b.combatants = { c1: c };
    const r = formation.swapRow(b, 'c1');
    if (!r.success) return `Swap failed: ${r.reason}`;
    if (c.row !== 'back') return `Expected back, got ${c.row}`;
    return null;
});

test('swapRow — dead combatant cannot swap', () => {
    const b = makeBattle();
    const c = makeC('c1', 'Dead', { row: 'front', hp: 0 });
    b.combatants = { c1: c };
    const r = formation.swapRow(b, 'c1');
    if (r.success) return `Dead combatant should not swap`;
    return null;
});

// =================================================================
// 3. TURN SYSTEMS (ATB + CTB)
// =================================================================
section('Turn Systems (ATB/CTB)');

test('ATB init — gauges assigned to living combatants', () => {
    const b = makeBattle({ initiative_type: 'atb' });
    const c1 = makeC('c1', 'Fast', { speed: 20, hp: 100, isAI: true });
    const c2 = makeC('c2', 'Dead', { speed: 10, hp: 0, isAI: true });
    b.combatants = { c1, c2 }; b.teams = { t: ['c1', 'c2'] };
    turns.initATB(b);
    if (!b._atb) return `ATB not initialized`;
    if (b._atb.gauges['c1'] === undefined) return `Living combatant missing gauge`;
    if (b._atb.gauges['c2'] !== undefined) return `Dead combatant should not have gauge`;
    return null;
});

test('ATB tick — gauges increase', () => {
    const b = makeBattle({ initiative_type: 'atb' });
    const c1 = makeC('c1', 'Fighter', { speed: 20, hp: 100, isAI: true });
    b.combatants = { c1 }; b.teams = { t: ['c1'] };
    turns.initATB(b);
    b._atb.gauges['c1'] = 0;
    b._atb.lastTick = Date.now() - 1000; // force tick
    const ready = turns.tickATB(b);
    if (b._atb.gauges['c1'] <= 0) return `Gauge should increase`;
    return null;
});

test('ATB pause — no tick when paused', () => {
    const b = makeBattle({ initiative_type: 'atb' });
    const c1 = makeC('c1', 'Fighter', { speed: 20, hp: 100, isAI: true });
    b.combatants = { c1 }; b.teams = { t: ['c1'] };
    turns.initATB(b);
    b._atb.gauges['c1'] = 500;
    turns.setATBPause(b, true);
    b._atb.lastTick = Date.now() - 1000;
    turns.tickATB(b);
    if (b._atb.gauges['c1'] !== 500) return `Gauge should not change when paused`;
    return null;
});

test('ATB reset — gauge resets after action', () => {
    const b = makeBattle({ initiative_type: 'atb' });
    const c1 = makeC('c1', 'Fighter', { speed: 20, hp: 100, isAI: true });
    b.combatants = { c1 }; b.teams = { t: ['c1'] };
    turns.initATB(b);
    b._atb.gauges['c1'] = 1000;
    turns.resetATBGauge(b, 'c1', 1.0);
    if (b._atb.gauges['c1'] >= 1000) return `Gauge should reset after action`;
    return null;
});

test('CTB init — counters assigned', () => {
    const b = makeBattle({ initiative_type: 'ctb' });
    const c1 = makeC('c1', 'Fast', { speed: 20, hp: 100, isAI: true });
    const c2 = makeC('c2', 'Slow', { speed: 5, hp: 100, isAI: true });
    b.combatants = { c1, c2 }; b.teams = { t1: ['c1'], t2: ['c2'] };
    turns.initCTB(b);
    if (!b._ctb) return `CTB not initialized`;
    if (b._ctb.counters['c1'] >= b._ctb.counters['c2']) return `Faster unit should have lower counter`;
    return null;
});

test('CTB advance — fastest goes first', () => {
    const b = makeBattle({ initiative_type: 'ctb' });
    const c1 = makeC('c1', 'Fast', { speed: 20, hp: 100, isAI: true });
    const c2 = makeC('c2', 'Slow', { speed: 5, hp: 100, isAI: true });
    b.combatants = { c1, c2 }; b.teams = { t1: ['c1'], t2: ['c2'] };
    turns.initCTB(b);
    const next = turns.advanceCTB(b);
    if (next !== 'c1') return `Expected c1 (faster), got ${next}`;
    return null;
});

test('CTB timeline — shows future turns', () => {
    const b = makeBattle({ initiative_type: 'ctb' });
    const c1 = makeC('c1', 'Fast', { speed: 20, hp: 100, isAI: true });
    const c2 = makeC('c2', 'Slow', { speed: 5, hp: 100, isAI: true });
    b.combatants = { c1, c2 }; b.teams = { t1: ['c1'], t2: ['c2'] };
    turns.initCTB(b);
    const tl = turns.getCTBTimeline(b);
    if (!tl || tl.length === 0) return `Timeline should not be empty`;
    if (tl.length < 5) return `Timeline should have multiple entries, got ${tl.length}`;
    return null;
});

// =================================================================
// 4. DEFENSIVE SYSTEMS
// =================================================================
section('Defensive Systems (Cover/Barriers)');

test('applyBarrier — absorbs full damage', () => {
    const c = makeC('c1', 'Tank');
    defensive.applyBarrier(c, 100, 3, 'all');
    const remaining = defensive.resolveBarrier(c, 50, 'physical', { log: [], actions: [] });
    if (remaining !== 0) return `Should absorb all 50, remaining=${remaining}`;
    if (c._barrier.hp !== 50) return `Barrier HP should be 50, got ${c._barrier.hp}`;
    return null;
});

test('applyBarrier — partial absorb then shatter', () => {
    const c = makeC('c1', 'Tank');
    defensive.applyBarrier(c, 30, 3, 'all');
    const remaining = defensive.resolveBarrier(c, 50, 'physical', { log: [], actions: [] });
    if (remaining !== 20) return `Should let 20 through, remaining=${remaining}`;
    if (c._barrier !== null) return `Barrier should be shattered`;
    return null;
});

test('applyBarrier — type filter blocks wrong type', () => {
    const c = makeC('c1', 'MageShield');
    defensive.applyBarrier(c, 100, 3, 'magic');
    const remaining = defensive.resolveBarrier(c, 50, 'physical', { log: [], actions: [] });
    if (remaining !== 50) return `Physical should bypass magic barrier, remaining=${remaining}`;
    if (c._barrier.hp !== 100) return `Barrier should be untouched`;
    return null;
});

test('tickBarrier — expires after duration', () => {
    const c = makeC('c1', 'Tank');
    defensive.applyBarrier(c, 100, 1, 'all');
    defensive.tickBarrier(c);
    if (c._barrier !== null) return `Barrier should expire after 1 tick`;
    return null;
});

test('tickCover — expires after duration', () => {
    const b = makeBattle();
    const tank = makeC('t1', 'Tank');
    const mage = makeC('m1', 'Mage');
    b.combatants = { t1: tank, m1: mage }; b.teams = { p: ['t1', 'm1'] };
    defensive.applyCover(b, tank, mage);
    defensive.tickCover(b);
    defensive.tickCover(b);
    if (tank._covering !== null) return `Cover should expire after 2 ticks`;
    return null;
});

// =================================================================
// 5. BUFF SYSTEM
// =================================================================
section('Buff System (Stacking/Cleanse/Dispel/Immunity)');

test('enhancedApplyStatus — refresh mode resets duration', () => {
    const c = makeC('c1', 'Target'); c.statuses = [];
    const r = { log: [] };
    buffs.enhancedApplyStatus(c, { name: 'Burn', category: 'debuff', stack_mode: 'refresh' }, 3, {}, r);
    buffs.enhancedApplyStatus(c, { name: 'Burn', category: 'debuff', stack_mode: 'refresh' }, 5, {}, r);
    if (c.statuses.length !== 1) return `Should have 1 status, got ${c.statuses.length}`;
    if (c.statuses[0].turns !== 5) return `Duration should refresh to 5, got ${c.statuses[0].turns}`;
    return null;
});

test('enhancedApplyStatus — stack mode adds stacks', () => {
    const c = makeC('c1', 'Target'); c.statuses = [];
    const r = { log: [] };
    buffs.enhancedApplyStatus(c, { name: 'Bleed', category: 'debuff', stack_mode: 'stack', max_stacks: 3 }, 3, {}, r);
    buffs.enhancedApplyStatus(c, { name: 'Bleed', category: 'debuff', stack_mode: 'stack', max_stacks: 3 }, 3, {}, r);
    const stacks = buffs.getStacks(c, 'Bleed');
    if (stacks !== 2) return `Should have 2 stacks, got ${stacks}`;
    return null;
});

test('enhancedApplyStatus — max stacks cap', () => {
    const c = makeC('c1', 'Target'); c.statuses = [];
    const r = { log: [] };
    for (let i = 0; i < 5; i++) {
        buffs.enhancedApplyStatus(c, { name: 'Poison', category: 'debuff', stack_mode: 'stack', max_stacks: 3 }, 3, {}, r);
    }
    const stacks = buffs.getStacks(c, 'Poison');
    if (stacks > 3) return `Should cap at 3 stacks, got ${stacks}`;
    return null;
});

test('enhancedApplyStatus — overwrite replaces existing', () => {
    const c = makeC('c1', 'Target'); c.statuses = [];
    const r = { log: [] };
    buffs.enhancedApplyStatus(c, { name: 'Shield', category: 'defensive', stack_mode: 'overwrite' }, 2, {}, r);
    buffs.enhancedApplyStatus(c, { name: 'Shield', category: 'defensive', stack_mode: 'overwrite' }, 5, {}, r);
    if (c.statuses.length !== 1) return `Should have 1 status after overwrite, got ${c.statuses.length}`;
    if (c.statuses[0].turns !== 5) return `Duration should be 5, got ${c.statuses[0].turns}`;
    return null;
});

test('enhancedApplyStatus — ignore mode skips if exists', () => {
    const c = makeC('c1', 'Target'); c.statuses = [];
    const r = { log: [] };
    buffs.enhancedApplyStatus(c, { name: 'Unique', category: 'debuff', stack_mode: 'ignore' }, 3, {}, r);
    const applied = buffs.enhancedApplyStatus(c, { name: 'Unique', category: 'debuff', stack_mode: 'ignore' }, 3, {}, r);
    if (applied !== false) return `Second apply should return false`;
    if (c.statuses.length !== 1) return `Should still have 1 status`;
    return null;
});

test('cleanse — removes debuffs only', () => {
    const c = makeC('c1', 'Target');
    c.statuses = [
        { name: 'ATK Up', category: 'offensive', turns: 3 },
        { name: 'Poison', category: 'debuff', turns: 3 },
        { name: 'Stun', category: 'cc', turns: 1 },
    ];
    const r = { log: [] };
    const removed = buffs.cleanse(c, {}, { cleanse_immunity_duration: 2, enable_status_immunity: true }, r);
    if (removed !== 2) return `Should remove 2 (debuff+cc), removed ${removed}`;
    if (c.statuses.length !== 1) return `Should have 1 remaining (ATK Up)`;
    if (c.statuses[0].name !== 'ATK Up') return `Wrong status remaining`;
    return null;
});

test('dispel — removes buffs only', () => {
    const c = makeC('c1', 'Target');
    c.statuses = [
        { name: 'ATK Up', category: 'offensive', turns: 3 },
        { name: 'DEF Up', category: 'defensive', turns: 3 },
        { name: 'Poison', category: 'debuff', turns: 3 },
    ];
    const r = { log: [] };
    const removed = buffs.dispel(c, {}, {}, r);
    if (removed !== 2) return `Should remove 2 buffs, removed ${removed}`;
    if (c.statuses[0].name !== 'Poison') return `Debuff should remain`;
    return null;
});

test('undispellable — cannot be cleansed or dispelled', () => {
    const c = makeC('c1', 'Boss');
    c.statuses = [{ name: 'Enrage', category: 'offensive', turns: 99, undispellable: true }];
    const r = { log: [] };
    buffs.dispel(c, {}, {}, r);
    if (c.statuses.length !== 1) return `Undispellable should survive dispel`;
    return null;
});

test('immunity — blocks reapplication after cleanse', () => {
    const c = makeC('c1', 'Target');
    c.statuses = [{ name: 'Freeze', category: 'cc', turns: 2 }];
    const s = { cleanse_immunity_duration: 2, enable_status_immunity: true };
    buffs.cleanse(c, {}, s, { log: [] });
    const applied = buffs.enhancedApplyStatus(c, { name: 'Freeze', category: 'cc' }, 3, s, { log: [] });
    if (applied !== false) return `Should be immune to Freeze after cleanse`;
    return null;
});

test('tickImmunity — immunity expires', () => {
    const c = makeC('c1', 'Target');
    c._statusImmunity = { Freeze: 1 };
    buffs.tickImmunity(c);
    if (c._statusImmunity.Freeze) return `Immunity should expire`;
    return null;
});

// =================================================================
// 6. LOOT SYSTEM
// =================================================================
section('Loot System (Overkill/Chain/Rating)');

test('getOverkillMultiplier — no overkill = 1.0', () => {
    const m = loot.getOverkillMultiplier(10, { enable_overkill_bonus: true, overkill_threshold_small: 50 });
    if (m !== 1.0) return `Expected 1.0, got ${m}`;
    return null;
});

test('getOverkillMultiplier — small overkill', () => {
    const m = loot.getOverkillMultiplier(75, { enable_overkill_bonus: true, overkill_threshold_small: 50, overkill_mult_small: 1.25, overkill_threshold_medium: 100 });
    if (m !== 1.25) return `Expected 1.25, got ${m}`;
    return null;
});

test('getOverkillMultiplier — large overkill', () => {
    const m = loot.getOverkillMultiplier(300, { enable_overkill_bonus: true, overkill_threshold_large: 200, overkill_mult_large: 2.0 });
    if (m !== 2.0) return `Expected 2.0, got ${m}`;
    return null;
});

test('getBattleChainBonus — chain 0 = no bonus', () => {
    const c = makeC('c1', 'Player'); c._battleChain = 0;
    const r = loot.getBattleChainBonus(c, { enable_battle_chain: true, chain_xp_bonus: 0.05, chain_drop_bonus: 0.10, chain_max_bonus: 0.50 });
    if (r.xpMult !== 1.0) return `Expected 1.0 xp, got ${r.xpMult}`;
    return null;
});

test('getBattleChainBonus — chain 5 = +25% xp', () => {
    const c = makeC('c1', 'Player'); c._battleChain = 5;
    const r = loot.getBattleChainBonus(c, { enable_battle_chain: true, chain_xp_bonus: 0.05, chain_drop_bonus: 0.10, chain_max_bonus: 0.50 });
    if (Math.abs(r.xpMult - 1.25) > 0.01) return `Expected 1.25 xp, got ${r.xpMult}`;
    return null;
});

test('getBattleChainBonus — capped at max', () => {
    const c = makeC('c1', 'Player'); c._battleChain = 100;
    const r = loot.getBattleChainBonus(c, { enable_battle_chain: true, chain_xp_bonus: 0.05, chain_drop_bonus: 0.10, chain_max_bonus: 0.50 });
    if (r.xpMult > 1.5) return `Should cap at 1.50, got ${r.xpMult}`;
    return null;
});

test('incrementBattleChain + resetBattleChain', () => {
    const c = makeC('c1', 'Player');
    loot.incrementBattleChain(c);
    loot.incrementBattleChain(c);
    if (c._battleChain !== 2) return `Expected 2, got ${c._battleChain}`;
    loot.resetBattleChain(c);
    if (c._battleChain !== 0) return `Expected 0 after reset`;
    return null;
});

test('calculateBattleRating — fast + no damage = S rank', () => {
    const b = makeBattle();
    const w = makeC('w1', 'Winner', { hp: 100, maxHp: 100, isAI: false });
    b.combatants = { w1: w }; b.teams = { p: ['w1'] }; b.turnCount = 3;
    const s = { enable_battle_rating: true, rating_target_turns: 8, rating_s_xp_mult: 1.5, rating_s_gold_mult: 2.0, rating_a_xp_mult: 1.25, rating_a_gold_mult: 1.5 };
    const r = loot.calculateBattleRating(b, 'p', s);
    if (!r) return `Rating should not be null`;
    if (r.rank !== 'S') return `Expected S rank, got ${r.rank} (score=${r.score})`;
    return null;
});

test('calculateBattleRating — slow + damaged = low rank', () => {
    const b = makeBattle();
    const w = makeC('w1', 'Winner', { hp: 20, maxHp: 100, isAI: false });
    b.combatants = { w1: w }; b.teams = { p: ['w1'] }; b.turnCount = 30;
    const s = { enable_battle_rating: true, rating_target_turns: 8 };
    const r = loot.calculateBattleRating(b, 'p', s);
    if (!r) return `Rating should not be null`;
    if (r.rank === 'S' || r.rank === 'A') return `Expected low rank, got ${r.rank}`;
    return null;
});

// =================================================================
// 7. AUTOBATTLE AI
// =================================================================
section('Autobattle AI');

test('pickAutoAction — attacks enemy when healthy', () => {
    const b = makeBattle();
    const w = makeC('w1', 'Warrior', { hp: 100, maxHp: 100, mp: 10, maxMp: 10, isAI: false });
    const e = makeC('e1', 'Enemy', { hp: 50, maxHp: 50, isAI: true });
    b.combatants = { w1: w, e1: e }; b.teams = { p: ['w1'], e: ['e1'] };
    const action = autobattle.pickAutoAction(b, w, 'balanced');
    if (!action) return `No action returned`;
    if (action.action !== 'attack' && action.action !== 'skill') return `Expected attack/skill, got ${action.action}`;
    if (action.targetId !== 'e1') return `Should target enemy`;
    return null;
});

test('pickAutoAction — defends when low HP', () => {
    const b = makeBattle();
    const w = makeC('w1', 'Warrior', { hp: 10, maxHp: 100, mp: 10, maxMp: 10, isAI: false });
    const e = makeC('e1', 'Enemy', { hp: 50, maxHp: 50, isAI: true });
    b.combatants = { w1: w, e1: e }; b.teams = { p: ['w1'], e: ['e1'] };
    const action = autobattle.pickAutoAction(b, w, 'defensive');
    if (action.action !== 'defend') return `Expected defend at low HP, got ${action.action}`;
    return null;
});

test('pickAutoAction — waits when no enemies', () => {
    const b = makeBattle();
    const w = makeC('w1', 'Warrior', { hp: 100, isAI: false });
    b.combatants = { w1: w }; b.teams = { p: ['w1'] };
    const action = autobattle.pickAutoAction(b, w, 'balanced');
    if (action.action !== 'wait') return `Should wait with no enemies, got ${action.action}`;
    return null;
});

test('pickTarget — lowest_hp strategy', () => {
    const enemies = [
        makeC('e1', 'Strong', { hp: 80 }),
        makeC('e2', 'Weak', { hp: 10 }),
        makeC('e3', 'Medium', { hp: 40 }),
    ];
    const target = autobattle.pickTarget(enemies, 'lowest_hp');
    if (target.charId !== 'e2') return `Should target weakest (e2), got ${target.charId}`;
    return null;
});

// =================================================================
// 8. PREVIEW SYSTEM
// =================================================================
section('Damage Preview');

test('previewAttack — returns valid structure', () => {
    const b = makeBattle({ enable_elevation: false });
    const a = makeC('a1', 'Attacker', { attack: 20 });
    const t = makeC('t1', 'Target', { defense: 10, def: 10 });
    b.combatants = { a1: a, t1: t }; b.teams = { p: ['a1'], e: ['t1'] };
    b.getCoverer = () => null;
    const p = preview.previewAttack(b, 'a1', 't1', null);
    if (!p) return `Preview null`;
    if (typeof p.damage.min !== 'number') return `damage.min not a number`;
    if (typeof p.damage.max !== 'number') return `damage.max not a number`;
    if (typeof p.hitChance !== 'number') return `hitChance not a number`;
    if (typeof p.critChance !== 'number') return `critChance not a number`;
    if (p.damage.min > p.damage.max) return `min > max`;
    return null;
});

test('getElementEffectiveness — super effective', () => {
    const r = preview.getElementEffectiveness('fire', 'ice');
    if (r.multiplier !== 1.5) return `Expected 1.5, got ${r.multiplier}`;
    return null;
});

test('getElementEffectiveness — resisted', () => {
    const r = preview.getElementEffectiveness('fire', 'water');
    if (r.multiplier !== 0.5) return `Expected 0.5, got ${r.multiplier}`;
    return null;
});

test('getElementEffectiveness — neutral', () => {
    const r = preview.getElementEffectiveness('fire', 'earth');
    if (r.multiplier !== 1.0) return `Expected 1.0, got ${r.multiplier}`;
    return null;
});

// =================================================================
// 9. MORALE (full paths)
// =================================================================
section('Morale System (Full Paths)');

test('onCombatantDeath — allies lose morale, enemies gain', () => {
    const b = makeBattle();
    const a1 = makeC('a1', 'Ally1', { isAI: true, hp: 100 });
    const a2 = makeC('a2', 'Ally2', { isAI: true, hp: 100 });
    const e1 = makeC('e1', 'Enemy', { isAI: true, hp: 100 });
    b.combatants = { a1, a2, e1 }; b.teams = { allies: ['a1', 'a2'], enemies: ['e1'] };
    morale.initMorale(b);
    // Lower enemy morale first so gain is visible (max_morale=100 caps it)
    e1._morale = 70;
    a1.currentHp = 0;
    morale.onCombatantDeath(b, 'a1');
    if (a2._morale >= 100) return `Ally should lose morale on ally death, got ${a2._morale}`;
    if (e1._morale <= 70) return `Enemy should gain morale on kill, got ${e1._morale}`;
    return null;
});

test('leader death — extra morale loss', () => {
    const b = makeBattle();
    const leader = makeC('l1', 'Leader', { isAI: true, isBoss: true, hp: 0 });
    const minion = makeC('m1', 'Minion', { isAI: true, hp: 100 });
    b.combatants = { l1: leader, m1: minion }; b.teams = { enemies: ['l1', 'm1'] };
    morale.initMorale(b);
    const before = minion._morale;
    morale.onCombatantDeath(b, 'l1');
    const loss = before - minion._morale;
    if (loss < 30) return `Leader death should cause 30+ loss, got ${loss}`;
    return null;
});

test('fanatic — never loses morale', () => {
    const b = makeBattle();
    const f = makeC('f1', 'Fanatic', { isAI: true, personality: 'fanatic', hp: 10, maxHp: 100 });
    b.combatants = { f1: f }; b.teams = { e: ['f1'] };
    morale.initMorale(b);
    morale.onDamageTaken(b, 'f1', 90, true);
    if (f._morale < 100) return `Fanatic should not lose morale, got ${f._morale}`;
    return null;
});

test('shouldFlee — below threshold', () => {
    const b = makeBattle();
    const c = makeC('c1', 'Coward', { isAI: true, hp: 10 });
    b.combatants = { c1: c }; b.teams = { e: ['c1'] };
    morale.initMorale(b);
    c._morale = 10;
    if (!morale.shouldFlee(b, 'c1')) return `Should flee at morale 10`;
    return null;
});

test('shouldFlee — above threshold', () => {
    const b = makeBattle();
    const c = makeC('c1', 'Brave', { isAI: true, hp: 100 });
    b.combatants = { c1: c }; b.teams = { e: ['c1'] };
    morale.initMorale(b);
    if (morale.shouldFlee(b, 'c1')) return `Should not flee at full morale`;
    return null;
});

test('rout — leader flee forces team flee', () => {
    const b = makeBattle();
    const leader = makeC('l1', 'Leader', { isAI: true, isBoss: true, hp: 50 });
    const m1 = makeC('m1', 'Minion1', { isAI: true, hp: 100 });
    const m2 = makeC('m2', 'Minion2', { isAI: true, hp: 100 });
    b.combatants = { l1: leader, m1, m2 }; b.teams = { enemies: ['l1', 'm1', 'm2'] };
    morale.initMorale(b);
    const routed = morale.checkRout(b, 'l1');
    if (routed.length !== 2) return `Expected 2 routed, got ${routed.length}`;
    return null;
});

test('pursuit bonus — damage vs fleeing', () => {
    const b = makeBattle();
    const c = makeC('c1', 'Runner', { isAI: true });
    b.combatants = { c1: c }; b.teams = { e: ['c1'] };
    morale.initMorale(b);
    c._morale = 5;
    const bonus = morale.getPursuitBonus(b, 'c1');
    if (bonus <= 0) return `Pursuit bonus should be positive, got ${bonus}`;
    return null;
});

// =================================================================
// 10. REALTIME BATTLE
// =================================================================
section('Realtime Battle Engine');

test('constructor — builds combatants and teams', () => {
    const rt = new RealtimeBattle('rt1', [
        { charId: 'p1', name: 'Hero', isAI: false, teamId: 'player', maxHp: 100 },
        { charId: 'e1', name: 'Goblin', isAI: true, teamId: 'enemy', maxHp: 50 },
    ], {});
    if (!rt.combatants['p1']) return `Player missing`;
    if (!rt.combatants['e1']) return `Enemy missing`;
    if (rt.teams['player']?.length !== 1) return `Player team wrong`;
    if (rt.teams['enemy']?.length !== 1) return `Enemy team wrong`;
    return null;
});

test('auto-attack speed scales with speed stat', () => {
    const rt = new RealtimeBattle('rt2', [
        { charId: 'f1', name: 'Fast', isAI: false, teamId: 'p', speed: 50 },
        { charId: 's1', name: 'Slow', isAI: false, teamId: 'p', speed: 5 },
    ], {});
    if (rt.combatants['f1'].autoAttackSpeed >= rt.combatants['s1'].autoAttackSpeed) {
        return `Fast unit should have shorter attack speed`;
    }
    return null;
});

test('moveTo — clamps to grid bounds', () => {
    const rt = new RealtimeBattle('rt3', [
        { charId: 'p1', name: 'Hero', isAI: false, teamId: 'p' },
    ], { grid_width: 10, grid_height: 8 });
    rt.moveTo('p1', 999, -5);
    const p = rt.combatants['p1'];
    if (p.moveTarget.x > 9 || p.moveTarget.y < 0) return `Should clamp: (${p.moveTarget.x},${p.moveTarget.y})`;
    return null;
});

test('getResults — returns battle summary', () => {
    const rt = new RealtimeBattle('rt4', [
        { charId: 'p1', name: 'Hero', isAI: false, teamId: 'player' },
        { charId: 'e1', name: 'Goblin', isAI: true, teamId: 'enemy' },
    ], {});
    const r = rt.getResults();
    if (!r.combatants || r.combatants.length !== 2) return `Should have 2 combatants`;
    return null;
});

test('spectators — add and remove', () => {
    const rt = new RealtimeBattle('rt5', [
        { charId: 'p1', name: 'Hero', isAI: false, teamId: 'player' },
    ], {});
    rt.addSpectator('sock1');
    rt.addSpectator('sock2');
    if (rt._spectators.size !== 2) return `Expected 2 spectators`;
    rt.removeSpectator('sock1');
    if (rt._spectators.size !== 1) return `Expected 1 spectator`;
    return null;
});

// =================================================================
// 11. SAFE EVAL
// =================================================================
section('safeEval Formula Engine');

test('basic arithmetic', () => {
    if (safeEval('2 + 3') !== 5) return `2+3 should be 5`;
    if (safeEval('10 * 5') !== 50) return `10*5 should be 50`;
    if (safeEval('100 / 4') !== 25) return `100/4 should be 25`;
    if (safeEval('7 - 3') !== 4) return `7-3 should be 4`;
    return null;
});

test('parentheses', () => {
    if (safeEval('(2 + 3) * 4') !== 20) return `(2+3)*4 should be 20`;
    return null;
});

test('decimals', () => {
    const r = safeEval('1.5 * 2');
    if (r !== 3) return `1.5*2 should be 3, got ${r}`;
    return null;
});

test('rejects function calls', () => {
    if (safeEval('Math.random()') !== 0) return `Should reject Math.random()`;
    return null;
});

test('rejects require', () => {
    if (safeEval("require('fs')") !== 0) return `Should reject require`;
    return null;
});

// =================================================================
// 12. ROUTE FILE INTEGRITY
// =================================================================
section('Route File Integrity');

const routeFiles = [
    'game', 'auth', 'adminPanel', 'crafting', 'questRoutes', 'questboard',
    'mailRoutes', 'guildRoutes', 'partyRoutes', 'leaderboard',
    'artifactRoutes', 'progressionRoutes', 'achievementRoutes',
    'guildNewsRoutes', 'guestbookRoutes', 'auction', 'worldForge',
];

for (const rf of routeFiles) {
    test(`routes/${rf}.js loads without error`, () => {
        try { require(`../routes/${rf}`); return null; }
        catch (e) { return e.message; }
    });
}

// =================================================================
// 13. BATTLE MODULE EXPORTS INTEGRITY
// =================================================================
section('Battle Module Exports');

test('movement — all key functions exported', () => {
    const required = ['findPath', 'chebyshev', 'manhattan', 'getElevationBonus', 'isDifficultTerrain', 'getAoeTiles', 'getMoveRange', 'getReachableTiles', 'getCoverValue'];
    for (const fn of required) {
        if (typeof movement[fn] !== 'function') return `movement.${fn} missing`;
    }
    return null;
});

test('formation — all key functions exported', () => {
    const required = ['initFormation', 'canMeleeTarget', 'getRowDamageModifier', 'swapRow', 'checkFormationShape', 'getFormationBonus', 'getFormationState'];
    for (const fn of required) {
        if (typeof formation[fn] !== 'function') return `formation.${fn} missing`;
    }
    return null;
});

test('turns — all key functions exported', () => {
    const required = ['initATB', 'tickATB', 'resetATBGauge', 'setATBPause', 'getATBState', 'initCTB', 'advanceCTB', 'resetCTBCounter', 'getCTBTimeline', 'getCTBState'];
    for (const fn of required) {
        if (typeof turns[fn] !== 'function') return `turns.${fn} missing`;
    }
    return null;
});

test('buffs — all key functions exported', () => {
    const required = ['enhancedApplyStatus', 'cleanse', 'dispel', 'tickImmunity', 'getStacks', 'getStatusesByCategory'];
    for (const fn of required) {
        if (typeof buffs[fn] !== 'function') return `buffs.${fn} missing`;
    }
    return null;
});

test('loot — all key functions exported', () => {
    const required = ['resolveSteal', 'rollDropTable', 'getOverkillMultiplier', 'getOverkillXpBonus', 'getBattleChainBonus', 'incrementBattleChain', 'resetBattleChain', 'calculateBattleRating'];
    for (const fn of required) {
        if (typeof loot[fn] !== 'function') return `loot.${fn} missing`;
    }
    return null;
});

test('morale — all key functions exported', () => {
    const required = ['initMorale', 'adjustMorale', 'onCombatantDeath', 'onDamageTaken', 'onHealReceived', 'onIdleTurn', 'shouldFlee', 'checkRout', 'getPursuitBonus', 'getMoraleState'];
    for (const fn of required) {
        if (typeof morale[fn] !== 'function') return `morale.${fn} missing`;
    }
    return null;
});

test('bravedefault — all key functions exported', () => {
    const required = ['initBraveDefault', 'resolveDefault', 'resolveBrave', 'hasBraveActionsRemaining', 'consumeBraveAction', 'mustSkipTurn', 'tickBP', 'getDefaultDefenseBonus', 'getBraveDefaultState'];
    for (const fn of required) {
        if (typeof bd[fn] !== 'function') return `bd.${fn} missing`;
    }
    return null;
});

test('BattleManager index — all subsystems attached', () => {
    const BM = require('./index');
    const required = ['movement', 'formation', 'turns', 'defensive', 'buffs', 'loot', 'autobattle', 'preview', 'morale', 'bravedefault', 'RealtimeBattle'];
    for (const k of required) {
        if (!BM[k]) return `BM.${k} missing`;
    }
    return null;
});

// =================================================================
// SUMMARY
// =================================================================
console.log('\n========================================================');
console.log('  SECTION BREAKDOWN:');
for (const [name, { p, f }] of Object.entries(sections)) {
    const status = f === 0 ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${status} ${name}: ${p}/${p + f}`);
}
console.log(`\n  TOTAL: ${passed} passed / ${passed + failed} total`);
if (failed > 0) {
    console.log(`  \x1b[31m${failed} failures!\x1b[0m`);
} else {
    console.log(`  \x1b[32mAll systems operational!\x1b[0m`);
}
console.log('========================================================\n');

process.exit(failed > 0 ? 1 : 0);
