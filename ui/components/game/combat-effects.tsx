"use client"
import React from 'react'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'

// =================================================================
// DAMAGE NUMBER TYPES
// =================================================================
interface DamageNumber {
  id: string
  value: number
  x: number
  y: number
  type: 'damage' | 'heal' | 'crit' | 'miss' | 'block' | 'poison' | 'burn' | 'mp'
  createdAt: number
}

interface FloatingText {
  id: string
  text: string
  x: number
  y: number
  color: string
  size?: 'sm' | 'md' | 'lg'
  createdAt: number
}

// =================================================================
// COMBAT EFFECTS CONTEXT
// =================================================================
interface CombatEffectsAPI {
  showDamage: (value: number, x: number, y: number, type?: DamageNumber['type']) => void
  showText: (text: string, x: number, y: number, color?: string, size?: 'sm' | 'md' | 'lg') => void
  triggerScreenShake: (intensity?: 'light' | 'medium' | 'heavy') => void
  triggerFlash: (color?: string) => void
}

let effectsAPI: CombatEffectsAPI | null = null

export function getCombatEffects(): CombatEffectsAPI | null {
  return effectsAPI
}

// =================================================================
// DAMAGE NUMBER COMPONENT
// =================================================================
function DamageNumberDisplay({ number, onComplete }: { 
  number: DamageNumber
  onComplete: () => void 
}) {
  const [visible, setVisible] = useState(false)
  
  useEffect(() => {
    // Trigger animation
    requestAnimationFrame(() => setVisible(true))
    
    // Remove after animation
    const timeout = setTimeout(onComplete, 1000)
    return () => clearTimeout(timeout)
  }, [onComplete])
  
  // Get color based on type
  const getColor = () => {
    switch (number.type) {
      case 'damage': return 'text-red-500'
      case 'crit': return 'text-orange-400'
      case 'heal': return 'text-green-400'
      case 'miss': return 'text-gray-400'
      case 'block': return 'text-blue-400'
      case 'poison': return 'text-purple-400'
      case 'burn': return 'text-orange-500'
      case 'mp': return 'text-blue-300'
      default: return 'text-white'
    }
  }
  
  // Get display text
  const getText = () => {
    switch (number.type) {
      case 'miss': return 'MISS'
      case 'block': return 'BLOCK'
      case 'heal': return `+${number.value}`
      case 'mp': return `+${number.value} MP`
      default: return number.value.toString()
    }
  }
  
  return (
    <div
      className={`
        fixed pointer-events-none select-none font-bold z-[100]
        transition-all duration-1000 ease-out
        ${getColor()}
        ${number.type === 'crit' ? 'text-2xl' : 'text-lg'}
        ${visible ? 'opacity-0 -translate-y-8' : 'opacity-100'}
      `}
      style={{
        left: number.x,
        top: number.y,
        textShadow: '2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.5)',
      }}
    >
      {number.type === 'crit' && <span className="text-xs mr-1">CRIT!</span>}
      {getText()}
    </div>
  )
}

// =================================================================
// FLOATING TEXT COMPONENT
// =================================================================
function FloatingTextDisplay({ text, onComplete }: {
  text: FloatingText
  onComplete: () => void
}) {
  const [visible, setVisible] = useState(false)
  
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const timeout = setTimeout(onComplete, 1500)
    return () => clearTimeout(timeout)
  }, [onComplete])
  
  const sizeClass = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
  }[text.size || 'md']
  
  return (
    <div
      className={`
        fixed pointer-events-none select-none font-bold z-[100]
        transition-all duration-1500 ease-out
        ${sizeClass}
        ${visible ? 'opacity-0 -translate-y-12 scale-110' : 'opacity-100'}
      `}
      style={{
        left: text.x,
        top: text.y,
        color: text.color,
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
      }}
    >
      {text.text}
    </div>
  )
}

// =================================================================
// SCREEN EFFECTS COMPONENT
// =================================================================
function ScreenShake({ intensity, onComplete }: {
  intensity: 'light' | 'medium' | 'heavy'
  onComplete: () => void
}) {
  useEffect(() => {
    const amounts = { light: 2, medium: 5, heavy: 10 }
    const amount = amounts[intensity]
    const duration = intensity === 'heavy' ? 400 : intensity === 'medium' ? 250 : 150
    
    let frame = 0
    const maxFrames = Math.floor(duration / 16)
    
    const shake = () => {
      if (frame >= maxFrames) {
        document.body.style.transform = ''
        onComplete()
        return
      }
      
      const decay = 1 - (frame / maxFrames)
      const x = (Math.random() - 0.5) * amount * decay
      const y = (Math.random() - 0.5) * amount * decay
      
      document.body.style.transform = `translate(${x}px, ${y}px)`
      frame++
      requestAnimationFrame(shake)
    }
    
    shake()
    
    return () => {
      document.body.style.transform = ''
    }
  }, [intensity, onComplete])
  
  return null
}

function ScreenFlash({ color, onComplete }: {
  color: string
  onComplete: () => void
}) {
  const [opacity, setOpacity] = useState(0.3)
  
  useEffect(() => {
    requestAnimationFrame(() => setOpacity(0))
    const timeout = setTimeout(onComplete, 200)
    return () => clearTimeout(timeout)
  }, [onComplete])
  
  return (
    <div
      className="fixed inset-0 pointer-events-none z-[99] transition-opacity duration-200"
      style={{
        backgroundColor: color,
        opacity,
      }}
    />
  )
}

