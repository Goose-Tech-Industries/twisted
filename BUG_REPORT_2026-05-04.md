# AdminSauce Bug Report — 2026-05-04

Tested by: JARVIS (Claude Desktop, browser automation, OWNER session)
App: AdminSauce / Twisted Engine Control Panel
URL: https://tcgaming.quest/sauce
Stack: Phoenix LiveView + @twisted/render (Pixi v8) via TwistedCanvas hook

---

## Status board

| Ticket | Severity | Status | Deploy |
|--------|----------|--------|--------|
| T1 — API key plaintext | Critical | DEPLOYED 2026-05-04 — awaits JARVIS verify | Combined |
| T2 — Canvas tile-size math | High | PARTIAL FIX (T2.1 in progress) — see notes below | Combined |
| T2.1 — Fit scales tileSize + click diagnostics | High | DEPLOYED 2026-05-04 — JARVIS verified click math + Fit fully fixed | Batch C |
| T2.2 — Paint not visible | High | DEPLOYED 2026-05-04 ~11:34 UTC — awaits JARVIS verify | Batch D |
| T3 — Float precision (Dark column) | Medium | DEPLOYED 2026-05-04 — awaits JARVIS verify | Combined |
| T4 — Tile palette names | Low/Med | DEPLOYED 2026-05-04 ~11:49 UTC — 56 named tiles, dark Celtic fantasy theme | Batch E |
| T5 — Create Map button type | Trivial | DEPLOYED 2026-05-04 — awaits JARVIS verify | Combined |

**Deploy log (2026-05-04 ~10:16 UTC):** `MIX_ENV=prod mix assets.deploy` ✓ → `MIX_ENV=prod mix release --overwrite` ✓ → `pm2 restart twisted-phoenix` ✓. Post-restart smoke check: `/sauce/settings` 200, `/sauce/world` 200, `/assets/js/app.js` 200. All four tickets shipped in one combined release rebuild — single ~15s 502 window instead of two.

---

## T2 verification (JARVIS, 2026-05-04 post-deploy)

