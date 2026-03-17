// =================================================================
// QUEST BOARD UI
// =================================================================
// In-game quest board. Opens with 'B' key or by interacting with a
// Quest Board object on the map (event type QUEST_BOARD).
// Shows dynamically gated quests matching current world/region state.
// =================================================================

const QuestBoardUI = {
    _open:   false,
    _charId: null,
    _mapId:  null,
    _quests: [],

    open: async (charId, mapId) => {
        QuestBoardUI._charId = charId;
        QuestBoardUI._mapId  = mapId;
        QuestBoardUI._open   = true;
        QuestBoardUI._ensurePanel();
        await QuestBoardUI._load();
    },

    close: () => {
        QuestBoardUI._open = false;
        const el = document.getElementById('questboard_panel');
        if (el) el.remove();
    },

    _ensurePanel: () => {
        let el = document.getElementById('questboard_panel');
        if (el) return;
        el = document.createElement('div');
        el.id = 'questboard_panel';
        el.style.cssText = `
            position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
            width:min(95vw,660px); height:min(90vh,520px);
            background:#0d0d1a; border:1px solid #2a2a4a;
            border-radius:12px; box-shadow:0 0 40px rgba(0,0,0,.8);
            display:flex; flex-direction:column; z-index:1000;
            font-family:'Courier New',monospace; color:#e8eef6;
        `;
        el.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;
            padding:14px 18px;border-bottom:1px solid #1a1a2a;background:#08081a;border-radius:12px 12px 0 0">
            <div style="font-size:14px;font-weight:700;color:#0cf">📋 QUEST BOARD</div>
            <button onclick="QuestBoardUI.close()"
                style="padding:5px 12px;background:transparent;border:1px solid #333;color:#888;
                cursor:pointer;border-radius:6px;font-family:monospace;font-size:12px">✕</button>
        </div>
        <div id="qb_body" style="overflow-y:auto;flex:1;padding:16px">
            <div style="text-align:center;padding:40px;color:#555">Loading...</div>
        </div>`;
        document.body.appendChild(el);
    },

    _load: async () => {
        const j = await fetch('/api/questboard/available', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId: QuestBoardUI._charId, mapId: QuestBoardUI._mapId })
        }).then(r => r.json()).catch(() => ({ success: false, quests: [] }));

        QuestBoardUI._quests = j.quests || [];
        QuestBoardUI._render(j.regionId);
    },

    _render: (regionId) => {
        const body = document.getElementById('qb_body');
        if (!body) return;
        const quests = QuestBoardUI._quests;

        if (!quests.length) {
            body.innerHTML = `<div style="text-align:center;padding:40px;color:#555">
                <div style="font-size:24px;margin-bottom:12px">📜</div>
                No quests available right now.<br>
                <span style="font-size:11px;color:#333">Check back when world events change.</span>
            </div>`;
            return;
        }

        const TYPE_COLOR = { BOARD:'#0cf', EVENT:'#bb86fc', FACTION:'#f80', REGIONAL:'#0a0' };

        let h = `<div style="font-size:11px;color:#555;margin-bottom:14px">
            ${quests.length} quest${quests.length!==1?'s':''} available in this area.
        </div>`;

        for (const q of quests) {
            const objs = q.objectives || [];
            const rew  = q.rewards    || {};
            const rewardParts = [];
            if (rew.xp)   rewardParts.push(`${rew.xp} XP`);
            if (rew.gold) rewardParts.push(`${rew.gold}g`);
            if (Array.isArray(rew.items) && rew.items.length) rewardParts.push(`${rew.items.length} item(s)`);

            h += `
            <div style="background:#0a0a18;border:1px solid #1a1a2a;border-radius:8px;
                padding:14px;margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                    <div>
                        <span style="color:${TYPE_COLOR[q.quest_type]||'#aaa'};font-size:10px;
                            text-transform:uppercase;font-weight:700;margin-right:8px">${q.quest_type}</span>
                        <b style="font-size:13px">${q.title}</b>
                        ${q.faction ? `<span style="font-size:10px;color:#f80;margin-left:8px">[${q.faction}]</span>` : ''}
                    </div>
                    <button onclick="QuestBoardUI._accept(${q.id},'${q.title.replace(/'/g,"&#39;")}')"
                        style="padding:5px 14px;background:#001a0a;border:1px solid #0a4;color:#0f0;
                        cursor:pointer;border-radius:6px;font-family:monospace;font-size:11px;white-space:nowrap">
                        ACCEPT
                    </button>
                </div>
                <div style="font-size:11px;color:#888;margin-bottom:8px">${q.description||''}</div>
                ${objs.length ? `
                <div style="font-size:10px;color:#555;margin-bottom:6px">Objectives:</div>
                <div style="font-size:11px;color:#aaa;margin-bottom:8px">
                    ${objs.map(o => `▸ ${o.description || (o.type + ': ' + o.target + (o.count > 1 ? ' ×'+o.count : ''))}`).join('<br>')}
                </div>` : ''}
                <div style="font-size:10px;color:#ffd700">
                    Rewards: ${rewardParts.join(', ') || '—'}
                    ${q.expires_at ? `<span style="color:#555;margin-left:8px">Expires: ${new Date(q.expires_at).toLocaleDateString()}</span>` : ''}
                    ${q.max_completions ? `<span style="color:#555;margin-left:8px">${q.times_completed}/${q.max_completions} completed</span>` : ''}
                </div>
            </div>`;
        }

        body.innerHTML = h;
    },

    _accept: async (questId, title) => {
        const j = await fetch('/api/questboard/accept', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId: QuestBoardUI._charId, questId, mapId: QuestBoardUI._mapId })
        }).then(r => r.json()).catch(() => ({ success: false, message: 'Server error.' }));

        if (typeof showNotification === 'function') {
            showNotification(j.message, j.success ? 'xp' : 'damage');
        }
        if (j.success) {
            // Re-render to remove accepted quest from list
            await QuestBoardUI._load();
        }
    }
};
