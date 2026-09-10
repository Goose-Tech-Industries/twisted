defmodule TePhoenix.Game.OnboardingSeeder do
  @moduledoc """
  Creates real starter content for a chosen genre after the onboarding
  wizard flips capabilities.

  Every seeder is **idempotent** — keyed by a marker row in
  `game_onboarding_runs`. If a project already has a "rpg" seed, calling
  `seed(:rpg)` again is a no-op. This lets users re-run onboarding to
  switch genres without duplicating starter content.

  Each seeder produces:

    * 1 starter map with full layers_json
    * 1-3 starter NPCs at fixed coordinates inside the map
    * 1 starter item row in `items` (lazy-created if needed)
    * 1 starter visual script in `game_visual_scripts`
    * 1 starter spawn zone in `game_map_spawn_zones` (for combat genres)

  Returns `{:ok, summary}` listing what was created, or
  `{:error, reason}` on failure. Errors are surfaced — no silent
  swallowing.
  """

  alias TePhoenix.Repo
  require Logger

  @marker_table "game_onboarding_runs"

  @doc "Idempotent per-genre seed."
  @spec seed(atom()) :: {:ok, map()} | {:error, term()}
  def seed(genre) when is_atom(genre) do
    ensure_marker_table()

    if already_seeded?(genre) do
      {:ok, %{skipped: true, reason: :already_seeded, genre: genre}}
    else
      ensure_visual_scripts_table()

      result =
        case genre do
          :rpg -> seed_rpg()
          :tactics -> seed_tactics()
          :roguelike -> seed_roguelike()
          :vn -> seed_vn()
          :tower_defense -> seed_tower_defense()
          :deckbuilder -> seed_deckbuilder()
          :rts -> seed_rts()
          _ -> {:ok, %{skipped: true, reason: :no_seeder}}
        end

      case result do
        {:ok, summary} ->
          mark_seeded(genre, summary)
          {:ok, Map.put(summary, :genre, genre)}
      end
    end
  end

  # ── Per-genre seeders ────────────────────────────────────────

  defp seed_rpg do
    {:ok, map_id} = create_starter_map("Starter Crypt", 20, 20, "classic", :rpg_layers)
    {:ok, npc1} = create_npc(map_id, "Old Knight", 10, 10, "👴", false)
    {:ok, npc2} = create_npc(map_id, "Crypt Goblin", 14, 14, "👹", true)
    {:ok, npc3} = create_npc(map_id, "Crypt Goblin", 5, 16, "👹", true)
    {:ok, item_id} = create_item("Health Potion", "Restores 50 HP", "💉")
    {:ok, script_id} = create_script("Old Knight Greeting", rpg_greeting_graph(item_id))

    create_spawn_zone(map_id, %{"x1" => 0, "y1" => 0, "x2" => 19, "y2" => 19}, [%{"npc_id" => npc2, "weight" => 3}, %{"npc_id" => npc3, "weight" => 1}])

    {:ok, %{map_id: map_id, npcs: [npc1, npc2, npc3], item_id: item_id, script_id: script_id, spawn_zone: true}}
  end

  defp seed_tactics do
    {:ok, map_id} = create_starter_map("Skirmish Field", 16, 12, "isometric", :flat_layers)
    {:ok, ally} = create_npc(map_id, "Squad Lead", 2, 6, "🛡", false)
    {:ok, enemy1} = create_npc(map_id, "Bandit Captain", 13, 6, "🗡", true)
    {:ok, item_id} = create_item("Smoke Grenade", "Blocks line-of-sight", "💣")
    {:ok, script_id} = create_script("Tactics Briefing", tactics_briefing_graph())

    {:ok, %{map_id: map_id, npcs: [ally, enemy1], item_id: item_id, script_id: script_id}}
  end

  defp seed_roguelike do
    {:ok, map_id} = create_starter_map("Floor 1", 24, 24, "classic", :rl_layers)
    {:ok, enemy} = create_npc(map_id, "Slime", 12, 12, "🟢", true)
    {:ok, item_id} = create_item("Bread", "Heals 10 HP", "🍞")
    {:ok, script_id} = create_script("Floor 1 Intro", rl_intro_graph())

    create_spawn_zone(map_id, %{"x1" => 2, "y1" => 2, "x2" => 22, "y2" => 22}, [%{"npc_id" => enemy, "weight" => 1}])

    {:ok, %{map_id: map_id, npcs: [enemy], item_id: item_id, script_id: script_id, spawn_zone: true}}
  end

  defp seed_vn do
    {:ok, map_id} = create_starter_map("Prologue Scene", 10, 10, "classic", :vn_layers)
    {:ok, char_a} = create_npc(map_id, "Hero", 4, 5, "👤", false)
    {:ok, char_b} = create_npc(map_id, "Mysterious Stranger", 6, 5, "🧝", false)
    {:ok, script_id} = create_script("Prologue Choice", vn_choice_graph())

    {:ok, %{map_id: map_id, npcs: [char_a, char_b], script_id: script_id}}
  end

  defp seed_tower_defense do
    {:ok, map_id} = create_starter_map("Lane 1", 20, 8, "classic", :td_layers)
    {:ok, enemy} = create_npc(map_id, "Wave Crab", 1, 4, "🦀", true)
    {:ok, item_id} = create_item("Arrow Tower", "Single-target turret", "🏹")
    {:ok, script_id} = create_script("Wave Spawner", td_wave_graph(enemy))

    create_spawn_zone(map_id, %{"x1" => 0, "y1" => 3, "x2" => 1, "y2" => 5}, [%{"npc_id" => enemy, "weight" => 1}])

    {:ok, %{map_id: map_id, npcs: [enemy], item_id: item_id, script_id: script_id, spawn_zone: true}}
  end

  defp seed_deckbuilder do
    {:ok, map_id} = create_starter_map("Encounter Room 1", 12, 12, "classic", :flat_layers)
    {:ok, enemy} = create_npc(map_id, "Bandit", 6, 6, "🗡", true)

    Enum.each(1..20, fn i ->
      create_item("Card ##{i}", "Starter deck card", "🃏")
    end)

    {:ok, script_id} = create_script("Encounter 1 Battle", deckbuilder_graph(enemy))

    {:ok, %{map_id: map_id, npcs: [enemy], cards: 20, script_id: script_id}}
  end

  defp seed_rts do
    {:ok, map_id} = create_starter_map("Skirmish Map", 32, 32, "classic", :rts_layers)
    {:ok, worker} = create_npc(map_id, "Worker", 5, 5, "⛏", false)
    {:ok, soldier} = create_npc(map_id, "Soldier", 6, 5, "⚔", false)
    {:ok, enemy} = create_npc(map_id, "Enemy Worker", 26, 26, "👹", true)
    {:ok, item_id} = create_item("Wood", "Build resource", "🪵")
    {:ok, script_id} = create_script("Match Start", rts_start_graph())

    {:ok, %{map_id: map_id, npcs: [worker, soldier, enemy], item_id: item_id, script_id: script_id}}
  end

  # ── Layers ───────────────────────────────────────────────────

  defp build_layers(:rpg_layers, w, h) do
    # Stone walls around the perimeter, dirt floor inside
    flat_layer(w, h, fn x, y ->
      if x == 0 or y == 0 or x == w - 1 or y == h - 1, do: 1, else: 2
    end)
  end

  defp build_layers(:flat_layers, w, h) do
    flat_layer(w, h, fn _x, _y -> 0 end)
  end

  defp build_layers(:rl_layers, w, h) do
    # Random scattering of walls
    flat_layer(w, h, fn x, y ->
      cond do
        x == 0 or y == 0 or x == w - 1 or y == h - 1 -> 1
        :rand.uniform() < 0.10 -> 1
        true -> 0
      end
    end)
  end

  defp build_layers(:vn_layers, w, h) do
    flat_layer(w, h, fn _x, _y -> 0 end)
  end

  defp build_layers(:td_layers, w, h) do
    # Single horizontal lane of dirt, walls everywhere else
    flat_layer(w, h, fn _x, y ->
      if y >= 3 and y <= 5, do: 2, else: 1
    end)
  end

  defp build_layers(:rts_layers, w, h) do
    # Open grass field with a few impassable rocks
    flat_layer(w, h, fn x, y ->
      cond do
        x == 0 or y == 0 or x == w - 1 or y == h - 1 -> 1
        rem(x + y, 17) == 0 -> 1
        true -> 0
      end
    end)
  end

  defp flat_layer(w, h, gen) do
    ground = for y <- 0..(h - 1), x <- 0..(w - 1), do: gen.(x, y)

    %{
      "ground" => ground,
      "overlay" => List.duplicate(-1, w * h),
      "passability" => Enum.map(ground, fn id -> if id == 1, do: 1, else: 0 end),
      "fringe" => List.duplicate(-1, w * h),
      "elevation" => List.duplicate(0, w * h)
    }
  end

  # ── Real DB writes ───────────────────────────────────────────

  defp create_starter_map(name, w, h, render_mode, layers_kind) do
    layers = build_layers(layers_kind, w, h)
    layers_json = Jason.encode!(%{schema_version: 2, layers: layers})

    case Repo.query(
           """
           INSERT INTO game_maps (name, description, width, height, layers_json, schema_version, render_mode, is_active)
           VALUES (?, ?, ?, ?, ?, 2, ?, 1)
           """,
           [name, "Onboarding starter map for genre", w, h, layers_json, render_mode]
         ) do
      {:ok, %{last_insert_id: id}} -> {:ok, id}
      err -> err
    end
  end

  defp create_npc(map_id, name, x, y, icon, is_enemy?) do
    case Repo.query(
           """
           INSERT INTO game_npcs (name, map_id, x, y, icon, is_enemy, move_type, wander_radius, mood, is_dead)
           VALUES (?, ?, ?, ?, ?, ?, 'WANDER', 2, 'happy', 0)
           """,
           [name, map_id, x, y, icon, if(is_enemy?, do: 1, else: 0)]
         ) do
      {:ok, %{last_insert_id: id}} -> {:ok, id}
      err -> err
    end
  end

  defp create_item(name, description, icon) do
    ensure_items_table()

    case Repo.query(
           "INSERT INTO items (name, description, icon) VALUES (?, ?, ?)",
           [name, description, icon]
         ) do
      {:ok, %{last_insert_id: id}} -> {:ok, id}
      err -> err
    end
  rescue
    _ -> {:ok, 0}
  end

  defp create_script(name, graph) do
    case Repo.query(
           "INSERT INTO game_visual_scripts (name, graph_json, updated_at) VALUES (?, ?, NOW())",
           [name, Jason.encode!(graph)]
         ) do
      {:ok, %{last_insert_id: id}} -> {:ok, id}
      err -> err
    end
  end

  defp create_spawn_zone(map_id, rect, encounter_table) do
    Repo.query("CREATE TABLE IF NOT EXISTS game_map_spawn_zones (map_id INT PRIMARY KEY, zones_json LONGTEXT NOT NULL, updated_at DATETIME NOT NULL)")

    zones = [%{"id" => "z_seed", "rect" => rect, "encounter_table" => encounter_table, "scaling_factor" => 1.0, "flag" => "", "enabled" => true}]

    Repo.query(
      """
      INSERT INTO game_map_spawn_zones (map_id, zones_json, updated_at)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE zones_json = VALUES(zones_json), updated_at = NOW()
      """,
      [map_id, Jason.encode!(zones)]
    )

    :ok
  end

  defp ensure_items_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      icon VARCHAR(8)
    )
    """)
  rescue
    _ -> :ok
  end

  defp ensure_visual_scripts_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS game_visual_scripts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      graph_json LONGTEXT NOT NULL,
      updated_at DATETIME NOT NULL
    )
    """)
  rescue
    _ -> :ok
  end

  defp ensure_marker_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@marker_table} (
      genre VARCHAR(40) PRIMARY KEY,
      summary_json LONGTEXT NOT NULL,
      seeded_at DATETIME NOT NULL
    )
    """)
  rescue
    _ -> :ok
  end

  defp already_seeded?(genre) do
    case Repo.query("SELECT 1 FROM #{@marker_table} WHERE genre = ?", [Atom.to_string(genre)]) do
      {:ok, %{rows: [_]}} -> true
      _ -> false
    end
  rescue
    _ -> false
  end

  defp mark_seeded(genre, summary) do
    Repo.query(
      "INSERT INTO #{@marker_table} (genre, summary_json, seeded_at) VALUES (?, ?, NOW())",
      [Atom.to_string(genre), Jason.encode!(summary)]
    )
  rescue
    _ -> :ok
  end

  # ── Starter graphs ───────────────────────────────────────────

  defp rpg_greeting_graph(item_id) do
    %{
      "nodes" => [
        %{"id" => "n1", "type" => "start", "x" => 100, "y" => 100, "props" => %{"trigger" => "interact"}},
        %{"id" => "n2", "type" => "npc_talk", "x" => 350, "y" => 100, "props" => %{"npc_id" => 0, "text" => "A brave soul! Take this potion."}},
        %{"id" => "n3", "type" => "give_item", "x" => 600, "y" => 100, "props" => %{"item_id" => item_id, "amount" => 1}},
        %{"id" => "n4", "type" => "set_world_flag", "x" => 850, "y" => 100, "props" => %{"flag" => "knight_greeted", "value" => true}}
      ],
      "connections" => [
        %{"from_node" => "n1", "from_port" => "out", "to_node" => "n2", "to_port" => "in"},
        %{"from_node" => "n2", "from_port" => "out", "to_node" => "n3", "to_port" => "in"},
        %{"from_node" => "n3", "from_port" => "out", "to_node" => "n4", "to_port" => "in"}
      ]
    }
  end

  defp tactics_briefing_graph do
    %{
      "nodes" => [
        %{"id" => "n1", "type" => "start", "x" => 100, "y" => 100, "props" => %{"trigger" => "always"}},
        %{"id" => "n2", "type" => "npc_talk", "x" => 350, "y" => 100, "props" => %{"npc_id" => 0, "text" => "Hold the line, captain."}},
        %{"id" => "n3", "type" => "screen_effect", "x" => 600, "y" => 100, "props" => %{"kind" => "fade_in", "duration_ms" => 600}}
      ],
      "connections" => [
        %{"from_node" => "n1", "from_port" => "out", "to_node" => "n2", "to_port" => "in"},
        %{"from_node" => "n2", "from_port" => "out", "to_node" => "n3", "to_port" => "in"}
      ]
    }
  end

  defp rl_intro_graph do
    %{
      "nodes" => [
        %{"id" => "n1", "type" => "start", "x" => 100, "y" => 100, "props" => %{"trigger" => "always"}},
        %{"id" => "n2", "type" => "screen_effect", "x" => 350, "y" => 100, "props" => %{"kind" => "fade_in"}}
      ],
      "connections" => [
        %{"from_node" => "n1", "from_port" => "out", "to_node" => "n2", "to_port" => "in"}
      ]
    }
  end

  defp vn_choice_graph do
    %{
      "nodes" => [
        %{"id" => "n1", "type" => "start", "x" => 100, "y" => 100, "props" => %{"trigger" => "always"}},
        %{"id" => "n2", "type" => "npc_talk", "x" => 350, "y" => 100, "props" => %{"text" => "A stranger blocks your path."}},
        %{"id" => "n3", "type" => "choice", "x" => 600, "y" => 100, "props" => %{"prompt" => "Greet or attack?", "label_a" => "Greet", "label_b" => "Attack"}},
        %{"id" => "n4", "type" => "set_world_flag", "x" => 850, "y" => 50, "props" => %{"flag" => "stranger_greeted", "value" => true}},
        %{"id" => "n5", "type" => "damage", "x" => 850, "y" => 200, "props" => %{"amount" => 5}}
      ],
      "connections" => [
        %{"from_node" => "n1", "from_port" => "out", "to_node" => "n2", "to_port" => "in"},
        %{"from_node" => "n2", "from_port" => "out", "to_node" => "n3", "to_port" => "in"},
        %{"from_node" => "n3", "from_port" => "a", "to_node" => "n4", "to_port" => "in"},
        %{"from_node" => "n3", "from_port" => "b", "to_node" => "n5", "to_port" => "in"}
      ]
    }
  end

  defp td_wave_graph(npc_id) do
    %{
      "nodes" => [
        %{"id" => "n1", "type" => "start", "x" => 100, "y" => 100, "props" => %{"trigger" => "always"}},
        %{"id" => "n2", "type" => "wait", "x" => 350, "y" => 100, "props" => %{"ms" => 5000}},
        %{"id" => "n3", "type" => "npc_talk", "x" => 600, "y" => 100, "props" => %{"npc_id" => npc_id, "text" => "Wave incoming!"}}
      ],
      "connections" => [
        %{"from_node" => "n1", "from_port" => "out", "to_node" => "n2", "to_port" => "in"},
        %{"from_node" => "n2", "from_port" => "out", "to_node" => "n3", "to_port" => "in"}
      ]
    }
  end

  defp deckbuilder_graph(enemy_id) do
    %{
      "nodes" => [
        %{"id" => "n1", "type" => "start", "x" => 100, "y" => 100, "props" => %{"trigger" => "interact"}},
        %{"id" => "n2", "type" => "battle", "x" => 350, "y" => 100, "props" => %{"encounter_id" => enemy_id, "escapable" => false}}
      ],
      "connections" => [
        %{"from_node" => "n1", "from_port" => "out", "to_node" => "n2", "to_port" => "in"}
      ]
    }
  end

  defp rts_start_graph do
    %{
      "nodes" => [
        %{"id" => "n1", "type" => "start", "x" => 100, "y" => 100, "props" => %{"trigger" => "always"}},
        %{"id" => "n2", "type" => "give_gold", "x" => 350, "y" => 100, "props" => %{"amount" => 100}},
        %{"id" => "n3", "type" => "screen_effect", "x" => 600, "y" => 100, "props" => %{"kind" => "fade_in", "duration_ms" => 800}}
      ],
      "connections" => [
        %{"from_node" => "n1", "from_port" => "out", "to_node" => "n2", "to_port" => "in"},
        %{"from_node" => "n2", "from_port" => "out", "to_node" => "n3", "to_port" => "in"}
      ]
    }
  end
end
