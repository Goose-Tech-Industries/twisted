/**
 * Haptic feedback hook using the Vibration API.
 * Falls back silently on devices that don't support it.
 */

const PATTERNS = {
  /** Light tap — navigation, button press */
  tap: [10],
  /** Medium — item equip, skill use */
  medium: [20],
  /** Heavy — attack landed, critical hit */
  heavy: [40],
  /** Double tap — level up, achievement */
  double: [15, 50, 15],
  /** Error — failed action */
  error: [30, 30, 30],
  /** Success — quest complete, item acquired */
  success: [10, 30, 20],
  /** Damage taken */
  damage: [50, 20, 30],
} as const

type HapticPattern = keyof typeof PATTERNS

function vibrate(pattern: HapticPattern) {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(PATTERNS[pattern])
    }
  } catch {
    // Vibration API not available — silent fallback
  }
}

export function useHaptics() {
  return {
    tap: () => vibrate('tap'),
    medium: () => vibrate('medium'),
    heavy: () => vibrate('heavy'),
    double: () => vibrate('double'),
    error: () => vibrate('error'),
    success: () => vibrate('success'),
    damage: () => vibrate('damage'),
  }
}
