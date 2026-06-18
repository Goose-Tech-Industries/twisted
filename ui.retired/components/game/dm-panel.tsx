"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useGame } from "@/lib/game-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  BookOpen, Crown, Users, Plus, Send, ChevronRight, ChevronLeft,
  Lock, Unlock, MapPin, Swords, Sparkles, CloudLightning, Pause,
  Play, Scroll, Bot, UserCheck, Shield, Eye, MessageSquare
} from "lucide-react"

// ─── Types ──────────────────────────────────────────────────────
interface Campaign {
  id: number; name: string; description: string | null
  dm_user_id: number; dm_name?: string; max_players: number
  is_oneshot: boolean; world_tone: string; map_id: number | null
  status: string; session_count: number; player_count?: number
  moves_per_day?: number; tiles_per_move?: number; flying_tiles?: number
}

interface ChatEntry {
  speaker: string; text: string; isSystem?: boolean
}

interface CharSheet {
  id?: number; user_id: number; username?: string
  name: string; race: string; class_name: string; level: number
  str: number; dex: number; con: number; int_score: number; wis: number; cha: number
  max_hp: number; current_hp: number; armor_class: number
  background: string; alignment: string; personality: string; backstory: string
  equipment_json: unknown; skills_json: unknown; spells_json: unknown
  notes: string; portrait_url: string | null
}

interface ActionSlot {
  actionType: string; label: string; icon: string | null
  used: number; maxUses: number | null; remaining: number | null
  unlimited?: boolean; requiresOpponent?: boolean; requiresMaster?: boolean
}

type DMView = 'campaigns' | 'session' | 'sheets' | 'create'

