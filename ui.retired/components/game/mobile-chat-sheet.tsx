"use client"

import { Sheet, SheetContent } from "@/components/ui/sheet"
import { ChatPanel } from "./chat-panel"

interface MobileChatSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MobileChatSheet({ open, onOpenChange }: MobileChatSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="p-0 bg-card border-border rounded-t-2xl h-[75dvh] [&>button:last-child]:hidden">
        <div className="flex justify-center py-2">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="flex-1 overflow-hidden px-2 pb-2">
          <ChatPanel embedded />
        </div>
      </SheetContent>
    </Sheet>
  )
}
