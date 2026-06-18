// =================================================================
// BATTLE ENGINE — Modular Entry Point
// =================================================================
// This file imports all battle subsystems and assembles the
// BattleManager interface. Any code that does:
//   const BattleManager = require('./battle_engine')
// now gets redirected here via battle_engine.js re-export.
//
// MODULES:
//   shared.js     — crypto, safeEval, jp utility
//   settings.js   — feature flags, arena overrides
//   movement.js   — grid, pathfinding, elevation, AoE, zone of control
//   legacy.js     — all original combat functions (extracted from battle_engine.js)
//
// The legacy.js module contains the original monolith functions.
// Future sessions will continue splitting it into focused modules:
//   defense.js, combat.js, status.js, systems.js, narrative.js,
//   rules.js, ai.js, rewards.js, stats.js
// =================================================================

const { loadBattleSettings, applyArenaOverrides } = require('./settings');
const movement = require('./movement');
const formation = require('./formation');
const turns = require('./turns');
const defensive = require('./defensive');
const buffs = require('./buffs');
const loot = require('./loot');
const autobattle = require('./autobattle');
const preview = require('./preview');
const morale = require('./morale');
const bravedefault = require('./bravedefault');
const { RealtimeBattle } = require('./realtime');
// Note: templates are handled by the existing game_battle_templates DB table
// + template_installer.js + template-picker-panel.tsx. No separate templates.js needed.

// Legacy module contains everything from the original battle_engine.js
// except settings (which we've extracted) and movement (which we've enhanced).
// It exports the original BattleManager + BattleState + all functions.
const legacy = require('./legacy');

// ─── Patch movement enhancements into BattleState ────────────────
const BattleState = legacy.BattleState;

// Override the original chebyshev with the movement module version
BattleState.chebyshev = movement.chebyshev;

// Add new methods to BattleState prototype
BattleState.prototype.findPath = function(sx, sy, ex, ey, maxRange) {
    return movement.findPath(this, sx, sy, ex, ey, maxRange);
};

BattleState.prototype.getElevationBonus = function(attacker, target) {
    return movement.getElevationBonus(this, attacker, target);
};

BattleState.prototype.getAoeTiles = function(origin, shape, direction) {
    return movement.getAoeTiles(origin, shape, direction, this);
};

BattleState.prototype.getThreatenedTiles = function(combatantId) {
    return movement.getThreatenedTiles(this, combatantId);
};

BattleState.prototype.getZoneOfControlMap = function(teamId) {
    return movement.getZoneOfControlMap(this, teamId);
};

BattleState.prototype.checkOpportunityAttack = function(mover, fromX, fromY, toX, toY) {
    return movement.checkOpportunityAttack(this, mover, fromX, fromY, toX, toY);
};

BattleState.prototype.resetOpportunityAttacks = function() {
    return movement.resetOpportunityAttacks(this);
};

BattleState.prototype.getReachableTiles = function(combatantId) {
    return movement.getReachableTiles(this, combatantId);
};

BattleState.prototype.getCoverValue = function(attacker, target) {
    return movement.getCoverValue(this, attacker, target);
};

BattleState.prototype.loadElevation = function(events) {
    return movement.loadElevation(this, events);
};

// ─── Patch the moveCombatant to support opportunity attacks ──────
const originalMoveCombatant = BattleState.prototype.moveCombatant;
if (originalMoveCombatant) {
    BattleState.prototype.moveCombatant = function(combatantId, x, y) {
        const c = this.combatants[combatantId];
        if (!c) return 'Combatant not found';

        const fromX = c.gridX, fromY = c.gridY;

        // Use A* pathfinding if available
        const range = movement.getMoveRange(c, this._settings);
        if (range <= 0) return `${c.name} is too wounded to move!`;

        const path = movement.findPath(this, fromX, fromY, x, y, range);
        if (!path) return `No valid path to (${x},${y}). Range: ${range}`;

        // Check opportunity attacks along the path
        const oppAttacks = [];
        if (this._settings?.enable_opportunity_attacks) {
            // Check leaving current tile
            const opp = movement.checkOpportunityAttack(this, c, fromX, fromY, x, y);
            oppAttacks.push(...opp);
        }

        // Perform the move
        c.gridX = x;
        c.gridY = y;
        c._hasMoved = true;

        return { success: true, path, opportunityAttacks: oppAttacks };
    };
}

