<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { auth } from '$stores/auth.svelte'
  import { api } from '$phoenix/api'
  import { livingVoice } from '$stores/living_voice.svelte'
  import type { Character } from '$stores/character.svelte'

  interface CompanionInfo {
    id: string
    name: string
    title: string
    icon: string
    class: string
    affinity: number
    campQuote: string
    attire: string
  }

  interface BiomeInfo {
    key: string
    name: string
    icon: string
    particles?: string
    atmosphere?: string
    danger?: number
    ambient?: string
    description?: string
    type?: string
  }

  interface WeatherInfo {
    key: string
    name: string
    icon: string
    temperature?: string
  }

  interface MealBuffInfo {
    name?: string
    dish?: string
    icon: string
    buff_name?: string
    buff_icon?: string
    effects?: {
      atk?: number
      def?: number
      crit?: number
      hit?: number
      max_hp_pct?: number
      max_mp_pct?: number
      description?: string
    }
    atk?: number
    def?: number
    crit?: number
    hit?: number
    atk_bonus?: number
    def_bonus?: number
    crit_bonus?: number
    hit_bonus?: number
    battles_left?: number
    duration_battles?: number
    sous_chef?: string
  }

  interface NightWatchOption {
    id: string
    name: string
    perk: string
    icon: string
    specialty?: string
    ambushRisk?: number
  }

  interface CookingRecipe {
    id: string
    name: string
    icon: string
    ingredients: string[]
    buff: {
      name: string
      icon: string
      atk?: number
      def?: number
      crit?: number
      hit?: number
      max_hp_pct?: number
      max_mp_pct?: number
      atk_bonus?: number
      def_bonus?: number
      crit_bonus?: number
      hit_bonus?: number
      max_hp_bonus?: number
      duration_battles?: number
      description: string
    }
    description: string
  }

  interface SousChef {
    id: string
    name: string
    icon: string
    perk: string
    quote: string
    specialty?: string
    affinity?: number
    cookingQuote?: string
  }

  interface AmbushEnemy {
    name: string
    icon: string
    count: number
    level: number
    threat: string
    threatLevel?: string
    description?: string
    clothesModifier?: string
  }

  interface AmbushTacticalOption {
    id: string
    label: string
    desc: string
    icon: string
    synergy?: string
  }

  interface CampStatusResp {
    success: boolean
    location: 'inn' | 'wilderness'
    inn_name: string | null
    rest_cost: number
    biome?: BiomeInfo
    weather?: WeatherInfo
    activeMealBuff?: MealBuffInfo | null
    nightWatchOptions?: NightWatchOption[]
    hero: {
      id: number
      name: string
      race: string
      class: string
      background: string
      hp: number
      max_hp: number
      mp: number
      max_mp: number
    }
    companions: CompanionInfo[]
  }

  interface DialogueBeat {
    step?: number
    totalSteps?: number
    speaker: string
    portrait: string
    emote: string
    body: string
    companionId: string
  }

  interface CompanionReaction {
    companionId: string
    speaker: string
    portrait: string
    delta: number
    reply: string
    newAffinity?: number
  }

  interface SupportPair {
    pairId: string
    nameA: string
    nameB: string
    iconA: string
    iconB: string
    relationship: string
    rank: 'C' | 'B' | 'A' | 'S'
    nextRank: 'C' | 'B' | 'A' | 'S'
    points: number
    targetPoints: number
    canUnlock: boolean
    unlockedScenes: string[]
    combatSynergy: string
    nextSynergy: string
  }

  interface Choice {
    id: string
    label: string
    affinityDelta?: number
    tone?: string
    companionId?: string
    affinities?: Record<string, number>
  }

  interface CrisisChoice {
    id: string
    label: string
    description: string
    icon: string
  }

  interface CrisisDef {
    id: string
    companion_id: string
    companion_name: string
    companion_icon: string
    title: string
    subtitle: string
    summary: string
    stakes: string
    location: string
    duo_art_reward: string
    choices: CrisisChoice[]
    status: 'available' | 'resolved'
    resolution?: {
      choice_id: string
      choice_label: string
      resolved_at: string
      duo_art_awarded?: string
    }
  }

  interface DuoArtDef {
    id: string
    name: string
    companion: string
    icon: string
    damage: number
    element: string
    description: string
  }

  interface NemesisDef {
    id: string
    name: string
    title: string
    archetype: string
    faction: string
    level: number
    grudge_level: number
    status: 'active' | 'escaped' | 'slain'
    scars: Array<{ name: string; element?: string; trait?: string; desc?: string }>
    traits: string[]
    kills_on_player: number
    escapes_from_player: number
    encounters_count: number
    living_dialogue: Record<string, string>
  }

  interface FactionDef {
    key: string
    name: string
    title: string
    icon: string
    color: string
    standing: number
    description: string
    tier_info?: {
      tier: string
      icon: string
      shop_mult: number
      perk: string
    }
  }

  interface Props {
    character: Character | null
    onclose: () => void
    onrestcomplete?: () => void
  }

  let { character, onclose, onrestcomplete }: Props = $props()

  let loading = $state(true)
  let status = $state<CampStatusResp | null>(null)
  let activeTab = $state<'camp' | 'cutscene' | 'supports' | 'cooking' | 'crises' | 'nemesis'>('camp')
  let selectedLocation = $state<'campfire' | 'inn'>('campfire')
  let selectedGuard = $state<string>('valerius')
  let autoNarrate = $state(true)

  // Companion Crisis & S-Rank Duo Arts State
  let crisesList = $state<CrisisDef[]>([])
  let unlockedDuoArts = $state<DuoArtDef[]>([])
  let activeCrisis = $state<CrisisDef | null>(null)
  let crisisStreaming = $state(false)
  let crisisStage = $state<{ title: string; subtitle: string; companion: string; stakes: string } | null>(null)
  let crisisNarrative = $state('')
  let crisisBeats = $state<Array<{ speaker: string; icon: string; text: string; emotion?: string }>>([])
  let crisisPrompt = $state<{ crisisId: string; prompt: string; choices: CrisisChoice[] } | null>(null)
  let crisisNotice = $state<string | null>(null)
  let crisisAbortController: AbortController | null = null

  // Nemesis & Factions State
  let nemesisRoster = $state<NemesisDef[]>([])
  let factionsList = $state<FactionDef[]>([])
  let nemesisLoading = $state(false)
  let nemesisNotice = $state<string | null>(null)

  // Ambush encounter state
  let ambushActive = $state(false)
  let ambushEnemy = $state<AmbushEnemy | null>(null)
  let ambushTacticalOptions = $state<AmbushTacticalOption[]>([])
  let ambushMessage = $state<string>('')
  let ambushResolving = $state(false)
  let ambushVictory = $state<{
    success: boolean
    ambushResolved: boolean
    tacticalChoice: string
    guard: string
    guardReply: string
    bonusXp: number
    lootedIngredients: string[]
    message: string
  } | null>(null)

  // Cooking state
  let cookingLoading = $state(false)
  let cookingIngredients = $state<string[]>([])
  let cookingRecipes = $state<CookingRecipe[]>([])
  let cookingSousChefs = $state<SousChef[]>([])
  let selectedRecipe = $state<CookingRecipe | null>(null)
  let selectedSousChef = $state<string>('bram')
  let cookingSuccessResult = $state<{
    dish: string
    dishIcon: string
    mealBuff: MealBuffInfo
    chefReply: string
    sousChef: string
    affinityDelta: number
    newAffinity: number
    message: string
  } | null>(null)

  // SSE Streaming state (Ensemble Cutscene)
  let isStreaming = $state(false)
  let stageTitle = $state('Embers of the Long Road')
  let stageLocation = $state<'campfire' | 'inn'>('campfire')
  let narrativeText = $state('')
  let dialogueLine = $state<DialogueBeat | null>(null)
  let dialogueBeats = $state<DialogueBeat[]>([])
  let choices = $state<Choice[]>([])
  let choiceTaken = $state<string | null>(null)
  let companionReply = $state<string | null>(null)
  let companionReactions = $state<CompanionReaction[]>([])
  let affinityNotice = $state<string | null>(null)
  let restCompleteNotice = $state<string | null>(null)

  // Fire Emblem Support Bonds State
  let supportPairs = $state<SupportPair[]>([])
  let activeSupportPair = $state<SupportPair | null>(null)
  let supportStreaming = $state(false)
  let supportStage = $state<{ title: string; subtitle: string; pairId: string } | null>(null)
  let supportNarrative = $state('')
  let supportBeats = $state<DialogueBeat[]>([])
  let supportReady = $state<boolean>(false)
  let supportPromotionNotice = $state<string | null>(null)

  let abortController: AbortController | null = null
  let supportAbortController: AbortController | null = null

  onMount(async () => {
    if (!character?.id) return
    try {
      const [res, supRes] = await Promise.all([
        api.get<CampStatusResp>(`/api/camp/status/${character.id}`),
        api.get<{ success: boolean; pairs: SupportPair[] }>(`/api/companions/supports/${character.id}`)
      ])
      if (res.success) {
        status = res
        selectedLocation = res.location === 'inn' ? 'inn' : 'campfire'
        stageLocation = selectedLocation
      }
      if (supRes.success && Array.isArray(supRes.pairs)) {
        supportPairs = supRes.pairs
      }
    } catch (e) {
      console.error('[camp] failed to load camp status or supports', e)
    } finally {
      loading = false
    }
    void loadCrises()
    void loadNemesis()
  })

  onDestroy(() => {
    if (abortController) {
      abortController.abort()
    }
    if (supportAbortController) {
      supportAbortController.abort()
    }
    if (crisisAbortController) {
      crisisAbortController.abort()
    }
    livingVoice.stop()
  })

  async function loadCrises() {
    if (!character?.id) return
    try {
      const res = await api.get<{ success: boolean; crises: CrisisDef[]; unlockedDuoArts: DuoArtDef[] }>(
        `/api/companions/crisis_status/${character.id}`
      )
      if (res.success) {
        crisesList = res.crises || []
        unlockedDuoArts = res.unlockedDuoArts || []
      }
    } catch (e) {
      console.error('[crisis] failed to load crises', e)
    }
  }

  async function startCrisisSSE(crisis: CrisisDef) {
    if (!character?.id) return
    activeCrisis = crisis
    crisisStreaming = true
    crisisNarrative = ''
    crisisBeats = []
    crisisPrompt = null
    crisisNotice = null

    if (crisisAbortController) crisisAbortController.abort()
    crisisAbortController = new AbortController()

    try {
      const token = auth.token || ''
      const url = `/api/companions/crisis_stream?crisis_id=${crisis.id}&char_id=${character.id}&token=${encodeURIComponent(token)}`
      const res = await fetch(url, {
        headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
        signal: crisisAbortController.signal
      })
      if (!res.ok || !res.body) throw new Error('Failed to start crisis stream')

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''
        for (const block of lines) {
          if (!block.trim()) continue
          parseCrisisSSEBlock(block)
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        console.error('[crisis] stream error', err)
      }
    } finally {
      crisisStreaming = false
    }
  }

  function parseCrisisSSEBlock(block: string) {
    let eventName = 'message'
    let dataStr = ''
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) eventName = line.replace('event:', '').trim()
      else if (line.startsWith('data:')) dataStr = line.replace('data:', '').trim()
    }
    if (!dataStr) return
    try {
      const data = JSON.parse(dataStr)
      if (eventName === 'crisis_stage') {
        crisisStage = data
      } else if (eventName === 'crisis_narrative') {
        crisisNarrative += data.text
      } else if (eventName === 'crisis_beat') {
        crisisBeats = [...crisisBeats, data]
        if (autoNarrate && !livingVoice.isMuted) {
          void livingVoice.play({ speaker: data.speaker, body: data.text })
        }
      } else if (eventName === 'crisis_prompt') {
        crisisPrompt = data
      }
    } catch (e) {
      console.error('[crisis] parse error', e)
    }
  }

  async function resolveCrisisAction(crisisId: string, choiceId: string) {
    if (!character?.id) return
    try {
      const res = await api.post<{
        success: boolean
        awardedDuoArt?: DuoArtDef
        message: string
      }>('/api/companions/crisis_resolve', {
        char_id: character.id,
        crisis_id: crisisId,
        choice_id: choiceId
      })
      if (res.success) {
        crisisNotice = res.message
        if (res.awardedDuoArt) {
          unlockedDuoArts = [res.awardedDuoArt, ...unlockedDuoArts]
        }
        await loadCrises()
      }
    } catch (e) {
      console.error('[crisis] resolve error', e)
    }
  }

  async function loadNemesis() {
    if (!character?.id) return
    nemesisLoading = true
    try {
      const res = await api.get<{
        nemeses: NemesisDef[]
        factions: FactionDef[]
      }>(`/api/nemesis/dossier/${character.id}`)
      nemesisRoster = res.nemeses || []
      factionsList = res.factions || []
    } catch (e) {
      console.error('[nemesis] load error', e)
    } finally {
      nemesisLoading = false
    }
  }

  async function simulateNemesisEncounter(nemesisId: string, outcome: 'escaped' | 'player_defeated' | 'executed') {
    if (!character?.id) return
    try {
      const res = await api.post<{
        success: boolean
        log: string
        nemeses: NemesisDef[]
        factions: any
      }>('/api/nemesis/encounter', {
        char_id: character.id,
        nemesis_id: nemesisId,
        outcome: outcome,
        details: { element: 'fire' }
      })
      if (res.success) {
        nemesisNotice = res.log
        await loadNemesis()
      }
    } catch (e) {
      console.error('[nemesis] encounter error', e)
    }
  }

  async function shiftFaction(factionKey: string, delta: number) {
    if (!character?.id) return
    try {
      const res = await api.post<{ success: boolean; data: any }>('/api/nemesis/faction_shift', {
        char_id: character.id,
        faction: factionKey,
        delta: delta
      })
      if (res.success) {
        await loadNemesis()
      }
    } catch (e) {
      console.error('[nemesis] faction shift error', e)
    }
  }

  function toggleLocation() {
    const nextLoc: 'campfire' | 'inn' = selectedLocation === 'inn' ? 'campfire' : 'inn'
    selectedLocation = nextLoc
    stageLocation = nextLoc
    if (status) {
      status.location = nextLoc === 'inn' ? 'inn' : 'wilderness'
      status.inn_name = nextLoc === 'inn' ? "The Boar's Tusk Tavern" : null
      status.rest_cost = nextLoc === 'inn' ? 10 : 0
    }
    if (activeTab === 'cutscene') {
      void startSSECutscene(nextLoc)
    }
  }

  async function startSSECutscene(targetLoc?: 'campfire' | 'inn') {
    if (!character?.id) return
    if (targetLoc) selectedLocation = targetLoc
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    livingVoice.stop()
    isStreaming = true
    activeTab = 'cutscene'
    narrativeText = ''
    dialogueLine = null
    dialogueBeats = []
    choices = []
    choiceTaken = null
    companionReply = null
    companionReactions = []
    affinityNotice = null
    restCompleteNotice = null

    abortController = new AbortController()

    try {
      const token = auth.token || ''
      const loc = selectedLocation
      const url = `/api/cutscenes/stream?charId=${character.id}&location=${loc}&token=${encodeURIComponent(token)}`

      const response = await fetch(url, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`
        },
        signal: abortController.signal
      })

      if (!response.ok || !response.body) {
        throw new Error('Failed to open SSE stream')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const block of lines) {
          if (!block.trim()) continue
          parseSSEBlock(block)
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        console.error('[sse] cutscene stream error', err)
      }
    } finally {
      isStreaming = false
    }
  }

  function parseSSEBlock(block: string) {
    let eventName = 'message'
    let dataStr = ''

    const lines = block.split('\n')
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.replace('event:', '').trim()
      } else if (line.startsWith('data:')) {
        dataStr = line.replace('data:', '').trim()
      }
    }

    if (!dataStr) return
    try {
      const data = JSON.parse(dataStr)
      handleSSEEvent(eventName, data)
    } catch (e) {
      console.warn('[sse] error parsing event data', e, dataStr)
    }
  }

  function handleSSEEvent(event: string, data: Record<string, unknown>) {
    if (event === 'stage') {
      if (data.title) stageTitle = String(data.title)
      if (data.location) stageLocation = data.location === 'inn' ? 'inn' : 'campfire'
    } else if (event === 'narrative') {
      if (data.text) {
        narrativeText += (narrativeText ? ' ' : '') + String(data.text)
      }
    } else if (event === 'narrative_end') {
      if (autoNarrate && narrativeText) {
        void livingVoice.play({
          speaker: 'Narrator',
          body: narrativeText
        })
      }
    } else if (event === 'dialogue_beat') {
      const beat: DialogueBeat = {
        step: typeof data.step === 'number' ? data.step : undefined,
        totalSteps: typeof data.totalSteps === 'number' ? data.totalSteps : undefined,
        speaker: String(data.speaker || 'Companion'),
        portrait: String(data.portrait || '⚔️'),
        emote: String(data.emote || 'emote-rest'),
        body: String(data.body || ''),
        companionId: String(data.companionId || 'valerius')
      }
      dialogueBeats = [...dialogueBeats, beat]
      dialogueLine = beat

      if (beat.body) {
        void livingVoice.play({
          speaker: beat.speaker,
          body: beat.body
        })
      }
    } else if (event === 'dialogue') {
      if (!dialogueLine) {
        dialogueLine = {
          speaker: String(data.speaker || 'Companion'),
          portrait: String(data.portrait || '⚔️'),
          emote: String(data.emote || 'emote-rest'),
          body: String(data.body || ''),
          companionId: String(data.companionId || 'valerius')
        }
      }
    } else if (event === 'choice_prompt') {
      if (Array.isArray(data.choices)) {
        choices = data.choices as Choice[]
      }
    }
  }

  async function pickChoice(c: Choice) {
    if (!character?.id || choiceTaken) return
    choiceTaken = c.id

    try {
      const res = await api.post<{
        success: boolean
        companionId: string
        affinityDelta: number
        newAffinity: number
        reply: string
        reactions?: CompanionReaction[]
        updatedAffinities?: Record<string, number>
        message: string
      }>('/api/cutscenes/choice', {
        charId: character.id,
        choiceId: c.id,
        affinityDelta: c.affinityDelta ?? 5,
        companionId: c.companionId || dialogueLine?.companionId || 'valerius',
        affinities: c.affinities
      })

      if (res.success) {
        companionReply = res.reply
        affinityNotice = res.message

        if (Array.isArray(res.reactions) && res.reactions.length > 0) {
          companionReactions = res.reactions
          const first = res.reactions[0]
          if (first?.reply) {
            void livingVoice.play({
              speaker: first.speaker,
              body: first.reply
            })
          }
        } else if (res.reply) {
          void livingVoice.play({
            speaker: dialogueLine?.speaker || 'Companion',
            body: res.reply
          })
        }

        // Update live affinities
        if (status?.companions) {
          if (res.updatedAffinities) {
            for (const comp of status.companions) {
              if (res.updatedAffinities[comp.id] !== undefined) {
                comp.affinity = res.updatedAffinities[comp.id]
              }
            }
          } else {
            const target = status.companions.find(comp => comp.id === res.companionId)
            if (target) {
              target.affinity = res.newAffinity
            }
          }
        }
      }
    } catch (e) {
      console.error('[cutscene] failed to send choice', e)
    }
  }

  async function completeRest() {
    if (!character?.id) return
    try {
      const loc = selectedLocation === 'inn' ? 'inn' : 'wilderness'
      const res = await api.post<{
        success: boolean
        ambush?: boolean
        enemy?: AmbushEnemy
        tacticalOptions?: AmbushTacticalOption[]
        message: string
        guard?: string
      }>('/api/camp/rest', {
        charId: character.id,
        type: loc,
        guard: selectedGuard
      })

      if (res.success) {
        if (res.ambush && res.enemy) {
          ambushActive = true
          ambushEnemy = res.enemy
          ambushTacticalOptions = res.tacticalOptions || []
          ambushMessage = res.message
          void livingVoice.play({
            speaker: 'Narrator',
            body: res.message
          })
        } else {
          restCompleteNotice = res.message
          if (character) {
            character.current_hp = character.max_hp
            character.current_mp = character.max_mp
          }
          onrestcomplete?.()
        }
      }
    } catch (e) {
      console.error('[camp] failed to complete rest', e)
    }
  }

  async function resolveAmbushAction(choiceId: string) {
    if (!character?.id) return
    ambushResolving = true
    try {
      const res = await api.post<{
        success: boolean
        ambushResolved: boolean
        tacticalChoice: string
        guard: string
        guardReply: string
        bonusXp: number
        lootedIngredients: string[]
        updatedAffinities: Record<string, number>
        message: string
      }>('/api/camp/resolve_ambush', {
        charId: character.id,
        tacticalChoice: choiceId,
        guard: selectedGuard
      })

      if (res.success) {
        ambushVictory = res
        ambushActive = false
        if (character) {
          character.current_hp = character.max_hp
          character.current_mp = character.max_mp
        }
        if (status && res.updatedAffinities) {
          for (const comp of status.companions) {
            if (res.updatedAffinities[comp.id] !== undefined) {
              comp.affinity = res.updatedAffinities[comp.id]
            }
          }
        }
        if (res.guardReply) {
          void livingVoice.play({
            speaker: 'Camp Guard',
            body: res.guardReply
          })
        }
        onrestcomplete?.()
      }
    } catch (e) {
      console.error('[ambush] failed to resolve ambush', e)
    } finally {
      ambushResolving = false
    }
  }

  // ── CAMP ACTIVITIES & COOKING HELPERS ─────────────────────────────

  async function loadCooking() {
    if (!character?.id) return
    cookingLoading = true
    try {
      const res = await api.get<{
        success: boolean
        ingredients: string[]
        recipes: CookingRecipe[]
        activeBuff?: MealBuffInfo | null
        sousChefs: SousChef[]
      }>(`/api/camp/cooking/${character.id}`)
      if (res.success) {
        cookingIngredients = res.ingredients || []
        cookingRecipes = res.recipes || []
        cookingSousChefs = res.sousChefs || []
        if (res.activeBuff && status) {
          status.activeMealBuff = res.activeBuff
        }
        if (cookingRecipes.length > 0 && !selectedRecipe) {
          selectedRecipe = cookingRecipes[0]
        }
      }
    } catch (e) {
      console.error('[cooking] failed to load cooking data', e)
    } finally {
      cookingLoading = false
    }
  }

  async function cookMealAction() {
    if (!character?.id || !selectedRecipe) return
    try {
      const res = await api.post<{
        success: boolean
        dish: string
        dishIcon: string
        mealBuff: MealBuffInfo
        chefReply: string
        sousChef: string
        affinityDelta: number
        newAffinity: number
        message: string
      }>('/api/camp/cook', {
        charId: character.id,
        recipeId: selectedRecipe.id,
        sousChef: selectedSousChef
      })

      if (res.success) {
        cookingSuccessResult = res
        if (status) {
          status.activeMealBuff = res.mealBuff
          const chef = status.companions.find(c => c.id === res.sousChef)
          if (chef) chef.affinity = res.newAffinity
        }
        await loadCooking()
        if (res.chefReply) {
          const chefObj = cookingSousChefs.find(s => s.id === res.sousChef)
          void livingVoice.play({
            speaker: chefObj?.name || 'Companion',
            body: res.chefReply
          })
        }
      }
    } catch (e) {
      console.error('[cooking] failed to cook meal', e)
    }
  }

  // ── FIRE EMBLEM SUPPORT HELPERS ───────────────────────────────────

  async function loadSupports() {
    if (!character?.id) return
    try {
      const res = await api.get<{ success: boolean; pairs: SupportPair[] }>(`/api/companions/supports/${character.id}`)
      if (res.success && Array.isArray(res.pairs)) {
        supportPairs = res.pairs
      }
    } catch (e) {
      console.error('[supports] failed to reload support pairs', e)
    }
  }

  async function startSupportScene(pair: SupportPair) {
    if (!character?.id) return
    if (supportAbortController) {
      supportAbortController.abort()
      supportAbortController = null
    }
    livingVoice.stop()
    activeSupportPair = pair
    supportStreaming = true
    supportStage = null
    supportNarrative = ''
    supportBeats = []
    supportReady = false
    supportPromotionNotice = null

    supportAbortController = new AbortController()

    try {
      const token = auth.token || ''
      const url = `/api/companions/support_stream?charId=${character.id}&pair=${pair.pairId}&rank=${pair.nextRank}&token=${encodeURIComponent(token)}`

      const response = await fetch(url, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`
        },
        signal: supportAbortController.signal
      })

      if (!response.ok || !response.body) {
        throw new Error('Failed to open support SSE stream')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const block of lines) {
          if (!block.trim()) continue
          parseSupportSSEBlock(block)
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        console.error('[sse] support stream error', err)
      }
    } finally {
      supportStreaming = false
    }
  }

  function parseSupportSSEBlock(block: string) {
    let eventName = 'message'
    let dataStr = ''

    const lines = block.split('\n')
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.replace('event:', '').trim()
      } else if (line.startsWith('data:')) {
        dataStr = line.replace('data:', '').trim()
      }
    }

    if (!dataStr) return
    try {
      const data = JSON.parse(dataStr)
      handleSupportSSEEvent(eventName, data)
    } catch (e) {
      console.warn('[sse] error parsing support event', e, dataStr)
    }
  }

  function handleSupportSSEEvent(event: string, data: Record<string, unknown>) {
    if (event === 'support_stage') {
      supportStage = {
        title: String(data.title || 'Support Conversation'),
        subtitle: String(data.subtitle || ''),
        pairId: String(data.pairId || '')
      }
    } else if (event === 'support_narrative') {
      if (data.text) {
        supportNarrative += (supportNarrative ? ' ' : '') + String(data.text)
      }
    } else if (event === 'support_narrative_end') {
      if (autoNarrate && supportNarrative) {
        void livingVoice.play({
          speaker: 'Narrator',
          body: supportNarrative
        })
      }
    } else if (event === 'support_beat') {
      const beat: DialogueBeat = {
        speaker: String(data.speaker || 'Companion'),
        portrait: String(data.portrait || '⚔️'),
        emote: String(data.emote || 'emote-rest'),
        body: String(data.body || ''),
        companionId: String(data.companionId || '')
      }
      supportBeats = [...supportBeats, beat]
      if (beat.body) {
        void livingVoice.play({
          speaker: beat.speaker,
          body: beat.body
        })
      }
    } else if (event === 'support_ready') {
      supportReady = true
    }
  }

  async function completeSupportScene(pair: SupportPair) {
    if (!character?.id) return
    try {
      const res = await api.post<{
        success: boolean
        pairId: string
        rank: 'C' | 'B' | 'A' | 'S'
        points: number
        message: string
        combatSynergy: string
      }>('/api/companions/support_complete', {
        charId: character.id,
        pair: pair.pairId,
        rank: pair.nextRank
      })

      if (res.success) {
        supportPromotionNotice = res.message
        supportReady = false
        await loadSupports()
      }
    } catch (e) {
      console.error('[supports] failed to complete support conversation', e)
    }
  }
