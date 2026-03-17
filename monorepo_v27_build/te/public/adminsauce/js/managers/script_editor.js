// =================================================================
// SCRIPT EDITOR v2.0 — Event Action List Builder
// Now with live dropdowns — no more typing raw IDs!
// =================================================================
const ScriptEditor = {

    // Live lookup caches (filled on open)
    _cache: { items:[], quests:[], shops:[], npcs:[], classes:[], factions:[], maps:[], skills:[] },

    ACTION_TYPES: {
        DIALOGUE:       { label: '💬 Dialogue',       fields: [{ key: 'speaker', label: 'Speaker', type: 'text' }, { key: 'text', label: 'Text', type: 'textarea' }] },
        CHOICE:         { label: '🔀 Choice',          fields: [{ key: 'prompt', label: 'Prompt', type: 'text' }], special: 'choice' },
        SET_FLAG:       { label: '🚩 Set Flag',        fields: [{ key: 'key', label: 'Flag Name', type: 'text' }, { key: 'value', label: 'Value', type: 'text' }] },
        INC_FLAG:       { label: '➕ Inc Flag',        fields: [{ key: 'key', label: 'Flag Name', type: 'text' }, { key: 'amount', label: 'Amount', type: 'number', default: 1 }] },
        TELEPORT:       { label: '🚪 Teleport',        fields: [{ key: 'mapId', label: 'Map', type: 'db_map' }, { key: 'x', label: 'X', type: 'number', default: 10 }, { key: 'y', label: 'Y', type: 'number', default: 10 }] },
        GIVE_ITEM:      { label: '📦 Give Item',       fields: [{ key: 'itemId', label: 'Item', type: 'db_item' }, { key: 'quantity', label: 'Qty', type: 'number', default: 1 }] },
        TAKE_ITEM:      { label: '🗑️ Take Item',      fields: [{ key: 'itemId', label: 'Item', type: 'db_item' }, { key: 'quantity', label: 'Qty', type: 'number', default: 1 }] },
        GIVE_GOLD:      { label: '💰 Give Gold',       fields: [{ key: 'amount', label: 'Amount', type: 'number' }] },
        GIVE_XP:        { label: '⭐ Give XP',         fields: [{ key: 'amount', label: 'Amount', type: 'number' }] },
        HEAL:           { label: '💚 Heal',            fields: [{ key: 'hp', label: 'HP (formula/MAX)', type: 'text' }, { key: 'mp', label: 'MP (formula/MAX)', type: 'text' }] },
        DAMAGE:         { label: '💥 Damage',          fields: [{ key: 'hp', label: 'HP Damage (formula)', type: 'text' }] },
        QUEST_START:    { label: '📜 Start Quest',     fields: [{ key: 'questId', label: 'Quest', type: 'db_quest' }] },
        QUEST_ADVANCE:  { label: '📜 Advance Quest',   fields: [{ key: 'questId', label: 'Quest', type: 'db_quest' }] },
        QUEST_COMPLETE: { label: '🏆 Complete Quest',  fields: [{ key: 'questId', label: 'Quest', type: 'db_quest' }] },
        NPC_TALK:       { label: '🗣️ NPC Talk',       fields: [{ key: 'npcName', label: 'NPC', type: 'db_npc_name' }] },
        SHOP:           { label: '🪙 Open Shop',       fields: [{ key: 'shopId', label: 'Shop', type: 'db_shop' }] },
        BATTLE:         { label: '⚔️ Start Battle',    fields: [{ key: 'enemyId', label: 'Enemy NPC', type: 'db_npc_id' }] },
        SOUND:          { label: '🔊 Play Sound',      fields: [{ key: 'file', label: 'Filename', type: 'text' }] },
        SCREEN_EFFECT:  { label: '✨ Screen Effect',   fields: [{ key: 'effect', label: 'Effect', type: 'select', options: ['shake','flash','fade'] }, { key: 'duration', label: 'Duration (ms)', type: 'number', default: 500 }] },
        WAIT:           { label: '⏱️ Wait',            fields: [{ key: 'ms', label: 'Milliseconds', type: 'number', default: 1000 }] },
        SET_MAP_FLAG:   { label: '🌍 Set Map Flag',    fields: [{ key: 'key', label: 'Flag Name', type: 'text', placeholder: 'e.g. lantern_3_5' }, { key: 'value', label: 'Value', type: 'text', placeholder: 'true / false / 42' }], hint: 'Shared flag for all players on this map.' },
        OBJECT_STATE:   { label: '🔦 Object State',    fields: [{ key: 'flagKey', label: 'Object Flag Key', type: 'text', placeholder: 'e.g. lantern_3_5' }, { key: 'lit', label: 'Lit', type: 'select', options: ['true','false'] }] },
        IF:             { label: '❓ Conditional',      fields: [], special: 'conditional' },
        SET_WORLD_FLAG: { label: '🌍 World Flag',      fields: [{ key: 'key', label: 'Flag Name', type: 'text', placeholder: 'e.g. goblin_boss_slain' }, { key: 'value', label: 'Value', type: 'text', default: 'true' }], hint: 'Global flag seen by all NPCs everywhere.' },
        SET_NPC_MOOD:   { label: '😶 NPC Mood',        fields: [{ key: 'npcName', label: 'NPC', type: 'db_npc_name' }, { key: 'mood', label: 'Mood', type: 'select', options: ['happy','fearful','angry','grieving','excited','(clear)'], default: 'fearful' }] },
        KILL_NPC:       { label: '💀 Kill NPC',        fields: [{ key: 'npcName', label: 'NPC', type: 'db_npc_name' }, { key: 'cause', label: 'Death Cause', type: 'text', placeholder: 'e.g. Slain by the shadow wraith' }] },
        FACTION_REP:    { label: '⚔️ Faction Rep',     fields: [{ key: 'factionId', label: 'Faction', type: 'db_faction' }, { key: 'delta', label: 'Amount (+/-)', type: 'number', default: 10, placeholder: 'e.g. 10 or -20' }], hint: 'Cascades to rival factions at 50%.' }
    },

    CONDITION_TYPES: {
        FLAG:     { label: 'Flag Check',   fields: [{ key: 'key', label: 'Flag', type: 'text' }, { key: 'op', label: 'Op (==,!=,>,<)', type: 'text', default: '==' }, { key: 'value', label: 'Value', type: 'text' }] },
        LEVEL:    { label: 'Level Check',  fields: [{ key: 'op', label: 'Op', type: 'text', default: '>=' }, { key: 'value', label: 'Level', type: 'number' }] },
        HAS_ITEM: { label: 'Has Item',     fields: [{ key: 'itemId', label: 'Item', type: 'db_item' }, { key: 'quantity', label: 'Qty', type: 'number', default: 1 }] },
        RANDOM:   { label: 'Random %',     fields: [{ key: 'chance', label: '% Chance', type: 'number', default: 50 }] },
        CLASS:    { label: 'Is Class',     fields: [{ key: 'classId', label: 'Class', type: 'db_class' }] }
    },

    _callback: null,
    _event: null,

    // Pre-load all dropdown data, THEN render
    open: async (event, callback) => {
        ScriptEditor._callback = callback;
        ScriptEditor._event = event || { trigger: 'INTERACT', conditions: [], actions: [] };

        // Load all lookup tables in parallel
        const [ir, qr, sr, nr, cr, fr, mr] = await Promise.all([
            API.getAll('item'), API.getAll('quest'), API.getAll('shop'),
            API.getAll('npc'),  API.getAll('class'), API.getAll('faction'),
            API.getAll('map')
        ]);
        ScriptEditor._cache = {
            items:    ir.success ? ir.data : [],
            quests:   qr.success ? qr.data : [],
            shops:    sr.success ? sr.data : [],
            npcs:     nr.success ? nr.data : [],
            classes:  cr.success ? cr.data : [],
            factions: fr.success ? fr.data : [],
            maps:     mr.success ? mr.data : []
        };

        ScriptEditor.render();
    },

    render: () => {
        const ev = ScriptEditor._event;
        document.getElementById('dynamicArea').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;color:var(--a)">📝 Event Script Editor</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="ScriptEditor.save()">💾 SAVE EVENT</button>
                <button class="edit-btn" onclick="ScriptEditor.viewJSON()">{ } JSON</button>
                <button class="edit-btn" onclick="ScriptEditor._callback(null)">CANCEL</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
            <div style="background:var(--bg2);padding:16px;border:1px solid var(--b);border-radius:8px">
                <label>TRIGGER</label>
                <select id="se_trigger" onchange="ScriptEditor._event.trigger=this.value">
                    <option value="INTERACT" ${ev.trigger==='INTERACT'?'selected':''}>🖐️ INTERACT (Press E)</option>
                    <option value="STEP_ON"  ${ev.trigger==='STEP_ON' ?'selected':''}>👣 STEP ON (Walk over)</option>
                    <option value="AUTO"     ${ev.trigger==='AUTO'    ?'selected':''}>⚡ AUTO (On map load)</option>
                </select>
            </div>
            <div style="background:var(--bg2);padding:16px;border:1px solid var(--b);border-radius:8px">
                <label>CONDITIONS <span style="color:var(--td);font-weight:normal">(ALL must pass)</span></label>
                <div id="se_conditions">${ScriptEditor.renderConditions(ev.conditions)}</div>
                <button class="edit-btn" style="margin-top:8px" onclick="ScriptEditor.addCondition()">+ Add Condition</button>
            </div>
        </div>

        <div style="background:var(--bg2);padding:16px;border:1px solid var(--b);border-radius:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <label style="margin:0">ACTIONS <span style="color:var(--td);font-weight:normal">(runs top to bottom)</span></label>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${Object.entries(ScriptEditor.ACTION_TYPES).map(([key,def]) =>
                        `<button class="edit-btn" style="font-size:11px;padding:4px 8px"
                            onclick="ScriptEditor.addAction('${key}')">${def.label}</button>`
                    ).join('')}
                </div>
            </div>
            <div id="se_actions" style="min-height:60px">
                ${ScriptEditor.renderActions(ev.actions)}
            </div>
        </div>`;
    },

    // Build a <select> from cache for 'db_*' field types
    _dbSelect: (fieldType, currentVal, onChange) => {
        const c = ScriptEditor._cache;
        let opts = [];
        switch (fieldType) {
            case 'db_item':
                opts = c.items.map(i => ({ v: i.id, l: `${i.icon||'📦'} ${i.name}` })); break;
            case 'db_quest':
                opts = c.quests.map(q => ({ v: q.quest_id||q.id, l: `📜 ${q.title||q.name||q.quest_id}` })); break;
            case 'db_shop':
                opts = c.shops.map(s => ({ v: s.id, l: `🏪 ${s.name}` })); break;
            case 'db_npc_id':
                opts = c.npcs.map(n => ({ v: n.id, l: `${n.icon||'👤'} ${n.name}` })); break;
            case 'db_npc_name':
                opts = c.npcs.map(n => ({ v: n.name, l: `${n.icon||'👤'} ${n.name}` })); break;
            case 'db_class':
                opts = c.classes.map(cl => ({ v: cl.id, l: `⚔️ ${cl.name}` })); break;
            case 'db_faction':
                opts = c.factions.map(f => ({ v: f.id, l: `⚔️ ${f.name}` })); break;
            case 'db_map':
                opts = c.maps.map(m => ({ v: m.id, l: `🗺️ ${m.name}` })); break;
        }
        const optHtml = opts.map(o =>
            `<option value="${o.v}" ${String(currentVal)===String(o.v)?'selected':''}>${o.l}</option>`
        ).join('');
        return `<select onchange="${onChange}">${optHtml}</select>`;
    },

    renderActions: (actions) => {
        if (!actions || !actions.length)
            return '<p style="color:var(--td);text-align:center;padding:20px">No actions yet. Click a button above to add one.</p>';

        return actions.map((action, i) => {
            const def = ScriptEditor.ACTION_TYPES[action.type] || { label: action.type, fields: [] };
            let fieldsHtml = '';

            for (const f of def.fields) {
                const val = action[f.key] !== undefined ? action[f.key] : (f.default ?? '');
                const onChange = `ScriptEditor.updateField(${i},'${f.key}',this.value)`;
                const ph = f.placeholder ? ` placeholder="${ScriptEditor._esc(f.placeholder)}"` : '';

                if (f.type === 'textarea') {
                    fieldsHtml += `<div style="flex:1;min-width:200px"><label style="font-size:10px">${f.label}</label>
                        <textarea rows="2" onchange="${onChange}" style="resize:vertical">${ScriptEditor._esc(String(val))}</textarea></div>`;
                } else if (f.type === 'select') {
                    const opts = (f.options||[]).map(o=>
                        `<option value="${o}" ${String(val)===o?'selected':''}>${o}</option>`).join('');
                    fieldsHtml += `<div style="min-width:120px"><label style="font-size:10px">${f.label}</label>
                        <select onchange="${onChange}">${opts}</select></div>`;
                } else if (f.type.startsWith('db_')) {
                    fieldsHtml += `<div style="min-width:160px"><label style="font-size:10px">${f.label}</label>
                        ${ScriptEditor._dbSelect(f.type, val, onChange)}</div>`;
                } else {
                    fieldsHtml += `<div style="min-width:80px"><label style="font-size:10px">${f.label}</label>
                        <input type="${f.type}" value="${ScriptEditor._esc(String(val))}"${ph} onchange="${onChange}"></div>`;
                }
            }

            if (def.hint) {
                fieldsHtml += `<div style="width:100%;color:#888;font-size:10px;font-style:italic;margin-top:4px">ℹ️ ${def.hint}</div>`;
            }

            return `<div style="background:var(--bg3);border:1px solid var(--b);border-radius:6px;
                padding:12px;margin-bottom:8px" data-idx="${i}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <span style="color:var(--a);font-weight:600;font-size:13px">#${i+1} ${def.label}</span>
                    <div style="display:flex;gap:4px">
                        ${i > 0 ? `<button class="edit-btn" style="padding:2px 8px" onclick="ScriptEditor.moveAction(${i},-1)">▲</button>` : ''}
                        ${i < actions.length-1 ? `<button class="edit-btn" style="padding:2px 8px" onclick="ScriptEditor.moveAction(${i},1)">▼</button>` : ''}
                        <button class="del-btn" style="padding:2px 8px" onclick="ScriptEditor.removeAction(${i})">✕</button>
                    </div>
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap">${fieldsHtml}</div>
            </div>`;
        }).join('');
    },

    renderConditions: (conditions) => {
        if (!conditions || !conditions.length)
            return '<span style="color:var(--td);font-size:12px">None (always triggers)</span>';

        return conditions.map((cond, i) => {
            const def = ScriptEditor.CONDITION_TYPES[cond.type] || { label: cond.type, fields: [] };
            const fields = def.fields.map(f => {
                const v = cond[f.key] !== undefined ? cond[f.key] : (f.default || '');
                const onChange = `ScriptEditor.updateCondField(${i},'${f.key}',this.value)`;
                if (f.type.startsWith('db_')) {
                    return `<span style="display:inline-block">${ScriptEditor._dbSelect(f.type, v, onChange)}</span>`;
                }
                return `<input type="${f.type}" value="${ScriptEditor._esc(String(v))}"
                    style="width:80px;padding:4px;font-size:11px" onchange="${onChange}" placeholder="${f.label}">`;
            }).join(' ');

            return `<div style="display:flex;gap:6px;align-items:center;margin:4px 0;font-size:12px">
                <span style="color:var(--y)">${def.label}</span> ${fields}
                <button class="del-btn" style="padding:1px 6px;font-size:10px"
                    onclick="ScriptEditor.removeCondition(${i})">✕</button>
            </div>`;
        }).join('');
    },

    addAction: (type) => {
        const def = ScriptEditor.ACTION_TYPES[type];
        const action = { type };
        for (const f of (def.fields||[])) {
            if (f.default !== undefined) action[f.key] = f.default;
            // Pre-fill db_ fields with first available option
            else if (f.type.startsWith('db_') && !action[f.key]) {
                const c = ScriptEditor._cache;
                if (f.type === 'db_item'     && c.items.length)    action[f.key] = c.items[0].id;
                if (f.type === 'db_quest'    && c.quests.length)   action[f.key] = c.quests[0].quest_id||c.quests[0].id;
                if (f.type === 'db_shop'     && c.shops.length)    action[f.key] = c.shops[0].id;
                if (f.type === 'db_npc_id'   && c.npcs.length)     action[f.key] = c.npcs[0].id;
                if (f.type === 'db_npc_name' && c.npcs.length)     action[f.key] = c.npcs[0].name;
                if (f.type === 'db_class'    && c.classes.length)  action[f.key] = c.classes[0].id;
                if (f.type === 'db_faction'  && c.factions.length) action[f.key] = c.factions[0].id;
                if (f.type === 'db_map'      && c.maps.length)     action[f.key] = c.maps[0].id;
            }
        }
        ScriptEditor._event.actions.push(action);
        ScriptEditor.render();
    },

    removeAction:  (i) => { ScriptEditor._event.actions.splice(i,1); ScriptEditor.render(); },
    moveAction: (i, dir) => {
        const arr = ScriptEditor._event.actions, t = i+dir;
        if (t<0||t>=arr.length) return;
        [arr[i],arr[t]]=[arr[t],arr[i]];
        ScriptEditor.render();
    },

    updateField: (idx, key, value) => {
        const action = ScriptEditor._event.actions[idx];
        const numericKeys = ['quantity','amount','ms','duration','x','y'];
        if (numericKeys.includes(key) || (!isNaN(value) && value !== '' && key !== 'text' && key !== 'speaker' && key !== 'key' && key !== 'prompt' && key !== 'cause' && key !== 'file'))
            action[key] = Number(value);
        else if (value === 'true') action[key] = true;
        else if (value === 'false') action[key] = false;
        else action[key] = value;
    },

    addCondition: () => {
        const types = Object.keys(ScriptEditor.CONDITION_TYPES);
        // Show a small inline picker instead of prompt()
        const existing = document.getElementById('se_conditions');
        const pickerId = 'se_cond_picker';
        if (document.getElementById(pickerId)) return;
        const picker = document.createElement('div');
        picker.id = pickerId;
        picker.style.cssText = 'background:var(--bg3);border:1px solid var(--b);border-radius:6px;padding:8px;margin-top:8px;display:flex;flex-wrap:wrap;gap:6px';
        picker.innerHTML = types.map(t =>
            `<button class="edit-btn" style="font-size:11px"
                onclick="ScriptEditor._pickCondition('${t}')">${ScriptEditor.CONDITION_TYPES[t].label}</button>`
        ).join('') + `<button class="del-btn" style="font-size:11px" onclick="document.getElementById('${pickerId}').remove()">✕</button>`;
        existing.parentNode.appendChild(picker);
    },

    _pickCondition: (type) => {
        document.getElementById('se_cond_picker')?.remove();
        if (!ScriptEditor._event.conditions) ScriptEditor._event.conditions = [];
        const def = ScriptEditor.CONDITION_TYPES[type];
        const cond = { type };
        for (const f of def.fields) {
            if (f.default !== undefined) cond[f.key] = f.default;
            else if (f.type === 'db_item'  && ScriptEditor._cache.items.length)   cond[f.key] = ScriptEditor._cache.items[0].id;
            else if (f.type === 'db_class' && ScriptEditor._cache.classes.length) cond[f.key] = ScriptEditor._cache.classes[0].id;
        }
        ScriptEditor._event.conditions.push(cond);
        ScriptEditor.render();
    },

    removeCondition: (i) => { ScriptEditor._event.conditions.splice(i,1); ScriptEditor.render(); },
    updateCondField: (i, key, value) => {
        const cond = ScriptEditor._event.conditions[i];
        if (!isNaN(value) && value !== '') cond[key] = Number(value);
        else cond[key] = value;
    },

    save: () => {
        const ev = ScriptEditor._event;
        if (ev.conditions && ev.conditions.length === 0) delete ev.conditions;
        if (ScriptEditor._callback) ScriptEditor._callback(ev);
    },

    viewJSON: () => {
        const json = JSON.stringify(ScriptEditor._event, null, 2);
        const existing = document.getElementById('se_json_modal');
        if (existing) { existing.remove(); return; }
        const modal = document.createElement('div');
        modal.id = 'se_json_modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center';
        modal.innerHTML = `
        <div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:22px;width:600px;max-width:95vw">
            <h3 style="margin:0 0 4px;color:#bb86fc">📋 Raw Event JSON</h3>
            <p style="color:#f85149;font-size:11px;margin:0 0 10px">⚠️ Edit carefully — invalid JSON will not be accepted.</p>
            <textarea id="se_json_ta" rows="14" style="width:100%;font-family:monospace;font-size:12px;background:#010409;border:1px solid #30363d;color:#e8eef6;padding:10px;border-radius:6px;resize:vertical">${ScriptEditor._esc(json)}</textarea>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
                <button class="edit-btn" onclick="document.getElementById('se_json_modal').remove()">Cancel</button>
                <button class="action-btn save-btn" onclick="ScriptEditor._applyJSON()">Apply JSON</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
    },

    _applyJSON: () => {
        const text = document.getElementById('se_json_ta')?.value;
        document.getElementById('se_json_modal')?.remove();
        if (!text) return;
        try { ScriptEditor._event = JSON.parse(text); ScriptEditor.render(); }
        catch (e) { alert('Invalid JSON: ' + e.message); }
    },

    _esc: (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
};
