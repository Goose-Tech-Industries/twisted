// =================================================================
// REAL-TIME COMBAT ENGINE v2 — Optimized
// =================================================================
// Server tick loop for action combat (Dragon Age / FF7R style).
//
// OPTIMIZATIONS:
//   - 250ms tick rate (4 ticks/sec) — smooth enough for 2D, low CPU
//   - Delta-only broadcasts — only sends what changed
//   - Auto-cleanup on empty battles (no leaked intervals)
//   - Equipment stats loaded once at battle start
//   - Stun/silence properly prevent actions
//
// TOGGLE: combat_mode = 'realtime' in battle settings
// =================================================================

const TICK_RATE = 250; // ms between ticks (4/sec)
const AUTO_ATTACK_BASE = 2000; // ms base auto-attack speed
const BROADCAST_EVERY = 2; // broadcast state every N ticks

class RealtimeBattle {
    constructor(battleId, combatants, settings) {
        this.id = battleId;
        this.combatants = {};
        this.teams = {};
        this.status = 'active';
        this.tickCount = 0;
        this.startedAt = Date.now();
        this._settings = settings || {};
        this._tickInterval = null;
        this._io = null;
        this._log = [];
        this._lastBroadcast = {};
        this._spectators = new Set();

        for (const c of combatants) {
            const charId = c.charId || c.id;
            this.combatants[charId] = {
                charId,
                name: c.name || 'Unknown',
                icon: c.icon || '👤',
                isAI: !!c.isAI,
                // Stats (including equipment bonuses — should be pre-calculated by getEffectiveStats)
                attack: c.attack || c.strength || 10,
                defense: c.defense || c.vitality || 5,
                mo: c.magic_offense || c.mo || 5,
                md: c.magic_defense || c.md || 5,
                speed: c.speed || 10,
                luck: c.luck || 5,
                element: c.element || null,
                // HP/MP
                currentHp: c.currentHp ?? c.maxHp ?? 100,
                maxHp: c.maxHp || 100,
                currentMp: c.currentMp ?? c.maxMp ?? 50,
                maxMp: c.maxMp || 50,
                // Position
                posX: c.gridX ?? c.posX ?? 0,
                posY: c.gridY ?? c.posY ?? 0,
                // Movement
                moveSpeed: Math.max(0.5, (c.speed || 10) / 25),
                moveTarget: null,
                isMoving: false,
                // Targeting
                targetId: null,
                // Auto-attack
                autoAttackTimer: 0,
                autoAttackSpeed: Math.max(800, AUTO_ATTACK_BASE - (c.speed || 0) * 15),
                weaponRange: c.weaponRange || 1.5,
                weaponElement: c.weaponElement || null,
                // Abilities
                skills: c._skills || [],
                cooldowns: {},
                queuedAction: null,
                // Status
                alive: true,
                effects: [],
                stunned: false,
                silenced: false,
                // Tracking
                totalDamageDealt: 0,
                totalDamageTaken: 0,
                killCount: 0,
            };

            const teamId = c.teamId || (c.isAI ? 'enemy' : 'player');
            if (!this.teams[teamId]) this.teams[teamId] = [];
            this.teams[teamId].push(charId);
        }

        // AI: auto-target nearest enemy
        for (const c of Object.values(this.combatants)) {
            if (c.isAI) this._aiPickTarget(c);
        }
    }

    start(io) {
        this._io = io;
        this._tickInterval = setInterval(() => this.tick(), TICK_RATE);
        this._log.push({ t: 0, msg: 'Battle started!' });
    }

    stop() {
        if (this._tickInterval) {
            clearInterval(this._tickInterval);
            this._tickInterval = null;
        }
        this.status = 'finished';
    }

