// Game State Types for Twisted Engine RPG

export interface Character {
  id: number
  charId: number
  userId: number
  name: string
  level: number
  classId: number
  className: string
  raceId: number
  raceName: string
  
  // Stats
  currentHp: number
  maxHp: number
  currentMp: number
  maxMp: number
  atk: number
  def: number
  mo: number  // Magic Offense
  md: number  // Magic Defense
  speed: number
  luck: number
  
  // Progression
  experience: number
  experienceToNext: number
  gold: number
  
  // Limit Break
  limitbreak: number
  breaklevel: number
  
  // Location
  mapId: number
  x: number
  y: number
}

export interface EquipmentSlot {
  slotKey: string
  name: string
  item: Item | null
}

export interface Item {
  id: number
  name: string
  description: string
  icon: string
  type: 'weapon' | 'armor' | 'accessory' | 'consumable' | 'material' | 'key'
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  quantity: number
  
  // Bonuses
  bonusHp?: number
  bonusMp?: number
  bonusAtk?: number
  bonusDef?: number
  bonusMo?: number
  bonusMd?: number
  bonusSpeed?: number
  bonusLuck?: number
  
  // Special
  elements?: Record<string, { role: string; pct: number }>
  setStatus?: Record<string, number>
  
  // For equipment comparison
  stats?: Record<string, number>
  element?: string
  slot?: string
  reqLevel?: number
  price?: number
}

export interface Skill {
  id: number
  name: string
  description: string
  icon: string
  mpCost: number
  targetType: 'enemy' | 'self' | 'ally' | 'all_enemies' | 'all_allies'
  element?: string
  cooldown?: number
}

export interface StatusEffect {
  id: number
  name: string
  icon: string
  turnsRemaining: number
  description: string
}

export interface Quest {
  id: number
  title: string
  description: string
  category: string
  status: 'active' | 'completed' | 'failed'
  objectives: QuestObjective[]
  rewards: QuestReward[]
}

export interface QuestObjective {
  id: number
  description: string
  current: number
  required: number
  completed: boolean
}

export interface QuestReward {
  type: 'xp' | 'gold' | 'item'
  amount: number
  itemId?: number
  itemName?: string
}

export interface NPC {
  id: number
  name: string
  icon: string
  type: 'friendly' | 'neutral' | 'hostile' | 'shop' | 'quest'
  dialogue?: string[]
}

export interface MapTile {
  x: number
  y: number
  type: 'ground' | 'wall' | 'water' | 'door' | 'chest' | 'npc' | 'spawn'
  passable: boolean
  event?: MapEvent
}

export interface MapEvent {
  trigger: 'INTERACT' | 'STEP_ON' | 'AUTO'
  eventType: string
  data?: unknown
}

export interface BattleState {
  battleId: number
  turn: number
  isMyTurn: boolean
  turnCharId: number
  status: 'ACTIVE' | 'VICTORY' | 'DEFEAT' | 'FLED' | 'FINISHED'
  winner?: number | null

  // Backward compat (1v1)
  me: BattleCombatant
  opponent: BattleCombatant

  // Multi-combatant teams
  playerTeam: BattleCombatant[]
  enemyTeam: BattleCombatant[]
  turnOrder: TurnOrderEntry[]

  // Tactical grid
  grid: BattleGrid
  terrainMap: Record<string, string>
  hasMoved: boolean
  moveRange: number

  commands: BattleCommand[]
  log: BattleLogEntry[]
}

export interface TurnOrderEntry {
  charId: number
  name: string
  teamId: number
  isAI: boolean
  isCurrent: boolean
}

export interface BattleGrid {
  width: number
  height: number
  tokens: BattleToken[]
}

export interface BattleToken {
  charId: number
  name: string
  teamId: number
  gridX: number
  gridY: number
  dead: boolean
  hp: number
  maxHp: number
}

export interface BattleCombatant {
  charId?: number
  name: string
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  statuses: StatusEffect[]
  limitbreak?: number
  breaklevel?: number
  stance?: string | null
  isAI?: boolean
  teamId?: number
  dead?: boolean
  charging?: { skillId: number; turnsLeft: number; skillName: string } | null
}

export interface BattleCommand {
  id: number
  name: string
  icon: string
  type: 'attack' | 'skill' | 'item' | 'defend' | 'flee' | 'limit'
  skills?: Skill[]
  items?: Item[]
}

export interface BattleLogEntry {
  turn: number
  actor: string
  text: string
  damage?: number
  heal?: number
  critical?: boolean
}

export interface DialogueMessage {
  speaker: string
  text: string
  portrait?: string
  choices?: DialogueChoice[]
}

export interface DialogueChoice {
  id: number
  label: string
}

export interface BloodOgham {
  id: number
  name: string
  icon: string
  description: string
  familyId?: number
  familyName?: string
  elementAttack?: string
  onHitStatus?: string
  onHitChance?: number
  statBonus?: Record<string, number>
  slotted: boolean
}

export interface GameView {
  type: 'character' | 'inventory' | 'quests' | 'map' | 'battle' | 'dialogue' | 'shop' | 'party' | 'oghams' | 'guild' | 'bestiary' | 'achievements' | 'leaderboards' | 'skills' | 'crafting'
}

// Map data for minimap rendering
export interface GameMap {
  id: number
  name: string
  description?: string
  width: number
  height: number
  tiles: number[] // Array of tile type indices
  events: GameMapEvent[]
  objects?: GameMapObject[]
  ambientDark?: number
  minLevel?: number
}

export interface GameMapObject {
  x: number
  y: number
  preset?: string
  icon?: string
  label?: string
  type?: string
  blocking?: boolean
  light?: { radius: number; color: string; flicker: boolean } | null
  sprite?: string
}

export interface GameMapEvent {
  id: number
  type: 'TELEPORT' | 'NPC' | 'ENEMY' | 'LOOT' | 'SHOP'
  x: number
  y: number
  data?: unknown
}

// Chat message types
export interface ChatMessage {
  id: string
  channel: 'global' | 'local' | 'party' | 'guild' | 'dm' | 'announce' | 'admin' | 'system'
  from: string
  fromCharId?: number
  text: string
  ts: number
  targetName?: string
}

// Arena types
export interface Arena {
  id: number
  mapId: number
  name: string
  description?: string
  type: 'OPEN_PVP' | 'QUEUE' | 'TOURNAMENT' | 'KING_OF_HILL'
  minLevel: number
  maxLevel: number
  entryFee: number
  rewardMultiplier: number
  maxPlayers: number
  enabled: boolean
}

// Guild types (extended)
export interface Guild {
  id: number
  name: string
  tag: string
  emblem: string
  description?: string
  memberCount: number
  maxMembers: number
  treasury: number
  level: number
}

export interface GuildMember {
  char_id: number
  name: string
  level: number
  class_name?: string
  rank: 'LEADER' | 'OFFICER' | 'MEMBER'
  online: boolean
  last_seen?: number
}

export interface GuildInvite {
  id: number
  guild_id: number
  guild_name: string
  tag: string
  emblem?: string
  inviter_name: string
}

// Trade types
export interface TradeState {
  active: boolean
  partnerId: number
  partnerName: string
  myOffer: TradeOffer
  theirOffer: TradeOffer
  myConfirmed: boolean
  theirConfirmed: boolean
}

export interface TradeOffer {
  items: { itemId: number; quantity: number }[]
  gold: number
}

// Nearby player for minimap
export interface NearbyPlayer {
  id?: number
  charId?: number // Primary identifier
  name: string
  x: number
  y: number
  level: number
  inParty?: boolean
  className?: string
}
