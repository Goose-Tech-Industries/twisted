"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { useGame, useNotification } from "@/lib/game-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  Mail,
  Send,
  Star,
  Trash2,
  Reply,
  Forward,
  Coins,
  Package,
  Clock,
  Inbox,
  ArrowUpRight,
  Sparkles,
  X,
  RefreshCw,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react"

// ── Types ────────────────────────────────────────────────────────

interface MailMessage {
  id: number
  sender_char_id: number
  sender_name: string
  recipient_char_id: number
  subject: string
  body: string
  gold_attachment: number
  gold_collected: boolean
  item_attachment_id: number | null
  item_attachment_qty: number
  item_collected: boolean
  cod_price: number
  cod_paid: boolean
  is_read: boolean
  is_starred: boolean
  is_system: boolean
  reply_to_id: number | null
  sent_at: string
  expires_at: string
  item_name?: string
  item_icon?: string
  item_type?: string
  item_rarity?: string
  recipient_name?: string
}

interface MailTemplate {
  id: number
  subject: string
  body: string
}

// ── Constants ────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ""

const RARITY_COLORS: Record<string, string> = {
  common: "text-muted-foreground border-muted-foreground/30",
  uncommon: "text-[oklch(0.55_0.15_140)] border-[oklch(0.55_0.15_140)]",
  rare: "text-[oklch(0.55_0.18_260)] border-[oklch(0.55_0.18_260)]",
  epic: "text-[oklch(0.60_0.25_310)] border-[oklch(0.60_0.25_310)]",
  legendary: "text-[oklch(0.75_0.15_85)] border-[oklch(0.75_0.15_85)]",
}

const RARITY_BG: Record<string, string> = {
  common: "bg-muted-foreground/10",
  uncommon: "bg-[oklch(0.55_0.15_140)]/10",
  rare: "bg-[oklch(0.55_0.18_260)]/10",
  epic: "bg-[oklch(0.60_0.25_310)]/10",
  legendary: "bg-[oklch(0.75_0.15_85)]/10",
}

// ── Helpers ──────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return "now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

async function mailGet<T = unknown>(endpoint: string): Promise<{ success: boolean; data?: T; templates?: T; message?: string }> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, { method: "GET", credentials: "include" })
    return await res.json()
  } catch (err) {
    return { success: false, message: String(err) }
  }
}

async function mailPost<T = unknown>(endpoint: string, body: Record<string, unknown> = {}): Promise<T & { success: boolean; message?: string }> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    })
    return await res.json()
  } catch (err) {
    return { success: false, message: String(err) } as T & { success: boolean; message?: string }
  }
}

// ── Mail Row ─────────────────────────────────────────────────────

function MailRow({
  mail,
  selected,
  nameField,
  onSelect,
  onToggleStar,
}: {
  mail: MailMessage
  selected: boolean
  nameField: "sender_name" | "recipient_name"
  onSelect: () => void
  onToggleStar: (e: React.MouseEvent) => void
}) {
  const hasGold = mail.gold_attachment > 0 && !mail.gold_collected
  const hasItem = mail.item_attachment_id !== null && !mail.item_collected
  const displayName = nameField === "sender_name" ? mail.sender_name : (mail.recipient_name || "Unknown")

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors border-l-2",
        selected
          ? "bg-accent/60 border-l-primary"
          : "border-l-transparent hover:bg-accent/30",
        !mail.is_read && nameField === "sender_name" && "bg-primary/5"
      )}
    >
      {/* Star */}
      <button
        onClick={onToggleStar}
        className="shrink-0 p-0.5 hover:scale-110 transition-transform"
        aria-label={mail.is_starred ? "Unstar" : "Star"}
      >
        <Star
          className={cn(
            "h-3.5 w-3.5",
            mail.is_starred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"
          )}
        />
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {mail.is_system && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-amber-500/40 text-amber-400 shrink-0">
              SYS
            </Badge>
          )}
          <span className={cn(
            "text-sm truncate",
            !mail.is_read && nameField === "sender_name" ? "font-semibold text-foreground" : "text-muted-foreground"
          )}>
            {displayName}
          </span>
        </div>
        <p className={cn(
          "text-xs truncate mt-0.5",
          !mail.is_read && nameField === "sender_name" ? "text-foreground/80" : "text-muted-foreground/60"
        )}>
          {mail.subject || "(No Subject)"}
        </p>
      </div>

      {/* Right side: attachments + time */}
      <div className="shrink-0 flex flex-col items-end gap-0.5">
        <span className="text-[10px] text-muted-foreground/50">{timeAgo(mail.sent_at)}</span>
        <div className="flex items-center gap-1">
          {hasGold && <Coins className="h-3 w-3 text-yellow-400" />}
          {hasItem && <Package className="h-3 w-3 text-blue-400" />}
          {!mail.is_read && nameField === "sender_name" && (
            <div className="h-2 w-2 rounded-full bg-primary" />
          )}
        </div>
      </div>
    </button>
  )
}

