// =================================================================
// LIMIT BREAK MANAGER — Visual builder for game_limit_breaks
// =================================================================
const LimitManager = {
    _data: [],
    _classes: [],

    init: async () => {
        document.getElementById('pageTitle').innerText = '💥 LIMIT BREAKS';
        const [lr, cr] = await Promise.all([API.getAll('limit'), API.getAll('class')]);
        LimitManager._data    = lr.success ? lr.data : [];
        LimitManager._classes = cr.success ? cr.data : [];
        LimitManager.renderList();
    },

    renderList: () => {
        const d = LimitManager._data;
        const classMap = {};
        LimitManager._classes.forEach(c => classMap[c.id] = c.name);

        let h = `<button class="action-btn save-btn" onclick="LimitManager.edit()">+ NEW LIMIT BREAK</button>
        <p style="color:var(--td);font-size:12px;margin:8px 0 16px">
            Limit breaks are powerful abilities that unlock when a character's limit gauge fills from taking damage.
        </p>
        <table><thead><tr>
            <th>ICON</th><th>NAME</th><th>CLASS</th><th>BREAK LVL</th><th>CHAR LVL REQ</th><th>EFFECT</th><th>ACTIONS</th>
        </tr></thead><tbody>`;
        d.forEach(l => {
            const fx = LimitManager._fxPreview(l.effects);
            h += `<tr>
                <td style="font-size:20px">${l.icon||'💥'}</td>
                <td><b>${l.name}</b></td>
                <td>${classMap[l.class_id] || '#'+l.class_id}</td>
                <td>Level ${l.break_level}</td>
                <td>${l.char_level_req}+</td>
                <td style="font-size:11px;color:var(--td)">${fx}</td>
                <td>
                    <button class="edit-btn" onclick='LimitManager.edit(${JSON.stringify(l)})'>EDIT</button>
                    <button class="del-btn" onclick="LimitManager.del(${l.id})">DEL</button>
                </td>
            </tr>`;
        });
        h += '</tbody></table>';
        document.getElementById('dynamicArea').innerHTML = h;
    },

    edit: async (item) => {
        const d = item || {};
        const isNew = !d.id;
        const classOpts = LimitManager._classes.map(c =>
            `<option value="${c.id}" ${d.class_id==c.id?'selected':''}>${c.name}</option>`
        ).join('');

        document.getElementById('dynamicArea').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;color:var(--a)">${isNew ? '💥 New Limit Break' : '✏️ Edit: ' + d.name}</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="LimitManager.save(${d.id||'null'})">💾 SAVE</button>
                <button class="edit-btn" onclick="LimitManager.init()">CANCEL</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Name</label><input id="lb_name" value="${d.name||''}"></div>
            <div><label>Icon (emoji)</label><input id="lb_icon" value="${d.icon||'💥'}"></div>
            <div><label>Class</label><select id="lb_class">${classOpts}</select></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Break Level (1–3)</label>
                <input type="number" id="lb_break" value="${d.break_level||1}" min="1" max="3"></div>
            <div><label>Char Level Required</label>
                <input type="number" id="lb_lvl" value="${d.char_level_req||1}" min="1"></div>
            <div><label>Target</label>
                <select id="lb_target">
                    ${['ENEMY','SELF','ALL'].map(t =>
                        `<option ${d.target_type===t?'selected':''}>${t}</option>`).join('')}
                </select>
            </div>
        </div>
        <label>Description</label>
        <textarea id="lb_desc" rows="2" style="margin-bottom:16px">${d.description||''}</textarea>

        <div style="color:var(--a);font-weight:700;font-size:13px;margin-bottom:10px">⚡ LIMIT BREAK EFFECTS</div>
        <div id="lb_fx_builder"></div>`;

        await EffectBuilder.render('lb_fx_builder', d.effects);
    },

    save: async (id) => {
        const fx = EffectBuilder.collect('lb_fx_builder');
        const payload = {
            name:          document.getElementById('lb_name').value,
            icon:          document.getElementById('lb_icon').value,
            class_id:      parseInt(document.getElementById('lb_class').value),
            break_level:   parseInt(document.getElementById('lb_break').value) || 1,
            char_level_req:parseInt(document.getElementById('lb_lvl').value) || 1,
            target_type:   document.getElementById('lb_target').value,
            description:   document.getElementById('lb_desc').value,
            effects:       JSON.stringify(fx)
        };
        const r = await API.save('limit', payload, id);
        if (r.success) LimitManager.init(); else alert(r.message || 'Save failed');
    },

    del: async (id) => {
        if (confirm('Delete this limit break?')) {
            await API.delete('limit', id);
            LimitManager.init();
        }
    },

    _fxPreview: (fx) => {
        try {
            const e = typeof fx === 'string' ? JSON.parse(fx) : (fx || {});
            const parts = [];
            if (e.damage) parts.push(`DMG: ${e.damage.formula}`);
            if (e.heal)   parts.push(`HEAL: ${e.heal.formula}`);
            if (e.set_status) parts.push(`STATUS → ${Object.keys(e.set_status.statuses||{}).join(', ')}`);
            return parts.join(' | ') || '—';
        } catch { return '?'; }
    }
};
