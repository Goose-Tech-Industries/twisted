"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Megaphone, Map, Globe, MessageSquare, Zap, Moon, AlertTriangle, Terminal, Mail, Send } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import adminApi from "@/lib/admin-api"

interface LogEntry {
  time: string
  message: string
  type: 'info' | 'success' | 'error'
}

export function GmToolsPanel() {
  const [announceMsg, setAnnounceMsg] = useState("")
  const [announceStyle, setAnnounceStyle] = useState<'info' | 'warning' | 'danger'>('info')
  const [mapId, setMapId] = useState("")
  const [mapMsg, setMapMsg] = useState("")
  const [chatMsg, setChatMsg] = useState("")
  const [logs, setLogs] = useState<LogEntry[]>([])

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const time = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, { time, message, type }])
  }

  const handleAnnounce = async () => {
    if (!announceMsg.trim()) return
    const res = await adminApi.gm.announce(announceMsg, announceStyle)
    if (res.success) {
      addLog(`Announced: "${announceMsg}" (${announceStyle})`, 'success')
      setAnnounceMsg("")
    } else {
      addLog(`Failed to announce: ${res.message}`, 'error')
    }
  }

  const handleMapBroadcast = async () => {
    if (!mapId || !mapMsg.trim()) return
    const res = await adminApi.gm.mapBroadcast(parseInt(mapId), mapMsg)
    if (res.success) {
      addLog(`Sent to Map ${mapId}: "${mapMsg}"`, 'success')
      setMapMsg("")
    } else {
      addLog(`Failed: ${res.message}`, 'error')
    }
  }

  const handleChatBroadcast = async () => {
    if (!chatMsg.trim()) return
    const res = await adminApi.gm.chatBroadcast(chatMsg, 'announce')
    if (res.success) {
      addLog(`Chat broadcast: "${chatMsg}"`, 'success')
      setChatMsg("")
    } else {
      addLog(`Failed: ${res.message}`, 'error')
    }
  }

  const handleWorldEvent = async (type: string, payload: Record<string, unknown> = {}) => {
    const res = await adminApi.gm.worldEvent(type, payload)
    if (res.success) {
      addLog(`World event fired: ${type}`, 'success')
    } else {
      addLog(`Failed: ${res.message}`, 'error')
    }
  }

  const handleCustomEvent = () => {
    const type = prompt('Event type (e.g. blood_moon, darkness_falls):')
    if (!type) return
    const payloadStr = prompt('Payload JSON (or leave blank):', '{}')
    let payload = {}
    try { payload = JSON.parse(payloadStr || '{}') } catch { /* ignore */ }
    handleWorldEvent(type, payload)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">GM Broadcast Tools</h2>
        <p className="text-sm text-muted-foreground">Send announcements and trigger world events</p>
      </div>

      {/* Global Announce */}
      <Card className="celtic-border border-destructive/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-destructive" />
            Global Server Announcement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Shown as a banner across the top of every player's screen for 12 seconds.
          </p>
          <textarea
            value={announceMsg}
            onChange={e => setAnnounceMsg(e.target.value)}
            placeholder="Server will restart in 5 minutes for maintenance..."
            rows={2}
            className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm resize-none"
          />
          <div className="flex items-center gap-3">
            <select
              value={announceStyle}
              onChange={e => setAnnounceStyle(e.target.value as 'info' | 'warning' | 'danger')}
              className="px-3 py-2 bg-input border border-border rounded-md text-sm"
            >
              <option value="info">Info (blue)</option>
              <option value="warning">Warning (orange)</option>
              <option value="danger">Danger (red)</option>
            </select>
            <Button onClick={handleAnnounce} className="bg-blue-600 hover:bg-blue-700">
              <Megaphone className="w-4 h-4 mr-2" />
              Announce to All
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Map Broadcast */}
      <Card className="celtic-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Map className="w-4 h-4 text-green-500" />
            Map Broadcast (Local Chat)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Sends a GM message into a specific map's local chat channel.
          </p>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Map ID</label>
              <Input 
                type="number" 
                value={mapId} 
                onChange={e => setMapId(e.target.value)}
                placeholder="1"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Message</label>
              <Input 
                value={mapMsg} 
                onChange={e => setMapMsg(e.target.value)}
                placeholder="Strange sounds echo from the north..."
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleMapBroadcast} className="w-full bg-green-600 hover:bg-green-700">
                Send
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* World Events */}
      <Card className="celtic-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            World Events
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Fire a world event - triggers visual/audio effects on every client's game screen.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button 
              onClick={() => handleWorldEvent('blood_moon')}
              className="p-4 border border-border rounded-lg bg-secondary/30 hover:border-primary/50 transition-colors text-center"
            >
              <Moon className="w-6 h-6 mx-auto mb-2 text-red-500" />
              <div className="text-sm font-medium">Blood Moon</div>
              <div className="text-xs text-muted-foreground">Red tint, 30s</div>
            </button>
            <button 
              onClick={() => handleWorldEvent('darkness_falls')}
              className="p-4 border border-border rounded-lg bg-secondary/30 hover:border-primary/50 transition-colors text-center"
            >
              <Moon className="w-6 h-6 mx-auto mb-2 text-gray-400" />
              <div className="text-sm font-medium">Darkness Falls</div>
              <div className="text-xs text-muted-foreground">Chat log message</div>
            </button>
            <button 
              onClick={() => {
                const msg = prompt('Emergency message:')
                if (msg) handleWorldEvent('emergency', { message: msg })
              }}
              className="p-4 border border-border rounded-lg bg-secondary/30 hover:border-primary/50 transition-colors text-center"
            >
              <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-orange-500" />
              <div className="text-sm font-medium">Emergency</div>
              <div className="text-xs text-muted-foreground">Custom message</div>
            </button>
            <button 
              onClick={handleCustomEvent}
              className="p-4 border border-border rounded-lg bg-secondary/30 hover:border-primary/50 transition-colors text-center"
            >
              <Zap className="w-6 h-6 mx-auto mb-2 text-yellow-500" />
              <div className="text-sm font-medium">Custom Event</div>
              <div className="text-xs text-muted-foreground">Any event type</div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Chat Broadcast */}
      <Card className="celtic-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-purple-500" />
            Global Chat Broadcast
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Sends a message into the in-game chat (all players see it).
          </p>
          <div className="flex gap-3">
            <Input 
              value={chatMsg} 
              onChange={e => setChatMsg(e.target.value)}
              placeholder="Citizens of the realm, hear my words..."
              className="flex-1"
            />
            <Button onClick={handleChatBroadcast} className="bg-purple-600 hover:bg-purple-700">
              Broadcast
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* System Mail */}
      <SystemMailCard addLog={addLog} />

      {/* Action Log */}
      <Card className="celtic-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            Action Log (this session)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-black/50 rounded-lg p-3 h-40 overflow-y-auto font-mono text-xs space-y-1">
            {logs.length === 0 ? (
              <span className="text-muted-foreground">Actions will appear here...</span>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={
                  log.type === 'success' ? 'text-green-400' :
                  log.type === 'error' ? 'text-red-400' :
                  'text-muted-foreground'
                }>
                  <span className="text-muted-foreground/50">[{log.time}]</span> {log.message}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── System Mail Sender ──────────────────────────────────────────
function SystemMailCard({ addLog }: { addLog: (msg: string, type: 'info'|'success'|'error') => void }) {
  const [recipName, setRecipName] = useState('')
  const [subject, setSubject] = useState('System Message')
  const [body, setBody] = useState('')
  const [gold, setGold] = useState(0)
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!recipName.trim() || !body.trim()) return
    setSending(true)
    try {
      // Resolve name to charId
      const cr = await fetch('/game/get-char-by-name', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: recipName.trim() })
      })
      const cd = await cr.json()
      if (!cd.success) { addLog(`Player "${recipName}" not found`, 'error'); setSending(false); return }

      const r = await fetch('/api/mail/system-send', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientCharId: cd.charId, subject, body, goldAttachment: gold })
      })
      const d = await r.json()
      if (d.success) {
        addLog(`System mail sent to ${recipName}: "${subject}"`, 'success')
        setBody(''); setGold(0)
      } else {
        addLog(d.message || 'Failed to send', 'error')
      }
    } catch { addLog('Error sending system mail', 'error') }
    setSending(false)
  }

  return (
    <Card className="celtic-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Mail className="w-4 h-4" />
          System Mail
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Input value={recipName} onChange={e => setRecipName(e.target.value)} placeholder="Recipient name" />
          <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" />
        </div>
        <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Message body..." rows={3} className="resize-none" />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Gold:</span>
            <Input type="number" value={gold} onChange={e => setGold(Math.max(0, parseInt(e.target.value) || 0))} className="w-24 h-8" />
          </div>
          <Button size="sm" onClick={send} disabled={sending || !recipName.trim() || !body.trim()}>
            <Send className="w-3.5 h-3.5 mr-1" />
            {sending ? 'Sending...' : 'Send System Mail'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
