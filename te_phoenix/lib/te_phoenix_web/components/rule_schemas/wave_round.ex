defmodule TePhoenixWeb.Components.RuleSchemas.WaveRound do
  @moduledoc """
  Schema for wave-round definitions (TD rounds, MOBA lanes, horde
  patterns). Each round has a clear-condition + a list of spawn
  actions. The waves_live page also gets a dedicated round-by-round
  table editor; this schema drives the per-round Raw view.
  """

  def clear_condition_schema do
    %{
      kind: :condition_tree,
      conditions: [
        %{key: "kill_all", label: "Kill all spawned", type: :boolean,
          desc: "Round clears when every spawned NPC is dead"},
        %{key: "kill_count", label: "Kill count ≥", type: :integer,
          desc: "Round clears at this kill count, even if more remain"},
        %{key: "elapsed_seconds", label: "Time elapsed (s) ≥", type: :integer,
          desc: "Round clears when this many seconds pass"},
        %{key: "boss_defeated", label: "Boss defeated", type: :boolean,
          desc: "Round clears when the round's boss-flagged NPC dies"},
        %{key: "objective_met", label: "Objective met", type: :string,
          desc: "Refers to an objective key — round clears when it completes"}
      ]
    }
  end

  def spawn_action_schema do
    %{
      kind: :action_list,
      actions: [
        %{
          key: "spawn_npc",
          label: "Spawn NPC",
          desc: "Single NPC spawn at one of the round's spawn zones",
          params: [
            %{key: :npc_id, type: :select_npc, label: "NPC"},
            %{key: :count, type: :integer, label: "Count", min: 1, max: 50},
            %{key: :spawn_zone, type: :string, label: "Zone key"},
            %{key: :level_scaling, type: :float, label: "× Level"},
            %{key: :delay_ms, type: :integer, label: "Delay ms", min: 0, max: 60000}
          ]
        },
        %{
          key: "spawn_pack",
          label: "Spawn Pack",
          desc: "Coordinated group spawn (shared aggro target)",
          params: [
            %{key: :npc_id, type: :select_npc, label: "Leader"},
            %{key: :count, type: :integer, label: "Pack size", min: 2, max: 10}
          ]
        },
        %{
          key: "set_difficulty",
          label: "Set Difficulty",
          desc: "Level scaling multiplier for the rest of the round",
          params: [%{key: :value, type: :float, label: "× Difficulty", placeholder: "1.5"}]
        },
        %{
          key: "announce",
          label: "Announce",
          desc: "Broadcast text to the wave overlay",
          params: [%{key: :value, type: :string, label: "Text"}]
        },
        %{
          key: "intermission",
          label: "Intermission",
          desc: "Pause before next round (defaults to 5s if missing)",
          params: [%{key: :seconds, type: :integer, label: "Seconds", min: 0, max: 120}]
        }
      ]
    }
  end

  @doc "Schema for the per-sequence scaling JSON (HP/ATK/XP multipliers per wave)."
  def scaling_schema do
    %{
      kind: :action_list,
      actions: [
        %{key: "hp_mult_per_wave", label: "HP × per wave",
          desc: "Each wave multiplies enemy HP by this. 0.10 = +10% per wave.",
          params: [%{key: :value, type: :float, label: "Mult"}]},
        %{key: "atk_mult_per_wave", label: "ATK × per wave",
          desc: "Each wave scales enemy ATK by this multiplier.",
          params: [%{key: :value, type: :float, label: "Mult"}]},
        %{key: "def_mult_per_wave", label: "DEF × per wave",
          desc: "Each wave scales enemy DEF.",
          params: [%{key: :value, type: :float, label: "Mult"}]},
        %{key: "speed_mult_per_wave", label: "SPD × per wave",
          desc: "Each wave scales enemy speed.",
          params: [%{key: :value, type: :float, label: "Mult"}]},
        %{key: "xp_mult_per_wave", label: "XP × per wave",
          desc: "Each wave scales XP rewards (carrot to keep going).",
          params: [%{key: :value, type: :float, label: "Mult"}]},
        %{key: "count_add_per_loop", label: "Extra enemies per loop",
          desc: "On loop sequences, adds N enemies to each round on each loop iteration.",
          params: [%{key: :value, type: :integer, label: "Extra", min: 0, max: 50}]}
      ]
    }
  end

  @doc "Schema for sequence-level settings (auto-start, clear condition, intervals)."
  def settings_schema do
    %{
      kind: :action_list,
      actions: [
        %{key: "auto_start", label: "Auto-start on match begin",
          desc: "Sequence starts automatically when the match begins.",
          params: [%{key: :value, type: :boolean, label: "Enabled"}]},
        %{key: "clear_condition", label: "Wave clear condition",
          desc: "When a single wave is considered cleared.",
          params: [%{key: :value, type: :select, label: "Mode",
            options: [{"all_dead", "All enemies defeated"}, {"timer", "Timer expires"}]}]},
        %{key: "wave_interval_seconds", label: "Time between waves",
          desc: "Pause before the next wave kicks off (seconds).",
          params: [%{key: :value, type: :integer, label: "Sec", min: 0, max: 600}]},
        %{key: "max_active_enemies", label: "Max active enemies",
          desc: "Cap on concurrent live spawns. Above this, spawns queue.",
          params: [%{key: :value, type: :integer, label: "Cap", min: 1, max: 999}]}
      ]
    }
  end

  @doc """
  Schema for the on_wave_start / on_wave_clear / on_sequence_complete
  callbacks. Each callback fires a list of side-effects (broadcast,
  flag flip, script run, heal). Same shape across all three lifecycle
  hooks so one schema serves all.
  """
  def callback_schema do
    %{
      kind: :action_list,
      actions: [
        %{key: "set_world_flag", label: "Set world flag",
          desc: "Flips a world flag (used by quests/scripts to react).",
          params: [
            %{key: :flag, type: :string, label: "Flag", placeholder: "boss_phase_2"},
            %{key: :value, type: :string, label: "Value", placeholder: "1"}
          ]},
        %{key: "broadcast", label: "Broadcast event",
          desc: "Pushes an event onto the world bus — anything subscribed reacts.",
          params: [%{key: :value, type: :string, label: "Event name"}]},
        %{key: "script_id", label: "Run visual script",
          desc: "Executes the named visual script graph.",
          params: [%{key: :value, type: :integer, label: "Script ID", min: 1}]},
        %{key: "heal_full", label: "Heal all combatants",
          desc: "Restores full HP/MP to every combatant (between-wave breather).",
          params: [%{key: :value, type: :boolean, label: "Apply"}]},
        %{key: "announce", label: "Announce message",
          desc: "Battle-log line shown to everyone on the map.",
          params: [%{key: :value, type: :textarea, label: "Text"}]},
        %{key: "spawn_loot_chest", label: "Spawn loot chest",
          desc: "Drops a chest tied to a loot table key.",
          params: [%{key: :value, type: :string, label: "Loot table key"}]}
      ]
    }
  end

  @doc """
  Column definitions for the round-by-round table editor in waves_live.
  Returns a list of `%{key, label, type, options}` rows so the LV can
  render a flat table without authoring its own column metadata.
  """
  def round_table_columns do
    [
      %{key: :round_number, label: "Round #", type: :integer, min: 1, width: "w-16"},
      %{key: :npc_id, label: "NPC", type: :select_npc, width: "flex-1"},
      %{key: :count, label: "Count", type: :integer, min: 1, max: 50, width: "w-20"},
      %{key: :spawn_zone, label: "Spawn Zone", type: :string, width: "w-32"},
      %{key: :difficulty, label: "Difficulty ×", type: :float, width: "w-24",
        placeholder: "1.0"},
      %{key: :delay_seconds, label: "Delay (s)", type: :integer, min: 0, max: 60, width: "w-20"}
    ]
  end
end
