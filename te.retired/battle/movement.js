// =================================================================
// MOVEMENT & GRID — Positioning, pathfinding, terrain, elevation,
//                   AoE shapes, zone of control, opportunity attacks
// =================================================================

// ─── A* Pathfinding ──────────────────────────────────────────────
// Returns shortest path from (sx,sy) to (ex,ey) respecting blocking
// objects, combatants, and difficult terrain movement costs.
function findPath(battle, sx, sy, ex, ey, maxRange) {
    const W = battle.GRID_W, H = battle.GRID_H;
    if (ex < 0 || ex >= W || ey < 0 || ey >= H) return null;

    const key = (x, y) => `${x},${y}`;
    const blocked = new Set();

    // Block tiles with living combatants (except destination)
    for (const c of Object.values(battle.combatants)) {
        if (c.currentHp > 0 && !c._knockedOut && !(c.gridX === ex && c.gridY === ey)) {
            blocked.add(key(c.gridX, c.gridY));
        }
    }
    // Block tiles with non-destroyed blocking objects
    for (const obj of Object.values(battle.battleObjects || {})) {
        if (!obj.destroyed && obj.blocking) blocked.add(key(obj.x, obj.y));
    }

    // A* with terrain cost
    const open = [{ x: sx, y: sy, g: 0, h: chebyshev({ gridX: sx, gridY: sy }, { gridX: ex, gridY: ey }), path: [] }];
    const closed = new Set();

    while (open.length > 0) {
        open.sort((a, b) => (a.g + a.h) - (b.g + b.h));
        const current = open.shift();
        const ck = key(current.x, current.y);

        if (current.x === ex && current.y === ey) {
            const fullPath = [...current.path, { x: ex, y: ey }];
            return maxRange && current.g > maxRange ? null : fullPath;
        }

        if (closed.has(ck)) continue;
        closed.add(ck);

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nx = current.x + dx, ny = current.y + dy;
                if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
                const nk = key(nx, ny);
                if (closed.has(nk) || blocked.has(nk)) continue;

                // Movement cost: difficult terrain costs 2, normal costs 1
                let moveCost = 1;
                const terrain = battle.getTerrainAt(nx, ny);
                if (isDifficultTerrain(terrain) && battle._settings?.enable_difficult_terrain) {
                    moveCost = battle._settings.difficult_terrain_cost || 2;
                }
                // Diagonal costs 1.4 (Pythagorean approximation)
                if (dx !== 0 && dy !== 0) moveCost *= 1.4;

                const g = current.g + moveCost;
                if (maxRange && g > maxRange) continue;

                open.push({
                    x: nx, y: ny, g,
                    h: chebyshev({ gridX: nx, gridY: ny }, { gridX: ex, gridY: ey }),
                    path: [...current.path, { x: current.x, y: current.y }]
                });
            }
        }
    }
    return null; // No path found
}

function isDifficultTerrain(terrain) {
    return ['mud', 'water', 'ice', 'rubble', 'sand', 'swamp', 'thorns'].includes(terrain);
}

// ─── Distance Calculation ────────────────────────────────────────
function chebyshev(a, b) {
    return Math.max(Math.abs((a.gridX || 0) - (b.gridX || 0)), Math.abs((a.gridY || 0) - (b.gridY || 0)));
}

function manhattan(a, b) {
    return Math.abs((a.gridX || 0) - (b.gridX || 0)) + Math.abs((a.gridY || 0) - (b.gridY || 0));
}

// ─── Elevation System ────────────────────────────────────────────
// Each tile can have an elevation value (0-3). Higher elevation
// grants damage bonus when attacking downhill, and accuracy penalty
// when attacking uphill.

function getElevation(battle, x, y) {
    return battle.elevationMap?.[`${x},${y}`] || 0;
}

function getElevationBonus(battle, attacker, target) {
    if (!battle._settings?.enable_elevation) return { damage: 0, accuracy: 0, dodge: 0 };
    const aElev = getElevation(battle, attacker.gridX, attacker.gridY);
    const tElev = getElevation(battle, target.gridX, target.gridY);
    const diff = aElev - tElev;

    if (diff > 0) {
        // Attacking downhill: damage bonus, accuracy bonus
        const bonus = diff * (battle._settings.elevation_height_bonus || 0.15);
        return { damage: bonus, accuracy: bonus * 0.5, dodge: 0 };
    } else if (diff < 0) {
        // Attacking uphill: accuracy penalty, target gets dodge bonus
        const penalty = Math.abs(diff) * (battle._settings.elevation_height_bonus || 0.15);
        return { damage: 0, accuracy: -penalty * 0.5, dodge: penalty * 0.3 };
    }
    return { damage: 0, accuracy: 0, dodge: 0 };
}

function loadElevation(battle, events) {
    battle.elevationMap = {};
    for (const ev of (events || [])) {
        if (ev.type === 'ELEVATION' && ev.elevation !== undefined) {
            battle.elevationMap[`${ev.x},${ev.y}`] = parseInt(ev.elevation) || 0;
        }
    }
}

