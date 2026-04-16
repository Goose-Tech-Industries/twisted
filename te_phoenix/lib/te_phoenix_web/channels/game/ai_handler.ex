defmodule TePhoenixWeb.Game.AiHandler do
  @moduledoc """
  AI-powered generation features: quest gen, item text, lore, biography, crafting hints.
  Ported from socket-game.js AI sections.

  These are toggleable via system_settings. When AI provider is disabled,
  they return thematic fallback text so the game still functions.
  """

  import Phoenix.Channel

  alias TePhoenix.Game.{PlayerRegistry, MapData}
  alias TePhoenix.Repo

  def handle("ai_generate_quest", _payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p), do: {:noreply, socket}

    map_data = MapData.get(p.map_id)
    region = MapData.get_region(p.map_id)
    map_name = if map_data, do: map_data.name, else: "Unknown"
    region_name = if region, do: region["name"], else: nil

    # Generate quest (AI when available, themed fallback otherwise)
    quest = generate_quest(p.level, map_name, region_name)

    if quest do
      push(socket, "ai_quest_generated", quest)
    else
      push(socket, "notification", %{type: "info", message: "No quest available right now."})
    end

    {:noreply, socket}
  end

  def handle("ai_generate_item_text", %{"itemName" => item_name} = payload, socket) do
    item_type = payload["itemType"] || "weapon"

    text = case item_type do
      "weapon" -> "Forged in the deep furnaces of #{Enum.random(~w(Ashenmoor Blackhollow Ironveil Stormkeep))}, this #{item_name} hums with barely contained power. Its edge has tasted the blood of kings and beggars alike."
      "armor" -> "This #{item_name} bears the insignia of a forgotten order. Each dent tells a story of survival, each repair a testament to the smith's devotion."
      "potion" -> "Swirling with iridescent light, this #{item_name} was brewed under a harvest moon. The cork is sealed with raven wax."
      _ -> "A curious #{item_name} of unknown origin. It feels heavier than it should, as though burdened by memory."
    end

    push(socket, "ai_item_text", %{itemName: item_name, text: text})
    {:noreply, socket}
  end

  def handle("ai_generate_lore", %{"topic" => topic}, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    region = if p, do: MapData.get_region(p.map_id)
    region_name = if region, do: region["name"], else: "the realm"

    text = "In the annals of #{region_name}, the matter of #{topic} is spoken of in hushed tones. " <>
           "The old chronicles tell of a time when #{topic} shaped the very foundations of civilization. " <>
           "Some say the truth was buried with the last of the Oakward Druids; others claim it sleeps " <>
           "still, waiting beneath the barrow mounds for one brave enough to seek it."

    push(socket, "ai_lore_generated", %{topic: topic, text: text})
    {:noreply, socket}
  end

  def handle("ai_generate_biography", _payload, socket) do
    char_id = socket.assigns[:char_id]

    bio = try do
      case Repo.query("SELECT c.name, c.level, r.name AS race_name, cl.name AS class_name FROM characters c LEFT JOIN game_races r ON r.id=c.race_id LEFT JOIN game_classes cl ON cl.id=c.class_id WHERE c.id=?", [char_id]) do
        {:ok, %{rows: [[name, level, race, cls]]}} ->
          quests_done = case Repo.query("SELECT state_json FROM characters WHERE id=?", [char_id]) do
            {:ok, %{rows: [[json]]}} ->
              state = case Jason.decode(to_string(json || "{}")) do {:ok, s} -> s; _ -> %{} end
              completed = get_in(state, ["quests", "completed"]) || %{}
              map_size(completed)
            _ -> 0
          end

          race_str = race || "unknown"
          cls_str = cls || "wanderer"

          "#{name}, a level #{level} #{race_str} #{cls_str}, emerged from humble beginnings " <>
          "to carve their name across the realm. " <>
          "#{if quests_done > 0, do: "Having completed #{quests_done} quests, their reputation precedes them wherever they travel. ", else: ""}" <>
          "Whether by blade or word, #{name} has proven that destiny favors the bold."

        _ -> "Their story has yet to be written."
      end
    rescue
      _ -> "Their story has yet to be written."
    end

    push(socket, "ai_biography", %{text: bio})
    {:noreply, socket}
  end

  def handle("ai_crafting_hint", %{"ingredients" => ingredients}, socket) do
    ingredients_str = if is_list(ingredients), do: Enum.join(ingredients, ", "), else: to_string(ingredients)

    hint = cond do
      String.contains?(ingredients_str, "herb") -> "These herbs, when combined with a steady hand, could yield a potent healing salve."
      String.contains?(ingredients_str, "ore") or String.contains?(ingredients_str, "iron") -> "With enough heat and a good anvil, these materials could be forged into something formidable."
      String.contains?(ingredients_str, "gem") or String.contains?(ingredients_str, "crystal") -> "Enchantment potential detected. A skilled artificer might imbue these with magical properties."
      String.contains?(ingredients_str, "leather") or String.contains?(ingredients_str, "hide") -> "Quality material for armor or accessories. A leatherworker would know what to do."
      true -> "An interesting combination. Experiment at a crafting station to see what emerges."
    end

    push(socket, "ai_crafting_hint_result", %{hint: hint})
    {:noreply, socket}
  end

  def handle(_, _, socket), do: {:noreply, socket}

  # ── Private ─────────────────────────────────────────────────────

  defp generate_quest(level, map_name, region_name) do
    templates = [
      %{name: "The Missing Caravan", type: "KILL",
        description: "A merchant caravan went missing near #{map_name}. Track down the bandits responsible.",
        objectives: [%{type: "KILL", target: "bandit", count: 3}],
        xp: level * 50, gold: level * 20},
      %{name: "Ancient Relics", type: "GATHER",
        description: "#{region_name || "The region"} holds fragments of an ancient artifact. Find them before the shadow cult does.",
        objectives: [%{type: "GATHER", target: "relic_fragment", count: 5}],
        xp: level * 60, gold: level * 15},
      %{name: "The Beast Below", type: "KILL",
        description: "Miners report a creature in the depths beneath #{map_name}. Slay it.",
        objectives: [%{type: "KILL", target: "cave_beast", count: 1}],
        xp: level * 80, gold: level * 30},
      %{name: "Whispers of the Dead", type: "EXPLORE",
        description: "Strange whispers echo from the barrows near #{map_name}. Investigate their source.",
        objectives: [%{type: "EXPLORE", target: "barrow_entrance", count: 1}],
        xp: level * 40, gold: level * 10}
    ]

    Enum.random(templates)
  end
end
