defmodule TePhoenix.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      TePhoenixWeb.Telemetry,
      TePhoenix.Repo,
      {DNSCluster, query: Application.get_env(:te_phoenix, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: TePhoenix.PubSub},
      TePhoenixWeb.MapEditorPresence,
      # Battle system: Registry for naming battle processes, DynamicSupervisor for lifecycle
      {Registry, keys: :unique, name: TePhoenix.BattleRegistry},
      TePhoenix.Battle.Supervisor,
      TePhoenix.Battle.Duels,
      # Game world: online player state + map cache + scheduler
      TePhoenix.Game.PlayerRegistry,
      TePhoenix.Game.AdminPresence,
      TePhoenix.Game.AutoPilot,
      TePhoenix.Game.MapData,
      TePhoenix.Scheduler,
      # Hyperbolic Time Chamber training sessions
      TePhoenix.Game.HTCSession,
      # Campaign ruleset action slot engine
      TePhoenix.Game.ActionSlots,
      # Capability module registry — backbone for genre/feature toggling
      TePhoenix.Capabilities.Registry,
      # Data-driven status effects + trigger rules for the battle engine
      TePhoenix.Battle.StatusRegistry,
      # Generic objective/interactable system (towers, generators, switches, quests)
      TePhoenix.Objectives.Registry,
      TePhoenix.Objectives.Ticker,
      # Wave/spawn scheduler (TD waves, MOBA minions, horde survival)
      TePhoenix.Waves.Registry,
      TePhoenix.Waves.Scheduler,
      # Strategy economy (MSWar/OGame/Tribal Wars: buildings, armies, upkeep)
      TePhoenix.Strategy.EconomyTicker,
      # Match lifecycle (queue → lobby → play → results)
      TePhoenix.Matches.Registry,
      TePhoenix.Matches.Queue,
      {Registry, keys: :unique, name: TePhoenix.MatchLobbyRegistry},
      {DynamicSupervisor, name: TePhoenix.Matches.Supervisor, strategy: :one_for_one},
      # Per-user server-side clipboard (script editor + map stamps)
      TePhoenix.ClipboardServer,
      # Periodic NPC spawning from spawn zones (capability-gated, no-ops when off)
      TePhoenix.World.SpawnZoneTicker,
      # SOTA character state in-memory cache and atomic write-behind engine
      TePhoenix.Game.CharacterState,
      # Hot-state decoupled in-memory write-behind engine
      TePhoenix.Game.HotState,
      # Movement ticker — consumes pathfinding queues into character moves
      TePhoenix.Game.MovementTicker,
      # Autonomous living society engine ("Westworld" simulation loop)
      TePhoenix.World.AutonomousSociety,
      # Living legend chronicler — records player exploits and tavern ballads
      TePhoenix.World.LegendChronicler,
      # Circadian Day/Night cycle engine & nocturnal scheduler
      TePhoenix.World.CircadianClock,
      # Start to serve requests, typically the last entry
      TePhoenixWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: TePhoenix.Supervisor]
    result = Supervisor.start_link(children, opts)

    # Validate capability dependencies + log resolved load order.
    # Runtimes self-gate on enabled? so we don't conditionally start them
    # here — the boot pass exists to surface missing deps loudly at boot
    # rather than silently at first tick.
    case result do
      {:ok, _} ->
        TePhoenix.Capabilities.boot()
        # Warm the tile passability cache so movement validation doesn't
        # fall back to "all non-zero tiles are walkable" on cold boots.
        TePhoenix.Game.TileCache.warm()
        result

      _ ->
        result
    end
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    TePhoenixWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
