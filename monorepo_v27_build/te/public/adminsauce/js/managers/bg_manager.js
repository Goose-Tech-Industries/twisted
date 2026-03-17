// =================================================================
// BACKGROUND MANAGER — Origin stories with stat bonuses
// DB: game_backgrounds (id, name, description, bonus_hp, bonus_mp,
//     bonus_atk, bonus_def, bonus_mo, bonus_md, bonus_speed, bonus_luck,
//     bonus_str, icon, lore)
// =================================================================
const BgManager = {
    _data: [],

    init: async () => {
        document.getElementById('pageTitle').innerText = '📖 BACKGROUND EDITOR';
        const r = await API.getAll('bg');
        BgManager._data = r.success ? r.data : [];
        BgManager.renderList();
    },

    renderList: () => {
        const d = BgManager._data;
        let h = `<button class="action-btn save-btn" onclick="BgManager.edit()">+ NEW BACKGROUND</button>
        <p style="color:var(--td);font-size:12px;margin:8px 0">
            Backgrounds are the player's origin story — a small narrative boost applied at character creation.
        </p>
        <table><thead><tr>
            <th>ICON</th><th>NAME</th><th>HP+</th><th>MP+</th><th>ATK+</th><th>DEF+</th><th>SPD+</th><th>ACTIONS</th>
        </tr></thead><tbody>`;
        d.forEach(b => {
            h += `<tr>
                <td style="font-size:18px;text-align:center">${b.icon||'📖'}</td>
                <td><b>${b.name}</b><br><small style="color:var(--td)">${b.description||''}</small></td>
                <td style="color:${b.bonus_hp>0?'var(--g)':'var(--t)'}">${b.bonus_hp||0}</td>
                <td style="color:${b.bonus_mp>0?'#3399ff':'var(--t)'}">${b.bonus_mp||0}</td>
                <td>${b.bonus_atk||0}</td>
                <td>${b.bonus_def||0}</td>
                <td>${b.bonus_speed||0}</td>
                <td>
                    <button class="edit-btn" onclick='BgManager.edit(${JSON.stringify(b).replace(/'/g,"&#39;")})'>EDIT</button>
                    <button class="del-btn" onclick="BgManager.del(${b.id})">DEL</button>
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
            ['bonus_hp',    '❤️ HP Bonus'],
            ['bonus_mp',    '💙 MP Bonus'],
            ['bonus_atk',   '⚔️ ATK Bonus'],
            ['bonus_def',   '🛡️ DEF Bonus'],
            ['bonus_mo',    '🔮 MO Bonus'],
            ['bonus_md',    '💨 MD Bonus'],
            ['bonus_speed', '⚡ Speed Bonus'],
            ['bonus_luck',  '🍀 Luck Bonus'],
        ];

        document.getElementById('dynamicArea').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;color:var(--a)">${isNew ? '📖 New Background' : '✏️ Edit: ' + d.name}</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="BgManager.save(${d.id||'null'})">💾 SAVE</button>
                <button class="edit-btn" onclick="BgManager.init()">CANCEL</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Name</label><input id="bg_name" value="${d.name||''}"></div>
            <div><label>Icon (emoji)</label><input id="bg_icon" value="${d.icon||'📖'}"></div>
        </div>

        <label>Description <small style="color:var(--td)">(shown at character creation)</small></label>
        <textarea id="bg_description" rows="2" style="margin-bottom:12px">${d.description||''}</textarea>

        <label>Lore <small style="color:var(--td)">(optional flavour text)</small></label>
        <textarea id="bg_lore" rows="2" style="margin-bottom:16px">${d.lore||''}</textarea>

        <div style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:14px;margin-bottom:12px">
            <div style="color:var(--a);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">
                📊 Stat Bonuses <small style="color:var(--td);font-weight:normal;text-transform:none">(added on top of class + race at creation)</small>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
                ${stats.map(([f, label]) =>
                    `<div>
                        <label style="font-size:11px;color:var(--td)">${label}</label>
                        <input type="number" id="bg_${f}" value="${d[f]||0}" style="width:100%">
                    </div>`
                ).join('')}
            </div>
        </div>

        <label>Display String <small style="color:var(--td)">(legacy label shown on creation screen, e.g. "+10 HP, +5 ATK")</small></label>
        <input id="bg_bonus_str" value="${d.bonus_str||''}" placeholder="Auto-generated if blank">`;
    },

    save: async (id) => {
        const name = document.getElementById('bg_name').value.trim();
        if (!name) { alert('Name is required.'); return; }

        // Auto-generate bonus_str if blank
        let bonusStr = document.getElementById('bg_bonus_str').value.trim();
        if (!bonusStr) {
            const parts = [];
            const fields = ['bonus_hp','bonus_mp','bonus_atk','bonus_def','bonus_mo','bonus_md','bonus_speed','bonus_luck'];
            const labels = ['HP','MP','ATK','DEF','MO','MD','SPD','LCK'];
            fields.forEach((f, i) => {
                const v = parseInt(document.getElementById('bg_' + f).value) || 0;
                if (v !== 0) parts.push(`${v > 0 ? '+' : ''}${v} ${labels[i]}`);
            });
            bonusStr = parts.join(', ') || 'No stat bonuses';
        }

        const payload = {
            name,
            icon:        document.getElementById('bg_icon').value.trim() || '📖',
            description: document.getElementById('bg_description').value.trim(),
            lore:        document.getElementById('bg_lore').value.trim(),
            bonus_hp:    parseInt(document.getElementById('bg_bonus_hp').value) || 0,
            bonus_mp:    parseInt(document.getElementById('bg_bonus_mp').value) || 0,
            bonus_atk:   parseInt(document.getElementById('bg_bonus_atk').value) || 0,
            bonus_def:   parseInt(document.getElementById('bg_bonus_def').value) || 0,
            bonus_mo:    parseInt(document.getElementById('bg_bonus_mo').value) || 0,
            bonus_md:    parseInt(document.getElementById('bg_bonus_md').value) || 0,
            bonus_speed: parseInt(document.getElementById('bg_bonus_speed').value) || 0,
            bonus_luck:  parseInt(document.getElementById('bg_bonus_luck').value) || 0,
            bonus_str:   bonusStr,
        };

        const r = await API.save('bg', payload, id);
        if (r.success) BgManager.init();
        else alert(r.message || 'Save failed');
    },

    del: async (id) => {
        if (confirm('Delete this background? Players using it will be unaffected.')) {
            await API.delete('bg', id);
            BgManager.init();
        }
    }
};
