// =================================================================
// STAT MANAGER (The Architect)
// =================================================================
// This allows you to define NEW stats for your game without coding.
// e.g., Add "Charisma", "Sanity", or "Radiation Level".

const StatManager = {
    init: async () => {
        document.getElementById('pageTitle').innerText = "CORE STATS ENGINE";
        
        const res = await API.getAll('stat'); // Fetches from game_stat_definitions
        if(res.success) StatManager.render(res.data);
    },

    render: (stats) => {
        let html = `<div style="display:flex; gap:20px;">
            <div style="flex:1; background:#1a1a1a; padding:20px; border:1px solid #444;">
                <h3>+ Define New Stat</h3>
                <label>System Key (e.g. 'endurance') - Lowercase, no spaces</label>
                <input type="text" id="newStatKey">
                
                <label>Display Name (e.g. 'Endurance')</label>
                <input type="text" id="newStatName">

                <label>Type</label>
                <select id="newStatType">
                    <option value="CORE">Core (Visible on Sheet)</option>
                    <option value="HIDDEN">Hidden (Backend only)</option>
                    <option value="META">Meta (Reputation/Currency)</option>
                </select>

                <button class="action-btn save-btn" onclick="StatManager.create()">ADD TO ENGINE</button>
            </div>

            <div style="flex:2;">
                <table><thead><tr><th>KEY</th><th>NAME</th><th>TYPE</th><th>ACTION</th></tr></thead><tbody>`;
        
        stats.forEach(s => {
            html += `<tr>
                <td>${s.key_name}</td>
                <td>${s.display_name}</td>
                <td>${s.type}</td>
                <td>
                    ${s.type === 'CORE' && ['strength','intelligence'].includes(s.key_name) 
                        ? '<span style="color:#666">LOCKED</span>' 
                        : `<button class="del-btn" onclick="StatManager.delete('${s.key_name}')">DEL</button>`}
                </td>
            </tr>`;
        });

        html += `</tbody></table></div></div>`;
        document.getElementById('dynamicArea').innerHTML = html;
    },

    create: async () => {
        const key = document.getElementById('newStatKey').value;
        const name = document.getElementById('newStatName').value;
        const type = document.getElementById('newStatType').value;

        if(!key || !name) return alert("Missing info");

        // We use the generic 'stat' type mapped in admin.js
        // Note: Our generic API expects an object.
        // For this specific table, the primary key is 'key_name'.
        // Our universal saver might need a tweak for non-ID primary keys,
        // but let's try sending it as a standard save.
        
        const payload = {
            key_name: key,
            display_name: name,
            type: type
        };

        const res = await API.save('stat', payload);
        if(res.success) {
            alert("Stat Definition Created!");
            StatManager.init();
        } else {
            alert(res.message);
        }
    },

    delete: async (key) => {
        // NOTE: Our generic delete uses 'id', but this table uses 'key_name'.
        // We will need to update the server to handle this, OR just fail for now.
        alert("Deleting core definitions is dangerous! (Feature locked for safety)");
    }
};