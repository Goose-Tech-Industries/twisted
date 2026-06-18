// =================================================================
// CHARACTER CREATOR (AdminSauce tab)
// Visual preview of character appearance slots.
// The same appearance_json gets used by both players and this panel.
//
// Asset folder convention:  /assets/sprites/characters/
//   heads/    — head_human_m_01.png, head_elf_f_01.png, …
//   bodies/   — body_human_m.png, body_orc_m.png, …
//   hair/     — hair_short_01.png, hair_long_02.png, …
//   armor/    — armor_leather_m.png, armor_plate_m.png, …
//   weapon/   — weapon_sword_01.png, weapon_staff_01.png, …
//   acc/      — acc_cloak_01.png, …
//
// Each slot is a PNG with transparency (32×64 or 64×64 recommended).
// Skin/hair/armor tints are applied via Canvas globalCompositeOperation.
// =================================================================
const CharacterCreator = {
    // ── Asset catalogue (admin populates these by dropping PNGs into the folders)
    SLOTS: {
        body:   { label: 'Body',   folder: 'bodies',  icon: '🧍', default: 'body_human_m' },
        head:   { label: 'Head',   folder: 'heads',   icon: '🗣️', default: 'head_human_m_01' },
        hair:   { label: 'Hair',   folder: 'hair',    icon: '💇', default: '' },
        armor:  { label: 'Armor',  folder: 'armor',   icon: '🛡️', default: '' },
        weapon: { label: 'Weapon', folder: 'weapon',  icon: '⚔️',  default: '' },
        acc:    { label: 'Acc.',   folder: 'acc',     icon: '✨',  default: '' },
    },
    COLORS: {
        skin:   { label: 'Skin',        default: '#f5c5a3' },
        hair:   { label: 'Hair Colour', default: '#4a3728' },
        armor:  { label: 'Armor Tint',  default: '#607d8b' },
        cloth:  { label: 'Cloth Tint',  default: '#5c6bc0' },
    },

    _state: {
        body: 'body_human_m', head: 'head_human_m_01',
        hair: '', armor: '', weapon: '', acc: '',
        colors: { skin: '#f5c5a3', hair: '#4a3728', armor: '#607d8b', cloth: '#5c6bc0' }
    },
    _char: null,  // character being edited (if launched from Player Manager)

    async init(charId) {
        document.getElementById('managerTitle').textContent = '🧍 Character Creator';

        // If charId passed, load existing appearance
        if (charId) {
            const r = await fetch(`/admin-panel/character-appearance/${charId}`);
            const d = await r.json();
            if (d.success && d.data) {
                CharacterCreator._state = { ...CharacterCreator._state, ...d.data };
                CharacterCreator._state.colors = { ...CharacterCreator._state.colors, ...(d.data.colors||{}) };
            }
            CharacterCreator._char = charId;
        }

        // Discover available assets by trying to load index files (or fallback to manual entry)
        CharacterCreator._renderUI();
    },

    _renderUI() {
        const s = CharacterCreator._state;
        const slotHTML = Object.entries(CharacterCreator.SLOTS).map(([key, slot]) => `
            <div style="background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:12px;margin-bottom:8px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                    <span style="font-size:16px">${slot.icon}</span>
                    <span style="font-size:12px;font-weight:700;color:#8b949e;text-transform:uppercase;letter-spacing:.5px">${slot.label}</span>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                    <input id="cc_${key}" value="${s[key]||''}" placeholder="filename (no .png)"
                        style="flex:1;font-family:monospace;font-size:12px"
                        oninput="CharacterCreator._update('${key}', this.value)">
                    <button class="edit-btn" style="font-size:11px;white-space:nowrap"
                        onclick="CharacterCreator._clearSlot('${key}')">✕ Clear</button>
                </div>
                <div style="font-size:10px;color:#484f58;margin-top:4px">
                    /assets/sprites/characters/${slot.folder}/<code style="color:#bb86fc">${s[key]||slot.default||'...'}</code>.png
                </div>
            </div>`).join('');

        const colorHTML = Object.entries(CharacterCreator.COLORS).map(([key, col]) => `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                <label style="width:90px;font-size:12px;color:#8b949e">${col.label}</label>
                <input type="color" value="${s.colors[key]||col.default}" style="width:40px;height:28px;border:none;background:none;cursor:pointer;border-radius:4px"
                    onchange="CharacterCreator._updateColor('${key}',this.value)">
                <input type="text" value="${s.colors[key]||col.default}" style="width:80px;font-family:monospace;font-size:12px"
                    oninput="CharacterCreator._updateColor('${key}',this.value)">
            </div>`).join('');

        document.getElementById('dynamicArea').innerHTML = `
<style>
.cc-preview { display:flex;flex-direction:column;align-items:center;gap:12px }
.cc-canvas  { border:1px solid #21262d;border-radius:8px;background:#1a1a2e;
              image-rendering:pixelated;image-rendering:crisp-edges }
</style>

<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <div>
        <h2 style="margin:0;color:#bb86fc">🧍 Character Creator</h2>
        <div style="font-size:11px;color:#484f58;margin-top:2px">
            Build appearance_json. Players use the same system in-game.
        </div>
    </div>
    <button class="edit-btn" onclick="loadManager('player_manager')">← Back</button>
</div>

<div style="display:grid;grid-template-columns:300px 1fr;gap:20px;align-items:start">

<!-- LEFT: PREVIEW -->
<div style="background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:20px">
    <div class="cc-preview">
        <div style="font-size:11px;color:#484f58;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Preview</div>
        <canvas id="cc_canvas" width="128" height="192" class="cc-canvas"
            style="width:128px;height:192px"></canvas>
        <div style="font-size:10px;color:#484f58;text-align:center">
            128×192px canvas (layers drawn bottom→top)
        </div>

        <div style="width:100%">
            <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#484f58;margin-bottom:10px;margin-top:4px">🎨 Colors</div>
            ${colorHTML}
        </div>

        <div style="width:100%;display:flex;gap:8px;flex-wrap:wrap">
            <button class="action-btn" onclick="CharacterCreator._randomize()" style="flex:1;font-size:12px">🎲 Randomize</button>
            <button class="action-btn" onclick="CharacterCreator._exportJSON()" style="flex:1;font-size:12px;background:#21262d;color:#8b949e">📋 Copy JSON</button>
        </div>

        ${CharacterCreator._char ? `
        <button class="action-btn save-btn" style="width:100%;font-size:13px"
            onclick="CharacterCreator._save()">💾 Save to Character</button>` : ''}
    </div>
</div>

<!-- RIGHT: SLOTS -->
<div>
    <div style="background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:16px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#484f58;margin-bottom:14px">
            🗂️ Sprite Slots
        </div>
        <div style="font-size:12px;color:#484f58;margin-bottom:12px;background:#161b22;border-radius:6px;padding:10px;line-height:1.6">
            Enter the <b style="color:#bb86fc">filename without extension</b> for each layer.<br>
            Files must exist at <code style="color:#3fb950">/assets/sprites/characters/[folder]/[name].png</code><br>
            Leave blank to skip that layer. Layers render bottom→top (body first, accessories last).
        </div>
        ${slotHTML}
    </div>

    <div style="background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:16px">
        <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#484f58;margin-bottom:10px">
            📄 Appearance JSON (live)
        </div>
        <pre id="cc_json_preview" style="font-family:monospace;font-size:11px;color:#8b949e;
            background:#010409;border-radius:6px;padding:12px;overflow-x:auto;max-height:180px;
            white-space:pre-wrap;word-break:break-all"></pre>
    </div>
</div>
</div>`;

        CharacterCreator._drawPreview();
        CharacterCreator._updateJSONPreview();
    },

    _update(key, value) {
        CharacterCreator._state[key] = value.trim();
        CharacterCreator._drawPreview();
        CharacterCreator._updateJSONPreview();
    },

    _updateColor(key, value) {
        CharacterCreator._state.colors[key] = value;
        // Sync text and color inputs
        CharacterCreator._drawPreview();
        CharacterCreator._updateJSONPreview();
    },

    _clearSlot(key) {
        CharacterCreator._state[key] = '';
        const el = document.getElementById(`cc_${key}`);
        if (el) el.value = '';
        CharacterCreator._drawPreview();
        CharacterCreator._updateJSONPreview();
    },

    _drawPreview() {
        const canvas = document.getElementById('cc_canvas');
        if (!canvas) return;
        const ctx  = canvas.getContext('2d');
        const s    = CharacterCreator._state;
        const BASE = '/assets/sprites/characters/';

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw layers in order: body → head → hair → armor → weapon → acc
        const layers = [
            { key: 'body',   folder: 'bodies' },
            { key: 'head',   folder: 'heads' },
            { key: 'hair',   folder: 'hair' },
            { key: 'armor',  folder: 'armor' },
            { key: 'weapon', folder: 'weapon' },
            { key: 'acc',    folder: 'acc' },
        ];

        // Draw placeholder silhouette if no body set
        if (!s.body) {
            ctx.fillStyle = '#21262d';
            ctx.beginPath();
            ctx.arc(64, 48, 28, 0, Math.PI * 2); // head
            ctx.fill();
            ctx.fillRect(36, 80, 56, 72); // body
            ctx.fillRect(20, 80, 20, 60); // left arm
            ctx.fillRect(88, 80, 20, 60); // right arm
            ctx.fillRect(36, 154, 22, 38); // left leg
            ctx.fillRect(70, 154, 22, 38); // right leg
            ctx.fillStyle = '#30363d';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('No assets', 64, 180);
            return;
        }

        let layersDone = 0;
        const total = layers.filter(l => s[l.key]).length;
        if (total === 0) return;

        layers.forEach(l => {
            if (!s[l.key]) return;
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                layersDone++;
            };
            img.onerror = () => {
                // Draw a red outline for missing files
                ctx.strokeStyle = 'rgba(248,81,73,.4)';
                ctx.strokeRect(2, 2, canvas.width-4, canvas.height-4);
                layersDone++;
            };
            img.src = `${BASE}${l.folder}/${s[l.key]}.png?t=${Date.now()}`;
        });
    },

    _updateJSONPreview() {
        const el = document.getElementById('cc_json_preview');
        if (el) el.textContent = JSON.stringify(CharacterCreator._state, null, 2);
    },

    _randomize() {
        // Randomly cycles through placeholder names — adapt to your actual filenames
        const bases = ['human_m', 'human_f', 'elf_m', 'elf_f', 'orc_m', 'dwarf_m'];
        const base = bases[Math.floor(Math.random() * bases.length)];
        CharacterCreator._state.body = `body_${base}`;
        CharacterCreator._state.head = `head_${base}_0${Math.ceil(Math.random()*3)}`;
        const hairStyles = ['short_01','long_01','mohawk_01','bald'];
        CharacterCreator._state.hair = `hair_${hairStyles[Math.floor(Math.random()*hairStyles.length)]}`;
        const skinTones = ['#fde3b4','#d4a574','#8d5524','#3d2a1e'];
        CharacterCreator._state.colors.skin = skinTones[Math.floor(Math.random()*skinTones.length)];
        CharacterCreator._renderUI();
    },

    _exportJSON() {
        const json = JSON.stringify(CharacterCreator._state, null, 2);
        navigator.clipboard.writeText(json).then(() => alert('Appearance JSON copied to clipboard!'));
    },

    async _save() {
        const charId = CharacterCreator._char;
        if (!charId) return;
        const r = await fetch('/update-appearance', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId, appearance: CharacterCreator._state })
        });
        const d = await r.json();
        if (d.success) {
            const btn = document.querySelector('.save-btn');
            if (btn) { btn.textContent = '✅ Saved!'; btn.style.background = '#3fb950'; }
            setTimeout(() => { if (btn) { btn.textContent = '💾 Save to Character'; btn.style.background = ''; } }, 2000);
        } else alert('Save failed: ' + d.message);
    }
};
