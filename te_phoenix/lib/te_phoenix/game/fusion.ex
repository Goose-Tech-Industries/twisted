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

  @doc "Create fusion tables and seed default companion soul-bond fusion if missing"
  def ensure_tables do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS game_fusion_types (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      ruleset_id INT UNSIGNED DEFAULT NULL,
      name VARCHAR(128) NOT NULL,
      description TEXT,
      icon VARCHAR(32) DEFAULT NULL,
      method VARCHAR(32) NOT NULL DEFAULT 'ritual',
      allow_npc_fusion TINYINT(1) NOT NULL DEFAULT 1,
      required_affinity INT UNSIGNED DEFAULT 300,
      npc_must_be_companion TINYINT(1) NOT NULL DEFAULT 0,
      npc_willingness_check TINYINT(1) NOT NULL DEFAULT 1,
      stat_combine_mode VARCHAR(32) DEFAULT 'add',
      stat_multiplier DECIMAL(8,2) DEFAULT 1.25,
      duration_type VARCHAR(32) DEFAULT 'timed',
      duration_minutes INT UNSIGNED DEFAULT 30,
      defuse_on_ko TINYINT(1) NOT NULL DEFAULT 1,
      naming_mode VARCHAR(32) DEFAULT 'combined',
      appearance_mode VARCHAR(32) DEFAULT 'blend',
      sort_order INT UNSIGNED DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS character_fusions (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      fusion_type_id INT UNSIGNED NOT NULL,
      character_a_id INT UNSIGNED NOT NULL,
      character_b_id INT UNSIGNED DEFAULT NULL,
      fused_char_id INT UNSIGNED DEFAULT NULL,
      fused_name VARCHAR(128) DEFAULT NULL,
      fused_stats_json LONGTEXT DEFAULT NULL,
      fused_techniques_json LONGTEXT DEFAULT NULL,
      status VARCHAR(32) DEFAULT 'active',
      is_failed_fusion TINYINT(1) NOT NULL DEFAULT 0,
      fused_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME DEFAULT NULL,
      defused_at DATETIME DEFAULT NULL,
      cooldown_until DATETIME DEFAULT NULL
    )
    """)

    Repo.query("""
    INSERT IGNORE INTO game_fusion_types
      (id, name, description, icon, method, allow_npc_fusion, required_affinity, npc_must_be_companion, stat_combine_mode, stat_multiplier, duration_minutes, is_active)
    VALUES
      (1, 'Soul-Bond Companion Fusion', 'Channel ancient Celtic Anam to merge sovereign souls with a trusted S-Rank companion.', '🔮', 'ritual', 1, 300, 0, 'add', 1.25, 30, 1)
    """)
  rescue
    _ -> :ok
  end

  @doc """
  Initiate a Soul-Bond Fusion between a character and an S-Rank companion.
  Companion can be "bram", "lyra", "valerius", or an integer npc_id.
  Requires companion affinity >= 300 or Rank S/A companion support.
  """
  def fuse_with_companion(char_id, companion_ref, opts \\ []) do
    ensure_tables()

    comp_meta = case to_string(companion_ref) |> String.downcase() do
      "bram" ->
        %{
          key: "bram",
          name: "Bram Ironfoot",
          class: "Warden Ranger",
          icon: "🏹",
          hybrid_title: "The Sovereign Warden",
          stats: %{"atk" => 35, "def" => 25, "speed" => 30, "max_hp" => 150, "max_mp" => 40, "mo" => 15, "md" => 20, "luck" => 25},
          hybrid_art: %{name: "Vanguard Crossfire", description: "Volley of spirit-piercing bolts that shatters armor.", icon: "🏹💥"},
          passive_trait: "Camouflage & Ambush Sight"
        }
      "lyra" ->
        %{
          key: "lyra",
          name: "Lyra Shadowsong",
          class: "Astral Weaver",
          icon: "🔮",
          hybrid_title: "The Astral Archon",
          stats: %{"atk" => 20, "def" => 15, "speed" => 25, "max_hp" => 120, "max_mp" => 100, "mo" => 50, "md" => 45, "luck" => 20},
          hybrid_art: %{name: "Radiant Eclipse", description: "Solar flare blended with umbral vortex, blinding and burning the battlefield.", icon: "☀️🌑"},
          passive_trait: "Aetheric Spell Echo"
        }
      "valerius" ->
        %{
          key: "valerius",
          name: "Valerius the Just",
          class: "Inquisitor Paladin",
          icon: "⚔️",
          hybrid_title: "The Inquisitor Avatar",
          stats: %{"atk" => 40, "def" => 45, "speed" => 15, "max_hp" => 200, "max_mp" => 50, "mo" => 25, "md" => 35, "luck" => 15},
          hybrid_art: %{name: "Aegis of the Unbroken", description: "Impenetrable radiant dome reflecting 50% damage back to attackers.", icon: "🛡️⚡"},
          passive_trait: "Divine Bulwark & Fear Immunity"
        }
      other ->
        %{
          key: other,
          name: "Companion #{String.capitalize(other)}",
          class: "Sovereign Ally",
          icon: "🤝",
          hybrid_title: "The Bonded Champion",
          stats: %{"atk" => 25, "def" => 25, "speed" => 25, "max_hp" => 140, "max_mp" => 40, "mo" => 20, "md" => 20, "luck" => 20},
          hybrid_art: %{name: "Unified Resonating Strike", description: "Dual spirit attack dealing unmitigated physical and magical damage.", icon: "💥✨"},
          passive_trait: "Dual Soul Harmony"
        }
    end

    char = load_char(char_id)
    if is_nil(char) do
      {:error, "Character not found."}
    else
      # Verify affinity / bond
      state_data = parse_json(char["state_json"], %{})
      affinities = Map.get(state_data, "companion_affinities", %{})
      saved_bonds = Map.get(state_data, "companion_bonds", %{})
      raw_affinity = Map.get(affinities, comp_meta.key, 300)

      # S-Rank or affinity >= 300
      is_bonded = raw_affinity >= 300 or
        Enum.any?(saved_bonds, fn {_k, v} -> is_map(v) and v["rank"] in ["S", "A"] end)

      if not is_bonded do
        {:error, "Soul-Bond Fusion requires Confidant or Bonded rank (Affinity 300+). Current: #{raw_affinity}."}
      else
        # Check if already fused
        active = active_companion_fusion(char_id)
        if active do
          {:error, "Already fused into #{active["fused_name"] || "hybrid form"}! Defuse first or wait for timer."}
        else
          duration_minutes = Keyword.get(opts, :duration_minutes, 30)
          mult = 1.25

          fused_stats = %{
            "atk" => round(((char["atk"] || 10) + comp_meta.stats["atk"]) * mult),
            "def" => round(((char["def"] || 10) + comp_meta.stats["def"]) * mult),
            "mo" => round(((char["mo"] || 10) + comp_meta.stats["mo"]) * mult),
            "md" => round(((char["md"] || 10) + comp_meta.stats["md"]) * mult),
            "speed" => round(((char["speed"] || 10) + comp_meta.stats["speed"]) * mult),
            "luck" => round(((char["luck"] || 10) + comp_meta.stats["luck"]) * mult),
            "max_hp" => round(((char["max_hp"] || 100) + comp_meta.stats["max_hp"]) * mult),
            "max_mp" => round(((char["max_mp"] || 50) + comp_meta.stats["max_mp"]) * mult)
          }

          fused_name = "#{char["name"]}-#{comp_meta.name}: #{comp_meta.hybrid_title}"

          now = DateTime.utc_now()
          expires_at = DateTime.add(now, duration_minutes * 60, :second)

          # Store in character_fusions
          Repo.query(
            """
            INSERT INTO character_fusions
              (fusion_type_id, character_a_id, fused_name, fused_stats_json, status, fused_at, expires_at)
            VALUES (?, ?, ?, ?, 'active', NOW(), ?)
            """,
            [1, char_id, fused_name, Jason.encode!(fused_stats), DateTime.to_naive(expires_at)]
          )

          fusion_summary = %{
            "char_id" => char_id,
            "companion" => comp_meta.name,
            "companion_key" => comp_meta.key,
            "fused_name" => fused_name,
            "hybrid_title" => comp_meta.hybrid_title,
            "icon" => comp_meta.icon,
            "stats" => fused_stats,
            "hybrid_art" => comp_meta.hybrid_art,
            "passive_trait" => comp_meta.passive_trait,
            "duration_minutes" => duration_minutes,
            "expires_at" => DateTime.to_iso8601(expires_at)
          }

          # Update character state_json with active fusion
          updated_state = Map.put(state_data, "active_fusion", fusion_summary)
          Repo.query("UPDATE characters SET state_json = ? WHERE id = ?", [Jason.encode!(updated_state), char_id])

          # PubSub broadcast
          Phoenix.PubSub.broadcast(TePhoenix.PubSub, "character:#{char_id}", {:companion_fused, fusion_summary})

          {:ok, fusion_summary}
        end
      end
    end
  end

  @doc "Fetch current active companion fusion for a character"
  def active_companion_fusion(char_id) do
    case Repo.query("SELECT state_json FROM characters WHERE id = ?", [char_id]) do
      {:ok, %{rows: [[state_json]]}} when not is_nil(state_json) ->
        case Jason.decode(to_string(state_json)) do
          {:ok, %{"active_fusion" => f}} when is_map(f) -> f
          _ -> nil
        end
      _ -> nil
    end
  rescue
    _ -> nil
  end

  @doc "Defuse an active companion fusion"
  def defuse_companion(char_id) do
    case Repo.query("SELECT state_json FROM characters WHERE id = ?", [char_id]) do
      {:ok, %{rows: [[state_json]]}} when not is_nil(state_json) ->
        case Jason.decode(to_string(state_json)) do
          {:ok, map} ->
            updated_map = Map.delete(map, "active_fusion")
            Repo.query("UPDATE characters SET state_json = ? WHERE id = ?", [Jason.encode!(updated_map), char_id])
            Repo.query("UPDATE character_fusions SET status = 'defused', defused_at = NOW() WHERE character_a_id = ? AND status = 'active'", [char_id])
            Phoenix.PubSub.broadcast(TePhoenix.PubSub, "character:#{char_id}", {:companion_defused, char_id})
            {:ok, "Defused successfully"}
          _ -> {:error, "Invalid state"}
        end
      _ -> {:error, "Character not found"}
    end
  rescue
    e -> {:error, inspect(e)}
  end

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

  defp parse_json(nil, default), do: default
  defp parse_json(map, _default) when is_map(map), do: map
  defp parse_json(bin, default) when is_binary(bin) do
    case Jason.decode(bin) do
      {:ok, val} when is_map(val) -> val
      _ -> default
    end
  end
  defp parse_json(_, default), do: default
end
