"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useGame } from "@/lib/game-context"
import type { NearbyPlayer } from "@/lib/game-types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import {
  X,
  HandshakeIcon,
  Users,
  ArrowLeftRight,
  Swords,
  UserPlus,
  Shield,
  Eye,
  Circle,
} from "lucide-react"

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Returns the player's real name or "Unknown {class}" depending on
 * whether the greet system is enabled and whether this player has
 * been greeted.
 */
export function getDisplayName(
  player: NearbyPlayer,
  greetedIds: Set<number>,
  greetEnabled: boolean,
): string {
  if (!greetEnabled) return player.name

  const charId = player.charId ?? player.id
  if (charId != null && greetedIds.has(charId)) return player.name

  const cls = player.className ?? "Adventurer"
  return `Unknown ${cls}`
}

const PRESENCE_COLOR: Record<string, string> = {
  online: "text-[oklch(0.65_0.18_145)]",   // green
  idle: "text-[oklch(0.75_0.15_85)]",       // amber
  busy: "text-[oklch(0.60_0.22_25)]",       // red-ish
  offline: "text-muted-foreground",
}

const PRESENCE_DOT: Record<string, string> = {
  online: "fill-[oklch(0.65_0.18_145)]",
  idle: "fill-[oklch(0.75_0.15_85)]",
  busy: "fill-[oklch(0.60_0.22_25)]",
  offline: "fill-muted-foreground",
}

function classInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

// ── Component ────────────────────────────────────────────────────

interface PlayerInspectPanelProps {
  player: NearbyPlayer | null
  onClose: () => void
}

