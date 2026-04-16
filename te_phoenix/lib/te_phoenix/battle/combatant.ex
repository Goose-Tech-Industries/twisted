defmodule TePhoenix.Battle.Combatant do
  @moduledoc """
  Combatant struct — represents a single fighter in battle.
  Each combatant has stats, position, team, statuses, and per-battle state.
  Ported from the stats objects in te/battle/state.js
  """

  defstruct [
    # Identity
    char_id: nil,
    name: nil,
    team_id: nil,
    is_ai: false,

    # Core stats
    level: nil,
    max_hp: 100,
    current_hp: 100,
    max_mp: 50,
    current_mp: 50,
    atk: 10,
    def: 5,
    mo: 5,
    md: 5,
    speed: 10,
    luck: 5,

    # Grid position
    grid_x: 0,
    grid_y: 0,

    # Equipment
    weapon_type: nil,
    weapon_elements: [],
    armor_type: nil,
    equipment: %{},

    # Status effects: list of %{id, name, duration, stacks, effects}
    statuses: [],

    # Per-battle combat state
    stance: nil,
    charging: nil,
    charging_fire: false,
    miss_chance: 0,

    # Limb system (Session 8)
    limb_hp: %{},
    limb_zones: %{},
    wound_levels: %{},
    knocked_out: false,
    non_lethal: false,
    unconscious: false,

    # Diminishing returns
    last_attack_used: nil,
    diminishing_returns: 0,

    # Ki channeling
    ki_active: false,
    ki_turns_left: 0,
    ki_uses_this_battle: 0,

    # Stealth
    stealth_active: false,

    # Brave/Default BP
    bp: 0,

    # Morale
    morale: 100,

    # Stagger gauge
    stagger: 0,
    stagger_max: 100,
    broken: false,
    break_turns_left: 0,

    # Break shield (Octopath style)
    shield_points: 0,
    shield_max: 0,
    weaknesses: [],

    # Transform state
    transform_active: false,
    transform_data: nil,
    transform_turns_left: 0,

    # Dipped weapon element (BG3)
    dipped_element: nil,
    dipped_turns: 0,

    # Taunt / Intimidate / Rally buffs (RP commands)
    taunt_bonus: nil,
    intimidated: nil,
    rallied: nil,

    # Status combo bonus
    status_combo_bonus: 0,

    # Threat (aggro)
    threat: 0,

    # Movement tracking
    has_moved: false,
    move_range: nil,

    # Opportunity attacks
    opportunity_attacks_used: 0,

    # Passive abilities
    passives: [],

    # Summon tracking
    summoner_id: nil,
    summon_turns_left: 0,

    # Cover system
    covering: nil,
    covered_by: nil,
    cover_turns_left: 0,

    # Barrier
    barrier_hp: 0,

    # ATB gauge (0.0 - 1.0)
    atb_gauge: 0.0,

    # CTB counter
    ctb_counter: 0,

    # Auto-battle settings (set by player via channel)
    auto_battle: false,
    auto_tactics: "balanced",
    auto_speed: 1,

    # Active defense preference (dodge/block/counter)
    default_defense: nil,

    # Limb targeting preference
    target_limb: nil,

    # Brave/Default defaulting flag
    is_defaulting: false,

    # Cooldowns: %{skill_id => turns_remaining}. Decremented each turn
    # end. Skills with remaining > 0 are gated in combat.ex dispatch.
    cooldowns: %{},

    # Real-time combat state
    rt_target: nil,
    rt_queued_ability: nil,

    # User/map context (loaded from DB at battle start)
    user_id: nil,
    map_id: nil
  ]

  @type t :: %__MODULE__{}

  @doc "Check if combatant is alive and not knocked out"
  def alive?(%__MODULE__{current_hp: hp, knocked_out: ko}), do: hp > 0 and not ko

  @doc "Check if combatant can act (alive, not stunned, not unconscious)"
  def can_act?(%__MODULE__{} = c) do
    alive?(c) and not c.unconscious
  end

  @doc "Apply damage, clamping HP to 0"
  def apply_damage(%__MODULE__{} = c, amount) when amount >= 0 do
    %{c | current_hp: max(0, c.current_hp - amount)}
  end

  @doc "Apply healing, clamping to max HP"
  def apply_healing(%__MODULE__{} = c, amount) when amount >= 0 do
    %{c | current_hp: min(c.max_hp, c.current_hp + amount)}
  end

  @doc "Spend MP, returns {:ok, combatant} or {:error, :insufficient_mp}"
  def spend_mp(%__MODULE__{current_mp: mp} = c, cost) do
    if mp >= cost do
      {:ok, %{c | current_mp: mp - cost}}
    else
      {:error, :insufficient_mp}
    end
  end

  @doc "Build formula variables map for damage calculations"
  def formula_vars(%__MODULE__{} = actor, %__MODULE__{} = target) do
    %{
      "ATK" => actor.atk,
      "DEF" => target.def,
      "MO" => actor.mo,
      "MD" => target.md,
      "SPD" => actor.speed,
      "LCK" => actor.luck,
      "LVL" => actor.level || 1,
      "HP" => actor.current_hp,
      "MHP" => actor.max_hp,
      "MP" => actor.current_mp,
      "MMP" => actor.max_mp,
      "TLVL" => target.level || 1,
      "THP" => target.current_hp,
      "TMHP" => target.max_hp
    }
  end
end
