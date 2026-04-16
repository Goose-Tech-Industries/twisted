defmodule TePhoenix.Battle.Stats do
  require Logger
  @moduledoc """
  Effective stat calculator — loads a character from DB and builds
  a complete combatant stats map with equipment bonuses, status mods,
  ogham bonuses, reaction skills, and weapon types.
  Ported from te/battle/stats.js getEffectiveStats()
  """

  alias TePhoenix.Repo
  import Ecto.Query

  @doc """
  Load a character's effective combat stats from the database.
  Applies: base stats + equipment bonuses + status mods + ogham bonuses.
  Returns a map ready to be used as Combatant init data, or nil if not found.
  """
  def get_effective_stats(char_id) do
    # 1. Base character stats
    case Repo.one(from c in "characters", where: c.id == ^char_id,
           select: %{
             id: c.id, user_id: c.user_id, name: c.name, level: c.level,
             class_id: c.class_id, race_id: c.race_id,
             current_hp: c.current_hp, max_hp: c.max_hp,
             current_mp: c.current_mp, max_mp: c.max_mp,
             atk: c.atk, def: c.def, mo: c.mo, md: c.md,
             speed: c.speed, luck: c.luck,
             limitbreak: c.limitbreak, breaklevel: c.breaklevel,
             status_effects: c.status_effects, map_id: c.map_id,
             x: c.x, y: c.y, experience: c.experience
           }) do
      nil -> nil
      c ->
        stats = %{
          char_id: c.id,
          user_id: c.user_id,
          name: c.name,
          level: c.level || 1,
          class_id: c.class_id,
          race_id: c.race_id,
          current_hp: c.current_hp,
          max_hp: c.max_hp,
          current_mp: c.current_mp,
          max_mp: c.max_mp,
          atk: c.atk,
          def: c.def,
          mo: c.mo,
          md: c.md,
          speed: c.speed,
          luck: c.luck,
          limitbreak: parse_float(c.limitbreak) || 0,
          breaklevel: c.breaklevel || 1,
          statuses: parse_json_list(c.status_effects),
          weapon_elements: [],
          weapon_statuses: %{},
          elem_defenses: [],
          ogham_elements: [],
          ogham_statuses: %{},
          reactions: [],
          weapon_type: nil,
          armor_type: nil,
          penetration: 0,
          crit_resist: 0,
          map_id: c.map_id,
          experience: c.experience || 0
        }

        stats
        |> apply_equipment_bonuses(char_id)
        |> apply_status_mods()
        |> apply_ogham_bonuses(char_id)
        |> load_reactions(c.class_id, c.level)
        |> detect_weapon_type(char_id)
    end
  rescue
    e ->
      require Logger
      Logger.warning("Failed to load stats for char #{char_id}: #{inspect(e)}")
      nil
  end

  # ── Equipment bonuses ───────────────────────────────────────────

  defp apply_equipment_bonuses(stats, char_id) do
    equip =
      try do
        Repo.all(
          from ce in "character_equipment",
          join: gi in "game_items", on: ce.item_id == gi.id,
          where: ce.character_id == ^char_id,
          select: %{
            slot_key: ce.slot_key, item_id: gi.id,
            bonus_hp: gi.bonus_hp, bonus_mp: gi.bonus_mp,
            bonus_atk: gi.bonus_atk, bonus_def: gi.bonus_def,
            bonus_mo: gi.bonus_mo, bonus_md: gi.bonus_md,
            bonus_speed: gi.bonus_speed, bonus_luck: gi.bonus_luck,
            elements: gi.elements, set_status: gi.set_status,
            type: gi.type
          }
        )
      rescue
        _ -> []
      end

    Enum.reduce(equip, stats, fn item, acc ->
      acc = %{acc |
        atk: acc.atk + (item.bonus_atk || 0),
        def: acc.def + (item.bonus_def || 0),
        mo: acc.mo + (item.bonus_mo || 0),
        md: acc.md + (item.bonus_md || 0),
        speed: acc.speed + (item.bonus_speed || 0),
        luck: acc.luck + (item.bonus_luck || 0),
        max_hp: acc.max_hp + (item.bonus_hp || 0),
        max_mp: acc.max_mp + (item.bonus_mp || 0)
      }

      # Element processing from equipment
      acc = case parse_json_map(item.elements) do
        nil -> acc
        elems ->
          Enum.reduce(elems, acc, fn {elem_name, val}, a ->
            en = String.downcase(to_string(elem_name))
            case val do
              %{"role" => "attack"} ->
                %{a | weapon_elements: [en | a.weapon_elements]}
              %{"role" => role, "pct" => pct} ->
                %{a | elem_defenses: [%{elem: en, role: role, pct: pct} | a.elem_defenses]}
              %{"role" => role} ->
                %{a | elem_defenses: [%{elem: en, role: role, pct: 50} | a.elem_defenses]}
              "attack" ->
                %{a | weapon_elements: [en | a.weapon_elements]}
              _ ->
                %{a | elem_defenses: [%{elem: en, role: "resist", pct: 50} | a.elem_defenses]}
            end
          end)
      end

      # Weapon status effects (from main/off hand)
      acc = if item.slot_key in ["MAIN_HAND", "OFF_HAND"] do
        case parse_json_map(item.set_status) do
          nil -> acc
          ws -> %{acc | weapon_statuses: Map.merge(acc.weapon_statuses, ws)}
        end
      else
        acc
      end

      acc
    end)
  end

  # ── Status effect modifiers ─────────────────────────────────────

  defp apply_status_mods(stats) do
    Enum.reduce(stats.statuses, stats, fn status, acc ->
      status_id = status["id"] || status[:id]
      if status_id == nil, do: acc

      case load_status_effects(status_id) do
        nil -> acc
        effects ->
          # Apply stat_mod multipliers
          case Map.get(effects, "stat_mod") do
            nil -> acc
            mods ->
              Enum.reduce(mods, acc, fn {stat_key, multiplier}, a ->
                try do
                  key = String.to_existing_atom(stat_key)
                  case Map.get(a, key) do
                    val when is_number(val) -> Map.put(a, key, trunc(val * multiplier))
                    _ -> a
                  end
                rescue
                  _ -> a
                end
              end)
          end
      end
    end)
  end

  defp load_status_effects(status_id) do
    case Repo.one(from s in "game_statuses", where: s.id == ^status_id, select: s.effects) do
      nil -> nil
      json -> parse_json_map(json)
    end
  rescue
    _ -> nil
  end

  # ── Ogham bonuses ───────────────────────────────────────────────

  defp apply_ogham_bonuses(stats, char_id) do
    oghams =
      try do
        Repo.all(
          from co in "character_oghams",
          join: go in "game_oghams", on: go.id == co.ogham_id,
          where: co.character_id == ^char_id,
          select: %{
            element_attack: go.element_attack,
            on_hit_status: go.on_hit_status,
            on_hit_chance: go.on_hit_chance,
            stat_bonus_json: go.stat_bonus_json
          }
        )
      rescue
        _ -> []
      end

    Enum.reduce(oghams, stats, fn og, acc ->
      # Element attack
      acc = if og.element_attack do
        %{acc | ogham_elements: [String.downcase(og.element_attack) | acc.ogham_elements]}
      else
        acc
      end

      # On-hit status
      acc = if og.on_hit_status do
        %{acc | ogham_statuses: Map.put(acc.ogham_statuses, og.on_hit_status, %{
          chance: og.on_hit_chance || 20
        })}
      else
        acc
      end

      # Stat bonuses
      case parse_json_map(og.stat_bonus_json) do
        nil -> acc
        bonuses ->
          Enum.reduce(bonuses, acc, fn {k, v}, a ->
            try do
              key = String.to_existing_atom(k)
              case Map.get(a, key) do
                val when is_number(val) -> Map.put(a, key, val + v)
                _ -> a
              end
            rescue
              _ -> a
            end
          end)
      end
    end)
  end

  # ── Reaction skills ─────────────────────────────────────────────

  defp load_reactions(stats, class_id, level) do
    reactions =
      try do
        Repo.all(
          from gcs in "game_class_skills",
          join: gs in "game_skills", on: gcs.skill_id == gs.id,
          where: gcs.class_id == ^class_id and gcs.learn_level <= ^level,
          select: %{id: gs.id, name: gs.name, icon: gs.icon, effects: gs.effects}
        )
        |> Enum.filter(fn s ->
          case parse_json_map(s.effects) do
            %{"reaction" => %{"trigger" => _}} -> true
            _ -> false
          end
        end)
        |> Enum.map(fn s ->
          fx = parse_json_map(s.effects)
          %{
            skill_id: s.id,
            name: s.name,
            icon: s.icon,
            trigger: get_in(fx, ["reaction", "trigger"]),
            chance: get_in(fx, ["reaction", "chance"]) || 25
          }
        end)
      rescue
        _ -> []
      end

    %{stats | reactions: reactions}
  end

  # ── Weapon type detection ───────────────────────────────────────

  defp detect_weapon_type(stats, char_id) do
    weapon_type =
      try do
        Repo.one(
          from ce in "character_equipment",
          join: gi in "game_items", on: ce.item_id == gi.id,
          where: ce.character_id == ^char_id and ce.slot_key == "MAIN_HAND",
          select: gi.type
        )
      rescue
        _ -> nil
      end

    %{stats | weapon_type: weapon_type}
  end

  # ── Enemy scaling for party battles ─────────────────────────────

  @doc "Scale enemy stats based on player count"
  def apply_enemy_scaling(enemy_stats, player_count, scaling_factor \\ 1.0)

  def apply_enemy_scaling(enemy_stats, player_count, scaling_factor) when player_count > 1 do
    # Each additional player adds ~40% HP and ~15% stats
    hp_mult = 1.0 + (player_count - 1) * 0.40 * scaling_factor
    stat_mult = 1.0 + (player_count - 1) * 0.15 * scaling_factor

    %{enemy_stats |
      max_hp: trunc(enemy_stats.max_hp * hp_mult),
      current_hp: trunc(enemy_stats.current_hp * hp_mult),
      atk: trunc(enemy_stats.atk * stat_mult),
      def: trunc(enemy_stats.def * stat_mult),
      mo: trunc(enemy_stats.mo * stat_mult),
      md: trunc(enemy_stats.md * stat_mult)
    }
  end

  def apply_enemy_scaling(stats, _, _), do: stats

  # ── JSON helpers ────────────────────────────────────────────────

  defp parse_json_map(nil), do: nil
  defp parse_json_map(val) when is_map(val), do: val
  defp parse_json_map(str) when is_binary(str) do
    case Jason.decode(str) do
      {:ok, map} when is_map(map) -> map
      _ -> nil
    end
  end
  defp parse_json_map(_), do: nil

  defp parse_json_list(nil), do: []
  defp parse_json_list(val) when is_list(val), do: val
  defp parse_json_list(str) when is_binary(str) do
    case Jason.decode(str) do
      {:ok, list} when is_list(list) -> list
      _ -> []
    end
  end
  defp parse_json_list(_), do: []

  defp parse_float(nil), do: 0.0
  defp parse_float(f) when is_float(f), do: f
  defp parse_float(i) when is_integer(i), do: i * 1.0
  defp parse_float(s) when is_binary(s) do
    case Float.parse(s) do
      {f, _} -> f
      :error -> 0.0
    end
  end
  defp parse_float(_), do: 0.0
end
