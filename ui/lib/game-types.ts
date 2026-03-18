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
  winnerTeamId?: string | null

  // Backward compat (1v1)
  me: BattleCombatant
  opponent: BattleCombatant

  // Multi-combatant teams (legacy 2-team)
  playerTeam: BattleCombatant[]
  enemyTeam: BattleCombatant[]
  turnOrder: TurnOrderEntry[]

  // Multi-team (FFA / N-team)
  allTeams?: Record<string, BattleCombatant[]>
  myTeamId?: string
  teamCount?: number

  // Tactical grid
  grid: BattleGrid
  terrainMap: Record<string, string>
  hasMoved: boolean
  moveRange: number

  commands: BattleCommand[]
  log: BattleLogEntry[]

  // Session 8: Feature flags + combat settings
  settings?: BattleSettings

  // Session 16: Win condition
  winCondition?: { type: string; description: string; icon: string; params: Record<string, unknown> }

  // Session 17: Weather
  weather?: { name: string; label: string; icon: string; visibility: number }
}

// Session 8: Feature toggles sent to the client
export interface BattleSettings {
  enableLimbTargeting: boolean
  enableActiveDefense: boolean
  enableNonlethal: boolean
  enableDiminishingReturns: boolean
  enableWoundDegradation: boolean
  enableCalledShotPenalty: boolean
  defensePromptTimeoutMs: number
  // Session 9
  enableFlavorText?: boolean
  enableComboProcs?: boolean
  // Session 10
  enableKiChanneling?: boolean
  enableBleedTiers?: boolean
  // Session 11
  enableSignatureTechs?: boolean
  // Session 12
  // Sessions 17-22
  enableWeatherEffects?: boolean
  enableStealth?: boolean
  enableLinkAttacks?: boolean
  enableTransformations?: boolean
  enableRevive?: boolean
  enableTraps?: boolean
  enableSpectatorMode?: boolean
  // Session 23
  // Session 24
  enableAlignmentSystem?: boolean
  enableBattleRules?: boolean
  enableElementalReactions?: boolean
  enableThreatSystem?: boolean
  enableStatusCombos?: boolean
  enableEquipSwap?: boolean
  enableAfterlife?: boolean
  aiDifficulty?: 'easy' | 'normal' | 'hard'
  initiativeType?: 'speed' | 'roll' | 'phased' | 'countdown'
  enableBossPhases?: boolean
  enableCustomWinConditions?: boolean
  enableSummons?: boolean
  enableSpellSlots?: boolean
  summonCostType?: 'mp' | 'spell_slot'
  enableFightingStyles?: boolean
  enableRpDescriptions?: boolean
  enableBattleNarration?: boolean
  enableRpCommands?: boolean
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
  objects?: BattleObject[]
}

export interface BattleObject {
  x: number
  y: number
  preset: string
  icon: string
  label: string
  hp: number
  maxHp: number
  destroyed: boolean
  blocking: boolean
  coverValue: number
}

export interface BattleToken {
  charId: number
  name: string
  teamId: string | number
  gridX: number
  gridY: number
  dead: boolean
  knockedOut?: boolean
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

  // Session 8: Limb targeting
  limbHp?: Record<string, { current: number; max: number }>
  woundLevels?: Record<string, WoundLevel>
  bodyTypeId?: number
  limbZones?: LimbZoneInfo[]

  // Session 8: Knockout / Non-lethal
  knockedOut?: boolean
  nonLethal?: boolean

  // Session 8: Wound flags
  prone?: boolean
  woundFlags?: WoundFlags | null

  // Session 8: Active defense
  defaultDefense?: 'dodge' | 'block' | 'counter' | 'none'

  // Session 10
  kiChanneled?: { turnsLeft: number } | null
  bleeds?: { tier: string; turnsLeft: number; icon: string; label: string }[]

  // Session 12: RP effects
  taunted?: { by: number; turnsLeft: number } | null
  intimidated?: { turnsLeft: number } | null
  rallied?: { turnsLeft: number; atkBonus: number } | null
  tauntBonus?: { turnsLeft: number } | null

  // Session 13: Fighting style
  fightingStyle?: {
    styleName: string; styleIcon: string;
    rank: number; rankLabel: string; styleType: string
  } | null

  // Session 15: Summon
  // Session 24
  alignment?: number
  alignmentTier?: { name: string; icon: string; color?: string } | null

  // Sessions 17-22
  isStealthed?: boolean
  transformed?: { name: string; icon: string; turnsLeft: number; visual?: unknown } | null

  // Session 16
  isBoss?: boolean
  currentPhase?: number
  bossPhaseCount?: number

  spellSlots?: Record<string, { max: number; current: number }> | null
  isSummon?: boolean
  summonTurnsLeft?: number | null
  summonedBy?: number | null
}

// Session 8: Wound severity levels
export type WoundLevel = 'normal' | 'light' | 'heavy' | 'disabled'

// Session 8: Limb zone display info (from server)
export interface LimbZoneInfo {
  key: string
  label: string
  icon: string
  sortOrder: number
}

// Session 8: Wound restriction flags
export interface WoundFlags {
  cantFlee?: boolean
  cantMove?: boolean
  cantUseItems?: boolean
  cantDualWield?: boolean
  moveRangeMod?: number
}

// Session 8: KO'd NPC for post-battle interaction
export interface KOInteraction {
  charId: number
  name: string
  icon: string
  actions: ('interrogate' | 'recruit' | 'loot' | 'release')[]
}

// Session 8: PvP KO choice
export interface PvpKOChoice {
  koPvpPlayers: { charId: number; name: string }[]
  battleId: number
  repBonusSpare: number
  repPenaltyFinish: number
}

// Session 11: Signature Techniques
export interface SignatureTech {
  techId: number
  name: string
  icon: string
  techType: 'ki_attack' | 'physical' | 'ki_heal'
  level: number
  xp: number
  totalUses: number
  element?: string | null
  battleText?: string
  damagePct: number
  costPct: number
  healPct: number
  dodgeMod: number
  abilities: { id: number; name: string; label: string; icon: string }[]
  abilityEffects: Record<string, unknown>
  isSigTech: true
}

export interface SigTechDiscovery {
  discovered: true
  suggestedName: string
  suggestedType: 'ki_attack' | 'physical' | 'ki_heal'
  suggestedElement?: string | null
  dominantKeywords: { keyword: string; count: number }[]
  originKeywords: string[]
}

export interface BattleCommand {
  id: number
  name: string
  icon: string
  type: 'attack' | 'skill' | 'item' | 'defend' | 'flee' | 'limit'
  skills?: Skill[]
  items?: Item[]
  signatureTechs?: SignatureTech[]
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
  choiceId?: string  // Original server-side choice ID (e.g. 'quest_5', 'companion_recruit')
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

// NPC Companion
export interface Companion {
  npcId: number
  name: string
  icon: string
  level: number
  currentHp: number
  maxHp: number
  currentMp: number
  maxMp: number
  tactics: 'AGGRESSIVE' | 'BALANCED' | 'DEFENSIVE' | 'SUPPORT'
  x: number
  y: number
  isActive: boolean
}

export interface GameView {
  type: 'character' | 'inventory' | 'quests' | 'map' | 'battle' | 'dialogue' | 'shop' | 'party' | 'oghams' | 'guild' | 'bestiary' | 'achievements' | 'leaderboards' | 'skills' | 'crafting' | 'companions'
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
  isOffline?: boolean
  presence?: string
}
