defmodule TePhoenixWeb.Social.StaffHandler do
  @moduledoc """
  Staff messenger panel: presence, chat, typing, nudge, color.
  Ported from socket-social.js staff panel section.
  """

  import Phoenix.Channel
  import Phoenix.Socket, only: [assign: 3]

  alias TePhoenix.Repo

  @staff_roles ~w(ADMIN GM MOD STAFF OWNER)

  # Staff panel state in ETS (lazily initialized)
  defp staff_table do
    case :ets.whereis(:staff_panel) do
      :undefined -> :ets.new(:staff_panel, [:named_table, :public, :set]); :staff_panel
      _ -> :staff_panel
    end
  end

  defp get_staff(user_id) do
    case :ets.lookup(staff_table(), user_id) do
      [{_, data}] -> data
      [] -> nil
    end
  end

  defp put_staff(user_id, data), do: :ets.insert(staff_table(), {user_id, data})
  # defp delete_staff(user_id), do: :ets.delete(staff_table(), user_id)

  defp all_staff do
    :ets.foldl(fn {_id, data}, acc -> [data | acc] end, [], staff_table())
  end

  def handle("staff_panel_join", _payload, socket) do
    user_id = socket.assigns.user_id

    case Repo.query("SELECT username, role, chat_color FROM users WHERE id=?", [user_id]) do
      {:ok, %{rows: [[username, role, chat_color]]}} ->
        role_upper = String.upcase(role || "")
        if role_upper not in @staff_roles, do: {:noreply, socket}

        TePhoenixWeb.Endpoint.subscribe("staff:panel")

        put_staff(user_id, %{
          user_id: user_id, username: username, role: role_upper,
          status: "online", away_message: "", chat_color: chat_color,
          joined_at: System.system_time(:millisecond)
        })

        TePhoenixWeb.Endpoint.broadcast!("staff:panel", "staff_sign_on", %{username: username, role: role_upper})
        broadcast_staff_presence()

        _socket = assign(socket, :staff_user_id, user_id)

      _ -> nil
    end

    {:noreply, socket}
  end

  def handle("staff_panel_status", payload, socket) do
    user_id = socket.assigns[:staff_user_id]
    staff = if user_id, do: get_staff(user_id)
    if is_nil(staff), do: {:noreply, socket}

    valid = ~w(online away busy invisible)
    status = if payload["status"] in valid, do: payload["status"], else: "online"
    away_msg = (payload["awayMessage"] || "") |> to_string() |> String.slice(0, 120)

    was_invisible = staff.status == "invisible"
    going_invisible = status == "invisible"

    put_staff(user_id, %{staff | status: status, away_message: away_msg})
    broadcast_staff_presence()

    if going_invisible and not was_invisible do
      TePhoenixWeb.Endpoint.broadcast!("staff:panel", "staff_sign_off", %{username: staff.username, role: staff.role})
    end
    if was_invisible and not going_invisible do
      TePhoenixWeb.Endpoint.broadcast!("staff:panel", "staff_sign_on", %{username: staff.username, role: staff.role})
    end

    {:noreply, socket}
  end

  def handle("staff_set_color", payload, socket) do
    user_id = socket.assigns[:staff_user_id]
    staff = if user_id, do: get_staff(user_id)
    if is_nil(staff), do: {:noreply, socket}
    if staff.role not in ["ADMIN", "OWNER"], do: {:noreply, socket}

    color = payload["color"]
    valid_color = if is_binary(color) and Regex.match?(~r/^#[0-9a-fA-F]{6}$/, color), do: color, else: nil

    put_staff(user_id, %{staff | chat_color: valid_color})
    try do Repo.query!("UPDATE users SET chat_color=? WHERE id=?", [valid_color, user_id])
    rescue _ -> nil end

    broadcast_staff_presence()
    {:noreply, socket}
  end

  def handle("staff_chat_send", payload, socket) do
    user_id = socket.assigns[:staff_user_id]
    staff = if user_id, do: get_staff(user_id)
    if is_nil(staff), do: {:noreply, socket}

    body = (payload["body"] || "") |> to_string() |> String.trim() |> String.slice(0, 500)
    channel = (payload["channel"] || "general") |> to_string() |> String.slice(0, 32)
    if body == "", do: {:noreply, socket}

    # Persist
    try do
      Repo.query!("INSERT INTO staff_messages (sender_id, sender_name, sender_role, channel, body) VALUES (?,?,?,?,?)",
        [user_id, staff.username, staff.role, channel, body])
    rescue _ -> nil end

    msg = %{
      sender_id: user_id, sender_name: staff.username,
      sender_role: staff.role, sender_color: staff.chat_color,
      channel: channel, body: body,
      created_at: DateTime.utc_now() |> DateTime.to_iso8601()
    }

    if String.starts_with?(channel, "dm:") do
      # DM: parse dm:id1:id2 and send only to participants
      parts = String.split(channel, ":")
      id1 = parse_int(Enum.at(parts, 1))
      id2 = parse_int(Enum.at(parts, 2))
      Enum.each(all_staff(), fn s ->
        if s.user_id == id1 or s.user_id == id2 do
          TePhoenixWeb.Endpoint.broadcast!("user:#{get_char_for_user(s.user_id)}", "staff_chat_msg", msg)
        end
      end)
    else
      TePhoenixWeb.Endpoint.broadcast!("staff:panel", "staff_chat_msg", msg)
    end

    {:noreply, socket}
  end

  def handle("staff_chat_history", payload, socket) do
    user_id = socket.assigns[:staff_user_id]
    if is_nil(user_id) or is_nil(get_staff(user_id)), do: {:noreply, socket}

    channel = (payload["channel"] || "general") |> to_string() |> String.slice(0, 32)

    messages = case Repo.query(
      "SELECT sender_id, sender_name, sender_role, channel, body, created_at FROM staff_messages WHERE channel=? ORDER BY created_at DESC LIMIT 50",
      [channel]
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        rows |> Enum.map(fn row -> Enum.zip(cols, row) |> Map.new() end) |> Enum.reverse()
      _ -> []
    end

    push(socket, "staff_chat_history", %{channel: channel, messages: messages})
    {:noreply, socket}
  end

  def handle("staff_typing", payload, socket) do
    user_id = socket.assigns[:staff_user_id]
    staff = if user_id, do: get_staff(user_id)
    if is_nil(staff), do: {:noreply, socket}

    channel = (payload["channel"] || "general") |> to_string()
    typing_payload = %{userId: user_id, username: staff.username, channel: channel}

    if String.starts_with?(channel, "dm:") do
      parts = String.split(channel, ":")
      id1 = parse_int(Enum.at(parts, 1))
      id2 = parse_int(Enum.at(parts, 2))
      Enum.each(all_staff(), fn s ->
        if s.user_id != user_id and (s.user_id == id1 or s.user_id == id2) do
          TePhoenixWeb.Endpoint.broadcast!("user:#{get_char_for_user(s.user_id)}", "staff_typing", typing_payload)
        end
      end)
    else
      TePhoenixWeb.Endpoint.broadcast!("staff:panel", "staff_typing", typing_payload)
    end

    {:noreply, socket}
  end

  def handle("staff_nudge", %{"targetUserId" => target_user_id}, socket) do
    user_id = socket.assigns[:staff_user_id]
    staff = if user_id, do: get_staff(user_id)
    if is_nil(staff), do: {:noreply, socket}

    tid = parse_int(target_user_id)
    target_char = get_char_for_user(tid)
    if target_char do
      TePhoenixWeb.Endpoint.broadcast!("user:#{target_char}", "staff_nudge", %{
        from: staff.username, fromRole: staff.role
      })
    end

    {:noreply, socket}
  end

  def handle(_, _, socket), do: {:noreply, socket}

  # ── Private ─────────────────────────────────────────────────────

  defp broadcast_staff_presence do
    visible = all_staff() |> Enum.filter(fn s -> s.status != "invisible" end)
    TePhoenixWeb.Endpoint.broadcast!("staff:panel", "staff_panel_presence", visible)
  end

  defp get_char_for_user(user_id) do
    case Repo.query("SELECT id FROM characters WHERE user_id=? LIMIT 1", [user_id]) do
      {:ok, %{rows: [[id]]}} -> id
      _ -> nil
    end
  end

  defp parse_int(nil), do: 0
  defp parse_int(val) when is_integer(val), do: val
  defp parse_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp parse_int(_), do: 0
end
