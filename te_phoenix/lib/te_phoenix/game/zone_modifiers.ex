defmodule TePhoenix.Game.ZoneModifiers do
  @moduledoc """
  Zone/Region Modifier system.

  Each map belongs to a region. Regions have multipliers for XP, gold,
  loot, spawn rates, shop prices. Also flags for PvP, sanctuary,
  weather, danger level, faction control.

  Auto-rules: regions can have conditional overrides that activate
  when world flags match certain conditions (e.g. "if blood_moon=true,
  set xp_mult=2.0 and spawn_rate_mult=3.0").

  Ported from Node state.js loadRegionState/applyRegionAutoRules.
  """

  alias TePhoenix.Repo
  require Logger

  @cache_ttl 300_000

  defp cache do
    case :ets.whereis(:region_cache) do
      :undefined -> :ets.new(:region_cache, [:named_table, :public, :set]); :region_cache
      _ -> :region_cache
    end
  end

  @doc "Load the effective region for a map (cached, auto-rules applied)."
  def get_region_for_map(map_id) do
    key = {:region, map_id}
    case :ets.lookup(cache(), key) do
      [{_, %{data: d, at: at}}] when is_integer(at) ->
        if System.system_time(:millisecond) - at < @cache_ttl, do: d, else: fetch_region(map_id, key)
      _ -> fetch_region(map_id, key)
    end
  end

  defp fetch_region(map_id, key) do
    region = case Repo.query(
      "SELECT r.* FROM game_regions r JOIN game_maps m ON m.region_id = r.id WHERE m.id = ? AND r.is_active = 1 LIMIT 1",
      [map_id]
    ) do
      {:ok, %{rows: [row], columns: cols}} ->
        base = Enum.zip(cols, row) |> Map.new()
        apply_auto_rules(base)
      _ -> nil
    end
    :ets.insert(cache(), {key, %{data: region, at: System.system_time(:millisecond)}})
    region
  end

  @doc "Apply all multipliers to a reward. Returns modified values."
  def apply_rewards(map_id, %{xp: xp, gold: gold} = rewards) do
    region = get_region_for_map(map_id)
    if is_nil(region) do
      rewards
    else
      %{rewards |
        xp: round(xp * to_float(region["xp_mult"])),
        gold: round(gold * to_float(region["gold_mult"]))
      }
    end
  end

  @doc "Get loot multiplier for a map."
  def loot_multiplier(map_id) do
    region = get_region_for_map(map_id)
    if region, do: to_float(region["loot_mult"]), else: 1.0
  end

  @doc "Get spawn rate multiplier for a map."
  def spawn_rate_multiplier(map_id) do
    region = get_region_for_map(map_id)
    if region, do: to_float(region["spawn_rate_mult"]), else: 1.0
  end

  @doc "Get shop price multiplier for a map (stacks with alignment)."
  def shop_price_multiplier(map_id) do
    region = get_region_for_map(map_id)
    if region, do: to_float(region["shop_price_mult"]), else: 1.0
  end

  @doc "Check if PvP is enabled on a map."
  def pvp_enabled?(map_id) do
    region = get_region_for_map(map_id)
    region && region["pvp_enabled"] == 1
  end

  @doc "Check if map is a sanctuary (no combat)."
  def sanctuary?(map_id) do
    region = get_region_for_map(map_id)
    region && region["is_sanctuary"] == 1
  end

  @doc "Get weather override for a map."
  def weather(map_id) do
    region = get_region_for_map(map_id)
    region && region["weather_override"]
  end

  @doc "Get danger level for a map (1-5)."
  def danger_level(map_id) do
    region = get_region_for_map(map_id)
    if region, do: region["danger_level"] || 1, else: 1
  end

  @doc "Get full region data for client display."
  def get_region_info(map_id) do
    region = get_region_for_map(map_id)
    if region do
      %{
        id: region["id"],
        name: region["name"],
        danger_level: region["danger_level"],
        corruption_level: region["corruption_level"],
        faction_control: region["faction_control"],
        weather_override: region["weather_override"],
        pvp_enabled: region["pvp_enabled"] == 1,
        is_sanctuary: region["is_sanctuary"] == 1,
        xp_mult: to_float(region["xp_mult"]),
        gold_mult: to_float(region["gold_mult"]),
        active_tags: parse_json(region["active_tags_json"])
      }
    end
  end

  @doc "Reload all regions (call after admin edits)."
  def clear_cache, do: :ets.delete_all_objects(cache())

  # ── Auto Rules ──────────────────────────────────────────────

  defp apply_auto_rules(region) do
    rules_json = region["auto_rules_json"]
    rules = case rules_json do
      j when is_binary(j) -> (try do Jason.decode!(j) rescue _ -> [] end)
      j when is_list(j) -> j
      _ -> []
    end

    if rules == [] do
      region
    else
      # Load current world flags
      flags = load_world_flags()

      Enum.reduce(rules, region, fn rule, acc ->
        conditions = rule["conditions"] || []
        all_met = Enum.all?(conditions, fn cond_map ->
          flag_key = cond_map["flag"]
          operator = cond_map["operator"] || "=="
          expected = cond_map["value"]
          actual = Map.get(flags, flag_key)

          compare(actual, operator, expected)
        end)

        if all_met do
          # Merge the "apply" fields onto the region
          apply_map = rule["apply"] || %{}
          Map.merge(acc, apply_map)
        else
          acc
        end
      end)
    end
  end

  defp compare(actual, "==", expected), do: to_string(actual) == to_string(expected)
  defp compare(actual, "!=", expected), do: to_string(actual) != to_string(expected)
  defp compare(actual, ">", expected), do: to_num(actual) > to_num(expected)
  defp compare(actual, ">=", expected), do: to_num(actual) >= to_num(expected)
  defp compare(actual, "<", expected), do: to_num(actual) < to_num(expected)
  defp compare(actual, "<=", expected), do: to_num(actual) <= to_num(expected)
  defp compare(_, _, _), do: false

  defp load_world_flags do
    case Repo.query("SELECT flag_key, flag_value FROM world_flags") do
      {:ok, %{rows: rows}} -> Enum.into(rows, %{}, fn [k, v] -> {k, v} end)
      _ -> %{}
    end
  end

  defp to_num(v) when is_integer(v), do: v
  defp to_num(v) when is_float(v), do: v
  defp to_num(v) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n; :error -> case Float.parse(v) do {f, _} -> f; _ -> 0 end
    end
  end
  defp to_num(_), do: 0

  defp to_float(nil), do: 1.0
  defp to_float(v) when is_float(v), do: v
  defp to_float(v) when is_integer(v), do: v / 1.0
  defp to_float(%Decimal{} = v), do: Decimal.to_float(v)
  defp to_float(v) when is_binary(v) do
    case Float.parse(v) do
      {f, _} -> f; :error -> 1.0
    end
  end
  defp to_float(_), do: 1.0

  defp parse_json(nil), do: []
  defp parse_json(j) when is_binary(j) do
    case Jason.decode(j) do
      {:ok, val} -> val; _ -> []
    end
  end
  defp parse_json(j) when is_list(j), do: j
  defp parse_json(_), do: []
end
