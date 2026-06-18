defmodule TePhoenix.AI.Templates.AchievementSet do
  @moduledoc "Prompt template for the achievement_set AI feature — Achievement Set."

  def feature_key, do: "achievement_set"
  def label, do: "Achievement Set"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You generate themed sets of achievements: progression milestones, hidden / secret unlocks, point values, badge icon emoji, and how-to-unlock conditions.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "A combat-mastery achievement set: first kill, 100 kills, no-deaths run, perfect parries",
      "Exploration set: discover regions, climb peaks, swim depths, find secret rooms",
      "Social set: trade with 10 players, make friends, join a guild, host an event"
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
