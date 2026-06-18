// =================================================================
// REFERRAL MANAGER  v1.0  — AdminSauce
// =================================================================
// Shows overall referral program health and a leaderboard of the
// players who have referred the most people.
// =================================================================

const ReferralManager = {

    init() { ReferralManager.load(); },

    async load() {
        ReferralManager._setContent(`<div style="padding:40px;text-align:center;color:#484f58;font-size:12px">Loading referral data…</div>`);
        try {
            const r = await fetch('/api/admin/referrals', { credentials: 'include' });
            const d = await r.json();
            if (!d.success) {
                ReferralManager._setContent(`<div style="padding:40px;color:#f85149;font-size:12px">❌ ${d.error}</div>`);
                return;
            }
            ReferralManager._render(d);
        } catch(e) {
            ReferralManager._setContent(`<div style="padding:40px;color:#f85149;font-size:12px">❌ ${e.message}</div>`);
        }
    },

    _render({ topReferrers, totals }) {
        const pending = (totals.total_referred || 0) - (totals.total_paid || 0);

        const rows = topReferrers.length === 0
            ? `<tr><td colspan="4" style="text-align:center;color:#484f58;padding:24px">No referrals yet.</td></tr>`
            : topReferrers.map((r, i) => `
            <tr style="border-bottom:1px solid #21262d">
                <td style="padding:10px 12px;color:#484f58;font-size:12px">#${i + 1}</td>
                <td style="padding:10px 12px">
                    <a href="/profile/${encodeURIComponent(r.char_name)}" target="_blank"
                       style="color:#bb86fc;text-decoration:none;font-size:13px;font-weight:bold">
                        ${ReferralManager._esc(r.char_name || '(no character)')}
                    </a>
                </td>
                <td style="padding:10px 12px;text-align:center">
                    <span style="color:#e8eef6;font-size:13px;font-weight:bold">${r.total_referred}</span>
                </td>
                <td style="padding:10px 12px;text-align:center">
                    <span style="color:#3fb950;font-size:13px;font-weight:bold">${r.total_paid || 0}</span>
                    ${r.total_paid < r.total_referred
                        ? `<span style="color:#484f58;font-size:11px"> / ${r.total_referred - (r.total_paid||0)} pending</span>`
                        : ''}
                </td>
            </tr>`).join('');

        ReferralManager._setContent(`
        <div style="padding:16px 16px 8px;border-bottom:1px solid #21262d;display:flex;align-items:center;justify-content:space-between">
            <div style="font-size:13px;font-weight:bold;color:#e8eef6">🔗 Referral Program</div>
            <button onclick="ReferralManager.load()"
                style="padding:5px 12px;border-radius:6px;border:1px solid #30363d;
                       background:rgba(255,255,255,.04);color:#8b949e;cursor:pointer;
                       font-size:11px;font-family:'Courier New',monospace">↻ Refresh</button>
        </div>

        <div style="display:flex;gap:0;border-bottom:1px solid #21262d">
            ${[
                ['Total Referred', totals.total_referred || 0, '#bb86fc'],
                ['Rewards Paid',   totals.total_paid    || 0, '#3fb950'],
                ['Pending',        pending,                    '#f39c12'],
            ].map(([label, val, color]) => `
            <div style="flex:1;padding:18px;text-align:center;border-right:1px solid #21262d">
                <div style="font-size:26px;font-weight:bold;color:${color}">${val}</div>
                <div style="font-size:10px;color:#484f58;text-transform:uppercase;letter-spacing:.5px;margin-top:2px">${label}</div>
            </div>`).join('')}
        </div>

        <div style="padding:12px 16px;font-size:11px;color:#484f58;border-bottom:1px solid #21262d">
            Configure reward amounts in <strong style="color:#8b949e">Settings → 🔗 Referral Rewards</strong>
        </div>

        <table style="width:100%;border-collapse:collapse">
            <thead>
                <tr style="border-bottom:1px solid #30363d">
                    <th style="padding:8px 12px;text-align:left;font-size:10px;color:#484f58;text-transform:uppercase;letter-spacing:.5px;font-weight:normal">#</th>
                    <th style="padding:8px 12px;text-align:left;font-size:10px;color:#484f58;text-transform:uppercase;letter-spacing:.5px;font-weight:normal">Player</th>
                    <th style="padding:8px 12px;text-align:center;font-size:10px;color:#484f58;text-transform:uppercase;letter-spacing:.5px;font-weight:normal">Referred</th>
                    <th style="padding:8px 12px;text-align:center;font-size:10px;color:#484f58;text-transform:uppercase;letter-spacing:.5px;font-weight:normal">Rewards Paid</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`);
    },

    _setContent(html) {
        const el = document.getElementById('managerContent');
        if (el) el.innerHTML = html;
    },

    _esc(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    },
};
