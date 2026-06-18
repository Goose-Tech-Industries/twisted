// =================================================================
// TWISTED GAME ENGINE — CLIENT v5.1 (Dialogue, State & HP/MP Bars)
// =================================================================
const TILE_SIZE = 32;
const CANVAS = document.getElementById('gameCanvas');
const CTX = CANVAS.getContext('2d');

// TEACHING: The lighting system needs its own off-screen canvas.
// We paint a darkness overlay onto LIGHT_CANVAS first, punch holes for
// each light source using destination-out blend mode, then draw the
// whole thing onto the main canvas in one call. This is much faster
// than drawing individual semi-transparent shapes directly, and
// prevents ugly blending artefacts where light circles overlap.
const LIGHT_CANVAS = document.createElement('canvas');
LIGHT_CANVAS.width  = CANVAS.width;
LIGHT_CANVAS.height = CANVAS.height;
const LCTX = LIGHT_CANVAS.getContext('2d');



const TILESET = {
    img:    null,   // The loaded HTMLImageElement
    cols:   0,      // Tiles across (image.naturalWidth / TILE_SIZE)
    rows:   0,      // Tiles down   (image.naturalHeight / TILE_SIZE)
    loaded: false,  // Set true only after onload fires successfully
    url:    ''      // Current URL (to avoid reloading the same image)
};

// =================================================================
// SPRITE CACHE — loads each PNG once, reuses the HTMLImageElement.
// Teaching: Creating a new Image() every frame (60fps × many objects)
// triggers constant garbage collection and flickers. Instead we keep
// a Map<url, {img, loaded, error}> and draw only when loaded=true.
// =================================================================
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

// Character layer base path
const CHAR_BASE = '/assets/sprites/characters/';
const CHAR_LAYER_ORDER = [
    { key: 'body',   folder: 'bodies'  },
    { key: 'head',   folder: 'heads'   },
    { key: 'hair',   folder: 'hair'    },
    { key: 'armor',  folder: 'armor'   },
    { key: 'weapon', folder: 'weapon'  },
    { key: 'acc',    folder: 'acc'     },
];

// Object animation frame clock — separate from tile anims
// Each animated object gets its own phase keyed by "x,y"
const OBJ_ANIM_CLOCK = {};
let   OBJ_ANIM_LAST  = 0;

// Load a tileset from a URL. Safe to call repeatedly -- reuses cached
// image if URL hasn't changed.
function loadTileset(url) {
    if (!url) { TILESET.loaded = false; TILESET.url = ''; return; }
    if (TILESET.url === url && TILESET.loaded) return; // Already loaded
    TILESET.url    = url;
    TILESET.loaded = false;
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Required for external image URLs on canvas
    img.onload = () => {
        TILESET.img    = img;
        TILESET.cols   = Math.floor(img.naturalWidth  / TILE_SIZE);
        TILESET.rows   = Math.floor(img.naturalHeight / TILE_SIZE);
        TILESET.loaded = TILESET.cols > 0 && TILESET.rows > 0;
        if (!TILESET.loaded)
            console.warn('Tileset: tiles are smaller than ' + TILE_SIZE + 'px:', url);
    };
    img.onerror = () => { TILESET.loaded = false; console.warn('Tileset load failed:', url); };
    img.src = url;
}


const COLORS = ['#228822', '#888888', '#2222FF', '#442200'];
const BLOCKED_TILES = [1, 2];
const EVENT_ICONS = { TELEPORT: '🚪', NPC: '👤', ENEMY: '💀', LOOT: '💎', SHOP: '🏪' };

const Game = {
    npcs: {},   // npcId -> { id, name, icon, x, y, mapId } — live NPC positions from server
    socket: io(),
    myCharId: null,
    myHero: null,
    players: {},
    map: { id: 0, name: 'Loading...', width: 20, height: 20, tiles: [], events: [] },
    state: {},
    dialogueOpen: false,
    charData: null, // Full character data for HP/MP display
    inArena: null   // Set when player is inside an arena zone: { arenaId, arenaName, arenaType, ... }
};

function init() {
    const p = new URLSearchParams(window.location.search);
    const id = p.get('id');
    if (id) Game.myCharId = parseInt(id, 10);
    else { alert('No character selected.'); window.location.href = '/'; return; }

    // userId is stored server-side in the session — the cookie handles auth automatically
    Game.socket.emit('join_game', { charId: Game.myCharId });
    requestAnimationFrame(gameLoop);
}

// --- NETWORK ---
Game.socket.on('error_msg', (msg) => alert(String(msg)));

// Warp point discovered
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

// Dungeon floor indicator (shown over game canvas when in a dungeon)
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

// Player appearance update — another player changed their sprite layers
Game.socket.on('player_appearance', ({ charId, appearance }) => {
    // Update the player's appearance in local state so next draw uses new layers
    if (Game.players) {
        const p = Object.values(Game.players).find(pl => pl.charId === charId);
        if (p) p.appearance = appearance;
    }
});

