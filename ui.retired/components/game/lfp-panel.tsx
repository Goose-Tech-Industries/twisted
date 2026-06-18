"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { useGame } from "@/lib/game-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  Users,
  Shield,
  Heart,
  Swords,
  Sparkles,
  RefreshCw,
  X,
  Clock,
  UserPlus,
} from "lucide-react"

// ── Types ────────────────────────────────────────────────────────

interface LfpListing {
  id: number
  character_id: number
  character_name: string
  level: number
  class_name: string
  role: string
  note: string
  content_type: string
  expires_at: string
  created_at: string
  equipped_title: string | null
  profile_color: string | null
  presence_status: string
  is_online: boolean
}

type Role = "DPS" | "Tank" | "Healer" | "Support" | "Any"

// ── Constants ────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ""

const ROLES: Role[] = ["DPS", "Tank", "Healer", "Support", "Any"]

const ROLE_CONFIG: Record<Role, { color: string; bg: string; icon: React.ElementType }> = {
  DPS:     { color: "text-[oklch(0.65_0.22_25)]",  bg: "bg-[oklch(0.65_0.22_25/0.15)]",  icon: Swords },
  Tank:    { color: "text-[oklch(0.65_0.18_250)]",  bg: "bg-[oklch(0.65_0.18_250/0.15)]",  icon: Shield },
  Healer:  { color: "text-[oklch(0.65_0.18_145)]",  bg: "bg-[oklch(0.65_0.18_145/0.15)]",  icon: Heart },
  Support: { color: "text-[oklch(0.65_0.18_300)]",  bg: "bg-[oklch(0.65_0.18_300/0.15)]",  icon: Sparkles },
  Any:     { color: "text-muted-foreground",         bg: "bg-muted/40",                      icon: Users },
}

const CONTENT_PRESETS = ["Dungeons", "PvP", "Questing", "Grinding", "Raids", "World Bosses"]

// ── Helpers ──────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// ── Component ────────────────────────────────────────────────────

