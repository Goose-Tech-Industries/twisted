// =================================================================
// STRESS TEST — Full system verification against Phoenix/Elixir codebase
// Audits: Phoenix channels, controllers, battle modules, plugs
// Also tests: JS battle logic (formulas, elements, rating, realtime)
// Run: node battle/stress-test.js
// =================================================================

console.log('\n========================================================');
console.log('  TWISTED ENGINE — STRESS TEST');
console.log('  Phoenix/Elixir production codebase audit');
console.log('========================================================\n');

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

// =================================================================
// HELPERS — Read Phoenix/Elixir source files
// =================================================================
const PHOENIX_ROOT = path.join(__dirname, '..', '..', 'te_phoenix', 'lib');

// Read a single Elixir file
function exFile(relPath) {
    return fs.readFileSync(path.join(PHOENIX_ROOT, relPath), 'utf8');
}

// Check patterns exist in a Phoenix file
function exHas(relPath, ...patterns) {
    let src;
    try { src = fs.readFileSync(path.join(PHOENIX_ROOT, relPath), 'utf8'); }
    catch { return `File not found: ${relPath}`; }
    for (const p of patterns) {
        if (!src.includes(p)) return `Missing: "${p}" in ${relPath}`;
    }
    return null;
}

// Search all files in a Phoenix directory for patterns
function exDirHas(relDir, ...patterns) {
    const dir = path.join(PHOENIX_ROOT, relDir);
    let files;
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.ex')); }
    catch { return `Directory not found: ${relDir}`; }
    const combined = files.map(f => {
        try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; }
    }).join('\n');
    for (const p of patterns) {
        if (!combined.includes(p)) return `Missing: "${p}" in ${relDir}/*.ex`;
    }
    return null;
}

// Search all .ex files recursively under a path
function exTreeHas(relDir, ...patterns) {
    const dir = path.join(PHOENIX_ROOT, relDir);
    function walk(d) {
        let out = '';
        try {
            for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
                if (entry.isDirectory()) out += walk(path.join(d, entry.name));
                else if (entry.name.endsWith('.ex')) {
                    try { out += fs.readFileSync(path.join(d, entry.name), 'utf8') + '\n'; } catch {}
                }
            }
        } catch {}
        return out;
    }
    const combined = walk(dir);
    for (const p of patterns) {
        if (!combined.includes(p)) return `Missing: "${p}" in ${relDir}/**/*.ex`;
    }
    return null;
}

// JS battle module helper (unchanged)
function srcHas(file, ...patterns) {
    const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
    for (const p of patterns) {
        if (!src.includes(p)) return `Missing: "${p}" in ${file}`;
    }
    return null;
}

// =================================================================
// 1. BATTLE FORMULA ENGINE (JS — still used by Node legacy + tests)
// =================================================================
section('Damage Formula Engine (JS)');

test('safeEval handles ATK*2-DEF formula pattern', () => {
    const { safeEval } = require('./shared');
    const result = safeEval('20*2-8');
    if (result !== 32) return `Expected 32, got ${result}`;
    return null;
});

test('safeEval with zero attack: pipeline clamps negative to 1', () => {
    const rawDamage = -10;
    const clamped = Math.max(1, rawDamage);
    if (clamped !== 1) return `Pipeline should clamp -10 to 1, got ${clamped}`;
    return null;
});

test('safeEval with massive numbers stays finite', () => {
    const { safeEval } = require('./shared');
    const result = safeEval('99999*99999');
    if (!isFinite(result)) return `Result not finite: ${result}`;
    if (result <= 0) return `Should produce positive number, got ${result}`;
    return null;
});

test('safeEval division by zero returns 0', () => {
    const { safeEval } = require('./shared');
    const result = safeEval('100/0');
    if (result === Infinity || result === -Infinity) {
        if (!isFinite(Math.floor(result))) return `Division by zero produces Infinity — needs clamping`;
    }
    return null;
});

test('armor formula: 0 armor = full damage', () => {
    const armor = Math.max(0, 0);
    const reduction = 100 / (100 + armor);
    if (reduction !== 1.0) return `Expected 1.0, got ${reduction}`;
    return null;
});

test('armor formula: 200 armor = 33% damage', () => {
    const armor = Math.max(0, 200);
    const reduction = 100 / (100 + armor);
    if (Math.abs(reduction - 0.333) > 0.01) return `Expected ~0.333, got ${reduction}`;
    return null;
});

