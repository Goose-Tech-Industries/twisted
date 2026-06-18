defmodule TePhoenixWeb.Components.RuleSchemas.MatchMode do
  @moduledoc """
  Schema for match-mode definition rows. The IF clause expresses
  win-condition predicates (kills, score, time, objective). The THEN
  clause expresses match-end side-effects (rewards, broadcasts).

  Matches the existing `game_match_modes` config map shape so existing
  rows load without conversion.
  """

  def win_condition_schema do
    %{
      kind: :condition_tree,
      conditions: [
        %{key: "type", label: "Win type", type: :select,
          options: [
            {"elimination", "Elimination (last team standing)"},
            {"score", "Score (first to N)"},
            {"objective", "Objective (capture / destroy)"},
            {"survival", "Survival (last N turns)"},
            {"escort", "Escort (NPC reaches goal)"},
            {"asymmetric", "Asymmetric (split goals per team)"}
          ],
          desc: "How the match resolves"},
        %{key: "score_target", label: "Score target", type: :integer,
          desc: "First team to N points wins"},
        %{key: "time_limit_seconds", label: "Time limit (s)", type: :integer,
          desc: "Match auto-resolves when this elapses"},
        %{key: "min_combatants", label: "Min combatants", type: :integer},
        %{key: "max_combatants", label: "Max combatants", type: :integer},
        %{key: "objective_key", label: "Objective key", type: :string,
          desc: "Refers to a row in /sauce/world/objectives"}
      ]
    }
  end

  @doc "Schema for the per-match-mode rewards JSON (XP / gold / rank points)."
  def rewards_schema do
    %{
      kind: :action_list,
      actions: [
        %{
          key: "xp_win",
          label: "XP (winner)",
          desc: "Experience awarded to each winning combatant",
          params: [%{key: :value, type: :integer, label: "XP", min: 0, max: 99999}]
        },
        %{
          key: "xp_loss",
          label: "XP (loser)",
          desc: "Consolation XP for losers — keeps grind ladders fair",
          params: [%{key: :value, type: :integer, label: "XP", min: 0, max: 99999}]
        },
        %{
          key: "gold_win",
          label: "Gold (winner)",
          desc: "Gold awarded to winners",
          params: [%{key: :value, type: :integer, label: "Gold", min: 0, max: 999999}]
        },
        %{
          key: "gold_loss",
          label: "Gold (loser)",
          desc: "Gold awarded to losers",
          params: [%{key: :value, type: :integer, label: "Gold", min: 0, max: 999999}]
        },
        %{
          key: "rank_win",
          label: "Rank Points (win)",
          desc: "Ladder points gained per win — only used when ranked is on",
          params: [%{key: :value, type: :integer, label: "Points", min: 0, max: 999}]
        },
        %{
          key: "rank_loss",
          label: "Rank Points (loss)",
          desc: "Ladder points lost per loss",
          params: [%{key: :value, type: :integer, label: "Points", min: 0, max: 999}]
        },
        %{
          key: "currency_bonus",
          label: "Bonus Currency",
          desc: "Free-form bonus pool for tournaments / season payouts",
          params: [%{key: :value, type: :integer, label: "Amount", min: 0, max: 999999}]
        }
      ]
    }
  end

  def settings_schema do
    %{
      kind: :action_list,
      actions: [
        %{
          key: "asymmetric",
          label: "Asymmetric",
          desc: "Toggle on for 1-vs-N modes (DBD / VS-AI)",
          params: [
            %{key: :killer_team_size, type: :integer, label: "Killer team", min: 1, max: 4},
            %{key: :survivor_team_size, type: :integer, label: "Survivors", min: 1, max: 16}
          ]
        },
        %{
          key: "allow_spectators",
          label: "Allow Spectators",
          desc: "Whether non-participants can join as observers",
          params: [%{key: :value, type: :boolean, label: "Enabled"}]
        },
        %{
          key: "ranked",
          label: "Ranked",
          desc: "Counts toward ladder + season rewards",
          params: [%{key: :value, type: :boolean, label: "Enabled"}]
        },
        %{
          key: "queue_threshold",
          label: "Queue Threshold",
          desc: "Min players before lobby pops",
          params: [%{key: :value, type: :integer, label: "Players", min: 2, max: 16}]
        },
        %{
          key: "lobby_timeout_seconds",
          label: "Lobby Timeout",
          desc: "Cancel queue if not full in N seconds",
          params: [%{key: :value, type: :integer, label: "Seconds", min: 30, max: 600}]
        },
        %{
          key: "rewards_currency",
          label: "Currency Reward",
          desc: "Gold / tokens awarded to the winning team",
          params: [%{key: :value, type: :integer, label: "Amount", min: 0, max: 99999}]
        },
        %{
          key: "rewards_xp",
          label: "XP Reward",
          desc: "Experience awarded per participant",
          params: [%{key: :value, type: :integer, label: "Amount", min: 0, max: 99999}]
        }
      ]
    }
  end
end
