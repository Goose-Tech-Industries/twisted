"use client"

import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

// =================================================================
// AUDIO TYPES
// =================================================================
type SoundCategory = 'ui' | 'combat' | 'ambient' | 'music'

interface AudioSettings {
  masterVolume: number
  musicVolume: number
  sfxVolume: number
  ambientVolume: number
  muted: boolean
}

interface AudioState {
  settings: AudioSettings
  currentMusic: string | null
  isPlaying: boolean
}

// Sound effect definitions
const SOUND_EFFECTS = {
  // UI sounds
  'ui-click': { src: '/audio/click.mp3', category: 'ui' as SoundCategory, volume: 0.5 },
  'ui-hover': { src: '/audio/hover.mp3', category: 'ui' as SoundCategory, volume: 0.3 },
  'ui-open': { src: '/audio/panel-open.mp3', category: 'ui' as SoundCategory, volume: 0.4 },
  'ui-close': { src: '/audio/panel-close.mp3', category: 'ui' as SoundCategory, volume: 0.4 },
  'ui-error': { src: '/audio/error.mp3', category: 'ui' as SoundCategory, volume: 0.6 },
  'ui-success': { src: '/audio/success.mp3', category: 'ui' as SoundCategory, volume: 0.5 },
  'ui-notify': { src: '/audio/notify.mp3', category: 'ui' as SoundCategory, volume: 0.5 },
  
  // Combat sounds
  'combat-hit': { src: '/audio/hit.mp3', category: 'combat' as SoundCategory, volume: 0.7 },
  'combat-crit': { src: '/audio/critical.mp3', category: 'combat' as SoundCategory, volume: 0.8 },
  'combat-miss': { src: '/audio/miss.mp3', category: 'combat' as SoundCategory, volume: 0.5 },
  'combat-block': { src: '/audio/block.mp3', category: 'combat' as SoundCategory, volume: 0.6 },
  'combat-heal': { src: '/audio/heal.mp3', category: 'combat' as SoundCategory, volume: 0.6 },
  'combat-spell': { src: '/audio/spell.mp3', category: 'combat' as SoundCategory, volume: 0.7 },
  'combat-victory': { src: '/audio/victory.mp3', category: 'combat' as SoundCategory, volume: 0.8 },
  'combat-defeat': { src: '/audio/defeat.mp3', category: 'combat' as SoundCategory, volume: 0.7 },
  'combat-limit': { src: '/audio/limit-break.mp3', category: 'combat' as SoundCategory, volume: 1.0 },
  
  // Ambient sounds
  'ambient-footstep': { src: '/audio/footstep.mp3', category: 'ambient' as SoundCategory, volume: 0.3 },
  'ambient-door': { src: '/audio/door.mp3', category: 'ambient' as SoundCategory, volume: 0.5 },
  'ambient-chest': { src: '/audio/chest.mp3', category: 'ambient' as SoundCategory, volume: 0.6 },
  'ambient-coins': { src: '/audio/coins.mp3', category: 'ambient' as SoundCategory, volume: 0.5 },
  'ambient-levelup': { src: '/audio/levelup.mp3', category: 'ambient' as SoundCategory, volume: 0.8 },
} as const

type SoundEffect = keyof typeof SOUND_EFFECTS

// Music tracks
const MUSIC_TRACKS = {
  'menu': '/audio/music/menu.mp3',
  'overworld': '/audio/music/overworld.mp3',
  'battle': '/audio/music/battle.mp3',
  'boss': '/audio/music/boss.mp3',
  'dungeon': '/audio/music/dungeon.mp3',
  'town': '/audio/music/town.mp3',
  'victory': '/audio/music/victory.mp3',
} as const

type MusicTrack = keyof typeof MUSIC_TRACKS

// =================================================================
// AUDIO CONTEXT
// =================================================================
interface AudioContextValue {
  state: AudioState
  playSfx: (sound: SoundEffect) => void
  playMusic: (track: MusicTrack) => void
  stopMusic: () => void
  setVolume: (type: 'master' | 'music' | 'sfx' | 'ambient', value: number) => void
  toggleMute: () => void
  updateSettings: (settings: Partial<AudioSettings>) => void
}

const AudioContext = createContext<AudioContextValue | null>(null)

const DEFAULT_SETTINGS: AudioSettings = {
  masterVolume: 0.7,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  ambientVolume: 0.6,
  muted: false,
}