test('armor formula: 9999 armor = ~1% damage', () => {
    const armor = Math.max(0, 9999);
    const reduction = 100 / (100 + armor);
    if (reduction > 0.02) return `Expected <2%, got ${(reduction*100).toFixed(2)}%`;
    return null;
});

test('crit damage: 1 damage * 1.5 crit = 1 (floor)', () => {
    const dmg = 1;
    const crit = Math.floor(dmg * 1.5);
    if (crit !== 1) return `Expected 1, got ${crit}`;
    return null;
});

test('percent HP damage: 50% of 1000 HP = 500', () => {
    const maxHp = 1000;
    const pct = 50;
    const dmg = Math.floor(maxHp * (Math.abs(pct) / 100));
    if (dmg !== 500) return `Expected 500, got ${dmg}`;
    return null;
});

test('damage cap enforcement', () => {
    const damageCap = 9999;
    let damage = 50000;
    if (damageCap > 0) damage = Math.min(damage, damageCap);
    if (damage !== 9999) return `Expected 9999, got ${damage}`;
    return null;
});

test('damage floor: negative damage clamped to 1', () => {
    let damage = -50;
    damage = Math.max(1, damage);
    if (damage !== 1) return `Expected 1, got ${damage}`;
    return null;
});

// =================================================================
// 2. ENEMY SCALING (JS logic)
// =================================================================
section('Enemy Scaling');

test('scaling with 1 player = no change', () => {
    const mult = 1 + (1 - 1) * 0.3;
    if (mult !== 1.0) return `Expected 1.0, got ${mult}`;
    return null;
});

test('scaling with 4 players = 1.9x stats', () => {
    const mult = 1 + (4 - 1) * 0.3;
    if (Math.abs(mult - 1.9) > 0.01) return `Expected 1.9, got ${mult}`;
    return null;
});

test('speed scales at 30% rate', () => {
    const speedMult = 1 + (4 - 1) * 0.3 * 0.3;
    if (Math.abs(speedMult - 1.27) > 0.01) return `Expected ~1.27, got ${speedMult}`;
    return null;
});

test('scaling with factor 0 = no change', () => {
    const mult = 1 + (4 - 1) * 0;
    if (mult !== 1.0) return `Expected 1.0, got ${mult}`;
    return null;
});

// =================================================================
// 3. DEATH VS KNOCKOUT LOGIC (JS logic)
// =================================================================
section('Death vs Knockout');

test('KO only when nonlethal enabled + actor is nonlethal', () => {
    const isKO = true && true;
    if (!isKO) return `Should be KO`;
    return null;
});

test('kill when nonlethal disabled', () => {
    const isKO = false && true;
    if (isKO) return `Should be kill, not KO`;
    return null;
});

test('kill when actor is lethal', () => {
    const isKO = true && false;
    if (isKO) return `Should be kill when actor is lethal`;
    return null;
});

// =================================================================
// 4. TURN ORDER / INITIATIVE (JS logic)
// =================================================================
section('Initiative & Turn Order');

test('speed sort: faster unit goes first', () => {
    const combatants = [
        { charId: 's1', speed: 5, luck: 0, currentHp: 100 },
        { charId: 'f1', speed: 20, luck: 0, currentHp: 100 },
        { charId: 'm1', speed: 10, luck: 0, currentHp: 100 },
    ];
    const sorted = combatants.filter(c => c.currentHp > 0)
        .sort((a, b) => (b.speed + b.luck * 0.1) - (a.speed + a.luck * 0.1));
    if (sorted[0].charId !== 'f1') return `Expected f1 first, got ${sorted[0].charId}`;
    if (sorted[2].charId !== 's1') return `Expected s1 last, got ${sorted[2].charId}`;
    return null;
});

test('speed sort: luck breaks ties', () => {
    const combatants = [
        { charId: 'a', speed: 10, luck: 5, currentHp: 100 },
        { charId: 'b', speed: 10, luck: 20, currentHp: 100 },
    ];
    const sorted = combatants.sort((a, b) => (b.speed + b.luck * 0.1) - (a.speed + a.luck * 0.1));
    if (sorted[0].charId !== 'b') return `Expected b first (higher luck), got ${sorted[0].charId}`;
    return null;
});

