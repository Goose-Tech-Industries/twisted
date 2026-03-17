# Twisted Engine — Deployment Checklist

## First-time setup on your Digital Ocean droplet

```bash
# 1. Upload and unzip the build
unzip twisted_engine_v21_7.zip
mv te twisted-engine
cd twisted-engine

# 2. Install dependencies
npm install

# 3. Create your .env file from the template
cp .env.example .env
nano .env   # fill in DB_HOST, DB_USER, DB_PASS, SESSION_SECRET etc.

# 4. Set up the database (first time only)
mysql -u twisteduser -p twisted_rpg < schema_FULL.sql

# 5. Start with PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

## Updating an existing server

```bash
# 1. Upload new zip and extract alongside the old folder
unzip twisted_engine_v21_7.zip -d /tmp/new-build

# 2. Run migrations ONLY (don't run schema_FULL.sql again — it would wipe data)
mysql -u twisteduser -p twisted_rpg < /tmp/new-build/te/migrate_v19.sql

# 3. Copy new files over (keeps your .env intact)
rsync -av --exclude='.env' --exclude='node_modules' --exclude='logs' \
  /tmp/new-build/te/ ~/twisted-engine/

# 4. Install any new dependencies
cd ~/twisted-engine && npm install

# 5. Restart — PM2 sends SIGTERM first, which triggers graceful shutdown
#    (players' positions are saved before the process dies)
pm2 restart twisted-engine
```

## Monitoring

```bash
pm2 monit                    # live CPU/RAM/restart count dashboard
pm2 logs twisted-engine      # tail logs in real time
pm2 logs twisted-engine --lines 200   # last 200 lines
```

## Enabling optional features

### Spotify Now Playing
Add to `.env`:
```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=https://yourdomain.com/api/spotify/callback
```
Then add the redirect URI to your Spotify app dashboard at developer.spotify.com.

### Email Verification
Add to `.env`:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=youraddress@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Twisted Engine <youraddress@gmail.com>
GAME_URL=https://yourdomain.com
REQUIRE_EMAIL_VERIFY=true
```
Then: `npm install nodemailer`

### AI NPC Dialogue (Google Gemini — free tier)
Add to `.env`:
```
GEMINI_API_KEY=your-key-from-aistudio.google.com
```

## Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Error: connect ECONNREFUSED` on startup | MariaDB not running | `sudo systemctl start mariadb` |
| `ER_ACCESS_DENIED_ERROR` | Wrong DB credentials | Check `.env` DB_USER / DB_PASS |
| Players get disconnected after ~1 minute idle | Firewall closing idle TCP | Already fixed — pingTimeout=45s |
| Emoji in chat crashes DB | Wrong charset | Already fixed — charset=utf8mb4 |
| Server won't start after update | New dependency | Run `npm install` again |
| `SESSION_SECRET` warning in logs | Default secret in use | Set a real SESSION_SECRET in `.env` |
