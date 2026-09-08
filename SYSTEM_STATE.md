# Twisted Engine — Complete System State & Memory Bank
*Last Updated: 2026-09-03 | Status: All Systems Operational & Live*

---

## 1. Executive Summary & Quick Launch

* **Phoenix Admin Suite URL:** `http://localhost:8420/sauce/world`
* **Direct Map Editor URL:** `http://localhost:8420/sauce/world/maps/1/edit`
* **Local ComfyUI AI Server:** `http://127.0.0.1:8188` (Desktop shortcut: `ComfyUI (Twisted AI)`)
* **Active Map #1:** **Ashveil** (30×30 ruined gothic citadel, 2.5D elevated basalt walls, flickering ember braziers).

### Daily Startup Commands (PowerShell)
```powershell
# 1. Start Phoenix Backend (Port 8420)
cd C:\Users\rjd42\Desktop\twisted\te_phoenix
mix phx.server

# 2. Start ComfyUI GPU Engine (Port 8188)
# Double-click desktop shortcut "ComfyUI (Twisted AI)" OR:
C:\ComfyUI_windows_portable\run_twisted_ai.bat
```

---

## 2. Infrastructure & Environment Specifications

| Component | Configuration / Location | Status |
| :--- | :--- | :--- |
| **Operating System** | Windows 11 (Host user `rjd42`) | Verified |
| **Database** | MariaDB 12.2 on `127.0.0.1:3306`, DB: `twisted_rpg` | Running |
| **DB Credentials** | User: `twisted`, Password: `twisted`, Plugin: `mysql_native_password` | Connected |
| **Phoenix Server** | Elixir 1.20 + Phoenix 1.8.5 on Bandit HTTP | Port `8420` (0.0.0.0) |
| **GPU / AI Hardware** | NVIDIA GeForce GTX 1660 SUPER (6GB VRAM) | Active (cuda:0) |
| **ComfyUI Portable** | `C:\ComfyUI_windows_portable` (Python 3.11.9 isolated) | Port `8188` |
| **SD Checkpoint** | `v1-5-pruned-emaonly.safetensors` (4.26 GB) in checkpoints folder | Loaded / Warmed up |
| **Rendering Engine** | `@twisted/render` (PixiJS v8 + Three.js) in `packages/render` | Compiled & Linked |

---

## 3. Key Components Implemented

