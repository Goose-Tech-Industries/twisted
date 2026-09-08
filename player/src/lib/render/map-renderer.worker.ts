/// <reference lib="webworker" />
//
// map-renderer.worker.ts — runs in a Web Worker. Owns a Pixi
// Application drawing to the OffscreenCanvas the main thread transfers
// in. Receives a stream of RenderState messages and pushes them through
// `@twisted/render`'s TwistedRenderer.
//
// Why this exists: keeps the render loop off the main thread so the
// 60fps Pixi tick keeps ticking even when Phoenix Channel events,
// Svelte runes, chat scrolling, etc. are saturating the UI thread.
//
// Message protocol (main → worker):
//   { type: 'init',    canvas: OffscreenCanvas, w, h, dpr }
//   { type: 'resize',  w, h }
//   { type: 'state',   state: RenderState }
//   { type: 'destroy' }
// (worker → main):
//   { type: 'ready' }
//   { type: 'tile_click', x, y }
//   { type: 'error', message }

// ── Worker DOM shim ────────────────────────────────────────────────
// Pixi v8's module init touches `document` for things like text-metrics
// canvas creation, even when the renderer itself is fed an
// OffscreenCanvas. Workers don't have a `document`. We install a minimal
// no-op stub *before* importing Pixi so its top-level code finds the
// methods it expects. Anything we don't shim throws, which is fine —
// we'd hit it from a feature we shouldn't be using in a worker anyway.
const g = globalThis as unknown as { document?: unknown; window?: unknown; HTMLCanvasElement?: unknown }
if (typeof g.document === 'undefined') {
  const noopStyle = new Proxy({}, { get: () => '', set: () => true })
  const stubElement = () => ({
    style: noopStyle,
    getContext: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    setAttribute: () => {},
    appendChild: <T>(c: T) => c,
    remove: () => {}
  })
  g.document = {
    createElement: (tag: string) => {
      // Pixi sometimes asks for a measurement canvas. Hand it an
      // OffscreenCanvas so 2D context probing actually works.
      if (tag === 'canvas' && typeof OffscreenCanvas !== 'undefined') {
        return new OffscreenCanvas(1, 1)
      }
      return stubElement()
    },
    createElementNS: () => stubElement(),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    documentElement: stubElement(),
    body: stubElement(),
    head: stubElement()
  }
}
if (typeof g.window === 'undefined') {
  // Pixi probes `window` for resize handlers + DPR. Workers don't have
  // a real `window`, so fabricate one with the properties Pixi reads
  // during init. Crucially: a numeric `devicePixelRatio` — anything else
  // multiplies through to NaN inside Pixi's `canvas.width = w * dpr` and
  // the browser rejects the assignment with "Value is not of type
  // 'unsigned long'".
  const ws = self as unknown as Record<string, unknown>
  if (typeof ws.devicePixelRatio !== 'number') ws.devicePixelRatio = 1
  if (typeof ws.innerWidth !== 'number') ws.innerWidth = 800
  if (typeof ws.innerHeight !== 'number') ws.innerHeight = 600
  ws.screen = ws.screen || { width: 800, height: 600 }
  g.window = self
}

import { TwistedRenderer, type RenderMode } from '@twisted/render'
import type { RenderState } from '@twisted/render'

type InMsg =
  | { type: 'init'; canvas: OffscreenCanvas; w: number; h: number; dpr: number; renderMode?: RenderMode }
  | { type: 'resize'; w: number; h: number }
  | { type: 'set_render_mode'; renderMode: RenderMode }
  | { type: 'state'; state: RenderState }
  | { type: 'destroy' }

type OutMsg =
  | { type: 'ready' }
  | { type: 'tile_click'; x: number; y: number }
  | { type: 'error'; message: string }

declare const self: DedicatedWorkerGlobalScope
const post = (msg: OutMsg, transfer?: Transferable[]) =>
  transfer ? self.postMessage(msg, transfer) : self.postMessage(msg)

let renderer: TwistedRenderer | null = null

self.addEventListener('message', async (e: MessageEvent<InMsg>) => {
  const msg = e.data
  try {
    switch (msg.type) {
      case 'init': {
        renderer = new TwistedRenderer({
          canvas: msg.canvas,
          canvasMode: 'play',
          renderMode: msg.renderMode || 'classic',
          tileSize: 32,
          backgroundAlpha: 1,
          resolution: msg.dpr || 1,
          callbacks: {
            onTileClick: (x, y) => post({ type: 'tile_click', x, y })
          }
        })
        await renderer.init(msg.w, msg.h)
        post({ type: 'ready' })
        break
      }
      case 'set_render_mode': {
        renderer?.setRenderMode(msg.renderMode)
        break
      }
      case 'resize': {
        // TwistedRenderer handles resize internally on the next state push;
        // a future enhancement would expose an explicit `resize(w,h)` method.
        break
      }
      case 'state': {
        if (!renderer) return
        await renderer.update(msg.state)
        break
      }
      case 'destroy': {
        renderer?.destroy()
        renderer = null
        self.close()
        break
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    post({ type: 'error', message })
  }
})
