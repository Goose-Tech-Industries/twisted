"use client"
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Pencil, Trash2, RefreshCw, X } from "lucide-react"

interface GameMap { id: number; name: string; width: number; height: number }
interface Connection {
  sourceMapId: number; srcX: number; srcY: number
  destMapId: number; destMapName: string; destX: number; destY: number
}
interface TeleportEvent { type: string; x: number; y: number; data?: string }
type ModalState = { mode: 'add' | 'edit'; srcMapId?: number; srcX?: number; srcY?: number; presetMapId?: number } | null

const eventCache: Record<number, TeleportEvent[]> = {}

async function req(method: string, url: string, data?: unknown): Promise<Record<string, unknown>> {
  const opts: RequestInit = { method, credentials: 'include', headers: { 'Content-Type': 'application/json' } }
  if (data) opts.body = JSON.stringify(data)
  return (await fetch(url, opts)).json()
}

async function getEvents(mapId: number): Promise<TeleportEvent[]> {
  if (eventCache[mapId]) return eventCache[mapId]
  const r = await fetch('/admin-panel/map', { credentials: 'include' })
  const d: Record<string, unknown> = await r.json()
  if (d.success) {
    for (const m of (d.data || []) as Array<{ id: number; collisions_json: string }>) {
      try { eventCache[m.id] = JSON.parse(m.collisions_json || '[]') as TeleportEvent[] }
      catch { eventCache[m.id] = [] }
    }
  }
  return eventCache[mapId] || []
}

async function saveEvents(mapId: number, events: TeleportEvent[]): Promise<Record<string, unknown>> {
  eventCache[mapId] = events
  return req('POST', '/admin-panel/map-connections/save', { mapId, events })
}

interface WarpModalProps {
  maps: GameMap[]
  initial?: { srcMapId?: number; srcX?: number; srcY?: number; dstMapId?: number; dstX?: number; dstY?: number }
  mode: 'add' | 'edit'
  onSave: (data: { srcMapId: number; srcX: number; srcY: number; dstMapId: number; dstX: number; dstY: number }) => void
  onClose: () => void
}

function WarpModal({ maps, initial, mode, onSave, onClose }: WarpModalProps) {
  const [srcMapId, setSrcMapId] = useState(initial?.srcMapId || maps[0]?.id || 0)
  const [srcX,     setSrcX]     = useState(initial?.srcX || 0)
  const [srcY,     setSrcY]     = useState(initial?.srcY || 0)
  const [dstMapId, setDstMapId] = useState(initial?.dstMapId || maps[0]?.id || 0)
  const [dstX,     setDstX]     = useState(initial?.dstX || 0)
  const [dstY,     setDstY]     = useState(initial?.dstY || 0)
  const [saving,   setSaving]   = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave({ srcMapId, srcX, srcY, dstMapId, dstX, dstY })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-primary">{mode === 'add' ? '🚪 Add Warp Connection' : '✏️ Edit Warp'}</h3>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Player steps on (Src X, Src Y) → teleported to destination.</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {mode === 'add' && (
            <div className="col-span-2">
              <label className="text-sm font-medium">Source Map</label>
              <select
                value={srcMapId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSrcMapId(parseInt(e.target.value))}
                className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm"
              >
                {maps.map((m: GameMap) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Source X</label>
            <Input type="number" min={0} value={srcX}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSrcX(parseInt(e.target.value) || 0)}
              className="mt-1" readOnly={mode === 'edit'} />
          </div>
          <div>
            <label className="text-sm font-medium">Source Y</label>
            <Input type="number" min={0} value={srcY}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSrcY(parseInt(e.target.value) || 0)}
              className="mt-1" readOnly={mode === 'edit'} />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium">Destination Map</label>
            <select
              value={dstMapId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDstMapId(parseInt(e.target.value))}
              className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm"
            >
              {maps.map((m: GameMap) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Destination X</label>
            <Input type="number" min={0} value={dstX}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDstX(parseInt(e.target.value) || 0)}
              className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Destination Y</label>
            <Input type="number" min={0} value={dstY}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDstY(parseInt(e.target.value) || 0)}
              className="mt-1" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          💡 For a two-way connection, add a return warp on the destination map too.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Connection'}</Button>
        </div>
      </div>
    </div>
  )
}

