// =================================================================
// ITEM MANAGER — Full item editor with element defense + Ogham Grooves
// =================================================================
const ItemManager = {
    _elements: [],

    init: async () => {
        document.getElementById('pageTitle').innerText = 'ITEM EDITOR';
        const [ir, er] = await Promise.all([API.getAll('item'), API.getAll('element')]);
        ItemManager._elements = er.success ? er.data : [];
        if (ir.success) ItemManager.renderList(ir.data);
    },

    renderList: (data) => {
        const TYPE_ICONS = { WEAPON:'⚔️', ARMOR:'🛡️', HELMET:'⛑️', BOOTS:'👢',
            ACCESSORY:'💍', CONSUMABLE:'🧪', QUEST:'📜', MISC:'📦' };
        let h = `<button class="action-btn save-btn" onclick="ItemManager.edit(null)">+ NEW ITEM</button>
        <table><thead><tr><th>ICON</th><th>NAME</th><th>TYPE</th><th>SLOTS</th>
            <th>STATS</th><th>ACTIONS</th></tr></thead><tbody>`;
        data.forEach(item => {
            const bonuses = ['atk','def','mo','md','speed','luck','hp','mp']
                .filter(s => item['bonus_'+s])
                .map(s => `+${item['bonus_'+s]} ${s.toUpperCase()}`).join(' ');
            h += `<tr>
                <td style="font-size:20px">${item.icon||'📦'}</td>
                <td><b>${item.name}</b><br><span style="color:var(--td);font-size:11px">${item.description||''}</span></td>
                <td>${TYPE_ICONS[item.type]||''} ${item.type||''}</td>
                <td style="text-align:center">${item.ogham_slots||0} 🩸</td>
                <td style="font-size:11px;color:var(--td)">${bonuses||'—'}</td>
                <td>
                    <button class="edit-btn" onclick='ItemManager.edit(${JSON.stringify(item)})'>EDIT</button>
                    <button class="del-btn" onclick="ItemManager.del(${item.id})">DEL</button>
                </td>
            </tr>`;
        });
        h += '</tbody></table>';
        document.getElementById('dynamicArea').innerHTML = h;
    },

    edit: async (item) => {
        const d = item || {};
        const isNew = !d.id;

        // Parse existing element defenses
        let existingElems = {};
        try {
            const raw = typeof d.elements === 'string' ? JSON.parse(d.elements) : (d.elements || {});
            existingElems = raw;
        } catch {}

        document.getElementById('dynamicArea').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0">${isNew ? '+ New Item' : '✏️ Edit: ' + d.name}</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="ItemManager.save(${d.id||'null'})">💾 SAVE</button>
                <button class="edit-btn" onclick="ItemManager.init()">CANCEL</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Name</label><input id="it_name" value="${d.name||''}"></div>
            <div><label>Icon (emoji)</label><input id="it_icon" value="${d.icon||'📦'}"></div>
            <div><label>Value (Gold)</label><input type="number" id="it_value" value="${d.value||0}" min="0"></div>
            <div><label>Level Req</label><input type="number" id="it_lvl" value="${d.level_req||1}" min="1"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Type</label>
                <select id="it_type">
                    ${['WEAPON','ARMOR','HELMET','BOOTS','ACCESSORY','CONSUMABLE','QUEST','MISC'].map(t =>
                        `<option ${d.type===t?'selected':''}>${t}</option>`).join('')}
                </select>
            </div>
            <div><label>Equip Slot</label>
                <input id="it_slot" value="${d.slot||''}" placeholder="e.g. MAIN_HAND, CHEST, HEAD">
            </div>
            <div>
                <label>🩸 Ogham Grooves (slots for Blood Oghams)</label>
                <input type="number" id="it_ogham_slots" value="${d.ogham_slots||0}" min="0" max="4">
            </div>
        </div>
        <label>Description</label>
        <textarea id="it_desc" rows="2" style="margin-bottom:16px">${d.description||''}</textarea>

        <!-- STAT BONUSES -->
        <div style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:14px;margin-bottom:12px">
            <div style="color:var(--a);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">
                📊 Stat Bonuses
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
                ${[['bonus_hp','❤️ HP'],['bonus_mp','💙 MP'],['bonus_atk','⚔️ ATK'],['bonus_def','🛡️ DEF'],
                   ['bonus_mo','🔮 MO'],['bonus_md','💨 MD'],['bonus_speed','⚡ Speed'],['bonus_luck','🍀 Luck']].map(([f,label]) =>
                    `<div><label style="font-size:11px;color:var(--td)">${label}</label>
                     <input type="number" id="it_${f}" value="${d[f]||0}" style="width:100%"></div>`
                ).join('')}
            </div>
        </div>

        <!-- ELEMENT DEFENSES -->
        <div style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:14px;margin-bottom:12px">
            <div style="color:var(--a);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">
                🔥 Elemental Properties
            </div>
            <p style="color:var(--td);font-size:11px;margin:0 0 12px">
                For <b>armor/helmets</b>: set Resist/Weak/Nullify/Absorb per element.<br>
                For <b>weapons</b>: set Attack to add that element to your strikes.
            </p>
            <div id="it_elem_rows" style="display:flex;flex-direction:column;gap:6px"></div>
            <button class="edit-btn" style="margin-top:10px;font-size:11px"
                onclick="ItemManager._addElemRow()">+ Add Element</button>
        </div>

        <!-- CONSUMABLE / WEAPON EXTRAS -->
        <div style="color:var(--a);font-weight:700;font-size:13px;margin-bottom:10px">⚙️ SPECIAL PROPERTIES</div>
        <div id="it_special_builder"></div>`;

        // Populate existing element rows
        const existing = Object.entries(existingElems);
        if (existing.length) {
            existing.forEach(([elem, val]) => {
                let role = 'resist', pct = 50;
                if (typeof val === 'object' && val) { role = val.role || 'resist'; pct = val.pct !== undefined ? val.pct : 50; }
                else if (val === 'attack') role = 'attack';
                else if (val === 'defense') { role = 'resist'; pct = 50; }
                ItemManager._addElemRow(elem, role, pct);
            });
        }

        await ItemBuilder.render('it_special_builder', d.stats_json, null, d.set_status);
    },

    _addElemRow: (elemName='', role='resist', pct=50) => {
        const elems = ItemManager._elements;
        const div = document.createElement('div');
        div.className = 'it-elem-row';
        div.style.cssText = 'display:flex;gap:8px;align-items:center;background:var(--bg3);padding:8px;border-radius:6px';
        div.innerHTML = `
            <select class="it-elem-name" style="width:160px">
                <option value="">— Element —</option>
                ${elems.map(e=>`<option value="${e.name.toLowerCase()}" ${elemName===e.name.toLowerCase()||elemName===e.name?'selected':''}>${e.icon||''} ${e.name}</option>`).join('')}
            </select>
            <select class="it-elem-role" style="width:140px" onchange="ItemManager._togglePct(this)">
                <option value="attack"  ${role==='attack' ?'selected':''}>⚔️ Attack (weapon)</option>
                <option value="resist"  ${role==='resist' ?'selected':''}>💧 Resist</option>
                <option value="weak"    ${role==='weak'   ?'selected':''}>🔥 Weak</option>
                <option value="nullify" ${role==='nullify'?'selected':''}>🛡️ Nullify (0 dmg)</option>
                <option value="absorb"  ${role==='absorb' ?'selected':''}>✨ Absorb (heal)</option>
            </select>
            <div class="it-pct-wrap" style="${role==='attack'||role==='nullify'||role==='absorb'?'opacity:.3;pointer-events:none':''}">
                <input type="number" class="it-elem-pct" value="${pct}" min="1" max="200"
                    style="width:70px" title="% modifier (resist = reduce by %, weak = increase by %)">
                <span style="font-size:11px;color:var(--td)"> %</span>
            </div>
            <button class="del-btn" style="padding:4px 8px" onclick="this.closest('.it-elem-row').remove()">✕</button>`;
        document.getElementById('it_elem_rows').appendChild(div);
    },

    _togglePct: (sel) => {
        const wrap = sel.closest('.it-elem-row').querySelector('.it-pct-wrap');
        const noPct = ['attack','nullify','absorb'].includes(sel.value);
        wrap.style.opacity = noPct ? '.3' : '1';
        wrap.style.pointerEvents = noPct ? 'none' : 'auto';
    },

    _collectElements: () => {
        const out = {};
        document.querySelectorAll('.it-elem-row').forEach(row => {
            const elem = row.querySelector('.it-elem-name').value;
            const role = row.querySelector('.it-elem-role').value;
            const pct  = parseInt(row.querySelector('.it-elem-pct').value) || 50;
            if (!elem) return;
            if (role === 'attack') out[elem] = { role: 'attack' };
            else if (role === 'nullify') out[elem] = { role: 'nullify' };
            else if (role === 'absorb') out[elem] = { role: 'absorb' };
            else out[elem] = { role, pct };
        });
        return out;
    },

    save: async (id) => {
        const stats     = ItemBuilder.collectStats('it_special_builder');
        const setStatus = ItemBuilder.collectSetStatus('it_special_builder');
        const elements  = ItemManager._collectElements();

        const payload = {
            name:         document.getElementById('it_name').value,
            icon:         document.getElementById('it_icon').value,
            type:         document.getElementById('it_type').value,
            slot:         document.getElementById('it_slot').value,
            value:        parseInt(document.getElementById('it_value').value) || 0,
            level_req:    parseInt(document.getElementById('it_lvl').value) || 1,
            description:  document.getElementById('it_desc').value,
            ogham_slots:  parseInt(document.getElementById('it_ogham_slots').value) || 0,
            bonus_hp:     parseInt(document.getElementById('it_bonus_hp').value) || 0,
            bonus_mp:     parseInt(document.getElementById('it_bonus_mp').value) || 0,
            bonus_atk:    parseInt(document.getElementById('it_bonus_atk').value) || 0,
            bonus_def:    parseInt(document.getElementById('it_bonus_def').value) || 0,
            bonus_mo:     parseInt(document.getElementById('it_bonus_mo').value) || 0,
            bonus_md:     parseInt(document.getElementById('it_bonus_md').value) || 0,
            bonus_speed:  parseInt(document.getElementById('it_bonus_speed').value) || 0,
            bonus_luck:   parseInt(document.getElementById('it_bonus_luck').value) || 0,
            stats_json:   stats ? JSON.stringify(stats) : null,
            elements:     Object.keys(elements).length ? JSON.stringify(elements) : null,
            set_status:   setStatus || null
        };
        const r = await API.save('item', payload, id);
        if (r.success) ItemManager.init(); else alert(r.message || 'Save failed');
    },

    del: async (id) => {
        if (confirm('Delete this item?')) { await API.delete('item', id); ItemManager.init(); }
    }
};
