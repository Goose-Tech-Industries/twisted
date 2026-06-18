import type {
  Character,
  BattleState,
  BattleCommand,
  BattleLogEntry,
  Quest,
  Item,
  DialogueMessage,
  BloodOgham,
  GameMap,
  Companion,
  KOInteraction,
  PvpKOChoice,
  SignatureTech,
  SigTechDiscovery
} from './game-types'
import type { GameView } from './game-types'
import type { CharacterFull, ActiveQuest, QuestDefinition } from './game-api'

// =================================================================
// MOCK DATA — Used when API is unavailable or for demo
// =================================================================
export const MOCK_CHARACTER: Character = {
  id: 1,
  charId: 1,
  userId: 1,
  name: "Cormac the Wanderer",
  level: 12,
  classId: 1,
  className: "Blood Knight",
  raceId: 2,
  raceName: "Human",
  currentHp: 245,
  maxHp: 320,
  currentMp: 45,
  maxMp: 80,
  atk: 48,
  def: 32,
  mo: 18,
  md: 22,
  speed: 25,
  luck: 14,
  experience: 4250,
  experienceToNext: 5500,
  gold: 1847,
  limitbreak: 72,
  breaklevel: 2,
  mapId: 1,
  x: 12,
  y: 8
}

export const MOCK_INVENTORY: Item[] = [
  { id: 1, name: "Iron Longsword", description: "A sturdy blade forged in Dun Aengus.", icon: "swords", type: "weapon", rarity: "common", quantity: 1, bonusAtk: 12 },
  { id: 2, name: "Leather Cuirass", description: "Worn but reliable protection.", icon: "shield", type: "armor", rarity: "common", quantity: 1, bonusDef: 8 },
  { id: 3, name: "Health Potion", description: "Restores 50 HP.", icon: "flask-round", type: "consumable", rarity: "common", quantity: 5 },
  { id: 4, name: "Mana Draught", description: "Restores 30 MP.", icon: "droplet", type: "consumable", rarity: "uncommon", quantity: 3 },
  { id: 5, name: "Wolf Pelt", description: "Rough fur from a forest wolf.", icon: "shirt", type: "material", rarity: "common", quantity: 12 },
  { id: 6, name: "Bloodstone Shard", description: "Pulsing with dark energy.", icon: "gem", type: "material", rarity: "rare", quantity: 2 },
  { id: 7, name: "Ancient Key", description: "Opens something important.", icon: "key", type: "key", rarity: "epic", quantity: 1 },
]

export const MOCK_QUESTS: Quest[] = [
  {
    id: 1,
    title: "The Missing Caravan",
    description: "Merchants from the eastern roads have vanished. Find what remains.",
    category: "Main Story",
    status: "active",
    objectives: [
      { id: 1, description: "Search the eastern road", current: 1, required: 1, completed: true },
      { id: 2, description: "Find evidence of the attack", current: 2, required: 3, completed: false },
      { id: 3, description: "Track the raiders to their camp", current: 0, required: 1, completed: false }
    ],
    rewards: [{ type: "xp", amount: 500 }, { type: "gold", amount: 150 }]
  },
  {
    id: 2,
    title: "Cleanse the Barrows",
    description: "The dead do not rest easy in the old barrows. Put them down.",
    category: "Side Quest",
    status: "active",
    objectives: [{ id: 1, description: "Defeat Draugr", current: 8, required: 15, completed: false }],
    rewards: [{ type: "xp", amount: 300 }, { type: "item", amount: 1, itemId: 8, itemName: "Barrow Blade" }]
  },
  {
    id: 3,
    title: "Wolf Cull",
    description: "The forest wolves grow bold. Thin their numbers.",
    category: "Bounty",
    status: "completed",
    objectives: [{ id: 1, description: "Slay wolves", current: 10, required: 10, completed: true }],
    rewards: [{ type: "gold", amount: 75 }]
  }
]