export function LfpPanel() {
  const { state, socket, notify } = useGame()
  const charId = state.character?.charId

  // Board state
  const [listings, setListings] = useState<LfpListing[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedCard, setSelectedCard] = useState<number | null>(null)

  // List-yourself state
  const [selectedRole, setSelectedRole] = useState<Role>("Any")
  const [contentType, setContentType] = useState("")
  const [note, setNote] = useState("")
  const [isListed, setIsListed] = useState(false)
  const [myListingRole, setMyListingRole] = useState<string | null>(null)
  const [myListingContent, setMyListingContent] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch Board ──────────────────────────────────────────────

  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/lfp/board`, {
        credentials: "include",
      })
      const data = await res.json()
      if (data.success) {
        setListings(data.listings)
        // Check if current character is listed
        if (charId) {
          const mine = data.listings.find(
            (l: LfpListing) => l.character_id === charId
          )
          if (mine) {
            setIsListed(true)
            setMyListingRole(mine.role)
            setMyListingContent(mine.content_type)
            setSelectedRole(mine.role as Role)
            setContentType(mine.content_type || "")
            setNote(mine.note || "")
          } else {
            setIsListed(false)
            setMyListingRole(null)
            setMyListingContent(null)
          }
        }
      }
    } catch (err) {
      console.warn('[lfp] fetch failed:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [charId])

  useEffect(() => {
    fetchBoard()
    refreshTimer.current = setInterval(fetchBoard, 30000)
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current)
    }
  }, [fetchBoard])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchBoard()
  }

  // ── List / Update ────────────────────────────────────────────

  const handleList = async () => {
    if (!charId || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/api/lfp/list`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          charId,
          role: selectedRole,
          note: note.trim() || undefined,
          contentType: contentType.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        notify("success", data.message || "Listed on board!")
        fetchBoard()
      } else {
        notify("error", data.message || "Failed to list")
      }
    } catch {
      notify("error", "Network error")
    } finally {
      setSubmitting(false)
    }
  }

  // ── Unlist ───────────────────────────────────────────────────

  const handleUnlist = async () => {
    if (!charId || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/api/lfp/unlist`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charId }),
      })
      const data = await res.json()
      if (data.success) {
        notify("info", "Listing removed")
        setIsListed(false)
        setMyListingRole(null)
        setMyListingContent(null)
        fetchBoard()
      } else {
        notify("error", data.message || "Failed to remove listing")
      }
    } catch {
      notify("error", "Network error")
    } finally {
      setSubmitting(false)
    }
  }

  // ── Card Actions ─────────────────────────────────────────────

  const handleInvite = (targetCharId: number) => {
    socket?.emit("party_invite", { targetCharId })
    notify("info", "Party invite sent!")
    setSelectedCard(null)
  }

  // ── Render ───────────────────────────────────────────────────

  const RoleIcon = ({ role, className }: { role: string; className?: string }) => {
    const config = ROLE_CONFIG[role as Role] || ROLE_CONFIG.Any
    const Icon = config.icon
    return <Icon className={cn("size-4", className)} />
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4 max-w-5xl mx-auto w-full">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="size-5 text-[oklch(0.75_0.15_85)]" />
          <h2 className="text-lg font-bold tracking-wide text-foreground">
            Looking For Party
          </h2>
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {listings.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={refreshing}
          className="size-8"
        >
          <RefreshCw
            className={cn("size-4", refreshing && "animate-spin")}
          />
        </Button>
      </div>

      {/* ── Board ──────────────────────────────────────────── */}
      <ScrollArea className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <RefreshCw className="size-5 animate-spin mr-2" />
            Loading board...
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Users className="size-10 opacity-40" />
            <p className="text-sm">No adventurers seeking a party right now.</p>
            <p className="text-xs">Be the first to list yourself!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pr-3">
            {listings.map((listing) => {
              const roleKey = (listing.role as Role) || "Any"
              const config = ROLE_CONFIG[roleKey] || ROLE_CONFIG.Any
              const isSelected = selectedCard === listing.id
              const isSelf = listing.character_id === charId

              return (
                <Card
                  key={listing.id}
                  className={cn(
                    "cursor-pointer border-border/50 bg-card/60 backdrop-blur-sm transition-all hover:border-border hover:bg-card/80",
                    isSelected && "ring-1 ring-primary/50 border-primary/30"
                  )}
                  onClick={() =>
                    setSelectedCard(isSelected ? null : listing.id)
                  }
                >
                  <CardContent className="p-3 space-y-2">
                    {/* Row 1: Name + online dot */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            "size-2 rounded-full shrink-0",
                            listing.is_online
                              ? "bg-[oklch(0.65_0.18_145)]"
                              : "bg-muted-foreground/40"
                          )}
                        />
                        <span
                          className="font-semibold text-sm truncate"
                          style={{
                            color: listing.profile_color || undefined,
                          }}
                        >
                          {listing.character_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                        <Clock className="size-3" />
                        {timeAgo(listing.created_at)}
                      </div>
                    </div>

                    {/* Row 2: Level, class, title */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>Lv.{listing.level}</span>
                      <span className="opacity-40">|</span>
                      <span className="truncate">{listing.class_name}</span>
                      {listing.equipped_title && (
                        <>
                          <span className="opacity-40">|</span>
                          <span className="truncate italic text-[oklch(0.75_0.15_85)]">
                            {listing.equipped_title}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Row 3: Role badge + content type */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        className={cn(
                          "text-xs font-medium gap-1 border-0",
                          config.color,
                          config.bg
                        )}
                      >
                        <RoleIcon role={roleKey} className="size-3" />
                        {roleKey}
                      </Badge>
                      {listing.content_type && (
                        <Badge
                          variant="outline"
                          className="text-xs text-muted-foreground border-border/60"
                        >
                          {listing.content_type}
                        </Badge>
                      )}
                    </div>

                    {/* Row 4: Note */}
                    {listing.note && (
                      <p className="text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed">
                        {listing.note}
                      </p>
                    )}

                    {/* Actions (expanded) */}
                    {isSelected && !isSelf && (
                      <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1 text-[oklch(0.65_0.18_145)]"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleInvite(listing.character_id)
                          }}
                        >
                          <UserPlus className="size-3" />
                          Invite to Party
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1"
                          onClick={(e) => {
                            e.stopPropagation()
                            // Dispatch to open mail compose targeting this character
                            notify("info", `Opening mail to ${listing.character_name}...`)
                            setSelectedCard(null)
                          }}
                        >
                          Send Mail
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1"
                          onClick={(e) => {
                            e.stopPropagation()
                            notify("info", `Viewing ${listing.character_name}'s profile...`)
                            setSelectedCard(null)
                          }}
                        >
                          View Profile
                        </Button>
                      </div>
                    )}

                    {isSelected && isSelf && (
                      <div className="pt-1 border-t border-border/40">
                        <p className="text-xs text-muted-foreground italic">
                          This is your listing
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </ScrollArea>

      {/* ── List Yourself ──────────────────────────────────── */}
      <Card className="border-border/50 bg-card/60 backdrop-blur-sm shrink-0">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <UserPlus className="size-4 text-[oklch(0.75_0.15_85)]" />
            {isListed ? "Your Listing" : "List Yourself"}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {/* Status indicator */}
          {isListed && myListingRole && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
              <span className="size-2 rounded-full bg-[oklch(0.65_0.18_145)]" />
              You are listed as{" "}
              <span className={cn("font-medium", ROLE_CONFIG[myListingRole as Role]?.color)}>
                {myListingRole}
              </span>
              {myListingContent && (
                <>
                  {" "}for{" "}
                  <span className="font-medium text-foreground/80">
                    {myListingContent}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Role selector */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">
              Role
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map((role) => {
                const config = ROLE_CONFIG[role]
                const Icon = config.icon
                const active = selectedRole === role
                return (
                  <Button
                    key={role}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 text-xs gap-1.5 border transition-all",
                      active
                        ? cn(
                            "border-current",
                            config.color,
                            config.bg
                          )
                        : "border-border/40 text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setSelectedRole(role)}
                  >
                    <Icon className="size-3.5" />
                    {role}
                  </Button>
                )
              })}
            </div>
          </div>

          {/* Content type */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">
              Content Type{" "}
              <span className="opacity-60">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-1 mb-1.5">
              {CONTENT_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-6 text-[11px] px-2 border",
                    contentType === preset
                      ? "border-primary/40 text-foreground bg-primary/10"
                      : "border-border/30 text-muted-foreground"
                  )}
                  onClick={() =>
                    setContentType(contentType === preset ? "" : preset)
                  }
                >
                  {preset}
                </Button>
              ))}
            </div>
            <Input
              placeholder="Or type your own..."
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
              className="h-8 text-xs bg-background/50"
            />
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground font-medium">
                Note <span className="opacity-60">(optional)</span>
              </label>
              <span
                className={cn(
                  "text-[10px]",
                  note.length > 230
                    ? "text-[oklch(0.65_0.22_25)]"
                    : "text-muted-foreground/60"
                )}
              >
                {note.length}/255
              </span>
            </div>
            <Textarea
              placeholder="Looking for a healer for Dungeon of Shadows..."
              value={note}
              onChange={(e) =>
                setNote(e.target.value.slice(0, 255))
              }
              className="min-h-[60px] max-h-[100px] text-xs bg-background/50 resize-none"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 flex-1"
              disabled={submitting || !charId}
              onClick={handleList}
            >
              <UserPlus className="size-3.5" />
              {isListed ? "Update Listing" : "List on Board"}
            </Button>
            {isListed && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs gap-1.5 text-[oklch(0.65_0.22_25)] hover:text-[oklch(0.70_0.22_25)]"
                disabled={submitting}
                onClick={handleUnlist}
              >
                <X className="size-3.5" />
                Remove
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
