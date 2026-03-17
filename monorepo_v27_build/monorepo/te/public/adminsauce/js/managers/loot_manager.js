// =================================================================
// LOOT TABLE EDITOR
// Visual editor for drop_table_json on enemy NPCs.
// Shows all enemies → click one → edit drop rows with dropdowns.
// =================================================================
const LootManager = {
    _enemies: [],
    _items:   [],
    _rows:    [],          // current edit state
    _editing: null,        // NPC being edited

    async init() {
        document.getElementById('managerTitle').textContent = '🎁 Loot Table Editor';
        document.getElementById('dynamicArea').innerHTML =
            '<p style="color:#484f58;text-align:center;padding:40px">Loading enemies...</p>';

        const [ne, ni] = await Promise.all([API.getAll('npc'), API.getAll('item')]);
        LootManager._enemies = (ne.success ? ne.data : []).filter(n => n.is_enemy);
        LootManager._items   = ni.success ? ni.data : [];
        LootManager._renderList();
    },

    _renderList() {
        LootManager._editing = null;
        const enemies = LootManager._enemies;
        let h = `
        <style>
        .lt-enemy   { display:flex;align-items:center;gap:12px;padding:12px 16px;
                      background:#0d1117;border:1px solid #21262d;border-radius:8px;
                      margin-bottom:8px;cursor:pointer;transition:.15s }
        .lt-enemy:hover { border-color:#bb86fc }
        .lt-badge   { font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700 }
        .lt-has     { background:rgba(63,185,80,.15);color:#3fb950 }
        .lt-empty   { background:rgba(255,255,255,.05);color:#484f58 }
        </style>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
            <div>
                <h2 style="margin:0;font-size:18px;color:#bb86fc">🎁 Loot Table Editor</h2>
                <div style="color:#484f58;font-size:12px;margin-top:2px">${enemies.length} enemies found — click one to edit its drops</div>
            </div>
            <input placeholder="Filter enemies…" oninput="LootManager._filter(this.value)"
                style="width:220px;padding:8px 12px;background:#0d1117;border:1px solid #21262d;
                color:#e8eef6;border-radius:6px;font-size:13px">
        </div>
        <div id="lt_list">`;

        enemies.forEach(e => {
            let drops = [];
            try { drops = JSON.parse(e.drop_table_json || '[]'); } catch {}
            h += `<div class="lt-enemy" onclick="LootManager._edit(${e.id})">
                <span style="font-size:22px">${e.icon || '👹'}</span>
                <div style="flex:1">
                    <div style="font-weight:600;color:#e8eef6">${e.name}</div>
                    <div style="font-size:11px;color:#484f58">Map ID: ${e.map_id || '—'} · (${e.x},${e.y})</div>
                </div>
                <span class="lt-badge ${drops.length ? 'lt-has' : 'lt-empty'}">
                    ${drops.length ? drops.length + ' drop' + (drops.length > 1 ? 's' : '') : 'No drops'}
                </span>
            </div>`;
        });
        h += '</div>';
        document.getElementById('dynamicArea').innerHTML = h;
    },

    _filter(q) {
        const lower = q.toLowerCase();
        document.querySelectorAll('.lt-enemy').forEach(el => {
            el.style.display = el.textContent.toLowerCase().includes(lower) ? '' : 'none';
        });
    },

    _edit(npcId) {
        const npc = LootManager._enemies.find(n => n.id === npcId);
        if (!npc) return;
        LootManager._editing = npc;
        try { LootManager._rows = JSON.parse(npc.drop_table_json || '[]').map(r => ({ ...r })); }
        catch { LootManager._rows = []; }
        LootManager._renderEditor();
    },

    _renderEditor() {
        const npc  = LootManager._editing;
        const rows = LootManager._rows;
        const itemOpts = LootManager._items
            .map(i => `<option value="${i.id}">${i.icon || '📦'} ${i.name}</option>`).join('');

        // Probability preview
        const totalWeight = rows.reduce((s, r) => s + (parseFloat(r.chance) || 0), 0);

        document.getElementById('dynamicArea').innerHTML = `
        <style>
        .lt-row     { display:grid;grid-template-columns:2fr 1fr 80px 80px auto;gap:8px;
                      align-items:center;background:#0d1117;border:1px solid #21262d;
                      border-radius:8px;padding:10px 12px;margin-bottom:8px }
        .lt-chance  { display:flex;align-items:center;gap:6px }
        .lt-bar-bg  { height:6px;background:#161b22;border-radius:3px;overflow:hidden;flex:1 }
        .lt-bar-fg  { height:100%;border-radius:3px;transition:width .3s }
        .lt-preview { background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:16px;margin-top:20px }
        </style>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
            <div style="display:flex;gap:12px;align-items:center">
                <span style="font-size:28px">${npc.icon || '👹'}</span>
                <div>
                    <h2 style="margin:0;color:#f85149">${npc.name}</h2>
                    <div style="font-size:11px;color:#484f58">Loot Table Editor</div>
                </div>
            </div>
            <div style="display:flex;gap:8px">
                <button class="edit-btn" onclick="LootManager._renderList()">← Back</button>
                <button class="action-btn" onclick="LootManager._addRow()" style="background:#1565C0">+ Add Drop</button>
                <button class="action-btn save-btn" onclick="LootManager._save()">💾 Save</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr 80px 80px 36px;gap:8px;
            padding:0 12px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#484f58">
            <span>Item</span><span>Chance %</span><span>Min Qty</span><span>Max Qty</span><span></span>
        </div>

        <div id="lt_rows">
            ${rows.length
                ? rows.map((r, i) => LootManager._rowHTML(r, i, itemOpts)).join('')
                : `<div style="text-align:center;padding:40px;color:#484f58;font-style:italic">
                    No drops yet. Click "+ Add Drop" to create your first entry.
                   </div>`}
        </div>

        <div class="lt-preview">
            <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#484f58;margin-bottom:12px">
                📊 Drop Probability Preview
            </div>
            ${rows.length ? rows.map(r => {
                const item = LootManager._items.find(i => i.id == r.item_id);
                const pct  = Math.min(100, parseFloat(r.chance) || 0);
                const col  = pct >= 60 ? '#3fb950' : pct >= 30 ? '#d29922' : '#f85149';
                return `<div style="margin-bottom:8px">
                    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
                        <span>${item ? (item.icon || '📦') + ' ' + item.name : '❓ Unknown Item'}</span>
                        <span style="color:${col};font-weight:700">${pct}%
                            <span style="color:#484f58;font-weight:400;font-size:10px">
                                × ${r.min_qty || 1}${(r.max_qty > r.min_qty) ? '–' + r.max_qty : ''}</span>
                        </span>
                    </div>
                    <div style="height:6px;background:#161b22;border-radius:3px;overflow:hidden">
                        <div style="width:${pct}%;height:100%;background:${col};border-radius:3px"></div>
                    </div>
                </div>`;
            }).join('') : `<div style="color:#484f58;font-style:italic;font-size:12px">Add drops to see preview</div>`}
            ${totalWeight > 100 ? `<div style="color:#f85149;font-size:11px;margin-top:8px">
                ⚠️ Total chance (${totalWeight.toFixed(0)}%) exceeds 100%. Each entry rolls independently — this is fine but worth knowing.
            </div>` : ''}
        </div>`;
    },

    _rowHTML(r, i, itemOpts) {
        const selOpts = LootManager._items.map(it =>
            `<option value="${it.id}" ${it.id == r.item_id ? 'selected' : ''}>${it.icon || '📦'} ${it.name}</option>`
        ).join('');
        const pct = Math.min(100, parseFloat(r.chance) || 0);
        const col = pct >= 60 ? '#3fb950' : pct >= 30 ? '#d29922' : '#f85149';
        return `<div class="lt-row" id="lt_row_${i}">
            <select onchange="LootManager._update(${i},'item_id',this.value)">
                <option value="">— Pick an item —</option>
                ${selOpts}
            </select>
            <div class="lt-chance">
                <input type="range" min="1" max="100" value="${r.chance || 50}" style="flex:1;accent-color:${col}"
                    oninput="LootManager._update(${i},'chance',this.value);LootManager._syncChanceInput(${i},this.value)">
                <input type="number" id="lt_chance_num_${i}" min="1" max="100" value="${r.chance || 50}"
                    style="width:48px;text-align:center"
                    oninput="LootManager._update(${i},'chance',this.value);LootManager._syncChanceSlider(${i},this.value)">
            </div>
            <input type="number" min="1" max="99" value="${r.min_qty || 1}"
                oninput="LootManager._update(${i},'min_qty',parseInt(this.value)||1)">
            <input type="number" min="1" max="99" value="${r.max_qty || 1}"
                oninput="LootManager._update(${i},'max_qty',parseInt(this.value)||1)">
            <button onclick="LootManager._removeRow(${i})"
                style="background:transparent;border:1px solid rgba(248,81,73,.3);color:#f85149;
                border-radius:4px;padding:4px 8px;cursor:pointer">✕</button>
        </div>`;
    },

    _syncChanceInput(i, v) {
        const el = document.getElementById(`lt_chance_num_${i}`);
        if (el) el.value = v;
    },
    _syncChanceSlider(i, v) {
        const row = document.getElementById(`lt_row_${i}`);
        if (row) { const sl = row.querySelector('input[type=range]'); if (sl) sl.value = v; }
    },

    _update(i, field, value) {
        if (!LootManager._rows[i]) return;
        LootManager._rows[i][field] = field === 'item_id' ? parseInt(value) : value;
    },

    _addRow() {
        LootManager._rows.push({ item_id: null, chance: 50, min_qty: 1, max_qty: 1 });
        LootManager._renderEditor();
    },

    _removeRow(i) {
        LootManager._rows.splice(i, 1);
        LootManager._renderEditor();
    },

    async _save() {
        const npc  = LootManager._editing;
        if (!npc) return;

        // Validate
        const valid = LootManager._rows.filter(r => r.item_id);
        if (valid.length !== LootManager._rows.length) {
            if (!confirm('Some rows have no item selected and will be removed. Continue?')) return;
        }
        const payload = valid.map(r => {
            const entry = {
                item_id:  parseInt(r.item_id),
                chance:   Math.min(100, Math.max(1, parseFloat(r.chance) || 50)),
                min_qty:  Math.max(1, parseInt(r.min_qty) || 1),
                max_qty:  Math.max(parseInt(r.min_qty) || 1, parseInt(r.max_qty) || 1)
            };
            // Preserve conditional loot conditions if present (edited via JSON or future UI)
            if (Array.isArray(r.conditions) && r.conditions.length) {
                entry.conditions = r.conditions;
            }
            return entry;
        });

        const r = await API.save('npc', { drop_table_json: JSON.stringify(payload) }, npc.id);
        if (r.success) {
            // Update local cache
            npc.drop_table_json = JSON.stringify(payload);
            LootManager._rows = payload;
            // Flash save button green
            const btn = document.querySelector('.save-btn');
            if (btn) { btn.textContent = '✅ Saved!'; btn.style.background = '#3fb950'; }
            setTimeout(() => LootManager._renderEditor(), 1200);
        } else {
            alert('Save failed: ' + (r.message || 'Unknown error'));
        }
    }
};
