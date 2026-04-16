defmodule TePhoenixWeb.Admin.DashboardLive do
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo
  alias TePhoenix.Game.PlayerRegistry
  alias TePhoenix.Game.GameDirector

  @refresh_ms 10_000

  @impl true
  def mount(_params, _session, socket) do
    socket = assign(socket,
      active_tab: :dashboard,
      director_suggestions: [], director_loading: false, director_error: nil,
      engagement_score: 0, player_callouts: [], retention_risks: [],
      auto_pilot: TePhoenix.Game.AutoPilot.enabled?(),
      # Live state context
      live_state: nil,
      # Anomaly detection
      anomalies: [],
      # Predictive scheduling
      peak_hours: [],
      # Narrative thread
      narrative: nil, narrative_loading: false,
      # Mood pulse
      mood_buffer: [], mood_score: nil
    )

    if connected?(socket) do
      :timer.send_interval(@refresh_ms, :refresh_stats)
      Phoenix.PubSub.subscribe(TePhoenix.PubSub, "social:lobby")
    end

    {:ok, load_stats(socket)}
  end

  @impl true
  def handle_info(:refresh_stats, socket) do
    {:noreply, load_stats(socket)}
  end

  def handle_info({:director_result, suggestions}, socket) do
    {:noreply, assign(socket, director_suggestions: suggestions, director_loading: false, director_error: nil)}
  end

  def handle_info({:director_error, error}, socket) do
    msg = if is_binary(error), do: error, else: inspect(error)
    {:noreply, assign(socket, director_loading: false, director_error: "AI error: #{msg}")}
  end

  def handle_info(:narrative_timeout, %{assigns: %{narrative_loading: true}} = socket) do
    {:noreply, assign(socket, narrative_loading: false, narrative: "Narrative generation timed out. Check your AI API key in Settings → ai_api_key.")}
  end

  def handle_info(:narrative_timeout, socket), do: {:noreply, socket}

  # Chat messages for mood pulse (from PubSub subscription to social:lobby)
  def handle_info(%Phoenix.Socket.Broadcast{event: "chat_msg", payload: %{text: text, from: from}}, socket) do
    entry = %{text: text, from: from, at: System.system_time(:second)}
    buffer = [entry | socket.assigns.mood_buffer] |> Enum.take(50)
    mood = analyze_mood(buffer)
    {:noreply, assign(socket, mood_buffer: buffer, mood_score: mood)}
  end

  # Narrative result
  def handle_info({:narrative_result, text}, socket) do
    {:noreply, assign(socket, narrative: text, narrative_loading: false)}
  end

  # Catch-all for other PubSub broadcasts we don't care about
  def handle_info(%Phoenix.Socket.Broadcast{}, socket), do: {:noreply, socket}

  @impl true
  def handle_event("ask_director", _params, socket) do
    # Run AI call in background to not block the LiveView
    pid = self()
    socket = assign(socket, director_loading: true, director_error: nil)
    Task.start(fn ->
      try do
        suggestions = GameDirector.analyze()
        send(pid, {:director_result, suggestions})
      rescue
        e -> send(pid, {:director_error, "AI error: #{Exception.message(e)}"})
      end
    end)
    {:noreply, socket}
  end

  def handle_event("director_fallback", _params, socket) do
    {state, suggestions} = try do
      state = GameDirector.gather_state()
      suggestions = GameDirector.fallback_suggestions(state)
      {state, suggestions}
    rescue
      e ->
        {nil, [%{title: "Error loading game state", description: Exception.message(e), action: "none", priority: 1}]}
    end
    {:noreply, assign(socket, director_suggestions: suggestions, director_loading: false)}
  end

  # ── One-Click Execute from Director suggestions ─────────────────

  def handle_event("execute_action", %{"action" => action, "title" => title}, socket) do
    actor = %{id: socket.assigns[:session_user_id], name: socket.assigns[:session_username] || "GM"}

    result = case action do
      "broadcast" ->
        msg = "📢 #{title}"
        TePhoenixWeb.Endpoint.broadcast!("social:lobby", "system_broadcast", %{
          message: msg, style: "info", from: "DIRECTOR", timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
        })
        TePhoenix.Game.AdminAudit.log("gm_broadcast", actor, nil, %{source: "director", message: msg})
        "Broadcast sent."

      "weather" ->
        effect = Enum.random(~w(storm rain fog snow blizzard))
        TePhoenixWeb.Endpoint.broadcast!("social:lobby", "weather_change", %{effect: effect})
        TePhoenix.Game.AdminAudit.log("gm_weather", actor, nil, %{source: "director", effect: effect})
        "Weather set to #{effect}."

      "double_xp" ->
        Repo.query("INSERT INTO system_settings (setting_key, setting_value) VALUES ('double_xp', '1') ON DUPLICATE KEY UPDATE setting_value='1'")
        TePhoenixWeb.Endpoint.broadcast!("social:lobby", "system_broadcast", %{
          message: "⚡ DOUBLE XP is now active!", style: "info", from: "SYSTEM", timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
        })
        TePhoenix.Game.AdminAudit.log("gm_double_xp", actor, nil, "activated")
        "Double XP activated!"

      "tournament" ->
        TePhoenixWeb.Endpoint.broadcast!("social:lobby", "system_broadcast", %{
          message: "⚔️ A tournament has been called! Report to the arena!", style: "warning", from: "SYSTEM", timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
        })
        TePhoenix.Game.AdminAudit.log("gm_broadcast", actor, nil, %{source: "director", type: "tournament_call"})
        "Tournament call broadcast sent."

      "boss_spawn" ->
        TePhoenixWeb.Endpoint.broadcast!("social:lobby", "system_broadcast", %{
          message: "💀 A powerful enemy has appeared! Heroes, prepare yourselves!", style: "danger", from: "SYSTEM", timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
        })
        TePhoenix.Game.AdminAudit.log("gm_broadcast", actor, nil, %{source: "director", type: "boss_spawn"})
        "Boss spawn announcement sent."

      "world_event" ->
        TePhoenixWeb.Endpoint.broadcast!("social:lobby", "system_broadcast", %{
          message: "🌑 Something stirs in the ancient cairns... a world event approaches.", style: "warning", from: "SYSTEM", timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
        })
        TePhoenix.Game.AdminAudit.log("gm_broadcast", actor, nil, %{source: "director", type: "world_event"})
        "World event announcement sent."

      "gold_drop" ->
        TePhoenixWeb.Endpoint.broadcast!("social:lobby", "system_broadcast", %{
          message: "💰 A rare merchant has appeared with exotic wares!", style: "info", from: "SYSTEM", timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
        })
        TePhoenix.Game.AdminAudit.log("gm_broadcast", actor, nil, %{source: "director", type: "gold_sink"})
        "Gold sink event announced."

      _ ->
        "Unknown action: #{action}"
    end

    {:noreply, put_flash(socket, :info, result)}
  end

  def handle_event("toggle_live_state", _params, socket) do
    if socket.assigns.live_state do
      {:noreply, assign(socket, live_state: nil)}
    else
      try do
        state = GameDirector.gather_state()
        {:noreply, assign(socket, live_state: state) |> put_flash(:info, "Live state loaded — #{state.online_count} players online")}
      rescue
        e ->
          {:noreply, socket |> put_flash(:error, "Failed to load game state: #{Exception.message(e)}")}
      end
    end
  end

  def handle_event("generate_narrative", _params, socket) do
    socket = assign(socket, narrative_loading: true)
    pid = self()
    Task.start(fn ->
      try do
        text = generate_narrative_thread()
        send(pid, {:narrative_result, text})
      rescue
        e -> send(pid, {:narrative_result, "Narrative generation failed: #{Exception.message(e)}"})
      catch
        _, e -> send(pid, {:narrative_result, "Narrative generation failed: #{inspect(e)}"})
      end
    end)
    # Timeout fallback — if AI takes too long, show an error after 30s
    Process.send_after(self(), :narrative_timeout, 30_000)
    {:noreply, socket}
  end

  def handle_event("toggle_auto_pilot", _params, socket) do
    if socket.assigns.auto_pilot do
      TePhoenix.Game.AutoPilot.disable()
      {:noreply, assign(socket, auto_pilot: false) |> put_flash(:info, "Auto-Pilot disabled.")}
    else
      TePhoenix.Game.AutoPilot.enable()
      {:noreply, assign(socket, auto_pilot: true) |> put_flash(:info, "Auto-Pilot enabled. Safe events will fire every 10 min.")}
    end
  end

  # ── Data loading ──────────────────────────────────────────────

  defp load_stats(socket) do
    online_players = PlayerRegistry.all()
    online_count = length(online_players)

    total_users = query_count("SELECT COUNT(*) FROM users")
    total_chars = query_count("SELECT COUNT(*) FROM characters")
    total_maps = query_count("SELECT COUNT(*) FROM game_maps WHERE is_active=1")
    total_npcs = query_count("SELECT COUNT(*) FROM game_npcs WHERE is_active=1")
    total_items = query_count("SELECT COUNT(*) FROM game_items")
    battles_today = query_count("SELECT COUNT(*) FROM game_battles WHERE DATE(created_at)=CURDATE()")
    world_gold = query_count("SELECT COALESCE(SUM(currency),0) FROM users")
    open_reports = query_count("SELECT COUNT(*) FROM player_reports WHERE resolved=0")

    # Map name lookup
    map_names =
      case Repo.query("SELECT id, name FROM game_maps") do
        {:ok, %{rows: rows}} -> Map.new(rows, fn [id, name] -> {id, name} end)
        _ -> %{}
      end

    # Group online players by map
    online_by_map =
      online_players
      |> Enum.group_by(fn p -> Map.get(map_names, p.map_id, "Map #{p.map_id}") end)
      |> Enum.sort_by(fn {_name, players} -> -length(players) end)

    # Map population counts
    map_population =
      online_players
      |> Enum.frequencies_by(fn p -> p.map_id end)
      |> Enum.map(fn {map_id, count} -> {Map.get(map_names, map_id, "Map #{map_id}"), count} end)
      |> Enum.sort_by(fn {_name, count} -> -count end)

    # Signup trend (last 7 days)
    signup_trend = load_signup_trend()

    # Top 5 characters by level
    top_chars =
      case Repo.query(
             "SELECT c.name, c.level, u.username, u.id as user_id, u.role, u.chat_color FROM characters c JOIN users u ON u.id=c.user_id ORDER BY c.level DESC LIMIT 5"
           ) do
        {:ok, %{rows: rows}} ->
          Enum.map(rows, fn [name, level, username, user_id, role, chat_color] ->
            %{name: name, level: level, username: username, user_id: user_id, role: to_string(role || "PLAYER"), chat_color: chat_color}
          end)

        _ ->
          []
      end

    # Recent accounts
    recent_users =
      case Repo.query(
             "SELECT id, username, role, is_banned, last_login, created_at, chat_color FROM users ORDER BY created_at DESC LIMIT 8"
           ) do
        {:ok, %{rows: rows}} ->
          Enum.map(rows, fn [id, username, role, is_banned, last_login, created_at, chat_color] ->
            %{
              id: id,
              username: username,
              role: (role || "PLAYER") |> to_string() |> String.upcase(),
              is_banned: is_banned == 1 or is_banned == true,
              last_login: last_login,
              created_at: created_at,
              chat_color: chat_color
            }
          end)

        _ ->
          []
      end

    # Retention / streak stats
    streak_stats =
      case Repo.query(
             "SELECT AVG(login_streak) as avg_streak, MAX(login_streak) as max_streak, COUNT(CASE WHEN login_streak > 0 THEN 1 END) as streak_players FROM users"
           ) do
        {:ok, %{rows: [[avg, best, active]]}} ->
          %{
            avg_streak: safe_float(avg),
            max_streak: safe_int(best),
            streak_players: safe_int(active)
          }

        _ ->
          %{avg_streak: 0.0, max_streak: 0, streak_players: 0}
      end

    # Tutorial completion rate
    tutorial_rate =
      case Repo.query(
             "SELECT COUNT(CASE WHEN JSON_EXTRACT(state_json, '$.tutorial_done')=true THEN 1 END), COUNT(*) FROM characters"
           ) do
        {:ok, %{rows: [[done, total]]}} when total > 0 ->
          round(safe_int(done) / safe_int(total) * 100)

        _ ->
          0
      end

    # AI provider
    ai_provider =
      case Repo.query(
             "SELECT setting_value FROM system_settings WHERE setting_key='ai_provider' LIMIT 1"
           ) do
        {:ok, %{rows: [[val]]}} -> val || "disabled"
        _ -> "disabled"
      end

    # Economy pulse: gold flow today
    gold_earned_today = query_count("SELECT COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(detail_json, '$.gold')) AS SIGNED)),0) FROM game_event_log WHERE event_type='battle_end' AND DATE(created_at)=CURDATE()")
    gold_spent_today = query_count("SELECT COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(detail_json, '$.price')) AS SIGNED)),0) FROM game_event_log WHERE event_type='buy_item' AND DATE(created_at)=CURDATE()")
    gold_gm_today = query_count("SELECT COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(detail_json, '$.amount')) AS SIGNED)),0) FROM game_event_log WHERE event_type='gm_give_gold' AND DATE(created_at)=CURDATE()")

    # Recent admin actions (last 10 gm_* events)
    recent_admin_actions = case Repo.query(
      "SELECT event_type, actor_name, target_name, detail_json, created_at FROM game_event_log WHERE event_type LIKE 'gm_%' ORDER BY created_at DESC LIMIT 10"
    ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [type, actor, target, detail, ts] ->
          %{type: type, actor: actor, target: target, detail: detail, timestamp: ts}
        end)
      _ -> []
    end

    # Alerts
    banned_today = query_count("SELECT COUNT(*) FROM game_event_log WHERE event_type='gm_ban' AND DATE(created_at)=CURDATE()")
    warnings_today = query_count("SELECT COUNT(*) FROM player_warnings WHERE DATE(created_at)=CURDATE()")
    maintenance_mode = case Repo.query("SELECT setting_value FROM system_settings WHERE setting_key='maintenance_mode'") do
      {:ok, %{rows: [["1"]]}} -> true
      _ -> false
    end

    # ── Engagement Score (0-100) ──────────────────────────────────
    # Factors: online ratio, battles/hour, gold flow, player spread, streaks
    online_ratio = if total_users > 0, do: min(online_count / max(total_users, 1) * 100, 100), else: 0
    battle_score = min(battles_today * 5, 30)  # up to 30 points
    spread_score = if online_count > 0, do: min(length(map_population) / max(online_count, 1) * 20, 15), else: 0
    streak_score = min(safe_float(streak_stats.avg_streak) * 3, 15)
    signup_score = min(Enum.sum(Enum.map(signup_trend, & &1.count)) * 2, 15)
    engagement_score = round(min(online_ratio * 0.25 + battle_score + spread_score + streak_score + signup_score, 100))

    # ── Player Callouts ────────────────────────────────────────────
    player_callouts = build_player_callouts(online_players, map_names)

    # ── Retention Risks ────────────────────────────────────────────
    retention_risks = build_retention_risks()

    assign(socket,
      online_count: online_count,
      online_by_map: online_by_map,
      map_population: map_population,
      total_users: total_users,
      total_chars: total_chars,
      total_maps: total_maps,
      total_npcs: total_npcs,
      total_items: total_items,
      battles_today: battles_today,
      world_gold: world_gold,
      open_reports: open_reports,
      signup_trend: signup_trend,
      top_chars: top_chars,
      recent_users: recent_users,
      streak_stats: streak_stats,
      tutorial_rate: tutorial_rate,
      ai_provider: ai_provider,
      gold_earned_today: gold_earned_today,
      gold_spent_today: gold_spent_today,
      gold_gm_today: gold_gm_today,
      recent_admin_actions: recent_admin_actions,
      banned_today: banned_today,
      warnings_today: warnings_today,
      maintenance_mode: maintenance_mode,
      engagement_score: engagement_score,
      player_callouts: player_callouts,
      retention_risks: retention_risks,
      anomalies: detect_anomalies(online_players),
      peak_hours: load_peak_hours()
    )
  end

  defp load_signup_trend do
    raw =
      case Repo.query(
             "SELECT DATE(created_at) as day, COUNT(*) as n FROM users WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) GROUP BY DATE(created_at) ORDER BY day"
           ) do
        {:ok, %{rows: rows}} ->
          Map.new(rows, fn [day, n] -> {to_string(day) |> String.slice(0, 10), safe_int(n)} end)

        _ ->
          %{}
      end

    today = Date.utc_today()

    for i <- 6..0//-1 do
      date = Date.add(today, -i)
      key = Date.to_string(date)
      day_label = Calendar.strftime(date, "%a")
      %{date: key, day: day_label, count: Map.get(raw, key, 0)}
    end
  end

  defp query_count(sql) do
    case Repo.query(sql) do
      {:ok, %{rows: [[c]]}} -> safe_int(c)
      _ -> 0
    end
  end

  defp safe_int(nil), do: 0
  defp safe_int(v) when is_integer(v), do: v
  defp safe_int(v) when is_float(v), do: round(v)
  defp safe_int(v) when is_binary(v), do: String.to_integer(v)
  defp safe_int(%Decimal{} = d), do: d |> Decimal.round(0) |> Decimal.to_integer()
  defp safe_int(_), do: 0

  defp safe_float(nil), do: 0.0
  defp safe_float(v) when is_float(v), do: Float.round(v, 1)
  defp safe_float(v) when is_integer(v), do: v / 1
  defp safe_float(%Decimal{} = d), do: d |> Decimal.round(2) |> Decimal.to_float()
  defp safe_float(_), do: 0.0

  defp format_gold(amount) when amount >= 1_000_000,
    do: "#{Float.round(amount / 1_000_000, 1)}M"

  defp format_gold(amount) when amount >= 1_000, do: "#{Float.round(amount / 1_000, 1)}k"
  defp format_gold(amount), do: "#{amount}"

  defp format_date(nil), do: "--"
  defp format_date(%NaiveDateTime{} = dt), do: Calendar.strftime(dt, "%b %d, %Y")
  defp format_date(%DateTime{} = dt), do: Calendar.strftime(dt, "%b %d, %Y")
  defp format_date(%Date{} = d), do: Calendar.strftime(d, "%b %d, %Y")
  defp format_date(v) when is_binary(v), do: v
  defp format_date(_), do: "--"

  defp format_datetime(nil), do: "never"
  defp format_datetime(%NaiveDateTime{} = dt), do: Calendar.strftime(dt, "%b %d %H:%M")
  defp format_datetime(%DateTime{} = dt), do: Calendar.strftime(dt, "%b %d %H:%M")
  defp format_datetime(v) when is_binary(v), do: v
  defp format_datetime(_), do: "--"

  # ── Player Callouts ────────────────────────────────────────────

  defp build_player_callouts(online_players, map_names) do
    callouts = []

    # New players (joined today, online now)
    new_player_ids = case Repo.query("SELECT id FROM users WHERE DATE(created_at)=CURDATE()") do
      {:ok, %{rows: r}} -> Enum.map(r, fn [id] -> id end) |> MapSet.new()
      _ -> MapSet.new()
    end
    callouts = Enum.reduce(online_players, callouts, fn p, acc ->
      if MapSet.member?(new_player_ids, p[:user_id]) do
        [%{icon: "🆕", text: "#{p.name} is a new player (joined today)", type: "new", user_id: p[:user_id]} | acc]
      else
        acc
      end
    end)

    # Close to leveling (within 10% of next level XP)
    callouts = case Repo.query("""
      SELECT c.id, c.name, c.level, c.experience, u.id as user_id
      FROM characters c JOIN users u ON u.id=c.user_id
      WHERE c.id IN (#{online_char_ids_sql(online_players)})
    """) do
      {:ok, %{rows: rows}} ->
        Enum.reduce(rows, callouts, fn [_cid, name, level, xp, uid], acc ->
          next_xp = level_xp_requirement(level + 1)
          remaining = next_xp - (xp || 0)
          if remaining > 0 and remaining <= next_xp * 0.1 do
            [%{icon: "⬆️", text: "#{name} is #{remaining} XP from level #{level + 1}", type: "level_up", user_id: uid} | acc]
          else
            acc
          end
        end)
      _ -> callouts
    end

    # Returning players (last login > 3 days ago, online now)
    returning_ids = case Repo.query("SELECT id FROM users WHERE last_login < NOW() - INTERVAL 3 DAY AND last_login IS NOT NULL") do
      {:ok, %{rows: r}} -> Enum.map(r, fn [id] -> id end) |> MapSet.new()
      _ -> MapSet.new()
    end
    callouts = Enum.reduce(online_players, callouts, fn p, acc ->
      if MapSet.member?(returning_ids, p[:user_id]) do
        [%{icon: "👋", text: "#{p.name} returned after being away", type: "returning", user_id: p[:user_id]} | acc]
      else
        acc
      end
    end)

    # Solo players (only one on their map, been there a while)
    callouts = Enum.reduce(online_players, callouts, fn p, acc ->
      same_map = Enum.count(online_players, fn o -> o.map_id == p.map_id end)
      if same_map == 1 and length(online_players) > 2 do
        map_name = Map.get(map_names, p.map_id, "Map #{p.map_id}")
        [%{icon: "🏝️", text: "#{p.name} is alone in #{map_name}", type: "solo", user_id: p[:user_id]} | acc]
      else
        acc
      end
    end)

    callouts |> Enum.take(8)
  end

  defp online_char_ids_sql([]), do: "0"
  defp online_char_ids_sql(players) do
    players |> Enum.map(fn p -> to_string(p.char_id) end) |> Enum.join(",")
  end

  defp level_xp_requirement(level) when level <= 1, do: 100
  defp level_xp_requirement(level), do: round(100 * :math.pow(level, 1.5))

  # ── Retention Risks ──────────────────────────────────────────────

  defp build_retention_risks do
    risks = []

    # Players who haven't battled in 3+ days but were active before
    risks = case Repo.query("""
      SELECT u.id, u.username, u.last_login, u.login_streak,
             DATEDIFF(NOW(), u.last_login) as days_away
      FROM users u
      WHERE u.is_banned=0
        AND u.last_login IS NOT NULL
        AND u.last_login < NOW() - INTERVAL 3 DAY
        AND u.last_login > NOW() - INTERVAL 30 DAY
        AND u.login_streak > 2
      ORDER BY u.login_streak DESC
      LIMIT 5
    """) do
      {:ok, %{rows: rows}} ->
        Enum.reduce(rows, risks, fn [id, name, _login, streak, days], acc ->
          [%{icon: "🔥", text: "#{name} had a #{streak}-day streak, gone #{days}d", type: "streak_break", user_id: id, severity: if(streak > 5, do: "high", else: "medium")} | acc]
        end)
      _ -> risks
    end

    # High-death players (died 3+ times recently, might be frustrated)
    risks = case Repo.query("""
      SELECT c.id, c.name, c.death_count, u.id as user_id
      FROM characters c JOIN users u ON u.id=c.user_id
      WHERE c.death_count >= 3
        AND u.last_login > NOW() - INTERVAL 7 DAY
      ORDER BY c.death_count DESC LIMIT 3
    """) do
      {:ok, %{rows: rows}} ->
        Enum.reduce(rows, risks, fn [_cid, name, deaths, uid], acc ->
          [%{icon: "💀", text: "#{name} has died #{deaths} times — might be frustrated", type: "high_deaths", user_id: uid, severity: if(deaths > 5, do: "high", else: "medium")} | acc]
        end)
      _ -> risks
    end

    # Inactive high-value players (lots of gold or high level, but not logging in)
    risks = case Repo.query("""
      SELECT u.id, u.username, u.currency, DATEDIFF(NOW(), u.last_login) as days_away,
             (SELECT MAX(c.level) FROM characters c WHERE c.user_id=u.id) as max_level
      FROM users u
      WHERE u.is_banned=0
        AND u.last_login < NOW() - INTERVAL 7 DAY
        AND u.last_login > NOW() - INTERVAL 60 DAY
        AND (u.currency > 1000 OR EXISTS (SELECT 1 FROM characters c WHERE c.user_id=u.id AND c.level > 5))
      ORDER BY days_away ASC LIMIT 3
    """) do
      {:ok, %{rows: rows}} ->
        Enum.reduce(rows, risks, fn [id, name, gold, days, lvl], acc ->
          [%{icon: "👑", text: "#{name} (Lv#{lvl || 1}, #{gold || 0}g) hasn't played in #{days}d", type: "whale_inactive", user_id: id, severity: "high"} | acc]
        end)
      _ -> risks
    end

    risks |> Enum.take(8)
  end

  # ── Anomaly Detection ──────────────────────────────────────────

  defp detect_anomalies(online_players) do
    anomalies = []

    # Gold spike: anyone gained huge gold recently
    anomalies = case Repo.query("""
      SELECT u.id, u.username, u.currency,
             CAST(JSON_UNQUOTE(JSON_EXTRACT(el.detail_json, '$.amount')) AS SIGNED) as amt
      FROM game_event_log el
      JOIN users u ON u.id = el.actor_id
      WHERE el.event_type = 'gm_give_gold'
        AND el.created_at > NOW() - INTERVAL 1 HOUR
        AND CAST(JSON_UNQUOTE(JSON_EXTRACT(el.detail_json, '$.amount')) AS SIGNED) > 10000
      LIMIT 3
    """) do
      {:ok, %{rows: rows}} when rows != [] ->
        Enum.reduce(rows, anomalies, fn [id, name, gold, amt], acc ->
          [%{icon: "💰", text: "#{name} received #{amt}g in last hour (now has #{gold}g)", type: "gold_spike", severity: "high", user_id: id} | acc]
        end)
      _ -> anomalies
    end

    # Level jump: character leveled up suspiciously fast
    anomalies = case Repo.query("""
      SELECT c.id, c.name, c.level, c.experience, u.id as user_id
      FROM characters c JOIN users u ON u.id = c.user_id
      WHERE c.level > 1
      ORDER BY c.experience / GREATEST(c.level, 1) ASC LIMIT 3
    """) do
      {:ok, %{rows: rows}} ->
        Enum.reduce(rows, anomalies, fn [_cid, name, level, xp, uid], acc ->
          expected_xp = level_xp_requirement(level)
          if level > 3 and (xp || 0) < expected_xp * 0.3 do
            [%{icon: "⚡", text: "#{name} is Lv#{level} with only #{xp} XP — possible exploit", type: "level_suspect", severity: "medium", user_id: uid} | acc]
          else
            acc
          end
        end)
      _ -> anomalies
    end

    # Duplicate logins: same user on multiple characters simultaneously
    user_chars = Enum.group_by(online_players, fn p -> p[:user_id] end)
    anomalies = Enum.reduce(user_chars, anomalies, fn {uid, chars}, acc ->
      if length(chars) > 1 and uid do
        names = Enum.map(chars, & &1.name) |> Enum.join(", ")
        [%{icon: "👥", text: "User ##{uid} has #{length(chars)} chars online: #{names}", type: "multi_char", severity: "low", user_id: uid} | acc]
      else
        acc
      end
    end)

    # Economy inflation check
    anomalies = case Repo.query("SELECT AVG(currency) FROM users WHERE is_banned=0 AND currency > 0") do
      {:ok, %{rows: [[avg]]}} when not is_nil(avg) ->
        avg_val = safe_float(avg)
        if avg_val > 10000 do
          [%{icon: "📈", text: "Average player gold is #{round(avg_val)} — possible inflation", type: "inflation", severity: "medium", user_id: nil} | anomalies]
        else
          anomalies
        end
      _ -> anomalies
    end

    anomalies |> Enum.take(6)
  end

  # ── Predictive Scheduling ────────────────────────────────────────

  defp load_peak_hours do
    case Repo.query("""
      SELECT HOUR(last_login) as h, COUNT(*) as c
      FROM users
      WHERE last_login > NOW() - INTERVAL 7 DAY AND last_login IS NOT NULL
      GROUP BY h ORDER BY c DESC
    """) do
      {:ok, %{rows: rows}} when rows != [] ->
        max_count = rows |> Enum.map(fn [_, c] -> c end) |> Enum.max(fn -> 1 end)
        Enum.map(rows, fn [hour, count] ->
          %{hour: hour, count: count, pct: round(count / max(max_count, 1) * 100),
            label: "#{String.pad_leading(to_string(hour), 2, "0")}:00"}
        end)
        |> Enum.sort_by(& &1.hour)
      _ -> []
    end
  end

  # ── Mood Pulse ───────────────────────────────────────────────────

  @positive_words ~w(lol haha nice cool awesome great love fun thanks wow amazing good yes)
  @negative_words ~w(lag sucks hate broken bug stupid annoying boring bad die wtf ugh crash)
  @frustrated_words ~w(help stuck lost cant impossible unfair glitch)

  defp analyze_mood([]), do: nil
  defp analyze_mood(buffer) do
    texts = Enum.map(buffer, fn e -> String.downcase(e.text) end)
    total = length(texts)

    pos = Enum.count(texts, fn t -> Enum.any?(@positive_words, &String.contains?(t, &1)) end)
    neg = Enum.count(texts, fn t -> Enum.any?(@negative_words, &String.contains?(t, &1)) end)
    frust = Enum.count(texts, fn t -> Enum.any?(@frustrated_words, &String.contains?(t, &1)) end)

    score = ((pos - neg - frust * 0.5) / max(total, 1) * 50 + 50) |> round() |> max(0) |> min(100)

    %{
      score: score,
      positive: pos, negative: neg, frustrated: frust, total: total,
      label: cond do
        score >= 75 -> "Happy"
        score >= 55 -> "Neutral"
        score >= 35 -> "Uneasy"
        true -> "Frustrated"
      end,
      color: cond do
        score >= 75 -> "text-green-400"
        score >= 55 -> "text-zinc-400"
        score >= 35 -> "text-yellow-400"
        true -> "text-red-400"
      end
    }
  end

  # ── Narrative Thread ─────────────────────────────────────────────

  defp generate_narrative_thread do
    # Gather recent events to build a story from
    recent = case Repo.query("""
      SELECT event_type, actor_name, target_name, detail_json, created_at
      FROM game_event_log
      WHERE created_at > NOW() - INTERVAL 24 HOUR
      ORDER BY created_at DESC LIMIT 20
    """) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [type, actor, target, _detail, _ts] ->
          "#{type}: #{actor || "unknown"}#{if target, do: " → #{target}", else: ""}"
        end) |> Enum.join("; ")
      _ -> "quiet day, no events"
    end

    players = PlayerRegistry.all()
    player_summary = if players == [] do
      "No players online."
    else
      names = Enum.map(players, fn p -> "#{p.name} (Lv#{p.level})" end) |> Enum.take(10) |> Enum.join(", ")
      "Online: #{names}"
    end

    # Active sagas
    saga_text = case Repo.query("SELECT name, villain_name FROM game_sagas WHERE status='active' LIMIT 1") do
      {:ok, %{rows: [[name, villain]]}} -> "Active saga: #{name}, villain: #{villain}"
      _ -> "No active saga"
    end

    prompt = """
    You are the narrator of a dark Celtic fantasy MMO world. Write a short (3-4 sentence) "world pulse" — a narrative summary of what's happening in the game world RIGHT NOW based on real data.

    REAL GAME STATE:
    - #{player_summary}
    - Recent events (last 24h): #{String.slice(recent, 0, 400)}
    - #{saga_text}
    - Time: #{Calendar.strftime(DateTime.utc_now(), "%H:%M UTC")}

    Write in present tense, atmospheric, ominous Celtic fantasy tone. Reference actual player names and events. Make it feel like a living world. Don't mention game mechanics — describe it as if narrating a novel. Under 80 words.
    """

    ai_config = TePhoenix.NpcBrain.load_ai_config()
    case call_narrative_ai(prompt, ai_config) do
      {:ok, text} -> text
      _ ->
        # Fallback
        if players == [] do
          "The realm lies still beneath a bruised sky. No warriors walk the ancient paths tonight. The standing stones hum with dormant power, waiting."
        else
          hero = List.first(players)
          "#{hero.name} moves through the shadows of the moorland. The blood oghams flicker with distant warnings. Something stirs in the deep places of the world."
        end
    end
  end

  defp call_narrative_ai(prompt, config) do
    provider = config["provider"] || config[:provider]
    api_key = config["apiKey"] || config[:api_key] || ""
    model = config["model"] || config[:model] || ""

    if provider == "anthropic" and api_key != "" do
      url = "https://api.anthropic.com/v1/messages"
      m = if model != "", do: model, else: "claude-haiku-4-5-20251001"
      headers = [{"x-api-key", api_key}, {"anthropic-version", "2023-06-01"}, {"content-type", "application/json"}]
      body = Jason.encode!(%{model: m, max_tokens: 200, temperature: 0.9, messages: [%{role: "user", content: prompt}]})
      case :httpc.request(:post, {~c"#{url}", Enum.map(headers, fn {k,v} -> {String.to_charlist(k), String.to_charlist(v)} end), ~c"application/json", String.to_charlist(body)}, [{:timeout, 15_000}], []) do
        {:ok, {{_, 200, _}, _, resp}} ->
          case Jason.decode(to_string(resp)) do
            {:ok, json} -> {:ok, get_in(json, ["content", Access.at(0), "text"]) |> to_string() |> String.trim()}
            _ -> nil
          end
        _ -> nil
      end
    else
      nil
    end
  end

  defp role_badge_classes(role) do
    case role do
      r when r in ["OWNER", "ADMIN"] -> "bg-red-900/50 text-red-400 border-red-800"
      "GM" -> "bg-purple-900/50 text-purple-400 border-purple-800"
      "MOD" -> "bg-blue-900/50 text-blue-400 border-blue-800"
      _ -> "bg-zinc-800 text-zinc-400 border-zinc-700"
    end
  end

  defp ai_active?(provider) do
    provider not in [nil, "", "disabled", "none"]
  end

  # ── Sparkline SVG builder ─────────────────────────────────────

  defp sparkline_svg(trend) do
    max_val = trend |> Enum.map(& &1.count) |> Enum.max() |> max(1)
    w = 280
    h = 56
    pad = 4
    len = length(trend)
    step = if len > 1, do: (w - pad * 2) / (len - 1), else: 0

    points =
      trend
      |> Enum.with_index()
      |> Enum.map(fn {entry, i} ->
        x = pad + i * step
        y = pad + (h - pad * 2) * (1 - entry.count / max(max_val, 1))
        {Float.round(x * 1.0, 1), Float.round(y * 1.0, 1)}
      end)

    polyline =
      points |> Enum.map(fn {x, y} -> "#{x},#{y}" end) |> Enum.join(" ")

    {first_x, _} = List.first(points)
    {last_x, _} = List.last(points)
    area = "#{first_x},#{h} " <> polyline <> " #{last_x},#{h}"

    circles =
      points
      |> Enum.map(fn {x, y} ->
        "<circle cx=\"#{x}\" cy=\"#{y}\" r=\"2.5\" fill=\"#f59e0b\" />"
      end)
      |> Enum.join("\n")

    """
    <svg viewBox="0 0 #{w} #{h}" class="w-full" style="height: 56px;">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.3" />
          <stop offset="100%" stop-color="#f59e0b" stop-opacity="0" />
        </linearGradient>
      </defs>
      <polygon points="#{area}" fill="url(#sg)" />
      <polyline points="#{polyline}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linejoin="round" />
      #{circles}
    </svg>
    """
  end

  # ── Bar percentage helper ────────────────────────────────────

  defp bar_pct(_count, []), do: 0

  defp bar_pct(count, map_population) do
    max_val = map_population |> Enum.map(fn {_name, c} -> c end) |> Enum.max(fn -> 1 end)
    if max_val > 0, do: round(count / max_val * 100), else: 0
  end

  # ── Render ────────────────────────────────────────────────────

  @impl true
  def render(assigns) do
    assigns = assign(assigns, :sparkline_html, sparkline_svg(assigns.signup_trend))

    ~H"""
    <div class="space-y-6">
      <%!-- Header --%>
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 class="text-2xl font-bold text-amber-400">Live Dashboard</h2>
          <p class="text-xs text-zinc-500 mt-0.5">Auto-refreshes every 10s</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <%!-- AI Status Pill --%>
          <span class={[
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
            if(ai_active?(@ai_provider),
              do: "bg-green-900/50 text-green-400 border border-green-800",
              else: "bg-zinc-800 text-zinc-500 border border-zinc-700"
            )
          ]}>
            <span class={[
              "w-1.5 h-1.5 rounded-full",
              if(ai_active?(@ai_provider), do: "bg-green-400 animate-pulse", else: "bg-zinc-500")
            ]} />
            {if ai_active?(@ai_provider), do: @ai_provider, else: "AI Disabled"}
          </span>
          <%!-- Open Reports Badge --%>
          <span
            :if={@open_reports > 0}
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/50 text-red-400 border border-red-800"
          >
            {@open_reports} open report{if @open_reports != 1, do: "s", else: ""}
          </span>
        </div>
      </div>

      <%!-- Stat Cards 4x2 Grid --%>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div class="text-2xl mb-1.5">&#x1F7E2;</div>
          <div :if={@online_count > 0} class="flex items-center justify-center gap-1.5 mb-0.5">
            <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          </div>
          <div class="text-2xl font-bold font-mono text-green-400">{@online_count}</div>
          <div class="text-[10px] text-zinc-500 uppercase tracking-wide mt-0.5">Online Now</div>
        </div>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div class="text-2xl mb-1.5">&#x1F465;</div>
          <div class="text-2xl font-bold font-mono text-amber-400">{@total_users}</div>
          <div class="text-[10px] text-zinc-500 uppercase tracking-wide mt-0.5">Accounts</div>
        </div>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div class="text-2xl mb-1.5">&#x2694;&#xFE0F;</div>
          <div class="text-2xl font-bold font-mono text-blue-400">{@total_chars}</div>
          <div class="text-[10px] text-zinc-500 uppercase tracking-wide mt-0.5">Characters</div>
        </div>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div class="text-2xl mb-1.5">&#x1F5FA;&#xFE0F;</div>
          <div class="text-2xl font-bold font-mono text-orange-400">{@total_maps}</div>
          <div class="text-[10px] text-zinc-500 uppercase tracking-wide mt-0.5">Active Maps</div>
        </div>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div class="text-2xl mb-1.5">&#x1F479;</div>
          <div class="text-2xl font-bold font-mono text-green-400">{@total_npcs}</div>
          <div class="text-[10px] text-zinc-500 uppercase tracking-wide mt-0.5">NPCs</div>
        </div>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div class="text-2xl mb-1.5">&#x1F4E6;</div>
          <div class="text-2xl font-bold font-mono text-red-400">{@total_items}</div>
          <div class="text-[10px] text-zinc-500 uppercase tracking-wide mt-0.5">Items</div>
        </div>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div class="text-2xl mb-1.5">&#x2694;&#xFE0F;</div>
          <div class="text-2xl font-bold font-mono text-rose-400">{@battles_today}</div>
          <div class="text-[10px] text-zinc-500 uppercase tracking-wide mt-0.5">Battles Today</div>
        </div>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div class="text-2xl mb-1.5">&#x1F4B0;</div>
          <div class="text-2xl font-bold font-mono text-yellow-500">{format_gold(@world_gold)}</div>
          <div class="text-[10px] text-zinc-500 uppercase tracking-wide mt-0.5">World Gold</div>
        </div>
      </div>

      <%!-- Game Director AI --%>
      <div class="bg-zinc-900 border border-amber-800/30 rounded-xl p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <span class="text-xl">🧠</span>
            <div>
              <h3 class="text-sm font-bold text-amber-400 uppercase tracking-wider">Game Director</h3>
              <p class="text-[10px] text-zinc-500">AI analyzes live game state and suggests GM actions</p>
            </div>
          </div>
          <div class="flex gap-2 items-center">
            <button phx-click="toggle_auto_pilot"
              class={["px-3 py-1.5 rounded text-xs font-medium transition-colors",
                @auto_pilot && "bg-green-700 hover:bg-green-600 text-white",
                !@auto_pilot && "bg-zinc-800 hover:bg-zinc-700 text-zinc-400"]}>
              {if @auto_pilot, do: "🤖 Auto-Pilot ON", else: "🤖 Auto-Pilot"}
            </button>
            <button phx-click="director_fallback" class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs">Quick Scan</button>
            <button phx-click="ask_director" disabled={@director_loading}
              class={["px-3 py-1.5 rounded text-xs font-medium transition-colors",
                @director_loading && "bg-zinc-700 text-zinc-500 cursor-wait",
                !@director_loading && "bg-amber-600 hover:bg-amber-500 text-white"]}>
              {if @director_loading, do: "Thinking...", else: "Ask AI"}
            </button>
          </div>
        </div>

        <div :if={@director_loading} class="flex items-center gap-2 py-6 justify-center">
          <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          <span class="text-xs text-zinc-400">Analyzing game state...</span>
        </div>

        <div :if={@director_error} class="px-4 py-2 bg-red-900/20 border border-red-800/30 rounded text-xs text-red-400 mb-3">
          {@director_error}
        </div>

        <div :if={@director_suggestions != [] && !@director_loading} class="space-y-2">
          <%= for {suggestion, idx} <- Enum.with_index(@director_suggestions) do %>
          <div class="flex items-start gap-3 px-4 py-3 rounded-lg bg-zinc-950/50 border border-zinc-800/50 hover:border-amber-800/30 transition-colors group">
            <div class="flex items-center gap-2 shrink-0">
              <span class={["text-[10px] font-bold w-5 h-5 rounded flex items-center justify-center",
                suggestion.priority >= 4 && "bg-red-900/50 text-red-400",
                suggestion.priority == 3 && "bg-amber-900/50 text-amber-400",
                suggestion.priority <= 2 && "bg-zinc-800 text-zinc-400"]}>
                {suggestion.priority}
              </span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-zinc-200">{suggestion.title}</div>
              <div class="text-xs text-zinc-400 mt-0.5">{suggestion.description}</div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class={["text-[10px] px-2 py-0.5 rounded",
                suggestion.action =~ "tournament" && "bg-red-900/30 text-red-400",
                suggestion.action =~ "boss" && "bg-purple-900/30 text-purple-400",
                suggestion.action =~ "event" && "bg-blue-900/30 text-blue-400",
                suggestion.action =~ "xp" && "bg-green-900/30 text-green-400",
                suggestion.action =~ "gold" && "bg-amber-900/30 text-amber-400",
                suggestion.action =~ "broadcast" && "bg-zinc-800 text-zinc-400",
                suggestion.action =~ "weather" && "bg-cyan-900/30 text-cyan-400",
                suggestion.action =~ "raid" && "bg-orange-900/30 text-orange-400",
                !(suggestion.action =~ "tournament|boss|event|xp|gold|broadcast|weather|raid") && "bg-zinc-800 text-zinc-400"]}>
                {suggestion.action}
              </span>
              <button phx-click="execute_action" phx-value-action={suggestion.action} phx-value-title={suggestion.title}
                data-confirm={"Execute: #{suggestion.title}?"}
                class="px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                ▶ Fire
              </button>
            </div>
          </div>
          <% end %>
        </div>

        <div :if={@director_suggestions == [] && !@director_loading && !@director_error}
          class="text-xs text-zinc-600 py-6 text-center">
          Click <span class="text-amber-400">Ask AI</span> for AI-powered suggestions or <span class="text-zinc-400">Quick Scan</span> for rule-based analysis
        </div>
      </div>

      <%!-- Engagement Score + Player Callouts + Retention Risks --%>
      <div class="grid md:grid-cols-3 gap-4">
        <%!-- Engagement Score --%>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-3">
            Server Health
          </h3>
          <div class="flex items-center justify-center mb-3">
            <div class="relative w-24 h-24">
              <svg viewBox="0 0 36 36" class="w-24 h-24 -rotate-90">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="#27272a" stroke-width="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke={cond do
                    @engagement_score >= 70 -> "#22c55e"
                    @engagement_score >= 40 -> "#f59e0b"
                    true -> "#ef4444"
                  end}
                  stroke-width="3"
                  stroke-dasharray={"#{@engagement_score}, 100"}
                  stroke-linecap="round" />
              </svg>
              <div class="absolute inset-0 flex items-center justify-center">
                <span class={"text-2xl font-bold font-mono #{cond do
                  @engagement_score >= 70 -> "text-green-400"
                  @engagement_score >= 40 -> "text-amber-400"
                  true -> "text-red-400"
                end}"}>{@engagement_score}</span>
              </div>
            </div>
          </div>
          <div class="text-center text-[10px] text-zinc-500 uppercase">
            {cond do
              @engagement_score >= 80 -> "Thriving"
              @engagement_score >= 60 -> "Healthy"
              @engagement_score >= 40 -> "Moderate"
              @engagement_score >= 20 -> "Quiet"
              true -> "Dormant"
            end}
          </div>
          <div class="mt-3 space-y-1 text-[10px]">
            <div class="flex justify-between"><span class="text-zinc-500">Online</span><span class="text-zinc-300">{@online_count}/{@total_users}</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Battles today</span><span class="text-zinc-300">{@battles_today}</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Active maps</span><span class="text-zinc-300">{length(@map_population)}</span></div>
          </div>
        </div>

        <%!-- Player Callouts --%>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-3">
            Player Callouts
          </h3>
          <div class="space-y-1.5 max-h-56 overflow-y-auto">
            <div :for={c <- @player_callouts} class="flex items-center gap-2 py-1.5 border-b border-zinc-800/50 last:border-0">
              <span class="text-sm shrink-0">{c.icon}</span>
              <span class="text-xs text-zinc-300 flex-1">{c.text}</span>
              <a :if={c[:user_id]} href={~p"/sauce/players/#{c.user_id}"} class="text-[10px] text-amber-500 hover:text-amber-400 shrink-0">View</a>
            </div>
            <div :if={@player_callouts == []} class="text-xs text-zinc-600 py-4 text-center">
              {if @online_count == 0, do: "No players online", else: "No callouts right now"}
            </div>
          </div>
        </div>

        <%!-- Retention Risks --%>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-3">
            Retention Risks
          </h3>
          <div class="space-y-1.5 max-h-56 overflow-y-auto">
            <div :for={r <- @retention_risks} class="flex items-center gap-2 py-1.5 border-b border-zinc-800/50 last:border-0">
              <span class="text-sm shrink-0">{r.icon}</span>
              <span class="text-xs text-zinc-300 flex-1">{r.text}</span>
              <span class={["text-[10px] px-1.5 py-0.5 rounded shrink-0",
                r[:severity] == "high" && "bg-red-900/50 text-red-400",
                r[:severity] == "medium" && "bg-yellow-900/50 text-yellow-400",
                r[:severity] != "high" && r[:severity] != "medium" && "bg-zinc-800 text-zinc-400"]}>{r[:severity] || "low"}</span>
              <a :if={r[:user_id]} href={~p"/sauce/players/#{r.user_id}"} class="text-[10px] text-amber-500 hover:text-amber-400 shrink-0">View</a>
            </div>
            <div :if={@retention_risks == []} class="text-xs text-zinc-600 py-4 text-center">No at-risk players detected</div>
          </div>
        </div>
      </div>

      <%!-- Anomalies + Mood Pulse + Peak Hours + Narrative --%>
      <div class="grid md:grid-cols-4 gap-4">
        <%!-- Anomaly Detection --%>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-3">
            <span class="text-amber-400">⚠</span> Anomalies
          </h3>
          <div class="space-y-1.5 max-h-48 overflow-y-auto">
            <div :for={a <- @anomalies} class="flex items-center gap-2 py-1 border-b border-zinc-800/50 last:border-0">
              <span class="text-sm shrink-0">{a.icon}</span>
              <span class="text-xs text-zinc-300 flex-1">{a.text}</span>
              <span class={["text-[10px] px-1 py-0.5 rounded shrink-0",
                a.severity == "high" && "bg-red-900/50 text-red-400",
                a.severity == "medium" && "bg-yellow-900/50 text-yellow-400",
                a.severity == "low" && "bg-zinc-800 text-zinc-500"]}>{a.severity}</span>
            </div>
            <div :if={@anomalies == []} class="text-xs text-zinc-600 py-3 text-center">No anomalies detected</div>
          </div>
        </div>

        <%!-- Mood Pulse --%>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-3">
            Mood Pulse
          </h3>
          <div :if={@mood_score} class="text-center mb-3">
            <div class={"text-3xl font-bold font-mono #{@mood_score.color}"}>{@mood_score.score}</div>
            <div class={"text-xs font-medium #{@mood_score.color}"}>{@mood_score.label}</div>
          </div>
          <div :if={@mood_score} class="space-y-1 text-[10px]">
            <div class="flex justify-between"><span class="text-zinc-500">Messages analyzed</span><span class="text-zinc-300">{@mood_score.total}</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Positive</span><span class="text-green-400">{@mood_score.positive}</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Negative</span><span class="text-red-400">{@mood_score.negative}</span></div>
            <div class="flex justify-between"><span class="text-zinc-500">Frustrated</span><span class="text-yellow-400">{@mood_score.frustrated}</span></div>
          </div>
          <div :if={!@mood_score} class="text-xs text-zinc-600 py-4 text-center">
            Listening to chat...<br/>Score appears after messages arrive
          </div>
        </div>

        <%!-- Peak Hours --%>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-3">
            Peak Hours (7d)
          </h3>
          <div :if={@peak_hours != []} class="space-y-0.5">
            <%= for h <- @peak_hours |> Enum.sort_by(& &1.count, :desc) |> Enum.take(8) do %>
            <div class="flex items-center gap-2">
              <span class="text-[10px] text-zinc-500 w-10 font-mono">{h.label}</span>
              <div class="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div class={"h-full rounded-full #{if h.pct > 60, do: "bg-amber-500", else: "bg-zinc-600"}"} style={"width: #{h.pct}%"} />
              </div>
              <span class="text-[10px] text-zinc-400 w-6 text-right font-mono">{h.count}</span>
            </div>
            <% end %>
          </div>
          <div :if={@peak_hours != []} class="mt-2 pt-2 border-t border-zinc-800">
            <% best = Enum.max_by(@peak_hours, & &1.count, fn -> %{label: "N/A", count: 0} end) %>
            <div class="text-[10px] text-amber-400">Best time for events: <span class="font-bold">{best.label} UTC</span></div>
          </div>
          <div :if={@peak_hours == []} class="text-xs text-zinc-600 py-3 text-center">Not enough login data yet</div>
        </div>

        <%!-- Narrative Thread --%>
        <div class="bg-zinc-900 border border-amber-800/20 rounded-xl p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <span class="text-amber-400">📖</span> World Pulse
            </h3>
            <button phx-click="generate_narrative" disabled={@narrative_loading}
              class={["text-[10px] px-2 py-1 rounded transition-colors",
                @narrative_loading && "text-zinc-600",
                !@narrative_loading && "text-amber-500 hover:text-amber-400 bg-zinc-800 hover:bg-zinc-700"]}>
              {if @narrative_loading, do: "Writing...", else: "Generate"}
            </button>
          </div>
          <div :if={@narrative_loading} class="flex items-center gap-2 py-4 justify-center">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
            <span class="text-[10px] text-zinc-500">The narrator speaks...</span>
          </div>
          <div :if={@narrative} class="text-xs text-zinc-300 italic leading-relaxed">{@narrative}</div>
          <div :if={!@narrative && !@narrative_loading} class="text-xs text-zinc-600 py-4 text-center italic">
            Click Generate for an AI-narrated world pulse based on live game state
          </div>
        </div>
      </div>

      <%!-- Live State Context (collapsible) --%>
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <button phx-click="toggle_live_state" class="w-full px-5 py-3 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
          <h3 class="text-sm font-medium text-zinc-500 flex items-center gap-2">
            <span>📊</span> Live Game State Context
            <span class="text-[10px] text-zinc-600">(what the AI sees)</span>
          </h3>
          <span class="text-xs text-zinc-600">{if @live_state, do: "▼", else: "▶"}</span>
        </button>
        <div :if={@live_state} class="px-5 pb-4 border-t border-zinc-800">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <div>
              <div class="text-[10px] text-zinc-500 uppercase mb-1">Online ({@live_state.online_count})</div>
              <div class="text-xs text-zinc-300 space-y-0.5 max-h-32 overflow-y-auto">
                <div :for={m <- @live_state.by_map} class="flex justify-between">
                  <span>{m.name}</span>
                  <span class="text-zinc-500">{m.count}p · Lv{Enum.join(m.levels, ",")}</span>
                </div>
                <div :if={@live_state.by_map == []} class="text-zinc-600 italic">Empty</div>
              </div>
            </div>
            <div>
              <div class="text-[10px] text-zinc-500 uppercase mb-1">Level Clusters</div>
              <div class="text-xs text-zinc-300 space-y-0.5">
                <div :for={{range, count} <- @live_state.level_clusters} class="flex justify-between">
                  <span>{range}</span><span class="text-amber-400">{count}</span>
                </div>
                <div :if={@live_state.level_clusters == []} class="text-zinc-600 italic">No players</div>
              </div>
            </div>
            <div>
              <div class="text-[10px] text-zinc-500 uppercase mb-1">Economy</div>
              <div class="text-xs text-zinc-300 space-y-0.5">
                <div class="flex justify-between"><span>Avg gold</span><span class="text-amber-400">{@live_state.avg_gold}</span></div>
                <div class="flex justify-between"><span>Battles/hr</span><span>{@live_state.battles_hour}</span></div>
              </div>
            </div>
            <div>
              <div class="text-[10px] text-zinc-500 uppercase mb-1">World Events</div>
              <div class="text-xs text-zinc-300 space-y-0.5">
                <div :for={e <- @live_state.active_events} class="truncate">{e}</div>
                <div :if={@live_state.active_events == []} class="text-zinc-600 italic">None active</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <%!-- Row 2: Online Players + Signup Trend --%>
      <div class="grid md:grid-cols-2 gap-4">
        <%!-- Online Players grouped by map --%>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-3">
            <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Online ({@online_count})
          </h3>
          <div class="space-y-3 max-h-64 overflow-y-auto">
            <div :if={@online_by_map == []} class="text-sm text-zinc-600 py-6 text-center">
              No players online
            </div>
            <div :for={{map_name, players} <- @online_by_map}>
              <p class="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{map_name}</p>
              <div
                :for={p <- players}
                class="flex items-center justify-between py-1.5 border-b border-zinc-800/50 last:border-0"
              >
                <span class="flex items-center gap-2 text-sm text-zinc-300">
                  <span class="w-1.5 h-1.5 rounded-full bg-green-500" />
                  {p.name}
                </span>
                <span class="text-xs text-zinc-500 font-mono">Lv{p.level}</span>
              </div>
            </div>
          </div>
        </div>

        <%!-- Signup Trend Sparkline --%>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-3">
            New Accounts &mdash; Last 7 Days
          </h3>
          <div>
            {Phoenix.HTML.raw(@sparkline_html)}
            <div class="flex justify-between mt-1">
              <div
                :for={entry <- @signup_trend}
                class="text-center"
                style={"width: #{100 / max(length(@signup_trend), 1)}%"}
              >
                <div class="text-[10px] font-mono text-amber-400">
                  {if entry.count > 0, do: entry.count, else: ""}
                </div>
                <div class="text-[9px] text-zinc-500">{entry.day}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <%!-- Row 3: Retention + Map Population + Top Characters --%>
      <div class="grid md:grid-cols-3 gap-4">
        <%!-- Retention --%>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-3">
            Retention
          </h3>
          <div class="space-y-4">
            <div>
              <div class="flex justify-between text-xs text-zinc-500 mb-1">
                <span>Tutorial done</span>
                <span class="font-mono text-zinc-300">{@tutorial_rate}%</span>
              </div>
              <div class="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div class="h-full bg-blue-500 rounded-full" style={"width: #{@tutorial_rate}%"} />
              </div>
            </div>
            <div class="space-y-1 pt-2 border-t border-zinc-800">
              <div class="flex justify-between text-xs">
                <span class="text-zinc-500">Avg streak</span>
                <span class="font-mono text-yellow-400">{@streak_stats.avg_streak} days</span>
              </div>
              <div class="flex justify-between text-xs">
                <span class="text-zinc-500">Best streak</span>
                <span class="font-mono text-yellow-400">{@streak_stats.max_streak} days</span>
              </div>
              <div class="flex justify-between text-xs">
                <span class="text-zinc-500">Active streakers</span>
                <span class="font-mono text-zinc-300">{@streak_stats.streak_players}</span>
              </div>
            </div>
          </div>
        </div>

        <%!-- Map Population --%>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-3">
            Map Population
          </h3>
          <div class="space-y-3">
            <div :if={@map_population == []} class="text-xs text-zinc-600 text-center py-4">
              No players online
            </div>
            <div :for={{map_name, count} <- @map_population}>
              <div class="flex justify-between text-xs mb-1">
                <span class="text-zinc-500 truncate max-w-[140px]">{map_name}</span>
                <span class="font-mono text-zinc-300">{count}</span>
              </div>
              <div class="flex items-center gap-2 w-full">
                <div class="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-orange-500 rounded-full"
                    style={"width: #{bar_pct(count, @map_population)}%"}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <%!-- Top Characters --%>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-3">
            Top Characters
          </h3>
          <div class="space-y-1">
            <div :if={@top_chars == []} class="text-sm text-zinc-600 py-4 text-center">
              No characters yet
            </div>
            <a
              :for={{char, idx} <- Enum.with_index(@top_chars)}
              href={~p"/sauce/players/#{char.user_id}"}
              class="flex items-center justify-between py-1.5 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 rounded px-1 -mx-1 transition-colors cursor-pointer"
            >
              <span class="flex items-center gap-2">
                <span class="text-zinc-500 text-xs w-4">#{idx + 1}</span>
                <div>
                  <div class="leading-tight"><.styled_name name={char.name} role={char.role} chat_color={char.chat_color} class="text-sm font-medium" /></div>
                  <div class="text-[10px] text-zinc-500">{char.username}</div>
                </div>
              </span>
              <span class="text-yellow-500 font-mono text-sm">Lv{char.level}</span>
            </a>
          </div>
        </div>
      </div>

      <%!-- Row 4: Economy Pulse + Admin Actions + Alerts --%>
      <div class="grid md:grid-cols-3 gap-4">
        <%!-- Economy Pulse --%>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-3">
            Economy Pulse (Today)
          </h3>
          <div class="space-y-2">
            <div class="flex justify-between text-xs">
              <span class="text-zinc-500">Gold earned (battles)</span>
              <span class="font-mono text-green-400">+{format_gold(@gold_earned_today)}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-zinc-500">Gold spent (shops)</span>
              <span class="font-mono text-red-400">-{format_gold(@gold_spent_today)}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-zinc-500">GM gold grants</span>
              <span class="font-mono text-amber-400">{if @gold_gm_today >= 0, do: "+", else: ""}{format_gold(@gold_gm_today)}</span>
            </div>
            <div class="border-t border-zinc-800 pt-2 mt-2">
              <div class="flex justify-between text-xs">
                <span class="text-zinc-500">Net flow</span>
                <% net = @gold_earned_today + @gold_gm_today - @gold_spent_today %>
                <span class={"font-mono font-bold #{if net >= 0, do: "text-green-400", else: "text-red-400"}"}>
                  {if net >= 0, do: "+", else: ""}{format_gold(net)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <%!-- Active Alerts --%>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-3">
            Alerts
          </h3>
          <div class="space-y-2">
            <div :if={@maintenance_mode} class="flex items-center gap-2 px-3 py-2 bg-red-900/30 border border-red-800/50 rounded text-xs text-red-400">
              <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              Maintenance Mode ACTIVE
            </div>
            <div :if={@open_reports > 0} class="flex items-center gap-2 px-3 py-2 bg-orange-900/30 border border-orange-800/50 rounded text-xs text-orange-400">
              {@open_reports} open player report{if @open_reports != 1, do: "s", else: ""}
            </div>
            <div :if={@banned_today > 0} class="flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-800/30 rounded text-xs text-red-400/80">
              {@banned_today} player{if @banned_today != 1, do: "s", else: ""} banned today
            </div>
            <div :if={@warnings_today > 0} class="flex items-center gap-2 px-3 py-2 bg-yellow-900/20 border border-yellow-800/30 rounded text-xs text-yellow-400/80">
              {@warnings_today} warning{if @warnings_today != 1, do: "s", else: ""} issued today
            </div>
            <div :if={!@maintenance_mode && @open_reports == 0 && @banned_today == 0 && @warnings_today == 0}
              class="text-xs text-zinc-600 py-4 text-center">All clear</div>
          </div>
        </div>

        <%!-- Recent Admin Actions --%>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-3">
            Admin Activity
          </h3>
          <div class="space-y-1 max-h-48 overflow-y-auto">
            <div :for={action <- @recent_admin_actions} class="flex items-center gap-2 py-1 border-b border-zinc-800/50 last:border-0">
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-amber-400/80 font-mono shrink-0">
                {action.type |> String.replace("gm_", "")}
              </span>
              <span class="text-xs text-zinc-400 truncate flex-1">
                {action.actor || "System"}
                <span :if={action.target} class="text-zinc-500"> → {action.target}</span>
              </span>
              <span class="text-[10px] text-zinc-600 shrink-0">{format_datetime(action.timestamp)}</span>
            </div>
            <div :if={@recent_admin_actions == []} class="text-xs text-zinc-600 py-4 text-center">No recent GM actions</div>
          </div>
        </div>
      </div>

      <%!-- Row 5: Recent Accounts Table --%>
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-3">
          Recent Accounts
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-zinc-800 text-left">
                <th class="pb-2 text-xs text-zinc-500 font-medium pr-4">Username</th>
                <th class="pb-2 text-xs text-zinc-500 font-medium pr-4">Role</th>
                <th class="pb-2 text-xs text-zinc-500 font-medium pr-4">Joined</th>
                <th class="pb-2 text-xs text-zinc-500 font-medium pr-4">Last Login</th>
                <th class="pb-2 text-xs text-zinc-500 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr :if={@recent_users == []}>
                <td colspan="5" class="py-4 text-center text-zinc-600 text-sm">No accounts yet</td>
              </tr>
              <tr
                :for={user <- @recent_users}
                class="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 cursor-pointer transition-colors"
              >
                <td class="py-2 pr-4"><a href={~p"/sauce/players/#{user.id}"} class="hover:underline"><.styled_name name={user.username} role={user.role} chat_color={user.chat_color} class="font-medium" /></a></td>
                <td class="py-2 pr-4">
                  <span class={"text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase #{role_badge_classes(user.role)}"}>
                    {user.role}
                  </span>
                </td>
                <td class="py-2 text-xs text-zinc-500 pr-4">{format_date(user.created_at)}</td>
                <td class="py-2 text-xs text-zinc-500 pr-4">{format_datetime(user.last_login)}</td>
                <td class="py-2">
                  <span
                    :if={user.is_banned}
                    class="text-[10px] px-1.5 py-0.5 rounded bg-red-900/30 text-red-400 border border-red-800/50"
                  >
                    Banned
                  </span>
                  <span
                    :if={!user.is_banned}
                    class="text-[10px] px-1.5 py-0.5 rounded bg-green-900/30 text-green-500 border border-green-900"
                  >
                    Active
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    """
  end
end
