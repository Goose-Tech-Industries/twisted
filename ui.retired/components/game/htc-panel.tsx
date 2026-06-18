"use client"

// ═══════════════════════════════════════════════════════════════
// HYPERBOLIC TIME CHAMBER — Training UI
// ═══════════════════════════════════════════════════════════════
// Shown when player is on an HTC map (zone_type === "HTC").
// Displays timer, training controls, stat gains, and gravity info.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from "react"
import { useGame, useNotification } from "@/lib/game-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Timer, Dumbbell, Flame, Wind, Shield, Heart,
  Zap, Brain, LogOut, TrendingUp, Gauge,
} from "lucide-react"

interface HTCStatus {
  inside: boolean
  elapsed_seconds?: number
  remaining_seconds?: number
  in_game_hours?: number
  total_ticks?: number
  total_gains?: Record<string, number>
  gravity_mult?: number
  time_dilation?: number
}

interface TrainGains {
  [stat: string]: number
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const STAT_ICONS: Record<string, React.ElementType> = {
  atk: Flame,
  def: Shield,
  speed: Wind,
  max_hp: Heart,
  max_mp: Brain,
  mo: Zap,
  md: Shield,
  luck: TrendingUp,
}

const STAT_LABELS: Record<string, string> = {
  atk: "Attack",
  def: "Defense",
  speed: "Speed",
  max_hp: "Max HP",
  max_mp: "Max MP",
  mo: "Magic ATK",
  md: "Magic DEF",
  luck: "Luck",
}

const TRAINING_TYPES = [
  { id: "self_train", label: "Physical Training", desc: "Push-ups, squats, sparring drills", icon: Dumbbell, color: "text-red-400" },
  { id: "meditate", label: "Meditation", desc: "Focus ki energy, expand mental limits", icon: Brain, color: "text-blue-400" },
  { id: "endurance", label: "Endurance Training", desc: "Withstand extreme gravity pressure", icon: Gauge, color: "text-amber-400" },
  { id: "speed_train", label: "Speed Training", desc: "Rapid movement under heavy gravity", icon: Wind, color: "text-green-400" },
]

export function HTCPanel() {
  const { state, socket } = useGame()
  const { notify } = useNotification()
  const [status, setStatus] = useState<HTCStatus>({ inside: false })
  const [lastGains, setLastGains] = useState<TrainGains | null>(null)
  const [training, setTraining] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  // Request status on mount
  useEffect(() => {
    if (!socket) return
    socket.emit("htc_status")

    const onStatus = (data: HTCStatus) => setStatus(data)
    const onEntered = (data: Record<string, unknown>) => {
      setStatus({
        inside: true,
        remaining_seconds: data.max_seconds as number,
        gravity_mult: data.gravity_mult as number,
        time_dilation: data.time_dilation as number,
        total_ticks: 0,
        total_gains: {},
        elapsed_seconds: 0,
      })
      notify("success", "Entered the Hyperbolic Time Chamber!")
    }
    const onLeft = (data: { summary: Record<string, unknown> }) => {
      setStatus({ inside: false })
      notify("info", `Left the chamber. ${data.summary.in_game_hours} in-game hours of training complete.`)
    }
    const onTick = (data: { gains: TrainGains; ticks: number; remaining: number }) => {
      setLastGains(data.gains)
      setStatus(prev => ({
        ...prev,
        total_ticks: data.ticks,
        remaining_seconds: data.remaining,
      }))
    }
    const onTrainResult = (data: { success: boolean; gains?: TrainGains; message?: string }) => {
      setTraining(false)
      if (data.success && data.gains) {
        setLastGains(data.gains)
        notify("success", "Training complete!")
        // Cooldown between manual trains
        setCooldown(10)
      } else {
        notify("error", data.message || "Training failed.")
      }
    }
    const onEjected = (data: { reason: string; summary: Record<string, unknown> }) => {
      setStatus({ inside: false })
      notify("warning", `Ejected from the chamber: ${data.reason}`)
    }

    socket.on("htc_status", onStatus)
    socket.on("htc_entered", onEntered)
    socket.on("htc_left", onLeft)
    socket.on("htc_training_tick", onTick)
    socket.on("htc_train_result", onTrainResult)
    socket.on("htc_ejected", onEjected)

    return () => {
      socket.off("htc_status", onStatus)
      socket.off("htc_entered", onEntered)
      socket.off("htc_left", onLeft)
      socket.off("htc_training_tick", onTick)
      socket.off("htc_train_result", onTrainResult)
      socket.off("htc_ejected", onEjected)
    }
  }, [socket, notify])

  // Countdown timer
  useEffect(() => {
    if (!status.inside || !status.remaining_seconds) return
    const interval = setInterval(() => {
      setStatus(prev => ({
        ...prev,
        remaining_seconds: Math.max(0, (prev.remaining_seconds || 0) - 1),
        elapsed_seconds: (prev.elapsed_seconds || 0) + 1,
      }))
    }, 1000)
    return () => clearInterval(interval)
  }, [status.inside])

  // Manual train cooldown
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const enterChamber = () => socket?.emit("htc_enter")
  const leaveChamber = () => socket?.emit("htc_leave")
  const doTrain = (type: string) => {
    setTraining(true)
    socket?.emit("htc_train", { type })
  }

  // ── Not entered yet ──
  if (!status.inside) {
    return (
      <Card className="celtic-border bg-gradient-to-b from-white/5 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="w-4 h-4 text-primary" />
            Hyperbolic Time Chamber
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A dimension where time flows differently. Train for hours that feel like
            days. Your body will be pushed to its limits under extreme gravity.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-card/50 rounded p-2">
              <span className="text-muted-foreground">Max Stay</span>
              <p className="font-bold">4 hours (real)</p>
            </div>
            <div className="bg-card/50 rounded p-2">
              <span className="text-muted-foreground">Time Dilation</span>
              <p className="font-bold">12x faster</p>
            </div>
            <div className="bg-card/50 rounded p-2">
              <span className="text-muted-foreground">Gravity</span>
              <p className="font-bold">10x normal</p>
            </div>
            <div className="bg-card/50 rounded p-2">
              <span className="text-muted-foreground">Auto Training</span>
              <p className="font-bold">Every 5 min</p>
            </div>
          </div>
          <Button className="w-full" onClick={enterChamber}>
            <Flame className="w-4 h-4 mr-2" />
            Enter the Chamber
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ── Inside the chamber ──
  const remaining = status.remaining_seconds || 0
  const elapsed = status.elapsed_seconds || 0
  const pct = status.remaining_seconds && status.elapsed_seconds
    ? (elapsed / (elapsed + remaining)) * 100
    : 0

  return (
    <div className="space-y-3">
      {/* Timer Card */}
      <Card className="celtic-border bg-gradient-to-b from-amber-500/5 to-transparent border-amber-500/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold">Time Remaining</span>
            </div>
            <Badge variant="outline" className="text-amber-400 border-amber-400/30">
              {status.gravity_mult}x Gravity
            </Badge>
          </div>

          <p className="text-2xl font-mono font-bold text-amber-400 mb-2">
            {formatTime(remaining)}
          </p>

          {/* Progress bar */}
          <div className="h-1.5 bg-amber-500/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500/60 rounded-full transition-all duration-1000"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
            <span>Elapsed: {formatTime(elapsed)}</span>
            <span>In-game: ~{((elapsed / 3600) * (status.time_dilation || 12)).toFixed(1)}h</span>
            <span>Ticks: {status.total_ticks || 0}</span>
          </div>
        </CardContent>
      </Card>

      {/* Training Actions */}
      <Card className="celtic-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Dumbbell className="w-4 h-4" />
            Active Training
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {TRAINING_TYPES.map(t => (
            <button
              key={t.id}
              disabled={training || cooldown > 0}
              onClick={() => doTrain(t.id)}
              className={cn(
                "w-full flex items-center gap-3 p-2.5 rounded-lg border border-border/50 text-left transition-colors",
                "hover:bg-accent/30 hover:border-primary/30",
                (training || cooldown > 0) && "opacity-50 cursor-not-allowed",
              )}
            >
              <t.icon className={cn("w-5 h-5 shrink-0", t.color)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-[10px] text-muted-foreground">{t.desc}</p>
              </div>
              {cooldown > 0 && (
                <Badge variant="outline" className="text-[10px] shrink-0">{cooldown}s</Badge>
              )}
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Last Gains */}
      {lastGains && Object.keys(lastGains).length > 0 && (
        <Card className="celtic-border border-green-500/20">
          <CardContent className="p-3">
            <p className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Last Training Gains
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(lastGains).map(([stat, val]) => {
                const Icon = STAT_ICONS[stat] || TrendingUp
                return (
                  <div key={stat} className="flex items-center gap-1.5 text-xs">
                    <Icon className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{STAT_LABELS[stat] || stat}</span>
                    <span className="text-green-400 font-mono ml-auto">
                      +{typeof val === 'number' ? val.toFixed(3) : val}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Total Gains */}
      {status.total_gains && Object.keys(status.total_gains).length > 0 && (
        <Card className="celtic-border">
          <CardContent className="p-3">
            <p className="text-xs font-semibold mb-2">Total Session Gains</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(status.total_gains).map(([stat, val]) => {
                const Icon = STAT_ICONS[stat] || TrendingUp
                return (
                  <div key={stat} className="flex items-center gap-1.5 text-xs">
                    <Icon className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{STAT_LABELS[stat] || stat}</span>
                    <span className="text-primary font-mono ml-auto">
                      +{typeof val === 'number' ? val.toFixed(1) : val}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leave Button */}
      <Button
        variant="outline"
        className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
        onClick={leaveChamber}
      >
        <LogOut className="w-4 h-4 mr-2" />
        Exit Chamber
      </Button>
    </div>
  )
}
