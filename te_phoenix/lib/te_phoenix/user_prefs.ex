defmodule TePhoenix.UserPrefs do
  @moduledoc """
  Per-user UI preferences. Backs PowerUserField's raw/structured toggle,
  saved filter sets, sidebar collapse state, and similar per-staff
  customization. Pure key/value scoped by user_id.

  Schema is created lazily on first call — matches the codebase pattern
  used by `TePhoenix.Tenancy` and `TePhoenix.Objectives.Registry` (raw
  `Repo.query` over Ecto migrations).
  """

  require Logger
  alias TePhoenix.Repo

  @table "user_prefs"

  @doc """
  Idempotently create the user_prefs table. Cached via persistent_term
  so repeat calls are cheap (just an :ets read).
  """
  def ensure_table do
    case :persistent_term.get({__MODULE__, :ready}, false) do
      true ->
        :ok

      false ->
        do_ensure_table()
        :persistent_term.put({__MODULE__, :ready}, true)
        :ok
    end
  end

  defp do_ensure_table do
    Repo.query!("""
    CREATE TABLE IF NOT EXISTS #{@table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      pref_key VARCHAR(160) NOT NULL,
      pref_value TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_key (user_id, pref_key),
      INDEX idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)

    :ok
  rescue
    e ->
      Logger.error("UserPrefs ensure_table: #{inspect(e)}")
      :error
  end

  @doc """
  Read a preference value. Returns `default` if the key is unset for
  this user, or if the user_id is missing/invalid.
  """
  def get(user_id, key, default \\ nil)
  def get(nil, _key, default), do: default
  def get(_uid, nil, default), do: default

  def get(user_id, key, default) when is_integer(user_id) and is_binary(key) do
    ensure_table()

    case Repo.query("SELECT pref_value FROM #{@table} WHERE user_id=? AND pref_key=? LIMIT 1", [user_id, key]) do
      {:ok, %{rows: [[value]]}} -> value || default
      _ -> default
    end
  end

  def get(_uid, _key, default), do: default

  @doc """
  Write a preference value. Upsert on (user_id, pref_key). Pass `nil`
  to delete. No-ops on missing user_id.
  """
  def put(user_id, key, value)
  def put(nil, _key, _value), do: :ok
  def put(_uid, nil, _value), do: :ok

  def put(user_id, key, nil) when is_integer(user_id) and is_binary(key) do
    ensure_table()
    Repo.query("DELETE FROM #{@table} WHERE user_id=? AND pref_key=?", [user_id, key])
    :ok
  end

  def put(user_id, key, value) when is_integer(user_id) and is_binary(key) do
    ensure_table()
    str = to_string(value)

    Repo.query(
      """
      INSERT INTO #{@table} (user_id, pref_key, pref_value)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE pref_value = VALUES(pref_value), updated_at = CURRENT_TIMESTAMP
      """,
      [user_id, key, str]
    )

    :ok
  end

  def put(_uid, _key, _value), do: :ok

  @doc """
  Bulk read all prefs for a user. Returns a map of `key => value`.
  Useful when a LiveView wants to hydrate every PowerUserField on mount
  with one query instead of N.
  """
  def all_for(user_id) when is_integer(user_id) do
    ensure_table()

    case Repo.query("SELECT pref_key, pref_value FROM #{@table} WHERE user_id=?", [user_id]) do
      {:ok, %{rows: rows}} ->
        rows |> Enum.map(fn [k, v] -> {k, v} end) |> Map.new()

      _ ->
        %{}
    end
  end

  def all_for(_), do: %{}
end
