"use client"
import React from 'react'

import { useState, useEffect, useRef } from 'react'
import { useGame } from '@/lib/game-context'
import {
  Skull, Crown, Coins, Swords, Shield, Star,
  Users, MapPin, AlertTriangle, Sparkles, Trophy
} from 'lucide-react'

interface WorldEvent {
  id: string
  type: 'kill' | 'level' | 'loot' | 'guild' | 'pvp' | 'boss' | 'achievement' | 'event' | 'announcement'
  message: string
  timestamp: number
  highlight?: boolean
}

const EVENT_ICONS: Record<WorldEvent['type'], typeof Skull> = {
  kill: Skull,
  level: Star,
  loot: Coins,
  guild: Shield,
  pvp: Swords,
  boss: AlertTriangle,
  achievement: Trophy,
  event: Sparkles,
  announcement: Crown,
}

const EVENT_COLORS: Record<WorldEvent['type'], string> = {
  kill: 'text-muted-foreground',
  level: 'text-[oklch(0.65_0.18_85)]',
  loot: 'text-[oklch(0.60_0.25_310)]',
  guild: 'text-[oklch(0.55_0.12_185)]',
  pvp: 'text-[oklch(0.55_0.22_25)]',
  boss: 'text-[oklch(0.65_0.20_50)]',
  achievement: 'text-[oklch(0.75_0.15_85)]',
  event: 'text-[oklch(0.55_0.18_260)]',
  announcement: 'text-primary',
}

export function WorldEventTicker() {
  const { socket } = useGame()
  const [events, setEvents] = useState<WorldEvent[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const tickerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>(0)
  const scrollPosRef = useRef(0)

  // Socket listener for real events
  useEffect(() => {
    if (!socket) return

    const handleWorldEvent = (data: Omit<WorldEvent, 'id' | 'timestamp'>) => {
      const newEvent: WorldEvent = {
        ...data,
        id: `socket-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
      }
      setEvents(prev => [newEvent, ...prev].slice(0, 50))
    }

    socket.on('world_event', handleWorldEvent)
    return () => { socket.off('world_event', handleWorldEvent) }
  }, [socket])

  // Auto-scroll animation
  useEffect(() => {
    if (!tickerRef.current || isPaused || events.length === 0) return

    const ticker = tickerRef.current
    const scrollSpeed = 0.5

    const animate = () => {
      scrollPosRef.current += scrollSpeed

      if (scrollPosRef.current >= ticker.scrollWidth / 2) {
        scrollPosRef.current = 0
      }

      ticker.scrollLeft = scrollPosRef.current
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPaused, events])

  const formatTime = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  }

  return (
    <div
      className="h-8 bg-card/90 border-b border-border overflow-hidden shrink-0"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {events.length === 0 ? (
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground/60">
          <Sparkles className="w-3.5 h-3.5 mr-2" />
          Awaiting world events...
        </div>
      ) : (
        <div
          ref={tickerRef}
          className="h-full flex items-center whitespace-nowrap overflow-hidden"
          style={{ scrollBehavior: 'auto' }}
        >
          {/* Duplicate events for seamless loop */}
          {[...events, ...events].map((event, idx) => {
            const Icon = EVENT_ICONS[event.type as WorldEvent['type']]
            const color = EVENT_COLORS[event.type as WorldEvent['type']]

            return (
              <div
                key={`${event.id}-${idx}`}
                className={`inline-flex items-center gap-2 px-4 text-sm ${
                  event.highlight ? 'bg-primary/20' : ''
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
                <span className={event.highlight ? 'text-primary font-medium' : 'text-foreground/80'}>
                  {event.message}
                </span>
                <span className="text-xs text-muted-foreground/60">
                  {formatTime(event.timestamp)}
                </span>
                <span className="text-muted-foreground/30 mx-2">|</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Fade edges */}
      <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent pointer-events-none" />
    </div>
  )
}

// Compact version for sidebar
export function EventFeed({ maxEvents = 10 }: { maxEvents?: number }) {
  const { socket } = useGame()
  const [events, setEvents] = useState<WorldEvent[]>([])

  useEffect(() => {
    if (!socket) return

    const handleWorldEvent = (data: Omit<WorldEvent, 'id' | 'timestamp'>) => {
      const newEvent: WorldEvent = {
        ...data,
        id: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
      }
      setEvents(prev => [newEvent, ...prev].slice(0, maxEvents))
    }

    socket.on('world_event', handleWorldEvent)
    return () => { socket.off('world_event', handleWorldEvent) }
  }, [socket, maxEvents])

  const formatTime = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 1000)
    if (diff < 60) return 'now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m`
    return `${Math.floor(diff / 3600)}h`
  }

  return (
    <div className="p-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1 flex items-center gap-1">
        <Sparkles className="w-3 h-3" /> World Events
      </p>
      {events.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/50 text-center py-2">Awaiting events...</p>
      ) : (
      <div className="space-y-1 max-h-32 overflow-y-auto">
      {events.map(event => {
        const Icon = EVENT_ICONS[event.type as WorldEvent['type']]
        const color = EVENT_COLORS[event.type as WorldEvent['type']]

        return (
          <div
            key={event.id}
            className={`flex items-start gap-2 p-2 rounded text-xs ${
              event.highlight ? 'bg-primary/10 border border-primary/30' : 'bg-card/50'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${color} shrink-0 mt-0.5`} />
            <div className="flex-1 min-w-0">
              <p className="text-foreground/80 break-words">{event.message}</p>
            </div>
            <span className="text-muted-foreground/60 shrink-0">
              {formatTime(event.timestamp)}
            </span>
          </div>
        )
      })}
    </div>
      )}
    </div>
  )
}
