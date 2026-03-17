// =================================================================
// MAP MANAGER v5.0 — Objects Layer + Lighting
// =================================================================
// NEW IN v5.0:
//   Third layer tab: OBJECTS. Place props, lights, and decorations
//   on the map. Objects are rendered between terrain and players.
//
//   Object types:
//     LIGHT — lanterns, torches, chandeliers. Emit light in-game.
//             Optionally linked to a map flag (flagKey). When the
//             flag is false, the light goes out for everyone.
//     PROP  — barrels, crates, statues. Can be blocking (no walk-through).
//     DECO  — pure decoration. No collision. No light.
//
//   Ambient Darkness slider:
//     0 = fully lit (lighting system disabled, no performance cost)
//     0.3 = slight dusk
//     0.7 = dark dungeon (lights matter)
//     0.9 = near pitch-black (only lit spots visible)
//
//   How lighting works in-game:
//     Each LIGHT object with a defined light.radius carves a hole
//     in a fullscreen darkness overlay using canvas destination-out
//     compositing. Flickering lights use a per-light sine wave offset.
// =================================================================

const EDITOR_TILE = 20;
const PICKER_TILE = 32;

// Preset object definitions.
// Admins pick from these -- they can't break anything by typo.
// Each preset defines: icon, label, type, blocking, and for LIGHTs, light config.
const OBJECT_PRESETS = {
    // ── LIGHTS ──────────────────────────────────────────────────
    LANTERN:    {
        icon: '🕯️', label: 'Lantern', type: 'LIGHT', blocking: false,
        light: { radius: 2.5, color: '#ff8833', flicker: true },
        hint: 'Small warm light. Flickering. Can be extinguished via SET_MAP_FLAG.'
    },
    TORCH:      {
        icon: '🔥', label: 'Torch', type: 'LIGHT', blocking: false,
        light: { radius: 3.5, color: '#ff5500', flicker: true },
        hint: 'Bright warm light. Flickering flame.'
    },
    CHANDELIER: {
        icon: '✨', label: 'Chandelier', type: 'LIGHT', blocking: false,
        light: { radius: 6, color: '#ffffcc', flicker: false },
        hint: 'Large soft white light. Good for ballrooms, throne rooms.'
    },
    CRYSTAL:    {
        icon: '💎', label: 'Magic Crystal', type: 'LIGHT', blocking: false,
        light: { radius: 3, color: '#4466ff', flicker: false },
        hint: 'Cold blue glow. Good for dungeons, magic labs.'
    },
    CAMPFIRE:   {
        icon: '🏕️', label: 'Campfire', type: 'LIGHT', blocking: false,
        light: { radius: 4, color: '#ff6600', flicker: true },
        hint: 'Outdoor fire. Flickering orange warmth.'
    },
    BRAZIER:    {
        icon: '🔆', label: 'Brazier', type: 'LIGHT', blocking: true,
        light: { radius: 3, color: '#ff8800', flicker: true },
        hint: 'Standing fire bowl. Blocking — players walk around it.'
    },
    OIL_LAMP:   {
        icon: '🪔', label: 'Oil Lamp', type: 'LIGHT', blocking: false,
        light: { radius: 2, color: '#ffcc66', flicker: true },
        hint: 'Dim, very warm. Good for homes and inns.'
    },
    MOONLIGHT:  {
        icon: '🌙', label: 'Moonbeam', type: 'LIGHT', blocking: false,
        light: { radius: 2.5, color: '#aabbff', flicker: false },
        hint: 'Cold pale blue. Comes through windows at night.'
    },

    // ── PROPS (blocking) ─────────────────────────────────────────
    BARREL:     {
        icon: '🛢️', label: 'Barrel', type: 'PROP', blocking: true, light: null,
        hint: 'Solid barrel. Blocks movement.'
    },
    OIL_BARREL: {
        icon: '🧨', label: 'Oil Barrel', type: 'PROP', blocking: true, light: null,
        hint: 'Explosive barrel. In battle, can be targeted to deal AoE fire damage.'
    },
    CRATE:      {
        icon: '📦', label: 'Crate', type: 'PROP', blocking: true, light: null,
        hint: 'Wooden crate. Blocks movement.'
    },
    STATUE:     {
        icon: '🗿', label: 'Statue', type: 'PROP', blocking: true, light: null,
        hint: 'Stone statue. Blocks movement.'
    },
    PILLAR:     {
        icon: '🏛️', label: 'Pillar', type: 'PROP', blocking: true, light: null,
        hint: 'Stone column. Blocks movement.'
    },
    CAULDRON:   {
        icon: '🫕', label: 'Cauldron', type: 'PROP', blocking: true, light: null,
        hint: 'Large cauldron. Blocks movement.'
    },
    TREE:       {
        icon: '🌲', label: 'Tree', type: 'PROP', blocking: true, light: null,
        hint: 'A tree. Blocks movement.'
    },
    BOULDER:    {
        icon: '🪨', label: 'Boulder', type: 'PROP', blocking: true, light: null,
        hint: 'A large rock. Blocks movement.'
    },

    // ── DECO (walkthrough) ───────────────────────────────────────
    CHEST:      {
        icon: '🎁', label: 'Chest', type: 'DECO', blocking: false, light: null,
        hint: 'Decorative chest. Walkthrough — put a LOOT event on same tile for rewards.'
    },
    SIGN:       {
        icon: '🪧', label: 'Sign', type: 'DECO', blocking: false, light: null,
        hint: 'A sign. Press E in-game to read it. Click an existing sign to edit text.',
        hasText: true
    },
    BED:        {
        icon: '🛏️', label: 'Bed', type: 'DECO', blocking: false, light: null,
        hint: 'A bed. Walkthrough — add a HEAL event on same tile for rest.'
    },
    CHAIR:      {
        icon: '🪑', label: 'Chair', type: 'DECO', blocking: false, light: null,
        hint: 'A chair. Purely decorative.'
    },
    FLOWER:     {
        icon: '🌸', label: 'Flower', type: 'DECO', blocking: false, light: null,
        hint: 'A flower. Purely decorative.'
    },
    SKULL:      {
        icon: '💀', label: 'Skull', type: 'DECO', blocking: false, light: null,
        hint: 'A spooky skull. Good for graveyards and dungeon floors.'
    },
    GRAVE:      {
        icon: '🪦', label: 'Gravestone', type: 'DECO', blocking: false, light: null,
        hint: 'A gravestone. Purely decorative — or put an NPC event on it!'
    },
    MUSHROOM:   {
        icon: '🍄', label: 'Mushroom', type: 'DECO', blocking: false, light: null,
        hint: 'A large mushroom. Good for caves and forests.'
    },
    // ── CUSTOM SPRITE ────────────────────────────────────────────
    CUSTOM: {
        icon: '🖼️', label: 'Custom Sprite', type: 'PROP', blocking: false, light: null,
        hint: 'Place any PNG sprite by path. Opens a config modal.'
    },
};

