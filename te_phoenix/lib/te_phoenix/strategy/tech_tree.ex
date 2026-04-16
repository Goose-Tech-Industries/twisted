defmodule TePhoenix.Strategy.TechTree do
  @moduledoc """
  RTS tech tree, rally points, and build queue system.

  Manages research progression through a tiered tech tree, unit
  training queues with ETAs, and rally point assignment for buildings.

  ## Tables (auto-created)

    * `game_tech_nodes` — tech tree definitions (tiers, prereqs, costs, unlock lists)
    * `game_player_research` — per-player completed/in-progress research
    * `game_rally_points` — per-player per-building rally coordinates
    * `game_build_queue` — per-player unit training queue with positions and ETAs

  Everything is data-driven and editable from AdminSauce. Ships with
  12 default tech nodes across 4 tiers.
  """

  require Logger
  alias TePhoenix.Repo

  @tech_table "game_tech_nodes"
  @research_table "game_player_research"
  @rally_table "game_rally_points"
  @queue_table "game_build_queue"

  @max_queue_size 10

  # ── Default tech nodes ─────────────────────────────────────────

  @default_techs [
    # Tier 1 — no prerequisites
    %{
      key: "improved_harvesting",
      name: "Improved Harvesting",
      icon: "🌾",
      tier: 1,
      requires: [],
      unlocks: ["harvester_upgrade"],
      cost: %{"gold" => 100, "wood" => 50},
      research_time: 30
    },
    %{
      key: "basic_fortifications",
      name: "Basic Fortifications",
      icon: "🏰",
      tier: 1,
      requires: [],
      unlocks: ["palisade", "watchtower"],
      cost: %{"gold" => 80, "stone" => 60},
      research_time: 45
    },
    %{
      key: "scout_training",
      name: "Scout Training",
      icon: "🏇",
      tier: 1,
      requires: [],
      unlocks: ["scout"],
      cost: %{"gold" => 60, "food" => 40},
      research_time: 25
    },
    # Tier 2 — requires tier 1
    %{
      key: "advanced_mining",
      name: "Advanced Mining",
      icon: "⛏️",
      tier: 2,
      requires: ["improved_harvesting"],
      unlocks: ["deep_mine", "ore_refinery"],
      cost: %{"gold" => 250, "stone" => 150},
      research_time: 60
    },
    %{
      key: "archery_range",
      name: "Archery Range",
      icon: "🏹",
      tier: 2,
      requires: ["basic_fortifications"],
      unlocks: ["archer", "crossbowman"],
      cost: %{"gold" => 200, "wood" => 120},
      research_time: 55
    },
    %{
      key: "cavalry_stables",
      name: "Cavalry Stables",
      icon: "🐴",
      tier: 2,
      requires: ["scout_training"],
      unlocks: ["knight", "lancer"],
      cost: %{"gold" => 300, "food" => 200},
      research_time: 70
    },
    # Tier 3 — requires tier 2
    %{
      key: "siege_workshop",
      name: "Siege Workshop",
      icon: "💣",
      tier: 3,
      requires: ["archery_range"],
      unlocks: ["catapult", "battering_ram", "siege_tower"],
      cost: %{"gold" => 500, "wood" => 300, "iron" => 200},
      research_time: 120
    },
    %{
      key: "spell_research",
      name: "Spell Research",
      icon: "🔮",
      tier: 3,
      requires: ["advanced_mining"],
      unlocks: ["mage_tower", "fireball_spell", "heal_spell"],
      cost: %{"gold" => 600, "stone" => 200},
      research_time: 100
    },
    %{
      key: "elite_training",
      name: "Elite Training",
      icon: "⚔️",
      tier: 3,
      requires: ["cavalry_stables"],
      unlocks: ["champion", "royal_guard"],
      cost: %{"gold" => 450, "food" => 300, "iron" => 150},
      research_time: 90
    },
    # Tier 4 — requires tier 3
    %{
      key: "dragon_taming",
      name: "Dragon Taming",
      icon: "🐉",
      tier: 4,
      requires: ["siege_workshop"],
      unlocks: ["dragon", "dragon_roost"],
      cost: %{"gold" => 1500, "food" => 800, "iron" => 500},
      research_time: 300
    },
    %{
      key: "arcane_mastery",
      name: "Arcane Mastery",
      icon: "✨",
      tier: 4,
      requires: ["spell_research"],
      unlocks: ["archmage", "portal", "meteor_spell"],
      cost: %{"gold" => 1200, "stone" => 600},
      research_time: 240
    },
    %{
      key: "titan_forge",
      name: "Titan Forge",
      icon: "🔥",
      tier: 4,
      requires: ["elite_training"],
      unlocks: ["titan", "titan_armor"],
      cost: %{"gold" => 2000, "iron" => 1000, "stone" => 500},
      research_time: 360
    }
  ]

  # ── Table setup ────────────────────────────────────────────────

  def ensure_tables do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@tech_table} (
      `key` VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      icon VARCHAR(16) DEFAULT '🔬',
      tier INT DEFAULT 1,
      requires_json LONGTEXT,
      unlocks_json LONGTEXT,
      cost_json LONGTEXT,
      research_time_seconds INT DEFAULT 60,
      enabled TINYINT(1) DEFAULT 1,
      updated_at DATETIME NOT NULL
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@research_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      char_id INT NOT NULL,
      tech_key VARCHAR(80) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'in_progress',
      started_at DATETIME NOT NULL,
      finish_at DATETIME NOT NULL,
      completed_at DATETIME,
      UNIQUE KEY uk_char_tech (char_id, tech_key)
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@rally_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      char_id INT NOT NULL,
      building_key VARCHAR(80) NOT NULL,
      x INT NOT NULL DEFAULT 0,
      y INT NOT NULL DEFAULT 0,
      UNIQUE KEY uk_char_building (char_id, building_key)
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@queue_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      char_id INT NOT NULL,
      unit_key VARCHAR(80) NOT NULL,
      count INT DEFAULT 1,
      started_at DATETIME NOT NULL,
      finish_at DATETIME NOT NULL,
      position INT NOT NULL DEFAULT 0,
      INDEX idx_char_pos (char_id, position)
    )
    """)

    seed_defaults_if_empty()
  rescue
    e -> Logger.error("TechTree ensure_tables: #{inspect(e)}")
  end

  defp seed_defaults_if_empty do
    case Repo.query("SELECT COUNT(*) FROM #{@tech_table}") do
      {:ok, %{rows: [[0]]}} ->
        Enum.each(@default_techs, fn t ->
          Repo.query(
            """
            INSERT INTO #{@tech_table}
              (`key`, name, icon, tier, requires_json, unlocks_json, cost_json,
               research_time_seconds, enabled, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
            """,
            [
              t.key,
              t.name,
              t.icon,
              t.tier,
              Jason.encode!(t.requires),
              Jason.encode!(t.unlocks),
              Jason.encode!(t.cost),
              t.research_time
            ]
          )
        end)

      _ ->
        :ok
    end
  rescue
    _ -> :ok
  end

  # ── Tech node definitions ─────────────────────────────────────

  def get_tech_def(key) do
    case Repo.query(
           "SELECT `key`, name, icon, tier, requires_json, unlocks_json, cost_json, research_time_seconds FROM #{@tech_table} WHERE `key` = ? AND enabled = 1",
           [key]
         ) do
      {:ok, %{rows: [row]}} -> parse_tech_row(row)
      _ -> nil
    end
  rescue
    _ -> nil
  end

  def list_tech_defs do
    case Repo.query(
           "SELECT `key`, name, icon, tier, requires_json, unlocks_json, cost_json, research_time_seconds FROM #{@tech_table} WHERE enabled = 1 ORDER BY tier, `key`"
         ) do
      {:ok, %{rows: rows}} -> Enum.map(rows, &parse_tech_row/1)
      _ -> []
    end
  rescue
    _ -> []
  end

  defp parse_tech_row([key, name, icon, tier, req_j, unl_j, cost_j, rt]) do
    %{
      key: key,
      name: name,
      icon: icon || "🔬",
      tier: tier || 1,
      requires: decode(req_j, []),
      unlocks: decode(unl_j, []),
      cost: decode(cost_j, %{}),
      research_time: rt || 60
    }
  end

  # ── Research ───────────────────────────────────────────────────

  @doc """
  Start researching a tech. Validates:
    - Tech exists and is enabled
    - All prerequisite techs are completed
    - Player is not already researching something
    - Player has not already researched this tech
    - Player can afford the cost (uses Strategy.Economy)

  Returns `{:ok, %{tech_key, started_at, finish_at}}` or `{:error, reason}`.
  """
  def research(char_id, tech_key) do
    tech = get_tech_def(tech_key)

    cond do
      is_nil(tech) ->
        {:error, :unknown_tech}

      has_tech?(char_id, tech_key) ->
        {:error, :already_researched}

      researching?(char_id) ->
        {:error, :already_researching}

      not prereqs_met?(char_id, tech.requires) ->
        {:error, :prereqs_not_met}

      true ->
        # Check and spend resources
        case spend_costs(char_id, tech.cost) do
          :ok ->
            now = NaiveDateTime.utc_now()
            finish = NaiveDateTime.add(now, tech.research_time)

            Repo.query(
              """
              INSERT INTO #{@research_table}
                (char_id, tech_key, status, started_at, finish_at)
              VALUES (?, ?, 'in_progress', ?, ?)
              ON DUPLICATE KEY UPDATE
                status = 'in_progress', started_at = VALUES(started_at),
                finish_at = VALUES(finish_at), completed_at = NULL
              """,
              [char_id, tech_key, now, finish]
            )

            {:ok, %{tech_key: tech_key, started_at: now, finish_at: finish}}

          {:error, reason} ->
            {:error, reason}
        end
    end
  end

  @doc """
  Check for and complete any finished research for a player.
  Returns `{:ok, completed_keys}` with a list of newly completed tech keys,
  or `{:ok, []}` if nothing finished.
  """
  def complete_research(char_id) do
    case Repo.query(
           "SELECT tech_key FROM #{@research_table} WHERE char_id = ? AND status = 'in_progress' AND finish_at <= NOW()",
           [char_id]
         ) do
      {:ok, %{rows: rows}} when rows != [] ->
        keys = Enum.map(rows, fn [k] -> k end)

        Repo.query(
          "UPDATE #{@research_table} SET status = 'completed', completed_at = NOW() WHERE char_id = ? AND status = 'in_progress' AND finish_at <= NOW()",
          [char_id]
        )

        broadcast_tech(char_id)
        {:ok, keys}

      _ ->
        {:ok, []}
    end
  rescue
    _ -> {:ok, []}
  end

  @doc """
  Get the full tech tree with per-node status for a player.

  Each node includes:
    - All definition fields
    - `:status` — `:locked` | `:available` | `:researching` | `:completed`
    - `:finish_at` — when research completes (if researching)
  """
  def get_tree(char_id) do
    all_defs = list_tech_defs()
    completed = completed_techs(char_id)
    in_progress = in_progress_tech(char_id)

    Enum.map(all_defs, fn tech ->
      status =
        cond do
          tech.key in completed ->
            :completed

          match?({_, _}, Enum.find(in_progress, fn {k, _} -> k == tech.key end)) ->
            :researching

          Enum.all?(tech.requires, &(&1 in completed)) ->
            :available

          true ->
            :locked
        end

      finish_at =
        case Enum.find(in_progress, fn {k, _} -> k == tech.key end) do
          {_, f} -> f
          nil -> nil
        end

      Map.merge(tech, %{status: status, finish_at: finish_at})
    end)
  end

  @doc """
  Check if a player has completed a specific tech.
  """
  def has_tech?(char_id, tech_key) do
    case Repo.query(
           "SELECT 1 FROM #{@research_table} WHERE char_id = ? AND tech_key = ? AND status = 'completed' LIMIT 1",
           [char_id, tech_key]
         ) do
      {:ok, %{rows: [_]}} -> true
      _ -> false
    end
  rescue
    _ -> false
  end

  @doc """
  Return all techs whose prerequisites are fully met and are not yet
  researched or in progress.
  """
  def available_techs(char_id) do
    completed = completed_techs(char_id)
    in_progress_keys = Enum.map(in_progress_tech(char_id), fn {k, _} -> k end)

    list_tech_defs()
    |> Enum.filter(fn tech ->
      tech.key not in completed and
        tech.key not in in_progress_keys and
        Enum.all?(tech.requires, &(&1 in completed))
    end)
  end

  defp completed_techs(char_id) do
    case Repo.query(
           "SELECT tech_key FROM #{@research_table} WHERE char_id = ? AND status = 'completed'",
           [char_id]
         ) do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [k] -> k end)
      _ -> []
    end
  rescue
    _ -> []
  end

  defp in_progress_tech(char_id) do
    case Repo.query(
           "SELECT tech_key, finish_at FROM #{@research_table} WHERE char_id = ? AND status = 'in_progress'",
           [char_id]
         ) do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [k, f] -> {k, f} end)
      _ -> []
    end
  rescue
    _ -> []
  end

  defp researching?(char_id) do
    case Repo.query(
           "SELECT 1 FROM #{@research_table} WHERE char_id = ? AND status = 'in_progress' LIMIT 1",
           [char_id]
         ) do
      {:ok, %{rows: [_]}} -> true
      _ -> false
    end
  rescue
    _ -> false
  end

  defp prereqs_met?(char_id, requires) do
    completed = completed_techs(char_id)
    Enum.all?(requires, &(&1 in completed))
  end

  # ── Rally points ───────────────────────────────────────────────

  @doc """
  Set rally point for a building. Units trained from this building
  will move to (x, y) on completion.
  """
  def set_rally_point(char_id, building_key, x, y) do
    Repo.query(
      """
      INSERT INTO #{@rally_table} (char_id, building_key, x, y)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE x = VALUES(x), y = VALUES(y)
      """,
      [char_id, building_key, x, y]
    )

    {:ok, %{building_key: building_key, x: x, y: y}}
  end

  @doc """
  Get rally point for a building. Returns `{x, y}` or `nil`.
  """
  def get_rally_point(char_id, building_key) do
    case Repo.query(
           "SELECT x, y FROM #{@rally_table} WHERE char_id = ? AND building_key = ?",
           [char_id, building_key]
         ) do
      {:ok, %{rows: [[x, y]]}} -> {x, y}
      _ -> nil
    end
  rescue
    _ -> nil
  end

  @doc """
  Get all rally points for a player.
  """
  def list_rally_points(char_id) do
    case Repo.query(
           "SELECT building_key, x, y FROM #{@rally_table} WHERE char_id = ?",
           [char_id]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [bk, x, y] -> %{building_key: bk, x: x, y: y} end)

      _ ->
        []
    end
  rescue
    _ -> []
  end

  # ── Build queue ────────────────────────────────────────────────

  @doc """
  Add units to the training queue.

  Validates:
    - Queue size does not exceed max (#{@max_queue_size})
    - Unit key exists (checked via Strategy.Economy unit defs)
    - Player can afford the cost

  Returns `{:ok, queue_entry}` or `{:error, reason}`.
  """
  def queue_build(char_id, unit_key, count \\ 1) when count > 0 do
    current_size = queue_size(char_id)

    cond do
      current_size >= @max_queue_size ->
        {:error, :queue_full}

      true ->
        # Look up unit def from economy system for cost/time
        udef = TePhoenix.Strategy.Economy.get_unit_def(unit_key)

        if is_nil(udef) do
          {:error, :unknown_unit}
        else
          total_cost = Map.new(udef.train_cost, fn {r, c} -> {r, c * count} end)

          case spend_costs(char_id, total_cost) do
            :ok ->
              now = NaiveDateTime.utc_now()
              # Finish time = last item's finish_at + train_time * count, or now + train_time * count
              last_finish = get_queue_tail_finish(char_id)

              start_at =
                if last_finish && NaiveDateTime.compare(last_finish, now) == :gt,
                  do: last_finish,
                  else: now

              finish = NaiveDateTime.add(start_at, udef.train_time * count)
              next_pos = current_size

              Repo.query(
                """
                INSERT INTO #{@queue_table}
                  (char_id, unit_key, count, started_at, finish_at, position)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [char_id, unit_key, count, start_at, finish, next_pos]
              )

              entry = %{
                unit_key: unit_key,
                count: count,
                started_at: start_at,
                finish_at: finish,
                position: next_pos
              }

              {:ok, entry}

            {:error, reason} ->
              {:error, reason}
          end
        end
    end
  end

  @doc """
  Get the current build queue for a player with ETAs.
  Returns a list of queue entries sorted by position.
  """
  def get_queue(char_id) do
    case Repo.query(
           "SELECT id, unit_key, count, started_at, finish_at, position FROM #{@queue_table} WHERE char_id = ? ORDER BY position ASC",
           [char_id]
         ) do
      {:ok, %{rows: rows}} ->
        now = NaiveDateTime.utc_now()

        Enum.map(rows, fn [id, uk, cnt, sa, fa, pos] ->
          remaining =
            case NaiveDateTime.diff(fa, now) do
              diff when diff > 0 -> diff
              _ -> 0
            end

          %{
            id: id,
            unit_key: uk,
            count: cnt,
            started_at: sa,
            finish_at: fa,
            position: pos,
            remaining_seconds: remaining
          }
        end)

      _ ->
        []
    end
  rescue
    _ -> []
  end

  @doc """
  Cancel a queue item by its position index. Refunds the full cost.
  Reorders remaining queue positions.
  """
  def cancel_queue_item(char_id, position) do
    case Repo.query(
           "SELECT id, unit_key, count, finish_at FROM #{@queue_table} WHERE char_id = ? AND position = ?",
           [char_id, position]
         ) do
      {:ok, %{rows: [[id, unit_key, count, _finish_at]]}} ->
        # Refund cost
        udef = TePhoenix.Strategy.Economy.get_unit_def(unit_key)

        if udef do
          Enum.each(udef.train_cost, fn {r, c} ->
            TePhoenix.Strategy.Economy.add_resource(char_id, r, c * count)
          end)
        end

        # Delete the item
        Repo.query("DELETE FROM #{@queue_table} WHERE id = ?", [id])

        # Reorder remaining positions
        reorder_queue(char_id)

        # Recalculate finish times for items after the cancelled one
        recalculate_queue_times(char_id)

        {:ok, :cancelled}

      _ ->
        {:error, :not_found}
    end
  rescue
    _ -> {:error, :not_found}
  end

  @doc """
  Advance the build queue. Completes any items whose finish_at has passed.
  Completed units are added to the player's army (via Strategy.Economy)
  and moved to rally point if one is set.

  Returns `{:ok, completed_units}` where completed_units is a list of
  `%{unit_key, count, rally_point}`.
  """
  def tick_queue(char_id) do
    case Repo.query(
           "SELECT id, unit_key, count FROM #{@queue_table} WHERE char_id = ? AND finish_at <= NOW() ORDER BY position ASC",
           [char_id]
         ) do
      {:ok, %{rows: rows}} when rows != [] ->
        completed =
          Enum.map(rows, fn [id, unit_key, count] ->
            # Add to army directly
            Repo.query(
              """
              INSERT INTO game_player_armies (char_id, unit_key, count, training, training_finish_at)
              VALUES (?, ?, ?, 0, NULL)
              ON DUPLICATE KEY UPDATE count = count + VALUES(count)
              """,
              [char_id, unit_key, count]
            )

            # Delete from queue
            Repo.query("DELETE FROM #{@queue_table} WHERE id = ?", [id])

            # Check rally point — find building that produces this unit
            rally = find_rally_for_unit(char_id, unit_key)

            %{unit_key: unit_key, count: count, rally_point: rally}
          end)

        # Reorder remaining queue
        reorder_queue(char_id)
        recalculate_queue_times(char_id)

        broadcast_queue(char_id)
        {:ok, completed}

      _ ->
        {:ok, []}
    end
  rescue
    e ->
      Logger.error("TechTree.tick_queue error: #{inspect(e)}")
      {:ok, []}
  end

  defp queue_size(char_id) do
    case Repo.query("SELECT COUNT(*) FROM #{@queue_table} WHERE char_id = ?", [char_id]) do
      {:ok, %{rows: [[n]]}} -> n
      _ -> 0
    end
  rescue
    _ -> 0
  end

  defp get_queue_tail_finish(char_id) do
    case Repo.query(
           "SELECT finish_at FROM #{@queue_table} WHERE char_id = ? ORDER BY position DESC LIMIT 1",
           [char_id]
         ) do
      {:ok, %{rows: [[f]]}} -> f
      _ -> nil
    end
  rescue
    _ -> nil
  end

  defp reorder_queue(char_id) do
    case Repo.query(
           "SELECT id FROM #{@queue_table} WHERE char_id = ? ORDER BY position ASC, id ASC",
           [char_id]
         ) do
      {:ok, %{rows: rows}} ->
        rows
        |> Enum.with_index()
        |> Enum.each(fn {[id], idx} ->
          Repo.query("UPDATE #{@queue_table} SET position = ? WHERE id = ?", [idx, id])
        end)

      _ ->
        :ok
    end
  rescue
    _ -> :ok
  end

  defp recalculate_queue_times(char_id) do
    case Repo.query(
           "SELECT id, unit_key, count FROM #{@queue_table} WHERE char_id = ? ORDER BY position ASC",
           [char_id]
         ) do
      {:ok, %{rows: rows}} ->
        now = NaiveDateTime.utc_now()

        Enum.reduce(rows, now, fn [id, unit_key, count], prev_finish ->
          udef = TePhoenix.Strategy.Economy.get_unit_def(unit_key)
          train_time = if udef, do: udef.train_time * count, else: 30 * count

          start_at =
            if NaiveDateTime.compare(prev_finish, now) == :gt,
              do: prev_finish,
              else: now

          finish_at = NaiveDateTime.add(start_at, train_time)

          Repo.query(
            "UPDATE #{@queue_table} SET started_at = ?, finish_at = ? WHERE id = ?",
            [start_at, finish_at, id]
          )

          finish_at
        end)

      _ ->
        :ok
    end
  rescue
    _ -> :ok
  end

  defp find_rally_for_unit(char_id, _unit_key) do
    # Rally points are per-building. We look for any rally point set for
    # this player and return the first match. In a full implementation,
    # units would be mapped to their producing building via the tech tree
    # unlocks. For now, return the first available rally point or nil.
    case Repo.query(
           "SELECT x, y FROM #{@rally_table} WHERE char_id = ? LIMIT 1",
           [char_id]
         ) do
      {:ok, %{rows: [[x, y]]}} -> {x, y}
      _ -> nil
    end
  rescue
    _ -> nil
  end

  # ── Cost spending (delegates to Economy) ───────────────────────

  defp spend_costs(char_id, cost_map) when map_size(cost_map) == 0, do: :ok

  defp spend_costs(char_id, cost_map) do
    # Pre-check all resources before spending any
    resources = TePhoenix.Strategy.Economy.get_resources(char_id)

    can_afford =
      Enum.all?(cost_map, fn {r, c} ->
        Map.get(resources, to_string(r), 0) >= c
      end)

    if can_afford do
      Enum.each(cost_map, fn {r, c} ->
        TePhoenix.Strategy.Economy.spend_resource(char_id, to_string(r), c)
      end)

      :ok
    else
      {:error, :insufficient_resources}
    end
  end

  # ── Broadcasting ───────────────────────────────────────────────

  defp broadcast_tech(char_id) do
    tree = get_tree(char_id)
    Phoenix.PubSub.broadcast(TePhoenix.PubSub, "player:#{char_id}", {:tech_updated, tree})
  rescue
    _ -> :ok
  end

  defp broadcast_queue(char_id) do
    queue = get_queue(char_id)
    Phoenix.PubSub.broadcast(TePhoenix.PubSub, "player:#{char_id}", {:queue_updated, queue})
  rescue
    _ -> :ok
  end

  # ── JSON decode helper ────────────────────────────────────────

  defp decode(nil, d), do: d
  defp decode("", d), do: d
  defp decode(s, d) when is_binary(s), do: case(Jason.decode(s), do: ({:ok, v} -> v; _ -> d))
  defp decode(v, _) when is_map(v) or is_list(v), do: v
  defp decode(_, d), do: d
end
