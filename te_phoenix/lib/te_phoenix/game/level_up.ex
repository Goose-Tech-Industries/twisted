defmodule TePhoenix.Game.LevelUp do
  @moduledoc """
  Level-up detection and AP (attribute point) allocation system.
  Characters earn AP on level-up which they spend to increase stats.
  """

  require Logger
  alias TePhoenix.Repo

  @default_ap_per_level 5
  @valid_stats ~w(atk def mo md speed luck hp mp)

  @doc """
  Check if a character has earned a level-up based on current XP.
  Returns {:level_up, new_level, ap_earned} or :no_change.
  """
  def check_level_up(char_id, current_xp) do
    case Repo.query(
      "SELECT c.level, gl.xp_required FROM characters c JOIN level_requirements gl ON gl.level=c.level+1 WHERE c.id=?",
      [char_id]
    ) do
      {:ok, %{rows: [[level, xp_needed]]}} when not is_nil(xp_needed) and current_xp >= xp_needed ->
        new_level = level + 1
        ap_earned = ap_per_level()

        try do
          Repo.query!("UPDATE characters SET level=?, experience=experience-? WHERE id=?",
            [new_level, xp_needed, char_id])

          # Grant AP
          Repo.query!(
            "UPDATE characters SET unspent_ap=COALESCE(unspent_ap,0)+? WHERE id=?",
            [ap_earned, char_id]
          )

          # Apply level table stat gains (HP/MP growth)
          case Repo.query("SELECT hp_gain, mp_gain FROM level_requirements WHERE level=?", [new_level]) do
            {:ok, %{rows: [[hp_gain, mp_gain]]}} ->
              Repo.query!(
                "UPDATE characters SET max_hp=max_hp+?, current_hp=current_hp+?, max_mp=max_mp+?, current_mp=current_mp+? WHERE id=?",
                [hp_gain || 0, hp_gain || 0, mp_gain || 0, mp_gain || 0, char_id]
              )
            _ -> nil
          end

          Logger.info("LevelUp: char=#{char_id} -> level #{new_level}, +#{ap_earned} AP")
          {:level_up, new_level, ap_earned}
        rescue
          e ->
            Logger.error("LevelUp failed for char #{char_id}: #{inspect(e)}")
            :no_change
        end

      _ ->
        :no_change
    end
  end

  @doc """
  Allocate unspent AP to stats.
  allocations: %{"atk" => 3, "def" => 2, ...}
  Validates total <= available AP, stat keys are valid.
  Returns {:ok, updated_stats} or {:error, reason}.
  """
  def allocate_ap(char_id, allocations) when is_map(allocations) do
    # Validate all stat keys
    invalid_keys = Map.keys(allocations) -- @valid_stats
    if invalid_keys != [] do
      {:error, "Invalid stats: #{Enum.join(invalid_keys, ", ")}"}
    else
      # Validate all values are positive integers
      all_positive = Enum.all?(allocations, fn {_k, v} -> is_integer(v) and v >= 0 end)
      unless all_positive do
        {:error, "All allocation values must be non-negative integers."}
      else
        total_spent = Enum.reduce(allocations, 0, fn {_k, v}, acc -> acc + v end)

        if total_spent == 0 do
          {:error, "No points allocated."}
        else
          case get_pending_ap(char_id) do
            {:ok, available} when available >= total_spent ->
              apply_allocations(char_id, allocations, total_spent)

            {:ok, available} ->
              {:error, "Not enough AP. Have #{available}, trying to spend #{total_spent}."}

            {:error, _} = err ->
              err
          end
        end
      end
    end
  end

  @doc """
  Get unspent AP for a character.
  Returns {:ok, ap_count} or {:error, reason}.
  """
  def get_pending_ap(char_id) do
    case Repo.query("SELECT COALESCE(unspent_ap, 0) FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[ap]]}} -> {:ok, ap || 0}
      _ -> {:error, "Character not found."}
    end
  end

  # ── Private ────────────────────────────────────────────────────

  defp apply_allocations(char_id, allocations, total_spent) do
    # Build SET clause for stat updates
    set_parts = Enum.flat_map(allocations, fn {stat, amount} ->
      if amount > 0 do
        col = stat_to_column(stat)
        ["#{col}=#{col}+#{amount}"]
      else
        []
      end
    end)

    if set_parts == [] do
      {:error, "No valid allocations."}
    else
      set_clause = Enum.join(set_parts, ", ")

      try do
        Repo.query!(
          "UPDATE characters SET #{set_clause}, unspent_ap=unspent_ap-? WHERE id=? AND unspent_ap>=?",
          [total_spent, char_id, total_spent]
        )

        # Fetch updated stats for confirmation
        case Repo.query(
          "SELECT atk, def, mo, md, speed, luck, max_hp, max_mp, unspent_ap FROM characters WHERE id=?",
          [char_id]
        ) do
          {:ok, %{rows: [[atk, def_, mo, md, spd, lck, hp, mp, remaining_ap]]}} ->
            {:ok, %{
              atk: atk, def: def_, mo: mo, md: md, speed: spd, luck: lck,
              max_hp: hp, max_mp: mp, unspent_ap: remaining_ap
            }}
          _ ->
            {:ok, %{spent: total_spent}}
        end
      rescue
        e ->
          Logger.error("AP allocation failed: #{inspect(e)}")
          {:error, "Allocation failed."}
      end
    end
  end

  defp stat_to_column("hp"), do: "max_hp"
  defp stat_to_column("mp"), do: "max_mp"
  defp stat_to_column(stat), do: stat

  defp ap_per_level do
    case Repo.query("SELECT setting_value FROM system_settings WHERE setting_key='ap_per_level' LIMIT 1") do
      {:ok, %{rows: [[val]]}} ->
        case Integer.parse(to_string(val)) do
          {n, _} -> n
          _ -> @default_ap_per_level
        end
      _ -> @default_ap_per_level
    end
  end
end
