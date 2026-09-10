defmodule TePhoenix.Game.Alignment do
  @moduledoc """
  Alignment / Morality system.

  Scale: -100 (pure evil) to +100 (pure good).
  7 tiers, each with stat bonuses, skill gating, and shop price modifiers.
  Actions shift alignment — kill innocent (-10), spare enemy (+5), etc.
  All tiers and actions are admin-configurable in DB.

  Ported from Node battle/systems.js.
  """

  alias TePhoenix.Repo
  require Logger

  @cache_ttl 300_000

  defp cache do
    case :ets.whereis(:alignment_cache) do
      :undefined -> :ets.new(:alignment_cache, [:named_table, :public, :set]); :alignment_cache
      _ -> :alignment_cache
    end
  end

  # ── Default tiers (used if DB has none) ──
  @default_tiers [
    %{name: "Paragon",  min: 75,  max: 100, bonuses: %{"mo" => 0.15, "md" => 0.15, "luck" => 0.10}, shop_mult: 0.85},
    %{name: "Guardian", min: 40,  max: 74,  bonuses: %{"mo" => 0.10, "md" => 0.10, "luck" => 0.05}, shop_mult: 0.90},
    %{name: "Virtuous", min: 15,  max: 39,  bonuses: %{"def" => 0.05, "mo" => 0.05}, shop_mult: 0.95},
    %{name: "Neutral",  min: -14, max: 14,  bonuses: %{}, shop_mult: 1.00},
    %{name: "Dubious",  min: -39, max: -15, bonuses: %{"atk" => 0.05, "speed" => 0.04}, shop_mult: 1.05},
    %{name: "Corrupt",  min: -74, max: -40, bonuses: %{"atk" => 0.10, "speed" => 0.08, "def" => -0.05}, shop_mult: 1.10},
    %{name: "Tyrant",   min: -100, max: -75, bonuses: %{"atk" => 0.15, "speed" => 0.10, "luck" => 0.10, "def" => -0.10}, shop_mult: 1.20}
  ]

  @doc "Get the alignment tier for a given alignment value."
  def get_tier(alignment) do
    tiers = load_tiers()
    Enum.find(tiers, fn t ->
      alignment >= (t["min_value"] || t[:min] || t["min"]) and
      alignment <= (t["max_value"] || t[:max] || t["max"])
    end) || Enum.find(@default_tiers, fn t -> alignment >= t.min and alignment <= t.max end)
  end

  @doc "Get stat bonuses for a character's current alignment."
  def get_stat_bonuses(char_id) do
    case Repo.query("SELECT alignment FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[alignment]]}} ->
        tier = get_tier(alignment || 0)
        bonuses = parse_bonuses(tier)
        %{tier: tier_name(tier), alignment: alignment, bonuses: bonuses}
      _ -> %{tier: "Neutral", alignment: 0, bonuses: %{}}
    end
  end

  @doc """
  Apply alignment stat bonuses to a combatant's stats.
  Returns modified stats map.
  """
  def apply_bonuses(stats, alignment) do
    tier = get_tier(alignment || 0)
    bonuses = parse_bonuses(tier)

    Enum.reduce(bonuses, stats, fn {stat, bonus_pct}, acc ->
      current = Map.get(acc, stat, 0)
      modified = round(current * (1 + bonus_pct))
      Map.put(acc, stat, max(1, modified))
    end)
  end

  @doc """
  Shift a character's alignment based on an action.
  Clamps to -100..+100 range.
  """
  def shift(char_id, action_key, override_amount \\ nil) do
    amount = if override_amount do
      override_amount
    else
      case Repo.query("SELECT shift_amount FROM game_alignment_actions WHERE action_key=? AND is_active=1", [action_key]) do
        {:ok, %{rows: [[amt]]}} -> amt || 0
        _ -> 0
      end
    end

    if amount != 0 do
      Repo.query!(
        "UPDATE characters SET alignment = GREATEST(-100, LEAST(100, COALESCE(alignment, 0) + ?)) WHERE id=?",
        [amount, char_id])

      # Check if tier changed
      case Repo.query("SELECT alignment FROM characters WHERE id=?", [char_id]) do
        {:ok, %{rows: [[new_alignment]]}} ->
          new_tier = get_tier(new_alignment)
          TePhoenixWeb.Endpoint.broadcast!("user:#{char_id}", "alignment_shift", %{
            alignment: new_alignment,
            shift: amount,
            action: action_key,
            tier: tier_name(new_tier)
          })
          {:ok, %{alignment: new_alignment, tier: tier_name(new_tier), shift: amount}}
        _ -> {:ok, %{shift: amount}}
      end
    else
      :no_change
    end
  end

  @doc "Get shop price multiplier for a character's alignment."
  def shop_price_multiplier(char_id) do
    case Repo.query("SELECT alignment FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[alignment]]}} ->
        tier = get_tier(alignment || 0)
        (tier["shop_price_mult"] || tier[:shop_mult] || 1.0) |> to_float()
      _ -> 1.0
    end
  end

  @doc "Check if a character meets alignment requirements for a skill/item."
  def meets_requirement?(_char_id, required_alignment) when is_nil(required_alignment), do: true
  def meets_requirement?(char_id, required_alignment) do
    case Repo.query("SELECT alignment FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[alignment]]}} ->
        cond do
          required_alignment > 0 -> (alignment || 0) >= required_alignment
          required_alignment < 0 -> (alignment || 0) <= required_alignment
          true -> true
        end
      _ -> false
    end
  end

  @doc "Check if a character can access a skill based on tier gating."
  def can_use_skill?(char_id, skill_id) do
    %{tier: tier_name} = get_stat_bonuses(char_id)
    tier = get_tier_by_name(tier_name)

    skill_access = case tier do
      %{"skill_access" => sa} when is_binary(sa) -> (try do Jason.decode!(sa) rescue _ -> %{} end)
      %{"skill_access" => sa} when is_map(sa) -> sa
      _ -> %{}
    end

    blocked = skill_access["block"] || []
    granted = skill_access["grant"] || []

    cond do
      skill_id in blocked -> false
      granted != [] and skill_id not in granted -> false
      true -> true
    end
  end

  @doc """
  Check if a character can interact with an NPC based on alignment.
  Returns :ok | {:refused, message}
  """
  def can_interact_npc?(char_id, npc_id) do
    case Repo.query("SELECT alignment_min, alignment_max, alignment_refuse_msg, alignment_faction, name FROM game_npcs WHERE id=?", [npc_id]) do
      {:ok, %{rows: [[a_min, a_max, refuse_msg, faction, npc_name]]}} ->
        if is_nil(a_min) and is_nil(a_max) and (is_nil(faction) or faction == "any") do
          :ok
        else
          case Repo.query("SELECT alignment FROM characters WHERE id=?", [char_id]) do
            {:ok, %{rows: [[alignment]]}} ->
              a = alignment || 0
              # Check range
              range_ok = (is_nil(a_min) or a >= a_min) and (is_nil(a_max) or a <= a_max)
              # Check faction shorthand
              faction_ok = case faction do
                "good" -> a >= 15
                "evil" -> a <= -15
                "neutral" -> a >= -40 and a <= 40
                _ -> true
              end

              if range_ok and faction_ok do
                :ok
              else
                msg = refuse_msg || default_refuse_message(faction, npc_name)
                {:refused, msg}
              end
            _ -> :ok
          end
        end
      _ -> :ok  # NPC not found or no alignment columns = allow
    end
  end

  @doc """
  Get shop price multiplier factoring in both the shop's alignment pricing
  and the character's alignment tier discount.
  """
  def shop_price_for_character(char_id, shop_id) do
    # Get player alignment
    alignment = case Repo.query("SELECT alignment FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[a]]}} -> a || 0; _ -> 0
    end

    # Get shop alignment pricing
    case Repo.query("SELECT alignment_min, alignment_max, alignment_refuse_msg, evil_discount_pct, good_discount_pct, alignment_price_mult_json FROM game_shops WHERE id=?", [shop_id]) do
      {:ok, %{rows: [[a_min, a_max, refuse_msg, evil_disc, good_disc, price_json]]}} ->
        # Check if shop allows this alignment
        if (!is_nil(a_min) and alignment < a_min) or (!is_nil(a_max) and alignment > a_max) do
          {:refused, refuse_msg || "This merchant refuses to deal with you."}
        else
          # Calculate price multiplier
          mult = cond do
            # Custom JSON overrides
            price_json && price_json != "" ->
              prices = case price_json do
                j when is_binary(j) -> (try do Jason.decode!(j) rescue _ -> %{} end)
                j when is_map(j) -> j
                _ -> %{}
              end
              faction = cond do
                alignment >= 15 -> "good"
                alignment <= -15 -> "evil"
                true -> "neutral"
              end
              to_float(Map.get(prices, faction, 1.0))

            # Simple discount fields
            alignment <= -15 and evil_disc && to_float(evil_disc) > 0 ->
              1.0 - to_float(evil_disc) / 100.0

            alignment >= 15 and good_disc && to_float(good_disc) > 0 ->
              1.0 - to_float(good_disc) / 100.0

            true -> 1.0
          end

          # Stack with alignment tier's global shop modifier
          tier_mult = shop_price_multiplier(char_id)
          {:ok, mult * tier_mult}
        end
      _ -> {:ok, shop_price_multiplier(char_id)}
    end
  end

  defp default_refuse_message(faction, npc_name) do
    name = npc_name || "The NPC"
    case faction do
      "good" -> "#{name} senses the darkness in your soul. \"I won't help someone like you.\""
      "evil" -> "#{name} sneers at your righteousness. \"You're too soft for my services. Get lost.\""
      "neutral" -> "#{name} doesn't trust extremists. \"Come back when you've found some balance.\""
      _ -> "#{name} refuses to interact with you."
    end
  end

  # ── Private ─────────────────────────────────────────────────

  defp load_tiers do
    key = :alignment_tiers
    case :ets.lookup(cache(), key) do
      [{_, %{data: d, at: at}}] when is_integer(at) ->
        if System.system_time(:millisecond) - at < @cache_ttl, do: d, else: fetch_tiers(key)
      _ -> fetch_tiers(key)
    end
  end

  defp fetch_tiers(key) do
    tiers = case Repo.query("SELECT * FROM game_alignment_tiers WHERE is_active=1 ORDER BY min_value DESC") do
      {:ok, %{rows: rows, columns: cols}} when rows != [] ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> @default_tiers
    end
    :ets.insert(cache(), {key, %{data: tiers, at: System.system_time(:millisecond)}})
    tiers
  end

  defp get_tier_by_name(name) do
    tiers = load_tiers()
    Enum.find(tiers, fn t -> tier_name(t) == name end)
  end

  defp tier_name(%{"name" => n}), do: n
  defp tier_name(%{name: n}), do: n
  defp tier_name(_), do: "Neutral"

  defp parse_bonuses(nil), do: %{}
  defp parse_bonuses(tier) do
    raw = tier["stat_bonuses"] || tier[:bonuses] || tier["bonuses"] || %{}
    case raw do
      b when is_binary(b) -> (try do Jason.decode!(b) rescue _ -> %{} end)
      b when is_map(b) -> b
      _ -> %{}
    end
  end

  defp to_float(v) when is_float(v), do: v
  defp to_float(v) when is_integer(v), do: v / 1.0
  defp to_float(%Decimal{} = v), do: Decimal.to_float(v)
  defp to_float(_), do: 1.0
end
