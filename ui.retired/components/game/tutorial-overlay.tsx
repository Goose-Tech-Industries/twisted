"use client"
import React from 'react'

import { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft, Keyboard, Map, Swords, Users, Backpack, Droplets } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TutorialStep {
  id: string
  title: string
  description: string
  icon: React.ElementType
  highlight?: string // CSS selector or area name
  position?: 'center' | 'top' | 'bottom' | 'left' | 'right'
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Twisted Engine',
    description: 'A dark Celtic fantasy RPG where blood magic and ancient oghams shape your destiny. Let me show you around.',
    icon: Map,
    position: 'center'
  },
  {
    id: 'character',
    title: 'Your Character',
    description: 'The character panel shows your stats, equipment, and progression. Track your HP, MP, and Limit Break gauge here.',
    icon: Users,
    highlight: 'sidebar-character',
    position: 'right'
  },
  {
    id: 'inventory',
    title: 'Inventory & Equipment',
    description: 'Manage your items, weapons, and armor. Equip gear to boost your stats and prepare for battle.',
    icon: Backpack,
    highlight: 'sidebar-inventory',
    position: 'right'
  },
  {
    id: 'oghams',
    title: 'Blood Oghams',
    description: 'Ancient runes carved in blood. Slot oghams to gain powerful bonuses. Complete sets for even greater power.',
    icon: Droplets,
    highlight: 'sidebar-oghams',
    position: 'right'
  },
  {
    id: 'combat',
    title: 'Turn-Based Combat',
    description: 'Battle enemies using skills, items, and strategy. Build your Limit Break gauge for devastating special attacks.',
    icon: Swords,
    highlight: 'sidebar-battle',
    position: 'right'
  },
  {
    id: 'controls',
    title: 'Keyboard Shortcuts',
    description: 'Use WASD or arrow keys to move. Press 1-6 for skills in combat. ESC opens the menu. Check Settings for all keybinds.',
    icon: Keyboard,
    position: 'center'
  },
  {
    id: 'ready',
    title: 'Ready for Adventure',
    description: 'You\'re all set! Explore the world, complete quests, and uncover the mysteries of the void. Good luck, wanderer.',
    icon: Map,
    position: 'center'
  }
]

interface TutorialOverlayProps {
  onComplete: () => void
  onSkip: () => void
}

export function TutorialOverlay({ onComplete, onSkip }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isVisible, setIsVisible] = useState(true)
  
  const step = TUTORIAL_STEPS[currentStep]
  const Icon = step.icon
  const isFirst = currentStep === 0
  const isLast = currentStep === TUTORIAL_STEPS.length - 1
  
  const handleNext = () => {
    if (isLast) {
      setIsVisible(false)
      setTimeout(onComplete, 300)
    } else {
      setCurrentStep(s => s + 1)
    }
  }
  
  const handlePrev = () => {
    if (!isFirst) {
      setCurrentStep(s => s - 1)
    }
  }
  
  const handleSkip = () => {
    setIsVisible(false)
    setTimeout(onSkip, 300)
  }
  
  // Handle keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext()
      if (e.key === 'ArrowLeft') handlePrev()
      if (e.key === 'Escape') handleSkip()
    }
    
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentStep])
  
  return (
    <div 
      className={cn(
        "fixed inset-0 z-[90] transition-opacity duration-300",
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      {/* Backdrop with spotlight effect */}
      <div className="absolute inset-0 bg-black/80" />
      
      {/* Tutorial Card */}
      <div 
        className={cn(
          "absolute transition-all duration-300",
          step.position === 'center' && "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
          step.position === 'right' && "top-1/2 left-[calc(50%+100px)] -translate-y-1/2",
          step.position === 'left' && "top-1/2 right-[calc(50%+100px)] -translate-y-1/2",
          step.position === 'top' && "top-24 left-1/2 -translate-x-1/2",
          step.position === 'bottom' && "bottom-24 left-1/2 -translate-x-1/2"
        )}
      >
        <div className="bg-card border border-border rounded-lg shadow-2xl max-w-md w-full overflow-hidden">
          {/* Header */}
          <div className="bg-primary/10 p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
              <Icon className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg">{step.title}</h3>
              <p className="text-xs text-muted-foreground">
                Step {currentStep + 1} of {TUTORIAL_STEPS.length}
              </p>
            </div>
            <button
              onClick={handleSkip}
              className="p-2 hover:bg-secondary rounded transition-colors"
              title="Skip tutorial"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {/* Content */}
          <div className="p-6">
            <p className="text-foreground leading-relaxed">
              {step.description}
            </p>
          </div>
          
          {/* Progress dots */}
          <div className="flex justify-center gap-2 pb-4">
            {TUTORIAL_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  i === currentStep ? "bg-primary w-4" : "bg-secondary hover:bg-muted-foreground"
                )}
              />
            ))}
          </div>
          
          {/* Navigation */}
          <div className="border-t border-border p-4 flex items-center justify-between">
            <button
              onClick={handlePrev}
              disabled={isFirst}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded transition-colors",
                isFirst ? "opacity-50 cursor-not-allowed" : "hover:bg-secondary"
              )}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            
            <button
              onClick={handleSkip}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip Tutorial
            </button>
            
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
            >
              <span>{isLast ? 'Begin' : 'Next'}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Keyboard hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
        Use arrow keys to navigate, ESC to skip
      </div>
    </div>
  )
}
