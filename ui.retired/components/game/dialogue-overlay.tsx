"use client"

import { useState, useEffect, useRef } from "react"
import { useGame } from "@/lib/game-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MessageCircle, X, ChevronRight, Send } from "lucide-react"

export function DialogueOverlay() {
  const { state, dispatch, socket } = useGame()
  const [inputText, setInputText] = useState("")
  const [conversationHistory, setConversationHistory] = useState<{ role: 'npc' | 'player'; text: string }[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const historyEndRef = useRef<HTMLDivElement>(null)

  const dialogue = state.dialogue

  // Listen for NPC replies from the server
  useEffect(() => {
    if (!socket) return

    const handleReply = (data: { npcName: string; text: string }) => {
      setConversationHistory(prev => [...prev, { role: 'npc', text: data.text }])
      setIsTyping(false)
    }

    socket.on('npc_reply', handleReply)
    return () => { socket.off('npc_reply', handleReply) }
  }, [socket])

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversationHistory, isTyping])

  if (!dialogue) return null

  const handleChoice = (choiceId: number) => {
    const choice = dialogue.choices?.find(c => c.id === choiceId)
    if (!choice || !socket) return

    // If this choice has an original server choiceId, send it as npc_menu_choice
    if (choice.choiceId) {
      // For 'talk', keep the dialogue open for free-form chat
      if (choice.choiceId === 'talk') {
        setConversationHistory(prev => [...prev, { role: 'player', text: choice.label }])
        setIsTyping(true)
      }
      socket.emit('npc_menu_choice', { choiceId: choice.choiceId })
      // Close dialogue for choices that don't need follow-up conversation
      if (choice.choiceId !== 'talk') {
        dispatch({ type: 'SET_DIALOGUE', payload: null })
        setConversationHistory([])
      }
      return
    }

    // Legacy fallback: send as NPC talk
    setConversationHistory(prev => [...prev, { role: 'player', text: choice.label }])
    setIsTyping(true)
    const character = state.character
    if (character) {
      socket.emit('npc_talk', { x: character.x, y: character.y, message: choice.label })
    }
  }

  const handleSend = () => {
    if (!inputText.trim() || !socket) return

    const message = inputText.trim()
    setConversationHistory(prev => [...prev, { role: 'player', text: message }])
    setInputText("")
    setIsTyping(true)

    // Send to server
    const character = state.character
    if (character) {
      socket.emit('npc_talk', { x: character.x, y: character.y, message })
    }
  }

  const handleClose = () => {
    dispatch({ type: 'SET_DIALOGUE', payload: null })
    setConversationHistory([])
    setInputText("")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-sm pointer-events-auto"
        onClick={handleClose}
      />

      {/* Dialogue Box */}
      <Card className="relative w-full max-w-2xl celtic-border pointer-events-auto bg-card/95 backdrop-blur mb-8">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 p-1 rounded hover:bg-muted transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <CardContent className="p-6">
          {/* Speaker Header */}
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
            <div className="w-12 h-12 rounded-lg bg-[oklch(0.55_0.12_185)]/20 border border-[oklch(0.55_0.12_185)]/40 flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-[oklch(0.55_0.12_185)]" />
            </div>
            <div>
              <h3 className="font-bold text-lg">{dialogue.speaker}</h3>
              <p className="text-xs text-muted-foreground">NPC</p>
            </div>
          </div>

          {/* Conversation History */}
          {conversationHistory.length > 0 && (
            <div className="space-y-3 mb-4 max-h-48 overflow-y-auto">
              {conversationHistory.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    msg.role === 'player' ? "justify-end" : "justify-start"
                  )}
                >
                  <div className={cn(
                    "max-w-[80%] p-3 rounded-lg text-sm",
                    msg.role === 'player'
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-[oklch(0.55_0.12_185)]/10 border border-[oklch(0.55_0.12_185)]/30"
                  )}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-muted p-3 rounded-lg text-sm text-muted-foreground">
                    <span className="animate-pulse">typing...</span>
                  </div>
                </div>
              )}
              <div ref={historyEndRef} />
            </div>
          )}

          {/* Initial Dialogue Text */}
          {conversationHistory.length === 0 && (
            <div className="bg-[oklch(0.55_0.12_185)]/5 border border-[oklch(0.55_0.12_185)]/20 rounded-lg p-4 mb-4">
              <p className="text-foreground leading-relaxed italic">
                &ldquo;{dialogue.text}&rdquo;
              </p>
            </div>
          )}

          {/* Choices */}
          {dialogue.choices && dialogue.choices.length > 0 && conversationHistory.length === 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Choose a response:
              </p>
              {dialogue.choices.map(choice => (
                <button
                  key={choice.id}
                  onClick={() => handleChoice(choice.id)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 hover:bg-primary/10 hover:border-primary/30 transition-all text-left group"
                >
                  <span>{choice.label}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
              ))}
            </div>
          )}

          {/* Free-form Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Say something..."
              className="flex-1 bg-input border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isTyping}
            />
            <Button
              onClick={handleSend}
              disabled={!inputText.trim() || isTyping}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

          {/* AI Hint */}
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            This NPC uses AI-powered dialogue. Type anything to converse.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
