// =================================================================
// BATTLE STATE — In-memory battle tracker
// =================================================================
const crypto = require('crypto');
const stateInit = require('./state-init');
const {
    rebuildInitiative
} = require('./world');

const activeBattles = {};   // battleId -> BattleState
const battlesByMap  = {};   // mapId -> Set<battleId>  // battleId -> BattleState

// =================================================================
// BATTLE STATE — multi-combatant, team-aware
// =================================================================
// TEACHING: The battle state now supports N vs M combatants organised
// into two named teams: 'players' and 'enemies'.
//
// For 1v1 PvP: players=[humanStats], enemies=[humanStats]  (both isAI:false)
// For 1v1 PvE: players=[humanStats], enemies=[npcStats]    (enemies isAI:true)
// For party PvE: players=[p1,p2,p3], enemies=[boss1,boss2]
//
// All existing code that calls battle.getOpponent(charId) still works —
// it returns the first LIVING enemy on the opposing team.
//
// Turn order is a SPEED-SORTED QUEUE that cycles across all living
// combatants. Think FF7's ATB order rather than a simple back-and-forth.
// =================================================================
class BattleState {
    constructor(id, teams, type = 'PVP') {
        this.id       = id;
        this.type     = type;   // 'PVP' | 'PVE' | 'PARTY_PVE'
        this.status   = 'ACTIVE';
        this.winner   = null;   // 'players' | 'enemies' | charId (1v1 compat)
        this.turnNumber = 1;
        this.log      = [];

        // teams: { players: [statsObj,...], enemies: [statsObj,...] }
        //   OR multi-team: { team_1: [...], team_2: [...], team_3: [...] }
        // Each statsObj gets teamId injected.
        this.combatants = {};
        this.teams = {};

        // Detect multi-team format vs legacy 2-team format
        const teamKeys = Object.keys(teams);
        const isLegacy = teamKeys.includes('players') || teamKeys.includes('enemies');

        if (isLegacy) {
            // Legacy 2-team: players vs enemies
            this.teams.players = [];
            this.teams.enemies = [];
            for (const s of (teams.players || [])) {
                this.combatants[s.charId] = { ...s, isAI: false, teamId: 'players' };
                this.teams.players.push(s.charId);
            }
            for (const s of (teams.enemies || [])) {
                this.combatants[s.charId] = { ...s, isAI: true, teamId: 'enemies' };
                this.teams.enemies.push(s.charId);
            }
        } else {
            // Multi-team (FFA / N-team): { team_1: [{stats, isAI},...], ... }
            for (const [teamId, members] of Object.entries(teams)) {
                this.teams[teamId] = [];
                for (const s of (members || [])) {
                    const isAI = s.isAI !== undefined ? s.isAI : false;
                    this.combatants[s.charId] = { ...s, isAI, teamId };
                    this.teams[teamId].push(s.charId);
                }
            }
        }

        // Build speed-sorted turn queue and set first actor
        this._rebuildTurnQueue();
        this.turnQueueIdx = 0;
        this.turnCharId   = this.turnQueue[0] || null;

        // Movement tracking: resets each turn
        this._hasMoved = {};
        for (const id of Object.keys(this.combatants)) this._hasMoved[id] = false;

        // Assign starting grid positions
        this._assignGridPositions();

        // ── Terrain map ────────────────────────────────────────────
        // TEACHING: Terrain is stored as a flat object keyed by "x,y".
        // Values: 'forest' | 'high_ground' | 'water' | 'cover'
        // Loaded from the map's TERRAIN events when a battle starts.
        // If no map terrain is loaded, all tiles default to 'open'.
        this.terrainMap = {};

        // ── Battle objects (Session 3) ────────────────────────────
        // Destructible objects on the battle grid: barrels, crates, chandeliers.
        // Keyed by "x,y". Each has HP, a preset type, and destruction effects.
        this.battleObjects = {};

        // ── Security token ─────────────────────────────────────────
        // A random 32-char hex token assigned at creation.
        // Stored in game_battles.access_token so future HTTP routes
        // can verify a caller actually participated in this battle,
        // rather than just guessing sequential integer IDs.
        this.accessToken = crypto.randomBytes(16).toString('hex');

        // ── NPC tracking for quest kill credit ────────────────────
        this.enemyNpcIds = [];

        // ── Map location ─────────────────────────────────────────
        // Set after construction by createBattle/createPartyBattle.
        // Used for mid-battle join: other players on the same map
        // can see active battles and request to join.
        this.mapId = null;
        this.mapX  = null;
        this.mapY  = null;

        // ── Session 8: Battle settings (feature flags) ───────────
        // Loaded async after construction via initSettings().
        this._settings = null;

        // ── Session 8: Limb targeting state ──────────────────────
        // Populated by initLimbSystem() after construction.
        // Per-combatant: _limbHp, _limbZones, _woundLevels, _knockedOut, _nonLethal
        // _lastAttackUsed: for diminishing returns tracking
    }