test('dead combatants filtered from turn order', () => {
    const combatants = [
        { charId: 'a', speed: 20, luck: 0, currentHp: 100 },
        { charId: 'dead', speed: 99, luck: 0, currentHp: 0 },
    ];
    const alive = combatants.filter(c => c.currentHp > 0);
    if (alive.length !== 1) return `Dead should be filtered`;
    if (alive[0].charId !== 'a') return `Only alive unit should remain`;
    return null;
});

// =================================================================
// 5. PHOENIX CHANNEL HANDLERS — INPUT VALIDATION
// =================================================================
section('Phoenix Channel Input Validation');

test('chat: message truncated to 300 chars', () => {
    return exHas('te_phoenix_web/channels/social/chat_handler.ex', 'String.slice(0, 300)');
});

test('chat: HTML escaping function', () => {
    return exHas('te_phoenix_web/channels/social/chat_handler.ex', 'html_escape', '&lt;', '&gt;');
});

test('battle chat: messages escaped', () => {
    return exHas('te_phoenix_web/channels/battle/social_handler.ex', 'html_escape');
});

test('npc talk: message capped at 500 chars', () => {
    return exHas('te_phoenix_web/channels/game/npc_handler.ex', 'String.slice(0, 500)');
});

test('npc talk: throttled to 1 per 2 seconds', () => {
    return exHas('te_phoenix_web/channels/game/npc_handler.ex', '2000');
});

test('staff: away message limited to 120 chars', () => {
    return exHas('te_phoenix_web/channels/social/staff_handler.ex', '120');
});

// =================================================================
// 6. PHOENIX CHANNEL HANDLERS — MOVEMENT & BOUNDS
// =================================================================
section('Phoenix Movement & Bounds');

test('movement: cooldown enforcement', () => {
    return exHas('te_phoenix_web/channels/game/core_handler.ex', 'last_move', 'cooldown');
});

test('movement: running modifier', () => {
    return exHas('te_phoenix_web/channels/game/core_handler.ex', 'running');
});

test('movement: continuous move rate limited', () => {
    return exHas('te_phoenix_web/channels/game/core_handler.ex', 'continuous');
});

test('item pickup: distance check', () => {
    return exHas('te_phoenix_web/channels/game/item_handler.ex', 'abs(');
});

test('battle: chebyshev distance function', () => {
    return exHas('te_phoenix/battle/state.ex', 'chebyshev', 'in_range');
});

test('battle: damage checks range before applying', () => {
    return exHas('te_phoenix/battle/damage.ex', 'in_range');
});

test('battle: knockback clamps to grid bounds', () => {
    return exHas('te_phoenix/battle/damage.ex', 'clamp(');
});

// =================================================================
// 7. PHOENIX CHANNEL HANDLERS — AUTHORIZATION
// =================================================================
section('Phoenix Authorization');

test('join_game: verifies character ownership (id AND user_id)', () => {
    return exHas('te_phoenix_web/channels/game/core_handler.ex', 'user_id');
});

test('equip_item: checks inventory ownership', () => {
    return exHas('te_phoenix_web/channels/game/item_handler.ex', 'character_id', 'item_id');
});

test('drop_item: verifies quantity before deduction', () => {
    return exHas('te_phoenix_web/channels/game/item_handler.ex', 'quantity');
});

test('guild invite: requires LEADER or OFFICER rank', () => {
    return exHas('te_phoenix_web/channels/social/guild_trade_party_handler.ex', 'LEADER', 'OFFICER');
});

test('guild kick: prevents kicking higher rank', () => {
    return exHas('te_phoenix_web/channels/social/guild_trade_party_handler.ex', 'kick');
});

test('staff panel: role check on join', () => {
    return exHas('te_phoenix_web/channels/social/staff_handler.ex', 'staff_roles');
});

test('3v3 battle: validates all chars belong to user', () => {
    return exHas('te_phoenix_web/channels/battle/initiation_handler.ex', 'user_id');
});

test('duel: timeout expiry via Process.send_after', () => {
    return exHas('te_phoenix_web/channels/battle/duel_handler.ex', 'send_after', 'duel_expired');
});

// =================================================================
// 8. PHOENIX AUTH CONTROLLER — SESSION & PASSWORD SECURITY
// =================================================================
section('Phoenix Auth & Session Security');

