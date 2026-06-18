const BgManager = {
    config: {
        type: 'bg',
        tableColumns: ['name', 'bonus_hp'],
        formFields: ['name', 'description', 'bonus_hp', 'bonus_mp']
    },

    init: async () => {
        document.getElementById('pageTitle').innerText = "BACKGROUND EDITOR";
        const res = await API.getAll('bg');
        if (res.success) BgManager.renderTable(res.data);
    },

    renderTable: (data) => {
        let html = `<button class="action-btn save-btn" onclick="BgManager.edit(null)">+ NEW BACKGROUND</button>`;
        html += `<table><thead><tr><th>NAME</th><th>HP+</th><th>ACTIONS</th></tr></thead><tbody>`;
        data.forEach(item => {
            html += `<tr>
                <td><b>${item.name}</b><br><small>${item.description}</small></td>
                <td>${item.bonus_hp || 0}</td>
                <td>
                    <button class="edit-btn" onclick='BgManager.edit(${JSON.stringify(item)})'>EDIT</button>
                    <button class="del-btn" onclick="BgManager.delete(${item.id})">DEL</button>
                </td>
            </tr>`;
        });
        html += `</tbody></table>`;
        document.getElementById('dynamicArea').innerHTML = html;
    },

    edit: (item) => {
        const data = item || {};
        let html = `<div class="editor-box visible"><h3>${item ? "Edit Background" : "New Background"}</h3>
            <input type="hidden" id="editId" value="${data.id || ''}">`;
        BgManager.config.formFields.forEach(f => {
            html += `<label>${f.toUpperCase()}</label><input type="text" id="in_${f}" value="${data[f] || ''}">`;
        });
        html += `<div style="display:flex; gap:10px; margin-top:10px;">
            <button class="action-btn save-btn" onclick="BgManager.save()">SAVE</button>
            <button class="action-btn" onclick="BgManager.init()">CANCEL</button>
        </div></div>`;
        document.getElementById('dynamicArea').innerHTML = html;
    },

    save: async () => {
        const id = document.getElementById('editId').value;
        const payload = {};
        BgManager.config.formFields.forEach(f => payload[f] = document.getElementById(`in_${f}`).value);
        const res = await API.save('bg', payload, id);
        if(res.success) { alert("Saved!"); BgManager.init(); }
    },

    delete: async (id) => {
        const res = await API.delete('bg', id);
        if(res.success) BgManager.init();
    }
};