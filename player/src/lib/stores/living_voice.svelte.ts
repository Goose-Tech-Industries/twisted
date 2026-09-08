// Living Voice — Web Audio API & Sovereign Soul voice player for dialogue speech
import { browser } from "$app/environment"
import type { DialogueLine } from "./dialogue.svelte"

class LivingVoiceService {
  isPlaying = $state(false)
  isMuted = $state(false)
  level = $state(0) // 0.0 to 1.0 for audio wave visualizer

  private audioCtx: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null
  private gainNode: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private animFrameId: number | null = null

  constructor() {
    if (browser) {
      const storedMute = localStorage.getItem("twisted:voice_muted")
      if (storedMute !== null) {
        this.isMuted = storedMute === "true"
      }
    }
  }

  private initAudio() {
    if (!browser || this.audioCtx) return
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return

    this.audioCtx = new AudioContextClass()
    this.gainNode = this.audioCtx.createGain()
    this.gainNode.gain.value = 0.85

    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 64

    this.gainNode.connect(this.analyser)
    this.analyser.connect(this.audioCtx.destination)
  }

  async play(line: DialogueLine) {
    if (!browser || this.isMuted) return
    this.stop()

    if (line.audio_url) {
      try {
        this.initAudio()
        if (!this.audioCtx || !this.gainNode || !this.analyser) return

        if (this.audioCtx.state === "suspended") {
          await this.audioCtx.resume()
        }

        const resp = await fetch(line.audio_url)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const arrayBuf = await resp.arrayBuffer()
        const audioBuf = await this.audioCtx.decodeAudioData(arrayBuf)

        const source = this.audioCtx.createBufferSource()
        source.buffer = audioBuf
        source.connect(this.gainNode)

        this.currentSource = source
        this.isPlaying = true

        source.onended = () => {
          this.isPlaying = false
          this.level = 0
          if (this.animFrameId) cancelAnimationFrame(this.animFrameId)
        }

        source.start(0)
        this.startVisualizer()
      } catch (err) {
        console.warn("[LivingVoice] Web Audio failed, falling back to speech synthesis:", err)
        this.playWebSpeechFallback(line)
      }
    } else if (line.body) {
      this.playWebSpeechFallback(line)
    }
  }

  private playWebSpeechFallback(line: DialogueLine) {
    if (!browser || !window.speechSynthesis || this.isMuted) return
    window.speechSynthesis.cancel()

    // Clean text of descriptors
    const text = line.body.replace(/\*[^*]+\*/g, "").replace(/["']/g, "").trim()
    if (!text) return

    const utter = new SpeechSynthesisUtterance(text)

    // Sovereign Soul pitch/rate personality tuning
    const s = (line.speaker || "").toLowerCase()
    if (s.includes("witch") || s.includes("sorceress") || s.includes("lyra")) {
      utter.pitch = 1.18
      utter.rate = 0.92
    } else if (s.includes("warrior") || s.includes("guard") || s.includes("orc") || s.includes("valerius") || s.includes("bram") || s.includes("paladin")) {
      utter.pitch = 0.78
      utter.rate = 0.94
    } else if (s.includes("elder") || s.includes("wizard") || s.includes("king") || s.includes("sage")) {
      utter.pitch = 0.85
      utter.rate = 0.86
    } else if (s.includes("narrator") || s.includes("dm") || s.includes("dungeon master") || s.includes("chronicler") || s.includes("storyteller")) {
      utter.pitch = 0.82
      utter.rate = 0.88 // measured, atmospheric fantasy storyteller pace
      if (typeof window !== "undefined" && window.speechSynthesis) {
        const voices = window.speechSynthesis.getVoices()
        const narratorVoice = voices.find(v =>
          v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Male") || v.name.includes("Daniel") || v.name.includes("George") || v.name.includes("UK"))
        ) || voices.find(v => v.lang.startsWith("en"))
        if (narratorVoice) utter.voice = narratorVoice
      }
    } else if (s.includes("rogue") || s.includes("assassin") || s.includes("thief")) {
      utter.pitch = 0.95
      utter.rate = 1.05
    } else {
      utter.pitch = 1.0
      utter.rate = 1.0
    }

    this.isPlaying = true
    utter.onend = () => {
      this.isPlaying = false
      this.level = 0
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId)
    }
    utter.onerror = () => {
      this.isPlaying = false
      this.level = 0
    }

    window.speechSynthesis.speak(utter)
    this.simulateVisualizer()
  }

  private startVisualizer() {
    if (!this.analyser) return
    const data = new Uint8Array(this.analyser.frequencyBinCount)

    const loop = () => {
      if (!this.isPlaying || !this.analyser) {
        this.level = 0
        return
      }
      this.analyser.getByteFrequencyData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        sum += data[i]
      }
      const avg = sum / data.length
      this.level = Math.min(1.0, avg / 128.0)
      this.animFrameId = requestAnimationFrame(loop)
    }
    this.animFrameId = requestAnimationFrame(loop)
  }

  private simulateVisualizer() {
    const loop = () => {
      if (!this.isPlaying) {
        this.level = 0
        return
      }
      // Procedural breathing waveform for fallback
      this.level = 0.2 + Math.abs(Math.sin(Date.now() / 150)) * 0.6
      this.animFrameId = requestAnimationFrame(loop)
    }
    this.animFrameId = requestAnimationFrame(loop)
  }

  stop() {
    if (this.currentSource) {
      try { this.currentSource.stop() } catch (_e) {}
      this.currentSource = null
    }
    if (browser && window.speechSynthesis) {
      try { window.speechSynthesis.cancel() } catch (_e) {}
    }
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
    this.isPlaying = false
    this.level = 0
  }

  toggleMute() {
    this.isMuted = !this.isMuted
    if (this.isMuted) this.stop()
    if (browser) {
      localStorage.setItem("twisted:voice_muted", String(this.isMuted))
    }
  }
}

export const livingVoice = new LivingVoiceService()
