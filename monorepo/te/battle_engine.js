// =================================================================
// BATTLE ENGINE v1.0 — Turn-Based Combat (The Arena)
// =================================================================
// ARCHITECTURE:
//   This is a SERVER-AUTHORITATIVE battle system.
//   The client sends commands ("I use Attack", "I cast Fire").
//   The server validates everything and sends back results.
//   The client just plays animations.
//
// FLOW:
//   1. Server creates a battle (via event_runner BATTLE action or PvP challenge)
//   2. Both combatants get a "battle_start" event with full state
//   3. Each turn: active player picks a command → server resolves → broadcast
//   4. Battle ends on death, flee, timeout
//
// WHAT'S DATA-DRIVEN (from MySQL):
//   - Battle commands (Attack, Defend, Skills, Items, Run)
//   - Skills (damage formulas, elements, status effects)
//   - Status effects (poison tick, stun, stat mods, turn duration)
//   - Elements (weakness/resistance system)
//   - Items (consumable effects in combat)
//   - Limit breaks (per-class ultimate abilities)
//   - Level table (XP/gold rewards)
// =================================================================

const crypto = require('crypto');
const { safeEval } = require('./event_runner');

// Optional Legendary Artifacts hook.
// If your project includes routes/artifactRoutes.js (with init(db) + onPvpKill()),
// the battle engine will call it when a PvP battle ends with a kill.
let artifactRoutes = null;
try {
    artifactRoutes = require('./routes/artifactRoutes');
} catch (e) {
    // Not installed in this build — totally fine.
    artifactRoutes = null;
}

function jp(s, f) { try { return JSON.parse(s); } catch { return f; } }

// =================================================================
// STAT CALCULATOR — Equipment + Status Modifiers
// =================================================================
// This is called BEFORE every action to get the "effective" stats.
// Base stats come from the character table.
// Equipment bonuses come from character_equipment + game_items.
// Status mods (ATK Up, etc.) come from active status_effects.
// Returns the final stat block used in all formulas.

async function getEffectiveStats(db, charId) {
    // 1. Base stats
    const [charRows] = await db.query("SELECT * FROM characters WHERE id=?", [charId]);
    if (!charRows.length) return null;
    const c = charRows[0];

    const stats = {
        charId: c.id,
        userId: c.user_id,
        name: c.name,
        level: c.level,
        classId: c.class_id,
        raceId: c.race_id,
        // HP/MP (current, not max — max is calculated)
        currentHp: c.current_hp,
        maxHp: c.max_hp,
        currentMp: c.current_mp,
        maxMp: c.max_mp,
        // Base combat stats
        atk: c.atk,
        def: c.def,
        mo: c.mo,      // Magic Offense
        md: c.md,       // Magic Defense
        speed: c.speed,
        luck: c.luck,
        // Limit break
        limitbreak: parseFloat(c.limitbreak) || 0,
        breaklevel: c.breaklevel || 1,
        // Status effects
        statuses: jp(c.status_effects, []),
        // Equipment info (filled below)
        weaponElements: [],
        weaponStatuses: {},
        armorBlockStatuses: [],
        // Element defenses: [{elemName, role, pct}]  role = resist|weak|nullify|absorb
        elemDefenses: [],
        // Blood Ogham bonuses (merged in below)
        oghamElements: [],
        oghamStatuses: {},  // {statusName: chance}
        experience: c.experience || 0
    };

    // 2. Equipment bonuses
    const [equip] = await db.query(`
        SELECT ce.slot_key, gi.* FROM character_equipment ce
        JOIN game_items gi ON ce.item_id = gi.id
        WHERE ce.character_id = ?`, [charId]);

    for (const item of equip) {
        stats.atk += (item.bonus_atk || 0);
        stats.def += (item.bonus_def || 0);
        stats.mo  += (item.bonus_mo || 0);
        stats.md  += (item.bonus_md || 0);
        stats.speed += (item.bonus_speed || 0);
        stats.luck  += (item.bonus_luck || 0);
        stats.maxHp += (item.bonus_hp || 0);
        stats.maxMp += (item.bonus_mp || 0);

        // Elements — new format: {fire:{role:'resist',pct:50}} OR legacy {fire:'defense'}
        const elems = jp(item.elements, null);
        if (elems) {
            for (const [elemName, val] of Object.entries(elems)) {
                const en = elemName.toLowerCase();
                if (typeof val === 'object' && val !== null) {
                    // New format
                    const role = val.role || 'resist';
                    const pct  = val.pct !== undefined ? val.pct : 50;
                    if (role === 'attack') {
                        stats.weaponElements.push(en);
                    } else {
                        stats.elemDefenses.push({ elem: en, role, pct });
                    }
                } else {
                    // Legacy format: 'attack' or 'defense'
                    if (val === 'attack') stats.weaponElements.push(en);
                    else stats.elemDefenses.push({ elem: en, role: 'resist', pct: 50 });
                }
            }
        }

        // Weapon on-hit status (from item field, not ogham)
        if (item.slot_key === 'MAIN_HAND' || item.slot_key === 'OFF_HAND') {
            const ws = jp(item.set_status, null);
            if (ws) Object.assign(stats.weaponStatuses, ws);
        }

        // Armor blocked statuses
        const blocked = jp(item.block_status, null);
        if (blocked) stats.armorBlockStatuses.push(...blocked);
    }

    // 3. Status effect modifiers (ATK Up = multiply ATK by 1.5, etc)
    for (const status of stats.statuses) {
        const [sRows] = await db.query("SELECT * FROM game_statuses WHERE id=?", [status.id]);
        if (!sRows.length) continue;
        const effects = jp(sRows[0].effects, {});
        if (effects.stat_mod) {
            for (const [statKey, multiplier] of Object.entries(effects.stat_mod)) {
                if (stats[statKey] !== undefined && typeof stats[statKey] === 'number') {
                    stats[statKey] = Math.floor(stats[statKey] * multiplier);
                }
            }
        }
    }

    // 4. Blood Ogham bonuses — load from character_oghams
    const [oghams] = await db.query(`
        SELECT co.*, go.element_attack, go.on_hit_status, go.on_hit_chance,
               go.stat_bonus_json, go.grant_skill_id, go.curse_json, go.family_id
        FROM character_oghams co
        JOIN game_oghams go ON go.id = co.ogham_id
        WHERE co.character_id = ?`, [charId]);

    for (const og of oghams) {
        if (og.element_attack) stats.oghamElements.push(og.element_attack.toLowerCase());
        if (og.on_hit_status) {
            stats.oghamStatuses[og.on_hit_status] = {
                chance: og.on_hit_chance || 20,
                curse:  jp(og.curse_json, null)
            };
        }
        const bonus = jp(og.stat_bonus_json, null);
        if (bonus) {
            for (const [k, v] of Object.entries(bonus)) {
                if (typeof stats[k] === 'number') stats[k] += v;
            }
        }
    }

    // --- SET BONUS: 2+ Oghams from same family = set bonus activates ---
    const familyCounts = {};
    for (const og of oghams) {
        if (og.family_id) familyCounts[og.family_id] = (familyCounts[og.family_id] || 0) + 1;
    }
    const activeFamily = Object.keys(familyCounts).filter(fid => familyCounts[fid] >= 2);
    if (activeFamily.length) {
        try {
            const [families] = await db.query(
                'SELECT * FROM game_ogham_families WHERE id IN (?)', [activeFamily]);
            for (const fam of families) {
                const sb = jp(fam.set_bonus_json, null);
                if (!sb) continue;
                if (sb.stat_bonus) {
                    for (const [k, v] of Object.entries(sb.stat_bonus)) {
                        if (typeof stats[k] === 'number') stats[k] += v;
                    }
                }
                if (sb.element_attack) stats.oghamElements.push(sb.element_attack.toLowerCase());
                if (sb.on_hit_status) {
                    stats.oghamStatuses[sb.on_hit_status] = {
                        chance: sb.on_hit_chance || 20, curse: null
                    };
                }
                if (!stats.activeSets) stats.activeSets = [];
                stats.activeSets.push({ name: fam.name, label: sb.label || fam.name });
            }
        } catch(setErr) { console.warn('Set bonus error (non-fatal):', setErr.message); }
    }

    // 5. Passive reaction skills (fire on_hit, on_crit, etc.)
    // TEACHING: Reactions are skills that have  "reaction": { "trigger": "on_hit", "chance": 30 }
    // in their effects JSON. They're assigned to a class like normal skills, but rather than
    // the player choosing them from the menu, they trigger automatically when the condition fires.
    try {
        const [reactRows] = await db.query(`
            SELECT gs.id, gs.name, gs.icon, gs.effects, gcs.learn_level
            FROM game_class_skills gcs
            JOIN game_skills gs ON gcs.skill_id = gs.id
            WHERE gcs.class_id = ? AND gcs.learn_level <= ?`, [stats.classId, stats.level]);
        stats.reactions = [];
        for (const r of reactRows) {
            const rfx = jp(r.effects, {});
            if (rfx.reaction && rfx.reaction.trigger) {
                stats.reactions.push({
                    skillId: r.id,
                    name:    r.name,
                    icon:    r.icon,
                    trigger: rfx.reaction.trigger,   // 'on_hit' | 'on_crit' | 'on_kill'
                    chance:  rfx.reaction.chance || 25
                });
            }
        }
    } catch { stats.reactions = []; }

    // Merge ogham elements into weapon elements
    stats.weaponElements = [...new Set([...stats.weaponElements, ...stats.oghamElements])];

    // Clamp HP to max
    if (stats.currentHp > stats.maxHp) stats.currentHp = stats.maxHp;
    if (stats.currentMp > stats.maxMp) stats.currentMp = stats.maxMp;

    return stats;
}

// Build the vars object for safeEval formulas
function buildFormulaVars(attacker, defender) {
    // TEACHING: These variables are available in skill/limit/command formula strings.
    // Examples:
    //   "MAXHP - HP"           → damage equal to attacker's missing HP
    //   "HP_PCT < 25 ? ATK*3 : ATK*1.5"  → conditional burst at low HP
    //   "LIMITBREAK * ATK"     → scales with how full limit bar is
    //   "ENEMY_HP_PCT < 30 ? MO*4 : MO*2" → execute-style spell
    return {
        ATK:        attacker.atk,
        DEF:        defender.def,
        MO:         attacker.mo,
        MD:         defender.md,
        SPEED:      attacker.speed,
        LUCK:       attacker.luck,
        HP:         attacker.currentHp,
        MP:         attacker.currentMp,
        MAXHP:      attacker.maxHp,
        MAXMP:      attacker.maxMp,
        HP_PCT:     attacker.maxHp > 0 ? Math.floor((attacker.currentHp / attacker.maxHp) * 100) : 0,
        LIMITBREAK: attacker.limitbreak || 0,
        LVL:        attacker.level,
        ENEMY_ATK:      defender.atk,
        ENEMY_DEF:      defender.def,
        ENEMY_MO:       defender.mo,
        ENEMY_MD:       defender.md,
        ENEMY_SPEED:    defender.speed,
        ENEMY_LUCK:     defender.luck,
        ENEMY_HP:       defender.currentHp,
        ENEMY_MAXHP:    defender.maxHp,
        ENEMY_HP_PCT:   defender.maxHp > 0 ? Math.floor((defender.currentHp / defender.maxHp) * 100) : 0,
        ENEMY_LVL:      defender.level
    };
}

// =================================================================
// TABLE COMPATIBILITY HELPERS
// =================================================================
// The project supports two naming conventions depending on which
// SQL migration was run first.  These helpers try the new GPT-style
// name first, then fall back to the original project name so the
// game works regardless of which schema version is installed.

async function queryLevelRow(db, level) {
    for (const tbl of ['level_requirements', 'game_levels']) {
        try {
            const [rows] = await db.query(`SELECT * FROM \`${tbl}\` WHERE level=?`, [level]);
            return rows;
        } catch (e) {
            if (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146) continue;
            throw e;
        }
    }
    return [];
}

async function queryLimitBreakRow(db, id, classId) {
    for (const tbl of ['game_limit_breaks', 'game_limits']) {
        try {
            const [rows] = await db.query(`SELECT * FROM \`${tbl}\` WHERE id=? AND class_id=?`, [id, classId]);
            return rows;
        } catch (e) {
            if (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146) continue;
            throw e;
        }
    }
    return [];
}

async function queryLimitBreaksList(db, classId, charLevel, breakLevel) {
    for (const tbl of ['game_limit_breaks', 'game_limits']) {
        try {
            const [rows] = await db.query(
                `SELECT * FROM \`${tbl}\` WHERE class_id=? AND char_level_req<=? AND break_level<=? ORDER BY break_level`,
                [classId, charLevel, breakLevel]
            );
            return rows;
        } catch (e) {
            if (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146) continue;
            throw e;
        }
    }
    return [];
}

