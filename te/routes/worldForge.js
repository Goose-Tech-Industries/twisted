// =================================================================
// WORLD FORGE — AI-powered world content generator
// POST /admin/world-forge/generate  → calls Gemini, returns JSON preview
// POST /admin/world-forge/commit    → writes approved JSON to DB
// =================================================================
const express = require('express');
const router  = express.Router();

let db;
router.init = (databaseConnection) => { db = databaseConnection; };

// ---------------------------------------------------------------
// Auth middleware (re-use the pattern from admin.js)
// ---------------------------------------------------------------
function requireStaff(req, res, next) {
    if (!req.session?.userId) return res.status(401).json({ success: false, message: 'Not authenticated.' });
    next();
}

// ---------------------------------------------------------------
// GEMINI CALLER  (falls back to Ollama if no Gemini key)
// ---------------------------------------------------------------
// Rate limit tracking per provider
if (!global._aiRateTracker) global._aiRateTracker = { lastCall: 0, callCount: 0, resetAt: 0 };

// Model-based rate limits (requests per minute)
const RATE_LIMITS = {
    'gemini-1.5-flash': 15,      // Free tier
    'gemini-1.5-pro': 2,         // Free tier
    'gemini-2.0-flash': 15,      // Free tier
    'default-gemini': 15,        // Unknown model fallback
    'ollama': 999,               // No limit for local
    'openai': 60,                // Paid tier
};

function getModelRateLimit(model) {
    return RATE_LIMITS[model] || RATE_LIMITS['default-gemini'];
}

async function waitForRateLimit(model) {
    const tracker = global._aiRateTracker;
    const rpm = getModelRateLimit(model);
    const minInterval = Math.ceil(60000 / rpm); // ms between calls

    const now = Date.now();
    // Reset counter every minute
    if (now > tracker.resetAt) {
        tracker.callCount = 0;
        tracker.resetAt = now + 60000;
    }

    // If we've hit the limit, wait
    if (tracker.callCount >= rpm) {
        const waitMs = tracker.resetAt - now;
        if (waitMs > 0) {
            console.log(`[WorldForge] Rate limited (${rpm} RPM for ${model}), waiting ${Math.ceil(waitMs/1000)}s...`);
            await new Promise(r => setTimeout(r, waitMs + 1000));
            tracker.callCount = 0;
            tracker.resetAt = Date.now() + 60000;
        }
    }

    // Enforce minimum interval between calls
    const elapsed = now - tracker.lastCall;
    if (elapsed < minInterval) {
        await new Promise(r => setTimeout(r, minInterval - elapsed));
    }

    tracker.lastCall = Date.now();
    tracker.callCount++;
}

async function callAI(prompt) {
    let dbApiKey = '', dbModel = '', dbProvider = '';
    if (db) {
        try {
            const [rows] = await db.query(
                "SELECT setting_key, setting_value FROM game_settings WHERE setting_key IN ('ai_provider','ai_api_key','ai_model')");
            for (const r of rows) {
                if (r.setting_key === 'ai_api_key') dbApiKey = r.setting_value;
                if (r.setting_key === 'ai_model') dbModel = r.setting_value;
                if (r.setting_key === 'ai_provider') dbProvider = r.setting_value;
            }
        } catch {}
    }

    const geminiKey = dbApiKey || process.env.GEMINI_API_KEY;
    if (geminiKey && (dbProvider === 'gemini' || dbProvider === '' || !dbProvider || process.env.GEMINI_API_KEY)) {
        const model = dbModel || process.env.GEMINI_MODEL || 'gemini-1.5-flash';

        // Wait for rate limit before calling
        await waitForRateLimit(model);

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        let retries = 0;
        while (retries < 3) {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.9, maxOutputTokens: 8192 }
                })
            });
            if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get('Retry-After') || '30');
                console.log(`[WorldForge] Gemini 429 — waiting ${retryAfter}s (retry ${retries + 1}/3)`);
                await new Promise(r => setTimeout(r, retryAfter * 1000));
                retries++;
                continue;
            }
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
            }
            const json = await res.json();
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            return cleanJSON(text);
        }
        throw new Error('Gemini rate limit exceeded after 3 retries. Wait a minute and try again.');
    }

    // Ollama fallback
    if (process.env.NPC_LLM_URL) {
        await waitForRateLimit('ollama');
        const model = process.env.NPC_LLM_MODEL || 'llama3';
        const res = await fetch(process.env.NPC_LLM_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt, stream: false })
        });
        if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
        const json = await res.json();
        return cleanJSON(String(json.response || json.text || ''));
    }

    throw new Error('No AI provider configured. Set GEMINI_API_KEY or NPC_LLM_URL in .env, or configure in AdminSauce Settings.');
}

