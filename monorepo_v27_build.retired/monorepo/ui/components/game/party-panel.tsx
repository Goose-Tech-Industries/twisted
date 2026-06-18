"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { 
  Users,
  Crown,
  Swords,
  Shield,
  Heart,
  MessageCircle,
  UserPlus,
  UserMinus,
  MapPin,
  Circle
} from "lucide-react"

interface PartyMember {
  id: number
  name: string
  level: number
  className: string
  hp: number
  maxHp: number
  online: boolean
  isLeader: boolean
  location?: string
}

const MOCK_PARTY: PartyMember[] = [
  { id: 1, name: 'Cormac the Wanderer', level: 12, className: 'Blood Knight', hp: 245, maxHp: 320, online: true, isLeader: true, location: 'Dun Aengus' },
  { id: 2, name: 'Aisling', level: 11, className: 'Druid', hp: 180, maxHp: 200, online: true, isLeader: false, location: 'Dun Aengus' },
  { id: 3, name: 'Fergus Blackhand', level: 13, className: 'Berserker', hp: 0, maxHp: 380, online: false, isLeader: false, location: 'Unknown' },
]

const NEARBY_PLAYERS = [
  { id: 4, name: 'Siobhan the Swift', level: 10, className: 'Rogue', online: true },
  { id: 5, name: 'Brennan', level: 14, className: 'Paladin', online: true },
]

export function PartyPanel() {
  const [party] = useState<PartyMember[]>(MOCK_PARTY)
  const [selectedMember, setSelectedMember] = useState<PartyMember | null>(null)
  
  const onlineCount = party.filter(m => m.online).length
  
  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Party
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {onlineCount}/{party.length} members online
              </p>
            </div>
            <Button variant="outline" size="sm">
              <UserPlus className="w-4 h-4 mr-2" />
              Invite
            </Button>
          </div>
          
          {/* Party Members */}
          <Card className="celtic-border mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Current Party
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {party.map(member => {
                const hpPercent = (member.hp / member.maxHp) * 100
                const isDead = member.hp <= 0
                
                return (
                  <button
                    key={member.id}
                    onClick={() => setSelectedMember(member)}
                    className={cn(
                      "w-full p-4 rounded-lg border text-left transition-all",
                      member.online 
                        ? "celtic-border hover:border-primary/40" 
                        : "bg-muted/30 border-border/50",
                      selectedMember?.id === member.id && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                      isDead && "opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className="relative">
                        <div className={cn(
                          "w-12 h-12 rounded-lg flex items-center justify-center font-bold",
                          member.isLeader 
                            ? "bg-[oklch(0.65_0.15_85)]/20 text-[oklch(0.65_0.15_85)] border border-[oklch(0.65_0.15_85)]/40" 
                            : "bg-primary/20 text-primary border border-primary/40"
                        )}>
                          {member.level}
                        </div>
                        {/* Online Indicator */}
                        <div className={cn(
                          "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-card",
                          member.online ? "bg-[oklch(0.55_0.15_140)]" : "bg-muted"
                        )} />
                        {/* Leader Crown */}
                        {member.isLeader && (
                          <Crown className="absolute -top-2 -right-2 w-4 h-4 text-[oklch(0.65_0.15_85)]" />
                        )}
                      </div>
                      
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className={cn(
                            "font-medium truncate",
                            !member.online && "text-muted-foreground"
                          )}>
                            {member.name}
                          </h3>
                          {isDead && (
                            <span className="text-xs px-1.5 py-0.5 bg-destructive/20 text-destructive rounded">
                              KO
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Lv.{member.level} {member.className}
                        </p>
                        
                        {/* HP Bar */}
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Heart className="w-3 h-3" /> HP
                            </span>
                            <span className="tabular-nums">{member.hp}/{member.maxHp}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full transition-all",
                                hpPercent > 50 
                                  ? "bg-[oklch(0.55_0.20_140)]" 
                                  : hpPercent > 25 
                                    ? "bg-[oklch(0.65_0.18_85)]" 
                                    : "bg-destructive"
                              )}
                              style={{ width: `${hpPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      
                      {/* Location */}
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          {member.location}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </CardContent>
          </Card>
          
          {/* Nearby Players */}
          <Card className="celtic-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Nearby Adventurers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {NEARBY_PLAYERS.map(player => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-card/50 border border-border/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center font-bold text-sm">
                      {player.level}
                    </div>
                    <div>
                      <p className="font-medium">{player.name}</p>
                      <p className="text-xs text-muted-foreground">Lv.{player.level} {player.className}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    <UserPlus className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {NEARBY_PLAYERS.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No adventurers nearby
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Member Detail Sidebar */}
      {selectedMember && (
        <aside className="w-80 border-l border-border bg-card/50 p-4 overflow-y-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className={cn(
              "w-14 h-14 rounded-lg flex items-center justify-center font-bold text-xl",
              selectedMember.isLeader 
                ? "bg-[oklch(0.65_0.15_85)]/20 text-[oklch(0.65_0.15_85)] border border-[oklch(0.65_0.15_85)]/40" 
                : "bg-primary/20 text-primary border border-primary/40"
            )}>
              {selectedMember.level}
            </div>
            <div>
              <h3 className="font-bold">{selectedMember.name}</h3>
              <p className="text-sm text-muted-foreground">{selectedMember.className}</p>
              <div className="flex items-center gap-1 text-xs mt-1">
                <Circle className={cn(
                  "w-2 h-2",
                  selectedMember.online ? "fill-[oklch(0.55_0.15_140)] text-[oklch(0.55_0.15_140)]" : "fill-muted text-muted"
                )} />
                {selectedMember.online ? 'Online' : 'Offline'}
              </div>
            </div>
          </div>
          
          {/* Stats */}
          <Card className="celtic-border mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* HP */}
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Heart className="w-3 h-3" /> Health
                  </span>
                  <span className="tabular-nums">{selectedMember.hp}/{selectedMember.maxHp}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[oklch(0.55_0.20_140)]"
                    style={{ width: `${(selectedMember.hp / selectedMember.maxHp) * 100}%` }}
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Location</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {selectedMember.location}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Role</span>
                <span className="flex items-center gap-1">
                  {selectedMember.isLeader ? (
                    <>
                      <Crown className="w-3 h-3 text-[oklch(0.65_0.15_85)]" />
                      Leader
                    </>
                  ) : (
                    <>
                      <Shield className="w-3 h-3" />
                      Member
                    </>
                  )}
                </span>
              </div>
            </CardContent>
          </Card>
          
          {/* Actions */}
          <div className="space-y-2">
            <Button className="w-full" variant="outline">
              <MessageCircle className="w-4 h-4 mr-2" />
              Whisper
            </Button>
            <Button className="w-full" variant="outline">
              <MapPin className="w-4 h-4 mr-2" />
              Go to Location
            </Button>
            {selectedMember.hp <= 0 && (
              <Button className="w-full bg-[oklch(0.55_0.20_140)] hover:bg-[oklch(0.50_0.20_140)]">
                <Heart className="w-4 h-4 mr-2" />
                Revive (50 MP)
              </Button>
            )}
            {!selectedMember.isLeader && (
              <Button className="w-full border-destructive/50 text-destructive hover:bg-destructive/10" variant="outline">
                <UserMinus className="w-4 h-4 mr-2" />
                Remove from Party
              </Button>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
