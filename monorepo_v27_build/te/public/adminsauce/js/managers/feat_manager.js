// =================================================================
// FEAT MANAGER — Passive/active bonuses players pick at creation
// DB table: game_feats  (id, name, description, icon, type, effect_json)
// =================================================================
const FeatManager = {
    _data: [],

    init: async () => {
        document.getElementById('pageTitle').innerText = '🎯 FEAT MANAGER';
        const r = await API.getAll('feat');
        FeatManager._data = r.success ? r.data : [];
        FeatManager.renderList();
    },

    renderList: () => {
        const d = FeatManager._data;
        let h = `<button class="action-btn save-btn" onclick="FeatManager.edit()">+ NEW FEAT</button>
        <p style="color:var(--td);font-size:12px;margin:8px 0">Feats are permanent bonuses players choose during character creation. Use effect_json to define what they actually do.</p>
        <table><thead><tr>
            <th>ICON</th><th>NAME</th><th>TYPE</th><th>EFFECT PREVIEW</th><th>ACTIONS</th>
        </tr></thead><tbody>`;
        d.forEach(f => {
            let effectPreview = '';
            try {
                const ef = typeof f.effect_json === 'string' ? JSON.parse(f.effect_json || '{}') : (f.effect_json || {});
                const parts = [];
                if (ef.stat_bonus) Object.entries(ef.stat_bonus).forEach(([k,v]) => parts.push(`${k} ${v > 0 ? '+' : ''}${v}`));
                if (ef.skill_id)   parts.push(`Grants skill #${ef.skill_id}`);
                if (ef.passive)    parts.push(ef.passive);
                effectPreview = parts.join(', ') || '—';
            } catch { effectPreview = '(invalid json)'; }

            h += `<tr>
                <td style="font-size:18px;text-align:center">${f.icon||'🎯'}</td>
                <td><b>${f.name}</b><br><small style="color:var(--td)">${f.description||''}</small></td>
                <td><span class="tag">${f.type||'passive'}</span></td>
                <td style="font-size:11px;color:var(--td);max-width:160px">${effectPreview}</td>
                <td>
                    <button class="edit-btn" onclick='FeatManager.edit(${JSON.stringify(f).replace(/'/g,"&#39;")})'>EDIT</button>
                    <button class="del-btn" onclick="FeatManager.del(${f.id})">DEL</button>
                </td>
            </tr>`;
        });
        h += '</tbody></table>';
        document.getElementById('dynamicArea').innerHTML = h;
    },

    edit: (item) => {
        const d = item || {};
        const isNew = !d.id;

        // Pretty-print existing effect_json
        let effectStr = '{}';
        try {
            const raw = d.effect_json;
            const obj = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
            effectStr = JSON.stringify(obj, null, 2);
        } catch { effectStr = '{}'; }

        document.getElementById('dynamicArea').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;color:var(--a)">${isNew ? '🎯 New Feat' : '✏️ Edit: ' + d.name}</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="FeatManager.save(${d.id||'null'})">💾 SAVE</button>
                <button class="edit-btn" onclick="FeatManager.init()">CANCEL</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Name</label><input id="ft_name" value="${d.name||''}"></div>
            <div><label>Icon (emoji)</label><input id="ft_icon" value="${d.icon||'🎯'}"></div>
            <div><label>Type</label>
                <select id="ft_type">
                    ${['passive','active','mastery','starting','combat'].map(t =>
                        `<option value="${t}" ${(d.type||'passive')===t?'selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`
                    ).join('')}
                </select>
            </div>
        </div>

        <label>Description <small style="color:var(--td)">(shown to players at creation)</small></label>
        <textarea id="ft_description" rows="2" style="margin-bottom:16px">${d.description||''}</textarea>

        <div style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:14px;margin-bottom:12px">
            <div style="color:var(--a);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">
                ⚡ Effect JSON
            </div>
            <p style="font-size:11px;color:var(--td);margin-bottom:8px">
                Defines what the feat actually does. Keys: <code>stat_bonus</code> {atk,def,hp,mp,mo,md,speed,luck},
                <code>skill_id</code> (grants a skill), <code>passive</code> (string code for server logic),
                <code>start_gold</code> (extra starting gold).
            </p>
            <p style="font-size:11px;color:var(--td);margin-bottom:8px">
                Example: <code>{"stat_bonus": {"atk": 5, "luck": 3}, "start_gold": 50}</code>
            </p>
            <textarea id="ft_effect_json" rows="6" style="font-family:monospace;font-size:12px">${effectStr}</textarea>
        </div>`;
    },

    save: async (id) => {
        // Validate JSON before saving
        const rawJson = document.getElementById('ft_effect_json').value.trim();
        let effectObj = {};
        try {
            effectObj = JSON.parse(rawJson || '{}');
        } catch (e) {
            alert('Effect JSON is invalid: ' + e.message);
            return;
        }

        const payload = {
            name:        document.getElementById('ft_name').value.trim(),
            icon:        document.getElementById('ft_icon').value.trim() || '🎯',
            type:        document.getElementById('ft_type').value,
            description: document.getElementById('ft_description').value.trim(),
            effect_json: JSON.stringify(effectObj),
        };

        if (!payload.name) { alert('Name is required.'); return; }

        const r = await API.save('feat', payload, id);
        if (r.success) FeatManager.init();
        else alert(r.message || 'Save failed');
    },

    del: async (id) => {
        if (confirm('Delete this feat? Players who have it will keep it but may lose its effect.')) {
            await API.delete('feat', id);
            FeatManager.init();
        }
    }
};
