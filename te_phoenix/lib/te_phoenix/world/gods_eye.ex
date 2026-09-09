defmodule TePhoenix.World.GodsEye do
  @moduledoc """
  The God's Eye Surveillance Grid & Omnipresence Engine (*An tSúil Uile*).

  Inspired by:
    * Ramsey's God's Eye (Fast & Furious 7) — real-time universal tracking.
    * Lucius Fox's Sonar Matrix (The Dark Knight) — acoustic 3D mapping & wiretapping.
    * "The Stick" (Now You See Me 2) — total system backdoor and unhindered perception.

  Features:
    * Live Sonar Radar across all maps for every player, NPC, companion, and boss.
    * Conscious Soul Wiretap: Eavesdrop on NPC inner monologues & live emotions via Sovereign Soul Engine.
    * Predictive Threat Scanner: Identifies low HP players, impending wipes, and rage spikes.
    * Orbital Intervention: Point-and-click airstrikes, celestial supply drops, and divine whispers.
  """

  alias TePhoenix.Repo
  alias TePhoenix.Game.PlayerRegistry
  alias TePhoenix.AI.SovereignBridge
  require Logger

  @doc """
  Performs a full sweep of the entire game realm across all active maps and shards.
  """
  def scan_realm do
    # 1. Fetch live players (PlayerRegistry or DB characters)
    online_players =
      try do
        PlayerRegistry.all()
      rescue
        _ -> []
      end

    players =
      if online_players != [] do
        Enum.map(online_players, fn p ->
          %{
            id: p.char_id,
            name: p.name,
            map_id: p.map_id || 1,
            x: p.x || 10,
            y: p.y || 10,
            level: p.level || 1,
            role: "player",
            type: :player,
            hp: 100,
            max_hp: 100
          }
        end)
      else
        # Database fallback if no sockets active
        case Repo.query("SELECT id, user_id, level FROM characters LIMIT 10") do
          {:ok, %{rows: rows}} ->
            Enum.map(rows, fn [id, user_id, level] ->
              %{
                id: id,
                name: "Player_#{id}",
                user_id: user_id,
                map_id: 1,
                x: 10 + rem(id, 10),
                y: 12 + rem(id, 8),
                level: level || 1,
                role: "player",
                type: :player,
                hp: 100,
                max_hp: 100
              }
            end)

          _ ->
            []
        end
      end

    # 2. Fetch active NPCs & Bosses
    npcs =
      case Repo.query("SELECT id, name, role, faction, level, hp, max_hp, map_id, x, y, is_hostile, sovereign_soul_id FROM game_npcs WHERE is_active=1 LIMIT 50") do
        {:ok, %{rows: rows}} ->
          Enum.map(rows, fn [id, name, role, faction, level, hp, max_hp, map_id, x, y, is_hostile, soul_id] ->
            type = if is_hostile == 1 or role == "boss", do: :enemy, else: :npc

            %{
              id: id,
              name: name,
              role: role || "villager",
              faction: faction || "neutral",
              level: level || 1,
              hp: hp || 100,
              max_hp: max_hp || 100,
              map_id: map_id || 1,
              x: x || 10,
              y: y || 10,
              type: type,
              soul_id: soul_id
            }
          end)

        _ ->
          []
      end

    # 3. Fetch maps list
    maps =
      case Repo.query("SELECT id, name, width, height FROM game_maps LIMIT 20") do
        {:ok, %{rows: rows}} ->
          Enum.map(rows, fn [id, name, w, h] ->
            %{id: id, name: name || "Map ##{id}", width: w || 30, height: h || 30}
          end)

        _ ->
          [%{id: 1, name: "Overworld Sanctum", width: 30, height: 30}]
      end

    # 4. Predictive Threat Scanner (Ramsey Algorithm)
    critical_events = detect_threats(players, npcs)

    %{
      players: players,
      npcs: npcs,
      maps: maps,
      total_tracked: length(players) + length(npcs),
      critical_events: critical_events,
      timestamp: System.system_time(:second)
    }
  end

  @doc """
  Wiretaps a specific entity to retrieve real-time psychological state and telemetry.
  """
  def wiretap_entity(type, npc_id) when type in ["npc", :npc] do
    npc_id = to_int(npc_id, 1)

    case Repo.query("SELECT id, name, role, persona, faction, level, hp, max_hp, map_id, x, y, sovereign_soul_id FROM game_npcs WHERE id=?", [npc_id]) do
      {:ok, %{rows: [[id, name, role, persona, faction, level, hp, max_hp, map_id, x, y, soul_id]]}} ->
        # Probe Sovereign Soul Engine if registered, fallback to archetype subconscious telemetry
        soul_data =
          if soul_id || name do
            target = soul_id || String.downcase(name)
            case SovereignBridge.inspect_soul(target) do
              {:ok, data} when is_map(data) -> data
              _ -> fallback_soul(name, role, persona)
            end
          else
            fallback_soul(name, role, persona)
          end

        {:ok,
         %{
           id: id,
           type: :npc,
           name: name,
           role: role,
           persona: persona,
           faction: faction,
           level: level,
           hp: hp,
           max_hp: max_hp,
           coords: {x, y},
           map_id: map_id,
           soul_id: soul_id,
           soul: soul_data
         }}

      _ ->
        {:error, :not_found}
    end
  end

  def wiretap_entity(type, char_id) when type in ["player", :player] do
    char_id = to_int(char_id, 1)

    case Repo.query("SELECT id, level, gold, alignment FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[id, level, gold, alignment]]}} ->
        online_data = PlayerRegistry.get(id)

        {:ok,
         %{
           id: id,
           type: :player,
           name: (online_data && online_data.name) || "Player_#{id}",
           level: level || 1,
           gold: gold || 0,
           alignment: alignment || "neutral",
           coords: {online_data && online_data.x || 10, online_data && online_data.y || 10},
           map_id: online_data && online_data.map_id || 1,
           online: online_data != nil
         }}

      _ ->
        {:error, :not_found}
    end
  end

  def wiretap_entity(_, _), do: {:error, :invalid_type}

  @doc """
  Dispatches a localized tactical sonar ping across a specific map around (center_x, center_y).
  Detects all players and NPCs within acoustic range, calculates distance & bearing,
  and broadcasts an acoustic ping wave to all entities on that map.
  """
  def sonar_ping_map(map_id, center_x, center_y, radius \\ 15) do
    map_id = to_int(map_id, 1)
    center_x = to_int(center_x, 10)
    center_y = to_int(center_y, 10)
    radius = to_int(radius, 15)

    # 1. Gather all players on this map
    players =
      try do
        PlayerRegistry.on_map(map_id)
      rescue
        _ -> []
      end
      |> Enum.map(fn p ->
        dx = (p.x || 10) - center_x
        dy = (p.y || 10) - center_y
        dist = :math.sqrt(dx * dx + dy * dy) |> Float.round(1)
        bearing = calculate_bearing(dx, dy)

        %{
          id: p.char_id,
          name: p.name,
          type: :player,
          x: p.x || 10,
          y: p.y || 10,
          level: p.level || 1,
          hp: 100,
          max_hp: 100,
          distance: dist,
          bearing: bearing,
          in_range: dist <= radius,
          threat_level: if(dist <= 3, do: :high, else: :ally)
        }
      end)

    # 2. Gather active NPCs on this map
    npcs =
      case Repo.query("SELECT id, name, role, faction, level, hp, max_hp, x, y, is_hostile, sovereign_soul_id FROM game_npcs WHERE map_id=? AND is_active=1 LIMIT 60", [map_id]) do
        {:ok, %{rows: rows}} ->
          Enum.map(rows, fn [id, name, role, faction, level, hp, max_hp, x, y, is_hostile, soul_id] ->
            x = x || 10
            y = y || 10
            dx = x - center_x
            dy = y - center_y
            dist = :math.sqrt(dx * dx + dy * dy) |> Float.round(1)
            bearing = calculate_bearing(dx, dy)
            type = if is_hostile == 1 or role == "boss", do: :enemy, else: :npc

            threat_level =
              cond do
                role == "boss" -> :apex
                is_hostile == 1 && dist <= 5 -> :high
                is_hostile == 1 -> :medium
                true -> :low
              end

            %{
              id: id,
              name: name,
              role: role || "villager",
              faction: faction || "neutral",
              level: level || 1,
              hp: hp || 100,
              max_hp: max_hp || 100,
              type: type,
              x: x,
              y: y,
              soul_id: soul_id,
              distance: dist,
              bearing: bearing,
              in_range: dist <= radius,
              threat_level: threat_level
            }
          end)

        _ ->
          []
      end

    blips = (players ++ npcs) |> Enum.filter(fn b -> b.in_range end) |> Enum.sort_by(& &1.distance)

    ping_payload = %{
      map_id: map_id,
      origin: %{x: center_x, y: center_y},
      radius: radius,
      blips: blips,
      total_detected: length(blips),
      threat_count: Enum.count(blips, fn b -> b.threat_level in [:high, :apex] end),
      timestamp: System.system_time(:second)
    }

    try do
      TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "gods_eye_sonar_ping", ping_payload)
    rescue
      _ -> :ok
    end

    {:ok, ping_payload}
  end

  # ── Orbital Interventions (Point-and-Click Reality Warping) ────────

  @doc "Dispatches an orbital strike (lightning / divine wrath) to specific coordinates."
  def orbital_strike(map_id, x, y, opts \\ []) do
    damage = Keyword.get(opts, :damage, 500)
    map_id = to_int(map_id, 1)
    x = to_int(x, 10)
    y = to_int(y, 10)

    try do
      TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "orbital_strike", %{
        x: x,
        y: y,
        damage: damage,
        color: "#38bdf8",
        timestamp: System.system_time(:second)
      })

      TePhoenixWeb.Endpoint.broadcast("game:events", "world_announcement", %{
        title: "⚡ Orbital Strike Detected",
        message: "A beam of concentrated celestial fury struck Map ##{map_id} at (#{x}, #{y})!",
        severity: "danger"
      })
    rescue
      _ -> :ok
    end

    %{
      status: :ok,
      action: :orbital_strike,
      map_id: map_id,
      coords: {x, y},
      detail: "Orbital strike executed at (#{x}, #{y}) dealing #{damage} radiant damage"
    }
  end

  @doc "Drops a celestial supply cache directly at target coordinates."
  def orbital_supply_drop(map_id, x, y, _opts \\ []) do
    map_id = to_int(map_id, 1)
    x = to_int(x, 10)
    y = to_int(y, 10)

    try do
      TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "supply_drop", %{
        x: x,
        y: y,
        icon: "🎁",
        name: "Celestial Supply Cache",
        timestamp: System.system_time(:second)
      })
    rescue
      _ -> :ok
    end

    %{
      status: :ok,
      action: :supply_drop,
      map_id: map_id,
      coords: {x, y},
      detail: "Celestial supply beacon dropped at Map ##{map_id} (#{x}, #{y})"
    }
  end

  @doc "Whispers a direct omniscient broadcast into an individual player's screen."
  def orbital_whisper(char_id, message) do
    char_id = to_int(char_id, 1)

    try do
      TePhoenixWeb.Endpoint.broadcast("player:#{char_id}", "gods_eye_whisper", %{
        speaker: "Uile (Omni)",
        message: message,
        timestamp: System.system_time(:second)
      })
    rescue
      _ -> :ok
    end

    %{
      status: :ok,
      action: :orbital_whisper,
      char_id: char_id,
      message: message
    }
  end

  # ── Internal Helpers ──────────────────────────────────────────────

  defp detect_threats(players, npcs) do
    # Flag players under low health
    player_threats =
      Enum.filter(players, fn p -> p.hp < 30 end)
      |> Enum.map(fn p ->
        %{
          severity: :critical,
          target: p.name,
          coords: "(#{p.x}, #{p.y})",
          map_id: p.map_id,
          message: "Critical Health Alert: #{p.name} is at #{p.hp}% HP!"
        }
      end)

    # Flag hostile boss activity
    boss_threats =
      Enum.filter(npcs, fn n -> n.role == "boss" end)
      |> Enum.map(fn b ->
        %{
          severity: :warning,
          target: b.name,
          coords: "(#{b.x}, #{b.y})",
          map_id: b.map_id,
          message: "Apex Entity Detected: #{b.name} (Lvl #{b.level}) patrolling coordinates."
        }
      end)

    player_threats ++ boss_threats
  end

  defp calculate_bearing(dx, dy) do
    # Calculate compass bearing (0-360 deg, 0 = North, 90 = East, 180 = South, 270 = West)
    angle_rad = :math.atan2(dx, -dy)
    deg = round(angle_rad * (180.0 / :math.pi()))
    if deg < 0, do: deg + 360, else: deg
  end

  defp fallback_soul(name, role, persona) do
    role_lower = String.downcase(role || "")
    persona_lower = String.downcase(persona || "")

    {conf, stress, anger, grat, attachment} =
      cond do
        String.contains?(role_lower, "boss") or String.contains?(persona_lower, "warlord") ->
          {88, 30, 75, 10, "avoidant"}

        String.contains?(role_lower, "cutpurse") or String.contains?(role_lower, "thief") or String.contains?(role_lower, "stalker") ->
          {65, 70, 45, 15, "fearful"}

        String.contains?(role_lower, "guard") or String.contains?(role_lower, "sentry") ->
          {75, 40, 30, 50, "secure"}

        String.contains?(role_lower, "merchant") or String.contains?(role_lower, "innkeeper") ->
          {80, 25, 10, 85, "secure"}

        true ->
          {60, 35, 20, 60, "anxious"}
      end

    %{
      "character_name" => name,
      "emotional_state" => %{
        "confidence" => conf,
        "stress" => stress,
        "anger" => anger,
        "gratitude" => grat
      },
      "soul_profile" => %{
        "attachment_style" => attachment,
        "motto" => persona || "Endure the trials of the Ashveil."
      },
      "active_thoughts" => [
        "Assessing immediate perimeter threats...",
        "Monitoring nearby movement along the cobblestones."
      ]
    }
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
