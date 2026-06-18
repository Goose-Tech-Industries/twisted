"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { useGame } from '@/lib/game-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Eye,
  Music,
  ExternalLink,
  Send,
  Pencil,
  Sword,
  Shield,
  Quote,
  Users,
  BookOpen,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────

interface EquipmentItem {
  slot: string
  name: string
  icon: string
  type: string
  rarity: string
}

interface TopFriend {
  slot: number
  friend_char_id: number
  name: string
  level: number
  equipped_title: string
  profile_color: string
  presence_status: string
  class_name: string
}

interface GuestbookEntry {
  id: number
  author_char_id: number
  author_name: string
  author_title: string
  author_color: string
  message: string
  message_html?: string
  created_at: string
}

interface ProfileData {
  charId: number
  name: string
  level: number
  title: string | null
  bio: string | null
  color: string
  bannerEmoji: string
  quote: string | null
  signature: string | null
  views: number | null
  presence: string
  musicUrl: string | null
  background: string | null
  status: string | null
  pinnedAchievements: number[]
  spotify: { url: string; track: string; artist: string } | null
  className: string
  classIcon: string
  raceName: string
  guildName: string | null
  guildRank: string | null
  equipment: EquipmentItem[]
  topFriends: TopFriend[]
  guestbook: GuestbookEntry[]
  isOwnProfile: boolean
}

interface ProfilePanelProps {
  charId: number
  onClose: () => void
  onViewProfile?: (charId: number) => void
}

// ── Helpers ────────────────────────────────────────────────────────

const PRESENCE_COLORS: Record<string, string> = {
  online: 'bg-emerald-500',
  away: 'bg-amber-400',
  busy: 'bg-red-500',
  lfp: 'bg-violet-500',
  offline: 'bg-zinc-500',
}

const PRESENCE_LABELS: Record<string, string> = {
  online: 'Online',
  away: 'Away',
  busy: 'Busy',
  lfp: 'Looking for Party',
  offline: 'Offline',
}

