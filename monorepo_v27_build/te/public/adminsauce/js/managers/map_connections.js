// =================================================================
// MAP CONNECTION EDITOR
// Visual list of all TELEPORT events across every map.
// Add, edit, or delete warp links without opening the map editor.
// =================================================================
const MapConnections = {
    _maps:        [],   // all active maps
    _connections: [],   // derived warp list from server
    _mapEvents:   {},   // mapId → full collisions_json array (mutable)

    async init() {
        document.getElementById('managerTitle').textContent = '🗺️ Map Connection Editor';
        document.getElementById('dynamicArea').innerHTML =
            '<p style="color:#484f58;text-align:center;padding:40px">Loading map data…</p>';
        await MapConnections._load();
    },

    async _load() {
        const r = await fetch('/admin-panel/map-connections');
        const d = await r.json();
        if (!d.success) {
            document.getElementById('dynamicArea').innerHTML =
                `<p style="color:#f85149;padding:20px">Error: ${d.message}</p>`;
            return;
        }
        MapConnections._maps        = d.maps;
        MapConnections._connections = d.connections;
        // Pre-populate _mapEvents so we can mutate without refetching
        // (connections only contain warp events; we need the full arrays)
        MapConnections._mapEvents = {};
        MapConnections._render();
    },

    _render() {
        const { _maps: maps, _connections: conns } = MapConnections;

        // Group connections by source map
        const byMap = {};
        for (const c of conns) {
            if (!byMap[c.sourceMapId]) byMap[c.sourceMapId] = [];
            byMap[c.sourceMapId].push(c);
        }

        const mapOpts = maps.map(m =>
            `<option value="${m.id}">${m.name} (id:${m.id})</option>`).join('');

        document.getElementById('dynamicArea').innerHTML = `
<style>
.mc-map   { background:#0d1117;border:1px solid #21262d;border-radius:10px;
            padding:16px;margin-bottom:14px }
.mc-head  { display:flex;justify-content:space-between;align-items:center;margin-bottom:12px }
.mc-title { font-size:14px;font-weight:700;color:#e8eef6 }
.mc-sub   { font-size:11px;color:#484f58;margin-top:2px }
.mc-conn  { display:grid;grid-template-columns:80px 80px 24px 1fr 80px 80px auto;
            gap:8px;align-items:center;background:#161b22;border-radius:6px;
            padding:8px 10px;margin-bottom:6px;font-size:12px }
.mc-arrow { color:#484f58;text-align:center }
.mc-coord { font-family:monospace;color:#42A5F5;font-size:11px }
.mc-dest  { color:#bb86fc }
.mc-empty { color:#484f58;font-style:italic;font-size:12px;padding:8px 0 }
</style>

<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <div>
        <h2 style="margin:0;color:#42A5F5">🗺️ Map Connection Editor</h2>
        <div style="font-size:11px;color:#484f58;margin-top:2px">
            ${conns.length} warp connection${conns.length !== 1 ? 's' : ''} across ${maps.length} map${maps.length !== 1 ? 's' : ''}
        </div>
    </div>
    <div style="display:flex;gap:8px">
        <button class="action-btn" style="background:#1565C0;padding:8px 14px;font-size:12px"
            onclick="MapConnections._openAddModal()">+ Add Connection</button>
        <button class="edit-btn" style="padding:8px 14px;font-size:12px"
            onclick="MapConnections._load()">↺ Refresh</button>
    </div>
</div>

<!-- HEADER ROW -->
<div style="display:grid;grid-template-columns:80px 80px 24px 1fr 80px 80px 68px;gap:8px;
    padding:0 10px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#484f58">
    <span>Src X</span><span>Src Y</span><span></span>
    <span>Destination Map</span><span>Dest X</span><span>Dest Y</span><span></span>
</div>

${maps.map(m => {
    const warps = byMap[m.id] || [];
    return `<div class="mc-map">
        <div class="mc-head">
            <div>
                <div class="mc-title">🗺️ ${m.name}</div>
                <div class="mc-sub">ID: ${m.id} · ${m.width}×${m.height} · ${warps.length} warp${warps.length !== 1 ? 's' : ''}</div>
            </div>
            <button class="edit-btn" style="font-size:11px;padding:5px 10px"
                onclick="MapConnections._openAddModal(${m.id})">+ Add Warp</button>
        </div>

        ${warps.length ? warps.map((c, ci) => `
        <div class="mc-conn">
            <span class="mc-coord">x:${c.srcX} y:${c.srcY}</span>
            <span class="mc-coord"></span>
            <span class="mc-arrow">→</span>
            <span class="mc-dest">${c.destMapName}</span>
            <span class="mc-coord">x:${c.destX}</span>
            <span class="mc-coord">y:${c.destY}</span>
            <div style="display:flex;gap:4px">
                <button class="edit-btn" style="font-size:10px;padding:3px 7px"
                    onclick="MapConnections._openEditModal(${m.id},${c.srcX},${c.srcY})">✏️</button>
                <button style="background:transparent;border:1px solid rgba(248,81,73,.3);
                    color:#f85149;border-radius:4px;padding:3px 7px;cursor:pointer;font-size:10px"
                    onclick="MapConnections._deleteWarp(${m.id},${c.srcX},${c.srcY})">✕</button>
            </div>
        </div>`).join('')
        : `<div class="mc-empty">No warps on this map yet.</div>`}
    </div>`;
}).join('')}`;
    },

    // ── Fetch full collisions_json for one map (cached) ────────────
    async _getEvents(mapId) {
        if (MapConnections._mapEvents[mapId]) return MapConnections._mapEvents[mapId];
        const r = await fetch('/admin/get-all', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'map' })
        });
        const d = await r.json();
        if (d.success) {
            for (const m of d.data) {
                try { MapConnections._mapEvents[m.id] = JSON.parse(m.collisions_json || '[]'); }
                catch { MapConnections._mapEvents[m.id] = []; }
            }
        }
        return MapConnections._mapEvents[mapId] || [];
    },

    // ── Save a map's full event list back ─────────────────────────
    async _saveEvents(mapId, events) {
        const r = await fetch('/admin-panel/map-connections/save', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mapId, events })
        });
        return r.json();
    },

    // ── ADD CONNECTION modal ──────────────────────────────────────
    _openAddModal(presetMapId) {
        const maps   = MapConnections._maps;
        const srcOpts = maps.map(m =>
            `<option value="${m.id}" ${m.id == presetMapId ? 'selected' : ''}>${m.name} (id:${m.id})</option>`).join('');
        const dstOpts = maps.map(m => `<option value="${m.id}">${m.name} (id:${m.id})</option>`).join('');

        MapConnections._modal(`
            <h3 style="margin:0 0 16px;color:#42A5F5">🚪 Add Warp Connection</h3>
            <p style="color:#484f58;font-size:12px;margin-bottom:16px">
                Player steps on (Src X, Src Y) on the source map → teleported to destination.
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
                <div>
                    <label>Source Map</label>
                    <select id="mc_src_map">${srcOpts}</select>
                </div>
                <div></div>
                <div><label>Source Tile X</label><input id="mc_src_x" type="number" min="0" value="0"></div>
                <div><label>Source Tile Y</label><input id="mc_src_y" type="number" min="0" value="0"></div>
                <div>
                    <label>Destination Map</label>
                    <select id="mc_dst_map">${dstOpts}</select>
                </div>
                <div></div>
                <div><label>Destination X</label><input id="mc_dst_x" type="number" min="0" value="0"></div>
                <div><label>Destination Y</label><input id="mc_dst_y" type="number" min="0" value="0"></div>
            </div>
            <div style="font-size:11px;color:#484f58;margin-top:10px">
                💡 Tip: If you want a two-way connection, you'll need to add a return warp on the destination map too.
            </div>`,
            async () => {
                const srcMap = parseInt(document.getElementById('mc_src_map').value);
                const srcX   = parseInt(document.getElementById('mc_src_x').value) || 0;
                const srcY   = parseInt(document.getElementById('mc_src_y').value) || 0;
                const dstMap = parseInt(document.getElementById('mc_dst_map').value);
                const dstX   = parseInt(document.getElementById('mc_dst_x').value) || 0;
                const dstY   = parseInt(document.getElementById('mc_dst_y').value) || 0;

                const events = await MapConnections._getEvents(srcMap);
                // Remove any existing warp at same tile
                const cleaned = events.filter(e => !(e.type === 'TELEPORT' && e.x === srcX && e.y === srcY));
                cleaned.push({ x: srcX, y: srcY, type: 'TELEPORT', data: `${dstMap},${dstX},${dstY}` });

                const res = await MapConnections._saveEvents(srcMap, cleaned);
                if (res.success) {
                    MapConnections._mapEvents[srcMap] = cleaned;
                    document.querySelector('.mc-modal-wrap')?.remove();
                    await MapConnections._load();
                } else alert('Save failed: ' + res.message);
            }
        );
    },

    // ── EDIT CONNECTION modal ─────────────────────────────────────
    async _openEditModal(mapId, srcX, srcY) {
        const events = await MapConnections._getEvents(mapId);
        const warp   = events.find(e => e.type === 'TELEPORT' && e.x === srcX && e.y === srcY);
        if (!warp) { alert('Warp not found. Try refreshing.'); return; }

        const parts  = String(warp.data || '').split(',');
        const dstMap = parts[0] || '';
        const dstX   = parseInt(parts[1]) || 0;
        const dstY   = parseInt(parts[2]) || 0;
        const maps   = MapConnections._maps;
        const dstOpts = maps.map(m =>
            `<option value="${m.id}" ${String(m.id) === dstMap ? 'selected' : ''}>${m.name} (id:${m.id})</option>`).join('');
        const srcName = maps.find(m => m.id === mapId)?.name || `Map #${mapId}`;

        MapConnections._modal(`
            <h3 style="margin:0 0 16px;color:#42A5F5">✏️ Edit Warp on ${srcName}</h3>
            <p style="color:#484f58;font-size:12px;margin-bottom:16px">Tile (${srcX}, ${srcY})</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
                <div>
                    <label>Destination Map</label>
                    <select id="mc_dst_map">${dstOpts}</select>
                </div>
                <div></div>
                <div><label>Destination X</label><input id="mc_dst_x" type="number" min="0" value="${dstX}"></div>
                <div><label>Destination Y</label><input id="mc_dst_y" type="number" min="0" value="${dstY}"></div>
            </div>`,
            async () => {
                const newDstMap = parseInt(document.getElementById('mc_dst_map').value);
                const newDstX   = parseInt(document.getElementById('mc_dst_x').value) || 0;
                const newDstY   = parseInt(document.getElementById('mc_dst_y').value) || 0;

                const cleaned = events.filter(e => !(e.type === 'TELEPORT' && e.x === srcX && e.y === srcY));
                cleaned.push({ x: srcX, y: srcY, type: 'TELEPORT', data: `${newDstMap},${newDstX},${newDstY}` });

                const res = await MapConnections._saveEvents(mapId, cleaned);
                if (res.success) {
                    MapConnections._mapEvents[mapId] = cleaned;
                    document.querySelector('.mc-modal-wrap')?.remove();
                    await MapConnections._load();
                } else alert('Save failed: ' + res.message);
            }
        );
    },

    // ── DELETE a warp ─────────────────────────────────────────────
    async _deleteWarp(mapId, srcX, srcY) {
        if (!confirm(`Delete warp at (${srcX}, ${srcY})?`)) return;
        const events  = await MapConnections._getEvents(mapId);
        const cleaned = events.filter(e => !(e.type === 'TELEPORT' && e.x === srcX && e.y === srcY));
        const res = await MapConnections._saveEvents(mapId, cleaned);
        if (res.success) {
            MapConnections._mapEvents[mapId] = cleaned;
            await MapConnections._load();
        } else alert('Delete failed: ' + res.message);
    },

    // ── Shared modal helper ───────────────────────────────────────
    _modal(bodyHTML, onConfirm) {
        const wrap = document.createElement('div');
        wrap.className = 'mc-modal-wrap';
        wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center';
        wrap.innerHTML = `
        <div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:26px;min-width:420px;max-width:560px">
            ${bodyHTML}
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
                <button class="edit-btn" onclick="this.closest('.mc-modal-wrap').remove()">Cancel</button>
                <button class="action-btn save-btn" id="mc_confirm_btn">Save Connection</button>
            </div>
        </div>`;
        document.body.appendChild(wrap);
        document.getElementById('mc_confirm_btn').onclick = onConfirm;
    }
};