// =================================================================
// BATTLE STATE — In-memory battle tracker
// =================================================================
const activeBattles = {};  // battleId -> BattleState

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
        // Each statsObj gets teamId injected; enemies get isAI:true
        this.combatants = {};
        this.teams = { players: [], enemies: [] };

        for (const s of (teams.players || [])) {
            this.combatants[s.charId] = { ...s, isAI: false, teamId: 'players' };
            this.teams.players.push(s.charId);
        }
        for (const s of (teams.enemies || [])) {
            this.combatants[s.charId] = { ...s, isAI: true, teamId: 'enemies' };
            this.teams.enemies.push(s.charId);
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

        // ── Security token ─────────────────────────────────────────
        // A random 32-char hex token assigned at creation.
        // Stored in game_battles.access_token so future HTTP routes
        // can verify a caller actually participated in this battle,
        // rather than just guessing sequential integer IDs.
        this.accessToken = crypto.randomBytes(16).toString('hex');

        // ── NPC tracking for quest kill credit ────────────────────
        // enemyNpcIds: the game_npcs.id values of enemies in this battle.
        // Set by createPartyBattle / createBattle after construction.
        // Used at victory to award server-authoritative kill credit.
        this.enemyNpcIds = [];
    }

    // ── Turn queue ─────────────────────────────────────────────────
    _rebuildTurnQueue() {
        const all = Object.values(this.combatants)
            .sort((a, b) => (b.speed + b.luck * 0.1) - (a.speed + a.luck * 0.1));
        this.turnQueue = all.map(c => c.charId);
    }

    nextTurn() {
        // Advance through the speed-sorted queue, skipping dead combatants
        const max = this.turnQueue.length * 2;
        for (let i = 1; i <= max; i++) {
            const idx = (this.turnQueueIdx + i) % this.turnQueue.length;
            const c   = this.combatants[this.turnQueue[idx]];
            if (c && c.currentHp > 0) {
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

    getEnemyTeam(charId) {
        const myTeam = this.getTeamId(charId);
        const opp    = myTeam === 'players' ? 'enemies' : 'players';
        return Object.values(this.combatants)
            .filter(c => c.teamId === opp && c.currentHp > 0);
    }

    getAllyTeam(charId) {
        const myTeam = this.getTeamId(charId);
        return Object.values(this.combatants)
            .filter(c => c.teamId === myTeam && c.charId !== charId && c.currentHp > 0);
    }

    // Backward-compatible single-target accessor
    getOpponent(charId) { return this.getEnemyTeam(charId)[0] || null; }

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
        const players = this.teams.players.map(id => this.combatants[id]).filter(Boolean);
        const enemies  = this.teams.enemies.map(id => this.combatants[id]).filter(Boolean);

        // Spread players down left side (col 1), enemies down right side (col 6)
        const midP = Math.floor(this.GRID_H / 2);
        players.forEach((p, i) => {
            const row = midP + (i % 2 === 0 ? Math.floor(i/2) : -Math.ceil(i/2));
            p.gridX = 1;
            p.gridY = Math.max(0, Math.min(this.GRID_H-1, row));
        });
        const midE = Math.floor(this.GRID_H / 2);
        enemies.forEach((e, i) => {
            const row = midE + (i % 2 === 0 ? Math.floor(i/2) : -Math.ceil(i/2));
            e.gridX = this.GRID_W - 2;
            e.gridY = Math.max(0, Math.min(this.GRID_H-1, row));
        });
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
        if (x < 0 || x >= this.GRID_W || y < 0 || y >= this.GRID_H) return 'Out of bounds.';
        // Check tile not occupied
        const occupied = Object.values(this.combatants).find(
            c => c.charId !== charId && c.currentHp > 0 && c.gridX === x && c.gridY === y
        );
        if (occupied) return `${occupied.name} is already there.`;
        // Check move range: speed/30 tiles, min 2
        const moveRange = Math.max(2, Math.floor((actor.speed || 10) / 30));
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
                dead: c.currentHp <= 0,
                hp: c.currentHp, maxHp: c.maxHp
            }))
        };
    }

    // ── Win condition ──────────────────────────────────────────────
    checkWinCondition() {
        const playersAlive = this.teams.players.filter(id => this.combatants[id]?.currentHp > 0);
        const enemiesAlive = this.teams.enemies.filter(id => this.combatants[id]?.currentHp > 0);
        if (enemiesAlive.length === 0) {
            this.status = 'FINISHED';
            // winner = first living player (backward compat for 1v1 charId)
            this.winner = playersAlive[0] || this.teams.players[0];
        } else if (playersAlive.length === 0) {
            this.status = 'FINISHED';
            this.winner = this.teams.enemies[0]; // first enemy (1v1 compat)
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
            if (c && c.currentHp > 0) {
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
        return {
            charId: c.charId, name: c.name,
            hp: c.currentHp, maxHp: c.maxHp,
            mp: c.currentMp, maxMp: c.maxMp,
            statuses: c.statuses, limitbreak: c.limitbreak,
            stance: c._stance || null, isAI: c.isAI, teamId: c.teamId,
            dead: c.currentHp <= 0
        };
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
        const playerTeam = this.teams.players.map(id => this._snap(this.combatants[id]));
        const enemyTeam  = this.teams.enemies.map(id => this._snap(this.combatants[id]));

        const base = {
            battleId: this.id, turn: this.turnNumber,
            isMyTurn: this.turnCharId === forCharId,
            turnCharId: this.turnCharId,
            turnOrder,
            playerTeam, enemyTeam,
            grid: this.getGridState(),
            terrainMap: this.terrainMap || {},
            hasMoved: forCharId ? !!this._hasMoved[forCharId] : false,
            moveRange: forCharId && this.combatants[forCharId]
                ? Math.max(2, Math.floor((this.combatants[forCharId].speed || 10) / 30))
                : 2,
            status: this.status, winner: this.winner,
            log: this.log.slice(-10)
        };

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

// =================================================================
// BATTLE MANAGER — Create, Run, End battles
// =================================================================
const BattleManager = {

    // --- CREATE BATTLE (1v1 PvP or 1v1 PvE) ---
    // TEACHING: This is the original path for 1v1. It still works exactly
    // as before. The new createPartyBattle() below handles multi-combatant.
    createBattle: async (db, io, p1Socket, p2Socket, p1CharId, p2CharId, type = 'PVP') => {
        const p1Stats = await getEffectiveStats(db, p1CharId);
        const p2Stats = await getEffectiveStats(db, p2CharId);
        if (!p1Stats || !p2Stats) return null;

        const [res] = await db.query(
            `INSERT INTO game_battles (p1_char_id, p2_char_id, p1_user_id, p2_user_id, turn_char_id, status, battle_mode, access_token)
             VALUES (?,?,?,?,?,?,'1v1',?)`,
            [p1CharId, p2CharId, p1Stats.userId, p2Stats.userId,
             p1Stats.speed >= p2Stats.speed ? p1CharId : p2CharId, 'ACTIVE',
             crypto.randomBytes(16).toString('hex')]
        );
        const battleId = res.insertId;

        // 1v1 uses team arrays of one each
        // Read grid dimensions from settings (non-fatal — uses defaults on error)
        try {
            const [gw] = await db.query("SELECT value FROM game_settings WHERE `key`='battle_grid_w' LIMIT 1");
            const [gh] = await db.query("SELECT value FROM game_settings WHERE `key`='battle_grid_h' LIMIT 1");
            if (gw.length) p1Stats._gridW = parseInt(gw[0].value) || 8;
            if (gh.length) p1Stats._gridH = parseInt(gh[0].value) || 5;
        } catch {}

        const battle = new BattleState(battleId,
            { players: [p1Stats], enemies: [p2Stats] }, type);
        if (p1Stats._gridW) battle.GRID_W = p1Stats._gridW;
        if (p1Stats._gridH) battle.GRID_H = p1Stats._gridH;
        activeBattles[battleId] = battle;
        battle._assignGridPositions(); // re-assign now that dimensions are set

        // Load terrain from the map where the battle takes place
        // TEACHING: We fetch the map events for the first player's current map.
        // TERRAIN events (type='TERRAIN') get parsed into the battle's terrainMap.
        try {
            const [mapPos] = await db.query(
                'SELECT map_id FROM characters WHERE id=? LIMIT 1', [firstPlayer.charId]);
            if (mapPos.length) {
                const mapId = mapPos[0].map_id;
                const [mapRow] = await db.query(
                    'SELECT collisions_json FROM game_maps WHERE id=? LIMIT 1', [mapId]);
                if (mapRow.length) {
                    let events = [];
                    try { events = JSON.parse(mapRow[0].collisions_json || '[]'); } catch {}
                    battle.loadTerrain(events);
                }
            }
        } catch {} // terrain is non-fatal — battle works fine without it

        // Record participants (non-fatal — forward compat)
        try {
            await db.query(
                `INSERT IGNORE INTO game_battle_participants (battle_id,character_id,team,is_ai)
                 VALUES (?,?,1,0),(?,?,2,?)`,
                [battleId, p1CharId, battleId, p2CharId, type === 'PVE' ? 1 : 0]
            );
        } catch {}

        const p1Cmds = await getAvailableCommands(db, p1Stats);
        const p2Cmds = await getAvailableCommands(db, p2Stats);

        if (p1Socket) p1Socket.emit('battle_start', { ...battle.toClientState(p1CharId), commands: p1Cmds });
        if (p2Socket) p2Socket.emit('battle_start', { ...battle.toClientState(p2CharId), commands: p2Cmds });

        battle.addLog({ actor: 'system', text: `Battle begins! ${p1Stats.name} vs ${p2Stats.name}!` });

        if (type === 'PVE' && battle.turnCharId === p2CharId) {
            setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1500);
        }
        return battleId;
    },

    // --- CREATE PARTY BATTLE (N players vs M enemies) ---
    // TEACHING: Party PvE. playerCharIds = array of human char IDs already
    // in a party. enemyCharIds = NPC char_ids (from game_npcs.char_id).
    // socketMap = { charId -> socket } so we can notify each player.
    //
    // XP + gold are split evenly across the surviving player team at end.
    //
    // Turn order: all combatants speed-sorted. Players and enemies alternate
    // naturally based on speed — no artificial ping-pong.
    createPartyBattle: async (db, io, playerCharIds, enemyNpcIds, socketMap = {}) => {
        // Resolve NPC ids → char_ids
        const enemyCharIds = [];
        const npcNames     = {};
        for (const npcId of enemyNpcIds) {
            const [rows] = await db.query(
                'SELECT char_id, name FROM game_npcs WHERE id=? AND is_enemy=1', [npcId]);
            if (!rows.length || !rows[0].char_id) continue;
            enemyCharIds.push(rows[0].char_id);
            npcNames[rows[0].char_id] = rows[0].name;
        }
        if (!enemyCharIds.length) return null;

        // Load stats for everyone
        const playerStats = (await Promise.all(playerCharIds.map(id => getEffectiveStats(db, id)))).filter(Boolean);
        const enemyStats  = (await Promise.all(enemyCharIds.map(id => getEffectiveStats(db, id)))).filter(Boolean);
        if (!playerStats.length || !enemyStats.length) return null;

        // Use first player + first enemy for the game_battles anchor row (backward compat)
        const firstPlayer = playerStats[0];
        const firstEnemy  = enemyStats[0];
        const accessToken = crypto.randomBytes(16).toString('hex');
        const [res] = await db.query(
            `INSERT INTO game_battles (p1_char_id, p2_char_id, p1_user_id, p2_user_id,
              turn_char_id, status, battle_mode, access_token)
             VALUES (?,?,?,?,?,'ACTIVE','PARTY',?)`,
            [firstPlayer.charId, firstEnemy.charId, firstPlayer.userId,
             firstEnemy.userId || 0,
             playerStats.sort((a,b)=>b.speed-a.speed)[0].charId,
             accessToken]
        );
        const battleId = res.insertId;

        const battle = new BattleState(battleId,
            { players: playerStats, enemies: enemyStats }, 'PARTY_PVE');
        battle.accessToken  = accessToken;
        battle.enemyNpcIds  = [...enemyNpcIds];   // original game_npcs.id values
        activeBattles[battleId] = battle;

        // Record all participants
        try {
            const vals = [
                ...playerCharIds.map(id => [battleId, id, 1, 0]),
                ...enemyCharIds.map(id  => [battleId, id, 2, 1])
            ];
            for (const v of vals) {
                await db.query(
                    'INSERT IGNORE INTO game_battle_participants (battle_id,character_id,team,is_ai) VALUES (?,?,?,?)',
                    v
                );
            }
        } catch {}

        // Send battle_start to every player socket
        const names = [...playerStats, ...enemyStats].map(s => s.name).join(', ');
        battle.addLog({ actor: 'system', text: `Party battle begins! ${names}` });

        for (const ps of playerStats) {
            const sock = socketMap[ps.charId];
            if (!sock) continue;
            const cmds = await getAvailableCommands(db, ps);
            sock.emit('battle_start', { ...battle.toClientState(ps.charId), commands: cmds });
            sock.join('battle_' + battleId);
            sock._battleCharId = ps.charId;
        }

        // If first actor is AI, queue its turn
        const firstActor = battle.getCombatant(battle.turnCharId);
        if (firstActor && firstActor.isAI) {
            setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1500);
        }
        return battleId;
    },

    // --- GET AVAILABLE COMMANDS ---
    // Returns the command menu for a combatant (filtered by status effects)
    getAvailableCommands,

    // --- PROCESS PLAYER ACTION ---
    processAction: async (db, io, socket, { battleId, commandId, skillId, itemId, limitId, targetId }) => {
        const battle = activeBattles[battleId];
        if (!battle || battle.status !== 'ACTIVE') {
            socket.emit('battle_error', 'No active battle.');
            return;
        }

        // Verify this socket is actually a participant in THIS battle.
        //
        // Security: socket._battleCharId is set by the SERVER when the battle
        // starts (see the start_pve_battle / battle_accept handlers). Clients
        // cannot forge it — it comes from onlinePlayers[socket.id].charId.
        //
        // We intentionally do NOT fall back to "find any non-AI combatant"
        // because that fallback would let any logged-in socket send actions
        // in a battle they're not part of by guessing the battleId (which is
        // a simple auto-increment integer).
        const charId = socket._battleCharId;
        if (!charId) {
            socket.emit('battle_error', 'Not in a battle.');
            return;
        }
        if (!battle.combatants[charId]) {
            socket.emit('battle_error', 'Not a participant in this battle.');
            return;
        }
        // Multi-char teams: socket owns multiple charIds (3v3 PvP).
        const teamIds = socket._battleTeamIds || [charId];
        if (!teamIds.includes(battle.turnCharId)) {
            socket.emit('battle_error', 'Not your turn.');
            return;
        }

        // Act as the current turn's character (in 3v3, may differ from socket._battleCharId)
        const actingCharId = battle.turnCharId;
        const actor = battle.getCombatant(actingCharId);
        // targetId lets party-battle players choose which enemy to hit.
        // Fall back to getOpponent (first living enemy) for 1v1.
        let target = battle.getOpponent(actingCharId);
        if (targetId) {
            const manual = battle.getCombatant(parseInt(targetId));
            if (manual && manual.teamId !== actor.teamId && manual.currentHp > 0) {
                target = manual;
            }
        }

        // If actor has a charging skill ready this turn, auto-fire it
        // (override whatever the client sent — charge fires itself)
        if (actor._charging && actor._charging.turnsLeft <= 0) {
            const chargedId = actor._charging.skillId;
            actor._charging = null;
            actor._chargingFire = true; // flag so executeBattleAction skips charge re-init
            const result = await executeBattleAction(db, battle, actor, target, { skillId: chargedId });
            actor._chargingFire = false;
            await broadcastBattleUpdate(io, battle, result, db);
            if (battle.status !== 'ACTIVE') { await endBattle(db, io, battle); return; }
            const _tickR = await processStatusEffects(db, battle); if (_tickR.log.length) await broadcastBattleUpdate(io, battle, _tickR, db);
            checkDeaths(battle);
            if (battle.status !== 'ACTIVE') { await broadcastBattleUpdate(io, battle, { text: 'Battle Over!' }, db); await endBattle(db, io, battle); return; }
            battle.nextTurn();
            await broadcastBattleUpdate(io, battle, null, db);
            const nextAct = battle.getCombatant(battle.turnCharId);
            if (nextAct.isAI) setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1200);
            return;
        }

        // Execute the action
        const result = await executeBattleAction(db, battle, actor, target, { commandId, skillId, itemId, limitId });

        // Send result to both players
        await broadcastBattleUpdate(io, battle, result, db);

        // Check for battle end
        if (battle.status !== 'ACTIVE') {
            await endBattle(db, io, battle);
            return;
        }

        // Process turn-end status effects, then next turn
        const tickResult = await processStatusEffects(db, battle);

        // If ticks produced output, broadcast them as a mini-action so popups fire
        if (tickResult.log.length) {
            await broadcastBattleUpdate(io, battle, tickResult, db);
        }

        // Check deaths from status effects
        checkDeaths(battle);
        if (battle.status !== 'ACTIVE') {
            await broadcastBattleUpdate(io, battle, { text: 'Battle Over!' }, db);
            await endBattle(db, io, battle);
            return;
        }

        // Decrement charge counters for the NEXT actor (was just set this turn)
        for (const cid of Object.keys(battle.combatants)) {
            const c = battle.combatants[cid];
            if (c._charging && c._charging.turnsLeft > 0) {
                c._charging.turnsLeft--;
            }
        }

        battle.nextTurn();
        await broadcastBattleUpdate(io, battle, null, db);

        // AI turn
        const nextActor = battle.getCombatant(battle.turnCharId);
        if (nextActor.isAI) {
            setTimeout(() => BattleManager.aiTurn(db, io, battleId), 1200);
        }
    },

    // --- AI TURN ---
    // TEACHING: A good RPG AI feels like it's "thinking" even when it isn't.
    // This one has three priority tiers:
    //   1. HEAL: If HP is critically low AND has a healing skill → use it.
    //   2. SKILL: 50% chance to use a random available skill (if has MP).
    //   3. ATTACK: Default physical attack.
    //      Also randomly defends (~15% chance) as a "bluffing" move.
    //
    // Enemy NPCs are assigned skills through the normal class system
    // (class_id on their characters row), so the AI automatically gets
    // whatever skills belong to their class. No special NPC logic needed.
    aiTurn: async (db, io, battleId) => {
        const battle = activeBattles[battleId];
        if (!battle || battle.status !== 'ACTIVE') return;

        const ai        = battle.getCombatant(battle.turnCharId);
        // Smart targeting: prefer lowest-HP player to finish them off,
        // fall back to getOpponent (first living enemy) for 1v1 compat
        const enemyTeam = battle.getEnemyTeam(battle.turnCharId);
        const player    = enemyTeam.length
            ? enemyTeam.reduce((a, b) => a.currentHp < b.currentHp ? a : b)
            : battle.getOpponent(battle.turnCharId);

        if (!player) return; // no targets — battle should have ended

        const available = await getAvailableCommands(db, ai);

        let commandId = null;
        let skillId   = null;
        let limitId   = null;

        // --- Priority 1: Limit break if bar is full ---
        if (ai.limitbreak >= 100 && available.limits && available.limits.length) {
            limitId = available.limits[0].id; // Use first available limit
        }

        // --- Priority 2: Heal if HP < 30% and have a heal skill ---
        else if (ai.currentHp / ai.maxHp < 0.30) {
            const healSkills = (available.skills || []).filter(sk => {
                // TEACHING: We know a skill heals if it's type=heal OR target=SELF
                // We check the skill type stored in commands list
                return sk.targetType === 'SELF';
            });
            if (healSkills.length && ai.currentMp >= healSkills[0].mpCost) {
                skillId = healSkills[0].id;
            }
        }

        // --- Priority 3: Use a combo-ready skill if available ---
        if (!skillId && !limitId && !commandId) {
            const comboReady = (available.skills || []).filter(sk =>
                sk.comboReady && ai.currentMp >= sk.mpCost
            );
            if (comboReady.length) {
                skillId = comboReady[Math.floor(Math.random() * comboReady.length)].id;
            }
        }

        // --- Priority 4: Use a random skill (50% chance, if has MP) ---
        if (!skillId && !limitId && !commandId && available.skills && available.skills.length) {
            if (Math.random() < 0.50) {
                const usable = available.skills.filter(sk =>
                    sk.targetType !== 'SELF' && ai.currentMp >= sk.mpCost
                );
                if (usable.length) {
                    skillId = usable[Math.floor(Math.random() * usable.length)].id;
                }
            }
        }

        // --- Priority 5: Physical attack (or defend ~15% / enter stance ~10%) ---
        if (!skillId && !limitId && !commandId) {
            const roll = Math.random();
            if (roll < 0.10 && !ai._stance) {
                // Enter POWER stance occasionally for variety
                const stanceCmds = (available.commands || []).filter(cmd =>
                    cmd.name === 'Power Stance' || cmd.name === 'Guard Stance'
                );
                if (stanceCmds.length) commandId = stanceCmds[0].id;
            }
            if (!commandId) commandId = roll < 0.15 ? 2 : 1; // 2=Defend, 1=Attack
        }

        const result = await executeBattleAction(db, battle, ai, player, { commandId, skillId, limitId });
        await broadcastBattleUpdate(io, battle, result, db);

        if (battle.status !== 'ACTIVE') {
            await endBattle(db, io, battle);
            return;
        }

        await processStatusEffects(db, battle);
        checkDeaths(battle);
        if (battle.status !== 'ACTIVE') {
            await broadcastBattleUpdate(io, battle, { text: 'Battle Over!' }, db);
            await endBattle(db, io, battle);
            return;
        }

        battle.nextTurn();
        await broadcastBattleUpdate(io, battle, null, db);
    },

    // Expose for server.js
    activeBattles,
    getEffectiveStats
};

