// =================================================================
// EVENT RUNNER v1.0 — The Game Cartridge Player
// =================================================================
// WHAT THIS DOES:
//   Instead of hardcoding "if npc.name === 'Guard' then say hi",
//   we store action lists in the database and this engine runs them.
//
// WHY:
//   - ALL game logic lives in MySQL, not in code
//   - Admins create quests, cutscenes, puzzles from the ACP
//   - The server never needs to be rewritten again
//   - You can build ANY editor later (text, node graph, AI)
//
// HOW IT WORKS:
//   1. Player steps on a tile or presses [E] near something
//   2. Server finds the event at that tile (from collisions_json)
//   3. Event has an "actions" array: [{type, args}]
//   4. This file loops through the actions and executes each one
//
// EXAMPLE EVENT (stored in collisions_json):
//   {
//     "x": 5, "y": 3,
//     "trigger": "INTERACT",    // INTERACT, STEP_ON, AUTO
//     "conditions": [           // Optional: only fire if conditions met
//       { "type": "FLAG", "key": "talked_to_guard", "op": "!=", "value": true }
//     ],
//     "actions": [
//       { "type": "DIALOGUE", "speaker": "Guard", "text": "Halt! State your business." },
//       { "type": "CHOICE", "prompt": "What do you say?", "options": [
//           { "label": "I'm a traveler", "actions": [
//               { "type": "DIALOGUE", "speaker": "Guard", "text": "Fine. Pass." },
//               { "type": "SET_FLAG", "key": "gate_open", "value": true }
//           ]},
//           { "label": "None of your business!", "actions": [
//               { "type": "DIALOGUE", "speaker": "Guard", "text": "Then you don't pass!" }
//           ]}
//       ]},
//       { "type": "SET_FLAG", "key": "talked_to_guard", "value": true }
//     ]
//   }
// =================================================================

// --- SAFE FORMULA EVALUATOR ---
// Replaces VRDE's dangerous eval() with a whitelist-only math parser.
// Only allows: numbers, +, -, *, /, (), and stat names like ATK, DEF, MO, MD.
// NEVER runs arbitrary code.
//
// Security model:
//   1. All var names (ATK, DEF…) are replaced with their numeric values FIRST.
//   2. Whitelist rejects anything non-math — no letters means no scope access.
//   3. new Function() runs pure arithmetic only — it cannot reach any globals.
//
// Known safe ceiling: result is clamped to [0, 999999] to prevent Infinity
// from division-by-zero formulas (e.g. ATK / (DEF - DEF)) from producing
// one-shot exploits. Formulas that produce NaN are treated as 0.
const SAFEEVAL_MAX = 999999;

function safeEval(formula, vars = {}) {
    if (typeof formula === 'number') {
        const n = Number(formula);
        return isFinite(n) ? Math.min(Math.max(n, 0), SAFEEVAL_MAX) : 0;
    }
    if (typeof formula !== 'string') return 0;

    // Step 1: Replace stat names with their numeric values.
    // Number() coerces anything non-numeric to NaN, then || 0 makes it 0.
    // This means a missing var never leaves a letter in the expression.
    let expr = formula.toUpperCase();
    for (const [key, val] of Object.entries(vars)) {
        const re = new RegExp('\\b' + key.toUpperCase() + '\\b', 'g');
        expr = expr.replace(re, String(Number(val) || 0));
    }

    // Step 2: Reject anything that isn't pure arithmetic.
    // Letters would mean an unresolved variable name — block it.
    if (!/^[\d\s\+\-\*\/\.\(\)]+$/.test(expr)) {
        console.warn('⚠️ safeEval rejected (non-math chars):', formula);
        return 0;
    }

    try {
        // Step 3: Evaluate. new Function() has no access to outer scope
        // because the whitelist guarantees no identifiers survived step 2.
        const raw = Number(new Function('return (' + expr + ')')());

        // Step 4: Guard against Infinity (division by zero) and NaN.
        if (!isFinite(raw) || isNaN(raw)) {
            console.warn('⚠️ safeEval non-finite result for:', formula, '→', raw);
            return 0;
        }

        // Step 5: Clamp to sane game range. Prevents exploit formulas from
        // producing astronomically large damage values even if math is valid.
        return Math.min(Math.max(raw, 0), SAFEEVAL_MAX);
    } catch (e) {
        console.warn('⚠️ safeEval failed:', formula, e.message);
        return 0;
    }
}