const MapManager = {
    config: {
        type: 'map',
        colors: ['#228822', '#888888', '#2222FF', '#442200', '#aaaaaa', '#664422', '#999977', '#111111', '#6622aa', '#005500', '#ccaa44'],
        names:  ['Grass', 'Wall', 'Water', 'Dirt', 'Stone', 'Wood', 'Rock', 'Void', 'Magic', 'Jungle', 'Sand'],
        eventIcons: { TELEPORT: '🚪', NPC: '👤', ENEMY: '💀', LOOT: '💎', SHOP: '🏪', SCRIPT: '📜', TERRAIN: '🌿' }
    },

    currentMapId:      null,
    currentWidth:       20,
    currentHeight:      20,
    npcs:              [],  // loaded when editor opens, used for NPC placement dropdown
    currentMapName:    '',
    currentTiles:      [],
    currentEvents:     [],
    currentObjects:    [],    // NEW: placed objects
    currentAmbientDark: 0,   // NEW: 0-1 darkness level
    currentAnims:      [],    // NEW: tile animation definitions
    currentTilesetUrl: '',
    activeLayer:       'TILES',
    currentBrush:      0,
    currentTool:        'NPC',
    _scriptEditorMode:  'list',  // 'list' = classic ScriptEditor | 'graph' = NodeGraphEditor
    currentObjectPreset: 'LANTERN',
    zoom: 1,  // 1x, 1.5x, 2x — scales the map grid

    tileset: { url: '', img: null, cols: 0, rows: 0, loaded: false },
    _mapList: [],  // cached for inspector + teleport picker

    // ── LIST ─────────────────────────────────────────────────────

    init: async () => {
        document.getElementById('pageTitle').innerText = 'WORLD BUILDER';
        document.getElementById('dynamicArea').innerHTML = '<p>Loading...</p>';
        const r = await API.getAll('map');
        if (r.success) MapManager.renderTable(r.data);
    },

    renderTable: (data) => {
        let h = `<button class="action-btn save-btn" onclick="MapManager.create()">+ NEW MAP</button>`;
        if (!data || !data.length) { h += '<p>No maps yet.</p>'; }
        else {
            h += `<table><thead><tr>
                <th>ID</th><th>NAME</th><th>SIZE</th><th>OBJECTS</th><th>DARK</th><th>ACTIONS</th>
            </tr></thead><tbody>`;
            data.forEach(i => {
                const st  = encodeURIComponent(i.tiles_json      || '[]');
                const sc  = encodeURIComponent(i.collisions_json || '[]');
                const so  = encodeURIComponent(i.objects_json    || '[]');
                const tu  = encodeURIComponent(i.tileset_url     || '');
                let objCount = 0;
                try { objCount = JSON.parse(i.objects_json || '[]').length; } catch {}
                const darkLevel = i.ambient_dark || 0;
                const darkTag = darkLevel > 0
                    ? `<span class="tag" style="background:rgba(0,0,50,0.8);color:#8888ff">🌑 ${Math.round(darkLevel*100)}%</span>`
                    : `<span style="color:#444;font-size:11px">☀ Lit</span>`;
                h += `<tr>
                    <td>${i.id}</td>
                    <td><b>${i.name}</b></td>
                    <td>${i.width}×${i.height}</td>
                    <td>${objCount > 0 ? `<span class="tag tag-green">${objCount} obj</span>` : '<span style="color:#444;font-size:11px">none</span>'}</td>
                    <td>${darkTag}</td>
                    <td>
                        <button class="edit-btn" onclick="MapManager.prepEditor(${i.id},'${i.name.replace(/'/g,"\\'")}','${st}','${sc}','${tu}','${so}',${darkLevel},'${encodeURIComponent(i.anims_json||'[]')}',${i.width||20},${i.height||20})">EDIT</button>
                        <button class="del-btn" onclick="MapManager.deleteMap(${i.id})">DEL</button>
                    </td>
                </tr>`;
            });
            h += '</tbody></table>';
        }
        document.getElementById('dynamicArea').innerHTML = h;
    },

    create: () => {
        // Inline modal replaces 3 chained browser prompt() calls
        const existing = document.getElementById('mm_new_modal');
        if (existing) { existing.remove(); return; }
        const modal = document.createElement('div');
        modal.id = 'mm_new_modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center';
        modal.innerHTML = `
        <div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:24px;min-width:400px">
            <h3 style="margin:0 0 4px;color:#bb86fc">🗺️ New Map</h3>
            <p style="color:#484f58;font-size:12px;margin:0 0 14px">Creates a blank map filled with floor tiles. Paint walls and events in the editor.</p>
            <label style="font-size:12px;color:#8b949e">Map Name</label>
            <input id="mm_new_name" placeholder="e.g. Dark Forest, Castle Dungeon" style="margin-bottom:12px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
                <div><label style="font-size:12px;color:#8b949e">Width (tiles, 5–100)</label>
                    <input type="number" id="mm_new_w" value="20" min="5" max="100"></div>
                <div><label style="font-size:12px;color:#8b949e">Height (tiles, 5–100)</label>
                    <input type="number" id="mm_new_h" value="20" min="5" max="100"></div>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="edit-btn" onclick="document.getElementById('mm_new_modal').remove()">Cancel</button>
                <button class="action-btn save-btn" onclick="MapManager._doCreate()">Create Map</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('mm_new_name')?.focus(), 50);
    },

    _doCreate: async () => {
        const n = document.getElementById('mm_new_name')?.value?.trim();
        const w = Math.max(5, Math.min(100, parseInt(document.getElementById('mm_new_w')?.value) || 20));
        const h = Math.max(5, Math.min(100, parseInt(document.getElementById('mm_new_h')?.value) || 20));
        document.getElementById('mm_new_modal')?.remove();
        if (!n) { alert('Map name is required.'); return; }
        const r = await API.save('map', {
            name: n, width: w, height: h,
            tiles_json:      JSON.stringify(Array(w * h).fill(0)),
            collisions_json: JSON.stringify([]),
            objects_json:    JSON.stringify([]),
            anims_json:      JSON.stringify([]),
            tileset_url: null,
            ambient_dark: 0
        });
        if (r.success) MapManager.init();
    },

    // ── OPEN EDITOR ──────────────────────────────────────────────

    prepEditor: (id, name, tE, eE, tuE, oE, dark, animsE, w, h) => {
        MapManager.currentMapId      = id;
        MapManager.currentMapName    = name;
        MapManager.currentAmbientDark = parseFloat(dark) || 0;
        MapManager.currentWidth      = parseInt(w)  || 20;
        MapManager.currentHeight     = parseInt(h)  || 20;
        const tileCount = MapManager.currentWidth * MapManager.currentHeight;
        try {
            MapManager.currentTiles = JSON.parse(decodeURIComponent(tE));
            if (!Array.isArray(MapManager.currentTiles) || MapManager.currentTiles.length !== tileCount)
                MapManager.currentTiles = Array(tileCount).fill(0);
        } catch { MapManager.currentTiles = Array(tileCount).fill(0); }
        try { MapManager.currentEvents  = JSON.parse(decodeURIComponent(eE))  || []; } catch { MapManager.currentEvents  = []; }
        try { MapManager.currentObjects = JSON.parse(decodeURIComponent(oE))  || []; } catch { MapManager.currentObjects = []; }
        try { MapManager.currentAnims   = JSON.parse(decodeURIComponent(animsE || '%5B%5D')) || []; } catch { MapManager.currentAnims = []; }
        MapManager.currentTilesetUrl = decodeURIComponent(tuE || '');
        MapManager.tileset = { url: '', img: null, cols: 0, rows: 0, loaded: false };
        // Load NPC + map lists for picker modals and inspector name lookups
        API.getAll('npc').then(r => { MapManager.npcs = r.success ? r.data : []; });
        API.getAll('map').then(r => { MapManager._mapList = r.success ? r.data : []; });
        MapManager.renderEditorUI();
        if (MapManager.currentTilesetUrl) MapManager.loadTileset(MapManager.currentTilesetUrl, false);
    },

    // ── EDITOR LAYOUT ────────────────────────────────────────────

    renderEditorUI: () => {
        const name = MapManager.currentMapName;
        const dark = MapManager.currentAmbientDark;
        document.getElementById('dynamicArea').innerHTML = `
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <h3 style="margin:0">Editing: <span style="color:#fff">${name}</span></h3>
            <div style="display:flex;gap:8px;align-items:center">
                <span style="color:#666;font-size:10px">🔍</span>
                <input type="range" min="1" max="3" step="0.5" value="${MapManager.zoom}"
                    oninput="MapManager.setZoom(this.value)"
                    style="width:70px;accent-color:#bb86fc" title="Zoom">
                <span id="zoomLabel" style="color:#888;font-size:11px;min-width:28px">${MapManager.zoom}x</span>
                <button class="action-btn save-btn" onclick="MapManager.save()">💾 SAVE</button>
                <button class="action-btn" onclick="MapManager.init()" style="background:#333">EXIT</button>
            </div>
        </div>

        <!-- Tileset row -->
        <div style="display:flex;gap:8px;align-items:center;background:#111;padding:8px 12px;
                    border-bottom:1px solid #333;flex-wrap:wrap">
            <span style="color:#666;font-size:10px;white-space:nowrap">TILESET:</span>
            <input id="tilesetUrl" value="${MapManager.currentTilesetUrl}"
                placeholder="https://example.com/tileset.png"
                style="flex:1;min-width:200px;font-size:12px"
                onkeydown="if(event.key==='Enter') MapManager.loadTileset(this.value, true)">
            <button class="edit-btn" onclick="MapManager.loadTileset(document.getElementById('tilesetUrl').value, true)">
                🖼️ Load
            </button>
            ${MapManager.tileset.loaded
                ? `<span style="color:#00cc66;font-size:11px">✔ ${MapManager.tileset.cols}×${MapManager.tileset.rows} tiles</span>`
                : MapManager.currentTilesetUrl
                    ? `<span style="color:#ffaa00;font-size:11px">⏳ Loading...</span>`
                    : `<span style="color:#444;font-size:11px">No tileset</span>`}
        </div>

        <!-- Ambient darkness row -->
        <div style="display:flex;gap:12px;align-items:center;background:#0a0a14;padding:8px 12px;
                    border-bottom:1px solid #333;flex-wrap:wrap">
            <span style="color:#8888aa;font-size:10px;white-space:nowrap">🌑 AMBIENT DARKNESS:</span>
            <input type="range" id="darkSlider" min="0" max="1" step="0.05" value="${dark}"
                oninput="MapManager.setDark(this.value)"
                style="flex:1;min-width:120px;max-width:200px;accent-color:#8888ff">
            <span id="darkLabel" style="color:#8888ff;font-size:12px;min-width:40px">${Math.round(dark*100)}%</span>
            <span style="color:#555;font-size:11px">
                0% = fully lit &nbsp;|&nbsp; 30% = dusk &nbsp;|&nbsp; 70% = dungeon &nbsp;|&nbsp; 90% = pitch black
            </span>
        </div>

        <!-- Map size -->
        <div style="display:flex;gap:12px;align-items:center;background:#0a0a14;padding:8px 12px;
                    border-bottom:1px solid #333;flex-wrap:wrap">
            <span style="color:#8888aa;font-size:10px;white-space:nowrap">📐 MAP SIZE:</span>
            <label style="color:#888;font-size:11px">W:</label>
            <input type="number" id="mapResizeW" min="5" max="200" value="${MapManager.currentWidth}"
                style="width:55px;padding:3px 6px;background:#0a0a1a;border:1px solid #333;color:#fff;border-radius:4px;font-size:12px">
            <label style="color:#888;font-size:11px">H:</label>
            <input type="number" id="mapResizeH" min="5" max="200" value="${MapManager.currentHeight}"
                style="width:55px;padding:3px 6px;background:#0a0a1a;border:1px solid #333;color:#fff;border-radius:4px;font-size:12px">
            <button class="edit-btn" onclick="MapManager.resizeMap()" style="font-size:11px;padding:4px 10px">Resize</button>
            <span style="color:#555;font-size:10px">${MapManager.currentWidth}×${MapManager.currentHeight} = ${MapManager.currentWidth * MapManager.currentHeight} tiles</span>
        </div>

        <!-- Layer tabs -->
        <div style="background:#1a1a1a;padding:10px;display:flex;gap:20px;border-bottom:1px solid #444">
            <label style="cursor:pointer;color:${MapManager.activeLayer==='TILES'?'#fff':'#666'}">
                <input type="radio" name="layer" onclick="MapManager.setLayer('TILES')"
                    ${MapManager.activeLayer==='TILES'?'checked':''}> 🖌️ TERRAIN</label>
            <label style="cursor:pointer;color:${MapManager.activeLayer==='OBJECTS'?'#ffcc44':'#666'}">
                <input type="radio" name="layer" onclick="MapManager.setLayer('OBJECTS')"
                    ${MapManager.activeLayer==='OBJECTS'?'checked':''}> 🏮 OBJECTS</label>
            <label style="cursor:pointer;color:${MapManager.activeLayer==='EVENTS'?'#bb86fc':'#666'}">
                <input type="radio" name="layer" onclick="MapManager.setLayer('EVENTS')"
                    ${MapManager.activeLayer==='EVENTS'?'checked':''}> ⚙️ EVENTS</label>
        </div>

        <!-- Toolbar -->
        <div id="toolbar" style="background:#111;padding:8px 12px;min-height:36px;display:flex;
                                  align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid #222"></div>

        <!-- Grid + side panel -->
        <div style="display:flex;gap:16px;padding-top:10px">
            <div id="mapGrid"
                style="display:grid;grid-template-columns:repeat(${MapManager.currentWidth},${Math.round(EDITOR_TILE*MapManager.zoom)}px);
                       grid-template-rows:repeat(${MapManager.currentHeight},${Math.round(EDITOR_TILE*MapManager.zoom)}px);
                       width:${MapManager.currentWidth*Math.round(EDITOR_TILE*MapManager.zoom)}px;height:${MapManager.currentHeight*Math.round(EDITOR_TILE*MapManager.zoom)}px;
                       background:#000;border:2px solid #555;flex-shrink:0;overflow:auto;position:relative"></div>
            <div id="sidePanel" style="flex:1;background:#1a1a1a;padding:12px;font-size:12px;
                                       border:1px solid #333;border-radius:8px;
                                       max-height:${MapManager.currentHeight*EDITOR_TILE+4}px;overflow-y:auto"></div>
        </div>`;

        MapManager.renderToolbar();
        MapManager.renderSidePanel();
        MapManager.renderGrid();
    },

    setDark: (val) => {
        MapManager.currentAmbientDark = parseFloat(val);
        const lbl = document.getElementById('darkLabel');
        if (lbl) lbl.textContent = Math.round(val * 100) + '%';
    },

    // ── TOOLBAR ──────────────────────────────────────────────────

    renderToolbar: () => {
        const bar = document.getElementById('toolbar');
        if (!bar) return;

        if (MapManager.activeLayer === 'TILES') {
            if (MapManager.tileset.loaded) {
                const col = MapManager.currentBrush % MapManager.tileset.cols;
                const row = Math.floor(MapManager.currentBrush / MapManager.tileset.cols);
                bar.innerHTML = `<span style="color:#666;font-size:10px">BRUSH:</span>
                    <span style="color:#aaa">Tile #${MapManager.currentBrush} (col ${col}, row ${row})</span>
                    <span style="color:#444;font-size:10px;margin-left:auto">← Click tileset picker to change</span>`;
            } else {
                bar.innerHTML = `<span style="color:#666;font-size:10px">BRUSH:</span>
                    ${MapManager.config.names.map((n, i) => `
                    <button onclick="MapManager.setBrush(${i})"
                        style="background:${MapManager.config.colors[i]};
                               border:${MapManager.currentBrush===i?'2px solid white':'1px solid #444'};
                               color:white;padding:5px 10px;cursor:pointer;border-radius:4px">${n}</button>
                    `).join('')}`;
            }

        } else if (MapManager.activeLayer === 'OBJECTS') {
            const preset = OBJECT_PRESETS[MapManager.currentObjectPreset];
            bar.innerHTML = `
                <span style="color:#666;font-size:10px">BRUSH:</span>
                <span style="font-size:18px">${preset ? preset.icon : '?'}</span>
                <span style="color:#ffcc44">${preset ? preset.label : '?'}</span>
                <span style="color:#555;font-size:10px;margin-left:4px">[${preset ? preset.type : '?'}]</span>
                <button onclick="MapManager.setObjectPreset('ERASER')"
                    style="background:${MapManager.currentObjectPreset==='ERASER'?'#442222':'#222'};
                           border:${MapManager.currentObjectPreset==='ERASER'?'2px solid red':'1px solid #444'};
                           color:red;padding:4px 10px;cursor:pointer;border-radius:4px;margin-left:auto">
                    ✕ ERASE</button>`;

        } else {
            const tools = ['NPC','TELEPORT','ENEMY','LOOT','SHOP','SCRIPT','TERRAIN','ERASER'];
            const _mode = MapManager._scriptEditorMode || 'list';
            bar.innerHTML = `<span style="color:#666;font-size:10px">TOOL:</span>
                ${tools.map(t => `
                <button onclick="MapManager.setTool('${t}')"
                    style="background:${MapManager.currentTool===t?'#444':'#222'};
                           border:${MapManager.currentTool===t?'2px solid #bb86fc':'1px solid #444'};
                           color:${t==='ERASER'?'red':t==='SCRIPT'?'#bb86fc':'white'};
                           padding:5px 10px;cursor:pointer;border-radius:4px;font-size:12px">
                    ${t==='ERASER'?'✕ DEL':t==='SCRIPT'?'📜 SCRIPT':(MapManager.config.eventIcons[t]||'')+' '+t}
                </button>`).join('')}
                <span style="display:inline-flex;align-items:center;gap:4px;margin-left:12px;border-left:1px solid #333;padding-left:12px">
                    <span style="font-size:10px;color:#555">SCRIPT EDITOR:</span>
                    <button onclick="MapManager._setScriptMode('list')"
                        style="padding:4px 9px;font-size:11px;cursor:pointer;border-radius:4px;
                               background:${_mode==='list'?'rgba(187,134,252,.2)':'#222'};
                               border:${_mode==='list'?'1px solid #bb86fc':'1px solid #444'};
                               color:${_mode==='list'?'#bb86fc':'#888'}">📝 List</button>
                    <button onclick="MapManager._setScriptMode('graph')"
                        title="Visual node graph editor"
                        style="padding:4px 9px;font-size:11px;cursor:pointer;border-radius:4px;
                               background:${_mode==='graph'?'rgba(187,134,252,.2)':'#222'};
                               border:${_mode==='graph'?'1px solid #bb86fc':'1px solid #444'};
                               color:${_mode==='graph'?'#bb86fc':'#888'}">🔀 Graph</button>
                </span>`;
        }
    },

    // ── SIDE PANEL ───────────────────────────────────────────────

    renderSidePanel: () => {
        const el = document.getElementById('sidePanel');
        if (!el) return;

        if (MapManager.activeLayer === 'TILES') {
            if (MapManager.tileset.loaded) {
                el.innerHTML = `
                    <div style="color:#888;font-size:11px;letter-spacing:1px;margin-bottom:8px">TILE PICKER</div>
                    <div style="overflow:auto;max-height:380px">
                        <canvas id="tilesetPicker" style="display:block;cursor:crosshair;image-rendering:pixelated"></canvas>
                    </div>`;
                MapManager._drawPicker();
            } else {
                el.innerHTML = `
                    <div style="color:#888;font-size:11px;letter-spacing:1px;margin-bottom:8px">TILE LEGEND</div>
                    ${MapManager.config.names.map((n, i) => `
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer"
                         onclick="MapManager.setBrush(${i})">
                        <div style="width:20px;height:20px;background:${MapManager.config.colors[i]};
                                    border:${MapManager.currentBrush===i?'2px solid white':'1px solid #444'}"></div>
                        <span style="color:${MapManager.currentBrush===i?'#fff':'#999'}">${n}</span>
                    </div>`).join('')}
                    <div style="margin-top:12px;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px;
                                font-size:11px;color:#555">
                        💡 Paste a tileset URL above to paint with real tiles.
                    </div>`;
            }
            // Animations section -- shown below both picker and color legend
            MapManager._renderAnimSection();

        } else if (MapManager.activeLayer === 'OBJECTS') {
            MapManager._renderObjectPalette();
            MapManager._appendCellInspector();

        } else {
            MapManager._renderEventsInspector();
        }

        // TILES layer: append inspector after anim section is done
        if (MapManager.activeLayer === 'TILES') {
            MapManager._appendCellInspector();
        }
    },


    // =================================================================
    // ANIMATION SECTION -- rendered at bottom of TILES side panel
    // =================================================================
    // TEACHING: A tile animation is just an array of tile indices shown
    // in sequence. The engine swaps the stored tile index for the current
    // frame index at draw time. Nothing on the map changes --
    // it is purely visual, happening 4-12 times per second.
    //
    // Example: tile #16 is "still water". We define:
    //   { trigger: 16, frames: [16,17,18,17], fps: 6 }
    // Every tile painted as #16 becomes animated water in-game.
    // =================================================================
    _renderAnimSection: () => {
        const el = document.getElementById('sidePanel');
        if (!el) return;

        const PRESETS = [
            { label: '🌊 Water',    fps: 6,  frames: 4, hint: 'Slow rippling. 4 consecutive tile indices.' },
            { label: '🔥 Fire',     fps: 10, frames: 3, hint: 'Fast flicker. 3 consecutive tile indices.' },
            { label: '🌋 Lava',     fps: 3,  frames: 4, hint: 'Slow churn. 4 consecutive tile indices.' },
            { label: '✨ Magic',    fps: 8,  frames: 4, hint: 'Fast sparkle. 4 tile indices.' },
            { label: '💨 Wind',     fps: 5,  frames: 3, hint: 'Gentle sway. 3 tile indices.' },
            { label: '⚡ Electric', fps: 12, frames: 2, hint: 'Quick flash. 2 tile indices.' },
        ];
        MapManager._animPresets = PRESETS;

        const anims = MapManager.currentAnims;
        const animHtml = anims.length === 0
            ? '<p style="color:#444;font-size:11px;margin:4px 0">No animations yet.</p>'
            : anims.map((a, i) => `
                <div style="display:flex;align-items:center;gap:6px;padding:5px 8px;margin-bottom:3px;
                            background:rgba(100,200,255,0.05);border-radius:4px;font-size:11px">
                    <span style="color:#88ccff">
                        #${a.trigger} &rarr; [${a.frames.join(', ')}] @ ${a.fps}fps
                    </span>
                    <button onclick="MapManager._removeAnim(${i})"
                        style="margin-left:auto;background:none;border:1px solid #442222;
                               color:#cc4444;padding:1px 6px;cursor:pointer;border-radius:3px;font-size:10px">
                        ✕</button>
                </div>`).join('');

        const presetHtml = PRESETS.map((p, i) =>
            `<button onclick="MapManager._applyAnimPreset(${i})"
                title="${p.hint}"
                style="background:#1a1a2e;border:1px solid #334;color:#88aacc;
                       padding:3px 7px;cursor:pointer;border-radius:3px;font-size:11px">
                ${p.label}</button>`).join('');

        const section = document.createElement('div');
        section.style.cssText = 'margin-top:16px;border-top:1px solid #333;padding-top:12px';
        section.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer"
                 onclick="document.getElementById('animBody').style.display=
                          document.getElementById('animBody').style.display==='none'?'block':'none'">
                <span style="color:#88ccff;font-size:11px;letter-spacing:1px">&#9889; TILE ANIMATIONS</span>
                <span style="color:#444;font-size:10px">(click to expand)</span>
            </div>
            <div id="animBody" style="display:none">
                <p style="color:#555;font-size:11px;margin:0 0 8px">
                    Animated tiles cycle through tile indices at a set FPS.
                    Every tile painted with the trigger index will animate in-game.
                </p>
                <div id="animList">${animHtml}</div>

                <div style="margin:10px 0 5px;color:#666;font-size:10px;letter-spacing:1px">PRESETS:</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">${presetHtml}</div>

                <div style="background:rgba(0,0,0,0.3);padding:8px;border-radius:6px">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
                        <div>
                            <label style="font-size:10px;color:#666;display:block">TRIGGER TILE #</label>
                            <input id="anim_trigger" type="number" min="0" value="0"
                                style="width:100%;background:#111;border:1px solid #333;color:#fff;padding:4px;box-sizing:border-box">
                        </div>
                        <div>
                            <label style="font-size:10px;color:#666;display:block">FPS (1-30)</label>
                            <input id="anim_fps" type="number" min="1" max="30" value="6"
                                style="width:100%;background:#111;border:1px solid #333;color:#fff;padding:4px;box-sizing:border-box">
                        </div>
                    </div>
                    <div style="margin-bottom:6px">
                        <label style="font-size:10px;color:#666;display:block">FRAME TILE INDICES (comma-separated)</label>
                        <input id="anim_frames" placeholder="e.g. 16,17,18,17"
                            style="width:100%;background:#111;border:1px solid #333;color:#fff;padding:4px;box-sizing:border-box">
                        <div style="font-size:10px;color:#555;margin-top:2px">
                            Include the trigger tile as the first frame for seamless looping.
                        </div>
                    </div>
                    <button onclick="MapManager._addAnim()"
                        style="background:#1a3a2a;border:1px solid #2a6a4a;color:#44cc88;
                               padding:5px 12px;cursor:pointer;border-radius:4px;font-size:12px;width:100%">
                        + Add Animation
                    </button>
                </div>

                <div style="margin-top:8px;padding:8px;background:rgba(100,200,255,0.04);
                            border-radius:4px;font-size:10px;color:#555">
                    How to find tile indices: hover over the tileset picker above.
                    The inspector shows "Tile #N". Water tiles are usually
                    grouped together -- e.g. tiles 16,17,18,19 might be 4 water frames.
                </div>
            </div>`;

        el.appendChild(section);
    },

    _animPresets: [],

    _applyAnimPreset: (i) => {
        const p = MapManager._animPresets[i];
        if (!p) return;
        const fps    = document.getElementById('anim_fps');
        const frames = document.getElementById('anim_frames');
        if (!fps || !frames) return;
        fps.value = p.fps;
        const t = parseInt(document.getElementById('anim_trigger').value) || 0;
        frames.value = Array.from({length: p.frames}, (_, j) => t + j).join(',');
    },

    _addAnim: () => {
        const trigger   = parseInt(document.getElementById('anim_trigger').value);
        const fps       = Math.max(1, Math.min(30, parseInt(document.getElementById('anim_fps').value) || 6));
        const framesRaw = document.getElementById('anim_frames').value;
        const frames    = framesRaw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
        if (isNaN(trigger))    { alert('Enter a valid trigger tile index.'); return; }
        if (frames.length < 2) { alert('Need at least 2 frame tile indices.'); return; }
        MapManager.currentAnims = MapManager.currentAnims.filter(a => a.trigger !== trigger);
        MapManager.currentAnims.push({ trigger, frames, fps });
        MapManager.renderSidePanel();
    },

    _removeAnim: (i) => {
        MapManager.currentAnims.splice(i, 1);
        MapManager.renderSidePanel();
    },

    // Object palette: grouped by type
    _renderObjectPalette: () => {
        const el = document.getElementById('sidePanel');
        if (!el) return;
        const groups = { LIGHT: [], PROP: [], DECO: [] };
        Object.entries(OBJECT_PRESETS).forEach(([key, def]) => {
            groups[def.type].push({ key, ...def });
        });

        let h = `<div style="color:#888;font-size:11px;letter-spacing:1px;margin-bottom:8px">OBJECT PALETTE</div>
            <p style="color:#555;font-size:11px;margin:0 0 10px">Click to select brush → click the map to place.</p>`;

        for (const [groupName, items] of Object.entries(groups)) {
            const groupColor = groupName === 'LIGHT' ? '#ffcc44' : groupName === 'PROP' ? '#ff8844' : '#88aaff';
            const groupLabel = groupName === 'LIGHT' ? '💡 LIGHTS' : groupName === 'PROP' ? '📦 PROPS (blocking)' : '🎨 DECO';
            h += `<div style="font-size:10px;color:${groupColor};letter-spacing:1px;margin:10px 0 6px;
                              border-bottom:1px solid #333;padding-bottom:4px">${groupLabel}</div>`;
            items.forEach(item => {
                const sel = MapManager.currentObjectPreset === item.key;
                h += `
                <div onclick="MapManager.setObjectPreset('${item.key}')" style="
                    display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:3px;
                    background:${sel?'rgba(255,200,50,0.15)':'rgba(255,255,255,0.03)'};
                    border:${sel?'1px solid #ffcc44':'1px solid transparent'};
                    border-radius:6px;cursor:pointer">
                    <span style="font-size:18px;width:24px;text-align:center">${item.icon}</span>
                    <div>
                        <div style="color:${sel?'#ffcc44':'#ccc'};font-size:12px">${item.label}</div>
                        ${item.type === 'LIGHT'
                            ? `<div style="color:#888;font-size:10px">R=${item.light.radius} ${item.light.flicker?'🔥flicker':''}</div>`
                            : `<div style="color:#888;font-size:10px">${item.blocking?'⛔ blocks':'✅ walkthrough'}</div>`}
                    </div>
                </div>`;
            });
        }

        h += `<div style="margin-top:12px;padding:10px;background:rgba(255,200,50,0.05);
                          border:1px solid #333;border-radius:6px;font-size:11px;color:#888">
            💡 <b>Lighting tip:</b> Place a LIGHT object, then give it a <b>Flag Key</b>
            (e.g. <code>lantern_3_5</code>) in its properties. Add a SCRIPT event
            on the same tile with action <b>SET_MAP_FLAG</b> to extinguish it.
        </div>`;

        // Custom sprite palette button
        const _selC = MapManager.currentObjectPreset === 'CUSTOM';
        h += '<div style="font-size:10px;color:#bb86fc;letter-spacing:1px;margin:10px 0 6px;border-bottom:1px solid #333;padding-bottom:4px">\u{1F5BC}\uFE0F CUSTOM SPRITES</div>';
        h += '<div onclick="MapManager.setObjectPreset(\'CUSTOM\')" style="display:flex;align-items:center;gap:8px;padding:8px;margin-bottom:6px;background:' + (_selC ? 'rgba(187,134,252,0.15)' : 'rgba(255,255,255,0.03)') + ';border:' + (_selC ? '1px solid #bb86fc' : '1px solid transparent') + ';border-radius:6px;cursor:pointer"><span style="font-size:18px;width:24px;text-align:center">\u{1F5BC}\uFE0F</span><div><div style="color:' + (_selC ? '#bb86fc' : '#ccc') + ';font-size:12px">Custom Sprite</div><div style="color:#555;font-size:10px">Any PNG — click map tile to open config</div></div></div>';
        const _customs = (MapManager.currentObjects||[]).filter(function(o){return o.preset==='CUSTOM'||o.sprite_url;});
        if (_customs.length) {
            h += '<div style="font-size:10px;color:#484f58;margin-bottom:4px">PLACED CUSTOM PROPS</div>';
            _customs.forEach(function(o) {
                const _i = MapManager.currentObjects.indexOf(o);
                const _p = (o.sprite_url||(o.anim_frames&&o.anim_frames[0])||'').replace('/assets/sprites/objects/','');
                h += '<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;margin-bottom:2px;background:rgba(255,255,255,0.02);border:1px solid #21262d;border-radius:5px">' +
                     '<span>'+(o.icon||'\u{1F5BC}\uFE0F')+'</span>' +
                     '<div style="flex:1;min-width:0;font-size:11px"><div style="color:#c9d1d9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+o.label+'</div>' +
                     '<div style="color:#484f58;font-size:10px">('+o.x+','+o.y+') '+_p+'</div></div>' +
                     '<button onclick="MapManager._openCustomPropModal('+o.x+','+o.y+','+_i+')" style="background:none;border:1px solid #30363d;color:#8b949e;border-radius:4px;padding:2px 7px;cursor:pointer;font-size:10px">Edit</button></div>';
            });
        }
                el.innerHTML = h;
    },

    // ── TILESET LOADING ──────────────────────────────────────────

    loadTileset: (url, showAlert) => {
        url = (url || '').trim();
        if (!url) {
            MapManager.tileset = { url: '', img: null, cols: 0, rows: 0, loaded: false };
            MapManager.currentTilesetUrl = '';
            MapManager.renderEditorUI();
            return;
        }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const cols = Math.floor(img.naturalWidth  / PICKER_TILE);
            const rows = Math.floor(img.naturalHeight / PICKER_TILE);
            if (cols === 0 || rows === 0) {
                if (showAlert) alert('Image loaded but tiles appear smaller than 32px.');
                return;
            }
            MapManager.tileset = { url, img, cols, rows, loaded: true };
            MapManager.currentTilesetUrl = url;
            if (MapManager.currentBrush >= cols * rows) MapManager.currentBrush = 0;
            MapManager.renderEditorUI();
        };
        img.onerror = () => {
            if (showAlert) alert('Failed to load tileset. Check the URL.');
        };
        img.src = url;
    },

    // ── TILESET PICKER ───────────────────────────────────────────

    _drawPicker: () => {
        const canvas = document.getElementById('tilesetPicker');
        if (!canvas || !MapManager.tileset.loaded) return;
        const { img, cols, rows } = MapManager.tileset;
        canvas.width  = cols * PICKER_TILE;
        canvas.height = rows * PICKER_TILE;
        const maxW = 300;
        const displayW = Math.min(canvas.width, maxW);
        canvas.style.width  = displayW + 'px';
        canvas.style.height = Math.round(displayW * (canvas.height / canvas.width)) + 'px';
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 0.5;
        for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo(c*PICKER_TILE,0); ctx.lineTo(c*PICKER_TILE,canvas.height); ctx.stroke(); }
        for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0,r*PICKER_TILE); ctx.lineTo(canvas.width,r*PICKER_TILE); ctx.stroke(); }
        const selCol = MapManager.currentBrush % cols;
        const selRow = Math.floor(MapManager.currentBrush / cols);
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(selCol*PICKER_TILE+1, selRow*PICKER_TILE+1, PICKER_TILE-2, PICKER_TILE-2);
        ctx.lineWidth = 1;
        canvas.onclick = (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width  / rect.width;
            const scaleY = canvas.height / rect.height;
            const col = Math.floor((e.clientX - rect.left) * scaleX / PICKER_TILE);
            const row = Math.floor((e.clientY - rect.top)  * scaleY / PICKER_TILE);
            if (col < 0 || col >= cols || row < 0 || row >= rows) return;
            MapManager.currentBrush = row * cols + col;
            MapManager.renderToolbar();
            MapManager._drawPicker();
        };
    },

    // ── GRID RENDER ──────────────────────────────────────────────

    // ── NPC PICKER MODAL ─────────────────────────────────────────
    // Shows a styled dropdown instead of a raw prompt() so admins can't
    // accidentally create typos that silently break persona loading.
    _pickNpc: (x, y, ei, existing) => {
        // Remove any existing modal
        document.getElementById('npcPickModal')?.remove();

        const npcs = MapManager.npcs || [];
        if (!npcs.length) {
            alert('No NPCs found. Go to the NPC manager and create some first!');
            return;
        }

        const currentName = existing ? existing.data : '';
        const opts = npcs.map(n =>
            `<option value="${n.name}" ${n.name === currentName ? 'selected' : ''}>${n.name}${n.is_enemy ? ' ⚔️' : ''}</option>`
        ).join('');

        const modal = document.createElement('div');
        modal.id = 'npcPickModal';
        modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.7);
            display:flex;align-items:center;justify-content:center;z-index:9999`;
        modal.innerHTML = `
            <div style="background:#1a1a2e;border:1px solid #444;border-radius:8px;
                        padding:24px;min-width:320px;max-width:480px">
                <h3 style="margin:0 0 16px;color:#bb86fc">Place NPC at (${x}, ${y})</h3>
                <label style="color:#aaa;font-size:12px;display:block;margin-bottom:6px">
                    Select NPC — ⚔️ = has enemy combat stats
                </label>
                <select id="npcPickSelect" style="width:100%;background:#111;border:1px solid #555;
                    color:#fff;padding:8px;border-radius:4px;font-size:14px;margin-bottom:16px">
                    ${opts}
                </select>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button onclick="document.getElementById('npcPickModal').remove()"
                        style="background:#333;border:1px solid #555;color:#aaa;
                               padding:8px 16px;border-radius:4px;cursor:pointer">Cancel</button>
                    <button id="npcPickConfirm"
                        style="background:#bb86fc;border:none;color:#000;font-weight:bold;
                               padding:8px 16px;border-radius:4px;cursor:pointer">Place NPC</button>
                </div>
            </div>`;

        document.body.appendChild(modal);

        document.getElementById('npcPickConfirm').onclick = () => {
            const name = document.getElementById('npcPickSelect').value;
            if (name) {
                const nE = { x, y, type: 'NPC', data: name };
                if (ei >= 0) MapManager.currentEvents[ei] = nE;
                else         MapManager.currentEvents.push(nE);
                MapManager.renderGrid();
            }
            modal.remove();
        };
    },

    renderGrid: () => {
        const g = document.getElementById('mapGrid');
        if (!g) return;
        g.innerHTML = '';
        const { loaded, img, cols: tCols, url } = MapManager.tileset;

        MapManager.currentTiles.forEach((tv, i) => {
            const x = i % MapManager.currentWidth, y = Math.floor(i / MapManager.currentWidth);
            const c = document.createElement('div');

            const TS = Math.round(EDITOR_TILE * MapManager.zoom);
            if (loaded) {
                const col = tv % tCols, row = Math.floor(tv / tCols);
                const scale = TS / PICKER_TILE;
                const bW = Math.ceil(img.naturalWidth * scale);
                const bH = Math.ceil(img.naturalHeight * scale);
                c.style.cssText = `width:${TS}px;height:${TS}px;background-image:url(${url});
                    background-size:${bW}px ${bH}px;background-position:-${col*TS}px -${row*TS}px;
                    background-repeat:no-repeat;image-rendering:pixelated;
                    border:1px solid rgba(0,0,0,0.15);cursor:pointer;position:relative;
                    text-align:center;line-height:${TS}px;font-size:${Math.max(10,Math.round(TS*0.6))}px`;
            } else {
                c.style.cssText = `width:${TS}px;height:${TS}px;
                    background:${MapManager.config.colors[tv] || '#ff00ff'};
                    border:1px solid rgba(0,0,0,0.1);cursor:pointer;position:relative;
                    text-align:center;line-height:${TS}px;font-size:${Math.max(10,Math.round(TS*0.6))}px`;
            }

            // Event overlay icon
            const ev = MapManager.currentEvents.find(e => e.x === x && e.y === y);
            if (ev) {
                const icon = ev.actions ? '📜' : (MapManager.config.eventIcons[ev.type] || '?');
                c.innerText = icon;
                c.style.textShadow = '0 0 3px black';
                if (ev.actions) c.style.outline = '1px solid #bb86fc';
            }

            // Object overlay icon (stacked on top of terrain)
            const obj = MapManager.currentObjects.find(o => o.x === x && o.y === y);
            if (obj) {
                // Create a small overlay element for the object
                const ov = document.createElement('div');
                ov.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;
                    display:flex;align-items:center;justify-content:center;
                    font-size:14px;text-shadow:0 0 3px black;pointer-events:none;`;
                ov.textContent = obj.icon;
                c.style.position = 'relative';
                c.appendChild(ov);
                if (obj.type === 'LIGHT') c.style.outline = '1px solid #ffcc44';
                else if (obj.blocking)    c.style.outline = '1px solid #ff6644';
            }

            c.onmouseover = () => {
                c.style.outline = '2px solid white';
                const infoEl = document.getElementById('cellInfo');
                if (!infoEl) return;

                // ── Tile info ──
                let tileDesc = loaded
                    ? `Tile #${tv} · col ${tv%tCols} row ${Math.floor(tv/tCols)}`
                    : (MapManager.config.names[tv] || `Tile ${tv}`);

                // ── Object info ──
                let objHtml = '';
                if (obj) {
                    const typeColor = obj.type === 'LIGHT' ? '#ffcc44' : obj.blocking ? '#ff8844' : '#88aaff';
                    objHtml = `<div style="margin-top:6px;padding:5px 8px;background:rgba(255,200,50,0.07);
                        border-left:2px solid ${typeColor};border-radius:3px">
                        <span style="color:${typeColor}">${obj.icon} ${obj.label}</span>
                        <span style="color:#666;font-size:10px;margin-left:4px">[${obj.type}]</span>
                        ${obj.type==='LIGHT' ? `<div style="color:#888;font-size:10px">radius ${obj.light?.radius} · ${obj.light?.flicker?'flickering':'steady'}${obj.flagKey ? ` · flag: ${obj.flagKey}` : ''}</div>` : ''}
                        ${obj.blocking ? '<div style="color:#ff8844;font-size:10px">⛔ blocks movement</div>' : ''}
                    </div>`;
                }

                // ── Event info ──
                let evHtml = '';
                if (ev) {
                    if (ev.actions) {
                        evHtml = `<div style="margin-top:6px;padding:5px 8px;background:rgba(187,134,252,0.07);
                            border-left:2px solid #bb86fc;border-radius:3px">
                            <span style="color:#bb86fc">📜 Script</span>
                            <span style="color:#666;font-size:10px;margin-left:4px">trigger: ${ev.trigger||'INTERACT'}</span>
                            <div style="color:#888;font-size:10px">${ev.actions.length} action${ev.actions.length!==1?'s':''}</div>
                        </div>`;
                    } else {
                        const evColor = ev.type==='NPC'?'#bb86fc':ev.type==='ENEMY'?'#ff6666':ev.type==='TELEPORT'?'#44ccff':ev.type==='SHOP'?'#44ffaa':'#ffcc44';
                        const evIcon  = MapManager.config.eventIcons[ev.type] || '?';
                        // For NPC events, look up the friendly name
                        let evData = String(ev.data||'');
                        if (ev.type === 'NPC') {
                            const npc = (MapManager.npcs||[]).find(n => n.name === evData);
                            evData = npc ? `${npc.icon||'👤'} ${npc.name}${npc.is_enemy?' ⚔️':''}` : evData;
                        } else if (ev.type === 'TELEPORT') {
                            const parts = evData.split(',');
                            const destMap = (MapManager._mapList||[]).find(m=>String(m.id)===parts[0]);
                            evData = destMap ? `→ ${destMap.name} (${parts[1]},${parts[2]})` : `→ map ${evData}`;
                        }
                        evHtml = `<div style="margin-top:6px;padding:5px 8px;background:rgba(0,0,0,0.3);
                            border-left:2px solid ${evColor};border-radius:3px">
                            <span style="color:${evColor}">${evIcon} ${ev.type}</span>
                            <div style="color:#aaa;font-size:11px">${evData}</div>
                        </div>`;
                    }
                }

                infoEl.innerHTML = `
                    <div style="color:#ccc;font-weight:bold;margin-bottom:4px">(${x}, ${y})</div>
                    <div style="color:#666;font-size:10px">${tileDesc}</div>
                    ${objHtml}${evHtml}
                    ${!obj && !ev ? '<div style="color:#333;font-size:11px;margin-top:6px">Empty tile</div>' : ''}
                `;
            };
            c.onmouseout = () => {
                const hasObj = !!obj;
                const hasEv  = !!ev;
                if (hasObj && obj.type === 'LIGHT') c.style.outline = '1px solid #ffcc44';
                else if (hasObj && obj.blocking)    c.style.outline = '1px solid #ff6644';
                else if (hasEv && ev.actions)       c.style.outline = '1px solid #bb86fc';
                else                                c.style.outline = '';
            };
            c.onclick = () => MapManager.handleClick(i, x, y);
            g.appendChild(c);
        });
    },

    // ── CLICK HANDLING ───────────────────────────────────────────

    handleClick: (index, x, y) => {

        // ── TERRAIN layer ──
        if (MapManager.activeLayer === 'TILES') {
            MapManager.currentTiles[index] = MapManager.currentBrush;
            MapManager.renderGrid();
            return;
        }

        // ── OBJECTS layer ──
        if (MapManager.activeLayer === 'OBJECTS') {
            const oi = MapManager.currentObjects.findIndex(o => o.x === x && o.y === y);
            const existing = oi >= 0 ? MapManager.currentObjects[oi] : null;

            if (MapManager.currentObjectPreset === 'ERASER') {
                if (oi >= 0) MapManager.currentObjects.splice(oi, 1);
                MapManager.renderGrid();
                return;
            }

            const presetKey = MapManager.currentObjectPreset;
            const preset    = OBJECT_PRESETS[presetKey];
            if (!preset) return;

            // If clicking existing object: open appropriate editor
            if (existing && existing.preset === presetKey) {
                if (presetKey === 'CUSTOM' || existing.sprite_url) {
                    MapManager._openCustomPropModal(x, y, oi);
                } else {
                    MapManager._editObjectFlags(oi, x, y);
                }
                return;
            }

            // CUSTOM preset: open a config modal instead of placing directly
            if (presetKey === 'CUSTOM') {
                MapManager._openCustomPropModal(x, y, existing ? oi : -1);
                return;
            }

            // SIGN preset: prompt for text
            if (preset.hasText) {
                const existingText = existing ? (existing.text || '') : '';
                const text = prompt('Sign text (what the player reads):', existingText);
                if (text === null) return; // cancelled
                const newObj = {
                    x, y,
                    preset:    presetKey,
                    icon:      preset.icon,
                    label:     preset.label,
                    type:      preset.type,
                    blocking:  preset.blocking,
                    light:     null,
                    flagKey:   null,
                    text:      text || '',
                    sprite_url: null, sprite_w: 32, sprite_h: 32,
                    anim_frames: null, anim_fps: 6,
                };
                if (oi >= 0) MapManager.currentObjects[oi] = newObj;
                else         MapManager.currentObjects.push(newObj);
                MapManager.renderGrid();
                return;
            }

            // Place new object from preset
            const newObj = {
                x, y,
                preset:       presetKey,
                icon:         preset.icon,
                label:        preset.label,
                type:         preset.type,
                blocking:     preset.blocking,
                light:        preset.light ? { ...preset.light } : null,
                flagKey:      null,
                // Sprite fields — empty for emoji presets, filled for custom
                sprite_url:   preset.sprite_url   || null,
                sprite_w:     preset.sprite_w      || 32,
                sprite_h:     preset.sprite_h      || 32,
                anim_frames:  preset.anim_frames   || null,
                anim_fps:     preset.anim_fps      || 6,
            };
            if (oi >= 0) MapManager.currentObjects[oi] = newObj;
            else         MapManager.currentObjects.push(newObj);
            MapManager.renderGrid();
            return;
        }

        // ── EVENTS layer ──
        const ei = MapManager.currentEvents.findIndex(e => e.x === x && e.y === y);
        const existing = ei >= 0 ? MapManager.currentEvents[ei] : null;

        if (MapManager.currentTool === 'ERASER') {
            if (ei >= 0) MapManager.currentEvents.splice(ei, 1);
            MapManager.renderGrid();
            return;
        }

        if (MapManager.currentTool === 'SCRIPT') {
            const event = (existing && existing.actions)
                ? JSON.parse(JSON.stringify(existing))
                : { x, y, trigger: 'INTERACT', conditions: [], actions: [] };

            // Choose editor based on the toggle in the toolbar
            const useNodeGraph = MapManager._scriptEditorMode === 'graph';
            const openFn = useNodeGraph ? NodeGraphEditor.open.bind(NodeGraphEditor) : ScriptEditor.open;

            openFn(event, (result) => {
                if (result === null) { MapManager.renderEditorUI(); return; }
                result.x = x; result.y = y;
                if (ei >= 0) MapManager.currentEvents[ei] = result;
                else         MapManager.currentEvents.push(result);
                MapManager.renderEditorUI();
            });
            return;
        }

        // For NPC placement: show a dropdown of all NPCs in the DB
        // This prevents typos breaking persona loading (server matches by name)
        if (MapManager.currentTool === 'NPC') {
            MapManager._pickNpc(x, y, ei, existing);
            return;
        }

        // All event types use a proper picker modal — no more raw prompt()
        if (MapManager.currentTool === 'ENEMY')    { MapManager._pickEnemy(x, y, ei, existing);    return; }
        if (MapManager.currentTool === 'TELEPORT') { MapManager._pickTeleport(x, y, ei, existing); return; }
        if (MapManager.currentTool === 'SHOP')     { MapManager._pickShop(x, y, ei, existing);     return; }
        if (MapManager.currentTool === 'LOOT')     { MapManager._pickLoot(x, y, ei, existing);     return; }
        if (MapManager.currentTool === 'TERRAIN')  { MapManager._pickTerrain(x, y, ei, existing);  return; }

        // Fallback for unknown future tool types — show a simple inline modal
        MapManager._pickGenericData(x, y, ei, existing);
    },

    // Edit a placed object's flagKey (and light radius override)
    // ── CUSTOM SPRITE MODAL ─────────────────────────────────────
    // Teaching: prompt() is synchronous and blocks the browser — bad UX.
    // Instead we inject a modal div into the page body and read its values
    // when the user clicks Save. This is how real apps handle input.
    _openCustomPropModal: (x, y, oi) => {
        const existing = oi >= 0 ? MapManager.currentObjects[oi] : null;
        const modal = document.createElement('div');
        modal.id = 'customPropModal';
        modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.75);
            display:flex;align-items:center;justify-content:center;z-index:9999`;
        modal.innerHTML = `
        <div style="background:#0d1117;border:1px solid #30363d;border-radius:12px;
                    padding:24px;width:460px;max-width:95vw;font-family:monospace">
            <div style="font-size:14px;font-weight:700;color:#bb86fc;margin-bottom:18px">
                🖼️ Custom Sprite — (${x}, ${y})
            </div>

            <label style="font-size:11px;color:#8b949e;display:block;margin-bottom:4px">
                Sprite path (relative to /assets/sprites/objects/)
            </label>
            <input id="cp_url" style="width:100%;box-sizing:border-box;margin-bottom:4px"
                placeholder="chest/chest_closed.png"
                value="${existing?.sprite_url ? existing.sprite_url.replace('/assets/sprites/objects/','') : ''}">
            <div style="font-size:10px;color:#484f58;margin-bottom:14px">
                Full URL will be: <code style="color:#3fb950">/assets/sprites/objects/[path]</code>
            </div>

            <div style="font-size:11px;color:#8b949e;margin-bottom:4px">Sprite size (px)</div>
            <div style="display:flex;gap:10px;margin-bottom:14px">
                <div style="flex:1">
                    <label style="font-size:10px;color:#484f58">Width</label>
                    <input id="cp_w" type="number" value="${existing?.sprite_w||32}" min="8" max="256">
                </div>
                <div style="flex:1">
                    <label style="font-size:10px;color:#484f58">Height</label>
                    <input id="cp_h" type="number" value="${existing?.sprite_h||32}" min="8" max="256">
                </div>
            </div>

            <div style="font-size:11px;color:#8b949e;margin-bottom:4px">Label &amp; icon (for map editor)</div>
            <div style="display:flex;gap:10px;margin-bottom:14px">
                <input id="cp_label" style="flex:3" placeholder="Treasure Chest"
                    value="${existing?.label||'Custom Prop'}">
                <input id="cp_icon" style="flex:1;text-align:center" placeholder="🎁"
                    value="${existing?.icon||'🖼️'}">
            </div>

            <div style="display:flex;gap:10px;margin-bottom:14px">
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#8b949e;cursor:pointer">
                    <input type="checkbox" id="cp_blocking" ${existing?.blocking?'checked':''}>
                    Blocks movement
                </label>
            </div>

            <details style="margin-bottom:16px">
                <summary style="font-size:11px;color:#8b949e;cursor:pointer;margin-bottom:8px">
                    🎬 Animation frames (optional)
                </summary>
                <div style="font-size:10px;color:#484f58;margin-bottom:6px">
                    Comma-separated paths for frame-by-frame animation.<br>
                    e.g. <code style="color:#3fb950">chest/chest_open.png,chest/chest_closed.png</code><br>
                    Use a <b>Flag Key</b> to drive open/close from a script event.
                </div>
                <input id="cp_anim" style="width:100%;box-sizing:border-box;margin-bottom:6px;font-size:11px"
                    placeholder="frame0.png,frame1.png,frame2.png"
                    value="${existing?.anim_frames ? existing.anim_frames.map(f=>f.replace('/assets/sprites/objects/','')).join(',') : ''}">
                <div style="display:flex;gap:10px;align-items:center">
                    <label style="font-size:11px;color:#8b949e">FPS:</label>
                    <input id="cp_fps" type="number" style="width:70px" value="${existing?.anim_fps||6}" min="1" max="30">
                    <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#8b949e;cursor:pointer">
                        <input type="checkbox" id="cp_flag_driven" ${existing?.flagKey?'checked':''}>
                        Flag-driven (open/close)
                    </label>
                </div>
                ${existing?.flagKey ? `<input id="cp_flagkey" style="width:100%;box-sizing:border-box;margin-top:6px;font-size:11px"
                    placeholder="e.g. chest_5_3" value="${existing.flagKey||''}">` :
                    `<input id="cp_flagkey" style="width:100%;box-sizing:border-box;margin-top:6px;font-size:11px"
                    placeholder="e.g. chest_${x}_${y}">`}
            </details>

            <div style="display:flex;gap:10px;justify-content:flex-end">
                ${oi >= 0 ? `<button id="cp_delete" style="background:rgba(248,81,73,.15);border:1px solid rgba(248,81,73,.4);
                    color:#f85149;border-radius:6px;padding:8px 16px;cursor:pointer;font-size:12px">
                    🗑 Delete</button>` : ''}
                <button id="cp_cancel" style="background:#21262d;border:1px solid #30363d;
                    color:#8b949e;border-radius:6px;padding:8px 16px;cursor:pointer;font-size:12px">
                    Cancel</button>
                <button id="cp_save" style="background:#bb86fc;border:none;
                    color:#000;border-radius:6px;padding:8px 20px;cursor:pointer;font-size:12px;font-weight:700">
                    Place Sprite</button>
            </div>
        </div>`;
        document.body.appendChild(modal);

        document.getElementById('cp_cancel').onclick = () => modal.remove();
        if (oi >= 0) {
            document.getElementById('cp_delete').onclick = () => {
                MapManager.currentObjects.splice(oi, 1);
                modal.remove();
                MapManager.renderGrid();
            };
        }

        document.getElementById('cp_save').onclick = () => {
            const rawUrl   = document.getElementById('cp_url').value.trim();
            if (!rawUrl) { alert('Sprite path is required.'); return; }
            const spriteUrl  = '/assets/sprites/objects/' + rawUrl;
            const w          = parseInt(document.getElementById('cp_w').value)  || 32;
            const h          = parseInt(document.getElementById('cp_h').value)  || 32;
            const label      = document.getElementById('cp_label').value.trim() || 'Custom Prop';
            const icon       = document.getElementById('cp_icon').value.trim()  || '🖼️';
            const blocking   = document.getElementById('cp_blocking').checked;
            const flagDriven = document.getElementById('cp_flag_driven').checked;
            const flagKey    = document.getElementById('cp_flagkey')?.value.trim() || null;

            const rawAnim = document.getElementById('cp_anim').value.trim();
            let animFrames = null;
            if (rawAnim) {
                animFrames = rawAnim.split(',').map(f => '/assets/sprites/objects/' + f.trim()).filter(Boolean);
                if (animFrames.length < 2) animFrames = null;
            }

            const newObj = {
                x, y,
                preset:      'CUSTOM',
                icon,
                label,
                type:        blocking ? 'PROP' : 'DECO',
                blocking,
                light:       null,
                flagKey:     (flagDriven && flagKey) ? flagKey : null,
                sprite_url:  animFrames ? null : spriteUrl,
                sprite_w:    w,
                sprite_h:    h,
                anim_frames: animFrames ? animFrames : null,
                anim_fps:    parseInt(document.getElementById('cp_fps').value) || 6,
            };

            if (oi >= 0) MapManager.currentObjects[oi] = newObj;
            else         MapManager.currentObjects.push(newObj);
            modal.remove();
            MapManager.renderGrid();
        };
    },

    _editObjectFlags: (oi, x, y) => {
        const obj = MapManager.currentObjects[oi];
        const isLight = obj.type === 'LIGHT' && obj.light;
        const modal = document.createElement('div');
        modal.id = 'mm_obj_modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center';
        modal.innerHTML = `
        <div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:22px;min-width:420px;max-width:95vw">
            <h3 style="margin:0 0 4px;color:#bb86fc">${obj.icon} ${obj.label}</h3>
            <p style="color:#484f58;font-size:12px;margin:0 0 14px">Edit this object's world flag link${isLight?' and light settings':''}.</p>
            <label style="font-size:12px;color:#8b949e">Flag Key <span style="color:#484f58">(leave blank = always visible)</span></label>
            <input id="mm_obj_fk" value="${obj.flagKey||''}" placeholder="e.g. lantern_${x}_${y}" style="margin-bottom:6px">
            <div style="font-size:10px;color:#484f58;margin-bottom:14px">Tip: To toggle with a SCRIPT event → SET_MAP_FLAG { key: "lantern_${x}_${y}", value: false }</div>
            ${isLight ? `
            <label style="font-size:12px;color:#8b949e">Light Radius (tiles)</label>
            <input type="number" id="mm_obj_r" value="${obj.light.radius}" min="0.5" max="20" step="0.5" style="margin-bottom:14px">` : ''}
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="edit-btn" onclick="document.getElementById('mm_obj_modal').remove()">Cancel</button>
                <button class="action-btn save-btn" onclick="MapManager._doEditFlags(${oi})">Save</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('mm_obj_fk')?.focus(), 50);
    },

    _doEditFlags: (oi) => {
        const obj = MapManager.currentObjects[oi];
        const fk = document.getElementById('mm_obj_fk')?.value?.trim() || null;
        obj.flagKey = fk;
        if (obj.type === 'LIGHT' && obj.light) {
            const r = parseFloat(document.getElementById('mm_obj_r')?.value);
            if (!isNaN(r)) obj.light.radius = r;
        }
        document.getElementById('mm_obj_modal')?.remove();
        MapManager.renderGrid();
    },

    _pickGenericData: (x, y, ei, existing) => {
        const modal = document.createElement('div');
        modal.id = 'mm_generic_modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center';
        modal.innerHTML = `
        <div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:22px;min-width:380px">
            <h3 style="margin:0 0 4px;color:#bb86fc">Event Data (${MapManager.currentTool})</h3>
            <input id="mm_gen_data" value="${(existing&&existing.data)||''}" placeholder="Event data..." style="margin-bottom:14px">
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="edit-btn" onclick="document.getElementById('mm_generic_modal').remove()">Cancel</button>
                <button class="action-btn save-btn" onclick="MapManager._doGenericData(${x},${y},${ei})">Save</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('mm_gen_data')?.focus(), 50);
    },

    _doGenericData: (x, y, ei) => {
        const d = document.getElementById('mm_gen_data')?.value || '';
        document.getElementById('mm_generic_modal')?.remove();
        const nE = { x, y, type: MapManager.currentTool, data: d };
        if (ei >= 0) MapManager.currentEvents[ei] = nE;
        else         MapManager.currentEvents.push(nE);
        MapManager.renderGrid();
    },

    // ── ZOOM ─────────────────────────────────────────────────────
    setZoom: (val) => {
        MapManager.zoom = parseFloat(val) || 1;
        const lbl = document.getElementById('zoomLabel');
        if (lbl) lbl.textContent = MapManager.zoom + 'x';
        MapManager.renderGrid();
        // Refresh grid container size
        const g = document.getElementById('mapGrid');
        const TS = Math.round(EDITOR_TILE * MapManager.zoom);
        if (g) {
            g.style.gridTemplateColumns = `repeat(${MapManager.currentWidth},${TS}px)`;
            g.style.gridTemplateRows    = `repeat(${MapManager.currentHeight},${TS}px)`;
            g.style.width  = (MapManager.currentWidth  * TS) + 'px';
            g.style.height = (MapManager.currentHeight * TS) + 'px';
        }
    },

    // ── ALWAYS-ON INSPECTOR (Events layer side panel) ────────────
    // TEACHING: Previously cellInfo only existed in the Events layer side panel,
    // and only updated on hover. Now it's a rich persistent panel that:
    //   - Shows tile info (index, col/row in tileset) on all layers
    //   - Shows any object on that tile (type, blocking, light radius)
    //   - Shows any event on that tile (type, data, script actions)
    //   - Stays visible and refreshes as you move the mouse
    _renderEventsInspector: () => {
        const el = document.getElementById('sidePanel');
        if (!el) return;

        // Map summary counts
        const evCount  = MapManager.currentEvents.length;
        const objCount = MapManager.currentObjects.length;
        const npcEvents   = MapManager.currentEvents.filter(e => e.type === 'NPC').length;
        const enemyEvents = MapManager.currentEvents.filter(e => e.type === 'ENEMY').length;
        const tpEvents    = MapManager.currentEvents.filter(e => e.type === 'TELEPORT').length;
        const scriptEvents= MapManager.currentEvents.filter(e => e.actions).length;

        el.innerHTML = `
            <div style="color:#bb86fc;font-size:11px;letter-spacing:1px;margin-bottom:10px">⚙️ EVENTS LAYER</div>

            <!-- Map summary -->
            <div style="background:rgba(255,255,255,0.03);border:1px solid #2a2a2a;border-radius:6px;padding:10px;margin-bottom:12px;font-size:11px">
                <div style="color:#666;font-size:10px;letter-spacing:1px;margin-bottom:6px">MAP SUMMARY</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
                    ${npcEvents   ? `<div style="color:#bb86fc">👤 ${npcEvents} NPC${npcEvents>1?'s':''}</div>` : ''}
                    ${enemyEvents ? `<div style="color:#ff6666">⚔️ ${enemyEvents} enemy trigger${enemyEvents>1?'s':''}</div>` : ''}
                    ${tpEvents    ? `<div style="color:#44ccff">🚪 ${tpEvents} teleport${tpEvents>1?'s':''}</div>` : ''}
                    ${scriptEvents? `<div style="color:#ffcc44">📜 ${scriptEvents} script${scriptEvents>1?'s':''}</div>` : ''}
                    ${objCount    ? `<div style="color:#ffcc44">🏮 ${objCount} object${objCount>1?'s':''}</div>` : ''}
                    ${!evCount && !objCount ? '<div style="color:#444">No events yet</div>' : ''}
                </div>
            </div>

            <!-- Cell inspector - updates on hover -->
            <div style="color:#666;font-size:10px;letter-spacing:1px;margin-bottom:6px">CELL INSPECTOR</div>
            <div id="cellInfo" style="color:#555;font-size:12px;line-height:1.7">
                Hover over any tile to inspect it.
            </div>

            <!-- Event list -->
            ${evCount > 0 ? `
            <div style="margin-top:14px;border-top:1px solid #222;padding-top:10px">
                <div style="color:#666;font-size:10px;letter-spacing:1px;margin-bottom:8px">ALL EVENTS</div>
                <div style="max-height:260px;overflow-y:auto">
                    ${MapManager.currentEvents.map((ev, i) => {
                        const icon = ev.actions ? '📜' : (MapManager.config.eventIcons[ev.type] || '?');
                        const label = ev.actions
                            ? `Script (${ev.trigger||'INTERACT'}) · ${ev.actions.length} actions`
                            : `${ev.type}: ${String(ev.data||'').substring(0,20)}`;
                        return `<div onclick="MapManager._flashTile(${ev.x},${ev.y})"
                            style="display:flex;align-items:center;gap:6px;padding:5px 8px;margin-bottom:2px;
                                   background:rgba(255,255,255,0.03);border-radius:4px;cursor:pointer;
                                   border:1px solid #222;font-size:11px"
                            onmouseover="this.style.background='rgba(187,134,252,0.1)'"
                            onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                            <span style="font-size:14px">${icon}</span>
                            <div>
                                <div style="color:#ccc">${label}</div>
                                <div style="color:#555;font-size:10px">(${ev.x}, ${ev.y})</div>
                            </div>
                            <button onclick="event.stopPropagation();MapManager._deleteEvent(${i})"
                                style="margin-left:auto;background:none;border:1px solid #442222;color:#cc4444;
                                       padding:1px 6px;cursor:pointer;border-radius:3px;font-size:10px">✕</button>
                        </div>`;
                    }).join('')}
                </div>
            </div>` : ''}
        `;
    },

    // Flash a tile briefly to show where a listed event is on the grid
    _flashTile: (x, y) => {
        const g = document.getElementById('mapGrid');
        if (!g) return;
        const idx = y * MapManager.currentWidth + x;
        const tile = g.children[idx];
        if (!tile) return;
        tile.style.outline = '3px solid #ffff00';
        tile.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setTimeout(() => { tile.style.outline = ''; MapManager.renderGrid(); }, 1200);
    },

    // Delete an event by index from the list
    _deleteEvent: (i) => {
        MapManager.currentEvents.splice(i, 1);
        MapManager.renderSidePanel();
        MapManager.renderGrid();
    },

    // ── PICKER MODALS ─────────────────────────────────────────────
    // TEACHING: Instead of prompt() which gives a blank text box
    // with no guidance, each event type has a dedicated modal that:
    //   - Shows only valid options (loaded from DB)
    //   - Labels everything clearly
    //   - Pre-selects the existing value when editing

    _showModal: (id, html, onConfirm) => {
        document.getElementById(id)?.remove();
        const modal = document.createElement('div');
        modal.id = id;
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999';
        modal.innerHTML = `
            <div style="background:#1a1a2e;border:1px solid #444;border-radius:10px;padding:24px;min-width:340px;max-width:520px;width:90%">
                ${html}
                <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
                    <button onclick="document.getElementById('${id}').remove()"
                        style="background:#333;border:1px solid #555;color:#aaa;padding:8px 18px;border-radius:5px;cursor:pointer">Cancel</button>
                    <button id="${id}_confirm"
                        style="background:#bb86fc;border:none;color:#000;font-weight:bold;padding:8px 18px;border-radius:5px;cursor:pointer">Place</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById(id + '_confirm').onclick = onConfirm;
    },

    // ENEMY picker — shows enemies only (is_enemy=1), displays level + icon
    _pickEnemy: (x, y, ei, existing) => {
        const enemies = (MapManager.npcs || []).filter(n => n.is_enemy == 1);
        if (!enemies.length) {
            alert('No enemy NPCs found. Create an enemy in the NPC Manager first (check "Is Enemy" and save combat stats).');
            return;
        }
        const currentVal = existing ? String(existing.data) : '';
        const opts = enemies.map(n => {
            let cs = {};
            try { cs = typeof n.stats_json === 'object' ? (n.stats_json||{}) : JSON.parse(n.stats_json||'{}'); } catch {}
            const lvl = cs.level || '?';
            const sel = String(n.char_id) === currentVal || n.name === currentVal ? 'selected' : '';
            return `<option value="${n.char_id||n.id}" ${sel}>${n.icon||'👹'} ${n.name} (Lv${lvl}, ID:${n.char_id||n.id})</option>`;
        }).join('');

        MapManager._showModal('enemyPickModal',
            `<h3 style="margin:0 0 16px;color:#ff6666">⚔️ Place Enemy Trigger at (${x}, ${y})</h3>
            <p style="color:#888;font-size:12px;margin:0 0 12px">
                When a player walks onto this tile, a PvE battle starts with the selected enemy.
            </p>
            <label style="color:#aaa;font-size:12px;display:block;margin-bottom:6px">Select Enemy NPC</label>
            <select id="enemyPickSelect" style="width:100%;background:#111;border:1px solid #555;color:#fff;padding:8px;border-radius:4px;font-size:13px">${opts}</select>`,
            () => {
                const val = document.getElementById('enemyPickSelect').value;
                if (val) {
                    const nE = { x, y, type: 'ENEMY', data: val };
                    if (ei >= 0) MapManager.currentEvents[ei] = nE;
                    else MapManager.currentEvents.push(nE);
                    MapManager.renderGrid();
                    MapManager.renderSidePanel();
                }
                document.getElementById('enemyPickModal').remove();
            }
        );
    },

    // TELEPORT picker — map dropdown + X/Y inputs
    _pickTeleport: async (x, y, ei, existing) => {
        // Load maps list
        const r = await API.getAll('map');
        const maps = r.success ? r.data : [];
        // Parse existing data "mapId,x,y"
        let exMap = '', exX = 0, exY = 0;
        if (existing && existing.data) {
            const parts = String(existing.data).split(',');
            exMap = parts[0] || ''; exX = parseInt(parts[1])||0; exY = parseInt(parts[2])||0;
        }
        const opts = maps.map(m =>
            `<option value="${m.id}" ${String(m.id)===exMap?'selected':''}>${m.name} (${m.width}×${m.height}) [ID:${m.id}]</option>`
        ).join('');

        MapManager._showModal('tpPickModal',
            `<h3 style="margin:0 0 16px;color:#44ccff">🚪 Teleport at (${x}, ${y})</h3>
            <p style="color:#888;font-size:12px;margin:0 0 14px">
                Player steps here → teleported to the selected map at the given coordinates.
            </p>
            <label style="color:#aaa;font-size:12px;display:block;margin-bottom:4px">Destination Map</label>
            <select id="tpMap" style="width:100%;background:#111;border:1px solid #555;color:#fff;padding:8px;border-radius:4px;font-size:13px;margin-bottom:12px">${opts||'<option value="">No maps found</option>'}</select>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div>
                    <label style="color:#aaa;font-size:12px;display:block;margin-bottom:4px">Destination X</label>
                    <input id="tpX" type="number" min="0" value="${exX}" style="width:100%;background:#111;border:1px solid #555;color:#fff;padding:8px;border-radius:4px;box-sizing:border-box">
                </div>
                <div>
                    <label style="color:#aaa;font-size:12px;display:block;margin-bottom:4px">Destination Y</label>
                    <input id="tpY" type="number" min="0" value="${exY}" style="width:100%;background:#111;border:1px solid #555;color:#fff;padding:8px;border-radius:4px;box-sizing:border-box">
                </div>
            </div>
            <div style="margin-top:10px;font-size:11px;color:#555">💡 Tip: Open the destination map in a second tab to find the right tile coordinates.</div>`,
            () => {
                const mapId = document.getElementById('tpMap').value;
                const tx    = parseInt(document.getElementById('tpX').value) || 0;
                const ty    = parseInt(document.getElementById('tpY').value) || 0;
                if (mapId) {
                    const nE = { x, y, type: 'TELEPORT', data: `${mapId},${tx},${ty}` };
                    if (ei >= 0) MapManager.currentEvents[ei] = nE;
                    else MapManager.currentEvents.push(nE);
                    MapManager.renderGrid();
                    MapManager.renderSidePanel();
                }
                document.getElementById('tpPickModal').remove();
            }
        );
    },

    // SHOP picker — dropdown of all shops
    _pickShop: async (x, y, ei, existing) => {
        const r = await API.getAll('shop');
        const shops = r.success ? r.data : [];
        const currentVal = existing ? String(existing.data) : '';
        const opts = shops.map(s =>
            `<option value="${s.id}" ${String(s.id)===currentVal?'selected':''}>${s.icon||'🏪'} ${s.name} [ID:${s.id}]</option>`
        ).join('');
        if (!shops.length) { alert('No shops found. Create one in the Shop Manager first.'); return; }

        MapManager._showModal('shopPickModal',
            `<h3 style="margin:0 0 16px;color:#44ffaa">🏪 Shop Event at (${x}, ${y})</h3>
            <p style="color:#888;font-size:12px;margin:0 0 12px">Player walks here → shop opens.</p>
            <label style="color:#aaa;font-size:12px;display:block;margin-bottom:4px">Select Shop</label>
            <select id="shopPickSelect" style="width:100%;background:#111;border:1px solid #555;color:#fff;padding:8px;border-radius:4px;font-size:13px">${opts}</select>`,
            () => {
                const val = document.getElementById('shopPickSelect').value;
                if (val) {
                    const nE = { x, y, type: 'SHOP', data: val };
                    if (ei >= 0) MapManager.currentEvents[ei] = nE;
                    else MapManager.currentEvents.push(nE);
                    MapManager.renderGrid();
                    MapManager.renderSidePanel();
                }
                document.getElementById('shopPickModal').remove();
            }
        );
    },

    // LOOT picker — item dropdown with icon, type, value
    _pickLoot: async (x, y, ei, existing) => {
        const r = await API.getAll('item');
        const items = r.success ? r.data : [];
        const currentVal = existing ? String(existing.data) : '';
        const opts = items.map(it =>
            `<option value="${it.id}" ${String(it.id)===currentVal?'selected':''}>${it.icon||'📦'} ${it.name} [${it.type}] [ID:${it.id}]</option>`
        ).join('');
        if (!items.length) { alert('No items found. Create some in the Item Manager first.'); return; }

        MapManager._showModal('lootPickModal',
            `<h3 style="margin:0 0 16px;color:#ffcc44">💎 Loot Event at (${x}, ${y})</h3>
            <p style="color:#888;font-size:12px;margin:0 0 12px">Player walks here → item is added to inventory (once).</p>
            <label style="color:#aaa;font-size:12px;display:block;margin-bottom:4px">Select Item</label>
            <select id="lootPickSelect" style="width:100%;background:#111;border:1px solid #555;color:#fff;padding:8px;border-radius:4px;font-size:13px">${opts}</select>`,
            () => {
                const val = document.getElementById('lootPickSelect').value;
                if (val) {
                    const nE = { x, y, type: 'LOOT', data: val };
                    if (ei >= 0) MapManager.currentEvents[ei] = nE;
                    else MapManager.currentEvents.push(nE);
                    MapManager.renderGrid();
                    MapManager.renderSidePanel();
                }
                document.getElementById('lootPickModal').remove();
            }
        );
    },

        // Appends a hover-inspector strip to the bottom of any side panel.
    // Used by TILES and OBJECTS layers. The EVENTS layer builds its own richer version.
    _appendCellInspector: () => {
        const el = document.getElementById('sidePanel');
        if (!el) return;
        const strip = document.createElement('div');
        strip.style.cssText = 'margin-top:14px;border-top:1px solid #222;padding-top:10px';
        strip.innerHTML = `
            <div style="color:#666;font-size:10px;letter-spacing:1px;margin-bottom:6px">CELL INSPECTOR</div>
            <div id="cellInfo" style="color:#555;font-size:12px;line-height:1.8">
                Hover over any tile to inspect it.
            </div>`;
        el.appendChild(strip);
    },

        // ── STATE HELPERS ────────────────────────────────────────────

    setLayer: (l) => { MapManager.activeLayer = l; MapManager.renderEditorUI(); },
    setBrush: (i) => { MapManager.currentBrush = i; MapManager.renderToolbar(); MapManager.renderSidePanel(); },
    setTool:  (t) => { MapManager.currentTool = t; MapManager.renderToolbar(); },
    setObjectPreset: (key) => { MapManager.currentObjectPreset = key; MapManager.renderToolbar(); MapManager.renderSidePanel(); },
    _setScriptMode: (mode) => { MapManager._scriptEditorMode = mode; MapManager.renderToolbar(); },

    // ── RESIZE ────────────────────────────────────────────────────
    resizeMap: () => {
        const newW = parseInt(document.getElementById('mapResizeW').value) || MapManager.currentWidth;
        const newH = parseInt(document.getElementById('mapResizeH').value) || MapManager.currentHeight;
        if (newW < 5 || newH < 5 || newW > 200 || newH > 200) { alert('Size must be 5–200.'); return; }
        if (newW === MapManager.currentWidth && newH === MapManager.currentHeight) return;
        if (!confirm(`Resize from ${MapManager.currentWidth}×${MapManager.currentHeight} to ${newW}×${newH}? Tiles outside the new bounds will be lost.`)) return;

        const oldW = MapManager.currentWidth, oldH = MapManager.currentHeight;
        const oldTiles = MapManager.currentTiles;
        const newTiles = Array(newW * newH).fill(0);

        // Copy existing tiles that fit within the new bounds
        for (let y = 0; y < Math.min(oldH, newH); y++) {
            for (let x = 0; x < Math.min(oldW, newW); x++) {
                newTiles[y * newW + x] = oldTiles[y * oldW + x];
            }
        }

        // Filter out events/objects outside new bounds
        MapManager.currentEvents  = (MapManager.currentEvents  || []).filter(e => e.x < newW && e.y < newH);
        MapManager.currentObjects = (MapManager.currentObjects || []).filter(o => o.x < newW && o.y < newH);

        MapManager.currentWidth  = newW;
        MapManager.currentHeight = newH;
        MapManager.currentTiles  = newTiles;
        MapManager.renderEditorUI();
    },

    // ── SAVE ─────────────────────────────────────────────────────

    save: async () => {
        const payload = {
            width:            MapManager.currentWidth,
            height:           MapManager.currentHeight,
            tiles_json:       JSON.stringify(MapManager.currentTiles),
            collisions_json:  JSON.stringify(MapManager.currentEvents),
            objects_json:     JSON.stringify(MapManager.currentObjects),
            anims_json:       JSON.stringify(MapManager.currentAnims),
            ambient_dark:     MapManager.currentAmbientDark,
            tileset_url:      MapManager.currentTilesetUrl || null
        };
        const r = await API.save('map', payload, MapManager.currentMapId);
        if (r.success) {
            await API.clearCache(MapManager.currentMapId);
            const btn = document.querySelector('.save-btn');
            if (btn) {
                const orig = btn.innerText;
                btn.innerText = '✔ Saved!';
                setTimeout(() => { btn.innerText = orig; }, 1500);
            }
        } else {
            alert('Save failed: ' + r.message);
        }
    },

    deleteMap: async (id) => {
        if (confirm('Delete map?')) { await API.delete('map', id); MapManager.init(); }
    }