// ─── AoE Shape System ────────────────────────────────────────────
// Shapes: radius (circle), line, cone, cross, ring
// Returns array of {x, y} tiles affected.

function getAoeTiles(origin, shape, direction, battle) {
    const tiles = [];
    const W = battle.GRID_W, H = battle.GRID_H;
    const inBounds = (x, y) => x >= 0 && x < W && y >= 0 && y < H;

    switch (shape.type) {
        case 'radius':
        case 'circle': {
            const r = shape.radius || 1;
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    const x = origin.x + dx, y = origin.y + dy;
                    if (inBounds(x, y) && chebyshev({ gridX: origin.x, gridY: origin.y }, { gridX: x, gridY: y }) <= r) {
                        tiles.push({ x, y });
                    }
                }
            }
            break;
        }

        case 'line': {
            const len = shape.length || 3;
            const dir = normalizeDirection(direction);
            for (let i = 1; i <= len; i++) {
                const x = origin.x + dir.dx * i, y = origin.y + dir.dy * i;
                if (inBounds(x, y)) tiles.push({ x, y });
            }
            break;
        }

        case 'cone': {
            const len = shape.length || 3;
            const dir = normalizeDirection(direction);
            for (let i = 1; i <= len; i++) {
                // Center line
                const cx = origin.x + dir.dx * i, cy = origin.y + dir.dy * i;
                if (inBounds(cx, cy)) tiles.push({ x: cx, y: cy });
                // Spread perpendicular based on distance
                const spread = Math.floor(i / 2);
                for (let s = 1; s <= spread; s++) {
                    const lx = cx + dir.dy * s, ly = cy - dir.dx * s; // perpendicular left
                    const rx = cx - dir.dy * s, ry = cy + dir.dx * s; // perpendicular right
                    if (inBounds(lx, ly)) tiles.push({ x: lx, y: ly });
                    if (inBounds(rx, ry)) tiles.push({ x: rx, y: ry });
                }
            }
            break;
        }

        case 'cross': {
            const r = shape.radius || 2;
            for (let i = 1; i <= r; i++) {
                if (inBounds(origin.x + i, origin.y)) tiles.push({ x: origin.x + i, y: origin.y });
                if (inBounds(origin.x - i, origin.y)) tiles.push({ x: origin.x - i, y: origin.y });
                if (inBounds(origin.x, origin.y + i)) tiles.push({ x: origin.x, y: origin.y + i });
                if (inBounds(origin.x, origin.y - i)) tiles.push({ x: origin.x, y: origin.y - i });
            }
            tiles.push({ x: origin.x, y: origin.y }); // center
            break;
        }

        case 'ring': {
            const r = shape.radius || 2;
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    const dist = chebyshev({ gridX: origin.x, gridY: origin.y }, { gridX: origin.x + dx, gridY: origin.y + dy });
                    if (dist === r && inBounds(origin.x + dx, origin.y + dy)) {
                        tiles.push({ x: origin.x + dx, y: origin.y + dy });
                    }
                }
            }
            break;
        }

        default:
            tiles.push({ x: origin.x, y: origin.y });
    }

    return tiles;
}

function normalizeDirection(dir) {
    if (!dir) return { dx: 1, dy: 0 }; // default: right
    if (typeof dir === 'string') {
        const map = {
            up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
            left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
            'up-left': { dx: -1, dy: -1 }, 'up-right': { dx: 1, dy: -1 },
            'down-left': { dx: -1, dy: 1 }, 'down-right': { dx: 1, dy: 1 },
        };
        return map[dir] || { dx: 1, dy: 0 };
    }
    return { dx: dir.dx || 0, dy: dir.dy || 0 };
}

// ─── Flanking ────────────────────────────────────────────────────
function isFlanking(battle, attackerId, targetId) {
    const a = battle.combatants[attackerId];
    const t = battle.combatants[targetId];
    if (!a || !t || a.gridX === undefined) return false;
    const dist = chebyshev(a, t);
    if (dist > 1) return false;
    if (a.teamId === 'players' && a.gridX > t.gridX) return true;
    if (a.teamId === 'enemies' && a.gridX < t.gridX) return true;
    // Check for surround flanking (ally on opposite side)
    for (const c of Object.values(battle.combatants)) {
        if (c === a || c === t || c.currentHp <= 0) continue;
        if (c.teamId === a.teamId && chebyshev(c, t) <= 1) {
            // Ally adjacent to target on opposite side = flanking
            if (Math.abs(c.gridX - a.gridX) >= 2 || Math.abs(c.gridY - a.gridY) >= 2) return true;
        }
    }
    return false;
}

// ─── Zone of Control & Opportunity Attacks ───────────────────────
// Zone of control = tiles adjacent to melee combatants are "threatened"
// Moving out of a threatened tile triggers an opportunity attack