    // ── Init methods — delegated to state-init.js ─────────────────
    async initSettings(db, arenaRow) { return stateInit.initSettings(this, db, arenaRow); }
    async initFightingStyles(db) { return stateInit.initFightingStyles(this, db); }
    async initFinal8(db) { return stateInit.initFinal8(this, db); }
    async initComboSystem(db) { return stateInit.initComboSystem(this, db); }
    async initSession24(db) { return stateInit.initSession24(this, db); }
    async initSession23(db) { return stateInit.initSession23(this, db); }
    async initCombatExtras(db) { return stateInit.initCombatExtras(this, db); }
    async initBossPhases(db) { return stateInit.initBossPhases(this, db); }
    async initWinCondition(db, winConditionId) { return stateInit.initWinCondition(this, db, winConditionId); }
    async initSpellSlots(db) { return stateInit.initSpellSlots(this, db); }
    async initSession10(db) { return stateInit.initSession10(this, db); }
    async initLimbSystem(db) { return stateInit.initLimbSystem(this, db); }

    // Apply stat caps — diminishing returns on a stat value
    applyStatCap(statKey, rawValue) {
        const caps = this._statCaps?.[statKey];
        if (!caps || !caps.length) return rawValue;
        let effective = 0;
        let prev = 0;
        for (const cap of caps) {
            const rangeEnd = Math.min(rawValue, cap.threshold);
            if (rangeEnd > prev) effective += (rangeEnd - prev) * cap.effectiveness;
            prev = cap.threshold;
        }
        // Beyond last cap
        if (rawValue > prev) {
            const lastEff = caps[caps.length - 1].effectiveness;
            effective += (rawValue - prev) * lastEff;
        }
        return Math.floor(effective);
    }

    // ── Map index helpers ────────────────────────────────────────
    registerOnMap(mapId, x, y) {
        this.mapId = parseInt(mapId);
        this.mapX  = x;
        this.mapY  = y;
        if (!battlesByMap[this.mapId]) battlesByMap[this.mapId] = new Set();
        battlesByMap[this.mapId].add(this.id);
    }

    unregisterFromMap() {
        if (this.mapId && battlesByMap[this.mapId]) {
            battlesByMap[this.mapId].delete(this.id);
            if (battlesByMap[this.mapId].size === 0) delete battlesByMap[this.mapId];
        }
    }

    // ── Add combatant mid-battle ─────────────────────────────────
    addCombatant(stats, teamId = 'players', isAI = false) {
        this.combatants[stats.charId] = { ...stats, isAI, teamId };
        if (!this.teams[teamId]) this.teams[teamId] = [];
        this.teams[teamId].push(stats.charId);
        this._hasMoved[stats.charId] = true; // can't move on the turn they join
        // Assign grid position based on team spawn corner
        const spawns = [
            { col: 1, row: 0 },
            { col: this.GRID_W - 2, row: 0 },
            { col: Math.floor(this.GRID_W / 2), row: 0 },
            { col: Math.floor(this.GRID_W / 2), row: this.GRID_H - 1 }
        ];
        const teamIdx = Object.keys(this.teams).indexOf(teamId);
        const spawn = spawns[teamIdx >= 0 ? teamIdx % spawns.length : 0];
        let placed = false;
        for (let y = 0; y < this.GRID_H && !placed; y++) {
            const occupied = Object.values(this.combatants).some(
                c => c.gridX === spawn.col && c.gridY === y && c.currentHp > 0);
            const objBlocked = this.getObjectAt(spawn.col, y)?.blocking;
            if (!occupied && !objBlocked) {
                this.combatants[stats.charId].gridX = spawn.col;
                this.combatants[stats.charId].gridY = y;
                placed = true;
            }
        }
        if (!placed) {
            this.combatants[stats.charId].gridX = spawn.col;
            this.combatants[stats.charId].gridY = 0;
        }
        // Rebuild turn queue to include the new combatant
        this._rebuildTurnQueue();

        // Session 8: init limb state for the new combatant
        const c = this.combatants[stats.charId];
        c._knockedOut = false;
        c._nonLethal = false;
        c._lastAttackUsed = null;
        c._diminishingReturns = 0;
        // Limb init is done by caller after addCombatant (needs async DB call)

        this.addLog({ actor: 'system', text: `${stats.name} joins the battle!` });
    }

    // ── Turn queue ─────────────────────────────────────────────────
    _rebuildTurnQueue() {
        const tabletop = require('./tabletop-rules');
        if (tabletop.isSubEnabled(this._settings, 'tabletop_initiative_dex')) {
            // D&D-style: d20 + DEX modifier for initiative
            this.turnQueue = tabletop.buildInitiativeOrder(this.combatants);
        } else {
            // Default: sort by speed stat
            const all = Object.values(this.combatants)
                .sort((a, b) => (b.speed + b.luck * 0.1) - (a.speed + a.luck * 0.1));
            this.turnQueue = all.map(c => c.charId);
        }
    }

