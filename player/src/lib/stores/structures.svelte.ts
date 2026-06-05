// Deployed structures on the current map (player houses, capsule
// shelters, banners, etc). Phoenix pushes `deployed_structures` on
// init and broadcasts `structure_deployed` / `structure_removed` per
// place/destroy.

export interface Structure {
  id: number
  x: number
  y: number
  name?: string
  icon?: string | null
  owner_id?: number | null
  data_json?: string | null
  interior_map_id?: number | null
}

function createStructuresStore() {
  let list = $state<Structure[]>([])

  return {
    get list() { return list },
    set(next: Structure[]) { list = next ?? [] },
    upsert(s: Structure) {
      const idx = list.findIndex((x) => x.id === s.id)
      if (idx === -1) list = [...list, s]
      else { const next = list.slice(); next[idx] = s; list = next }
    },
    remove(id: number) { list = list.filter((s) => s.id !== id) },
    clear() { list = [] }
  }
}

export const structures = createStructuresStore()
