// =================================================================
// NODE GRAPH EDITOR  v1.0 — AdminSauce
// =================================================================
// A visual drag-and-drop event script editor.
// Replaces raw JSON editing with a Godot-style node canvas.
//
// TEACHING: This uses Drawflow (https://github.com/jerosoler/Drawflow),
// a lightweight library that renders nodes on an HTML canvas. Key concept:
// any <input df-fieldname> inside a node's HTML automatically syncs its
// value into the node's data object — no manual event wiring needed.
//
// Interface: NodeGraphEditor.open(event, callback) — same as ScriptEditor
// Output: the same {trigger, conditions, actions} JSON the game engine reads
//
// Node types → same ACTION_TYPES as script_editor.js
// Flow: START ──▶ nodes ──▶ ... ──▶ (nothing = end)
//       CHOICE has one output port per option + one "after" port
//       IF     has "true" and "false" output ports
// =================================================================

const NodeGraphEditor = {
    _editor:   null,   // Drawflow instance
    _callback: null,   // called with result event JSON on save
    _event:    null,   // current event being edited
    _cache:    { items:[], quests:[], shops:[], npcs:[], classes:[], factions:[], maps:[] },
    _loaded:   false,  // Drawflow loaded from CDN?
    _nodeCounter: 0,   // unique node id seed for import

    // ------------------------------------------------------------------
    // Node colour palette (matches AdminSauce dark theme)
    // ------------------------------------------------------------------
    NODE_COLORS: {
        start:        '#1a3a2a',
        dialogue:     '#1a2a3a',
        choice:       '#2a1a3a',
        conditional:  '#2a2a1a',
        give_item:    '#1a2a1a',
        take_item:    '#3a1a1a',
        give_gold:    '#2a2a1a',
        give_xp:      '#2a2a1a',
        heal:         '#1a3a1a',
        damage:       '#3a1a1a',
        teleport:     '#1a1a3a',
        quest_start:  '#2a1a2a',
        quest_advance:'#2a1a2a',
        quest_complete:'#2a1a2a',
        battle:       '#3a1a1a',
        npc_talk:     '#1a2a2a',
        set_flag:     '#2a2a2a',
        set_world_flag:'#2a2a2a',
        inc_flag:     '#2a2a2a',
        wait:         '#1a1a1a',
        screen_effect:'#2a1a2a',
        sound:        '#1a2a2a',
        shop:         '#2a2a1a',
        faction_rep:  '#3a2a1a',
        default:      '#1e1e2e',
    },

    // ------------------------------------------------------------------
    // ACTION node definitions (mirrors ScriptEditor.ACTION_TYPES)
    // Each field uses df-key attributes so Drawflow auto-syncs values.
    // ------------------------------------------------------------------
    NODES: {
        dialogue: {
            label: '💬 Dialogue', outputs: 1,
            html: (d) => `
            <div class="ng-node-title">💬 Dialogue</div>
            <div class="ng-field"><label>Speaker</label>
                <input type="text" df-speaker value="${_esc(d.speaker||'')}" placeholder="NPC name"></div>
            <div class="ng-field"><label>Text</label>
                <textarea df-text rows="2" placeholder="What they say…">${_esc(d.text||'')}</textarea></div>`
        },
        give_item: {
            label: '📦 Give Item', outputs: 1,
            html: (d, cache) => `
            <div class="ng-node-title">📦 Give Item</div>
            <div class="ng-field"><label>Item</label>
                <select df-itemId>${cache.items.map(i=>`<option value="${i.id}" ${d.itemId==i.id?'selected':''}>${i.icon||'📦'} ${i.name}</option>`).join('')}</select></div>
            <div class="ng-field"><label>Qty</label>
                <input type="number" df-quantity value="${d.quantity||1}" min="1"></div>`
        },
        take_item: {
            label: '🗑️ Take Item', outputs: 1,
            html: (d, cache) => `
            <div class="ng-node-title">🗑️ Take Item</div>
            <div class="ng-field"><label>Item</label>
                <select df-itemId>${cache.items.map(i=>`<option value="${i.id}" ${d.itemId==i.id?'selected':''}>${i.icon||'📦'} ${i.name}</option>`).join('')}</select></div>
            <div class="ng-field"><label>Qty</label>
                <input type="number" df-quantity value="${d.quantity||1}" min="1"></div>`
        },
        give_gold: {
            label: '💰 Give Gold', outputs: 1,
            html: (d) => `
            <div class="ng-node-title">💰 Give Gold</div>
            <div class="ng-field"><label>Amount</label>
                <input type="number" df-amount value="${d.amount||0}"></div>`
        },
        give_xp: {
            label: '⭐ Give XP', outputs: 1,
            html: (d) => `
            <div class="ng-node-title">⭐ Give XP</div>
            <div class="ng-field"><label>Amount</label>
                <input type="number" df-amount value="${d.amount||0}"></div>`
        },
        heal: {
            label: '💚 Heal', outputs: 1,
            html: (d) => `
            <div class="ng-node-title">💚 Heal</div>
            <div class="ng-field"><label>HP</label>
                <input type="text" df-hp value="${_esc(d.hp||'MAX')}" placeholder="MAX or formula"></div>
            <div class="ng-field"><label>MP</label>
                <input type="text" df-mp value="${_esc(d.mp||'')}" placeholder="MAX or formula"></div>`
        },
        damage: {
            label: '💥 Damage', outputs: 1,
            html: (d) => `
            <div class="ng-node-title">💥 Damage</div>
            <div class="ng-field"><label>HP Damage</label>
                <input type="text" df-hp value="${_esc(d.hp||'10')}" placeholder="formula"></div>`
        },
        teleport: {
            label: '🚪 Teleport', outputs: 1,
            html: (d, cache) => `
            <div class="ng-node-title">🚪 Teleport</div>
            <div class="ng-field"><label>Map</label>
                <select df-mapId>${cache.maps.map(m=>`<option value="${m.id}" ${d.mapId==m.id?'selected':''}>🗺️ ${m.name}</option>`).join('')}</select></div>
            <div class="ng-field" style="display:flex;gap:6px">
                <div><label>X</label><input type="number" df-x value="${d.x||10}" style="width:50px"></div>
                <div><label>Y</label><input type="number" df-y value="${d.y||10}" style="width:50px"></div>
            </div>`
        },
        quest_start: {
            label: '📜 Start Quest', outputs: 1,
            html: (d, cache) => `
            <div class="ng-node-title">📜 Start Quest</div>
            <div class="ng-field"><label>Quest</label>
                <select df-questId>${cache.quests.map(q=>`<option value="${q.quest_id||q.id}" ${(d.questId==q.quest_id||d.questId==q.id)?'selected':''}>📜 ${q.title||q.quest_id}</option>`).join('')}</select></div>`
        },
        quest_advance: {
            label: '📜 Advance Quest', outputs: 1,
            html: (d, cache) => `
            <div class="ng-node-title">📜 Advance Quest</div>
            <div class="ng-field"><label>Quest</label>
                <select df-questId>${cache.quests.map(q=>`<option value="${q.quest_id||q.id}" ${(d.questId==q.quest_id||d.questId==q.id)?'selected':''}>📜 ${q.title||q.quest_id}</option>`).join('')}</select></div>`
        },
        quest_complete: {
            label: '🏆 Complete Quest', outputs: 1,
            html: (d, cache) => `
            <div class="ng-node-title">🏆 Complete Quest</div>
            <div class="ng-field"><label>Quest</label>
                <select df-questId>${cache.quests.map(q=>`<option value="${q.quest_id||q.id}" ${(d.questId==q.quest_id||d.questId==q.id)?'selected':''}>📜 ${q.title||q.quest_id}</option>`).join('')}</select></div>`
        },
        battle: {
            label: '⚔️ Battle', outputs: 1,
            html: (d, cache) => `
            <div class="ng-node-title">⚔️ Battle</div>
            <div class="ng-field"><label>Enemy NPC</label>
                <select df-enemyId>${cache.npcs.map(n=>`<option value="${n.id}" ${d.enemyId==n.id?'selected':''}>${n.icon||'👤'} ${n.name}</option>`).join('')}</select></div>`
        },
        npc_talk: {
            label: '🗣️ NPC Talk', outputs: 1,
            html: (d, cache) => `
            <div class="ng-node-title">🗣️ NPC Talk</div>
            <div class="ng-field"><label>NPC</label>
                <select df-npcName>${cache.npcs.map(n=>`<option value="${n.name}" ${d.npcName===n.name?'selected':''}>${n.icon||'👤'} ${n.name}</option>`).join('')}</select></div>`
        },
        shop: {
            label: '🪙 Open Shop', outputs: 1,
            html: (d, cache) => `
            <div class="ng-node-title">🪙 Open Shop</div>
            <div class="ng-field"><label>Shop</label>
                <select df-shopId>${cache.shops.map(s=>`<option value="${s.id}" ${d.shopId==s.id?'selected':''}>🏪 ${s.name}</option>`).join('')}</select></div>`
        },
        set_flag: {
            label: '🚩 Set Flag', outputs: 1,
            html: (d) => `
            <div class="ng-node-title">🚩 Set Flag</div>
            <div class="ng-field"><label>Flag Name</label>
                <input type="text" df-key value="${_esc(d.key||'')}" placeholder="e.g. talked_to_guard"></div>
            <div class="ng-field"><label>Value</label>
                <input type="text" df-value value="${_esc(String(d.value!==undefined?d.value:true))}" placeholder="true / false / 42"></div>`
        },
        set_world_flag: {
            label: '🌍 World Flag', outputs: 1,
            html: (d) => `
            <div class="ng-node-title">🌍 World Flag</div>
            <div class="ng-field"><label>Flag Name</label>
                <input type="text" df-key value="${_esc(d.key||'')}" placeholder="e.g. goblin_boss_slain"></div>
            <div class="ng-field"><label>Value</label>
                <input type="text" df-value value="${_esc(String(d.value!==undefined?d.value:'true'))}" placeholder="true / false"></div>`
        },
        inc_flag: {
            label: '➕ Inc Flag', outputs: 1,
            html: (d) => `
            <div class="ng-node-title">➕ Inc Flag</div>
            <div class="ng-field"><label>Flag Name</label>
                <input type="text" df-key value="${_esc(d.key||'')}" placeholder="e.g. kill_count"></div>
            <div class="ng-field"><label>Amount</label>
                <input type="number" df-amount value="${d.amount||1}"></div>`
        },
        set_npc_mood: {
            label: '😶 NPC Mood', outputs: 1,
            html: (d, cache) => `
            <div class="ng-node-title">😶 NPC Mood</div>
            <div class="ng-field"><label>NPC</label>
                <select df-npcName>${cache.npcs.map(n=>`<option value="${n.name}" ${d.npcName===n.name?'selected':''}>${n.name}</option>`).join('')}</select></div>
            <div class="ng-field"><label>Mood</label>
                <select df-mood>${['happy','fearful','angry','grieving','excited','(clear)'].map(m=>`<option value="${m}" ${d.mood===m?'selected':''}>${m}</option>`).join('')}</select></div>`
        },
        kill_npc: {
            label: '💀 Kill NPC', outputs: 1,
            html: (d, cache) => `
            <div class="ng-node-title">💀 Kill NPC</div>
            <div class="ng-field"><label>NPC</label>
                <select df-npcName>${cache.npcs.map(n=>`<option value="${n.name}" ${d.npcName===n.name?'selected':''}>${n.name}</option>`).join('')}</select></div>
            <div class="ng-field"><label>Cause</label>
                <input type="text" df-cause value="${_esc(d.cause||'')}" placeholder="e.g. Slain by shadow wraith"></div>`
        },
        faction_rep: {
            label: '⚖️ Faction Rep', outputs: 1,
            html: (d, cache) => `
            <div class="ng-node-title">⚖️ Faction Rep</div>
            <div class="ng-field"><label>Faction</label>
                <select df-factionId>${cache.factions.map(f=>`<option value="${f.id}" ${d.factionId==f.id?'selected':''}>⚔️ ${f.name}</option>`).join('')}</select></div>
            <div class="ng-field"><label>Amount (+/-)</label>
                <input type="number" df-delta value="${d.delta||10}" placeholder="e.g. 10 or -20"></div>`
        },
        screen_effect: {
            label: '✨ Screen Effect', outputs: 1,
            html: (d) => `
            <div class="ng-node-title">✨ Screen Effect</div>
            <div class="ng-field"><label>Effect</label>
                <select df-effect>${['shake','flash','fade'].map(e=>`<option value="${e}" ${d.effect===e?'selected':''}>${e}</option>`).join('')}</select></div>
            <div class="ng-field"><label>Duration (ms)</label>
                <input type="number" df-duration value="${d.duration||500}"></div>`
        },
        sound: {
            label: '🔊 Play Sound', outputs: 1,
            html: (d) => `
            <div class="ng-node-title">🔊 Play Sound</div>
            <div class="ng-field"><label>Filename</label>
                <input type="text" df-file value="${_esc(d.file||'')}" placeholder="sound.mp3"></div>`
        },
        wait: {
            label: '⏱️ Wait', outputs: 1,
            html: (d) => `
            <div class="ng-node-title">⏱️ Wait</div>
            <div class="ng-field"><label>Milliseconds</label>
                <input type="number" df-ms value="${d.ms||1000}" min="0"></div>`
        },
        // ── Special nodes ─────────────────────────────────────────────
        choice: {
            label: '🔀 Choice',
            // Dynamic: outputs depend on number of options
            // We handle this separately in addChoiceNode()
            html: (d) => NodeGraphEditor._choiceHtml(d)
        },
        conditional: {
            label: '❓ If…',
            html: (d) => `
            <div class="ng-node-title">❓ If…</div>
            <div class="ng-field"><label>Flag</label>
                <input type="text" df-condKey value="${_esc(d.condKey||'')}" placeholder="Flag name"></div>
            <div class="ng-field" style="display:flex;gap:6px">
                <div><label>Op</label>
                    <select df-condOp style="width:60px">${['==','!=','>','<','>=','<='].map(o=>`<option value="${o}" ${d.condOp===o?'selected':''}>${o}</option>`).join('')}</select></div>
                <div><label>Value</label>
                    <input type="text" df-condVal value="${_esc(String(d.condVal!==undefined?d.condVal:true))}" style="width:60px"></div>
            </div>
            <div style="font-size:9px;color:#888;margin-top:4px;padding:0 4px">
                ✅ True → top port &nbsp; ❌ False → bottom port
            </div>`
        },
    },

    _choiceHtml(d) {
        const options = d.options || [{ text: 'Option A' }, { text: 'Option B' }];
        return `
        <div class="ng-node-title">🔀 Choice</div>
        <div class="ng-field"><label>Prompt</label>
            <input type="text" df-prompt value="${_esc(d.prompt||'')}" placeholder="What do you want?"></div>
        <div id="ng-opts-${d._nodeId||'x'}" class="ng-opts">
            ${options.map((o, i) => `
            <div class="ng-opt-row" data-idx="${i}">
                <span class="ng-opt-num">${i+1}.</span>
                <input type="text" df-opt_${i} value="${_esc(o.text||'')}" placeholder="Option ${i+1} text" style="flex:1">
            </div>`).join('')}
        </div>
        <div style="font-size:9px;color:#888;margin-top:4px;padding:0 4px">
            Each option has its own output port →
        </div>`;
    },

    // ------------------------------------------------------------------
    // ENTRY POINT — called exactly like ScriptEditor.open()
    // ------------------------------------------------------------------
    async open(event, callback) {
        NodeGraphEditor._callback = callback;
        NodeGraphEditor._event    = event
            ? JSON.parse(JSON.stringify(event))
            : { trigger: 'INTERACT', conditions: [], actions: [] };

        // Pre-load lookup caches (same as ScriptEditor)
        const [ir, qr, sr, nr, cr, fr, mr] = await Promise.all([
            API.getAll('item'), API.getAll('quest'), API.getAll('shop'),
            API.getAll('npc'),  API.getAll('class'), API.getAll('faction'),
            API.getAll('map')
        ]);
        NodeGraphEditor._cache = {
            items:    ir.success ? ir.data : [],
            quests:   qr.success ? qr.data : [],
            shops:    sr.success ? sr.data : [],
            npcs:     nr.success ? nr.data : [],
            classes:  cr.success ? cr.data : [],
            factions: fr.success ? fr.data : [],
            maps:     mr.success ? mr.data : []
        };

        await NodeGraphEditor._ensureDrawflow();
        NodeGraphEditor._render();
    },

    // ------------------------------------------------------------------
    // LOAD DRAWFLOW FROM CDN (once only)
    // TEACHING: We load Drawflow dynamically so it's only fetched when
    // the node graph editor is actually opened — no impact on AdminSauce
    // startup time when it's never used.
    // ------------------------------------------------------------------
    _ensureDrawflow() {
        if (NodeGraphEditor._loaded) return Promise.resolve();
        return new Promise((resolve, reject) => {
            // Load CSS first
            const link = document.createElement('link');
            link.rel  = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/npm/drawflow@0.0.59/dist/drawflow.min.css';
            document.head.appendChild(link);

            const script = document.createElement('script');
            script.src   = 'https://cdn.jsdelivr.net/npm/drawflow@0.0.59/dist/drawflow.min.js';
            script.onload = () => { NodeGraphEditor._loaded = true; resolve(); };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    },

    // ------------------------------------------------------------------
    // RENDER — build the editor UI
    // ------------------------------------------------------------------
    _render() {
        const area = document.getElementById('dynamicArea');
        area.innerHTML = `
        <style>
        #ng-wrap { display:flex; flex-direction:column; height:calc(100vh - 60px); overflow:hidden; }
        #ng-toolbar {
            display:flex; align-items:center; gap:8px; padding:10px 14px;
            background:#0d1117; border-bottom:1px solid #21262d; flex-shrink:0; flex-wrap:wrap;
        }
        #ng-toolbar .ng-tool-title { font-size:13px;font-weight:bold;color:#bb86fc;margin-right:8px; }
        #ng-toolbar select, #ng-toolbar input[type=text] {
            background:#161b22;border:1px solid #30363d;color:#e8eef6;
            padding:5px 8px;border-radius:6px;font-size:11px;font-family:'Courier New',monospace;
        }
        .ng-btn {
            padding:6px 12px;border-radius:6px;border:1px solid #30363d;
            background:rgba(255,255,255,.05);color:#8b949e;cursor:pointer;
            font-size:11px;font-family:'Courier New',monospace;white-space:nowrap;
        }
        .ng-btn:hover { background:rgba(255,255,255,.1);color:#e8eef6; }
        .ng-btn.primary { background:rgba(187,134,252,.15);border-color:rgba(187,134,252,.4);color:#bb86fc; }
        .ng-btn.danger  { background:rgba(248,81,73,.1);border-color:rgba(248,81,73,.3);color:#f85149; }
        #ng-body { display:flex; flex:1; overflow:hidden; }
        #ng-palette {
            width:160px; flex-shrink:0;
            background:#0d1117;border-right:1px solid #21262d;
            overflow-y:auto;padding:10px 8px;
        }
        #ng-palette .pal-section { font-size:9px;color:#484f58;text-transform:uppercase;
            letter-spacing:.8px;padding:8px 4px 4px;font-weight:bold; }
        .pal-node {
            padding:7px 10px;margin-bottom:4px;border-radius:6px;cursor:grab;
            background:rgba(255,255,255,.04);border:1px solid #21262d;
            color:#8b949e;font-size:11px;user-select:none;
        }
        .pal-node:hover { background:rgba(187,134,252,.1);border-color:rgba(187,134,252,.3);color:#bb86fc; }
        #ng-canvas-wrap { flex:1;position:relative;overflow:hidden;background:#010409; }
        #ng-canvas { width:100%;height:100%; }
        /* Drawflow node overrides */
        .drawflow .drawflow-node {
            background:#0d1117 !important;border:1px solid #30363d !important;
            border-radius:10px !important;min-width:220px !important;
            box-shadow:0 4px 16px rgba(0,0,0,.4) !important;padding:0 !important;
        }
        .drawflow .drawflow-node.selected {
            border-color:#bb86fc !important;
            box-shadow:0 0 0 2px rgba(187,134,252,.3), 0 4px 16px rgba(0,0,0,.4) !important;
        }
        .drawflow .drawflow-node .drawflow_content_node { padding:0 !important; }
        .drawflow .connection .main-path { stroke:#484f58 !important;stroke-width:2px !important; }
        .drawflow .connection.selected .main-path { stroke:#bb86fc !important; }
        .ng-node-title {
            font-size:11px;font-weight:bold;color:#e8eef6;
            padding:8px 12px 6px;border-bottom:1px solid #21262d;
            border-radius:10px 10px 0 0;
            background:rgba(255,255,255,.03);
        }
        .ng-field { padding:5px 10px; }
        .ng-field label { display:block;font-size:9px;color:#484f58;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px; }
        .ng-field input, .ng-field select, .ng-field textarea {
            width:100%;background:#161b22;border:1px solid #30363d;
            color:#e8eef6;padding:4px 7px;border-radius:5px;
            font-size:11px;font-family:'Courier New',monospace;box-sizing:border-box;
        }
        .ng-field textarea { resize:vertical;min-height:44px; }
        .ng-opt-row { display:flex;align-items:center;gap:4px;margin-bottom:3px; }
        .ng-opt-num { color:#484f58;font-size:10px;width:14px;flex-shrink:0; }
        .ng-node-start { border-color:#3fb95088 !important; }
        .ng-node-choice { border-color:#bb86fc88 !important; }
        .ng-node-conditional { border-color:#f39c1288 !important; }
        /* Port labels */
        .drawflow .output:after { content:attr(data-label);font-size:8px;color:#484f58;
            position:absolute;right:14px;top:50%;transform:translateY(-50%);white-space:nowrap; }
        #ng-hint { position:absolute;bottom:12px;right:14px;font-size:10px;color:#30363d;pointer-events:none; }
        </style>

        <div id="ng-wrap">
          <div id="ng-toolbar">
            <span class="ng-tool-title">🔀 Node Graph Editor</span>

            <label style="font-size:10px;color:#484f58">Trigger:</label>
            <select id="ng-trigger" onchange="NodeGraphEditor._setTrigger(this.value)">
                <option value="INTERACT">🖐️ INTERACT</option>
                <option value="STEP_ON">👣 STEP ON</option>
                <option value="AUTO">⚡ AUTO</option>
            </select>

            <div style="flex:1"></div>

            <button class="ng-btn" onclick="NodeGraphEditor._zoomFit()" title="Fit all nodes in view">⊡ Fit</button>
            <button class="ng-btn" onclick="NodeGraphEditor._clearAll()" title="Clear all nodes">🗑️ Clear</button>
            <button class="ng-btn" onclick="NodeGraphEditor._viewJSON()">{ } JSON</button>
            <button class="ng-btn" onclick="NodeGraphEditor._callback(null)">✕ Cancel</button>
            <button class="ng-btn primary" onclick="NodeGraphEditor.save()">💾 Save</button>
          </div>

          <div id="ng-body">
            <!-- Left palette: drag nodes onto canvas -->
            <div id="ng-palette">
                <div class="pal-section">▶ Flow</div>
                <div class="pal-node" draggable="true" data-node="dialogue">💬 Dialogue</div>
                <div class="pal-node" draggable="true" data-node="choice">🔀 Choice</div>
                <div class="pal-node" draggable="true" data-node="conditional">❓ If…</div>
                <div class="pal-section">🎁 Rewards</div>
                <div class="pal-node" draggable="true" data-node="give_item">📦 Give Item</div>
                <div class="pal-node" draggable="true" data-node="take_item">🗑️ Take Item</div>
                <div class="pal-node" draggable="true" data-node="give_gold">💰 Give Gold</div>
                <div class="pal-node" draggable="true" data-node="give_xp">⭐ Give XP</div>
                <div class="pal-node" draggable="true" data-node="heal">💚 Heal</div>
                <div class="pal-node" draggable="true" data-node="damage">💥 Damage</div>
                <div class="pal-section">🗺️ World</div>
                <div class="pal-node" draggable="true" data-node="teleport">🚪 Teleport</div>
                <div class="pal-node" draggable="true" data-node="set_flag">🚩 Set Flag</div>
                <div class="pal-node" draggable="true" data-node="set_world_flag">🌍 World Flag</div>
                <div class="pal-node" draggable="true" data-node="inc_flag">➕ Inc Flag</div>
                <div class="pal-node" draggable="true" data-node="screen_effect">✨ Effect</div>
                <div class="pal-node" draggable="true" data-node="wait">⏱️ Wait</div>
                <div class="pal-node" draggable="true" data-node="sound">🔊 Sound</div>
                <div class="pal-section">👤 NPC</div>
                <div class="pal-node" draggable="true" data-node="npc_talk">🗣️ NPC Talk</div>
                <div class="pal-node" draggable="true" data-node="set_npc_mood">😶 NPC Mood</div>
                <div class="pal-node" draggable="true" data-node="kill_npc">💀 Kill NPC</div>
                <div class="pal-node" draggable="true" data-node="faction_rep">⚖️ Faction Rep</div>
                <div class="pal-section">⚔️ Game</div>
                <div class="pal-node" draggable="true" data-node="battle">⚔️ Battle</div>
                <div class="pal-node" draggable="true" data-node="shop">🪙 Shop</div>
                <div class="pal-node" draggable="true" data-node="quest_start">📜 Start Quest</div>
                <div class="pal-node" draggable="true" data-node="quest_advance">📜 Advance Quest</div>
                <div class="pal-node" draggable="true" data-node="quest_complete">🏆 Complete Quest</div>
            </div>

            <div id="ng-canvas-wrap">
                <div id="ng-canvas"></div>
                <div id="ng-hint">Right-click canvas for node menu · Scroll to zoom · Drag to pan</div>
            </div>
          </div>
        </div>`;

        NodeGraphEditor._initDrawflow();
    },

    // ------------------------------------------------------------------
    // INIT DRAWFLOW
    // ------------------------------------------------------------------
    _initDrawflow() {
        const container = document.getElementById('ng-canvas');
        const editor = new Drawflow(container);
        editor.reroute = true;
        editor.reroute_fix_curvature = true;
        editor.force_first_input = false;

        // Dark theme adjustments
        editor.start();
        NodeGraphEditor._editor = editor;

        // Set trigger selector
        const trigSelect = document.getElementById('ng-trigger');
        if (trigSelect) trigSelect.value = NodeGraphEditor._event.trigger || 'INTERACT';

        // Wire up drag-and-drop from palette
        NodeGraphEditor._initDragDrop();

        // Import existing event if it has actions
        const ev = NodeGraphEditor._event;
        if (ev._graphLayout) {
            // Restore previously saved Drawflow state
            try {
                editor.import(ev._graphLayout);
                return;
            } catch(e) { console.warn('[NodeGraph] Could not restore layout:', e.message); }
        }

        // Fresh import from event JSON → create nodes
        NodeGraphEditor._eventToGraph(ev);
    },

    _initDragDrop() {
        const canvasWrap = document.getElementById('ng-canvas-wrap');

        // Palette nodes → mark what's being dragged
        document.querySelectorAll('.pal-node').forEach(el => {
            el.addEventListener('dragstart', e => {
                e.dataTransfer.setData('nodeType', el.dataset.node);
            });
        });

        canvasWrap.addEventListener('dragover', e => e.preventDefault());
        canvasWrap.addEventListener('drop', e => {
            e.preventDefault();
            const nodeType = e.dataTransfer.getData('nodeType');
            if (!nodeType) return;

            // Convert drop position to Drawflow canvas coordinates
            const rect = canvasWrap.getBoundingClientRect();
            const ed   = NodeGraphEditor._editor;
            const x    = (e.clientX - rect.left - ed.canvas_x) / ed.zoom;
            const y    = (e.clientY - rect.top  - ed.canvas_y) / ed.zoom;

            NodeGraphEditor._addNode(nodeType, {}, x, y);
        });
    },

    // ------------------------------------------------------------------
    // ADD NODE — creates a Drawflow node of the given type
    // ------------------------------------------------------------------
    _addNode(type, data = {}, x = 200, y = 200) {
        const ed   = NodeGraphEditor._editor;
        const def  = NodeGraphEditor.NODES[type];
        if (!def) return null;

        const cache = NodeGraphEditor._cache;

        // Special: choice node gets N option outputs + 1 "after" output
        if (type === 'choice') {
            const opts = data.options || [{ text: 'Option A' }, { text: 'Option B' }];
            data.options = opts;
            data._nodeId = 'c' + (++NodeGraphEditor._nodeCounter);

            const inputs  = { input_1: { connections: [] } };
            const outputs = {};
            opts.forEach((_, i) => outputs[`output_${i+1}`] = { connections: [] });
            outputs[`output_${opts.length + 1}`] = { connections: [] }; // "after" port

            const id = ed.addNode(type, 1, opts.length + 1, x, y, `ng-node-choice`, data, def.html(data, cache));
            return id;
        }

        // Special: conditional gets 2 outputs (true / false)
        if (type === 'conditional') {
            const id = ed.addNode(type, 1, 2, x, y, `ng-node-conditional`, data, def.html(data, cache));
            // Label the ports
            setTimeout(() => {
                const nodeEl = document.querySelector(`.drawflow-node[id="node-${id}"]`);
                if (!nodeEl) return;
                const outs = nodeEl.querySelectorAll('.output');
                if (outs[0]) outs[0].setAttribute('data-label', '✅ true');
                if (outs[1]) outs[1].setAttribute('data-label', '❌ false');
            }, 50);
            return id;
        }

        // Standard node: 1 input, 1 output
        const outputs = def.outputs || 1;
        const id = ed.addNode(type, 1, outputs, x, y, `ng-node-${type}`, data, def.html(data, cache));
        return id;
    },

    _addStartNode(x = 60, y = 160) {
        const ev = NodeGraphEditor._event;
        const html = `
        <div class="ng-node-title" style="color:#3fb950">▶ START</div>
        <div class="ng-field"><label>Trigger</label>
            <select df-trigger onchange="document.getElementById('ng-trigger').value=this.value;NodeGraphEditor._event.trigger=this.value">
                <option value="INTERACT" ${(ev.trigger||'INTERACT')==='INTERACT'?'selected':''}>🖐️ INTERACT</option>
                <option value="STEP_ON"  ${ev.trigger==='STEP_ON'?'selected':''}>👣 STEP ON</option>
                <option value="AUTO"     ${ev.trigger==='AUTO'?'selected':''}>⚡ AUTO</option>
            </select></div>
        <div style="padding:4px 10px 8px;font-size:9px;color:#484f58">
            This is where the script begins ▶
        </div>`;
        return NodeGraphEditor._editor.addNode(
            'start', 0, 1, x, y, 'ng-node-start',
            { trigger: ev.trigger || 'INTERACT' }, html
        );
    },

    _setTrigger(val) {
        NodeGraphEditor._event.trigger = val;
        // Sync the START node's select if it exists
        const startNode = NodeGraphEditor._findStartNode();
        if (startNode) {
            const el = document.querySelector(`.drawflow-node[id="node-${startNode}"] select[df-trigger]`);
            if (el) el.value = val;
        }
    },

    _findStartNode() {
        const data = NodeGraphEditor._editor.export();
        const nodes = data.drawflow.Home.data;
        const found = Object.values(nodes).find(n => n.name === 'start');
        return found ? found.id : null;
    },

    // ------------------------------------------------------------------
    // IMPORT: Event JSON → Drawflow graph
    // ------------------------------------------------------------------
    _eventToGraph(ev) {
        const ed   = NodeGraphEditor._editor;
        let x = 60, y = 160;
        const STEP_X = 270, STEP_Y = 60;

        const startId = NodeGraphEditor._addStartNode(x, y);
        x += STEP_X;

        // Lay out nodes left-to-right, return last node id
        function layoutActions(actions, startX, startY, parentId, parentPort) {
            let prevId   = parentId;
            let prevPort = parentPort;
            let cx = startX, cy = startY;

            for (const action of (actions || [])) {
                const type = action.type.toLowerCase();
                const data = Object.assign({}, action);
                delete data.type;

                let nodeId;
                if (type === 'choice') {
                    data.options = data.options || [];
                    nodeId = NodeGraphEditor._addNode('choice', data, cx, cy);
                    if (prevId !== null) {
                        try { ed.addConnection(prevId, nodeId, `output_${prevPort}`, 'input_1'); } catch {}
                    }
                    // Lay out each branch below
                    let branchY = cy + 180;
                    data.options.forEach((opt, i) => {
                        layoutActions(opt.actions, cx + STEP_X, branchY, nodeId, i + 1);
                        branchY += 120;
                    });
                    prevId   = nodeId;
                    prevPort = data.options.length + 1; // "after" port
                } else if (type === 'conditional' || type === 'if') {
                    data.condKey = data.condition?.key   || data.condKey   || '';
                    data.condOp  = data.condition?.op    || data.condOp    || '==';
                    data.condVal = data.condition?.value !== undefined ? data.condition.value : (data.condVal !== undefined ? data.condVal : true);
                    nodeId = NodeGraphEditor._addNode('conditional', data, cx, cy);
                    if (prevId !== null) {
                        try { ed.addConnection(prevId, nodeId, `output_${prevPort}`, 'input_1'); } catch {}
                    }
                    layoutActions(data.then || [], cx + STEP_X, cy - 80, nodeId, 1);
                    layoutActions(data.else || [], cx + STEP_X, cy + 80, nodeId, 2);
                    prevId = null; // IF has no linear continuation
                    break;
                } else {
                    nodeId = NodeGraphEditor._addNode(type, data, cx, cy);
                    if (nodeId && prevId !== null) {
                        try { ed.addConnection(prevId, nodeId, `output_${prevPort}`, 'input_1'); } catch {}
                    }
                    prevId   = nodeId;
                    prevPort = 1;
                }

                cx += STEP_X;
            }
        }

        layoutActions(ev.actions || [], x, y, startId, 1);
    },

    // ------------------------------------------------------------------
    // EXPORT: Drawflow graph → Event JSON
    // TEACHING: We traverse the node graph starting from the START node,
    // following connection links. This is a depth-first traversal.
    // We track visited nodes to prevent infinite loops from bad connections.
    // ------------------------------------------------------------------
    _graphToEvent() {
        const ed      = NodeGraphEditor._editor;
        const raw     = ed.export();
        const nodes   = raw.drawflow.Home.data;
        const visited = new Set();

        function getNext(node, outputKey) {
            const conns = node.outputs?.[outputKey]?.connections || [];
            return conns.length ? String(conns[0].node) : null;
        }

        function traverse(nodeId) {
            if (!nodeId || visited.has(nodeId)) return [];
            const node = nodes[nodeId];
            if (!node) return [];
            visited.add(nodeId);

            if (node.name === 'start') {
                const nextId = getNext(node, 'output_1');
                return traverse(nextId);
            }

            if (node.name === 'choice') {
                const d = node.data;
                // Gather option texts from df-opt_N fields
                const optCount = Object.keys(node.outputs).length - 1; // last = "after"
                const options = [];
                for (let i = 0; i < optCount; i++) {
                    const text    = d[`opt_${i}`] || `Option ${i+1}`;
                    const branchId = getNext(node, `output_${i+1}`);
                    options.push({ text, actions: traverse(branchId) });
                }
                const action = { type: 'CHOICE', prompt: d.prompt || '', options };
                // "after" port — continues after the choice
                const afterId = getNext(node, `output_${optCount + 1}`);
                return [action, ...traverse(afterId)];
            }

            if (node.name === 'conditional') {
                const d = node.data;
                const action = {
                    type: 'IF',
                    condition: { type: 'FLAG', key: d.condKey, op: d.condOp || '==', value: _coerce(d.condVal) },
                    then: traverse(getNext(node, 'output_1')),
                    else: traverse(getNext(node, 'output_2')),
                };
                return [action];
            }

            // Standard action node
            const d      = Object.assign({}, node.data);
            const type   = node.name.toUpperCase();
            // Coerce numeric string fields to numbers
            const NUM_KEYS = ['quantity','amount','ms','duration','x','y','mapId','itemId',
                              'questId','shopId','enemyId','factionId','delta'];
            for (const k of NUM_KEYS) {
                if (d[k] !== undefined && d[k] !== '') d[k] = Number(d[k]);
            }
            // Coerce value/condVal to appropriate type
            if (d.value !== undefined) d.value = _coerce(d.value);
            // Clean internal keys
            delete d._nodeId;
            delete d.options; // handled in choice branch
            delete d.prompt;  // handled in choice branch

            const action = { type, ...d };

            const nextId = getNext(node, 'output_1');
            return [action, ...traverse(nextId)];
        }

        // Find start node
        const startNode = Object.values(nodes).find(n => n.name === 'start');
        if (!startNode) return { trigger: 'INTERACT', conditions: [], actions: [] };

        const trigger = startNode.data?.trigger
            || document.getElementById('ng-trigger')?.value
            || 'INTERACT';

        return {
            trigger,
            conditions: NodeGraphEditor._event.conditions || [],
            actions:    traverse(String(startNode.id)),
            x:          NodeGraphEditor._event.x,
            y:          NodeGraphEditor._event.y,
            _graphLayout: raw,  // store layout for round-trip
        };
    },

    // ------------------------------------------------------------------
    // SAVE
    // ------------------------------------------------------------------
    save() {
        try {
            const result = NodeGraphEditor._graphToEvent();
            if (NodeGraphEditor._callback) NodeGraphEditor._callback(result);
        } catch(e) {
            alert('❌ Error building event JSON: ' + e.message);
            console.error(e);
        }
    },

    // ------------------------------------------------------------------
    // UTILITIES
    // ------------------------------------------------------------------
    _clearAll() {
        if (!confirm('Clear all nodes? This cannot be undone.')) return;
        NodeGraphEditor._editor.clear();
        NodeGraphEditor._addStartNode(60, 160);
    },

    _zoomFit() {
        // Reset zoom and pan to show all nodes
        const ed = NodeGraphEditor._editor;
        ed.zoom_reset();
        // Center view on the average node position
        const nodes = Object.values(ed.export().drawflow.Home.data);
        if (!nodes.length) return;
        const avgX = nodes.reduce((s, n) => s + n.pos_x, 0) / nodes.length;
        const avgY = nodes.reduce((s, n) => s + n.pos_y, 0) / nodes.length;
        const wrap  = document.getElementById('ng-canvas-wrap');
        ed.canvas_x = wrap.clientWidth  / 2 - avgX * ed.zoom;
        ed.canvas_y = wrap.clientHeight / 2 - avgY * ed.zoom;
        ed.precanvas.style.transform = `translate(${ed.canvas_x}px, ${ed.canvas_y}px) scale(${ed.zoom})`;
    },

    _viewJSON() {
        let result;
        try { result = NodeGraphEditor._graphToEvent(); }
        catch(e) { alert('Error: ' + e.message); return; }

        const copy = Object.assign({}, result);
        delete copy._graphLayout;
        const json = JSON.stringify(copy, null, 2);

        const existing = document.getElementById('ng-json-modal');
        if (existing) { existing.remove(); return; }
        const modal = document.createElement('div');
        modal.id = 'ng-json-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center';
        modal.innerHTML = `
        <div style="background:#0d1117;border:1px solid #30363d;border-radius:12px;padding:22px;width:640px;max-width:95vw">
            <h3 style="margin:0 0 8px;color:#bb86fc">📋 Compiled Event JSON</h3>
            <p style="color:#8b949e;font-size:11px;margin:0 0 10px">This is what the game engine will receive. Read-only preview.</p>
            <textarea rows="18" readonly style="width:100%;font-family:monospace;font-size:11px;
                background:#010409;border:1px solid #21262d;color:#e8eef6;
                padding:10px;border-radius:6px;resize:vertical;box-sizing:border-box">${json}</textarea>
            <div style="display:flex;justify-content:flex-end;margin-top:12px">
                <button onclick="document.getElementById('ng-json-modal').remove()"
                    style="padding:7px 16px;border-radius:6px;border:1px solid #30363d;
                           background:rgba(255,255,255,.05);color:#8b949e;cursor:pointer;
                           font-family:'Courier New',monospace;font-size:11px">Close</button>
            </div>
        </div>`;
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    },
};

// ------------------------------------------------------------------
// MODULE-LEVEL HELPERS (not on the object to avoid df- conflicts)
// ------------------------------------------------------------------
function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _coerce(v) {
    if (v === 'true')  return true;
    if (v === 'false') return false;
    const n = Number(v);
    return (!isNaN(n) && String(v).trim() !== '') ? n : v;
}
