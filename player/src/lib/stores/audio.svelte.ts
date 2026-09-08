// WebAudio Synthesizer & Sound FX Engine
// Generates crisp, low-latency combat, UI, card, and dice audio effects directly
// via WebAudio oscillators and noise buffers without requiring external audio assets.

export type SoundType =
  | 'hit'
  | 'crit'
  | 'spell'
  | 'heal'
  | 'stagger'
  | 'dice'
  | 'card'
  | 'card_flip'
  | 'victory'
  | 'defeat'
  | 'click'
  | 'flee'

class AudioManager {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private isMuted: boolean = false
  private volume: number = 0.7

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const savedMute = localStorage.getItem('twisted_audio_muted')
        if (savedMute !== null) this.isMuted = savedMute === 'true'
        const savedVol = localStorage.getItem('twisted_audio_volume')
        if (savedVol !== null) this.volume = parseFloat(savedVol) || 0.7
      } catch (_) {}
    }
  }

  private initContext() {
    if (typeof window === 'undefined') return false
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return false
      this.ctx = new AudioCtx()
      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime)
      this.masterGain.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return true
  }

  get muted(): boolean {
    return this.isMuted
  }

  setMuted(muted: boolean) {
    this.isMuted = muted
    try {
      localStorage.setItem('twisted_audio_muted', String(muted))
    } catch (_) {}
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : this.volume, this.ctx.currentTime)
    }
  }

  get masterVolume(): number {
    return this.volume
  }

  setMasterVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol))
    try {
      localStorage.setItem('twisted_audio_volume', String(this.volume))
    } catch (_) {}
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime)
    }
  }

  play(type: SoundType) {
    if (this.isMuted) return
    if (!this.initContext() || !this.ctx || !this.masterGain) return

    const now = this.ctx.currentTime

    switch (type) {
      case 'hit':
        this.synthHit(now, false)
        break
      case 'crit':
        this.synthHit(now, true)
        break
      case 'spell':
        this.synthSpell(now)
        break
      case 'heal':
        this.synthHeal(now)
        break
      case 'stagger':
        this.synthStagger(now)
        break
      case 'dice':
        this.synthDice(now)
        break
      case 'card':
        this.synthCard(now)
        break
      case 'card_flip':
        this.synthCardFlip(now)
        break
      case 'victory':
        this.synthVictory(now)
        break
      case 'defeat':
        this.synthDefeat(now)
        break
      case 'click':
        this.synthClick(now)
        break
      case 'flee':
        this.synthFlee(now)
        break
    }
  }

  // ── Synthesizers ────────────────────────────────────────────────

  // Physical hit / critical impact
  private synthHit(now: number, isCrit: boolean) {
    if (!this.ctx || !this.masterGain) return

    // Sub thump
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = isCrit ? 'sawtooth' : 'triangle'
    osc.frequency.setValueAtTime(isCrit ? 160 : 120, now)
    osc.frequency.exponentialRampToValueAtTime(30, now + (isCrit ? 0.25 : 0.15))

    gain.gain.setValueAtTime(isCrit ? 0.9 : 0.6, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isCrit ? 0.25 : 0.15))

    osc.connect(gain)
    gain.connect(this.masterGain)
    osc.start(now)
    osc.stop(now + (isCrit ? 0.25 : 0.15))

    // Punch transient noise
    const bufferSize = Math.floor(this.ctx.sampleRate * (isCrit ? 0.12 : 0.06))
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    const whiteNoise = this.ctx.createBufferSource()
    whiteNoise.buffer = noiseBuffer
    const noiseFilter = this.ctx.createBiquadFilter()
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.setValueAtTime(isCrit ? 1800 : 900, now)

    const noiseGain = this.ctx.createGain()
    noiseGain.gain.setValueAtTime(isCrit ? 0.7 : 0.4, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + (isCrit ? 0.12 : 0.06))

    whiteNoise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(this.masterGain)
    whiteNoise.start(now)

    // Critical harmonic shimmer
    if (isCrit) {
      const chime = this.ctx.createOscillator()
      const chimeGain = this.ctx.createGain()
      chime.type = 'sine'
      chime.frequency.setValueAtTime(880, now)
      chime.frequency.exponentialRampToValueAtTime(1760, now + 0.3)
      chimeGain.gain.setValueAtTime(0.35, now)
      chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
      chime.connect(chimeGain)
      chimeGain.connect(this.masterGain)
      chime.start(now)
      chime.stop(now + 0.35)
    }
  }

  // Spell cast / arcane blast
  private synthSpell(now: number) {
    if (!this.ctx || !this.masterGain) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(320, now)
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.18)
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.35)

    gain.gain.setValueAtTime(0.4, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)

    osc.connect(gain)
    gain.connect(this.masterGain)
    osc.start(now)
    osc.stop(now + 0.4)
  }

  // Holy heal / restorative chime
  private synthHeal(now: number) {
    if (!this.ctx || !this.masterGain) return
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator()
      const gain = this.ctx!.createGain()
      const startTime = now + idx * 0.06
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, startTime)

      gain.gain.setValueAtTime(0.25, startTime)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3)

      osc.connect(gain)
      gain.connect(this.masterGain!)
      osc.start(startTime)
      osc.stop(startTime + 0.3)
    })
  }

  // Armor break / Stagger impact
  private synthStagger(now: number) {
    if (!this.ctx || !this.masterGain) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(440, now)
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.3)

    gain.gain.setValueAtTime(0.8, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)

    osc.connect(gain)
    gain.connect(this.masterGain)
    osc.start(now)
    osc.stop(now + 0.35)
  }

  // Dice roll clatter
  private synthDice(now: number) {
    if (!this.ctx || !this.masterGain) return
    const clatterCount = 5
    for (let i = 0; i < clatterCount; i++) {
      const clickTime = now + i * 0.045 + Math.random() * 0.02
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(300 + Math.random() * 400, clickTime)

      gain.gain.setValueAtTime(0.3, clickTime)
      gain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.035)

      osc.connect(gain)
      gain.connect(this.masterGain)
      osc.start(clickTime)
      osc.stop(clickTime + 0.035)
    }
  }

  // Card slide & snap
  private synthCard(now: number) {
    if (!this.ctx || !this.masterGain) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(450, now)
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.07)

    gain.gain.setValueAtTime(0.4, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)

    osc.connect(gain)
    gain.connect(this.masterGain)
    osc.start(now)
    osc.stop(now + 0.08)
  }

  // Card flip / capture slap
  private synthCardFlip(now: number) {
    if (!this.ctx || !this.masterGain) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(220, now)
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.12)

    gain.gain.setValueAtTime(0.5, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14)

    osc.connect(gain)
    gain.connect(this.masterGain)
    osc.start(now)
    osc.stop(now + 0.14)
  }

  // Victory fanfare
  private synthVictory(now: number) {
    if (!this.ctx || !this.masterGain) return
    const chords = [
      { freq: 440.0, time: 0 },       // A4
      { freq: 554.37, time: 0.1 },    // C#5
      { freq: 659.25, time: 0.2 },    // E5
      { freq: 880.0, time: 0.35 }     // A5
    ]
    chords.forEach(({ freq, time }) => {
      const osc = this.ctx!.createOscillator()
      const gain = this.ctx!.createGain()
      const startTime = now + time
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, startTime)

      gain.gain.setValueAtTime(0.4, startTime)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45)

      osc.connect(gain)
      gain.connect(this.masterGain!)
      osc.start(startTime)
      osc.stop(startTime + 0.45)
    })
  }

  // Defeat / grim tone
  private synthDefeat(now: number) {
    if (!this.ctx || !this.masterGain) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(220, now)
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.7)

    gain.gain.setValueAtTime(0.5, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8)

    osc.connect(gain)
    gain.connect(this.masterGain)
    osc.start(now)
    osc.stop(now + 0.8)
  }

  // UI click
  private synthClick(now: number) {
    if (!this.ctx || !this.masterGain) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1200, now)
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.03)

    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035)

    osc.connect(gain)
    gain.connect(this.masterGain)
    osc.start(now)
    osc.stop(now + 0.035)
  }

  // Dash / Flee whoosh
  private synthFlee(now: number) {
    if (!this.ctx || !this.masterGain) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(600, now)
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.2)

    gain.gain.setValueAtTime(0.3, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)

    osc.connect(gain)
    gain.connect(this.masterGain)
    osc.start(now)
    osc.stop(now + 0.22)
  }
}

export const audio = new AudioManager()
