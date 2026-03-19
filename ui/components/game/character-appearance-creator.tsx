"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, Shuffle, Check } from "lucide-react"

// ── Race-dependent appearance options ─────────────────────────────
interface RaceAppearanceConfig {
  bodyTypes: string[]
  headShapes: string[]
  hairStyles: string[]
  facialHair: string[]
  earType: string
  skinTones: string[]
  hairColors: string[]
  eyeColors: string[]
  warPaint: string[]
  scars: string[]
  extras: string[]  // race-specific (tusks, braids, etc.)
}

const RACE_CONFIGS: Record<string, RaceAppearanceConfig> = {
  Human: {
    bodyTypes: ["Athletic", "Lean", "Broad", "Average"],
    headShapes: ["Round", "Angular", "Square", "Oval"],
    hairStyles: ["Short Crop", "Shoulder Length", "Long Warrior", "Shaved Sides", "Braided", "Bald", "Ponytail", "Messy"],
    facialHair: ["None", "Stubble", "Short Beard", "Full Beard", "Mustache", "Goatee", "Celtic Braided Beard"],
    earType: "round",
    skinTones: ["#f5deb3", "#f5c5a3", "#d2a679", "#c68642", "#8d5524", "#6b3a2a", "#f0d5c2", "#e0b89e"],
    hairColors: ["#1a1a1a", "#4a3728", "#8b6914", "#c4a35a", "#8b0000", "#d2691e", "#f5f5dc", "#708090"],
    eyeColors: ["#4a6741", "#5b7db1", "#6b4226", "#2f4f4f", "#808080", "#8b7355"],
    warPaint: ["None", "Woad Stripes", "Eye Lines", "Half Face", "Spiral Marks", "Ogham Script"],
    scars: ["None", "Eye Scar", "Cheek Slash", "Forehead Mark", "Lip Scar", "Battle Worn"],
    extras: [],
  },
  Elf: {
    bodyTypes: ["Slender", "Graceful", "Willowy", "Lithe"],
    headShapes: ["Narrow", "Elegant", "Heart", "Refined"],
    hairStyles: ["Long Flowing", "Silver Cascade", "Half-Up", "Elven Braids", "Side Swept", "Twin Tails", "Cropped Fae", "Windswept"],
    facialHair: ["None"],
    earType: "pointed",
    skinTones: ["#fce4ec", "#e8d5e0", "#c9b8d4", "#f5efe0", "#d4c5a9", "#b0c4b1", "#f0e6ff", "#e0f0e0"],
    hairColors: ["#e8e8e8", "#c0c0c0", "#ffd700", "#b8860b", "#2f4f4f", "#4a0080", "#c2f0ff", "#1a1a3e"],
    eyeColors: ["#7fff00", "#00bfff", "#daa520", "#9370db", "#ff69b4", "#e0e0e0"],
    warPaint: ["None", "Leaf Marks", "Starlight Dots", "Moon Crescents", "Vine Pattern", "Fae Glyphs"],
    scars: ["None", "Faded Cut", "Arcane Burn"],
    extras: ["Pointed Ears (Short)", "Pointed Ears (Long)", "Pointed Ears (Swept)"],
  },
  Dwarf: {
    bodyTypes: ["Stocky", "Barrel-Chested", "Compact", "Stout"],
    headShapes: ["Broad", "Square-Jaw", "Round", "Craggy"],
    hairStyles: ["Long Braids", "Warrior Crest", "Tied Back", "Wild Mane", "Twin Braids", "Shaved Runes", "Mohawk Braid", "Bald"],
    facialHair: ["Full Beard", "Braided Beard", "Fork Beard", "Ancestral Beard", "Iron Beard", "Warrior Mustache", "Stubble", "None"],
    earType: "round",
    skinTones: ["#d4a574", "#c68642", "#b87a50", "#e8c8a0", "#a0724a", "#8b6b42", "#dbb896", "#c49a6c"],
    hairColors: ["#8b0000", "#4a3728", "#b87333", "#1a1a1a", "#d4a574", "#708090", "#c0c0c0", "#e0c060"],
    eyeColors: ["#6b4226", "#2f4f4f", "#808080", "#c0c0c0", "#4a6741", "#8b7355"],
    warPaint: ["None", "Clan Marks", "Forge Soot", "Rune Tattoos", "Stone Pattern", "Ancestor Lines"],
    scars: ["None", "Forge Burns", "Battle Scars", "Mining Marks", "Axe Wound", "Deep Gouges"],
    extras: ["Nose Ring", "Brow Piercing", "Ear Rings", "Beard Rings"],
  },
  Orc: {
    bodyTypes: ["Massive", "Muscular", "Hulking", "Scarred Brute"],
    headShapes: ["Heavy Brow", "Jutting Jaw", "Flat Face", "Scarred"],
    hairStyles: ["Mohawk", "Topknot", "Shaved", "War Braids", "Dreadlocks", "Bone-Tied", "Wild", "Bald"],
    facialHair: ["None", "Tusked Only", "Chin Strap", "War Stubble", "Jaw Braids"],
    earType: "pointed-small",
    skinTones: ["#4a7a3d", "#5c8a4a", "#3d6b32", "#6b8b5e", "#556b2f", "#8fbc8f", "#2e4a2e", "#7a9a6a"],
    hairColors: ["#1a1a1a", "#2f1f0f", "#4a0000", "#e0e0e0", "#3d3d3d", "#5c3a1e"],
    eyeColors: ["#ff4500", "#ffd700", "#8b0000", "#ff6600", "#7fff00", "#ff0000"],
    warPaint: ["None", "Blood Marks", "Skull Paint", "War Lines", "Trophy Marks", "Tribal Bands"],
    scars: ["None", "Ritual Scars", "Claw Marks", "Brand Mark", "Battle Trophy", "War Wounds", "Missing Ear"],
    extras: ["Small Tusks", "Large Tusks", "Broken Tusk", "Nose Ring", "Bone Jewelry"],
  },
}

