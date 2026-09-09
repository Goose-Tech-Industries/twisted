// In-Game Voice Chat Store for grouped players and party raid squads.
// Supports WebRTC peer mesh signaling, voice activity detection, companion verbal & physical tactical reactions,
// ARC Raiders spatial proximity acoustics with 3D stereo panning & distance attenuation,
// footstep locomotion acoustics across diverse surfaces (stone, wood, water, grass, metal),
// circadian night amplification, awakened denizens, and non-hostile dynamic reactivity.

import { browser } from '$app/environment'
import { connection } from '$phoenix/connection.svelte'
import { character } from '$stores/character.svelte'
import type { Channel } from 'phoenix'

export type TransmissionBand = 'party' | 'proximity' | 'whisper' | 'shout'

export interface VoicePeer {
  charId: number
  name: string
  speaking: boolean
  muted: boolean
}

export interface SpatialPeerSpeech {
  charId: number
  name: string
  text: string
  mode: TransmissionBand | string
  distanceTiles: number
  pan: number // -1.0 (left) to +1.0 (right)
  volume: number // 0.0 to 1.0
  ts: number
}

export interface SpatialFootstep {
  charId: number
  name: string
  surface: string
  stance: string
  distanceTiles: number
  pan: number
  volume: number
  ts: number
}

export interface AwakenedNpc {
  npcId: number
  name: string
  icon: string
  reaction: string
  ts: number
}

export interface CompanionVoiceSpeech {
  companionId: number
  name: string
  icon: string
  text: string
  audioUrl?: string
  tactic?: string
  isThought?: boolean
  ts: number
}

export interface CompanionAction {
  companionId: number
  companionName: string
  icon: string
  actionType: string
  actionName: string
  description: string
  targetName: string
  buff?: { stat: string; value: number; duration_seconds?: number }
  posShift?: { dx: number; dy: number; label: string }
  animation?: string
  isThoughtReaction?: boolean
  ts: number
}

export interface NpcOverheardReaction {
  npcId: number
  name: string
  icon: string
  role: string
  text: string
  audioUrl?: string
  distanceTiles?: number
  isThoughtIntercept?: boolean
  isEnemy?: boolean
  isNocturnal?: boolean
  isSleeping?: boolean
  throughWindow?: boolean
  windowInfo?: { building_name?: string; building_key?: string; window_x?: number; window_y?: number }
  spatial?: {
    distance: number
    pan: number
    volume: number
    attenuation: number
    occluded: boolean
    in_earshot: boolean
  }
  ts: number
}

export interface DrunkConfrontation {
  npcId: number
  npcName: string
  icon: string
  text: string
  playerName: string
  charId: number
  availableApproaches: string[]
  timestamp: number
}

export interface DeescalateResult {
  success: boolean
  approach: string
  dialogue: string
  diplomacy_xp: number
  cost_gold: number
  roll?: number
  modifier?: number
  total_roll?: number
  dc?: number
  crit?: boolean
  crit_fail?: boolean
  target_role?: string
}

export interface NpcActionExecuted {
  npcId: number
  npcName: string
  icon: string
  actionType: string
  actionName: string
  description: string
  targetName: string
  distanceTiles?: number
  buff?: { stat: string; value: number }
  newCoords?: { x: number; y: number }
  alarmTriggered?: boolean
  isThoughtIntercept?: boolean
  isAwakened?: boolean
  spatial?: {
    distance: number
    pan: number
    volume: number
    attenuation: number
    occluded: boolean
    in_earshot: boolean
  }
  ts: number
}

export interface UileIntervention {
  warpType: string
  title: string
  message: string
  speaker: string
  audioUrl?: string
  invoker?: string
  buff?: { stat: string; value: number }
  ts: number
}

export interface TacticalLogItem {
  id: string
  source: 'companion' | 'npc' | 'uile' | 'peer' | 'diplomacy' | 'window'
  title: string
  desc: string
  icon: string
  ts: number
}

export interface WindowPortal {
  buildingId: number
  buildingKey: string
  buildingName: string
  buildingType: string
  interiorMapId: number
  windowX: number
  windowY: number
  state: 'open' | 'cracked' | 'closed' | 'shuttered' | 'broken'
  latchLocked?: boolean
  volumeMult: number
  reverb: number
  muffled: boolean
  canClimb: boolean
  canPeek: boolean
  label: string
  distance: number
}

export interface WindowPeekResult {
  canSee: boolean
  clarity?: 'clear' | 'distorted'
  buildingName: string
  buildingDesc?: string
  state: string
  occupants: Array<{
    id: number
    name: string
    role: string
    icon: string
    isSleeping: boolean
    activity: string
  }>
  message: string
}

export interface WindowRumorResult {
  success: boolean
  eavesdropped?: boolean
  buildingKey?: string
  buildingName: string
  windowState?: string
  speakerA?: string
  speakerB?: string
  dialogue: string
  perk?: string
  secretType?: string
  rewardXp?: number
}

export interface WindowActionResult {
  success: boolean
  state?: string
  previousState?: string
  silent?: boolean
  buildingName?: string
  message: string
}

export interface DefenestrationResult {
  success: boolean
  str_roll?: number
  target_dc?: number
  target_name?: string
  glass_damage?: number
  fall_damage?: number
  dest_map_id?: number
  dest_x?: number
  dest_y?: number
  bleeding?: boolean
  prone?: boolean
  blocked_by_bars?: boolean
  message: string
}

export interface StalkerSpotResult {
  spotted: boolean
  stalker_id?: number
  id?: number
  name?: string
  icon?: string
  distance?: number
  available_actions?: string[]
  message: string
}

export interface StalkerInteractResult {
  success: boolean
  action: string
  confession?: string
  tip?: string
  buff?: { name: string; description: string; duration_seconds: number }
  fled?: boolean
  hostile?: boolean
  message: string
}

export interface AddictInteractResult {
  success: boolean
  action: string
  cost_gold?: number
  secret?: string
  screech_decibels?: number
  guards_alerted?: boolean
  stolen?: boolean
  amount?: number
  intel_reward?: string
  pickpocket_gold?: number
  message: string
}

export interface GasDeployResult {
  success: boolean
  gas_type?: string
  gas_name?: string
  building_name?: string
  duration_turns?: number
  affected_occupants?: number
  affected?: Array<{ id: number; name: string; role: string; saved?: boolean; asleep?: boolean; evacuated?: boolean; blinded?: boolean }>
  message: string
}

export interface PropertyItem {
  id: number
  building_id: number
  building_key?: string
  map_id: number
  name: string
  price_gold: number
  deed_cost?: number
  owner_char_id: number | null
  owner_name: string | null
  is_for_sale: boolean
  is_owned?: boolean
  fortifications: string[]
  has_iron_bars?: boolean
  has_soundproof_curtains?: boolean
  has_alarm_glyphs?: boolean
  curtains_drawn: boolean
  security_rating?: number
  stash_gold?: number
  guard_companion_name?: string | null
}

export interface DraftResult {
  draftActive: boolean
  galeWeather?: string
  windowState?: string
  candlesExtinguished?: boolean
  lightLevel?: number
  stealthBonus?: number
  message: string
}

export interface NpcDrama {
  id: number
  map_id: number
  stalker_name: string
  stalker_icon: string
  stalker_role: string
  victim_name: string
  victim_icon: string
  victim_role: string
  location_desc: string
  motive: string
  stage: 'stalking' | 'ambush_imminent' | 'rescued' | 'murdered'
  turns_remaining: number
  available_actions?: string[]
  clues?: string[]
  bounty_reward?: number
  description?: string
}

export interface NpcDramaInterventionResult {
  success: boolean
  action: string
  roll?: number
  total?: number
  dc?: number
  bounty_gold?: number
  xp_awarded?: number
  contract_intel?: string
  quote?: string
  message: string
  hostile?: boolean
}

export interface CrimeSceneResult {
  success: boolean
  roll?: number
  total?: number
  clues_found?: string[]
  lead?: string
  bounty_active?: boolean
  message: string
}

export interface TavernBrawlState {
  map_id: number
  initiator?: string
  brawlers: Array<{ id: number; name: string; icon: string; role: string; hp: number; x: number; y: number }>
  decibels?: number
  description?: string
  can_defenestrate: boolean
}

export interface GodsEyeEntity {
  id: number
  name: string
  type: 'player' | 'npc' | 'enemy'
  x: number
  y: number
  map_id?: number
  level?: number
  hp: number
  max_hp: number
  role?: string
  faction?: string
  soul_id?: string
  distance?: number
  bearing?: number
  threat_level?: 'low' | 'medium' | 'high' | 'apex' | 'ally'
}

export interface GodsEyeScanResult {
  players: GodsEyeEntity[]
  npcs: GodsEyeEntity[]
  maps: Array<{ id: number; name: string; width: number; height: number }>
  critical_events: Array<{ severity: string; target: string; coords: string; map_id: number; message: string }>
  total_tracked: number
  timestamp: number
}

export interface GodsEyeSonarResult {
  map_id: number
  origin: { x: number; y: number }
  radius: number
  blips: GodsEyeEntity[]
  total_detected: number
  threat_count: number
  timestamp: number
}

