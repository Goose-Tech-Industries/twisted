// =================================================================
// PANELS FEATURES — Shop, Crafting, PvP Roster, Blood Ogham Grimoire
// =================================================================
// Sub-module of Panels (panels-core.js)

window.PanelsFeatures = {

    // =============================================================
    // RENDER: SHOP
    // =============================================================
    renderShop() {
        const d = Panels.charFull;
        const s = Panels.shopData;
        if (!d || !s) return;

        let overlay = Panels._getOverlay();
        overlay.innerHTML = `
        <div style="max-width:750px;margin:0 auto">
            <div class="ph">🏪 ${s.shop.name} <span style="float:right;color:#ffaa00">💰 ${d.gold}g</span></div>
            ${s.shop.description ? `<p style="color:#666;font-size:12px;margin-bottom:12px">${s.shop.description}</p>` : ''}

            <!-- BUY TAB -->
            <div id="shopBuyTab" style="display:grid;gap:4px">
                ${s.supplies.map(item => {
                    const canBuy = d.gold >= item.buy_price;
                    return `<div class="shop-row">
                        <span style="font-size:18px;width:30px;text-align:center">${item.icon || '📦'}</span>
                        <div style="flex:1">
                            <div style="color:#fff;font-size:13px">${item.name}</div>
                            <div style="color:#666;font-size:10px">${item.type} ${item.slot && item.slot !== 'NONE' ? '• ' + item.slot : ''}</div>
                        </div>
                        <span style="color:#ffaa00;font-size:13px;width:60px;text-align:right">${item.buy_price}g</span>
                        <button onclick="Panels.buyItem(${item.item_id}, ${item.buy_price}, '${Panels._esc(item.name)}')"
                            style="margin-left:8px;padding:4px 12px;background:${canBuy ? '#004400' : '#222'};
                            border:1px solid ${canBuy ? '#00aa00' : '#333'};color:${canBuy ? '#00ff00' : '#555'};
                            cursor:${canBuy ? 'pointer' : 'not-allowed'};border-radius:4px;font-family:monospace;font-size:11px"
                            ${canBuy ? '' : 'disabled'}>BUY</button>
                    </div>`;
                }).join('')}
            </div>

            <!-- SELL SECTION -->
            <div class="ph" style="margin-top:16px;font-size:11px">SELL ITEMS</div>
            <div style="display:grid;gap:4px;max-height:200px;overflow-y:auto">
                ${d.inventory.filter(i => i.type !== 'KEY').map(item => {
                    const sellPrice = Math.floor((item.value || 0) * 0.5);
                    return `<div class="shop-row">
                        <span style="font-size:16px;width:24px;text-align:center">${item.icon || '📦'}</span>
                        <div style="flex:1">
                            <div style="color:#ccc;font-size:12px">${item.name} ${item.quantity > 1 ? `x${item.quantity}` : ''}</div>
                        </div>
                        <span style="color:#888;font-size:11px">${sellPrice}g</span>
                        <button onclick="Panels.sellItem(${item.item_id}, '${Panels._esc(item.name)}')"
                            style="margin-left:8px;padding:3px 10px;background:#220000;border:1px solid #660000;
                            color:#ff6666;cursor:pointer;border-radius:4px;font-family:monospace;font-size:11px">SELL</button>
                    </div>`;
                }).join('')}
                ${d.inventory.filter(i => i.type !== 'KEY').length === 0 ? '<p style="color:#555;text-align:center">Nothing to sell.</p>' : ''}
            </div>
        </div>
        <div class="pk">[ESC] Close Shop</div>`;
    },

    // =============================================================
    // SHOP ACTIONS
    // =============================================================
    async buyItem(itemId, price, name) {
        if (!confirm(`Buy ${name} for ${price}g?`)) return;
        const r = await fetch('/buy-item', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId: Game.myCharId, shopId: Panels.shopId, itemId, quantity: 1 })
        });
        const j = await r.json();
        showNotification(j.message || (j.success ? 'Bought!' : 'Error'), j.success ? 'gold' : 'damage');
        if (j.success) { delete Panels.shopDiscount; await Panels.openShop(Panels.shopId); }
    },

    async sellItem(itemId, name) {
        if (!confirm(`Sell ${name}?`)) return;
        const r = await fetch('/sell-item', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId: Game.myCharId, itemId, quantity: 1 })
        });
        const j = await r.json();
        showNotification(j.message || (j.success ? 'Sold!' : 'Error'), j.success ? 'gold' : 'damage');
        if (j.success) await Panels.openShop(Panels.shopId);
    },

    // =============================================================
    // CRAFTING
    // =============================================================
    _craftData: null,

    async _craftInit() {
        try {
            const r = await fetch('/api/crafting/recipes', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ charId: Game.myCharId })
            });
            const j = await r.json();
            if (j.success) {
                PanelsFeatures._craftData = j;
                Panels._charTabSwitch('crafting');
            } else {
                showNotification(j.message || 'Failed to load recipes', 'damage');
            }
        } catch(e) { console.error('craft load failed', e); }
    },

    async _craftDo(recipeId) {
        try {
            const r = await fetch('/api/crafting/craft', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ charId: Game.myCharId, recipeId })
            });
            const j = await r.json();
            showNotification(j.message || (j.success ? 'Crafted!' : 'Failed'), j.success ? 'xp' : 'damage');
            if (j.success) {
                PanelsFeatures._craftData = null;
                Panels._charTabSwitch('crafting');
            }
        } catch(e) { showNotification('Craft error', 'damage'); }
    },

    _csCrafting() {
        const d = PanelsFeatures._craftData;

        if (!d) {
            PanelsFeatures._craftInit();
            return `<div style="text-align:center;color:#555;padding:40px;font-size:12px">Loading recipes...</div>`;
        }

        const { recipes, itemNames } = d;

        // Group by category
        const groups = {};
        for (const r of (recipes || [])) {
            if (!groups[r.category]) groups[r.category] = [];
            groups[r.category].push(r);
        }

        const CATEGORY_ICONS = {
            WEAPON: '⚔️', ARMOR: '🛡️', POTION: '⚗️', FOOD: '🍖', MISC: '🔧'
        };

        if (!recipes || !recipes.length) {
            return `<div style="text-align:center;padding:40px">
                <div style="font-size:40px;margin-bottom:12px">🔨</div>
                <div style="color:#555;font-size:12px">No recipes available yet.</div>
                <div style="color:#444;font-size:11px;margin-top:8px">
                    Find recipe books, learn from crafters, or ask your GM.
                </div>
            </div>`;
        }

        let html = `<style>
            .cr-card { background:rgba(255,255,255,.03);border:1px solid #1a1a2a;border-radius:8px;
                padding:12px;margin-bottom:8px;transition:border-color .15s }
            .cr-card:hover { border-color:#444 }
            .cr-card.cr-can { border-left:2px solid #0a4 }
            .cr-card.cr-cant { opacity:.6 }
            .cr-ing { display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 }
            .cr-ing-chip { padding:3px 8px;border-radius:4px;font-size:10px;font-family:monospace }
            .cr-ing-ok { background:rgba(0,150,50,.15);border:1px solid #0a4;color:#0c6 }
            .cr-ing-miss { background:rgba(150,0,0,.15);border:1px solid #600;color:#f55 }
        </style>`;

        for (const [cat, catRecipes] of Object.entries(groups)) {
            const icon = CATEGORY_ICONS[cat] || '📦';
            html += `<div style="color:#888;font-size:11px;font-weight:700;
                text-transform:uppercase;letter-spacing:1px;margin:12px 0 6px">
                ${icon} ${cat}
            </div>`;

            for (const r of catRecipes) {
                const ings = (r.ingredients || []).map(i => {
                    const it = itemNames[i.item_id] || {};
                    const ok = i.qty_owned >= i.qty_needed;
                    return `<span class="cr-ing-chip ${ok ? 'cr-ing-ok' : 'cr-ing-miss'}"
                        title="${ok ? '✅ You have enough' : '❌ Need more'}">
                        ${it.icon||'📦'} ${it.name||'item#'+i.item_id}
                        <b>${i.qty_owned}/${i.qty_needed}</b>
                    </span>`;
                }).join('');

                const btnStyle = r.canCraft
                    ? 'background:linear-gradient(135deg,#004400,#006600);border:1px solid #0a4;color:#fff;cursor:pointer'
                    : 'background:#111;border:1px solid #222;color:#444;cursor:not-allowed';

                html += `<div class="cr-card ${r.canCraft ? 'cr-can' : 'cr-cant'}">
                    <div style="display:flex;align-items:center;gap:10px;justify-content:space-between">
                        <div style="flex:1">
                            <div style="font-size:13px;color:#e8eef6;font-weight:600">
                                ${r.icon||'🔨'} ${r.name}
                                <span style="font-size:10px;color:#555;margin-left:6px">Lv${r.level_req}</span>
                                ${r.unlock_mode==='LEARNED'?'<span style="font-size:9px;color:#bb86fc;margin-left:6px">LEARNED</span>':''}
                            </div>
                            ${r.description ? `<div style="font-size:10px;color:#555;margin-top:2px">${r.description}</div>` : ''}
                            <div style="font-size:10px;color:#888;margin-top:4px">
                                Makes: ${r.result_icon||'📦'} <b>${r.result_name}</b> ×${r.result_qty}
                            </div>
                            <div class="cr-ing">${ings}</div>
                        </div>
                        <button onclick="${r.canCraft ? `Panels._craftDo(${r.id})` : 'void 0'}"
                            style="padding:8px 16px;border-radius:6px;font-family:monospace;
                                font-size:12px;min-width:70px;${btnStyle}"
                            ${r.canCraft ? '' : 'disabled'}>
                            ${r.canCraft ? '🔨 CRAFT' : '❌'}
                        </button>
                    </div>
                </div>`;
            }
        }

        html += `<div style="margin-top:12px">
            <button onclick="PanelsFeatures._craftData=null;Panels._charTabSwitch('crafting')"
                style="padding:8px 16px;background:transparent;border:1px solid #333;
                color:#555;cursor:pointer;border-radius:6px;font-family:monospace;font-size:11px">
                ↺ Refresh
            </button>
        </div>`;

        return html;
    },

    // =============================================================
    // PvP ROSTER
    // =============================================================
    _pvpRosterData: null,

    async _csPvpRosterInit() {
        try {
            const r = await fetch('/get-pvp-team', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
            });
            const j = await r.json();
            if (j.success) { PanelsFeatures._pvpRosterData = j; Panels._charTabSwitch('pvp'); }
        } catch(e) { console.error('pvp roster load failed', e); }
    },

    async _savePvpRoster() {
        const checkboxes = document.querySelectorAll('.pvp-char-check:checked');
        const ids = [...checkboxes].map(c => parseInt(c.value));
        const maxTeam = PanelsFeatures._pvpRosterData?.maxTeam || 3;
        if (ids.length > maxTeam) {
            showNotification(`Max ${maxTeam} characters in PvP team`, 'damage'); return;
        }
        try {
            const r = await fetch('/save-pvp-team', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ charIds: ids })
            });
            const j = await r.json();
            if (j.success) {
                PanelsFeatures._pvpRosterData.teamCharIds = j.teamCharIds;
                showNotification('✅ PvP roster saved!', 'xp');
                Panels._charTabSwitch('pvp');
            } else {
                showNotification(j.message || 'Save failed', 'damage');
            }
        } catch(e) { showNotification('Save error', 'damage'); }
    },

    _csPvpRoster() {
        const d = PanelsFeatures._pvpRosterData;

        if (!d) {
            PanelsFeatures._csPvpRosterInit();
            return `<div style="text-align:center;color:#555;padding:40px;font-size:12px">
                Loading roster...</div>`;
        }

        const { chars, teamCharIds, maxTeam } = d;

        const rows = (chars || []).map(ch => {
            const inTeam = (teamCharIds || []).includes(ch.id);
            const isMe   = ch.id === Game.myCharId;
            return `<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;
                border-radius:6px;cursor:pointer;margin-bottom:6px;
                background:${inTeam ? 'rgba(0,200,80,.08)' : 'rgba(255,255,255,.03)'};
                border:1px solid ${inTeam ? '#0a4' : '#1a1a2a'}">
                <input type="checkbox" class="pvp-char-check" value="${ch.id}"
                    ${inTeam ? 'checked' : ''}>
                <div style="flex:1">
                    <div style="font-size:13px;color:#e8eef6;font-weight:${isMe?700:400}">
                        ${ch.name} ${isMe ? '<span style="font-size:10px;color:#ffcc00">(current)</span>' : ''}
                    </div>
                    <div style="font-size:10px;color:#555">
                        Lv ${ch.level} · ${ch.class_name || 'Unknown class'}
                    </div>
                </div>
                ${inTeam ? '<span style="font-size:16px">✅</span>' : '<span style="font-size:16px;color:#333">○</span>'}
            </label>`;
        }).join('');

        return `
        <div style="max-width:480px;margin:0 auto">
            <div style="color:#888;font-size:11px;line-height:1.6;margin-bottom:16px">
                Select up to <b style="color:#ffcc00">${maxTeam}</b> characters for your PvP battle team.
                These are the characters other players will face when they challenge you.
                You control all of them during your turns.
            </div>

            <div style="margin-bottom:12px">
                ${rows || '<div style="color:#444;font-size:12px">No characters found.</div>'}
            </div>

            <div style="display:flex;gap:10px;align-items:center">
                <button onclick="Panels._savePvpRoster()"
                    style="padding:10px 24px;background:linear-gradient(135deg,#004400,#006600);
                    border:1px solid #0a0;color:#fff;cursor:pointer;border-radius:6px;
                    font-family:monospace;font-size:13px;font-weight:bold">
                    💾 SAVE ROSTER
                </button>
                <button onclick="PanelsFeatures._pvpRosterData=null;Panels._charTabSwitch('pvp')"
                    style="padding:10px 16px;background:transparent;border:1px solid #333;
                    color:#555;cursor:pointer;border-radius:6px;font-family:monospace;font-size:12px">
                    ↺ Refresh
                </button>
                <span style="font-size:10px;color:#444">
                    Max ${maxTeam} · ${(teamCharIds||[]).length} selected
                </span>
            </div>

            <div style="margin-top:20px;padding:12px;background:rgba(255,255,255,.02);
                border:1px solid #1a1a2a;border-radius:6px;font-size:10px;color:#555;line-height:1.7">
                <div style="color:#666;font-weight:bold;margin-bottom:4px">HOW 3v3 PvP WORKS</div>
                Challenge another online player using the social panel or a chat command.
                Both players bring their saved rosters. Turns go in speed order — on your team's
                turn, you choose which of your characters acts and what they do.
                First team to knock out all opponents wins.
            </div>
        </div>`;
    },

    // =============================================================
    // GRIMOIRE — Blood Ogham display
    // =============================================================
    _csGrimoire() {
        const systemName = LABELS.get('label_ogham_system', 'Blood Ogham');
        const slotsName  = LABELS.get('label_ogham_slots',  'Ogham Grooves');
        const r1 = LABELS.get('label_ogham_rank1', 'Carved');
        const r2 = LABELS.get('label_ogham_rank2', 'Inscribed');
        const r3 = LABELS.get('label_ogham_rank3', 'Bloodbound');
        const RANK_NAMES = {1: r1, 2: r2, 3: r3};
        const RANK_COLORS = {1:'#c0392b', 2:'#8e44ad', 3:'#f39c12'};

        // Async load
        setTimeout(async () => {
            const el = document.getElementById('grimoire_content');
            if (!el) return;
            try {
                const r = await fetch('/get-char-full', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ charId: Game.myCharId })
                });
                // Use dedicated endpoint
                const r2 = await fetch('/my-oghams', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ charId: Game.myCharId })
                });
                const data = await r2.json();
                if (!data.success) { el.innerHTML = '<p style="color:#555">Could not load grimoire.</p>'; return; }

                const { slotted, activeSets } = data.data;

                if (!slotted.length) {
                    el.innerHTML = `<div style="text-align:center;color:#555;padding:40px;font-style:italic">
                        No ${systemName}s carved yet.<br><br>
                        Defeat enemies to find them, or seek a ${slotsName} in your equipment.
                    </div>`;
                    return;
                }

                // Group by item
                const byItem = {};
                for (const s of slotted) {
                    const key = s.item_id;
                    if (!byItem[key]) byItem[key] = { name: s.item_name, icon: s.item_icon, slot: s.item_slot, oghams: [] };
                    byItem[key].oghams.push(s);
                }

                let html = '';

                // Active set bonuses
                if (activeSets.length) {
                    html += `<div style="background:rgba(183,28,28,0.15);border:1px solid #c0392b;border-radius:8px;padding:12px;margin-bottom:16px">
                        <div style="color:#e74c3c;font-weight:700;font-size:12px;letter-spacing:1px;margin-bottom:8px">🔥 ACTIVE SET BONUSES</div>`;
                    for (const set of activeSets) {
                        let bonusText = '';
                        try {
                            const b = typeof set.bonus === 'string' ? JSON.parse(set.bonus) : set.bonus;
                            bonusText = b?.label || '';
                        } catch {}
                        html += `<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
                            <span style="font-size:18px">${set.icon||'🩸'}</span>
                            <div>
                                <div style="font-weight:600;color:#e8eef6">${set.name}</div>
                                <div style="font-size:11px;color:#aaa">${bonusText}</div>
                            </div>
                        </div>`;
                    }
                    html += `</div>`;
                }

                // Oghams by item
                for (const [itemId, group] of Object.entries(byItem)) {
                    html += `<div style="margin-bottom:16px">
                        <div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">
                            ${group.icon||'⚔️'} ${group.name} (${group.slot||''})
                        </div>`;
                    for (const og of group.oghams) {
                        const rankName  = RANK_NAMES[og.current_rank] || ('Rank '+og.current_rank);
                        const rankColor = RANK_COLORS[og.current_rank] || '#c0392b';
                        const kills     = og.kill_count || 0;
                        const needed    = og.kills_to_rank_up || 0;
                        const isMaxRank = !og.next_rank_id || needed === 0;
                        const pct       = isMaxRank ? 100 : Math.min(100, Math.round((kills / (needed||50)) * 100));

                        html += `<div style="background:rgba(0,0,0,0.3);border:1px solid #2a0a0a;border-radius:8px;
                            padding:12px;margin-bottom:8px">
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                                <div style="display:flex;gap:10px;align-items:center">
                                    <span style="font-size:24px">${og.icon||'🩸'}</span>
                                    <div>
                                        <div style="font-weight:700;color:#e8eef6">${og.name}</div>
                                        <div style="color:${rankColor};font-size:11px;font-weight:600">${rankName}</div>
                                        ${og.family_name ? `<div style="color:#666;font-size:10px">${og.family_icon||''} ${og.family_name}</div>` : ''}
                                    </div>
                                </div>
                                <div style="text-align:right;font-size:11px;color:#666">Slot ${og.slot_index}</div>
                            </div>
                            ${og.lore_text ? `<div style="font-style:italic;color:#888;font-size:11px;margin-bottom:8px;
                                padding:6px 8px;border-left:2px solid #3a0a0a">${og.lore_text}</div>` : ''}
                            ${!isMaxRank ? `
                            <div style="margin-top:8px">
                                <div style="display:flex;justify-content:space-between;font-size:10px;color:#666;margin-bottom:3px">
                                    <span>${kills} / ${needed} kills to ${RANK_NAMES[(og.current_rank||1)+1]||'next rank'}</span>
                                    <span>${pct}%</span>
                                </div>
                                <div style="background:#1a0505;border-radius:4px;height:6px;overflow:hidden">
                                    <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#c0392b,#e74c3c);
                                        border-radius:4px;transition:width 0.3s"></div>
                                </div>
                            </div>` : `<div style="font-size:10px;color:#f39c12;margin-top:6px">✦ ${r3} — Maximum rank achieved</div>`}
                        </div>`;
                    }
                    html += '</div>';
                }

                el.innerHTML = html;
            } catch(e) {
                el.innerHTML = `<p style="color:#555">Error loading grimoire: ${e.message}</p>`;
            }
        }, 50);

        return `<div id="grimoire_content" style="min-height:100px">
            <p style="color:#555;text-align:center;padding:40px">Loading ${systemName} Grimoire...</p>
        </div>`;
    },
};
