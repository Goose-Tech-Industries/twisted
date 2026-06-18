// =================================================================
// STATUS MANAGER — Visual builder for game_statuses
// =================================================================
const StatusManager = {
    _data: [],

    init: async () => {
        document.getElementById('pageTitle').innerText = '⚡ STATUS EFFECTS';
        const r = await API.getAll('status');
        StatusManager._data = r.success ? r.data : [];
        StatusManager.renderList();
    },

    renderList: () => {
        const d = StatusManager._data;
        let h = `<button class="action-btn save-btn" onclick="StatusManager.edit()">+ NEW STATUS</button>
        <p style="color:var(--td);font-size:12px;margin:8px 0 16px">
            Status effects are conditions applied in battle. Buffs help, debuffs hurt.
            They can modify stats, deal/heal damage each turn, or prevent acting entirely.
        </p>
        <table><thead><tr>
            <th>ICON</th><th>NAME</th><th>TYPE</th><th>DURATION</th><th>EFFECT SUMMARY</th><th>ACTIONS</th>
        </tr></thead><tbody>`;
        d.forEach(s => {
            const fx = StatusManager._fxPreview(s.effects);
            const typeColor = s.type==='buff' ? 'tag-green' : s.type==='debuff' ? 'tag-red' : '';
            h += `<tr>
                <td style="font-size:20px">${s.icon||'⚡'}</td>
                <td><b>${s.name}</b><br><small style="color:var(--td)">${s.description||''}</small></td>
                <td><span class="tag ${typeColor}">${s.type}</span></td>
                <td>${s.permanent ? '∞ Permanent' : (s.default_duration||3)+' turns'}</td>
                <td style="font-size:11px;color:var(--td)">${fx}</td>
                <td>
                    <button class="edit-btn" onclick='StatusManager.edit(${JSON.stringify(s)})'>EDIT</button>
                    <button class="del-btn" onclick="StatusManager.del(${s.id})">DEL</button>
                </td>
            </tr>`;
        });
        h += '</tbody></table>';
        document.getElementById('dynamicArea').innerHTML = h;
    },

    edit: async (item) => {
        const d = item || {};
        const isNew = !d.id;
        document.getElementById('dynamicArea').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;color:var(--a)">${isNew ? '⚡ New Status Effect' : '✏️ Edit: ' + d.name}</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="StatusManager.save(${d.id||'null'})">💾 SAVE</button>
                <button class="edit-btn" onclick="StatusManager.init()">CANCEL</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Name</label><input id="st_name" value="${d.name||''}"></div>
            <div><label>Icon (emoji)</label><input id="st_icon" value="${d.icon||'⚡'}"></div>
            <div><label>Color (hex)</label><input id="st_color" value="${d.color||'#ffff00'}" type="color"></div>
            <div><label>Type</label>
                <select id="st_type">
                    <option ${d.type==='buff'?'selected':''}>buff</option>
                    <option ${d.type==='debuff'?'selected':''}>debuff</option>
                    <option ${d.type==='neutral'?'selected':''}>neutral</option>
                </select>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Default Duration (turns)</label>
                <input type="number" id="st_dur" value="${d.default_duration||3}" min="1"></div>
            <div style="display:flex;align-items:center;gap:8px;padding-top:22px">
                <input type="checkbox" id="st_perm" ${d.permanent?'checked':''}>
                <label for="st_perm">Permanent (never expires)</label>
            </div>
        </div>
        <label>Description</label>
        <textarea id="st_desc" rows="2" style="margin-bottom:16px">${d.description||''}</textarea>

        <div style="color:var(--a);font-weight:700;font-size:13px;margin-bottom:10px">⚡ STATUS EFFECTS</div>
        <div id="st_fx_builder"></div>`;

        await StatusFxBuilder.render('st_fx_builder', d.effects, 'st_fx_builder', d.disabled_commands);
    },

    save: async (id) => {
        const fx       = StatusFxBuilder.collect('st_fx_builder');
        const disabled = StatusFxBuilder.collectDisabled('st_fx_builder');
        const payload  = {
            name:             document.getElementById('st_name').value,
            icon:             document.getElementById('st_icon').value,
            color:            document.getElementById('st_color').value,
            type:             document.getElementById('st_type').value,
            default_duration: parseInt(document.getElementById('st_dur').value) || 3,
            permanent:        document.getElementById('st_perm').checked ? 1 : 0,
            description:      document.getElementById('st_desc').value,
            effects:          JSON.stringify(fx),
            disabled_commands: JSON.stringify(disabled)
        };
        const r = await API.save('status', payload, id);
        if (r.success) StatusManager.init(); else alert(r.message || 'Save failed');
    },

    del: async (id) => {
        if (confirm('Delete this status effect?')) {
            await API.delete('status', id);
            StatusManager.init();
        }
    },

    _fxPreview: (fx) => {
        try {
            const e = typeof fx === 'string' ? JSON.parse(fx) : (fx || {});
            const parts = [];
            if (e.stat_mod)         parts.push(`STATS: ${Object.entries(e.stat_mod).map(([k,v])=>`${k}×${v}`).join(', ')}`);
            if (e.damage_per_turn)  parts.push(`DMG/turn: ${e.damage_per_turn.formula}`);
            if (e.heal_per_turn)    parts.push(`HEAL/turn: ${e.heal_per_turn.formula}`);
            if (e.skip_turn)        parts.push('STUN');
            return parts.join(' | ') || '—';
        } catch { return '?'; }
    }
};
