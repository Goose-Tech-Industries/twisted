defmodule TePhoenix.AI.Templates.MatchWinCondition do
  @moduledoc "Prompt template for the match_win_condition AI feature — Match Win Condition."

  def feature_key, do: "match_win_condition"
  def label, do: "Match Win Condition"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You design match-mode win conditions: elimination, score, objective capture, survival, escort, asymmetric. Include score targets, time limits, min/max combatants, and tiebreakers.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "Capture the flag: 3 captures win or 10 minute timer with most caps wins",
      "Asymmetric 1v4 horror: killer wins on 3 kills, survivors win at 5 minutes",
      "Score-based ranked: first to 1500 ELO points or 25 kills"
    ]
  end

  def parse_response(text) when is_binary(text) do
    cleaned =
      text
      |> String.replace(~r/^.*?\`\`\`json\s*/s, "")
      |> String.replace(~r/\s*\`\`\`.*$/s, "")
      |> String.trim()

    case Jason.decode(cleaned) do
      {:ok, decoded} -> {:ok, decoded}
      _ -> {:ok, %{"text" => text}}
    end
  end

  def parse_response(other), do: {:ok, other}
end
