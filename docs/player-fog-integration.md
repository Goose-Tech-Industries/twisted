# Player ↔ Fog of War integration

**Audience:** Butterfingers (player UI + map_channel), reading
after `Te.Phoenix.Game.Fog` ships in 1.5e. **No SvelteKit changes
required in 1.5e itself** — this is a forward-looking spec for
Butterfingers's follow-up batch.

## What 1.5e ships

- `Te.Phoenix.Game.Fog.compute_view(char_id, map_id)` returns
  `%{visible, explored, hidden_count}` (visible + explored are
  MapSets of `{x, y}` tuples).
- `Te.Phoenix.Game.Fog.mark_movement(char_id, map_id, {x, y})`
  recomputes visibility and broadcasts `:fog_delta` on the
  `fog:CID:MID` PubSub topic.
- 3 `script_effects` clauses: `fog_reveal_area`, `fog_reset_map`,
  `fog_grant_vision`.

## What Butterfingers wires

### 1. `init_self` extension in `map_channel.ex`

When the player joins a map, include the initial fog state in the
`init_self` push payload:

```elixir
fog_view = TePhoenix.Game.Fog.compute_view(char_id, map_id)
fog_payload = %{
  visible: MapSet.to_list(fog_view.visible),
  explored: MapSet.to_list(fog_view.explored),
  hidden_count: fog_view.hidden_count
}

push(socket, "init_self", Map.put(init_payload, :fog, fog_payload))
```

### 2. PubSub subscription

In the same `map_channel.ex` mount, subscribe to the per-character
fog topic:

```elixir
Phoenix.PubSub.subscribe(TePhoenix.PubSub, "fog:" <> to_string(char_id) <> ":" <> to_string(map_id))
```

Then forward the delta to the WebSocket as a separate event:

```elixir
def handle_info(%{event: :fog_delta} = msg, socket) do
  push(socket, "fog_delta", %{
    newly_visible: msg.newly_visible,
    newly_explored: msg.newly_explored,
    newly_hidden: msg.newly_hidden
  })
  {:noreply, socket}
end

def handle_info(%{event: :fog_reset, count: n}, socket) do
  push(socket, "fog_reset", %{count: n})
  {:noreply, socket}
end
```

### 3. Movement hook

Wherever the channel handles `:move` (or `:teleport`), AFTER the
character position is committed to the DB, call:

```elixir
TePhoenix.Game.Fog.mark_movement(char_id, map_id, {new_x, new_y})
```

This is a `:noreply` call — the broadcast triggers the push; the
caller doesn't need to wait. Run it asynchronously (`Task.start`)
if movement latency matters, but it's <5ms typical.

## SvelteKit store shape

```ts
// src/lib/stores/fog.svelte.ts

interface FogState {
  visible: Set<string>     // "x,y" keys
  explored: Set<string>
  hiddenCount: number
}

function createFogStore() {
  let state = $state<FogState>({
    visible: new Set(),
    explored: new Set(),
    hiddenCount: 0
  })

  function key(x: number, y: number) {
    return `${x},${y}`
  }

  return {
    get visible() { return state.visible },
    get explored() { return state.explored },
    get hiddenCount() { return state.hiddenCount },

    setInitial(payload: { visible: [number, number][]; explored: [number, number][]; hidden_count: number }) {
      state = {
        visible: new Set(payload.visible.map(([x, y]) => key(x, y))),
        explored: new Set(payload.explored.map(([x, y]) => key(x, y))),
        hiddenCount: payload.hidden_count
      }
    },

    applyDelta(delta: { newly_visible: [number, number][]; newly_explored: [number, number][]; newly_hidden: [number, number][] }) {
      // Order matters: process newly_hidden first (move out of
      // visible), then newly_explored (add to explored), then
      // newly_visible (move into visible from explored).
      for (const [x, y] of delta.newly_hidden) state.visible.delete(key(x, y))
      for (const [x, y] of delta.newly_explored) state.explored.add(key(x, y))
      for (const [x, y] of delta.newly_visible) {
        const k = key(x, y)
        state.visible.add(k)
        state.explored.add(k)
      }
      state.hiddenCount = Math.max(state.hiddenCount - delta.newly_explored.length, 0)
    },

    reset() {
      state = { visible: new Set(), explored: new Set(), hiddenCount: 0 }
    }
  }
}

export const fog = createFogStore()
```

## Channel handler additions

```ts
// In play/[charId]/+page.svelte (or wherever the game channel lives)

import { fog } from '$stores/fog.svelte'

game.on<{ fog?: ... }>('init_self', (payload) => {
  // …existing init…
  if (payload.fog) fog.setInitial(payload.fog)
})

game.on<{...}>('fog_delta', (delta) => fog.applyDelta(delta))
game.on<{...}>('fog_reset', () => fog.reset())
```

## Renderer signal

Once the store updates, MapView reads `fog.visible` / `fog.explored`
in its `$effect` block and passes them down to `@twisted/render`'s
fog texture upload (see `docs/render-fog-integration.md` for the
Pixi side).

## Disabled-fog short-circuit

When the server returns `visible == explored == every tile`, the
store recognizes "fog effectively off" and the renderer can skip
its fog pass. The shape stays the same; the renderer just sees
"every tile visible" and renders normally.

## Open coordination items

- **Movement throttling**: today's `:move` channel batches every
  ~50ms. mark_movement runs once per accepted move — fine. If
  Butterfingers adds prediction or interpolation, keep
  mark_movement on the server-authoritative move only.
- **Spectator mode** (DM watches a player): server pushes the
  watched character's fog state too, on a separate topic
  `fog:spectator:CHAR_ID:MAP_ID`. Out of scope for V1.
