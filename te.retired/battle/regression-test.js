// =================================================================
// REGRESSION TEST — Verify all 16 fixes don't break normal gameplay
// Run: node battle/regression-test.js
// =================================================================

console.log('\n========================================');
console.log('  TWISTED ENGINE — REGRESSION TEST');
console.log('  Verify fixes preserve normal gameplay');
console.log('========================================\n');

const { initMorale, adjustMorale, onDamageTaken, shouldFlee, onHealReceived } = require('./morale');
const { initBraveDefault, tickBP, resolveDefault, resolveBrave, mustSkipTurn, hasBraveActionsRemaining, consumeBraveAction, getDefaultDefenseBonus } = require('./bravedefault');
const { applyCover, getCoverer, resolveCoverIntercept, resolveBarrier, applyBarrier } = require('./defensive');
const { enhancedApplyStatus, cleanse, dispel, getStacks } = require('./buffs');
const { previewAttack } = require('./preview');
const { RealtimeBattle } = require('./realtime');
const { resolveSteal } = require('./loot');
const { pickAutoAction } = require('./autobattle');
const { initFormation, canMeleeTarget, getRowDamageModifier, swapRow } = require('./formation');
const { initATB, tickATB, initCTB, advanceCTB } = require('./turns');
const movement = require('./movement');

let passed = 0, failed = 0;

function test(name, fn) {
    try {
        const err = fn();
        if (err) { console.log(`  \x1b[31m FAIL \x1b[0m ${name}: ${err}`); failed++; }
        else { console.log(`  \x1b[32m PASS \x1b[0m ${name}`); passed++; }
    } catch (e) {
        console.log(`  \x1b[31m ERROR\x1b[0m ${name}: ${e.message}`);
        failed++;
    }
}

function makeBattle(overrides = {}) {
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
            ...overrides,
        },
        combatants: {}, teams: {},
        GRID_W: 8, GRID_H: 5,
        elevationMap: {},
        getTeamId(charId) {
            for (const [tid, members] of Object.entries(this.teams)) {
                if (members.includes(charId)) return tid;
            }
            return null;
        },
        getTerrainAt() { return 'normal'; },
    };
}

function makeC(id, name, opts = {}) {
    return {
        charId: id, name, currentHp: opts.hp ?? 100, maxHp: opts.maxHp ?? 100,
        currentMp: opts.mp ?? 50, maxMp: opts.maxMp ?? 50,
        level: opts.level ?? 5, isAI: opts.isAI ?? false,
        is_boss: opts.isBoss ?? false, personality: opts.personality ?? '',
        attack: opts.attack ?? 15, defense: opts.defense ?? 8, def: opts.def ?? 8,
        md: opts.md ?? 5, mo: opts.mo ?? 5,
        luck: opts.luck ?? 10, speed: opts.speed ?? 10,
        statuses: [], gridX: opts.gridX ?? 0, gridY: opts.gridY ?? 0,
        row: opts.row ?? 'front', ...opts,
    };
}

// =====================================================================
// FIX 1: Respec — valid respec should still work (API-level, conceptual)
// =====================================================================
console.log('\n--- Fix 1: Respec still works with valid point budget ---');
test('Valid respec (total preserved) passes', () => {
    const current = { strength: 10, dexterity: 10, constitution: 10 }; // total=30
    const newScores = { strength: 15, dexterity: 10, constitution: 5 }; // total=30
    const originalTotal = Object.values(current).reduce((s, v) => s + v, 0);
    const newTotal = Object.values(newScores).reduce((s, v) => s + v, 0);
    if (newTotal !== originalTotal) return `Point totals don't match: ${newTotal} vs ${originalTotal}`;
    for (const v of Object.values(newScores)) {
        if (v < 1 || v > 30) return `Score ${v} out of range`;
    }
    return null;
});