**Wins:**
- New bundle live (`eeb34161` → `d0e8874a`)
- ⛶ Fit button visible
- Pointer-target ambiguity resolved — Inspector consistently updates on hover (didn't before)
- Click misalignment reduced from ~10 tiles to ~3 tiles

**Still broken:**
1. Map renders too small inside canvas. After Fit, canvas grew to 938×938 but the rendered map stayed at 420×420 (filled <¼ of new canvas). **Cause confirmed in code:** my Fit only resized the Pixi backing buffer; it did NOT scale `tileSize`, so each tile still drew at 20px regardless of canvas growth.
2. Clicks still ~3 tiles off. Some state value the renderer is using doesn't match what I expect. Need runtime data to pinpoint.
3. Brush + click registers a state change (unsaved indicator flips) but the canvas doesn't visually update. Likely downstream of (1)/(2) — paint going to a tile that isn't where the user visually clicked.

## T2.1 — Code ready, awaits deploy

**Changes made (`packages/render/src/renderer.ts`):**
- Added `public setTileSize(newTileSize: number)` — recreates the projection at the new tile size, propagates to `EntityRenderer`, replays `lastState`. Lets Fit-to-Screen scale tiles instead of just the canvas.
- Added `public getTileSize()` — read-only accessor.

**Changes made (`assets/js/hooks/twisted_canvas.js`):**
- `fitToScreen()` rewritten to compute the largest integer `tileSize` that keeps the map inside the available `<main>` box (min 4px), then `setTileSize(newTileSize)` and `resize()` together. Map now actually fills the canvas after Fit.
- `handlePointerDown` now logs a `[CLICK]` diagnostic to the console with: page coords, rect dims, computed local coords, canvas buffer size, DPR, zoom level, tileSize, full state snapshot (camX/camY/viewportW/viewportH/mapWidth/mapHeight), and resulting tile. JARVIS can read this directly to identify the residual misalignment cause.
- Existing `[TwistedCanvas] fit` log added so we can confirm Fit ran and which dimensions were chosen.

### Regression test — Ticket 2.1 (after deploy)
1. Reload `/sauce/world/maps/25/edit`. Open devtools Console.
2. **Initial render:** map should fill the 420×420 canvas (or whatever inline size). No top-left-quarter rendering.
3. **Click any tile.** Console should log `[CLICK] {...}` with the full state snapshot. Capture the entire object — that's what JARVIS needs to send back if clicks are still off.
4. **Click ⛶ Fit.** Console should log `[TwistedCanvas] fit` with `newTileSize`, `w`, `h`, etc.
5. After Fit, the **map fills the new canvas** (not just the canvas growing around a tiny map). Tile size visibly increases.
6. **Click again post-Fit.** Tile reported should match the visually-clicked tile.
7. **Brush + click:** click a tile with a non-zero brush → that tile should visibly change color, AND the unsaved indicator should flip.

---

## T2.2 — Paint pipeline root cause + fix

**Root cause:** `parse_layers/4` first branch — when `layers_json` parsed cleanly — returned each layer as the raw value from JSON with `Map.get(layers, key, [])` as fallback. **No size validation, no padding.** If a map's saved JSON had an empty array or a short layer, the in-memory layer was that empty/short array. `apply_brush_stamp/4` then called `List.replace_at(empty_list, idx, value)` which silently returns the empty list unchanged — but the function still recorded a stamp op, so `commit_op` ran, the unsaved flag flipped, and a `map:state` was pushed. The renderer redrew with the still-empty layer, so nothing changed visually. Inspector also reads via `Enum.at(layer, idx, 0)` which returns the default 0 on an empty list — explaining JARVIS's "ground id: 0" report after painting water (id 3).

**Why it didn't break the older legacy `tiles_json` path:** the legacy branch already calls `ensure_len(.., w * h)` on every layer. The newer `layers_json` branch was missing that step.

**Changes made (`map_editor_live.ex`):**
- `parse_layers/4` first branch — now uses `w` and `h` (previously underscored as unused) to compute target size, and pads each layer via `ensure_len/3` with the correct fill value: `0` for ground/passability/elevation, `-1` for overlay/fringe (matches `empty_layers/2` semantics).
- `ensure_len/2` → split into `ensure_len/2` (delegates with fill=0 for backwards compat) and `ensure_len/3` (with explicit fill value). Existing callers that passed two args still work; new callers can specify fill.

### Regression test — Ticket 2.2 (after Batch D deploys)
1. Reload `/sauce/world/maps/25/edit` (CLAUDE_TEST_DELETE_ME, the map JARVIS used).
2. Click ⛶ Fit (so we're in the post-Fit view that's been verified mathematically correct).
3. Pick **Brush** tool, pick a non-zero tile from the palette (e.g. water = id 3).
4. Click an empty grass tile somewhere on the map.
5. Expected: that tile **visibly changes color** to the brush color, AND the unsaved indicator flips to "unsaved."
6. Hover the same tile — Inspector should show `ground id: 3` (or whichever brush you used).
7. Reload the page. Tile should persist (assuming you saved; if not, undo/redo or reload after Save).
8. **Negative case** — clicking the same tile with the SAME brush again should be a no-op (no second unsaved flip), since `apply_brush_stamp` skips if `prev == value`.

Batch A = T1 + T3 + T5 (one release rebuild)
Batch B = T2 (separate rebuild — bigger change set)

---

## Ticket 1 — API key plaintext at /sauce/settings

**Problem:** `ai_api_key` row renders the full Anthropic key as plain text in a `<td>`. Visual `...` is CSS truncation only; HTML still contains `sk-ant-api03-...`.

**Fix approach:** Add `sensitive` flag to settings (or detect by suffix `_api_key`/`_secret`/`_token`/`_password`). Render mask + Reveal button when sensitive.

**Changes made (settings_live.ex):**
- Added `revealed_keys: MapSet.new()` to mount assigns
- Added `defp sensitive?/1` — detects keys ending in `_api_key`, `_secret`, `_token`, `_password`, or containing `private_key`
- Added `defp mask_value/1` — returns `••••••••••••` for non-empty values
- Added `handle_event("reveal", ...)` and `handle_event("hide", ...)` to toggle per-key reveal state
- Template: when sensitive AND not revealed, show mask + "Reveal" button. When sensitive AND revealed, show value + "Hide" button. Non-sensitive renders as before.
- Edit input flips to `type="password"` for sensitive settings until reveal is toggled. `autocomplete="off"` added.
- Search filter no longer matches against sensitive values (only against keys) — prevents value-substring probing.

### Regression test — Ticket 1
1. Go to `/sauce/settings`
2. Find the `ai_api_key` row
3. Expected (default): value cell shows `••••••••` (or similar mask), no raw key chars in DOM
4. Click "Reveal" button
5. Expected: full key visible, button changes to "Hide"
6. Click "Hide"
7. Expected: returns to mask
8. View page source / inspect element BEFORE clicking Reveal
9. Expected: no raw `sk-ant-` substring anywhere in HTML
10. **Fail conditions:** raw key visible on initial page load, no toggle button, key leaks into HTML even when masked

After deploy: rotate the key at console.anthropic.com (it has been visible).

---

## Ticket 2 — Canvas tile-size math (top-left render + click misalign + invisible paint)

**Problem:** Three symptoms, one or more underlying bugs in the @twisted/render glue:
1. Map renders only in top-left of canvas viewport
2. Click coordinates land on tiles far from cursor (non-uniform error: ~7.7px and ~50px effective tile size at different click positions)
3. Brush/Eraser/Fill clicks update state but don't paint visibly

**Root causes identified by code audit:**
- `renderer.ts:961-962` — `currentOffsets()` math: `offsetX = -state.camX * step + vp.w/2 - step/2` likely wrong when `camX=0`, pushes map off-screen
- `twisted_canvas.js:128, 242` — CSS transform `scale()` AND manual `/zoomLevel` division in pointer math = double-counts at any non-1.0 zoom
- `twisted_canvas.js:125-127` — pointer target switches between Pixi canvas and wrapper depending on render state; their bounding rects differ
- Double `mounted` fire on page load — known LiveView pattern, needs guard

**Fix approach:**
- Single source of truth for camera transform in `currentOffsets()` — fix sign / centering math
- Lock pointer target to Pixi canvas after init, never the wrapper
- Remove duplicate zoom math (let CSS transform + getBoundingClientRect handle it natively)
- Add `if (this.el._twistedMounted) return; this.el._twistedMounted = true;` guard
- Add `Fit to Screen` action + responsive resize on container size changes

**ACTUAL ROOT CAUSE found in code audit:** the render path (`update()` in `renderer.ts:293-298`) and the click-conversion path (`currentOffsets()` in `renderer.ts:961-967`) used **different formulas** for `offsetX/offsetY`. Render used `-camX*step` (no centering for classic mode); click conversion used `-camX*step + vp.w/2 - step/2` (centered). With `state.camX = (viewport_w - 1) / 2 = 9.5` (set by map_editor_live for centered edit-mode camera), the render formula yielded `offsetX = -199.5`, drawing only tiles 10–19 in the top-left quarter of the 420×420 canvas. The click handler computed for the centered formula and reported tiles 0–19 spread across the full canvas — guaranteed mismatch on every click. Fixing this single divergence resolves all three reported symptoms (top-left rendering, click misalignment, invisible paint).

**Changes made:**

`packages/render/src/renderer.ts`:
- Added `private computeOffsets(state)` as the single source of truth for camera transform (returns `{ step, vpPxW, vpPxH, offsetX, offsetY }`). Encodes the convention that `state.camX/camY` is the world tile centered in the viewport, with isometric special-cased for diamond tile geometry.
- Refactored `update()` to call `computeOffsets` instead of computing offsets inline. Eliminates the divergence.
- Refactored `currentOffsets()` (still used by `screenToTile`, `tileToScreen`, `EntityRenderer.getOffset`) to delegate to `computeOffsets`.
- Added `public resize(width, height)` — calls `app.renderer.resize()` and replays last state. Used by the hook's ResizeObserver and the new fit-to-screen button.

`assets/js/hooks/twisted_canvas.js`:
- Added double-mount guard: `if (el._twistedMounted) return; el._twistedMounted = true;` at top of `mounted()`. `destroyed()` clears the flag.
- Extracted `getPointerTarget()` and `pointerToTile(e)` helpers — three handlers (pointerdown / pointermove / right-click eyedropper) now share one canonical conversion path. Caches the canvas reference so the bounding rect stops flipping between `canvas` / `pixiWrapper` / `el`.
- Replaced fixed `/this.zoomLevel` division with rect-derived scale: `scaleX = rect.width / target.clientWidth`. Robust to any future CSS transform (rotate, additional parent scales) layered on the editor pane.
- Added `ResizeObserver` on the host element — keeps the Pixi backing buffer in sync with the element's CSS box. Throttled via `requestAnimationFrame` so a window-resize burst doesn't thrash the renderer.
- Added `fit_to_screen` LiveView event handler that resizes the canvas to the parent `<main>` available space while preserving the map's aspect ratio.

`lib/te_phoenix_web/live/admin/map_editor_live.ex`:
- Added `⛶ Fit` button in the toolbar next to `# Grid` (line ~1671).
- Added `handle_event("fit_to_screen", ...)` that pushes the same-named event to the canvas hook.

**Changes made (assets rebuilt):** `pnpm build` in `packages/render` regenerated `dist/` — Phoenix `mix assets.build` then bundled the updated hook into `priv/static/assets/js/app.js`. No esbuild errors. TypeScript clean.

### Regression test — Ticket 2
1. Go to `/sauce/world/maps/25/edit` (CLAUDE_TEST_DELETE_ME) or any 20×20 map
2. Open browser devtools Console
3. **Render fills viewport:** map should fill the canvas — no large dark area to right/bottom
4. **Click test 1:** click at canvas-relative position (10 × tileSize, 10 × tileSize) — i.e. middle of tile (10,10)
   - Expected: console `[CLICK]` log shows `tile: [10, 10]`
   - Fail: any other tile reported
5. **Click test 2:** click near top-left corner, canvas-relative (~tileSize/2, ~tileSize/2)
   - Expected: `tile: [0, 0]`
6. **Click test 3:** click near bottom-right of visible map, canvas-relative (~19.5×tileSize, ~19.5×tileSize)
   - Expected: `tile: [19, 19]`
7. **Paint visible:** select Brush tool, pick a colored tile from palette, click on a different tile
   - Expected: that tile visibly changes color on the canvas immediately, AND unsaved indicator updates
   - Fail: only the unsaved indicator changes, canvas doesn't update
8. **Mount-once:** reload the page, count `[TwistedCanvas] mounted` console messages
   - Expected: exactly 1
   - Fail: 2+
9. **Zoom doesn't break clicks:** press `+` to zoom in, then click a tile
   - Expected: clicked tile matches cursor position
   - Fail: clicks land on wrong tile after zoom
10. **Fit-to-screen:** click the new ⛶ Fit button in the toolbar
    - Expected: map scales to fill the available canvas area while preserving aspect ratio
    - Click a tile after fitting — expected: clicked tile matches cursor position, no offset
11. **Auto-resize on window resize:** drag the browser window narrower
    - Expected: canvas backing buffer follows the container's CSS box (no stale-buffer pixelation, clicks still hit the right tile after resize settles)
    - Fail: canvas stays at original size while the page reflows around it

---

## Ticket 3 — Float precision in Maps "Dark" column

**Problem:** Ashveil's Dark = `0.30000001192092896` (32-bit float artifact).

**Fix:** `Float.round(@map.dark, 2)` (or similar) on display only. Stored value untouched.

**Changes made (world_hub_live.ex):**
- Added `defp format_float/1` helper that handles nil / float / integer / string-encoded float, formats with `:erlang.float_to_binary(_, decimals: 2)`
- Maps tab Dark column changed from `{row["ambient_dark"]}` to `{format_float(row["ambient_dark"])}`
- Stored value untouched — UPDATE/INSERT paths still use raw `to_float(...)`

### Regression test — Ticket 3
1. Go to `/sauce/world` → Maps tab
2. Look at Ashveil's Dark column
3. Expected: `0.3` (or `0.30`)
4. Fail: any value with more than 2 decimal places displayed
5. Edit Ashveil, change Dark to e.g. `0.7`, save
6. Expected: value persists as `0.7`, displays as `0.7`
7. Apply same check to any other float-displaying columns in the maps table

---

## Ticket 4 — Tile palette names (DEFERRED)

**Problem:** Tiles 8-63 named generically (`tile 8` through `tile 63`).

**Decision needed from user:** Are tiles 8-63 real intended tiles awaiting names, or padding I should remove from the palette? Cannot fix without this.

---

## Ticket 5 — "+ Create Map" button type

**Problem:** `type="submit"` outside any `<form>`. Should be `type="button"`.

**Fix:** One-character template change.

**Changes made (world_hub_live.ex):**
- Added `type="button"` to all three CRUD create buttons: `+ Create Map`, `+ Create NPC`, `+ Create Region` (lines 612, 615, 618). Same template, same root cause for all three; fixed together.

### Regression test — Ticket 5
1. Go to `/sauce/world` → Maps tab
2. Inspect the "+ Create Map" button
3. Expected: `type="button"` attribute
4. Fail: still `type="submit"`
5. Click the button — should open the create-map flow as before (no regression in behavior)
6. Press Tab to button, then Enter — should trigger create-map flow (not form submit)

---

## Production stability notes

- Phoenix release rebuilds = ~15s 502 outages
- Coordinate deploys: ping the other terminal + wait for ack before any rebuild
- Batch A and Batch B should be separate rebuilds; do not interleave
