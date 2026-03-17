// =================================================================
// NPC MANAGER v2.0 — Dialogue & Enemy Editor
// =================================================================
// WHAT CHANGED FROM v1.0:
//   v1.0 only handled dialogue NPCs (ai_persona, loose stats_json).
//   v2.0 adds a COMBAT section. When "Is Enemy" is checked, the admin
//   fills in real combat stats. Saving calls /admin/sync-enemy which
//   creates or updates a row in the `characters` table with user_id=0.
//   The resulting char_id is stored back on the game_npcs row.
//
// WHY user_id = 0?
//   We use 0 to mean "NPC — not owned by any real player". The
//   verifyOwnership() check in game routes does WHERE user_id=? so
//   0 will never match a real player's account.
//
// FLOW:
//   Admin creates NPC → checks "Is Enemy" → fills stats → Save
//   → /admin/sync-enemy creates or updates a characters row (user_id=0)
//   → game_npcs.char_id is set to that row's ID
//   → Spawn zones and BATTLE map events use char_id for battles
// =================================================================

const NpcManager = {
    init: async () => {
        document.getElementById('pageTitle').innerText = '👹 NPC DATABASE';
        const res = await API.getAll('npc');
        NpcManager.render(res.success ? res.data : []);
    },

    render: (data) => {
        let html = `<button class="action-btn" onclick="NpcManager.edit()">+ NEW NPC</button>
        <p style="color:var(--td);font-size:12px;margin:8px 0 16px">
            NPCs can be dialogue-only (talk to players) or enemies (used in BATTLE events and spawn zones).
            Checking "Is Enemy" creates a character slot to hold combat stats.
        </p>
        <table><thead><tr>
            <th>NAME</th><th>TYPE</th><th>COMBAT SLOT</th><th>PERSONA PREVIEW</th><th>ACTIONS</th>
        </tr></thead><tbody>`;

        data.forEach(n => {
            const isEnemy = n.is_enemy == 1;
            const hasChar = !!n.char_id;
            const typeTag = isEnemy
                ? '<span class="tag tag-red">⚔️ Enemy</span>'
                : '<span class="tag">💬 Dialogue</span>';
            const slotStatus = isEnemy
                ? (hasChar
                    ? `<span class="tag tag-green">✔ Char #${n.char_id}</span>`
                    : '<span class="tag tag-red">⚠ Missing</span>')
                : '<span style="color:#444;font-size:11px">—</span>';
            html += `<tr>
                <td><b>${n.icon || ''} ${n.name}</b></td>
                <td>${typeTag}</td>
                <td>${slotStatus}</td>
                <td><small>${n.persona ? n.persona.substring(0, 60) + '...' : '<i style="color:#444">No persona</i>'}</small></td>
                <td>
                    <button class="edit-btn" onclick='NpcManager.edit(${JSON.stringify(n)})'>EDIT</button>
                    <button class="del-btn" onclick="NpcManager.del(${n.id})">DEL</button>
                </td>
            </tr>`;
        });

        document.getElementById('dynamicArea').innerHTML = html + '</tbody></table>';
    },

    edit: async (npc = {}) => {
        const isEnemy     = npc.is_enemy == 1;
        const moveType    = npc.move_type || 'WANDER';
        const wanderR     = npc.wander_radius || 3;
        const questOffers = npc.quest_offers_json ? JSON.parse(npc.quest_offers_json) : [];
        const schedSlots  = npc.schedule_json     ? JSON.parse(npc.schedule_json)     : [];
        const shopId      = npc.shop_id || '';
        NpcManager._schedSlots = schedSlots.slice();
        const patrolRaw = npc && npc.patrol_path_json ? npc.patrol_path_json : null;
        NpcManager._patrolPath = patrolRaw ? (typeof patrolRaw === 'string' ? JSON.parse(patrolRaw) : patrolRaw) : [];
        setTimeout(() => NpcManager._renderWaypoints(), 80);
        // Pre-load quest and shop lists for dropdowns
        const [questList, shopList, itemList] = await Promise.all([
            API.getAll('quest').then(r => r.data || []).catch(() => []),
            API.getAll('shop').then(r  => r.data || []).catch(() => []),
            API.getAll('item').then(r  => r.data || []).catch(() => [])
        ]);
        NpcManager._items = itemList;
        let cs = {};
        try { cs = typeof npc.stats_json === 'object' ? (npc.stats_json || {}) : JSON.parse(npc.stats_json || '{}'); } catch {}

        // Load existing drop table into editable rows
        NpcManager._dropRows = [];
        try {
            var dt = npc.drop_table_json;
            var dtArr = dt ? (typeof dt === 'string' ? JSON.parse(dt) : dt) : [];
            (dtArr || []).forEach(function(e) { NpcManager._dropRows.push(Object.assign({item_id:'',chance:50,min_qty:1,max_qty:1}, e)); });
        } catch(e) { NpcManager._dropRows = []; }

        document.getElementById('dynamicArea').innerHTML = `
        <h3>${npc.id ? 'Edit NPC' : 'New NPC'}</h3>

        <div class="grid-2">
            <div>
                <label>Name</label>
                <input id="n_name" value="${npc.name || ''}" placeholder="e.g. Forest Goblin">
            </div>
            <div>
                <label>Icon / Emoji</label>
                <input id="n_icon" value="${npc.icon || '👹'}" style="width:80px;font-size:20px;text-align:center">
            </div>
        </div>

        <label>AI Persona <small style="color:var(--td)">(for dialogue — leave blank if combat-only)</small></label>
        <!-- Movement behaviour — only shown for non-enemies (enemies use spawn zones) -->
        <div id="movement_section" style="margin-bottom:16px">
            <label style="color:var(--ll);font-size:11px;letter-spacing:1px">MOVEMENT BEHAVIOUR</label>
            <div style="display:flex;gap:10px;margin-top:6px;align-items:center">
                <select id="n_move_type" onchange="NpcManager._onMoveTypeChange()"
                    style="background:var(--bg2);border:1px solid var(--bo);color:#fff;padding:6px 10px;border-radius:4px;flex:1">
                    <option value="WANDER" ${moveType==='WANDER'?'selected':''}>🚶 Wander — roams freely in an area</option>
                    <option value="STATIONARY" ${moveType==='STATIONARY'?'selected':''}>🧍 Stationary — never moves (shopkeeper, quest giver)</option>
                    <option value="PATROL" ${moveType==='PATROL'?'selected':''}>🔄 Patrol — follows a waypoint path</option>
                </select>
            </div>
            <div id="wander_opts" style="margin-top:8px;display:${moveType==='WANDER'?'flex':'none'};gap:8px;align-items:center">
                <label style="color:#888;font-size:11px">Wander radius (tiles):</label>
                <input id="n_wander_radius" type="number" min="1" max="20" value="${wanderR}"
                    style="width:60px;background:var(--bg2);border:1px solid var(--bo);color:#fff;padding:4px 8px;border-radius:4px">
                <span style="color:#555;font-size:10px">How far from spawn point it can roam</span>
            </div>
        </div>

        <div id="patrol_opts" style="margin-top:8px;display:${moveType==='PATROL'?'block':'none'}">
            <div style="font-size:11px;color:#888;margin-bottom:8px">
                📍 Waypoints — NPC walks A → B → C → A in a loop. Pause ticks = how long to wait (each tick = 2 seconds).
            </div>
            <div id="patrol_waypoints"><p style="color:#555;font-size:11px">No waypoints yet.</p></div>
            <div style="display:flex;gap:8px;margin-top:8px;align-items:flex-end">
                <div><label style="font-size:10px;color:#888">X</label><input type="number" id="pw_x" value="0" style="width:55px;padding:4px;background:var(--bg2);border:1px solid var(--bo);color:#fff;border-radius:4px"></div>
                <div><label style="font-size:10px;color:#888">Y</label><input type="number" id="pw_y" value="0" style="width:55px;padding:4px;background:var(--bg2);border:1px solid var(--bo);color:#fff;border-radius:4px"></div>
                <div><label style="font-size:10px;color:#888">Pause (ticks)</label><input type="number" id="pw_pause" value="0" style="width:55px;padding:4px;background:var(--bg2);border:1px solid var(--bo);color:#fff;border-radius:4px"></div>
                <button class="edit-btn" onclick="NpcManager._addWaypoint()">+ ADD</button>
            </div>
        </div>

        <textarea id="n_persona" rows="3"
            placeholder="You are a grumpy forest goblin who speaks in short grunts..."
            >${npc.persona || ''}</textarea>

        <!-- IS ENEMY TOGGLE -->
        <div style="margin:16px 0;padding:12px;background:rgba(255,50,50,0.07);border:1px solid #442222;border-radius:8px">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
                <input type="checkbox" id="n_is_enemy" ${isEnemy ? 'checked' : ''}
                    onchange="NpcManager.toggleCombat(this.checked)" style="width:18px;height:18px">
                <span style="font-size:14px;font-weight:bold;color:#ff6666">⚔️ This NPC is a combat enemy</span>
            </label>
            <p style="color:var(--td);font-size:11px;margin:6px 0 0 28px">
                When checked, a character slot is created in the database to hold combat stats.
                Spawn zones and BATTLE map events reference this slot.
            </p>
        </div>

        <!-- COMBAT STATS -->
        <div id="combat_section" style="display:${isEnemy ? 'block' : 'none'}">
            <h4 style="color:var(--a);margin-bottom:12px">⚔️ Combat Stats</h4>

            ${npc.char_id ? `
            <div style="background:rgba(0,255,100,0.07);border:1px solid #224422;border-radius:6px;
                        padding:8px 12px;margin-bottom:12px;font-size:12px;color:#00cc66">
                ✔ Character slot exists: <b>#${npc.char_id}</b> — saving will update it.
            </div>` : `
            <div style="background:rgba(255,200,0,0.07);border:1px solid #443300;border-radius:6px;
                        padding:8px 12px;margin-bottom:12px;font-size:12px;color:#ffaa00">
                ⚠ No character slot yet — saving will create one automatically.
            </div>`}

            <div class="grid-3">
                <div><label>Level</label>
                    <input id="cs_level" type="number" value="${cs.level || 1}" min="1" max="99"></div>
                <div><label>Max HP</label>
                    <input id="cs_hp" type="number" value="${cs.max_hp || 100}" min="1"></div>
                <div><label>Max MP</label>
                    <input id="cs_mp" type="number" value="${cs.max_mp || 30}" min="0"></div>
            </div>
            <div class="grid-4">
                <div><label>ATK <small style="color:var(--td)">(Physical offense)</small></label>
                    <input id="cs_atk" type="number" value="${cs.atk || 10}" min="1"></div>
                <div><label>DEF <small style="color:var(--td)">(Physical defense)</small></label>
                    <input id="cs_def" type="number" value="${cs.def || 5}" min="0"></div>
                <div><label>MO <small style="color:var(--td)">(Magic offense)</small></label>
                    <input id="cs_mo" type="number" value="${cs.mo || 5}" min="0"></div>
                <div><label>MD <small style="color:var(--td)">(Magic defense)</small></label>
                    <input id="cs_md" type="number" value="${cs.md || 5}" min="0"></div>
            </div>
            <div class="grid-2">
                <div><label>Speed <small style="color:var(--td)">(Turn order — higher goes first)</small></label>
                    <input id="cs_speed" type="number" value="${cs.speed || 8}" min="1"></div>
                <div><label>Luck <small style="color:var(--td)">(Crit/dodge chance)</small></label>
                    <input id="cs_luck" type="number" value="${cs.luck || 5}" min="0"></div>
            </div>

            <div style="margin-top:12px;padding:10px;background:rgba(255,255,255,0.03);
                        border-radius:6px;font-size:11px;color:var(--td)">
                💡 <b>Stat guide:</b> A starter goblin might be Level 1, 80 HP, ATK 12, DEF 4, Speed 6.
                A mid-game orc might be Level 8, 350 HP, ATK 40, DEF 20, Speed 10.
                A final boss might be Level 25, 2000 HP, ATK 90, DEF 50, MO 70, Speed 18.
            </div>
        </div>


        <!-- DROP TABLE EDITOR (only shown for enemies) -->
        <div id="drop_table_section" style="display:${isEnemy ? 'block' : 'none'}">
            <h4 style="color:#f39c12;margin:20px 0 12px">💰 Loot Drop Table</h4>
            <p style="color:var(--td);font-size:11px;margin-bottom:12px">
                Items the player can receive when they defeat this enemy.
                <b>Chance</b> is 0–100 (percent). <b>100</b> = always drops. <b>5</b> = 5% rare drop.
                Qty range: how many copies can drop at once.
            </p>
            <div id="drop_rows"></div>
            <button class="edit-btn" style="margin-top:8px" onclick="NpcManager.addDropRow()">+ ADD ITEM DROP</button>
            <p style="color:var(--td);font-size:10px;margin-top:8px">
                💡 Set chance to 100 for guaranteed drops, lower for rare loot.
            </p>
        </div>

                <!-- QUEST OFFERS -->
        <div style="margin-bottom:16px">
            <label style="color:var(--ll);font-size:11px;letter-spacing:1px">QUEST OFFERS</label>
            <div style="margin-top:6px;max-height:120px;overflow-y:auto;border:1px solid var(--bo);border-radius:4px;padding:6px">
                ${questList.length ? questList.map(q =>
                    '<label style="display:block;padding:3px 0;cursor:pointer">' +
                    '<input type="checkbox" value="' + q.id + '" ' +
                    (questOffers.includes(q.id) ? 'checked' : '') +
                    ' style="margin-right:6px" class="quest-offer-cb"> ' +
                    q.name + '</label>'
                ).join('') : '<span style="color:#555;font-size:11px">No quests created yet</span>'}
            </div>
            <div style="color:#555;font-size:10px;margin-top:4px">📜 Checked quests appear as dialogue options when player talks to this NPC.</div>
        </div>

        <!-- SHOP LINK -->
        <div style="margin-bottom:16px">
            <label style="color:var(--ll);font-size:11px;letter-spacing:1px">LINKED SHOP</label>
            <select id="n_shop_id" style="width:100%;margin-top:6px;background:var(--bg2);border:1px solid var(--bo);color:#fff;padding:6px 10px;border-radius:4px">
                <option value="">— None —</option>
                ${shopList.map(s => '<option value="' + s.id + '" ' + (shopId == s.id ? 'selected' : '') + '>' + (s.icon||'\xf0\x9f\x8f\xaa') + ' ' + s.name + '</option>').join('')}
            </select>
            <div style="color:#555;font-size:10px;margin-top:4px">🏪 Linked shop opens as dialogue option. High-rep players can haggle for discounts (10-20% off).</div>
        </div>

        <!-- DAILY SCHEDULE -->
        <div style="margin-bottom:16px">
            <label style="color:var(--ll);font-size:11px;letter-spacing:1px">DAILY SCHEDULE</label>
            <div id="sched_rows" style="margin-top:6px"></div>
            <button class="edit-btn" style="margin-top:6px" onclick="NpcManager.addSchedRow()">➕ Add Time Slot</button>
            <div style="color:#555;font-size:10px;margin-top:4px">🕐 NPC wanders near this spot during set hours (24h server local time). Empty = stays near spawn all day.</div>
        </div>

        <div class="btn-row" style="margin-top:20px">
            <button class="action-btn save-btn" onclick="NpcManager.save(${npc.id || null})">
                💾 SAVE NPC
            </button>
            <button class="edit-btn" onclick="NpcManager.init()">CANCEL</button>
        </div>`;
        NpcManager._renderDropRows();
        NpcManager._renderSchedRows();
    },

    toggleCombat: (checked) => {
        document.getElementById('combat_section').style.display = checked ? 'block' : 'none';
        var dts = document.getElementById('drop_table_section');
        if (dts) dts.style.display = checked ? 'block' : 'none';
    },

    save: async (id) => {
        const name    = document.getElementById('n_name').value.trim();
        const icon    = document.getElementById('n_icon').value.trim();
        const persona = document.getElementById('n_persona').value;
        const isEnemy = document.getElementById('n_is_enemy').checked ? 1 : 0;

        if (!name) { alert('Name is required.'); return; }

        let combatStats = null;
        if (isEnemy) {
            combatStats = {
                level:  parseInt(document.getElementById('cs_level').value)  || 1,
                max_hp: parseInt(document.getElementById('cs_hp').value)     || 100,
                max_mp: parseInt(document.getElementById('cs_mp').value)     || 30,
                atk:    parseInt(document.getElementById('cs_atk').value)    || 10,
                def:    parseInt(document.getElementById('cs_def').value)    || 5,
                mo:     parseInt(document.getElementById('cs_mo').value)     || 5,
                md:     parseInt(document.getElementById('cs_md').value)     || 5,
                speed:  parseInt(document.getElementById('cs_speed').value)  || 8,
                luck:   parseInt(document.getElementById('cs_luck').value)   || 5,
            };
        }

        // Step 1: Save the NPC row
        // TEACHING: Column names must match game_npcs EXACTLY.
        //   - DB column is "persona" not "ai_persona"
        //   - "stats_json" doesn't exist in game_npcs — combat stats live in
        //     the characters table, synced in Step 2 via /admin/sync-enemy.
        //     Sending an unknown column causes a MySQL 500 error.
        const npcPayload = {
            name,
            icon,
            persona:         persona,
            move_type:         document.getElementById('n_move_type').value,
            patrol_path_json:  document.getElementById('n_move_type').value === 'PATROL'
                               ? JSON.stringify(NpcManager._patrolPath) : null,
            wander_radius:     parseInt(document.getElementById('n_wander_radius')?.value) || 3,
            is_enemy:          isEnemy,
            drop_table_json:   isEnemy ? JSON.stringify(NpcManager._dropRows) : null,
            shop_id:           document.getElementById('n_shop_id')?.value || null,
            quest_offers_json: JSON.stringify(
                Array.from(document.querySelectorAll('.quest-offer-cb:checked')).map(cb => parseInt(cb.value))
            ),
            schedule_json: JSON.stringify(NpcManager._schedSlots)
        };
        const saved = await API.save('npc', npcPayload, id);
        if (!saved.success) { alert('Save failed: ' + saved.message); return; }

        // Step 2: For enemies, sync the character slot
        if (isEnemy && combatStats) {
            // For new NPCs we need the ID that was just created.
            // The API.save response should include insertId for new rows.
            const npcId = id || saved.insertId;
            if (npcId) {
                const syncRes = await fetch('/admin/sync-enemy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ npcId, name, icon, stats: combatStats })
                });
                const syncData = await syncRes.json();
                if (!syncData.success) {
                    alert('NPC saved but character slot sync failed: ' + syncData.message);
                }
            }
        }

        NpcManager.init();
    },


    // ---- DROP TABLE ----
    _items: [],   // loaded in edit() alongside quests/shops
    _dropRows: [],

    addDropRow: (entry) => {
        entry = entry || { item_id: '', chance: 50, min_qty: 1, max_qty: 1 };
        NpcManager._dropRows.push(entry);
        NpcManager._renderDropRows();
    },

    _onMoveTypeChange: () => {
        var mt = document.getElementById('n_move_type').value;
        var wo = document.getElementById('wander_opts');
        var po = document.getElementById('patrol_opts');
        if (wo) wo.style.display = mt === 'WANDER' ? 'flex'  : 'none';
        if (po) po.style.display = mt === 'PATROL' ? 'block' : 'none';
    },

    _schedSlots: [],

    _renderSchedRows: () => {
        var el = document.getElementById('sched_rows');
        if (!el) return;
        if (!NpcManager._schedSlots.length) {
            el.innerHTML = '<div style="color:#555;font-size:11px;padding:4px 0">No schedule slots. NPC wanders near spawn all day.</div>';
            return;
        }
        el.innerHTML = NpcManager._schedSlots.map(function(s, i) {
            return '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">' +
                '<input type="number" min="0" max="23" value="' + (s.hour_from||0) + '" style="width:48px;background:var(--bg2);border:1px solid var(--bo);color:#fff;padding:4px;border-radius:4px" oninput="NpcManager._schedSlots['+i+'].hour_from=parseInt(this.value)||0"> ' +
                '<span style="color:#666">to</span>' +
                '<input type="number" min="1" max="24" value="' + (s.hour_to||24) + '" style="width:48px;background:var(--bg2);border:1px solid var(--bo);color:#fff;padding:4px;border-radius:4px" oninput="NpcManager._schedSlots['+i+'].hour_to=parseInt(this.value)||24"> ' +
                '<span style="color:#666">Map ID</span>' +
                '<input type="number" min="1" value="' + (s.map_id||1) + '" style="width:60px;background:var(--bg2);border:1px solid var(--bo);color:#fff;padding:4px;border-radius:4px" oninput="NpcManager._schedSlots['+i+'].map_id=parseInt(this.value)||1"> ' +
                '<span style="color:#666">X</span><input type="number" value="' + (s.x||5) + '" style="width:48px;background:var(--bg2);border:1px solid var(--bo);color:#fff;padding:4px;border-radius:4px" oninput="NpcManager._schedSlots['+i+'].x=parseInt(this.value)||0"> ' +
                '<span style="color:#666">Y</span><input type="number" value="' + (s.y||5) + '" style="width:48px;background:var(--bg2);border:1px solid var(--bo);color:#fff;padding:4px;border-radius:4px" oninput="NpcManager._schedSlots['+i+'].y=parseInt(this.value)||0"> ' +
                '<input type="text" value="' + (s.label||'') + '" placeholder="Label (e.g. At tavern)" style="flex:1;min-width:100px;background:var(--bg2);border:1px solid var(--bo);color:#fff;padding:4px;border-radius:4px" oninput="NpcManager._schedSlots['+i+'].label=this.value"> ' +
                '<button onclick="NpcManager._schedSlots.splice('+i+',1);NpcManager._renderSchedRows()" style="background:none;border:none;color:#f44;cursor:pointer;font-size:16px">×</button>' +
                '</div>';
        }).join('');
    },

    addSchedRow: () => {
        NpcManager._schedSlots.push({ hour_from: 8, hour_to: 18, map_id: 1, x: 5, y: 5, label: '' });
        NpcManager._renderSchedRows();
    },

    removeDropRow: (i) => {
        NpcManager._dropRows.splice(i, 1);
        NpcManager._renderDropRows();
    },

    _renderDropRows: () => {
        var container = document.getElementById('drop_rows');
        if (!container) return;
        if (!NpcManager._dropRows.length) {
            container.innerHTML = '<p style="color:#444;font-size:11px;margin-bottom:8px">No drops configured — enemy drops nothing.</p>';
            return;
        }
        container.innerHTML = NpcManager._dropRows.map(function(r, i) {
            return '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;background:rgba(255,255,255,0.03);padding:8px;border-radius:6px">' +
                '<div><div style="font-size:10px;color:var(--td);margin-bottom:2px">Item ID</div>' +
                (function(row, idx){
                const items = NpcManager._items || [];
                if (items.length) {
                    const opts = items.map(function(it){
                        return '<option value="' + it.id + '" ' + (row.item_id == it.id ? 'selected' : '') + '>' + (it.icon||'📦') + ' ' + it.name + ' (#' + it.id + ')</option>';
                    }).join('');
                    return '<select style="flex:2;min-width:140px;background:var(--bg2);border:1px solid var(--bo);color:#fff;padding:4px 6px;border-radius:4px;font-size:12px" onchange="NpcManager._dropRows[' + idx + '].item_id=parseInt(this.value)||0"><option value="">— Item —</option>' + opts + '</select>';
                }
                return '<input type=\"number\" min=\"1\" style=\"width:90px\" placeholder=\"Item ID\" value=\"' + (row.item_id||'') + '\" onchange=\"NpcManager._dropRows[' + idx + '].item_id=parseInt(this.value)||0\">';
            })(r, i) + '</div>' +
                '<div><div style="font-size:10px;color:var(--td);margin-bottom:2px">Chance %</div>' +
                '<input type="number" min="0" max="100" style="width:65px" value="' + (r.chance||50) + '" onchange="NpcManager._dropRows['+i+'].chance=parseFloat(this.value)||0"></div>' +
                '<div><div style="font-size:10px;color:var(--td);margin-bottom:2px">Min Qty</div>' +
                '<input type="number" min="1" style="width:55px" value="' + (r.min_qty||1) + '" onchange="NpcManager._dropRows['+i+'].min_qty=parseInt(this.value)||1"></div>' +
                '<div><div style="font-size:10px;color:var(--td);margin-bottom:2px">Max Qty</div>' +
                '<input type="number" min="1" style="width:55px" value="' + (r.max_qty||1) + '" onchange="NpcManager._dropRows['+i+'].max_qty=parseInt(this.value)||1"></div>' +
                '<button class="del-btn" style="margin-top:14px;padding:4px 10px" onclick="NpcManager.removeDropRow('+i+')">✕</button>' +
            '</div>';
        }).join('');
    },

    _patrolPath: [],

    _renderWaypoints: function() {
        const el = document.getElementById('patrol_waypoints');
        if (!el) return;
        const pts = NpcManager._patrolPath;
        if (!pts.length) { el.innerHTML = '<p style="color:#555;font-size:11px">No waypoints yet. Add at least 2.</p>'; return; }
        let h = '<table><thead><tr><th>#</th><th>X</th><th>Y</th><th>PAUSE ticks</th><th></th></tr></thead><tbody>';
        pts.forEach((p, i) => {
            h += `<tr>
                <td>${i+1}</td>
                <td><input type="number" value="${p.x||0}" style="width:50px;padding:3px;background:#0a0a1a;border:1px solid #1a1a2a;color:#fff" onchange="NpcManager._patrolPath[${i}].x=parseInt(this.value)||0"></td>
                <td><input type="number" value="${p.y||0}" style="width:50px;padding:3px;background:#0a0a1a;border:1px solid #1a1a2a;color:#fff" onchange="NpcManager._patrolPath[${i}].y=parseInt(this.value)||0"></td>
                <td><input type="number" value="${p.pause_ticks||0}" style="width:50px;padding:3px;background:#0a0a1a;border:1px solid #1a1a2a;color:#fff" onchange="NpcManager._patrolPath[${i}].pause_ticks=parseInt(this.value)||0"></td>
                <td><button class="del-btn" style="padding:2px 8px" onclick="NpcManager._patrolPath.splice(${i},1);NpcManager._renderWaypoints()">✕</button></td>
            </tr>`;
        });
        h += '</tbody></table>';
        el.innerHTML = h;
    },

    _addWaypoint: function() {
        const x     = parseInt(document.getElementById('pw_x')?.value)     || 0;
        const y     = parseInt(document.getElementById('pw_y')?.value)     || 0;
        const pause = parseInt(document.getElementById('pw_pause')?.value) || 0;
        NpcManager._patrolPath.push({ x, y, pause_ticks: pause });
        NpcManager._renderWaypoints();
    },

    del: async (id) => {
        if (!confirm('Delete this NPC? Spawn zones and BATTLE events referencing it will break.')) return;
        await API.delete('npc', id);
        NpcManager.init();
    }
};
