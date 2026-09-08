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
    user_id = conn.assigns[:user_id]
    flag = if active in [true, "true", 1, "1"], do: 1, else: 0
    max_active = 4

    query =
      if user_id do
        {"SELECT cc.id, cc.character_id FROM character_companions cc JOIN characters c ON c.id = cc.character_id WHERE cc.id = ? AND c.user_id = ?", [id, user_id]}
      else
        {"SELECT cc.id, cc.character_id FROM character_companions cc WHERE cc.id = ?", [id]}
      end

    case apply(Repo, :query, Tuple.to_list(query)) do
      {:ok, %{rows: [[comp_id, char_id]]}} ->
        if flag == 1 do
          case Repo.query(
            "SELECT id FROM character_companions WHERE character_id = ? AND is_active = 1 AND id <> ? ORDER BY recruited_at ASC",
            [char_id, comp_id]
          ) do
            {:ok, %{rows: active_rows}} when length(active_rows) >= max_active ->
              excess_count = length(active_rows) - max_active + 1
              deactivate_ids = Enum.take(active_rows, excess_count) |> Enum.map(&hd/1)
              placeholders = Enum.map(deactivate_ids, fn _ -> "?" end) |> Enum.join(",")
              Repo.query("UPDATE character_companions SET is_active = 0 WHERE id IN (#{placeholders})", deactivate_ids)

            _ ->
              :ok
          end
        end

        Repo.query("UPDATE character_companions SET is_active = ? WHERE id = ?", [flag, comp_id])
        json(conn, %{success: true, active_limit: max_active, squad_size: max_active})

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
