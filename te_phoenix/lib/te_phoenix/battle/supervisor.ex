defmodule TePhoenix.Battle.Supervisor do
  @moduledoc """
  DynamicSupervisor for battle processes.
  Each active battle runs as its own GenServer under this supervisor.
  Crashed battles restart cleanly without affecting other battles.
  """

  use DynamicSupervisor

  def start_link(init_arg) do
    DynamicSupervisor.start_link(__MODULE__, init_arg, name: __MODULE__)
  end

  @impl true
  def init(_init_arg) do
    DynamicSupervisor.init(strategy: :one_for_one)
  end

  @doc """
  Start a new battle. Returns {:ok, pid} or {:error, reason}.

  ## Options
    * `:id` - Battle ID (required)
    * `:teams` - Map of team_id => [combatant_stats] (required)
    * `:type` - :pvp | :pve | :party_pve (default :pvp)
  """
  def start_battle(opts) do
    DynamicSupervisor.start_child(__MODULE__, {TePhoenix.Battle.State, opts})
  end

  @doc "Stop a battle process"
  def stop_battle(battle_id) do
    case Registry.lookup(TePhoenix.BattleRegistry, battle_id) do
      [{pid, _}] -> DynamicSupervisor.terminate_child(__MODULE__, pid)
      [] -> {:error, :not_found}
    end
  end

  @doc "List all active battle IDs"
  def list_battles do
    Registry.select(TePhoenix.BattleRegistry, [{{:"$1", :_, :_}, [], [:"$1"]}])
  end

  @doc "Count active battles"
  def count do
    DynamicSupervisor.count_children(__MODULE__).active
  end
end
