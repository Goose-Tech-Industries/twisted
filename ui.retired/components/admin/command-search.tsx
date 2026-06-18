"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Search, X } from "lucide-react"
import adminApi from "@/lib/admin-api"
import type { AdminSection } from "./admin-sidebar"

interface SearchResult {
  type: string
  id: number | string
  name: string
  icon?: string
  section: AdminSection
}

interface CommandSearchProps {
  onNavigate: (section: AdminSection) => void
}

const SEARCHABLE_TYPES: Array<{ type: string; label: string; section: AdminSection }> = [
  { type: 'item', label: 'Items', section: 'items' },
  { type: 'npc', label: 'NPCs', section: 'npcs' },
  { type: 'map', label: 'Maps', section: 'maps' },
  { type: 'skill', label: 'Skills', section: 'skills' },
  { type: 'quest', label: 'Quests', section: 'quests' },
  { type: 'class', label: 'Classes', section: 'classes' },
  { type: 'race', label: 'Races', section: 'races' },
  { type: 'status', label: 'Statuses', section: 'status' },
  { type: 'shop', label: 'Shops', section: 'shop_supply' },
]

export function CommandSearch({ onNavigate }: CommandSearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [allData, setAllData] = useState<SearchResult[]>([])
  const [loaded, setLoaded] = useState(false)

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Load all searchable data on first open
  useEffect(() => {
    if (!open || loaded) return
    const loadAll = async () => {
      const all: SearchResult[] = []
      for (const t of SEARCHABLE_TYPES) {
        try {
          const r = await adminApi.entity.getAll(t.type as Parameters<typeof adminApi.entity.getAll>[0])
          const data = (r.data || []) as Array<Record<string, unknown>>
          for (const d of data) {
            all.push({
              type: t.label,
              id: d.id as number,
              name: String(d.name || d.title || d.quest_id || `#${d.id}`),
              icon: String(d.icon || ''),
              section: t.section,
            })
          }
        } catch {}
      }
      setAllData(all)
      setLoaded(true)
    }
    loadAll()
  }, [open, loaded])

  // Filter results
  useEffect(() => {
    if (!query.trim()) { setResults(allData.slice(0, 20)); return }
    const q = query.toLowerCase()
    setResults(allData.filter(r =>
      r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q)
    ).slice(0, 20))
  }, [query, allData])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-[15vh]"
      onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search items, NPCs, maps, skills, quests..."
            className="flex-1 bg-transparent text-sm outline-none" autoFocus />
          <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">ESC</kbd>
          <button onClick={() => setOpen(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {!loaded && <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>}
          {loaded && results.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">No results for &quot;{query}&quot;</div>
          )}
          {results.map((r, i) => (
            <button key={`${r.type}-${r.id}-${i}`}
              onClick={() => { onNavigate(r.section); setOpen(false); setQuery('') }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 text-left transition-colors border-b border-border/20">
              <span className="text-lg w-6 text-center">{r.icon || '📄'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.name}</div>
              </div>
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">{r.type}</span>
            </button>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-border/30 text-[10px] text-muted-foreground/50">
          <kbd className="bg-muted px-1 rounded">Cmd+K</kbd> to search · <kbd className="bg-muted px-1 rounded">Esc</kbd> to close
        </div>
      </div>
    </div>
  )
}
