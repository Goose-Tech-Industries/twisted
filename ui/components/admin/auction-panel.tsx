"use client"
import { useState, useEffect, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Trash2, RefreshCw } from "lucide-react"

interface Listing {
  id: number; item_id: number; seller_name: string; buyout_price: number
  current_bid: number; bidder_name: string | null; quantity: number
  expires_at: string | null; status: string
}
interface Item { id: number; name: string; icon: string }

type StatusCounts = Record<'ACTIVE' | 'SOLD_BUYOUT' | 'SOLD_BID' | 'EXPIRED' | 'CANCELLED', number>

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'text-cyan-400', SOLD_BUYOUT: 'text-green-400', SOLD_BID: 'text-green-300',
  EXPIRED: 'text-muted-foreground', CANCELLED: 'text-red-400',
}

export function AuctionPanel() {
  const [listings, setListings] = useState<Listing[]>([])
  const [items,    setItems]    = useState<Item[]>([])
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [lr, ir] = await Promise.all([
      adminApi.entity.getAll('auction_listing'),
      adminApi.entity.getAll('item'),
    ])
    setListings((lr.data || []) as Listing[])
    setItems((ir.data || []) as Item[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const itemMap = Object.fromEntries(items.map((i: Item) => [i.id, i]))

  const remove = async (id: number) => {
    if (!confirm('Force-remove this listing? Item will NOT be returned.')) return
    await adminApi.entity.delete('auction_listing', id)
    load()
  }

  const clearExpired = async () => {
    if (!confirm('Delete all EXPIRED and CANCELLED listings?')) return
    const toDelete = listings.filter((l: Listing) => l.status === 'EXPIRED' || l.status === 'CANCELLED')
    for (const l of toDelete) await adminApi.entity.delete('auction_listing', l.id)
    load()
  }

  const counts: StatusCounts = {
    ACTIVE:      listings.filter((l: Listing) => l.status === 'ACTIVE').length,
    SOLD_BUYOUT: listings.filter((l: Listing) => l.status === 'SOLD_BUYOUT').length,
    SOLD_BID:    listings.filter((l: Listing) => l.status === 'SOLD_BID').length,
    EXPIRED:     listings.filter((l: Listing) => l.status === 'EXPIRED').length,
    CANCELLED:   listings.filter((l: Listing) => l.status === 'CANCELLED').length,
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">🏛️ Auction House</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {listings.length} total listing{listings.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh
          </Button>
          <Button variant="destructive" size="sm" onClick={clearExpired}>
            🗑️ Clear Expired
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-6">
        {(Object.entries(counts) as Array<[string, number]>).map(([status, n]: [string, number]) => (
          <div key={status} className="p-3 bg-card border border-border rounded-lg text-center">
            <div className={`text-2xl font-bold font-mono ${STATUS_COLOR[status] || 'text-foreground'}`}>{n}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
              {status.replace('_', ' ')}
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {['Item', 'Seller', 'Buyout', 'Bid', 'Bidder', 'Expires', 'Status', ''].map((h: string) => (
                  <th key={h} className="text-left pb-2 text-muted-foreground font-medium pr-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listings.map((l: Listing) => {
                const it = itemMap[l.item_id]
                return (
                  <tr key={l.id} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pr-2">{it ? `${it.icon || '📦'} ${it.name}` : `#${l.item_id}`} ×{l.quantity}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground">{l.seller_name}</td>
                    <td className="py-1.5 pr-2 text-yellow-400 font-mono">{l.buyout_price}g</td>
                    <td className="py-1.5 pr-2">{l.current_bid > 0 ? `${l.current_bid}g` : '—'}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground">{l.bidder_name || '—'}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      {l.expires_at ? new Date(l.expires_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-1.5 pr-2">
                      <span className={STATUS_COLOR[l.status] || ''}>{l.status}</span>
                    </td>
                    <td className="py-1.5">
                      <Button size="sm" variant="ghost" className="text-destructive h-6 w-6 p-0"
                        onClick={() => remove(l.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
              {listings.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">No listings.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 p-4 bg-card border border-border rounded-lg">
        <h3 className="text-sm font-semibold mb-1">⚙️ Auction Settings</h3>
        <p className="text-xs text-muted-foreground">
          Configure fee %, sale tax, max listings, duration, and enabled status in <b>Settings</b>.
          Keys: <code className="text-primary">auction_listing_fee_pct</code>,{' '}
          <code className="text-primary">auction_sale_tax_pct</code>,{' '}
          <code className="text-primary">auction_enabled</code>.
        </p>
      </div>
    </div>
  )
}