// ── Message Detail ───────────────────────────────────────────────

function MessageDetail({
  mail,
  charId,
  isSent,
  onReply,
  onForward,
  onDelete,
  onCollectGold,
  onCollectItem,
  onClose,
}: {
  mail: MailMessage
  charId: number
  isSent: boolean
  onReply: () => void
  onForward: () => void
  onDelete: () => void
  onCollectGold: () => void
  onCollectItem: () => void
  onClose: () => void
}) {
  const hasGold = mail.gold_attachment > 0
  const hasItem = mail.item_attachment_id !== null
  const rarity = mail.item_rarity || "common"

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground truncate pr-2">
            {mail.subject || "(No Subject)"}
          </h3>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isSent ? (
            <span>To: <span className="text-foreground">{mail.recipient_name || "Unknown"}</span></span>
          ) : (
            <span>From: <span className="text-foreground">{mail.sender_name}</span></span>
          )}
          {mail.is_system && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-amber-500/40 text-amber-400">
              System
            </Badge>
          )}
          <span className="ml-auto flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeAgo(mail.sent_at)}
          </span>
        </div>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1 px-4 py-3">
        <div className="text-sm text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
          {mail.body}
        </div>

        {/* Attachments */}
        {(hasGold || hasItem) && (
          <div className="mt-4 space-y-2">
            <Separator />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Attachments</p>

            {hasGold && (
              <div className="flex items-center justify-between rounded-md border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-yellow-400" />
                  <span className="text-sm font-medium text-yellow-400">{mail.gold_attachment.toLocaleString()} Gold</span>
                </div>
                {!isSent && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                    disabled={mail.gold_collected}
                    onClick={onCollectGold}
                  >
                    {mail.gold_collected ? (
                      <><CheckCircle2 className="h-3 w-3 mr-1" /> Collected</>
                    ) : (
                      <>Collect {mail.gold_attachment.toLocaleString()}g</>
                    )}
                  </Button>
                )}
              </div>
            )}

            {hasItem && (
              <div className={cn(
                "flex items-center justify-between rounded-md border px-3 py-2",
                RARITY_COLORS[rarity]?.split(" ").map(c => c.replace("text-", "border-").startsWith("border-") ? c : "").join(" ") || "border-border",
                RARITY_BG[rarity] || "bg-muted/30"
              )}>
                <div className="flex items-center gap-2">
                  <Package className={cn("h-4 w-4", RARITY_COLORS[rarity]?.split(" ")[0])} />
                  <div>
                    <span className={cn("text-sm font-medium", RARITY_COLORS[rarity]?.split(" ")[0])}>
                      {mail.item_name || "Unknown Item"}
                    </span>
                    {mail.item_attachment_qty > 1 && (
                      <span className="text-xs text-muted-foreground ml-1">x{mail.item_attachment_qty}</span>
                    )}
                    {mail.item_rarity && (
                      <Badge variant="outline" className={cn("ml-2 text-[10px] px-1 py-0 h-4", RARITY_COLORS[rarity])}>
                        {mail.item_rarity}
                      </Badge>
                    )}
                  </div>
                </div>
                {!isSent && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={mail.item_collected}
                    onClick={onCollectItem}
                  >
                    {mail.item_collected ? (
                      <><CheckCircle2 className="h-3 w-3 mr-1" /> Collected</>
                    ) : mail.cod_price > 0 && !mail.cod_paid ? (
                      <>COD: {mail.cod_price.toLocaleString()}g</>
                    ) : (
                      "Collect"
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Action bar */}
      {!isSent && (
        <div className="px-4 py-2 border-t border-border flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onReply}>
            <Reply className="h-3.5 w-3.5 mr-1" /> Reply
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onForward}>
            <Forward className="h-3.5 w-3.5 mr-1" /> Forward
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Inline Reply ─────────────────────────────────────────────────

function InlineReply({
  mail,
  charId,
  onSent,
  onCancel,
}: {
  mail: MailMessage
  charId: number
  onSent: () => void
  onCancel: () => void
}) {
  const { notify } = useNotification()
  const [body, setBody] = useState("")
  const [goldAttachment, setGoldAttachment] = useState(0)
  const [sending, setSending] = useState(false)

  async function handleSend() {
    if (!body.trim()) {
      notify("error", "Reply body cannot be empty")
      return
    }
    setSending(true)
    const res = await mailPost("/api/mail/reply", {
      charId,
      mailId: mail.id,
      body: body.trim(),
      ...(goldAttachment > 0 ? { goldAttachment } : {}),
    })
    setSending(false)
    if (res.success) {
      notify("success", "Reply sent")
      onSent()
    } else {
      notify("error", res.message || "Failed to send reply")
    }
  }

  const quotedBody = mail.body
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n")

  return (
    <div className="border-t border-border px-4 py-3 space-y-2 bg-accent/20">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Replying to {mail.sender_name}
        </span>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onCancel}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="text-xs text-muted-foreground/50 bg-muted/30 rounded p-2 max-h-20 overflow-y-auto whitespace-pre-wrap">
        {quotedBody}
      </div>
      <Textarea
        placeholder="Write your reply..."
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 2000))}
        className="min-h-[80px] text-sm bg-background resize-none"
      />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {body.length}/2000
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Coins className="h-3.5 w-3.5 text-yellow-400" />
          <Input
            type="number"
            min={0}
            placeholder="0"
            value={goldAttachment || ""}
            onChange={(e) => setGoldAttachment(Math.max(0, parseInt(e.target.value) || 0))}
            className="h-7 w-24 text-xs"
          />
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={handleSend} disabled={sending || !body.trim()}>
          {sending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
          Send
        </Button>
      </div>
    </div>
  )
}

// ── Forward Dialog ───────────────────────────────────────────────

function ForwardDialog({
  mail,
  charId,
  onSent,
  onCancel,
}: {
  mail: MailMessage
  charId: number
  onSent: () => void
  onCancel: () => void
}) {
  const { notify } = useNotification()
  const [recipientName, setRecipientName] = useState("")
  const [note, setNote] = useState("")
  const [sending, setSending] = useState(false)

  async function handleForward() {
    if (!recipientName.trim()) {
      notify("error", "Enter a recipient name")
      return
    }
    setSending(true)
    const res = await mailPost("/api/mail/forward", {
      charId,
      mailId: mail.id,
      recipientName: recipientName.trim(),
      ...(note.trim() ? { note: note.trim() } : {}),
    })
    setSending(false)
    if (res.success) {
      notify("success", "Mail forwarded")
      onSent()
    } else {
      notify("error", res.message || "Failed to forward")
    }
  }

  return (
    <div className="border-t border-border px-4 py-3 space-y-2 bg-accent/20">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Forward: {mail.subject}
        </span>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onCancel}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      <Input
        placeholder="Recipient name"
        value={recipientName}
        onChange={(e) => setRecipientName(e.target.value)}
        className="h-8 text-sm"
      />
      <Textarea
        placeholder="Add a note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 500))}
        className="min-h-[60px] text-sm bg-background resize-none"
      />
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={handleForward} disabled={sending || !recipientName.trim()}>
          {sending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ArrowUpRight className="h-3 w-3 mr-1" />}
          Forward
        </Button>
      </div>
    </div>
  )
}

// ── Compose Tab ──────────────────────────────────────────────────

function ComposePane({ charId, onSent }: { charId: number; onSent: () => void }) {
  const { state } = useGame()
  const { notify } = useNotification()

  const [recipientName, setRecipientName] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [goldAttachment, setGoldAttachment] = useState(0)
  const [itemId, setItemId] = useState<string>("")
  const [itemQty, setItemQty] = useState(1)
  const [codPrice, setCodPrice] = useState(0)
  const [templates, setTemplates] = useState<MailTemplate[]>([])
  const [sending, setSending] = useState(false)

  useEffect(() => {
    mailGet<MailTemplate[]>("/api/mail/templates").then((res) => {
      if (res.success && res.templates) {
        setTemplates(res.templates as unknown as MailTemplate[])
      }
    })
  }, [])

  function applyTemplate(templateId: string) {
    const t = templates.find((tpl) => String(tpl.id) === templateId)
    if (t) {
      setSubject(t.subject)
      setBody(t.body)
    }
  }

  async function handleSend() {
    if (!recipientName.trim()) {
      notify("error", "Enter a recipient name")
      return
    }
    if (!subject.trim()) {
      notify("error", "Enter a subject")
      return
    }
    if (!body.trim()) {
      notify("error", "Enter a message body")
      return
    }

    setSending(true)
    const payload: Record<string, unknown> = {
      charId,
      recipientName: recipientName.trim(),
      subject: subject.trim(),
      body: body.trim(),
    }
    if (goldAttachment > 0) payload.goldAttachment = goldAttachment
    if (itemId) {
      payload.itemId = parseInt(itemId)
      payload.itemQty = itemQty
      if (codPrice > 0) payload.codPrice = codPrice
    }

    const res = await mailPost("/api/mail/send", payload)
    setSending(false)

    if (res.success) {
      notify("success", "Mail sent!")
      setRecipientName("")
      setSubject("")
      setBody("")
      setGoldAttachment(0)
      setItemId("")
      setItemQty(1)
      setCodPrice(0)
      onSent()
    } else {
      notify("error", res.message || "Failed to send mail")
    }
  }

  const inventoryItems = state.inventory?.filter((i) => i.quantity > 0) || []
  const selectedItem = inventoryItems.find((i) => String(i.id) === itemId)
  const currentGold = state.character?.gold ?? 0

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Template selector */}
        {templates.length > 0 && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Template</label>
            <Select onValueChange={applyTemplate}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.subject}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Recipient */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recipient</label>
          <Input
            placeholder="Character name"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            className="h-9 text-sm"
          />
        </div>

        {/* Subject */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Subject</label>
          <Input
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-9 text-sm"
          />
        </div>

        {/* Body */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Message</label>
          <Textarea
            placeholder="Write your message..."
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 2000))}
            className="min-h-[140px] text-sm resize-none"
          />
          <div className="text-right text-[10px] text-muted-foreground">{body.length}/2000</div>
        </div>

        <Separator />

        {/* Gold Attachment */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Gold Attachment</label>
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-yellow-400 shrink-0" />
            <Input
              type="number"
              min={0}
              max={currentGold}
              placeholder="0"
              value={goldAttachment || ""}
              onChange={(e) => setGoldAttachment(Math.max(0, Math.min(currentGold, parseInt(e.target.value) || 0)))}
              className="h-8 w-32 text-sm"
            />
            <span className="text-xs text-muted-foreground">/ {currentGold.toLocaleString()}g</span>
          </div>
        </div>

        {/* Item Attachment */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Item Attachment</label>
          <Select value={itemId} onValueChange={setItemId}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select an item..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {inventoryItems.map((item) => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {item.name} (x{item.quantity})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {itemId && selectedItem && (
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1">
                <label className="text-xs text-muted-foreground">Qty:</label>
                <Input
                  type="number"
                  min={1}
                  max={selectedItem.quantity}
                  value={itemQty}
                  onChange={(e) => setItemQty(Math.max(1, Math.min(selectedItem.quantity, parseInt(e.target.value) || 1)))}
                  className="h-7 w-16 text-xs"
                />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs text-muted-foreground">COD:</label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={codPrice || ""}
                  onChange={(e) => setCodPrice(Math.max(0, parseInt(e.target.value) || 0))}
                  className="h-7 w-24 text-xs"
                />
                <Coins className="h-3 w-3 text-yellow-400" />
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Send */}
        <Button
          className="w-full"
          onClick={handleSend}
          disabled={sending || !recipientName.trim() || !subject.trim() || !body.trim()}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Send Mail
        </Button>
      </div>
    </ScrollArea>
  )
}

// ── Empty State ──────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 text-center px-4">
      <Icon className="h-10 w-10 text-muted-foreground/30 mb-3" />
      <p className="text-sm font-medium text-muted-foreground/60">{title}</p>
      <p className="text-xs text-muted-foreground/40 mt-1">{subtitle}</p>
    </div>
  )
}

// ── Main Panel ───────────────────────────────────────────────────

export function MailPanel() {
  const { state } = useGame()
  const { notify } = useNotification()

  const charId = state.character?.id ?? state.character?.charId ?? 0

  // State
  const [activeTab, setActiveTab] = useState("inbox")
  const [inbox, setInbox] = useState<MailMessage[]>([])
  const [sent, setSent] = useState<MailMessage[]>([])
  const [selectedMail, setSelectedMail] = useState<MailMessage | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [replyTo, setReplyTo] = useState<MailMessage | null>(null)
  const [forwardMail, setForwardMail] = useState<MailMessage | null>(null)

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // Fetch inbox
  const fetchInbox = useCallback(async () => {
    if (!charId) return
    const res = await mailGet<MailMessage[]>(`/api/mail/inbox/${charId}`)
    if (mounted.current && res.success && res.data) {
      setInbox(res.data)
    }
  }, [charId])

  // Fetch sent
  const fetchSent = useCallback(async () => {
    if (!charId) return
    const res = await mailGet<MailMessage[]>(`/api/mail/sent/${charId}`)
    if (mounted.current && res.success && res.data) {
      setSent(res.data)
    }
  }, [charId])

  // Initial load
  useEffect(() => {
    if (!charId) return
    setLoading(true)
    Promise.all([fetchInbox(), fetchSent()]).finally(() => {
      if (mounted.current) setLoading(false)
    })
  }, [charId, fetchInbox, fetchSent])

  // Refresh
  async function handleRefresh() {
    setRefreshing(true)
    await Promise.all([fetchInbox(), fetchSent()])
    if (mounted.current) setRefreshing(false)
  }

  // Mark as read
  async function markAsRead(mail: MailMessage) {
    if (mail.is_read) return
    await mailPost("/api/mail/read", { charId, mailId: mail.id })
    setInbox((prev) => prev.map((m) => (m.id === mail.id ? { ...m, is_read: true } : m)))
  }

  // Toggle star
  async function toggleStar(mail: MailMessage, e: React.MouseEvent) {
    e.stopPropagation()
    const res = await mailPost("/api/mail/star", { charId, mailId: mail.id })
    if (res.success) {
      const update = (m: MailMessage) => (m.id === mail.id ? { ...m, is_starred: !m.is_starred } : m)
      setInbox((prev) => prev.map(update))
      setSent((prev) => prev.map(update))
      if (selectedMail?.id === mail.id) {
        setSelectedMail((prev) => prev ? { ...prev, is_starred: !prev.is_starred } : prev)
      }
    }
  }

  // Select mail
  function selectMail(mail: MailMessage) {
    setSelectedMail(mail)
    setReplyTo(null)
    setForwardMail(null)
    markAsRead(mail)
  }

  // Delete mail
  async function handleDelete(mail: MailMessage) {
    const res = await mailPost("/api/mail/delete", { charId, mailId: mail.id })
    if (res.success) {
      setInbox((prev) => prev.filter((m) => m.id !== mail.id))
      setSent((prev) => prev.filter((m) => m.id !== mail.id))
      if (selectedMail?.id === mail.id) setSelectedMail(null)
      notify("success", "Mail deleted")
    } else {
      notify("error", res.message || "Failed to delete mail")
    }
  }

  // Collect gold
  async function handleCollectGold(mail: MailMessage) {
    const res = await mailPost<{ gold?: number }>("/api/mail/collect-gold", { charId, mailId: mail.id })
    if (res.success) {
      const update = (m: MailMessage) => (m.id === mail.id ? { ...m, gold_collected: true } : m)
      setInbox((prev) => prev.map(update))
      setSelectedMail((prev) => prev?.id === mail.id ? { ...prev, gold_collected: true } : prev)
      notify("success", res.message || `Collected ${mail.gold_attachment}g`)
    } else {
      notify("error", res.message || "Failed to collect gold")
    }
  }

  // Collect item
  async function handleCollectItem(mail: MailMessage) {
    const res = await mailPost("/api/mail/collect-item", { charId, mailId: mail.id })
    if (res.success) {
      const update = (m: MailMessage) => (m.id === mail.id ? { ...m, item_collected: true, cod_paid: true } : m)
      setInbox((prev) => prev.map(update))
      setSelectedMail((prev) => prev?.id === mail.id ? { ...prev, item_collected: true, cod_paid: true } : prev)
      notify("success", res.message || "Item collected")
    } else {
      notify("error", res.message || "Failed to collect item")
    }
  }

  // Collect all
  async function handleCollectAll() {
    const res = await mailPost("/api/mail/collect-all", { charId })
    if (res.success) {
      notify("success", res.message || "All attachments collected")
      fetchInbox()
    } else {
      notify("error", res.message || "Failed to collect all")
    }
  }

  // Delete read
  async function handleDeleteRead() {
    const res = await mailPost("/api/mail/bulk-delete", { charId, deleteRead: true })
    if (res.success) {
      setInbox((prev) => prev.filter((m) => !m.is_read || m.is_starred))
      if (selectedMail && selectedMail.is_read && !selectedMail.is_starred) {
        setSelectedMail(null)
      }
      notify("success", "Read mail deleted")
    } else {
      notify("error", res.message || "Failed to delete read mail")
    }
  }

  // Sorted inbox: starred first, then by date
  const sortedInbox = [...inbox].sort((a, b) => {
    if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1
    return new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
  })

  const sortedSent = [...sent].sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())

  const unreadCount = inbox.filter((m) => !m.is_read).length
  const hasCollectible = inbox.some(
    (m) => (m.gold_attachment > 0 && !m.gold_collected) || (m.item_attachment_id !== null && !m.item_collected)
  )

  // ── Render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <Card className="h-full border-border bg-card">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    )
  }

  const mailListContent = (mails: MailMessage[], nameField: "sender_name" | "recipient_name") => {
    if (mails.length === 0) {
      return (
        <EmptyState
          icon={nameField === "sender_name" ? Inbox : Send}
          title={nameField === "sender_name" ? "No mail" : "No sent mail"}
          subtitle={nameField === "sender_name" ? "Your inbox is empty" : "You haven't sent any mail yet"}
        />
      )
    }
    return (
      <ScrollArea className="h-full">
        <div className="divide-y divide-border">
          {mails.map((m) => (
            <MailRow
              key={m.id}
              mail={m}
              selected={selectedMail?.id === m.id}
              nameField={nameField}
              onSelect={() => selectMail(m)}
              onToggleStar={(e) => toggleStar(m, e)}
            />
          ))}
        </div>
      </ScrollArea>
    )
  }

  const detailContent = selectedMail ? (
    <div className="flex flex-col h-full">
      <MessageDetail
        mail={selectedMail}
        charId={charId}
        isSent={activeTab === "sent"}
        onReply={() => { setReplyTo(selectedMail); setForwardMail(null) }}
        onForward={() => { setForwardMail(selectedMail); setReplyTo(null) }}
        onDelete={() => handleDelete(selectedMail)}
        onCollectGold={() => handleCollectGold(selectedMail)}
        onCollectItem={() => handleCollectItem(selectedMail)}
        onClose={() => setSelectedMail(null)}
      />
      {replyTo && (
        <InlineReply
          mail={replyTo}
          charId={charId}
          onSent={() => { setReplyTo(null); fetchInbox() }}
          onCancel={() => setReplyTo(null)}
        />
      )}
      {forwardMail && (
        <ForwardDialog
          mail={forwardMail}
          charId={charId}
          onSent={() => { setForwardMail(null); fetchSent() }}
          onCancel={() => setForwardMail(null)}
        />
      )}
    </div>
  ) : (
    <EmptyState
      icon={Mail}
      title="Select a message"
      subtitle="Choose a message from the list to read it"
    />
  )

  return (
    <Card className="h-full border-border bg-card flex flex-col overflow-hidden">
      <CardHeader className="px-4 py-3 border-b border-border shrink-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-5 w-5 text-primary" />
          Mail
        </CardTitle>
      </CardHeader>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedMail(null); setReplyTo(null); setForwardMail(null) }} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2 shrink-0">
          <TabsTrigger value="inbox" className="relative gap-1 text-xs">
            <Inbox className="h-3.5 w-3.5" />
            Inbox
            {unreadCount > 0 && (
              <Badge className="ml-1 h-4 min-w-[16px] px-1 text-[10px] bg-primary text-primary-foreground">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-1 text-xs">
            <ArrowUpRight className="h-3.5 w-3.5" />
            Sent
          </TabsTrigger>
          <TabsTrigger value="compose" className="gap-1 text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            Compose
          </TabsTrigger>
        </TabsList>

        {/* Inbox Tab */}
        <TabsContent value="inbox" className="flex-1 overflow-hidden mt-0">
          {/* Toolbar */}
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border">
            {hasCollectible && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleCollectAll}>
                <CheckCircle2 className="h-3 w-3" /> Collect All
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={handleDeleteRead}>
              <Trash2 className="h-3 w-3" /> Delete Read
            </Button>
            <div className="flex-1" />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            </Button>
          </div>

          {/* Split: list + detail */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden h-[calc(100%-41px)]">
            <div className="md:w-[320px] w-full md:border-r border-b md:border-b-0 border-border overflow-hidden shrink-0 md:h-full h-[240px]">
              {mailListContent(sortedInbox, "sender_name")}
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              {detailContent}
            </div>
          </div>
        </TabsContent>

        {/* Sent Tab */}
        <TabsContent value="sent" className="flex-1 overflow-hidden mt-0">
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border">
            <div className="flex-1" />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            </Button>
          </div>
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden h-[calc(100%-41px)]">
            <div className="md:w-[320px] w-full md:border-r border-b md:border-b-0 border-border overflow-hidden shrink-0 md:h-full h-[240px]">
              {mailListContent(sortedSent, "recipient_name")}
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              {detailContent}
            </div>
          </div>
        </TabsContent>

        {/* Compose Tab */}
        <TabsContent value="compose" className="flex-1 overflow-hidden mt-0">
          <ComposePane charId={charId} onSent={() => { fetchSent(); setActiveTab("sent") }} />
        </TabsContent>
      </Tabs>
    </Card>
  )
}
