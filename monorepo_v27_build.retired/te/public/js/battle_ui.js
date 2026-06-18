// =================================================================
// BATTLE UI v1.0 — Client-Side Combat Interface
// =================================================================
// Loaded by game_engine.js. Renders combat overlay on top of canvas.
// All logic is server-authoritative — this just shows menus and animations.

const BattleUI = {
    active: false,
    state: null,     // Current battle state from server
    commands: null,   // Available commands
    currentMenu: 'main', // main, skills, items

    // --- INITIALIZE FROM battle_start EVENT ---
    start(data) {
        BattleUI.active = true;
        BattleUI.state = data;
        BattleUI.commands = data.commands;
        BattleUI.currentMenu = 'main';
        Game.dialogueOpen = true; // Block movement
        BattleUI.render();
    },

    // --- UPDATE FROM battle_update EVENT ---
    update(data) {
        if (!BattleUI.active) return;
        if (data.state) BattleUI.state = { ...BattleUI.state, ...data.state };

        // Refresh commands (live combo badges + MP costs updated each turn)
        if (data.commands) BattleUI.commands = data.commands;

        // Play action animations
        if (data.action && data.action.log) {
            data.action.log.forEach((msg, i) => {
                setTimeout(() => showNotification(msg, 'battle'), i * 400);
            });
        }

        // Check if battle ended
        if (BattleUI.state.status !== 'ACTIVE') {
            setTimeout(() => BattleUI.end(), 2000);
            return;
        }

        BattleUI.currentMenu = 'main';
        BattleUI.render();
    },

    // --- PENDING RESULT ---
    // The server emits 'battle_result' or 'battle_defeat' right after endBattle()
    // finishes (XP, gold, drops all calculated). We store it here so end() can
    // display it. end() is called 2 seconds after battle_update shows FINISHED,
    // so the result payload always arrives before end() runs.
    pendingResult: null,

    // --- END BATTLE — shows results screen instead of removing overlay ---
    end() {
        BattleUI.active = false;
        Game.dialogueOpen = false;

        // If we fled — just dismiss and notify, no results screen needed
        if (BattleUI.state && BattleUI.state.status === 'FLED') {
            const overlay = document.getElementById('battleOverlay');
            if (overlay) overlay.remove();
            showNotification('🏃 Escaped!', 'info');
            BattleUI.pendingResult = null;
            loadCharData();
            return;
        }

        // Show results overlay (victory or defeat)
        const result = BattleUI.pendingResult;
        const won = BattleUI.state && BattleUI.state.winner === Game.myCharId;
        BattleUI._showResultScreen(won, result);
        BattleUI.pendingResult = null;
    },

    // --- CONTINUE (called from result screen buttons) ---
    dismiss() {
        const overlay = document.getElementById('battleOverlay');
        if (overlay) overlay.remove();
        loadCharData();
    },

    respawnAndDismiss() {
        Game.socket.emit('request_respawn');
        const overlay = document.getElementById('battleOverlay');
        if (overlay) overlay.remove();
        loadCharData();
    },

    // --- RESULT SCREEN RENDERER ---
    // TEACHING: This is called from end() which fires 2 seconds after the
    // server marks the battle FINISHED. By then, battle_result and loot_drops
    // have both arrived and been stored in pendingResult. So we can show
    // XP + gold + loot all at once in one clean panel.
    _showResultScreen(won, result) {
        let overlay = document.getElementById('battleOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'battleOverlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:150;background:rgba(0,0,0,0.93);display:flex;align-items:center;justify-content:center;font-family:Courier New,monospace;color:#fff;overflow-y:auto';
            document.body.appendChild(overlay);
        }

        if (won) {
            // ---- VICTORY SCREEN ----
            const xp    = result ? (result.xp   || 0) : 0;
            const gold  = result ? (result.gold  || 0) : 0;
            const lvUp  = result && result.leveledUp;
            const drops = (result && result.drops) ? result.drops : [];
            const enemy = result ? (result.enemyName || 'Enemy') : 'Enemy';

            // Build loot rows HTML (only shown if items actually dropped)
            let lootHtml = '';
            if (drops.length) {
                const rows = drops.map(d => {
                    const qty = d.qty > 1 ? ` <span style="color:#888;font-size:11px">x${d.qty}</span>` : '';
                    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #222">
                        <span style="font-size:18px">${d.icon || '📦'}</span>
                        <span style="font-size:13px;color:#ddd">${d.name}</span>${qty}
                    </div>`;
                }).join('');
                lootHtml = `
                <div style="background:rgba(255,200,50,0.06);border:1px solid #443300;border-radius:10px;padding:14px 16px;margin-bottom:16px;text-align:left">
                    <div style="color:#888;font-size:11px;letter-spacing:2px;margin-bottom:10px">💰 LOOT DROPPED</div>
                    ${rows}
                </div>`;
            }

            overlay.innerHTML = `
            <div style="text-align:center;max-width:500px;width:92%;animation:resultIn 0.4s ease;padding:20px 0">

                <div style="font-size:56px;margin-bottom:8px;animation:bounce 0.6s ease">🏆</div>
                <div style="font-size:28px;font-weight:bold;color:#ffcc00;letter-spacing:3px;text-shadow:0 0 20px #ff8800">VICTORY!</div>
                <div style="color:#666;font-size:13px;margin:6px 0 20px">${enemy} was defeated</div>

                ${lvUp ? `<div style="background:linear-gradient(135deg,#330000,#660000);border:2px solid #ff6600;border-radius:10px;padding:12px;margin-bottom:16px;animation:glow 0.5s infinite alternate">
                    <div style="font-size:22px;color:#ffcc00;font-weight:bold;letter-spacing:2px">✨ LEVEL UP! ✨</div>
                    <div style="color:#ff9900;font-size:13px;margin-top:4px">Level ${result.oldLevel} → <b style="font-size:18px">${result.newLevel}</b></div>
                </div>` : ''}

                <div style="background:rgba(255,255,255,0.04);border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;margin-bottom:16px;text-align:left">
                    <div style="color:#888;font-size:11px;letter-spacing:2px;margin-bottom:10px">REWARDS</div>
                    <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
                        <div style="text-align:center;padding:10px 20px;background:rgba(100,200,100,0.08);border:1px solid #264;border-radius:8px;min-width:80px">
                            <div style="font-size:22px">⭐</div>
                            <div style="font-size:22px;font-weight:bold;color:#88ff88">${xp}</div>
                            <div style="font-size:10px;color:#555;letter-spacing:1px">${LABELS.get('label_experience','XP')}</div>
                        </div>
                        <div style="text-align:center;padding:10px 20px;background:rgba(200,150,50,0.08);border:1px solid #642;border-radius:8px;min-width:80px">
                            <div style="font-size:22px">💰</div>
                            <div style="font-size:22px;font-weight:bold;color:#ffcc66">${gold}</div>
                            <div style="font-size:10px;color:#555;letter-spacing:1px">GOLD</div>
                        </div>
                    </div>
                </div>

                ${lootHtml}

                <button onclick="BattleUI.dismiss()"
                    style="padding:14px 40px;background:linear-gradient(135deg,#004400,#006600);border:2px solid #00cc44;color:#fff;
                    cursor:pointer;border-radius:8px;font-family:monospace;font-size:16px;font-weight:bold;letter-spacing:1px;
                    transition:0.2s;width:100%"
                    onmouseover="this.style.background='linear-gradient(135deg,#005500,#008800)'"
                    onmouseout="this.style.background='linear-gradient(135deg,#004400,#006600)'">
                    CONTINUE →
                </button>

                <style>
                    @keyframes resultIn { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
                    @keyframes bounce  { 0%,100%{transform:translateY(0)} 40%{transform:translateY(-12px)} }
                    @keyframes glow    { from{box-shadow:0 0 8px #ff6600} to{box-shadow:0 0 22px #ffcc00} }
                </style>
            </div>`;

        } else {
            // ---- DEFEAT SCREEN ----
            const enemy    = result ? (result.enemyName || 'the enemy') : 'the enemy';
            const isPvP    = result && result.battleType === 'PVP';

            overlay.innerHTML = `
            <div style="text-align:center;max-width:440px;width:92%;animation:resultIn 0.4s ease;padding:20px 0">

                <div style="font-size:60px;margin-bottom:8px;filter:grayscale(0.2)">💀</div>
                <div style="font-size:26px;font-weight:bold;color:#cc4444;letter-spacing:2px">DEFEATED</div>
                <div style="color:#555;font-size:13px;margin:8px 0 20px">You were defeated by <b style="color:#888">${enemy}</b></div>

                <div style="background:rgba(255,50,50,0.04);border:1px solid #3a1a1a;border-radius:10px;padding:16px;margin-bottom:20px;text-align:left;font-size:12px;line-height:1.8">
                    <div style="color:#888;font-size:11px;letter-spacing:2px;margin-bottom:8px">WHAT HAPPENS NOW</div>
                    <div style="color:#666">⚡ You will respawn at your last <b style="color:#aaa">Binding Point</b></div>
                    <div style="color:#666">❤️  HP restored to <b style="color:#ff6666">20%</b> of your maximum</div>
                    ${isPvP ? '<div style="color:#666">🏆 Your opponent gains the battle record win</div>' : ''}
                    <div style="color:#444;font-size:10px;margin-top:10px">
                        Tip: Rest at an inn or activate a Binding Stone to update your respawn point.
                    </div>
                </div>

                <button onclick="BattleUI.respawnAndDismiss()"
                    style="padding:14px 40px;background:linear-gradient(135deg,#2a0000,#550000);border:2px solid #cc4444;color:#ffaaaa;
                    cursor:pointer;border-radius:8px;font-family:monospace;font-size:16px;font-weight:bold;letter-spacing:1px;
                    transition:0.2s;width:100%"
                    onmouseover="this.style.background='linear-gradient(135deg,#3a0000,#660000)'"
                    onmouseout="this.style.background='linear-gradient(135deg,#2a0000,#550000)'">
                    ✨ RESPAWN AT BINDING POINT
                </button>

                <style>
                    @keyframes resultIn { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
                </style>
            </div>`;
        }
    },

    // ── COMBATANT CARD ─────────────────────────────────────────────────
    _combatantCard(c, isMe) {
        if (!c) return '';
        const hpPct   = c.maxHp ? Math.min(100, c.hp/c.maxHp*100) : 0;
        const mpPct   = c.maxMp ? Math.min(100, c.mp/c.maxMp*100) : 0;
        const lbPct   = Math.floor(c.limitbreak || 0);
        const lbReady = lbPct >= 100;
        const dead    = c.dead || c.hp <= 0;
        const playerCol = isMe ? '#00ff66' : '#aaddff';
        const enemyCol  = '#ff6666';
        const isPlayer  = c.teamId === 'players';
        const nameCol   = isPlayer ? playerCol : enemyCol;
        const borderCol = isPlayer ? (isMe ? '#0a4' : '#246') : '#600';
        const bgCol     = isPlayer ? (isMe ? 'rgba(0,40,0,.6)' : 'rgba(0,20,40,.5)') : 'rgba(50,0,0,.6)';
        const hpColor   = isPlayer ? 'linear-gradient(90deg,#00cc00,#00ff66)' : 'linear-gradient(90deg,#ff3333,#ff6666)';
        const stanceLabel = c.stance
            ? (c.stance==='POWER'?'⚔️':c.stance==='GUARD'?'🛡️':'✨') + ' ' + c.stance
            : '';
        return `
        <div style="background:${bgCol};border:1px solid ${borderCol};padding:10px 12px;border-radius:8px;
             min-width:160px;opacity:${dead?0.4:1}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-size:13px;color:${nameCol};font-weight:bold;
                    ${dead?'text-decoration:line-through':''}">
                    ${c.name}${dead?' 💀':''}
                </span>
                <span style="font-size:11px">${BattleUI._statusIcons(c.statuses)}</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">
                <span style="font-size:9px;color:#777;width:16px">HP</span>
                <div style="flex:1;height:7px;background:#222;border-radius:4px;overflow:hidden">
                    <div style="width:${hpPct}%;height:100%;background:${hpColor};border-radius:4px;transition:width .4s"></div>
                </div>
                <span style="font-size:9px;color:${nameCol};width:52px;text-align:right">${c.hp}/${c.maxHp}</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">
                <span style="font-size:9px;color:#777;width:16px">MP</span>
                <div style="flex:1;height:5px;background:#222;border-radius:3px;overflow:hidden">
                    <div style="width:${mpPct}%;height:100%;background:linear-gradient(90deg,#3366ff,#6699ff);border-radius:3px"></div>
                </div>
                <span style="font-size:9px;color:#6699ff;width:52px;text-align:right">${c.mp}/${c.maxMp}</span>
            </div>
            ${isPlayer ? `
            <div style="display:flex;align-items:center;gap:4px">
                <span style="font-size:9px;color:#777;width:16px">LB</span>
                <div style="flex:1;height:4px;background:#222;border-radius:2px;overflow:hidden">
                    <div style="width:${lbPct}%;height:100%;background:linear-gradient(90deg,#ff6600,#ffcc00);
                        border-radius:2px;${lbReady?'animation:glow .5s infinite alternate':''}"></div>
                </div>
                <span style="font-size:9px;color:#ffcc00;width:28px;text-align:right">${lbPct}%</span>
            </div>` : ''}
            ${stanceLabel ? `<div style="font-size:9px;color:#aaa;margin-top:3px">${stanceLabel}</div>` : ''}
            ${c.charging ? `<div style="font-size:9px;color:#42A5F5;margin-top:2px">⚡ ${c.charging.skillName}</div>` : ''}
        </div>`;
    },

    // ── TURN ORDER BAR ──────────────────────────────────────────────
    _renderTurnOrder(turnOrder) {
        if (!turnOrder || !turnOrder.length) return '';
        const items = turnOrder.map((t, i) => {
            const col    = t.teamId === 'players' ? '#00ff66' : '#ff6666';
            const bg     = t.isCurrent ? 'rgba(255,204,0,.15)' : 'rgba(255,255,255,.03)';
            const border = t.isCurrent ? '1px solid #ffcc00' : '1px solid #2a2a2a';
            return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;
                padding:4px 8px;background:${bg};border:${border};border-radius:6px;min-width:50px">
                <span style="font-size:9px;color:${col};font-weight:${t.isCurrent?700:400};
                    white-space:nowrap;overflow:hidden;max-width:60px;text-overflow:ellipsis">
                    ${t.isCurrent?'▶ ':''}${t.name}
                </span>
                <span style="font-size:8px;color:#444">${t.teamId==='players'?'PLR':'ENM'}</span>
            </div>`;
        });
        return `<div style="display:flex;align-items:center;gap:4px;padding:6px 40px;
            background:rgba(0,0,0,.4);border-bottom:1px solid #222;overflow-x:auto">
            <span style="font-size:9px;color:#555;margin-right:6px;white-space:nowrap">TURN ORDER</span>
            ${items.join('<span style="color:#333;font-size:10px">→</span>')}
        </div>`;
    },

    // ── ENEMY TARGET PICKER (party battles) ────────────────────────
    _renderTargetPicker(enemyTeam, actionPayload) {
        const living = (enemyTeam || []).filter(e => !e.dead && e.hp > 0);
        if (living.length <= 1) return ''; // single target: no picker needed
        return `<div style="margin-top:8px">
            <div style="font-size:10px;color:#888;margin-bottom:4px">CHOOSE TARGET:</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${living.map(e => `
                    <button onclick="BattleUI.sendAction({...${JSON.stringify(actionPayload)}, targetId:${e.charId}})"
                        style="background:rgba(255,50,50,.1);border:1px solid #600;color:#ff8888;
                        padding:4px 10px;border-radius:4px;cursor:pointer;font-family:monospace;font-size:11px">
                        ${e.name} (${e.hp}/${e.maxHp})
                    </button>`).join('')}
            </div>
        </div>`;
    },

    // ── GRID STATE for move mode ───────────────────────────────────
    _moveMode: false,   // true when player clicked Move button

    // ── RENDER TACTICAL GRID ───────────────────────────────────────
    // TEACHING: The grid is pure HTML — a CSS grid of divs.
    // Each cell knows its (x,y). Clicking a cell either:
    //   - Moves the actor there (if move mode is on)
    //   - Targets that enemy (if an action is queued)
    // Combatants are overlaid using absolute positioning on top.
    _renderGrid(grid, isMyTurn, hasMoved, moveRange, myCharId, pendingAction, terrainMap={}) {
        if (!grid) return '<div style="color:#444;text-align:center;padding:40px">Loading grid...</div>';
        const { width, height, tokens } = grid;
        const CELL = 58; // px per cell
        const W = width * CELL;
        const H = height * CELL;

        // Build a lookup: (x,y) -> token
        const tokenMap = {};
        for (const t of (tokens || [])) {
            tokenMap[`${t.gridX},${t.gridY}`] = t;
        }

        // Build cells
        let cells = '';
        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                const token = tokenMap[`${col},${row}`];
                const isPlayer = col < 3;
                const isEnemy  = col >= width - 3;
                // TEACHING: Terrain tints override the base team-side tint.
                // This gives the player a visual cue about where cover/high-ground is.
                const terrainType = (terrainMap || {})[`${col},${row}`];
                const terrainTint = {
                    forest:      'rgba(0,100,0,.35)',
                    high_ground: 'rgba(80,60,0,.35)',
                    water:       'rgba(0,60,140,.35)',
                    cover:       'rgba(60,60,60,.45)',
                    fire:        'rgba(180,40,0,.45)',
                }[terrainType] || null;
                const terrainIcon = {
                    forest: '🌲', high_ground: '⛰️', water: '🌊', cover: '🧱', fire: '🔥'
                }[terrainType] || '';
                const bg = terrainTint || (isPlayer ? 'rgba(0,80,0,.15)' : isEnemy ? 'rgba(80,0,0,.15)' : 'rgba(255,255,255,.03)');

                // Highlight reachable cells when in move mode
                let highlight = '';
                if (BattleUI._moveMode && isMyTurn && !hasMoved && myCharId) {
                    const myToken = (tokens||[]).find(t => t.charId === myCharId);
                    if (myToken) {
                        const dist = Math.max(Math.abs(myToken.gridX - col), Math.abs(myToken.gridY - row));
                        if (dist <= moveRange && dist > 0 && !token) {
                            highlight = 'box-shadow:inset 0 0 0 2px #00cc44;background:rgba(0,150,50,.25);cursor:pointer;';
                        }
                    }
                }

                const clickHandler = BattleUI._moveMode && !hasMoved && isMyTurn && !token
                    ? `onclick="BattleUI.doMove(${col},${row})"` : '';

                cells += `<div style="width:${CELL}px;height:${CELL}px;background:${bg};
                    border:1px solid rgba(255,255,255,.06);position:relative;${highlight}" ${clickHandler}>`;

                // Grid coords (tiny, corner)
                cells += `<span style="position:absolute;top:2px;left:3px;font-size:8px;color:rgba(255,255,255,.1)">${col},${row}</span>`;
                // Terrain icon (bottom-left)
                if (terrainIcon) {
                    cells += `<span style="position:absolute;bottom:2px;left:3px;font-size:11px;opacity:.7"
                        title="${terrainType}">${terrainIcon}</span>`;
                }

                // Token
                if (token) {
                    const tCol  = token.teamId === 'players' ? '#00ff88' : '#ff5555';
                    const hpPct = token.maxHp ? Math.min(100, token.hp/token.maxHp*100) : 0;
                    const dead  = token.dead || token.hp <= 0;
                    const isMe  = token.charId === myCharId;
                    const ring  = isMe ? 'box-shadow:0 0 0 2px #ffcc00;' : '';
                    cells += `<div style="position:absolute;inset:4px;display:flex;flex-direction:column;
                        align-items:center;justify-content:center;${dead?'opacity:.35':''}">
                        <div style="width:34px;height:34px;border-radius:50%;background:${tCol};opacity:.85;
                            display:flex;align-items:center;justify-content:center;font-size:16px;${ring}
                            ${BattleUI._moveMode||!isMyTurn||token.teamId==='players'?'':'cursor:pointer;'}
                            ${dead?'filter:grayscale(1)':''}"
                            onclick="BattleUI.onTokenClick(${token.charId},${col},${row})"
                            title="${token.name} HP:${token.hp}/${token.maxHp}">
                            ${dead ? '💀' : token.teamId==='players' ? '🧙' : '👹'}
                        </div>
                        <div style="width:36px;height:3px;background:#222;border-radius:2px;margin-top:2px">
                            <div style="width:${hpPct}%;height:100%;background:${tCol};border-radius:2px"></div>
                        </div>
                        <div style="font-size:7px;color:${tCol};margin-top:1px;max-width:50px;
                            overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${token.name}</div>
                    </div>`;
                }
                cells += '</div>';
            }
        }

        return `<div style="display:grid;grid-template-columns:repeat(${width},${CELL}px);
            grid-template-rows:repeat(${height},${CELL}px);
            border:2px solid #333;border-radius:4px;overflow:hidden;position:relative">
            ${cells}
        </div>`;
    },

    doMove(x, y) {
        if (!BattleUI.state || !BattleUI.state.isMyTurn) return;
        Game.socket.emit('battle_move', { battleId: BattleUI.state.battleId, x, y });
        BattleUI._moveMode = false;
        BattleUI.state.hasMoved = true;
        BattleUI.render();
    },

    onTokenClick(charId, x, y) {
        if (!BattleUI.state || !BattleUI.state.isMyTurn) return;
        // If clicking an enemy: send attack targeting that enemy
        const token = (BattleUI.state.grid?.tokens||[]).find(t => t.charId === charId);
        if (!token) return;
        if (token.teamId === 'enemies') {
            BattleUI.sendAction({ commandId: 1, targetId: charId });
        }
    },

    // ── MAIN RENDER ────────────────────────────────────────────────
    render() {
        const s = BattleUI.state;
        if (!s) return;

        const me        = s.me;
        const isMyTurn  = s.isMyTurn;
        const hasMoved  = s.hasMoved || false;
        const moveRange = s.moveRange || 2;
        const myCharId  = me ? me.charId : null;

        let overlay = document.getElementById('battleOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'battleOverlay';
            overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;z-index:150;
                background:rgba(0,0,0,0.9);display:flex;flex-direction:column;
                font-family:'Courier New',monospace;color:#fff;overflow:hidden`;
            document.body.appendChild(overlay);
        }

        const turnActorName = (() => {
            if (!s.turnCharId) return '';
            const all = [...(s.playerTeam||[]), ...(s.enemyTeam||[])];
            return (all.find(c => c && c.charId === s.turnCharId)||{}).name || '';
        })();

        // ── Compact ally stat strip ──
        const allyStrip = (s.playerTeam || (me ? [me] : [])).map(p => {
            if (!p) return '';
            const hp = p.maxHp ? Math.min(100, p.hp/p.maxHp*100) : 0;
            const lb = Math.floor(p.limitbreak||0);
            const isActor = p.charId === s.turnCharId;
            return `<div style="background:${isActor?'rgba(0,60,0,.8)':'rgba(0,30,0,.5)'};
                border:1px solid ${isActor?'#0a0':'#030'};padding:6px 10px;border-radius:6px;min-width:130px">
                <div style="font-size:11px;color:#00ff88;font-weight:${isActor?700:400}">${isActor?'▶ ':''}${p.name||''}</div>
                <div style="display:flex;align-items:center;gap:4px;margin-top:3px">
                    <span style="font-size:8px;color:#666;width:12px">HP</span>
                    <div style="flex:1;height:5px;background:#1a1a1a;border-radius:3px;overflow:hidden">
                        <div style="width:${hp}%;height:100%;background:linear-gradient(90deg,#008800,#00ff66);border-radius:3px"></div>
                    </div>
                    <span style="font-size:8px;color:#00ff66">${p.hp}/${p.maxHp}</span>
                </div>
                <div style="display:flex;align-items:center;gap:4px;margin-top:2px">
                    <span style="font-size:8px;color:#666;width:12px">LB</span>
                    <div style="flex:1;height:3px;background:#1a1a1a;border-radius:2px;overflow:hidden">
                        <div style="width:${lb}%;height:100%;background:linear-gradient(90deg,#ff6600,#ffcc00)"></div>
                    </div>
                    <span style="font-size:8px;color:#ffcc00">${lb}%</span>
                </div>
            </div>`;
        }).join('');

        // ── Compact enemy strip ──
        const enemyStrip = (s.enemyTeam || (s.opponent ? [s.opponent] : [])).map(e => {
            if (!e) return '';
            const hp = e.maxHp ? Math.min(100, e.hp/e.maxHp*100) : 0;
            const isActor = e.charId === s.turnCharId;
            const dead = e.dead || e.hp <= 0;
            return `<div style="background:${isActor?'rgba(60,0,0,.8)':'rgba(30,0,0,.5)'};
                border:1px solid ${isActor?'#a00':'#300'};padding:6px 10px;border-radius:6px;min-width:130px;
                opacity:${dead?'.4':'1'}">
                <div style="font-size:11px;color:#ff6666;font-weight:${isActor?700:400}">${isActor?'▶ ':''}${e.name||''}${dead?' 💀':''}</div>
                <div style="display:flex;align-items:center;gap:4px;margin-top:3px">
                    <span style="font-size:8px;color:#666;width:12px">HP</span>
                    <div style="flex:1;height:5px;background:#1a1a1a;border-radius:3px;overflow:hidden">
                        <div style="width:${hp}%;height:100%;background:linear-gradient(90deg,#880000,#ff4444);border-radius:3px"></div>
                    </div>
                    <span style="font-size:8px;color:#ff6666">${e.hp}/${e.maxHp}</span>
                </div>
            </div>`;
        }).join('');

        overlay.innerHTML = `
        <!-- TURN ORDER BAR -->
        ${BattleUI._renderTurnOrder(s.turnOrder)}

        <!-- MAIN AREA: grid center, stat strips flanking -->
        <div style="flex:1;display:flex;gap:10px;padding:10px 14px;overflow:hidden;align-items:center">

            <!-- LEFT: player stat strip -->
            <div style="display:flex;flex-direction:column;gap:6px;min-width:140px">
                <div style="font-size:9px;color:#444;letter-spacing:1px;margin-bottom:2px">PARTY</div>
                ${allyStrip}
                <!-- Move range info -->
                ${isMyTurn && !hasMoved
                    ? `<div style="font-size:9px;color:#444;margin-top:4px">📍 Move range: ${moveRange} tiles</div>`
                    : isMyTurn && hasMoved
                    ? `<div style="font-size:9px;color:#333;margin-top:4px">✅ Moved</div>`
                    : ''}
            </div>

            <!-- CENTER: tactical grid -->
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">
                <div style="font-size:10px;color:${isMyTurn?'#00ff66':'#888'};font-weight:bold;letter-spacing:2px">
                    ${isMyTurn ? '▶ YOUR TURN' : turnActorName ? turnActorName + "'s turn..." : '⏳ WAITING...'}
                    <span style="color:#444;font-size:9px;margin-left:8px">Turn ${s.turn}</span>
                </div>
                <div style="overflow:auto;max-height:340px">
                    ${BattleUI._renderGrid(s.grid, isMyTurn, hasMoved, moveRange, myCharId, null, s.terrainMap||{})}
                </div>
                <!-- GRID LEGEND -->
                <div style="display:flex;gap:14px;font-size:9px;color:#444">
                    <span>🟢 = players</span>
                    <span>🔴 = enemies</span>
                    <span>🟡 ring = you</span>
                    <span>Click enemy to attack</span>
                </div>
            </div>

            <!-- RIGHT: enemy stat strip -->
            <div style="display:flex;flex-direction:column;gap:6px;min-width:140px;align-items:flex-end">
                <div style="font-size:9px;color:#444;letter-spacing:1px;margin-bottom:2px">ENEMIES</div>
                ${enemyStrip}
            </div>
        </div>

        <!-- BOTTOM: command menu + log -->
        <div style="padding:0 14px 12px;display:flex;gap:10px;max-height:180px">

            <!-- MOVE button (only when it's my turn and haven't moved) -->
            ${isMyTurn ? `
            <button onclick="BattleUI._moveMode=!BattleUI._moveMode;BattleUI.render()"
                style="padding:8px 14px;background:${BattleUI._moveMode?'rgba(0,200,80,.25)':'rgba(0,80,0,.3)'};
                border:1px solid ${BattleUI._moveMode?'#00cc44':'#060'};color:${BattleUI._moveMode?'#00ff66':'#0a0'};
                border-radius:6px;cursor:pointer;font-family:monospace;font-size:12px;white-space:nowrap;
                ${hasMoved?'opacity:.4;pointer-events:none;':''}"
                ${hasMoved?'disabled':''}>
                🚶 ${BattleUI._moveMode ? 'CANCEL' : 'MOVE'}<br>
                <span style="font-size:9px">${hasMoved?'done':'click grid'}</span>
            </button>` : ''}

            <!-- Command Menu -->
            <div style="flex:1;background:rgba(0,0,0,.7);border:1px solid #2a2a2a;
                padding:10px;border-radius:8px;overflow-y:auto">
                ${me && me.charging
                    ? `<div style="text-align:center;padding:8px">
                        <div style="font-size:16px">⚡</div>
                        <div style="color:#42A5F5;font-weight:700;font-size:12px">CHARGING: ${me.charging.skillName}</div>
                        <div style="font-size:9px;color:#484f58">${me.charging.turnsLeft>0?me.charging.turnsLeft+' turn(s) left':'Fires next turn!'}</div>
                       </div>`
                    : isMyTurn && !BattleUI._moveMode ? BattleUI._renderMenu()
                    : BattleUI._moveMode ? '<div style="color:#00cc44;text-align:center;padding:8px;font-size:11px">🚶 Click a highlighted cell to move</div>'
                    : '<div style="text-align:center;color:#444;padding:8px;font-size:11px">Waiting...</div>'}
            </div>

            <!-- Combat Log -->
            <div style="width:180px;background:rgba(0,0,0,.4);border:1px solid #1a1a1a;
                padding:8px;border-radius:8px;overflow-y:auto;font-size:9px">
                <div style="color:#444;margin-bottom:3px;letter-spacing:1px">LOG</div>
                ${(s.log||[]).slice(-12).map(l =>
                    `<div style="color:#777;margin:1px 0;border-bottom:1px solid #111;padding:1px 0">
                        ${l.text||l.action||''}</div>`
                ).join('')}
            </div>
        </div>

        <style>
            @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
            @keyframes glow  { from{box-shadow:0 0 3px #ffcc00} to{box-shadow:0 0 10px #ff6600} }
        </style>`;
    },

    // --- RENDER COMMAND MENU ---
    _renderMenu() {
        const cmds = BattleUI.commands;
        if (!cmds) return '';

        if (BattleUI.currentMenu === 'skills') {
            return BattleUI._renderSkillMenu(cmds.skills);
        }
        if (BattleUI.currentMenu === 'items') {
            return BattleUI._renderItemMenu(cmds.items);
        }
        if (BattleUI.currentMenu === 'limits') {
            return BattleUI._renderLimitMenu(cmds.limits);
        }

        // Main command buttons
        let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
        for (const cmd of cmds.commands) {
            const isMenu = cmd.name === LABELS.get('label_skills_menu','Skills') || cmd.name === 'Skills' || cmd.name === LABELS.get('label_items_menu','Items') || cmd.name === 'Items';
            const onclick = isMenu
                ? `BattleUI.currentMenu='${cmd.name.toLowerCase()}';BattleUI.render()`
                : `BattleUI.sendAction({commandId:${cmd.id}})`;
            html += `<button onclick="${onclick}" ${cmd.disabled ? 'disabled' : ''}
                style="padding:12px;background:${cmd.disabled?'#222':'#1a1a1a'};border:1px solid ${cmd.disabled?'#333':'#555'};
                color:${cmd.disabled?'#555':'#fff'};cursor:${cmd.disabled?'not-allowed':'pointer'};border-radius:6px;
                font-family:monospace;font-size:14px;text-align:left;transition:0.2s"
                onmouseover="this.style.background='${cmd.disabled?'#222':'#333'}'" onmouseout="this.style.background='${cmd.disabled?'#222':'#1a1a1a'}'">
                ${cmd.icon} ${cmd.name}
            </button>`;
        }

        // Limit break button (if bar is full)
        const s = BattleUI.state;
        if (s && s.me.limitbreak >= 100 && cmds.limits && cmds.limits.length) {
            html += `<button onclick="BattleUI.currentMenu='limits';BattleUI.render()"
                style="padding:12px;background:#330000;border:2px solid #ff6600;color:#ffcc00;cursor:pointer;
                border-radius:6px;font-family:monospace;font-size:14px;text-align:left;animation:glow 0.5s infinite alternate">
                💥 LIMIT BREAK
            </button>`;
        }

        html += '</div>';
        return html;
    },

    _renderSkillMenu(skills) {
        if (!skills || !skills.length) return '<p style="color:#666">No skills learned yet.</p>' + BattleUI._backBtn();
        let html = '<div style="font-size:12px;color:#888;margin-bottom:8px">SKILLS</div><div style="display:grid;gap:5px">';
        const me = BattleUI.state.me;
        for (const sk of skills) {
            const canUse    = me.mp >= sk.mpCost;
            const isCombo   = sk.comboReady;
            const multiHit  = sk.hits && sk.hits > 1;
            const isCharge  = sk.chargeTurns > 0;
            const borderCol = isCombo ? '#ffaa00' : canUse ? '#4466aa' : '#333';
            const bgCol     = isCombo ? 'rgba(255,170,0,0.12)' : canUse ? '#1a1a2a' : '#1a1a1a';
            const textCol   = isCombo ? '#ffcc44' : canUse ? '#aaccff' : '#555';
            html += `<button onclick="BattleUI.sendAction({skillId:${sk.id}})" ${canUse?'':'disabled'}
                style="padding:8px 12px;background:${bgCol};border:1px solid ${borderCol};
                color:${textCol};cursor:${canUse?'pointer':'not-allowed'};border-radius:4px;
                font-family:monospace;font-size:12px;text-align:left;position:relative">
                <div style="display:flex;align-items:center;gap:6px">
                    <span>${sk.icon}</span>
                    <span style="flex:1">${sk.name}</span>
                    <span style="font-size:10px;color:${canUse?'#6699ff':'#444'}">${sk.mpCost} MP</span>
                </div>
                ${isCombo ? `<div style="font-size:9px;color:#ffaa00;margin-top:2px">🔥 COMBO READY — ${sk.comboLabel||''}</div>` : ''}
                ${multiHit ? `<div style="font-size:9px;color:#bb86fc;margin-top:2px">✖️ ${sk.hits} HITS</div>` : ''}
                ${isCharge ? `<div style="font-size:9px;color:#42A5F5;margin-top:2px">⚡ CHARGE (${sk.chargeTurns}t wind-up)</div>` : ''}
            </button>`;
        }
        html += '</div>' + BattleUI._backBtn();
        return html;
    },

    _renderItemMenu(items) {
        if (!items || !items.length) return '<p style="color:#666">No usable items.</p>' + BattleUI._backBtn();
        let html = '<div style="font-size:12px;color:#888;margin-bottom:8px">ITEMS</div><div style="display:grid;gap:6px">';
        for (const it of items) {
            html += `<button onclick="BattleUI.sendAction({itemId:${it.id}})"
                style="padding:8px 12px;background:#1a1a1a;border:1px solid #555;color:#fff;cursor:pointer;
                border-radius:4px;font-family:monospace;font-size:12px;text-align:left">
                ${it.icon} ${it.name} <span style="float:right;color:#888">x${it.quantity}</span>
            </button>`;
        }
        html += '</div>' + BattleUI._backBtn();
        return html;
    },

    _renderLimitMenu(limits) {
        if (!limits || !limits.length) return '<p style="color:#666">No limit breaks available.</p>' + BattleUI._backBtn();
        let html = '<div style="font-size:12px;color:#ffcc00;margin-bottom:8px">💥 LIMIT BREAKS</div><div style="display:grid;gap:6px">';
        for (const lb of limits) {
            html += `<button onclick="BattleUI.sendAction({limitId:${lb.id}})"
                style="padding:10px 12px;background:#330000;border:2px solid #ff6600;color:#ffcc00;cursor:pointer;
                border-radius:4px;font-family:monospace;font-size:13px;text-align:left">
                ${lb.icon} ${lb.name} <span style="float:right;font-size:10px;color:#ff8800">Lv${lb.breakLevel}</span>
            </button>`;
        }
        html += '</div>' + BattleUI._backBtn();
        return html;
    },

    _backBtn() {
        return `<button onclick="BattleUI.currentMenu='main';BattleUI.render()"
            style="margin-top:8px;padding:6px;background:#222;border:1px solid #444;color:#888;cursor:pointer;
            border-radius:4px;font-family:monospace;font-size:11px;width:100%">← BACK</button>`;
    },

    _statusIcons(statuses) {
        if (!statuses || !statuses.length) return '';
        return statuses.map(s => `<span title="${s.name} (${s.turns}t)">${s.icon||'⚡'}</span>`).join(' ');
    },

    // --- SEND ACTION TO SERVER ---
    sendAction(action) {
        if (!BattleUI.state || !BattleUI.state.isMyTurn) return;
        Game.socket.emit('battle_action', {
            battleId: BattleUI.state.battleId,
            ...action
        });
        // Disable menu until server responds
        BattleUI.state.isMyTurn = false;
        BattleUI.render();
    }
};
