"use client"

import { useEffect, useState, useCallback } from "react"
import { useGame, useNotification } from "@/lib/game-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Trophy, Swords, Clock, Users, ChevronRight, Crown, Medal, Shield } from "lucide-react"

// ─── Types ──────────────────────────────────────────────────────
interface Tournament {
  id: number; name: string; description: string | null
  type: string; status: string; arena_id: number | null
  entry_fee: number; min_level: number; max_level: number; max_participants: number
  force_nonlethal: boolean; heal_between_rounds: boolean
  prize_pool_json: string | null
  registration_start: string | null; registration_end: string | null
  started_at: string | null; ended_at: string | null
  winner_char_id: number | null; participant_count?: number; winner_name?: string | null
}

interface TourneyMatch {
  id: number; tournament_id: number; round_id: number; match_order: number
  p1_char_id: number | null; p2_char_id: number | null; winner_char_id: number | null
  battle_id: number | null; status: string; scheduled_at: string | null
  p1_name?: string; p2_name?: string; winner_name?: string
}

interface TourneyRound {
  id: number; tournament_id: number; round_number: number
  round_name: string | null; status: string
  matches: TourneyMatch[]
}

interface BracketData {
  tournament: Tournament
  rounds: TourneyRound[]
  participants: { character_id: number; name: string; seed: number; status: string; wins: number; losses: number }[]
}

interface LeaderboardEntry {
  character_id: number; name: string; level: number
  tournaments_entered: number; wins: number; podiums: number; best_placement: number
}

type View = 'list' | 'bracket' | 'leaderboard'

