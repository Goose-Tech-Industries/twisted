import "phoenix_html"
import {Socket} from "phoenix"
import {LiveSocket} from "phoenix_live_view"
import topbar from "../vendor/topbar"
import {VERSION as TWISTED_RENDER_VERSION} from "@twisted/render"
import {TwistedCanvas} from "./hooks/twisted_canvas"
import {ScriptCanvas} from "./hooks/script_canvas"
import {ConfirmPhraseGate} from "./hooks/confirm_phrase_gate"

console.log("[twisted] render-core", TWISTED_RENDER_VERSION)

const Hooks = {TwistedCanvas, ScriptCanvas, ConfirmPhraseGate}

let csrfToken = document.querySelector("meta[name='csrf-token']")?.getAttribute("content")

let liveSocket = new LiveSocket("/live", Socket, {
  longPollFallbackMs: 2500,
  params: {_csrf_token: csrfToken},
  hooks: Hooks
})

// Show progress bar on live navigation and form submits
topbar.config({barColors: {0: "#f59e0b"}, shadowColor: "rgba(0, 0, 0, .3)"})
window.addEventListener("phx:page-loading-start", _info => topbar.show(300))
window.addEventListener("phx:page-loading-stop", _info => topbar.hide())

// ── AIM-style sounds ────────────────────────────────────────────
function playAimSound(type) {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.value = 0.08

    if (type === "sign_on") {
      // Classic AIM door open: two ascending tones
      osc.frequency.value = 800
      osc.type = "sine"
      osc.start()
      osc.stop(ctx.currentTime + 0.1)
      const osc2 = ctx.createOscillator()
      osc2.connect(gain)
      osc2.frequency.value = 1200
      osc2.type = "sine"
      osc2.start(ctx.currentTime + 0.12)
      osc2.stop(ctx.currentTime + 0.22)
    } else if (type === "sign_off") {
      // Door close: descending tone
      osc.frequency.value = 600
      osc.type = "sine"
      gain.gain.value = 0.05
      osc.start()
      osc.stop(ctx.currentTime + 0.15)
    } else if (type === "message") {
      // Short blip
      osc.frequency.value = 700
      osc.type = "triangle"
      gain.gain.value = 0.04
      osc.start()
      osc.stop(ctx.currentTime + 0.08)
    } else if (type === "nudge") {
      // Rapid buzzing vibration
      osc.frequency.value = 200
      osc.type = "sawtooth"
      gain.gain.value = 0.06
      osc.start()
      osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.1)
      osc.frequency.linearRampToValueAtTime(200, ctx.currentTime + 0.2)
      osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.3)
      osc.stop(ctx.currentTime + 0.35)
    }
  } catch (e) {}
}

// Listen for LiveView push events
window.addEventListener("phx:play_sound", (e) => {
  const {type, username} = e.detail
  playAimSound(type)

  // Show a toast notification
  if (type === "sign_on" && username) {
    showToast(`${username} has signed on`, "sign_on")
  } else if (type === "sign_off" && username) {
    showToast(`${username} has signed off`, "sign_off")
  }
})

function showToast(message, type) {
  const toast = document.createElement("div")
  const colors = {
    sign_on: "bg-green-900/90 text-green-300 border border-green-700",
    nudge: "bg-amber-900/90 text-amber-300 border border-amber-700",
  }
  toast.className = `fixed top-4 right-4 z-[9999] px-4 py-2 rounded-lg text-xs font-medium shadow-lg transition-all duration-300 ${
    colors[type] || "bg-zinc-800/90 text-zinc-400 border border-zinc-700"
  }`
  toast.textContent = message
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = "0"
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}

// ── Chat message sound ─────────────────────────────────────────
window.addEventListener("phx:new_chat_msg", () => {
  playAimSound("message")
})

// ── Nudge handler ──────────────────────────────────────────────
window.addEventListener("phx:nudge", (e) => {
  playAimSound("nudge")
  showToast(`${e.detail.from} sent you a nudge!`, "nudge")
  document.querySelectorAll('[data-dm-window]').forEach(el => {
    el.classList.add('animate-bounce')
    setTimeout(() => el.classList.remove('animate-bounce'), 600)
  })
})

liveSocket.connect()

window.liveSocket = liveSocket