// =================================================================
// EXECUTE BATTLE ACTION — The core resolver
// =================================================================
async function executeBattleAction(db, battle, actor, target, { commandId, skillId, itemId, limitId }) {
    const result = { actor: actor.name, actions: [], log: [] };

    // Check actor status effects that prevent / impair action
    for (const s of actor.statuses) {
        const [sRows] = await db.query("SELECT * FROM game_statuses WHERE id=?", [s.id]);
        if (!sRows.length) continue;
        const fx = jp(sRows[0].effects, {});

        // Stun / Sleep — guaranteed skip
        if (fx.skip_turn) {
            const logText = (fx.log || '{name} cannot act!').replace('{name}', actor.name);
            result.log.push(logText);
            battle.addLog({ actor: actor.name, action: 'STUNNED', text: logText });
            return result;
        }

        // Paralyze — skip_chance % to lose turn
        if (fx.skip_chance && Math.random() * 100 < fx.skip_chance) {
            const logText = (fx.log || '{name} is paralysed and cannot move!').replace('{name}', actor.name);
            result.log.push(logText);
            battle.addLog({ actor: actor.name, action: 'PARALYSED', text: logText });
            return result;
        }

        // Blind — miss_chance % on physical damage commands (not skills/items)
        if (fx.miss_chance) {
            actor._missChance = (actor._missChance || 0) + fx.miss_chance;
        }
    }

    // --- STANCE COMMAND ---
    // Stances store a persistent mode on the combatant object (_stance field).
    // They re-use the normal command path — any game_battle_command whose effects
    // JSON contains { "stance": "POWER" } is treated as a stance toggle.
    if (commandId) {
        const [cmdRows] = await db.query('SELECT * FROM game_battle_commands WHERE id=?', [commandId]);
        if (cmdRows.length) {
            const fx = jp(cmdRows[0].effects || '{}', {});
            if (fx.stance) {
                const newStance = fx.stance;
                if (actor._stance === newStance) {
                    actor._stance = null;
                    result.log.push(`${actor.name} drops their stance.`);
                } else {
                    actor._stance = newStance;
                    const msgs = {
                        POWER: `⚔️ ${actor.name} enters Power Stance! ATK x1.4 this round.`,
                        GUARD: `🛡️ ${actor.name} enters Guard Stance! Incoming damage halved.`,
                        MAGIC: `✨ ${actor.name} enters Magic Stance! MO x1.4 & MP costs reduced.`
                    };
                    result.log.push(msgs[newStance] || `${actor.name} takes a new stance.`);
                }
                result.actions.push({ type: 'stance', stance: actor._stance, actor: actor.name });
                return result;
            }
        }
    }

    // --- SKILL (with charge + combo checks) ---
    if (skillId) {
        // Check if this skill requires a charge-up turn
        const [skPreRows] = await db.query('SELECT effects, name FROM game_skills WHERE id=?', [skillId]);
        if (skPreRows.length) {
            const fxPre = jp(skPreRows[0].effects, {});
            // Only initiate charge if NOT already firing from _charging auto-fire path
            if (fxPre.charge_turns && !actor._chargingFire) {
                actor._charging = {
                    skillId,
                    turnsLeft:  fxPre.charge_turns - 1,
                    skillName:  skPreRows[0].name
                };
                const chargeMsg = (fxPre.charge_message || '{name} begins charging {skill}!')
                    .replace('{name}', actor.name)
                    .replace('{skill}', actor._charging.skillName);
                result.log.push(`⚡ ${chargeMsg}`);
                result.actions.push({ type: 'charge_start', actor: actor.name, skill: actor._charging.skillName });
                return result;
            }
        }
        return await resolveSkill(db, battle, actor, target, skillId, result);
    }

    // --- ITEM ---
    if (itemId) {
        return await resolveItem(db, battle, actor, target, itemId, result);
    }
    // --- LIMIT BREAK ---
    if (limitId) {
        return await resolveLimitBreak(db, battle, actor, target, limitId, result);
    }


    // --- COMMAND ---
    const [cmdRows] = await db.query("SELECT * FROM game_battle_commands WHERE id=?", [commandId || 1]);
    if (!cmdRows.length) {
        result.log.push(`${actor.name} hesitates...`);
        return result;
    }

    const cmd = cmdRows[0];
    const effects = jp(cmd.effects, {});

    // OPEN MENU commands (Skills, Items) — client handles these, shouldn't reach here
    if (effects.open_menu) {
        result.log.push(`${actor.name} opens ${effects.open_menu} menu.`);
        return result;
    }

    // FLEE
    if (effects.flee) {
        return resolveFlee(battle, actor, target, effects.flee, result);
    }

    // DEFEND
    if (effects.set_status) {
        return resolveSetStatus(db, battle, actor, target, effects, cmd.name, result);
    }

    // ATTACK (damage command)
    if (effects.damage) {
        return await resolveDamage(db, battle, actor, target, effects, cmd.name, result);
    }

    result.log.push(`${actor.name} does nothing.`);
    return result;
}

