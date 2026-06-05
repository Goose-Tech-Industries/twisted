<script lang="ts">
  import type { Character } from '$stores/character.svelte'
  import type { PanelKey } from './PanelHost.svelte'
  import PanelMenu from './PanelMenu.svelte'

  interface Props {
    character: Character
    onpanel: (p: PanelKey) => void
    active: PanelKey
  }
  let { character, onpanel, active }: Props = $props()

  const hpPct = $derived(Math.max(0, Math.min(100, (character.current_hp / Math.max(1, character.max_hp)) * 100)))
  const mpPct = $derived(Math.max(0, Math.min(100, (character.current_mp / Math.max(1, character.max_mp)) * 100)))
  const xp = $derived(character.experience ?? 0)
  const xpNext = $derived(character.next_xp ?? Math.max(100, character.level * 100))
  const xpPct = $derived(Math.max(0, Math.min(100, (xp / xpNext) * 100)))
</script>

<footer class="status-bar">
  <div class="info">
    <div class="char">
      <span class="icon">{character.icon ?? '🗡️'}</span>
      <span class="name">{character.name}</span>
      <span class="lv">Lv {character.level}</span>
    </div>
    <div class="bars">
      <div class="bar hp"><div class="fill" style="width: {hpPct}%"></div><span>{character.current_hp} / {character.max_hp}</span></div>
      <div class="bar mp"><div class="fill" style="width: {mpPct}%"></div><span>{character.current_mp} / {character.max_mp}</span></div>
      <div class="bar xp"><div class="fill" style="width: {xpPct}%"></div><span>XP {xp} / {xpNext}</span></div>
    </div>
  </div>

  <PanelMenu {active} onpick={onpanel} />

  <span class="gold">💰 {character.gold ?? 0}</span>
</footer>

<style>
  .status-bar {
    grid-area: status;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 1rem;
    border-top: 1px solid var(--border-strong);
    background: linear-gradient(180deg, var(--surface), #050304);
    box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(178, 34, 34, 0.08);
  }
  .info { display: flex; align-items: center; gap: 1rem; min-width: 0; flex: 1; }
  .char { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
  .icon { font-size: 1.25rem; filter: drop-shadow(0 0 4px rgba(178, 34, 34, 0.4)); }
  .name { font-family: 'Cinzel', Georgia, serif; font-weight: 600; letter-spacing: 0.03em; color: var(--fg); }
  .lv { color: var(--accent); font-size: 0.8125rem; font-weight: 600; }
  .bars { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; flex: 1; min-width: 0; }
  .bar {
    position: relative;
    height: 18px;
    background: #0a0608;
    border: 1px solid var(--border);
    border-radius: 0.125rem;
    overflow: hidden;
    font-size: 0.75rem;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.7);
  }
  .bar .fill {
    position: absolute; inset: 0 auto 0 0;
    transition: width 240ms ease;
  }
  .bar span {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    text-shadow: 0 0 4px rgba(0,0,0,0.9), 0 1px 1px #000;
    font-weight: 600;
    color: var(--fg);
    letter-spacing: 0.03em;
  }
  .hp .fill { background: linear-gradient(180deg, var(--hp-to), var(--hp-from)); box-shadow: 0 0 8px rgba(216, 58, 58, 0.4); }
  .mp .fill { background: linear-gradient(180deg, var(--mp-to), var(--mp-from)); }
  .xp .fill { background: linear-gradient(180deg, var(--xp-to), var(--xp-from)); }

  .gold {
    color: var(--accent);
    font-weight: 600;
    white-space: nowrap;
    text-shadow: 0 0 6px rgba(178, 34, 34, 0.4);
  }

  @media (max-width: 720px) {
    .bars { grid-template-columns: 1fr 1fr; }
    .bars .xp { grid-column: span 2; }
  }
</style>
