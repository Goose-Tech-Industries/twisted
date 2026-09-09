defmodule TePhoenix.World.NpcSchedules do
  @moduledoc """
  Autonomous NPC Circadian Living Schedules (*Sceidil Neamhspleácha na gCarachtar*).

  Simulates dynamic town routines across the 5 circadian phases:
    * **Dawn (06:00)**: Stall setups, waking from sleep, morning prayers.
    * **Day (12:00)**: Open market commerce, street wandering, guard patrol.
    * **Dusk (18:00)**: Migration to *The Prancing Mare Tavern*, dining, revelry.
    * **Night (21:00)**: Curfew lockdown, tavern drinking contests, street patrols.
    * **Midnight (00:00)**: Diurnal sleep, nocturnal cutpurses and shadow prowlers emerge.

  Physically repositions NPC coordinates (`x`, `y`), sets their `current_activity`,
  and broadcasts real-time schedule telemetry to the client.
  """

  alias TePhoenix.Repo
  require Logger

  @doc """
  Ensures the `game_npc_schedules` table and any missing columns on `game_npcs` exist.
  """
  def ensure_schema! do
    try do
      Repo.query!("ALTER TABLE game_npcs ADD COLUMN IF NOT EXISTS current_activity VARCHAR(128) DEFAULT 'Idling in town'")
    rescue
      _ -> :ok
    end

    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_npc_schedules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      npc_name VARCHAR(128) NOT NULL,
      phase VARCHAR(32) NOT NULL,
      target_x INT NOT NULL,
      target_y INT NOT NULL,
      activity_name VARCHAR(128) NOT NULL,
      dialogue_override TEXT,
      icon VARCHAR(16) NOT NULL DEFAULT '🚶',
      map_id INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_npc_phase (npc_name, phase),
      INDEX idx_map_phase (map_id, phase)
    )
    """)

    :ok
  end

  @doc """
  Seeds comprehensive circadian schedules for named town NPCs.
  """
  def seed_default_schedules!(map_id \\ 1) do
    ensure_schema!()

    schedules = [
      # Barnaby the Quartermaster / Merchant
      %{name: "Barnaby the Quartermaster", phase: "dawn", x: 14, y: 12, act: "Setting up apothecary stall", icon: "📦", dlg: "The morning dew is the best time to unpack dried elderberry."},
      %{name: "Barnaby the Quartermaster", phase: "day", x: 15, y: 12, act: "Trading apothecary wares", icon: "⚖️", dlg: "Finest salves and tinctures this side of the Sunken Spire!"},
      %{name: "Barnaby the Quartermaster", phase: "dusk", x: 22, y: 18, act: "Nursing a tankard of stout", icon: "🍺", dlg: "Ah, my feet ache from standing behind that wooden counter all day."},
      %{name: "Barnaby the Quartermaster", phase: "night", x: 8, y: 6, act: "Locking his shop registers", icon: "🔐", dlg: "Better count the till twice before those Lowtown pickpockets get any ideas."},
      %{name: "Barnaby the Quartermaster", phase: "midnight", x: 8, y: 5, act: "Asleep in his cottage loft", icon: "💤", dlg: "*Snoring heavily with a ledger under his arm*"},

      # Rowan the Tavern Bard
      %{name: "Rowan the Tavern Bard", phase: "dawn", x: 25, y: 19, act: "Sleeping in tavern loft", icon: "💤", dlg: "*Muffled humming in deep slumber*"},
      %{name: "Rowan the Tavern Bard", phase: "day", x: 18, y: 15, act: "Tuning his masterwork lute", icon: "🎵", dlg: "A melody needs morning air to resonate true in the heart."},
      %{name: "Rowan the Tavern Bard", phase: "dusk", x: 24, y: 18, act: "Performing drinking anthems", icon: "🪕", dlg: "Raise your goblets, lads! To the brave souls who defy the encroaching mist!"},
      %{name: "Rowan the Tavern Bard", phase: "night", x: 24, y: 18, act: "Singing haunting Lowtown ballads", icon: "🎶", dlg: "A song for the shadows that linger when the hearthfires die down..."},
      %{name: "Rowan the Tavern Bard", phase: "midnight", x: 23, y: 20, act: "Whispering tavern rumors", icon: "🤫", dlg: "Keep your voice down, traveler. The walls have ears after midnight."},

      # Captain Vane of the Night Watch
      %{name: "Captain Vane of the Night Watch", phase: "dawn", x: 12, y: 8, act: "Inspecting morning watchmen", icon: "🛡️", dlg: "Keep your shields up and eyes on the forest tree line!"},
      %{name: "Captain Vane of the Night Watch", phase: "day", x: 10, y: 8, act: "Reviewing magistrate warrants", icon: "📜", dlg: "Too many bandits slipping past the outer palisade lately."},
      %{name: "Captain Vane of the Night Watch", phase: "dusk", x: 12, y: 22, act: "Reinforcing the south town gate", icon: "⚔️", dlg: "Close the iron grates! Curfew is coming!"},
      %{name: "Captain Vane of the Night Watch", phase: "night", x: 16, y: 18, act: "Leading alleyway lantern patrol", icon: "🏮", dlg: "Halt! State your business in the dark!"},
      %{name: "Captain Vane of the Night Watch", phase: "midnight", x: 16, y: 18, act: "Cornering nocturnal suspects", icon: "🔦", dlg: "One false move and you'll sleep in the magistrate's iron cage!"},

      # Silas the Shadow Fence
      %{name: "Silas the Shadow Fence", phase: "dawn", x: 5, y: 25, act: "Sleeping in secret basement", icon: "💤", dlg: "*Resting with one eye open and a stiletto gripped in hand*"},
      %{name: "Silas the Shadow Fence", phase: "day", x: 6, y: 24, act: "Polishing contraband lockpicks", icon: "🔑", dlg: "Everything has a price, my friend. Even secrets."},
      %{name: "Silas the Shadow Fence", phase: "dusk", x: 20, y: 21, act: "Whispering behind the stables", icon: "👤", dlg: "Got anything shiny from that last excursion? I pay clean coin."},
      %{name: "Silas the Shadow Fence", phase: "night", x: 15, y: 14, act: "Stalking marks from dark eaves", icon: "🗡️", dlg: "Watch your purse strings, stranger. Lowtown has quick fingers."},
      %{name: "Silas the Shadow Fence", phase: "midnight", x: 14, y: 15, act: "Exchanging marked gold bars", icon: "💰", dlg: "Take the parcel, deliver it to the Sunken Crypts, and speak no names."}
    ]

    Enum.each(schedules, fn s ->
      case Repo.query(
        "SELECT id FROM game_npc_schedules WHERE npc_name = ? AND phase = ? AND map_id = ? LIMIT 1",
        [s.name, s.phase, map_id]
      ) do
        {:ok, %{rows: []}} ->
          Repo.query(
            """
            INSERT INTO game_npc_schedules
            (npc_name, phase, target_x, target_y, activity_name, dialogue_override, icon, map_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [s.name, s.phase, s.x, s.y, s.act, s.dlg, s.icon, map_id]
          )
        _ -> :ok
      end
    end)

    :ok
  end

  @doc """
  Applies circadian schedule transitions for all NPCs on a map.
  Moves NPCs in DB, updates their activity, and broadcasts updates.
  """
  def apply_schedules_for_phase(map_id, phase) do
    ensure_schema!()

    query = """
    SELECT id, npc_name, phase, target_x, target_y, activity_name, dialogue_override, icon
    FROM game_npc_schedules
    WHERE map_id = ? AND phase = ?
    """

    case Repo.query(query, [map_id, phase]) do
      {:ok, %{rows: rows, columns: cols}} ->
        schedules = Enum.map(rows, fn r -> Enum.zip(cols, r) |> Map.new() end)

        # Update each NPC in game_npcs
        updates = Enum.map(schedules, fn s ->
          name = s["npc_name"]
          x = s["target_x"]
          y = s["target_y"]
          activity = s["activity_name"]

          Repo.query(
            """
            UPDATE game_npcs
            SET x = ?, y = ?, current_activity = ?
            WHERE name = ? AND map_id = ?
            """,
            [x, y, activity, name, map_id]
          )

          %{
            npc_name: name,
            x: x,
            y: y,
            activity: activity,
            icon: s["icon"],
            dialogue: s["dialogue_override"],
            phase: phase
          }
        end)

        # Broadcast schedule changes to the entire sector
        TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "npc_schedules_update", %{
          map_id: map_id,
          phase: phase,
          schedules: updates
        })

        TePhoenixWeb.Endpoint.broadcast("voice:proximity:#{map_id}", "npc_schedules_update", %{
          map_id: map_id,
          phase: phase,
          schedules: updates
        })

        Logger.info("[NpcSchedules] Applied #{length(updates)} autonomous routines for phase #{phase} on map #{map_id}")
        {:ok, updates}

      _ ->
        {:ok, []}
    end
  end

  @doc """
  Retrieves the current schedule and live location of all NPCs on a map.
  """
  def list_active_schedules(map_id) do
    ensure_schema!()

    query = """
    SELECT n.id, n.name, n.role, n.x, n.y, n.is_sleeping, n.is_nocturnal,
           COALESCE(n.current_activity, 'Idling in town') as current_activity
    FROM game_npcs n
    WHERE n.map_id = ? AND n.is_active = 1
    ORDER BY n.name ASC
    """

    case Repo.query(query, [map_id]) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn r -> Enum.zip(cols, r) |> Map.new() end)
      _ -> []
    end
  end
end