    nextTurn() {
        const initType = this._settings?.initiative_type || 'speed';

        // ── ATB: tick gauges to find next ready combatant ────────
        if (initType === 'atb' && typeof this.tickATB === 'function') {
            // Reset the previous actor's gauge
            if (this.turnCharId && typeof this.resetATBGauge === 'function') {
                this.resetATBGauge(this.turnCharId, 1.0);
            }
            // Tick until someone is ready (max 200 iterations to prevent infinite loop)
            for (let tick = 0; tick < 200; tick++) {
                const ready = this.tickATB();
                if (ready.length > 0) {
                    this.turnCharId = ready[0];
                    this.turnNumber++;
                    this.resetMoveForTurn(this.turnCharId);
                    return;
                }
                // Force a small time advance for the next tick check
                if (this._atb) this._atb.lastTick -= this._atb.tickRate;
            }
            // Fallback: nobody ready, use speed sort
        }

        // ── CTB: advance counters to find next combatant ─────────
        if (initType === 'ctb' && typeof this.advanceCTB === 'function') {
            // Reset the previous actor's counter
            if (this.turnCharId && typeof this.resetCTBCounter === 'function') {
                this.resetCTBCounter(this.turnCharId, 1.0);
            }
            const next = this.advanceCTB();
            if (next) {
                this.turnCharId = next;
                this.turnNumber++;
                this.resetMoveForTurn(this.turnCharId);
                return;
            }
            // Fallback if CTB fails
        }

        // ── Speed/Roll/Phased: standard queue advance ────────────
        const max = this.turnQueue.length * 2;
        for (let i = 1; i <= max; i++) {
            const idx = (this.turnQueueIdx + i) % this.turnQueue.length;
            const c   = this.combatants[this.turnQueue[idx]];
            if (c && c.currentHp > 0 && !c._knockedOut) {
                this.turnQueueIdx = idx;
                this.turnCharId   = this.turnQueue[idx];
                this.turnNumber++;
                // Reset movement for the new actor
                this.resetMoveForTurn(this.turnCharId);
                return;
            }
        }
        // All dead — shouldn't reach here but failsafe
        this.status = 'FINISHED';
    }

    // ── Team helpers ───────────────────────────────────────────────
    getTeamId(charId)  { return this.combatants[charId]?.teamId; }

    // Returns ALL living enemies across all opposing teams (N-team aware)
    getEnemyTeam(charId) {
        const myTeam = this.getTeamId(charId);
        return Object.values(this.combatants)
            .filter(c => c.teamId !== myTeam && c.currentHp > 0 && !c._knockedOut);
    }

    getAllyTeam(charId) {
        const myTeam = this.getTeamId(charId);
        return Object.values(this.combatants)
            .filter(c => c.teamId === myTeam && c.charId !== charId && c.currentHp > 0 && !c._knockedOut);
    }

    // Backward-compatible single-target accessor — picks lowest HP enemy
    getOpponent(charId) {
        const enemies = this.getEnemyTeam(charId);
        if (!enemies.length) return null;
        return enemies.reduce((a, b) => a.currentHp < b.currentHp ? a : b);
    }

    // Get all team IDs
    getTeamIds() { return Object.keys(this.teams); }

    // ── Switch a combatant to a different team (diplomacy / alliance shift) ──
    switchTeam(charId, newTeamId) {
        const c = this.combatants[charId];
        if (!c) return false;
        const oldTeamId = c.teamId;
        if (oldTeamId === newTeamId) return false;
        // Remove from old team
        if (this.teams[oldTeamId]) {
            this.teams[oldTeamId] = this.teams[oldTeamId].filter(id => id !== charId);
            if (this.teams[oldTeamId].length === 0) delete this.teams[oldTeamId];
        }
        // Add to new team
        if (!this.teams[newTeamId]) this.teams[newTeamId] = [];
        this.teams[newTeamId].push(charId);
        c.teamId = newTeamId;
        this.addLog({ actor: 'system', text: `⚔️→🤝 ${c.name} switches to ${newTeamId}!` });
        return true;
    }

    getCombatant(charId) { return this.combatants[charId]; }

    addLog(entry) {
        this.log.push({ turn: this.turnNumber, time: Date.now(), ...entry });
    }

    // ── Grid positioning ──────────────────────────────────────────
    // TEACHING: We use a configurable grid (default 8×5). Columns 0-2 are
    // player side, right side is enemy side. Row 2 is center.
    // Chebyshev distance: diagonals count as 1 (like a chess king).
    // Grid dimensions are read from game_settings at battle creation time
    // and stored here. Change them in AdminSauce → Settings → Gameplay.
    GRID_W = 8;
    GRID_H = 5;

    _assignGridPositions() {
        const teamIds = Object.keys(this.teams);
        // Spawn positions for up to 4 teams: left, right, top, bottom
        // Each spawn is { col, rowCenter, spread:'vertical'|'horizontal' }
        const spawns = [
            { col: 1,                row: Math.floor(this.GRID_H / 2), spread: 'v' },  // left
            { col: this.GRID_W - 2,  row: Math.floor(this.GRID_H / 2), spread: 'v' },  // right
            { col: Math.floor(this.GRID_W / 2), row: 0,                spread: 'h' },   // top
            { col: Math.floor(this.GRID_W / 2), row: this.GRID_H - 1,  spread: 'h' },  // bottom
        ];

        teamIds.forEach((teamId, teamIdx) => {
            const members = (this.teams[teamId] || []).map(id => this.combatants[id]).filter(Boolean);
            const spawn = spawns[teamIdx % spawns.length];
            members.forEach((m, i) => {
                if (spawn.spread === 'v') {
                    const row = spawn.row + (i % 2 === 0 ? Math.floor(i/2) : -Math.ceil(i/2));
                    m.gridX = spawn.col;
                    m.gridY = Math.max(0, Math.min(this.GRID_H - 1, row));
                } else {
                    const col = spawn.col + (i % 2 === 0 ? Math.floor(i/2) : -Math.ceil(i/2));
                    m.gridX = Math.max(0, Math.min(this.GRID_W - 1, col));
                    m.gridY = spawn.row;
                }
            });
        });
    }

