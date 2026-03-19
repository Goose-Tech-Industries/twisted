"use client"

import React, { createContext, useContext, useReducer, useCallback, useEffect, ReactNode, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
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
import { api, type CharacterFull, type ActiveQuest, type QuestDefinition } from './game-api'

// =================================================================
// MOCK DATA — Used when API is unavailable or for demo
// =================================================================
const MOCK_CHARACTER: Character = {
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

const MOCK_INVENTORY: Item[] = [
  { id: 1, name: "Iron Longsword", description: "A sturdy blade forged in Dun Aengus.", icon: "swords", type: "weapon", rarity: "common", quantity: 1, bonusAtk: 12 },
  { id: 2, name: "Leather Cuirass", description: "Worn but reliable protection.", icon: "shield", type: "armor", rarity: "common", quantity: 1, bonusDef: 8 },
  { id: 3, name: "Health Potion", description: "Restores 50 HP.", icon: "flask-round", type: "consumable", rarity: "common", quantity: 5 },
  { id: 4, name: "Mana Draught", description: "Restores 30 MP.", icon: "droplet", type: "consumable", rarity: "uncommon", quantity: 3 },
  { id: 5, name: "Wolf Pelt", description: "Rough fur from a forest wolf.", icon: "shirt", type: "material", rarity: "common", quantity: 12 },
  { id: 6, name: "Bloodstone Shard", description: "Pulsing with dark energy.", icon: "gem", type: "material", rarity: "rare", quantity: 2 },
  { id: 7, name: "Ancient Key", description: "Opens something important.", icon: "key", type: "key", rarity: "epic", quantity: 1 },
]

const MOCK_QUESTS: Quest[] = [
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

const MOCK_OGHAMS: BloodOgham[] = [
  { id: 1, name: "Ogham of Fury", icon: "flame", description: "Carved in rage. Adds fire damage to attacks.", familyId: 1, familyName: "Wrath Set", elementAttack: "fire", statBonus: { atk: 5 }, slotted: true },
  { id: 2, name: "Ogham of the Hunt", icon: "target", description: "Sharpens reflexes. Increases critical chance.", familyId: 2, familyName: "Predator Set", statBonus: { luck: 8, speed: 3 }, slotted: true },
  { id: 3, name: "Ogham of Spite", icon: "skull", description: "Inflicts poison on hit.", familyId: 1, familyName: "Wrath Set", onHitStatus: "poison", onHitChance: 20, slotted: false }
  ]

// Generate a simple mock map with some variety
const MOCK_MAP: GameMap = (() => {
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

interface MapBattleIndicator {
  battleId: number
  x: number
  y: number
  playerCount: number
  enemyCount: number
  playerNames: string[]
  enemyNames: string[]
}

interface BattleChatMessage {
  from: string
  fromCharId: number
  teamId: string
  text: string
  ts: number
}

interface BattleEmoteEvent {
  from: string
  fromCharId: number
  emote: string
  icon: string
  gridX: number
  gridY: number
}

interface NegotiateResult {
  success: boolean | null
  willingness?: number
  targetName: string
  dialogue: string
  targetCharId: number
  pending?: boolean
}

interface NegotiateRequest {
  fromName: string
  fromCharId: number
  toTeamId: string
  battleId: number
}

// =================================================================
// STATE TYPES
// =================================================================
interface GameState {
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

  // Daily reward — set on login, cleared after modal is dismissed
  pendingDailyReward: { gold: number; streak: number; bonus: boolean; message: string } | null
  tutorialDone: boolean
  myCharacters: Array<{ id: number; name: string; level: number; class_name: string; race_name: string }>

  // Session 8: KO interactions
  battleKoNpcs?: KOInteraction[]
  pvpKoChoice?: PvpKOChoice | null

  // Session 11: Signature tech discovery
  sigTechDiscovery?: SigTechDiscovery | null

  // Tutorial — track whether player needs to see it (set after init_self fires)
  showTutorial: boolean
}

interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error' | 'item' | 'xp' | 'gold' | 'damage' | 'heal'
  message: string
  timestamp: number
}

interface NearbyPlayer {
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

interface PartyMember {
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
type GameAction =
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
  | { type: 'SET_NEGOTIATE_RESULT'; payload: NegotiateResult | null }
  | { type: 'SET_NEGOTIATE_REQUEST'; payload: NegotiateRequest | null }
  | { type: 'SET_SOCKET_CONNECTED'; payload: boolean }
  | { type: 'SET_API_AVAILABLE'; payload: boolean }
  | { type: 'SET_MAP'; payload: GameMap | null }
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

// =================================================================
// INITIAL STATE
// =================================================================
const initialState: GameState = {
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
  currentView: 'character',
  isLoading: true,
  notifications: [],
  currentMap: null,
  nearbyPlayers: [],
  partyMembers: [],
  mapBattles: [],
  battleChat: [],
  battleEmote: null,
  negotiateResult: null,
  negotiateRequest: null,
  companions: [],
  socketConnected: false,
  pendingDailyReward: null,
  tutorialDone: false,
  myCharacters: [],
  showTutorial: false,
  apiAvailable: false
}

// =================================================================
// REDUCER
// =================================================================
function gameReducer(state: GameState, action: GameAction): GameState {
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

    case 'CLEAR_DAILY_REWARD':
      return { ...state, pendingDailyReward: null }

    case 'SET_MY_CHARACTERS':
      return { ...state, myCharacters: action.payload }

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
    
case 'SET_API_AVAILABLE':
  return { ...state, apiAvailable: action.payload }
  
  case 'SET_MAP':
  return { ...state, currentMap: action.payload }

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

// =================================================================
// CONTEXT
// =================================================================
interface GameContextValue {
  state: GameState
  dispatch: React.Dispatch<GameAction>
  socket: Socket | null
  actions: {
    // Auth
    login: (username: string, password: string) => Promise<boolean>
    logout: () => Promise<void>
    checkAuth: () => Promise<void>
    
    // Character
    loadCharacter: (charId: number) => Promise<void>
  dailyReward: { gold: number; streak: number; bonus: boolean; message: string } | null
  tutorialDone: boolean
  dismissDailyReward: () => void
  markTutorialDone: () => void
    loadMyCharacters: () => Promise<Array<{ id: number; name: string; level: number }>>
    
    // Inventory
    useItem: (itemId: number) => Promise<void>
    equipItem: (itemId: number, slotKey: string) => Promise<void>
    unequipItem: (slotKey: string) => Promise<void>
    
    // Quests
    loadQuests: () => Promise<void>
    acceptQuest: (questId: string) => Promise<void>
    completeQuest: (questId: string) => Promise<void>
    abandonQuest: (questId: string) => Promise<void>
    
    // Map
    move: (direction: 'up' | 'down' | 'left' | 'right') => void
    interact: () => void
    teleport: (mapId: number, x: number, y: number) => void
    
    // Battle
    attack: () => void
    useSkill: (skillId: number) => void
    useBattleItem: (itemId: number) => void
    defend: () => void
    flee: () => void
    limitBreak: () => void
    
    // Social
    sendPartyInvite: (targetCharId: number) => void
    leaveParty: () => void
    sendTradeRequest: (targetCharId: number) => void
    
    // Notifications
    notify: (type: Notification['type'], message: string) => void
  }
}

const GameContext = createContext<GameContextValue | null>(null)

// =================================================================
// PROVIDER
// =================================================================
export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState)
  const socketRef = useRef<Socket | null>(null)
  
  // Initialize socket connection
  useEffect(() => {
    // TEACHING: In production, UI and API share one domain via nginx.
    // Socket.IO's io() with no arguments connects to the same origin the
    // page was served from — nginx's /socket.io/ block then proxies it to
    // the Express backend. This is the correct same-origin pattern.
    // In dev, NEXT_PUBLIC_SOCKET_URL=http://localhost:3001 is set so the
    // UI (port 3000) can reach the backend (port 3001) cross-origin.
    // DO NOT guard with "if (!socketUrl) return" — that silently kills
    // all realtime when the env var is intentionally blank in production.
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || undefined

    const socket = io(socketUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    })
    
    socket.on('connect', () => {
      dispatch({ type: 'SET_SOCKET_CONNECTED', payload: true })
      // Re-register with server after reconnect (e.g. server restart)
      const lastCharId = localStorage.getItem('te_last_char_id')
      if (lastCharId) {
        socket.emit('select_character', { charId: parseInt(lastCharId, 10) })
      }
    })
    
    socket.on('disconnect', () => {
      dispatch({ type: 'SET_SOCKET_CONNECTED', payload: false })
    })
    
    // Player list updates
socket.on('player_list', (data: NearbyPlayer[] | { players: NearbyPlayer[] }) => {
  const players = Array.isArray(data) ? data : (data.players || [])
  dispatch({ type: 'SET_NEARBY_PLAYERS', payload: players })
  })

  socket.on('player_joined', (player: NearbyPlayer) => {
    if (!player || player.charId === state.character?.charId) return
    dispatch({ type: 'PLAYER_JOINED', payload: player })
  })

  socket.on('player_moved', (data: { id: number; x: number; y: number }) => {
    dispatch({ type: 'PLAYER_MOVED', payload: data })
  })

  socket.on('player_left', (charId: number) => {
    dispatch({ type: 'PLAYER_LEFT', payload: charId })
  })

  socket.on('player_status_change', (data: NearbyPlayer & { isOffline?: boolean }) => {
    dispatch({ type: 'PLAYER_STATUS_CHANGE', payload: data })
  })
  
  // Map data updates
  socket.on('map_data', (data: GameMap) => {
  dispatch({ type: 'SET_MAP', payload: data })
  })

  // Server corrects position if an optimistic move was invalid
  socket.on('force_move', (data: { x: number; y: number }) => {
    if (state.character) {
      dispatch({ type: 'SET_CHARACTER', payload: { ...state.character, x: data.x, y: data.y } })
    }
  })

  // Event queue — server sends dialogue, NPC talk prompts, choice menus, etc.
  socket.on('event_queue', (events: Array<Record<string, unknown>>) => {
    for (const evt of events) {
      if (evt.cmd === 'dialogue') {
        dispatch({ type: 'SET_DIALOGUE', payload: {
          speaker: (evt.speaker as string) || 'NPC',
          text: (evt.text as string) || '',
          choices: []
        }})
      } else if (evt.cmd === 'npc_choice_menu') {
        const choices = (evt.choices as Array<{ id: string; text: string }>) || []
        dispatch({ type: 'SET_DIALOGUE', payload: {
          speaker: (evt.npcName as string) || 'NPC',
          text: '',
          choices: choices.map((c, i) => ({ id: i + 1, label: c.text || c.id, choiceId: c.id }))
        }})
      } else if (evt.cmd === 'npc_talk_prompt') {
        // Server wants the client to open a talk prompt with this NPC
        dispatch({ type: 'SET_DIALOGUE', payload: {
          speaker: (evt.npcName as string) || 'NPC',
          text: `*${evt.npcName || 'The NPC'} awaits your words...*`,
          choices: []
        }})
      } else if (evt.cmd === 'notification') {
        notify((evt.type as string) === 'error' ? 'error' : 'info', (evt.text as string) || '')
      }
    }
  })
  
  // Active battles on the map (for mid-battle join indicators)
  socket.on('battles_on_map', (battles: Array<{ battleId: number; x: number; y: number; playerCount: number; enemyCount: number; playerNames: string[]; enemyNames: string[] }>) => {
    dispatch({ type: 'SET_MAP_BATTLES', payload: battles })
  })

  socket.on('battle_ended_on_map', (data: { battleId: number }) => {
    // Remove ended battle from map indicators
    if (state.mapBattles) {
      dispatch({ type: 'SET_MAP_BATTLES', payload: state.mapBattles.filter(b => b.battleId !== data.battleId) })
    }
  })

  // Battle chat messages
  socket.on('battle_chat_msg', (msg: BattleChatMessage) => {
    dispatch({ type: 'ADD_BATTLE_CHAT', payload: msg })
  })

  // Battle emotes — show for 2.5s then clear
  socket.on('battle_emote_show', (emote: BattleEmoteEvent) => {
    dispatch({ type: 'SET_BATTLE_EMOTE', payload: emote })
    setTimeout(() => dispatch({ type: 'SET_BATTLE_EMOTE', payload: null }), 2500)
  })

  // Negotiation results and requests
  socket.on('negotiate_result', (data: NegotiateResult) => {
    dispatch({ type: 'SET_NEGOTIATE_RESULT', payload: data })
  })
  socket.on('negotiate_request', (data: NegotiateRequest) => {
    dispatch({ type: 'SET_NEGOTIATE_REQUEST', payload: data })
  })

  // Request current battles when map loads
  socket.emit('get_battles_on_map')

  // PvE battle triggers — server tells us to start a fight, we confirm
  socket.on('trigger_pve_battle', (data: { npcId: number }) => {
    // Event-runner triggered battle (ENEMY map event or scripted)
    socket.emit('start_pve_battle', { enemyCharId: data.npcId })
  })

  socket.on('random_encounter', (data: { zoneName?: string; npcId: number; npcName?: string }) => {
    // Spawn zone random encounter
    notify('warning', `${data.npcName || 'An enemy'} attacks!`)
    socket.emit('start_pve_battle', { enemyCharId: data.npcId })
  })

  // Battle events
    socket.on('battle_start', (data: BattleState) => {
      dispatch({ type: 'SET_BATTLE', payload: data })
      dispatch({ type: 'SET_VIEW', payload: 'battle' })
    })

    socket.on('battle_update', (data: { state: BattleState; action?: unknown; commands?: BattleCommand[] }) => {
      // Merge commands into state so the UI always has the latest
      const merged = { ...data.state }
      if (data.commands) merged.commands = data.commands
      dispatch({ type: 'SET_BATTLE', payload: merged })
    })

    socket.on('battle_grid_update', (data: { grid: BattleState['grid']; hasMoved: boolean; log?: BattleLogEntry[] }) => {
      // Grid movement update — merge into current battle state
      if (state.battle) {
        dispatch({ type: 'SET_BATTLE', payload: { ...state.battle, grid: data.grid, hasMoved: data.hasMoved } })
      }
    })
    
    socket.on('battle_end', () => {
      dispatch({ type: 'SET_BATTLE', payload: null })
    })

    socket.on('battle_result', (data: Record<string, unknown>) => {
      if (data.xp) notify('xp', `+${data.xp} XP`)
      if (data.gold) notify('item', `+${data.gold} gold`)
      dispatch({ type: 'SET_BATTLE', payload: null })
      dispatch({ type: 'CLEAR_BATTLE_CHAT' })
      dispatch({ type: 'SET_NEGOTIATE_RESULT', payload: null })
      dispatch({ type: 'SET_NEGOTIATE_REQUEST', payload: null })
    })

    socket.on('battle_defeat', () => {
      notify('error', 'You have been defeated...')
      dispatch({ type: 'SET_BATTLE', payload: null })
      dispatch({ type: 'CLEAR_BATTLE_CHAT' })
      dispatch({ type: 'SET_NEGOTIATE_RESULT', payload: null })
      dispatch({ type: 'SET_NEGOTIATE_REQUEST', payload: null })
    })

    // Session 8: KO interactions
    socket.on('battle_ko_interact', (data: { koNpcs: KOInteraction[] }) => {
      dispatch({ type: 'SET_BATTLE_KO_NPCS', payload: data.koNpcs })
    })
    socket.on('pvp_ko_choice', (data: PvpKOChoice) => {
      dispatch({ type: 'SET_PVP_KO_CHOICE', payload: data })
    })

    // Session 11: Signature tech discovery
    socket.on('sig_tech_discovery', (data: SigTechDiscovery) => {
      dispatch({ type: 'SET_SIG_TECH_DISCOVERY', payload: data })
    })

    // Party events
    socket.on('party_update', (data: { members: PartyMember[] }) => {
      dispatch({ type: 'SET_PARTY_MEMBERS', payload: data.members || [] })
    })

    // Companion events
    socket.on('companion_list', (data: Companion[]) => {
      dispatch({ type: 'SET_COMPANIONS', payload: data || [] })
    })
    socket.on('companion_joined', (data: Companion) => {
      dispatch({ type: 'ADD_COMPANION', payload: data })
    })
    socket.on('companion_dismissed', (data: { npcId: number }) => {
      dispatch({ type: 'REMOVE_COMPANION', payload: data.npcId })
    })
    socket.on('companion_moved', (data: { npcId: number; x: number; y: number }) => {
      dispatch({ type: 'UPDATE_COMPANION', payload: { npcId: data.npcId, changes: { x: data.x, y: data.y } } })
    })
    socket.on('companion_tactics_changed', (data: { npcId: number; tactics: Companion['tactics'] }) => {
      dispatch({ type: 'UPDATE_COMPANION', payload: { npcId: data.npcId, changes: { tactics: data.tactics } } })
    })
    
    // Notifications
    socket.on('notification', (data: { type: Notification['type']; message: string }) => {
      const id = crypto.randomUUID()
      dispatch({ type: 'ADD_NOTIFICATION', payload: { id, ...data, timestamp: Date.now() } })
      setTimeout(() => dispatch({ type: 'REMOVE_NOTIFICATION', payload: id }), 4000)
    })

    // init_self — server sends this after join_game/select_character succeeds
    // Use it to gate the tutorial (only show after game is actually loaded)
    // init_self = server confirmed player joined the game world.
    // This is the right moment to show tutorial — character is fully loaded.
    // Server pre-computes tutorialDone from state_json so we just read it.
    socket.on('init_self', (data: Record<string, unknown>) => {
      const tutorialDone = data.tutorialDone === true
      if (!tutorialDone) {
        dispatch({ type: 'SET_SHOW_TUTORIAL', payload: true })
      }
    })

    socketRef.current = socket
    
    return () => {
      socket.disconnect()
    }
  }, [])
  
  const pendingCharIdRef = useRef<number | null>(null)

  // Check auth on mount — restore session if cookie is still valid
  useEffect(() => {
    dispatch({ type: 'SET_LOADING', payload: true })
    api.auth.me().then(async res => {
      dispatch({ type: 'SET_API_AVAILABLE', payload: true })
      const d = res as any
      if (d.success) {
        dispatch({ type: 'SET_AUTH', payload: { isAuthenticated: true, username: d.username ?? null, role: d.role ?? null, chatColor: d.chatColor ?? null } })
        const savedCharId = localStorage.getItem('te_last_char_id')
        if (savedCharId) {
          const charId = parseInt(savedCharId, 10)
          if (charId) pendingCharIdRef.current = charId
        }
      }
      dispatch({ type: 'SET_LOADING', payload: false })
    }).catch(() => {
      dispatch({ type: 'SET_API_AVAILABLE', payload: false })
      dispatch({ type: 'SET_LOADING', payload: false })
    })
  }, [])
  
  // =================================================================
  // ACTIONS
  // =================================================================
  const notify = useCallback((type: Notification['type'], message: string) => {
    const id = crypto.randomUUID()
    dispatch({ type: 'ADD_NOTIFICATION', payload: { id, type, message, timestamp: Date.now() } })
    setTimeout(() => dispatch({ type: 'REMOVE_NOTIFICATION', payload: id }), 4000)
  }, [])
  
  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true })
    
    const res = await api.auth.login(username, password)
    dispatch({ type: 'SET_LOADING', payload: false })
    
    if (res.success && res.data) {
      dispatch({ type: 'SET_AUTH', payload: { isAuthenticated: true, username: res.data.username ?? null, role: res.data.role ?? null, chatColor: (res.data as Record<string, unknown>).chatColor as string ?? null } })
      // Store daily reward if server sent one — modal shown in page.tsx
      if (res.data.dailyReward) {
        dispatch({ type: 'SET_DAILY_REWARD', payload: res.data.dailyReward })
      }
      // Load character list immediately after login while session cookie is fresh
      const charsRes = await api.game.getMyCharacters()
      if (charsRes.success && charsRes.data) {
        dispatch({ type: 'SET_MY_CHARACTERS', payload: charsRes.data.characters })
      }
      notify('success', `Welcome back, ${res.data.username}`)
      return true
    }
    notify('error', res.message || 'Login failed')
    return false
  }, [notify])
  
  const logout = useCallback(async () => {
    await api.auth.logout()
    localStorage.removeItem('te_last_char_id')
    dispatch({ type: 'SET_AUTH', payload: { isAuthenticated: false, username: null, role: null } })
    dispatch({ type: 'SET_CHARACTER', payload: null as unknown as Character })
    notify('info', 'Logged out')
  }, [notify])
  

  const checkAuth = useCallback(async () => {
    const res = await api.auth.me()
    const meData2 = (res as any)
    if (meData2.success) {
      dispatch({ type: 'SET_AUTH', payload: { isAuthenticated: true, username: meData2.username ?? null, role: meData2.role ?? null, chatColor: meData2.chatColor ?? null } })
      if (meData2.charId) pendingCharIdRef.current = meData2.charId
    }
  }, [])
  
  const loadCharacter = useCallback(async (charId: number) => {
    dispatch({ type: 'SET_LOADING', payload: true })
    const res = await api.game.getCharFull(charId)
    dispatch({ type: 'SET_LOADING', payload: false })
    
    // Backend returns flat: { success, character, inventory, ... } — not nested under .data
    const resData = (res.data || res) as unknown as CharacterFull
    
    if (res.success && (res.data || (res as unknown as CharacterFull).character)) {
      const c = resData.character
      dispatch({ type: 'SET_CHAR_FULL', payload: resData })
      dispatch({
        type: 'SET_CHARACTER',
        payload: {
          id: c.id,
          charId: c.id,
          userId: c.user_id,
          name: c.name,
          level: c.level,
          classId: c.class_id,
          className: c.class_name || 'Unknown',
          raceId: 0,
          raceName: c.race_name || 'Unknown',
          currentHp: c.current_hp,
          maxHp: c.max_hp,
          currentMp: c.current_mp,
          maxMp: c.max_mp,
          atk: c.atk,
          def: c.def,
          mo: c.mo,
          md: c.md,
          speed: c.speed,
          luck: c.luck,
          experience: resData.xpCurrent,
          experienceToNext: resData.xpToNext || 0,
          gold: resData.gold,
          limitbreak: c.limitbreak || 0,
          breaklevel: c.breaklevel || 1,
          mapId: c.map_id,
          x: c.x,
          y: c.y
        }
      })
      
      // Convert inventory
      const items: Item[] = (resData.inventory || []).map(i => ({
        id: i.item_id,
        name: i.name,
        description: i.description,
        icon: i.icon || 'package',
        type: i.type.toLowerCase() as Item['type'],
        rarity: 'common' as Item['rarity'],
        quantity: i.quantity,
        bonusHp: i.bonus_hp,
        bonusMp: i.bonus_mp,
        bonusAtk: i.bonus_atk,
        bonusDef: i.bonus_def,
        bonusMo: i.bonus_mo,
        bonusMd: i.bonus_md,
        bonusSpeed: i.bonus_speed,
        bonusLuck: i.bonus_luck
      }))
      dispatch({ type: 'SET_INVENTORY', payload: items })
      
      // Persist last selected char so it auto-loads on refresh
      localStorage.setItem('te_last_char_id', String(charId))

      // Join socket room
      if (socketRef.current) {
        socketRef.current.emit('select_character', { charId })
      }
    } else {
      notify('error', res.message || 'Failed to load character')
    }
  }, [notify])
  

  // After checkAuth sets pendingCharIdRef, load the character
  useEffect(() => {
    if (pendingCharIdRef.current && loadCharacter) {
      const id = pendingCharIdRef.current
      pendingCharIdRef.current = null
      loadCharacter(id)
    }
  }, [state.isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

    const loadMyCharacters = useCallback(async () => {
    const res = await api.game.getMyCharacters()
    if (res.success && res.data) {
      return res.data.characters
    }
    return []
  }, [])
  
  const useItem = useCallback(async (itemId: number) => {
    if (!state.character) return
    const res = await api.game.useItem(state.character.charId, itemId)
    if (res.success && res.data) {
      dispatch({ type: 'UPDATE_HP', payload: { current: res.data.newHp } })
      dispatch({ type: 'UPDATE_MP', payload: { current: res.data.newMp } })
      dispatch({ type: 'REMOVE_ITEM', payload: { itemId, quantity: 1 } })
      notify('heal', res.message || 'Item used!')
    } else {
      notify('error', res.message || 'Cannot use item')
    }
  }, [state.character, notify])
  
  const equipItem = useCallback(async (itemId: number, slotKey: string) => {
    if (!state.character) return
    const res = await api.game.equipItem(state.character.charId, itemId, slotKey)
    if (res.success) {
      await loadCharacter(state.character.charId)
      notify('item', 'Equipped!')
    } else {
      notify('error', res.message || 'Cannot equip')
    }
  }, [state.character, loadCharacter, notify])
  
  const unequipItem = useCallback(async (slotKey: string) => {
    if (!state.character) return
    const res = await api.game.unequipItem(state.character.charId, slotKey)
    if (res.success) {
      await loadCharacter(state.character.charId)
      notify('info', 'Unequipped')
    } else {
      notify('error', res.message || 'Cannot unequip')
    }
  }, [state.character, loadCharacter, notify])
  
  const loadQuests = useCallback(async () => {
    if (!state.character) return
    const [activeRes, availableRes] = await Promise.all([
      api.quest.getActive(state.character.charId),
      api.quest.getAvailable(state.character.charId)
    ])
    
    if (activeRes.success && activeRes.data) {
      dispatch({ type: 'SET_ACTIVE_QUESTS', payload: activeRes.data })
    }
    if (availableRes.success && availableRes.data) {
      dispatch({ type: 'SET_AVAILABLE_QUESTS', payload: availableRes.data })
    }
  }, [state.character])
  
  const acceptQuest = useCallback(async (questId: string) => {
    if (!state.character) return
    const res = await api.quest.accept(state.character.charId, questId)
    if (res.success) {
      await loadQuests()
      notify('success', 'Quest accepted!')
    } else {
      notify('error', res.error || 'Cannot accept quest')
    }
  }, [state.character, loadQuests, notify])
  
  const completeQuest = useCallback(async (questId: string) => {
    if (!state.character) return
    const res = await api.quest.complete(state.character.charId, questId)
    if (res.success && res.data) {
      await loadQuests()
      notify('xp', `Quest complete! +${res.data.xp_awarded} XP`)
    } else {
      notify('error', res.error || 'Quest not ready')
    }
  }, [state.character, loadQuests, notify])
  
  const abandonQuest = useCallback(async (questId: string) => {
    if (!state.character) return
    const res = await api.quest.abandon(state.character.charId, questId)
    if (res.success) {
      await loadQuests()
      notify('warning', 'Quest abandoned')
    }
  }, [state.character, loadQuests, notify])
  
  // Socket-based actions
  const lastMoveRef = useRef(0)
  const moveQueuedRef = useRef(false)
  const MOVE_COOLDOWN = 250 // ms between moves — 4 tiles/sec max, prevents sprint exploit

  const move = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    const char = state.character
    if (!char || !socketRef.current) return

    // Client-side rate limit — strict cooldown
    const now = Date.now()
    if (now - lastMoveRef.current < MOVE_COOLDOWN) return
    if (moveQueuedRef.current) return // don't queue multiple moves
    lastMoveRef.current = now
    moveQueuedRef.current = true

    const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0
    const dy = direction === 'up' ? -1 : direction === 'down' ? 1 : 0
    const newX = char.x + dx
    const newY = char.y + dy

    // Client-side collision check
    const map = state.currentMap
    if (map && map.tiles) {
      const tilesArr = map.tiles as number[]
      if (newX < 0 || newX >= map.width || newY < 0 || newY >= map.height) { moveQueuedRef.current = false; return }
      const tileId = tilesArr[newY * map.width + newX]
      if (tileId === 1 || tileId === 2) { moveQueuedRef.current = false; return }
    }

    socketRef.current.emit('move', { x: newX, y: newY })
    dispatch({ type: 'SET_CHARACTER', payload: { ...char, x: newX, y: newY } })
    // Unlock after cooldown
    setTimeout(() => { moveQueuedRef.current = false }, MOVE_COOLDOWN)
  }, [state.character, state.currentMap, dispatch])
  
  const interact = useCallback(() => {
    const char = state.character
    if (!char || !socketRef.current) return
    socketRef.current.emit('interact', { x: char.x, y: char.y })
  }, [state.character])
  
  const teleport = useCallback((mapId: number, x: number, y: number) => {
    socketRef.current?.emit('teleport', { mapId, x, y })
  }, [])
  
  const attack = useCallback((commandId = 1) => {
    const battleId = (state.battle as unknown as Record<string,unknown>)?.battleId
    socketRef.current?.emit('battle_action', { battleId, commandId })
  }, [state.battle])
  
  const useSkill = useCallback((skillId: number, commandId = 3) => {
    const battleId = (state.battle as unknown as Record<string,unknown>)?.battleId
    socketRef.current?.emit('battle_action', { battleId, commandId, skillId })
  }, [state.battle])
  
  const useBattleItem = useCallback((itemId: number, commandId = 4) => {
    const battleId = (state.battle as unknown as Record<string,unknown>)?.battleId
    socketRef.current?.emit('battle_action', { battleId, commandId, itemId })
  }, [state.battle])
  
  const defend = useCallback((commandId = 2) => {
    const battleId = (state.battle as unknown as Record<string,unknown>)?.battleId
    socketRef.current?.emit('battle_action', { battleId, commandId })
  }, [state.battle])
  
  const flee = useCallback((commandId = 5) => {
    const battleId = (state.battle as unknown as Record<string,unknown>)?.battleId
    socketRef.current?.emit('battle_action', { battleId, commandId })
  }, [state.battle])
  
  const limitBreak = useCallback((commandId = 6) => {
    const battleId = (state.battle as unknown as Record<string,unknown>)?.battleId
    socketRef.current?.emit('battle_action', { battleId, commandId })
  }, [state.battle])
  
  const sendPartyInvite = useCallback((targetCharId: number) => {
    socketRef.current?.emit('party_invite', { targetCharId })
    notify('info', 'Party invite sent')
  }, [notify])
  
  const leaveParty = useCallback(() => {
    socketRef.current?.emit('party_leave')
    dispatch({ type: 'SET_PARTY_MEMBERS', payload: [] })
    notify('info', 'Left party')
  }, [notify])
  
  const sendTradeRequest = useCallback((targetCharId: number) => {
    socketRef.current?.emit('trade_request', { targetCharId })
    notify('info', 'Trade request sent')
  }, [notify])
  
  const actions = {
    login,
    logout,
    checkAuth,
    loadCharacter,
    dailyReward: state.pendingDailyReward,
    tutorialDone: state.tutorialDone,
    dismissDailyReward: () => dispatch({ type: 'SET_DAILY_REWARD', payload: null }),
    markTutorialDone: () => {
      dispatch({ type: 'SET_TUTORIAL_DONE', payload: true })
      socketRef.current?.emit('tutorial_complete')
    },
    loadMyCharacters,
    useItem,
    equipItem,
    unequipItem,
    loadQuests,
    acceptQuest,
    completeQuest,
    abandonQuest,
    move,
    interact,
    teleport,
    attack,
    useSkill,
    useBattleItem,
    defend,
    flee,
    limitBreak,
    sendPartyInvite,
    leaveParty,
    sendTradeRequest,
    notify
  }
  
  return (
    <GameContext.Provider value={{ state, dispatch, socket: socketRef.current, actions }}>
      {children}
    </GameContext.Provider>
  )
}

