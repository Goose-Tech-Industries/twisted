<script lang="ts">
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { onMount } from 'svelte'
  import { auth } from '$stores/auth.svelte'
  import { character } from '$stores/character.svelte'
  import { connection } from '$phoenix/connection.svelte'
  import { useChannel } from '$phoenix/channel.svelte'
  import { world } from '$stores/world.svelte'
  import { quests } from '$stores/quests.svelte'
  import { battle } from '$stores/battle.svelte'
  import { chat as chatStore } from '$stores/chat.svelte'
  import { inventory } from '$stores/inventory.svelte'
  import { notifications } from '$stores/notifications.svelte'
  import { dialogue } from '$stores/dialogue.svelte'
  import { fog } from '$stores/fog.svelte'
  import { tournament } from '$stores/tournament.svelte'
  import { worldEvents } from '$stores/world_events.svelte'
  import { statusEffects } from '$stores/status_effects.svelte'
  import { abilities } from '$stores/abilities.svelte'
  import { visualFx } from '$stores/visual_fx.svelte'
  import { dmCampaigns } from '$stores/dm_campaigns.svelte'
  import { tilePalette } from '$stores/tile_palette.svelte'
  import { structures } from '$stores/structures.svelte'
  import MapView from '$components/MapView.svelte'
  import BattlePanel from '$components/BattlePanel.svelte'
  import HotKeys from '$components/HotKeys.svelte'
  import DialogueOverlay from '$components/DialogueOverlay.svelte'
  import PanelHost, { type PanelKey } from '$components/PanelHost.svelte'
  import PlayHeader from '$components/play/PlayHeader.svelte'
  import LeftRail from '$components/play/LeftRail.svelte'
  import RightRail from '$components/play/RightRail.svelte'
  import PlayHud from '$components/play/PlayHud.svelte'
  import DebugOverlay from '$components/play/DebugOverlay.svelte'
  import { browser } from '$app/environment'

  const initialCharId = Number($page.params.charId)
  let panel = $state<PanelKey>('none')

  // Rail collapse state — persisted per-character so each character's
  // preferred layout sticks. Default: expanded on desktop, collapsed
  // on mobile (≤720px). localStorage key is namespaced so future
  // shared profile work doesn't collide.
  const RAILS_KEY = `twisted:play-rails:${initialCharId}`
  function defaultCollapsed(): { left: boolean; right: boolean } {
    if (!browser) return { left: false, right: false }
    const isMobile = window.matchMedia('(max-width: 720px)').matches
    return { left: isMobile, right: isMobile }
  }
  function loadRails(): { left: boolean; right: boolean } {
    if (!browser) return { left: false, right: false }
    try {
      const raw = localStorage.getItem(RAILS_KEY)
      if (raw) return JSON.parse(raw)
    } catch { /* fall through to default */ }
    return defaultCollapsed()
  }
  let rails = $state(loadRails())
  $effect(() => {
    if (!browser) return
    try { localStorage.setItem(RAILS_KEY, JSON.stringify(rails)) } catch { /* noop */ }
  })

  const game = useChannel('game:lobby', { char_id: initialCharId })
  const user = useChannel(`user:${initialCharId}`)
  const social = useChannel('social:lobby', { char_id: initialCharId })

  let joinedGame = $state(false)
  $effect(() => {
    if (joinedGame) return
    if (!game.channel) return
    joinedGame = true
    // Phoenix's join_game handler returns {:noreply, socket} (it streams
    // init_self / map_data / player_list / npc_list as separate pushes
    // instead of a reply). Use the raw channel push so we don't wait on
    // an `:ok` that never comes — the init events drive UI state.
    game.channel.push('join_game', { charId: initialCharId })
  })

  // ── game channel ────────────────────────────────────────────────
  // Ticket Q: init_self now carries quests/companion/world right-rail
  // bundles. Most fields are optional — server may omit them on older
  // builds or when underlying modules don't exist yet.
  interface InitSelfPayload {
    charId: number; userId: number; name: string; mapId: number
    x: number; y: number; level: number; role: string
    hp: number; maxHp: number; mp: number; maxMp: number
    atk?: number; def?: number; mo?: number; md?: number; speed?: number
    quests?: { active?: unknown[] }
    statuses?: unknown[]
    companion?: unknown
    world?: { time_of_day?: string; weather?: string; online_count?: number; events?: unknown[] }
    fog?: { visible?: [number, number][]; explored?: [number, number][]; hidden_count?: number }
  }
  game.on<InitSelfPayload>('init_self', (p) => {
    character.setActive({
      id: p.charId, name: p.name, level: p.level,
      current_hp: p.hp, max_hp: p.maxHp,
      current_mp: p.mp, max_mp: p.maxMp,
      map_id: p.mapId, x: p.x, y: p.y,
      atk: p.atk, def: p.def, mo: p.mo, md: p.md, speed: p.speed
    })

    // Fan-out to right-rail stores. Each is best-effort: if the server
    // omitted the key (older Phoenix release), leave the existing store
    // value alone instead of clobbering with empty.
    if (Array.isArray(p.quests?.active)) {
      quests.set(p.quests.active)
    }
    if (Array.isArray(p.statuses) && p.statuses.length > 0) {
      statusEffects.set(p.statuses as never)
    }
    if (p.world?.weather) world.setWeather(p.world.weather)
    if (p.fog?.visible && p.fog?.hidden_count != null) {
      fog.setInitial({
        visible: p.fog.visible || [],
        explored: p.fog.explored || [],
        hidden_count: p.fog.hidden_count ?? 0
      })
    }
  })

  game.on<Record<string, unknown>>('map_data', (p) => {
    world.setMapFromPayload(p as never)
  })
  game.on<{ mapId: number }>('map_changed', () => notifications.push('info', 'Entered a new area'))

  // List payloads — Phoenix's V2 serializer rejects raw arrays so the
  // server wraps each in `%{<key>: [...]}`. Accept both shapes for
  // forward/backward compatibility (matches the legacy ui/ behavior).
  function asList<T>(payload: unknown, key: string): T[] {
    if (Array.isArray(payload)) return payload as T[]
    const v = (payload as Record<string, unknown> | null)?.[key]
    return Array.isArray(v) ? (v as T[]) : []
  }
  game.on<unknown>('player_list', (p) => world.setPlayersFromPayload(asList(p, 'players')))
  game.on<unknown>('npc_list',    (p) => world.setNpcsFromPayload(asList(p, 'npcs')))
  game.on<unknown>('ground_items', (p) => world.setDrops(asList(p, 'items')))
  game.on<unknown>('active_statuses', (p) => statusEffects.set(asList(p, 'statuses')))
  game.on<unknown>('abilities_list',  (p) => abilities.set(asList(p, 'abilities')))
  game.on<unknown>('world_events_active',  (p) => worldEvents.setActive(asList(p, 'events')))
  game.on<unknown>('world_events_history', (p) => worldEvents.setHistory(asList(p, 'events')))
  game.on<unknown>('event_list_result',    (p) => worldEvents.setScheduled(asList(p, 'events')))
  game.on<unknown>('dm_campaigns_list',    (p) => dmCampaigns.set(asList(p, 'campaigns')))
  game.on<unknown>('tile_palette',         (p) => tilePalette.set(asList(p, 'tiles')))
  game.on<unknown>('deployed_structures',  (p) => structures.set(asList(p, 'structures')))
  game.on<Record<string, unknown>>('overworld_effects', (p) => visualFx.setOverworld(p ?? {}))

  game.on<{ x: number; y: number }>('force_move', (p) => {
    console.warn('[move] force_move →', p.x, p.y, 'char at', character.active?.x, character.active?.y)
    return character.active && character.patch({ x: p.x, y: p.y })
  })

  game.on<{ x: number; y: number }>('move_confirmed', (p) => {
    console.info('[move] confirmed →', p.x, p.y, 'char at', character.active?.x, character.active?.y)
    if (character.active) character.patch({ x: p.x, y: p.y })
  })
  game.on<{ type?: string; message: string }>('notification', (p) => {
    notifications.push((p.type as never) ?? 'info', p.message)
  })

  // Fog-of-war delta — visibility changes as the player moves
  game.on<{ newly_visible: [number, number][]; newly_explored: [number, number][]; newly_hidden: [number, number][] }>(
    'fog_delta', (d) => fog.applyDelta(d)
  )
  game.on<unknown>('fog_reset', () => fog.reset())
  game.on<{ battle_id: number }>('battle_start', () => notifications.push('warning', 'Battle started!'))
  game.on<{ speaker: string; body: string; portrait?: string; choices?: Array<{ id: string; label: string }>; end?: boolean }>(
    'dialogue', (p) => dialogue.show(p)
  )

  // ── Event queue runner ─────────────────────────────────────────
  // Phoenix streams cinematic actions (NPC dialogue, shop opens, scripted
  // notifications) as a list of `{cmd, ...}` records on `event_queue`.
  // Mirror the legacy ui/ dispatch table — each cmd maps to an existing
  // store mutation; unknown cmds get a console warning so we notice
  // missing handlers without crashing the channel.
  interface EventCmd {
    cmd: string
    speaker?: string
    text?: string
    type?: string
    npcName?: string
    shopId?: number
    discount?: number
    choices?: Array<{ id?: string; label?: string; text?: string }>
    [k: string]: unknown
  }
  function runEventCmd(evt: EventCmd) {
    switch (evt.cmd) {
      case 'dialogue':
        dialogue.show({ speaker: evt.speaker || 'NPC', body: evt.text || '' })
        break
      case 'npc_choice_menu':
        dialogue.show({
          speaker: evt.npcName || 'NPC',
          body: '',
          choices: (evt.choices || []).map((c) => ({
            id: c.id || '', label: c.label || c.text || c.id || ''
          }))
        })
        break
      case 'npc_talk_prompt':
        dialogue.show({
          speaker: evt.npcName || 'NPC',
          body: `*${evt.npcName || 'The NPC'} awaits your words...*`
        })
        break
      case 'open_shop':
        // Shop UI is a panel — let the user open it from the menu rather
        // than auto-opening to avoid stealing focus mid-conversation.
        notifications.push('info', `Shop available${evt.discount ? ` (${evt.discount}% off)` : ''}`)
        break
      case 'notification':
        notifications.push((evt.type as never) ?? 'info', evt.text || '')
        break
      case 'teleport':
        // Server has already moved the character via map_changed; this is
        // an informational mirror. No-op on the client.
        break
      default:
        console.warn('[event_queue] unhandled cmd:', evt.cmd, evt)
    }
  }
  game.on<unknown>('event_queue', (p) => {
    for (const evt of asList<EventCmd>(p, 'events')) runEventCmd(evt)
  })
  game.on<EventCmd>('event_action', (evt) => runEventCmd(evt))

  // ── chat (multi-topic) ─────────────────────────────────────────
  // Phoenix fans different chat channels out on different topics:
  //   global → social:lobby
  //   local  → map:<map_id>
  //   party  → party:<char_id>
  //   guild  → guild:<guild_id>
  // We subscribe to each so messages from any source land in the same
  // local store.
  type IncomingChat = {
    channel: string; from: string; text?: string; body?: string;
    chatColor?: string | null; ts?: number; role?: string
  }
  function ingest(p: IncomingChat) {
    const ch = (p.channel as never) || 'global'
    const body = p.text ?? p.body ?? ''
    if (!body) return
    chatStore.push(ch, { from: p.from, body, fromColor: p.chatColor ?? null, fromRole: p.role })
  }

  social.on<IncomingChat>('chat_msg', ingest)

  // Map-scoped local chat + player_moved confirmations.
  // Server broadcasts `player_moved` to `map:<id>` for every accepted
  // move (line 514 core_handler.ex). The client already joins this
  // channel for local chat — handle player_moved here so the client
  // stays in lockstep with the server's authoritative position. The
  // moveDirection() optimistic patch gives responsive visuals, and
  // when the server confirmation arrives (~200ms later), this handler
  // snaps position to the confirmed value. No timing guesswork needed.
  let mapTopic = $state<string | null>(null)
  $effect(() => {
    const mid = character.active?.map_id
    if (!mid) return
    mapTopic = `map:${mid}`
  })
  const mapChatCh = $derived(mapTopic ? connection.channel(mapTopic) : null)
  $effect(() => {
    const ch = mapChatCh
    if (!ch) return
    const r1 = ch.on('chat_msg', (p: unknown) => ingest(p as IncomingChat))
    const r2 = ch.on('player_moved', (p: unknown) => {
      const m = p as { id?: number; x?: number; y?: number }
      // Own position is now confirmed via move_confirmed on the game
      // channel — this handler updates OTHER players on the minimap.
      if (m.id != null && m.id !== character.active?.id) {
        world.upsertPlayer({
          charId: m.id,
          name: '',
          x: m.x ?? 0,
          y: m.y ?? 0,
          level: 1
        })
      }
    })
    return () => { ch.off('chat_msg', r1); ch.off('player_moved', r2) }
  })

  // Per-character party topic (Phoenix broadcasts party chat to
  // `party:<char_id>` for each member individually).
  const partyCh = $derived(connection.channel(`party:${initialCharId}`))
  $effect(() => {
    const ch = partyCh
    if (!ch) return
    const ref = ch.on('chat_msg', (p: unknown) => ingest(p as IncomingChat))
    return () => ch.off('chat_msg', ref)
  })

  // ── user channel ───────────────────────────────────────────────
  let battleTopic = $state<string | null>(null)
  user.on<{ battle_id: number; snapshot: unknown }>('battle_snapshot', (p) => {
    battle.set(p.snapshot as never)
    battleTopic = `battle:${p.battle_id}`
  })

  const battleCh = $derived(battleTopic ? connection.channel(battleTopic) : null)
  $effect(() => {
    const ch = battleCh
    if (!ch) return
    const ref = ch.on('battle_update', (payload: unknown) => {
      const p = payload as { snapshot?: unknown; log_lines?: string[] }
      if (p.snapshot) battle.patch(p.snapshot as never)
      if (Array.isArray(p.log_lines)) for (const line of p.log_lines) battle.appendLog(line)
    })
    return () => ch.off('battle_update', ref)
  })

  // ── boot ────────────────────────────────────────────────────────
  onMount(async () => {
    // No token at all → we're definitely not authed. Bounce to /login.
    // Token but no user yet means the layout's auth.restore() is mid-
    // flight (Svelte runs child onMount before parent, so the layout's
    // /me request may not have started yet). Trigger restore ourselves
    // so we don't race-redirect a logged-in user out.
    if (!auth.token) {
      goto('/login', { replaceState: true })
      return
    }
    if (!auth.user) {
      try { await auth.restore() } catch { /* surfaced below */ }
    }
    // restore() either populated user OR cleared the token on failure.
    if (!auth.token || !auth.user) {
      goto('/login', { replaceState: true })
      return
    }
    // Token in hand → ensure the socket is alive. Retry on any
    // non-active state ('disconnected' OR 'error'), not just disconnected.
    // A transient handshake failure during boot used to leave the socket
    // permanently dead; this catches that case AND covers fresh navigations
    // where the layout's restore was skipped (auth.user already set).
    // connect() is idempotent on a healthy (token, socket) pair.
    if (connection.state !== 'connected' && connection.state !== 'connecting') {
      console.info('[phx] page boot retry-connect, state was', connection.state)
      connection.connect(auth.token, 0)
    }
    if (!character.active || character.active.id !== initialCharId) {
      await character.loadActive(initialCharId)
    }
    await inventory.load(initialCharId)
    if (character.active?.gold !== undefined) inventory.setGold(character.active.gold ?? 0)
  })

  // ── debug taps (visible in DevTools console) ───────────────────
  // Keep these so when the world doesn't render we can see immediately
  // whether the channel is silent, or the payload arrived but failed
  // to normalize. Cheap to leave on; no PII in logs.
  game.on<unknown>('init_self', (p) => console.log('[phx] init_self', p))
  game.on<unknown>('map_data',  (p) => console.log('[phx] map_data',  p))
  game.on<unknown>('error_msg', (p) => console.warn('[phx] error_msg', p))

  // ── input + outgoing pushes ─────────────────────────────────────
  const MOVE_COOLDOWN_MS = 220
  let lastMoveAt = 0
  function moveDirection(dir: 'up' | 'down' | 'left' | 'right') {
    const c = character.active
    if (!c) return
    const now = performance.now()
    if (now - lastMoveAt < MOVE_COOLDOWN_MS) return
    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0
    const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0
    const tx = c.x + dx, ty = c.y + dy

    // Client-side passability gate. Check the tile palette for the
    // target tile's walkability BEFORE sending the move — no more
    // optimistic lunge into a wall followed by force_move snap-back.
    const m = world.map
    if (m) {
      // Map edge check
      if (tx < 0 || tx >= m.width || ty < 0 || ty >= m.height) return
      const targetTile = m.tiles?.[ty]?.[tx]
      if (targetTile !== undefined) {
        const entry = tilePalette.entries.find(e => e.id === targetTile)
        if (entry && entry.passable === false) return
      }
    } else {
      // No map data yet — don't move blindly
      return
    }

    void game.push('move', { x: tx, y: ty, running: false })
    console.warn('[move] SENT →', tx, ty, 'from', c.x, c.y)
    character.patch({ x: tx, y: ty })
  }

  function togglePanel(p: PanelKey) {
    panel = panel === p ? 'none' : p
  }

  // Hotkey shortcuts: I=inventory, C=chat, M=map (closes panel), Q=quests
  function hotkeyToggle(p: 'inventory' | 'chat') { togglePanel(p as PanelKey) }
