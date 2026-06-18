// =================================================================
// BATTLE COMMAND MANAGER — Visual builder for game_battle_commands
// Effects built via EffectBuilder — no JSON required.
// =================================================================
const BattleCmdManager = {
    data: [],

    init: async () => {
        document.getElementById('pageTitle').innerText = '⚔️ BATTLE COMMANDS';
        const r = await API.getAll('battle_cmd');
        if (r.success) { BattleCmdManager.data = r.data; BattleCmdManager.renderList(); }
    },

    renderList: () => {
        const d = BattleCmdManager.data;
        let h = `<button class="action-btn save-btn" onclick="BattleCmdManager.edit()">+ NEW COMMAND</button>
        <p style="color:var(--td);font-size:12px;margin:8px 0 16px">
            Battle commands are the menu choices every character sees in combat.
            <b>Default</b> commands appear for all classes. <b>Class-specific</b> ones are assigned in the Class Manager.
        </p>
        <table><thead><tr>
            <th>ORDER</th><th>ICON</th><th>NAME</th><th>TARGET</th><th>DEFAULT?</th><th>EFFECT</th><th>ACTIONS</th>
        </tr></thead><tbody>`;
        d.sort((a,b) => a.display_order - b.display_order).forEach(c => {
            const fx = BattleCmdManager._fxPreview(c.effects);
            h += `<tr>
                <td>${c.display_order}</td>
                <td style="font-size:20px">${c.icon||'⚔️'}</td>
                <td><b>${c.name}</b><br><small style="color:var(--td)">${c.description||''}</small></td>
                <td><span class="tag tag-purple">${c.target_type}</span></td>
                <td>${c.is_default ? '<span class="tag tag-green">✔ All Classes</span>' : '<span class="tag tag-yellow">Class-specific</span>'}</td>
                <td style="font-size:11px;color:var(--td)">${fx}</td>
                <td>
                    <button class="edit-btn" onclick="BattleCmdManager.edit(${c.id})">EDIT</button>
                    <button class="del-btn" onclick="BattleCmdManager.del(${c.id})">DEL</button>
                </td>
            </tr>`;
        });
        h += '</tbody></table>';
        document.getElementById('dynamicArea').innerHTML = h;
    },

    edit: async (id) => {
        const item = id ? BattleCmdManager.data.find(c => c.id === id) : null;
        const d = item || {};

        document.getElementById('dynamicArea').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;color:var(--a)">${id ? '✏️ Edit: ' + d.name : '⚔️ New Battle Command'}</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="BattleCmdManager.save(${id||'null'})">💾 SAVE</button>
                <button class="edit-btn" onclick="BattleCmdManager.init()">CANCEL</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Name</label><input id="bc_name" value="${d.name||''}"></div>
            <div><label>Icon (emoji)</label><input id="bc_icon" value="${d.icon||'⚔️'}"></div>
        </div>
        <label>Description</label>
        <input id="bc_desc" value="${d.description||''}" style="margin-bottom:12px">

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
            <div><label>Target Type</label>
                <select id="bc_target">
                    ${['SELF','ENEMY','SELF_OR_ENEMY','ALL','MENU','NONE'].map(t =>
                        `<option ${d.target_type===t?'selected':''}>${t}</option>`).join('')}
                </select>
            </div>
            <div><label>Display Order</label>
                <input type="number" id="bc_order" value="${d.display_order||0}" min="0"></div>
            <div><label>Availability</label>
                <select id="bc_default">
                    <option value="1" ${d.is_default?'selected':''}>All Classes (default)</option>
                    <option value="0" ${!d.is_default?'selected':''}>Class-specific only</option>
                </select>
            </div>
        </div>

        <div style="color:var(--a);font-weight:700;font-size:13px;margin-bottom:10px">⚡ COMMAND EFFECTS</div>
        <div id="bc_fx_builder"></div>`;

        await EffectBuilder.render('bc_fx_builder', d.effects);
    },

    save: async (id) => {
        const fx = EffectBuilder.collect('bc_fx_builder');
        const payload = {
            name:         document.getElementById('bc_name').value,
            description:  document.getElementById('bc_desc').value,
            icon:         document.getElementById('bc_icon').value,
            target_type:  document.getElementById('bc_target').value,
            display_order:parseInt(document.getElementById('bc_order').value) || 0,
            is_default:   parseInt(document.getElementById('bc_default').value),
            effects:      JSON.stringify(fx)
        };
        const r = await API.save('battle_cmd', payload, id);
        if (r.success) BattleCmdManager.init(); else alert(r.message || 'Save failed');
    },

    del: async (id) => {
        if (confirm('Delete this command? Classes that reference it will lose it.')) {
            await API.delete('battle_cmd', id);
            BattleCmdManager.init();
        }
    },

    _fxPreview: (fx) => {
        try {
            const e = typeof fx === 'string' ? JSON.parse(fx) : (fx || {});
            if (e.damage)    return `DMG: ${e.damage.formula}`;
            if (e.flee)      return 'FLEE';
            if (e.open_menu) return `MENU → ${e.open_menu}`;
            if (e.set_status)return `STATUS: ${Object.keys(e.set_status.statuses||{}).join(', ')}`;
            return Object.keys(e).join(', ') || '—';
        } catch { return '?'; }
    }
};
