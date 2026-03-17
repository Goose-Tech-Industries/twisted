"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Coins, TrendingUp, Users, Package } from "lucide-react"
import adminApi from "@/lib/admin-api"

interface EconomyStats {
  totalGold: number
  goldPerPlayer: number
  topRichest: Array<{ name: string; gold: number }>
  itemDistribution: Record<string, number>
}

const MOCK_ECONOMY: EconomyStats = {
  totalGold: 15250000,
  goldPerPlayer: 64195,
  topRichest: [
    { name: "Finn MacCool", gold: 150000 },
    { name: "GM Avatar", gold: 999999 },
    { name: "Cormac the Red", gold: 25000 },
    { name: "Brigid Swift", gold: 18000 },
    { name: "Deirdre", gold: 12000 },
  ],
  itemDistribution: {
    "weapon": 450,
    "armor": 380,
    "consumable": 1200,
    "material": 890,
    "accessory": 220,
    "quest": 45
  }
}

export function EconomyPanel() {
  const [data, setData] = useState<EconomyStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const res = await adminApi.economy.getStats()
      if (res.success && res.data) {
        setData(res.data as EconomyStats)
      } else {
        setData(MOCK_ECONOMY)
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const totalItems = Object.values(data.itemDistribution).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Economy Dashboard</h2>
        <p className="text-sm text-muted-foreground">Gold circulation and item distribution</p>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="celtic-border">
          <CardContent className="p-4 text-center">
            <Coins className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
            <div className="text-2xl font-bold font-mono text-yellow-500">
              {data.totalGold.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Total World Gold
            </div>
          </CardContent>
        </Card>
        <Card className="celtic-border">
          <CardContent className="p-4 text-center">
            <TrendingUp className="w-8 h-8 mx-auto mb-2 text-green-500" />
            <div className="text-2xl font-bold font-mono text-green-500">
              {data.goldPerPlayer.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Avg Gold per Player
            </div>
          </CardContent>
        </Card>
        <Card className="celtic-border">
          <CardContent className="p-4 text-center">
            <Users className="w-8 h-8 mx-auto mb-2 text-blue-400" />
            <div className="text-2xl font-bold font-mono text-blue-400">
              {data.topRichest.length}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Top Earners Tracked
            </div>
          </CardContent>
        </Card>
        <Card className="celtic-border">
          <CardContent className="p-4 text-center">
            <Package className="w-8 h-8 mx-auto mb-2 text-purple-400" />
            <div className="text-2xl font-bold font-mono text-purple-400">
              {totalItems.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Items in Circulation
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Richest */}
        <Card className="celtic-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Coins className="w-4 h-4 text-yellow-500" />
              Richest Characters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.topRichest.map((char, i) => {
              const pct = (char.gold / data.topRichest[0].gold) * 100
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">#{i + 1}</span>
                      <span className="font-medium">{char.name}</span>
                    </span>
                    <span className="text-yellow-500 font-mono">{char.gold.toLocaleString()}g</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-yellow-500/60 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Item Distribution */}
        <Card className="celtic-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="w-4 h-4 text-purple-400" />
              Item Distribution by Type
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(data.itemDistribution).map(([type, count]) => {
              const pct = (count / totalItems) * 100
              const colors: Record<string, string> = {
                weapon: 'bg-red-500/60',
                armor: 'bg-blue-500/60',
                consumable: 'bg-green-500/60',
                material: 'bg-orange-500/60',
                accessory: 'bg-purple-500/60',
                quest: 'bg-yellow-500/60'
              }
              return (
                <div key={type} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="capitalize">{type}</span>
                    <span className="text-muted-foreground">
                      {count.toLocaleString()} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${colors[type] || 'bg-gray-500/60'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
