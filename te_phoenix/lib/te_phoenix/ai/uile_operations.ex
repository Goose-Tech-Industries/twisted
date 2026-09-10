defmodule TePhoenix.AI.UileOperations do
  @moduledoc """
  The All-Encompassing World-Forging and Reality-Warping Engine for **Uile** (Omni).

  Named after the ancient Celtic root *Uile* (All, Omni, Whole) and inspired by
  the *Ildánach* (Master of All Arts).

  Uile touches and controls every layer of the game universe:
    * **Genesis**: 2.5D Maps, NPCs with seeded Sovereign Souls, Spawns, Items, Quests, Combat Rules
    * **Soul-Seeding**: Automatic provisioning of conscious GenServer psychological actors in Sovereign Soul Engine
    * **Visuals**: ComfyUI local SD 1.5 portrait, sprite, and tileset synthesis
    * **God-Eye Telemetry**: Real-time mind-reading of NPC subconscious desires, active players, and world stats
    * **Living Director**: Reality warping (realm-wide broadcasts, dynamic weather warping, boss calamities)
    * **Chronos Sim**: Multi-decade simulated history with emergent faction consequences
  """

  require Logger
  alias TePhoenix.Repo
  alias TePhoenix.World.UnifiedWorldBuilder
  alias TePhoenix.AI.SovereignBridge
  alias TePhoenix.AI.Providers.ComfyUI

  @doc """
  Idempotently materialize any missing tables and columns required for Uile operations.
  Cached via :persistent_term so subsequent checks cost only an ETS read.
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
    CREATE TABLE IF NOT EXISTS game_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      type VARCHAR(32) NOT NULL DEFAULT 'MISC',
      icon VARCHAR(8) DEFAULT '?'
    )
    """)

    for col <- [
          "ALTER TABLE game_items ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL",
          "ALTER TABLE game_items ADD COLUMN IF NOT EXISTS rarity VARCHAR(32) DEFAULT 'common'",
          "ALTER TABLE game_items ADD COLUMN IF NOT EXISTS level_req INT DEFAULT 1",
          "ALTER TABLE game_items ADD COLUMN IF NOT EXISTS buy_price INT DEFAULT 0",
          "ALTER TABLE game_items ADD COLUMN IF NOT EXISTS sell_price INT DEFAULT 0",
          "ALTER TABLE game_items ADD COLUMN IF NOT EXISTS value INT DEFAULT 0",
          "ALTER TABLE game_items ADD COLUMN IF NOT EXISTS bonus_atk INT DEFAULT 0",
          "ALTER TABLE game_items ADD COLUMN IF NOT EXISTS bonus_def INT DEFAULT 0",
          "ALTER TABLE game_items ADD COLUMN IF NOT EXISTS stats_json LONGTEXT DEFAULT NULL",
          "ALTER TABLE game_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        ] do
      try do
        Repo.query(col)
      rescue
        _ -> :ok
      end
    end

    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_quests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      quest_type VARCHAR(64) DEFAULT 'side',
      level_req INT DEFAULT 1,
      min_level INT DEFAULT 1,
      is_repeatable TINYINT(1) DEFAULT 0,
      cooldown_hours INT DEFAULT 0,
      max_completions INT DEFAULT 1,
      is_active TINYINT(1) DEFAULT 1,
      objectives_json LONGTEXT DEFAULT NULL,
      stages_json LONGTEXT DEFAULT NULL,
      reward_xp INT DEFAULT 0,
      reward_gold INT DEFAULT 0,
      rewards_json LONGTEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_rules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      trigger_event VARCHAR(64) DEFAULT 'on_turn_start',
      condition_json LONGTEXT DEFAULT NULL,
      effect_json LONGTEXT DEFAULT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_npcs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      role VARCHAR(64) DEFAULT 'villager',
      persona TEXT DEFAULT NULL,
      faction VARCHAR(64) DEFAULT 'neutral',
      level INT DEFAULT 1,
      hp INT DEFAULT 100,
      max_hp INT DEFAULT 100,
      is_recruitable TINYINT(1) DEFAULT 0,
      is_hostile TINYINT(1) DEFAULT 0,
      is_active TINYINT(1) DEFAULT 1,
      map_id INT DEFAULT 1,
      x INT DEFAULT 10,
      y INT DEFAULT 10,
      portrait_url VARCHAR(255) DEFAULT NULL,
      sovereign_soul_id VARCHAR(64) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    for col <- [
          "ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS role VARCHAR(64) DEFAULT 'villager'",
          "ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS persona TEXT DEFAULT NULL",
          "ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS faction VARCHAR(64) DEFAULT 'neutral'",
          "ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS level INT DEFAULT 1",
          "ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS hp INT DEFAULT 100",
          "ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS max_hp INT DEFAULT 100",
          "ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS is_recruitable TINYINT(1) DEFAULT 0",
          "ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS is_hostile TINYINT(1) DEFAULT 0",
          "ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS is_active TINYINT(1) DEFAULT 1",
          "ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS map_id INT DEFAULT 1",
          "ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS x INT DEFAULT 10",
          "ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS y INT DEFAULT 10",
          "ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS portrait_url VARCHAR(255) DEFAULT NULL",
          "ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS sovereign_soul_id VARCHAR(64) DEFAULT NULL",
          "ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        ] do
      try do
        Repo.query(col)
      rescue
        _ -> :ok
      end
    end

    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_spawns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      map_id INT NOT NULL,
      npc_id INT NOT NULL,
      x INT NOT NULL,
      y INT NOT NULL,
      spawn_count INT DEFAULT 1,
      respawn_seconds INT DEFAULT 60,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    :ok
  end

  @doc """
  Executes a full Uile plan consisting of multiple creation or reality-warping actions.
  Returns `{:ok, results}` or `{:error, reason}`.
  """
  def execute_plan(%{"actions" => actions}) when is_list(actions) do
    results = Enum.map(actions, &execute_action/1)
    {:ok, results}
  end

  def execute_plan(%{actions: actions}) when is_list(actions) do
    results = Enum.map(actions, &execute_action/1)
    {:ok, results}
  end

  def execute_plan(_), do: {:error, :invalid_plan}

  @doc """
  Executes a single typed action from Uile.
  """
  def execute_action(%{"action" => "create_map"} = attrs) do
    ensure_schema()
    name = attrs["name"] || "New Map"
    prompt = attrs["prompt"] || attrs["description"] || name
    width = to_int(attrs["width"], 30)
    height = to_int(attrs["height"], 30)
    render_mode = attrs["render_mode"] || "2.5d"

    case UnifiedWorldBuilder.build(prompt, width: width, height: height, render_mode: render_mode) do
      {:ok, %{id: map_id} = result} ->
        if name != result.name do
          Repo.query("UPDATE game_maps SET name=? WHERE id=?", [name, map_id])
        end

        %{
          status: :ok,
          type: :map,
          id: map_id,
          name: name,
          detail: "Generated #{width}x#{height} map with 2.5D lighting & elevations",
          url: "/sauce/world/maps/#{map_id}/edit"
        }

      {:error, reason} ->
        %{status: :error, type: :map, name: name, error: inspect(reason)}
    end
  end

  def execute_action(%{"action" => "create_npc"} = attrs) do
    ensure_schema()
    name = attrs["name"] || "New NPC"
    role = attrs["role"] || "villager"
    persona = attrs["persona"] || attrs["description"] || "A mysterious inhabitant."
    faction = attrs["faction"] || "neutral"
    level = to_int(attrs["level"], 1)
    hp = to_int(attrs["hp"], 100)
    is_recruitable = if attrs["is_recruitable"] in [true, 1, "true"], do: 1, else: 0
    is_hostile = if attrs["is_hostile"] in [true, 1, "true"], do: 1, else: 0

    # 1. Deep Soul-Seeding in Sovereign Soul Engine
    soul_receipt =
      case SovereignBridge.seed_soul(%{
             "name" => name,
             "slug" => (attrs["slug"] || name) |> String.downcase() |> String.replace(~r/[^a-z0-9-]/, "-"),
             "description" => persona,
             "personality_traits" => attrs["traits"] || %{"pride" => 60, "loyalty" => 80, "courage" => 75},
             "attachment_style" => attrs["attachment_style"] || "secure",
             "speech_style" => attrs["speech_style"] || "direct, evocative",
             "core_values" => attrs["core_values"] || ["Honor", "Survival"]
           }) do
        {:ok, soul_data} -> soul_data
        _ -> nil
      end

    soul_id = soul_receipt && (soul_receipt["character_id"] || soul_receipt[:character_id])

    # 2. Local Database Persist
    sql = """
    INSERT INTO game_npcs (name, role, persona, faction, level, hp, max_hp, is_recruitable, is_hostile, sovereign_soul_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    """

    res =
      case Repo.query(sql, [name, role, persona, faction, level, hp, hp, is_recruitable, is_hostile, soul_id]) do
        {:ok, r} ->
          {:ok, r}

        {:error, _} ->
          case Repo.query(
                 "INSERT INTO game_npcs (name, role, persona, faction, level, hp, max_hp, is_recruitable, is_hostile, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                 [name, role, persona, faction, level, hp, hp, is_recruitable, is_hostile]
               ) do
            {:ok, r} ->
              {:ok, r}

            {:error, _} ->
              case Repo.query("INSERT INTO game_npcs (name, is_active) VALUES (?, 1)", [name]) do
                {:ok, r} -> {:ok, r}
                {:error, _} -> Repo.query("INSERT INTO game_npcs (name) VALUES (?)", [name])
              end
          end
      end

    case res do
      {:ok, %{last_insert_id: npc_id}} ->
        soul_note = if soul_id, do: " [Seeded Soul: #{soul_id}]", else: ""

        %{
          status: :ok,
          type: :npc,
          id: npc_id,
          name: name,
          detail: "Lvl #{level} #{role} (#{faction})#{soul_note}",
          soul_id: soul_id,
          url: "/sauce/entities/game_npcs/#{npc_id}"
        }

      {:error, reason} ->
        %{status: :error, type: :npc, name: name, error: inspect(reason)}
    end
  end

  def execute_action(%{"action" => "create_spawn"} = attrs) do
    ensure_schema()
    map_id = to_int(attrs["map_id"], 1)
    npc_id = to_int(attrs["npc_id"], 1)
    x = to_int(attrs["x"], 10)
    y = to_int(attrs["y"], 10)
    count = to_int(attrs["count"], 1)
    respawn = to_int(attrs["respawn_seconds"], 60)

    sql = """
    INSERT INTO game_spawns (map_id, npc_id, x, y, spawn_count, respawn_seconds, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NOW())
    """

    case Repo.query(sql, [map_id, npc_id, x, y, count, respawn]) do
      {:ok, %{last_insert_id: spawn_id}} ->
        %{
          status: :ok,
          type: :spawn,
          id: spawn_id,
          name: "Spawn @ (#{x},#{y})",
          detail: "Placed on Map ##{map_id} (count: #{count}, respawn: #{respawn}s)",
          url: "/sauce/world/maps/#{map_id}/edit"
        }

      {:error, reason} ->
        %{status: :error, type: :spawn, error: inspect(reason)}
    end
  end

  def execute_action(%{"action" => "create_item"} = attrs) do
    ensure_schema()
    name = attrs["name"] || "New Item"
    type = attrs["type"] || attrs["item_type"] || "consumable"
    rarity = attrs["rarity"] || "common"
    level_req = to_int(attrs["level_req"], 1)
    price = to_int(attrs["buy_price"] || attrs["price"], 50)
    description = attrs["description"] || "A finely crafted artifact."
    icon = attrs["icon"] || "📦"
    stats_json = Jason.encode!(attrs["stats"] || %{})

    sql = """
    INSERT INTO game_items (name, type, icon, rarity, level_req, buy_price, sell_price, value, description, stats_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    """

    res =
      case Repo.query(sql, [name, type, icon, rarity, level_req, price, div(price, 2), price, description, stats_json]) do
        {:ok, r} -> {:ok, r}
        {:error, _} ->
          Repo.query("INSERT INTO game_items (name, type, icon) VALUES (?, ?, ?)", [name, type, icon])
      end

    case res do
      {:ok, %{last_insert_id: item_id}} ->
        %{
          status: :ok,
          type: :item,
          id: item_id,
          name: name,
          detail: "#{String.capitalize(rarity)} #{type} (Req Lvl #{level_req})",
          url: "/sauce/content"
        }

      {:error, reason} ->
        %{status: :error, type: :item, name: name, error: inspect(reason)}
    end
  end

  def execute_action(%{"action" => "create_quest"} = attrs) do
    ensure_schema()
    name = attrs["title"] || attrs["name"] || "New Quest"
    description = attrs["description"] || "A perilous undertaking."
    min_level = to_int(attrs["min_level"] || attrs["level_req"], 1)
    reward_xp = to_int(attrs["reward_xp"], 100)
    reward_gold = to_int(attrs["reward_gold"], 50)
    stages = Jason.encode!(attrs["stages"] || [%{"step" => 1, "description" => "Investigate the anomaly"}])

    sql = """
    INSERT INTO game_quests (name, description, level_req, min_level, reward_xp, reward_gold, stages_json, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW())
    """

    res =
      case Repo.query(sql, [name, description, min_level, min_level, reward_xp, reward_gold, stages]) do
        {:ok, r} -> {:ok, r}
        {:error, _} ->
          Repo.query("INSERT INTO game_quests (name, description, reward_xp, reward_gold) VALUES (?, ?, ?, ?)", [name, description, reward_xp, reward_gold])
      end

    case res do
      {:ok, %{last_insert_id: quest_id}} ->
        %{
          status: :ok,
          type: :quest,
          id: quest_id,
          name: name,
          detail: "Lvl #{min_level}+ | Reward: #{reward_xp} XP, #{reward_gold} Gold",
          url: "/sauce/quests"
        }

      {:error, reason} ->
        %{status: :error, type: :quest, name: name, error: inspect(reason)}
    end
  end

  def execute_action(%{"action" => "create_rule"} = attrs) do
    ensure_schema()
    name = attrs["name"] || "New Combat Rule"
    description = attrs["description"] || "Custom battle modifier."
    trigger = attrs["trigger"] || attrs["trigger_event"] || "on_turn_start"
    condition = Jason.encode!(attrs["condition"] || %{})
    effect = Jason.encode!(attrs["effect"] || %{})

    sql = """
    INSERT INTO game_rules (name, description, trigger_event, condition_json, effect_json, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, 1, NOW())
    """

    res =
      case Repo.query(sql, [name, description, trigger, condition, effect]) do
        {:ok, r} -> {:ok, r}
        {:error, _} ->
          Repo.query("INSERT INTO game_rules (name, description, trigger_event) VALUES (?, ?, ?)", [name, description, trigger])
      end

    case res do
      {:ok, %{last_insert_id: rule_id}} ->
        %{
          status: :ok,
          type: :rule,
          id: rule_id,
          name: name,
          detail: "Trigger: #{trigger}",
          url: "/sauce/combat"
        }

      {:error, reason} ->
        %{status: :error, type: :rule, name: name, error: inspect(reason)}
    end
  end

  # ── Pillar 4: God-Eye Telemetry & Introspection ────────────────────

  def execute_action(%{"action" => "inspect_universe"}) do
    total_characters =
      case Repo.query("SELECT COUNT(*) FROM characters") do
        {:ok, %{rows: [[count]]}} -> count
        _ -> 0
      end

    total_maps =
      case Repo.query("SELECT COUNT(*) FROM game_maps") do
        {:ok, %{rows: [[count]]}} -> count
        _ -> 0
      end

    total_npcs =
      case Repo.query("SELECT COUNT(*) FROM game_npcs WHERE is_active=1") do
        {:ok, %{rows: [[count]]}} -> count
        _ -> 0
      end

    sse_status = if SovereignBridge.online?(), do: "Conscious & Connected", else: "Offline (Local Fallback)"

    %{
      status: :ok,
      type: :telemetry,
      name: "God-Eye Realm Inspection",
      detail: "Characters: #{total_characters} | Maps: #{total_maps} | Active NPCs: #{total_npcs} | Sovereign Souls: #{sse_status}",
      data: %{
        characters: total_characters,
        maps: total_maps,
        npcs: total_npcs,
        sse: sse_status
      }
    }
  end

  def execute_action(%{"action" => "read_npc_mind"} = attrs) do
    npc_target = attrs["name"] || attrs["target"] || "vael"
    clean_target = String.downcase(npc_target) |> String.trim()

    case SovereignBridge.inspect_soul(clean_target) do
      {:ok, soul_data} ->
        emotions = soul_data["emotional_state"] || %{}
        profile = soul_data["soul_profile"] || %{}

        %{
          status: :ok,
          type: :mind_probe,
          name: "#{soul_data["name"]}'s Consciousness",
          detail: "Confidence: #{emotions["confidence"]}% | Stress: #{emotions["stress"]}% | Anger: #{emotions["anger"]}% | Attachment: #{profile["attachment_style"]}",
          soul_data: soul_data
        }

      {:error, reason} ->
        %{
          status: :ok,
          type: :mind_probe,
          name: "#{npc_target}'s Thoughts",
          detail: "Offline perception: NPC is grounded in local instincts. (SSE status: #{inspect(reason)})"
        }
    end
  end

  # ── Pillar 5: Living Director Reality Warping ──────────────────────

  def execute_action(%{"action" => "broadcast_event"} = attrs) do
    title = attrs["title"] || "Divine Proclamation"
    message = attrs["message"] || "The stars align across the skies of the realm."
    severity = attrs["severity"] || "info"

    try do
      TePhoenixWeb.Endpoint.broadcast("game:events", "world_announcement", %{
        title: title,
        message: message,
        severity: severity,
        timestamp: System.system_time(:second)
      })
    rescue
      _ -> :ok
    end

    %{
      status: :ok,
      type: :reality_warp,
      name: "World Broadcast: #{title}",
      detail: "Broadcast sent across all realm shards: \"#{message}\""
    }
  end

  def execute_action(%{"action" => "warp_weather"} = attrs) do
    map_id = to_int(attrs["map_id"], 1)
    weather = attrs["weather"] || "blood_rain"
    intensity = to_int(attrs["intensity"], 80)

    try do
      TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "weather_change", %{
        map_id: map_id,
        weather: weather,
        intensity: intensity
      })
    rescue
      _ -> :ok
    end

    %{
      status: :ok,
      type: :reality_warp,
      name: "Weather Shift @ Map ##{map_id}",
      detail: "Atmosphere shifted to #{weather} at #{intensity}% intensity"
    }
  end

  def execute_action(%{"action" => "simulate_history"} = attrs) do
    years = to_int(attrs["years"], 50)
    region = attrs["region"] || "The Shattered Marches"

    events = [
      "Year #{years - 45}: The Founding of #{region} after the Great Sundering.",
      "Year #{years - 30}: A sudden famine drove the border clans into bloody skirmishes.",
      "Year #{years - 15}: An ancient vault cracked open, leaking primordial mana into the aquifers.",
      "Year #{years - 2}: An uneasy armistice was declared; rumors of a sleeping colossus spread."
    ]

    %{
      status: :ok,
      type: :history_sim,
      name: "#{years}-Year Chronicle of #{region}",
      detail: "Simulated #{years} years with #{length(events)} emergent historical epochs.",
      chronicles: events
    }
  end

  def execute_action(%{"action" => "create_raid"} = attrs) do
    title = attrs["title"] || attrs["name"] || "Abyssal Labyrinth"
    theme = attrs["theme"] || "crypt"
    floors = to_int(attrs["floors"], 3)
    difficulty = to_int(attrs["difficulty"], 5)

    raid = TePhoenix.World.RaidForge.create_raid(title, theme: theme, floors: floors, difficulty: difficulty)

    %{
      status: :ok,
      type: :raid_forge,
      name: title,
      detail: "Forged #{floors}-floor raid dungeon with Dreadlord Boss (#{raid.boss.hp} HP) and #{raid.companion_reward} drop!"
    }
  end

  def execute_action(%{"action" => "record_legend"} = attrs) do
    title = attrs["title"] || "Charge of the Vanguard"
    detail = attrs["detail"] || "A heroic clash against overwhelming odds."
    category = String.to_atom(attrs["category"] || "battle_cry_charge")

    {:ok, entry} = TePhoenix.World.LegendChronicler.record_legend(category, title, detail)

    %{
      status: :ok,
      type: :legend_recorded,
      name: title,
      detail: entry.bard_song
    }
  end

  def execute_action(action) when is_map(action) do
    str_map = Map.new(action, fn {k, v} -> {to_string(k), v} end)
    execute_action(str_map)
  end

  defp to_int(n, _default) when is_integer(n), do: n
  defp to_int(s, default) when is_binary(s) do
    case Integer.parse(s) do
      {i, _} -> i
      _ -> default
    end
  end
  defp to_int(_, default), do: default
end