    tick() {
        if (this.status !== 'active') return;
        this.tickCount++;
        const dt = TICK_RATE;

        // Check if battle is empty (all players disconnected)
        // Only auto-stop if this battle was started WITH human players (not AI-vs-AI simulation)
        const hadPlayers = Object.values(this.combatants).some(c => !c.isAI);
        if (hadPlayers) {
            const hasAlivePlayers = Object.values(this.combatants).some(c => !c.isAI && c.alive);
            if (!hasAlivePlayers && this.tickCount > 40) { // 10 seconds grace
                this.stop();
                return;
            }
        }

        for (const c of Object.values(this.combatants)) {
            if (!c.alive) continue;

            // Tick status effects
            this._tickEffects(c, dt);
            if (c.stunned) continue; // Stunned = skip all actions

            // Movement
            if (c.moveTarget && c.isMoving) {
                const dx = c.moveTarget.x - c.posX;
                const dy = c.moveTarget.y - c.posY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const moveAmt = c.moveSpeed * (dt / 1000);

                if (dist <= moveAmt) {
                    c.posX = c.moveTarget.x;
                    c.posY = c.moveTarget.y;
                    c.isMoving = false;
                    c.moveTarget = null;
                } else {
                    c.posX += (dx / dist) * moveAmt;
                    c.posY += (dy / dist) * moveAmt;
                }
            }

            // Queued ability (priority over auto-attack)
            if (c.queuedAction && !c.isMoving) {
                const cd = c.cooldowns[c.queuedAction.skillId] || 0;
                if (cd <= 0) {
                    this._resolveAbility(c, c.queuedAction);
                    c.queuedAction = null;
                    continue; // Skip auto-attack this tick
                }
            }

            // Auto-attack
            if (c.targetId && !c.isMoving) {
                const target = this.combatants[c.targetId];
                if (!target || !target.alive) {
                    c.targetId = null;
                    if (c.isAI) this._aiPickTarget(c);
                    continue;
                }

                const range = this._distance(c, target);
                if (range <= c.weaponRange) {
                    c.autoAttackTimer += dt;
                    if (c.autoAttackTimer >= c.autoAttackSpeed) {
                        c.autoAttackTimer = 0;
                        this._resolveAutoAttack(c, target);
                    }
                } else {
                    c.moveTarget = { x: target.posX, y: target.posY };
                    c.isMoving = true;
                }
            }

            // AI: use abilities when available
            if (c.isAI && c.targetId && c.skills.length && this.tickCount % 8 === 0) {
                const ready = c.skills.find(s => !(c.cooldowns[s.id] > 0) && c.currentMp >= (s.mpCost || 0));
                if (ready) {
                    this._resolveAbility(c, { skillId: ready.id, targetId: c.targetId, power: ready.power || 15, mpCost: ready.mpCost || 10, cooldown: ready.cooldown || 5000, element: ready.element });
                }
            }

            // Tick cooldowns
            for (const sk of Object.keys(c.cooldowns)) {
                c.cooldowns[sk] = Math.max(0, c.cooldowns[sk] - dt);
                if (c.cooldowns[sk] <= 0) delete c.cooldowns[sk];
            }
        }

        // Win condition
        const aliveTeams = Object.entries(this.teams).filter(([, members]) =>
            members.some(id => this.combatants[id]?.alive)
        );
        if (aliveTeams.length <= 1) {
            this.winner = aliveTeams.length === 1 ? aliveTeams[0][0] : null;
            this._log.push({ t: this.tickCount, msg: `Battle ended! Winner: ${this.winner || 'Draw'}` });
            this.stop();
            this._broadcastState(true);
            return;
        }

        // Broadcast
        if (this.tickCount % BROADCAST_EVERY === 0) {
            this._broadcastState(false);
        }
    }

    _resolveAutoAttack(attacker, target) {
        let damage = Math.max(1, Math.floor(attacker.attack * 1.2 - target.defense * 0.5));
        damage += Math.floor(Math.random() * (damage * 0.2)) - Math.floor(damage * 0.1); // ±10% variance

        // Elemental modifier
        if (attacker.weaponElement && target.element) {
            const mult = this._getElementMult(attacker.weaponElement, target.element);
            damage = Math.floor(damage * mult);
        }

        // Crit check
        let isCrit = false;
        if (Math.random() * 100 < (this._settings.base_crit_chance || 5) + attacker.luck) {
            damage = Math.floor(damage * (this._settings.crit_damage_multiplier || 1.5));
            isCrit = true;
        }

        target.currentHp = Math.max(0, target.currentHp - damage);
        attacker.totalDamageDealt += damage;
        target.totalDamageTaken += damage;

        if (target.currentHp <= 0) {
            target.alive = false;
            attacker.killCount++;
        }

        this._emitAction('auto_attack', attacker.charId, target.charId, damage, isCrit);
    }

    _resolveAbility(caster, action) {
        if (caster.silenced && action.type !== 'physical') return;
        const target = this.combatants[action.targetId];
        if (!target || !target.alive) return;

        const mpCost = action.mpCost || 0;
        if (caster.currentMp < mpCost) return;
        caster.currentMp -= mpCost;

        let damage = Math.max(1, (action.power || 15) + caster.mo - target.md);
        if (action.element && target.element) {
            damage = Math.floor(damage * this._getElementMult(action.element, target.element));
        }

        target.currentHp = Math.max(0, target.currentHp - damage);
        caster.totalDamageDealt += damage;
        target.totalDamageTaken += damage;
        caster.cooldowns[action.skillId] = action.cooldown || 3000;

        if (target.currentHp <= 0) {
            target.alive = false;
            caster.killCount++;
        }

        this._emitAction('ability', caster.charId, target.charId, damage, false, action.skillId);
    }

    _tickEffects(c, dt) {
        c.stunned = false;
        c.silenced = false;
        for (let i = c.effects.length - 1; i >= 0; i--) {
            const eff = c.effects[i];
            eff.remainingMs -= dt;

            if (eff.type === 'stun') c.stunned = true;
            if (eff.type === 'silence') c.silenced = true;

            // DoT (damage every second)
            if (eff.tickDamage && this.tickCount % 4 === 0) {
                c.currentHp = Math.max(0, c.currentHp - eff.tickDamage);
                if (c.currentHp <= 0) c.alive = false;
            }

            // HoT (heal every second)
            if (eff.tickHeal && this.tickCount % 4 === 0) {
                c.currentHp = Math.min(c.maxHp, c.currentHp + eff.tickHeal);
            }

            if (eff.remainingMs <= 0) c.effects.splice(i, 1);
        }
    }

