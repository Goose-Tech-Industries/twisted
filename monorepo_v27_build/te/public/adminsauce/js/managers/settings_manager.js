// =================================================================
// SETTINGS MANAGER v2 — Full label + config system
// =================================================================
// HOW LABELS WORK:
//   1. Saved here as game_settings key/value pairs
//   2. Server sends them to every player on join_game as window.LABELS
//   3. All UI files read from window.LABELS with a fallback default
//
// This means you can sell this engine and every buyer can rename
// "Blood Ogham" to "Rune Slots", "Limit Break" to "Overdrive",
// "XP" to "Soul Shards" — entirely from this panel.
// =================================================================
const SettingsManager = {
    data: {},
    _tab: 'labels_identity',

    // All the labels the engine uses, organized into groups
    // format: [key, friendlyName, default, hint?]
    LABEL_GROUPS: {
        labels_identity: {
            title: '🎮 Game Identity',
            desc:  'Core game name and currency. Shown everywhere.',
            rows: [
                ['label_game_name',    'Game Name',              'Twisted Engine', 'Shown in page title and UI'],
                ['label_currency',     'Currency Name',          'Gold',           'e.g. Gold, Coins, Souls'],
                ['label_currency_icon','Currency Icon',          '💰',             'Emoji shown next to amounts'],
                ['label_experience',   'Experience Label',       'XP',             'e.g. XP, Soul Shards, Points'],
                ['label_level',        'Level Label',            'Lv',             'e.g. Lv, Level, Tier'],
            ]
        },
        labels_battle: {
            title: '⚔️ Battle System',
            desc:  'Labels shown in the battle UI.',
            rows: [
                ['label_attack',       'Attack Command',         'Attack',         'Default physical attack button'],
                ['label_defend',       'Defend Command',         'Defend',         'Default defend/block button'],
                ['label_skills_menu',  'Skills Menu Label',      'Skills',         'The sub-menu button in battle'],
                ['label_items_menu',   'Items Menu Label',       'Items',          'The items sub-menu button'],
                ['label_limit_break',  'Limit Break Name',       'Limit Break',    'The ultimate gauge name'],
                ['label_limit_icon',   'Limit Break Icon',       '⚡',             'Icon shown on the gauge'],
                ['label_crit',         'Critical Hit Text',      'CRITICAL!',      'Shown when a crit lands'],
                ['label_miss',         'Miss Text',              'MISS!',          'Shown when an attack misses'],
            ]
        },
        labels_ogham: {
            title: '🩸 Blood Ogham System',
            desc:  'Rename the entire socketed rune system. Buyers can rebrand this completely.',
            rows: [
                ['label_ogham_system', 'System Name',            'Blood Ogham',    'e.g. Rune Slots, Materia, Crystals, Glyphs'],
                ['label_ogham_plural', 'System Name (plural)',   'Blood Oghams',   'e.g. Runes, Materia, Shards'],
                ['label_ogham_slot',   'Slot Name',              'Ogham Groove',   'e.g. Socket, Slot, Rune Slot'],
                ['label_ogham_slots',  'Slot Name (plural)',     'Ogham Grooves',  'e.g. Sockets, Slots'],
                ['label_ogham_rank1',  'Rank 1 Name',            'Carved',         'e.g. Basic, Tier I, Common'],
                ['label_ogham_rank2',  'Rank 2 Name',            'Inscribed',      'e.g. Enhanced, Tier II, Rare'],
                ['label_ogham_rank3',  'Rank 3 Name',            'Bloodbound',     'e.g. Mastered, Tier III, Legendary'],
                ['label_ogham_rankup', 'Rank-Up Notification',   '— your {system} deepens!', '{system} = system name, {name} = ogham name'],
                ['label_ogham_lore',   'Lore Prefix',            'Blood Ogham are carved prayers to things that should not answer.', 'Shown in the item description'],
            ]
        },
        labels_stats: {
            title: '📊 Stat Names',
            desc:  'Rename any stat. ATK could be "Power", DEF could be "Armor", etc.',
            rows: [
                ['label_stat_atk',   'ATK Label',    'ATK',    'Physical attack power'],
                ['label_stat_def',   'DEF Label',    'DEF',    'Physical defense'],
                ['label_stat_mo',    'MO Label',     'MO',     'Magic Offense'],
                ['label_stat_md',    'MD Label',     'MD',     'Magic Defense'],
                ['label_stat_speed', 'Speed Label',  'Speed',  'Turn order / evasion'],
                ['label_stat_luck',  'Luck Label',   'Luck',   'Crit / item find chance'],
                ['label_stat_hp',    'HP Label',     'HP',     'Hit Points / Health'],
                ['label_stat_mp',    'MP Label',     'MP',     'Magic Points / Mana'],
            ]
        },
        labels_ui: {
            title: '🖥️ UI & Panels',
            desc:  'Labels on menus, panels, and notifications.',
            rows: [
                ['label_inventory',   'Inventory Tab',     'Inventory',   ''],
                ['label_equipment',   'Equipment Tab',     'Equipment',   ''],
                ['label_character',   'Character Tab',     'Character',   ''],
                ['label_skills_tab',  'Skills Tab',        'Skills',      ''],
                ['label_quests_tab',  'Quests Tab',        'Quests',      ''],
                ['label_party',       'Party Label',       'Party',       ''],
                ['label_guild',       'Guild Label',       'Guild',       ''],
                ['label_rank_up_msg', 'Level Up Message',  'Level Up!',   'Shown when player levels up'],
                ['label_victory',     'Victory Screen',    'VICTORY',     'Shown when winning a battle'],
                ['label_defeat',      'Defeat Screen',     'DEFEATED',    'Shown when losing a battle'],
            ]
        },
        config_gameplay: {
            title: '⚙️ Gameplay Config',
            desc:  'Numbers that affect game balance. Changes are live immediately.',
            rows: [
                ['config_xp_multiplier',    'XP Multiplier',          '1',      'e.g. 2 = double XP for all'],
                ['config_gold_multiplier',  'Gold Multiplier',        '1',      'e.g. 1.5 = 50% more gold'],
                ['config_crit_chance_base', 'Base Crit Chance %',     '10',     'Default crit % before luck'],
                ['config_ogham_drop_chance','Ogham Drop Chance %',    '5',      'Chance enemies drop an Ogham'],
                ['config_pvp_enabled',      'PvP Enabled',            'true',   'Allow player vs player combat'],
                ['config_respawn_hp_pct',   'Respawn HP %',           '50',     '% of max HP restored on respawn'],
                ['pvp_team_size',            'PvP Team Size',          '3',      'Max characters per user in 3v3 PvP (1–6)'],
                ['max_dungeon_size',         'Max Dungeon Party Size', '5',      'Max players allowed in a dungeon party (1–6)'],
                ['max_party_size',           'Max Party Size',         '4',      'Max players in a standard party'],
                ['battle_grid_w',            'Battle Grid Width',      '8',      'Horizontal tile count for tactical battles (6–16)'],
                ['battle_grid_h',            'Battle Grid Height',     '5',      'Vertical tile count for tactical battles (4–10)'],
            ]
        },
        // config_ai is handled by a custom renderer -- listed here so the tab button appears.
        login_rewards: {
            title: '🎁 Login Rewards',
            desc:  'Configure daily login reward amounts for each streak day.',
            rows:  []   // rendered by custom renderer below
        },
        config_ai: {
            title: '🤖 AI Brain',
            desc:  'Configure the AI provider that powers NPC dialogue. Changes take effect within 60 seconds — no restart needed.',
            rows:  []
        },
        config_referral: {
            title: '🔗 Referral Rewards',
            desc:  'When a referred player reaches the threshold level, the player who invited them earns gold and optional bonus XP. Set gold/XP to 0 to disable.',
            rows: [
                ['referral_threshold_level', 'Threshold Level',  '5',   'The level a referred player must reach to trigger the reward'],
                ['referral_gold_reward',      'Gold Reward',      '500', 'Gold awarded to the referrer (0 = disabled)'],
                ['referral_xp_reward',        'Bonus XP Reward',  '0',   'Bonus XP awarded to the referrer (0 = disabled)'],
            ]
        }
    },

    init: async () => {
        document.getElementById('pageTitle').innerText = '⚙️ SYSTEM SETTINGS';
        const r = await API.post('/admin/get-settings');
        if (r.success) { SettingsManager.data = r.data; SettingsManager.render(); }
        else document.getElementById('dynamicArea').innerHTML = '<p style="color:red">Error loading settings.</p>';
    },

    render: () => {
        const d = SettingsManager.data;
        const groups = SettingsManager.LABEL_GROUPS;
        const activeTab = SettingsManager._tab;

        // Tab bar
        const tabs = Object.entries(groups).map(([key, g]) =>
            `<button onclick="SettingsManager._tab='${key}';SettingsManager.render()"
                style="padding:8px 14px;border:none;cursor:pointer;font-size:12px;font-weight:600;
                border-bottom:3px solid ${activeTab===key?'var(--a)':'transparent'};
                background:${activeTab===key?'var(--bg2)':'transparent'};color:${activeTab===key?'var(--a)':'var(--td)'};
                border-radius:6px 6px 0 0;white-space:nowrap">
                ${g.title}
            </button>`
        ).join('');

        const group = groups[activeTab];
        const rows = group.rows;

        // ── CUSTOM RENDERER: AI Brain tab ─────────────────────────────
        if (activeTab === 'config_ai') {
            SettingsManager._renderAiTab(tabs, group.desc);
            return;
        }

        // ── CUSTOM RENDERER: Login Rewards tab ────────────────────────
        if (activeTab === 'login_rewards') {
            SettingsManager._renderLoginRewardsTab(tabs);
            return;
        }

        // Build the label editor grid
        let gridHtml = '';
        rows.forEach(([key, friendlyName, defaultVal, hint]) => {
            const current = d[key] !== undefined ? d[key] : defaultVal;
            const isBool = defaultVal === 'true' || defaultVal === 'false';
            const isNum  = !isBool && !isNaN(defaultVal) && defaultVal !== '';
            const isDirty = d[key] !== undefined && d[key] !== defaultVal;

            let input;
            if (isBool) {
                input = `<select onchange="SettingsManager.saveSetting('${key}',this.value)"
                    style="padding:6px 8px;border-radius:4px;border:1px solid var(--b);background:var(--bg3);color:#fff;width:100%">
                    <option value="true"  ${current==='true' ?'selected':''}>✅ Enabled</option>
                    <option value="false" ${current==='false'?'selected':''}>❌ Disabled</option>
                </select>`;
            } else {
                input = `<input value="${SettingsManager._esc(String(current))}"
                    onchange="SettingsManager.saveSetting('${key}',this.value)"
                    style="width:100%;padding:6px 8px;border-radius:4px;border:1px solid ${isDirty?'var(--a)':'var(--b)'};
                    background:var(--bg3);color:#fff">`;
            }

            gridHtml += `
            <div style="background:var(--bg2);border:1px solid ${isDirty?'var(--a)':'var(--b)'};
                border-radius:8px;padding:12px;position:relative">
                ${isDirty ? `<div style="position:absolute;top:8px;right:8px;font-size:9px;
                    background:var(--a);color:#000;padding:2px 6px;border-radius:10px;font-weight:700">CUSTOM</div>` : ''}
                <div style="font-size:12px;font-weight:600;color:#ccc;margin-bottom:2px">${friendlyName}</div>
                ${hint ? `<div style="font-size:10px;color:#555;margin-bottom:6px">${hint}</div>` : '<div style="margin-bottom:6px"></div>'}
                <div style="display:flex;gap:6px;align-items:center">
                    <div style="flex:1">${input}</div>
                    ${isDirty ? `<button class="del-btn" style="padding:4px 8px;font-size:11px;white-space:nowrap"
                        onclick="SettingsManager.reset('${key}','${SettingsManager._esc(defaultVal)}')"
                        title="Reset to default: ${SettingsManager._esc(defaultVal)}">↩</button>` : ''}
                </div>
                <div style="font-size:10px;color:#444;margin-top:4px;font-family:monospace">${key}</div>
            </div>`;
        });

        // Custom settings section (keys not in any group)
        const knownKeys = new Set(Object.values(groups).flatMap(g => g.rows.map(r => r[0])));
        const customKeys = Object.keys(d).filter(k => !knownKeys.has(k)).sort();

        let customHtml = '';
        if (customKeys.length) {
            customHtml = `
            <div style="margin-top:24px">
                <h3 style="color:var(--td);font-size:13px;margin-bottom:12px">🔧 CUSTOM SETTINGS</h3>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                ${customKeys.map(key => {
                    const val = d[key];
                    const isBool = val==='true'||val==='false';
                    const isNum  = !isBool && !isNaN(val) && val!=='';
                    let input;
                    if (isBool) {
                        input = `<select onchange="SettingsManager.saveSetting('${key}',this.value)" style="margin-top:4px;padding:4px 8px">
                            <option value="true" ${val==='true'?'selected':''}>✅ Enabled</option>
                            <option value="false" ${val==='false'?'selected':''}>❌ Disabled</option>
                        </select>`;
                    } else if (isNum) {
                        input = `<input type="number" value="${val}" onchange="SettingsManager.saveSetting('${key}',this.value)" style="margin-top:4px;width:100px;padding:4px 8px">`;
                    } else {
                        input = `<input value="${SettingsManager._esc(val)}" onchange="SettingsManager.saveSetting('${key}',this.value)" style="margin-top:4px;padding:4px 8px">`;
                    }
                    return `<div style="background:var(--bg2);border:1px solid var(--b);border-radius:6px;padding:12px;display:flex;align-items:center;gap:10px">
                        <div style="flex:1">
                            <div style="font-size:12px;color:var(--td);font-family:monospace">${key}</div>${input}
                        </div>
                        <button class="del-btn" style="padding:4px 8px" onclick="SettingsManager.delSetting('${key}')">✕</button>
                    </div>`;
                }).join('')}
                </div>
            </div>`;
        }

        document.getElementById('dynamicArea').innerHTML = `
        <div style="border-bottom:1px solid var(--b);margin-bottom:20px;padding-bottom:0;display:flex;flex-wrap:wrap;gap:4px">
            ${tabs}
        </div>
        <div style="margin-bottom:12px">
            <p style="color:var(--td);font-size:12px;margin:0 0 4px">${group.desc}</p>
            <p style="color:#555;font-size:11px;margin:0">
                Labels marked <span style="background:var(--a);color:#000;padding:1px 5px;border-radius:10px;font-size:9px;font-weight:700">CUSTOM</span>
                are overriding their default. Click ↩ to reset. Changes are live immediately.
            </p>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            ${gridHtml}
        </div>
        <div style="margin-top:16px">
            <button class="edit-btn" onclick="SettingsManager.addCustom()">+ Add Custom Setting</button>
            <button class="action-btn" onclick="SettingsManager.exportLabels()" style="margin-left:8px">📋 Export All Labels</button>
        </div>
        ${customHtml}`;
    },

    saveSetting: async (key, value) => {
        const r = await API.post('/admin/save-setting', { key, value });
        if (r.success) {
            SettingsManager.data[key] = value;
            const el = event?.target;
            if (el) { el.style.borderColor='var(--g)'; setTimeout(()=>el.style.borderColor='',1200); }
            SettingsManager.render();
        }
    },

    reset: async (key, defaultVal) => {
        await SettingsManager.saveSetting(key, defaultVal);
    },

    addCustom: () => {
        // Inline form instead of prompt()
        const area = document.getElementById('dynamicArea');
        const existing = document.getElementById('sm_add_form');
        if (existing) { existing.remove(); return; }
        const form = document.createElement('div');
        form.id = 'sm_add_form';
        form.style.cssText = 'background:var(--bg2);border:1px solid var(--a);border-radius:8px;padding:16px;margin-top:16px;display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end';
        form.innerHTML = `
            <div><label style="font-size:11px">Setting Key (no spaces)</label>
                <input id="sm_new_key" placeholder="e.g. my_custom_label" style="margin-top:4px"></div>
            <div><label style="font-size:11px">Value</label>
                <input id="sm_new_val" value="true" style="margin-top:4px"></div>
            <div style="display:flex;gap:6px">
                <button class="action-btn save-btn" onclick="SettingsManager._doAdd()">ADD</button>
                <button class="del-btn" onclick="document.getElementById('sm_add_form').remove()">✕</button>
            </div>`;
        area.appendChild(form);
        document.getElementById('sm_new_key').focus();
    },

    _doAdd: async () => {
        const key = document.getElementById('sm_new_key')?.value?.trim().replace(/\s+/g,'_');
        const val = document.getElementById('sm_new_val')?.value;
        if (!key) { alert('Key is required'); return; }
        await SettingsManager.saveSetting(key, val);
    },

    delSetting: async (key) => {
        if (!confirm(`Delete setting "${key}"?`)) return;
        const r = await API.post('/admin/delete-setting', { key });
        if (r.success) { delete SettingsManager.data[key]; SettingsManager.render(); }
    },

    exportLabels: () => {
        const out = {};
        Object.values(SettingsManager.LABEL_GROUPS).forEach(g =>
            g.rows.forEach(([key,,def]) => { out[key] = SettingsManager.data[key] ?? def; })
        );
        const json = JSON.stringify(out, null, 2);
        const blob = new Blob([json], { type:'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'twisted_engine_labels.json';
        a.click();
    },

    _esc: (s) => String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'),

    // ── AI BRAIN TAB RENDERER ──────────────────────────────────────
    _renderAiTab: (tabsHtml, desc) => {
        const d   = SettingsManager.data;
        const get = (k, def) => d[k] !== undefined ? d[k] : def;

        const provider = get('ai_provider', 'disabled');
        const isOllama = provider === 'ollama';
        const isOAI    = provider === 'openai';
        const needsKey = provider === 'gemini' || provider === 'anthropic' || provider === 'openai';

        const providerHints = {
            disabled:  'No AI — NPCs use smart rule-based replies. Always works.',
            gemini:    'Google Gemini. Get a free API key at aistudio.google.com. Default model: gemini-1.5-flash.',
            anthropic: 'Anthropic Claude. Get a key at console.anthropic.com. Default model: claude-haiku-4-5-20251001.',
            openai:    'OpenAI or any OpenAI-compatible API (Groq, LM Studio, Together, etc.). Default model: gpt-4o-mini.',
            ollama:    'Self-hosted Ollama. Set the base URL to your Ollama instance. Default model: llama3.'
        };

        const defaultModels = {
            gemini: 'gemini-1.5-flash', anthropic: 'claude-haiku-4-5-20251001',
            openai: 'gpt-4o-mini', ollama: 'llama3', disabled: ''
        };

        document.getElementById('dynamicArea').innerHTML = `
        <div style="border-bottom:1px solid var(--b);margin-bottom:20px;padding-bottom:0;display:flex;flex-wrap:wrap;gap:4px">
            ${tabsHtml}
        </div>
        <p style="color:var(--td);font-size:12px;margin:0 0 16px">${desc}</p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">

            <!-- Provider -->
            <div style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:14px;grid-column:1/-1">
                <div style="font-size:12px;font-weight:600;color:#ccc;margin-bottom:4px">AI PROVIDER</div>
                <div style="font-size:10px;color:#555;margin-bottom:8px" id="ai_provider_hint">${providerHints[provider]||''}</div>
                <select id="ai_provider_sel" onchange="SettingsManager._onProviderChange(this.value)"
                    style="width:100%;padding:8px;background:var(--bg3);border:1px solid var(--b);color:#fff;border-radius:4px">
                    <option value="disabled"  ${provider==='disabled' ?'selected':''}>🚫 Disabled (rule-based only)</option>
                    <option value="gemini"    ${provider==='gemini'   ?'selected':''}>✨ Gemini (Google — free tier)</option>
                    <option value="anthropic" ${provider==='anthropic'?'selected':''}>🤖 Claude (Anthropic)</option>
                    <option value="openai"    ${provider==='openai'   ?'selected':''}>🟢 OpenAI / OpenAI-compatible</option>
                    <option value="ollama"    ${provider==='ollama'   ?'selected':''}>🦙 Ollama (self-hosted)</option>
                </select>
            </div>

            <!-- API Key -->
            <div id="ai_key_row" style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:14px;${needsKey?'':'opacity:0.4;pointer-events:none'}">
                <div style="font-size:12px;font-weight:600;color:#ccc;margin-bottom:2px">API KEY</div>
                <div style="font-size:10px;color:#555;margin-bottom:8px">Stored in the database. Keep your DB secured on the server.</div>
                <input id="ai_key_inp" type="password" value="${SettingsManager._esc(get('ai_api_key',''))}"
                    placeholder="Paste your API key here…"
                    onchange="SettingsManager.saveSetting('ai_api_key',this.value)"
                    style="width:100%;padding:7px 8px;background:var(--bg3);border:1px solid var(--b);color:#fff;border-radius:4px">
                <label style="font-size:10px;color:#555;margin-top:4px;display:flex;align-items:center;gap:4px;cursor:pointer">
                    <input type="checkbox" onchange="document.getElementById('ai_key_inp').type=this.checked?'text':'password'">
                    Show key
                </label>
            </div>

            <!-- Model -->
            <div style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:14px">
                <div style="font-size:12px;font-weight:600;color:#ccc;margin-bottom:2px">MODEL</div>
                <div style="font-size:10px;color:#555;margin-bottom:8px">Leave blank to use the default for your provider.</div>
                <input id="ai_model_inp" value="${SettingsManager._esc(get('ai_model',''))}"
                    placeholder="${defaultModels[provider]||'e.g. llama3'}"
                    onchange="SettingsManager.saveSetting('ai_model',this.value)"
                    style="width:100%;padding:7px 8px;background:var(--bg3);border:1px solid var(--b);color:#fff;border-radius:4px">
            </div>

            <!-- Base URL (Ollama / OpenAI-compat) -->
            <div id="ai_url_row" style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:14px;${isOllama||isOAI?'':'opacity:0.4;pointer-events:none'};grid-column:1/-1">
                <div style="font-size:12px;font-weight:600;color:#ccc;margin-bottom:2px">BASE URL <span style="color:#555;font-weight:400">(Ollama / OpenAI-compatible only)</span></div>
                <div style="font-size:10px;color:#555;margin-bottom:8px">e.g. http://localhost:11434/api/generate for Ollama, or http://localhost:1234/v1 for LM Studio</div>
                <input value="${SettingsManager._esc(get('ai_base_url',''))}"
                    placeholder="http://localhost:11434/api/generate"
                    onchange="SettingsManager.saveSetting('ai_base_url',this.value)"
                    style="width:100%;padding:7px 8px;background:var(--bg3);border:1px solid var(--b);color:#fff;border-radius:4px">
            </div>

            <!-- Temperature -->
            <div style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:14px">
                <div style="font-size:12px;font-weight:600;color:#ccc;margin-bottom:2px">TEMPERATURE <span id="ai_temp_val" style="color:var(--a)">${get('ai_temperature','0.85')}</span></div>
                <div style="font-size:10px;color:#555;margin-bottom:8px">0.0 = robotic and predictable. 1.0 = very creative but sometimes chaotic. 0.85 is the sweet spot.</div>
                <input type="range" min="0" max="1" step="0.05" value="${get('ai_temperature','0.85')}"
                    oninput="document.getElementById('ai_temp_val').innerText=this.value"
                    onchange="SettingsManager.saveSetting('ai_temperature',this.value)"
                    style="width:100%;accent-color:var(--a)">
            </div>

            <!-- Max Tokens -->
            <div style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:14px">
                <div style="font-size:12px;font-weight:600;color:#ccc;margin-bottom:2px">MAX TOKENS</div>
                <div style="font-size:10px;color:#555;margin-bottom:8px">Max length of each NPC reply. 256 is plenty for 1–3 sentences. Higher = more expensive per call.</div>
                <input type="number" min="64" max="1024" step="32" value="${get('ai_max_tokens','256')}"
                    onchange="SettingsManager.saveSetting('ai_max_tokens',this.value)"
                    style="width:100%;padding:7px 8px;background:var(--bg3);border:1px solid var(--b);color:#fff;border-radius:4px">
            </div>

            <!-- System Prompt -->
            <div style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:14px;grid-column:1/-1">
                <div style="font-size:12px;font-weight:600;color:#ccc;margin-bottom:2px">WORLD SYSTEM PROMPT</div>
                <div style="font-size:10px;color:#555;margin-bottom:8px">
                    Injected into every NPC prompt as the opening world context. This is how you set the tone and lore
                    of your world. Leave blank to use the built-in Celtic dark fantasy default.
                </div>
                <textarea rows="5" onchange="SettingsManager.saveSetting('ai_system_prompt',this.value)"
                    placeholder="e.g. a dark Celtic fantasy world where the dead do not always stay dead, and every oath has a price. Dialogue should be weary, grounded, and tinged with dread."
                    style="width:100%;padding:8px;background:var(--bg3);border:1px solid var(--b);color:#fff;border-radius:4px;resize:vertical;font-family:monospace;font-size:12px"
                >${SettingsManager._esc(get('ai_system_prompt',''))}</textarea>
            </div>

        </div>

        <!-- Test button + result -->
        <div style="margin-top:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <button class="action-btn" onclick="SettingsManager._testAi()" style="padding:10px 20px;font-size:13px">
                🧪 Test Connection
            </button>
            <span style="font-size:11px;color:#555">Sends a live test message to your configured AI. Takes a few seconds.</span>
        </div>
        <div id="ai_test_result" style="margin-top:12px"></div>
        `;
    },

    _renderLoginRewardsTab: async (tabs) => {
        // TEACHING: Daily login rewards are stored as a JSON array in system_settings
        // under the key 'daily_login_rewards'. The array has 7 numbers (one per streak day).
        // Day 7+ always repeats the last value. The admin can change all 7 here.
        const area = document.getElementById('dynamicArea');
        area.innerHTML = `
        <div style="display:flex;gap:0;border-bottom:1px solid var(--b);margin-bottom:20px;flex-wrap:wrap">
            ${tabs}
        </div>
        <h3 style="color:var(--a);margin-bottom:4px">🎁 Daily Login Rewards</h3>
        <p style="font-size:12px;color:#666;margin-bottom:18px">
            Gold awarded when a player logs in on consecutive days. Day 7+ repeats the Day 7 amount.
            Players who miss a day reset to Day 1.
        </p>
        <div id="loginRewardsForm" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;max-width:700px">
            <div style="color:#666;font-size:12px;grid-column:1/-1">⏳ Loading…</div>
        </div>
        <button class="action-btn" onclick="SettingsManager._saveLoginRewards()"
            style="margin-top:20px;padding:10px 24px">💾 Save Rewards</button>
        <div id="loginRewardsSaved" style="display:inline-block;margin-left:12px;font-size:12px;color:var(--g)"></div>`;

        // Load current values from system_settings
        try {
            const r = await API.post('/admin/get-settings');
            let rewards = [50, 100, 150, 200, 300, 400, 500];
            if (r.success && r.data && r.data.daily_login_rewards) {
                try { rewards = JSON.parse(r.data.daily_login_rewards); } catch {}
            }
            const form = document.getElementById('loginRewardsForm');
            form.innerHTML = rewards.slice(0,7).map((amt, i) => `
                <div style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:12px;text-align:center">
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#888;margin-bottom:6px">
                        Day ${i+1}${i===6?' (& beyond)':''}
                    </div>
                    <div style="font-size:22px;margin-bottom:6px">
                        ${['🥉','🥈','🥇','💎','👑','⚡','🌟'][i]}
                    </div>
                    <input type="number" id="lr_day_${i}" value="${amt}" min="0" max="99999"
                        style="width:80px;padding:6px;background:var(--bg3);border:1px solid var(--b);
                        color:#fff;border-radius:4px;text-align:center;font-size:14px">
                    <div style="font-size:10px;color:#ffaa00;margin-top:4px">💰 gold</div>
                </div>`).join('');
        } catch (e) {
            document.getElementById('loginRewardsForm').innerHTML = `<p style="color:red">Error: ${e.message}</p>`;
        }
    },

    _saveLoginRewards: async () => {
        const rewards = [];
        for (let i = 0; i < 7; i++) {
            const el = document.getElementById('lr_day_' + i);
            rewards.push(el ? parseInt(el.value) || 0 : 0);
        }
        try {
            const r = await API.post('/admin/save-setting', {
                key:   'daily_login_rewards',
                value: JSON.stringify(rewards)
            });
            const msg = document.getElementById('loginRewardsSaved');
            if (r.success) {
                msg.textContent = '✅ Saved!';
                setTimeout(() => { msg.textContent = ''; }, 3000);
            } else {
                msg.style.color = 'red';
                msg.textContent = '❌ ' + (r.message || 'Failed');
            }
        } catch (e) {
            document.getElementById('loginRewardsSaved').textContent = '❌ ' + e.message;
        }
    },

    _onProviderChange: async (value) => {
        await SettingsManager.saveSetting('ai_provider', value);
        SettingsManager.render();  // re-render so UI shows/hides URL field etc.
    },

    _testAi: async () => {
        const box = document.getElementById('ai_test_result');
        box.innerHTML = '<span style="color:#888;font-size:12px">⏳ Sending test message…</span>';
        const t = Date.now();
        try {
            const r = await API.post('/admin/test-ai', {});
            if (r.success) {
                box.innerHTML = `
                <div style="background:var(--bg2);border:1px solid var(--g);border-radius:8px;padding:14px">
                    <div style="font-size:10px;color:var(--g);font-weight:700;margin-bottom:6px">
                        ✅ ${r.provider.toUpperCase()}${r.model && r.model !== '(default)' ? ' · ' + r.model : ''} · ${r.ms}ms
                    </div>
                    <div style="font-size:13px;color:#ddd;font-style:italic">"${r.reply}"</div>
                </div>`;
            } else {
                box.innerHTML = `<div style="background:#200;border:1px solid red;border-radius:8px;padding:12px;color:#f88;font-size:12px">
                    ❌ ${r.message}</div>`;
            }
        } catch (e) {
            box.innerHTML = `<div style="color:red;font-size:12px">❌ ${e.message}</div>`;
        }
    }
};

