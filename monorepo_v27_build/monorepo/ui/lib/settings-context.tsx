"use client"

import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react'

// =================================================================
// KEYBIND TYPES
// =================================================================
export interface KeyBinding {
  key: string
  modifiers?: {
    ctrl?: boolean
    shift?: boolean
    alt?: boolean
  }
}

export interface KeyBindings {
  // Movement
  moveUp: KeyBinding
  moveDown: KeyBinding
  moveLeft: KeyBinding
  moveRight: KeyBinding
  
  // UI Navigation
  openInventory: KeyBinding
  openCharacter: KeyBinding
  openQuests: KeyBinding
  openMap: KeyBinding
  openParty: KeyBinding
  openGuild: KeyBinding
  openOghams: KeyBinding
  openSettings: KeyBinding
  closePanel: KeyBinding
  
  // Combat
  attack: KeyBinding
  defend: KeyBinding
  useSkill1: KeyBinding
  useSkill2: KeyBinding
  useSkill3: KeyBinding
  useSkill4: KeyBinding
  useItem: KeyBinding
  flee: KeyBinding
  limitBreak: KeyBinding
  
  // Quick slots
  quickSlot1: KeyBinding
  quickSlot2: KeyBinding
  quickSlot3: KeyBinding
  quickSlot4: KeyBinding
  quickSlot5: KeyBinding
  
  // Chat
  openChat: KeyBinding
  sendMessage: KeyBinding
  
  // Misc
  interact: KeyBinding
  toggleMinimap: KeyBinding
  screenshot: KeyBinding
}

// =================================================================
// UI SETTINGS
// =================================================================
export interface UISettings {
  uiScale: number // 0.8 - 1.2
  showDamageNumbers: boolean
  showMinimap: boolean
  minimapSize: 'small' | 'medium' | 'large'
  chatOpacity: number // 0.3 - 1.0
  showPlayerNames: boolean
  showHealthBars: boolean
  screenShake: boolean
  reducedMotion: boolean
  highContrast: boolean
  tooltipDelay: number // ms
}

// =================================================================
// FULL SETTINGS
// =================================================================
export interface GameSettings {
  keybinds: KeyBindings
  ui: UISettings
}

// =================================================================
// DEFAULTS
// =================================================================
const DEFAULT_KEYBINDS: KeyBindings = {
  // Movement
  moveUp: { key: 'w' },
  moveDown: { key: 's' },
  moveLeft: { key: 'a' },
  moveRight: { key: 'd' },
  
  // UI Navigation
  openInventory: { key: 'i' },
  openCharacter: { key: 'c' },
  openQuests: { key: 'j' },
  openMap: { key: 'm' },
  openParty: { key: 'p' },
  openGuild: { key: 'g' },
  openOghams: { key: 'o' },
  openSettings: { key: 'Escape' },
  closePanel: { key: 'Escape' },
  
  // Combat
  attack: { key: '1' },
  defend: { key: '2' },
  useSkill1: { key: '3' },
  useSkill2: { key: '4' },
  useSkill3: { key: '5' },
  useSkill4: { key: '6' },
  useItem: { key: 'q' },
  flee: { key: 'f' },
  limitBreak: { key: 'l' },
  
  // Quick slots
  quickSlot1: { key: '1', modifiers: { shift: true } },
  quickSlot2: { key: '2', modifiers: { shift: true } },
  quickSlot3: { key: '3', modifiers: { shift: true } },
  quickSlot4: { key: '4', modifiers: { shift: true } },
  quickSlot5: { key: '5', modifiers: { shift: true } },
  
  // Chat
  openChat: { key: 'Enter' },
  sendMessage: { key: 'Enter' },
  
  // Misc
  interact: { key: 'e' },
  toggleMinimap: { key: 'n' },
  screenshot: { key: 'F12' },
}

const DEFAULT_UI_SETTINGS: UISettings = {
  uiScale: 1.0,
  showDamageNumbers: true,
  showMinimap: true,
  minimapSize: 'medium',
  chatOpacity: 0.8,
  showPlayerNames: true,
  showHealthBars: true,
  screenShake: true,
  reducedMotion: false,
  highContrast: false,
  tooltipDelay: 300,
}

// =================================================================
// CONTEXT
// =================================================================
interface SettingsContextValue {
  settings: GameSettings
  updateKeybind: (action: keyof KeyBindings, binding: KeyBinding) => void
  updateUISetting: <K extends keyof UISettings>(key: K, value: UISettings[K]) => void
  resetKeybinds: () => void
  resetUISettings: () => void
  resetAll: () => void
  isBindingKey: string | null
  startBindingKey: (action: keyof KeyBindings) => void
  cancelBindingKey: () => void
  checkKeybind: (action: keyof KeyBindings, event: KeyboardEvent) => boolean
  formatKeybind: (binding: KeyBinding) => string
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

// =================================================================
// PROVIDER
// =================================================================
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<GameSettings>({
    keybinds: DEFAULT_KEYBINDS,
    ui: DEFAULT_UI_SETTINGS,
  })
  const [isBindingKey, setIsBindingKey] = useState<string | null>(null)
  