// --- CONDITION CHECKER ---
// Evaluates whether an event should fire based on player state.
// Returns true if ALL conditions pass (AND logic).
function checkConditions(conditions, state, context) {
    if (!conditions || !Array.isArray(conditions) || conditions.length === 0) return true;

    for (const cond of conditions) {
        let result = false;

        switch (cond.type) {
            // FLAG: Check a value in the player's state_json
            // { type: "FLAG", key: "talked_to_guard", op: "==", value: true }
            case 'FLAG': {
                const actual = state[cond.key];
                result = compareValues(actual, cond.op || '==', cond.value);
                break;
            }

            // LEVEL: Check player level
            // { type: "LEVEL", op: ">=", value: 5 }
            case 'LEVEL': {
                result = compareValues(context.level || 1, cond.op || '>=', cond.value);
                break;
            }

            // HAS_ITEM: Check if player has an item (by item_id)
            // { type: "HAS_ITEM", itemId: 3, quantity: 1 }
            case 'HAS_ITEM': {
                const inv = context.inventory || [];
                const item = inv.find(i => i.item_id === cond.itemId);
                result = item && item.quantity >= (cond.quantity || 1);
                break;
            }

            // QUEST_STEP: Check quest progress
            // { type: "QUEST_STEP", questId: 1, step: 2, op: ">=" }
            case 'QUEST_STEP': {
                const qState = (state.quests || {})[cond.questId];
                const step = qState ? (qState.step || 0) : 0;
                result = compareValues(step, cond.op || '>=', cond.step);
                break;
            }

            // CLASS: Check if player is a specific class
            // { type: "CLASS", classId: 2 }
            case 'CLASS': {
                result = context.classId === cond.classId;
                break;
            }

            // RANDOM: Random chance (0-100)
            // { type: "RANDOM", chance: 50 }
            case 'RANDOM': {
                result = Math.random() * 100 < (cond.chance || 50);
                break;
            }

            default:
                console.warn('Unknown condition type:', cond.type);
                result = true; // Unknown conditions pass by default
        }

        // If inverted (NOT), flip the result
        if (cond.not) result = !result;

        // ALL conditions must pass (AND logic)
        if (!result) return false;
    }

    return true;
}

function compareValues(actual, op, expected) {
    switch (op) {
        case '==':  return actual == expected;    // Loose equality (intentional)
        case '!=':  return actual != expected;
        case '>':   return actual > expected;
        case '<':   return actual < expected;
        case '>=':  return actual >= expected;
        case '<=':  return actual <= expected;
        default:    return actual == expected;
    }
}

// =================================================================
// THE ACTION EXECUTOR
// =================================================================
// This is the heart of the engine. It takes a list of actions and
// runs them one by one, sending results to the player's socket.
//
// Returns a "result" object that the caller can use to update state.
// Actions are NOT async because they queue messages to the client.
// The client plays them back sequentially.
//
// TEACHING: Think of this like a script interpreter. Each action is
// a "line of code" that the engine reads and executes.
// =================================================================

