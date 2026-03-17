const FeatManager = {
    config: {
        type: 'feat',
        tableColumns: ['name', 'effect_code'],
        formFields: ['name', 'description', 'effect_code']
    },

    init: async () => {
        document.getElementById('pageTitle').innerText = "FEAT EDITOR";
        const res = await API.getAll('feat');
        if (res.success) FeatManager.renderTable(res.data);
    },

    renderTable: (data) => {
        let html = `<button class="action-btn save-btn" onclick="FeatManager.edit(null)">+ NEW FEAT</button>`;
        html += `<table><thead><tr><th>NAME</th><th>CODE</th><th>ACTIONS</th></tr></thead><tbody>`;
        data.forEach(item => {
            html += `<tr>
                <td><b>${item.name}</b></td>
                <td><code>${item.effect_code || 'NONE'}</code></td>
                <td>
                    <button class="edit-btn" onclick='FeatManager.edit(${JSON.stringify(item)})'>EDIT</button>
                    <button class="del-btn" onclick="FeatManager.delete(${item.id})">DEL</button>
                </td>
            </tr>`;
        });
        html += `</tbody></table>`;
        document.getElementById('dynamicArea').innerHTML = html;
    },

    edit: (item) => {
        const data = item || {};
        let html = `<div class="editor-box visible"><h3>${item ? "Edit Feat" : "New Feat"}</h3>
            <input type="hidden" id="editId" value="${data.id || ''}">`;
        FeatManager.config.formFields.forEach(f => {
            html += `<label>${f.toUpperCase()}</label><input type="text" id="in_${f}" value="${data[f] || ''}">`;
        });
        html += `<div style="display:flex; gap:10px; margin-top:10px;">
            <button class="action-btn save-btn" onclick="FeatManager.save()">SAVE</button>
            <button class="action-btn" onclick="FeatManager.init()">CANCEL</button>
        </div></div>`;
        document.getElementById('dynamicArea').innerHTML = html;
    },

    save: async () => {
        const id = document.getElementById('editId').value;
        const payload = {};
        FeatManager.config.formFields.forEach(f => payload[f] = document.getElementById(`in_${f}`).value);
        const res = await API.save('feat', payload, id);
        if(res.success) { alert("Saved!"); FeatManager.init(); }
    },

    delete: async (id) => {
        const res = await API.delete('feat', id);
        if(res.success) FeatManager.init();
    }
};