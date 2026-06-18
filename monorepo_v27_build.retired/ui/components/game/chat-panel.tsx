"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useGame } from "@/lib/game-context"
import { Send, Minimize2, Maximize2, X, Globe, MapPin, Swords, Shield, Mail, Megaphone, Key } from "lucide-react"
import { cn } from "@/lib/utils"

// Channel configuration matching the original ChatUI
const CHANNELS = [
  { key: 'global', label: 'Global', color: 'text-foreground', icon: Globe },
  { key: 'local', label: 'Zone', color: 'text-green-400', icon: MapPin },
  { key: 'party', label: 'Party', color: 'text-blue-400', icon: Swords },
  { key: 'guild', label: 'Guild', color: 'text-orange-400', icon: Shield },
  { key: 'dm', label: 'DM', color: 'text-pink-400', icon: Mail },
  { key: 'announce', label: 'Announce', color: 'text-yellow-400', icon: Megaphone },
  { key: 'admin', label: 'Admin', color: 'text-red-400', icon: Key, staffOnly: true },
] as const

type ChannelKey = typeof CHANNELS[number]['key']

interface ChatMessage {
  id: string
  channel: ChannelKey | 'system'
  from: string
  fromCharId?: number
  text: string
  ts: number
  targetName?: string
}

export function ChatPanel() {
  const { socket, character, isStaff } = useGame()
  const [collapsed, setCollapsed] = useState(false)
  const [activeChannel, setActiveChannel] = useState<ChannelKey>('global')
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({
    global: [],
    local: [],
    party: [],
    guild: [],
    dm: [],
    announce: [],
    admin: [],
    system: [{ id: '0', channel: 'system', from: 'System', text: 'Chat ready. Press Enter to focus.', ts: Date.now() }]
  })
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [inputValue, setInputValue] = useState('')
  const [dmTarget, setDmTarget] = useState<{ charId: number | null, name: string } | null>(null)
  const [dmInputValue, setDmInputValue] = useState('')
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dmInputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, activeChannel, scrollToBottom])

  // Socket event handling
  useEffect(() => {
    if (!socket) return

    const handleChatMsg = (msg: ChatMessage) => {
      const ch = msg.channel || 'system'
      setMessages(prev => ({
        ...prev,
        [ch]: [...(prev[ch] || []).slice(-99), { ...msg, id: `${Date.now()}-${Math.random()}` }]
      }))

      // Update unread if not on this channel
      if (ch !== activeChannel && ch !== 'system') {
        setUnread(prev => ({ ...prev, [ch]: (prev[ch] || 0) + 1 }))
      }
    }

    socket.on('chat_msg', handleChatMsg)
    return () => { socket.off('chat_msg', handleChatMsg) }
  }, [socket, activeChannel])

  // Handle sending messages
  const sendMessage = useCallback(() => {
    if (!inputValue.trim() || !socket) return

    if (activeChannel === 'dm' && !dmTarget) {
      setMessages(prev => ({
        ...prev,
        system: [...prev.system, {
          id: `${Date.now()}`,
          channel: 'system',
          from: 'System',
          text: 'Set a DM target first - type their name in the target box.',
          ts: Date.now()
        }]
      }))
      return
    }

    const payload: { channel: string; text: string; targetCharId?: number | null; targetName?: string } = {
      channel: activeChannel,
      text: inputValue.trim()
    }

    if (activeChannel === 'dm' && dmTarget) {
      payload.targetCharId = dmTarget.charId
      // Also send the name so the server can resolve by name when charId is null
      // (happens when the player typed a name rather than clicking a username)
      if (!dmTarget.charId && dmTarget.name) {
        payload.targetName = dmTarget.name
      }
    }

    socket.emit('chat_send', payload)
    setInputValue('')
  }, [inputValue, socket, activeChannel, dmTarget])

  // Switch channel
  const switchChannel = (key: ChannelKey) => {
    setActiveChannel(key)
    setUnread(prev => ({ ...prev, [key]: 0 }))
    inputRef.current?.focus()
  }

  // Set DM target
  const setDmTargetFromName = (name: string) => {
    if (!name.trim()) return
    // In a real implementation, this would look up the player by name
    // For now, we store the name and the server will resolve it
    setDmTarget({ charId: null, name: name.trim() })
    setDmInputValue(name.trim())
    inputRef.current?.focus()
  }

  // Start DM with a specific player
  const startDM = (charId: number, name: string) => {
    setActiveChannel('dm')
    setDmTarget({ charId, name })
    setDmInputValue(name)
    inputRef.current?.focus()
  }

  // Get visible messages
  const visibleMessages = messages[activeChannel] || []
  const systemMessages = messages.system || []

  // Get channel config
  const channelConfig = CHANNELS.find(c => c.key === activeChannel)

  // Filter channels for non-staff users
  const availableChannels = CHANNELS.filter(c => !c.staffOnly || isStaff)

  if (collapsed) {
    return (
      <div className="fixed bottom-4 left-4 z-40">
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-2 px-4 py-2 bg-card/95 backdrop-blur border border-border rounded-lg text-sm text-primary hover:bg-secondary transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
          <span className="font-medium">Chat</span>
          {Object.values(unread).reduce((a, b) => a + b, 0) > 0 && (
            <span className="bg-destructive text-destructive-foreground text-xs px-1.5 rounded-full">
              {Object.values(unread).reduce((a, b) => a + b, 0)}
            </span>
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 left-4 z-40 w-[360px] bg-card/95 backdrop-blur border border-border rounded-lg shadow-xl">
      {/* Header */}
      <div 
        className="flex items-center justify-between px-3 py-2 border-b border-border cursor-pointer hover:bg-secondary/50 transition-colors"
        onClick={() => setCollapsed(true)}
      >
        <span className="text-sm font-semibold text-primary tracking-wide">Chat</span>
        <Minimize2 className="w-4 h-4 text-muted-foreground" />
      </div>

      {/* Channel Tabs */}
      <div className="flex gap-1 p-2 overflow-x-auto scrollbar-none">
        {availableChannels.map(channel => {
          const Icon = channel.icon
          const isActive = activeChannel === channel.key
          const unreadCount = unread[channel.key] || 0
          
          return (
            <button
              key={channel.key}
              onClick={(e) => { e.stopPropagation(); switchChannel(channel.key) }}
              className={cn(
                "relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-t text-xs whitespace-nowrap transition-all",
                isActive 
                  ? "bg-secondary/80 text-foreground border border-border border-b-0" 
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {isActive && <span>{channel.label}</span>}
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] px-1 rounded-full min-w-[14px] text-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* DM Target Row */}
      {activeChannel === 'dm' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-pink-500/5 border-b border-pink-500/20">
          <input
            ref={dmInputRef}
            type="text"
            value={dmInputValue}
            onChange={(e) => setDmInputValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                setDmTargetFromName(dmInputValue)
              }
            }}
            placeholder="Type name then Enter..."
            className="flex-1 bg-background/50 border border-pink-500/30 text-pink-400 px-2 py-1 text-xs rounded outline-none focus:border-pink-500"
          />
          {dmTarget && (
            <span className="text-xs text-pink-400">
              {'->'} {dmTarget.name}
            </span>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="h-48 overflow-y-auto p-2 flex flex-col gap-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border">
        {/* Show system messages only when there are no channel messages yet */}
        {visibleMessages.length === 0
          ? systemMessages.map(msg => (
              <ChatLine key={msg.id} msg={msg} myCharId={character?.charId} onDM={startDM} />
            ))
          : visibleMessages.map(msg => (
              <ChatLine key={msg.id} msg={msg} myCharId={character?.charId} onDM={startDM} />
            ))
        }
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 p-2 border-t border-border">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') sendMessage()
            if (e.key === 'Escape') inputRef.current?.blur()
          }}
          placeholder={`${channelConfig?.label || 'Message'}...`}
          maxLength={300}
          className={cn(
            "flex-1 bg-background/50 border border-border px-3 py-2 text-sm rounded outline-none transition-colors",
            "focus:border-primary"
          )}
        />
        <button
          onClick={sendMessage}
          className="px-3 py-2 bg-primary/15 border border-primary/30 text-primary rounded hover:bg-primary/30 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// Individual chat line component
function ChatLine({ 
  msg, 
  myCharId, 
  onDM 
}: { 
  msg: ChatMessage
  myCharId?: number
  onDM: (charId: number, name: string) => void
}) {
  const channel = msg.channel
  const channelConfig = CHANNELS.find(c => c.key === channel)
  const color = channelConfig?.color || 'text-muted-foreground'
  
  const time = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const canDM = msg.fromCharId && msg.fromCharId !== myCharId

  // DM direction label
  let dmLabel = ''
  if (channel === 'dm' && msg.targetName) {
    const isMe = msg.fromCharId === myCharId
    dmLabel = isMe ? ` -> ${msg.targetName}` : ' [DM]'
  }

  return (
    <div className="text-xs leading-relaxed break-words">
      <span className="text-muted-foreground/50">[{time}]</span>{' '}
      <span 
        className={cn(color, "font-semibold", canDM && "cursor-pointer hover:underline")}
        onClick={() => canDM && onDM(msg.fromCharId!, msg.from)}
        title={canDM ? `DM ${msg.from}` : undefined}
      >
        {msg.from}
      </span>
      {dmLabel && <span className="text-muted-foreground/70 text-[10px]">{dmLabel}</span>}
      :{' '}
      <span className={channel === 'system' ? 'text-muted-foreground' : 'text-foreground/80'}>
        {msg.text}
      </span>
    </div>
  )
}
