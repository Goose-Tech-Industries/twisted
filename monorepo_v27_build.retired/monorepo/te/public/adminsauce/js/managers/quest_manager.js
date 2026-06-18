// =================================================================
// QUEST MANAGER — Visual builder for game_quests
// Objectives and rewards built with click-to-add forms.
// =================================================================
const QuestManager = {
    _data: [],

    init: async () => {
        document.getElementById('pageTitle').innerText = '📜 QUEST EDITOR';
        const r = await API.getAll('quest');
        QuestManager._data = r.success ? r.data : [];
        QuestManager.renderList();
    },

    renderList: () => {
        const d = QuestManager._data;
        let h = `<button class="action-btn save-btn" onclick="QuestManager.edit()">+ NEW QUEST</button>
        <table><thead><tr>
            <th>ID</th><th>TITLE</th><th>TYPE</th><th>LVL REQ</th><th>REPEATABLE</th><th>ACTIVE</th><th>ACTIONS</th>
        </tr></thead><tbody>`;
        d.forEach(q => {
            h += `<tr>
                <td><code>${q.quest_id}</code></td>
                <td><b>${q.title}</b><br><small style="color:var(--td)">${q.description||''}</small></td>
                <td><span class="tag">${q.quest_type||'main'}</span></td>
                <td>${q.required_level||1}</td>
                <td>${q.is_repeatable ? '<span class="tag tag-green">Yes</span>' : '—'}</td>
                <td>${q.is_active ? '<span class="tag tag-green">Yes</span>' : '<span class="tag" style="background:#333">No</span>'}</td>
                <td>
                    <button class="edit-btn" onclick='QuestManager.edit(${JSON.stringify(q)})'>EDIT</button>
                    <button class="del-btn" onclick="QuestManager.del('${q.quest_id}')">DEL</button>
                </td>
            </tr>`;
        });
        h += '</tbody></table>';
        document.getElementById('dynamicArea').innerHTML = h;
    },

    edit: (item) => {
        const d = item || {};
        const isNew = !d.quest_id;

        document.getElementById('dynamicArea').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;color:var(--a)">${isNew ? '📜 New Quest' : '✏️ Edit: ' + d.title}</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="QuestManager.save('${d.quest_id||''}')">💾 SAVE</button>
                <button class="edit-btn" onclick="QuestManager.init()">CANCEL</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 2fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Quest ID (unique key)</label>
                <input id="qm_id" value="${d.quest_id||''}" placeholder="e.g. main_01" ${!isNew?'readonly style="color:#666"':''}></div>
            <div><label>Title</label><input id="qm_title" value="${d.title||''}"></div>
            <div><label>Type</label>
                <select id="qm_type">
                    ${['main','side','daily','guild','arena'].map(t =>
                        `<option ${d.quest_type===t?'selected':''}>${t}</option>`).join('')}
                </select>
            </div>
        </div>
        <label>Description (shown to player)</label>
        <textarea id="qm_desc" rows="3" style="margin-bottom:12px">${d.description||''}</textarea>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:16px">
            <div><label>Level Required</label>
                <input type="number" id="qm_lvl" value="${d.required_level||1}" min="1"></div>
            <div><label>Max Completions</label>
                <input type="number" id="qm_maxc" value="${d.max_completions||0}" min="0" title="0 = unlimited"></div>
            <div><label>Cooldown (hours, if repeatable)</label>
                <input type="number" id="qm_cd" value="${d.repeat_cooldown_hours||0}" min="0"></div>
            <div style="display:flex;flex-direction:column;gap:8px;padding-top:4px">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                    <input type="checkbox" id="qm_repeat" ${d.is_repeatable?'checked':''}> Repeatable
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                    <input type="checkbox" id="qm_active" ${d.is_active||isNew?'checked':''}> Active
                </label>
            </div>
        </div>

        <div style="color:var(--a);font-weight:700;font-size:13px;margin-bottom:10px">📋 OBJECTIVES & REWARDS</div>
        <div id="qm_builder"></div>`;

        QuestBuilder.render('qm_builder', d.objectives_json, d.rewards_json);
    },

    save: async (existingId) => {
        const newId = document.getElementById('qm_id').value.trim();
        if (!newId) { alert('Quest ID is required'); return; }

        const objectives = QuestBuilder.collectObjectives('qm_builder');
        const rewards    = QuestBuilder.collectRewards('qm_builder');

        const payload = {
            quest_id:              newId,
            title:                 document.getElementById('qm_title').value,
            quest_type:            document.getElementById('qm_type').value,
            description:           document.getElementById('qm_desc').value,
            required_level:        parseInt(document.getElementById('qm_lvl').value) || 1,
            max_completions:       parseInt(document.getElementById('qm_maxc').value) || 0,
            repeat_cooldown_hours: parseInt(document.getElementById('qm_cd').value) || 0,
            is_repeatable:         document.getElementById('qm_repeat').checked ? 1 : 0,
            is_active:             document.getElementById('qm_active').checked ? 1 : 0,
            objectives_json:       JSON.stringify(objectives),
            rewards_json:          JSON.stringify(rewards)
        };

        const r = await API.save('quest', payload, existingId || null);
        if (r.success) QuestManager.init(); else alert(r.message || 'Save failed');
    },

    del: async (questId) => {
        if (confirm(`Delete quest "${questId}"?`)) {
            await API.delete('quest', questId);
            QuestManager.init();
        }
    }
};
