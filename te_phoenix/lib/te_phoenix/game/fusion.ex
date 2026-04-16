defmodule TePhoenix.Game.Fusion do
  @moduledoc """
  Fusion system — two characters merge into one.

  Supports Fusion Dance (timed, PL match), Potara (item, timed),
  Namekian Fusion (permanent), Absorption (villain), and any
  admin-defined fusion type.

  Fused character gets combined stats, merged techniques, new
  appearance. Defuses on timer, KO, or manual action.
  """

  alias TePhoenix.Repo
  require Logger

  @doc "Get available fusion types for a character."
  def available_types(_char_id, opts \\ []) do
    ruleset_id = Keyword.get(opts, :ruleset_id)
    race = Keyword.get(opts, :race)

    case Repo.query(
      "SELECT * FROM game_fusion_types WHERE is_active=1 AND (ruleset_id=? OR ruleset_id IS NULL) ORDER BY sort_order",
      [ruleset_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
        |> Enum.filter(fn ft ->
          (is_nil(ft["required_race_a"]) or String.downcase(ft["required_race_a"] || "") == String.downcase(race || "")) and
          (is_nil(ft["min_level"]) or ft["min_level"] == 0)
        end)
      _ -> []
    end
  end

  @doc """
  Initiate fusion between two characters, or a character and an NPC.
  For NPC fusion, pass npc_id in opts — requires high affinity/trust.
  Returns {:ok, fusion_data} | {:failed, data} | {:error, reason}
  """
  def fuse(char_a_id, char_b_id, fusion_type_id, opts \\ []) do
    npc_id = Keyword.get(opts, :npc_id)

    # Load fusion type
    ft = case Repo.query("SELECT * FROM game_fusion_types WHERE id=? AND is_active=1", [fusion_type_id]) do
      {:ok, %{rows: [row], columns: cols}} -> Enum.zip(cols, row) |> Map.new()
      _ -> nil
    end
    if is_nil(ft), do: {:error, "Fusion type not found."}

    # ── NPC Fusion path ──
    if npc_id do
      if ft["allow_npc_fusion"] != 1, do: {:error, "This fusion type doesn't support NPC fusion."}

      # Check affinity/trust
      required_affinity = ft["required_affinity"] || 300

      case Repo.query(
        "SELECT affinity FROM character_companions WHERE character_id=? AND npc_id=?",
        [char_a_id, npc_id]
      ) do
        {:ok, %{rows: [[affinity]]}} when affinity >= required_affinity ->
          # Check companion status
          if ft["npc_must_be_companion"] == 1 do
            case Repo.query("SELECT is_active FROM character_companions WHERE character_id=? AND npc_id=? AND is_active=1",
              [char_a_id, npc_id]) do
              {:ok, %{rows: [_]}} -> :ok
              _ -> {:error, "This NPC must be your active companion to fuse."}
            end
          end

          # Check NPC willingness (personality-based)
          if ft["npc_willingness_check"] == 1 do
            npc_willing = check_npc_willingness(npc_id, char_a_id, affinity)
            if !npc_willing do
              {:error, npc_refusal_message(npc_id)}
            end
          end

          # NPC passes checks — create a synthetic "char_b" from NPC stats
          npc_as_char = load_npc_as_char(npc_id)
          if is_nil(npc_as_char), do: {:error, "NPC not found."}

          # Proceed with fusion using NPC stats
          do_fuse(char_a_id, nil, ft, npc_as_char, npc_id: npc_id)

        {:ok, %{rows: [[affinity]]}} ->
          tier_name = affinity_tier_name(affinity)
          needed_name = affinity_tier_name(required_affinity)
          {:error, "Your bond with this NPC isn't strong enough. Current: #{tier_name} (#{affinity}). Needed: #{needed_name} (#{required_affinity}). Keep training together and building trust."}

        _ ->
          {:error, "No companion relationship with this NPC. Recruit them first."}
      end
    else
      # ── Player-to-Player fusion ──
      char_a = load_char(char_a_id)
      char_b = load_char(char_b_id)
      if is_nil(char_a) or is_nil(char_b), do: {:error, "Character not found."}

      do_fuse(char_a_id, char_b_id, ft, nil, [])
    end
  end

  defp do_fuse(char_a_id, char_b_id, ft, npc_char_override, opts) do
    npc_id = Keyword.get(opts, :npc_id)

    # Load both characters
    char_a = load_char(char_a_id)
    char_b = if npc_char_override, do: npc_char_override, else: load_char(char_b_id)
    if is_nil(char_a) or is_nil(char_b), do: {:error, "Character not found."}

    # Check cooldown
    case Repo.query(
      "SELECT cooldown_until FROM character_fusions WHERE (character_a_id=? OR character_b_id=? OR character_a_id=? OR character_b_id=?) AND cooldown_until > NOW() AND status='defused' ORDER BY cooldown_until DESC LIMIT 1",
      [char_a_id, char_a_id, char_b_id, char_b_id]
    ) do
      {:ok, %{rows: [[cooldown]]}} when not is_nil(cooldown) ->
        {:error, "Fusion on cooldown. Try again later."}
      _ -> :ok
    end

    # Check PL match if required
    if ft["pl_match_required"] == 1 do
      tolerance = (ft["pl_match_tolerance"] || 10) / 100
      pl_a = char_a["atk"] || 0
      pl_b = char_b["atk"] || 0
      diff = abs(pl_a - pl_b) / max(1, max(pl_a, pl_b))
      if diff > tolerance do
        {:error, "Power levels too different! (#{round(diff * 100)}% apart, need within #{round(tolerance * 100)}%)"}
      end
    end

    # Check item requirement
    if ft["required_item_id"] do
      case Repo.query("SELECT quantity FROM character_items WHERE character_id=? AND item_id=? AND quantity > 0",
        [char_a_id, ft["required_item_id"]]) do
        {:ok, %{rows: [[_q]]}} ->
          if ft["item_consumed"] == 1 do
            Repo.query!("UPDATE character_items SET quantity=quantity-1 WHERE character_id=? AND item_id=?",
              [char_a_id, ft["required_item_id"]])
          end
        _ -> {:error, "Required item not found in inventory."}
      end
    end

    # Roll for failure (Fusion Dance)
    is_failed = if ft["can_fail"] == 1 do
      roll = :rand.uniform(10000) / 100.0
      roll <= (ft["fail_chance_pct"] || 5.0)
    else
      false
    end

    # Calculate combined stats
    stats = combine_stats(char_a, char_b, ft, is_failed)

    # Merge techniques
    techniques = merge_techniques(char_a_id, char_b_id, ft)

    # Generate name
    fused_name = case ft["naming_mode"] do
      "combined" -> combine_names(char_a["name"] || "A", char_b["name"] || "B")
      "dominant" -> char_a["name"]
      _ -> "#{char_a["name"]}-#{char_b["name"]}"
    end

    # Calculate expiry
    expires_at = case ft["duration_type"] do
      "timed" ->
        minutes = if is_failed, do: ft["fail_duration_minutes"] || 30, else: ft["duration_minutes"] || 30
        NaiveDateTime.add(NaiveDateTime.utc_now(), minutes * 60)
      _ -> nil
    end

    cooldown_minutes = ft["cooldown_minutes"] || 60
    cooldown_until = NaiveDateTime.add(NaiveDateTime.utc_now(), (if(is_failed, do: ft["fail_duration_minutes"] || 30, else: ft["duration_minutes"] || 30) + cooldown_minutes) * 60)

    # Create fusion record
    try do
      {:ok, result} = Repo.query(
        "INSERT INTO character_fusions (fusion_type_id, character_a_id, character_b_id, fused_name, fused_stats_json, fused_techniques_json, status, is_failed_fusion, expires_at, cooldown_until) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [ft["id"], char_a_id, char_b_id, fused_name,
         Jason.encode!(stats), Jason.encode!(techniques),
         "active", if(is_failed, do: 1, else: 0),
         expires_at, cooldown_until])

      if is_failed do
        {:failed, %{
          fusion_id: result.last_insert_id,
          name: fused_name <> " (Failed)",
          stats: stats,
          message: "The fusion went wrong! A weaker, malformed version emerged...",
          expires_at: expires_at
        }}
      else
        # For permanent fusion, mark source as merged
        if ft["duration_type"] == "permanent" do
          if npc_id do
            # NPC absorbed — mark as inactive and record the fusion
            Repo.query!("UPDATE game_npcs SET is_active=0 WHERE id=?", [npc_id])
            Repo.query("UPDATE character_companions SET is_active=0 WHERE character_id=? AND npc_id=?", [char_a_id, npc_id])
          else
            # Player absorbed — deactivate character
            if char_b_id, do: Repo.query!("UPDATE characters SET is_active=0 WHERE id=?", [char_b_id])
          end
        end

        {:ok, %{
          fusion_id: result.last_insert_id,
          name: fused_name,
          stats: stats,
          techniques: techniques,
          duration_type: ft["duration_type"],
          expires_at: expires_at,
          visuals: %{
            aura_color: ft["aura_color"],
            sprite_override: ft["sprite_override"],
            appearance_mode: ft["appearance_mode"]
          },
          message: "#{char_a["name"]} and #{char_b["name"]} have fused into #{fused_name}!"
        }}
      end
    rescue
      e -> {:error, Exception.message(e)}
    end
  end

  @doc "Defuse an active fusion."
  def defuse(fusion_id, reason \\ "manual") do
    case Repo.query("SELECT * FROM character_fusions WHERE id=? AND status='active'", [fusion_id]) do
      {:ok, %{rows: [row], columns: cols}} ->
        fusion = Enum.zip(cols, row) |> Map.new()

        Repo.query!("UPDATE character_fusions SET status='defused', defused_at=NOW() WHERE id=?", [fusion_id])

        # Restore character B if not permanent
        ft = case Repo.query("SELECT duration_type FROM game_fusion_types WHERE id=?", [fusion["fusion_type_id"]]) do
          {:ok, %{rows: [[dt]]}} -> dt; _ -> "timed"
        end
        if ft != "permanent" do
          # Both characters return with their original stats (fusion doesn't drain them)
          :ok
        end

        {:ok, %{
          char_a_id: fusion["character_a_id"],
          char_b_id: fusion["character_b_id"],
          name: fusion["fused_name"],
          reason: reason,
          message: "#{fusion["fused_name"]} has defused! #{reason}"
        }}

      _ -> {:error, "No active fusion found."}
    end
  end

  @doc "Check if any fusions have expired. Called by scheduler."
  def check_expired do
    case Repo.query("SELECT id, fused_name FROM character_fusions WHERE status='active' AND expires_at IS NOT NULL AND expires_at <= NOW()") do
      {:ok, %{rows: rows}} ->
        Enum.each(rows, fn [id, name] ->
          defuse(id, "Time limit reached")
          Logger.info("[Fusion] #{name} expired (id: #{id})")
        end)
        length(rows)
      _ -> 0
    end
  end

  @doc "Get active fusion for a character (if any)."
  def get_active(char_id) do
    case Repo.query(
      "SELECT cf.*, ft.name AS type_name, ft.duration_type, ft.manual_defuse FROM character_fusions cf JOIN game_fusion_types ft ON ft.id=cf.fusion_type_id WHERE (cf.character_a_id=? OR cf.character_b_id=?) AND cf.status='active' LIMIT 1",
      [char_id, char_id]
    ) do
      {:ok, %{rows: [row], columns: cols}} -> Enum.zip(cols, row) |> Map.new()
      _ -> nil
    end
  end

  # ── Stat Combination ─────────────────────────────────────────

  defp combine_stats(char_a, char_b, fusion_type, is_failed) do
    stat_keys = ~w(atk def mo md speed luck max_hp max_mp)
    mode = fusion_type["stat_combine_mode"] || "add"
    multiplier = if is_failed do
      fusion_type["fail_stat_penalty"] || 0.1
    else
      to_float(fusion_type["stat_multiplier"])
    end

    Enum.into(stat_keys, %{}, fn stat ->
      a = (char_a[stat] || 0)
      b = (char_b[stat] || 0)

      base = case mode do
        "add" -> a + b
        "average" -> div(a + b, 2)
        "dominant" -> max(a, b)
        "multiply" -> round(:math.sqrt(a * b))
        _ -> a + b
      end

      {stat, round(base * multiplier)}
    end)
  end

  defp merge_techniques(char_a_id, char_b_id, fusion_type) do
    mode = fusion_type["technique_merge"] || "union"

    techs_a = case Repo.query("SELECT technique_id FROM character_techniques WHERE character_id=?", [char_a_id]) do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [id] -> id end); _ -> []
    end
    techs_b = case Repo.query("SELECT technique_id FROM character_techniques WHERE character_id=?", [char_b_id]) do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [id] -> id end); _ -> []
    end

    case mode do
      "union" -> Enum.uniq(techs_a ++ techs_b)
      "intersection" -> techs_a -- (techs_a -- techs_b)
      "dominant" -> techs_a
      _ -> Enum.uniq(techs_a ++ techs_b)
    end
  end

  defp combine_names(name_a, name_b) do
    # Take first half of A and second half of B (Vegeta + Kakarot = Vegito)
    mid_a = div(String.length(name_a), 2)
    mid_b = div(String.length(name_b), 2)
    first = String.slice(name_a, 0, mid_a + 1)
    second = String.slice(name_b, mid_b, String.length(name_b))
    String.capitalize(first <> String.downcase(second))
  end

  defp load_char(char_id) do
    case Repo.query("SELECT * FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [row], columns: cols}} -> Enum.zip(cols, row) |> Map.new()
      _ -> nil
    end
  end

  defp load_npc_as_char(npc_id) do
    # Convert NPC stats to a character-like map for fusion calculation
    case Repo.query("SELECT * FROM game_npcs WHERE id=?", [npc_id]) do
      {:ok, %{rows: [row], columns: cols}} ->
        npc = Enum.zip(cols, row) |> Map.new()
        %{
          "name" => npc["name"],
          "atk" => npc["base_atk"] || 10,
          "def" => npc["base_def"] || 5,
          "mo" => npc["base_mo"] || 5,
          "md" => npc["base_md"] || 5,
          "speed" => npc["base_speed"] || 10,
          "luck" => npc["base_luck"] || 5,
          "max_hp" => npc["base_hp"] || 100,
          "max_mp" => npc["base_mp"] || 20,
          "level" => npc["npc_level"] || 1,
          "_is_npc" => true,
          "_npc_id" => npc_id
        }
      _ -> nil
    end
  end

  defp check_npc_willingness(_npc_id, char_id, affinity) do
    # NPC willingness based on personality + affinity + situation
    # At Bonded (500+) = always willing
    # At Confidant (300-499) = willing if not evil alignment
    if affinity >= 500 do
      true
    else
      # Check player alignment — evil characters have harder time convincing NPCs
      case Repo.query("SELECT alignment FROM characters WHERE id=?", [char_id]) do
        {:ok, %{rows: [[alignment]]}} -> (alignment || 0) >= -50
        _ -> true
      end
    end
  end

  defp npc_refusal_message(npc_id) do
    case Repo.query("SELECT name FROM game_npcs WHERE id=?", [npc_id]) do
      {:ok, %{rows: [[name]]}} ->
        "#{name} senses darkness in your heart and refuses to merge. \"I cannot become one with someone whose intentions I don't trust.\""
      _ ->
        "The NPC refuses to fuse with you. Build more trust first."
    end
  end

  # Affinity tier thresholds (matches companion system)
  @affinity_tiers [
    {500, "Bonded"},
    {300, "Confidant"},
    {150, "Friend"},
    {75, "Ally"},
    {25, "Acquaintance"},
    {0, "Stranger"}
  ]

  defp affinity_tier_name(affinity) do
    Enum.find_value(@affinity_tiers, "Stranger", fn {threshold, name} ->
      if affinity >= threshold, do: name
    end)
  end

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
end
