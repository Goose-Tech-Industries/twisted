defmodule TePhoenixWeb.QuestController do
  use TePhoenixWeb, :controller
  alias TePhoenix.Repo
  alias TePhoenix.Game.Quests

  def list_quests(conn, _params) do
    quests = query_rows("SELECT id, name, description, level_req, reward_xp, reward_gold, is_repeatable FROM game_quests WHERE is_active=1 ORDER BY level_req, name")
    json(conn, %{success: true, quests: quests})
  end

  def get_quest(conn, %{"id" => id}) do
    case Repo.query("SELECT * FROM game_quests WHERE id=?", [id]) do
      {:ok, %{rows: [row], columns: cols}} ->
        quest = Enum.zip(cols, row) |> Map.new()
        json(conn, %{success: true, quest: quest})
      _ -> json(conn, %{success: false, message: "Quest not found."})
    end
  end

  def update_progress(conn, %{"charId" => char_id, "questId" => quest_id, "objectiveKey" => obj_key}) do
    user_id = conn.assigns.user_id

    # Verify ownership
    case Repo.query("SELECT id FROM characters WHERE id=? AND user_id=?", [char_id, user_id]) do
      {:ok, %{rows: [_]}} ->
        # Load state and update objective
        case Repo.query("SELECT state_json FROM characters WHERE id=?", [char_id]) do
          {:ok, %{rows: [[json]]}} ->
            state = parse_json(json, %{})
            quest = get_in(state, ["quests", "active", to_string(quest_id)])

            if quest do
              objectives = quest["objectives"] || %{}
              obj = Map.get(objectives, obj_key, %{})

              # Server-authoritative: KILL objectives rejected (only server can advance those)
              if String.upcase(to_string(obj["type"] || "")) == "KILL" do
                json(conn, %{success: false, message: "Kill objectives are server-tracked only."})
              else
                required = obj["required"] || obj["target"] || 1
                current = min((obj["current"] || 0) + 1, required)
                complete = current >= required

                obj = obj |> Map.put("current", current) |> Map.put("complete", complete)
                objectives = Map.put(objectives, obj_key, obj)

                all_done = Enum.all?(objectives, fn {_, o} -> o["complete"] end)
                quest = quest |> Map.put("objectives", objectives) |> Map.put("is_ready_to_turn_in", all_done)

                new_state = put_in(state, ["quests", "active", to_string(quest_id)], quest)
                Repo.query!("UPDATE characters SET state_json=? WHERE id=?", [Jason.encode!(new_state), char_id])

                json(conn, %{success: true, quest: quest})
              end
            else
              json(conn, %{success: false, message: "Quest not active."})
            end

          _ -> json(conn, %{success: false, message: "Character not found."})
        end

      _ -> json(conn, %{success: false, message: "Unauthorized."})
    end
  end

  def complete_quest(conn, %{"charId" => char_id, "questId" => quest_id}) do
    user_id = conn.assigns.user_id

    case Repo.query("SELECT id FROM characters WHERE id=? AND user_id=?", [char_id, user_id]) do
      {:ok, %{rows: [_]}} ->
        case Repo.query("SELECT state_json FROM characters WHERE id=?", [char_id]) do
          {:ok, %{rows: [[json]]}} ->
            state = parse_json(json, %{})
            qkey = to_string(quest_id)
            quest = get_in(state, ["quests", "active", qkey])

            if quest && quest["is_ready_to_turn_in"] do
              # Move to completed
              active = Map.delete(get_in(state, ["quests", "active"]) || %{}, qkey)
              completed = get_in(state, ["quests", "completed"]) || %{}
              completed = Map.put(completed, qkey, Map.put(quest, "completed_at", DateTime.utc_now() |> DateTime.to_iso8601()))

              new_state = state |> put_in(["quests", "active"], active) |> put_in(["quests", "completed"], completed)

              # Award rewards
              case Repo.query("SELECT reward_xp, reward_gold FROM game_quests WHERE id=?", [quest_id]) do
                {:ok, %{rows: [[xp, gold]]}} ->
                  if xp && xp > 0, do: Repo.query("UPDATE characters SET experience=experience+? WHERE id=?", [xp, char_id])
                  if gold && gold > 0, do: Repo.query("UPDATE users SET currency=currency+? WHERE id=?", [gold, user_id])
                _ -> nil
              end

              Repo.query!("UPDATE characters SET state_json=? WHERE id=?", [Jason.encode!(new_state), char_id])
              json(conn, %{success: true, message: "Quest complete!"})
            else
              json(conn, %{success: false, message: "Quest not ready to turn in."})
            end

          _ -> json(conn, %{success: false})
        end
      _ -> json(conn, %{success: false, message: "Unauthorized."})
    end
  end

  def get_questboard(conn, _params) do
    quests = query_rows(
      "SELECT q.id, q.name, q.description, q.level_req, q.reward_xp, q.reward_gold, q.is_repeatable, q.quest_type FROM game_quests q WHERE q.is_active=1 AND q.show_on_board=1 ORDER BY q.level_req"
    )
    json(conn, %{success: true, quests: quests})
  end

  # ── v2 endpoints — TePhoenix.Game.Quests backed ──────────────
  # These hit the newer game_quest_defs + game_quest_progress shape and
  # use the runtime module's prereq + reward distribution. Active beside
  # the legacy actions above; SvelteKit can migrate panels gradually.

  def v2_active(conn, %{"char_id" => char_id}) do
    case verify_char_ownership(conn, char_id) do
      {:ok, cid} -> json(conn, %{success: true, quests: Quests.list_active(cid)})
      :unauthorized -> json(conn, %{success: false, message: "Unauthorized."})
    end
  end

  def v2_active(conn, _), do: json(conn, %{success: false, message: "char_id required"})

  def v2_completed(conn, %{"char_id" => char_id}) do
    case verify_char_ownership(conn, char_id) do
      {:ok, cid} -> json(conn, %{success: true, quests: Quests.list_completed(cid)})
      :unauthorized -> json(conn, %{success: false, message: "Unauthorized."})
    end
  end

  def v2_completed(conn, _), do: json(conn, %{success: false, message: "char_id required"})

  def v2_start(conn, %{"def_id" => def_id, "char_id" => char_id}) do
    case verify_char_ownership(conn, char_id) do
      {:ok, cid} ->
        case Quests.start(cid, to_int(def_id)) do
          {:ok, progress} -> json(conn, %{success: true, progress: progress})
          {:error, reason} -> json(conn, %{success: false, message: to_string(reason)})
        end

      :unauthorized ->
        json(conn, %{success: false, message: "Unauthorized."})
    end
  end

  def v2_start(conn, _), do: json(conn, %{success: false, message: "char_id + def_id required"})

  def v2_advance(conn, %{"def_id" => def_id, "char_id" => char_id} = params) do
    delta = to_int(Map.get(params, "delta", 1))

    case verify_char_ownership(conn, char_id) do
      {:ok, cid} ->
        case Quests.advance(cid, to_int(def_id), nil, max(delta, 1)) do
          {:ok, progress} -> json(conn, %{success: true, progress: progress})
          {:error, reason} -> json(conn, %{success: false, message: to_string(reason)})
        end

      :unauthorized ->
        json(conn, %{success: false, message: "Unauthorized."})
    end
  end

  def v2_advance(conn, _), do: json(conn, %{success: false, message: "char_id + def_id required"})

  def v2_complete(conn, %{"def_id" => def_id, "char_id" => char_id}) do
    case verify_char_ownership(conn, char_id) do
      {:ok, cid} ->
        case Quests.complete(cid, to_int(def_id)) do
          {:ok, progress} -> json(conn, %{success: true, progress: progress})
          {:error, reason} -> json(conn, %{success: false, message: to_string(reason)})
        end

      :unauthorized ->
        json(conn, %{success: false, message: "Unauthorized."})
    end
  end

  def v2_complete(conn, _), do: json(conn, %{success: false, message: "char_id + def_id required"})

  defp verify_char_ownership(conn, char_id) do
    user_id = conn.assigns[:user_id]
    cid = to_int(char_id)

    case Repo.query("SELECT id FROM characters WHERE id = ? AND user_id = ?", [cid, user_id]) do
      {:ok, %{rows: [[_]]}} -> {:ok, cid}
      _ -> :unauthorized
    end
  end

  defp to_int(n) when is_integer(n), do: n
  defp to_int(s) when is_binary(s) do
    case Integer.parse(s) do
      {i, _} -> i
      _ -> 0
    end
  end
  defp to_int(_), do: 0

  defp query_rows(sql, params \\ []) do
    case Repo.query(sql, params) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
  end

  defp parse_json(nil, d), do: d
  defp parse_json("", d), do: d
  defp parse_json(v, d) when is_binary(v) do
    case Jason.decode(v) do {:ok, p} -> p; _ -> d end
  end
  defp parse_json(v, _) when is_map(v) or is_list(v), do: v
  defp parse_json(_, d), do: d
end