// --- RESOLVE DAMAGE ---
async function resolveDamage(db, battle, actor, target, effects, actionName, result) {
    const dmgDef = effects.damage;

    // Range check for basic Attack (default melee range=1 when grid is active)
    if (target && actor.gridX !== undefined && target.gridX !== undefined) {
        const range = effects.range !== undefined ? effects.range : 1;
        if (range !== 99 && !battle.isInRange(actor.charId, target.charId, range)) {
            const dist = BattleState.chebyshev(actor, target);
            result.log.push(`⚠️ ${target.name} is out of reach (dist ${dist}, need ≤${range}). Move closer first.`);
            return result;
        }
    }

    const vars = buildFormulaVars(actor, target);

    // Calculate base damage
    let damage = Math.floor(safeEval(dmgDef.formula || 'ATK*2-DEF', vars));

    // Randomize
    if (dmgDef.randomize) {
        const rand = 1 + (Math.random() * 2 - 1) * dmgDef.randomize;
        damage = Math.floor(damage * rand);
    }

    // Critical hit check (luck-based)
    let crit = false;
    if (Math.random() * 100 < (actor.luck || 5)) {
        damage = Math.floor(damage * 1.5);
        crit = true;
    }

    // ── Terrain & Flanking modifiers ─────────────────────────────
    // TEACHING: We get the terrain mods object from BattleState.
    // It looks at both combatants' tile types and whether the attacker
    // is flanking. We apply them here so every damage path (basic attack,
    // skills, AoE hits) all benefit from terrain automatically.
    if (target && battle) {
        const tmods = battle.getTerrainModifiers(actor.charId, target.charId);

        // Range bonus from high ground
        if (tmods.rangeBonus && effects.range !== undefined && effects.range !== 99) {
            effects = { ...effects, range: effects.range + tmods.rangeBonus };
        }

        // Flanking: extra crit chance
        if (tmods.flanking && !crit) {
            if (Math.random() * 100 < tmods.critBonus) {
                damage = Math.floor(damage * 1.5);
                crit = true;
            }
        }

        // Damage bonus (high ground, prone melee)
        if (tmods.damageBonus !== 1.0) {
            damage = Math.floor(damage * tmods.damageBonus);
        }

        // Cover / forest damage reduction applied to final damage
        if (tmods.coverReduction > 0) {
            damage = Math.floor(damage * (1 - tmods.coverReduction / 100));
        }

        // Log terrain notes
        for (const note of (tmods.terrainNotes || [])) {
            result.log.push(note);
        }
    }

    // Blind / miss chance check
    if (actor._missChance && Math.random() * 100 < actor._missChance) {
        actor._missChance = 0;
        result.log.push(`${actor.name}'s attack misses!`);
        result.actions.push({ type: 'miss', target: target.name });
        return result;
    }
    actor._missChance = 0;

    // Element processing
    let elements = [];
    if (effects.apply_weapon_elements && actor.weaponElements.length) {
        elements = [...actor.weaponElements];
    }
    if (effects.elements) {
        elements = [...elements, ...effects.elements];
    }

    // --- ELEMENT SYSTEM ---
    // TEACHING: Elements work in two layers:
    //
    //   1. RESISTANCE: The attacker's element is in the target's WEAKNESS list
    //      → 50% bonus damage ("Super Effective")
    //   2. IMMUNITY: The attacker's element is in the target's STRENGTH list
    //      → damage halved ("Not very effective")
    //   3. No match → normal damage
    //
    // Target weaknesses/strengths come from their equipped items (elements JSON
    // with role='defense') and their race (future: game_races.element_affinities).
    //
    // We load all element rows once, then do set math in JavaScript — no N+1 queries.
    if (elements.length > 0) {
        const [allElems] = await db.query("SELECT * FROM game_elements");
        const elemMap = {};
        for (const e of allElems) elemMap[e.name.toLowerCase()] = e;

        // Build target's defensive element set from equipment
        const [targetEquip] = await db.query(`
            SELECT gi.elements FROM character_equipment ce
            JOIN game_items gi ON ce.item_id = gi.id
            WHERE ce.character_id = ?`, [target.charId]);

        // NEW: Use target's pre-loaded elemDefenses [{elem, role, pct}]
        // roles: weak(+%), resist(-%), nullify(0), absorb(heal)
        let absorbed = false;
        let finalMultiplier = 1.0;
        let elemLog = null;

        for (const elemName of elements) {
            const en = elemName.toLowerCase();
            // Check explicit defense entries first
            const defense = target.elemDefenses.find(d => d.elem === en);
            if (defense) {
                switch (defense.role) {
                    case 'absorb':
                        // Heal target instead of damaging
                        absorbed = true;
                        target.currentHp = Math.min(target.maxHp, target.currentHp + damage);
                        elemLog = `✨ ${target.name} absorbs the ${elemName} and recovers ${damage} HP!`;
                        break;
                    case 'nullify':
                        finalMultiplier = 0;
                        elemLog = `🛡️ ${target.name} nullifies the ${elemName}!`;
                        break;
                    case 'resist': {
                        const pct = defense.pct !== undefined ? defense.pct : 50;
                        const mult = 1 - (pct / 100);
                        if (mult < finalMultiplier) {
                            finalMultiplier = mult;
                            elemLog = `💧 ${target.name} resists ${elemName}! (-${pct}%)`;
                        }
                        break;
                    }
                    case 'weak': {
                        const pct = defense.pct !== undefined ? defense.pct : 50;
                        const mult = 1 + (pct / 100);
                        if (mult > finalMultiplier) {
                            finalMultiplier = mult;
                            elemLog = `🔥 ${target.name} is weak to ${elemName}! (+${pct}%)`;
                        }
                        break;
                    }
                }
            } else {
                // Fallback: check element strengths/weaknesses table
                const elem = elemMap[en];
                if (!elem) continue;
                const strengths  = jp(elem.strengths_json,  []).map(n => String(n).toLowerCase());
                const weaknesses = jp(elem.weaknesses_json, []).map(n => String(n).toLowerCase());
                const targetElems = target.elemDefenses.map(d => d.elem);
                const isWeak    = targetElems.some(te => strengths.includes(te)) || weaknesses.some(we => targetElems.includes(we));
                const isResist  = targetElems.some(te => weaknesses.includes(te));
                if (isWeak && !isResist) {
                    if (1.5 > finalMultiplier) { finalMultiplier = 1.5; elemLog = `🔥 Super effective! (+50%)`; }
                } else if (isResist && !isWeak) {
                    if (0.5 < finalMultiplier) { finalMultiplier = 0.5; elemLog = `💧 Not very effective... (-50%)`; }
                }
            }
        }

        if (!absorbed) {
            if (finalMultiplier === 0) {
                damage = 0;
            } else {
                damage = Math.floor(damage * finalMultiplier);
            }
            if (elemLog) result.log.push(elemLog);
        } else {
            // absorbed — skip normal damage application below
            result.log.push(elemLog);
            result.actions.push({ type: 'absorb', target: target.name, amount: damage, elements });
            return result;
        }
    }

    // POWER STANCE: physical attacker deals 1.4x damage
    if (actor._stance === 'POWER') {
        damage = Math.floor(damage * 1.4);
    }

    // GUARD STANCE on target: halves all incoming damage
    if (target._stance === 'GUARD') {
        damage = Math.floor(damage * 0.5);
        // Guard stance also fills limit faster
        target.limitbreak = Math.min(100, target.limitbreak + (damage / target.maxHp) * 100 * 0.25);
    }

    // Defending status halves damage (stacks with guard stance)
    const defendingStatus = target.statuses.find(s => s.id === 2 || s.name === 'Defending');
    if (defendingStatus) {
        damage = Math.floor(damage * 0.5);
    }

    // Minimum 1 damage
    damage = Math.max(1, damage);

    // Apply damage
    target.currentHp = Math.max(0, target.currentHp - damage);

    // Log
    const logText = (effects.log || `{name} attacks!`).replace('{name}', actor.name);
    result.log.push(logText);
    result.log.push(`${crit ? '💥 CRITICAL! ' : ''}${target.name} takes ${damage} damage!`);
    result.actions.push({ type: 'damage', target: target.name, amount: damage, crit, elements });

    battle.addLog({ actor: actor.name, action: actionName, damage, crit, target: target.name });

    // Weapon status effects (chance to inflict)
    if (effects.apply_weapon_status && Object.keys(actor.weaponStatuses).length) {
        for (const [statusName, duration] of Object.entries(actor.weaponStatuses)) {
            if (Math.random() < 0.25) { // 25% chance
                await applyStatus(db, target, statusName, duration, result);
            }
        }
    }

    // Skill-based status effects
    if (effects.set_status) {
        await resolveStatusFromEffect(db, battle, actor, target, effects.set_status, result);
    }

    // Ogham on-hit statuses (+ curse on wielder if defined)
    if (actor.oghamStatuses && Object.keys(actor.oghamStatuses).length) {
        for (const [statusName, oghamData] of Object.entries(actor.oghamStatuses)) {
            // Handle both old format (number) and new format ({chance, curse})
            const chance = typeof oghamData === 'number' ? oghamData : (oghamData.chance || 20);
            const curse  = typeof oghamData === 'object' ? oghamData.curse : null;
            if (Math.random() * 100 < chance) {
                await applyStatus(db, target, statusName, null, result);
                // Cursed Ogham — also afflicts the wielder
                if (curse && Math.random() * 100 < (curse.chance || 100)) {
                    await applyStatus(db, actor, curse.status, curse.turns || 1, result);
                    const curseLog = (curse.log || `{name} is afflicted by the curse of their own Ogham!`)
                        .replace('{name}', actor.name);
                    result.log.push(`🔴 ${curseLog}`);
                }
            }
        }
    }

    // breaks_on_hit: remove sleep/fragile statuses from target when hit
    const toBreak = [];
    for (let i = 0; i < target.statuses.length; i++) {
        const [bRows] = await db.query("SELECT effects FROM game_statuses WHERE id=?", [target.statuses[i].id]);
        if (bRows.length) {
            const bfx = jp(bRows[0].effects, {});
            if (bfx.breaks_on_hit) toBreak.push(i);
        }
    }
    if (toBreak.length) {
        target.statuses = target.statuses.filter((_, i) => !toBreak.includes(i));
        result.log.push(`${target.name} snaps awake!`);
    }

    // Reactions — target may counter-attack
    await checkReactions(db, battle, target, actor, result, { crit });

    // Limit break fill (defender gains limit from taking damage)
    const fillRate = (damage / target.maxHp) * 100 * 0.5; // Taking damage fills bar
    target.limitbreak = Math.min(100, target.limitbreak + fillRate);

    // Check death
    if (target.currentHp <= 0) {
        battle.status = 'FINISHED';
        battle.winner = actor.charId;
        result.log.push(`${target.name} has been defeated!`);
    }

    return result;
}

// --- RESOLVE SKILL ---
// Teaching: This is the busiest function in the engine. It handles:
//   • Stance multipliers (POWER = physical ×1.4, MAGIC = magic ×1.4)
//   • Combo bonuses (if opponent has required status, deal more damage / extra hit)
//   • Multi-hit (fire damage loop N times, each hit can proc on-hit effects)
//   • Charge check (handled upstream in executeBattleAction)
//   • Normal offensive / healing / status / cure flows
async function resolveSkill(db, battle, actor, target, skillId, result) {
    const [skillRows] = await db.query("SELECT * FROM game_skills WHERE id=?", [skillId]);
    if (!skillRows.length) {
        result.log.push(`${actor.name} tries to cast... nothing.`);
        return result;
    }
    const skill   = skillRows[0];
    const effects = jp(skill.effects, {});

    // Class-specific MP cost (with MAGIC stance discount applied)
    const [csRows] = await db.query("SELECT * FROM game_class_skills WHERE class_id=? AND skill_id=?",
        [actor.classId, skillId]);
    let mpCost = csRows.length ? csRows[0].mp_cost : 0;
    if (actor._stance === 'MAGIC') mpCost = Math.floor(mpCost * 0.7);

    if (actor.currentMp < mpCost) {
        result.log.push(`${actor.name} doesn't have enough MP! (Need ${mpCost})`);
        return result;
    }
    actor.currentMp -= mpCost;

    // Battle announce text
    const displayName = (csRows.length && csRows[0].alt_name) ? csRows[0].alt_name : skill.name;

    // ── Range check ─────────────────────────────────────────────────────
    // Only fires when both combatants have grid positions.
    // AoE (ALL_ENEMIES) and SELF skills skip range — they work regardless.
    if (target && effects.range !== undefined && effects.range !== 99
        && skill.target_type !== 'ALL_ENEMIES' && skill.target_type !== 'SELF') {
        if (!battle.isInRange(actor.charId, target.charId, effects.range)) {
            const dist = actor.gridX !== undefined && target.gridX !== undefined
                ? BattleState.chebyshev(actor, target) : '?';
            result.log.push(`⚠️ ${target.name} is out of range! (dist ${dist}, need ≤${effects.range}). Move closer.`);
            return result;
        }
    }

    const battleText  = (skill.battle_text || '{name} uses {skill}!')
        .replace('{name}', actor.name).replace('{skill}', displayName);
    result.log.push(battleText);

    // ── COMBO CHECK ─────────────────────────────────────────────────────
    // combo_requires: { status: "Blind", message: "Blindside!" }
    // combo_bonus:    { damage_mult: 2.0, extra_hits: 1 }
    let comboActive = false;
    let comboDamageMult = 1.0;
    let comboExtraHits  = 0;
    if (effects.combo_requires) {
        const reqStatus  = (effects.combo_requires.status || '').toLowerCase();
        const hasStatus  = target.statuses.some(s => s.name.toLowerCase() === reqStatus);
        if (hasStatus) {
            comboActive = true;
            const bonus = effects.combo_bonus || {};
            comboDamageMult = bonus.damage_mult || 1.5;
            comboExtraHits  = bonus.extra_hits  || 0;
            const comboMsg  = effects.combo_requires.message || `💥 COMBO: ${displayName}!`;
            result.log.push(`🔥 ${comboMsg}`);
            result.actions.push({ type: 'combo', skill: displayName, target: target.name });
        }
    }

    const vars     = buildFormulaVars(actor, target);
    const skillElems = jp(skill.elements, []);

    // ── AoE: radius-based (BG3 style) or flat ALL_ENEMIES ───────────────
    if (effects.damage && (skill.target_type === 'ALL_ENEMIES' || effects.aoe_radius)) {
        let targets;
        if (effects.aoe_radius && target && target.gridX !== undefined) {
            // Radius-based: hit all enemies within N tiles of the chosen target tile
            const allEnemies = battle.getEnemyTeam(actor.charId);
            targets = allEnemies.filter(e =>
                BattleState.chebyshev(e, target) <= effects.aoe_radius
            );
            result.log.push(`💥 ${displayName} — AoE radius ${effects.aoe_radius} around ${target.name}!`);
        } else {
            // Flat ALL_ENEMIES: hit everything
            targets = battle.getEnemyTeam(actor.charId);
            result.log.push(`💥 ${displayName} — strikes all enemies!`);
        }
        if (!targets.length) { result.log.push('No enemies left!'); return result; }
        result.log.push(`💥 ${displayName} — strikes all enemies!`);
        let grandTotal = 0;
        for (const aoeTarget of targets) {
            let dmg = Math.floor(safeEval(effects.damage.formula || 'MO*2-MD',
                buildFormulaVars(actor, aoeTarget)));
            if (effects.damage.randomize)
                dmg = Math.floor(dmg * (1 + (Math.random()*2-1)*effects.damage.randomize));
            if (actor._stance === 'POWER' && effects.damage.type !== 'magic') dmg = Math.floor(dmg * 1.4);
            if (actor._stance === 'MAGIC' && effects.damage.type === 'magic')  dmg = Math.floor(dmg * 1.4);
            if (comboActive) dmg = Math.floor(dmg * comboDamageMult);
            if (aoeTarget._stance === 'GUARD') dmg = Math.floor(dmg * 0.5);
            if (effects.aoe_split) dmg = Math.floor(dmg / Math.max(1, targets.length));
            dmg = Math.max(1, dmg);
            aoeTarget.currentHp = Math.max(0, aoeTarget.currentHp - dmg);
            grandTotal += dmg;
            result.log.push(`  → ${aoeTarget.name} takes ${dmg} damage!`);
            result.actions.push({ type: 'aoe_hit', target: aoeTarget.name, amount: dmg });
            aoeTarget.limitbreak = Math.min(100, aoeTarget.limitbreak + (dmg / aoeTarget.maxHp) * 50);
            await checkReactions(db, battle, aoeTarget, actor, result);
        }
        battle.addLog({ actor: actor.name, action: displayName, aoe: true, total: grandTotal });
        if (effects.set_status) {
            for (const aoeTarget of targets)
                await resolveStatusFromEffect(db, battle, actor, aoeTarget, effects.set_status, result);
        }
        battle.checkWinCondition();
        if (battle.status !== 'ACTIVE') result.log.push(`The battle is over!`);
        return result;
    }

    // ── OFFENSIVE ───────────────────────────────────────────────────────
    if (effects.damage) {
        // Number of hits: base hits * (combo extra hits if active)
        const baseHits = effects.hits || 1;
        const totalHits = baseHits + (comboActive ? comboExtraHits : 0);

        // Preload elements once
        let allElems = [];
        if (skillElems.length) {
            [allElems] = await db.query("SELECT * FROM game_elements");
        }

        let totalDamage = 0;
        for (let hit = 0; hit < totalHits; hit++) {
            let damage = Math.floor(safeEval(effects.damage.formula || 'MO*2-MD', vars));

            if (effects.damage.randomize) {
                damage = Math.floor(damage * (1 + (Math.random() * 2 - 1) * effects.damage.randomize));
            }

            // Stance multipliers
            if (actor._stance === 'POWER' && (effects.damage.type !== 'magic')) {
                damage = Math.floor(damage * 1.4);
            }
            if (actor._stance === 'MAGIC' && effects.damage.type === 'magic') {
                damage = Math.floor(damage * 1.4);
            }

            // Combo damage multiplier
            if (comboActive) damage = Math.floor(damage * comboDamageMult);

            // Multi-hit: each hit does 1/totalHits of normal (so total is roughly same)
            // But extra combo hits deal half per hit (bonus not penalty)
            if (baseHits > 1) damage = Math.floor(damage / baseHits);
            else if (hit >= baseHits) damage = Math.floor(damage * 0.5); // extra combo hits

            // Element bonuses
            for (const en of skillElems) {
                const elem = allElems.find(e => e.name.toLowerCase() === en.toLowerCase());
                if (elem) damage = Math.floor(damage * (1 + (elem.bonus_damage_pct || 0) / 100));
            }

            // Target GUARD stance halves incoming skill damage
            if (target._stance === 'GUARD') damage = Math.floor(damage * 0.5);

            damage = Math.max(1, damage);
            target.currentHp = Math.max(0, target.currentHp - damage);
            totalDamage += damage;

            // Hit log (show each hit for multi-hit)
            if (totalHits > 1) {
                result.log.push(`Hit ${hit + 1}: ${target.name} takes ${damage} damage!`);
            } else {
                result.log.push(`${target.name} takes ${damage} damage!`);
            }

            result.actions.push({ type: 'skill_damage', skill: displayName, target: target.name,
                                   amount: damage, elements: skillElems, hit: hit + 1, totalHits });

            // On-hit Ogham statuses proc per hit
            if (actor.oghamStatuses && Object.keys(actor.oghamStatuses).length) {
                for (const [statusName, oghamData] of Object.entries(actor.oghamStatuses)) {
                    const chance = typeof oghamData === 'number' ? oghamData : (oghamData.chance || 20);
                    if (Math.random() * 100 < chance) {
                        await applyStatus(db, target, statusName, null, result);
                    }
                }
            }

            // Early exit if target dies mid-combo
            if (target.currentHp <= 0) break;
        }

        battle.addLog({ actor: actor.name, action: displayName, damage: totalDamage,
                        hits: totalHits, combo: comboActive, target: target.name });

        // Reactions — target may counter-attack after taking skill damage
        if (target.currentHp > 0) {
            await checkReactions(db, battle, target, actor, result);
        }

        // Limit fill for defender (based on total combo damage)
        target.limitbreak = Math.min(100, target.limitbreak + (totalDamage / target.maxHp) * 100 * 0.5);
        // GUARD stance also fills limit faster when taking damage
        if (target._stance === 'GUARD') {
            target.limitbreak = Math.min(100, target.limitbreak + (totalDamage / target.maxHp) * 100 * 0.25);
        }
    }

    // ── HEALING ─────────────────────────────────────────────────────────
    if (effects.heal) {
        let heal = Math.floor(safeEval(effects.heal.formula || 'MO*3+50', vars));
        if (actor._stance === 'MAGIC') heal = Math.floor(heal * 1.4); // MAGIC stance boosts heals too
        const healTarget = (skill.target_type === 'SELF' || skill.target_type === 'ALLY') ? actor : target;
        healTarget.currentHp = Math.min(healTarget.maxHp, healTarget.currentHp + heal);
        result.log.push(`${healTarget.name} recovers ${heal} HP!`);
        result.actions.push({ type: 'heal', target: healTarget.name, amount: heal });
    }

    // ── STATUS EFFECTS ───────────────────────────────────────────────────
    if (effects.set_status) {
        await resolveStatusFromEffect(db, battle, actor, target, effects.set_status, result);
    }

    // ── CURE STATUSES ────────────────────────────────────────────────────
    const healStatus = jp(skill.heal_status, []);
    if (healStatus.length) {
        const cureTarget = skill.target_type === 'SELF' ? actor : target;
        cureTarget.statuses = cureTarget.statuses.filter(s => !healStatus.includes(s.id));
        result.log.push(`${cureTarget.name}'s status ailments are cured!`);
    }

    // ── DEATH CHECK ──────────────────────────────────────────────────────
    if (target.currentHp <= 0) {
        battle.status = 'FINISHED';
        battle.winner = actor.charId;
        result.log.push(`${target.name} has been defeated!`);
    }

    return result;
}