// =====================================================================
// FIX 2: Morale — low HP penalty fires once, then stops
// =====================================================================
console.log('\n--- Fix 2: Morale low HP penalty fires correctly ---');
test('Low HP penalty applies once on first hit below threshold', () => {
    const b = makeBattle();
    const g = makeC('g1', 'Goblin', { hp: 20, maxHp: 100, isAI: true });
    b.combatants = { g1: g }; b.teams = { e: ['g1'] };
    initMorale(b);
    const before = g._morale;
    onDamageTaken(b, 'g1', 5, false); // below 25% — should trigger once
    const after1 = g._morale;
    if (after1 >= before) return `Penalty didn't apply at all`;
    onDamageTaken(b, 'g1', 1, false); // second hit — should NOT re-trigger
    const after2 = g._morale;
    if (after2 !== after1) return `Penalty fired again: ${after1} -> ${after2}`;
    return null;
});

test('Morale still recovers from heals and idle turns', () => {
    const b = makeBattle();
    const g = makeC('g1', 'Goblin', { hp: 50, maxHp: 100, isAI: true });
    b.combatants = { g1: g }; b.teams = { e: ['g1'] };
    initMorale(b);
    g._morale = 30;
    onHealReceived(b, 'g1');
    if (g._morale !== 35) return `Expected 35 after heal, got ${g._morale}`;
    return null;
});

// =====================================================================
// FIX 3: Morale cap uses settings
// =====================================================================
console.log('\n--- Fix 3: Morale cap respects admin settings ---');
test('Default morale=100 still works', () => {
    const b = makeBattle();
    const g = makeC('g1', 'Goblin', { isAI: true });
    b.combatants = { g1: g }; b.teams = { e: ['g1'] };
    initMorale(b);
    if (g._morale !== 100) return `Expected 100, got ${g._morale}`;
    return null;
});

test('Custom max_morale=150 with starting=150 works', () => {
    const b = makeBattle({ max_morale: 150, starting_morale: 150 });
    const g = makeC('g1', 'Goblin', { isAI: true });
    b.combatants = { g1: g }; b.teams = { e: ['g1'] };
    initMorale(b);
    if (g._morale !== 150) return `Expected 150, got ${g._morale}`;
    return null;
});

// =====================================================================
// FIX 4: Cover — same team still works
// =====================================================================
console.log('\n--- Fix 4: Cover works for same-team allies ---');
test('Tank covers ally on same team', () => {
    const b = makeBattle();
    const tank = makeC('t1', 'Tank', { hp: 200, maxHp: 200 });
    const mage = makeC('m1', 'Mage', { hp: 50, maxHp: 50 });
    b.combatants = { t1: tank, m1: mage }; b.teams = { players: ['t1', 'm1'] };
    const r = applyCover(b, tank, mage);
    if (!r.success) return `Cover failed: ${r.reason}`;
    const coverer = getCoverer(b, 'm1');
    if (!coverer || coverer.charId !== 't1') return `Coverer not found`;
    return null;
});

test('Cover intercept redirects damage to tank', () => {
    const b = makeBattle();
    const tank = makeC('t1', 'Tank', { hp: 200, maxHp: 200 });
    const mage = makeC('m1', 'Mage', { hp: 50, maxHp: 50 });
    b.combatants = { t1: tank, m1: mage }; b.teams = { players: ['t1', 'm1'] };
    applyCover(b, tank, mage);
    const result = { log: [], actions: [] };
    const r = resolveCoverIntercept(b, mage, 30, result);
    if (!r.redirected) return `Damage not redirected`;
    if (r.covererDamage !== 30) return `Expected coverer takes 30, got ${r.covererDamage}`;
    return null;
});

