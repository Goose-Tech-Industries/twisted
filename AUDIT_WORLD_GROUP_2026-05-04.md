# AdminSauce Audit — World Group

**Date:** 2026-05-04
**Scope:** All 5 LiveView routes under the World group
**Source:** `lib/te_phoenix_web/router.ex` lines 249-253

## Routes audited

| Route | Module | Purpose |
|-------|--------|---------|
| `/sauce/world` | `WorldHubLive` | Hub: Maps, NPCs, Regions, Spawns, Connections, Versions, Worldforge |
| `/sauce/world/maps/:id/edit` | `MapEditorLive` | Visual tile editor (canvas + tools) |
| `/sauce/world/map-connections` | `MapConnectionsLive` | Read-only TELEPORT overview |
| `/sauce/world/objectives` | `ObjectivesLive` | No-code objective definitions |
| `/sauce/world/waves` | `WavesLive` | Wave sequence definitions |

## What works (top-line)

- **Full CRUD on Maps, NPCs, Regions** in WorldHubLive
- **Visual map editor** — paint, rect, select, undo/redo, autotile, templates, stamps, animations, multi-user cursors, Tiled import, JSON export
- **Spawn zones, sound zones, tile animations** — create + delete works (move/edit gaps below)
- **Map connections overview** — read-only listing across all maps
- **Objectives + Waves** — full CRUD via no-code RuleBuilder schemas

## Missing from old memo (not in World group)

- **NPC Patrols** — no path editor anywhere in `/sauce/world`. The NPC `move_type` field includes "PATROL" as an enum value, but there's no UI to draw or assign a patrol path. Probably belongs in a per-map editor tool or a dedicated tab.
- **Scheduler** — lives in `CampaignHubLive`, not the World group. If we want a world-scheduler (events fire on time-of-day, weather cycles, etc.), it doesn't exist.

## Partial features — gaps worth filling

### 🟠 MapEditorLive — object/event UI gaps

1. **Objects can be placed and deleted, but not moved or edited.** No drag handler, no "edit this object" panel. (`map_editor_live.ex:496-502`)
2. **Event `data` field is never editable.** Events can be linked to scripts, but the generic JSON `data` config column stays `nil` forever — there's no way to parameterize a script from the UI. (`map_editor_live.ex:1322`)
3. **Spawn zone `encounter_table` is a raw textarea.** No JSON validation, no spawn editor, no help text. Invalid JSON silently accepted. (`map_editor_live.ex:611`)
4. **Sound zone volume has no min/max.** Float parsed with default 0.6, but volume of 999 will save fine. (`map_editor_live.ex:639`)
5. **No visible move/resize for spawn zones or sound zones.** Once placed, you can only delete + recreate.

### 🟠 WorldHubLive — Region auto_rules has no editor

Regions accept an `auto_rules_json` field (rules that fire when player enters/exits the region: weather changes, enemy modifiers, etc.) but the only UI is a raw textarea. Other entities (Objectives, Waves) get the RuleBuilder treatment — Regions don't. (`world_hub_live.ex:1019-1022`)

### 🟠 WavesLive — Rounds editor is raw JSON

The wave rounds field is a textarea with a "+ Quick Add Wave" button that pastes a template. If you want to edit spawn npc_template, count, zone_key, scaling per round, you're hand-editing JSON. No round-by-round visual builder. (`waves_live.ex:80-84, 147-149`)

### 🟠 ObjectivesLive — no enable/disable toggle

Form hardcodes `enabled: true` (`objectives_live.ex:229-246`). To disable an objective without deleting it, you currently can't.

## Latent risks (not user-facing yet)

1. **Map resize is non-atomic.** Width/height update separately from layer-data resize. If something fails mid-way, layers are out of sync with declared dimensions. (`map_editor_live.ex:984`)
2. **Tiled import hardcodes 3 layers.** Assumes layer order = ground, overlay, fringe. Maps with 2 or 4+ layers map to the wrong slots silently. (`map_editor_live.ex:1176-1190`)
3. **Tile animation frames input is fragile.** Comma-separated string parser. "1,2,3" works; "1, 2, 3" may not. (`map_editor_live.ex:696`)
4. **Several DB queries don't check table existence.** `load_draft_stacks`, `load_autotile_groups`, `game_map_versions`, `game_map_connections` — most fall through to graceful empty results, but the load-without-check pattern can mask "table missing" as "no data."
5. **count_query interpolates table name into SQL string.** Currently only called with hardcoded names — fine — but the pattern is one bad refactor away from SQL injection. (`world_hub_live.ex:1202-1207`)
6. **Inconsistent `@impl true` annotations.** Style only, no runtime impact.

## Read-only views — intentional or gaps?

- **Spawns tab** — read-only filtered NPC list. To create a spawn you must create an NPC + flag `is_enemy=1`. Reasonable, but the tab title implies more.
- **Connections tab** — overview only, edits happen in the per-map editor. Reasonable.
- **Versions tab** — gated on `game_map_versions` table existence; falls back gracefully. Reasonable.
- **map-connections route** — duplicate of Connections tab? They both display TELEPORT events parsed from `collisions_json`. Likely an older route preserved for direct-link bookmarks. Worth deciding: deprecate `/world/map-connections` or merge it into the Connections tab cleanly.

## Recommended priority order (if we want to fix some of this)

**Tier 1 — completes core editing flows:**
- E1. Object move + edit panel in MapEditorLive
- E2. Event `data` JSON editor (or RuleBuilder schema)
- E3. Spawn zone encounter_table → structured editor (NPC dropdown + count + scaling)
- E4. Sound zone volume bounds + slider UI

**Tier 2 — fills out world-building:**
- E5. NPC Patrols path editor (draw path on map with click-to-add waypoints)
- E6. Region auto_rules → RuleBuilder schema like Objectives
- E7. Wave rounds visual editor (per-round table)
- E8. Objective enable/disable toggle

**Tier 3 — paranoia:**
- E9. Atomic map resize transaction
- E10. Tiled import: detect layer-by-name instead of by order
- E11. Tile animation frames → numeric inputs instead of CSV string
- E12. Add table-existence checks where missing

**Tier 4 — cleanup:**
- E13. Decide fate of `/sauce/world/map-connections` route (deprecate vs merge)
- E14. Add `@impl true` consistently
- E15. Replace `count_query` string interpolation with parameterized table whitelist

## Decisions needed from user

1. Build NPC Patrols path editor? If so — inside MapEditorLive as a new tool (alongside spawn_zone), or its own LiveView at `/sauce/world/npc-patrols`?
2. Decide on `/sauce/world/map-connections` — keep as-is, deprecate, or upgrade to interactive (drag-to-warp)?
3. Tier 1 items (E1–E4) are quick wins that close real editing gaps. Worth a pass tomorrow?
