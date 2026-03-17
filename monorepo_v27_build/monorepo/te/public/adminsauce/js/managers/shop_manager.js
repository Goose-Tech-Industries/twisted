// =================================================================
// SHOP SUPPLY MANAGER — What each shop sells
// =================================================================
const ShopSupplyManager = {
    shops: [],
    items: [],
    data: [],
    selectedShop: null,

    init: async () => {
        document.getElementById('pageTitle').innerText = "🏪 SHOP INVENTORY";
        document.getElementById('dynamicArea').innerHTML = '<p>Loading...</p>';
        const [shops, items, supplies] = await Promise.all([
            API.getAll('shop'), API.getAll('item'), API.getAll('shop_supply')
        ]);
        ShopSupplyManager.shops = shops.success ? shops.data : [];
        ShopSupplyManager.items = items.success ? items.data : [];
        ShopSupplyManager.data = supplies.success ? supplies.data : [];
        ShopSupplyManager.renderShopPicker();
    },

    renderShopPicker: () => {
        const shops = ShopSupplyManager.shops;
        let h = `<p style="color:var(--td);font-size:12px;margin-bottom:12px">Select a shop to manage its inventory, prices, and stock.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px">`;
        shops.forEach(s => {
            const supplyCount = ShopSupplyManager.data.filter(d => d.shop_id === s.id).length;
            h += `<div onclick="ShopSupplyManager.selectShop(${s.id})" style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:16px;cursor:pointer;transition:.15s"
                onmouseover="this.style.borderColor='var(--a)'" onmouseout="this.style.borderColor='var(--b)'">
                <div style="font-size:16px;color:var(--a);font-weight:bold">🏪 ${s.name}</div>
                <div style="font-size:12px;color:var(--td);margin-top:4px">${s.description||'No description'}</div>
                <div style="font-size:11px;color:var(--td);margin-top:8px">${supplyCount} items · ${s.shop_type||'GENERAL'}</div>
            </div>`;
        });
        h += `<div onclick="ShopSupplyManager.createShop()" style="background:var(--bg3);border:2px dashed var(--b);border-radius:8px;padding:16px;cursor:pointer;text-align:center;display:flex;align-items:center;justify-content:center;color:var(--td)"
            onmouseover="this.style.borderColor='var(--g)'" onmouseout="this.style.borderColor='var(--b)'">
            <span style="font-size:24px">+</span>&nbsp;NEW SHOP
        </div>`;
        h += '</div>';
        document.getElementById('dynamicArea').innerHTML = h;
    },

    createShop: () => {
        // Replace browser prompt() with an inline modal
        const modal = document.createElement('div');
        modal.id = 'ss_new_modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:9999;display:flex;align-items:center;justify-content:center';
        modal.innerHTML = `
        <div style="background:var(--bg2);border:1px solid var(--b);border-radius:12px;padding:24px;min-width:360px">
            <h3 style="margin:0 0 16px;color:var(--a)">🏪 New Shop</h3>
            <label style="font-size:12px;color:var(--td)">Shop Name</label>
            <input id="ss_new_name" placeholder="e.g. Blacksmith, Potions" style="margin-bottom:10px">
            <label style="font-size:12px;color:var(--td)">Description (optional)</label>
            <input id="ss_new_desc" placeholder="e.g. Sells weapons and armor" style="margin-bottom:16px">
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="edit-btn" onclick="document.getElementById('ss_new_modal').remove()">Cancel</button>
                <button class="action-btn save-btn" onclick="ShopSupplyManager._doCreate()">Create Shop</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('ss_new_name')?.focus(), 50);
    },

    _doCreate: async () => {
        const name = document.getElementById('ss_new_name')?.value?.trim();
        const description = document.getElementById('ss_new_desc')?.value?.trim() || '';
        if (!name) { alert('Name is required.'); return; }
        document.getElementById('ss_new_modal')?.remove();
        await API.save('shop', { name, description });
        ShopSupplyManager.init();
    },

    selectShop: (shopId) => {
        ShopSupplyManager.selectedShop = shopId;
        ShopSupplyManager.renderSupplies();
    },

    renderSupplies: () => {
        const shopId = ShopSupplyManager.selectedShop;
        const shop = ShopSupplyManager.shops.find(s => s.id === shopId);
        const supplies = ShopSupplyManager.data.filter(d => d.shop_id === shopId);

        const itemOpts = ShopSupplyManager.items.map(i => `<option value="${i.id}">${i.icon||'📦'} ${i.name} (${i.type})</option>`).join('');

        let h = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h3 style="margin:0;color:var(--a)">${shop ? shop.name : 'Shop'} — Inventory</h3>
            <div style="display:flex;gap:8px">
                <button class="edit-btn" onclick="ShopSupplyManager.editShop(${shopId})">✏️ Edit Shop</button>
                <button class="del-btn" onclick="ShopSupplyManager.deleteShop(${shopId})">🗑️ Delete Shop</button>
                <button class="edit-btn" onclick="ShopSupplyManager.init()">← Back</button>
            </div>
        </div>

        <div style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:12px;margin-bottom:16px">
            <div style="display:flex;gap:8px;align-items:end">
                <div style="flex:2"><label>ADD ITEM</label><select id="ss_item">${itemOpts}</select></div>
                <div style="flex:1"><label>BUY PRICE</label><input id="ss_buy" type="number" value="100"></div>
                <div style="flex:1"><label>SELL PRICE</label><input id="ss_sell" type="number" value="25"></div>
                <div style="flex:1"><label>STOCK (-1=∞)</label><input id="ss_stock" type="number" value="-1"></div>
                <button class="action-btn save-btn" onclick="ShopSupplyManager.addItem(${shopId})">+ ADD</button>
            </div>
        </div>

        <table><thead><tr><th>ICON</th><th>ITEM</th><th>TYPE</th><th>BUY</th><th>SELL</th><th>STOCK</th><th>ACTIONS</th></tr></thead><tbody>`;

        supplies.forEach(s => {
            const item = ShopSupplyManager.items.find(i => i.id === s.item_id);
            const hasCond = s.world_flag_conditions && s.world_flag_conditions !== 'null';
            const hasMod  = s.flag_price_modifiers  && s.flag_price_modifiers  !== 'null';
            h += `<tr>
                <td style="font-size:20px">${item?item.icon:'?'}</td>
                <td>
                    <b>${item?item.name:'#'+s.item_id}</b>
                    ${hasCond ? '<span title="Has world flag conditions" style="color:#bb86fc;font-size:10px;margin-left:4px">🌍COND</span>' : ''}
                    ${hasMod  ? '<span title="Has price modifiers"      style="color:#ffd700;font-size:10px;margin-left:4px">💰MOD</span>'  : ''}
                </td>
                <td>${item?item.type:'?'}</td>
                <td><input type="number" value="${s.buy_price}" style="width:70px;padding:4px" onchange="ShopSupplyManager.updatePrice(${s.id},'buy_price',this.value)"></td>
                <td><input type="number" value="${s.sell_price||0}" style="width:70px;padding:4px" onchange="ShopSupplyManager.updatePrice(${s.id},'sell_price',this.value)"></td>
                <td>${s.stock < 0 ? '∞' : s.stock}</td>
                <td style="display:flex;gap:4px;flex-wrap:wrap">
                    <button class="edit-btn" style="font-size:10px;padding:3px 7px"
                        onclick='ShopSupplyManager.editFlags(${s.id},${JSON.stringify(s.world_flag_conditions||null).replace(/'/g,"&#39;")},${JSON.stringify(s.flag_price_modifiers||null).replace(/'/g,"&#39;")})'>🌍 Flags</button>
                    <button class="del-btn" onclick="ShopSupplyManager.removeItem(${s.id})">✕</button>
                </td>
            </tr>`;
        });
        h += '</tbody></table>';
        document.getElementById('dynamicArea').innerHTML = h;
    },

    addItem: async (shopId) => {
        const payload = {
            shop_id: shopId,
            item_id: parseInt(document.getElementById('ss_item').value),
            buy_price: parseInt(document.getElementById('ss_buy').value),
            sell_price: parseInt(document.getElementById('ss_sell').value),
            stock: parseInt(document.getElementById('ss_stock').value)
        };
        await API.save('shop_supply', payload);
        // Reload
        const r = await API.getAll('shop_supply');
        if (r.success) ShopSupplyManager.data = r.data;
        ShopSupplyManager.renderSupplies();
    },

    updatePrice: async (id, field, val) => {
        await API.save('shop_supply', { [field]: parseInt(val) }, id);
    },

    removeItem: async (id) => {
        await API.delete('shop_supply', id);
        const r = await API.getAll('shop_supply');
        if (r.success) ShopSupplyManager.data = r.data;
        ShopSupplyManager.renderSupplies();
    },

    editShop: (shopId) => {
        const shop = ShopSupplyManager.shops.find(s => s.id === shopId) || {};
        document.getElementById('dynamicArea').innerHTML = `
        <h3>Edit Shop</h3>
        <div class="grid-2">
            <div><label>NAME</label><input id="es_name" value="${shop.name||''}"></div>
            <div><label>TYPE</label><select id="es_type">
                ${['GENERAL','WEAPON','ARMOR','MAGIC','INN','BLACK_MARKET'].map(t => `<option ${shop.shop_type===t?'selected':''}>${t}</option>`).join('')}
            </select></div>
        </div>
        <label>DESCRIPTION</label><textarea id="es_desc" rows="2">${shop.description||''}</textarea>
        <div class="grid-2">
            <div><label>NPC ID (shopkeeper)</label><input id="es_npc" type="number" value="${shop.npc_id||0}"></div>
            <div><label>MAP ID (location)</label><input id="es_map" type="number" value="${shop.location_map_id||0}"></div>
        </div>
        <div class="btn-row">
            <button class="action-btn save-btn" onclick="ShopSupplyManager.saveShop(${shopId})">💾 SAVE</button>
            <button class="edit-btn" onclick="ShopSupplyManager.selectShop(${shopId})">CANCEL</button>
        </div>`;
    },

    saveShop: async (id) => {
        // Column names must match game_shops exactly: name, description, map_id
        // shop_type and npc_id don't exist in the schema — removed to prevent 500 errors.
        await API.save('shop', {
            name:        document.getElementById('es_name').value,
            description: document.getElementById('es_desc').value,
            map_id:      parseInt(document.getElementById('es_map').value) || null
        }, id);
        ShopSupplyManager.init();
    },

    editFlags: (supplyId, conditionsJson, modifiersJson) => {
        let conds = [];
        let mods  = [];
        try { conds = conditionsJson ? JSON.parse(conditionsJson) : []; } catch {}
        try { mods  = modifiersJson  ? JSON.parse(modifiersJson)  : []; } catch {}

        // Store in edit state
        ShopSupplyManager._flagEdit = { supplyId, conds: conds.slice(), mods: mods.slice() };

        const renderFlagEdit = () => {
            const { conds, mods } = ShopSupplyManager._flagEdit;
            const el = document.getElementById('sflag_panel');
            if (!el) return;
            let h = `<div style="margin-bottom:12px">
                <div style="font-size:12px;font-weight:700;color:#bb86fc;margin-bottom:6px">
                    🌍 SHOW CONDITIONS — all must be true for item to appear
                </div>`;
            conds.forEach((c, i) => {
                h += `<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
                    <input value="${c.flag||''}" style="flex:2" placeholder="flag key"
                        onchange="ShopSupplyManager._flagEdit.conds[${i}].flag=this.value">
                    <select onchange="ShopSupplyManager._flagEdit.conds[${i}].op=this.value">
                        ${['==','!=','>','<','>=','<='].map(op =>
                            `<option ${c.op===op?'selected':''}>${op}</option>`).join('')}
                    </select>
                    <input value="${c.value||''}" style="flex:1" placeholder="value"
                        onchange="ShopSupplyManager._flagEdit.conds[${i}].value=this.value">
                    <button class="del-btn" style="padding:2px 8px"
                        onclick="ShopSupplyManager._flagEdit.conds.splice(${i},1);ShopSupplyManager._renderFlagEdit()">✕</button>
                </div>`;
            });
            h += `<button class="edit-btn" onclick="ShopSupplyManager._flagEdit.conds.push({flag:'',op:'==',value:'true'});ShopSupplyManager._renderFlagEdit()">+ Add Condition</button>
            </div>
            <div>
                <div style="font-size:12px;font-weight:700;color:#ffd700;margin-bottom:6px">
                    💰 PRICE MODIFIERS — multiplies buy price when flag is true
                </div>`;
            mods.forEach((m, i) => {
                h += `<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
                    <input value="${m.flag||''}" style="flex:2" placeholder="flag key"
                        onchange="ShopSupplyManager._flagEdit.mods[${i}].flag=this.value">
                    <label style="font-size:11px;color:#888">×</label>
                    <input type="number" value="${m.multiplier||1}" style="width:70px"
                        step="0.05" min="0.1" max="10"
                        onchange="ShopSupplyManager._flagEdit.mods[${i}].multiplier=parseFloat(this.value)||1">
                    <button class="del-btn" style="padding:2px 8px"
                        onclick="ShopSupplyManager._flagEdit.mods.splice(${i},1);ShopSupplyManager._renderFlagEdit()">✕</button>
                </div>`;
            });
            h += `<button class="edit-btn" onclick="ShopSupplyManager._flagEdit.mods.push({flag:'',multiplier:0.8});ShopSupplyManager._renderFlagEdit()">+ Add Modifier</button>
            </div>`;
            el.innerHTML = h;
        };
        ShopSupplyManager._renderFlagEdit = renderFlagEdit;

        document.getElementById('dynamicArea').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;color:var(--a)">🌍 World Flag Rules for Supply #${supplyId}</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="ShopSupplyManager.saveFlags()">💾 SAVE</button>
                <button class="edit-btn" onclick="ShopSupplyManager.selectShop(ShopSupplyManager.selectedShop)">CANCEL</button>
            </div>
        </div>
        <div style="font-size:11px;color:#555;margin-bottom:16px">
            Examples: show only during war → flag <b>war_started</b> == <b>true</b><br>
            Discount during festival → flag <b>festival_active</b> multiplier <b>0.8</b> (= 20% off)
        </div>
        <div id="sflag_panel"></div>`;

        renderFlagEdit();
    },

    _flagEdit: null,
    _renderFlagEdit: () => {},

    saveFlags: async () => {
        const { supplyId, conds, mods } = ShopSupplyManager._flagEdit;
        const payload = {
            world_flag_conditions: conds.length ? JSON.stringify(conds) : null,
            flag_price_modifiers:  mods.length  ? JSON.stringify(mods)  : null
        };
        await API.save('shop_supply', payload, supplyId);
        const r = await API.getAll('shop_supply');
        if (r.success) ShopSupplyManager.data = r.data;
        ShopSupplyManager.selectShop(ShopSupplyManager.selectedShop);
    },

    deleteShop: async (id) => {
        if (confirm('Delete this shop and all its inventory?')) {
            await API.delete('shop', id);
            ShopSupplyManager.init();
        }
    }
};
