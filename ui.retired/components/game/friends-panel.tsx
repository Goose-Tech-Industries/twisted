"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useGame, useNotification } from "@/lib/game-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import {
  Users,
  UserPlus,
  UserMinus,
  UserCheck,
  UserX,
  Search,
  Mail,
  Eye,
  ShieldBan,
  ShieldOff,
  Clock,
  Circle,
  ChevronDown,
  ChevronRight,
  Loader2,
  X,
  RefreshCw,
} from "lucide-react"

// ── Types ────────────────────────────────────────────────────────

interface Friend {
  id: number
  charId: number
  name: string
  level: number
  className: string
  presence: string
  status: string
  isOnline: boolean
  requester_id: number
  recipient_id: number
}

interface SearchResult {
  id: number
  name: string
  level: number
  className: string
}

// ── Constants ────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ""

const PRESENCE_DOT: Record<string, string> = {
  online: "fill-[oklch(0.65_0.18_145)]",
  away: "fill-[oklch(0.75_0.15_85)]",
  busy: "fill-[oklch(0.60_0.22_25)]",
  offline: "fill-muted-foreground",
}

const PRESENCE_LABEL: Record<string, string> = {
  online: "Online",
  away: "Away",
  busy: "Busy",
  offline: "Offline",
}

// ── Helpers ──────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

// ── Component ────────────────────────────────────────────────────

