// =================================================================
// SPAWN MANAGER — Random Encounter Zone Editor
// =================================================================
const SpawnManager = {
    data: [],
    maps: [],
    npcs: [],

    init: async () => {
        document.getElementById('pageTitle').innerText = "👹 RANDOM ENCOUNTERS";
        document.getElementById('dynamicArea').innerHTML = '<p>Loading...</p>';
        const [spawns, maps, npcs] = await Promise.all([
            API.getAll('spawn'), API.getAll('map'), API.getAll('npc')
        ]);
        SpawnManager.data = spawns.success ? spawns.data : [];
        SpawnManager.maps = maps.success ? maps.data : [];
        SpawnManager.npcs = npcs.success ? npcs.data : [];
        SpawnManager.renderList();
    },

    renderList: () => {
        const d = SpawnManager.data;
        let h = `<button class="action-btn save-btn" onclick="SpawnManager.edit()">+ NEW SPAWN ZONE</button>
        <p style="color:var(--td);font-size:12px;margin:8px 0">Define rectangular zones on maps where random battles trigger as players walk. Each zone has its own enemy pool and encounter rate.</p>
        <table><thead><tr><th>MAP</th><th>ZONE NAME</th><th>AREA</th><th>RATE</th><th>LEVELS</th><th>ENEMIES</th><th>ON?</th><th>ACTIONS</th></tr></thead><tbody>`;
        d.forEach(s => {
            const map = SpawnManager.maps.find(m => m.id === s.map_id);
            let enemies = [];
            try { enemies = JSON.parse(s.encounter_table || '[]'); } catch {}
            h += `<tr>
                <td>${map ? map.name : '#'+s.map_id}</td>
                <td><b>${s.name}</b></td>
                <td><code>(${s.x_min},${s.y_min})→(${s.x_max},${s.y_max})</code></td>
                <td>${s.encounter_rate}%</td>
                <td>${s.min_level}-${s.max_level}</td>
                <td>${enemies.length} types</td>
                <td>${s.enabled ? '<span class="tag tag-green">ON</span>' : '<span class="tag tag-red">OFF</span>'}</td>
                <td>
                    <button class="edit-btn" onclick="SpawnManager.edit(${s.id})">EDIT</button>
                    <button class="del-btn" onclick="SpawnManager.del(${s.id})">DEL</button>
                </td>
            </tr>`;
        });
        h += '</tbody></table>';
        document.getElementById('dynamicArea').innerHTML = h;
    },

    edit: (id) => {
        const item = id ? SpawnManager.data.find(s => s.id === id) : {};
        const d = item || {};
        let enc = [];
        try { enc = JSON.parse(d.encounter_table || '[]'); } catch {}

        const mapOpts = SpawnManager.maps.map(m => `<option value="${m.id}" ${d.map_id===m.id?'selected':''}>${m.name} (#${m.id})</option>`).join('');
        // TEACHING: Only enemies (is_enemy=1) have a char_id, which is what
        // the battle engine needs. Including dialogue NPCs here would cause a
        // silent crash when the battle tries to load their stats.
        const enemies = SpawnManager.npcs.filter(n => n.is_enemy == 1);
        const npcOpts = enemies.length
            ? enemies.map(n => `<option value="${n.id}">${n.icon||'👹'} ${n.name} (#${n.id})</option>`).join('')
            : '<option disabled>No enemy NPCs yet — create one in NPC Manager with Is Enemy checked</option>';

        document.getElementById('dynamicArea').innerHTML = `
        <h3>${id ? 'Edit Spawn Zone' : 'New Spawn Zone'}</h3>
        <div class="grid-2">
            <div><label>MAP</label><select id="sp_map">${mapOpts}</select></div>
            <div><label>ZONE NAME</label><input id="sp_name" value="${d.name || 'Encounter Zone'}"></div>
        </div>
        <div class="grid-4">
            <div><label>X MIN</label><input id="sp_xmin" type="number" value="${d.x_min || 0}"></div>
            <div><label>Y MIN</label><input id="sp_ymin" type="number" value="${d.y_min || 0}"></div>
            <div><label>X MAX</label><input id="sp_xmax" type="number" value="${d.x_max || 19}"></div>
            <div><label>Y MAX</label><input id="sp_ymax" type="number" value="${d.y_max || 19}"></div>
        </div>
        <div class="grid-3">
            <div><label>ENCOUNTER RATE (%)</label><input id="sp_rate" type="number" value="${d.encounter_rate || 10}" min="0" max="100">
                <small style="color:var(--td)">0=disabled, 10=~1/10 steps, 100=every step</small></div>
            <div><label>MIN PLAYER LEVEL</label><input id="sp_minlvl" type="number" value="${d.min_level || 1}"></div>
            <div><label>MAX PLAYER LEVEL</label><input id="sp_maxlvl" type="number" value="${d.max_level || 50}"></div>
        </div>
        <div class="grid-2">
            <div><label>ENABLED</label><select id="sp_enabled"><option value="1" ${d.enabled!==0?'selected':''}>Yes</option><option value="0" ${d.enabled===0?'selected':''}>No</option></select></div>
            <div><label>REQUIRED PLAYER FLAG (optional)</label><input id="sp_flag" value="${d.required_flag || ''}" placeholder="Personal quest flag on player"></div>
        </div>
        <div style="margin-bottom:12px">
            <label>🌍 WORLD FLAG CONDITIONS <span style="color:#555;font-size:10px">(JSON — all must be true for zone to be active)</span></label>
            <textarea id="sp_wf_conds" rows="2" style="font-family:monospace;font-size:11px" placeholder='e.g. [{"flag":"war_started","op":"==","value":"true"}]'>${d.world_flag_conditions||''}</textarea>
            <div style="font-size:10px;color:#555">Leave blank = always active. Example: blood moon adds a harder encounter zone.</div>
        </div>

        <div class="grid-2" style="margin-bottom:12px">
            <div><label>⚖️ ENEMY SCALING FACTOR</label>
                <input id="sp_scaling" type="number" step="0.1" min="0" max="3" value="${d.scaling_factor != null ? d.scaling_factor : 0.3}">
                <small style="color:var(--td)">0 = no scaling, 0.3 = +30% per extra player. Duo=1.3x, Trio=1.6x, Quad=1.9x</small></div>
            <div></div>
        </div>

        <h4 style="margin-top:16px;color:var(--a)">ENCOUNTER TABLE</h4>
        <p style="color:var(--td);font-size:12px;margin-bottom:8px">Add NPCs that can appear as enemies. Weight = relative chance (higher = more common).</p>
        <div id="enc_table"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
            <select id="enc_npc_select">${npcOpts}</select>
            <input id="enc_weight" type="number" value="50" style="width:80px" placeholder="Weight">
            <button class="edit-btn" onclick="SpawnManager.addEnc()">+ ADD ENEMY</button>
        </div>

        <div class="btn-row" style="margin-top:20px">
            <button class="action-btn save-btn" onclick="SpawnManager.save(${id||'null'})">💾 SAVE ZONE</button>
            <button class="edit-btn" onclick="SpawnManager.init()">CANCEL</button>
        </div>`;

        SpawnManager._enc = enc;
        SpawnManager._renderEncTable();
    },

    _enc: [],

    _renderEncTable: () => {
        const el = document.getElementById('enc_table');
        if (!el) return;
        if (!SpawnManager._enc.length) { el.innerHTML = '<p style="color:var(--td)">No enemies added yet.</p>'; return; }
        let h = '<table><thead><tr><th>NPC</th><th>WEIGHT</th><th></th></tr></thead><tbody>';
        SpawnManager._enc.forEach((e, i) => {
            const npc = SpawnManager.npcs.find(n => n.id === e.npc_id);
            h += `<tr><td>${npc ? npc.name : '#'+e.npc_id}</td><td>${e.weight}</td>
                <td><button class="del-btn" onclick="SpawnManager.removeEnc(${i})">✕</button></td></tr>`;
        });
        h += '</tbody></table>';
        el.innerHTML = h;
    },

    addEnc: () => {
        const npcId = parseInt(document.getElementById('enc_npc_select').value);
        if (!npcId) { alert('Select an enemy NPC first. Create enemies in the NPC Manager (Is Enemy checkbox).'); return; }
        const weight = parseInt(document.getElementById('enc_weight').value) || 50;
        SpawnManager._enc.push({ npc_id: npcId, weight });
        SpawnManager._renderEncTable();
    },

    removeEnc: (i) => { SpawnManager._enc.splice(i, 1); SpawnManager._renderEncTable(); },

    save: async (id) => {
        const payload = {
            map_id: parseInt(document.getElementById('sp_map').value),
            name: document.getElementById('sp_name').value,
            x_min: parseInt(document.getElementById('sp_xmin').value),
            y_min: parseInt(document.getElementById('sp_ymin').value),
            x_max: parseInt(document.getElementById('sp_xmax').value),
            y_max: parseInt(document.getElementById('sp_ymax').value),
            encounter_rate: parseInt(document.getElementById('sp_rate').value),
            min_level: parseInt(document.getElementById('sp_minlvl').value),
            max_level: parseInt(document.getElementById('sp_maxlvl').value),
            enabled: parseInt(document.getElementById('sp_enabled').value),
            required_flag: document.getElementById('sp_flag').value || null,
            world_flag_conditions: document.getElementById('sp_wf_conds').value.trim() || null,
            scaling_factor: parseFloat(document.getElementById('sp_scaling').value) || 0.3,
            encounter_table: JSON.stringify(SpawnManager._enc)
        };
        const r = await API.save('spawn', payload, id);
        if (r.success) SpawnManager.init(); else alert(r.message);
    },

    del: async (id) => { if (confirm('Delete zone?')) { await API.delete('spawn', id); SpawnManager.init(); } }
};