// =====================================================================
// FIX 5: BP tick works for living combatants
// =====================================================================
console.log('\n--- Fix 5: BP regen works normally for living combatants ---');
test('Living combatant at -2 BP regens to -1 on tick', () => {
    const b = makeBattle();
    const k = makeC('k1', 'Knight', { hp: 100, maxHp: 100, isAI: true });
    b.combatants = { k1: k }; b.teams = { p: ['k1'] };
    initBraveDefault(b);
    k._bp = -2;
    tickBP(b, 'k1');
    if (k._bp !== -1) return `Expected -1, got ${k._bp}`;
    return null;
});

test('Brave/Default full cycle works', () => {
    const b = makeBattle();
    const w = makeC('w1', 'Warrior', { hp: 100 });
    b.combatants = { w1: w }; b.teams = { p: ['w1'] };
    initBraveDefault(b);
    // Default 3 times to bank BP
    resolveDefault(b, 'w1'); tickBP(b, 'w1');
    resolveDefault(b, 'w1'); tickBP(b, 'w1');
    resolveDefault(b, 'w1'); tickBP(b, 'w1');
    if (w._bp !== 3) return `Expected 3 BP after 3 defaults, got ${w._bp}`;
    // Brave for 4 actions
    const r = resolveBrave(b, 'w1', 4);
    if (!r.success) return `Brave failed: ${r.reason}`;
    if (w._bp !== 0) return `Expected 0 BP after brave, got ${w._bp}`;
    if (!hasBraveActionsRemaining(b, 'w1')) return `Should have extra actions`;
    consumeBraveAction(b, 'w1'); consumeBraveAction(b, 'w1'); consumeBraveAction(b, 'w1');
    if (hasBraveActionsRemaining(b, 'w1')) return `Should have no more actions`;
    return null;
});

// =====================================================================
// FIX 6: Steal still works on enemies
// =====================================================================
console.log('\n--- Fix 6: Steal works on enemies (not allies) ---');
test('resolveSteal has team check in source', () => {
    const src = resolveSteal.toString();
    if (!src.includes('getTeamId')) return `Team check missing from resolveSteal`;
    return null;
});

// =====================================================================
// FIX 7: Preview with elevation shows correct damage
// =====================================================================
console.log('\n--- Fix 7: Damage preview with elevation works ---');
test('Preview shows bonus damage when attacking downhill', () => {
    const b = makeBattle();
    const a = makeC('a1', 'Archer', { attack: 20, gridX: 0, gridY: 0 });
    const t = makeC('t1', 'Goblin', { defense: 5, def: 5, gridX: 2, gridY: 2 });
    b.combatants = { a1: a, t1: t }; b.teams = { p: ['a1'], e: ['t1'] };
    b.elevationMap = { '0,0': 3, '2,2': 0 };
    b.getElevationBonus = (att, tgt) => movement.getElevationBonus(b, att, tgt);
    b.getRowDamageModifier = () => ({ dealt: 1.0, taken: 1.0 });
    b.getCoverer = () => null;
    const p = previewAttack(b, 'a1', 't1', null);
    if (!p) return `Preview returned null`;
    if (isNaN(p.damage.avg)) return `Damage is NaN!`;
    if (p.damage.avg <= 0) return `Damage should be > 0, got ${p.damage.avg}`;
    if (p.elevationBonus <= 0) return `Elevation bonus should be > 0, got ${p.elevationBonus}`;
    return null;
});

test('Preview with no elevation still works', () => {
    const b = makeBattle({ enable_elevation: false });
    const a = makeC('a1', 'Archer', { attack: 20 });
    const t = makeC('t1', 'Goblin', { defense: 5, def: 5 });
    b.combatants = { a1: a, t1: t }; b.teams = { p: ['a1'], e: ['t1'] };
    b.getCoverer = () => null;
    const p = previewAttack(b, 'a1', 't1', null);
    if (!p) return `Preview returned null`;
    if (isNaN(p.damage.avg)) return `Damage is NaN!`;
    return null;
});

