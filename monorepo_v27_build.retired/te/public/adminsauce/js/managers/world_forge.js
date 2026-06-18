// =================================================================
// WORLD FORGE — AI World Generator for AdminSauce
// =================================================================
// Four modes:
//   🏘️  Generate Town      biome + size + theme
//   👤  Generate NPCs      count + role + type
//   📜  Generate Quests    theme + chain length
//   🌍  Full Starter World everything in one shot
//
// Flow: Fill inputs → Generate (calls Gemini) → Preview cards →
//       Edit if needed → Commit to DB → Done
// =================================================================

const WorldForge = {
    _lastResult: null,
    _lastMode:   null,
    _loreBible: localStorage.getItem('wf_lore_bible') || '',  // overwritten from DB on init
    _targetMapId: null,  // if set, commit drops content into existing map instead of creating new

    init() {
        document.getElementById('managerTitle').textContent = '🌍 World Forge';
        document.getElementById('dynamicArea').innerHTML = WorldForge._homeHTML();
        // Load lore bible from DB (authoritative — shared across all GMs)
        fetch('/admin-panel/lore-bible').then(r => r.json()).then(d => {
            if (d.success && d.value != null) {
                WorldForge._loreBible = d.value;
                localStorage.setItem('wf_lore_bible', d.value);
                const el = document.getElementById('wf_lore_bible');
                if (el) el.value = d.value;
            }
        }).catch(() => { /* localStorage fallback already set */ });
    },

    // ---------------------------------------------------------------
    // HOME — four generator cards
    // ---------------------------------------------------------------
    _homeHTML() {
        return `
        <style>
        .wf-grid     { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px; }
        .wf-card     { background:#0d1117; border:1px solid #30363d; border-radius:12px; padding:20px; }
        .wf-card:hover { border-color:#bb86fc; }
        .wf-title    { font-size:13px; font-weight:700; letter-spacing:1px; text-transform:uppercase; margin-bottom:14px; }
        .wf-btn      { width:100%; padding:12px; border:none; border-radius:8px; font-size:14px; font-weight:700;
                       cursor:pointer; margin-top:12px; letter-spacing:.5px; transition:.15s; }
        .wf-btn:hover{ opacity:.85; transform:translateY(-1px); }
        .wf-btn-town { background:linear-gradient(135deg,#1565C0,#0D47A1); color:#fff; }
        .wf-btn-npc  { background:linear-gradient(135deg,#2E7D32,#1B5E20); color:#fff; }
        .wf-btn-quest{ background:linear-gradient(135deg,#F57F17,#E65100); color:#fff; }
        .wf-btn-world{ background:linear-gradient(135deg,#6A1B9A,#4A148C); color:#fff; box-shadow:0 0 20px rgba(106,27,154,.4); }
        .wf-ai-badge { display:inline-block; background:rgba(187,134,252,.15); color:#bb86fc;
                       border:1px solid rgba(187,134,252,.3); border-radius:20px; font-size:10px;
                       padding:2px 10px; margin-bottom:16px; letter-spacing:1px; }
        </style>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
            <div>
                <h2 style="margin:0;font-size:20px;color:#bb86fc">🌍 World Forge</h2>
                <p style="color:#484f58;font-size:12px;margin-top:4px">AI-powered content generator. Preview everything before it touches your database.</p>
            </div>
            <span class="wf-ai-badge">✨ GEMINI POWERED</span>
        </div>

        <div class="wf-grid">

            <!-- TOWN GENERATOR -->
            <div class="wf-card">
                <div class="wf-title" style="color:#42A5F5">🏘️ Generate Town</div>
                <label>Biome</label>
                <select id="wf_town_biome">
                    <option>dark forest</option><option>coastal village</option>
                    <option>mountain settlement</option><option>swamp hamlet</option>
                    <option>desert outpost</option><option>underground cavern</option>
                    <option>haunted ruins</option><option>volcanic highlands</option>
                </select>
                <label>Size</label>
                <select id="wf_town_size">
                    <option value="hamlet">Hamlet (3 NPCs, 1 shop)</option>
                    <option value="village" selected>Village (5 NPCs, 2 shops)</option>
                    <option value="town">Town (7 NPCs, 3 shops)</option>
                    <option value="city">City (10 NPCs, 3 shops)</option>
                </select>
                <label>Theme / Dark Secret</label>
                <input id="wf_town_theme" placeholder="e.g. cursed by a sleeping god, all livestock gone missing" value="medieval village hiding a blood cult under the chapel">
                <button class="wf-btn wf-btn-town" onclick="WorldForge.generate('town')">
                    ⚡ Generate Town
                </button>
            </div>

            <!-- NPC / ENEMY GENERATOR -->
            <div class="wf-card">
                <div class="wf-title" style="color:#66BB6A">👤 Generate NPCs / Enemies</div>
                <label>Type</label>
                <select id="wf_npc_type">
                    <option value="0">Friendly NPCs</option>
                    <option value="1">Enemies / Creatures</option>
                </select>
                <label>Role / Archetype</label>
                <input id="wf_npc_role" placeholder="e.g. blacksmith, wandering merchant, corrupted knight" value="mysterious tavern keeper">
                <label>Count</label>
                <select id="wf_npc_count">
                    <option value="1">1</option><option value="3" selected>3</option>
                    <option value="5">5</option><option value="8">8</option>
                </select>
                <label>Flavour Theme</label>
                <input id="wf_npc_theme" placeholder="e.g. celtic mythology, undead plague, shadow magic" value="celtic mythology, touched by the Otherworld">
                <button class="wf-btn wf-btn-npc" onclick="WorldForge.generate('npcs')">
                    ⚡ Generate NPCs
                </button>
            </div>

            <!-- QUEST CHAIN GENERATOR -->
            <div class="wf-card">
                <div class="wf-title" style="color:#FFA726">📜 Generate Quest Chain</div>
                <label>Theme</label>
                <input id="wf_quest_theme" placeholder="e.g. corruption spreading from an ancient barrow" value="a missing child who walked into the forest and came back wrong">
                <label>Chain Length</label>
                <select id="wf_quest_length">
                    <option value="2">2 quests (short arc)</option>
                    <option value="3" selected>3 quests (full arc)</option>
                    <option value="4">4 quests (extended)</option>
                </select>
                <label>Starting Level Requirement</label>
                <input type="number" id="wf_quest_level" value="1" min="1" max="99">
                <button class="wf-btn wf-btn-quest" onclick="WorldForge.generate('quest_chain')">
                    ⚡ Generate Quest Chain
                </button>
            </div>

            <!-- FULL STARTER WORLD -->
            <div class="wf-card" style="border-color:rgba(106,27,154,.5);background:rgba(106,27,154,.05)">
                <div class="wf-title" style="color:#CE93D8">🌍 Full Starter World</div>
                <p style="color:#666;font-size:12px;margin-bottom:14px;line-height:1.5">
                    Generates a complete package: 1 map + 5 NPCs + 3 enemies + 2 shops + starter items + 3 quests.
                    One click, entire world.
                </p>
                <label>World Theme</label>
                <textarea id="wf_world_theme" rows="3" placeholder="Describe your world..."
                    style="resize:vertical">A dying coastal town where the fishermen started returning from the sea changed — speaking in dead languages, their eyes the colour of deep water.</textarea>
                <button class="wf-btn wf-btn-world" onclick="WorldForge.generate('full_world')">
                    🌍 Forge Full World
                </button>
            </div>

        </div>

        <!-- LORE BIBLE -->
        <div style="background:#0d1117;border:1px solid #30363d;border-radius:12px;padding:20px;margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <div>
                    <div style="font-size:13px;font-weight:700;color:#d29922">📖 Lore Bible</div>
                    <div style="font-size:11px;color:#484f58;margin-top:2px">Injected into every generation prompt. Describe your world's rules, tone, lore, and canon.</div>
                </div>
                <button class="edit-btn" onclick="WorldForge._saveLore()" style="white-space:nowrap">💾 Save</button>
            </div>
            <textarea id="wf_lore_bible" rows="3" placeholder="e.g. The world is called Tír na nÓg. Magic comes from Blood Oghams carved into weapons. The Old Gods are real, angry, and sleeping. The Celtic pantheon is corrupted. Tone: dark, gothic, weary. No elves. No generic fantasy."
                style="resize:vertical">${WorldForge._loreBible||''}</textarea>
            <div id="wf_lore_saved" style="font-size:11px;color:#3fb950;display:none;margin-top:4px">✅ Saved</div>
        </div>

        <div id="wf_status" style="display:none"></div>
        <div id="wf_preview"></div>`;
    },

    _saveLore() {
        const val = document.getElementById('wf_lore_bible')?.value || '';
        WorldForge._loreBible = val;
        localStorage.setItem('wf_lore_bible', val);
        // Also persist to DB so all GMs share the same bible
        fetch('/admin-panel/lore-bible', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: val })
        }).catch(() => {}); // silent — localStorage already saved
        const el = document.getElementById('wf_lore_saved');
        if (el) { el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 2000); }
    },

    // ---------------------------------------------------------------
    // GENERATE — calls backend, shows preview
    // ---------------------------------------------------------------
    async generate(mode) {
        const status = document.getElementById('wf_status');
        if (status) { status.style.display = 'block'; status.innerHTML = WorldForge._loadingHTML(mode); }
        document.getElementById('wf_preview').innerHTML = '';

        let params = {};
        try {
            switch (mode) {
                case 'town':
                    params = {
                        biome: document.getElementById('wf_town_biome').value,
                        size:  document.getElementById('wf_town_size').value,
                        theme: document.getElementById('wf_town_theme').value
                    };
                    break;
                case 'npcs':
                    params = {
                        count:     parseInt(document.getElementById('wf_npc_count').value),
                        role:      document.getElementById('wf_npc_role').value,
                        theme:     document.getElementById('wf_npc_theme').value,
                        is_enemy:  parseInt(document.getElementById('wf_npc_type').value)
                    };
                    break;
                case 'quest_chain':
                    params = {
                        theme:         document.getElementById('wf_quest_theme').value,
                        length:        parseInt(document.getElementById('wf_quest_length').value),
                        required_level:parseInt(document.getElementById('wf_quest_level').value)
                    };
                    break;
                case 'full_world':
                    params = { theme: document.getElementById('wf_world_theme').value };
                    break;
            }

            const r = await fetch('/admin/world-forge/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode, params, loreBible: WorldForge._loreBible })
            });
            const data = await r.json();

            if (!data.success) {
                const isRL = data.isRateLimit;
                status.innerHTML = `<div style="background:rgba(${isRL?'210,153,34':'248,81,73'},.1);border:1px solid ${isRL?'#d29922':'#f85149'};border-radius:8px;padding:16px;color:${isRL?'#d29922':'#f85149'}">
                    ${isRL ? '⏳ <b>Gemini rate limit reached.</b><br><span style="font-size:12px;font-weight:normal">The free tier has a per-minute/daily cap. Wait ~60 seconds and try again.<br>Or set <code style="background:#161b22;padding:1px 4px;border-radius:3px">NPC_LLM_URL</code> in your .env for an Ollama fallback.</span>' : '❌ ' + data.message}
                    ${!isRL && data.message && data.message.includes('GEMINI') ? '<br><br><small>Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" style="color:#bb86fc">aistudio.google.com/apikey</a></small>' : ''}
                </div>`;
                return;
            }

            WorldForge._lastResult = data.data;
            WorldForge._lastMode   = mode;
            status.style.display = 'none';
            WorldForge._showPreview(data.data, mode);

        } catch (err) {
            status.innerHTML = `<div style="background:rgba(248,81,73,.1);border:1px solid #f85149;border-radius:8px;padding:16px;color:#f85149">
                ❌ Error: ${err.message}</div>`;
        }
    },

    _loadingHTML(mode) {
        const labels = { town:'town', npcs:'NPCs', quest_chain:'quest chain', full_world:'full world' };
        return `
        <div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:24px;text-align:center;margin-bottom:20px">
            <div style="font-size:32px;margin-bottom:12px;animation:spin 2s linear infinite;display:inline-block">⚙️</div>
            <div style="color:#bb86fc;font-size:14px;font-weight:600">Forging ${labels[mode] || mode}...</div>
            <div style="color:#484f58;font-size:12px;margin-top:6px">Gemini is generating your world content. This takes 5–15 seconds.</div>
            <style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>
        </div>`;
    },

    // ---------------------------------------------------------------
    // PREVIEW — renders cards for each generated entity
    // ---------------------------------------------------------------
    _showPreview(data, mode) {
        const el = document.getElementById('wf_preview');
        let html = `
        <style>
        .wf-preview-header{ display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;
            background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px; }
        .wf-section { margin-bottom:24px; }
        .wf-section-title { font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;
            color:#484f58;margin-bottom:10px;display:flex;align-items:center;gap:8px; }
        .wf-section-title::after { content:'';flex:1;height:1px;background:#21262d; }
        .wf-entity-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px; }
        .wf-entity { background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:14px;
            transition:border-color .15s; }
        .wf-entity:hover { border-color:#30363d; }
        .wf-entity-name { font-weight:700;color:#e8eef6;margin-bottom:4px; }
        .wf-entity-sub  { font-size:11px;color:#484f58;margin-bottom:6px; }
        .wf-entity-desc { font-size:12px;color:#8b949e;line-height:1.5; }
        .wf-commit-btn  { background:linear-gradient(135deg,#388E3C,#1B5E20);color:#fff;border:none;
            padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;
            letter-spacing:.5px;transition:.15s; }
        .wf-commit-btn:hover { opacity:.9;transform:translateY(-1px); }
        .wf-edit-btn    { background:#161b22;color:#8b949e;border:1px solid #30363d;
            padding:14px 20px;border-radius:8px;font-size:13px;cursor:pointer;transition:.15s; }
        .wf-edit-btn:hover { border-color:#bb86fc;color:#bb86fc; }
        .wf-stat-pill { display:inline-block;background:#161b22;border:1px solid #21262d;
            border-radius:4px;font-size:10px;padding:2px 7px;margin:1px;color:#8b949e;font-family:monospace; }
        </style>

        <div class="wf-preview-header">
            <div>
                <div style="font-size:16px;font-weight:700;color:#3fb950;margin-bottom:4px">✅ Content Generated — Review Before Committing</div>
                <div style="font-size:12px;color:#484f58">Everything below is a preview. Nothing is in your database yet. Edit the JSON or commit directly.</div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end">
                <button class="wf-edit-btn" onclick="WorldForge._showRawEditor()">✏️ Edit JSON</button>
                <button class="wf-edit-btn" onclick="WorldForge.init()">🔄 Start Over</button>
                <button class="wf-edit-btn" onclick="WorldForge._showMapPicker()" style="border-color:#d29922;color:#d29922">🗺️ Target Map</button>
                <button class="wf-commit-btn" onclick="WorldForge.commit()">💾 Commit to Database</button>
            </div>
        </div>`;

        // MAP
        if (data.map) {
            html += `<div class="wf-section">
                <div class="wf-section-title">🗺️ Map</div>
                <div class="wf-entity" style="border-color:rgba(66,165,245,.3)">
                    <div class="wf-entity-name" style="font-size:16px">${data.map.name}</div>
                    <div class="wf-entity-desc">${data.map.description || ''}</div>
                    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
                        <span class="wf-stat-pill">📐 ${data.map.width}×${data.map.height}</span>
                        <span class="wf-stat-pill">🔦 dark: ${data.map.ambient_dark}</span>
                        <span class="wf-stat-pill">⚔️ min lv: ${data.map.min_level}</span>
                    </div>
                </div>
            </div>`;
        }

        // NPCS
        const friendlyNPCs = data.npcs || [];
        if (friendlyNPCs.length) {
            html += `<div class="wf-section"><div class="wf-section-title">👥 NPCs (${friendlyNPCs.length})</div>
                <div class="wf-entity-grid">`;
            for (const npc of friendlyNPCs) {
                const npcIdx = friendlyNPCs.indexOf(npc);
                html += `<div class="wf-entity">
                    <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">
                        <span style="font-size:24px">${npc.icon||'👤'}</span>
                        <div style="flex:1"><div class="wf-entity-name">${npc.name}</div>
                        <div class="wf-entity-sub">${npc.move_type} • pos (${npc.x},${npc.y})${npc.shop_name?' 🏪 '+npc.shop_name:''}</div></div>
                        <button onclick="WorldForge._regenEntity('npc',${npcIdx})" title="Regenerate this NPC"
                            style="background:none;border:1px solid #30363d;color:#484f58;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;white-space:nowrap">🔄</button>
                    </div>
                    <div class="wf-entity-desc">${npc.persona||''}</div>
                </div>`;
            }
            html += '</div></div>';
        }

        // ENEMIES
        const enemies = data.enemies || [];
        if (enemies.length) {
            html += `<div class="wf-section"><div class="wf-section-title">👹 Enemies (${enemies.length})</div>
                <div class="wf-entity-grid">`;
            for (const npc of enemies) {
                html += `<div class="wf-entity" style="border-color:rgba(248,81,73,.2)">
                    <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">
                        <span style="font-size:24px">${npc.icon||'👹'}</span>
                        <div><div class="wf-entity-name" style="color:#f85149">${npc.name}</div>
                        <div class="wf-entity-sub">${npc.move_type} • pos (${npc.x},${npc.y})</div></div>
                    </div>
                    <div class="wf-entity-desc">${npc.persona||''}</div>
                </div>`;
            }
            html += '</div></div>';
        }

        // SHOPS + ITEMS
        if (data.shops && data.shops.length) {
            html += `<div class="wf-section"><div class="wf-section-title">🏪 Shops & Items (${data.shops.length} shops, ${data.shops.reduce((a,s)=>a+(s.items||[]).length,0)} items)</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">`;
            for (const shop of data.shops) {
                html += `<div class="wf-entity" style="border-color:rgba(255,167,38,.2)">
                    <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
                        <span style="font-size:20px">${shop.icon||'🏪'}</span>
                        <div><div class="wf-entity-name">${shop.name}</div>
                        <div class="wf-entity-sub">${shop.description||''}</div></div>
                    </div>`;
                for (const item of (shop.items||[])) {
                    const stats = ['atk','def','hp','mp','mo','md','speed','luck']
                        .filter(s => (item[`bonus_${s}`]||0) !== 0)
                        .map(s => `+${item[`bonus_${s}`]} ${s.toUpperCase()}`).join(' ');
                    html += `<div style="display:flex;justify-content:space-between;align-items:center;
                        padding:6px 8px;background:#161b22;border-radius:6px;margin-bottom:4px;font-size:12px">
                        <span>${item.icon||'📦'} <b style="color:#e8eef6">${item.name}</b>
                            ${stats ? `<small style="color:#d29922;margin-left:6px">${stats}</small>` : ''}
                        </span>
                        <span style="color:#3fb950;font-weight:700;white-space:nowrap">💰 ${item.buy_price||item.value||0}g</span>
                    </div>`;
                }
                html += `</div>`;
            }
            html += '</div></div>';
        }

        // QUESTS
        if (data.quests && data.quests.length) {
            html += `<div class="wf-section"><div class="wf-section-title">📜 Quests (${data.quests.length})</div>
                <div class="wf-entity-grid">`;
            for (const q of data.quests) {
                const rewards = q.rewards_json || {};
                html += `<div class="wf-entity" style="border-color:rgba(255,167,38,.2)">
                    <div class="wf-entity-name">📜 ${q.title}</div>
                    <div class="wf-entity-sub">lv${q.required_level}+ · ${q.quest_type}</div>
                    <div class="wf-entity-desc" style="margin-bottom:8px">${q.description||''}</div>
                    <div style="font-size:11px;color:#484f58;margin-bottom:6px">
                        Objectives: ${(q.objectives_json||[]).map(o=>o.label||o.type).join(' → ')}
                    </div>
                    <div>
                        ${rewards.xp  ? `<span class="wf-stat-pill" style="color:#d29922">✨ ${rewards.xp} XP</span>` : ''}
                        ${rewards.gold? `<span class="wf-stat-pill" style="color:#3fb950">💰 ${rewards.gold}g</span>` : ''}
                    </div>
                </div>`;
            }
            html += '</div></div>';
        }

        // Bottom commit button (repeated for long pages)
        html += `<div style="text-align:right;margin-top:24px;padding-top:20px;border-top:1px solid #21262d;display:flex;gap:12px;justify-content:flex-end">
            <button class="wf-edit-btn" onclick="WorldForge._showRawEditor()">✏️ Edit Raw JSON</button>
            <button class="wf-edit-btn" onclick="WorldForge.init()">🔄 Regenerate</button>
            <button class="wf-commit-btn" onclick="WorldForge.commit()">💾 Commit to Database</button>
        </div>`;

        el.innerHTML = html;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    // ---------------------------------------------------------------
    // RAW JSON EDITOR — for power users who want to tweak before commit
    // ---------------------------------------------------------------
    _showRawEditor() {
        const el = document.getElementById('wf_preview');
        const json = JSON.stringify(WorldForge._lastResult, null, 2);
        el.innerHTML = `
        <div style="background:#0d1117;border:1px solid #30363d;border-radius:12px;padding:20px;margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <div style="font-weight:700;color:#bb86fc">✏️ Raw JSON Editor</div>
                <div style="display:flex;gap:8px">
                    <button class="wf-edit-btn" onclick="WorldForge._applyRawEdit()" style="color:#3fb950;border-color:#3fb950">✅ Apply & Preview</button>
                    <button class="wf-edit-btn" onclick="WorldForge._showPreview(WorldForge._lastResult,WorldForge._lastMode)">Cancel</button>
                </div>
            </div>
            <textarea id="wf_raw_json" rows="30"
                style="width:100%;font-family:Consolas,monospace;font-size:12px;
                background:#010409;border:1px solid #21262d;color:#e8eef6;
                border-radius:8px;padding:14px;resize:vertical;line-height:1.5">${json.replace(/</g,'&lt;')}</textarea>
            <div id="wf_json_err" style="color:#f85149;font-size:12px;margin-top:8px;display:none"></div>
        </div>`;
    },

    _applyRawEdit() {
        const raw = document.getElementById('wf_raw_json').value;
        const errEl = document.getElementById('wf_json_err');
        try {
            const parsed = JSON.parse(raw);
            WorldForge._lastResult = parsed;
            errEl.style.display = 'none';
            WorldForge._showPreview(parsed, WorldForge._lastMode);
        } catch (e) {
            errEl.style.display = 'block';
            errEl.textContent = '❌ Invalid JSON: ' + e.message;
        }
    },

    // ---------------------------------------------------------------
    // TARGET MAP PICKER — import into an existing map
    // ---------------------------------------------------------------
    async _showMapPicker() {
        // Load maps from API
        const r = await fetch('/admin/get-all', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ type:'map' })
        });
        const d = await r.json();
        const maps = d.success ? d.data : [];

        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center';
        modal.innerHTML = `
        <div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:24px;min-width:400px;max-width:500px">
            <h3 style="margin:0 0 8px;color:#e8eef6">🗺️ Target Map</h3>
            <p style="color:#484f58;font-size:12px;margin-bottom:16px">
                Choose an existing map to import into. NPCs, shops, and quests will be added to this map.
                The generated map record (if any) will be skipped.
            </p>
            <div style="margin-bottom:8px">
                <label>Select Map</label>
                <select id="mp_map_sel" style="margin-bottom:10px">
                    <option value="">— Create New Map (default) —</option>
                    ${maps.map(m => `<option value="${m.id}" ${WorldForge._targetMapId==m.id?'selected':''}>${m.name} (id:${m.id})</option>`).join('')}
                </select>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="wf-edit-btn" onclick="this.closest('div[style*=fixed]').remove()">Cancel</button>
                <button class="wf-commit-btn" style="padding:10px 20px;font-size:13px" onclick="WorldForge._setTargetMap()">Set Target Map</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
    },

    _setTargetMap() {
        const val = document.getElementById('mp_map_sel')?.value;
        WorldForge._targetMapId = val ? parseInt(val) : null;
        document.querySelector('div[style*="fixed"]')?.remove();
        // Update the Target Map button label
        const btn = document.querySelector('.wf-edit-btn[onclick*="MapPicker"]');
        if (btn) btn.textContent = WorldForge._targetMapId
            ? `🗺️ Map #${WorldForge._targetMapId}`
            : '🗺️ Target Map';
    },

    // ---------------------------------------------------------------
    // REGENERATE SINGLE ENTITY
    // ---------------------------------------------------------------
    async _regenEntity(entityType, index) {
        const data = WorldForge._lastResult;
        if (!data) return;

        const existing = entityType === 'npc' ? data.npcs?.[index] : null;
        if (!existing) return;

        const btn = event.target;
        btn.textContent = '⏳'; btn.disabled = true;

        try {
            const params = {
                count:    1,
                role:     existing.name + ' archetype',
                theme:    WorldForge._loreBible || 'dark celtic fantasy',
                is_enemy: existing.is_enemy || 0
            };
            const r = await fetch('/admin/world-forge/generate', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ mode:'npcs', params, loreBible: WorldForge._loreBible })
            });
            const result = await r.json();
            if (!result.success) throw new Error(result.message);

            const newNpc = result.data?.npcs?.[0];
            if (!newNpc) throw new Error('No NPC returned');

            // Preserve position from original
            newNpc.x = existing.x;
            newNpc.y = existing.y;
            newNpc.is_enemy = existing.is_enemy;

            data.npcs[index] = newNpc;
            WorldForge._lastResult = data;
            WorldForge._showPreview(data, WorldForge._lastMode);
        } catch(e) {
            btn.textContent = '🔄'; btn.disabled = false;
            alert('Regen failed: ' + e.message);
        }
    },

    // ---------------------------------------------------------------
    // COMMIT — sends approved data to backend
    // ---------------------------------------------------------------
    async commit() {
        if (!WorldForge._lastResult) return alert('Nothing to commit. Generate something first.');

        const btn = document.querySelector('.wf-commit-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Committing...'; }

        try {
            const r = await fetch('/admin/world-forge/commit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: WorldForge._lastResult,
                    mode: WorldForge._lastMode,
                    targetMapId: WorldForge._targetMapId
                })
            });
            const result = await r.json();
            const el = document.getElementById('wf_preview');

            if (result.success) {
                el.innerHTML = `
                <div style="background:rgba(63,185,80,.08);border:1px solid #3fb950;border-radius:12px;padding:32px;text-align:center;margin-bottom:20px">
                    <div style="font-size:48px;margin-bottom:12px">🎉</div>
                    <div style="font-size:20px;font-weight:700;color:#3fb950;margin-bottom:8px">World Committed Successfully!</div>
                    <div style="color:#8b949e;margin-bottom:20px">${result.message}</div>
                    ${result.mapId ? `<div style="margin-bottom:20px"><span style="background:#161b22;padding:8px 16px;border-radius:6px;font-family:monospace;font-size:13px;color:#bb86fc">Map ID: ${result.mapId}</span></div>` : ''}
                    <div style="background:#010409;border:1px solid #21262d;border-radius:8px;padding:16px;text-align:left;max-height:200px;overflow-y:auto;margin-bottom:20px">
                        <div style="font-size:11px;color:#484f58;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Commit Log</div>
                        ${(result.log||[]).map(l=>`<div style="font-size:12px;color:#8b949e;font-family:monospace;margin-bottom:3px">${l}</div>`).join('')}
                    </div>
                    <div style="display:flex;gap:12px;justify-content:center">
                        <button class="wf-commit-btn" onclick="WorldForge.init()">🌍 Forge Another World</button>
                        <button class="wf-edit-btn" onclick="loadManager('map')">🗺️ View Maps</button>
                        <button class="wf-edit-btn" onclick="loadManager('npc')">👤 View NPCs</button>
                    </div>
                </div>`;
            } else {
                el.innerHTML = `
                <div style="background:rgba(248,81,73,.08);border:1px solid #f85149;border-radius:12px;padding:24px;margin-bottom:20px">
                    <div style="color:#f85149;font-weight:700;margin-bottom:8px">❌ Commit Failed</div>
                    <div style="color:#8b949e;margin-bottom:16px">${result.message}</div>
                    ${(result.log||[]).length ? `<div style="background:#010409;border-radius:6px;padding:12px;font-family:monospace;font-size:11px;color:#484f58">
                        ${result.log.join('<br>')}
                    </div>` : ''}
                    <button class="wf-edit-btn" style="margin-top:12px" onclick="WorldForge._showPreview(WorldForge._lastResult,WorldForge._lastMode)">
                        ← Back to Preview
                    </button>
                </div>`;
            }
        } catch (err) {
            alert('Commit error: ' + err.message);
            if (btn) { btn.disabled = false; btn.textContent = '💾 Commit to Database'; }
        }
    }
};
