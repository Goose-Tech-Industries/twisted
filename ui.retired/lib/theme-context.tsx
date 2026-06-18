"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

// =================================================================
// THEME DEFINITIONS
// =================================================================

export interface ThemeColors {
  background: string
  foreground: string
  card: string
  cardForeground: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  destructive: string
  border: string
  ring: string
  // Game-specific
  health: string
  mana: string
  experience: string
  gold: string
  limitBreak: string
}

export interface Theme {
  id: string
  name: string
  description: string
  colors: ThemeColors
  fontFamily?: string
  borderRadius?: string
  panelStyle?: 'solid' | 'gradient' | 'glass'
}

// Default - Blood Void (current dark theme)
const BLOOD_VOID: Theme = {
  id: 'blood-void',
  name: 'Blood Void',
  description: 'The original darkness. Deep void blacks with blood red accents.',
  colors: {
    background: 'oklch(0.08 0.005 285)',
    foreground: 'oklch(0.88 0.01 285)',
    card: 'oklch(0.12 0.008 285)',
    cardForeground: 'oklch(0.88 0.01 285)',
    primary: 'oklch(0.45 0.18 25)',
    primaryForeground: 'oklch(0.95 0.01 285)',
    secondary: 'oklch(0.18 0.01 285)',
    secondaryForeground: 'oklch(0.75 0.01 285)',
    muted: 'oklch(0.20 0.01 285)',
    mutedForeground: 'oklch(0.55 0.01 285)',
    accent: 'oklch(0.55 0.12 185)',
    accentForeground: 'oklch(0.95 0.01 285)',
    destructive: 'oklch(0.55 0.22 25)',
    border: 'oklch(0.25 0.015 25)',
    ring: 'oklch(0.45 0.18 25)',
    health: 'oklch(0.55 0.20 140)',
    mana: 'oklch(0.55 0.18 260)',
    experience: 'oklch(0.65 0.18 85)',
    gold: 'oklch(0.75 0.15 85)',
    limitBreak: 'oklch(0.60 0.25 310)',
  },
  panelStyle: 'solid'
}

// Celtic Nightfall - Darker, more gothic
const CELTIC_NIGHTFALL: Theme = {
  id: 'celtic-nightfall',
  name: 'Celtic Nightfall',
  description: 'Ancient stones and druidic shadows. Deeper blacks with emerald and silver.',
  colors: {
    background: 'oklch(0.05 0.01 280)',
    foreground: 'oklch(0.80 0.02 100)',
    card: 'oklch(0.08 0.015 280)',
    cardForeground: 'oklch(0.80 0.02 100)',
    primary: 'oklch(0.50 0.15 160)',
    primaryForeground: 'oklch(0.98 0.01 100)',
    secondary: 'oklch(0.12 0.01 280)',
    secondaryForeground: 'oklch(0.65 0.02 100)',
    muted: 'oklch(0.15 0.01 280)',
    mutedForeground: 'oklch(0.50 0.02 100)',
    accent: 'oklch(0.65 0.10 90)',
    accentForeground: 'oklch(0.10 0.01 280)',
    destructive: 'oklch(0.50 0.20 25)',
    border: 'oklch(0.20 0.02 160)',
    ring: 'oklch(0.50 0.15 160)',
    health: 'oklch(0.50 0.18 140)',
    mana: 'oklch(0.55 0.20 270)',
    experience: 'oklch(0.60 0.15 90)',
    gold: 'oklch(0.70 0.18 85)',
    limitBreak: 'oklch(0.55 0.20 160)',
  },
  panelStyle: 'gradient'
}

// Obsidian Forge - Industrial dark
const OBSIDIAN_FORGE: Theme = {
  id: 'obsidian-forge',
  name: 'Obsidian Forge',
  description: 'Molten metal and volcanic glass. Warm orange embers on black.',
  colors: {
    background: 'oklch(0.06 0.01 40)',
    foreground: 'oklch(0.85 0.03 60)',
    card: 'oklch(0.10 0.015 40)',
    cardForeground: 'oklch(0.85 0.03 60)',
    primary: 'oklch(0.60 0.20 45)',
    primaryForeground: 'oklch(0.10 0.01 40)',
    secondary: 'oklch(0.14 0.01 40)',
    secondaryForeground: 'oklch(0.70 0.03 60)',
    muted: 'oklch(0.18 0.01 40)',
    mutedForeground: 'oklch(0.55 0.02 60)',
    accent: 'oklch(0.70 0.18 60)',
    accentForeground: 'oklch(0.10 0.01 40)',
    destructive: 'oklch(0.55 0.22 30)',
    border: 'oklch(0.25 0.03 45)',
    ring: 'oklch(0.60 0.20 45)',
    health: 'oklch(0.50 0.18 140)',
    mana: 'oklch(0.50 0.15 250)',
    experience: 'oklch(0.65 0.20 60)',
    gold: 'oklch(0.75 0.20 70)',
    limitBreak: 'oklch(0.65 0.25 45)',
  },
  panelStyle: 'solid'
}

