// =================================================================
// CODEX MANAGER — Bestiary / Item Codex / Lore / Location / Ogham Editor
// =================================================================
// Manages rows in `codex_entries`. Each entry belongs to a category
// (creatures, items, lore, locations, oghams) and can optionally link
// to an existing game table row via ref_npc_id / ref_item_id / etc.
//
// Discovery tracking (codex_discoveries) is per-character and happens
// at runtime — this manager only edits the master entry list.
// =================================================================

const CodexManager = {
    _category: 'creatures',

    init: async () => {
        document.getElementById('pageTitle').innerText = '📖 CODEX ENTRIES';
        const res = await API.getAll('codex');
        CodexManager.render(res.success ? res.data : []);
    },

    render: (data) => {
        const cats = ['creatures','items','lore','locations','oghams'];
        const catLabels = { creatures:'🐺 Creatures', items:'💎 Items', lore:'📜 Lore', locations:'📍 Locations', oghams:'🩸 Oghams' };
        const rarityColors = { common:'#888', uncommon:'#3fb950', rare:'#58a6ff', epic:'#bc8cff', legendary:'#f0883e' };

        // Category filter tabs
        let html = `<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">`;
        cats.forEach(c => {
            const active = c === CodexManager._category;
            html += `<button class="action-btn" style="font-size:12px;padding:6px 14px;${active ? '' : 'background:var(--bg2);color:var(--td);border:1px solid var(--bo)'}"
                onclick="CodexManager._category='${c}';CodexManager.init()">${catLabels[c]}</button>`;
        });
        html += `</div>`;

        html += `<button class="action-btn" onclick="CodexManager.edit()">+ NEW ENTRY</button>
        <p style="color:var(--td);font-size:12px;margin:8px 0 16px">
            Master codex entries. Players discover these at runtime. Hidden entries won't appear in the codex.
        </p>`;

        const filtered = data.filter(e => e.category === CodexManager._category);

        html += `<table><thead><tr>
            <th>ID</th><th>NAME</th><th>RARITY</th>`;
        if (CodexManager._category === 'creatures') html += '<th>LVL</th><th>ELEMENT</th><th>WEAKNESS</th>';
        if (CodexManager._category === 'items')     html += '<th>TYPE</th>';
        if (CodexManager._category === 'lore')      html += '<th>CHAPTER</th>';
        if (CodexManager._category === 'locations')  html += '<th>REGION</th><th>MIN LVL</th>';
        html += `<th>HIDDEN</th><th>ACTIONS</th>
        </tr></thead><tbody>`;

        filtered.forEach(e => {
            const rc = rarityColors[e.rarity] || '#888';
            html += `<tr>
                <td>${e.id}</td>
                <td><b>${e.icon || ''} ${e.name}</b></td>
                <td><span style="color:${rc}">${e.rarity || '—'}</span></td>`;
            if (CodexManager._category === 'creatures') {
                html += `<td>${e.level || '—'}</td><td>${e.element || '—'}</td><td>${e.weakness || '—'}</td>`;
            }
            if (CodexManager._category === 'items') {
                html += `<td>${e.item_type || '—'}</td>`;
            }
            if (CodexManager._category === 'lore') {
                html += `<td>${e.chapter != null ? e.chapter : '—'}</td>`;
            }
            if (CodexManager._category === 'locations') {
                html += `<td>${e.region || '—'}</td><td>${e.min_level != null ? e.min_level : '—'}</td>`;
            }
            html += `<td>${e.hidden ? '<span style="color:#f44">YES</span>' : '<span style="color:#555">no</span>'}</td>
                <td>
                    <button class="edit-btn" onclick='CodexManager.edit(${JSON.stringify(e)})'>EDIT</button>
                    <button class="del-btn" onclick="CodexManager.del(${e.id})">DEL</button>
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        if (!filtered.length) {
            html += '<p style="color:#555;margin-top:12px">No entries in this category yet.</p>';
        }

        document.getElementById('dynamicArea').innerHTML = html;
    },

    edit: (entry = {}) => {
        const cat = entry.category || CodexManager._category;
        let dropTable = [];
        try { dropTable = entry.drop_table_json ? (typeof entry.drop_table_json === 'string' ? JSON.parse(entry.drop_table_json) : entry.drop_table_json) : []; } catch {}
        CodexManager._dropList = dropTable.slice();

        let stats = {};
        try { stats = entry.stats_json ? (typeof entry.stats_json === 'string' ? JSON.parse(entry.stats_json) : entry.stats_json) : {}; } catch {}

        document.getElementById('dynamicArea').innerHTML = `
        <h3>${entry.id ? 'Edit Codex Entry' : 'New Codex Entry'}</h3>

        <div class="grid-2">
            <div>
                <label>Name</label>
                <input id="cx_name" value="${entry.name || ''}" placeholder="e.g. Twisted Wolf">
            </div>
            <div>
                <label>Icon / Emoji</label>
                <input id="cx_icon" value="${entry.icon || ''}" style="width:80px;font-size:20px;text-align:center" placeholder="🐺">
            </div>
        </div>

        <div class="grid-2">
            <div>
                <label>Category</label>
                <select id="cx_category" onchange="CodexManager._onCategoryChange()">
                    <option value="creatures" ${cat==='creatures'?'selected':''}>🐺 Creatures</option>
                    <option value="items" ${cat==='items'?'selected':''}>💎 Items</option>
                    <option value="lore" ${cat==='lore'?'selected':''}>📜 Lore</option>
                    <option value="locations" ${cat==='locations'?'selected':''}>📍 Locations</option>
                    <option value="oghams" ${cat==='oghams'?'selected':''}>🩸 Oghams</option>
                </select>
            </div>
            <div>
                <label>Rarity</label>
                <select id="cx_rarity">
                    <option value="" ${!entry.rarity?'selected':''}>— None —</option>
                    <option value="common" ${entry.rarity==='common'?'selected':''}>Common</option>
                    <option value="uncommon" ${entry.rarity==='uncommon'?'selected':''}>Uncommon</option>
                    <option value="rare" ${entry.rarity==='rare'?'selected':''}>Rare</option>
                    <option value="epic" ${entry.rarity==='epic'?'selected':''}>Epic</option>
                    <option value="legendary" ${entry.rarity==='legendary'?'selected':''}>Legendary</option>
                </select>
            </div>
        </div>

        <label>Description</label>
        <textarea id="cx_desc" rows="3" placeholder="A corrupted wolf with glowing red eyes...">${entry.description || ''}</textarea>

        <div style="margin:12px 0;padding:8px 12px;background:rgba(255,255,255,0.03);border:1px solid var(--bo);border-radius:6px">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="cx_hidden" ${entry.hidden ? 'checked' : ''} style="width:16px;height:16px">
                <span style="font-size:13px">Hidden <small style="color:var(--td)">(won't appear in the codex)</small></span>
            </label>
        </div>

        <!-- CREATURE FIELDS -->
        <div id="cx_creature_section" style="display:${cat==='creatures'?'block':'none'}">
            <h4 style="color:var(--a);margin:16px 0 12px">🐺 Creature Fields</h4>
            <div class="grid-3">
                <div><label>Level</label>
                    <input id="cx_level" type="number" value="${entry.level || ''}" min="1" placeholder="e.g. 5"></div>
                <div><label>Element</label>
                    <input id="cx_element" value="${entry.element || ''}" placeholder="e.g. dark"></div>
                <div><label>Weakness</label>
                    <input id="cx_weakness" value="${entry.weakness || ''}" placeholder="e.g. fire"></div>
            </div>
            <label style="margin-top:12px">Drop Table <small style="color:var(--td)">(comma-separated item names)</small></label>
            <input id="cx_drops" value="${dropTable.join(', ')}" placeholder="Wolf Pelt, Fangs, Corrupted Essence">
            <div class="grid-2" style="margin-top:8px">
                <div><label>Ref NPC ID <small style="color:var(--td)">(game_npcs link)</small></label>
                    <input id="cx_ref_npc_id" type="number" value="${entry.ref_npc_id || ''}" placeholder="Optional"></div>
                <div></div>
            </div>
        </div>

        <!-- ITEM FIELDS -->
        <div id="cx_item_section" style="display:${cat==='items'?'block':'none'}">
            <h4 style="color:var(--a);margin:16px 0 12px">💎 Item Fields</h4>
            <div class="grid-2">
                <div><label>Item Type</label>
                    <input id="cx_item_type" value="${entry.item_type || ''}" placeholder="e.g. weapon, armor, artifact"></div>
                <div><label>Ref Item ID <small style="color:var(--td)">(game_items link)</small></label>
                    <input id="cx_ref_item_id" type="number" value="${entry.ref_item_id || ''}" placeholder="Optional"></div>
            </div>
            <label style="margin-top:8px">Stats JSON <small style="color:var(--td)">(e.g. {"atk":150,"spd":30})</small></label>
            <input id="cx_stats_json" value='${JSON.stringify(stats)}' placeholder='{"atk":150,"spd":30}'>
        </div>

        <!-- LORE FIELDS -->
        <div id="cx_lore_section" style="display:${cat==='lore'?'block':'none'}">
            <h4 style="color:var(--a);margin:16px 0 12px">📜 Lore Fields</h4>
            <div class="grid-2">
                <div><label>Chapter</label>
                    <input id="cx_chapter" type="number" value="${entry.chapter != null ? entry.chapter : ''}" min="1" placeholder="e.g. 1"></div>
                <div></div>
            </div>
        </div>

        <!-- LOCATION FIELDS -->
        <div id="cx_location_section" style="display:${cat==='locations'?'block':'none'}">
            <h4 style="color:var(--a);margin:16px 0 12px">📍 Location Fields</h4>
            <div class="grid-3">
                <div><label>Region</label>
                    <input id="cx_region" value="${entry.region || ''}" placeholder="e.g. Aran Isles"></div>
                <div><label>Min Level</label>
                    <input id="cx_min_level" type="number" value="${entry.min_level != null ? entry.min_level : ''}" min="1" placeholder="e.g. 15"></div>
                <div><label>Ref Map ID <small style="color:var(--td)">(game_maps link)</small></label>
                    <input id="cx_ref_map_id" type="number" value="${entry.ref_map_id || ''}" placeholder="Optional"></div>
            </div>
        </div>

        <!-- OGHAM FIELDS -->
        <div id="cx_ogham_section" style="display:${cat==='oghams'?'block':'none'}">
            <h4 style="color:var(--a);margin:16px 0 12px">🩸 Ogham Fields</h4>
            <div class="grid-2">
                <div><label>Ref Ogham ID <small style="color:var(--td)">(game_oghams link)</small></label>
                    <input id="cx_ref_ogham_id" type="number" value="${entry.ref_ogham_id || ''}" placeholder="Optional"></div>
                <div></div>
            </div>
        </div>

        <div class="btn-row" style="margin-top:20px">
            <button class="action-btn save-btn" onclick="CodexManager.save(${entry.id || null})">
                💾 SAVE ENTRY
            </button>
            <button class="edit-btn" onclick="CodexManager.init()">CANCEL</button>
        </div>`;
    },

    _onCategoryChange: () => {
        const cat = document.getElementById('cx_category').value;
        document.getElementById('cx_creature_section').style.display  = cat === 'creatures'  ? 'block' : 'none';
        document.getElementById('cx_item_section').style.display      = cat === 'items'      ? 'block' : 'none';
        document.getElementById('cx_lore_section').style.display      = cat === 'lore'       ? 'block' : 'none';
        document.getElementById('cx_location_section').style.display  = cat === 'locations'  ? 'block' : 'none';
        document.getElementById('cx_ogham_section').style.display     = cat === 'oghams'     ? 'block' : 'none';
    },

    save: async (id) => {
        const name = document.getElementById('cx_name').value.trim();
        if (!name) { alert('Name is required.'); return; }

        const category = document.getElementById('cx_category').value;

        const payload = {
            name,
            icon:        document.getElementById('cx_icon').value.trim() || null,
            category,
            rarity:      document.getElementById('cx_rarity').value || null,
            description: document.getElementById('cx_desc').value,
            hidden:      document.getElementById('cx_hidden').checked ? 1 : 0,
        };

        // Creature fields
        if (category === 'creatures') {
            payload.level      = parseInt(document.getElementById('cx_level').value) || null;
            payload.element    = document.getElementById('cx_element').value.trim() || null;
            payload.weakness   = document.getElementById('cx_weakness').value.trim() || null;
            const dropsRaw     = document.getElementById('cx_drops').value.trim();
            payload.drop_table_json = dropsRaw
                ? JSON.stringify(dropsRaw.split(',').map(s => s.trim()).filter(Boolean))
                : null;
            payload.ref_npc_id = parseInt(document.getElementById('cx_ref_npc_id').value) || null;
        }

        // Item fields
        if (category === 'items') {
            payload.item_type    = document.getElementById('cx_item_type').value.trim() || null;
            payload.ref_item_id  = parseInt(document.getElementById('cx_ref_item_id').value) || null;
            const statsRaw       = document.getElementById('cx_stats_json').value.trim();
            payload.stats_json   = statsRaw && statsRaw !== '{}' ? statsRaw : null;
        }

        // Lore fields
        if (category === 'lore') {
            payload.chapter = parseInt(document.getElementById('cx_chapter').value) || null;
        }

        // Location fields
        if (category === 'locations') {
            payload.region     = document.getElementById('cx_region').value.trim() || null;
            payload.min_level  = parseInt(document.getElementById('cx_min_level').value) || null;
            payload.ref_map_id = parseInt(document.getElementById('cx_ref_map_id').value) || null;
        }

        // Ogham fields
        if (category === 'oghams') {
            payload.ref_ogham_id = parseInt(document.getElementById('cx_ref_ogham_id').value) || null;
        }

        const saved = await API.save('codex', payload, id);
        if (!saved.success) { alert('Save failed: ' + saved.message); return; }

        CodexManager._category = category;
        CodexManager.init();
    },

    del: async (id) => {
        if (!confirm('Delete this codex entry? Players who discovered it will lose the reference.')) return;
        await API.delete('codex', id);
        CodexManager.init();
    }
};