// Fallback for unknown races
const DEFAULT_CONFIG: RaceAppearanceConfig = RACE_CONFIGS.Human

export interface AppearanceData {
  bodyType: string
  headShape: string
  hairStyle: string
  facialHair: string
  skinTone: string
  hairColor: string
  eyeColor: string
  warPaint: string
  scar: string
  extra: string
  raceName: string
}

const CATEGORIES = [
  { key: "body", label: "Body", icon: "🧍" },
  { key: "face", label: "Face", icon: "👤" },
  { key: "hair", label: "Hair", icon: "💇" },
  { key: "marks", label: "Marks", icon: "🎨" },
  { key: "extras", label: "Extras", icon: "✨" },
] as const

// ── SVG Character Preview ─────────────────────────────────────────
function CharacterPreview({ appearance, raceConfig }: {
  appearance: AppearanceData
  raceConfig: RaceAppearanceConfig
}) {
  const { skinTone, hairColor, eyeColor, warPaint, scar, facialHair, hairStyle, extra, bodyType } = appearance
  const earType = raceConfig.earType

  // Body proportions by type
  const isStocky = ["Stocky", "Barrel-Chested", "Compact", "Stout"].includes(bodyType)
  const isBulky = ["Massive", "Muscular", "Hulking", "Scarred Brute", "Broad"].includes(bodyType)
  const isSlender = ["Slender", "Graceful", "Willowy", "Lithe", "Lean"].includes(bodyType)

  const bodyW = isStocky ? 46 : isBulky ? 50 : isSlender ? 34 : 40
  const bodyH = isStocky ? 50 : isBulky ? 55 : isSlender ? 58 : 54
  const headR = isStocky ? 18 : isBulky ? 20 : isSlender ? 16 : 17
  const shoulderW = bodyW + 8
  const legGap = isStocky ? 8 : 6
  const neckY = 55

  // Hair rendering
  const hasHair = hairStyle !== "Bald" && hairStyle !== "Shaved"
  const isLongHair = hairStyle.includes("Long") || hairStyle.includes("Cascade") || hairStyle.includes("Flowing") || hairStyle.includes("Mane")
  const isBraided = hairStyle.includes("Braid")
  const isMohawk = hairStyle.includes("Mohawk") || hairStyle.includes("Crest")

  return (
    <svg viewBox="0 0 120 180" className="w-full h-full" style={{ maxHeight: 280 }}>
      <defs>
        <radialGradient id="skinGrad" cx="50%" cy="40%">
          <stop offset="0%" stopColor={skinTone} stopOpacity="1" />
          <stop offset="100%" stopColor={skinTone} stopOpacity="0.85" />
        </radialGradient>
      </defs>

      {/* Legs */}
      <rect x={60 - legGap - 8} y={neckY + bodyH - 4} width={10} height={38} rx={4} fill={skinTone} opacity="0.9" />
      <rect x={60 + legGap - 2} y={neckY + bodyH - 4} width={10} height={38} rx={4} fill={skinTone} opacity="0.9" />
      {/* Boots */}
      <rect x={60 - legGap - 9} y={neckY + bodyH + 28} width={12} height={10} rx={3} fill="#3a3a3a" />
      <rect x={60 + legGap - 3} y={neckY + bodyH + 28} width={12} height={10} rx={3} fill="#3a3a3a" />

      {/* Body / torso */}
      <rect x={60 - bodyW / 2} y={neckY} width={bodyW} height={bodyH} rx={8} fill={skinTone} />
      {/* Simple tunic */}
      <rect x={60 - bodyW / 2 + 2} y={neckY + 4} width={bodyW - 4} height={bodyH - 8} rx={6} fill="#4a4a5a" opacity="0.7" />
      <line x1={60} y1={neckY + 4} x2={60} y2={neckY + 18} stroke="#5a5a6a" strokeWidth="1.5" />

      {/* Arms */}
      <rect x={60 - shoulderW / 2 - 4} y={neckY + 2} width={10} height={36} rx={4} fill={skinTone} opacity="0.9" />
      <rect x={60 + shoulderW / 2 - 6} y={neckY + 2} width={10} height={36} rx={4} fill={skinTone} opacity="0.9" />
      {/* Hands */}
      <circle cx={60 - shoulderW / 2} cy={neckY + 40} r={4} fill={skinTone} />
      <circle cx={60 + shoulderW / 2} cy={neckY + 40} r={4} fill={skinTone} />

      {/* Neck */}
      <rect x={55} y={neckY - 6} width={10} height={10} rx={3} fill={skinTone} />

      {/* Head */}
      <circle cx={60} cy={neckY - headR - 4} r={headR} fill="url(#skinGrad)" />

      {/* Ears */}
      {earType === "pointed" && (
        <>
          <polygon points={`${60 - headR - 2},${neckY - headR - 8} ${60 - headR + 4},${neckY - headR - 2} ${60 - headR - 6},${neckY - headR - 20}`} fill={skinTone} />
          <polygon points={`${60 + headR + 2},${neckY - headR - 8} ${60 + headR - 4},${neckY - headR - 2} ${60 + headR + 6},${neckY - headR - 20}`} fill={skinTone} />
        </>
      )}
      {earType === "pointed-small" && (
        <>
          <polygon points={`${60 - headR - 1},${neckY - headR - 6} ${60 - headR + 3},${neckY - headR - 2} ${60 - headR - 3},${neckY - headR - 14}`} fill={skinTone} />
          <polygon points={`${60 + headR + 1},${neckY - headR - 6} ${60 + headR - 3},${neckY - headR - 2} ${60 + headR + 3},${neckY - headR - 14}`} fill={skinTone} />
        </>
      )}
      {earType === "round" && (
        <>
          <circle cx={60 - headR - 1} cy={neckY - headR - 4} r={3} fill={skinTone} />
          <circle cx={60 + headR + 1} cy={neckY - headR - 4} r={3} fill={skinTone} />
        </>
      )}

      {/* Eyes */}
      <ellipse cx={54} cy={neckY - headR - 4} rx={3} ry={2.5} fill="white" />
      <ellipse cx={66} cy={neckY - headR - 4} rx={3} ry={2.5} fill="white" />
      <circle cx={54.5} cy={neckY - headR - 4} r={1.8} fill={eyeColor} />
      <circle cx={66.5} cy={neckY - headR - 4} r={1.8} fill={eyeColor} />
      <circle cx={55} cy={neckY - headR - 4.5} r={0.6} fill="white" />
      <circle cx={67} cy={neckY - headR - 4.5} r={0.6} fill="white" />

      {/* Nose */}
      <path d={`M59,${neckY - headR - 1} L60,${neckY - headR + 1} L61,${neckY - headR - 1}`} stroke={skinTone} strokeWidth="1" fill="none" opacity="0.5" />

      {/* Mouth */}
      <path d={`M55,${neckY - headR + 4} Q60,${neckY - headR + 7} 65,${neckY - headR + 4}`} stroke="#6a3a3a" strokeWidth="1" fill="none" opacity="0.6" />

      {/* Tusks (Orc) */}
      {extra?.includes("Tusk") && (
        <>
          <path d={`M53,${neckY - headR + 3} L51,${neckY - headR - 2}`} stroke="#f0f0e0" strokeWidth="2" strokeLinecap="round" />
          <path d={`M67,${neckY - headR + 3} L69,${neckY - headR - 2}`} stroke="#f0f0e0" strokeWidth="2" strokeLinecap="round" />
          {extra.includes("Large") && (
            <>
              <path d={`M53,${neckY - headR + 3} L50,${neckY - headR - 6}`} stroke="#f0f0d0" strokeWidth="2.5" strokeLinecap="round" />
              <path d={`M67,${neckY - headR + 3} L70,${neckY - headR - 6}`} stroke="#f0f0d0" strokeWidth="2.5" strokeLinecap="round" />
            </>
          )}
        </>
      )}

      {/* Hair */}
      {hasHair && (
        <g>
          {isMohawk ? (
            <rect x={55} y={neckY - headR * 2 - 8} width={10} height={headR + 4} rx={3} fill={hairColor} />
          ) : isLongHair ? (
            <>
              <ellipse cx={60} cy={neckY - headR - 8} rx={headR + 2} ry={headR + 4} fill={hairColor} />
              {/* Long hair strands */}
              <rect x={60 - headR - 3} y={neckY - headR} width={6} height={30} rx={3} fill={hairColor} opacity="0.8" />
              <rect x={60 + headR - 3} y={neckY - headR} width={6} height={30} rx={3} fill={hairColor} opacity="0.8" />
            </>
          ) : (
            <ellipse cx={60} cy={neckY - headR - 8} rx={headR + 1} ry={headR + 2} fill={hairColor} />
          )}
          {isBraided && (
            <>
              <rect x={60 - headR - 1} y={neckY - headR + 2} width={4} height={20} rx={2} fill={hairColor} opacity="0.7" />
              <rect x={60 + headR - 3} y={neckY - headR + 2} width={4} height={20} rx={2} fill={hairColor} opacity="0.7" />
            </>
          )}
        </g>
      )}

      {/* Facial hair */}
      {facialHair !== "None" && facialHair !== "Tusked Only" && (
        <g opacity="0.7">
          {facialHair.includes("Beard") || facialHair.includes("Full") ? (
            <ellipse cx={60} cy={neckY - headR + 8} rx={headR - 4} ry={facialHair.includes("Ancestral") || facialHair.includes("Braided") ? 14 : 8} fill={hairColor} />
          ) : facialHair.includes("Mustache") ? (
            <path d={`M53,${neckY - headR + 2} Q60,${neckY - headR + 6} 67,${neckY - headR + 2}`} stroke={hairColor} strokeWidth="2.5" fill="none" />
          ) : facialHair.includes("Goatee") ? (
            <ellipse cx={60} cy={neckY - headR + 7} rx={4} ry={6} fill={hairColor} />
          ) : facialHair.includes("Stubble") ? (
            <>
              {Array.from({ length: 12 }).map((_, i) => (
                <circle key={i} cx={52 + (i % 4) * 5} cy={neckY - headR + 3 + Math.floor(i / 4) * 3} r={0.5} fill={hairColor} opacity="0.5" />
              ))}
            </>
          ) : null}
        </g>
      )}

      {/* War paint */}
      {warPaint !== "None" && (
        <g opacity="0.6">
          {warPaint.includes("Stripe") || warPaint.includes("Lines") || warPaint.includes("War") ? (
            <>
              <line x1={48} y1={neckY - headR - 8} x2={48} y2={neckY - headR + 2} stroke="#1a4a8a" strokeWidth="2" />
              <line x1={72} y1={neckY - headR - 8} x2={72} y2={neckY - headR + 2} stroke="#1a4a8a" strokeWidth="2" />
            </>
          ) : warPaint.includes("Half") || warPaint.includes("Skull") ? (
            <rect x={42} y={neckY - headR * 2 + 2} width={18} height={headR * 2} rx={4} fill="#1a3a6a" opacity="0.4" />
          ) : warPaint.includes("Spiral") || warPaint.includes("Vine") || warPaint.includes("Leaf") ? (
            <circle cx={52} cy={neckY - headR - 2} r={4} fill="none" stroke="#2a6a3a" strokeWidth="1.5" />
          ) : warPaint.includes("Dot") || warPaint.includes("Star") ? (
            <>
              <circle cx={50} cy={neckY - headR - 8} r={1.5} fill="#7a7aff" />
              <circle cx={70} cy={neckY - headR - 8} r={1.5} fill="#7a7aff" />
              <circle cx={60} cy={neckY - headR - 12} r={1.5} fill="#7a7aff" />
            </>
          ) : null}
        </g>
      )}

      {/* Scars */}
      {scar !== "None" && (
        <g opacity="0.5">
          {scar.includes("Eye") ? (
            <line x1={50} y1={neckY - headR - 10} x2={58} y2={neckY - headR + 2} stroke="#e8b0b0" strokeWidth="1.5" />
          ) : scar.includes("Cheek") || scar.includes("Slash") ? (
            <line x1={64} y1={neckY - headR - 4} x2={74} y2={neckY - headR + 4} stroke="#e8b0b0" strokeWidth="1.5" />
          ) : scar.includes("Forehead") ? (
            <line x1={52} y1={neckY - headR - 14} x2={68} y2={neckY - headR - 12} stroke="#e8b0b0" strokeWidth="1.5" />
          ) : scar.includes("Battle") || scar.includes("Wound") || scar.includes("Gouge") ? (
            <>
              <line x1={48} y1={neckY - headR - 6} x2={56} y2={neckY - headR + 4} stroke="#e8b0b0" strokeWidth="1" />
              <line x1={64} y1={neckY - headR - 8} x2={70} y2={neckY - headR} stroke="#e8b0b0" strokeWidth="1" />
            </>
          ) : null}
        </g>
      )}

      {/* Piercings / extras for dwarves */}
      {extra?.includes("Nose Ring") && <circle cx={60} cy={neckY - headR + 1} r={2} fill="none" stroke="#c0a030" strokeWidth="1" />}
      {extra?.includes("Brow") && <circle cx={52} cy={neckY - headR - 10} r={1.5} fill="#c0a030" />}
      {extra?.includes("Ear Ring") && (
        <>
          <circle cx={60 - headR - 1} cy={neckY - headR - 1} r={2} fill="none" stroke="#c0a030" strokeWidth="1" />
          <circle cx={60 + headR + 1} cy={neckY - headR - 1} r={2} fill="none" stroke="#c0a030" strokeWidth="1" />
        </>
      )}
      {extra?.includes("Beard Ring") && facialHair.includes("Beard") && (
        <>
          <circle cx={56} cy={neckY - headR + 10} r={1.5} fill="#c0a030" />
          <circle cx={64} cy={neckY - headR + 10} r={1.5} fill="#c0a030" />
        </>
      )}
    </svg>
  )
}