// --- RESOLVE ITEM ---
async function resolveItem(db, battle, actor, target, itemId, result) {
    // Check inventory
    const [inv] = await db.query("SELECT * FROM character_items WHERE character_id=? AND item_id=?",
        [actor.charId, itemId]);
    if (!inv.length || inv[0].quantity < 1) {
        result.log.push(`${actor.name} doesn't have that item!`);
        return result;
    }

    // Get item data
    const [itemRows] = await db.query("SELECT * FROM game_items WHERE id=?", [itemId]);
    if (!itemRows.length || itemRows[0].type !== 'CONSUMABLE') {
        result.log.push(`${actor.name} can't use that in battle!`);
        return result;
    }

    const item = itemRows[0];
    const effects = jp(item.effects, {});

    result.log.push(`${actor.name} uses ${item.icon || '🧪'} ${item.name}!`);

    // Heal HP
    if (effects.heal_hp) {
        const vars = buildFormulaVars(actor, target);
        const heal = Math.floor(safeEval(effects.heal_hp.formula || '50', vars));
        actor.currentHp = Math.min(actor.maxHp, actor.currentHp + heal);
        result.log.push(`${actor.name} recovers ${heal} HP!`);
        result.actions.push({ type: 'heal', target: actor.name, amount: heal });
    }

    // Heal MP
    if (effects.heal_mp) {
        const vars = buildFormulaVars(actor, target);
        const heal = Math.floor(safeEval(effects.heal_mp.formula || '30', vars));
        actor.currentMp = Math.min(actor.maxMp, actor.currentMp + heal);
        result.log.push(`${actor.name} recovers ${heal} MP!`);
    }

    // Cure statuses
    if (effects.cure_status) {
        const toCure = Array.isArray(effects.cure_status) ? effects.cure_status : [effects.cure_status];
        actor.statuses = actor.statuses.filter(s => !toCure.includes(s.id));
        result.log.push(`Status cured!`);
    }

    // Consume the item
    if (inv[0].quantity > 1) {
        await db.query("UPDATE character_items SET quantity=quantity-1 WHERE id=?", [inv[0].id]);
    } else {
        await db.query("DELETE FROM character_items WHERE id=?", [inv[0].id]);
    }

    return result;
}

// --- RESOLVE LIMIT BREAK ---
async function resolveLimitBreak(db, battle, actor, target, limitId, result) {
    // Get limit data
    const [limRows] = await queryLimitBreakRow(db, limitId, actor.classId);
    if (!limRows.length) {
        result.log.push(`${actor.name} can't use that limit break!`);
        return result;
    }

    const limit = limRows[0];

    // Check bar is full and break level matches
    if (actor.limitbreak < 100) {
        result.log.push(`Limit break bar not full!`);
        return result;
    }
    if (limit.break_level > actor.breaklevel) {
        result.log.push(`Limit break level too low!`);
        return result;
    }
    if (limit.char_level_req > actor.level) {
        result.log.push(`Character level too low for this limit!`);
        return result;
    }

    // Consume limit bar
    actor.limitbreak = 0;

    const effects = jp(limit.effects, {});
    const vars = buildFormulaVars(actor, target);

    const logText = (effects.log || `{name} unleashes ${limit.name}!`).replace('{name}', actor.name);
    result.log.push(`💥 LIMIT BREAK: ${logText}`);
    result.actions.push({ type: 'limit_break', name: limit.name, icon: limit.icon });

    // Damage
    if (effects.damage) {
        let damage = Math.floor(safeEval(effects.damage.formula || 'ATK*4', vars));
        if (effects.damage.randomize) {
            damage = Math.floor(damage * (1 + (Math.random() * 2 - 1) * effects.damage.randomize));
        }
        // Apply stance multipliers to limit breaks too
        if (actor._stance === 'POWER' && effects.damage.type !== 'magic') damage = Math.floor(damage * 1.4);
        if (actor._stance === 'MAGIC' && effects.damage.type === 'magic')  damage = Math.floor(damage * 1.4);
        if (target._stance === 'GUARD') damage = Math.floor(damage * 0.5);
        damage = Math.max(1, damage);

        target.currentHp = Math.max(0, target.currentHp - damage);
        result.log.push(`${target.name} takes ${damage} damage!`);
        result.actions.push({ type: 'limit_damage', target: target.name, amount: damage });
    }

    // Heal
    if (effects.heal) {
        const heal = Math.floor(safeEval(effects.heal.formula || 'MAXHP*0.3', vars));
        actor.currentHp = Math.min(actor.maxHp, actor.currentHp + heal);
        result.log.push(`${actor.name} recovers ${heal} HP!`);
    }

    // Status
    if (effects.set_status) {
        await resolveStatusFromEffect(db, battle, actor, target, effects.set_status, result);
    }

    // Check death
    if (target.currentHp <= 0) {
        battle.status = 'FINISHED';
        battle.winner = actor.charId;
        result.log.push(`${target.name} has been defeated!`);
    }

    return result;
}

// --- RESOLVE FLEE ---
function resolveFlee(battle, actor, target, fleeDef, result) {
    // TEACHING: You can never flee a PvP battle — that would let a losing player
    // deny the winner their reward. Fleeing is only for PvE encounters.
    if (battle.type === 'PVP') {
        result.log.push(`${actor.name} cannot flee a PvP battle!`);
        return result;
    }

    const vars = buildFormulaVars(actor, target);
    const check = safeEval(fleeDef.formula || 'SPEED+LUCK*0.5-ENEMY_SPEED', vars);

    if (check > 0 || Math.random() < 0.3) { // Speed advantage or 30% base chance
        battle.status = 'FLED';
        battle.winner = null; // No winner on flee
        const logText = (fleeDef.log_success || '{name} escapes!').replace('{name}', actor.name);
        result.log.push(logText);
    } else {
        const logText = (fleeDef.log_fail || "{name} couldn't escape!").replace('{name}', actor.name);
        result.log.push(logText);
    }
    return result;
}

// --- RESOLVE SET STATUS (from commands like Defend) ---
async function resolveSetStatus(db, battle, actor, target, effects, actionName, result) {
    const logText = (effects.log || `{name} uses ${actionName}!`).replace('{name}', actor.name);
    result.log.push(logText);

    if (effects.set_status) {
        await resolveStatusFromEffect(db, battle, actor, target, effects.set_status, result);
    }
    return result;
}

// --- APPLY STATUS FROM EFFECT JSON ---
async function resolveStatusFromEffect(db, battle, actor, target, statusEffect, result) {
    const setTarget = statusEffect.target === 'self' ? actor : target;
    const chance = statusEffect.chance || 100;
    const statuses = statusEffect.statuses || {};

    for (const [statusName, duration] of Object.entries(statuses)) {
        // Chance check
        if (Math.random() * 100 > chance) continue;

        // Check if armor blocks this status
        if (setTarget.armorBlockStatuses.length) {
            const [sRow] = await db.query("SELECT id FROM game_statuses WHERE name=?", [statusName]);
            if (sRow.length && setTarget.armorBlockStatuses.includes(sRow[0].id)) {
                result.log.push(`${setTarget.name}'s armor blocks ${statusName}!`);
                continue;
            }
        }

        await applyStatus(db, setTarget, statusName, duration, result);
    }
}

// --- APPLY A SINGLE STATUS ---
async function applyStatus(db, target, statusName, duration, result) {
    // Look up by name (case insensitive)
    const [sRows] = await db.query("SELECT * FROM game_statuses WHERE LOWER(name)=LOWER(?)", [statusName]);
    if (!sRows.length) return;

    const status = sRows[0];

    // Check if already has this status
    const existing = target.statuses.findIndex(s => s.id === status.id);
    if (existing >= 0) {
        // Refresh duration
        target.statuses[existing].turns = duration || status.default_duration;
    } else {
        target.statuses.push({
            id: status.id,
            name: status.name,
            icon: status.icon,
            turns: duration || status.default_duration
        });
        result.log.push(`${target.name} is afflicted with ${status.icon} ${status.name}!`);
    }
}

// =================================================================
// REACTIONS — passive on-hit skill triggers
// =================================================================
// TEACHING: Reactions let defenders "fire back" automatically.
// A skill marked as a reaction has  effects.reaction.trigger = "on_hit"
// (or "on_crit"). After damage lands, we roll each reaction.
// Reactions call resolveSkill in reverse: the VICTIM is the actor.
//
// Example skill effects JSON that creates a reaction:
//   {
//     "reaction": { "trigger": "on_hit", "chance": 30 },
//     "damage": { "formula": "ATK*1.5", "type": "physical" },
//     "log": "{name} counter-attacks!"
//   }
//
// crit = boolean, was this a critical hit (for "on_crit" reactions)
async function checkReactions(db, battle, victim, attacker, result, { crit = false } = {}) {
    if (!victim.reactions || !victim.reactions.length) return;
    if (victim.currentHp <= 0) return; // dead, can't react

    for (const reaction of victim.reactions) {
        // Check trigger condition
        if (reaction.trigger === 'on_crit' && !crit) continue;
        if (reaction.trigger === 'on_kill') continue; // on_kill is checked elsewhere

        // Roll chance
        if (Math.random() * 100 >= reaction.chance) continue;

        result.log.push(`↩️ ${reaction.icon} ${victim.name}'s ${reaction.name} triggers!`);
        result.actions.push({ type: 'reaction', name: reaction.name, icon: reaction.icon, actor: victim.name });

        // Fire the reaction skill (victim attacks attacker)
        // We clone result so sub-logs appear inline
        const subResult = { actor: victim.name, actions: [], log: [] };
        victim._chargingFire = true; // skip charge check for reactions
        await resolveSkill(db, battle, victim, attacker, reaction.skillId, subResult);
        victim._chargingFire = false;

        // Merge sub logs into main result
        result.log.push(...subResult.log);
        result.actions.push(...subResult.actions);

        // Only fire ONE reaction per hit (first that rolls in)
        break;
    }
}

// =================================================================
// STATUS EFFECTS — End-of-turn processing
// =================================================================
async function processStatusEffects(db, battle) {
    // TEACHING: Returns a tickResult so the caller can broadcast status
    // notifications as popups. Without this, Poison damage is silent.
    const tickResult = { actor: 'status', actions: [], log: [] };

    for (const charId of Object.keys(battle.combatants)) {
        const c = battle.combatants[charId];
        const toRemove = [];
        const sortedStatuses = [...c.statuses];

        for (let i = 0; i < sortedStatuses.length; i++) {
            const s = sortedStatuses[i];
            const [sRows] = await db.query("SELECT * FROM game_statuses WHERE id=?", [s.id]);
            if (!sRows.length) { toRemove.push(i); continue; }

            const effects = jp(sRows[0].effects, {});

            // Damage per turn (Poison, Burn)
            if (effects.damage_per_turn) {
                const vars = { MAXHP: c.maxHp, MO: c.mo, LVL: c.level, ATK: c.atk };
                const dmg = Math.max(1, Math.floor(safeEval(effects.damage_per_turn.formula || '10', vars)));
                c.currentHp = Math.max(0, c.currentHp - dmg);
                const logText = (effects.log || `{name} takes ${dmg} status damage!`).replace('{name}', c.name);
                battle.addLog({ actor: 'status', text: logText });
                tickResult.log.push(`${s.icon} ${logText}`);
                tickResult.actions.push({ type: 'status_damage', target: c.name, amount: dmg, status: s.name });
            }

            // Heal per turn (Regen)
            if (effects.heal_per_turn) {
                const vars = { MAXHP: c.maxHp, MO: c.mo, LVL: c.level, MLVL: c.level };
                const heal = Math.floor(safeEval(effects.heal_per_turn.formula || '20', vars));
                c.currentHp = Math.min(c.maxHp, c.currentHp + heal);
                const logText = (effects.log || `{name} regenerates.`).replace('{name}', c.name);
                battle.addLog({ actor: 'status', text: logText });
                tickResult.log.push(`${s.icon} ${logText}`);
                tickResult.actions.push({ type: 'status_heal', target: c.name, amount: heal, status: s.name });
            }

            // Decrement duration
            s.turns--;
            if (s.turns <= 0 && !sRows[0].permanent) {
                toRemove.push(i);
                const wearOff = `${s.icon} ${s.name} wears off ${c.name}.`;
                battle.addLog({ actor: 'status', text: wearOff });
                tickResult.log.push(wearOff);
            }
        }

        c.statuses = c.statuses.filter((_, i) => !toRemove.includes(i));

        // ── Burning terrain spread ─────────────────────────────────
        // TEACHING: If a combatant has the 'Burning' status and they're
        // standing on a non-water tile, their tile becomes a 'fire' terrain.
        // Adjacent living combatants on 'fire' terrain take 8 flat damage.
        // Water terrain extinguishes fire automatically.
        // This is "environmental hazard" gameplay — positioning matters!
        const isBurning = c.statuses.find(s => s.name === 'Burning');
        if (isBurning && c.currentHp > 0 && c.gridX !== undefined && battle.terrainMap) {
            const tileKey = `${c.gridX},${c.gridY}`;
            const currentTile = battle.terrainMap[tileKey] || 'open';

            // Water extinguishes
            if (currentTile === 'water') {
                // Remove Burning status
                c.statuses = c.statuses.filter(s => s.name !== 'Burning');
                battle.addLog({ actor: 'status', text: `💧 ${c.name}'s Burning is extinguished by water!` });
                tickResult.log.push(`💧 ${c.name}'s Burning doused by water!`);
            } else {
                // Set tile to fire
                battle.terrainMap[tileKey] = 'fire';
                // Tick fire damage to anyone on adjacent fire tiles
                const adjacents = Object.values(battle.combatants).filter(other =>
                    other.charId !== c.charId &&
                    other.currentHp > 0 &&
                    other.gridX !== undefined &&
                    BattleState.chebyshev(c, other) <= 1 &&
                    (battle.terrainMap[`${other.gridX},${other.gridY}`] === 'fire')
                );
                for (const burned of adjacents) {
                    const fireDmg = 8;
                    burned.currentHp = Math.max(0, burned.currentHp - fireDmg);
                    battle.addLog({ actor: 'status', text: `🔥 ${burned.name} is scorched by spreading fire! (${fireDmg} dmg)` });
                    tickResult.log.push(`🔥 ${burned.name} takes ${fireDmg} fire terrain dmg`);
                    tickResult.actions.push({ type: 'status_damage', target: burned.name, amount: fireDmg, status: 'Fire Terrain' });
                }
            }
        }
    }

    return tickResult; // caller uses this to broadcast popup notifications
}

