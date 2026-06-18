// =================================================================
// ADMIN PANEL API v2.0 — Session Auth
// =================================================================
// v1 included userId in every request body (read from localStorage).
// v2 sends NO userId — the session cookie is sent automatically
// by the browser on every same-origin request.
// The server reads req.session.userId to know who's asking.
// =================================================================

const API = {
    getAll: async (type) => {
        try {
            const r = await fetch('/admin/get-all', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type })
            });
            if (r.status === 401) { alert('Session expired. Please log in again.'); window.location.href = '/'; return { success: false }; }
            if (r.status === 403) { alert('Access denied.'); return { success: false }; }
            return await r.json();
        } catch(e) { return { success: false, message: 'Connection failed.' }; }
    },

    save: async (type, data, id = null) => {
        try {
            const r = await fetch('/admin/save', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, data, id })
            });
            if (r.status === 401) { alert('Session expired. Please log in again.'); window.location.href = '/'; return { success: false }; }
            if (r.status === 403) { alert('Access denied.'); return { success: false }; }
            return await r.json();
        } catch(e) { return { success: false, message: 'Save failed.' }; }
    },

    delete: async (type, id) => {
        try {
            const r = await fetch('/admin/delete', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, id })
            });
            return await r.json();
        } catch(e) { return { success: false }; }
    },

    clearCache: async (mapId) => {
        try {
            const r = await fetch('/admin/clear-cache', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mapId })
            });
            return await r.json();
        } catch(e) { return {}; }
    },

    post: async (url, data = {}) => {
        try {
            const r = await fetch(url, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (r.status === 401) { alert('Session expired. Please log in again.'); window.location.href = '/'; return { success: false }; }
            if (r.status === 403) { alert('Access denied.'); return { success: false }; }
            return await r.json();
        } catch(e) { return { success: false, message: 'Request failed.' }; }
    },

    // req(method, url, body?) — used by world_manager for GET/POST/PUT/DELETE calls
    // TEACHING: The vanilla API object only had getAll/save/delete/post which all
    // use POST. world_manager needs proper REST methods for the world-flags and
    // factions endpoints that use GET/PUT/DELETE HTTP verbs.
    req: async (method, url, data = null) => {
        try {
            const opts = {
                method: method.toUpperCase(),
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            };
            if (data && !['GET', 'HEAD'].includes(opts.method)) {
                opts.body = JSON.stringify(data);
            }
            const r = await fetch(url, opts);
            if (r.status === 401) { alert('Session expired. Please log in again.'); window.location.href = '/'; return { success: false }; }
            if (r.status === 403) { alert('Access denied.'); return { success: false }; }
            if (r.status === 204) return { success: true }; // No Content (e.g. DELETE)
            return await r.json();
        } catch(e) { return { success: false, message: 'Request failed: ' + e.message }; }
    }
};
