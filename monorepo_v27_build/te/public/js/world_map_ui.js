// =================================================================
// WORLD MAP UI — Overview map + fast travel between zones
// =================================================================
// Teaching: A "world map" in most RPGs is NOT another tile grid — it's
// a simplified visual showing all the zones/areas and how to travel
// between them. In our engine we fetch all maps from the DB, display
// them as clickable cards, and let the player fast-travel by emitting
// the existing `teleport` socket event.
//
// The server already has the `teleport` socket handler — it:
//   1. Removes player from the old map room
//   2. Moves them to the new map's spawn position
//   3. Saves their new position to the DB
//
// We use the existing route POST /get-all-maps to get map list.
// Each map can have: fast_travel_enabled, min_level, description.
// If a map is locked (min_level > player level), we show a lock icon.
//
// Hotkey: [M] opens/closes world map
// =================================================================

const WorldMapUI = {

    // ─── STATE ───────────────────────────────────────────────────
    open:    false,
    maps:    [],      // list of all maps from server
    filter:  '',      // search filter string

    // ─── OPEN / CLOSE ────────────────────────────────────────────
    async toggle() {
        WorldMapUI.open ? WorldMapUI.close() : await WorldMapUI.openPanel();
    },

    async openPanel() {
        if (typeof BattleUI !== 'undefined' && BattleUI.active) return;
        WorldMapUI.open = true;
        if (typeof Game !== 'undefined') Game.dialogueOpen = true;
        WorldMapUI._buildShell();
        await WorldMapUI.load();
    },

    close() {
        WorldMapUI.open = false;
        if (typeof Game !== 'undefined') Game.dialogueOpen = false;
        const el = document.getElementById('worldMapOverlay');
        if (el) el.remove();
    },

    // ─── LOAD MAPS ───────────────────────────────────────────────
    async load() {
        WorldMapUI._setContent('<div style="text-align:center;padding:40px;color:#484f58">Loading world data…</div>');
        try {
            const res = await fetch('/get-all-maps', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
            }).then(r => r.json());
            if (res.success) {
                WorldMapUI.maps = res.maps || [];
            } else {
                WorldMapUI.maps = [];
            }
        } catch (e) {
            console.error('World map load error:', e);
            WorldMapUI.maps = [];
        }
        WorldMapUI.render();
    },

    // ─── RENDER ──────────────────────────────────────────────────
    render() {
        const myCharId = typeof Game !== 'undefined' ? Game.myCharId : null;
        const myLevel  = typeof Game !== 'undefined' && Game.charFull
                       ? (Game.charFull.character?.level || 1)
                       : 1;
        const currentMapId = typeof Game !== 'undefined' && Game.map ? Game.map.id : null;

        const filter = WorldMapUI.filter.toLowerCase();
        const filtered = filter
            ? WorldMapUI.maps.filter(m => (m.name || '').toLowerCase().includes(filter) || (m.description || '').toLowerCase().includes(filter))
            : WorldMapUI.maps;

        if (!filtered.length) {
            WorldMapUI._setContent(`<div style="text-align:center;padding:40px;color:#484f58">
                ${WorldMapUI.maps.length === 0 ? '🗺️ No maps in database yet.' : '🔍 No maps match your search.'}</div>`);
            return;
        }

        // Group by current / accessible / locked
        const current    = filtered.filter(m => m.id === currentMapId);
        const accessible = filtered.filter(m => m.id !== currentMapId && m.fast_travel_enabled && (m.min_level || 1) <= myLevel);
        const locked     = filtered.filter(m => m.id !== currentMapId && (!m.fast_travel_enabled || (m.min_level || 1) > myLevel));

        let html = '';

        if (current.length) {
            html += `<div class="wm-sect">📍 Current Location</div>`;
            html += current.map(m => WorldMapUI._card(m, 'current', myLevel)).join('');
        }
        if (accessible.length) {
            html += `<div class="wm-sect">✈️ Fast Travel Available (${accessible.length})</div>`;
            html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:16px">`;
            html += accessible.map(m => WorldMapUI._card(m, 'accessible', myLevel)).join('');
            html += `</div>`;
        }
        if (locked.length) {
            html += `<div class="wm-sect">🔒 Locked / No Fast Travel</div>`;
            html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">`;
            html += locked.map(m => WorldMapUI._card(m, 'locked', myLevel)).join('');
            html += `</div>`;
        }

        WorldMapUI._setContent(html);
    },

    // ─── MAP CARD ────────────────────────────────────────────────
    _card(map, state, myLevel) {
        const isCurrent    = state === 'current';
        const isAccessible = state === 'accessible';
        const isLocked     = state === 'locked';
        const minLevel     = map.min_level || 1;

        const borderColor = isCurrent    ? 'rgba(255,204,0,0.5)'
                          : isAccessible ? 'rgba(3,218,198,0.3)'
                          : 'rgba(255,255,255,0.06)';
        const bgColor     = isCurrent    ? 'rgba(255,204,0,0.08)'
                          : isLocked     ? 'rgba(255,255,255,0.02)'
                          : 'rgba(255,255,255,0.04)';

        // Map size gives players a sense of scale
        const sizeLabel = !map.width ? '' : (map.width * map.height < 500 ? 'Small' : map.width * map.height < 2000 ? 'Medium' : 'Large');

        const card = `
        <div style="padding:12px;background:${bgColor};border:1px solid ${borderColor};border-radius:8px;
             ${isAccessible ? 'cursor:pointer;transition:.15s' : ''} ${isCurrent ? 'grid-column:1/-1' : ''}"
             ${isAccessible ? `onclick="WorldMapUI.travel(${map.id})"
                 onmouseover="this.style.background='rgba(3,218,198,0.1)'"
                 onmouseout="this.style.background='${bgColor}'"` : ''}
             title="${isLocked ? `Requires Level ${minLevel}` : isAccessible ? 'Click to fast travel' : 'Current location'}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
                <div style="font-weight:bold;font-size:13px;color:${isCurrent ? '#ffcc00' : isLocked ? '#484f58' : '#c9d1d9'}">
                    ${isCurrent ? '📍 ' : isLocked ? '🔒 ' : ''}${WorldMapUI._esc(map.name)}
                </div>
                ${sizeLabel ? `<div style="font-size:9px;color:#30363d;text-transform:uppercase">${sizeLabel}</div>` : ''}
            </div>
            ${map.description
                ? `<div style="color:${isLocked ? '#30363d' : '#484f58'};font-size:11px;margin-bottom:6px;
                        overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                        title="${WorldMapUI._esc(map.description)}">${WorldMapUI._esc(map.description)}</div>`
                : ''}
            <div style="display:flex;justify-content:space-between;align-items:center">
                ${isLocked
                    ? `<div style="color:#30363d;font-size:10px">Level ${minLevel} required</div>`
                    : !map.fast_travel_enabled
                        ? `<div style="color:#484f58;font-size:10px">No fast travel</div>`
                        : isCurrent
                            ? `<div style="color:#ffcc00;font-size:10px">You are here</div>`
                            : `<div style="color:#03dac6;font-size:10px">✈️ Fast travel</div>`}
                <div style="color:#30363d;font-size:10px">${map.width || '?'}×${map.height || '?'}</div>
            </div>
        </div>`;

        // Current location gets full width row, not grid cell
        if (isCurrent) return card;
        return card;
    },

    // ─── FAST TRAVEL ─────────────────────────────────────────────
    travel(mapId) {
        const map = WorldMapUI.maps.find(m => m.id === mapId);
        if (!map) return;
        if (!confirm(`Fast travel to ${map.name}?`)) return;

        if (typeof Game !== 'undefined') {
            // Teleport to center of new map (server will use sensible spawn point)
            const spawnX = Math.floor((map.width  || 20) / 2);
            const spawnY = Math.floor((map.height || 20) / 2);
            Game.socket.emit('teleport', { mapId, x: spawnX, y: spawnY });
            // The server will respond with player_list update and the game_engine
            // will call loadMap() when it gets a force_move or player_list event.
        }

        WorldMapUI.close();
        showNotification(`✈️ Travelling to ${map.name}…`, 'item');
        // map_changed socket event from server will reload tiles + update name + reposition hero
    },

    // ─── DOM SHELL ───────────────────────────────────────────────
    _buildShell() {
        let el = document.getElementById('worldMapOverlay');
        if (el) el.remove();
        el = document.createElement('div');
        el.id = 'worldMapOverlay';
        el.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;z-index:120;
            background:rgba(0,0,0,0.93);overflow-y:auto;padding:30px;color:#e8eef6;`;
        el.innerHTML = `
            ${WorldMapUI._styles()}
            <div style="max-width:860px;margin:0 auto">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;
                     border-bottom:1px solid #21262d;padding-bottom:14px;flex-wrap:wrap">
                    <span style="font-size:24px">🗺️</span>
                    <h1 style="margin:0;font-size:20px;color:#03dac6;letter-spacing:1px;font-family:'Courier New',monospace">WORLD MAP</h1>
                    <input id="wmSearch" type="text" placeholder="Filter zones…"
                        class="wm-search" style="margin-left:auto;"
                        oninput="WorldMapUI.filter=this.value;WorldMapUI.render()"/>
                    <button onclick="WorldMapUI.close()" class="wm-close-btn">[M] Close</button>
                </div>
                <div id="worldMapContent">
                    <div style="text-align:center;padding:40px;color:#484f58">Loading…</div>
                </div>
            </div>`;
        document.body.appendChild(el);
    },

    _styles() {
        if (document.getElementById('wmStyles')) return '';
        const s = document.createElement('style');
        s.id = 'wmStyles';
        s.textContent = `
        .wm-sect { color:#03dac6;font-size:10px;text-transform:uppercase;letter-spacing:1px;
            margin:10px 0 8px;padding-bottom:4px;border-bottom:1px solid #21262d;font-family:'Courier New',monospace; }
        .wm-search { background:rgba(255,255,255,0.05);border:1px solid #30363d;color:#e8eef6;
            padding:7px 12px;border-radius:7px;font-family:inherit;font-size:12px;outline:none;width:200px; }
        .wm-search:focus { border-color:rgba(3,218,198,0.4); }
        .wm-close-btn { background:transparent;border:1px solid #484f58;color:#8b949e;
            padding:6px 12px;cursor:pointer;border-radius:7px;font-family:'Courier New',monospace;font-size:12px;transition:.15s; }
        .wm-close-btn:hover { border-color:#f85149;color:#f85149; }`;
        document.head.appendChild(s);
        return '';
    },

    _setContent(html) { const el = document.getElementById('worldMapContent'); if (el) el.innerHTML = html; },
    _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;'); },
};
