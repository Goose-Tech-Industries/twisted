// =================================================================
// PANELS INVENTORY — Character sheet, tabs, progression, item actions
// =================================================================
// Sub-module of Panels (panels-core.js)

window.PanelsInventory = {

    // =============================================================
    // RENDER: CHARACTER SHEET  (tabs: Overview / Stats / Skills / Progression)
    // =============================================================
    renderCharacter(tab) {
        const d = Panels.charFull;
        if (!d) return;
        let overlay = Panels._getOverlay();
        overlay.innerHTML = PanelsInventory._charSheetHTML(d, 'overview');
    },

    _charSheetHTML(d, activeTab) {
        const c   = d.character;
        const es  = d.effectiveStats;
        const eq  = d.equipBonus;
        const pts = d.unspentPoints || 0;

        const tabs = [
            { key: 'overview',    icon: '🧙', label: 'Overview'    },
            { key: 'stats',       icon: '⚔️',  label: 'Stats'       },
            { key: 'skills',      icon: '✨',   label: LABELS.get('label_skills_tab','Skills') },
            { key: 'progression', icon: '📈',  label: 'Progression' },
            { key: 'grimoire',    icon: '🩸',  label: LABELS.get('label_ogham_system','Blood Ogham') },
            { key: 'pvp',         icon: '⚔️',  label: 'PvP Roster'  },
            { key: 'crafting',    icon: '🔨',  label: 'Crafting'    },
        ];

        const tabBar = tabs.map(t => `
            <button class="cs-tab${t.key === activeTab ? ' cs-tab-active' : ''}"
                    onclick="Panels._charTabSwitch('${t.key}')">
                ${t.icon} ${t.label}${t.key === 'progression' && pts > 0
                    ? ` <span style="background:#bb86fc;color:#000;border-radius:8px;font-size:9px;padding:0 5px;margin-left:3px">${pts}</span>`
                    : ''}
            </button>`).join('');

        let content = '';
        switch (activeTab) {
            case 'overview':   content = PanelsInventory._csOverview(d, c, es); break;
            case 'stats':      content = PanelsInventory._csStats(c, es, eq);   break;
            case 'skills':     content = PanelsInventory._csSkills(d);          break;
            case 'progression':content = PanelsInventory._csProgression(d, c, es, pts); break;
            case 'grimoire':    content = PanelsFeatures._csGrimoire();          break;
            case 'pvp':         content = PanelsFeatures._csPvpRoster();         break;
            case 'crafting':    content = PanelsFeatures._csCrafting();          break;
        }

        return `
        <style>
        .cs-wrap    { max-width:700px; margin:0 auto; font-family:'Courier New',monospace; color:#e8eef6; }
        .cs-tabs    { display:flex; gap:4px; margin-bottom:16px; flex-wrap:wrap; }
        .cs-tab     { padding:8px 16px; border-radius:8px 8px 0 0; cursor:pointer; font-family:inherit;
                      font-size:12px; color:#666; background:rgba(255,255,255,0.04);
                      border:1px solid rgba(255,255,255,0.07); border-bottom:none; transition:.15s; }
        .cs-tab:hover { color:#aaa; }
        .cs-tab-active { color:#e8eef6; background:rgba(255,255,255,0.09); border-color:rgba(255,255,255,0.13); }
        .cs-card    { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:16px; margin-bottom:10px; }
        .cs-sect    { color:#bb86fc; font-size:10px; text-transform:uppercase; letter-spacing:1px;
                      margin:14px 0 6px; border-bottom:1px solid #21262d; padding-bottom:4px; }
        .cs-stat-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
        .cs-stat-cell { background:rgba(255,255,255,0.03); border:1px solid #30363d; border-radius:7px;
                        padding:10px; text-align:center; }
        .cs-stat-key  { font-size:10px; color:#666; margin-bottom:4px; }
        .cs-stat-val  { font-size:22px; font-weight:bold; color:#e8eef6; }
        .cs-stat-bonus{ font-size:10px; color:#3fb950; }
        .cs-bar-row   { display:flex; align-items:center; gap:8px; margin-bottom:7px; }
        .cs-bar-lbl   { font-size:11px; width:28px; text-align:right; flex-shrink:0; }
        .cs-bar-track { flex:1; height:10px; background:rgba(255,255,255,0.07); border-radius:5px; overflow:hidden; }
        .cs-bar-fill  { height:100%; border-radius:5px; }
        .cs-bar-val   { font-size:11px; width:80px; text-align:right; flex-shrink:0; font-variant-numeric:tabular-nums; }
        .cs-skill-row { display:flex; align-items:center; gap:10px; padding:8px 10px;
                        background:rgba(255,255,255,0.02); border:1px solid #21262d; border-radius:6px; margin-bottom:5px; }
        .prog-row     { display:flex; align-items:center; gap:10px; padding:8px 12px;
                        background:rgba(255,255,255,0.02); border:1px solid #21262d; border-radius:6px; margin-bottom:6px; }
        .prog-key     { font-size:12px; color:#c9d1d9; width:90px; }
        .prog-val     { font-size:16px; font-weight:bold; color:#fff; width:40px; text-align:center; }
        .prog-btn     { width:28px; height:28px; border-radius:6px; cursor:pointer; font-size:16px; font-weight:bold;
                        border:1px solid; transition:.15s; font-family:inherit; display:flex; align-items:center; justify-content:center; }
        .prog-btn-plus  { background:rgba(63,185,80,0.12); border-color:rgba(63,185,80,0.35); color:#3fb950; }
        .prog-btn-plus:hover  { background:rgba(63,185,80,0.25); }
        .prog-btn-minus { background:rgba(248,81,73,0.1);  border-color:rgba(248,81,73,0.3);  color:#f85149; }
        .prog-btn-minus:hover { background:rgba(248,81,73,0.2); }
        .prog-btn:disabled { opacity:.3; cursor:not-allowed; }
        .prog-commit  { padding:10px 24px; border-radius:8px; cursor:pointer; font-family:inherit; font-size:13px;
                        font-weight:700; background:rgba(63,185,80,0.15); border:1px solid rgba(63,185,80,0.4);
                        color:#3fb950; transition:.15s; }
        .prog-commit:hover:not(:disabled) { background:rgba(63,185,80,0.28); }
        .prog-commit:disabled { opacity:.35; cursor:not-allowed; }
        </style>
        <div class="cs-wrap">
            <div class="cs-tabs">${tabBar}</div>
            ${content}
        </div>
        <div class="pk">[C] or [ESC] Close</div>`;
    },

    // ── TAB: OVERVIEW ─────────────────────────────────────────────
    _csOverview(d, c, es) {
        let rec = { W:0, L:0, T:0 };
        try { rec = typeof c.battle_record === 'object' ? c.battle_record : JSON.parse(c.battle_record || '{}'); } catch {}

        const xpCur = d.xpCurrent || 0;
        const xpMax = d.xpToNext;
        const xpPct = xpMax ? Math.min(100, Math.round(xpCur / xpMax * 100)) : 100;
        const lb    = Math.min(100, Math.max(0, parseFloat(es.limitbreak || 0)));

        return `
        <div class="cs-card">
            <div style="display:flex;gap:16px;align-items:flex-start">
                <div style="flex:1">
                    <div style="font-size:22px;color:#ffcc00;font-weight:bold;margin-bottom:4px">${Panels._esc(c.name)}</div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
                        <span style="color:#bb86fc;font-size:12px">Lv. ${c.level}</span>
                        ${c.class_name ? `<span style="color:#03dac6;font-size:12px">${Panels._esc(c.class_name)}</span>` : ''}
                        ${c.race_name  ? `<span style="color:#9b59b6;font-size:12px">${Panels._esc(c.race_name)}</span>`  : ''}
                        ${c.bg_name    ? `<span style="color:#8b949e;font-size:12px">${Panels._esc(c.bg_name)}</span>`    : ''}
                    </div>
                </div>
                <div style="text-align:right">
                    <div style="color:#d29922;font-size:16px;font-weight:bold">💰 ${d.gold}g</div>
                    <div style="color:#3fb950;font-size:12px;margin-top:4px">⚔️ ${rec.W||0}W
                        <span style="color:#f85149">${rec.L||0}L</span>
                        <span style="color:#666">${rec.T||0}T</span>
                    </div>
                </div>
            </div>

            <!-- HP -->
            <div class="cs-bar-row">
                <div class="cs-bar-lbl" style="color:#e74c3c">HP</div>
                <div class="cs-bar-track">
                    <div class="cs-bar-fill" style="width:${Math.min(100,c.current_hp/es.maxHp*100)}%;background:linear-gradient(90deg,#c0392b,#e74c3c)"></div>
                </div>
                <div class="cs-bar-val" style="color:#e74c3c">${c.current_hp} / ${es.maxHp}</div>
            </div>

            <!-- MP -->
            <div class="cs-bar-row">
                <div class="cs-bar-lbl" style="color:#2e86c1">MP</div>
                <div class="cs-bar-track">
                    <div class="cs-bar-fill" style="width:${Math.min(100,c.current_mp/es.maxMp*100)}%;background:linear-gradient(90deg,#1a5276,#2e86c1)"></div>
                </div>
                <div class="cs-bar-val" style="color:#2e86c1">${c.current_mp} / ${es.maxMp}</div>
            </div>

            <!-- XP -->
            <div class="cs-bar-row">
                <div class="cs-bar-lbl" style="color:#bb86fc">${LABELS.get('label_experience','XP')}</div>
                <div class="cs-bar-track">
                    <div class="cs-bar-fill" style="width:${xpPct}%;background:linear-gradient(90deg,#7d3c98,#bb86fc)"></div>
                </div>
                <div class="cs-bar-val" style="color:#9b59b6;font-size:10px">${xpMax ? `${xpCur} / ${xpMax}` : 'MAX'}</div>
            </div>

            <!-- Limit Break -->
            <div class="cs-bar-row">
                <div class="cs-bar-lbl" style="color:#f39c12">LB</div>
                <div class="cs-bar-track">
                    <div class="cs-bar-fill" style="width:${lb}%;background:linear-gradient(90deg,#b7770d,#f39c12)"></div>
                </div>
                <div class="cs-bar-val" style="color:#f39c12">${Math.floor(lb)}% (Lv.${es.breaklevel||1})</div>
            </div>
        </div>

        ${c.feat_name ? `<div class="cs-card">
            <div style="font-size:10px;color:#666;margin-bottom:4px">FEAT</div>
            <div style="color:#d29922;font-weight:bold">${Panels._esc(c.feat_name)}</div>
            ${c.feat_desc ? `<div style="color:#8b949e;font-size:12px;margin-top:3px">${Panels._esc(c.feat_desc)}</div>` : ''}
        </div>` : ''}`;
    },

    // ── TAB: STATS ────────────────────────────────────────────────
    _csStats(c, es, eq) {
        const statDefs = [
            { key:'atk',   label:'ATK',   desc:'Physical attack power',  color:'#e74c3c' },
            { key:'def',   label:'DEF',   desc:'Physical defense',        color:'#3498db' },
            { key:'mo',    label:'MO',    desc:'Magic offense',           color:'#9b59b6' },
            { key:'md',    label:'MD',    desc:'Magic defense',           color:'#1abc9c' },
            { key:'speed', label:'SPD',   desc:'Turn order & dodge',      color:'#f39c12' },
            { key:'luck',  label:'LCK',   desc:'Crit & bonus effects',    color:'#2ecc71' },
        ];

        const cells = statDefs.map(s => {
            const base  = c[s.key]    || 0;
            const bonus = eq[s.key]   || 0;
            const total = es[s.key]   || base;
            return `
            <div class="cs-stat-cell">
                <div class="cs-stat-key" style="color:${s.color}">${s.label}</div>
                <div class="cs-stat-val">${total}</div>
                <div style="font-size:10px;margin-top:2px">
                    <span style="color:#484f58">${base}</span>
                    ${bonus > 0 ? `<span class="cs-stat-bonus"> +${bonus}</span>` : ''}
                </div>
                <div style="font-size:9px;color:#484f58;margin-top:2px">${s.desc}</div>
            </div>`;
        }).join('');

        return `
        <div class="cs-card">
            <div style="color:#484f58;font-size:11px;margin-bottom:12px">
                Numbers shown as <span style="color:#8b949e">base</span>
                <span style="color:#3fb950">+gear</span> = <span style="color:#e8eef6">total</span>
            </div>
            <div class="cs-stat-grid">${cells}</div>
        </div>
        <div class="cs-card" style="display:flex;gap:24px;font-size:12px;color:#8b949e;justify-content:center">
            <span>MAX HP <b style="color:#e74c3c">${es.maxHp}</b></span>
            <span>MAX MP <b style="color:#2e86c1">${es.maxMp}</b></span>
        </div>`;
    },

    // ── TAB: SKILLS ───────────────────────────────────────────────
    _csSkills(d) {
        const skills  = d.skills  || [];
        const limits  = d.limits  || [];

        const skillRows = skills.length
            ? skills.map(s => `
            <div class="cs-skill-row">
                <span style="font-size:20px;width:30px;text-align:center">${s.icon || '✨'}</span>
                <div style="flex:1">
                    <div style="color:#aaccff;font-weight:bold;font-size:13px">${Panels._esc(s.alt_name || s.name)}</div>
                    ${s.description ? `<div style="color:#484f58;font-size:11px;margin-top:2px">${Panels._esc(s.description)}</div>` : ''}
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div style="color:#2e86c1;font-size:12px">${s.mp_cost} MP</div>
                    <div style="color:#484f58;font-size:10px">Lv.${s.learn_level} ${s.type || ''}</div>
                </div>
            </div>`).join('')
            : '<p style="color:#484f58;text-align:center;padding:20px">No skills learned yet.</p>';

        const limitRows = limits.length
            ? `<div class="cs-sect">${LABELS.get('label_limit_icon','⚡')} ${LABELS.get('label_limit_break','Limit Breaks')}</div>` + limits.map(lb => `
            <div class="cs-skill-row">
                <span style="font-size:20px;width:30px;text-align:center">${lb.icon || '⚡'}</span>
                <div style="flex:1">
                    <div style="color:#f39c12;font-weight:bold;font-size:13px">${Panels._esc(lb.name)}</div>
                    ${lb.description ? `<div style="color:#484f58;font-size:11px;margin-top:2px">${Panels._esc(lb.description)}</div>` : ''}
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div style="color:#f39c12;font-size:11px">Break Lv.${lb.break_level||1}</div>
                    <div style="color:#484f58;font-size:10px">Req Lv.${lb.char_level_req||1}</div>
                </div>
            </div>`).join('')
            : '';

        return `<div class="cs-card">
            <div class="cs-sect">✨ Class Skills</div>
            ${skillRows}
            ${limitRows}
        </div>`;
    },

    // ── TAB: PROGRESSION ─────────────────────────────────────────
    _csProgression(d, c, es, pts) {
        if (!Panels._progPending) {
            Panels._progPending = { atk:0, def:0, mo:0, md:0, speed:0, luck:0 };
        }
        const pend = Panels._progPending;
        const spent = Object.values(pend).reduce((a, b) => a + b, 0);
        const remaining = pts - spent;

        const statDefs = [
            { key:'atk',   label:`${LABELS.get('label_stat_atk','ATK')} — ${LABELS.get('label_attack','Attack')}`,  color:'#e74c3c' },
            { key:'def',   label:'DEF — Defense',        color:'#3498db' },
            { key:'mo',    label:'MO — Magic Offense',   color:'#9b59b6' },
            { key:'md',    label:'MD — Magic Defense',   color:'#1abc9c' },
            { key:'speed', label:'SPD — Speed',          color:'#f39c12' },
            { key:'luck',  label:'LCK — Luck',           color:'#2ecc71' },
        ];

        const rows = statDefs.map(s => `
        <div class="prog-row">
            <div class="prog-key" style="color:${s.color}">${s.label}</div>
            <div class="prog-val" style="color:${s.color}">${(c[s.key]||0) + (d.equipBonus[s.key]||0)}</div>
            <div style="flex:1"></div>
            ${pend[s.key] > 0 ? `<span style="color:#3fb950;font-size:12px;min-width:28px">+${pend[s.key]}</span>` : '<span style="min-width:28px"></span>'}
            <button class="prog-btn prog-btn-minus" onclick="Panels._progAdj('${s.key}',-1)"
                    ${pend[s.key] <= 0 ? 'disabled' : ''}>−</button>
            <button class="prog-btn prog-btn-plus"  onclick="Panels._progAdj('${s.key}',+1)"
                    ${remaining <= 0 ? 'disabled' : ''}>+</button>
        </div>`).join('');

        return `
        <div class="cs-card">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
                <div>
                    <div style="font-size:18px;font-weight:bold;color:#bb86fc">${remaining}
                        <span style="font-size:12px;font-weight:normal;color:#666">points remaining</span>
                    </div>
                    ${spent > 0 ? `<div style="font-size:11px;color:#3fb950">${spent} staged to spend</div>` : ''}
                </div>
                ${pts <= 0 ? '<div style="color:#484f58;font-size:12px">Gain points by levelling up!</div>' : ''}
            </div>
            ${rows}
            <div style="margin-top:16px;display:flex;gap:10px">
                <button class="prog-commit" id="progCommitBtn"
                        onclick="Panels._progCommit()"
                        ${spent <= 0 ? 'disabled' : ''}>
                    ✅ Spend ${spent > 0 ? spent + ' Point' + (spent > 1 ? 's' : '') : 'Points'}
                </button>
                ${spent > 0 ? `<button onclick="Panels._progReset()"
                    style="padding:10px 16px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;
                    background:transparent;border:1px solid #484f58;color:#8b949e;transition:.15s"
                    onmouseover="this.style.borderColor='#f85149';this.style.color='#f85149'"
                    onmouseout="this.style.borderColor='#484f58';this.style.color='#8b949e'">
                    ✕ Reset
                </button>` : ''}
            </div>
        </div>`;
    },

    // Progression helpers — mutate pending and re-render the tab
    _progAdj(stat, delta) {
        if (!Panels._progPending) Panels._progPending = { atk:0, def:0, mo:0, md:0, speed:0, luck:0 };
        const pend  = Panels._progPending;
        const pts   = Panels.charFull?.unspentPoints || 0;
        const spent = Object.values(pend).reduce((a,b)=>a+b,0);
        if (delta > 0 && spent >= pts) return;
        pend[stat] = Math.max(0, (pend[stat] || 0) + delta);
        Panels.openCharacter('progression');
    },

    _progReset() {
        Panels._progPending = { atk:0, def:0, mo:0, md:0, speed:0, luck:0 };
        Panels.openCharacter('progression');
    },

    async _progCommit() {
        const pend  = Panels._progPending || {};
        const spend = {};
        Object.entries(pend).forEach(([k, v]) => { if (v > 0) spend[k] = v; });
        if (!Object.keys(spend).length) return;

        const r = await fetch('/api/progression/level-up', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterId: Game.myCharId, spend })
        });
        const j = await r.json();
        if (j.success) {
            showNotification(`✅ Stats upgraded! ${j.data.remaining_points} points left.`, 'item');
            Panels._progPending = null;
            await Panels.openCharacter('progression');
            loadCharData();
        } else {
            showNotification(j.error || 'Could not spend points', 'damage');
        }
    },

    // Tab switch (re-renders in place without re-fetching)
    _charTabSwitch(tab) {
        if (!Panels.charFull) return;
        if (tab === 'progression') Panels._progPending = null;
        const overlay = document.getElementById('panelOverlay');
        if (overlay) overlay.innerHTML = PanelsInventory._charSheetHTML(Panels.charFull, tab);
    },

    // =============================================================
    // ITEM ACTIONS
    // =============================================================
    async itemAction(itemId, name, type, slot) {
        if (type === 'CONSUMABLE') {
            if (!confirm(`Use ${name}?`)) return;
            const r = await fetch('/use-item', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ charId: Game.myCharId, itemId })
            });
            const j = await r.json();
            if (j.success) {
                showNotification(j.message || `Used ${name}`, j.hpRestored ? 'heal' : 'item');
                if (typeof loadCharData === 'function') loadCharData();
                await Panels.openInventory();
            } else {
                showNotification(j.message || 'Cannot use item.', 'damage');
            }
        } else if (slot && slot !== 'NONE') {
            const r = await fetch('/equip-item', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ charId: Game.myCharId, itemId, slotKey: slot })
            });
            const j = await r.json();
            if (j.success) {
                showNotification(`Equipped ${name}`, 'item');
                await Panels.openInventory();
            } else {
                showNotification(j.message || 'Cannot equip', 'damage');
            }
        }
    },
};
