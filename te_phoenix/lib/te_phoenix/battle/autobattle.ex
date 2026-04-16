defmodule TePhoenix.Battle.AutoBattle do
  @moduledoc """
  Auto-battle AI system — AI-controlled party actions + speed controls.
  Ported from te/battle/autobattle.js

  5 tactic presets: aggressive, defensive, balanced, conserve_mp, focus_heal
  Smart target selection: lowest_hp, highest_threat, highest_hp
  Speed controls: 1x, 2x, 4x
  """

  alias TePhoenix.Battle.Combatant

  @tactics %{
    "aggressive" => %{
      label: "Aggressive", icon: "⚔️",
      description: "Prioritize damage. Target weakest enemy. Ignore defense.",
      heal_threshold: 0.15, use_skills_freely: true,
      prefer_target: :lowest_hp, guard_threshold: 0, buff_priority: :attack
    },
    "defensive" => %{
      label: "Defensive", icon: "🛡️",
      description: "Guard when hurt. Heal allies. Play safe.",
      heal_threshold: 0.50, use_skills_freely: false,
      prefer_target: :highest_threat, guard_threshold: 0.50, buff_priority: :defense
    },
    "balanced" => %{
      label: "Balanced", icon: "⚖️",
      description: "Mix of offense and support. Smart target selection.",
      heal_threshold: 0.35, use_skills_freely: true,
      prefer_target: :lowest_hp, guard_threshold: 0.25, buff_priority: :attack
    },
    "conserve_mp" => %{
      label: "Conserve MP", icon: "💎",
      description: "Basic attacks only. Skills only in emergencies.",
      heal_threshold: 0.25, use_skills_freely: false,
      prefer_target: :lowest_hp, guard_threshold: 0.30, buff_priority: :none
    },
    "focus_heal" => %{
      label: "Focus Healer", icon: "💚",
      description: "Prioritize healing lowest HP ally. Attack when everyone is healthy.",
      heal_threshold: 0.80, use_skills_freely: true,
      prefer_target: :lowest_hp, guard_threshold: 0.20, buff_priority: :heal
    }
  }

  @speed_multipliers %{1 => 1.0, 2 => 0.5, 4 => 0.25}

  def tactics, do: @tactics
  def speed_multipliers, do: @speed_multipliers

  @doc """
  Pick an auto-battle action for a combatant.
  Returns %{action: :attack|:skill|:defend|:wait, skill_id: _, target_id: _}
  """
  def pick_action(state, combatant, tactics_name \\ "balanced") do
    tactic = Map.get(@tactics, to_string(tactics_name), @tactics["balanced"])
    team = combatant.team_id
    allies = get_team_alive(state, team)
    enemies = get_enemies_alive(state, team)

    if enemies == [] do
      %{action: :wait}
    else
      hp_pct = combatant.current_hp / max(1, combatant.max_hp)
      mp_pct = combatant.current_mp / max(1, combatant.max_mp)

      # 1. Emergency heal self or ally
      wounded_ally = Enum.find(allies, fn a ->
        a.current_hp / max(1, a.max_hp) < tactic.heal_threshold
      end)

      cond do
        # Focus healer: prioritize healing
        wounded_ally && tactic.buff_priority == :heal ->
          heal_skill = find_skill_by_type(combatant, :heal)
          if heal_skill && mp_pct > 0.15 do
            %{action: :skill, skill_id: heal_skill.id, target_id: wounded_ally.char_id}
          else
            pick_offensive_or_defend(combatant, enemies, tactic, hp_pct, mp_pct)
          end

        # Guard if low HP
        hp_pct < tactic.guard_threshold and tactic.guard_threshold > 0 ->
          %{action: :defend}

        # Heal ally if needed
        wounded_ally && tactic.heal_threshold > 0.30 ->
          heal_skill = find_skill_by_type(combatant, :heal)
          if heal_skill && mp_pct > 0.20 do
            %{action: :skill, skill_id: heal_skill.id, target_id: wounded_ally.char_id}
          else
            pick_offensive_or_defend(combatant, enemies, tactic, hp_pct, mp_pct)
          end

        # Normal: pick offense
        true ->
          pick_offensive_or_defend(combatant, enemies, tactic, hp_pct, mp_pct)
      end
    end
  end

  defp pick_offensive_or_defend(combatant, enemies, tactic, _hp_pct, mp_pct) do
    target = pick_target(enemies, tactic.prefer_target)
    target_limb = pick_limb(combatant, target, tactic)
    combo = pick_combo(combatant, tactic)

    base =
      cond do
        tactic.use_skills_freely && mp_pct > 0.20 ->
          case find_skill_by_type(combatant, :damage) do
            nil -> %{action: :attack, target_id: target.char_id}
            atk_skill -> %{action: :skill, skill_id: atk_skill.id, target_id: target.char_id}
          end

        true ->
          %{action: :attack, target_id: target.char_id}
      end

    base
    |> maybe_put(:target_limb, target_limb)
    |> maybe_put(:combo_input, combo)
  end

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, val), do: Map.put(map, key, val)

  # ── Limb pick ──
  #
  # Aggressive + balanced AI opportunistically exploits an already-
  # damaged limb (can't heal, high reward). Defensive AI prefers torso
  # (safest). Focus-healer AI never picks limbs. Heads are only called
  # out when the target is already low HP so the AI can press for a KO.
  defp pick_limb(_combatant, target, tactic) do
    case target.limb_hp || %{} do
      m when map_size(m) == 0 ->
        nil

      limbs ->
        hp_pct = target.current_hp / max(1, target.max_hp)

        case tactic.buff_priority do
          :heal ->
            nil

          _ ->
            damaged =
              limbs
              |> Enum.filter(fn {_k, hp} -> hp > 0 and hp < 50 end)
              |> Enum.sort_by(fn {_k, hp} -> hp end)

            cond do
              hp_pct < 0.35 and Map.has_key?(limbs, "head") and (limbs["head"] || 0) > 0 ->
                "head"

              damaged != [] ->
                {limb_key, _} = List.first(damaged)
                limb_key

              tactic.buff_priority == :defense ->
                nil

              true ->
                nil
            end
        end
    end
  end

  # ── Combo input pick ──
  #
  # Aggressive/balanced AI fires a 2-3 input combo if the combatant has
  # any arts available. Inputs mimic Legaia's HLR system.
  defp pick_combo(combatant, tactic) do
    arts = Map.get(combatant, :combo_arts, [])
    ap = Map.get(combatant, :current_ap, 0)

    cond do
      arts == [] -> nil
      ap < 2 -> nil
      tactic.buff_priority == :heal -> nil
      tactic.buff_priority == :defense -> nil

      true ->
        # If any known art fits our current AP, play its exact sequence.
        playable =
          Enum.filter(arts, fn a ->
            seq = a[:sequence_str] || a["sequence_str"] || ""
            len = String.split(seq, ",") |> length()
            len > 0 and len <= ap
          end)

        case playable do
          [art | _] ->
            art[:sequence_str] || art["sequence_str"]

          [] ->
            # No art fits — throw a 2-input jab combo (safest).
            "H,L"
        end
    end
  end

  @doc "Pick a target using the specified strategy"
  def pick_target(enemies, strategy) do
    case strategy do
      :lowest_hp ->
        Enum.min_by(enemies, & &1.current_hp)

      :highest_threat ->
        Enum.max_by(enemies, &Map.get(&1, :threat, 0))

      :highest_hp ->
        Enum.max_by(enemies, & &1.current_hp)

      _ ->
        List.first(enemies)
    end
  end

  @doc "Find a skill of a given type on a combatant"
  def find_skill_by_type(combatant, type) do
    skills = Map.get(combatant, :skills, [])

    Enum.find(skills, fn s ->
      case type do
        :heal -> s[:effect_type] == "heal" or s[:target_type] == "ally"
        :damage -> s[:effect_type] == "damage" or s[:target_type] in [nil, "enemy"]
        _ -> false
      end
    end)
  end

  @doc "Get all living members of a team"
  def get_team_alive(state, team_id) do
    Map.get(state.teams, team_id, [])
    |> Enum.map(&Map.get(state.combatants, &1))
    |> Enum.filter(fn c -> c && Combatant.alive?(c) end)
  end

  @doc "Get all living enemies (any team that isn't mine)"
  def get_enemies_alive(state, my_team_id) do
    state.teams
    |> Enum.reject(fn {tid, _} -> tid == my_team_id end)
    |> Enum.flat_map(fn {_tid, members} ->
      Enum.map(members, &Map.get(state.combatants, &1))
      |> Enum.filter(fn c -> c && Combatant.alive?(c) end)
    end)
  end

  @doc "Calculate auto-battle delay based on speed setting"
  def auto_delay(base_delay, speed) do
    mult = Map.get(@speed_multipliers, speed, 1.0)
    max(200, trunc(base_delay * mult))
  end
end
