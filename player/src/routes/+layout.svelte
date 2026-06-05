<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import { browser } from '$app/environment'
  import { auth } from '$stores/auth.svelte'
  import { notifications } from '$stores/notifications.svelte'
  import { settings } from '$stores/settings.svelte'
  import Toasts from '$components/Toasts.svelte'

  let { children } = $props()

  onMount(async () => {
    try { await auth.restore() } catch { /* token expired — handled by store */ }
  })

  // ── Apply player preferences to the DOM ───────────────────────────
  // Settings live in localStorage via the store. This effect mirrors
  // them into <html> attributes / CSS custom properties so all CSS that
  // reads them updates the moment the user toggles a switch — no reload.
  $effect(() => {
    if (!browser) return
    const root = document.documentElement
    const p = settings.prefs

    // Theme: toggle a data-theme attribute that the CSS palette overrides
    // can hook into. Defaults to 'celtic-dark' when the value is unset.
    root.setAttribute('data-theme', p.theme)

    // HUD scale: drives a CSS custom property so any spacing or font-size
    // declared via `var(--hud-scale)` reacts immediately.
    root.style.setProperty('--hud-scale', String(p.hudScale))
    root.style.fontSize = `${16 * p.hudScale}px`

    // Reduce motion: swap a data attribute that disables animations
    // globally (selectors live in app.css).
    root.dataset.reduceMotion = p.reduceMotion ? 'true' : 'false'

    // Passability overlay: stored on root for the MapView's $effect
    // to read without prop-drilling.
    root.dataset.showPassability = p.showPassability ? 'true' : 'false'

    // Audio levels — exposed as CSS vars so a future audio engine can
    // multiply against them, and read directly when needed.
    root.style.setProperty('--audio-master', String(p.audioMaster))
    root.style.setProperty('--audio-music',  String(p.audioMusic))
    root.style.setProperty('--audio-sfx',    String(p.audioSfx))
  })
</script>

<svelte:head>
  <link rel="preconnect" href="/socket" />
</svelte:head>

<div class="app-shell">
  {@render children()}
</div>

<Toasts items={notifications.items} ondismiss={(id) => notifications.dismiss(id)} />

<style>
  .app-shell { min-height: 100vh; display: flex; flex-direction: column; }
</style>