export const MOCK_OGHAMS: BloodOgham[] = [
  { id: 1, name: "Ogham of Fury", icon: "flame", description: "Carved in rage. Adds fire damage to attacks.", familyId: 1, familyName: "Wrath Set", elementAttack: "fire", statBonus: { atk: 5 }, slotted: true },
  { id: 2, name: "Ogham of the Hunt", icon: "target", description: "Sharpens reflexes. Increases critical chance.", familyId: 2, familyName: "Predator Set", statBonus: { luck: 8, speed: 3 }, slotted: true },
  { id: 3, name: "Ogham of Spite", icon: "skull", description: "Inflicts poison on hit.", familyId: 1, familyName: "Wrath Set", onHitStatus: "poison", onHitChance: 20, slotted: false }
]

// Generate a simple mock map with some variety
export const MOCK_MAP: GameMap = (() => {
  const width = 20
  const height = 20
  const tiles: number[] = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Walls around edges
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        tiles.push(1) // wall
      }
      // Some water in bottom-right
      else if (x >= 14 && y >= 14 && Math.random() > 0.3) {
        tiles.push(2) // water
      }
      // Some dirt paths
      else if ((x === 10 || y === 10) && Math.random() > 0.4) {
        tiles.push(3) // dirt
      }
      // Random walls for obstacles
      else if (Math.random() < 0.08) {
        tiles.push(1) // wall
      }
      else {
        tiles.push(0) // grass
      }
    }
  }

  return {
    id: 1,
    name: "Dun Aengus Plains",
    width,
    height,
    tiles,
    events: [
      { id: 1, type: 'NPC', x: 5, y: 5, data: { npcId: 1 } },
      { id: 2, type: 'NPC', x: 8, y: 3, data: { npcId: 2 } },
      { id: 3, type: 'TELEPORT', x: 18, y: 10, data: { mapId: 2 } },
      { id: 4, type: 'SHOP', x: 3, y: 8, data: { shopId: 1 } },
      { id: 5, type: 'ENEMY', x: 15, y: 5, data: { enemyId: 1 } },
      { id: 6, type: 'LOOT', x: 12, y: 12, data: { chestId: 1 } },
    ]
  }
})()

// =================================================================
// HELPER INTERFACES (used by both reducer and context)
// =================================================================
export interface MapBattleIndicator {
  battleId: number
  x: number
  y: number
  playerCount: number
  enemyCount: number
  playerNames: string[]
  enemyNames: string[]
}

export interface BattleChatMessage {
  from: string
  fromCharId: number
  teamId: string
  text: string
  ts: number
}

export interface BattleEmoteEvent {
  from: string
  fromCharId: number
  emote: string
  icon: string
  gridX: number
  gridY: number
}

export interface NegotiateResult {
  success: boolean | null
  willingness?: number
  targetName: string
  dialogue: string
  targetCharId: number
  pending?: boolean
}

export interface NegotiateRequest {
  fromName: string
  fromCharId: number
  toTeamId: string
  battleId: number
}

// =================================================================
// STATE TYPES
// =================================================================
export interface GameState {
  // Auth
  isAuthenticated: boolean
  username: string | null
  role: string | null
  chatColor: string | null

  // Character
  character: Character | null
  charFull: CharacterFull | null
  inventory: Item[]
  quests: Quest[]
  activeQuests: Record<string, ActiveQuest>
  availableQuests: QuestDefinition[]
  oghams: BloodOgham[]

  // UI State
  battle: BattleState | null
  dialogue: DialogueMessage | null
  currentView: GameView['type']
  isLoading: boolean
  notifications: Notification[]
  currentMap: GameMap | null
  tilePalette: Array<{ id: number; name: string; color: string; category: string; is_passable: number }>
  groundItems: Array<{ id: number; x: number; y: number; item_id: number; quantity: number; name: string; icon: string }>
  deployedStructures: Array<{ id: number; x: number; y: number; name: string; icon: string; owner_id: number }>
  activeStatuses: Array<{ id: number; name: string; icon: string; type: string }>
  overworldEffects: Record<string, unknown>

  // Multiplayer
  nearbyPlayers: NearbyPlayer[]
  partyMembers: PartyMember[]
  mapBattles: MapBattleIndicator[]
  battleChat: BattleChatMessage[]
  battleEmote: BattleEmoteEvent | null
  negotiateResult: NegotiateResult | null
  negotiateRequest: NegotiateRequest | null

  // Companions
  companions: Companion[]

  // Connection
  socketConnected: boolean
  apiAvailable: boolean
  mailUnreadCount: number