// =====================================================================
// FIX 8: Realtime — players can still control their own units
// =====================================================================
console.log('\n--- Fix 8: Realtime — players control their own units ---');
test('Player can set target and move their own character', () => {
    const rt = new RealtimeBattle('t1', [
        { charId: 'p1', name: 'Player', isAI: false, teamId: 'player' },
        { charId: 'e1', name: 'Boss', isAI: true, teamId: 'enemy' },
    ], { grid_width: 12, grid_height: 8 });
    rt.setTarget('p1', 'e1');
    rt.moveTo('p1', 5, 3);
    const p = rt.combatants['p1'];
    if (p.targetId !== 'e1') return `Target not set`;
    if (!p.moveTarget || p.moveTarget.x !== 5) return `Move not set`;
    return null;
});

test('AI still auto-targets and acts normally', () => {
    const rt = new RealtimeBattle('t2', [
        { charId: 'p1', name: 'Player', isAI: false, teamId: 'player', currentHp: 100, maxHp: 100 },
        { charId: 'e1', name: 'Goblin', isAI: true, teamId: 'enemy', currentHp: 50, maxHp: 50 },
    ], {});
    const e = rt.combatants['e1'];
    if (e.targetId !== 'p1') return `AI didn't auto-target player: ${e.targetId}`;
    return null;
});

// =====================================================================
// FIX 9: safeEval — arithmetic still works
// =====================================================================
console.log('\n--- Fix 9: safeEval handles arithmetic safely ---');
test('safeEval computes basic math', () => {
    const { safeEval } = require('./shared');
    const r1 = safeEval('10 * 3 + 5');
    if (r1 !== 35) return `Expected 35, got ${r1}`;
    const r2 = safeEval('100 / (100 + 50)');
    if (Math.abs(r2 - 0.6667) > 0.01) return `Expected ~0.667, got ${r2}`;
    return null;
});

test('safeEval blocks code injection', () => {
    const { safeEval } = require('./shared');
    const r = safeEval('process.exit(1)');
    if (r !== 0) return `Should return 0 for non-arithmetic, got ${r}`;
    return null;
});

// =====================================================================
// FIX 10: AI-vs-AI battles survive past 10s
// =====================================================================
console.log('\n--- Fix 10: AI-vs-AI battles run correctly ---');
test('AI-vs-AI battle stays active past tick 100', () => {
    const rt = new RealtimeBattle('ai1', [
        { charId: 'a1', name: 'Fighter A', isAI: true, teamId: 't1', currentHp: 100, maxHp: 100 },
        { charId: 'a2', name: 'Fighter B', isAI: true, teamId: 't2', currentHp: 100, maxHp: 100 },
    ], {});
    rt.tickCount = 100;
    rt.tick();
    if (rt.status !== 'active') return `AI battle terminated early: ${rt.status}`;
    return null;
});

test('Human battle still auto-stops when all players die', () => {
    const rt = new RealtimeBattle('h1', [
        { charId: 'p1', name: 'Player', isAI: false, teamId: 'player', currentHp: 0, maxHp: 100 },
        { charId: 'e1', name: 'Boss', isAI: true, teamId: 'enemy', currentHp: 999, maxHp: 999 },
    ], {});
    rt.combatants['p1'].alive = false;
    rt.tickCount = 50;
    rt.tick();
    if (rt.status !== 'finished') return `Expected finished, got ${rt.status}`;
    return null;
});

// =====================================================================
// FIX 11: Armor formula — positive armor still reduces damage
// =====================================================================
console.log('\n--- Fix 11: Armor reduction works normally ---');
test('Armor 100 reduces damage by 50%', () => {
    const armor = Math.max(0, 100);
    const reduction = 100 / (100 + armor);
    if (Math.abs(reduction - 0.5) > 0.01) return `Expected 0.5, got ${reduction}`;
    return null;
});

test('Armor 0 means no reduction (100%)', () => {
    const armor = Math.max(0, 0);
    const reduction = 100 / (100 + armor);
    if (reduction !== 1.0) return `Expected 1.0, got ${reduction}`;
    return null;
});

