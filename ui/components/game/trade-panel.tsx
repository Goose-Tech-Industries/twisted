"use client"
import React from 'react'

import { useState, useEffect, useCallback } from 'react'
import { useGame } from '@/lib/game-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowRightLeft, Lock, Unlock, Check, X, Plus, Minus, Coins } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TradeSide {
  charId: number
  name: string
  items: Array<{ itemId: number; name: string; quantity: number; icon?: string }>
  gold: number
  locked: boolean
  confirmed: boolean
}

interface Trade {
  sides: Record<string, TradeSide>
}

export function TradePanel() {
  const { state, socket, notify, loadCharacter } = useGame()
  const [isActive, setIsActive] = useState(false)
  const [tradeId, setTradeId] = useState<string | null>(null)
  const [trade, setTrade] = useState<Trade | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [goldOffer, setGoldOffer] = useState(0)
  const [pendingRequest, setPendingRequest] = useState<{ fromName: string; fromCharId: number } | null>(null)
  
  // Socket listeners
  useEffect(() => {
    if (!socket) return
    
    const onTradeRequested = (data: { fromName: string; fromCharId: number }) => {
      setPendingRequest(data)
    }
    
    const onTradeStart = (data: { tradeId: string; trade: Trade }) => {
      setTradeId(data.tradeId)
      setTrade(data.trade)
      setIsActive(true)
      setPendingRequest(null)
    }
    
    const onTradeUpdate = (data: { tradeId: string; trade: Trade }) => {
      if (data.tradeId === tradeId) {
        setTrade(data.trade)
      }
    }
    
    const onTradeComplete = () => {
      setIsActive(false)
      setTradeId(null)
      setTrade(null)
      notify('success', 'Trade complete!')
      // Refresh inventory
      if (state.character) {
        loadCharacter(state.character.charId)
      }
    }
    
    const onTradeCancelled = (data: { reason?: string }) => {
      setIsActive(false)
      setTradeId(null)
      setTrade(null)
      notify('warning', data.reason || 'Trade cancelled')
    }
    
    socket.on('trade_requested', onTradeRequested)
    socket.on('trade_start', onTradeStart)
    socket.on('trade_update', onTradeUpdate)
    socket.on('trade_complete', onTradeComplete)
    socket.on('trade_cancelled', onTradeCancelled)
    
    return () => {
      socket.off('trade_requested', onTradeRequested)
      socket.off('trade_start', onTradeStart)
      socket.off('trade_update', onTradeUpdate)
      socket.off('trade_complete', onTradeComplete)
      socket.off('trade_cancelled', onTradeCancelled)
    }
  }, [socket, tradeId, notify, loadCharacter, state.character])
  
  const acceptRequest = useCallback(() => {
    if (pendingRequest && socket) {
      socket.emit('trade_accept', { targetCharId: pendingRequest.fromCharId })
    }
  }, [pendingRequest, socket])
  
  const declineRequest = useCallback(() => {
    if (pendingRequest && socket) {
      socket.emit('trade_decline', { targetCharId: pendingRequest.fromCharId })
      setPendingRequest(null)
    }
  }, [pendingRequest, socket])
  
  const addItem = useCallback(() => {
    if (!selectedItemId || !tradeId || !socket) return
    socket.emit('trade_add_item', { tradeId, itemId: selectedItemId, quantity })
    setSelectedItemId(null)
    setQuantity(1)
  }, [selectedItemId, tradeId, quantity, socket])
  
  const removeItem = useCallback((itemId: number) => {
    if (!tradeId || !socket) return
    socket.emit('trade_remove_item', { tradeId, itemId })
  }, [tradeId, socket])
  
  const setGold = useCallback((amount: number) => {
    if (!tradeId || !socket) return
    socket.emit('trade_set_gold', { tradeId, amount: Math.max(0, amount) })
    setGoldOffer(amount)
  }, [tradeId, socket])
  
  const toggleLock = useCallback(() => {
    if (!tradeId || !socket) return
    socket.emit('trade_lock', { tradeId })
  }, [tradeId, socket])
  
  const confirmTrade = useCallback(() => {
    if (!tradeId || !socket) return
    socket.emit('trade_confirm', { tradeId })
  }, [tradeId, socket])
  
  const cancelTrade = useCallback(() => {
    if (!tradeId || !socket) return
    socket.emit('trade_cancel', { tradeId })
    setIsActive(false)
    setTradeId(null)
    setTrade(null)
  }, [tradeId, socket])
  
  // Pending request toast
  if (pendingRequest && !isActive) {
    return (
      <div className="fixed top-20 right-4 z-50">
        <Card className="celtic-border w-72">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-accent flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4" />
              Trade Request
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              <span className="text-primary font-semibold">{pendingRequest.fromName}</span>
              {" wants to trade with you"}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="default" onClick={acceptRequest} className="flex-1">
                Accept
              </Button>
              <Button size="sm" variant="outline" onClick={declineRequest} className="flex-1">
                Decline
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  if (!isActive || !trade) return null
  
  const sides: TradeSide[] = Object.values(trade.sides)
  const mySide = sides.find(s => s.charId === state.character?.charId)
  const theirSide = sides.find(s => s.charId !== state.character?.charId)
  
  if (!mySide || !theirSide) return null
  
  const bothLocked = mySide.locked && theirSide.locked
  const canConfirm = mySide.locked && !mySide.confirmed
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="celtic-border w-full max-w-2xl mx-4">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-accent">
            <ArrowRightLeft className="w-5 h-5" />
            Trade
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {/* Trade sides */}
          <div className="grid grid-cols-2 gap-4">
            {/* My side */}
            <div className={cn(
              "p-3 rounded-lg border",
              mySide.locked ? "border-green-500/50 bg-green-500/5" : "border-border bg-card"
            )}>
              <div className="flex items-center justify-between mb-2">
                <span className={cn("font-semibold text-sm", mySide.locked ? "text-green-400" : "text-primary")}>
                  You {mySide.locked && <Lock className="inline w-3 h-3 ml-1" />}
                  {mySide.confirmed && <Check className="inline w-3 h-3 ml-1" />}
                </span>
              </div>
              
              <div className="text-xs text-muted-foreground mb-2">Offering</div>
              <ScrollArea className="h-24 mb-2">
                {mySide.items.length > 0 ? (
                  <div className="space-y-1">
                    {mySide.items.map(item => (
                      <div key={item.itemId} className="flex items-center justify-between p-1.5 rounded bg-secondary/50 text-xs">
                        <span>{item.name} x{item.quantity}</span>
                        {!mySide.locked && (
                          <button onClick={() => removeItem(item.itemId)} className="text-destructive hover:text-destructive/80">
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground text-center py-4">Nothing offered</div>
                )}
              </ScrollArea>
              
              <div className="flex items-center gap-2 text-sm">
                <Coins className="w-4 h-4 text-yellow-500" />
                {!mySide.locked ? (
                  <Input
                    type="number"
                    min={0}
                    max={state.character?.gold || 0}
                    value={goldOffer}
                    onChange={e => setGold(parseInt(e.target.value) || 0)}
                    className="h-7 w-20 text-xs"
                  />
                ) : (
                  <span className="text-yellow-500">{mySide.gold}g</span>
                )}
              </div>
            </div>
            
            {/* Their side */}
            <div className={cn(
              "p-3 rounded-lg border",
              theirSide.locked ? "border-green-500/50 bg-green-500/5" : "border-border bg-card"
            )}>
              <div className="flex items-center justify-between mb-2">
                <span className={cn("font-semibold text-sm", theirSide.locked ? "text-green-400" : "text-foreground")}>
                  {theirSide.name} {theirSide.locked && <Lock className="inline w-3 h-3 ml-1" />}
                  {theirSide.confirmed && <Check className="inline w-3 h-3 ml-1" />}
                </span>
              </div>
              
              <div className="text-xs text-muted-foreground mb-2">Offering</div>
              <ScrollArea className="h-24 mb-2">
                {theirSide.items.length > 0 ? (
                  <div className="space-y-1">
                    {theirSide.items.map(item => (
                      <div key={item.itemId} className="p-1.5 rounded bg-secondary/50 text-xs">
                        {item.name} x{item.quantity}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground text-center py-4">Nothing offered</div>
                )}
              </ScrollArea>
              
              <div className="flex items-center gap-2 text-sm">
                <Coins className="w-4 h-4 text-yellow-500" />
                <span className="text-yellow-500">{theirSide.gold}g</span>
              </div>
            </div>
          </div>
          
          {/* Add item section */}
          {!mySide.locked && (
            <div className="p-3 rounded-lg border border-border bg-secondary/20">
              <div className="text-xs text-muted-foreground mb-2">Add Item from Inventory</div>
              <div className="flex gap-2">
                <select
                  value={selectedItemId || ''}
                  onChange={e => setSelectedItemId(parseInt(e.target.value) || null)}
                  className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">Select item...</option>
                  {state.inventory.filter(i => i.type !== 'key').map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} (x{item.quantity})
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                    <Minus className="w-3 h-3" />
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-8 w-12 text-xs text-center"
                  />
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQuantity(quantity + 1)}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
                <Button size="sm" onClick={addItem} disabled={!selectedItemId}>
                  Add
                </Button>
              </div>
            </div>
          )}
          
          {/* Status */}
          <div className="text-center text-xs text-muted-foreground">
            {bothLocked && !mySide.confirmed && !theirSide.confirmed && (
              "Both sides locked - confirm to complete trade"
            )}
            {mySide.locked && !theirSide.locked && (
              "Waiting for the other player to lock..."
            )}
          </div>
          
          {/* Actions */}
          <div className="flex justify-center gap-2">
            <Button
              variant={mySide.locked ? "outline" : "default"}
              onClick={toggleLock}
              className="gap-2"
            >
              {mySide.locked ? (
                <>
                  <Unlock className="w-4 h-4" />
                  Unlock
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Lock Offer
                </>
              )}
            </Button>
            
            {bothLocked && canConfirm && (
              <Button variant="default" onClick={confirmTrade} className="gap-2 bg-green-600 hover:bg-green-700">
                <Check className="w-4 h-4" />
                Confirm Trade
              </Button>
            )}
            
            <Button variant="destructive" onClick={cancelTrade} className="gap-2">
              <X className="w-4 h-4" />
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
