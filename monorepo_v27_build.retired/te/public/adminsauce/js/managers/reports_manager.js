// =================================================================
// REPORTS MANAGER  v1.0  — AdminSauce
// =================================================================
// TEACHING: This gives moderators a place to see all reports filed
// against players. They can mark them as reviewed, dismissed, or
// actioned (meaning they took action against the reported player).
//
// Reports come from two places:
//   1. The 🚩 Report button on public profile pages
//   2. The 🚩 Report button in the in-game player inspect card
//
// Filters: open (new), all, by status
// Actions: Review, Dismiss, Action (ban/mute handled separately in GM Tools)
// =================================================================

const ReportsManager = {
    _reports: [],
    _filter: 'open',

    init() {
        ReportsManager.load();
    },

    async load() {
        ReportsManager._setContent(`
        <div class="rm-header">
            <div class="rm-title">🚩 Player Reports</div>
            <div class="rm-filters">
                ${['open','reviewed','dismissed','actioned','all'].map(f =>
                    `<button class="rm-filter-btn ${f === ReportsManager._filter ? 'rm-filter-active' : ''}"
                        onclick="ReportsManager._setFilter('${f}')">${f.charAt(0).toUpperCase()+f.slice(1)}</button>`
                ).join('')}
            </div>
        </div>
        <div class="rm-loading">Loading reports…</div>`);

        try {
            const r = await fetch('/api/admin/reports?status=' + ReportsManager._filter, { credentials: 'include' });
            const d = await r.json();
            if (!d.success) { ReportsManager._setContent(`<div class="rm-error">❌ ${d.error}</div>`); return; }
            ReportsManager._reports = d.reports || [];
            ReportsManager._renderList();
        } catch(e) {
            ReportsManager._setContent(`<div class="rm-error">❌ ${e.message}</div>`);
        }
    },

    _setFilter(f) {
        ReportsManager._filter = f;
        ReportsManager.load();
    },

    _renderList() {
        const reports = ReportsManager._reports;
        const filterBtns = ['open','reviewed','dismissed','actioned','all'].map(f =>
            `<button class="rm-filter-btn ${f === ReportsManager._filter ? 'rm-filter-active' : ''}"
                onclick="ReportsManager._setFilter('${f}')">${f.charAt(0).toUpperCase()+f.slice(1)}</button>`
        ).join('');

        const STATUS_COLORS = {
            open:      '#f85149',
            reviewed:  '#58a6ff',
            dismissed: '#484f58',
            actioned:  '#3fb950',
        };
        const REASON_LABELS = {
            harassment:     '😡 Harassment',
            cheating:       '🎲 Cheating',
            spam:           '📢 Spam',
            offensive_name: '🔤 Offensive Name',
            bug_abuse:      '🐛 Bug Abuse',
            other:          '❓ Other',
        };

        const rows = reports.length === 0
            ? `<div class="rm-empty">No ${ReportsManager._filter === 'all' ? '' : ReportsManager._filter} reports.</div>`
            : reports.map(r => {
                const color = STATUS_COLORS[r.status] || '#8b949e';
                const when  = new Date(r.created_at).toLocaleDateString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
                return `
                <div class="rm-row" id="rmRow_${r.id}">
                    <div class="rm-row-left">
                        <div class="rm-reported">
                            <span class="rm-name">${ReportsManager._esc(r.reported_name)}</span>
                            <span class="rm-badge" style="background:${color}22;border-color:${color}55;color:${color}">
                                ${r.status}
                            </span>
                        </div>
                        <div class="rm-reason">${REASON_LABELS[r.reason] || r.reason}</div>
                        <div class="rm-meta">
                            Reported by <strong>${ReportsManager._esc(r.reporter_name)}</strong> · ${when}
                        </div>
                        ${r.details ? `<div class="rm-details">"${ReportsManager._esc(r.details)}"</div>` : ''}
                    </div>
                    <div class="rm-row-actions">
                        <a class="rm-link" href="/profile/${encodeURIComponent(r.reported_name)}" target="_blank">👤 Profile</a>
                        ${r.status === 'open' ? `
                        <button class="rm-action-btn rm-btn-review"
                            onclick="ReportsManager._updateStatus(${r.id},'reviewed')">✅ Review</button>
                        <button class="rm-action-btn rm-btn-dismiss"
                            onclick="ReportsManager._updateStatus(${r.id},'dismissed')">❌ Dismiss</button>
                        <button class="rm-action-btn rm-btn-action"
                            onclick="ReportsManager._updateStatus(${r.id},'actioned')">⚡ Action</button>
                        ` : r.status === 'reviewed' ? `
                        <button class="rm-action-btn rm-btn-dismiss"
                            onclick="ReportsManager._updateStatus(${r.id},'dismissed')">❌ Dismiss</button>
                        <button class="rm-action-btn rm-btn-action"
                            onclick="ReportsManager._updateStatus(${r.id},'actioned')">⚡ Action</button>
                        ` : ''}
                    </div>
                </div>`;
            }).join('');

        ReportsManager._setContent(`
        <div class="rm-header">
            <div class="rm-title">🚩 Player Reports <span class="rm-count">${reports.length}</span></div>
            <div class="rm-filters">${filterBtns}</div>
        </div>
        <div class="rm-list">${rows}</div>
        <style>
        .rm-header { display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #21262d;flex-wrap:wrap;gap:8px; }
        .rm-title { font-size:13px;font-weight:bold;color:#e8eef6;display:flex;align-items:center;gap:8px; }
        .rm-count { background:#f8514920;border:1px solid #f8514940;color:#f85149;border-radius:10px;padding:2px 8px;font-size:11px; }
        .rm-filters { display:flex;gap:5px; }
        .rm-filter-btn { padding:5px 10px;border-radius:5px;border:1px solid #30363d;background:rgba(255,255,255,0.03);color:#484f58;cursor:pointer;font-size:11px;font-family:'Courier New',monospace; }
        .rm-filter-btn:hover { color:#8b949e; }
        .rm-filter-active { background:rgba(248,81,73,.12);border-color:rgba(248,81,73,.3);color:#f85149 !important; }
        .rm-loading,.rm-empty,.rm-error { padding:40px;text-align:center;color:#484f58;font-size:12px; }
        .rm-error { color:#f85149; }
        .rm-list { overflow-y:auto;max-height:calc(100vh - 120px); }
        .rm-row { display:flex;justify-content:space-between;align-items:flex-start;padding:14px 16px;border-bottom:1px solid #21262d;gap:12px; }
        .rm-row:hover { background:rgba(255,255,255,0.02); }
        .rm-row-left { flex:1;min-width:0; }
        .rm-reported { display:flex;align-items:center;gap:8px;margin-bottom:4px; }
        .rm-name { font-size:14px;font-weight:bold;color:#e8eef6; }
        .rm-badge { padding:2px 8px;border-radius:10px;font-size:10px;border:1px solid;text-transform:uppercase;letter-spacing:.5px; }
        .rm-reason { font-size:12px;color:#bb86fc;margin-bottom:3px; }
        .rm-meta { font-size:11px;color:#484f58;margin-bottom:4px; }
        .rm-details { font-size:11px;color:#8b949e;font-style:italic;background:rgba(255,255,255,0.02);border-left:2px solid #30363d;padding:4px 8px;border-radius:3px; }
        .rm-row-actions { display:flex;flex-direction:column;gap:5px;flex-shrink:0; }
        .rm-action-btn { padding:5px 10px;border-radius:5px;cursor:pointer;font-size:11px;font-family:'Courier New',monospace;border:1px solid;white-space:nowrap; }
        .rm-btn-review  { background:rgba(88,166,255,.1);border-color:rgba(88,166,255,.3);color:#58a6ff; }
        .rm-btn-dismiss { background:rgba(72,79,88,.15);border-color:#30363d;color:#8b949e; }
        .rm-btn-action  { background:rgba(63,185,80,.1);border-color:rgba(63,185,80,.3);color:#3fb950; }
        .rm-action-btn:hover { filter:brightness(1.2); }
        .rm-link { font-size:11px;color:#484f58;text-decoration:none;padding:5px 8px;border:1px solid #21262d;border-radius:5px;white-space:nowrap; }
        .rm-link:hover { color:#8b949e; }
        </style>`);
    },

    async _updateStatus(reportId, status) {
        try {
            const r = await fetch('/api/admin/reports/update', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reportId, status })
            });
            const d = await r.json();
            if (d.success) {
                // Update in local list
                const rep = ReportsManager._reports.find(r => r.id === reportId);
                if (rep) rep.status = status;
                // Remove from view if we're filtering by open and it's no longer open
                if (ReportsManager._filter === 'open' && status !== 'open') {
                    ReportsManager._reports = ReportsManager._reports.filter(r => r.id !== reportId);
                }
                ReportsManager._renderList();
            } else {
                alert('❌ ' + (d.error || 'Failed to update.'));
            }
        } catch(e) { alert('❌ ' + e.message); }
    },

    _setContent(html) {
        const el = document.getElementById('managerContent');
        if (el) el.innerHTML = html;
    },

    _esc(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    },
};
