// =================================================================
// QUEST BOARD MANAGER — Manage game_quest_board entries
// =================================================================
// Board quests are dynamically gated by world flags and region state.
// Unlike NPC quest offers (manual assignment), these auto-filter
// based on conditions. You define them here once; the game handles
// when they appear and disappear.
// =================================================================

const QuestBoardManager = {
    _quests:  [],
    _regions: [],

    init: async () => {
        document.getElementById('pageTitle').innerText = '📋 QUEST BOARD';
        const [qr, rr] = await Promise.all([
            API.getAll('quest_board'), API.getAll('region')
        ]);
        QuestBoardManager._quests  = qr.success ? qr.data : [];
        QuestBoardManager._regions = rr.success ? rr.data : [];
        QuestBoardManager.renderList();
    },

    renderList: () => {
        const quests  = QuestBoardManager._quests;
        const regions = QuestBoardManager._regions;
        const regMap  = {};
        for (const r of regions) regMap[r.id] = r;

        const TYPE_COLOR = {
            BOARD:'#0cf', EVENT:'#bb86fc', FACTION:'#f80', REGIONAL:'#0a0'
        };

        let h = `
        <button class="action-btn save-btn" onclick="QuestBoardManager.edit()">+ NEW QUEST</button>
        <p style="color:var(--td);font-size:12px;margin:8px 0 16px">
            Board quests appear in-game when their conditions are met. Use requires_flags_json for world-flag gating
            and requires_region_json for regional state gating. Leave conditions empty for always-available quests.
        </p>
        <table><thead><tr>
            <th>TITLE</th><th>TYPE</th><th>REGION</th><th>CONDITIONS</th>
            <th>COMPLETIONS</th><th>EXPIRES</th><th>ON?</th><th>ACTIONS</th>
        </tr></thead><tbody>`;

        for (const q of quests) {
            const hasFlags  = q.requires_flags_json  && q.requires_flags_json  !== 'null';
            const hasRegion = q.requires_region_json && q.requires_region_json !== 'null';
            h += `<tr>
                <td><b>${q.title}</b>
                    <div style="font-size:10px;color:#555">${q.description||''}</div>
                </td>
                <td><span class="tag" style="background:${TYPE_COLOR[q.quest_type]||'#333'};color:#fff">${q.quest_type}</span></td>
                <td style="font-size:11px">${q.region_id ? (regMap[q.region_id]?.name || '#'+q.region_id) : 'Global'}</td>
                <td style="font-size:10px;color:#555">
                    ${hasFlags  ? '🌍 Flags' : ''}
                    ${hasRegion ? '⚠️ Region' : ''}
                    ${!hasFlags && !hasRegion ? '<span style="color:#333">Always</span>' : ''}
                </td>
                <td style="font-size:11px">
                    ${q.times_completed}/${q.max_completions || '∞'}
                </td>
                <td style="font-size:10px;color:#555">${q.expires_at ? new Date(q.expires_at).toLocaleDateString() : 'Never'}</td>
                <td>${q.is_active ? '<span class="tag tag-green">ON</span>' : '<span class="tag">OFF</span>'}</td>
                <td style="display:flex;gap:4px">
                    <button class="edit-btn" onclick="QuestBoardManager.edit(${q.id})">EDIT</button>
                    <button class="del-btn"  onclick="QuestBoardManager.del(${q.id})">DEL</button>
                </td>
            </tr>`;
        }
        h += '</tbody></table>';
        document.getElementById('dynamicArea').innerHTML = h;
    },

    edit: async (id) => {
        const d = id ? QuestBoardManager._quests.find(q => q.id === id) || {} : {};
        const isNew = !d.id;
        const regions = QuestBoardManager._regions;

        let objectives = [];
        let rewards    = {};
        let reqFlags   = [];
        let reqRegion  = {};
        try { objectives = typeof d.objectives_json === 'string' ? JSON.parse(d.objectives_json) : (d.objectives_json || []); } catch {}
        try { rewards    = typeof d.rewards_json    === 'string' ? JSON.parse(d.rewards_json)    : (d.rewards_json    || {}); } catch {}
        try { reqFlags   = typeof d.requires_flags_json  === 'string' ? JSON.parse(d.requires_flags_json)  : (d.requires_flags_json  || []); } catch {}
        try { reqRegion  = typeof d.requires_region_json === 'string' ? JSON.parse(d.requires_region_json) : (d.requires_region_json || {}); } catch {}

        QuestBoardManager._editObjectives = objectives.slice();
        QuestBoardManager._editReqFlags   = reqFlags.slice();

        const regionOpts = [{ id: '', name: '— Global (all regions) —' }, ...regions]
            .map(r => `<option value="${r.id||''}" ${d.region_id==r.id?'selected':''}>${r.name}</option>`)
            .join('');

        document.getElementById('dynamicArea').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;color:var(--a)">${isNew ? '+ New Quest' : '✏️ ' + d.title}</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="QuestBoardManager.save(${d.id||'null'})">💾 SAVE</button>
                <button class="edit-btn" onclick="QuestBoardManager.init()">CANCEL</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Title</label><input id="qb_title" value="${d.title||''}"></div>
            <div><label>Type</label>
                <select id="qb_type">
                    ${['BOARD','EVENT','FACTION','REGIONAL'].map(t =>
                        `<option value="${t}" ${d.quest_type===t?'selected':''}>${t}</option>`).join('')}
                </select>
            </div>
            <div><label>Region (optional)</label>
                <select id="qb_region">${regionOpts}</select></div>
        </div>

        <div style="margin-bottom:12px"><label>Description</label>
            <textarea id="qb_desc" rows="2">${d.description||''}</textarea>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Faction (optional)</label>
                <input id="qb_faction" value="${d.faction||''}" placeholder="e.g. merchants_guild"></div>
            <div><label>Max Completions (leave blank = unlimited)</label>
                <input type="number" id="qb_max" value="${d.max_completions||''}" placeholder="∞"></div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
            <div><label>Expires At (optional)</label>
                <input type="datetime-local" id="qb_expires"
                    value="${d.expires_at ? new Date(d.expires_at).toISOString().slice(0,16) : ''}"></div>
            <div style="padding-top:20px">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                    <input type="checkbox" id="qb_active" ${d.is_active!==0?'checked':''}>
                    Active (shows in-game)</label>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
            <div>
                <label>🌍 Requires World Flags <span style="color:#555;font-size:10px">(all must be true)</span></label>
                <div id="qb_flags_panel"></div>
                <div style="display:flex;gap:6px;margin-top:6px">
                    <input id="qb_flag_input" placeholder="flag key" style="flex:1">
                    <button class="edit-btn" onclick="QuestBoardManager._addFlag()">+ FLAG</button>
                </div>
            </div>
            <div>
                <label>⚠️ Requires Region State <span style="color:#555;font-size:10px">(JSON)</span></label>
                <textarea id="qb_req_region" rows="4" style="font-family:monospace;font-size:11px"
                    placeholder='{"min_danger":2,"faction":"undead","tag":"siege"}'
                    >${Object.keys(reqRegion).length ? JSON.stringify(reqRegion, null, 2) : ''}</textarea>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <label>📋 Objectives</label>
                    <button class="edit-btn" onclick="QuestBoardManager._addObj()">+ ADD</button>
                </div>
                <div id="qb_obj_panel"></div>
            </div>
            <div>
                <label>🏆 Rewards (JSON)</label>
                <textarea id="qb_rewards" rows="6" style="font-family:monospace;font-size:11px"
                    placeholder='{"xp":200,"gold":50,"items":[{"item_id":3,"qty":1}]}'
                    >${Object.keys(rewards).length ? JSON.stringify(rewards, null, 2) : ''}</textarea>
            </div>
        </div>`;

        QuestBoardManager._renderFlags();
        QuestBoardManager._renderObjectives();
    },

    _editObjectives: [],
    _editReqFlags:   [],

    _renderFlags: () => {
        const panel = document.getElementById('qb_flags_panel');
        if (!panel) return;
        const flags = QuestBoardManager._editReqFlags;
        panel.innerHTML = flags.length
            ? flags.map((f, i) => `<span style="display:inline-flex;align-items:center;gap:4px;background:#1a1a2a;
                border:1px solid #2a2a4a;border-radius:12px;padding:3px 10px;margin:2px;font-size:11px">
                ${f} <span onclick="QuestBoardManager._editReqFlags.splice(${i},1);QuestBoardManager._renderFlags()"
                style="cursor:pointer;color:#f55">✕</span></span>`).join('')
            : '<span style="color:#555;font-size:11px">No requirements — always available</span>';
    },

    _addFlag: () => {
        const v = document.getElementById('qb_flag_input')?.value?.trim();
        if (!v) return;
        if (!QuestBoardManager._editReqFlags.includes(v)) QuestBoardManager._editReqFlags.push(v);
        document.getElementById('qb_flag_input').value = '';
        QuestBoardManager._renderFlags();
    },

    _renderObjectives: () => {
        const panel = document.getElementById('qb_obj_panel');
        if (!panel) return;
        const objs = QuestBoardManager._editObjectives;
        if (!objs.length) { panel.innerHTML = '<p style="color:#555;font-size:11px">No objectives yet.</p>'; return; }
        let h = '';
        objs.forEach((o, i) => {
            h += `<div style="background:#0a0a1a;border:1px solid #1a1a2a;border-radius:4px;padding:8px;margin-bottom:6px">
                <div style="display:flex;gap:6px;margin-bottom:4px">
                    <select style="background:#111;border:1px solid #222;color:#e8eef6;padding:3px"
                        onchange="QuestBoardManager._editObjectives[${i}].type=this.value">
                        ${['KILL','COLLECT','VISIT','TALK','CRAFT'].map(t =>
                            `<option ${o.type===t?'selected':''}>${t}</option>`).join('')}
                    </select>
                    <input value="${o.target||''}" placeholder="Target (NPC name, item name, map name)"
                        style="flex:2;padding:3px;background:#111;border:1px solid #222;color:#e8eef6"
                        onchange="QuestBoardManager._editObjectives[${i}].target=this.value">
                    <input type="number" value="${o.count||1}" min="1" style="width:50px;padding:3px;background:#111;border:1px solid #222;color:#e8eef6"
                        onchange="QuestBoardManager._editObjectives[${i}].count=parseInt(this.value)||1">
                    <button class="del-btn" style="padding:2px 8px"
                        onclick="QuestBoardManager._editObjectives.splice(${i},1);QuestBoardManager._renderObjectives()">✕</button>
                </div>
                <input value="${o.description||''}" placeholder="Description shown to player"
                    style="width:100%;padding:3px;background:#111;border:1px solid #222;color:#e8eef6;box-sizing:border-box"
                    onchange="QuestBoardManager._editObjectives[${i}].description=this.value">
            </div>`;
        });
        panel.innerHTML = h;
    },

    _addObj: () => {
        QuestBoardManager._editObjectives.push({ type: 'KILL', target: '', count: 1, description: '' });
        QuestBoardManager._renderObjectives();
    },

    save: async (id) => {
        const title = document.getElementById('qb_title').value.trim();
        if (!title) { alert('Title required.'); return; }

        let reqRegion = null;
        try {
            const v = document.getElementById('qb_req_region').value.trim();
            reqRegion = v ? JSON.parse(v) : null;
        } catch { alert('Region requirements JSON is invalid.'); return; }

        let rewards = {};
        try {
            const v = document.getElementById('qb_rewards').value.trim();
            rewards = v ? JSON.parse(v) : {};
        } catch { alert('Rewards JSON is invalid.'); return; }

        const expiresAt = document.getElementById('qb_expires').value;
        const maxComp   = document.getElementById('qb_max').value;

        const payload = {
            title,
            description:         document.getElementById('qb_desc').value,
            quest_type:          document.getElementById('qb_type').value,
            region_id:           parseInt(document.getElementById('qb_region').value) || null,
            faction:             document.getElementById('qb_faction').value || null,
            requires_flags_json: JSON.stringify(QuestBoardManager._editReqFlags),
            requires_region_json:reqRegion ? JSON.stringify(reqRegion) : null,
            objectives_json:     JSON.stringify(QuestBoardManager._editObjectives),
            rewards_json:        JSON.stringify(rewards),
            expires_at:          expiresAt || null,
            max_completions:     maxComp ? parseInt(maxComp) : null,
            is_active:           document.getElementById('qb_active').checked ? 1 : 0,
        };

        const r = await API.save('quest_board', payload, id);
        if (r.success) QuestBoardManager.init();
        else alert(r.message || 'Save failed');
    },

    del: async (id) => {
        if (confirm('Delete this quest?')) {
            await API.delete('quest_board', id);
            QuestBoardManager.init();
        }
    }
};
