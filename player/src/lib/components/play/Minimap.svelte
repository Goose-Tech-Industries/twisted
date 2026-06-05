<script lang="ts">
  import { onMount } from 'svelte'
  import { world } from '$stores/world.svelte'
  import { character } from '$stores/character.svelte'
  import { debug } from '$stores/debug.svelte'

  debug.register('Minimap', 'stub')
  $effect(() => {
    if (world.map) debug.update('Minimap', 'real')
  })

  // V1: 200×200 mini-canvas, fixed cell size, pure 2D context.
  // No projection, no animation — just a top-down silhouette of the
  // map with a yellow dot for the player. Future iterations swap in
  // a downsampled Pixi pass.
  const SIZE = 200

  let canvas: HTMLCanvasElement | null = null

  // Color buckets — keep simple, mirror the render package's dark
  // palette so the minimap reads as "this is the same world".
  function colorFor(id: number): string {
    if (id === 3 || id === 20 || id === 21 || id === 22 || id === 23) return '#1e3a5f'
    if (id === 5) return '#8a8a8a'
    if (id === 6 || id === 7) return '#1f1f1f'
    if (id >= 8 && id <= 15) return '#5a544f'
    if (id === 0 || id === 14) return '#2e5d31'
    return '#222626'
  }

  function draw() {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = SIZE
    canvas.height = SIZE
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, SIZE, SIZE)

    const map = world.map
    const char = character.active
    if (!map) return

    const cell = Math.floor(Math.min(SIZE / map.width, SIZE / map.height))
    const ox = Math.floor((SIZE - cell * map.width) / 2)
    const oy = Math.floor((SIZE - cell * map.height) / 2)

    for (let y = 0; y < map.height; y++) {
      const row = map.tiles[y]
      for (let x = 0; x < map.width; x++) {
        ctx.fillStyle = colorFor(row?.[x] ?? 0)
        ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell)
      }
    }

    // Other players — small blue dots
    for (const p of world.players) {
      ctx.fillStyle = '#7baaff'
      ctx.fillRect(ox + p.x * cell, oy + p.y * cell, cell, cell)
    }

    // Self — gold dot with glow
    if (char) {
      ctx.shadowColor = '#c9a14a'
      ctx.shadowBlur = 6
      ctx.fillStyle = '#c9a14a'
      ctx.fillRect(ox + char.x * cell - 1, oy + char.y * cell - 1, cell + 2, cell + 2)
      ctx.shadowBlur = 0
    }
  }

  $effect(() => {
    // Re-draw when any of these change.
    void world.map
    void character.active?.x
    void character.active?.y
    void world.players
    draw()
  })

  onMount(draw)
</script>

<div class="minimap-frame">
  <canvas bind:this={canvas}></canvas>
  {#if !world.map}
    <div class="empty">No map data yet…</div>
  {/if}
</div>

<style>
  .minimap-frame {
    position: relative;
    width: 200px;
    height: 200px;
    background: #050505;
    border: 1px solid #2a2a2a;
    box-shadow: 0 0 0 1px rgba(201, 161, 74, 0.18) inset;
    border-radius: 0.25rem;
    overflow: hidden;
    margin: 0 auto;
  }
  canvas { display: block; image-rendering: pixelated; width: 100%; height: 100%; }
  .empty {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.7rem; color: #6a665b;
  }
</style>
