// Active status effects on the local character. Phoenix pushes
// `active_statuses` after init and on any change.

export interface StatusEffect {
  id: number
  name: string
  icon?: string | null
  type?: string | null
}

function createStatusEffectsStore() {
  let active = $state<StatusEffect[]>([])

  return {
    get active() { return active },
    set(list: StatusEffect[]) { active = list ?? [] },
    clear() { active = [] }
  }
}

export const statusEffects = createStatusEffectsStore()
