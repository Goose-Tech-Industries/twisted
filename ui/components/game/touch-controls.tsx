"use client"
import React from 'react'

import { useState, useCallback, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Swords, Shield, Zap, Package, CircleDot } from 'lucide-react'
import { useGame } from '@/lib/game-context'
import { useUiSounds } from '@/lib/audio-context'

// =================================================================
// D-PAD COMPONENT
// =================================================================
interface DPadProps {
  onMove: (direction: 'up' | 'down' | 'left' | 'right') => void
  disabled?: boolean
}

function DPad({ onMove, disabled }: DPadProps) {
  const sounds = useUiSounds()
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [activeDir, setActiveDir] = useState<string | null>(null)
  
  const startMove = useCallback((dir: 'up' | 'down' | 'left' | 'right') => {
    if (disabled) return
    sounds.click()
    setActiveDir(dir)
    onMove(dir)
    
    // Continuous movement while held
    intervalRef.current = setInterval(() => onMove(dir), 150)
  }, [disabled, onMove, sounds])
  
  const stopMove = useCallback(() => {
    setActiveDir(null)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])
  
  const btnClass = (dir: string) => `
    flex items-center justify-center w-12 h-12 rounded-lg
    transition-all active:scale-95
    ${activeDir === dir 
      ? 'bg-primary text-primary-foreground shadow-lg' 
      : 'bg-secondary/80 text-foreground hover:bg-secondary'
    }
    ${disabled ? 'opacity-50 pointer-events-none' : ''}
  `
  
  return (
    <div className="grid grid-cols-3 gap-1 w-fit">
      {/* Top row */}
      <div />
      <button
        className={btnClass('up')}
        onTouchStart={() => startMove('up')}
        onTouchEnd={stopMove}
        onMouseDown={() => startMove('up')}
        onMouseUp={stopMove}
        onMouseLeave={stopMove}
      >
        <ChevronUp className="w-6 h-6" />
      </button>
      <div />
      
      {/* Middle row */}
      <button
        className={btnClass('left')}
        onTouchStart={() => startMove('left')}
        onTouchEnd={stopMove}
        onMouseDown={() => startMove('left')}
        onMouseUp={stopMove}
        onMouseLeave={stopMove}
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      <div className="flex items-center justify-center w-12 h-12">
        <CircleDot className="w-4 h-4 text-muted-foreground" />
      </div>
      <button
        className={btnClass('right')}
        onTouchStart={() => startMove('right')}
        onTouchEnd={stopMove}
        onMouseDown={() => startMove('right')}
        onMouseUp={stopMove}
        onMouseLeave={stopMove}
      >
        <ChevronRight className="w-6 h-6" />
      </button>
      
      {/* Bottom row */}
      <div />
      <button
        className={btnClass('down')}
        onTouchStart={() => startMove('down')}
        onTouchEnd={stopMove}
        onMouseDown={() => startMove('down')}
        onMouseUp={stopMove}
        onMouseLeave={stopMove}
      >
        <ChevronDown className="w-6 h-6" />
      </button>
      <div />
    </div>
  )
}

// =================================================================
// ACTION BUTTONS
// =================================================================
interface ActionButtonsProps {
  onAttack: () => void
  onDefend: () => void
  onSkill: () => void
  onItem: () => void
  disabled?: boolean
  inBattle?: boolean
}

function ActionButtons({ onAttack, onDefend, onSkill, onItem, disabled, inBattle }: ActionButtonsProps) {
  const sounds = useUiSounds()
  
  const handlePress = useCallback((action: () => void) => {
    if (disabled) return
    sounds.click()
    action()
  }, [disabled, sounds])
  
  if (!inBattle) {
    // In exploration mode, show interact button
    return (
      <div className="flex gap-2">
        <button
          onClick={() => handlePress(onAttack)}
          className={`
            flex items-center justify-center w-14 h-14 rounded-full
            bg-primary text-primary-foreground shadow-lg
            transition-all active:scale-95
            ${disabled ? 'opacity-50 pointer-events-none' : ''}
          `}
        >
          <Zap className="w-7 h-7" />
        </button>
      </div>
    )
  }
  
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        onClick={() => handlePress(onAttack)}
        className={`
          flex items-center justify-center w-12 h-12 rounded-lg
          bg-red-600 text-white shadow-lg
          transition-all active:scale-95
          ${disabled ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <Swords className="w-6 h-6" />
      </button>
      <button
        onClick={() => handlePress(onDefend)}
        className={`
          flex items-center justify-center w-12 h-12 rounded-lg
          bg-blue-600 text-white shadow-lg
          transition-all active:scale-95
          ${disabled ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <Shield className="w-6 h-6" />
      </button>
      <button
        onClick={() => handlePress(onSkill)}
        className={`
          flex items-center justify-center w-12 h-12 rounded-lg
          bg-purple-600 text-white shadow-lg
          transition-all active:scale-95
          ${disabled ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <Zap className="w-6 h-6" />
      </button>
      <button
        onClick={() => handlePress(onItem)}
        className={`
          flex items-center justify-center w-12 h-12 rounded-lg
          bg-green-600 text-white shadow-lg
          transition-all active:scale-95
          ${disabled ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <Package className="w-6 h-6" />
      </button>
    </div>
  )
}

// =================================================================
// MAIN TOUCH CONTROLS LAYER
// =================================================================
export function TouchControls() {
  const { state, dispatch, notify } = useGame()
  const [visible, setVisible] = useState(false)
  
  // Detect touch device
  useEffect(() => {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    setVisible(isTouchDevice)
  }, [])
  
  // Movement handler
  const handleMove = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (state.battle) return // No movement in battle
    
    // In production, this would emit to server
    // socket.emit('move', { direction })
    
    // For demo, update character position locally
    const delta = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }
    const d = delta[direction]
    
    if (state.character) {
      const newX = Math.max(0, Math.min(19, state.character.x + d.x))
      const newY = Math.max(0, Math.min(19, state.character.y + d.y))
      
      dispatch({
        type: 'SET_CHARACTER',
        payload: { ...state.character, x: newX, y: newY }
      })
    }
  }, [state.battle, state.character, dispatch])
  
  // Combat handlers
  const handleAttack = useCallback(() => {
    if (!state.battle) {
      notify('info', 'Interact')
      return
    }
    notify('info', 'Attack!')
  }, [state.battle, notify])
  
  const handleDefend = useCallback(() => {
    notify('info', 'Defend!')
  }, [notify])
  
  const handleSkill = useCallback(() => {
    notify('info', 'Skill menu')
  }, [notify])
  
  const handleItem = useCallback(() => {
    notify('info', 'Item menu')
  }, [notify])
  
  if (!visible) return null
  
  return (
    <div className="fixed bottom-20 left-0 right-0 z-30 pointer-events-none md:hidden">
      <div className="flex justify-between items-end px-4">
        {/* D-Pad (left side) */}
        <div className="pointer-events-auto">
          <DPad onMove={handleMove} disabled={!!state.battle} />
        </div>
        
        {/* Action Buttons (right side) */}
        <div className="pointer-events-auto">
          <ActionButtons
            onAttack={handleAttack}
            onDefend={handleDefend}
            onSkill={handleSkill}
            onItem={handleItem}
            inBattle={!!state.battle}
          />
        </div>
      </div>
    </div>
  )
}