,

    _pickTerrain: (x, y, ei, existing) => {
        // TEACHING: Terrain events change how the tactical grid plays.
        // forest = cover (20% DR), high_ground = +1 range +15% dmg,
        // water = slows (attack -10%), cover = solid cover (30% DR).
        // The battle engine reads these on battle start from collisions_json.
        const TERRAIN_TYPES = [
            { id: 'forest',      label: 'Forest',      icon: '🌲', desc: 'Cover: -20% incoming damage' },
            { id: 'high_ground', label: 'High Ground', icon: '⛰️', desc: '+1 range, +15% outgoing damage' },
            { id: 'water',       label: 'Water',       icon: '🌊', desc: 'Slow: -10% outgoing damage. Extinguishes Burning.' },
            { id: 'cover',       label: 'Hard Cover',  icon: '🧱', desc: 'Cover: -30% incoming damage' },
            { id: 'fire',        label: 'Fire',        icon: '🔥', desc: '8 dmg per turn to standing unit. Spread from Burning.' },
        ];
        const current = existing?.terrain || '';
        const modal = document.createElement('div');
        modal.id = 'terrainModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center';
        modal.innerHTML = `
            <div style="background:#1a1a2e;border:1px solid #bb86fc;border-radius:10px;padding:24px;min-width:340px;max-width:440px">
                <h3 style="margin:0 0 16px;color:#bb86fc">🌿 Place Terrain at (${x}, ${y})</h3>
                <div style="font-size:11px;color:#888;margin-bottom:16px">
                    Terrain affects combat on the tactical grid. Place on tiles where you want positioning to matter.
                </div>
                ${TERRAIN_TYPES.map(t => `
                    <label style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;margin-bottom:6px;
                        background:${current===t.id?'rgba(187,134,252,.08)':'rgba(255,255,255,.02)'};
                        border:1px solid ${current===t.id?'#bb86fc':'#1a1a2a'}">
                        <input type="radio" name="terrain_pick" value="${t.id}" ${current===t.id?'checked':''} style="margin-top:2px">
                        <div>
                            <div style="font-size:13px;color:#e8eef6">${t.icon} ${t.label}</div>
                            <div style="font-size:10px;color:#666">${t.desc}</div>
                        </div>
                    </label>`).join('')}
                <div style="display:flex;gap:8px;margin-top:16px">
                    <button id="terrainPlace"
                        style="flex:1;padding:10px;background:#4a0080;border:1px solid #bb86fc;color:#fff;cursor:pointer;border-radius:6px;font-family:monospace">
                        PLACE TERRAIN
                    </button>
                    ${existing ? `<button id="terrainRemove"
                        style="padding:10px 16px;background:#400000;border:1px solid #ff4444;color:#fff;cursor:pointer;border-radius:6px;font-family:monospace">
                        REMOVE
                    </button>` : ''}
                    <button id="terrainCancel"
                        style="padding:10px 16px;background:transparent;border:1px solid #333;color:#555;cursor:pointer;border-radius:6px;font-family:monospace">
                        CANCEL
                    </button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('terrainCancel').onclick = () => modal.remove();
        document.getElementById('terrainPlace').onclick = () => {
            const sel = modal.querySelector('input[name="terrain_pick"]:checked');
            if (!sel) { alert('Pick a terrain type.'); return; }
            const t = TERRAIN_TYPES.find(t => t.id === sel.value);
            const nE = { x, y, type: 'TERRAIN', terrain: t.id, data: t.label, icon: t.icon };
            if (existing) MapManager.state.events[ei] = nE;
            else MapManager.state.events.push(nE);
            MapManager._saveAndRedraw();
            modal.remove();
        };
        const removeBtn = document.getElementById('terrainRemove');
        if (removeBtn) {
            removeBtn.onclick = () => {
                MapManager.state.events.splice(ei, 1);
                MapManager._saveAndRedraw();
                modal.remove();
            };
        }
    }

};