  // Load from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const saved = localStorage.getItem('twisted_settings')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setSettings({
          keybinds: { ...DEFAULT_KEYBINDS, ...parsed.keybinds },
          ui: { ...DEFAULT_UI_SETTINGS, ...parsed.ui },
        })
      } catch {
        // Ignore
      }
    }
  }, [])
  
  // Save to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('twisted_settings', JSON.stringify(settings))
    }
  }, [settings])
  
  // Apply UI scale
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--ui-scale', settings.ui.uiScale.toString())
    }
  }, [settings.ui.uiScale])
  
  // Apply reduced motion
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('reduce-motion', settings.ui.reducedMotion)
    }
  }, [settings.ui.reducedMotion])
  
  // Listen for key binding
  useEffect(() => {
    if (!isBindingKey) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      
      // Don't bind modifier keys alone
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
      
      const binding: KeyBinding = {
        key: e.key,
        modifiers: {
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
          alt: e.altKey,
        }
      }
      
      // Clean up empty modifiers
      if (!binding.modifiers?.ctrl && !binding.modifiers?.shift && !binding.modifiers?.alt) {
        delete binding.modifiers
      }
      
      setSettings(s => ({
        ...s,
        keybinds: {
          ...s.keybinds,
          [isBindingKey]: binding,
        }
      }))
      setIsBindingKey(null)
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isBindingKey])
  
  const updateKeybind = useCallback((action: keyof KeyBindings, binding: KeyBinding) => {
    setSettings(s => ({
      ...s,
      keybinds: { ...s.keybinds, [action]: binding }
    }))
  }, [])
  
  const updateUISetting = useCallback(<K extends keyof UISettings>(key: K, value: UISettings[K]) => {
    setSettings(s => ({
      ...s,
      ui: { ...s.ui, [key]: value }
    }))
  }, [])
  
  const resetKeybinds = useCallback(() => {
    setSettings(s => ({ ...s, keybinds: DEFAULT_KEYBINDS }))
  }, [])
  
  const resetUISettings = useCallback(() => {
    setSettings(s => ({ ...s, ui: DEFAULT_UI_SETTINGS }))
  }, [])
  
  const resetAll = useCallback(() => {
    setSettings({ keybinds: DEFAULT_KEYBINDS, ui: DEFAULT_UI_SETTINGS })
  }, [])
  
  const startBindingKey = useCallback((action: keyof KeyBindings) => {
    setIsBindingKey(action)
  }, [])
  
  const cancelBindingKey = useCallback(() => {
    setIsBindingKey(null)
  }, [])
  
  const checkKeybind = useCallback((action: keyof KeyBindings, event: KeyboardEvent): boolean => {
    const binding = settings.keybinds[action]
    if (!binding) return false
    
    const keyMatches = event.key.toLowerCase() === binding.key.toLowerCase()
    const ctrlMatches = !!binding.modifiers?.ctrl === event.ctrlKey
    const shiftMatches = !!binding.modifiers?.shift === event.shiftKey
    const altMatches = !!binding.modifiers?.alt === event.altKey
    
    return keyMatches && ctrlMatches && shiftMatches && altMatches
  }, [settings.keybinds])
  
  const formatKeybind = useCallback((binding: KeyBinding): string => {
    const parts: string[] = []
    if (binding.modifiers?.ctrl) parts.push('Ctrl')
    if (binding.modifiers?.shift) parts.push('Shift')
    if (binding.modifiers?.alt) parts.push('Alt')
    
    // Format special keys nicely
    let key = binding.key
    if (key === ' ') key = 'Space'
    else if (key === 'ArrowUp') key = 'Up'
    else if (key === 'ArrowDown') key = 'Down'
    else if (key === 'ArrowLeft') key = 'Left'
    else if (key === 'ArrowRight') key = 'Right'
    else if (key.length === 1) key = key.toUpperCase()
    
    parts.push(key)
    return parts.join(' + ')
  }, [])
  
  return (
    <SettingsContext.Provider value={{
      settings,
      updateKeybind,
      updateUISetting,
      resetKeybinds,
      resetUISettings,
      resetAll,
      isBindingKey,
      startBindingKey,
      cancelBindingKey,
      checkKeybind,
      formatKeybind,
    }}>
      {children}
    </SettingsContext.Provider>
  )
}

// =================================================================
// HOOK
// =================================================================
export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}

// Optional hook that won't throw
export function useSettingsOptional() {
  return useContext(SettingsContext)
}
