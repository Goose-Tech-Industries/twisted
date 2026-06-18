// =================================================================
// ENGINE-EVENTS — Event queue, dialogue, choices, notifications,
//                 screen effects, HP/MP bars, quest tracker
// Split from game_engine.js — loaded via <script> tag
// =================================================================
window.EngineEvents = {
    init(socket, Game) {
        // Stash references so module methods can use them
        EngineEvents._socket = socket;
        EngineEvents._Game   = Game;

        // --- EVENT QUEUE PLAYER ---
        socket.on('event_queue', (queue) => {
            if (!queue || !Array.isArray(queue)) return;
            EngineEvents.playEventQueue([...queue]);
        });

        // --- NPC DIALOGUE ---
        socket.on('npc_reply', (payload) => {
            EngineEvents.openDialogue(payload.npcName, payload.text);
            const inputRow = document.getElementById('npcInputRow');
            const inputEl  = document.getElementById('npcInput');
            if (inputRow) inputRow.style.display = 'block';
            if (inputEl)  { inputEl.focus(); }
        });

        // --- BATTLE SOCKET HANDLERS ---
        socket.on('battle_start', (data) => BattleUI.start(data));
        socket.on('battle_update', (data) => {
            if (data.forCharId && data.forCharId !== Game.myCharId) return;
            BattleUI.update(data);
        });
        socket.on('battle_error', (msg) => EngineEvents.showNotification('⚠️ ' + msg, 'damage'));
        socket.on('battle_challenged', (data) => {
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
            document.getElementById('pvpChallengeToast')?.remove();
            document.body.appendChild(n);
            setTimeout(() => n.remove(), 20000);
        });

        // Random encounters
        socket.on('trigger_pve_battle', (data) => {
            EngineEvents.showNotification('⚔️ Battle starting!', 'battle');
            socket.emit('start_pve_battle', { enemyCharId: data.npcId });
        });

        // Battle results
        socket.on('battle_result', function(data) { if(typeof BattleUI!=='undefined') BattleUI.pendingResult=data; });
        socket.on('battle_grid_update', function(data) {
            if (typeof BattleUI === 'undefined' || !BattleUI.active) return;
            if (data.grid)     BattleUI.state.grid     = data.grid;
            if (data.hasMoved !== undefined) BattleUI.state.hasMoved = data.hasMoved;
            if (data.log)      data.log.forEach((msg, i) => setTimeout(() => EngineEvents.showNotification(msg, 'battle'), i*300));
            BattleUI.render();
        });

        // 3v3 PvP challenge
        socket.on('battle_challenged_3v3', function(data) {
            const accept = confirm(data.challengerName + ' challenges you to a 3v3 battle! Accept?');
            if (accept) {
                socket.emit('battle_accept_3v3', { challengerUserId: data.challengerUserId });
            }
        });
        socket.on('battle_defeat', function(data) { if(typeof BattleUI!=='undefined') BattleUI.pendingResult=data; });

        // --- RESPAWN COMPLETE ---
        socket.on('respawn_complete', function(data) {
            EngineEvents.showNotification('✨ Respawning...', 'info');
            socket.emit('join_game', { charId: Game.myCharId });
        });

        // --- LOOT DROPS ---
        socket.on('loot_drops', function(data) {
            if (data.forCharId !== Game.myCharId) return;
            if (!data.drops || !data.drops.length) return;
            if (typeof BattleUI !== 'undefined') {
                if (!BattleUI.pendingResult) BattleUI.pendingResult = {};
                BattleUI.pendingResult.drops = data.drops;
            }
            setTimeout(function() {
                if (typeof Panels !== 'undefined' && Panels.open === 'inventory') Panels.openInventory();
                EngineEvents.loadCharData();
            }, 1500);
        });

        socket.on('random_encounter', (data) => {
            EngineEvents.showNotification(`👹 ${data.zoneName}: ${data.npcName} appears!`, 'battle');
            socket.emit('start_pve_battle', { enemyCharId: data.npcId });
        });

        // --- ARENA ZONE ---
        socket.on('arena_entered', (data) => {
            Game.inArena = data;
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
            EngineEvents.showNotification(`⚔️ Entered ${data.arenaName} — PvP enabled!`, 'battle');
            if (typeof NearbyUI !== 'undefined') NearbyUI.refresh();
        });

        socket.on('arena_left', () => {
            Game.inArena = null;
            document.getElementById('arenaBanner')?.remove();
            EngineEvents.showNotification('🛡️ Left arena zone — PvP disabled.', 'heal');
            if (typeof NearbyUI !== 'undefined') NearbyUI.refresh();
        });

        socket.on('player_arena_changed', ({ charId, inArena }) => {
            if (Game.players[charId]) {
                Game.players[charId].inArena = inArena;
                if (typeof NearbyUI !== 'undefined') NearbyUI.refresh();
            }
        });

        // --- SCHEDULER SOCKET EVENTS ---
        socket.on('server_broadcast', ({ message, color }) => {
            EngineEvents.showNotification(message, 'xp');
            if (typeof ChatUI !== 'undefined') {
                ChatUI.addMessage({ channel: 'global', sender: '📣 SERVER',
                    text: message, _color: color || '#bb86fc' });
            }
        });
        socket.on('server_xp_grant', ({ message }) => {
            EngineEvents.showNotification(message || '🌟 XP granted!', 'xp');
        });
        socket.on('shop_restocked', () => {
            EngineEvents.showNotification('🏪 Shops have been restocked!', 'xp');
        });
        socket.on('force_map_change', ({ mapId, x, y, message }) => {
            if (message) EngineEvents.showNotification(message, 'damage');
            if (socket) {
                socket.emit('join_game', { charId: Game.myCharId });
            }
        });
        socket.on('region_updated', ({ region }) => {
            if (Game.region && region && region.id === Game.region.id) {
                Game.region = region;
                if (typeof RegionHUD !== 'undefined') RegionHUD.update(region);
            }
        });
        socket.on('world_flag_changed', ({ flag, value }) => {
            console.log('[World] Flag changed:', flag, '=', value);
        });

        // GM system announces
        socket.on('server_announce', ({ message, style }) => {
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
        socket.on('world_event', ({ type, ...payload }) => {
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
        socket.on('force_disconnect', ({ reason }) => {
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;color:#f85149;font-family:monospace;text-align:center;padding:40px';
            el.innerHTML = `<div style="font-size:48px;margin-bottom:16px">🚫</div>
                <div style="font-size:20px;font-weight:700;margin-bottom:8px">Disconnected</div>
                <div style="color:#888;max-width:400px">${reason || 'You have been disconnected by the server.'}</div>`;
            document.body.appendChild(el);
            socket.disconnect();
        });
    },

    // --- EVENT QUEUE PLAYBACK ---
    playEventQueue(queue) {
        const Game   = EngineEvents._Game;
        const socket = EngineEvents._socket;
        if (queue.length === 0) return;
        const cmd = queue.shift();

        switch (cmd.cmd) {
            case 'dialogue':
                EngineEvents.openDialogue(cmd.speaker, cmd.text);
                Game._pendingQueue = queue;
                return;

            case 'choice':
                EngineEvents.showChoiceUI(cmd.prompt, cmd.options);
                Game._pendingQueue = queue;
                return;

            case 'teleport':
                socket.emit('teleport', { mapId: cmd.mapId, x: cmd.x, y: cmd.y });
                loadMap(cmd.mapId);
                EngineEvents.playEventQueue(queue);
                break;

            case 'notification':
                EngineEvents.showNotification(cmd.text, cmd.type);
                EngineEvents.playEventQueue(queue);
                break;

            case 'npc_talk_prompt': {
                const lastEv = Game.map.events.find(e => e.data === cmd.npcName && e.type === 'NPC');
                EngineEvents.openDialogue(cmd.npcName, 'Hello, traveller. What do you need?');
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
                            socket.emit('npc_talk', { x: lastEv.x, y: lastEv.y, message: msg });
                        }
                    };
                }
                EngineEvents.playEventQueue(queue);
                break;
            }

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
                return;
            }

            case 'open_shop':
                if (cmd.discount) Panels.shopDiscount = cmd.discount;
                else               delete Panels.shopDiscount;
                Panels.openShop(cmd.shopId);
                Game._pendingQueue = queue;
                return;

            case 'open_quest_board':
                if (typeof QuestBoardUI !== 'undefined') {
                    QuestBoardUI.open(Game.myCharId, Game.myHero?.mapId);
                }
                EngineEvents.playEventQueue(queue);
                break;

            case 'offer_quest':
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
                                EngineEvents.showNotification(`📜 Quest Accepted: ${cmd.questTitle}`, 'quest');
                                if (typeof QuestUI !== 'undefined') QuestUI.load();
                                EngineEvents.updateQuestTracker();
                            } else {
                                EngineEvents.showNotification(r.message || 'Could not accept quest.', 'damage');
                            }
                        } catch (e) {
                            EngineEvents.showNotification('Error accepting quest.', 'damage');
                        }
                    });
                    Game.dialogueOpen = true;
                })(cmd);
                EngineEvents.playEventQueue(queue);
                return;

            case 'start_battle':
                EngineEvents.showNotification('⚔️ Battle starting!', 'battle');
                if (cmd.enemyId) {
                    socket.emit('start_pve_battle', { enemyCharId: cmd.enemyId });
                }
                EngineEvents.playEventQueue(queue);
                break;

            case 'sound':
                EngineEvents.playEventQueue(queue);
                break;

            case 'screen_effect':
                EngineEvents.doScreenEffect(cmd.effect, cmd.duration);
                EngineEvents.playEventQueue(queue);
                break;

            case 'wait':
                setTimeout(() => EngineEvents.playEventQueue(queue), cmd.ms || 1000);
                return;

            default:
                console.warn('Unknown event cmd:', cmd.cmd);
                EngineEvents.playEventQueue(queue);
        }
    },

    // --- DIALOGUE ---
    openDialogue(name, text) {
        const Game = EngineEvents._Game;
        Game.dialogueOpen = true;
        document.getElementById('dialogueBox').style.display = 'block';
        document.getElementById('npcName').innerText = name;
        document.getElementById('npcText').innerText = text;
    },

    closeDialogue() {
        const Game = EngineEvents._Game;
        Game.dialogueOpen = false;
        document.getElementById('dialogueBox').style.display = 'none';
        var inputRow = document.getElementById('npcInputRow');
        var instrEl  = document.getElementById('npcInstructions');
        if (inputRow) inputRow.style.display = 'none';
        if (instrEl)  instrEl.style.display  = 'block';
        if (Game._pendingQueue && Game._pendingQueue.length > 0) {
            const q = Game._pendingQueue;
            Game._pendingQueue = null;
            setTimeout(() => EngineEvents.playEventQueue(q), 100);
        }
    },

    // --- CHOICE UI ---
    showChoiceUI(prompt, options) {
        const Game = EngineEvents._Game;
        Game.dialogueOpen = true;
        const box = document.getElementById('dialogueBox');
        box.style.display = 'block';
        document.getElementById('npcName').innerText = prompt || 'Choose';
        let html = '';
        options.forEach((opt, i) => {
            html += `<div onclick="EngineEvents.pickChoice(${opt.id})" style="cursor:pointer;padding:10px;margin:5px 0;
                background:#1a1a1a;border:1px solid #555;color:#ffcc00;font-size:14px;
                transition:0.2s" onmouseover="this.style.background='#333'" onmouseout="this.style.background='#1a1a1a'">
                ${i + 1}. ${opt.label}</div>`;
        });
        document.getElementById('npcText').innerHTML = html;
        document.getElementById('npcInstructions').innerText = '[CLICK AN OPTION]';
    },

    pickChoice(optionId) {
        EngineEvents.closeDialogue();
        EngineEvents._socket.emit('event_choice', { optionId });
    },

    // --- NOTIFICATION SYSTEM ---
    showNotification(text, type) {
        const colors = {
            item:           '#ffcc00',
            gold:           '#ffaa00',
            xp:             '#00ff88',
            level_up:       '#f39c12',
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
    },

    // --- SCREEN EFFECTS ---
    doScreenEffect(effect, duration) {
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
    },

    // --- CHARACTER DATA (HP/MP/XP/LB bars) ---
    async loadCharData() {
        const Game = EngineEvents._Game;
        try {
            const r = await fetch('/get-char-full', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({charId: Game.myCharId })
            });
            const j = await r.json();
            if (j.success) {
                Game.charFull = j;
                Game.charData = j.character;
                EngineEvents.updateBars(j);
                EngineEvents.updateQuestTracker();
            }
        } catch (e) { console.error('loadCharData error:', e); }
    },

    updateBars(data) {
        const Game = EngineEvents._Game;
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

        // XP bar
        const xpCur = d.xpCurrent || 0;
        const xpMax = d.xpToNext;
        if (xpMax) {
            document.getElementById('xpFill').style.width = Math.min(100, xpCur / xpMax * 100) + '%';
            document.getElementById('xpVal').innerText = xpCur + ' / ' + xpMax;
        } else {
            document.getElementById('xpFill').style.width = '100%';
            document.getElementById('xpVal').innerText = 'MAX';
        }

        // Limit Break bar
        const lb = Math.min(100, Math.max(0, parseFloat(es.limitbreak || 0)));
        document.getElementById('lbFill').style.width = lb + '%';
        document.getElementById('lbVal').innerText = Math.floor(lb) + '%';

        // Level badge
        document.getElementById('hudLevel').innerText = 'Lv. ' + c.level;

        // Gold
        if (typeof d.gold === 'number') {
            const goldEl = document.getElementById('hudGoldVal');
            if (goldEl) goldEl.innerText = d.gold.toLocaleString() + 'g';
        }
    },

    // --- MINI QUEST TRACKER ---
    updateQuestTracker() {
        const tracker = document.getElementById('questTracker');
        const body    = document.getElementById('qtBody');
        const more    = document.getElementById('qtMore');
        if (!tracker || !body) return;

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

        const extraObjs  = objKeys.length - shown.length;
        const extraQuests = keys.length - 1;
        const hints = [];
        if (extraObjs > 0)   hints.push(`+${extraObjs} more objective${extraObjs > 1 ? 's' : ''}`);
        if (extraQuests > 0) hints.push(`+${extraQuests} more quest${extraQuests > 1 ? 's' : ''}`);
        more.innerText = hints.join('  ');
    }
};

// --- GLOBAL ALIASES (backward-compatible) ---
// These are called from HTML onclick attributes and other modules.
function openDialogue(n, t)    { EngineEvents.openDialogue(n, t); }
function closeDialogue()       { EngineEvents.closeDialogue(); }
function showChoiceUI(p, o)    { EngineEvents.showChoiceUI(p, o); }
function pickChoice(id)        { EngineEvents.pickChoice(id); }
function showNotification(t,y) { EngineEvents.showNotification(t, y); }
function doScreenEffect(e, d)  { EngineEvents.doScreenEffect(e, d); }
function playEventQueue(q)     { EngineEvents.playEventQueue(q); }
function loadCharData()        { EngineEvents.loadCharData(); }
function updateBars(d)         { EngineEvents.updateBars(d); }
function updateQuestTracker()  { EngineEvents.updateQuestTracker(); }
