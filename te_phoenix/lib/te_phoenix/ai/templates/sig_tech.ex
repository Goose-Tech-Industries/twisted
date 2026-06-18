defmodule TePhoenix.AI.Templates.SigTech do
  @moduledoc "Prompt template for the sig_tech AI feature — Signature Technique."

  def feature_key, do: "sig_tech"
  def label, do: "Signature Technique"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You design signature techniques: high-damage class-specific moves with charge requirements, animation tags, finishing-blow flag, level requirements, and lore text.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "A 'Soul Cleave' two-handed sword tech requiring 75% rage",
      "A 'Mind Shatter' psionic burst that confuses + damages MP",
      "A 'Lance Charge' mounted pierce that hits multiple enemies in a line"
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
