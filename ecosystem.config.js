// =================================================================
// PM2 ecosystem.config.js — Twisted Engine Process Definitions
//
// Usage:
//   pm2 start ecosystem.config.js           # start all processes
//   pm2 restart ecosystem.config.js         # restart all
//   pm2 reload ecosystem.config.js          # zero-downtime reload
//   pm2 stop ecosystem.config.js            # stop all
//   pm2 logs                                 # tail all logs
// =================================================================

const fs = require('fs')
const path = require('path')

function loadPhoenixSecret() {
  const p = path.join(__dirname, '.env.phoenix.secret')
  try {
    return fs.readFileSync(p, 'utf8').trim()
  } catch (_e) {
    return process.env.SECRET_KEY_BASE || 'B0tV0l8hFz8G6g+7aD8hFz8G6g+7aD8hFz8G6g+7aD8hFz8G6g+7aD8hFz8G6g+7'
  }
}

function dbPassword() {
  return process.env.TE_DB_PASSWORD || 'postgres'
}

module.exports = {
  apps: [
    // ── Phoenix Backend (Elixir Release on :8420) ──────────────
    {
      name: 'twisted-phoenix',
      script: './te_phoenix/_build/prod/rel/te_phoenix/bin/te_phoenix',
      args: 'start',
      cwd: __dirname,
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',

      env_production: {
        PHX_SERVER: 'true',
        PHX_HOST: process.env.PHX_HOST || 'tcgaming.quest',
        PORT: '8420',
        DATABASE_URL: process.env.DATABASE_URL || `ecto://postgres:${dbPassword()}@localhost:5432/twisted_rpg`,
        SECRET_KEY_BASE: loadPhoenixSecret(),
        POOL_SIZE: '15',
      },

      out_file: './logs/phoenix-out.log',
      error_file: './logs/phoenix-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 10000,
    },

    // ── SvelteKit Player UI (on :3000) ─────────────────────────
    {
      name: 'twisted-player',
      script: './player/build/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',

      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '127.0.0.1',
        ORIGIN: process.env.ORIGIN || 'https://tcgaming.quest',
        PUBLIC_PHOENIX_URL: process.env.PUBLIC_PHOENIX_URL || 'http://localhost:8420',
        BODY_SIZE_LIMIT: 5 * 1024 * 1024
      },

      out_file: './logs/player-out.log',
      error_file: './logs/player-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '5s',
    },
  ],
};
