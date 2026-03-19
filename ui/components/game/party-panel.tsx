"use client"

import { useState, useEffect, useCallback } from "react"
import { useGame } from "@/lib/game-context"
import { partyApi, type PartyMember as ApiPartyMember, type Party } from "@/lib/game-api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getNameColor, getNameEffect } from "@/lib/name-colors"
import {
  Users,
  Crown,
  Shield,
  Heart,
  MessageCircle,
  UserPlus,
  UserMinus,
  MapPin,
  Circle,
  Loader2
} from "lucide-react"

export function PartyPanel() {
  const { state } = useGame()
  const character = state.character
  const charId = character?.charId
  const nearbyPlayers = state.nearbyPlayers || []

  const [party, setParty] = useState<Party | null>(null)
  const [members, setMembers] = useState<ApiPartyMember[]>([])
  const [selectedMember, setSelectedMember] = useState<ApiPartyMember | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchParty = useCallback(async () => {
    if (!charId) return
    setLoading(true)
    const res = await partyApi.getCurrentParty(charId)
    if (res.success && res.data) {
      setParty(res.data.party)
      setMembers(res.data.members || [])
    } else {
      // No party — also check top-level (non-nested response)
      const raw = res as unknown as Record<string, unknown>
      if (raw.party) {
        setParty(raw.party as Party)
        setMembers((raw.members as ApiPartyMember[]) || [])
      } else {
        setParty(null)
        setMembers([])
      }
    }
    setLoading(false)
  }, [charId])

  useEffect(() => { fetchParty() }, [fetchParty])

  if (!character) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select a character to view party
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading...
      </div>
    )
  }

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
                {party ? `${members.length} member${members.length !== 1 ? 's' : ''}` : 'No active party'}
              </p>
            </div>
            <Button variant="outline" size="sm">
              <UserPlus className="w-4 h-4 mr-2" />
              Invite
            </Button>
          </div>

          {/* Party Members */}
          {party ? (
            <Card className="celtic-border mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  {party.name || 'Current Party'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {members.map(member => {
                  const isLeader = member.char_id === party.leader_id
                  const isMe = member.char_id === charId

                  return (
                    <button
                      key={member.char_id}
                      onClick={() => setSelectedMember(member)}
                      className={cn(
                        "w-full p-4 rounded-lg border text-left transition-all",
                        "celtic-border hover:border-primary/40",
                        selectedMember?.char_id === member.char_id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        {/* Avatar */}
                        <div className="relative">
                          <div className={cn(
                            "w-12 h-12 rounded-lg flex items-center justify-center font-bold",
                            isLeader
                              ? "bg-[oklch(0.65_0.15_85)]/20 text-[oklch(0.65_0.15_85)] border border-[oklch(0.65_0.15_85)]/40"
                              : "bg-primary/20 text-primary border border-primary/40"
                          )}>
                            {member.level}
                          </div>
                          {isLeader && (
                            <Crown className="absolute -top-2 -right-2 w-4 h-4 text-[oklch(0.65_0.15_85)]" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className={cn("font-medium truncate", getNameEffect((member as unknown as Record<string,unknown>).role as string))}
                              style={{ color: getNameColor((member as unknown as Record<string,unknown>).role as string, (member as unknown as Record<string,unknown>).chatColor as string) || undefined }}>
                              {member.name}{isMe ? ' (You)' : ''}
                            </h3>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Lv.{member.level} {member.class_name || 'Adventurer'}
                          </p>
                        </div>

                        {/* Role badge */}
                        <div className="text-xs text-muted-foreground capitalize">
                          {member.role || (isLeader ? 'Leader' : 'Member')}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </CardContent>
            </Card>
          ) : (
            <Card className="celtic-border mb-6">
              <CardContent className="py-8 text-center text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No Active Party</p>
                <p className="text-sm mt-1">Invite nearby players to form a party</p>
              </CardContent>
            </Card>
          )}

          {/* Nearby Players */}
          <Card className="celtic-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Nearby Adventurers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {nearbyPlayers
                .filter(p => (p.charId ?? p.id) !== charId)
                .map(player => (
                <div
                  key={player.charId ?? player.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-card/50 border border-border/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center font-bold text-sm">
                      {(player as unknown as Record<string, unknown>).level as number || '?'}
                    </div>
                    <div>
                      <p className={cn("font-medium", getNameEffect(player.role))}
                        style={{ color: getNameColor(player.role, player.chatColor) || undefined }}>{player.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(player as unknown as Record<string, unknown>).class_name as string || 'Adventurer'}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    <UserPlus className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {nearbyPlayers.filter(p => (p.charId ?? p.id) !== charId).length === 0 && (
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
              selectedMember.char_id === party?.leader_id
                ? "bg-[oklch(0.65_0.15_85)]/20 text-[oklch(0.65_0.15_85)] border border-[oklch(0.65_0.15_85)]/40"
                : "bg-primary/20 text-primary border border-primary/40"
            )}>
              {selectedMember.level}
            </div>
            <div>
              <h3 className="font-bold">{selectedMember.name}</h3>
              <p className="text-sm text-muted-foreground">{selectedMember.class_name || 'Adventurer'}</p>
            </div>
          </div>

          {/* Info */}
          <Card className="celtic-border mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Role</span>
                <span className="flex items-center gap-1">
                  {selectedMember.char_id === party?.leader_id ? (
                    <>
                      <Crown className="w-3 h-3 text-[oklch(0.65_0.15_85)]" />
                      Leader
                    </>
                  ) : (
                    <>
                      <Shield className="w-3 h-3" />
                      {selectedMember.role || 'Member'}
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Joined</span>
                <span>{new Date(selectedMember.joined_at).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="space-y-2">
            <Button className="w-full" variant="outline">
              <MessageCircle className="w-4 h-4 mr-2" />
              Whisper
            </Button>
            {selectedMember.char_id !== charId && selectedMember.char_id !== party?.leader_id && (
              <Button className="w-full border-destructive/50 text-destructive hover:bg-destructive/10" variant="outline">
                <UserMinus className="w-4 h-4 mr-2" />
                Remove from Party
              </Button>
            )}
          </div>

          <button
            onClick={() => setSelectedMember(null)}
            className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </aside>
      )}
    </div>
  )
}
