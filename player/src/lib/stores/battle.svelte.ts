// Battle state — driven by battle:* channel events.
// Mirrors enough of the Phoenix battle payload to drive the UI:
// combatants, turn order, log, current actor, available skills.

export interface Combatant {
  charId: number
  name: string
  team: number
  level: number
  current_hp: number
  max_hp: number
  current_mp: number
  max_mp: number
  is_player: boolean
  icon?: string
  knocked_out?: boolean
  status_effects?: string[]
  current_ap?: number
  max_ap?: number
  combo_arts?: Array<{
    name: string
    sequence_str: string
    ap_cost: number
    damage_formula?: string
  }>
}

export interface BattleSkill {
  id: number
  name: string
  mp_cost: number
  description?: string
  icon?: string
  target_type: 'ENEMY' | 'ALLY' | 'SELF' | 'ALL'
}

export interface BattleAction {
  type: string
  target?: string
  amount?: number
  crit?: boolean
  elements?: string[]
  sound?: string
}

export interface BattleSettings {
  enable_combo_input?: boolean
  enable_stagger_system?: boolean
  enable_break_shield?: boolean
  enable_action_commands?: boolean
  enable_limb_targeting?: boolean
  enable_morale?: boolean
  enable_rolling_hp?: boolean
  initiative_type?: string
}

export interface BattleSnapshot {
  battleId: number
  combatants: Combatant[]
  turnQueue: number[]
  currentTurn: number | null
  log: string[]
  actions: BattleAction[]
  myCharId: number | null
  phase: 'init' | 'active' | 'won' | 'lost' | 'fled'
  skills: BattleSkill[]
  settings?: BattleSettings
}

function createBattleStore() {
  let snapshot = $state<BattleSnapshot | null>(null)

  return {
    get snapshot() { return snapshot },
    get isActive() { return snapshot !== null && snapshot.phase === 'active' },
    get me() {
      const s = snapshot
      if (!s?.myCharId) return null
      return s.combatants.find(c => c.charId === s.myCharId) ?? null
    },
    get isMyTurn() {
      const s = snapshot
      if (!s) return false
      return s.currentTurn !== null && s.currentTurn === s.myCharId
    },

    set(next: BattleSnapshot) { snapshot = next },

    /** Merge a partial server push into the current snapshot. */
    patch(delta: Partial<BattleSnapshot>) {
      if (!snapshot) return
      snapshot = { ...snapshot, ...delta }
    },

    appendLog(line: string) {
      if (!snapshot) return
      snapshot = { ...snapshot, log: [...snapshot.log, line].slice(-50) }
    },

    clear() { snapshot = null }
  }
}

export const battle = createBattleStore()
