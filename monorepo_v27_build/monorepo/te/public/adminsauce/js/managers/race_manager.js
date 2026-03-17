const RaceManager = {
    _d:[],
    init:async()=>{document.getElementById('pageTitle').innerText="RACE EDITOR";const r=await API.getAll('race');if(r.success){RaceManager._d=r.data;RaceManager.renderTable();}},
    renderTable:()=>{
        const d=RaceManager._d;let h=`<button class="action-btn save-btn" onclick="RaceManager.edit(null)">+ NEW RACE</button>`;
        h+=`<table><thead><tr><th>NAME</th><th>HP+</th><th>ATK+</th><th>DEF+</th><th>MO+</th><th>MD+</th><th>SPD+</th><th>LCK+</th><th>ACTIONS</th></tr></thead><tbody>`;
        d.forEach((i,idx)=>{h+=`<tr><td><b>${i.name}</b></td><td>${i.bonus_hp||0}</td><td>${i.bonus_atk||0}</td><td>${i.bonus_def||0}</td><td>${i.bonus_mo||0}</td><td>${i.bonus_md||0}</td><td>${i.bonus_speed||0}</td><td>${i.bonus_luck||0}</td><td><button class="edit-btn" onclick="RaceManager.edit(RaceManager._d[${idx}])">EDIT</button> <button class="del-btn" onclick="RaceManager.del(${i.id})">DEL</button></td></tr>`;});
        document.getElementById('dynamicArea').innerHTML=h+'</tbody></table>';
    },
    edit:(item)=>{
        const d=item||{},f=['name','description','bonus_hp','bonus_mp','bonus_atk','bonus_def','bonus_mo','bonus_md','bonus_speed','bonus_luck'];
        let h=`<h3>${item?'Edit':'New'} Race</h3><input type="hidden" id="editId" value="${d.id||''}"><div class="grid-2">`;
        f.forEach(fi=>{const v=d[fi]!==undefined?d[fi]:'';h+=fi==='description'?`<div style="grid-column:span 2"><label>DESCRIPTION</label><textarea id="in_${fi}" rows="2">${v}</textarea></div>`:`<div><label>${fi.replace('bonus_','').toUpperCase()}+</label><input id="in_${fi}" value="${v}"></div>`;});
        h+=`</div><div class="btn-row"><button class="action-btn save-btn" onclick="RaceManager.save()">SAVE</button><button class="action-btn" onclick="RaceManager.init()" style="background:#333">CANCEL</button></div>`;
        document.getElementById('dynamicArea').innerHTML=h;
    },
    save:async()=>{const id=document.getElementById('editId').value,f=['name','description','bonus_hp','bonus_mp','bonus_atk','bonus_def','bonus_mo','bonus_md','bonus_speed','bonus_luck'],p={};f.forEach(fi=>p[fi]=document.getElementById('in_'+fi).value);if((await API.save('race',p,id||null)).success)RaceManager.init();},
    del:async(id)=>{if(confirm('Delete?')){await API.delete('race',id);RaceManager.init();}}
};
