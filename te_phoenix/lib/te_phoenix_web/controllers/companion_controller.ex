defmodule TePhoenixWeb.CompanionController do
  @moduledoc """
  Companion endpoints — list/summon/dismiss/tactic.
  Backed by `character_companions` joined to `game_npcs`.
  """

  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  def list(conn, %{"char_id" => char_id}) do
    case Repo.query(
      """
      SELECT cc.id, cc.npc_id, cc.is_active, cc.tactics, cc.recruited_at,
             n.name, n.icon, n.npc_level AS level,
             n.base_hp, n.base_atk, n.base_def
        FROM character_companions cc
        JOIN game_npcs n ON n.id = cc.npc_id
       WHERE cc.character_id = ?
       ORDER BY cc.recruited_at DESC
      """,
      [char_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        companions = Enum.map(rows, fn row ->
          m = Enum.zip(cols, row) |> Map.new()
          %{
            id: m["id"],
            npc_id: m["npc_id"],
            name: m["name"] || "Companion",
            icon: m["icon"],
            level: m["level"] || 1,
            current_hp: m["base_hp"] || 100,
            max_hp: m["base_hp"] || 100,
            active: m["is_active"] == 1,
            tactic: String.downcase(m["tactics"] || "balanced")
          }
        end)
        json(conn, %{success: true, companions: companions})

      _ ->
        json(conn, %{success: true, companions: []})
    end
  end

  def set_active(conn, %{"id" => id, "active" => active}) do
    user_id = conn.assigns.user_id
    flag = if active in [true, "true", 1, "1"], do: 1, else: 0

    # Only allow toggling companions belonging to this user's characters.
    case Repo.query(
      """
      SELECT cc.id FROM character_companions cc
        JOIN characters c ON c.id = cc.character_id
       WHERE cc.id = ? AND c.user_id = ?
      """,
      [id, user_id]
    ) do
      {:ok, %{rows: [_]}} ->
        # If activating, deactivate other companions of the same character first.
        if flag == 1 do
          Repo.query(
            """
            UPDATE character_companions cc
              JOIN character_companions me ON me.id = ?
               SET cc.is_active = 0
             WHERE cc.character_id = me.character_id AND cc.id <> ?
            """,
            [id, id]
          )
        end

        Repo.query("UPDATE character_companions SET is_active = ? WHERE id = ?", [flag, id])
        json(conn, %{success: true})

      _ ->
        json(conn, %{success: false, message: "Companion not found."})
    end
  end

  def set_tactic(conn, %{"id" => id, "tactic" => tactic}) do
    user_id = conn.assigns.user_id
    normalized = String.upcase(tactic)

    if normalized in ["AGGRESSIVE", "BALANCED", "DEFENSIVE", "SUPPORT"] do
      case Repo.query(
        """
        UPDATE character_companions cc
          JOIN characters c ON c.id = cc.character_id
           SET cc.tactics = ?
         WHERE cc.id = ? AND c.user_id = ?
        """,
        [normalized, id, user_id]
      ) do
        {:ok, %{num_rows: 1}} -> json(conn, %{success: true})
        _ -> json(conn, %{success: false, message: "Companion not found."})
      end
    else
      json(conn, %{success: false, message: "Invalid tactic."})
    end
  end
end
