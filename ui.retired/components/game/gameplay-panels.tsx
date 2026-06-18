"use client"

import { useState, useEffect } from "react"
import { useGame } from "@/lib/game-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// ── Bank Panel ──────────────────────────────────────────────────
export function BankPanel() {
  const { state, socket, bankDeposit, bankWithdraw } = useGame()
  const [bankItems, setBankItems] = useState<Array<{item_id:number;name:string;icon:string;quantity:number}>>([])
  const [tab, setTab] = useState<'deposit'|'withdraw'>('deposit')

  useEffect(() => {
    if (!socket) return
    socket.emit('bank_get_items')
    const handler = (data: {items: typeof bankItems}) => setBankItems(data.items || [])
    socket.on('bank_items', handler)
    return () => { socket.off('bank_items', handler) }
  }, [socket])

  const deposit = (itemId: number, qty: number) => bankDeposit(itemId, qty)
  const withdraw = (itemId: number, qty: number) => bankWithdraw(itemId, qty)

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-3">Bank / Vault</h2>
      <div className="flex gap-2 mb-3">
        <Button size="sm" variant={tab === 'deposit' ? 'default' : 'outline'} onClick={() => setTab('deposit')}>Deposit</Button>
        <Button size="sm" variant={tab === 'withdraw' ? 'default' : 'outline'} onClick={() => setTab('withdraw')}>Withdraw</Button>
      </div>
      {tab === 'withdraw' && (
        <div className="space-y-1">
          {bankItems.length === 0 && <p className="text-sm text-muted-foreground">Bank is empty.</p>}
          {bankItems.map(item => (
            <div key={item.item_id} className="flex items-center justify-between p-2 bg-card border border-border rounded">
              <span className="text-sm">{item.icon} {item.name} x{item.quantity}</span>
              <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => withdraw(item.item_id, 1)}>Take 1</Button>
            </div>
          ))}
        </div>
      )}
      {tab === 'deposit' && (
        <p className="text-sm text-muted-foreground">Select items from your inventory to deposit. (Open inventory and use the deposit button on each item.)</p>
      )}
    </div>
  )
}

