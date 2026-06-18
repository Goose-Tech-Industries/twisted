// =================================================================
// BLOOD OGHAM MANAGER — Define and manage Blood Oghams
// =================================================================
// Blood Oghams are carved runes that slot into weapon/armor
// Ogham Grooves. They level up through kills, granting stronger
// magic with each rank: Carved → Inscribed → Bloodbound.
//
// WHAT THIS MANAGES:
//   - Creating/editing Blood Ogham definitions
//   - Setting what each Ogham grants (element, skill, stat, status)
//   - Defining rank-up chains (rank 1 → rank 2 → rank 3)
//   - Viewing which Oghams exist at each rank
// =================================================================
const OghamManager = {
    _data: [],
    _skills: [],
    _statuses: [],
    _elements: [],
    _families: [],

    init: async () => {
        document.getElementById('pageTitle').innerText = '🩸 BLOOD OGHAM';
        const [od, sd, std, ed, fd] = await Promise.all([
            API.getAll('ogham'), API.getAll('skill'),
            API.getAll('status'), API.getAll('element'), API.getAll('ogham_family')
        ]);
        OghamManager._data     = od.success  ? od.data  : [];
        OghamManager._skills   = sd.success  ? sd.data  : [];
        OghamManager._statuses = std.success ? std.data : [];
        OghamManager._elements = ed.success  ? ed.data  : [];
        OghamManager._families = fd.success  ? fd.data  : [];
        OghamManager.renderList();
    },

    renderList: () => {
        const d = OghamManager._data;
        // Group by base_ogham_id to show rank chains
        const roots = d.filter(o => !o.base_ogham_id);
        const byBase = {};
        d.filter(o => o.base_ogham_id).forEach(o => {
            byBase[o.base_ogham_id] = byBase[o.base_ogham_id] || [];
            byBase[o.base_ogham_id].push(o);
        });

        const RANK_LABELS = {1:'Carved', 2:'Inscribed', 3:'Bloodbound'};
        const RANK_COLORS = {1:'#c0392b', 2:'#8e44ad', 3:'#f39c12'};

        let h = `
        <button class="action-btn save-btn" onclick="OghamManager.edit()">+ NEW BLOOD OGHAM</button>
        <p style="color:var(--td);font-size:12px;margin:10px 0 20px;line-height:1.6">
            Blood Oghams are carved prayers etched into Ogham Grooves. Each Ogham can grant an
            elemental attack, a status effect on hit, bonus stats, or unlock a skill while equipped.
            They deepen in power as their wielder takes lives — <b style="color:#c0392b">Carved</b>
            becomes <b style="color:#8e44ad">Inscribed</b> becomes
            <b style="color:#f39c12">Bloodbound</b>.
        </p>`;

        if (!roots.length) {
            h += '<p style="color:var(--td);text-align:center;padding:40px">No Blood Oghams defined yet.</p>';
        } else {
            roots.forEach(root => {
                const chain = [root, ...(byBase[root.id] || []).sort((a,b)=>a.rank-b.rank)];
                h += `<div style="background:var(--bg2);border:1px solid #3a0a0a;border-radius:10px;
                    padding:16px;margin-bottom:16px">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
                        <span style="font-size:24px">${root.icon||'🩸'}</span>
                        <div>
                            <div style="font-weight:700;font-size:16px;color:#e74c3c">${root.name}</div>
                            <div style="color:var(--td);font-size:12px;font-style:italic">${root.description||''}</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">`;
                chain.forEach(og => {
                    const grants = OghamManager._grantSummary(og);
                    h += `<div style="background:var(--bg3);border:1px solid #3a0a0a;border-radius:8px;
                        padding:12px;flex:1;min-width:200px">
                        <div style="color:${RANK_COLORS[og.rank]||'#e74c3c'};font-weight:700;font-size:12px;
                            text-transform:uppercase;margin-bottom:6px">
                            ${RANK_LABELS[og.rank]||'Rank '+og.rank}
                            ${og.kills_to_rank_up ? `<span style="color:#666;font-weight:normal">· ${og.kills_to_rank_up} kills to advance</span>` : ''}
                        </div>
                        <div style="font-size:12px;color:#ccc;margin-bottom:8px">${grants}</div>
                        <div style="display:flex;gap:6px">
                            <button class="edit-btn" style="font-size:11px"
                                onclick='OghamManager.edit(${JSON.stringify(og)})'>EDIT</button>
                            <button class="del-btn" style="font-size:11px"
                                onclick="OghamManager.del(${og.id})">DEL</button>
                        </div>
                    </div>`;
                });
                h += `<button class="edit-btn" style="align-self:center;margin-left:8px;white-space:nowrap"
                    onclick="OghamManager.addRank(${root.id})">+ Add Rank</button>`;
                h += '</div></div>';
            });
        }
        document.getElementById('dynamicArea').innerHTML = h;
    },

    _grantSummary: (og) => {
        const parts = [];
        if (og.element_attack) parts.push(`⚔️ ${og.element_attack} element`);
        if (og.on_hit_status)  parts.push(`💫 ${og.on_hit_chance||20}% → ${og.on_hit_status}`);
        if (og.stat_bonus_json) {
            try {
                const b = typeof og.stat_bonus_json === 'string' ? JSON.parse(og.stat_bonus_json) : og.stat_bonus_json;
                const s = Object.entries(b).map(([k,v])=>`+${v} ${k.toUpperCase()}`).join(', ');
                if (s) parts.push(`📊 ${s}`);
            } catch {}
        }
        if (og.grant_skill_id) {
            const sk = OghamManager._skills.find(s => s.id == og.grant_skill_id);
            parts.push(`✨ Grants: ${sk ? sk.name : '#'+og.grant_skill_id}`);
        }
        if (og.curse_json) {
            try {
                const curse = typeof og.curse_json === 'string' ? JSON.parse(og.curse_json) : og.curse_json;
                parts.push(`🔴 CURSE: ${curse.chance||100}% → ${curse.status} (${curse.turns||1}t) on wielder`);
            } catch {}
        }
        if (og.family_id) {
            const fam = OghamManager._families.find(f => f.id == og.family_id);
            if (fam) parts.push(`🔗 Family: ${fam.icon||''} ${fam.name}`);
        }
        return parts.join('<br>') || '<span style="color:#555">No effect defined</span>';
    },

    edit: async (item) => {
        const d = item || {};
        const isNew = !d.id;
        const RANK_LABELS = {1:'Carved (Rank 1)', 2:'Inscribed (Rank 2)', 3:'Bloodbound (Rank 3)'};

        const elemOpts = OghamManager._elements.map(e =>
            `<option value="${e.name}" ${d.element_attack===e.name?'selected':''}>${e.icon||''} ${e.name}</option>`
        ).join('');

        const statusOpts = OghamManager._statuses.map(s =>
            `<option value="${s.name}" ${d.on_hit_status===s.name?'selected':''}>${s.icon||''} ${s.name}</option>`
        ).join('');

        const skillOpts = OghamManager._skills.map(s =>
            `<option value="${s.id}" ${d.grant_skill_id==s.id?'selected':''}>${s.icon||''} ${s.name}</option>`
        ).join('');

        const rootOpts = OghamManager._data.filter(o => !o.base_ogham_id && o.id !== d.id).map(o =>
            `<option value="${o.id}" ${d.base_ogham_id==o.id?'selected':''}>${o.icon||'🩸'} ${o.name}</option>`
        ).join('');

        const statBonus = (() => {
            try { return typeof d.stat_bonus_json === 'string' ? JSON.parse(d.stat_bonus_json||'{}') : (d.stat_bonus_json||{}); }
            catch { return {}; }
        })();

        document.getElementById('dynamicArea').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;color:#e74c3c">${isNew ? '🩸 New Blood Ogham' : '✏️ Edit: ' + d.name}</h3>
            <div style="display:flex;gap:8px">
                <button class="action-btn save-btn" onclick="OghamManager.save(${d.id||'null'})">💾 SAVE</button>
                <button class="edit-btn" onclick="OghamManager.init()">CANCEL</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label>Name</label><input id="og_name" value="${d.name||''}"></div>
            <div><label>Icon (emoji)</label><input id="og_icon" value="${d.icon||'🩸'}"></div>
            <div><label>Rank</label>
                <select id="og_rank">
                    ${[1,2,3].map(r=>`<option value="${r}" ${d.rank==r?'selected':''}>${RANK_LABELS[r]}</option>`).join('')}
                </select>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div>
                <label>Part of chain (select parent Ogham if this is rank 2 or 3)</label>
                <select id="og_base">
                    <option value="">— This IS the root (rank 1) —</option>
                    ${rootOpts}
                </select>
            </div>
            <div><label>Kills needed to advance to next rank (0 = max rank)</label>
                <input type="number" id="og_kills" value="${d.kills_to_rank_up||50}" min="0">
            </div>
        </div>

        <label>Description</label>
        <input id="og_desc" value="${d.description||''}" style="margin-bottom:8px">
        <label>Lore Text (shown to player when they find it)</label>
        <textarea id="og_lore" rows="2" style="margin-bottom:16px;font-style:italic">${d.lore_text||''}</textarea>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div>
                <label>Family (for Set Bonuses)</label>
                <select id="og_family">
                    <option value="">— No Family —</option>
                    ${OghamManager._families.map(f =>
                        `<option value="${f.id}" ${d.family_id==f.id?'selected':''}>${f.icon||'🩸'} ${f.name}</option>`
                    ).join('')}
                </select>
            </div>
            <div style="background:rgba(183,28,28,0.1);border:1px solid #3a0a0a;border-radius:6px;padding:10px;font-size:11px;color:#888">
                Equip 2+ Oghams from the same family to activate the set bonus.
                Manage families via the <b style="color:#e74c3c">Families</b> tab.
            </div>
        </div>

        <div style="background:var(--bg2);border:1px solid #3a0a0a;border-radius:8px;padding:16px;margin-bottom:12px">
            <div style="color:#e74c3c;font-weight:700;font-size:13px;margin-bottom:14px">⚡ WHAT THIS OGHAM GRANTS</div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
                <div>
                    <label>Weapon Element (adds this element to attacks)</label>
                    <select id="og_elem">
                        <option value="">— None —</option>
                        ${elemOpts}
                    </select>
                </div>
                <div>
                    <label>Unlock Skill (while this Ogham is slotted)</label>
                    <select id="og_skill">
                        <option value="">— None —</option>
                        ${skillOpts}
                    </select>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
                <div>
                    <label>On-Hit Status Effect</label>
                    <select id="og_status">
                        <option value="">— None —</option>
                        ${statusOpts}
                    </select>
                </div>
                <div>
                    <label>On-Hit Chance %</label>
                    <input type="number" id="og_chance" value="${d.on_hit_chance||20}" min="1" max="100">
                </div>
            </div>

            <div style="background:rgba(183,28,28,0.08);border:1px solid #3a0a0a;border-radius:6px;padding:12px;margin-bottom:14px">
                <div style="color:#e74c3c;font-size:12px;font-weight:700;margin-bottom:8px">🔴 CURSE (optional — afflicts the wielder)</div>
                <p style="color:#666;font-size:11px;margin:0 0 10px">A Cursed Ogham has power, but at a cost. When its on-hit effect fires, the wielder is also afflicted.</p>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end">
                    <div>
                        <label style="font-size:11px">Status inflicted on wielder</label>
                        <select id="og_curse_status">
                            <option value="">— None (no curse) —</option>
                            ${OghamManager._statuses.map(s =>
                                `<option value="${s.name}" ${(()=>{try{const cx=typeof d.curse_json==='string'?JSON.parse(d.curse_json||'{}'):(d.curse_json||{});return cx.status===s.name?'selected':''}catch{return ''}})()}>${s.icon||''} ${s.name}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:11px">Duration (turns)</label>
                        <input type="number" id="og_curse_turns" min="1" max="10"
                            value="${(()=>{try{const cx=typeof d.curse_json==='string'?JSON.parse(d.curse_json||'{}'):(d.curse_json||{});return cx.turns||1}catch{return 1}})()}">
                    </div>
                    <div>
                        <label style="font-size:11px">Curse Chance %</label>
                        <input type="number" id="og_curse_chance" min="1" max="100"
                            value="${(()=>{try{const cx=typeof d.curse_json==='string'?JSON.parse(d.curse_json||'{}'):(d.curse_json||{});return cx.chance||100}catch{return 100}})()}">
                    </div>
                    <div>
                        <label style="font-size:11px">Log Message</label>
                        <input id="og_curse_log" placeholder="{name} pays the debt..."
                            value="${(()=>{try{const cx=typeof d.curse_json==='string'?JSON.parse(d.curse_json||'{}'):(d.curse_json||{});return cx.log||''}catch{return ''}})()}">
                    </div>
                </div>
            </div>

            <div style="margin-top:4px">
                <label style="font-size:12px;color:var(--td)">Bonus Stats (leave 0 for none)</label>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px">
                    ${['atk','def','mo','md','speed','luck','hp','mp'].map(stat =>
                        `<div><label style="font-size:11px;color:var(--td)">${stat.toUpperCase()}</label>
                         <input type="number" id="og_stat_${stat}" value="${statBonus[stat]||0}" style="width:100%"></div>`
                    ).join('')}
                </div>
            </div>
        </div>`;
    },

    addRank: async (rootId) => {
        const root = OghamManager._data.find(o => o.id === rootId);
        if (!root) return;
        const existing = OghamManager._data.filter(o => o.base_ogham_id === rootId);
        const nextRank = existing.length + 2; // root is rank 1, so +1 ranks + 1
        if (nextRank > 3) { alert('Maximum rank is 3 (Bloodbound)'); return; }
        const template = {
            name: root.name + ' Mór',
            icon: root.icon,
            rank: nextRank,
            base_ogham_id: rootId,
            kills_to_rank_up: nextRank < 3 ? 80 : 0
        };
        OghamManager.edit(template);
    },

    save: async (id) => {
        const statBonus = {};
        ['atk','def','mo','md','speed','luck','hp','mp'].forEach(stat => {
            const v = parseInt(document.getElementById(`og_stat_${stat}`)?.value||'0');
            if (v !== 0) statBonus[stat] = v;
        });

        // Collect curse data
        const curseStatus = document.getElementById('og_curse_status')?.value;
        const curseJson = curseStatus ? JSON.stringify({
            status: curseStatus,
            turns:  parseInt(document.getElementById('og_curse_turns')?.value) || 1,
            chance: parseInt(document.getElementById('og_curse_chance')?.value) || 100,
            log:    document.getElementById('og_curse_log')?.value || null
        }) : null;

        const payload = {
            name:           document.getElementById('og_name').value,
            icon:           document.getElementById('og_icon').value,
            rank:           parseInt(document.getElementById('og_rank').value) || 1,
            base_ogham_id:  parseInt(document.getElementById('og_base').value) || null,
            kills_to_rank_up: parseInt(document.getElementById('og_kills').value) || 0,
            description:    document.getElementById('og_desc').value,
            lore_text:      document.getElementById('og_lore').value,
            family_id:      parseInt(document.getElementById('og_family')?.value) || null,
            element_attack: document.getElementById('og_elem').value || null,
            grant_skill_id: parseInt(document.getElementById('og_skill').value) || null,
            on_hit_status:  document.getElementById('og_status').value || null,
            on_hit_chance:  parseInt(document.getElementById('og_chance').value) || 20,
            stat_bonus_json:Object.keys(statBonus).length ? JSON.stringify(statBonus) : null,
            curse_json:     curseJson
        };
        const r = await API.save('ogham', payload, id);
        if (r.success) OghamManager.init(); else alert(r.message || 'Save failed');
    },

    del: async (id) => {
        if (confirm('Delete this Blood Ogham? Characters with it slotted will lose its effects.')) {
            await API.delete('ogham', id);
            OghamManager.init();
        }
    }
};