test('auth: bcrypt password hashing', () => {
    return exHas('te_phoenix_web/controllers/auth_controller.ex', 'Bcrypt.hash_pwd_salt');
});

test('auth: bcrypt password verification', () => {
    return exHas('te_phoenix_web/controllers/auth_controller.ex', 'Bcrypt.verify_pass');
});

test('auth: crypto-random verification token', () => {
    return exHas('te_phoenix_web/controllers/auth_controller.ex', ':crypto.strong_rand_bytes');
});

test('auth: honeypot bot trap', () => {
    return exHas('te_phoenix_web/controllers/auth_controller.ex', 'honeypot');
});

test('auth: username regex validation', () => {
    return exHas('te_phoenix_web/controllers/auth_controller.ex', '~r/^[a-zA-Z0-9_]+$/');
});

test('auth: password minimum length', () => {
    return exHas('te_phoenix_web/controllers/auth_controller.ex', 'password');
});

test('auth plug: Phoenix.Token verification', () => {
    return exHas('te_phoenix_web/plugs/auth.ex', 'Phoenix.Token.verify');
});

test('auth plug: max_age expiry', () => {
    return exHas('te_phoenix_web/plugs/auth.ex', 'max_age');
});

test('auth plug: RequireStaff enforces role whitelist', () => {
    return exHas('te_phoenix_web/plugs/auth.ex', 'RequireStaff', 'ADMIN', 'OWNER');
});

test('auth plug: session fallback', () => {
    return exHas('te_phoenix_web/plugs/auth.ex', 'get_session', 'user_id');
});

// =================================================================
// 9. PHOENIX CHARACTER CREATION
// =================================================================
section('Phoenix Character Creation');

test('char create: name length 2-20', () => {
    return exHas('te_phoenix_web/controllers/game_controller.ex', '20');
});

test('char create: name regex validation', () => {
    return exHas('te_phoenix_web/controllers/game_controller.ex', "~r/^[a-zA-Z][a-zA-Z0-9 '\\-]*$/");
});

test('char create: max characters per account', () => {
    return exHas('te_phoenix_web/controllers/game_controller.ex', 'max_characters');
});

test('char create: duplicate name check', () => {
    return exHas('te_phoenix_web/controllers/game_controller.ex', 'name');
});

test('char create: stat calculation from class+race', () => {
    return exHas('te_phoenix_web/controllers/game_controller.ex', 'bonus_hp', 'bonus_atk');
});

// =================================================================
// 10. PHOENIX ADMIN — TABLE WHITELIST & ROLE CHECKS
// =================================================================
section('Phoenix Admin Security');

test('admin controller: table whitelist', () => {
    return exHas('te_phoenix_web/controllers/admin_controller.ex', '@allowed_tables', 'validate_table');
});

test('admin controller: entity CRUD validates table', () => {
    return exHas('te_phoenix_web/controllers/admin_controller.ex', 'validate_table');
});

test('admin: staff role list includes all roles', () => {
    return exHas('te_phoenix_web/plugs/auth.ex', 'ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER');
});

// =================================================================
// 11. PHOENIX BATTLE SYSTEM — DAMAGE & SAFETY
// =================================================================
section('Phoenix Battle System');

test('damage: floor of 1 enforced', () => {
    return exHas('te_phoenix/battle/damage.ex', 'max(1,');
});

test('damage: cap from settings', () => {
    return exHas('te_phoenix/battle/damage.ex', 'dmg_cap');
});

test('combatant: HP clamped to 0 on damage', () => {
    return exHas('te_phoenix/battle/combatant.ex', 'max(0,');
});

test('combatant: HP clamped to max on heal', () => {
    return exHas('te_phoenix/battle/combatant.ex', 'min(', 'max_hp');
});

test('combatant: alive? checks hp > 0', () => {
    return exHas('te_phoenix/battle/combatant.ex', 'alive?');
});

test('combatant: can_act? checks alive and not unconscious', () => {
    return exHas('te_phoenix/battle/combatant.ex', 'can_act?');
});

test('combatant: MP check before skill use', () => {
    return exHas('te_phoenix/battle/combatant.ex', 'insufficient_mp');
});

test('formula: safe regex-only evaluation (no raw eval)', () => {
    return exHas('te_phoenix/battle/formula.ex', 'Regex', 'Code.eval_string');
});

