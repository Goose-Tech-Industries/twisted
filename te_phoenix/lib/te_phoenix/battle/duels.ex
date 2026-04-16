defmodule TePhoenix.Battle.Duels do
  @moduledoc """
  Duel challenge system — manages pending duel requests with auto-expiry.
  Replaces the Node.js pendingDuels Map from socket-battle.js.

  Uses an Agent to hold pending duels in-process. Each duel expires after 60s
  via Process.send_after on the caller's channel process.
  """

  use Agent
  require Logger

  alias TePhoenix.Repo

  defstruct [
    :id,
    :challenger_id,
    :challenger_name,
    :challenger_level,
    :challenger_user_id,
    :target_id,
    :wager_amount,
    :expires_at,
    :timer_ref
  ]

  def start_link(_opts) do
    Agent.start_link(fn -> %{} end, name: __MODULE__)
  end

  def child_spec(opts) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [opts]},
      type: :worker
    }
  end

  @doc "Create a new duel challenge. Returns {:ok, duel} or {:error, reason}."
  def challenge(challenger_id, challenger_name, challenger_level, challenger_user_id, target_id, wager \\ 0) do
    wager = max(0, trunc(wager || 0))

    # Check wager affordability
    if wager > 0 do
      result = Repo.query("SELECT currency FROM users WHERE id=?", [challenger_user_id])
      case result do
        {:ok, %{rows: [[currency]]}} when currency >= wager -> :ok
        _ -> {:error, "Insufficient gold for that wager."}
      end
    else
      :ok
    end
    |> case do
      :ok ->
        # Check no existing pending duel between these two
        existing = Agent.get(__MODULE__, fn duels ->
          Enum.any?(duels, fn {_id, d} ->
            d.challenger_id == challenger_id and d.target_id == target_id
          end)
        end)

        if existing do
          {:error, "You already have a pending challenge with this player."}
        else
          duel_id = "duel_#{challenger_id}_#{target_id}_#{System.system_time(:millisecond)}"

          duel = %__MODULE__{
            id: duel_id,
            challenger_id: challenger_id,
            challenger_name: challenger_name,
            challenger_level: challenger_level,
            challenger_user_id: challenger_user_id,
            target_id: target_id,
            wager_amount: wager,
            expires_at: System.system_time(:millisecond) + 60_000
          }

          Agent.update(__MODULE__, fn duels -> Map.put(duels, duel_id, duel) end)
          {:ok, duel}
        end

      {:error, _} = err -> err
    end
  end

  @doc "Accept a duel. Returns {:ok, duel} or {:error, reason}."
  def accept(request_id, accepter_char_id) do
    case Agent.get_and_update(__MODULE__, fn duels ->
      case Map.pop(duels, request_id) do
        {nil, duels} -> {:not_found, duels}
        {duel, duels} -> {{:found, duel}, duels}
      end
    end) do
      :not_found ->
        {:error, "Duel request expired or not found."}

      {:found, duel} ->
        if duel.target_id != accepter_char_id do
          # Put it back
          Agent.update(__MODULE__, fn duels -> Map.put(duels, request_id, duel) end)
          {:error, "This challenge was not for you."}
        else
          # Cancel timer if set
          if duel.timer_ref, do: Process.cancel_timer(duel.timer_ref)

          # Wager deduction is handled by the caller (DuelHandler)
          # to ensure both players' balances are validated first
          {:ok, duel}
        end
    end
  end

  @doc "Decline a duel. Returns :ok or :not_found."
  def decline(request_id, decliner_char_id) do
    case Agent.get_and_update(__MODULE__, fn duels ->
      case Map.pop(duels, request_id) do
        {nil, duels} -> {:not_found, duels}
        {duel, duels} ->
          if duel.target_id == decliner_char_id do
            if duel.timer_ref, do: Process.cancel_timer(duel.timer_ref)
            {:ok, duels}
          else
            {{:wrong_target, duel}, Map.put(duels, request_id, duel)}
          end
      end
    end) do
      :not_found -> :not_found
      :ok -> :ok
      {:wrong_target, _} -> :not_found
    end
  end

  @doc "Expire a duel by ID. Called from timer callback."
  def expire(request_id) do
    Agent.get_and_update(__MODULE__, fn duels ->
      case Map.pop(duels, request_id) do
        {nil, duels} -> {nil, duels}
        {duel, duels} -> {duel, duels}
      end
    end)
  end

  @doc "Set the timer ref on a duel (for expiry cancellation)."
  def set_timer(request_id, timer_ref) do
    Agent.update(__MODULE__, fn duels ->
      case Map.get(duels, request_id) do
        nil -> duels
        duel -> Map.put(duels, request_id, %{duel | timer_ref: timer_ref})
      end
    end)
  end
end
