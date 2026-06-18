"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import adminApi from "@/lib/admin-api"
import { cn } from "@/lib/utils"
import { Plus, Trash2, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface WorldInfo {
  id: number; name: string; icon: string; description: string; is_active: boolean
}

interface RegionInfo {
  id: number; name: string; icon: string; world_id: number; danger_level: number
}

interface MapNode {
  id: number; name: string; width: number; height: number
  region_id: number | null
  teleports: Array<{ destMapId: number }>
}

const NODE_W = 130
const NODE_H = 55
const PADDING = 40

export function WorldMapPanel({ onOpenMap }: { onOpenMap?: (mapId: number) => void }) {
  const [worlds, setWorlds] = useState<WorldInfo[]>([])
  const [regions, setRegions] = useState<RegionInfo[]>([])
  const [maps, setMaps] = useState<MapNode[]>([])
  const [activeWorld, setActiveWorld] = useState<number>(1)
  const [positions, setPositions] = useState<Record<number, { x: number; y: number }>>({})
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [showWorldForm, setShowWorldForm] = useState(false)
  const [newWorldName, setNewWorldName] = useState('')
  const [editingWorld, setEditingWorld] = useState<WorldInfo | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const svgRef = useRef<SVGSVGElement>(null)

  const load = useCallback(async () => {
    const [worldRes, regionRes, mapRes] = await Promise.all([
      adminApi.entity.getAll('world'),
      adminApi.entity.getAll('region'),
      adminApi.entity.getAll('map'),
    ])
    const w = (worldRes.data || []) as Array<Record<string, unknown>>
    const r = (regionRes.data || []) as Array<Record<string, unknown>>
    const m = (mapRes.data || []) as Array<Record<string, unknown>>

    setWorlds(w.map(x => ({
      id: Number(x.id), name: String(x.name), icon: String(x.icon || '🌍'),
      description: String(x.description || ''), is_active: !!x.is_active,
    })))

    setRegions(r.map(x => ({
      id: Number(x.id), name: String(x.name), icon: String(x.icon || '📍'),
      world_id: Number(x.world_id || 1), danger_level: Number(x.danger_level || 1),
    })))

    const nodes: MapNode[] = m.map(x => {
      let teleports: MapNode['teleports'] = []
      try {
        const events = JSON.parse(String(x.collisions_json || '[]')) as Array<Record<string, unknown>>
        teleports = events
          .filter(e => e.type === 'TELEPORT' && e.data)
          .map(e => ({ destMapId: Number(String(e.data).split(',')[0]) }))
          .filter(t => !isNaN(t.destMapId))
      } catch {}
      return { id: Number(x.id), name: String(x.name), width: Number(x.width), height: Number(x.height), region_id: x.region_id ? Number(x.region_id) : null, teleports }
    })
    setMaps(nodes)

    if (w.length && !w.find(x => Number(x.id) === activeWorld)) setActiveWorld(Number(w[0].id))

    // Load saved positions
    const saved = localStorage.getItem('worldmap_positions')
    if (saved) { try { setPositions(JSON.parse(saved)) } catch {} }
  }, [activeWorld])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (Object.keys(positions).length > 0) localStorage.setItem('worldmap_positions', JSON.stringify(positions))
  }, [positions])

  // Auto-layout for maps that don't have saved positions
  useEffect(() => {
    const worldRegions = regions.filter(r => r.world_id === activeWorld)
    const worldRegionIds = new Set(worldRegions.map(r => r.id))
    const worldMaps = maps.filter(m => m.region_id && worldRegionIds.has(m.region_id))
    const missing = worldMaps.filter(m => !positions[m.id])
    if (!missing.length) return

    const pos = { ...positions }
    const regionGroups: Record<number, number[]> = {}
    worldMaps.forEach(m => {
      const rid = m.region_id || 0
      if (!regionGroups[rid]) regionGroups[rid] = []
      regionGroups[rid].push(m.id)
    })

    let gx = PADDING
    for (const [, ids] of Object.entries(regionGroups)) {
      const cols = Math.ceil(Math.sqrt(ids.length))
      ids.forEach((id, i) => {
        if (pos[id]) return
        pos[id] = { x: gx + (i % cols) * (NODE_W + 25), y: PADDING + 50 + Math.floor(i / cols) * (NODE_H + 35) }
      })
      gx += Math.min(ids.length, cols) * (NODE_W + 25) + 70
    }
    // Unassigned maps
    const unassigned = maps.filter(m => !m.region_id || !worldRegionIds.has(m.region_id)).filter(m => !pos[m.id])
    unassigned.forEach((m, i) => {
      pos[m.id] = { x: PADDING + i * (NODE_W + 20), y: PADDING + 400 }
    })
    setPositions(pos)
  }, [maps, regions, activeWorld])

  const handleMouseDown = (mapId: number, e: React.MouseEvent) => {
    e.preventDefault()
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const pos0 = positions[mapId] || { x: 0, y: 0 }
    setDragging(mapId)
    setDragOffset({ x: e.clientX - rect.left - pos0.x, y: e.clientY - rect.top - pos0.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging === null) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    setPositions(prev => ({
      ...prev,
      [dragging]: { x: Math.max(0, e.clientX - rect.left - dragOffset.x), y: Math.max(0, e.clientY - rect.top - dragOffset.y) }
    }))
  }

  const handleMouseUp = () => setDragging(null)

  const createWorld = async () => {
    if (!newWorldName.trim()) return
    await adminApi.entity.save('world', { name: newWorldName, icon: '🌍', description: '', is_active: 1 } as Record<string, unknown>)
    setNewWorldName('')
    setShowWorldForm(false)
    load()
  }

  const saveWorld = async () => {
    if (!editingWorld || !editName.trim()) return
    await adminApi.entity.save('world', { name: editName, icon: editIcon || '🌍', description: editDesc } as Record<string, unknown>, editingWorld.id)
    setEditingWorld(null)
    load()
  }

  const deleteWorld = async (w: WorldInfo) => {
    if (!confirm(`Delete world "${w.name}"?\n\nThis will NOT delete regions or maps — they will become unassigned. You can reassign them to another world.`)) return
    await adminApi.entity.delete('world', w.id)
    if (activeWorld === w.id && worlds.length > 1) setActiveWorld(worlds.find(x => x.id !== w.id)?.id || 1)
    load()
  }

  const startEditWorld = (w: WorldInfo) => {
    setEditingWorld(w)
    setEditName(w.name)
    setEditIcon(w.icon)
    setEditDesc(w.description)
  }

  // Filter to active world
  const worldRegions = regions.filter(r => r.world_id === activeWorld)
  const worldRegionIds = new Set(worldRegions.map(r => r.id))
  const worldMaps = maps.filter(m => m.region_id && worldRegionIds.has(m.region_id))
  const unassignedMaps = maps.filter(m => !m.region_id || !worldRegionIds.has(m.region_id))

  // Region colors
  const palette = ['#8a0000', '#006644', '#003366', '#664400', '#440066', '#006666', '#660044', '#446600', '#004466', '#660000']
  const regionColors: Record<number, string> = {}
  worldRegions.forEach((r, i) => { regionColors[r.id] = palette[i % palette.length] })

  // Connections (within visible maps only)
  const visibleIds = new Set([...worldMaps, ...unassignedMaps].map(m => m.id))
  const connections: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> = []
  const seen = new Set<string>()
  ;[...worldMaps, ...unassignedMaps].forEach(m => {
    m.teleports.forEach(t => {
      if (!visibleIds.has(t.destMapId)) return
      const key = [Math.min(m.id, t.destMapId), Math.max(m.id, t.destMapId)].join('-')
      if (seen.has(key)) return
      seen.add(key)
      const from = positions[m.id], to = positions[t.destMapId]
      if (from && to) {
        connections.push({
          from: { x: from.x + NODE_W / 2, y: from.y + NODE_H / 2 },
          to: { x: to.x + NODE_W / 2, y: to.y + NODE_H / 2 },
        })
      }
    })
  })

  const allPos = Object.values(positions)
  const svgW = Math.max(900, ...allPos.map(p => p.x + NODE_W + PADDING))
  const svgH = Math.max(500, ...allPos.map(p => p.y + NODE_H + PADDING))

  const renderNode = (m: MapNode) => {
    const pos = positions[m.id]
    if (!pos) return null
    const regionColor = regionColors[m.region_id || 0] || '#333'
    return (
      <g key={m.id} onMouseDown={e => handleMouseDown(m.id, e)} style={{ cursor: dragging === m.id ? 'grabbing' : 'grab' }}>
        <rect x={pos.x + 2} y={pos.y + 2} width={NODE_W} height={NODE_H} rx={6} fill="rgba(0,0,0,0.3)" />
        <rect x={pos.x} y={pos.y} width={NODE_W} height={NODE_H} rx={6}
          fill="#1a1a1a" stroke={regionColor} strokeWidth={2}
          onClick={() => onOpenMap?.(m.id)} className="cursor-pointer" />
        <rect x={pos.x} y={pos.y} width={5} height={NODE_H} rx={3} fill={regionColor} />
        <text x={pos.x + 12} y={pos.y + 18} fill="#e0e0e0" fontSize={11} fontWeight="bold"
          onClick={() => onOpenMap?.(m.id)} className="cursor-pointer">
          {m.name.length > 15 ? m.name.slice(0, 14) + '…' : m.name}
        </text>
        <text x={pos.x + 12} y={pos.y + 32} fill="#777" fontSize={9}>{m.width}×{m.height}</text>
        {m.teleports.length > 0 && (
          <text x={pos.x + NODE_W - 10} y={pos.y + 32} fill="#999" fontSize={9} textAnchor="end">🚪{m.teleports.length}</text>
        )}
        <text x={pos.x + NODE_W - 10} y={pos.y + 16} fill="#444" fontSize={8} textAnchor="end">#{m.id}</text>
      </g>
    )
  }

  return (
    <div className="p-4">
      {/* World selector */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <h3 className="text-lg font-bold mr-2">World Map</h3>
        {worlds.map(w => (
          <div key={w.id} className="flex items-center gap-0 group">
            <button onClick={() => setActiveWorld(w.id)}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg text-sm font-medium transition-colors border",
                activeWorld === w.id
                  ? "bg-primary/15 text-primary border-primary/40"
                  : "text-muted-foreground border-border hover:text-foreground hover:bg-muted/20"
              )}>
              {w.icon} {w.name}
            </button>
            <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => startEditWorld(w)}
                className="px-1.5 py-1.5 border-y border-border text-muted-foreground hover:text-foreground text-[10px]"
                title="Edit world">
                <Settings className="w-3 h-3" />
              </button>
              <button onClick={() => deleteWorld(w)}
                className="px-1.5 py-1.5 border border-border rounded-r-lg text-muted-foreground hover:text-destructive text-[10px]"
                title="Delete world">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
        <button onClick={() => setShowWorldForm(!showWorldForm)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground border border-dashed border-border hover:text-foreground hover:border-primary/40 transition-colors">
          <Plus className="w-3.5 h-3.5" /> New World
        </button>
      </div>

      {/* Create world form */}
      {showWorldForm && (
        <div className="flex items-center gap-2 mb-3 p-3 bg-card border border-border rounded-lg">
          <Input value={newWorldName} onChange={e => setNewWorldName(e.target.value)} placeholder="World name (e.g. Planet Namek)" className="h-8 text-sm w-64" />
          <Button size="sm" onClick={createWorld}>Create</Button>
          <Button size="sm" variant="outline" onClick={() => setShowWorldForm(false)}>Cancel</Button>
        </div>
      )}

      {/* Edit world form */}
      {editingWorld && (
        <div className="mb-3 p-4 bg-card border border-primary/30 rounded-lg space-y-3">
          <h4 className="text-sm font-semibold text-primary">Edit World: {editingWorld.name}</h4>
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Name</label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="mt-1 h-8" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Icon (emoji)</label>
              <Input value={editIcon} onChange={e => setEditIcon(e.target.value)} placeholder="🌍" className="mt-1 h-8" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Description</label>
            <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="A brief description of this world..." className="mt-1 h-8" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveWorld}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => setEditingWorld(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Region legend */}
      <div className="flex items-center gap-3 mb-3 text-xs flex-wrap">
        <span className="text-muted-foreground">Regions:</span>
        {worldRegions.map(r => (
          <span key={r.id} className="flex items-center gap-1 px-2 py-0.5 rounded border border-border/50">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: regionColors[r.id] }} />
            {r.icon} {r.name}
            <span className="text-muted-foreground/60 text-[10px]">⚠{r.danger_level}</span>
          </span>
        ))}
        {worldRegions.length === 0 && <span className="text-muted-foreground/50 italic">No regions in this world. Create regions and assign them.</span>}
        <span className="text-muted-foreground/40 ml-auto text-[10px]">Drag maps to arrange · Click to edit · Lines = teleport connections</span>
      </div>

      {/* SVG Canvas */}
      <div className="border border-border rounded-lg overflow-auto bg-[#080810]" style={{ maxHeight: '65vh' }}>
        <svg ref={svgRef} width={svgW} height={svgH} className="select-none"
          onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>

          {/* Region group backgrounds */}
          {worldRegions.map(r => {
            const rMaps = worldMaps.filter(m => m.region_id === r.id)
            if (!rMaps.length) return null
            const rPositions = rMaps.map(m => positions[m.id]).filter(Boolean)
            if (!rPositions.length) return null
            const minX = Math.min(...rPositions.map(p => p.x)) - 15
            const minY = Math.min(...rPositions.map(p => p.y)) - 30
            const maxX = Math.max(...rPositions.map(p => p.x)) + NODE_W + 15
            const maxY = Math.max(...rPositions.map(p => p.y)) + NODE_H + 15
            return (
              <g key={`rg-${r.id}`}>
                <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} rx={12}
                  fill={regionColors[r.id] + '08'} stroke={regionColors[r.id] + '30'} strokeWidth={1} strokeDasharray="8,4" />
                <text x={minX + 8} y={minY + 16} fill={regionColors[r.id] + '80'} fontSize={10} fontWeight="bold">
                  {r.icon} {r.name}
                </text>
              </g>
            )
          })}

          {/* Connection lines */}
          {connections.map((c, i) => (
            <line key={i} x1={c.from.x} y1={c.from.y} x2={c.to.x} y2={c.to.y}
              stroke="#444" strokeWidth={1.5} strokeDasharray="6,4" />
          ))}

          {/* Map nodes */}
          {worldMaps.map(renderNode)}

          {/* Unassigned maps */}
          {unassignedMaps.length > 0 && (
            <>
              <text x={PADDING} y={svgH - 60} fill="#555" fontSize={10}>Unassigned Maps (no region)</text>
              {unassignedMaps.map(renderNode)}
            </>
          )}
        </svg>
      </div>
    </div>
  )
}