// GM system announces — styled full-screen banner
Game.socket.on('server_announce', ({ message, style }) => {
    const colours = { info:'#1565C0', warning:'#E65100', danger:'#B71C1C' };
    const bg = colours[style] || colours.info;
    const el = document.createElement('div');
    el.id = 'server_announce_banner';
    el.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:99999;
        background:${bg};color:#fff;text-align:center;padding:14px 20px;
        font-family:'Courier New',monospace;font-size:14px;font-weight:700;
        letter-spacing:.5px;box-shadow:0 4px 20px rgba(0,0,0,.6);
        animation:slideDown .3s ease;`;
    el.innerHTML = `📢 ${message} <span style="cursor:pointer;margin-left:16px;opacity:.7" onclick="this.parentNode.remove()">✕</span>`;
    if (!document.getElementById('announce_style')) {
        const s = document.createElement('style');
        s.id = 'announce_style';
        s.textContent = '@keyframes slideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}';
        document.head.appendChild(s);
    }
    const old = document.getElementById('server_announce_banner');
    if (old) old.remove();
    document.body.prepend(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 12000);
});

// World events fired by GM tools
Game.socket.on('world_event', ({ type, ...payload }) => {
    if (type === 'blood_moon') {
        document.body.style.filter = 'sepia(0.4) hue-rotate(-20deg)';
        setTimeout(() => { document.body.style.filter = ''; }, 30000);
        Game.addLog('🩸 A blood moon rises over the land...');
    } else if (type === 'darkness_falls') {
        Game.addLog('🌑 Darkness descends. The torches gutter and die.');
    } else if (type === 'emergency') {
        Game.addLog(`⚠️ ${payload.message || 'Something stirs in the dark...'}`);
    } else {
        Game.addLog(`🌍 World event: ${type}`);
    }
});

// Force disconnect (ban / kick)
Game.socket.on('force_disconnect', ({ reason }) => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;color:#f85149;font-family:monospace;text-align:center;padding:40px';
    el.innerHTML = `<div style="font-size:48px;margin-bottom:16px">🚫</div>
        <div style="font-size:20px;font-weight:700;margin-bottom:8px">Disconnected</div>
        <div style="color:#888;max-width:400px">${reason || 'You have been disconnected by the server.'}</div>`;
    document.body.appendChild(el);
    Game.socket.disconnect();
});

// =================================================================
// LABELS — Configurable game terminology (set via AdminSauce → Settings)
// Usage: LABELS.get('label_attack', 'Attack')
//   → returns custom value from settings, or the default you provide
// =================================================================
window.LABELS = {
    _data: {},
    get(key, fallback) { return this._data[key] !== undefined ? this._data[key] : fallback; },
    load(obj) { if (obj && typeof obj === 'object') Object.assign(this._data, obj); }
};

Game.socket.on('init_self', (data) => {
    // Load labels from server settings
    if (data.labels) LABELS.load(data.labels);
    Game.players[data.charId] = data;
    Game.myHero = Game.players[data.charId];
    Game.region = data.region || null;
    document.getElementById('charName').innerText = data.name;
    // Update region HUD
    if (typeof RegionHUD !== 'undefined') RegionHUD.update(data.region);
    loadMap(data.mapId);
    loadState();
    loadCharData();
    // Initialize chat — pass staff status so admin tab shows/hides correctly
    const STAFF_ROLES = ['ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER'];
    const isStaff = STAFF_ROLES.includes((data.role || '').toUpperCase());
    if (typeof ChatUI    !== 'undefined') ChatUI.init(isStaff);
    // Initialize minimap canvas overlay
    if (typeof MinimapUI !== 'undefined') MinimapUI.init();
    // Initialize nearby players panel (wires into playerCount click)
    if (typeof NearbyUI  !== 'undefined') NearbyUI.init();
    // Wire party real-time socket events
    if (typeof PartyUI   !== 'undefined') PartyUI.initSockets();
    // Wire guild real-time socket events
    if (typeof GuildUI   !== 'undefined') GuildUI.initSockets();
    // Wire trade real-time socket events
    if (typeof TradeUI   !== 'undefined') TradeUI.initSockets();
    // Initialize friends panel (uses charId for API calls)
    if (typeof FriendsUI !== 'undefined') FriendsUI.init(data.charId || Game.myCharId);
    // Initialize mail (uses charId for API calls)
    if (typeof MailUI         !== 'undefined') MailUI.init(data.charId || Game.myCharId);
    // Initialize leaderboard button + hotkey
    if (typeof LeaderboardUI  !== 'undefined') LeaderboardUI.init();
    // Wire PlayerInspect into ChatUI name clicks
    if (typeof PlayerInspect  !== 'undefined') PlayerInspect._patchChatUI();
    // Achievement panel + popup toasts
    if (typeof AchievementUI  !== 'undefined') AchievementUI.init(data.charId || Game.myCharId);
    // Presence / away status (AIM-style)
    if (typeof PresenceUI     !== 'undefined') PresenceUI.init(data.charId || Game.myCharId);
    // Profile editor (bio, color, Spotify)
    if (typeof ProfileEditorUI !== 'undefined') ProfileEditorUI.init(data.charId || Game.myCharId, data);
    if (typeof LFPBoardUI      !== 'undefined') LFPBoardUI.init(data.charId || Game.myCharId, data);
    if (typeof GuildNewsUI     !== 'undefined') GuildNewsUI.injectStyles();
    // Guild bank (initialized lazily on first open via GuildBankUI.open(guildId))
    // — no init needed here, it's triggered from the guild panel
});

// --- PRESENCE CHANGED ---
// When someone on the same map changes their status, update local player record
// so NearbyUI shows the right icon without a full refresh.
Game.socket.on('player_presence_changed', ({ charId, presence, awayMessage }) => {
    if (Game.players[charId]) {
        Game.players[charId].presence    = presence;
        Game.players[charId].awayMessage = awayMessage || null;
    }
    if (typeof NearbyUI !== 'undefined' && NearbyUI.open) NearbyUI.refresh();
});

// --- EMOTE BUBBLE ---
// When another player performs an emote, show a floating bubble above them.
// The emote text also appears in local chat (handled by the chat_msg event).
Game.socket.on('emote_bubble', ({ charId, text }) => {
    // Find this player's screen position
    if (!Game.players[charId] || !Game.canvas) return;
    const p     = Game.players[charId];
    const tileW = Game.tileW || 32;
    const tileH = Game.tileH || 32;
    const cX    = (p.x * tileW) - (Game.camera ? Game.camera.x : 0) + tileW / 2;
    const cY    = (p.y * tileH) - (Game.camera ? Game.camera.y : 0) - 8;

    const bub = document.createElement('div');
    bub.style.cssText = [
        'position:fixed',
        `left:${cX}px`, `top:${cY}px`,
        'transform:translate(-50%,-100%)',
        'background:rgba(5,8,14,0.88)',
        'border:1px solid rgba(187,134,252,0.4)',
        'color:#bb86fc', 'font-size:11px',
        'padding:4px 10px', 'border-radius:8px',
        'white-space:nowrap', 'max-width:200px', 'overflow:hidden',
        'text-overflow:ellipsis', 'z-index:45', 'pointer-events:none',
        'font-family:"Courier New",monospace',
        'animation:chatterIn 0.3s ease',
    ].join(';');
    bub.textContent = text;
    document.body.appendChild(bub);
    setTimeout(() => { bub.style.transition = 'opacity 0.5s'; bub.style.opacity = '0'; }, 2200);
    setTimeout(() => bub.remove(), 2700);
});

// --- NPC LIST ---
// Server sends this on map join and after each NPC tick where something moved.
// We rebuild Game.npcs from scratch each time — simple and reliable.
Game.socket.on('npc_list', (list) => {
    Game.npcs = {};
    (list || []).forEach(n => { Game.npcs[n.id] = n; });
});

// --- ENVIRONMENTAL REACTION (low HP healer hint) ---
Game.socket.on('environmental_reaction', ({ type, text, npcName }) => {
    if (type !== 'low_hp') return;
    const el = document.createElement('div');
    el.style.cssText = [
        'position:fixed','bottom:80px','left:50%','transform:translateX(-50%)',
        'background:rgba(20,0,0,0.85)','border:1px solid #ff4444',
        'color:#ff9999','padding:8px 18px','border-radius:8px',
        'font-size:12px','z-index:27','pointer-events:none',
        'animation:chatterIn 0.3s ease','max-width:400px','text-align:center'
    ].join(';');
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => { el.style.transition='opacity 0.8s'; el.style.opacity='0';
        setTimeout(() => el.remove(), 800); }, 4000);
});

// --- NPC NEED BUBBLE ---
// Server tells us a nearby NPC needs help. Show a clickable bubble.
Game.socket.on('npc_need', ({ npcId, npcName, text }) => {
    // Remove any existing need bubble so they don't pile up
    document.querySelectorAll('.npc-need-bubble').forEach(e => e.remove());

    const el = document.createElement('div');
    el.className = 'npc-need-bubble';
    el.style.cssText = [
        'position:fixed','right:16px','bottom:80px',
        'background:rgba(5,8,14,0.92)','border:1px solid #ffcc44',
        'border-radius:10px','padding:10px 14px','max-width:260px',
        'z-index:26','font-size:12px','cursor:pointer',
        'animation:chatterIn 0.3s ease'
    ].join(';');
    el.innerHTML = `<div style="color:#ffcc44;font-weight:700;margin-bottom:4px">💬 ${npcName}</div>`
        + `<div style="color:#ccc">${text}</div>`
        + `<div style="color:#88ff88;margin-top:6px;font-size:11px">Click to help ›</div>`;
    el.onclick = () => {
        Game.socket.emit('accept_npc_need', { npcId });
        el.remove();
    };
    document.body.appendChild(el);
    setTimeout(() => {
        el.style.transition = 'opacity 0.6s'; el.style.opacity = '0';
        setTimeout(() => el.remove(), 600);
    }, 15000); // Auto-dismiss after 15s
});

// Confirmation when need is resolved
Game.socket.on('npc_need_resolved', ({ npcName, reward_gold, reward_xp, message }) => {
    showChatter(npcName, `${message}${reward_gold ? ` (+${reward_gold}g)` : ''}${reward_xp ? ` (+${reward_xp}xp)` : ''}`);
});

// --- CROWD REACTION ---
// Server sends this when a player enters a map with notable reputation.
// Shown as a cinematic entrance line — top-centre, distinct from chatter bubbles.
Game.socket.on('crowd_reaction', ({ tier, text }) => {
    const el = document.createElement('div');
    const color = tier === 'celebrated' ? '#ffd700'
                : tier === 'friendly'   ? '#88ff88'
                : tier === 'hostile'    ? '#ff6666'
                :                        '#ffaa44';  // wary
    el.style.cssText = [
        'position:fixed', 'left:50%', 'top:50%',
        'transform:translate(-50%,-50%)',
        `color:${color}`,
        'font-size:15px', 'font-style:italic',
        'text-align:center', 'max-width:480px',
        'text-shadow:0 0 12px rgba(0,0,0,0.9)',
        'z-index:28', 'pointer-events:none',
        'animation:crowdIn 0.6s ease',
        'font-family:Georgia,serif',
        'letter-spacing:0.5px'
    ].join(';');
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => {
        el.style.transition = 'opacity 1s';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 1000);
    }, 3000);
});

// --- NPC CHATTER ---
// Ambient dialogue between NPCs nearby. Shows as a speech bubble notification
// that fades after a few seconds so it doesn't clog the screen.
// TEACHING: We DON'T use the main dialogue box here — that's for player
// interaction. Chatter is environmental atmosphere, not a conversation.
// Blood Ogham drop notification — shows a special lore-styled popup
Game.socket.on('ogham_drop', ({ name, icon, description, lore_text }) => {
    const systemName = LABELS.get('label_ogham_system', 'Blood Ogham');
    const existing = document.getElementById('ogham_drop_popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'ogham_drop_popup';
    popup.style.cssText = `
        position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
        background:linear-gradient(135deg,#1a0505,#2a0808);
        border:2px solid #c0392b; border-radius:12px; padding:16px 20px;
        max-width:360px; z-index:9999; animation:oghamFadeIn 0.4s ease;
        box-shadow:0 0 30px rgba(192,57,43,0.4), 0 4px 20px rgba(0,0,0,0.8);
        font-family:'Courier New',monospace; color:#e8eef6;
    `;
    popup.innerHTML = `
        <div style="color:#c0392b;font-size:10px;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">
            🩸 ${systemName} Discovered
        </div>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px">
            <span style="font-size:32px">${icon||'🩸'}</span>
            <div>
                <div style="font-weight:700;font-size:16px;color:#e74c3c">${name}</div>
                <div style="font-size:11px;color:#aaa">${description||''}</div>
            </div>
        </div>
        ${lore_text ? `<div style="font-style:italic;color:#888;font-size:11px;
            border-left:2px solid #3a0a0a;padding:6px 10px;margin-bottom:10px">${lore_text}</div>` : ''}
        <div style="font-size:10px;color:#666;text-align:center">Carved into your weapon's Ogham Groove</div>
    `;

    // Add CSS animation
    if (!document.getElementById('ogham_anim_style')) {
        const style = document.createElement('style');
        style.id = 'ogham_anim_style';
        style.textContent = `@keyframes oghamFadeIn { from { opacity:0; transform:translateX(-50%) translateY(20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;
        document.head.appendChild(style);
    }

    document.body.appendChild(popup);
    setTimeout(() => { if (popup.parentNode) popup.remove(); }, 6000);
});

Game.socket.on('npc_chatter', ({ speaker, text }) => {
    showChatter(speaker, text);
});

// Chatter queue so multiple exchanges don't overlap badly
const chatterQueue = [];
let chatterActive  = false;

function showChatter(speaker, text) {
    chatterQueue.push({ speaker, text });
    if (!chatterActive) drainChatterQueue();
}

function drainChatterQueue() {
    if (!chatterQueue.length) { chatterActive = false; return; }
    chatterActive = true;
    const { speaker, text } = chatterQueue.shift();

    const el = document.createElement('div');
    el.className = 'npc-chatter-bubble';
    el.innerHTML = `<span style="color:#bb86fc;font-weight:700">${speaker}:</span> <span style="color:#ccc">${text}</span>`;
    el.style.cssText = [
        'position:fixed', 'left:50%', 'transform:translateX(-50%)',
        'top:12px', 'background:rgba(5,8,14,0.88)',
        'border:1px solid rgba(187,134,252,0.25)', 'border-radius:10px',
        'padding:8px 16px', 'font-size:12px', 'z-index:25',
        'max-width:420px', 'text-align:center',
        'animation:chatterIn 0.3s ease', 'pointer-events:none'
    ].join(';');
    document.body.appendChild(el);

    setTimeout(() => {
        el.style.transition = 'opacity 0.5s';
        el.style.opacity    = '0';
        setTimeout(() => {
            el.remove();
            setTimeout(drainChatterQueue, 400); // gap between lines
        }, 500);
    }, 3500); // visible for 3.5s
}

Game.socket.on('player_list', (list) => {
    // Teaching: player_list arrives both on login AND after a teleport.
    // We rebuild the players map from scratch. If myHero is in the list
    // we update its position too (server is authoritative).
    Game.players = {};
    list.forEach(p => Game.players[p.charId] = p);
    // Keep our own hero entry — server excludes us from the post-teleport list
    // (so we don't overwrite the position map_changed already set)
    if (!Game.players[Game.myCharId] && Game.myHero) {
        Game.players[Game.myCharId] = Game.myHero;
    }
    Game.myHero = Game.players[Game.myCharId] || Game.myHero;
    updatePlayerCount();
    // Notify nearby players panel if it exists
    if (typeof NearbyUI !== 'undefined') NearbyUI.refresh();
});

// --- MAP CHANGED (fires after teleport / fast travel) ---
// Teaching: This event is the client-side trigger to reload map tiles.
// The server emits it right after a teleport succeeds, BEFORE player_list,
// so we can clear the old canvas immediately. We do an async fetch to /get-map,
// update Game.map and Game.myHero position, then the game loop draws the new tiles.
Game.socket.on('map_changed', async ({ mapId, mapName, x, y, zoneType, floorNumber, dungeonName, region }) => {
    // Store dungeon info so the floor indicator can read it
    Game.zoneType    = zoneType    || 'WORLD';
    Game.floorNumber = floorNumber || null;
    Game.dungeonName = dungeonName || null;
    _updateFloorIndicator();
    // Update hero position immediately — don't wait for the REST fetch
    if (Game.myHero) {
        Game.myHero.x       = x;
        Game.myHero.y       = y;
        Game.myHero.mapId   = mapId;
    }
    // Update the map name display right away (optimistic)
    if (mapName) {
        const nameEl = document.getElementById('mapName');
        if (nameEl) nameEl.innerText = mapName;
    }
    updateCoordsUI();
    // Update region HUD for the new map
    Game.region = region || null;
    if (typeof RegionHUD !== 'undefined') RegionHUD.update(region);
    // Now fetch the full tile data
    await loadMap(mapId);
    // Minimap picks up the new map automatically since it reads Game.map each frame
});
// Map flags: server broadcasts when a flag changes (e.g. torch shot out)
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

// --- NPC DIALOGUE ---
Game.socket.on('npc_reply', (payload) => {
    openDialogue(payload.npcName, payload.text);
    // Keep the input visible after reply so player can keep chatting
    const inputRow = document.getElementById('npcInputRow');
    const inputEl  = document.getElementById('npcInput');
    if (inputRow) inputRow.style.display = 'block';
    if (inputEl)  { inputEl.focus(); }
});

// --- EVENT QUEUE PLAYER ---
// The server sends an array of commands. We play them back sequentially.
// This is the client-side half of the Event Runner.
Game.socket.on('event_queue', (queue) => {
    if (!queue || !Array.isArray(queue)) return;
    playEventQueue([...queue]);
});

function playEventQueue(queue) {
    if (queue.length === 0) return;
    const cmd = queue.shift();

    switch (cmd.cmd) {
        case 'dialogue':
            openDialogue(cmd.speaker, cmd.text);
            // Wait for player to dismiss, then continue queue
            Game._pendingQueue = queue;
            return; // closeDialogue() will resume

        case 'choice':
            showChoiceUI(cmd.prompt, cmd.options);
            Game._pendingQueue = queue;
            return; // choice click will resume

        case 'teleport':
            Game.socket.emit('teleport', { mapId: cmd.mapId, x: cmd.x, y: cmd.y });
            loadMap(cmd.mapId);
            playEventQueue(queue);
            break;

        case 'notification':
            showNotification(cmd.text, cmd.type);
            playEventQueue(queue);
            break;

        case 'npc_talk_prompt': {
            // Show dialogue box with text input so player can chat naturally.
            const lastEv = Game.map.events.find(e => e.data === cmd.npcName && e.type === 'NPC');
            openDialogue(cmd.npcName, 'Hello, traveller. What do you need?');
            // Show the input row
            const inputRow = document.getElementById('npcInputRow');
            const inputEl  = document.getElementById('npcInput');
            const instrEl  = document.getElementById('npcInstructions');
            if (inputRow) inputRow.style.display = 'block';
            if (instrEl)  instrEl.style.display  = 'none';
            if (inputEl) {
                inputEl.value = '';
                inputEl.focus();
                inputEl.onkeydown = (e) => {
                    if (e.key === 'Enter' && inputEl.value.trim() && lastEv) {
                        const msg = inputEl.value.trim();
                        inputEl.value = '';
                        Game.socket.emit('npc_talk', { x: lastEv.x, y: lastEv.y, message: msg });
                    }
                };
            }
            playEventQueue(queue);
            break;
        }

        // NPC choice menu — quest / shop / talk / farewell
        // TEACHING: Instead of hard-coding choices in HTML, we build
        // button rows dynamically from the array the server sends.
        // Each button emits 'npc_menu_choice' back to the server.
        case 'npc_choice_menu': {
            const box      = document.getElementById('dialogueBox');
            const choicesEl= document.getElementById('npcChoices');
            const instrEl  = document.getElementById('npcInstructions');
            if (instrEl)  instrEl.style.display = 'none';
            if (choicesEl) {
                choicesEl.innerHTML = (cmd.choices || []).map(ch =>
                    `<button class="choiceBtn"
                        onclick="Game.socket.emit('npc_menu_choice',{choiceId:'${ch.id}'}); document.getElementById('npcChoices').innerHTML=''; document.getElementById('npcInstructions').style.display='block';"
                     >${ch.text}</button>`
                ).join('');
            }
            if (box) box.style.display = 'block';
            Game._pendingQueue = queue;
            return; // Wait for player to click
        }

        case 'open_shop':
            // Support optional discount from haggling
            if (cmd.discount) Panels.shopDiscount = cmd.discount;
            else               delete Panels.shopDiscount;
            Panels.openShop(cmd.shopId);
            Game._pendingQueue = queue;
            return;

        case 'open_quest_board':
            if (typeof QuestBoardUI !== 'undefined') {
                QuestBoardUI.open(Game.myCharId, Game.myHero?.mapId);
            }
            playEventQueue(queue);
            break;

        case 'offer_quest':
            // Teaching: The server's event_runner found an OFFER_QUEST action.
            // This shows the player a styled accept/decline popup for a quest.
            // If accepted, we call the REST endpoint to accept it,
            // then refresh the quest log so they see it in their Active tab.
            (function(cmd) {
                const n = document.createElement('div');
                n.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
                    background:rgba(5,8,14,0.97);border:1px solid rgba(187,134,252,0.4);border-radius:12px;
                    padding:20px 24px;z-index:200;color:#e8eef6;min-width:340px;max-width:480px;`;
                n.innerHTML = `
                    <div style="color:#bb86fc;font-weight:bold;font-size:15px;margin-bottom:4px">📜 New Quest</div>
                    <div style="font-size:18px;font-weight:bold;color:#e8eef6;margin-bottom:8px">${_escHtml(cmd.questTitle || 'Quest')}</div>
                    ${cmd.questDesc ? `<div style="color:#8b949e;font-size:12px;margin-bottom:12px">${_escHtml(cmd.questDesc)}</div>` : ''}
                    ${cmd.rewards ? `<div style="color:#f39c12;font-size:11px;margin-bottom:12px">🏆 Rewards: ${_escHtml(cmd.rewards)}</div>` : ''}
                    <div style="display:flex;gap:10px">
                        <button id="offerQuestAccept"
                            style="flex:1;padding:9px;background:rgba(187,134,252,0.15);border:1px solid rgba(187,134,252,0.4);
                            color:#bb86fc;cursor:pointer;border-radius:7px;font-size:13px;font-family:'Courier New',monospace;font-weight:bold">
                            ✅ Accept</button>
                        <button onclick="this.closest('[style]').remove();Game.dialogueOpen=false;"
                            style="flex:1;padding:9px;background:rgba(255,255,255,0.04);border:1px solid #30363d;
                            color:#8b949e;cursor:pointer;border-radius:7px;font-size:13px;font-family:'Courier New',monospace">
                            Decline</button>
                    </div>`;
                document.body.appendChild(n);
                document.getElementById('offerQuestAccept').addEventListener('click', async () => {
                    n.remove();
                    Game.dialogueOpen = false;
                    try {
                        const r = await fetch('/api/quests/accept', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({characterId: Game.myCharId, questId: cmd.questId })
                        }).then(res => res.json());
                        if (r.success) {
                            showNotification(`📜 Quest Accepted: ${cmd.questTitle}`, 'quest');
                            if (typeof QuestUI !== 'undefined') QuestUI.load();
                            if (typeof updateQuestTracker === 'function') updateQuestTracker();
                        } else {
                            showNotification(r.message || 'Could not accept quest.', 'damage');
                        }
                    } catch (e) {
                        showNotification('Error accepting quest.', 'damage');
                    }
                });
                Game.dialogueOpen = true;
            })(cmd);
            playEventQueue(queue);
            return;

        case 'start_battle':
            // TEACHING: This case is reached when an event runner script emits
            // trigger_pve_battle → client receives it → sends start_pve_battle to server.
            // The actual battle start happens in that round-trip, not here.
            showNotification('⚔️ Battle starting!', 'battle');
            if (cmd.enemyId) {
                Game.socket.emit('start_pve_battle', { enemyCharId: cmd.enemyId });
            }
            playEventQueue(queue);
            break;

        case 'sound':
            // TODO: Play audio file when audio system is built
            playEventQueue(queue);
            break;

        case 'screen_effect':
            doScreenEffect(cmd.effect, cmd.duration);
            playEventQueue(queue);
            break;

        case 'wait':
            setTimeout(() => playEventQueue(queue), cmd.ms || 1000);
            return;

        default:
            console.warn('Unknown event cmd:', cmd.cmd);
            playEventQueue(queue);
    }
}

// --- CHOICE UI ---
function showChoiceUI(prompt, options) {
    Game.dialogueOpen = true;
    const box = document.getElementById('dialogueBox');
    box.style.display = 'block';
    document.getElementById('npcName').innerText = prompt || 'Choose';
    let html = '';
    options.forEach((opt, i) => {
        html += `<div onclick="pickChoice(${opt.id})" style="cursor:pointer;padding:10px;margin:5px 0;
            background:#1a1a1a;border:1px solid #555;color:#ffcc00;font-size:14px;
            transition:0.2s" onmouseover="this.style.background='#333'" onmouseout="this.style.background='#1a1a1a'">
            ${i + 1}. ${opt.label}</div>`;
    });
    document.getElementById('npcText').innerHTML = html;
    document.getElementById('npcInstructions').innerText = '[CLICK AN OPTION]';
}

function pickChoice(optionId) {
    closeDialogue();
    Game.socket.emit('event_choice', { optionId });
}

// --- NOTIFICATION SYSTEM ---
function showNotification(text, type) {
    // TEACHING: We append to #notifContainer (a flex column in the bottom-right)
    // instead of body. This means the browser handles stacking automatically —
    // no need to count existing notifications and calculate pixel offsets.
    // The keyframe 'nfIn' is defined in game.html; 'slideIn' was a typo that
    // caused notifications to just pop in with no animation.
    const colors = {
        item:           '#ffcc00',
        gold:           '#ffaa00',
        xp:             '#00ff88',
        level_up:       '#f39c12',   // gold — level up is a big moment
        quest:          '#bb86fc',
        quest_complete: '#ff66ff',
        heal:           '#00ff66',
        damage:         '#ff3333',
        battle:         '#ff0000',
        error:          '#f85149',
        info:           '#8b949e'
    };
    const color = colors[type] || '#c9d1d9';
    const n = document.createElement('div');
    n.className = 'notif';
    n.innerText = text;
    n.style.cssText = `color:${color};border-color:${color};`;
    const container = document.getElementById('notifContainer') || document.body;
    container.appendChild(n);
    setTimeout(() => { n.style.opacity = '0'; n.style.transition = 'opacity 0.5s'; }, 2500);
    setTimeout(() => n.remove(), 3000);
}

// --- BATTLE SOCKET HANDLERS ---
Game.socket.on('battle_start', (data) => BattleUI.start(data));
Game.socket.on('battle_update', (data) => {
    // Server sends per-charId updates — only process ours
    if (data.forCharId && data.forCharId !== Game.myCharId) return;
    BattleUI.update(data);
});
Game.socket.on('battle_error', (msg) => showNotification('⚠️ ' + msg, 'damage'));
Game.socket.on('battle_challenged', (data) => {
    // Teaching: Never use browser confirm() for real-time events —
    // it blocks the entire JS thread which also blocks socket.io heartbeats,
    // causing disconnects if the player takes too long to decide.
    // Instead we show a styled in-page toast with Accept/Decline buttons.
    const n = document.createElement('div');
    n.id = 'pvpChallengeToast';
    n.style.cssText = `position:fixed;top:80px;left:50%;transform:translateX(-50%);
        background:rgba(5,8,14,0.97);border:1px solid rgba(248,81,73,0.6);border-radius:12px;
        padding:16px 24px;z-index:200;color:#e8eef6;font-size:14px;text-align:center;
        box-shadow:0 0 20px rgba(248,81,73,0.2);min-width:300px;`;
    n.innerHTML = `
        <div style="color:#f85149;font-weight:bold;font-size:16px;margin-bottom:8px">⚔️ PvP CHALLENGE</div>
        <div style="color:#c9d1d9;margin-bottom:14px"><b>${_escHtml(data.challengerName)}</b> challenges you to battle!</div>
        <div style="display:flex;gap:10px;justify-content:center">
            <button onclick="Game.socket.emit('battle_accept',{challengerCharId:${data.challengerCharId}});document.getElementById('pvpChallengeToast')?.remove()"
                style="padding:8px 20px;background:rgba(248,81,73,0.2);border:1px solid #f85149;color:#f85149;
                cursor:pointer;border-radius:7px;font-size:13px;font-weight:bold;font-family:'Courier New',monospace">
                ⚔️ Fight!</button>
            <button onclick="document.getElementById('pvpChallengeToast')?.remove()"
                style="padding:8px 20px;background:rgba(255,255,255,0.05);border:1px solid #30363d;color:#8b949e;
                cursor:pointer;border-radius:7px;font-size:13px;font-family:'Courier New',monospace">
                Decline</button>
        </div>`;
    // Remove old toast if one exists
    document.getElementById('pvpChallengeToast')?.remove();
    document.body.appendChild(n);
    // Auto-dismiss after 20 seconds if no action taken
    setTimeout(() => n.remove(), 20000);
});

// Random encounters
// Server event runner can trigger PvE battles directly from map scripts.
// TEACHING: The event runner emits 'trigger_pve_battle' server-side.
// We re-emit 'start_pve_battle' from the client so it goes through the
// same validated path as random encounters and manual NPC battles.
Game.socket.on('trigger_pve_battle', (data) => {
    showNotification('⚔️ Battle starting!', 'battle');
    Game.socket.emit('start_pve_battle', { enemyCharId: data.npcId });
});

// --- BATTLE RESULT / DEFEAT / LOOT DROPS ---
Game.socket.on('battle_result', function(data) { if(typeof BattleUI!=='undefined') BattleUI.pendingResult=data; });

// Grid update (movement broadcast)
Game.socket.on('battle_grid_update', function(data) {
    if (typeof BattleUI === 'undefined' || !BattleUI.active) return;
    if (data.grid)     BattleUI.state.grid     = data.grid;
    if (data.hasMoved !== undefined) BattleUI.state.hasMoved = data.hasMoved;
    if (data.log)      data.log.forEach((msg, i) => setTimeout(() => showNotification(msg, 'battle'), i*300));
    BattleUI.render();
});

// 3v3 PvP challenge notification
Game.socket.on('battle_challenged_3v3', function(data) {
    const accept = confirm(data.challengerName + ' challenges you to a 3v3 battle! Accept?');
    if (accept) {
        Game.socket.emit('battle_accept_3v3', { challengerUserId: data.challengerUserId });
    }
});
Game.socket.on('battle_defeat', function(data) { if(typeof BattleUI!=='undefined') BattleUI.pendingResult=data; });

// --- RESPAWN COMPLETE ---
// Server sends this after processing request_respawn.
// We need to rejoin the game so the new map loads properly.
// The cleanest way: emit 'join_game' which triggers the full
// init_self flow the server uses whenever a player enters the world.
Game.socket.on('respawn_complete', function(data) {
    showNotification('✨ Respawning...', 'info');
    // Re-emit join_game so server runs its full init flow:
    // loads the new map, sends init_self with updated position,
    // and announces the player to other map players.
    Game.socket.emit('join_game', { charId: Game.myCharId });
});

// --- LOOT DROPS ---
// Server emits this after a PvE battle ends. forCharId ensures only the winner
// sees it. We stash the drops onto BattleUI.pendingResult so the Victory screen
// can show them in its own "LOOT" panel. We also refresh the inventory panel
// if it's open so the new items appear without the player having to close/reopen.
Game.socket.on('loot_drops', function(data) {
    if (data.forCharId !== Game.myCharId) return;
    if (!data.drops || !data.drops.length) return;
    // Give the drops to the battle results screen
    if (typeof BattleUI !== 'undefined') {
        if (!BattleUI.pendingResult) BattleUI.pendingResult = {};
        BattleUI.pendingResult.drops = data.drops;
    }
    // Refresh inventory panel + character HUD after overlay closes
    setTimeout(function() {
        if (typeof Panels !== 'undefined' && Panels.open === 'inventory') Panels.openInventory();
        loadCharData();
    }, 1500);
});

Game.socket.on('random_encounter', (data) => {
    showNotification(`👹 ${data.zoneName}: ${data.npcName} appears!`, 'battle');
    Game.socket.emit('start_pve_battle', { enemyCharId: data.npcId });
});

// --- ARENA ZONE ---
// TEACHING: The server emits arena_entered when we step inside a zone rectangle,
// and arena_left when we step outside. We store the arena data on Game.inArena
// so other UI (NearbyUI challenge button) can read it without extra server calls.
Game.socket.on('arena_entered', (data) => {
    Game.inArena = data;
    // Show a persistent banner while inside the arena
    let banner = document.getElementById('arenaBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'arenaBanner';
        banner.style.cssText = `
            position:fixed;top:0;left:50%;transform:translateX(-50%);
            background:rgba(180,20,20,0.92);color:#fff;font-family:'Courier New',monospace;
            font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;
            padding:6px 20px;border-radius:0 0 8px 8px;z-index:60;
            border:1px solid rgba(255,80,80,0.6);border-top:none;
            text-shadow:0 1px 3px rgba(0,0,0,0.8);
            box-shadow:0 2px 12px rgba(180,20,20,0.5);`;
        document.body.appendChild(banner);
    }
    const typeLabel = { OPEN_PVP:'Open PvP', QUEUE:'Matchmaking', TOURNAMENT:'Tournament', KING_OF_HILL:'King of the Hill' }[data.arenaType] || data.arenaType;
    banner.textContent = `⚔️ ${data.arenaName}  ·  ${typeLabel}  ·  Lv.${data.minLevel}–${data.maxLevel}`;
    showNotification(`⚔️ Entered ${data.arenaName} — PvP enabled!`, 'battle');
    // Refresh NearbyUI so challenge buttons update
    if (typeof NearbyUI !== 'undefined') NearbyUI.refresh();
});

// ── SCHEDULER SOCKET EVENTS ─────────────────────────────────────
Game.socket.on('server_broadcast', ({ message, color }) => {
    showNotification(message, 'xp');
    // Also push to chat
    if (typeof ChatUI !== 'undefined') {
        ChatUI.addMessage({ channel: 'global', sender: '📣 SERVER',
            text: message, _color: color || '#bb86fc' });
    }
});
Game.socket.on('server_xp_grant', ({ message }) => {
    showNotification(message || '🌟 XP granted!', 'xp');
});
Game.socket.on('shop_restocked', () => {
    // If the shop panel is open, refresh it
    showNotification('🏪 Shops have been restocked!', 'xp');
});
Game.socket.on('force_map_change', ({ mapId, x, y, message }) => {
    if (message) showNotification(message, 'damage');
    // Emit a join for the new map — this will trigger the server
    // to re-initialize our position
    if (Game.socket) {
        Game.socket.emit('join_game', { charId: Game.myCharId });
    }
});
Game.socket.on('region_updated', ({ region }) => {
    // Refresh local region data if this is our region
    if (Game.region && region && region.id === Game.region.id) {
        Game.region = region;
        if (typeof RegionHUD !== 'undefined') RegionHUD.update(region);
    }
});
Game.socket.on('world_flag_changed', ({ flag, value }) => {
    // Optional: UI can react to world flag changes if needed
    console.log('[World] Flag changed:', flag, '=', value);
});

Game.socket.on('arena_left', () => {
    Game.inArena = null;
    document.getElementById('arenaBanner')?.remove();
    showNotification('🛡️ Left arena zone — PvP disabled.', 'heal');
    if (typeof NearbyUI !== 'undefined') NearbyUI.refresh();
});

// Another player on this map entered or left an arena zone.
// TEACHING: We update their entry in Game.players so _challengeBtn
// can read it next time NearbyUI refreshes. Without this, the button
// would stay greyed out forever even when both players are in the zone.
Game.socket.on('player_arena_changed', ({ charId, inArena }) => {
    if (Game.players[charId]) {
        Game.players[charId].inArena = inArena;
        if (typeof NearbyUI !== 'undefined') NearbyUI.refresh();
    }
});

// --- SCREEN EFFECTS ---
function doScreenEffect(effect, duration) {
    const canvas = document.getElementById('gameCanvas');
    if (effect === 'shake') {
        let t = 0;
        const interval = setInterval(() => {
            canvas.style.transform = `translate(${(Math.random()-0.5)*8}px, ${(Math.random()-0.5)*8}px)`;
            t += 50;
            if (t >= duration) { clearInterval(interval); canvas.style.transform = ''; }
        }, 50);
    } else if (effect === 'flash') {
        canvas.style.filter = 'brightness(3)';
        setTimeout(() => { canvas.style.filter = ''; }, duration);
    } else if (effect === 'fade') {
        canvas.style.opacity = '0';
        canvas.style.transition = `opacity ${duration}ms`;
        setTimeout(() => { canvas.style.opacity = '1'; }, duration);
    }
}

function openDialogue(name, text) {
    Game.dialogueOpen = true;
    document.getElementById('dialogueBox').style.display = 'block';
    document.getElementById('npcName').innerText = name;
    document.getElementById('npcText').innerText = text;
}
function closeDialogue() {
    Game.dialogueOpen = false;
    document.getElementById('dialogueBox').style.display = 'none';
    var inputRow = document.getElementById('npcInputRow');
    var instrEl  = document.getElementById('npcInstructions');
    if (inputRow) inputRow.style.display = 'none';
    if (instrEl)  instrEl.style.display  = 'block';
    // Resume event queue if there are more actions waiting
    if (Game._pendingQueue && Game._pendingQueue.length > 0) {
        const q = Game._pendingQueue;
        Game._pendingQueue = null;
        setTimeout(() => playEventQueue(q), 100);
    }
}

// --- STATE ---
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

// --- CHARACTER DATA (HP/MP/XP/LB bars) ---
// Teaching: We used to call /my-characters here (lightweight) but it has no XP,
// limit-break, or class data. Now we call /get-char-full which returns everything.
// This is a slightly heavier call but means all bars always have real data.
async function loadCharData() {
    try {
        const r = await fetch('/get-char-full', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({charId: Game.myCharId })
        });
        const j = await r.json();
        if (j.success) {
            // Store in two places: lightweight charData (legacy) and full charFull
            Game.charFull = j;
            Game.charData = j.character;
            updateBars(j);
            updateQuestTracker();
        }
    } catch (e) { console.error('loadCharData error:', e); }
}

function updateBars(data) {
    // data is the full /get-char-full response; fall back to Game.charFull if not passed
    const d = data || Game.charFull;
    if (!d) return;
    const c = d.character;
    const es = d.effectiveStats;

    // HP
    const hp = Math.max(0, c.current_hp), mhp = es.maxHp || 1;
    const hpPct = Math.min(100, hp / mhp * 100);
    document.getElementById('hpFill').style.width = hpPct + '%';
    document.getElementById('hpVal').innerText = hp + ' / ' + mhp;

    // MP
    const mp = Math.max(0, c.current_mp), mmp = es.maxMp || 1;
    document.getElementById('mpFill').style.width = Math.min(100, mp / mmp * 100) + '%';
    document.getElementById('mpVal').innerText = mp + ' / ' + mmp;

    // XP bar — xpCurrent and xpToNext come from get-char-full
    const xpCur = d.xpCurrent || 0;
    const xpMax = d.xpToNext;
    if (xpMax) {
        document.getElementById('xpFill').style.width = Math.min(100, xpCur / xpMax * 100) + '%';
        document.getElementById('xpVal').innerText = xpCur + ' / ' + xpMax;
    } else {
        document.getElementById('xpFill').style.width = '100%';
        document.getElementById('xpVal').innerText = 'MAX';
    }

    // Limit Break bar — label from settings (default: 'Limit Break')
    const lb = Math.min(100, Math.max(0, parseFloat(es.limitbreak || 0)));
    document.getElementById('lbFill').style.width = lb + '%';
    document.getElementById('lbVal').innerText = Math.floor(lb) + '%';

    // Level badge
    document.getElementById('hudLevel').innerText = 'Lv. ' + c.level;

    // Gold — comes from get-char-full response
    // TEACHING: gold lives on the users table, not characters.
    // get-char-full already fetches it and includes it in the response.
    if (typeof d.gold === 'number') {
        const goldEl = document.getElementById('hudGoldVal');
        if (goldEl) goldEl.innerText = d.gold.toLocaleString() + 'g';
    }
}

// --- MINI QUEST TRACKER (HUD widget below main bars) ---
// Teaching: This pulls from QuestUI's already-loaded data so we don't make an
// extra network call — QuestUI.activeQuests is populated whenever the quest log
// is opened or when loadCharData runs (we call updateQuestTracker after refresh).
function updateQuestTracker() {
    const tracker = document.getElementById('questTracker');
    const body    = document.getElementById('qtBody');
    const more    = document.getElementById('qtMore');
    if (!tracker || !body) return;

    // Position tracker below the HUD
    const hud = document.getElementById('hud');
    if (hud) {
        const hudBottom = hud.getBoundingClientRect().bottom;
        tracker.style.top = (hudBottom + 8) + 'px';
    }

    const activeQuests = (typeof QuestUI !== 'undefined') ? QuestUI.activeQuests : {};
    const keys = Object.keys(activeQuests || {});

    if (!keys.length) { tracker.style.display = 'none'; return; }

    tracker.style.display = 'block';
    const first = activeQuests[keys[0]];
    const objs  = first.objectives || {};
    const objKeys = Object.keys(objs);

    // Show up to 3 objectives in the tracker
    const shown = objKeys.slice(0, 3);
    body.innerHTML = `<div class="qt-name">${_escHtml(first.title || keys[0])}</div>`
        + shown.map(k => {
            const o = objs[k];
            const pct = o.target > 0 ? Math.min(100, Math.round(o.current / o.target * 100)) : 100;
            return `<div class="qt-obj${o.complete ? ' done' : ''}">
                <span>${o.complete ? '✅' : '⬜'}</span>
                <div class="qt-track"><div class="qt-fill" style="width:${pct}%"></div></div>
                <span style="white-space:nowrap">${o.current}/${o.target}</span>
            </div>`;
        }).join('');

    // Show "N more quests / M more objectives" hint
    const extraObjs  = objKeys.length - shown.length;
    const extraQuests = keys.length - 1;
    const hints = [];
    if (extraObjs > 0)   hints.push(`+${extraObjs} more objective${extraObjs > 1 ? 's' : ''}`);
    if (extraQuests > 0) hints.push(`+${extraQuests} more quest${extraQuests > 1 ? 's' : ''}`);
    more.innerText = hints.join('  ');
}

function _escHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;'); }

// --- MAP ---
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

            // Build animMap: fast lookup {tileIndex -> animDef} for draw-time animation
            // TEACHING: Using an object (dict) means O(1) lookup per tile vs searching
            // an array every frame. At 400 tiles @ 60fps that's 24,000 searches saved.
            Game.map.animMap = {};
            for (const a of Game.map.anims) {
                if (a.trigger != null && Array.isArray(a.frames) && a.frames.length > 1) {
                    Game.map.animMap[a.trigger] = a;
                }
            }

            // Load the tileset image for this map (async, draw falls back to flat colors)
            loadTileset(Game.map.tileset_url || '');

            document.getElementById('mapName').innerText = Game.map.name;
        }
    } catch (e) { console.error(e); }
}