// ═══════════════════════════════════════════════════════════════
// DM PANEL — Campaign & Session Management
// ═══════════════════════════════════════════════════════════════
export function DMPanel() {
  const { state, socket, notify } = useGame()
  const [view, setView] = useState<DMView>('campaigns')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null)
  const [chatHistory, setChatHistory] = useState<ChatEntry[]>([])
  const [sheets, setSheets] = useState<CharSheet[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sessionActive, setSessionActive] = useState(false)
  const [actionSlots, setActionSlots] = useState<ActionSlot[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const isStaff = ['ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER'].includes(
    (state.character as unknown as Record<string, unknown>)?.role as string || ''
  )

  // ── Load campaigns ──
  const loadCampaigns = useCallback(() => {
    if (!socket) return
    socket.emit('dm_list_campaigns')
  }, [socket])

  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  // ── Socket listeners ──
  useEffect(() => {
    if (!socket) return

    const onCampaignsList = (list: Campaign[]) => {
      setCampaigns(list)
      setLoading(false)
    }
    const onCampaignCreated = (data: { id: number; name: string }) => {
      notify('success', `Campaign "${data.name}" created!`)
      loadCampaigns()
      setView('campaigns')
    }
    const onDmResponse = (data: { speaker: string; text: string; sessionId: number }) => {
      setChatHistory(prev => [...prev, { speaker: data.speaker, text: data.text }])
    }
    const onDmAssistResult = (data: { text: string }) => {
      setChatHistory(prev => [...prev, { speaker: 'AI Assistant', text: data.text, isSystem: true }])
    }
    const onSessionStarted = (data: { campaignId: number; sessionNumber: number }) => {
      setSessionActive(true)
      setChatHistory(prev => [...prev, {
        speaker: 'System', text: `Session ${data.sessionNumber} has begun!`, isSystem: true
      }])
    }
    const onSessionEnded = () => {
      setSessionActive(false)
      setChatHistory(prev => [...prev, {
        speaker: 'System', text: 'Session ended.', isSystem: true
      }])
    }
    const onSheets = (data: { campaignId: number; sheets: CharSheet[] }) => {
      setSheets(data.sheets)
    }
    const onActionSlots = (data: { campaignId: number; slots: ActionSlot[] }) => {
      setActionSlots(data.slots)
    }
    const onActionResult = (data: { success: boolean; message: string; actionType: string; remaining?: number }) => {
      notify(data.success ? 'success' : 'warning', data.message)
      // Refresh slots after action
      if (activeCampaign) socket.emit('get_action_slots', { campaignId: activeCampaign.id })
    }
    const onNotification = (data: { type?: string; message: string }) => {
      if (data.message?.includes('campaign') || data.message?.includes('Campaign') ||
          data.message?.includes('invite') || data.message?.includes('Session') ||
          data.message?.includes('session')) {
        notify('info', data.message)
      }
    }

    socket.on('action_slots', onActionSlots)
    socket.on('campaign_action_result', onActionResult)
    socket.on('dm_campaigns_list', onCampaignsList)
    socket.on('dm_campaign_created', onCampaignCreated)
    socket.on('dm_response', onDmResponse)
    socket.on('dm_assist_result', onDmAssistResult)
    socket.on('dm_session_started', onSessionStarted)
    socket.on('dm_session_ended', onSessionEnded)
    socket.on('dm_character_sheets', onSheets)
    socket.on('notification', onNotification)

    return () => {
      socket.off('dm_campaigns_list', onCampaignsList)
      socket.off('dm_campaign_created', onCampaignCreated)
      socket.off('dm_response', onDmResponse)
      socket.off('dm_assist_result', onDmAssistResult)
      socket.off('dm_session_started', onSessionStarted)
      socket.off('dm_session_ended', onSessionEnded)
      socket.off('dm_character_sheets', onSheets)
      socket.off('action_slots', onActionSlots)
      socket.off('campaign_action_result', onActionResult)
      socket.off('notification', onNotification)
    }
  }, [socket, notify, loadCampaigns])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  // ── Join campaign session ──
  const joinCampaign = (campaign: Campaign) => {
    setActiveCampaign(campaign)
    setChatHistory([])
    if (socket) {
      socket.emit('dm_join_session', { sessionId: campaign.id })
      socket.emit('dm_get_sheets', { campaignId: campaign.id })
      socket.emit('get_action_slots', { campaignId: campaign.id })
    }
    setView('session')
  }

  // ── Send player action ──
  const sendAction = () => {
    if (!inputText.trim() || !socket || !activeCampaign) return
    const text = inputText.trim()
    setInputText('')
    setChatHistory(prev => [...prev, { speaker: state.character?.name || 'You', text }])
    socket.emit('dm_action', { action: text, sessionId: activeCampaign.id })
  }

  // ── DM Controls ──
  const dmNarrate = () => {
    if (!inputText.trim() || !socket || !activeCampaign) return
    const text = inputText.trim()
    setInputText('')
    socket.emit('dm_narrate', { text, sessionId: activeCampaign.id })
  }

  const dmAssist = () => {
    if (!inputText.trim() || !socket || !activeCampaign) return
    const text = inputText.trim()
    setInputText('')
    socket.emit('dm_assist', { instruction: text, sessionId: activeCampaign.id })
  }

  // ═══════════════════════════════════════════════════════════════
  // CAMPAIGN LIST VIEW
  // ═══════════════════════════════════════════════════════════════
  if (view === 'campaigns') {
    return (
      <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Campaigns
          </h2>
          {isStaff && (
            <Button size="sm" onClick={() => setView('create')}>
              <Plus className="w-4 h-4 mr-1" /> New Campaign
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading campaigns...</p>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No active campaigns</p>
              {isStaff && (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setView('create')}>
                  Create one
                </Button>
              )}
            </div>
          ) : campaigns.map(c => (
            <Card key={c.id} className="celtic-border cursor-pointer hover:bg-secondary/30 transition-colors"
              onClick={() => joinCampaign(c)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm flex items-center gap-2">
                      {c.is_oneshot ? <Swords className="w-4 h-4 text-destructive shrink-0" /> : <Crown className="w-4 h-4 text-primary shrink-0" />}
                      <span className="truncate">{c.name}</span>
                    </h3>
                    {c.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {c.player_count || 0}/{c.max_players}
                      </span>
                      <span className="capitalize">{c.status}</span>
                      {c.dm_name && <span>DM: {c.dm_name}</span>}
                      {c.session_count > 0 && <span>{c.session_count} sessions</span>}
                    </div>
                    {(c.moves_per_day || c.tiles_per_move) && (
                      <div className="flex gap-2 mt-1.5 text-[10px] text-muted-foreground/70">
                        {c.moves_per_day && <span>{c.moves_per_day} moves/day</span>}
                        {c.tiles_per_move && <span>{c.tiles_per_move} tiles/move</span>}
                        {c.flying_tiles && <span>Flying: {c.flying_tiles} tiles</span>}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // CREATE CAMPAIGN VIEW
  // ═══════════════════════════════════════════════════════════════
  if (view === 'create') {
    return <CreateCampaignForm onBack={() => setView('campaigns')} socket={socket} />
  }

  // ═══════════════════════════════════════════════════════════════
  // CHARACTER SHEETS VIEW
  // ═══════════════════════════════════════════════════════════════
  if (view === 'sheets') {
    return (
      <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-2 p-4 border-b border-border">
          <button onClick={() => setView('session')} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Scroll className="w-5 h-5 text-primary" />
            Character Sheets
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sheets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No character sheets yet</p>
          ) : sheets.map(s => (
            <Card key={s.user_id} className="celtic-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-sm">{s.name || 'Unnamed'}</h3>
                  <span className="text-xs text-muted-foreground">{s.username}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <span>{s.race} {s.class_name}</span>
                  <span>Level {s.level}</span>
                  <span>HP: {s.current_hp}/{s.max_hp}</span>
                </div>
                <div className="grid grid-cols-6 gap-1 mt-2 text-[10px] text-center">
                  {(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const).map((stat, i) => {
                    const vals = [s.str, s.dex, s.con, s.int_score, s.wis, s.cha]
                    return (
                      <div key={stat} className="bg-secondary/50 rounded px-1 py-0.5">
                        <div className="text-muted-foreground">{stat}</div>
                        <div className="font-bold">{vals[i]}</div>
                      </div>
                    )
                  })}
                </div>
                {s.backstory && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2 italic">{s.backstory}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // SESSION VIEW — Main DM interaction screen
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border shrink-0">
        <button onClick={() => { setView('campaigns'); setActiveCampaign(null) }}
          className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold truncate">{activeCampaign?.name || 'Session'}</h2>
          <p className="text-[10px] text-muted-foreground">
            {sessionActive ? 'Session active' : activeCampaign?.status || 'Ready'}
            {activeCampaign?.world_tone && ` \u00B7 ${activeCampaign.world_tone}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="ghost" onClick={() => setView('sheets')} title="Character Sheets">
            <Scroll className="w-4 h-4" />
          </Button>
          {isStaff && !sessionActive && activeCampaign && (
            <Button size="sm" onClick={() => {
              socket?.emit('dm_start_session', { campaignId: activeCampaign.id, title: `Session ${(activeCampaign.session_count || 0) + 1}` })
            }}>
              <Play className="w-4 h-4 mr-1" /> Start
            </Button>
          )}
          {isStaff && sessionActive && activeCampaign && (
            <Button size="sm" variant="destructive" onClick={() => {
              socket?.emit('dm_end_session', { campaignId: activeCampaign.id, summary: '' })
            }}>
              <Pause className="w-4 h-4 mr-1" /> End
            </Button>
          )}
        </div>
      </div>

      {/* DM Quick Controls — staff only */}
      {isStaff && activeCampaign && (
        <DMControls socket={socket} sessionId={activeCampaign.id} notify={notify} />
      )}

      {/* Action Slots Bar — shows available actions for this campaign's ruleset */}
      {actionSlots.length > 0 && (
        <div className="border-b border-border bg-card/30 px-3 py-2">
          <div className="flex gap-2 overflow-x-auto">
            {actionSlots.map(slot => (
              <button
                key={slot.actionType}
                disabled={!slot.unlimited && slot.remaining === 0}
                onClick={() => {
                  if (slot.unlimited || (slot.remaining && slot.remaining > 0)) {
                    socket?.emit('campaign_action', {
                      campaignId: activeCampaign?.id,
                      actionType: slot.actionType,
                    })
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors shrink-0",
                  !slot.unlimited && slot.remaining === 0
                    ? "bg-secondary/30 text-muted-foreground/50 cursor-not-allowed"
                    : "bg-secondary/60 hover:bg-secondary text-foreground cursor-pointer"
                )}
                title={slot.unlimited ? `${slot.label} — Unlimited` : `${slot.label} — ${slot.remaining}/${slot.maxUses} remaining`}
              >
                {slot.icon && <span>{slot.icon}</span>}
                <span className="font-medium">{slot.label}</span>
                {!slot.unlimited && (
                  <span className={cn(
                    "text-[10px] tabular-nums px-1 rounded",
                    slot.remaining === 0 ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"
                  )}>
                    {slot.remaining}/{slot.maxUses}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat / Narrative area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {chatHistory.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {sessionActive
                ? 'Session is live. Describe what you want to do!'
                : 'Join or start a session to begin your adventure.'}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Try: &quot;I look around the area for clues&quot; or &quot;I want to talk to the merchant&quot;
            </p>
          </div>
        ) : chatHistory.map((entry, i) => (
          <div key={i} className={cn(
            "rounded-lg px-3 py-2 max-w-[90%]",
            entry.isSystem
              ? "mx-auto text-center bg-secondary/30 text-xs text-muted-foreground max-w-full"
              : entry.speaker.includes('DM') || entry.speaker === 'AI Assistant'
                ? "bg-primary/10 border border-primary/20 mr-auto"
                : "bg-secondary/50 ml-auto"
          )}>
            <div className="flex items-center gap-1.5 mb-0.5">
              {entry.speaker.includes('DM') && <Crown className="w-3 h-3 text-primary" />}
              {entry.speaker === 'AI Assistant' && <Bot className="w-3 h-3 text-primary" />}
              <span className="text-[10px] font-bold text-muted-foreground">{entry.speaker}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{entry.text}</p>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-border p-3">
        <div className="flex gap-2">
          <input
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); isStaff ? dmNarrate() : sendAction() } }}
            placeholder={isStaff ? "Narrate or describe what happens..." : "What do you want to do?"}
            className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {isStaff ? (
            <div className="flex gap-1">
              <Button size="sm" onClick={dmNarrate} title="Send as DM narration" disabled={!inputText.trim()}>
                <Send className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="secondary" onClick={dmAssist} title="Ask AI to help write this" disabled={!inputText.trim()}>
                <Bot className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={sendAction} disabled={!inputText.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
        {isStaff && (
          <p className="text-[10px] text-muted-foreground/50 mt-1">
            Enter = Narrate to players | Bot icon = AI assists your writing
          </p>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// DM CONTROLS — Staff-only quick action bar
// ═══════════════════════════════════════════════════════════════
type Notify = (type: 'item' | 'info' | 'warning' | 'success' | 'error' | 'heal' | 'damage' | 'xp' | 'gold', message: string) => void

function DMControls({ socket, sessionId, notify }: {
  socket: ReturnType<typeof useGame>['socket']
  sessionId: number
  notify: Notify
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-border bg-card/50">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground">
        <span className="flex items-center gap-1">
          <Shield className="w-3 h-3" /> DM Controls
        </span>
        <ChevronRight className={cn("w-3 h-3 transition-transform", expanded && "rotate-90")} />
      </button>

      {expanded && (
        <div className="px-3 pb-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => {
            socket?.emit('dm_lock_all', { locked: true, sessionId })
            notify('info', 'All players locked')
          }}>
            <Lock className="w-3 h-3 mr-1" /> Lock All
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => {
            socket?.emit('dm_lock_all', { locked: false, sessionId })
            notify('info', 'All players unlocked')
          }}>
            <Unlock className="w-3 h-3 mr-1" /> Unlock All
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => {
            socket?.emit('dm_screen_effect', { sessionId, effect: 'shake', duration: 800 })
          }}>
            <CloudLightning className="w-3 h-3 mr-1" /> Shake
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => {
            const preset = prompt('Particle preset (fire, ice, sparkle, impact, smoke):')
            if (!preset) return
            const x = parseInt(prompt('X position:') || '0')
            const y = parseInt(prompt('Y position:') || '0')
            socket?.emit('dm_spawn_particle', { mapId: null, preset, x, y })
          }}>
            <Sparkles className="w-3 h-3 mr-1" /> Particle
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => {
            const targetId = parseInt(prompt('Character ID to teleport:') || '0')
            if (!targetId) return
            const mapId = parseInt(prompt('Destination map ID:') || '0')
            const x = parseInt(prompt('X:') || '10')
            const y = parseInt(prompt('Y:') || '10')
            socket?.emit('dm_teleport_player', { targetCharId: targetId, mapId, x, y })
          }}>
            <MapPin className="w-3 h-3 mr-1" /> Teleport
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => {
            const npcId = parseInt(prompt('NPC ID to spawn:') || '0')
            if (!npcId) return
            const mapId = parseInt(prompt('Map ID:') || '0')
            const x = parseInt(prompt('X:') || '10')
            const y = parseInt(prompt('Y:') || '10')
            socket?.emit('dm_spawn_npc', { npcId, mapId, x, y })
          }}>
            <UserCheck className="w-3 h-3 mr-1" /> Spawn NPC
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => {
            const targetId = parseInt(prompt('Character ID to force battle:') || '0')
            const npcId = parseInt(prompt('Enemy NPC ID:') || '0')
            if (!targetId || !npcId) return
            socket?.emit('dm_force_battle', { targetCharId: targetId, enemyNpcId: npcId })
          }}>
            <Swords className="w-3 h-3 mr-1" /> Force Battle
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => {
            const weather = prompt('Weather (RAIN, SNOW, STORM, CLEAR):')
            if (!weather) return
            socket?.emit('dm_set_environment', { mapId: null, weather })
          }}>
            <Eye className="w-3 h-3 mr-1" /> Weather
          </Button>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CREATE CAMPAIGN FORM
// ═══════════════════════════════════════════════════════════════
function CreateCampaignForm({ onBack, socket }: {
  onBack: () => void
  socket: ReturnType<typeof useGame>['socket']
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(7)
  const [isOneshot, setIsOneshot] = useState(false)
  const [worldTone, setWorldTone] = useState('dark fantasy')
  const [movesPerDay, setMovesPerDay] = useState(3)
  const [tilesPerMove, setTilesPerMove] = useState(3)
  const [flyingTiles, setFlyingTiles] = useState(3)

  const submit = () => {
    if (!name.trim()) return
    socket?.emit('dm_create_campaign', {
      name: name.trim(),
      description: description.trim() || null,
      maxPlayers,
      isOneshot,
      worldTone,
      movesPerDay,
      tilesPerMove,
      flyingTiles,
    })
  }

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold">New Campaign</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Name */}
        <div>
          <label className="text-xs font-medium block mb-1">Campaign Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Planet Mado: Namek Saga"
            className="w-full bg-secondary/50 border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-medium block mb-1">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Campaign premise, setting, rules..."
            rows={3}
            className="w-full bg-secondary/50 border border-border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>

        {/* Settings row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium block mb-1">Max Players</label>
            <input type="number" value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))} min={1} max={20}
              className="w-full bg-secondary/50 border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">World Tone</label>
            <select value={worldTone} onChange={e => setWorldTone(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="dark fantasy">Dark Fantasy</option>
              <option value="high fantasy">High Fantasy</option>
              <option value="sci-fi">Sci-Fi</option>
              <option value="anime action">Anime Action</option>
              <option value="cosmic horror">Cosmic Horror</option>
              <option value="gritty realism">Gritty Realism</option>
            </select>
          </div>
        </div>

        {/* Movement Rules */}
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Movement Rules</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-medium block mb-1">Moves / Day</label>
              <input type="number" value={movesPerDay} onChange={e => setMovesPerDay(Number(e.target.value))} min={1} max={99}
                className="w-full bg-secondary/50 border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-[10px] font-medium block mb-1">Tiles / Move</label>
              <input type="number" value={tilesPerMove} onChange={e => setTilesPerMove(Number(e.target.value))} min={1} max={20}
                className="w-full bg-secondary/50 border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-[10px] font-medium block mb-1">Flying Tiles</label>
              <input type="number" value={flyingTiles} onChange={e => setFlyingTiles(Number(e.target.value))} min={1} max={20}
                className="w-full bg-secondary/50 border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {movesPerDay} moves/day &times; {tilesPerMove} tiles = {movesPerDay * tilesPerMove} tiles walking.
            Flying: {movesPerDay * flyingTiles} tiles/day.
          </p>
        </div>

        {/* One-shot toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isOneshot} onChange={e => setIsOneshot(e.target.checked)}
            className="rounded border-border" />
          <span className="text-sm">One-shot (single session campaign)</span>
        </label>
      </div>

      <div className="shrink-0 border-t border-border p-4">
        <Button className="w-full" onClick={submit} disabled={!name.trim()}>
          <Plus className="w-4 h-4 mr-2" /> Create Campaign
        </Button>
      </div>
    </div>
  )
}
