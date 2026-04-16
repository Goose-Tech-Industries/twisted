defmodule TePhoenix.Objectives.Resources do
  @moduledoc """
  RTS resource gathering system built on the objectives engine.

  Any map object can be marked as a resource node by setting its
  objective type to `"harvest"`. Workers interact with the node to
  gather resources into a per-team pool.

  ## Resource node (objective def)

      %{
        key: "gold_mine",
        type: "harvest",
        progress_model: "counter",
        target_value: 500,            # total yield before depletion
        settings: %{
          "resource_type" => "gold",
          "yield_per_tick" => 5,
          "max_gatherers" => 3,
          "depleted_respawn_seconds" => 120,
          "requires_building" => nil   # optional: must build extractor first
        }
      }

  ## Per-team resource pools

  Tracked in `game_team_resources` (auto-created). Each row:
  `(map_id, team_id, resource_type, amount)`. Supports any number of
  custom resource types — gold, wood, stone, crystal, gas, food, mana,
  whatever the game designer wants.

  ## Integration

    * Objectives.Ticker calls `tick_harvest/2` every second for active
      harvest objectives with gatherers.
    * Workers start gathering via `objective_interact` → `interact_start`.
    * Resources spent via `spend/4` (building, training, upgrading).
    * AdminSauce: resource nodes are just objectives with type=harvest.
    * Capability gated by `:objectives` (no separate capability needed).

  This is the backbone for:
    * RTS: gold mines, lumber mills, gas extractors
    * Survival: ore veins, herb patches, fishing spots
    * Idle games: auto-gathering nodes
    * MOBA: jungle camps that drop gold on kill
  """

  require Logger
  alias TePhoenix.Repo

  @pool_table "game_team_resources"

  # ── Pool management ─────────────────────────────────────────────

  @doc "Get the resource amount for a team on a map."
  def get_pool(map_id, team_id, resource_type) do
    ensure_pool_table()

    case Repo.query(
      "SELECT amount FROM #{@pool_table} WHERE map_id = ? AND team_id = ? AND resource_type = ?",
      [map_id, team_id, resource_type]
    ) do
      {:ok, %{rows: [[amt]]}} -> amt || 0
      _ -> 0
    end
  rescue
    _ -> 0
  end

  @doc "Get all resources for a team on a map."
  def get_all_pools(map_id, team_id) do
    ensure_pool_table()

    case Repo.query(
      "SELECT resource_type, amount FROM #{@pool_table} WHERE map_id = ? AND team_id = ?",
      [map_id, team_id]
    ) do
      {:ok, %{rows: rows}} -> Map.new(rows, fn [t, a] -> {t, a || 0} end)
      _ -> %{}
    end
  rescue
    _ -> %{}
  end

  @doc "Add resources to a team's pool. Returns the new total."
  def deposit(map_id, team_id, resource_type, amount) when amount > 0 do
    ensure_pool_table()

    Repo.query(
      """
      INSERT INTO #{@pool_table} (map_id, team_id, resource_type, amount)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)
      """,
      [map_id, team_id, resource_type, amount]
    )

    broadcast(map_id, team_id, resource_type)
    get_pool(map_id, team_id, resource_type)
  rescue
    e ->
      Logger.error("Resource deposit failed: #{inspect(e)}")
      0
  end

  @doc "Spend resources. Returns {:ok, new_total} or {:error, :insufficient}."
  def spend(map_id, team_id, resource_type, amount) when amount > 0 do
    current = get_pool(map_id, team_id, resource_type)

    if current >= amount do
      Repo.query(
        "UPDATE #{@pool_table} SET amount = amount - ? WHERE map_id = ? AND team_id = ? AND resource_type = ?",
        [amount, map_id, team_id, resource_type]
      )

      broadcast(map_id, team_id, resource_type)
      {:ok, current - amount}
    else
      {:error, :insufficient}
    end
  rescue
    e ->
      Logger.error("Resource spend failed: #{inspect(e)}")
      {:error, :internal}
  end

  @doc "Check if a team can afford a cost map (e.g. %{\"gold\" => 100, \"wood\" => 50})."
  def can_afford?(map_id, team_id, costs) when is_map(costs) do
    Enum.all?(costs, fn {resource_type, amount} ->
      get_pool(map_id, team_id, resource_type) >= amount
    end)
  end

  @doc "Spend multiple resource types atomically. Returns :ok or {:error, :insufficient}."
  def spend_multi(map_id, team_id, costs) when is_map(costs) do
    if can_afford?(map_id, team_id, costs) do
      Enum.each(costs, fn {resource_type, amount} ->
        spend(map_id, team_id, resource_type, amount)
      end)
      :ok
    else
      {:error, :insufficient}
    end
  end

  @doc "Reset all resources for a map (match end cleanup)."
  def reset_map(map_id) do
    Repo.query("DELETE FROM #{@pool_table} WHERE map_id = ?", [map_id])
  rescue
    _ -> :ok
  end

  # ── Harvest tick (called from Objectives.Ticker) ────────────────

  @doc """
  Tick a harvest-type objective. For each gatherer interacting with
  the resource node, yield `yield_per_tick` of the configured resource
  type into their team's pool. Depletes the node's remaining supply.

  Returns `{:ok, amount_gathered}` or `{:depleted, total_gathered}`.
  """
  def tick_harvest(objective_inst, objective_def) do
    settings = objective_def.settings || %{}
    resource_type = settings["resource_type"] || "gold"
    yield = settings["yield_per_tick"] || 1
    max_gatherers = settings["max_gatherers"] || 4

    gatherers = objective_inst.interacting || []
    active_count = min(length(gatherers), max_gatherers)

    if active_count == 0 do
      {:ok, 0}
    else
      total_yield = yield * active_count
      remaining = objective_def.target_value - (objective_inst.current_value || 0)
      actual_yield = min(total_yield, remaining)

      if actual_yield <= 0 do
        {:depleted, 0}
      else
        # Determine team from first gatherer (all gatherers should be same team)
        team_id = objective_inst.team_id || 1

        deposit(objective_inst.map_id, team_id, resource_type, actual_yield)

        # Advance the objective (tracks depletion)
        TePhoenix.Objectives.advance(objective_inst.id, actual_yield)

        new_remaining = remaining - actual_yield
        if new_remaining <= 0 do
          {:depleted, actual_yield}
        else
          {:ok, actual_yield}
        end
      end
    end
  end

  # ── DB table ────────────────────────────────────────────────────

  defp ensure_pool_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@pool_table} (
      map_id INT NOT NULL,
      team_id INT NOT NULL,
      resource_type VARCHAR(32) NOT NULL,
      amount INT DEFAULT 0,
      PRIMARY KEY (map_id, team_id, resource_type)
    )
    """)
  rescue
    _ -> :ok
  end

  # ── PubSub ──────────────────────────────────────────────────────

  defp broadcast(map_id, team_id, resource_type) do
    new_amount = get_pool(map_id, team_id, resource_type)

    Phoenix.PubSub.broadcast(
      TePhoenix.PubSub,
      "objectives:map:#{map_id}",
      {:resource_update, team_id, resource_type, new_amount}
    )
  rescue
    _ -> :ok
  end
end