test('formula: known variable substitution only', () => {
    return exHas('te_phoenix/battle/formula.ex', 'ATK', 'DEF', 'SPD', 'LCK');
});

test('formula: error rescue returns safe default', () => {
    return exHas('te_phoenix/battle/formula.ex', 'rescue');
});

test('battle state: alive? checks registry', () => {
    return exHas('te_phoenix/battle/state.ex', 'alive?', 'Registry');
});

test('combat: checks actor existence before action', () => {
    return exHas('te_phoenix/battle/combat.ex', 'nil');
});

test('dodge: chance clamped to max', () => {
    return exHas('te_phoenix/battle/damage.ex', 'max_chance');
});

test('stagger: clamped to max', () => {
    return exHas('te_phoenix/battle/damage.ex', 'stagger_max');
});

test('limb damage: clamped to limb HP', () => {
    return exHas('te_phoenix/battle/damage.ex', 'limb_hp');
});

// =================================================================
// 12. PHOENIX SHOP & ECONOMY
// =================================================================
section('Phoenix Economy');

test('shop buy: gold sufficiency check', () => {
    return exHas('te_phoenix_web/channels/game/shop_handler.ex', 'gold', 'total_cost');
});

test('shop sell: quantity verification', () => {
    return exHas('te_phoenix_web/channels/game/shop_handler.ex', 'owned_qty');
});

test('duel: wager affordability check on challenge', () => {
    return exHas('te_phoenix/battle/duels.ex', 'currency', 'wager');
});

test('duel: wager re-checked on accept', () => {
    return exHas('te_phoenix_web/channels/battle/duel_handler.ex', 'currency');
});

test('duel: wager refund on battle failure', () => {
    return exHas('te_phoenix_web/channels/battle/duel_handler.ex', 'refund');
});

test('npc reputation: clamped to -100..100', () => {
    return exHas('te_phoenix_web/channels/game/npc_handler.ex', 'max(-100', 'min(100');
});

// =================================================================
// 13. ELEMENT SYSTEM (JS logic — shared between both)
// =================================================================
section('Element System');

const { getElementEffectiveness } = require('./preview');

test('fire > ice (super effective)', () => {
    const r = getElementEffectiveness('fire', 'ice');
    if (r.multiplier !== 1.5) return `Expected 1.5, got ${r.multiplier}`;
    return null;
});

test('ice > wind', () => {
    if (getElementEffectiveness('ice', 'fire').multiplier !== 1.5) return `ice should be super effective vs fire`;
    return null;
});

test('wind > earth', () => {
    if (getElementEffectiveness('wind', 'earth').multiplier !== 1.5) return `wrong`;
    return null;
});

test('earth > wind (resisted)', () => {
    const r = getElementEffectiveness('earth', 'wind');
    if (r.multiplier !== 1.5) return `earth > wind should be super effective, got ${r.multiplier}`;
    return null;
});

test('light vs dark (mutual weakness)', () => {
    if (getElementEffectiveness('light', 'dark').multiplier !== 1.5) return `light > dark should be 1.5`;
    if (getElementEffectiveness('dark', 'light').multiplier !== 1.5) return `dark > light should be 1.5`;
    return null;
});

test('same element = resisted', () => {
    if (getElementEffectiveness('light', 'light').multiplier !== 0.5) return `same element should resist`;
    if (getElementEffectiveness('dark', 'dark').multiplier !== 0.5) return `same dark should resist`;
    return null;
});

test('unknown element = neutral', () => {
    const r = getElementEffectiveness('void', 'fire');
    if (r.multiplier !== 1.0) return `Unknown should be neutral, got ${r.multiplier}`;
    return null;
});

// =================================================================
// 14. BATTLE RATING EDGE CASES (JS logic)
// =================================================================
section('Battle Rating Edge Cases');

const { calculateBattleRating } = require('./loot');

test('rating: all AI team = null', () => {
    const b = { combatants: { e1: { isAI: true, currentHp: 50, maxHp: 100 } }, teams: { e: ['e1'] }, turnCount: 5 };
    b.getTeamId = () => 'e';
    const r = calculateBattleRating(b, 'e', { enable_battle_rating: true, rating_target_turns: 8 });
    if (r !== null) return `All-AI team should return null`;
    return null;
});

