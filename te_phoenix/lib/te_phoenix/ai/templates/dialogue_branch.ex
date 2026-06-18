defmodule TePhoenix.AI.Templates.DialogueBranch do
  @moduledoc "Prompt template for the dialogue_branch AI feature — Dialogue Branch."

  def feature_key, do: "dialogue_branch"
  def label, do: "Dialogue Branch"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You write the next NPC dialogue node + 2-4 player response options. Match the NPC's personality. Each player option leads to a next node ID, sets a flag, gives an item, or starts a quest.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "A merchant haggling over a rare relic — friendly, mocking, or threatening branches",
      "A grizzled veteran NPC giving cryptic warnings about a coming danger",
      "A child NPC asking for help finding a lost pet"
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
