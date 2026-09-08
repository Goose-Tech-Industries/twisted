// Cards / Card Duel store — Triple Triad / Realm Cards minigame
// Driven by Phoenix social channel (social:lobby)

import { connection } from '$phoenix/connection.svelte'

export interface RealmCard {
  card_id: number
  quantity: number
  name: string
  icon: string
  description?: string
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  value_top: number
  value_right: number
  value_bottom: number
  value_left: number
  element?: string | null
}

export interface DuelCard {
  cardId: number
  name: string
  icon: string
  owner: 'player' | 'npc'
  value_top: number
  value_right: number
  value_bottom: number
  value_left: number
  rarity?: string
  element?: string | null
}

export interface MatchUpdatePayload {
  matchId: number
  board: (DuelCard | null)[]
  flipped?: number[]
  status: 'active' | 'completed' | 'draw'
  playerScore: number
  npcScore: number
  rewardCard?: { id: number; name: string; icon: string; rarity: string } | null
}

function createCardsStore() {
  let collection = $state<RealmCard[]>([])
  let hand = $state<RealmCard[]>([])
  let board = $state<(DuelCard | null)[]>(Array(9).fill(null))
  let matchId = $state<number | null>(null)
  let opponent = $state<string>('Card Master')
  let status = $state<'idle' | 'active' | 'completed'>('idle')
  let playerScore = $state<number>(0)
  let npcScore = $state<number>(0)
  let selectedHandIndex = $state<number | null>(null)
  let rewardCard = $state<{ id: number; name: string; icon: string; rarity: string } | null>(null)
  let errorMsg = $state<string | null>(null)
  let lastFlipped = $state<number[]>([])
  let initialized = false

  function getChannel() {
    return connection.channel('social:lobby')
  }

  function initListeners() {
    if (initialized) return
    const ch = getChannel()
    if (!ch) return

    ch.on('card_collection', (payload: any) => {
      collection = payload.cards ?? []
    })

    ch.on('card_game_start', (payload: any) => {
      matchId = payload.matchId
      hand = payload.playerCards ?? []
      board = Array(payload.boardSize ?? 9).fill(null)
      opponent = payload.opponent || 'Card Master'
      status = 'active'
      playerScore = 5
      npcScore = 5
      selectedHandIndex = null
      rewardCard = null
      errorMsg = null
      lastFlipped = []
    })

    ch.on('card_game_update', (payload: any) => {
      board = payload.board ?? Array(9).fill(null)
      playerScore = payload.playerScore ?? 0
      npcScore = payload.npcScore ?? 0
      lastFlipped = payload.flipped ?? []
      if (payload.rewardCard) {
        rewardCard = payload.rewardCard
      }
      if (payload.status === 'completed') {
        status = 'completed'
        setTimeout(() => {
          loadCollection()
        }, 1200)
      }
    })

    ch.on('card_result', (payload: any) => {
      if (payload.success === false) {
        errorMsg = payload.message || 'Action failed'
      }
    })

    initialized = true
  }

  function loadCollection() {
    initListeners()
    const ch = getChannel()
    ch?.push('card_get_collection', {})
  }

  function challenge(npcName: string = 'Card Master') {
    initListeners()
    errorMsg = null
    const ch = getChannel()
    ch?.push('card_game_challenge', { npcName })
  }

  function placeCard(position: number) {
    if (selectedHandIndex === null || matchId === null) return
    const card = hand[selectedHandIndex]
    if (!card) return

    const ch = getChannel()
    ch?.push('card_game_place', {
      matchId,
      cardId: card.card_id,
      position
    })

    hand = hand.filter((_, idx) => idx !== selectedHandIndex)
    selectedHandIndex = null
  }

  function selectCard(index: number) {
    selectedHandIndex = selectedHandIndex === index ? null : index
  }

  function resetMatch() {
    status = 'idle'
    matchId = null
    board = Array(9).fill(null)
    hand = []
    selectedHandIndex = null
    rewardCard = null
    errorMsg = null
    lastFlipped = []
  }

  return {
    get collection() { return collection },
    get hand() { return hand },
    get board() { return board },
    get matchId() { return matchId },
    get opponent() { return opponent },
    get status() { return status },
    get playerScore() { return playerScore },
    get npcScore() { return npcScore },
    get selectedHandIndex() { return selectedHandIndex },
    get rewardCard() { return rewardCard },
    get errorMsg() { return errorMsg },
    get lastFlipped() { return lastFlipped },

    loadCollection,
    challenge,
    placeCard,
    selectCard,
    resetMatch
  }
}

export const cards = createCardsStore()
