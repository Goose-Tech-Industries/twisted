defmodule TePhoenix.AI.Templates.OghamDesign do
  @moduledoc "Prompt template for the ogham_design AI feature — Ogham Design."

  def feature_key, do: "ogham_design"
  def label, do: "Ogham Design"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You design oghams (Celtic runes): symbol, family, awakening tier, casting effect (damage / buff / utility), MP cost, prerequisites for unlock.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "A 'Beithe' ogham that summons protective birch bark armor — defensive, beginner tier",
      "A 'Tinne' ogham that strikes with concentrated holly fire — offensive, advanced",
      "A 'Quert' apple ogham that heals + cleanses status — utility, mythic tier"
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
