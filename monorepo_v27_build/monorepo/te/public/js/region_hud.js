// =================================================================
// REGION HUD — Shows current region info in the game UI
// =================================================================
// Displays a small strip in the game HUD showing:
//   • Region name
//   • Danger level (color-coded)
//   • Active weather
//   • PvP / Sanctuary status
//   • XP/Gold multipliers if not 1.0
// Updates when the player changes maps or region state changes.
// =================================================================

const RegionHUD = {
    update: (region) => {
        const el = document.getElementById('region_hud');
        if (!el) return;

        if (!region) {
            el.style.display = 'none';
            return;
        }

        const DANGER_LABELS = ['', 'Safe', 'Low', 'Moderate', 'High', 'Lethal'];
        const DANGER_COLORS = ['', '#0a0', '#880', '#f80', '#f00', '#a00'];
        const WEATHER_ICONS = {
            CLEAR: '',  RAIN: '🌧', STORM: '⛈', FOG: '🌫',
            BLIZZARD: '❄️', BLOOD_MOON: '🌑'
        };

        const danger  = region.danger_level || 1;
        const weather = region.weather_override;
        const pvp     = region.pvp_enabled;
        const sanc    = region.is_sanctuary;

        let parts = [];
        parts.push(`<span style="color:${DANGER_COLORS[Math.min(danger,5)]};font-weight:700">⚠️${danger}</span>`);
        if (weather && weather !== 'CLEAR') parts.push(`<span>${WEATHER_ICONS[weather] || weather}</span>`);
        if (pvp)  parts.push('<span style="color:#f55" title="PvP enabled">⚔️PvP</span>');
        if (sanc) parts.push('<span style="color:#8af" title="Sanctuary — no combat">🕊️</span>');
        if (parseFloat(region.xp_mult) !== 1.0)
            parts.push(`<span style="color:#0cf" title="XP multiplier">${region.xp_mult}×XP</span>`);
        if (parseFloat(region.gold_mult) !== 1.0)
            parts.push(`<span style="color:#ffd700" title="Gold multiplier">${region.gold_mult}×G</span>`);

        el.innerHTML = `
            <span style="color:#888;font-size:10px;margin-right:4px">${region.name}</span>
            ${parts.join(' ')}`;
        el.style.display = 'flex';
    }
};
