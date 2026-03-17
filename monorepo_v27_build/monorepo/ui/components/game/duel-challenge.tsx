"use client"

import { useState, useEffect } from 'react'
import { useGame } from '@/lib/game-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Swords, X, Check, Coins, Shield, AlertTriangle,
  Clock, Trophy, User
} from 'lucide-react'

interface DuelRequest {
  id: string
  challengerId: number
  challengerName: string
  challengerLevel: number
  targetId: number
  targetName: string
  wagerAmount: number
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  expiresAt: number
}

interface DuelChallengeOverlayProps {
  isOpen: boolean
  onClose: () => void
  targetPlayer?: {
    id: number
    name: string
    level: number
  }
}

export function DuelChallengeOverlay({ isOpen, onClose, targetPlayer }: DuelChallengeOverlayProps) {
  const { character, socket, notify } = useGame()
  const [wagerAmount, setWagerAmount] = useState(0)
  const [isSending, setIsSending] = useState(false)
  
  if (!isOpen || !targetPlayer || !character) return null
  
  const maxWager = Math.min(character.gold, 10000)
  
  const handleSendChallenge = async () => {
    if (wagerAmount > character.gold) {
      notify('error', 'Insufficient gold for wager')
      return
    }
    
    setIsSending(true)
    
    // Send via socket
    if (socket) {
      socket.emit('duel_challenge', {
        targetId: targetPlayer.id,
        wagerAmount,
      })
    }
    
    // Simulate response
    await new Promise(r => setTimeout(r, 1000))
    
    notify('info', `Duel challenge sent to ${targetPlayer.name}!`)
    setIsSending(false)
    onClose()
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-primary" />
            <h2 className="font-bold">Challenge to Duel</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Target Info */}
          <div className="flex items-center gap-4 p-4 bg-secondary/50 rounded-lg">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-bold">{targetPlayer.name}</p>
              <p className="text-sm text-muted-foreground">Level {targetPlayer.level}</p>
            </div>
          </div>
          
          {/* Wager */}
          <div>
            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider block mb-2">
              Wager Amount (optional)
            </label>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[oklch(0.75_0.15_85)]" />
                <Input
                  type="number"
                  min={0}
                  max={maxWager}
                  value={wagerAmount}
                  onChange={(e) => setWagerAmount(Math.min(Number(e.target.value), maxWager))}
                  className="pl-9"
                  placeholder="0"
                />
              </div>
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                / {character.gold.toLocaleString()} G
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Winner takes all. Both players must have enough gold.
            </p>
          </div>
          
          {/* Rules */}
          <div className="p-3 bg-muted/50 rounded-lg space-y-2">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Standard arena rules apply. No consumables.</span>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Challenge expires in 60 seconds if not accepted.</span>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Trophy className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Victory affects your PvP rating.</span>
            </div>
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex gap-3 p-4 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button 
            onClick={handleSendChallenge} 
            disabled={isSending}
            className="flex-1"
          >
            {isSending ? (
              <span className="animate-pulse">Sending...</span>
            ) : (
              <>
                <Swords className="w-4 h-4 mr-2" />
                Send Challenge
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Incoming duel request notification
export function DuelRequestToast({ request, onAccept, onDecline }: {
  request: DuelRequest
  onAccept: () => void
  onDecline: () => void
}) {
  const [timeLeft, setTimeLeft] = useState(60)
  
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((request.expiresAt - Date.now()) / 1000))
      setTimeLeft(remaining)
      
      if (remaining <= 0) {
        onDecline()
      }
    }, 1000)
    
    return () => clearInterval(interval)
  }, [request.expiresAt, onDecline])
  
  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm bg-card border-2 border-primary rounded-lg shadow-xl animate-float">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-primary/10">
        <Swords className="w-5 h-5 text-primary animate-pulse-slow" />
        <span className="font-bold text-primary">Duel Challenge!</span>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {timeLeft}s
        </span>
      </div>
      
      {/* Content */}
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-bold">{request.challengerName}</p>
            <p className="text-xs text-muted-foreground">Level {request.challengerLevel}</p>
          </div>
        </div>
        
        {request.wagerAmount > 0 && (
          <div className="flex items-center gap-2 p-2 bg-[oklch(0.75_0.15_85/0.1)] rounded mb-3">
            <Coins className="w-4 h-4 text-[oklch(0.75_0.15_85)]" />
            <span className="text-sm">
              Wager: <strong className="text-[oklch(0.75_0.15_85)]">{request.wagerAmount.toLocaleString()} G</strong>
            </span>
          </div>
        )}
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={onDecline}
            className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/10"
          >
            <X className="w-4 h-4 mr-1" />
            Decline
          </Button>
          <Button onClick={onAccept} className="flex-1">
            <Check className="w-4 h-4 mr-1" />
            Accept
          </Button>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div 
          className="h-full bg-primary transition-all duration-1000"
          style={{ width: `${(timeLeft / 60) * 100}%` }}
        />
      </div>
    </div>
  )
}

// Hook to manage duel state
export function useDuelSystem() {
  const { socket, notify, character } = useGame()
  const [incomingRequest, setIncomingRequest] = useState<DuelRequest | null>(null)
  const [outgoingRequest, setOutgoingRequest] = useState<DuelRequest | null>(null)
  
  useEffect(() => {
    if (!socket) return
    
    const handleDuelRequest = (request: DuelRequest) => {
      if (request.targetId === character?.charId) {
        setIncomingRequest(request)
        notify('info', `${request.challengerName} challenges you to a duel!`)
      }
    }
    
    const handleDuelAccepted = (request: DuelRequest) => {
      notify('success', 'Duel accepted! Entering arena...')
      setOutgoingRequest(null)
      // Would trigger battle start here
    }
    
    const handleDuelDeclined = (request: DuelRequest) => {
      notify('info', 'Duel challenge declined.')
      setOutgoingRequest(null)
    }
    
    socket.on('duel_request', handleDuelRequest)
    socket.on('duel_accepted', handleDuelAccepted)
    socket.on('duel_declined', handleDuelDeclined)
    
    return () => {
      socket.off('duel_request', handleDuelRequest)
      socket.off('duel_accepted', handleDuelAccepted)
      socket.off('duel_declined', handleDuelDeclined)
    }
  }, [socket, character, notify])
  
  const acceptDuel = () => {
    if (!socket || !incomingRequest) return
    socket.emit('duel_accept', { requestId: incomingRequest.id })
    setIncomingRequest(null)
    notify('info', 'Entering arena...')
  }
  
  const declineDuel = () => {
    if (!socket || !incomingRequest) return
    socket.emit('duel_decline', { requestId: incomingRequest.id })
    setIncomingRequest(null)
  }
  
  return {
    incomingRequest,
    outgoingRequest,
    acceptDuel,
    declineDuel,
  }
}