### A. One-Shot Unified World Forge
* **Module:** [`TePhoenix.World.UnifiedWorldBuilder`](file:///C:/Users/rjd42/Desktop/twisted/te_phoenix/lib/te_phoenix/world/unified_world_builder.ex)
* **Functionality:**
  * Semantic prompt analyzer (dungeon, organic cave, or maze).
  * Procedural room carving, hall connectivity, passability grid.
  * 2.5D elevation assignment (extruding walls with shadow falloff).
  * Dynamic light source scattering (flickering braziers, torches, bioluminescence).
  * Local GPU tileset generation via ComfyUI (fallback to starter tileset).
* **Admin UI:** Tab `World Forge` inside [`world_hub_live.ex`](file:///C:/Users/rjd42/Desktop/twisted/te_phoenix/lib/te_phoenix_web/live/admin/world_hub_live.ex#L1192-L1250) with live GPU status badge.

### B. Local ComfyUI REST Provider
* **Module:** [`TePhoenix.AI.Providers.ComfyUI`](file:///C:/Users/rjd42/Desktop/twisted/te_phoenix/lib/te_phoenix/ai/providers/comfyui.ex)
* **Endpoints:**
  * `status/0`: Queries `GET /system_stats` to inspect GPU name, total VRAM, and free VRAM.
  * `generate_tileset/2`: Queues prompt graph to `/prompt`, polls completion on `/history`, saves PNG to `priv/static/tilesets/`.
  * Single-inference benchmark on GTX 1660 SUPER: ~6.4 seconds.

### C. Database Architecture Fixes
* **MariaDB 12 Windows Handshake:** Fixed by creating user `twisted@127.0.0.1` identified via `mysql_native_password`. Avoids SSPI `Negotiate\0` packet match error.
* **Auto-Access:** [`require_staff_hook.ex`](file:///C:/Users/rjd42/Desktop/twisted/te_phoenix/lib/te_phoenix_web/live/admin/require_staff_hook.ex) automatically bypasses session check in `:dev` mode, assigning `OWNER` role.
* **Tables Created & Verified:**
  * `game_maps` (with `render_mode`, `layers_json`, `objects_json`, `schema_version`, `ambient_dark`)
  * `game_tile_types`
  * `game_map_spawn_zones`
  * `game_scheduled_tasks`
  * `game_npcs`
  * `gm_notes`, `staff_messages`
  * `game_map_drafts`, `game_map_stamps`, `game_visual_scripts`, `game_autotile_groups`

---

## 4. Current Map State: Ashveil (Map ID: 1)

* **Name:** Ashveil
* **Prompt:** *"Ashveil, a ruined gothic citadel smothered in deep grey volcanic ash, cracked soot-stained cobblestone pathways, crumbling dark basalt brick walls, charred timber beams, and faint glowing orange embers."*
* **Size:** 30 × 30 tiles
* **Render Mode:** `2.5d` (Extruded height and shadow depth)
* **Chambers:** 5 gothic rooms connected by stone corridors
* **Lighting:** 5 `Smoldering Ember Braziers` (`#ff7700`, radius 6, flicker active) placed across the chambers with `ambient_dark: 0.85`.
* **Live Route:** `http://localhost:8420/sauce/world/maps/1/edit`

---

## 5. Milestones Implemented & Verified

### ✅ Milestone 1: One-Click NPC Sprite Generator (Local GPU)
* Added `generate_sprite/2` in [`TePhoenix.AI.Providers.ComfyUI`](file:///C:/Users/rjd42/Desktop/twisted/te_phoenix/lib/te_phoenix/ai/providers/comfyui.ex) producing 4-directional 16-bit RPG walk cycle sheets on local GPU (GTX 1660 SUPER).
* Added `sprite_url` column to MariaDB `game_npcs` table.
* Added "✨ Generate Sprite Sheet" button, live GPU progress badge, thumbnail preview, and sprite image column to AdminSauce NPC editor in [`world_hub_live.ex`](file:///C:/Users/rjd42/Desktop/twisted/te_phoenix/lib/te_phoenix_web/live/admin/world_hub_live.ex).
* Added `sprites/` and `tilesets/` to `TePhoenixWeb.static_paths` in [`te_phoenix_web.ex`](file:///C:/Users/rjd42/Desktop/twisted/te_phoenix/lib/te_phoenix_web.ex).

### ✅ Milestone 2: Living Voice Audio (ElevenLabs + Sovereign Soul)
* Created [`TePhoenix.AI.Providers.LivingVoice`](file:///C:/Users/rjd42/Desktop/twisted/te_phoenix/lib/te_phoenix/ai/providers/living_voice.ex) with ElevenLabs TTS, Sovereign Soul voice archetype mapping (elder, warrior, witch, rogue, maiden), and local disk caching in `priv/static/voice/`.
* Added REST endpoints `POST /api/voice/speak` and `GET /api/voice/voices` in [`voice_controller.ex`](file:///C:/Users/rjd42/Desktop/twisted/te_phoenix/lib/te_phoenix_web/controllers/voice_controller.ex).
* Created Web Audio API living voice engine in [`living_voice.svelte.ts`](file:///C:/Users/rjd42/Desktop/twisted/player/src/lib/stores/living_voice.svelte.ts) with `AudioContext`, gain control, and frequency visualizer.
* Enhanced [`DialogueOverlay.svelte`](file:///C:/Users/rjd42/Desktop/twisted/player/src/lib/components/DialogueOverlay.svelte) with real-time pulsing voice wave indicator, replay button, and mute toggle.

### ✅ Milestone 3: Planet Mado Tactical Combat Rules
* **High Ground Advantage:** Implemented in [`tactics.ex`](file:///C:/Users/rjd42/Desktop/twisted/te_phoenix/lib/te_phoenix/battle/tactics.ex) and [`damage.ex`](file:///C:/Users/rjd42/Desktop/twisted/te_phoenix/lib/te_phoenix/battle/damage.ex):
  * +15% hit rate bonus (reduces miss chance by 15).
  * +15% damage bonus on elevated attacks; -10% penalty on low-ground attacks.
  * +2 range bonus when attacker elevation $\ge 1$.
* **Active Defense Timing:** Implemented in [`active_defense.ex`](file:///C:/Users/rjd42/Desktop/twisted/te_phoenix/lib/te_phoenix/battle/active_defense.ex):
  * Perfect window ($\le 150$ms) guarantees 100% negation (`:perfect_dodge`, `:perfect_parry`).
  * Good window ($\le 350$ms) uses standard stat calculation; late/early window suffers 50% chance penalty.
* **Limb Targeting:** Supported via called shot penalties, limb HP damage absorption, bleed-through to main HP, and disabled limb consequences in [`limb.ex`](file:///C:/Users/rjd42/Desktop/twisted/te_phoenix/lib/te_phoenix/battle/limb.ex) and [`damage.ex`](file:///C:/Users/rjd42/Desktop/twisted/te_phoenix/lib/te_phoenix/battle/damage.ex).
* Automated verification test suite in [`planet_mado_rules_test.exs`](file:///C:/Users/rjd42/Desktop/twisted/te_phoenix/test/te_phoenix/battle/planet_mado_rules_test.exs) passed (3/3 tests).

### ✅ Map Overlay "1"s Clutter Fix
* Fixed [`map_editor_live.ex`](file:///C:/Users/rjd42/Desktop/twisted/te_phoenix/lib/te_phoenix_web/live/admin/map_editor_live.ex): `default_layer_visibility/0` now defaults semantic debug layers (`elevation` numbers and `passability` tints) to off, keeping the visual artwork clean while allowing explicit toggle in the Layers panel.

### ✅ Complete Visual Upgrade: Sliced Sprite Atlas + Props + Atmosphere + Backdrop
1. **Sliced Pixel-Art Tileset Atlas:**
   * Generated 256×256 8×8 grid of 32×32 pixel art tiles (`/tilesets/ashveil_tiles.png`) with chiseled basalt masonry, cracked cobblestone with glowing ember seams, charred timber, and volcanic ash layers.
   * Auto-sliced in [`renderer.ts`](file:///C:/Users/rjd42/Desktop/twisted/packages/render/src/renderer.ts) and defaulted across all maps so flat vector blocks are replaced with rich 16-bit RPG pixel art.
2. **Animated Multi-Tile Props & Decals:**
   * Generated 4-frame animated leaping flame sprites (`/sprites/brazier_fire_0.png` .. `3.png`) and updated all 5 braziers in MariaDB `game_map_object_rows` with dynamic flicker lighting.
   * Added multi-tile fluted basalt pillars (32×64) and citadel rubble decals.
3. **Atmospheric Particle Engine:**
   * Built [`AtmosphereRenderer`](file:///C:/Users/rjd42/Desktop/twisted/packages/render/src/atmosphere.ts) in `@twisted/render` with floating embers particle simulation (sinusoidal wind drift, alpha pulsing, glowing fire sparks).
4. **Illustrated Continuous Backdrop:**
   * Added `backdropUrl` support in `RenderState` and generated `ashveil_citadel_bg.png` (960×960 painted continuous citadel chamber illustration).
5. **Verified Build & Tests:**
   * TypeScript `@twisted/render` rebuilt via `tsup`.
   * Elixir `te_phoenix` compiled cleanly.
   * Test suite passed ($6/6$).