// =================================================================
// HOOKS
// =================================================================
export function useGame() {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useGame must be used within a GameProvider')
  }
  
  const { state, dispatch, socket, actions } = context
  
  // API base URL comes from NEXT_PUBLIC_API_URL env var — no localStorage needed.
  // The backend URL is fixed at build time via the env file.
  const serverUrl = process.env.NEXT_PUBLIC_API_URL || ''
  const setServerUrl = (_url: string) => { /* no-op: set NEXT_PUBLIC_API_URL in .env.local */ }
  
  // Register function — email is required by the backend
  const register = async (username: string, email: string, password: string, characterName: string): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true })
    const res = await api.auth.register(username, email, password, characterName)
    dispatch({ type: 'SET_LOADING', payload: false })

    // Backend returns { success, message } — no .data on register
    if (res.success) {
      return await actions.login(username, password)
    }
    actions.notify('error', res.message || 'Registration failed')
    return false
  }
  
  return {
    // State shortcuts
    ...state,
    character: state.character,
    inventory: state.inventory,
    quests: state.quests,
    oghams: state.oghams,
    battle: state.battle,
    dialogue: state.dialogue,
    currentView: state.currentView,
    notifications: state.notifications,
    nearbyPlayers: state.nearbyPlayers,
    partyMembers: state.partyMembers,
    currentMap: state.currentMap,
    
    // Connection state
    serverUrl,
    setServerUrl,

    // Daily reward
    pendingDailyReward: state.pendingDailyReward,
    clearDailyReward: () => dispatch({ type: 'CLEAR_DAILY_REWARD' }),

    // Tutorial
    showTutorial: state.showTutorial,
    dismissTutorial: () => dispatch({ type: 'SET_SHOW_TUTORIAL', payload: false }),
    error: null as string | null, // Will be managed by component state
    
    // Role-based helpers
    isStaff: state.role === 'admin' || state.role === 'staff' || state.role === 'gm',
    
    // Raw context access
    state,
    dispatch,
    socket,
    
    // All actions
    ...actions,
    register,
    
    // View management
    setView: (view: GameView['type']) => dispatch({ type: 'SET_VIEW', payload: view }),
    closeDialogue: () => dispatch({ type: 'SET_DIALOGUE', payload: null }),
    
    // Ogham management
    slotOgham: (oghomId: number) => {
      dispatch({ type: 'SET_OGHAMS', payload: state.oghams.map(o => o.id === oghomId ? { ...o, slotted: true } : o) })
    },
    unslotOgham: (oghomId: number) => {
      dispatch({ type: 'SET_OGHAMS', payload: state.oghams.map(o => o.id === oghomId ? { ...o, slotted: false } : o) })
    }
  }
}

export function useNotification() {
  const { notify } = useGame()
  return { notify }
}
