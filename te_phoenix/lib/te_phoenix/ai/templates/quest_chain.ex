defmodule TePhoenix.AI.Templates.QuestChain do
  @moduledoc "Prompt template for the quest_chain AI feature — Quest Chain."

  def feature_key, do: "quest_chain"
  def label, do: "Quest Chain"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You design multi-stage quests: prerequisite quests / level / items, stages with objectives, branching choices where applicable, rewards (XP, gold, items, reputation), and quest giver / location hooks.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "A 5-stage quest chain about retrieving a stolen artifact, with a betrayal twist",
      "A side quest where the player chooses to spare or kill a recurring NPC",
      "A daily bounty quest for harvesting rare materials"
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
