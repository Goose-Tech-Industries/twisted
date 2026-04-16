defmodule TePhoenixWeb.LeaderboardController do
  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  def get_leaderboard(conn, %{"type" => type}) do
    {query, params} = case type do
      "level" ->
        {"SELECT c.id, c.name, c.level, c.experience, cl.name AS class_name, r.name AS race_name FROM characters c LEFT JOIN game_classes cl ON cl.id=c.class_id LEFT JOIN game_races r ON r.id=c.race_id WHERE c.is_deleted IS NULL OR c.is_deleted=0 ORDER BY c.level DESC, c.experience DESC LIMIT 50", []}

      "pvp" ->
        {"SELECT c.id, c.name, c.level, c.battle_record, CAST(JSON_EXTRACT(c.battle_record,'$.W') AS UNSIGNED) AS wins FROM characters c WHERE c.is_deleted IS NULL OR c.is_deleted=0 ORDER BY wins DESC LIMIT 50", []}

      "gold" ->
        {"SELECT c.id, c.name, c.level, u.currency AS gold FROM characters c JOIN users u ON u.id=c.user_id WHERE c.is_deleted IS NULL OR c.is_deleted=0 ORDER BY u.currency DESC LIMIT 50", []}

      "achievements" ->
        {"SELECT c.id, c.name, c.level, (SELECT COUNT(*) FROM character_achievements WHERE character_id=c.id) AS achievement_count FROM characters c WHERE c.is_deleted IS NULL OR c.is_deleted=0 ORDER BY achievement_count DESC LIMIT 50", []}

      "guild" ->
        {"SELECT g.id, g.name, g.level, g.icon, (SELECT COUNT(*) FROM guild_members WHERE guild_id=g.id AND is_active=1) AS member_count FROM guilds g WHERE g.is_active=1 ORDER BY g.level DESC, member_count DESC LIMIT 50", []}

      _ ->
        {"SELECT c.id, c.name, c.level FROM characters c WHERE c.is_deleted IS NULL OR c.is_deleted=0 ORDER BY c.level DESC LIMIT 50", []}
    end

    entries = query_rows(query, params)
    json(conn, %{success: true, type: type, entries: entries})
  end

  defp query_rows(sql, params) do
    case Repo.query(sql, params) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
  end
end
