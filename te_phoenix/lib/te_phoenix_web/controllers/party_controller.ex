defmodule TePhoenixWeb.PartyController do
  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  def get_party(conn, _params) do
    user_id = conn.assigns.user_id
    case Repo.query("SELECT c.id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        case Repo.query(
          "SELECT cp.id AS party_id, cp.leader_id FROM character_party_members cpm JOIN character_parties cp ON cp.id=cpm.party_id WHERE cpm.character_id=? AND cpm.is_active=1 AND cp.is_active=1 LIMIT 1",
          [char_id]
        ) do
          {:ok, %{rows: [[party_id, leader_id]]}} ->
            members = query_rows(
              "SELECT cpm.character_id, cpm.role, c.name, c.level, c.class_id FROM character_party_members cpm JOIN characters c ON c.id=cpm.character_id WHERE cpm.party_id=? AND cpm.is_active=1",
              [party_id]
            )
            json(conn, %{success: true, party: %{id: party_id, leaderId: leader_id, members: members}})
          _ -> json(conn, %{success: true, party: nil})
        end
      _ -> json(conn, %{success: false})
    end
  end

  def list_friends(conn, _params) do
    user_id = conn.assigns.user_id
    case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        friends = query_rows(
          "SELECT f.friend_char_id, c.name, c.level, c.presence_status FROM character_friends f JOIN characters c ON c.id=f.friend_char_id WHERE f.character_id=? AND f.status='accepted' ORDER BY c.name",
          [char_id]
        )
        json(conn, %{success: true, friends: friends})
      _ -> json(conn, %{success: true, friends: []})
    end
  end

  def send_friend_request(conn, %{"targetCharId" => target_id}) do
    user_id = conn.assigns.user_id
    case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        try do
          Repo.query!("INSERT INTO character_friends (character_id, friend_char_id, status) VALUES (?,?,'pending') ON DUPLICATE KEY UPDATE status='pending'",
            [char_id, target_id])
          json(conn, %{success: true})
        rescue
          _ -> json(conn, %{success: false, message: "Error sending request."})
        end
      _ -> json(conn, %{success: false})
    end
  end

  def accept_friend(conn, %{"fromCharId" => from_id}) do
    user_id = conn.assigns.user_id
    case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        Repo.query("UPDATE character_friends SET status='accepted' WHERE character_id=? AND friend_char_id=?", [from_id, char_id])
        Repo.query("INSERT INTO character_friends (character_id, friend_char_id, status) VALUES (?,?,'accepted') ON DUPLICATE KEY UPDATE status='accepted'", [char_id, from_id])
        json(conn, %{success: true})
      _ -> json(conn, %{success: false})
    end
  end

  def remove_friend(conn, %{"friendCharId" => friend_id}) do
    user_id = conn.assigns.user_id
    case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        Repo.query("DELETE FROM character_friends WHERE (character_id=? AND friend_char_id=?) OR (character_id=? AND friend_char_id=?)", [char_id, friend_id, friend_id, char_id])
        json(conn, %{success: true})
      _ -> json(conn, %{success: false})
    end
  end

  defp query_rows(sql, params) do
    case Repo.query(sql, params) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
  end
end
