// Overworld visual effects driven by active status effects (e.g. a
// poison cloud trail, fire aura). Phoenix pushes `overworld_effects` as
// a map keyed by effect name. The renderer reads from here.

function createVisualFxStore() {
  let overworld = $state<Record<string, unknown>>({})

  return {
    get overworld() { return overworld },
    setOverworld(fx: Record<string, unknown>) { overworld = fx ?? {} },
    clear() { overworld = {} }
  }
}

export const visualFx = createVisualFxStore()
