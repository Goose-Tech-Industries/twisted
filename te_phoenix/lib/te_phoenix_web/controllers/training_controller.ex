defmodule TePhoenixWeb.TrainingController do
  @moduledoc """
  Hyperbolic Training Chamber endpoints.

  Phoenix already runs `TePhoenix.Training` GenServer-style training
  sessions through the game channel; this controller exposes a thin
  REST surface so the SvelteKit player can boot the panel without a
  channel round-trip.

    GET  /api/htc/config         → list of training types from game_training_config
    GET  /api/htc/:char_id       → currently active session (or null)
  """

  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  def config(conn, _params) do
    case Repo.query(
      """
      SELECT id, name, label, description, training_type, daily_limit,
             cooldown_minutes, requires_partner, requires_master, min_level,
             gravity_multiplier, weighted_clothing_bonus
        FROM game_training_config
       WHERE active = 1
       ORDER BY min_level, id
      """
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        costs = Enum.map(rows, fn row ->
          m = Enum.zip(cols, row) |> Map.new()
          %{
            tier: m["name"],
            label: m["label"],
            description: m["description"],
            training_type: m["training_type"],
            multiplier: cond do
              m["gravity_multiplier"] && m["gravity_multiplier"] > 0 ->
                1 + m["gravity_multiplier"] * 0.5
              m["weighted_clothing_bonus"] && m["weighted_clothing_bonus"] > 0 ->
                1 + m["weighted_clothing_bonus"]
              true -> 1.0
            end,
            duration_secs: max(60, m["cooldown_minutes"] * 60),
            gold: 0,  # most training is free; specific zones charge through other systems
            daily_limit: m["daily_limit"],
            requires_partner: m["requires_partner"] == 1,
            requires_master: m["requires_master"] == 1,
            min_level: m["min_level"]
          }
        end)
        json(conn, %{success: true, config: %{costs: costs}})

      _ ->
        json(conn, %{success: true, config: %{costs: []}})
    end
  end

  def session(conn, %{"char_id" => char_id}) do
    user_id = conn.assigns.user_id

    # Verify ownership.
    case Repo.query("SELECT id FROM characters WHERE id = ? AND user_id = ?", [char_id, user_id]) do
      {:ok, %{rows: [_]}} ->
        # The most-recent training log entry that hasn't ended yet.
        case Repo.query(
          """
          SELECT tl.id, tl.training_type, tl.started_at, tl.ended_at, tl.stat_gains_json
            FROM character_training_log tl
           WHERE tl.character_id = ? AND tl.ended_at IS NULL
           ORDER BY tl.started_at DESC
           LIMIT 1
          """,
          [char_id]
        ) do
          {:ok, %{rows: [[id, ttype, started, ended, _gains]]}} when not is_nil(started) ->
            ends_at = ended || NaiveDateTime.add(started, 3600)
            remaining = max(0, NaiveDateTime.diff(ends_at, NaiveDateTime.utc_now()))

            json(conn, %{
              success: true,
              session: %{
                id: id,
                charId: char_id,
                started_at: started,
                ends_at: ends_at,
                multiplier: 1.0,
                remaining_secs: remaining,
                training_type: ttype
              }
            })

          _ ->
            json(conn, %{success: true, session: nil})
        end

      _ ->
        json(conn, %{success: false, session: nil})
    end
  end

  # ── START ─────────────────────────────────────────────────────────
  # Run one training tick of the given tier. The schema treats
  # `character_training_log` as an event log (one row per completed
  # tick), not a long-running session — so each click adds a row, runs
  # the configured stat gains, and returns immediately. Daily-limit
  # enforcement comes from game_training_config.daily_limit.
  def start(conn, %{"tier" => tier}) do
    user_id = conn.assigns.user_id

    case Repo.query("SELECT id FROM characters WHERE user_id = ? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        case Repo.query(
          "SELECT id, training_type, stat_gains, daily_limit FROM game_training_config WHERE name = ? AND active = 1",
          [tier]
        ) do
          {:ok, %{rows: [[_cfg_id, ttype, gains_json, daily_limit]]}} ->
            do_train_tick(conn, char_id, ttype, gains_json, daily_limit)

          _ ->
            json(conn, %{success: false, message: "Unknown training tier."})
        end

      _ ->
        json(conn, %{success: false, message: "No character."})
    end
  rescue
    e -> json(conn, %{success: false, message: "Start failed: #{Exception.message(e)}"})
  end

  def start(conn, _), do: json(conn, %{success: false, message: "tier required."})

  defp do_train_tick(conn, char_id, ttype, gains_json, daily_limit) do
    today_count =
      case Repo.query(
        "SELECT COUNT(*) FROM character_training_log WHERE character_id = ? AND training_type = ? AND DATE(trained_at) = CURDATE()",
        [char_id, ttype]
      ) do
        {:ok, %{rows: [[n]]}} -> n
        _ -> 0
      end

    if daily_limit && today_count >= daily_limit do
      json(conn, %{success: false, message: "Daily limit reached for #{ttype}."})
    else
      Repo.query!(
        "INSERT INTO character_training_log (character_id, training_type, stat_gains_json) VALUES (?, ?, ?)",
        [char_id, ttype, gains_json || "{}"]
      )

      apply_gains(char_id, gains_json)

      remaining = (daily_limit || 0) - today_count - 1
      json(conn, %{
        success: true,
        message: "Training complete.",
        gains: parse_gains(gains_json),
        remainingToday: max(0, remaining)
      })
    end
  end

  # Best-effort stat application. Stat keys map onto the columns the
  # `characters` table actually has — anything unrecognized is dropped.
  defp apply_gains(char_id, json) do
    gains = parse_gains(json)
    allowed = ~w(atk def mo md speed luck max_hp max_mp)

    updates =
      gains
      |> Enum.filter(fn {k, _v} -> k in allowed end)
      |> Enum.map(fn {k, v} -> {k, max(0, trunc(to_number(v)))} end)
      |> Enum.reject(fn {_k, v} -> v == 0 end)

    if updates != [] do
      set_clause = Enum.map_join(updates, ", ", fn {k, _} -> "#{k} = #{k} + ?" end)
      values = Enum.map(updates, fn {_k, v} -> v end) ++ [char_id]
      Repo.query("UPDATE characters SET #{set_clause} WHERE id = ?", values)
    end

    :ok
  rescue
    _ -> :ok
  end

  defp to_number(v) when is_number(v), do: v
  defp to_number(v) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      _ -> 0
    end
  end
  defp to_number(_), do: 0

  defp parse_gains(nil), do: %{}
  defp parse_gains(""), do: %{}
  defp parse_gains(json) when is_binary(json) do
    case Jason.decode(json) do
      {:ok, m} when is_map(m) -> m
      _ -> %{}
    end
  end
  defp parse_gains(_), do: %{}

  # ── STOP ──────────────────────────────────────────────────────────
  # No long-running session exists in this schema. Acknowledge so the
  # panel's tear-down POST doesn't 404 at the client.
  def stop(conn, _params), do: json(conn, %{success: true, message: "No active session."})
end