const RARITY_COLORS: Record<string, string> = {
  common: 'border-zinc-500 text-zinc-300',
  uncommon: 'border-green-500 text-green-400',
  rare: 'border-blue-500 text-blue-400',
  epic: 'border-purple-500 text-purple-400',
  legendary: 'border-amber-500 text-amber-400',
  mythic: 'border-rose-500 text-rose-400',
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

// ── Component ──────────────────────────────────────────────────────

export function ProfilePanel({ charId, onClose, onViewProfile }: ProfilePanelProps) {
  const { socket } = useGame()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [guestbookMsg, setGuestbookMsg] = useState('')
  const [posting, setPosting] = useState(false)
  const guestbookEndRef = useRef<HTMLDivElement>(null)

  // Fetch profile
  useEffect(() => {
    if (!socket) return

    setLoading(true)
    setProfile(null)

    const handleProfileData = (data: { success: boolean; profile: ProfileData }) => {
      if (data.success) {
        setProfile(data.profile)
      }
      setLoading(false)
    }

    socket.on('profile_data', handleProfileData)
    socket.emit('view_profile', { targetCharId: charId })

    return () => {
      socket.off('profile_data', handleProfileData)
    }
  }, [socket, charId])

  // Guestbook post handler
  const handleGuestbookPost = useCallback(() => {
    if (!socket || !guestbookMsg.trim() || posting) return
    setPosting(true)
    socket.emit('guestbook_post', { targetCharId: charId, message: guestbookMsg.trim() })

    const handleResult = (data: { success: boolean; entry?: GuestbookEntry; error?: string }) => {
      if (data.success && data.entry && profile) {
        setProfile(prev =>
          prev ? { ...prev, guestbook: [...prev.guestbook, data.entry!] } : prev
        )
        setGuestbookMsg('')
        setTimeout(() => guestbookEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      }
      setPosting(false)
      socket.off('guestbook_result', handleResult)
    }

    socket.on('guestbook_result', handleResult)
  }, [socket, charId, guestbookMsg, posting, profile])

  // ── Loading Skeleton ─────────────────────────────────────────────
  if (loading || !profile) {
    return (
      <div className="flex flex-col h-full animate-in fade-in duration-300">
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <Skeleton className="h-6 w-48" />
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-4 space-y-4">
          <Skeleton className="h-32 w-full rounded-lg" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-48 w-full rounded-lg" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-36 w-full rounded-lg" />
              <Skeleton className="h-48 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const accentColor = profile.color || '#a78bfa'

  // Profile background presets
  const BG_STYLES: Record<string, string> = {
    'celtic_knot': 'bg-[url("/assets/bg/celtic-knot.png")]',
    'dark_forest': 'bg-gradient-to-b from-[oklch(0.15_0.05_150)] via-background to-background',
    'blood_mist': 'bg-gradient-to-b from-[oklch(0.15_0.08_25)] via-background to-background',
    'frost': 'bg-gradient-to-b from-[oklch(0.15_0.05_230)] via-background to-background',
    'shadow': 'bg-gradient-to-b from-[oklch(0.10_0.03_280)] via-background to-background',
    'flame': 'bg-gradient-to-b from-[oklch(0.18_0.10_50)] via-background to-background',
    'void': 'bg-gradient-to-b from-[oklch(0.08_0.04_300)] via-background to-background',
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className={cn(
      "flex flex-col h-full animate-in fade-in duration-300",
      profile.background && BG_STYLES[profile.background] ? BG_STYLES[profile.background] : ''
    )}>
      {/* ── Profile Music (autoplay on visit) ───────────────────── */}
      {profile.musicUrl && (
        <audio src={profile.musicUrl} autoPlay loop className="hidden"
          onError={(e) => (e.target as HTMLAudioElement).remove()} />
      )}

      {/* ── Banner Header ─────────────────────────────────────────── */}
      <div
        className="relative px-4 pt-5 pb-4 border-b border-border/50"
        style={{
          background: `linear-gradient(135deg, ${accentColor}18 0%, ${accentColor}08 40%, transparent 70%)`,
          borderTop: `2px solid ${accentColor}66`,
          boxShadow: `inset 0 -1px 0 ${accentColor}15`,
        }}
      >
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 z-10"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>

        {/* View counter (hidden if owner disabled it) */}
        {profile.views !== null && (
          <div className="absolute top-3 right-12 flex items-center gap-1 text-xs text-muted-foreground">
            <Eye className="h-3 w-3" />
            <span>{profile.views.toLocaleString()} views</span>
          </div>
        )}

        <div className="flex items-center gap-4">
          {/* Banner emoji */}
          <div className="text-[64px] leading-none select-none shrink-0">
            {profile.bannerEmoji}
          </div>

          <div className="min-w-0 flex-1">
            {/* Name + presence */}
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                className="text-xl font-bold truncate"
                style={{ color: accentColor }}
              >
                {profile.name}
              </h2>
              <div className="flex items-center gap-1.5">
                <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', PRESENCE_COLORS[profile.presence] || PRESENCE_COLORS.offline)} />
                <span className="text-xs text-muted-foreground">{PRESENCE_LABELS[profile.presence] || 'Offline'}</span>
              </div>
            </div>

            {/* Title badge */}
            {profile.title && (
              <Badge variant="outline" className="mt-1 text-xs" style={{ borderColor: `${accentColor}88`, color: accentColor }}>
                {profile.title}
              </Badge>
            )}

            {/* Custom status */}
            {profile.status && (
              <p className="mt-1 text-xs italic text-muted-foreground">&ldquo;{profile.status}&rdquo;</p>
            )}

            {/* Class / Race / Level */}
            <div className="flex items-center gap-2 mt-1.5 text-sm text-muted-foreground flex-wrap">
              <span>{profile.classIcon} {profile.className}</span>
              <span className="text-border">|</span>
              <span>{profile.raceName}</span>
              <span className="text-border">|</span>
              <span className="font-medium" style={{ color: accentColor }}>Lv. {profile.level}</span>
            </div>

            {/* Guild */}
            {profile.guildName && (
              <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" />
                <span>&lt;{profile.guildName}&gt;</span>
                {profile.guildRank && <span className="text-border">- {profile.guildRank}</span>}
              </div>
            )}

            {/* Edit button */}
            {profile.isOwnProfile && (
              <Button variant="outline" size="sm" className="mt-2 h-7 text-xs gap-1.5">
                <Pencil className="h-3 w-3" />
                Edit Profile
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <ScrollArea className="flex-1">
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* ── Left Column ─────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Bio */}
            {profile.bio && (
              <Card className="celtic-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4" style={{ color: accentColor }} />
                    About Me
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {profile.bio}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Favorite Quote */}
            {profile.quote && (
              <Card className="celtic-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Quote className="h-4 w-4" style={{ color: accentColor }} />
                    Favorite Quote
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <blockquote
                    className="relative pl-4 italic text-sm text-muted-foreground leading-relaxed"
                    style={{ borderLeft: `3px solid ${accentColor}66` }}
                  >
                    <span className="absolute -left-1 -top-2 text-2xl opacity-30" style={{ color: accentColor }}>&ldquo;</span>
                    {profile.quote}
                    <span className="text-2xl opacity-30" style={{ color: accentColor }}>&rdquo;</span>
                  </blockquote>
                </CardContent>
              </Card>
            )}

            {/* Now Playing */}
            {profile.spotify && (
              <Card className="celtic-border overflow-hidden">
                <div
                  className="px-4 py-3 flex items-center gap-3"
                  style={{ background: `linear-gradient(90deg, ${accentColor}15, transparent)` }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 animate-pulse"
                    style={{ background: `${accentColor}22`, color: accentColor }}
                  >
                    <Music className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Now Playing</p>
                    <p className="text-sm font-medium truncate">{profile.spotify.track}</p>
                    <p className="text-xs text-muted-foreground truncate">{profile.spotify.artist}</p>
                  </div>
                  <a
                    href={profile.spotify.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </Card>
            )}

            {/* Top 8 Friends */}
            <Card className="celtic-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Users className="h-4 w-4" style={{ color: accentColor }} />
                  Top 8 Friends
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {Array.from({ length: 8 }).map((_, i) => {
                    const friend = profile.topFriends.find(f => f.slot === i + 1)
                    if (!friend) {
                      return (
                        <div
                          key={`empty-${i}`}
                          className="flex flex-col items-center justify-center p-3 rounded-lg border-2 border-dashed border-border/40 min-h-[100px] opacity-40"
                        >
                          <Users className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )
                    }
                    const friendColor = friend.profile_color || '#a78bfa'
                    return (
                      <button
                        key={friend.friend_char_id}
                        onClick={() => onViewProfile?.(friend.friend_char_id)}
                        className="flex flex-col items-center p-3 rounded-lg border border-border/50 bg-card/50 hover:bg-card/80 transition-colors text-center group cursor-pointer"
                      >
                        <div className="relative mb-1.5">
                          <Avatar className="h-10 w-10" style={{ border: `2px solid ${friendColor}` }}>
                            <AvatarFallback style={{ color: friendColor, fontSize: '0.75rem' }}>
                              {friend.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className={cn(
                            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background',
                            PRESENCE_COLORS[friend.presence_status] || PRESENCE_COLORS.offline,
                          )} />
                        </div>
                        <span
                          className="text-xs font-medium truncate w-full group-hover:underline"
                          style={{ color: friendColor }}
                        >
                          {friend.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Lv.{friend.level} {friend.class_name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Right Column ────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Pinned Achievements */}
            {profile.pinnedAchievements && profile.pinnedAchievements.length > 0 && (
              <Card className="celtic-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Trophy className="h-4 w-4" style={{ color: accentColor }} />
                    Achievements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {profile.pinnedAchievements.map((achId) => (
                      <Badge key={achId} variant="outline" className="text-xs" style={{ borderColor: `${accentColor}60`, color: accentColor }}>
                        Achievement #{achId}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Equipment Showcase */}
            <Card className="celtic-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Sword className="h-4 w-4" style={{ color: accentColor }} />
                  Equipment
                </CardTitle>
              </CardHeader>
              <CardContent>
                {profile.equipment.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No equipment to display</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {profile.equipment.map((item) => {
                      const rarityClass = RARITY_COLORS[item.rarity] || RARITY_COLORS.common
                      return (
                        <div
                          key={item.slot}
                          className={cn(
                            'flex items-center gap-2 p-2 rounded-lg border bg-card/50',
                            rarityClass,
                          )}
                        >
                          <span className="text-lg shrink-0">{item.icon}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{item.name}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{item.slot}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Guestbook */}
            <Card className="celtic-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4" style={{ color: accentColor }} />
                  Guestbook
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {profile.guestbook.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No guestbook entries yet. Be the first to sign!
                  </p>
                ) : (
                  <ScrollArea className="max-h-[300px]">
                    <div className="space-y-3 pr-2">
                      {profile.guestbook.map((entry) => (
                        <div key={entry.id} className="space-y-1">
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <button
                              className="text-sm font-semibold hover:underline cursor-pointer"
                              style={{ color: entry.author_color || '#a78bfa' }}
                              onClick={() => onViewProfile?.(entry.author_char_id)}
                            >
                              {entry.author_name}
                            </button>
                            {entry.author_title && (
                              <span className="text-[10px] text-muted-foreground">[{entry.author_title}]</span>
                            )}
                            <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                              {timeAgo(entry.created_at)}
                            </span>
                          </div>
                          {entry.message_html ? (
                            <div className="text-sm text-muted-foreground leading-relaxed pl-1"
                              dangerouslySetInnerHTML={{ __html: entry.message_html }} />
                          ) : (
                            <p className="text-sm text-muted-foreground leading-relaxed pl-1">
                              {entry.message}
                            </p>
                          )}
                          <Separator className="opacity-30" />
                        </div>
                      ))}
                      <div ref={guestbookEndRef} />
                    </div>
                  </ScrollArea>
                )}

                {/* Guestbook input */}
                <div className="flex gap-2 pt-1">
                  <Input
                    value={guestbookMsg}
                    onChange={(e) => setGuestbookMsg(e.target.value)}
                    placeholder="Sign the guestbook..."
                    className="text-sm h-8"
                    maxLength={500}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleGuestbookPost()
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-8 px-3 shrink-0"
                    onClick={handleGuestbookPost}
                    disabled={!guestbookMsg.trim() || posting}
                    style={{ background: accentColor }}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Signature ─────────────────────────────────────────── */}
        {profile.signature && (
          <div className="px-4 pb-4">
            <Card className="bg-card/30 border-border/30">
              <CardContent className="py-3 px-4">
                <p className="text-xs text-muted-foreground/70 text-center italic whitespace-pre-wrap">
                  {profile.signature}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
