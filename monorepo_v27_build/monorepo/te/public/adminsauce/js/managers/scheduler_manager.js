// =================================================================
// SCHEDULER MANAGER — Manage game_scheduled_tasks
// =================================================================
// Lets you create, edit, and monitor scheduled server tasks without
// touching any code. Tasks run automatically on the server.
// =================================================================

const SchedulerManager = {
    _tasks: [],

    init: async () => {
        document.getElementById('pageTitle').innerText = '🕐 SCHEDULED TASKS';
        const r = await API.getAll('scheduled_task');
        SchedulerManager._tasks = r.success ? r.data : [];
        SchedulerManager.renderList();
    },

    renderList: () => {
        const tasks = SchedulerManager._tasks;

        const TASK_ICONS = {
            SHOP_RESTOCK:   '🏪',
            SPAWN_RESPAWN:  '👹',
            DUNGEON_RESET:  '🏚️',
            SET_WORLD_FLAG: '🌍',
            GIVE_XP_ALL:    '🌟',
            BROADCAST:      '📣'
        };

        const schedLabel = (t) => {
            if (t.schedule_type === 'INTERVAL_MINUTES') return `Every ${t.interval_minutes} min`;
            if (t.schedule_type === 'HOURLY')           return `Hourly`;
            if (t.schedule_type === 'DAILY')            return `Daily at ${String(t.run_at_hour||0).padStart(2,'0')}:00`;
            const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            return `${days[t.run_at_day||1]} at ${String(t.run_at_hour||0).padStart(2,'0')}:00`;
        };

        let h = `<button class="action-btn save-btn" onclick="SchedulerManager.edit()">+ NEW TASK</button>
        <table><thead><tr>
            <th>TASK</th><th>TYPE</th><th>SCHEDULE</th><th>LAST RAN</th><th>STATUS</th><th>ACTIONS</th>
        </tr></thead><tbody>`;

        for (const t of tasks) {
            const icon = TASK_ICONS[t.task_type] || '⚙️';
            h += `<tr>
                <td><b>${icon} ${t.name}</b></td>
                <td><span class="tag">${t.task_type}</span></td>
                <td style="font-size:11px;color:var(--td)">${schedLabel(t)}</td>
                <td style="font-size:11px;color:#555">${t.last_run_at ? new Date(t.last_run_at).toLocaleString() : 'Never'}</td>
                <td><span class="tag ${t.is_enabled ? 'tag-green' : ''}">${t.is_enabled ? '✅ ON' : '⛔ OFF'}</span></td>
                <td style="display:flex;gap:4px">
                    <button class="edit-btn" onclick='SchedulerManager.edit(${JSON.stringify(t)})'>EDIT</button>
                    <button class="action-btn" style="background:#1a3a1a;border-color:#2a5a2a;font-size:11px;padding:4px 8px"
                        onclick="SchedulerManager.runNow(${t.id})">▶ RUN</button>
                    <button class="del-btn" onclick="SchedulerManager.del(${t.id})">DEL</button>
                </td>
            </tr>`;
        }
        h += '</tbody></table>';
        document.getElementById('dynamicArea').innerHTML = h;
    },

    edit: (item) => {
        const d = item || {};
        const isNew = !d.id;

        let cfg = {};
        try { cfg = typeof d.config_json === 'string' ? JSON.parse(d.config_json) : (d.config_json || {}); } catch {}

        document.getElementById('dynamicArea').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;color:var(--a)">${isNew ? '+ New Task' : '✏️ Edit: ' + d.name}</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="SchedulerManager.save(${d.id||'null'})">💾 SAVE</button>
                <button class="edit-btn" onclick="SchedulerManager.init()">CANCEL</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Task Name</label><input id="st_name" value="${d.name||''}"></div>
            <div><label>Task Type</label>
                <select id="st_type" onchange="SchedulerManager._updateConfigPanel()">
                    ${['SHOP_RESTOCK','SPAWN_RESPAWN','DUNGEON_RESET','SET_WORLD_FLAG','SET_REGION_STATE','GIVE_XP_ALL','BROADCAST'].map(t =>
                        `<option value="${t}" ${d.task_type===t?'selected':''}>${t}</option>`).join('')}
                </select>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Schedule</label>
                <select id="st_sched" onchange="SchedulerManager._updateSchedPanel()">
                    ${['DAILY','HOURLY','WEEKLY','INTERVAL_MINUTES'].map(s =>
                        `<option ${d.schedule_type===s?'selected':''}>${s}</option>`).join('')}
                </select>
            </div>
            <div id="st_hour_wrap"><label>Hour (0-23)</label>
                <input type="number" id="st_hour" value="${d.run_at_hour||0}" min="0" max="23" style="width:70px">
            </div>
            <div id="st_day_wrap" style="display:none"><label>Day (0=Sun)</label>
                <input type="number" id="st_day" value="${d.run_at_day||1}" min="0" max="6" style="width:60px">
            </div>
            <div id="st_interval_wrap" style="display:none"><label>Every N minutes</label>
                <input type="number" id="st_interval" value="${d.interval_minutes||60}" min="1" style="width:70px">
            </div>
            <div><label>Enabled</label>
                <select id="st_enabled">
                    <option value="1" ${d.is_enabled!=0?'selected':''}>✅ Yes</option>
                    <option value="0" ${d.is_enabled==0?'selected':''}>⛔ No</option>
                </select>
            </div>
        </div>

        <div style="margin-bottom:12px">
            <label>Target ID <span style="color:#555;font-size:10px">(shop_id or map_id — leave 0 for ALL)</span></label>
            <input type="number" id="st_target" value="${d.target_id||0}" style="width:100px">
        </div>

        <div id="st_config_panel"></div>`;

        // Seed config fields
        SchedulerManager._currentCfg = cfg;
        SchedulerManager._updateConfigPanel();
        SchedulerManager._updateSchedPanel();
    },

    _currentCfg: {},

    _updateSchedPanel: () => {
        const s = document.getElementById('st_sched')?.value;
        const hourWrap = document.getElementById('st_hour_wrap');
        const dayWrap  = document.getElementById('st_day_wrap');
        const intWrap  = document.getElementById('st_interval_wrap');
        if (!hourWrap) return;
        hourWrap.style.display  = (s === 'DAILY' || s === 'WEEKLY') ? '' : 'none';
        dayWrap.style.display   = (s === 'WEEKLY') ? '' : 'none';
        intWrap.style.display   = (s === 'INTERVAL_MINUTES') ? '' : 'none';
    },

    _updateConfigPanel: () => {
        const type = document.getElementById('st_type')?.value;
        const cfg  = SchedulerManager._currentCfg || {};
        const panel = document.getElementById('st_config_panel');
        if (!panel) return;

        const DESCRIPTIONS = {
            SHOP_RESTOCK:   'Resets limited-stock items in shops back to their restock quantity.',
            SPAWN_RESPAWN:  'Marks all dead enemy NPCs as alive again. Players will see them next visit.',
            DUNGEON_RESET:  'Boots all players off the target map and respawns all enemies.',
            SET_WORLD_FLAG:    'Sets a global world flag that affects dialogue, spawns, and shop prices.',
            SET_REGION_STATE: 'Directly updates region modifiers: danger level, weather, multipliers, etc.',
            GIVE_XP_ALL:      'Grants XP to every currently online player — good for events.',
            BROADCAST:        'Sends a colored message to every player on the server.',
        };

        let h = `<div style="background:rgba(255,255,255,.03);border:1px solid #1a1a2a;border-radius:8px;padding:12px;margin-bottom:12px">
            <div style="font-size:11px;color:#777;margin-bottom:10px">${DESCRIPTIONS[type]||''}</div>`;

        if (type === 'SET_WORLD_FLAG') {
            h += `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div><label>Flag Key</label>
                    <input id="cfg_flag" value="${cfg.flag||''}" placeholder="e.g. blood_moon_active"></div>
                <div><label>Value</label>
                    <input id="cfg_value" value="${cfg.value||'true'}" placeholder="true / false / any string"></div>
            </div>`;
        } else if (type === 'SET_REGION_STATE') {
            h += `
            <div style="font-size:11px;color:#777;margin-bottom:10px">
                Set the Target ID above to the Region ID to modify. Then set fields below.
                Leave fields blank to leave them unchanged.
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
                <div><label>Danger Level (1-5)</label>
                    <input type="number" id="cfg_danger" min="1" max="5" value="${cfg.danger_level||''}" placeholder="—"></div>
                <div><label>Corruption (0-5)</label>
                    <input type="number" id="cfg_corrupt" min="0" max="5" value="${cfg.corruption_level||''}" placeholder="—"></div>
                <div><label>Weather Override</label>
                    <select id="cfg_weather">
                        ${['','CLEAR','RAIN','STORM','FOG','BLIZZARD','BLOOD_MOON'].map(w =>
                            `<option value="${w}" ${(cfg.weather_override||'')==w?'selected':''}>${w||'— unchanged —'}</option>`
                        ).join('')}
                    </select>
                </div>
                <div><label>XP Mult</label>
                    <input type="number" id="cfg_xp" step="0.1" min="0.1" value="${cfg.xp_mult||''}" placeholder="—"></div>
                <div><label>Gold Mult</label>
                    <input type="number" id="cfg_gold" step="0.1" min="0.1" value="${cfg.gold_mult||''}" placeholder="—"></div>
                <div><label>Loot Mult</label>
                    <input type="number" id="cfg_loot" step="0.1" min="0.1" value="${cfg.loot_mult||''}" placeholder="—"></div>
                <div><label>Spawn Rate Mult</label>
                    <input type="number" id="cfg_spawn" step="0.1" min="0.1" value="${cfg.spawn_rate_mult||''}" placeholder="—"></div>
                <div><label>Shop Price Mult</label>
                    <input type="number" id="cfg_shop" step="0.1" min="0.1" value="${cfg.shop_price_mult||''}" placeholder="—"></div>
                <div><label>Faction Control</label>
                    <input id="cfg_faction" value="${cfg.faction_control||''}" placeholder="— unchanged —"></div>
            </div>`;
        } else if (type === 'GIVE_XP_ALL') {
            h += `<div><label>XP Amount</label>
                <input type="number" id="cfg_amount" value="${cfg.amount||100}" min="1" style="width:100px"></div>`;
        } else if (type === 'BROADCAST') {
            h += `
            <div style="margin-bottom:8px"><label>Message</label>
                <input id="cfg_message" value="${cfg.message||'Server announcement.'}" style="width:100%"></div>
            <div><label>Color (hex)</label>
                <input type="color" id="cfg_color" value="${cfg.color||'#bb86fc'}" style="width:60px;padding:2px"></div>`;
        } else {
            h += `<div style="color:#555;font-size:11px">No extra config needed. Set Target ID above if you want to scope to a specific shop or map.</div>`;
        }

        h += '</div>';
        panel.innerHTML = h;
    },

    _buildConfig: () => {
        const type = document.getElementById('st_type')?.value;
        const cfg = {};
        if (type === 'SET_WORLD_FLAG') {
            cfg.flag  = document.getElementById('cfg_flag')?.value;
            cfg.value = document.getElementById('cfg_value')?.value;
        } else if (type === 'SET_REGION_STATE') {
            // region_id lives inside config_json so the scheduler knows which region to update
            const regionTargetId = parseInt(document.getElementById('st_target')?.value);
            if (regionTargetId) cfg.region_id = regionTargetId;
            const danger  = document.getElementById('cfg_danger')?.value;
            const corrupt = document.getElementById('cfg_corrupt')?.value;
            const weather = document.getElementById('cfg_weather')?.value;
            const xp      = document.getElementById('cfg_xp')?.value;
            const gold    = document.getElementById('cfg_gold')?.value;
            const loot    = document.getElementById('cfg_loot')?.value;
            const spawn   = document.getElementById('cfg_spawn')?.value;
            const shop    = document.getElementById('cfg_shop')?.value;
            const faction = document.getElementById('cfg_faction')?.value;
            // Only include fields that were filled in
            if (danger)  cfg.danger_level        = parseInt(danger);
            if (corrupt) cfg.corruption_level     = parseInt(corrupt);
            if (weather) cfg.weather_override     = weather;
            if (xp)      cfg.xp_mult              = parseFloat(xp);
            if (gold)    cfg.gold_mult             = parseFloat(gold);
            if (loot)    cfg.loot_mult             = parseFloat(loot);
            if (spawn)   cfg.spawn_rate_mult       = parseFloat(spawn);
            if (shop)    cfg.shop_price_mult       = parseFloat(shop);
            if (faction) cfg.faction_control       = faction;
        } else if (type === 'GIVE_XP_ALL') {
            cfg.amount = parseInt(document.getElementById('cfg_amount')?.value) || 100;
        } else if (type === 'BROADCAST') {
            cfg.message = document.getElementById('cfg_message')?.value;
            cfg.color   = document.getElementById('cfg_color')?.value;
        }
        return Object.keys(cfg).length ? cfg : null;
    },

    save: async (id) => {
        const name = document.getElementById('st_name').value.trim();
        if (!name) { alert('Name required.'); return; }

        const sched = document.getElementById('st_sched').value;
        const payload = {
            name,
            task_type:        document.getElementById('st_type').value,
            schedule_type:    sched,
            run_at_hour:      parseInt(document.getElementById('st_hour')?.value) || 0,
            run_at_day:       parseInt(document.getElementById('st_day')?.value)  || 1,
            interval_minutes: parseInt(document.getElementById('st_interval')?.value) || 60,
            target_id:        parseInt(document.getElementById('st_target').value) || null,
            is_enabled:       parseInt(document.getElementById('st_enabled').value),
            config_json:      JSON.stringify(SchedulerManager._buildConfig()),
        };

        const r = await API.save('scheduled_task', payload, id);
        if (r.success) SchedulerManager.init();
        else alert(r.message || 'Save failed');
    },

    runNow: async (id) => {
        const r = await API.post('/admin/scheduler/run-now', { taskId: id });
        if (r.success) alert(`✅ Task ran: ${r.message||'done'}`);
        else alert(`❌ ${r.message}`);
        SchedulerManager.init();
    },

    del: async (id) => {
        if (confirm('Delete this task?')) {
            await API.delete('scheduled_task', id);
            SchedulerManager.init();
        }
    }
};
