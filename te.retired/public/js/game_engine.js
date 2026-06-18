// =================================================================
// TWISTED GAME ENGINE — CLIENT v5.2 (Modular)
// Core: Game state, init, gameLoop, socket setup, input, utilities
// Sub-modules: engine-npc.js, engine-events.js, engine-render.js
// =================================================================

// --- TILESET ---
const TILESET = {
    img:    null,
    cols:   0,
    rows:   0,
    loaded: false,
    url:    ''
};

// --- SPRITE CACHE ---
const SPRITE_CACHE = new Map();

function getSprite(url) {
    if (!url) return null;
    if (SPRITE_CACHE.has(url)) return SPRITE_CACHE.get(url);
    const entry = { img: new Image(), loaded: false, error: false };
    entry.img.onload  = () => { entry.loaded = true; };
    entry.img.onerror = () => { entry.error  = true; };
    entry.img.src = url;
    SPRITE_CACHE.set(url, entry);
    return entry;
}

function loadTileset(url) {
    if (!url) { TILESET.loaded = false; TILESET.url = ''; return; }
    if (TILESET.url === url && TILESET.loaded) return;
    TILESET.url    = url;
    TILESET.loaded = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        TILESET.img    = img;
        TILESET.cols   = Math.floor(img.naturalWidth  / 32);
        TILESET.rows   = Math.floor(img.naturalHeight / 32);
        TILESET.loaded = TILESET.cols > 0 && TILESET.rows > 0;
        if (!TILESET.loaded)
            console.warn('Tileset: tiles are smaller than 32px:', url);
    };
    img.onerror = () => { TILESET.loaded = false; console.warn('Tileset load failed:', url); };
    img.src = url;
}

const BLOCKED_TILES = [1, 2];

// =================================================================
// GAME STATE
// =================================================================
const Game = {
    npcs: {},
    socket: io(),
    myCharId: null,
    myHero: null,
    players: {},
    map: { id: 0, name: 'Loading...', width: 20, height: 20, tiles: [], events: [] },
    state: {},
    dialogueOpen: false,
    charData: null,
    inArena: null
};

// =================================================================
// LABELS — Configurable game terminology
// =================================================================
window.LABELS = {
    _data: {},
    get(key, fallback) { return this._data[key] !== undefined ? this._data[key] : fallback; },
    load(obj) { if (obj && typeof obj === 'object') Object.assign(this._data, obj); }
};

// =================================================================
// UTILITY FUNCTIONS
// =================================================================
function _escHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;'); }

function updateCoordsUI() {
    document.getElementById('coordX').innerText = Game.myHero.x;
    document.getElementById('coordY').innerText = Game.myHero.y;
}

function updatePlayerCount() {
    document.getElementById('playerCount').innerText = Object.keys(Game.players).length;
}

function tryInteract() {
    const dirs = [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    for (const d of dirs) {
        const x = Game.myHero.x + d.dx, y = Game.myHero.y + d.dy;
        const ev = Game.map.events.find(e => e.x === x && e.y === y);
        if (!ev) continue;
        Game.socket.emit('interact', { x, y });
        return;
    }
}

// Backward-compatible global aliases for chatter (called from engine-npc)
function showChatter(speaker, text) {
    if (typeof EngineNpc !== 'undefined') EngineNpc.showChatter(speaker, text);
}

// =================================================================
// WARP TOAST
// =================================================================
Game.socket.on('warp_discovered', ({ mapId, name }) => {
    _showWarpToast(name);
});

function _showWarpToast(name) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);'
        + 'background:rgba(66,165,245,.9);color:#fff;padding:8px 18px;border-radius:20px;'
        + 'font-family:monospace;font-size:12px;z-index:9000;pointer-events:none;'
        + 'animation:warpFadeIn .4s ease';
    el.innerHTML = '✈️ Fast travel unlocked: <b>' + name + '</b>';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

if (!document.getElementById('warpToastStyle')) {
    const s = document.createElement('style');
    s.id = 'warpToastStyle';
    s.textContent = '@keyframes warpFadeIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
    document.head.appendChild(s);
}

