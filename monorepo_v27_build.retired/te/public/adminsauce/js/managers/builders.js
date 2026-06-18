// =================================================================
// BUILDERS.JS — Visual editors for all JSON fields in AdminSauce
// =================================================================
// No admin should ever type raw JSON. This file replaces every
// textarea that expects JSON with a purpose-built visual form.
//
// BUILDERS:
//   EffectBuilder  — skills, battle commands, limit breaks (damage/heal/status)
//   StatusFxBuilder — status effects (stat_mod, per-turn, skip_turn)
//   ItemBuilder    — consumable stats_json, elements, set_status
//   QuestBuilder   — objectives_json, rewards_json
//   BattleCmdsBuilder — class battle_cmds (multi-select of commands)
//
// USAGE:
//   Each builder exposes .render(containerId, existingValue) to draw the UI
//   and .collect(containerId) to read back a parsed JS object.
// =================================================================

// ─── SHARED UTILITIES ───────────────────────────────────────────

const STAT_VARS = ['ATK','DEF','MO','MD','SPEED','LUCK','HP','MP',
                   'ENEMY_ATK','ENEMY_DEF','ENEMY_MO','ENEMY_MD'];
const STAT_MOD_KEYS = ['atk','def','mo','md','speed','luck'];
const MOODS = ['happy','fearful','angry','grieving','excited'];

// Fetch live data once and cache
const _cache = {};
async function _load(key, apiType) {
    if (_cache[key]) return _cache[key];
    const r = await API.getAll(apiType);
    _cache[key] = r.success ? r.data : [];
    return _cache[key];
}

