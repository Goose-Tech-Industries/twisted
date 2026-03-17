# Twisted Engine (Merged) – Run Instructions

## 1) Install dependencies
```bash
npm install
```

## 2) Configure environment
Copy `.env.example` to `.env` and set your DB credentials.

## 3) Run the SAFE SQL migrations
```bash
mysql -u YOURUSER -p YOURDB < mysql_quests_progression_SAFE.sql
mysql -u YOURUSER -p YOURDB < mysql_legendary_artifacts_SAFE.sql
```

## 4) Start the server
```bash
npm start
# or
node server.js
```

## 5) Open in browser
- Portal: http://localhost:3000/
- Game: http://localhost:3000/game.html
- AdminSauce: http://localhost:3000/adminsauce/

## Notes
- Quests/progression store player progress in `characters.state_json`.
- Artifacts transfer requires calling `artifactRoutes.onPvpKill()` from your PvP kill handler.