// =================================================================
// DUNGEON FLOOR INDICATOR
// =================================================================
function _updateFloorIndicator() {
    let el = document.getElementById('dungeonFloorIndicator');
    if (Game.zoneType === 'DUNGEON' && Game.floorNumber !== null) {
        if (!el) {
            el = document.createElement('div');
            el.id = 'dungeonFloorIndicator';
            el.style.cssText = 'position:fixed;top:10px;right:16px;background:rgba(0,0,0,.75);'
                + 'border:1px solid #444;border-radius:8px;padding:6px 12px;'
                + 'font-family:monospace;font-size:12px;color:#bb86fc;z-index:500;pointer-events:none';
            document.body.appendChild(el);
        }
        const label = Game.dungeonName ? Game.dungeonName + ' ' : '';
        el.innerHTML = '🏚️ ' + label + 'Floor ' + Game.floorNumber;
    } else if (el) {
        el.remove();
    }
}

// =================================================================
// NETWORK — core socket events handled in game_engine.js
// =================================================================
Game.socket.on('error_msg', (msg) => alert(String(msg)));

Game.socket.on('init_self', (data) => {
    if (data.labels) LABELS.load(data.labels);
    Game.players[data.charId] = data;
    Game.myHero = Game.players[data.charId];
    Game.region = data.region || null;
    document.getElementById('charName').innerText = data.name;
    if (typeof RegionHUD !== 'undefined') RegionHUD.update(data.region);
    loadMap(data.mapId);
    loadState();
    loadCharData();
    const STAFF_ROLES = ['ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER'];
    const isStaff = STAFF_ROLES.includes((data.role || '').toUpperCase());
    if (typeof ChatUI    !== 'undefined') ChatUI.init(isStaff);
    if (typeof MinimapUI !== 'undefined') MinimapUI.init();
    if (typeof NearbyUI  !== 'undefined') NearbyUI.init();
    if (typeof PartyUI   !== 'undefined') PartyUI.initSockets();
    if (typeof GuildUI   !== 'undefined') GuildUI.initSockets();
    if (typeof TradeUI   !== 'undefined') TradeUI.initSockets();
    if (typeof FriendsUI !== 'undefined') FriendsUI.init(data.charId || Game.myCharId);
    if (typeof MailUI         !== 'undefined') MailUI.init(data.charId || Game.myCharId);
    if (typeof LeaderboardUI  !== 'undefined') LeaderboardUI.init();
    if (typeof PlayerInspect  !== 'undefined') PlayerInspect._patchChatUI();
    if (typeof AchievementUI  !== 'undefined') AchievementUI.init(data.charId || Game.myCharId);
    if (typeof PresenceUI     !== 'undefined') PresenceUI.init(data.charId || Game.myCharId);
    if (typeof ProfileEditorUI !== 'undefined') ProfileEditorUI.init(data.charId || Game.myCharId, data);
    if (typeof LFPBoardUI      !== 'undefined') LFPBoardUI.init(data.charId || Game.myCharId, data);
    if (typeof GuildNewsUI     !== 'undefined') GuildNewsUI.injectStyles();
});

Game.socket.on('player_list', (list) => {
    Game.players = {};
    list.forEach(p => Game.players[p.charId] = p);
    if (!Game.players[Game.myCharId] && Game.myHero) {
        Game.players[Game.myCharId] = Game.myHero;
    }
    Game.myHero = Game.players[Game.myCharId] || Game.myHero;
    updatePlayerCount();
    if (typeof NearbyUI !== 'undefined') NearbyUI.refresh();
});

