"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Upload, Trash2, Image, Music, Volume2, Grid3x3, Search, X, Check, CheckSquare, Square } from "lucide-react"
import { toast } from "@/hooks/use-toast"

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface Asset {
  id: number; filename: string; original_name: string
  file_url: string; file_type: string; mime_type: string
  file_size: number; tags: string[]; category: string
  description: string; created_at: string
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  sprite: Image, portrait: Image, tileset: Grid3x3,
  icon: Image, background: Image, sound: Volume2,
  music: Music, effect: Volume2, ui: Image,
}
const TYPES = ['sprite','portrait','tileset','icon','background','sound','music','effect','ui']

export function AssetManagerPanel() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('')
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadType, setUploadType] = useState('sprite')
  const [uploadCategory, setUploadCategory] = useState('general')
  const [uploadDesc, setUploadDesc] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Asset | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [filterCategory, setFilterCategory] = useState<string>('')

  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const url = `${API}/assets-api/list${filterType ? `?type=${filterType}` : ''}`
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) { setLoadError(`Server error (${res.status})`); setLoading(false); return }
      const data = await res.json()
      if (data.success) { setAssets(data.assets || []); setLoadError(null) }
      else setLoadError(data.message || 'Failed to load assets')
    } catch { setLoadError('Could not reach server') }
    setLoading(false)
  }, [filterType])

  useEffect(() => { load() }, [load])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('file_type', uploadType)
      form.append('category', uploadCategory)
      form.append('description', uploadDesc)

      const res = await fetch(`${API}/assets-api/upload`, {
        method: 'POST', credentials: 'include', body: form
      })
      if (!res.ok) { setLoadError(`Upload server error (${res.status})`); setUploading(false); return }
      const data = await res.json()
      if (data.success) {
        load()
        setUploadDesc('')
        setLoadError(null)
      } else {
        setLoadError(data.message || 'Upload failed')
      }
    } catch { setLoadError('Upload error — could not reach server') }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const deleteAsset = async (id: number) => {
    if (!confirm('Delete this asset?')) return
    try {
      const res = await fetch(`${API}/assets-api/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) { setLoadError(`Delete failed (${res.status})`); return }
      const data = await res.json()
      if (data.success) { setPreview(null); load() }
      else setLoadError(data.message || 'Delete failed')
    } catch { setLoadError('Delete error — could not reach server') }
  }

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const bulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} selected asset${selected.size > 1 ? 's' : ''}?`)) return
    let deleted = 0
    for (const id of selected) {
      try {
        const res = await fetch(`${API}/assets-api/${id}`, { method: 'DELETE', credentials: 'include' })
        if (res.ok) { const d = await res.json(); if (d.success) deleted++ }
      } catch {}
    }
    toast({ title: `Deleted ${deleted} of ${selected.size} assets` })
    setSelected(new Set())
    setPreview(null)
    load()
  }

  const isAudio = (mime: string) => mime?.startsWith('audio/')
  const isImage = (mime: string) => mime?.startsWith('image/')
  const formatSize = (bytes: number) => bytes > 1024*1024 ? `${(bytes/1024/1024).toFixed(1)}MB` : `${(bytes/1024).toFixed(0)}KB`

  const categories = [...new Set(assets.map(a => a.category || 'general').filter(Boolean))].sort()

  const filtered = assets.filter(a => {
    if (filterCategory && (a.category || 'general') !== filterCategory) return false
    const q = search.toLowerCase()
    return (a.original_name || a.filename || '').toLowerCase().includes(q) ||
      (a.description || '').toLowerCase().includes(q) ||
      (a.category || '').toLowerCase().includes(q)
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Asset Manager</h2>
          <p className="text-sm text-muted-foreground">Upload sprites, portraits, tilesets, sounds, music. Assign to game entities.</p>
        </div>
        <div className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded">
          {assets.length} assets
        </div>
      </div>

      {loadError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center justify-between">
          <span>{loadError}</span>
          <button onClick={() => setLoadError(null)} className="text-xs opacity-60 hover:opacity-100 ml-2">dismiss</button>
        </div>
      )}

      {/* Upload Section */}
      <Card className="celtic-border">
        <CardContent className="p-4">
          <h3 className="font-medium text-sm mb-3">Upload New Asset</h3>
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Type</label>
              <select value={uploadType} onChange={e => setUploadType(e.target.value)}
                className="h-8 text-xs bg-input border border-border rounded px-2">
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Category</label>
              <Input value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}
                className="h-8 text-xs w-32" placeholder="general" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground block mb-1">Description</label>
              <Input value={uploadDesc} onChange={e => setUploadDesc(e.target.value)}
                className="h-8 text-xs" placeholder="Optional description..." />
            </div>
            <div>
              <input type="file" ref={fileRef} onChange={handleUpload} className="hidden"
                accept="image/png,image/gif,image/webp,image/jpeg,audio/mpeg,audio/ogg,audio/wav" />
              <Button onClick={() => fileRef.current?.click()} disabled={uploading} size="sm">
                <Upload className="w-3.5 h-3.5 mr-1" />
                {uploading ? 'Uploading...' : 'Upload'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filter + Search */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex gap-1 flex-wrap">
          <Button variant={filterType === '' ? 'default' : 'outline'} size="sm"
            onClick={() => setFilterType('')}>All</Button>
          {TYPES.map(t => (
            <Button key={t} variant={filterType === t ? 'default' : 'outline'} size="sm"
              onClick={() => setFilterType(t)} className="capitalize text-xs">
              {t}
            </Button>
          ))}
        </div>
        {categories.length > 1 && (
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="h-8 text-xs bg-input border border-border rounded px-2">
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <Input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, desc, category..." className="w-56" />
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-secondary/50 border border-border rounded-md px-3 py-2">
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={bulkDelete}>
            <Trash2 className="w-3 h-3" /> Delete Selected
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Asset Grid */}
      {loading ? (
        <div className="text-center text-muted-foreground p-8">Loading assets...</div>
      ) : filtered.length === 0 ? (
        <Card className="celtic-border">
          <CardContent className="p-8 text-center text-muted-foreground">
            No assets found. Upload your first sprite or sound!
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {filtered.map(asset => {
            const Icon = TYPE_ICONS[asset.file_type] || Image
            return (
              <Card key={asset.id} className={cn(
                "celtic-border cursor-pointer overflow-hidden hover:ring-2 hover:ring-primary transition-all",
                preview?.id === asset.id && "ring-2 ring-primary",
                selected.has(asset.id) && "ring-2 ring-blue-500"
              )} onClick={() => setPreview(asset)}>
                <div className="aspect-square bg-muted/30 flex items-center justify-center relative overflow-hidden">
                  <button
                    className="absolute top-1 left-1 z-10 text-muted-foreground hover:text-foreground"
                    onClick={(e) => { e.stopPropagation(); toggleSelect(asset.id) }}>
                    {selected.has(asset.id)
                      ? <CheckSquare className="w-4 h-4 text-blue-500" />
                      : <Square className="w-4 h-4 opacity-40 hover:opacity-100" />
                    }
                  </button>
                  {isImage(asset.mime_type) ? (
                    <img src={`${API}${asset.file_url}`} alt={asset.original_name}
                      className="w-full h-full object-contain image-rendering-pixelated"
                      style={{ imageRendering: 'pixelated' }} />
                  ) : isAudio(asset.mime_type) ? (
                    <Music className="w-8 h-8 text-muted-foreground" />
                  ) : (
                    <Icon className="w-8 h-8 text-muted-foreground" />
                  )}
                  <span className="absolute top-1 right-1 text-[8px] bg-black/60 text-white px-1 rounded">
                    {asset.file_type}
                  </span>
                </div>
                <div className="p-2">
                  <p className="text-[10px] font-medium truncate">{asset.original_name}</p>
                  <p className="text-[9px] text-muted-foreground">{formatSize(asset.file_size)}</p>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Assign Sprite Sub-panel */}
      {/* Preview Sidebar */}
      {preview && (
        <Card className="celtic-border fixed right-4 top-20 w-72 z-50 shadow-2xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm">Asset Details</h3>
              <button onClick={() => setPreview(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {isImage(preview.mime_type) && (
              <div className="bg-muted/30 rounded-lg p-2 mb-3 flex items-center justify-center">
                <img src={`${API}${preview.file_url}`} alt={preview.original_name}
                  className="max-w-full max-h-32 object-contain" style={{ imageRendering: 'pixelated' }} />
              </div>
            )}
            {isAudio(preview.mime_type) && (
              <audio controls className="w-full mb-3" src={`${API}${preview.file_url}`} />
            )}

            <div className="space-y-1 text-xs">
              <p><span className="text-muted-foreground">Name:</span> {preview.original_name}</p>
              <p><span className="text-muted-foreground">Type:</span> {preview.file_type}</p>
              <p><span className="text-muted-foreground">Size:</span> {formatSize(preview.file_size)}</p>
              <p><span className="text-muted-foreground">Category:</span> {preview.category}</p>
              {preview.description && <p><span className="text-muted-foreground">Desc:</span> {preview.description}</p>}
              {preview.tags && preview.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {preview.tags.map(tag => (
                    <span key={tag} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">{tag}</span>
                  ))}
                </div>
              )}
              <p className="text-[9px] text-muted-foreground font-mono break-all">{preview.file_url}</p>
            </div>

            {/* Assign to Entity */}
            {isImage(preview.mime_type) && (
              <AssignSpritePanel assetUrl={preview.file_url} assetId={preview.id} />
            )}

            <div className="flex gap-2 mt-3">
              <Button variant="outline" size="sm" className="flex-1 text-xs"
                onClick={() => navigator.clipboard.writeText(`${API}${preview.file_url}`)}>
                Copy URL
              </Button>
              <Button variant="outline" size="sm" className="text-destructive border-destructive/50 text-xs"
                onClick={() => { deleteAsset(preview.id); setPreview(null) }}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ASSIGN SPRITE PANEL — Assign an asset to NPCs or Characters
// ═══════════════════════════════════════════════════════════════

function AssignSpritePanel({ assetUrl, assetId }: { assetUrl: string; assetId: number }) {
  const [entityType, setEntityType] = useState<'npc' | 'character'>('npc')
  const [entities, setEntities] = useState<Array<{ id: number; name: string; sprite_sheet_url?: string }>>([])
  const [search, setSearch] = useState('')
  const [assigning, setAssigning] = useState<number | null>(null)
  const [frameW, setFrameW] = useState(32)
  const [frameH, setFrameH] = useState(32)

  useEffect(() => {
    const table = entityType === 'npc' ? 'game_npcs' : 'characters'
    fetch(`${API}/admin/entities/${table}?limit=100`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.success) setEntities(data.rows || data.entities || [])
        else setEntities([])
      })
      .catch(() => setEntities([]))
  }, [entityType])

  const filtered = entities.filter(e =>
    !search || (e.name || '').toLowerCase().includes(search.toLowerCase())
  )

  const assignSprite = async (entityId: number) => {
    setAssigning(entityId)
    try {
      const table = entityType === 'npc' ? 'game_npcs' : 'characters'
      // Update sprite_sheet_url + frame dimensions
      const body: Record<string, unknown> = {
        sprite_sheet_url: assetUrl,
        sprite_frame_width: frameW,
        sprite_frame_height: frameH,
      }
      if (entityType === 'npc') {
        body.sprite_asset_id = assetId
      }
      const r = await fetch(`${API}/admin/entities/${table}/${entityId}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (data.success) {
        toast({ title: 'Sprite assigned!', description: `Set on ${entityType} #${entityId}` })
        // Update local state to show checkmark
        setEntities(prev => prev.map(e =>
          e.id === entityId ? { ...e, sprite_sheet_url: assetUrl } : e
        ))
      } else {
        toast({ title: 'Failed', description: data.message || 'Error', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Could not assign sprite', variant: 'destructive' })
    }
    setAssigning(null)
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Assign Sprite</p>

      {/* Entity type toggle */}
      <div className="flex rounded-lg border border-border overflow-hidden text-[10px] mb-2">
        <button onClick={() => setEntityType('npc')}
          className={cn("flex-1 px-2 py-1 transition-colors",
            entityType === 'npc' ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}>NPCs</button>
        <button onClick={() => setEntityType('character')}
          className={cn("flex-1 px-2 py-1 transition-colors",
            entityType === 'character' ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}>Characters</button>
      </div>

      {/* Frame dimensions */}
      <div className="flex gap-2 mb-2">
        <div className="flex-1">
          <label className="text-[9px] text-muted-foreground">Frame W</label>
          <Input type="number" value={frameW} onChange={e => setFrameW(parseInt(e.target.value) || 32)}
            className="h-6 text-xs" />
        </div>
        <div className="flex-1">
          <label className="text-[9px] text-muted-foreground">Frame H</label>
          <Input type="number" value={frameH} onChange={e => setFrameH(parseInt(e.target.value) || 32)}
            className="h-6 text-xs" />
        </div>
      </div>

      {/* Search */}
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder={`Search ${entityType}s...`}
        className="h-7 text-xs mb-2" />

      {/* Entity list */}
      <div className="max-h-40 overflow-y-auto space-y-1">
        {filtered.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-2">No {entityType}s found</p>
        )}
        {filtered.slice(0, 20).map(entity => (
          <div key={entity.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-muted/50 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              {entity.sprite_sheet_url ? (
                <div className="w-5 h-5 rounded overflow-hidden flex-shrink-0 bg-muted">
                  <img src={`${API}${entity.sprite_sheet_url}`} className="w-full h-full object-cover"
                    style={{ imageRendering: 'pixelated' }} alt="" />
                </div>
              ) : (
                <div className="w-5 h-5 rounded bg-muted/50 flex items-center justify-center flex-shrink-0">
                  <Image className="w-3 h-3 text-muted-foreground" />
                </div>
              )}
              <span className="truncate">{entity.name || `#${entity.id}`}</span>
            </div>
            <Button size="sm" variant={entity.sprite_sheet_url === assetUrl ? "default" : "outline"}
              className="h-5 text-[9px] px-2 shrink-0"
              disabled={assigning === entity.id}
              onClick={() => assignSprite(entity.id)}>
              {assigning === entity.id ? '...' : entity.sprite_sheet_url === assetUrl ? <Check className="w-3 h-3" /> : 'Set'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
