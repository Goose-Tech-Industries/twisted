// =================================================================
// ENGINE-NPC — NPC socket events, emote bubbles, chatter queue
// Split from game_engine.js — loaded via <script> tag
// =================================================================
window.EngineNpc = {
    init(socket, Game) {

        // --- NPC LIST ---
        // Server sends this on map join and after each NPC tick where something moved.
        socket.on('npc_list', (list) => {
            Game.npcs = {};
            (list || []).forEach(n => { Game.npcs[n.id] = n; });
        });

        // --- NPC POSITION (single update) ---
        socket.on('npc_position', (n) => {
            if (n && n.id) Game.npcs[n.id] = n;
        });

        // --- NPC NEED BUBBLE ---
        // Server tells us a nearby NPC needs help. Show a clickable bubble.
        socket.on('npc_need', ({ npcId, npcName, text }) => {
            // Remove any existing need bubble so they don't pile up
            document.querySelectorAll('.npc-need-bubble').forEach(e => e.remove());

            const el = document.createElement('div');
            el.className = 'npc-need-bubble';
            el.style.cssText = [
                'position:fixed','right:16px','bottom:80px',
                'background:rgba(5,8,14,0.92)','border:1px solid #ffcc44',
                'border-radius:10px','padding:10px 14px','max-width:260px',
                'z-index:26','font-size:12px','cursor:pointer',
                'animation:chatterIn 0.3s ease'
            ].join(';');
            el.innerHTML = `<div style="color:#ffcc44;font-weight:700;margin-bottom:4px">💬 ${npcName}</div>`
                + `<div style="color:#ccc">${text}</div>`
                + `<div style="color:#88ff88;margin-top:6px;font-size:11px">Click to help ›</div>`;
            el.onclick = () => {
                socket.emit('accept_npc_need', { npcId });
                el.remove();
            };
            document.body.appendChild(el);
            setTimeout(() => {
                el.style.transition = 'opacity 0.6s'; el.style.opacity = '0';
                setTimeout(() => el.remove(), 600);
            }, 15000);
        });

        // Confirmation when need is resolved
        socket.on('npc_need_resolved', ({ npcName, reward_gold, reward_xp, message }) => {
            EngineNpc.showChatter(npcName, `${message}${reward_gold ? ` (+${reward_gold}g)` : ''}${reward_xp ? ` (+${reward_xp}xp)` : ''}`);
        });

        // --- CROWD REACTION ---
        // Server sends this when a player enters a map with notable reputation.
        socket.on('crowd_reaction', ({ tier, text }) => {
            const el = document.createElement('div');
            const color = tier === 'celebrated' ? '#ffd700'
                        : tier === 'friendly'   ? '#88ff88'
                        : tier === 'hostile'    ? '#ff6666'
                        :                        '#ffaa44';  // wary
            el.style.cssText = [
                'position:fixed', 'left:50%', 'top:50%',
                'transform:translate(-50%,-50%)',
                `color:${color}`,
                'font-size:15px', 'font-style:italic',
                'text-align:center', 'max-width:480px',
                'text-shadow:0 0 12px rgba(0,0,0,0.9)',
                'z-index:28', 'pointer-events:none',
                'animation:crowdIn 0.6s ease',
                'font-family:Georgia,serif',
                'letter-spacing:0.5px'
            ].join(';');
            el.textContent = text;
            document.body.appendChild(el);
            setTimeout(() => {
                el.style.transition = 'opacity 1s';
                el.style.opacity = '0';
                setTimeout(() => el.remove(), 1000);
            }, 3000);
        });

        // --- NPC CHATTER ---
        // Ambient dialogue between NPCs nearby.
        socket.on('npc_chatter', ({ speaker, text }) => {
            EngineNpc.showChatter(speaker, text);
        });

        // Blood Ogham drop notification
        socket.on('ogham_drop', ({ name, icon, description, lore_text }) => {
            const systemName = LABELS.get('label_ogham_system', 'Blood Ogham');
            const existing = document.getElementById('ogham_drop_popup');
            if (existing) existing.remove();

            const popup = document.createElement('div');
            popup.id = 'ogham_drop_popup';
            popup.style.cssText = `
                position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
                background:linear-gradient(135deg,#1a0505,#2a0808);
                border:2px solid #c0392b; border-radius:12px; padding:16px 20px;
                max-width:360px; z-index:9999; animation:oghamFadeIn 0.4s ease;
                box-shadow:0 0 30px rgba(192,57,43,0.4), 0 4px 20px rgba(0,0,0,0.8);
                font-family:'Courier New',monospace; color:#e8eef6;
            `;
            popup.innerHTML = `
                <div style="color:#c0392b;font-size:10px;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">
                    🩸 ${systemName} Discovered
                </div>
                <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px">
                    <span style="font-size:32px">${icon||'🩸'}</span>
                    <div>
                        <div style="font-weight:700;font-size:16px;color:#e74c3c">${name}</div>
                        <div style="font-size:11px;color:#aaa">${description||''}</div>
                    </div>
                </div>
                ${lore_text ? `<div style="font-style:italic;color:#888;font-size:11px;
                    border-left:2px solid #3a0a0a;padding:6px 10px;margin-bottom:10px">${lore_text}</div>` : ''}
                <div style="font-size:10px;color:#666;text-align:center">Carved into your weapon's Ogham Groove</div>
            `;

            if (!document.getElementById('ogham_anim_style')) {
                const style = document.createElement('style');
                style.id = 'ogham_anim_style';
                style.textContent = `@keyframes oghamFadeIn { from { opacity:0; transform:translateX(-50%) translateY(20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;
                document.head.appendChild(style);
            }

            document.body.appendChild(popup);
            setTimeout(() => { if (popup.parentNode) popup.remove(); }, 6000);
        });

        // --- ENVIRONMENTAL REACTION (low HP healer hint) ---
        socket.on('environmental_reaction', ({ type, text, npcName }) => {
            if (type !== 'low_hp') return;
            const el = document.createElement('div');
            el.style.cssText = [
                'position:fixed','bottom:80px','left:50%','transform:translateX(-50%)',
                'background:rgba(20,0,0,0.85)','border:1px solid #ff4444',
                'color:#ff9999','padding:8px 18px','border-radius:8px',
                'font-size:12px','z-index:27','pointer-events:none',
                'animation:chatterIn 0.3s ease','max-width:400px','text-align:center'
            ].join(';');
            el.textContent = text;
            document.body.appendChild(el);
            setTimeout(() => { el.style.transition='opacity 0.8s'; el.style.opacity='0';
                setTimeout(() => el.remove(), 800); }, 4000);
        });

        // --- EMOTE BUBBLE ---
        socket.on('emote_bubble', ({ charId, text }) => {
            if (!Game.players[charId] || !Game.canvas) return;
            const p     = Game.players[charId];
            const tileW = Game.tileW || 32;
            const tileH = Game.tileH || 32;
            const cX    = (p.x * tileW) - (Game.camera ? Game.camera.x : 0) + tileW / 2;
            const cY    = (p.y * tileH) - (Game.camera ? Game.camera.y : 0) - 8;

            const bub = document.createElement('div');
            bub.style.cssText = [
                'position:fixed',
                `left:${cX}px`, `top:${cY}px`,
                'transform:translate(-50%,-100%)',
                'background:rgba(5,8,14,0.88)',
                'border:1px solid rgba(187,134,252,0.4)',
                'color:#bb86fc', 'font-size:11px',
                'padding:4px 10px', 'border-radius:8px',
                'white-space:nowrap', 'max-width:200px', 'overflow:hidden',
                'text-overflow:ellipsis', 'z-index:45', 'pointer-events:none',
                'font-family:"Courier New",monospace',
                'animation:chatterIn 0.3s ease',
            ].join(';');
            bub.textContent = text;
            document.body.appendChild(bub);
            setTimeout(() => { bub.style.transition = 'opacity 0.5s'; bub.style.opacity = '0'; }, 2200);
            setTimeout(() => bub.remove(), 2700);
        });

        // --- PRESENCE CHANGED ---
        socket.on('player_presence_changed', ({ charId, presence, awayMessage }) => {
            if (Game.players[charId]) {
                Game.players[charId].presence    = presence;
                Game.players[charId].awayMessage = awayMessage || null;
            }
            if (typeof NearbyUI !== 'undefined' && NearbyUI.open) NearbyUI.refresh();
        });

        // --- Player appearance update ---
        socket.on('player_appearance', ({ charId, appearance }) => {
            if (Game.players) {
                const p = Object.values(Game.players).find(pl => pl.charId === charId);
                if (p) p.appearance = appearance;
            }
        });
    },

    // --- CHATTER QUEUE ---
    _queue: [],
    _active: false,

    showChatter(speaker, text) {
        EngineNpc._queue.push({ speaker, text });
        if (!EngineNpc._active) EngineNpc._drainQueue();
    },

    _drainQueue() {
        if (!EngineNpc._queue.length) { EngineNpc._active = false; return; }
        EngineNpc._active = true;
        const { speaker, text } = EngineNpc._queue.shift();

        const el = document.createElement('div');
        el.className = 'npc-chatter-bubble';
        el.innerHTML = `<span style="color:#bb86fc;font-weight:700">${speaker}:</span> <span style="color:#ccc">${text}</span>`;
        el.style.cssText = [
            'position:fixed', 'left:50%', 'transform:translateX(-50%)',
            'top:12px', 'background:rgba(5,8,14,0.88)',
            'border:1px solid rgba(187,134,252,0.25)', 'border-radius:10px',
            'padding:8px 16px', 'font-size:12px', 'z-index:25',
            'max-width:420px', 'text-align:center',
            'animation:chatterIn 0.3s ease', 'pointer-events:none'
        ].join(';');
        document.body.appendChild(el);

        setTimeout(() => {
            el.style.transition = 'opacity 0.5s';
            el.style.opacity    = '0';
            setTimeout(() => {
                el.remove();
                setTimeout(EngineNpc._drainQueue, 400);
            }, 500);
        }, 3500);
    }
};
