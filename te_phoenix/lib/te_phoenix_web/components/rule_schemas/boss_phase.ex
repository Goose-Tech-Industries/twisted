defmodule TePhoenixWeb.Components.RuleSchemas.BossPhase do
  @moduledoc """
  Schema for boss-encounter phase definitions. A boss has multiple phases
  keyed by HP threshold (or turn count). Each phase declares an entry
  trigger + ongoing behavior modifiers.
  """

  def transition_schema do
    %{
      kind: :condition_tree,
      conditions: [
        %{key: "hp_pct_below", label: "HP % below", type: :percent,
          desc: "Trigger phase when boss HP drops below this %"},
        %{key: "turn_number", label: "Turn #", type: :integer,
          desc: "Trigger phase on this battle turn"},
        %{key: "ally_count", label: "Allies remaining", type: :integer},
        %{key: "has_status", label: "Has Status", type: :select_status},
        %{key: "took_damage_from", label: "Took damage from", type: :select,
          options: [{"player", "Player"}, {"summon", "Summon"}, {"environment", "Environment"}]}
      ]
    }
  end

  def behavior_schema do
    %{
      kind: :action_list,
      actions: [
        %{
          key: "enrage",
          label: "Enrage",
          desc: "Buff stats for the rest of the fight",
          params: [
            %{key: :atk, type: :float, label: "ATK ×", placeholder: "1.5"},
            %{key: :speed, type: :float, label: "SPD ×", placeholder: "1.5"}
          ]
        },
        %{
          key: "spawn_adds",
          label: "Spawn Adds",
          desc: "Summon additional enemies on phase entry",
          params: [
            %{key: :npc_id, type: :select_npc, label: "NPC"},
            %{key: :count, type: :integer, label: "Count", min: 1, max: 8}
          ]
        },
        %{
          key: "unlock_skill",
          label: "Unlock Skill",
          desc: "Make a previously-locked skill usable",
          params: [%{key: :skill_key, type: :string, label: "Skill key"}]
        },
        %{
          key: "lock_skill",
          label: "Lock Skill",
          desc: "Disable a skill for the rest of the fight",
          params: [%{key: :skill_key, type: :string, label: "Skill key"}]
        },
        %{
          key: "set_phase_name",
          label: "Phase Name",
          desc: "Display name shown above the boss HP bar",
          params: [%{key: :value, type: :string, label: "Name", placeholder: "Phase 2: Fury"}]
        },
        %{
          key: "screen_effect",
          label: "Screen FX",
          desc: "Trigger a visual effect (shake, flash, tint)",
          params: [
            %{key: :kind, type: :select, label: "Effect",
              options: [{"shake", "Shake"}, {"flash", "Flash"}, {"fade", "Fade"}, {"tint", "Tint"}]},
            %{key: :duration_ms, type: :integer, label: "ms", min: 100, max: 5000}
          ]
        },
        %{
          key: "announce",
          label: "Announce",
          desc: "Broadcast to battle log on phase entry",
          params: [%{key: :value, type: :string, label: "Text"}]
        }
      ]
    }
  end
end
