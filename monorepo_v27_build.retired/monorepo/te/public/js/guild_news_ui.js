// =================================================================
// GUILD NEWS UI  v1.0
// =================================================================
// TEACHING: The guild news feed is basically a guild bulletin board.
// Officers post announcements ("Event this Saturday at 8PM!"),
// and the system auto-posts events ("Goose deposited 5000g").
//
// This UI adds a "📰 News" tab to the existing guild panel.
// We hook into GuildUI after it loads by patching its tab renderer.
//
// Pinned posts float to the top — leaders can toggle pinning.
// Posts are soft-deleted (hidden, not removed from the DB).
//
// Category colour coding:
//   📢 announcement → white
//   🏦 bank         → gold
//   🏆 achievement  → purple
//   📅 event        → blue
//   ⚙️  system       → grey
// =================================================================

const GuildNewsUI = {

    guildId:   null,
    myCharId:  null,
    myRank:    null,
    posts:     [],

    CATEGORY_STYLES: {
        announcement: { icon:'📢', color:'#e8eef6' },
        bank:         { icon:'💰', color:'#ffaa00' },
        achievement:  { icon:'🏆', color:'#bb86fc' },
        event:        { icon:'📅', color:'#58a6ff' },
        system:       { icon:'⚙️',  color:'#484f58' },
    },

    // ── Called by GuildUI after it loads guild data ────────────────
    async loadForGuild(guildId, charId, rank) {
        GuildNewsUI.guildId  = guildId;
        GuildNewsUI.myCharId = charId;
        GuildNewsUI.myRank   = rank;
        await GuildNewsUI._fetchPosts();
    },

    async _fetchPosts() {
        try {
            const r = await fetch(`/api/guild-news/${GuildNewsUI.guildId}`, { credentials: 'include' });
            const d = await r.json();
            if (d.success) GuildNewsUI.posts = d.posts || [];
        } catch { GuildNewsUI.posts = []; }
    },

    // ── Render the news tab content (injected into GuildUI's tab body) ──
    render(containerEl) {
        if (!containerEl) return;
        const canPost  = ['LEADER','OFFICER'].includes(GuildNewsUI.myRank);
        const isLeader = GuildNewsUI.myRank === 'LEADER';
        const posts    = GuildNewsUI.posts;

        containerEl.innerHTML = `
        ${canPost ? `
        <div class="gn-post-form" id="gnPostForm" style="display:none">
            <div class="gn-field">
                <label>Title</label>
                <input id="gnTitle" type="text" class="gn-input" maxlength="128"
                    placeholder="Announcement title…">
            </div>
            <div class="gn-field">
                <label>Body <span style="color:#484f58;font-size:9px">BBCode + [img=trusted host] supported</span></label>
                <textarea id="gnBody" class="gn-textarea" maxlength="2000"
                    placeholder="[b]Hey everyone![/b] Guild event this Saturday at 8PM server time. Be there!"></textarea>
            </div>
            <div style="display:flex;gap:8px;margin-top:8px">
                <button class="gn-btn gn-btn-post" onclick="GuildNewsUI._submitPost()">📢 Post</button>
                <button class="gn-btn" onclick="GuildNewsUI._toggleForm()">Cancel</button>
            </div>
            <div id="gnPostMsg" style="font-size:11px;min-height:18px;margin-top:4px;color:#3fb950"></div>
        </div>

        <div style="display:flex;justify-content:flex-end;padding:8px 0 4px">
            <button class="gn-btn gn-btn-post" onclick="GuildNewsUI._toggleForm()">📢 New Post</button>
        </div>` : ''}

        <div class="gn-feed" id="gnFeed">
            ${posts.length === 0
                ? `<div style="text-align:center;padding:30px;color:#484f58;font-size:12px">
                    No announcements yet.<br>
                    ${canPost ? '<span style="font-size:11px">Post an announcement for your guildmates.</span>' : ''}
                   </div>`
                : posts.map(p => GuildNewsUI._renderPost(p, isLeader)).join('')
            }
        </div>`;
    },

    _renderPost(p, isLeader) {
        const cat    = GuildNewsUI.CATEGORY_STYLES[p.category] || GuildNewsUI.CATEGORY_STYLES.system;
        const isMe   = p.author_char_id === GuildNewsUI.myCharId;
        const canDel = isLeader || isMe;
        const when   = GuildNewsUI._timeAgo(p.created_at);

        return `
        <div class="gn-post${p.is_pinned ? ' gn-pinned' : ''}" id="gnPost_${p.id}">
            <div class="gn-post-header">
                <div style="display:flex;align-items:center;gap:8px">
                    <span style="font-size:16px">${cat.icon}</span>
                    <div>
                        <div class="gn-post-title" style="color:${cat.color}">
                            ${p.is_pinned ? '<span style="font-size:10px;color:#ffaa00">📌 </span>' : ''}
                            ${GuildNewsUI._esc(p.title)}
                        </div>
                        <div class="gn-post-meta">
                            by <strong>${GuildNewsUI._esc(p.author_name)}</strong> · ${when}
                        </div>
                    </div>
                </div>
                <div style="display:flex;gap:5px;flex-shrink:0">
                    ${isLeader ? `
                    <button class="gn-action-btn" title="${p.is_pinned ? 'Unpin' : 'Pin'}"
                        onclick="GuildNewsUI._togglePin(${p.id})">
                        ${p.is_pinned ? '📌' : '📍'}
                    </button>` : ''}
                    ${canDel ? `
                    <button class="gn-action-btn" title="Delete"
                        onclick="GuildNewsUI._deletePost(${p.id})">🗑️</button>` : ''}
                </div>
            </div>
            <div class="gn-post-body">${p.body_html}</div>
        </div>`;
    },

    // ── Actions ───────────────────────────────────────────────────
    _toggleForm() {
        const f = document.getElementById('gnPostForm');
        if (f) f.style.display = f.style.display === 'none' ? '' : 'none';
    },

    async _submitPost() {
        const title = document.getElementById('gnTitle')?.value?.trim();
        const body  = document.getElementById('gnBody')?.value?.trim();
        const msg   = document.getElementById('gnPostMsg');
        if (!title) { if(msg){msg.style.color='#f85149';msg.textContent='❌ Title required.';} return; }
        if (!body)  { if(msg){msg.style.color='#f85149';msg.textContent='❌ Body required.';} return; }

        try {
            const r = await fetch('/api/guild-news/post', {
                method:'POST', credentials:'include',
                headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ guildId: GuildNewsUI.guildId, title, body })
            });
            const d = await r.json();
            if (d.success) {
                GuildNewsUI.posts.unshift(d.post);
                GuildNewsUI._toggleForm();
                document.getElementById('gnTitle').value = '';
                document.getElementById('gnBody').value  = '';
                // Re-render feed
                const feed = document.getElementById('gnFeed');
                if (feed) {
                    const isLeader = GuildNewsUI.myRank === 'LEADER';
                    feed.innerHTML = GuildNewsUI.posts.map(p => GuildNewsUI._renderPost(p, isLeader)).join('');
                }
                showNotification('📢 Post published!', 'quest');
            } else {
                if (msg) { msg.style.color='#f85149'; msg.textContent='❌ '+(d.error||'Failed'); }
            }
        } catch(e) {
            if (msg) { msg.style.color='#f85149'; msg.textContent='❌ '+e.message; }
        }
    },

    async _togglePin(postId) {
        await fetch('/api/guild-news/pin', {
            method:'POST', credentials:'include',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ guildId: GuildNewsUI.guildId, postId })
        });
        // Toggle locally
        const p = GuildNewsUI.posts.find(x => x.id === postId);
        if (p) p.is_pinned = p.is_pinned ? 0 : 1;
        // Re-sort pinned to top
        GuildNewsUI.posts.sort((a,b) => b.is_pinned - a.is_pinned || new Date(b.created_at) - new Date(a.created_at));
        const feed = document.getElementById('gnFeed');
        if (feed) feed.innerHTML = GuildNewsUI.posts.map(p2 => GuildNewsUI._renderPost(p2, true)).join('');
    },

    async _deletePost(postId) {
        if (!confirm('Delete this post?')) return;
        const r = await fetch('/api/guild-news/delete', {
            method:'POST', credentials:'include',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ guildId: GuildNewsUI.guildId, postId })
        });
        const d = await r.json();
        if (d.success) {
            GuildNewsUI.posts = GuildNewsUI.posts.filter(p => p.id !== postId);
            const el = document.getElementById('gnPost_' + postId);
            if (el) el.remove();
        }
    },

    // ── Helpers ───────────────────────────────────────────────────
    _timeAgo(ts) {
        const diff = Date.now() - new Date(ts).getTime();
        const m = Math.floor(diff/60000);
        if (m < 2)  return 'just now';
        if (m < 60) return m + 'm ago';
        const h = Math.floor(m/60);
        if (h < 24) return h + 'h ago';
        return Math.floor(h/24) + 'd ago';
    },

    _esc(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    },

    // ── Injected CSS ─────────────────────────────────────────────
    injectStyles() {
        if (document.getElementById('guildNewsStyles')) return;
        const s = document.createElement('style');
        s.id = 'guildNewsStyles';
        s.textContent = `
        .gn-feed { padding:4px 0; }
        .gn-post {
            border-bottom:1px solid #21262d;padding:12px 0;
        }
        .gn-post:last-child { border-bottom:none; }
        .gn-pinned { background:rgba(255,170,0,0.03);border-left:3px solid #ffaa0044;padding-left:10px; }
        .gn-post-header {
            display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;
        }
        .gn-post-title { font-size:13px;font-weight:bold;margin-bottom:2px; }
        .gn-post-meta  { font-size:10px;color:#484f58; }
        .gn-post-body  {
            font-size:12px;color:#8b949e;line-height:1.7;
            /* Scope styles inside post bodies */
        }
        .gn-post-body strong { color:#e8eef6; }
        .gn-post-body em { color:#8b949e; }
        .gn-post-body img { max-width:100%;max-height:180px;border-radius:6px;margin-top:6px; }
        .gn-post-form {
            background:rgba(255,255,255,0.02);border:1px solid #21262d;
            border-radius:8px;padding:12px;margin-bottom:12px;
        }
        .gn-field { display:flex;flex-direction:column;gap:5px;margin-bottom:8px; }
        .gn-field label { font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px; }
        .gn-input {
            background:rgba(255,255,255,0.04);border:1px solid #21262d;border-radius:6px;
            color:#e8eef6;font-size:12px;font-family:'Courier New',monospace;padding:7px 10px;outline:none;
        }
        .gn-input:focus { border-color:#bb86fc; }
        .gn-textarea {
            background:rgba(255,255,255,0.04);border:1px solid #21262d;border-radius:6px;
            color:#e8eef6;font-size:12px;font-family:'Courier New',monospace;
            padding:7px 10px;outline:none;resize:vertical;min-height:80px;
        }
        .gn-textarea:focus { border-color:#bb86fc; }
        .gn-btn {
            padding:7px 14px;border-radius:6px;cursor:pointer;font-size:11px;
            border:1px solid #30363d;background:rgba(255,255,255,0.04);
            color:#8b949e;font-family:'Courier New',monospace;transition:.12s;
        }
        .gn-btn:hover { background:rgba(255,255,255,0.08);color:#e8eef6; }
        .gn-btn-post { background:rgba(187,134,252,0.12);border-color:rgba(187,134,252,0.35);color:#bb86fc; }
        .gn-btn-post:hover { background:rgba(187,134,252,0.22); }
        .gn-action-btn {
            width:26px;height:26px;border-radius:5px;border:1px solid #21262d;
            background:rgba(255,255,255,0.02);cursor:pointer;font-size:12px;
        }
        .gn-action-btn:hover { background:rgba(255,255,255,0.07); }
        `;
        document.head.appendChild(s);
    },
};
