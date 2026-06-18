"use client"

import React, { createContext, useContext, useReducer, useCallback, useEffect, ReactNode, useRef } from 'react'
// Phoenix Channels — replaced socket.io-client
import {
  useMovementActions,
  useCombatActions,
  useSocialActions,
  useCharacterActions,
  useNpcActions,
  useEconomyActions,
  useMinigameActions,
  useWorldActions,
} from './phoenix/actions'
import { useChannels } from './phoenix/channel-provider'
import {
  useGameChannelListeners,
  useSocialChannelListeners,
  useBattleChannelListeners,
  useUserChannelListeners,
  useMapChannelListeners,
} from './phoenix/channels'
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
import {
  gameReducer,
  initialState,
  type GameState,
  type GameAction,
  type Notification,
  type NearbyPlayer,
  type PartyMember,
  type MapBattleIndicator,
  type BattleChatMessage,
  type BattleEmoteEvent,
  type NegotiateResult,
  type NegotiateRequest
} from './game-reducers'

// Re-export types so existing consumers that might need them can still get them
export type { GameState, GameAction, Notification, NearbyPlayer, PartyMember }

// =================================================================
// CONTEXT
// =================================================================
interface GameContextValue {
  state: GameState
  dispatch: React.Dispatch<GameAction>
  socket: null  // Socket.IO removed — use useChannels() for Phoenix channel access
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
    move: (direction: 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right') => void
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

    // Core gameplay
    requestRespawn: () => void
    restAtInn: () => void
    fastTravel: (mapId: number) => void
    distributeAP: (stat: string, points: number) => void
    useAbility: (abilityType: string) => void
    getAbilities: () => void
    emote: (emoteText: string) => void
    setPresence: (presence: string, message?: string) => void
    setTitle: (title: string | null) => void
    eventChoice: (choiceIndex: number) => void
    triggerCutscene: (cutsceneId: number) => void
    useCapsule: (itemId: number) => void
    enterStructure: (structureId: number) => void
    exitStructure: () => void
    dropItem: (itemId: number, quantity: number) => void
    pickupItem: (groundItemId: number) => void

    // Battle (extended)
    battleChallenge: (targetCharId: number) => void
    battleAccept: (challengerCharId: number) => void
    battleBrave: () => void
    battleDefault: () => void
    battlePreview: (skillId: number, targetId: number) => void
    battleAutoToggle: (enabled: boolean, tactics?: string) => void
    battleChatSend: (text: string) => void
    battleSpectate: (battleId: number) => void
    raidJoin: (raidId: number) => void

    // Social (extended)
    partyAccept: (partyId: number) => void
    partyDecline: (partyId: number) => void
    partyKick: (targetCharId: number) => void
    sparRequest: (targetCharId: number) => void
    sparAccept: (fromCharId: number) => void
    guildSetRank: (targetCharId: number, rank: string) => void
    friendRequest: (targetCharId: number) => void
    typingDM: (targetCharId: number) => void

    // Training
    masterTrain: (npcId: number) => void
    train: (trainingType: string) => void
    acceptNpcNeed: (npcId: number) => void

    // Minigames & Economy
    fishCast: (spotId?: number) => void
    fishReel: () => void
    diceRoll: (bet: number, prediction: string) => void
    cardGameChallenge: (npcId: number) => void
    cardGamePlace: (cardId: number, position: number) => void
    gather: (nodeId: number) => void
    captureCreature: (npcId: number, itemId: number) => void
    bankDeposit: (itemId: number, quantity: number) => void
    bankWithdraw: (itemId: number, quantity: number) => void
    bountyAccept: (bountyId: number) => void
    mountToggle: (mountId: number) => void
    housingPurchase: (plotId: number) => void
    housingPlaceFurniture: (furnitureId: number, x: number, y: number) => void

    // Staff
    staffPanelJoin: () => void
    staffNudge: (targetSocketId: string) => void
  }
}

const GameContext = createContext<GameContextValue | null>(null)

