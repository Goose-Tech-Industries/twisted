defmodule TePhoenix.EventRunner do
  @moduledoc """
  Event action executor — the "game cartridge player".
  Ported from te/event_runner.js executeActions().

  Runs DB-driven action lists: dialogue, flags, items, XP, teleport, battles, quests.
  Used by post-battle hooks, map triggers, NPC interactions, quest events.

  Supports CHOICE halting: when a CHOICE action is reached, execution pauses
  and returns {:halted, responses, pending_state} so the caller can send
  choices to the client. When the client responds, call resume/4.
  """

  require Logger
  alias TePhoenix.Repo

  @doc """
  Execute a list of actions for a character.
  Returns:
    {:ok, responses} — all actions completed
    {:halted, responses, pending} — stopped at a CHOICE, client must pick
  """
  def execute(actions, char_id, char_state \\ %{}) when is_list(actions) do
    run_actions(actions, char_id, char_state, [])
  end

  @doc """
  Resume execution after a CHOICE was made.
  `chosen_index` is the option the client picked.
  `pending` is the pending state returned from the halted execute.
  """
  def resume(pending, chosen_index, char_id, char_state) do
    options = pending[:options] || []
    chosen = Enum.at(options, chosen_index)

    if chosen do
      nested_actions = chosen["actions"] || []
      remaining = pending[:remaining_actions] || []
      all_actions = nested_actions ++ remaining

      run_actions(all_actions, char_id, char_state, pending[:responses] || [])
    else
      {:ok, pending[:responses] || []}
    end
  end

  defp run_actions(actions, char_id, char_state, accumulated_responses) do
    result = Enum.reduce_while(actions, {accumulated_responses, char_state, actions}, fn action, {resps, st, remaining} ->
      case execute_action(action, char_id, st) do
        {:halt_choice, new_resps, choice_data} ->
          # Find index of current action to get remaining
          idx = Enum.find_index(remaining, fn a -> a == action end) || 0
          after_choice = Enum.drop(remaining, idx + 1)

          {:halt, {:halted, resps ++ new_resps, %{
            options: choice_data.options,
            remaining_actions: after_choice,
            responses: resps ++ new_resps,
            char_state: st
          }}}

        {new_resps, new_st} ->
          {:cont, {resps ++ new_resps, new_st, remaining}}
      end
    end)

    case result do
      {:halted, responses, pending} ->
        {:halted, responses, pending}

      {responses, state, _remaining} ->
        # Persist updated state flags back to DB
        if state != char_state do
          TePhoenix.Game.CharacterState.merge(char_id, state)
        end

        {:ok, responses}
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # ACTION HANDLERS
  # ══════════════════════════════════════════════════════════════════

  defp execute_action(%{"type" => "DIALOGUE"} = action, _char_id, state) do
    text = resolve_template(action["text"] || "", state)
    resp = %{
      cmd: "dialogue",
      speaker: action["speaker"] || "NPC",
      text: text,
      portrait: action["portrait"]
    }
    {[resp], state}
  end

  defp execute_action(%{"type" => "CHOICE"} = action, _char_id, _state) do
    options = action["options"] || []

    client_options = options
      |> Enum.with_index()
      |> Enum.map(fn {opt, i} -> %{id: i, label: opt["label"] || "Option #{i + 1}"} end)

    resp = %{
      cmd: "choice",
      prompt: action["prompt"] || "",
      options: client_options
    }

    # Halt execution — return special tuple
    {:halt_choice, [resp], %{options: options}}
  end

  defp execute_action(%{"type" => "SET_FLAG"} = action, _char_id, state) do
    key = action["key"]
    value = action["value"]
    {[], Map.put(state, key, value)}
  end

  defp execute_action(%{"type" => "INC_FLAG"} = action, _char_id, state) do
    key = action["key"]
    amount = action["amount"] || 1
    current = Map.get(state, key, 0)
    new_val = if is_number(current), do: current + amount, else: amount
    {[], Map.put(state, key, new_val)}
  end

  defp execute_action(%{"type" => "SET_WORLD_FLAG"} = action, _char_id, state) do
    try do
      Repo.query!(
        "INSERT INTO world_flags (flag_key, flag_value) VALUES (?,?) ON DUPLICATE KEY UPDATE flag_value=VALUES(flag_value)",
        [action["key"], to_string(action["value"])]
      )
    rescue
      _ -> nil
    end
    {[], state}
  end

  defp execute_action(%{"type" => "GIVE_ITEM"} = action, char_id, state) do
    item_id = action["item_id"]
    qty = action["quantity"] || 1

    try do
      Repo.query!(
        "INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+?",
        [char_id, item_id, qty, qty]
      )
    rescue
      _ -> nil
    end

    # Look up item name for display
    item_name = case Repo.query("SELECT name FROM game_items WHERE id=?", [item_id]) do
      {:ok, %{rows: [[name]]}} -> name
      _ -> "item"
    end

    resp = %{cmd: "notification", text: "Received #{qty}x #{item_name}!", type: "item", item_id: item_id, quantity: qty}
    {[resp], state}
  end

  defp execute_action(%{"type" => "TAKE_ITEM"} = action, char_id, state) do
    try do
      Repo.query!(
        "UPDATE character_items SET quantity=quantity-? WHERE character_id=? AND item_id=? AND quantity>=?",
        [action["quantity"] || 1, char_id, action["item_id"], action["quantity"] || 1]
      )
    rescue
      _ -> nil
    end
    {[], state}
  end

  defp execute_action(%{"type" => "GIVE_GOLD"} = action, char_id, state) do
    amount = action["amount"] || 0

    try do
      case Repo.query("SELECT user_id FROM characters WHERE id=?", [char_id]) do
        {:ok, %{rows: [[user_id]]}} ->
          Repo.query!("UPDATE users SET currency=currency+? WHERE id=?", [amount, user_id])
        _ -> nil
      end
    rescue
      _ -> nil
    end

    {[%{cmd: "notification", text: "Received #{amount} gold!", type: "gold", amount: amount}], state}
  end

  defp execute_action(%{"type" => "GIVE_XP"} = action, char_id, state) do
    amount = action["amount"] || 0

    try do
      Repo.query!("UPDATE characters SET experience=experience+? WHERE id=?", [amount, char_id])
    rescue
      _ -> nil
    end

    {[%{cmd: "notification", text: "Gained #{amount} XP!", type: "xp", amount: amount}], state}
  end

  defp execute_action(%{"type" => "HEAL"} = action, char_id, state) do
    amount = action["amount"] || 9999

    try do
      Repo.query!(
        "UPDATE characters SET current_hp=LEAST(max_hp, current_hp+?), current_mp=LEAST(max_mp, current_mp+?) WHERE id=?",
        [amount, amount, char_id]
      )
    rescue
      _ -> nil
    end

    {[%{cmd: "notification", text: "Healed!", type: "heal"}], state}
  end

  defp execute_action(%{"type" => "DAMAGE"} = action, char_id, state) do
    amount = action["amount"] || 0

    try do
      Repo.query!(
        "UPDATE characters SET current_hp=GREATEST(0, current_hp-?) WHERE id=?",
        [amount, char_id]
      )
    rescue
      _ -> nil
    end

    {[%{cmd: "notification", text: "Took #{amount} damage!", type: "damage"}], state}
  end

  defp execute_action(%{"type" => "TELEPORT"} = action, char_id, state) do
    map_id = action["map_id"]
    x = action["x"] || 0
    y = action["y"] || 0

    try do
      Repo.query!("UPDATE characters SET map_id=?, x=?, y=? WHERE id=?", [map_id, x, y, char_id])
    rescue
      _ -> nil
    end

    {[%{cmd: "teleport", map_id: map_id, x: x, y: y}], state}
  end

  defp execute_action(%{"type" => "BATTLE"} = action, _char_id, state) do
    enemy_npc_id = action["enemy_npc_id"] || action["npc_id"]

    resp = %{
      cmd: "start_battle",
      enemy_npc_id: enemy_npc_id,
      on_win: action["on_win"],
      on_lose: action["on_lose"]
    }
    {[resp], state}
  end

  defp execute_action(%{"type" => "QUEST_START"} = action, _char_id, state) do
    quest_id = to_string(action["quest_id"])
    objectives = action["objectives"] || %{}

    quests = Map.get(state, "quests", %{})
    active = Map.get(quests, "active", %{})
    active = Map.put(active, quest_id, %{
      "objectives" => objectives,
      "is_ready_to_turn_in" => false,
      "started_at" => DateTime.utc_now() |> DateTime.to_iso8601()
    })
    quests = Map.put(quests, "active", active)
    state = Map.put(state, "quests", quests)

    {[%{cmd: "quest_started", quest_id: quest_id}], state}
  end

  defp execute_action(%{"type" => "QUEST_ADVANCE"} = action, _char_id, state) do
    quest_id = to_string(action["quest_id"])
    obj_key = action["objective_key"]

    quests = get_in(state, ["quests", "active"]) || %{}
    quest = Map.get(quests, quest_id)

    if quest && obj_key do
      objectives = quest["objectives"] || %{}
      obj = Map.get(objectives, obj_key, %{})
      required = obj["required"] || obj["target"] || 1
      current = min((obj["current"] || 0) + 1, required)
      complete = current >= required

      obj = obj |> Map.put("current", current) |> Map.put("complete", complete)
      objectives = Map.put(objectives, obj_key, obj)

      all_done = Enum.all?(objectives, fn {_, o} -> o["complete"] end)
      quest = quest
        |> Map.put("objectives", objectives)
        |> Map.put("is_ready_to_turn_in", all_done)

      state = put_in(state, ["quests", "active", quest_id], quest)
      {[%{cmd: "quest_progress", quest_id: quest_id}], state}
    else
      {[], state}
    end
  end

  defp execute_action(%{"type" => "QUEST_COMPLETE"} = action, _char_id, state) do
    quest_id = to_string(action["quest_id"])
    quests = get_in(state, ["quests", "active"]) || %{}
    quest = Map.get(quests, quest_id)

    if quest do
      active = Map.delete(quests, quest_id)
      completed = get_in(state, ["quests", "completed"]) || %{}
      completed = Map.put(completed, quest_id, Map.put(quest, "completed_at", DateTime.utc_now() |> DateTime.to_iso8601()))

      state = state
        |> put_in(["quests", "active"], active)
        |> put_in(["quests", "completed"], completed)

      {[%{cmd: "quest_complete", quest_id: quest_id}], state}
    else
      {[], state}
    end
  end

  defp execute_action(%{"type" => "OFFER_QUEST"} = action, _char_id, state) do
    {[%{cmd: "offer_quest", quest_id: action["quest_id"], npc_name: action["npc_name"]}], state}
  end

  defp execute_action(%{"type" => "SHOP"} = action, _char_id, state) do
    {[%{cmd: "open_shop", shopId: action["shop_id"]}], state}
  end

  defp execute_action(%{"type" => "QUEST_BOARD"}, _char_id, state) do
    {[%{cmd: "open_quest_board"}], state}
  end

  defp execute_action(%{"type" => "NPC_TALK"} = action, _char_id, state) do
    {[%{cmd: "npc_talk", npc_id: action["npc_id"]}], state}
  end

  defp execute_action(%{"type" => "SOUND"} = action, _char_id, state) do
    {[%{cmd: "sound", sound: action["sound"], volume: action["volume"] || 1.0}], state}
  end

  defp execute_action(%{"type" => "SCREEN_EFFECT"} = action, _char_id, state) do
    {[%{cmd: "screen_effect", effect: action["effect"], duration: action["duration"] || 1000}], state}
  end

  defp execute_action(%{"type" => "WAIT"} = action, _char_id, state) do
    {[%{cmd: "wait", ms: action["ms"] || 1000}], state}
  end

  defp execute_action(%{"type" => "SET_NPC_MOOD"} = action, _char_id, state) do
    # Broadcast mood change to any NPC system listening
    TePhoenixWeb.Endpoint.broadcast("npc_state", "mood_change", %{
      npc_name: action["npcName"],
      mood: action["mood"]
    })
    {[], state}
  end

  defp execute_action(%{"type" => "KILL_NPC"} = action, _char_id, state) do
    try do
      Repo.query!("UPDATE game_npcs SET is_dead=1, death_cause=? WHERE name=?",
        [action["cause"] || "Unknown", action["npcName"]])
    rescue
      _ -> nil
    end
    {[], state}
  end

  defp execute_action(%{"type" => "DESCENT"} = action, char_id, state) do
    # Teleport to a deeper floor
    execute_action(Map.put(action, "type", "TELEPORT"), char_id, state)
  end

  defp execute_action(%{"type" => "ASCENT"} = action, char_id, state) do
    execute_action(Map.put(action, "type", "TELEPORT"), char_id, state)
  end

  defp execute_action(%{"type" => "IF"} = action, char_id, state) do
    conditions = action["conditions"] || []
    met = Enum.all?(conditions, fn cond_map -> check_condition(cond_map, char_id, state) end)

    branch = if met, do: action["then"] || [], else: action["else"] || []

    if is_list(branch) and branch != [] do
      Enum.reduce(branch, {[], state}, fn act, {r, s} ->
        case execute_action(act, char_id, s) do
          {:halt_choice, _, _} = halt -> halt  # propagate halt
          {new_r, new_s} -> {r ++ new_r, new_s}
        end
      end)
    else
      {[], state}
    end
  end

  # Catch-all for unrecognized action types
  defp execute_action(%{"type" => type}, _char_id, state) do
    Logger.warning("EventRunner: unrecognized action type '#{type}'")
    {[], state}
  end

  defp execute_action(_, _char_id, state), do: {[], state}

  # ══════════════════════════════════════════════════════════════════
  # CONDITIONS
  # ══════════════════════════════════════════════════════════════════

  defp check_condition(%{"type" => "FLAG", "key" => key, "op" => op, "value" => expected}, _char_id, state) do
    actual = Map.get(state, key)
    compare(op, actual, expected)
  end

  defp check_condition(%{"type" => "LEVEL", "op" => op, "value" => expected}, char_id, _state) do
    actual = case Repo.query("SELECT level FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[lvl]]}} -> lvl || 1
      _ -> 1
    end
    compare(op, actual, expected)
  end

  defp check_condition(%{"type" => "HAS_ITEM", "item_id" => item_id} = cond_map, char_id, _state) do
    required_qty = cond_map["quantity"] || 1
    case Repo.query(
      "SELECT quantity FROM character_items WHERE character_id=? AND item_id=?",
      [char_id, item_id]
    ) do
      {:ok, %{rows: [[qty]]}} when qty >= required_qty -> true
      _ -> false
    end
  end

  defp check_condition(%{"type" => "QUEST_STEP", "quest_id" => quest_id, "step" => step}, _char_id, state) do
    quest = get_in(state, ["quests", "active", to_string(quest_id)])
    if quest do
      obj = get_in(quest, ["objectives", step])
      obj && obj["complete"]
    else
      false
    end
  end

  defp check_condition(%{"type" => "CLASS", "class_id" => class_id}, char_id, _state) do
    case Repo.query("SELECT class_id FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[cid]]}} -> cid == class_id
      _ -> false
    end
  end

  defp check_condition(%{"type" => "RANDOM", "chance" => chance}, _char_id, _state) do
    :rand.uniform(100) <= (chance || 50)
  end

  defp check_condition(_, _char_id, _state), do: true

  defp compare("==", actual, expected), do: actual == expected
  defp compare("!=", actual, expected), do: actual != expected
  defp compare(">", actual, expected) when is_number(actual) and is_number(expected), do: actual > expected
  defp compare("<", actual, expected) when is_number(actual) and is_number(expected), do: actual < expected
  defp compare(">=", actual, expected) when is_number(actual) and is_number(expected), do: actual >= expected
  defp compare("<=", actual, expected) when is_number(actual) and is_number(expected), do: actual <= expected
  defp compare(_, _, _), do: true

  # ══════════════════════════════════════════════════════════════════
  # HELPERS
  # ══════════════════════════════════════════════════════════════════

  defp resolve_template(text, state) when is_binary(text) do
    Regex.replace(~r/\{\{(\w+)\}\}/, text, fn _, key ->
      to_string(Map.get(state, key, ""))
    end)
  end
  defp resolve_template(text, _state), do: to_string(text || "")
end