function checkDeaths(battle) {
    // Delegate to the new team-aware win condition check
    battle.checkWinCondition();
}

// =================================================================
// END BATTLE — Save results, give rewards
// =================================================================
async function endBattle(db, io, battle) {
    // Update DB record
    await db.query("UPDATE game_battles SET status=?, winner_char_id=?, battle_log=? WHERE id=?",
        [battle.status, battle.winner, JSON.stringify(battle.log), battle.id]);

    // Sync HP/MP/Limit/Statuses back to characters table
    for (const [charId, c] of Object.entries(battle.combatants)) {
        await db.query(
            `UPDATE characters SET current_hp=?, current_mp=?, limitbreak=?, status_effects=? WHERE id=?`,
            [Math.max(0, c.currentHp), Math.max(0, c.currentMp), c.limitbreak,
             JSON.stringify(c.statuses), charId]
        );
    }

    // =========================================================
    // DEFEAT SCREEN — notify losing human players
    // =========================================================
    // TEACHING: We iterate every combatant. If they lost (hp=0, not winner)
    //   AND they're a real player (isAI === false), we emit 'battle_defeat'
    //   to their socket. This works for both PvP losers and PvE deaths.
    //   The client shows a gravestone screen with a Respawn button.
    if (battle.status === 'FINISHED') {
        try {
            const battleSockets = await io.in('battle_' + battle.id).fetchSockets();
            for (const [cid, combatant] of Object.entries(battle.combatants)) {
                const charId = parseInt(cid);
                if (combatant.isAI) continue;             // NPC — no screen needed
                if (charId === battle.winner) continue;   // They won — gets victory screen

                // This is a human who lost — find their socket and send defeat info
                const loserSocket = (battleSockets || []).find(s => s._battleCharId === charId);
                const defeatPayload = {
                    won:        false,
                    enemyName:  battle.combatants[battle.winner] ? battle.combatants[battle.winner].name : 'Unknown',
                    battleType: battle.type
                };
                if (loserSocket) loserSocket.emit('battle_defeat', defeatPayload);
            }
        } catch(defeatErr) { console.error('battle_defeat emit error (non-fatal):', defeatErr); }

    // Post-battle action chains (on_win / on_lose from BATTLE event type)
    // Tell each human socket whether they won so _run_post_battle picks the right branch
    try {
        const allBattleSockets = await io.in('battle_' + battle.id).fetchSockets();
        for (const bs of (allBattleSockets || [])) {
            if (bs._postBattleActions) {
                const bsWon = bs._battleCharId === battle.winner;
                bs.emit('_run_post_battle', { won: bsWon });
            }
        }
    } catch { /* non-fatal */ }
    }

    // =============================================================
    // LEGENDARY ARTIFACTS HOOK (OPTIONAL)
    // =============================================================
    // If you have routes/artifactRoutes.js with onPvpKill(), this makes
    // artifacts "come alive" automatically when a PvP kill happens.
    // It is wrapped in try/catch so missing modules never break battles.
    if (
        battle.type === 'PVP' &&
        battle.status === 'FINISHED' &&
        battle.winner &&
        artifactRoutes &&
        typeof artifactRoutes.onPvpKill === 'function'
    ) {
        const loserId = Object.keys(battle.combatants).map(Number)
            .find(id => id !== battle.winner);

        if (loserId) {
            try {
                // Pull a tiny bit of context (location) for logging / future features.
                const [posRows] = await db.query(
                    "SELECT id, map_id, x, y FROM characters WHERE id IN (?,?)",
                    [battle.winner, loserId]
                );
                const posById = {};
                for (const r of posRows) posById[r.id] = r;

                const hookRes = await artifactRoutes.onPvpKill(
                    battle.winner,
                    loserId,
                    {
                        location: {
                            mapId: posById[battle.winner]?.map_id ?? null,
                            x: posById[battle.winner]?.x ?? null,
                            y: posById[battle.winner]?.y ?? null
                        },
                        timestamp: Date.now(),
                        // Your PvP challenges are basically "duels" right now.
                        // Set to false so artifacts can transfer in normal PvP.
                        // If you later add a duel ladder, you can set this true there.
                        isDuel: false
                    }
                );

                // Optional broadcast: clients may listen for this to show global announcements.
                if (hookRes && hookRes.transferred && io && typeof io.emit === 'function') {
                    io.emit('artifact_transfer', hookRes);
                }
            } catch (e) {
                console.error('Artifact onPvpKill hook failed:', e);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // REWARDS — split across all surviving players (party-aware)
    // TEACHING: In 1v1 there's one winner. In party PvE, ALL surviving
    // players win together and share XP/gold equally. Each gets the
    // full per-fight XP from the level table divided by party size.
    // This keeps levelling fair regardless of party size.
    // ─────────────────────────────────────────────────────────────────
    if (battle.status === 'FINISHED' && battle.winner !== null) {

        // Determine who won — player team or enemy team
        const playersWon = battle.teams.players.includes(
            typeof battle.winner === 'number' ? battle.winner : parseInt(battle.winner)
        ) || battle.winner === 'players';

        if (playersWon) {
            // Get all surviving player characters
            const survivingPlayers = battle.teams.players
                .map(id => battle.combatants[id])
                .filter(c => c && c.currentHp > 0 && !c.isAI);

            const partySize = Math.max(1, survivingPlayers.length);

            // Use the HIGHEST enemy level for XP lookup (fairest for mixed groups)
            const topEnemy = battle.teams.enemies
                .map(id => battle.combatants[id])
                .filter(Boolean)
                .sort((a, b) => b.level - a.level)[0];

            const [lvlRows] = topEnemy ? await queryLevelRow(db, topEnemy.level) : [[]];
            const baseXp    = lvlRows.length ? (lvlRows[0].xp_for_win   || 0) : 0;
            const baseGold  = lvlRows.length ? (lvlRows[0].gold_for_win || 0) : 0;

            // ── REGION MULTIPLIERS ─────────────────────────────────────
            // Check if the winning player(s) are in a region with
            // modified XP/gold rates. We use the first surviving player's
            // map as the "battle region" (all players in same area).
            let regionXpMult   = 1;
            let regionGoldMult = 1;
            try {
                const firstWinner = survivingPlayers[0];
                if (firstWinner && global.getRegionForMap) {
                    // Get player's current map from DB
                    const [pMap] = await db.query(
                        'SELECT map_id FROM characters WHERE id=?', [firstWinner.charId]);
                    if (pMap.length) {
                        const region = await global.getRegionForMap(pMap[0].map_id);
                        if (region) {
                            regionXpMult   = parseFloat(region.xp_mult   || 1);
                            regionGoldMult = parseFloat(region.gold_mult  || 1);
                        }
                    }
                }
            } catch {}
            // Apply global system multipliers + region multipliers
            const sysXpMult   = parseFloat(global.worldFlags?.['xp_multiplier']  || 1);
            const sysGoldMult = parseFloat(global.worldFlags?.['gold_multiplier'] || 1);

            const shareXp   = Math.max(1, Math.floor((baseXp   / partySize) * regionXpMult   * sysXpMult));
            const shareGold = Math.max(0, Math.floor((baseGold / partySize) * regionGoldMult * sysGoldMult));

            // Award each surviving player
            for (const winner of survivingPlayers) {
                let leveledUp = false;
                if (shareXp) {
                    await db.query('UPDATE characters SET experience=experience+? WHERE id=?',
                        [shareXp, winner.charId]);
                    await db.query(
                        `UPDATE characters SET state_json=JSON_SET(COALESCE(state_json,'{}'),'$.xp',
                         COALESCE(CAST(JSON_EXTRACT(state_json,'$.xp') AS DECIMAL(20,0)),0)+?)
                         WHERE id=?`, [shareXp, winner.charId]);
                    leveledUp = await checkLevelUpStateJson(db, winner.charId);
                }
                if (shareGold && winner.userId) {
                    await db.query('UPDATE users SET currency=currency+? WHERE id=?',
                        [shareGold, winner.userId]);
                }
                // Emit battle_result to each player's socket
                try {
                    const allSocks = await io.in('battle_' + battle.id).fetchSockets();
                    const sock = (allSocks || []).find(s => s._battleCharId === winner.charId);
                    if (sock) sock.emit('battle_result', {
                        won: true, xp: shareXp, gold: shareGold,
                        leveledUp: !!leveledUp,
                        enemyName: topEnemy ? topEnemy.name : 'Enemy',
                        battleType: battle.type, partySize
                    });
                } catch {}

                // ── ACHIEVEMENT: pve_wins + battles_total trigger ────
                try {
                    const achievementRoutes = require('./routes/achievementRoutes');
                    const [[pveRow]] = await db.query(
                        `SELECT CAST(JSON_EXTRACT(battle_record,'$.W') AS UNSIGNED) AS wins FROM characters WHERE id=?`,
                        [winner.charId]
                    );
                    if (pveRow) {
                        await achievementRoutes.checkForCharacter(db, io, winner.charId, 'pve_wins', pveRow.wins || 0);
                    }
                } catch(e) { /* non-critical */ }
            }

            // Win/loss record for 1v1 (only update if exactly 1v1)
            if (survivingPlayers.length === 1 && battle.teams.enemies.length === 1) {
                const winnerId = survivingPlayers[0].charId;
                const loserId  = battle.teams.enemies[0];
                await db.query(`UPDATE characters SET battle_record=JSON_SET(battle_record,'$.W',CAST(JSON_EXTRACT(battle_record,'$.W')+1 AS UNSIGNED)) WHERE id=?`, [winnerId]);
                await db.query(`UPDATE characters SET battle_record=JSON_SET(battle_record,'$.L',CAST(JSON_EXTRACT(battle_record,'$.L')+1 AS UNSIGNED)) WHERE id=?`, [loserId]);

                // ── ACHIEVEMENT: pvp_wins trigger ────────────────────
                try {
                    const achievementRoutes = require('./routes/achievementRoutes');
                    const [[wRow]] = await db.query(
                        `SELECT CAST(JSON_EXTRACT(battle_record,'$.W') AS UNSIGNED) AS wins FROM characters WHERE id=?`,
                        [winnerId]
                    );
                    if (wRow) await achievementRoutes.checkForCharacter(db, io, winnerId, 'pvp_wins', wRow.wins || 1);
                } catch(e) { /* non-critical */ }
            }

            // Event log (single entry for party)
            try {
                const enemyNames = battle.teams.enemies.map(id => battle.combatants[id]?.name).filter(Boolean).join(', ');
                await db.query(
                    `INSERT INTO game_event_log (event_type,actor_id,actor_name,detail_json,map_id)
                     VALUES (?,?,?,?,?)`,
                    ['battle_end', survivingPlayers[0]?.userId || null,
                     survivingPlayers.map(p => p.name).join(', '),
                     JSON.stringify({ xp: shareXp, gold: shareGold, partySize, defeated: enemyNames }),
                     null]
                );
            } catch {}

            // ── SERVER-AUTHORITATIVE QUEST KILL CREDIT ───────────────
            // TEACHING: This is the fix for "client-trusted quest completion".
            // Before this fix, the client would call POST /quests/progress with
            // whatever amount it felt like, and the server trusted it.
            // Now: when a PvE battle ends in a player victory, WE look at which
            // NPCs actually died, find every active quest with a KILL objective
            // for those NPC types, and increment the count ourselves.
            // The client's /quests/progress endpoint now REJECTS KILL objectives —
            // only the server (this block) can advance them.
            try {
                if (battle.enemyNpcIds && battle.enemyNpcIds.length) {
                    // Get NPC names/types for the defeated enemies
                    const npcRows = await (async () => {
                        if (!battle.enemyNpcIds.length) return [];
                        const placeholders = battle.enemyNpcIds.map(() => '?').join(',');
                        const [rows] = await db.query(
                            `SELECT id, name, npc_type FROM game_npcs WHERE id IN (${placeholders})`,
                            battle.enemyNpcIds
                        );
                        return rows;
                    })();

                    if (npcRows.length) {
                        const npcIdSet   = new Set(npcRows.map(n => n.id));
                        const npcTypeSet = new Set(npcRows.map(n => (n.npc_type || '').toLowerCase()));
                        const npcNameSet = new Set(npcRows.map(n => (n.name || '').toLowerCase()));

                        for (const winner of survivingPlayers) {
                            // Load this character's state_json
                            const [cRows] = await db.query(
                                'SELECT state_json FROM characters WHERE id=?', [winner.charId]);
                            if (!cRows.length) continue;
                            let state;
                            try { state = JSON.parse(cRows[0].state_json || '{}'); } catch { continue; }
                            if (!state.quests?.active) continue;

                            let stateChanged = false;
                            for (const [questId, q] of Object.entries(state.quests.active)) {
                                if (!q.objectives) continue;
                                for (const [objKey, obj] of Object.entries(q.objectives)) {
                                    if (obj.complete) continue;
                                    if ((obj.type || '').toUpperCase() !== 'KILL') continue;

                                    // Match by npc_id, npc_type, or name (quest designers use any of these)
                                    const target = (obj.target_npc_id   !== undefined ? obj.target_npc_id   : null);
                                    const ttype  = (obj.target_npc_type || '').toLowerCase();
                                    const tname  = (obj.target_npc_name || '').toLowerCase();

                                    const matches =
                                        (target !== null && npcIdSet.has(Number(target))) ||
                                        (ttype  && npcTypeSet.has(ttype)) ||
                                        (tname  && npcNameSet.has(tname));

                                    if (!matches) continue;

                                    // Each enemy in battle counts as 1 kill
                                    const killCount = battle.enemyNpcIds.filter(id => {
                                        const row = npcRows.find(n => n.id === id);
                                        if (!row) return false;
                                        if (target !== null && row.id === Number(target)) return true;
                                        if (ttype && (row.npc_type || '').toLowerCase() === ttype) return true;
                                        if (tname && (row.name || '').toLowerCase() === tname) return true;
                                        return false;
                                    }).length;

                                    if (!killCount) continue;

                                    obj.current = Math.min(
                                        (obj.current || 0) + killCount,
                                        obj.required || obj.target || 1
                                    );
                                    if (obj.current >= (obj.required || obj.target || 1)) {
                                        obj.current  = obj.required || obj.target || 1;
                                        obj.complete = true;
                                    }
                                    stateChanged = true;
                                }
                                if (stateChanged) {
                                    // Recheck quest readiness
                                    const allDone = Object.values(q.objectives).every(o => o.complete);
                                    q.is_ready_to_turn_in = allDone;
                                }
                            }

                            if (stateChanged) {
                                await db.query(
                                    'UPDATE characters SET state_json=? WHERE id=?',
                                    [JSON.stringify(state), winner.charId]
                                );
                                // Notify client so the UI updates immediately
                                // We find the socket via io — endBattle doesn't have socketMap
                                try {
                                    const allSocks = await io.in('battle_' + battle.id).fetchSockets();
                                    const wSock = (allSocks || []).find(s => s._battleCharId === winner.charId);
                                    if (wSock) wSock.emit('quest_progress_update', { quests: state.quests.active });
                                } catch {}
                            }
                        }
                    }
                }
            } catch (qErr) {
                console.error('[Battle] Quest kill credit error (non-fatal):', qErr.message);
            }
        } // end playersWon block

        // ── loot_drops and ogham drops are below (PvE only) ──
        // Resolve the loser for the existing loot code below
        const winner = battle.combatants[
            typeof battle.winner === 'number' ? battle.winner
            : battle.teams.players.find(id => battle.combatants[id]?.currentHp > 0)
        ];
        const loser  = battle.teams.enemies.length
            ? battle.combatants[battle.teams.enemies[0]]
            : null;
        void winner; void loser; // used in loot block below via `battle.winner`
    }  // end status=FINISHED check

            // =====================================================
            // LOOT DROPS (PvE only — never loot other players)
            // =====================================================
            // TEACHING: Loot rolling in 4 steps:
            //   1. Find the NPC row via loser.charId -> game_npcs.char_id
            //   2. Parse drop_table_json: [{item_id, chance, min_qty, max_qty}]
            //   3. Per entry: roll Math.random()*100. Drop if roll <= chance.
            //      chance:100 = guaranteed. chance:5 = 5% rare drop.
            //   4. ON DUPLICATE KEY safely stacks quantity on existing items.
            //      Then emit loot_drops — forCharId filters to winner only.
            if (battle.type === 'PVE' || battle.type === 'PARTY_PVE') {
                // For party battles, loot rolls for EACH enemy that died
                const deadEnemyIds = battle.teams.enemies.filter(
                    id => !battle.combatants[id] || battle.combatants[id].currentHp <= 0
                );
                const lootWinnerId = battle.teams.players.find(
                    id => battle.combatants[id]?.currentHp > 0 && !battle.combatants[id]?.isAI
                ) || battle.winner;

                for (const deadEnemyId of deadEnemyIds) {
                try {
                    var npcRes = await db.query(
                        'SELECT drop_table_json FROM game_npcs WHERE char_id = ? AND is_enemy = 1 LIMIT 1',
                        [deadEnemyId]
                    );
                    var npcRow = npcRes[0];
                    if (npcRow.length && npcRow[0].drop_table_json) {
                        var dropTable = [];
                        try {
                            var raw = npcRow[0].drop_table_json;
                            dropTable = (typeof raw === 'string') ? JSON.parse(raw) : (raw || []);
                        } catch(e) { dropTable = []; }

                        // ── CONDITIONAL LOOT: region + world-flag filtering ──────
                        // Each drop entry can have an optional "conditions" array.
                        // Format: [{"type":"world_flag","flag":"blood_moon","value":"true"},
                        //          {"type":"region_danger","min":3},
                        //          {"type":"region_corruption","min":2},
                        //          {"type":"region_faction","faction":"undead"},
                        //          {"type":"region_tag","tag":"siege"}]
                        // All conditions must pass or the entry is skipped this kill.
                        let _lootRegion = null;
                        try {
                            const [pMapL] = await db.query(
                                'SELECT map_id FROM characters WHERE id=?', [lootWinnerId]);
                            if (pMapL.length && global.getRegionForMap) {
                                _lootRegion = await global.getRegionForMap(pMapL[0].map_id);
                            }
                        } catch {}
                        const _lootRegionMult = _lootRegion ? parseFloat(_lootRegion.loot_mult || 1) : 1;

                        function _checkLootConditions(entry) {
                            if (!entry.conditions || !entry.conditions.length) return true;
                            const wf = global.worldFlags || {};
                            const rg = _lootRegion || {};
                            return entry.conditions.every(cond => {
                                switch (cond.type) {
                                    case 'world_flag':
                                        return String(wf[cond.flag] ?? '') === String(cond.value ?? 'true');
                                    case 'world_flag_not':
                                        return String(wf[cond.flag] ?? '') !== String(cond.value ?? 'true');
                                    case 'region_danger':
                                        if (cond.min !== undefined && (rg.danger_level || 0) < cond.min) return false;
                                        if (cond.max !== undefined && (rg.danger_level || 0) > cond.max) return false;
                                        return true;
                                    case 'region_corruption':
                                        if (cond.min !== undefined && (rg.corruption_level || 0) < cond.min) return false;
                                        if (cond.max !== undefined && (rg.corruption_level || 0) > cond.max) return false;
                                        return true;
                                    case 'region_faction':
                                        return (rg.faction_control || '') === cond.faction;
                                    case 'region_tag':
                                        try {
                                            const tags = typeof rg.active_tags_json === 'string'
                                                ? JSON.parse(rg.active_tags_json) : (rg.active_tags_json || []);
                                            return tags.includes(cond.tag);
                                        } catch { return false; }
                                    case 'region_weather':
                                        return (rg.weather_override || 'CLEAR') === cond.weather;
                                    default: return true;
                                }
                            });
                        }

                        var actualDrops = [];
                        for (var di = 0; di < dropTable.length; di++) {
                            var entry = dropTable[di];
                            if (!entry.item_id || typeof entry.chance !== 'number') continue;
                            // Check conditional loot rules
                            if (!_checkLootConditions(entry)) continue;
                            // Apply region loot multiplier to drop chance
                            if (Math.random() * 100 > entry.chance * _lootRegionMult) continue;
                            var minQ = Math.max(1, parseInt(entry.min_qty) || 1);
                            var maxQ = Math.max(minQ, parseInt(entry.max_qty) || 1);
                            var qty = minQ + Math.floor(Math.random() * (maxQ - minQ + 1));
                            await db.query(
                                'INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',
                                [lootWinnerId, entry.item_id, qty]
                            );
                            var iRes = await db.query('SELECT name, icon FROM game_items WHERE id=? LIMIT 1', [entry.item_id]);
                            var iRow = iRes[0];
                            if (iRow.length) {
                                actualDrops.push({ item_id: entry.item_id, name: iRow[0].name, icon: iRow[0].icon || '📦', qty: qty });
                            }
                        }
                        if (actualDrops.length) {
                            io.to('battle_' + battle.id).emit('loot_drops', {
                                forCharId: lootWinnerId,
                                drops: actualDrops,
                                enemyName: (battle.combatants[deadEnemyId] || {}).name || 'Enemy'
                            });
                        }
                    }
                } catch(lootErr) { console.error('Loot drop error (non-fatal):', lootErr); }
                } // end deadEnemyId loop

                // --- OGHAM DROP ---
                // Roll against config_ogham_drop_chance (default 5%)
                try {
                    let dropChance = 5;
                    try {
                        for (const tbl of ['game_settings','system_settings','settings']) {
                            const [sr] = await db.query('SHOW TABLES LIKE ?', [tbl]);
                            if (!sr.length) continue;
                            const [cr] = await db.query('SHOW COLUMNS FROM ??', [tbl]);
                            const cols = cr.map(c => c.Field);
                            const kc = cols.find(n => /key|name/i.test(n));
                            const vc = cols.find(n => /val|value/i.test(n));
                            if (!kc || !vc) continue;
                            const [sv] = await db.query(
                                'SELECT ?? AS v FROM ?? WHERE ?? = ?', [vc, tbl, kc, 'config_ogham_drop_chance']);
                            if (sv.length) { dropChance = parseFloat(sv[0].v) || 5; break; }
                        }
                    } catch {}

                    if (Math.random() * 100 < dropChance) {
                        // Pick a random rank-1 ogham to drop
                        const [ogRows] = await db.query(
                            'SELECT id, name, icon, description, lore_text FROM game_oghams WHERE rank=1 ORDER BY RAND() LIMIT 1');
                        if (ogRows.length) {
                            const dropped = ogRows[0];
                            // Give it to winner: find their equipped weapon with the most free slots
                            const [equipped] = await db.query(`
                                SELECT ce.item_id, gi.ogham_slots,
                                    (gi.ogham_slots - IFNULL(used.cnt,0)) AS free_slots
                                FROM character_equipment ce
                                JOIN game_items gi ON gi.id = ce.item_id
                                LEFT JOIN (
                                    SELECT item_id, COUNT(*) as cnt FROM character_oghams
                                    WHERE character_id=? GROUP BY item_id
                                ) used ON used.item_id = ce.item_id
                                WHERE ce.character_id=? AND gi.ogham_slots > 0
                                ORDER BY free_slots DESC LIMIT 1`, [battle.winner, battle.winner]);

                            if (equipped.length && equipped[0].free_slots > 0) {
                                // Find next free slot index
                                const [usedSlots] = await db.query(
                                    'SELECT slot_index FROM character_oghams WHERE character_id=? AND item_id=?',
                                    [battle.winner, equipped[0].item_id]);
                                const usedIdx = new Set(usedSlots.map(r => r.slot_index));
                                let freeSlot = 0;
                                while (usedIdx.has(freeSlot)) freeSlot++;

                                await db.query(
                                    `INSERT INTO character_oghams (character_id, item_id, slot_index, ogham_id, current_rank, kill_count)
                                     VALUES (?,?,?,?,1,0)`,
                                    [battle.winner, equipped[0].item_id, freeSlot, dropped.id]);

                                io.to(`char_${battle.winner}`).emit('ogham_drop', {
                                    name: dropped.name,
                                    icon: dropped.icon || '🩸',
                                    description: dropped.description,
                                    lore_text: dropped.lore_text
                                });
                            } else {
                                // No free slots — add to a "pending oghams" bag (character_items via a special item)
                                // For now: notify the player they found one but couldn't slot it
                                io.to(`char_${battle.winner}`).emit('notification', {
                                    text: `🩸 Found a ${dropped.name} but have no free Ogham Grooves to carve it into.`,
                                    type: 'ogham_found_noslot'
                                });
                            }
                        }
                    }
                } catch(oghamDropErr) { console.warn('Ogham drop error (non-fatal):', oghamDropErr.message); }
            }

    // ---------------------------------------------------------
    // WITNESS SYSTEM
    // TEACHING: After any PvE win, any friendly NPC within 5 tiles
    // of the winner's last known position "witnesses" the kill.
    // We log a fact to npc_memories so the NPC can reference it
    // next time the player talks to them.
    //
    // We only do this for PvE (witnessing PvP would feel weird),
    // and we pull the winner's position from the characters table
    // since we don't have their map position here otherwise.
    // ---------------------------------------------------------
    if (battle.type === 'PVE' && battle.winner && battle.status === 'FINISHED') {
        try {
            const winner     = battle.combatants[battle.winner];
            const loser      = battle.getOpponent(battle.winner);
            const [posRows]  = await db.query(
                'SELECT map_id, x, y FROM characters WHERE id=?', [battle.winner]
            );
            if (posRows.length) {
                const { map_id, x, y } = posRows[0];

                // Get all NPCs on the same map from npcState (exported via global)
                // TEACHING: We use a module-level getter so battle_engine doesn't
                // need to import the full server — separation of concerns.
                const witnesses = typeof getNpcsForMap === 'function'
                    ? getNpcsForMap(map_id).filter(n => {
                        const dist = Math.abs(n.x - x) + Math.abs(n.y - y);
                        return dist <= 5 && !n.isEnemy;
                      })
                    : [];

                const fact = `Witnessed ${winner.name} defeat ${loser.name} in combat`;
                for (const npc of witnesses) {
                    await db.query(
                        `INSERT INTO npc_memories (char_id, npc_name, facts_json, reputation)
                         VALUES (?, ?, JSON_ARRAY(?), 0)
                         ON DUPLICATE KEY UPDATE
                             facts_json = IF(
                                 JSON_LENGTH(facts_json) < 10,
                                 JSON_ARRAY_APPEND(facts_json, '$', ?),
                                 facts_json
                             ),
                             last_seen = CURRENT_TIMESTAMP`,
                        [battle.winner, npc.name, fact, fact]
                    );
                }
                if (witnesses.length) {
                    console.log(`👁️  ${witnesses.length} NPC(s) witnessed ${winner.name} defeat ${loser.name}`);
                }

                // Blood Ogham kill tracking
                try {
                    const [oghams] = await db.query(
                        `SELECT co.*, go.kills_to_rank_up, go.base_ogham_id, go.rank as go_rank
                         FROM character_oghams co
                         JOIN game_oghams go ON go.id = co.ogham_id
                         WHERE co.character_id = ?`, [battle.winner]);
                    for (const og of oghams) {
                        const newKills = (og.kill_count || 0) + 1;
                        const threshold = og.kills_to_rank_up || 50;
                        const [nextRank] = await db.query(
                            'SELECT id, name, icon FROM game_oghams WHERE base_ogham_id=? AND rank=?',
                            [og.base_ogham_id || og.ogham_id, (og.go_rank || 1) + 1]);
                        if (newKills >= threshold && nextRank.length) {
                            await db.query(
                                'UPDATE character_oghams SET ogham_id=?, current_rank=current_rank+1, kill_count=0 WHERE id=?',
                                [nextRank[0].id, og.id]);
                            io.to(`char_${battle.winner}`).emit('notification', {
                                text: `${nextRank[0].icon} ${nextRank[0].name} — your Blood Ogham deepens!`,
                                type: 'ogham_rankup'
                            });
                        } else {
                            await db.query('UPDATE character_oghams SET kill_count=? WHERE id=?', [newKills, og.id]);
                        }
                    }
                } catch(ogErr) { console.warn('Ogham tracking error:', ogErr.message); }

                // Add a rumor so the kill spreads beyond direct witnesses over time
                if (typeof global._addRumor === 'function') {
                    await global._addRumor(db, battle.winner, winner.name,
                        `defeated ${loser.name} in combat`);
                }
            }
        } catch (witnessErr) {
            console.warn('Witness system error (non-fatal):', witnessErr.message);
        }
    }

    // Clean up memory
    delete activeBattles[battle.id];
}

// =================================================================
// LEVEL UP CHECK (state_json-aware version)
// =================================================================
// Teaching: The old checkLevelUp compared cumulative characters.experience
// to per-level xp_required, which is wrong — a level 10 char with 5000
// total XP always has >= 100 (level 2 requirement) so would loop forever.
// The fix: read state_json.xp (XP within current level, decremented on
// each level-up by the progression system) and compare that instead.
// We also apply HP/MP growth here just like the old version did.
async function checkLevelUpStateJson(db, charId) {
    const [rows] = await db.query(
        'SELECT level, max_hp, max_mp, state_json FROM characters WHERE id=?', [charId]
    );
    if (!rows.length) return;
    const c = rows[0];
    let state = {};
    try { state = JSON.parse(c.state_json || '{}'); } catch {}
    if (typeof state.xp !== 'number') state.xp = 0;
    if (!state.progression) state.progression = { unspent_points: 0 };

    let level = c.level || 1;
    let maxHp = c.max_hp;
    let maxMp = c.max_mp;
    let leveled = false;

    // Level up loop — capped at 50 for safety
    for (let i = 0; i < 50; i++) {
        const nextRows = await queryLevelRow(db, level + 1);
        if (!nextRows.length) break; // max level
        const next = nextRows[0];
        if (state.xp < (next.xp_required || 0)) break;

        // Consume XP and level up
        state.xp -= next.xp_required;
        level++;
        maxHp += (next.hp_growth || 0);
        maxMp += (next.mp_growth || 0);
        state.progression.unspent_points = (state.progression.unspent_points || 0) + 3;
        state.progression.last_level_up_at = new Date().toISOString();
        leveled = true;
    }

    if (leveled) {
        await db.query(
            'UPDATE characters SET level=?, max_hp=?, current_hp=?, max_mp=?, current_mp=?, state_json=? WHERE id=?',
            [level, maxHp, maxHp, maxMp, maxMp, JSON.stringify(state), charId]
        );

        // ── Referral Reward Payout ────────────────────────────────
        // TEACHING: We check referral payouts inside checkLevelUpStateJson
        // because this is the single authoritative place where a level-up
        // is confirmed and written to the DB. Checking it anywhere else
        // (e.g. on login) risks double-paying if two events race.
        //
        // Flow:
        //   1. Load the threshold level from system_settings (default 5)
        //   2. Check if this level-up crossed the threshold
        //   3. Find the referrer via characters.user_id → users.referred_by
        //   4. Atomically mark referral_paid=1 (UPDATE ... WHERE referral_paid=0
        //      acts as a compare-and-swap — only one payout ever succeeds)
        //   5. Add gold to the referrer's active character
        //   6. Send them an in-game mail notification
        try {
            await _checkReferralPayout(db, charId, level);
        } catch(refErr) { console.warn('[referral] payout check failed:', refErr.message); }

        // Log level-up
        try {
            const [charRow] = await db.query('SELECT name, user_id FROM characters WHERE id=?', [charId]);
            if (charRow.length) {
                await db.query(
                    `INSERT INTO game_event_log (event_type,actor_id,actor_name,detail_json)
                     VALUES ('level_up',?,?,?)`,
                    [charRow[0].user_id, charRow[0].name,
                     JSON.stringify({ new_level: level, char_id: charId })]
                );
            }
        } catch(logErr) { /* non-fatal */ }
    } else if (state.xp !== (rows[0].state_xp)) {
        // Just save updated state_json (XP synced, no level change)
        await db.query('UPDATE characters SET state_json=? WHERE id=?', [JSON.stringify(state), charId]);
    }
    return leveled; // allows callers to detect level-ups
}

// Keep old function name as alias so existing calls don't break
async function checkLevelUp(db, charId) {
    return checkLevelUpStateJson(db, charId);
}

// =================================================================
// HELPERS
// =================================================================
async function getAvailableCommands(db, stats) {
    // Get default commands
    const [defaults] = await db.query("SELECT * FROM game_battle_commands WHERE is_default=1 ORDER BY display_order");

    // Get class-specific commands
    const [classRow] = await db.query("SELECT battle_cmds FROM game_classes WHERE id=?", [stats.classId]);
    let extraCmds = [];
    if (classRow.length) {
        const extraIds = jp(classRow[0].battle_cmds, []);
        if (extraIds.length) {
            const [extras] = await db.query("SELECT * FROM game_battle_commands WHERE id IN (?) ORDER BY display_order", [extraIds]);
            extraCmds = extras;
        }
    }

    // Get available skills for this class at this level
    const [skills] = await db.query(`
        SELECT gs.*, gcs.mp_cost, gcs.alt_name FROM game_class_skills gcs
        JOIN game_skills gs ON gcs.skill_id = gs.id
        WHERE gcs.class_id = ? AND gcs.learn_level <= ?
        ORDER BY gcs.learn_level`, [stats.classId, stats.level]);

    // Ogham-granted bonus skills (grant_skill_id on equipped oghams)
    // TEACHING: Some legendary oghams grant a skill you wouldn't normally have.
    // We load those skills here and merge them in with a special ogham_granted flag.
    const oghamSkillIds = [];
    if (stats.charId) {
        try {
            const [ogRows] = await db.query(
                `SELECT go.grant_skill_id FROM character_oghams co
                 JOIN game_oghams go ON go.id = co.ogham_id
                 WHERE co.character_id = ? AND go.grant_skill_id IS NOT NULL`,
                [stats.charId]
            );
            for (const r of ogRows) if (r.grant_skill_id) oghamSkillIds.push(r.grant_skill_id);
        } catch { /* non-critical */ }
    }
    let oghamSkills = [];
    if (oghamSkillIds.length) {
        // Avoid duplicates with already-known class skills
        const knownIds = new Set(skills.map(s => s.id));
        const newIds   = oghamSkillIds.filter(id => !knownIds.has(id));
        if (newIds.length) {
            const [granted] = await db.query(
                'SELECT *, 0 AS mp_cost, NULL AS alt_name FROM game_skills WHERE id IN (?)',
                [newIds]
            );
            oghamSkills = granted.map(s => ({ ...s, oghamGranted: true }));
        }
    }
    const allSkills = [...skills, ...oghamSkills];

    // Get available limit breaks
    const limits = await queryLimitBreaksList(db, stats.classId, stats.level, stats.breaklevel);

    // Get consumable items
    const [items] = await db.query(`
        SELECT gi.*, ci.quantity FROM character_items ci
        JOIN game_items gi ON ci.item_id = gi.id
        WHERE ci.character_id = ? AND gi.type = 'CONSUMABLE'`,
        [stats.charId]);

    // Filter out disabled commands (from status effects)
    let disabledCmds = [];
    for (const s of stats.statuses) {
        const [sRows] = await db.query("SELECT disabled_commands FROM game_statuses WHERE id=?", [s.id]);
        if (sRows.length) {
            const disabled = jp(sRows[0].disabled_commands, []);
            if (disabled.includes(-1)) disabledCmds = [-1]; // -1 = all disabled
            else disabledCmds.push(...disabled);
        }
    }

    const cmds = [...defaults, ...extraCmds].map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        description: c.description,
        targetType: c.target_type,
        disabled: disabledCmds.includes(-1) || disabledCmds.includes(c.id)
    }));

    // Build opponent status name set for combo detection
    // NOTE: at command-build time we don't have the live opponent object,
    // so we pass it in via stats._opponentStatuses (set in processAction before
    // calling getAvailableCommands for the re-send after each turn).
    const oppStatuses = new Set((stats._opponentStatuses || []).map(s => s.name.toLowerCase()));

    return {
        commands: cmds,
        skills: allSkills.map(s => {
            const fx = jp(s.effects, {});
            const req = fx.combo_requires;
            const comboReady = req && req.status && oppStatuses.has(req.status.toLowerCase());
            const mpBase = s.mp_cost;
            // MAGIC STANCE: 30% MP discount
            const mpCost = stats._stance === 'MAGIC'
                ? Math.floor(mpBase * 0.7)
                : mpBase;
            return {
                id: s.id,
                name: s.alt_name || s.name,
                icon: s.icon,
                mpCost,
                type: s.type,
                targetType: s.target_type,
                description: s.description,
                comboReady,
                comboLabel: req ? req.message || `COMBO: ${req.status}` : null,
                hits: fx.hits || 1,
                chargeTurns: fx.charge_turns || 0,
            };
        }),
        limits: limits.map(l => ({
            id: l.id,
            name: l.name,
            icon: l.icon,
            breakLevel: l.break_level,
            targetType: l.target_type,
            description: l.description
        })),
        items: items.map(i => ({
            id: i.id,
            name: i.name,
            icon: i.icon,
            quantity: i.quantity
        }))
    };
}

