defmodule TePhoenix.AI.Templates.KiMove do
  @moduledoc "Prompt template for the ki_move AI feature — Ki Move."

  def feature_key, do: "ki_move"
  def label, do: "Ki Move"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You generate Ki / energy-based moves (DBZ Planet Mado style) with PL (power level) cost, blast/beam type, charge time, transformation gating, and signature flair.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "A Kamehameha-style continuous beam costing 30% PL over 2 turns",
      "A Final Flash one-shot blast requiring Super Saiyan transform",
      "A spread shot that splits into 5 ki bolts hitting random targets"
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