export function FriendsPanel() {
  const { state, dispatch } = useGame()
  const { notify } = useNotification()
  const charId = state.character?.charId ?? state.character?.id

  // ── State ────────────────────────────────────────────────────
  const [friends, setFriends] = useState<Friend[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Add friend
  const [searchName, setSearchName] = useState("")
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [searchError, setSearchError] = useState("")
  const [sendingRequest, setSendingRequest] = useState(false)

  // Blocked
  const [blockedExpanded, setBlockedExpanded] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})

  // ── Derived ──────────────────────────────────────────────────

  const accepted = friends
    .filter((f) => f.status === "accepted")
    .sort((a, b) => {
      if (a.isOnline === b.isOnline) return a.name.localeCompare(b.name)
      return a.isOnline ? -1 : 1
    })

  const incoming = friends.filter(
    (f) => f.status === "pending" && f.recipient_id === charId,
  )

  const outgoing = friends.filter(
    (f) => f.status === "pending" && f.requester_id === charId,
  )

  const blocked = friends.filter((f) => f.status === "blocked")

  const onlineCount = accepted.filter((f) => f.isOnline).length
  const pendingCount = incoming.length + outgoing.length

  // ── Fetch ────────────────────────────────────────────────────

  const fetchFriends = useCallback(async () => {
    if (!charId) return
    try {
      const res = await fetch(`${API_BASE}/api/party/friends/${charId}`, {
        credentials: "include",
      })
      const data = await res.json()
      if (data.success) setFriends(data.friends || [])
    } catch (err) {
      console.warn('[friends] fetch failed:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [charId])

  useEffect(() => {
    fetchFriends()
  }, [fetchFriends])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchFriends()
  }

  // ── Actions ──────────────────────────────────────────────────

  const withActionLock = async (key: string, fn: () => Promise<void>) => {
    if (actionLoading[key]) return
    setActionLoading((p) => ({ ...p, [key]: true }))
    try {
      await fn()
    } finally {
      setActionLoading((p) => ({ ...p, [key]: false }))
    }
  }

  const acceptRequest = (friendshipId: number) =>
    withActionLock(`accept-${friendshipId}`, async () => {
      const res = await fetch(`${API_BASE}/api/party/friends/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ charId, friendshipId }),
      })
      const data = await res.json()
      if (data.success) {
        notify("success", data.message || "Friend request accepted!")
        fetchFriends()
      } else {
        notify("error", data.message || "Failed to accept request")
      }
    })

  const removeFriend = (friendshipId: number) =>
    withActionLock(`remove-${friendshipId}`, async () => {
      const res = await fetch(`${API_BASE}/api/party/friends/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ charId, friendshipId }),
      })
      const data = await res.json()
      if (data.success) {
        notify("info", data.message || "Friend removed")
        fetchFriends()
      } else {
        notify("error", data.message || "Failed to remove friend")
      }
    })

  const blockPlayer = (targetCharId: number) =>
    withActionLock(`block-${targetCharId}`, async () => {
      const res = await fetch(`${API_BASE}/api/party/friends/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ charId, targetCharId }),
      })
      const data = await res.json()
      if (data.success) {
        notify("info", data.message || "Player blocked")
        fetchFriends()
      } else {
        notify("error", data.message || "Failed to block player")
      }
    })

  const unblockPlayer = (targetCharId: number) =>
    withActionLock(`unblock-${targetCharId}`, async () => {
      const res = await fetch(`${API_BASE}/api/party/friends/unblock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ charId, targetCharId }),
      })
      const data = await res.json()
      if (data.success) {
        notify("success", data.message || "Player unblocked")
        fetchFriends()
      } else {
        notify("error", data.message || "Failed to unblock player")
      }
    })

  // ── Search + Send Request ────────────────────────────────────

  const handleSearch = async () => {
    if (!searchName.trim() || !charId) return
    setSearching(true)
    setSearchResult(null)
    setSearchError("")
    try {
      const res = await fetch(
        `${API_BASE}/api/party/friends/find-by-name?name=${encodeURIComponent(searchName.trim())}&charId=${charId}`,
        { credentials: "include" },
      )
      const data = await res.json()
      if (data.success && data.character) {
        if (data.character.id === charId) {
          setSearchError("You cannot add yourself as a friend.")
        } else if (
          friends.some(
            (f) =>
              (f.charId === data.character.id || f.requester_id === data.character.id || f.recipient_id === data.character.id) &&
              (f.status === "accepted" || f.status === "pending"),
          )
        ) {
          setSearchError("Already friends or request pending.")
        } else {
          setSearchResult(data.character)
        }
      } else {
        setSearchError("No character found with that name.")
      }
    } catch {
      setSearchError("Search failed. Try again.")
    } finally {
      setSearching(false)
    }
  }

  const sendFriendRequest = async () => {
    if (!searchResult || !charId) return
    setSendingRequest(true)
    try {
      const res = await fetch(`${API_BASE}/api/party/friends/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ charId, targetName: searchResult.name }),
      })
      const data = await res.json()
      if (data.success) {
        notify("success", data.message || "Friend request sent!")
        setSearchResult(null)
        setSearchName("")
        fetchFriends()
      } else {
        notify("error", data.message || "Failed to send request")
      }
    } catch {
      notify("error", "Failed to send request")
    } finally {
      setSendingRequest(false)
    }
  }

  const viewProfile = (targetCharId: number) => {
    dispatch({ type: "SET_VIEW_PROFILE", payload: targetCharId })
    dispatch({ type: "SET_VIEW", payload: "profile" })
  }

  const openMail = () => {
    dispatch({ type: "SET_VIEW", payload: "mail" })
  }

  // ── Render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto w-full">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold tracking-tight">Friends</h2>
          <Badge variant="secondary" className="text-xs">
            {onlineCount} online
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-8 w-8"
        >
          <RefreshCw
            className={cn("h-4 w-4", refreshing && "animate-spin")}
          />
        </Button>
      </div>

      <Separator />

      <ScrollArea className="h-[calc(100vh-10rem)] pr-2">
        <div className="flex flex-col gap-5">
          {/* ═══════════ FRIENDS LIST ═══════════ */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Friends
              {accepted.length > 0 && (
                <Badge variant="outline" className="ml-2 text-xs">
                  {accepted.length}
                </Badge>
              )}
            </h3>

            {accepted.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                  <Users className="mb-2 h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    No friends yet. Search below to add one!
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {accepted.map((f) => {
                  const presence = f.presence || (f.isOnline ? "online" : "offline")
                  const friendCharId = f.charId
                  return (
                    <Card
                      key={f.id}
                      className="transition-colors hover:bg-accent/30"
                    >
                      <CardContent className="flex items-center gap-3 p-3">
                        {/* Avatar + presence */}
                        <div className="relative">
                          <Avatar className="h-10 w-10 border border-border">
                            <AvatarFallback className="bg-primary/10 text-xs font-bold">
                              {initials(f.name)}
                            </AvatarFallback>
                          </Avatar>
                          <svg
                            className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5"
                            viewBox="0 0 12 12"
                          >
                            <circle
                              cx="6"
                              cy="6"
                              r="5"
                              className={PRESENCE_DOT[presence] || PRESENCE_DOT.offline}
                              stroke="hsl(var(--background))"
                              strokeWidth="2"
                            />
                          </svg>
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold leading-tight">
                            {f.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Lv.{f.level} {f.className}
                            <span className="ml-1.5 opacity-60">
                              {PRESENCE_LABEL[presence] || "Offline"}
                            </span>
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="View Profile"
                            onClick={() => viewProfile(friendCharId)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Send Mail"
                            onClick={openMail}
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive/70 hover:text-destructive"
                            title="Remove Friend"
                            disabled={!!actionLoading[`remove-${f.id}`]}
                            onClick={() => removeFriend(f.id)}
                          >
                            {actionLoading[`remove-${f.id}`] ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <UserMinus className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive/70 hover:text-destructive"
                            title="Block"
                            disabled={!!actionLoading[`block-${friendCharId}`]}
                            onClick={() => blockPlayer(friendCharId)}
                          >
                            {actionLoading[`block-${friendCharId}`] ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ShieldBan className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </section>

          <Separator />

          {/* ═══════════ PENDING REQUESTS ═══════════ */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Pending Requests
              {pendingCount > 0 && (
                <Badge variant="default" className="ml-2 text-xs">
                  {pendingCount}
                </Badge>
              )}
            </h3>

            {pendingCount === 0 ? (
              <p className="text-xs text-muted-foreground/70 italic">
                No pending requests.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {/* Incoming */}
                {incoming.map((f) => (
                  <Card key={f.id} className="border-primary/20">
                    <CardContent className="flex items-center gap-3 p-3">
                      <Avatar className="h-9 w-9 border border-border">
                        <AvatarFallback className="bg-primary/10 text-xs font-bold">
                          {initials(f.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {f.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Lv.{f.level} {f.className}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 px-2 text-xs"
                          disabled={!!actionLoading[`accept-${f.id}`]}
                          onClick={() => acceptRequest(f.id)}
                        >
                          {actionLoading[`accept-${f.id}`] ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <UserCheck className="mr-1 h-3 w-3" />
                          )}
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive/70"
                          disabled={!!actionLoading[`remove-${f.id}`]}
                          onClick={() => removeFriend(f.id)}
                        >
                          {actionLoading[`remove-${f.id}`] ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <X className="mr-1 h-3 w-3" />
                          )}
                          Decline
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {/* Outgoing */}
                {outgoing.map((f) => (
                  <Card key={f.id} className="border-dashed opacity-80">
                    <CardContent className="flex items-center gap-3 p-3">
                      <Avatar className="h-9 w-9 border border-border">
                        <AvatarFallback className="bg-muted text-xs font-bold">
                          {initials(f.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {f.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Lv.{f.level} {f.className}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant="outline"
                          className="gap-1 text-xs text-muted-foreground"
                        >
                          <Clock className="h-3 w-3" />
                          Pending...
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive/70"
                          disabled={!!actionLoading[`remove-${f.id}`]}
                          onClick={() => removeFriend(f.id)}
                        >
                          {actionLoading[`remove-${f.id}`] ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Cancel"
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* ═══════════ ADD FRIEND ═══════════ */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              <UserPlus className="mr-1 inline h-3.5 w-3.5" />
              Add Friend
            </h3>

            <div className="flex gap-2">
              <Input
                placeholder="Character name..."
                value={searchName}
                onChange={(e) => {
                  setSearchName(e.target.value)
                  setSearchError("")
                  setSearchResult(null)
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="h-9 text-sm"
              />
              <Button
                size="sm"
                variant="secondary"
                className="h-9 shrink-0 px-3"
                disabled={searching || !searchName.trim()}
                onClick={handleSearch}
              >
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>

            {searchError && (
              <p className="mt-2 text-xs text-destructive">{searchError}</p>
            )}

            {searchResult && (
              <Card className="mt-2 border-primary/30">
                <CardContent className="flex items-center gap-3 p-3">
                  <Avatar className="h-9 w-9 border border-border">
                    <AvatarFallback className="bg-primary/10 text-xs font-bold">
                      {initials(searchResult.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {searchResult.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Lv.{searchResult.level} {searchResult.className}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 shrink-0 gap-1 px-2 text-xs"
                    disabled={sendingRequest}
                    onClick={sendFriendRequest}
                  >
                    {sendingRequest ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <UserPlus className="h-3 w-3" />
                    )}
                    Send Request
                  </Button>
                </CardContent>
              </Card>
            )}
          </section>

          <Separator />

          {/* ═══════════ BLOCKED LIST ═══════════ */}
          <section>
            <button
              type="button"
              className="flex w-full items-center gap-1 text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              onClick={() => setBlockedExpanded((p) => !p)}
            >
              {blockedExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              Blocked
              {blocked.length > 0 && (
                <Badge variant="outline" className="ml-1 text-xs">
                  {blocked.length}
                </Badge>
              )}
            </button>

            {blockedExpanded && (
              <div className="mt-2 flex flex-col gap-2">
                {blocked.length === 0 ? (
                  <p className="text-xs text-muted-foreground/70 italic">
                    No blocked players.
                  </p>
                ) : (
                  blocked.map((f) => {
                    const targetId = f.charId
                    return (
                      <Card key={f.id} className="border-dashed opacity-70">
                        <CardContent className="flex items-center gap-3 p-3">
                          <Avatar className="h-8 w-8 border border-border">
                            <AvatarFallback className="bg-destructive/10 text-xs">
                              {initials(f.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {f.name}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-xs"
                            disabled={!!actionLoading[`unblock-${targetId}`]}
                            onClick={() => unblockPlayer(targetId)}
                          >
                            {actionLoading[`unblock-${targetId}`] ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ShieldOff className="h-3 w-3" />
                            )}
                            Unblock
                          </Button>
                        </CardContent>
                      </Card>
                    )
                  })
                )}
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