// Strip markdown fences, extract JSON object or array
function cleanJSON(raw) {
    let s = raw.trim();
    s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    // Find first { or [
    const start = Math.min(
        s.indexOf('{') === -1 ? Infinity : s.indexOf('{'),
        s.indexOf('[') === -1 ? Infinity : s.indexOf('[')
    );
    if (start === Infinity) throw new Error('No JSON found in AI response');
    s = s.slice(start);
    // Find matching close
    const open = s[0], close = open === '{' ? '}' : ']';
    let depth = 0, end = -1;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === open) depth++;
        else if (s[i] === close) { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) throw new Error('Unterminated JSON in AI response');
    return JSON.parse(s.slice(0, end + 1));
}

// ---------------------------------------------------------------
// PROMPT BUILDERS
// ---------------------------------------------------------------
const SHARED_RULES = `
RULES — CRITICAL:
- Respond with ONLY a valid JSON object. No markdown. No explanation. No text outside the JSON.
- All string values must be escaped properly.
- Use plain emoji for all "icon" fields (1 character).
- Keep all text concise but evocative. Dark Celtic fantasy tone.
- Never use quotes inside quotes without escaping.
`;

function promptTown({ biome, size, theme }) {
    const npcCount  = size === 'hamlet' ? 3 : size === 'village' ? 5 : size === 'town' ? 7 : 10;
    const shopCount = size === 'hamlet' ? 1 : size === 'village' ? 2 : 3;
    return `${SHARED_RULES}
You are a game world generator for a dark Celtic fantasy RPG called Twisted Engine.
Generate a ${size} (${biome} biome) with the theme: "${theme}".

Return a JSON object with this EXACT structure:
{
  "map": {
    "name": "...",
    "description": "...",
    "width": 24,
    "height": 24,
    "ambient_dark": 0.3,
    "min_level": 1,
    "is_active": 1
  },
  "npcs": [
    {
      "name": "...",
      "icon": "👤",
      "persona": "...",
      "is_enemy": 0,
      "move_type": "STATIONARY",
      "x": 8, "y": 8,
      "shop_name": null,
      "quest_ids": []
    }
  ],
  "enemies": [
    {
      "name": "...",
      "icon": "👹",
      "persona": "...",
      "is_enemy": 1,
      "move_type": "WANDER",
      "x": 15, "y": 15,
      "drop_table_json": [{"item_id": null, "chance": 60, "min_qty": 1, "max_qty": 2}]
    }
  ],
  "shops": [
    {
      "name": "...",
      "icon": "🏪",
      "description": "...",
      "items": [
        {"name": "...", "icon": "...", "type": "WEAPON", "value": 120, "description": "...",
         "bonus_atk": 5, "bonus_def": 0, "bonus_hp": 0, "bonus_mp": 0,
         "bonus_mo": 0, "bonus_md": 0, "bonus_speed": 0, "bonus_luck": 0,
         "level_req": 1, "buy_price": 120, "sell_price": 40}
      ]
    }
  ],
  "quests": [
    {
      "quest_id": "...",
      "title": "...",
      "description": "...",
      "quest_type": "side",
      "required_level": 1,
      "is_repeatable": 0,
      "objectives_json": [{"type": "kill", "target": "...", "count": 5, "label": "Kill 5 ..."}],
      "rewards_json": {"xp": 200, "gold": 50, "items": []}
    }
  ]
}

Generate: ${npcCount} NPCs, 2-3 enemies, ${shopCount} shops with 3-5 items each, 2-3 quests.
Spread NPCs across different x/y positions (1-22 range). Make everything thematically consistent with: ${theme}.`;
}