Game.socket.on('map_changed', async ({ mapId, mapName, x, y, zoneType, floorNumber, dungeonName, region }) => {
    Game.zoneType    = zoneType    || 'WORLD';
    Game.floorNumber = floorNumber || null;
    Game.dungeonName = dungeonName || null;
    _updateFloorIndicator();
    if (Game.myHero) {
        Game.myHero.x       = x;
        Game.myHero.y       = y;
        Game.myHero.mapId   = mapId;
    }
    if (mapName) {
        const nameEl = document.getElementById('mapName');
        if (nameEl) nameEl.innerText = mapName;
    }
    updateCoordsUI();
    Game.region = region || null;
    if (typeof RegionHUD !== 'undefined') RegionHUD.update(region);
    await loadMap(mapId);
});

Game.socket.on('map_flags_update', (flags) => {
    if (Game.map) Game.map.flags = flags;
});

Game.socket.on('player_moved', (d) => { if (Game.players[d.id]) { Game.players[d.id].x = d.x; Game.players[d.id].y = d.y; } });
Game.socket.on('player_joined', (p) => {
    Game.players[p.charId] = p;
    updatePlayerCount();
    if (typeof NearbyUI !== 'undefined') NearbyUI.refresh();
});
Game.socket.on('player_left', (id) => {
    delete Game.players[id];
    updatePlayerCount();
    if (typeof NearbyUI !== 'undefined') NearbyUI.refresh();
});
Game.socket.on('force_move', (pos) => { if (Game.myHero) { Game.myHero.x = pos.x; Game.myHero.y = pos.y; updateCoordsUI(); } });

// =================================================================
// STATE PERSISTENCE
// =================================================================
async function loadState() {
    try {
        const r = await fetch('/load-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ charId: Game.myCharId}) });
        const j = await r.json();
        if (j.success) Game.state = j.state || {};
    } catch (e) { console.error('State load failed:', e); }
}
async function saveState() {
    await fetch('/save-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ charId: Game.myCharId, state: Game.state }) });
}

// =================================================================
// MAP LOADING
// =================================================================
async function loadMap(mapId) {
    try {
        const r = await fetch('/get-map', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapId }) });
        const j = await r.json();
        if (j.success) {
            Game.map = j.map;
            if (!Array.isArray(Game.map.tiles))   Game.map.tiles   = Array((Game.map.width||20)*(Game.map.height||20)).fill(0);
            if (!Array.isArray(Game.map.events))  Game.map.events  = [];
            if (!Array.isArray(Game.map.objects)) Game.map.objects = [];
            if (!Array.isArray(Game.map.anims))   Game.map.anims   = [];
            Game.map.flags      = Game.map.flags      || {};
            Game.map.ambientDark = Game.map.ambientDark || 0;

            Game.map.animMap = {};
            for (const a of Game.map.anims) {
                if (a.trigger != null && Array.isArray(a.frames) && a.frames.length > 1) {
                    Game.map.animMap[a.trigger] = a;
                }
            }

            loadTileset(Game.map.tileset_url || '');
            document.getElementById('mapName').innerText = Game.map.name;
        }
    } catch (e) { console.error(e); }
}

