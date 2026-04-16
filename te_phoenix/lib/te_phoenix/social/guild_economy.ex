defmodule TePhoenix.Social.GuildEconomy do
  @moduledoc """
  Guild treasury and player-to-player transfer system.

  Manages guild resource pools (treasury), member deposits/withdrawals
  (rank-gated), player-to-player transfers with full audit logging, and
  configurable income tax (MSWar-style).

  ## Tables (auto-created)

    * `game_guild_treasury` — per-guild resource pools (guild_id, resource_type, amount)
    * `game_transfer_log` — immutable audit trail of all transfers (deposits,
      withdrawals, player-to-player, tax deductions)

  All mutations are logged and queryable. AdminSauce can view the full
  transfer history for moderation.
  """

  require Logger
  alias TePhoenix.Repo

  @treasury_table "game_guild_treasury"
  @transfer_log_table "game_transfer_log"
  @tax_settings_table "game_guild_tax_settings"

  @withdraw_ranks MapSet.new(["LEADER", "OFFICER", "TREASURER"])

  # ── Setup ───────────────────────────────────────────────────────

  @doc """
  Create treasury, transfer log, and tax settings tables if they don't exist.
  Safe to call repeatedly.
  """
  def ensure_tables do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@treasury_table} (
      guild_id INT NOT NULL,
      resource_type VARCHAR(32) NOT NULL,
      amount BIGINT DEFAULT 0,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (guild_id, resource_type)
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@transfer_log_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transfer_type VARCHAR(20) NOT NULL,
      from_id INT,
      to_id INT,
      guild_id INT,
      resource_type VARCHAR(32) NOT NULL,
      amount BIGINT NOT NULL,
      note VARCHAR(255),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_from (from_id, created_at),
      INDEX idx_to (to_id, created_at),
      INDEX idx_guild (guild_id, created_at)
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@tax_settings_table} (
      guild_id INT PRIMARY KEY,
      tax_rate FLOAT DEFAULT 0.0,
      tax_enabled TINYINT(1) DEFAULT 0,
      updated_at DATETIME NOT NULL
    )
    """)
  rescue
    e -> Logger.error("GuildEconomy.ensure_tables: #{inspect(e)}")
  end

  # ── Treasury queries ───────────────────────────────────────────

  @doc """
  Get all resources in a guild's treasury.
  Returns a map of `%{"gold" => 500, "wood" => 120, ...}`.
  """
  @spec get_treasury(integer()) :: %{String.t() => integer()}
  def get_treasury(guild_id) do
    case Repo.query(
           "SELECT resource_type, amount FROM #{@treasury_table} WHERE guild_id = ?",
           [guild_id]
         ) do
      {:ok, %{rows: rows}} -> Map.new(rows, fn [t, a] -> {t, a || 0} end)
      _ -> %{}
    end
  rescue
    _ -> %{}
  end

  @doc """
  Get a single resource amount from the guild treasury.
  """
  @spec get_treasury_resource(integer(), String.t()) :: integer()
  def get_treasury_resource(guild_id, resource_type) do
    case Repo.query(
           "SELECT amount FROM #{@treasury_table} WHERE guild_id = ? AND resource_type = ?",
           [guild_id, resource_type]
         ) do
      {:ok, %{rows: [[a]]}} -> a || 0
      _ -> 0
    end
  rescue
    _ -> 0
  end

  # ── Deposit ────────────────────────────────────────────────────

  @doc """
  Player deposits resources into the guild treasury.
  Deducts from the player's personal resource pool (via Strategy.Economy)
  and adds to the guild treasury. Logs the transaction.

  Returns `{:ok, new_treasury_amount}` or `{:error, reason}`.
  """
  @spec deposit(integer(), integer(), String.t(), pos_integer()) ::
          {:ok, integer()} | {:error, atom()}
  def deposit(guild_id, char_id, resource_type, amount)
      when is_integer(amount) and amount > 0 do
    with :ok <- verify_membership(guild_id, char_id),
         {:ok, _remaining} <- deduct_player_resource(char_id, resource_type, amount) do
      add_treasury_resource(guild_id, resource_type, amount)
      log_transfer("deposit", char_id, nil, guild_id, resource_type, amount, "Player deposit")
      new_amount = get_treasury_resource(guild_id, resource_type)
      {:ok, new_amount}
    end
  end

  def deposit(_guild_id, _char_id, _resource_type, _amount), do: {:error, :invalid_amount}

  # ── Withdraw ───────────────────────────────────────────────────

  @doc """
  Withdraw resources from the guild treasury to a player.
  Requires the player to hold a rank in `#{inspect(@withdraw_ranks)}`.
  Adds to the player's personal pool and deducts from treasury. Logged.

  Returns `{:ok, withdrawn_amount}` or `{:error, reason}`.
  """
  @spec withdraw(integer(), integer(), String.t(), pos_integer()) ::
          {:ok, integer()} | {:error, atom()}
  def withdraw(guild_id, char_id, resource_type, amount)
      when is_integer(amount) and amount > 0 do
    with :ok <- verify_membership(guild_id, char_id),
         :ok <- verify_withdraw_rank(guild_id, char_id),
         :ok <- check_treasury_balance(guild_id, resource_type, amount) do
      deduct_treasury_resource(guild_id, resource_type, amount)
      add_player_resource(char_id, resource_type, amount)
      log_transfer("withdraw", nil, char_id, guild_id, resource_type, amount, "Guild withdrawal")
      {:ok, amount}
    end
  end

  def withdraw(_guild_id, _char_id, _resource_type, _amount), do: {:error, :invalid_amount}

  # ── Player-to-player transfer ──────────────────────────────────

  @doc """
  Direct player-to-player resource transfer with audit logging.
  Deducts from sender and credits receiver. No guild involvement required.

  Returns `{:ok, amount_transferred}` or `{:error, reason}`.
  """
  @spec transfer(integer(), integer(), String.t(), pos_integer(), String.t() | nil) ::
          {:ok, integer()} | {:error, atom()}
  def transfer(from_char_id, to_char_id, resource_type, amount, note \\ nil)
      when is_integer(amount) and amount > 0 do
    if from_char_id == to_char_id do
      {:error, :cannot_transfer_to_self}
    else
      with {:ok, _remaining} <- deduct_player_resource(from_char_id, resource_type, amount) do
        add_player_resource(to_char_id, resource_type, amount)

        log_transfer(
          "player_transfer",
          from_char_id,
          to_char_id,
          nil,
          resource_type,
          amount,
          note || "Player transfer"
        )

        {:ok, amount}
      end
    end
  end

  # ── Transfer history ───────────────────────────────────────────

  @doc """
  Get recent transfers involving a player (as sender or receiver).
  Returns a list of transfer records, most recent first.
  """
  @spec get_transfer_history(integer(), pos_integer()) :: [map()]
  def get_transfer_history(char_id, limit \\ 50) do
    case Repo.query(
           """
           SELECT id, transfer_type, from_id, to_id, guild_id, resource_type, amount, note, created_at
           FROM #{@transfer_log_table}
           WHERE from_id = ? OR to_id = ?
           ORDER BY created_at DESC
           LIMIT ?
           """,
           [char_id, char_id, limit]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, &parse_transfer_row/1)

      _ ->
        []
    end
  rescue
    _ -> []
  end

  @doc """
  Get recent transfers for a guild (deposits, withdrawals, tax).
  """
  @spec get_guild_transfer_history(integer(), pos_integer()) :: [map()]
  def get_guild_transfer_history(guild_id, limit \\ 50) do
    case Repo.query(
           """
           SELECT id, transfer_type, from_id, to_id, guild_id, resource_type, amount, note, created_at
           FROM #{@transfer_log_table}
           WHERE guild_id = ?
           ORDER BY created_at DESC
           LIMIT ?
           """,
           [guild_id, limit]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, &parse_transfer_row/1)

      _ ->
        []
    end
  rescue
    _ -> []
  end

  # ── Tax system ─────────────────────────────────────────────────

  @doc """
  Get the configured tax rate for a guild. Returns a float 0.0-1.0.
  Defaults to 0.0 (no tax) if not configured.
  """
  @spec tax_rate(integer()) :: float()
  def tax_rate(guild_id) do
    case Repo.query(
           "SELECT tax_rate, tax_enabled FROM #{@tax_settings_table} WHERE guild_id = ?",
           [guild_id]
         ) do
      {:ok, %{rows: [[rate, enabled]]}} ->
        if enabled == 1, do: (rate || 0.0) / 1, else: 0.0

      _ ->
        0.0
    end
  rescue
    _ -> 0.0
  end

  @doc """
  Set the tax rate for a guild. Only the guild leader should call this
  (caller is responsible for rank-checking). Rate is clamped to 0.0-0.50
  (max 50% tax).
  """
  @spec set_tax_rate(integer(), float()) :: :ok | {:error, atom()}
  def set_tax_rate(guild_id, rate) when is_number(rate) do
    clamped = max(0.0, min(0.50, rate / 1))

    Repo.query(
      """
      INSERT INTO #{@tax_settings_table} (guild_id, tax_rate, tax_enabled, updated_at)
      VALUES (?, ?, 1, NOW())
      ON DUPLICATE KEY UPDATE tax_rate = VALUES(tax_rate), tax_enabled = 1, updated_at = NOW()
      """,
      [guild_id, clamped]
    )

    :ok
  rescue
    _ -> {:error, :db_error}
  end

  @doc """
  Disable tax collection for a guild.
  """
  @spec disable_tax(integer()) :: :ok
  def disable_tax(guild_id) do
    Repo.query(
      "UPDATE #{@tax_settings_table} SET tax_enabled = 0, updated_at = NOW() WHERE guild_id = ?",
      [guild_id]
    )

    :ok
  rescue
    _ -> :ok
  end

  @doc """
  Apply guild tax to a player's income. Calculates the tax amount based
  on the guild's configured rate, deducts it from the income, and deposits
  it into the guild treasury.

  Call this whenever a guild member earns resources (battle rewards, quest
  completion, trade profit, etc.).

  Returns `{net_income, tax_amount}` — the amounts after and of the tax.
  If the player is not in a guild or tax is 0, returns `{income_amount, 0}`.
  """
  @spec apply_tax(integer(), integer(), String.t(), pos_integer()) ::
          {integer(), integer()}
  def apply_tax(guild_id, char_id, resource_type, income_amount)
      when is_integer(income_amount) and income_amount > 0 do
    rate = tax_rate(guild_id)

    if rate > 0.0 do
      tax_amount = max(1, trunc(income_amount * rate))
      net_income = income_amount - tax_amount

      add_treasury_resource(guild_id, resource_type, tax_amount)

      log_transfer(
        "tax",
        char_id,
        nil,
        guild_id,
        resource_type,
        tax_amount,
        "Auto-tax at #{Float.round(rate * 100, 1)}%"
      )

      {net_income, tax_amount}
    else
      {income_amount, 0}
    end
  end

  def apply_tax(_guild_id, _char_id, _resource_type, income_amount), do: {income_amount, 0}

  # ── Treasury mutations ─────────────────────────────────────────

  defp add_treasury_resource(guild_id, resource_type, amount) do
    Repo.query(
      """
      INSERT INTO #{@treasury_table} (guild_id, resource_type, amount, updated_at)
      VALUES (?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount), updated_at = NOW()
      """,
      [guild_id, resource_type, amount]
    )
  end

  defp deduct_treasury_resource(guild_id, resource_type, amount) do
    Repo.query(
      "UPDATE #{@treasury_table} SET amount = amount - ?, updated_at = NOW() WHERE guild_id = ? AND resource_type = ?",
      [amount, guild_id, resource_type]
    )
  end

  defp check_treasury_balance(guild_id, resource_type, amount) do
    current = get_treasury_resource(guild_id, resource_type)

    if current >= amount do
      :ok
    else
      {:error, :insufficient_treasury}
    end
  end

  # ── Player resource bridge ─────────────────────────────────────
  # Delegates to Strategy.Economy for player-level resource tracking.

  defp deduct_player_resource(char_id, resource_type, amount) do
    TePhoenix.Strategy.Economy.spend_resource(char_id, resource_type, amount)
  end

  defp add_player_resource(char_id, resource_type, amount) do
    TePhoenix.Strategy.Economy.add_resource(char_id, resource_type, amount)
  end

  # ── Guild membership checks ────────────────────────────────────

  defp verify_membership(guild_id, char_id) do
    case Repo.query(
           "SELECT id FROM guild_members WHERE guild_id = ? AND character_id = ? AND is_active = 1",
           [guild_id, char_id]
         ) do
      {:ok, %{rows: [_row | _]}} -> :ok
      _ -> {:error, :not_a_member}
    end
  rescue
    _ -> {:error, :not_a_member}
  end

  defp verify_withdraw_rank(guild_id, char_id) do
    case Repo.query(
           "SELECT `rank` FROM guild_members WHERE guild_id = ? AND character_id = ? AND is_active = 1",
           [guild_id, char_id]
         ) do
      {:ok, %{rows: [[rank]]}} ->
        if MapSet.member?(@withdraw_ranks, rank) do
          :ok
        else
          {:error, :insufficient_rank}
        end

      _ ->
        {:error, :not_a_member}
    end
  rescue
    _ -> {:error, :not_a_member}
  end

  # ── Logging ────────────────────────────────────────────────────

  defp log_transfer(type, from_id, to_id, guild_id, resource_type, amount, note) do
    Repo.query(
      """
      INSERT INTO #{@transfer_log_table}
        (transfer_type, from_id, to_id, guild_id, resource_type, amount, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      """,
      [type, from_id, to_id, guild_id, resource_type, amount, note]
    )
  rescue
    e -> Logger.error("GuildEconomy.log_transfer failed: #{inspect(e)}")
  end

  defp parse_transfer_row([id, type, from, to, guild, res, amt, note, created]) do
    %{
      id: id,
      transfer_type: type,
      from_id: from,
      to_id: to,
      guild_id: guild,
      resource_type: res,
      amount: amt,
      note: note,
      created_at: created
    }
  end
end
