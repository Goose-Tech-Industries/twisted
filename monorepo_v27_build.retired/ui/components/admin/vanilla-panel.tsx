"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Loader2 } from "lucide-react"

interface VanillaPanelProps {
  /** The vanilla adminsauce manager key, e.g. "map", "spawn", "stat", "setting" */
  section: string
}

/**
 * VanillaPanel — embeds the full vanilla AdminSauce (served at /sauce)
 * inside the React admin shell.
 *
 * HOW IT WORKS:
 *   1. An iframe loads /sauce?embed=1  (the vanilla app with sidebar hidden)
 *   2. Once loaded, we postMessage { type: 'LOAD_SECTION', section } to tell it
 *      which manager to open — same as clicking the nav item inside vanilla.
 *   3. The vanilla app receives this, calls loadManager(section), and renders.
 *   4. The iframe fills the full React content area seamlessly.
 *
 * The vanilla app's own sidebar is hidden via CSS injected on its side when
 * embed=1 is in the query string, so only the content panel shows.
 */
export function VanillaPanel({ section }: VanillaPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(true)
  const [loadedSection, setLoadedSection] = useState<string | null>(null)
  const pendingSection = useRef<string>(section)

  const sendSection = useCallback((sec: string) => {
    const frame = iframeRef.current
    if (!frame?.contentWindow) return
    frame.contentWindow.postMessage({ type: 'LOAD_SECTION', section: sec }, '*')
  }, [])

  // When section prop changes, either send immediately or queue for load
  useEffect(() => {
    pendingSection.current = section
    if (!loading && loadedSection !== null) {
      sendSection(section)
      setLoadedSection(section)
    }
  }, [section, loading, loadedSection, sendSection])

  const handleLoad = useCallback(() => {
    setLoading(false)
    // Small delay to let vanilla JS initialise all managers
    setTimeout(() => {
      sendSection(pendingSection.current)
      setLoadedSection(pendingSection.current)
    }, 350)
  }, [sendSection])

  // Listen for section-change notifications from the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'SECTION_CHANGED') {
        setLoadedSection(e.data.section)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  return (
    <div className="relative w-full h-full min-h-[600px] rounded-lg overflow-hidden border border-border">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading editor…</p>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src="/sauce/?embed=1"
        onLoad={handleLoad}
        className="w-full border-0"
        style={{
          height: 'calc(100vh - 120px)',
          minHeight: 600,
          display: 'block',
          // Match the vanilla dark background so there's no white flash
          background: '#0d1117',
        }}
        title={`AdminSauce — ${section}`}
        // allow same-origin so postMessage works and cookies are sent
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
      />
    </div>
  )
}
