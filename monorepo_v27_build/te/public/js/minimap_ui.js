// =================================================================
// MINIMAP UI — Canvas overlay minimap in the bottom-right corner
// =================================================================
// Teaching: A minimap is just a tiny version of the main map drawn
// at a different scale. We draw it onto a SECOND canvas element that
// sits on top of the main game canvas (using CSS position:fixed).
//
// Every game loop tick, MinimapUI.draw() is called. It:
//   1. Clears the minimap canvas
//   2. Draws each tile as a tiny 1-4 pixel rectangle
//   3. Draws a dot for every online player
//   4. Draws party members in a different color
//   5. Draws the local player last (always visible on top)
//   6. Draws a small viewport rectangle showing what the main
//      camera sees (for when maps are larger than the canvas)
//
// The minimap is always visible during gameplay. It hides when
// a fullscreen panel (inventory, quest log, etc.) is open.
//
// Size: 160×160 pixels (configurable via MinimapUI.SIZE)
// Position: bottom-right corner, 10px from each edge
// =================================================================

const MinimapUI = {

    // ─── CONFIG ──────────────────────────────────────────────────
    SIZE:      160,   // canvas pixel dimensions (square)
    PADDING:   10,    // gap from screen edge (px)
    TILE_SIZE: 4,     // each tile = N×N pixels on the minimap
    // Auto-scales down if map is too wide to fit: see _tileSize()

    // ─── STATE ───────────────────────────────────────────────────
    canvas:    null,
    ctx:       null,
    visible:   true,
    partyIds:  [],    // charIds of party members (colored differently)

    // Tile color palette — matches the main game COLORS array
    // Index 0=grass, 1=wall, 2=water, 3=dirt (add more as needed)
    TILE_COLORS: [
        '#1a3a1a',  // 0 = passable / grass — dark green
        '#4a4a4a',  // 1 = wall — grey
        '#0a1a3a',  // 2 = water — dark blue
        '#3a2a0a',  // 3 = dirt / other — dark brown
    ],

    // ─── INIT ────────────────────────────────────────────────────
    init() {
        // Create the minimap canvas element
        const canvas = document.createElement('canvas');
        canvas.id     = 'minimapCanvas';
        canvas.width  = MinimapUI.SIZE;
        canvas.height = MinimapUI.SIZE;
        canvas.style.cssText = `
            position: fixed;
            right: ${MinimapUI.PADDING}px;
            bottom: ${MinimapUI.PADDING}px;
            width: ${MinimapUI.SIZE}px;
            height: ${MinimapUI.SIZE}px;
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 6px;
            background: rgba(5,8,14,0.85);
            z-index: 8;
            image-rendering: pixelated;
            cursor: default;
        `;

        // Add a label above it
        const label = document.createElement('div');
        label.id = 'minimapLabel';
        label.style.cssText = `
            position: fixed;
            right: ${MinimapUI.PADDING}px;
            bottom: ${MinimapUI.PADDING + MinimapUI.SIZE + 4}px;
            font-size: 9px;
            color: rgba(255,255,255,0.25);
            text-align: right;
            z-index: 8;
            font-family: 'Courier New', monospace;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            pointer-events: none;
        `;
        label.innerText = 'Minimap';

        // Toggle visibility on click
        canvas.title = 'Click to toggle minimap';
        canvas.addEventListener('click', () => {
            MinimapUI.visible = !MinimapUI.visible;
            canvas.style.opacity = MinimapUI.visible ? '1' : '0.1';
        });

        document.body.appendChild(label);
        document.body.appendChild(canvas);

        MinimapUI.canvas = canvas;
        MinimapUI.ctx    = canvas.getContext('2d');
    },

    // ─── DRAW ─────────────────────────────────────────────────────
    // Called every frame from the game loop (game_engine.js)
    draw() {
        const ctx = MinimapUI.ctx;
        if (!ctx) return;

        // Hide minimap when a fullscreen panel is open
        const panelOpen = (typeof Panels    !== 'undefined' && Panels.open)   ||
                          (typeof QuestUI   !== 'undefined' && QuestUI.open)  ||
                          (typeof PartyUI   !== 'undefined' && PartyUI.open)  ||
                          (typeof BattleUI  !== 'undefined' && BattleUI.active);
        MinimapUI.canvas.style.display = panelOpen ? 'none' : 'block';
        const label = document.getElementById('minimapLabel');
        if (label) label.style.display = panelOpen ? 'none' : 'block';
        if (panelOpen) return;

        const map = (typeof Game !== 'undefined') ? Game.map : null;
        if (!map || !map.tiles || !map.tiles.length) {
            // No map loaded yet — just show blank
            ctx.clearRect(0, 0, MinimapUI.SIZE, MinimapUI.SIZE);
            return;
        }

        const S  = MinimapUI.SIZE;
        const mw = map.width  || 20;
        const mh = map.height || 20;

        // Auto-scale: fit the whole map in the canvas
        const ts = Math.max(1, Math.min(
            MinimapUI.TILE_SIZE,
            Math.floor(S / mw),
            Math.floor(S / mh)
        ));

        // Total drawn area (may be smaller than canvas if map is small)
        const drawW = mw * ts;
        const drawH = mh * ts;
        // Center the map drawing within the canvas
        const offX = Math.floor((S - drawW) / 2);
        const offY = Math.floor((S - drawH) / 2);

        // ── Background ──────────────────────────────────────────
        ctx.clearRect(0, 0, S, S);
        ctx.fillStyle = 'rgba(5,8,14,0.9)';
        ctx.fillRect(0, 0, S, S);

        // ── Tiles ───────────────────────────────────────────────
        for (let i = 0; i < map.tiles.length; i++) {
            const tileType = map.tiles[i];
            const tx = i % mw;
            const ty = Math.floor(i / mw);
            ctx.fillStyle = MinimapUI.TILE_COLORS[tileType] || MinimapUI.TILE_COLORS[0];
            ctx.fillRect(offX + tx * ts, offY + ty * ts, ts, ts);
        }

        // ── Event icons (doors, NPCs, etc.) ─────────────────────
        if (Array.isArray(map.events)) {
            for (const ev of map.events) {
                const eventColors = {
                    TELEPORT: '#bb86fc',
                    NPC:      '#03dac6',
                    ENEMY:    '#f85149',
                    LOOT:     '#f39c12',
                    SHOP:     '#ffcc00',
                };
                ctx.fillStyle = eventColors[ev.type] || '#888';
                const ex = offX + ev.x * ts + Math.floor(ts / 2) - 1;
                const ey = offY + ev.y * ts + Math.floor(ts / 2) - 1;
                ctx.fillRect(ex, ey, 2, 2);
            }
        }

        // ── Players ─────────────────────────────────────────────
        const myCharId = (typeof Game !== 'undefined') ? Game.myCharId : null;
        const players  = (typeof Game !== 'undefined') ? Object.values(Game.players) : [];
        const partySet = new Set(MinimapUI.partyIds);

        // Draw other players first (so local player renders on top)
        for (const p of players) {
            if (p.charId === myCharId) continue;

            let color = '#00cccc'; // default: other player = cyan
            if (partySet.has(p.charId)) color = '#3fb950'; // party member = green

            ctx.fillStyle = color;
            const px = offX + p.x * ts;
            const py = offY + p.y * ts;
            const dotSize = Math.max(2, ts);
            ctx.fillRect(px, py, dotSize, dotSize);
        }

        // Draw local player (yellow, always visible)
        const me = (typeof Game !== 'undefined') ? Game.myHero : null;
        if (me) {
            const px = offX + me.x * ts;
            const py = offY + me.y * ts;
            const dotSize = Math.max(3, ts + 1);

            // Yellow glow effect: draw slightly larger dark ring first
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(px - 1, py - 1, dotSize + 2, dotSize + 2);

            ctx.fillStyle = '#ffcc00';
            ctx.fillRect(px, py, dotSize, dotSize);
        }

        // ── Border ───────────────────────────────────────────────
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth   = 1;
        ctx.strokeRect(0, 0, S, S);

        // ── Compass / map name label ──────────────────────────────
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font      = '8px Courier New';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const mapName = (typeof Game !== 'undefined') ? (Game.map?.name || '') : '';
        if (mapName) ctx.fillText(mapName.slice(0, 20), 4, 4);
    },

    // ─── SHOW / HIDE ─────────────────────────────────────────────
    show() {
        MinimapUI.visible = true;
        if (MinimapUI.canvas) MinimapUI.canvas.style.opacity = '1';
    },
    hide() {
        MinimapUI.visible = false;
        if (MinimapUI.canvas) MinimapUI.canvas.style.opacity = '0.1';
    },
};
