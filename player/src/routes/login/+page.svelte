<script lang="ts">
  import { goto } from '$app/navigation'
  import { auth } from '$stores/auth.svelte'
  import { branding } from '$stores/branding.svelte'
  import GothicAtmosphere from '$components/GothicAtmosphere.svelte'
  import AmbientWeather from '$components/AmbientWeather.svelte'

  let username = $state('')
  let password = $state('')
  let mode = $state<'login' | 'register'>('login')
  let email = $state('')

  // Audio gated behind a user gesture. Form interaction (typing in
  // the username field) counts — flip on the first keystroke.
  let audioOn = $state(false)
  function unlockAudio() { if (!audioOn) audioOn = true }

  // Default the form to login when registration is admin-disabled.
  $effect(() => {
    if (!branding.values.login_register_enabled && mode === 'register') {
      mode = 'login'
    }
  })

  async function submit(e: Event) {
    e.preventDefault()
    try {
      if (mode === 'login') await auth.login(username, password)
      else await auth.register(username, password, email || undefined)
      goto('/play')
    } catch {
      // store sets `auth.error`
    }
  }

  const accent = $derived(branding.values.splash_accent_color)
  const atmosphere = $derived(branding.values.splash_atmosphere)
</script>

<div
  class="wrap"
  style="
    --splash-bg-top: {branding.values.splash_bg_color_top};
    --splash-bg-mid: {branding.values.splash_bg_color_mid};
    --splash-accent: {accent};
  "
