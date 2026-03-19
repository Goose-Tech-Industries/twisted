"use client"

import { useGame } from "@/lib/game-context"
import { getNameColor, getNameEffect } from "@/lib/name-colors"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { 
  Swords, 
  Shield, 
  Sparkles, 
  ShieldPlus, 
  Gauge,
  Clover,
  Heart,
  Droplets,
  Zap,
  TrendingUp
} from "lucide-react"

const STAT_CONFIG = [
  { key: 'atk', label: 'Attack', icon: Swords, color: 'text-[oklch(0.55_0.22_25)]' },
  { key: 'def', label: 'Defense', icon: Shield, color: 'text-[oklch(0.55_0.12_185)]' },
  { key: 'mo', label: 'Magic Off.', icon: Sparkles, color: 'text-[oklch(0.60_0.25_310)]' },
  { key: 'md', label: 'Magic Def.', icon: ShieldPlus, color: 'text-[oklch(0.50_0.18_280)]' },
  { key: 'speed', label: 'Speed', icon: Gauge, color: 'text-[oklch(0.65_0.18_85)]' },
  { key: 'luck', label: 'Luck', icon: Clover, color: 'text-[oklch(0.55_0.15_140)]' },
] as const

export function CharacterPanel() {
  const gameContext = useGame()
  const state = gameContext.state
  const char = gameContext.character
  const oghams = gameContext.oghams || []
  
  if (!char) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No character loaded</p>
      </div>
    )
  }
  
  const hpPercent = (char.currentHp / char.maxHp) * 100
  const mpPercent = (char.currentMp / char.maxMp) * 100
  const xpPercent = (char.experience / char.experienceToNext) * 100
  const limitPercent = char.limitbreak
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
      {/* Left Column - Character Info & Resources */}
      <div className="lg:col-span-2 space-y-4">
        {/* Header Card */}
        <Card className="celtic-border">
          <CardContent className="p-6">
            <div className="flex items-start gap-6">
              {/* Character Portrait */}
              <div className="w-24 h-24 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/40 flex items-center justify-center text-4xl font-bold text-primary blood-text">
                {char.level}
              </div>
              
              {/* Character Details */}
              <div className="flex-1">
                <h2 className={cn("text-2xl font-bold blood-text", getNameEffect(state.role || undefined))}
                  style={{ color: getNameColor(state.role || undefined, state.chatColor) || undefined }}>
                  {char.name}
                </h2>
                <p className="text-muted-foreground mt-1">
                  Level {char.level} {char.raceName} {char.className}
                </p>
                
                {/* Resource Bars */}
                <div className="mt-4 space-y-3">
                  {/* HP Bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium flex items-center gap-1.5 text-[oklch(0.55_0.20_140)]">
                        <Heart className="w-3 h-3" /> Health
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {char.currentHp} / {char.maxHp}
                      </span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-[oklch(0.45_0.18_140)] to-[oklch(0.55_0.20_140)] transition-all duration-500 rounded-full"
                        style={{ width: `${hpPercent}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* MP Bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium flex items-center gap-1.5 text-[oklch(0.55_0.18_260)]">
                        <Droplets className="w-3 h-3" /> Mana
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {char.currentMp} / {char.maxMp}
                      </span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-[oklch(0.45_0.16_260)] to-[oklch(0.55_0.18_260)] transition-all duration-500 rounded-full"
                        style={{ width: `${mpPercent}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Limit Break Bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium flex items-center gap-1.5 text-[oklch(0.60_0.25_310)]">
                        <Zap className="w-3 h-3" /> Limit Break (Lv.{char.breaklevel})
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {Math.round(limitPercent)}%
                      </span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 rounded-full ${
                          limitPercent >= 100 
                            ? 'bg-gradient-to-r from-[oklch(0.50_0.25_310)] to-[oklch(0.65_0.25_310)] animate-pulse-slow' 
                            : 'bg-gradient-to-r from-[oklch(0.40_0.20_310)] to-[oklch(0.55_0.22_310)]'
                        }`}
                        style={{ width: `${Math.min(limitPercent, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Stats Grid */}
        <Card className="celtic-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Combat Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {STAT_CONFIG.map(({ key, label, icon: Icon, color }) => (
                <div 
                  key={key}
                  className="bg-card/50 border border-border/50 rounded-lg p-4 hover:bg-card/80 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-4 h-4 ${color}`} />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">
                      {label}
                    </span>
                  </div>
                  <p className={`text-2xl font-bold tabular-nums ${color}`}>
                    {char[key as keyof typeof char]}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        {/* Experience Bar */}
        <Card className="celtic-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <TrendingUp className="w-5 h-5 text-[oklch(0.65_0.18_85)]" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">Experience</span>
                  <span className="text-xs text-muted-foreground">
                    {char.experience.toLocaleString()} / {char.experienceToNext.toLocaleString()} XP
                  </span>
                </div>
                <Progress 
                  value={xpPercent} 
                  className="h-2 bg-muted"
                />
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-[oklch(0.65_0.18_85)]">
                  Lv.{char.level}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Right Column - Equipment & Currency */}
      <div className="space-y-4">
        {/* Currency */}
        <Card className="celtic-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Currency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[oklch(0.75_0.15_85)]/20 flex items-center justify-center">
                <span className="text-lg">G</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-[oklch(0.75_0.15_85)] tabular-nums">
                  {char.gold.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Gold Pieces</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Equipment Preview */}
        <Card className="celtic-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Equipped Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {['Main Hand', 'Off Hand', 'Head', 'Body', 'Accessory'].map((slot, i) => (
                <div 
                  key={slot}
                  className="flex items-center gap-3 p-2 bg-card/50 border border-border/30 rounded hover:border-primary/30 transition-colors cursor-pointer"
                >
                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    {i === 0 ? <Swords className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      {i === 0 ? 'Iron Longsword' : i === 1 ? '-- Empty --' : i === 2 ? 'Leather Hood' : i === 3 ? 'Leather Cuirass' : 'Silver Ring'}
                    </p>
                    <p className="text-xs text-muted-foreground">{slot}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        {/* Active Oghams */}
        <Card className="celtic-border bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-primary uppercase tracking-wider flex items-center gap-2">
              <Droplets className="w-4 h-4" />
              Blood Oghams
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {oghams.filter(o => o.slotted).map(ogham => (
                <div 
                  key={ogham.id}
                  className="flex items-center gap-3 p-2 bg-primary/10 border border-primary/30 rounded rune-glow"
                >
                  <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary">
                    <Droplets className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary truncate">
                      {ogham.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ogham.familyName}
                    </p>
                  </div>
                </div>
              ))}
              {oghams.filter(o => o.slotted).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No Oghams equipped
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
