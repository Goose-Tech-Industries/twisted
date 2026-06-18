"use client"

import { useState, useEffect, useCallback } from "react"
import { useGame } from "@/lib/game-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  Vault,
  Coins,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  ScrollText,
  Shield,
  Settings,
  Loader2,
} from "lucide-react"

// ── Types ────────────────────────────────────────────────────────

interface BankItem {
  id: number
  item_id: number
  quantity: number
  deposited_by: string
  deposited_at: string
  note: string
  item_name: string
  item_icon: string
  item_type: string
  item_rarity: string
}

interface LogEntry {
  id: number
  character_name: string
  action: string
  amount: number
  item_name: string
  item_qty: number
  note: string
  created_at: string
}

interface RankPerms {
  rank: string
  can_deposit_gold: boolean
  can_withdraw_gold: boolean
  can_deposit_item: boolean
  can_withdraw_item: boolean
  gold_withdraw_limit: number
}

interface GuildBankPanelProps {
  guildId: number
  guildName: string
  myRank: string
}

// ── Constants ────────────────────────────────────────────────────

const RARITY_COLORS: Record<string, string> = {
  common: "border-border text-foreground",
  uncommon: "border-[oklch(0.55_0.15_140)] text-[oklch(0.55_0.15_140)]",
  rare: "border-[oklch(0.55_0.18_260)] text-[oklch(0.55_0.18_260)]",
  epic: "border-[oklch(0.60_0.25_310)] text-[oklch(0.60_0.25_310)]",
  legendary: "border-[oklch(0.75_0.15_85)] text-[oklch(0.75_0.15_85)]",
}

const RARITY_BG: Record<string, string> = {
  common: "bg-muted/40",
  uncommon: "bg-[oklch(0.55_0.15_140/0.08)]",
  rare: "bg-[oklch(0.55_0.18_260/0.08)]",
  epic: "bg-[oklch(0.60_0.25_310/0.08)]",
  legendary: "bg-[oklch(0.75_0.15_85/0.08)]",
}

const RARITY_BADGE: Record<string, string> = {
  common: "bg-muted text-muted-foreground",
  uncommon: "bg-green-500/20 text-green-400 border-green-500/30",
  rare: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  epic: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  legendary: "bg-amber-500/20 text-amber-400 border-amber-500/30",
}

const RANKS = ["MEMBER", "OFFICER", "LEADER"] as const

// ── Helpers ──────────────────────────────────────────────────────

async function apiFetch<T = any>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  })
  return res.json()
}

function formatTimestamp(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return "Just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function formatGold(n: number) {
  return n.toLocaleString()
}

// ── Main Component ───────────────────────────────────────────────

