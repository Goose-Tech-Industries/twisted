# Twisted Engine — Code Review Guide

## What Is This?

Twisted Engine is a **browser-based MMO RPG engine** built for dark Celtic fantasy games (think Dark Souls meets Final Fantasy Tactics meets a MUD). It's designed so a non-coder admin can configure and run a full multiplayer RPG through an admin panel called **AdminSauce** — no code required.

**Tech Stack:** Node.js/Express + Socket.IO backend, Next.js 16 + React 19 frontend, MySQL/MariaDB, optional Redis for scaling.

**Scale:** ~66K LOC across 400+ files. Single developer project built over 28+ development sessions.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Browser (Next.js 16 / React 19 / Tailwind / shadcn)   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ Game Client   │  │ AdminSauce   │  │ Mod Panel     │ │
│  │ (58 panels)   │  │ (70+ panels) │  │               │ │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘ │
│         │ Socket.IO        │ REST              │ REST    │
└─────────┼──────────────────┼──────────────────┼─────────┘
          │                  │                  │
┌─────────┴──────────────────┴──────────────────┴─────────┐
│  Express Server (Node 20)                               │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌───────────┐ │
│  │ 29 Route │ │ 4 Socket  │ │ Battle   │ │ NPC Brain │ │
│  │ Files    │ │ Handlers  │ │ Engine   │ │ (LLM+Rule)│ │
│  └──────────┘ └───────────┘ │ (32 files│ └───────────┘ │
│                             │  15K LOC)│               │
│  ┌──────────┐ ┌───────────┐└──────────┘ ┌───────────┐ │
│  │ Event    │ │ Tournament│              │ Scheduler │ │
│  │ Runner   │ │ Manager   │              │           │ │
│  └──────────┘ └───────────┘              └───────────┘ │
└────────────────────────┬────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
     ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
     │ MySQL   │   │ Redis   │   │ Assets  │
     │ 77 tbls │   │(optional│   │ (disk)  │
     └─────────┘   └─────────┘   └─────────┘
```

---

## What's In This Zip

### `/te/battle/` — The Battle Engine (27 files, 15,241 LOC)
The crown jewel. 30+ independently toggleable combat subsystems:
- **Core:** damage resolution, skill execution, turn order (ATB/CTB/phased/speed)
- **Tactical:** grid movement with A* pathfinding, elevation, zone of control, formations
- **Defense:** dodge/block/counter, active defense prompts, barriers, cover
- **Advanced:** limb targeting, boss phases, transformations, link attacks, stealth, morale/flee AI
- **Progression:** fighting styles, signature techniques, combo procs, passive abilities
- **Systems:** Brave/Default turn banking, weapon triangle, threat/aggro, stagger/break
- **Tests:** full-test.js (system test), regression-test.js (16 known fixes), stress-test.js, break-test.js (exploit PoCs)

All controlled by 303 settings in `battle/settings.js` — every feature is a toggle.

### `/te/server.js` — Main Server (460 LOC)
Express + Socket.IO initialization, session management (MySQL or Redis), rate limiting, route mounting, day/night cycle, world event scheduler, graceful shutdown.

### `/te/server/` — Server Modules
- `state.js` — Shared in-memory state (players, maps, parties, guilds, trades, companions)
- `redis.js` — Optional Redis integration for horizontal scaling (Socket.IO adapter, shared sessions, player presence pub/sub)
- `socket-game.js` — Movement, map loading, interaction, world events
- `socket-battle.js` — All combat socket handlers + tournament events
- `socket-npc.js` — NPC dialogue, companion recruitment, affinity/quests
- `socket-social.js` — Chat, trade, party, guild, friends, achievements
- `npc-systems.js` — NPC memory, reputation, chatter, rumors

### `/te/npc_brain.js` — Multi-Provider AI Dialogue (382 LOC)
NPCs use LLM for dynamic conversation with:
- 5 provider support: Gemini, Anthropic (Claude), OpenAI, Ollama, rule-based fallback
- Persistent memory per NPC-player pair (facts, reputation -100 to +100)
- Context injection: persona, mood, world flags, region state, conversation history
- Automatic fact extraction from player messages

### `/te/schema_FULL.sql` — Database (77 tables, 1,795 LOC)
Complete schema covering: users, characters, classes, races, items, equipment, skills, quests, battles, guilds, mail, achievements, artifacts, shops, arenas, tournaments, factions, NPCs, maps, scripts, world events, and more.

### `/ui/components/admin/` — AdminSauce (Admin Panel)
- `entity-configs.ts` (3,184 LOC) — 159 entity type definitions with field configs. Every DB entity has a no-code CRUD form.
- `battle-config-panel.tsx` (1,320 LOC) — 21 categories, 70+ toggleable systems, formula editor, entity tables. 303 settings, zero hidden.
- `map-editor-canvas.tsx` (1,814 LOC) — 5-layer tile editor with 9 tools, autotiling, procedural generation (dungeon/cave/maze), object placement, event scripting.
- `node-graph-editor-panel.tsx` (621 LOC) — Visual dialogue tree builder using Drawflow. 25+ node types, drag-and-drop, preview mode, JSON export.
- `entity-manager.tsx` — Generic CRUD component that works for any of the 159 entity types.

### `/ui/components/game/` — Game Client
- `map-panel.tsx` (900+ LOC) — DOM grid renderer with viewport camera, parallax, fringe/interior detection, day/night overlay
- `map-fog-lighting.tsx` — Canvas overlay: fog of war (explored tiles persist), dynamic lighting from map objects with flicker
- `map-ambient-sound.tsx` — Per-map audio with crossfade on map change
- `battle-arena.tsx` (1,321 LOC) — Tactical grid battle UI with combatant cards, action menus, spectator mode
- `companion-panel.tsx` — Companion management with affinity bar and personal quest chains
- `tournament-panel.tsx` — Visual bracket viewer, registration, leaderboard
- `world-events-panel.tsx` — Active events with phases, participation, rewards, history
- `weather-effects.tsx` — Canvas particle weather (rain, snow, fog, storm, embers, spores)
- `particle-system.ts` + `particle-overlay.tsx` — Physics-based particle engine with 10 presets

### `/ui/lib/` — Client Architecture
- `game-context.tsx` (886 LOC) — Global state via useReducer + Socket.IO. Auth, character, inventory, quests, map, battle — all reactive.
- `game-types.ts` (628 LOC) — TypeScript interfaces for every game entity
- `admin-api.ts` — REST client for admin panel operations

### Infrastructure
- `Dockerfile.backend` + `Dockerfile.ui` — Production containers
- `docker-compose.yml` — Full stack: MariaDB + Redis + Backend + UI
- `docker-compose.dev.yml` — Dev mode with hot reload
- `.github/workflows/ci.yml` — CI pipeline: battle tests, frontend build, Docker build, SSH deploy
- `ecosystem.config.js` — PM2 process management
- `nginx.conf` — Reverse proxy with WebSocket support + SSL

---

## Key Numbers

| Metric | Value |
|--------|-------|
| Total LOC | ~66,000 |
| Files | 400+ |
| DB Tables | 77 |
| Battle Subsystems | 30+ (all toggleable) |
| Admin Settings | 303 (all no-code) |
| Entity Types in Admin | 159 (100% CRUD coverage) |
| Socket Events | 80+ |
| REST Endpoints | 100+ |
| Game Client Panels | 58 |
| Admin Panels | 70+ |
| Battle Test Suites | 4 (full, regression, stress, exploit) |

---

## What To Look For (Review Prompts)

1. **Architecture quality** — Is the separation between battle engine, socket handlers, state management, and UI clean?
2. **Battle system design** — 30+ toggleable subsystems. Is this overengineered or well-modularized?
3. **AdminSauce completeness** — 159 entity types, 303 settings. Is this sufficient for a no-code admin?
4. **Scaling readiness** — Redis adapter, Docker, CI/CD. What's missing for 500+ concurrent players?
5. **Security model** — Server-side sessions, never-trust-client, rate limiting, role-based access. Any gaps?
6. **What would you prioritize next?** — Visual polish (tilesets/sprites), 2.5D rendering, mobile optimization, or something else?

---

## What This Is NOT

- Not a finished game — it's an engine/creator. No art assets, no campaign content, no music.
- Not a general-purpose game engine — it's specifically for browser-based multiplayer RPGs.
- Not using any game framework (Phaser, PixiJS, Unity) — pure DOM/Canvas rendering, custom everything.
- Not a SaaS product yet — self-hosted only, no multi-tenant architecture.

---

Built by a solo developer using Claude Code as the AI pair programmer.
