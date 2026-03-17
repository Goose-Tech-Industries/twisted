const GenericManager = {
    _cfg:null,_data:[],
    _isJson(n){return n.includes('json')||n==='effects'||n==='elements'||n.endsWith('_status')||n==='disabled_commands'||n==='class_restrict'||n==='battle_cmds';},
    _isTextarea(n){return n==='description'||n==='ai_persona'||this._isJson(n);},
    _esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;},
    init:async function(cfg){
        this._cfg=cfg;
        document.getElementById('pageTitle').innerText=cfg.title;
        document.getElementById('dynamicArea').innerHTML='<p style="color:#666">Loading...</p>';
        const r=await API.getAll(cfg.type);
        if(!r.success){document.getElementById('dynamicArea').innerHTML='<p style="color:red">Failed to load.</p>';return;}
        this._data=r.data;this.renderTable();
    },
    renderTable:function(){
        const{_cfg:cfg,_data:data}=this;
        let h=`<button class="action-btn save-btn" onclick="GenericManager.edit(null)">+ NEW</button>`;
        if(!data.length){h+='<p style="margin-top:16px;color:#666">No data yet.</p>';document.getElementById('dynamicArea').innerHTML=h;return;}
        h+='<table><thead><tr>';
        cfg.cols.forEach(c=>h+=`<th>${c.replace(/_/g,' ').toUpperCase()}</th>`);
        h+='<th>ACTIONS</th></tr></thead><tbody>';
        data.forEach((item,i)=>{
            h+='<tr>';
            cfg.cols.forEach(c=>{let v=item[c];if(typeof v==='object'&&v!==null)v=JSON.stringify(v);if(typeof v==='string'&&v.length>50)v=v.substring(0,47)+'...';h+=`<td>${v??'<span style="color:#484f58">—</span>'}</td>`;});
            h+=`<td><button class="edit-btn" onclick="GenericManager.edit(${i})">EDIT</button> <button class="del-btn" onclick="GenericManager.del(${i})">DEL</button></td></tr>`;
        });
        document.getElementById('dynamicArea').innerHTML=h+'</tbody></table>';
    },
    edit:function(idx){
        const cfg=this._cfg,item=idx!==null?this._data[idx]:{},pk=item.id||item.level||item.setting_key||item.module_key||'';
        let h=`<h3>${idx===null?'Create':'Edit'}</h3><input type="hidden" id="gm_pk" value="${pk}"><div class="grid-2">`;
        cfg.fields.forEach(f=>{
            const v=item[f],dv=(v!==null&&v!==undefined)?(typeof v==='object'?JSON.stringify(v,null,2):v):'';
            h+=`<div><label>${f.replace(/_/g,' ').toUpperCase()}</label>`;
            if(this._isTextarea(f))h+=`<textarea id="gm_${f}" rows="${this._isJson(f)?5:3}" style="font-size:12px">${this._esc(String(dv))}</textarea>`;
            else h+=`<input id="gm_${f}" value="${this._esc(String(dv))}">`;
            h+='</div>';
        });
        h+=`</div><div class="btn-row"><button class="action-btn save-btn" onclick="GenericManager.save()">SAVE</button><button class="action-btn" onclick="GenericManager.renderTable()" style="background:#333">CANCEL</button></div>`;
        document.getElementById('dynamicArea').innerHTML=h;
    },
    save:async function(){
        const cfg=this._cfg,pk=document.getElementById('gm_pk').value,p={};
        cfg.fields.forEach(f=>{let v=document.getElementById('gm_'+f).value;if(this._isJson(f)&&v.trim()){try{v=JSON.parse(v);}catch{}}p[f]=v;});
        const r=await API.save(cfg.type,p,pk||null);
        if(r.success){const rr=await API.getAll(cfg.type);if(rr.success)this._data=rr.data;this.renderTable();}
        else alert('Error: '+(r.message||'Failed.'));
    },
    del:async function(i){
        if(!confirm('Delete?'))return;
        const item=this._data[i],pk=item.id||item.level||item.setting_key||item.module_key;
        if((await API.delete(this._cfg.type,pk)).success){this._data.splice(i,1);this.renderTable();}
    }
};
