defmodule TePhoenixWeb.Components.RuleSchemas.BattleRule do
  @moduledoc """
  Schema declaration for `game_battle_rules` rows.

  The DB stores the IF in `condition_json` and the THEN in `effect_json`.
  Triggers + targets live as enum columns, NOT in the JSON. So the
  RuleBuilder for battle rules is split into two:

      condition_schema/0 → drives the IF rule_builder (condition_tree)
      action_schema/0    → drives the THEN rule_builder (action_list)

  Trigger + target filter remain plain dropdowns above the rule_builder
  (they're enum columns, not JSON, so no schema-driven dynamism needed).
  """

  @doc "Schema for the IF (conditions) JSON tree."
  def condition_schema do
    %{
      kind: :condition_tree,
      conditions: [
        %{key: "hp_pct", label: "HP %", type: :percent, desc: "Current HP / Max HP"},
        %{key: "mp_pct", label: "MP %", type: :percent, desc: "Current MP / Max MP"},
        %{key: "turn_number", label: "Turn #", type: :integer, desc: "Battle turn counter"},
        %{key: "level", label: "Level", type: :integer, desc: "Combatant level"},
        %{key: "atk", label: "ATK", type: :integer},
        %{key: "def", label: "DEF", type: :integer},
        %{key: "speed", label: "Speed", type: :integer},
        %{key: "has_status", label: "Has Status", type: :select_status,
          desc: "Combatant currently has this status applied"},
        %{key: "missing_status", label: "Missing Status", type: :select_status,
          desc: "Combatant does NOT have this status"},
        %{key: "on_surface", label: "On Surface", type: :select_surface,
          desc: "Combatant is standing on this terrain surface"},
        %{key: "combatant_count", label: "Combatant Count", type: :select,
          options: [{"allies", "Allies"}, {"enemies", "Enemies"}, {"all", "Everyone"}],
          desc: "Number of combatants matching the filter"},
        %{key: "target_is", label: "Target Is", type: :select,
          options: [
            {"enemy", "Enemy"},
            {"ally", "Ally"},
            {"self", "Self"},
            {"summon", "Summoned"},
            {"boss", "Boss"}
          ]}
      ]
    }
  end

  @doc "Schema for the THEN (effects) JSON action list."
  def action_schema do
    %{
      kind: :action_list,
      actions: [
        %{
          key: "apply_status",
          label: "Apply Status",
          desc: "Adds a status effect to the target",
          params: [
            %{key: :status, type: :select_status, label: "Status"},
            %{key: :duration, type: :integer, label: "Turns", min: 0, max: 99, placeholder: "duration"}
          ]
        },
        %{
          key: "remove_status",
          label: "Remove Status",
          desc: "Strips a status from the target",
          params: [%{key: :status, type: :select_status, label: "Status"}]
        },
        %{
          key: "damage",
          label: "Damage",
          desc: "Deal damage with formula + element",
          params: [
            %{key: :formula, type: :string, label: "Formula", placeholder: "ATK*1.5"},
            %{key: :type, type: :select, label: "Element",
              options: [
                {"neutral", "Neutral"}, {"fire", "Fire"}, {"water", "Water"},
                {"earth", "Earth"}, {"air", "Air"}, {"shadow", "Shadow"},
                {"light", "Light"}, {"poison", "Poison"}
              ]}
          ]
        },
        %{
          key: "heal",
          label: "Heal",
          desc: "Restore HP via formula",
          params: [%{key: :formula, type: :string, label: "Formula", placeholder: "MAXHP*0.10"}]
        },
        %{
          key: "stat_mod",
          label: "Stat Modifier",
          desc: "Multiplier applied to one or more stats",
          params: [
            %{key: :atk, type: :float, label: "ATK ×", placeholder: "0.30"},
            %{key: :def, type: :float, label: "DEF ×", placeholder: "0.30"},
            %{key: :speed, type: :float, label: "SPD ×", placeholder: "0.30"},
            %{key: :duration, type: :integer, label: "Turns", min: 0, max: 99}
          ]
        },
        %{
          key: "announce",
          label: "Announce",
          desc: "Broadcast text to the battle log ({name} placeholder OK)",
          params: [%{key: :value, type: :string, label: "Text", placeholder: "{name} reels back!"}]
        },
        %{
          key: "summon",
          label: "Summon",
          desc: "Spawn an additional combatant",
          params: [%{key: :npc_id, type: :select_npc, label: "NPC"}]
        },
        %{
          key: "spawn_surface",
          label: "Spawn Surface",
          desc: "Place a terrain surface around the target",
          params: [
            %{key: :surface, type: :select_surface, label: "Surface"},
            %{key: :radius, type: :integer, label: "Radius", min: 0, max: 5}
          ]
        }
      ]
    }
  end

  @doc "Trigger event enum — populates the trigger picker dropdown."
  def trigger_options do
    [
      {"turn_start", "Turn Start"},
      {"turn_end", "Turn End"},
      {"battle_start", "Battle Start"},
      {"battle_end", "Battle End"},
      {"on_damage_dealt", "On Damage Dealt"},
      {"on_damage_taken", "On Damage Taken"},
      {"on_kill", "On Kill"},
      {"on_ko", "On KO"},
      {"on_heal", "On Heal"},
      {"on_status_applied", "On Status Applied"},
      {"on_status_removed", "On Status Removed"},
      {"on_phase_change", "On Phase Change"},
      {"on_move", "On Move"},
      {"on_flee_attempt", "On Flee Attempt"},
      {"hp_threshold", "HP Threshold"},
      {"mp_threshold", "MP Threshold"},
      {"turn_number", "Turn Number"},
      {"combatant_count", "Combatant Count"}
    ]
  end

  @doc "Target filter enum — populates the target picker dropdown."
  def target_options do
    [
      {"all", "All"},
      {"all_players", "All Players"},
      {"all_enemies", "All Enemies"},
      {"all_allies", "All Allies"},
      {"active_combatant", "Active Combatant"},
      {"target_combatant", "Target Combatant"},
      {"lowest_hp", "Lowest HP"},
      {"highest_hp", "Highest HP"},
      {"random_enemy", "Random Enemy"},
      {"random_ally", "Random Ally"},
      {"boss", "Boss"},
      {"summoned", "Summoned"},
      {"transformed", "Transformed"},
      {"stealthed", "Stealthed"}
    ]
  end
end
