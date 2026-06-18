// =================================================================
// BATTLE ENGINE — Shared utilities and imports
// =================================================================
const crypto = require('crypto');

let safeEval;
try { ({ safeEval } = require('../event_runner')); } catch {
    // Safe fallback: only evaluate simple arithmetic expressions (no arbitrary code)
    safeEval = (expr) => {
        if (typeof expr !== 'string') return 0;
        // Only allow numbers, basic math operators, parentheses, and whitespace
        if (!/^[\d\s+\-*/().%]+$/.test(expr)) return 0;
        try { return Function('"use strict"; return (' + expr + ')')(); } catch { return 0; }
    };
}

let artifactRoutes = null;
try { artifactRoutes = require('../routes/artifactRoutes'); } catch { artifactRoutes = null; }

function jp(s, f) { try { return JSON.parse(s); } catch { return f; } }

module.exports = { crypto, safeEval, artifactRoutes, jp };
