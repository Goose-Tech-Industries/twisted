// =================================================================
// CRAFT MANAGER — Recipe builder for game_craft_recipes
// =================================================================
// Lets you create and edit crafting recipes in AdminSauce.
// Each recipe defines: what it makes, how many, what it costs in
// ingredients, level requirements, and whether it needs to be
// learned or is available to everyone.
// =================================================================

const CraftManager = {
    _recipes: [],
    _items: [],   // all game items (for dropdowns)

    init: async () => {
        document.getElementById('pageTitle').innerText = '🔨 CRAFT RECIPES';
        const [recR, itemR] = await Promise.all([
            API.getAll('craft_recipe'),
            API.getAll('item')
        ]);
        CraftManager._recipes = recR.success ? recR.data : [];
        CraftManager._items   = itemR.success ? itemR.data : [];
        CraftManager.renderList();
    },

    renderList: () => {
        const d = CraftManager._recipes;
        const itemMap = {};
        for (const it of CraftManager._items) itemMap[it.id] = it;

        let h = `<button class="action-btn save-btn" onclick="CraftManager.edit()">+ NEW RECIPE</button>
        <table><thead><tr>
            <th>RECIPE</th><th>RESULT</th><th>INGREDIENTS</th><th>LEVEL</th><th>TYPE</th><th>ACTIONS</th>
        </tr></thead><tbody>`;

        d.forEach(r => {
            const result = itemMap[r.result_item_id];
            let ings = [];
            try { ings = JSON.parse(r.ingredients_json || '[]'); } catch {}
            const ingStr = ings.map(i => {
                const it = itemMap[i.item_id];
                return `${i.qty}x ${it ? (it.icon||'📦')+it.name : 'item#'+i.item_id}`;
            }).join(', ');
            h += `<tr>
                <td><b>${r.icon||'🔨'} ${r.name}</b><br><small style="color:var(--td)">${r.category}</small></td>
                <td>${result ? `${result.icon||'📦'} ${result.name} ×${r.result_qty}` : '—'}</td>
                <td style="font-size:11px;color:var(--td)">${ingStr || '—'}</td>
                <td style="text-align:center">${r.level_req}</td>
                <td><span class="tag ${r.unlock_mode==='LEARNED'?'tag-purple':''}">${r.unlock_mode}</span></td>
                <td>
                    <button class="edit-btn" onclick='CraftManager.edit(${JSON.stringify(r)})'>EDIT</button>
                    <button class="del-btn" onclick="CraftManager.del(${r.id})">DEL</button>
                </td>
            </tr>`;
        });
        h += '</tbody></table>';
        document.getElementById('dynamicArea').innerHTML = h;
    },

    edit: async (item) => {
        const d = item || {};
        const isNew = !d.id;
        const items = CraftManager._items;

        let existingIngs = [];
        try { existingIngs = JSON.parse(d.ingredients_json || '[]'); } catch {}

        // Store ingredient state in a variable we can mutate
        CraftManager._editIngs = existingIngs.map(i => ({ ...i }));

        document.getElementById('dynamicArea').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;color:var(--a)">${isNew ? '🔨 New Recipe' : '✏️ Edit: ' + d.name}</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="CraftManager.save(${d.id||'null'})">💾 SAVE</button>
                <button class="edit-btn" onclick="CraftManager.init()">CANCEL</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Recipe Name</label><input id="cr_name" value="${d.name||''}"></div>
            <div><label>Icon (emoji)</label><input id="cr_icon" value="${d.icon||'🔨'}" style="width:60px"></div>
            <div><label>Category</label>
                <select id="cr_category">
                    ${['WEAPON','ARMOR','POTION','FOOD','MISC'].map(c =>
                        `<option ${d.category===c?'selected':''}>${c}</option>`).join('')}
                </select>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Result Item</label>
                <select id="cr_result_item">
                    <option value="">— choose item —</option>
                    ${items.map(it =>
                        `<option value="${it.id}" ${String(it.id)===String(d.result_item_id)?'selected':''}>
                            ${it.icon||'📦'} ${it.name} [${it.type}]
                        </option>`).join('')}
                </select>
            </div>
            <div><label>Result Quantity</label>
                <input type="number" id="cr_result_qty" value="${d.result_qty||1}" min="1" max="99" style="width:70px">
            </div>
            <div><label>Level Requirement</label>
                <input type="number" id="cr_level_req" value="${d.level_req||1}" min="1" max="999" style="width:70px">
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Unlock Mode</label>
                <select id="cr_unlock_mode">
                    <option value="ALWAYS" ${d.unlock_mode!=='LEARNED'?'selected':''}>ALWAYS — visible to all players</option>
                    <option value="LEARNED" ${d.unlock_mode==='LEARNED'?'selected':''}>LEARNED — must find/buy recipe first</option>
                </select>
                <div style="font-size:10px;color:#555;margin-top:4px">
                    LEARNED recipes are hidden until a character discovers them via events, shops, or /api/crafting/learn.
                </div>
            </div>
            <div><label>Skill Required (optional)</label>
                <input id="cr_skill_req" value="${d.skill_req||''}" placeholder="e.g. Blacksmithing (leave blank = none)">
            </div>
        </div>

        <label>Description</label>
        <textarea id="cr_desc" rows="2" style="margin-bottom:16px">${d.description||''}</textarea>

        <div style="color:var(--a);font-weight:700;font-size:13px;margin-bottom:10px">🧪 INGREDIENTS</div>
        <div style="font-size:11px;color:var(--td);margin-bottom:10px">
            These items are consumed when a player crafts this recipe. All must be in their inventory.
        </div>
        <div id="cr_ing_list"></div>
        <div style="display:flex;gap:10px;align-items:flex-end;margin-top:10px">
            <div style="flex:1"><label>Add ingredient:</label>
                <select id="cr_add_item_sel">
                    <option value="">— pick item —</option>
                    ${items.map(it =>
                        `<option value="${it.id}">${it.icon||'📦'} ${it.name} [${it.type}]</option>`
                    ).join('')}
                </select>
            </div>
            <div><label>Qty</label>
                <input type="number" id="cr_add_qty" value="1" min="1" max="999" style="width:60px">
            </div>
            <button class="action-btn" onclick="CraftManager._addIng()" style="margin-bottom:0">+ ADD</button>
        </div>`;

        CraftManager._renderIngs();
    },

    _editIngs: [],

    _renderIngs: () => {
        const items = CraftManager._items;
        const itemMap = {};
        for (const it of items) itemMap[it.id] = it;

        const container = document.getElementById('cr_ing_list');
        if (!container) return;

        if (!CraftManager._editIngs.length) {
            container.innerHTML = '<p style="color:#444;font-size:12px">No ingredients yet. Add some below.</p>';
            return;
        }

        container.innerHTML = CraftManager._editIngs.map((ing, i) => {
            const it = itemMap[ing.item_id];
            return `<div style="display:flex;align-items:center;gap:10px;padding:6px 10px;
                background:rgba(255,255,255,.03);border:1px solid #1a1a2a;border-radius:6px;margin-bottom:6px">
                <span style="font-size:18px">${it?.icon||'📦'}</span>
                <span style="flex:1;font-size:13px">${it?.name||'item#'+ing.item_id}</span>
                <div>
                    <label style="font-size:10px;color:var(--td)">QTY</label>
                    <input type="number" value="${ing.qty}" min="1" max="999" style="width:60px"
                        onchange="CraftManager._editIngs[${i}].qty=parseInt(this.value)||1">
                </div>
                <button class="del-btn" style="padding:4px 10px"
                    onclick="CraftManager._removeIng(${i})">✕</button>
            </div>`;
        }).join('');
    },

    _addIng: () => {
        const sel = document.getElementById('cr_add_item_sel');
        const qty = parseInt(document.getElementById('cr_add_qty').value) || 1;
        const itemId = parseInt(sel.value);
        if (!itemId) { alert('Select an item first.'); return; }
        // Prevent duplicate
        if (CraftManager._editIngs.find(i => i.item_id === itemId)) {
            alert('That item is already an ingredient. Change its quantity instead.');
            return;
        }
        CraftManager._editIngs.push({ item_id: itemId, qty });
        CraftManager._renderIngs();
    },

    _removeIng: (idx) => {
        CraftManager._editIngs.splice(idx, 1);
        CraftManager._renderIngs();
    },

    save: async (id) => {
        const resultItem = document.getElementById('cr_result_item').value;
        if (!resultItem) { alert('Choose a result item.'); return; }
        if (!CraftManager._editIngs.length) { alert('Add at least one ingredient.'); return; }

        const payload = {
            name:            document.getElementById('cr_name').value,
            icon:            document.getElementById('cr_icon').value,
            category:        document.getElementById('cr_category').value,
            result_item_id:  parseInt(resultItem),
            result_qty:      parseInt(document.getElementById('cr_result_qty').value) || 1,
            level_req:       parseInt(document.getElementById('cr_level_req').value) || 1,
            unlock_mode:     document.getElementById('cr_unlock_mode').value,
            skill_req:       document.getElementById('cr_skill_req').value || null,
            description:     document.getElementById('cr_desc').value,
            ingredients_json: JSON.stringify(CraftManager._editIngs),
            is_active:       1
        };

        const r = await API.save('craft_recipe', payload, id);
        if (r.success) CraftManager.init();
        else alert(r.message || 'Save failed');
    },

    del: async (id) => {
        if (confirm('Delete this recipe? Players who know it will lose access.')) {
            await API.delete('craft_recipe', id);
            CraftManager.init();
        }
    }
};
