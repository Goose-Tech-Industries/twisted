# Twisted Engine

Browser-based MMO RPG engine for dark Celtic fantasy games. Single repo,
multiple deployable pieces. The admin tooling (AdminSauce) lets a non-coder
operator build, configure, and run a full multiplayer RPG without writing
code.

Production URL: https://tcgaming.quest
AdminSauce path: `/sauce` (permanent)

---

## What's in this repo

| Path                  | Role                          | Stack                                                            |
| --------------------- | ----------------------------- | ---------------------------------------------------------------- |
| `te_phoenix/`         | Backend + AdminSauce control panel | Phoenix 1.8.5, LiveView 1.0, Ecto/MyXQL → MariaDB, Bandit |
| `player/`             | Player game client            | SvelteKit 2.50, Svelte 5 (runes), Vite 6, Pixi v8, Three.js     |
| `packages/render/`    | Shared 2D/3D rendering core   | `@twisted/render` — tsup ESM+CJS, peer Pixi v8 + Three          |
| `docs/`               | Engine integration notes      | Fog-of-war, player/render integration                            |
| `scripts/`            | Operational scripts           | Deploy, backup, log rotation                                     |
| `ecosystem.config.js` | PM2 process definitions       | Phoenix release + player Node server                             |
| `nginx.conf`, `nginx.player.conf` | Reverse proxy        | TLS termination via Let's Encrypt                                |

### Retired stacks — do not modify

- `te.retired/` — original Express + Socket.IO + MySQL backend
- `ui.retired/` — original Next.js + shadcn admin UI
- `monorepo.retired/`, `monorepo_v27_build.retired/` — earlier monorepo layouts

These directories are preserved as historical reference only. New work goes
into `te_phoenix/`, `player/`, and `packages/render/`.

---

## Architecture

### Backend — `te_phoenix/` (non-umbrella Phoenix app)

Single Phoenix 1.8.5 application, no umbrella. Lives at `te_phoenix/lib/te_phoenix/`
and `te_phoenix/lib/te_phoenix_web/`. Contexts:

- `accounts/` — users, sessions, roles
- `ai/` — Anthropic-only AI integration (content generation, Game Director)
- `battle/` — 37 modules, the combat engine core
- `capabilities/` — skill/ability definitions
- `combat/` — combat resolution
- `game/` — top-level game state and rules
- `matches/` — match orchestration
- `mods/` — mod/content layering
- `objectives/` — quest/objective tracking
- `party/` — party state
- `social/` — friends, guilds, chat
- `strategy/` — AI strategy primitives
- `tournament_manager/` — tournament brackets
- `waves/` — wave spawning logic
- `world/` — world map and zones

Plus standalone modules: `npc_brain.ex`, `gm_commands.ex`, `scheduler.ex`,
`tenancy.ex`, `event_runner.ex`, `pathfinding.ex`, `clipboard_server.ex`,
`release.ex`, `user_prefs.ex`.

Router (`te_phoenix_web/router.ex`) is 303 lines. The `/sauce` scope mounts
**AdminSauce** — 70+ LiveView panels covering map editor, character creator,
ability/inventory/quest editors, battle ruleset builder, AI Game Director, and
the saga engine. Every panel is no-code: an operator configures the game by
clicking, not editing files.

### Player client — `player/`

SvelteKit 2.50 + Svelte 5 (runes API) + Vite 6 + TypeScript. Migrated from
Next.js on 2026-05-04. Connects to Phoenix via the `phoenix` JS client (^1.7).

Rendering is split:

- **Pixi v8** runs in a Worker on `OffscreenCanvas` for the 2D world.
- **Three.js** is used for 3D viewport elements.
- Both are wrapped behind `@twisted/render`.

### Shared renderer — `packages/render/`

Framework-agnostic TypeScript package. Built with `tsup` to ESM + CJS, exposes
subpath exports `./projections` and `./shaders`. Peer dependencies pin
`pixi.js ^8` and `three ^0.180`.

**Known version drift to be aware of:**

| Location               | Three.js version  |
| ---------------------- | ----------------- |
| `packages/render` peer | `^0.180.0`        |
| `packages/render` dev  | `^0.183.2`        |
| `player` runtime       | `^0.171.0`        |

This drift is tolerated for now but should be resolved before the next
rendering-heavy session.

### AI

Anthropic-only. Two models in active use:

- `claude-sonnet-4-6-20251001` — primary content + Director
- `claude-haiku-4-5-20251001`  — light/inline tasks

No OpenAI, no Ollama. Provider abstraction lives in `te_phoenix/lib/te_phoenix/ai/`.

### Persistence

MariaDB via MyXQL/Ecto. Schema lives under `te_phoenix/priv/repo/migrations/`.
Backups handled by `scripts/backup-db.sh` and rotated to `/var/goose/backups/`.

---

## Getting started

### Prerequisites

- Elixir 1.15+ / Erlang OTP 26
- Node 20+
- pnpm (workspace uses `pnpm-workspace.yaml`)
- MariaDB 10.x with a database for the app

### Backend (Phoenix)

```bash
cd te_phoenix
mix setup                       # deps + ecto create + migrate + seeds + assets
mix phx.server                  # http://localhost:4000
```

AdminSauce will be at `http://localhost:4000/sauce`. First account created
should be promoted via the `gm_commands` module or by direct UPDATE on
`users.role`.

### Player client (SvelteKit)

```bash
cd player
pnpm install
pnpm dev                        # http://localhost:5173
```

The player client expects Phoenix to be reachable; configure the socket URL
in the player env if not running locally.

### Shared renderer (`@twisted/render`)

```bash
cd packages/render
pnpm install
pnpm build                      # produces dist/
pnpm dev                        # tsup --watch for live rebuilds
```

Player consumes `@twisted/render` via the pnpm workspace (`workspace:*`).

### Production

PM2 manages two processes via `ecosystem.config.js` (Phoenix release) and
`ecosystem.player.config.js` (SvelteKit Node server). Nginx terminates TLS;
`nginx.conf` proxies AdminSauce + Phoenix sockets, `nginx.player.conf` proxies
the player client. `.env.phoenix.secret` (mode 0600, outside git) supplies
`SECRET_KEY_BASE`.

---

## Status

- **Engine V1:** complete
- **AdminSauce:** 70+ panels live, covering all configurable systems
- **Next session:** Battle session 8 — limb targeting, knockout state,
  active defense

In-flight bug list and recent audits:

- `BUG_REPORT_2026-05-04.md` — AdminSauce browser-automation pass
- `AUDIT_WORLD_GROUP_2026-05-04.md` — World-group LiveView audit
- `CRASH_TRIAGE_2026-05-11.md` — May 7 + Apr 18 erl_crash.dump triage

---

## Related docs

- `REVIEW_GUIDE.md` — code review guide and ground rules
- `AUDIT_WORLD_GROUP_2026-05-04.md` — World group audit (2026-05-04)
- `BUG_REPORT_2026-05-04.md` — AdminSauce bug report (2026-05-04)
- `docs/player-fog-integration.md` — fog-of-war integration on the player side
- `docs/render-fog-integration.md` — fog-of-war integration on the renderer side
