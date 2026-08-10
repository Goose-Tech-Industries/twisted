// =================================================================
// PM2 ecosystem.config.js — Twisted Engine process definitions
//
// Usage:
//   pm2 start ecosystem.config.js           # start both processes
//   pm2 restart ecosystem.config.js         # restart both
//   pm2 reload ecosystem.config.js          # zero-downtime reload
//   pm2 stop ecosystem.config.js            # stop both
//   pm2 logs                                 # tail all logs
//   pm2 monit                                # live dashboard
// =================================================================

const fs = require('fs')
const path = require('path')

// Load Phoenix SECRET_KEY_BASE from a 0600-permission file outside git.
// Falls back to process.env if the file is missing (dev workstation flows).
function loadPhoenixSecret() {
  const p = path.join(__dirname, '.env.phoenix.secret')
  try {
    return fs.readFileSync(p, 'utf8').trim()
  } catch (_e) {
    return process.env.SECRET_KEY_BASE || ''
  }
}

// DB password must come from the environment — never hardcode it here.
function dbPassword() {
  const pw = process.env.TE_DB_PASSWORD
  if (!pw) throw new Error('TE_DB_PASSWORD is not set in the environment')
  return pw
}

module.exports = {
  apps: [
    // ── Express backend ────────────────────────────────────────
    {
      name: 'twisted-backend',
      script: './te/server.js',
      cwd: __dirname,
      // Single instance by default. With REDIS_URL set, you can scale:
      //   instances: 2,  (or 'max' for all CPUs)
      //   exec_mode: 'cluster',
      instances: 1,
      exec_mode: 'fork',
      watch: false,          // never watch in production
      max_memory_restart: '512M',

      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },

      // Log rotation — PM2 logrotate plugin handles this if installed
      // npm install -g pm2-logrotate
      out_file: './logs/backend-out.log',
      error_file: './logs/backend-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // Restart policy
      restart_delay: 3000,       // wait 3s before restart after crash
      max_restarts: 10,          // give up after 10 rapid crashes
      min_uptime: '5s',          // must be up 5s to count as healthy start
    },

    // ── Phoenix AdminSauce (Elixir release on :4000) ───────────
    {
      name: 'twisted-phoenix',
      script: './te_phoenix/_build/prod/rel/te_phoenix/bin/te_phoenix',
      args: 'start',
      cwd: __dirname,
      interpreter: 'none',   // native binary, no node interpreter
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',

      env_production: {
        PHX_SERVER: 'true',
        PHX_HOST: 'tcgaming.quest',
        PORT: '4000',
        DATABASE_URL: `ecto://root:${dbPassword()}@localhost/twisted_rpg`,
        SECRET_KEY_BASE: loadPhoenixSecret(),
        POOL_SIZE: '10',
      },

      out_file: './logs/phoenix-out.log',
      error_file: './logs/phoenix-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',       // release boot is slower than node
      kill_timeout: 10000,     // give BEAM time to shut down cleanly
    },

    // ── Next.js UI ─────────────────────────────────────────────
    {
      name: 'twisted-ui',
      script: 'npm',
      args: 'start',
      cwd: __dirname + '/ui',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',

      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        // NEXT_PUBLIC_* vars are baked in at build time — no need to set here
      },

      out_file: './logs/ui-out.log',
      error_file: './logs/ui-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '5s',
    },
  ],
};
