"use client"

import { useEffect, useCallback, useRef } from 'react'
import { useSettings, type KeyBindings } from '@/lib/settings-context'

interface UseKeyboardOptions {
  enabled?: boolean
  preventDefault?: boolean
  // Don't trigger when typing in input fields
  ignoreInputs?: boolean
}

type KeyboardHandler = (action: keyof KeyBindings, event: KeyboardEvent) => void

/**
 * Hook for handling keyboard shortcuts based on user keybinds
 */
export function useKeyboard(
  handler: KeyboardHandler,
  options: UseKeyboardOptions = {}
) {
  const { enabled = true, preventDefault = true, ignoreInputs = true } = options
  const settingsContext = useSettings()
  const handlerRef = useRef(handler)
  
  // Keep handler ref updated
  useEffect(() => {
    handlerRef.current = handler
  }, [handler])
  
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return
    
    // Ignore if typing in an input
    if (ignoreInputs) {
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }
    }
    
    // Check all keybinds
    const keybinds = settingsContext.settings.keybinds
    for (const action of Object.keys(keybinds) as (keyof KeyBindings)[]) {
      if (settingsContext.checkKeybind(action, event)) {
        if (preventDefault) {
          event.preventDefault()
          event.stopPropagation()
        }
        handlerRef.current(action, event)
        return
      }
    }
  }, [enabled, ignoreInputs, preventDefault, settingsContext])
  
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

/**
 * Hook for handling specific keyboard actions
 */
export function useKeyboardActions(
  actions: Partial<Record<keyof KeyBindings, () => void>>,
  options: UseKeyboardOptions = {}
) {
  const handler = useCallback((action: keyof KeyBindings) => {
    const fn = actions[action]
    if (fn) fn()
  }, [actions])
  
  useKeyboard(handler, options)
}

/**
 * Hook for movement controls (WASD)
 */
export function useMovementKeys(
  onMove: (direction: 'up' | 'down' | 'left' | 'right') => void,
  options: UseKeyboardOptions = {}
) {
  const actions: Partial<Record<keyof KeyBindings, () => void>> = {
    moveUp: () => onMove('up'),
    moveDown: () => onMove('down'),
    moveLeft: () => onMove('left'),
    moveRight: () => onMove('right'),
  }
  
  useKeyboardActions(actions, options)
}

/**
 * Hook for combat hotkeys (1-6 for skills)
 */
export function useCombatKeys(
  onAction: (action: 'attack' | 'defend' | 'skill1' | 'skill2' | 'skill3' | 'skill4' | 'item' | 'flee' | 'limit') => void,
  options: UseKeyboardOptions = {}
) {
  const actions: Partial<Record<keyof KeyBindings, () => void>> = {
    attack: () => onAction('attack'),
    defend: () => onAction('defend'),
    useSkill1: () => onAction('skill1'),
    useSkill2: () => onAction('skill2'),
    useSkill3: () => onAction('skill3'),
    useSkill4: () => onAction('skill4'),
    useItem: () => onAction('item'),
    flee: () => onAction('flee'),
    limitBreak: () => onAction('limit'),
  }
  
  useKeyboardActions(actions, options)
}

/**
 * Hook for quick slot keys (Shift+1-5)
 */
export function useQuickSlotKeys(
  onUse: (slot: 1 | 2 | 3 | 4 | 5) => void,
  options: UseKeyboardOptions = {}
) {
  const actions: Partial<Record<keyof KeyBindings, () => void>> = {
    quickSlot1: () => onUse(1),
    quickSlot2: () => onUse(2),
    quickSlot3: () => onUse(3),
    quickSlot4: () => onUse(4),
    quickSlot5: () => onUse(5),
  }
  
  useKeyboardActions(actions, options)
}
