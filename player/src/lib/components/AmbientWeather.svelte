<script lang="ts">
  // AmbientWeather — procedural rain + occasional thunder + lightning flash.
  //
  // No audio assets. Rain is band-passed pink noise looped via Web Audio;
  // thunder is a low-passed noise burst with a slow envelope. Lightning is
  // a CSS overlay that flashes white-blue when a strike fires. Browsers
  // block autoplay until the first user gesture, so this component
  // exposes an `enabled` prop the parent toggles after click-to-enter.
  //
  // CPU: a single AudioContext + a couple of nodes is negligible.
  // Memory: ~8KB of pre-generated noise buffer.
  // Network: zero.

  import { onMount, onDestroy } from 'svelte'
  import { browser } from '$app/environment'
  import { settings } from '$stores/settings.svelte'

  interface Props {
    /** Master toggle. Set true after the user has clicked something
     *  (audio autoplay unlock). */
    enabled?: boolean
    /** Average seconds between thunder strikes (randomized ±50%). */
    thunderInterval?: number
    /** 0..1 base rain level. Multiplied by `settings.prefs.audioMaster`
     *  and `audioMusic` for the final gain. */
    rainGain?: number
  }
  let { enabled = false, thunderInterval = 22, rainGain = 0.18 }: Props = $props()

  let ctx: AudioContext | null = null
  let rainSrc: AudioBufferSourceNode | null = null
  let rainGainNode: GainNode | null = null
  let masterGain: GainNode | null = null
  let strikeTimer: ReturnType<typeof setTimeout> | null = null
  let flashing = $state(false)

  function ensureContext(): AudioContext | null {
    if (!browser) return null
    if (ctx) return ctx
    const Cls = (window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    if (!Cls) return null
    ctx = new Cls()
    masterGain = ctx.createGain()
    masterGain.connect(ctx.destination)
    return ctx
  }

  function buildPinkNoiseBuffer(c: AudioContext, durationSecs = 4): AudioBuffer {
    // ~4 seconds of looped pink noise. Voss-McCartney algorithm — gives
    // a 1/f spectrum that sounds like soft static, closer to natural
    // rain than flat white noise.
    const sampleRate = c.sampleRate
    const len = Math.floor(sampleRate * durationSecs)
    const buf = c.createBuffer(1, len, sampleRate)
    const out = buf.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.96900 * b2 + w * 0.1538520
      b3 = 0.86650 * b3 + w * 0.3104856
      b4 = 0.55000 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.0168980
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
      b6 = w * 0.115926
    }
    return buf
  }

  function startRain() {
    const c = ensureContext()
    if (!c || !masterGain) return
    if (c.state === 'suspended') void c.resume()

    const buf = buildPinkNoiseBuffer(c, 4)
    const src = c.createBufferSource()
    src.buffer = buf
    src.loop = true

    // Band-pass to give the noise a "rain on stone" timbre — open mids,
    // slight high-end sparkle for individual drops.
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2200
    bp.Q.value = 0.45

    const hp = c.createBiquadFilter()
    hp.type = 'highshelf'
    hp.frequency.value = 5000
    hp.gain.value = 4

    const g = c.createGain()
    g.gain.value = 0
    g.gain.setTargetAtTime(currentRainGain(), c.currentTime, 1.5) // slow fade-in

    src.connect(bp)
    bp.connect(hp)
    hp.connect(g)
    g.connect(masterGain)
    src.start()

    rainSrc = src
    rainGainNode = g
  }

  function stopRain() {
    if (!ctx || !rainGainNode || !rainSrc) return
    const t = ctx.currentTime
    rainGainNode.gain.cancelScheduledValues(t)
    rainGainNode.gain.setTargetAtTime(0, t, 0.6)
    const src = rainSrc
    setTimeout(() => { try { src.stop() } catch { /* already stopped */ } }, 1500)
    rainSrc = null
  }

  function currentRainGain(): number {
    return rainGain * settings.prefs.audioMaster * settings.prefs.audioMusic
  }

  function thunderStrike() {
    const c = ensureContext()
    if (!c || !masterGain) return

    // Visual flash starts a few ms before the audio peaks — that's
    // closer to real lightning where you see it before you hear it.
    flashing = true
    setTimeout(() => { flashing = false }, 220)

    const t0 = c.currentTime + 0.18 // small delay so flash precedes thunder
    const dur = 1.6 + Math.random() * 1.4 // 1.6–3.0s rumble

    // 1.5s of low-passed white noise as a one-shot.
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)

    const src = c.createBufferSource()
    src.buffer = buf

    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 240   // deep rumble
    lp.Q.value = 0.5

    // Slight resonance peak for body
    const peak = c.createBiquadFilter()
    peak.type = 'peaking'
    peak.frequency.value = 80
    peak.Q.value = 1.4
    peak.gain.value = 8

    const g = c.createGain()
    const peakGain = 0.6 * settings.prefs.audioMaster * settings.prefs.audioSfx
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(peakGain, t0 + 0.15)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

    src.connect(peak)
    peak.connect(lp)
    lp.connect(g)
    g.connect(masterGain)
    src.start(t0)
    src.stop(t0 + dur + 0.1)
  }

  function scheduleNextStrike() {
    const jitter = thunderInterval * (0.5 + Math.random())
    strikeTimer = setTimeout(() => {
      thunderStrike()
      scheduleNextStrike()
    }, jitter * 1000)
  }

  function start() {
    startRain()
    scheduleNextStrike()
  }

  function stop() {
    if (strikeTimer) clearTimeout(strikeTimer)
    strikeTimer = null
    stopRain()
  }

  // Reactive control — start/stop based on `enabled` prop.
  $effect(() => {
    if (!browser) return
    if (enabled) start()
    else stop()
  })

  // Keep rain volume in sync with settings.
  $effect(() => {
    if (!ctx || !rainGainNode) return
    rainGainNode.gain.setTargetAtTime(currentRainGain(), ctx.currentTime, 0.3)
  })

  onDestroy(() => {
    stop()
    if (ctx) {
      try { void ctx.close() } catch { /* may already be closed */ }
      ctx = null
    }
  })

  // Best-effort cleanup if the user navigates away with audio still playing.
  onMount(() => {
    const onUnload = () => stop()
    window.addEventListener('pagehide', onUnload)
    return () => window.removeEventListener('pagehide', onUnload)
  })
</script>

<!-- Lightning flash overlay — solid color sheet that briefly opaques. -->
<div class="lightning" class:flash={flashing} aria-hidden="true"></div>

<style>
  .lightning {
    position: fixed;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(
      ellipse 100% 80% at 50% 0%,
      rgba(220, 230, 255, 0.85),
      rgba(180, 200, 255, 0.5) 30%,
      rgba(120, 150, 220, 0.2) 55%,
      transparent 75%
    );
    opacity: 0;
    z-index: 5;
    transition: opacity 80ms ease-out;
  }
  .lightning.flash {
    opacity: 1;
    /* Three quick stutters then a fade — a real strike isn't one
       clean flash, it's a flicker burst. */
    animation: strike 240ms ease-out;
  }
  @keyframes strike {
    0%   { opacity: 0;   }
    8%   { opacity: 1;   }
    20%  { opacity: 0.3; }
    35%  { opacity: 0.95;}
    55%  { opacity: 0.2; }
    75%  { opacity: 0.7; }
    100% { opacity: 0;   }
  }
</style>