// ─── Enhance toClientState to include new grid data ──────────────
const originalToClientState = BattleState.prototype.toClientState;
if (originalToClientState) {
    const origFn = originalToClientState;
    BattleState.prototype.toClientState = function(forCharId) {
        const state = origFn.call(this, forCharId);

        // Add elevation data
        if (this._settings?.enable_elevation && this.elevationMap) {
            state.grid = state.grid || {};
            state.grid.elevation = this.elevationMap;
        }

        // Add zone of control for the viewer's opponents
        if (this._settings?.enable_zone_of_control && forCharId) {
            const myTeam = this.getTeamId(forCharId);
            state.grid = state.grid || {};
            state.grid.threatenedTiles = [...movement.getZoneOfControlMap(this, myTeam)];
        }

        // Add difficult terrain markers
        if (this._settings?.enable_difficult_terrain && this.terrainMap) {
            state.grid = state.grid || {};
            state.grid.difficultTerrain = [];
            for (const [key, terrain] of Object.entries(this.terrainMap)) {
                if (movement.isDifficultTerrain(terrain)) {
                    const [x, y] = key.split(',').map(Number);
                    state.grid.difficultTerrain.push({ x, y, terrain });
                }
            }
        }

        return state;
    };
}

// ─── Patch Formation into BattleState ────────────────────────────
BattleState.prototype.initFormation = function() { return formation.initFormation(this); };
BattleState.prototype.swapRow = function(charId) { return formation.swapRow(this, charId); };
BattleState.prototype.canMeleeTarget = function(attacker, target) { return formation.canMeleeTarget(this, attacker, target); };
BattleState.prototype.getRowDamageModifier = function(attacker, target, isRanged) { return formation.getRowDamageModifier(this, attacker, target, isRanged); };
BattleState.prototype.checkFormationShape = function(teamId) { return formation.checkFormationShape(this, teamId); };
BattleState.prototype.getFormationBonus = function(charId) { return formation.getFormationBonus(this, charId); };
BattleState.prototype.getFormationState = function() { return formation.getFormationState(this); };
BattleState.prototype.loadFormationShapes = function(db) { return formation.loadFormationShapes(db, this); };

// ─── Patch ATB/CTB into BattleState ─────────────────────────────
BattleState.prototype.initATB = function() { return turns.initATB(this); };
BattleState.prototype.tickATB = function() { return turns.tickATB(this); };
BattleState.prototype.resetATBGauge = function(charId, weight) { return turns.resetATBGauge(this, charId, weight); };
BattleState.prototype.setATBPause = function(paused) { return turns.setATBPause(this, paused); };
BattleState.prototype.getATBState = function() { return turns.getATBState(this); };

BattleState.prototype.initCTB = function() { return turns.initCTB(this); };
BattleState.prototype.advanceCTB = function() { return turns.advanceCTB(this); };
BattleState.prototype.resetCTBCounter = function(charId, weight) { return turns.resetCTBCounter(this, charId, weight); };
BattleState.prototype.getCTBTimeline = function() { return turns.getCTBTimeline(this); };
BattleState.prototype.getCTBState = function() { return turns.getCTBState(this); };

// ─── Patch Defensive systems into BattleState ───────────────────
BattleState.prototype.applyCover = function(protectorId, targetId) {
    const p = this.combatants[protectorId], t = this.combatants[targetId];
    return defensive.applyCover(this, p, t);
};
BattleState.prototype.getCoverer = function(targetCharId) { return defensive.getCoverer(this, targetCharId); };
BattleState.prototype.resolveCoverIntercept = function(target, damage, result) { return defensive.resolveCoverIntercept(this, target, damage, result); };
BattleState.prototype.applyBarrier = function(combatantId, amount, duration, type) {
    return defensive.applyBarrier(this.combatants[combatantId], amount, duration, type);
};
BattleState.prototype.resolveBarrier = function(combatantId, damage, damageType, result) {
    return defensive.resolveBarrier(this.combatants[combatantId], damage, damageType, result);
};

// ─── Patch Loot system into BattleState ──────────────────────────
BattleState.prototype.resolveSteal = function(db, actorId, targetId, result) {
    return loot.resolveSteal(db, this, this.combatants[actorId], this.combatants[targetId], result);
};
BattleState.prototype.rollDropTable = function(db, enemyCharId, killerCharId, overkillDmg) {
    return loot.rollDropTable(db, enemyCharId, killerCharId, overkillDmg, this._settings);
};
BattleState.prototype.calculateBattleRating = function(winnerTeamId) {
    return loot.calculateBattleRating(this, winnerTeamId, this._settings);
};
BattleState.prototype.getBattleChainBonus = function(charId) {
    return loot.getBattleChainBonus(this.combatants[charId], this._settings);
};

// ─── Patch Buff system into BattleState ──────────────────────────
BattleState.prototype.enhancedApplyStatus = function(targetId, statusData, duration, result) {
    return buffs.enhancedApplyStatus(this.combatants[targetId], statusData, duration, this._settings, result);
};
BattleState.prototype.cleanse = function(targetId, options, result) {
    return buffs.cleanse(this.combatants[targetId], options, this._settings, result);
};
BattleState.prototype.dispel = function(targetId, options, result) {
    return buffs.dispel(this.combatants[targetId], options, this._settings, result);
};
BattleState.prototype.getStacks = function(targetId, statusName) {
    return buffs.getStacks(this.combatants[targetId], statusName);
};

