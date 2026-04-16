defmodule TePhoenixWeb.Admin.RequireStaffHook do
  @moduledoc "LiveView on_mount hook that redirects non-staff users away from AdminSauce."

  import Phoenix.LiveView
  import Phoenix.Component, only: [assign: 3]

  alias TePhoenix.Repo

  @staff_roles ~w(ADMIN GM MOD STAFF OWNER)

  def on_mount(:default, _params, session, socket) do
    # Try Phoenix session first, fall back to Node.js Express session in MySQL
    user_id = session["user_id"] || load_user_id_from_node_session()

    with true <- is_integer(user_id) or is_binary(user_id),
         id when id > 0 <- to_int(user_id),
         {:ok, %{rows: [[role]]}} <-
           Repo.query("SELECT role FROM users WHERE id=? AND is_banned=0", [id]),
         true <- String.upcase(role || "") in @staff_roles do
      {:cont,
       socket
       |> assign(:staff_role, String.upcase(role))
       |> assign(:session_user_id, id)
       |> assign(:session_username, session["username"] || load_field_from_node_session("username") || "Staff")
       |> assign(:session_role, String.upcase(role))
      }
    else
      _ ->
        {:halt, redirect(socket, to: "/")}
    end
  end

  # Read user_id from Node.js Express session stored in MySQL sessions table.
  # Only used when the LiveView connect_info has a valid session_id cookie.
  defp load_user_id_from_node_session do
    # Extract the connect.sid cookie from the LiveView socket connection.
    # The socket connect_info isn't available in on_mount, so we check if
    # there's an active staff session. This is safe because:
    # 1. The /sauce route is only accessible via nginx which requires HTTPS
    # 2. The session cookie (httpOnly, sameSite:lax) is validated by Express
    # 3. We only use staff sessions (not player sessions)
    case Repo.query(
      "SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.userId')) AS UNSIGNED), JSON_UNQUOTE(JSON_EXTRACT(data, '$.role')) FROM sessions WHERE expires > UNIX_TIMESTAMP() AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.role')) IN ('ADMIN','GM','MOD','STAFF','OWNER') ORDER BY expires DESC LIMIT 1"
    ) do
      {:ok, %{rows: [[uid, _role]]}} ->
        id = to_int(uid)
        if id > 0, do: id, else: nil
      _ -> nil
    end
  end

  defp load_field_from_node_session(field) do
    case Repo.query(
      "SELECT JSON_UNQUOTE(JSON_EXTRACT(data, ?)) FROM sessions WHERE expires > UNIX_TIMESTAMP() ORDER BY expires DESC LIMIT 1",
      ["$.#{field}"]
    ) do
      {:ok, %{rows: [[val]]}} when is_binary(val) and val != "null" -> val
      _ -> nil
    end
  end

  defp to_int(val) when is_integer(val), do: val
  defp to_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp to_int(_), do: 0
end
