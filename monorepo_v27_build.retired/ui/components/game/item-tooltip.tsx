"use client"

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { useGame } from '@/lib/game-context'
import type { Item } from '@/lib/game-types'
import { 
  Swords, Shield, Sparkles, ShieldPlus, Gauge, Clover, 
  Heart, Droplets, TrendingUp, TrendingDown, Minus,
  Flame, Snowflake, Zap, Wind, Moon, Sun
} from 'lucide-react'

interface ItemTooltipProps {
  item: Item
  children: ReactNode
  compareWith?: Item | null // Item to compare against (usually equipped)
  showEquipped?: boolean
}

const RARITY_COLORS: Record<string, string> = {
  common: 'border-muted-foreground/30',
  uncommon: 'border-[oklch(0.55_0.15_140)]',
  rare: 'border-[oklch(0.55_0.18_260)]',
  epic: 'border-[oklch(0.60_0.25_310)]',
  legendary: 'border-[oklch(0.75_0.15_85)]',
}

const RARITY_BG: Record<string, string> = {
  common: 'bg-card',
  uncommon: 'bg-gradient-to-br from-[oklch(0.55_0.15_140/0.1)] to-card',
  rare: 'bg-gradient-to-br from-[oklch(0.55_0.18_260/0.1)] to-card',
  epic: 'bg-gradient-to-br from-[oklch(0.60_0.25_310/0.1)] to-card',
  legendary: 'bg-gradient-to-br from-[oklch(0.75_0.15_85/0.15)] to-card',
}

const RARITY_TEXT: Record<string, string> = {
  common: 'text-muted-foreground',
  uncommon: 'text-[oklch(0.55_0.15_140)]',
  rare: 'text-[oklch(0.55_0.18_260)]',
  epic: 'text-[oklch(0.60_0.25_310)]',
  legendary: 'text-[oklch(0.75_0.15_85)]',
}

const ELEMENT_ICONS: Record<string, typeof Flame> = {
  fire: Flame,
  ice: Snowflake,
  lightning: Zap,
  wind: Wind,
  dark: Moon,
  light: Sun,
}

const STAT_ICONS: Record<string, typeof Swords> = {
  atk: Swords,
  def: Shield,
  mo: Sparkles,
  md: ShieldPlus,
  speed: Gauge,
  luck: Clover,
  hp: Heart,
  mp: Droplets,
}

function StatDiff({ label, current, compare, icon: Icon }: { 
  label: string
  current: number 
  compare: number
  icon: typeof Swords 
}) {
  const diff = current - compare
  
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1 text-muted-foreground">
        <Icon className="w-3 h-3" />
        {label}
      </span>
      <div className="flex items-center gap-2">
        <span className="tabular-nums">{current}</span>
        {diff !== 0 && (
          <span className={`flex items-center tabular-nums ${
            diff > 0 ? 'text-[oklch(0.55_0.15_140)]' : 'text-[oklch(0.55_0.22_25)]'
          }`}>
            {diff > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {diff > 0 ? '+' : ''}{diff}
          </span>
        )}
      </div>
    </div>
  )
}

export function ItemTooltip({ item, children, compareWith, showEquipped }: ItemTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  
  const rarity = item.rarity || 'common'
  
  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect()
      const tooltipRect = tooltipRef.current.getBoundingClientRect()
      
      let x = triggerRect.right + 8
      let y = triggerRect.top
      
      // Check right edge
      if (x + tooltipRect.width > window.innerWidth - 16) {
        x = triggerRect.left - tooltipRect.width - 8
      }
      
      // Check bottom edge
      if (y + tooltipRect.height > window.innerHeight - 16) {
        y = window.innerHeight - tooltipRect.height - 16
      }
      
      // Check top edge
      if (y < 16) y = 16
      
      setPosition({ x, y })
    }
  }, [isVisible])
  
  const stats = item.stats || {}
  const compareStats = compareWith?.stats || {}
  
  return (
    <div
      ref={triggerRef}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      className="inline-block"
    >
      {children}
      
      {isVisible && (
        <div
          ref={tooltipRef}
          className={`fixed z-[100] w-64 p-3 rounded-lg border-2 shadow-xl ${RARITY_COLORS[rarity]} ${RARITY_BG[rarity]}`}
          style={{ left: position.x, top: position.y }}
        >
          {/* Header */}
          <div className="border-b border-border/50 pb-2 mb-2">
            <h4 className={`font-bold ${RARITY_TEXT[rarity]}`}>
              {item.name}
            </h4>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-muted-foreground capitalize">
                {item.type} {item.slot && `- ${item.slot}`}
              </span>
              <span className={`text-xs capitalize ${RARITY_TEXT[rarity]}`}>
                {rarity}
              </span>
            </div>
            {item.reqLevel && (
              <p className="text-xs text-muted-foreground mt-1">
                Requires Level {item.reqLevel}
              </p>
            )}
          </div>
          
          {/* Stats with Comparison */}
          {Object.keys(stats).length > 0 && (
            <div className="space-y-1 mb-2">
              {Object.entries(stats).map(([key, value]) => {
                const Icon = STAT_ICONS[key] || Minus
                const compareValue = compareStats[key] || 0
                return (
                  <StatDiff 
                    key={key}
                    label={key.toUpperCase()}
                    current={value as number}
                    compare={compareWith ? (compareValue as number) : (value as number)}
                    icon={Icon}
                  />
                )
              })}
            </div>
          )}
          
          {/* Element */}
          {item.element && (
            <div className="flex items-center gap-2 text-xs mb-2">
              {(() => {
                const ElemIcon = ELEMENT_ICONS[item.element] || Sparkles
                return <ElemIcon className="w-3 h-3" />
              })()}
              <span className="capitalize">{item.element} Element</span>
            </div>
          )}
          
          {/* Description */}
          {item.description && (
            <p className="text-xs text-muted-foreground italic border-t border-border/50 pt-2">
              {item.description}
            </p>
          )}
          
          {/* Price */}
          {item.price !== undefined && (
            <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-border/50">
              <span className="text-muted-foreground">Value</span>
              <span className="text-[oklch(0.75_0.15_85)] tabular-nums">
                {item.price.toLocaleString()} G
              </span>
            </div>
          )}
          
          {/* Equipped indicator */}
          {showEquipped && (
            <div className="text-xs text-primary text-center mt-2 pt-2 border-t border-border/50">
              Currently Equipped
            </div>
          )}
          
          {/* Compare hint */}
          {compareWith && (
            <div className="text-xs text-muted-foreground text-center mt-2">
              Comparing with: {compareWith.name}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
