defmodule TePhoenixWeb.Battle.SocialHandler do
  @moduledoc """
  Handles battle chat, emotes, surrender, and chat history.
  Ported from socket-battle.js sections 6b and chat rooms.
  """

  import Phoenix.Channel
  require Logger

  alias TePhoenix.Battle.{State, Manager}
  alias TePhoenix.Repo

  @valid_emotes ~w(taunt respect laugh rage wave)
  @emote_icons %{
    "taunt" => "😤", "respect" => "🫡", "laugh" => "😂",
    "rage" => "🔥", "wave" => "👋"
  }

  # ── Simple Battle Chat ──────────────────────────────────────────

  def handle("battle_chat", %{"battle_id" => battle_id, "text" => text}, socket) do
    char_id = socket.assigns[:char_id]
    char_name = socket.assigns[:char_name] || "Unknown"
    battle_id = to_int(battle_id)

    with true <- State.alive?(battle_id),
         state <- State.get_state(battle_id),
         true <- state.status == :active,
         true <- Map.has_key?(state.combatants, char_id) do

      # Sanitize
      msg = text
        |> to_string()
        |> String.trim()
        |> String.slice(0, 200)
        |> html_escape()

      if msg != "" do
        payload = %{
          from: char_name,
          from_char_id: char_id,
          team_id: get_team_id(state, char_id),
          text: msg,
          ts: System.system_time(:millisecond)
        }

        broadcast!(socket, "battle_chat_msg", payload)
        State.add_log(battle_id, %{actor: char_name, text: "[Chat] #{msg}", type: "chat"})
      end
    end

    {:noreply, socket}
  end

  # ── Battle Emote ────────────────────────────────────────────────

  def handle("battle_emote", %{"battle_id" => battle_id, "emote" => emote}, socket)
      when emote in @valid_emotes do
    char_id = socket.assigns[:char_id]
    char_name = socket.assigns[:char_name] || "Unknown"
    battle_id = to_int(battle_id)

    with true <- State.alive?(battle_id),
         state <- State.get_state(battle_id),
         %{} = combatant <- Map.get(state.combatants, char_id) do

      icon = Map.get(@emote_icons, emote, "❓")

      broadcast!(socket, "battle_emote_show", %{
        from: char_name,
        from_char_id: char_id,
        emote: emote,
        icon: icon,
        grid_x: combatant.grid_x,
        grid_y: combatant.grid_y
      })

      State.add_log(battle_id, %{
        actor: char_name,
        text: "#{icon} #{char_name} #{emote}s!",
        type: "emote"
      })
    end

    {:noreply, socket}
  end

  # ── Surrender ───────────────────────────────────────────────────

  def handle("battle_surrender", %{"battle_id" => battle_id}, socket) do
    char_id = socket.assigns[:char_id]
    char_name = socket.assigns[:char_name] || "Unknown"
    battle_id = to_int(battle_id)

    with true <- State.alive?(battle_id),
         state <- State.get_state(battle_id),
         true <- state.status == :active,
         true <- Map.has_key?(state.combatants, char_id) do

      # PvE: cannot surrender, must flee
      if state.type in [:pve, :party_pve] do
        push(socket, "battle_error", %{reason: "Cannot surrender in PvE — use Flee instead."})
      else
        my_team_id = get_team_id(state, char_id)

        # Kill all members of the surrendering team
        team_members = state.teams[my_team_id] || []
        Enum.each(team_members, fn cid ->
          State.update_combatant(battle_id, cid, fn c ->
            %{c | current_hp: 0, knocked_out: true}
          end)
        end)

        State.add_log(battle_id, %{actor: "system", text: "🏳️ #{char_name}'s team surrenders!"})

        broadcast!(socket, "action_result", %{
          result: %{
            actor: "system",
            actions: [%{type: "surrender", team: my_team_id, name: char_name}],
            log: ["🏳️ #{char_name}'s team surrenders!"]
          }
        })

        # Check win condition and end battle
        check_and_end_battle(battle_id)
      end
    end

    {:noreply, socket}
  end

  # ── Advanced Chat (channels: all/team/dm/referee) ───────────────

  def handle("battle_chat_send", payload, socket) do
    char_id = socket.assigns[:char_id]
    char_name = socket.assigns[:char_name] || "Unknown"

    battle_id = Map.get(payload, "battle_id")
    body = Map.get(payload, "body", "") |> to_string() |> String.trim()
    channel = Map.get(payload, "channel", "all")
    target_id = Map.get(payload, "target_id")
    as_referee = Map.get(payload, "as_referee", false)

    if body == "" or is_nil(battle_id) do
      {:noreply, socket}
    else
      sender_role = if as_referee, do: "referee", else: "player"

      msg = %{
        battle_id: battle_id,
        sender_id: char_id,
        sender_name: char_name,
        sender_role: sender_role,
        channel: channel,
        target_id: target_id,
        body: body,
        created_at: DateTime.utc_now() |> DateTime.to_iso8601()
      }

      # Persist to DB
      try do
        Repo.query!(
          "INSERT INTO game_battle_chat (battle_id, sender_id, sender_name, sender_role, channel, target_id, body, created_at) VALUES (?,?,?,?,?,?,?,NOW())",
          [battle_id, char_id, char_name, sender_role, channel, target_id, body]
        )
      rescue
        _ -> nil
      end

      # Route based on channel
      case channel do
        "dm" when not is_nil(target_id) ->
          # DM: only to target + echo to sender
          TePhoenixWeb.Endpoint.broadcast!("user:#{target_id}", "battle_chat_msg", msg)
          push(socket, "battle_chat_msg", msg)

        "team" ->
          # Team chat: broadcast to battle topic, clients filter by team
          broadcast!(socket, "battle_chat_msg", msg)

        "referee" ->
          # Referee channel
          TePhoenixWeb.Endpoint.broadcast!("battle_ref:#{battle_id}", "battle_chat_msg", msg)
          push(socket, "battle_chat_msg", msg)

        _ ->
          # All: broadcast to everyone in battle
          broadcast!(socket, "battle_chat_msg", msg)
      end

      {:noreply, socket}
    end
  end

  # ── Chat History ────────────────────────────────────────────────

  def handle("battle_chat_history", %{"battle_id" => battle_id}, socket) do
    case Repo.query(
      "SELECT battle_id, sender_id, sender_name, sender_role, channel, target_id, body, created_at FROM game_battle_chat WHERE battle_id=? ORDER BY created_at DESC LIMIT 50",
      [battle_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        messages = Enum.map(rows, fn row ->
          Enum.zip(cols, row) |> Map.new()
        end) |> Enum.reverse()

        push(socket, "battle_chat_history", %{battle_id: battle_id, messages: messages})

      _ ->
        push(socket, "battle_chat_history", %{battle_id: battle_id, messages: []})
    end

    {:noreply, socket}
  end

  # ══════════════════════════════════════════════════════════════════
  # PRIVATE
  # ══════════════════════════════════════════════════════════════════

  defp get_team_id(state, char_id) do
    Enum.find_value(state.teams, nil, fn {team_id, members} ->
      if char_id in members, do: team_id
    end)
  end

  defp check_and_end_battle(battle_id) do
    state = State.get_state(battle_id)

    # Find teams with living members
    living_teams = state.teams
      |> Enum.filter(fn {_tid, members} ->
        Enum.any?(members, fn cid ->
          c = Map.get(state.combatants, cid)
          c && c.current_hp > 0
        end)
      end)
      |> Enum.map(fn {tid, _} -> tid end)

    if length(living_teams) <= 1 do
      winner = List.first(living_teams)
      Manager.end_battle(battle_id, winner)
    end
  end

  defp html_escape(str) do
    str
    |> String.replace("&", "&amp;")
    |> String.replace("<", "&lt;")
    |> String.replace(">", "&gt;")
    |> String.replace("\"", "&quot;")
  end

  defp to_int(val) when is_integer(val), do: val
  defp to_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp to_int(_), do: 0
end
