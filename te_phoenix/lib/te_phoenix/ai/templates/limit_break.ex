defmodule TePhoenix.AI.Templates.LimitBreak do
  @moduledoc "Prompt template for the limit_break AI feature — Limit Break."

  def feature_key, do: "limit_break"
  def label, do: "Limit Break"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You generate Limit Breaks: charge rate from damage taken or dealt, damage multiplier (typically 3x-10x), cinematic animation cue, voice line, post-use exhaustion penalty if any.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "A 'Rage Awakening' that fills as the user takes damage; 5x ATK strike",
      "A 'Phoenix Burst' AOE healing limit triggered at low HP",
      "An 'Eternal Strike' summons-style limit with 8x damage and a 3-turn weakness after"
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