  // Daily reward — set on login, cleared after modal is dismissed
  pendingDailyReward: { gold: number; streak: number; bonus: boolean; message: string } | null
  tutorialDone: boolean
  myCharacters: Array<{ id: number; name: string; level: number; class_name: string; race_name: string }>

  // Shop & Economy
  activeShopId: number | null
  inspectTarget: NearbyPlayer | null
  viewProfileCharId: number | null

  // Greet system (Planet Mado) — one-way name reveal
  enableGreetSystem: boolean
  greetedPlayerIds: number[]   // IDs of players who greeted ME (I can see their names)
  hasGreetedPlayerIds: number[] // IDs of players I've greeted (they can see my name, I can't see theirs yet)

  // Session 8: KO interactions
  battleKoNpcs?: KOInteraction[]
  pvpKoChoice?: PvpKOChoice | null

  // Session 11: Signature tech discovery
  sigTechDiscovery?: SigTechDiscovery | null

  // Tutorial — track whether player needs to see it (set after init_self fires)
  showTutorial: boolean
  trackedQuestId: number | null
}

export interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error' | 'item' | 'xp' | 'gold' | 'damage' | 'heal'
  message: string
  timestamp: number
}

export interface NearbyPlayer {
  charId: number
  id?: number // Alias for compatibility
  name: string
  level: number
  className?: string
  x: number
  y: number
  isOffline?: boolean
  presence?: string
  role?: string
  chatColor?: string | null
}

export interface PartyMember {
  charId: number
  name: string
  level: number
  className?: string
  currentHp: number
  maxHp: number
  isOnline: boolean
}