function getThreatenedTiles(battle, combatantId) {
    const tiles = [];
    const c = battle.combatants[combatantId];
    if (!c || c.currentHp <= 0 || c._knockedOut || c._stunned) return tiles;
    if (!battle._settings?.enable_zone_of_control) return tiles;

    // Only melee combatants threaten adjacent tiles
    const isMelee = !c._isRanged;
    if (!isMelee) return tiles;

    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const x = c.gridX + dx, y = c.gridY + dy;
            if (x >= 0 && x < battle.GRID_W && y >= 0 && y < battle.GRID_H) {
                tiles.push({ x, y });
            }
        }
    }
    return tiles;
}

function getZoneOfControlMap(battle, teamId) {
    // Returns a Set of "x,y" strings that are threatened by the opposing team
    const threatened = new Set();
    if (!battle._settings?.enable_zone_of_control) return threatened;

    for (const c of Object.values(battle.combatants)) {
        if (c.currentHp <= 0 || c._knockedOut || c.teamId === teamId) continue;
        const tiles = getThreatenedTiles(battle, c.charId);
        for (const t of tiles) threatened.add(`${t.x},${t.y}`);
    }
    return threatened;
}

function checkOpportunityAttack(battle, mover, fromX, fromY, toX, toY) {
    if (!battle._settings?.enable_opportunity_attacks) return [];

    const attacks = [];
    const movedFrom = `${fromX},${fromY}`;

    for (const c of Object.values(battle.combatants)) {
        if (c === mover || c.currentHp <= 0 || c._knockedOut || c._stunned) continue;
        if (c.teamId === mover.teamId) continue; // allies don't opportunity attack
        if (c._isRanged) continue; // only melee

        // Was the mover in this enemy's threat zone?
        const wasAdjacent = chebyshev(c, { gridX: fromX, gridY: fromY }) <= 1;
        // Is the mover still in threat zone after moving?
        const stillAdjacent = chebyshev(c, { gridX: toX, gridY: toY }) <= 1;

        // Opportunity attack triggers when leaving threat zone (was adjacent, no longer)
        if (wasAdjacent && !stillAdjacent && !c._usedOpportunityAttack) {
            const dmgPct = battle._settings.opportunity_attack_damage_pct || 0.50;
            attacks.push({
                attacker: c,
                target: mover,
                damagePct: dmgPct
            });
            c._usedOpportunityAttack = true; // once per round
        }
    }
    return attacks;
}

function resetOpportunityAttacks(battle) {
    for (const c of Object.values(battle.combatants)) {
        c._usedOpportunityAttack = false;
    }
}

// ─── Move Range Calculation ──────────────────────────────────────
function getMoveRange(actor, settings) {
    let moveRange = Math.max(2, Math.floor((actor.speed || 10) / 30));
    if (actor._woundFlags?.move_range_mod) {
        moveRange = Math.max(0, moveRange + actor._woundFlags.move_range_mod);
    }
    return moveRange;
}

// Get all tiles a combatant can reach this turn
function getReachableTiles(battle, combatantId) {
    const c = battle.combatants[combatantId];
    if (!c || c.currentHp <= 0) return [];
    const range = getMoveRange(c, battle._settings);
    if (range <= 0) return [];

    const reachable = [];
    const W = battle.GRID_W, H = battle.GRID_H;

    for (let x = 0; x < W; x++) {
        for (let y = 0; y < H; y++) {
            if (x === c.gridX && y === c.gridY) continue;
            const path = findPath(battle, c.gridX, c.gridY, x, y, range);
            if (path) reachable.push({ x, y, cost: path.length });
        }
    }
    return reachable;
}

// ─── Cover System ────────────────────────────────────────────────
function getCoverValue(battle, attacker, target) {
    let cover = 0;
    for (const obj of Object.values(battle.battleObjects || {})) {
        if (obj.destroyed || !obj.coverValue) continue;
        if (chebyshev(target, { gridX: obj.x, gridY: obj.y }) <= 1) {
            // Object is between attacker and target (rough check)
            const objDist = chebyshev(attacker, { gridX: obj.x, gridY: obj.y });
            const targetDist = chebyshev(attacker, target);
            if (objDist <= targetDist) {
                cover = Math.max(cover, obj.coverValue);
            }
        }
    }
    return cover;
}

// ─── Range Checking ──────────────────────────────────────────────
function isInRange(attacker, target, rangeData) {
    if (!rangeData || !rangeData.range) return true; // no range = always in range (melee default)
    const dist = chebyshev(attacker, target);
    const minRange = rangeData.minRange || 0;
    const maxRange = rangeData.range || 1;
    return dist >= minRange && dist <= maxRange;
}

module.exports = {
    findPath, isDifficultTerrain, chebyshev, manhattan,
    getElevation, getElevationBonus, loadElevation,
    getAoeTiles, normalizeDirection,
    isFlanking,
    getThreatenedTiles, getZoneOfControlMap,
    checkOpportunityAttack, resetOpportunityAttacks,
    getMoveRange, getReachableTiles,
    getCoverValue, isInRange,
};
