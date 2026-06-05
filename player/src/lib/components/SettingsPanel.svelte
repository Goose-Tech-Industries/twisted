<script lang="ts">
  import { settings } from '$stores/settings.svelte'
</script>

<div class="settings">
  <header><h2>Settings</h2></header>

  <section>
    <h3>Display</h3>
    <label>
      <span>Theme</span>
      <select value={settings.prefs.theme} onchange={(e) => settings.set('theme', (e.target as HTMLSelectElement).value as never)}>
        <option value="celtic-dark">Celtic Dark</option>
        <option value="celtic-light">Celtic Light</option>
        <option value="high-contrast">High Contrast</option>
      </select>
    </label>
    <label>
      <span>HUD scale</span>
      <select value={settings.prefs.hudScale} onchange={(e) => settings.set('hudScale', Number((e.target as HTMLSelectElement).value) as never)}>
        <option value={1}>1.0×</option>
        <option value={1.25}>1.25×</option>
        <option value={1.5}>1.5×</option>
      </select>
    </label>
    <label class="check">
      <input type="checkbox" checked={settings.prefs.reduceMotion} onchange={(e) => settings.set('reduceMotion', (e.target as HTMLInputElement).checked)} />
      <span>Reduce motion <em class="note">(damps UI transitions, leaves splash atmosphere alone)</em></span>
    </label>
    <label class="check">
      <input type="checkbox" checked={settings.prefs.forceMotion} onchange={(e) => settings.set('forceMotion', (e.target as HTMLInputElement).checked)} />
      <span>Force motion on <em class="note">(overrides Brave / Firefox privacy reduce-motion)</em></span>
    </label>
    <label class="check">
      <input type="checkbox" checked={settings.prefs.showPassability} onchange={(e) => settings.set('showPassability', (e.target as HTMLInputElement).checked)} />
      <span>Show passability overlay</span>
    </label>
  </section>

  <section>
    <h3>Audio</h3>
    {#each [{ k: 'audioMaster', label: 'Master' }, { k: 'audioMusic', label: 'Music' }, { k: 'audioSfx', label: 'SFX' }] as v}
      <label>
        <span>{v.label}</span>
        <input
          type="range" min="0" max="1" step="0.05"
          value={settings.prefs[v.k as 'audioMaster' | 'audioMusic' | 'audioSfx']}
          oninput={(e) => settings.set(v.k as 'audioMaster' | 'audioMusic' | 'audioSfx', Number((e.target as HTMLInputElement).value))}
        />
        <em>{Math.round(settings.prefs[v.k as 'audioMaster' | 'audioMusic' | 'audioSfx'] * 100)}%</em>
      </label>
    {/each}
  </section>

  <section>
    <h3>Language</h3>
    <label>
      <span>Locale</span>
      <select value={settings.prefs.language} onchange={(e) => settings.set('language', (e.target as HTMLSelectElement).value)}>
        <option value="en">English</option>
        <option value="ga">Gaeilge</option>
        <option value="es">Español</option>
        <option value="de">Deutsch</option>
      </select>
    </label>
  </section>

  <footer>
    <button onclick={() => settings.reset()}>Reset to defaults</button>
  </footer>
</div>

<style>
  .settings { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow-y: auto; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
  header h2 { margin: 0; font-size: 1rem; }
  section { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
  section h3 { margin: 0 0 0.5rem; font-size: 0.75rem; text-transform: uppercase; color: var(--fg-muted); letter-spacing: 0.05em; }
  label { display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.5rem; align-items: center; font-size: 0.8125rem; margin-bottom: 0.375rem; }
  label.check { grid-template-columns: auto 1fr; }
  label em { font-style: normal; color: var(--fg-muted); font-size: 0.75rem; min-width: 3rem; text-align: right; }
  label em.note { display: block; min-width: 0; text-align: left; font-size: 0.6875rem; color: var(--fg-dim); margin-top: 0.125rem; }
  footer { padding: 0.75rem 1rem; }
</style>
