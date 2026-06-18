defmodule TePhoenix.AI.Templates.StatusGenerator do
  @moduledoc "Prompt template for the status_generator AI feature — Status Effect Generator."

  def feature_key, do: "status_generator"
  def label, do: "Status Effect Generator"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You generate battle status effects with appropriate icon emoji, default duration, stacking mode, on_apply / on_tick / on_expire effect lists. Categories: buff, debuff, dot, hot, control, injury.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "A 'Frostbite' debuff that deals cold damage each turn and slows speed by 30%",
      "A 'Second Wind' buff that triggers when HP drops below 20%, restoring some HP",
      "An injury status 'Broken Arm' that prevents physical attacks until healed"
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
