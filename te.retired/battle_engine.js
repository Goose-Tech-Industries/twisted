// =================================================================
// BATTLE ENGINE — Re-export from modular battle/ directory
// =================================================================
// The engine has been split into focused modules under ./battle/
// This file preserves backwards compatibility so all existing code
// that does require('./battle_engine') still works.
// =================================================================

module.exports = require('./battle/index');