    // ── Battle Object presets ─────────────────────────────────────
    // TEACHING: Each preset defines HP, an icon, whether it blocks movement,
    // and what happens when it's destroyed. Destruction effects can deal AoE
    // damage, change terrain, or remove cover. This is the BG3-style
    // "shoot the barrel" gameplay.
    static OBJECT_PRESETS = {
        barrel:      { hp: 20, icon: '🛢️', label: 'Oil Barrel',   blocking: true,  coverValue: 0,
                       onDestroy: { type: 'fire_aoe', radius: 1, damage: 15, terrain: 'fire',
                                    message: '💥 The barrel explodes in a burst of flame!' } },
        crate:       { hp: 30, icon: '📦', label: 'Crate',         blocking: true,  coverValue: 30,
                       onDestroy: { type: 'remove_cover',
                                    message: '📦 The crate shatters!' } },
        chandelier:  { hp: 15, icon: '🕯️', label: 'Chandelier',   blocking: false, coverValue: 0,
                       onDestroy: { type: 'crush', damage: 30,
                                    message: '💥 The chandelier crashes down!' } },
        pot:         { hp: 10, icon: '🏺', label: 'Pot',           blocking: true,  coverValue: 10,
                       onDestroy: { type: 'remove_cover',
                                    message: '🏺 The pot shatters!' } },
        torch:       { hp: 12, icon: '🔥', label: 'Torch Stand',   blocking: true,  coverValue: 0,
                       onDestroy: { type: 'fire_aoe', radius: 0, damage: 10, terrain: 'fire',
                                    message: '🔥 The torch topples and ignites the ground!' } },
    };

    // Load map objects into the battle grid.
    // Called at battle creation time. Filters to objects within grid bounds
    // and that match known presets.
    loadObjects(mapObjects) {
        if (!mapObjects || !Array.isArray(mapObjects)) return;
        for (const obj of mapObjects) {
            const presetKey = (obj.preset || '').toLowerCase();
            const preset = BattleState.OBJECT_PRESETS[presetKey];
            if (!preset) continue;
            // Only load objects within grid bounds
            if (obj.x < 0 || obj.x >= this.GRID_W || obj.y < 0 || obj.y >= this.GRID_H) continue;
            const key = `${obj.x},${obj.y}`;
            // Don't place objects on occupied tiles (combatant starting positions)
            const occupied = Object.values(this.combatants).some(
                c => c.gridX === obj.x && c.gridY === obj.y);
            if (occupied) continue;

            // Admin overrides from map object editor (battle_hp, battle_destroy_type, etc.)
            const hp = obj.battle_hp || preset.hp;
            let onDestroy = preset.onDestroy;
            if (obj.battle_destroy_type) {
                onDestroy = { type: obj.battle_destroy_type,
                    damage: obj.battle_destroy_damage || (preset.onDestroy?.damage || 0),
                    radius: obj.battle_destroy_radius || (preset.onDestroy?.radius || 0),
                    terrain: obj.battle_destroy_type === 'fire_aoe' ? 'fire' : undefined,
                    message: preset.onDestroy?.message || `${obj.label || preset.label} is destroyed!` };
            } else if (obj.battle_destroy_type === '') {
                onDestroy = null; // Explicitly disabled
            }

            this.battleObjects[key] = {
                x: obj.x, y: obj.y,
                preset: presetKey,
                icon: obj.icon || preset.icon,
                label: obj.label || preset.label,
                maxHp: hp,
                currentHp: hp,
                blocking: obj.blocking !== undefined ? obj.blocking : preset.blocking,
                coverValue: obj.battle_cover_value || preset.coverValue || 0,
                onDestroy,
                destroyed: false
            };
        }
    }

    // Damage an object at (x,y). Returns destruction result or null.
    damageObject(x, y, damage, battle) {
        const key = `${x},${y}`;
        const obj = this.battleObjects[key];
        if (!obj || obj.destroyed) return null;

        obj.currentHp = Math.max(0, obj.currentHp - damage);
        const result = { objectKey: key, label: obj.label, icon: obj.icon, damage,
                         currentHp: obj.currentHp, maxHp: obj.maxHp, destroyed: false,
                         effects: [] };

        if (obj.currentHp <= 0) {
            obj.destroyed = true;
            result.destroyed = true;

            const fx = obj.onDestroy;
            if (!fx) return result;

            if (fx.type === 'fire_aoe') {
                // Set terrain to fire at this position
                if (fx.terrain) this.terrainMap[key] = fx.terrain;
                // AoE damage to combatants within radius
                const aoeTargets = Object.values(this.combatants).filter(c =>
                    c.currentHp > 0 && BattleState.chebyshev(c, { gridX: x, gridY: y }) <= (fx.radius || 0));
                for (const t of aoeTargets) {
                    t.currentHp = Math.max(0, t.currentHp - (fx.damage || 0));
                    result.effects.push({ type: 'fire_aoe', target: t.name, charId: t.charId,
                                          damage: fx.damage || 0 });
                    // Set fire terrain on their tile too if within radius
                    if (fx.terrain && fx.radius >= 1) {
                        this.terrainMap[`${t.gridX},${t.gridY}`] = fx.terrain;
                    }
                }
                // Also set fire on adjacent empty tiles within radius
                if (fx.radius >= 1 && fx.terrain) {
                    for (let dx = -fx.radius; dx <= fx.radius; dx++) {
                        for (let dy = -fx.radius; dy <= fx.radius; dy++) {
                            const tx = x + dx, ty = y + dy;
                            if (tx >= 0 && tx < this.GRID_W && ty >= 0 && ty < this.GRID_H) {
                                const tk = `${tx},${ty}`;
                                if ((this.terrainMap[tk] || 'open') !== 'water') {
                                    this.terrainMap[tk] = fx.terrain;
                                }
                            }
                        }
                    }
                }
            } else if (fx.type === 'crush') {
                // Damage to whoever is standing on this exact tile
                const crushed = Object.values(this.combatants).filter(c =>
                    c.currentHp > 0 && c.gridX === x && c.gridY === y);
                for (const t of crushed) {
                    t.currentHp = Math.max(0, t.currentHp - (fx.damage || 0));
                    result.effects.push({ type: 'crush', target: t.name, charId: t.charId,
                                          damage: fx.damage || 0 });
                }
            }
            // remove_cover: nothing extra needed — the object is just gone
        }
        return result;
    }