// ─── Patch Auto-Battle into BattleState ─────────────────────────
BattleState.prototype.pickAutoAction = function(combatantId, tactics) {
    return autobattle.pickAutoAction(this, this.combatants[combatantId], tactics || 'balanced');
};

// ─── Patch Damage Preview into BattleState ──────────────────────
BattleState.prototype.previewAttack = function(attackerId, targetId, skillId) {
    return preview.previewAttack(this, attackerId, targetId, skillId);
};

// ─── Patch Morale into BattleState ──────────────────────────────
BattleState.prototype.initMorale = function() { return morale.initMorale(this); };
BattleState.prototype.onMoraleDeath = function(deadId) { return morale.onCombatantDeath(this, deadId); };
BattleState.prototype.onMoraleDamage = function(targetId, damage, isCrit) { return morale.onDamageTaken(this, targetId, damage, isCrit); };
BattleState.prototype.onMoraleHeal = function(targetId) { return morale.onHealReceived(this, targetId); };
BattleState.prototype.onMoraleIdle = function(combatantId) { return morale.onIdleTurn(this, combatantId); };
BattleState.prototype.shouldFlee = function(combatantId) { return morale.shouldFlee(this, combatantId); };
BattleState.prototype.checkRout = function(fleeingId) { return morale.checkRout(this, fleeingId); };
BattleState.prototype.getPursuitBonus = function(targetId) { return morale.getPursuitBonus(this, targetId); };

// ─── Patch Brave/Default into BattleState ───────────────────────
BattleState.prototype.initBraveDefault = function() { return bravedefault.initBraveDefault(this); };
BattleState.prototype.resolveDefault = function(combatantId) { return bravedefault.resolveDefault(this, combatantId); };
BattleState.prototype.resolveBrave = function(combatantId, count) { return bravedefault.resolveBrave(this, combatantId, count); };
BattleState.prototype.hasBraveActionsRemaining = function(combatantId) { return bravedefault.hasBraveActionsRemaining(this, combatantId); };
BattleState.prototype.consumeBraveAction = function(combatantId) { return bravedefault.consumeBraveAction(this, combatantId); };
BattleState.prototype.mustSkipTurn = function(combatantId) { return bravedefault.mustSkipTurn(this, combatantId); };
BattleState.prototype.tickBP = function(combatantId) { return bravedefault.tickBP(this, combatantId); };
BattleState.prototype.getDefaultDefenseBonus = function(combatantId) { return bravedefault.getDefaultDefenseBonus(this, combatantId); };

// ─── Enhance toClientState to include formation + ATB/CTB data ───
const prevToClientState = BattleState.prototype.toClientState;
if (prevToClientState) {
    const wrappedFn = prevToClientState;
    BattleState.prototype.toClientState = function(forCharId) {
        const state = wrappedFn.call(this, forCharId);

        // Formation data
        const formationState = formation.getFormationState(this);
        if (formationState) state.formation = formationState;

        // ATB gauge data
        const atbState = turns.getATBState(this);
        if (atbState) state.atb = atbState;

        // CTB timeline data
        const ctbState = turns.getCTBState(this);
        if (ctbState) state.ctb = ctbState;

        // Morale data
        const moraleState = morale.getMoraleState(this);
        if (moraleState) state.morale = moraleState;

        // Brave/Default data
        const bdState = bravedefault.getBraveDefaultState(this);
        if (bdState) state.braveDefault = bdState;

        // Barrier + buff stack data on combatants
        if (state.combatants) {
            for (const c of Object.values(state.combatants)) {
                const comb = this.combatants[c.charId];
                if (comb && comb._barrier) c.barrier = defensive.getBarrierState(comb);
                if (comb && comb._covering) c.covering = comb._covering.targetCharId;
                // Enrich status list with stacks + category for UI
                if (comb && comb.statuses) {
                    c.statuses = comb.statuses.map(s => ({
                        ...s,
                        stacks: s._stacks || 1,
                        category: s.category || 'debuff',
                        undispellable: s.undispellable || false,
                    }));
                }
            }
        }

        return state;
    };
}

// ─── Override settings loader with enhanced version ──────────────
legacy.BattleManager._loadBattleSettings = loadBattleSettings;
legacy.BattleManager._applyArenaOverrides = applyArenaOverrides;

// ─── Export enhanced BattleManager ───────────────────────────────
legacy.BattleManager.movement = movement;
legacy.BattleManager.formation = formation;
legacy.BattleManager.turns = turns;
legacy.BattleManager.defensive = defensive;
legacy.BattleManager.buffs = buffs;
legacy.BattleManager.loot = loot;
legacy.BattleManager.autobattle = autobattle;
legacy.BattleManager.preview = preview;
legacy.BattleManager.morale = morale;
legacy.BattleManager.bravedefault = bravedefault;
legacy.BattleManager.RealtimeBattle = RealtimeBattle;
// Templates handled by existing game_battle_templates + template_installer.js

module.exports = legacy.BattleManager;
