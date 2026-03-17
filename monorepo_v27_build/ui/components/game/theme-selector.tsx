"use client"

import { useTheme } from '@/lib/theme-context'
import { Check, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ThemeSelector() {
  const { theme, setTheme, themes } = useTheme()
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Palette className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">Theme / Skin</h3>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        {themes.map(t => {
          const isActive = theme.id === t.id
          
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={cn(
                "relative p-4 rounded-lg border-2 transition-all text-left",
                isActive 
                  ? "border-primary bg-primary/10" 
                  : "border-border hover:border-muted-foreground"
              )}
            >
              {/* Color preview */}
              <div className="flex gap-1 mb-3">
                <div 
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: t.colors.background }}
                />
                <div 
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: t.colors.primary }}
                />
                <div 
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: t.colors.accent }}
                />
                <div 
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: t.colors.card }}
                />
              </div>
              
              <h4 className="font-semibold text-sm">{t.name}</h4>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {t.description}
              </p>
              
              {/* Active indicator */}
              {isActive && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary-foreground" />
                </div>
              )}
              
              {/* Panel style badge */}
              {t.panelStyle && t.panelStyle !== 'solid' && (
                <span className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 bg-secondary rounded capitalize">
                  {t.panelStyle}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