// ── Option Selector ───────────────────────────────────────────────
function OptionCycler({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void
}) {
  const idx = options.indexOf(value)
  const prev = () => onChange(options[(idx - 1 + options.length) % options.length])
  const next = () => onChange(options[(idx + 1) % options.length])
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground w-24 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-1 flex-1 justify-end">
        <button onClick={prev} className="p-0.5 rounded hover:bg-secondary"><ChevronLeft className="w-3.5 h-3.5" /></button>
        <span className="text-xs font-medium text-center min-w-[100px] truncate">{value}</span>
        <button onClick={next} className="p-0.5 rounded hover:bg-secondary"><ChevronRight className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  )
}

function ColorPicker({ label, colors, value, onChange }: {
  label: string; colors: string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {colors.map(c => (
          <button key={c} onClick={() => onChange(c)}
            className={cn("w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
              value === c ? "border-primary scale-110 ring-1 ring-primary" : "border-transparent")}
            style={{ backgroundColor: c }} />
        ))}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────
export function CharacterAppearanceCreator({ raceName, onComplete, onBack }: {
  raceName: string
  onComplete: (appearance: AppearanceData) => void
  onBack: () => void
}) {
  const config = RACE_CONFIGS[raceName] || DEFAULT_CONFIG
  const [category, setCategory] = useState<string>("body")

  const [appearance, setAppearance] = useState<AppearanceData>(() => ({
    bodyType: config.bodyTypes[0],
    headShape: config.headShapes[0],
    hairStyle: config.hairStyles[0],
    facialHair: config.facialHair[0],
    skinTone: config.skinTones[0],
    hairColor: config.hairColors[0],
    eyeColor: config.eyeColors[0],
    warPaint: "None",
    scar: "None",
    extra: config.extras[0] || "",
    raceName,
  }))

  // Reset when race changes
  useEffect(() => {
    const c = RACE_CONFIGS[raceName] || DEFAULT_CONFIG
    setAppearance({
      bodyType: c.bodyTypes[0], headShape: c.headShapes[0],
      hairStyle: c.hairStyles[0], facialHair: c.facialHair[0],
      skinTone: c.skinTones[0], hairColor: c.hairColors[0],
      eyeColor: c.eyeColors[0], warPaint: "None", scar: "None",
      extra: c.extras[0] || "", raceName,
    })
  }, [raceName])

  const set = useCallback((key: keyof AppearanceData, value: string) => {
    setAppearance(prev => ({ ...prev, [key]: value }))
  }, [])

  const randomize = useCallback(() => {
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]
    setAppearance({
      bodyType: pick(config.bodyTypes), headShape: pick(config.headShapes),
      hairStyle: pick(config.hairStyles), facialHair: pick(config.facialHair),
      skinTone: pick(config.skinTones), hairColor: pick(config.hairColors),
      eyeColor: pick(config.eyeColors),
      warPaint: Math.random() > 0.5 ? pick(config.warPaint) : "None",
      scar: Math.random() > 0.6 ? pick(config.scars) : "None",
      extra: config.extras.length ? (Math.random() > 0.5 ? pick(config.extras) : "") : "",
      raceName,
    })
  }, [config, raceName])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">Customize Appearance</h3>
          <p className="text-xs text-muted-foreground">Race: {raceName}</p>
        </div>
        <Button variant="outline" size="sm" onClick={randomize} className="gap-1">
          <Shuffle className="w-3.5 h-3.5" /> Randomize
        </Button>
      </div>

      <div className="grid grid-cols-[1fr,auto] gap-4">
        {/* Preview */}
        <div className="flex flex-col items-center">
          <div className="w-48 h-64 bg-secondary/30 rounded-lg border border-border flex items-center justify-center overflow-hidden">
            <CharacterPreview appearance={appearance} raceConfig={config} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Preview updates live</p>
        </div>

        {/* Options */}
        <div className="w-64 space-y-2">
          {/* Category tabs */}
          <div className="flex gap-1 flex-wrap">
            {CATEGORIES.map(cat => (
              <button key={cat.key} onClick={() => setCategory(cat.key)}
                className={cn("text-[10px] px-2 py-1 rounded transition-colors",
                  category === cat.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>

          <div className="bg-secondary/20 rounded-lg border border-border p-3 space-y-1 max-h-52 overflow-y-auto">
            {category === "body" && (
              <>
                <OptionCycler label="Build" options={config.bodyTypes} value={appearance.bodyType} onChange={v => set("bodyType", v)} />
                <ColorPicker label="Skin Tone" colors={config.skinTones} value={appearance.skinTone} onChange={v => set("skinTone", v)} />
              </>
            )}
            {category === "face" && (
              <>
                <OptionCycler label="Face Shape" options={config.headShapes} value={appearance.headShape} onChange={v => set("headShape", v)} />
                <ColorPicker label="Eye Color" colors={config.eyeColors} value={appearance.eyeColor} onChange={v => set("eyeColor", v)} />
                {config.facialHair.length > 1 && (
                  <OptionCycler label="Facial Hair" options={config.facialHair} value={appearance.facialHair} onChange={v => set("facialHair", v)} />
                )}
              </>
            )}
            {category === "hair" && (
              <>
                <OptionCycler label="Style" options={config.hairStyles} value={appearance.hairStyle} onChange={v => set("hairStyle", v)} />
                <ColorPicker label="Hair Color" colors={config.hairColors} value={appearance.hairColor} onChange={v => set("hairColor", v)} />
              </>
            )}
            {category === "marks" && (
              <>
                <OptionCycler label="War Paint" options={config.warPaint} value={appearance.warPaint} onChange={v => set("warPaint", v)} />
                <OptionCycler label="Scars" options={config.scars} value={appearance.scar} onChange={v => set("scar", v)} />
              </>
            )}
            {category === "extras" && (
              <>
                {config.extras.length > 0 ? (
                  <OptionCycler label="Extra" options={["None", ...config.extras]} value={appearance.extra || "None"} onChange={v => set("extra", v === "None" ? "" : v)} />
                ) : (
                  <p className="text-xs text-muted-foreground py-2">No race-specific extras for {raceName}.</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1">Back</Button>
        <Button onClick={() => onComplete(appearance)} className="flex-1 blood-glow gap-1">
          <Check className="w-4 h-4" /> Confirm Appearance
        </Button>
      </div>
    </div>
  )
}