export function GuildBankPanel({ guildId, guildName, myRank }: GuildBankPanelProps) {
  const { state, notify } = useGame()
  const charId = state.character?.charId ?? state.character?.id ?? 0
  const inventory = state.inventory ?? []

  // State
  const [gold, setGold] = useState(0)
  const [items, setItems] = useState<BankItem[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [perms, setPerms] = useState<RankPerms[]>([])
  const [myPerms, setMyPerms] = useState<RankPerms | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Deposit/withdraw form
  const [goldAmount, setGoldAmount] = useState("")
  const [goldNote, setGoldNote] = useState("")
  const [depositItemId, setDepositItemId] = useState<number | null>(null)
  const [depositItemQty, setDepositItemQty] = useState(1)
  const [depositItemNote, setDepositItemNote] = useState("")
  const [withdrawBankItemId, setWithdrawBankItemId] = useState<number | null>(null)
  const [withdrawItemQty, setWithdrawItemQty] = useState(1)
  const [withdrawItemNote, setWithdrawItemNote] = useState("")

  // Permissions edit state
  const [editPerms, setEditPerms] = useState<RankPerms[]>([])
  const [savingPerms, setSavingPerms] = useState(false)

  const isLeader = myRank.toUpperCase() === "LEADER"
  const isOfficer = myRank.toUpperCase() === "OFFICER"
  const canSeePerms = isLeader || isOfficer

  // ── Data Fetching ──────────────────────────────────────────────

  const loadBank = useCallback(async () => {
    if (!guildId) return
    setLoading(true)
    try {
      const data = await apiFetch<{
        success: boolean
        gold: number
        items: BankItem[]
        log: LogEntry[]
      }>(`/api/guild/bank/${guildId}`)

      if (data.success) {
        setGold(data.gold)
        setItems(data.items)
        setLog(data.log)
      }
    } catch {
      notify("error", "Failed to load guild bank")
    }
    setLoading(false)
  }, [guildId, notify])

  const loadPerms = useCallback(async () => {
    if (!guildId) return
    try {
      const data = await apiFetch<{ success: boolean; perms: RankPerms[] }>(
        `/api/guild/bank/perms/${guildId}`
      )
      if (data.success) {
        setPerms(data.perms)
        setEditPerms(data.perms.map((p) => ({ ...p })))
        const mine = data.perms.find(
          (p) => p.rank.toUpperCase() === myRank.toUpperCase()
        )
        setMyPerms(mine ?? null)
      }
    } catch {
      // Permissions may not be available for non-leaders
    }
  }, [guildId, myRank])

  useEffect(() => {
    loadBank()
    loadPerms()
  }, [loadBank, loadPerms])

  // ── Action Handlers ────────────────────────────────────────────

  const handleDepositGold = async () => {
    const amount = parseInt(goldAmount)
    if (!amount || amount <= 0) {
      notify("error", "Enter a valid amount")
      return
    }
    setBusy(true)
    try {
      const data = await apiFetch<{ success: boolean; message: string }>(
        "/api/guild/bank/deposit-gold",
        {
          method: "POST",
          body: JSON.stringify({ charId, guildId, amount, note: goldNote || undefined }),
        }
      )
      if (data.success) {
        notify("success", data.message || `Deposited ${formatGold(amount)} gold`)
        setGoldAmount("")
        setGoldNote("")
        await loadBank()
      } else {
        notify("error", data.message || "Deposit failed")
      }
    } catch {
      notify("error", "Deposit failed")
    }
    setBusy(false)
  }

  const handleWithdrawGold = async () => {
    const amount = parseInt(goldAmount)
    if (!amount || amount <= 0) {
      notify("error", "Enter a valid amount")
      return
    }
    setBusy(true)
    try {
      const data = await apiFetch<{ success: boolean; message: string }>(
        "/api/guild/bank/withdraw-gold",
        {
          method: "POST",
          body: JSON.stringify({ charId, guildId, amount, note: goldNote || undefined }),
        }
      )
      if (data.success) {
        notify("success", data.message || `Withdrew ${formatGold(amount)} gold`)
        setGoldAmount("")
        setGoldNote("")
        await loadBank()
      } else {
        notify("error", data.message || "Withdrawal failed")
      }
    } catch {
      notify("error", "Withdrawal failed")
    }
    setBusy(false)
  }

  const handleDepositItem = async () => {
    if (!depositItemId) {
      notify("error", "Select an item to deposit")
      return
    }
    setBusy(true)
    try {
      const data = await apiFetch<{ success: boolean; message: string }>(
        "/api/guild/bank/deposit-item",
        {
          method: "POST",
          body: JSON.stringify({
            charId,
            guildId,
            itemId: depositItemId,
            quantity: depositItemQty,
            note: depositItemNote || undefined,
          }),
        }
      )
      if (data.success) {
        notify("success", data.message || "Item deposited")
        setDepositItemId(null)
        setDepositItemQty(1)
        setDepositItemNote("")
        await loadBank()
      } else {
        notify("error", data.message || "Deposit failed")
      }
    } catch {
      notify("error", "Deposit failed")
    }
    setBusy(false)
  }

  const handleWithdrawItem = async () => {
    if (!withdrawBankItemId) {
      notify("error", "Select an item to withdraw")
      return
    }
    setBusy(true)
    try {
      const data = await apiFetch<{ success: boolean; message: string }>(
        "/api/guild/bank/withdraw-item",
        {
          method: "POST",
          body: JSON.stringify({
            charId,
            guildId,
            bankItemId: withdrawBankItemId,
            quantity: withdrawItemQty,
            note: withdrawItemNote || undefined,
          }),
        }
      )
      if (data.success) {
        notify("success", data.message || "Item withdrawn")
        setWithdrawBankItemId(null)
        setWithdrawItemQty(1)
        setWithdrawItemNote("")
        await loadBank()
      } else {
        notify("error", data.message || "Withdrawal failed")
      }
    } catch {
      notify("error", "Withdrawal failed")
    }
    setBusy(false)
  }

  const handleSavePerms = async () => {
    setSavingPerms(true)
    try {
      for (const rp of editPerms) {
        await apiFetch("/api/guild/bank/perms", {
          method: "POST",
          body: JSON.stringify({
            charId,
            guildId,
            rank: rp.rank,
            can_deposit_gold: rp.can_deposit_gold,
            can_withdraw_gold: rp.can_withdraw_gold,
            can_deposit_item: rp.can_deposit_item,
            can_withdraw_item: rp.can_withdraw_item,
            gold_withdraw_limit: rp.gold_withdraw_limit,
          }),
        })
      }
      notify("success", "Permissions saved")
      await loadPerms()
    } catch {
      notify("error", "Failed to save permissions")
    }
    setSavingPerms(false)
  }

  // ── Permission Checks ─────────────────────────────────────────

  const canDepositGold = myPerms?.can_deposit_gold ?? true
  const canWithdrawGold = myPerms?.can_withdraw_gold ?? isLeader
  const canDepositItem = myPerms?.can_deposit_item ?? true
  const canWithdrawItem = myPerms?.can_withdraw_item ?? isLeader

  // ── Loading State ─────────────────────────────────────────────

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Loading guild vault...</span>
        </CardContent>
      </Card>
    )
  }

  // ── Selected inventory item for deposit ───────────────────────

  const selectedDepositItem = inventory.find(
    (i: any) => i.item_id === depositItemId || i.id === depositItemId
  )
  const selectedWithdrawItem = items.find((i) => i.id === withdrawBankItemId)

  // ── Tab Definitions ───────────────────────────────────────────

  const tabs = [
    { value: "vault", label: "Vault", icon: Vault },
    { value: "transact", label: "Deposit/Withdraw", icon: Coins },
    { value: "log", label: "Log", icon: ScrollText },
    ...(canSeePerms
      ? [{ value: "permissions", label: "Permissions", icon: Settings }]
      : []),
  ]

  return (
    <Card className="bg-card border-border w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="w-5 h-5 text-amber-400" />
          {guildName} -- Guild Vault
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="vault" className="w-full">
          <TabsList className="w-full grid grid-cols-3 lg:grid-cols-4 bg-muted/50">
            {tabs.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="flex items-center gap-1.5 text-xs sm:text-sm"
              >
                <t.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Vault Tab ───────────────────────────────────────── */}
          <TabsContent value="vault" className="mt-4 space-y-4">
            {/* Gold Balance */}
            <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <Coins className="w-8 h-8 text-amber-400" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Guild Treasury
                </p>
                <p className="text-2xl font-bold text-amber-400 tabular-nums">
                  {formatGold(gold)} <span className="text-sm font-normal">gold</span>
                </p>
              </div>
            </div>

            <Separator />

            {/* Item Grid */}
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm">The vault is empty</p>
                <p className="text-xs mt-1">Deposit items to store them safely</p>
              </div>
            ) : (
              <ScrollArea className="h-[320px]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                        RARITY_COLORS[item.item_rarity] || RARITY_COLORS.common,
                        RARITY_BG[item.item_rarity] || RARITY_BG.common
                      )}
                    >
                      <div
                        className={cn(
                          "w-10 h-10 rounded-md flex items-center justify-center border shrink-0 text-lg",
                          RARITY_COLORS[item.item_rarity] || RARITY_COLORS.common
                        )}
                      >
                        {item.item_icon || <Package className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {item.item_name}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] capitalize shrink-0",
                              RARITY_BADGE[item.item_rarity] || RARITY_BADGE.common
                            )}
                          >
                            {item.item_rarity}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            x{item.quantity}
                          </span>
                          <span className="text-[10px] text-muted-foreground/70">
                            by {item.deposited_by}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          {/* ── Deposit / Withdraw Tab ──────────────────────────── */}
          <TabsContent value="transact" className="mt-4 space-y-6">
            {/* Permission Status */}
            {myPerms && (
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant={canDepositGold ? "default" : "secondary"}>
                  {canDepositGold ? "Can deposit gold" : "Cannot deposit gold"}
                </Badge>
                <Badge variant={canWithdrawGold ? "default" : "secondary"}>
                  {canWithdrawGold ? "Can withdraw gold" : "Cannot withdraw gold"}
                </Badge>
                <Badge variant={canDepositItem ? "default" : "secondary"}>
                  {canDepositItem ? "Can deposit items" : "Cannot deposit items"}
                </Badge>
                <Badge variant={canWithdrawItem ? "default" : "secondary"}>
                  {canWithdrawItem ? "Can withdraw items" : "Cannot withdraw items"}
                </Badge>
                {myPerms.gold_withdraw_limit > 0 && (
                  <Badge variant="outline">
                    Gold limit: {formatGold(myPerms.gold_withdraw_limit)}/day
                  </Badge>
                )}
              </div>
            )}

            {/* Gold Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400" />
                Gold
              </h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Vault: {formatGold(gold)}g</span>
                <span className="text-border">|</span>
                <span>Your gold: {formatGold(state.character?.gold ?? 0)}g</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="number"
                  placeholder="Amount"
                  min={1}
                  value={goldAmount}
                  onChange={(e) => setGoldAmount(e.target.value)}
                  className="flex-1 bg-background"
                />
                <Input
                  placeholder="Note (optional)"
                  value={goldNote}
                  onChange={(e) => setGoldNote(e.target.value)}
                  className="flex-1 bg-background"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleDepositGold}
                  disabled={busy || !canDepositGold}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" />
                  Deposit
                </Button>
                <Button
                  size="sm"
                  onClick={handleWithdrawGold}
                  disabled={busy || !canWithdrawGold}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  <ArrowUpFromLine className="w-3.5 h-3.5 mr-1.5" />
                  Withdraw
                </Button>
              </div>
            </div>

            <Separator />

            {/* Deposit Item Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ArrowDownToLine className="w-4 h-4 text-green-400" />
                Deposit Item
              </h3>
              {inventory.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Your inventory is empty
                </p>
              ) : (
                <>
                  <ScrollArea className="h-[140px] rounded-md border border-border p-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {inventory.map((item: any) => {
                        const itemId = item.item_id ?? item.id
                        const isSelected = depositItemId === itemId
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              setDepositItemId(itemId)
                              setDepositItemQty(1)
                            }}
                            className={cn(
                              "flex items-center gap-2 p-2 rounded-md border text-left text-xs transition-colors",
                              isSelected
                                ? "border-primary bg-primary/10 ring-1 ring-primary"
                                : "border-border hover:bg-muted/50"
                            )}
                          >
                            <span className="truncate flex-1">
                              {item.item_icon || item.icon || ""} {item.name || item.item_name}
                            </span>
                            <span className="text-muted-foreground shrink-0">
                              x{item.quantity}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </ScrollArea>
                  {selectedDepositItem && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        type="number"
                        placeholder="Qty"
                        min={1}
                        max={selectedDepositItem.quantity}
                        value={depositItemQty}
                        onChange={(e) =>
                          setDepositItemQty(
                            Math.max(1, Math.min(selectedDepositItem.quantity, parseInt(e.target.value) || 1))
                          )
                        }
                        className="w-20 bg-background"
                      />
                      <Input
                        placeholder="Note (optional)"
                        value={depositItemNote}
                        onChange={(e) => setDepositItemNote(e.target.value)}
                        className="flex-1 bg-background"
                      />
                      <Button
                        size="sm"
                        onClick={handleDepositItem}
                        disabled={busy || !canDepositItem}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" />
                        Deposit
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>

            <Separator />

            {/* Withdraw Item Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ArrowUpFromLine className="w-4 h-4 text-red-400" />
                Withdraw Item
              </h3>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No items in the vault
                </p>
              ) : (
                <>
                  <ScrollArea className="h-[140px] rounded-md border border-border p-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {items.map((item) => {
                        const isSelected = withdrawBankItemId === item.id
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              setWithdrawBankItemId(item.id)
                              setWithdrawItemQty(1)
                            }}
                            className={cn(
                              "flex items-center gap-2 p-2 rounded-md border text-left text-xs transition-colors",
                              isSelected
                                ? "border-primary bg-primary/10 ring-1 ring-primary"
                                : "border-border hover:bg-muted/50"
                            )}
                          >
                            <span className="truncate flex-1">
                              {item.item_icon || ""} {item.item_name}
                            </span>
                            <span className="text-muted-foreground shrink-0">
                              x{item.quantity}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </ScrollArea>
                  {selectedWithdrawItem && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        type="number"
                        placeholder="Qty"
                        min={1}
                        max={selectedWithdrawItem.quantity}
                        value={withdrawItemQty}
                        onChange={(e) =>
                          setWithdrawItemQty(
                            Math.max(1, Math.min(selectedWithdrawItem.quantity, parseInt(e.target.value) || 1))
                          )
                        }
                        className="w-20 bg-background"
                      />
                      <Input
                        placeholder="Note (optional)"
                        value={withdrawItemNote}
                        onChange={(e) => setWithdrawItemNote(e.target.value)}
                        className="flex-1 bg-background"
                      />
                      <Button
                        size="sm"
                        onClick={handleWithdrawItem}
                        disabled={busy || !canWithdrawItem}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        <ArrowUpFromLine className="w-3.5 h-3.5 mr-1.5" />
                        Withdraw
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* ── Log Tab ─────────────────────────────────────────── */}
          <TabsContent value="log" className="mt-4">
            {log.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <ScrollText className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm">No transactions yet</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-1">
                  {log.map((entry) => {
                    const isDeposit = entry.action.includes("deposit")
                    const isGold = entry.action.includes("gold")
                    return (
                      <div
                        key={entry.id}
                        className="flex items-start gap-3 p-2.5 rounded-md hover:bg-muted/30 transition-colors"
                      >
                        <div
                          className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                            isDeposit
                              ? "bg-green-500/15 text-green-400"
                              : "bg-red-500/15 text-red-400"
                          )}
                        >
                          {isDeposit ? (
                            <ArrowDownToLine className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUpFromLine className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">
                              {entry.character_name}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                isDeposit
                                  ? "border-green-500/30 text-green-400"
                                  : "border-red-500/30 text-red-400"
                              )}
                            >
                              {isDeposit ? "Deposit" : "Withdraw"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {isGold ? (
                              <span className="text-amber-400">
                                {formatGold(entry.amount)} gold
                              </span>
                            ) : (
                              <span>
                                {entry.item_qty}x {entry.item_name}
                              </span>
                            )}
                            {entry.note && (
                              <span className="ml-2 italic text-muted-foreground/70">
                                &quot;{entry.note}&quot;
                              </span>
                            )}
                          </p>
                        </div>
                        <span className="text-[10px] text-muted-foreground/60 shrink-0 mt-1">
                          {formatTimestamp(entry.created_at)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          {/* ── Permissions Tab ──────────────────────────────────── */}
          {canSeePerms && (
            <TabsContent value="permissions" className="mt-4 space-y-4">
              {!isLeader && (
                <p className="text-xs text-muted-foreground">
                  Only the Guild Leader can edit permissions. Viewing only.
                </p>
              )}

              {editPerms.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No permission data available
                </p>
              ) : (
                <div className="space-y-4">
                  {RANKS.map((rank) => {
                    const rp = editPerms.find(
                      (p) => p.rank.toUpperCase() === rank
                    )
                    if (!rp) return null

                    return (
                      <Card key={rank} className="bg-muted/20 border-border">
                        <CardHeader className="py-3 px-4">
                          <CardTitle className="text-sm flex items-center gap-2">
                            {rank === "LEADER" && (
                              <Shield className="w-4 h-4 text-amber-400" />
                            )}
                            {rank === "OFFICER" && (
                              <Shield className="w-4 h-4 text-blue-400" />
                            )}
                            {rank === "MEMBER" && (
                              <Shield className="w-4 h-4 text-muted-foreground" />
                            )}
                            {rank}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            {(
                              [
                                ["can_deposit_gold", "Deposit Gold"],
                                ["can_withdraw_gold", "Withdraw Gold"],
                                ["can_deposit_item", "Deposit Items"],
                                ["can_withdraw_item", "Withdraw Items"],
                              ] as const
                            ).map(([key, label]) => (
                              <div
                                key={key}
                                className="flex items-center justify-between gap-2"
                              >
                                <Label className="text-xs">{label}</Label>
                                <Switch
                                  checked={(rp as any)[key]}
                                  disabled={!isLeader}
                                  onCheckedChange={(checked) => {
                                    setEditPerms((prev) =>
                                      prev.map((p) =>
                                        p.rank.toUpperCase() === rank
                                          ? { ...p, [key]: checked }
                                          : p
                                      )
                                    )
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs whitespace-nowrap">
                              Gold Withdraw Limit
                            </Label>
                            <Input
                              type="number"
                              min={0}
                              value={rp.gold_withdraw_limit}
                              disabled={!isLeader}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0
                                setEditPerms((prev) =>
                                  prev.map((p) =>
                                    p.rank.toUpperCase() === rank
                                      ? { ...p, gold_withdraw_limit: val }
                                      : p
                                  )
                                )
                              }}
                              className="w-28 bg-background text-sm"
                            />
                            <span className="text-[10px] text-muted-foreground">
                              0 = unlimited
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}

                  {isLeader && (
                    <Button
                      onClick={handleSavePerms}
                      disabled={savingPerms}
                      className="w-full"
                    >
                      {savingPerms ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Settings className="w-4 h-4 mr-2" />
                          Save Permissions
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  )
}
