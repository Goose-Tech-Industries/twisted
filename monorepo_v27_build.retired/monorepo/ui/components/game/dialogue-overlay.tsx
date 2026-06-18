"use client"

import { useState } from "react"
import { useGame } from "@/lib/game-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MessageCircle, X, ChevronRight, Send } from "lucide-react"

export function DialogueOverlay() {
  const { state, dispatch } = useGame()
  const [inputText, setInputText] = useState("")
  const [conversationHistory, setConversationHistory] = useState<{ role: 'npc' | 'player'; text: string }[]>([])
  const [isTyping, setIsTyping] = useState(false)
  
  const dialogue = state.dialogue
  
  if (!dialogue) return null
  
  const handleChoice = (choiceId: number) => {
    const choice = dialogue.choices?.find(c => c.id === choiceId)
    if (!choice) return
    
    // Add player's choice to history
    setConversationHistory(prev => [...prev, { role: 'player', text: choice.label }])
    
    // Simulate NPC response
    setIsTyping(true)
    setTimeout(() => {
      const responses = [
        "Indeed, the shadows grow longer each day. Something stirs in the old barrows.",
        "I've seen things in my years, traveler. But nothing quite like what's coming.",
        "The Blood Oghams... they speak of them in hushed tones now. More than usual.",
        "Safe travels, stranger. May your blade stay sharp and your wits sharper.",
        "There's work to be done, if you're the type for it. Speak to the Guard Captain."
      ]
      const response = responses[Math.floor(Math.random() * responses.length)]
      setConversationHistory(prev => [...prev, { role: 'npc', text: response }])
      setIsTyping(false)
    }, 1000)
  }
  
  const handleSend = () => {
    if (!inputText.trim()) return
    
    // Add player message
    setConversationHistory(prev => [...prev, { role: 'player', text: inputText }])
    setInputText("")
    
    // Simulate NPC thinking and responding
    setIsTyping(true)
    setTimeout(() => {
      const responses = [
        "Hmm, an interesting question. Let me think on it...",
        "*The NPC considers your words carefully* Perhaps there is more to this than meets the eye.",
        "You ask dangerous questions, traveler. Not all answers are meant to be found.",
        "I've heard rumors of such things. But to speak of them openly... that would be unwise.",
        "The old ways still hold power here. Remember that."
      ]
      const response = responses[Math.floor(Math.random() * responses.length)]
      setConversationHistory(prev => [...prev, { role: 'npc', text: response }])
      setIsTyping(false)
    }, 1500)
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
              <p className="text-xs text-muted-foreground">NPC - Friendly</p>
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
            </div>
          )}
          
          {/* Initial Dialogue Text */}
          {conversationHistory.length === 0 && (
            <div className="bg-[oklch(0.55_0.12_185)]/5 border border-[oklch(0.55_0.12_185)]/20 rounded-lg p-4 mb-4">
              <p className="text-foreground leading-relaxed italic">
                "{dialogue.text}"
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
