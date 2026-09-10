defmodule TePhoenix.AI.FeatureRegistry do
  @moduledoc """
  Source of truth for AI feature metadata: which features exist, what
  they're for, who can use them, and what their per-feature budget
  caps are.

  Backed by the existing `ai_features` table (already populated with
  21 rows pre-Tier-α-AI). This module adds the Tier α-AI columns
  (`min_role_weight`, `daily_token_cap`, `weekly_token_cap`,
  `prompt_template`, `schema_module`, `genres`) on first call via
  `ensure_columns/0`, then exposes a typed query API.

  ## Public API

      list_features/0           — all features as %Feature{} structs
      get/1                     — one feature by key
      available_for?/2          — :ok | {:error, reason} for (user, key)
      enabled_for_genre?/2      — single boolean

  Auth + budget gates are intentionally split: the Gateway calls
  `available_for?/2` first (cheap; just metadata), and only invokes
  Budget.check_budget/3 when a generation is actually about to fire.
  """

  require Logger
  alias TePhoenix.Repo

  @table "ai_features"

  defmodule Feature do
    @moduledoc false
    defstruct [
      :id,
      :feature_key,
      :label,
      :description,
      :category,
      :enabled_globally,
      :min_role_weight,
      :daily_token_cap,
      :weekly_token_cap,
      :prompt_template,
      :schema_module,
      :genres,
      :estimated_tokens
    ]
  end

  @doc """
  Idempotently extend `ai_features` with the Tier α-AI columns.
  Cached via persistent_term so repeat calls cost an :ets read.
  """
  def ensure_columns do
    case :persistent_term.get({__MODULE__, :ready}, false) do
      true ->
        :ok

      false ->
        do_ensure_columns()
        :persistent_term.put({__MODULE__, :ready}, true)
        :ok
    end
  end

  defp do_ensure_columns do
    create_table = """
    CREATE TABLE IF NOT EXISTS #{@table} (
      id SERIAL PRIMARY KEY,
      feature_key VARCHAR(100) NOT NULL UNIQUE,
      label VARCHAR(255) NOT NULL DEFAULT '',
      description TEXT,
      category VARCHAR(50) NOT NULL DEFAULT 'general',
      default_enabled SMALLINT NOT NULL DEFAULT 1,
      min_role_weight INT NOT NULL DEFAULT 60,
      daily_token_cap INT NOT NULL DEFAULT 10000,
      weekly_token_cap INT NOT NULL DEFAULT 50000,
      prompt_template VARCHAR(255) DEFAULT NULL,
      schema_module VARCHAR(255) DEFAULT NULL,
      genres TEXT DEFAULT NULL,
      estimated_tokens INT NOT NULL DEFAULT 1000,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
    """

    statements = [
      create_table,
      "ALTER TABLE #{@table} ADD COLUMN IF NOT EXISTS min_role_weight INT NOT NULL DEFAULT 60",
      "ALTER TABLE #{@table} ADD COLUMN IF NOT EXISTS daily_token_cap INT NOT NULL DEFAULT 10000",
      "ALTER TABLE #{@table} ADD COLUMN IF NOT EXISTS weekly_token_cap INT NOT NULL DEFAULT 50000",
      "ALTER TABLE #{@table} ADD COLUMN IF NOT EXISTS prompt_template VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE #{@table} ADD COLUMN IF NOT EXISTS schema_module VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE #{@table} ADD COLUMN IF NOT EXISTS genres TEXT DEFAULT NULL",
      "ALTER TABLE #{@table} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP"
    ]

    for sql <- statements do
      case Repo.query(sql) do
        {:ok, _} -> :ok
        {:error, e} -> Logger.warning("[FeatureRegistry] #{sql}: #{inspect(e)}")
      end
    end

    :ok
  rescue
    e -> Logger.error("[FeatureRegistry] ensure_columns: #{inspect(e)}")
  end

  @doc "List every feature row, one Feature struct per row."
  def list_features do
    ensure_columns()

    case Repo.query("""
         SELECT id, feature_key, label, description, category,
                default_enabled, min_role_weight, daily_token_cap,
                weekly_token_cap, prompt_template, schema_module,
                genres, estimated_tokens
         FROM #{@table}
         ORDER BY category, feature_key
         """) do
      {:ok, %{rows: rows}} -> Enum.map(rows, &row_to_struct/1)
      _ -> []
    end
  end

  @doc "Fetch one feature by key. Returns `nil` if not found."
  def get(key) when is_atom(key), do: get(Atom.to_string(key))

  def get(key) when is_binary(key) do
    ensure_columns()

    case Repo.query(
           """
           SELECT id, feature_key, label, description, category,
                  default_enabled, min_role_weight, daily_token_cap,
                  weekly_token_cap, prompt_template, schema_module,
                  genres, estimated_tokens
           FROM #{@table}
           WHERE feature_key = ? LIMIT 1
           """,
           [key]
         ) do
      {:ok, %{rows: [row]}} -> row_to_struct(row)
      _ -> nil
    end
  end

  def get(_), do: nil

  @doc """
  Check whether a user can invoke a given feature. Returns `:ok` or
  `{:error, reason}`. Does NOT check the live budget — that's a
  separate call (`Budget.check_budget/3`) made just before generation.
  """
  def available_for?(user, key) do
    case get(key) do
      nil ->
        {:error, :feature_not_found}

      %Feature{} = f ->
        cond do
          f.enabled_globally not in [true, 1] ->
            {:error, :feature_disabled_globally}

          user_role_weight(user) < (f.min_role_weight || 0) ->
            {:error, :role_weight_too_low}

          true ->
            :ok
        end
    end
  end

  @doc "Single boolean: does this feature run on the named genre?"
  def enabled_for_genre?(key, genre) do
    case get(key) do
      nil ->
        false

      %Feature{genres: nil} ->
        true

      %Feature{genres: ""} ->
        true

      %Feature{genres: g} when is_binary(g) ->
        g
        |> String.split([",", " "], trim: true)
        |> Enum.any?(fn x -> x == "all" or x == to_string(genre) end)

      _ ->
        true
    end
  end

  @doc """
  Upsert a feature row. Used by the seed flow + the admin LV.
  Pass either a map or keyword list with the row's columns.
  """
  def upsert(attrs) when is_list(attrs), do: upsert(Map.new(attrs))

  def upsert(%{} = attrs) do
    ensure_columns()

    key = Map.get(attrs, :feature_key) || Map.get(attrs, "feature_key")
    if is_nil(key) or key == "" do
      raise ArgumentError, "feature_key required"
    end

    label = attrs[:label] || attrs["label"] || key
    description = attrs[:description] || attrs["description"]
    category = attrs[:category] || attrs["category"] || "content"
    default_enabled = bool(attrs[:enabled_globally] || attrs["enabled_globally"] || attrs[:default_enabled] || true)
    min_role_weight = attrs[:min_role_weight] || attrs["min_role_weight"] || 60
    daily_cap = attrs[:daily_token_cap] || attrs["daily_token_cap"] || 10_000
    weekly_cap = attrs[:weekly_token_cap] || attrs["weekly_token_cap"] || 50_000
    prompt_template = attrs[:prompt_template] || attrs["prompt_template"]
    schema_module = attrs[:schema_module] || attrs["schema_module"]
    genres = serialize_genres(attrs[:genres] || attrs["genres"])
    est_tokens = attrs[:estimated_tokens] || attrs["estimated_tokens"] || 1000

    Repo.query(
      """
      INSERT INTO #{@table}
        (feature_key, label, description, category, default_enabled,
         min_role_weight, daily_token_cap, weekly_token_cap,
         prompt_template, schema_module, genres, estimated_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        label = VALUES(label),
        description = VALUES(description),
        category = VALUES(category),
        min_role_weight = VALUES(min_role_weight),
        daily_token_cap = VALUES(daily_token_cap),
        weekly_token_cap = VALUES(weekly_token_cap),
        prompt_template = VALUES(prompt_template),
        schema_module = VALUES(schema_module),
        genres = VALUES(genres),
        estimated_tokens = VALUES(estimated_tokens)
      """,
      [
        key,
        label,
        description,
        category,
        default_enabled,
        min_role_weight,
        daily_cap,
        weekly_cap,
        prompt_template,
        schema_module,
        genres,
        est_tokens
      ]
    )
  end

  @doc """
  Patch a single field on an existing feature. Returns `:ok` on success.
  Used by `/sauce/ai-features` admin form.
  """
  def update_field(key, field, value)
      when field in [
             :label,
             :description,
             :category,
             :enabled_globally,
             :min_role_weight,
             :daily_token_cap,
             :weekly_token_cap,
             :prompt_template,
             :schema_module,
             :genres,
             :estimated_tokens
           ] do
    ensure_columns()

    column =
      case field do
        :enabled_globally -> "default_enabled"
        other -> Atom.to_string(other)
      end

    coerced =
      case field do
        :enabled_globally -> bool(value)
        :genres -> serialize_genres(value)
        :min_role_weight -> to_int(value, 60)
        :daily_token_cap -> to_int(value, 10_000)
        :weekly_token_cap -> to_int(value, 50_000)
        :estimated_tokens -> to_int(value, 1000)
        _ -> value
      end

    Repo.query("UPDATE #{@table} SET #{column} = ? WHERE feature_key = ?", [coerced, to_string(key)])
    :ok
  end

  def update_field(_, _, _), do: {:error, :invalid_field}

  @doc """
  Seed the canonical 20 features from the brief. Idempotent — runs
  upsert per row. Existing rows update their Tier α-AI metadata; new
  rows materialize with sensible defaults.
  """
  def seed_canonical_features do
    ensure_columns()

    for f <- canonical_features() do
      upsert(f)
    end

    :ok
  end

  # ── Private helpers ────────────────────────────────────────────

  defp row_to_struct([
         id,
         feature_key,
         label,
         description,
         category,
         default_enabled,
         min_role_weight,
         daily_cap,
         weekly_cap,
         prompt_template,
         schema_module,
         genres,
         estimated_tokens
       ]) do
    %Feature{
      id: id,
      feature_key: feature_key,
      label: label,
      description: description,
      category: category,
      enabled_globally: default_enabled in [1, true],
      min_role_weight: min_role_weight || 0,
      daily_token_cap: daily_cap || 10_000,
      weekly_token_cap: weekly_cap || 50_000,
      prompt_template: prompt_template,
      schema_module: schema_module,
      genres: genres,
      estimated_tokens: estimated_tokens || 1000
    }
  end

  defp user_role_weight(nil), do: 0
  defp user_role_weight(%{role_weight: w}) when is_integer(w), do: w
  defp user_role_weight(%{role: r}), do: TePhoenixWeb.Components.PowerUserField.role_weight(r)
  defp user_role_weight(role) when is_binary(role), do: TePhoenixWeb.Components.PowerUserField.role_weight(role)
  defp user_role_weight(_), do: 0

  defp bool(true), do: 1
  defp bool(false), do: 0
  defp bool(1), do: 1
  defp bool(0), do: 0
  defp bool("true"), do: 1
  defp bool("1"), do: 1
  defp bool(_), do: 0

  defp serialize_genres(nil), do: nil
  defp serialize_genres([]), do: ""
  defp serialize_genres(list) when is_list(list), do: Enum.join(list, ",")
  defp serialize_genres(s) when is_binary(s), do: s
  defp serialize_genres(_), do: nil

  defp to_int(n, _) when is_integer(n), do: n
  defp to_int(s, default) when is_binary(s) do
    case Integer.parse(s) do
      {i, _} -> i
      _ -> default
    end
  end
  defp to_int(_, default), do: default

  # ── Canonical feature list ─────────────────────────────────────
  # Mirrors the 20 surfaces named in the JARVIS brief.

  defp canonical_features do
    [
      # Combat
      f("rule_suggester", "Rule Suggester", "combat",
        "Convert plain-English combat rule text into structured RuleBuilder JSON",
        "TePhoenix.AI.Templates.RuleSuggester"),
      f("status_generator", "Status Generator", "combat",
        "Generate a status effect (icon, duration, on_apply/tick/expire) from a description",
        "TePhoenix.AI.Templates.StatusGenerator"),
      f("boss_phase_progression", "Boss Phase Progression", "combat",
        "Suggest HP thresholds + per-phase mods + transition cues for a boss design",
        "TePhoenix.AI.Templates.BossPhaseProgression"),
      f("surface_effect", "Surface Effect", "combat",
        "Compose an on-step / on-tick / on-exit effect set for a battle surface",
        "TePhoenix.AI.Templates.SurfaceEffect"),
      f("match_win_condition", "Match Win Condition", "combat",
        "Author a balanced win condition + tiebreaker for a match mode",
        "TePhoenix.AI.Templates.MatchWinCondition"),

      # Content (CombatHub sub-tabs)
      f("class_stat_block", "Class Stat Block", "content",
        "Generate a class with stat scaling, primary stats, signature ability slots",
        "TePhoenix.AI.Templates.ClassStatBlock"),
      f("skill_design", "Skill Design", "content",
        "Generate a skill — name, formula, cooldown, MP cost, flavor",
        "TePhoenix.AI.Templates.SkillDesign"),
      f("sig_tech", "Signature Technique", "content",
        "Generate a signature technique with damage curve + animation tag",
        "TePhoenix.AI.Templates.SigTech"),
      f("limit_break", "Limit Break", "content",
        "Generate a Limit Break: charge rate, damage multiplier, cinematic cue",
        "TePhoenix.AI.Templates.LimitBreak"),
      f("ki_move", "Ki Move", "content",
        "Generate a Ki / DBZ-style energy move",
        "TePhoenix.AI.Templates.KiMove"),

      # Design
      f("item_design", "Item Design", "design",
        "Generate an item: rarity, type, stat bonuses, flavor",
        "TePhoenix.AI.Templates.ItemDesign"),
      f("loot_balance", "Loot Balance", "design",
        "Audit a loot table and suggest probability tweaks for a target rarity curve",
        "TePhoenix.AI.Templates.LootBalance"),
      f("recipe_suggestion", "Recipe Suggestion", "design",
        "Propose a crafting recipe: ingredients + output + cost balance",
        "TePhoenix.AI.Templates.RecipeSuggestion"),
      f("quest_chain", "Quest Chain", "design",
        "Generate a multi-stage quest with prereqs + rewards + flavor",
        "TePhoenix.AI.Templates.QuestChain"),
      f("achievement_set", "Achievement Set", "design",
        "Generate a set of achievements around a theme with rarity + reward tiers",
        "TePhoenix.AI.Templates.AchievementSet"),

      # Other
      f("dialogue_branch", "Dialogue Branch", "narrative",
        "Suggest the next NPC dialogue node with branching player responses",
        "TePhoenix.AI.Templates.DialogueBranch"),
      f("script_from_text", "Script From Text", "narrative",
        "Generate a visual script graph (nodes + connections) from plain-English",
        "TePhoenix.AI.Templates.ScriptFromText"),
      f("ogham_design", "Ogham Design", "magic",
        "Generate an ogham (rune): symbol, family, awakening tiers, casting effects",
        "TePhoenix.AI.Templates.OghamDesign"),
      f("brand_palette", "Brand Palette", "design",
        "Suggest a splash + login color palette + atmosphere preset for a theme",
        "TePhoenix.AI.Templates.BrandPalette"),
      f("onboarding_seed", "Onboarding Seed", "design",
        "Generate starter content (maps, NPCs, items, quests) for a chosen genre",
        "TePhoenix.AI.Templates.OnboardingSeed"),
      f("npc_dialogue", "NPC Dialogue", "narrative",
        "Generate dynamic NPC dialogue grounded in personality, trauma, and memory",
        "TePhoenix.AI.Templates.NpcDialogue")
    ]
  end

  defp f(key, label, category, description, template_module) do
    %{
      feature_key: key,
      label: label,
      category: category,
      description: description,
      enabled_globally: true,
      min_role_weight: 60,
      daily_token_cap: 10_000,
      weekly_token_cap: 50_000,
      prompt_template: template_module,
      genres: ["all"],
      estimated_tokens: 1500
    }
  end
end
