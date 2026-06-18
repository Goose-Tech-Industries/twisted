// =================================================================
// PM2 ecosystem — SvelteKit player + Phoenix backend (Node retired).
//
// Usage:
//   pm2 start ecosystem.player.config.js
//   pm2 reload ecosystem.player.config.js   # zero-downtime reload
//   pm2 logs
// =================================================================
// Phoenix is started separately via mix release / systemd; this file
// only owns the Node-side process (the SvelteKit adapter-node server).
// The legacy /te Express backend and Next.js UI are no longer started.

module.exports = {
  apps: [
    {
      name: 'twisted-player',
      script: './player/build/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '127.0.0.1',
        ORIGIN: process.env.ORIGIN || 'https://tcgaming.quest',
        // SvelteKit's adapter-node expects bytes, not a "5mb" string.
        BODY_SIZE_LIMIT: 5 * 1024 * 1024
      },
      error_file: './logs/player-error.log',
      out_file:   './logs/player-out.log',
      time: true
    }
  ]
}
