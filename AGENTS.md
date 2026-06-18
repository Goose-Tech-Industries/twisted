# Twisted Engine — project context

You are working in a multi-project monorepo. Read this file BEFORE making any changes.

## What this is

**Twisted Engine** — a dark Celtic-fantasy RPG creation suite. Multiple subsystems coexist here. The user (Goose) builds solo, is burnt out, and prefers shipping over rebuilding.

## Stack

- **Backend (canonical):** `te_phoenix/` — Phoenix 1.7 / Elixir 1.16 / MariaDB. 313 DB tables. Battle system is GenServer-based. Admin lives at `/sauce` (LiveView).
- **Player client (current target):** `player/` — SvelteKit 2.50 + Svelte 5. Builds clean, feature work in progress.
- **Legacy player:** `ui.retired/` — Next.js + Pixi.js + Three.js. Reference only; do not modify.
- **Shared renderer:** `packages/render/` — `@twisted/render` pnpm workspace package. Pixi v8 + Three.js. Framework-agnostic. Consumed by both player clients and the LiveView admin map editor.
- **Retired:** anything ending `.retired/` — do NOT touch.

## Hard rules

1. **NO STUBS.** No corner-cuts. Cut scope, not depth. If you can't fully implement a feature, say so — never ship hidden TODOs claimed as complete.
2. **No descriptions of changes** — apply edits directly. The user reads the diff.
3. **The user does not code.** You write everything.
4. **State-of-the-art.** Every feature must be top-tier. If you'd be embarrassed for it to ship, don't ship it.
5. **Check legacy first.** Before building anything new, search `ui.retired/`, `monorepo_v27_build.retired/`, `te.retired/` for an existing implementation. ~40% of "new" work is already done somewhere.
6. **Bug fixes end with test steps.** Every fix must include explicit pass/fail steps the user can run. No vague "looks better" verification.
7. **Estimate in Claude-hours, not human-weeks.** A "1-2 week build" is ~4-8 agent hours.

## Phoenix coordination

The Phoenix dev server runs at `/root/twisted/te_phoenix/`. **Source edits to `lib/` are safe** — LiveReload picks them up. Single-terminal mode: most commands are fine to run without asking.

**Still ASK before** (these drop live channels or have rollback cost):
- `mix release` / `mix compile --force`
- `pm2 restart twisted-phoenix`
- Any migration (`mix ecto.migrate`, `mix ecto.rollback`, `mix ecto.reset`)
- Adding/removing deps (`mix.exs` edits, `mix deps.get`)
- Any edit under `config/*.exs`

**Safe to run autonomously:**
- `mix run priv/repo/*.exs` (seed scripts)
- `mix test`, `mix format`, `mix credo`
- `mix compile` (incremental)
- `iex -S mix` for inspection

## Render package caveat

`mix assets.deploy` does NOT rebuild `packages/render/dist`. If you edit `packages/render/src/**`, run `pnpm build` in that directory FIRST, then `mix assets.deploy`. Lost 2 hours debugging this in the past.

## Payments safety lock

Frontend rejects creator subs / point purchases / tipping until `VITE_PAYMENTS_LIVE=true`. Backend stubs grant value without charging. Do not remove these guards without explicit user instruction.

## Map / battle / status data model

The map editor, battle engine, status effects, NPCs, shops, and quests are all **data-driven** — they read from DB tables, no code changes needed for content. Schemas:

- **Maps:** `game_maps` (5-layer JSON blobs: ground/overlay/passability/fringe/elevation) + `game_map_ops_log` (event-sourced edits, 20 op types) + `game_map_branches` + `game_map_drafts`
- **NPCs:** `game_npcs` with patrol paths, schedules, drop tables, shop links
- **Shops:** `game_shops` + `game_shop_supplies` (server-authoritative `ShopTransactions`)
- **Items:** `game_items` with element resistances, stat bonuses, slot
- **Battle:** `game_battles` + `game_battle_participants` + `game_battle_commands`. Runtime: `Battle.State` GenServer per active battle, ATB/CTB/speed initiative modes
- **Statuses:** `game_battle_statuses` (data-driven, lazy-created by `StatusRegistry`, ETS-cached). `effects_json` for passive modifiers, `tick_json` for DoT/HoT. NEVER rename a status `key` — it orphans references.
- **Rules:** `game_battle_rules` — trigger-event engine (`limb_broken`, `ko`, `damage_taken`, etc.) with condition + effect maps.
- **Quests:** `quest_definitions` (string PK `quest_id`), `objectives_json` (kill/collect/reach/talk), `rewards_json`

Map editor at `lib/te_phoenix_web/live/admin/map_editor_live.ex`. Tool vocabulary: pencil, eraser, bucket, rect, eyedropper, select, stamp. Layers: 5. Hotkeys: B/E/G/R/I/S/T, 1-5 layer switch, Ctrl+Z/Shift+Z undo/redo.

## File layout cheat sheet

```
te_phoenix/
  lib/te_phoenix/              # contexts: game/, world/, battle/, combat/, accounts/
  lib/te_phoenix_web/
    channels/                  # MapChannel, BattleChannel, etc.
    live/admin/                # AdminSauce LiveView CRUD hubs
    controllers/               # REST API
  priv/repo/migrations/
  assets/                      # JS hooks, CSS
packages/render/src/           # @twisted/render — projections, renderer, entities, shaders
player/src/                    # SvelteKit player client
```

## Where to look for stuff

- "Where's X stored?" → `te_phoenix/priv/repo/migrations/` is canonical
- "How does Y work at runtime?" → `te_phoenix/lib/te_phoenix/`
- "What does the player see?" → `player/src/` (current) or `ui.retired/` (legacy reference)
- "Render code?" → `packages/render/src/`

## Communication style

Short. Direct. No filler. Match the user's tone — if they're terse, be terse. Don't summarize what you just did unless asked.