// In battle_engine.js

// -----------------------------------------------------------------
// BROADCAST UPDATE (Fixed)
// -----------------------------------------------------------------
async function broadcastBattleUpdate(io, battle, actionResult, db) {
    const room = `battle_${battle.id}`;

    try {
        const sockets = await io.in(room).fetchSockets();
        if (sockets && sockets.length) {
            for (const s of sockets) {
                const viewerCharId = s._battleCharId;
                const state = battle.toClientState(viewerCharId);

                // Re-build available commands with LIVE opponent statuses + stance
                // so the combo badge and MP costs are always accurate this turn.
                let commands = null;
                if (viewerCharId && battle.combatants[viewerCharId] && db) {
                    try {
                        const liveCombatant = battle.combatants[viewerCharId];
                        const liveOpponent  = battle.getOpponent(viewerCharId);
                        // Inject live fields into the stats snapshot (we don't have
                        // the original stats object here, so we build a minimal shim)
                        const statsShim = {
                            ...liveCombatant,
                            _opponentStatuses: liveOpponent ? liveOpponent.statuses : [],
                            _stance:           liveCombatant._stance || null
                        };
                        commands = await getAvailableCommands(db, statsShim);
                    } catch { /* non-fatal — client falls back to last known commands */ }
                }

                s.emit('battle_update', { state, action: actionResult || null, commands });
            }
            return;
        }
    } catch (e) {
        // Fall through to the public update.
    }

    const publicState = battle.toClientState(null);
    io.to(room).emit('battle_update', { state: publicState, action: actionResult || null });
}

