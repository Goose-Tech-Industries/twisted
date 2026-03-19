// ── Shared name color + staff effect utilities ───────────────────
// Used across game chat, player lists, map markers, party, etc.
// ADMIN/OWNER can set custom chatColor. Others get role-based defaults.

export const ROLE_COLORS: Record<string, string> = {
  OWNER: '#facc15',   // gold
  ADMIN: '#f87171',   // red
  GM:    '#c084fc',   // purple
  MOD:   '#4ade80',   // green
  STAFF: '#2dd4bf',   // teal
  PLAYER: '',         // default/white
}

// Staff roles that get special name effects
export const STAFF_ROLES = new Set(['OWNER', 'ADMIN', 'GM', 'MOD', 'STAFF'])

// Get the display color for a name
export function getNameColor(role?: string, chatColor?: string | null): string | undefined {
  const r = (role || '').toUpperCase()
  // OWNER uses CSS gradient effect — don't set inline color (it breaks background-clip)
  if (r === 'OWNER' && !chatColor) return undefined
  // ADMIN and OWNER can override with custom color (disables the effect)
  if (chatColor && ['ADMIN', 'OWNER'].includes(r)) return chatColor
  return ROLE_COLORS[r] || undefined
}

// If user has custom color, skip the CSS effect (inline color takes precedence)
export function getNameEffectWithColor(role?: string, chatColor?: string | null): string {
  const r = (role || '').toUpperCase()
  if (chatColor && ['ADMIN', 'OWNER'].includes(r)) return '' // custom color overrides effect
  return getNameEffect(r)
}

// Get CSS class for staff name effects
export function getNameEffect(role?: string): string {
  const r = (role || '').toUpperCase()
  switch (r) {
    case 'OWNER': return 'staff-name-owner'
    case 'ADMIN': return 'staff-name-admin'
    case 'GM':    return 'staff-name-gm'
    case 'MOD':   return 'staff-name-mod'
    default:      return ''
  }
}

// Check if a role can have custom colors (for future paid feature)
export function canHaveCustomColor(role?: string): boolean {
  const r = (role || '').toUpperCase()
  return ['ADMIN', 'OWNER'].includes(r)
}
