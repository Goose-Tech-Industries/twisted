"use client"
import React from 'react'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSettings } from '@/lib/settings-context'

type WeatherType = 'clear' | 'rain' | 'snow' | 'fog' | 'storm' | 'embers' | 'spores'

interface Particle {
  id: number
  x: number
  y: number
  size: number
  speed: number
  opacity: number
  angle?: number
}

interface WeatherConfig {
  particleCount: number
  color: string
  blur?: number
  wind?: number
}

const WEATHER_CONFIGS: Record<WeatherType, WeatherConfig> = {
  clear: { particleCount: 0, color: 'transparent' },
  rain: { particleCount: 150, color: '#60a5fa', wind: 15 },
  snow: { particleCount: 80, color: '#e2e8f0', blur: 1 },
  fog: { particleCount: 20, color: '#94a3b8', blur: 20 },
  storm: { particleCount: 200, color: '#3b82f6', wind: 30 },
  embers: { particleCount: 40, color: '#f97316', blur: 2 },
  spores: { particleCount: 30, color: '#84cc16', blur: 3 }
}

export function WeatherEffects({ weather = 'clear' }: { weather?: WeatherType }) {
  const { settings } = useSettings()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animationRef = useRef<number | null>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  
  // Initialize particles
  const initParticles = useCallback(() => {
    const config = WEATHER_CONFIGS[weather]
    const particles: Particle[] = []
    
    for (let i = 0; i < config.particleCount; i++) {
      particles.push({
        id: i,
        x: Math.random() * dimensions.width,
        y: Math.random() * dimensions.height,
        size: weather === 'fog' ? Math.random() * 100 + 50 : Math.random() * 3 + 1,
        speed: weather === 'fog' ? Math.random() * 0.5 + 0.1 : Math.random() * 3 + 2,
        opacity: weather === 'fog' ? Math.random() * 0.3 + 0.1 : Math.random() * 0.8 + 0.2,
        angle: Math.random() * Math.PI * 2
      })
    }
    
    particlesRef.current = particles
  }, [weather, dimensions])
  
  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }
    
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  // Initialize on dimension change
  useEffect(() => {
    if (dimensions.width > 0 && dimensions.height > 0) {
      initParticles()
    }
  }, [dimensions, initParticles])
  
  // Animation loop
  useEffect(() => {
    if (!canvasRef.current || weather === 'clear' || settings.ui.reducedMotion) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const config = WEATHER_CONFIGS[weather]
    
    const animate = () => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height)
      
      particlesRef.current.forEach(particle => {
        // Update position
        switch (weather) {
          case 'rain':
          case 'storm':
            particle.y += particle.speed * 2
            particle.x += (config.wind || 0) * 0.1
            if (particle.y > dimensions.height) {
              particle.y = -10
              particle.x = Math.random() * dimensions.width
            }
            if (particle.x > dimensions.width) {
              particle.x = 0
            }
            break
            
          case 'snow':
            particle.y += particle.speed * 0.5
            particle.x += Math.sin(particle.angle || 0) * 0.5
            particle.angle = (particle.angle || 0) + 0.01
            if (particle.y > dimensions.height) {
              particle.y = -10
              particle.x = Math.random() * dimensions.width
            }
            break
            
          case 'fog':
            particle.x += Math.sin(particle.angle || 0) * particle.speed
            particle.y += Math.cos(particle.angle || 0) * particle.speed * 0.5
            particle.angle = (particle.angle || 0) + 0.002
            particle.opacity = 0.1 + Math.sin(Date.now() * 0.001 + particle.id) * 0.05
            break
            
          case 'embers':
            particle.y -= particle.speed * 0.3
            particle.x += Math.sin(particle.angle || 0) * 0.8
            particle.angle = (particle.angle || 0) + 0.02
            particle.opacity = Math.max(0, particle.opacity - 0.002)
            if (particle.y < -10 || particle.opacity <= 0) {
              particle.y = dimensions.height + 10
              particle.x = Math.random() * dimensions.width
              particle.opacity = Math.random() * 0.8 + 0.2
            }
            break
            
          case 'spores':
            particle.y -= particle.speed * 0.2
            particle.x += Math.sin(particle.angle || 0) * 1.5
            particle.angle = (particle.angle || 0) + 0.015
            if (particle.y < -10) {
              particle.y = dimensions.height + 10
              particle.x = Math.random() * dimensions.width
            }
            break
        }
        
        // Draw particle
        ctx.save()
        ctx.globalAlpha = particle.opacity
        
        if (config.blur) {
          ctx.filter = `blur(${config.blur}px)`
        }
        
        if (weather === 'rain' || weather === 'storm') {
          // Draw rain as lines
          ctx.strokeStyle = config.color
          ctx.lineWidth = particle.size * 0.5
          ctx.beginPath()
          ctx.moveTo(particle.x, particle.y)
          ctx.lineTo(particle.x + (config.wind || 0) * 0.2, particle.y + particle.size * 5)
          ctx.stroke()
        } else if (weather === 'fog') {
          // Draw fog as large circles
          const gradient = ctx.createRadialGradient(
            particle.x, particle.y, 0,
            particle.x, particle.y, particle.size
          )
          gradient.addColorStop(0, config.color)
          gradient.addColorStop(1, 'transparent')
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
          ctx.fill()
        } else {
          // Draw as circles
          ctx.fillStyle = config.color
          ctx.beginPath()
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
          ctx.fill()
          
          // Glow for embers
          if (weather === 'embers') {
            ctx.shadowColor = config.color
            ctx.shadowBlur = 10
            ctx.fill()
          }
        }
        
        ctx.restore()
      })
      
      // Lightning flash for storm
      if (weather === 'storm' && Math.random() < 0.002) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
        ctx.fillRect(0, 0, dimensions.width, dimensions.height)
      }
      
      animationRef.current = requestAnimationFrame(animate)
    }
    
    animate()
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [weather, dimensions, settings.ui.reducedMotion])
  
  if (weather === 'clear' || settings.ui.reducedMotion) return null
  
  return (
    <canvas
      ref={canvasRef}
      width={dimensions.width}
      height={dimensions.height}
      className="fixed inset-0 pointer-events-none z-40"
      style={{ opacity: 0.8 }}
    />
  )
}

// Floating particles for ambient atmosphere
export function AmbientParticles() {
  const { settings } = useSettings()
  const [particles, setParticles] = useState<Array<{ id: number; style: React.CSSProperties }>>([])
  
  useEffect(() => {
    if (settings.ui.reducedMotion) return
    
    const newParticles = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      style: {
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        animationDelay: `${Math.random() * 5}s`,
        animationDuration: `${8 + Math.random() * 4}s`,
        opacity: Math.random() * 0.3 + 0.1,
        transform: `scale(${Math.random() * 0.5 + 0.5})`
      }
    }))
    setParticles(newParticles)
  }, [settings.ui.reducedMotion])
  
  if (settings.ui.reducedMotion) return null
  
  return (
    <div className="fixed inset-0 pointer-events-none z-30 overflow-hidden">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute w-1 h-1 rounded-full bg-primary animate-float"
          style={p.style}
        />
      ))}
    </div>
  )
}
