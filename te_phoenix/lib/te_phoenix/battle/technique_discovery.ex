defmodule TePhoenix.Battle.TechniqueDiscovery do
  @moduledoc """
  Technique Discovery Engine — detects patterns in player RP actions
  and progresses them toward creating unique techniques.

  Flow:
    1. Player describes an action in a DM session: "I channel ki into my fists and slam the ground"
    2. `check_action/3` scans against admin-defined theme keywords
    3. If a theme matches, increment `character_technique_discoveries.times_used`
    4. At thresholds, return milestone messages:
       - hint_threshold:  "You feel something forming... a new power stirs within you."
       - shape_threshold: "A technique is taking shape! You sense it growing stronger each time."
       - ready_threshold: "Your technique is ready to be unleashed. Give it a name."
    5. When ready, `crystallize/3` creates a real technique in `game_techniques` + `character_techniques`

  Themes can be:
    - Admin pre-defined in `game_discovery_themes` (keyword matching)
    - AI-detected (DM handler passes a theme_tag based on AI analysis)
    - DM-assigned manually ("tag this player's action as 'fire_beam'")
  """

  alias TePhoenix.Repo
  require Logger

  # Cache themes per ruleset
  @cache_ttl 300_000

  defp theme_cache do
    case :ets.whereis(:discovery_themes) do
      :undefined -> :ets.new(:discovery_themes, [:named_table, :public, :set]); :discovery_themes
      _ -> :discovery_themes
    end
  end

  def get_themes(ruleset_id) do
    key = {:themes, ruleset_id}
    case :ets.lookup(theme_cache(), key) do
      [{_, %{data: d, at: at}}] when is_integer(at) ->
        if System.system_time(:millisecond) - at < @cache_ttl, do: d, else: fetch_themes(ruleset_id, key)
      _ -> fetch_themes(ruleset_id, key)
    end
  end

  defp fetch_themes(ruleset_id, key) do
    themes = case Repo.query(
      "SELECT * FROM game_discovery_themes WHERE (ruleset_id=? OR ruleset_id IS NULL) AND is_active=1 ORDER BY sort_order",
      [ruleset_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
    :ets.insert(theme_cache(), {key, %{data: themes, at: System.system_time(:millisecond)}})
    themes
  end

  # ═════════════════════════════════════════════════════════════
  # CHECK ACTION — called on every DM session player action
  # ═════════════════════════════════════════════════════════════

  @doc "Extract normalized word set from action text."
  def extract_words(text) do
    text
    |> to_string()
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9\s]/, "")
    |> String.split()
    |> MapSet.new()
  end

  @doc "Count keyword matches in words set."
  def count_keyword_matches(words, keywords) do
    Enum.count(keywords, fn kw -> MapSet.member?(words, String.downcase(to_string(kw))) end)
  end

  @doc "Check if a word set matches a theme's keywords."
  def theme_matches?(words, theme) do
    keywords = case theme["keywords_json"] || theme[:keywords_json] do
      k when is_binary(k) -> (try do Jason.decode!(k) rescue _ -> [] end)
      k when is_list(k) -> k
      _ -> []
    end
    min_matches = theme["min_keyword_matches"] || theme[:min_keyword_matches] || 2
    count_keyword_matches(words, keywords) >= min_matches
  end

  @doc "Find all matching themes for a text input."
  def match_themes(text, themes) do
    words = extract_words(text)
    Enum.filter(themes, &theme_matches?(words, &1))
  end

  @doc "Evaluate milestone events based on times used and current status."
  def evaluate_milestones(times, hint_at, shape_at, ready_at, hint_given, shape_given, status) do
    events = []

    events =
      if times >= ready_at and status != "ready" do
        events ++ [{:discovery_ready, "**Your technique is ready!** The power you've been building has reached its peak. You can feel it — a unique ability, fully formed and waiting to be unleashed. Give it a name to make it yours."}]
      else
        events
      end

    events =
      if times >= shape_at and shape_given == 0 and status != "ready" do
        events ++ [{:discovery_shape, "**A technique is taking shape!** Each time you repeat this action, you feel the power growing more defined. #{max(0, ready_at - times)} more uses until it fully forms."}]
      else
        events
      end

    events =
      if times >= hint_at and hint_given == 0 and status == "forming" do
        events ++ [{:discovery_hint, "You feel something stirring within you... a new power, faint but growing. Keep honing this action and it may become something more."}]
      else
        events
      end

    events
  end

  @doc "Compute technique parameters merging discovery defaults and DM overrides."
  def compute_technique_params(discovery, dm_overrides, chosen_name, chosen_icon) do
    overrides = dm_overrides || %{}
    disc = discovery || %{}

    category = overrides["category"] || overrides[:category] || disc["suggested_category"] || disc[:suggested_category] || "ki"
    damage = overrides["damage_pct"] || overrides[:damage_pct] || disc["suggested_damage_pct"] || disc[:suggested_damage_pct] || 8
    cost = overrides["cost_pct"] || overrides[:cost_pct] || disc["suggested_cost_pct"] || disc[:suggested_cost_pct] || 5

    raw_effects = case disc["suggested_effects_json"] || disc[:suggested_effects_json] do
      e when is_binary(e) -> (try do Jason.decode!(e) rescue _ -> %{} end)
      e when is_map(e) -> e
      _ -> %{}
    end
    override_effects = overrides["effects"] || overrides[:effects] || %{}
    effects = Map.merge(raw_effects, override_effects)

    %{
      name: chosen_name,
      icon: chosen_icon || "⚡",
      category: category,
      attack_type: if(category == "physical", do: "melee", else: "ranged"),
      range_type: if(category == "physical", do: "short", else: "medium"),
      damage_pct: damage,
      cost_pct: cost,
      stun_chance: effects["stun_chance"] || effects[:stun_chance] || 0,
      stun_duration: effects["stun_duration"] || effects[:stun_duration] || 0,
      bleed_chance: effects["bleed_chance"] || effects[:bleed_chance] || 0,
      bleed_severity: effects["bleed_severity"] || effects[:bleed_severity] || "none"
    }
  end

  @doc """
  Scan a player's RP text for discovery theme matches.
  Returns a list of events: [{:discovery_hint, msg}, {:discovery_shape, msg}, {:discovery_ready, msg}] or []
  """
  def check_action(char_id, action_text, opts \\ []) do
    campaign_id = Keyword.get(opts, :campaign_id)
    ruleset_id = Keyword.get(opts, :ruleset_id)
    explicit_tag = Keyword.get(opts, :theme_tag)  # DM can force a tag

    words = extract_words(action_text)

    # Find matching themes
    themes = if ruleset_id, do: get_themes(ruleset_id), else: []

    matched = if explicit_tag do
      # DM explicitly tagged this action
      [%{"theme_tag" => explicit_tag, "label" => explicit_tag,
         "hint_at" => 3, "shape_at" => 6, "ready_at" => 10,
         "suggested_category" => "ki", "base_damage_pct" => 8, "base_cost_pct" => 5}]
    else
      Enum.filter(themes, &theme_matches?(words, &1))
    end

    # Process each matched theme
    Enum.flat_map(matched, fn theme ->
      process_theme_match(char_id, campaign_id, theme, action_text)
    end)
  end

  defp process_theme_match(char_id, campaign_id, theme, action_text) do
    tag = theme["theme_tag"]
    hint_at = theme["hint_at"] || 3
    shape_at = theme["shape_at"] || 6
    ready_at = theme["ready_at"] || 10

    # Upsert discovery record
    try do
      Repo.query!("""
        INSERT INTO character_technique_discoveries
          (character_id, campaign_id, theme_tag, theme_description, times_used,
           hint_threshold, shape_threshold, ready_threshold, suggested_category,
           suggested_damage_pct, suggested_cost_pct)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          times_used = times_used + 1,
          theme_description = VALUES(theme_description),
          last_used_at = NOW()
      """, [
        char_id, campaign_id, tag,
        String.slice(action_text, 0, 255),
        hint_at, shape_at, ready_at,
        theme["suggested_category"] || "ki",
        theme["base_damage_pct"] || 8,
        theme["base_cost_pct"] || 5
      ])
    rescue _ -> nil
    end

    # Check current progress
    case Repo.query(
      "SELECT times_used, hint_given, shape_given, status FROM character_technique_discoveries WHERE character_id=? AND theme_tag=? AND status IN ('forming','shaping','ready')",
      [char_id, tag]
    ) do
      {:ok, %{rows: [[times, hint_given, shape_given, status]]}} ->
        events = []

        # Ready threshold
        events = if times >= ready_at and status != "ready" do
          Repo.query!("UPDATE character_technique_discoveries SET status='ready' WHERE character_id=? AND theme_tag=?", [char_id, tag])
          events ++ [{:discovery_ready, "**Your technique is ready!** The power you've been building has reached its peak. You can feel it — a unique ability, fully formed and waiting to be unleashed. Give it a name to make it yours."}]
        else
          events
        end

        # Shape threshold
        events = if times >= shape_at and shape_given == 0 and status != "ready" do
          Repo.query!("UPDATE character_technique_discoveries SET shape_given=1, status='shaping' WHERE character_id=? AND theme_tag=?", [char_id, tag])
          events ++ [{:discovery_shape, "**A technique is taking shape!** Each time you repeat this action, you feel the power growing more defined. #{ready_at - times} more uses until it fully forms."}]
        else
          events
        end

        # Hint threshold
        events = if times >= hint_at and hint_given == 0 and status == "forming" do
          Repo.query!("UPDATE character_technique_discoveries SET hint_given=1 WHERE character_id=? AND theme_tag=?", [char_id, tag])
          events ++ [{:discovery_hint, "You feel something stirring within you... a new power, faint but growing. Keep honing this action and it may become something more."}]
        else
          events
        end

        events

      _ -> []
    end
  end

  # ═════════════════════════════════════════════════════════════
  # CRYSTALLIZE — turn a discovery into a real technique
  # ═════════════════════════════════════════════════════════════

  @doc """
  Crystallize a ready discovery into a real technique.
  Called when player names their technique.

  Returns {:ok, technique_id} or {:error, reason}
  """
  def crystallize(char_id, theme_tag, %{name: name} = opts) do
    icon = Map.get(opts, :icon, "⚡")

    case Repo.query(
      "SELECT * FROM character_technique_discoveries WHERE character_id=? AND theme_tag=? AND status='ready'",
      [char_id, theme_tag]
    ) do
      {:ok, %{rows: [row], columns: cols}} ->
        disc = Enum.zip(cols, row) |> Map.new()

        # DM overrides take precedence
        dm_overrides = case disc["dm_override_json"] do
          j when is_binary(j) -> (try do Jason.decode!(j) rescue _ -> %{} end)
          j when is_map(j) -> j
          _ -> %{}
        end

        category = dm_overrides["category"] || disc["suggested_category"] || "ki"
        damage = dm_overrides["damage_pct"] || disc["suggested_damage_pct"] || 8
        cost = dm_overrides["cost_pct"] || disc["suggested_cost_pct"] || 5

        effects = case disc["suggested_effects_json"] do
          e when is_binary(e) -> (try do Jason.decode!(e) rescue _ -> %{} end)
          e when is_map(e) -> e
          _ -> %{}
        end
        effects = Map.merge(effects, dm_overrides["effects"] || %{})

        # Create the technique
        try do
          {:ok, result} = Repo.query(
            """
            INSERT INTO game_techniques
              (name, description, icon, category, attack_type, range_type,
               damage_pct, cost_pct, is_signature, max_level,
               stun_chance_pct, stun_duration, bleed_chance_pct, bleed_severity,
               crit_chance_pct, crit_damage_mult, can_be_dodged, can_be_blocked,
               is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 10, ?, ?, ?, ?, 3, 1.5, 1, 1, 1)
            """,
            [
              name,
              "A unique technique discovered through repeated practice. Created by #{disc["theme_description"] || theme_tag}.",
              icon, category,
              if(category == "physical", do: "melee", else: "ranged"),
              if(category == "physical", do: "short", else: "medium"),
              damage, cost,
              effects["stun_chance"] || 0, effects["stun_duration"] || 0,
              effects["bleed_chance"] || 0, effects["bleed_severity"] || "none"
            ]
          )

          tech_id = result.last_insert_id

          # Grant to character
          Repo.query!("INSERT INTO character_techniques (character_id, technique_id) VALUES (?,?)", [char_id, tech_id])

          # Mark discovery as crystallized
          Repo.query!("UPDATE character_technique_discoveries SET status='crystallized', technique_id=?, chosen_name=?, chosen_icon=?, crystallized_at=NOW() WHERE character_id=? AND theme_tag=?",
            [tech_id, name, icon, char_id, theme_tag])

          {:ok, tech_id}
        rescue
          e -> {:error, Exception.message(e)}
        end

      _ -> {:error, "No ready discovery found for this theme"}
    end
  end

  @doc "Get all active discoveries for a character."
  def get_discoveries(char_id) do
    case Repo.query(
      "SELECT * FROM character_technique_discoveries WHERE character_id=? AND status IN ('forming','shaping','ready') ORDER BY times_used DESC",
      [char_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
  end

  @doc "DM manually tags a player's action with a theme."
  def dm_tag_action(char_id, theme_tag, opts \\ []) do
    check_action(char_id, "", Keyword.put(opts, :theme_tag, theme_tag))
  end

  @doc "DM overrides suggested stats for a discovery before crystallization."
  def dm_override(char_id, theme_tag, overrides) do
    try do
      Repo.query!("UPDATE character_technique_discoveries SET dm_override_json=? WHERE character_id=? AND theme_tag=?",
        [Jason.encode!(overrides), char_id, theme_tag])
      :ok
    rescue
      e -> {:error, Exception.message(e)}
    end
  end
end