export interface GodsEyeWiretap {
  id: number
  type: 'player' | 'npc'
  name: string
  role?: string
  persona?: string
  faction?: string
  level: number
  hp: number
  max_hp: number
  coords: [number, number]
  map_id: number
  online?: boolean
  soul_id?: string
  soul?: {
    character_name?: string
    emotional_state?: {
      confidence: number
      stress: number
      anger: number
      gratitude: number
      [key: string]: unknown
    }
    soul_profile?: {
      attachment_style?: string
      motto?: string
      [key: string]: unknown
    }
    active_thoughts?: string[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface BountyBoardItem {
  id: number
  board_key: string
  name: string
  location_name: string
  faction: string
  description?: string
  map_id: number
}

export interface BountyTaskItem {
  id: number
  board_id: number
  board_name?: string
  target_name: string
  target_icon: string
  contract_type: 'wanted_alive' | 'wanted_dead' | 'dead_or_alive'
  difficulty: string
  crime_desc: string
  location_hint: string
  reward_gold: number
  reward_xp: number
  reward_rep: number
  is_active: number | boolean
  claim_status?: 'unclaimed' | 'accepted' | 'completed'
}

export interface NpcScheduleItem {
  id: number
  name: string
  role: string
  x: number
  y: number
  is_sleeping: number | boolean
  is_nocturnal: number | boolean
  current_activity: string
  icon?: string
}

export interface SafehouseStashData {
  property_id: number
  property_name: string
  stash_gold: number
  guard_companion?: string | null
  items: Array<{
    id: number
    item_key: string
    item_name: string
    quantity: number
    meta?: Record<string, unknown>
  }>
  trophies: Array<{
    id: number
    trophy_key: string
    name: string
    icon: string
    buff_type: string
    buff_value: number
    description: string
  }>
}

export interface ColossusRaidState {
  id: number
  map_id: number
  status: string
  boss_name: string
  boss_hp: number
  boss_max_hp: number
  phase: number
  phase_name: string
  limbs: Record<string, {
    hp: number
    max_hp: number
    broken: boolean
    icon: string
    name: string
  }>
  telegraph?: ColossusTelegraph | null
  is_defeated?: boolean
  message?: string
}

export interface ColossusTelegraph {
  attack_type: string
  name: string
  damage: number
  icon: string
  desc: string
  started_at: number
  deadline: number
  telegraph_ms: number
}

export interface ColossusDefenseResult {
  success: boolean
  action: string
  timing_ms: number
  damage_taken: number
  staggered_boss: boolean
  message: string
}

export interface EngineFeatureFlagItem {
  feature_key: string
  label: string
  description: string
  category: string
  is_enabled: boolean
  updated_at?: string
}

export interface SafehouseWorkshopState {
  property_id: number
  runes: Array<{
    id: number
    item_id: string
    item_name: string
    rune_key: string
    rune_name: string
    rune_icon: string
    bonus_stat: string
    bonus_value: number
    socket_slot: string
  }>
  available_runes: Array<{
    name: string
    icon: string
    stat: string
    value: number
    description: string
  }>
  alembic: Array<{
    id: number
    recipe_key: string
    concoction_name: string
    icon: string
    quantity: number
    brew_seconds: number
    status: string
    seconds_remaining: number
  }>
  available_recipes: Array<{
    name: string
    icon: string
    brew_seconds: number
    description: string
  }>
  dispatches: Array<{
    id: number
    companion_id: number
    companion_name: string
    mission_type: string
    mission_name: string
    icon: string
    status: string
    seconds_remaining: number
    reward_gold: number
    reward_xp: number
    reward_item_name: string
  }>
  available_missions: Array<{
    name: string
    icon: string
    duration_seconds: number
    gold: number
    xp: number
    item_name: string
    item_key: string
  }>
  is_enabled?: boolean
}

export interface CatacombDungeonState {
  id: number
  name: string
  theme: string
  danger_level: string
  floors_count: number
  current_floor: number
  status: string
  prompt: string
  rooms: Array<{
    index: number
    type: string
    name: string
    description: string
    elevation: number
    is_cleared: boolean
    doors: number[]
    occupants: Array<{ name: string; hp: number; max_hp: number; icon: string }>
    loot: { gold?: number; xp?: number; item?: string }
  }>
  active_room_index: number
  is_enabled?: boolean
}

export interface FactionDistrictItem {
  key: string
  name: string
  controlling_faction: string
  syndicate_pct: number
  watch_pct: number
  cult_pct: number
  martial_law_active: boolean
  tax_rate_pct: number
  guard_type: string
  updated_at?: string
}

export interface ForensicCaseItem {
  id: number
  title: string
  case_code: string
  status: string
  crime_type: string
  victim_name: string
  location_hint: string
  reward_gold: number
  reward_xp: number
  created_at?: string
  is_enabled?: boolean
}

export interface ForensicCaseDetails {
  id: number
  title: string
  case_code: string
  status: string
  crime_type: string
  victim_name: string
  location_hint: string
  culprit_suspect_id: number
  reward_gold: number
  reward_xp: number
  suspects: Array<{
    id: number
    suspect_id: number
    name: string
    role: string
    icon: string
    alibi: string
    is_guilty: boolean
    interrogated_count: number
    confessed: boolean
  }>
  clues: Array<{
    id: number
    clue_key: string
    name: string
    icon: string
    clue_text: string
    is_discovered: boolean
    points_to_suspect_id?: number
  }>
  is_enabled?: boolean
}

export interface VoiceCombatCapabilities {
  spells: Array<{
    name: string
    element: string
    base_damage?: number
    base_shield?: number
    icon: string
    desc: string
  }>
  squad_commands: Array<{
    companion: string
    action: string
    icon: string
    shout: string
  }>
  is_enabled?: boolean
}

function createVoiceChatStore() {
  let inVoice = $state(false)
  let isMuted = $state(false)
  let isDeafened = $state(false)
  let transmissionBand = $state<TransmissionBand>('party')
  let timeOfDay = $state<'dawn' | 'day' | 'dusk' | 'night' | 'midnight'>('day')
  let currentPartyId = $state<string | number | null>(null)
  let currentProximityMapId = $state<number | null>(null)
  let peers = $state<Map<number, VoicePeer>>(new Map())
  let speakingPeers = $state<Set<number>>(new Set())
  let lastBattleCry = $state<{ speaker: string; cry: string; ts: number } | null>(null)
  let lastSpatialPeerSpeech = $state<SpatialPeerSpeech | null>(null)
  let lastFootstep = $state<SpatialFootstep | null>(null)
  let lastAwakenedNpc = $state<AwakenedNpc | null>(null)
  let lastCompanionSpeech = $state<CompanionVoiceSpeech | null>(null)
  let lastCompanionAction = $state<CompanionAction | null>(null)
  let lastNpcReaction = $state<NpcOverheardReaction | null>(null)
  let lastNpcAction = $state<NpcActionExecuted | null>(null)
  let lastUileWarp = $state<UileIntervention | null>(null)
  let lastDrunkConfrontation = $state<DrunkConfrontation | null>(null)
  let lastDeescalateResult = $state<DeescalateResult | null>(null)
  let nearbyWindow = $state<WindowPortal | null>(null)
  let lastPeekResult = $state<WindowPeekResult | null>(null)
  let lastRumorResult = $state<WindowRumorResult | null>(null)
  let lastWindowAction = $state<WindowActionResult | null>(null)
  let lastDefenestration = $state<DefenestrationResult | null>(null)
  let activeStalker = $state<StalkerSpotResult | null>(null)
  let lastStalkerAction = $state<StalkerInteractResult | null>(null)
  let lastAddictResult = $state<AddictInteractResult | null>(null)
  let lastGasDeploy = $state<GasDeployResult | null>(null)
  let propertiesList = $state<PropertyItem[]>([])
  let lastDraftResult = $state<DraftResult | null>(null)
  let activeDrama = $state<NpcDrama | null>(null)
  let lastDramaIntervention = $state<NpcDramaInterventionResult | null>(null)
  let lastCrimeScene = $state<CrimeSceneResult | null>(null)
  let activeBrawl = $state<TavernBrawlState | null>(null)
  let lastBrawlAction = $state<any | null>(null)
  let tacticalLog = $state<TacticalLogItem[]>([])

  // God's Eye Surveillance Grid & Tactical Sonar Matrix
  let godsEyeActive = $state(false)
  let godsEyeRadar = $state<GodsEyeScanResult | null>(null)
  let godsEyeSonarResult = $state<GodsEyeSonarResult | null>(null)
  let godsEyeWiretap = $state<GodsEyeWiretap | null>(null)
  let isScanningGodsEye = $state(false)
  let lastSonarPingTs = $state(0)
  let lastOrbitalStrikeResult = $state<unknown>(null)
  let lastSupplyDropResult = $state<unknown>(null)
  let lastWhisperResult = $state<unknown>(null)

  // 1. Lowtown Bounty Board & Black Market Fence
  let bountyBoards = $state<BountyBoardItem[]>([])
  let bountyTasks = $state<BountyTaskItem[]>([])
  let lastBountyResult = $state<any | null>(null)
  let lastFenceResult = $state<any | null>(null)

  // 2. Autonomous NPC Living Schedules
  let npcSchedulesList = $state<NpcScheduleItem[]>([])

  // 3. Safehouse Stash Vault, Trophy Wall & Guard
  let safehouseStash = $state<SafehouseStashData | null>(null)
  let lastStashAction = $state<any | null>(null)
  let lastTrophyAction = $state<any | null>(null)

  // 4. Ashveil Colossus Apex Raid & Planet Mado Active Defense
  let colossusRaid = $state<ColossusRaidState | null>(null)
  let colossusTelegraph = $state<ColossusTelegraph | null>(null)
  let colossusDefenseResult = $state<ColossusDefenseResult | null>(null)
  let colossusLootResult = $state<any | null>(null)

  // 5 Next-Tier RPG Systems & Master Feature Flags
  let featureFlags = $state<EngineFeatureFlagItem[]>([])
  let workshopState = $state<SafehouseWorkshopState | null>(null)
  let lastWorkshopResult = $state<{ message: string; error?: string } | null>(null)
  let activeCatacomb = $state<CatacombDungeonState | null>(null)
  let lastCatacombResult = $state<{ message: string; error?: string } | null>(null)
  let factionDistricts = $state<FactionDistrictItem[]>([])
  let lastTerritoryResult = $state<{ message?: string; reason?: string } | null>(null)
  let forensicCases = $state<ForensicCaseItem[]>([])
  let activeCaseDetails = $state<ForensicCaseDetails | null>(null)
  let lastForensicResult = $state<{ message: string; error?: string } | null>(null)
  let lastVoiceCombatResult = $state<{
    message: string
    error?: string
    spell_name?: string
    phrase?: string
    total_power?: number
    resonance_mult?: number
    bonus_pct?: number
    element?: string
    damage?: number
    companion?: string
    command?: string
    shout?: string
  } | null>(null)
  let voiceCombatCaps = $state<VoiceCombatCapabilities | null>(null)

  let channel: Channel | null = null
  let proximityChannel: Channel | null = null
  let localStream: MediaStream | null = null
  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let vadInterval: number | null = null
  let wasSpeaking = false
  let storedCharId: number = 1
  let storedCharName: string = 'Player'

  function pushLog(source: 'companion' | 'npc' | 'uile' | 'peer' | 'diplomacy' | 'window', title: string, desc: string, icon: string) {
    const item: TacticalLogItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      source,
      title,
      desc,
      icon,
      ts: Date.now()
    }
    tacticalLog = [item, ...tacticalLog.slice(0, 9)]
  }

  function getAudioContext(): AudioContext | null {
    if (!browser) return null
    try {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (AudioContextClass) {
          audioCtx = new AudioContextClass()
        }
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        void audioCtx.resume()
      }
      return audioCtx
    } catch (_) {
      return null
    }
  }

  function playTone(freq: number, type: OscillatorType = 'sine', duration = 0.15) {
    if (!browser) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.value = freq
      gain.gain.value = 0.08
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + duration)
    } catch (_) {}
  }

  function playSpatialTone(freq: number, pan: number, volume: number, type: OscillatorType = 'sine', duration = 0.15) {
    if (!browser || isDeafened) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.value = freq
      gain.gain.value = Math.max(0.01, Math.min(1.0, volume)) * 0.12

      if (ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner()
        panner.pan.value = Math.max(-1, Math.min(1, pan))
        osc.connect(panner)
        panner.connect(gain)
      } else {
        osc.connect(gain)
      }
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + duration)
    } catch (_) {}
  }

  function playSpatialFootstep(surface: string, pan: number, volume: number) {
    if (!browser || isDeafened) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const now = ctx.currentTime

      const s = (surface || 'stone').toLowerCase()
      if (s.includes('wood')) {
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(320, now)
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.08)
        gain.gain.setValueAtTime(Math.min(1.0, volume * 0.18), now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09)
      } else if (s.includes('water')) {
        osc.type = 'sine'
        osc.frequency.setValueAtTime(620, now)
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.12)
        gain.gain.setValueAtTime(Math.min(1.0, volume * 0.22), now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13)
      } else if (s.includes('metal')) {
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(2200, now)
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.14)
        gain.gain.setValueAtTime(Math.min(1.0, volume * 0.2), now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
      } else if (s.includes('grass')) {
        osc.type = 'sine'
        osc.frequency.setValueAtTime(220, now)
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.06)
        gain.gain.setValueAtTime(Math.min(1.0, volume * 0.08), now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07)
      } else {
        // Stone / dungeon floor crisp clack
        osc.type = 'sine'
        osc.frequency.setValueAtTime(1400, now)
        osc.frequency.exponentialRampToValueAtTime(280, now + 0.07)
        gain.gain.setValueAtTime(Math.min(1.0, volume * 0.16), now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
      }

      if (ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner()
        panner.pan.value = Math.max(-1, Math.min(1, pan))
        osc.connect(panner)
        panner.connect(gain)
      } else {
        osc.connect(gain)
      }
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.16)
    } catch (_) {}
  }

  function playBattleHorn() {
    if (!browser || isDeafened) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const freqs = [261.63, 329.63, 392.00, 523.25]
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(f, ctx.currentTime)
        gain.gain.setValueAtTime(0.06, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2 + idx * 0.1)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(ctx.currentTime + idx * 0.05)
        osc.stop(ctx.currentTime + 1.5)
      })
    } catch (_) {}
  }

  function playSonarPing(freq = 1400, duration = 0.75) {
    if (!browser || isDeafened) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const filter = ctx.createBiquadFilter()

      filter.type = 'bandpass'
      filter.frequency.value = freq
      filter.Q.value = 5.0

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(freq * 0.45, ctx.currentTime + duration)

      gain.gain.setValueAtTime(0.14, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)

      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + duration)
    } catch (_) {}
  }

  function playOrbitalBoom() {
    if (!browser || isDeafened) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(140, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 1.2)

      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 1.2)
    } catch (_) {}
  }

  function playBountyFanfare() {
    if (!browser || isDeafened) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const notes = [523.25, 659.25, 783.99, 1046.50]
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08)
        gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.08)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.08 + 0.35)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(ctx.currentTime + idx * 0.08)
        osc.stop(ctx.currentTime + idx * 0.08 + 0.35)
      })
    } catch (_) {}
  }

  function playFenceCoinChime() {
    if (!browser || isDeafened) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const freqs = [1800, 2400, 3200]
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.05)
        gain.gain.setValueAtTime(0.09, ctx.currentTime + idx * 0.05)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.05 + 0.22)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(ctx.currentTime + idx * 0.05)
        osc.stop(ctx.currentTime + idx * 0.05 + 0.22)
      })
    } catch (_) {}
  }

  function playPerfectParryClash() {
    if (!browser || isDeafened) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.setValueAtTime(1150, now)
      osc.frequency.exponentialRampToValueAtTime(840, now + 0.25)
      gain.gain.setValueAtTime(0.28, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.4)
    } catch (_) {}
  }

  function playColossusRoar() {
    if (!browser || isDeafened) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(85, now)
      osc.frequency.exponentialRampToValueAtTime(28, now + 1.4)
      gain.gain.setValueAtTime(0.24, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 1.4)
    } catch (_) {}
  }

  function playSafehouseLatch() {
    if (!browser || isDeafened) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(260, now)
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.12)
      gain.gain.setValueAtTime(0.18, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.14)
    } catch (_) {}
  }

  function playRuneForgeClink() {
    if (!browser || isDeafened) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(1200, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(3200, ctx.currentTime + 0.18)
      gain.gain.setValueAtTime(0.18, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.4)
    } catch (_) {}
  }

  function playAlembicBubble() {
    if (!browser || isDeafened) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(240, ctx.currentTime)
      osc.frequency.linearRampToValueAtTime(520, ctx.currentTime + 0.15)
      gain.gain.setValueAtTime(0.12, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.25)
    } catch (_) {}
  }

  function playCatacombDoorRumble() {
    if (!browser || isDeafened) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(65, now)
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.9)
      gain.gain.setValueAtTime(0.2, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.9)
    } catch (_) {}
  }

  function playGavelStrike() {
    if (!browser || isDeafened) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.setValueAtTime(110, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.2)
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.35)
    } catch (_) {}
  }

  function playIncantationResonance() {
    if (!browser || isDeafened) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(320, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3)
      gain.gain.setValueAtTime(0.16, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } catch (_) {}
  }

  function calculateSpatialAcoustics(targetCoords: { x?: number; y?: number }, maxRadius: number) {
    const lx = character.active?.x ?? 10
    const ly = character.active?.y ?? 10
    const sx = targetCoords.x ?? lx
    const sy = targetCoords.y ?? ly
    const dx = sx - lx
    const dy = sy - ly
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > maxRadius) {
      return { inRange: false, dist, pan: 0, volume: 0 }
    }

    const pan = Math.max(-1, Math.min(1, dx / 12))
    const rel = dist / maxRadius
    const volume = Math.max(0.04, Math.pow(1 - rel, 1.4))
    return { inRange: true, dist: Math.round(dist * 10) / 10, pan, volume }
  }

  function playSpatialSpeech(text: string, pan: number, volume: number, audioUrl?: string, isEnemy = false) {
    if (!browser || isDeafened) return

    if (audioUrl) {
      const ctx = getAudioContext()
      if (ctx) {
        fetch(audioUrl)
          .then(res => res.arrayBuffer())
          .then(buf => ctx.decodeAudioData(buf))
          .then(decoded => {
            const src = ctx.createBufferSource()
            src.buffer = decoded
            const gain = ctx.createGain()
            gain.gain.value = Math.max(0.05, Math.min(1.0, volume)) * 0.9

            if (ctx.createStereoPanner) {
              const panner = ctx.createStereoPanner()
              panner.pan.value = Math.max(-1, Math.min(1, pan))
              src.connect(panner)
              panner.connect(gain)
            } else {
              src.connect(gain)
            }
            gain.connect(ctx.destination)
            src.start(0)
          })
          .catch(() => {
            playSpeechSynthesisFallback(text, pan, volume, isEnemy)
          })
        return
      }
    }

    playSpeechSynthesisFallback(text, pan, volume, isEnemy)
  }

  function playSpeechSynthesisFallback(text: string, pan: number, volume: number, isEnemy = false) {
    if (!browser || !window.speechSynthesis || isDeafened) return
    playSpatialTone(isEnemy ? 280 : 540, pan, volume, 'triangle', 0.12)
    const utter = new SpeechSynthesisUtterance(text)
    utter.volume = Math.max(0.15, Math.min(1.0, volume))
    utter.pitch = isEnemy ? 0.65 : 1.0
    utter.rate = 1.0
    window.speechSynthesis.speak(utter)
  }

  function setupProximityChannel(mapId: number, charId: number, name: string) {
    if (proximityChannel) {
      proximityChannel.leave()
      proximityChannel = null
    }

    currentProximityMapId = mapId
    const proxTopic = `voice:proximity:${mapId}`
    const proxChan = connection.channel(proxTopic, { char_id: charId, name })

    if (proxChan) {
      // 1. Spatial Peer Speech from nearby adventurers
      proxChan.on('spatial_peer_speech', (p: any) => {
        if (p.char_id === charId) return
        const maxRadius = p.mode === 'whisper' ? 4 : p.mode === 'shout' ? 32 : 16
        const spatial = calculateSpatialAcoustics(p.coords || {}, maxRadius)
        if (!spatial.inRange) return

        lastSpatialPeerSpeech = {
          charId: p.char_id,
          name: p.name || 'Nearby Adventurer',
          text: p.text,
          mode: p.mode || 'proximity',
          distanceTiles: Math.round(spatial.dist),
          pan: spatial.pan,
          volume: spatial.volume,
          ts: Date.now()
        }

        pushLog('peer', `${p.name} [${(p.mode || 'proximity').toUpperCase()}]`, `"${p.text}" (${Math.round(spatial.dist)} tiles away)`, '🗣️')
        playSpatialSpeech(p.text, spatial.pan, spatial.volume, undefined, false)
      })

      // 2. Spatial Footstep Locomotion from moving players & creatures
      proxChan.on('player_footstep', (p: any) => {
        if (p.char_id === charId) return
        const maxRadius = p.radius || 8
        const spatial = calculateSpatialAcoustics(p.coords || {}, maxRadius)
        if (!spatial.inRange) return

        lastFootstep = {
          charId: p.char_id,
          name: p.player_name || 'Adventurer',
          surface: p.surface || 'stone',
          stance: p.stance || 'walk',
          distanceTiles: Math.round(spatial.dist),
          pan: spatial.pan,
          volume: spatial.volume,
          ts: Date.now()
        }

        playSpatialFootstep(p.surface, spatial.pan, spatial.volume)
      })

      // 3. Circadian Day/Night Shift
      proxChan.on('circadian_shift', (p: any) => {
        if (p.time_of_day) {
          timeOfDay = p.time_of_day
          playTone(p.is_night ? 320 : 640, 'triangle', 0.2)
        }
      })

      // 4. Awakened NPC notification
      proxChan.on('npc_awakened', (p: any) => {
        lastAwakenedNpc = {
          npcId: p.npc_id,
          name: p.npc_name,
          icon: p.icon || '👤',
          reaction: p.description,
          ts: Date.now()
        }
        pushLog('npc', p.action_name || 'Awakened', p.description, '💤')
        playTone(480, 'sawtooth', 0.15)
      })

      // 5. NPC Spatial Voice overheard by anyone in range
      proxChan.on('npc_spatial_voice', (p: any) => {
        if (lastNpcReaction && Date.now() - lastNpcReaction.ts < 2000 && lastNpcReaction.npcId === p.npc_id) {
          return
        }
        const maxRadius = p.is_thought_intercept ? 10 : 16
        const spatial = calculateSpatialAcoustics(p.coords || { x: p.spatial?.x, y: p.spatial?.y }, maxRadius)
        const pan = p.spatial?.pan ?? spatial.pan
        const vol = p.spatial?.volume ?? spatial.volume

        lastNpcReaction = {
          npcId: p.npc_id,
          name: p.name,
          icon: p.icon || '👤',
          role: p.role,
          text: p.text,
          audioUrl: p.audio_url,
          distanceTiles: p.distance_tiles ?? Math.round(spatial.dist),
          isThoughtIntercept: p.is_thought_intercept,
          isEnemy: p.is_enemy,
          isNocturnal: p.is_nocturnal,
          isSleeping: p.is_sleeping,
          spatial: p.spatial,
          ts: Date.now()
        }

        playSpatialSpeech(p.text, pan, vol, p.audio_url, p.is_enemy)
      })

      // 6. Drunk Confrontation / Altercation
      proxChan.on('drunk_confrontation', (p: any) => {
        lastDrunkConfrontation = {
          npcId: p.npc_id,
          npcName: p.npc_name,
          icon: p.icon || '🍺',
          text: p.text,
          playerName: p.player_name,
          charId: p.char_id,
          availableApproaches: p.available_approaches || ['buy_drink', 'persuasion', 'intimidation', 'bribe', 'deception'],
          timestamp: p.timestamp || Date.now()
        }
        pushLog('diplomacy', `🍺 Drunk Argument: ${p.npc_name}`, p.text, '🍺')
        playSpatialTone(180, 0, 0.35, 'sawtooth', 0.25)
      })

      // 7. Window Eavesdrop Notification
      proxChan.on('window_eavesdrop', (p: any) => {
        pushLog('window', `🪟 Window Bleed: ${p.building_name || 'Building'}`, p.text, '🪟')
        playSpatialTone(720, 0, 0.18, 'sine', 0.12)
      })

      // 8. De-escalation result
      proxChan.on('deescalate_result', (p: any) => {
        lastDeescalateResult = p
        if (p.success) {
          pushLog('diplomacy', `🕊️ De-escalation SUCCESS (${p.approach})`, p.dialogue, '🕊️')
          playSpatialTone(523.25, 0, 0.3, 'triangle', 0.3)
          lastDrunkConfrontation = null
        } else {
          pushLog('diplomacy', `⚔️ De-escalation FAILED (${p.approach})`, p.dialogue, '⚔️')
          playSpatialTone(140, 0, 0.4, 'sawtooth', 0.3)
        }
      })

      // 9. Window state changes (real-time open/close toggle)
      proxChan.on('window_state_changed', (p: any) => {
        if (nearbyWindow && nearbyWindow.windowX === p.window_x && nearbyWindow.windowY === p.window_y) {
          nearbyWindow = {
            ...nearbyWindow,
            state: p.state,
            volumeMult: p.volume_mult,
            reverb: p.reverb,
            muffled: p.muffled,
            label: p.label,
            canClimb: p.can_climb,
            canPeek: p.can_peek
          }
        }
        pushLog('window', `🪟 Window ${p.state.toUpperCase()}: ${p.building_name || 'Building'}`, `Window at {${p.window_x}, ${p.window_y}} is now ${p.label}`, '🪟')
        playTone(p.state === 'open' ? 620 : 380, 'sine', 0.12)
      })

      // 10. Window noise (creak, rattle, or shattered glass)
      proxChan.on('window_noise', (p: any) => {
        pushLog('window', `👂 Window Sound: ${p.sound}`, p.description, '🪟')
        if (p.sound === 'glass_shattered') {
          playTone(220, 'sawtooth', 0.35)
        } else {
          playTone(340, 'triangle', 0.18)
        }
      })

      // 11. Nearby windows response
      proxChan.on('nearby_windows', (p: any) => {
        if (p.windows && p.windows.length > 0) {
          const w = p.windows[0]
          nearbyWindow = {
            buildingId: w.building_id,
            buildingKey: w.building_key,
            buildingName: w.building_name,
            buildingType: w.building_type,
            interiorMapId: w.interior_map_id,
            windowX: w.window_x,
            windowY: w.window_y,
            state: w.state,
            latchLocked: w.latch_locked,
            volumeMult: w.volume_mult,
            reverb: w.reverb,
            muffled: w.muffled,
            canClimb: w.can_climb,
            canPeek: w.can_peek,
            label: w.label,
            distance: w.distance
          }
        } else {
          nearbyWindow = null
        }
      })

      // 12. Window action result
      proxChan.on('window_action_result', (p: any) => {
        lastWindowAction = p
        if (p.message) {
          pushLog('window', '🪟 Window Action', p.message, '🪟')
        }
      })

      // 13. Window peek result
      proxChan.on('window_peek_result', (p: any) => {
        lastPeekResult = p
        playTone(520, 'sine', 0.12)
      })

      // 14. Window rumor result
      proxChan.on('window_rumor_result', (p: any) => {
        lastRumorResult = p
        if (p.eavesdropped) {
          pushLog('diplomacy', `📜 Eavesdropped: ${p.building_name}`, `"${p.dialogue}"`, '📜')
          playTone(660, 'triangle', 0.25)
        }
      })

      // 15. Defenestration result
      proxChan.on('defenestration_result', (p: any) => {
        lastDefenestration = p
        if (p.message) {
          pushLog('window', p.success ? '💥 DEFENESTRATION!' : '🛡️ Grapple Resisted', p.message, '💥')
        }
        if (p.glass_shattered) playTone(220, 'sawtooth', 0.4)
      })

      // 16. Combatant defenestrated broadcast
      proxChan.on('combatant_defenestrated', (p: any) => {
        pushLog('window', '💥 Defenestration Impact!', p.description, '💥')
        playTone(220, 'sawtooth', 0.35)
      })

      // 17. Stalker spotted result
      proxChan.on('spot_stalker_result', (p: any) => {
        const sId = p.stalker_id || p.id || 1
        activeStalker = {
          spotted: p.spotted,
          stalker_id: sId,
          id: sId,
          name: p.name || 'Shadowy Stalker',
          icon: p.icon || '🕵️',
          distance: p.distance || 3,
          available_actions: p.available_actions,
          message: p.message
        }
        if (p.spotted) {
          pushLog('npc', `🕵️ Stalker Spotted: ${p.name}`, p.message, '🕵️')
          playTone(440, 'sine', 0.2)
        }
      })

      // 18. Stalker unmasked broadcast
      proxChan.on('stalker_unmasked', (p: any) => {
        pushLog('npc', `🕵️ Stalker Unmasked: ${p.name}`, p.message, '🕵️')
      })

      // 19. Stalker interaction result
      proxChan.on('interact_stalker_result', (p: any) => {
        lastStalkerAction = p
        if (p.message) pushLog('npc', '🕵️ Stalker Encounter', p.message, '🕵️')
      })

      // 20. Addict interaction result
      proxChan.on('interact_addict_result', (p: any) => {
        lastAddictResult = {
          success: p.success,
          action: p.action,
          cost_gold: p.cost_gold,
          secret: p.secret,
          screech_decibels: p.screech_decibels,
          guards_alerted: p.guards_alerted,
          stolen: p.stolen,
          amount: p.amount,
          intel_reward: p.secret,
          pickpocket_gold: p.amount,
          message: p.message
        }
        if (p.message) pushLog('npc', '🥀 Addict Encounter', p.message, '🥀')
        if (p.guards_alerted) playTone(800, 'sawtooth', 0.3)
      })

      // 21. Tavern brawl cascade
      proxChan.on('tavern_brawl_cascade', (p: any) => {
        activeBrawl = {
          map_id: p.map_id || 1,
          initiator: p.initiator || 'Patron',
          brawlers: p.brawlers || [],
          decibels: p.decibels || 80,
          description: p.description,
          can_defenestrate: p.can_defenestrate ?? true
        }
        pushLog('npc', '🍻 BAR FIGHT!', p.description, '🍻')
        playTone(300, 'sawtooth', 0.35)
      })

      proxChan.on('tavern_brawl_action', (p: any) => {
        lastBrawlAction = p
        pushLog('npc', '🍻 Brawl Chaos!', p.description, '🍻')
        playTone(280, 'sawtooth', 0.25)
      })

      // 21b. NPC Stalker Drama & Deadpool Interventions
      proxChan.on('npc_drama_data', (p: any) => {
        if (p.drama) {
          activeDrama = p.drama
        }
      })

      proxChan.on('stalker_altercation_detected', (p: any) => {
        activeDrama = {
          id: p.drama_id,
          map_id: p.map_id,
          stalker_name: p.stalker_name,
          stalker_icon: p.stalker_icon,
          stalker_role: p.stalker_role,
          victim_name: p.victim_name,
          victim_icon: p.victim_icon,
          victim_role: p.victim_role,
          location_desc: p.location_desc,
          motive: p.motive,
          stage: p.stage || 'stalking',
          turns_remaining: p.turns_remaining || 5,
          available_actions: p.available_actions || ['tackle', 'deadpool_talkdown', 'eavesdrop', 'attack'],
          description: p.description
        }
        pushLog('npc', `🗡️ Stalking Altercation: ${p.stalker_name}`, p.description, '🗡️')
        playTone(520, 'sawtooth', 0.4)
      })

      proxChan.on('npc_drama_intervene_result', (p: any) => {
        lastDramaIntervention = p
        if (p.success && activeDrama) {
          activeDrama.stage = 'rescued'
        } else if (!p.success && activeDrama) {
          activeDrama.stage = 'ambush_imminent'
          activeDrama.turns_remaining = 1
        }
        if (p.message) pushLog('diplomacy', p.success ? '🔴 Deadpool Intervention Succeeded!' : '⚠️ Intervention Resisted', p.message, '🔴')
        playTone(p.success ? 600 : 250, 'sine', 0.3)
      })

      proxChan.on('npc_drama_resolved', (p: any) => {
        if (activeDrama && activeDrama.id === p.drama_id) {
          activeDrama.stage = 'rescued'
        }
        pushLog('npc', '✨ Drama Resolved', p.message, '✨')
      })

      proxChan.on('npc_murder_committed', (p: any) => {
        if (activeDrama && activeDrama.id === p.drama_id) {
          activeDrama.stage = 'murdered'
          activeDrama.clues = p.clues
        }
        pushLog('npc', '🩸 MURDER IN THE SOUTHSIDE!', p.message, '🩸')
        playTone(180, 'sawtooth', 0.6)
      })

      proxChan.on('investigate_crime_result', (p: any) => {
        lastCrimeScene = p
        if (p.message) pushLog('npc', '🔍 Forensic Investigation', p.message, '🔍')
        playTone(480, 'triangle', 0.25)
      })

      // 22. Gas deployment result
      proxChan.on('window_gas_result', (p: any) => {
        lastGasDeploy = {
          success: p.success,
          gas_type: p.gas_type,
          gas_name: p.gas_name || (p.gas_type ? p.gas_type.replace(/_/g, ' ').toUpperCase() : 'Chemical Gas'),
          building_name: p.building_name || 'Building',
          duration_turns: p.duration_turns || 3,
          affected_occupants: p.affected_occupants || (p.affected ? p.affected.length : 0),
          affected: p.affected,
          message: p.message
        }
        if (p.message) pushLog('window', `💨 Gas Deployed: ${lastGasDeploy.gas_name}`, p.message, '💨')
        playTone(400, 'sine', 0.2)
      })

      // 23. Gas cloud active
      proxChan.on('gas_cloud_active', (p: any) => {
        pushLog('window', `💨 Gas Cloud: ${p.gas_name}`, p.message, '💨')
      })

      // 24. Properties list
      proxChan.on('properties_list', (p: any) => {
        const raw = p.properties || []
        propertiesList = raw.map((item: any) => {
          const forts = item.fortifications || []
          return {
            id: item.id,
            building_id: item.building_id,
            building_key: `Building #${item.building_id}`,
            map_id: item.map_id,
            name: item.name,
            price_gold: item.price_gold,
            deed_cost: item.price_gold,
            owner_char_id: item.owner_char_id,
            owner_name: item.owner_name,
            is_for_sale: item.is_for_sale,
            is_owned: item.owner_char_id === storedCharId || (item.owner_name && item.owner_name === storedCharName),
            fortifications: forts,
            has_iron_bars: forts.includes('iron_bars'),
            has_soundproof_curtains: forts.includes('soundproof_curtains'),
            has_alarm_glyphs: forts.includes('alarm_glyphs'),
            curtains_drawn: item.curtains_drawn,
            security_rating: 40 + forts.length * 20
          }
        })
      })

      // 25. Property action result
      proxChan.on('property_action_result', (p: any) => {
        if (p.message) pushLog('diplomacy', '🏡 Property Deed', p.message, '🏡')
        playTone(580, 'sine', 0.15)
      })

      // 26. Indoor draft result
      proxChan.on('indoor_draft_result', (p: any) => {
        lastDraftResult = p
        if (p.message) pushLog('window', '💨 Gale Wind Draft', p.message, '💨')
      })

      // 27. Room draft extinguished
      proxChan.on('room_draft_extinguished', (p: any) => {
        lastDraftResult = {
          draftActive: true,
          candlesExtinguished: true,
          lightLevel: p.light_level,
          stealthBonus: p.stealth_bonus,
          message: p.message
        }
        pushLog('window', '🕯️ Candles Snuffed!', p.message, '🕯️')
        playTone(280, 'sine', 0.2)
      })

      // 28. Thunderclap mask
      proxChan.on('weather_thunderclap', (p: any) => {
        pushLog('window', '⚡ THUNDERCLAP!', p.message, '⚡')
        playTone(110, 'sawtooth', 0.45)
      })

      // 29. God's Eye localized sonar ping broadcast
      proxChan.on('gods_eye_sonar_ping', (p: any) => {
        godsEyeSonarResult = p
        playSonarPing(1400, 0.75)
        lastSonarPingTs = Date.now()
        pushLog('uile', 'Tactical Sonar Sweep', `${p.total_detected} entities acquired across sector (${p.threat_count} threats detected).`, '👁️')
      })

      proxChan.join()
        .receive('ok', () => {
          proximityChannel = proxChan
        })
        .receive('error', (err) => {
          console.warn('[VoiceChat] Proximity channel join failed:', err)
        })
    }
  }

  function getGameChannel(): Channel | null {
    const ch = connection.channel('game:lobby')
    if (ch && !(ch as unknown as { _godsEyeBound?: boolean })._godsEyeBound) {
      ;(ch as unknown as { _godsEyeBound?: boolean })._godsEyeBound = true
      ch.on('gods_eye_scan_result', (p: any) => {
        godsEyeRadar = p
        isScanningGodsEye = false
      })
      ch.on('gods_eye_sonar_result', (p: any) => {
        godsEyeSonarResult = p
        playSonarPing(1400, 0.75)
        lastSonarPingTs = Date.now()
        pushLog('uile', 'Sonar Echo Received', `${p.total_detected} blips acquired (${p.threat_count} hostiles in range).`, '👁️')
      })
      ch.on('gods_eye_wiretap_result', (p: any) => {
        if (!p.error) {
          godsEyeWiretap = p
          playSonarPing(1800, 0.4)
          pushLog('uile', `Signal Locked: ${p.name}`, `Wiretapping conscious thoughts & bio-telemetry.`, '📡')
        }
      })
      ch.on('gods_eye_strike_result', (p: any) => {
        lastOrbitalStrikeResult = p
        playOrbitalBoom()
        pushLog('uile', '⚡ Orbital Strike', p.detail || 'Orbital beam deployed.', '⚡')
      })
      ch.on('gods_eye_supply_result', (p: any) => {
        lastSupplyDropResult = p
        playSonarPing(980, 0.5)
        pushLog('uile', '🎁 Supply Drop', p.detail || 'Celestial cache deployed.', '🎁')
      })
      ch.on('gods_eye_whisper_result', (p: any) => {
        lastWhisperResult = p
        pushLog('uile', '👁️ Omnipresent Whisper', `Whisper transmitted.`, '👁️')
      })
    }

    if (ch && !(ch as unknown as { _systemsBound?: boolean })._systemsBound) {
      ;(ch as unknown as { _systemsBound?: boolean })._systemsBound = true

      // 1. Bounty Board & Black Market Fence
      ch.on('bounty_tasks_result', (p: any) => {
        bountyBoards = p.boards || []
        bountyTasks = p.tasks || []
      })
      ch.on('bounty_tasks', (p: any) => {
        if (p.tasks) bountyTasks = p.tasks
      })
      ch.on('bounty_action_result', (p: any) => {
        lastBountyResult = p
        if (p.success) {
          playBountyFanfare()
          pushLog('diplomacy', '📜 Bounty Contract', p.message, '🎯')
        }
      })
      ch.on('fence_action_result', (p: any) => {
        lastFenceResult = p
        if (p.success) {
          playFenceCoinChime()
          pushLog('npc', '🗡️ Silas the Fence', p.message, '💰')
        }
      })

      // 2. Autonomous NPC Living Schedules
      ch.on('npc_schedules_list', (p: any) => {
        npcSchedulesList = p.schedules || []
      })
      ch.on('npc_schedules_update', (p: any) => {
        if (p.schedules) {
          const updates = p.schedules as Array<{ npc_name: string; x: number; y: number; activity: string; icon?: string }>
          npcSchedulesList = npcSchedulesList.map(item => {
            const up = updates.find(u => u.npc_name === item.name)
            return up ? { ...item, x: up.x, y: up.y, current_activity: up.activity, icon: up.icon || item.icon } : item
          })
          pushLog('npc', `⏰ Circadian Phase: ${p.phase.toUpperCase()}`, `Town denizens migrated to scheduled routines.`, '🚶')
        }
      })

      // 3. Safehouse Stash Vault, Trophy Wall & Guard
      ch.on('property_stash_result', (p: any) => {
        if (p.success) {
          safehouseStash = {
            property_id: p.property_id,
            property_name: p.property_name,
            stash_gold: p.stash_gold || 0,
            guard_companion: p.guard_companion || null,
            items: p.items || [],
            trophies: p.trophies || []
          }
        }
      })
      ch.on('property_stash_action', (p: any) => {
        lastStashAction = p
        if (p.success) {
          playSafehouseLatch()
          pushLog('diplomacy', '🔒 Safehouse Vault', p.message, '🗝️')
        }
      })
      ch.on('property_trophy_action', (p: any) => {
        lastTrophyAction = p
        if (p.success) {
          playTone(680, 'triangle', 0.25)
          pushLog('diplomacy', '🏆 Wall Mount Trophy', p.message, '🏆')
        }
      })
      ch.on('property_guard_action', (p: any) => {
        if (p.success) {
          pushLog('companion', '🛡️ Safehouse Guard', p.message, '🛡️')
        }
      })

      // 4. Ashveil Colossus Apex Raid & Planet Mado Active Defense
      ch.on('colossus_state', (p: any) => {
        colossusRaid = p
      })
      ch.on('colossus_strike_update', (p: any) => {
        if (colossusRaid) {
          colossusRaid = {
            ...colossusRaid,
            boss_hp: p.boss_hp,
            phase: p.phase,
            phase_name: p.phase_name,
            limbs: p.limbs,
            is_defeated: p.is_defeated
          }
        }
        if (p.limb_broken) {
          playTone(280, 'sawtooth', 0.3)
          pushLog('uile', '💥 Colossus Limb Broken!', `${p.limb_hit.replace('_', ' ').toUpperCase()} has been destroyed!`, '🔨')
        }
      })
      ch.on('colossus_strike_result', (p: any) => {
        if (p.message) {
          pushLog('uile', '⚔️ Raid Strike', p.message, '⚔️')
        }
      })
      ch.on('colossus_telegraph', (p: any) => {
        colossusTelegraph = p
        playColossusRoar()
        pushLog('uile', `⚠️ Colossus Telegraph: ${p.name}`, `Telegraph window active (${p.telegraph_ms}ms)! Time your Parry/Dodge!`, '🌋')
      })
      ch.on('colossus_defense_result', (p: any) => {
        colossusDefenseResult = p
        colossusTelegraph = null
        if (p.staggered_boss) {
          playPerfectParryClash()
          pushLog('uile', '⚡ PERFECT PARRY!', p.message, '🛡️')
        } else {
          playTone(180, 'sawtooth', 0.25)
          pushLog('uile', '💥 Colossus Impact', p.message, '💥')
        }
      })
      ch.on('colossus_loot_result', (p: any) => {
        colossusLootResult = p
        if (p.success) {
          playBountyFanfare()
          pushLog('uile', '👑 Colossus Raid Cleared!', p.message, '👑')
        }
      })

      // 5. Engine Feature Flags Matrix
      ch.on('feature_flags_state', (p: any) => {
        featureFlags = p.flags || []
      })
      ch.on('feature_flag_toggled', (p: any) => {
        featureFlags = featureFlags.map(f => f.feature_key === p.feature_key ? { ...f, is_enabled: p.is_enabled } : f)
      })

      // 6. Safehouse Bastion Workshop
      ch.on('safehouse_workshop_state', (p: any) => {
        workshopState = p
      })
      ch.on('workshop_rune_result', (p: any) => {
        lastWorkshopResult = p
        if (p.bonus_stat) {
          playRuneForgeClink()
          pushLog('diplomacy', '⚒️ Runeforging Anvil', p.message, '✨')
        }
      })
      ch.on('workshop_brew_result', (p: any) => {
        lastWorkshopResult = p
        if (p.finishes_at || p.item_name) {
          playAlembicBubble()
          pushLog('diplomacy', '🧪 Alchemy Alembic', p.message, '🧪')
        }
      })
      ch.on('workshop_dispatch_result', (p: any) => {
        lastWorkshopResult = p
        if (p.reward_gold) {
          playFenceCoinChime()
          pushLog('companion', '💼 Smuggler Expedition', p.message, '💼')
        }
      })

      // 7. Spoken Dungeon Catacombs On-Demand via Uile
      ch.on('catacomb_dungeon_state', (p: any) => {
        activeCatacomb = p
      })
      ch.on('catacomb_action_result', (p: any) => {
        lastCatacombResult = p
        playCatacombDoorRumble()
        pushLog('uile', '🗝️ Catacomb Expedition', p.message, '💀')
      })

      // 8. Dynamic Faction Territory Wars & Turf Control
      ch.on('faction_territories_state', (p: any) => {
        factionDistricts = p.districts || []
      })
      ch.on('territory_shift_result', (p: any) => {
        lastTerritoryResult = p
        playTone(520, 'triangle', 0.2)
        pushLog('diplomacy', '🚩 Territory Shift', p.reason || 'District influence updated.', '🚩')
      })

      // 9. Forensic Murder Mystery & Courtroom Trials
      ch.on('forensic_cases_state', (p: any) => {
        forensicCases = p.cases || []
      })
      ch.on('forensic_case_details', (p: any) => {
        activeCaseDetails = p
      })
      ch.on('forensic_action_result', (p: any) => {
        lastForensicResult = p
        playTone(600, 'sine', 0.15)
        pushLog('npc', '🔍 Forensic Investigation', p.message, '🔍')
      })
      ch.on('forensic_verdict_result', (p: any) => {
        lastForensicResult = p
        playGavelStrike()
        pushLog('diplomacy', '⚖️ Courtroom Verdict', p.message, '⚖️')
      })

      // 10. Real-Time Spoken Spellcrafting & Squad Voice Tactics
      ch.on('spoken_spell_result', (p: any) => {
        lastVoiceCombatResult = p
        if (p.total_power) {
          playIncantationResonance()
          pushLog('uile', `🔥 Incantation: ${p.spell_name}`, p.message, '🔥')
        }
      })
      ch.on('squad_voice_cmd_result', (p: any) => {
        lastVoiceCombatResult = p
        if (p.shout) {
          playTone(480, 'sine', 0.2)
          pushLog('companion', `🗣️ ${p.companion}`, p.shout, '🛡️')
        }
      })
      ch.on('voice_combat_capabilities', (p: any) => {
        voiceCombatCaps = p
      })
    }
    return ch
  }

  return {
    get inVoice() { return inVoice },
    get isMuted() { return isMuted },
    get isDeafened() { return isDeafened },
    get transmissionBand() { return transmissionBand },
    get timeOfDay() { return timeOfDay },
    get partyId() { return currentPartyId },
    get proximityMapId() { return currentProximityMapId },
    get peers() { return Array.from(peers.values()) },
    get speakingPeers() { return speakingPeers },
    get lastBattleCry() { return lastBattleCry },
    get lastSpatialPeerSpeech() { return lastSpatialPeerSpeech },
    get lastFootstep() { return lastFootstep },
    get lastAwakenedNpc() { return lastAwakenedNpc },
    get lastCompanionSpeech() { return lastCompanionSpeech },
    get lastCompanionAction() { return lastCompanionAction },
    get lastNpcReaction() { return lastNpcReaction },
    get lastNpcAction() { return lastNpcAction },
    get lastUileWarp() { return lastUileWarp },
    get lastDrunkConfrontation() { return lastDrunkConfrontation },
    get lastDeescalateResult() { return lastDeescalateResult },
    get nearbyWindow() { return nearbyWindow },
    get lastPeekResult() { return lastPeekResult },
    get lastRumorResult() { return lastRumorResult },
    get lastWindowAction() { return lastWindowAction },
    get lastDefenestration() { return lastDefenestration },
    get activeStalker() { return activeStalker },
    get lastStalkerAction() { return lastStalkerAction },
    get lastAddictResult() { return lastAddictResult },
    get lastGasDeploy() { return lastGasDeploy },
    get propertiesList() { return propertiesList },
    get lastDraftResult() { return lastDraftResult },
    get activeDrama() { return activeDrama },
    get lastDramaIntervention() { return lastDramaIntervention },
    get lastCrimeScene() { return lastCrimeScene },
    get activeBrawl() { return activeBrawl },
    get lastBrawlAction() { return lastBrawlAction },
    get tacticalLog() { return tacticalLog },

    // God's Eye Getters
    get godsEyeActive() { return godsEyeActive },
    get godsEyeRadar() { return godsEyeRadar },
    get godsEyeSonarResult() { return godsEyeSonarResult },
    get godsEyeWiretap() { return godsEyeWiretap },
    get isScanningGodsEye() { return isScanningGodsEye },
    get lastSonarPingTs() { return lastSonarPingTs },
    get lastOrbitalStrikeResult() { return lastOrbitalStrikeResult },
    get lastSupplyDropResult() { return lastSupplyDropResult },
    get lastWhisperResult() { return lastWhisperResult },

    // 1. Bounty & Fence Getters
    get bountyBoards() { return bountyBoards },
    get bountyTasks() { return bountyTasks },
    get lastBountyResult() { return lastBountyResult },
    get lastFenceResult() { return lastFenceResult },

    // 2. Schedules Getters
    get npcSchedulesList() { return npcSchedulesList },

    // 3. Safehouse Stash & Trophies Getters
    get safehouseStash() { return safehouseStash },
    get lastStashAction() { return lastStashAction },
    get lastTrophyAction() { return lastTrophyAction },

    // 4. Ashveil Colossus Getters
    get colossusRaid() { return colossusRaid },
    get colossusTelegraph() { return colossusTelegraph },
    get colossusDefenseResult() { return colossusDefenseResult },
    get colossusLootResult() { return colossusLootResult },

    // 5 Next-Tier RPG Systems & Master Feature Flags Getters
    get featureFlags() { return featureFlags },
    get workshopState() { return workshopState },
    get lastWorkshopResult() { return lastWorkshopResult },
    get activeCatacomb() { return activeCatacomb },
    get lastCatacombResult() { return lastCatacombResult },
    get factionDistricts() { return factionDistricts },
    get lastTerritoryResult() { return lastTerritoryResult },
    get forensicCases() { return forensicCases },
    get activeCaseDetails() { return activeCaseDetails },
    get lastForensicResult() { return lastForensicResult },
    get lastVoiceCombatResult() { return lastVoiceCombatResult },
    get voiceCombatCaps() { return voiceCombatCaps },

    setGodsEyeRadar(data: GodsEyeScanResult) {
      godsEyeRadar = data
      isScanningGodsEye = false
    },

    setGodsEyeSonarResult(data: GodsEyeSonarResult) {
      godsEyeSonarResult = data
      playSonarPing(1400, 0.75)
      lastSonarPingTs = Date.now()
    },

    setGodsEyeWiretap(data: GodsEyeWiretap) {
      godsEyeWiretap = data
      playSonarPing(1800, 0.4)
    },

    onGodsEyeStrike(res: { detail?: string }) {
      lastOrbitalStrikeResult = res
      playOrbitalBoom()
      if (res.detail) pushLog('uile', '⚡ Orbital Strike Impact', res.detail, '⚡')
    },

    onGodsEyeSupply(res: { detail?: string }) {
      lastSupplyDropResult = res
      playSonarPing(980, 0.5)
      if (res.detail) pushLog('uile', '🎁 Supply Drop Deployed', res.detail, '🎁')
    },

    toggleGodsEye(open?: boolean) {
      godsEyeActive = open !== undefined ? open : !godsEyeActive
      if (godsEyeActive) {
        playSonarPing(1600, 0.6)
        this.scanGodsEye()
        this.pingGodsEyeSonar(15)
      }
    },

    scanGodsEye() {
      isScanningGodsEye = true
      const ch = getGameChannel()
      if (ch) {
        ch.push('gods_eye_scan', {})
      }
    },

    pingGodsEyeSonar(radius = 15) {
      const ch = getGameChannel()
      const mapId = character.active?.map_id || currentProximityMapId || 1
      const x = character.active?.x || 10
      const y = character.active?.y || 10

      playSonarPing(1400, 0.75)
      lastSonarPingTs = Date.now()

      if (ch) {
        ch.push('gods_eye_sonar_ping', { map_id: mapId, x, y, radius })
      }
    },

    wiretapEntity(type: 'player' | 'npc', id: number) {
      const ch = getGameChannel()
      if (ch) {
        ch.push('gods_eye_wiretap', { type, id })
      }
    },

    requestOrbitalStrike(mapId: number, x: number, y: number, damage = 750) {
      const ch = getGameChannel()
      playOrbitalBoom()
      if (ch) {
        ch.push('gods_eye_orbital_strike', { map_id: mapId, x, y, damage })
      }
    },

    requestSupplyDrop(mapId: number, x: number, y: number) {
      const ch = getGameChannel()
      playSonarPing(980, 0.5)
      if (ch) {
        ch.push('gods_eye_supply_drop', { map_id: mapId, x, y })
      }
    },

    sendOrbitalWhisper(targetCharId: number, message: string) {
      const ch = getGameChannel()
      if (ch) {
        ch.push('gods_eye_whisper', { target_char_id: targetCharId, message })
      }
    },

    dismissGodsEyeWiretap() {
      godsEyeWiretap = null
    },

    attemptDeescalation(targetNpcId: number, approach: string) {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('deescalate_altercation', {
          target_npc_id: targetNpcId,
          approach
        })
      }
    },

    dismissDrunkConfrontation() {
      lastDrunkConfrontation = null
    },

    toggleWindow(windowX: number, windowY: number, targetState?: string) {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('toggle_window', { window_x: windowX, window_y: windowY, target_state: targetState })
      }
    },

    peekWindow(windowX: number, windowY: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('peek_window', { window_x: windowX, window_y: windowY })
      }
    },

    climbWindow(windowX: number, windowY: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('climb_window', { window_x: windowX, window_y: windowY })
      }
    },

    breakWindow(windowX: number, windowY: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('break_window', { window_x: windowX, window_y: windowY })
      }
    },

    throwDistraction(windowX: number, windowY: number, item = 'pebble') {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('throw_window_distraction', { window_x: windowX, window_y: windowY, item })
      }
    },

    eavesdropWindow(windowX: number, windowY: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('eavesdrop_window', { window_x: windowX, window_y: windowY })
      }
    },

    checkNearbyWindows() {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('get_nearby_windows', {})
      }
    },

    dismissPeek() {
      lastPeekResult = null
    },

    dismissRumor() {
      lastRumorResult = null
    },

    defenestrateTarget(targetId: number, windowX: number, windowY: number, targetName?: string, isPlayer: boolean = false) {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('defenestrate_target', {
          target_id: targetId,
          target_name: targetName,
          target_is_player: isPlayer,
          window_x: windowX,
          window_y: windowY
        })
      }
    },

    spotStalker(stalkerId: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('spot_stalker', { stalker_id: stalkerId })
      }
    },

    interactStalker(stalkerId: number, action: 'interrogate' | 'bribe' | 'attack') {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('interact_stalker', { stalker_id: stalkerId, action })
      }
    },

    interactAddict(addictId: number, action: 'offer_fix' | 'threaten' | 'pickpocket_check') {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('interact_addict', { addict_id: addictId, action })
      }
    },

    cascadeBrawl(tavernBuildingId?: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('cascade_brawl', { tavern_building_id: tavernBuildingId })
      }
    },

    defenestrateBrawler(targetId: number, windowX?: number, windowY?: number, targetName?: string) {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('defenestrate_brawler', {
          target_id: targetId,
          target_name: targetName,
          window_x: windowX,
          window_y: windowY
        })
      }
    },

    triggerBrawlTick() {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('brawl_round_tick', {})
      }
    },

    dismissBrawl() {
      activeBrawl = null
      lastBrawlAction = null
    },

    getNpcDrama() {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('get_npc_drama', {})
      }
    },

    triggerNocturnalStalking() {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('trigger_nocturnal_stalking', {})
      }
    },

    interveneNpcDrama(dramaId: number, action: 'tackle' | 'deadpool_talkdown' | 'eavesdrop' | 'attack' | 'shout' = 'deadpool_talkdown') {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('intervene_npc_drama', { drama_id: dramaId, action })
      }
    },

    tickNpcDrama(dramaId: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('tick_npc_drama', { drama_id: dramaId })
      }
    },

    investigateCrimeScene(dramaId: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('investigate_crime_scene', { drama_id: dramaId })
      }
    },

    dismissDrama() {
      lastDramaIntervention = null
    },

    dismissCrimeScene() {
      lastCrimeScene = null
    },

    deployWindowGas(windowX: number, windowY: number, gasType: 'sleeping_gas' | 'smoke_grenade' | 'skunkweed_tear_gas' = 'sleeping_gas') {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('deploy_window_gas', { window_x: windowX, window_y: windowY, gas_type: gasType })
      }
    },

    getProperties() {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('get_properties', {})
      }
    },

    purchaseProperty(propertyId: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('purchase_property', { property_id: propertyId })
      }
    },

    addFortification(propertyId: number, fortificationType: string) {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('add_fortification', { property_id: propertyId, fortification_type: fortificationType })
      }
    },

    toggleCurtains(propertyId: number, drawn: boolean) {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('toggle_soundproof_curtains', { property_id: propertyId, drawn })
      }
    },

    restInProperty(propertyId: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('rest_property', { property_id: propertyId })
      }
    },

    checkIndoorDraft(buildingId: number | string) {
      const activeChan = channel || proximityChannel
      if (activeChan) {
        activeChan.push('check_indoor_draft', { building_id: buildingId })
      }
    },

    dismissDefenestration() {
      lastDefenestration = null
    },

    dismissStalker() {
      activeStalker = null
      lastStalkerAction = null
    },

    dismissAddict() {
      lastAddictResult = null
    },

    dismissGasDeploy() {
      lastGasDeploy = null
    },

    dismissDraft() {
      lastDraftResult = null
    },

    setNearbyWindow(win: WindowPortal | null) {
      nearbyWindow = win
    },

    setTransmissionBand(band: TransmissionBand) {
      transmissionBand = band
      if (band === 'party') {
        playTone(880, 'sine', 0.12)
      } else if (band === 'proximity') {
        playTone(587, 'sine', 0.1)
      } else if (band === 'whisper') {
        playTone(330, 'triangle', 0.1)
      } else if (band === 'shout') {
        playTone(440, 'sawtooth', 0.18)
      }
    },

    syncProximityMap(mapId: number) {
      if (inVoice && mapId && currentProximityMapId !== mapId) {
        setupProximityChannel(mapId, storedCharId, storedCharName)
      }
    },

    sendPartySpeech(text: string, isThought: boolean = false, coords?: { map_id?: number; x?: number; y?: number }) {
      if (!text || !text.trim()) return
      const targetChannel = channel || proximityChannel
      if (!targetChannel) return

      const effectiveMode = isThought ? 'mind' : transmissionBand
      const mapId = coords?.map_id ?? character.active?.map_id ?? currentProximityMapId ?? 1
      const x = coords?.x ?? character.active?.x ?? 10
      const y = coords?.y ?? character.active?.y ?? 10

      targetChannel.push('party_speech', {
        text: text.trim(),
        is_thought: isThought,
        mode: effectiveMode,
        map_id: mapId,
        x,
        y
      })
    },

    async join(partyId: string | number, charId: number, name: string, mapId?: number) {
      if (!browser || inVoice) return
      currentPartyId = partyId
      storedCharId = charId
      storedCharName = name

      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      } catch (err) {
        console.warn('[VoiceChat] Mic access denied or unavailable, entering listen-only mode:', err)
        isMuted = true
      }

      // 1. Join Party Voice Channel
      const topic = `voice:party:${partyId}`
      channel = connection.channel(topic, { char_id: charId, name })

      if (channel) {
        channel.on('peer_joined', (p: { char_id: number; name: string }) => {
          const next = new Map(peers)
          next.set(p.char_id, { charId: p.char_id, name: p.name, speaking: false, muted: false })
          peers = next
          playTone(600, 'sine', 0.1)
        })

        channel.on('peer_left', (p: { char_id: number }) => {
          const next = new Map(peers)
          next.delete(p.char_id)
          peers = next
          const nextSpeaking = new Set(speakingPeers)
          nextSpeaking.delete(p.char_id)
          speakingPeers = nextSpeaking
          playTone(400, 'sine', 0.1)
        })

        channel.on('peer_speaking', (p: { char_id: number; is_speaking: boolean }) => {
          const nextSpeaking = new Set(speakingPeers)
          if (p.is_speaking) {
            nextSpeaking.add(p.char_id)
          } else {
            nextSpeaking.delete(p.char_id)
          }
          speakingPeers = nextSpeaking

          const pEntry = peers.get(p.char_id)
          if (pEntry) {
            const next = new Map(peers)
            next.set(p.char_id, { ...pEntry, speaking: p.is_speaking })
            peers = next
          }
        })

        channel.on('battle_cry', (p: { char_id: number; name: string; cry: string }) => {
          lastBattleCry = { speaker: p.name || 'Party Member', cry: p.cry, ts: Date.now() }
          playBattleHorn()
        })

        // Companion Spoken Reaction
        channel.on('companion_voice_spoke', (p: any) => {
          lastCompanionSpeech = {
            companionId: p.companion_id,
            name: p.name,
            icon: p.icon || '🐺',
            text: p.text,
            audioUrl: p.audio_url,
            tactic: p.tactic,
            isThought: p.is_thought,
            ts: Date.now()
          }

          if (p.audio_url) {
            new Audio(p.audio_url).play().catch(() => {})
          } else if (browser && window.speechSynthesis && !isDeafened) {
            window.speechSynthesis.cancel()
            const utter = new SpeechSynthesisUtterance(p.text)
            const s = (p.name || '').toLowerCase()
            if (s.includes('valerius') || s.includes('paladin') || s.includes('golem')) {
              utter.pitch = 0.78
              utter.rate = 0.95
            } else if (s.includes('lyra') || s.includes('mage') || s.includes('sorceress')) {
              utter.pitch = 1.18
              utter.rate = 0.94
            } else {
              utter.pitch = 0.9
              utter.rate = 1.0
            }
            window.speechSynthesis.speak(utter)
          }
        })

        // Companion Physical / Tactical Action Execution
        channel.on('companion_action_executed', (p: any) => {
          lastCompanionAction = {
            companionId: p.companion_id,
            companionName: p.companion_name,
            icon: p.icon || '🛡️',
            actionType: p.action_type,
            actionName: p.action_name,
            description: p.description,
            targetName: p.target_name,
            buff: p.buff,
            posShift: p.pos_shift,
            animation: p.animation,
            isThoughtReaction: p.is_thought_reaction,
            ts: Date.now()
          }
          pushLog('companion', p.action_name, p.description, p.icon || '🛡️')
          playTone(550, 'triangle', 0.12)
        })

        // World NPC Overhearing / Eavesdropping Spoken Reply
        channel.on('npc_overheard_reaction', (p: any) => {
          lastNpcReaction = {
            npcId: p.npc_id,
            name: p.name,
            icon: p.icon || '👤',
            role: p.role,
            text: p.text,
            audioUrl: p.audio_url,
            distanceTiles: p.distance_tiles,
            isThoughtIntercept: p.is_thought_intercept,
            isEnemy: p.is_enemy,
            isNocturnal: p.is_nocturnal,
            isSleeping: p.is_sleeping,
            spatial: p.spatial,
            ts: Date.now()
          }

          const pan = p.spatial?.pan ?? 0
          const vol = p.spatial?.volume ?? 0.85
          playSpatialSpeech(p.text, pan, vol, p.audio_url, p.is_enemy)
        })

        // World NPC Action Execution
        channel.on('npc_action_executed', (p: any) => {
          lastNpcAction = {
            npcId: p.npc_id,
            npcName: p.npc_name,
            icon: p.icon || '👹',
            actionType: p.action_type,
            actionName: p.action_name,
            description: p.description,
            targetName: p.target_name,
            distanceTiles: p.distance_tiles,
            buff: p.buff,
            newCoords: p.new_coords,
            alarmTriggered: p.alarm_triggered,
            isThoughtIntercept: p.is_thought_intercept,
            isAwakened: p.is_awakened,
            spatial: p.spatial,
            ts: Date.now()
          }
          pushLog('npc', p.action_name, p.description, p.icon || '⚠️')
          if (p.alarm_triggered) {
            playTone(320, 'sawtooth', 0.25)
          }
        })

        // Uile Reality Warp Intervention
        channel.on('uile_reality_intervention', (p: any) => {
          lastUileWarp = {
            warpType: p.warp_type,
            title: p.title,
            message: p.message,
            speaker: p.speaker,
            audioUrl: p.audio_url,
            invoker: p.invoker,
            buff: p.buff,
            ts: Date.now()
          }
          pushLog('uile', p.title, p.message, '✨')
          if (p.audio_url) {
            new Audio(p.audio_url).play().catch(() => {})
          } else if (browser && window.speechSynthesis && !isDeafened) {
            const utter = new SpeechSynthesisUtterance(p.message)
            utter.pitch = 0.55
            utter.rate = 0.88
            window.speechSynthesis.speak(utter)
          }
          playTone(880, 'sine', 0.3)
        })

        channel.join()
          .receive('ok', () => {
            inVoice = true
            playTone(880, 'triangle', 0.15)
            this.setupVoiceActivityDetection()
          })
          .receive('error', (err) => {
            console.error('[VoiceChat] Failed to join voice room:', err)
          })
      }

      // 2. Also join Spatial Proximity Channel for the current map
      const effectiveMapId = mapId || character.active?.map_id || 1
      setupProximityChannel(effectiveMapId, charId, name)
    },

    setupVoiceActivityDetection() {
      if (!localStream || !browser) return
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        audioCtx = new AudioCtx()
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 64
        const source = audioCtx.createMediaStreamSource(localStream)
        source.connect(analyser)

        const pcm = new Uint8Array(analyser.frequencyBinCount)
        vadInterval = window.setInterval(() => {
          if (!analyser || isMuted || (!channel && !proximityChannel)) return
          analyser.getByteFrequencyData(pcm)
          let sum = 0
          for (let i = 0; i < pcm.length; i++) sum += pcm[i]
          const avg = sum / pcm.length
          const isSpeakingNow = avg > 20

          if (isSpeakingNow !== wasSpeaking) {
            wasSpeaking = isSpeakingNow
            channel?.push('speaking', { is_speaking: isSpeakingNow })
            proximityChannel?.push('speaking', { is_speaking: isSpeakingNow })
          }
        }, 120)
      } catch (e) {
        console.warn('[VoiceChat] VAD setup skipped:', e)
      }
    },

    toggleMute() {
      isMuted = !isMuted
      if (localStream) {
        localStream.getAudioTracks().forEach(t => { t.enabled = !isMuted })
      }
      channel?.push('mute_state', { muted: isMuted, deafened: isDeafened })
      proximityChannel?.push('mute_state', { muted: isMuted, deafened: isDeafened })
      playTone(isMuted ? 300 : 700, 'sine', 0.1)
    },

    toggleDeafen() {
      isDeafened = !isDeafened
      if (isDeafened) {
        isMuted = true
        if (localStream) localStream.getAudioTracks().forEach(t => { t.enabled = false })
      }
      channel?.push('mute_state', { muted: isMuted, deafened: isDeafened })
      proximityChannel?.push('mute_state', { muted: isMuted, deafened: isDeafened })
      playTone(isDeafened ? 250 : 650, 'sine', 0.1)
    },

    shoutBattleCry(customCry?: string, coords?: { map_id?: number; x?: number; y?: number }) {
      const cry = customCry || "LEEROY JENKINS!!!"
      const targetChannel = channel || proximityChannel
      if (!targetChannel) return

      const mapId = coords?.map_id ?? character.active?.map_id ?? currentProximityMapId ?? 1
      const x = coords?.x ?? character.active?.x ?? 10
      const y = coords?.y ?? character.active?.y ?? 10

      targetChannel.push('battle_cry', {
        cry,
        map_id: mapId,
        x,
        y
      })
    },

    // ── Bounty Board & Fence Methods ──
    getBountyBoards() {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('bounty_get_boards', {})
    },
    acceptBounty(taskId: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('bounty_accept_task', { task_id: taskId })
    },
    turnInBounty(taskId: number, captureMethod: string = 'alive') {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('bounty_turn_in', { task_id: taskId, capture_method: captureMethod })
    },
    fenceSellLoot(lootType: string, quantity: number = 1) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('fence_sell_loot', { loot_type: lootType, quantity })
    },
    fenceBuyContraband(itemType: string) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('fence_buy_contraband', { item_type: itemType })
    },
    dismissBountyResult() {
      lastBountyResult = null
    },
    dismissFenceResult() {
      lastFenceResult = null
    },

    // ── NPC Living Schedules Methods ──
    getNpcSchedules(mapId?: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('schedules_get_active', { map_id: mapId })
    },
    forceCircadianSchedule(phase: string, mapId?: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('schedules_force_phase', { phase, map_id: mapId })
    },

    // ── Safehouse Stash & Trophy Wall Methods ──
    getSafehouseStash(propertyId: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('property_get_stash', { property_id: propertyId })
    },
    depositSafehouseGold(propertyId: number, amount: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('property_deposit_gold', { property_id: propertyId, amount })
    },
    withdrawSafehouseGold(propertyId: number, amount: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('property_withdraw_gold', { property_id: propertyId, amount })
    },
    depositSafehouseItem(propertyId: number, itemKey: string, itemName: string, quantity: number = 1, meta?: Record<string, unknown>) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('property_deposit_item', { property_id: propertyId, item_key: itemKey, item_name: itemName, quantity, meta })
    },
    withdrawSafehouseItem(propertyId: number, stashId: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('property_withdraw_item', { property_id: propertyId, stash_id: stashId })
    },
    mountSafehouseTrophy(propertyId: number, trophyKey: string) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('property_mount_trophy', { property_id: propertyId, trophy_key: trophyKey })
    },
    removeSafehouseTrophy(propertyId: number, trophyId: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('property_remove_trophy', { property_id: propertyId, trophy_id: trophyId })
    },
    assignSafehouseGuard(propertyId: number, companionId: number, companionName: string) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('property_assign_guard', { property_id: propertyId, companion_id: companionId, companion_name: companionName })
    },

    // ── Ashveil Colossus Apex Raid & Active Defense Methods ──
    getColossusState(mapId?: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('colossus_get_state', { map_id: mapId })
    },
    strikeColossusLimb(limb: string, damage: number = 150) {
      const activeChan = channel || proximityChannel
      const raidId = colossusRaid?.id || 1
      if (activeChan) activeChan.push('colossus_strike_limb', { raid_id: raidId, limb, damage })
    },
    triggerColossusTelegraph(attackType: string = 'overhead_slam') {
      const activeChan = channel || proximityChannel
      const raidId = colossusRaid?.id || 1
      if (activeChan) activeChan.push('colossus_trigger_telegraph', { raid_id: raidId, attack_type: attackType })
    },
    reactColossusActiveDefense(defenseType: 'parry' | 'dodge' | 'block', timingMs?: number) {
      const activeChan = channel || proximityChannel
      const raidId = colossusRaid?.id || 1
      const now = Date.now()
      const t = colossusTelegraph
      const computedTimingMs = timingMs !== undefined ? timingMs : (t ? Math.round(now - (t.started_at + t.telegraph_ms)) : 100)
      if (activeChan) activeChan.push('colossus_active_defense_react', { raid_id: raidId, defense_type: defenseType, timing_ms: computedTimingMs })
    },
    claimColossusLoot() {
      const activeChan = channel || proximityChannel
      const raidId = colossusRaid?.id || 1
      if (activeChan) activeChan.push('colossus_claim_loot', { raid_id: raidId })
    },
    dismissColossusDefense() {
      colossusDefenseResult = null
    },
    dismissColossusLoot() {
      colossusLootResult = null
    },

    // ── 1. Master Feature Flags Matrix ──
    getFeatureFlags() {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('get_feature_flags', {})
    },
    toggleFeatureFlag(featureKey: string, isEnabled: boolean) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('toggle_feature_flag', { feature_key: featureKey, is_enabled: isEnabled })
    },
    setAllFeatureFlags(flagsMap: Record<string, boolean>) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('set_all_feature_flags', { flags: flagsMap })
    },

    // ── 2. Safehouse Bastion Workshop ──
    getSafehouseWorkshop(propertyId: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('get_safehouse_workshop', { property_id: propertyId })
    },
    socketWorkshopRune(propertyId: number, itemId: string, itemName: string, runeKey: string, slot: string = 'primary') {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('socket_workshop_rune', { property_id: propertyId, item_id: itemId, item_name: itemName, rune_key: runeKey, slot })
    },
    unsocketWorkshopRune(propertyId: number, runeId: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('unsocket_workshop_rune', { property_id: propertyId, rune_id: runeId })
    },
    brewWorkshopConcoction(propertyId: number, recipeKey: string) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('brew_workshop_concoction', { property_id: propertyId, recipe_key: recipeKey })
    },
    claimWorkshopConcoction(propertyId: number, brewId: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('claim_workshop_concoction', { property_id: propertyId, brew_id: brewId })
    },
    startWorkshopDispatch(propertyId: number, companionId: number, companionName: string, missionType: string) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('start_workshop_dispatch', { property_id: propertyId, companion_id: companionId, companion_name: companionName, mission_type: missionType })
    },
    claimWorkshopDispatch(propertyId: number, dispatchId: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('claim_workshop_dispatch', { property_id: propertyId, dispatch_id: dispatchId })
    },
    dismissWorkshopResult() {
      lastWorkshopResult = null
    },

    // ── 3. Spoken Dungeon Catacombs On-Demand via Uile ──
    generateCatacomb(prompt: string, theme: string = 'sunken_crypt', dangerLevel: string = 'hard') {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('generate_catacomb', { prompt, theme, danger_level: dangerLevel, creator_char_id: storedCharId })
    },
    getCatacombState(dungeonId?: number) {
      const activeChan = channel || proximityChannel
      const id = dungeonId || activeCatacomb?.id || 1
      if (activeChan) activeChan.push('get_catacomb_state', { dungeon_id: id })
    },
    clearCatacombRoom(dungeonId: number, roomIndex: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('clear_catacomb_room', { dungeon_id: dungeonId, room_index: roomIndex })
    },
    dismissCatacombResult() {
      lastCatacombResult = null
    },

    // ── 4. Dynamic Faction Territory Wars & District Turf Control ──
    getFactionTerritories() {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('get_faction_territories', {})
    },
    shiftFactionInfluence(districtKey: string, faction: string, delta: number, reason?: string) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('shift_faction_influence', { district_key: districtKey, faction, delta, reason })
    },
    triggerTurfSkirmish(districtKey: string, attackingFaction: string) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('trigger_turf_skirmish', { district_key: districtKey, attacking_faction: attackingFaction })
    },
    toggleDistrictMartialLaw(districtKey: string, isActive: boolean) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('toggle_district_martial_law', { district_key: districtKey, is_active: isActive })
    },

    // ── 5. Forensic Murder Mystery & Courtroom Trials ──
    getForensicCases() {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('get_forensic_cases', {})
    },
    getForensicCaseDetails(caseId: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('get_forensic_case_details', { case_id: caseId })
    },
    inspectCrimeSceneClues(caseId: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('inspect_crime_scene_clues', { case_id: caseId })
    },
    interrogateCaseSuspect(caseId: number, suspectId: number, tactic: string = 'pressure') {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('interrogate_case_suspect', { case_id: caseId, suspect_id: suspectId, tactic })
    },
    holdCourtroomTrial(caseId: number, accusedSuspectId: number) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('hold_courtroom_trial', { case_id: caseId, accused_suspect_id: accusedSuspectId })
    },
    bribeFrameSuspect(caseId: number, frameSuspectId: number, bribeGold: number = 350) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('bribe_frame_suspect', { case_id: caseId, frame_suspect_id: frameSuspectId, bribe_gold: bribeGold })
    },
    dismissForensicResult() {
      lastForensicResult = null
    },

    // ── 6. Real-Time Spoken Combat Spellcrafting & Squad Voice Tactics ──
    castSpokenSpell(phrase: string, pitchHz: number = 220, amplitudeDb: number = -12.0) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('cast_spoken_spell', { phrase, pitch_hz: pitchHz, amplitude_db: amplitudeDb, char_id: storedCharId })
    },
    issueSquadVoiceCmd(command: string) {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('issue_squad_voice_cmd', { command, char_id: storedCharId })
    },
    getVoiceCombatCapabilities() {
      const activeChan = channel || proximityChannel
      if (activeChan) activeChan.push('get_voice_combat_capabilities', {})
    },
    dismissVoiceCombatResult() {
      lastVoiceCombatResult = null
    },
    dismissVoiceCombatAlert() {
      lastVoiceCombatResult = null
    },
    dismissWorkshopAlert() {
      lastWorkshopResult = null
    },
    dismissCatacombAlert() {
      lastCatacombResult = null
    },
    dismissTerritoryAlert() {
      lastTerritoryResult = null
    },
    dismissForensicAlert() {
      lastForensicResult = null
    },
    castIncantation(phrase: string, amplitude: number = 0.85, pitchHz: number = 220) {
      this.castSpokenSpell(phrase, pitchHz, (amplitude - 1.0) * 20)
    },
    issueSquadVoiceCommand(command: string) {
      this.issueSquadVoiceCmd(command)
    },

    leave() {
      if (vadInterval) clearInterval(vadInterval)
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop())
        localStream = null
      }
      if (audioCtx) {
        audioCtx.close().catch(() => {})
        audioCtx = null
      }
      if (proximityChannel) {
        proximityChannel.leave()
        proximityChannel = null
      }
      channel?.leave()
      channel = null
      inVoice = false
      peers = new Map()
      speakingPeers = new Set()
      lastSpatialPeerSpeech = null
      lastFootstep = null
      lastAwakenedNpc = null
      tacticalLog = []
      playTone(400, 'sine', 0.12)
    }
  }
}

export const voiceChat = createVoiceChatStore()
