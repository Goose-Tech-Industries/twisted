defmodule TePhoenixWeb.PartyChannel do
  @moduledoc """
  Per-character party fan-out topic.

  The server broadcasts to `party:<char_id>` when a member of the
  recipient's party sends a message (or any party-scoped event fires).
  The client subscribes to its own `party:<own_char_id>` so it receives
  party chat, position updates, and party-state pushes.

  No `handle_in/3` callbacks are needed yet — outgoing party actions
  (invite/kick/leave) live on `social:lobby` via the existing
  GuildTradePartyHandler. This module exists purely so the topic can
  be subscribed to.
  """

  use TePhoenixWeb, :channel
  alias TePhoenix.Repo

  @impl true
  def join("party:" <> char_id_str, _params, socket) do
    user_id = socket.assigns[:user_id]

    case Integer.parse(char_id_str) do
      {char_id, ""} ->
        # Authorize: the subscriber must own the character whose party
        # topic they're joining. Prevents one player from listening on
        # another player's party chat.
        case Repo.query("SELECT id FROM characters WHERE id = ? AND user_id = ?", [char_id, user_id]) do
          {:ok, %{rows: [_]}} ->
            {:ok, %{char_id: char_id}, assign(socket, :party_char_id, char_id)}

          _ ->
            {:error, %{reason: "unauthorized"}}
        end

      _ ->
        {:error, %{reason: "invalid_topic"}}
    end
  end

  # Catch-all for sub-topic shapes we don't recognize.
  def join(_topic, _params, _socket), do: {:error, %{reason: "invalid_topic"}}
end