// =================================================================
// ACTIONS
// =================================================================
export type GameAction =
  | { type: 'SET_AUTH'; payload: { isAuthenticated: boolean; username: string | null; role: string | null; chatColor?: string | null } }
  | { type: 'SET_CHARACTER'; payload: Character }
  | { type: 'SET_CHAR_FULL'; payload: CharacterFull }
  | { type: 'UPDATE_HP'; payload: { current: number; max?: number } }
  | { type: 'UPDATE_MP'; payload: { current: number; max?: number } }
  | { type: 'UPDATE_LIMIT'; payload: number }
  | { type: 'UPDATE_GOLD'; payload: number }
  | { type: 'SET_INVENTORY'; payload: Item[] }
  | { type: 'ADD_ITEM'; payload: Item }
  | { type: 'REMOVE_ITEM'; payload: { itemId: number; quantity: number } }
  | { type: 'SET_QUESTS'; payload: Quest[] }
  | { type: 'SET_ACTIVE_QUESTS'; payload: Record<string, ActiveQuest> }
  | { type: 'SET_AVAILABLE_QUESTS'; payload: QuestDefinition[] }
  | { type: 'UPDATE_QUEST'; payload: Quest }
  | { type: 'SET_BATTLE'; payload: BattleState | null }
  | { type: 'SET_DIALOGUE'; payload: DialogueMessage | null }
  | { type: 'SET_VIEW'; payload: GameView['type'] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'ADD_NOTIFICATION'; payload: Notification }
  | { type: 'REMOVE_NOTIFICATION'; payload: string }
  | { type: 'SET_OGHAMS'; payload: BloodOgham[] }
  | { type: 'SET_NEARBY_PLAYERS'; payload: NearbyPlayer[] }
  | { type: 'SET_PARTY_MEMBERS'; payload: PartyMember[] }
  | { type: 'SET_MAP_BATTLES'; payload: MapBattleIndicator[] }
  | { type: 'ADD_BATTLE_CHAT'; payload: BattleChatMessage }
  | { type: 'CLEAR_BATTLE_CHAT' }
  | { type: 'SET_BATTLE_EMOTE'; payload: BattleEmoteEvent | null }
  | { type: 'SET_ACTIVE_SHOP'; payload: number | null }
  | { type: 'SET_VIEW_PROFILE'; payload: number | null }
  | { type: 'SET_INSPECT_TARGET'; payload: NearbyPlayer | null }
  | { type: 'SET_GREET_SYSTEM'; payload: boolean }
  | { type: 'SET_GREETED_IDS'; payload: number[] }
  | { type: 'ADD_GREETED_ID'; payload: number }
  | { type: 'SET_HAS_GREETED_IDS'; payload: number[] }
  | { type: 'ADD_HAS_GREETED_ID'; payload: number }
  | { type: 'SET_NEGOTIATE_RESULT'; payload: NegotiateResult | null }
  | { type: 'SET_NEGOTIATE_REQUEST'; payload: NegotiateRequest | null }
  | { type: 'SET_SOCKET_CONNECTED'; payload: boolean }
  | { type: 'SET_MAIL_UNREAD'; payload: number }
  | { type: 'SET_API_AVAILABLE'; payload: boolean }
  | { type: 'SET_MAP'; payload: GameMap | null }
  | { type: 'SET_TILE_PALETTE'; payload: GameState['tilePalette'] }
  | { type: 'SET_GROUND_ITEMS'; payload: GameState['groundItems'] }
  | { type: 'ADD_GROUND_ITEM'; payload: GameState['groundItems'][0] }
  | { type: 'REMOVE_GROUND_ITEM'; payload: number }
  | { type: 'SET_DEPLOYED_STRUCTURES'; payload: GameState['deployedStructures'] }
  | { type: 'ADD_DEPLOYED_STRUCTURE'; payload: GameState['deployedStructures'][0] }
  | { type: 'SET_ACTIVE_STATUSES'; payload: GameState['activeStatuses'] }
  | { type: 'SET_OVERWORLD_EFFECTS'; payload: GameState['overworldEffects'] }
  | { type: 'SET_DAILY_REWARD'; payload: { gold: number; streak: number; bonus: boolean; message: string } | null }
  | { type: 'CLEAR_DAILY_REWARD' }
  | { type: 'SET_MY_CHARACTERS'; payload: Array<{ id: number; name: string; level: number; class_name: string; race_name: string }> }
  | { type: 'SET_SHOW_TUTORIAL'; payload: boolean }
  | { type: 'SET_TUTORIAL_DONE'; payload: boolean }
  | { type: 'SET_COMPANIONS'; payload: Companion[] }
  | { type: 'ADD_COMPANION'; payload: Companion }
  | { type: 'REMOVE_COMPANION'; payload: number }
  | { type: 'UPDATE_COMPANION'; payload: { npcId: number; changes: Partial<Companion> } }
  // Session 8
  | { type: 'SET_BATTLE_KO_NPCS'; payload: KOInteraction[] }
  | { type: 'SET_PVP_KO_CHOICE'; payload: PvpKOChoice | null }
  // Player visibility
  | { type: 'PLAYER_JOINED'; payload: NearbyPlayer }
  | { type: 'PLAYER_MOVED'; payload: { id: number; x: number; y: number } }
  | { type: 'PLAYER_LEFT'; payload: number }
  | { type: 'PLAYER_STATUS_CHANGE'; payload: NearbyPlayer }
  // Session 11
  | { type: 'SET_SIG_TECH_DISCOVERY'; payload: SigTechDiscovery | null }
  | { type: 'SET_TRACKED_QUEST'; payload: number | null }

// =================================================================
// INITIAL STATE
// =================================================================
export const initialState: GameState = {
  isAuthenticated: false, // Login required — must authenticate against the real backend
  username: null,
  role: null,
  chatColor: null,
  character: null,
  charFull: null,
  inventory: [],
  quests: [],
  activeQuests: {},
  availableQuests: [],
  oghams: [],
  battle: null,
  dialogue: null,
  currentView: (typeof window !== 'undefined' && localStorage.getItem('te_current_view') as GameView['type']) || 'character',
  isLoading: true,
  notifications: [],
  currentMap: null,
  tilePalette: [],
  groundItems: [],
  deployedStructures: [],
  activeStatuses: [],
  overworldEffects: {},
  nearbyPlayers: [],
  partyMembers: [],
  mapBattles: [],
  battleChat: [],
  battleEmote: null,
  activeShopId: null,
  inspectTarget: null,
  viewProfileCharId: null,
  enableGreetSystem: false,
  greetedPlayerIds: [],
  hasGreetedPlayerIds: [],
  negotiateResult: null,
  negotiateRequest: null,
  companions: [],
  socketConnected: false,
  mailUnreadCount: 0,
  pendingDailyReward: null,
  tutorialDone: false,
  myCharacters: [],
  showTutorial: false,
  apiAvailable: false,
  trackedQuestId: null,
}