// Frost Wyrm - Icy blue theme
const FROST_WYRM: Theme = {
  id: 'frost-wyrm',
  name: 'Frost Wyrm',
  description: 'Frozen tundra and ancient ice. Cold blues on deep navy.',
  colors: {
    background: 'oklch(0.08 0.02 250)',
    foreground: 'oklch(0.90 0.02 220)',
    card: 'oklch(0.12 0.025 250)',
    cardForeground: 'oklch(0.90 0.02 220)',
    primary: 'oklch(0.65 0.15 220)',
    primaryForeground: 'oklch(0.10 0.02 250)',
    secondary: 'oklch(0.16 0.02 250)',
    secondaryForeground: 'oklch(0.75 0.02 220)',
    muted: 'oklch(0.20 0.02 250)',
    mutedForeground: 'oklch(0.55 0.02 220)',
    accent: 'oklch(0.75 0.12 200)',
    accentForeground: 'oklch(0.10 0.02 250)',
    destructive: 'oklch(0.55 0.18 350)',
    border: 'oklch(0.28 0.03 220)',
    ring: 'oklch(0.65 0.15 220)',
    health: 'oklch(0.55 0.15 160)',
    mana: 'oklch(0.60 0.18 250)',
    experience: 'oklch(0.65 0.12 200)',
    gold: 'oklch(0.70 0.15 80)',
    limitBreak: 'oklch(0.70 0.20 220)',
  },
  panelStyle: 'glass'
}

// Shadow Realm - Ultra dark purple
const SHADOW_REALM: Theme = {
  id: 'shadow-realm',
  name: 'Shadow Realm',
  description: 'The void between worlds. Deep purple shadows with ethereal glow.',
  colors: {
    background: 'oklch(0.04 0.02 300)',
    foreground: 'oklch(0.82 0.04 300)',
    card: 'oklch(0.08 0.025 300)',
    cardForeground: 'oklch(0.82 0.04 300)',
    primary: 'oklch(0.55 0.22 310)',
    primaryForeground: 'oklch(0.98 0.01 300)',
    secondary: 'oklch(0.10 0.02 300)',
    secondaryForeground: 'oklch(0.68 0.03 300)',
    muted: 'oklch(0.14 0.02 300)',
    mutedForeground: 'oklch(0.50 0.03 300)',
    accent: 'oklch(0.70 0.18 280)',
    accentForeground: 'oklch(0.10 0.02 300)',
    destructive: 'oklch(0.50 0.20 350)',
    border: 'oklch(0.22 0.04 310)',
    ring: 'oklch(0.55 0.22 310)',
    health: 'oklch(0.50 0.15 350)',
    mana: 'oklch(0.60 0.22 280)',
    experience: 'oklch(0.55 0.15 310)',
    gold: 'oklch(0.65 0.15 80)',
    limitBreak: 'oklch(0.70 0.28 300)',
  },
  panelStyle: 'glass'
}

// Parchment Light - Light theme option
const PARCHMENT_LIGHT: Theme = {
  id: 'parchment-light',
  name: 'Parchment Light',
  description: 'Ancient scrolls and warm candlelight. For those who prefer the light.',
  colors: {
    background: 'oklch(0.95 0.02 80)',
    foreground: 'oklch(0.20 0.02 40)',
    card: 'oklch(0.98 0.01 80)',
    cardForeground: 'oklch(0.20 0.02 40)',
    primary: 'oklch(0.45 0.15 25)',
    primaryForeground: 'oklch(0.98 0.01 80)',
    secondary: 'oklch(0.90 0.02 80)',
    secondaryForeground: 'oklch(0.30 0.02 40)',
    muted: 'oklch(0.92 0.02 80)',
    mutedForeground: 'oklch(0.45 0.02 40)',
    accent: 'oklch(0.50 0.12 160)',
    accentForeground: 'oklch(0.98 0.01 80)',
    destructive: 'oklch(0.55 0.20 25)',
    border: 'oklch(0.85 0.03 80)',
    ring: 'oklch(0.45 0.15 25)',
    health: 'oklch(0.50 0.18 140)',
    mana: 'oklch(0.50 0.18 260)',
    experience: 'oklch(0.55 0.15 85)',
    gold: 'oklch(0.60 0.18 80)',
    limitBreak: 'oklch(0.55 0.22 310)',
  },
  panelStyle: 'solid'
}

