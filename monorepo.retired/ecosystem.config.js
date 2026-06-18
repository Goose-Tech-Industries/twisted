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

module.exports = {
  apps: [
    // ── Express backend ────────────────────────────────────────
    {
      name: 'twisted-backend',
      script: './te/server.js',
      cwd: __dirname,
      instances: 1,          // single instance (Socket.IO state is in-process)
      exec_mode: 'fork',     // not cluster — shared WebSocket state
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
