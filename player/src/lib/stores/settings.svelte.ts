// Client-side preferences. Persists to localStorage; future revision can
// sync to /api/preferences.

import { browser } from '$app/environment'

export interface PlayerPrefs {
  theme: 'celtic-dark' | 'celtic-light' | 'high-contrast'
  /** When true: in-game UI motion is dampened. Splash atmosphere is
   * NOT affected (it's the page's identity). Use `forceMotion` to
   * explicitly override a privacy-browser-induced reduce signal. */
  reduceMotion: boolean
  /** Override for users whose browser advertises
   * `prefers-reduced-motion: reduce` against their will (Brave's
   * anti-fingerprinting default, Firefox RFP). When true, animations
   * play regardless of the media query. */
  forceMotion: boolean
  showPassability: boolean
  hudScale: 1 | 1.25 | 1.5
  audioMaster: number // 0..1
  audioMusic: number
  audioSfx: number
  language: string
}

const DEFAULTS: PlayerPrefs = {
  theme: 'celtic-dark',
  reduceMotion: false,
  forceMotion: false,
  showPassability: false,
  hudScale: 1,
  audioMaster: 0.8,
  audioMusic: 0.6,
  audioSfx: 0.9,
  language: 'en'
}

const KEY = 'twisted:prefs'

function load(): PlayerPrefs {
  if (!browser) return DEFAULTS
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<PlayerPrefs>) }
  } catch { return DEFAULTS }
}

function createSettingsStore() {
  let prefs = $state<PlayerPrefs>(load())

  function persist() {
    if (!browser) return
    try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* quota */ }
  }

  return {
    get prefs() { return prefs },

    set<K extends keyof PlayerPrefs>(key: K, value: PlayerPrefs[K]) {
      prefs = { ...prefs, [key]: value }
      persist()
    },

    reset() {
      prefs = DEFAULTS
      persist()
    }
  }
}

export const settings = createSettingsStore()
