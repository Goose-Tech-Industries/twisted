<script lang="ts">
  import type { Character } from '$stores/character.svelte'

  interface Props { character: Character }
  let { character }: Props = $props()

  const stats = $derived([
    { k: 'ATK',   v: character.atk   },
    { k: 'DEF',   v: character.def   },
    { k: 'MO',    v: character.mo    },
    { k: 'MD',    v: character.md    },
    { k: 'SPD',   v: character.speed },
    { k: 'LUCK',  v: character.luck  }
  ].filter(s => s.v !== undefined))
</script>

<div class="sheet">
  <header>
    <span class="icon">{character.icon ?? '🗡️'}</span>
    <div>
      <h2>{character.name}</h2>
      <span class="sub">Lv {character.level}{character.race_name ? ` · ${character.race_name}` : ''}{character.class_name ? ` ${character.class_name}` : ''}</span>
    </div>
  </header>

  <section class="vitals">
    <div class="bar hp">
      <span class="lbl">HP</span>
      <div class="track"><div class="fill" style="width: {(character.current_hp / Math.max(1, character.max_hp)) * 100}%"></div></div>
      <span class="num">{character.current_hp} / {character.max_hp}</span>
    </div>
    <div class="bar mp">
      <span class="lbl">MP</span>
      <div class="track"><div class="fill" style="width: {(character.current_mp / Math.max(1, character.max_mp)) * 100}%"></div></div>
      <span class="num">{character.current_mp} / {character.max_mp}</span>
    </div>
  </section>

  <section class="stats">
    {#each stats as s}
      <div class="stat">
        <span class="lbl">{s.k}</span>
        <span class="num">{s.v}</span>
      </div>
    {/each}
  </section>

  {#if character.limitbreak !== undefined}
    <section class="limit">
      <p class="lbl">Limit Break</p>
      <div class="lb-bar"><div class="fill" style="width: {Math.min(100, character.limitbreak)}%"></div></div>
    </section>
  {/if}
</div>

<style>
  .sheet { display: flex; flex-direction: column; height: 100%; padding: 1rem; gap: 0.75rem; overflow-y: auto; }
  header { display: flex; align-items: center; gap: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border); }
  .icon { font-size: 2rem; }
  header h2 { margin: 0; font-size: 1.125rem; }
  .sub { font-size: 0.8125rem; color: var(--fg-muted); }

  .vitals { display: flex; flex-direction: column; gap: 0.375rem; }
  .bar { display: grid; grid-template-columns: 2rem 1fr auto; gap: 0.5rem; align-items: center; font-size: 0.75rem; }
  .lbl { color: var(--fg-muted); }
  .track { height: 14px; background: var(--surface-2); border-radius: 0.25rem; overflow: hidden; }
  .track .fill { height: 100%; transition: width 240ms; }
  .bar.hp .fill { background: var(--danger); }
  .bar.mp .fill { background: #5b8def; }
  .num { font-variant-numeric: tabular-nums; font-size: 0.75rem; }

  .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.375rem; }
  .stat { display: flex; justify-content: space-between; padding: 0.375rem 0.625rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.25rem; }

  .limit .lb-bar { height: 6px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 3px; overflow: hidden; }
  .limit .lb-bar .fill { height: 100%; background: linear-gradient(90deg, var(--accent), #ff7a00); }
</style>
