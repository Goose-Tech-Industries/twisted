defmodule TePhoenixWeb.LfpController do
  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  def list_listings(conn, _params) do
    listings = query_rows(
      "SELECT l.id, l.character_id, l.role, l.note, l.listed_at, c.name, c.level, cl.name AS class_name FROM lfp_listings l JOIN characters c ON c.id=l.character_id LEFT JOIN game_classes cl ON cl.id=c.class_id ORDER BY l.listed_at DESC LIMIT 50"
    )
    json(conn, %{success: true, listings: listings})
  end

  def create_listing(conn, params) do
    user_id = conn.assigns.user_id
    case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        role = params["role"] || "any"
        note = (params["note"] || "") |> String.slice(0, 200)
        try do
          Repo.query!("INSERT INTO lfp_listings (character_id, role, note) VALUES (?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role), note=VALUES(note), listed_at=NOW()",
            [char_id, role, note])
          json(conn, %{success: true, message: "Listed as LFP!"})
        rescue
          _ -> json(conn, %{success: false, message: "Error."})
        end
      _ -> json(conn, %{success: false})
    end
  end

  def remove_listing(conn, _params) do
    user_id = conn.assigns.user_id
    case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        Repo.query("DELETE FROM lfp_listings WHERE character_id=?", [char_id])
        json(conn, %{success: true})
      _ -> json(conn, %{success: false})
    end
  end

  defp query_rows(sql, params \\ []) do
    case Repo.query(sql, params) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
  end
end