    // Get object at position (for targeting, cover checks)
    getObjectAt(x, y) {
        const obj = this.battleObjects[`${x},${y}`];
        return (obj && !obj.destroyed) ? obj : null;
    }

    // ── Terrain helpers ───────────────────────────────────────────
    // Load terrain from the map's TERRAIN events (collisions_json).
    // Called at battle creation time when we know the mapId.
    loadTerrain(events) {
        this.terrainMap = {};
        for (const ev of (events || [])) {
            if (ev.type === 'TERRAIN' && ev.terrain) {
                this.terrainMap[`${ev.x},${ev.y}`] = ev.terrain;
            }
        }
    }

    getTerrainAt(x, y) {
        return this.terrainMap[`${x},${y}`] || 'open';
    }

    // TEACHING: Flanking — you're flanking if you attack from BEHIND the
    // target (i.e. your gridX is ≥ target's gridX for enemies, or ≤ for players)
    // and you're adjacent (Chebyshev dist = 1). This gives a crit chance bonus.
    isFlanking(actorId, targetId) {
        const a = this.combatants[actorId];
        const t = this.combatants[targetId];
        if (!a || !t || a.gridX === undefined) return false;
        const dist = BattleState.chebyshev(a, t);
        if (dist > 1) return false; // must be adjacent
        // Flanking: attacker is on the SAME side as target faces away from
        // Players face right (enemies are to their right). Enemies face left.
        // A player flanks an enemy by being at gridX > enemy.gridX (behind them).
        // An enemy flanks a player by being at gridX < player.gridX.
        if (a.teamId === 'players' && a.gridX > t.gridX) return true;
        if (a.teamId === 'enemies' && a.gridX < t.gridX) return true;
        return false;
    }

    // Returns an object of active terrain modifiers for a damage calculation.
    // All values are multipliers or booleans — consumed by resolveDamage.
    getTerrainModifiers(actorId, targetId) {
        const a = this.combatants[actorId];
        const t = this.combatants[targetId];
        if (!a || !t || a.gridX === undefined) return {};

        const actorTerrain  = this.getTerrainAt(a.gridX, a.gridY);
        const targetTerrain = this.getTerrainAt(t.gridX, t.gridY);

        const mods = {
            damageBonus:     1.0,   // multiplied into final damage
            coverReduction:  0,     // flat % damage reduction for the defender
            critBonus:       0,     // added to crit chance
            rangeBonus:      0,     // added to skill range
            flanking:        false,
            terrainNotes:    []
        };

        // HIGH GROUND — attacker on high_ground gets +1 range and +15% damage
        if (actorTerrain === 'high_ground') {
            mods.damageBonus  *= 1.15;
            mods.rangeBonus   += 1;
            mods.terrainNotes.push('⛰️ High ground! (+15% dmg, +1 range)');
        }

        // FOREST — defender in forest gets 20% cover damage reduction
        if (targetTerrain === 'forest') {
            mods.coverReduction += 20;
            mods.terrainNotes.push('🌲 Forest cover! (-20% dmg)');
        }

        // COVER — solid cover object tile: 30% damage reduction
        if (targetTerrain === 'cover') {
            mods.coverReduction += 30;
            mods.terrainNotes.push('🧱 Cover! (-30% dmg)');
        }

        // WATER — attacker in water gets -10% damage (slowed)
        if (actorTerrain === 'water') {
            mods.damageBonus  *= 0.9;
            mods.terrainNotes.push('🌊 Wading through water (-10% dmg)');
        }

        // FLANKING — adjacent + behind: +20% crit chance, +1 extra crit multiplier
        if (this.isFlanking(actorId, targetId)) {
            mods.flanking   = true;
            mods.critBonus += 20;
            mods.terrainNotes.push('🗡️ Flanking! (+20% crit chance)');
        }

        // OBJECT COVER — if the target is adjacent to a non-destroyed object
        // with coverValue > 0, they get damage reduction from it.
        if (this.battleObjects) {
            for (const obj of Object.values(this.battleObjects)) {
                if (obj.destroyed || !obj.coverValue) continue;
                if (BattleState.chebyshev(t, { gridX: obj.x, gridY: obj.y }) <= 1) {
                    mods.coverReduction += obj.coverValue;
                    mods.terrainNotes.push(`${obj.icon} ${obj.label} cover! (-${obj.coverValue}% dmg)`);
                    break; // only best cover applies
                }
            }
        }

        // PRONE status on target — melee bonus, ranged penalty
        if (t.statuses?.Prone) {
            const dist = BattleState.chebyshev(a, t);
            if (dist <= 1) {
                mods.damageBonus  *= 1.25;
                mods.terrainNotes.push('⬇️ Target is Prone! (melee +25%)');
            } else {
                mods.coverReduction += 15;
                mods.terrainNotes.push('⬇️ Target is Prone (ranged -15%)');
            }
        }

        return mods;
    }

