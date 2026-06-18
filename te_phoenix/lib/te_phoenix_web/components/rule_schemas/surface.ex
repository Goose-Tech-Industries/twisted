defmodule TePhoenixWeb.Components.RuleSchemas.Surface do
  @moduledoc """
  Schema for terrain surface effects (fire / ice / oil / poison /
  blessed ground). The IF clause defines what triggers the effect when
  a combatant interacts with the surface; the THEN clause is the per-
  trigger payload.
  """

  def trigger_schema do
    %{
      kind: :condition_tree,
      conditions: [
        %{key: "interaction", label: "Interaction", type: :select,
          options: [
            {"on_enter", "Step Onto"},
            {"on_step", "Each Step"},
            {"on_leave", "Step Off"},
            {"on_stand", "Stand For Turn"},
            {"on_attack_from", "Attack From"}
          ],
          desc: "What kind of interaction triggers the surface effect"},
        %{key: "combatant_filter", label: "Combatant Filter", type: :select,
          options: [
            {"any", "Any"}, {"player", "Player"}, {"enemy", "Enemy"},
            {"ally", "Ally"}, {"summon", "Summon"}, {"non_flying", "Non-Flying"}
          ]},
        %{key: "has_status", label: "Has Status", type: :select_status,
          desc: "Only fires if combatant currently has this status"},
        %{key: "missing_resist", label: "Missing Resist", type: :select,
          options: [{"fire", "Fire"}, {"cold", "Cold"}, {"poison", "Poison"}, {"shock", "Shock"}],
          desc: "Skip combatants that resist this element"}
      ]
    }
  end

  def effect_schema do
    %{
      kind: :action_list,
      actions: [
        %{
          key: "damage_per_step",
          label: "Damage / Step",
          desc: "HP damage applied each turn the combatant stays",
          params: [
            %{key: :amount, type: :integer, label: "HP", min: 0, max: 9999},
            %{key: :element, type: :select, label: "Element",
              options: [{"fire", "Fire"}, {"cold", "Cold"}, {"poison", "Poison"}, {"shock", "Shock"}]}
          ]
        },
        %{
          key: "heal_per_step",
          label: "Heal / Step",
          desc: "HP restored each turn",
          params: [%{key: :amount, type: :integer, label: "HP", min: 0, max: 9999}]
        },
        %{
          key: "apply_status",
          label: "Apply Status",
          desc: "Status applied on interaction",
          params: [
            %{key: :status, type: :select_status, label: "Status"},
            %{key: :duration, type: :integer, label: "Turns", min: 0, max: 99}
          ]
        },
        %{
          key: "slow",
          label: "Slow",
          desc: "Multiplier applied to combatant speed while on surface",
          params: [%{key: :factor, type: :float, label: "× Speed", placeholder: "0.5"}]
        },
        %{
          key: "blocked",
          label: "Block Movement",
          desc: "Combatant cannot enter this tile (impassable)"
        },
        %{
          key: "consume",
          label: "Consume Surface",
          desc: "Surface is destroyed after triggering N times",
          params: [%{key: :uses, type: :integer, label: "Uses", min: 1, max: 999}]
        }
      ]
    }
  end
end
