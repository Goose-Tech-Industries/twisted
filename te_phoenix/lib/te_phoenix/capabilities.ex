defmodule TePhoenix.Capabilities do
  @moduledoc """
  Capability module system — the architectural backbone for Twisted Engine.

  Every game system (combat, inventory, dialogue, economy, fog, pathfinding,
  crafting, magic, social, quests, achievements, npc_behavior, …) is registered
  as a *capability module*. A capability:

    * declares an `id`, human name, version, and dependencies
    * lists which UI panels it owns (`:combat_hub`, `:dialogue_editor`, etc.)
    * lists which DB tables it needs
    * lists which game genres it's a default for
    * is independently togglable per project

  This module exposes pure helpers plus convenience wrappers around the
  `TePhoenix.Capabilities.Registry` GenServer for runtime queries and
  enable/disable. AdminSauce LiveViews call `enabled?/1` to gate panel
  visibility, and the onboarding wizard calls `seed_genre/1` to switch on
  the right modules for a chosen genre.

  Storage: the per-project enabled state is persisted in the
  `game_capability_state` table. Schema is auto-created on first call.

  ## Example

      iex> TePhoenix.Capabilities.list_modules() |> Enum.map(& &1.id) |> Enum.sort()
      [:achievements, :combat, :crafting, :dialogue, :economy, :fog_of_war,
       :inventory, :magic, :npc_behavior, :pathfinding, :quests, :social]

      iex> TePhoenix.Capabilities.enabled?(:combat)
      true

      iex> TePhoenix.Capabilities.set_enabled(:dialogue, false)
      :ok

  All built-in modules are declared in `built_in_modules/0` below.
  """

  alias TePhoenix.Capabilities.Registry, as: CapRegistry

  @typedoc """
  A capability module manifest. All keys are required except `:requires`,
  `:db_tables`, and `:ui_panels` which default to `[]`.
  """
  @type manifest :: %{
          required(:id) => atom(),
          required(:name) => String.t(),
          required(:description) => String.t(),
          required(:version) => String.t(),
          required(:default_enabled) => boolean(),
          required(:provides) => [atom()],
          required(:genres) => [atom()],
          optional(:requires) => [atom()],
          optional(:db_tables) => [String.t()],
          optional(:ui_panels) => [atom()]
        }

  # ── Built-in capability declarations ─────────────────────────

  @doc "All built-in capability manifests shipped with the engine."
  @spec built_in_modules() :: [manifest()]
  def built_in_modules do
    [
      %{
        id: :combat,
        name: "Combat",
        description: "Turn-based + real-time battle, damage formulas, status effects, defenses.",
        version: "1.0.0",
        default_enabled: true,
        provides: [:battle, :damage, :stats, :status_effects],
        requires: [],
        db_tables: ~w(battles combatants battle_log),
        ui_panels: [:combat_hub, :battle_inspector, :technique_editor],
        genres: [:rpg, :tactics, :roguelike, :arpg, :moba, :rts]
      },
      %{
        id: :inventory,
        name: "Inventory",
        description: "Items, equipment slots, weight, stacking, hotbar, loot tables.",
        version: "1.0.0",
        default_enabled: true,
        provides: [:items, :equipment, :loot],
        requires: [],
        db_tables: ~w(items character_items equipment loot_tables),
        ui_panels: [:inventory_panel, :item_editor, :loot_table_editor],
        genres: [:rpg, :roguelike, :arpg, :survival]
      },
      %{
        id: :dialogue,
        name: "Dialogue",
        description: "NPC dialogue trees, branching, conditionals, voice line hooks.",
        version: "1.0.0",
        default_enabled: false,
        provides: [:npc_dialogue, :dialogue_tree],
        requires: [],
        db_tables: ~w(dialogue_trees dialogue_nodes),
        ui_panels: [:dialogue_editor, :voice_panel],
        genres: [:rpg, :vn, :adventure]
      },
      %{
        id: :economy,
        name: "Economy",
        description: "Currencies, shops, pricing curves, inflation, bartering.",
        version: "1.0.0",
        default_enabled: true,
        provides: [:currency, :shops, :prices],
        requires: [:inventory],
        db_tables: ~w(shops currencies price_history),
        ui_panels: [:economy_hub, :shop_editor],
        genres: [:rpg, :tycoon, :survival, :arpg]
      },
      %{
        id: :fog_of_war,
        name: "Fog of War",
        description: "Vision radius, explored-tile memory, line-of-sight reveals.",
        version: "1.0.0",
        default_enabled: false,
        provides: [:fog, :vision, :line_of_sight],
        requires: [],
        db_tables: ~w(fog_state),
        ui_panels: [:fog_settings],
        genres: [:rts, :roguelike, :tactics, :horror]
      },
      %{
        id: :pathfinding,
        name: "Pathfinding",
        description: "A* grid pathfinding, click-to-move, path queues, group movement.",
        version: "1.0.0",
        default_enabled: false,
        provides: [:astar, :click_to_move, :path_queue],
        requires: [],
        db_tables: [],
        ui_panels: [:pathfinding_debug],
        genres: [:rts, :arpg, :roguelike, :tower_defense, :moba]
      },
      %{
        id: :crafting,
        name: "Crafting",
        description: "Recipes, ingredients, crafting stations, skill XP per discipline.",
        version: "1.0.0",
        default_enabled: false,
        provides: [:recipes, :crafting_stations, :crafting_xp],
        requires: [:inventory],
        db_tables: ~w(craft_recipes crafting_stations),
        ui_panels: [:crafting_hub, :recipe_editor],
        genres: [:rpg, :survival, :mmo]
      },
      %{
        id: :magic,
        name: "Magic",
        description: "Spells, mana, schools of magic, cooldowns, area effects.",
        version: "1.0.0",
        default_enabled: false,
        provides: [:spells, :mana, :schools],
        requires: [:combat],
        db_tables: ~w(spells spell_schools),
        ui_panels: [:magic_hub, :spell_editor],
        genres: [:rpg, :roguelike, :arpg, :tactics]
      },
      %{
        id: :social,
        name: "Social",
        description: "Friends, parties, guilds, factions, reputation tracking.",
        version: "1.0.0",
        default_enabled: false,
        provides: [:parties, :guilds, :factions, :reputation],
        requires: [],
        db_tables: ~w(parties guilds factions reputation),
        ui_panels: [:social_hub, :guild_editor],
        genres: [:rpg, :mmo, :moba]
      },
      %{
        id: :quests,
        name: "Quests",
        description: "Quest DAGs, objectives, rewards, journal UI.",
        version: "1.0.0",
        default_enabled: false,
        provides: [:quests, :objectives, :journal],
        requires: [],
        db_tables: ~w(quests quest_objectives quest_progress),
        ui_panels: [:quest_designer, :journal_panel],
        genres: [:rpg, :adventure, :mmo]
      },
      %{
        id: :achievements,
        name: "Achievements",
        description: "Hidden + visible achievements, progress tracking, rewards.",
        version: "1.0.0",
        default_enabled: false,
        provides: [:achievements, :achievement_progress],
        requires: [],
        db_tables: ~w(achievements achievement_progress),
        ui_panels: [:achievement_editor],
        genres: [:rpg, :roguelike, :mmo, :competitive]
      },
      %{
        id: :spawn_zones,
        name: "Spawn Zones",
        description: "Periodic NPC spawning from rect zones with weighted encounter tables.",
        version: "1.0.0",
        default_enabled: true,
        provides: [:spawn_runtime, :encounter_tables],
        requires: [:npc_behavior],
        db_tables: ~w(game_map_spawn_zones game_npcs),
        ui_panels: [:spawn_zone_tool],
        genres: [:rpg, :roguelike, :arpg, :survival, :tactics]
      },
      %{
        id: :scripting,
        name: "Visual Scripting",
        description: "Drag-drop node graph editor for events, dialogue, quests, world rules.",
        version: "1.0.0",
        default_enabled: true,
        provides: [:script_graphs, :script_interpreter, :script_runtime],
        requires: [],
        db_tables: ~w(game_scripts),
        ui_panels: [:script_list, :script_editor],
        genres: [:rpg, :vn, :adventure, :tactics, :roguelike, :rts, :tower_defense]
      },
      %{
        id: :matchmaking,
        name: "Matchmaking & Lobbies",
        description: "Queue-based matchmaking, lobby ready-check, match lifecycle with timed phases and post-match rewards.",
        version: "1.0.0",
        default_enabled: true,
        provides: [:match_queue, :match_lobby, :match_lifecycle],
        requires: [:combat],
        db_tables: ~w(game_match_modes),
        ui_panels: [:match_modes_editor],
        genres: [:moba, :rts, :horror, :rpg, :tactics, :tower_defense]
      },
      %{
        id: :waves,
        name: "Wave Scheduler",
        description: "Timed enemy wave sequences — tower defense rounds, MOBA lane minions, horde survival. Data-driven, scalable, loopable.",
        version: "1.0.0",
        default_enabled: true,
        provides: [:wave_sequences, :spawn_scheduling],
        requires: [:spawn_zones],
        db_tables: ~w(game_wave_defs),
        ui_panels: [:wave_editor],
        genres: [:tower_defense, :rts, :moba, :roguelike, :rpg, :horror]
      },
      %{
        id: :objectives,
        name: "Objectives & Interactables",
        description: "Generic world objectives: towers, generators, switches, capture points, collect quests, survive waves. Data-driven, works across all game modes.",
        version: "1.0.0",
        default_enabled: true,
        provides: [:objectives, :interactables, :hold_to_interact],
        requires: [],
        db_tables: ~w(game_objective_defs game_objective_instances),
        ui_panels: [:objectives_editor],
        genres: [:rpg, :rts, :moba, :tower_defense, :horror, :roguelike, :tactics, :deckbuilder]
      },
      %{
        id: :npc_behavior,
        name: "NPC Behavior",
        description: "AI brain types, schedules, wander patterns, faction reactions.",
        version: "1.0.0",
        default_enabled: true,
        provides: [:npc_brain, :ai_schedules],
        requires: [],
        db_tables: ~w(npc_brains npc_schedules),
        ui_panels: [:npc_editor, :brain_editor],
        genres: [:rpg, :tactics, :rts, :mmo, :horror]
      }
    ]
  end

  @doc "Find a built-in manifest by id."
  @spec get(atom()) :: manifest() | nil
  def get(id) when is_atom(id) do
    Enum.find(built_in_modules(), &(&1.id == id))
  end

  @doc "List all known capability modules."
  @spec list_modules() :: [manifest()]
  def list_modules, do: built_in_modules()

  @doc "List capability ids that are sensible defaults for a given genre."
  @spec list_for_genre(atom()) :: [atom()]
  def list_for_genre(genre) when is_atom(genre) do
    for m <- built_in_modules(), genre in m.genres, do: m.id
  end

  @doc "Whether a capability is currently enabled for the active project."
  @spec enabled?(atom()) :: boolean()
  def enabled?(id) when is_atom(id), do: CapRegistry.enabled?(id)

  @doc "Toggle a capability on or off. Persists to DB."
  @spec set_enabled(atom(), boolean()) :: :ok
  def set_enabled(id, on?) when is_atom(id) and is_boolean(on?),
    do: CapRegistry.set_enabled(id, on?)

  @doc """
  Activate exactly the modules that are sensible defaults for `genre`,
  switching all others off. Used by the onboarding wizard.

  Returns the list of newly-enabled capability ids.
  """
  @spec seed_genre(atom()) :: [atom()]
  def seed_genre(genre) when is_atom(genre) do
    enable = MapSet.new(list_for_genre(genre))

    for m <- built_in_modules() do
      set_enabled(m.id, MapSet.member?(enable, m.id))
    end

    MapSet.to_list(enable)
  end

  @doc """
  Validate dependencies — every enabled module's `requires` must also be
  enabled. Returns `{:ok, []}` when satisfied or `{:error, [{id, missing}]}`
  with the list of unmet requirements.
  """
  @spec validate() :: {:ok, []} | {:error, [{atom(), [atom()]}]}
  def validate do
    enabled = MapSet.new(for m <- built_in_modules(), enabled?(m.id), do: m.id)

    issues =
      for m <- built_in_modules(),
          enabled?(m.id),
          missing =
            (m[:requires] || []) |> Enum.reject(&MapSet.member?(enabled, &1)),
          missing != [],
          do: {m.id, missing}

    if issues == [], do: {:ok, []}, else: {:error, issues}
  end

  @doc """
  Boot pass — called from `Application.start/2` after the registry is up.
  Validates dependencies, logs the resolved load order, and returns
  `:ok` or `{:error, issues}`. Logging the order makes capability boot
  visible in production logs so a missing module isn't silent.

  Module *runtimes* (e.g. `SpawnZoneTicker`, `MovementTicker`) are still
  in the supervision tree directly — they self-gate by checking
  `enabled?/1` on every tick. This boot pass is the contract that says
  "if you depend on module X being on for module Y, the engine
  acknowledges the dependency at boot time, not at first tick."
  """
  @spec boot() :: :ok | {:error, term()}
  def boot do
    require Logger

    case validate() do
      {:ok, []} ->
        order = load_order()
        Logger.info("[Capabilities] Boot OK — load order: #{Enum.map_join(order, " → ", &to_string/1)}")
        :ok

      {:error, issues} ->
        Logger.error("[Capabilities] Boot FAILED — unmet dependencies: #{inspect(issues)}")
        {:error, issues}
    end
  end

  @doc """
  Resolved load order — topological sort of enabled modules so that every
  module loads after the modules it requires. Used at boot to bring up
  systems in dependency order.
  """
  @spec load_order() :: [atom()]
  def load_order do
    enabled = for m <- built_in_modules(), enabled?(m.id), do: m

    visit = fn id, acc, visited, visit_fn ->
      cond do
        MapSet.member?(visited, id) ->
          {acc, visited}

        true ->
          visited = MapSet.put(visited, id)
          mod = Enum.find(enabled, &(&1.id == id))

          {acc, visited} =
            (mod && mod[:requires] || [])
            |> Enum.reduce({acc, visited}, fn dep, {a, v} ->
              visit_fn.(dep, a, v, visit_fn)
            end)

          {acc ++ [id], visited}
      end
    end

    {order, _} =
      Enum.reduce(enabled, {[], MapSet.new()}, fn m, {a, v} ->
        visit.(m.id, a, v, visit)
      end)

    order
  end
end
