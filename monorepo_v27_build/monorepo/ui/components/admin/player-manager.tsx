"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { 
  Search, 
  Ban, 
  UserCheck, 
  LogOut, 
  MapPin, 
  Package, 
  Coins,
  TrendingUp,
  MoreHorizontal,
  X
} from "lucide-react"
import adminApi from "@/lib/admin-api"

interface Player {
  id: number
  username: string
  role: string
  is_banned: boolean
  last_login: string
  characters: Array<{
    id: number
    name: string
    level: number
    class_name: string
    gold?: number
    map_id?: number
  }>
}

// Mock data for demo
const MOCK_PLAYERS: Player[] = [
  { 
    id: 1, username: "cormac_warrior", role: "player", is_banned: false, last_login: "2024-01-15T10:30:00",
    characters: [
      { id: 1, name: "Cormac the Red", level: 15, class_name: "Warrior", gold: 2500, map_id: 1 },
      { id: 5, name: "Cormac Alt", level: 3, class_name: "Mage", gold: 100, map_id: 1 }
    ]
  },
  { 
    id: 2, username: "brigid_swift", role: "player", is_banned: false, last_login: "2024-01-15T09:15:00",
    characters: [
      { id: 2, name: "Brigid Swift", level: 10, class_name: "Ranger", gold: 1800, map_id: 1 }
    ]
  },
  { 
    id: 3, username: "finn_hero", role: "player", is_banned: false, last_login: "2024-01-14T22:00:00",
    characters: [
      { id: 3, name: "Finn MacCool", level: 22, class_name: "Champion", gold: 15000, map_id: 3 }
    ]
  },
  { 
    id: 4, username: "banned_user", role: "player", is_banned: true, last_login: "2024-01-10T12:00:00",
    characters: []
  },
  { 
    id: 5, username: "admin_gm", role: "admin", is_banned: false, last_login: "2024-01-15T11:00:00",
    characters: [
      { id: 10, name: "GM Avatar", level: 99, class_name: "Game Master", gold: 999999, map_id: 1 }
    ]
  }
]

export function PlayerManager() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [actionModal, setActionModal] = useState<{ type: string; charId?: number } | null>(null)

  useEffect(() => {
    const load = async () => {
      const res = await adminApi.players.getAll()
      if (res.success && res.data) {
        setPlayers(res.data)
      } else {
        setPlayers(MOCK_PLAYERS)
      }
      setLoading(false)
    }
    load()
  }, [])

  const filteredPlayers = players.filter(p => 
    p.username.toLowerCase().includes(search.toLowerCase()) ||
    p.characters.some(c => c.name.toLowerCase().includes(search.toLowerCase()))
  )

  const handleBan = async (userId: number) => {
    const reason = prompt("Ban reason:")
    if (!reason) return
    const res = await adminApi.players.ban(userId, reason)
    if (res.success) {
      setPlayers(players.map(p => p.id === userId ? { ...p, is_banned: true } : p))
    }
  }

  const handleUnban = async (userId: number) => {
    const res = await adminApi.players.unban(userId)
    if (res.success) {
      setPlayers(players.map(p => p.id === userId ? { ...p, is_banned: false } : p))
    }
  }

  const handleKick = async (charId: number) => {
    const reason = prompt("Kick reason:") || "Removed by admin"
    await adminApi.players.kick(charId, reason)
    alert("Player kicked")
  }

  const handleTeleport = async (charId: number) => {
    const mapId = parseInt(prompt("Target Map ID:") || "0")
    const x = parseInt(prompt("X coordinate:") || "5")
    const y = parseInt(prompt("Y coordinate:") || "5")
    if (!mapId) return
    await adminApi.players.teleport(charId, mapId, x, y)
    alert("Player teleported")
  }

  const handleGiveItem = async (charId: number) => {
    const itemId = parseInt(prompt("Item ID:") || "0")
    const qty = parseInt(prompt("Quantity:") || "1")
    if (!itemId) return
    await adminApi.players.giveItem(charId, itemId, qty)
    alert("Item given")
  }

  const handleGiveGold = async (charId: number) => {
    const amount = parseInt(prompt("Gold amount:") || "0")
    if (!amount) return
    await adminApi.players.giveGold(charId, amount)
    alert("Gold given")
  }

  const handleSetLevel = async (charId: number) => {
    const level = parseInt(prompt("New level (1-99):") || "0")
    if (level < 1 || level > 99) return
    await adminApi.players.setLevel(charId, level)
    alert("Level updated")
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Player Manager</h2>
          <p className="text-sm text-muted-foreground">{players.length} accounts registered</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username or character name..."
          className="pl-10"
        />
      </div>

      {/* Player List */}
      <div className="space-y-3">
        {filteredPlayers.map((player) => (
          <Card 
            key={player.id} 
            className={`celtic-border cursor-pointer transition-all hover:border-primary/50 ${
              player.is_banned ? 'opacity-60 border-destructive/30' : ''
            }`}
            onClick={() => setSelectedPlayer(selectedPlayer?.id === player.id ? null : player)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                    player.role === 'admin' ? 'bg-primary/20 text-primary' : 'bg-secondary'
                  }`}>
                    {player.username[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{player.username}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        player.role === 'admin' ? 'bg-primary/20 text-primary' :
                        player.role === 'gm' ? 'bg-yellow-500/20 text-yellow-500' :
                        'bg-secondary text-muted-foreground'
                      }`}>
                        {player.role}
                      </span>
                      {player.is_banned && (
                        <span className="text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive">
                          BANNED
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {player.characters.length} character{player.characters.length !== 1 ? 's' : ''} - 
                      Last login: {player.last_login ? new Date(player.last_login).toLocaleString() : 'never'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {player.is_banned ? (
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleUnban(player.id) }}>
                      <UserCheck className="w-4 h-4 mr-1" />
                      Unban
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); handleBan(player.id) }}>
                      <Ban className="w-4 h-4 mr-1" />
                      Ban
                    </Button>
                  )}
                </div>
              </div>

              {/* Expanded Character List */}
              {selectedPlayer?.id === player.id && player.characters.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Characters
                  </div>
                  {player.characters.map((char) => (
                    <div key={char.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                          {char.level}
                        </div>
                        <div>
                          <div className="font-medium">{char.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {char.class_name} - {(char.gold || 0).toLocaleString()}g - Map {char.map_id || '?'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleKick(char.id)} title="Kick">
                          <LogOut className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleTeleport(char.id)} title="Teleport">
                          <MapPin className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleGiveItem(char.id)} title="Give Item">
                          <Package className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleGiveGold(char.id)} title="Give Gold">
                          <Coins className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleSetLevel(char.id)} title="Set Level">
                          <TrendingUp className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
