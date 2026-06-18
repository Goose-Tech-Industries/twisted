"use client"

import { useState, useEffect, useCallback } from "react"
import { useGame } from "@/lib/game-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  Coins,
  Search,
  Swords,
  Shield,
  Gem,
  FlaskRound,
  Package,
  Gavel,
  ShoppingCart,
  Clock,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Tag,
  ListOrdered,
} from "lucide-react"

// ── Types ────────────────────────────────────────────────────────

interface AuctionListing {
  id: number
  seller_name: string
  item_id: number
  quantity: number
  buyout_price: number
  current_bid: number
  min_bid: number
  bidder_name: string | null
  status: string
  expires_at: string
  item_name: string
  item_icon: string
  item_type: string
  item_desc: string
  hours_left: number
  bonus_atk: number
  bonus_def: number
  bonus_mo: number
  bonus_md: number
  bonus_hp: number
  bonus_mp: number
  bonus_speed: number
}

interface BrowseResponse {
  success: boolean
  listings: AuctionListing[]
  total: number
  page: number
  pages: number
}

// ── Constants ────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "weapon", label: "Weapons" },
  { value: "armor", label: "Armor" },
  { value: "accessory", label: "Accessories" },
  { value: "consumable", label: "Consumables" },
  { value: "material", label: "Materials" },
] as const

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "ending", label: "Ending Soon" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
] as const

const TYPE_ICONS: Record<string, React.ElementType> = {
  weapon: Swords,
  armor: Shield,
  accessory: Gem,
  consumable: FlaskRound,
  material: Package,
}

const LISTING_FEE_PERCENT = 5

// ── Helpers ──────────────────────────────────────────────────────

