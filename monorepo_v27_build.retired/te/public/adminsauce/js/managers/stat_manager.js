// =================================================================
// STAT MANAGER — Add, rename, and remove stats from the game engine
// =================================================================
// DB table: game_stat_definitions
//   key_name     — internal code used everywhere in the engine (e.g. "sanity")
//   display_name — what players see (e.g. "Sanity")
//   name         — alias for display_name (some installs use this column)
//   description  — tooltip text
//   icon         — emoji shown on character sheet
//   default_value — starting value for new characters
//   min_value    — floor (usually 0)
//   max_value    — ceiling (usually 9999)
//   type         — CORE (visible on sheet) | HIDDEN (backend only) | META (reputation etc)
//
// TEACHING: This table drives the entire stat system. Adding a row here
// automatically gives every new character that stat. Existing characters
// won't have it until you run a migration — the AdminSauce warns you.
// =================================================================

const StatManager = {
    _data: [],

    // Stats that power core game systems — deleting them breaks the engine
    LOCKED: ['hp', 'mp', 'atk', 'def', 'mo', 'md', 'speed', 'luck',
             'strength', 'intelligence', 'dexterity'],

    init: async () => {
        document.getElementById('pageTitle').innerText = '📊 STAT ENGINE';
        const res = await API.getAll('stat');
        StatManager._data = res.success ? res.data : [];
        StatManager.render();
    },

    render: () => {
        const d = StatManager._data;
        const isLocked = (s) => StatManager.LOCKED.includes(s.key_name);

        let h = `
        <div style="display:flex;gap:20px;align-items:flex-start">

        <!-- ── LEFT: Add new stat ── -->
        <div style="width:280px;flex-shrink:0;background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:16px">
            <div style="color:var(--a);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px">
                ➕ Define New Stat
            </div>
            <label>System Key <small style="color:var(--td)">(lowercase, no spaces — used in code)</small></label>
            <input type="text" id="ns_key" placeholder="e.g. sanity" style="margin-bottom:10px">

            <label>Display Name <small style="color:var(--td)">(what players see)</small></label>
            <input type="text" id="ns_name" placeholder="e.g. Sanity" style="margin-bottom:10px">

            <label>Description</label>
            <input type="text" id="ns_desc" placeholder="e.g. Mental resilience" style="margin-bottom:10px">

            <label>Icon (emoji)</label>
            <input type="text" id="ns_icon" value="📊" style="margin-bottom:10px;width:80px">

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
                <div><label>Default</label><input type="number" id="ns_default" value="0"></div>
                <div><label>Min</label><input type="number" id="ns_min" value="0"></div>
                <div><label>Max</label><input type="number" id="ns_max" value="9999"></div>
            </div>

            <label>Visibility</label>
            <select id="ns_type" style="margin-bottom:14px">
                <option value="CORE">CORE — Visible on character sheet</option>
                <option value="HIDDEN">HIDDEN — Backend only (not shown to players)</option>
                <option value="META">META — Reputation / currency-style tracking</option>
            </select>

            <button class="action-btn save-btn" onclick="StatManager.create()" style="width:100%">
                ADD TO ENGINE
            </button>

            <div style="margin-top:16px;padding:10px;background:var(--bg3);border-radius:6px;font-size:11px;color:var(--td);line-height:1.5">
                <b style="color:var(--y)">⚠️ Note:</b> New stats apply to characters created <i>after</i> this point.
                Existing characters won't have this stat until you run:<br>
                <code style="color:var(--a)">INSERT INTO character_stats SELECT id,'key',default,default FROM characters</code>
            </div>
        </div>

        <!-- ── RIGHT: Stat table ── -->
        <div style="flex:1">
            <table>
                <thead>
                    <tr>
                        <th>ICON</th><th>KEY</th><th>DISPLAY NAME</th>
                        <th>TYPE</th><th>DEFAULT</th><th>MIN</th><th>MAX</th>
                        <th>ACTIONS</th>
                    </tr>
                </thead>
                <tbody>`;

        d.forEach(s => {
            const locked = isLocked(s);
            const displayName = s.display_name || s.name || s.key_name;
            h += `<tr>
                <td style="text-align:center">${s.icon || '📊'}</td>
                <td><code>${s.key_name}</code></td>
                <td>
                    <input value="${displayName}"
                        onchange="StatManager.rename('${s.key_name}', this.value)"
                        style="background:transparent;border:none;border-bottom:1px solid var(--b);
                        color:var(--t);padding:2px 4px;width:120px;font-family:inherit">
                </td>
                <td>
                    <select onchange="StatManager.setType('${s.key_name}', this.value)"
                        style="background:var(--bg2);border:1px solid var(--b);color:var(--t);
                        padding:3px 6px;border-radius:4px;font-size:12px">
                        ${['CORE','HIDDEN','META'].map(t =>
                            `<option value="${t}" ${(s.type||'CORE')===t?'selected':''}>${t}</option>`
                        ).join('')}
                    </select>
                </td>
                <td style="text-align:center">${s.default_value ?? 0}</td>
                <td style="text-align:center">${s.min_value ?? 0}</td>
                <td style="text-align:center">${s.max_value ?? 9999}</td>
                <td>
                    ${locked
                        ? `<span style="color:var(--td);font-size:11px">🔒 LOCKED</span>`
                        : `<button class="del-btn" onclick="StatManager.del('${s.key_name}')">DEL</button>`
                    }
                </td>
            </tr>`;
        });

        h += `</tbody></table>
        </div></div>`;
        document.getElementById('dynamicArea').innerHTML = h;
    },

    create: async () => {
        const key  = document.getElementById('ns_key').value.trim().toLowerCase().replace(/\s+/g, '_');
        const name = document.getElementById('ns_name').value.trim();
        const desc = document.getElementById('ns_desc').value.trim();
        const icon = document.getElementById('ns_icon').value.trim() || '📊';
        const type = document.getElementById('ns_type').value;
        const def  = parseInt(document.getElementById('ns_default').value) || 0;
        const min  = parseInt(document.getElementById('ns_min').value) || 0;
        const max  = parseInt(document.getElementById('ns_max').value) || 9999;

        if (!key) { alert('System Key is required.'); return; }
        if (!name) { alert('Display Name is required.'); return; }
        if (!/^[a-z][a-z0-9_]*$/.test(key)) {
            alert('System Key must be lowercase letters, numbers, and underscores only.\nNo spaces or special characters.');
            return;
        }
        if (StatManager._data.find(s => s.key_name === key)) {
            alert(`Stat "${key}" already exists.`);
            return;
        }

        const payload = {
            key_name:      key,
            display_name:  name,
            name:          name,   // for installs that use 'name' column
            description:   desc,
            icon,
            type,
            default_value: def,
            min_value:     min,
            max_value:     max,
        };

        const res = await API.save('stat', payload);
        if (res.success) {
            StatManager.init();
        } else {
            alert('Failed to create stat: ' + (res.message || 'Unknown error'));
        }
    },

    rename: async (key, newName) => {
        if (!newName.trim()) return;
        await API.save('stat', { display_name: newName.trim(), name: newName.trim() }, key);
        // Update local cache without full reload
        const s = StatManager._data.find(x => x.key_name === key);
        if (s) { s.display_name = newName.trim(); s.name = newName.trim(); }
    },

    setType: async (key, type) => {
        await API.save('stat', { type }, key);
        const s = StatManager._data.find(x => x.key_name === key);
        if (s) s.type = type;
    },

    del: async (key) => {
        if (StatManager.LOCKED.includes(key)) {
            alert('This stat is locked — it powers core game systems and cannot be deleted.');
            return;
        }
        if (!confirm(
            `Delete stat "${key}"?\n\n` +
            `⚠️ This removes the definition but does NOT remove existing character_stats rows.\n` +
            `Existing characters will keep their recorded values until you clean up the DB manually.\n\n` +
            `Proceed?`
        )) return;

        const res = await API.delete('stat', key);
        if (res.success) {
            StatManager._data = StatManager._data.filter(s => s.key_name !== key);
            StatManager.render();
        } else {
            alert('Delete failed: ' + (res.message || 'Unknown error'));
        }
    }
};
