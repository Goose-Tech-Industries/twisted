"use client"

import { useEffect, useRef } from "react"

// ═══════════════════════════════════════════════════════════════
// MAP AMBIENT SOUND — Audio playback per map
// ═══════════════════════════════════════════════════════════════
// Plays ambient_sound_url on map enter, crossfades on map change.
// Respects user volume settings. Loops seamlessly.
// ═══════════════════════════════════════════════════════════════

interface MapAmbientSoundProps {
  soundUrl: string | null
  volume: number  // 0-1
}

export function MapAmbientSound({ soundUrl, volume }: MapAmbientSoundProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fadeRef = useRef<number>(0)
  const currentUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const targetVol = Math.max(0, Math.min(1, volume))

    // Same URL — just adjust volume
    if (soundUrl === currentUrlRef.current && audioRef.current) {
      audioRef.current.volume = targetVol
      return
    }

    // Fade out old audio
    if (audioRef.current) {
      const old = audioRef.current
      const fadeOut = () => {
        if (old.volume > 0.05) {
          old.volume = Math.max(0, old.volume - 0.05)
          fadeRef.current = requestAnimationFrame(fadeOut)
        } else {
          old.pause()
          old.src = ''
          cancelAnimationFrame(fadeRef.current)
        }
      }
      fadeOut()
    }

    currentUrlRef.current = soundUrl

    // No new sound
    if (!soundUrl) {
      audioRef.current = null
      return
    }

    // Create new audio and fade in
    const audio = new Audio()
    audio.loop = true
    audio.volume = 0
    audio.preload = 'auto'

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
    audio.src = soundUrl.startsWith('http') ? soundUrl : `${apiUrl}${soundUrl}`

    audioRef.current = audio

    const fadeIn = () => {
      if (!audioRef.current || audioRef.current !== audio) return
      if (audio.volume < targetVol - 0.05) {
        audio.volume = Math.min(targetVol, audio.volume + 0.03)
        requestAnimationFrame(fadeIn)
      } else {
        audio.volume = targetVol
      }
    }

    audio.addEventListener('canplaythrough', () => {
      audio.play().then(fadeIn).catch(() => {
        // Autoplay blocked — will play on next user interaction
        const resume = () => {
          audio.play().then(fadeIn).catch(() => {})
          document.removeEventListener('click', resume)
          document.removeEventListener('keydown', resume)
        }
        document.addEventListener('click', resume, { once: true })
        document.addEventListener('keydown', resume, { once: true })
      })
    }, { once: true })

    return () => {
      audio.pause()
      audio.src = ''
      if (audioRef.current === audio) audioRef.current = null
    }
  }, [soundUrl, volume])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      cancelAnimationFrame(fadeRef.current)
    }
  }, [])

  return null // No visible UI — audio only
}
