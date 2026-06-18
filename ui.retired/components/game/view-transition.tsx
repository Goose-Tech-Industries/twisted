"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

// View index for determining slide direction on mobile.
// Lower index = more "left" in the nav hierarchy.
const VIEW_ORDER: Record<string, number> = {
  character: 0, inventory: 1, oghams: 2, skills: 3,
  quests: 4, map: 5, bestiary: 6,
  battle: 7,
  party: 8, companions: 9, guild: 10,
  achievements: 11, leaderboards: 12, crafting: 13,
}

function getIndex(view: string): number {
  return VIEW_ORDER[view] ?? 99
}

interface ViewTransitionProps {
  viewKey: string
  children: ReactNode
  className?: string
  /** "slide" for mobile (directional), "fade" for desktop */
  mode?: "slide" | "fade"
}

export function ViewTransition({ viewKey, children, className = "", mode = "fade" }: ViewTransitionProps) {
  const [activeKey, setActiveKey] = useState(viewKey)
  const [activeContent, setActiveContent] = useState<ReactNode>(children)
  const [animClass, setAnimClass] = useState("")
  const prevKeyRef = useRef(viewKey)
  const isTransitioning = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    // On first render or same key — just update content directly
    if (viewKey === prevKeyRef.current) {
      setActiveContent(children)
      return
    }

    // Already transitioning — skip stacking animations, jump to new view
    if (isTransitioning.current && timerRef.current) {
      clearTimeout(timerRef.current)
    }

    const dir = getIndex(viewKey) > getIndex(prevKeyRef.current) ? "left" : "right"
    prevKeyRef.current = viewKey
    isTransitioning.current = true

    // Phase 1: exit current content
    if (mode === "slide") {
      setAnimClass(dir === "left" ? "view-slide-out-left" : "view-slide-out-right")
    } else {
      setAnimClass("view-fade-out")
    }

    timerRef.current = setTimeout(() => {
      // Phase 2: swap in new content + enter animation
      setActiveKey(viewKey)
      setActiveContent(children)

      if (mode === "slide") {
        setAnimClass(dir === "left" ? "view-slide-in-right" : "view-slide-in-left")
      } else {
        setAnimClass("view-fade-in")
      }

      timerRef.current = setTimeout(() => {
        // Phase 3: clean up
        setAnimClass("")
        isTransitioning.current = false
      }, 200)
    }, 150)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [viewKey]) // intentionally only trigger on viewKey change, not children

  // Keep content fresh when children update for the SAME view (e.g. battle state changes)
  useEffect(() => {
    if (viewKey === activeKey && !isTransitioning.current) {
      setActiveContent(children)
    }
  }, [children, viewKey, activeKey])

  return (
    <div
      className={`${className} ${animClass}`.trim()}
      style={{ willChange: animClass ? "transform, opacity" : "auto" }}
    >
      {activeContent}
    </div>
  )
}
