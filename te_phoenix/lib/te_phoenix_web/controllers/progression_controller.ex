defmodule TePhoenixWeb.ProgressionController do
  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  def get_progression(conn, %{"char_id" => char_id}) do
    user_id = conn.assigns.user_id

    # Verify ownership
    case Repo.query("SELECT id FROM characters WHERE id=? AND user_id=?", [char_id, user_id]) do
      {:ok, %{rows: [_]}} ->
        # Level info
        level_info = case Repo.query("SELECT c.level, c.experience, gl.xp_required FROM characters c LEFT JOIN level_requirements gl ON gl.level=c.level+1 WHERE c.id=?", [char_id]) do
          {:ok, %{rows: [[level, xp, xp_needed]]}} -> %{level: level, xp: xp, xpNeeded: xp_needed}
          _ -> %{level: 1, xp: 0, xpNeeded: 100}
        end

        # Battle record
        battle_record = case Repo.query("SELECT battle_record FROM characters WHERE id=?", [char_id]) do
          {:ok, %{rows: [[json]]}} ->
            case Jason.decode(to_string(json || "{}")) do {:ok, r} -> r; _ -> %{} end
          _ -> %{}
        end

        # Quests completed
        quests = case Repo.query("SELECT state_json FROM characters WHERE id=?", [char_id]) do
          {:ok, %{rows: [[json]]}} ->
            state = case Jason.decode(to_string(json || "{}")) do {:ok, s} -> s; _ -> %{} end
            completed = get_in(state, ["quests", "completed"]) || %{}
            active = get_in(state, ["quests", "active"]) || %{}
            %{completed: map_size(completed), active: map_size(active)}
          _ -> %{completed: 0, active: 0}
        end

        # Gathering skills
        gathering = query_rows(
          "SELECT cgl.skill_id, cgl.level, cgl.xp, cgl.total_gathered, gs.name FROM character_gathering_levels cgl JOIN game_gathering_skills gs ON gs.id=cgl.skill_id WHERE cgl.character_id=?",
          [char_id]
        )

        # Jobs
        jobs = query_rows(
          "SELECT cj.job_id, cj.job_level, cj.job_xp, j.name, j.icon FROM character_jobs cj JOIN game_jobs j ON j.id=cj.job_id WHERE cj.character_id=?",
          [char_id]
        )

        json(conn, %{
          success: true,
          progression: %{
            level: level_info, battleRecord: battle_record,
            quests: quests, gathering: gathering, jobs: jobs
          }
        })

      _ -> json(conn, %{success: false, message: "Unauthorized."})
    end
  end

  defp query_rows(sql, params) do
    case Repo.query(sql, params) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
  end
end
