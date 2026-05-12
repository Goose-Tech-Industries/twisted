defmodule TePhoenix.Marketing do
  @moduledoc """
  Marketing capture — Kickstarter mailing-list signups.

  Light wrapper around raw SQL to match the rest of the public-page
  surface (see BrandingController for the same pattern). The
  underlying table is created by priv/migrations/kickstarter_signups.sql.
  """

  alias TePhoenix.Repo

  @email_regex ~r/^[^\s@]+@[^\s@]+\.[^\s@]+$/

  @doc """
  Record a Kickstarter signup. Returns `:ok` on insert, `:already_subscribed`
  on duplicate, `{:error, reason}` for validation problems.
  """
  def record_signup(email, source \\ nil, referrer \\ nil)

  def record_signup(email, source, referrer) when is_binary(email) do
    email = String.trim(email) |> String.downcase()

    cond do
      email == "" ->
        {:error, :empty_email}

      String.length(email) > 254 ->
        {:error, :email_too_long}

      not Regex.match?(@email_regex, email) ->
        {:error, :invalid_email}

      true ->
        do_insert(email, source, referrer)
    end
  end

  def record_signup(_, _, _), do: {:error, :invalid_email}

  defp do_insert(email, source, referrer) do
    sql = """
    INSERT INTO kickstarter_signups (email, source, referrer)
    VALUES (?, ?, ?)
    """

    case Repo.query(sql, [email, source, referrer]) do
      {:ok, _} ->
        :ok

      {:error, %MyXQL.Error{mysql: %{name: :ER_DUP_ENTRY}}} ->
        :already_subscribed

      {:error, %{message: msg}} ->
        {:error, msg}

      other ->
        {:error, other}
    end
  end

  @doc "Count of signups — for the admin dashboard."
  def signup_count do
    case Repo.query("SELECT COUNT(*) FROM kickstarter_signups", []) do
      {:ok, %{rows: [[count]]}} -> count
      _ -> 0
    end
  end
end
