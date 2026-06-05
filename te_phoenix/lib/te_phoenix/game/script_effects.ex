defmodule TePhoenix.Game.ScriptEffects do
  @moduledoc """
  Production effects callback for `TePhoenix.Game.ScriptInterpreter`.

  Every one of the 25 node types in `ScriptNodes` has a real implementation
  that mutates engine state when invoked: characters lose/gain HP, gold,
  XP, items; world flags persist to a dedicated table; teleports move the
  player and broadcast position; battles start through the existing battle
  manager; dialogue and shop UIs push to the player's channel.

  The callback is invoked by the interpreter as `effects.(node, ctx)` and
  must return `{:ok, ctx}` for linear flow, `{:ok, ctx, branch_key}` for
  branching nodes, or `{:error, reason}` to halt the run.

  ## Required ctx keys

    * `:char_id` — the acting character's id (required for every effect
      that touches character state)
    * `:ui_caller` — pid where **UI-bearing messages are sent** (choice
      prompts, dialogue bubbles, sound/screen effects, shop opens).
      In production this is the PlayerChannel pid; in dev-tool flows
      (playtest-in-editor) it is the LiveView pid.
    * `:run_id` — opaque run identifier the UI uses to correlate
      incoming effects with an in-flight fire_script call. Must be
      present when `ui_caller` is set.

  Player responses (e.g. a choice selection) flow back into `self()` —
  the interpreter-owning process. The runtime that owns the interpreter
  (typically a `Task`) receives the reply on its own mailbox so that
  blocking `receive` blocks **only** the interpreter process and never
  the channel or LiveView.

  ## Lazy-created tables

  All four are created on first call:

    * `game_world_flags` — `(flag VARCHAR PRIMARY KEY, value INT, updated_at)`
    * `game_character_flags` — `(char_id, flag, value, PRIMARY KEY (char_id, flag))`
    * `game_npc_state` — `(npc_id PRIMARY KEY, mood, alive, updated_at)`
    * `game_faction_rep` — `(char_id, faction, value, PRIMARY KEY (char_id, faction))`
    * `game_quest_progress` — `(char_id, quest_id, step, completed, started_at, updated_at)`

  ## Why a dedicated module instead of inlining into the interpreter

  Because the interpreter is pure and testable. The split lets us run the
  exact same graph through `dry_run_effect` in the editor or through
  `apply/2` in production with no other code changes.
  """

  alias TePhoenix.Repo

  @doc """
  The production effects callback. Pass to `ScriptInterpreter.run/2` as
  `effects: &TePhoenix.Game.ScriptEffects.apply/2`.
  """
  @spec apply(map(), map()) :: {:ok, map()} | {:ok, map(), String.t()} | {:error, term()}
  def apply(node, ctx) do
    ensure_tables()
    do_apply(node.type, node.props || %{}, ctx)
  end

  # ── Flow ─────────────────────────────────────────────────────

  defp do_apply("start", _props, ctx), do: {:ok, ctx}

  # Choice sends the prompt to the UI pid and blocks the interpreter
  # process on `receive`. The PlayerChannel (or the playtest LV) routes
  # the player's response back into the interpreter's mailbox.
  defp do_apply("choice", props, ctx) do
    ui = ctx[:ui_caller]
    run_id = ctx[:run_id]

    payload = %{
      prompt: prop(props, "prompt", "Make a choice…"),
      a: prop(props, "label_a", "Yes"),
      b: prop(props, "label_b", "No"),
      c: prop(props, "label_c", "")
    }

    if is_pid(ui) do
      send(ui, {:script_choice_prompt, run_id, payload})

      receive do
        {:script_choice, key} when key in ["a", "b", "c"] ->
          {:ok, Map.put(ctx, :last_choice, key), key}
      after
        120_000 -> {:error, :choice_timeout}
      end
    else
      # No UI available — degrade to "a" so headless runs don't hang.
      {:ok, ctx, "a"}
    end
  end

  defp do_apply("conditional", props, ctx) do
    char_id = ctx[:char_id]
    kind = prop(props, "kind", "flag")
    key = prop(props, "key", "")
    threshold = to_int(prop(props, "value", 0))

    truthy =
      case kind do
        "flag" -> read_char_flag(char_id, key) >= threshold
        "world_flag" -> read_world_flag(key) >= threshold
        "item_count_gte" -> count_items(char_id, to_int(key)) >= threshold
        "level_gte" -> read_char_field(char_id, :level) >= threshold
        "gold_gte" -> read_char_gold(char_id) >= threshold
        _ -> false
      end

    {:ok, ctx, if(truthy, do: "true", else: "false")}
  end

  # ── Rewards ──────────────────────────────────────────────────

  defp do_apply("give_item", props, ctx) do
    char = require_char!(ctx)
    item_id = to_int(prop(props, "item_id", 1))
    amount = to_int(prop(props, "amount", 1))

    Repo.query(
      """
      INSERT INTO character_items (character_id, item_id, quantity)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)
      """,
      [char, item_id, amount]
    )

    push_ui(ctx, :give_item, %{item_id: item_id, amount: amount})
    {:ok, ctx}
  end

  defp do_apply("take_item", props, ctx) do
    char = require_char!(ctx)
    item_id = to_int(prop(props, "item_id", 1))
    amount = to_int(prop(props, "amount", 1))

    Repo.query(
      "UPDATE character_items SET quantity = GREATEST(0, quantity - ?) WHERE character_id = ? AND item_id = ?",
      [amount, char, item_id]
    )

    Repo.query("DELETE FROM character_items WHERE character_id = ? AND item_id = ? AND quantity <= 0", [char, item_id])
    push_ui(ctx, :take_item, %{item_id: item_id, amount: amount})
    {:ok, ctx}
  end

  defp do_apply("give_gold", props, ctx) do
    char = require_char!(ctx)
    amount = to_int(prop(props, "amount", 0))
    add_char_gold(char, amount)
    push_ui(ctx, :give_gold, %{amount: amount})
    {:ok, ctx}
  end

  defp do_apply("give_xp", props, ctx) do
    char = require_char!(ctx)
    amount = to_int(prop(props, "amount", 0))

    Repo.query(
      "UPDATE characters SET experience = experience + ? WHERE id = ?",
      [amount, char]
    )

    push_ui(ctx, :give_xp, %{amount: amount})
    {:ok, ctx}
  end

  defp do_apply("heal", props, ctx) do
    char = require_char!(ctx)
    amount = to_int(prop(props, "amount", 0))
    kind = prop(props, "kind", "hp")

    cond do
      amount == -1 and kind == "hp" ->
        Repo.query("UPDATE characters SET current_hp = max_hp WHERE id = ?", [char])

      amount == -1 and kind == "mp" ->
        Repo.query("UPDATE characters SET current_mp = max_mp WHERE id = ?", [char])

      amount == -1 and kind == "both" ->
        Repo.query("UPDATE characters SET current_hp = max_hp, current_mp = max_mp WHERE id = ?", [char])

      kind == "hp" ->
        Repo.query("UPDATE characters SET current_hp = LEAST(max_hp, current_hp + ?) WHERE id = ?", [amount, char])

      kind == "mp" ->
        Repo.query("UPDATE characters SET current_mp = LEAST(max_mp, current_mp + ?) WHERE id = ?", [amount, char])

      kind == "both" ->
        Repo.query(
          "UPDATE characters SET current_hp = LEAST(max_hp, current_hp + ?), current_mp = LEAST(max_mp, current_mp + ?) WHERE id = ?",
          [amount, amount, char]
        )

      true ->
        :ok
    end

    push_ui(ctx, :heal, %{kind: kind, amount: amount})
    {:ok, ctx}
  end

  defp do_apply("damage", props, ctx) do
    char = require_char!(ctx)
    amount = to_int(prop(props, "amount", 0))
    element = prop(props, "element", "physical")

    Repo.query(
      "UPDATE characters SET current_hp = GREATEST(0, current_hp - ?) WHERE id = ?",
      [amount, char]
    )

    push_ui(ctx, :damage, %{amount: amount, element: element})
    {:ok, ctx}
  end

  # ── World ────────────────────────────────────────────────────

  defp do_apply("teleport", props, ctx) do
    char = require_char!(ctx)
    map_id = to_int(prop(props, "map_id", 1))
    x = to_int(prop(props, "x", 0))
    y = to_int(prop(props, "y", 0))

    Repo.query(
      "UPDATE characters SET map_id = ?, x = ?, y = ? WHERE id = ?",
      [map_id, x, y, char]
    )

    # Update online registry if present so other systems see the move
    if function_exported?(TePhoenix.Game.PlayerRegistry, :update, 2) do
      TePhoenix.Game.PlayerRegistry.update(char, %{map_id: map_id, x: x, y: y})
    end

    push_ui(ctx, :teleport, %{map_id: map_id, x: x, y: y})
    {:ok, ctx}
  end

  defp do_apply("set_flag", props, ctx) do
    char = require_char!(ctx)
    flag = prop(props, "flag", "")
    value = if prop(props, "value", true) in [true, "true", "on", 1, "1"], do: 1, else: 0

    if flag != "" do
      Repo.query(
        """
        INSERT INTO game_character_flags (char_id, flag, value, updated_at)
        VALUES (?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()
        """,
        [char, flag, value]
      )
    end

    {:ok, ctx}
  end

  defp do_apply("set_world_flag", props, ctx) do
    flag = prop(props, "flag", "")
    value = if prop(props, "value", true) in [true, "true", "on", 1, "1"], do: 1, else: 0

    if flag != "" do
      Repo.query(
        """
        INSERT INTO game_world_flags (flag, value, updated_at)
        VALUES (?, ?, NOW())
        ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()
        """,
        [flag, value]
      )
    end

    {:ok, ctx}
  end

  defp do_apply("inc_flag", props, ctx) do
    char = require_char!(ctx)
    flag = prop(props, "flag", "")
    delta = to_int(prop(props, "amount", 1))

    if flag != "" do
      Repo.query(
        """
        INSERT INTO game_character_flags (char_id, flag, value, updated_at)
        VALUES (?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE value = value + VALUES(value), updated_at = NOW()
        """,
        [char, flag, delta]
      )
    end

    {:ok, ctx}
  end

  defp do_apply("screen_effect", props, ctx) do
    push_ui(ctx, :screen_effect, %{
      kind: prop(props, "kind", "shake"),
      intensity: to_float(prop(props, "intensity", 1.0)),
      duration_ms: to_int(prop(props, "duration_ms", 500))
    })

    {:ok, ctx}
  end

  defp do_apply("wait", props, ctx) do
    ms = to_int(prop(props, "ms", 1000))
    Process.sleep(ms)
    {:ok, ctx}
  end

  defp do_apply("sound", props, ctx) do
    push_ui(ctx, :sound, %{
      url: prop(props, "url", ""),
      volume: to_float(prop(props, "volume", 0.6))
    })

    {:ok, ctx}
  end

  # ── NPC ──────────────────────────────────────────────────────

  defp do_apply("npc_talk", props, ctx) do
    npc_id = to_int(prop(props, "npc_id", 0))
    text = prop(props, "text", "")
    ui = ctx[:ui_caller]
    run_id = ctx[:run_id]

    if is_pid(ui) do
      send(ui, {:script_dialogue, run_id, %{npc_id: npc_id, text: text}})

      # Block until the player advances the dialogue bubble
      receive do
        {:script_dialogue_advance} -> :ok
      after
        300_000 -> :ok
      end
    end

    {:ok, ctx}
  end

  defp do_apply("set_npc_mood", props, ctx) do
    npc_id = to_int(prop(props, "npc_id", 0))
    mood = prop(props, "mood", "neutral")

    Repo.query(
      """
      INSERT INTO game_npc_state (npc_id, mood, alive, updated_at)
      VALUES (?, ?, 1, NOW())
      ON DUPLICATE KEY UPDATE mood = VALUES(mood), updated_at = NOW()
      """,
      [npc_id, mood]
    )

    {:ok, ctx}
  end

  defp do_apply("kill_npc", props, ctx) do
    npc_id = to_int(prop(props, "npc_id", 0))

    Repo.query(
      """
      INSERT INTO game_npc_state (npc_id, mood, alive, updated_at)
      VALUES (?, 'dead', 0, NOW())
      ON DUPLICATE KEY UPDATE alive = 0, mood = 'dead', updated_at = NOW()
      """,
      [npc_id]
    )

    push_ui(ctx, :kill_npc, %{npc_id: npc_id})
    {:ok, ctx}
  end

  defp do_apply("faction_rep", props, ctx) do
    char = require_char!(ctx)
    faction = prop(props, "faction", "")
    delta = to_int(prop(props, "delta", 0))

    if faction != "" do
      Repo.query(
        """
        INSERT INTO game_faction_rep (char_id, faction, value, updated_at)
        VALUES (?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE value = value + VALUES(value), updated_at = NOW()
        """,
        [char, faction, delta]
      )
    end

    {:ok, ctx}
  end

  # ── Game ─────────────────────────────────────────────────────

  defp do_apply("battle", props, ctx) do
    char = require_char!(ctx)
    encounter_id = to_int(prop(props, "encounter_id", 0))
    escapable = prop(props, "escapable", true) in [true, "true", "on", 1, "1"]

    push_ui(ctx, :battle, %{
      char_id: char,
      encounter_id: encounter_id,
      escapable: escapable
    })

    {:ok, ctx}
  end

  defp do_apply("shop", props, ctx) do
    shop_id = to_int(prop(props, "shop_id", 0))
    push_ui(ctx, :shop, %{shop_id: shop_id})
    {:ok, ctx}
  end

  # Phase 1.5a: route through TePhoenix.Game.Quests so prereq checks,
  # PubSub events, and reward distribution happen consistently with the
  # other entry points (NPC dialogue, REST controller). Falls back to a
  # raw INSERT only if the new module isn't loaded yet (defensive — the
  # script_effects path runs in many contexts).
  defp do_apply("quest_start", props, ctx) do
    char = require_char!(ctx)
    quest_id = to_int(prop(props, "quest_id", 0))

    case TePhoenix.Game.Quests.start(char, quest_id, skip_prerequisites: true) do
      {:ok, _} -> :ok
      _ -> :ok
    end

    push_ui(ctx, :quest_start, %{quest_id: quest_id})
    {:ok, ctx}
  end

  defp do_apply("quest_advance", props, ctx) do
    char = require_char!(ctx)
    quest_id = to_int(prop(props, "quest_id", 0))
    step = to_int(prop(props, "step", 1))

    # Quests.advance/4 expects a delta, not an absolute step. The script
    # node's `step` prop is treated as "advance by this many" (matches
    # the existing GREATEST-pinned semantics for callers that always
    # pass 1).
    delta = max(step, 1)

    case TePhoenix.Game.Quests.advance(char, quest_id, nil, delta) do
      {:ok, _} -> :ok
      _ -> :ok
    end

    push_ui(ctx, :quest_advance, %{quest_id: quest_id, step: step})
    {:ok, ctx}
  end

  defp do_apply("quest_complete", props, ctx) do
    char = require_char!(ctx)
    quest_id = to_int(prop(props, "quest_id", 0))

    case TePhoenix.Game.Quests.complete(char, quest_id) do
      {:ok, _} -> :ok
      _ -> :ok
    end

    push_ui(ctx, :quest_complete, %{quest_id: quest_id})
    {:ok, ctx}
  end

  # Phase 1.5b — Crafting capability hooks. Quests can grant a craft
  # via `craft_item`, and a learning event can mark a recipe known via
  # `craft_learn`. Both use skip_prerequisites because scripted grants
  # bypass the normal level/learned gates by design (a story moment
  # gives you an item; you didn't earn it through gameplay).
  defp do_apply("craft_item", props, ctx) do
    char = require_char!(ctx)
    recipe_id = to_int(prop(props, "recipe_id", 0))
    qty = to_int(prop(props, "qty", 1))

    case TePhoenix.Game.Crafting.craft(char, recipe_id, qty: qty, skip_prerequisites: true) do
      {:ok, _result} -> :ok
      _ -> :ok
    end

    push_ui(ctx, :craft_item, %{recipe_id: recipe_id, qty: qty})
    {:ok, ctx}
  end

  defp do_apply("craft_learn", props, ctx) do
    char = require_char!(ctx)
    recipe_id = to_int(prop(props, "recipe_id", 0))

    case TePhoenix.Game.Crafting.learn(char, recipe_id) do
      {:ok, _} -> :ok
      _ -> :ok
    end

    push_ui(ctx, :craft_learn, %{recipe_id: recipe_id})
    {:ok, ctx}
  end

  # Phase 1.5c — Achievement hooks. `achievement_trigger` fires an
  # event that may unlock one or more achievements via the trigger
  # type's counter. `achievement_unlock` is the manual-grant path:
  # script directly unlocks a specific achievement (for narrative
  # rewards that don't fit any counter shape).
  defp do_apply("achievement_trigger", props, ctx) do
    char = require_char!(ctx)
    event_key = to_string(prop(props, "event_key", "manual"))
    count = to_int(prop(props, "count", 1))
    payload = prop(props, "payload", %{})

    Enum.each(1..max(count, 1), fn _ ->
      case TePhoenix.Game.Achievements.fire_event(char, event_key, payload) do
        {:ok, _} -> :ok
        _ -> :ok
      end
    end)

    push_ui(ctx, :achievement_trigger, %{event_key: event_key, count: count})
    {:ok, ctx}
  end

  # Phase 1.5d — Magic capability hooks. Story moments that hand
  # the player oghams, spells, or anam. All bypass the magic
  # capability gate (scripts represent canon plot beats; the
  # capability flag is for emergent / GM-enabled magic, not narrative).
  defp do_apply("magic_unlock_ogham", props, ctx) do
    char = require_char!(ctx)
    ogham_key = to_string(prop(props, "ogham_key", ""))
    source = to_string(prop(props, "source", "script"))

    if ogham_key != "" do
      case TePhoenix.Game.Magic.unlock_ogham(char, ogham_key, source) do
        {:ok, _} -> :ok
        _ -> :ok
      end
    end

    push_ui(ctx, :magic_unlock_ogham, %{ogham_key: ogham_key, source: source})
    {:ok, ctx}
  end

  defp do_apply("magic_learn_spell", props, ctx) do
    char = require_char!(ctx)
    spell_key = to_string(prop(props, "spell_key", ""))

    if spell_key != "" do
      case TePhoenix.Game.Magic.learn_spell(char, spell_key) do
        {:ok, _} -> :ok
        _ -> :ok
      end
    end

    push_ui(ctx, :magic_learn_spell, %{spell_key: spell_key})
    {:ok, ctx}
  end

  # Phase 1.5e — Fog of War hooks. Story moments that uncover an
  # area, wipe exploration memory, or grant a temporary vision boost.
  # All bypass capability gates because scripts are canon plot beats.
  defp do_apply("fog_reveal_area", props, ctx) do
    char = require_char!(ctx)
    map_id = to_int(prop(props, "map_id", 0))
    cx = to_int(prop(props, "x", 0))
    cy = to_int(prop(props, "y", 0))
    radius = to_int(prop(props, "radius", 5))

    if map_id > 0 do
      tiles =
        for x <- (cx - radius)..(cx + radius),
            y <- (cy - radius)..(cy + radius),
            (x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius,
            x >= 0 and y >= 0,
            do: {x, y}

      TePhoenix.Game.Fog.reveal_tiles(char, map_id, tiles)
    end

    push_ui(ctx, :fog_reveal_area, %{map_id: map_id, x: cx, y: cy, radius: radius})
    {:ok, ctx}
  end

  defp do_apply("fog_reset_map", props, ctx) do
    char = require_char!(ctx)
    map_id = to_int(prop(props, "map_id", 0))

    if map_id > 0 do
      TePhoenix.Game.Fog.reset_exploration(char, map_id)
    end

    push_ui(ctx, :fog_reset_map, %{map_id: map_id})
    {:ok, ctx}
  end

  defp do_apply("fog_grant_vision", props, ctx) do
    char = require_char!(ctx)
    delta = to_int(prop(props, "radius_delta", 1))
    duration_ms = to_int(prop(props, "duration_ms", 60_000))
    reason = to_string(prop(props, "reason", "script"))

    if delta != 0 do
      TePhoenix.Game.Fog.grant_vision(char, delta, duration_ms, reason)
    end

    push_ui(ctx, :fog_grant_vision, %{radius_delta: delta, duration_ms: duration_ms})
    {:ok, ctx}
  end

  defp do_apply("magic_grant_anam", props, ctx) do
    char = require_char!(ctx)
    amount = to_int(prop(props, "amount", 0))

    if amount > 0 do
      TePhoenix.Repo.query(
        "UPDATE characters SET anam_current = LEAST(anam_max, anam_current + ?) WHERE id = ?",
        [amount, char]
      )

      Phoenix.PubSub.broadcast(TePhoenix.PubSub, "character:#{char}", {:anam_changed, :script_grant, amount})
    end

    push_ui(ctx, :magic_grant_anam, %{amount: amount})
    {:ok, ctx}
  end

  defp do_apply("achievement_unlock", props, ctx) do
    char = require_char!(ctx)
    achievement_key = to_string(prop(props, "achievement_key", ""))

    if achievement_key != "" do
      # Look up the achievement id by key, then drive an unlock through
      # the canonical trigger pipeline. Using fire_event with the
      # achievement's own trigger_type + a manual count bump keeps the
      # unlock flowing through the same code path as gameplay-earned
      # achievements (consistent rewards + PubSub).
      case TePhoenix.Repo.query(
             "SELECT id, trigger_type, trigger_value FROM game_achievements WHERE key_name = ? AND is_active = 1 LIMIT 1",
             [achievement_key]
           ) do
        {:ok, %{rows: [[ach_id, trigger_type, trigger_value]]}} ->
          # Force the counter to ≥ trigger_value so this achievement
          # unlocks immediately. Other achievements sharing the same
          # trigger_type may also unlock if they're already at their
          # threshold — that's by design (script grants are generous).
          payload = %{"forced_via" => "achievement_unlock", "achievement_id" => ach_id}

          Enum.each(1..max(trigger_value, 1), fn _ ->
            TePhoenix.Game.Achievements.fire_event(char, to_string(trigger_type), payload)
          end)

        _ ->
          :ok
      end
    end

    push_ui(ctx, :achievement_unlock, %{achievement_key: achievement_key})
    {:ok, ctx}
  end

  defp do_apply(_other, _props, ctx), do: {:ok, ctx}

  # ── Helpers ──────────────────────────────────────────────────

  defp prop(props, key, default) do
    Map.get(props, key, Map.get(props, String.to_atom(key), default))
  end

  defp to_int(v) when is_integer(v), do: v

  defp to_int(v) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      _ -> 0
    end
  end

  defp to_int(v) when is_float(v), do: trunc(v)
  defp to_int(_), do: 0

  defp to_float(v) when is_float(v), do: v
  defp to_float(v) when is_integer(v), do: v * 1.0

  defp to_float(v) when is_binary(v) do
    case Float.parse(v) do
      {f, _} -> f
      _ -> 0.0
    end
  end

  defp to_float(_), do: 0.0

  defp require_char!(ctx) do
    case ctx[:char_id] do
      nil -> raise ArgumentError, "ScriptEffects requires :char_id in ctx"
      id when is_integer(id) -> id
      id when is_binary(id) -> to_int(id)
    end
  end

  defp push_ui(ctx, kind, payload) do
    case ctx[:ui_caller] do
      pid when is_pid(pid) ->
        send(pid, {:script_effect, ctx[:run_id], kind, payload})

      _ ->
        :ok
    end
  end

  defp read_char_flag(nil, _), do: 0
  defp read_char_flag(char, key) do
    case Repo.query("SELECT value FROM game_character_flags WHERE char_id = ? AND flag = ?", [char, key]) do
      {:ok, %{rows: [[v]]}} -> v
      _ -> 0
    end
  end

  defp read_world_flag(key) do
    case Repo.query("SELECT value FROM game_world_flags WHERE flag = ?", [key]) do
      {:ok, %{rows: [[v]]}} -> v
      _ -> 0
    end
  end

  defp count_items(nil, _), do: 0
  defp count_items(char, item_id) do
    case Repo.query("SELECT COALESCE(SUM(quantity), 0) FROM character_items WHERE character_id = ? AND item_id = ?", [char, item_id]) do
      {:ok, %{rows: [[v]]}} -> v
      _ -> 0
    end
  end

  defp read_char_field(nil, _), do: 0
  defp read_char_field(char, field) do
    sql = "SELECT #{field} FROM characters WHERE id = ?"
    case Repo.query(sql, [char]) do
      {:ok, %{rows: [[v]]}} -> v || 0
      _ -> 0
    end
  end

  # Characters table has no gold column — store gold in a side table so this
  # is forward-compatible when an inventory/economy migration adds one.
  defp read_char_gold(nil), do: 0
  defp read_char_gold(char) do
    case Repo.query("SELECT value FROM game_character_flags WHERE char_id = ? AND flag = '__gold'", [char]) do
      {:ok, %{rows: [[v]]}} -> v
      _ -> 0
    end
  end

  defp add_char_gold(char, amount) do
    Repo.query(
      """
      INSERT INTO game_character_flags (char_id, flag, value, updated_at)
      VALUES (?, '__gold', ?, NOW())
      ON DUPLICATE KEY UPDATE value = value + VALUES(value), updated_at = NOW()
      """,
      [char, amount]
    )
  end

  # ── Tables ───────────────────────────────────────────────────

  defp ensure_tables do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS game_world_flags (
      flag VARCHAR(120) PRIMARY KEY,
      value INT NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS game_character_flags (
      char_id INT NOT NULL,
      flag VARCHAR(120) NOT NULL,
      value INT NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (char_id, flag)
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS game_npc_state (
      npc_id INT PRIMARY KEY,
      mood VARCHAR(40) NOT NULL DEFAULT 'neutral',
      alive TINYINT(1) NOT NULL DEFAULT 1,
      updated_at DATETIME NOT NULL
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS game_faction_rep (
      char_id INT NOT NULL,
      faction VARCHAR(80) NOT NULL,
      value INT NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (char_id, faction)
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS game_quest_progress (
      char_id INT NOT NULL,
      quest_id INT NOT NULL,
      step INT NOT NULL DEFAULT 0,
      completed TINYINT(1) NOT NULL DEFAULT 0,
      started_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (char_id, quest_id)
    )
    """)

    :ok
  rescue
    _ -> :ok
  end
end