// --- INPUT ---
window.addEventListener('keydown', (e) => {
    // CRITICAL: If player is typing in any input/textarea, block all game hotkeys.
    // This prevents WASD from moving the character while typing in chat.
    if (document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
         document.activeElement.tagName === 'TEXTAREA')) return;

    // Panel hotkeys (work even when dialogue is open, to toggle panels)
    if (e.key === 'i' || e.key === 'I') {
        if (Panels.open === 'inventory') { Panels.close(); return; }
        if (!Panels.open && !BattleUI.active) { Panels.openInventory(); return; }
    }
    if (e.key === 'c' || e.key === 'C') {
        if (Panels.open === 'character') { Panels.close(); return; }
        if (!Panels.open && !BattleUI.active) { Panels.openCharacter(); return; }
    }
    // [Enter] focuses the chat input if chat is visible and not collapsed
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

    // Close dialogue/panels
    if (Game.dialogueOpen) {
        if (Panels.open) return; // Don't close panels with space/enter
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
    // Server handles STEP_ON events (teleports, traps, etc) via event_runner
});

function tryInteract() {
    const dirs = [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    for (const d of dirs) {
        const x = Game.myHero.x + d.dx, y = Game.myHero.y + d.dy;
        const ev = Game.map.events.find(e => e.x === x && e.y === y);
        if (!ev) continue;

        // Send INTERACT to server — event_runner handles the logic
        Game.socket.emit('interact', { x, y });
        return;
    }
}

// --- RENDER ---
function drawLighting(camX, camY) {
    const dark = Game.map.ambientDark || 0;
    if (dark <= 0) return; // Map is fully lit -- skip the whole system

    // --- Step 1: Fill the light canvas with darkness ---
    LCTX.clearRect(0, 0, LIGHT_CANVAS.width, LIGHT_CANVAS.height);
    LCTX.globalCompositeOperation = 'source-over';
    // Deep blue-black darkness (not pure black -- more atmospheric)
    LCTX.fillStyle = `rgba(0, 0, 10, ${dark})`;
    LCTX.fillRect(0, 0, LIGHT_CANVAS.width, LIGHT_CANVAS.height);

    // --- Step 2: Punch holes in the darkness for each active light ---
    // TEACHING: destination-out blend mode uses the alpha of the new shape
    // to ERASE the existing canvas content. A fully opaque circle erases the
    // darkness completely. A gradient circle fades from fully erased (center)
    // to untouched (edge), creating a natural light falloff.
    LCTX.globalCompositeOperation = 'destination-out';
    const t = Date.now();
    const objects = Game.map.objects || [];
    const flags   = Game.map.flags   || {};

    for (const obj of objects) {
        if (obj.type !== 'LIGHT') continue;
        // If this light has a flagKey and the flag is explicitly false, it's off
        if (obj.flagKey && flags[obj.flagKey] === false) continue;

        const cx = obj.x * TILE_SIZE + TILE_SIZE / 2 + camX;  // world→screen (camera offset)
        const cy = obj.y * TILE_SIZE + TILE_SIZE / 2 + camY;
        let radius = (obj.light && obj.light.radius ? obj.light.radius : 3) * TILE_SIZE;

        // Flicker: each light flickers at its own offset based on position
        // so nearby lights don't pulse in sync (that would look fake)
        if (obj.light && obj.light.flicker) {
            const offset = obj.x * 1.7 + obj.y * 2.3; // position-based phase offset
            radius += Math.sin(t * 0.006 + offset) * 5
                    + Math.sin(t * 0.013 + offset * 0.5) * 2; // second harmonic for realism
        }
        radius = Math.max(radius, TILE_SIZE * 0.5); // floor: never shrink to nothing

        // Radial gradient: bright center fading to transparent edge
        const g = LCTX.createRadialGradient(cx, cy, 0, cx, cy, radius);
        g.addColorStop(0,   'rgba(0,0,0,1)');   // fully erases darkness at center
        g.addColorStop(0.4, 'rgba(0,0,0,0.9)');
        g.addColorStop(0.8, 'rgba(0,0,0,0.4)');
        g.addColorStop(1,   'rgba(0,0,0,0)');   // edge blends back into darkness
        LCTX.fillStyle = g;
        LCTX.beginPath();
        LCTX.arc(cx, cy, radius, 0, Math.PI * 2);
        LCTX.fill();
    }

    // Small personal light around the player (candle/torch carried by default)
    // Scales with ambient darkness -- fully dark maps give a tiny glow
    if (Game.myHero && dark > 0.2) {
        const px = Game.myHero.x * TILE_SIZE + TILE_SIZE / 2;
        const py = Game.myHero.y * TILE_SIZE + TILE_SIZE / 2;
        const pr = TILE_SIZE * (0.8 + dark * 0.8); // bigger in darker maps
        const pg = LCTX.createRadialGradient(px, py, 0, px, py, pr);
        pg.addColorStop(0,   'rgba(0,0,0,0.6)');
        pg.addColorStop(1,   'rgba(0,0,0,0)');
        LCTX.fillStyle = pg;
        LCTX.beginPath();
        LCTX.arc(px, py, pr, 0, Math.PI * 2);
        LCTX.fill();
    }

    // --- Step 3: Draw the light canvas onto the main canvas ---
    LCTX.globalCompositeOperation = 'source-over'; // reset blend mode
    CTX.drawImage(LIGHT_CANVAS, 0, 0);

    // --- Step 4 (optional): Colored light halos ---
    // Draw a warm-colored glow on top of lit areas using 'screen' blend mode.
    // 'screen' brightens the destination -- a faint orange over a lit area
    // makes it look warm and fire-lit without affecting the dark areas.
    CTX.globalCompositeOperation = 'screen';
    for (const obj of objects) {
        if (obj.type !== 'LIGHT') continue;
        if (obj.flagKey && flags[obj.flagKey] === false) continue;
        if (!obj.light || !obj.light.color) continue;

        const cx = obj.x * TILE_SIZE + TILE_SIZE / 2 + camX;  // world→screen (camera offset)
        const cy = obj.y * TILE_SIZE + TILE_SIZE / 2 + camY;
        const radius = (obj.light.radius || 3) * TILE_SIZE * 0.7;

        // Parse hex color to rgba for the gradient
        const col = obj.light.color || '#ff8833';
        const r = parseInt(col.slice(1,3), 16);
        const rg = parseInt(col.slice(3,5), 16);
        const b2 = parseInt(col.slice(5,7), 16);

        const g2 = CTX.createRadialGradient(cx, cy, 0, cx, cy, radius);
        g2.addColorStop(0,   `rgba(${r},${rg},${b2},0.25)`);
        g2.addColorStop(0.5, `rgba(${r},${rg},${b2},0.08)`);
        g2.addColorStop(1,   `rgba(${r},${rg},${b2},0)`);
        CTX.fillStyle = g2;
        CTX.beginPath();
        CTX.arc(cx, cy, radius, 0, Math.PI * 2);
        CTX.fill();
    }
    CTX.globalCompositeOperation = 'source-over'; // always reset after special blend modes
}

// =================================================================
// ANIMATED TILES
// =================================================================
// TEACHING: How tile animation works:
//   When we're about to draw tile index N, we first check if N has
//   an animation defined. If it does, we substitute the current frame
//   tile index instead. The original tile index stored on the map never
//   changes -- animation only happens at draw time.
//
//   The current frame is: Math.floor(Date.now() / msPerFrame) % frameCount
//   Date.now() is identical for all tiles in one draw() call, so
//   every water tile on the map advances frames at the same moment --
//   making the water look like one continuous rippling surface.
function resolveAnimTile(tileIdx) {
    const anim = Game.map.animMap && Game.map.animMap[tileIdx];
    if (!anim) return tileIdx; // Not animated -- pass through unchanged
    const msPerFrame = 1000 / Math.max(1, Math.min(30, anim.fps || 4));
    const frameIdx   = Math.floor(Date.now() / msPerFrame) % anim.frames.length;
    return anim.frames[frameIdx];
}

// =================================================================
// SPRITE DRAW HELPERS
// =================================================================

function _drawCharLayers(wx, wy, appearance) {
    if (!appearance) return;
    const w     = TILE_SIZE;
    const h     = TILE_SIZE * 2;
    const drawY = wy - TILE_SIZE;
    let anyDrawn = false;
    for (const layer of CHAR_LAYER_ORDER) {
        const filename = appearance[layer.key];
        if (!filename) continue;
        const url   = CHAR_BASE + layer.folder + '/' + filename + '.png';
        const entry = getSprite(url);
        if (entry && entry.loaded) {
            CTX.drawImage(entry.img, wx, drawY, w, h);
            anyDrawn = true;
        }
    }
    if (!anyDrawn) {
        CTX.fillStyle = 'rgba(187,134,252,0.25)';
        CTX.fillRect(wx + 4, wy + 4, w - 8, w - 8);
    }
}

function _drawNameTag(wx, wy, label, color) {
    if (!label) return;
    CTX.font = 'bold 9px Courier New';
    CTX.textAlign    = 'center';
    CTX.textBaseline = 'alphabetic';
    const tw = CTX.measureText(label).width;
    CTX.fillStyle = 'rgba(0,0,0,0.65)';
    CTX.fillRect(wx + TILE_SIZE/2 - tw/2 - 2, wy - 14, tw + 4, 11);
    CTX.fillStyle = color || '#ffffff';
    CTX.fillText(label, wx + TILE_SIZE / 2, wy - 5);
}

function draw() {
    CTX.fillStyle = '#050505';
    CTX.fillRect(0, 0, CANVAS.width, CANVAS.height);

    // --- Camera: center viewport on the player ---
    // TEACHING: Without a camera, tiles draw at their raw pixel positions (x*32, y*32).
    // That works for tiny maps but once the map is bigger than the canvas the player
    // walks off the edge of the screen. We fix this by shifting EVERYTHING by an offset
    // (camX, camY) so that the player always appears near the center of the canvas.
    // CTX.save() + CTX.translate() + CTX.restore() is the standard canvas camera pattern.
    const hero = Game.myHero;
    const camX = hero ? Math.round(CANVAS.width  / 2 - hero.x * TILE_SIZE - TILE_SIZE / 2) : 0;
    const camY = hero ? Math.round(CANVAS.height / 2 - hero.y * TILE_SIZE - TILE_SIZE / 2) : 0;
    CTX.save();
    CTX.translate(camX, camY);

    // --- Layer 1: Terrain tiles ---
    for (let i = 0; i < Game.map.tiles.length; i++) {
        const rawIdx  = Game.map.tiles[i] || 0;
        const tileIdx = resolveAnimTile(rawIdx); // Swap for current animation frame
        const dx = (i % Game.map.width)     * TILE_SIZE;
        const dy = Math.floor(i / Game.map.width) * TILE_SIZE;

        if (TILESET.loaded) {
            const col = tileIdx % TILESET.cols;
            const row = Math.floor(tileIdx / TILESET.cols);
            CTX.imageSmoothingEnabled = false;
            CTX.drawImage(TILESET.img,
                col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE,
                dx, dy, TILE_SIZE, TILE_SIZE);
        } else {
            CTX.fillStyle = COLORS[tileIdx] || '#ff00ff';
            CTX.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
            CTX.strokeStyle = 'rgba(0,0,0,0.15)';
            CTX.strokeRect(dx, dy, TILE_SIZE, TILE_SIZE);
        }
    }

    // =================================================================
    // LAYERS 2-4: Z-SORTED WORLD DRAW
    // TEACHING: Z-depth sorting makes the world feel 3D. The rule is:
    // things with a HIGHER y value (lower on screen) draw LAST, so they
    // appear in front of things above them — like standing behind a tree.
    // We collect objects, NPCs, and players into one array, sort by their
    // "foot" position (y + height), then draw them in order.
    // =================================================================

    const flags   = Game.map.flags   || {};
    const objects = Game.map.objects  || [];
    const now     = Date.now();

    // Advance per-object animation clocks
    if (objects.length) {
        const delta = now - OBJ_ANIM_LAST;
        OBJ_ANIM_LAST = now;
        for (const obj of objects) {
            if (!obj.anim_frames || obj.anim_frames.length < 2) continue;
            const key = obj.x + ',' + obj.y;
            if (!OBJ_ANIM_CLOCK[key]) OBJ_ANIM_CLOCK[key] = { frame: 0, acc: 0 };
            const clk = OBJ_ANIM_CLOCK[key];
            // Flag-driven objects: flagKey controls which frame shows
            // e.g. chest open/close, torch on/off
            if (obj.flagKey && flags[obj.flagKey] !== undefined) {
                clk.frame = flags[obj.flagKey] ? 1 : 0;
            } else {
                // Loop animation (torch flicker, etc.)
                const fps = obj.anim_fps || 6;
                clk.acc += delta;
                if (clk.acc >= 1000 / fps) {
                    clk.acc = 0;
                    clk.frame = (clk.frame + 1) % obj.anim_frames.length;
                }
            }
        }
    }

    // --- Layer 3: Event icons (debug overlay, drawn BEFORE z-sort) ---
    if (Array.isArray(Game.map.events)) {
        CTX.font = '16px sans-serif';
        CTX.textAlign    = 'center';
        CTX.textBaseline = 'middle';
        for (const ev of Game.map.events) {
            const icon = EVENT_ICONS[ev.type];
            if (icon) CTX.fillText(icon, ev.x * TILE_SIZE + 16, ev.y * TILE_SIZE + 16);
        }
    }

    // Build unified draw list
    // Each entry: { kind, y, sortY, data }
    // sortY = foot of the sprite — used for painter's algorithm
    const drawList = [];

    for (const obj of objects) {
        const h = obj.sprite_h || TILE_SIZE;
        drawList.push({ kind: 'obj', sortY: obj.y * TILE_SIZE + h, data: obj });
    }
    for (const npc of Object.values(Game.npcs || {})) {
        drawList.push({ kind: 'npc', sortY: npc.y * TILE_SIZE + TILE_SIZE, data: npc });
    }
    for (const p of Object.values(Game.players)) {
        drawList.push({ kind: 'player', sortY: p.y * TILE_SIZE + TILE_SIZE, data: p });
    }

    // Sort: lower sortY (higher on screen) draws first → appears behind
    drawList.sort((a, b) => a.sortY - b.sortY);

    CTX.save();
    CTX.imageSmoothingEnabled = false;

    for (const entry of drawList) {

        // ── OBJECT ────────────────────────────────────────────────
        if (entry.kind === 'obj') {
            const obj = entry.data;
            const ox  = obj.x * TILE_SIZE;
            const oy  = obj.y * TILE_SIZE;
            const sw  = obj.sprite_w || TILE_SIZE;
            const sh  = obj.sprite_h || TILE_SIZE;
            // Taller sprites hang UP from the tile's top edge
            const drawY = oy - (sh - TILE_SIZE);

            // Dim lights that are flagged off
            const isLightOff = obj.type === 'LIGHT' && obj.flagKey && flags[obj.flagKey] === false;
            if (isLightOff) CTX.globalAlpha = 0.3;

            // Resolve animated frame URL or static sprite_url
            let spriteUrl = obj.sprite_url || null;
            if (obj.anim_frames && obj.anim_frames.length) {
                const key = obj.x + ',' + obj.y;
                const fi  = OBJ_ANIM_CLOCK[key]?.frame || 0;
                spriteUrl = obj.anim_frames[fi] || spriteUrl;
            }

            if (spriteUrl) {
                const entry = getSprite(spriteUrl);
                if (entry && entry.loaded) {
                    CTX.drawImage(entry.img, ox + (TILE_SIZE - sw) / 2, drawY, sw, sh);
                } else if (!entry || !entry.error) {
                    // Still loading — draw placeholder outline
                    CTX.strokeStyle = 'rgba(187,134,252,0.5)';
                    CTX.strokeRect(ox + 1, oy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
                } else {
                    // Load error — draw red X so admin knows file is missing
                    CTX.strokeStyle = 'rgba(248,81,73,0.7)';
                    CTX.strokeRect(ox + 1, oy + 1, sw - 2, sh - 2);
                    CTX.beginPath();
                    CTX.moveTo(ox + 4, oy + 4); CTX.lineTo(ox + sw - 4, oy + sh - 4);
                    CTX.moveTo(ox + sw - 4, oy + 4); CTX.lineTo(ox + 4, oy + sh - 4);
                    CTX.stroke();
                }
            } else if (obj.icon) {
                // Emoji fallback (backward-compatible with existing maps)
                CTX.font = '22px sans-serif';
                CTX.textAlign    = 'center';
                CTX.textBaseline = 'middle';
                CTX.fillText(obj.icon, ox + TILE_SIZE / 2, oy + TILE_SIZE / 2);
            }

            if (isLightOff) CTX.globalAlpha = 1;

        // ── NPC ───────────────────────────────────────────────────
        } else if (entry.kind === 'npc') {
            const npc = entry.data;
            const nx  = npc.x * TILE_SIZE;
            const ny  = npc.y * TILE_SIZE;
            const app = npc.appearance || null;

            if (app && Object.values(app).some(v => v && typeof v === 'string')) {
                // Layered sprite NPC
                _drawCharLayers(nx, ny, app);
            } else {
                // Emoji NPC (fallback / default)
                CTX.fillStyle = 'rgba(0,0,0,0.35)';
                CTX.fillRect(nx + 4, ny + 4, TILE_SIZE - 2, TILE_SIZE - 2);
                CTX.font = '22px sans-serif';
                CTX.textAlign    = 'center';
                CTX.textBaseline = 'middle';
                CTX.fillText(npc.icon || '👤', nx + TILE_SIZE / 2, ny + TILE_SIZE / 2);
            }
            // Name tag (always shown)
            _drawNameTag(nx, ny, npc.name, '#88ff88');

        // ── PLAYER ────────────────────────────────────────────────
        } else if (entry.kind === 'player') {
            const p   = entry.data;
            const px  = p.x * TILE_SIZE;
            const py  = p.y * TILE_SIZE;
            const isMe = p.charId === Game.myCharId;
            const app  = p.appearance || null;

            if (app && Object.values(app).some(v => v && typeof v === 'string')) {
                // Layered sprite player
                _drawCharLayers(px, py, app);
            } else {
                // Colored rectangle fallback
                CTX.fillStyle = 'rgba(0,0,0,0.3)';
                CTX.fillRect(px + 4, py + 4, TILE_SIZE, TILE_SIZE);
                CTX.fillStyle   = isMe ? '#ffffff' : '#00ffff';
                CTX.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                CTX.strokeStyle = isMe ? '#ffcc00' : '#008888';
                CTX.lineWidth   = isMe ? 2 : 1;
                CTX.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
                CTX.lineWidth   = 1;
            }
            // Name tag
            const nameColor = isMe ? '#ffcc00' : '#00ffff';
            _drawNameTag(px, py, p.name, nameColor);
        }
    }

    CTX.restore();

    // --- Layer 5: Lighting overlay ---
    // TEACHING: We restore the camera transform BEFORE drawing lighting.
    // The lighting system draws a full-canvas darkness overlay and punches
    // holes for each light source. It needs to know where lights are in
    // SCREEN space (not world space), so we pass the camera offset to it.
    CTX.restore(); // ← end camera transform
    drawLighting(camX, camY);

    // --- Arena zone visual overlay ---
    // TEACHING: A subtle red vignette (darkened corners) signals danger without
    // obscuring gameplay. We draw it AFTER lighting so it's always visible,
    // even in fully-lit maps. The pulsing effect uses Date.now() so it animates
    // continuously without any extra state.
    if (Game.inArena) {
        const pulse = 0.08 + Math.sin(Date.now() * 0.002) * 0.04; // 0.04–0.12
        const grad = CTX.createRadialGradient(
            CANVAS.width / 2, CANVAS.height / 2, CANVAS.height * 0.3,
            CANVAS.width / 2, CANVAS.height / 2, CANVAS.height * 0.85
        );
        grad.addColorStop(0, 'rgba(180,20,20,0)');
        grad.addColorStop(1, `rgba(180,20,20,${pulse})`);
        CTX.fillStyle = grad;
        CTX.fillRect(0, 0, CANVAS.width, CANVAS.height);
    }
}

function gameLoop() {
    draw();
    // Draw minimap on top every frame
    if (typeof MinimapUI !== 'undefined') MinimapUI.draw();
    requestAnimationFrame(gameLoop);
}
function updateCoordsUI() {
    document.getElementById('coordX').innerText = Game.myHero.x;
    document.getElementById('coordY').innerText = Game.myHero.y;
}
function updatePlayerCount() { document.getElementById('playerCount').innerText = Object.keys(Game.players).length; }

init();// --- LOOT DROPS ---