// =================================================================
// REDUCER
// =================================================================
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_AUTH':
      return { ...state, ...action.payload }

    case 'SET_DAILY_REWARD':
      return { ...state, pendingDailyReward: action.payload }

    case 'CLEAR_DAILY_REWARD':
      return { ...state, pendingDailyReward: null }

    case 'SET_MY_CHARACTERS':
      return { ...state, myCharacters: action.payload }

    case 'SET_SHOW_TUTORIAL':
      return { ...state, showTutorial: action.payload }

    case 'SET_TUTORIAL_DONE':
      return { ...state, tutorialDone: true }

    case 'SET_CHARACTER':
      return { ...state, character: action.payload }

    case 'SET_CHAR_FULL':
      return { ...state, charFull: action.payload }

    case 'UPDATE_HP':
      if (!state.character) return state
      return {
        ...state,
        character: {
          ...state.character,
          currentHp: Math.max(0, Math.min(action.payload.current, action.payload.max ?? state.character.maxHp)),
          maxHp: action.payload.max ?? state.character.maxHp
        }
      }

    case 'UPDATE_MP':
      if (!state.character) return state
      return {
        ...state,
        character: {
          ...state.character,
          currentMp: Math.max(0, Math.min(action.payload.current, action.payload.max ?? state.character.maxMp)),
          maxMp: action.payload.max ?? state.character.maxMp
        }
      }

    case 'UPDATE_LIMIT':
      if (!state.character) return state
      return { ...state, character: { ...state.character, limitbreak: Math.max(0, Math.min(action.payload, 100)) } }

    case 'UPDATE_GOLD':
      if (!state.character) return state
      return { ...state, character: { ...state.character, gold: action.payload } }

    case 'SET_INVENTORY':
      return { ...state, inventory: action.payload }

    case 'ADD_ITEM': {
      const existing = state.inventory.find(i => i.id === action.payload.id)
      if (existing) {
        return { ...state, inventory: state.inventory.map(i => i.id === action.payload.id ? { ...i, quantity: i.quantity + action.payload.quantity } : i) }
      }
      return { ...state, inventory: [...state.inventory, action.payload] }
    }

    case 'REMOVE_ITEM':
      return { ...state, inventory: state.inventory.map(i => i.id === action.payload.itemId ? { ...i, quantity: i.quantity - action.payload.quantity } : i).filter(i => i.quantity > 0) }

    case 'SET_QUESTS':
      return { ...state, quests: action.payload }

    case 'SET_ACTIVE_QUESTS':
      return { ...state, activeQuests: action.payload }

    case 'SET_AVAILABLE_QUESTS':
      return { ...state, availableQuests: action.payload }

    case 'UPDATE_QUEST':
      return { ...state, quests: state.quests.map(q => q.id === action.payload.id ? action.payload : q) }

    case 'SET_BATTLE':
      return { ...state, battle: action.payload }

    case 'SET_DIALOGUE':
      return { ...state, dialogue: action.payload }

    case 'SET_VIEW':
      // Lock player into battle view while a battle is active
      if (state.battle && state.currentView === 'battle' && action.payload !== 'battle') {
        return state
      }
      if (typeof window !== 'undefined') localStorage.setItem('te_current_view', action.payload)
      return { ...state, currentView: action.payload }

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }

    case 'ADD_NOTIFICATION':
      return { ...state, notifications: [...state.notifications, action.payload].slice(-5) }

    case 'REMOVE_NOTIFICATION':
      return { ...state, notifications: state.notifications.filter(n => n.id !== action.payload) }

    case 'SET_OGHAMS':
      return { ...state, oghams: action.payload }

    case 'SET_NEARBY_PLAYERS':
      return { ...state, nearbyPlayers: action.payload }
    case 'SET_MAP_BATTLES':
      return { ...state, mapBattles: action.payload }
    case 'ADD_BATTLE_CHAT':
      return { ...state, battleChat: [...state.battleChat, action.payload].slice(-50) }
    case 'CLEAR_BATTLE_CHAT':
      return { ...state, battleChat: [], battleEmote: null }
    case 'SET_BATTLE_EMOTE':
      return { ...state, battleEmote: action.payload }
    case 'SET_NEGOTIATE_RESULT':
      return { ...state, negotiateResult: action.payload }
    case 'SET_NEGOTIATE_REQUEST':
      return { ...state, negotiateRequest: action.payload }

    case 'SET_PARTY_MEMBERS':
      return { ...state, partyMembers: action.payload }

    case 'SET_SOCKET_CONNECTED':
      return { ...state, socketConnected: action.payload }

    case 'SET_MAIL_UNREAD':
      return { ...state, mailUnreadCount: action.payload }

    case 'SET_API_AVAILABLE':
      return { ...state, apiAvailable: action.payload }

    case 'SET_MAP':
      return { ...state, currentMap: action.payload, groundItems: [], deployedStructures: [] }
    case 'SET_TILE_PALETTE':
      return { ...state, tilePalette: action.payload }
    case 'SET_GROUND_ITEMS':
      return { ...state, groundItems: action.payload }
    case 'ADD_GROUND_ITEM':
      return { ...state, groundItems: [...state.groundItems, action.payload] }
    case 'REMOVE_GROUND_ITEM':
      return { ...state, groundItems: state.groundItems.filter(i => i.id !== action.payload) }
    case 'SET_DEPLOYED_STRUCTURES':
      return { ...state, deployedStructures: action.payload }
    case 'ADD_DEPLOYED_STRUCTURE':
      return { ...state, deployedStructures: [...state.deployedStructures, action.payload] }
    case 'SET_ACTIVE_STATUSES':
      return { ...state, activeStatuses: action.payload }
    case 'SET_OVERWORLD_EFFECTS':
      return { ...state, overworldEffects: action.payload }

    case 'SET_ACTIVE_SHOP':
      return { ...state, activeShopId: action.payload }
    case 'SET_TRACKED_QUEST':
      return { ...state, trackedQuestId: action.payload }
    case 'SET_VIEW_PROFILE':
      return { ...state, viewProfileCharId: action.payload }
    case 'SET_INSPECT_TARGET':
      return { ...state, inspectTarget: action.payload }
    case 'SET_GREET_SYSTEM':
      return { ...state, enableGreetSystem: action.payload }
    case 'SET_GREETED_IDS':
      return { ...state, greetedPlayerIds: action.payload }
    case 'ADD_GREETED_ID':
      return { ...state, greetedPlayerIds: [...state.greetedPlayerIds, action.payload] }
    case 'SET_HAS_GREETED_IDS':
      return { ...state, hasGreetedPlayerIds: action.payload }
    case 'ADD_HAS_GREETED_ID':
      return { ...state, hasGreetedPlayerIds: [...state.hasGreetedPlayerIds, action.payload] }

    case 'SET_COMPANIONS':
      return { ...state, companions: action.payload }
    case 'ADD_COMPANION':
      return { ...state, companions: [...state.companions, action.payload] }
    case 'REMOVE_COMPANION':
      return { ...state, companions: state.companions.filter(c => c.npcId !== action.payload) }
    case 'UPDATE_COMPANION':
      return { ...state, companions: state.companions.map(c =>
        c.npcId === action.payload.npcId ? { ...c, ...action.payload.changes } : c
      ) }

    // Player visibility
    case 'PLAYER_JOINED':
      return { ...state, nearbyPlayers: [...state.nearbyPlayers.filter(p => p.charId !== action.payload.charId), action.payload] }
    case 'PLAYER_MOVED':
      return { ...state, nearbyPlayers: state.nearbyPlayers.map(p => p.charId === action.payload.id ? { ...p, x: action.payload.x, y: action.payload.y } : p) }
    case 'PLAYER_LEFT':
      return { ...state, nearbyPlayers: state.nearbyPlayers.filter(p => p.charId !== action.payload) }
    case 'PLAYER_STATUS_CHANGE':
      return { ...state, nearbyPlayers: state.nearbyPlayers.map(p =>
        p.charId === action.payload.charId ? { ...p, ...action.payload } : p
      ) }

    case 'SET_BATTLE_KO_NPCS': return { ...state, battleKoNpcs: action.payload }
    case 'SET_PVP_KO_CHOICE': return { ...state, pvpKoChoice: action.payload }

    case 'SET_SIG_TECH_DISCOVERY': return { ...state, sigTechDiscovery: action.payload }

    default:
      return state
  }
}