function _esc(s) {
    const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

function _box(title, content, color='var(--a)') {
    return `<div style="background:var(--bg2);border:1px solid var(--b);border-radius:8px;
        padding:14px;margin-bottom:12px">
        <div style="color:${color};font-weight:700;font-size:12px;text-transform:uppercase;
            letter-spacing:1px;margin-bottom:10px">${title}</div>
        ${content}
    </div>`;
}

function _row(...cols) {
    return `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">${cols.join('')}</div>`;
}

function _field(label, input, width='auto') {
    return `<div style="min-width:${width}">
        <label style="font-size:11px;color:var(--td);display:block;margin-bottom:4px">${label}</label>
        ${input}
    </div>`;
}

function _formulaHint() {
    return `<div style="font-size:10px;color:#666;margin-top:6px">
        Variables: ${STAT_VARS.join(' · ')}  &nbsp;|&nbsp; Operators: + − * / ( )
        &nbsp;|&nbsp; Example: <code>MO*2.5-MD</code>
    </div>`;
}

// ================================================================
// EFFECT BUILDER — for Skills, Battle Commands, Limit Breaks
// ================================================================
// Handles: damage, heal, set_status, heal_status, elements,
//          apply_weapon_elements, apply_weapon_status, flee,
//          open_menu, log
// ================================================================
const EffectBuilder = {

    render: async (containerId, existing) => {
        const fx = (typeof existing === 'string') ? JSON.parse(existing || '{}') : (existing || {});
        const statuses  = await _load('statuses',  'status');
        const elements  = await _load('elements',  'element');
        const allCmds   = await _load('battleCmds','battle_cmd');

        // Damage section
        const hasDmg = !!fx.damage;
        const dmgFormula = fx.damage?.formula || 'ATK*2-DEF';
        const dmgRand    = fx.damage?.randomize ?? 0.1;

        // Heal section
        const hasHeal     = !!fx.heal;
        const healFormula = fx.heal?.formula || 'MO*3+50';

        // Set status
        const hasSS     = !!fx.set_status;
        const ssTarget  = fx.set_status?.target || 'enemy';
        const ssChance  = fx.set_status?.chance ?? 100;
        const ssStatuses = fx.set_status?.statuses || {};

        // Heal status
        const healStatusIds = fx.heal_status || [];

        // Elements
        const activeElems = fx.elements || [];

        // Flags
        const applyWepElems  = !!fx.apply_weapon_elements;
        const applyWepStatus = !!fx.apply_weapon_status;
        const flee           = !!fx.flee;
        const openMenu       = fx.open_menu || '';
        const logText        = fx.log || '';

        // Build set_status rows
        const ssRows = Object.entries(ssStatuses).map(([name, dur], i) =>
            `<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px" id="ebss_${containerId}_${i}">
                <select onchange="EffectBuilder._updateSSName('${containerId}',${i},this.value)" style="flex:1">
                    ${statuses.map(s=>`<option value="${_esc(s.name)}" ${s.name===name?'selected':''}>${s.icon||''} ${_esc(s.name)}</option>`).join('')}
                </select>
                <input type="number" min="1" max="99" value="${dur}"
                    onchange="EffectBuilder._updateSSDur('${containerId}',${i},this.value)"
                    style="width:60px" title="Duration (turns)">
                <span style="color:var(--td);font-size:11px">turns</span>
                <button class="del-btn" style="padding:2px 8px"
                    onclick="EffectBuilder._removeSSRow('${containerId}',${i})">✕</button>
            </div>`
        ).join('');

        // Build element checkboxes
        const elemCbs = elements.map(e =>
            `<label style="display:inline-flex;align-items:center;gap:4px;margin:3px 6px 3px 0;cursor:pointer">
                <input type="checkbox" data-eb-elem="${containerId}" value="${_esc(e.name)}"
                    ${activeElems.includes(e.name)?'checked':''}>
                <span>${e.icon||''} ${_esc(e.name)}</span>
            </label>`
        ).join('');

        // Heal status checkboxes
        const healStatCbs = statuses.map(s =>
            `<label style="display:inline-flex;align-items:center;gap:4px;margin:3px 6px 3px 0;cursor:pointer">
                <input type="checkbox" data-eb-healstat="${containerId}" value="${s.id}"
                    ${healStatusIds.includes(s.id)?'checked':''}>
                <span>${s.icon||''} ${_esc(s.name)}</span>
            </label>`
        ).join('');

        const html = `
        ${_box('⚔️ Damage', `
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;cursor:pointer">
                <input type="checkbox" id="eb_hasDmg_${containerId}" ${hasDmg?'checked':''}
                    onchange="EffectBuilder._toggle('${containerId}','dmg',this.checked)">
                <span style="font-weight:600">Deal Damage</span>
            </label>
            <div id="eb_dmg_${containerId}" style="display:${hasDmg?'block':'none'}">
                ${_row(
                    _field('Formula', `<input id="eb_dmgFormula_${containerId}" value="${_esc(dmgFormula)}" style="width:200px" placeholder="ATK*2-DEF">`, '220px'),
                    _field('Variance %', `<input type="number" id="eb_dmgRand_${containerId}" value="${Math.round(dmgRand*100)}" min="0" max="100" style="width:70px">`, '80px')
                )}
                ${_formulaHint()}
            </div>
        `)}

        ${_box('💚 Heal', `
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;cursor:pointer">
                <input type="checkbox" id="eb_hasHeal_${containerId}" ${hasHeal?'checked':''}
                    onchange="EffectBuilder._toggle('${containerId}','heal',this.checked)">
                <span style="font-weight:600">Restore HP</span>
            </label>
            <div id="eb_heal_${containerId}" style="display:${hasHeal?'block':'none'}">
                ${_row(_field('Formula', `<input id="eb_healFormula_${containerId}" value="${_esc(healFormula)}" style="width:200px" placeholder="MO*3+50">`, '220px'))}
                ${_formulaHint()}
            </div>
        `)}

        ${_box('💫 Inflict Status', `
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;cursor:pointer">
                <input type="checkbox" id="eb_hasSS_${containerId}" ${hasSS?'checked':''}
                    onchange="EffectBuilder._toggle('${containerId}','ss',this.checked)">
                <span style="font-weight:600">Apply Status Effect(s)</span>
            </label>
            <div id="eb_ss_${containerId}" style="display:${hasSS?'block':'none'}">
                ${_row(
                    _field('Target', `<select id="eb_ssTarget_${containerId}">
                        <option value="enemy" ${ssTarget==='enemy'?'selected':''}>Enemy</option>
                        <option value="self"  ${ssTarget==='self'?'selected':''}>Self</option>
                        <option value="ally"  ${ssTarget==='ally'?'selected':''}>Ally</option>
                    </select>`, '120px'),
                    _field('Chance %', `<input type="number" id="eb_ssChance_${containerId}" value="${ssChance}" min="1" max="100" style="width:70px">`, '80px')
                )}
                <div style="margin-top:10px">
                    <div style="font-size:11px;color:var(--td);margin-bottom:6px">Statuses to apply:</div>
                    <div id="eb_ssRows_${containerId}">${ssRows || '<p style="color:var(--td);font-size:12px">None added yet.</p>'}</div>
                    <button class="edit-btn" style="margin-top:6px;font-size:11px"
                        onclick="EffectBuilder._addSSRow('${containerId}')">+ Add Status</button>
                </div>
            </div>
        `)}

        ${elements.length ? _box('🔥 Elements', elemCbs) : ''}

        ${statuses.length ? _box('✨ Cure Statuses', `
            <div style="font-size:11px;color:var(--td);margin-bottom:8px">Remove these statuses from target on use:</div>
            ${healStatCbs}
        `) : ''}

        ${_box('⚙️ Other', `
            ${_row(
                _field('Battle Log Text', `<input id="eb_log_${containerId}" value="${_esc(logText)}" style="width:260px" placeholder="{name} attacks! (leave blank for default)">`, '280px'),
                _field('Open Menu', `<select id="eb_openMenu_${containerId}">
                    <option value="" ${!openMenu?'selected':''}>— None —</option>
                    <option value="Skills" ${openMenu==='Skills'?'selected':''}>Skills Menu</option>
                    <option value="Items"  ${openMenu==='Items'?'selected':''}>Items Menu</option>
                </select>`, '130px')
            )}
            <div style="display:flex;gap:20px;margin-top:10px;flex-wrap:wrap">
                <label style="cursor:pointer;display:flex;align-items:center;gap:6px">
                    <input type="checkbox" id="eb_flee_${containerId}" ${flee?'checked':''}> Flee action
                </label>
                <label style="cursor:pointer;display:flex;align-items:center;gap:6px">
                    <input type="checkbox" id="eb_wepElem_${containerId}" ${applyWepElems?'checked':''}>
                    Apply weapon elements
                </label>
                <label style="cursor:pointer;display:flex;align-items:center;gap:6px">
                    <input type="checkbox" id="eb_wepStat_${containerId}" ${applyWepStatus?'checked':''}>
                    Apply weapon status
                </label>
            </div>
        `)}

        ${_box('📍 Range & AoE (Tactical Grid)', `
            <div style="font-size:11px;color:var(--td);margin-bottom:10px">
                Only applies when the battle has a grid. Skills without range set default to melee (1 tile).
            </div>
            ${_row(
                _field('Range (tiles)', `<input type="number" id="eb_range_${containerId}"
                    value="${fx.range !== undefined ? fx.range : ''}"
                    min="1" max="99" style="width:70px" placeholder="1">
                    <div style="font-size:10px;color:#555;margin-top:2px">1=melee · 3=magic · 5=ranged · 99=global</div>`, '140px'),
                _field('AoE Blast Radius', `<input type="number" id="eb_aoeRadius_${containerId}"
                    value="${fx.aoe_radius !== undefined ? fx.aoe_radius : ''}"
                    min="0" max="10" style="width:70px" placeholder="off">
                    <div style="font-size:10px;color:#555;margin-top:2px">Hits all in N tiles of target</div>`, '160px')
            )}
            <label style="cursor:pointer;display:flex;align-items:center;gap:6px;margin-top:10px">
                <input type="checkbox" id="eb_aoeSplit_${containerId}" ${fx.aoe_split?'checked':''}/>
                Split damage per target (weaker but wide)
            </label>
        `)}

        ${_box('🔁 Multi-hit', `
            <div style="font-size:11px;color:var(--td);margin-bottom:10px">
                Fire the attack N times. Each hit rolls for on-hit procs separately.
            </div>
            ${_row(
                _field('Number of hits', `<input type="number" id="eb_hits_${containerId}"
                    value="${fx.hits !== undefined ? fx.hits : 1}"
                    min="1" max="12" style="width:70px">`, '110px')
            )}
        `)}

        ${_box('⚡ Charge-up', `
            <div style="font-size:11px;color:var(--td);margin-bottom:10px">
                Skill takes N extra turns to charge before it fires. Actor shows CHARGING during the wait.
            </div>
            ${_row(
                _field('Charge turns', `<input type="number" id="eb_chargeTurns_${containerId}"
                    value="${fx.charge_turns !== undefined ? fx.charge_turns : ''}"
                    min="1" max="5" style="width:70px" placeholder="off">`, '110px'),
                _field('Charge message', `<input id="eb_chargeMsg_${containerId}"
                    value="${_esc(fx.charge_message||'')}" style="width:230px"
                    placeholder="{name} begins charging {skill}!">`, '250px')
            )}
        `)}

        ${_box('🎯 Combo Bonus', `
            <div style="font-size:11px;color:var(--td);margin-bottom:10px">
                If the target already has the required status, deal bonus damage or extra hits.
            </div>
            ${_row(
                _field('Required status', `<select id="eb_comboReqStatus_${containerId}">
                    <option value="">— None (no combo) —</option>
                    ${statuses.map(s=>`<option value="${_esc(s.name)}"
                        ${ (fx.combo_requires?.status||'')===s.name?'selected':'' }>${s.icon||''} ${_esc(s.name)}</option>`).join('')}
                </select>`, '180px'),
                _field('Combo message', `<input id="eb_comboMsg_${containerId}"
                    value="${_esc(fx.combo_requires?.message||'')}"
                    style="width:150px" placeholder="Blindside!">`, '170px')
            )}
            ${_row(
                _field('Damage multiplier', `<input type="number" id="eb_comboDmgMult_${containerId}"
                    value="${fx.combo_bonus?.damage_mult ?? 1.5}"
                    min="1" max="10" step="0.1" style="width:70px">`, '140px'),
                _field('Extra hits', `<input type="number" id="eb_comboExtraHits_${containerId}"
                    value="${fx.combo_bonus?.extra_hits ?? 0}"
                    min="0" max="5" style="width:70px">`, '90px')
            )}
        `)}

        ${_box('⚛️ Reaction Trigger', `
            <div style="font-size:11px;color:var(--td);margin-bottom:10px">
                Fires automatically when the holder is struck (passive counter). Assign to defensive characters.
            </div>
            ${_row(
                _field('Trigger', `<select id="eb_reactionTrigger_${containerId}">
                    <option value="">— No reaction —</option>
                    <option value="on_hit"  ${fx.reaction?.trigger==='on_hit' ?'selected':''}>on_hit — fires when struck</option>
                    <option value="on_crit" ${fx.reaction?.trigger==='on_crit'?'selected':''}>on_crit — fires on crits only</option>
                </select>`, '240px'),
                _field('Chance %', `<input type="number" id="eb_reactionChance_${containerId}"
                    value="${fx.reaction?.chance ?? 30}"
                    min="1" max="100" style="width:70px">`, '80px')
            )}
        `)}`;

        document.getElementById(containerId).innerHTML = html;

        // Store status list reference for dynamic rows
        EffectBuilder._statusList = statuses;
        EffectBuilder._ssData = EffectBuilder._ssData || {};
        EffectBuilder._ssData[containerId] = { ...ssStatuses };
    },

    _toggle: (cid, section, on) => {
        const map = { dmg:'dmg', heal:'heal', ss:'ss' };
        const el = document.getElementById(`eb_${map[section]}_${cid}`);
        if (el) el.style.display = on ? 'block' : 'none';
    },

    _ssData: {},

    _addSSRow: (cid) => {
        const data = EffectBuilder._ssData[cid] || {};
        const statuses = EffectBuilder._statusList || [];
        if (!statuses.length) return;
        const first = statuses[0];
        if (!data[first.name]) data[first.name] = 2;
        EffectBuilder._ssData[cid] = data;
        // Re-render rows
        const container = document.getElementById(`eb_ssRows_${cid}`);
        const rows = Object.entries(data).map(([name, dur], i) =>
            `<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px" id="ebss_${cid}_${i}">
                <select onchange="EffectBuilder._updateSSName('${cid}',${i},this.value)" style="flex:1">
                    ${statuses.map(s=>`<option value="${_esc(s.name)}" ${s.name===name?'selected':''}>${s.icon||''} ${_esc(s.name)}</option>`).join('')}
                </select>
                <input type="number" min="1" max="99" value="${dur}"
                    onchange="EffectBuilder._updateSSDur('${cid}',${i},this.value)"
                    style="width:60px">
                <span style="color:var(--td);font-size:11px">turns</span>
                <button class="del-btn" style="padding:2px 8px"
                    onclick="EffectBuilder._removeSSRow('${cid}',${i})">✕</button>
            </div>`
        ).join('');
        container.innerHTML = rows;
    },

    _updateSSName: (cid, idx, val) => {
        const data = EffectBuilder._ssData[cid] || {};
        const entries = Object.entries(data);
        if (!entries[idx]) return;
        const [oldName, dur] = entries[idx];
        delete data[oldName];
        data[val] = dur;
        EffectBuilder._ssData[cid] = data;
    },

    _updateSSDur: (cid, idx, val) => {
        const data = EffectBuilder._ssData[cid] || {};
        const name = Object.keys(data)[idx];
        if (name) data[name] = parseInt(val) || 1;
    },

    _removeSSRow: (cid, idx) => {
        const data = EffectBuilder._ssData[cid] || {};
        const key = Object.keys(data)[idx];
        if (key) delete data[key];
        EffectBuilder._addSSRow(cid); // re-render
    },

    collect: (containerId) => {
        const cid = containerId;
        const fx = {};

        const hasDmg  = document.getElementById(`eb_hasDmg_${cid}`)?.checked;
        const hasHeal = document.getElementById(`eb_hasHeal_${cid}`)?.checked;
        const hasSS   = document.getElementById(`eb_hasSS_${cid}`)?.checked;

        if (hasDmg) {
            fx.damage = {
                formula:   document.getElementById(`eb_dmgFormula_${cid}`)?.value || 'ATK*2-DEF',
                randomize: (parseInt(document.getElementById(`eb_dmgRand_${cid}`)?.value||'10')) / 100
            };
        }

        if (hasHeal) {
            fx.heal = { formula: document.getElementById(`eb_healFormula_${cid}`)?.value || 'MO*3+50' };
        }

        if (hasSS) {
            const statuses = EffectBuilder._ssData[cid] || {};
            if (Object.keys(statuses).length) {
                fx.set_status = {
                    target:   document.getElementById(`eb_ssTarget_${cid}`)?.value || 'enemy',
                    chance:   parseInt(document.getElementById(`eb_ssChance_${cid}`)?.value || '100'),
                    statuses
                };
            }
        }

        // Elements
        const elemCbs = document.querySelectorAll(`[data-eb-elem="${cid}"]:checked`);
        if (elemCbs.length) fx.elements = [...elemCbs].map(c => c.value);

        // Heal statuses
        const healCbs = document.querySelectorAll(`[data-eb-healstat="${cid}"]:checked`);
        if (healCbs.length) fx.heal_status = [...healCbs].map(c => parseInt(c.value));

        // Flags
        if (document.getElementById(`eb_flee_${cid}`)?.checked)    fx.flee = true;
        if (document.getElementById(`eb_wepElem_${cid}`)?.checked)  fx.apply_weapon_elements = true;
        if (document.getElementById(`eb_wepStat_${cid}`)?.checked)  fx.apply_weapon_status = true;

        const menu = document.getElementById(`eb_openMenu_${cid}`)?.value;
        if (menu) fx.open_menu = menu;

        const log = document.getElementById(`eb_log_${cid}`)?.value;
        if (log) fx.log = log;

        // ── Range & AoE ───────────────────────────────────────────
        const rangeVal = document.getElementById(`eb_range_${cid}`)?.value;
        if (rangeVal !== '' && rangeVal !== undefined && rangeVal !== null) {
            const rv = parseInt(rangeVal);
            if (!isNaN(rv)) fx.range = rv;
        }
        const aoeRad = document.getElementById(`eb_aoeRadius_${cid}`)?.value;
        if (aoeRad !== '' && aoeRad !== undefined && aoeRad !== null) {
            const av = parseInt(aoeRad);
            if (!isNaN(av) && av > 0) fx.aoe_radius = av;
        }
        if (document.getElementById(`eb_aoeSplit_${cid}`)?.checked) fx.aoe_split = true;

        // ── Multi-hit ─────────────────────────────────────────────
        const hitsVal = parseInt(document.getElementById(`eb_hits_${cid}`)?.value || '1');
        if (hitsVal > 1) fx.hits = hitsVal;

        // ── Charge-up ─────────────────────────────────────────────
        const chargeTurns = document.getElementById(`eb_chargeTurns_${cid}`)?.value;
        if (chargeTurns && parseInt(chargeTurns) > 0) {
            fx.charge_turns = parseInt(chargeTurns);
            const chargeMsg = document.getElementById(`eb_chargeMsg_${cid}`)?.value;
            if (chargeMsg) fx.charge_message = chargeMsg;
        }

        // ── Combo ────────────────────────────────────────────────
        const comboStatus = document.getElementById(`eb_comboReqStatus_${cid}`)?.value;
        if (comboStatus) {
            fx.combo_requires = {
                status:  comboStatus,
                message: document.getElementById(`eb_comboMsg_${cid}`)?.value || ''
            };
            fx.combo_bonus = {
                damage_mult: parseFloat(document.getElementById(`eb_comboDmgMult_${cid}`)?.value || '1.5'),
                extra_hits:  parseInt(document.getElementById(`eb_comboExtraHits_${cid}`)?.value  || '0')
            };
        }

        // ── Reaction ─────────────────────────────────────────────
        const reactionTrigger = document.getElementById(`eb_reactionTrigger_${cid}`)?.value;
        if (reactionTrigger) {
            fx.reaction = {
                trigger: reactionTrigger,
                chance:  parseInt(document.getElementById(`eb_reactionChance_${cid}`)?.value || '30')
            };
        }

        return fx;
    }
};

// ================================================================
// STATUS FX BUILDER — for game_statuses.effects
// ================================================================
// Handles: stat_mod, damage_per_turn, heal_per_turn, skip_turn, log
// Also handles: disabled_commands (separate field)
// ================================================================
const StatusFxBuilder = {

    render: async (containerId, existing, disabledCmdsContainerId, existingDisabled) => {
        const fx   = (typeof existing === 'string') ? JSON.parse(existing || '{}') : (existing || {});
        const cmds = await _load('battleCmds','battle_cmd');

        const statMod    = fx.stat_mod          || {};
        const dmgPerTurn = fx.damage_per_turn?.formula || '';
        const healPerTurn= fx.heal_per_turn?.formula   || '';
        const skipTurn   = !!fx.skip_turn;
        const logText    = fx.log || '';
        const disabledIds= Array.isArray(existingDisabled) ? existingDisabled
                         : (typeof existingDisabled==='string' ? JSON.parse(existingDisabled||'[]') : []);

        // Stat mod rows
        const statRows = STAT_MOD_KEYS.map(stat => {
            const val = statMod[stat] || '';
            return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span style="width:60px;color:var(--td);font-size:12px;text-transform:uppercase">${stat}</span>
                <input type="number" step="0.05" min="0.1" max="5" placeholder="× (e.g. 1.5)"
                    id="sfx_stat_${stat}_${containerId}" value="${val}"
                    style="width:100px">
                <span style="color:#666;font-size:11px">× multiplier (blank = no mod)</span>
            </div>`;
        }).join('');

        const disabledCmdHtml = cmds.map(c =>
            `<label style="display:inline-flex;align-items:center;gap:4px;margin:3px 8px 3px 0;cursor:pointer">
                <input type="checkbox" data-sfx-disabled="${disabledCmdsContainerId||containerId}" value="${c.id}"
                    ${disabledIds.includes(c.id)?'checked':''}>
                <span>${c.icon||'⚔️'} ${_esc(c.name)}</span>
            </label>`
        ).join('');

        document.getElementById(containerId).innerHTML = `
        ${_box('📊 Stat Modifiers', `
            <div style="font-size:11px;color:var(--td);margin-bottom:10px">
                Leave blank for stats that aren't affected. Use 1.5 = +50%, 0.5 = -50%, 2.0 = double.
            </div>
            ${statRows}
        `)}

        ${_box('🔄 Per-Turn Effects', `
            ${_row(
                _field('Damage per turn formula', `<input id="sfx_dmgPT_${containerId}" value="${_esc(dmgPerTurn)}"
                    style="width:200px" placeholder="Leave blank if none">`, '220px'),
                _field('Heal per turn formula', `<input id="sfx_healPT_${containerId}" value="${_esc(healPerTurn)}"
                    style="width:200px" placeholder="Leave blank if none">`, '220px')
            )}
            ${_formulaHint()}
        `)}

        ${_box('⚙️ Behaviour', `
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;cursor:pointer">
                <input type="checkbox" id="sfx_skip_${containerId}" ${skipTurn?'checked':''}>
                <span><b>Skip Turn (Stun)</b> — afflicted character cannot act</span>
            </label>
            ${_field('Turn Log Message', `<input id="sfx_log_${containerId}" value="${_esc(logText)}"
                style="width:300px" placeholder="{name} is stunned! (leave blank for default)">`, '100%')}
        `)}

        ${cmds.length ? _box('🚫 Disable Commands', `
            <div style="font-size:11px;color:var(--td);margin-bottom:8px">
                These commands cannot be used while this status is active:
            </div>
            ${disabledCmdHtml}
        `) : ''}`;
    },

    collect: (containerId) => {
        const fx = {};
        const statMod = {};
        STAT_MOD_KEYS.forEach(stat => {
            const v = parseFloat(document.getElementById(`sfx_stat_${stat}_${containerId}`)?.value || '');
            if (!isNaN(v) && v > 0) statMod[stat] = v;
        });
        if (Object.keys(statMod).length) fx.stat_mod = statMod;

        const dmgPT = document.getElementById(`sfx_dmgPT_${containerId}`)?.value;
        if (dmgPT) fx.damage_per_turn = { formula: dmgPT };

        const healPT = document.getElementById(`sfx_healPT_${containerId}`)?.value;
        if (healPT) fx.heal_per_turn = { formula: healPT };

        if (document.getElementById(`sfx_skip_${containerId}`)?.checked) fx.skip_turn = true;

        const log = document.getElementById(`sfx_log_${containerId}`)?.value;
        if (log) fx.log = log;

        return fx;
    },

    collectDisabled: (containerId) => {
        const cbs = document.querySelectorAll(`[data-sfx-disabled="${containerId}"]:checked`);
        return [...cbs].map(c => parseInt(c.value));
    }
};

// ================================================================
// ITEM BUILDER — consumable stats_json, elements, set_status
// ================================================================
const ItemBuilder = {

    render: async (containerId, existingStats, existingElements, existingSetStatus) => {
        const stats    = (typeof existingStats==='string') ? JSON.parse(existingStats||'{}') : (existingStats||{});
        const elements = await _load('elements','element');
        const statuses = await _load('statuses','status');
        const activeElems = Array.isArray(existingElements) ? existingElements
                          : (typeof existingElements==='string' ? JSON.parse(existingElements||'[]') : []);
        const setStatus  = existingSetStatus || '';

        const elemCbs = elements.map(e =>
            `<label style="display:inline-flex;align-items:center;gap:4px;margin:3px 8px 3px 0;cursor:pointer">
                <input type="checkbox" data-ib-elem="${containerId}" value="${_esc(e.name)}"
                    ${activeElems.includes(e.name)?'checked':''}>
                <span>${e.icon||''} ${_esc(e.name)}</span>
            </label>`
        ).join('');

        const statusOpts = statuses.map(s =>
            `<option value="${_esc(s.name)}" ${setStatus===s.name?'selected':''}>${s.icon||''} ${_esc(s.name)}</option>`
        ).join('');

        document.getElementById(containerId).innerHTML = `
        ${_box('💊 Consumable Effect (HP/MP restore)', `
            <div style="font-size:11px;color:var(--td);margin-bottom:10px">Only fill these for CONSUMABLE items used in battle.</div>
            ${_row(
                _field('Heal HP formula', `<input id="ib_healHp_${containerId}" value="${_esc(stats.heal_hp?.formula||'')}" style="width:150px" placeholder="e.g. 50 or MO*2">`, '170px'),
                _field('Restore MP', `<input type="number" id="ib_restoreMp_${containerId}" value="${stats.restore_mp||''}" style="width:80px" placeholder="flat amt">`, '100px'),
                _field('Heal % of max HP', `<input type="number" min="0" max="100" id="ib_healPct_${containerId}" value="${stats.heal_pct||''}" style="width:80px" placeholder="0–100">`, '120px')
            )}
            ${_formulaHint()}
        `)}

        ${elements.length ? _box('🔥 Weapon Elements', `
            <div style="font-size:11px;color:var(--td);margin-bottom:8px">For weapons — element this weapon's attacks count as:</div>
            ${elemCbs}
        `) : ''}

        ${statuses.length ? _box('☠️ Weapon Status', `
            <div style="font-size:11px;color:var(--td);margin-bottom:8px">For weapons — 25% chance to inflict on hit:</div>
            <select id="ib_setStatus_${containerId}" style="width:220px">
                <option value="">— None —</option>
                ${statusOpts}
            </select>
        `) : ''}`;
    },

    collectStats: (containerId) => {
        const out = {};
        const healHp = document.getElementById(`ib_healHp_${containerId}`)?.value;
        if (healHp) out.heal_hp = { formula: healHp };
        const mp = parseInt(document.getElementById(`ib_restoreMp_${containerId}`)?.value||'');
        if (!isNaN(mp) && mp > 0) out.restore_mp = mp;
        const pct = parseInt(document.getElementById(`ib_healPct_${containerId}`)?.value||'');
        if (!isNaN(pct) && pct > 0) out.heal_pct = pct;
        return Object.keys(out).length ? out : null;
    },

    collectElements: (containerId) => {
        const cbs = document.querySelectorAll(`[data-ib-elem="${containerId}"]:checked`);
        return [...cbs].map(c => c.value);
    },

    collectSetStatus: (containerId) => {
        return document.getElementById(`ib_setStatus_${containerId}`)?.value || null;
    }
};

// ================================================================
// QUEST BUILDER — objectives_json + rewards_json
// ================================================================
const QuestBuilder = {

    _objectives: {},
    _rewards: {},

    render: (containerId, existingObj, existingRew) => {
        const objectives = (() => {
            const v = existingObj;
            if (Array.isArray(v)) return v;
            if (typeof v === 'string' && v.trim()) { try { return JSON.parse(v); } catch{} }
            return [];
        })();
        const rewards = (() => {
            const v = existingRew;
            if (typeof v === 'object' && v && !Array.isArray(v)) return v;
            if (typeof v === 'string' && v.trim()) { try { return JSON.parse(v); } catch{} }
            return {};
        })();

        QuestBuilder._objectives[containerId] = [...objectives];
        QuestBuilder._rewards[containerId]    = { ...rewards };

        document.getElementById(containerId).innerHTML = `
        ${_box('📋 Objectives', `
            <div style="font-size:11px;color:var(--td);margin-bottom:10px">
                Each objective is one step. Players advance through them via QUEST_ADVANCE script actions.
            </div>
            <div id="qb_objRows_${containerId}"></div>
            <button class="edit-btn" style="margin-top:6px" onclick="QuestBuilder._addObj('${containerId}')">+ Add Step</button>
        `)}
        ${_box('🏆 Rewards (given on completion)', `
            ${_row(
                _field('XP', `<input type="number" id="qb_xp_${containerId}" value="${rewards.xp||0}" style="width:80px" min="0">`, '90px'),
                _field('Gold', `<input type="number" id="qb_gold_${containerId}" value="${rewards.gold||0}" style="width:80px" min="0">`, '90px')
            )}
            <div style="margin-top:10px;font-size:11px;color:var(--td)">Item rewards (Item ID → Qty):</div>
            <div id="qb_itemRows_${containerId}"></div>
            <button class="edit-btn" style="margin-top:6px" onclick="QuestBuilder._addItem('${containerId}')">+ Add Item Reward</button>
        `)}`;

        QuestBuilder._renderObjs(containerId);
        QuestBuilder._renderItems(containerId);
    },

    _renderObjs: (cid) => {
        const objs = QuestBuilder._objectives[cid] || [];
        document.getElementById(`qb_objRows_${cid}`).innerHTML = objs.length
            ? objs.map((o, i) => `
                <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center">
                    <span style="color:var(--td);font-size:11px;min-width:20px">#${i+1}</span>
                    <input value="${_esc(o)}" style="flex:1"
                        onchange="QuestBuilder._objectives['${cid}'][${i}]=this.value"
                        placeholder="Step description shown to player">
                    <button class="del-btn" style="padding:2px 8px"
                        onclick="QuestBuilder._removeObj('${cid}',${i})">✕</button>
                </div>`).join('')
            : '<p style="color:var(--td);font-size:12px">No steps yet.</p>';
    },

    _addObj: (cid) => {
        QuestBuilder._objectives[cid] = QuestBuilder._objectives[cid] || [];
        QuestBuilder._objectives[cid].push('');
        QuestBuilder._renderObjs(cid);
    },

    _removeObj: (cid, i) => {
        QuestBuilder._objectives[cid].splice(i, 1);
        QuestBuilder._renderObjs(cid);
    },

    _renderItems: (cid) => {
        const items = QuestBuilder._rewards[cid]?.items || [];
        document.getElementById(`qb_itemRows_${cid}`).innerHTML = items.length
            ? items.map((r, i) => `
                <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center">
                    ${_field('Item ID', `<input type="number" value="${r.item_id||''}" style="width:80px"
                        onchange="QuestBuilder._rewards['${cid}'].items[${i}].item_id=parseInt(this.value)||0">`, '90px')}
                    ${_field('Qty', `<input type="number" value="${r.qty||1}" min="1" style="width:60px"
                        onchange="QuestBuilder._rewards['${cid}'].items[${i}].qty=parseInt(this.value)||1">`, '70px')}
                    <button class="del-btn" style="padding:2px 8px;margin-top:14px"
                        onclick="QuestBuilder._removeItem('${cid}',${i})">✕</button>
                </div>`).join('')
            : '<p style="color:var(--td);font-size:12px">No item rewards.</p>';
    },

    _addItem: (cid) => {
        const r = QuestBuilder._rewards[cid] = QuestBuilder._rewards[cid] || {};
        r.items = r.items || [];
        r.items.push({ item_id: 0, qty: 1 });
        QuestBuilder._renderItems(cid);
    },

    _removeItem: (cid, i) => {
        QuestBuilder._rewards[cid].items.splice(i, 1);
        QuestBuilder._renderItems(cid);
    },

    collectObjectives: (containerId) => QuestBuilder._objectives[containerId] || [],

    collectRewards: (containerId) => {
        const r = QuestBuilder._rewards[containerId] || {};
        const xp   = parseInt(document.getElementById(`qb_xp_${containerId}`)?.value   || '0');
        const gold = parseInt(document.getElementById(`qb_gold_${containerId}`)?.value  || '0');
        const out = {};
        if (xp)   out.xp   = xp;
        if (gold) out.gold = gold;
        if (r.items?.length) out.items = r.items.filter(i => i.item_id > 0);
        return out;
    }
};

// ================================================================
// BATTLE CMDS BUILDER — class battle_cmds JSON (array of IDs)
// ================================================================
const BattleCmdsBuilder = {

    render: async (containerId, existing) => {
        const ids = Array.isArray(existing) ? existing
                  : (typeof existing === 'string' ? JSON.parse(existing || '[]') : []);
        const cmds = await _load('battleCmds','battle_cmd');

        document.getElementById(containerId).innerHTML = _box('⚔️ Extra Battle Commands',
            `<div style="font-size:11px;color:var(--td);margin-bottom:10px">
                Attack and Defend are always available. Add extra commands this class can use:
            </div>
            ${cmds.filter(c => !c.is_default).map(c =>
                `<label style="display:inline-flex;align-items:center;gap:6px;margin:4px 12px 4px 0;cursor:pointer">
                    <input type="checkbox" data-bcb="${containerId}" value="${c.id}"
                        ${ids.includes(c.id)?'checked':''}>
                    <span>${c.icon||'⚔️'} ${_esc(c.name)}</span>
                    ${c.description ? `<span style="color:#666;font-size:10px">— ${_esc(c.description)}</span>` : ''}
                </label>`
            ).join('')}
            ${!cmds.filter(c=>!c.is_default).length ? '<p style="color:var(--td);font-size:12px">No extra commands defined yet.</p>' : ''}`
        );
    },

    collect: (containerId) => {
        const cbs = document.querySelectorAll(`[data-bcb="${containerId}"]:checked`);
        return [...cbs].map(c => parseInt(c.value));
    }
};
