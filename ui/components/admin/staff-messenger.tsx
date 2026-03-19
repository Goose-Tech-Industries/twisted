"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { io, Socket } from "socket.io-client"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  MessageSquare, X, Minus, Send, Circle, ChevronDown,
  PanelRightOpen, PanelRightClose, Zap, Hash, Plus,
  ArrowLeft, Smile, EyeOff, Palette, Dices
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"

// ── Types ─────────────────────────────────────────────────────────
interface StaffMember {
  socketId: string; userId: number; username: string
  role: string; status: "online" | "away" | "busy" | "invisible"
  awayMessage: string; joinedAt: number; chatColor?: string | null
}
interface ChatMessage {
  sender_id: number; sender_name: string; sender_role: string
  sender_color?: string | null; channel: string; body: string; created_at: string
}
interface Conversation {
  channel: string; label: string; type: "group" | "dm"
  targetUserId?: number; unread: number
}

// ── Role colors — fixed per role, ADMIN/OWNER can override ───────
const DEFAULT_ROLE_COLORS: Record<string, string> = {
  OWNER: "#facc15",   // yellow
  ADMIN: "#f87171",   // red
  GM:    "#c084fc",   // purple
  MOD:   "#4ade80",   // green
  STAFF: "#2dd4bf",   // teal
  PLAYER:"#e2e8f0",   // white/light
}

function getNameColor(member: { role: string; chatColor?: string | null }): string {
  // ADMIN and OWNER can have custom colors
  if (member.chatColor && ["ADMIN", "OWNER"].includes(member.role)) return member.chatColor
  return DEFAULT_ROLE_COLORS[member.role] || DEFAULT_ROLE_COLORS.PLAYER
}

function getMsgNameColor(msg: ChatMessage): string {
  if (msg.sender_color && ["ADMIN", "OWNER"].includes(msg.sender_role)) return msg.sender_color
  return DEFAULT_ROLE_COLORS[msg.sender_role] || DEFAULT_ROLE_COLORS.PLAYER
}

const STATUS_META: Record<string, { color: string; fill: string; label: string }> = {
  online:    { color: "text-green-500",  fill: "fill-green-500",  label: "Online" },
  away:      { color: "text-yellow-500", fill: "fill-yellow-500", label: "Away" },
  busy:      { color: "text-red-500",    fill: "fill-red-500",    label: "Busy" },
  invisible: { color: "text-gray-500",   fill: "fill-gray-500",   label: "Invisible" },
}

const EMOJI_GRID = [
  "😀","😂","😍","🤔","😎","🙄","😢","😡","🥳","🤣",
  "👍","👎","❤️","🔥","⚔️","🛡️","💀","✨","🎮","🏆",
  "👋","🙏","💪","🎯","🐉","🧙","⚡","💰","🗡️","🎲",
]