// =================================================================
// AUDIO PROVIDER
// =================================================================
export function AudioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AudioState>({
    settings: DEFAULT_SETTINGS,
    currentMusic: null,
    isPlaying: false,
  })
  
  // Audio element refs
  const musicRef = useRef<HTMLAudioElement | null>(null)
  const sfxPoolRef = useRef<HTMLAudioElement[]>([])
  const poolIndexRef = useRef(0)
  
  // Initialize audio pool for SFX (allows overlapping sounds)
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    // Create a pool of audio elements for SFX
    sfxPoolRef.current = Array.from({ length: 8 }, () => new Audio())
    
    // Load settings from localStorage
    const saved = localStorage.getItem('twisted_audio_settings')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setState(s => ({ ...s, settings: { ...DEFAULT_SETTINGS, ...parsed } }))
      } catch {
        // Ignore parse errors
      }
    }
    
    return () => {
      musicRef.current?.pause()
      sfxPoolRef.current.forEach(audio => audio.pause())
    }
  }, [])
  
  // Save settings to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('twisted_audio_settings', JSON.stringify(state.settings))
    }
  }, [state.settings])
  
  // Calculate effective volume for a category
  const getEffectiveVolume = useCallback((category: SoundCategory, baseVolume: number): number => {
    if (state.settings.muted) return 0
    
    const master = state.settings.masterVolume
    let categoryVolume = 1
    
    switch (category) {
      case 'music':
        categoryVolume = state.settings.musicVolume
        break
      case 'ui':
      case 'combat':
        categoryVolume = state.settings.sfxVolume
        break
      case 'ambient':
        categoryVolume = state.settings.ambientVolume
        break
    }
    
    return master * categoryVolume * baseVolume
  }, [state.settings])
  
  // Play a sound effect
  const playSfx = useCallback((sound: SoundEffect) => {
    if (typeof window === 'undefined') return
    
    const def = SOUND_EFFECTS[sound]
    if (!def) return
    
    const volume = getEffectiveVolume(def.category, def.volume)
    if (volume === 0) return
    
    // Use the next audio element in the pool
    const audio = sfxPoolRef.current[poolIndexRef.current]
    poolIndexRef.current = (poolIndexRef.current + 1) % sfxPoolRef.current.length
    
    // In demo mode, we don't have actual audio files, so we'll just log
    // In production, uncomment these lines:
    // audio.src = def.src
    // audio.volume = volume
    // audio.currentTime = 0
    // audio.play().catch(() => {})
    
    // For now, just provide visual feedback that sound would play
    console.log(`[Audio] SFX: ${sound} at volume ${volume.toFixed(2)}`)
  }, [getEffectiveVolume])
  
  // Play background music
  const playMusic = useCallback((track: MusicTrack) => {
    if (typeof window === 'undefined') return
    
    const src = MUSIC_TRACKS[track]
    if (!src) return
    
    // Create music element if needed
    if (!musicRef.current) {
      musicRef.current = new Audio()
      musicRef.current.loop = true
    }
    
    const volume = getEffectiveVolume('music', 1)
    
    // In demo mode, just log
    // In production:
    // musicRef.current.src = src
    // musicRef.current.volume = volume
    // musicRef.current.play().catch(() => {})
    
    console.log(`[Audio] Music: ${track} at volume ${volume.toFixed(2)}`)
    setState(s => ({ ...s, currentMusic: track, isPlaying: true }))
  }, [getEffectiveVolume])
  
  // Stop music
  const stopMusic = useCallback(() => {
    musicRef.current?.pause()
    setState(s => ({ ...s, isPlaying: false }))
  }, [])
  
  // Set volume for a category
  const setVolume = useCallback((type: 'master' | 'music' | 'sfx' | 'ambient', value: number) => {
    const clamped = Math.max(0, Math.min(1, value))
    setState(s => ({
      ...s,
      settings: {
        ...s.settings,
        [`${type}Volume`]: clamped,
      }
    }))
    
    // Update music volume in real-time
    if (musicRef.current && (type === 'master' || type === 'music')) {
      const newVolume = type === 'master' 
        ? clamped * state.settings.musicVolume
        : state.settings.masterVolume * clamped
      musicRef.current.volume = state.settings.muted ? 0 : newVolume
    }
  }, [state.settings])
  
  // Toggle mute
  const toggleMute = useCallback(() => {
    setState(s => ({
      ...s,
      settings: { ...s.settings, muted: !s.settings.muted }
    }))
    
    if (musicRef.current) {
      musicRef.current.volume = state.settings.muted 
        ? getEffectiveVolume('music', 1)
        : 0
    }
  }, [state.settings.muted, getEffectiveVolume])
  
  // Update multiple settings at once
  const updateSettings = useCallback((settings: Partial<AudioSettings>) => {
    setState(s => ({
      ...s,
      settings: { ...s.settings, ...settings }
    }))
  }, [])
  
  return (
    <AudioContext.Provider value={{
      state,
      playSfx,
      playMusic,
      stopMusic,
      setVolume,
      toggleMute,
      updateSettings,
    }}>
      {children}
    </AudioContext.Provider>
  )
}

// =================================================================
// HOOKS
// =================================================================
export function useAudio() {
  const context = useContext(AudioContext)
  if (!context) {
    // Return a no-op version if used outside provider
    return {
      state: { settings: DEFAULT_SETTINGS, currentMusic: null, isPlaying: false },
      playSfx: () => {},
      playMusic: () => {},
      stopMusic: () => {},
      setVolume: () => {},
      toggleMute: () => {},
      updateSettings: () => {},
    }
  }
  return context
}

// Convenience hook for playing UI sounds
export function useUiSounds() {
  const { playSfx } = useAudio()
  
  return {
    click: () => playSfx('ui-click'),
    hover: () => playSfx('ui-hover'),
    open: () => playSfx('ui-open'),
    close: () => playSfx('ui-close'),
    error: () => playSfx('ui-error'),
    success: () => playSfx('ui-success'),
    notify: () => playSfx('ui-notify'),
  }
}

// Convenience hook for playing combat sounds
export function useCombatSounds() {
  const { playSfx } = useAudio()
  
  return {
    hit: () => playSfx('combat-hit'),
    crit: () => playSfx('combat-crit'),
    miss: () => playSfx('combat-miss'),
    block: () => playSfx('combat-block'),
    heal: () => playSfx('combat-heal'),
    spell: () => playSfx('combat-spell'),
    victory: () => playSfx('combat-victory'),
    defeat: () => playSfx('combat-defeat'),
    limitBreak: () => playSfx('combat-limit'),
  }
}
