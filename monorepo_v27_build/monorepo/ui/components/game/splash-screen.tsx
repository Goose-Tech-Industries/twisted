"use client"

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

const LOADING_TIPS = [
  "Blood Oghams grow stronger when equipped as complete sets.",
  "Party members share experience from nearby kills.",
  "The Arena offers unique rewards not found elsewhere.",
  "Limit Breaks charge faster when taking damage.",
  "Some NPCs have secret dialogue options after completing quests.",
  "Elemental weaknesses deal 50% extra damage.",
  "Guild treasury investments unlock passive bonuses.",
  "Night time spawns different, more dangerous enemies.",
  "Save your gold - death has a cost.",
  "The Codex tracks all creatures you've encountered."
]

interface SplashScreenProps {
  onComplete: () => void
  minDuration?: number
}

export function SplashScreen({ onComplete, minDuration = 3000 }: SplashScreenProps) {
  const [progress, setProgress] = useState(0)
  const [tip, setTip] = useState('')
  const [fadeOut, setFadeOut] = useState(false)
  const [showLogo, setShowLogo] = useState(false)
  const [showTitle, setShowTitle] = useState(false)
  const [showSubtitle, setShowSubtitle] = useState(false)
  
  useEffect(() => {
    // Random tip
    setTip(LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)])
    
    // Staggered animations
    setTimeout(() => setShowLogo(true), 200)
    setTimeout(() => setShowTitle(true), 800)
    setTimeout(() => setShowSubtitle(true), 1200)
    
    // Progress bar
    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const newProgress = Math.min((elapsed / minDuration) * 100, 100)
      setProgress(newProgress)
      
      if (newProgress >= 100) {
        clearInterval(interval)
        setFadeOut(true)
        setTimeout(onComplete, 500)
      }
    }, 50)
    
    return () => clearInterval(interval)
  }, [minDuration, onComplete])
  
  return (
    <div 
      className={cn(
        "fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center transition-opacity duration-500",
        fadeOut && "opacity-0"
      )}
    >
      {/* Animated background pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          {/* Celtic knotwork pattern - simplified SVG */}
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="celticPattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-primary" />
                <circle cx="10" cy="10" r="4" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-primary" />
                <path d="M 2 10 Q 10 2 18 10 Q 10 18 2 10" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-primary" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#celticPattern)" />
          </svg>
        </div>
        
        {/* Animated glow */}
        <div className="absolute inset-0 bg-gradient-radial from-primary/10 via-transparent to-transparent animate-pulse-slow" />
      </div>
      
      {/* Logo and Title */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Logo mark */}
        <div 
          className={cn(
            "relative w-32 h-32 mb-8 transition-all duration-1000",
            showLogo ? "opacity-100 scale-100" : "opacity-0 scale-50"
          )}
        >
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-spin" style={{ animationDuration: '20s' }} />
          
          {/* Middle ring */}
          <div className="absolute inset-2 rounded-full border border-primary/50 animate-spin" style={{ animationDuration: '15s', animationDirection: 'reverse' }} />
          
          {/* Inner glow */}
          <div className="absolute inset-4 rounded-full bg-primary/20 animate-pulse-slow" />
          
          {/* Center symbol */}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-20 h-20 text-primary">
              {/* Triquetra / Trinity knot */}
              <path 
                d="M 50 15 
                   Q 75 35 65 60 
                   Q 55 75 50 85 
                   Q 45 75 35 60 
                   Q 25 35 50 15
                   M 50 35
                   Q 35 45 30 60
                   Q 35 75 50 75
                   Q 65 75 70 60
                   Q 65 45 50 35"
                fill="none" 
                stroke="currentColor" 
                strokeWidth="3"
                className="animate-pulse-slow"
              />
              {/* Center circle */}
              <circle cx="50" cy="55" r="8" fill="currentColor" className="animate-pulse-slow" />
            </svg>
          </div>
          
          {/* Floating runes */}
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className="absolute w-3 h-3 rounded-full bg-primary rune-glow"
              style={{
                left: '50%',
                top: '50%',
                transform: `rotate(${i * 90}deg) translateY(-60px) translateX(-50%)`,
                animationDelay: `${i * 0.5}s`
              }}
            />
          ))}
        </div>
        
        {/* Title */}
        <h1 
          className={cn(
            "text-5xl md:text-6xl font-bold tracking-wider transition-all duration-700",
            showTitle ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
          style={{ textShadow: '0 0 30px var(--primary)' }}
        >
          <span className="text-primary">TWISTED</span>
          <span className="text-foreground ml-3">ENGINE</span>
        </h1>
        
        {/* Subtitle */}
        <p 
          className={cn(
            "mt-4 text-lg text-muted-foreground tracking-widest uppercase transition-all duration-700",
            showSubtitle ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
        >
          Dark Celtic Fantasy
        </p>
      </div>
      
      {/* Loading Section */}
      <div className="absolute bottom-20 left-0 right-0 px-8 max-w-md mx-auto">
        {/* Progress bar */}
        <div className="h-1 bg-secondary rounded-full overflow-hidden mb-4">
          <div 
            className="h-full bg-primary transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        {/* Loading text */}
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">
            {progress < 100 ? 'Entering the void...' : 'Ready'}
          </span>
          <span className="text-primary font-mono">{Math.round(progress)}%</span>
        </div>
        
        {/* Tip */}
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground/70 italic">
            Tip: {tip}
          </p>
        </div>
      </div>
      
      {/* Version */}
      <div className="absolute bottom-4 right-4 text-xs text-muted-foreground/50">
        v0.1.0-alpha
      </div>
    </div>
  )
}
