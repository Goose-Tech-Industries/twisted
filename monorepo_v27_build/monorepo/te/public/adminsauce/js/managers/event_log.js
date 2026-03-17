// =================================================================
// EVENT LOG / AUDIT TRAIL
// Searchable, filterable feed of all logged game events.
// =================================================================
const EventLog = {
    _data: [],
    _filter: { type: '', actor: '' },

    async init() {
        document.getElementById('managerTitle').textContent = '🔔 Event Log';
        EventLog._renderShell();
        await EventLog._load();
    },

    _renderShell() {
        document.getElementById('dynamicArea').innerHTML = `
<style>
.el-row      { display:grid;grid-template-columns:140px 120px 1fr 1fr 1fr;gap:8px;
               align-items:center;padding:9px 14px;border-bottom:1px solid #161b22;
               font-size:12px;transition:.1s }
.el-row:hover{ background:rgba(255,255,255,.025) }
.el-head     { display:grid;grid-template-columns:140px 120px 1fr 1fr 1fr;gap:8px;
               padding:8px 14px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;
               color:#484f58;border-bottom:1px solid #21262d }
.el-badge    { display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap }
.el-chip-battle   { background:rgba(248,81,73,.12);color:#f85149 }
.el-chip-gm       { background:rgba(187,134,252,.12);color:#bb86fc }
.el-chip-level    { background:rgba(63,185,80,.12);color:#3fb950 }
.el-chip-map      { background:rgba(66,165,245,.12);color:#42A5F5 }
.el-chip-default  { background:rgba(255,255,255,.05);color:#484f58 }
</style>

<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:gap">
    <div>
        <h2 style="margin:0;color:#bb86fc">🔔 Event Log</h2>
        <div style="font-size:11px;color:#484f58;margin-top:2px">Audit trail — battles, GM actions, level-ups, map edits</div>
    </div>
    <button class="action-btn" onclick="EventLog._load()" style="padding:8px 14px;font-size:12px">↺ Refresh</button>
</div>

<!-- FILTERS -->
<div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
    <select id="el_type_filter" onchange="EventLog._applyFilter()" style="width:auto">
        <option value="">All Event Types</option>
        <option value="battle_end">⚔️ Battle End</option>
        <option value="level_up">⬆️ Level Up</option>
        <option value="gm_ban">🚫 GM Ban</option>
        <option value="gm_unban">✅ GM Unban</option>
        <option value="gm_give_gold">💰 GM Give Gold</option>
        <option value="gm_role_change">🎭 GM Role Change</option>
        <option value="map_connection_edit">🗺️ Map Edit</option>
    </select>
    <input id="el_actor_filter" placeholder="Filter by actor name…" style="width:200px"
        oninput="EventLog._applyFilter()">
    <select id="el_limit" onchange="EventLog._load()" style="width:auto">
        <option value="50">50 rows</option>
        <option value="100" selected>100 rows</option>
        <option value="250">250 rows</option>
        <option value="500">500 rows</option>
    </select>
    <div id="el_count" style="font-size:11px;color:#484f58;margin-left:auto"></div>
</div>

<!-- TABLE -->
<div style="background:#0d1117;border:1px solid #21262d;border-radius:10px;overflow:hidden">
    <div class="el-head">
        <span>Time</span><span>Event</span><span>Actor</span><span>Target</span><span>Detail</span>
    </div>
    <div id="el_tbody" style="max-height:65vh;overflow-y:auto">
        <div style="color:#484f58;text-align:center;padding:40px">Loading…</div>
    </div>
</div>`;
    },

    async _load() {
        const type  = document.getElementById('el_type_filter')?.value || '';
        const actor = document.getElementById('el_actor_filter')?.value || '';
        const limit = document.getElementById('el_limit')?.value || 100;

        const params = new URLSearchParams({ limit });
        if (type)  params.set('type', type);
        if (actor) params.set('actorName', actor);

        const r = await fetch('/admin-panel/event-log?' + params);
        const d = await r.json();

        if (d.note) {
            document.getElementById('el_tbody').innerHTML =
                `<div style="color:#d29922;text-align:center;padding:30px;font-size:13px">
                    ⚠️ ${d.note}</div>`;
            return;
        }
        if (!d.success) {
            document.getElementById('el_tbody').innerHTML =
                `<div style="color:#f85149;padding:20px">${d.message}</div>`;
            return;
        }

        EventLog._data = d.data;
        EventLog._renderRows(d.data);
    },

    _applyFilter() {
        const type  = document.getElementById('el_type_filter')?.value || '';
        const actor = (document.getElementById('el_actor_filter')?.value || '').toLowerCase();
        const filtered = EventLog._data.filter(ev => {
            if (type  && ev.event_type !== type) return false;
            if (actor && !(ev.actor_name || '').toLowerCase().includes(actor)) return false;
            return true;
        });
        EventLog._renderRows(filtered);
    },

    _chipClass(type) {
        if (type.startsWith('battle'))   return 'el-chip-battle';
        if (type.startsWith('gm'))       return 'el-chip-gm';
        if (type === 'level_up')         return 'el-chip-level';
        if (type.startsWith('map'))      return 'el-chip-map';
        return 'el-chip-default';
    },

    _icon(type) {
        const map = {
            battle_end: '⚔️', level_up: '⬆️', gm_ban: '🚫', gm_unban: '✅',
            gm_give_gold: '💰', gm_role_change: '🎭', map_connection_edit: '🗺️',
            gm_kick: '⚡'
        };
        return map[type] || '🔔';
    },

    _detail(ev) {
        try {
            const d = ev.detail_json
                ? (typeof ev.detail_json === 'string' ? JSON.parse(ev.detail_json) : ev.detail_json)
                : {};
            if (ev.event_type === 'battle_end')
                return `+${d.gold || 0}g · +${d.xp || 0}xp · beat ${d.loserName || '—'}`;
            if (ev.event_type === 'level_up')
                return `→ Level ${d.new_level || '?'}`;
            if (ev.event_type === 'gm_ban')
                return d.reason ? `"${d.reason}"` : '—';
            if (ev.event_type === 'gm_give_gold')
                return `${d.amount > 0 ? '+' : ''}${d.amount}g`;
            if (ev.event_type === 'gm_role_change')
                return `→ ${d.role}`;
            if (ev.event_type === 'map_connection_edit')
                return `${d.event_count} events saved`;
            return JSON.stringify(d).slice(0, 60);
        } catch { return '—'; }
    },

    _renderRows(rows) {
        const el = document.getElementById('el_tbody');
        const count = document.getElementById('el_count');
        if (count) count.textContent = `${rows.length} event${rows.length !== 1 ? 's' : ''}`;

        if (!rows.length) {
            el.innerHTML = '<div style="color:#484f58;text-align:center;padding:40px">No events found.</div>';
            return;
        }

        el.innerHTML = rows.map(ev => {
            const when = new Date(ev.created_at).toLocaleString(undefined, {
                month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            return `<div class="el-row">
                <span style="color:#484f58;font-size:11px;font-family:monospace">${when}</span>
                <span><span class="el-badge ${EventLog._chipClass(ev.event_type)}">
                    ${EventLog._icon(ev.event_type)} ${ev.event_type}
                </span></span>
                <span style="color:#e8eef6">${ev.actor_name || '—'}</span>
                <span style="color:#8b949e">${ev.target_name || '—'}</span>
                <span style="color:#484f58;font-size:11px">${EventLog._detail(ev)}</span>
            </div>`;
        }).join('');
    }
};
