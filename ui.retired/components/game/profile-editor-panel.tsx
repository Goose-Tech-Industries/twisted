"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useGame } from "@/lib/game-context"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  X,
  Save,
  Loader2,
  Palette,
  User,
  Music,
  FileText,
  Users,
  Eye,
  EyeOff,
  Search,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  Check,
  SmilePlus,
  Sparkles,
  MessageSquare,
} from "lucide-react"

// ── Constants ─────────────────────────────────────────────────────

const COLOR_PRESETS = [
  "#bb86fc", "#f44336", "#4caf50", "#2196f3",
  "#ff9800", "#e91e63", "#00bcd4", "#ffeb3b",
  "#9c27b0", "#607d8b", "#f85149", "#3fb950",
]

const EMOJI_GRID = [
  "\u2694\uFE0F", "\u{1F6E1}\uFE0F", "\u{1F480}", "\u{1F525}", "\u{1F5E1}\uFE0F",
  "\u{1F3F0}", "\u{1F409}", "\u{1F30C}", "\u{1F319}", "\u2B50",
  "\u{1F451}", "\u{1F48E}", "\u{1F40D}", "\u{1F43A}", "\u{1F9D9}",
  "\u{1F52E}", "\u{1F3AF}", "\u26A1", "\u{1F4A0}", "\u2620\uFE0F",
]

const MAX_BIO = 500
const MAX_QUOTE = 200
const MAX_FRIENDS = 8

// ── Types ─────────────────────────────────────────────────────────

interface TopFriend {
  slot: number
  friend_char_id: number
  name: string
  level: number
  class_name: string
  profile_color: string
}

interface ProfileEditorPanelProps {
  charId: number
  onClose: () => void
  initialData?: Record<string, unknown>
}

// ── BBCode Preview ────────────────────────────────────────────────

