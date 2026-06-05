// Fog-of-war store. Updated by Phoenix `fog_delta` and `fog_reset`
// pushes on the game channel. The renderer reads `visible` and
// `explored` sets to dim or hide tiles the player can't see.

export interface FogState {
  visible: Set<string>
  explored: Set<string>
  hiddenCount: number
}

function key(x: number, y: number) {
  return `${x},${y}`
}

function createFogStore() {
  let state = $state<FogState>({
    visible: new Set(),
    explored: new Set(),
    hiddenCount: 0
  })

  return {
    get visible() { return state.visible },
    get explored() { return state.explored },
    get hiddenCount() { return state.hiddenCount },

    setInitial(payload: {
      visible: [number, number][]
      explored: [number, number][]
      hidden_count: number
    }) {
      state = {
        visible: new Set(payload.visible.map(([x, y]) => key(x, y))),
        explored: new Set(payload.explored.map(([x, y]) => key(x, y))),
        hiddenCount: payload.hidden_count
      }
    },

    applyDelta(delta: {
      newly_visible: [number, number][]
      newly_explored: [number, number][]
      newly_hidden: [number, number][]
    }) {
      const nextVisible = new Set(state.visible)
      const nextExplored = new Set(state.explored)

      for (const [x, y] of (delta.newly_hidden || [])) nextVisible.delete(key(x, y))
      for (const [x, y] of (delta.newly_explored || [])) nextExplored.add(key(x, y))
      for (const [x, y] of (delta.newly_visible || [])) {
        const k = key(x, y)
        nextVisible.add(k)
        nextExplored.add(k)
      }

      state = {
        visible: nextVisible,
        explored: nextExplored,
        hiddenCount: Math.max(state.hiddenCount - (delta.newly_explored?.length ?? 0), 0)
      }
    },

    reset() {
      state = { visible: new Set(), explored: new Set(), hiddenCount: 0 }
    }
  }
}

export const fog = createFogStore()
