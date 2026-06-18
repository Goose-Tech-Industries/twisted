import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

// ── Character Panel Skeleton ────────────────────────────────────
export function CharacterSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 animate-in fade-in duration-300">
      <div className="lg:col-span-2 space-y-4">
        {/* Header card: portrait + name + bars */}
        <Card className="celtic-border">
          <CardContent className="p-6">
            <div className="flex items-start gap-6">
              <Skeleton className="w-24 h-24 rounded-lg shrink-0" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-36" />
                <div className="space-y-3 mt-4">
                  <div><Skeleton className="h-2 w-16 mb-1.5" /><Skeleton className="h-3 w-full rounded-full" /></div>
                  <div><Skeleton className="h-2 w-12 mb-1.5" /><Skeleton className="h-3 w-full rounded-full" /></div>
                  <div><Skeleton className="h-2 w-20 mb-1.5" /><Skeleton className="h-3 w-3/4 rounded-full" /></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats grid */}
        <Card className="celtic-border">
          <CardHeader className="pb-2"><Skeleton className="h-3 w-32" /></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-card/50 border border-border/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="w-4 h-4 rounded" />
                    <Skeleton className="h-2 w-14" />
                  </div>
                  <Skeleton className="h-8 w-12" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* XP bar */}
        <Card className="celtic-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="w-5 h-5 rounded shrink-0" />
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              <Skeleton className="h-6 w-10" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right column */}
      <div className="space-y-4">
        <Card className="celtic-border">
          <CardHeader className="pb-2"><Skeleton className="h-3 w-20" /></CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div><Skeleton className="h-7 w-20" /><Skeleton className="h-3 w-16 mt-1" /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="celtic-border">
          <CardHeader className="pb-2"><Skeleton className="h-3 w-28" /></CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2 bg-card/50 border border-border/30 rounded">
                <Skeleton className="w-8 h-8 rounded" />
                <div className="flex-1"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-2.5 w-16 mt-1" /></div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="celtic-border">
          <CardHeader className="pb-2"><Skeleton className="h-3 w-24" /></CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2 bg-primary/5 border border-primary/20 rounded">
                <Skeleton className="w-8 h-8 rounded" />
                <div className="flex-1"><Skeleton className="h-3.5 w-20" /><Skeleton className="h-2.5 w-14 mt-1" /></div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── Inventory Panel Skeleton ────────────────────────────────────
export function InventorySkeleton() {
  return (
    <div className="flex-1 p-4 animate-in fade-in duration-300">
      <div className="max-w-4xl mx-auto">
        {/* Filter tabs */}
        <div className="flex gap-2 mb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-3 w-24 mb-3" />
        {/* Item list */}
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-3 flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48 mt-1" />
                </div>
                <Skeleton className="h-5 w-12 rounded-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Map Panel Skeleton ──────────────────────────────────────────
export function MapSkeleton() {
  return (
    <div className="flex-1 p-4 animate-in fade-in duration-300">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Skeleton className="w-5 h-5 rounded" />
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        {/* Map grid placeholder */}
        <div className="aspect-square max-h-[60vh] w-full bg-card/50 border border-border rounded-lg flex items-center justify-center">
          <div className="text-center space-y-2">
            <Skeleton className="w-8 h-8 rounded-full mx-auto" />
            <Skeleton className="h-3 w-24 mx-auto" />
          </div>
        </div>
        {/* Legend */}
        <div className="flex gap-4 mt-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Skeleton className="w-3 h-3 rounded-full" />
              <Skeleton className="h-2.5 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Quest Panel Skeleton ────────────────────────────────────────
export function QuestSkeleton() {
  return (
    <div className="flex-1 p-4 animate-in fade-in duration-300">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="h-5 w-24" />
        </div>
        {/* Filter tabs */}
        <div className="flex gap-2 mb-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-lg" />
          ))}
        </div>
        {/* Quest list */}
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-8 h-8 rounded shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-14 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4 mt-1" />
                    {/* Objectives */}
                    <div className="mt-3 space-y-1.5">
                      <Skeleton className="h-2.5 w-48" />
                      <Skeleton className="h-2.5 w-36" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Battle Arena Skeleton ───────────────────────────────────────
export function BattleSkeleton() {
  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      {/* Top bar */}
      <div className="border-b border-border bg-card/80 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-3 w-24" />
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left team panel */}
        <div className="w-48 border-r border-border bg-card/50 p-2 space-y-2 hidden md:block">
          <Skeleton className="h-2 w-16 mb-2" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-2 bg-card/80 rounded border border-border space-y-1.5">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-2 w-3/4 rounded-full" />
            </div>
          ))}
        </div>

        {/* Center grid */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="grid grid-cols-8 gap-px">
            {Array.from({ length: 40 }).map((_, i) => (
              <Skeleton key={i} className="w-10 h-10 md:w-14 md:h-14 rounded-sm" />
            ))}
          </div>
        </div>

        {/* Right team panel */}
        <div className="w-48 border-l border-border bg-card/50 p-2 space-y-2 hidden md:block">
          <Skeleton className="h-2 w-16 mb-2" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-2 bg-card/80 rounded border border-border space-y-1.5">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-2 w-3/4 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom command bar */}
      <div className="border-t border-border bg-card/80 p-3 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 flex-1 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

// ── Oghams Panel Skeleton ───────────────────────────────────────
export function OghamsSkeleton() {
  return (
    <div className="flex-1 p-4 animate-in fade-in duration-300">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <Skeleton className="h-6 w-32 mb-1" />
          <Skeleton className="h-3 w-64" />
        </div>

        {/* Slotted oghams card */}
        <Card className="celtic-border mb-4">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-8" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded">
                <Skeleton className="w-10 h-10 rounded" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20 mt-1" />
                </div>
                <Skeleton className="h-6 w-16 rounded" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Available oghams */}
        <Card>
          <CardHeader className="pb-2"><Skeleton className="h-4 w-36" /></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-card/50 border border-border rounded">
                  <Skeleton className="w-10 h-10 rounded" />
                  <div className="flex-1">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-2.5 w-32 mt-1" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
