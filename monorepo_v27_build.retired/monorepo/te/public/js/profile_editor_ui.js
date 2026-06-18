// =================================================================
// PROFILE EDITOR UI  v1.0
// =================================================================
// TEACHING: This is the in-game profile customizer. It lets players
// personalize their public profile page with:
//
//   - Bio (up to 500 chars) — free-form "about me" text
//   - Accent color — a hex color picker that tints their profile page
//   - Banner emoji — one big emoji displayed as a decorative header
//   - Favorite quote — shown in an italic blockquote on the profile
//   - Spotify track — paste an open.spotify.com track URL, enter the
//     track name and artist, and it renders an embedded Spotify player
//     on their public profile page (the actual embed loads on profile.html)
//
// The Spotify integration is intentionally simple:
//   - We DON'T use the Spotify OAuth API (that requires server-side
//     token management and a registered app)
//   - Instead, players paste their own share link from the Spotify app
//   - We validate it's a real open.spotify.com URL and embed it
//   - This is the same approach used by most profile-based games/forums
//
// Entry: ProfileEditorUI.init(charId, currentData)
// Toggle: ProfileEditorUI.toggle()
// =================================================================

const ProfileEditorUI = {

    charId:  null,
    data:    {},
    open:    false,

    // ── Init ──────────────────────────────────────────────────────
    init(charId, charData) {
        ProfileEditorUI.charId = charId;
        ProfileEditorUI.data   = charData || {};
        ProfileEditorUI._injectStyles();
        ProfileEditorUI._buildHudButton();
        // Start the heartbeat — pings server every 2 minutes to update last_seen_at
        ProfileEditorUI._startHeartbeat();
        // Load top friends data for the editor
        ProfileEditorUI._loadTopFriends();
    },

    _topFriends: [],        // current saved top friends [{slot,charId,name,...}]
    _topFriendsDraft: [],   // draft in the editor (array of charId strings)

    async _loadTopFriends() {
        try {
            const r = await fetch('/top-friends/' + ProfileEditorUI.charId, { credentials: 'include' });
            const d = await r.json();
            if (d.success) ProfileEditorUI._topFriends = d.friends || [];
        } catch {}
    },

    _startHeartbeat() {
        // Update last_seen_at immediately on login, then every 2 minutes
        const ping = () => fetch('/heartbeat', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId: ProfileEditorUI.charId }),
            credentials: 'include'
        }).catch(() => {});
        ping();
        setInterval(ping, 2 * 60 * 1000);
    },

    _buildHudButton() {
        const bar = document.getElementById('topButtons');
        if (!bar) return;
        const btn = document.createElement('button');
        btn.className = 'hud-btn';
        btn.id        = 'profileEditBtn';
        btn.title     = 'Edit Your Profile';
        btn.innerHTML = '✏️ Profile';
        btn.onclick   = () => ProfileEditorUI.toggle();
        bar.appendChild(btn);
    },

    // ── Toggle ────────────────────────────────────────────────────
    toggle() {
        ProfileEditorUI.open ? ProfileEditorUI.close() : ProfileEditorUI._openPanel();
    },

    close() {
        ProfileEditorUI.open = false;
        const el = document.getElementById('profileEditorPanel');
        if (el) el.remove();
    },

    _openPanel() {
        ProfileEditorUI.open = true;
        ProfileEditorUI._build();
        // Load Spotify status asynchronously after panel renders
        ProfileEditorUI._loadSpotifyStatus();
    },

    // ── Build Panel ───────────────────────────────────────────────
    _build() {
        const old = document.getElementById('profileEditorPanel');
        if (old) old.remove();

        const d   = ProfileEditorUI.data;
        const col = d.profile_color || '#bb86fc';

        const panel = document.createElement('div');
        panel.id = 'profileEditorPanel';
        panel.innerHTML = `
        <div class="pe-header">
            <span class="pe-title" style="color:${col}">✏️ Edit Profile</span>
            <div style="display:flex;gap:8px;align-items:center">
                <a href="/profile/${encodeURIComponent(d.name||'')}" target="_blank"
                   style="color:#484f58;font-size:11px;text-decoration:none" title="View public profile">
                   🔗 View Profile
                </a>
                <button onclick="ProfileEditorUI.close()" class="pe-close">✕</button>
            </div>
        </div>

        <!-- Live preview strip -->
        <div class="pe-preview" id="pePrev" style="border-color:${col}">
            <div class="pe-preview-banner" id="peBanner">${d.profile_banner_emoji || '⚔️'}</div>
            <div class="pe-preview-name">${ProfileEditorUI._esc(d.name||'Hero')}</div>
            ${d.equipped_title ? `<div class="pe-preview-title" style="color:${col}">[${ProfileEditorUI._esc(d.equipped_title)}]</div>` : ''}
        </div>

        <div class="pe-body">

            <!-- Section: Appearance -->
            <div class="pe-section-label">🎨 Appearance</div>
            <div class="pe-row">
                <div class="pe-field" style="flex:0 0 80px">
                    <label>Banner Emoji</label>
                    <input id="peBannerEmoji" type="text" value="${ProfileEditorUI._esc(d.profile_banner_emoji||'⚔️')}"
                        maxlength="8" class="pe-input"
                        oninput="ProfileEditorUI._previewBanner(this.value)"
                        style="font-size:24px;text-align:center;width:56px">
                </div>
                <div class="pe-field" style="flex:1">
                    <label>Accent Color <span style="color:#484f58;font-size:10px">(hex)</span></label>
                    <div style="display:flex;gap:8px;align-items:center">
                        <input type="color" id="peColorPick" value="${col}"
                            oninput="ProfileEditorUI._previewColor(this.value)" style="width:40px;height:32px;cursor:pointer;border:none;background:none">
                        <input id="peColor" type="text" value="${col}" maxlength="7" class="pe-input"
                            oninput="ProfileEditorUI._onColorText(this.value)" style="width:90px;letter-spacing:1px">
                        <!-- Preset swatches -->
                        <div style="display:flex;gap:4px;flex-wrap:wrap">
                            ${['#bb86fc','#03dac6','#ffaa00','#f85149','#3fb950','#58a6ff','#ff79c6','#ff6e40']
                                .map(c => `<div onclick="ProfileEditorUI._previewColor('${c}')" style="width:18px;height:18px;border-radius:50%;background:${c};cursor:pointer;border:1px solid rgba(255,255,255,0.15)" title="${c}"></div>`)
                                .join('')}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Section: About -->
            <div class="pe-section-label">📝 About You</div>
            <div class="pe-field">
                <label>Bio <span id="peBioLen" style="color:#484f58;font-size:10px">${(d.profile_bio||'').length}/500</span></label>
                <textarea id="peBio" class="pe-textarea" maxlength="500"
                    placeholder="Tell other players about yourself…"
                    oninput="document.getElementById('peBioLen').textContent=this.value.length+'/500'"
                >${ProfileEditorUI._esc(d.profile_bio||'')}</textarea>
            </div>
            <div class="pe-field">
                <label>Favorite Quote <span style="color:#484f58;font-size:10px">(shown in italics on your profile)</span></label>
                <input id="peQuote" type="text" class="pe-input" maxlength="200"
                    placeholder='"Every saint has a past, every sinner a future."'
                    value="${ProfileEditorUI._esc(d.profile_favorite_quote||'')}">
            </div>

            <!-- Section: Spotify -->
            <div class="pe-section-label">🎵 Now Playing <span style="color:#484f58;font-size:10px;font-weight:normal">— shown on your profile page</span></div>
            <div id="peSpotifySection" style="background:rgba(30,215,96,0.05);border:1px solid rgba(30,215,96,0.15);border-radius:8px;padding:12px;margin-bottom:12px">
                <div id="peSpotifyLoading" style="color:#484f58;font-size:11px">Checking Spotify connection…</div>
            </div>

            <!-- Section: Signature -->
            <div class="pe-section-label">✍️ Forum Signature <span style="color:#484f58;font-size:10px;font-weight:normal">— appears on your profile page</span></div>
            <div class="pe-field">
                <label>BBCode supported: [b], [i], [u], [s], [color=#hex], [size=12], [url=...]
                    <span id="peSigLen" style="color:#484f58;font-size:10px;float:right">${(d.profile_signature||'').length}/500</span>
                </label>
                <textarea id="peSig" class="pe-textarea" maxlength="500" style="min-height:60px;font-family:'Courier New',monospace"
                    placeholder="[b]Your signature here[/b] — [color=#bb86fc]styled text[/color] supported"
                    oninput="document.getElementById('peSigLen').textContent=this.value.length+'/500';ProfileEditorUI._previewSig(this.value)"
                >${ProfileEditorUI._esc(d._rawSig||d.profile_signature||'')}</textarea>
                <div id="peSigPreview" style="background:rgba(255,255,255,0.03);border:1px solid #21262d;border-radius:6px;
                    padding:8px 10px;font-size:12px;min-height:30px;color:#8b949e;font-style:italic;margin-top:4px">
                    ${d.profile_signature ? `<span style="color:#8b949e;font-size:10px">Current:</span> ` + d.profile_signature : '<span style="color:#30363d">Preview will appear here…</span>'}
                </div>
                <div style="font-size:10px;color:#484f58;margin-top:4px">
                    Examples: <code>[b]bold[/b]</code> &nbsp;
                    <code>[color=#03dac6]teal text[/color]</code> &nbsp;
                    <code>[url=https://...]click[/url]</code>
                </div>
            </div>

            <!-- Section: Top Friends -->
            <div class="pe-section-label">⭐ Top Friends <span style="color:#484f58;font-size:10px;font-weight:normal">— up to 8, shown on your profile</span></div>
            <div id="peTopFriendsGrid" class="pe-tf-grid">
                ${ProfileEditorUI._buildTopFriendsEditor()}
            </div>
            <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
                <input id="peTfSearch" type="text" class="pe-input" placeholder="Search player name…" style="flex:1">
                <button class="pe-btn" onclick="ProfileEditorUI._searchFriend()">🔍 Find</button>
            </div>
            <div id="peTfResults" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px"></div>
            <div style="font-size:10px;color:#484f58;margin-top:6px">
                Click a slot to remove. Search and click a result to add them.
            </div>

            <!-- Section: Privacy -->
            <div class="pe-section-label">🔒 Privacy</div>
            <div class="pe-field">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:12px">
                    <input type="checkbox" id="peShowViewers"
                        ${d.show_profile_viewers ? 'checked' : ''}
                        style="width:15px;height:15px;accent-color:#bb86fc;cursor:pointer">
                    <span>
                        Show who viewed my profile
                        <span style="font-size:10px;color:#484f58">— stored for 30 days, visible only to you</span>
                    </span>
                </label>
            </div>

            <!-- Save / Cancel -->
            <div style="display:flex;gap:8px;margin-top:4px">
                <button class="pe-btn pe-btn-save" onclick="ProfileEditorUI.save()">💾 Save Profile</button>
                <button class="pe-btn" onclick="ProfileEditorUI.close()">Cancel</button>
            </div>
        </div>`;

        panel.addEventListener('click', e => e.stopPropagation());
        document.body.appendChild(panel);
    },

    // ── Live preview ──────────────────────────────────────────────
    _previewBanner(val) {
        const el = document.getElementById('peBanner');
        if (el) el.textContent = val || '⚔️';
    },

    _previewColor(hex) {
        if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
        document.getElementById('peColor').value = hex;
        document.getElementById('peColorPick').value = hex;
        const title = document.querySelector('.pe-title');
        if (title) title.style.color = hex;
        const prev  = document.getElementById('pePrev');
        if (prev) prev.style.borderColor = hex;
    },

    _onColorText(val) {
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
            document.getElementById('peColorPick').value = val;
            const title = document.querySelector('.pe-title');
            if (title) title.style.color = val;
        }
    },

    // ── Spotify OAuth methods ────────────────────────────────────
    async _loadSpotifyStatus() {
        const section = document.getElementById('peSpotifySection');
        if (!section) return;
        try {
            const r = await fetch('/api/spotify/status', { credentials: 'include' });
            const d = await r.json();
            if (!d.configured) {
                section.innerHTML = `
                    <div style="font-size:11px;color:#484f58">
                        ⚙️ Spotify auto-sync is not configured on this server.
                        <br>Set <code>SPOTIFY_CLIENT_ID</code>, <code>SPOTIFY_CLIENT_SECRET</code>,
                        and <code>SPOTIFY_REDIRECT_URI</code> in your <code>.env</code> to enable it.
                        <br><br>
                        <span style="color:#8b949e">You can still paste a track URL manually below:</span>
                    </div>
                    ${ProfileEditorUI._manualSpotifyForm()}`;
                return;
            }
            if (d.connected) {
                ProfileEditorUI._renderSpotifyConnected(section);
            } else {
                ProfileEditorUI._renderSpotifyDisconnected(section);
            }
        } catch(e) {
            section.innerHTML = `<div style="color:#f85149;font-size:11px">❌ Could not check Spotify status.</div>`;
        }
    },

    _renderSpotifyConnected(section) {
        const d = ProfileEditorUI.data;
        section.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span style="font-size:20px">🎵</span>
            <div style="flex:1">
                <div style="font-size:12px;color:#1ed760;font-weight:bold">✅ Spotify Connected</div>
                <div style="font-size:10px;color:#484f58">Auto-syncs every 5 minutes</div>
            </div>
            <button class="pe-btn" style="border-color:rgba(248,81,73,.3);color:#f85149"
                onclick="ProfileEditorUI._disconnectSpotify()">Disconnect</button>
        </div>
        ${d.spotify_track_name ? `
        <div style="background:rgba(0,0,0,.3);border-radius:7px;padding:8px 10px;font-size:11px">
            <div style="color:#1ed760;margin-bottom:2px">▶ Now showing on your profile:</div>
            <div style="color:#e8eef6;font-weight:bold">${ProfileEditorUI._esc(d.spotify_track_name)}</div>
            <div style="color:#8b949e">by ${ProfileEditorUI._esc(d.spotify_artist_name||'')}</div>
        </div>` : `<div style="font-size:11px;color:#484f58">Nothing playing right now — start Spotify and it'll appear within 5 minutes.</div>`}
        <div style="margin-top:8px">
            <button class="pe-btn" style="font-size:10px" onclick="ProfileEditorUI._syncNow()">🔄 Sync Now</button>
            <span id="peSyncMsg" style="font-size:10px;color:#484f58;margin-left:8px"></span>
        </div>`;
    },

    _renderSpotifyDisconnected(section) {
        section.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:10px">
            <span style="font-size:24px">🎵</span>
            <div style="flex:1">
                <div style="font-size:12px;color:#e8eef6;font-weight:bold;margin-bottom:4px">Connect Spotify</div>
                <div style="font-size:11px;color:#484f58;margin-bottom:12px;line-height:1.6">
                    Link your Spotify account and your currently playing track will automatically
                    show on your profile — updated every 5 minutes.
                </div>
                <a href="/api/spotify/connect" class="pe-btn"
                   style="background:rgba(30,215,96,.15);border-color:rgba(30,215,96,.4);color:#1ed760;text-decoration:none;display:inline-block">
                    🎵 Connect Spotify
                </a>
            </div>
        </div>
        <div style="margin-top:12px;border-top:1px solid #21262d;padding-top:10px">
            <div style="font-size:10px;color:#484f58;margin-bottom:6px">Or paste a URL manually:</div>
            ${ProfileEditorUI._manualSpotifyForm()}
        </div>`;
    },

    _manualSpotifyForm() {
        const d = ProfileEditorUI.data;
        return `
        <div class="pe-field" style="margin-bottom:6px">
            <input id="peSpotifyUrl" type="text" class="pe-input"
                placeholder="https://open.spotify.com/track/..."
                value="${ProfileEditorUI._esc(d.spotify_track_url||'')}"
                oninput="ProfileEditorUI._onSpotifyUrl(this.value)">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="pe-field">
                <label style="font-size:10px;color:#484f58">Track Name</label>
                <input id="peSpotifyName" type="text" class="pe-input" maxlength="100"
                    placeholder="Track name"
                    value="${ProfileEditorUI._esc(d.spotify_track_name||'')}">
            </div>
            <div class="pe-field">
                <label style="font-size:10px;color:#484f58">Artist</label>
                <input id="peSpotifyArtist" type="text" class="pe-input" maxlength="100"
                    placeholder="Artist name"
                    value="${ProfileEditorUI._esc(d.spotify_artist_name||'')}">
            </div>
        </div>`;
    },

    _onSpotifyUrl(url) {
        const el = document.getElementById('peSpotifyUrl');
        if (!el) return;
        const match = url.match(/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
        el.style.borderColor = url.length > 10 ? (match ? '#1ed760' : '#f85149') : '';
    },

    async _syncNow() {
        const msg = document.getElementById('peSyncMsg');
        if (msg) msg.textContent = 'Syncing…';
        try {
            const r = await fetch('/api/spotify/sync', { method:'POST', credentials:'include' });
            const d = await r.json();
            if (d.success) {
                if (msg) msg.textContent = d.track ? `✅ Now showing: ${d.track.name}` : '✅ Synced (nothing playing)';
                // Refresh the section to show updated track
                if (d.track) {
                    ProfileEditorUI.data.spotify_track_name   = d.track.name;
                    ProfileEditorUI.data.spotify_artist_name  = d.track.artist;
                    ProfileEditorUI.data.spotify_track_url    = d.track.url;
                }
                setTimeout(() => ProfileEditorUI._loadSpotifyStatus(), 500);
            } else {
                if (msg) { msg.style.color = '#f85149'; msg.textContent = '❌ ' + (d.error||'Failed'); }
            }
        } catch(e) { if (msg) { msg.style.color='#f85149'; msg.textContent='❌ '+e.message; } }
    },

    async _disconnectSpotify() {
        if (!confirm('Disconnect Spotify? Your current track will be cleared from your profile.')) return;
        try {
            await fetch('/api/spotify/disconnect', { method:'POST', credentials:'include' });
            ProfileEditorUI.data.spotify_track_name   = null;
            ProfileEditorUI.data.spotify_artist_name  = null;
            ProfileEditorUI.data.spotify_track_url    = null;
            ProfileEditorUI._loadSpotifyStatus();
        } catch(e) { alert('❌ ' + e.message); }
    },

    // ── Save ──────────────────────────────────────────────────────
    async save() {
        const body = {
            charId:            ProfileEditorUI.charId,
            bio:               document.getElementById('peBio').value,
            profileColor:      document.getElementById('peColor').value,
            bannerEmoji:       document.getElementById('peBannerEmoji').value,
            favoriteQuote:     document.getElementById('peQuote').value,
            spotifyTrackUrl:   document.getElementById('peSpotifyUrl')?.value ?? (ProfileEditorUI.data.spotify_track_url||''),
            spotifyTrackName:  document.getElementById('peSpotifyName')?.value ?? (ProfileEditorUI.data.spotify_track_name||''),
            spotifyArtistName: document.getElementById('peSpotifyArtist')?.value ?? (ProfileEditorUI.data.spotify_artist_name||''),
            showProfileViewers: document.getElementById('peShowViewers')?.checked || false,
        };

        // Save signature separately (server does BBCode parse)
        const sigRaw = document.getElementById('peSig')?.value || '';
        if (sigRaw !== (ProfileEditorUI.data._rawSig || '')) {
            fetch('/save-signature', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ charId: ProfileEditorUI.charId, signature: sigRaw }),
                credentials: 'include'
            }).then(r => r.json()).then(d => {
                if (d.success) ProfileEditorUI.data._rawSig = sigRaw;
            }).catch(() => {});
        }

        // Save top friends
        const friendIds = ProfileEditorUI._topFriends.map(f => f.charId);
        fetch('/save-top-friends', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId: ProfileEditorUI.charId, friendIds }),
            credentials: 'include'
        }).catch(() => {});

        try {
            const r = await fetch('/save-profile', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const d = await r.json();
            if (d.success) {
                // Update local data cache
                ProfileEditorUI.data.profile_bio            = body.bio;
                ProfileEditorUI.data.profile_color          = body.profileColor;
                ProfileEditorUI.data.profile_banner_emoji   = body.bannerEmoji;
                ProfileEditorUI.data.profile_favorite_quote = body.favoriteQuote;
                ProfileEditorUI.data.spotify_track_url      = body.spotifyTrackUrl;
                ProfileEditorUI.data.spotify_track_name     = body.spotifyTrackName;
                ProfileEditorUI.data.spotify_artist_name    = body.spotifyArtistName;
                showNotification('✅ Profile saved!', 'quest');
                ProfileEditorUI.close();
            } else {
                showNotification('❌ ' + (d.message || 'Save failed'), 'damage');
            }
        } catch {
            showNotification('❌ Network error', 'damage');
        }
    },

    // ── BBCode preview (client-side, mirrors server-side parser) ──
    _previewSig(raw) {
        const prev = document.getElementById('peSigPreview');
        if (!prev) return;
        if (!raw.trim()) { prev.innerHTML = '<span style="color:#30363d">Preview will appear here…</span>'; return; }
        let s = raw
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/\[b\](.*?)\[\/b\]/gis,'<strong>$1</strong>')
            .replace(/\[i\](.*?)\[\/i\]/gis,'<em>$1</em>')
            .replace(/\[u\](.*?)\[\/u\]/gis,'<span style="text-decoration:underline">$1</span>')
            .replace(/\[s\](.*?)\[\/s\]/gis,'<span style="text-decoration:line-through">$1</span>')
            .replace(/\[color=(#[0-9a-fA-F]{3,6})\](.*?)\[\/color\]/gis,'<span style="color:$1">$2</span>')
            .replace(/\[size=(\d{1,2})\](.*?)\[\/size\]/gis,(_,sz,t)=>`<span style="font-size:${Math.min(24,Math.max(8,+sz))}px">${t}</span>`)
            .replace(/\[url=(https?:\/\/[^\]]{1,300})\](.*?)\[\/url\]/gis,'<a href="$1" target="_blank" style="color:#58a6ff">$2</a>')
            .replace(/\n/g,'<br>');
        // [img] — only show trusted hosts, strip others
        const TRUSTED = ['i.imgur.com','imgur.com','media.giphy.com','giphy.com',
            'media.tenor.com','cdn.discordapp.com','media.discordapp.net',
            'i.redd.it','pbs.twimg.com','images.unsplash.com'];
        s = s.replace(/\[img\](https?:\/\/[^\[]{1,500})\[\/img\]/gis, (_, url) => {
            try {
                const host = new URL(url).hostname;
                if (TRUSTED.some(h => host === h || host.endsWith('.'+h))) {
                    return `<img src="${url}" alt="" style="max-width:100%;max-height:120px;border-radius:4px;vertical-align:middle">`;
                }
            } catch {}
            return '<span style="color:#f85149;font-size:10px">[img: untrusted host]</span>';
        });
        prev.innerHTML = s;
    },

    // ── Top Friends editor ────────────────────────────────────────
    _buildTopFriendsEditor() {
        const friends = ProfileEditorUI._topFriends;
        const slots = [];
        for (let i = 1; i <= 8; i++) {
            const f = friends.find(x => x.slot === i);
            if (f) {
                slots.push(`<div class="pe-tf-slot pe-tf-filled" title="Click to remove"
                    onclick="ProfileEditorUI._removeFriend(${f.charId})">
                    <div class="pe-tf-icon">${ProfileEditorUI._classIcon(f.class_name)}</div>
                    <div class="pe-tf-name">${ProfileEditorUI._esc(f.name)}</div>
                    <div class="pe-tf-level">Lv.${f.level}</div>
                    <div class="pe-tf-remove">✕</div>
                </div>`);
            } else {
                slots.push(`<div class="pe-tf-slot pe-tf-empty">
                    <div style="font-size:20px;color:#30363d">+</div>
                    <div style="font-size:9px;color:#30363d">Slot ${i}</div>
                </div>`);
            }
        }
        return slots.join('');
    },

    _classIcon(className) {
        const m = { Warrior:'⚔️', Mage:'🔮', Rogue:'🗡️', Healer:'💚', Ranger:'🏹',
                    Necromancer:'💀', Paladin:'🛡️', Druid:'🌿' };
        return m[className] || '⚔️';
    },

    async _searchFriend() {
        const q = document.getElementById('peTfSearch')?.value?.trim();
        if (!q || q.length < 2) return;
        try {
            const r = await fetch('/get-char-by-name', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: q }), credentials: 'include'
            });
            const d = await r.json();
            const results = document.getElementById('peTfResults');
            if (!results) return;
            if (!d.success || !d.character) {
                results.innerHTML = '<span style="font-size:11px;color:#484f58">No character found.</span>';
                return;
            }
            const ch = d.character;
            // Don't show yourself
            if (ch.id === ProfileEditorUI.charId) {
                results.innerHTML = '<span style="font-size:11px;color:#484f58">That\u2019s you!</span>';
                return;
            }
            // Don't show already-added friends
            if (ProfileEditorUI._topFriends.find(f => f.charId === ch.id)) {
                results.innerHTML = '<span style="font-size:11px;color:#3fb950">Already in your Top Friends.</span>';
                return;
            }
            const chClass = ch.class_name || '';
            results.innerHTML = `<div class="pe-tf-result" onclick="ProfileEditorUI._addFriend(${ch.id},'${ProfileEditorUI._esc(ch.name)}',${ch.level},'${ProfileEditorUI._esc(chClass)}')">
                ${ProfileEditorUI._classIcon(chClass)} Add <strong>${ProfileEditorUI._esc(ch.name)}</strong> (Lv.${ch.level} ${chClass})
            </div>`;
        } catch { document.getElementById('peTfResults').innerHTML = '<span style="font-size:11px;color:red">Error.</span>'; }
    },

    _addFriend(charId, name, level, className) {
        if (ProfileEditorUI._topFriends.length >= 8) {
            showNotification('⭐ Top Friends is full! Remove someone first.', 'damage'); return;
        }
        if (ProfileEditorUI._topFriends.find(f => f.charId === charId)) return;
        const nextSlot = Math.max(0, ...ProfileEditorUI._topFriends.map(f => f.slot)) + 1;
        ProfileEditorUI._topFriends.push({ slot: nextSlot, charId, name, level, class_name: className });
        document.getElementById('peTopFriendsGrid').innerHTML = ProfileEditorUI._buildTopFriendsEditor();
        document.getElementById('peTfResults').innerHTML = '';
        document.getElementById('peTfSearch').value = '';
    },

    _removeFriend(charId) {
        ProfileEditorUI._topFriends = ProfileEditorUI._topFriends
            .filter(f => f.charId !== charId)
            .map((f, i) => ({ ...f, slot: i + 1 }));
        document.getElementById('peTopFriendsGrid').innerHTML = ProfileEditorUI._buildTopFriendsEditor();
    },

    _esc(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/'/g,'&#39;').replace(/"/g,'&quot;');
    },

    // ── Styles ────────────────────────────────────────────────────
    _injectStyles() {
        if (document.getElementById('profileEditorStyles')) return;
        const s = document.createElement('style');
        s.id = 'profileEditorStyles';
        s.textContent = `
        #profileEditorPanel {
            position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            width:520px;max-width:calc(100vw - 20px);
            background:rgba(5,8,14,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:12px;
            z-index:200;color:#e8eef6;font-family:'Courier New',monospace;
            box-shadow:0 8px 40px rgba(0,0,0,0.8);display:flex;flex-direction:column;max-height:88vh;
        }
        .pe-header {
            display:flex;justify-content:space-between;align-items:center;
            padding:12px 16px;border-bottom:1px solid #21262d;flex-shrink:0;
        }
        .pe-title { font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:bold; }
        .pe-close  { background:none;border:none;color:#484f58;cursor:pointer;font-size:16px; }
        .pe-close:hover { color:#8b949e; }
        .pe-preview {
            display:flex;flex-direction:column;align-items:center;gap:4px;
            padding:14px;border-bottom:2px solid;flex-shrink:0;
            background:rgba(255,255,255,0.02);
        }
        .pe-preview-banner { font-size:36px; }
        .pe-preview-name   { font-size:14px;font-weight:bold;color:#e8eef6; }
        .pe-preview-title  { font-size:11px;letter-spacing:.5px; }
        .pe-body {
            flex:1;overflow-y:auto;scrollbar-width:thin;padding:14px 16px;
            scrollbar-color:rgba(255,255,255,0.1) transparent;
        }
        .pe-section-label {
            font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#484f58;
            padding:10px 0 7px;border-bottom:1px solid #21262d;margin-bottom:12px;font-weight:bold;
        }
        .pe-section-label:first-child { padding-top:0; }
        .pe-row   { display:flex;gap:12px;margin-bottom:12px; }
        .pe-field { display:flex;flex-direction:column;gap:5px;margin-bottom:12px; }
        .pe-field label { font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px; }
        .pe-input {
            background:rgba(255,255,255,0.04);border:1px solid #21262d;border-radius:7px;
            color:#e8eef6;font-size:12px;font-family:'Courier New',monospace;
            padding:8px 10px;outline:none;transition:.15s;
        }
        .pe-input:focus { border-color:#bb86fc; }
        .pe-textarea {
            background:rgba(255,255,255,0.04);border:1px solid #21262d;border-radius:7px;
            color:#e8eef6;font-size:12px;font-family:'Courier New',monospace;
            padding:8px 10px;outline:none;resize:vertical;min-height:72px;transition:.15s;
        }
        .pe-textarea:focus { border-color:#bb86fc; }
        .pe-btn {
            padding:8px 20px;border-radius:7px;cursor:pointer;font-size:12px;
            border:1px solid #30363d;background:rgba(255,255,255,0.04);
            color:#8b949e;font-family:'Courier New',monospace;transition:.12s;
        }
        .pe-btn:hover { background:rgba(255,255,255,0.08);color:#e8eef6; }
        .pe-btn-save {
            background:rgba(187,134,252,0.15);border-color:rgba(187,134,252,0.4);color:#bb86fc;
        }
        .pe-btn-save:hover { background:rgba(187,134,252,0.28); }

        /* Top Friends grid */
        .pe-tf-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px; }
        .pe-tf-slot {
            border:1px solid #21262d;border-radius:8px;padding:8px 4px;text-align:center;
            cursor:pointer;transition:.12s;min-height:72px;display:flex;flex-direction:column;
            align-items:center;justify-content:center;gap:2px;position:relative;
        }
        .pe-tf-filled { border-color:rgba(187,134,252,0.3);background:rgba(187,134,252,0.05); }
        .pe-tf-filled:hover { background:rgba(248,81,73,0.1);border-color:rgba(248,81,73,0.3); }
        .pe-tf-filled:hover .pe-tf-remove { opacity:1; }
        .pe-tf-empty  { border-style:dashed;border-color:#21262d; }
        .pe-tf-empty:hover { border-color:#484f58; }
        .pe-tf-icon   { font-size:20px; }
        .pe-tf-name   { font-size:10px;font-weight:bold;color:#e8eef6;word-break:break-word;line-height:1.2; }
        .pe-tf-level  { font-size:9px;color:#484f58; }
        .pe-tf-remove { position:absolute;top:4px;right:6px;font-size:11px;color:#f85149;opacity:0;transition:.1s; }
        .pe-tf-result {
            padding:8px 12px;background:rgba(255,255,255,0.04);border:1px solid #21262d;
            border-radius:6px;font-size:12px;cursor:pointer;transition:.1s;
        }
        .pe-tf-result:hover { background:rgba(187,134,252,0.1);border-color:rgba(187,134,252,0.3); }
        `;
        document.head.appendChild(s);
    },
};
