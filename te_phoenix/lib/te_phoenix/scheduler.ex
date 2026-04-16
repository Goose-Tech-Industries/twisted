defmodule TePhoenix.Scheduler do
  @moduledoc """
  Cron-like task runner. Checks game_scheduled_tasks every 60s and executes due tasks.
  Also runs auction expiry (15min) and LFP/profile cleanup (hourly/daily).
  Ported from scheduler.js.

  Task types: SHOP_RESTOCK, SPAWN_RESPAWN, DUNGEON_RESET, SET_WORLD_FLAG,
  GIVE_XP_ALL, SET_REGION_STATE, BROADCAST.
  """

  use GenServer
  require Logger

  alias TePhoenix.{Repo, Game.PlayerRegistry, Game.MapData}

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  @impl true
  def init(_) do
    # Run once after 5s to catch missed tasks
    Process.send_after(self(), :run_tasks, 5_000)
    # Then every 60 seconds
    :timer.send_interval(60_000, :run_tasks)
    # Auction expiry every 15 minutes
    :timer.send_interval(15 * 60_000, :auction_expiry)
    # LFP cleanup every hour
    :timer.send_interval(60 * 60_000, :lfp_cleanup)
    # Profile viewer cleanup daily
    :timer.send_interval(24 * 60 * 60_000, :profile_cleanup)

    Logger.info("[Scheduler] Started — checking every 60 seconds")
    {:ok, %{}}
  end

  @impl true
  def handle_info(:run_tasks, state) do
    run_due_tasks()
    {:noreply, state}
  end

  def handle_info(:auction_expiry, state) do
    resolve_expired_auctions()
    {:noreply, state}
  end

  def handle_info(:lfp_cleanup, state) do
    try do
      Repo.query("DELETE FROM lfp_listings WHERE expires_at < NOW()")
    rescue _ -> nil
    end
    {:noreply, state}
  end

  def handle_info(:profile_cleanup, state) do
    try do
      Repo.query("DELETE FROM profile_viewers WHERE viewed_at < NOW() - INTERVAL 30 DAY")
    rescue _ -> nil
    end
    {:noreply, state}
  end

  def handle_info(_, state), do: {:noreply, state}

  # ══════════════════════════════════════════════════════════════════
  # TASK RUNNER
  # ══════════════════════════════════════════════════════════════════

  defp run_due_tasks do
    case Repo.query("SELECT * FROM game_scheduled_tasks WHERE is_enabled=1 ORDER BY id") do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.each(rows, fn row ->
          task = Enum.zip(cols, row) |> Map.new()
          if is_due?(task) do
            try do
              execute_task(task)
              Repo.query!("UPDATE game_scheduled_tasks SET last_run_at=NOW() WHERE id=?", [task["id"]])
              Logger.info("[Scheduler] Ran task ##{task["id"]}: #{task["name"]}")
            rescue
              e -> Logger.error("[Scheduler] Task ##{task["id"]} failed: #{Exception.message(e)}")
            end
          end
        end)
      _ -> nil
    end
  end

  defp is_due?(task) do
    now = NaiveDateTime.utc_now()
    last = task["last_run_at"]

    case task["schedule_type"] do
      "INTERVAL_MINUTES" ->
        mins = task["interval_minutes"] || 60
        is_nil(last) or NaiveDateTime.diff(now, last, :second) >= mins * 60

      "HOURLY" ->
        is_nil(last) or NaiveDateTime.diff(now, last, :second) >= 3600

      "DAILY" ->
        run_hour = task["run_at_hour"] || 0
        now.hour == run_hour and (is_nil(last) or Date.compare(NaiveDateTime.to_date(now), NaiveDateTime.to_date(last)) == :gt)

      "WEEKLY" ->
        run_day = task["run_at_day"] || 1
        run_hour = task["run_at_hour"] || 0
        Date.day_of_week(NaiveDateTime.to_date(now)) == run_day and now.hour == run_hour and
          (is_nil(last) or NaiveDateTime.diff(now, last, :second) >= 6 * 86400)

      _ -> false
    end
  end

  defp execute_task(task) do
    config = case task["config_json"] do
      nil -> %{}
      json when is_binary(json) -> case Jason.decode(json) do {:ok, c} -> c; _ -> %{} end
      map when is_map(map) -> map
      _ -> %{}
    end

    case task["task_type"] do
      "SHOP_RESTOCK" ->
        if task["target_id"] do
          Repo.query("UPDATE game_shop_supplies SET stock=COALESCE(restock_qty, 10) WHERE stock>=0 AND shop_id=?", [task["target_id"]])
        else
          Repo.query("UPDATE game_shop_supplies SET stock=COALESCE(restock_qty, 10) WHERE stock>=0")
        end
        TePhoenixWeb.Endpoint.broadcast!("social:lobby", "shop_restocked", %{shopId: task["target_id"]})

      "SPAWN_RESPAWN" ->
        if task["target_id"] do
          Repo.query("UPDATE characters c JOIN game_npcs n ON n.char_id=c.id SET c.current_hp=c.max_hp, n.is_dead=0 WHERE n.map_id=? AND n.is_enemy=1", [task["target_id"]])
          MapData.invalidate(task["target_id"])
        else
          Repo.query("UPDATE characters c JOIN game_npcs n ON n.char_id=c.id SET c.current_hp=c.max_hp, n.is_dead=0 WHERE n.is_enemy=1")
        end

      "DUNGEON_RESET" ->
        map_id = task["target_id"]
        if map_id do
          # Teleport online players off the map
          PlayerRegistry.on_map(map_id)
          |> Enum.each(fn p ->
            {rmap, rx, ry} = case Repo.query("SELECT respawn_map_id, respawn_x, respawn_y FROM characters WHERE id=?", [p.char_id]) do
              {:ok, %{rows: [[rm, rx, ry]]}} -> {rm || 1, rx || 10, ry || 10}
              _ -> {1, 10, 10}
            end
            PlayerRegistry.update(p.char_id, %{map_id: rmap, x: rx, y: ry})
            Repo.query("UPDATE characters SET map_id=?, x=?, y=? WHERE id=?", [rmap, rx, ry, p.char_id])
            TePhoenixWeb.Endpoint.broadcast!("user:#{p.char_id}", "force_map_change",
              %{mapId: rmap, x: rx, y: ry, message: "The dungeon has reset. You have been returned to safety."})
          end)

          # Respawn enemies
          Repo.query("UPDATE characters c JOIN game_npcs n ON n.char_id=c.id SET c.current_hp=c.max_hp, n.is_dead=0 WHERE n.map_id=? AND n.is_enemy=1", [map_id])
          MapData.invalidate(map_id)
        end

      "SET_WORLD_FLAG" ->
        flag = config["flag"]
        value = to_string(config["value"] || "true")
        if flag do
          Repo.query!("INSERT INTO world_flags (flag_key, flag_value) VALUES (?,?) ON DUPLICATE KEY UPDATE flag_value=VALUES(flag_value)", [flag, value])
          TePhoenixWeb.Endpoint.broadcast!("social:lobby", "world_flag_changed", %{flag: flag, value: value})
        end

      "GIVE_XP_ALL" ->
        amount = parse_int(config["amount"], 100)
        char_ids = PlayerRegistry.all() |> Enum.map(& &1.char_id)
        if char_ids != [] do
          placeholders = Enum.map_join(char_ids, ",", fn _ -> "?" end)
          Repo.query("UPDATE characters SET experience=experience+? WHERE id IN (#{placeholders})", [amount | char_ids])
          TePhoenixWeb.Endpoint.broadcast!("social:lobby", "server_xp_grant",
            %{amount: amount, message: "You received #{amount} XP from a server event!"})
        end

      "SET_REGION_STATE" ->
        region_id = config["region_id"]
        if region_id do
          fields = Map.drop(config, ["region_id"])
          if map_size(fields) > 0 do
            safe_cols = ~w(danger_level corruption_level faction_control weather_override pvp_enabled is_sanctuary xp_mult gold_mult spawn_rate_mult active_tags_json)
            {set_parts, vals} = Enum.reduce(fields, {[], []}, fn {k, v}, {parts, vs} ->
              if k in safe_cols, do: {parts ++ ["#{k}=?"], vs ++ [v]}, else: {parts, vs}
            end)
            if set_parts != [] do
              Repo.query("UPDATE game_regions SET #{Enum.join(set_parts, ", ")} WHERE id=?", vals ++ [region_id])
            end
          end
        end

      "BROADCAST" ->
        msg = config["message"] || "Server announcement."
        TePhoenixWeb.Endpoint.broadcast!("social:lobby", "server_broadcast", %{message: msg, color: config["color"] || "#bb86fc"})

      _ ->
        Logger.warning("[Scheduler] Unknown task type: #{task["task_type"]}")
    end
  end

  defp resolve_expired_auctions do
    try do
      case Repo.query("SELECT id, item_id, quantity, seller_char_id FROM auction_listings WHERE status='active' AND expires_at < NOW()") do
        {:ok, %{rows: rows}} when rows != [] ->
          Enum.each(rows, fn [id, item_id, qty, seller_id] ->
            # Return items to seller
            Repo.query("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+?",
              [seller_id, item_id, qty, qty])
            Repo.query!("UPDATE auction_listings SET status='expired' WHERE id=?", [id])
          end)
          Logger.info("[Auction] Resolved #{length(rows)} expired listing(s).")
        _ -> nil
      end
    rescue
      e -> Logger.error("[Auction] Expiry error: #{Exception.message(e)}")
    end
  end

  defp parse_int(nil, default), do: default
  defp parse_int(val, _) when is_integer(val), do: val
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do {n, _} -> n; :error -> default end
  end
  defp parse_int(_, default), do: default
end
