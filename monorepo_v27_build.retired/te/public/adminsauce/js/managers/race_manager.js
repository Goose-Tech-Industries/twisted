// =================================================================
// RACE MANAGER — Full editor for game_races
// DB: game_races (id, name, description, icon, lore,
//     bonus_hp, bonus_mp, bonus_atk, bonus_def, bonus_mo, bonus_md,
//     bonus_speed, bonus_luck, passive_ability, passive_desc, hidden)
// =================================================================
const RaceManager = {
    _data: [],

    init: async () => {
        document.getElementById('pageTitle').innerText = '🧬 RACE MANAGER';
        const r = await API.getAll('race');
        RaceManager._data = r.success ? r.data : [];
        RaceManager.renderList();
    },

    renderList: () => {
        const d = RaceManager._data;
        let h = `<button class="action-btn save-btn" onclick="RaceManager.edit()">+ NEW RACE</button>
        <table><thead><tr>
            <th>ICON</th><th>NAME</th><th>HP+</th><th>MP+</th><th>ATK+</th><th>DEF+</th>
            <th>MO+</th><th>MD+</th><th>SPD+</th><th>LCK+</th><th>PASSIVE</th><th>ACTIONS</th>
        </tr></thead><tbody>`;
        d.forEach(r => {
            const hidden = r.hidden ? ' <span style="color:var(--td);font-size:10px">[hidden]</span>' : '';
            h += `<tr>
                <td style="font-size:18px;text-align:center">${r.icon||'🧬'}</td>
                <td><b>${r.name}</b>${hidden}<br><small style="color:var(--td)">${r.description||''}</small></td>
                <td>${r.bonus_hp||0}</td><td>${r.bonus_mp||0}</td>
                <td>${r.bonus_atk||0}</td><td>${r.bonus_def||0}</td>
                <td>${r.bonus_mo||0}</td><td>${r.bonus_md||0}</td>
                <td>${r.bonus_speed||0}</td><td>${r.bonus_luck||0}</td>
                <td style="font-size:11px;color:var(--a2)">${r.passive_ability||'—'}</td>
                <td>
                    <button class="edit-btn" onclick='RaceManager.edit(${JSON.stringify(r).replace(/'/g,"&#39;")})'>EDIT</button>
                    <button class="del-btn" onclick="RaceManager.del(${r.id})">DEL</button>
                </td>
            </tr>`;
        });
        h += '</tbody></table>';
        document.getElementById('dynamicArea').innerHTML = h;
    },

    edit: (item) => {
        const d = item || {};
        const isNew = !d.id;
        const stats = [
            ['bonus_hp',    '❤️ HP'],
            ['bonus_mp',    '💙 MP'],
            ['bonus_atk',   '⚔️ ATK'],
            ['bonus_def',   '🛡️ DEF'],
            ['bonus_mo',    '🔮 MO'],
            ['bonus_md',    '💨 MD'],
            ['bonus_speed', '⚡ Speed'],
            ['bonus_luck',  '🍀 Luck'],
        ];

        document.getElementById('dynamicArea').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;color:var(--a)">${isNew ? '🧬 New Race' : '✏️ Edit: ' + d.name}</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="RaceManager.save(${d.id||'null'})">💾 SAVE</button>
                <button class="edit-btn" onclick="RaceManager.init()">CANCEL</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Name</label><input id="rc_name" value="${d.name||''}"></div>
            <div><label>Icon (emoji)</label><input id="rc_icon" value="${d.icon||'🧬'}"></div>
        </div>

        <label>Description <small style="color:var(--td)">(shown at character creation)</small></label>
        <textarea id="rc_description" rows="2" style="margin-bottom:12px">${d.description||''}</textarea>

        <label>Lore <small style="color:var(--td)">(flavour text / history)</small></label>
        <textarea id="rc_lore" rows="3" style="margin-bottom:16px">${d.lore||''}</textarea>

        <div style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:14px;margin-bottom:12px">
            <div style="color:var(--a);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">
                📊 Stat Bonuses
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
                ${stats.map(([f, label]) =>
                    `<div>
                        <label style="font-size:11px;color:var(--td)">${label}</label>
                        <input type="number" id="rc_${f}" value="${d[f]||0}" style="width:100%">
                    </div>`
                ).join('')}
            </div>
        </div>

        <div style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:14px;margin-bottom:12px">
            <div style="color:var(--a2);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">
                ✨ Passive Racial Ability
            </div>
            <div style="display:grid;grid-template-columns:1fr 2fr;gap:12px">
                <div>
                    <label>Ability Name <small style="color:var(--td)">(internal code)</small></label>
                    <input id="rc_passive_ability" value="${d.passive_ability||''}" placeholder="e.g. night_vision">
                </div>
                <div>
                    <label>Display Description</label>
                    <input id="rc_passive_desc" value="${d.passive_desc||''}" placeholder="e.g. Can see clearly in darkness.">
                </div>
            </div>
        </div>

        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:16px">
            <input type="checkbox" id="rc_hidden" ${d.hidden?'checked':''}> Hidden (not available at character creation)
        </label>`;
    },

    save: async (id) => {
        const name = document.getElementById('rc_name').value.trim();
        if (!name) { alert('Name is required.'); return; }

        const payload = {
            name,
            icon:            document.getElementById('rc_icon').value.trim() || '🧬',
            description:     document.getElementById('rc_description').value.trim(),
            lore:            document.getElementById('rc_lore').value.trim(),
            bonus_hp:        parseInt(document.getElementById('rc_bonus_hp').value) || 0,
            bonus_mp:        parseInt(document.getElementById('rc_bonus_mp').value) || 0,
            bonus_atk:       parseInt(document.getElementById('rc_bonus_atk').value) || 0,
            bonus_def:       parseInt(document.getElementById('rc_bonus_def').value) || 0,
            bonus_mo:        parseInt(document.getElementById('rc_bonus_mo').value) || 0,
            bonus_md:        parseInt(document.getElementById('rc_bonus_md').value) || 0,
            bonus_speed:     parseInt(document.getElementById('rc_bonus_speed').value) || 0,
            bonus_luck:      parseInt(document.getElementById('rc_bonus_luck').value) || 0,
            passive_ability: document.getElementById('rc_passive_ability').value.trim(),
            passive_desc:    document.getElementById('rc_passive_desc').value.trim(),
            hidden:          document.getElementById('rc_hidden').checked ? 1 : 0,
        };

        const r = await API.save('race', payload, id);
        if (r.success) RaceManager.init();
        else alert(r.message || 'Save failed');
    },

    del: async (id) => {
        if (confirm('Delete this race? Characters using it keep their current stats.')) {
            await API.delete('race', id);
            RaceManager.init();
        }
    }
};
