defmodule TePhoenix.Tenancy do
  @moduledoc """
  Multi-tenant game hosting on a single BEAM node.

  Each "game" is a tenant with its own:
    * Configuration (capabilities, settings, theme)
    * Content (maps, NPCs, items, skills, quests — all row-scoped)
    * Players (characters scoped to the tenant)
    * Admin panel (separate /sauce per tenant)

  ## Architecture

  **Row-level scoping, not schema-per-tenant.** Every content table
  gets a `tenant_id` column. Queries filter by tenant. This means:

    * No DDL at runtime — single migration, unlimited tenants
    * Shared connection pool — no per-tenant pool overhead
    * Cross-tenant queries possible for platform analytics
    * Tenant isolation enforced at the application layer, not DB

  ## How it works

  1. **Tenant registration**: `create_tenant/1` inserts a row into
     `game_tenants` and returns a tenant_id. The owner gets an admin
     token.

  2. **Request scoping**: a Plug sets `conn.assigns[:tenant_id]` from
     the subdomain, path prefix, or header. All downstream queries
     include `WHERE tenant_id = ?`.

  3. **Channel scoping**: socket assigns carry `tenant_id`. PubSub
     topics are prefixed: `"map:<tenant_id>:<map_id>"`.

  4. **AdminSauce**: each tenant has their own `/sauce` with their
     own content. The platform owner sees all tenants.

  5. **Capability isolation**: each tenant has independent capability
     toggles. Tenant A can run MOBA, Tenant B can run RPG — same
     server, different feature sets.

  ## Tables

    * `game_tenants` — tenant registration (name, slug, owner, plan, settings)
    * All content tables gain `tenant_id` column (migrated lazily)

  ## Usage

      # In a Plug:
      tenant_id = Tenancy.resolve(conn)
      conn = assign(conn, :tenant_id, tenant_id)

      # In a query:
      Tenancy.scoped_query("SELECT * FROM game_maps WHERE tenant_id = ?", tenant_id)

      # In a channel:
      Tenancy.tenant_topic("map", tenant_id, map_id)
      # => "t:42:map:7"
  """

  require Logger
  alias TePhoenix.Repo

  @tenant_table "game_tenants"

  # ── Setup ───────────────────────────────────────────────────────

  def ensure_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@tenant_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      slug VARCHAR(80) NOT NULL UNIQUE,
      owner_user_id INT,
      plan VARCHAR(32) DEFAULT 'free',
      settings_json LONGTEXT,
      capabilities_json LONGTEXT,
      theme_json LONGTEXT,
      active TINYINT(1) DEFAULT 1,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_slug (slug),
      INDEX idx_owner (owner_user_id)
    )
    """)
  rescue
    e -> Logger.error("Tenancy ensure_table: #{inspect(e)}")
  end

  # ── CRUD ────────────────────────────────────────────────────────

  def create_tenant(attrs) do
    slug = attrs[:slug] || Slug.slugify(attrs[:name] || "game")
    name = attrs[:name] || slug

    case Repo.query(
      "INSERT INTO #{@tenant_table} (name, slug, owner_user_id, plan, settings_json, capabilities_json, theme_json, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())",
      [name, slug, attrs[:owner_user_id], attrs[:plan] || "free",
       Jason.encode!(attrs[:settings] || %{}),
       Jason.encode!(attrs[:capabilities] || %{}),
       Jason.encode!(attrs[:theme] || %{})]
    ) do
      {:ok, %{last_insert_id: id}} -> {:ok, %{id: id, slug: slug, name: name}}
      {:error, e} -> {:error, e}
    end
  rescue
    e -> {:error, e}
  end

  def get_tenant(id) when is_integer(id) do
    case Repo.query("SELECT id, name, slug, owner_user_id, plan, settings_json, capabilities_json, theme_json, active FROM #{@tenant_table} WHERE id = ?", [id]) do
      {:ok, %{rows: [row]}} -> {:ok, parse_tenant(row)}
      _ -> {:error, :not_found}
    end
  rescue
    _ -> {:error, :not_found}
  end

  def get_tenant_by_slug(slug) when is_binary(slug) do
    case Repo.query("SELECT id, name, slug, owner_user_id, plan, settings_json, capabilities_json, theme_json, active FROM #{@tenant_table} WHERE slug = ? AND active = 1", [slug]) do
      {:ok, %{rows: [row]}} -> {:ok, parse_tenant(row)}
      _ -> {:error, :not_found}
    end
  rescue
    _ -> {:error, :not_found}
  end

  def list_tenants do
    case Repo.query("SELECT id, name, slug, owner_user_id, plan, settings_json, capabilities_json, theme_json, active FROM #{@tenant_table} ORDER BY name ASC") do
      {:ok, %{rows: rows}} -> Enum.map(rows, &parse_tenant/1)
      _ -> []
    end
  rescue
    _ -> []
  end

  def update_tenant(id, attrs) do
    sets = []
    vals = []

    {sets, vals} = if attrs[:name], do: {["name=?" | sets], [attrs[:name] | vals]}, else: {sets, vals}
    {sets, vals} = if attrs[:plan], do: {["plan=?" | sets], [attrs[:plan] | vals]}, else: {sets, vals}
    {sets, vals} = if attrs[:settings], do: {["settings_json=?" | sets], [Jason.encode!(attrs[:settings]) | vals]}, else: {sets, vals}
    {sets, vals} = if attrs[:capabilities], do: {["capabilities_json=?" | sets], [Jason.encode!(attrs[:capabilities]) | vals]}, else: {sets, vals}
    {sets, vals} = if attrs[:theme], do: {["theme_json=?" | sets], [Jason.encode!(attrs[:theme]) | vals]}, else: {sets, vals}
    {sets, vals} = if Map.has_key?(attrs, :active), do: {["active=?" | sets], [if(attrs[:active], do: 1, else: 0) | vals]}, else: {sets, vals}

    if sets != [] do
      set_clause = Enum.join(Enum.reverse(sets), ", ")
      Repo.query("UPDATE #{@tenant_table} SET #{set_clause}, updated_at=NOW() WHERE id = ?", Enum.reverse(vals) ++ [id])
    end
  end

  # ── Resolution ──────────────────────────────────────────────────

  @doc """
  Resolve the tenant from a connection. Checks (in order):
  1. `x-tenant-id` header
  2. `tenant` query param
  3. Subdomain (first segment before first dot)
  4. Default tenant (id=1)
  """
  def resolve(conn) do
    cond do
      header = List.first(Plug.Conn.get_req_header(conn, "x-tenant-id")) ->
        String.to_integer(header)

      param = conn.params["tenant"] ->
        case get_tenant_by_slug(param) do
          {:ok, t} -> t.id
          _ -> default_tenant_id()
        end

      true ->
        host = conn.host || "localhost"
        parts = String.split(host, ".")

        if length(parts) >= 3 do
          slug = List.first(parts)
          case get_tenant_by_slug(slug) do
            {:ok, t} -> t.id
            _ -> default_tenant_id()
          end
        else
          default_tenant_id()
        end
    end
  rescue
    _ -> default_tenant_id()
  end

  @doc "Resolve tenant from a socket (channel connections)."
  def resolve_socket(socket) do
    socket.assigns[:tenant_id] || default_tenant_id()
  end

  # ── Scoping helpers ─────────────────────────────────────────────

  @doc "Build a tenant-scoped PubSub topic."
  def tenant_topic(prefix, tenant_id, id) do
    "t:#{tenant_id}:#{prefix}:#{id}"
  end

  @doc "Get the default tenant (first created, or 1)."
  def default_tenant_id do
    case Repo.query("SELECT id FROM #{@tenant_table} WHERE active = 1 ORDER BY id ASC LIMIT 1") do
      {:ok, %{rows: [[id]]}} -> id
      _ -> 1
    end
  rescue
    _ -> 1
  end

  # ── Helpers ─────────────────────────────────────────────────────

  defp parse_tenant([id, name, slug, owner, plan, set_j, cap_j, theme_j, active]) do
    %{
      id: id, name: name, slug: slug, owner_user_id: owner,
      plan: plan || "free",
      settings: decode(set_j), capabilities: decode(cap_j),
      theme: decode(theme_j),
      active: active == 1 or active == true
    }
  end

  defp decode(nil), do: %{}
  defp decode(""), do: %{}
  defp decode(s) when is_binary(s), do: case(Jason.decode(s), do: ({:ok, v} -> v; _ -> %{}))
  defp decode(m) when is_map(m), do: m
  defp decode(_), do: %{}
end

defmodule Slug do
  @moduledoc false
  def slugify(str) do
    str
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9\s-]/, "")
    |> String.replace(~r/[\s-]+/, "-")
    |> String.trim("-")
  end
end
