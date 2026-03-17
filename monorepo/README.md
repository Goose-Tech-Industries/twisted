# Twisted Engine — Monorepo

Full-stack dark Celtic fantasy RPG.  
Backend: Express + Socket.IO + MySQL (`/te`)  
Frontend: Next.js 16 + shadcn/tailwind (`/ui`)

---

## Structure

```
twisted-engine/
├── te/           Express backend (port 3001 in dev)
├── ui/           Next.js frontend (port 3000 in dev)
├── nginx.conf    Production reverse proxy config
└── package.json  Root scripts (concurrently)
```

---

## Local Dev — 2 Commands

```bash
# 1. Install everything
npm run install:all

# 2. Run both servers
npm run dev
```

That's it. Backend on :3001, UI on :3000.  
Open the game at http://localhost:3000  
Open AdminSauce at http://localhost:3000/adminsauce

### First-time setup

```bash
# Copy env files
cp te/.env.example te/.env
# Edit te/.env — fill in DB_HOST, DB_USER, DB_PASS, DB_NAME, SESSION_SECRET
# ALLOWED_ORIGIN is already set to http://localhost:3000 in the example
nano te/.env

# ui/.env.local is already committed with dev values:
# NEXT_PUBLIC_API_URL=http://localhost:3001
# NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

### Dev cookie note

In development the session cookie is `sameSite: 'none'` so it can cross
from :3000 → :3001. Browsers require `secure: true` for `sameSite: 'none'`,
but local HTTP is not secure. **Chrome fix:**

```
chrome://flags/#unsafely-treat-insecure-origin-as-secure
# Add: http://localhost:3001
```

Or use the same-origin approach: run `npm run dev:te` only and open the
game at `http://localhost:3001` (the backend still serves `public/`), then
configure the UI separately. In production this is a non-issue — nginx puts
everything on one HTTPS domain.

---

## Production Deploy (Digital Ocean / any Ubuntu server)

### 1. Server prep

```bash
# Install Node 20, nginx, PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm install -g pm2

# Install pnpm (for UI)
npm install -g pnpm
```

### 2. Upload & install

```bash
# Upload the monorepo to /var/www/twisted
scp -r ./twisted-engine user@yourserver:/var/www/twisted

# On the server
cd /var/www/twisted
npm run install:all
```

### 3. Configure environment

```bash
# Backend
cp te/.env.example te/.env
nano te/.env
# Set:
#   NODE_ENV=production
#   PORT=3001
#   DB_HOST / DB_USER / DB_PASS / DB_NAME
#   SESSION_SECRET=<64 random chars>
#   ALLOWED_ORIGIN=https://yourdomain.com

# Frontend
nano ui/.env.production
# In production, UI and API share one domain via nginx
# so API_URL is empty (same-origin requests, no CORS needed):
#   NEXT_PUBLIC_API_URL=
#   NEXT_PUBLIC_SOCKET_URL=
```

### 4. Build Next.js

```bash
cd /var/www/twisted/ui
pnpm build
```

### 5. Start with PM2

```bash
cd /var/www/twisted

# Backend
pm2 start te/server.js --name twisted-backend --cwd te

# Frontend (Next.js production server)
pm2 start --name twisted-ui --cwd ui -- pnpm start

pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

### 6. Nginx

```bash
# Edit nginx.conf — replace yourdomain.com with your actual domain
sudo cp nginx.conf /etc/nginx/sites-available/twisted
sudo ln -s /etc/nginx/sites-available/twisted /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7. SSL (Let's Encrypt — free)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
# Certbot fills in the ssl_certificate lines automatically
sudo systemctl reload nginx
```

### 8. Grant GM/Admin access

```sql
-- In MySQL (game database)
UPDATE users SET role = 'ADMIN' WHERE username = 'yourname';
-- Then visit: https://yourdomain.com/adminsauce
```

---

## /adminsauce — Non-Negotiable URL

`/adminsauce` is permanently the admin entry point. It will never change.

- In dev: http://localhost:3000/adminsauce
- In prod: https://yourdomain.com/adminsauce

The URL resolves through nginx → Next.js → `/adminsauce` page → calls
`/admin-panel/*` Express routes for all data. The Express routes are
protected by `requireStaff` middleware — all identity comes from the
session cookie (database-backed), never from `req.body.userId`.

---

## Endpoint Mismatches Found & Resolved

| UI Expected | Backend Had | Fix |
|---|---|---|
| `GET /admin-panel/:type` | `POST /admin/get-all` | ✅ New REST GET routes in adminPanel.js |
| `POST /admin-panel/:type` | `POST /admin/save` | ✅ New REST POST create |
| `POST /admin-panel/:type/:id` | `POST /admin/save` | ✅ New REST POST update |
| `POST /admin-panel/:type/:id/delete` | `POST /admin/delete` | ✅ New REST delete alias |
| `POST /admin-panel/player/ban` | `POST /admin-panel/player/:id/ban` | ✅ Flat body alias |
| `POST /admin-panel/player/unban` | `POST /admin-panel/player/:id/unban` | ✅ Flat body alias |
| `POST /admin-panel/player/role` | `POST /admin-panel/player/:id/role` | ✅ Flat body alias |
| `POST /admin-panel/player/give-gold` | `POST /admin-panel/player/:id/give-gold` | ✅ Flat body alias |
| `POST /admin-panel/player/give-item` | `POST /admin-panel/player/:id/give-item` | ✅ Flat body alias |
| `POST /admin-panel/player/kick` | `POST /admin-panel/kick` | ✅ New alias via global._io |
| `POST /admin-panel/player/teleport` | Did not exist | ✅ New endpoint (DB + live push) |
| `POST /admin-panel/player/set-level` | Did not exist | ✅ New endpoint |
| `GET/POST /admin-panel/settings` | Did not exist | ✅ New settings endpoints |
| `GET /auth/me` | `GET /me` (at root `/`) | ✅ Already matched — no change |
| `localStorage` for API base URL | Was in game-api.ts, admin-api.ts, game-context.tsx | ✅ Replaced with NEXT_PUBLIC_API_URL |
| Demo mode gate in login() | Bypassed real auth when no localStorage URL set | ✅ Removed — always hits real API |
| `sameSite: 'lax'` blocking cookies | Cookie config in server.js | ✅ `'none'` in dev, `'lax'` in prod |

---

## Security Model

- **Identity**: Always from `req.session.userId` → database lookup. `req.body.userId` is never trusted.
- **Cookies**: `httpOnly: true` (JS cannot read). `secure: true` in production. `sameSite: lax` in production.
- **CORS**: Locked to `ALLOWED_ORIGIN` env var in production. Credentials always required.
- **Admin routes**: All protected by `requireStaff` — checks role from database on every request, not from a cached session value.
- **No localStorage user identity**: Removed entirely. The session cookie is the only auth surface.
