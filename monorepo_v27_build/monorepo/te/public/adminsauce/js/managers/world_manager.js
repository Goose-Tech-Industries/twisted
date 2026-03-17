// =================================================================
// WORLD STATE MANAGER — Visual dashboard for world flags, NPC moods,
// factions, and the living NPC world. No JSON or SQL needed.
// =================================================================
// SECTIONS:
//   1. World Flags  — see all active flags, toggle on/off, add new
//   2. NPC Moods    — see which NPCs have moods set, clear them
//   3. NPC Life     — see dead NPCs, resurrect (un-kill) them
//   4. Factions     — create / edit factions, see player standings
//   5. Rumors       — see what rumors are spreading in the world
// =================================================================

const WorldManager = {

    init: async () => {
        document.getElementById('pageTitle').innerText = '🌍 WORLD STATE';
        WorldManager.render();
    },

    render: () => {
        const area = document.getElementById('dynamicArea');
        area.innerHTML = `
        <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">
            <button class="action-btn" onclick="WorldManager.showSection('flags')">🚩 World Flags</button>
            <button class="action-btn" onclick="WorldManager.showSection('moods')">😶 NPC Moods</button>
            <button class="action-btn" onclick="WorldManager.showSection('dead')">💀 Dead NPCs</button>
            <button class="action-btn" onclick="WorldManager.showSection('factions')">⚔️ Factions</button>
            <button class="action-btn" onclick="WorldManager.showSection('rumors')">📢 Rumors</button>
        </div>
        <div id="wm_section">
            <p style="color:var(--td);text-align:center;padding:40px">
                Select a section above to manage the living world.
            </p>
        </div>`;
    },

    showSection: async (section) => {
        const el = document.getElementById('wm_section');
        el.innerHTML = '<p style="color:var(--td);text-align:center;padding:20px">Loading...</p>';
        try {
            switch (section) {
                case 'flags':    await WorldManager.renderFlags(el); break;
                case 'moods':    await WorldManager.renderMoods(el); break;
                case 'dead':     await WorldManager.renderDead(el);  break;
                case 'factions': await WorldManager.renderFactions(el); break;
                case 'rumors':   await WorldManager.renderRumors(el); break;
            }
        } catch (e) {
            el.innerHTML = `<p style="color:#f44">Error loading section: ${e.message}</p>`;
        }
    },

    // ================================================================
    // SECTION 1 — WORLD FLAGS
    // ================================================================
    renderFlags: async (el) => {
        const res = await API.req('GET', '/admin/world-flags');
        const flags = (res.success && res.data) ? res.data : [];

        let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="margin:0;color:var(--a)">🚩 World Flags</h3>
            <button class="action-btn" onclick="WorldManager.addFlagPrompt()">+ Set New Flag</button>
        </div>
        <p style="color:var(--td);font-size:12px;margin-bottom:14px">
            World flags are global switches that affect NPC dialogue across the entire game world.
            NPCs who know about an active flag will reference it naturally in conversation.
            Toggle one off to pretend the event never happened.
        </p>`;

        if (!flags.length) {
            html += '<p style="color:var(--td);text-align:center;padding:30px">No world flags set yet.<br><small>Flags are created by script events using the 🌍 World Flag action.</small></p>';
        } else {
            html += '<table><thead><tr><th>FLAG</th><th>VALUE</th><th>SET BY</th><th>WHEN</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>';
            flags.forEach(f => {
                const isTrue = f.flag_value === 'true' || f.flag_value === '1';
                const statusTag = isTrue
                    ? '<span class="tag tag-green">● ACTIVE</span>'
                    : '<span class="tag" style="background:#333;color:#888">● INACTIVE</span>';
                html += `<tr>
                    <td><b style="color:var(--a)">${f.flag_key}</b></td>
                    <td><code style="color:#ffd700">${f.flag_value}</code></td>
                    <td style="color:var(--td)">${f.set_by || '—'}</td>
                    <td style="color:var(--td);font-size:11px">${new Date(f.set_at).toLocaleString()}</td>
                    <td>${statusTag}</td>
                    <td>
                        <button class="edit-btn" onclick="WorldManager.toggleFlag('${f.flag_key}','${isTrue?'false':'true'}')">${isTrue?'Deactivate':'Activate'}</button>
                        <button class="del-btn" onclick="WorldManager.deleteFlag('${f.flag_key}')">DELETE</button>
                    </td>
                </tr>`;
            });
            html += '</tbody></table>';
        }

        el.innerHTML = html;
    },

    addFlagPrompt: async () => {
        const key = await WorldManager._modal('Set World Flag',
            [{id:'k', label:'Flag name (e.g. goblin_boss_slain)', type:'text'},
             {id:'v', label:'Value', type:'text', value:'true'}]);
        if (!key) return;
        await API.req('POST', '/admin/world-flags', { key: key.k, value: key.v || 'true', setBy: 'Admin' });
        WorldManager.showSection('flags');
    },

    toggleFlag: async (key, newValue) => {
        await API.req('POST', '/admin/world-flags', { key, value: newValue, setBy: 'Admin' });
        WorldManager.showSection('flags');
    },

    deleteFlag: async (key) => {
        if (!confirm(`Delete world flag "${key}"? NPCs will no longer reference this event.`)) return;
        await API.req('DELETE', `/admin/world-flags/${encodeURIComponent(key)}`);
        WorldManager.showSection('flags');
    },

    // ================================================================
    // SECTION 2 — NPC MOODS
    // ================================================================
    renderMoods: async (el) => {
        const res = await API.req('GET', '/admin/npc-moods');
        const npcs = (res.success && res.data) ? res.data : [];

        const MOOD_ICONS = { happy:'😄', fearful:'😨', angry:'😠', grieving:'😢', excited:'🤩' };

        let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="margin:0;color:var(--a)">😶 NPC Moods</h3>
            <button class="action-btn" onclick="WorldManager.setMoodPrompt()">Set NPC Mood</button>
        </div>
        <p style="color:var(--td);font-size:12px;margin-bottom:14px">
            Moods change how an NPC greets and speaks to players. A fearful guard sounds different
            from a relaxed one even without editing their persona. Moods reset on server restart
            unless re-applied by a script event. You can also set them directly here.
        </p>`;

        const withMood = npcs.filter(n => n.mood);
        if (!withMood.length) {
            html += '<p style="color:var(--td);text-align:center;padding:30px">No NPCs currently have a mood set.<br><small>Moods are set by the 😶 NPC Mood script action or from this panel.</small></p>';
        } else {
            html += '<table><thead><tr><th>NPC</th><th>MAP</th><th>MOOD</th><th>ACTIONS</th></tr></thead><tbody>';
            withMood.forEach(n => {
                const icon = MOOD_ICONS[n.mood] || '😶';
                html += `<tr>
                    <td><b>${n.icon || '👤'} ${n.name}</b></td>
                    <td style="color:var(--td)">${n.map_name || 'Map '+n.map_id}</td>
                    <td><span class="tag">${icon} ${n.mood}</span></td>
                    <td>
                        <button class="edit-btn" onclick="WorldManager.setMoodFor('${n.name}')">Change</button>
                        <button class="del-btn" onclick="WorldManager.clearMood('${n.name}')">Clear</button>
                    </td>
                </tr>`;
            });
            html += '</tbody></table>';
        }

        el.innerHTML = html;
    },

    setMoodPrompt: async () => {
        const vals = await WorldManager._modal('Set NPC Mood', [
            {id:'name', label:'NPC Name (exact)', type:'text'},
            {id:'mood', label:'Mood', type:'select', options:['happy','fearful','angry','grieving','excited']}
        ]);
        if (!vals) return;
        await API.req('POST', '/admin/npc-mood', { npcName: vals.name, mood: vals.mood });
        WorldManager.showSection('moods');
    },

    setMoodFor: async (npcName) => {
        const vals = await WorldManager._modal(`Mood for ${npcName}`, [
            {id:'mood', label:'Mood', type:'select', options:['happy','fearful','angry','grieving','excited']}
        ]);
        if (!vals) return;
        await API.req('POST', '/admin/npc-mood', { npcName, mood: vals.mood });
        WorldManager.showSection('moods');
    },

    clearMood: async (npcName) => {
        await API.req('POST', '/admin/npc-mood', { npcName, mood: null });
        WorldManager.showSection('moods');
    },

    // ================================================================
    // SECTION 3 — DEAD NPCs
    // ================================================================
    renderDead: async (el) => {
        const res = await API.req('GET', '/admin/dead-npcs');
        const npcs = (res.success && res.data) ? res.data : [];

        let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="margin:0;color:var(--a)">💀 Dead NPCs</h3>
        </div>
        <p style="color:var(--td);font-size:12px;margin-bottom:14px">
            NPCs marked as dead are removed from the game world. You can resurrect them here
            (they return as if nothing happened), or leave them dead and create a replacement
            NPC in the NPC manager with their name set as the "Predecessor".
        </p>`;

        if (!npcs.length) {
            html += '<p style="color:var(--td);text-align:center;padding:30px">No NPCs have been killed.<br><small>Use the 💀 Kill NPC script action to remove an NPC from the world.</small></p>';
        } else {
            html += '<table><thead><tr><th>NPC</th><th>MAP</th><th>CAUSE OF DEATH</th><th>ACTIONS</th></tr></thead><tbody>';
            npcs.forEach(n => {
                html += `<tr>
                    <td><b style="color:#888">${n.icon||'👤'} ${n.name}</b> <span style="color:#555;font-size:11px">[dead]</span></td>
                    <td style="color:var(--td)">${n.map_name || 'Map '+n.map_id}</td>
                    <td style="color:#f99;font-size:12px"><i>${n.death_cause || 'Unknown'}</i></td>
                    <td>
                        <button class="action-btn" onclick="WorldManager.resurrectNpc(${n.id},'${n.name}')">♻ Resurrect</button>
                    </td>
                </tr>`;
            });
            html += '</tbody></table>';
        }

        el.innerHTML = html;
    },

    resurrectNpc: async (id, name) => {
        if (!confirm(`Resurrect "${name}"? They will reappear in the game world at their original position.`)) return;
        await API.req('POST', `/admin/resurrect-npc/${id}`);
        WorldManager.showSection('dead');
    },

    // ================================================================
    // SECTION 4 — FACTIONS
    // ================================================================
    renderFactions: async (el) => {
        const res = await API.req('GET', '/admin/factions');
        const factions = (res.success && res.data) ? res.data : [];

        let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="margin:0;color:var(--a)">⚔️ Factions</h3>
            <button class="action-btn" onclick="WorldManager.addFaction()">+ New Faction</button>
        </div>
        <p style="color:var(--td);font-size:12px;margin-bottom:14px">
            Factions group NPCs into organisations. Players gain or lose reputation with whole
            factions at once. Setting a rival means helping one faction hurts the other.
            Assign NPCs to factions in the NPC editor (coming soon) or via the faction ID.
        </p>`;

        if (!factions.length) {
            html += '<p style="color:var(--td);text-align:center;padding:30px">No factions created yet.<br><small>Create factions like "Town Guard", "Thieves Guild", "Merchant Council" to group NPCs.</small></p>';
        } else {
            html += '<table><thead><tr><th>ID</th><th>FACTION</th><th>RIVAL</th><th>NPC COUNT</th><th>ACTIONS</th></tr></thead><tbody>';
            const factionMap = {};
            factions.forEach(f => factionMap[f.id] = f.name);
            factions.forEach(f => {
                html += `<tr>
                    <td style="color:var(--td)">#${f.id}</td>
                    <td><b>${f.icon||'⚔️'} ${f.name}</b>${f.description ? `<br><small style="color:var(--td)">${f.description}</small>` : ''}</td>
                    <td style="color:#f99">${f.rival_id ? (factionMap[f.rival_id]||'Faction #'+f.rival_id) : '<span style="color:#444">None</span>'}</td>
                    <td style="color:var(--td)">${f.npc_count || 0} NPCs</td>
                    <td>
                        <button class="edit-btn" onclick="WorldManager.editFaction(${JSON.stringify(f).replace(/"/g,'&quot;')})">EDIT</button>
                        <button class="del-btn" onclick="WorldManager.deleteFaction(${f.id},'${f.name}')">DEL</button>
                    </td>
                </tr>`;
            });
            html += '</tbody></table>';
        }
        el.innerHTML = html;
    },

    addFaction: async () => {
        const vals = await WorldManager._modal('New Faction', [
            {id:'name', label:'Faction Name', type:'text'},
            {id:'icon', label:'Icon (emoji)', type:'text', value:'⚔️'},
            {id:'description', label:'Description', type:'text'},
            {id:'rival_id', label:'Rival Faction ID (optional)', type:'number'}
        ]);
        if (!vals) return;
        await API.req('POST', '/admin/factions', vals);
        WorldManager.showSection('factions');
    },

    editFaction: async (f) => {
        const vals = await WorldManager._modal('Edit Faction: '+f.name, [
            {id:'name', label:'Name', type:'text', value:f.name},
            {id:'icon', label:'Icon', type:'text', value:f.icon||'⚔️'},
            {id:'description', label:'Description', type:'text', value:f.description||''},
            {id:'rival_id', label:'Rival Faction ID', type:'number', value:f.rival_id||''}
        ]);
        if (!vals) return;
        await API.req('PUT', `/admin/factions/${f.id}`, vals);
        WorldManager.showSection('factions');
    },

    deleteFaction: async (id, name) => {
        if (!confirm(`Delete faction "${name}"? This will remove all player standings with this faction.`)) return;
        await API.req('DELETE', `/admin/factions/${id}`);
        WorldManager.showSection('factions');
    },

    // ================================================================
    // SECTION 5 — RUMORS
    // ================================================================
    renderRumors: async (el) => {
        const res = await API.req('GET', '/admin/rumors');
        const rumors = (res.success && res.data) ? res.data : [];

        let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="margin:0;color:var(--a)">📢 Active Rumors</h3>
        </div>
        <p style="color:var(--td);font-size:12px;margin-bottom:14px">
            Rumors are player deeds spreading between NPCs. Every 30 seconds, the world
            tick picks one rumor and teaches it to 1–2 NPCs who don't know it yet.
            Each rumor spreads to a max of 8 NPCs then stops. NPCs will reference these
            facts naturally when the player talks to them.
        </p>`;

        if (!rumors.length) {
            html += '<p style="color:var(--td);text-align:center;padding:30px">No rumors spreading yet.<br><small>Rumors are created when players win battles and complete quests.</small></p>';
        } else {
            html += '<table><thead><tr><th>PLAYER</th><th>RUMOR</th><th>SPREAD</th><th>PROGRESS</th><th>ACTIONS</th></tr></thead><tbody>';
            rumors.forEach(r => {
                const pct = Math.min(100, Math.round((r.spread_count / r.max_spread) * 100));
                const bar = `<div style="background:#222;border-radius:4px;height:6px;width:80px;display:inline-block;vertical-align:middle">
                    <div style="background:${pct>=100?'#888':'var(--a)'};height:6px;border-radius:4px;width:${pct}%"></div></div>
                    <span style="color:var(--td);font-size:11px;margin-left:6px">${r.spread_count}/${r.max_spread}</span>`;
                html += `<tr>
                    <td><b>${r.char_name}</b></td>
                    <td style="color:#ccc">"…${r.rumor_text}"</td>
                    <td style="color:var(--td);font-size:11px">${new Date(r.created_at).toLocaleDateString()}</td>
                    <td>${bar}</td>
                    <td><button class="del-btn" onclick="WorldManager.deleteRumor(${r.id})">Suppress</button></td>
                </tr>`;
            });
            html += '</tbody></table>';
        }
        el.innerHTML = html;
    },

    deleteRumor: async (id) => {
        if (!confirm('Suppress this rumor? It will stop spreading but NPCs who already know it will remember.')) return;
        await API.req('DELETE', `/admin/rumors/${id}`);
        WorldManager.showSection('rumors');
    },

    // ================================================================
    // MODAL HELPER — lightweight form dialog
    // ================================================================
    // TEACHING: We build a modal with a dark overlay and a small form.
    // It returns a Promise that resolves when the admin clicks OK,
    // or resolves null if they cancel. This lets callers use await.
    _modal: (title, fields) => {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:center;justify-content:center';

            const box = document.createElement('div');
            box.style.cssText = 'background:#1a1a2e;border:1px solid var(--b);border-radius:12px;padding:24px;width:380px;max-width:90vw';

            let fieldsHtml = fields.map(f => {
                const v = f.value !== undefined ? f.value : '';
                if (f.type === 'select') {
                    const opts = f.options.map(o => `<option value="${o}" ${v===o?'selected':''}>${o}</option>`).join('');
                    return `<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--td)">${f.label}</label>
                        <select id="wm_f_${f.id}">${opts}</select></div>`;
                }
                return `<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--td)">${f.label}</label>
                    <input id="wm_f_${f.id}" type="${f.type||'text'}" value="${v}" style="width:100%;box-sizing:border-box"></div>`;
            }).join('');

            box.innerHTML = `
                <h3 style="margin:0 0 16px;color:var(--a)">${title}</h3>
                ${fieldsHtml}
                <div style="display:flex;gap:8px;margin-top:16px">
                    <button class="action-btn save-btn" id="wm_ok" style="flex:1">OK</button>
                    <button class="edit-btn" id="wm_cancel" style="flex:1">Cancel</button>
                </div>`;

            overlay.appendChild(box);
            document.body.appendChild(overlay);

            document.getElementById('wm_ok').onclick = () => {
                const result = {};
                fields.forEach(f => {
                    result[f.id] = document.getElementById('wm_f_'+f.id)?.value ?? '';
                });
                overlay.remove();
                resolve(result);
            };
            document.getElementById('wm_cancel').onclick = () => { overlay.remove(); resolve(null); };
        });
    }
};
