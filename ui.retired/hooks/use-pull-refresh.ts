import { useCallback, useEffect, useRef, useState } from "react"

interface UsePullRefreshOptions {
  onRefresh: () => Promise<void> | void
  threshold?: number  // px to pull before triggering (default 80)
  disabled?: boolean
}

export function usePullRefresh({ onRefresh, threshold = 80, disabled }: UsePullRefreshOptions) {
  const [pulling, setPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || refreshing) return
    const el = containerRef.current
    if (!el || el.scrollTop > 0) return // only trigger at top of scroll
    startY.current = e.touches[0].clientY
    setPulling(true)
  }, [disabled, refreshing])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling || disabled || refreshing) return
    const el = containerRef.current
    if (!el || el.scrollTop > 0) {
      setPulling(false)
      setPullDistance(0)
      return
    }
    const dy = Math.max(0, e.touches[0].clientY - startY.current)
    // Diminishing returns — feels like rubber band
    const dampened = Math.min(dy * 0.5, threshold * 1.5)
    setPullDistance(dampened)
    if (dampened > 0) {
      e.preventDefault() // prevent browser's native pull-to-refresh
    }
  }, [pulling, disabled, refreshing, threshold])

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return
    setPulling(false)
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true)
      setPullDistance(threshold * 0.6) // hold at partial position while refreshing
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
  }, [pulling, pullDistance, threshold, refreshing, onRefresh])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  return {
    containerRef,
    pullDistance,
    refreshing,
    isPulledPastThreshold: pullDistance >= threshold,
  }
}