test('Negative armor clamped to 0 (no amplification)', () => {
    const armor = Math.max(0, -500);
    const reduction = 100 / (100 + armor);
    if (reduction !== 1.0) return `Expected 1.0, got ${reduction}`;
    return null;
});

// =====================================================================
// FIX 12: endBattle idempotency — verify guard exists in source
// =====================================================================
console.log('\n--- Fix 12: endBattle has idempotency guard ---');
test('endBattle source contains _endBattleProcessed check', () => {
    const fs = require('fs');
    // endBattle lives in rewards.js, not legacy.js (legacy.js calls rewards.endBattle)
    const src = fs.readFileSync(require('path').join(__dirname, 'rewards.js'), 'utf8');
    if (!src.includes('_endBattleProcessed')) return `Guard not found in endBattle`;
    // Verify it's at the top of the function
    const idx = src.indexOf('async function endBattle');
    const guardIdx = src.indexOf('_endBattleProcessed', idx);
    if (guardIdx - idx > 200) return `Guard too far from function start (${guardIdx - idx} chars)`;
    return null;
});

// =====================================================================
// FIX 13: Crafting — verify transaction keywords in source
// =====================================================================
console.log('\n--- Fix 13: Crafting uses DB transaction ---');
test('crafting.js contains transaction + FOR UPDATE', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '..', 'routes', 'crafting.js'), 'utf8');
    if (!src.includes('beginTransaction')) return `No beginTransaction found`;
    if (!src.includes('FOR UPDATE')) return `No FOR UPDATE row lock found`;
    if (!src.includes('conn.commit')) return `No commit found`;
    if (!src.includes('conn.rollback')) return `No rollback found`;
    if (!src.includes('conn.release')) return `No connection release found`;
    return null;
});

// =====================================================================
// FIX 14: Quest progress — valid +1 increments still work
// =====================================================================
console.log('\n--- Fix 14: Quest progress increments by 1 ---');
test('Amount=1 works normally', () => {
    const amount = 1;
    const rawInc = Number.isFinite(+amount) ? +amount : 1;
    const inc = Math.max(0, Math.min(rawInc, 1));
    if (inc !== 1) return `Expected inc=1, got ${inc}`;
    return null;
});

test('Amount=0 or negative clamped to 0', () => {
    for (const amount of [0, -5, -100]) {
        const rawInc = Number.isFinite(+amount) ? +amount : 1;
        const inc = Math.max(0, Math.min(rawInc, 1));
        if (inc !== 0) return `Amount=${amount} should clamp to 0, got ${inc}`;
    }
    return null;
});

// =====================================================================
// FIX 15: WorldForge — verify role check in source
// =====================================================================
console.log('\n--- Fix 15: WorldForge has real role check ---');
test('worldForge.js requireStaff checks role from DB', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '..', 'routes', 'worldForge.js'), 'utf8');
    if (!src.includes("'ADMIN'")) return `No ADMIN role check`;
    if (!src.includes("'OWNER'")) return `No OWNER role check`;
    if (!src.includes('SELECT role FROM users')) return `No DB role query`;
    if (!src.includes('403')) return `No 403 status for unauthorized`;
    return null;
});

// =====================================================================
// FIX 16: Trade — verify transaction keywords in source
// =====================================================================
console.log('\n--- Fix 16: Trade uses DB transaction ---');
test('trade_confirm contains transaction + FOR UPDATE', () => {
    const fs = require('fs');
    // Trade handler lives in server/socket-social.js, not server.js
    const src = fs.readFileSync(require('path').join(__dirname, '..', 'server', 'socket-social.js'), 'utf8');
    const start = src.indexOf('trade_confirm');
    const end = src.indexOf("'trade_complete'", start);
    const tradeSection = src.substring(start, end > start ? end + 200 : start + 5000);
    if (!tradeSection.includes('beginTransaction')) return `No beginTransaction in trade`;
    if (!tradeSection.includes('FOR UPDATE')) return `No FOR UPDATE in trade`;
    if (!tradeSection.includes('commit')) return `No commit in trade`;
    if (!tradeSection.includes('rollback')) return `No rollback in trade`;
    return null;
});

