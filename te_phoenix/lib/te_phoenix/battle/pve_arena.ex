defmodule TePhoenix.Battle.PveArena do
  @moduledoc """
  PvE arena encounters — start 1v1 battles against scaled monster templates.
  Supports both specific monster selection and random encounters from region tables.
  """

  require Logger
  alias TePhoenix.Battle.Manager
  alias TePhoenix.Repo

  @stat_scale_rate 0.1
  @stat_scale_cap 3.0

  @doc """
  Start a PvE encounter against a specific monster template.
  Loads the monster, scales its stats to the character's level, and creates a battle.
  Returns {:ok, battle_id} or {:error, reason}.
  """
  def start_encounter(char_id, monster_template_id) do
    with {:ok, char} <- load_character(char_id),
         {:ok, monster} <- load_monster_template(monster_template_id) do

      # Scale monster stats by character level
      scaled = scale_monster(monster, char.level)

      # Ensure the monster has a character row for the battle system
      case ensure_monster_char(scaled, monster_template_id) do
        {:ok, monster_char_id} ->
          Manager.create_battle(char_id, monster_char_id, :pve)

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  @doc """
  Pick a random monster from a region's encounter table, scale it, and create a battle.
  Returns {:ok, battle_id} or {:error, reason}.
  """
  def random_encounter(char_id, region_id) do
    with {:ok, char} <- load_character(char_id),
         {:ok, encounter} <- pick_random_encounter(region_id) do

      scaled = scale_monster(encounter, char.level)

      case ensure_monster_char(scaled, encounter.template_id) do
        {:ok, monster_char_id} ->
          Manager.create_battle(char_id, monster_char_id, :pve)

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  @doc """
  Scale a monster's stats based on the character's level vs the monster's base level.
  Formula: base_stat * (1 + rate * (char_level - monster_base_level)), capped at cap multiplier.
  """
  def scale_monster(monster, char_level) do
    base_level = monster.level || 1
    level_diff = char_level - base_level
    mult = min(@stat_scale_cap, max(0.5, 1.0 + @stat_scale_rate * level_diff))

    %{monster |
      level: max(1, char_level),
      max_hp: max(1, trunc(monster.max_hp * mult)),
      current_hp: max(1, trunc(monster.max_hp * mult)),
      atk: max(1, trunc(monster.atk * mult)),
      def: max(1, trunc(monster.def * mult)),
      mo: max(1, trunc((monster.mo || 0) * mult)),
      md: max(1, trunc((monster.md || 0) * mult)),
      speed: max(1, trunc(monster.speed * mult)),
      luck: monster.luck || 0
    }
  end

  # ══════════════════════════════════════════════════════════════════
  # PRIVATE
  # ══════════════════════════════════════════════════════════════════

  defp load_character(char_id) do
    case Repo.query(
      "SELECT id, level, map_id FROM characters WHERE id=?",
      [char_id]
    ) do
      {:ok, %{rows: [[id, level, map_id]]}} ->
        {:ok, %{char_id: id, level: level || 1, map_id: map_id}}
      _ ->
        {:error, :character_not_found}
    end
  end

  defp load_monster_template(template_id) do
    case Repo.query("""
      SELECT id, name, level, max_hp, atk, def, mo, md, speed, luck,
             race, npc_type, steal_table_json, weaknesses
      FROM game_npcs WHERE id=? AND is_enemy=1
    """, [template_id]) do
      {:ok, %{rows: [[id, name, level, hp, atk, def_, mo, md, spd, lck, race, npc_type, steal_json, weak]]}} ->
        {:ok, %{
          template_id: id, name: name,
          level: level || 1,
          max_hp: hp || 100, current_hp: hp || 100,
          atk: atk || 10, def: def_ || 10,
          mo: mo || 10, md: md || 10,
          speed: spd || 10, luck: lck || 0,
          race: race, npc_type: npc_type,
          steal_table_json: steal_json,
          weaknesses: weak
        }}
      _ ->
        {:error, :monster_not_found}
    end
  end

  defp pick_random_encounter(region_id) do
    case Repo.query("""
      SELECT n.id, n.name, n.level, n.max_hp, n.atk, n.def, n.mo, n.md, n.speed, n.luck,
             n.race, n.npc_type, n.steal_table_json, n.weaknesses,
             COALESCE(re.weight, 1) as weight
      FROM game_region_encounters re
      JOIN game_npcs n ON n.id = re.npc_id
      WHERE re.region_id=? AND n.is_enemy=1
    """, [region_id]) do
      {:ok, %{rows: rows}} when rows != [] ->
        total_weight = Enum.reduce(rows, 0, fn row, acc -> acc + (List.last(row) || 1) end)
        roll = :rand.uniform() * total_weight

        picked = pick_weighted_row(rows, roll)
        [id, name, level, hp, atk, def_, mo, md, spd, lck, race, npc_type, steal_json, weak, _weight] = picked

        {:ok, %{
          template_id: id, name: name,
          level: level || 1,
          max_hp: hp || 100, current_hp: hp || 100,
          atk: atk || 10, def: def_ || 10,
          mo: mo || 10, md: md || 10,
          speed: spd || 10, luck: lck || 0,
          race: race, npc_type: npc_type,
          steal_table_json: steal_json,
          weaknesses: weak
        }}

      _ ->
        {:error, :no_encounters_in_region}
    end
  end

  defp pick_weighted_row(rows, roll) do
    Enum.reduce_while(rows, roll, fn row, remaining ->
      weight = List.last(row) || 1
      if remaining - weight <= 0 do
        {:halt, row}
      else
        {:cont, remaining - weight}
      end
    end)
    |> case do
      row when is_list(row) -> row
      _ -> hd(rows)
    end
  end

  defp ensure_monster_char(monster, template_id) do
    # Check if this NPC template already has a char_id for battle
    case Repo.query("SELECT char_id FROM game_npcs WHERE id=?", [template_id]) do
      {:ok, %{rows: [[char_id]]}} when not is_nil(char_id) ->
        # Update the temp character row with scaled stats
        try do
          Repo.query!("""
            UPDATE characters SET
              level=?, max_hp=?, current_hp=?, atk=?, def=?,
              mo=?, md=?, speed=?, luck=?
            WHERE id=?
          """, [
            monster.level, monster.max_hp, monster.current_hp,
            monster.atk, monster.def, monster.mo, monster.md,
            monster.speed, monster.luck, char_id
          ])
          {:ok, char_id}
        rescue
          _ -> {:ok, char_id}
        end

      _ ->
        # Create a temporary character row for the monster
        try do
          {:ok, result} = Repo.query("""
            INSERT INTO characters (name, level, max_hp, current_hp, max_mp, current_mp,
              atk, def, mo, md, speed, luck, is_npc, created_at)
            VALUES (?,?,?,?,0,0,?,?,?,?,?,?,1,NOW())
          """, [
            monster.name, monster.level, monster.max_hp, monster.current_hp,
            monster.atk, monster.def, monster.mo, monster.md,
            monster.speed, monster.luck
          ])

          # Link back to NPC
          Repo.query("UPDATE game_npcs SET char_id=? WHERE id=?", [result.last_insert_id, template_id])

          {:ok, result.last_insert_id}
        rescue
          e ->
            Logger.error("Failed to create monster char: #{inspect(e)}")
            {:error, :monster_char_creation_failed}
        end
    end
  end
end
