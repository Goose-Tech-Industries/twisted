// =================================================================
// SKILL MANAGER — Visual builder for game_skills
// =================================================================
const SkillManager = {
    _data: [],

    init: async () => {
        document.getElementById('pageTitle').innerText = '✨ SKILL DATABASE';
        const r = await API.getAll('skill');
        SkillManager._data = r.success ? r.data : [];
        SkillManager.renderList();
    },

    renderList: () => {
        const d = SkillManager._data;
        let h = `<button class="action-btn save-btn" onclick="SkillManager.edit()">+ NEW SKILL</button>
        <table><thead><tr>
            <th>ICON</th><th>NAME</th><th>TYPE</th><th>TARGET</th><th>EFFECT SUMMARY</th><th>ACTIONS</th>
        </tr></thead><tbody>`;
        d.forEach(s => {
            const fx = SkillManager._fxPreview(s.effects);
            h += `<tr>
                <td style="font-size:20px">${s.icon||'✨'}</td>
                <td><b>${s.name}</b><br><small style="color:var(--td)">${s.description||''}</small></td>
                <td><span class="tag">${s.type}</span></td>
                <td><span class="tag tag-purple">${s.target_type}</span></td>
                <td style="font-size:11px;color:var(--td)">${fx}</td>
                <td>
                    <button class="edit-btn" onclick='SkillManager.edit(${JSON.stringify(s)})'>EDIT</button>
                    <button class="del-btn" onclick="SkillManager.del(${s.id})">DEL</button>
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
            <h3 style="margin:0;color:var(--a)">${isNew ? '✨ New Skill' : '✏️ Edit: ' + d.name}</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="SkillManager.save(${d.id||'null'})">💾 SAVE</button>
                <button class="edit-btn" onclick="SkillManager.init()">CANCEL</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Name</label><input id="sk_name" value="${d.name||''}"></div>
            <div><label>Icon (emoji)</label><input id="sk_icon" value="${d.icon||'✨'}"></div>
            <div><label>Battle Text</label><input id="sk_btext" value="${d.battle_text||''}" placeholder="{name} casts {skill}!"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Type</label>
                <select id="sk_type">
                    ${['physical','magic','heal','buff','debuff','special'].map(t=>
                        `<option ${d.type===t?'selected':''}>${t}</option>`).join('')}
                </select>
            </div>
            <div><label>Target</label>
                <select id="sk_target">
                    ${['ENEMY','SELF','ALLY','ALL_ENEMIES','ALL_ALLIES'].map(t=>
                        `<option ${d.target_type===t?'selected':''}>${t}</option>`).join('')}
                </select>
            </div>
        </div>
        <label>Description</label>
        <textarea id="sk_desc" rows="2" style="margin-bottom:16px">${d.description||''}</textarea>

        <div style="color:var(--a);font-weight:700;font-size:13px;margin-bottom:10px">⚡ SKILL EFFECTS</div>
        <div id="sk_effect_builder"></div>`;

        await EffectBuilder.render('sk_effect_builder', d.effects);
    },

    save: async (id) => {
        const fx = EffectBuilder.collect('sk_effect_builder');
        const payload = {
            name:        document.getElementById('sk_name').value,
            icon:        document.getElementById('sk_icon').value,
            battle_text: document.getElementById('sk_btext').value,
            type:        document.getElementById('sk_type').value,
            target_type: document.getElementById('sk_target').value,
            description: document.getElementById('sk_desc').value,
            effects:     JSON.stringify(fx),
            elements:    JSON.stringify(fx.elements || []),
            heal_status: JSON.stringify(fx.heal_status || [])
        };
        // Remove duplicated fields from top-level effects
        delete fx.elements;
        delete fx.heal_status;
        payload.effects = JSON.stringify(fx);
        const r = await API.save('skill', payload, id);
        if (r.success) SkillManager.init(); else alert(r.message || 'Save failed');
    },

    del: async (id) => {
        if (confirm('Delete this skill? It will be removed from all class assignments.')) {
            await API.delete('skill', id);
            SkillManager.init();
        }
    },

    _fxPreview: (fx) => {
        try {
            const e = typeof fx === 'string' ? JSON.parse(fx) : (fx || {});
            const parts = [];
            if (e.damage)          parts.push(`DMG: ${e.damage.formula}`);
            if (e.heal)            parts.push(`HEAL: ${e.heal.formula}`);
            if (e.set_status)      parts.push(`STATUS → ${Object.keys(e.set_status.statuses||{}).join(', ')}`);
            if (e.elements?.length)parts.push(`🔥 ${e.elements.join('+')}`);
            if (e.range !== undefined) parts.push(`📍 range:${e.range}`);
            if (e.aoe_radius)      parts.push(`💥 r${e.aoe_radius}`);
            if (e.hits > 1)        parts.push(`🔁 x${e.hits}`);
            if (e.charge_turns)    parts.push(`⚡ charge:${e.charge_turns}t`);
            if (e.combo_requires)  parts.push(`🎯 combo:${e.combo_requires.status}`);
            if (e.reaction)        parts.push(`⚛️ ${e.reaction.trigger}(${e.reaction.chance}%)`);
            return parts.join(' | ') || '—';
        } catch { return '?'; }
    }
};
