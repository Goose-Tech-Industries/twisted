// =================================================================
// CHAT UI — 7-Channel Messaging System
// =================================================================
// Teaching: This file handles everything visual about chat.
// The server (server.js) handles routing messages to the right
// players. We just send to the server and display what comes back.
//
// Channels:
//   global   — everyone online                 [white]
//   local    — same map only                   [green]
//   party    — party members (stub)            [blue]
//   guild    — guild members (stub)            [orange]
//   dm       — direct message to one player   [pink]
//   announce — staff broadcasts               [yellow, bold]
//   admin    — staff only                     [red]
//   system   — server messages to you alone   [gray]
//
// Hotkeys (only when chat is NOT focused):
//   [ Enter ]  — focus chat input
//   [ 1-7 ]    — quick channel switch (when not in chat input)
//
// Design: persistent panel bottom-left, collapsible, never blocks game
// =================================================================

const ChatUI = {
    // ---------------------------------------------------------------
    // STATE
    // ---------------------------------------------------------------
    collapsed: false,
    activeChannel: 'global',
    dmTarget: null,       // { charId, name } — set when sending DMs
    unread: {},           // channel -> count of unread messages
    history: {},          // channel -> [ {from, text, ts, fromCharId, targetName} ]
    isStaff: false,       // set from init_self role
    MAX_HISTORY: 100,     // messages kept per channel in memory

    // Channel config (order = tab order)
    CHANNELS: [
        { key: 'global',   label: 'Global',   color: '#e8eef6', icon: '🌐' },
        { key: 'local',    label: 'Zone',     color: '#88ff88', icon: '📍' },
        { key: 'party',    label: 'Party',    color: '#88aaff', icon: '⚔️' },
        { key: 'guild',    label: 'Guild',    color: '#ffaa44', icon: '🏰' },
        { key: 'dm',       label: 'DM',       color: '#ff88ff', icon: '✉️' },
        { key: 'announce', label: 'Announce', color: '#ffff55', icon: '📢' },
        { key: 'admin',    label: 'Admin',    color: '#ff5555', icon: '🔑', staffOnly: true },
    ],

    // ---------------------------------------------------------------
    // INIT — call once after Game is loaded
    // ---------------------------------------------------------------
    init(isStaffUser) {
        ChatUI.isStaff = !!isStaffUser;

        // Pre-populate history buckets
        ChatUI.CHANNELS.forEach(c => {
            ChatUI.history[c.key] = [];
            ChatUI.unread[c.key]  = 0;
        });
        ChatUI.history['system'] = [];

        ChatUI._buildDOM();
        ChatUI._bindSocketEvents();
        ChatUI._bindHotkeys();

        // Welcome message
        ChatUI._addMessage({
            channel: 'system',
            from: 'System',
            text: 'Chat ready! Press Enter to focus. Use tabs to switch channels.',
            ts: Date.now()
        });
    },

    // ---------------------------------------------------------------
    // DOM CONSTRUCTION
    // ---------------------------------------------------------------
    _buildDOM() {
        const panel = document.createElement('div');
        panel.id = 'chatPanel';

        // Channel tabs HTML — hide admin tab for non-staff
        const tabsHtml = ChatUI.CHANNELS
            .filter(c => !c.staffOnly || ChatUI.isStaff)
            .map(c => `
                <div class="chat-tab" id="ctab-${c.key}" data-ch="${c.key}"
                     onclick="ChatUI.switchChannel('${c.key}')"
                     title="${c.label}">
                    ${c.icon} <span class="tab-lbl">${c.label}</span>
                    <span class="chat-badge" id="cbadge-${c.key}" style="display:none">0</span>
                </div>`
            ).join('');

        panel.innerHTML = `
            <div id="chatHeader" onclick="ChatUI.toggleCollapse()">
                💬 CHAT
                <span id="chatCollapseIcon" style="float:right;opacity:0.6">▲</span>
            </div>

            <div id="chatBody">
                <!-- Tab row -->
                <div id="chatTabs">${tabsHtml}</div>

                <!-- DM target row (hidden unless DM channel active) -->
                <div id="chatDmRow" style="display:none">
                    <input id="chatDmInput" type="text" placeholder="Type name then Enter…"
                           title="Type the player's character name to start a DM" />
                    <span id="chatDmLabel" style="color:#ff88ff;font-size:11px;padding-left:6px"></span>
                </div>

                <!-- Message list -->
                <div id="chatMessages"></div>

                <!-- Input row -->
                <div id="chatTypingRow" style="height:14px;padding:0 8px;font-size:10px;color:#484f58;font-style:italic;font-family:'Courier New',monospace;line-height:14px"></div>
                <div id="chatInputRow">
                    <input id="chatInput" type="text" maxlength="300"
                           placeholder="Press Enter to chat…" autocomplete="off" />
                    <button id="chatSendBtn" onclick="ChatUI.send()">▶</button>
                </div>
            </div>`;

        document.body.appendChild(panel);
        ChatUI._injectStyles();
        ChatUI._applyTabActive();
        ChatUI._bindInputKeys();
    },

    _injectStyles() {
        const s = document.createElement('style');
        s.textContent = `
        #chatPanel {
            position: fixed;
            bottom: 10px;
            left: 10px;
            width: 340px;
            background: rgba(5, 8, 14, 0.88);
            border: 1px solid rgba(255,255,255,0.13);
            border-radius: 10px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            z-index: 50;
            user-select: none;
        }
        #chatHeader {
            padding: 7px 12px;
            color: #bb86fc;
            font-weight: bold;
            font-size: 12px;
            cursor: pointer;
            border-bottom: 1px solid rgba(255,255,255,0.07);
            letter-spacing: 1px;
        }
        #chatHeader:hover { background: rgba(255,255,255,0.03); border-radius: 10px 10px 0 0; }
        #chatBody { display: flex; flex-direction: column; }
        #chatTabs {
            display: flex;
            gap: 2px;
            padding: 5px 6px 0;
            overflow-x: auto;
            scrollbar-width: none;
        }
        #chatTabs::-webkit-scrollbar { display: none; }
        .chat-tab {
            padding: 4px 8px;
            border-radius: 6px 6px 0 0;
            cursor: pointer;
            font-size: 11px;
            color: #666;
            border: 1px solid transparent;
            border-bottom: none;
            white-space: nowrap;
            position: relative;
            transition: 0.15s;
        }
        .chat-tab:hover { color: #aaa; background: rgba(255,255,255,0.04); }
        .chat-tab.active { color: #e8eef6; background: rgba(255,255,255,0.07); border-color: rgba(255,255,255,0.1); }
        .tab-lbl { display: none; }
        .chat-tab.active .tab-lbl { display: inline; }
        .chat-badge {
            position: absolute;
            top: 0; right: 0;
            background: #f85149;
            color: #fff;
            border-radius: 8px;
            font-size: 9px;
            padding: 0 3px;
            min-width: 14px;
            text-align: center;
        }
        #chatDmRow {
            display: flex;
            align-items: center;
            padding: 4px 8px;
            background: rgba(255,136,255,0.05);
            border-bottom: 1px solid rgba(255,136,255,0.1);
        }
        #chatDmInput {
            flex: 1;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,136,255,0.3);
            color: #ff88ff;
            padding: 3px 6px;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            border-radius: 4px;
            outline: none;
        }
        #chatMessages {
            height: 180px;
            overflow-y: auto;
            padding: 6px 10px;
            display: flex;
            flex-direction: column;
            gap: 3px;
            scrollbar-width: thin;
            scrollbar-color: rgba(255,255,255,0.1) transparent;
        }
        .chat-line { line-height: 1.4; word-break: break-word; }
        .chat-ts { color: #444; font-size: 10px; }
        .chat-name { font-weight: bold; cursor: pointer; }
        .chat-name:hover { text-decoration: underline; }
        #chatInputRow {
            display: flex;
            gap: 6px;
            padding: 6px 8px;
            border-top: 1px solid rgba(255,255,255,0.07);
        }
        #chatInput {
            flex: 1;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.12);
            color: #e8eef6;
            padding: 5px 8px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            border-radius: 6px;
            outline: none;
            transition: border 0.15s;
            user-select: text;
        }
        #chatInput:focus { border-color: #bb86fc; }
        #chatSendBtn {
            background: rgba(187,134,252,0.15);
            border: 1px solid rgba(187,134,252,0.3);
            color: #bb86fc;
            padding: 5px 10px;
            cursor: pointer;
            border-radius: 6px;
            font-size: 13px;
            transition: 0.15s;
        }
        #chatSendBtn:hover { background: rgba(187,134,252,0.3); }

        /* Collapsed state */
        #chatPanel.collapsed #chatBody { display: none; }
        #chatPanel.collapsed { border-radius: 10px; }
        `;
        document.head.appendChild(s);
    },

    // ---------------------------------------------------------------
    // INPUT KEYBOARD HANDLING
    // ---------------------------------------------------------------
    _bindInputKeys() {
        const input = document.getElementById('chatInput');
        const dmInput = document.getElementById('chatDmInput');

        // Main chat input: Enter sends
        // Typing indicator: emit 'typing_dm' when user is typing in DM channel
        let _typingTimer = null;
        let _typingActive = false;
        input.addEventListener('keydown', (e) => {
            e.stopPropagation(); // CRITICAL: prevents WASD etc from firing game movement
            if (e.key === 'Enter') { ChatUI.send(); return; }
            if (e.key === 'Escape') { input.blur(); return; }

            // Only emit typing indicator when in DM channel and there's a target
            if (ChatUI.activeChannel === 'dm' && ChatUI.dmTarget && typeof Game !== 'undefined') {
                if (!_typingActive) {
                    _typingActive = true;
                    Game.socket.emit('typing_dm', { targetCharId: ChatUI.dmTarget.charId, isTyping: true });
                }
                clearTimeout(_typingTimer);
                // Stop typing indicator 2.5s after last keypress
                _typingTimer = setTimeout(() => {
                    _typingActive = false;
                    Game.socket.emit('typing_dm', { targetCharId: ChatUI.dmTarget.charId, isTyping: false });
                }, 2500);
            }
        });

        // DM target input: Enter confirms target
        dmInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                ChatUI._resolveDmTarget(dmInput.value.trim());
                dmInput.blur();
                document.getElementById('chatInput').focus();
            }
            if (e.key === 'Escape') { dmInput.blur(); }
        });
    },

    _bindHotkeys() {
        // Global hotkey: Enter focuses chat input (when nothing is focused)
        window.addEventListener('keydown', (e) => {
            // Only act if game input isn't consumed elsewhere
            if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
            if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') return;

            // Enter: focus chat
            if (e.key === 'Enter' && !ChatUI.collapsed) {
                e.preventDefault();
                document.getElementById('chatInput').focus();
            }
        });
    },

    // ---------------------------------------------------------------
    // SOCKET EVENTS
    // ---------------------------------------------------------------
    _typingFrom: {},

    showTyping(fromName, fromCharId) {
        const row = document.getElementById('chatTypingRow');
        if (!row) return;
        if (ChatUI.activeChannel !== 'dm' || !ChatUI.dmTarget) return;
        if (ChatUI.dmTarget.charId !== fromCharId) return;
        row.textContent = fromName + ' is typing…';
        clearTimeout(ChatUI._typingFrom[fromCharId]);
        ChatUI._typingFrom[fromCharId] = setTimeout(() => {
            if (row && row.textContent.includes(fromName)) row.textContent = '';
        }, 3000);
    },

    clearTyping(fromCharId) {
        const row = document.getElementById('chatTypingRow');
        clearTimeout(ChatUI._typingFrom[fromCharId]);
        delete ChatUI._typingFrom[fromCharId];
        if (row && !Object.keys(ChatUI._typingFrom).length) row.textContent = '';
    },

    _bindSocketEvents() {
        // Game object may not exist yet — wait for it
        const tryBind = () => {
            if (typeof Game === 'undefined' || !Game.socket) {
                setTimeout(tryBind, 100);
                return;
            }
            Game.socket.on('chat_msg', (msg) => ChatUI._addMessage(msg));

            // Typing indicator from DM partner
            Game.socket.on('typing_dm_indicator', ({ fromName, fromCharId, isTyping }) => {
                if (isTyping) ChatUI.showTyping(fromName, fromCharId);
                else ChatUI.clearTyping(fromCharId);
            });

            // ── GM event handlers ────────────────────────────────────
            // TEACHING: The server emits these targeted events after a GM
            // command runs. We update the UI immediately so the player
            // sees the effect without needing to re-open their stats panel.

            // /heal — update HP/MP bars
            Game.socket.on('gm_heal', ({ hp, maxHp, mp, maxMp }) => {
                if (typeof GameUI !== 'undefined') {
                    GameUI.updateHp?.(hp, maxHp);
                    GameUI.updateMp?.(mp, maxMp);
                }
                // Also works by asking server to re-send full stats
                Game.socket.emit('get_char_data');
                ChatUI._sysMsg(`✨ HP and MP fully restored!`);
            });

            // /givegold — refresh gold display
            Game.socket.on('gm_gold_update', ({ delta }) => {
                Game.socket.emit('get_char_data');
                ChatUI._sysMsg(`💰 +${delta.toLocaleString()} gold received!`);
            });

            // /givexp — refresh XP / possibly trigger level-up animation
            Game.socket.on('gm_xp_update', ({ delta, leveled }) => {
                Game.socket.emit('get_char_data');
                ChatUI._sysMsg(`⭐ +${delta.toLocaleString()} XP received!${leveled ? ' 🎉 Level up!' : ''}`);
            });

            // /setlevel — force a full data refresh
            Game.socket.on('gm_level_set', ({ level }) => {
                Game.socket.emit('get_char_data');
                ChatUI._sysMsg(`🎚️ Your level has been set to ${level}!`);
            });

            // /weather — already handled by screen_effect which game_engine listens for
        };
        tryBind();

        // ── GM Command Autocomplete ───────────────────────────────────
        // Shows a floating palette above the chat input when the user
        // types '/' — like a mini command reference / type-ahead.
        ChatUI._initGmAutocomplete();
    },

    // ---------------------------------------------------------------
    // GM AUTOCOMPLETE PALETTE
    // ---------------------------------------------------------------
    // TEACHING: We listen to the 'input' event on the chat box. Every
    // time the user types we check if the value starts with '/'. If so
    // we show a filtered list of matching commands. Click or Tab to
    // complete. Escape or typing something that doesn't match hides it.
    _gmCommands: [
        { cmd: 'help',      usage: '/help',                        hint: 'List all GM commands',          role: 'MOD'   },
        { cmd: 'tp',        usage: '/tp <mapId> [x] [y]',         hint: 'Teleport yourself to a map',    role: 'MOD'   },
        { cmd: 'goto',      usage: '/goto <player>',               hint: 'Jump to a player\'s location',  role: 'MOD'   },
        { cmd: 'tphere',    usage: '/tphere <player>',             hint: 'Pull a player to you',          role: 'MOD'   },
        { cmd: 'heal',      usage: '/heal [player]',               hint: 'Fully restore HP & MP',         role: 'MOD'   },
        { cmd: 'npcmood',   usage: '/npcmood <name> <mood>',       hint: 'Change an NPC\'s mood',         role: 'MOD'   },
        { cmd: 'weather',   usage: '/weather <effect>',            hint: 'Map-wide screen effect',        role: 'MOD'   },
        { cmd: 'setflag',   usage: '/setflag <key> <value>',       hint: 'Set a world flag',              role: 'GM'    },
        { cmd: 'givegold',  usage: '/givegold <amount> [player]',  hint: 'Give gold',                     role: 'GM'    },
        { cmd: 'givexp',    usage: '/givexp <amount> [player]',    hint: 'Give XP',                       role: 'GM'    },
        { cmd: 'spawnnpc',  usage: '/spawnnpc <id> [x] [y]',       hint: 'Temporarily spawn an NPC',      role: 'GM'    },
        { cmd: 'killnpc',   usage: '/killnpc <name>',              hint: 'Kill an NPC live',              role: 'GM'    },
        { cmd: 'setlevel',  usage: '/setlevel <level> [player]',   hint: 'Set character level',           role: 'ADMIN' },
        { cmd: 'kick',      usage: '/kick <player>',               hint: 'Disconnect a player',           role: 'ADMIN' },
    ],

    _initGmAutocomplete() {
        const input = document.getElementById('chatInput');
        if (!input) return;

        // Create the palette element (hidden by default)
        const palette = document.createElement('div');
        palette.id = 'gm-palette';
        palette.style.cssText = `
            display:none; position:absolute; bottom:calc(100% + 4px); left:0; right:0;
            background:#0d1117; border:1px solid #30363d; border-radius:8px;
            max-height:260px; overflow-y:auto; z-index:9000;
            box-shadow:0 -4px 20px rgba(0,0,0,.6); font-family:'Courier New',monospace;`;
        input.closest('#chatInputRow')?.style && (input.closest('#chatInputRow').style.position = 'relative');
        input.parentElement.style.position = 'relative';
        input.parentElement.appendChild(palette);

        let selected = -1;

        const hide = () => { palette.style.display = 'none'; selected = -1; };

        const render = (matches) => {
            if (!matches.length) { hide(); return; }
            palette.style.display = 'block';
            palette.innerHTML = matches.map((c, i) => `
                <div class="gm-pal-row" data-idx="${i}" data-cmd="${c.cmd}"
                    style="padding:7px 12px; cursor:pointer; border-bottom:1px solid #21262d;
                           background:${i === selected ? 'rgba(187,134,252,.12)' : 'transparent'};
                           display:flex; align-items:baseline; gap:10px;">
                    <span style="color:#bb86fc; font-size:12px; font-weight:bold; min-width:90px">${c.usage}</span>
                    <span style="color:#8b949e; font-size:11px; flex:1">${c.hint}</span>
                    <span style="color:#484f58; font-size:10px; border:1px solid #30363d;
                                 padding:1px 5px; border-radius:3px">${c.role}</span>
                </div>`).join('');

            // Click to complete
            palette.querySelectorAll('.gm-pal-row').forEach(row => {
                row.addEventListener('mousedown', (e) => {
                    e.preventDefault(); // don't blur input
                    input.value = '/' + row.dataset.cmd + ' ';
                    input.focus();
                    hide();
                });
            });
        };

        // Show/filter on input
        input.addEventListener('input', () => {
            const val = input.value;
            if (!val.startsWith('/') || val.includes(' ')) { hide(); return; }
            const typed = val.slice(1).toLowerCase();
            const matches = ChatUI._gmCommands.filter(c => c.cmd.startsWith(typed));
            render(matches);
        });

        // Arrow keys / Tab / Escape navigation
        input.addEventListener('keydown', (e) => {
            if (palette.style.display === 'none') return;
            const rows = palette.querySelectorAll('.gm-pal-row');
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                selected = Math.max(0, selected - 1);
                render(ChatUI._gmCommands.filter(c => c.cmd.startsWith(input.value.slice(1).toLowerCase())));
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                selected = Math.min(rows.length - 1, selected + 1);
                render(ChatUI._gmCommands.filter(c => c.cmd.startsWith(input.value.slice(1).toLowerCase())));
            } else if (e.key === 'Tab') {
                e.preventDefault();
                const idx = selected >= 0 ? selected : 0;
                const match = ChatUI._gmCommands.filter(c => c.cmd.startsWith(input.value.slice(1).toLowerCase()))[idx];
                if (match) { input.value = '/' + match.cmd + ' '; }
                hide();
            } else if (e.key === 'Escape') {
                hide();
            }
        });

        // Hide when focus leaves chat
        input.addEventListener('blur', () => setTimeout(hide, 150));
    },

    // ---------------------------------------------------------------
    // MESSAGE HANDLING
    // ---------------------------------------------------------------
    _addMessage(msg) {
        const ch = msg.channel || 'system';

        // Store in history
        if (!ChatUI.history[ch]) ChatUI.history[ch] = [];
        ChatUI.history[ch].push(msg);
        if (ChatUI.history[ch].length > ChatUI.MAX_HISTORY) {
            ChatUI.history[ch].shift();
        }

        // Unread badge when not on this channel
        if (ch !== ChatUI.activeChannel && ch !== 'system') {
            ChatUI.unread[ch] = (ChatUI.unread[ch] || 0) + 1;
            ChatUI._updateBadge(ch);
        }

        // If this is our active channel (or system msg) render it
        if (ch === ChatUI.activeChannel || ch === 'system') {
            ChatUI._renderMessage(msg);
        }

        // For announces: always show regardless of channel
        if (ch === 'announce' && ChatUI.activeChannel !== 'announce') {
            ChatUI._renderMessage(msg, true); // forceShow
        }
    },

    _renderMessage(msg, forceShow = false) {
        const box = document.getElementById('chatMessages');
        if (!box) return;

        const ch = msg.channel || 'system';
        const cfg = ChatUI.CHANNELS.find(c => c.key === ch);
        const color = cfg ? cfg.color : '#888888';

        const time = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const nameClick = (msg.fromCharId && msg.fromCharId !== (typeof Game !== 'undefined' ? Game.myCharId : -1))
            ? `onclick="ChatUI.startDM(${msg.fromCharId}, '${ChatUI._esc(msg.from)}')" title="DM ${ChatUI._esc(msg.from)}"`
            : '';

        // Prefix for forced announces shown in other channels
        const prefix = forceShow ? `<span style="color:#ffff55;font-weight:bold">[📢] </span>` : '';

        // DM direction label
        let dmLabel = '';
        if (ch === 'dm' && msg.targetName) {
            const isMe = msg.fromCharId === (typeof Game !== 'undefined' ? Game.myCharId : -1);
            dmLabel = isMe
                ? `<span style="color:#888;font-size:10px"> → ${msg.targetName}</span>`
                : `<span style="color:#888;font-size:10px"> [DM]</span>`;
        }

        const line = document.createElement('div');
        line.className = 'chat-line';
        line.innerHTML = `${prefix}<span class="chat-ts">[${time}]</span> `
            + `<span class="chat-name" style="color:${color}" ${nameClick}>${ChatUI._esc(msg.from)}</span>`
            + `${dmLabel}: `
            + `<span style="color:${ch === 'system' ? '#888' : '#ccc'}">${ChatUI._esc(msg.text)}</span>`;

        box.appendChild(line);

        // Auto-scroll to bottom
        box.scrollTop = box.scrollHeight;

        // Cap rendered lines at 200 DOM elements
        while (box.children.length > 200) box.removeChild(box.firstChild);
    },

    // ---------------------------------------------------------------
    // SENDING
    // ---------------------------------------------------------------
    send() {
        const input = document.getElementById('chatInput');
        const text = (input.value || '').trim();
        if (!text) return;

        if (typeof Game === 'undefined' || !Game.socket) return;

        // ── Slash commands ──────────────────────────────────────────
        // TEACHING: Slash commands start with '/'. We intercept them
        // here BEFORE sending to the server. This means the server only
        // receives actual chat messages, not command syntax.
        if (text.startsWith('/')) {
            input.value = '';
            ChatUI._handleSlash(text.slice(1).trim());
            return;
        }

        const payload = { channel: ChatUI.activeChannel, text };
        if (ChatUI.activeChannel === 'dm') {
            if (!ChatUI.dmTarget) {
                ChatUI._addMessage({ channel: 'system', from: 'System', text: 'Set a DM target first — type their name in the pink box above.', ts: Date.now() });
                return;
            }
            payload.targetCharId = ChatUI.dmTarget.charId;
        }

        Game.socket.emit('chat_send', payload);
        input.value = '';
    },

    // ── Slash Command Handler ─────────────────────────────────────
    // TEACHING: /emote and /me are the same thing — they both trigger
    // the emote system. /wave, /bow etc. are shortcuts.
    // Unrecognised commands show a helpful error message locally.
    _handleSlash(cmd) {
        const [name, ...args] = cmd.toLowerCase().split(/\s+/);
        const EMOTE_KEYS = ['wave','bow','cheer','laugh','cry','think','shrug',
                            'dance','salute','kneel','point','sleep','angry','clap','sit'];

        // /wave, /bow etc → emote shortcut
        if (EMOTE_KEYS.includes(name)) {
            Game.socket.emit('emote', { emoteKey: name });
            return;
        }

        // /me <text> or /emote <text> → custom emote (shows as *Name text*)
        if (name === 'me' || name === 'emote') {
            const action = args.join(' ').trim();
            if (!action) {
                ChatUI._sysMsg('Usage: /me <action>  e.g. /me stretches and yawns');
                return;
            }
            // Send as a local emote message — server handles the star wrapping
            Game.socket.emit('chat_send', {
                channel: 'local',
                text: `*${action}*`,
                isCustomEmote: true
            });
            return;
        }

        // /g → guild, /p → party, /l → local, /w → global
        const channelShortcuts = { g:'guild', p:'party', l:'local', w:'global', a:'admin' };
        if (channelShortcuts[name]) {
            const msgText = args.join(' ');
            if (msgText) {
                Game.socket.emit('chat_send', { channel: channelShortcuts[name], text: msgText });
            } else {
                ChatUI.switchChannel(channelShortcuts[name]);
            }
            return;
        }

        // /emotes → show list
        if (name === 'emotes') {
            ChatUI._sysMsg('Emotes: /' + ['wave','bow','cheer','laugh','cry','think',
                'shrug','dance','salute','kneel','point','sleep','angry','clap','sit'].join(' /'));
            ChatUI._sysMsg('Channels: /g (guild) /p (party) /l (local) /w (global)');
            ChatUI._sysMsg('Custom: /me <action>');
            return;
        }

        // /help — show both local and GM commands (server will also respond with its list)
        if (name === 'help') {
            ChatUI._sysMsg('Emotes: /' + ['wave','bow','cheer','laugh','cry','think',
                'shrug','dance','salute','kneel','point','sleep','angry','clap','sit'].join(' /'));
            ChatUI._sysMsg('Channels: /g /p /l /w /a  |  Custom: /me <action>');
            // Pass to server too — it will reply with GM command list if you have the role
            Game.socket.emit('chat_send', { channel: 'local', text: `/${cmd}` });
            return;
        }

        // TEACHING: Any unrecognised slash command is forwarded to the server.
        // The server's GM command handler will validate role and execute it.
        // Non-staff players will see "Unknown command." back as a system message.
        Game.socket.emit('chat_send', { channel: 'local', text: `/${cmd}` });
    },

    _sysMsg(text) {
        ChatUI._addMessage({ channel: 'system', from: 'System', text, ts: Date.now() });
    },

    // ---------------------------------------------------------------
    // CHANNEL SWITCHING
    // ---------------------------------------------------------------
    switchChannel(key) {
        ChatUI.activeChannel = key;
        ChatUI.unread[key] = 0;
        ChatUI._updateBadge(key);
        ChatUI._applyTabActive();

        // Show/hide DM target row
        const dmRow = document.getElementById('chatDmRow');
        if (dmRow) dmRow.style.display = key === 'dm' ? 'flex' : 'none';

        // Re-render messages for this channel
        ChatUI._redrawMessages();

        // Focus input
        const inp = document.getElementById('chatInput');
        if (inp) inp.focus();
    },

    _applyTabActive() {
        document.querySelectorAll('.chat-tab').forEach(el => {
            el.classList.toggle('active', el.dataset.ch === ChatUI.activeChannel);
        });
        // Update placeholder based on channel
        const inp = document.getElementById('chatInput');
        if (!inp) return;
        const cfg = ChatUI.CHANNELS.find(c => c.key === ChatUI.activeChannel);
        inp.placeholder = cfg ? `${cfg.icon} ${cfg.label}…` : 'Message…';
        inp.style.borderColor = (cfg && ChatUI.activeChannel !== 'global') ? cfg.color + '55' : '';
    },

    _redrawMessages() {
        const box = document.getElementById('chatMessages');
        if (!box) return;
        box.innerHTML = '';
        const msgs = ChatUI.history[ChatUI.activeChannel] || [];
        msgs.forEach(m => ChatUI._renderMessage(m));
        box.scrollTop = box.scrollHeight;
    },

    _updateBadge(ch) {
        const badge = document.getElementById('cbadge-' + ch);
        if (!badge) return;
        const count = ChatUI.unread[ch] || 0;
        badge.style.display = count > 0 ? 'inline' : 'none';
        badge.textContent = count > 99 ? '99+' : count;
    },

    // ---------------------------------------------------------------
    // DM HELPERS
    // ---------------------------------------------------------------
    startDM(charId, name) {
        ChatUI.switchChannel('dm');
        ChatUI.dmTarget = { charId, name };
        const label = document.getElementById('chatDmLabel');
        const inp = document.getElementById('chatDmInput');
        if (label) label.textContent = `→ ${name}`;
        if (inp) inp.value = name;
        document.getElementById('chatInput').focus();
    },

    _resolveDmTarget(name) {
        if (!name) return;
        // Try to find in online players — Game.players is charId -> player object
        if (typeof Game !== 'undefined') {
            const found = Object.values(Game.players).find(
                p => p.name.toLowerCase() === name.toLowerCase() && p.charId !== Game.myCharId
            );
            if (found) {
                ChatUI.dmTarget = { charId: found.charId, name: found.name };
                const label = document.getElementById('chatDmLabel');
                if (label) label.textContent = `→ ${found.name}`;
                return;
            }
        }
        // Not found in local list — still store name; server will reject if offline
        ChatUI.dmTarget = { charId: null, name };
        const label = document.getElementById('chatDmLabel');
        if (label) label.textContent = `→ ${name} (may be offline)`;
    },

    // ---------------------------------------------------------------
    // COLLAPSE TOGGLE
    // ---------------------------------------------------------------
    toggleCollapse() {
        ChatUI.collapsed = !ChatUI.collapsed;
        document.getElementById('chatPanel').classList.toggle('collapsed', ChatUI.collapsed);
        document.getElementById('chatCollapseIcon').textContent = ChatUI.collapsed ? '▼' : '▲';
    },

    // ---------------------------------------------------------------
    // UTIL
    // ---------------------------------------------------------------
    _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;'); },
};