function renderBBCode(raw: string): string {
  let html = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  html = html.replace(/\[b\](.*?)\[\/b\]/gi, "<strong>$1</strong>")
  html = html.replace(/\[i\](.*?)\[\/i\]/gi, "<em>$1</em>")
  html = html.replace(/\[u\](.*?)\[\/u\]/gi, "<u>$1</u>")
  html = html.replace(
    /\[color=(#[0-9a-fA-F]{3,8})\](.*?)\[\/color\]/gi,
    '<span style="color:$1">$2</span>',
  )
  html = html.replace(
    /\[url\](.*?)\[\/url\]/gi,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>',
  )
  html = html.replace(
    /\[url=(.*?)\](.*?)\[\/url\]/gi,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary underline">$2</a>',
  )
  html = html.replace(/\n/g, "<br/>")

  return html
}

// ── Fetch Helper ──────────────────────────────────────────────────

async function api<T = Record<string, unknown>>(
  url: string,
  body?: Record<string, unknown>,
): Promise<T & { success?: boolean; message?: string }> {
  const opts: RequestInit = {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  }
  if (body) {
    opts.method = "POST"
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(url, opts)
  return res.json()
}

// ── Component ─────────────────────────────────────────────────────

export function ProfileEditorPanel({
  charId,
  onClose,
  initialData,
}: ProfileEditorPanelProps) {
  const { notify } = useGame()

  // ── Appearance ──
  const [bannerEmoji, setBannerEmoji] = useState<string>(
    (initialData?.bannerEmoji as string) || "\u2694\uFE0F",
  )
  const [customEmoji, setCustomEmoji] = useState("")
  const [profileColor, setProfileColor] = useState<string>(
    (initialData?.profileColor as string) || "#bb86fc",
  )
  const [colorInput, setColorInput] = useState<string>(
    (initialData?.profileColor as string) || "#bb86fc",
  )

  // ── About You ──
  const [bio, setBio] = useState<string>((initialData?.bio as string) || "")
  const [favoriteQuote, setFavoriteQuote] = useState<string>(
    (initialData?.favoriteQuote as string) || "",
  )

  // ── Now Playing ──
  const [spotifyTrackUrl, setSpotifyTrackUrl] = useState<string>(
    (initialData?.spotifyTrackUrl as string) || "",
  )
  const [spotifyTrackName, setSpotifyTrackName] = useState<string>(
    (initialData?.spotifyTrackName as string) || "",
  )
  const [spotifyArtistName, setSpotifyArtistName] = useState<string>(
    (initialData?.spotifyArtistName as string) || "",
  )

  // ── Signature ──
  const [signature, setSignature] = useState<string>(
    (initialData?.signature as string) || "",
  )

  // ── Top 8 Friends ──
  const [friends, setFriends] = useState<TopFriend[]>([])
  const [friendSearch, setFriendSearch] = useState("")
  const [friendSearchResult, setFriendSearchResult] = useState<{
    charId: number
    name: string
    level: number
  } | null>(null)
  const [searchingFriend, setSearchingFriend] = useState(false)

  // ── Privacy ──
  const [showProfileViewers, setShowProfileViewers] = useState<boolean>(
    (initialData?.showProfileViewers as boolean) ?? true,
  )

  // ── Saving state per section ──
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [background, setBackground] = useState<string>((initialData?.background as string) || '')
  const [musicUrl, setMusicUrl] = useState<string>((initialData?.musicUrl as string) || '')
  const [customStatus, setCustomStatus] = useState<string>((initialData?.status as string) || '')

  // ── Load top friends on mount ──
  useEffect(() => {
    api<{ friends: TopFriend[] }>(`/game/top-friends/${charId}`).then((res) => {
      if (res.success && res.friends) setFriends(res.friends)
    })
  }, [charId])

  // ── Section savers ──

  const saveAppearance = useCallback(async () => {
    setSaving((p) => ({ ...p, appearance: true }))
    try {
      const res = await api("/game/save-profile", {
        charId,
        bio,
        profileColor,
        bannerEmoji,
        favoriteQuote,
        spotifyTrackUrl,
        spotifyTrackName,
        spotifyArtistName,
        showProfileViewers,
      })
      if (res.success) notify("success", "Appearance saved!")
      else notify("error", res.message || "Failed to save appearance")
    } catch {
      notify("error", "Network error")
    }
    setSaving((p) => ({ ...p, appearance: false }))
  }, [charId, bio, profileColor, bannerEmoji, favoriteQuote, spotifyTrackUrl, spotifyTrackName, spotifyArtistName, showProfileViewers, notify])

  const saveAbout = useCallback(async () => {
    setSaving((p) => ({ ...p, about: true }))
    try {
      const res = await api("/game/save-profile", {
        charId,
        bio,
        profileColor,
        bannerEmoji,
        favoriteQuote,
        spotifyTrackUrl,
        spotifyTrackName,
        spotifyArtistName,
        showProfileViewers,
      })
      if (res.success) notify("success", "Bio saved!")
      else notify("error", res.message || "Failed to save bio")
    } catch {
      notify("error", "Network error")
    }
    setSaving((p) => ({ ...p, about: false }))
  }, [charId, bio, profileColor, bannerEmoji, favoriteQuote, spotifyTrackUrl, spotifyTrackName, spotifyArtistName, showProfileViewers, notify])

  const saveNowPlaying = useCallback(async () => {
    setSaving((p) => ({ ...p, nowplaying: true }))
    try {
      const res = await api("/game/save-profile", {
        charId,
        bio,
        profileColor,
        bannerEmoji,
        favoriteQuote,
        spotifyTrackUrl,
        spotifyTrackName,
        spotifyArtistName,
        showProfileViewers,
      })
      if (res.success) notify("success", "Now Playing saved!")
      else notify("error", res.message || "Failed to save track info")
    } catch {
      notify("error", "Network error")
    }
    setSaving((p) => ({ ...p, nowplaying: false }))
  }, [charId, bio, profileColor, bannerEmoji, favoriteQuote, spotifyTrackUrl, spotifyTrackName, spotifyArtistName, showProfileViewers, notify])

  const saveSignature = useCallback(async () => {
    setSaving((p) => ({ ...p, signature: true }))
    try {
      const res = await api("/game/save-signature", { charId, signature })
      if (res.success) notify("success", "Signature saved!")
      else notify("error", res.message || "Failed to save signature")
    } catch {
      notify("error", "Network error")
    }
    setSaving((p) => ({ ...p, signature: false }))
  }, [charId, signature, notify])

  const saveTopFriends = useCallback(async () => {
    setSaving((p) => ({ ...p, friends: true }))
    try {
      const friendIds = friends.map((f) => f.friend_char_id)
      const res = await api("/game/save-top-friends", { charId, friendIds })
      if (res.success) notify("success", "Top friends saved!")
      else notify("error", res.message || "Failed to save friends")
    } catch {
      notify("error", "Network error")
    }
    setSaving((p) => ({ ...p, friends: false }))
  }, [charId, friends, notify])

  const savePrivacy = useCallback(async () => {
    setSaving((p) => ({ ...p, privacy: true }))
    try {
      const res = await api("/game/save-profile", {
        charId,
        bio,
        profileColor,
        bannerEmoji,
        favoriteQuote,
        spotifyTrackUrl,
        spotifyTrackName,
        spotifyArtistName,
        showProfileViewers,
      })
      if (res.success) notify("success", "Privacy settings saved!")
      else notify("error", res.message || "Failed to save privacy")
    } catch {
      notify("error", "Network error")
    }
    setSaving((p) => ({ ...p, privacy: false }))
  }, [charId, bio, profileColor, bannerEmoji, favoriteQuote, spotifyTrackUrl, spotifyTrackName, spotifyArtistName, showProfileViewers, notify])

  // ── Friend search ──

  const searchFriend = useCallback(async () => {
    if (!friendSearch.trim()) return
    setSearchingFriend(true)
    setFriendSearchResult(null)
    try {
      const res = await api<{ charId: number; name: string; level: number }>(
        "/game/get-char-by-name",
        { name: friendSearch.trim() },
      )
      if (res.success && res.charId) {
        setFriendSearchResult({ charId: res.charId, name: res.name!, level: res.level! })
      } else {
        notify("error", "Character not found")
      }
    } catch {
      notify("error", "Search failed")
    }
    setSearchingFriend(false)
  }, [friendSearch, notify])

  const addFriend = useCallback(
    (result: { charId: number; name: string; level: number }) => {
      if (friends.length >= MAX_FRIENDS) {
        notify("error", "Top 8 is full!")
        return
      }
      if (friends.some((f) => f.friend_char_id === result.charId)) {
        notify("error", "Already in your Top 8")
        return
      }
      setFriends((prev) => [
        ...prev,
        {
          slot: prev.length,
          friend_char_id: result.charId,
          name: result.name,
          level: result.level,
          class_name: "",
          profile_color: "#bb86fc",
        },
      ])
      setFriendSearch("")
      setFriendSearchResult(null)
    },
    [friends, notify],
  )

  const removeFriend = useCallback((idx: number) => {
    setFriends((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const moveFriend = useCallback((idx: number, dir: -1 | 1) => {
    setFriends((prev) => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }, [])

  // ── Color input handling ──

  const handleColorInput = useCallback((val: string) => {
    setColorInput(val)
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      setProfileColor(val)
    }
  }, [])

  // ── Save button helper ──

  const SaveBtn = ({
    section,
    onClick,
  }: {
    section: string
    onClick: () => void
  }) => (
    <Button
      onClick={onClick}
      disabled={saving[section]}
      className="celtic-border"
      size="sm"
    >
      {saving[section] ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <Save className="w-4 h-4 mr-2" />
      )}
      Save
    </Button>
  )

  // ── Spotify embed URL ──

  const spotifyEmbedUrl = (() => {
    const match = spotifyTrackUrl.match(/track\/([a-zA-Z0-9]+)/)
    return match ? `https://open.spotify.com/embed/track/${match[1]}?theme=0` : null
  })()

  // ── Render ──────────────────────────────────────────────────────

  return (
    <Card className="celtic-border w-full max-w-2xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg blood-text flex items-center gap-2">
          <User className="w-5 h-5" />
          Edit Profile
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        <Tabs defaultValue="appearance" className="w-full">
          <TabsList className="w-full grid grid-cols-3 sm:grid-cols-6 h-auto gap-0.5 bg-transparent px-4 pb-2">
            <TabsTrigger value="appearance" className="text-xs gap-1">
              <Palette className="w-3.5 h-3.5 hidden sm:block" />
              Look
            </TabsTrigger>
            <TabsTrigger value="about" className="text-xs gap-1">
              <User className="w-3.5 h-3.5 hidden sm:block" />
              About
            </TabsTrigger>
            <TabsTrigger value="nowplaying" className="text-xs gap-1">
              <Music className="w-3.5 h-3.5 hidden sm:block" />
              Music
            </TabsTrigger>
            <TabsTrigger value="signature" className="text-xs gap-1">
              <FileText className="w-3.5 h-3.5 hidden sm:block" />
              Sig
            </TabsTrigger>
            <TabsTrigger value="friends" className="text-xs gap-1">
              <Users className="w-3.5 h-3.5 hidden sm:block" />
              Top 8
            </TabsTrigger>
            <TabsTrigger value="background" className="text-xs gap-1">
              <Sparkles className="w-3.5 h-3.5 hidden sm:block" />
              Theme
            </TabsTrigger>
            <TabsTrigger value="status" className="text-xs gap-1">
              <MessageSquare className="w-3.5 h-3.5 hidden sm:block" />
              Status
            </TabsTrigger>
            <TabsTrigger value="privacy" className="text-xs gap-1">
              <Eye className="w-3.5 h-3.5 hidden sm:block" />
              Privacy
            </TabsTrigger>
          </TabsList>

          {/* ── Appearance ── */}
          <TabsContent value="appearance" className="px-4 pb-4 space-y-4">
            {/* Banner Emoji */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-muted-foreground">
                Banner Emoji
              </Label>
              <div className="grid grid-cols-10 gap-1.5">
                {EMOJI_GRID.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setBannerEmoji(emoji)}
                    className={cn(
                      "w-8 h-8 flex items-center justify-center rounded text-lg hover:bg-primary/20 transition-colors",
                      bannerEmoji === emoji &&
                        "bg-primary/30 ring-1 ring-primary",
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-center mt-2">
                <Input
                  placeholder="Custom emoji..."
                  value={customEmoji}
                  onChange={(e) => setCustomEmoji(e.target.value)}
                  className="w-32 text-center"
                  maxLength={2}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!customEmoji}
                  onClick={() => {
                    setBannerEmoji(customEmoji)
                    setCustomEmoji("")
                  }}
                >
                  <SmilePlus className="w-4 h-4 mr-1" />
                  Use
                </Button>
                <span className="text-2xl ml-2">{bannerEmoji}</span>
              </div>
            </div>

            {/* Profile Color */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-muted-foreground">
                Profile Color
              </Label>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setProfileColor(c)
                      setColorInput(c)
                    }}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 transition-all hover:scale-110",
                      profileColor === c
                        ? "border-white scale-110"
                        : "border-transparent",
                    )}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
              <div className="flex gap-2 items-center mt-2">
                <Input
                  placeholder="#bb86fc"
                  value={colorInput}
                  onChange={(e) => handleColorInput(e.target.value)}
                  className="w-32 font-mono text-sm"
                  maxLength={7}
                />
                <div
                  className="w-8 h-8 rounded border border-border"
                  style={{ backgroundColor: profileColor }}
                />
                <span
                  className="text-sm font-semibold"
                  style={{ color: profileColor }}
                >
                  Preview Name
                </span>
              </div>
            </div>

            <div className="flex justify-end">
              <SaveBtn section="appearance" onClick={saveAppearance} />
            </div>
          </TabsContent>

          {/* ── About You ── */}
          <TabsContent value="about" className="px-4 pb-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-muted-foreground">
                  Bio
                </Label>
                <span
                  className={cn(
                    "text-xs",
                    bio.length > MAX_BIO
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {bio.length}/{MAX_BIO}
                </span>
              </div>
              <Textarea
                placeholder="Tell the world about your character..."
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO))}
                rows={5}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-muted-foreground">
                  Favorite Quote
                </Label>
                <span
                  className={cn(
                    "text-xs",
                    favoriteQuote.length > MAX_QUOTE
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {favoriteQuote.length}/{MAX_QUOTE}
                </span>
              </div>
              <Textarea
                placeholder={'"In darkness, we find strength..."'}
                value={favoriteQuote}
                onChange={(e) =>
                  setFavoriteQuote(e.target.value.slice(0, MAX_QUOTE))
                }
                rows={2}
                className="resize-none italic"
              />
            </div>

            <div className="flex justify-end">
              <SaveBtn section="about" onClick={saveAbout} />
            </div>
          </TabsContent>

          {/* ── Now Playing ── */}
          <TabsContent value="nowplaying" className="px-4 pb-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-muted-foreground">
                Spotify Track URL
              </Label>
              <Input
                placeholder="https://open.spotify.com/track/..."
                value={spotifyTrackUrl}
                onChange={(e) => setSpotifyTrackUrl(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-muted-foreground">
                  Track Name
                </Label>
                <Input
                  placeholder="Song title"
                  value={spotifyTrackName}
                  onChange={(e) => setSpotifyTrackName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-muted-foreground">
                  Artist Name
                </Label>
                <Input
                  placeholder="Artist"
                  value={spotifyArtistName}
                  onChange={(e) => setSpotifyArtistName(e.target.value)}
                />
              </div>
            </div>

            {/* Preview widget */}
            {(spotifyTrackName || spotifyArtistName || spotifyEmbedUrl) && (
              <div className="rounded-lg border border-border bg-card/50 p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-[#1DB954]/20 flex items-center justify-center">
                    <Music className="w-5 h-5 text-[#1DB954]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {spotifyTrackName || "Unknown Track"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {spotifyArtistName || "Unknown Artist"}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[#1DB954] border-[#1DB954]/40 text-[10px]"
                  >
                    Spotify
                  </Badge>
                </div>
                {spotifyEmbedUrl && (
                  <iframe
                    src={spotifyEmbedUrl}
                    width="100%"
                    height="80"
                    allow="encrypted-media"
                    className="rounded"
                    style={{ border: 0 }}
                  />
                )}
              </div>
            )}

            <div className="flex justify-end">
              <SaveBtn section="nowplaying" onClick={saveNowPlaying} />
            </div>
          </TabsContent>

          {/* ── Signature ── */}
          <TabsContent value="signature" className="px-4 pb-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-muted-foreground">
                Signature (BBCode)
              </Label>
              <div className="flex flex-wrap gap-1 mb-1">
                {["[b]...[/b]", "[i]...[/i]", "[u]...[/u]", "[color=#hex]...[/color]", "[url]...[/url]"].map(
                  (tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-[10px] font-mono cursor-default"
                    >
                      {tag}
                    </Badge>
                  ),
                )}
              </div>
              <Textarea
                placeholder="[b]My cool signature[/b] - [color=#bb86fc]Twisted[/color]"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                rows={4}
                className="resize-none font-mono text-sm"
              />
            </div>

            {/* Live preview */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Preview</Label>
              <div
                className="rounded border border-border bg-card/50 p-3 text-sm min-h-[2.5rem] break-words"
                dangerouslySetInnerHTML={{
                  __html: renderBBCode(signature) || '<span class="text-muted-foreground italic">Your signature will appear here...</span>',
                }}
              />
            </div>

            <div className="flex justify-end">
              <SaveBtn section="signature" onClick={saveSignature} />
            </div>
          </TabsContent>

          {/* ── Top 8 Friends ── */}
          <TabsContent value="friends" className="px-4 pb-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-muted-foreground">
                Search by Character Name
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Character name..."
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchFriend()}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={searchFriend}
                  disabled={searchingFriend || !friendSearch.trim()}
                >
                  {searchingFriend ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>

              {friendSearchResult && (
                <div className="flex items-center justify-between rounded border border-border bg-card/50 p-2">
                  <span className="text-sm">
                    <span className="font-medium">{friendSearchResult.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      Lv. {friendSearchResult.level}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addFriend(friendSearchResult)}
                    disabled={friends.length >= MAX_FRIENDS}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add
                  </Button>
                </div>
              )}
            </div>

            {/* Friend list */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Your Top {friends.length}/{MAX_FRIENDS}
              </Label>
              {friends.length === 0 && (
                <p className="text-sm text-muted-foreground italic py-4 text-center">
                  No friends added yet. Search above to add.
                </p>
              )}
              {friends.map((f, idx) => (
                <div
                  key={f.friend_char_id}
                  className="flex items-center gap-2 rounded border border-border bg-card/50 p-2"
                >
                  <span className="text-xs text-muted-foreground w-5 text-center font-mono">
                    {idx + 1}
                  </span>
                  <span
                    className="text-sm font-medium flex-1 truncate"
                    style={{ color: f.profile_color || "#bb86fc" }}
                  >
                    {f.name}
                  </span>
                  {f.class_name && (
                    <Badge variant="outline" className="text-[10px]">
                      {f.class_name}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    Lv. {f.level}
                  </span>
                  <div className="flex gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => moveFriend(idx, -1)}
                      disabled={idx === 0}
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => moveFriend(idx, 1)}
                      disabled={idx === friends.length - 1}
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => removeFriend(idx)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <SaveBtn section="friends" onClick={saveTopFriends} />
            </div>
          </TabsContent>

          {/* ── Privacy ── */}
          {/* ── Background / Theme ── */}
          <TabsContent value="background" className="px-4 pb-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Profile Background</Label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: '', label: 'None', preview: 'bg-background' },
                  { id: 'dark_forest', label: 'Dark Forest', preview: 'bg-gradient-to-b from-[oklch(0.15_0.05_150)] to-background' },
                  { id: 'blood_mist', label: 'Blood Mist', preview: 'bg-gradient-to-b from-[oklch(0.15_0.08_25)] to-background' },
                  { id: 'frost', label: 'Frost', preview: 'bg-gradient-to-b from-[oklch(0.15_0.05_230)] to-background' },
                  { id: 'shadow', label: 'Shadow', preview: 'bg-gradient-to-b from-[oklch(0.10_0.03_280)] to-background' },
                  { id: 'flame', label: 'Flame', preview: 'bg-gradient-to-b from-[oklch(0.18_0.10_50)] to-background' },
                  { id: 'void', label: 'Void', preview: 'bg-gradient-to-b from-[oklch(0.08_0.04_300)] to-background' },
                ].map(bg => (
                  <button key={bg.id} onClick={() => setBackground(bg.id)}
                    className={cn(
                      "rounded-lg border p-2 text-center text-[10px] h-16 flex items-end justify-center transition-all",
                      bg.preview,
                      background === bg.id ? "border-primary ring-1 ring-primary/50" : "border-border hover:border-muted-foreground"
                    )}>
                    {bg.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Profile Music URL</Label>
              <Input
                value={musicUrl}
                onChange={e => setMusicUrl(e.target.value)}
                placeholder="https://example.com/song.mp3"
                className="text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Direct link to an audio file. Plays when someone visits your profile.</p>
            </div>

            <div className="flex justify-end">
              <SaveBtn section="background" onClick={async () => {
                setSaving(s => ({ ...s, background: true }))
                try {
                  const r = await fetch('/game/save-profile', {
                    method: 'POST', credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ charId, background, musicUrl, bio, profileColor, bannerEmoji, favoriteQuote, spotifyTrackUrl, spotifyTrackName, spotifyArtistName, showProfileViewers })
                  })
                  const d = await r.json()
                  if (d.success) notify('success', 'Theme saved!')
                  else notify('error', d.message || 'Failed')
                } catch { notify('error', 'Error saving') }
                setSaving(s => ({ ...s, background: false }))
              }} />
            </div>
          </TabsContent>

          {/* ── Status / Achievements ── */}
          <TabsContent value="status" className="px-4 pb-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Custom Status</Label>
              <Input
                value={customStatus}
                onChange={e => setCustomStatus(e.target.value.slice(0, 128))}
                placeholder="Looking for adventure..."
                className="text-sm"
                maxLength={128}
              />
              <p className="text-[10px] text-muted-foreground">{customStatus.length}/128 — Shown under your name on your profile</p>
            </div>

            <div className="flex justify-end">
              <SaveBtn section="status" onClick={async () => {
                setSaving(s => ({ ...s, status: true }))
                try {
                  const r = await fetch('/game/save-profile', {
                    method: 'POST', credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ charId, status: customStatus, bio, profileColor, bannerEmoji, favoriteQuote, spotifyTrackUrl, spotifyTrackName, spotifyArtistName, showProfileViewers })
                  })
                  const d = await r.json()
                  if (d.success) notify('success', 'Status saved!')
                  else notify('error', d.message || 'Failed')
                } catch { notify('error', 'Error saving') }
                setSaving(s => ({ ...s, status: false }))
              }} />
            </div>
          </TabsContent>

          <TabsContent value="privacy" className="px-4 pb-4 space-y-4">
            <div className="flex items-center justify-between rounded border border-border bg-card/50 p-4">
              <div className="flex items-center gap-3">
                {showProfileViewers ? (
                  <Eye className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <EyeOff className="w-5 h-5 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    Show Profile View Counter
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Display how many times your profile has been viewed
                  </p>
                </div>
              </div>
              <Switch
                checked={showProfileViewers}
                onCheckedChange={setShowProfileViewers}
              />
            </div>

            <div className="flex justify-end">
              <SaveBtn section="privacy" onClick={savePrivacy} />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
