defmodule TePhoenixWeb.Plugs.Tenant do
  @moduledoc """
  Multi-tenancy Plug — resolves the current tenant and scopes every
  downstream query and PubSub topic to that tenant.

  Resolution order:
    1. `x-tenant-id` header (numeric, trusted — for internal service calls)
    2. `tenant` query param (resolved by slug via Tenancy.get_tenant_by_slug)
    3. Subdomain (first label before the first dot)
    4. Default tenant (id = 1)

  Also provides Ecto query scoping and PubSub topic helpers used by
  controllers, LiveViews, and channels.
  """

  @behaviour Plug

  import Plug.Conn
  import Ecto.Query

  alias TePhoenix.Tenancy

  # ── Plug callbacks ───────────────────────────────────────────────

  @impl true
  def init(opts), do: opts

  @impl true
  def call(conn, _opts) do
    tenant_id = Tenancy.resolve(conn)
    assign(conn, :tenant_id, tenant_id)
  end

  # ── Ecto query scoping ──────────────────────────────────────────

  @doc """
  Scope an Ecto query by tenant_id.

  Accepts an integer tenant_id, a struct with a `:tenant_id` key, or a
  `%Plug.Conn{}` whose assigns include a `:tenant_id`.

      from(m in "game_maps")
      |> TePhoenixWeb.Plugs.Tenant.tenant_scope(42)

      from(m in "game_maps")
      |> TePhoenixWeb.Plugs.Tenant.tenant_scope(conn)

  Adds `WHERE tenant_id = ^tenant_id` to any queryable.
  """
  @spec tenant_scope(Ecto.Queryable.t(), integer() | map() | Plug.Conn.t()) :: Ecto.Query.t()
  def tenant_scope(queryable, tenant_or_conn)

  def tenant_scope(queryable, tenant_id) when is_integer(tenant_id) do
    from(q in queryable, where: q.tenant_id == ^tenant_id)
  end

  def tenant_scope(queryable, %Plug.Conn{assigns: %{tenant_id: tid}}) do
    tenant_scope(queryable, tid)
  end

  def tenant_scope(queryable, %{tenant_id: tid}) when is_integer(tid) do
    tenant_scope(queryable, tid)
  end

  # ── PubSub topic helpers ────────────────────────────────────────

  @doc """
  Build a tenant-scoped PubSub topic from a conn.

      scoped_topic("map", conn, map_id)  # => "t:42:map:7"

  Delegates to `Tenancy.tenant_topic/3` using the conn's tenant_id.
  """
  @spec scoped_topic(String.t(), Plug.Conn.t() | Phoenix.Socket.t(), term()) :: String.t()
  def scoped_topic(prefix, %Plug.Conn{assigns: %{tenant_id: tid}}, id) do
    Tenancy.tenant_topic(prefix, tid, id)
  end

  def scoped_topic(prefix, %Phoenix.Socket{assigns: %{tenant_id: tid}}, id) do
    Tenancy.tenant_topic(prefix, tid, id)
  end

  def scoped_topic(prefix, tenant_id, id) when is_integer(tenant_id) do
    Tenancy.tenant_topic(prefix, tenant_id, id)
  end
end

# ── Channel helper ──────────────────────────────────────────────

defmodule TePhoenixWeb.TenantSocket do
  @moduledoc """
  Tenant-aware socket helpers for Phoenix Channels.

  Call `assign_tenant/1` in your `connect/3` callback after
  authenticating the user to attach the tenant_id to the socket.

  ## Usage in UserSocket

      def connect(%{"token" => token, "tenant_id" => tid}, socket, _info) do
        case Phoenix.Token.verify(socket, "user socket", token, max_age: 86_400) do
          {:ok, user_id} ->
            socket
            |> assign(:user_id, user_id)
            |> assign_tenant(tid)
            |> then(&{:ok, &1})
          _ -> :error
        end
      end
  """

  import Phoenix.Socket, only: [assign: 3]

  alias TePhoenix.Tenancy

  @doc """
  Assign tenant_id to a socket.

  Accepts:
    - An integer tenant_id (trusted, e.g. from internal calls)
    - A string that may be a numeric id or a slug
    - nil — falls back to the default tenant

  Returns the socket with `:tenant_id` assigned.
  """
  @spec assign_tenant(Phoenix.Socket.t(), term()) :: Phoenix.Socket.t()
  def assign_tenant(socket, tenant_id \\ nil)

  def assign_tenant(socket, nil) do
    assign(socket, :tenant_id, Tenancy.default_tenant_id())
  end

  def assign_tenant(socket, id) when is_integer(id) do
    assign(socket, :tenant_id, id)
  end

  def assign_tenant(socket, id_or_slug) when is_binary(id_or_slug) do
    tid =
      case Integer.parse(id_or_slug) do
        {n, ""} ->
          n

        _ ->
          case Tenancy.get_tenant_by_slug(id_or_slug) do
            {:ok, t} -> t.id
            _ -> Tenancy.default_tenant_id()
          end
      end

    assign(socket, :tenant_id, tid)
  end

  @doc """
  Build a tenant-scoped PubSub topic from a socket.

      scoped_topic(socket, "map", map_id)  # => "t:42:map:7"
  """
  @spec scoped_topic(Phoenix.Socket.t(), String.t(), term()) :: String.t()
  def scoped_topic(%Phoenix.Socket{assigns: %{tenant_id: tid}}, prefix, id) do
    Tenancy.tenant_topic(prefix, tid, id)
  end

  def scoped_topic(%Phoenix.Socket{} = socket, prefix, id) do
    tid = Tenancy.default_tenant_id()
    Tenancy.tenant_topic(prefix, assign(socket, :tenant_id, tid).assigns.tenant_id, id)
  end
end
