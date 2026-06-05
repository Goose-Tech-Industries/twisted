// Tile palette pushed by Phoenix on `tile_palette`. The renderer reads
// `id → color` (and optional sprite urls / frame tiles) so admins can
// define new tiles in the Creation Suite without a player rebuild.
//
// Re-export the renderer's type so the store's shape can never drift
// from what @twisted/render actually consumes.

import type { TilePaletteEntry } from '@twisted/render'
export type { TilePaletteEntry }

function createTilePaletteStore() {
  let entries = $state<TilePaletteEntry[]>([])

  return {
    get entries() { return entries },
    set(next: TilePaletteEntry[]) { entries = next ?? [] },
    clear() { entries = [] }
  }
}

export const tilePalette = createTilePaletteStore()