</script>

<HotKeys
  onmove={moveDirection}
  oninteract={() => void game.push('interact', {})}
  ontogglepanel={hotkeyToggle}
/>

<div class="play-shell">
  <PlayHeader
    onToggleLeft={() => rails = { ...rails, left: !rails.left }}
    onToggleRight={() => rails = { ...rails, right: !rails.right }}
    leftCollapsed={rails.left}
    rightCollapsed={rails.right}
  />

  <LeftRail collapsed={rails.left} />

  <section class="map-region">
    {#if battle.snapshot}
      <BattlePanel onaction={(payload) => battleCh?.push('action', payload)} />
    {:else if world.map}
       <MapView map={world.map} character={character.active} players={world.players} npcs={world.npcs} drops={world.drops} palette={tilePalette.entries} fogEnabled={fog.hiddenCount > 0} exploredTiles={fog.explored} />
    {:else}
      <div class="placeholder">
        <p>Awaiting world data…</p>
        <p class="diag">
          Connection: <strong class="state-{connection.state}">{connection.state}</strong>
          {#if joinedGame} · join_game sent{:else} · waiting for channel{/if}
          {#if connection.lastError}<br /><span class="err">{connection.lastError}</span>{/if}
        </p>

        {#if connection.state === 'disconnected' || connection.state === 'error'}
          <div class="recover">
            <p class="hint">
              Your session token expired or the server doesn't recognize it. Try reconnecting; if that fails, sign in again.
            </p>
            <div class="actions">
              <button type="button" onclick={() => {
                if (auth.token && auth.user) connection.connect(auth.token, 0)
              }}>Reconnect</button>
              <button type="button" class="warn" onclick={async () => {
                await auth.logout()
                goto('/login', { replaceState: true })
              }}>Sign in again</button>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <RightRail
    collapsed={rails.right}
    onSendChat={(channel, body) => void social.push('chat_send', { channel, text: body })}
  />

  {#if character.active}
    <PlayHud character={character.active} active={panel} onpanel={togglePanel} />
  {/if}

  {#if panel !== 'none'}
    <div class="overlay-panel">
      <PanelHost
        {panel}
        charId={initialCharId}
        character={character.active}
        inventoryItems={inventory.items}
        equipment={inventory.equipment}
        gold={inventory.gold}
        onuse={(id) => void game.push('use_item', { item_id: id, char_id: initialCharId })}
        onequip={(id) => void game.push('equip_item', { item_id: id, char_id: initialCharId })}
        onsendchat={(channel, body) => void social.push('chat_send', { channel, text: body })}
        onqueue={(format) => { tournament.setQueued(format); void connection.channel('battle:lobby')?.push('queue_join', { format }) }}
        onleavequeue={() => { tournament.setQueued(null); void connection.channel('battle:lobby')?.push('queue_leave', {}) }}
        oninvite={(charId, _name) => void social.push('party_invite', { targetCharId: charId })}
        onpartyinvite={(name) => void social.push('party_invite', { targetName: name })}
        onleaveparty={() => void social.push('party_leave', {})}
        onwhisper={(name) => void social.push('whisper_open', { targetName: name })}
        oncompanionsummon={async (id) => { const m = await import('$stores/companion.svelte'); void m.companion.toggleActive(id, true) }}
        oncompaniondismiss={async (id) => { const m = await import('$stores/companion.svelte'); void m.companion.toggleActive(id, false) }}
        oncompaniontactic={async (id, tactic) => { const m = await import('$stores/companion.svelte'); void m.companion.setTactic(id, tactic) }}
        ontradeaccept={() => void social.push('trade_accept', {})}
        ontradelock={() => void social.push('trade_lock', {})}
        ontradecancel={() => void social.push('trade_cancel', {})}
        ontradesetgold={(n) => void social.push('trade_set_gold', { gold: n })}
      />
      <button class="overlay-close" type="button" aria-label="Close panel" onclick={() => panel = 'none'}>✕</button>
    </div>
  {/if}
</div>

<DialogueOverlay
  onchoice={(choiceId) => void game.push('dialogue_choice', { choiceId })}
  onclose={() => { dialogue.close(); void game.push('dialogue_close', {}) }}
/>

<!-- Wiring debug overlay: render only when ?debug=1 (component handles
     visibility internally so the conditional doesn't pollute callers). -->
<DebugOverlay />

<style>
  .play-shell {
    flex: 1;
    display: grid;
    grid-template-rows: 36px 1fr 96px;
    grid-template-columns: auto 1fr auto;
    grid-template-areas:
      "header header header"
      "left   map    right"
      "hud    hud    hud";
    min-height: 0;
    background: #0a0a0a;
    color: #ece6e3;
    position: relative;
  }
  .map-region {
    grid-area: map;
    background: #050505;
    position: relative;
    min-height: 0;
    overflow: hidden;
  }
  .placeholder {
    width: 100%; height: 100%;
    display: flex; flex-direction: column; gap: 0.5rem;
    align-items: center; justify-content: center;
    color: #a39e8b;
  }
  .placeholder p { margin: 0; }
  .placeholder .diag { font-size: 0.75rem; color: #6a665b; text-align: center; }
  .placeholder .diag strong.state-connected { color: #4caf75; }
  .placeholder .diag strong.state-connecting { color: #c9a14a; }
  .placeholder .diag strong.state-disconnected, .placeholder .diag strong.state-error { color: #c93838; }
  .placeholder .diag .err { color: #c93838; }
  .placeholder .recover {
    display: flex; flex-direction: column; align-items: center; gap: 0.625rem;
    margin-top: 1rem;
    padding: 1rem;
    background: #15151a;
    border: 1px solid #2a2a2a;
    border-radius: 0.375rem;
    max-width: 380px;
  }
  .placeholder .hint { font-size: 0.8125rem; color: #a39e8b; text-align: center; line-height: 1.5; }
  .placeholder .actions { display: flex; gap: 0.5rem; }
  .placeholder .actions .warn { color: #c9a14a; border-color: #c9a14a; }

  /* Floating panel overlay — opens above the map when a tab is picked.
     Positioned over the map area so it doesn't push the layout. */
  .overlay-panel {
    position: absolute;
    top: 36px; bottom: 96px;
    right: 0;
    width: min(420px, 100%);
    background: #0d0d11;
    border-left: 1px solid #c9a14a;
    box-shadow: -12px 0 32px rgba(0, 0, 0, 0.6);
    z-index: 40;
    overflow-y: auto;
    padding: 1rem;
  }
  .overlay-close {
    position: absolute;
    top: 0.5rem; right: 0.5rem;
    width: 28px; height: 28px;
    background: transparent;
    border: 1px solid #2a2a2a;
    color: #a39e8b;
    font-size: 0.85rem;
    border-radius: 0.25rem;
    cursor: pointer;
    z-index: 41;
  }
  .overlay-close:hover { color: #c93838; border-color: #c93838; }

  /* Tablet: rails default to icon-strip width. The collapsed prop is
     still authoritative — these rules only set the visible width when
     the user hasn't manually overridden via the toggle. */
  @media (max-width: 1280px) {
    /* Visual tweak: tighten gutters so the map gets center stage. */
    .play-shell { grid-template-columns: auto 1fr auto; }
  }

  @media (max-width: 720px) {
    .play-shell {
      grid-template-rows: 36px 1fr 80px;
    }
    .overlay-panel {
      width: 100%;
      top: 36px;
      bottom: 80px;
    }
  }
</style>