// =================================================================
// PROVIDER
// =================================================================
export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState)

  // Phoenix Channels — native channel refs from ChannelProvider
  const {
    isConnected: phoenixConnected,
    gameChannel, socialChannel, battleLobbyChannel,
    userChannel, mapChannel, activeBattleChannel,
    connect: phoenixConnect, disconnect: phoenixDisconnect,
    joinUserChannel, joinMapChannel, joinBattleChannel, leaveBattleChannel,
  } = useChannels()

  // REMOVED: Socket.IO connection block — replaced by Phoenix ChannelProvider
  // All listeners are now in lib/phoenix/channels/*.ts
  // All emits are now in lib/phoenix/actions/*.ts
  // Socket.IO block removed — replaced by Phoenix ChannelProvider + channel hooks + action hooks
  // Socket.IO useEffect removed — listeners now in lib/phoenix/channels/*.ts

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
  const notify = useCallback((type: Notification['type'], message: string, duration = 4000) => {
    const id = crypto.randomUUID()
    dispatch({ type: 'ADD_NOTIFICATION', payload: { id, type, message, timestamp: Date.now() } })
    setTimeout(() => dispatch({ type: 'REMOVE_NOTIFICATION', payload: id }), duration)
  }, [])

  // ═══════════════════════════════════════════════════════════════
  // ACTION HOOKS — small focused files instead of inline emits
  // ═══════════════════════════════════════════════════════════════
  const getState = useCallback(() => ({
    character: state.character,
    currentMap: state.currentMap,
    battle: state.battle,
  }), [state.character, state.currentMap, state.battle])

  // Action hooks were authored against loose dispatch/notify shapes
  // (`(action: {type:string;payload?:unknown}) => void` / `(type:string,...) => void`),
  // which the strict reducer-typed dispatch/notify aren't assignable to in
  // contravariant position. Widen explicitly at the boundary.
  const looseDispatch = dispatch as unknown as (action: { type: string; payload?: unknown }) => void
  const looseNotify = notify as unknown as (type: string, message: string) => void

  const movementActions = useMovementActions(gameChannel, looseDispatch, looseNotify, getState)
  const combatActions = useCombatActions(battleLobbyChannel, activeBattleChannel, getState)
  const socialActions = useSocialActions(socialChannel, looseNotify)
  const characterActions = useCharacterActions(gameChannel)
  const npcActions = useNpcActions(gameChannel)
  const economyActions = useEconomyActions(gameChannel, socialChannel)
  const minigameActions = useMinigameActions(socialChannel)
  const worldActions = useWorldActions(gameChannel)

  // ═══════════════════════════════════════════════════════════════
  // PHOENIX CHANNEL LISTENERS — native channel event subscriptions
  // ═══════════════════════════════════════════════════════════════
  const handleBattleStartJoin = useCallback((battleId: number) => {
    joinBattleChannel(battleId)
  }, [joinBattleChannel])

  useGameChannelListeners(gameChannel, looseDispatch, looseNotify)
  useSocialChannelListeners(socialChannel, looseDispatch, looseNotify)
  useBattleChannelListeners(battleLobbyChannel, activeBattleChannel, looseDispatch, looseNotify, handleBattleStartJoin)
  useUserChannelListeners(userChannel, looseDispatch, looseNotify, handleBattleStartJoin)
  useMapChannelListeners(mapChannel, looseDispatch, state.character?.charId)

  // Sync Phoenix connection state to reducer
  useEffect(() => {
    dispatch({ type: 'SET_SOCKET_CONNECTED', payload: phoenixConnected })
  }, [phoenixConnected])

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true })

    const res = await api.auth.login(username, password)
    dispatch({ type: 'SET_LOADING', payload: false })

    if (res.success && res.data) {
      dispatch({ type: 'SET_AUTH', payload: { isAuthenticated: true, username: res.data.username ?? null, role: res.data.role ?? null, chatColor: (res.data as Record<string, unknown>).chatColor as string ?? null } })

      // Connect Phoenix socket with the auth token
      const token = (res.data as Record<string, unknown>).token as string
      if (token) {
        phoenixConnect(token)
      }

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
    phoenixDisconnect()
    dispatch({ type: 'SET_AUTH', payload: { isAuthenticated: false, username: null, role: null } })
    dispatch({ type: 'SET_CHARACTER', payload: null as unknown as Character })
    notify('info', 'Logged out')
  }, [notify, phoenixDisconnect])


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

      // Join Phoenix channels for this character
      characterActions.selectCharacter(charId)
      joinUserChannel(charId)
      if (resData.character.map_id) joinMapChannel(resData.character.map_id)
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

  // Socket-based actions removed — see lib/phoenix/actions/*.ts


  const actions = {
    // Auth & session
    login, logout, checkAuth, loadCharacter, loadMyCharacters,
    dailyReward: state.pendingDailyReward,
    tutorialDone: state.tutorialDone,
    dismissDailyReward: () => dispatch({ type: 'SET_DAILY_REWARD', payload: null }),
    markTutorialDone: () => {
      dispatch({ type: 'SET_TUTORIAL_DONE', payload: true })
      characterActions.tutorialComplete()
    },
    // REST-based actions (unchanged)
    useItem, equipItem, unequipItem,
    loadQuests, acceptQuest, completeQuest, abandonQuest,
    // Phoenix channel actions — spread from small focused hooks
    ...movementActions,
    ...combatActions,
    ...socialActions,
    ...characterActions,
    ...npcActions,
    ...economyActions,
    ...minigameActions,
    ...worldActions,
    // Aliases to preserve existing useGame() API names
    sendPartyInvite: socialActions.partyInvite,
    leaveParty: socialActions.partyLeave,
    sendTradeRequest: socialActions.tradeRequest,
    setTitle: socialActions.titleChanged,
    distributeAP: characterActions.distributeAp,
    friendRequest: socialActions.friendRequestSend,
    typingDM: socialActions.typingDm,
    notify,
  }

  return (
    <GameContext.Provider value={{ state, dispatch, socket: null, actions }}>
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

    // Movement: setRunning is exposed via ...actions (useMovementActions)

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