// =================================================================
// INPUT
// =================================================================
window.addEventListener('keydown', (e) => {
    if (document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
         document.activeElement.tagName === 'TEXTAREA')) return;

    // Panel hotkeys
    if (e.key === 'i' || e.key === 'I') {
        if (Panels.open === 'inventory') { Panels.close(); return; }
        if (!Panels.open && !BattleUI.active) { Panels.openInventory(); return; }
    }
    if (e.key === 'c' || e.key === 'C') {
        if (Panels.open === 'character') { Panels.close(); return; }
        if (!Panels.open && !BattleUI.active) { Panels.openCharacter(); return; }
    }
    if (e.key === 'Enter') {
        if (typeof ChatUI !== 'undefined') {
            const chatInput = document.getElementById('chatInput');
            if (chatInput && !ChatUI.collapsed) {
                chatInput.focus();
                e.preventDefault();
                return;
            }
        }
    }

    if ((e.key === 'q' || e.key === 'Q') && !Panels.open && !BattleUI.active) {
        if (typeof QuestUI !== 'undefined') QuestUI.toggle();
        return;
    }
    if ((e.key === 'p' || e.key === 'P') && !Panels.open && !BattleUI.active) {
        if (typeof QuestUI !== 'undefined' && QuestUI.open) return;
        if (typeof PartyUI !== 'undefined') PartyUI.toggle();
        return;
    }
    if ((e.key === 'g' || e.key === 'G') && !Panels.open && !BattleUI.active) {
        if (typeof GuildUI !== 'undefined') GuildUI.toggle();
        return;
    }
    if ((e.key === 'm' || e.key === 'M') && !Panels.open && !BattleUI.active) {
        if (typeof WorldMapUI !== 'undefined') WorldMapUI.toggle();
        return;
    }
    if ((e.key === 'h' || e.key === 'H') && !Panels.open && !BattleUI.active) {
        if (typeof AuctionUI !== 'undefined') {
            if (AuctionUI._open) AuctionUI.close();
            else AuctionUI.open(Game.myCharId);
        }
        return;
    }
    if ((e.key === 'b' || e.key === 'B') && !Panels.open && !BattleUI.active) {
        if (typeof QuestBoardUI !== 'undefined') {
            if (QuestBoardUI._open) QuestBoardUI.close();
            else QuestBoardUI.open(Game.myCharId, Game.myHero?.mapId);
        }
        return;
    }
    if (e.key === 'Escape' && Panels.open)  { Panels.close(); return; }
    if (e.key === 'Escape' && typeof QuestUI     !== 'undefined' && QuestUI.open)     { QuestUI.close();     return; }
    if (e.key === 'Escape' && typeof PartyUI     !== 'undefined' && PartyUI.open)     { PartyUI.close();     return; }
    if (e.key === 'Escape' && typeof GuildUI     !== 'undefined' && GuildUI.open)     { GuildUI.close();     return; }
    if (e.key === 'Escape' && typeof AuctionUI    !== 'undefined' && AuctionUI._open)    { AuctionUI.close();    return; }
    if (e.key === 'Escape' && typeof QuestBoardUI !== 'undefined' && QuestBoardUI._open) { QuestBoardUI.close(); return; }
    if (e.key === 'Escape' && typeof WorldMapUI  !== 'undefined' && WorldMapUI.open)  { WorldMapUI.close();  return; }

    // Close dialogue
    if (Game.dialogueOpen) {
        if (Panels.open) return;
        if (e.key === ' ' || e.key === 'Escape' || e.key === 'Enter') closeDialogue();
        return;
    }
    if (!Game.myHero) return;

    if (e.key === 'e' || e.key === 'E') { tryInteract(); return; }

    let tx = Game.myHero.x, ty = Game.myHero.y;
    if (e.key === 'w' || e.key === 'ArrowUp') ty--;
    else if (e.key === 's' || e.key === 'ArrowDown') ty++;
    else if (e.key === 'a' || e.key === 'ArrowLeft') tx--;
    else if (e.key === 'd' || e.key === 'ArrowRight') tx++;
    else return;

    if (tx < 0 || tx >= Game.map.width || ty < 0 || ty >= Game.map.height) return;
    const idx = ty * Game.map.width + tx;
    if (BLOCKED_TILES.includes(Game.map.tiles[idx])) return;

    Game.myHero.x = tx; Game.myHero.y = ty;
    updateCoordsUI();
    Game.socket.emit('move', { x: tx, y: ty });
});

// =================================================================
// INIT & GAME LOOP
// =================================================================
function init() {
    const p = new URLSearchParams(window.location.search);
    const id = p.get('id');
    if (id) Game.myCharId = parseInt(id, 10);
    else { alert('No character selected.'); window.location.href = '/'; return; }

    // Initialize sub-modules
    EngineRender.init(Game);
    EngineNpc.init(Game.socket, Game);
    EngineEvents.init(Game.socket, Game);

    Game.socket.emit('join_game', { charId: Game.myCharId });
    requestAnimationFrame(gameLoop);
}

function gameLoop() {
    EngineRender.draw(Game);
    if (typeof MinimapUI !== 'undefined') MinimapUI.draw();
    requestAnimationFrame(gameLoop);
}

init();
