# Renderer ↔ Fog of War integration

**Audience:** U (renderer), reading after `Te.Phoenix.Game.Fog` ships
in 1.5e. This file describes the data shape U needs and the
recommended Pixi technique. **No code changes required to the
renderer in 1.5e itself** — this is a forward-looking spec for U's
follow-up batch.

## The three states

Per character, per map, every tile has exactly one state:

| State      | Render | Source |
|------------|--------|--------|
| `:hidden`  | black / fog | never seen by this character |
| `:explored` | dimmed / grayscale; show terrain only, no entities | seen before, currently outside vision |
| `:visible` | full color; terrain + entities + objects | currently inside `vision_radius` |

## Server → renderer data shape

The server computes the per-character view and ships it to the
renderer as a single map:

```js
{
  visible: Set<"x,y">,      // currently in sight
  explored: Set<"x,y">,     // ever seen (subset includes visible)
  hidden_count: number,     // total tiles - explored.size
}
```

The renderer derives `hidden = total_tiles - explored` lazily;
no need to materialize the hidden set.

### On map join

Player client receives this shape inside the `init_self` payload
under a new `fog` key (Butterfingers wires this in his
`map_channel.ex` batch — see `docs/player-fog-integration.md`).

### On movement / reveal events

Server broadcasts a delta on the `fog:CID:MID` PubSub topic; the
channel forwards as a `fog_delta` push:

```js
{
  newly_visible: [[x,y], ...],   // explored → visible
  newly_explored: [[x,y], ...],  // hidden → explored (first sight)
  newly_hidden: [[x,y], ...]     // visible → explored (moved away)
}
```

The renderer applies the delta: union into `explored`, swap tiles
between `visible` and `explored`. **Don't re-fetch the full state.**

## Recommended Pixi technique

### One fog texture, additive blend

Pixel-perfect fog is expensive when computed every frame. The
cheap-and-correct method:

1. **Allocate a `RenderTexture` matching the tile grid in cell units.**
   For a 50×50 map at 32px tiles, allocate 50×50 single-pixel
   alpha texture (small enough to keep in GPU memory).

2. **Each cell's alpha encodes its state:**
   - `0.0` for `visible` (fully transparent → tile shows full color)
   - `0.5` for `explored` (semi-transparent black overlay → tile dims)
   - `1.0` for `hidden` (opaque → tile is invisible)

3. **Render the fog texture as a full-screen sprite over the tile
   layer with `BlendMode.NORMAL` (or MULTIPLY for a darker look).**

4. **On `fog_delta`, only update the changed cells:**
   ```ts
   for (const [x, y] of delta.newly_visible) maskAlpha[y * w + x] = 0.0
   for (const [x, y] of delta.newly_explored) maskAlpha[y * w + x] = 0.5
   for (const [x, y] of delta.newly_hidden) maskAlpha[y * w + x] = 0.5
   fogTexture.update(maskAlpha)
   ```

5. **Entities (NPCs, drops, players) should be culled by visibility:**
   only render entity sprites whose tile is in the `visible` set.
   The dim explored state shows terrain only — entities have moved
   on by then.

### Cheaper alternative — per-tile shader

Skip the mask texture entirely and pass the per-tile state into the
tile fragment shader as a uniform texture or attribute. Multiply
the tile color by `state * 0.5 + 0.5` (visible=1.0, explored=0.5,
hidden=0.0). Costs a uniform fetch per tile but no extra render
pass. Use this if the fog texture is showing seams / aliasing on
large maps.

## Performance constraints

- Fog state changes ONLY on `mark_movement` events (every player
  step). At ~5 steps/sec worst case, the renderer gets ~5
  deltas/sec — trivial.
- Don't recompute the fog texture every frame. Cache it; only
  update on delta receipt.
- For maps >100×100, consider chunking the fog texture into 32×32
  sub-grids and only updating the affected chunks.
- Hidden tiles should skip entity / object draws entirely (saves
  draw calls when most of the map is dark).

## Disabled-fog short-circuit

When the capability is OFF or `game_maps.fog_of_war = 0`:
- Server returns `visible == explored == all_tiles_set`
- Renderer can detect "all tiles visible" once and skip the fog
  pass entirely until the next `init_self`

## Open questions for U's batch

- Do we want fog tiles to fade in/out over ~200ms, or hard-cut?
  Hard-cut is cheaper; fading needs an additional alpha-target per
  cell that animates toward the destination.
- Should explored tiles flicker subtly to imply "unfresh memory,"
  or be steady? Brand voice says steady — gothic dread, not
  jittery.
- 3D / first-person mode is out of scope here; fog is a 2D / 2.5D
  feature for now.
