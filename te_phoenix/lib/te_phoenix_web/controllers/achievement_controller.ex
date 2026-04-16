defmodule TePhoenixWeb.AchievementController do
  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  def list_achievements(conn, _params) do
    achievements = query_rows("SELECT id, name, description, icon, category, points, is_hidden FROM game_achievements WHERE is_active=1 ORDER BY category, points")
    json(conn, %{success: true, achievements: achievements})
  end

  def get_character_achievements(conn, %{"char_id" => char_id}) do
    unlocked = query_rows(
      "SELECT ca.achievement_id, ca.unlocked_at, ga.name, ga.description, ga.icon, ga.category, ga.points FROM character_achievements ca JOIN game_achievements ga ON ga.id=ca.achievement_id WHERE ca.character_id=? ORDER BY ca.unlocked_at DESC",
      [char_id]
    )
    total_points = Enum.reduce(unlocked, 0, fn a, acc -> acc + (a["points"] || 0) end)
    json(conn, %{success: true, achievements: unlocked, totalPoints: total_points})
  end

  defp query_rows(sql, params \\ []) do
    case Repo.query(sql, params) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
  end
end
