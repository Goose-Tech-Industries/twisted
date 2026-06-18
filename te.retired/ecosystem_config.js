// =================================================================
// PM2 ECOSYSTEM CONFIG — Twisted Engine
// =================================================================
// TEACHING: PM2 is a process manager for Node.js apps. It:
//   - Keeps the server running if it crashes (auto-restart)
//   - Restarts it cleanly on `pm2 restart twisted-engine`
//   - Rotates log files so your disk doesn't fill up
//   - Sends SIGTERM before killing the process (triggers our
//     graceful shutdown handler to save player positions)
//
// Usage:
//   pm2 start ecosystem.config.js        # start
//   pm2 restart twisted-engine           # rolling restart (saves players first)
//   pm2 stop twisted-engine              # stop (saves players first)
//   pm2 logs twisted-engine              # tail logs
//   pm2 monit                            # live CPU/RAM dashboard
//   pm2 startup                          # make PM2 start on server reboot
//   pm2 save                             # lock in current process list
// =================================================================

module.exports = {
    apps: [{
        name:         'twisted-engine',
        script:       'server.js',
        // TEACHING: 'fork' mode = one process. 'cluster' mode = one process per
        // CPU core. Fork is correct here because our game state (onlinePlayers,
        // npcMemory, activeBattles) lives in a single Node process's RAM.
        // Cluster mode would split players across separate processes that can't
        // see each other's state — you'd need Redis for that.
        exec_mode:    'fork',
        instances:    1,

        // Environment variables — these get merged with your .env file
        env: {
            NODE_ENV: 'development',
            PORT:     3000
        },
        env_production: {
            NODE_ENV: 'production',
            PORT:     3000
        },

        // TEACHING: max_memory_restart is a safety net. If the Node process
        // grows past 1.5GB (out of our 4GB droplet), PM2 restarts it automatically.
        // This catches slow memory leaks that our fixes didn't catch, as a backstop.
        max_memory_restart: '1500M',

        // TEACHING: Exponential backoff means if the server crashes repeatedly,
        // PM2 waits longer between restarts (1s, 2s, 4s, 8s…) instead of
        // hammering the machine. Good for DB connection failures at startup.
        exp_backoff_restart_delay: 100,
        max_restarts: 10,

        // Logging
        out_file:    './logs/out.log',
        error_file:  './logs/error.log',
        merge_logs:  true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss',

        // TEACHING: watch:false means PM2 won't restart on file changes.
        // Use nodemon for dev instead. Watching in production causes restarts
        // every time a log file or temp file is written.
        watch: false,

        // Give our graceful shutdown 8 seconds before PM2 force-kills the process
        kill_timeout: 8000,
    }]
};