    static chebyshev(a, b) {
        return Math.max(Math.abs(a.gridX - b.gridX), Math.abs(a.gridY - b.gridY));
    }

    // Move a combatant to (x,y). Returns error string or null on success.
    moveCombatant(charId, x, y) {
        const actor = this.combatants[charId];
        if (!actor) return 'Combatant not found.';
        if (this._hasMoved[charId]) return 'Already moved this turn.';
        // ROOTED status prevents movement
        if (actor.statuses?.Rooted) return `${actor.name} is Rooted and cannot move!`;
        // Session 8: Wound-based movement restrictions
        if (actor._woundFlags?.cant_move) return `${actor.name}'s legs are disabled — cannot move!`;
        if (x < 0 || x >= this.GRID_W || y < 0 || y >= this.GRID_H) return 'Out of bounds.';
        // Check tile not occupied by combatant
        const occupied = Object.values(this.combatants).find(
            c => c.charId !== charId && c.currentHp > 0 && c.gridX === x && c.gridY === y
        );
        if (occupied) return `${occupied.name} is already there.`;
        // Check tile not blocked by an object
        const blockObj = this.getObjectAt(x, y);
        if (blockObj && blockObj.blocking) return `${blockObj.label} is in the way.`;
        // Check move range: speed/30 tiles, min 2, apply wound modifier
        let moveRange = Math.max(2, Math.floor((actor.speed || 10) / 30));
        if (actor._woundFlags?.move_range_mod) {
            moveRange = Math.max(0, moveRange + actor._woundFlags.move_range_mod);
        }
        if (moveRange <= 0) return `${actor.name} is too wounded to move!`;
        const dist = BattleState.chebyshev(actor, { gridX: x, gridY: y });
        if (dist > moveRange) return `Too far. Move range: ${moveRange} tile(s).`;
        actor.gridX = x;
        actor.gridY = y;
        this._hasMoved[charId] = true;
        return null;
    }

    resetMoveForTurn(charId) {
        this._hasMoved[charId] = false;
    }

    // ── Range check ────────────────────────────────────────────────
    // TEACHING: Skills declare `range` in their effects JSON.
    //   range: 1  = melee (default — must be adjacent)
    //   range: 3  = short magic / thrown
    //   range: 6  = bow / long-range
    //   range: 99 = global (no range check)
    // If no range specified, default to 1 (melee) for damage skills.
    isInRange(actorId, targetId, skillRange) {
        const a = this.combatants[actorId];
        const b = this.combatants[targetId];
        if (!a || !b) return false;
        if (a.gridX === undefined || b.gridX === undefined) return true; // no grid — always in range
        const dist = BattleState.chebyshev(a, b);
        return dist <= (skillRange || 1);
    }

    // ── Grid snapshot for clients ──────────────────────────────────
    getGridState() {
        return {
            width:  this.GRID_W,
            height: this.GRID_H,
            tokens: Object.values(this.combatants).map(c => ({
                charId: c.charId, name: c.name, teamId: c.teamId,
                gridX: c.gridX, gridY: c.gridY,
                dead: c.currentHp <= 0 && !c._knockedOut,
                knockedOut: c._knockedOut || false,
                hp: c.currentHp, maxHp: c.maxHp
            })),
            objects: Object.values(this.battleObjects || {}).map(o => ({
                x: o.x, y: o.y,
                preset: o.preset, icon: o.icon, label: o.label,
                hp: o.currentHp, maxHp: o.maxHp,
                destroyed: o.destroyed, blocking: o.blocking,
                coverValue: o.coverValue || 0
            }))
        };
    }

    // ── Win condition (N-team aware: last team standing) ──────────
    checkWinCondition() {
        // Session 8: KO'd combatants count as out for win-condition purposes
        const aliveTeams = Object.entries(this.teams)
            .filter(([_, ids]) => ids.some(id => {
                const c = this.combatants[id];
                return c && c.currentHp > 0 && !c._knockedOut;
            }))
            .map(([teamId]) => teamId);

        if (aliveTeams.length <= 1) {
            this.status = 'FINISHED';
            if (aliveTeams.length === 1) {
                const winTeamId = aliveTeams[0];
                const winMembers = this.teams[winTeamId].filter(id => this.combatants[id]?.currentHp > 0);
                this.winner = winMembers[0] || this.teams[winTeamId][0];
                this.winnerTeamId = winTeamId;
            } else {
                // All dead — draw
                this.winner = null;
                this.winnerTeamId = null;
            }
        }
    }