// ─── Component ──────────────────────────────────────────────────
export function TournamentPanel() {
  const { state, socket } = useGame()
  const { notify } = useNotification()
  const [view, setView] = useState<View>('list')
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [bracket, setBracket] = useState<BracketData | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(false)

  const charId = state.character?.id

  // ── Load tournament list ──
  const loadList = useCallback(() => {
    if (!socket) return
    setLoading(true)
    socket.emit('tournament_list')
  }, [socket])

  const loadBracket = useCallback((tournamentId: number) => {
    if (!socket) return
    setLoading(true)
    socket.emit('tournament_get_bracket', { tournamentId })
  }, [socket])

  const loadLeaderboard = useCallback(() => {
    if (!socket) return
    setLoading(true)
    socket.emit('tournament_leaderboard')
  }, [socket])

  useEffect(() => { loadList() }, [loadList])

  // ── Socket listeners ──
  useEffect(() => {
    if (!socket) return
    const onList = (data: Tournament[]) => { setTournaments(data); setLoading(false) }
    const onBracket = (data: BracketData) => { setBracket(data); setView('bracket'); setLoading(false) }
    const onLeaderboard = (data: LeaderboardEntry[]) => { setLeaderboard(data); setView('leaderboard'); setLoading(false) }
    const onRegResult = (data: { success: boolean; message: string }) => {
      notify(data.success ? 'success' : 'error', data.message)
      if (data.success && bracket) loadBracket(bracket.tournament.id)
      loadList()
    }
    const onAnnouncement = (data: { tournamentId: number; message: string }) => {
      notify('info', data.message)
      if (bracket?.tournament.id === data.tournamentId) loadBracket(data.tournamentId)
      loadList()
    }

    socket.on('tournament_list', onList)
    socket.on('tournament_bracket', onBracket)
    socket.on('tournament_leaderboard', onLeaderboard)
    socket.on('tournament_register_result', onRegResult)
    socket.on('tournament_announcement', onAnnouncement)
    return () => {
      socket.off('tournament_list', onList)
      socket.off('tournament_bracket', onBracket)
      socket.off('tournament_leaderboard', onLeaderboard)
      socket.off('tournament_register_result', onRegResult)
      socket.off('tournament_announcement', onAnnouncement)
    }
  }, [socket, bracket, loadBracket, loadList, notify])

  const register = (tournamentId: number) => {
    if (!socket) return
    socket.emit('tournament_register', { tournamentId })
  }

  // ── Status badge ──
  const statusColor = (s: string) => {
    switch (s) {
      case 'REGISTRATION': return 'bg-green-500/20 text-green-400 border-green-500/40'
      case 'ACTIVE': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
      case 'COMPLETED': return 'bg-muted text-muted-foreground border-border'
      case 'DRAFT': case 'SCHEDULED': return 'bg-blue-500/20 text-blue-400 border-blue-500/40'
      default: return 'bg-muted text-muted-foreground border-border'
    }
  }

  // ── Header ──
  const header = (
    <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-border">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Trophy className="w-5 h-5 text-yellow-500" /> Tournaments
      </h2>
      <div className="flex gap-1">
        <Button variant={view === 'list' ? 'default' : 'ghost'} size="sm"
          onClick={() => { setView('list'); loadList() }}>
          <Swords className="w-3.5 h-3.5 mr-1" /> Browse
        </Button>
        <Button variant={view === 'leaderboard' ? 'default' : 'ghost'} size="sm"
          onClick={() => loadLeaderboard()}>
          <Medal className="w-3.5 h-3.5 mr-1" /> Rankings
        </Button>
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════
  // VIEW: Tournament List
  // ═══════════════════════════════════════════════════════════════
  if (view === 'list') {
    return (
      <div className="flex flex-col h-full max-w-5xl mx-auto w-full">
        {header}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && <p className="text-muted-foreground text-center py-8">Loading...</p>}
          {!loading && !tournaments.length && (
            <div className="text-center py-12 text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No tournaments available right now</p>
            </div>
          )}
          {tournaments.map(t => {
            const prizes = t.prize_pool_json ? JSON.parse(t.prize_pool_json) : null
            return (
              <Card key={t.id} className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => loadBracket(t.id)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-base">{t.name}</h3>
                      {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                    </div>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium", statusColor(t.status))}>
                      {t.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {t.participant_count || 0}/{t.max_participants}</span>
                    <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> {t.type.replace('_', ' ')}</span>
                    <span>Lv.{t.min_level}-{t.max_level}</span>
                    {t.entry_fee > 0 && <span>{t.entry_fee}g entry</span>}
                    {t.force_nonlethal && <span className="text-green-400">Non-lethal</span>}
                    {t.winner_name && <span className="text-yellow-400 flex items-center gap-1"><Crown className="w-3 h-3" /> {t.winner_name}</span>}
                  </div>
                  {prizes && (
                    <div className="text-xs text-yellow-400/70 mt-2">
                      Prizes: {Object.entries(prizes).map(([place, p]) =>
                        `${place}: ${(p as { gold?: number }).gold || 0}g`).join(' / ')}
                    </div>
                  )}
                  <div className="flex items-center justify-end mt-2 text-xs text-primary">
                    View bracket <ChevronRight className="w-3 h-3 ml-0.5" />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // VIEW: Bracket Visualization
  // ═══════════════════════════════════════════════════════════════
  if (view === 'bracket' && bracket) {
    const { tournament: t, rounds, participants } = bracket
    const nameMap: Record<number, string> = {}
    participants.forEach(p => { nameMap[p.character_id] = p.name })
    const isRegistered = participants.some(p => p.character_id === charId)
    const canRegister = t.status === 'REGISTRATION' && !isRegistered

    return (
      <div className="flex flex-col h-full max-w-5xl mx-auto w-full">
        {header}
        <div className="flex-1 overflow-y-auto">
          {/* Tournament info */}
          <div className="p-4 border-b border-border">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg">{t.name}</h3>
                {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
              </div>
              <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", statusColor(t.status))}>
                {t.status}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
              <span>{t.type.replace('_', ' ')}</span>
              <span>{participants.length}/{t.max_participants} fighters</span>
              <span>Lv.{t.min_level}-{t.max_level}</span>
              {t.entry_fee > 0 && <span>{t.entry_fee}g entry</span>}
            </div>
            {canRegister && (
              <Button size="sm" className="mt-3" onClick={() => register(t.id)}>
                <Swords className="w-3.5 h-3.5 mr-1" /> Register
              </Button>
            )}
            {isRegistered && t.status === 'REGISTRATION' && (
              <p className="mt-3 text-sm text-green-400">You are registered</p>
            )}
          </div>

          {/* Bracket */}
          {rounds.length > 0 ? (
            <div className="overflow-x-auto p-4">
              <div className="flex gap-6 min-w-max">
                {rounds.map((round) => (
                  <div key={round.id} className="flex flex-col gap-2 min-w-[200px]">
                    <div className="text-xs font-bold text-center text-muted-foreground mb-2 flex items-center justify-center gap-1">
                      {round.round_name || `Round ${round.round_number}`}
                      {round.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
                    </div>
                    <div className="flex flex-col justify-around flex-1 gap-3">
                      {round.matches.map((match) => {
                        const p1Name = match.p1_char_id ? (match.p1_name || nameMap[match.p1_char_id] || `#${match.p1_char_id}`) : null
                        const p2Name = match.p2_char_id ? (match.p2_name || nameMap[match.p2_char_id] || `#${match.p2_char_id}`) : null
                        const isBye = match.status === 'bye'
                        const isActive = match.status === 'active'
                        const isComplete = match.status === 'completed'
                        const myMatch = match.p1_char_id === charId || match.p2_char_id === charId

                        return (
                          <div key={match.id}
                            className={cn(
                              "rounded-lg border text-xs transition-colors",
                              myMatch ? "border-primary/60 bg-primary/5" :
                              isActive ? "border-yellow-500/40 bg-yellow-500/5" :
                              "border-border bg-card"
                            )}>
                            {/* Player 1 */}
                            <div className={cn(
                              "flex items-center justify-between px-3 py-2 border-b border-border/50",
                              isComplete && match.winner_char_id === match.p1_char_id && "text-yellow-400 font-semibold"
                            )}>
                              <span className="truncate max-w-[140px]">
                                {p1Name || (isBye ? '—' : <span className="text-muted-foreground italic">TBD</span>)}
                              </span>
                              {isComplete && match.winner_char_id === match.p1_char_id && <Crown className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
                            </div>
                            {/* Player 2 */}
                            <div className={cn(
                              "flex items-center justify-between px-3 py-2",
                              isComplete && match.winner_char_id === match.p2_char_id && "text-yellow-400 font-semibold"
                            )}>
                              <span className="truncate max-w-[140px]">
                                {p2Name || (isBye ? <span className="text-muted-foreground">BYE</span> : <span className="text-muted-foreground italic">TBD</span>)}
                              </span>
                              {isComplete && match.winner_char_id === match.p2_char_id && <Crown className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
                            </div>
                            {/* Match status bar */}
                            {isActive && (
                              <div className="px-3 py-1 bg-yellow-500/10 text-yellow-400 text-[10px] text-center font-medium border-t border-yellow-500/20">
                                LIVE
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {/* Champion column */}
                {t.winner_char_id && (
                  <div className="flex flex-col min-w-[200px]">
                    <div className="text-xs font-bold text-center text-yellow-400 mb-2">Champion</div>
                    <div className="flex-1 flex items-center justify-center">
                      <div className="rounded-lg border-2 border-yellow-500/60 bg-yellow-500/10 p-4 text-center">
                        <Crown className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                        <p className="font-bold text-yellow-400">
                          {t.winner_name || nameMap[t.winner_char_id] || `#${t.winner_char_id}`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Bracket not generated yet</p>
              {participants.length > 0 && (
                <p className="text-xs mt-2">{participants.length} fighters registered</p>
              )}
            </div>
          )}

          {/* Participants list */}
          {participants.length > 0 && (
            <div className="p-4 border-t border-border">
              <h4 className="text-sm font-bold mb-2 text-muted-foreground">
                Participants ({participants.length})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {participants.sort((a, b) => (a.seed || 99) - (b.seed || 99)).map(p => (
                  <div key={p.character_id}
                    className={cn(
                      "text-xs px-2 py-1.5 rounded border flex items-center justify-between",
                      p.status === 'eliminated' ? "opacity-40 line-through border-border" :
                      p.status === 'winner' ? "border-yellow-500/40 text-yellow-400" :
                      p.character_id === charId ? "border-primary/40 text-primary" :
                      "border-border"
                    )}>
                    <span className="truncate">{p.seed ? `#${p.seed} ` : ''}{p.name}</span>
                    <span className="text-muted-foreground ml-1">{p.wins}W {p.losses}L</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // VIEW: Leaderboard
  // ═══════════════════════════════════════════════════════════════
  if (view === 'leaderboard') {
    return (
      <div className="flex flex-col h-full max-w-5xl mx-auto w-full">
        {header}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="text-muted-foreground text-center py-8">Loading...</p>}
          {!loading && !leaderboard.length && (
            <p className="text-center py-8 text-muted-foreground">No tournament history yet</p>
          )}
          <div className="space-y-1">
            {leaderboard.map((entry, i) => (
              <div key={entry.character_id}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-lg text-sm",
                  i === 0 ? "bg-yellow-500/10 border border-yellow-500/30" :
                  i === 1 ? "bg-gray-400/10 border border-gray-400/20" :
                  i === 2 ? "bg-orange-500/10 border border-orange-500/20" :
                  "hover:bg-muted/50"
                )}>
                <div className="flex items-center gap-3">
                  <span className={cn("font-bold text-lg w-8",
                    i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-orange-400" : "text-muted-foreground"
                  )}>
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium">{entry.name}</p>
                    <p className="text-xs text-muted-foreground">Lv.{entry.level}</p>
                  </div>
                </div>
                <div className="text-right text-xs">
                  <p><span className="text-yellow-400 font-bold">{entry.wins}</span> wins</p>
                  <p className="text-muted-foreground">{entry.tournaments_entered} entered / {entry.podiums} podiums</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return <div className="p-4 text-muted-foreground text-center">Loading...</div>
}