// Neon Cyberpunk - Sci-fi theme
const NEON_CYBERPUNK: Theme = {
  id: 'neon-cyberpunk',
  name: 'Neon Cyberpunk',
  description: 'Neon lights and dark alleys. For sci-fi and cyberpunk games.',
  colors: {
    background: 'oklch(0.12 0.02 280)',
    foreground: 'oklch(0.90 0.05 200)',
    card: 'oklch(0.16 0.03 280)',
    cardForeground: 'oklch(0.90 0.05 200)',
    primary: 'oklch(0.70 0.25 320)',
    primaryForeground: 'oklch(0.98 0 0)',
    secondary: 'oklch(0.20 0.04 280)',
    secondaryForeground: 'oklch(0.80 0.05 200)',
    muted: 'oklch(0.22 0.03 280)',
    mutedForeground: 'oklch(0.55 0.05 200)',
    accent: 'oklch(0.65 0.25 180)',
    accentForeground: 'oklch(0.10 0 0)',
    destructive: 'oklch(0.55 0.22 25)',
    border: 'oklch(0.28 0.06 280)',
    ring: 'oklch(0.70 0.25 320)',
    health: 'oklch(0.55 0.22 140)',
    mana: 'oklch(0.60 0.22 260)',
    experience: 'oklch(0.70 0.25 320)',
    gold: 'oklch(0.70 0.20 85)',
    limitBreak: 'oklch(0.65 0.25 180)',
  },
  panelStyle: 'glass'
}

// Sakura - Anime/JRPG theme
const SAKURA: Theme = {
  id: 'sakura',
  name: 'Sakura Blossom',
  description: 'Cherry blossoms and gentle pastels. For anime and JRPG games.',
  colors: {
    background: 'oklch(0.15 0.03 340)',
    foreground: 'oklch(0.90 0.04 340)',
    card: 'oklch(0.20 0.04 340)',
    cardForeground: 'oklch(0.90 0.04 340)',
    primary: 'oklch(0.65 0.20 350)',
    primaryForeground: 'oklch(0.98 0 0)',
    secondary: 'oklch(0.22 0.04 340)',
    secondaryForeground: 'oklch(0.80 0.04 340)',
    muted: 'oklch(0.25 0.03 340)',
    mutedForeground: 'oklch(0.55 0.04 340)',
    accent: 'oklch(0.60 0.15 290)',
    accentForeground: 'oklch(0.98 0 0)',
    destructive: 'oklch(0.55 0.22 25)',
    border: 'oklch(0.30 0.06 340)',
    ring: 'oklch(0.65 0.20 350)',
    health: 'oklch(0.55 0.20 140)',
    mana: 'oklch(0.55 0.18 260)',
    experience: 'oklch(0.60 0.15 85)',
    gold: 'oklch(0.65 0.18 80)',
    limitBreak: 'oklch(0.65 0.20 350)',
  },
  panelStyle: 'glass'
}

// Steampunk Brass - Victorian machinery
const STEAMPUNK_BRASS: Theme = {
  id: 'steampunk-brass',
  name: 'Steampunk Brass',
  description: 'Gears, brass, and steam. For steampunk and Victorian settings.',
  colors: {
    background: 'oklch(0.14 0.03 60)',
    foreground: 'oklch(0.85 0.06 70)',
    card: 'oklch(0.18 0.04 60)',
    cardForeground: 'oklch(0.85 0.06 70)',
    primary: 'oklch(0.60 0.16 70)',
    primaryForeground: 'oklch(0.12 0.02 60)',
    secondary: 'oklch(0.22 0.04 60)',
    secondaryForeground: 'oklch(0.75 0.06 70)',
    muted: 'oklch(0.25 0.03 60)',
    mutedForeground: 'oklch(0.50 0.04 60)',
    accent: 'oklch(0.55 0.14 30)',
    accentForeground: 'oklch(0.98 0 0)',
    destructive: 'oklch(0.50 0.20 25)',
    border: 'oklch(0.32 0.06 60)',
    ring: 'oklch(0.60 0.16 70)',
    health: 'oklch(0.50 0.18 140)',
    mana: 'oklch(0.50 0.18 260)',
    experience: 'oklch(0.60 0.16 70)',
    gold: 'oklch(0.65 0.18 80)',
    limitBreak: 'oklch(0.55 0.22 25)',
  },
  panelStyle: 'solid'
}

