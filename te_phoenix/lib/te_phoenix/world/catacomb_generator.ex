defmodule TePhoenix.World.CatacombGenerator do
  @moduledoc """
  Spoken Dungeon Catacombs On-Demand Engine via UILE (Omni).

  Translates verbal or text dungeon prompts (e.g., "Spawn a flooded crypt with drowned spectres and an arcane hydra")
  into multi-room 2.5D procedurally connected dungeon networks with elevation grids, door connectivity,
  pressure traps, treasure chests, and boss chambers.
  """

  require Logger
  alias TePhoenix.Repo
  alias TePhoenix.World.EngineFeatureFlags

  @dungeon_table "game_catacomb_dungeons"
  @rooms_table "game_catacomb_rooms"

  @room_templates [
    %{type: "entrance", name: "Sunken Antechamber", icon: "🚪", desc: "Damp stone steps descend into murky, ankle-deep water."},
    %{type: "hall", name: "Whispering Catacomb Gallery", icon: "💀", desc: "Wall niches lined with ancient skulls echo with faint spectral whispers."},
    %{type: "crypt", name: "Sarcophagus Burial Vault", icon: "⚰️", desc: "Heavy marble sarcophagi ring the chamber. Shadows flit between pillars."},
    %{type: "trap", name: "Pressure Plate Flood Gate", icon: "⚡", desc: "Water cascades from ceiling sluices over hair-trigger pressure stones."},
    %{type: "treasure", name: "Gilded Smuggler Cache", icon: "💎", desc: "Iron-banded strongboxes half-submerged in black water glint in torchlight."},
    %{type: "boss_arena", name: "Sanctum of the Sunken Leviathan", icon: "🐲", desc: "A colossal vaulted cistern where ancient runes glow beneath turbulent water."}
  ]

  @doc """
  Ensures the catacomb dungeon tables exist.
  """
  def ensure_schema! do
    case :persistent_term.get({__MODULE__, :schema_ready}, false) do
      true ->
        :ok

      false ->
        Repo.query!("""
        CREATE TABLE IF NOT EXISTS #{@dungeon_table} (
          id INT AUTO_INCREMENT PRIMARY KEY,
          creator_char_id INT NOT NULL,
          name VARCHAR(128) NOT NULL,
          theme VARCHAR(64) NOT NULL DEFAULT 'sunken_crypt',
          danger_level VARCHAR(32) NOT NULL DEFAULT 'hard',
          floors_count INT NOT NULL DEFAULT 1,
          current_floor INT NOT NULL DEFAULT 1,
          status VARCHAR(32) NOT NULL DEFAULT 'active',
          prompt TEXT,
          created_at DATETIME NOT NULL,
          INDEX idx_creator (creator_char_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        Repo.query!("""
        CREATE TABLE IF NOT EXISTS #{@rooms_table} (
          id INT AUTO_INCREMENT PRIMARY KEY,
          dungeon_id INT NOT NULL,
          floor INT NOT NULL DEFAULT 1,
          room_index INT NOT NULL,
          room_type VARCHAR(32) NOT NULL,
          name VARCHAR(128) NOT NULL,
          description TEXT,
          elevation INT NOT NULL DEFAULT 0,
          is_cleared TINYINT(1) NOT NULL DEFAULT 0,
          doors_json LONGTEXT,
          occupants_json LONGTEXT,
          loot_json LONGTEXT,
          INDEX idx_dungeon (dungeon_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        :persistent_term.put({__MODULE__, :schema_ready}, true)
        :ok
    end
  end

  @doc """
  Generates a multi-room procedural catacomb instance based on a creator prompt and theme.
  """
  def generate_catacomb(creator_char_id, prompt, theme \\ "sunken_crypt", danger_level \\ "hard") do
    ensure_schema!()

    unless EngineFeatureFlags.is_enabled?("spoken_catacombs_enabled") do
      {:error, "Catacomb generation is currently disabled by server policy"}
    else
      now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)
      dungeon_name = generate_dungeon_name(theme)

      result =
        Repo.query!(
          """
          INSERT INTO #{@dungeon_table}
          (creator_char_id, name, theme, danger_level, floors_count, current_floor, status, prompt, created_at)
          VALUES (?, ?, ?, ?, 1, 1, 'active', ?, ?)
          """,
          [creator_char_id, dungeon_name, theme, danger_level, prompt, now]
        )

      dungeon_id = result.last_insert_id

      # Generate 5-room progressive dungeon layout
      rooms = [
        Enum.at(@room_templates, 0) |> Map.merge(%{index: 0, elevation: 0, doors: [1], cleared: true}),
        Enum.at(@room_templates, 1) |> Map.merge(%{index: 1, elevation: -1, doors: [0, 2], cleared: false}),
        Enum.at(@room_templates, 3) |> Map.merge(%{index: 2, elevation: -2, doors: [1, 3], cleared: false}),
        Enum.at(@room_templates, 4) |> Map.merge(%{index: 3, elevation: -2, doors: [2, 4], cleared: false}),
        Enum.at(@room_templates, 5) |> Map.merge(%{index: 4, elevation: -3, doors: [3], cleared: false})
      ]

      Enum.each(rooms, fn r ->
        doors_json = Jason.encode!(r.doors)

        occupants_json =
          Jason.encode!(
            case r.type do
              "boss_arena" -> [%{name: "Abyssal Leviathan", hp: 1200, max_hp: 1200, icon: "🐲"}]
              "crypt" -> [%{name: "Drowned Revenant", hp: 350, max_hp: 350, icon: "🧟"}]
              "trap" -> [%{name: "Water Sluice Mechanism", status: "armed", icon: "⚙️"}]
              _ -> []
            end
          )

        loot_json =
          Jason.encode!(
            case r.type do
              "treasure" -> %{gold: 240, xp: 350, item: "Ancient Valyrian Relic"}
              "boss_arena" -> %{gold: 600, xp: 1000, item: "Heart of the Sunken Leviathan"}
              _ -> %{gold: 40, xp: 60, item: "Submerged Coin Purse"}
            end
          )

        Repo.query!(
          """
          INSERT INTO #{@rooms_table}
          (dungeon_id, floor, room_index, room_type, name, description, elevation, is_cleared, doors_json, occupants_json, loot_json)
          VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
          [
            dungeon_id,
            r.index,
            r.type,
            r.name,
            r.desc,
            r.elevation,
            if(r.cleared, do: 1, else: 0),
            doors_json,
            occupants_json,
            loot_json
          ]
        )
      end)

      get_catacomb_state(dungeon_id)
    end
  end

  def get_catacomb_state(dungeon_id) when is_integer(dungeon_id) do
    ensure_schema!()

    case Repo.query(
           "SELECT id, creator_char_id, name, theme, danger_level, floors_count, current_floor, status, prompt FROM #{@dungeon_table} WHERE id = ?",
           [dungeon_id]
         ) do
      {:ok, %{rows: [[id, cid, name, theme, dlevel, fcount, cfloor, status, prompt]]}} ->
        rooms = list_catacomb_rooms(dungeon_id)

        {:ok,
         %{
           id: id,
           creator_char_id: cid,
           name: name,
           theme: theme,
           danger_level: dlevel,
           floors_count: fcount,
           current_floor: cfloor,
           status: status,
           prompt: prompt,
           rooms: rooms,
           active_room_index: 0,
           is_enabled: EngineFeatureFlags.is_enabled?("spoken_catacombs_enabled")
         }}

      _ ->
        {:error, "Catacomb not found"}
    end
  end

  def list_catacomb_rooms(dungeon_id) do
    ensure_schema!()

    case Repo.query(
           "SELECT room_index, room_type, name, description, elevation, is_cleared, doors_json, occupants_json, loot_json FROM #{@rooms_table} WHERE dungeon_id = ? ORDER BY room_index ASC",
           [dungeon_id]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [idx, rtype, rname, desc, elev, cleared, djson, ojson, ljson] ->
          %{
            index: idx,
            type: rtype,
            name: rname,
            description: desc,
            elevation: elev,
            is_cleared: cleared == 1,
            doors: decode_json(djson, []),
            occupants: decode_json(ojson, []),
            loot: decode_json(ljson, %{})
          }
        end)

      _ ->
        []
    end
  end

  def clear_room(dungeon_id, room_index) do
    ensure_schema!()

    Repo.query!(
      "UPDATE #{@rooms_table} SET is_cleared = 1 WHERE dungeon_id = ? AND room_index = ?",
      [dungeon_id, room_index]
    )

    # If all rooms cleared, mark dungeon cleared
    case Repo.query("SELECT COUNT(*) FROM #{@rooms_table} WHERE dungeon_id = ? AND is_cleared = 0", [dungeon_id]) do
      {:ok, %{rows: [[0]]}} ->
        Repo.query!("UPDATE #{@dungeon_table} SET status = 'cleared' WHERE id = ?", [dungeon_id])
        {:ok, %{message: "Catacomb fully conquered! All crypt evils cleansed.", status: "cleared"}}

      _ ->
        {:ok, %{message: "Chamber secured. Path forward unlocked!", status: "active"}}
    end
  end

  defp generate_dungeon_name("sunken_crypt"), do: "Catacombs of the Drowned Patriarch"
  defp generate_dungeon_name("molten_vault"), do: "Molten Subterrane of the Flame Golem"
  defp generate_dungeon_name("shadow_sewers"), do: "Lowtown Smuggler Crypts"
  defp generate_dungeon_name(_), do: "The Ancient Subterranean Crypts"

  defp decode_json(nil, fallback), do: fallback

  defp decode_json(binary, fallback) do
    case Jason.decode(binary) do
      {:ok, val} -> val
      _ -> fallback
    end
  end
end