</script>

<div class="camp-overlay-backdrop" role="dialog" aria-modal="true">
  <div
    class="camp-modal"
    class:inn-mode={selectedLocation === 'inn'}
    class:biome-snow={status?.biome?.type === 'snow' && selectedLocation !== 'inn'}
    class:biome-swamp={status?.biome?.type === 'swamp' && selectedLocation !== 'inn'}
    class:biome-volcanic={status?.biome?.type === 'volcanic' && selectedLocation !== 'inn'}
    class:biome-desert={status?.biome?.type === 'desert' && selectedLocation !== 'inn'}
    class:biome-coastal={status?.biome?.type === 'coastal' && selectedLocation !== 'inn'}
    class:biome-forest={status?.biome?.type === 'forest' && selectedLocation !== 'inn'}
  >
    {#if status?.biome?.particles && selectedLocation !== 'inn'}
      <div class="biome-particles-layer {status.biome.particles}" aria-hidden="true">
        <span class="p-elem p1"></span>
        <span class="p-elem p2"></span>
        <span class="p-elem p3"></span>
        <span class="p-elem p4"></span>
        <span class="p-elem p5"></span>
        <span class="p-elem p6"></span>
      </div>
    {/if}

    <!-- Top Bar Navigation -->
    <header class="camp-header">
      <div class="camp-title-row">
        <div class="location-badge-row">
          <span class="location-badge">
            {selectedLocation === 'inn' ? '🏨 Town Inn & Tavern' : '⛺ Wilderness Camp'}
          </span>
          <button
            type="button"
            class="switch-loc-btn"
            title="Switch between Town Inn and Wilderness Camp"
            onclick={toggleLocation}
          >
            🔄 Switch to {selectedLocation === 'inn' ? '⛺ Wilderness Camp' : '🏨 Town Inn'}
          </button>
        </div>
        <h2>{selectedLocation === 'inn' ? (status?.inn_name || "The Boar's Tusk Tavern") : 'Wilderness Campfire'}</h2>
      </div>

      <div class="header-right">
        <div class="sse-soul-badge" title="Sovereign Soul Engine & Living Voice">
          <span class="pulse-dot"></span>
          <span class="badge-text">Sovereign Soul</span>
          {#if livingVoice.isPlaying}
            <span class="voice-anim">
              <span class="bar" style="height: {6 + livingVoice.level * 8}px;"></span>
              <span class="bar" style="height: {4 + livingVoice.level * 12}px;"></span>
              <span class="bar" style="height: {5 + livingVoice.level * 10}px;"></span>
            </span>
          {/if}
          <button
            type="button"
            class="voice-toggle-btn"
            title={livingVoice.isMuted ? "Unmute Sovereign Soul Voice" : "Mute Sovereign Soul Voice"}
            onclick={() => livingVoice.toggleMute()}
          >
            {livingVoice.isMuted ? "🔇" : "🔊"}
          </button>
        </div>

        <div class="nav-tabs">
          <button
            type="button"
            class="tab-btn"
            class:active={activeTab === 'camp'}
            onclick={() => (activeTab = 'camp')}
          >
            🔥 Camp Grounds
          </button>
          <button
            type="button"
            class="tab-btn"
            class:active={activeTab === 'cutscene'}
            onclick={() => { activeTab = 'cutscene'; if (!narrativeText) void startSSECutscene(); }}
          >
            🎬 Nightly Cutscene (SSE)
          </button>
          <button
            type="button"
            class="tab-btn"
            class:active={activeTab === 'supports'}
            onclick={() => { activeTab = 'supports'; void loadSupports(); }}
          >
            🤝 Support Bonds
            {#if supportPairs.some(p => p.canUnlock || p.points >= p.targetPoints)}
              <span class="tab-notification-dot"></span>
            {/if}
          </button>
          <button
            type="button"
            class="tab-btn"
            class:active={activeTab === 'cooking'}
            onclick={() => { activeTab = 'cooking'; void loadCooking(); }}
          >
            🍲 Cooking Pot
            {#if status?.activeMealBuff}
              <span class="tab-buff-dot" title="Active Meal Buff: {status.activeMealBuff.dish}"></span>
            {/if}
          </button>
          <button
            type="button"
            class="tab-btn"
            class:active={activeTab === 'crises'}
            onclick={() => { activeTab = 'crises'; void loadCrises(); }}
          >
            ⭐ Companion Crises
            {#if crisesList.some(c => c.status === 'available')}
              <span class="tab-notification-dot"></span>
            {/if}
          </button>
          <button
            type="button"
            class="tab-btn"
            class:active={activeTab === 'nemesis'}
            onclick={() => { activeTab = 'nemesis'; void loadNemesis(); }}
          >
            💀 Nemesis & Factions
            {#if nemesisRoster.some(n => (n.grudge_level || 1) >= 3)}
              <span class="tab-flame-dot">🔥</span>
            {/if}
          </button>
        </div>
        <button type="button" class="close-btn" onclick={onclose} aria-label="Close">✕</button>
      </div>
    </header>

    <!-- MAIN BODY -->
    <div class="camp-content">
      {#if loading}
        <div class="loading-state">
          <span class="loading-spin">🔥</span>
          <p>Gathering kindling and pitching tents…</p>
        </div>
      {:else if activeTab === 'camp'}
        <!-- CAMPGROUND VIEW: HERO & COMPANIONS IN CAMP CLOTHES -->
        <div class="campground-view">
          <!-- Live Biome & Weather Environment Strip -->
          {#if status?.biome}
            <div class="biome-env-strip">
              <div class="env-chip biome-chip" title={status.biome.description || status.biome.atmosphere || ''}>
                <span class="env-icon">{status.biome.icon}</span>
                <div class="env-text">
                  <span class="env-label">REGION BIOME</span>
                  <strong class="env-val">{status.biome.name}</strong>
                </div>
              </div>

              {#if status?.weather}
                <div class="env-chip weather-chip">
                  <span class="env-icon">{status.weather.icon}</span>
                  <div class="env-text">
                    <span class="env-label">WEATHER & SKY</span>
                    <strong class="env-val">{status.weather.name}{status.weather.temperature ? ` (${status.weather.temperature})` : ''}</strong>
                  </div>
                </div>
              {/if}

              {#if status?.activeMealBuff}
                <div class="env-chip meal-buff-chip" title="Active until eaten or expires">
                  <span class="env-icon">{status.activeMealBuff.icon}</span>
                  <div class="env-text">
                    <span class="env-label">FEAST BUFF ({status.activeMealBuff.battles_left ?? 3} Battles)</span>
                    <strong class="env-val">
                      {status.activeMealBuff.dish || status.activeMealBuff.name || 'Hearth Meal'}
                      (+{status.activeMealBuff.atk_bonus ?? status.activeMealBuff.atk ?? 0} ATK, +{status.activeMealBuff.def_bonus ?? status.activeMealBuff.def ?? 0} DEF, +{status.activeMealBuff.crit_bonus ?? status.activeMealBuff.crit ?? 0}% CRIT)
                    </strong>
                  </div>
                </div>
              {:else}
                <div class="env-chip meal-empty-chip">
                  <span class="env-icon">🍲</span>
                  <button type="button" class="cook-prompt-btn" onclick={() => { activeTab = 'cooking'; void loadCooking(); }}>
                    Pot is cold. Cook a campfire meal ➔
                  </button>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Ambush Victory Notification Banner -->
          {#if ambushVictory}
            <div class="ambush-victory-banner">
              <div class="victory-icon">🛡️⚔️</div>
              <div class="victory-content">
                <div class="victory-tag">CAMP AMBUSH REPELLED!</div>
                <h4>Night Defense Victorious</h4>
                <p class="victory-msg">{ambushVictory.message}</p>
                {#if ambushVictory.guardReply}
                  <p class="guard-victory-quote">"{ambushVictory.guardReply}"</p>
                {/if}
                <div class="victory-rewards">
                  <span class="reward-xp">⭐ +{ambushVictory.bonusXp} XP</span>
                  <span class="reward-bond">💖 +10 Companion Bonds</span>
                  {#if ambushVictory.lootedIngredients?.length > 0}
                    <span class="reward-loot">🥩 Loot: {ambushVictory.lootedIngredients.map(i => i.replace(/_/g, ' ')).join(', ')}</span>
                  {/if}
                </div>
              </div>
            </div>
          {/if}

          <!-- Atmosphere Banner -->
          <div class="ambient-hearth-banner">
            <div class="fire-glow-disc"></div>
            <div class="hearth-text">
              <span class="hearth-spark">✨</span>
              <span>
                {status?.location === 'inn'
                  ? 'The tavern fire roars merrily. Hot spiced wine warms your bones, and your gear rests securely by the door.'
                  : 'A quiet circle of river stones shields the blaze from the wind. Steel plates are unclasped, and camp garments donned.'}
              </span>
            </div>
            <button
              type="button"
              class="primary-cutscene-trigger"
              onclick={() => void startSSECutscene()}
            >
              🔥 Start Evening Reflection (SSE Cutscene) ➔
            </button>
          </div>

          <!-- Companions Gathering Grid -->
          <div class="companions-section">
            <div class="section-title">
              <span>Companions Gathered (Camp Attire Mode)</span>
              <span class="title-hint">Click a companion to view approval & mood</span>
            </div>

            <div class="companions-grid">
              {#each (status?.companions || []) as comp (comp.id)}
                <div class="companion-camp-card">
                  <div class="comp-card-head">
                    <span class="comp-icon">{comp.icon}</span>
                    <div class="comp-names">
                      <span class="comp-name">{comp.name}</span>
                      <span class="comp-title">{comp.title} · {comp.class}</span>
                    </div>
                    <div class="affinity-pill" title="Companion Approval Rating">
                      <span class="aff-icon">💖</span>
                      <span class="aff-score">{comp.affinity} / 100</span>
                    </div>
                  </div>

                  <div class="camp-attire-badge">
                    <span class="attire-icon">👘</span>
                    <span class="attire-text">Attire: {comp.attire}</span>
                  </div>

                  <p class="comp-quote">
                    "{comp.campQuote}"
                    <button
                      type="button"
                      class="quote-speak-btn"
                      title="Speak with Sovereign Soul Voice"
                      onclick={() => livingVoice.play({ speaker: comp.name, body: comp.campQuote })}
                    >
                      🔊
                    </button>
                  </p>
                </div>
              {/each}
            </div>
          </div>

          <!-- Wilderness Night Watch Guard Assignment -->
          {#if status?.location !== 'inn' && status?.nightWatchOptions}
            <div class="night-watch-section">
              <div class="watch-header">
                <div class="watch-title-group">
                  <span class="watch-badge">🛡️ NIGHT WATCH SENTRY</span>
                  <span class="watch-sub">Assign a companion to stand guard and mitigate midnight wilderness ambush risks</span>
                </div>
                <span class="current-watch-tag">
                  Current Guard: <strong>{status.nightWatchOptions.find(o => o.id === selectedGuard)?.name || 'None'}</strong>
                </span>
              </div>
              <div class="watch-options-grid">
                {#each status.nightWatchOptions as opt (opt.id)}
                  <button
                    type="button"
                    class="watch-opt-card"
                    class:selected={selectedGuard === opt.id}
                    onclick={() => (selectedGuard = opt.id)}
                  >
                    <span class="watch-opt-icon">{opt.icon}</span>
                    <div class="watch-opt-info">
                      <div class="watch-opt-name-row">
                        <strong class="watch-opt-name">{opt.name}</strong>
                        {#if opt.ambushRisk !== undefined}
                          <span class="risk-badge" class:low={opt.ambushRisk < 20} class:med={opt.ambushRisk >= 20 && opt.ambushRisk < 35} class:high={opt.ambushRisk >= 35}>
                            {opt.ambushRisk}% Ambush Risk
                          </span>
                        {/if}
                      </div>
                      <span class="watch-opt-specialty">{opt.specialty || opt.perk}</span>
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Camp Actions Footer -->
          <div class="camp-actions-bar">
            <div class="rest-cost-info">
              {#if status?.location === 'inn'}
                <span>Room & Board: <strong class="gold-text">🪙 {status.rest_cost} Gold</strong></span>
              {:else}
                <span>Wilderness Long Rest: <strong class="free-text">Free (Bedroll & Rations)</strong></span>
              {/if}
            </div>

            <div class="action-buttons">
              {#if restCompleteNotice}
                <span class="rest-done-msg">{restCompleteNotice}</span>
              {:else}
                <button type="button" class="btn-rest" onclick={completeRest}>
                  💤 Sleep & Fully Restore HP/MP
                </button>
              {/if}
            </div>
          </div>
        </div>
      {:else if activeTab === 'cutscene'}
        <!-- SSE STREAMED REACTIVE CUTSCENE VIEW -->
        <div class="cutscene-stage">
          <!-- Cinematic Header -->
          <div class="stage-title-banner">
            <span class="stage-badge">SSE STREAM · LIVE REACTIVE DIRECTOR</span>
            <h3>{stageTitle}</h3>
          </div>

          <!-- Real-Time Narrative Stream Box -->
          <div class="narrative-stream-box">
            <div class="narrative-box-header">
              {#if isStreaming}
                <div class="live-stream-beacon">
                  <span class="pulse-dot"></span>
                  <span>Streaming world reactions via Server-Sent Events (SSE)…</span>
                </div>
              {:else}
                <div class="narrator-title">
                  <span class="narrator-icon">📜</span>
                  <span>The Chronicler (Narrator)</span>
                </div>
              {/if}

              <div class="narrator-controls">
                {#if narrativeText}
                  <button
                    type="button"
                    class="narrator-speak-btn"
                    title="Read scene atmosphere aloud with Sovereign Soul Narrator voice"
                    onclick={() => livingVoice.play({ speaker: 'Narrator', body: narrativeText })}
                  >
                    🎙️ Narrate Scene
                  </button>
                {/if}
                <button
                  type="button"
                  class="auto-narrate-btn"
                  class:active={autoNarrate}
                  title="Toggle automatic reading of narrative scenes"
                  onclick={() => (autoNarrate = !autoNarrate)}
                >
                  Auto-Voice: {autoNarrate ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <p class="stream-text">
              {narrativeText}
              {#if isStreaming}
                <span class="typewriter-cursor">▌</span>
              {/if}
            </p>
          </div>

          <!-- Dialogue Beats / Multi-Speaker Ensemble Timeline -->
          {#if dialogueBeats.length > 0}
            <div class="ensemble-timeline">
              <div class="timeline-header">
                <span class="timeline-tag">Ensemble Banter & Camp Dynamics</span>
                <span class="timeline-count">{dialogueBeats.length} Exchanges</span>
              </div>
              <div class="dialogue-beats-list">
                {#each dialogueBeats as beat, idx}
                  <div class="dialogue-beat-row" class:innkeeper={beat.companionId === 'innkeeper'}>
                    <div class="beat-avatar-col">
                      <span class="beat-avatar">{beat.portrait}</span>
                      {#if beat.step && beat.totalSteps}
                        <span class="beat-step-pill">{beat.step}/{beat.totalSteps}</span>
                      {/if}
                    </div>
                    <div class="beat-bubble">
                      <div class="beat-head">
                        <span class="beat-speaker-name">{beat.speaker}</span>
                        <span class="beat-emote-pill">{beat.emote.replace('emote-', '')}</span>
                        <button
                          type="button"
                          class="voice-replay-btn mini"
                          title="Replay line with Sovereign Soul Voice"
                          onclick={() => livingVoice.play({ speaker: beat.speaker, body: beat.body })}
                        >
                          🔊
                        </button>
                      </div>
                      <p class="beat-body">{beat.body}</p>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {:else if dialogueLine}
            <div class="dialogue-spotlight-card">
              <div class="speaker-row">
                <span class="speaker-portrait">{dialogueLine.portrait}</span>
                <div class="speaker-meta">
                  <span class="speaker-name">{dialogueLine.speaker}</span>
                  <span class="speaker-pose">Sovereign Soul Voice · Camp Hearth</span>
                </div>
                <button
                  type="button"
                  class="voice-replay-btn"
                  title="Replay line with Sovereign Soul Voice"
                  onclick={() => livingVoice.play({ speaker: dialogueLine?.speaker || 'Companion', body: dialogueLine?.body || '' })}
                >
                  🔊 Replay
                </button>
              </div>
              <p class="speaker-body">{dialogueLine.body}</p>
            </div>
          {/if}

          <!-- Interactive Branching Choices -->
          {#if choices.length > 0 && !choiceTaken}
            <div class="choices-container">
              <span class="choices-prompt">Choose your response:</span>
              <div class="choices-list">
                {#each choices as c}
                  <button
                    type="button"
                    class="choice-btn"
                    onclick={() => pickChoice(c)}
                  >
                    <div class="choice-main-line">
                      <span class="choice-label">{c.label}</span>
                      {#if c.tone}
                        <span class="choice-tone">[{c.tone}]</span>
                      {/if}
                    </div>
                    {#if c.affinities && Object.keys(c.affinities).length > 0}
                      <div class="choice-affinity-chips">
                        {#each Object.entries(c.affinities) as [cid, delta]}
                          <span class="aff-chip" class:pos={delta > 0} class:neg={delta < 0}>
                            {delta > 0 ? `+${delta}` : delta} {cid}
                          </span>
                        {/each}
                      </div>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Companion Reactions After Choice -->
          {#if companionReactions.length > 0}
            <div class="companion-reactions-block">
              <div class="reactions-title">
                <span>Party Reactions & Bond Adjustments</span>
              </div>
              <div class="reactions-grid">
                {#each companionReactions as rx}
                  <div class="reaction-card">
                    <div class="reaction-head">
                      <span class="reaction-portrait">{rx.portrait}</span>
                      <div class="reaction-speaker-meta">
                        <span class="reaction-name">{rx.speaker}</span>
                        <span class="reaction-delta-badge" class:pos={rx.delta > 0} class:neg={rx.delta < 0}>
                          {rx.delta > 0 ? `+${rx.delta}` : rx.delta} Bond {rx.newAffinity !== undefined ? `(${rx.newAffinity}/100)` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        class="voice-replay-btn mini"
                        title="Replay reaction voice"
                        onclick={() => livingVoice.play({ speaker: rx.speaker, body: rx.reply })}
                      >
                        🔊
                      </button>
                    </div>
                    <p class="reaction-reply">"{rx.reply}"</p>
                  </div>
                {/each}
              </div>
              {#if affinityNotice}
                <div class="affinity-toast">
                  <span>✨ {affinityNotice}</span>
                </div>
              {/if}
            </div>
          {:else if companionReply}
            <div class="companion-reply-card">
              <div class="reply-head">
                <span class="reply-icon">💬</span>
                <strong>{dialogueLine?.speaker || 'Companion'} replies:</strong>
                <button
                  type="button"
                  class="voice-replay-btn mini"
                  title="Replay reply with Sovereign Soul Voice"
                  onclick={() => livingVoice.play({ speaker: dialogueLine?.speaker || 'Companion', body: companionReply || '' })}
                >
                  🔊
                </button>
              </div>
              <p class="reply-text">{companionReply}</p>
              {#if affinityNotice}
                <div class="affinity-toast">
                  <span>✨ {affinityNotice}</span>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Cutscene Completion Actions -->
          <div class="cutscene-footer">
            {#if !choiceTaken && choices.length > 0}
              <span class="wait-note">Select a response to forge companion bonds...</span>
            {:else}
              <button type="button" class="btn-rest" onclick={completeRest}>
                💤 Extinguish Campfire & Sleep (Full Restore)
              </button>
            {/if}
          </div>
        </div>
      {:else if activeTab === 'supports'}
        <!-- FIRE EMBLEM SUPPORT BONDS & PRIVATE 1-ON-1 THEATRE -->
        <div class="supports-stage">
          {#if activeSupportPair}
            <!-- 1-ON-1 SUPPORT CONVERSATION THEATRE -->
            <div class="support-theatre-card">
              <div class="theatre-top-bar">
                <div class="theatre-meta">
                  <span class="theatre-crest">🤝</span>
                  <div class="theatre-titles">
                    <h4>{supportStage?.title || `${activeSupportPair.nameA} & ${activeSupportPair.nameB}`}</h4>
                    <span class="theatre-subtitle">
                      {supportStage?.subtitle || `Targeting Rank ${activeSupportPair.nextRank} Bond Promotion`}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  class="theatre-close-btn"
                  onclick={() => { activeSupportPair = null; livingVoice.stop(); }}
                >
                  ✕ Return to Overview
                </button>
              </div>

              <!-- Support Narrative Box -->
              <div class="narrative-stream-box support-mode">
                <div class="narrative-box-header">
                  <div class="narrator-title">
                    <span class="narrator-icon">📜</span>
                    <span>Sovereign Soul Chronicler</span>
                  </div>
                  {#if supportNarrative}
                    <button
                      type="button"
                      class="narrator-speak-btn"
                      onclick={() => livingVoice.play({ speaker: 'Narrator', body: supportNarrative })}
                    >
                      🎙️ Replay Narration
                    </button>
                  {/if}
                </div>
                <p class="stream-text">
                  {supportNarrative}
                  {#if supportStreaming && supportBeats.length === 0}
                    <span class="typewriter-cursor">▌</span>
                  {/if}
                </p>
              </div>

              <!-- Support Beats Dialogue Feed -->
              <div class="support-dialogue-feed">
                {#each supportBeats as beat}
                  <div class="support-dialogue-card" class:alt-speaker={beat.speaker === activeSupportPair.nameB}>
                    <div class="beat-speaker-row">
                      <span class="beat-portrait">{beat.portrait}</span>
                      <span class="beat-speaker-name">{beat.speaker}</span>
                      <button
                        type="button"
                        class="voice-replay-btn mini"
                        title="Replay Voice"
                        onclick={() => livingVoice.play({ speaker: beat.speaker, body: beat.body })}
                      >
                        🔊
                      </button>
                    </div>
                    <p class="beat-dialogue-body">{beat.body}</p>
                  </div>
                {/each}
                {#if supportStreaming}
                  <div class="streaming-indicator">
                    <span class="pulse-dot"></span>
                    <span>Companions conversing via Sovereign Soul Engine…</span>
                  </div>
                {/if}
              </div>

              <!-- Promotion Claim Banner -->
              <div class="support-action-footer">
                {#if supportPromotionNotice}
                  <div class="promotion-success-card">
                    <div class="promo-trophy">🏆</div>
                    <div class="promo-details">
                      <h5>Bond Promotion Achieved!</h5>
                      <p>{supportPromotionNotice}</p>
                    </div>
                    <button
                      type="button"
                      class="btn-claim-back"
                      onclick={() => { activeSupportPair = null; }}
                    >
                      Return to Bonds Overview
                    </button>
                  </div>
                {:else if supportReady}
                  <div class="promotion-ready-card">
                    <div class="ready-info">
                      <span class="ready-tag">CONVERSATION CONCLUDED</span>
                      <h5>Bond Ready for Rank {activeSupportPair.nextRank} Promotion!</h5>
                      <span class="ready-synergy-preview">
                        Next Combat Synergy: <strong>{activeSupportPair.nextSynergy}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      class="btn-promote-confirm"
                      onclick={() => activeSupportPair && completeSupportScene(activeSupportPair)}
                    >
                      ⭐ Promote to Rank {activeSupportPair.nextRank} Now
                    </button>
                  </div>
                {:else if supportStreaming}
                  <span class="support-status-hint">Listening to private conversation...</span>
                {/if}
              </div>
            </div>
          {:else}
            <!-- SUPPORT BONDS OVERVIEW (CARDS GRID) -->
            <div class="supports-overview">
              <div class="supports-banner">
                <div class="banner-crest">⚔️🤝🛡️</div>
                <div class="banner-text">
                  <h3>Companion Support Bonds & Tactical Synergy</h3>
                  <p>
                    Bonds forged by standing side-by-side in combat unlock deadly tactical synergies:
                    <strong>Dual Strike</strong> coordinated follow-up strikes and <strong>Dual Guard</strong> damage interception.
                  </p>
                </div>
              </div>

              <!-- TRIANGLE ATTACK (FIRE EMBLEM SPECIAL ART) SYNERGY BANNER -->
              <div class="triangle-attack-banner" class:all-unlocked={supportPairs.length >= 3 && supportPairs.every(p => p.rank === 'A' || p.rank === 'S')}>
                <div class="triangle-crest-badge">
                  <span class="triangle-sym">🔺</span>
                  <span class="triangle-stars">⭐⭐⭐</span>
                </div>
                <div class="triangle-info">
                  <div class="triangle-title-row">
                    <h4>TRINITY STRIKE · TRIANGLE ATTACK</h4>
                    {#if supportPairs.length >= 3 && supportPairs.every(p => p.rank === 'A' || p.rank === 'S')}
                      <span class="synergy-status-pill unlocked">UNLOCKED IN COMBAT</span>
                    {:else}
                      <span class="synergy-status-pill locked">REQUIRES ALL CORE BONDS AT RANK A/S</span>
                    {/if}
                  </div>
                  <p class="triangle-desc">
                    Synchronized 3-way assault executed when Valerius, Bram, and Lyra fight alongside the hero.
                    Deals <strong>250% base damage</strong>, guarantees a <strong>100% Critical Strike</strong>, and <strong>bypasses 50% target armor</strong>.
                  </p>
                  <div class="triangle-prereqs">
                    {#each supportPairs as p}
                      <span class="req-chip" class:satisfied={p.rank === 'A' || p.rank === 'S'}>
                        {p.nameA} & {p.nameB}: <strong>Rank {p.rank}</strong> {p.rank === 'A' || p.rank === 'S' ? '✓' : '(Needs A)'}
                      </span>
                    {/each}
                  </div>
                </div>
              </div>

              {#if supportPairs.length === 0}
                <div class="no-supports-card">
                  <p>No companion support bonds registered yet. Journey with allies to awaken bonds.</p>
                </div>
              {:else}
                <div class="support-pairs-grid">
                  {#each supportPairs as pair (pair.pairId)}
                    <div class="support-card" class:can-unlock={pair.canUnlock || pair.points >= pair.targetPoints}>
                      <div class="pair-card-header">
                        <div class="pair-icons">
                          <span class="pair-icon-badge">{pair.iconA}</span>
                          <span class="pair-link-symbol">⚡</span>
                          <span class="pair-icon-badge">{pair.iconB}</span>
                        </div>
                        <div class="pair-rank-badge rank-{pair.rank.toLowerCase()}">
                          <span class="rank-letter">Rank {pair.rank}</span>
                        </div>
                      </div>

                      <div class="pair-card-body">
                        <h4 class="pair-names">{pair.nameA} & {pair.nameB}</h4>
                        <span class="pair-rel-tag">{pair.relationship}</span>

                        <!-- Progress Bar to Next Rank -->
                        <div class="bond-meter-wrapper">
                          <div class="bond-meter-labels">
                            <span class="meter-caption">Bond to Rank {pair.nextRank}</span>
                            <span class="meter-values">{pair.points} / {pair.targetPoints} PTS</span>
                          </div>
                          <div class="bond-meter-track">
                            <div
                              class="bond-meter-fill"
                              style="width: {Math.min(100, Math.round((pair.points / pair.targetPoints) * 100))}%"
                            ></div>
                          </div>
                        </div>

                        <!-- Combat Synergy Descriptions -->
                        <div class="synergy-box">
                          <div class="synergy-row">
                            <span class="synergy-badge active">Active Synergy:</span>
                            <span class="synergy-desc">{pair.combatSynergy}</span>
                          </div>
                          {#if pair.rank !== 'S'}
                            <div class="synergy-row next">
                              <span class="synergy-badge next">At Rank {pair.nextRank}:</span>
                              <span class="synergy-desc">{pair.nextSynergy}</span>
                            </div>
                          {/if}
                        </div>
                      </div>

                      <div class="pair-card-actions">
                        {#if pair.points >= pair.targetPoints && pair.rank !== 'S'}
                          <button
                            type="button"
                            class="btn-watch-support ready"
                            onclick={() => startSupportScene(pair)}
                          >
                            ✨ Watch Support Conversation (Rank {pair.nextRank})
                          </button>
                        {:else}
                          <button
                            type="button"
                            class="btn-watch-support replay"
                            onclick={() => startSupportScene(pair)}
                          >
                            🎬 Replay Rank {pair.rank} Support Scene
                          </button>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {:else if activeTab === 'cooking'}
        <!-- CAMP ACTIVITIES & COOKING POT VIEW -->
        <div class="cooking-stage">
          <!-- Culinary Banner -->
          <div class="cooking-banner">
            <div class="banner-crest">🍲🔥🪵</div>
            <div class="banner-text">
              <h3>Campfire Cauldron & Hearth Cooking</h3>
              <p>
                Combine foraged game, mountain herbs, and wild spices with your chosen sous-chef.
                Hearty meals grant party-wide stat buffs across future battles and forge deep companion bonds (+12 Points)!
              </p>
            </div>
            {#if status?.activeMealBuff}
              <div class="active-buff-badge">
                <span class="buff-icon">{status.activeMealBuff.icon}</span>
                <div class="buff-meta">
                  <span class="buff-status">ACTIVE FEAST BUFF</span>
                  <strong>{status.activeMealBuff.dish || status.activeMealBuff.name || 'Hearth Meal'}</strong>
                  <span class="buff-stats">
                    +{status.activeMealBuff.atk_bonus ?? status.activeMealBuff.atk ?? 0} ATK, +{status.activeMealBuff.def_bonus ?? status.activeMealBuff.def ?? 0} DEF, +{status.activeMealBuff.crit_bonus ?? status.activeMealBuff.crit ?? 0}% CRIT ({status.activeMealBuff.battles_left ?? 3} battles left)
                  </span>
                </div>
              </div>
            {/if}
          </div>

          {#if cookingSuccessResult}
            <div class="cooking-success-overlay">
              <div class="success-dish-icon">{cookingSuccessResult.dishIcon}</div>
              <div class="success-details">
                <div class="success-badge">MEAL PERFECTLY PREPARED!</div>
                <h4>{cookingSuccessResult.dish}</h4>
                <p class="success-chef-quote">"{cookingSuccessResult.chefReply}"</p>
                <div class="success-buff-chips">
                  <span class="chip-atk">+{cookingSuccessResult.mealBuff.atk_bonus ?? cookingSuccessResult.mealBuff.atk ?? 0} ATK</span>
                  <span class="chip-def">+{cookingSuccessResult.mealBuff.def_bonus ?? cookingSuccessResult.mealBuff.def ?? 0} DEF</span>
                  <span class="chip-crit">+{cookingSuccessResult.mealBuff.crit_bonus ?? cookingSuccessResult.mealBuff.crit ?? 0}% CRIT</span>
                  <span class="chip-hit">+{cookingSuccessResult.mealBuff.hit_bonus ?? cookingSuccessResult.mealBuff.hit ?? 0}% HIT</span>
                  <span class="chip-battles">Duration: {cookingSuccessResult.mealBuff.battles_left ?? 3} Battles</span>
                  <span class="chip-bond">💖 +{cookingSuccessResult.affinityDelta} {cookingSuccessResult.sousChef} Bond ({cookingSuccessResult.newAffinity}/100)</span>
                </div>
              </div>
              <button
                type="button"
                class="btn-dismiss-success"
                onclick={() => (cookingSuccessResult = null)}
              >
                Continue Cooking ➔
              </button>
            </div>
          {/if}

          {#if cookingLoading}
            <div class="loading-state">
              <span class="loading-spin">🍲</span>
              <p>Stoking the cookfire and unpacking the pantry…</p>
            </div>
          {:else}
            <div class="cooking-workspace">
              <!-- Left Column: Pantry & Sous-Chef Selector -->
              <div class="cooking-sidebar">
                <!-- Pantry Ingredients Card -->
                <div class="sidebar-card pantry-card">
                  <div class="card-head">
                    <span class="head-icon">🧺</span>
                    <h5>Foraged Camp Pantry</h5>
                  </div>
                  {#if cookingIngredients.length === 0}
                    <p class="empty-pantry-hint">No raw ingredients foraged yet. Defeat wilderness beasts and ambushers to gather ingredients!</p>
                  {:else}
                    <div class="pantry-chips-wrap">
                      {#each cookingIngredients as ing}
                        <span class="pantry-chip">
                          <span class="chip-dot">🌿</span>
                          {ing.replace(/_/g, ' ')}
                        </span>
                      {/each}
                    </div>
                  {/if}
                </div>

                <!-- Sous Chef Selector Card -->
                <div class="sidebar-card sous-chef-card">
                  <div class="card-head">
                    <span class="head-icon">👨‍🍳</span>
                    <h5>Choose Sous-Chef (+12 Bond)</h5>
                  </div>
                  <div class="sous-chefs-list">
                    {#each cookingSousChefs as chef (chef.id)}
                      <button
                        type="button"
                        class="chef-card-btn"
                        class:selected={selectedSousChef === chef.id}
                        onclick={() => (selectedSousChef = chef.id)}
                      >
                        <span class="chef-icon">{chef.icon}</span>
                        <div class="chef-meta">
                          <div class="chef-top">
                            <strong class="chef-name">{chef.name}</strong>
                            <span class="chef-aff">💖 {chef.affinity}/100</span>
                          </div>
                          <span class="chef-specialty">{chef.specialty}</span>
                          <p class="chef-quote">"{chef.cookingQuote}"</p>
                        </div>
                      </button>
                    {/each}
                  </div>
                </div>
              </div>

              <!-- Right Column: Recipes & Cook Action -->
              <div class="cooking-main">
                <div class="recipes-list-head">
                  <h5>Hearth Cookbook & Recipe Scrolls</h5>
                  <span class="recipes-count">{cookingRecipes.length} Recipes Available</span>
                </div>

                <div class="recipes-grid">
                  {#each cookingRecipes as recipe (recipe.id)}
                    {@const canCook = recipe.ingredients.every(req => cookingIngredients.includes(req))}
                    <div
                      class="recipe-card"
                      class:selected={selectedRecipe?.id === recipe.id}
                      class:can-cook={canCook}
                      role="button"
                      tabindex="0"
                      onclick={() => (selectedRecipe = recipe)}
                      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectedRecipe = recipe; }}
                    >
                      <div class="recipe-top">
                        <span class="recipe-icon">{recipe.icon}</span>
                        <div class="recipe-name-col">
                          <h6>{recipe.name}</h6>
                          <span class="recipe-flavor">{recipe.description}</span>
                        </div>
                        <span class="can-cook-badge" class:ready={canCook}>
                          {canCook ? '✓ In Stock' : 'Missing Items'}
                        </span>
                      </div>

                      <div class="recipe-reqs">
                        <span class="req-label">Ingredients:</span>
                        <div class="req-chips">
                          {#each recipe.ingredients as req}
                            <span class="req-chip" class:owned={cookingIngredients.includes(req)}>
                              {cookingIngredients.includes(req) ? '✓' : '✗'} {req.replace(/_/g, ' ')}
                            </span>
                          {/each}
                        </div>
                      </div>

                      <div class="recipe-buff-preview">
                        <span class="buff-label">Stat Grant ({recipe.buff.duration_battles ?? 3} Battles):</span>
                        <div class="buff-tags">
                          {#if (recipe.buff.atk_bonus ?? recipe.buff.atk ?? 0) > 0}<span class="b-tag atk">+{recipe.buff.atk_bonus ?? recipe.buff.atk} ATK</span>{/if}
                          {#if (recipe.buff.def_bonus ?? recipe.buff.def ?? 0) > 0}<span class="b-tag def">+{recipe.buff.def_bonus ?? recipe.buff.def} DEF</span>{/if}
                          {#if (recipe.buff.crit_bonus ?? recipe.buff.crit ?? 0) > 0}<span class="b-tag crit">+{recipe.buff.crit_bonus ?? recipe.buff.crit}% CRIT</span>{/if}
                          {#if (recipe.buff.hit_bonus ?? recipe.buff.hit ?? 0) > 0}<span class="b-tag hit">+{recipe.buff.hit_bonus ?? recipe.buff.hit}% HIT</span>{/if}
                          {#if (recipe.buff.max_hp_bonus ?? recipe.buff.max_hp_pct ?? 0) > 0}<span class="b-tag hp">+{recipe.buff.max_hp_bonus ?? recipe.buff.max_hp_pct} HP</span>{/if}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>

                <!-- Cook Action Bar -->
                <div class="cook-action-bar">
                  {#if selectedRecipe}
                    {@const canCookSelected = selectedRecipe.ingredients.every(req => cookingIngredients.includes(req))}
                    <div class="selected-summary">
                      <span>Preparing: <strong>{selectedRecipe.icon} {selectedRecipe.name}</strong> with Sous-Chef <strong>{cookingSousChefs.find(c => c.id === selectedSousChef)?.name || 'Companion'}</strong></span>
                    </div>
                    <button
                      type="button"
                      class="btn-cook-fire"
                      disabled={!canCookSelected}
                      onclick={cookMealAction}
                    >
                      {#if canCookSelected}
                        🔥 Stir the Cauldron & Cook Feast (+12 Bond)
                      {:else}
                        🔒 Missing Required Ingredients
                      {/if}
                    </button>
                  {:else}
                    <span class="no-sel-recipe-hint">Select a recipe above to begin cooking.</span>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        </div>

      <!-- CRISES TAB (EMERGENT COMPANION CRISES & S-RANK DUO COMBAT ARTS) -->
      {:else if activeTab === 'crises'}
        <div class="crises-tab-content">
          <div class="crises-header-banner">
            <div class="banner-title-box">
              <h3>⭐ Sovereign Soul Companion Crises</h3>
              <p class="banner-desc">
                Pivotal ideological crossroads and personal companion quests. Guiding your companions through their deepest crises unlocks legendary S-Rank Duo Combat Arts.
              </p>
            </div>
            {#if unlockedDuoArts.length > 0}
              <div class="duo-arts-trophy-bar">
                <span class="trophy-title">🌟 Unlocked S-Rank Duo Combat Arts:</span>
                <div class="trophy-tags">
                  {#each unlockedDuoArts as art}
                    <div class="duo-art-badge" title="{art.name}: {art.description}">
                      <span class="art-icon">{art.icon}</span>
                      <strong class="art-name">{art.name}</strong>
                      <span class="art-dmg">💥 {art.damage} Dmg</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>

          {#if crisisNotice}
            <div class="crisis-notice-banner">
              <span>{crisisNotice}</span>
              <button type="button" class="btn-close-notice" onclick={() => (crisisNotice = null)}>✕</button>
            </div>
          {/if}

          <!-- ACTIVE STREAMING CRISIS VIEW -->
          {#if activeCrisis && (crisisStreaming || crisisBeats.length > 0)}
            <div class="active-crisis-stream-panel">
              <div class="crisis-stream-top">
                <div class="stream-titles">
                  <span class="companion-tag">{activeCrisis.companion_icon} {activeCrisis.companion_name}</span>
                  <h4>{activeCrisis.title}</h4>
                  <span class="crisis-stakes-label">⚖️ Stakes: {activeCrisis.stakes}</span>
                </div>
                <button
                  type="button"
                  class="btn-exit-crisis"
                  onclick={() => {
                    if (crisisAbortController) crisisAbortController.abort()
                    activeCrisis = null
                    crisisBeats = []
                    crisisNarrative = ''
                    crisisPrompt = null
                  }}
                >
                  ✕ Close Crisis
                </button>
              </div>

              {#if crisisNarrative}
                <div class="crisis-narrative-card">
                  <p>{crisisNarrative}</p>
                </div>
              {/if}

              <div class="crisis-beats-container">
                {#each crisisBeats as beat}
                  <div class="crisis-beat-bubble" class:is-player={beat.speaker === 'Player'}>
                    <div class="beat-meta">
                      <span class="beat-icon">{beat.icon}</span>
                      <strong>{beat.speaker}</strong>
                    </div>
                    <p class="beat-text">"{beat.text}"</p>
                  </div>
                {/each}
              </div>

              <!-- MORAL CROSSROADS PROMPT & CHOICES -->
              {#if crisisPrompt}
                <div class="crisis-decision-altar">
                  <h5>{crisisPrompt.prompt}</h5>
                  <div class="crisis-choices-grid">
                    {#each crisisPrompt.choices as ch}
                      <button
                        type="button"
                        class="crisis-choice-btn"
                        class:is-s-rank={ch.id === 'choice_redeem' || ch.id === 'choice_purify' || ch.id === 'choice_covenant'}
                        onclick={() => resolveCrisisAction(activeCrisis?.id || '', ch.id)}
                      >
                        <span class="choice-icon">{ch.icon}</span>
                        <div class="choice-text-col">
                          <strong>{ch.label}</strong>
                          <p>{ch.description}</p>
                        </div>
                      </button>
                    {/each}
                  </div>
                </div>
              {:else if crisisStreaming}
                <div class="crisis-streaming-indicator">
                  <span class="loading-spin">🔮</span>
                  <span>Sovereign Soul is narrating the companion's deepest turning point...</span>
                </div>
              {/if}
            </div>
          {:else}
            <!-- CRISES LIST DIRECTORY -->
            <div class="crises-cards-grid">
              {#each crisesList as crisis (crisis.id)}
                <div class="crisis-card" class:resolved={crisis.status === 'resolved'}>
                  <div class="card-hero-row">
                    <span class="comp-portrait-badge">{crisis.companion_icon}</span>
                    <div class="crisis-title-col">
                      <h5>{crisis.title}</h5>
                      <span class="crisis-sub">{crisis.subtitle} · {crisis.companion_name}</span>
                    </div>
                    {#if crisis.status === 'resolved'}
                      <span class="status-badge-resolved">✅ Resolved</span>
                    {:else}
                      <span class="status-badge-available">⚡ Available</span>
                    {/if}
                  </div>

                  <p class="crisis-summary-text">{crisis.summary}</p>

                  <div class="crisis-card-footer">
                    <div class="stakes-pill">
                      <span>⚖️ {crisis.stakes}</span>
                    </div>
                    <div class="reward-pill">
                      <span>⭐ S-Rank: {crisis.duo_art_reward.replace(/_/g, ' ').toUpperCase()}</span>
                    </div>
                  </div>

                  <div class="crisis-action-row">
                    {#if crisis.status === 'resolved'}
                      <div class="resolution-summary">
                        <span>Chosen Path: <strong>{crisis.resolution?.choice_label || 'Resolved'}</strong></span>
                        {#if crisis.resolution?.duo_art_awarded}
                          <span class="duo-awarded-tag">✦ Duo Art Unlocked</span>
                        {/if}
                      </div>
                    {:else}
                      <button
                        type="button"
                        class="btn-engage-crisis"
                        onclick={() => startCrisisSSE(crisis)}
                      >
                        ✨ Confront Personal Crisis (SSE Cutscene)
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

      <!-- NEMESIS & FACTION INTELLIGENCE TAB -->
      {:else if activeTab === 'nemesis'}
        <div class="nemesis-tab-content">
          <div class="nemesis-header-banner">
            <div class="banner-title-box">
              <h3>💀 Living Nemesis & Faction Intelligence</h3>
              <p class="banner-desc">
                Track adversary commanders who have survived your encounters, nursing blood grudges and scars. Monitor your standing with the four grand factions of Twisted.
              </p>
            </div>
            <button
              type="button"
              class="btn-refresh-dossier"
              disabled={nemesisLoading}
              onclick={loadNemesis}
            >
              🔄 Refresh Intel
            </button>
          </div>

          {#if nemesisNotice}
            <div class="nemesis-notice-banner">
              <span>{nemesisNotice}</span>
              <button type="button" class="btn-close-notice" onclick={() => (nemesisNotice = null)}>✕</button>
            </div>
          {/if}

          <!-- SECTION 1: THE FOUR GRAND FACTIONS -->
          <div class="factions-section">
            <div class="section-head">
              <h4>🏛️ Realm Faction Standings</h4>
              <span class="section-sub">Alignment, trade discounts, and regional perks</span>
            </div>

            <div class="factions-grid">
              {#each factionsList as fac (fac.key)}
                {@const tier = fac.tier_info?.tier || 'Neutral'}
                {@const standing = fac.standing || 0}
                <div class="faction-card" style="--fac-accent: {fac.color || '#c9a14a'};">
                  <div class="fac-card-head">
                    <span class="fac-icon">{fac.icon}</span>
                    <div class="fac-title-col">
                      <h6>{fac.name}</h6>
                      <span class="fac-role">{fac.title}</span>
                    </div>
                    <span class="fac-tier-badge tier-{tier.toLowerCase()}">
                      {fac.tier_info?.icon || '⚖️'} {tier}
                    </span>
                  </div>

                  <p class="fac-desc">{fac.description}</p>

                  <div class="standing-bar-wrapper">
                    <div class="standing-labels">
                      <span class="std-val">{standing > 0 ? `+${standing}` : standing} / 100</span>
                      <span class="shop-mult-tag">Trade: {fac.tier_info?.shop_mult ? `${Math.round(fac.tier_info.shop_mult * 100)}%` : '100%'}</span>
                    </div>
                    <div class="standing-meter-track">
                      <div
                        class="standing-meter-fill"
                        style="width: {Math.max(5, Math.min(100, (standing + 100) / 2))}%; background: {fac.color};"
                      ></div>
                    </div>
                  </div>

                  <div class="fac-perk-box">
                    <span class="perk-label">Faction Perk:</span>
                    <p class="perk-desc">{fac.tier_info?.perk || 'Standard trade relations.'}</p>
                  </div>

                  <div class="fac-actions-row">
                    <button
                      type="button"
                      class="btn-fac-shift"
                      onclick={() => shiftFaction(fac.key, 10)}
                      title="Complete Guild Contract (+10 Reputation)"
                    >
                      🤝 Aid Faction (+10)
                    </button>
                    <button
                      type="button"
                      class="btn-fac-shift condemn"
                      onclick={() => shiftFaction(fac.key, -10)}
                      title="Raid Outpost (-10 Reputation)"
                    >
                      ⚔️ Raid Outpost (-10)
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <!-- SECTION 2: LIVING NEMESIS ROSTER -->
          <div class="nemesis-section">
            <div class="section-head">
              <h4>⚔️ Recurring Nemesis Commanders</h4>
              <span class="section-sub">Scars, personal grudges, and living combat memories</span>
            </div>

            <div class="nemesis-grid">
              {#each nemesisRoster as nem (nem.id)}
                {@const isSlain = nem.status === 'slain'}
                <div class="nemesis-card" class:slain={isSlain}>
                  <div class="nem-top-row">
                    <div class="nem-avatar-box">
                      <span class="nem-icon">{nem.archetype === 'pyromancer' ? '🔥' : nem.archetype === 'assassin' ? '🗡️' : '⚔️'}</span>
                      <span class="nem-lvl">Lv.{nem.level}</span>
                    </div>
                    <div class="nem-name-col">
                      <strong class="nem-name">{nem.name}</strong>
                      <span class="nem-title">{nem.title} · {nem.faction.replace(/_/g, ' ')}</span>
                    </div>
                    {#if isSlain}
                      <span class="badge-slain">☠️ SLAIN</span>
                    {:else}
                      <div class="grudge-flame-meter" title="Grudge Level {nem.grudge_level} / 5">
                        {#each Array(nem.grudge_level || 1) as _}
                          <span class="grudge-skull">🔥</span>
                        {/each}
                        <span class="grudge-num">Grudge {nem.grudge_level}/5</span>
                      </div>
                    {/if}
                  </div>

                  <!-- Scars & Battle History -->
                  <div class="nem-scars-row">
                    <span class="history-label">Battle Scars:</span>
                    <div class="scars-chips-list">
                      {#each nem.scars || [] as scar}
                        <span class="scar-chip" title="{scar.desc || ''}">
                          ⚡ {scar.name}
                        </span>
                      {/each}
                      {#if (!nem.scars || nem.scars.length === 0)}
                        <span class="no-scars-text">No permanent scars yet.</span>
                      {/if}
                    </div>
                  </div>

                  <!-- Special Traits -->
                  <div class="nem-traits-row">
                    <span class="history-label">Tactical Traits:</span>
                    <div class="traits-chips-list">
                      {#each nem.traits || [] as trait}
                        <span class="trait-chip">✦ {trait}</span>
                      {/each}
                    </div>
                  </div>

                  <!-- Living Voice Quote Box -->
                  {#if nem.living_dialogue?.ambush}
                    <div class="living-quote-bubble">
                      <span class="quote-icon">🗯️</span>
                      <p>"{nem.living_dialogue.ambush}"</p>
                      <button
                        type="button"
                        class="voice-play-mini"
                        title="Hear Nemesis Voice"
                        onclick={() => livingVoice.play({ speaker: nem.name, body: nem.living_dialogue.ambush })}
                      >
                        🔊
                      </button>
                    </div>
                  {/if}

                  <!-- Interactive Encounter Sandbox Actions -->
                  {#if !isSlain}
                    <div class="nem-simulation-toolbar">
                      <span class="sim-label">Encounter Outcome:</span>
                      <div class="sim-btn-group">
                        <button
                          type="button"
                          class="btn-sim escape"
                          onclick={() => simulateNemesisEncounter(nem.id, 'escaped')}
                          title="Nemesis flees, acquiring new scars and higher grudge"
                        >
                          🏃 Nemesis Flees (+Grudge & Scar)
                        </button>
                        <button
                          type="button"
                          class="btn-sim player-down"
                          onclick={() => simulateNemesisEncounter(nem.id, 'player_defeated')}
                          title="Nemesis defeats player and is promoted to Slayer"
                        >
                          💀 Down Player (Promoted)
                        </button>
                        <button
                          type="button"
                          class="btn-sim execute"
                          onclick={() => simulateNemesisEncounter(nem.id, 'executed')}
                          title="Permanently execute Nemesis and claim realm valor"
                        >
                          🏆 Execute Nemesis
                        </button>
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- EMERGENCY NIGHT AMBUSH OVERLAY MODAL -->
    {#if ambushActive && ambushEnemy}
      <div class="ambush-overlay-backdrop" role="alertdialog" aria-modal="true">
        <div class="ambush-modal">
          <div class="ambush-alert-stripe">
            <span class="pulse-alert">⚠️</span>
            <h3>CAMP DEFENSE: MIDNIGHT AMBUSH!</h3>
            <span class="pulse-alert">⚠️</span>
          </div>

          <div class="ambush-body">
            <div class="ambush-enemy-card">
              <span class="enemy-giant-icon">{ambushEnemy.icon}</span>
              <div class="enemy-details">
                <div class="enemy-name-row">
                  <h4>{ambushEnemy.name}</h4>
                  <span class="threat-badge threat-{(ambushEnemy.threatLevel || ambushEnemy.threat || 'deadly').toLowerCase()}">
                    Threat: {ambushEnemy.threatLevel || ambushEnemy.threat || 'Deadly'}
                  </span>
                </div>
                <p class="enemy-desc">{ambushEnemy.description || `Pack of ${ambushEnemy.count} predators encircling the campfire!`}</p>
                <div class="clothes-modifier-pill">
                  <span>👘 {ambushEnemy.clothesModifier || 'Companions defending in night garments! Dual Guard & Strike online!'}</span>
                </div>
              </div>
            </div>

            {#if ambushMessage}
              <div class="ambush-flavor-alert">
                <span>🔥 {ambushMessage}</span>
              </div>
            {/if}

            <div class="tactical-choices-area">
              <h5>Choose Your Night Defense Tactics:</h5>
              <div class="tactics-buttons-list">
                {#each ambushTacticalOptions as opt (opt.id)}
                  <button
                    type="button"
                    class="tactic-btn"
                    disabled={ambushResolving}
                    onclick={() => resolveAmbushAction(opt.id)}
                  >
                    <span class="tactic-icon">{opt.icon}</span>
                    <div class="tactic-text-col">
                      <span class="tactic-label">{opt.label}</span>
                      <span class="tactic-synergy">{opt.synergy || opt.desc}</span>
                    </div>
                  </button>
                {/each}
              </div>
            </div>

            {#if ambushResolving}
              <div class="resolving-indicator">
                <span class="loading-spin">⚔️</span>
                <span>Repelling night assault in camp garments with companion synergies...</span>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .camp-overlay-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(8, 7, 12, 0.88);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
    padding: 1rem;
    animation: fadeIn 200ms ease-out;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .camp-modal {
    width: 100%;
    max-width: 880px;
    background: radial-gradient(circle at 50% 10%, #1a1724 0%, #0d0c13 100%);
    border: 1px solid #3d3526;
    border-radius: 12px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8), 0 0 32px rgba(201, 161, 74, 0.15);
    display: flex;
    flex-direction: column;
    max-height: 90vh;
    overflow: hidden;
    color: #e5edf5;
    font-family: inherit;
  }
  .camp-modal.inn-mode {
    background: radial-gradient(circle at 50% 10%, #221a14 0%, #0d0b09 100%);
    border-color: #553e1e;
  }

  .camp-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.85rem 1.25rem;
    background: rgba(14, 13, 20, 0.95);
    border-bottom: 1px solid #2d261e;
  }
  .camp-title-row {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .location-badge-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .switch-loc-btn {
    background: rgba(201, 161, 74, 0.15);
    border: 1px solid rgba(201, 161, 74, 0.35);
    color: #e5cf96;
    font-size: 0.68rem;
    font-weight: 600;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    cursor: pointer;
    transition: all 140ms ease;
  }
  .switch-loc-btn:hover {
    background: rgba(201, 161, 74, 0.3);
    color: #fff;
    border-color: #c9a14a;
  }
  .location-badge {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #c9a14a;
    font-weight: 700;
  }
  .camp-title-row h2 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1.25rem;
    color: #f3efe6;
    margin: 0;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .sse-soul-badge {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.25rem 0.6rem;
    background: rgba(153, 69, 255, 0.12);
    border: 1px solid rgba(153, 69, 255, 0.35);
    border-radius: 999px;
    font-size: 0.72rem;
    color: #dfc8ff;
    font-weight: 600;
  }
  .sse-soul-badge .pulse-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #b66dff;
    box-shadow: 0 0 8px #b66dff;
    animation: pulse 1.6s infinite ease-in-out;
  }
  .voice-anim {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 14px;
  }
  .voice-anim .bar {
    width: 2px;
    background: #c9a14a;
    border-radius: 1px;
    transition: height 80ms ease;
  }
  .voice-toggle-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0;
    line-height: 1;
    opacity: 0.85;
    transition: opacity 120ms ease;
  }
  .voice-toggle-btn:hover {
    opacity: 1;
  }
  .quote-speak-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    padding: 0.1rem 0.35rem;
    font-size: 0.75rem;
    cursor: pointer;
    margin-left: 0.4rem;
    vertical-align: middle;
    transition: all 120ms ease;
  }
  .quote-speak-btn:hover {
    background: rgba(201, 161, 74, 0.3);
    border-color: #c9a14a;
  }
  .voice-replay-btn {
    background: rgba(153, 69, 255, 0.15);
    border: 1px solid rgba(153, 69, 255, 0.4);
    color: #e3d2ff;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.2rem 0.55rem;
    border-radius: 4px;
    cursor: pointer;
    margin-left: auto;
    transition: all 140ms ease;
  }
  .voice-replay-btn:hover {
    background: rgba(153, 69, 255, 0.3);
    border-color: #bb86fc;
    color: #fff;
  }
  .voice-replay-btn.mini {
    padding: 0.1rem 0.35rem;
    font-size: 0.68rem;
  }
  .nav-tabs {
    display: flex;
    gap: 0.35rem;
    background: #111018;
    padding: 0.2rem;
    border-radius: 999px;
    border: 1px solid #2e2838;
  }
  .tab-btn {
    background: transparent;
    border: 1px solid transparent;
    color: #9c9488;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.3rem 0.75rem;
    border-radius: 999px;
    cursor: pointer;
    transition: all 140ms ease;
  }
  .tab-btn:hover { color: #fff; }
  .tab-btn.active {
    background: #c9a14a;
    color: #1a1208;
    font-weight: 700;
  }
  .close-btn {
    background: transparent;
    border: 1px solid #3a3246;
    color: #8a8274;
    font-size: 1rem;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .close-btn:hover { color: #fff; border-color: #ff6b6b; }

  .camp-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    color: #bfa879;
    font-family: 'Cinzel', Georgia, serif;
  }
  .loading-spin {
    font-size: 2.5rem;
    animation: pulse 1.5s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    from { transform: scale(0.9); filter: drop-shadow(0 0 4px #ffd700); }
    to { transform: scale(1.15); filter: drop-shadow(0 0 16px #ff8833); }
  }

  /* CAMPGROUND VIEW */
  .ambient-hearth-banner {
    position: relative;
    background: linear-gradient(135deg, rgba(35, 27, 20, 0.9) 0%, rgba(18, 16, 26, 0.9) 100%);
    border: 1px solid #5a4422;
    border-radius: 8px;
    padding: 1rem 1.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.25rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }
  .hearth-text {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: #e2d9c8;
    line-height: 1.4;
    flex: 1;
  }
  .hearth-spark { font-size: 1.2rem; }
  .primary-cutscene-trigger {
    background: linear-gradient(135deg, #c9a14a 0%, #9e7a2b 100%);
    color: #171107;
    border: none;
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 700;
    font-size: 0.8125rem;
    padding: 0.6rem 1.1rem;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 140ms ease;
    box-shadow: 0 0 12px rgba(201, 161, 74, 0.35);
  }
  .primary-cutscene-trigger:hover {
    background: #dfb356;
    transform: translateY(-1px);
    box-shadow: 0 0 18px rgba(201, 161, 74, 0.6);
  }

  .companions-section {
    margin-bottom: 1.25rem;
  }
  .section-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.875rem;
    color: #c9a14a;
    margin-bottom: 0.75rem;
  }
  .title-hint { font-size: 0.7rem; color: #8e887d; font-family: sans-serif; }

  .companions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 0.75rem;
  }
  .companion-camp-card {
    background: #14131d;
    border: 1px solid #2e2838;
    border-radius: 8px;
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    transition: all 140ms ease;
  }
  .companion-camp-card:hover {
    border-color: #c9a14a;
    background: #1b1926;
  }
  .comp-card-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .comp-icon { font-size: 1.4rem; }
  .comp-names {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .comp-name {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.875rem;
    font-weight: 700;
    color: #f3efe6;
  }
  .comp-title {
    font-size: 0.6875rem;
    color: #8e887d;
  }
  .affinity-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    background: rgba(255, 105, 180, 0.1);
    border: 1px solid rgba(255, 105, 180, 0.25);
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    font-size: 0.6875rem;
    color: #ff80b3;
    font-weight: 700;
  }

  .camp-attire-badge {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: #191824;
    border: 1px solid #332d42;
    padding: 0.2rem 0.45rem;
    border-radius: 4px;
    font-size: 0.6875rem;
    color: #cbd5e1;
  }
  .comp-quote {
    font-size: 0.75rem;
    font-style: italic;
    color: #a49e92;
    margin: 0;
    line-height: 1.35;
  }

  .camp-actions-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #111018;
    border: 1px solid #2d261e;
    border-radius: 8px;
    padding: 0.75rem 1.25rem;
  }
  .rest-cost-info { font-size: 0.8125rem; color: #bfa879; }
  .gold-text { color: #ffd700; }
  .free-text { color: #70d890; }
  .btn-rest {
    background: #255a38;
    color: #ffffff;
    border: 1px solid #3c8052;
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 700;
    font-size: 0.8125rem;
    padding: 0.55rem 1.25rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 140ms ease;
  }
  .btn-rest:hover {
    background: #2f7347;
    box-shadow: 0 0 12px rgba(76, 175, 80, 0.4);
  }
  .rest-done-msg {
    color: #70d890;
    font-weight: 700;
    font-size: 0.8125rem;
  }

  /* SSE CUTSCENE STAGE */
  .cutscene-stage {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .stage-title-banner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    text-align: center;
  }
  .stage-badge {
    font-size: 0.6rem;
    letter-spacing: 0.1em;
    color: #ffd700;
    background: rgba(255, 215, 0, 0.1);
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 215, 0, 0.25);
  }
  .stage-title-banner h3 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1.3rem;
    color: #f3efe6;
    margin: 0;
  }

  .narrative-stream-box {
    background: #0e0d14;
    border: 1px solid #322b3e;
    border-radius: 8px;
    padding: 1rem 1.25rem;
    position: relative;
    box-shadow: inset 0 0 16px rgba(0,0,0,0.7);
  }
  .narrative-box-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.6rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .narrator-title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 700;
    color: #c9a14a;
  }
  .narrator-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .narrator-speak-btn {
    background: rgba(201, 161, 74, 0.2);
    border: 1px solid #c9a14a;
    color: #fff;
    font-size: 0.72rem;
    font-weight: 700;
    padding: 0.2rem 0.6rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 140ms ease;
  }
  .narrator-speak-btn:hover {
    background: rgba(201, 161, 74, 0.4);
    box-shadow: 0 0 8px rgba(201, 161, 74, 0.4);
  }
  .auto-narrate-btn {
    background: transparent;
    border: 1px solid #3d3549;
    color: #8a8274;
    font-size: 0.68rem;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 120ms ease;
  }
  .auto-narrate-btn.active {
    background: rgba(112, 216, 144, 0.15);
    border-color: #70d890;
    color: #70d890;
    font-weight: 600;
  }
  .live-stream-beacon {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.6875rem;
    color: #ffd700;
    margin-bottom: 0.5rem;
  }
  .pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ffd700;
    animation: blink 1s infinite alternate;
  }
  @keyframes blink {
    from { opacity: 0.3; transform: scale(0.8); }
    to { opacity: 1; transform: scale(1.2); }
  }
  .stream-text {
    font-size: 0.875rem;
    line-height: 1.6;
    color: #d8d0c0;
    margin: 0;
    font-family: Georgia, serif;
  }
  .typewriter-cursor {
    color: #ffd700;
    animation: blink 600ms infinite;
  }

  .dialogue-spotlight-card {
    background: linear-gradient(135deg, rgba(28, 24, 38, 0.95), rgba(16, 14, 22, 0.95));
    border: 1px solid #c9a14a;
    border-radius: 8px;
    padding: 1rem 1.25rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    animation: slideUp 200ms ease;
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .speaker-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.5rem;
  }
  .speaker-portrait { font-size: 1.6rem; }
  .speaker-meta { display: flex; flex-direction: column; }
  .speaker-name {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.95rem;
    font-weight: 700;
    color: #ffd700;
  }
  .speaker-pose { font-size: 0.6875rem; color: #8a8274; }
  .speaker-body {
    font-size: 0.875rem;
    line-height: 1.5;
    color: #f3efe6;
    margin: 0;
  }

  .companion-reply-card {
    background: #14131d;
    border: 1px solid #4a3e5c;
    border-radius: 8px;
    padding: 0.85rem 1.1rem;
    animation: fadeIn 200ms ease;
  }
  .reply-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: #c9a14a;
    margin-bottom: 0.35rem;
  }
  .reply-text {
    font-size: 0.8125rem;
    line-height: 1.45;
    color: #e5edf5;
    margin: 0 0 0.5rem 0;
  }
  .affinity-toast {
    display: inline-flex;
    align-items: center;
    background: rgba(76, 175, 80, 0.15);
    border: 1px solid rgba(76, 175, 80, 0.3);
    color: #70d890;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
  }

  .choices-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .choices-prompt {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.8125rem;
    color: #bfa879;
  }
  .choices-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .choice-btn {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #181622;
    border: 1px solid #332d42;
    border-radius: 6px;
    padding: 0.6rem 0.9rem;
    color: #cbd5e1;
    font-size: 0.8125rem;
    text-align: left;
    cursor: pointer;
    transition: all 140ms ease;
  }
  .choice-btn:hover {
    border-color: #ffd700;
    background: #231f32;
    color: #ffffff;
    transform: translateX(3px);
  }
  .choice-tone {
    font-size: 0.6875rem;
    color: #ffd700;
    font-style: italic;
  }

  .cutscene-footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding-top: 0.75rem;
    border-top: 1px solid #282434;
  }
  .tab-notification-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ffd700;
    box-shadow: 0 0 6px #ffd700;
    margin-left: 0.3rem;
    animation: blink 1.2s infinite alternate;
  }

  /* ── ENSEMBLE TIMELINE & MULTI-SPEAKER BANTER ─────────────────── */
  .ensemble-timeline {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.75rem;
    animation: fadeIn 220ms ease;
  }
  .timeline-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #2e283b;
    padding-bottom: 0.35rem;
  }
  .timeline-tag {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #c9a14a;
    font-weight: 700;
  }
  .timeline-count {
    font-size: 0.6875rem;
    color: #8a8274;
  }
  .dialogue-beats-list {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    max-height: 280px;
    overflow-y: auto;
    padding-right: 0.4rem;
  }
  .dialogue-beat-row {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    animation: slideUp 200ms ease;
  }
  .dialogue-beat-row.innkeeper .beat-bubble {
    border-color: #8d6e63;
    background: rgba(43, 31, 26, 0.6);
  }
  .beat-avatar-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    min-width: 38px;
  }
  .beat-avatar {
    font-size: 1.6rem;
  }
  .beat-step-pill {
    font-size: 0.6rem;
    background: rgba(201, 161, 74, 0.15);
    color: #c9a14a;
    padding: 0.05rem 0.3rem;
    border-radius: 999px;
    font-weight: 700;
  }
  .beat-bubble {
    flex: 1;
    background: #15131f;
    border: 1px solid #363046;
    border-radius: 8px;
    padding: 0.6rem 0.85rem;
  }
  .beat-head {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin-bottom: 0.25rem;
  }
  .beat-speaker-name {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.8125rem;
    font-weight: 700;
    color: #ffd700;
  }
  .beat-emote-pill {
    font-size: 0.625rem;
    color: #9c9280;
    background: rgba(255, 255, 255, 0.06);
    padding: 0.05rem 0.35rem;
    border-radius: 4px;
    text-transform: capitalize;
  }
  .beat-body {
    font-size: 0.8125rem;
    line-height: 1.45;
    color: #e6e2da;
    margin: 0;
  }

  /* ── MULTI-AFFINITY CHOICES & REACTIONS ──────────────────────── */
  .choice-main-line {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }
  .choice-affinity-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.35rem;
  }
  .aff-chip {
    font-size: 0.6875rem;
    font-weight: 700;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.08);
  }
  .aff-chip.pos {
    background: rgba(76, 175, 80, 0.2);
    color: #70d890;
    border: 1px solid rgba(76, 175, 80, 0.4);
  }
  .aff-chip.neg {
    background: rgba(244, 67, 54, 0.2);
    color: #ff7b72;
    border: 1px solid rgba(244, 67, 54, 0.4);
  }

  .companion-reactions-block {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    background: #14121d;
    border: 1px solid #3a324a;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    animation: fadeIn 200ms ease;
  }
  .reactions-title {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.75rem;
    color: #c9a14a;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .reactions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.6rem;
  }
  .reaction-card {
    background: #1a1826;
    border: 1px solid #453c58;
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
  }
  .reaction-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.3rem;
  }
  .reaction-portrait { font-size: 1.25rem; }
  .reaction-speaker-meta {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .reaction-name {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.75rem;
    font-weight: 700;
    color: #ffd700;
  }
  .reaction-delta-badge {
    font-size: 0.65rem;
    font-weight: 700;
  }
  .reaction-delta-badge.pos { color: #70d890; }
  .reaction-delta-badge.neg { color: #ff7b72; }
  .reaction-reply {
    font-size: 0.78rem;
    line-height: 1.4;
    color: #ded7cb;
    margin: 0;
    font-style: italic;
  }

  /* ── FIRE EMBLEM SUPPORT BONDS STAGE ─────────────────────────── */
  .supports-stage {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    animation: fadeIn 200ms ease;
  }
  .supports-banner {
    display: flex;
    align-items: center;
    gap: 1rem;
    background: linear-gradient(135deg, rgba(32, 28, 44, 0.85), rgba(20, 18, 28, 0.85));
    border: 1px solid #4a3e2c;
    border-radius: 8px;
    padding: 1rem 1.25rem;
  }
  .banner-crest {
    font-size: 2.2rem;
  }
  .banner-text h3 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1.1rem;
    color: #ffd700;
    margin: 0 0 0.35rem 0;
  }
  .banner-text p {
    font-size: 0.8125rem;
    line-height: 1.45;
    color: #c5bcae;
    margin: 0;
  }

  .no-supports-card {
    text-align: center;
    padding: 2rem;
    color: #8a8274;
    font-size: 0.875rem;
  }

  .support-pairs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1rem;
  }
  .support-card {
    background: #15131f;
    border: 1px solid #332d42;
    border-radius: 10px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    transition: all 160ms ease;
  }
  .support-card.can-unlock {
    border-color: #c9a14a;
    box-shadow: 0 0 16px rgba(201, 161, 74, 0.2);
  }
  .pair-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .pair-icons {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .pair-icon-badge {
    font-size: 1.5rem;
  }
  .pair-link-symbol {
    font-size: 0.9rem;
    color: #ffd700;
  }
  .pair-rank-badge {
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    font-weight: 800;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .pair-rank-badge.rank-c {
    background: rgba(144, 164, 174, 0.2);
    border: 1px solid #90a4ae;
    color: #cfd8dc;
  }
  .pair-rank-badge.rank-b {
    background: rgba(76, 175, 80, 0.2);
    border: 1px solid #4caf50;
    color: #81c784;
  }
  .pair-rank-badge.rank-a {
    background: rgba(33, 150, 243, 0.2);
    border: 1px solid #2196f3;
    color: #64b5f6;
  }
  .pair-rank-badge.rank-s {
    background: rgba(255, 215, 0, 0.25);
    border: 1px solid #ffd700;
    color: #ffd700;
    box-shadow: 0 0 8px rgba(255, 215, 0, 0.4);
  }

  .pair-card-body {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .pair-names {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.95rem;
    color: #f3efe6;
    margin: 0;
  }
  .pair-rel-tag {
    font-size: 0.7rem;
    color: #bfa879;
    font-style: italic;
  }

  .bond-meter-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .bond-meter-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.6875rem;
  }
  .meter-caption { color: #9c9280; }
  .meter-values { color: #ffd700; font-weight: 700; }
  .bond-meter-track {
    width: 100%;
    height: 8px;
    background: #0d0c14;
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid #282334;
  }
  .bond-meter-fill {
    height: 100%;
    background: linear-gradient(90deg, #c9a14a, #ffd700);
    border-radius: 999px;
    transition: width 300ms ease;
  }

  .synergy-box {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    background: #0d0c14;
    border: 1px solid #262132;
    border-radius: 6px;
    padding: 0.55rem 0.75rem;
  }
  .synergy-row {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .synergy-row.next {
    border-top: 1px dashed #282334;
    padding-top: 0.3rem;
  }
  .synergy-badge {
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
  }
  .synergy-badge.active { color: #70d890; }
  .synergy-badge.next { color: #bfa879; }
  .synergy-desc {
    font-size: 0.75rem;
    color: #e5edf5;
    line-height: 1.35;
  }

  .pair-card-actions {
    margin-top: auto;
    padding-top: 0.5rem;
  }
  .btn-watch-support {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 150ms ease;
  }
  .btn-watch-support.ready {
    background: linear-gradient(135deg, #c9a14a, #8f6f26);
    border: 1px solid #ffd700;
    color: #ffffff;
    box-shadow: 0 2px 10px rgba(201, 161, 74, 0.4);
  }
  .btn-watch-support.ready:hover {
    background: linear-gradient(135deg, #d8b25b, #9f7e2d);
    transform: translateY(-1px);
  }
  .btn-watch-support.replay {
    background: #1e1b29;
    border: 1px solid #3e364f;
    color: #bbb3a6;
  }
  .btn-watch-support.replay:hover {
    background: #282436;
    border-color: #ffd700;
    color: #ffffff;
  }

  /* ── 1-ON-1 SUPPORT CONVERSATION THEATRE ──────────────────────── */
  .support-theatre-card {
    background: #14121d;
    border: 1px solid #4a3e2c;
    border-radius: 10px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    animation: fadeIn 200ms ease;
  }
  .theatre-top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #2e283b;
    padding-bottom: 0.6rem;
  }
  .theatre-meta {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .theatre-crest { font-size: 1.8rem; }
  .theatre-titles h4 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1rem;
    color: #ffd700;
    margin: 0;
  }
  .theatre-subtitle {
    font-size: 0.72rem;
    color: #8a8274;
  }
  .theatre-close-btn {
    background: #1f1b2b;
    border: 1px solid #3e364f;
    color: #bbb3a6;
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .theatre-close-btn:hover {
    border-color: #ffd700;
    color: #ffffff;
  }

  .narrative-stream-box.support-mode {
    border-color: #4a3e2c;
  }

  .support-dialogue-feed {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    max-height: 280px;
    overflow-y: auto;
    padding-right: 0.35rem;
  }
  .support-dialogue-card {
    background: #191724;
    border: 1px solid #383049;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    animation: slideUp 200ms ease;
  }
  .support-dialogue-card.alt-speaker {
    background: #1d1927;
    border-color: #4a3e5c;
    margin-left: 1.5rem;
  }
  .beat-speaker-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.35rem;
  }
  .beat-dialogue-body {
    font-size: 0.84rem;
    line-height: 1.45;
    color: #f3efe6;
    margin: 0;
  }

  .streaming-indicator {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: #ffd700;
    padding: 0.4rem 0;
  }

  .support-action-footer {
    display: flex;
    justify-content: center;
    padding-top: 0.6rem;
    border-top: 1px solid #282334;
  }
  .promotion-ready-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    background: rgba(201, 161, 74, 0.12);
    border: 1px solid #c9a14a;
    border-radius: 8px;
    padding: 0.75rem 1.1rem;
  }
  .ready-info {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .ready-tag {
    font-size: 0.625rem;
    color: #70d890;
    font-weight: 700;
  }
  .ready-info h5 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.95rem;
    color: #ffd700;
    margin: 0;
  }
  .ready-synergy-preview {
    font-size: 0.75rem;
    color: #e5edf5;
  }
  .btn-promote-confirm {
    background: linear-gradient(135deg, #ffd700, #c9a14a);
    border: 1px solid #ffffff;
    color: #0d0c13;
    font-weight: 800;
    font-size: 0.85rem;
    padding: 0.6rem 1.1rem;
    border-radius: 6px;
    cursor: pointer;
    box-shadow: 0 2px 12px rgba(255, 215, 0, 0.4);
    transition: transform 140ms ease;
  }
  .btn-promote-confirm:hover {
    transform: scale(1.03);
  }

  .promotion-success-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
    background: rgba(76, 175, 80, 0.15);
    border: 1px solid #4caf50;
    border-radius: 8px;
    padding: 0.85rem 1.25rem;
  }
  .promo-trophy { font-size: 2rem; }
  .promo-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .promo-details h5 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.95rem;
    color: #70d890;
    margin: 0;
  }
  .promo-details p {
    font-size: 0.8rem;
    color: #e5edf5;
    margin: 0;
  }
  .btn-claim-back {
    background: #1f1b2b;
    border: 1px solid #4caf50;
    color: #70d890;
    font-weight: 700;
    font-size: 0.78rem;
    padding: 0.5rem 0.9rem;
    border-radius: 6px;
    cursor: pointer;
  }
  .btn-claim-back:hover {
    background: #2a2538;
  }
  .support-status-hint {
    font-size: 0.75rem;
    color: #8a8274;
    font-style: italic;
  }

  /* ── BIOME ATMOSPHERE & PARTICLES LAYER ───────────────────────── */
  .camp-modal.biome-snow {
    border-color: #4a6b82;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8), 0 0 36px rgba(100, 180, 255, 0.18);
  }
  .camp-modal.biome-swamp {
    border-color: #3b4e34;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8), 0 0 36px rgba(90, 140, 70, 0.18);
  }
  .camp-modal.biome-volcanic {
    border-color: #6b2e1e;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8), 0 0 36px rgba(255, 80, 40, 0.22);
  }
  .camp-modal.biome-desert {
    border-color: #6b532e;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8), 0 0 36px rgba(230, 170, 60, 0.2);
  }
  .camp-modal.biome-coastal {
    border-color: #2b556b;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8), 0 0 36px rgba(50, 150, 220, 0.2);
  }
  .camp-modal.biome-forest {
    border-color: #2d5a37;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8), 0 0 36px rgba(60, 180, 90, 0.18);
  }

  .biome-particles-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 1;
  }
  .p-elem {
    position: absolute;
    border-radius: 50%;
    opacity: 0.5;
    animation: particleDrift 8s infinite ease-in-out alternate;
  }
  .p1 { width: 5px; height: 5px; top: 15%; left: 20%; animation-delay: 0s; }
  .p2 { width: 6px; height: 6px; top: 35%; left: 75%; animation-delay: 1.5s; }
  .p3 { width: 4px; height: 4px; top: 60%; left: 30%; animation-delay: 3s; }
  .p4 { width: 7px; height: 7px; top: 75%; left: 80%; animation-delay: 2s; }
  .p5 { width: 4px; height: 4px; top: 25%; left: 55%; animation-delay: 4.2s; }
  .p6 { width: 6px; height: 6px; top: 85%; left: 45%; animation-delay: 1s; }

  .biome-particles-layer.fireflies .p-elem { background: #d4e157; box-shadow: 0 0 8px #eeff41; }
  .biome-particles-layer.snow .p-elem { background: #e0f7fa; box-shadow: 0 0 6px #ffffff; }
  .biome-particles-layer.rain .p-elem { background: #80d8ff; height: 12px; width: 2px; border-radius: 2px; }
  .biome-particles-layer.embers .p-elem { background: #ff7043; box-shadow: 0 0 8px #ffab91; }
  .biome-particles-layer.mist .p-elem { background: rgba(176, 190, 197, 0.4); filter: blur(3px); width: 24px; height: 24px; }
  .biome-particles-layer.sand .p-elem { background: #ffe082; box-shadow: 0 0 4px #ffca28; }

  @keyframes particleDrift {
    0% { transform: translateY(0) translateX(0); opacity: 0.3; }
    50% { transform: translateY(-20px) translateX(15px); opacity: 0.8; }
    100% { transform: translateY(-40px) translateX(-10px); opacity: 0.2; }
  }

  .tab-buff-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ffaa33;
    box-shadow: 0 0 6px #ffaa33;
    margin-left: 0.35rem;
  }

  /* ── LIVE BIOME & WEATHER ENVIRONMENT STRIP ───────────────────── */
  .biome-env-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.85rem;
    z-index: 2;
    position: relative;
  }
  .env-chip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(20, 18, 28, 0.85);
    border: 1px solid #3d354a;
    border-radius: 8px;
    padding: 0.4rem 0.75rem;
  }
  .env-chip.biome-chip { border-color: #5c4e36; }
  .env-chip.weather-chip { border-color: #3e4a5c; }
  .env-chip.meal-buff-chip {
    border-color: #ff9933;
    background: rgba(255, 153, 51, 0.12);
  }
  .env-chip.meal-empty-chip {
    border-style: dashed;
    border-color: #4a443a;
  }
  .env-icon { font-size: 1.2rem; }
  .env-text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .env-label {
    font-size: 0.6rem;
    color: #8a8274;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
  }
  .env-val {
    font-size: 0.78rem;
    color: #f3efe6;
  }
  .cook-prompt-btn {
    background: none;
    border: none;
    color: #ffd700;
    font-size: 0.75rem;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }
  .cook-prompt-btn:hover {
    color: #ffffff;
  }

  /* ── AMBUSH VICTORY BANNER ────────────────────────────────────── */
  .ambush-victory-banner {
    display: flex;
    align-items: center;
    gap: 1rem;
    background: rgba(46, 125, 50, 0.18);
    border: 1px solid #4caf50;
    border-radius: 10px;
    padding: 0.85rem 1.15rem;
    margin-bottom: 0.85rem;
    box-shadow: 0 4px 16px rgba(76, 175, 80, 0.2);
    animation: fadeIn 250ms ease;
  }
  .victory-icon { font-size: 2rem; }
  .victory-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .victory-tag {
    font-size: 0.625rem;
    font-weight: 800;
    color: #70d890;
    letter-spacing: 0.08em;
  }
  .victory-content h4 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1rem;
    color: #70d890;
    margin: 0;
  }
  .victory-msg {
    font-size: 0.8rem;
    color: #e5edf5;
    margin: 0;
  }
  .guard-victory-quote {
    font-style: italic;
    color: #ffd700;
    font-size: 0.78rem;
    margin: 0.2rem 0;
  }
  .victory-rewards {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.35rem;
  }
  .reward-xp, .reward-bond, .reward-loot {
    font-size: 0.72rem;
    font-weight: 700;
    border-radius: 4px;
    padding: 0.15rem 0.45rem;
  }
  .reward-xp { background: rgba(255, 215, 0, 0.2); color: #ffd700; }
  .reward-bond { background: rgba(255, 105, 180, 0.2); color: #ff85c0; }
  .reward-loot { background: rgba(138, 43, 226, 0.2); color: #d19fe8; }

  /* ── WILDERNESS NIGHT WATCH SENTRY SECTION ─────────────────────── */
  .night-watch-section {
    background: rgba(18, 16, 26, 0.85);
    border: 1px solid #383049;
    border-radius: 10px;
    padding: 0.75rem 1rem;
    margin-top: 0.75rem;
  }
  .watch-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.6rem;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .watch-title-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .watch-badge {
    font-size: 0.7rem;
    font-weight: 800;
    color: #70b8ff;
    letter-spacing: 0.06em;
  }
  .watch-sub {
    font-size: 0.72rem;
    color: #8a8274;
  }
  .current-watch-tag {
    font-size: 0.72rem;
    color: #e5edf5;
  }
  .watch-options-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.5rem;
  }
  .watch-opt-card {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    background: #151320;
    border: 1px solid #2e283b;
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    text-align: left;
    cursor: pointer;
    transition: all 140ms ease;
    color: #e5edf5;
  }
  .watch-opt-card:hover {
    border-color: #5c4e78;
    transform: translateY(-1px);
  }
  .watch-opt-card.selected {
    border-color: #ffd700;
    background: rgba(201, 161, 74, 0.12);
    box-shadow: 0 0 12px rgba(255, 215, 0, 0.2);
  }
  .watch-opt-icon { font-size: 1.3rem; }
  .watch-opt-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    flex: 1;
  }
  .watch-opt-name-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.35rem;
  }
  .watch-opt-name {
    font-size: 0.8rem;
    color: #ffd700;
  }
  .risk-badge {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
  }
  .risk-badge.low { background: rgba(76, 175, 80, 0.15); color: #70d890; }
  .risk-badge.med { background: rgba(255, 170, 51, 0.15); color: #ffaa33; }
  .risk-badge.high { background: rgba(229, 57, 53, 0.15); color: #ff5555; }
  .watch-opt-specialty {
    font-size: 0.68rem;
    color: #8a8274;
  }

  /* ── EMERGENCY NIGHT AMBUSH OVERLAY MODAL ─────────────────────── */
  .ambush-overlay-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(20, 5, 5, 0.92);
    backdrop-filter: blur(10px);
    z-index: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    animation: pulseAlarm 1.5s infinite alternate;
  }
  @keyframes pulseAlarm {
    from { background: rgba(20, 5, 5, 0.90); }
    to { background: rgba(40, 8, 8, 0.95); }
  }
  .ambush-modal {
    width: 100%;
    max-width: 640px;
    background: #161014;
    border: 2px solid #e53935;
    border-radius: 12px;
    box-shadow: 0 0 40px rgba(229, 57, 53, 0.6);
    overflow: hidden;
  }
  .ambush-alert-stripe {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    background: linear-gradient(90deg, #b71c1c, #e53935, #b71c1c);
    color: #ffffff;
    padding: 0.65rem 1rem;
    font-family: 'Cinzel', Georgia, serif;
    letter-spacing: 0.08em;
  }
  .ambush-alert-stripe h3 {
    margin: 0;
    font-size: 1rem;
  }
  .pulse-alert {
    animation: pulse 1s infinite alternate;
  }
  .ambush-body {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
  .ambush-enemy-card {
    display: flex;
    gap: 1rem;
    align-items: center;
    background: #201418;
    border: 1px solid #4a242a;
    border-radius: 8px;
    padding: 1rem;
  }
  .enemy-giant-icon { font-size: 3rem; }
  .enemy-details {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    flex: 1;
  }
  .enemy-name-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .enemy-name-row h4 {
    margin: 0;
    font-family: 'Cinzel', Georgia, serif;
    color: #ff8585;
    font-size: 1.05rem;
  }
  .threat-badge {
    font-size: 0.65rem;
    font-weight: 800;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    letter-spacing: 0.05em;
  }
  .threat-badge.threat-deadly { background: #b71c1c; color: #fff; }
  .threat-badge.threat-high { background: #d84315; color: #fff; }
  .threat-badge.threat-moderate { background: #f57c00; color: #fff; }
  .enemy-desc {
    margin: 0;
    font-size: 0.8rem;
    color: #d1c8c8;
  }
  .clothes-modifier-pill {
    font-size: 0.72rem;
    color: #ffd700;
    background: rgba(255, 215, 0, 0.1);
    border: 1px solid rgba(255, 215, 0, 0.3);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    margin-top: 0.2rem;
  }
  .ambush-flavor-alert {
    background: rgba(229, 57, 53, 0.12);
    border-left: 3px solid #e53935;
    padding: 0.5rem 0.75rem;
    font-size: 0.78rem;
    color: #ffd0d0;
  }
  .tactical-choices-area h5 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.9rem;
    color: #ffd700;
    margin: 0 0 0.5rem 0;
  }
  .tactics-buttons-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .tactic-btn {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: #26161c;
    border: 1px solid #5a2c35;
    border-radius: 8px;
    padding: 0.65rem 1rem;
    text-align: left;
    cursor: pointer;
    transition: all 150ms ease;
    color: #e5edf5;
  }
  .tactic-btn:hover:not(:disabled) {
    border-color: #ffd700;
    background: #381c25;
    transform: translateY(-1px);
  }
  .tactic-icon { font-size: 1.4rem; }
  .tactic-text-col {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .tactic-label {
    font-weight: 700;
    font-size: 0.85rem;
    color: #ffd700;
  }
  .tactic-synergy {
    font-size: 0.72rem;
    color: #bbb3a6;
  }
  .resolving-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    color: #ffd700;
    padding: 0.5rem 0;
  }

  /* ── TRIANGLE ATTACK (FIRE EMBLEM SPECIAL ART) SYNERGY BANNER ───── */
  .triangle-attack-banner {
    display: flex;
    gap: 1rem;
    align-items: center;
    background: rgba(20, 18, 30, 0.9);
    border: 1px solid #3d354a;
    border-radius: 10px;
    padding: 1rem 1.25rem;
    margin-bottom: 1rem;
    transition: all 200ms ease;
  }
  .triangle-attack-banner.all-unlocked {
    border-color: #ffd700;
    background: radial-gradient(circle at 10% 50%, rgba(255, 215, 0, 0.15), rgba(20, 18, 30, 0.9));
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
  }
  .triangle-crest-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: 2.2rem;
  }
  .triangle-stars {
    font-size: 0.7rem;
    color: #ffd700;
    margin-top: -0.2rem;
  }
  .triangle-info {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
  }
  .triangle-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .triangle-title-row h4 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.98rem;
    color: #ffd700;
    margin: 0;
  }
  .synergy-status-pill {
    font-size: 0.65rem;
    font-weight: 800;
    border-radius: 4px;
    padding: 0.2rem 0.6rem;
    letter-spacing: 0.05em;
  }
  .synergy-status-pill.unlocked { background: #2e7d32; color: #fff; }
  .synergy-status-pill.locked { background: #3e3848; color: #9c95a6; }
  .triangle-desc {
    font-size: 0.78rem;
    line-height: 1.4;
    color: #e5edf5;
    margin: 0;
  }
  .triangle-prereqs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.2rem;
  }
  .triangle-prereqs .req-chip {
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    background: #1c1926;
    border: 1px solid #383046;
    color: #9c95a6;
  }
  .triangle-prereqs .req-chip.satisfied {
    border-color: #70d890;
    color: #70d890;
    background: rgba(76, 175, 80, 0.12);
  }

  /* ── COOKING POT STATION & HEARTH FEASTS ───────────────────────── */
  .cooking-stage {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    animation: fadeIn 200ms ease;
  }
  .cooking-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    background: linear-gradient(135deg, #2b1f14, #19141f);
    border: 1px solid #6b4c2b;
    border-radius: 10px;
    padding: 1rem 1.25rem;
  }
  .cooking-banner .banner-crest { font-size: 2rem; }
  .cooking-banner .banner-text h3 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1.05rem;
    color: #ffd700;
    margin: 0 0 0.25rem 0;
  }
  .cooking-banner .banner-text p {
    font-size: 0.8rem;
    color: #c8beae;
    margin: 0;
    line-height: 1.4;
  }
  .active-buff-badge {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    background: rgba(255, 170, 51, 0.15);
    border: 1px solid #ffaa33;
    border-radius: 8px;
    padding: 0.5rem 0.85rem;
    white-space: nowrap;
  }
  .buff-icon { font-size: 1.6rem; }
  .buff-meta {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .buff-status {
    font-size: 0.6rem;
    font-weight: 800;
    color: #ffaa33;
    letter-spacing: 0.06em;
  }
  .buff-stats {
    font-size: 0.7rem;
    color: #e5edf5;
  }

  .cooking-success-overlay {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    background: linear-gradient(135deg, rgba(230, 81, 0, 0.2), rgba(255, 215, 0, 0.1));
    border: 1px solid #ffd700;
    border-radius: 10px;
    padding: 1rem 1.25rem;
    box-shadow: 0 0 24px rgba(255, 215, 0, 0.25);
    animation: slideUp 200ms ease;
  }
  .success-dish-icon { font-size: 2.6rem; }
  .success-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .success-badge {
    font-size: 0.65rem;
    font-weight: 800;
    color: #70d890;
    letter-spacing: 0.08em;
  }
  .success-details h4 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1.1rem;
    color: #ffd700;
    margin: 0;
  }
  .success-chef-quote {
    font-style: italic;
    color: #e5edf5;
    font-size: 0.82rem;
    margin: 0;
  }
  .success-buff-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.35rem;
  }
  .success-buff-chips span {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
  }
  .chip-atk { background: rgba(255, 85, 85, 0.2); color: #ff8585; }
  .chip-def { background: rgba(85, 170, 255, 0.2); color: #85c2ff; }
  .chip-crit { background: rgba(255, 215, 0, 0.2); color: #ffd700; }
  .chip-hit { background: rgba(180, 100, 255, 0.2); color: #d090ff; }
  .chip-battles { background: rgba(76, 175, 80, 0.2); color: #70d890; }
  .chip-bond { background: rgba(255, 105, 180, 0.2); color: #ff85c0; }
  .btn-dismiss-success {
    background: #1f1b2b;
    border: 1px solid #ffd700;
    color: #ffd700;
    font-weight: 700;
    font-size: 0.78rem;
    padding: 0.55rem 0.95rem;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
  }

  .cooking-workspace {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 1rem;
  }
  .cooking-sidebar {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .sidebar-card {
    background: #14121d;
    border: 1px solid #332b40;
    border-radius: 8px;
    padding: 0.85rem;
  }
  .sidebar-card .card-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.65rem;
    border-bottom: 1px solid #282233;
    padding-bottom: 0.45rem;
  }
  .sidebar-card .card-head h5 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.85rem;
    color: #ffd700;
    margin: 0;
  }
  .empty-pantry-hint {
    font-size: 0.75rem;
    color: #8a8274;
    font-style: italic;
    margin: 0;
  }
  .pantry-chips-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .pantry-chip {
    font-size: 0.72rem;
    background: #201b2c;
    border: 1px solid #433857;
    color: #d0c8dd;
    border-radius: 6px;
    padding: 0.2rem 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    text-transform: capitalize;
  }
  .sous-chefs-list {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .chef-card-btn {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
    background: #191624;
    border: 1px solid #332b40;
    border-radius: 6px;
    padding: 0.5rem 0.65rem;
    text-align: left;
    cursor: pointer;
    transition: all 130ms ease;
    color: #e5edf5;
  }
  .chef-card-btn:hover {
    border-color: #ffd700;
    transform: translateY(-1px);
  }
  .chef-card-btn.selected {
    border-color: #ffd700;
    background: rgba(201, 161, 74, 0.15);
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.2);
  }
  .chef-icon { font-size: 1.4rem; }
  .chef-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    flex: 1;
  }
  .chef-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .chef-name {
    font-size: 0.8rem;
    color: #ffd700;
  }
  .chef-aff {
    font-size: 0.68rem;
    color: #ff85c0;
    font-weight: 700;
  }
  .chef-specialty {
    font-size: 0.68rem;
    color: #8a8274;
  }
  .chef-quote {
    font-size: 0.7rem;
    color: #bbb3a6;
    font-style: italic;
    margin: 0.15rem 0 0 0;
  }

  .cooking-main {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .recipes-list-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .recipes-list-head h5 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.95rem;
    color: #ffd700;
    margin: 0;
  }
  .recipes-count {
    font-size: 0.72rem;
    color: #8a8274;
  }
  .recipes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 0.65rem;
    max-height: 380px;
    overflow-y: auto;
    padding-right: 0.3rem;
  }
  .recipe-card {
    background: #161320;
    border: 1px solid #362e44;
    border-radius: 8px;
    padding: 0.75rem;
    cursor: pointer;
    transition: all 140ms ease;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .recipe-card:hover {
    border-color: #63557d;
  }
  .recipe-card.selected {
    border-color: #ffd700;
    background: #201b2e;
    box-shadow: 0 0 14px rgba(255, 215, 0, 0.15);
  }
  .recipe-top {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .recipe-icon { font-size: 1.5rem; }
  .recipe-name-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .recipe-name-col h6 {
    margin: 0;
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.85rem;
    color: #ffd700;
  }
  .recipe-flavor {
    font-size: 0.68rem;
    color: #8a8274;
  }
  .can-cook-badge {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    color: #ff5555;
  }
  .can-cook-badge.ready {
    color: #70d890;
  }
  .recipe-reqs {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .req-label {
    font-size: 0.65rem;
    color: #8a8274;
  }
  .req-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .recipe-reqs .req-chip {
    font-size: 0.65rem;
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    background: #1e1a29;
    border: 1px solid #3a324a;
    color: #a095ad;
    text-transform: capitalize;
  }
  .recipe-reqs .req-chip.owned {
    color: #70d890;
    border-color: #4caf50;
    background: rgba(76, 175, 80, 0.1);
  }
  .recipe-buff-preview {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .buff-label {
    font-size: 0.65rem;
    color: #ffd700;
    font-weight: 700;
  }
  .buff-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .b-tag {
    font-size: 0.68rem;
    font-weight: 700;
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
  }
  .b-tag.atk { background: rgba(255, 85, 85, 0.15); color: #ff7777; }
  .b-tag.def { background: rgba(85, 170, 255, 0.15); color: #77aaff; }
  .b-tag.crit { background: rgba(255, 215, 0, 0.15); color: #ffd700; }
  .b-tag.hit { background: rgba(180, 100, 255, 0.15); color: #d090ff; }
  .b-tag.hp { background: rgba(80, 220, 120, 0.15); color: #50dc78; }

  .cook-action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    background: #161320;
    border: 1px solid #362e44;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-top: 0.75rem;
  }
  .selected-summary {
    font-size: 0.8rem;
    color: #e5edf5;
  }
  .btn-cook-fire {
    background: linear-gradient(135deg, #e65100, #ff8f00);
    border: 1px solid #ffd700;
    color: #ffffff;
    font-weight: 800;
    font-size: 0.88rem;
    padding: 0.65rem 1.25rem;
    border-radius: 6px;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(230, 81, 0, 0.5);
    transition: transform 140ms ease;
  }
  .btn-cook-fire:hover:not(:disabled) {
    transform: scale(1.03);
  }
  .btn-cook-fire:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .no-sel-recipe-hint {
    font-size: 0.78rem;
    color: #8a8274;
    font-style: italic;
  }

  /* ══════════════════════════════════════════════════════════════════
     SOVEREIGN CRISES & NEMESIS DOSSIER STYLES (SOTA)
     ══════════════════════════════════════════════════════════════════ */
  .crises-tab-content, .nemesis-tab-content {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    animation: fadeIn 200ms ease;
  }

  .crises-header-banner, .nemesis-header-banner {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    background: linear-gradient(135deg, #181424, #120f1a);
    border: 1px solid #3d334e;
    border-radius: 10px;
    padding: 1rem 1.25rem;
  }

  .banner-title-box h3 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1.2rem;
    color: #ffd700;
    margin: 0 0 0.35rem 0;
  }

  .banner-desc {
    font-size: 0.8125rem;
    color: #aaa292;
    margin: 0;
    line-height: 1.4;
    max-width: 680px;
  }

  .duo-arts-trophy-bar {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.75rem;
    padding-top: 0.65rem;
    border-top: 1px solid #2d263a;
  }

  .trophy-title {
    font-size: 0.75rem;
    font-weight: 700;
    color: #ffd700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .trophy-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .duo-art-badge {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: #231c30;
    border: 1px solid #ffd700;
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
    font-size: 0.78rem;
    color: #ffd700;
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.2);
  }

  .art-dmg {
    font-size: 0.7rem;
    color: #f87171;
    font-weight: 700;
  }

  .crisis-notice-banner, .nemesis-notice-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #2a1f18;
    border: 1px solid #f59e0b;
    color: #fbbf24;
    font-size: 0.8125rem;
    padding: 0.6rem 1rem;
    border-radius: 6px;
  }

  .btn-close-notice {
    background: none;
    border: none;
    color: #f59e0b;
    cursor: pointer;
    font-weight: 700;
  }

  /* Crises Cards Grid */
  .crises-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 1rem;
  }

  .crisis-card {
    background: #15121e;
    border: 1px solid #382f48;
    border-radius: 10px;
    padding: 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    transition: transform 140ms ease, border-color 140ms ease;
  }

  .crisis-card:hover {
    border-color: #ffd700;
    transform: translateY(-2px);
  }

  .crisis-card.resolved {
    border-color: #22c55e;
    background: #111a15;
  }

  .card-hero-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .comp-portrait-badge {
    font-size: 2rem;
    background: #201b2c;
    border-radius: 8px;
    padding: 0.25rem 0.5rem;
    border: 1px solid #433857;
  }

  .crisis-title-col {
    flex: 1;
  }

  .crisis-title-col h5 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.95rem;
    color: #ffffff;
    margin: 0;
  }

  .crisis-sub {
    font-size: 0.75rem;
    color: #8a8274;
  }

  .status-badge-available {
    font-size: 0.6875rem;
    font-weight: 700;
    background: rgba(245, 158, 11, 0.18);
    color: #f59e0b;
    border: 1px solid #f59e0b;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
  }

  .status-badge-resolved {
    font-size: 0.6875rem;
    font-weight: 700;
    background: rgba(34, 197, 94, 0.18);
    color: #22c55e;
    border: 1px solid #22c55e;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
  }

  .crisis-summary-text {
    font-size: 0.8125rem;
    color: #d1c8bd;
    line-height: 1.45;
    margin: 0;
  }

  .crisis-card-footer {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    font-size: 0.72rem;
  }

  .stakes-pill, .reward-pill {
    background: #1e1929;
    border: 1px solid #3a3147;
    border-radius: 6px;
    padding: 0.2rem 0.5rem;
    color: #cbd5e1;
  }

  .reward-pill {
    border-color: rgba(255, 215, 0, 0.4);
    color: #ffd700;
    font-weight: 600;
  }

  .crisis-action-row {
    margin-top: auto;
    padding-top: 0.5rem;
  }

  .btn-engage-crisis {
    width: 100%;
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    border: 1px solid #a78bfa;
    color: #ffffff;
    font-weight: 700;
    font-size: 0.8125rem;
    padding: 0.6rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(124, 58, 237, 0.35);
    transition: transform 120ms ease;
  }

  .btn-engage-crisis:hover {
    transform: scale(1.02);
  }

  .resolution-summary {
    font-size: 0.75rem;
    color: #86efac;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .duo-awarded-tag {
    background: rgba(255, 215, 0, 0.15);
    border: 1px solid #ffd700;
    color: #ffd700;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    font-weight: 700;
    font-size: 0.6875rem;
  }

  /* Active Streaming Crisis Panel */
  .active-crisis-stream-panel {
    background: #13101c;
    border: 1px solid #6366f1;
    border-radius: 12px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    box-shadow: 0 0 25px rgba(99, 102, 241, 0.2);
  }

  .crisis-stream-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .stream-titles h4 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1.15rem;
    color: #ffffff;
    margin: 0.25rem 0;
  }

  .companion-tag {
    font-size: 0.78rem;
    color: #ffd700;
    font-weight: 700;
  }

  .crisis-stakes-label {
    font-size: 0.75rem;
    color: #cbd5e1;
  }

  .btn-exit-crisis {
    background: #1f1b2b;
    border: 1px solid #433857;
    color: #aaa;
    font-size: 0.75rem;
    padding: 0.35rem 0.65rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .crisis-narrative-card {
    background: rgba(30, 27, 42, 0.7);
    border-left: 3px solid #ffd700;
    padding: 0.85rem 1rem;
    border-radius: 0 6px 6px 0;
    font-style: italic;
    color: #e2e8f0;
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .crisis-beats-container {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    max-height: 260px;
    overflow-y: auto;
  }

  .crisis-beat-bubble {
    background: #1b1726;
    border: 1px solid #3c324c;
    border-radius: 8px;
    padding: 0.75rem 1rem;
  }

  .crisis-beat-bubble.is-player {
    border-color: #ffd700;
    background: #241e2a;
  }

  .beat-meta {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin-bottom: 0.25rem;
    color: #ffd700;
    font-size: 0.78rem;
  }

  .beat-text {
    font-size: 0.8125rem;
    color: #e5edf5;
    margin: 0;
    line-height: 1.45;
  }

  .crisis-decision-altar {
    background: #1c152a;
    border: 1px solid #f59e0b;
    border-radius: 10px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .crisis-decision-altar h5 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.95rem;
    color: #fbbf24;
    margin: 0;
    text-align: center;
  }

  .crisis-choices-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .crisis-choice-btn {
    display: flex;
    gap: 0.65rem;
    align-items: flex-start;
    background: #231c30;
    border: 1px solid #4d3e64;
    border-radius: 8px;
    padding: 0.75rem;
    cursor: pointer;
    text-align: left;
    color: #ffffff;
    transition: transform 120ms ease, border-color 120ms ease;
  }

  .crisis-choice-btn:hover {
    transform: translateY(-2px);
    border-color: #ffd700;
  }

  .crisis-choice-btn.is-s-rank {
    border-color: #ffd700;
    background: linear-gradient(135deg, #2a2038, #221a2c);
    box-shadow: 0 0 12px rgba(255, 215, 0, 0.25);
  }

  .choice-icon {
    font-size: 1.5rem;
  }

  .choice-text-col strong {
    font-size: 0.8125rem;
    color: #ffd700;
    display: block;
    margin-bottom: 0.25rem;
  }

  .choice-text-col p {
    font-size: 0.72rem;
    color: #cbd5e1;
    margin: 0;
    line-height: 1.35;
  }

  /* Nemesis & Factions Tab */
  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.75rem;
    border-bottom: 1px solid #2d263a;
    padding-bottom: 0.45rem;
  }

  .section-head h4 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1rem;
    color: #ffd700;
    margin: 0;
  }

  .section-sub {
    font-size: 0.72rem;
    color: #8a8274;
  }

  .factions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 0.85rem;
  }

  .faction-card {
    background: #15121f;
    border: 1px solid #382f48;
    border-top: 3px solid var(--fac-accent);
    border-radius: 8px;
    padding: 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .fac-card-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .fac-icon {
    font-size: 1.6rem;
  }

  .fac-title-col {
    flex: 1;
  }

  .fac-title-col h6 {
    font-size: 0.85rem;
    font-family: 'Cinzel', Georgia, serif;
    color: #ffffff;
    margin: 0;
  }

  .fac-role {
    font-size: 0.6875rem;
    color: #8a8274;
  }

  .fac-tier-badge {
    font-size: 0.6875rem;
    font-weight: 700;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    background: #241d30;
    border: 1px solid #493b5e;
    color: #ffd700;
  }

  .fac-desc {
    font-size: 0.72rem;
    color: #9c9280;
    margin: 0;
    line-height: 1.35;
  }

  .standing-bar-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .standing-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    font-weight: 700;
    color: #cbd5e1;
  }

  .standing-meter-track {
    height: 6px;
    background: #251f30;
    border-radius: 999px;
    overflow: hidden;
  }

  .standing-meter-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 300ms ease;
  }

  .fac-perk-box {
    background: rgba(255, 255, 255, 0.03);
    border-radius: 4px;
    padding: 0.35rem 0.5rem;
    font-size: 0.6875rem;
  }

  .perk-label {
    font-weight: 700;
    color: #cbd5e1;
  }

  .perk-desc {
    margin: 0.1rem 0 0 0;
    color: #e2e8f0;
  }

  .fac-actions-row {
    display: flex;
    gap: 0.4rem;
    margin-top: auto;
  }

  .btn-fac-shift {
    flex: 1;
    background: #201b2c;
    border: 1px solid #433857;
    color: #d1c8dd;
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0.35rem 0.45rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background 120ms ease;
  }

  .btn-fac-shift:hover {
    background: #2d263d;
    color: #ffffff;
  }

  .btn-fac-shift.condemn:hover {
    background: #3b1919;
    border-color: #ef4444;
    color: #fca5a5;
  }

  /* Nemesis Roster Grid */
  .nemesis-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 1rem;
  }

  .nemesis-card {
    background: #161220;
    border: 1px solid #453658;
    border-radius: 10px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .nemesis-card.slain {
    opacity: 0.6;
    border-color: #332b3d;
    background: #0f0c16;
  }

  .nem-top-row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .nem-avatar-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: #261e33;
    border: 1px solid #57446e;
    border-radius: 6px;
    padding: 0.25rem 0.45rem;
  }

  .nem-icon {
    font-size: 1.4rem;
  }

  .nem-lvl {
    font-size: 0.625rem;
    font-weight: 800;
    color: #ffd700;
  }

  .nem-name-col {
    flex: 1;
  }

  .nem-name {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.9rem;
    color: #ffffff;
    display: block;
  }

  .nem-title {
    font-size: 0.72rem;
    color: #aaa292;
    text-transform: capitalize;
  }

  .grudge-flame-meter {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid #ef4444;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
  }

  .grudge-num {
    font-size: 0.65rem;
    font-weight: 800;
    color: #fca5a5;
    margin-left: 0.2rem;
  }

  .badge-slain {
    font-size: 0.65rem;
    font-weight: 800;
    color: #94a3b8;
    background: #1e293b;
    border: 1px solid #475569;
    padding: 0.2rem 0.45rem;
    border-radius: 4px;
  }

  .nem-scars-row, .nem-traits-row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .history-label {
    font-size: 0.6875rem;
    color: #8a8274;
    font-weight: 700;
    text-transform: uppercase;
  }

  .scars-chips-list, .traits-chips-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .scar-chip {
    font-size: 0.6875rem;
    background: #2a1b1b;
    border: 1px solid #b91c1c;
    color: #fca5a5;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    font-weight: 600;
  }

  .trait-chip {
    font-size: 0.6875rem;
    background: #1c2333;
    border: 1px solid #3b82f6;
    color: #93c5fd;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    font-weight: 600;
  }

  .no-scars-text {
    font-size: 0.72rem;
    color: #64748b;
    font-style: italic;
  }

  .living-quote-bubble {
    background: #1e1929;
    border: 1px solid #3e334f;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    font-style: italic;
    color: #e2e8f0;
  }

  .living-quote-bubble p {
    flex: 1;
    margin: 0;
    line-height: 1.35;
  }

  .voice-play-mini {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.95rem;
  }

  .nem-simulation-toolbar {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding-top: 0.5rem;
    border-top: 1px solid #282233;
  }

  .sim-label {
    font-size: 0.65rem;
    color: #8a8274;
    font-weight: 700;
  }

  .sim-btn-group {
    display: flex;
    gap: 0.35rem;
  }

  .btn-sim {
    flex: 1;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.35rem 0.4rem;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid;
    transition: transform 100ms ease;
  }

  .btn-sim:hover {
    transform: scale(1.02);
  }

  .btn-sim.escape {
    background: #24192d;
    border-color: #f59e0b;
    color: #fcd34d;
  }

  .btn-sim.player-down {
    background: #2a141c;
    border-color: #ef4444;
    color: #fca5a5;
  }

  .btn-sim.execute {
    background: #15241b;
    border-color: #22c55e;
    color: #86efac;
  }

  .btn-refresh-dossier {
    background: #241d33;
    border: 1px solid #ffd700;
    color: #ffd700;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.45rem 0.85rem;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
  }

  .tab-flame-dot {
    font-size: 0.75rem;
    margin-left: 0.2rem;
    animation: flamePulse 1.5s infinite alternate;
  }

  @keyframes flamePulse {
    0% { transform: scale(1); filter: brightness(1); }
    100% { transform: scale(1.25); filter: brightness(1.4); }
  }
</style>