async function executeActions({ actions, socket, player, state, db }) {
    if (!actions || !Array.isArray(actions)) return;

    // The response queue — messages to send to the client in order
    const responses = [];

    // Mutable state copy — actions can modify flags during execution
    const localState = { ...state };

    for (const action of actions) {
        switch (action.type) {

            // ---------------------------------------------------------
            // DIALOGUE: Show text in the dialogue box
            // { type: "DIALOGUE", speaker: "Guard", text: "Halt!" }
            // ---------------------------------------------------------
            case 'DIALOGUE': {
                const text = resolveTemplate(action.text, { player, state: localState });
                responses.push({
                    cmd: 'dialogue',
                    speaker: action.speaker || 'NPC',
                    text: text,
                    portrait: action.portrait || null
                });
                break;
            }

            // ---------------------------------------------------------
            // CHOICE: Present options to the player
            // { type: "CHOICE", prompt: "What say?", options: [{label, actions}] }
            // ---------------------------------------------------------
            case 'CHOICE': {
                responses.push({
                    cmd: 'choice',
                    prompt: action.prompt || '',
                    options: (action.options || []).map((opt, i) => ({
                        id: i,
                        label: opt.label
                        // NOTE: The nested actions are NOT sent to client.
                        // Client sends back the chosen option ID.
                        // Server then runs the corresponding actions.
                    }))
                });
                // IMPORTANT: Stop processing here. The client will send
                // back 'event_choice' with the selected option index.
                // The server then calls executeActions() again with
                // the chosen option's actions array.
                socket._pendingChoices = action.options;
                socket.emit('event_queue', responses);
                return { state: localState, halted: true, reason: 'CHOICE' };
            }

            // ---------------------------------------------------------
            // SET_FLAG: Store a value in the player's state_json
            // { type: "SET_FLAG", key: "talked_to_guard", value: true }
            // ---------------------------------------------------------
            case 'SET_FLAG': {
                localState[action.key] = action.value;
                break;
            }

            // ---------------------------------------------------------
            // SET_NPC_MOOD: Change the mood of a specific NPC by name.
            // { type: "SET_NPC_MOOD", npcName: "Guard Captain", mood: "fearful" }
            // Valid moods: happy, fearful, angry, grieving, excited, null (reset)
            // TEACHING: Mood lives in the npcState dict in memory. It persists
            // until the server restarts or until another SET_NPC_MOOD clears it.
            // NPCs in dialogue will reference their mood in their greeting.
            // ---------------------------------------------------------
            case 'SET_NPC_MOOD': {
                if (typeof global.setNpcMood === 'function') {
                    global.setNpcMood(action.npcName, action.mood || null);
                }
                break;
            }

            // ---------------------------------------------------------
            // KILL_NPC: Mark an NPC as dead by name. They disappear from
            // the world until replaced by an admin via AdminSauce.
            // { type: "KILL_NPC", npcName: "Elder Mira", cause: "Slain by the dragon" }
            // TEACHING: We write is_dead=1 to the DB so the NPC stays gone
            // after server restarts. We also remove them from live npcState.
            // ---------------------------------------------------------
            case 'KILL_NPC': {
                if (db && typeof global.killNpc === 'function') {
                    await global.killNpc(db, action.npcName, action.cause || 'Unknown');
                }
                break;
            }

            // ---------------------------------------------------------
            // SET_WORLD_FLAG: Set a GLOBAL flag visible to all NPCs in dialogue.
            // { type: "SET_WORLD_FLAG", key: "goblin_boss_slain", value: "true" }
            // TEACHING: Unlike SET_FLAG (which is per-player, in state_json),
            // SET_WORLD_FLAG writes to the world_flags DB table and is shared
            // across ALL players and NPCs. NPCs read this in buildPrompt().
            // Use it for major world events: boss kills, story milestones, etc.
            // ---------------------------------------------------------
            case 'SET_WORLD_FLAG': {
                if (db) {
                    const val = String(action.value !== undefined ? action.value : 'true');
                    const who = player && player.name ? player.name : 'system';
                    await db.query(
                        `INSERT INTO world_flags (flag_key, flag_value, set_by)
                         VALUES (?, ?, ?)
                         ON DUPLICATE KEY UPDATE flag_value=VALUES(flag_value), set_by=VALUES(set_by), set_at=CURRENT_TIMESTAMP`,
                        [action.key, val, who]
                    );
                }
                break;
            }

            // ---------------------------------------------------------
            // INC_FLAG: Increment a numeric flag
            // { type: "INC_FLAG", key: "kill_count", amount: 1 }
            // ---------------------------------------------------------
            case 'INC_FLAG': {
                const current = Number(localState[action.key]) || 0;
                localState[action.key] = current + (action.amount || 1);
                break;
            }

            // ---------------------------------------------------------
            // TELEPORT: Move player to a new location
            // { type: "TELEPORT", mapId: 2, x: 10, y: 10 }
            // ---------------------------------------------------------
            case 'TELEPORT': {
                responses.push({
                    cmd: 'teleport',
                    mapId: action.mapId,
                    x: action.x || 10,
                    y: action.y || 10
                });
                break;
            }

            // ---------------------------------------------------------
            // DESCENT: Move deeper into a dungeon (next floor down)
            // { type: "DESCENT", mapId: 5, x: 10, y: 10, floorName: "B2F" }
            // Teaching: DESCENT is just a TELEPORT with dungeon context.
            // The destination map has floor_number set in game_maps.
            // The client shows a cinematic "Descending..." overlay.
            // ---------------------------------------------------------
            case 'DESCENT': {
                responses.push({
                    cmd: 'teleport',
                    mapId: action.mapId,
                    x: action.x || 10,
                    y: action.y || 10,
                    transition: 'descent',
                    floorName: action.floorName || null
                });
                if (action.floorName) {
                    responses.push({ cmd: 'notification', text: `⬇️ ${action.floorName}`, type: 'floor' });
                }
                break;
            }

            // ---------------------------------------------------------
            // ASCENT: Move up a dungeon floor (or exit dungeon)
            // { type: "ASCENT", mapId: 3, x: 5, y: 5, floorName: "B1F" }
            // ---------------------------------------------------------
            case 'ASCENT': {
                responses.push({
                    cmd: 'teleport',
                    mapId: action.mapId,
                    x: action.x || 10,
                    y: action.y || 10,
                    transition: 'ascent',
                    floorName: action.floorName || null
                });
                if (action.floorName) {
                    responses.push({ cmd: 'notification', text: `⬆️ ${action.floorName}`, type: 'floor' });
                }
                break;
            }

            // ---------------------------------------------------------
            // GIVE_ITEM: Add item to player's inventory
            // { type: "GIVE_ITEM", itemId: 3, quantity: 1 }
            // ---------------------------------------------------------
            case 'GIVE_ITEM': {
                if (db && player.charId) {
                    const qty = action.quantity || 1;
                    const [existing] = await db.query(
                        "SELECT * FROM character_items WHERE character_id=? AND item_id=?",
                        [player.charId, action.itemId]
                    );
                    if (existing.length) {
                        await db.query("UPDATE character_items SET quantity=quantity+? WHERE id=?",
                            [qty, existing[0].id]);
                    } else {
                        await db.query("INSERT INTO character_items(character_id,item_id,quantity)VALUES(?,?,?)",
                            [player.charId, action.itemId, qty]);
                    }
                    // Look up item name for the client message
                    const [itemRow] = await db.query("SELECT name,icon FROM game_items WHERE id=?", [action.itemId]);
                    const iName = itemRow.length ? itemRow[0].name : 'Unknown Item';
                    const iIcon = itemRow.length ? itemRow[0].icon : '📦';
                    responses.push({ cmd: 'notification', text: `${iIcon} Received ${qty}x ${iName}!`, type: 'item' });
                }
                break;
            }

            // ---------------------------------------------------------
            // TAKE_ITEM: Remove item from inventory
            // { type: "TAKE_ITEM", itemId: 3, quantity: 1 }
            // ---------------------------------------------------------
            case 'TAKE_ITEM': {
                if (db && player.charId) {
                    const qty = action.quantity || 1;
                    const [inv] = await db.query(
                        "SELECT * FROM character_items WHERE character_id=? AND item_id=?",
                        [player.charId, action.itemId]
                    );
                    if (inv.length) {
                        if (inv[0].quantity > qty) {
                            await db.query("UPDATE character_items SET quantity=quantity-? WHERE id=?", [qty, inv[0].id]);
                        } else {
                            await db.query("DELETE FROM character_items WHERE id=?", [inv[0].id]);
                        }
                    }
                }
                break;
            }

            // ---------------------------------------------------------
            // GIVE_GOLD: Add currency to player's user account
            // { type: "GIVE_GOLD", amount: 100 }
            // ---------------------------------------------------------
            case 'GIVE_GOLD': {
                if (db && player.userId) {
                    await db.query("UPDATE users SET currency=currency+? WHERE id=?", [action.amount || 0, player.userId]);
                    responses.push({ cmd: 'notification', text: `💰 +${action.amount}g!`, type: 'gold' });
                }
                break;
            }

            // ---------------------------------------------------------
            // GIVE_XP: Add experience (and auto-level if applicable)
            // { type: "GIVE_XP", amount: 50 }
            // ---------------------------------------------------------
            case 'GIVE_XP': {
                if (db && player.charId) {
                    const xpAmount = parseInt(action.amount) || 0;
                    // Write XP to both columns (same pattern as battle_engine endBattle)
                    await db.query('UPDATE characters SET experience=experience+? WHERE id=?',
                        [xpAmount, player.charId]);
                    await db.query(
                        `UPDATE characters SET state_json=JSON_SET(
                            COALESCE(state_json,'{}'),
                            '$.xp',
                            COALESCE(CAST(JSON_EXTRACT(state_json,'$.xp') AS DECIMAL(20,0)),0)+?
                         ) WHERE id=?`,
                        [xpAmount, player.charId]
                    );
                    responses.push({ cmd: 'notification', text: `⭐ +${xpAmount} XP!`, type: 'xp' });

                    // Check for level-up using the same state_json-aware function as the battle engine
                    // We inline a minimal version here to avoid a circular require.
                    // TEACHING: event_runner and battle_engine both give XP. Rather than
                    // creating a shared module and risking circular dependencies, we inline
                    // the same 20-line level-up loop. It's short enough to duplicate safely.
                    try {
                        const [rows] = await db.query(
                            'SELECT level, max_hp, max_mp, state_json FROM characters WHERE id=?', [player.charId]
                        );
                        if (rows.length) {
                            const ch = rows[0];
                            let state = {};
                            try { state = JSON.parse(ch.state_json || '{}'); } catch {}
                            if (typeof state.xp !== 'number') state.xp = 0;
                            if (!state.progression) state.progression = { unspent_points: 0 };
                            let level = ch.level || 1, maxHp = ch.max_hp, maxMp = ch.max_mp, leveled = false;
                            for (let i = 0; i < 50; i++) {
                                const [lvRows] = await db.query(
                                    'SELECT * FROM level_requirements WHERE level=?', [level + 1]
                                );
                                if (!lvRows.length) break;
                                const lv = lvRows[0];
                                if (state.xp < (lv.xp_required || 0)) break;
                                state.xp -= lv.xp_required;
                                level++;
                                maxHp += (lv.hp_growth || 0);
                                maxMp += (lv.mp_growth || 0);
                                state.progression.unspent_points = (state.progression.unspent_points || 0) + 3;
                                leveled = true;
                            }
                            if (leveled) {
                                await db.query(
                                    'UPDATE characters SET level=?,max_hp=?,current_hp=?,max_mp=?,current_mp=?,state_json=? WHERE id=?',
                                    [level, maxHp, maxHp, maxMp, maxMp, JSON.stringify(state), player.charId]
                                );
                                responses.push({ cmd: 'notification', text: `🎉 Level Up! You are now level ${level}!`, type: 'level_up' });
                            } else {
                                await db.query('UPDATE characters SET state_json=? WHERE id=?', [JSON.stringify(state), player.charId]);
                            }
                        }
                    } catch (lvlErr) { /* Non-critical — XP still saved */ }
                }
                break;
            }

            // ---------------------------------------------------------
            // HEAL: Restore HP/MP
            // { type: "HEAL", hp: "50", mp: "20" }  (can be formulas)
            // ---------------------------------------------------------
            case 'HEAL': {
                if (db && player.charId) {
                    const [charRow] = await db.query("SELECT * FROM characters WHERE id=?", [player.charId]);
                    if (charRow.length) {
                        const c = charRow[0];
                        const vars = { ATK: c.atk, DEF: c.def, MO: c.mo, MD: c.md, MAXHP: c.max_hp, MAXMP: c.max_mp, LVL: c.level };
                        const hpHeal = action.hp ? safeEval(String(action.hp), vars) : 0;
                        const mpHeal = action.mp ? safeEval(String(action.mp), vars) : 0;
                        const newHp = Math.min(c.max_hp, c.current_hp + Math.floor(hpHeal));
                        const newMp = Math.min(c.max_mp, (c.current_mp || 0) + Math.floor(mpHeal));
                        await db.query("UPDATE characters SET current_hp=?, current_mp=? WHERE id=?", [newHp, newMp, player.charId]);
                        if (hpHeal) responses.push({ cmd: 'notification', text: `💚 +${Math.floor(hpHeal)} HP!`, type: 'heal' });
                        if (mpHeal) responses.push({ cmd: 'notification', text: `💙 +${Math.floor(mpHeal)} MP!`, type: 'heal' });
                    }
                }
                break;
            }

            // ---------------------------------------------------------
            // DAMAGE: Deal damage to the player
            // { type: "DAMAGE", hp: "20+LVL*2" }
            // ---------------------------------------------------------
            case 'DAMAGE': {
                if (db && player.charId) {
                    const [charRow] = await db.query("SELECT * FROM characters WHERE id=?", [player.charId]);
                    if (charRow.length) {
                        const c = charRow[0];
                        const vars = { ATK: c.atk, DEF: c.def, MO: c.mo, MD: c.md, MAXHP: c.max_hp, LVL: c.level };
                        const dmg = Math.floor(safeEval(String(action.hp || action.amount || '0'), vars));
                        const newHp = Math.max(0, c.current_hp - dmg);
                        await db.query("UPDATE characters SET current_hp=? WHERE id=?", [newHp, player.charId]);
                        responses.push({ cmd: 'notification', text: `💥 -${dmg} HP!`, type: 'damage' });
                    }
                }
                break;
            }

            // ---------------------------------------------------------
            // OFFER_QUEST: Show the player a quest accept/decline popup
            // { type: "OFFER_QUEST", questId: 5 }
            // Teaching: Unlike QUEST_START (which silently begins a quest),
            // OFFER_QUEST sends an offer_quest command to the client which
            // displays a styled popup with title, description, and rewards.
            // The player chooses to accept or decline. On accept, the client
            // calls /api/quests/accept. This models NPC quest givers.
            // ---------------------------------------------------------
            case 'OFFER_QUEST': {
                if (db) {
                    const [qr] = await db.query('SELECT * FROM game_quests WHERE id=?', [action.questId]);
                    if (qr.length) {
                        const q = qr[0];
                        let rewardStr = '';
                        try {
                            const rw = JSON.parse(q.rewards_json || '{}');
                            const parts = [];
                            if (rw.xp)   parts.push(`${rw.xp} XP`);
                            if (rw.gold) parts.push(`${rw.gold} Gold`);
                            rewardStr = parts.join(', ');
                        } catch {}
                        responses.push({
                            cmd: 'offer_quest',
                            questId:    q.id,
                            questTitle: q.name || q.title,
                            questDesc:  q.description || q.objective,
                            rewards:    rewardStr,
                        });
                    }
                }
                break;
            }

            // ---------------------------------------------------------
            // QUEST_START: Begin tracking a quest
            // { type: "QUEST_START", questId: 1 }
            // ---------------------------------------------------------
            case 'QUEST_START': {
                if (!localState.quests) localState.quests = {};
                localState.quests[action.questId] = { step: 0, started: Date.now() };
                if (db) {
                    const [qr] = await db.query("SELECT name FROM game_quests WHERE id=?", [action.questId]);
                    const qn = qr.length ? qr[0].name : 'Unknown Quest';
                    responses.push({ cmd: 'notification', text: `📜 Quest Started: ${qn}`, type: 'quest' });
                }
                break;
            }

            // ---------------------------------------------------------
            // QUEST_ADVANCE: Move quest to next step
            // { type: "QUEST_ADVANCE", questId: 1 }
            // ---------------------------------------------------------
            case 'QUEST_ADVANCE': {
                if (!localState.quests) localState.quests = {};
                const q = localState.quests[action.questId];
                if (q) {
                    q.step = (q.step || 0) + 1;
                    responses.push({ cmd: 'notification', text: '📜 Quest Updated!', type: 'quest' });
                }
                break;
            }

            // ---------------------------------------------------------
            // QUEST_COMPLETE: Finish a quest and give rewards
            // { type: "QUEST_COMPLETE", questId: 1 }
            // ---------------------------------------------------------
            case 'QUEST_COMPLETE': {
                if (!localState.quests) localState.quests = {};
                if (db) {
                    const [qr] = await db.query("SELECT * FROM game_quests WHERE id=?", [action.questId]);
                    if (qr.length) {
                        const quest = qr[0];
                        const rewards = safeJsonParse(quest.rewards_json, {});
                        // Give rewards
                        if (rewards.xp) await executeActions({ actions: [{ type: 'GIVE_XP', amount: rewards.xp }], socket, player, state: localState, db });
                        if (rewards.gold) await executeActions({ actions: [{ type: 'GIVE_GOLD', amount: rewards.gold }], socket, player, state: localState, db });
                        if (rewards.items) {
                            for (const ri of rewards.items) {
                                await executeActions({ actions: [{ type: 'GIVE_ITEM', itemId: ri.id, quantity: ri.qty || 1 }], socket, player, state: localState, db });
                            }
                        }
                        localState.quests[action.questId] = { step: -1, completed: Date.now() };
                        responses.push({ cmd: 'notification', text: `🏆 Quest Complete: ${quest.name}!`, type: 'quest_complete' });

                        // Add a rumor so NPCs across the world can learn of this deed
                        if (typeof global._addRumor === 'function' && player) {
                            await global._addRumor(db, player.charId || player.id,
                                player.name, `completed the quest "${quest.name}"`);
                        }
                    }
                }
                break;
            }

            // ---------------------------------------------------------
            // BATTLE: Start a PvE battle from a map event or NPC script.
            // { type: "BATTLE", enemyId: 5, on_win: [...actions], on_lose: [...actions] }
            //
            // TEACHING: The event runner runs server-side. After firing trigger_pve_battle,
            // we stash on_win and on_lose action lists in the socket for post-battle pickup.
            // When the battle ends, server.js reads socket._postBattleActions and replays
            // the event runner with the correct branch. This is how chaining works:
            //   { type:"BATTLE", enemyId:5, on_win:[{type:"GIVE_ITEM",itemId:3}] }
            // ---------------------------------------------------------
            case 'BATTLE': {
                if (socket && action.enemyId) {
                    // Store post-battle hooks on the socket before triggering
                    if (action.on_win  || action.on_lose) {
                        socket._postBattleActions = {
                            on_win:  action.on_win  || [],
                            on_lose: action.on_lose || []
                        };
                    }
                    socket.emit('trigger_pve_battle', { npcId: action.enemyId });
                }
                break;
            }

            // ---------------------------------------------------------
            // SOUND: Play a sound effect
            // { type: "SOUND", file: "chest_open.mp3" }
            // ---------------------------------------------------------
            case 'SOUND': {
                responses.push({ cmd: 'sound', file: action.file });
                break;
            }

            // ---------------------------------------------------------
            // SCREEN_EFFECT: Flash, fade, shake
            // { type: "SCREEN_EFFECT", effect: "shake", duration: 500 }
            // ---------------------------------------------------------
            case 'SCREEN_EFFECT': {
                responses.push({ cmd: 'screen_effect', effect: action.effect, duration: action.duration || 500 });
                break;
            }

            // ---------------------------------------------------------
            // NPC_TALK: Trigger the LLM/rule-based NPC brain
            // { type: "NPC_TALK", npcName: "Guard" }
            // Falls through to existing npc_brain.js system
            // ---------------------------------------------------------
            case 'NPC_TALK': {
                responses.push({ cmd: 'npc_talk_prompt', npcName: action.npcName });
                break;
            }

            // ---------------------------------------------------------
            // SHOP: Open a shop interface
            // { type: "SHOP", shopId: 1 }
            // ---------------------------------------------------------
            case 'SHOP': {
                responses.push({ cmd: 'open_shop', shopId: action.shopId });
                break;
            }

            // ---------------------------------------------------------
            // QUEST_BOARD: Open the quest board UI
            // { type: "QUEST_BOARD" }
            // ---------------------------------------------------------
            case 'QUEST_BOARD': {
                responses.push({ cmd: 'open_quest_board' });
                break;
            }

            // ---------------------------------------------------------
            // CONDITIONAL: Run actions only if conditions met
            // { type: "IF", conditions: [...], then: [...], else: [...] }
            // ---------------------------------------------------------
            case 'IF': {
                const context = { level: player.level, classId: player.classId, inventory: player.inventory || [] };
                const pass = checkConditions(action.conditions, localState, context);
                const branch = pass ? action.then : (action.else || []);
                if (branch && branch.length) {
                    const sub = await executeActions({ actions: branch, socket, player, state: localState, db });
                    if (sub) Object.assign(localState, sub.state);
                    if (sub && sub.halted) {
                        // Choice is pending in a branch — bubble up
                        socket.emit('event_queue', responses);
                        return { state: localState, halted: true, reason: sub.reason };
                    }
                }
                break;
            }

            // ---------------------------------------------------------
            // WAIT: Pause between actions (client-side delay)
            // { type: "WAIT", ms: 1000 }
            // ---------------------------------------------------------
            case 'WAIT': {
                responses.push({ cmd: 'wait', ms: action.ms || 1000 });
                break;
            }

            default:
                console.warn('⚠️ Unknown action type:', action.type);
        }
    }

    // Send all queued responses to the client
    if (responses.length > 0) {
        socket.emit('event_queue', responses);
    }

    // Return the modified state so the caller can save it
    return { state: localState, halted: false };
}

