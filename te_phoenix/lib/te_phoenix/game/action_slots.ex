defmodule TePhoenix.Game.ActionSlots do
  @moduledoc """
  Fixed Time-Window Action Slot Engine.

  Generic system for enforcing action limits within configurable time windows.
  Supports BG3-style action points, FF-style daily training, or any other
  RPG action economy — all admin-configurable per ruleset.

  Modes:
    - fixed_blocks:  Day split into N equal blocks (e.g. 4x 6hr windows)
    - daily_pool:    X uses per day, reset at a fixed time
    - per_window:    X uses per fixed block
    - unlimited:     No restriction

  Also handles:
    - BG3-style action points (action, bonus_action, reaction per turn/rest)
    - Movement based on race speed stat + modifiers
    - Per-race/class multipliers and extra uses
  """

  use GenServer
  require Logger
  alias TePhoenix.Repo

  @cache_ttl 300_000  # 5 min

  # ── Public API ──────────────────────────────────────────────

  def start_link(_opts), do: GenServer.start_link(__MODULE__, %{}, name: __MODULE__)

  def get_ruleset(campaign_id), do: GenServer.call(__MODULE__, {:get_ruleset, campaign_id})
  def get_action_windows(ruleset_id), do: GenServer.call(__MODULE__, {:get_windows, ruleset_id})
  def get_modifiers(ruleset_id, race, class_name), do: GenServer.call(__MODULE__, {:get_modifiers, ruleset_id, race, class_name})
  def clear_cache(ruleset_id \\ nil), do: GenServer.cast(__MODULE__, {:clear_cache, ruleset_id})

  @doc "Check if a character can perform an action. Returns {:ok, remaining, max} or {:error, reason}"
  def can_perform?(db_args), do: GenServer.call(__MODULE__, {:can_perform, db_args})

  @doc "Record an action was performed."
  def record_action(db_args), do: GenServer.cast(__MODULE__, {:record_action, db_args})

  @doc "Get all slot statuses for display."
  def get_slot_status(db_args), do: GenServer.call(__MODULE__, {:get_slot_status, db_args})

  @doc "Check campaign move limit."
  def check_moves(db_args), do: GenServer.call(__MODULE__, {:check_moves, db_args})

  @doc "Get gain multiplier for a race/class/action."
  def gain_multiplier(ruleset_id, race, class_name, action_type) do
    GenServer.call(__MODULE__, {:gain_multiplier, ruleset_id, race, class_name, action_type})
  end

  # ── GenServer ───────────────────────────────────────────────

  @impl true
  def init(_), do: {:ok, %{cache: %{}}}

  @impl true
  def handle_call({:get_ruleset, campaign_id}, _from, state) do
    {result, state} = cached_fetch(state, "ruleset_#{campaign_id}", fn ->
      case Repo.query("SELECT r.* FROM game_campaign_rulesets r JOIN game_dm_campaigns c ON c.ruleset_id=r.id WHERE c.id=? AND r.is_active=1", [campaign_id]) do
        {:ok, %{rows: [row], columns: cols}} -> Enum.zip(cols, row) |> Map.new()
        _ -> nil
      end
    end)
    {:reply, result, state}
  end

  def handle_call({:get_windows, ruleset_id}, _from, state) do
    {result, state} = cached_fetch(state, "windows_#{ruleset_id}", fn ->
      case Repo.query("SELECT * FROM game_action_windows WHERE ruleset_id=? AND is_active=1 ORDER BY sort_order", [ruleset_id]) do
        {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
        _ -> []
      end
    end)
    {:reply, result, state}
  end

  def handle_call({:get_modifiers, ruleset_id, race, class_name}, _from, state) do
    key = "mods_#{ruleset_id}_#{race}_#{class_name}"
    {result, state} = cached_fetch(state, key, fn ->
      race_lower = String.downcase(race || "")
      class_lower = String.downcase(class_name || "")
      case Repo.query(
        "SELECT * FROM game_ruleset_modifiers WHERE ruleset_id=? AND is_active=1 AND ((target_type='race' AND target_name=?) OR (target_type='class' AND target_name=?) OR target_type='status')",
        [ruleset_id, race_lower, class_lower]
      ) do
        {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
        _ -> []
      end
    end)
    {:reply, result, state}
  end

  def handle_call({:can_perform, args}, _from, state) do
    result = do_can_perform(args)
    {:reply, result, state}
  end

  def handle_call({:get_slot_status, args}, _from, state) do
    result = do_get_slot_status(args)
    {:reply, result, state}
  end

  def handle_call({:check_moves, args}, _from, state) do
    result = do_check_moves(args)
    {:reply, result, state}
  end

  def handle_call({:gain_multiplier, ruleset_id, race, class_name, action_type}, _from, state) do
    {mods, state} = cached_fetch(state, "mods_#{ruleset_id}_#{race}_#{class_name}", fn ->
      race_lower = String.downcase(race || "")
      class_lower = String.downcase(class_name || "")
      case Repo.query(
        "SELECT * FROM game_ruleset_modifiers WHERE ruleset_id=? AND is_active=1 AND ((target_type='race' AND target_name=?) OR (target_type='class' AND target_name=?))",
        [ruleset_id, race_lower, class_lower]
      ) do
        {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
        _ -> []
      end
    end)

    {multiplier, flat} = Enum.reduce(mods, {1.0, 0}, fn mod, {mult, flat} ->
      if is_nil(mod["action_type"]) or mod["action_type"] == action_type do
        m = if mod["multiplier"], do: Decimal.to_float(Decimal.round(mod["multiplier"], 4)), else: 1.0
        f = mod["flat_bonus"] || 0
        {mult * m, flat + f}
      else
        {mult, flat}
      end
    end)

    {:reply, %{multiplier: multiplier, flat_bonus: flat}, state}
  end

  @impl true
  def handle_cast({:record_action, args}, state) do
    do_record_action(args)
    {:noreply, state}
  end

  def handle_cast({:clear_cache, nil}, _state), do: {:noreply, %{cache: %{}}}
  def handle_cast({:clear_cache, ruleset_id}, state) do
    new_cache = state.cache
      |> Enum.reject(fn {k, _} -> String.contains?(k, "#{ruleset_id}") or String.starts_with?(k, "ruleset_") end)
      |> Map.new()
    {:noreply, %{state | cache: new_cache}}
  end

  # ── Time Window Logic ───────────────────────────────────────

  @doc "Compute the current window key for an action window config."
  def current_window(action_window) do
    _tz = action_window["reset_timezone"] || "America/New_York"
    now = DateTime.utc_now()
    # Simple hour-based calculation (timezone offset approximation)
    hour = now.hour  # UTC — in production, use Timex or tz_data for proper offset

    window_type = action_window["window_type"]

    case window_type do
      "daily_pool" ->
        {reset_h, _} = parse_time(action_window["reset_time"] || "00:00")
        date = if hour < reset_h, do: Date.add(Date.utc_today(), -1), else: Date.utc_today()
        %{window_key: "#{date}_daily", window_index: 0}

      t when t in ["fixed_blocks", "per_window"] ->
        block_count = action_window["block_count"] || 4
        start_hour = action_window["block_start_hour"] || 0
        hours_per_block = div(24, block_count)
        adjusted = rem(hour - start_hour + 24, 24)
        block_idx = div(adjusted, hours_per_block)
        date = if hour < start_hour, do: Date.add(Date.utc_today(), -1), else: Date.utc_today()
        %{window_key: "#{date}_W#{block_idx}", window_index: block_idx}

      _ ->
        %{window_key: "unlimited", window_index: 0}
    end
  end

  # ── Private Implementation ──────────────────────────────────

  defp do_can_perform(%{character_id: char_id, campaign_id: cid, action_type: action_type, race: race, class_name: class_name}) do
    ruleset = get_ruleset(cid)
    if is_nil(ruleset), do: {:ok, nil, nil, "No ruleset — unrestricted"}

    windows = get_action_windows(ruleset["id"])
    aw = Enum.find(windows, fn w -> w["action_type"] == action_type end)
    if is_nil(aw), do: {:ok, nil, nil, "Action not configured — unrestricted"}

    if aw["window_type"] == "unlimited", do: {:ok, nil, nil, "Unlimited"}

    window_info = current_window(aw)
    mods = get_modifiers(ruleset["id"], race, class_name)
    extra = mods
      |> Enum.filter(fn m -> is_nil(m["action_type"]) or m["action_type"] == action_type end)
      |> Enum.reduce(0, fn m, acc -> acc + (m["extra_uses"] || 0) end)

    max_uses = case aw["window_type"] do
      "daily_pool" -> (aw["max_uses_per_day"] || 99) + extra
      _ -> (aw["max_uses_per_window"] || 1) + extra
    end

    used = count_uses(char_id, action_type, window_info.window_key, cid)

    if used >= max_uses do
      {:error, "#{aw["label"]} limit reached (#{used}/#{max_uses} this window)"}
    else
      {:ok, max_uses - used, max_uses, window_info}
    end
  end
  defp do_can_perform(_), do: {:ok, nil, nil, "Missing args"}

  defp do_record_action(%{character_id: char_id, campaign_id: cid, action_type: action_type, result_json: result}) do
    ruleset = get_ruleset(cid)
    window_key = if ruleset do
      windows = get_action_windows(ruleset["id"])
      aw = Enum.find(windows, fn w -> w["action_type"] == action_type end)
      if aw && aw["window_type"] != "unlimited", do: current_window(aw).window_key, else: "unlimited"
    else
      "unlimited"
    end

    result_str = if result, do: Jason.encode!(result), else: nil
    try do
      Repo.query!("INSERT INTO game_character_action_log (character_id, campaign_id, action_type, window_key, result_json) VALUES (?,?,?,?,?)",
        [char_id, cid, action_type, window_key, result_str])
    rescue
      e -> Logger.warning("record_action failed: #{Exception.message(e)}")
    end
  end
  defp do_record_action(_), do: :ok

  defp do_get_slot_status(%{character_id: char_id, campaign_id: cid, race: race, class_name: class_name}) do
    ruleset = get_ruleset(cid)
    if is_nil(ruleset), do: []

    windows = get_action_windows(ruleset["id"])
    mods = get_modifiers(ruleset["id"], race, class_name)

    Enum.map(windows, fn aw ->
      if aw["window_type"] == "unlimited" do
        %{action_type: aw["action_type"], label: aw["label"], icon: aw["icon"],
          used: 0, max_uses: nil, remaining: nil, unlimited: true}
      else
        window_info = current_window(aw)
        extra = mods
          |> Enum.filter(fn m -> is_nil(m["action_type"]) or m["action_type"] == aw["action_type"] end)
          |> Enum.reduce(0, fn m, acc -> acc + (m["extra_uses"] || 0) end)

        max_uses = case aw["window_type"] do
          "daily_pool" -> (aw["max_uses_per_day"] || 99) + extra
          _ -> (aw["max_uses_per_window"] || 1) + extra
        end

        used = count_uses(char_id, aw["action_type"], window_info.window_key, cid)

        %{
          action_type: aw["action_type"], label: aw["label"], icon: aw["icon"],
          used: used, max_uses: max_uses, remaining: max(0, max_uses - used),
          requires_opponent: aw["requires_opponent"] == 1,
          requires_master: aw["requires_master"] == 1,
          window_info: window_info
        }
      end
    end)
  end
  defp do_get_slot_status(_), do: []

  defp do_check_moves(%{character_id: char_id, campaign_id: cid, race: race, class_name: class_name, is_flying: is_flying}) do
    ruleset = get_ruleset(cid)
    if is_nil(ruleset) or is_nil(ruleset["moves_per_day"]) do
      %{allowed: true, remaining: nil}
    else
      # Determine pool date
      {reset_h, _} = parse_time(ruleset["move_reset_time"] || "00:00")
      now = DateTime.utc_now()
      date = if now.hour < reset_h, do: Date.add(Date.utc_today(), -1), else: Date.utc_today()
      window_key = "#{date}_move"

      mods = get_modifiers(ruleset["id"], race, class_name)
      extra_moves = mods
        |> Enum.filter(fn m -> is_nil(m["action_type"]) or m["action_type"] == "move" end)
        |> Enum.reduce(0, fn m, acc -> acc + (m["extra_uses"] || 0) end)

      max_moves = ruleset["moves_per_day"] + extra_moves

      # Base tiles from ruleset, override from race modifier
      base_tiles = ruleset["tiles_per_move"] || 3
      tile_override = mods |> Enum.find(fn m -> m["tiles_per_move_override"] end)
      tiles = if tile_override, do: tile_override["tiles_per_move_override"], else: base_tiles

      # Movement mode: flat (fixed tiles), stat (derived from character stat), race (from modifiers)
      speed_stat = ruleset["movement_speed_stat"]
      tiles = case {ruleset["movement_mode"], speed_stat} do
        {"stat", stat} when not is_nil(stat) ->
          stat_col = stat
          divisor = ruleset["movement_speed_divisor"] || 5
          # BG3: speed 30 / divisor 5 = 6 tiles. Wood Elf speed 35 = 7 tiles.
          if stat_col in ~w(speed atk def mo md luck) do
            case Repo.query("SELECT `#{stat_col}` FROM characters WHERE id=?", [char_id]) do
              {:ok, %{rows: [[val]]}} when is_integer(val) and val > 0 -> max(1, div(val, divisor))
              _ -> tiles
            end
          else
            tiles
          end
        _ -> tiles
      end

      flying_bonus = ruleset["flying_tile_bonus"] || 0
      tiles = if is_flying, do: tiles + flying_bonus, else: tiles

      used = count_uses(char_id, "move", window_key, cid)
      remaining = max(0, max_moves - used)

      %{
        allowed: used < max_moves,
        remaining: remaining, used: used, max_moves: max_moves,
        tiles_per_move: tiles, flying_bonus: flying_bonus,
        window_key: window_key,
        reason: if(used >= max_moves, do: "Movement limit reached (#{max_moves}/day). Resets at #{ruleset["move_reset_time"] || "midnight"}.")
      }
    end
  end
  defp do_check_moves(_), do: %{allowed: true, remaining: nil}

  defp count_uses(char_id, action_type, window_key, campaign_id) do
    query = if campaign_id do
      Repo.query("SELECT COUNT(*) FROM game_character_action_log WHERE character_id=? AND action_type=? AND window_key=? AND campaign_id=?",
        [char_id, action_type, window_key, campaign_id])
    else
      Repo.query("SELECT COUNT(*) FROM game_character_action_log WHERE character_id=? AND action_type=? AND window_key=?",
        [char_id, action_type, window_key])
    end

    case query do
      {:ok, %{rows: [[c]]}} -> c
      _ -> 0
    end
  end

  defp cached_fetch(state, key, fetch_fn) do
    case Map.get(state.cache, key) do
      %{data: data, at: at} when is_integer(at) ->
        if System.system_time(:millisecond) - at < @cache_ttl do
          {data, state}
        else
          data = fetch_fn.()
          {data, put_in(state, [:cache, key], %{data: data, at: System.system_time(:millisecond)})}
        end
      _ ->
        data = fetch_fn.()
        {data, put_in(state, [:cache, key], %{data: data, at: System.system_time(:millisecond)})}
    end
  end

  defp parse_time(time_str) do
    case String.split(time_str || "00:00", ":") do
      [h, m] -> {String.to_integer(h), String.to_integer(m)}
      _ -> {0, 0}
    end
  end
end
