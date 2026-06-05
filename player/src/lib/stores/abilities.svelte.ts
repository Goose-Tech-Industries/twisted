// Combat abilities the local character has unlocked. Phoenix pushes
// `abilities_list` on `get_abilities`.

export interface Ability {
  id: number
  ability_id?: number
  name?: string
  icon?: string | null
  cooldown?: number
  mp_cost?: number
  description?: string | null
}

function createAbilitiesStore() {
  let list = $state<Ability[]>([])

  return {
    get list() { return list },
    set(next: Ability[]) { list = next ?? [] },
    clear() { list = [] }
  }
}

export const abilities = createAbilitiesStore()
