defmodule TePhoenixWeb.MailController do
  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  def inbox(conn, params) do
    user_id = conn.assigns.user_id
    case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        page = max(1, parse_int(params["page"] || "1"))
        limit = min(50, max(1, parse_int(params["limit"] || "20")))
        offset = (page - 1) * limit

        mail = query_rows(
          "SELECT m.id, m.sender_char_id, m.subject, m.is_read, m.has_attachment, m.created_at, c.name AS sender_name FROM character_mail m LEFT JOIN characters c ON c.id=m.sender_char_id WHERE m.recipient_char_id=? AND m.is_deleted=0 ORDER BY m.created_at DESC LIMIT ? OFFSET ?",
          [char_id, limit, offset]
        )
        json(conn, %{success: true, mail: mail})
      _ -> json(conn, %{success: true, mail: []})
    end
  end

  def read_message(conn, %{"id" => id}) do
    user_id = conn.assigns.user_id
    case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        case Repo.query("SELECT m.*, c.name AS sender_name FROM character_mail m LEFT JOIN characters c ON c.id=m.sender_char_id WHERE m.id=? AND m.recipient_char_id=?", [id, char_id]) do
          {:ok, %{rows: [row], columns: cols}} ->
            Repo.query("UPDATE character_mail SET is_read=1 WHERE id=?", [id])
            json(conn, %{success: true, message: Enum.zip(cols, row) |> Map.new()})
          _ -> json(conn, %{success: false, message: "Message not found."})
        end
      _ -> json(conn, %{success: false})
    end
  end

  def send_message(conn, params) do
    user_id = conn.assigns.user_id
    case Repo.query("SELECT id, name FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id, _name]]}} ->
        recipient = params["recipientCharId"] || params["recipient_char_id"]
        subject = (params["subject"] || "No Subject") |> String.slice(0, 100)
        body = (params["body"] || "") |> String.slice(0, 2000)

        # Resolve recipient by name if no ID
        recipient_id = if recipient do
          parse_int(recipient)
        else
          rname = params["recipientName"] || params["recipient_name"]
          if rname do
            case Repo.query("SELECT id FROM characters WHERE name=? LIMIT 1", [rname]) do
              {:ok, %{rows: [[id]]}} -> id
              _ -> nil
            end
          end
        end

        if is_nil(recipient_id) or recipient_id == 0 do
          json(conn, %{success: false, message: "Recipient not found."})
        else
          try do
            Repo.query!("INSERT INTO character_mail (sender_char_id, recipient_char_id, subject, body) VALUES (?,?,?,?)",
              [char_id, recipient_id, subject, body])

            # Attach items if provided
            items = params["items"] || []
            Enum.each(items, fn item ->
              if item["itemId"] do
                Repo.query("INSERT INTO character_mail_attachments (mail_id, item_id, quantity) VALUES (LAST_INSERT_ID(),?,?)",
                  [item["itemId"], item["quantity"] || 1])
              end
            end)

            json(conn, %{success: true, message: "Mail sent!"})
          rescue
            _ -> json(conn, %{success: false, message: "Failed to send."})
          end
        end
      _ -> json(conn, %{success: false})
    end
  end

  def delete_message(conn, %{"id" => id}) do
    user_id = conn.assigns.user_id
    case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        Repo.query("UPDATE character_mail SET is_deleted=1 WHERE id=? AND recipient_char_id=?", [id, char_id])
        json(conn, %{success: true})
      _ -> json(conn, %{success: false})
    end
  end

  def unread_count(conn, _params) do
    user_id = conn.assigns.user_id
    case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        case Repo.query("SELECT COUNT(*) FROM character_mail WHERE recipient_char_id=? AND is_deleted=0 AND is_read=0", [char_id]) do
          {:ok, %{rows: [[count]]}} -> json(conn, %{success: true, count: count})
          _ -> json(conn, %{success: true, count: 0})
        end
      _ -> json(conn, %{success: true, count: 0})
    end
  end

  defp query_rows(sql, params) do
    case Repo.query(sql, params) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
  end

  defp parse_int(val) when is_integer(val), do: val
  defp parse_int(val) when is_binary(val) do
    case Integer.parse(val) do {n, _} -> n; :error -> 0 end
  end
  defp parse_int(_), do: 0
end