function promptNPCs({ count, role, theme, is_enemy }) {
    const type = is_enemy ? 'enemy' : 'NPC';
    return `${SHARED_RULES}
You are a character generator for a dark Celtic fantasy RPG called Twisted Engine.
Generate ${count} ${type}(s) with role "${role}" and theme "${theme}".

Return a JSON object:
{
  "npcs": [
    {
      "name": "...",
      "icon": "${is_enemy ? '👹' : '👤'}",
      "persona": "A 2-3 sentence description of their personality, history, and speech patterns.",
      "is_enemy": ${is_enemy ? 1 : 0},
      "move_type": "${is_enemy ? 'WANDER' : 'STATIONARY'}",
      "wander_radius": 3,
      "x": 5, "y": 5,
      "drop_table_json": ${is_enemy ? '[{"item_id": null, "chance": 50, "min_qty": 1, "max_qty": 1}]' : 'null'}
    }
  ]
}`;
}

function promptQuestChain({ theme, length, required_level }) {
    return `${SHARED_RULES}
You are a quest writer for a dark Celtic fantasy RPG called Twisted Engine.
Generate a quest chain of ${length} linked quests with theme "${theme}".
Each quest should build narratively on the previous one.

Return a JSON object:
{
  "quests": [
    {
      "quest_id": "qchain_${Date.now()}_1",
      "title": "...",
      "description": "2-3 sentence quest description with mystery and stakes.",
      "quest_type": "main",
      "required_level": ${required_level},
      "is_repeatable": 0,
      "objectives_json": [
        {"type": "kill", "target": "...", "count": 3, "label": "..."},
        {"type": "collect", "item": "...", "count": 1, "label": "..."}
      ],
      "rewards_json": {"xp": 300, "gold": 100, "items": []}
    }
  ]
}

The quest_ids should be sequential like qchain_TIMESTAMP_1, qchain_TIMESTAMP_2, etc.
Make the objectives escalate in difficulty across the chain.`;
}

function promptFullWorld({ theme }) {
    return `${SHARED_RULES}
You are a world generator for a dark Celtic fantasy RPG called Twisted Engine.
Generate a COMPLETE starter world with the theme: "${theme}".

Return a JSON object with this EXACT structure:
{
  "map": {
    "name": "...",
    "description": "2-3 evocative sentences describing the location, its atmosphere, and dark secret.",
    "width": 30,
    "height": 30,
    "ambient_dark": 0.4,
    "min_level": 1,
    "is_active": 1
  },
  "npcs": [
    {
      "name": "...", "icon": "👤",
      "persona": "2-3 sentence persona with speech pattern hints.",
      "is_enemy": 0, "move_type": "STATIONARY", "x": 8, "y": 8
    }
  ],
  "enemies": [
    {
      "name": "...", "icon": "👹",
      "persona": "Brief description of this creature's nature.",
      "is_enemy": 1, "move_type": "WANDER", "x": 20, "y": 15,
      "drop_table_json": [{"item_id": null, "chance": 60, "min_qty": 1, "max_qty": 2}]
    }
  ],
  "shops": [
    {
      "name": "...", "icon": "🏪", "description": "...",
      "items": [
        {"name": "...", "icon": "⚔️", "type": "WEAPON", "description": "...", "value": 150,
         "bonus_atk": 8, "bonus_def": 0, "bonus_hp": 0, "bonus_mp": 0,
         "bonus_mo": 0, "bonus_md": 0, "bonus_speed": 0, "bonus_luck": 0,
         "level_req": 1, "buy_price": 150, "sell_price": 50}
      ]
    }
  ],
  "quests": [
    {
      "quest_id": "starter_${Date.now()}_1",
      "title": "...", "description": "...",
      "quest_type": "main", "required_level": 1, "is_repeatable": 0,
      "objectives_json": [{"type": "kill", "target": "...", "count": 5, "label": "..."}],
      "rewards_json": {"xp": 250, "gold": 75, "items": []}
    }
  ]
}

Generate: 5 NPCs, 3 enemies, 2 shops with 4-5 items each, 3 quests.
Make EVERYTHING thematically unified and narratively interesting. Theme: ${theme}`;
}

