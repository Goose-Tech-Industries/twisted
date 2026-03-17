// =================================================================
// OGHAM FAMILY MANAGER
// Families group Blood Oghams together. Equip 2+ from the same
// family and the set bonus activates (stat bonuses, element, status).
// =================================================================

const OghamFamilyManager = {
    _data: [],

    init: async () => {
        document.getElementById('managerTitle').textContent = '🔗 Ogham Families';
        document.getElementById('dynamicArea').innerHTML = '<p style="color:#888">Loading families...</p>';

        const r = await API.getAll('ogham_family');
        OghamFamilyManager._data = r.success ? r.data : [];

        let h = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <div style="color:#888;font-size:13px">${OghamFamilyManager._data.length} families defined</div>
            <button class="action-btn save-btn" onclick="OghamFamilyManager.edit(null)">+ New Family</button>
        </div>`;

        if (!OghamFamilyManager._data.length) {
            h += `<p style="color:#555;text-align:center;padding:40px;font-style:italic">
                No families yet. Create one to enable set bonuses when players equip 2+ Oghams from the same family.
            </p>`;
        } else {
            OghamFamilyManager._data.forEach(f => {
                let bonusPreview = '';
                try {
                    const b = typeof f.set_bonus_json === 'string' ? JSON.parse(f.set_bonus_json||'{}') : (f.set_bonus_json||{});
                    bonusPreview = b.label || JSON.stringify(b).slice(0, 80);
                } catch { bonusPreview = '(invalid JSON)'; }

                h += `
                <div class="item-row" style="display:flex;justify-content:space-between;align-items:center;
                    background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:8px">
                    <div style="display:flex;gap:12px;align-items:center">
                        <span style="font-size:28px">${f.icon||'🩸'}</span>
                        <div>
                            <div style="font-weight:700;color:#e8eef6">${f.name}</div>
                            <div style="font-size:11px;color:#666;max-width:400px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">
                                ${bonusPreview || '<span style="color:#444">No set bonus defined</span>'}
                            </div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px">
                        <button class="edit-btn" onclick="OghamFamilyManager.edit(${JSON.stringify(f).replace(/"/g,'&quot;')})">EDIT</button>
                        <button class="delete-btn" onclick="OghamFamilyManager.del(${f.id})">DEL</button>
                    </div>
                </div>`;
            });
        }

        document.getElementById('dynamicArea').innerHTML = h;
    },

    edit: (item) => {
        const d = (typeof item === 'string') ? JSON.parse(item) : (item || {});
        const isNew = !d.id;

        // Parse existing set_bonus_json for field pre-fill
        let sb = {};
        try { sb = typeof d.set_bonus_json === 'string' ? JSON.parse(d.set_bonus_json||'{}') : (d.set_bonus_json||{}); } catch {}

        document.getElementById('dynamicArea').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;color:#e74c3c">${isNew ? '🔗 New Ogham Family' : '✏️ Edit: ' + d.name}</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="OghamFamilyManager.save(${d.id||'null'})">💾 SAVE</button>
                <button class="edit-btn" onclick="OghamFamilyManager.init()">CANCEL</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Family Name</label><input id="fam_name" value="${d.name||''}" placeholder="e.g. The Void Court"></div>
            <div><label>Icon (emoji)</label><input id="fam_icon" value="${d.icon||'🩸'}"></div>
        </div>

        <label>Description (lore flavour)</label>
        <textarea id="fam_desc" rows="2" style="margin-bottom:16px">${d.description||''}</textarea>

        <div style="background:var(--bg2);border:1px solid #2a3a2a;border-radius:8px;padding:16px;margin-bottom:12px">
            <div style="color:#4CAF50;font-weight:700;font-size:13px;margin-bottom:12px">✦ SET BONUS (activates when 2+ Oghams from this family are equipped)</div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
                <div>
                    <label>Minimum Oghams needed</label>
                    <input type="number" id="fam_min" value="${sb.min_count||2}" min="2" max="4">
                </div>
                <div>
                    <label>Element granted (optional)</label>
                    <input id="fam_elem" value="${sb.element_attack||''}" placeholder="e.g. dark, fire, ice">
                </div>
                <div>
                    <label>Bonus label (shown to player)</label>
                    <input id="fam_label" value="${sb.label||''}" placeholder="e.g. Void Pact: +20 MO">
                </div>
            </div>

            <div style="margin-bottom:12px">
                <label style="font-size:12px;color:var(--td)">Stat Bonuses (leave 0 for none)</label>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px">
                    ${['atk','def','mo','md','speed','luck','hp','mp'].map(stat =>
                        `<div><label style="font-size:11px;color:var(--td)">${stat.toUpperCase()}</label>
                         <input type="number" id="fam_stat_${stat}" value="${sb.stat_bonus?.[stat]||0}" style="width:100%"></div>`
                    ).join('')}
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div>
                    <label>On-Hit Status Effect (optional)</label>
                    <input id="fam_status" value="${sb.on_hit_status||''}" placeholder="e.g. Stun, Blind">
                </div>
                <div>
                    <label>On-Hit Chance % (if status set)</label>
                    <input type="number" id="fam_status_chance" value="${sb.on_hit_chance||15}" min="1" max="100">
                </div>
            </div>

            <div style="margin-top:12px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px">
                <div style="font-size:11px;color:#666;margin-bottom:4px">Raw JSON preview (auto-generated on save):</div>
                <code id="fam_json_preview" style="font-size:10px;color:#4CAF50;word-break:break-all"></code>
            </div>
        </div>

        <script>
        (function() {
            const ids = ['fam_min','fam_elem','fam_label','fam_status','fam_status_chance',
                ...['atk','def','mo','md','speed','luck','hp','mp'].map(s=>'fam_stat_'+s)];
            function preview() {
                const statBonus = {};
                ['atk','def','mo','md','speed','luck','hp','mp'].forEach(s => {
                    const v = parseInt(document.getElementById('fam_stat_'+s)?.value||'0');
                    if (v) statBonus[s] = v;
                });
                const obj = {
                    min_count: parseInt(document.getElementById('fam_min')?.value)||2,
                    ...(Object.keys(statBonus).length ? {stat_bonus: statBonus} : {}),
                    ...(document.getElementById('fam_elem')?.value ? {element_attack: document.getElementById('fam_elem').value} : {}),
                    ...(document.getElementById('fam_status')?.value ? {on_hit_status: document.getElementById('fam_status').value, on_hit_chance: parseInt(document.getElementById('fam_status_chance')?.value)||15} : {}),
                    ...(document.getElementById('fam_label')?.value ? {label: document.getElementById('fam_label').value} : {}),
                };
                const el = document.getElementById('fam_json_preview');
                if (el) el.textContent = JSON.stringify(obj);
            }
            ids.forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('input', preview); });
            preview();
        })();
        <\/script>`;
    },

    save: async (id) => {
        const statBonus = {};
        ['atk','def','mo','md','speed','luck','hp','mp'].forEach(stat => {
            const v = parseInt(document.getElementById(`fam_stat_${stat}`)?.value||'0');
            if (v) statBonus[stat] = v;
        });

        const setBonusObj = {
            min_count: parseInt(document.getElementById('fam_min')?.value) || 2,
            ...(Object.keys(statBonus).length ? { stat_bonus: statBonus } : {}),
        };
        const elem   = document.getElementById('fam_elem')?.value;
        const status = document.getElementById('fam_status')?.value;
        const label  = document.getElementById('fam_label')?.value;
        if (elem)   setBonusObj.element_attack = elem;
        if (status) { setBonusObj.on_hit_status = status; setBonusObj.on_hit_chance = parseInt(document.getElementById('fam_status_chance')?.value)||15; }
        if (label)  setBonusObj.label = label;

        const payload = {
            name:          document.getElementById('fam_name').value,
            icon:          document.getElementById('fam_icon').value,
            description:   document.getElementById('fam_desc').value,
            set_bonus_json: JSON.stringify(setBonusObj)
        };

        const r = await API.save('ogham_family', payload, id);
        if (r.success) OghamFamilyManager.init();
        else alert(r.message || 'Save failed');
    },

    del: async (id) => {
        if (confirm('Delete this family? Oghams assigned to it will lose their family membership and any active set bonuses will be removed.')) {
            await API.delete('ogham_family', id);
            OghamFamilyManager.init();
        }
    }
};