BattleManager.getBattle = (id) => activeBattles[id] || null;

// =================================================================
// REFERRAL PAYOUT HELPER
// =================================================================
// Called from checkLevelUpStateJson after every confirmed level-up.
// The UPDATE WHERE referral_paid=0 acts as an atomic lock so only
// one payout ever fires, even if two events somehow race.
// =================================================================
async function _checkReferralPayout(db, charId, newLevel) {
    // 1. Read threshold + reward values from system_settings
    const [settingRows] = await db.query(
        `SELECT setting_key, setting_value FROM system_settings
         WHERE setting_key IN ('referral_threshold_level','referral_gold_reward','referral_xp_reward')`
    );
    const settings = {};
    for (const r of settingRows) settings[r.setting_key] = parseInt(r.setting_value, 10) || 0;

    const THRESHOLD = settings['referral_threshold_level'] || 5;
    const GOLD      = settings['referral_gold_reward']      || 500;
    const XP_BONUS  = settings['referral_xp_reward']        || 0;

    // 2. Only act when the player exactly reaches the threshold level
    if (newLevel !== THRESHOLD) return;

    // 3. Load the character's user + referral state
    const [[charRow]] = await db.query(
        `SELECT c.name AS char_name, c.user_id,
                u.referred_by, u.referral_paid
         FROM characters c
         JOIN users u ON u.id = c.user_id
         WHERE c.id = ?`,
        [charId]
    );
    if (!charRow || !charRow.referred_by || charRow.referral_paid) return;

    // 4. Atomic lock — only one UPDATE will get affectedRows=1
    const [lock] = await db.query(
        'UPDATE users SET referral_paid=1 WHERE id=? AND referral_paid=0',
        [charRow.user_id]
    );
    if (!lock.affectedRows) return;

    // 5. Find the referrer's primary character (highest level)
    const [[referrerChar]] = await db.query(
        `SELECT c.id AS char_id, c.name, c.gold
         FROM characters c
         WHERE c.user_id = ?
         ORDER BY c.level DESC, c.id ASC LIMIT 1`,
        [charRow.referred_by]
    );
    if (!referrerChar) return;

    // 6. Pay gold
    if (GOLD > 0) {
        await db.query('UPDATE characters SET gold = gold + ? WHERE id=?', [GOLD, referrerChar.char_id]);
    }

    // 7. Pay XP bonus via state_json
    if (XP_BONUS > 0) {
        const [[rs]] = await db.query('SELECT state_json FROM characters WHERE id=?', [referrerChar.char_id]);
        let state = {};
        try { state = JSON.parse(rs?.state_json || '{}'); } catch {}
        state.xp = (state.xp || 0) + XP_BONUS;
        await db.query('UPDATE characters SET state_json=? WHERE id=?', [JSON.stringify(state), referrerChar.char_id]);
    }

    // 8. System mail notification
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    const subject   = `🎉 Referral Reward — ${charRow.char_name} reached level ${THRESHOLD}!`;
    const body = [
        `${charRow.char_name}, who joined using your invite link, just reached level ${THRESHOLD}.`,
        ``,
        `Your referral reward:`,
        GOLD     > 0 ? `  💰 ${GOLD} gold (added to your character)` : null,
        XP_BONUS > 0 ? `  ✨ ${XP_BONUS} bonus XP` : null,
        ``,
        `Keep spreading the word — every recruit can earn you rewards!`
    ].filter(l => l !== null).join('\n');

    await db.query(
        `INSERT INTO character_mail
         (sender_char_id, sender_name, recipient_char_id, subject, body, gold_attachment, expires_at)
         VALUES (NULL, 'System', ?, ?, ?, 0, ?)`,
        [referrerChar.char_id, subject, body, expiresAt]
    );

    // 9. Event log
    await db.query(
        `INSERT INTO game_event_log (event_type, actor_id, actor_name, detail_json)
         VALUES ('referral_paid', ?, ?, ?)`,
        [charRow.referred_by, referrerChar.name,
         JSON.stringify({ referred_char: charRow.char_name, referrer_char: referrerChar.name,
                          gold: GOLD, xp: XP_BONUS, threshold: THRESHOLD })]
    ).catch(() => {});

    console.log(`[Referral] ${referrerChar.name} earned ${GOLD}g + ${XP_BONUS}xp for referring ${charRow.char_name} (Lv.${THRESHOLD})`);
}

module.exports = BattleManager;
