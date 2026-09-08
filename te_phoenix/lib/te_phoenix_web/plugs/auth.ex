defmodule TePhoenixWeb.Plugs.Auth do
  @moduledoc """
  Authentication plug for REST API routes.
  Checks for valid Phoenix.Token in Authorization header or session.
  Sets conn.assigns.user_id and conn.assigns.user_role.
  """

  import Plug.Conn
  alias TePhoenix.Repo

  def init(opts), do: opts

  def call(conn, _opts) do
    with {:ok, user_id} <- get_user_id(conn),
         {:ok, role} <- get_user_role(user_id) do
      conn
      |> assign(:user_id, user_id)
      |> assign(:user_role, role)
    else
      _ ->
        conn
        |> put_status(401)
        |> Phoenix.Controller.json(%{success: false, message: "Not logged in."})
        |> halt()
    end
  end

  defp get_user_id(conn) do
    # 1. Try Authorization header first (Bearer token)
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token] ->
        verify_token(token)

      _ ->
        # 2. Try query param ?token=... (critical for EventSource SSE / media streams)
        case conn.params["token"] do
          token when is_binary(token) and token != "" ->
            verify_token(token)

          _ ->
            # 3. Fall back to session
            case get_session(conn, :user_id) do
              nil -> {:error, :no_session}
              user_id -> {:ok, user_id}
            end
        end
    end
  end

  defp verify_token(token) do
    case Phoenix.Token.verify(TePhoenixWeb.Endpoint, "user socket", token, max_age: 86_400) do
      {:ok, user_id} -> {:ok, user_id}
      _ -> {:error, :invalid_token}
    end
  end

  defp get_user_role(user_id) do
    case Repo.query("SELECT role FROM users WHERE id=? AND is_banned=0", [user_id]) do
      {:ok, %{rows: [[role]]}} -> {:ok, role || "PLAYER"}
      _ -> {:error, :user_not_found}
    end
  end
end

defmodule TePhoenixWeb.Plugs.RequireStaff do
  @moduledoc "Plug that requires ADMIN/GM/MOD/STAFF/OWNER role."

  import Plug.Conn

  @staff_roles ~w(ADMIN GM MOD STAFF OWNER)

  def init(opts), do: opts

  def call(conn, _opts) do
    role = String.upcase(conn.assigns[:user_role] || "")
    if role in @staff_roles do
      conn
    else
      conn
      |> put_status(403)
      |> Phoenix.Controller.json(%{success: false, message: "Staff only."})
      |> halt()
    end
  end
end
