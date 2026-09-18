defmodule TePhoenix.Game.Relics do
  @moduledoc """
  Relic Collection System — Dragon Ball-style collectibles.

  Relics are placed on map tiles by admins. They're invisible unless:
    1. Player is standing on the exact tile
    2. Player has the matching radar item in inventory
    3. Player has the sensing technique + is within range

  When all relics in a set are collected, the set can be activated
  (summon dragon, grant wish, give reward). After use, relics scatter
  to random new locations after a configurable delay.
  """

  alias TePhoenix.Repo
  require Logger

  # ═════════════════════════════════════════════════════════════
  # VISIBILITY — what can a player see on their current map?
  # ═════════════════════════════════════════════════════════════

  @doc """
  Get all relics visible to a character on their current map.
  Returns list of relics they can see based on position + radar + sensing.
  """
  def visible_relics(_char_id, map_id, player_x, player_y, opts \\ []) do
    inventory_item_ids = Keyword.get(opts, :inventory_item_ids, [])

    # All placed relics on this map
    relics = case Repo.query(
      "SELECT ri.*, rs.name AS set_name, rs.icon AS set_icon, rs.radar_default_range FROM game_relic_instances ri JOIN game_relic_sets rs ON rs.id=ri.relic_set_id WHERE ri.map_id=? AND ri.status='placed' AND rs.is_active=1",
      [map_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    # Load radar items the player has (tier-based detection)
    radars = case Repo.query(
      "SELECT rr.*, rr.item_id FROM game_relic_radars rr WHERE rr.is_active=1 AND rr.item_id IN (#{Enum.map_join(inventory_item_ids, ",", &"#{&1}")})"
    ) do
      {:ok, %{rows: rows, columns: cols}} when rows != [] ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    # NOTE: Power sensing does NOT detect relics — only radar items
    # and standing on the exact tile. Relics are physical objects,
    # not ki signatures.

    Enum.filter(relics, fn relic ->
      rx = relic["x"]; ry = relic["y"]
      distance = abs(player_x - rx) + abs(player_y - ry)
      set_id = relic["relic_set_id"]

      # 1. Standing on the tile — always visible
      on_tile = distance == 0

      # 2. Has a radar for this relic set — check range by tier
      matching_radars = Enum.filter(radars, fn r ->
        (is_nil(r["relic_set_id"]) || r["relic_set_id"] == set_id) &&
        distance <= (r["range_tiles"] || 0)
      end)
      has_radar = length(matching_radars) > 0

      # Best radar determines visibility features
      _best_radar = Enum.max_by(matching_radars, fn r -> r["range_tiles"] || 0 end, fn -> nil end)

      on_tile || has_radar
    end)
    |> Enum.map(fn relic ->
      distance = abs(player_x - relic["x"]) + abs(player_y - relic["y"])
      on_tile = distance == 0

      # Find best radar for display info
      matching_radars = Enum.filter(radars, fn r ->
        (is_nil(r["relic_set_id"]) || r["relic_set_id"] == relic["relic_set_id"]) &&
        distance <= (r["range_tiles"] || 0)
      end)
      best_radar = Enum.max_by(matching_radars, fn r -> r["range_tiles"] || 0 end, fn -> nil end)
      shows_exact = best_radar && best_radar["shows_exact_tile"] == 1

      %{
        id: relic["id"],
        relic_set_id: relic["relic_set_id"],
        set_name: relic["set_name"],
        ordinal: relic["ordinal"],
        name: relic["name"],
        icon: relic["icon"] || relic["set_icon"] || "🟡",
        x: if(on_tile || shows_exact, do: relic["x"]),
        y: if(on_tile || shows_exact, do: relic["y"]),
        # Direction hint for radars that don't show exact tile
        direction: if(!on_tile && !shows_exact, do: direction_hint(player_x, player_y, relic["x"], relic["y"])),
        distance: distance,
        can_collect: on_tile,
        hide_description: if(on_tile, do: relic["hide_description"]),
        detected_by: if(on_tile, do: "found", else: "radar")
      }
    end)
  end

  @doc "Calculate Manhattan distance between two grid coordinates."
  def manhattan_distance(x1, y1, x2, y2) do
    abs(x1 - x2) + abs(y1 - y2)
  end

  @doc "Calculate cardinal / ordinal direction hint from player to relic."
  def direction_hint(px, py, rx, ry) do
    dx = rx - px; dy = ry - py
    h = cond do
      dx > 2 -> "east"; dx < -2 -> "west"; true -> nil
    end
    v = cond do
      dy > 2 -> "south"; dy < -2 -> "north"; true -> nil
    end
    case {v, h} do
      {nil, nil} -> "very close"
      {nil, h} -> h
      {v, nil} -> v
      {v, h} -> "#{v}#{h}"
    end
  end

  @doc "Filter and calculate display data for visible relics given radars and player location."
  def filter_visible_relics(relics, radars, player_x, player_y) do
    relics
    |> Enum.filter(fn relic ->
      rx = relic["x"] || relic[:x] || 0
      ry = relic["y"] || relic[:y] || 0
      distance = manhattan_distance(player_x, player_y, rx, ry)
      set_id = relic["relic_set_id"] || relic[:relic_set_id]

      on_tile = distance == 0

      matching_radars = Enum.filter(radars, fn r ->
        r_set_id = r["relic_set_id"] || r[:relic_set_id]
        r_range = r["range_tiles"] || r[:range_tiles] || 0
        (is_nil(r_set_id) || r_set_id == set_id) && distance <= r_range
      end)

      on_tile || length(matching_radars) > 0
    end)
    |> Enum.map(fn relic ->
      rx = relic["x"] || relic[:x] || 0
      ry = relic["y"] || relic[:y] || 0
      distance = manhattan_distance(player_x, player_y, rx, ry)
      on_tile = distance == 0
      set_id = relic["relic_set_id"] || relic[:relic_set_id]

      matching_radars = Enum.filter(radars, fn r ->
        r_set_id = r["relic_set_id"] || r[:relic_set_id]
        r_range = r["range_tiles"] || r[:range_tiles] || 0
        (is_nil(r_set_id) || r_set_id == set_id) && distance <= r_range
      end)
      best_radar = Enum.max_by(matching_radars, fn r -> r["range_tiles"] || r[:range_tiles] || 0 end, fn -> nil end)
      shows_exact = best_radar && (best_radar["shows_exact_tile"] == 1 || best_radar[:shows_exact_tile] == true)

      %{
        id: relic["id"] || relic[:id],
        relic_set_id: set_id,
        set_name: relic["set_name"] || relic[:set_name],
        ordinal: relic["ordinal"] || relic[:ordinal],
        name: relic["name"] || relic[:name],
        icon: relic["icon"] || relic[:icon] || relic["set_icon"] || relic[:set_icon] || "🟡",
        x: if(on_tile || shows_exact, do: rx),
        y: if(on_tile || shows_exact, do: ry),
        direction: if(!on_tile && !shows_exact, do: direction_hint(player_x, player_y, rx, ry)),
        distance: distance,
        can_collect: on_tile,
        hide_description: if(on_tile, do: relic["hide_description"] || relic[:hide_description]),
        detected_by: if(on_tile, do: "found", else: "radar")
      }
    end)
  end

  @doc "Pure validation and evaluation of a relic collection attempt."
  def evaluate_collection(relic, player_x, player_y, player_map_id, collected_count, needed_count) do
    rx = relic["x"] || relic[:x]
    ry = relic["y"] || relic[:y]
    rmap = relic["map_id"] || relic[:map_id]

    if player_x == rx and player_y == ry and player_map_id == rmap do
      new_collected = collected_count + 1
      needed = needed_count || relic["collect_count"] || relic[:collect_count] || 7
      {:ok, %{
        relic_name: relic["name"] || relic[:name] || "Relic",
        set_name: relic["set_name"] || relic[:set_name],
        collected: new_collected,
        needed: needed,
        set_complete: new_collected >= needed
      }}
    else
      {:error, "You must be standing on the relic's tile to collect it."}
    end
  end

  @doc "Calculate wish channeling progress."
  def calculate_channel_progress(turns_channeled, turns_needed) do
    new_turns = turns_channeled + 1
    if new_turns >= turns_needed do
      %{complete: true, turns_channeled: new_turns, turns_needed: turns_needed, turns_left: 0}
    else
      %{complete: false, turns_channeled: new_turns, turns_needed: turns_needed, turns_left: turns_needed - new_turns}
    end
  end

  @doc "Parse available wishes from JSON or list."
  def parse_wishes(wishes_json) do
    case wishes_json do
      j when is_binary(j) -> (try do Jason.decode!(j) rescue _ -> [] end)
      j when is_list(j) -> j
      _ -> []
    end
  end

  @doc "Validate wish selection against available wishes list."
  def validate_wish_selection(available_wishes, wish_id) do
    wishes = parse_wishes(available_wishes)
    case Enum.find(wishes, fn w -> w["id"] == wish_id or w[:id] == wish_id end) do
      nil -> {:error, "Invalid wish."}
      wish -> {:ok, wish}
    end
  end

  # ═════════════════════════════════════════════════════════════
  # COLLECTION
  # ═════════════════════════════════════════════════════════════

  @doc "Collect a relic. Player must be on the same tile."
  def collect(char_id, relic_instance_id) do
    case Repo.query(
      "SELECT ri.*, rs.collect_count, rs.name AS set_name FROM game_relic_instances ri JOIN game_relic_sets rs ON rs.id=ri.relic_set_id WHERE ri.id=? AND ri.status='placed'",
      [relic_instance_id]
    ) do
      {:ok, %{rows: [row], columns: cols}} ->
        relic = Enum.zip(cols, row) |> Map.new()

        # Verify player position
        case Repo.query("SELECT x, y, map_id FROM characters WHERE id=?", [char_id]) do
          {:ok, %{rows: [[px, py, pmap]]}} ->
            if px == relic["x"] and py == relic["y"] and pmap == relic["map_id"] do
              Repo.query!("UPDATE game_relic_instances SET status='collected', collected_by=?, collected_at=NOW() WHERE id=?",
                [char_id, relic_instance_id])

              # Check if set is complete
              collected = count_collected(char_id, relic["relic_set_id"])
              needed = relic["collect_count"] || 7

              {:ok, %{
                relic_name: relic["name"] || "#{relic["set_name"]} ##{relic["ordinal"]}",
                set_name: relic["set_name"],
                collected: collected, needed: needed,
                set_complete: collected >= needed
              }}
            else
              {:error, "You must be standing on the relic's tile to collect it."}
            end
          _ -> {:error, "Character not found."}
        end

      _ -> {:error, "Relic not found or already collected."}
    end
  end

  defp count_collected(char_id, set_id) do
    case Repo.query(
      "SELECT COUNT(*) FROM game_relic_instances WHERE relic_set_id=? AND status='collected' AND collected_by=?",
      [set_id, char_id]
    ) do
      {:ok, %{rows: [[c]]}} -> c; _ -> 0
    end
  end

  # ═════════════════════════════════════════════════════════════
  # ACTIVATION (Summon Dragon / Grant Wish)
  # ═════════════════════════════════════════════════════════════

  @doc """
  Begin activating a relic set. Starts channeling — takes multiple turns.
  During channeling, tiles within `wish_range_darken` go dark for all players.
  If the channeler is attacked, the wish is interrupted.

  Returns {:channeling, turns_needed} or {:error, reason}
  """
  def begin_activation(char_id, relic_set_id) do
    case Repo.query("SELECT * FROM game_relic_sets WHERE id=? AND is_active=1", [relic_set_id]) do
      {:ok, %{rows: [row], columns: cols}} ->
        set = Enum.zip(cols, row) |> Map.new()
        collected = count_collected(char_id, relic_set_id)
        needed = set["collect_count"] || 7

        if collected < needed do
          {:error, "You need #{needed - collected} more to complete the set."}
        else
          turns_needed = set["wish_channel_turns"] || 3

          # Get position
          case Repo.query("SELECT x, y, map_id FROM characters WHERE id=?", [char_id]) do
            {:ok, %{rows: [[px, py, map_id]]}} ->
              # Create channeling state
              try do
                Repo.query!(
                  "INSERT INTO game_relic_wish_state (character_id, relic_set_id, turns_needed, map_id, x, y) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE turns_channeled=0, turns_needed=?, status='channeling', map_id=?, x=?, y=?",
                  [char_id, relic_set_id, turns_needed, map_id, px, py, turns_needed, map_id, px, py])
              rescue _ -> nil
              end

              # Broadcast darkening effect to nearby players
              darken_range = set["wish_range_darken"] || 5
              TePhoenixWeb.Endpoint.broadcast!("map:#{map_id}", "relic_channeling", %{
                char_id: char_id, x: px, y: py,
                darken_range: darken_range,
                set_name: set["name"],
                summon_name: set["summon_name"],
                turns_needed: turns_needed
              })

              {:channeling, %{turns_needed: turns_needed, darken_range: darken_range, summon_name: set["summon_name"]}}
            _ -> {:error, "Character not found."}
          end
        end
      _ -> {:error, "Relic set not found."}
    end
  end

  @doc """
  Advance channeling by one turn. Call each turn while channeling.
  Returns {:continue, turns_left} | {:complete, wish_data} | {:error, reason}
  """
  def channel_turn(char_id, relic_set_id) do
    case Repo.query(
      "SELECT ws.*, rs.* FROM game_relic_wish_state ws JOIN game_relic_sets rs ON rs.id=ws.relic_set_id WHERE ws.character_id=? AND ws.relic_set_id=? AND ws.status='channeling'",
      [char_id, relic_set_id]
    ) do
      {:ok, %{rows: [row], columns: cols}} ->
        state = Enum.zip(cols, row) |> Map.new()
        new_turns = (state["turns_channeled"] || 0) + 1
        needed = state["turns_needed"] || 3

        Repo.query!("UPDATE game_relic_wish_state SET turns_channeled=? WHERE character_id=? AND relic_set_id=?",
          [new_turns, char_id, relic_set_id])

        if new_turns >= needed do
          # Channeling complete — present wishes
          Repo.query!("UPDATE game_relic_wish_state SET status='completed' WHERE character_id=? AND relic_set_id=?",
            [char_id, relic_set_id])

          # Clear darkening
          TePhoenixWeb.Endpoint.broadcast!("map:#{state["map_id"]}", "relic_channeling_end", %{char_id: char_id})

          wishes = case state["available_wishes_json"] do
            j when is_binary(j) -> (try do Jason.decode!(j) rescue _ -> [] end)
            j when is_list(j) -> j
            _ -> []
          end

          {:complete, %{
            summon_name: state["summon_name"],
            summon_dialogue: state["summon_dialogue"],
            max_wishes: state["max_wishes"] || 1,
            wishes: wishes
          }}
        else
          {:continue, %{turns_channeled: new_turns, turns_needed: needed, turns_left: needed - new_turns}}
        end

      _ -> {:error, "Not channeling."}
    end
  end

  @doc "Interrupt a wish channeling (e.g. player was attacked)."
  def interrupt_channeling(char_id) do
    case Repo.query("SELECT relic_set_id, map_id FROM game_relic_wish_state WHERE character_id=? AND status='channeling'", [char_id]) do
      {:ok, %{rows: [[set_id, map_id]]}} ->
        Repo.query!("UPDATE game_relic_wish_state SET status='interrupted' WHERE character_id=? AND relic_set_id=?",
          [char_id, set_id])
        # Clear darkening effect
        TePhoenixWeb.Endpoint.broadcast!("map:#{map_id}", "relic_channeling_end", %{char_id: char_id})
        {:interrupted, "The summoning was interrupted! The relics remain intact — try again."}
      _ -> :not_channeling
    end
  end

  @doc "Legacy activation for non-wish types (reward, event, etc.)"
  def activate_instant(char_id, relic_set_id) do
    case Repo.query("SELECT * FROM game_relic_sets WHERE id=? AND is_active=1", [relic_set_id]) do
      {:ok, %{rows: [row], columns: cols}} ->
        set = Enum.zip(cols, row) |> Map.new()
        collected = count_collected(char_id, relic_set_id)
        needed = set["collect_count"] || 7

        if collected < needed do
          {:error, "You need #{needed - collected} more."}
        else
          case set["activation_type"] do
            "reward" ->
              reward = case set["reward_json"] do
                j when is_binary(j) -> (try do Jason.decode!(j) rescue _ -> %{} end)
                j when is_map(j) -> j
                _ -> %{}
              end
              apply_reward(char_id, reward)
              scatter_relics(relic_set_id, set)
              log_activation(char_id, relic_set_id, "reward", nil)
              {:ok, %{type: "reward", reward: reward}}

            _ -> {:ok, %{type: set["activation_type"]}}
          end
        end
      _ -> {:error, "Set not found."}
    end
  end

  @doc "Grant a specific wish from the wish menu."
  def grant_wish(char_id, relic_set_id, wish_id, opts \\ []) do
    target_char_id = Keyword.get(opts, :target_char_id)

    case Repo.query("SELECT * FROM game_relic_sets WHERE id=?", [relic_set_id]) do
      {:ok, %{rows: [row], columns: cols}} ->
        set = Enum.zip(cols, row) |> Map.new()
        wishes = case set["available_wishes_json"] do
          j when is_binary(j) -> (try do Jason.decode!(j) rescue _ -> [] end)
          j when is_list(j) -> j; _ -> []
        end

        wish = Enum.find(wishes, fn w -> w["id"] == wish_id end)
        if is_nil(wish) do
          {:error, "Invalid wish."}
        else
          result = apply_wish_effect(char_id, wish, target_char_id)
          scatter_relics(relic_set_id, set)
          log_activation(char_id, relic_set_id, wish_id, target_char_id)
          {:ok, %{wish: wish["label"], result: result}}
        end
      _ -> {:error, "Set not found."}
    end
  end

  defp apply_wish_effect(char_id, wish, target_id) do
    target = target_id || char_id
    case wish["effect"] do
      "revive_player" ->
        Repo.query!("UPDATE characters SET current_hp = max_hp * 0.5 WHERE id=? AND current_hp <= 0", [target])
        "#{wish["label"]} granted. The fallen warrior rises again!"

      "stat_boost" ->
        val = wish["value"] || %{}
        stat = val["stat"] || "atk"
        amount = val["amount"] || 1000
        if stat in ~w(atk def mo md speed luck max_hp max_mp) do
          Repo.query!("UPDATE characters SET `#{stat}`=`#{stat}`+? WHERE id=?", [amount, target])
        end
        "#{wish["label"]} granted. +#{amount} #{stat}!"

      "status" ->
        val = wish["value"] || %{}
        "#{wish["label"]} granted. Status: #{val["status"]}."

      "reveal_hidden_technique" ->
        # Reveal a random hidden technique
        case Repo.query(
          "SELECT t.id, t.name FROM game_techniques t WHERE t.is_hidden=1 AND t.is_active=1 AND t.id NOT IN (SELECT technique_id FROM character_techniques WHERE character_id=?) ORDER BY RAND() LIMIT 1",
          [target]
        ) do
          {:ok, %{rows: [[tid, tname]]}} ->
            Repo.query!("INSERT INTO character_techniques (character_id, technique_id) VALUES (?,?) ON DUPLICATE KEY UPDATE current_level=1", [target, tid])
            "The dragon reveals ancient knowledge... You learned #{tname}!"
          _ -> "The dragon has nothing new to reveal."
        end

      "dm_decide" ->
        "The dragon considers your wish... A DM will fulfill it."

      _ ->
        "#{wish["label"]} granted."
    end
  end

  defp apply_reward(char_id, reward) do
    if reward["gold"], do: Repo.query("UPDATE users SET currency=currency+? WHERE id=(SELECT user_id FROM characters WHERE id=?)", [reward["gold"], char_id])
    if reward["xp"], do: Repo.query("UPDATE characters SET experience=experience+? WHERE id=?", [reward["xp"], char_id])
    if reward["item_id"], do: Repo.query("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1", [char_id, reward["item_id"]])
  end

  defp scatter_relics(set_id, set) do
    delay_hours = set["scatter_delay_hours"] || 168
    scatter_time = NaiveDateTime.add(NaiveDateTime.utc_now(), delay_hours * 3600)

    # Mark all as scattered with a reappear time
    Repo.query!("UPDATE game_relic_instances SET status='scattered', collected_by=NULL, collected_at=NULL, scatter_available_at=? WHERE relic_set_id=?",
      [scatter_time, set_id])

    # Randomize locations (admin can also manually re-place)
    case Repo.query("SELECT ri.id, rs.region_lock_ids FROM game_relic_instances ri JOIN game_relic_sets rs ON rs.id=ri.relic_set_id WHERE ri.relic_set_id=?", [set_id]) do
      {:ok, %{rows: rows}} ->
        Enum.each(rows, fn [relic_id, _region_lock] ->
          # Pick a random map + position
          case Repo.query("SELECT id, width, height FROM game_maps WHERE is_active=1 ORDER BY RAND() LIMIT 1") do
            {:ok, %{rows: [[mid, w, h]]}} ->
              rx = :rand.uniform(max(1, (w || 20) - 2)) + 1
              ry = :rand.uniform(max(1, (h || 20) - 2)) + 1
              Repo.query!("UPDATE game_relic_instances SET map_id=?, x=?, y=? WHERE id=?", [mid, rx, ry, relic_id])
            _ -> nil
          end
        end)
      _ -> nil
    end
  end

  defp log_activation(char_id, set_id, wish_id, target_id) do
    Repo.query("INSERT INTO game_relic_activation_log (relic_set_id, activated_by, wish_chosen, wish_target) VALUES (?,?,?,?)",
      [set_id, char_id, wish_id, target_id])
  end

  # ═════════════════════════════════════════════════════════════
  # RESPAWN SCATTERED RELICS (called by scheduler)
  # ═════════════════════════════════════════════════════════════

  @doc "Check for relics ready to respawn. Called periodically."
  def respawn_scattered do
    case Repo.query("SELECT id FROM game_relic_instances WHERE status='scattered' AND scatter_available_at <= NOW()") do
      {:ok, %{rows: rows}} ->
        Enum.each(rows, fn [id] ->
          Repo.query!("UPDATE game_relic_instances SET status='placed' WHERE id=?", [id])
        end)
        length(rows)
      _ -> 0
    end
  end

  # ═════════════════════════════════════════════════════════════
  # POWER SENSING
  # ═════════════════════════════════════════════════════════════

  @doc """
  Sense nearby fighters. Returns list of detected entities with
  PL info based on precision level.
  """
  def sense_nearby(char_id, opts \\ []) do
    ruleset_id = Keyword.get(opts, :ruleset_id)
    has_scouter = Keyword.get(opts, :has_scouter, false)

    rules = get_sensing_rules(ruleset_id)
    if is_nil(rules), do: {:error, "No sensing rules configured."}

    # Determine precision and range
    {precision, range, whole_map} = if has_scouter do
      {rules["scouter_precision"] || "exact", rules["scouter_range_tiles"] || 20, false}
    else
      {rules["precision"] || "estimate", rules["sense_range_tiles"] || 10, rules["sense_range_map"] == 1}
    end

    # Get character position + PL
    case Repo.query("SELECT x, y, map_id, atk, level FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[px, py, map_id, my_pl, _my_lvl]]}} ->
        # Get nearby players
        query = if whole_map do
          Repo.query("SELECT c.id, c.name, c.x, c.y, c.atk, c.level FROM characters c WHERE c.map_id=? AND c.id!=?", [map_id, char_id])
        else
          Repo.query(
            "SELECT c.id, c.name, c.x, c.y, c.atk, c.level FROM characters c WHERE c.map_id=? AND c.id!=? AND ABS(c.x-?)+ABS(c.y-?) <= ?",
            [map_id, char_id, px, py, range])
        end

        entities = case query do
          {:ok, %{rows: rows}} ->
            Enum.map(rows, fn [cid, name, x, y, pl, lvl] ->
              # Check suppression
              displayed_pl = check_suppression(cid, pl)

              # Check scouter break
              scouter_broke = has_scouter && rules["scouter_break_threshold"] &&
                rules["scouter_break_threshold"] > 0 && displayed_pl > rules["scouter_break_threshold"]

              reading = format_pl_reading(displayed_pl, my_pl, precision, rules)

              %{
                char_id: cid, name: name, x: x, y: y, level: lvl,
                power_reading: reading,
                scouter_broke: scouter_broke,
                distance: abs(px - x) + abs(py - y)
              }
            end)
          _ -> []
        end

        # Get nearby NPCs too
        npcs = case Repo.query(
          "SELECT n.id, n.name, n.x, n.y, n.base_atk, n.npc_level, n.is_enemy FROM game_npcs n WHERE n.map_id=? AND n.is_active=1",
          [map_id]
        ) do
          {:ok, %{rows: rows}} ->
            Enum.filter(rows, fn [_id, _name, nx, ny, _atk, _lvl, _enemy] ->
              whole_map || abs(px - nx) + abs(py - ny) <= range
            end)
            |> Enum.map(fn [nid, name, nx, ny, npc_pl, lvl, is_enemy] ->
              reading = format_pl_reading(npc_pl || 0, my_pl, precision, rules)
              %{npc_id: nid, name: name, x: nx, y: ny, level: lvl,
                is_enemy: is_enemy == 1, power_reading: reading,
                distance: abs(px - nx) + abs(py - ny)}
            end)
          _ -> []
        end

        scouter_broke = Enum.any?(entities, & &1.scouter_broke)

        {:ok, %{
          players: entities,
          npcs: npcs,
          scouter_broke: scouter_broke,
          scouter_break_message: if(scouter_broke, do: rules["scouter_break_message"] || "Your scouter explodes!")
        }}

      _ -> {:error, "Character not found."}
    end
  end

  defp check_suppression(char_id, actual_pl) do
    # Check if character is suppressing their power
    case Repo.query(
      "SELECT 1 FROM character_status_effects cse JOIN game_statuses s ON s.id=cse.status_id WHERE cse.character_id=? AND s.effects LIKE '%suppress%' AND (cse.expires_at IS NULL OR cse.expires_at > NOW()) LIMIT 1",
      [char_id]
    ) do
      {:ok, %{rows: [_]}} -> max(1, round(actual_pl * 0.01))  # suppressed to 1%
      _ -> actual_pl
    end
  end

  defp format_pl_reading(pl, my_pl, precision, rules) do
    case precision do
      "exact" ->
        %{type: "exact", value: pl, display: "#{pl}"}

      "estimate" ->
        variance = (rules["estimate_variance_pct"] || 10) / 100
        low = round(pl * (1 - variance))
        high = round(pl * (1 + variance))
        %{type: "estimate", low: low, high: high, display: "#{low} - #{high}"}

      "relative" ->
        ratio = if my_pl > 0, do: pl / my_pl, else: 999
        label = cond do
          ratio < 0.1  -> "Insignificant"
          ratio < 0.5  -> "Much weaker"
          ratio < 0.8  -> "Weaker"
          ratio < 1.2  -> "Similar strength"
          ratio < 2.0  -> "Stronger"
          ratio < 5.0  -> "Much stronger"
          ratio < 10.0 -> "Overwhelmingly powerful"
          true         -> "Immeasurable"
        end
        %{type: "relative", label: label, display: label}

      "vague" ->
        tier = cond do
          pl < 100       -> "Faint"
          pl < 1_000     -> "Noticeable"
          pl < 10_000    -> "Strong"
          pl < 100_000   -> "Very powerful"
          pl < 1_000_000 -> "Tremendous"
          true           -> "Godlike"
        end
        %{type: "vague", tier: tier, display: tier}

      _ -> %{type: "unknown", display: "???"}
    end
  end

  defp get_sensing_rules(ruleset_id) do
    case Repo.query("SELECT * FROM game_sensing_rules WHERE (ruleset_id=? OR ruleset_id IS NULL) AND is_active=1 LIMIT 1", [ruleset_id]) do
      {:ok, %{rows: [row], columns: cols}} -> Enum.zip(cols, row) |> Map.new()
      _ -> nil
    end
  end
end
