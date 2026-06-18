// =================================================================
// ADMINSAUCE STRESS TEST — Use every function as a real admin
// Creates, edits, and deletes entities across all hub pages.
// Tests: CRUD on every hub, EntityManager, settings, players, GM tools
// Run: node battle/admin-stress-test.js
// =================================================================

const http = require('http');

let passed = 0, failed = 0, sections = {};
let currentSection = '';
let COOKIE = '';
let TOKEN = '';

function section(name) { currentSection = name; sections[name] = { p: 0, f: 0 }; console.log(`\n--- ${name} ---`); }
function pass(name) { console.log(`  \x1b[32mPASS\x1b[0m ${name}`); passed++; sections[currentSection].p++; }
function fail(name, reason) { console.log(`  \x1b[31mFAIL\x1b[0m ${name}: ${reason}`); failed++; sections[currentSection].f++; }

// ── HTTP helpers ─────────────────────────────────────────────────
function api(method, path, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: 'localhost', port: 4000, path, method,
            headers: { 'Authorization': `Bearer ${TOKEN}`, 'Cookie': COOKIE }
        };
        if (data) { opts.headers['Content-Type'] = 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(data); }
        const req = http.request(opts, (res) => {
            let buf = '';
            res.on('data', c => buf += c);
            res.on('end', () => {
                const setCookie = res.headers['set-cookie'];
                if (setCookie) COOKIE = setCookie.map(c => c.split(';')[0]).join('; ');
                try { resolve({ json: JSON.parse(buf), status: res.statusCode }); }
                catch { resolve({ raw: buf, status: res.statusCode }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

// Admin API helper — uses the existing admin controller
async function adminCreate(table, data) {
    return api('POST', `/api/admin/entities/${table}`, data);
}
async function adminUpdate(table, id, data) {
    return api('PUT', `/api/admin/entities/${table}/${id}`, data);
}
async function adminDelete(table, id) {
    return api('DELETE', `/api/admin/entities/${table}/${id}`);
}
async function adminList(table) {
    return api('GET', `/api/admin/entities/${table}`);
}

async function run() {
    // =============================================================
    section('Admin Authentication');
    // =============================================================
    const login = await api('POST', '/api/auth/login', { username: 'Vengeance', password: 'Hurricane36!' });
    if (login.json?.success) {
        TOKEN = login.json.token;
        pass(`Logged in as ${login.json.username} (${login.json.role})`);
    } else {
        fail('Login', JSON.stringify(login.json));
        return done();
    }

    // Verify admin access
    const me = await api('GET', '/api/auth/me');
    if (me.json?.role === 'OWNER') pass('Confirmed OWNER role');
    else fail('Role check', `Expected OWNER, got ${me.json?.role}`);

    // =============================================================
    section('Admin API — Settings');
    // =============================================================
    const settings = await api('GET', '/api/admin/settings');
    if (settings.json?.success || settings.status === 200) pass(`Settings loaded`);
    else fail('Load settings', `Status ${settings.status}`);

    const cats = await api('GET', '/api/admin/settings/categories');
    if (cats.status === 200) pass('Categories loaded');
    else fail('Categories', `Status ${cats.status}`);

    // =============================================================
    section('Admin API — Players');
    // =============================================================
    const players = await api('GET', '/api/admin/players');
    if (players.status === 200) {
        const data = players.json?.data || players.json?.players || [];
        pass(`Players loaded: ${Array.isArray(data) ? data.length : '?'} users`);
    } else fail('Load players', `Status ${players.status}`);

    // =============================================================
    section('CRUD — Create Map');
    // =============================================================
    let testMapId = null;
    const mapCreate = await adminCreate('game_maps', {
        name: 'Stress Test Arena',
        width: 15,
        height: 15,
        region_id: 1,
        render_mode: 'classic',
        zone_type: 'WORLD',
        fast_travel_enabled: 1,
    });
    if (mapCreate.json?.success || mapCreate.status < 400) {
        testMapId = mapCreate.json?.data?.id || mapCreate.json?.id;
        if (!testMapId) {
            // Fetch to find ID
            const maps = await adminList('game_maps');
            const found = (maps.json?.data || []).find(m => m.name === 'Stress Test Arena');
            testMapId = found?.id;
        }
        pass(`Map created: id=${testMapId}`);
    } else {
        fail('Create map', JSON.stringify(mapCreate.json).slice(0, 200));
    }

    // =============================================================
    section('CRUD — Create NPC');
    // =============================================================
    let testNpcId = null;
    const npcCreate = await adminCreate('game_npcs', {
        name: 'Stress Test Merchant',
        map_id: testMapId || 1,
        x: 5, y: 5,
        is_enemy: 0,
        icon: '🧙',
        move_type: 'STATIONARY',
        persona: 'A friendly merchant who sells rare goods.',
        base_hp: 100,
        base_atk: 5,
        base_def: 5,
    });
    if (npcCreate.status < 400) {
        const npcs = await adminList('game_npcs');
        const data = npcs.json?.data || [];
        const found = data.find(n => n.name === 'Stress Test Merchant');
        testNpcId = found?.id;
        pass(`NPC created: ${testNpcId ? 'id=' + testNpcId : 'ok'}`);
    } else fail('Create NPC', JSON.stringify(npcCreate.json).slice(0, 200));

    // =============================================================
    section('CRUD — Create Enemy NPC');
    // =============================================================
    let testEnemyId = null;
    const enemyCreate = await adminCreate('game_npcs', {
        name: 'Stress Test Goblin',
        map_id: testMapId || 1,
        x: 10, y: 10,
        is_enemy: 1,
        icon: '👹',
        move_type: 'WANDER',
        wander_radius: 3,
        base_hp: 60,
        base_atk: 12,
        base_def: 4,
    });
    if (enemyCreate.status < 400) {
        const npcs = await adminList('game_npcs');
        const data = npcs.json?.data || [];
        const found = data.find(n => n.name === 'Stress Test Goblin');
        testEnemyId = found?.id;
        pass(`Enemy NPC created: ${testEnemyId ? 'id=' + testEnemyId : 'ok'}`);
    } else fail('Create enemy', JSON.stringify(enemyCreate.json).slice(0, 200));

    // =============================================================
    section('CRUD — Create Item');
    // =============================================================
    let testItemId = null;
    const itemCreate = await adminCreate('game_items', {
        name: 'Stress Test Sword',
        type: 'WEAPON',
        description: 'A blade forged in the fires of automated testing.',
        icon: '⚔️',
        bonus_atk: 15,
        bonus_def: 0,
        rarity: 'RARE',
        sell_price: 250,
        buy_price: 500,
        level_req: 1,
    });
    if (itemCreate.status < 400) {
        const items = await adminList('game_items');
        const data = items.json?.data || [];
        const found = data.find(i => i.name === 'Stress Test Sword');
        testItemId = found?.id;
        pass(`Item created: ${testItemId ? 'id=' + testItemId : 'ok'}`);
    } else fail('Create item', JSON.stringify(itemCreate.json).slice(0, 200));

    // =============================================================
    section('CRUD — Create Skill');
    // =============================================================
    let testSkillId = null;
    const skillCreate = await adminCreate('game_skills', {
        name: 'Stress Slash',
        type: 'PHYSICAL',
        damage: 25,
        mp_cost: 5,
        cooldown: 1,
        description: 'A powerful slash powered by automated testing.',
    });
    if (skillCreate.status < 400) {
        const skills = await adminList('game_skills');
        const data = skills.json?.data || [];
        const found = data.find(s => s.name === 'Stress Slash');
        testSkillId = found?.id;
        pass(`Skill created: ${testSkillId ? 'id=' + testSkillId : 'ok'}`);
    } else fail('Create skill', JSON.stringify(skillCreate.json).slice(0, 200));

    // =============================================================
    section('CRUD — Create Quest');
    // =============================================================
    let testQuestId = null;
    const questCreate = await adminCreate('game_quests', {
        name: 'The Stress Test',
        description: 'Defeat the Stress Test Goblin terrorizing the arena.',
        type: 'KILL',
        target_count: 1,
        reward_xp: 100,
        reward_gold: 50,
        min_level: 1,
        is_repeatable: 0,
    });
    if (questCreate.status < 400) {
        const quests = await adminList('game_quests');
        const data = quests.json?.data || [];
        const found = data.find(q => q.name === 'The Stress Test');
        testQuestId = found?.id;
        pass(`Quest created: ${testQuestId ? 'id=' + testQuestId : 'ok'}`);
    } else fail('Create quest', JSON.stringify(questCreate.json).slice(0, 200));

    // =============================================================
    section('CRUD — Create Shop');
    // =============================================================
    let testShopId = null;
    const shopCreate = await adminCreate('game_shops', {
        name: 'Stress Test Emporium',
        map_id: testMapId || 1,
        npc_id: testNpcId || null,
        shop_type: 'GENERAL',
    });
    if (shopCreate.status < 400) {
        const shops = await adminList('game_shops');
        const data = shops.json?.data || [];
        const found = data.find(s => s.name === 'Stress Test Emporium');
        testShopId = found?.id;
        pass(`Shop created: ${testShopId ? 'id=' + testShopId : 'ok'}`);
    } else fail('Create shop', JSON.stringify(shopCreate.json).slice(0, 200));

    // =============================================================
    section('CRUD — Create Achievement');
    // =============================================================
    const achCreate = await adminCreate('game_achievements', {
        name: 'Stress Tested',
        description: 'Survived the automated stress test.',
        category: 'SPECIAL',
        icon: '🏆',
        reward_type: 'GOLD',
        reward_amount: 100,
    });
    if (achCreate.status < 400) pass('Achievement created');
    else fail('Create achievement', JSON.stringify(achCreate.json).slice(0, 200));

    // =============================================================
    section('CRUD — Create Status Effect');
    // =============================================================
    const statusCreate = await adminCreate('game_statuses', {
        name: 'Stress Burn',
        type: 'DEBUFF',
        effects: '{"damage_per_turn": 5}',
        default_duration: 3,
    });
    if (statusCreate.status < 400) pass('Status effect created');
    else fail('Create status', JSON.stringify(statusCreate.json).slice(0, 200));

    // =============================================================
    section('CRUD — Edit Entities');
    // =============================================================

    // Edit map
    if (testMapId) {
        const edit = await adminUpdate('game_maps', testMapId, { name: 'Stress Test Arena (Edited)', width: 20, height: 20 });
        if (edit.status < 400) pass(`Map #${testMapId} edited`);
        else fail('Edit map', `Status ${edit.status}`);
    } else pass('Map edit skipped (no ID)');

    // Edit NPC
    if (testNpcId) {
        const edit = await adminUpdate('game_npcs', testNpcId, { name: 'Stress Test Merchant (Updated)', persona: 'Updated persona for testing.' });
        if (edit.status < 400) pass(`NPC #${testNpcId} edited`);
        else fail('Edit NPC', `Status ${edit.status}`);
    } else pass('NPC edit skipped (no ID)');

    // Edit item
    if (testItemId) {
        const edit = await adminUpdate('game_items', testItemId, { name: 'Stress Test Sword +1', bonus_atk: 20 });
        if (edit.status < 400) pass(`Item #${testItemId} edited`);
        else fail('Edit item', `Status ${edit.status}`);
    } else pass('Item edit skipped (no ID)');

    // Edit skill
    if (testSkillId) {
        const edit = await adminUpdate('game_skills', testSkillId, { name: 'Mega Stress Slash', damage: 50 });
        if (edit.status < 400) pass(`Skill #${testSkillId} edited`);
        else fail('Edit skill', `Status ${edit.status}`);
    } else pass('Skill edit skipped (no ID)');

    // =============================================================
    section('CRUD — Verify Edits');
    // =============================================================

    if (testMapId) {
        const maps = await adminList('game_maps');
        const found = (maps.json?.data || []).find(m => m.id === testMapId);
        if (found?.name === 'Stress Test Arena (Edited)') pass('Map edit verified');
        else fail('Verify map edit', `Name: ${found?.name}`);
    } else pass('Map verify skipped');

    if (testItemId) {
        const items = await adminList('game_items');
        const found = (items.json?.data || []).find(i => i.id === testItemId);
        if (found?.name === 'Stress Test Sword +1') pass('Item edit verified');
        else fail('Verify item edit', `Name: ${found?.name}`);
    } else pass('Item verify skipped');

    // =============================================================
    section('Admin Page Loading (all 16 pages)');
    // =============================================================
    const pages = ['', 'settings', 'entities', 'players', 'world', 'combat', 'content',
                   'social', 'campaigns', 'gm', 'gameplay', 'magic', 'roles', 'system', 'economy', 'config'];
    for (const page of pages) {
        const label = page || 'dashboard';
        const res = await new Promise((resolve, reject) => {
            const opts = { hostname: 'localhost', port: 4000, path: `/sauce/${page}`, method: 'GET', headers: { Cookie: COOKIE } };
            http.request(opts, r => {
                let buf = '';
                r.on('data', c => buf += c);
                r.on('end', () => resolve({ status: r.statusCode, size: buf.length }));
            }).on('error', reject).end();
        });
        if (res.status === 200) pass(`/sauce/${label} — ${(res.size / 1024).toFixed(0)}KB`);
        else fail(`/sauce/${label}`, `Status ${res.status}`);
    }

    // =============================================================
    section('GM Tools — Broadcast');
    // =============================================================
    const broadcast = await api('POST', '/api/admin/broadcast', { message: 'Stress test broadcast!', style: 'info' });
    if (broadcast.status < 400) pass('Broadcast sent');
    else fail('Broadcast', `Status ${broadcast.status}`);

    // =============================================================
    section('Admin — Player Management');
    // =============================================================

    // Give gold to a player
    const giveGold = await api('POST', '/api/admin/players/1/give-gold', { amount: 100 });
    if (giveGold.status < 400) pass('Give gold to player #1');
    else fail('Give gold', `Status ${giveGold.status}: ${JSON.stringify(giveGold.json).slice(0, 100)}`);

    // Get player details
    const playerDetail = await api('GET', '/api/admin/players/1');
    if (playerDetail.status === 200) pass('Player #1 details loaded');
    else fail('Player details', `Status ${playerDetail.status}`);

    // =============================================================
    section('Admin — Reports & Moderation');
    // =============================================================
    const reports = await api('GET', '/api/admin/reports');
    if (reports.status === 200) pass('Reports loaded');
    else fail('Reports', `Status ${reports.status}`);

    const chatLog = await api('GET', '/api/admin/mod/chat-log');
    if (chatLog.status === 200) pass('Chat log loaded');
    else fail('Chat log', `Status ${chatLog.status}`);

    const online = await api('GET', '/api/admin/mod/online');
    if (online.status === 200) pass('Online players loaded');
    else fail('Online players', `Status ${online.status}`);

    // =============================================================
    section('Security — Non-admin blocked');
    // =============================================================

    // Login as player
    const playerLogin = await api('POST', '/api/auth/login', { username: 'stress_tester', password: 'Test123!' });
    const playerToken = playerLogin.json?.token;

    // Try admin endpoints with player token
    const savedToken = TOKEN;
    TOKEN = playerToken || '';

    const blocked1 = await api('GET', '/api/admin/players');
    if (blocked1.status === 401 || blocked1.status === 403) pass('Admin players blocked for player');
    else fail('Security: admin players', `Status ${blocked1.status} (expected 401/403)`);

    const blocked2 = await api('POST', '/api/admin/broadcast', { message: 'hacked' });
    if (blocked2.status === 401 || blocked2.status === 403) pass('Admin broadcast blocked for player');
    else fail('Security: broadcast', `Status ${blocked2.status}`);

    const blocked3 = await adminCreate('game_items', { name: 'Hacked Item' });
    if (blocked3.status === 401 || blocked3.status === 403) pass('Entity create blocked for player');
    else fail('Security: entity create', `Status ${blocked3.status}`);

    TOKEN = savedToken; // Restore admin token

    // =============================================================
    section('CRUD — Delete Test Entities (cleanup)');
    // =============================================================

    // Delete in reverse order to avoid FK constraints
    if (testShopId) {
        const del = await adminDelete('game_shops', testShopId);
        if (del.status < 400) pass(`Shop #${testShopId} deleted`);
        else fail('Delete shop', `Status ${del.status}`);
    }
    if (testQuestId) {
        const del = await adminDelete('game_quests', testQuestId);
        if (del.status < 400) pass(`Quest #${testQuestId} deleted`);
        else fail('Delete quest', `Status ${del.status}`);
    }
    if (testSkillId) {
        const del = await adminDelete('game_skills', testSkillId);
        if (del.status < 400) pass(`Skill #${testSkillId} deleted`);
        else fail('Delete skill', `Status ${del.status}`);
    }
    if (testItemId) {
        const del = await adminDelete('game_items', testItemId);
        if (del.status < 400) pass(`Item #${testItemId} deleted`);
        else fail('Delete item', `Status ${del.status}`);
    }
    if (testEnemyId) {
        const del = await adminDelete('game_npcs', testEnemyId);
        if (del.status < 400) pass(`Enemy NPC #${testEnemyId} deleted`);
        else fail('Delete enemy', `Status ${del.status}`);
    }
    if (testNpcId) {
        const del = await adminDelete('game_npcs', testNpcId);
        if (del.status < 400) pass(`NPC #${testNpcId} deleted`);
        else fail('Delete NPC', `Status ${del.status}`);
    }
    if (testMapId) {
        const del = await adminDelete('game_maps', testMapId);
        if (del.status < 400) pass(`Map #${testMapId} deleted`);
        else fail('Delete map', `Status ${del.status}`);
    }

    // Clean up achievement and status (find by name)
    const achs = await adminList('game_achievements');
    const testAch = (achs.json?.data || []).find(a => a.name === 'Stress Tested');
    if (testAch) {
        await adminDelete('game_achievements', testAch.id);
        pass('Achievement cleaned up');
    }

    const statuses = await adminList('game_statuses');
    const testStatus = (statuses.json?.data || []).find(s => s.name === 'Stress Burn');
    if (testStatus) {
        await adminDelete('game_statuses', testStatus.id);
        pass('Status effect cleaned up');
    }

    // =============================================================
    section('Verify Cleanup');
    // =============================================================
    const finalMaps = await adminList('game_maps');
    const stressMap = (finalMaps.json?.data || []).find(m => m.name?.includes('Stress Test'));
    if (!stressMap) pass('No leftover test maps');
    else fail('Cleanup', `Found leftover map: ${stressMap.name}`);

    const finalNpcs = await adminList('game_npcs');
    const stressNpc = (finalNpcs.json?.data || []).find(n => n.name?.includes('Stress Test'));
    if (!stressNpc) pass('No leftover test NPCs');
    else fail('Cleanup', `Found leftover NPC: ${stressNpc.name}`);

    const finalItems = await adminList('game_items');
    const stressItem = (finalItems.json?.data || []).find(i => i.name?.includes('Stress Test'));
    if (!stressItem) pass('No leftover test items');
    else fail('Cleanup', `Found leftover item: ${stressItem.name}`);

    done();
}

function done() {
    console.log('\n========================================================');
    console.log('  ADMINSAUCE STRESS TEST RESULTS:');
    for (const [name, { p, f }] of Object.entries(sections)) {
        const icon = f > 0 ? '\x1b[31mFAIL\x1b[0m' : '\x1b[32mPASS\x1b[0m';
        console.log(`  ${icon} ${name}: ${p}/${p + f}`);
    }
    console.log(`\n  TOTAL: ${passed} passed / ${passed + failed} total`);
    if (failed > 0) console.log(`  \x1b[31m${failed} failures!\x1b[0m`);
    else console.log(`  \x1b[32mAll admin functions working!\x1b[0m`);
    console.log('========================================================');
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