// ---------------------------------------------------------------
// GENERATE ENDPOINT
// ---------------------------------------------------------------
router.post('/generate', requireStaff, async (req, res) => {
    const { mode, params } = req.body;
    if (!mode || !params) return res.json({ success: false, message: 'Missing mode or params.' });

    // Inject lore bible into all prompts
    const loreBible = (req.body.loreBible || '').trim();
    const LORE_PREFIX = loreBible
        ? `\nWORLD LORE (CRITICAL — use this as canonical truth for all generated content):\n${loreBible}\n`
        : '';

    let prompt;
    try {
        switch (mode) {
            case 'town':        prompt = promptTown(params); prompt = LORE_PREFIX + prompt;            break;
            case 'npcs':        prompt = promptNPCs(params); prompt = LORE_PREFIX + prompt;            break;
            case 'quest_chain': prompt = promptQuestChain(params); prompt = LORE_PREFIX + prompt;      break;
            case 'full_world':  prompt = promptFullWorld(params); prompt = LORE_PREFIX + prompt;       break;
            default: return res.json({ success: false, message: `Unknown mode: ${mode}` });
        }
        const data = await callAI(prompt);
        res.json({ success: true, data, mode });
    } catch (err) {
        console.error('[WorldForge] Generate error:', err.message);
        res.json({
            success: false,
            message: err.message,
            isRateLimit: err.isRateLimit || false
        });
    }
});

