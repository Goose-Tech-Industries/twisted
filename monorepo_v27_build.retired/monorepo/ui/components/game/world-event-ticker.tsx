"use client"

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

// Mock event generator for demo
const MOCK_EVENTS: Omit<WorldEvent, 'id' | 'timestamp'>[] = [
  { type: 'level', message: 'Brigid the Swift reached level 25!' },
  { type: 'kill', message: 'The Shadow Drake in Blackmoor has been slain' },
  { type: 'loot', message: 'Finn MacCool found Dragonbone Greatsword' },
  { type: 'pvp', message: 'Cormac defeated Niamh in the Arena (3-2)' },
  { type: 'guild', message: 'The Iron Wolves guild has been formed' },
  { type: 'boss', message: 'World Boss: The Morrigan awakens in 5 minutes!' },
  { type: 'achievement', message: 'Oisin earned "Dragon Slayer" achievement' },
  { type: 'event', message: 'Blood Moon rises over the realm...' },
  { type: 'announcement', message: 'Server maintenance in 30 minutes', highlight: true },
  { type: 'level', message: 'Deirdre mastered the Shadow Arts skill tree' },
  { type: 'loot', message: 'A legendary chest appeared in the Hollow' },
  { type: 'pvp', message: 'Clan War: The Fianna vs The Red Branch begins!' },
]

export function WorldEventTicker() {
  const { socket } = useGame()
  const [events, setEvents] = useState<WorldEvent[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const tickerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>(0)
  const scrollPosRef = useRef(0)
  
  // Generate initial mock events
  useEffect(() => {
    const initialEvents: WorldEvent[] = MOCK_EVENTS.slice(0, 5).map((e, i) => ({
      ...e,
      id: `initial-${i}`,
      timestamp: Date.now() - i * 30000,
    }))
    setEvents(initialEvents)
  }, [])
  
  // Add random events periodically in demo mode
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.6) {
        const randomEvent = MOCK_EVENTS[Math.floor(Math.random() * MOCK_EVENTS.length)]
        const newEvent: WorldEvent = {
          ...randomEvent,
          id: `event-${Date.now()}`,
          timestamp: Date.now(),
        }
        setEvents(prev => [newEvent, ...prev].slice(0, 50))
      }
    }, 8000)
    
    return () => clearInterval(interval)
  }, [])
  
  // Socket listener for real events
  useEffect(() => {
    if (!socket) return
    
    const handleWorldEvent = (data: Omit<WorldEvent, 'id' | 'timestamp'>) => {
      const newEvent: WorldEvent = {
        ...data,
        id: `socket-${Date.now()}`,
        timestamp: Date.now(),
      }
      setEvents(prev => [newEvent, ...prev].slice(0, 50))
    }
    
    socket.on('world_event', handleWorldEvent)
    return () => { socket.off('world_event', handleWorldEvent) }
  }, [socket])
  
  // Auto-scroll animation
  useEffect(() => {
    if (!tickerRef.current || isPaused) return
    
    const ticker = tickerRef.current
    const scrollSpeed = 0.5 // pixels per frame
    
    const animate = () => {
      scrollPosRef.current += scrollSpeed
      
      // Reset when we've scrolled through all content
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
      className="fixed top-0 left-0 right-0 h-8 bg-card/90 border-b border-border z-40 overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div 
        ref={tickerRef}
        className="h-full flex items-center whitespace-nowrap overflow-hidden"
        style={{ scrollBehavior: 'auto' }}
      >
        {/* Duplicate events for seamless loop */}
        {[...events, ...events].map((event, idx) => {
          const Icon = EVENT_ICONS[event.type]
          const color = EVENT_COLORS[event.type]
          
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
    const initialEvents: WorldEvent[] = MOCK_EVENTS.slice(0, maxEvents).map((e, i) => ({
      ...e,
      id: `feed-${i}`,
      timestamp: Date.now() - i * 60000,
    }))
    setEvents(initialEvents)
  }, [maxEvents])
  
  useEffect(() => {
    if (!socket) return
    
    const handleWorldEvent = (data: Omit<WorldEvent, 'id' | 'timestamp'>) => {
      const newEvent: WorldEvent = {
        ...data,
        id: `socket-${Date.now()}`,
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
    <div className="space-y-1">
      {events.map(event => {
        const Icon = EVENT_ICONS[event.type]
        const color = EVENT_COLORS[event.type]
        
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
  )
}