>
  {#if atmosphere === 'gothic'}
    <GothicAtmosphere
      embers={branding.values.splash_show_embers ? branding.values.splash_embers_count + 6 : 0}
      rain={branding.values.splash_show_embers ? 70 : 0}
      intensity={1}
    />
    <AmbientWeather enabled={audioOn} thunderInterval={28} rainGain={0.14} />
  {:else if atmosphere === 'minimal'}
    <div class="minimal-bg" aria-hidden="true"></div>
  {/if}

  <button
    type="button"
    class="audio-toggle"
    onclick={() => (audioOn = !audioOn)}
    aria-label={audioOn ? 'Mute ambient' : 'Enable ambient sound'}
    title={audioOn ? 'Mute ambient' : 'Enable ambient sound'}
  >
    {audioOn ? '🔊' : '🔇'}
  </button>

  <div class="card">
    {#if branding.values.splash_logo_url}
      <img class="logo" src={branding.values.splash_logo_url} alt="" />
    {:else}
      <div class="card-sigil" aria-hidden="true">
        <svg viewBox="0 0 80 80" width="80" height="80">
          <path d="M40 8 L66 24 L66 56 L40 72 L14 56 L14 24 Z"
                fill="none" stroke={accent} stroke-width="1.6" stroke-linejoin="round" />
          <path d="M40 16 L40 64 M22 28 L58 52 M58 28 L22 52"
                stroke={accent} stroke-width="1.2" stroke-linecap="round" />
          <circle cx="40" cy="40" r="3.5" fill={accent} />
        </svg>
      </div>
    {/if}

    <h1>{branding.values.splash_title}</h1>
    <p class="subtitle">
      {mode === 'login' ? branding.values.login_subtitle : 'Forge your name'}
    </p>

    {#if branding.values.login_quote}
      <blockquote class="flavor">
        "{branding.values.login_quote}"
        {#if branding.values.login_quote_author}
          <footer>— {branding.values.login_quote_author}</footer>
        {/if}
      </blockquote>
    {/if}

    <form onsubmit={submit}>
      <label>
        <span>Username</span>
        <input
          type="text"
          autocomplete="username"
          bind:value={username}
          oninput={unlockAudio}
          required
          minlength="3"
          maxlength="32"
        />
      </label>

      {#if mode === 'register'}
        <label>
          <span>Email <em>(optional)</em></span>
          <input type="email" autocomplete="email" bind:value={email} />
        </label>
      {/if}

      <label>
        <span>Password</span>
        <input
          type="password"
          autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
          bind:value={password}
          required
          minlength="6"
        />
      </label>

      {#if auth.error}
        <p class="error">{auth.error}</p>
      {/if}

      <button class="primary" type="submit" disabled={auth.loading}>
        {#if auth.loading}…{:else}{mode === 'login' ? branding.values.login_button_login : branding.values.login_button_register}{/if}
      </button>
    </form>

    {#if branding.values.login_register_enabled}
      <p class="toggle">
        {#if mode === 'login'}
          New here?
          <button class="link" type="button" onclick={() => (mode = 'register')}>Create an account</button>
        {:else}
          Have an account?
          <button class="link" type="button" onclick={() => (mode = 'login')}>Sign in</button>
        {/if}
      </p>
    {/if}
  </div>
</div>

<style>
  .wrap {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    position: relative;
    overflow: hidden;
    background: radial-gradient(ellipse at center, var(--splash-bg-top, #110608) 0%, var(--splash-bg-mid, #050204) 70%, #000 100%);
  }

  .minimal-bg {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 800px 500px at 50% 0%, rgba(255, 255, 255, 0.04), transparent 70%),
      radial-gradient(ellipse 600px 400px at 50% 100%, rgba(255, 255, 255, 0.02), transparent 70%);
  }

  .logo {
    display: block;
    margin: 0 auto 1rem;
    max-height: 80px;
    max-width: 200px;
    filter: drop-shadow(0 0 12px var(--splash-accent));
  }

  .flavor {
    margin: 0 0 1.25rem;
    padding: 0.5rem 0.75rem;
    border-left: 2px solid var(--splash-accent);
    background: rgba(0, 0, 0, 0.3);
    font-style: italic;
    font-size: 0.8125rem;
    color: var(--fg-muted);
  }
  .flavor footer {
    margin-top: 0.25rem;
    font-style: normal;
    color: var(--splash-accent);
    font-size: 0.6875rem;
    text-align: right;
  }

  .card {
    z-index: 1;
    background: linear-gradient(180deg, var(--surface), var(--surface-2));
    border: 1px solid var(--border-strong);
    border-radius: 0.25rem;
    padding: 2rem;
    width: 100%;
    max-width: 380px;
    box-shadow:
      0 0 0 1px rgba(178, 34, 34, 0.06),
      0 20px 60px rgba(0, 0, 0, 0.7),
      inset 0 1px 0 rgba(178, 34, 34, 0.08);
    position: relative;
  }
  .card::before {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    background: linear-gradient(180deg, rgba(178, 34, 34, 0.4), transparent 30%);
    pointer-events: none;
    -webkit-mask: linear-gradient(#000, transparent);
            mask: linear-gradient(#000, transparent);
  }

  .card-sigil {
    display: flex;
    justify-content: center;
    margin-bottom: 0.75rem;
    filter: drop-shadow(0 0 12px rgba(216, 58, 58, 0.4));
  }

  h1 {
    text-align: center;
    margin: 0 0 0.25rem;
    color: var(--accent);
    letter-spacing: 0.12em;
    font-size: 1.7rem;
    text-transform: uppercase;
    text-shadow: 0 0 12px rgba(178, 34, 34, 0.5), 0 2px 0 #000;
  }
  .subtitle {
    margin: 0 0 1.5rem;
    color: var(--accent);
    font-size: 0.8125rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    text-align: center;
    font-style: italic;
    opacity: 0.85;
  }
  form { display: flex; flex-direction: column; gap: 1rem; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; }
  label span { color: var(--fg-muted); letter-spacing: 0.04em; text-transform: uppercase; font-size: 0.6875rem; }
  label em { font-style: normal; color: var(--fg-dim); font-size: 0.75rem; text-transform: none; }
  .primary {
    background: linear-gradient(180deg, var(--accent-hot), var(--accent-deep));
    color: var(--accent-on);
    border: 1px solid var(--accent-deep);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.7rem;
    margin-top: 0.5rem;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
    box-shadow: 0 0 12px rgba(178, 34, 34, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }
  .primary:hover:not(:disabled) {
    background: linear-gradient(180deg, #ff4848, var(--accent));
    box-shadow: 0 0 18px rgba(216, 58, 58, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }
  .error {
    color: var(--danger);
    font-size: 0.8125rem;
    margin: 0;
  }
  .toggle {
    text-align: center;
    margin: 1rem 0 0;
    font-size: 0.8125rem;
    color: var(--fg-muted);
  }
  .link {
    background: none;
    border: none;
    color: var(--accent);
    padding: 0;
    cursor: pointer;
  }
  .link:hover { background: transparent; text-decoration: underline; }

  .audio-toggle {
    position: absolute;
    top: 1rem; right: 1rem;
    width: 40px; height: 40px;
    padding: 0;
    border: 1px solid var(--splash-accent);
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    color: var(--splash-accent);
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
    z-index: 10;
    backdrop-filter: blur(4px);
    transition: all 160ms ease;
  }
  .audio-toggle:hover {
    background: rgba(0, 0, 0, 0.7);
    box-shadow: 0 0 12px var(--splash-accent);
  }
</style>
