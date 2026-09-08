/**
 * GodsEyeSonar Hook
 *
 * Implements high-tech sonar echolocation sound effects and interactive radar feedback:
 * 1. Web Audio API synthesized tactical sonar chirp sweeps (Fast & Furious / Batman echolocation).
 * 2. Audio-reactive canvas wave pulses on radar scan and target acquisition.
 */
export const GodsEyeSonar = {
  mounted() {
    this.audioCtx = null

    const initAudio = () => {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (AudioCtx) this.audioCtx = new AudioCtx()
      }
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume()
      }
    }

    // Play sonar chirp: dual sine wave swept downward with reverberant decay
    this.playSonarPing = (freq = 1400, duration = 0.8) => {
      try {
        initAudio()
        if (!this.audioCtx) return

        const ctx = this.audioCtx
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        const filter = ctx.createBiquadFilter()

        filter.type = "bandpass"
        filter.frequency.value = freq
        filter.Q.value = 5.0

        osc.type = "sine"
        osc.frequency.setValueAtTime(freq, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(freq * 0.45, ctx.currentTime + duration)

        gain.gain.setValueAtTime(0.12, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)

        osc.connect(filter)
        filter.connect(gain)
        gain.connect(ctx.destination)

        osc.start()
        osc.stop(ctx.currentTime + duration)
      } catch (e) {
        console.warn("[GodsEyeSonar] audio ping error:", e)
      }
    }

    // Play strike explosion rumble
    this.playOrbitalBoom = () => {
      try {
        initAudio()
        if (!this.audioCtx) return

        const ctx = this.audioCtx
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = "sawtooth"
        osc.frequency.setValueAtTime(140, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 1.2)

        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2)

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.start()
        osc.stop(ctx.currentTime + 1.2)
      } catch (e) {
        console.warn("[GodsEyeSonar] boom error:", e)
      }
    }

    // Listen for events from LiveView
    this.handleEvent("sonar_ping", () => {
      this.playSonarPing(1500, 0.75)
    })

    this.handleEvent("strike_dispatched", () => {
      this.playOrbitalBoom()
    })

    // User interaction unlocks Web Audio on first click
    this.el.addEventListener("click", () => initAudio(), { once: true })
  }
}