// =================================================================
// MAIN COMBAT EFFECTS LAYER
// =================================================================
export function CombatEffectsLayer() {
  const [damageNumbers, setDamageNumbers] = useState<DamageNumber[]>([])
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([])
  const [shakes, setShakes] = useState<{ id: string; intensity: 'light' | 'medium' | 'heavy' }[]>([])
  const [flashes, setFlashes] = useState<{ id: string; color: string }[]>([])
  const [mounted, setMounted] = useState(false)
  
  const nextId = useRef(0)
  const getId = () => `effect-${nextId.current++}`
  
  // Mount check for portal
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Create the API
  const showDamage = useCallback((value: number, x: number, y: number, type: DamageNumber['type'] = 'damage') => {
    const id = getId()
    // Add some randomness to position
    const offsetX = (Math.random() - 0.5) * 40
    const offsetY = (Math.random() - 0.5) * 20
    
    setDamageNumbers(prev => [...prev, {
      id,
      value,
      x: x + offsetX,
      y: y + offsetY,
      type,
      createdAt: Date.now(),
    }])
  }, [])
  
  const showText = useCallback((text: string, x: number, y: number, color = '#ffffff', size: 'sm' | 'md' | 'lg' = 'md') => {
    const id = getId()
    setFloatingTexts(prev => [...prev, {
      id,
      text,
      x,
      y,
      color,
      size,
      createdAt: Date.now(),
    }])
  }, [])
  
  const triggerScreenShake = useCallback((intensity: 'light' | 'medium' | 'heavy' = 'medium') => {
    const id = getId()
    setShakes(prev => [...prev, { id, intensity }])
  }, [])
  
  const triggerFlash = useCallback((color = 'rgba(255, 255, 255, 0.3)') => {
    const id = getId()
    setFlashes(prev => [...prev, { id, color }])
  }, [])
  
  // Register the API globally
  useEffect(() => {
    effectsAPI = { showDamage, showText, triggerScreenShake, triggerFlash }
    return () => { effectsAPI = null }
  }, [showDamage, showText, triggerScreenShake, triggerFlash])
  
  // Remove completed effects
  const removeDamageNumber = useCallback((id: string) => {
    setDamageNumbers(prev => prev.filter(n => n.id !== id))
  }, [])
  
  const removeFloatingText = useCallback((id: string) => {
    setFloatingTexts(prev => prev.filter(t => t.id !== id))
  }, [])
  
  const removeShake = useCallback((id: string) => {
    setShakes(prev => prev.filter(s => s.id !== id))
  }, [])
  
  const removeFlash = useCallback((id: string) => {
    setFlashes(prev => prev.filter(f => f.id !== id))
  }, [])
  
  if (!mounted) return null
  
  return createPortal(
    <>
      {/* Damage Numbers */}
      {damageNumbers.map(num => (
        <div key={num.id}><DamageNumberDisplay number={num as DamageNumber} onComplete={() => removeDamageNumber(num.id)} /></div>
      ))}
      
      {/* Floating Text */}
      {floatingTexts.map(text => (
        <div key={text.id}><FloatingTextDisplay text={text as FloatingText} onComplete={() => removeFloatingText(text.id)} /></div>
      ))}
      
      {/* Screen Shakes */}
      {shakes.map(shake => (
        <div key={shake.id}><ScreenShake intensity={shake.intensity as "light" | "medium" | "heavy"} onComplete={() => removeShake(shake.id)} /></div>
      ))}
      
      {/* Screen Flashes */}
      {flashes.map(flash => (
        <div key={flash.id}><ScreenFlash color={flash.color as string} onComplete={() => removeFlash(flash.id)} /></div>
      ))}
    </>,
    document.body
  )
}

// =================================================================
// HOOK FOR USING COMBAT EFFECTS
// =================================================================
export function useCombatEffects() {
  return {
    showDamage: (value: number, x: number, y: number, type?: DamageNumber['type']) => {
      effectsAPI?.showDamage(value, x, y, type)
    },
    showText: (text: string, x: number, y: number, color?: string, size?: 'sm' | 'md' | 'lg') => {
      effectsAPI?.showText(text, x, y, color, size)
    },
    triggerScreenShake: (intensity?: 'light' | 'medium' | 'heavy') => {
      effectsAPI?.triggerScreenShake(intensity)
    },
    triggerFlash: (color?: string) => {
      effectsAPI?.triggerFlash(color)
    },
    // Convenience methods
    showCrit: (value: number, x: number, y: number) => {
      effectsAPI?.showDamage(value, x, y, 'crit')
      effectsAPI?.triggerScreenShake('medium')
      effectsAPI?.triggerFlash('rgba(255, 100, 0, 0.2)')
    },
    showHeal: (value: number, x: number, y: number) => {
      effectsAPI?.showDamage(value, x, y, 'heal')
    },
    showLimitBreak: (x: number, y: number) => {
      effectsAPI?.showText('LIMIT BREAK!', x, y, '#ff00ff', 'lg')
      effectsAPI?.triggerScreenShake('heavy')
      effectsAPI?.triggerFlash('rgba(255, 0, 255, 0.3)')
    },
    showVictory: (x: number, y: number) => {
      effectsAPI?.showText('VICTORY!', x, y, '#ffd700', 'lg')
      effectsAPI?.triggerFlash('rgba(255, 215, 0, 0.2)')
    },
    showDefeat: (x: number, y: number) => {
      effectsAPI?.showText('DEFEAT', x, y, '#8b0000', 'lg')
      effectsAPI?.triggerFlash('rgba(139, 0, 0, 0.3)')
    },
  }
}
