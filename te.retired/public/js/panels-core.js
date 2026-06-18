// =================================================================
// PANELS CORE — State, lifecycle, overlay, inventory/equipment grid
// =================================================================
// Split from panels_ui.js. Sub-modules: PanelsInventory, PanelsFeatures

window.Panels = {
    open: null,       // 'inventory' | 'shop' | 'character' | null
    charFull: null,   // Cached data from /get-char-full
    shopData: null,   // Cached shop data
    shopId: null,

    // =============================================================
    // FETCH CHARACTER DATA
    // =============================================================
    async fetchChar() {
        try {
            const r = await fetch('/get-char-full', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ charId: Game.myCharId })
            });
            const j = await r.json();
            if (j.success) { Panels.charFull = j; return j; }
        } catch (e) { console.error('Panel fetch error:', e); }
        return null;
    },

    // =============================================================
    // OPEN/CLOSE
    // =============================================================
    async openInventory() {
        if (BattleUI.active) return;
        await Panels.fetchChar();
        if (!Panels.charFull) { showNotification('Failed to load data', 'damage'); return; }
        Panels.open = 'inventory';
        Game.dialogueOpen = true;
        Panels.renderInventory();
    },

    async openCharacter(tab) {
        if (BattleUI.active) return;
        await Panels.fetchChar();
        if (!Panels.charFull) return;
        Panels.open = 'character';
        Game.dialogueOpen = true;
        Panels._progPending = Panels._progPending || null;
        const overlay = Panels._getOverlay();
        overlay.innerHTML = PanelsInventory._charSheetHTML(Panels.charFull, tab || 'overview');
    },

    async openShop(shopId) {
        if (BattleUI.active) return;
        Panels.shopId = shopId;
        const [charR, shopR] = await Promise.all([
            Panels.fetchChar(),
            fetch('/get-shop', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shopId }) }).then(r => r.json())
        ]);
        if (!charR || !shopR.success) { showNotification('Shop unavailable', 'damage'); return; }
        Panels.shopData = shopR;
        // shopDiscount is set by haggling — apply to display prices
        if (Panels.shopDiscount) {
            const disc = Panels.shopDiscount / 100;
            Panels.shopData.supplies = (Panels.shopData.supplies || []).map(s => ({
                ...s,
                buy_price: Math.max(1, Math.round((s.buy_price || 0) * (1 - disc)))
            }));
        }
        Panels.open = 'shop';
        Game.dialogueOpen = true;
        Panels.renderShop();
    },

    close() {
        Panels.open = null;
        Game.dialogueOpen = false;
        const el = document.getElementById('panelOverlay');
        if (el) el.remove();
        // Refresh HP/MP bars
        loadCharData();
    },

    // =============================================================
    // RENDER: INVENTORY + EQUIPMENT
    // =============================================================
    renderInventory() {
        const d = Panels.charFull;
        if (!d) return;
        const { inventory, equipment, slots, gold, effectiveStats: es } = d;

        let overlay = Panels._getOverlay();
        overlay.innerHTML = `
        <div style="display:flex;gap:20px;height:100%;max-width:900px;margin:0 auto">
            <!-- LEFT: Equipment Slots -->
            <div style="width:280px;flex-shrink:0">
                <div class="ph">🎽 EQUIPMENT</div>
                <div style="display:grid;gap:6px">
                    ${(slots || []).map(s => {
                        const eq = equipment.find(e => e.slot_key === s.slot_key);
                        return `<div class="eq-slot" onclick="${eq ? `Panels.unequip('${s.slot_key}')` : ''}" title="${eq ? 'Click to unequip' : 'Empty'}">
                            <span style="color:#666;font-size:10px;width:70px;display:inline-block">${s.name}</span>
                            ${eq ? `<span>${eq.icon || '📦'} <b>${eq.name}</b></span>
                                <span style="margin-left:auto;font-size:10px;color:#888">${Panels._statPreview(eq)}</span>`
                                : '<span style="color:#444">— empty —</span>'}
                        </div>`;
                    }).join('')}
                </div>
                <div style="margin-top:12px;padding:10px;background:rgba(255,255,255,0.03);border:1px solid #333;border-radius:6px">
                    <div style="font-size:10px;color:#666;margin-bottom:6px">EFFECTIVE STATS</div>
                    <div class="sg">${Panels._statGrid(es)}</div>
                </div>
            </div>

            <!-- RIGHT: Inventory Grid -->
            <div style="flex:1;overflow-y:auto">
                <div class="ph">📦 INVENTORY <span style="float:right;color:#ffaa00">💰 ${gold}g</span></div>
                ${inventory.length === 0 ? '<p style="color:#555;text-align:center;margin-top:40px">Inventory is empty.</p>' : `
                <div class="inv-grid">
                    ${inventory.map(item => `
                    <div class="inv-item" onclick="Panels.itemAction(${item.item_id}, '${Panels._esc(item.name)}', '${item.type}', '${item.slot || 'NONE'}')" title="${Panels._esc(item.description || '')}">
                        <div style="font-size:24px;text-align:center">${item.icon || '📦'}</div>
                        <div style="font-size:11px;color:#fff;text-align:center;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.name}</div>
                        <div style="font-size:10px;color:#888;text-align:center">${item.type}${item.quantity > 1 ? ` x${item.quantity}` : ''}</div>
                        ${item.type !== 'CONSUMABLE' && item.type !== 'MISC' && item.type !== 'KEY' ? `<div style="font-size:9px;color:#666;text-align:center">${Panels._statPreview(item)}</div>` : ''}
                    </div>`).join('')}
                </div>`}
            </div>
        </div>
        <div class="pk">[I] Close | Click item to equip/use | Click equipped item to unequip</div>`;
    },

    // =============================================================
    // DELEGATES — forward to sub-modules
    // =============================================================
    renderCharacter(tab) { PanelsInventory.renderCharacter(tab); },
    renderShop() { PanelsFeatures.renderShop(); },

    // Character sheet HTML — delegated to PanelsInventory
    _charSheetHTML(d, activeTab) { return PanelsInventory._charSheetHTML(d, activeTab); },

    // Tab switch — delegated to PanelsInventory
    _charTabSwitch(tab) { PanelsInventory._charTabSwitch(tab); },

    // Progression helpers — delegated to PanelsInventory
    _progAdj(stat, delta) { PanelsInventory._progAdj(stat, delta); },
    _progReset() { PanelsInventory._progReset(); },
    _progCommit() { return PanelsInventory._progCommit(); },

    // Item actions — delegated to PanelsInventory
    itemAction(itemId, name, type, slot) { return PanelsInventory.itemAction(itemId, name, type, slot); },

    // Unequip — stays here since it's inventory lifecycle
    async unequip(slotKey) {
        const r = await fetch('/unequip-item', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId: Game.myCharId, slotKey })
        });
        const j = await r.json();
        if (j.success) {
            showNotification('Unequipped', 'item');
            await Panels.openInventory();
        } else {
            showNotification(j.message || 'Error', 'damage');
        }
    },

    // Shop actions — delegated to PanelsFeatures
    buyItem(itemId, price, name) { return PanelsFeatures.buyItem(itemId, price, name); },
    sellItem(itemId, name) { return PanelsFeatures.sellItem(itemId, name); },

    // Crafting delegates
    _craftInit() { return PanelsFeatures._craftInit(); },
    _craftDo(recipeId) { return PanelsFeatures._craftDo(recipeId); },
    _csCrafting() { return PanelsFeatures._csCrafting(); },

    // PvP delegates
    _csPvpRosterInit() { return PanelsFeatures._csPvpRosterInit(); },
    _savePvpRoster() { return PanelsFeatures._savePvpRoster(); },
    _csPvpRoster() { return PanelsFeatures._csPvpRoster(); },

    // Grimoire delegate
    _csGrimoire() { return PanelsFeatures._csGrimoire(); },

    // =============================================================
    // HELPERS
    // =============================================================
    _getOverlay() {
        let el = document.getElementById('panelOverlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'panelOverlay';
            el.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;z-index:120;
                background:rgba(0,0,0,0.92);overflow-y:auto;padding:30px;font-family:'Courier New',monospace;color:#fff`;
            document.body.appendChild(el);
        }
        return el;
    },

    _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;'); },

    _statPreview(item) {
        const parts = [];
        if (item.bonus_atk) parts.push(`ATK+${item.bonus_atk}`);
        if (item.bonus_def) parts.push(`DEF+${item.bonus_def}`);
        if (item.bonus_mo) parts.push(`MO+${item.bonus_mo}`);
        if (item.bonus_md) parts.push(`MD+${item.bonus_md}`);
        if (item.bonus_speed) parts.push(`SPD+${item.bonus_speed}`);
        if (item.bonus_luck) parts.push(`LCK+${item.bonus_luck}`);
        if (item.bonus_hp) parts.push(`HP+${item.bonus_hp}`);
        if (item.bonus_mp) parts.push(`MP+${item.bonus_mp}`);
        return parts.join(' ') || '';
    },

    _statGrid(es) {
        return ['atk','def','mo','md','speed','luck'].map(k =>
            `<div style="display:flex;justify-content:space-between;padding:2px 0">
                <span style="color:#666;font-size:10px">${k.toUpperCase()}</span>
                <span style="color:#fff;font-size:11px;font-weight:bold">${es[k]}</span>
            </div>`
        ).join('');
    },
};
