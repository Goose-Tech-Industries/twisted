<script lang="ts">
  import type { Character } from '$stores/character.svelte'
  import type { PanelKey } from '$components/PanelHost.svelte'
  import PanelMenu from '$components/PanelMenu.svelte'
  import { debug } from '$stores/debug.svelte'

  interface Props {
    character: Character
    active: PanelKey
    onpanel: (p: PanelKey) => void
  }
  let { character, active, onpanel }: Props = $props()

  debug.register('Character name+level', 'stub')
  debug.register('HP bar', 'stub')
  debug.register('Gold', 'stub')

  $effect(() => {
    if (character.name && character.level) debug.update('Character name+level', 'real')
    if (character.max_hp > 0) debug.update('HP bar', 'real')
    if (character.gold !== undefined) debug.update('Gold', 'real')
  })

  const hpPct = $derived(Math.max(0, Math.min(100, (character.current_hp / Math.max(1, character.max_hp)) * 100)))
  const mpPct = $derived(Math.max(0, Math.min(100, (character.current_mp / Math.max(1, character.max_mp)) * 100)))
  const xp = $derived(character.experience ?? 0)
  const xpNext = $derived(character.next_xp ?? Math.max(100, character.level * 100))
  const xpPct = $derived(Math.max(0, Math.min(100, (xp / xpNext) * 100)))
</script>

<footer class="hud">
  <div class="hud-char">
    <span class="portrait">{character.icon ?? '🗡️'}</span>
    <div class="char-text">
      <div class="name">{character.name}</div>
      <div class="meta">Lv {character.level}</div>
    </div>
  </div>

  <div class="hud-bars">
    <div class="bar hp">
      <span class="bar-icon">❤️</span>
      <div class="track"><div class="fill" style="width: {hpPct}%"></div></div>
      <span class="num">{character.current_hp} / {character.max_hp}</span>
    </div>
    <div class="bar-row-2">
      <div class="bar mp">
        <span class="bar-icon">💧</span>
        <div class="track"><div class="fill" style="width: {mpPct}%"></div></div>
        <span class="num">{character.current_mp} / {character.max_mp}</span>
      </div>
      <div class="bar xp">
        <span class="bar-icon">⚔</span>
        <div class="track"><div class="fill" style="width: {xpPct}%"></div></div>
        <span class="num">{xp} / {xpNext}</span>
      </div>
    </div>
  </div>

  <div class="hud-actions">
    <PanelMenu {active} onpick={onpanel} />
    <div class="hotbar">
      {#each Array(6) as _, i}
        <button class="slot" type="button" title="Hotbar {i + 1}">{i + 1}</button>
      {/each}
    </div>
    <span class="gold">💰 {character.gold ?? 0}g</span>
  </div>
</footer>

<style>
  .hud {
    grid-area: hud;
    display: grid;
    grid-template-columns: 280px 1fr 360px;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    height: 96px;
    background: linear-gradient(180deg, #15151a, #050505);
    border-top: 1px solid #2a2a2a;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(201, 161, 74, 0.06);
  }

  .hud-char {
    display: flex; align-items: center; gap: 0.625rem;
    min-width: 0;
  }
  .portrait {
    width: 40px; height: 40px;
    background: #050505;
    border: 1px solid #c9a14a;
    border-radius: 0.25rem;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.4rem;
    flex-shrink: 0;
    box-shadow: 0 0 8px rgba(201, 161, 74, 0.18);
  }
  .char-text { min-width: 0; }
  .name {
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 700; letter-spacing: 0.04em;
    color: #ece6e3;
    font-size: 0.875rem;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .meta { font-size: 0.7rem; color: #c9a14a; }

  .hud-bars {
    display: flex; flex-direction: column; gap: 0.375rem; min-width: 0;
  }
  .bar-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .bar {
    display: grid;
    grid-template-columns: 18px 1fr auto;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
  }
  .bar-icon { font-size: 0.85rem; line-height: 1; text-align: center; }
  .bar.hp { grid-template-columns: 18px 1fr auto; }
  .track {
    position: relative;
    height: 14px;
    background: #050505;
    border: 1px solid #2a2a2a;
    border-radius: 999px;
    overflow: hidden;
  }
  .bar.hp .track { height: 18px; }
  .track .fill {
    position: absolute; inset: 0 auto 0 0;
    transition: width 240ms ease;
  }
  .hp .fill {
    background: linear-gradient(90deg, #7a1c1c, #c93838);
    box-shadow: 0 0 8px rgba(201, 56, 56, 0.4);
  }
  .mp .fill {
    background: linear-gradient(90deg, #1c2c5c, #4a7ad8);
  }
  .xp .fill {
    background: linear-gradient(90deg, #7a5a1c, #c9a14a);
    box-shadow: 0 0 6px rgba(201, 161, 74, 0.35);
  }
  .num {
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
    color: #a39e8b;
    white-space: nowrap;
  }

  .hud-actions {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    align-items: stretch;
    min-width: 0;
  }
  .hotbar { display: flex; gap: 0.25rem; }
  .slot {
    flex: 1;
    height: 28px;
    background: #050505;
    border: 1px solid #2a2a2a;
    color: #6a665b;
    font-size: 0.7rem;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  .slot:hover { border-color: #c9a14a; color: #c9a14a; }

  .gold {
    align-self: flex-end;
    color: #c9a14a;
    font-weight: 700;
    font-size: 0.8125rem;
    text-shadow: 0 0 6px rgba(201, 161, 74, 0.3);
    white-space: nowrap;
  }

  @media (max-width: 720px) {
    .hud { grid-template-columns: auto 1fr auto; padding: 0.375rem 0.5rem; }
    .hud-char .meta { display: none; }
    .bar.xp { display: none; }
    .hotbar { display: none; }
    .gold { font-size: 0.75rem; }
  }
</style>
