defmodule TePhoenix.AI.Templates.OnboardingSeed do
  @moduledoc "Prompt template for the onboarding_seed AI feature — Onboarding Seed Content."

  def feature_key, do: "onboarding_seed"
  def label, do: "Onboarding Seed Content"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You generate starter content for a chosen game genre: 1-3 sample maps, 5-10 NPCs, 5-10 items, 1-2 quests, 1 dialogue tree. Tune to fit the genre's expected tropes.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "RPG starter: village + nearby forest, vendor + guard NPCs, basic gear, intro quest",
      "RTS starter: 2 player spawns + resource nodes + 1 neutral creep camp",
      "Roguelike starter: 1 randomized dungeon floor with 3 enemy types + 1 boss"
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
