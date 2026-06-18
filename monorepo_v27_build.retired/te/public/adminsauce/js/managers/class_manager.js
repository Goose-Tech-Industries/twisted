// =================================================================
// CLASS MANAGER — Full editor for game_classes
// battle_cmds built with BattleCmdsBuilder — no JSON.
// =================================================================
const ClassManager = {
    _data: [],

    init: async () => {
        document.getElementById('pageTitle').innerText = '⚔️ CLASS MANAGER';
        const r = await API.getAll('class');
        ClassManager._data = r.success ? r.data : [];
        ClassManager.renderList();
    },

    renderList: () => {
        const d = ClassManager._data;
        let h = `<button class="action-btn save-btn" onclick="ClassManager.edit()">+ NEW CLASS</button>
        <table><thead><tr>
            <th>ICON</th><th>NAME</th><th>BASE HP</th><th>BASE MP</th><th>BASE ATK</th><th>BASE DEF</th><th>ACTIONS</th>
        </tr></thead><tbody>`;
        d.forEach(c => {
            h += `<tr>
                <td style="font-size:20px">${c.icon||'⚔️'}</td>
                <td><b>${c.name}</b><br><small style="color:var(--td)">${c.description||''}</small></td>
                <td>${c.base_hp}</td><td>${c.base_mp}</td>
                <td>${c.base_atk}</td><td>${c.base_def}</td>
                <td>
                    <button class="edit-btn" onclick='ClassManager.edit(${JSON.stringify(c)})'>EDIT</button>
                    <button class="del-btn" onclick="ClassManager.del(${c.id})">DEL</button>
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
            <h3 style="margin:0;color:var(--a)">${isNew ? '⚔️ New Class' : '✏️ Edit: ' + d.name}</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="ClassManager.save(${d.id||'null'})">💾 SAVE</button>
                <button class="edit-btn" onclick="ClassManager.init()">CANCEL</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Name</label><input id="cl_name" value="${d.name||''}"></div>
            <div><label>Icon (emoji)</label><input id="cl_icon" value="${d.icon||'⚔️'}"></div>
        </div>
        <label>Description</label>
        <textarea id="cl_desc" rows="2" style="margin-bottom:16px">${d.description||''}</textarea>

        <div style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:14px;margin-bottom:12px">
            <div style="color:var(--a);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">
                📊 Base Stats
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
                ${[['base_hp','❤️ HP'],['base_mp','💙 MP'],['base_atk','⚔️ ATK'],['base_def','🛡️ DEF'],
                   ['base_mo','🔮 MO (Mag.Atk)'],['base_md','💨 MD (Mag.Def)'],['base_speed','⚡ Speed'],['base_luck','🍀 Luck']].map(([f,label]) =>
                    `<div><label style="font-size:11px;color:var(--td)">${label}</label>
                     <input type="number" id="cl_${f}" value="${d[f]||0}" style="width:100%"></div>`
                ).join('')}
            </div>
        </div>

        <div style="display:flex;gap:16px;margin-bottom:16px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                <input type="checkbox" id="cl_hidden" ${d.hidden?'checked':''}> Hidden (not selectable at character creation)
            </label>
        </div>

        <div style="color:var(--a);font-weight:700;font-size:13px;margin-bottom:10px">⚔️ BATTLE COMMANDS</div>
        <div id="cl_cmds_builder"></div>`;

        await BattleCmdsBuilder.render('cl_cmds_builder', d.battle_cmds);
    },

    save: async (id) => {
        const cmds = BattleCmdsBuilder.collect('cl_cmds_builder');
        const payload = {
            name:       document.getElementById('cl_name').value,
            icon:       document.getElementById('cl_icon').value,
            description:document.getElementById('cl_desc').value,
            base_hp:    parseInt(document.getElementById('cl_base_hp').value) || 0,
            base_mp:    parseInt(document.getElementById('cl_base_mp').value) || 0,
            base_atk:   parseInt(document.getElementById('cl_base_atk').value) || 0,
            base_def:   parseInt(document.getElementById('cl_base_def').value) || 0,
            base_mo:    parseInt(document.getElementById('cl_base_mo').value) || 0,
            base_md:    parseInt(document.getElementById('cl_base_md').value) || 0,
            base_speed: parseInt(document.getElementById('cl_base_speed').value) || 0,
            base_luck:  parseInt(document.getElementById('cl_base_luck').value) || 0,
            hidden:     document.getElementById('cl_hidden').checked ? 1 : 0,
            battle_cmds:JSON.stringify(cmds)
        };
        const r = await API.save('class', payload, id);
        if (r.success) ClassManager.init(); else alert(r.message || 'Save failed');
    },

    del: async (id) => {
        if (confirm('Delete this class? Players using it will be unaffected but may lose class abilities.')) {
            await API.delete('class', id);
            ClassManager.init();
        }
    }
};
