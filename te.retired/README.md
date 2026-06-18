# Twisted Engine v10 — Full Setup Guide

## Fresh Install (New Server)

### 1. Requirements
- Node.js 18+
- MySQL 8.0+ (or MariaDB 10.6+)
- A VPS or server running Linux (Ubuntu 22.04 recommended)

### 2. Create the database
```sql
CREATE DATABASE twisted_rpg CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'twisted'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON twisted_rpg.* TO 'twisted'@'localhost';
FLUSH PRIVILEGES;
```

### 3. Run the full schema (ONE TIME only)
```bash
mysql -u twisted -p twisted_rpg < schema_FULL.sql
```
This creates all 35+ tables and seeds essential game data.

### 4. Install dependencies
```bash
npm install
```

### 5. Configure environment
```bash
cp .env.example .env
nano .env
```
Fill in:
- `DB_USER`, `DB_PASS`, `DB_NAME`
- `SESSION_SECRET` — generate with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```

### 6. Start the server
```bash
node server.js
# or for development (auto-restart on file change):
npx nodemon server.js
```

### 7. Make yourself admin
Register an account at http://localhost:3000, then:
```sql
UPDATE users SET role='ADMIN' WHERE username='your_username';
```

### 8. Build your world
Go to http://localhost:3000/adminsauce

---

## Upgrading from v9

If you already have a v9 database, run the migration instead:
```bash
mysql -u twisted -p twisted_rpg < migration_v10_new_columns.sql
```

---

## Production Deployment

### Nginx reverse proxy (recommended)
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### HTTPS (required for secure sessions)
```bash
certbot --nginx -d yourdomain.com
```

### In your .env, uncomment:
```
NODE_ENV=production
```
This enables HTTPS-only cookies so sessions can't be hijacked.

### Keep it running with PM2
```bash
npm install -g pm2
pm2 start server.js --name twisted
pm2 save
pm2 startup
```

---

## Project Structure

```
server.js              — Express + Socket.IO entry point
routes/
  auth.js              — Login, register, session, /me, /logout
  game.js              — Character CRUD, inventory, maps, shop
  admin.js             — Admin CMS API (protected by session)
  guildRoutes.js       — Guild REST endpoints
  partyRoutes.js       — Party & friends REST endpoints
  questRoutes.js       — Quest log & progress
  progressionRoutes.js — XP, leveling, stat points
  artifactRoutes.js    — Legendary artifact system
battle_engine.js       — Turn-based battle logic
event_runner.js        — Map event script executor
npc_brain.js           — NPC dialogue (rule-based + optional LLM)

public/
  index.html           — Login / register / character select
  game.html            — The actual game canvas
  js/
    game_engine.js     — Client-side game loop, rendering
    panels_ui.js       — Inventory, equipment, character sheet
    battle_ui.js       — Battle HUD
    quest_ui.js        — Quest log panel
    party_ui.js        — Party panel
    guild_ui.js        — Guild panel
    chat_ui.js         — Chat system
    trade_ui.js        — Player-to-player trading
    minimap_ui.js      — Mini-map overlay
    world_map_ui.js    — World map / fast travel

  adminsauce/
    index.html         — Admin CMS
    js/managers/       — One JS file per admin panel section
```

---

## Security Notes

- Passwords are bcrypt-hashed (10 rounds)
- Sessions are server-side (httpOnly cookies, no localStorage auth)
- Rate limiting: 20 login/register attempts per 15 minutes per IP
- Admin routes require session + ADMIN/GM role check
- `verifyOwnership()` prevents players from accessing other characters
- Never commit your `.env` file — add it to `.gitignore`

