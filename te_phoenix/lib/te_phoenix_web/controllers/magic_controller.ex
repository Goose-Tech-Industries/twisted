defmodule TePhoenixWeb.MagicController do
  @moduledoc """
  REST surface for the Phase 1.5d Celtic magic system. Thin wrapper
  around `TePhoenix.Game.Magic`. Auth + character resolution match
  the achievement_controller / crafting_controller pattern.

  ## Response shapes (for Butterfingers's UI batch)

  GET /api/magic/oghams
      → %{success: true, oghams: [
            %{id, name, icon, description, lore_text, mastery_rank,
              kill_count, corruption_points, unlocked_at, source,
              element_attack, family_id}, …
          ]}

  GET /api/magic/spells/known
      → %{success: true, spells: [
            %{id, key, name, description, icon, ogham_pattern,
              anam_cost, cast_time_ms, cooldown_ms, spell_school,
              min_level, is_combat_spell, is_utility_spell,
              learned_at}, …
          ]}

  GET /api/magic/spells/castable
      → %{success: true, spells: [<same shape as known but filtered>]}

  POST /api/magic/cast {spell_key, target_opts?}
      → %{success: true, result: %{spell, target, applied_effects, anam_remaining}}
      | %{success: false, error: <atom>, message: <human>, details?: <list>}

  POST /api/magic/learn {spell_key}
      → %{success: true, status: "learned" | "already_known"}
      | %{success: false, error: <atom>, message: <human>}

  ## Errors surface as `error: <atom>` so clients can switch on them.
  """

  use TePhoenixWeb, :controller

  alias TePhoenix.Game.Magic
  alias TePhoenix.Repo

  @cast_window_ms 60_000
  @cast_per_window 60

  # ── Reads ────────────────────────────────────────────────────────

  def list_oghams(conn, _params) do
    case current_character_id(conn) do
      nil -> json(conn, %{success: false, error: :no_character, message: "no character"})
      char_id -> json(conn, %{success: true, oghams: Magic.list_oghams(char_id)})
    end
  end

  def list_known_spells(conn, _params) do
    case current_character_id(conn) do
      nil -> json(conn, %{success: false, error: :no_character, message: "no character"})
      char_id -> json(conn, %{success: true, spells: Magic.list_known_spells(char_id)})
    end
  end

  def list_castable_spells(conn, _params) do
    case current_character_id(conn) do
      nil -> json(conn, %{success: false, error: :no_character, message: "no character"})
      char_id -> json(conn, %{success: true, spells: Magic.list_castable_now(char_id)})
    end
  end

  # ── Mutations ────────────────────────────────────────────────────

  def cast(conn, %{"spell_key" => spell_key} = params) do
    case current_character_id(conn) do
      nil ->
        json(conn, %{success: false, error: :no_character, message: "no character"})

      char_id ->
        if rate_limited?(char_id) do
          json(conn, %{
            success: false,
            error: :rate_limited,
            message: "cast rate limit exceeded; try again shortly"
          })
        else
          target_opts = params["target_opts"] || %{}

          case Magic.cast(char_id, spell_key, target_opts) do
            {:ok, result} ->
              record_cast(char_id)
              json(conn, %{success: true, result: result})

            {:error, :capability_disabled} ->
              json(conn, %{success: false, error: :capability_disabled, message: "Magic is currently disabled."})

            {:error, :unknown_spell} ->
              json(conn, %{success: false, error: :unknown_spell, message: "Spell not found."})

            {:error, :not_known_to_character} ->
              json(conn, %{success: false, error: :not_known_to_character, message: "You haven't learned this spell."})

            {:error, {:missing_oghams, missing}} ->
              json(conn, %{
                success: false,
                error: :missing_oghams,
                message: "Missing oghams: #{Enum.join(missing, ", ")}",
                details: missing
              })

            {:error, :insufficient_anam} ->
              json(conn, %{success: false, error: :insufficient_anam, message: "Not enough anam."})

            {:error, :on_cooldown_lost_race} ->
              json(conn, %{success: false, error: :on_cooldown, message: "Spell is on cooldown (race)."})

            {:error, :on_cooldown, ms_remaining} ->
              json(conn, %{
                success: false,
                error: :on_cooldown,
                message: "Spell ready in #{ms_remaining}ms.",
                ms_remaining: ms_remaining
              })

            {:error, :level_too_low} ->
              json(conn, %{success: false, error: :level_too_low, message: "Your level is too low."})

            {:error, reason} ->
              json(conn, %{success: false, error: reason, message: "Cast failed: #{inspect(reason)}"})
          end
        end
    end
  end

  def cast(conn, _),
    do: json(conn, %{success: false, error: :missing_param, message: "spell_key required"})

  def learn(conn, %{"spell_key" => spell_key}) do
    case current_character_id(conn) do
      nil ->
        json(conn, %{success: false, error: :no_character, message: "no character"})

      char_id ->
        case Magic.learn_spell(char_id, spell_key) do
          {:ok, status} -> json(conn, %{success: true, status: to_string(status)})
          {:error, :capability_disabled} -> json(conn, %{success: false, error: :capability_disabled, message: "Magic disabled."})
          {:error, :unknown_spell} -> json(conn, %{success: false, error: :unknown_spell, message: "Spell not found."})
          {:error, :level_too_low} -> json(conn, %{success: false, error: :level_too_low, message: "Level too low."})
          {:error, reason} -> json(conn, %{success: false, error: reason, message: inspect(reason)})
        end
    end
  end

  def learn(conn, _),
    do: json(conn, %{success: false, error: :missing_param, message: "spell_key required"})

  # ── Helpers ──────────────────────────────────────────────────────

  defp current_character_id(conn) do
    user_id = conn.assigns[:user_id] || (conn.private[:plug_session] || %{})["user_id"]

    if user_id do
      case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
        {:ok, %{rows: [[char_id]]}} -> char_id
        _ -> nil
      end
    end
  end

  # Rate limiter — ETS-backed. 60 casts per 60 seconds per character
  # (sanity bound, NOT a balance lever; the cooldown system handles
  # spell-specific pacing). Misuse / lost-row scenarios fail open.
  defp rate_limited?(char_id) do
    ensure_rate_table()
    now = System.system_time(:millisecond)
    cutoff = now - @cast_window_ms

    case :ets.lookup(:te_magic_rate, char_id) do
      [{^char_id, timestamps}] ->
        recent = Enum.filter(timestamps, &(&1 >= cutoff))
        length(recent) >= @cast_per_window

      _ ->
        false
    end
  rescue
    _ -> false
  end

  defp record_cast(char_id) do
    ensure_rate_table()
    now = System.system_time(:millisecond)
    cutoff = now - @cast_window_ms

    timestamps =
      case :ets.lookup(:te_magic_rate, char_id) do
        [{^char_id, ts}] -> Enum.filter(ts, &(&1 >= cutoff))
        _ -> []
      end

    :ets.insert(:te_magic_rate, {char_id, [now | timestamps]})
    :ok
  rescue
    _ -> :ok
  end

  defp ensure_rate_table do
    unless :ets.whereis(:te_magic_rate) != :undefined do
      :ets.new(:te_magic_rate, [:named_table, :public, :set, write_concurrency: true])
    end
  rescue
    ArgumentError -> :ok
  end
end