export function MapConnectionsPanel() {
  const [maps,    setMaps]    = useState<GameMap[]>([])
  const [conns,   setConns]   = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState<ModalState>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await req('GET', '/admin-panel/map-connections')
    if (r.success) {
      setMaps((r.maps || []) as GameMap[])
      setConns((r.connections || []) as Connection[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const byMap: Record<number, Connection[]> = {}
  for (const c of conns) {
    if (!byMap[c.sourceMapId]) byMap[c.sourceMapId] = []
    byMap[c.sourceMapId].push(c)
  }

  const handleSave = async (data: { srcMapId: number; srcX: number; srcY: number; dstMapId: number; dstX: number; dstY: number }) => {
    const events = await getEvents(data.srcMapId)
    const cleaned = events.filter((e: TeleportEvent) =>
      !(e.type === 'TELEPORT' && e.x === data.srcX && e.y === data.srcY)
    )
    cleaned.push({ x: data.srcX, y: data.srcY, type: 'TELEPORT', data: `${data.dstMapId},${data.dstX},${data.dstY}` })
    const res = await saveEvents(data.srcMapId, cleaned)
    if (res.success) { setModal(null); load() }
    else alert('Save failed: ' + String(res.message))
  }

  const deleteWarp = async (mapId: number, srcX: number, srcY: number) => {
    if (!confirm(`Delete warp at (${srcX}, ${srcY})?`)) return
    const events = await getEvents(mapId)
    const cleaned = events.filter((e: TeleportEvent) =>
      !(e.type === 'TELEPORT' && e.x === srcX && e.y === srcY)
    )
    const res = await saveEvents(mapId, cleaned)
    if (res.success) load()
    else alert('Delete failed: ' + String(res.message))
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">🗺️ Map Connections</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {conns.length} warp{conns.length !== 1 ? 's' : ''} across {maps.length} map{maps.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setModal({ mode: 'add' })}>
            <Plus className="w-4 h-4 mr-1" />Add Connection
          </Button>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[80px_80px_24px_1fr_80px_80px_72px] gap-2 px-3 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Src X</span><span>Src Y</span><span />
        <span>Destination Map</span><span>Dest X</span><span>Dest Y</span><span />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-3">
          {maps.map((m: GameMap) => {
            const warps = byMap[m.id] || []
            return (
              <div key={m.id} className="p-4 bg-card border border-border rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-semibold text-sm">🗺️ {m.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ID:{m.id} · {m.width}×{m.height} · {warps.length} warp{warps.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setModal({ mode: 'add', presetMapId: m.id })}>
                    <Plus className="w-3.5 h-3.5 mr-1" />Add Warp
                  </Button>
                </div>
                {warps.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No warps on this map.</p>
                ) : warps.map((c: Connection, ci: number) => (
                  <div key={ci} className="grid grid-cols-[80px_80px_24px_1fr_80px_80px_72px] gap-2 items-center bg-secondary/20 rounded px-2 py-2 mb-1.5 text-xs">
                    <span className="font-mono text-primary">x:{c.srcX}</span>
                    <span className="font-mono text-primary">y:{c.srcY}</span>
                    <span className="text-muted-foreground text-center">→</span>
                    <span className="text-purple-400 font-medium truncate">{c.destMapName}</span>
                    <span className="font-mono text-primary">x:{c.destX}</span>
                    <span className="font-mono text-primary">y:{c.destY}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                        onClick={() => setModal({ mode: 'edit', srcMapId: m.id, srcX: c.srcX, srcY: c.srcY })}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <button
                        onClick={() => deleteWarp(m.id, c.srcX, c.srcY)}
                        className="h-6 w-6 flex items-center justify-center text-destructive hover:bg-destructive/10 rounded transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <WarpModal
          maps={maps}
          mode={modal.mode}
          initial={modal.mode === 'edit' ? {
            srcMapId: modal.srcMapId!, srcX: modal.srcX!, srcY: modal.srcY!,
            dstMapId: conns.find((c: Connection) =>
              c.sourceMapId === modal.srcMapId && c.srcX === modal.srcX && c.srcY === modal.srcY
            )?.destMapId || maps[0]?.id || 0,
            dstX: conns.find((c: Connection) =>
              c.sourceMapId === modal.srcMapId && c.srcX === modal.srcX && c.srcY === modal.srcY
            )?.destX || 0,
            dstY: conns.find((c: Connection) =>
              c.sourceMapId === modal.srcMapId && c.srcX === modal.srcX && c.srcY === modal.srcY
            )?.destY || 0,
          } : { srcMapId: modal.presetMapId || maps[0]?.id || 0 }}
          onSave={(data) => handleSave({ ...data, srcMapId: modal.srcMapId || data.srcMapId })}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