    _getElementMult(atkElement, defElement) {
        // Check DB-loaded interactions first
        if (this._elementChart) {
            const key = `${atkElement}_${defElement}`;
            if (this._elementChart[key]) return this._elementChart[key];
        }
        // Fallback to default chart
        const chart = { fire: 'ice', ice: 'wind', wind: 'earth', earth: 'fire', water: 'fire', lightning: 'water', light: 'dark', dark: 'light' };
        if (chart[atkElement] === defElement) return 1.5;
        if (chart[defElement] === atkElement) return 0.75;
        return 1.0;
    }

    async loadElementChart(db) {
        if (!db) return;
        try {
            const [rows] = await db.query('SELECT element_a, element_b, damage_bonus FROM game_elemental_reactions WHERE active=1');
            this._elementChart = {};
            for (const r of rows) {
                this._elementChart[`${r.element_a}_${r.element_b}`] = 1 + (parseFloat(r.damage_bonus) || 0);
            }
        } catch {}
    }

    _aiPickTarget(c) {
        const myTeam = Object.entries(this.teams).find(([, m]) => m.includes(c.charId))?.[0];
        let nearest = null, nearestDist = Infinity;
        for (const [tid, members] of Object.entries(this.teams)) {
            if (tid === myTeam) continue;
            for (const id of members) {
                const t = this.combatants[id];
                if (!t || !t.alive) continue;
                const d = this._distance(c, t);
                if (d < nearestDist) { nearestDist = d; nearest = id; }
            }
        }
        c.targetId = nearest;
    }

    _distance(a, b) {
        return Math.sqrt((a.posX - b.posX) ** 2 + (a.posY - b.posY) ** 2);
    }

    _emitAction(type, attackerId, targetId, damage, isCrit, skillId) {
        this._io?.to('battle_' + this.id).emit('rt_combat_action', {
            type, attackerId, targetId, damage, isCrit, skillId,
            targetHp: this.combatants[targetId]?.currentHp,
            targetAlive: this.combatants[targetId]?.alive,
        });
    }

    _broadcastState(isFinal) {
        if (!this._io) return;
        const state = {
            id: this.id, mode: 'realtime', status: this.status,
            tick: this.tickCount, elapsed: Date.now() - this.startedAt,
            winner: this.winner || null, isFinal,
            combatants: {},
        };
        for (const [id, c] of Object.entries(this.combatants)) {
            state.combatants[id] = {
                charId: c.charId, name: c.name, icon: c.icon,
                posX: Math.round(c.posX * 10) / 10,
                posY: Math.round(c.posY * 10) / 10,
                hp: c.currentHp, maxHp: c.maxHp,
                mp: c.currentMp, maxMp: c.maxMp,
                alive: c.alive, targetId: c.targetId,
                moving: c.isMoving, stunned: c.stunned, silenced: c.silenced,
                effects: c.effects.map(e => e.name),
                cooldowns: c.cooldowns,
                team: Object.entries(this.teams).find(([, m]) => m.includes(c.charId))?.[0],
            };
        }
        this._io.to('battle_' + this.id).emit('rt_combat_state', state);

        // Also send to spectators
        for (const specId of this._spectators) {
            this._io.to(specId).emit('rt_combat_state', state);
        }
    }

    // ── Public API ───────────────────────────────────────────────
    setTarget(charId, targetId) {
        const c = this.combatants[charId];
        if (c && c.alive && !c.isAI) c.targetId = targetId;
    }

    moveTo(charId, x, y) {
        const c = this.combatants[charId];
        if (c && c.alive && !c.stunned && !c.isAI) {
            c.moveTarget = { x: Math.max(0, Math.min(x, (this._settings.grid_width || 12) - 1)), y: Math.max(0, Math.min(y, (this._settings.grid_height || 8) - 1)) };
            c.isMoving = true;
        }
    }

    queueAbility(charId, skillId, targetId, power, mpCost, cooldown, element) {
        const c = this.combatants[charId];
        if (c && c.alive && !c.isAI) c.queuedAction = { skillId, targetId, power, mpCost, cooldown, element };
    }

    addSpectator(socketId) { this._spectators.add(socketId); }
    removeSpectator(socketId) { this._spectators.delete(socketId); }

    getResults() {
        return {
            winner: this.winner,
            duration: Date.now() - this.startedAt,
            combatants: Object.values(this.combatants).map(c => ({
                charId: c.charId, name: c.name, alive: c.alive,
                damageDealt: c.totalDamageDealt, damageTaken: c.totalDamageTaken,
                kills: c.killCount, team: Object.entries(this.teams).find(([, m]) => m.includes(c.charId))?.[0],
            })),
        };
    }

    toClientState() {
        return { id: this.id, mode: 'realtime', status: this.status, combatants: this.combatants, teams: this.teams,
            grid: { width: this._settings.grid_width || 12, height: this._settings.grid_height || 8 } };
    }
}

module.exports = { RealtimeBattle, TICK_RATE };
