const ArtifactManager = {
    init: async () => {
        document.getElementById('pageTitle').innerText = "ARTIFACTS";
        document.getElementById('dynamicArea').innerHTML = "Loading Artifacts...";

        const res = await API.getAll('artifact');
        if (res.success) ArtifactManager.renderList(res.data);
        else document.getElementById('dynamicArea').innerHTML = `<p class="error">${res.message || 'Failed to load artifacts'}</p>`;
    },

    renderList: (artifacts) => {
        let html = `<button class="action-btn save-btn" onclick="ArtifactManager.editArtifact(null)">+ NEW ARTIFACT</button>`;
        html += `<table><thead><tr>
            <th>ID</th><th>NAME</th><th>TYPE</th><th>RARITY</th><th>WIELDER</th><th>KILLS</th><th>ACTIONS</th>
        </tr></thead><tbody>`;

        (artifacts || []).forEach(a => {
            html += `<tr>
                <td><code>${a.artifact_id}</code></td>
                <td><b>${a.name || ''}</b></td>
                <td>${a.type || ''}</td>
                <td>${a.rarity || ''}</td>
                <td>${a.current_wielder_id || ''}</td>
                <td>${a.total_kills || 0}</td>
                <td>
                    <button class="edit-btn" onclick='ArtifactManager.editArtifact(${JSON.stringify(a)})'>EDIT</button>
                    <button class="action-btn" onclick="ArtifactManager.managePowers('${a.artifact_id}')">POWERS</button>
                    <button class="del-btn" onclick="ArtifactManager.deleteArtifact('${a.artifact_id}')">DEL</button>
                </td>
            </tr>`;
        });

        html += `</tbody></table>`;
        document.getElementById('dynamicArea').innerHTML = html;
    },

    editArtifact: (artifact) => {
        const a = artifact || {};
        const isNew = !artifact;

        const esc = (v) => (v === null || v === undefined) ? '' : String(v).replace(/"/g, '&quot;');

        let cursesText = '';
        try {
            if (typeof a.active_curses_json === 'string' && a.active_curses_json.trim()) {
                cursesText = JSON.stringify(JSON.parse(a.active_curses_json), null, 2);
            } else if (typeof a.active_curses_json === 'object') {
                cursesText = JSON.stringify(a.active_curses_json, null, 2);
            }
        } catch {
            cursesText = a.active_curses_json || '';
        }
        if (isNew && !cursesText) cursesText = '[]';

        let html = `<div class="editor-box visible">
            <h3>${isNew ? 'New Artifact' : 'Edit Artifact'}</h3>
            <input type="hidden" id="editId" value="${esc(a.artifact_id)}">

            <label>ARTIFACT ID (unique)</label>
            <input id="in_artifact_id" type="text" value="${esc(a.artifact_id)}" ${isNew ? '' : 'disabled'}>

            <label>NAME</label>
            <input id="in_name" type="text" value="${esc(a.name)}">

            <label>TYPE</label>
            <input id="in_type" type="text" value="${esc(a.type)}">

            <label>RARITY</label>
            <input id="in_rarity" type="text" value="${esc(a.rarity || 'legendary')}">

            <label>THEME</label>
            <input id="in_theme" type="text" value="${esc(a.theme)}">

            <label>DESCRIPTION</label>
            <textarea id="in_description" rows="4">${esc(a.description)}</textarea>

            <label>CURRENT WIELDER ID (character id)</label>
            <input id="in_current_wielder_id" type="number" value="${esc(a.current_wielder_id)}">

            <label>TOTAL KILLS</label>
            <input id="in_total_kills" type="number" value="${esc(a.total_kills || 0)}">

            <label>KILL STREAK</label>
            <input id="in_kill_streak" type="number" value="${esc(a.kill_streak || 0)}">

            <label>POWER MULTIPLIER</label>
            <input id="in_power_multiplier" type="number" step="0.01" value="${esc(a.power_multiplier || 1.0)}">

            <label>DECAY RATE</label>
            <input id="in_decay_rate" type="number" step="0.01" value="${esc(a.decay_rate || 0.02)}">

            <label>IS DORMANT</label>
            <input id="in_is_dormant" type="checkbox" ${(String(a.is_dormant) === '1' || a.is_dormant === 1) ? 'checked' : ''}>

            <label>ACTIVE CURSES (JSON)</label>
            <textarea id="in_active_curses_json" rows="6">${cursesText}</textarea>

            <div style="display:flex; gap:10px; margin-top:10px;">
                <button class="action-btn save-btn" onclick="ArtifactManager.saveArtifact(${isNew ? 'true' : 'false'})">SAVE</button>
                <button class="action-btn" onclick="ArtifactManager.init()">CANCEL</button>
            </div>
        </div>`;

        document.getElementById('dynamicArea').innerHTML = html;
    },

    saveArtifact: async (isNew) => {
        const existingId = document.getElementById('editId').value;
        const artifactId = document.getElementById('in_artifact_id').value;

        if (isNew && !artifactId) {
            alert('artifact_id is required');
            return;
        }

        // Validate JSON
        const cursesTxt = document.getElementById('in_active_curses_json').value || '[]';
        try { JSON.parse(cursesTxt); } catch { alert('active_curses_json must be valid JSON'); return; }

        const payload = {
            artifact_id: artifactId,
            name: document.getElementById('in_name').value,
            type: document.getElementById('in_type').value,
            rarity: document.getElementById('in_rarity').value,
            theme: document.getElementById('in_theme').value,
            description: document.getElementById('in_description').value,
            current_wielder_id: parseInt(document.getElementById('in_current_wielder_id').value || '0', 10) || null,
            total_kills: parseInt(document.getElementById('in_total_kills').value || '0', 10) || 0,
            kill_streak: parseInt(document.getElementById('in_kill_streak').value || '0', 10) || 0,
            power_multiplier: parseFloat(document.getElementById('in_power_multiplier').value || '1') || 1.0,
            decay_rate: parseFloat(document.getElementById('in_decay_rate').value || '0.02') || 0.02,
            is_dormant: document.getElementById('in_is_dormant').checked ? 1 : 0,
            active_curses_json: JSON.stringify(JSON.parse(cursesTxt))
        };

        const res = await API.save('artifact', payload, existingId || null);
        if (res.success) {
            alert('Saved!');
            ArtifactManager.init();
        } else {
            alert(res.message || 'Save failed');
        }
    },

    deleteArtifact: async (artifactId) => {
        if (!confirm(`Delete artifact '${artifactId}'?`)) return;
        const res = await API.delete('artifact', artifactId);
        if (res.success) ArtifactManager.init();
        else alert(res.message || 'Delete failed');
    },

    // ----------------------------
    // POWERS
    // ----------------------------
    managePowers: async (artifactId) => {
        document.getElementById('pageTitle').innerText = `POWERS: ${artifactId}`;
        document.getElementById('dynamicArea').innerHTML = 'Loading Powers...';

        const res = await API.getAll('artifact_power');
        if (!res.success) {
            document.getElementById('dynamicArea').innerHTML = `<p class="error">${res.message || 'Failed to load powers'}</p>`;
            return;
        }

        const powers = (res.data || []).filter(p => p.artifact_id === artifactId);

        let html = `<button class="action-btn" onclick="ArtifactManager.init()">← Back</button>
                    <button class="action-btn save-btn" onclick="ArtifactManager.editPower('${artifactId}', null)">+ NEW POWER</button>`;

        html += `<table><thead><tr>
            <th>POWER ID</th><th>NAME</th><th>TYPE</th><th>UNLOCK KILLS</th><th>ACTIONS</th>
        </tr></thead><tbody>`;

        powers.forEach(p => {
            html += `<tr>
                <td><code>${p.power_id}</code></td>
                <td><b>${p.name || ''}</b></td>
                <td>${p.power_type || 'passive'}</td>
                <td>${p.unlock_kills || 0}</td>
                <td>
                    <button class="edit-btn" onclick='ArtifactManager.editPower("${artifactId}", ${JSON.stringify(p)})'>EDIT</button>
                    <button class="del-btn" onclick='ArtifactManager.deletePower("${p.power_id}")'>DEL</button>
                </td>
            </tr>`;
        });

        html += `</tbody></table>`;
        document.getElementById('dynamicArea').innerHTML = html;
    },

    editPower: (artifactId, power) => {
        const p = power || {};
        const isNew = !power;

        const esc = (v) => (v === null || v === undefined) ? '' : String(v).replace(/"/g, '&quot;');

        let effectText = '';
        try {
            if (typeof p.effect_json === 'string' && p.effect_json.trim()) effectText = JSON.stringify(JSON.parse(p.effect_json), null, 2);
            else if (typeof p.effect_json === 'object') effectText = JSON.stringify(p.effect_json, null, 2);
        } catch {
            effectText = p.effect_json || '';
        }

        if (isNew && !effectText) effectText = JSON.stringify({ type: "custom" }, null, 2);

        let html = `<div class="editor-box visible">
            <h3>${isNew ? 'New Power' : 'Edit Power'}</h3>
            <input type="hidden" id="editId" value="${esc(p.power_id)}">

            <label>POWER ID (unique)</label>
            <input id="in_power_id" type="text" value="${esc(p.power_id)}" ${isNew ? '' : 'disabled'}>

            <label>ARTIFACT ID</label>
            <input id="in_artifact_id" type="text" value="${esc(p.artifact_id || artifactId)}" disabled>

            <label>NAME</label>
            <input id="in_name" type="text" value="${esc(p.name)}">

            <label>DESCRIPTION</label>
            <textarea id="in_description" rows="3">${esc(p.description)}</textarea>

            <label>POWER TYPE (passive/active/ultimate)</label>
            <input id="in_power_type" type="text" value="${esc(p.power_type || 'passive')}">

            <label>UNLOCK KILLS</label>
            <input id="in_unlock_kills" type="number" value="${esc(p.unlock_kills || 0)}">

            <label>RANK MAX</label>
            <input id="in_rank_max" type="number" value="${esc(p.rank_max || 1)}">

            <label>EFFECT JSON</label>
            <textarea id="in_effect_json" rows="8">${effectText}</textarea>

            <div style="display:flex; gap:10px; margin-top:10px;">
                <button class="action-btn save-btn" onclick="ArtifactManager.savePower('${artifactId}', ${isNew ? 'true' : 'false'})">SAVE</button>
                <button class="action-btn" onclick="ArtifactManager.managePowers('${artifactId}')">CANCEL</button>
            </div>
        </div>`;

        document.getElementById('dynamicArea').innerHTML = html;
    },

    savePower: async (artifactId, isNew) => {
        const existingId = document.getElementById('editId').value;
        const powerId = document.getElementById('in_power_id').value;

        if (isNew && !powerId) {
            alert('power_id is required');
            return;
        }

        const effectTxt = document.getElementById('in_effect_json').value || '{}';
        try { JSON.parse(effectTxt); } catch { alert('effect_json must be valid JSON'); return; }

        const payload = {
            power_id: powerId,
            artifact_id: artifactId,
            name: document.getElementById('in_name').value,
            description: document.getElementById('in_description').value,
            power_type: document.getElementById('in_power_type').value,
            unlock_kills: parseInt(document.getElementById('in_unlock_kills').value || '0', 10) || 0,
            rank_max: parseInt(document.getElementById('in_rank_max').value || '1', 10) || 1,
            effect_json: JSON.stringify(JSON.parse(effectTxt))
        };

        const res = await API.save('artifact_power', payload, existingId || null);
        if (res.success) {
            alert('Saved!');
            ArtifactManager.managePowers(artifactId);
        } else {
            alert(res.message || 'Save failed');
        }
    },

    deletePower: async (powerId) => {
        if (!confirm(`Delete power '${powerId}'?`)) return;
        const res = await API.delete('artifact_power', powerId);
        if (res.success) {
            // Just reload the artifacts list (safer than trying to infer which screen we were on)
            ArtifactManager.init();
        } else {
            alert(res.message || 'Delete failed');
        }
    }
};
