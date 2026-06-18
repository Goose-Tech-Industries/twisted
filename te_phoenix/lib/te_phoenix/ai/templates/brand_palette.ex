defmodule TePhoenix.AI.Templates.BrandPalette do
  @moduledoc "Prompt template for the brand_palette AI feature — Brand Palette."

  def feature_key, do: "brand_palette"
  def label, do: "Brand Palette"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You suggest splash + login color palettes + atmosphere preset for a theme. Include hex colors for top/mid/accent, atmosphere variant (gothic/minimal/none), embers count if gothic, and font family.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "A dark Celtic gothic theme with deep blood-red accents and parchment text",
      "A clean cyberpunk neon theme — purple primary, cyan accents, minimal atmosphere",
      "A warm parchment fantasy look — sepia, leather brown, gold accents"
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