// ---------------------------------------------------------------
// COMMIT ENDPOINT — writes approved data to DB in dependency order
// ---------------------------------------------------------------
router.post('/commit', requireStaff, async (req, res) => {
    const { data, mode, targetMapId, loreBible } = req.body;
    if (!data) return res.json({ success: false, message: 'No data to commit.' });

    const conn = await db.getConnection();
    const log  = [];
    try {
        await conn.beginTransaction();

        // 1. MAP
        let mapId = targetMapId || null;
        if (data.map && !targetMapId) {
            const [mr] = await conn.query('INSERT INTO game_maps SET ?', [{
                name:          data.map.name        || 'Generated Map',
                description:   data.map.description || '',
                width:         data.map.width        || 24,
                height:        data.map.height       || 24,
                ambient_dark:  data.map.ambient_dark || 0,
                min_level:     data.map.min_level    || 1,
                is_active:     data.map.is_active    ?? 1
            }]);
            mapId = mr.insertId;
            log.push(`✅ Map created: "${data.map.name}" (id: ${mapId})`);
        }

        // 2. ITEMS (from shop definitions) — insert first so we have their IDs
        const itemIdMap = {}; // name → db id
        if (data.shops) {
            for (const shop of data.shops) {
                if (!shop.items) continue;
                for (const item of shop.items) {
                    const [ir] = await conn.query('INSERT INTO game_items SET ?', [{
                        name:         item.name        || 'Item',
                        description:  item.description || '',
                        type:         item.type        || 'MISC',
                        icon:         item.icon        || '📦',
                        value:        item.value       || 0,
                        bonus_hp:     item.bonus_hp    || 0,
                        bonus_mp:     item.bonus_mp    || 0,
                        bonus_atk:    item.bonus_atk   || 0,
                        bonus_def:    item.bonus_def   || 0,
                        bonus_mo:     item.bonus_mo    || 0,
                        bonus_md:     item.bonus_md    || 0,
                        bonus_speed:  item.bonus_speed || 0,
                        bonus_luck:   item.bonus_luck  || 0,
                        level_req:    item.level_req   || 1,
                    }]);
                    itemIdMap[item.name] = ir.insertId;
                    log.push(`  📦 Item: "${item.name}" (id: ${ir.insertId})`);
                }
            }
        }

        // 3. SHOPS
        const shopIdMap = {}; // name → db id
        if (data.shops) {
            for (const shop of data.shops) {
                const [sr] = await conn.query('INSERT INTO game_shops SET ?', [{
                    name:        shop.name        || 'Shop',
                    description: shop.description || '',
                    icon:        shop.icon        || '🏪',
                    map_id:      mapId
                }]);
                shopIdMap[shop.name] = sr.insertId;
                log.push(`✅ Shop: "${shop.name}" (id: ${sr.insertId})`);

                // Shop supplies
                for (const item of (shop.items || [])) {
                    const iid = itemIdMap[item.name];
                    if (!iid) continue;
                    await conn.query('INSERT IGNORE INTO game_shop_supplies SET ?', [{
                        shop_id:    sr.insertId,
                        item_id:    iid,
                        buy_price:  item.buy_price  || item.value || 100,
                        sell_price: item.sell_price || Math.floor((item.value || 50) * 0.4),
                        stock:      -1
                    }]);
                }
            }
        }

        // 4. NPCs (friendly)
        const allNPCs = [...(data.npcs || []), ...(data.enemies || [])];
        for (const npc of allNPCs) {
            // Link shop if name matches
            let shopId = null;
            if (!npc.is_enemy && npc.shop_name && shopIdMap[npc.shop_name]) {
                shopId = shopIdMap[npc.shop_name];
            }
            // Build quest_offers_json from quest_ids field (AI provides these)
            let questOffersJson = null;
            if (Array.isArray(npc.quest_ids) && npc.quest_ids.length) {
                questOffersJson = JSON.stringify(npc.quest_ids);
            }

            await conn.query('INSERT INTO game_npcs SET ?', [{
                name:              npc.name           || 'NPC',
                persona:           npc.persona        || '',
                icon:              npc.icon           || (npc.is_enemy ? '👹' : '👤'),
                map_id:            mapId,
                x:                 npc.x              || 5,
                y:                 npc.y              || 5,
                is_enemy:          npc.is_enemy       || 0,
                move_type:         npc.move_type      || 'STATIONARY',
                wander_radius:     npc.wander_radius  || 3,
                shop_id:           shopId,
                quest_offers_json: questOffersJson,
                drop_table_json:   npc.drop_table_json
                    ? JSON.stringify(npc.drop_table_json).replace(/"item_id":\s*null/g, '"item_id":null')
                    : null
            }]);
            log.push(`  ${npc.is_enemy ? '👹' : '👤'} NPC: "${npc.name}"${shopId ? ' 🏪' : ''}${questOffersJson ? ' 📜' : ''}`);
        }

        // 5. QUESTS
        for (const quest of (data.quests || [])) {
            const qid = quest.quest_id || `forge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            try {
                await conn.query('INSERT INTO quest_definitions SET ?', [{
                    quest_id:     qid,
                    title:        quest.title        || 'Quest',
                    description:  quest.description  || '',
                    quest_type:   quest.quest_type   || 'side',
                    required_level: quest.required_level || 1,
                    is_repeatable: quest.is_repeatable ?? 0,
                    repeat_cooldown_hours: 0,
                    objectives_json: JSON.stringify(quest.objectives_json || []),
                    rewards_json:    JSON.stringify(quest.rewards_json    || {}),
                    is_active: 1
                }]);
                log.push(`  📜 Quest: "${quest.title}"`);
            } catch (qErr) {
                // quest_definitions table might not exist, try game_quests
                try {
                    await conn.query('INSERT INTO game_quests SET ?', [{
                        name:           quest.title       || 'Quest',
                        description:    quest.description || '',
                        objectives_json:JSON.stringify(quest.objectives_json || []),
                        rewards_json:   JSON.stringify(quest.rewards_json    || {}),
                        is_active: 1
                    }]);
                    log.push(`  📜 Quest (game_quests): "${quest.title}"`);
                } catch (q2Err) { log.push(`  ⚠️ Quest skipped (table missing): ${quest.title}`); }
            }
        }

        await conn.commit();
        res.json({ success: true, mapId, log, message: `World committed! ${log.length} records created.` });
    } catch (err) {
        await conn.rollback();
        console.error('[WorldForge] Commit error:', err);
        res.json({ success: false, message: err.message, log });
    } finally {
        conn.release();
    }
});

module.exports = router;
