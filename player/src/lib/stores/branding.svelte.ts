// Branding store — admin-controllable splash + login appearance.
//
// Pulls from `GET /api/branding` (Phoenix `BrandingController`) which
// reads a curated set of `splash_*` / `login_*` keys from the
// `system_settings` table. Falls back to canonical Twisted Engine
// defaults when the endpoint is unavailable, so the splash/login pages
// never break on first boot or release rollback.
//
// Admins edit these via /sauce/branding (Phoenix LiveView).

import { api } from '$phoenix/api'

export type SplashTheme = 'gothic' | 'light' | 'parchment' | 'custom'
export type SplashAtmosphere = 'gothic' | 'minimal' | 'none'

export interface Branding {
  splash_theme: SplashTheme
  splash_title: string
  splash_tagline: string
  splash_logo_url: string
  splash_bg_color_top: string
  splash_bg_color_mid: string
  splash_accent_color: string
  splash_atmosphere: SplashAtmosphere
  splash_show_embers: boolean
  splash_embers_count: number
  splash_auto_redirect_ms: number
  login_subtitle: string
  login_button_login: string
  login_button_register: string
  login_quote: string
  login_quote_author: string
  login_register_enabled: boolean
  login_hero_image: string
}

export const DEFAULTS: Branding = {
  splash_theme: 'gothic',
  splash_title: 'Twisted Engine',
  splash_tagline: 'Tales from beneath the cairns',
  splash_logo_url: '',
  splash_bg_color_top: '#110608',
  splash_bg_color_mid: '#050204',
  splash_accent_color: '#b22222',
  splash_atmosphere: 'gothic',
  splash_show_embers: true,
  splash_embers_count: 36,
  // Default hold of 0 = require an explicit click. Most operators want
  // the splash to actually be seen; 1500ms flashed past too fast and
  // users reported "I didn't notice a splash page". Admins can set any
  // ms value in /sauce/branding to revert to auto-redirect.
  splash_auto_redirect_ms: 0,
  login_subtitle: 'Enter the realm',
  login_button_login: 'Enter',
  login_button_register: 'Forge',
  login_quote: '',
  login_quote_author: '',
  login_register_enabled: true,
  login_hero_image: ''
}

interface Resp {
  success: boolean
  branding?: Partial<Branding>
}

function createBrandingStore() {
  let values = $state<Branding>({ ...DEFAULTS })
  let loaded = $state(false)
  let loading = $state(false)

  return {
    get values() { return values },
    get loaded() { return loaded },
    get loading() { return loading },

    async load() {
      if (loaded || loading) return
      loading = true
      try {
        const r = await api.get<Resp>('/api/branding')
        if (r.success && r.branding) {
          values = { ...DEFAULTS, ...(r.branding as Branding) }
        }
      } catch {
        // Endpoint not deployed yet — keep defaults.
      } finally {
        loaded = true
        loading = false
      }
    },

    /** Convenience: get an inline `style=""` string for the splash backdrop. */
    splashBackground(): string {
      const v = values
      return `radial-gradient(ellipse at center, ${v.splash_bg_color_top} 0%, ${v.splash_bg_color_mid} 70%, #000 100%)`
    }
  }
}

export const branding = createBrandingStore()