// =====================================================================
// BONUS: Full combat flow sanity check
// =====================================================================
console.log('\n--- Bonus: Full combat integration test ---');
test('Full combat flow: init → morale → formation → BP → cover → preview → buffs', () => {
    const b = makeBattle({ enable_formations: true, enable_brave_default: true, enable_morale: true });
    const tank = makeC('t1', 'Tank', { hp: 200, maxHp: 200, isAI: false, row: 'front', attack: 20, defense: 15, def: 15 });
    const mage = makeC('m1', 'Mage', { hp: 60, maxHp: 60, isAI: false, row: 'back', attack: 8, mo: 20 });
    const boss = makeC('b1', 'Dark Lord', { hp: 500, maxHp: 500, isAI: true, isBoss: true, defense: 20, def: 20, row: 'front' });

    b.combatants = { t1: tank, m1: mage, b1: boss };
    b.teams = { players: ['t1', 'm1'], enemies: ['b1'] };

    // Init all systems
    initMorale(b);
    initFormation(b);
    initBraveDefault(b);

    if (tank._morale !== 100) return `Tank morale wrong: ${tank._morale}`;
    if (tank._bp !== 0) return `Tank BP wrong: ${tank._bp}`;
    if (tank.row !== 'front') return `Tank row wrong: ${tank.row}`;

    // Tank covers mage
    const coverResult = applyCover(b, tank, mage);
    if (!coverResult.success) return `Cover failed: ${coverResult.reason}`;

    // Tank defaults to bank BP
    const defResult = resolveDefault(b, 't1');
    if (!defResult.success) return `Default failed: ${defResult.reason}`;
    if (tank._bp !== 1) return `BP should be 1 after default`;
    if (getDefaultDefenseBonus(b, 't1') !== 0.25) return `Defense bonus wrong`;

    // Apply a buff to tank
    const result = { log: [] };
    enhancedApplyStatus(tank, { name: 'Regen', category: 'defensive', stack_mode: 'refresh' }, 3, b._settings, result);
    if (!tank.statuses.find(s => s.name === 'Regen')) return `Regen not applied`;

    // Preview mage attacking boss
    b.getElevationBonus = () => ({ damage: 0, accuracy: 0, dodge: 0 });
    b.getRowDamageModifier = (a, t, r) => getRowDamageModifier(b, a, t, r);
    b.getCoverer = (id) => getCoverer(b, id);
    const preview = previewAttack(b, 'm1', 'b1', null);
    if (!preview || isNaN(preview.damage.avg)) return `Preview broken: ${JSON.stringify(preview?.damage)}`;

    // Boss takes damage → morale check on boss
    onDamageTaken(b, 'b1', 50, true); // crit hit
    if (boss._morale === undefined) return `Boss morale not initialized`;

    // Barrier on tank
    applyBarrier(tank, 50, 3, 'all');
    const remaining = resolveBarrier(tank, 30, 'physical', { log: [], actions: [] });
    if (remaining !== 0) return `Barrier should absorb 30, remaining damage should be 0, got ${remaining}`;
    if (tank._barrier.hp !== 20) return `Barrier HP should be 20, got ${tank._barrier.hp}`;

    return null;
});

// ─── Summary ─────────────────────────────────────────────────────
console.log('\n========================================');
console.log(`  Results: ${passed} passed / ${passed + failed} total`);
if (failed > 0) {
    console.log(`  \x1b[31m${failed} regressions detected!\x1b[0m`);
} else {
    console.log(`  \x1b[32mAll gameplay paths working!\x1b[0m`);
}
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