export function PlayerInspectPanel({ player, onClose }: PlayerInspectPanelProps) {
  const { state, socket, dispatch } = useGame()
  const [greeting, setGreeting] = useState(false)
  const [inspectData, setInspectData] = useState<Record<string, unknown> | null>(null)

  const greetEnabled = state.enableGreetSystem
  const targetCharId = player?.charId ?? player?.id

  // Can I see their name? Only if they greeted ME (their ID is in my greetedPlayerIds)
  const canSeeName = targetCharId != null && state.greetedPlayerIds.includes(targetCharId)
  // Have I already greeted them? (my ID was sent to them)
  const alreadyGreeted = targetCharId != null && state.hasGreetedPlayerIds.includes(targetCharId)

  const displayName = player
    ? (greetEnabled && !canSeeName ? `Unknown ${player.className || 'Adventurer'}` : player.name)
    : ""

  // Fetch inspect data when panel opens
  useEffect(() => {
    if (!socket || !targetCharId) return
    setInspectData(null)
    socket.emit("inspect_player", { targetCharId })
    const handler = (data: Record<string, unknown>) => {
      if (data.success) setInspectData(data.character as Record<string, unknown>)
    }
    socket.on("inspect_result", handler)
    return () => { socket.off("inspect_result", handler) }
  }, [socket, targetCharId])

  const handleGreet = useCallback(() => {
    if (!socket || !targetCharId || alreadyGreeted) return
    setGreeting(true)
    socket.emit("greet_player", { targetCharId })
    // Optimistic: mark as "I've greeted them" (they can see my name now, but I still can't see theirs)
    dispatch({ type: 'ADD_HAS_GREETED_ID', payload: targetCharId })
    setTimeout(() => setGreeting(false), 600)
  }, [socket, targetCharId, alreadyGreeted, dispatch])

  const emit = useCallback(
    (event: string) => {
      if (!socket || !targetCharId) return
      socket.emit(event, { targetCharId })
    },
    [socket, targetCharId],
  )

  // ── Render ──────────────────────────────────────────────────────

  const presence = player?.presence ?? "online"
  const isOpen = player !== null

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:bg-transparent md:backdrop-blur-none"
          onClick={onClose}
        />
      )}

      {/* Slide-in panel */}
      <div
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full max-w-sm",
          "bg-background/95 border-l border-border shadow-2xl",
          "transition-transform duration-300 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        {player && (
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 p-5">
              {/* ── Header ───────────────────────────────── */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-14 w-14 border-2 border-border bg-muted">
                    <AvatarFallback className="text-lg font-bold tracking-wider text-foreground">
                      {classInitials(player.className ?? "??")}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex flex-col gap-0.5">
                    <h2 className="text-lg font-semibold leading-tight text-foreground">
                      {displayName}
                    </h2>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Lv. {player.level}</span>
                      {player.className && (
                        <>
                          <span className="opacity-40">|</span>
                          <span>{player.className}</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                      <Circle
                        className={cn("h-2.5 w-2.5", PRESENCE_DOT[presence])}
                      />
                      <span className={cn("capitalize", PRESENCE_COLOR[presence])}>
                        {player.isOffline ? "Offline" : presence}
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* ── Role / party badges ──────────────────── */}
              <div className="flex flex-wrap gap-2">
                {player.role && (
                  <Badge variant="outline" className="border-[oklch(0.60_0.22_25)] text-[oklch(0.60_0.22_25)]">
                    {player.role}
                  </Badge>
                )}
                {!!player.inParty && (
                  <Badge variant="outline" className="border-[oklch(0.55_0.18_260)] text-[oklch(0.55_0.18_260)]">
                    In Your Party
                  </Badge>
                )}
              </div>

              <Separator />

              {/* ── Greet section ─────────────────────────── */}
              {!!greetEnabled && !alreadyGreeted && !canSeeName && (
                <Card className="border-dashed border-[oklch(0.75_0.15_85)]/40 bg-[oklch(0.75_0.15_85)]/5">
                  <CardContent className="flex flex-col items-center gap-3 p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      This warrior&apos;s identity is hidden. Greet them to reveal
                      your name — they&apos;ll see who you are, but you won&apos;t know
                      them until they greet you back.
                    </p>
                    <Button
                      onClick={handleGreet}
                      disabled={greeting}
                      className="gap-2 bg-[oklch(0.75_0.15_85)] text-[oklch(0.18_0_0)] hover:bg-[oklch(0.70_0.15_85)]"
                    >
                      <HandshakeIcon className="h-4 w-4" />
                      {greeting ? "Greeting..." : "Greet"}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {greetEnabled && alreadyGreeted && !canSeeName && (
                <div className="flex items-center gap-2 rounded-md bg-[oklch(0.75_0.15_85)]/10 px-3 py-2 text-sm text-[oklch(0.75_0.15_85)]">
                  <HandshakeIcon className="h-4 w-4" />
                  You&apos;ve greeted this player. Waiting for them to greet you back...
                </div>
              )}

              {greetEnabled && canSeeName && (
                <div className="flex items-center gap-2 rounded-md bg-[oklch(0.65_0.18_145)]/10 px-3 py-2 text-sm text-[oklch(0.65_0.18_145)]">
                  <HandshakeIcon className="h-4 w-4" />
                  {alreadyGreeted ? "You know each other" : "This player greeted you"}
                  {!alreadyGreeted && (
                    <Button size="sm" variant="ghost" className="ml-auto text-xs" onClick={handleGreet}>
                      Greet Back
                    </Button>
                  )}
                </div>
              )}

              {/* ── Description ────────────────────────────── */}
              {!!inspectData?.description && (
                <Card className="border-border/40 bg-card/40">
                  <CardContent className="p-3">
                    <p className="text-sm italic text-muted-foreground leading-relaxed">
                      &ldquo;{inspectData.description as string}&rdquo;
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* ── Detailed info (only shown if greeted or greet system off) */}
              {(!greetEnabled || canSeeName) && inspectData && (
                <Card className="border-border/60 bg-card/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Eye className="h-4 w-4" />
                      Inspection Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Race</span>
                      <span className="font-medium text-foreground">{(inspectData.raceName as string) || '--'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Guild</span>
                      <span className="font-medium text-foreground">{(inspectData.guildName as string) || '--'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Title</span>
                      <span className="font-medium text-foreground">{(inspectData.title as string) || '--'}</span>
                    </div>
                    <Separator />
                    <div className="text-xs text-muted-foreground">
                      <div className="mb-2 flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5" />
                        <span className="font-medium">Equipment</span>
                      </div>
                      {Array.isArray(inspectData.equipment) && (inspectData.equipment as Array<{slot: string; name: string; icon: string; rarity?: string}>).length > 0 ? (
                        <div className="grid gap-1.5">
                          {(inspectData.equipment as Array<{slot: string; name: string; icon: string; rarity?: string}>).map((eq, i) => (
                            <div key={i} className="flex items-center gap-2 text-foreground/80">
                              <span className="w-16 text-[10px] uppercase text-muted-foreground/60">{eq.slot}</span>
                              <span>{eq.icon}</span>
                              <span className="text-xs">{eq.name}</span>
                              {eq.rarity && eq.rarity !== 'common' && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0">{eq.rarity}</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="italic opacity-60">No equipment visible.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Separator />

              {/* ── Action buttons ────────────────────────── */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Actions
                </p>

                <Button
                  variant="outline"
                  className="justify-start gap-3"
                  onClick={() => emit("party_invite")}
                  disabled={!!player.inParty}
                >
                  <Users className="h-4 w-4 text-[oklch(0.55_0.18_260)]" />
                  Invite to Party
                </Button>

                <Button
                  variant="outline"
                  className="justify-start gap-3"
                  onClick={() => emit("trade_request")}
                >
                  <ArrowLeftRight className="h-4 w-4 text-[oklch(0.75_0.15_85)]" />
                  Send Trade Request
                </Button>

                <Button
                  variant="outline"
                  className="justify-start gap-3"
                  onClick={() => emit("duel_challenge")}
                >
                  <Swords className="h-4 w-4 text-[oklch(0.60_0.22_25)]" />
                  Challenge to Duel
                </Button>

                <Button
                  variant="outline"
                  className="justify-start gap-3"
                  onClick={() => emit("friend_request_sent")}
                >
                  <UserPlus className="h-4 w-4 text-[oklch(0.65_0.18_145)]" />
                  Send Friend Request
                </Button>
              </div>

              {/* ── View Full Profile ──────────────────── */}
              {(!greetEnabled || canSeeName) && (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 border-primary/30 text-primary"
                  onClick={() => {
                    if (targetCharId) {
                      dispatch({ type: 'SET_VIEW_PROFILE', payload: targetCharId })
                      dispatch({ type: 'SET_VIEW', payload: 'profile' })
                      onClose()
                    }
                  }}
                >
                  <Eye className="h-4 w-4" />
                  View Full Profile
                </Button>
              )}

              {/* ── Coordinates (subtle) ─────────────────── */}
              <div className="mt-2 text-[11px] text-muted-foreground/50">
                Position: ({player.x}, {player.y})
              </div>
            </div>
          </ScrollArea>
        )}
      </div>
    </>
  )
}
