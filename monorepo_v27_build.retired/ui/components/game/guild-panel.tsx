"use client"

import { useState, useEffect, useCallback } from 'react'
import { useGame } from '@/lib/game-context'
import { api, type Guild, type GuildMember, type GuildInvite } from '@/lib/game-api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Shield, 
  Crown, 
  Star, 
  Users, 
  Search, 
  Plus, 
  LogOut, 
  UserPlus,
  Check,
  X,
  Trash2,
  ChevronUp,
  ChevronDown
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function GuildPanel() {
  const { state, socket, actions } = useGame()
  const [myGuild, setMyGuild] = useState<(Guild & { rank: string }) | null>(null)
  const [members, setMembers] = useState<GuildMember[]>([])
  const [pendingInvites, setPendingInvites] = useState<GuildInvite[]>([])
  const [searchResults, setSearchResults] = useState<Guild[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', tag: '', description: '', emblem: '' })
  const [isLoading, setIsLoading] = useState(true)
  
  const charId = state.character?.charId
  
  // Load guild data
  const loadGuildData = useCallback(async () => {
    if (!charId) return
    setIsLoading(true)
    
    const res = await api.guild.getMyGuild(charId)
    if (res.success && res.data) {
      setMyGuild(res.data.guild)
      setMembers(res.data.members)
      setPendingInvites(res.data.pendingInvites || [])
    } else {
      setMyGuild(null)
      setMembers([])
      setPendingInvites([])
    }
    setIsLoading(false)
  }, [charId])
  
  useEffect(() => {
    loadGuildData()
  }, [loadGuildData])
  
  // Socket listeners for real-time guild events
  useEffect(() => {
    if (!socket) return
    
    const onGuildUpdate = () => loadGuildData()
    const onGuildInvite = () => loadGuildData()
    
    socket.on('guild_update', onGuildUpdate)
    socket.on('guild_invited', onGuildInvite)
    
    return () => {
      socket.off('guild_update', onGuildUpdate)
      socket.off('guild_invited', onGuildInvite)
    }
  }, [socket, loadGuildData])
  
  const searchGuilds = useCallback(async () => {
    const res = await api.guild.searchGuilds(searchQuery)
    if (res.success && res.data) {
      setSearchResults(res.data)
    }
  }, [searchQuery])
  
  const createGuild = useCallback(async () => {
    if (!charId || !createForm.name || !createForm.tag) return
    
    const res = await api.guild.createGuild(
      charId,
      createForm.name,
      createForm.tag,
      createForm.description,
      createForm.emblem || undefined
    )
    
    if (res.success) {
      actions.notify('success', `Guild "${res.data?.guildName}" created!`)
      setIsCreating(false)
      setCreateForm({ name: '', tag: '', description: '', emblem: '' })
      loadGuildData()
    } else {
      actions.notify('error', res.error || 'Failed to create guild')
    }
  }, [charId, createForm, actions, loadGuildData])
  
  const acceptInvite = useCallback(async (guildId: number) => {
    if (!socket) return
    socket.emit('guild_accept', { guildId })
    actions.notify('success', 'Joined guild!')
    setTimeout(loadGuildData, 500)
  }, [socket, actions, loadGuildData])
  
  const declineInvite = useCallback((guildId: number) => {
    if (!socket) return
    socket.emit('guild_decline', { guildId })
    setPendingInvites(prev => prev.filter(i => i.guild_id !== guildId))
  }, [socket])
  
  const leaveGuild = useCallback(() => {
    if (!socket) return
    socket.emit('guild_leave')
    actions.notify('info', 'Left guild')
    setTimeout(loadGuildData, 500)
  }, [socket, actions, loadGuildData])
  
  const disbandGuild = useCallback(async () => {
    if (!charId || !myGuild) return
    if (!confirm('Are you sure? This cannot be undone.')) return
    
    const res = await api.guild.disbandGuild(charId, myGuild.id)
    if (res.success) {
      actions.notify('warning', 'Guild disbanded')
      loadGuildData()
    }
  }, [charId, myGuild, actions, loadGuildData])
  
  const kickMember = useCallback((targetCharId: number) => {
    if (!socket) return
    socket.emit('guild_kick', { targetCharId })
    setTimeout(loadGuildData, 500)
  }, [socket, loadGuildData])
  
  const promoteMember = useCallback((targetCharId: number) => {
    if (!socket) return
    socket.emit('guild_promote', { targetCharId })
    setTimeout(loadGuildData, 500)
  }, [socket, loadGuildData])
  
  const demoteMember = useCallback((targetCharId: number) => {
    if (!socket) return
    socket.emit('guild_demote', { targetCharId })
    setTimeout(loadGuildData, 500)
  }, [socket, loadGuildData])
  
  const invitePlayer = useCallback((targetCharId: number) => {
    if (!socket) return
    socket.emit('guild_invite', { targetCharId })
    actions.notify('info', 'Invite sent')
  }, [socket, actions])
  
  const getRankIcon = (rank: string) => {
    switch (rank) {
      case 'LEADER': return <Crown className="w-4 h-4 text-yellow-500" />
      case 'OFFICER': return <Star className="w-4 h-4 text-blue-400" />
      default: return <Shield className="w-4 h-4 text-muted-foreground" />
    }
  }
  
  const canManage = myGuild?.rank === 'LEADER' || myGuild?.rank === 'OFFICER'
  const isLeader = myGuild?.rank === 'LEADER'
  
  if (isLoading) {
    return (
      <Card className="celtic-border h-full">
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-muted-foreground animate-pulse">Loading guild...</div>
        </CardContent>
      </Card>
    )
  }
  
  // No guild - show search/create
  if (!myGuild) {
    return (
      <Card className="celtic-border h-full">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-accent">
            <Shield className="w-5 h-5" />
            Guild
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {/* Pending invites */}
          {pendingInvites.length > 0 && (
            <div className="mb-4 p-3 rounded-lg border border-accent/30 bg-accent/5">
              <div className="text-xs text-accent mb-2 font-semibold">Pending Invites</div>
              <div className="space-y-2">
                {pendingInvites.map(invite => (
                  <div key={invite.id} className="flex items-center justify-between p-2 rounded bg-secondary/50">
                    <div>
                      <span className="text-sm font-medium">[{invite.tag}] {invite.guild_name}</span>
                      <div className="text-xs text-muted-foreground">from {invite.inviter_name}</div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => acceptInvite(invite.guild_id)}>
                        <Check className="w-4 h-4 text-green-400" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => declineInvite(invite.guild_id)}>
                        <X className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <Tabs defaultValue="search">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="search" className="flex-1">Find Guild</TabsTrigger>
              <TabsTrigger value="create" className="flex-1">Create Guild</TabsTrigger>
            </TabsList>
            
            <TabsContent value="search" className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Search guilds..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchGuilds()}
                />
                <Button variant="outline" onClick={searchGuilds}>
                  <Search className="w-4 h-4" />
                </Button>
              </div>
              
              <ScrollArea className="h-64">
                {searchResults.length > 0 ? (
                  <div className="space-y-2">
                    {searchResults.map(guild => (
                      <div key={guild.id} className="p-3 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{guild.emblem || ''}</span>
                              <span className="font-semibold">[{guild.tag}] {guild.name}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {guild.member_count || 0} members
                            </div>
                          </div>
                        </div>
                        {guild.description && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{guild.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    {searchQuery ? 'No guilds found' : 'Search for a guild to join'}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="create" className="space-y-3">
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Guild Name</label>
                  <Input
                    placeholder="Enter guild name..."
                    value={createForm.name}
                    onChange={e => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Tag (2-6 chars)</label>
                    <Input
                      placeholder="TAG"
                      maxLength={6}
                      value={createForm.tag}
                      onChange={e => setCreateForm(prev => ({ ...prev, tag: e.target.value.toUpperCase() }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Emblem</label>
                    <Input
                      placeholder="Emoji"
                      maxLength={2}
                      value={createForm.emblem}
                      onChange={e => setCreateForm(prev => ({ ...prev, emblem: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                  <Textarea
                    placeholder="Tell others about your guild..."
                    value={createForm.description}
                    onChange={e => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>
                <Button onClick={createGuild} disabled={!createForm.name || !createForm.tag} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Guild
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    )
  }
  
  // Has guild - show guild view
  return (
    <Card className="celtic-border h-full">
      <CardHeader className="border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-accent">
            <span className="text-xl">{myGuild.emblem || ''}</span>
            [{myGuild.tag}] {myGuild.name}
          </CardTitle>
          <Badge variant="outline" className="gap-1">
            {getRankIcon(myGuild.rank)}
            {myGuild.rank}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="members">
          <TabsList className="w-full rounded-none border-b border-border bg-transparent">
            <TabsTrigger value="members" className="flex-1 data-[state=active]:bg-secondary/50">
              <Users className="w-4 h-4 mr-1" />
              Members
            </TabsTrigger>
            <TabsTrigger value="manage" className="flex-1 data-[state=active]:bg-secondary/50">
              Settings
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="members" className="p-4 mt-0">
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {members.map(member => (
                  <div key={member.char_id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center gap-3">
                      {getRankIcon(member.rank)}
                      <div>
                        <div className="font-medium text-sm">{member.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Lv.{member.level} {member.class_name}
                        </div>
                      </div>
                    </div>
                    
                    {canManage && member.char_id !== charId && member.rank !== 'LEADER' && (
                      <div className="flex gap-1">
                        {isLeader && member.rank === 'MEMBER' && (
                          <Button size="sm" variant="ghost" onClick={() => promoteMember(member.char_id)} title="Promote to Officer">
                            <ChevronUp className="w-4 h-4 text-blue-400" />
                          </Button>
                        )}
                        {isLeader && member.rank === 'OFFICER' && (
                          <Button size="sm" variant="ghost" onClick={() => demoteMember(member.char_id)} title="Demote to Member">
                            <ChevronDown className="w-4 h-4 text-orange-400" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => kickMember(member.char_id)} title="Kick">
                          <X className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            
            {/* Invite from nearby players */}
            {canManage && state.nearbyPlayers.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="text-xs text-muted-foreground mb-2">Invite Nearby Players</div>
                <div className="flex flex-wrap gap-2">
                  {state.nearbyPlayers.slice(0, 5).map(player => (
                    <Button
                      key={player.charId}
                      size="sm"
                      variant="outline"
                      onClick={() => invitePlayer(player.charId)}
                      className="text-xs"
                    >
                      <UserPlus className="w-3 h-3 mr-1" />
                      {player.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="manage" className="p-4 mt-0 space-y-4">
            {myGuild.description && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Description</div>
                <p className="text-sm">{myGuild.description}</p>
              </div>
            )}
            
            <div className="pt-4 border-t border-border space-y-2">
              <Button variant="outline" onClick={leaveGuild} className="w-full justify-start text-orange-400">
                <LogOut className="w-4 h-4 mr-2" />
                Leave Guild
              </Button>
              
              {isLeader && (
                <Button variant="destructive" onClick={disbandGuild} className="w-full justify-start">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Disband Guild
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
