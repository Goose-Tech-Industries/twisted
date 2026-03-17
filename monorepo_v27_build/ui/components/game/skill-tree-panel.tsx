"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { useGame } from '@/lib/game-context'
import { Zap, Lock, Check, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

// =================================================================
// SKILL TREE DATA
// =================================================================

interface SkillNode {
  id: string
  name: string
  description: string
  icon: string
  tier: number // 0-4, determines vertical position
  branch: 'left' | 'center' | 'right'
  position: number // horizontal position within branch
  requires?: string[] // prerequisite skill IDs
  maxRank: number
  currentRank: number
  cost: number // skill points per rank
  effects: string[]
  element?: 'fire' | 'ice' | 'lightning' | 'earth' | 'shadow' | 'holy'
}

interface SkillTree {
  id: string
  name: string
  description: string
  color: string
  nodes: SkillNode[]
}

// Sample skill trees
const SKILL_TREES: SkillTree[] = [
  {
    id: 'combat',
    name: 'Way of the Blade',
    description: 'Master physical combat techniques',
    color: '#dc2626',
    nodes: [
      // Tier 0 - Base
      { id: 'slash', name: 'Power Slash', description: 'A powerful horizontal strike', icon: 'sword', tier: 0, branch: 'center', position: 0, maxRank: 5, currentRank: 5, cost: 1, effects: ['+10% damage per rank', 'Generates threat'] },
      
      // Tier 1
      { id: 'fury', name: 'Battle Fury', description: 'Enter a rage, increasing attack speed', icon: 'flame', tier: 1, branch: 'left', position: 0, requires: ['slash'], maxRank: 3, currentRank: 3, cost: 2, effects: ['+15% attack speed', '+5% crit chance'], element: 'fire' },
      { id: 'guard', name: 'Iron Guard', description: 'Defensive stance reducing damage', icon: 'shield', tier: 1, branch: 'center', position: 0, requires: ['slash'], maxRank: 3, currentRank: 2, cost: 2, effects: ['-20% damage taken', '+10% block chance'] },
      { id: 'thrust', name: 'Piercing Thrust', description: 'Strike that ignores armor', icon: 'target', tier: 1, branch: 'right', position: 0, requires: ['slash'], maxRank: 3, currentRank: 1, cost: 2, effects: ['Ignores 30% armor', '+5% crit damage'] },
      
      // Tier 2
      { id: 'whirlwind', name: 'Whirlwind', description: 'Spin attack hitting all nearby foes', icon: 'rotate', tier: 2, branch: 'left', position: 0, requires: ['fury'], maxRank: 3, currentRank: 2, cost: 3, effects: ['Hits all enemies', '+25% AoE damage'] },
      { id: 'counter', name: 'Counter Strike', description: 'Riposte after a successful block', icon: 'undo', tier: 2, branch: 'center', position: 0, requires: ['guard'], maxRank: 3, currentRank: 0, cost: 3, effects: ['100% damage on counter', 'Stuns for 1s'] },
      { id: 'execute', name: 'Execute', description: 'Powerful finisher on low HP targets', icon: 'skull', tier: 2, branch: 'right', position: 0, requires: ['thrust'], maxRank: 3, currentRank: 0, cost: 3, effects: ['+100% damage under 20% HP', 'Ignores defense'] },
      
      // Tier 3
      { id: 'berserk', name: 'Berserker Rage', description: 'Ultimate offensive state', icon: 'zap', tier: 3, branch: 'left', position: 0, requires: ['whirlwind'], maxRank: 1, currentRank: 0, cost: 5, effects: ['+50% damage', '+50% attack speed', '-30% defense'], element: 'fire' },
      { id: 'bulwark', name: 'Unbreakable', description: 'Become immune to stagger', icon: 'castle', tier: 3, branch: 'center', position: 0, requires: ['counter', 'guard'], maxRank: 1, currentRank: 0, cost: 5, effects: ['Immune to stagger', '+25% max HP'] },
      { id: 'deathblow', name: 'Death Blow', description: 'Massive single target strike', icon: 'target', tier: 3, branch: 'right', position: 0, requires: ['execute'], maxRank: 1, currentRank: 0, cost: 5, effects: ['+200% damage', '3 turn cooldown'], element: 'shadow' },
      
      // Tier 4 - Ultimate
      { id: 'warlord', name: 'Warlord', description: 'Ascend to mastery of combat', icon: 'crown', tier: 4, branch: 'center', position: 0, requires: ['berserk', 'bulwark', 'deathblow'], maxRank: 1, currentRank: 0, cost: 10, effects: ['All combat skills enhanced', '+10 to all combat stats', 'Unlocks Limit Break: Ragnarok'] },
    ]
  },
  {
    id: 'magic',
    name: 'Arcane Mastery',
    description: 'Channel the elements and bend reality',
    color: '#7c3aed',
    nodes: [
      { id: 'spark', name: 'Arcane Spark', description: 'Basic magical attack', icon: 'sparkle', tier: 0, branch: 'center', position: 0, maxRank: 5, currentRank: 4, cost: 1, effects: ['+10 magic damage', 'No cost'] },
      { id: 'fireball', name: 'Fireball', description: 'Launch a ball of flame', icon: 'flame', tier: 1, branch: 'left', position: 0, requires: ['spark'], maxRank: 3, currentRank: 2, cost: 2, effects: ['Fire damage', 'Chance to burn'], element: 'fire' },
      { id: 'icebolt', name: 'Ice Bolt', description: 'Frozen projectile', icon: 'snowflake', tier: 1, branch: 'center', position: 0, requires: ['spark'], maxRank: 3, currentRank: 1, cost: 2, effects: ['Ice damage', 'Chance to slow'], element: 'ice' },
      { id: 'lightning', name: 'Chain Lightning', description: 'Arc between enemies', icon: 'zap', tier: 1, branch: 'right', position: 0, requires: ['spark'], maxRank: 3, currentRank: 0, cost: 2, effects: ['Chains to 3 targets', '+20% to wet targets'], element: 'lightning' },
      { id: 'meteor', name: 'Meteor', description: 'Call down destruction', icon: 'bomb', tier: 2, branch: 'left', position: 0, requires: ['fireball'], maxRank: 3, currentRank: 0, cost: 3, effects: ['Massive AoE', 'Burns ground'], element: 'fire' },
      { id: 'blizzard', name: 'Blizzard', description: 'Freezing storm', icon: 'cloud-snow', tier: 2, branch: 'center', position: 0, requires: ['icebolt'], maxRank: 3, currentRank: 0, cost: 3, effects: ['AoE slow', 'Freeze chance'], element: 'ice' },
      { id: 'tempest', name: 'Tempest', description: 'Devastating lightning storm', icon: 'cloud-lightning', tier: 2, branch: 'right', position: 0, requires: ['lightning'], maxRank: 3, currentRank: 0, cost: 3, effects: ['Random lightning strikes', '+crit chance'], element: 'lightning' },
      { id: 'inferno', name: 'Inferno', description: 'Ultimate fire magic', icon: 'flame', tier: 3, branch: 'left', position: 0, requires: ['meteor'], maxRank: 1, currentRank: 0, cost: 5, effects: ['Continuous burn', 'Ignites area'], element: 'fire' },
      { id: 'absolute', name: 'Absolute Zero', description: 'Ultimate ice magic', icon: 'thermometer-snowflake', tier: 3, branch: 'center', position: 0, requires: ['blizzard'], maxRank: 1, currentRank: 0, cost: 5, effects: ['Instant freeze', 'Shatters frozen'], element: 'ice' },
      { id: 'storm', name: 'Cataclysm', description: 'Ultimate lightning', icon: 'cloud-lightning', tier: 3, branch: 'right', position: 0, requires: ['tempest'], maxRank: 1, currentRank: 0, cost: 5, effects: ['Massive chain', 'Stuns all'], element: 'lightning' },
      { id: 'archmage', name: 'Archmage', description: 'Master of all elements', icon: 'star', tier: 4, branch: 'center', position: 0, requires: ['inferno', 'absolute', 'storm'], maxRank: 1, currentRank: 0, cost: 10, effects: ['Cast 2 spells per turn', '-50% mana cost', 'Unlocks Limit Break: Armageddon'] },
    ]
  },
  {
    id: 'shadow',
    name: 'Path of Shadows',
    description: 'Strike from darkness, unseen and deadly',
    color: '#1e293b',
    nodes: [
      { id: 'backstab', name: 'Backstab', description: 'Strike from behind', icon: 'target', tier: 0, branch: 'center', position: 0, maxRank: 5, currentRank: 3, cost: 1, effects: ['+50% from behind', 'Generates combo point'], element: 'shadow' },
      { id: 'stealth', name: 'Stealth', description: 'Become invisible', icon: 'eye-off', tier: 1, branch: 'left', position: 0, requires: ['backstab'], maxRank: 3, currentRank: 1, cost: 2, effects: ['Invisibility', '+crit from stealth'] },
      { id: 'poison', name: 'Envenom', description: 'Coat weapons in poison', icon: 'droplet', tier: 1, branch: 'center', position: 0, requires: ['backstab'], maxRank: 3, currentRank: 0, cost: 2, effects: ['DoT damage', 'Stacks 5x'] },
      { id: 'agility', name: 'Evasion', description: 'Enhanced dodge', icon: 'wind', tier: 1, branch: 'right', position: 0, requires: ['backstab'], maxRank: 3, currentRank: 2, cost: 2, effects: ['+25% dodge', '+10% speed'] },
      { id: 'ambush', name: 'Ambush', description: 'Devastating opener', icon: 'crosshair', tier: 2, branch: 'left', position: 0, requires: ['stealth'], maxRank: 3, currentRank: 0, cost: 3, effects: ['+200% from stealth', 'Stuns target'], element: 'shadow' },
      { id: 'assassinate', name: 'Assassinate', description: 'Execute combo finisher', icon: 'skull', tier: 2, branch: 'center', position: 0, requires: ['poison'], maxRank: 3, currentRank: 0, cost: 3, effects: ['Consumes combo points', '+40% per point'] },
      { id: 'shadowstep', name: 'Shadow Step', description: 'Teleport behind target', icon: 'move', tier: 2, branch: 'right', position: 0, requires: ['agility'], maxRank: 3, currentRank: 0, cost: 3, effects: ['Instant teleport', 'Breaks roots'], element: 'shadow' },
      { id: 'vanish', name: 'Vanish', description: 'Escape to shadows', icon: 'ghost', tier: 3, branch: 'left', position: 0, requires: ['ambush'], maxRank: 1, currentRank: 0, cost: 5, effects: ['Break combat', 'Full heal'], element: 'shadow' },
      { id: 'deathmark', name: 'Mark of Death', description: 'Mark target for doom', icon: 'target', tier: 3, branch: 'center', position: 0, requires: ['assassinate'], maxRank: 1, currentRank: 0, cost: 5, effects: ['+100% damage to marked', 'Reveals stealth'] },
      { id: 'phantom', name: 'Phantom', description: 'Become untouchable', icon: 'shield-off', tier: 3, branch: 'right', position: 0, requires: ['shadowstep'], maxRank: 1, currentRank: 0, cost: 5, effects: ['100% dodge for 3s', 'Counter all attacks'], element: 'shadow' },
      { id: 'reaper', name: 'Reaper', description: 'Death incarnate', icon: 'skull', tier: 4, branch: 'center', position: 0, requires: ['vanish', 'deathmark', 'phantom'], maxRank: 1, currentRank: 0, cost: 10, effects: ['Instant kill under 10% HP', 'Reset on kill', 'Unlocks Limit Break: Final Curtain'], element: 'shadow' },
    ]
  }
]

const ELEMENT_COLORS: Record<string, string> = {
  fire: '#f97316',
  ice: '#0ea5e9',
  lightning: '#eab308',
  earth: '#84cc16',
  shadow: '#6366f1',
  holy: '#fbbf24'
}

// =================================================================
// COMPONENT
// =================================================================

export function SkillTreePanel() {
  const { character } = useGame()
  const [activeTree, setActiveTree] = useState(0)
  const [selectedNode, setSelectedNode] = useState<SkillNode | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  
  const tree = SKILL_TREES[activeTree]
  const availablePoints = 15 // Would come from character
  const spentPoints = tree.nodes.reduce((sum, n) => sum + (n.currentRank * n.cost), 0)
  
  // Check if a node can be learned
  const canLearn = (node: SkillNode) => {
    if (node.currentRank >= node.maxRank) return false
    if (availablePoints < node.cost) return false
    if (!node.requires) return true
    return node.requires.every(reqId => {
      const req = tree.nodes.find(n => n.id === reqId)
      return req && req.currentRank > 0
    })
  }
  
  // Get node position in the tree
  const getNodePosition = (node: SkillNode) => {
    const tierHeight = 100
    const branchWidth = 140
    
    let x = 200 // center
    if (node.branch === 'left') x = 200 - branchWidth
    if (node.branch === 'right') x = 200 + branchWidth
    
    const y = 50 + node.tier * tierHeight
    
    return { x, y }
  }
  
  // Handle pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).classList.contains('tree-canvas')) {
      isDragging.current = true
      lastPos.current = { x: e.clientX, y: e.clientY }
    }
  }
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    setPan(p => ({ x: p.x + dx, y: p.y + dy }))
    lastPos.current = { x: e.clientX, y: e.clientY }
  }, [])
  
  const handleMouseUp = useCallback(() => {
    isDragging.current = false
  }, [])
  
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])
  
  // Draw connection lines
  const renderConnections = () => {
    const lines: JSX.Element[] = []
    
    tree.nodes.forEach(node => {
      if (!node.requires) return
      
      const nodePos = getNodePosition(node)
      
      node.requires.forEach(reqId => {
        const req = tree.nodes.find(n => n.id === reqId)
        if (!req) return
        
        const reqPos = getNodePosition(req)
        const isActive = req.currentRank > 0
        
        lines.push(
          <line
            key={`${reqId}-${node.id}`}
            x1={reqPos.x}
            y1={reqPos.y + 20}
            x2={nodePos.x}
            y2={nodePos.y - 20}
            stroke={isActive ? tree.color : '#374151'}
            strokeWidth={isActive ? 3 : 2}
            strokeDasharray={isActive ? undefined : '5,5'}
            className={isActive ? 'animate-pulse-slow' : ''}
          />
        )
      })
    })
    
    return lines
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTree(t => (t - 1 + SKILL_TREES.length) % SKILL_TREES.length)}
            className="p-2 hover:bg-secondary rounded"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div 
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${tree.color}30` }}
          >
            <Zap className="w-5 h-5" style={{ color: tree.color }} />
          </div>
          
          <div>
            <h2 className="text-lg font-bold">{tree.name}</h2>
            <p className="text-xs text-muted-foreground">{tree.description}</p>
          </div>
          
          <button
            onClick={() => setActiveTree(t => (t + 1) % SKILL_TREES.length)}
            className="p-2 hover:bg-secondary rounded"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        
        {/* Points */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Skill Points</div>
            <div className="font-bold" style={{ color: tree.color }}>
              {availablePoints - spentPoints} / {availablePoints}
            </div>
          </div>
          
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1 hover:bg-background rounded">
              <Minus className="w-4 h-4" />
            </button>
            <span className="text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(1.5, z + 0.1))} className="p-1 hover:bg-background rounded">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Tree indicators */}
      <div className="flex justify-center gap-2 mb-4">
        {SKILL_TREES.map((t, i) => (
          <button
            key={t.id}
            onClick={() => setActiveTree(i)}
            className={cn(
              "w-3 h-3 rounded-full transition-all",
              i === activeTree ? "scale-125" : "opacity-50"
            )}
            style={{ backgroundColor: t.color }}
          />
        ))}
      </div>
      
      {/* Tree Canvas */}
      <div 
        ref={containerRef}
        className="flex-1 celtic-border rounded-lg overflow-hidden cursor-grab active:cursor-grabbing relative"
        onMouseDown={handleMouseDown}
      >
        <div 
          className="tree-canvas w-full h-full"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: 'center center'
          }}
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {renderConnections()}
          </svg>
          
          {/* Skill Nodes */}
          {tree.nodes.map(node => {
            const pos = getNodePosition(node)
            const learned = node.currentRank > 0
            const maxed = node.currentRank >= node.maxRank
            const available = canLearn(node)
            
            return (
              <button
                key={node.id}
                onClick={() => setSelectedNode(node)}
                className={cn(
                  "absolute w-14 h-14 rounded-lg flex items-center justify-center transition-all transform -translate-x-1/2 -translate-y-1/2",
                  "border-2 hover:scale-110",
                  maxed ? "border-primary bg-primary/30" : 
                  learned ? "border-primary/50 bg-primary/20" :
                  available ? "border-muted-foreground/50 bg-secondary" :
                  "border-muted/30 bg-muted/10 opacity-50"
                )}
                style={{
                  left: pos.x,
                  top: pos.y,
                  boxShadow: learned ? `0 0 20px ${tree.color}40` : undefined
                }}
              >
                {!learned && !available ? (
                  <Lock className="w-5 h-5 text-muted-foreground" />
                ) : maxed ? (
                  <Check className="w-6 h-6 text-primary" />
                ) : (
                  <Zap 
                    className={cn("w-6 h-6", learned ? "text-primary" : "text-muted-foreground")} 
                    style={node.element ? { color: ELEMENT_COLORS[node.element] } : undefined}
                  />
                )}
                
                {/* Rank indicator */}
                {node.maxRank > 1 && (
                  <div className="absolute -bottom-1 -right-1 text-xs bg-background px-1 rounded border border-border">
                    {node.currentRank}/{node.maxRank}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
      
      {/* Selected Node Details */}
      {selectedNode && (
        <div className="mt-4 celtic-border rounded-lg p-4">
          <div className="flex items-start gap-4">
            <div 
              className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0"
              style={{ 
                backgroundColor: selectedNode.element ? `${ELEMENT_COLORS[selectedNode.element]}20` : `${tree.color}20`,
                boxShadow: selectedNode.currentRank > 0 ? `0 0 15px ${tree.color}40` : undefined
              }}
            >
              <Zap 
                className="w-7 h-7" 
                style={{ color: selectedNode.element ? ELEMENT_COLORS[selectedNode.element] : tree.color }}
              />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg">{selectedNode.name}</h3>
                <span className="text-sm text-muted-foreground">
                  Rank {selectedNode.currentRank}/{selectedNode.maxRank}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{selectedNode.description}</p>
              
              <div className="mt-3 space-y-1">
                {selectedNode.effects.map((effect, i) => (
                  <div key={i} className="text-sm flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tree.color }} />
                    {effect}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="shrink-0 text-right">
              <div className="text-sm text-muted-foreground">Cost</div>
              <div className="font-bold" style={{ color: tree.color }}>
                {selectedNode.cost} point{selectedNode.cost > 1 ? 's' : ''}
              </div>
              
              {canLearn(selectedNode) && (
                <button
                  className="mt-2 px-4 py-2 rounded text-sm font-medium text-primary-foreground transition-colors"
                  style={{ backgroundColor: tree.color }}
                >
                  Learn
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
