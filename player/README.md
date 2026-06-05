# @twisted/player — SvelteKit player client

SvelteKit 2.50 + Svelte 5 (runes) + TypeScript + Vite. Connects to the
Phoenix backend over Phoenix Channels. Replaces `/root/twisted/ui`
(Next.js).

## Stack

- **SvelteKit 2.50** with Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`)
- **Vite 6** dev server, `adapter-node` for production
- **Phoenix Channels** via the `phoenix` JS client + a Svelte 5 runes-aware wrapper (`src/lib/phoenix/`)
- **@twisted/render** workspace package for Pixi/Three rendering (shared with the LiveView admin)

## Channels in use

Joined per session in `routes/play/[charId]/+page.svelte`:

| Topic                  | Source                                        |
| ---------------------- | --------------------------------------------- |
| `game:lobby`           | `te_phoenix_web/channels/game_channel.ex`     |
| `social:lobby`         | `social_channel.ex`                           |
| `user:<charId>`        | `user_channel.ex`                             |
| `battle:<battleId>`    | `battle_channel.ex` (joined when a battle starts) |

## Rendering pipeline

Map rendering runs **inside a Web Worker on an `OffscreenCanvas`**.
Pixi v8 (via `@twisted/render`) owns its own thread, so the 60fps
render tick is unaffected by Phoenix Channel events, Svelte runes
recomputation, or DOM thrash on the main UI.

```
main thread                          worker thread
─────────────                        ─────────────
MapView.svelte ──── postMessage ───▶ map-renderer.worker.ts
   │  state                                │
   │                                       ├── TwistedRenderer
   │                                       │     (Pixi Application)
   ◀── tile_click ─── postMessage ─────────┘
```

- `src/lib/render/map-renderer.worker.ts` — worker entry, owns Pixi
- `src/lib/render/build-render-state.ts` — pure function that maps
  the player-client stores (character, world, npcs, players, drops)
  to `@twisted/render`'s `RenderState` shape
- `src/lib/components/MapView.svelte` — main-thread harness:
  `transferControlToOffscreen()`, `postMessage` state pushes,
  ResizeObserver, hover/click forwarding
- Fallback path: when `OffscreenCanvas` is unavailable (older Safari,
  test environments), the renderer is dynamically imported on the
  main thread and the same `RenderState` is pushed to it inline. No
  feature gap — only a perf delta.

`vite.config.ts` sets `worker.format: 'es'` because Pixi v8 uses
dynamic imports internally and IIFE workers can't bundle a
code-splitting graph.

## Local development

```bash
pnpm install                         # at /root/twisted (workspace install)
pnpm --filter @twisted/player dev    # http://localhost:5173

# Phoenix backend in a second terminal:
cd /root/twisted/te_phoenix && mix phx.server   # http://localhost:4000
```

Vite proxies `/api/*` and `/socket/*` to `localhost:4000`, so the dev
server speaks to the running Phoenix instance with no CORS shenanigans.

## Production

```bash
pnpm --filter @twisted/player build    # writes player/build/index.js
pm2 start /root/twisted/ecosystem.player.config.js
```

`adapter-node` produces a self-contained Node server. The SvelteKit
process listens on `:3000`; nginx terminates TLS and routes
`/socket`, `/api`, `/sauce`, `/live`, `/assets` to Phoenix and the rest
to SvelteKit. See `nginx.player.conf` for the canonical config.

## Type-checking

```bash
pnpm --filter @twisted/player check
```

Current state: **0 errors, 0 warnings** across 267 files.

## Future: native desktop via Tauri 2

The web build is the source of truth, but when it's time to ship a
Steam-shippable / native-feeling desktop client, wrap this same
SvelteKit build in [Tauri 2](https://tauri.app) — no framework swap,
just a packaging layer.

Sketch of the path when we're ready:

```bash
# In /root/twisted/player:
pnpm dlx @tauri-apps/cli@latest init
# Choose: "build" as the dist dir, "pnpm build" as the build cmd,
#         "http://localhost:5173" as the dev URL.
```

What changes:
- A `src-tauri/` Rust shell appears alongside `src/`
- `pnpm tauri dev` runs the Svelte app inside a native webview
- `pnpm tauri build` produces signed `.msi` / `.dmg` / `.AppImage`
  artifacts plus an auto-updater channel

What does **not** change:
- All `src/` code — the same SvelteKit app runs in browser and native
- Phoenix Channels work identically (Tauri ships a real WebView)
- `@twisted/render` Pixi/Three rendering works identically

What to do differently when packaged:
- Read `import.meta.env.TAURI_PLATFORM` to gate native-only features
  (file system access, OS notifications, gamepad rumble via Tauri APIs)
- Build with `adapter-static` instead of `adapter-node` for the
  bundled-asset variant; keep `adapter-node` for the hosted web build

This stays a packaging decision, not a framework one. Don't migrate
preemptively — the web build covers everything until distribution
becomes the bottleneck.