// Dragon Ball / Planet Mado - Bold orange and blue
const SAIYAN_FURY: Theme = {
  id: 'saiyan-fury',
  name: 'Saiyan Fury',
  description: 'Bold energy and fighting spirit. For action and martial arts games.',
  colors: {
    background: 'oklch(0.10 0.02 250)',
    foreground: 'oklch(0.92 0.04 70)',
    card: 'oklch(0.15 0.03 250)',
    cardForeground: 'oklch(0.92 0.04 70)',
    primary: 'oklch(0.65 0.22 55)',
    primaryForeground: 'oklch(0.10 0 0)',
    secondary: 'oklch(0.18 0.04 250)',
    secondaryForeground: 'oklch(0.80 0.04 70)',
    muted: 'oklch(0.20 0.03 250)',
    mutedForeground: 'oklch(0.50 0.04 250)',
    accent: 'oklch(0.55 0.20 250)',
    accentForeground: 'oklch(0.98 0 0)',
    destructive: 'oklch(0.55 0.22 25)',
    border: 'oklch(0.25 0.05 250)',
    ring: 'oklch(0.65 0.22 55)',
    health: 'oklch(0.55 0.22 140)',
    mana: 'oklch(0.55 0.22 250)',
    experience: 'oklch(0.65 0.22 55)',
    gold: 'oklch(0.70 0.20 85)',
    limitBreak: 'oklch(0.70 0.25 100)',
  },
  panelStyle: 'glass'
}

// Emerald Forest - Nature/druid
const EMERALD_FOREST: Theme = {
  id: 'emerald-forest',
  name: 'Emerald Forest',
  description: 'Ancient woods and druid magic. For nature and fantasy games.',
  colors: {
    background: 'oklch(0.12 0.04 150)',
    foreground: 'oklch(0.88 0.05 140)',
    card: 'oklch(0.16 0.05 150)',
    cardForeground: 'oklch(0.88 0.05 140)',
    primary: 'oklch(0.55 0.18 150)',
    primaryForeground: 'oklch(0.98 0 0)',
    secondary: 'oklch(0.20 0.05 150)',
    secondaryForeground: 'oklch(0.78 0.05 140)',
    muted: 'oklch(0.22 0.04 150)',
    mutedForeground: 'oklch(0.50 0.04 150)',
    accent: 'oklch(0.55 0.15 85)',
    accentForeground: 'oklch(0.12 0 0)',
    destructive: 'oklch(0.55 0.22 25)',
    border: 'oklch(0.28 0.06 150)',
    ring: 'oklch(0.55 0.18 150)',
    health: 'oklch(0.55 0.20 140)',
    mana: 'oklch(0.50 0.18 260)',
    experience: 'oklch(0.55 0.15 85)',
    gold: 'oklch(0.65 0.18 80)',
    limitBreak: 'oklch(0.60 0.22 310)',
  },
  panelStyle: 'solid'
}

// Royal Purple - Regal/wizard
const ROYAL_PURPLE: Theme = {
  id: 'royal-purple',
  name: 'Royal Purple',
  description: 'Regal and arcane. For high fantasy and wizard schools.',
  colors: {
    background: 'oklch(0.12 0.04 300)',
    foreground: 'oklch(0.88 0.04 300)',
    card: 'oklch(0.16 0.05 300)',
    cardForeground: 'oklch(0.88 0.04 300)',
    primary: 'oklch(0.55 0.20 300)',
    primaryForeground: 'oklch(0.98 0 0)',
    secondary: 'oklch(0.20 0.05 300)',
    secondaryForeground: 'oklch(0.78 0.04 300)',
    muted: 'oklch(0.22 0.04 300)',
    mutedForeground: 'oklch(0.50 0.04 300)',
    accent: 'oklch(0.60 0.18 60)',
    accentForeground: 'oklch(0.12 0 0)',
    destructive: 'oklch(0.55 0.22 25)',
    border: 'oklch(0.28 0.06 300)',
    ring: 'oklch(0.55 0.20 300)',
    health: 'oklch(0.50 0.18 140)',
    mana: 'oklch(0.55 0.20 300)',
    experience: 'oklch(0.55 0.15 85)',
    gold: 'oklch(0.65 0.18 80)',
    limitBreak: 'oklch(0.65 0.25 60)',
  },
  panelStyle: 'glass'
}

