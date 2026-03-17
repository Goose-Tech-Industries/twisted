// =================================================================
// GM BROADCAST TOOLS — announce, world events, map messages, DMs
// =================================================================
const GmTools = {
    _maps: [],

    async init() {
        document.getElementById('managerTitle').textContent = '📢 GM Tools';
        const r = await API.getAll('map').catch(() => ({ success: false }));
        GmTools._maps = r.success ? r.data : [];

        const mapOpts = GmTools._maps
            .map(m => `<option value="${m.id}">${m.name}</option>`).join('');

        document.getElementById('dynamicArea').innerHTML = `
        <style>
        .gmt-card { background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:20px;margin-bottom:16px }
        .gmt-head { font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#484f58;margin-bottom:14px }
        .gmt-btn  { padding:10px 20px;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;transition:.15s }
        .gmt-btn:hover { opacity:.85 }
        .gmt-log  { background:#010409;border:1px solid #21262d;border-radius:8px;padding:12px;max-height:200px;overflow-y:auto;font-family:monospace;font-size:11px;color:#484f58 }
        .gmt-event-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px }
        .gmt-event-btn  { padding:14px;border:1px solid #21262d;border-radius:8px;background:#0d1117;
            color:#e8eef6;cursor:pointer;font-size:13px;text-align:center;transition:.15s }
        .gmt-event-btn:hover { border-color:#bb86fc;color:#bb86fc }
        </style>

        <h2 style="margin:0 0 20px;color:#f85149">📢 GM Broadcast Tools</h2>

        <!-- GLOBAL ANNOUNCE -->
        <div class="gmt-card" style="border-color:rgba(248,81,73,.2)">
            <div class="gmt-head">📣 Global Server Announcement</div>
            <p style="color:#484f58;font-size:12px;margin-bottom:12px">Shown as a banner across the top of every player's screen for 12 seconds.</p>
            <textarea id="gmt_announce_msg" rows="2" placeholder="Server will restart in 5 minutes for maintenance…" style="margin-bottom:10px;resize:vertical"></textarea>
            <div style="display:flex;gap:10px;align-items:center">
                <select id="gmt_announce_style" style="width:auto">
                    <option value="info">ℹ️ Info (blue)</option>
                    <option value="warning">⚠️ Warning (orange)</option>
                    <option value="danger">🚨 Danger (red)</option>
                </select>
                <button class="gmt-btn" style="background:#1565C0;color:#fff" onclick="GmTools._announce()">📣 Announce to All</button>
            </div>
        </div>

        <!-- MAP BROADCAST -->
        <div class="gmt-card">
            <div class="gmt-head">🗺️ Map Broadcast (Local Chat)</div>
            <p style="color:#484f58;font-size:12px;margin-bottom:12px">Sends a GM message into a specific map's local chat channel.</p>
            <div style="display:grid;grid-template-columns:1fr 2fr auto;gap:10px;align-items:end">
                <div><label>Target Map</label><select id="gmt_map_id">${mapOpts}</select></div>
                <div><label>Message</label><input id="gmt_map_msg" placeholder="Strange sounds echo from the north…"></div>
                <button class="gmt-btn" style="background:#2E7D32;color:#fff;white-space:nowrap" onclick="GmTools._mapBroadcast()">Send to Map</button>
            </div>
        </div>

        <!-- WORLD EVENTS -->
        <div class="gmt-card">
            <div class="gmt-head">🌍 World Events</div>
            <p style="color:#484f58;font-size:12px;margin-bottom:14px">Fire a world event — triggers visual/audio effects on every client's game screen.</p>
            <div class="gmt-event-grid">
                <div class="gmt-event-btn" onclick="GmTools._worldEvent('blood_moon')">🩸 Blood Moon<br><small style="color:#484f58">Red tint, 30s</small></div>
                <div class="gmt-event-btn" onclick="GmTools._worldEvent('darkness_falls')">🌑 Darkness Falls<br><small style="color:#484f58">Chat log message</small></div>
                <div class="gmt-event-btn" onclick="GmTools._emergencyModal()">⚠️ Emergency<br><small style="color:#484f58">Custom message</small></div>
                <div class="gmt-event-btn" onclick="GmTools._customEvent()">⚙️ Custom Event<br><small style="color:#484f58">Any event type</small></div>
            </div>
        </div>

        <!-- CUSTOM CHAT BROADCAST -->
        <div class="gmt-card">
            <div class="gmt-head">💬 Global Chat Broadcast</div>
            <p style="color:#484f58;font-size:12px;margin-bottom:12px">Sends a message into the in-game chat (all players see it).</p>
            <div style="display:flex;gap:10px;align-items:end">
                <div style="flex:1"><label>Message</label><input id="gmt_chat_msg" placeholder="Citizens of the realm, hear my words…"></div>
                <button class="gmt-btn" style="background:#6A1B9A;color:#fff" onclick="GmTools._chatBroadcast()">📢 Broadcast</button>
            </div>
        </div>

        <!-- ACTION LOG -->
        <div class="gmt-card">
            <div class="gmt-head">📋 Action Log (this session)</div>
            <div class="gmt-log" id="gmt_log"><span style="color:#21262d">Actions will appear here…</span></div>
        </div>`;
    },

    _log(msg) {
        const el = document.getElementById('gmt_log');
        if (!el) return;
        const t = new Date().toLocaleTimeString();
        el.innerHTML += `<div><span style="color:#21262d">[${t}]</span> ${msg}</div>`;
        el.scrollTop = el.scrollHeight;
    },

    async _announce() {
        const message = document.getElementById('gmt_announce_msg')?.value?.trim();
        const style   = document.getElementById('gmt_announce_style')?.value;
        if (!message) return alert('Enter a message.');
        const r = await fetch('/admin-panel/server-announce', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ message, style })
        });
        const d = await r.json();
        if (d.success) {
            GmTools._log(`📣 Announced: "${message}" (${style})`);
            document.getElementById('gmt_announce_msg').value = '';
        } else alert(d.message);
    },

    async _mapBroadcast() {
        const mapId  = document.getElementById('gmt_map_id')?.value;
        const message = document.getElementById('gmt_map_msg')?.value?.trim();
        if (!mapId || !message) return alert('Select a map and enter a message.');
        const mapName = GmTools._maps.find(m => m.id == mapId)?.name || `Map ${mapId}`;
        const r = await fetch('/admin-panel/broadcast-map', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ mapId, message })
        });
        const d = await r.json();
        if (d.success) {
            GmTools._log(`🗺️ Sent to ${mapName}: "${message}"`);
            document.getElementById('gmt_map_msg').value = '';
        } else alert(d.message);
    },

    async _worldEvent(type, payload = {}) {
        if (payload.message === null) return; // user cancelled prompt
        const r = await fetch('/admin-panel/world-event', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ eventType: type, payload })
        });
        const d = await r.json();
        if (d.success) GmTools._log(`🌍 World event fired: ${type}`);
        else alert(d.message);
    },

    _emergencyModal() {
        const modal = document.createElement('div');
        modal.id = 'gmt_em_modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center';
        modal.innerHTML = `
        <div style="background:#161b22;border:1px solid #f85149;border-radius:12px;padding:24px;min-width:420px">
            <h3 style="margin:0 0 4px;color:#f85149">⚠️ Emergency Broadcast</h3>
            <p style="color:#484f58;font-size:12px;margin:0 0 14px">Fires a world emergency event visible to all players.</p>
            <label style="font-size:12px;color:#8b949e">Emergency Message</label>
            <input id="gmt_em_msg" placeholder="e.g. Server restart in 5 minutes!" style="margin-bottom:16px">
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="edit-btn" onclick="document.getElementById('gmt_em_modal').remove()">Cancel</button>
                <button style="padding:8px 18px;background:#c0392b;border:none;color:#fff;border-radius:6px;cursor:pointer;font-weight:700" onclick="GmTools._doEmergency()">⚠️ Fire Event</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('gmt_em_msg')?.focus(), 50);
    },

    async _doEmergency() {
        const message = document.getElementById('gmt_em_msg')?.value?.trim();
        document.getElementById('gmt_em_modal')?.remove();
        if (!message) return;
        GmTools._worldEvent('emergency', { message });
    },

    _customEvent() {
        const modal = document.createElement('div');
        modal.id = 'gmt_ce_modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center';
        modal.innerHTML = `
        <div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:24px;min-width:460px">
            <h3 style="margin:0 0 4px;color:#e8eef6">⚙️ Custom World Event</h3>
            <p style="color:#484f58;font-size:12px;margin:0 0 14px">Fire any world event type. Use payload JSON for extra data.</p>
            <label style="font-size:12px;color:#8b949e">Event Type</label>
            <input id="gmt_ce_type" placeholder="e.g. blood_moon, darkness_falls, earthquake" style="margin-bottom:10px">
            <label style="font-size:12px;color:#8b949e">Payload JSON (optional)</label>
            <textarea id="gmt_ce_payload" rows="3" style="font-family:monospace;font-size:12px;margin-bottom:16px">{}</textarea>
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="edit-btn" onclick="document.getElementById('gmt_ce_modal').remove()">Cancel</button>
                <button class="action-btn save-btn" onclick="GmTools._doCustom()">⚙️ Fire Event</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('gmt_ce_type')?.focus(), 50);
    },

    async _doCustom() {
        const type = document.getElementById('gmt_ce_type')?.value?.trim();
        if (!type) return;
        let payload = {};
        try { payload = JSON.parse(document.getElementById('gmt_ce_payload')?.value || '{}'); } catch {}
        document.getElementById('gmt_ce_modal')?.remove();
        GmTools._worldEvent(type, payload);
    },

    async _chatBroadcast() {
        const message = document.getElementById('gmt_chat_msg')?.value?.trim();
        if (!message) return alert('Enter a message.');
        const r = await fetch('/admin-panel/broadcast', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ message, channel:'announce' })
        });
        const d = await r.json();
        if (d.success) {
            GmTools._log(`💬 Chat broadcast: "${message}"`);
            document.getElementById('gmt_chat_msg').value = '';
        } else alert(d.message);
    }
};
