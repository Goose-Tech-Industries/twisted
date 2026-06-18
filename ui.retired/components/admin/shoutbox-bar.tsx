"use client"

import { useEffect, useState, useRef } from "react"
// Socket.IO removed — admin panel moved to Phoenix LiveView (/sauce).
// This stub keeps existing call sites compiling without invoking real I/O.
type AnyHandler = (...args: any[]) => void
type Socket = {
  id: string
  on: (event: string, handler: AnyHandler) => void
  off: (event: string, handler?: AnyHandler) => void
  emit: (event: string, ...args: unknown[]) => void
  disconnect: () => void
  connected: boolean
}
const io = (..._args: unknown[]): Socket => ({
  id: "",
  on() {},
  off() {},
  emit() {},
  disconnect() {},
  connected: false,
})
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Send, ChevronUp, ChevronDown, Users } from "lucide-react"

interface ShoutMessage {
  sender_name: string; sender_role: string; sender_color?: string | null
  body: string; created_at: string
}

interface OnlineStaff {
  username: string; role: string; status: string
}

export function ShoutboxBar() {
  const [messages, setMessages] = useState<ShoutMessage[]>([])
  const [input, setInput] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [onlineStaff, setOnlineStaff] = useState<OnlineStaff[]>([])
  const socketRef = useRef<Socket | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_API_URL || window.location.origin
    const sock = io(url, { withCredentials: true, transports: ['websocket', 'polling'] })
    socketRef.current = sock

    sock.on('connect', () => {
      // Don't join staff_panel again — StaffMessenger handles presence
      // Just request shoutbox channel history
      sock.emit('staff_chat_history', { channel: 'shoutbox' })
    })

    sock.on('staff_chat_msg', (msg: ShoutMessage & {channel?: string}) => {
      if (msg.channel && msg.channel !== 'shoutbox') return // Only show shoutbox messages
      setMessages(prev => [...prev.slice(-50), msg])
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50)
    })

    sock.on('staff_chat_history', (data: { messages?: ShoutMessage[] } | ShoutMessage[]) => {
      const msgs = Array.isArray(data) ? data : (data.messages || [])
      setMessages(msgs.slice(-30))
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50)
    })

    // Listen for presence from the main StaffMessenger connection
    sock.on('staff_panel_presence', (list: OnlineStaff[]) => {
      setOnlineStaff(list.filter(s => s.status !== 'invisible'))
    })

    return () => {
      sock.off('staff_chat_msg')
      sock.off('staff_chat_history')
      sock.off('staff_panel_presence')
      sock.disconnect()
    }
  }, [])

  const send = () => {
    if (!input.trim() || !socketRef.current) return
    socketRef.current.emit('staff_chat_send', { body: input.trim(), channel: 'shoutbox' })
    setInput('')
  }

  const roleColor = (role: string) => {
    switch (role?.toUpperCase()) {
      case 'OWNER': return 'text-red-400'
      case 'ADMIN': return 'text-yellow-400'
      case 'GM': return 'text-green-400'
      case 'MOD': return 'text-blue-400'
      default: return 'text-muted-foreground'
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      {/* Expanded view */}
      {expanded && (
        <div className="bg-card border-t border-border shadow-lg" style={{ height: 200 }}>
          <div ref={scrollRef} className="h-full overflow-y-auto px-3 py-2 space-y-0.5">
            {messages.map((m, i) => (
              <div key={i} className="text-xs">
                <span className="text-[10px] text-muted-foreground/50 mr-1">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span className={cn("font-bold mr-1", roleColor(m.sender_role))} style={m.sender_color ? { color: m.sender_color } : {}}>
                  {m.sender_name}:
                </span>
                <span className="text-foreground">{m.body}</span>
              </div>
            ))}
            {messages.length === 0 && <p className="text-xs text-muted-foreground/50 text-center py-4">No messages yet.</p>}
          </div>
        </div>
      )}

      {/* Bar */}
      <div className="bg-[#0d0d14] border-t border-border/50 flex items-center gap-2 px-3 py-1.5">
        <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground shrink-0">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>

        {/* Online count */}
        <div className="flex items-center gap-1 shrink-0 text-[10px] text-muted-foreground" title={onlineStaff.map(s => `${s.username} (${s.role})`).join(', ')}>
          <Users className="w-3 h-3" />
          <span>{onlineStaff.length}</span>
        </div>

        {/* Latest message preview (when collapsed) */}
        {!expanded && messages.length > 0 && (
          <div className="flex-1 min-w-0 text-xs truncate text-muted-foreground">
            <span className={cn("font-bold mr-1", roleColor(messages[messages.length - 1].sender_role))}>
              {messages[messages.length - 1].sender_name}:
            </span>
            {messages[messages.length - 1].body}
          </div>
        )}

        {/* Input */}
        <div className={cn("flex gap-1", expanded ? "flex-1" : "w-48")}>
          <Input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Shout..."
            className="h-6 text-xs bg-input border-border/30" />
          <button onClick={send} className="text-primary hover:text-primary/80 shrink-0">
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
