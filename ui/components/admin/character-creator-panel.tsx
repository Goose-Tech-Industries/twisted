"use client"
import { toast } from "@/hooks/use-toast"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Info, Shuffle, Clipboard, Save, Check } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────
interface AppearanceState {
  body:   string
  head:   string
  hair:   string
  armor:  string
  weapon: string
  acc:    string
  colors: {
    skin:  string
    hair:  string
    armor: string
    cloth: string
  }
}

// ── Slot config ───────────────────────────────────────────────────
const SLOTS: Record<string, { label: string; folder: string; icon: string; defaultVal: string }> = {
  body:   { label: 'Body',   folder: 'bodies', icon: '🧍', defaultVal: 'body_human_m' },
  head:   { label: 'Head',   folder: 'heads',  icon: '🗣️', defaultVal: 'head_human_m_01' },
  hair:   { label: 'Hair',   folder: 'hair',   icon: '💇', defaultVal: '' },
  armor:  { label: 'Armor',  folder: 'armor',  icon: '🛡️', defaultVal: '' },
  weapon: { label: 'Weapon', folder: 'weapon', icon: '⚔️',  defaultVal: '' },
  acc:    { label: 'Acc.',   folder: 'acc',    icon: '✨', defaultVal: '' },
}

const COLORS: Record<string, { label: string; defaultVal: string }> = {
  skin:  { label: 'Skin',        defaultVal: '#f5c5a3' },
  hair:  { label: 'Hair Colour', defaultVal: '#4a3728' },
  armor: { label: 'Armor Tint',  defaultVal: '#607d8b' },
  cloth: { label: 'Cloth Tint',  defaultVal: '#5c6bc0' },
}

const LAYER_ORDER: Array<{ key: string; folder: string }> = [
  { key: 'body',   folder: 'bodies' },
  { key: 'head',   folder: 'heads' },
  { key: 'hair',   folder: 'hair' },
  { key: 'armor',  folder: 'armor' },
  { key: 'weapon', folder: 'weapon' },
  { key: 'acc',    folder: 'acc' },
]

const DEFAULT_STATE: AppearanceState = {
  body: 'body_human_m', head: 'head_human_m_01',
  hair: '', armor: '', weapon: '', acc: '',
  colors: { skin: '#f5c5a3', hair: '#4a3728', armor: '#607d8b', cloth: '#5c6bc0' }
}

const BASES = ['human_m','human_f','elf_m','elf_f','orc_m','dwarf_m']
const HAIR_STYLES = ['short_01','long_01','mohawk_01','bald']
const SKIN_TONES  = ['#fde3b4','#d4a574','#8d5524','#3d2a1e']

