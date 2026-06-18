// =================================================================
// GM NOTEPAD — shared staff notes, global + per-map
// =================================================================
const GmNotes = {
    _maps:     [],
    _activeTab: 'global',  // 'global' or a mapId string
    _notes:    [],

    async init() {
        document.getElementById('managerTitle').textContent = '📝 GM Notepad';
        const r = await API.getAll('map').catch(() => ({ success: false }));
        GmNotes._maps = r.success ? r.data : [];
        GmNotes._render();
        GmNotes._loadNotes();
    },

    _render() {
        const mapOpts = GmNotes._maps
            .map(m => `<option value="${m.id}">${m.name}</option>`).join('');

        document.getElementById('dynamicArea').innerHTML = `
<style>
.gmn-tabs   { display:flex;gap:4px;margin-bottom:20px;flex-wrap:wrap }
.gmn-tab    { padding:7px 14px;border-radius:6px;cursor:pointer;font-size:12px;
              font-weight:600;border:1px solid #21262d;background:#0d1117;color:#484f58;
              transition:.15s }
.gmn-tab.active { background:#bb86fc;color:#000;border-color:#bb86fc }
.gmn-tab:hover:not(.active) { border-color:#484f58;color:#e8eef6 }
.gmn-note   { background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:14px 16px;
              margin-bottom:10px;transition:.15s }
.gmn-note.pinned { border-color:#d29922;background:rgba(210,153,34,.04) }
.gmn-note:hover { border-color:#30363d }
.gmn-meta   { font-size:11px;color:#484f58;margin-bottom:6px;display:flex;gap:10px;align-items:center }
.gmn-body   { color:#c9d1d9;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word }
.gmn-actions{ display:flex;gap:6px;margin-top:8px }
.gmn-btn    { background:transparent;border:1px solid #21262d;color:#484f58;
              border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;transition:.15s }
.gmn-btn:hover { border-color:#8b949e;color:#e8eef6 }
.gmn-btn.pin-active { color:#d29922;border-color:#d29922 }
.gmn-compose{ background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:18px;margin-bottom:20px }
.char-count { font-size:10px;color:#484f58;text-align:right;margin-top:4px }
</style>

<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
    <div>
        <h2 style="margin:0;color:#bb86fc">📝 GM Notepad</h2>
        <div style="font-size:11px;color:#484f58;margin-top:2px">Shared notes visible to all staff. Pin important ones to keep them at the top.</div>
    </div>
    <button class="edit-btn" onclick="GmNotes._loadNotes()" style="font-size:11px;padding:6px 12px">↺ Refresh</button>
</div>

<!-- COMPOSE -->
<div class="gmn-compose">
    <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#484f58;margin-bottom:10px">✏️ New Note</div>
    <textarea id="gmn_body" rows="3" placeholder="e.g. Don't touch map 7 — active testing. NPC respawn bug on Thornfield — investigating."
        style="resize:vertical;margin-bottom:8px"
        oninput="document.getElementById('gmn_cc').textContent=this.value.length+'/2000 chars'"></textarea>
    <div class="char-count" id="gmn_cc">0/2000 chars</div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap">
        <label style="font-size:12px;color:#8b949e">Scope:</label>
        <select id="gmn_scope" style="width:auto" onchange="GmNotes._toggleMapSelect()">
            <option value="global">🌍 Global (all maps)</option>
            <option value="map">🗺️ Specific Map</option>
        </select>
        <select id="gmn_map_id" style="width:auto;display:none">${mapOpts}</select>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#8b949e;cursor:pointer">
            <input type="checkbox" id="gmn_pin"> 📌 Pin this note
        </label>
        <button class="action-btn save-btn" onclick="GmNotes._post()" style="margin-left:auto">Post Note</button>
    </div>
</div>

<!-- TABS -->
<div class="gmn-tabs">
    <div class="gmn-tab active" id="gmn_tab_global" onclick="GmNotes._switchTab('global')">🌍 Global</div>
    ${GmNotes._maps.slice(0,12).map(m =>
        `<div class="gmn-tab" id="gmn_tab_${m.id}" onclick="GmNotes._switchTab('${m.id}')">${m.name}</div>`
    ).join('')}
    ${GmNotes._maps.length > 12 ? `<div class="gmn-tab" onclick="GmNotes._allMapsModal()">+${GmNotes._maps.length-12} more…</div>` : ''}
</div>

<!-- NOTES LIST -->
<div id="gmn_list">
    <p style="color:#484f58;text-align:center;padding:30px">Loading notes…</p>
</div>`;
    },

    _toggleMapSelect() {
        const scope = document.getElementById('gmn_scope')?.value;
        const mapSel = document.getElementById('gmn_map_id');
        if (mapSel) mapSel.style.display = scope === 'map' ? '' : 'none';
    },

    async _switchTab(key) {
        GmNotes._activeTab = key;
        document.querySelectorAll('.gmn-tab').forEach(t => t.classList.remove('active'));
        document.getElementById(`gmn_tab_${key}`)?.classList.add('active');
        await GmNotes._loadNotes();
    },

    async _loadNotes() {
        const mapId = GmNotes._activeTab === 'global' ? 0 : parseInt(GmNotes._activeTab);
        const r = await fetch(`/admin-panel/notes?mapId=${mapId}`);
        const d = await r.json();
        const el = document.getElementById('gmn_list');
        if (!el) return;

        if (!d.success) { el.innerHTML = `<p style="color:#f85149">${d.message}</p>`; return; }
        GmNotes._notes = d.data;

        if (!d.data.length) {
            el.innerHTML = `<div style="text-align:center;padding:40px;color:#484f58">
                <div style="font-size:24px;margin-bottom:8px">📋</div>
                No notes yet for this scope. Post one above!
            </div>`;
            return;
        }

        el.innerHTML = d.data.map(n => {
            const when = new Date(n.created_at).toLocaleString(undefined, {
                month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'
            });
            const mapLabel = n.map_id
                ? GmNotes._maps.find(m => m.id === n.map_id)?.name || `Map #${n.map_id}`
                : '🌍 Global';
            return `<div class="gmn-note ${n.pinned ? 'pinned' : ''}" id="gmn_note_${n.id}">
                <div class="gmn-meta">
                    ${n.pinned ? '<span style="color:#d29922">📌 PINNED</span>' : ''}
                    <span><b style="color:#bb86fc">${n.author}</b></span>
                    <span>${when}</span>
                    <span style="background:#161b22;padding:2px 6px;border-radius:4px">${mapLabel}</span>
                </div>
                <div class="gmn-body">${GmNotes._esc(n.body)}</div>
                <div class="gmn-actions">
                    <button class="gmn-btn ${n.pinned ? 'pin-active' : ''}" onclick="GmNotes._pin(${n.id})">
                        ${n.pinned ? '📌 Unpin' : '📌 Pin'}
                    </button>
                    <button class="gmn-btn" onclick="GmNotes._delete(${n.id})"
                        style="color:#f85149;border-color:rgba(248,81,73,.3)">🗑 Delete</button>
                </div>
            </div>`;
        }).join('');
    },

    async _post() {
        const body   = document.getElementById('gmn_body')?.value?.trim();
        const scope  = document.getElementById('gmn_scope')?.value;
        const mapId  = scope === 'map' ? document.getElementById('gmn_map_id')?.value : null;
        const pinned = document.getElementById('gmn_pin')?.checked ? 1 : 0;

        if (!body) return alert('Write something first.');
        if (body.length > 2000) return alert('Note too long (max 2000 chars).');

        const r = await fetch('/admin-panel/notes', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body, mapId: mapId ? parseInt(mapId) : null, pinned })
        });
        const d = await r.json();
        if (d.success) {
            document.getElementById('gmn_body').value = '';
            document.getElementById('gmn_cc').textContent = '0/2000 chars';
            // Switch to the tab where the note was posted
            const targetTab = mapId ? String(mapId) : 'global';
            await GmNotes._switchTab(targetTab);
        } else alert('Failed: ' + d.message);
    },

    async _pin(id) {
        await fetch(`/admin-panel/notes/${id}/pin`, { method: 'POST' });
        GmNotes._loadNotes();
    },

    async _delete(id) {
        if (!confirm('Delete this note?')) return;
        await fetch(`/admin-panel/notes/${id}`, { method: 'DELETE' });
        GmNotes._loadNotes();
    },

    _esc(str) {
        return String(str)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;');
    }
};