export const THEMES: Theme[] = [
  BLOOD_VOID,
  CELTIC_NIGHTFALL,
  OBSIDIAN_FORGE,
  FROST_WYRM,
  SHADOW_REALM,
  PARCHMENT_LIGHT,
  NEON_CYBERPUNK,
  SAKURA,
  STEAMPUNK_BRASS,
  SAIYAN_FURY,
  EMERALD_FOREST,
  ROYAL_PURPLE,
]

// =================================================================
// CONTEXT
// =================================================================

interface ThemeContextValue {
  theme: Theme
  setTheme: (themeId: string) => void
  themes: Theme[]
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [allThemes, setAllThemes] = useState<Theme[]>(THEMES)
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const savedId = localStorage.getItem('te_theme')
      if (savedId) {
        const found = THEMES.find(t => t.id === savedId)
        if (found) return found
      }
    }
    return BLOOD_VOID
  })

  // Load themes from DB (overrides hardcoded)
  useEffect(() => {
    fetch('/admin/themes', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.themes?.length) {
          const dbThemes: Theme[] = data.themes.map((t: Record<string, unknown>) => {
            const colors = typeof t.colors_json === 'string' ? JSON.parse(t.colors_json as string) : t.colors_json
            return { id: t.id, name: t.name, description: t.description, colors, panelStyle: t.panel_style || 'solid' }
          })
          setAllThemes(dbThemes)
          // Re-apply saved theme from DB themes
          const savedId = localStorage.getItem('te_theme')
          if (savedId) {
            const found = dbThemes.find(t => t.id === savedId)
            if (found) setThemeState(found)
          }
        }
      })
      .catch(() => {}) // Fall back to hardcoded
  }, [])

  // Apply theme to CSS variables
  useEffect(() => {
    const root = document.documentElement
    const colors = theme.colors
    
    root.style.setProperty('--background', colors.background)
    root.style.setProperty('--foreground', colors.foreground)
    root.style.setProperty('--card', colors.card)
    root.style.setProperty('--card-foreground', colors.cardForeground)
    root.style.setProperty('--primary', colors.primary)
    root.style.setProperty('--primary-foreground', colors.primaryForeground)
    root.style.setProperty('--secondary', colors.secondary)
    root.style.setProperty('--secondary-foreground', colors.secondaryForeground)
    root.style.setProperty('--muted', colors.muted)
    root.style.setProperty('--muted-foreground', colors.mutedForeground)
    root.style.setProperty('--accent', colors.accent)
    root.style.setProperty('--accent-foreground', colors.accentForeground)
    root.style.setProperty('--destructive', colors.destructive)
    root.style.setProperty('--destructive-foreground', colors.primaryForeground)
    root.style.setProperty('--border', colors.border)
    root.style.setProperty('--ring', colors.ring)
    root.style.setProperty('--input', colors.secondary)
    root.style.setProperty('--popover', colors.card)
    root.style.setProperty('--popover-foreground', colors.cardForeground)
    
    // Game colors
    root.style.setProperty('--health', colors.health)
    root.style.setProperty('--mana', colors.mana)
    root.style.setProperty('--experience', colors.experience)
    root.style.setProperty('--gold', colors.gold)
    root.style.setProperty('--limit-break', colors.limitBreak)
    
    // Sidebar colors
    root.style.setProperty('--sidebar', colors.background)
    root.style.setProperty('--sidebar-foreground', colors.mutedForeground)
    root.style.setProperty('--sidebar-primary', colors.primary)
    root.style.setProperty('--sidebar-primary-foreground', colors.primaryForeground)
    root.style.setProperty('--sidebar-accent', colors.secondary)
    root.style.setProperty('--sidebar-accent-foreground', colors.foreground)
    root.style.setProperty('--sidebar-border', colors.border)
    root.style.setProperty('--sidebar-ring', colors.ring)
    
    // Panel style class
    root.setAttribute('data-panel-style', theme.panelStyle || 'solid')
    root.setAttribute('data-theme', theme.id)
  }, [theme])
  
  const setTheme = useCallback((themeId: string) => {
    const found = allThemes.find(t => t.id === themeId)
    if (found) {
      setThemeState(found)
      localStorage.setItem('te_theme', themeId)
    }
  }, [allThemes])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: allThemes }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
