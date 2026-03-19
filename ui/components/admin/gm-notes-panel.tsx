"use client"
import { toast } from "@/hooks/use-toast"
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw, Pin, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Note {
  id: number; body: string; author: string
  map_id: number | null; pinned: boolean | number; created_at: string
}
interface GameMap { id: number; name: string }

async function req(method: string, url: string, data?: unknown): Promise<Record<string, unknown>> {
  const opts: RequestInit = { method, credentials: 'include', headers: { 'Content-Type': 'application/json' } }
  if (data && method !== 'GET') opts.body = JSON.stringify(data)
  return (await fetch(url, opts)).json()
}

export function GmNotesPanel() {
  const [maps,      setMaps]      = useState<GameMap[]>([])
  const [notes,     setNotes]     = useState<Note[]>([])
  const [activeTab, setActiveTab] = useState<'global' | number>('global')
  const [body,      setBody]      = useState('')
  const [scope,     setScope]     = useState<'global' | 'map'>('global')
  const [mapId,     setMapId]     = useState<number>(0)
  const [pinNew,    setPinNew]    = useState(false)
  const [loading,   setLoading]   = useState(true)

  const loadMaps = useCallback(async () => {
    const r = await req('GET', '/admin-panel/map')
    if (r.success) setMaps((r.data || []) as GameMap[])
  }, [])

  const loadNotes = useCallback(async () => {
    const mid = activeTab === 'global' ? 0 : activeTab
    const r = await req('GET', `/admin-panel/notes?mapId=${mid}`)
    if (r.success) setNotes((r.data || []) as Note[])
    setLoading(false)
  }, [activeTab])

  useEffect(() => { loadMaps() }, [loadMaps])
  useEffect(() => { setLoading(true); loadNotes() }, [loadNotes])

  const post = async () => {
    if (!body.trim()) return
    if (body.length > 2000) { toast({ title: 'Note too long', variant: 'destructive' }); return }
    const targetMap = scope === 'map' ? (mapId || maps[0]?.id || null) : null
    const r = await req('POST', '/admin-panel/notes', { body: body.trim(), mapId: targetMap, pinned: pinNew ? 1 : 0 })
    if (r.success) {
      setBody(''); setPinNew(false)
      setActiveTab(scope === 'map' ? mapId : 'global')
    } else toast({ title: String(r.message || 'Failed'), variant: 'destructive' })
  }

  const pin = async (id: number) => { await req('POST', `/admin-panel/notes/${id}/pin`); loadNotes() }
  const del = async (id: number) => {
    if (!confirm('Delete this note?')) return
    await req('DELETE', `/admin-panel/notes/${id}`); loadNotes()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">📝 GM Notepad</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Shared notes visible to all staff. Pin important ones.</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadNotes}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh
        </Button>
      </div>

      {/* Compose */}
      <div className="p-4 bg-card border border-border rounded-lg mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">✏️ New Note</h3>
        <textarea
          value={body}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
          rows={3}
          placeholder="e.g. Don't touch map 7 — active testing."
          className="w-full px-3 py-2 bg-input border border-border rounded text-sm resize-y mb-2"
        />
        <div className="text-right text-[10px] text-muted-foreground mb-2">{body.length}/2000 chars</div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={scope}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setScope(e.target.value as 'global' | 'map')}
            className="px-2 py-1.5 bg-input border border-border rounded text-sm"
          >
            <option value="global">🌍 Global</option>
            <option value="map">🗺️ Specific Map</option>
          </select>
          {scope === 'map' && (
            <select
              value={mapId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMapId(parseInt(e.target.value))}
              className="px-2 py-1.5 bg-input border border-border rounded text-sm"
            >
              {maps.map((m: GameMap) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          <label className="flex items-center gap-1.5 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={pinNew}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPinNew(e.target.checked)}
              className="w-4 h-4"
            />
            📌 Pin this note
          </label>
          <Button className="ml-auto" onClick={post}>Post Note</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        <button
          onClick={() => setActiveTab('global')}
          className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
            activeTab === 'global'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card border-border text-muted-foreground hover:text-foreground')}
        >
          🌍 Global
        </button>
        {maps.slice(0, 12).map((m: GameMap) => (
          <button
            key={m.id}
            onClick={() => setActiveTab(m.id)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
              activeTab === m.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground')}
          >
            {m.name}
          </button>
        ))}
      </div>

      {/* Notes list */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading…</div>
      ) : notes.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <div className="text-3xl mb-2">📋</div>No notes yet for this scope.
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((n: Note) => {
            const when = new Date(n.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            const mapName = n.map_id
              ? maps.find((m: GameMap) => m.id === n.map_id)?.name || `Map #${n.map_id}`
              : '🌍 Global'
            return (
              <div key={n.id} className={cn('p-4 bg-card border rounded-lg', n.pinned ? 'border-yellow-700 bg-yellow-950/10' : 'border-border')}>
                <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                  {n.pinned && <span className="text-yellow-500">📌 PINNED</span>}
                  <span className="font-bold text-purple-400">{n.author}</span>
                  <span>{when}</span>
                  <span className="px-1.5 py-0.5 bg-secondary rounded text-[10px]">{mapName}</span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">{n.body}</p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => pin(n.id)}
                    className={cn('flex items-center gap-1 text-xs px-2 py-0.5 border rounded transition-colors',
                      n.pinned
                        ? 'text-yellow-500 border-yellow-700 hover:bg-yellow-900/20'
                        : 'text-muted-foreground border-border hover:text-foreground')}
                  >
                    <Pin className="w-3 h-3" />{n.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    onClick={() => del(n.id)}
                    className="flex items-center gap-1 text-xs px-2 py-0.5 border border-border rounded text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
