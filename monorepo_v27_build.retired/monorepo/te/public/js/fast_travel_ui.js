// =================================================================
// FAST TRAVEL PANEL — discovered warp points UI
// Opened by pressing 'M' or clicking the map icon in the HUD.
// =================================================================
const FastTravelUI = {
    _open: false,
    _warpPoints: [],

    toggle() {
        if (FastTravelUI._open) { FastTravelUI.close(); return; }
        FastTravelUI.open();
    },

    async open() {
        if (BattleUI.active) return; // can't fast travel mid-battle
        FastTravelUI._open = true;

        // Fetch warp points from server
        const r = await fetch('/fast-travel-points').catch(() => null);
        const d = r ? await r.json() : { success: false, points: [] };
        FastTravelUI._warpPoints = d.success ? d.points : [];

        FastTravelUI._render();
    },

    close() {
        FastTravelUI._open = false;
        const el = document.getElementById('fastTravelPanel');
        if (el) el.remove();
    },

    _render() {
        const existing = document.getElementById('fastTravelPanel');
        if (existing) existing.remove();

        const panel = document.createElement('div');
        panel.id = 'fastTravelPanel';
        panel.style.cssText = `
            position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            width:400px;max-width:95vw;max-height:70vh;overflow-y:auto;
            background:#0d1117;border:1px solid #30363d;border-radius:12px;
            padding:20px;z-index:8000;font-family:monospace;
            box-shadow:0 8px 32px rgba(0,0,0,.6)`;

        const pts = FastTravelUI._warpPoints;
        const currentMap = Game.myHero?.mapId;

        const listHtml = pts.length
            ? pts.map(wp => {
                const isCurrent = wp.mapId === currentMap;
                return `<div style="display:flex;align-items:center;gap:10px;padding:10px;margin-bottom:6px;
                    background:${isCurrent?'rgba(66,165,245,.08)':'rgba(255,255,255,.02)'};
                    border:1px solid ${isCurrent?'#42A5F5':'#21262d'};border-radius:8px">
                    <span style="font-size:18px">${isCurrent?'📍':'✈️'}</span>
                    <div style="flex:1">
                        <div style="color:${isCurrent?'#42A5F5':'#c9d1d9'};font-size:13px;font-weight:${isCurrent?700:400}">${wp.name}</div>
                        <div style="font-size:10px;color:#484f58">
                            ${isCurrent ? 'Current location' : 'Discovered ' + new Date(wp.discoveredAt).toLocaleDateString()}
                        </div>
                    </div>
                    ${isCurrent ? '<span style="font-size:10px;color:#42A5F5;padding:2px 6px;border:1px solid #42A5F5;border-radius:4px">HERE</span>'
                        : `<button onclick="FastTravelUI._travel(${wp.mapId})"
                            style="background:#42A5F5;border:none;color:#000;padding:6px 12px;
                            border-radius:6px;cursor:pointer;font-family:monospace;font-size:11px;font-weight:700">
                            GO</button>`}
                </div>`;
            }).join('')
            : `<div style="text-align:center;padding:30px;color:#484f58">
                <div style="font-size:24px;margin-bottom:8px">🗺️</div>
                <div>No warp points discovered yet.</div>
                <div style="font-size:11px;margin-top:6px">Explore maps with fast travel enabled to unlock them.</div>
               </div>`;

        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <div>
                    <div style="font-size:16px;font-weight:700;color:#42A5F5">✈️ Fast Travel</div>
                    <div style="font-size:11px;color:#484f58;margin-top:2px">${pts.length} location${pts.length!==1?'s':''} discovered</div>
                </div>
                <button onclick="FastTravelUI.close()"
                    style="background:none;border:none;color:#484f58;cursor:pointer;font-size:18px;padding:4px 8px">✕</button>
            </div>
            ${listHtml}
            <div style="margin-top:12px;font-size:10px;color:#484f58;text-align:center">
                Press M or ESC to close
            </div>`;

        document.body.appendChild(panel);
    },

    _travel(mapId) {
        FastTravelUI.close();
        Game.socket.emit('fast_travel', { mapId });
    }
};

// Keyboard shortcut: M to open fast travel
window.addEventListener('keydown', (e) => {
    if (document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA') return;
    if (e.key === 'm' || e.key === 'M') {
        FastTravelUI.toggle();
    }
    if (e.key === 'Escape' && FastTravelUI._open) {
        FastTravelUI.close();
    }
});
