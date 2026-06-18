"use client"

import React, { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Activity, MapPin, Heart, Swords, LogOut, MessageSquare, RefreshCw } from "lucide-react"
import adminApi from "@/lib/admin-api"
import { toast } from "@/hooks/use-toast"

interface OnlinePlayer {
  socketId: string; charId: number; userId: number
  name: string; mapId: number; mapName?: string
  x: number; y: number; level: number; role: string
  presence?: string; currentHp?: number; maxHp?: number
  inBattle?: boolean
}

export function SessionMonitor({ externalPlayers }: { externalPlayers?: OnlinePlayer[] } = {}) {
  const [players, setPlayers] = useState<OnlinePlayer[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    // If parent provides data, skip polling
    if (externalPlayers) { setPlayers(externalPlayers); setLoading(false); return }
    try {
      const res = await fetch('/admin-panel/dashboard', { credentials: 'include' })
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      if (data.success) {
        setPlayers((data.onlineList || []).map((p: Record<string, unknown>) => ({
          ...p,
          socketId: String(p.socketId || p.charId),
          charId: Number(p.charId || p.id || 0),
          userId: Number(p.userId || 0),
          name: String(p.name || ''),
          mapId: Number(p.mapId || 0),
          mapName: p.mapName ? String(p.mapName) : undefined,
          x: Number(p.x || 0), y: Number(p.y || 0),
          level: Number(p.level || 1),
          role: String(p.role || 'PLAYER'),
        })))
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const iv = setInterval(load, 10_000)
    return () => clearInterval(iv)
  }, [load])

  const kickPlayer = async (charId: number, name: string) => {
    if (!confirm(`Kick ${name}?`)) return
    const r = await adminApi.players.kick(charId, "Kicked from session monitor")
    toast({ title: r.success ? `${name} kicked` : (r.message || "Failed"), variant: r.success ? undefined : "destructive" })
    setTimeout(load, 1000)
  }

  const messagePlayer = async (userId: number, name: string) => {
    const msg = window.prompt(`Message to ${name}:`)
    if (!msg) return
    const r = await fetch('/admin-panel/broadcast-player', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ userId, message: msg, type: 'info' })
    }).then(r => r.json())
    toast({ title: r.success ? 'Message sent' : (r.message || 'Failed') })
  }

  return (
    <Card className="celtic-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-500" />
            Live Sessions ({players.length})
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={load} className="h-6 w-6 p-0">
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : players.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No players online</p>
        ) : (
          <div className="space-y-1.5">
            {players.map(p => (
              <div key={p.charId} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/50 transition-colors group text-xs">
                <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                  {p.level}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{p.name}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <MapPin className="w-2.5 h-2.5" />
                      {p.mapName || `Map ${p.mapId}`} ({p.x},{p.y})
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => messagePlayer(p.userId, p.name)}
                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" title="Message">
                    <MessageSquare className="w-3 h-3" />
                  </button>
                  <button onClick={() => kickPlayer(p.charId, p.name)}
                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive" title="Kick">
                    <LogOut className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
