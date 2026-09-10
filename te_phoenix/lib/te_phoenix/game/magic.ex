defmodule TePhoenix.Game.Magic do
  @moduledoc """
  Phase 1.5d — Celtic magic runtime.

  Oghams are the atomic runic letters of the Celtic Ogham alphabet
  (beith, luis, fearn, sail, nion, …) plus a handful of "dark/heel"
  custom runes used for villain motifs (fuilteach — bloody, etc.).
  Spells compose 1-3 oghams in an ordered pattern; a character can
  cast a spell only when every ogham in the pattern is unlocked.

  Anam is the Gaelic word for "soul" — used here as the mana resource
  consumed by spellcasting. `characters.anam_current` + `.anam_max`
  are added by `ensure_schema/0`. Regen scales with level (default
  `50 + level*5` max, `1/sec` regen) — tunable per-character via
  `characters.anam_regen_per_sec`.

  Templates from `TePhoenix.Game.Crafting` (1.5b) and
  `TePhoenix.Game.Achievements` (1.5c). Same shape: validate →
  mutate → broadcast. Lifecycle gates run inside a single
  `Repo.transaction/1` so concurrent casts can't double-spend anam
  or beat the cooldown.

  ## Capability gate

  All mutating entry points (`cast/3`, `combat_cast/4`, `learn_spell/2`)
  short-circuit with `{:error, :capability_disabled}` when
  `TePhoenix.Capabilities.enabled?(:magic) == false`. Default OFF —
  Goose flips the toggle in `/sauce/capabilities` after browser audit.

  ## Backwards-compat with Quests + Achievements

  Quests/Achievements call `unlock_ogham/2` via `function_exported?`
  graceful-skip (they've been on a STUB path until now). This module
  exports BOTH `/2` (legacy callers, source defaults to "reward") and
  `/3` (canonical) so existing reward distribution starts firing
  immediately on deploy without those modules needing changes.

  ## Error tuples

      {:error, :capability_disabled}
      {:error, :missing_oghams, [keys]}
      {:error, :insufficient_anam}
      {:error, :on_cooldown, ms_remaining}
      {:error, :unknown_spell}
      {:error, :not_known_to_character}
      {:error, :character_not_found}
      {:error, :level_too_low}

  ## PubSub

      Phoenix.PubSub.subscribe(TePhoenix.PubSub, "character:42")
      → {:ogham_unlocked, ogham_id, source}
      → {:spell_learned, spell_id}
      → {:spell_cast, spell_id, target_opts, result}
      → {:anam_changed, current, max}
  """

  alias TePhoenix.Repo
  require Logger

  @oghams_table "game_oghams"
  @char_oghams_table "character_oghams"
  @spells_table "game_spells"
  @char_known_spells_table "character_known_spells"
  @cooldowns_table "character_spell_cooldowns"

  # ── Schema bootstrap ─────────────────────────────────────────────

  @doc """
  Idempotently materialize the magic schema. Creates `game_spells`,
  `character_known_spells`, `character_spell_cooldowns` if absent;
  extends `character_oghams` with `unlocked_at`/`source` if missing;
  extends `characters` with `anam_current`/`anam_max`/
  `anam_regen_per_sec` if missing. Cached via persistent_term so
  repeat calls cost only an :ets read.
  """
  def ensure_schema do
    case :persistent_term.get({__MODULE__, :ready}, false) do
      true ->
        :ok

      false ->
        do_ensure_schema()
        :persistent_term.put({__MODULE__, :ready}, true)
        :ok
    end
  end

  defp do_ensure_schema do
    Repo.query!("""
    CREATE TABLE IF NOT EXISTS #{@spells_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      `key` VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(128) NOT NULL,
      description TEXT,
      icon VARCHAR(8) DEFAULT '✨',
      ogham_pattern_json TEXT NOT NULL,
      anam_cost INT NOT NULL DEFAULT 10,
      cast_time_ms INT NOT NULL DEFAULT 1000,
      cooldown_ms INT NOT NULL DEFAULT 0,
      effect_json LONGTEXT NOT NULL,
      spell_school VARCHAR(32) DEFAULT 'arcane',
      min_level INT NOT NULL DEFAULT 1,
      is_combat_spell TINYINT(1) NOT NULL DEFAULT 1,
      is_utility_spell TINYINT(1) NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_school (spell_school),
      INDEX idx_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)

    Repo.query!("""
    CREATE TABLE IF NOT EXISTS #{@char_known_spells_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      character_id INT NOT NULL,
      spell_id INT NOT NULL,
      learned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_char_spell (character_id, spell_id),
      INDEX idx_character (character_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)

    Repo.query!("""
    CREATE TABLE IF NOT EXISTS #{@cooldowns_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      character_id INT NOT NULL,
      spell_key VARCHAR(64) NOT NULL,
      ready_at_unix_ms BIGINT NOT NULL DEFAULT 0,
      UNIQUE KEY uniq_char_spell_cd (character_id, spell_key),
      INDEX idx_character (character_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)

    # Extend character_oghams with the brief's tracking columns. The
    # schema's existing rich columns (current_rank, kill_count,
    # corruption_points) stay — `unlocked_at` + `source` are the
    # additive metadata.
    for sql <- [
          "ALTER TABLE #{@char_oghams_table} ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
          "ALTER TABLE #{@char_oghams_table} ADD COLUMN IF NOT EXISTS source VARCHAR(64) DEFAULT NULL",
          "ALTER TABLE characters ADD COLUMN IF NOT EXISTS anam_current INT NOT NULL DEFAULT 100",
          "ALTER TABLE characters ADD COLUMN IF NOT EXISTS anam_max INT NOT NULL DEFAULT 100",
          "ALTER TABLE characters ADD COLUMN IF NOT EXISTS anam_regen_per_sec INT NOT NULL DEFAULT 1"
        ] do
      case Repo.query(sql) do
        {:ok, _} -> :ok
        {:error, e} -> Logger.warning("[Magic] #{sql}: #{inspect(e)}")
      end
    end

    :ok
  rescue
    e -> Logger.error("[Magic] ensure_schema: #{inspect(e)}")
  end

  # ── Capability gate ──────────────────────────────────────────────

  defp capability_check do
    if function_exported?(TePhoenix.Capabilities, :enabled?, 1) do
      if TePhoenix.Capabilities.enabled?(:magic), do: :ok, else: {:error, :capability_disabled}
    else
      # Capabilities module not yet started in test contexts — allow.
      :ok
    end
  rescue
    _ -> :ok
  end

  # ── Public API: oghams ───────────────────────────────────────────

  @doc """
  Oghams the character has unlocked, joined with the catalogue row.
  Returns a list of `%{id, name, key, icon, rank, kill_count,
  corruption_points, unlocked_at, source, lore_text}`.
  """
  def list_oghams(character_id) when is_integer(character_id) do
    ensure_schema()

    case Repo.query(
           """
           SELECT g.id, g.name, g.icon, g.description, g.lore_text, g.rank AS catalog_rank,
                  g.element_attack, g.family_id,
                  c.current_rank, c.kill_count, c.corruption_points,
                  c.unlocked_at, c.source, c.slot_index
           FROM #{@char_oghams_table} c
           JOIN #{@oghams_table} g ON g.id = c.ogham_id
           WHERE c.character_id = ?
           ORDER BY c.unlocked_at DESC, g.rank DESC
           """,
           [character_id]
         ) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, &row_to_ogham(&1, cols))

      _ ->
        []
    end
  end

  def list_oghams(_), do: []

  @doc """
  Unlock an ogham for the character. `key` is either the catalogue
  row's `name` (lookup → id) or the integer `ogham_id` directly.
  `source` records what triggered the unlock — quest reward, item
  drop, scripted event, etc. — for audit + UI flavor text.

  Idempotent: re-unlocking returns `{:ok, :already_known}`.

  Note: this entry point bypasses the magic capability gate so
  upstream rewards (quest completion, achievement unlock) keep flowing
  even when magic is disabled. The gate is enforced at *cast* time —
  unlocking just adds a row to the character's notebook.
  """
  def unlock_ogham(character_id, key, source \\ "reward")

  def unlock_ogham(character_id, key, source) when is_integer(character_id) do
    ensure_schema()

    with {:ok, ogham} <- resolve_ogham(key) do
      case Repo.query(
             "SELECT 1 FROM #{@char_oghams_table} WHERE character_id = ? AND ogham_id = ? LIMIT 1",
             [character_id, ogham.id]
           ) do
        {:ok, %{rows: [[1]]}} ->
          {:ok, :already_known}

        _ ->
          Repo.query(
            """
            INSERT INTO #{@char_oghams_table}
              (character_id, ogham_id, item_id, slot_index, current_rank,
               kill_count, corruption_points, source, unlocked_at)
            VALUES (?, ?, 0, 0, 1, 0, 0, ?, NOW())
            """,
            [character_id, ogham.id, to_string(source)]
          )

          broadcast(character_id, {:ogham_unlocked, ogham.id, source})
          {:ok, :unlocked}
      end
    end
  end

  def unlock_ogham(_, _, _), do: {:error, :character_not_found}

  # Note: `unlock_ogham/2` is auto-generated from the default value
  # in the /3 head above (source defaults to "reward"). Quests +
  # Achievements call /2 via function_exported? guard — the default
  # routes them through /3 with source="reward" automatically.

  defp resolve_ogham(id) when is_integer(id) do
    case Repo.query(
           "SELECT id, name, icon, description, rank, element_attack, family_id FROM #{@oghams_table} WHERE id = ? LIMIT 1",
           [id]
         ) do
      {:ok, %{rows: [[oid, n, i, d, r, e, f]]}} ->
        {:ok, %{id: oid, name: n, icon: i, description: d, rank: r, element_attack: e, family_id: f}}

      _ ->
        {:error, :unknown_ogham}
    end
  end

  defp resolve_ogham(name) when is_binary(name) do
    case Repo.query(
           "SELECT id, name, icon, description, rank, element_attack, family_id FROM #{@oghams_table} WHERE LOWER(name) = LOWER(?) ORDER BY id DESC LIMIT 1",
           [name]
         ) do
      {:ok, %{rows: [[oid, n, i, d, r, e, f]]}} ->
        {:ok, %{id: oid, name: n, icon: i, description: d, rank: r, element_attack: e, family_id: f}}

      _ ->
        {:error, :unknown_ogham}
    end
  end

  defp resolve_ogham(_), do: {:error, :unknown_ogham}

  # ── Public API: spells ───────────────────────────────────────────

  @doc """
  Spells the character has explicitly learned. Hot-path for the
  player's spell book UI.
  """
  def list_known_spells(character_id) when is_integer(character_id) do
    ensure_schema()

    case Repo.query(
           """
           SELECT s.id, s.`key`, s.name, s.description, s.icon, s.ogham_pattern_json,
                  s.anam_cost, s.cast_time_ms, s.cooldown_ms, s.effect_json,
                  s.spell_school, s.min_level, s.is_combat_spell, s.is_utility_spell,
                  k.learned_at
           FROM #{@char_known_spells_table} k
           JOIN #{@spells_table} s ON s.id = k.spell_id
           WHERE k.character_id = ? AND s.is_active = 1
           ORDER BY s.min_level, s.name
           """,
           [character_id]
         ) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, &row_to_spell(&1, cols))

      _ ->
        []
    end
  end

  def list_known_spells(_), do: []

  @doc """
  Spells castable RIGHT NOW: known by character + every ogham in
  pattern unlocked + off cooldown + anam ≥ cost. Used by the player
  spell bar UI to grey out unavailable spells.
  """
  def list_castable_now(character_id) when is_integer(character_id) do
    known = list_known_spells(character_id)
    return_castable(character_id, known)
  end

  def list_castable_now(_), do: []

  defp return_castable(character_id, spells) do
    char = fetch_character(character_id)
    unlocked_oghams = MapSet.new(unlocked_ogham_names(character_id))
    now_ms = now_ms()
    cooldowns = fetch_cooldowns(character_id)

    Enum.filter(spells, fn s ->
      pattern_ok?(s.ogham_pattern, unlocked_oghams) and
        char_anam_ok?(char, s.anam_cost) and
        cooldown_ok?(cooldowns, s.key, now_ms)
    end)
  end

  @doc """
  Add a spell to the character's known set. Validates min_level.
  Idempotent — second call returns `{:ok, :already_known}`.
  """
  def learn_spell(character_id, spell_key) when is_integer(character_id) do
    with :ok <- capability_check(),
         {:ok, spell} <- resolve_spell(spell_key),
         :ok <- learn_prereq_check(character_id, spell) do
      case Repo.query(
             "SELECT 1 FROM #{@char_known_spells_table} WHERE character_id = ? AND spell_id = ? LIMIT 1",
             [character_id, spell.id]
           ) do
        {:ok, %{rows: [[1]]}} ->
          {:ok, :already_known}

        _ ->
          Repo.query(
            "INSERT INTO #{@char_known_spells_table} (character_id, spell_id) VALUES (?, ?)",
            [character_id, spell.id]
          )

          broadcast(character_id, {:spell_learned, spell.id})
          {:ok, :learned}
      end
    end
  end

  def learn_spell(_, _), do: {:error, :character_not_found}

  defp learn_prereq_check(character_id, spell) do
    case fetch_character(character_id) do
      nil -> {:error, :character_not_found}
      char -> if (char.level || 1) < (spell.min_level || 1), do: {:error, :level_too_low}, else: :ok
    end
  end

  @doc """
  Out-of-combat cast. Validates oghams + anam + cooldown atomically;
  applies effect_json via the local utility evaluator (NOT through
  Combat — that's `combat_cast/4`'s job). Fires PubSub on success.

  `target_opts` is a free-form map (target_char_id, target_npc_id,
  position, etc.) passed through to the effect evaluator.

  Returns `{:ok, %{spell, target, applied_effects, anam_remaining}}`.
  """
  def cast(character_id, spell_key, target_opts \\ %{})

  def cast(character_id, spell_key, target_opts) when is_integer(character_id) do
    with :ok <- capability_check(),
         {:ok, spell} <- resolve_spell(spell_key) do
      atomic_cast(character_id, spell, target_opts, &apply_utility_effect/4)
    end
  end

  def cast(_, _, _), do: {:error, :character_not_found}

  @doc """
  In-combat cast. Same atomic gate as `cast/3` but the effect runs
  through `TePhoenix.Battle.Combat.handle_spell_cast/3` which
  consumes/produces a battle state map.

  `combat_ctx` shape: `%{state: battle_state_map, target_id: id}`.
  Returns `{:ok, %{state: new_state, log: [...], anam_remaining}}`.
  """
  def combat_cast(character_id, spell_key, target_opts, combat_ctx)
      when is_integer(character_id) and is_map(combat_ctx) do
    with :ok <- capability_check(),
         {:ok, spell} <- resolve_spell(spell_key) do
      atomic_cast(character_id, spell, target_opts, fn cid, sp, opts, _eval_ctx ->
        TePhoenix.Battle.Combat.handle_spell_cast(combat_ctx, sp, %{
          caster_id: cid,
          target_opts: opts
        })
      end)
    end
  end

  def combat_cast(_, _, _, _), do: {:error, :invalid_combat_context}

  # Atomic transaction: ogham gate → anam consume (atomic UPDATE
  # guard) → cooldown set → effect evaluation → broadcast. Throws
  # tagged tuples to roll the transaction back; converts back to
  # `{:error, ...}` for the caller.
  defp atomic_cast(character_id, spell, target_opts, effect_fn) do
    Repo.transaction(fn ->
      :ok = ensure_known_inside_tx(character_id, spell)
      :ok = ensure_oghams_inside_tx(character_id, spell)
      anam_remaining = consume_anam_inside_tx(character_id, spell)
      :ok = set_cooldown_inside_tx(character_id, spell)

      result =
        case effect_fn.(character_id, spell, target_opts, %{}) do
          {:ok, applied} -> %{spell: spell, target: target_opts, applied_effects: applied, anam_remaining: anam_remaining}
          {state, log} when is_map(state) and is_list(log) ->
            %{state: state, log: log, anam_remaining: anam_remaining, spell: spell, target: target_opts}
          other -> %{spell: spell, target: target_opts, applied_effects: other, anam_remaining: anam_remaining}
        end

      broadcast(character_id, {:spell_cast, spell.id, target_opts, result})
      result
    end)
  rescue
    _ -> {:error, :db_error}
  catch
    :throw, reason -> {:error, reason}
  end

  defp ensure_known_inside_tx(character_id, spell) do
    case Repo.query(
           "SELECT 1 FROM #{@char_known_spells_table} WHERE character_id = ? AND spell_id = ? LIMIT 1",
           [character_id, spell.id]
         ) do
      {:ok, %{rows: [[1]]}} -> :ok
      _ -> throw(:not_known_to_character)
    end
  end

  defp ensure_oghams_inside_tx(character_id, spell) do
    required = spell.ogham_pattern || []

    if required == [] do
      :ok
    else
      have = unlocked_ogham_names(character_id) |> MapSet.new()
      missing = Enum.reject(required, &MapSet.member?(have, downcase(&1)))

      if missing == [] do
        :ok
      else
        throw({:missing_oghams, missing})
      end
    end
  end

  defp consume_anam_inside_tx(character_id, spell) do
    case Repo.query(
           """
           UPDATE characters
           SET anam_current = anam_current - ?
           WHERE id = ? AND anam_current >= ?
           """,
           [spell.anam_cost, character_id, spell.anam_cost]
         ) do
      {:ok, %{num_rows: 1}} ->
        case Repo.query("SELECT anam_current, anam_max FROM characters WHERE id = ?", [character_id]) do
          {:ok, %{rows: [[cur, max]]}} ->
            broadcast(character_id, {:anam_changed, cur, max})
            cur

          _ ->
            0
        end

      {:ok, %{num_rows: 0}} ->
        throw(:insufficient_anam)

      _ ->
        throw(:db_error)
    end
  end

  defp set_cooldown_inside_tx(character_id, spell) do
    cooldown = spell.cooldown_ms || 0

    if cooldown > 0 do
      ready_at = now_ms() + cooldown

      # Atomic check-and-set: only update if the current cooldown is
      # already past. Refusing to set lower cooldowns prevents race
      # where a parallel cast already set a longer cooldown.
      case Repo.query(
             """
             INSERT INTO #{@cooldowns_table} (character_id, spell_key, ready_at_unix_ms)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE ready_at_unix_ms =
               IF(ready_at_unix_ms <= ?, VALUES(ready_at_unix_ms), ready_at_unix_ms)
             """,
             [character_id, spell.key, ready_at, now_ms()]
           ) do
        {:ok, _} ->
          # Re-read to confirm we own the cooldown window.
          case Repo.query(
                 "SELECT ready_at_unix_ms FROM #{@cooldowns_table} WHERE character_id = ? AND spell_key = ?",
                 [character_id, spell.key]
               ) do
            {:ok, %{rows: [[r]]}} when r >= ready_at -> :ok
            {:ok, %{rows: [[_]]}} -> throw(:on_cooldown_lost_race)
            _ -> :ok
          end

        _ ->
          throw(:db_error)
      end
    else
      :ok
    end
  end

  # ── Anam regen (called by a periodic ticker — separate concern) ─

  @doc """
  Regenerate anam for a character. Pass `seconds` since last tick.
  Caps at `anam_max`. Returns `{cur, max}` after regen.
  """
  def regen_anam(character_id, seconds) when is_integer(character_id) and is_integer(seconds) do
    ensure_schema()

    case Repo.query(
           """
           UPDATE characters
           SET anam_current = LEAST(anam_max, anam_current + (anam_regen_per_sec * ?))
           WHERE id = ?
           """,
           [seconds, character_id]
         ) do
      {:ok, _} ->
        case Repo.query("SELECT anam_current, anam_max FROM characters WHERE id = ?", [character_id]) do
          {:ok, %{rows: [[cur, max]]}} ->
            broadcast(character_id, {:anam_changed, cur, max})
            {cur, max}

          _ ->
            {0, 0}
        end

      _ ->
        {0, 0}
    end
  end

  def regen_anam(_, _), do: {0, 0}

  @doc "Admin — clear every cooldown row for a character (for tests + GM tools)."
  def reset_cooldowns(character_id) when is_integer(character_id) do
    ensure_schema()
    Repo.query("DELETE FROM #{@cooldowns_table} WHERE character_id = ?", [character_id])
    :ok
  end

  def reset_cooldowns(_), do: :ok

  # ── Cast effect evaluators (utility / non-combat) ────────────────

  # Evaluate the spell's effect_json outside combat. Supported keys
  # match the brief: damage / heal / status_apply / status_remove /
  # summon / buff / dispel. Each returns `{:ok, summary_list}`.
  # Combat-time evaluation routes through Battle.Combat.handle_spell_cast/3
  # instead — same effect schema, different state mutation surface.
  defp apply_utility_effect(character_id, spell, target_opts, _ctx) do
    effects = parse_json(spell.effect_json, %{})
    applied = Enum.map(effects, &apply_one_effect(character_id, &1, target_opts))
    {:ok, applied}
  end

  defp apply_one_effect(character_id, {"heal", %{} = params}, _opts) do
    amount = params["amount"] || 0

    Repo.query(
      "UPDATE characters SET current_hp = LEAST(max_hp, current_hp + ?) WHERE id = ?",
      [amount, character_id]
    )

    %{kind: :heal, amount: amount}
  end

  defp apply_one_effect(character_id, {"buff", %{} = params}, _opts) do
    # Persist as a row in character_status_effects if that table is
    # present; otherwise log + skip gracefully.
    if function_exported?(TePhoenix.Battle.StatusRegistry, :apply_to_character, 2) do
      apply(TePhoenix.Battle.StatusRegistry, :apply_to_character, [character_id, params])
      %{kind: :buff, params: params}
    else
      %{kind: :buff, params: params, note: :status_registry_unavailable}
    end
  end

  defp apply_one_effect(_character_id, {"summon", params}, _opts), do: %{kind: :summon, params: params}
  defp apply_one_effect(_, {"dispel", params}, _opts), do: %{kind: :dispel, params: params}
  defp apply_one_effect(_, {"status_apply", params}, _opts), do: %{kind: :status_apply, params: params}
  defp apply_one_effect(_, {"status_remove", params}, _opts), do: %{kind: :status_remove, params: params}
  defp apply_one_effect(_, {"damage", params}, _opts), do: %{kind: :damage, params: params, note: :requires_combat_context}
  defp apply_one_effect(_, {kind, params}, _opts), do: %{kind: kind, params: params}

  # ── DB helpers ───────────────────────────────────────────────────

  defp resolve_spell(key) when is_binary(key) do
    case Repo.query(
           """
           SELECT id, `key`, name, description, icon, ogham_pattern_json, anam_cost,
                  cast_time_ms, cooldown_ms, effect_json, spell_school, min_level,
                  is_combat_spell, is_utility_spell, is_active
           FROM #{@spells_table}
           WHERE `key` = ? LIMIT 1
           """,
           [key]
         ) do
      {:ok, %{rows: [[id, k, n, d, i, pat, cost, ct, cd, eff, school, lvl, ic, iu, active]]}} ->
        if active in [1, true] do
          {:ok,
           %{
             id: id,
             key: k,
             name: n,
             description: d,
             icon: i,
             ogham_pattern: parse_pattern(pat),
             anam_cost: cost || 10,
             cast_time_ms: ct || 1000,
             cooldown_ms: cd || 0,
             effect_json: eff,
             spell_school: school,
             min_level: lvl || 1,
             is_combat_spell: ic in [1, true],
             is_utility_spell: iu in [1, true]
           }}
        else
          {:error, :spell_disabled}
        end

      _ ->
        {:error, :unknown_spell}
    end
  end

  defp resolve_spell(id) when is_integer(id) do
    case Repo.query("SELECT `key` FROM #{@spells_table} WHERE id = ? LIMIT 1", [id]) do
      {:ok, %{rows: [[k]]}} -> resolve_spell(k)
      _ -> {:error, :unknown_spell}
    end
  end

  defp resolve_spell(_), do: {:error, :unknown_spell}

  defp parse_pattern(nil), do: []
  defp parse_pattern(""), do: []

  defp parse_pattern(s) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, list} when is_list(list) -> Enum.map(list, &downcase/1)
      _ -> []
    end
  end

  defp parse_pattern(list) when is_list(list), do: Enum.map(list, &downcase/1)
  defp parse_pattern(_), do: []

  defp downcase(s) when is_binary(s), do: String.downcase(s)
  defp downcase(o), do: to_string(o) |> String.downcase()

  defp unlocked_ogham_names(character_id) do
    case Repo.query(
           """
           SELECT g.name
           FROM #{@char_oghams_table} c
           JOIN #{@oghams_table} g ON g.id = c.ogham_id
           WHERE c.character_id = ?
           """,
           [character_id]
         ) do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [n] -> downcase(n) end)
      _ -> []
    end
  end

  defp fetch_cooldowns(character_id) do
    case Repo.query(
           "SELECT spell_key, ready_at_unix_ms FROM #{@cooldowns_table} WHERE character_id = ?",
           [character_id]
         ) do
      {:ok, %{rows: rows}} -> Map.new(rows, fn [k, r] -> {k, r} end)
      _ -> %{}
    end
  end

  defp pattern_ok?(pattern, unlocked_set) do
    Enum.all?(pattern, &MapSet.member?(unlocked_set, &1))
  end

  defp char_anam_ok?(%{anam_current: cur}, cost), do: (cur || 0) >= cost
  defp char_anam_ok?(_other, _cost), do: false

  defp cooldown_ok?(cooldowns, key, now), do: Map.get(cooldowns, key, 0) <= now

  defp fetch_character(character_id) do
    case Repo.query(
           "SELECT id, level, anam_current, anam_max, anam_regen_per_sec FROM characters WHERE id = ? LIMIT 1",
           [character_id]
         ) do
      {:ok, %{rows: [[id, lvl, cur, max, regen]]}} ->
        %{id: id, level: lvl, anam_current: cur, anam_max: max, anam_regen_per_sec: regen}

      _ ->
        nil
    end
  end

  defp now_ms, do: System.system_time(:millisecond)

  defp row_to_ogham(row, cols) do
    base = cols |> Enum.zip(row) |> Map.new()

    %{
      id: base["id"],
      name: base["name"],
      icon: base["icon"],
      description: base["description"],
      lore_text: base["lore_text"],
      catalog_rank: base["catalog_rank"],
      element_attack: base["element_attack"],
      family_id: base["family_id"],
      mastery_rank: base["current_rank"] || 1,
      kill_count: base["kill_count"] || 0,
      corruption_points: base["corruption_points"] || 0,
      unlocked_at: base["unlocked_at"],
      source: base["source"],
      slot_index: base["slot_index"]
    }
  end

  defp row_to_spell(row, cols) do
    base = cols |> Enum.zip(row) |> Map.new()

    %{
      id: base["id"],
      key: base["key"],
      name: base["name"],
      description: base["description"],
      icon: base["icon"],
      ogham_pattern: parse_pattern(base["ogham_pattern_json"]),
      anam_cost: base["anam_cost"] || 10,
      cast_time_ms: base["cast_time_ms"] || 1000,
      cooldown_ms: base["cooldown_ms"] || 0,
      effect_json: base["effect_json"],
      spell_school: base["spell_school"],
      min_level: base["min_level"] || 1,
      is_combat_spell: (base["is_combat_spell"] || 1) == 1,
      is_utility_spell: (base["is_utility_spell"] || 0) == 1,
      learned_at: base["learned_at"]
    }
  end

  defp broadcast(character_id, msg) do
    Phoenix.PubSub.broadcast(TePhoenix.PubSub, "character:#{character_id}", msg)
  rescue
    _ -> :ok
  end

  defp parse_json(nil, default), do: default
  defp parse_json("", default), do: default

  defp parse_json(s, default) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, %{} = m} -> Map.to_list(m)
      {:ok, list} when is_list(list) -> list
      _ -> default
    end
  end

  defp parse_json(_, default), do: default
end
