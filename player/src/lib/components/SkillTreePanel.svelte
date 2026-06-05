<script lang="ts">
  import { onMount } from 'svelte'
  import { skillTree } from '$stores/skill_tree.svelte'

  interface Props { charId: number }
  let { charId }: Props = $props()

  onMount(() => void skillTree.load(charId))

  const tiers = $derived.by(() => {
    const grouped = new Map<number, typeof skillTree.nodes>()
    for (const n of skillTree.nodes) {
      const arr = grouped.get(n.tier) ?? []
      arr.push(n)
      grouped.set(n.tier, arr)
    }
    return [...grouped.entries()].sort(([a], [b]) => a - b)
  })
</script>

<div class="tree">
  <header>
    <h2>Skill Tree</h2>
    <span class="ap">⚡ {skillTree.unspentAp} AP</span>
  </header>

  <div class="tiers">
    {#each tiers as [tier, ns] (tier)}
      <section>
        <h3>Tier {tier}</h3>
        <div class="row">
          {#each ns as n (n.id)}
            {@const isUnlocked = skillTree.unlocked.has(n.id)}
            <button
              class="node"
              class:unlocked={isUnlocked}
              class:available={n.available && !isUnlocked}
              disabled={isUnlocked || !n.available || (n.cost ?? 0) > skillTree.unspentAp}
              title={n.description}
              onclick={() => skillTree.unlock(n.id)}
            >
              <span class="icon">{n.icon ?? '✦'}</span>
              <span class="name">{n.name}</span>
              {#if !isUnlocked && n.cost}<span class="cost">⚡ {n.cost}</span>{/if}
              {#if isUnlocked}<span class="check">✓</span>{/if}
            </button>
          {/each}
        </div>
      </section>
    {/each}
  </div>
  {#if skillTree.nodes.length === 0}
    {#if skillTree.aggregate}
      <section class="aggregate">
        <h3>Progression</h3>
        {#if skillTree.aggregate.level}
          <p>Level <strong>{skillTree.aggregate.level.level}</strong> · {skillTree.aggregate.level.xp} / {skillTree.aggregate.level.xpNeeded} XP</p>
        {/if}
        {#if skillTree.aggregate.quests}
          <p>Quests: <strong>{skillTree.aggregate.quests.completed}</strong> completed, {skillTree.aggregate.quests.active} active</p>
        {/if}
        {#if skillTree.aggregate.gathering?.length}
          <p class="lbl">Gathering</p>
          <ul class="sub">
            {#each skillTree.aggregate.gathering as g}
              <li>{g.skill} · Lv {g.level} ({g.xp} XP)</li>
            {/each}
          </ul>
        {/if}
        {#if skillTree.aggregate.jobs?.length}
          <p class="lbl">Jobs</p>
          <ul class="sub">
            {#each skillTree.aggregate.jobs as j}
              <li>{j.name} · Lv {j.level}</li>
            {/each}
          </ul>
        {/if}
      </section>
    {:else}
      <p class="empty">No skill tree available.</p>
    {/if}
  {/if}
</div>

<style>
  .tree { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow-y: auto; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: baseline; }
  header h2 { margin: 0; font-size: 1rem; }
  .ap { color: var(--accent); font-weight: 600; font-size: 0.875rem; }
  .tiers { padding: 0.75rem; display: flex; flex-direction: column; gap: 0.75rem; }
  section h3 { margin: 0 0 0.375rem; font-size: 0.75rem; text-transform: uppercase; color: var(--fg-muted); letter-spacing: 0.05em; }
  .row { display: flex; flex-wrap: wrap; gap: 0.375rem; }
  .node {
    display: grid; grid-template-columns: auto 1fr auto; gap: 0.375rem; align-items: center;
    padding: 0.5rem 0.625rem; min-width: 140px;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem;
    text-align: left;
    opacity: 0.45;
  }
  .node.available { opacity: 1; }
  .node.unlocked { opacity: 1; border-color: var(--accent); background: rgba(197,165,114,0.1); }
  .icon { font-size: 1.125rem; }
  .name { font-size: 0.8125rem; }
  .cost { font-size: 0.75rem; color: var(--accent); }
  .check { color: var(--success); font-weight: 700; }
  .empty { color: var(--fg-muted); padding: 1rem; text-align: center; }
  .aggregate { padding: 0.75rem 1rem; }
  .aggregate h3 { margin: 0 0 0.5rem; font-size: 0.875rem; }
  .aggregate p { margin: 0.25rem 0; font-size: 0.8125rem; }
  .lbl { font-size: 0.6875rem; text-transform: uppercase; color: var(--fg-muted); letter-spacing: 0.05em; margin: 0.5rem 0 0.25rem; }
  .sub { list-style: none; margin: 0; padding: 0; font-size: 0.75rem; color: var(--fg-muted); }
  .sub li { padding: 0.125rem 0; }
</style>
