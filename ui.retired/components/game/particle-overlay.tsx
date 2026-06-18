"use client"

import { useEffect, useRef, useCallback } from "react"
import { createEmitter, updateEmitter, renderParticles, PARTICLE_PRESETS, type ParticleEmitter } from "@/lib/particle-system"

interface ParticleOverlayProps {
  effects: Array<{ preset: string; x: number; y: number; id?: string }>
  width: number
  height: number
}

export function ParticleOverlay({ effects, width, height }: ParticleOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const emittersRef = useRef<Map<string, ParticleEmitter>>(new Map())
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)

  // Create/update emitters when effects change
  useEffect(() => {
    const current = emittersRef.current
    const activeIds = new Set<string>()

    for (const effect of effects) {
      const id = effect.id || `${effect.preset}_${effect.x}_${effect.y}`
      activeIds.add(id)
      if (!current.has(id)) {
        current.set(id, createEmitter(effect.x, effect.y, effect.preset))
      } else {
        // Update position for moving emitters
        const em = current.get(id)!
        em.x = effect.x
        em.y = effect.y
      }
    }

    // Remove emitters for effects that are gone (but let particles finish)
    for (const [id, em] of current) {
      if (!activeIds.has(id)) {
        em.emitting = false
      }
    }
  }, [effects])

  // Animation loop
  const animate = useCallback((time: number) => {
    const dt = lastTimeRef.current ? Math.min(time - lastTimeRef.current, 50) : 16
    lastTimeRef.current = time

    const canvas = canvasRef.current
    if (!canvas) { rafRef.current = requestAnimationFrame(animate); return }
    const ctx = canvas.getContext('2d')
    if (!ctx) { rafRef.current = requestAnimationFrame(animate); return }

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const current = emittersRef.current
    const toRemove: string[] = []

    for (const [id, emitter] of current) {
      const alive = updateEmitter(emitter, dt)
      if (alive) {
        renderParticles(ctx, emitter)
      } else {
        toRemove.push(id)
      }
    }

    for (const id of toRemove) current.delete(id)

    rafRef.current = requestAnimationFrame(animate)
  }, [])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [animate])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none z-20"
      style={{ width, height }}
    />
  )
}

// Helper: map battle action types to particle presets
export function getParticleForAction(actionType: string, element?: string): string | null {
  // Element-based
  if (element === 'fire') return 'fire'
  if (element === 'ice') return 'ice'
  if (element === 'lightning') return 'lightning'
  if (element === 'dark') return 'dark_aura'

  // Action-based
  switch (actionType) {
    case 'damage': case 'skill_damage': return 'hit_sparks'
    case 'crit': return 'blood'
    case 'heal': case 'limb_heal': return 'heal'
    case 'dodge': return 'dust'
    case 'block': return 'hit_sparks'
    case 'combo_proc': case 'combo_art': return 'hit_sparks'
    case 'ki_channel': return 'fire'
    case 'transform': return 'levelup'
    case 'stagger': return 'lightning'
    case 'break': return 'hit_sparks'
    case 'sig_tech': return 'levelup'
    case 'summon': return 'dark_aura'
    case 'taunt': return 'fire'
    default: return null
  }
}

// Presets list for AdminSauce
export const PRESET_LIST = Object.entries(PARTICLE_PRESETS).map(([key, p]) => ({
  key, name: p.name, duration: p.duration
}))