function formatTimeRemaining(hoursLeft: number): string {
  if (hoursLeft <= 0) return "Expired"
  const h = Math.floor(hoursLeft)
  const m = Math.round((hoursLeft - h) * 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function formatGold(amount: number): string {
  return amount.toLocaleString()
}

async function auctionFetch<T>(endpoint: string, body: object): Promise<T> {
  const res = await fetch(`/api/auction/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  })
  return res.json()
}

// ── Stat Badge ───────────────────────────────────────────────────

function StatBadge({ label, value }: { label: string; value: number }) {
  if (!value) return null
  return (
    <span className="text-[10px] font-medium text-muted-foreground">
      +{value} {label}
    </span>
  )
}

// ── Listing Card ─────────────────────────────────────────────────

function ListingCard({
  listing,
  onBid,
  onBuyout,
  onCancel,
  showCancel,
  showBidStatus,
  charName,
}: {
  listing: AuctionListing
  onBid?: (listing: AuctionListing, amount: number) => void
  onBuyout?: (listing: AuctionListing) => void
  onCancel?: (listing: AuctionListing) => void
  showCancel?: boolean
  showBidStatus?: boolean
  charName?: string
}) {
  const [bidInput, setBidInput] = useState("")
  const Icon = TYPE_ICONS[listing.item_type] || Package
  const isExpired = listing.hours_left <= 0
  const minNextBid = listing.current_bid > 0 ? listing.current_bid + 1 : listing.min_bid || 1

  const isWinning = showBidStatus && listing.bidder_name === charName
  const isOutbid = showBidStatus && listing.bidder_name !== charName

  return (
    <Card className="celtic-border bg-card/80 hover:bg-card transition-colors">
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-11 h-11 rounded-lg flex items-center justify-center border border-border bg-muted/50 shrink-0">
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">{listing.item_name}</span>
              {listing.quantity > 1 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  x{listing.quantity}
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {listing.seller_name}
            </p>

            {/* Stat bonuses */}
            <div className="flex flex-wrap gap-1.5 mt-1">
              <StatBadge label="ATK" value={listing.bonus_atk} />
              <StatBadge label="DEF" value={listing.bonus_def} />
              <StatBadge label="MO" value={listing.bonus_mo} />
              <StatBadge label="MD" value={listing.bonus_md} />
              <StatBadge label="HP" value={listing.bonus_hp} />
              <StatBadge label="MP" value={listing.bonus_mp} />
              <StatBadge label="SPD" value={listing.bonus_speed} />
            </div>

            {/* Price row */}
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="flex items-center gap-1 text-[oklch(0.75_0.15_85)]">
                <Coins className="w-3 h-3" />
                {formatGold(listing.buyout_price)}
              </span>
              {listing.current_bid > 0 && (
                <span className="flex items-center gap-1 text-[oklch(0.55_0.18_260)]">
                  <Gavel className="w-3 h-3" />
                  {formatGold(listing.current_bid)}
                </span>
              )}
              <span className={cn(
                "flex items-center gap-1 ml-auto",
                isExpired ? "text-destructive" : "text-muted-foreground"
              )}>
                <Clock className="w-3 h-3" />
                {formatTimeRemaining(listing.hours_left)}
              </span>
            </div>

            {/* Bid status indicator */}
            {showBidStatus && (
              <div className="mt-1.5">
                {isWinning && (
                  <Badge className="bg-[oklch(0.55_0.15_140)]/20 text-[oklch(0.55_0.15_140)] border-[oklch(0.55_0.15_140)]/40 text-[10px]">
                    Winning
                  </Badge>
                )}
                {isOutbid && (
                  <Badge variant="destructive" className="text-[10px]">
                    Outbid
                  </Badge>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {onBuyout && !isExpired && (
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-xs px-2.5"
                  onClick={() => onBuyout(listing)}
                >
                  <ShoppingCart className="w-3 h-3 mr-1" />
                  Buyout
                </Button>
              )}
              {onBid && !isExpired && (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    placeholder={`Min ${formatGold(minNextBid)}`}
                    value={bidInput}
                    onChange={(e) => setBidInput(e.target.value)}
                    className="h-7 w-24 text-xs"
                    min={minNextBid}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2.5"
                    onClick={() => {
                      const amt = parseInt(bidInput)
                      if (amt >= minNextBid) {
                        onBid(listing, amt)
                        setBidInput("")
                      }
                    }}
                    disabled={!bidInput || parseInt(bidInput) < minNextBid}
                  >
                    <Gavel className="w-3 h-3 mr-1" />
                    Bid
                  </Button>
                </div>
              )}
              {showCancel && onCancel && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs px-2.5"
                  onClick={() => onCancel(listing)}
                >
                  <X className="w-3 h-3 mr-1" />
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Browse Tab ───────────────────────────────────────────────────

function BrowseTab({ charId, charName }: { charId: number; charName: string }) {
  const [listings, setListings] = useState<AuctionListing[]>([])
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("")
  const [sort, setSort] = useState("newest")
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const fetchListings = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await auctionFetch<BrowseResponse>("browse", {
        category: category || undefined,
        search: search || undefined,
        sort,
        page,
      })
      if (data.success) {
        setListings(data.listings)
        setPages(data.pages)
        setTotal(data.total)
      } else {
        setError("Failed to load listings.")
      }
    } catch {
      setError("Connection error. Try again.")
    } finally {
      setLoading(false)
    }
  }, [category, search, sort, page])

  useEffect(() => {
    fetchListings()
  }, [fetchListings])

  const handleBuyout = async (listing: AuctionListing) => {
    try {
      const res = await auctionFetch<{ success: boolean; message: string }>("buyout", {
        charId,
        listingId: listing.id,
      })
      if (res.success) fetchListings()
      else setError(res.message || "Buyout failed.")
    } catch {
      setError("Connection error.")
    }
  }

  const handleBid = async (listing: AuctionListing, amount: number) => {
    try {
      const res = await auctionFetch<{ success: boolean; message: string }>("bid", {
        charId,
        listingId: listing.id,
        bidAmount: amount,
      })
      if (res.success) fetchListings()
      else setError(res.message || "Bid failed.")
    } catch {
      setError("Connection error.")
    }
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9 h-9"
          />
        </div>
        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[160px] h-9">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value || "__all__"}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[160px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Listings */}
      <ScrollArea className="h-[calc(100vh-22rem)] min-h-[300px]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Package className="w-10 h-10 mb-2 opacity-40" />
            <p className="text-sm">No listings found.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                onBuyout={handleBuyout}
                onBid={handleBid}
                charName={charName}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            {total} listing{total !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              {page} / {pages}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sell Item Tab ────────────────────────────────────────────────

function SellTab({ charId, inventory }: { charId: number; inventory: { id: number; name: string; icon: string; type: string; quantity: number }[] }) {
  const [selectedItemId, setSelectedItemId] = useState("")
  const [quantity, setQuantity] = useState(1)
  const [buyoutPrice, setBuyoutPrice] = useState("")
  const [minBid, setMinBid] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const sellableItems = inventory.filter((i) =>
    ["weapon", "armor", "accessory", "consumable", "material"].includes(i.type)
  )

  const selectedItem = sellableItems.find((i) => String(i.id) === selectedItemId)
  const maxQty = selectedItem?.quantity || 1
  const fee = buyoutPrice ? Math.max(1, Math.floor(parseInt(buyoutPrice) * LISTING_FEE_PERCENT / 100)) : 0

  const handleList = async () => {
    if (!selectedItemId || !buyoutPrice) return
    setSubmitting(true)
    setMessage(null)
    try {
      const body: Record<string, unknown> = {
        charId,
        itemId: parseInt(selectedItemId),
        quantity,
        buyoutPrice: parseInt(buyoutPrice),
      }
      if (minBid) body.minBid = parseInt(minBid)

      const res = await auctionFetch<{ success: boolean; message: string }>("list", body)
      setMessage({ text: res.message || (res.success ? "Item listed!" : "Failed to list."), error: !res.success })
      if (res.success) {
        setSelectedItemId("")
        setQuantity(1)
        setBuyoutPrice("")
        setMinBid("")
      }
    } catch {
      setMessage({ text: "Connection error.", error: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 max-w-lg">
      {message && (
        <div className={cn(
          "flex items-center gap-2 text-sm rounded-md px-3 py-2 border",
          message.error
            ? "text-destructive bg-destructive/10 border-destructive/30"
            : "text-[oklch(0.55_0.15_140)] bg-[oklch(0.55_0.15_140)]/10 border-[oklch(0.55_0.15_140)]/30"
        )}>
          {message.error ? <AlertCircle className="w-4 h-4 shrink-0" /> : <Tag className="w-4 h-4 shrink-0" />}
          {message.text}
        </div>
      )}

      <Card className="celtic-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">List an Item</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Item select */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Item</label>
            <Select value={selectedItemId} onValueChange={(v) => { setSelectedItemId(v); setQuantity(1) }}>
              <SelectTrigger className="w-full h-9">
                <SelectValue placeholder="Select an item..." />
              </SelectTrigger>
              <SelectContent>
                {sellableItems.length === 0 ? (
                  <SelectItem value="__none__" disabled>No sellable items</SelectItem>
                ) : (
                  sellableItems.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name} (x{item.quantity})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Quantity</label>
            <Input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(maxQty, parseInt(e.target.value) || 1)))}
              min={1}
              max={maxQty}
              className="h-9"
            />
          </div>

          {/* Buyout price */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Buyout Price (gold)</label>
            <div className="relative">
              <Coins className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[oklch(0.75_0.15_85)]" />
              <Input
                type="number"
                placeholder="0"
                value={buyoutPrice}
                onChange={(e) => setBuyoutPrice(e.target.value)}
                min={1}
                className="pl-9 h-9"
              />
            </div>
          </div>

          {/* Min bid (optional) */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Minimum Bid (optional)</label>
            <div className="relative">
              <Gavel className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[oklch(0.55_0.18_260)]" />
              <Input
                type="number"
                placeholder="No minimum"
                value={minBid}
                onChange={(e) => setMinBid(e.target.value)}
                min={1}
                className="pl-9 h-9"
              />
            </div>
          </div>

          {/* Fee display */}
          {fee > 0 && (
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-muted-foreground">Listing fee ({LISTING_FEE_PERCENT}%)</span>
              <span className="flex items-center gap-1 text-[oklch(0.75_0.15_85)]">
                <Coins className="w-3 h-3" />
                {formatGold(fee)}
              </span>
            </div>
          )}

          <Button
            onClick={handleList}
            disabled={!selectedItemId || !buyoutPrice || submitting}
            className="w-full"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Tag className="w-4 h-4 mr-2" />
            )}
            List Item
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ── My Listings Tab ──────────────────────────────────────────────

function MyListingsTab({ charId }: { charId: number }) {
  const [listings, setListings] = useState<AuctionListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const fetchMyListings = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await auctionFetch<{ success: boolean; listings: AuctionListing[] }>("my-listings", { charId })
      if (data.success) setListings(data.listings)
      else setError("Failed to load your listings.")
    } catch {
      setError("Connection error.")
    } finally {
      setLoading(false)
    }
  }, [charId])

  useEffect(() => {
    fetchMyListings()
  }, [fetchMyListings])

  const handleCancel = async (listing: AuctionListing) => {
    try {
      const res = await auctionFetch<{ success: boolean; message: string }>("cancel", {
        charId,
        listingId: listing.id,
      })
      if (res.success) fetchMyListings()
      else setError(res.message || "Cancel failed.")
    } catch {
      setError("Connection error.")
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <ScrollArea className="h-[calc(100vh-18rem)] min-h-[300px]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ListOrdered className="w-10 h-10 mb-2 opacity-40" />
            <p className="text-sm">You have no active listings.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                onCancel={handleCancel}
                showCancel
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

// ── My Bids Tab ──────────────────────────────────────────────────

function MyBidsTab({ charId, charName }: { charId: number; charName: string }) {
  const [listings, setListings] = useState<AuctionListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const fetchMyBids = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await auctionFetch<{ success: boolean; listings: AuctionListing[] }>("my-bids", { charId })
      if (data.success) setListings(data.listings)
      else setError("Failed to load your bids.")
    } catch {
      setError("Connection error.")
    } finally {
      setLoading(false)
    }
  }, [charId])

  useEffect(() => {
    fetchMyBids()
  }, [fetchMyBids])

  const handleBid = async (listing: AuctionListing, amount: number) => {
    try {
      const res = await auctionFetch<{ success: boolean; message: string }>("bid", {
        charId,
        listingId: listing.id,
        bidAmount: amount,
      })
      if (res.success) fetchMyBids()
      else setError(res.message || "Bid failed.")
    } catch {
      setError("Connection error.")
    }
  }

  const handleBuyout = async (listing: AuctionListing) => {
    try {
      const res = await auctionFetch<{ success: boolean; message: string }>("buyout", {
        charId,
        listingId: listing.id,
      })
      if (res.success) fetchMyBids()
      else setError(res.message || "Buyout failed.")
    } catch {
      setError("Connection error.")
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <ScrollArea className="h-[calc(100vh-18rem)] min-h-[300px]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Gavel className="w-10 h-10 mb-2 opacity-40" />
            <p className="text-sm">You haven't placed any bids.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                onBid={handleBid}
                onBuyout={handleBuyout}
                showBidStatus
                charName={charName}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

// ── Main Panel ───────────────────────────────────────────────────

export function AuctionPanel() {
  const { state } = useGame()
  const [collectMsg, setCollectMsg] = useState("")

  const character = state.character
  const charId = character?.charId ?? character?.id ?? 0
  const charName = character?.name ?? ""
  const gold = character?.gold ?? 0

  const handleCollect = async () => {
    try {
      const res = await auctionFetch<{ success: boolean; message: string }>("collect", { charId })
      setCollectMsg(res.message || (res.success ? "Collected!" : "Nothing to collect."))
      setTimeout(() => setCollectMsg(""), 3000)
    } catch {
      setCollectMsg("Connection error.")
      setTimeout(() => setCollectMsg(""), 3000)
    }
  }

  if (!character) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p className="text-sm">No character loaded.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full p-4 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Gavel className="w-5 h-5 text-primary" />
          Auction House
        </h2>
        <div className="flex items-center gap-3">
          {collectMsg && (
            <span className="text-xs text-muted-foreground animate-in fade-in">{collectMsg}</span>
          )}
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleCollect}>
            Collect
          </Button>
          <div className="flex items-center gap-1.5 bg-muted/50 border border-border rounded-md px-3 py-1.5">
            <Coins className="w-4 h-4 text-[oklch(0.75_0.15_85)]" />
            <span className="text-sm font-semibold text-[oklch(0.75_0.15_85)]">
              {formatGold(gold)}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="browse" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="browse" className="text-xs sm:text-sm">
            <Search className="w-3.5 h-3.5 mr-1 hidden sm:inline-block" />
            Browse
          </TabsTrigger>
          <TabsTrigger value="sell" className="text-xs sm:text-sm">
            <Tag className="w-3.5 h-3.5 mr-1 hidden sm:inline-block" />
            Sell Item
          </TabsTrigger>
          <TabsTrigger value="my-listings" className="text-xs sm:text-sm">
            <ListOrdered className="w-3.5 h-3.5 mr-1 hidden sm:inline-block" />
            My Listings
          </TabsTrigger>
          <TabsTrigger value="my-bids" className="text-xs sm:text-sm">
            <Gavel className="w-3.5 h-3.5 mr-1 hidden sm:inline-block" />
            My Bids
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="flex-1 mt-3 min-h-0">
          <BrowseTab charId={charId} charName={charName} />
        </TabsContent>

        <TabsContent value="sell" className="flex-1 mt-3 min-h-0">
          <SellTab charId={charId} inventory={state.inventory} />
        </TabsContent>

        <TabsContent value="my-listings" className="flex-1 mt-3 min-h-0">
          <MyListingsTab charId={charId} />
        </TabsContent>

        <TabsContent value="my-bids" className="flex-1 mt-3 min-h-0">
          <MyBidsTab charId={charId} charName={charName} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
