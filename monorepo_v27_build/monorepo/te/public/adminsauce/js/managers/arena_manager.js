// =================================================================
// ARENA MANAGER — PvP Zone Editor
// =================================================================
const ArenaManager = {
    data: [],
    maps: [],

    init: async () => {
        document.getElementById('pageTitle').innerText = "🏟️ ARENA ZONES";
        document.getElementById('dynamicArea').innerHTML = '<p>Loading...</p>';
        const [arenas, maps] = await Promise.all([API.getAll('arena'), API.getAll('map')]);
        ArenaManager.data = arenas.success ? arenas.data : [];
        ArenaManager.maps = maps.success ? maps.data : [];
        ArenaManager.renderList();
    },

    renderList: () => {
        const d = ArenaManager.data;
        let h = `<button class="action-btn save-btn" onclick="ArenaManager.edit()">+ NEW ARENA</button>
        <p style="color:var(--td);font-size:12px;margin:8px 0">Define PvP zones on maps. Players entering these areas can challenge others or be auto-matched.</p>
        <table><thead><tr><th>MAP</th><th>ARENA</th><th>TYPE</th><th>LEVELS</th><th>FEE</th><th>REWARD×</th><th>ON?</th><th>ACTIONS</th></tr></thead><tbody>`;
        d.forEach(a => {
            const map = ArenaManager.maps.find(m => m.id === a.map_id);
            h += `<tr>
                <td>${map ? map.name : '#'+a.map_id}</td>
                <td><b>${a.name}</b></td>
                <td><span class="tag tag-purple">${a.type}</span></td>
                <td>${a.min_level}-${a.max_level}</td>
                <td>${a.entry_fee}g</td>
                <td>×${a.reward_multiplier}</td>
                <td>${a.enabled ? '<span class="tag tag-green">ON</span>' : '<span class="tag tag-red">OFF</span>'}</td>
                <td><button class="edit-btn" onclick="ArenaManager.edit(${a.id})">EDIT</button>
                    <button class="del-btn" onclick="ArenaManager.del(${a.id})">DEL</button></td>
            </tr>`;
        });
        h += '</tbody></table>';
        document.getElementById('dynamicArea').innerHTML = h;
    },

    edit: (id) => {
        const item = id ? ArenaManager.data.find(a => a.id === id) : {};
        const d = item || {};
        const mapOpts = ArenaManager.maps.map(m => `<option value="${m.id}" ${d.map_id===m.id?'selected':''}>${m.name}</option>`).join('');
        document.getElementById('dynamicArea').innerHTML = `
        <h3>${id ? 'Edit Arena' : 'New Arena Zone'}</h3>
        <div class="grid-2">
            <div><label>MAP</label><select id="ar_map">${mapOpts}</select></div>
            <div><label>ARENA NAME</label><input id="ar_name" value="${d.name || ''}"></div>
        </div>
        <label>DESCRIPTION</label><textarea id="ar_desc" rows="2">${d.description || ''}</textarea>
        <div class="grid-4">
            <div><label>X MIN</label><input id="ar_xmin" type="number" value="${d.x_min||0}"></div>
            <div><label>Y MIN</label><input id="ar_ymin" type="number" value="${d.y_min||0}"></div>
            <div><label>X MAX</label><input id="ar_xmax" type="number" value="${d.x_max||19}"></div>
            <div><label>Y MAX</label><input id="ar_ymax" type="number" value="${d.y_max||19}"></div>
        </div>
        <div class="grid-3">
            <div><label>TYPE</label>
                <select id="ar_type">
                    ${['OPEN_PVP','QUEUE','TOURNAMENT','KING_OF_HILL'].map(t => `<option ${d.type===t?'selected':''}>${t}</option>`).join('')}
                </select>
                <small style="color:var(--td)">OPEN_PVP=challenge anyone, QUEUE=matchmaker, TOURNAMENT=brackets, KOTH=last one standing</small>
            </div>
            <div><label>MIN LEVEL</label><input id="ar_minlvl" type="number" value="${d.min_level||1}"></div>
            <div><label>MAX LEVEL</label><input id="ar_maxlvl" type="number" value="${d.max_level||50}"></div>
        </div>
        <div class="grid-4">
            <div><label>ENTRY FEE (Gold)</label><input id="ar_fee" type="number" value="${d.entry_fee||0}"></div>
            <div><label>REWARD MULTIPLIER</label><input id="ar_mult" type="number" step="0.1" value="${d.reward_multiplier||1}"></div>
            <div><label>MAX PLAYERS (0=∞)</label><input id="ar_max" type="number" value="${d.max_players||0}"></div>
            <div><label>LEVEL MATCHING</label><select id="ar_match"><option value="1" ${d.level_matching!==0?'selected':''}>Yes</option><option value="0" ${d.level_matching===0?'selected':''}>No</option></select></div>
        </div>
        <div><label>ENABLED</label><select id="ar_on"><option value="1" ${d.enabled!==0?'selected':''}>Yes</option><option value="0" ${d.enabled===0?'selected':''}>No</option></select></div>
        <div class="btn-row">
            <button class="action-btn save-btn" onclick="ArenaManager.save(${id||'null'})">💾 SAVE</button>
            <button class="edit-btn" onclick="ArenaManager.init()">CANCEL</button>
        </div>`;
    },

    save: async (id) => {
        const payload = {
            map_id: parseInt(document.getElementById('ar_map').value),
            name: document.getElementById('ar_name').value,
            description: document.getElementById('ar_desc').value,
            x_min: parseInt(document.getElementById('ar_xmin').value),
            y_min: parseInt(document.getElementById('ar_ymin').value),
            x_max: parseInt(document.getElementById('ar_xmax').value),
            y_max: parseInt(document.getElementById('ar_ymax').value),
            type: document.getElementById('ar_type').value,
            min_level: parseInt(document.getElementById('ar_minlvl').value),
            max_level: parseInt(document.getElementById('ar_maxlvl').value),
            entry_fee: parseInt(document.getElementById('ar_fee').value),
            reward_multiplier: parseFloat(document.getElementById('ar_mult').value),
            max_players: parseInt(document.getElementById('ar_max').value),
            level_matching: parseInt(document.getElementById('ar_match').value),
            enabled: parseInt(document.getElementById('ar_on').value)
        };
        const r = await API.save('arena', payload, id);
        if (r.success) ArenaManager.init(); else alert(r.message);
    },

    del: async (id) => { if (confirm('Delete arena?')) { await API.delete('arena', id); ArenaManager.init(); } }
};
