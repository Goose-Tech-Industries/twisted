// =================================================================
// ACHIEVEMENT MANAGER  v1.0
// AdminSauce panel for managing game_achievements
// =================================================================
// TEACHING: This is the admin panel for the achievement system.
// Admins can:
//   - See all achievement definitions at a glance
//   - Edit any achievement: name, description, icon, trigger type,
//     threshold, gold reward, and the title it unlocks
//   - Create new custom achievements
//   - Delete achievements (does NOT strip already-earned ones from
//     players — historical records stay in character_achievements)
//   - Toggle active/inactive without deleting
//   - Mark achievements as "hidden" (show as ??? until earned)
//
// Triggers are evaluated server-side. Here we just configure when
// they fire and what threshold they need. The server does the math.
// =================================================================

const AchievementManager = {
    _data: [],

    TRIGGER_LABELS: {
        pvp_wins:       '⚔️ PvP Wins',
        pve_wins:       '👹 PvE Wins (Battles)',
        quests_done:    '📜 Quests Completed',
        maps_visited:   '🗺️ Maps Discovered',
        level_reached:  '📈 Level Reached',
        login_streak:   '📅 Login Streak (Days)',
        gold_owned:     '💰 Gold Accumulated',
        battles_total:  '⚔️ Total Battles (Win+Loss)',
        manual:         '🔧 Manual (Admin Only)',
    },

    CAT_LABELS: {
        combat:      '⚔️ Combat',
        exploration: '🗺️ Exploration',
        progression: '📈 Progression',
        social:      '👥 Social',
        other:       '⭐ Other',
    },

    // ── Init ──────────────────────────────────────────────────────
    init: async () => {
        document.getElementById('pageTitle').innerText = '🎖️ ACHIEVEMENT EDITOR';
        const panel = document.getElementById('mainPanel');
        panel.innerHTML = '<div style="color:#484f58;padding:20px">Loading achievements…</div>';
        try {
            const r = await fetch('/api/achievements/definitions');
            const d = await r.json();
            AchievementManager._data = d.success ? d.data : [];
        } catch(e) {
            AchievementManager._data = [];
        }
        AchievementManager.render();
    },

    // ── Render list ───────────────────────────────────────────────
    render() {
        const defs = AchievementManager._data;

        // Group by category
        const groups = {};
        for (const def of defs) {
            if (!groups[def.category]) groups[def.category] = [];
            groups[def.category].push(def);
        }

        let h = `
        <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;align-items:center">
            <button class="action-btn save-btn" onclick="AchievementManager.edit()">+ NEW ACHIEVEMENT</button>
            <span style="color:#484f58;font-size:11px">${defs.length} achievement${defs.length !== 1 ? 's' : ''} defined</span>
        </div>`;

        if (!defs.length) {
            h += `<div style="color:#484f58;text-align:center;padding:40px">
                No achievements yet. Click <b>+ NEW ACHIEVEMENT</b> to add your first one.
            </div>`;
        } else {
            for (const [cat, catDefs] of Object.entries(groups)) {
                h += `<div style="margin-bottom:24px">
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#484f58;
                    padding:6px 0;border-bottom:1px solid #21262d;margin-bottom:10px">
                    ${AchievementManager.CAT_LABELS[cat] || cat}
                </div>
                <table><thead><tr>
                    <th style="width:36px"></th>
                    <th>Achievement</th><th>Trigger</th><th>Threshold</th>
                    <th>Reward</th><th>Title</th><th style="width:80px">Status</th>
                    <th>Actions</th>
                </tr></thead><tbody>`;

                for (const def of catDefs) {
                    const trigLabel = AchievementManager.TRIGGER_LABELS[def.trigger_type] || def.trigger_type;
                    h += `<tr style="${def.is_active ? '' : 'opacity:.45'}">
                        <td style="font-size:20px;text-align:center">${def.icon || '🏆'}</td>
                        <td>
                            <b>${esc(def.title)}</b>
                            ${def.is_hidden ? '<span class="tag" style="font-size:9px;margin-left:4px">HIDDEN</span>' : ''}
                            <div style="font-size:10px;color:var(--td)">${esc(def.description || '')}</div>
                        </td>
                        <td style="font-size:11px;color:var(--td)">${esc(trigLabel)}</td>
                        <td style="font-weight:bold;color:#bb86fc">${def.trigger_value}</td>
                        <td style="color:#ffaa00">${def.reward_gold ? def.reward_gold + 'g' : '—'}</td>
                        <td style="color:#03dac6;font-size:11px">${def.reward_title ? '[' + esc(def.reward_title) + ']' : '—'}</td>
                        <td><span class="tag ${def.is_active ? 'tag-green' : ''}">${def.is_active ? '✅ Active' : '⛔ Off'}</span></td>
                        <td>
                            <button class="edit-btn" onclick="AchievementManager.edit(${def.id})">Edit</button>
                            <button class="edit-btn" style="color:#f85149" onclick="AchievementManager.del(${def.id},'${esc(def.title)}')">Del</button>
                        </td>
                    </tr>`;
                }
                h += `</tbody></table></div>`;
            }
        }

        document.getElementById('mainPanel').innerHTML = h;
    },

    // ── Edit form ─────────────────────────────────────────────────
    edit(id) {
        const def = id ? AchievementManager._data.find(d => d.id === id) : null;
        const v = def || {
            key_name: '', title: '', description: '', icon: '🏆',
            category: 'combat', trigger_type: 'pvp_wins', trigger_value: 1,
            reward_gold: 0, reward_title: '', is_hidden: 0, is_active: 1, sort_order: 0
        };

        const trigOptions = Object.entries(AchievementManager.TRIGGER_LABELS).map(
            ([k, label]) => `<option value="${k}" ${v.trigger_type === k ? 'selected' : ''}>${label}</option>`
        ).join('');

        const catOptions = Object.entries(AchievementManager.CAT_LABELS).map(
            ([k, label]) => `<option value="${k}" ${v.category === k ? 'selected' : ''}>${label}</option>`
        ).join('');

        const form = `
        <div class="form-container">
            <h2 style="margin-bottom:20px;color:var(--a)">${id ? '✏️ Edit Achievement' : '+ New Achievement'}</h2>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
                <div class="form-group">
                    <label>Key Name <span style="color:#484f58;font-size:10px">(unique ID, no spaces)</span></label>
                    <input type="text" id="af_key" value="${esc(v.key_name)}" placeholder="e.g. first_blood">
                </div>
                <div class="form-group">
                    <label>Icon <span style="color:#484f58;font-size:10px">(emoji)</span></label>
                    <input type="text" id="af_icon" value="${esc(v.icon)}" style="font-size:20px;width:60px">
                </div>
                <div class="form-group" style="grid-column:1/-1">
                    <label>Title</label>
                    <input type="text" id="af_title" value="${esc(v.title)}" placeholder="Achievement display name">
                </div>
                <div class="form-group" style="grid-column:1/-1">
                    <label>Description <span style="color:#484f58;font-size:10px">(shown to players)</span></label>
                    <input type="text" id="af_desc" value="${esc(v.description || '')}" placeholder="What must the player do?">
                </div>
                <div class="form-group">
                    <label>Category</label>
                    <select id="af_cat">${catOptions}</select>
                </div>
                <div class="form-group">
                    <label>Sort Order</label>
                    <input type="number" id="af_sort" value="${v.sort_order || 0}" min="0">
                </div>
            </div>

            <h3 style="margin:20px 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:#484f58">
                🎯 Trigger — when does this award?
            </h3>
            <div style="display:grid;grid-template-columns:2fr 1fr;gap:14px">
                <div class="form-group">
                    <label>Trigger Event</label>
                    <select id="af_trigger">${trigOptions}</select>
                </div>
                <div class="form-group">
                    <label>Threshold Value <span style="color:#484f58;font-size:10px">(e.g. 100 for 100 wins)</span></label>
                    <input type="number" id="af_val" value="${v.trigger_value}" min="1">
                </div>
            </div>

            <h3 style="margin:20px 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:#484f58">
                🎁 Reward — what does the player get?
            </h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
                <div class="form-group">
                    <label>Gold Reward</label>
                    <input type="number" id="af_gold" value="${v.reward_gold || 0}" min="0">
                </div>
                <div class="form-group">
                    <label>Title Unlocked <span style="color:#484f58;font-size:10px">(shown in chat — leave blank for none)</span></label>
                    <input type="text" id="af_rtitle" value="${esc(v.reward_title || '')}" placeholder="e.g. Centurion">
                </div>
            </div>

            <h3 style="margin:20px 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:#484f58">
                ⚙️ Flags
            </h3>
            <div style="display:flex;gap:20px;flex-wrap:wrap">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
                    <input type="checkbox" id="af_active" ${v.is_active ? 'checked' : ''}>
                    Active (players can earn this)
                </label>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
                    <input type="checkbox" id="af_hidden" ${v.is_hidden ? 'checked' : ''}>
                    Hidden (shows as ??? until earned)
                </label>
            </div>

            <div style="display:flex;gap:10px;margin-top:24px">
                <button class="action-btn save-btn" onclick="AchievementManager.save(${id || 'null'})">
                    ${id ? '💾 SAVE CHANGES' : '✅ CREATE'}
                </button>
                <button class="action-btn" onclick="AchievementManager.init()">CANCEL</button>
            </div>
        </div>`;

        document.getElementById('mainPanel').innerHTML = form;
    },

    // ── Save ──────────────────────────────────────────────────────
    save: async (id) => {
        const body = {
            id:            id || null,
            key_name:      document.getElementById('af_key').value.trim().replace(/\s+/g,'_').toLowerCase(),
            title:         document.getElementById('af_title').value.trim(),
            description:   document.getElementById('af_desc').value.trim(),
            icon:          document.getElementById('af_icon').value.trim() || '🏆',
            category:      document.getElementById('af_cat').value,
            trigger_type:  document.getElementById('af_trigger').value,
            trigger_value: parseInt(document.getElementById('af_val').value) || 1,
            reward_gold:   parseInt(document.getElementById('af_gold').value) || 0,
            reward_title:  document.getElementById('af_rtitle').value.trim() || null,
            is_active:     document.getElementById('af_active').checked ? 1 : 0,
            is_hidden:     document.getElementById('af_hidden').checked ? 1 : 0,
            sort_order:    parseInt(document.getElementById('af_sort').value) || 0,
        };

        if (!body.key_name || !body.title) {
            alert('Key name and title are required.'); return;
        }

        try {
            const r = await fetch('/api/achievements/save', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const d = await r.json();
            if (d.success) { AchievementManager.init(); }
            else           { alert('Error: ' + (d.message || 'Unknown error')); }
        } catch(e) { alert('Network error.'); }
    },

    // ── Delete ────────────────────────────────────────────────────
    del: async (id, name) => {
        if (!confirm(`Delete achievement "${name}"?\n\nPlayers who already earned it keep their record, but no new players can earn it.`)) return;
        try {
            const r = await fetch('/api/achievements/delete', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            const d = await r.json();
            if (d.success) AchievementManager.init();
            else alert('Error: ' + d.message);
        } catch { alert('Network error.'); }
    },
};

function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/'/g,'&#39;').replace(/"/g,'&quot;');
}