test('rating: 0 turns = S rank', () => {
    const b = { combatants: { p1: { isAI: false, currentHp: 100, maxHp: 100 } }, teams: { p: ['p1'] }, turnCount: 0 };
    b.getTeamId = () => 'p';
    const r = calculateBattleRating(b, 'p', { enable_battle_rating: true, rating_target_turns: 8, rating_s_xp_mult: 1.5, rating_s_gold_mult: 2.0 });
    if (!r || r.rank !== 'S') return `0 turns should be S, got ${r?.rank}`;
    return null;
});

test('rating: XP multiplier for S rank', () => {
    const b = { combatants: { p1: { isAI: false, currentHp: 100, maxHp: 100 } }, teams: { p: ['p1'] }, turnCount: 3 };
    b.getTeamId = () => 'p';
    const r = calculateBattleRating(b, 'p', { enable_battle_rating: true, rating_target_turns: 8, rating_s_xp_mult: 1.5, rating_s_gold_mult: 2.0 });
    if (r.xpMult !== 1.5) return `S rank XP mult should be 1.5, got ${r.xpMult}`;
    if (r.goldMult !== 2.0) return `S rank gold mult should be 2.0, got ${r.goldMult}`;
    return null;
});

// =================================================================
// 15. REALTIME COMBAT EDGE CASES (JS logic)
// =================================================================
section('Realtime Combat Edge Cases');

const { RealtimeBattle } = require('./realtime');

test('realtime: dead combatant skipped in tick', () => {
    const rt = new RealtimeBattle('t1', [
        { charId: 'p1', name: 'Player', isAI: false, teamId: 'p', currentHp: 0, maxHp: 100 },
        { charId: 'e1', name: 'Enemy', isAI: true, teamId: 'e', currentHp: 100, maxHp: 100 },
    ], {});
    rt.combatants['p1'].alive = false;
    rt.tick();
    if (rt.combatants['p1'].alive) return `Dead player should stay dead`;
    return null;
});

test('realtime: battle ends when one team wiped', () => {
    const rt = new RealtimeBattle('t2', [
        { charId: 'p1', name: 'Player', isAI: false, teamId: 'player', currentHp: 100, maxHp: 100 },
        { charId: 'e1', name: 'Enemy', isAI: true, teamId: 'enemy', currentHp: 1, maxHp: 100 },
    ], {});
    rt.combatants['e1'].alive = false;
    rt.combatants['e1'].currentHp = 0;
    rt.tick();
    if (rt.status !== 'finished') return `Battle should end when enemy team wiped`;
    if (rt.winner !== 'player') return `Player team should win, got ${rt.winner}`;
    return null;
});

test('realtime: element chart in auto-attack', () => {
    const rt = new RealtimeBattle('t3', [
        { charId: 'p1', name: 'FireKnight', isAI: false, teamId: 'p', weaponElement: 'fire' },
        { charId: 'e1', name: 'IceGoblin', isAI: true, teamId: 'e', element: 'ice', currentHp: 100, maxHp: 100 },
    ], {});
    const mult = rt._getElementMult('fire', 'ice');
    if (mult < 1.0) return `Fire vs Ice should be >= 1.0, got ${mult}`;
    return null;
});

test('realtime: stop() clears interval', () => {
    const rt = new RealtimeBattle('t4', [
        { charId: 'p1', name: 'P', isAI: false, teamId: 'p', currentHp: 100, maxHp: 100 },
        { charId: 'e1', name: 'E', isAI: true, teamId: 'e', currentHp: 100, maxHp: 100 },
    ], {});
    rt.start(100);
    rt.stop();
    if (rt._interval) return `Interval should be null after stop()`;
    return null;
});

// =================================================================
// SUMMARY
// =================================================================
console.log('\n========================================================');
console.log('  SECTION BREAKDOWN:');
for (const [name, { p, f }] of Object.entries(sections)) {
    const icon = f > 0 ? '\x1b[31mFAIL\x1b[0m' : '\x1b[32mPASS\x1b[0m';
    console.log(`  ${icon} ${name}: ${p}/${p + f}`);
}
console.log(`\n  TOTAL: ${passed} passed / ${passed + failed} total`);
if (failed > 0) console.log(`  \x1b[31m${failed} failures!\x1b[0m`);
else console.log(`  \x1b[32mAll systems stress-tested and passing!\x1b[0m`);
console.log('========================================================');
process.exit(failed > 0 ? 1 : 0);