// --- TEMPLATE RESOLVER ---
// Replaces {player.name}, {flag:kill_count} etc in dialogue text.
function resolveTemplate(text, { player, state }) {
    if (!text) return '';
    return text
        .replace(/\{player\.name\}/gi, player.name || 'Traveler')
        .replace(/\{player\.level\}/gi, player.level || 1)
        .replace(/\{flag:(\w+)\}/gi, (_, key) => state[key] !== undefined ? state[key] : '???');
}

function safeJsonParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
}

// =================================================================
// EVENT FINDER — Finds and triggers events at a location
// =================================================================
// Called by server.js when a player steps on a tile or presses [E].
// Looks up events from the map's collisions_json, checks conditions,
// and executes the action list.

async function handleMapEvent({ triggerType, x, y, mapEvents, socket, player, state, db }) {
    if (!mapEvents || !Array.isArray(mapEvents)) return null;

    // Find matching event at this tile
    const event = mapEvents.find(e => {
        if (e.x !== x || e.y !== y) return false;

        // LEGACY SUPPORT: Old events use "type" (TELEPORT, NPC, etc)
        // New events use "trigger" (STEP_ON, INTERACT, AUTO)
        if (e.trigger) {
            return e.trigger === triggerType;
        }
        // Legacy: Map old types to triggers
        if (triggerType === 'STEP_ON' && e.type === 'TELEPORT') return true;
        if (triggerType === 'INTERACT' && (e.type === 'NPC' || e.type === 'SHOP' || e.type === 'LOOT')) return true;
        return false;
    });

    if (!event) return null;

    // --- LEGACY EVENT HANDLING ---
    // If the event has no "actions" array, convert old format to actions
    if (!event.actions) {
        const legacyActions = convertLegacyEvent(event);
        if (legacyActions) {
            const context = { level: player.level, classId: player.classId, inventory: [] };
            if (checkConditions(event.conditions, state, context)) {
                return executeActions({ actions: legacyActions, socket, player, state, db });
            }
        }
        return null;
    }

    // --- NEW EVENT HANDLING ---
    const context = { level: player.level, classId: player.classId, inventory: [] };
    if (!checkConditions(event.conditions, state, context)) return null;

    return executeActions({ actions: event.actions, socket, player, state, db });
}

// --- LEGACY CONVERTER ---
// Converts old-format events {type: "NPC", data: "Guard"} into action lists.
// This means your existing maps keep working without changes!
function convertLegacyEvent(event) {
    switch (event.type) {
        case 'TELEPORT': {
            const parts = String(event.data).split(',');
            return [{ type: 'TELEPORT', mapId: parseInt(parts[0]), x: parseInt(parts[1]) || 10, y: parseInt(parts[2]) || 10 }];
        }
        case 'NPC':
            return [{ type: 'NPC_TALK', npcName: event.data }];
        case 'SHOP':
            return [{ type: 'SHOP', shopId: parseInt(event.data) }];
        case 'LOOT':
            return [{ type: 'GIVE_ITEM', itemId: parseInt(event.data), quantity: 1 }];
        case 'ENEMY':
            return [{ type: 'BATTLE', enemyId: parseInt(event.data) }];
        case 'QUEST_BOARD':
            return [{ type: 'QUEST_BOARD' }];
        default:
            return null;
    }
}

module.exports = { executeActions, handleMapEvent, checkConditions, safeEval };
