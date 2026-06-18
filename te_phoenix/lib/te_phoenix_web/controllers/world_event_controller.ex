defmodule TePhoenixWeb.WorldEventController do
  @moduledoc """
  World event read endpoints + join action.

    GET  /api/world-events/active  → currently running events
    POST /api/world-events/join    → join the current event
  """

  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  def active(conn, _params) do
    user_id = conn.assigns[:user_id]

    {char_id, _} =
      case user_id do
        nil -> {nil, nil}
        uid ->
          case Repo.query("SELECT id FROM characters WHERE user_id = ? ORDER BY id DESC LIMIT 1", [uid]) do
            {:ok, %{rows: [[cid]]}} -> {cid, nil}
            _ -> {nil, nil}
          end
      end

    case Repo.query(
      """
      SELECT id, name, description, icon, event_type,
             starts_at, ends_at, duration_minutes, lore_text,
             stat_modifiers, effects_json
        FROM game_world_events
       WHERE is_active = 1
         AND (ends_at IS NULL OR ends_at > NOW())
       ORDER BY starts_at DESC
      """
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        # Pull participation per event for the current player (if any).
        participating =
          case char_id do
            nil -> MapSet.new()
            cid ->
              case Repo.query(
                """
                SELECT we.id
                  FROM game_world_events we
                  JOIN game_world_event_history hist ON hist.event_id = we.id
                  JOIN game_world_event_participants p ON p.event_history_id = hist.id
                 WHERE p.character_id = ?
                """,
                [cid]
              ) do
                {:ok, %{rows: prows}} -> prows |> List.flatten() |> MapSet.new()
                _ -> MapSet.new()
              end
          end

        events = Enum.map(rows, fn row ->
          m = Enum.zip(cols, row) |> Map.new()
          %{
            id: m["id"],
            name: m["name"],
            description: m["description"],
            icon: m["icon"] || "🌑",
            event_type: m["event_type"],
            starts_at: m["starts_at"],
            expires_at: m["ends_at"],
            lore_text: m["lore_text"],
            stat_modifiers: m["stat_modifiers"],
            phases_json: m["effects_json"],
            am_participating: MapSet.member?(participating, m["id"])
          }
        end)
        json(conn, %{success: true, events: events})

      _ ->
        json(conn, %{success: true, events: []})
    end
  end

  def join(conn, %{"eventId" => event_id}) do
    user_id = conn.assigns.user_id

    case Repo.query("SELECT id FROM characters WHERE user_id = ? ORDER BY id DESC LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        # Find or create the active history row for this event.
        history_id =
          case Repo.query(
            "SELECT id FROM game_world_event_history WHERE event_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
            [event_id]
          ) do
            {:ok, %{rows: [[hid]]}} -> hid
            _ ->
              case Repo.query(
                "INSERT INTO game_world_event_history (event_id, started_at) VALUES (?, NOW())",
                [event_id]
              ) do
                {:ok, %{last_insert_id: hid}} -> hid
                _ -> nil
              end
          end

        if history_id do
          # Insert-ignore so a re-join is a no-op rather than an error.
          Repo.query(
            """
            INSERT IGNORE INTO game_world_event_participants (event_history_id, character_id, contribution)
            VALUES (?, ?, 0)
            """,
            [history_id, char_id]
          )
          json(conn, %{success: true, message: "Joined."})
        else
          json(conn, %{success: false, message: "Event has no active history row."})
        end

      _ ->
        json(conn, %{success: false, message: "No character."})
    end
  rescue
    e -> json(conn, %{success: false, message: Exception.message(e)})
  end
end