const COLOR_PRESETS = [
  "#f87171","#fb923c","#facc15","#4ade80","#2dd4bf",
  "#60a5fa","#a78bfa","#f472b6","#e2e8f0","#ff6b6b",
  "#ffd93d","#6bcb77","#4d96ff","#ff6fff","#00d2ff",
]

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60_000) return "now"
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`
  return `${Math.floor(diff / 3600_000)}h`
}

function fullTime(ts: string): string {
  try { return new Date(ts).toLocaleString() } catch { return ts }
}

function dmChannel(a: number, b: number) { return `dm:${Math.min(a, b)}:${Math.max(a, b)}` }

// ── Text formatting: *bold* _italic_ ~strike~ ─────────────────────
function formatText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const regex = /(\*[^*]+\*)|(_[^_]+_)|(~[^~]+~)/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const m = match[0]
    const inner = m.slice(1, -1)
    if (m.startsWith("*")) parts.push(<strong key={match.index}>{inner}</strong>)
    else if (m.startsWith("_")) parts.push(<em key={match.index}>{inner}</em>)
    else if (m.startsWith("~")) parts.push(<s key={match.index} className="opacity-60">{inner}</s>)
    last = match.index + m.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? parts : text
}

function playSound(type: "signOn" | "signOff" | "msg" | "nudge") {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    gain.gain.value = 0.06
    if (type === "signOn") { osc.frequency.value = 800; osc.type = "sine" }
    else if (type === "signOff") { osc.frequency.value = 400; osc.type = "sine"; gain.gain.value = 0.04 }
    else if (type === "msg") { osc.frequency.value = 600; osc.type = "triangle"; gain.gain.value = 0.03 }
    else { osc.frequency.value = 1000; osc.type = "square"; gain.gain.value = 0.07 }
    osc.start(); osc.stop(ctx.currentTime + (type === "nudge" ? 0.15 : 0.1))
    if (type === "signOn") {
      const o2 = ctx.createOscillator(); o2.connect(gain); o2.frequency.value = 1200; o2.type = "sine"
      o2.start(ctx.currentTime + 0.12); o2.stop(ctx.currentTime + 0.22)
    }
  } catch {}
}

// ── Component ─────────────────────────────────────────────────────
export function StaffMessenger() {
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [docked, setDocked] = useState(false)
  const [activeChannel, setActiveChannel] = useState<string | null>(null)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([
    { channel: "general", label: "General", type: "group", unread: 0 }
  ])
  const [messagesByChannel, setMessagesByChannel] = useState<Record<string, ChatMessage[]>>({})
  const [input, setInput] = useState("")
  const [totalUnread, setTotalUnread] = useState(0)
  const [myStatus, setMyStatus] = useState<"online" | "away" | "busy" | "invisible">("online")
  const [awayMsg, setAwayMsg] = useState("")
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [customAway, setCustomAway] = useState("")
  const [typingUsers, setTypingUsers] = useState<Record<string, { username: string; timeout: ReturnType<typeof setTimeout> }>>({})
  const [nudgeShake, setNudgeShake] = useState(false)
  const [showNewRoom, setShowNewRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState("")
  const [showEmoji, setShowEmoji] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [myRole, setMyRole] = useState("")

  const socketRef = useRef<Socket | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const myUserIdRef = useRef<number>(0)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeChannelRef = useRef(activeChannel)
  const openRef = useRef(open)
  const awayInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { activeChannelRef.current = activeChannel }, [activeChannel])
  useEffect(() => { openRef.current = open }, [open])

  // ── Socket ──────────────────────────────────────────────────────
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || undefined
    const sock = io(socketUrl, { withCredentials: true, transports: ["websocket", "polling"] })
    socketRef.current = sock

    sock.on("connect", () => {
      sock.emit("staff_panel_join")
      sock.emit("staff_chat_history", { channel: "general" })
    })

    sock.on("staff_panel_presence", (list: StaffMember[]) => {
      setStaff(list)
      const me = list.find(s => s.socketId === sock.id)
      if (me) { myUserIdRef.current = me.userId; setMyRole(me.role) }
    })

    sock.on("staff_chat_msg", (msg: ChatMessage) => {
      setMessagesByChannel(prev => ({
        ...prev, [msg.channel]: [...(prev[msg.channel] || []), msg]
      }))
      if (msg.channel.startsWith("dm:") && msg.sender_id !== myUserIdRef.current) {
        setConversations(prev => {
          if (prev.find(c => c.channel === msg.channel)) return prev
          return [...prev, { channel: msg.channel, label: msg.sender_name, type: "dm", targetUserId: msg.sender_id, unread: 0 }]
        })
      }
      const isActive = msg.channel === activeChannelRef.current && openRef.current
      if (!isActive) {
        setConversations(prev => prev.map(c => c.channel === msg.channel ? { ...c, unread: c.unread + 1 } : c))
        setTotalUnread(prev => prev + 1)
      }
      if (msg.sender_id !== myUserIdRef.current) playSound("msg")
    })

    sock.on("staff_chat_history", (data: { channel: string; messages: ChatMessage[] } | ChatMessage[]) => {
      if (Array.isArray(data)) setMessagesByChannel(prev => ({ ...prev, general: data }))
      else if (data?.channel) setMessagesByChannel(prev => ({ ...prev, [data.channel]: data.messages || [] }))
    })

    sock.on("staff_sign_on", (d: { username: string; role: string }) => {
      playSound("signOn"); toast({ title: `${d.username} has signed on`, description: d.role })
    })
    sock.on("staff_sign_off", (d: { username: string }) => {
      playSound("signOff"); toast({ title: `${d.username} has signed off` })
    })
    sock.on("staff_typing", (d: { userId: number; username: string; channel: string }) => {
      const key = `${d.channel}:${d.userId}`
      setTypingUsers(prev => {
        if (prev[key]) clearTimeout(prev[key].timeout)
        const timeout = setTimeout(() => setTypingUsers(p => { const n = { ...p }; delete n[key]; return n }), 3000)
        return { ...prev, [key]: { username: d.username, timeout } }
      })
    })
    sock.on("staff_nudge", (d: { from: string }) => {
      playSound("nudge"); setNudgeShake(true)
      setTimeout(() => setNudgeShake(false), 600)
      toast({ title: `${d.from} sent you a nudge!` })
    })

    return () => { sock.disconnect() }
  }, [])

  useEffect(() => {
    if (open && !minimized && activeChannel) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messagesByChannel, activeChannel, open, minimized])

  useEffect(() => {
    if (activeChannel && open) setConversations(prev => prev.map(c => c.channel === activeChannel ? { ...c, unread: 0 } : c))
  }, [activeChannel, open])

  useEffect(() => { if (showStatusMenu) setTimeout(() => awayInputRef.current?.focus(), 50) }, [showStatusMenu])

  // ── Actions ─────────────────────────────────────────────────────
  const sendMessage = useCallback(() => {
    let body = input.trim()
    if (!body || !socketRef.current || !activeChannel) return
    // Dice roller: /roll or /roll 2d6
    if (body.startsWith("/roll")) {
      const match = body.match(/\/roll\s*(\d*)d?(\d*)/i)
      const count = Math.min(parseInt(match?.[1] || "1") || 1, 20)
      const sides = Math.min(parseInt(match?.[2] || "20") || 20, 100)
      const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1)
      const total = rolls.reduce((a, b) => a + b, 0)
      body = `🎲 rolled ${count}d${sides}: [${rolls.join(", ")}]${count > 1 ? ` = ${total}` : ""}`
    }
    socketRef.current.emit("staff_chat_send", { body, channel: activeChannel })
    setInput(""); setShowEmoji(false)
  }, [input, activeChannel])

  const handleInputChange = useCallback((val: string) => {
    setInput(val)
    if (val && socketRef.current && activeChannel) {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      socketRef.current.emit("staff_typing", { channel: activeChannel })
      typingTimerRef.current = setTimeout(() => { typingTimerRef.current = null }, 2000)
    }
  }, [activeChannel])

  const updateStatus = useCallback((status: "online" | "away" | "busy" | "invisible", msg = "") => {
    setMyStatus(status); setAwayMsg(msg)
    socketRef.current?.emit("staff_panel_status", { status, awayMessage: msg })
    setShowStatusMenu(false); setCustomAway("")
  }, [])

  const setColor = useCallback((color: string | null) => {
    socketRef.current?.emit("staff_set_color", { color })
    setShowColorPicker(false)
  }, [])

  const openDM = useCallback((member: StaffMember) => {
    if (member.userId === myUserIdRef.current) return
    const channel = dmChannel(myUserIdRef.current, member.userId)
    setConversations(prev => {
      if (prev.find(c => c.channel === channel)) return prev
      return [...prev, { channel, label: member.username, type: "dm", targetUserId: member.userId, unread: 0 }]
    })
    setActiveChannel(channel)
    socketRef.current?.emit("staff_chat_history", { channel })
  }, [])

  const openChannel = useCallback((ch: string) => {
    setActiveChannel(ch)
    setConversations(prev => prev.map(c => c.channel === ch ? { ...c, unread: 0 } : c))
    if (!messagesByChannel[ch]) socketRef.current?.emit("staff_chat_history", { channel: ch })
  }, [messagesByChannel])

  const sendNudge = useCallback((userId: number) => { socketRef.current?.emit("staff_nudge", { targetUserId: userId }) }, [])

  const createRoom = useCallback(() => {
    const name = newRoomName.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "")
    if (!name) return
    setConversations(prev => {
      if (prev.find(c => c.channel === name)) return prev
      return [...prev, { channel: name, label: `#${name}`, type: "group", unread: 0 }]
    })
    setNewRoomName(""); setShowNewRoom(false); openChannel(name)
  }, [newRoomName, openChannel])

  const activeMessages = activeChannel ? (messagesByChannel[activeChannel] || []) : []
  const activeConv = conversations.find(c => c.channel === activeChannel)
  const channelTyping = activeChannel
    ? Object.entries(typingUsers).filter(([k]) => k.startsWith(activeChannel + ":")).map(([, v]) => v.username)
    : []
  const canPickColor = ["ADMIN", "OWNER"].includes(myRole)

  // ── Floating button ─────────────────────────────────────────────
  if (!open) {
    return (
      <button onClick={() => { setOpen(true); setTotalUnread(0) }}
        className={cn("fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform flex items-center justify-center",
          nudgeShake && "animate-bounce")}>
        <MessageSquare className="w-5 h-5" />
        {totalUnread > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-[10px] font-bold flex items-center justify-center text-white">{totalUnread > 9 ? "9+" : totalUnread}</span>}
        {staff.length > 0 && <span className="absolute -bottom-0.5 -left-0.5 w-4 h-4 rounded-full bg-green-500 text-[8px] font-bold flex items-center justify-center text-white border-2 border-background">{staff.length}</span>}
      </button>
    )
  }

  // ── Minimized ───────────────────────────────────────────────────
  if (minimized) {
    return (
      <div className={cn("fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-card border border-border rounded-lg shadow-lg px-3 py-2 cursor-pointer", nudgeShake && "animate-bounce")}
        onClick={() => { setMinimized(false); setTotalUnread(0) }}>
        <MessageSquare className="w-4 h-4 text-primary" />
        <span className="text-xs font-medium">Staff Chat</span>
        <span className="text-[10px] text-muted-foreground">{staff.length} online</span>
        {totalUnread > 0 && <span className="w-4 h-4 rounded-full bg-destructive text-[9px] font-bold flex items-center justify-center text-white">{totalUnread}</span>}
        <button onClick={e => { e.stopPropagation(); setOpen(false) }} className="text-muted-foreground hover:text-foreground ml-1"><X className="w-3 h-3" /></button>
      </div>
    )
  }

  // ── Panel ───────────────────────────────────────────────────────
  const panelClass = docked
    ? "fixed top-0 right-0 z-40 w-72 h-screen border-l border-border bg-card flex flex-col shadow-xl"
    : cn("fixed bottom-4 right-4 z-50 w-80 shadow-2xl border border-primary/20 bg-card rounded-lg flex flex-col", nudgeShake && "animate-pulse")
  const panelStyle = docked ? {} : { height: "70vh", maxHeight: "70vh" }

  return (
    <div className={panelClass} style={panelStyle}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">Staff Chat</span>
          <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{staff.length}</span>
        </div>
        <div className="flex items-center gap-0.5">
          {canPickColor && (
            <button onClick={() => setShowColorPicker(!showColorPicker)} className="text-muted-foreground hover:text-foreground p-1" title="Name color">
              <Palette className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => setDocked(!docked)} className="text-muted-foreground hover:text-foreground p-1" title={docked ? "Float" : "Dock"}>
            {docked ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setMinimized(true)} className="text-muted-foreground hover:text-foreground p-1"><Minus className="w-3.5 h-3.5" /></button>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground p-1"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Color picker dropdown */}
      {showColorPicker && canPickColor && (
        <div className="border-b border-border px-3 py-2 bg-secondary/20 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <p className="text-[10px] text-muted-foreground mb-1.5">Pick your name color:</p>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_PRESETS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full border-2 border-transparent hover:border-white transition-colors"
                style={{ backgroundColor: c }} />
            ))}
            <button onClick={() => setColor(null)}
              className="w-6 h-6 rounded-full border-2 border-border hover:border-white transition-colors bg-secondary flex items-center justify-center"
              title="Reset to default">
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center px-3 py-1 border-b border-border bg-secondary/20 relative flex-shrink-0">
        <button onClick={() => setShowStatusMenu(!showStatusMenu)}
          className="flex items-center gap-1.5 text-xs hover:bg-secondary rounded px-1.5 py-0.5 transition-colors">
          <Circle className={cn("w-2.5 h-2.5", STATUS_META[myStatus]?.fill, STATUS_META[myStatus]?.color)} />
          <span>{STATUS_META[myStatus]?.label}</span>
          {awayMsg && <span className="text-muted-foreground truncate max-w-[80px] text-[10px]">— {awayMsg}</span>}
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
        {showStatusMenu && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-card border border-border rounded-lg shadow-lg z-20 p-2 space-y-1"
            onClick={e => e.stopPropagation()}>
            <button onClick={() => updateStatus("online")} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary text-xs text-left">
              <Circle className="w-2.5 h-2.5 fill-green-500 text-green-500" /> Online
            </button>
            <button onClick={() => updateStatus("busy")} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary text-xs text-left">
              <Circle className="w-2.5 h-2.5 fill-red-500 text-red-500" /> Busy
            </button>
            <button onClick={() => updateStatus("invisible")} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary text-xs text-left">
              <EyeOff className="w-3.5 h-3.5 text-gray-500" /> Invisible
              <span className="text-[9px] text-muted-foreground ml-auto">appear offline</span>
            </button>
            <div className="border-t border-border pt-1.5 mt-1" onClick={e => e.stopPropagation()}>
              <p className="text-[10px] text-muted-foreground px-2 mb-1">Set away with message:</p>
              <div className="flex gap-1">
                <Input ref={awayInputRef} value={customAway}
                  onChange={e => { e.stopPropagation(); setCustomAway(e.target.value) }}
                  onClick={e => e.stopPropagation()} onFocus={e => e.stopPropagation()}
                  placeholder="BRB, lunch, meeting..." className="h-7 text-xs flex-1"
                  onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter" && customAway.trim()) updateStatus("away", customAway.trim()) }} />
                <Button size="sm" className="h-7 px-2 text-xs"
                  onClick={e => { e.stopPropagation(); if (customAway.trim()) updateStatus("away", customAway.trim()) }}>Set</Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5 px-1">
                {["BRB", "Lunch", "AFK", "In a meeting", "Coding...", "Testing", "Do not disturb"].map(p => (
                  <button key={p} onClick={e => { e.stopPropagation(); updateStatus("away", p) }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-secondary hover:bg-secondary/80 text-muted-foreground">{p}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {activeChannel === null ? (
          /* ── BUDDY LIST ── */
          <div className="flex-1 overflow-y-auto">
            {/* Channels */}
            <div className="px-2 pt-2 pb-1">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-1">Channels</span>
                <button onClick={() => setShowNewRoom(!showNewRoom)} className="text-muted-foreground hover:text-foreground p-0.5"><Plus className="w-3 h-3" /></button>
              </div>
              {showNewRoom && (
                <div className="flex gap-1 mb-1" onClick={e => e.stopPropagation()}>
                  <Input value={newRoomName} onChange={e => setNewRoomName(e.target.value)} placeholder="room-name"
                    className="h-6 text-[10px] flex-1" onKeyDown={e => { if (e.key === "Enter") createRoom() }} />
                  <Button size="sm" className="h-6 px-2 text-[10px]" onClick={createRoom}>Add</Button>
                </div>
              )}
              {conversations.filter(c => c.type === "group").map(c => (
                <button key={c.channel} onClick={() => openChannel(c.channel)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-secondary/50 text-left">
                  <Hash className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 truncate">{c.label}</span>
                  {c.unread > 0 && <span className="w-4 h-4 rounded-full bg-destructive text-[8px] flex items-center justify-center text-white flex-shrink-0">{c.unread}</span>}
                </button>
              ))}
            </div>
            {/* DMs */}
            {conversations.filter(c => c.type === "dm").length > 0 && (
              <div className="px-2 pb-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-1">Direct Messages</span>
                {conversations.filter(c => c.type === "dm").map(c => {
                  const peer = staff.find(s => s.userId === c.targetUserId)
                  const ps = peer?.status || "online"
                  return (
                    <button key={c.channel} onClick={() => openChannel(c.channel)}
                      className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-secondary/50 text-left">
                      <Circle className={cn("w-2 h-2 flex-shrink-0", STATUS_META[ps]?.fill, STATUS_META[ps]?.color)} />
                      <span className="flex-1 truncate">{c.label}</span>
                      {c.unread > 0 && <span className="w-4 h-4 rounded-full bg-destructive text-[8px] flex items-center justify-center text-white flex-shrink-0">{c.unread}</span>}
                    </button>
                  )
                })}
              </div>
            )}
            {/* Buddies */}
            <div className="px-2 pb-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-1">
                Online ({staff.filter(s => s.status === "online").length}) / Away ({staff.filter(s => s.status !== "online").length})
              </span>
              {staff.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No staff online</p>
              ) : (
                <div className="space-y-0.5 mt-1">
                  {[...staff].sort((a, b) => {
                    const order: Record<string, number> = { online: 0, away: 1, busy: 2, invisible: 3 }
                    return (order[a.status] ?? 9) - (order[b.status] ?? 9)
                  }).map(s => {
                    const isMe = s.userId === myUserIdRef.current
                    const meta = STATUS_META[s.status] || STATUS_META.online
                    const nameColor = getNameColor(s)
                    return (
                      <div key={s.socketId}
                        className={cn("flex items-center gap-2 px-2 py-1.5 rounded transition-colors group",
                          !isMe && "hover:bg-secondary/50 cursor-pointer")}
                        onClick={() => !isMe && openDM(s)}>
                        <div className="relative flex-shrink-0">
                          <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold"
                            style={{ color: nameColor }}>
                            {s.username.charAt(0).toUpperCase()}
                          </div>
                          <Circle className={cn("w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5", meta.fill, meta.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-medium" style={{ color: nameColor }}>
                              {s.username}{isMe ? " (you)" : ""}
                            </span>
                            <span className="text-[8px] px-1 py-0.5 rounded bg-secondary/80 text-muted-foreground">{s.role}</span>
                          </div>
                          {s.awayMessage ? (
                            <p className="text-[10px] text-yellow-500 truncate italic">{s.awayMessage}</p>
                          ) : s.status !== "online" ? (
                            <p className="text-[10px] text-muted-foreground">{meta.label}</p>
                          ) : null}
                        </div>
                        {!isMe && (
                          <button onClick={e => { e.stopPropagation(); sendNudge(s.userId) }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-yellow-400" title="Nudge">
                            <Zap className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── CHAT VIEW ── */
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-secondary/20 flex-shrink-0">
              <button onClick={() => setActiveChannel(null)} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-medium truncate flex-1">
                {activeConv?.type === "dm" ? activeConv.label : `#${activeConv?.label || activeChannel}`}
              </span>
              {activeConv?.type === "dm" && activeConv.targetUserId && (
                <button onClick={() => sendNudge(activeConv.targetUserId!)}
                  className="text-muted-foreground hover:text-yellow-400" title="Nudge"><Zap className="w-3.5 h-3.5" /></button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
              {activeMessages.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  {activeConv?.type === "dm" ? `Start a conversation with ${activeConv.label}` : "No messages yet. Say hello!"}
                </p>
              ) : activeMessages.map((msg, i) => {
                const isMe = msg.sender_id === myUserIdRef.current
                const nameColor = getMsgNameColor(msg)
                return (
                  <div key={i} className={cn("flex flex-col", isMe ? "items-end" : "items-start")} title={fullTime(msg.created_at)}>
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-[10px] font-medium" style={{ color: nameColor }}>{msg.sender_name}</span>
                      <span className="text-[9px] text-muted-foreground">{timeAgo(msg.created_at)}</span>
                    </div>
                    <div className={cn(
                      "text-xs px-2.5 py-1.5 rounded-lg max-w-[85%] break-words",
                      isMe ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-secondary rounded-bl-sm"
                    )}>
                      {formatText(msg.body)}
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {channelTyping.length > 0 && (
              <div className="px-3 py-0.5 text-[10px] text-muted-foreground italic flex-shrink-0">
                {channelTyping.join(", ")} {channelTyping.length === 1 ? "is" : "are"} typing...
              </div>
            )}

            {showEmoji && (
              <div className="border-t border-border px-2 py-1.5 flex-shrink-0">
                <div className="grid grid-cols-10 gap-0.5">
                  {EMOJI_GRID.map(e => (
                    <button key={e} onClick={() => setInput(prev => prev + e)}
                      className="w-7 h-7 flex items-center justify-center text-sm hover:bg-secondary rounded transition-colors">{e}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-border p-2 flex gap-1 items-center flex-shrink-0">
              <button onClick={() => setShowEmoji(!showEmoji)}
                className={cn("text-muted-foreground hover:text-foreground p-1 rounded", showEmoji && "text-primary bg-secondary")}>
                <Smile className="w-4 h-4" />
              </button>
              <Input value={input} onChange={e => handleInputChange(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") sendMessage() }}
                placeholder="Message... (*bold* _italic_ /roll)" className="h-8 text-xs flex-1" maxLength={500} />
              <Button size="sm" className="h-8 w-8 p-0" onClick={sendMessage} disabled={!input.trim()}>
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