    // ── Turn-order preview for the UI ──────────────────────────────
    // Returns the next `count` actors in queue order (living only)
    getTurnOrder(count = 5) {
        const result = [];
        let idx = this.turnQueueIdx;
        for (let i = 0; result.length < count && i < this.turnQueue.length * 2; i++) {
            const cid = this.turnQueue[idx % this.turnQueue.length];
            const c   = this.combatants[cid];
            if (c && c.currentHp > 0 && !c._knockedOut) {
                result.push({
                    charId: c.charId, name: c.name, teamId: c.teamId,
                    isAI: c.isAI, isCurrent: i === 0
                });
            }
            idx++;
        }
        return result;
    }

    // ── Snapshot helpers ───────────────────────────────────────────
    _snap(c) {
        if (!c) return null;
        const snap = {
            charId: c.charId, name: c.name,
            hp: c.currentHp, maxHp: c.maxHp,
            mp: c.currentMp, maxMp: c.maxMp,
            statuses: c.statuses, limitbreak: c.limitbreak,
            stance: c._stance || null, isAI: c.isAI, teamId: c.teamId,
            dead: c.currentHp <= 0,
            // Session 8
            knockedOut: c._knockedOut || false,
            nonLethal: c._nonLethal || false,
            prone: c._woundFlags?.prone || false,
            woundFlags: c._woundFlags ? {
                cantFlee: c._woundFlags.cant_flee,
                cantMove: c._woundFlags.cant_move,
                cantUseItems: c._woundFlags.cant_use_items,
                cantDualWield: c._woundFlags.cant_dual_wield,
                moveRangeMod: c._woundFlags.move_range_mod,
            } : null,
            defaultDefense: c._defaultDefense || 'block',
            // Session 10
            kiChanneled: c._kiChanneled ? { turnsLeft: c._kiChanneled.turnsLeft } : null,
            bleeds: (c._bleeds || []).map(b => ({ tier: b.tier, turnsLeft: b.turnsLeft, icon: b.icon, label: b.label })),
            // Session 12: RP effects
            taunted: c._taunted ? { by: c._taunted.by, turnsLeft: c._taunted.turnsLeft } : null,
            intimidated: c._intimidated ? { turnsLeft: c._intimidated.turnsLeft } : null,
            rallied: c._rallied ? { turnsLeft: c._rallied.turnsLeft, atkBonus: c._rallied.atkBonus } : null,
            tauntBonus: c._tauntBonus ? { turnsLeft: c._tauntBonus.turnsLeft } : null,
            // Stagger (FF7R)
            staggerGauge: c._staggerGauge || 0,
            staggerThreshold: c._staggerThreshold || 0,
            isStaggered: c._isStaggered || false,
            staggerMult: c._staggerMult || null,
            // Final 8
            shieldPoints: c._shieldPoints ?? null,
            maxShieldPoints: c._maxShieldPoints ?? null,
            isBroken: c._isBroken || false,
            shieldWeaknesses: c._shieldWeaknesses || [],
            passives: (c._passives || []).map(p => ({ name: p.label, icon: p.icon })),
            weaponType: c._weaponType || null,
            rollingDamage: c._rollingDamage || 0,
            // Combo/Action
            currentAp: c._currentAp ?? null,
            maxAp: c._maxAp ?? null,
            discoveredArts: c._discoveredArtIds ? c._discoveredArtIds.size : 0,
            // Session 24
            alignment: c.alignment || 0,
            alignmentTier: c._alignmentTier ? { name: c._alignmentTier.label, icon: c._alignmentTier.icon, color: c._alignmentTier.color } : null,
            // Sessions 17-22
            isStealthed: c._isStealthed || false,
            transformed: c._transformed ? { name: c._transformed.name, icon: c._transformed.icon, turnsLeft: c._transformed.turnsLeft, visual: c._transformed.visual } : null,
            // Session 16
            isBoss: c._isBoss || false,
            currentPhase: c._currentPhase || 0,
            bossPhaseCount: c._bossPhases?.length || 0,
            // Session 15
            spellSlots: c._spellSlots || null,
            isSummon: c._isSummon || false,
            summonTurnsLeft: c._summonTurnsLeft || null,
            summonedBy: c._summonedBy || null,
            // Session 13
            fightingStyle: c._fightingStyle ? {
                styleName: c._fightingStyle.styleLabel, styleIcon: c._fightingStyle.styleIcon,
                rank: c._fightingStyle.rank, rankLabel: c._fightingStyle.rankLabel,
                styleType: c._fightingStyle.styleType
            } : null,
        };
        // Include limb data if system is active
        if (c._limbHp && this._settings?.enable_limb_targeting) {
            snap.limbHp = c._limbHp;
            snap.woundLevels = c._woundLevels || {};
            snap.bodyTypeId = c.bodyTypeId || 1;
            snap.limbZones = (c._limbZones || []).map(z => ({
                key: z.key, label: z.label, icon: z.icon, sortOrder: z.sortOrder
            }));
        }
        return snap;
    }

    _mySnap(c) {
        if (!c) return null;
        return {
            ...this._snap(c),
            breaklevel: c.breaklevel,
            charging: c._charging
                ? { skillId: c._charging.skillId, turnsLeft: c._charging.turnsLeft, skillName: c._charging.skillName }
                : null
        };
    }