function Help({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-xs text-blue-300 mb-4">
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}

export function CharacterCreatorPanel({ charId }: { charId?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<AppearanceState>(DEFAULT_STATE)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load existing appearance if charId provided
  useEffect(() => {
    if (!charId) return
    fetch(`/admin-panel/character-appearance/${charId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          setState(prev => ({
            ...prev,
            ...d.data,
            colors: { ...prev.colors, ...(d.data.colors || {}) }
          }))
        }
      })
      .catch(() => {})
  }, [charId])

  // Redraw canvas whenever state changes
  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw placeholder if no body set
    if (!state.body) {
      ctx.fillStyle = '#21262d'
      ctx.beginPath()
      ctx.arc(64, 48, 28, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(36, 80, 56, 72)
      ctx.fillRect(20, 80, 20, 60)
      ctx.fillRect(88, 80, 20, 60)
      ctx.fillRect(36, 154, 22, 38)
      ctx.fillRect(70, 154, 22, 38)
      ctx.fillStyle = '#484f58'
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('No assets', 64, 180)
      return
    }

    const layers = LAYER_ORDER.filter(l => state[l.key as keyof AppearanceState] as string)
    let done = 0

    // Draw layers in order — each loads async but we force sequential via done count
    LAYER_ORDER.forEach(l => {
      const filename = state[l.key as keyof AppearanceState] as string
      if (!filename) return
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        done++
      }
      img.onerror = () => {
        // Red border for missing file
        ctx.strokeStyle = 'rgba(248,81,73,.5)'
        ctx.lineWidth = 2
        ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4)
        done++
      }
      img.src = `/assets/sprites/characters/${l.folder}/${filename}.png?t=${Date.now()}`
    })
  }, [state])

  useEffect(() => { drawPreview() }, [drawPreview])

  const set = (key: string, value: string) => {
    setState(prev => ({ ...prev, [key]: value.trim() }))
  }

  const setColor = (key: string, value: string) => {
    setState(prev => ({ ...prev, colors: { ...prev.colors, [key]: value } }))
  }

  const randomize = () => {
    const base = BASES[Math.floor(Math.random() * BASES.length)]
    const hairStyle = HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)]
    const skin = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)]
    setState(prev => ({
      ...prev,
      body:   `body_${base}`,
      head:   `head_${base}_0${Math.ceil(Math.random() * 3)}`,
      hair:   `hair_${hairStyle}`,
      colors: { ...prev.colors, skin }
    }))
  }

  const copyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(state, null, 2))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
      .catch(() => toast({ title: 'Could not copy to clipboard', variant: 'destructive' }))
  }

  const saveToCharacter = async () => {
    if (!charId) return
    setSaving(true)
    try {
      const r = await fetch('/update-appearance', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ charId, appearance: state })
      })
      const d = await r.json()
      if (d.success) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
      else toast({ title: String(d.message || 'Save failed'), variant: 'destructive' })
    } catch (e) { toast({ title: 'Save error', variant: 'destructive' }) }
    setSaving(false)
  }

  const jsonPreview = JSON.stringify(state, null, 2)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">🧍 Character Creator</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {charId ? `Editing character #${charId}` : 'Preview mode — build appearance_json'}
          </p>
        </div>
      </div>

      <Help>
        Enter the <b>filename without extension</b> for each layer. Files must exist at
        <code className="text-green-400 mx-1">/assets/sprites/characters/[folder]/[name].png</code>
        on the server. Leave a slot blank to skip that layer.
        Layers render bottom to top: body → head → hair → armor → weapon → accessory.
        This is the same system players use in-game — what you see here is exactly what they see.
      </Help>

      <div className="flex gap-6 items-start flex-col lg:flex-row">

        {/* ── Left: Preview + colors ── */}
        <div className="w-full lg:w-72 shrink-0 space-y-4">
          <div className="p-4 bg-card border border-border rounded-lg flex flex-col items-center gap-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Preview</div>
            <canvas ref={canvasRef} width={128} height={192}
              className="border border-border rounded-lg"
              style={{
                width: 128, height: 192,
                background: '#1a1a2e',
                imageRendering: 'pixelated',
              }} />
            <p className="text-[10px] text-muted-foreground text-center">128×192px · layers drawn bottom→top</p>
          </div>

          <div className="p-4 bg-card border border-border rounded-lg space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">🎨 Colours</div>
            {Object.entries(COLORS).map(([key, col]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-20 shrink-0">{col.label}</span>
                <input type="color" value={state.colors[key as keyof typeof state.colors] || col.defaultVal}
                  onChange={e => setColor(key, e.target.value)}
                  className="w-8 h-7 rounded border-0 cursor-pointer bg-transparent p-0" />
                <Input value={state.colors[key as keyof typeof state.colors] || col.defaultVal}
                  onChange={e => setColor(key, e.target.value)}
                  className="flex-1 h-7 text-xs font-mono" />
              </div>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={randomize} variant="outline" className="flex-1">
              <Shuffle className="w-4 h-4 mr-1.5" />Randomize
            </Button>
            <Button onClick={copyJSON} variant="outline" className="flex-1">
              {copied ? <Check className="w-4 h-4 mr-1.5 text-green-400" /> : <Clipboard className="w-4 h-4 mr-1.5" />}
              {copied ? 'Copied!' : 'Copy JSON'}
            </Button>
          </div>

          {charId && (
            <Button onClick={saveToCharacter} disabled={saving} className="w-full">
              {saved
                ? <><Check className="w-4 h-4 mr-1.5 text-green-400" />Saved!</>
                : <><Save className="w-4 h-4 mr-1.5" />{saving ? 'Saving…' : 'Save to Character'}</>
              }
            </Button>
          )}
        </div>

        {/* ── Right: Slot controls + JSON ── */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="p-4 bg-card border border-border rounded-lg space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">🗂️ Sprite Slots</div>
            <div className="p-3 bg-secondary/20 rounded-lg text-xs text-muted-foreground leading-relaxed">
              Enter the filename <b className="text-foreground">without .png</b> for each layer.
              Files live at <code className="text-green-400">/assets/sprites/characters/[folder]/[name].png</code>
              A red border on the preview means that file isn't found on the server.
            </div>
            {Object.entries(SLOTS).map(([key, slot]) => (
              <div key={key} className="p-3 bg-secondary/20 rounded-lg border border-border space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">{slot.icon}</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{slot.label}</span>
                </div>
                <div className="flex gap-2">
                  <Input value={state[key as keyof AppearanceState] as string || ''}
                    onChange={e => set(key, e.target.value)}
                    placeholder={`filename (no .png) e.g. ${slot.defaultVal || slot.folder + '_01'}`}
                    className="flex-1 h-8 text-xs font-mono" />
                  <Button size="sm" variant="ghost" onClick={() => set(key, '')}
                    className="h-8 px-2 text-muted-foreground hover:text-foreground">✕</Button>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono">
                  /assets/sprites/characters/{slot.folder}/<span className="text-purple-400">{(state[key as keyof AppearanceState] as string) || slot.defaultVal || '…'}</span>.png
                </p>
              </div>
            ))}
          </div>

          <div className="p-4 bg-card border border-border rounded-lg">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">📄 Appearance JSON (live)</div>
            <pre className="text-[11px] font-mono text-muted-foreground bg-black/40 rounded-lg p-3 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
              {jsonPreview}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