// ── Bounty Board Panel ──────────────────────────────────────────
export function BountyBoardPanel() {
  const { state, socket, bountyAccept } = useGame()
  const [tasks, setTasks] = useState<Array<{id:number;name:string;description:string;kill_count:number;reward_xp:number;reward_gold:number;kills?:number;status?:string}>>([])

  useEffect(() => {
    if (!socket) return
    socket.emit('bounty_get_tasks')
    const handler = (data: {tasks: typeof tasks}) => setTasks(data.tasks || [])
    socket.on('bounty_tasks', handler)
    return () => { socket.off('bounty_tasks', handler) }
  }, [socket])

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-3">Bounty Board</h2>
      {tasks.length === 0 && <p className="text-sm text-muted-foreground">No bounties available.</p>}
      {tasks.map(t => (
        <Card key={t.id} className="mb-2">
          <CardContent className="p-3">
            <div className="font-bold text-sm">{t.name}</div>
            <p className="text-xs text-muted-foreground">{t.description}</p>
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span>Kill: {t.kills || 0}/{t.kill_count}</span>
              <span className="text-yellow-400">+{t.reward_xp} XP</span>
              <span className="text-green-400">+{t.reward_gold} Gold</span>
            </div>
            {(!t.status || t.status === 'available') && (
              <Button size="sm" className="mt-2 h-6 text-xs" onClick={() => bountyAccept(t.id)}>Accept</Button>
            )}
            {t.status === 'active' && <span className="text-xs text-amber-400 mt-2 block">In Progress</span>}
            {t.status === 'completed' && (
              <Button size="sm" className="mt-2 h-6 text-xs bg-green-700" onClick={() => socket?.emit('bounty_claim', { task_id: t.id })}>Claim Reward</Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ── Mount Panel ─────────────────────────────────────────────────
export function MountPanel() {
  const { state, socket, mountToggle } = useGame()
  const [mounts, setMounts] = useState<Array<{mount_id:number;name:string;icon:string;speed_mult:number;is_active:boolean}>>([])

  useEffect(() => {
    if (!socket) return
    socket.emit('mount_get_list')
    const handler = (data: {mounts: typeof mounts}) => setMounts(data.mounts || [])
    socket.on('mount_list', handler)
    return () => { socket.off('mount_list', handler) }
  }, [socket])

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-3">Mounts</h2>
      {mounts.length === 0 && <p className="text-sm text-muted-foreground">No mounts obtained yet.</p>}
      {mounts.map(m => (
        <div key={m.mount_id} className="flex items-center justify-between p-3 bg-card border border-border rounded mb-2">
          <div>
            <span className="text-lg mr-2">{m.icon}</span>
            <span className="font-bold text-sm">{m.name}</span>
            <span className="text-xs text-muted-foreground ml-2">{m.speed_mult}x speed</span>
          </div>
          <Button size="sm" variant={m.is_active ? 'default' : 'outline'} className="h-7 text-xs"
            onClick={() => mountToggle(m.mount_id)}>
            {m.is_active ? 'Dismount' : 'Mount'}
          </Button>
        </div>
      ))}
    </div>
  )
}

// ── Creature Panel ──────────────────────────────────────────────
export function CreaturePanel() {
  const { state, socket } = useGame()
  const [creatures, setCreatures] = useState<Array<{id:number;nickname:string;level:number;current_hp:number;max_hp:number;is_in_party:boolean}>>([])

  useEffect(() => {
    if (!socket) return
    socket.emit('creature_get_list')
    const handler = (data: {creatures: typeof creatures}) => setCreatures(data.creatures || [])
    socket.on('creature_list', handler)
    return () => { socket.off('creature_list', handler) }
  }, [socket])

  const party = creatures.filter(c => c.is_in_party)
  const storage = creatures.filter(c => !c.is_in_party)

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-3">Creatures</h2>
      <h3 className="text-sm font-bold text-primary mb-2">Party ({party.length}/6)</h3>
      {party.length === 0 && <p className="text-xs text-muted-foreground mb-3">No creatures in party.</p>}
      {party.map(c => (
        <div key={c.id} className="flex items-center justify-between p-2 bg-card border border-primary/30 rounded mb-1">
          <span className="text-sm font-bold">{c.nickname} Lv.{c.level}</span>
          <span className="text-xs">{c.current_hp}/{c.max_hp} HP</span>
        </div>
      ))}
      <h3 className="text-sm font-bold text-muted-foreground mt-3 mb-2">Storage ({storage.length})</h3>
      {storage.map(c => (
        <div key={c.id} className="flex items-center justify-between p-2 bg-card border border-border rounded mb-1">
          <span className="text-sm">{c.nickname} Lv.{c.level}</span>
          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => socket?.emit('creature_to_party', { creatureId: c.id })}>Add to Party</Button>
        </div>
      ))}
    </div>
  )
}

// ── Job Panel ───────────────────────────────────────────────────
export function JobPanel() {
  const { state, socket } = useGame()
  const [jobs, setJobs] = useState<Array<{id:number;name:string;icon:string;job_level:number;jp:number;is_primary:boolean;is_secondary:boolean;max_level:number}>>([])

  useEffect(() => {
    if (!socket) return
    socket.emit('job_get_list')
    const handler = (data: {jobs: typeof jobs}) => setJobs(data.jobs || [])
    socket.on('job_list', handler)
    return () => { socket.off('job_list', handler) }
  }, [socket])

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-3">Jobs</h2>
      {jobs.length === 0 && <p className="text-sm text-muted-foreground">No jobs unlocked yet.</p>}
      {jobs.map(j => (
        <div key={j.id} className={cn("p-3 border rounded mb-2", j.is_primary ? 'border-primary bg-primary/5' : j.is_secondary ? 'border-amber-600 bg-amber-900/5' : 'border-border bg-card')}>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-lg mr-1">{j.icon}</span>
              <span className="font-bold text-sm">{j.name}</span>
              <span className="text-xs text-muted-foreground ml-2">Lv.{j.job_level}/{j.max_level}</span>
              {j.is_primary && <span className="text-[10px] text-primary ml-2 bg-primary/10 px-1 rounded">PRIMARY</span>}
              {j.is_secondary && <span className="text-[10px] text-amber-400 ml-2 bg-amber-900/20 px-1 rounded">SECONDARY</span>}
            </div>
            <div className="flex gap-1">
              {!j.is_primary && <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => socket?.emit('job_switch', { jobId: j.id, slot: 'primary' })}>Set Primary</Button>}
              {!j.is_secondary && <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => socket?.emit('job_switch', { jobId: j.id, slot: 'secondary' })}>Set Secondary</Button>}
            </div>
          </div>
          <div className="mt-1">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, (j.jp / (j.job_level * 100)) * 100)}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground">{j.jp} JP</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Card Game Panel ─────────────────────────────────────────────
export function CardGamePanel() {
  const { state, socket, cardGameChallenge, cardGamePlace } = useGame()
  const [view, setView] = useState<'collection'|'playing'>('collection')
  const [cards, setCards] = useState<Array<{card_id:number;name:string;icon:string;rarity:string;value_top:number;value_right:number;value_bottom:number;value_left:number;quantity:number}>>([])
  const [board, setBoard] = useState<Array<Record<string,unknown> | null>>(new Array(9).fill(null))
  const [matchId, setMatchId] = useState<number | null>(null)
  const [selectedCard, setSelectedCard] = useState<number | null>(null)

  useEffect(() => {
    if (!socket) return
    socket.emit('card_get_collection')
    const collHandler = (data: {cards: typeof cards}) => setCards(data.cards || [])
    const startHandler = (data: {matchId: number; playerCards: typeof cards; boardSize: number}) => {
      setMatchId(data.matchId)
      setCards(data.playerCards)
      setBoard(new Array(data.boardSize).fill(null))
      setView('playing')
    }
    const updateHandler = (data: {board: typeof board; status: string}) => {
      setBoard(data.board)
      if (data.status !== 'active') {
        setTimeout(() => setView('collection'), 3000)
      }
    }
    socket.on('card_collection', collHandler)
    socket.on('card_game_start', startHandler)
    socket.on('card_game_update', updateHandler)
    return () => { socket.off('card_collection', collHandler); socket.off('card_game_start', startHandler); socket.off('card_game_update', updateHandler) }
  }, [socket])

  const rarityColor = (r: string) => r === 'legendary' ? 'text-yellow-400' : r === 'epic' ? 'text-purple-400' : r === 'rare' ? 'text-blue-400' : r === 'uncommon' ? 'text-green-400' : 'text-muted-foreground'

  if (view === 'playing' && matchId) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-bold mb-3">Card Game</h2>
        {/* 3x3 Board */}
        <div className="grid grid-cols-3 gap-1 max-w-xs mx-auto mb-4">
          {board.map((cell, i) => (
            <button key={i} onClick={() => {
              if (cell || selectedCard === null) return
              cardGamePlace(selectedCard, i)
              setSelectedCard(null)
            }}
              className={cn("aspect-square border-2 rounded-lg flex items-center justify-center text-xs transition-all",
                cell ? ((cell as Record<string,unknown>).owner === 'player' ? 'border-blue-500 bg-blue-900/20' : 'border-red-500 bg-red-900/20') : 'border-border bg-card hover:border-primary/50',
                !cell && selectedCard !== null && 'cursor-pointer ring-1 ring-primary/30'
              )}>
              {cell && (
                <div className="text-center">
                  <div className="text-lg">{String((cell as Record<string,unknown>).icon || '?')}</div>
                  <div className="text-[8px] leading-none mt-0.5">
                    <div>{String((cell as Record<string,unknown>).value_top)}</div>
                    <div>{String((cell as Record<string,unknown>).value_left)} · {String((cell as Record<string,unknown>).value_right)}</div>
                    <div>{String((cell as Record<string,unknown>).value_bottom)}</div>
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
        {/* Hand */}
        <p className="text-xs text-muted-foreground mb-2">Select a card, then click an empty space:</p>
        <div className="flex gap-1 flex-wrap">
          {cards.slice(0, 5).map(c => (
            <button key={c.card_id} onClick={() => setSelectedCard(c.card_id)}
              className={cn("p-2 border rounded text-center text-xs transition-all w-16",
                selectedCard === c.card_id ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-border')}>
              <div className="text-lg">{c.icon}</div>
              <div className="text-[8px]">{c.value_top}</div>
              <div className="text-[8px]">{c.value_left}·{c.value_right}</div>
              <div className="text-[8px]">{c.value_bottom}</div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-3">Card Collection</h2>
      <Button size="sm" className="mb-3" onClick={() => cardGameChallenge(0)}>
        Challenge Card Master
      </Button>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {cards.map(c => (
          <div key={c.card_id} className="p-2 bg-card border border-border rounded text-center">
            <div className="text-2xl mb-1">{c.icon}</div>
            <div className="text-xs font-bold truncate">{c.name}</div>
            <div className={cn("text-[10px] capitalize", rarityColor(c.rarity))}>{c.rarity}</div>
            <div className="text-[9px] text-muted-foreground mt-1">
              {c.value_top}/{c.value_right}/{c.value_bottom}/{c.value_left}
            </div>
            {c.quantity > 1 && <div className="text-[10px] text-muted-foreground">x{c.quantity}</div>}
          </div>
        ))}
        {cards.length === 0 && <p className="col-span-4 text-sm text-muted-foreground text-center py-8">No cards yet. Win them from card games or find them as loot!</p>}
      </div>
    </div>
  )
}

// ── AP Distribution Panel ───────────────────────────────────────
export function APPanel() {
  const { state, socket } = useGame()
  const char = state.character
  const unspent = (char as unknown as Record<string,unknown>)?.unspent_ap as number || 0

  const stats = [
    { key: 'strength', label: 'STR', icon: '⚔️' },
    { key: 'defense', label: 'DEF', icon: '🛡️' },
    { key: 'magic_offense', label: 'MO', icon: '🔮' },
    { key: 'magic_defense', label: 'MD', icon: '✨' },
    { key: 'speed', label: 'SPD', icon: '💨' },
    { key: 'luck', label: 'LCK', icon: '🍀' },
    { key: 'max_hp', label: 'HP (+5 per AP)', icon: '❤️' },
    { key: 'max_mp', label: 'MP (+5 per AP)', icon: '💙' },
  ]

  if (unspent <= 0) return null

  return (
    <Card className="mx-4 mt-2 border-primary/30">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-primary">Attribute Points Available: {unspent}</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {stats.map(s => (
            <Button key={s.key} size="sm" variant="outline" className="h-8 text-[10px] gap-1"
              disabled={unspent <= 0}
              onClick={() => socket?.emit('distribute_ap', { stat: s.key, points: 1 })}>
              {s.icon} +1 {s.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