    // ── Client state ───────────────────────────────────────────────
    toClientState(forCharId) {
        const turnOrder  = this.getTurnOrder(6);

        // Multi-team: build allTeams map
        const allTeams = {};
        for (const [teamId, ids] of Object.entries(this.teams)) {
            allTeams[teamId] = ids.map(id => this._snap(this.combatants[id]));
        }

        // Backward compat: playerTeam/enemyTeam for 2-team battles
        const teamIds = Object.keys(this.teams);
        const myTeamId = forCharId ? this.getTeamId(forCharId) : teamIds[0];
        const playerTeam = allTeams[myTeamId] || allTeams[teamIds[0]] || [];
        // enemyTeam = all non-ally teams flattened (for legacy UI)
        const enemyTeam = teamIds
            .filter(t => t !== myTeamId)
            .flatMap(t => allTeams[t] || []);

        const base = {
            battleId: this.id, turn: this.turnNumber,
            isMyTurn: this.turnCharId === forCharId,
            turnCharId: this.turnCharId,
            turnOrder,
            playerTeam, enemyTeam,
            allTeams,
            myTeamId: myTeamId || null,
            teamCount: teamIds.length,
            grid: this.getGridState(),
            terrainMap: this.terrainMap || {},
            hasMoved: forCharId ? !!this._hasMoved[forCharId] : false,
            moveRange: (() => {
                if (!forCharId || !this.combatants[forCharId]) return 2;
                const mc = this.combatants[forCharId];
                let range = Math.max(2, Math.floor((mc.speed || 10) / 30));
                if (mc._woundFlags?.move_range_mod) range = Math.max(0, range + mc._woundFlags.move_range_mod);
                if (mc._woundFlags?.cant_move) range = 0;
                return range;
            })(),
            status: this.status, winner: this.winner,
            winnerTeamId: this.winnerTeamId || null,
            log: this.log.slice(-10)
        };

        // Session 17: Weather
        if (this._weather) {
            base.weather = {
                name: this._weather.name, label: this._weather.label,
                icon: this._weather.icon, visibility: this._weather.visibility
            };
        }

        // Session 16: win condition info for display
        if (this._winCondition) {
            base.winCondition = {
                type: this._winCondition.conditionType,
                description: this._winCondition.description,
                icon: this._winCondition.icon,
                params: this._winCondition.params
            };
        }

        // Session 8: include battle settings so client knows which features are on
        if (this._settings) {
            base.settings = {
                enableLimbTargeting:      this._settings.enable_limb_targeting,
                enableActiveDefense:      this._settings.enable_active_defense,
                enableNonlethal:          this._settings.enable_nonlethal,
                enableDiminishingReturns: this._settings.enable_diminishing_returns,
                enableWoundDegradation:   this._settings.enable_wound_degradation,
                enableCalledShotPenalty:  this._settings.enable_called_shot_penalty,
                defensePromptTimeoutMs:   this._settings.defense_prompt_timeout_ms,
                // Session 9
                enableFlavorText:        this._settings.enable_flavor_text,
                enableComboProcs:        this._settings.enable_combo_procs,
                enableKiChanneling:      this._settings.enable_ki_channeling,
                enableBleedTiers:        this._settings.enable_bleed_tiers,
                // Session 12
                enableBossPhases:        this._settings.enable_boss_phases,
                enableCustomWinConditions: this._settings.enable_custom_win_conditions,
                enableSummons:           this._settings.enable_summons,
                enableSpellSlots:        this._settings.enable_spell_slots,
                summonCostType:          this._settings.summon_cost_type,
                enableFightingStyles:    this._settings.enable_fighting_styles,
                // Session 23
                // Session 24
                // Final 8
                enableStaggerSystem:     this._settings.enable_stagger_system,
                enableBreakShield:       this._settings.enable_break_shield,
                enableOneMore:           this._settings.enable_one_more,
                enableTurnManipulation:  this._settings.enable_turn_manipulation,
                enablePartySwap:         this._settings.enable_party_swap,
                enableWeaponTriangle:    this._settings.enable_weapon_triangle,
                enableAdvantageSystem:   this._settings.enable_advantage_system,
                enablePassiveAbilities:  this._settings.enable_passive_abilities,
                enableRollingHp:         this._settings.enable_rolling_hp,
                enableComboInput:        this._settings.enable_combo_input,
                enableActionCommands:    this._settings.enable_action_commands,
                enableAlignmentSystem:   this._settings.enable_alignment_system,
                enableBattleRules:       this._settings.enable_battle_rules,
                enableElementalReactions: this._settings.enable_elemental_reactions,
                enableThreatSystem:      this._settings.enable_threat_system,
                enableStatusCombos:      this._settings.enable_status_combos,
                enableEquipSwap:         this._settings.enable_battle_equip_swap,
                enableAfterlife:         this._settings.enable_afterlife,
                aiDifficulty:            this._settings.ai_difficulty,
                initiativeType:          this._settings.initiative_type,
                enableRpDescriptions:    this._settings.enable_rp_descriptions,
                enableBattleNarration:   this._settings.enable_battle_narration,
                enableRpCommands:        this._settings.enable_rp_commands,
                enableSignatureTechs:    this._settings.enable_signature_techs,
            };
        }

        // me / opponent for backward compat with 1v1 render path
        const me  = forCharId ? this.combatants[forCharId] : null;
        const opp = me ? this.getOpponent(forCharId) : null;
        if (me) {
            base.me       = this._mySnap(me);
            base.opponent = this._snap(opp);
        }
        return base;
    }
}

module.exports = { BattleState, activeBattles, battlesByMap };
