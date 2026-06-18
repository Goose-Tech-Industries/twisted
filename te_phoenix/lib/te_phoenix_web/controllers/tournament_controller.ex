defmodule TePhoenixWeb.TournamentController do
  @moduledoc """
  Tournaments read endpoint.

    GET /api/tournaments → upcoming + active tournaments
  """

  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  def list(conn, _params) do
    case Repo.query(
      """
      SELECT t.id, t.name, t.description, t.type, t.status,
             t.entry_fee, t.min_level, t.max_level, t.next_occurrence,
             COUNT(DISTINCT p.character_id) AS participants
        FROM game_tournaments t
        LEFT JOIN game_tournament_participants p ON p.tournament_id = t.id
       WHERE t.status IN ('SCHEDULED','REGISTRATION','ACTIVE')
       GROUP BY t.id, t.name, t.description, t.type, t.status,
                t.entry_fee, t.min_level, t.max_level, t.next_occurrence
       ORDER BY t.next_occurrence ASC
      """
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        tournaments = Enum.map(rows, fn row ->
          m = Enum.zip(cols, row) |> Map.new()
          %{
            id: m["id"],
            name: m["name"],
            description: m["description"],
            format: String.downcase(String.replace(m["type"] || "single_elim", "_", " ")),
            starts_at: m["next_occurrence"] || NaiveDateTime.utc_now(),
            participants: m["participants"] || 0,
            max_participants: nil,
            prize_pool: pool(m["entry_fee"], m["participants"]),
            status: status_label(m["status"])
          }
        end)
        json(conn, %{success: true, tournaments: tournaments})

      _ ->
        json(conn, %{success: true, tournaments: []})
    end
  rescue
    # Some prod DBs have a different participants column shape — degrade gracefully.
    _ -> json(conn, %{success: true, tournaments: []})
  end

  defp pool(0, _), do: nil
  defp pool(nil, _), do: nil
  defp pool(fee, count) when is_integer(fee) and is_integer(count) and count > 0,
    do: "#{fee * count} gold"
  defp pool(fee, _) when is_integer(fee), do: "#{fee} gold entry"
  defp pool(_, _), do: nil

  defp status_label("SCHEDULED"), do: "upcoming"
  defp status_label("REGISTRATION"), do: "open"
  defp status_label("ACTIVE"), do: "running"
  defp status_label("COMPLETED"), do: "finished"
  defp status_label(_), do: "upcoming"
end
