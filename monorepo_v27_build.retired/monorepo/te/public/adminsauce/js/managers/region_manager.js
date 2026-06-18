// =================================================================
// REGION MANAGER — Manage game_regions
// =================================================================
// Regions are the "local rules" layer. Each region can have its own
// XP/gold/loot multipliers, danger level, faction, weather, PvP
// rules, and auto-rules (flag-triggered overrides).
// Maps are assigned to regions via the map's region_id field.
// =================================================================

const RegionManager = {
    _regions: [],
    _maps:    [],

    init: async () => {
        document.getElementById('pageTitle').innerText = '🗺️ REGIONS';
        const [rr, mr] = await Promise.all([API.getAll('region'), API.getAll('map')]);
        RegionManager._regions = rr.success ? rr.data : [];
        RegionManager._maps    = mr.success ? mr.data : [];
        RegionManager.renderList();
    },

    renderList: () => {
        const regions = RegionManager._regions;
        const maps    = RegionManager._maps;
        const DANGER_COLOR = ['#444','#0a0','#aa0','#f80','#f00','#a00'];

        let h = `<button class="action-btn save-btn" onclick="RegionManager.edit()">+ NEW REGION</button>
        <p style="color:var(--td);font-size:12px;margin:8px 0 16px">
            Regions group maps together and set local rules: XP/gold multipliers, danger, weather, faction, PvP.
            Auto-rules let regions react to world flags automatically.
        </p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px">`;

        for (const r of regions) {
            const regionMaps = maps.filter(m => m.region_id === r.id);
            const danger = r.danger_level || 1;
            h += `
            <div style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:14px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
                    <div>
                        <span style="font-size:18px">${r.icon||'🗺️'}</span>
                        <b style="color:var(--a);font-size:14px;margin-left:6px">${r.name}</b>
                        <span class="tag" style="background:${DANGER_COLOR[Math.min(danger,5)]};color:#fff;margin-left:6px">
                            ⚠️ ${danger}/5
                        </span>
                        ${r.is_sanctuary ? '<span class="tag" style="background:#004">🕊️ SANCTUARY</span>' : ''}
                        ${r.pvp_enabled  ? '<span class="tag" style="background:#400">⚔️ PvP</span>'       : ''}
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="edit-btn" onclick="RegionManager.edit(${r.id})">EDIT</button>
                        <button class="del-btn"  onclick="RegionManager.del(${r.id})">DEL</button>
                    </div>
                </div>
                <div style="font-size:11px;color:var(--td);margin-bottom:8px">${r.description||'No description'}</div>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px">
                    ${[['XP','xp_mult','#0cf'],['Gold','gold_mult','#ffd700'],['Loot','loot_mult','#f0f'],['Spawn','spawn_rate_mult','#f80'],['Shop','shop_price_mult','#0a0']].map(([l,k,col]) =>
                        `<div style="background:#0a0a1a;border:1px solid #1a1a2a;border-radius:4px;padding:4px;text-align:center">
                            <div style="font-size:9px;color:#555">${l}</div>
                            <div style="font-size:12px;color:${col}">${r[k]||'1.00'}×</div>
                        </div>`).join('')}
                </div>
                ${r.weather_override ? `<div style="font-size:10px;color:#8af;margin-bottom:4px">🌤️ ${r.weather_override}</div>` : ''}
                ${r.faction_control  ? `<div style="font-size:10px;color:#f80;margin-bottom:4px">⚔️ ${r.faction_control}</div>` : ''}
                <div style="font-size:10px;color:#555">
                    ${regionMaps.length} map(s): ${regionMaps.map(m => m.name).join(', ') || '—'}
                </div>
            </div>`;
        }
        h += `<div onclick="RegionManager.edit()" style="background:var(--bg3);border:2px dashed var(--b);border-radius:8px;
            padding:14px;cursor:pointer;text-align:center;display:flex;align-items:center;justify-content:center;color:var(--td)"
            onmouseover="this.style.borderColor='var(--g)'" onmouseout="this.style.borderColor='var(--b)'">
            <span style="font-size:24px">+</span>&nbsp;NEW REGION
        </div>`;
        h += '</div>';

        h += `
        <div style="margin-top:24px;background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:16px">
            <h4 style="margin:0 0 10px;color:var(--a)">🗺️ Map → Region Assignment</h4>
            <p style="font-size:11px;color:#555;margin-bottom:12px">Set which region each map belongs to. Changes apply immediately.</p>
            <table><thead><tr><th>MAP</th><th>CURRENT REGION</th><th>ASSIGN</th></tr></thead><tbody>`;
        for (const m of maps) {
            const regionOpts = [{ id: 0, name: '— None —' }, ...regions]
                .map(r => `<option value="${r.id}" ${m.region_id === r.id ? 'selected' : ''}>${r.name||r.id}</option>`)
                .join('');
            h += `<tr>
                <td><b>${m.name}</b> <span style="color:#555;font-size:10px">#${m.id}</span></td>
                <td>${regions.find(r => r.id === m.region_id)?.name || '—'}</td>
                <td><select style="padding:4px;background:#111;border:1px solid #222;color:#e8eef6;border-radius:4px"
                    onchange="RegionManager.assignMap(${m.id}, this.value)">${regionOpts}</select></td>
            </tr>`;
        }
        h += '</tbody></table></div>';

        document.getElementById('dynamicArea').innerHTML = h;
    },

    assignMap: async (mapId, regionId) => {
        await API.save('map', { region_id: parseInt(regionId) || null }, mapId);
        // No full re-init needed — just update local data
        const m = RegionManager._maps.find(m => m.id === mapId);
        if (m) m.region_id = parseInt(regionId) || null;
    },

    edit: async (id) => {
        const d = id ? RegionManager._regions.find(r => r.id === id) || {} : {};
        const isNew = !d.id;

        let autoRules = [];
        try { autoRules = typeof d.auto_rules_json === 'string' ? JSON.parse(d.auto_rules_json) : (d.auto_rules_json || []); } catch {}
        let activeTags = [];
        try { activeTags = typeof d.active_tags_json === 'string' ? JSON.parse(d.active_tags_json) : (d.active_tags_json || []); } catch {}

        RegionManager._editAutoRules = autoRules.map(r => ({ ...r }));
        RegionManager._editTags      = [...activeTags];

        const WEATHER_OPTS = ['','CLEAR','RAIN','STORM','FOG','BLIZZARD','BLOOD_MOON'];

        document.getElementById('dynamicArea').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;color:var(--a)">${isNew ? '+ New Region' : '✏️ ' + d.name}</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="RegionManager.save(${d.id||'null'})">💾 SAVE</button>
                <button class="edit-btn" onclick="RegionManager.init()">CANCEL</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 60px;gap:12px;margin-bottom:12px">
            <div><label>Name</label><input id="rg_name" value="${d.name||''}"></div>
            <div><label>Description</label><input id="rg_desc" value="${d.description||''}"></div>
            <div><label>Icon</label><input id="rg_icon" value="${d.icon||'🗺️'}" style="text-align:center"></div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:12px">
            <div><label>Danger Level (1-5)</label>
                <input type="range" id="rg_danger" min="1" max="5" value="${d.danger_level||1}"
                    oninput="document.getElementById('rg_danger_v').innerText=this.value" style="width:70%">
                <span id="rg_danger_v" style="color:#f80;margin-left:8px">${d.danger_level||1}</span>
            </div>
            <div><label>Corruption Level (0-5)</label>
                <input type="range" id="rg_corrupt" min="0" max="5" value="${d.corruption_level||0}"
                    oninput="document.getElementById('rg_corrupt_v').innerText=this.value" style="width:70%">
                <span id="rg_corrupt_v" style="color:#a0f;margin-left:8px">${d.corruption_level||0}</span>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px">
            ${[['XP Mult','rg_xp','xp_mult','#0cf'],['Gold Mult','rg_gold','gold_mult','#ffd700'],
               ['Loot Mult','rg_loot','loot_mult','#f0f'],['Spawn Mult','rg_spawn','spawn_rate_mult','#f80'],
               ['Shop Price','rg_shop','shop_price_mult','#0a0']].map(([l,id,k,c]) =>
               `<div><label style="color:${c}">${l}</label>
                <input type="number" id="${id}" value="${d[k]||'1.00'}" step="0.05" min="0.1" max="10"
                style="color:${c}"></div>`).join('')}
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px">
            <div><label>Weather Override</label>
                <select id="rg_weather">
                    ${WEATHER_OPTS.map(w => `<option value="${w}" ${d.weather_override===w?'selected':''}>${w||'— None —'}</option>`).join('')}
                </select>
            </div>
            <div><label>Faction Control</label>
                <input id="rg_faction" value="${d.faction_control||''}" placeholder="e.g. undead, merchants_guild"></div>
            <div style="display:flex;gap:16px;align-items:flex-end;padding-bottom:4px">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                    <input type="checkbox" id="rg_pvp" ${d.pvp_enabled?'checked':''}> PvP Enabled</label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                    <input type="checkbox" id="rg_sanctuary" ${d.is_sanctuary?'checked':''}> Sanctuary</label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                    <input type="checkbox" id="rg_active" ${d.is_active!==0?'checked':''}> Active</label>
            </div>
        </div>

        <div style="margin-bottom:12px">
            <label>Active Tags <span style="color:#555;font-size:10px">(used by conditional loot, quests, NPC dialogue)</span></label>
            <div id="rg_tags_panel"></div>
            <div style="display:flex;gap:8px;margin-top:6px">
                <input id="rg_tag_input" placeholder="e.g. siege, famine, undead_surge, festival" style="flex:1">
                <button class="edit-btn" onclick="RegionManager._addTag()">+ TAG</button>
            </div>
        </div>

        <div style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <label>🤖 Auto-Rules <span style="color:#555;font-size:10px">
                    — triggered by world flags, override region state automatically</span></label>
                <button class="edit-btn" onclick="RegionManager._addAutoRule()">+ RULE</button>
            </div>
            <div id="rg_rules_panel"></div>
        </div>`;

        RegionManager._renderTags();
        RegionManager._renderAutoRules();
    },

    _editAutoRules: [],
    _editTags:      [],

    _renderTags: () => {
        const panel = document.getElementById('rg_tags_panel');
        if (!panel) return;
        const tags = RegionManager._editTags;
        panel.innerHTML = tags.length
            ? tags.map((t, i) => `<span style="display:inline-flex;align-items:center;gap:4px;background:#1a1a2a;
                border:1px solid #2a2a4a;border-radius:12px;padding:3px 10px;margin:2px;font-size:11px">
                ${t} <span onclick="RegionManager._editTags.splice(${i},1);RegionManager._renderTags()"
                style="cursor:pointer;color:#f55">✕</span></span>`).join('')
            : '<span style="color:#555;font-size:11px">No tags</span>';
    },

    _addTag: () => {
        const v = document.getElementById('rg_tag_input')?.value?.trim();
        if (!v) return;
        if (!RegionManager._editTags.includes(v)) RegionManager._editTags.push(v);
        document.getElementById('rg_tag_input').value = '';
        RegionManager._renderTags();
    },

    _renderAutoRules: () => {
        const panel = document.getElementById('rg_rules_panel');
        if (!panel) return;
        const rules = RegionManager._editAutoRules;

        if (!rules.length) {
            panel.innerHTML = '<p style="color:#555;font-size:11px">No auto-rules. Add one to let this region react to world flags.</p>';
            return;
        }

        let h = '';
        rules.forEach((rule, i) => {
            const conds = rule.conditions || [];
            const apply = rule.apply || {};
            h += `
            <div style="background:#0a0a1a;border:1px solid #1a1a2a;border-radius:6px;padding:10px;margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <b style="font-size:12px;color:#bb86fc">Rule ${i+1}</b>
                    <button class="del-btn" style="padding:2px 8px"
                        onclick="RegionManager._editAutoRules.splice(${i},1);RegionManager._renderAutoRules()">✕</button>
                </div>
                <div style="font-size:10px;color:#777;margin-bottom:6px">
                    IF conditions: <span style="color:#0cf">${conds.map(c => `${c.flag} ${c.op||'=='} ${c.value}`).join(' AND ') || '(none)'}</span>
                </div>
                <div style="font-size:10px;color:#777;margin-bottom:8px">
                    APPLY: <span style="color:#ffd700">${Object.entries(apply).map(([k,v]) => `${k}=${v}`).join(', ') || '(nothing)'}</span>
                </div>
                <div style="font-size:10px;color:#555">Edit in JSON:</div>
                <textarea style="width:100%;font-family:monospace;font-size:10px;background:#060608;
                    border:1px solid #1a1a2a;color:#e8eef6;border-radius:4px;padding:4px;box-sizing:border-box"
                    rows="4"
                    onchange="try{RegionManager._editAutoRules[${i}]=JSON.parse(this.value);}catch{}"
                    >${JSON.stringify({ conditions: conds, apply }, null, 2)}</textarea>
            </div>`;
        });
        panel.innerHTML = h;
    },

    _addAutoRule: () => {
        RegionManager._editAutoRules.push({
            conditions: [{ flag: 'blood_moon', op: '==', value: 'true' }],
            apply: { danger_level: 4, weather_override: 'BLOOD_MOON', spawn_rate_mult: 2.0 }
        });
        RegionManager._renderAutoRules();
    },

    save: async (id) => {
        const name = document.getElementById('rg_name').value.trim();
        if (!name) { alert('Name required.'); return; }

        const payload = {
            name,
            description:        document.getElementById('rg_desc').value,
            icon:                document.getElementById('rg_icon').value || '🗺️',
            danger_level:        parseInt(document.getElementById('rg_danger').value)  || 1,
            corruption_level:    parseInt(document.getElementById('rg_corrupt').value) || 0,
            xp_mult:             parseFloat(document.getElementById('rg_xp').value)    || 1,
            gold_mult:           parseFloat(document.getElementById('rg_gold').value)  || 1,
            loot_mult:           parseFloat(document.getElementById('rg_loot').value)  || 1,
            spawn_rate_mult:     parseFloat(document.getElementById('rg_spawn').value) || 1,
            shop_price_mult:     parseFloat(document.getElementById('rg_shop').value)  || 1,
            weather_override:    document.getElementById('rg_weather').value   || null,
            faction_control:     document.getElementById('rg_faction').value   || null,
            pvp_enabled:         document.getElementById('rg_pvp').checked     ? 1 : 0,
            is_sanctuary:        document.getElementById('rg_sanctuary').checked ? 1 : 0,
            is_active:           document.getElementById('rg_active').checked  ? 1 : 0,
            active_tags_json:    JSON.stringify(RegionManager._editTags),
            auto_rules_json:     JSON.stringify(RegionManager._editAutoRules),
        };

        const r = await API.save('region', payload, id);
        if (r.success) {
            // Invalidate server-side region cache so changes take effect immediately
            await fetch('/admin/clear-cache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-key': API._key || '' },
                body: JSON.stringify({ reloadRegions: true })
            }).catch(() => {});
            RegionManager.init();
        } else {
            alert(r.message || 'Save failed');
        }
    },

    del: async (id) => {
        if (confirm('Delete this region? Maps assigned to it will become unassigned.')) {
            await API.delete('region', id);
            RegionManager.init();
        }
    }
};
