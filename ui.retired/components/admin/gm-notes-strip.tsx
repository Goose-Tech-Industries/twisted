"use client"

import { useCallback, useEffect, useState } from "react"
import { PenTool, ChevronDown, ChevronUp, Plus, Pin, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Note {
  id: number; body: string; author: string
  pinned: boolean | number; created_at: string
}

async function req(method: string, url: string, data?: unknown) {
  const opts: RequestInit = { method, credentials: 'include', headers: { 'Content-Type': 'application/json' } }
  if (data && method !== 'GET') opts.body = JSON.stringify(data)
  return (await fetch(url, opts)).json()
}

export function GmNotesStrip() {
  const [notes, setNotes] = useState<Note[]>([])
  const [expanded, setExpanded] = useState(false)
  const [newNote, setNewNote] = useState("")

  const load = useCallback(async () => {
    const r = await req('GET', '/admin-panel/notes')
    if (r.success && Array.isArray(r.data)) {
      setNotes((r.data as Note[]).filter(n => n.pinned).slice(0, 5))
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addNote = async () => {
    if (!newNote.trim()) return
    await req('POST', '/admin-panel/notes', { body: newNote.trim(), pinned: true })
    setNewNote("")
    load()
  }

  const removeNote = async (id: number) => {
    await req('POST', `/admin-panel/notes/${id}/pin`, {})
    load()
  }

  if (notes.length === 0 && !expanded) {
    return (
      <button onClick={() => setExpanded(true)}
        className="w-full h-7 bg-yellow-900/20 border-b border-yellow-800/30 flex items-center justify-center gap-1.5 text-[10px] text-yellow-500/60 hover:text-yellow-400 transition-colors">
        <PenTool className="w-3 h-3" /> Click to add a pinned GM note
      </button>
    )
  }

  return (
    <div className="bg-yellow-900/15 border-b border-yellow-800/30 shrink-0">
      {/* Notes row */}
      <div className="flex items-center gap-2 px-3 py-1 min-h-[28px]">
        <PenTool className="w-3 h-3 text-yellow-500 flex-shrink-0" />
        <div className="flex-1 flex items-center gap-3 overflow-x-auto text-[11px]">
          {notes.map(n => (
            <div key={n.id} className="flex items-center gap-1 flex-shrink-0 group">
              <Pin className="w-2.5 h-2.5 text-yellow-500/50" />
              <span className="text-yellow-200/80">{n.body}</span>
              <span className="text-yellow-500/30 text-[9px]">— {n.author}</span>
              <button onClick={() => removeNote(n.id)}
                className="opacity-0 group-hover:opacity-100 text-yellow-500/40 hover:text-yellow-400 transition-opacity">
                <X className="w-2.5 h-2.5" />
              </button>
              <span className="text-yellow-800/40 ml-1">|</span>
            </div>
          ))}
        </div>
        <button onClick={() => setExpanded(!expanded)}
          className="text-yellow-500/50 hover:text-yellow-400 flex-shrink-0">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Expanded: add new note */}
      {expanded && (
        <div className="px-3 pb-2 flex gap-1">
          <Input value={newNote} onChange={e => setNewNote(e.target.value)}
            placeholder="Add a pinned note for all staff..."
            className="h-7 text-xs flex-1 bg-yellow-900/20 border-yellow-800/30"
            onKeyDown={e => { if (e.key === 'Enter') addNote(); if (e.key === 'Escape') setExpanded(false) }} />
          <Button size="sm" className="h-7 px-2 text-xs bg-yellow-600 hover:bg-yellow-500 text-black" onClick={addNote}>Pin</Button>
        </div>
      )}
    </div>
  )
}
