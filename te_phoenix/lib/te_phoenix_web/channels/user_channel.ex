defmodule TePhoenixWeb.UserChannel do
  @moduledoc """
  Per-user notification channel.
  Topic format: "user:{char_id}"

  Handles PubSub notifications that target specific players:
  - Duel requests / accepted / declined / expired
  - Battle invitations (battle_start_join)
  - Battle results (win/loss/XP/gold)
  - Negotiation requests
  - Quest progress updates

  The Next.js frontend joins this channel on login using the character's ID.
  All handler modules broadcast to "user:<char_id>" via Endpoint.broadcast!/3,
  and this channel delivers those messages to the connected client.
  """

  use Phoenix.Channel
  require Logger

  alias TePhoenix.Repo

  @impl true
  def join("user:" <> char_id_str, _params, socket) do
    char_id = parse_int(char_id_str)
    user_id = socket.assigns.user_id

    # Verify this user owns this character
    case Repo.query("SELECT id FROM characters WHERE id=? AND user_id=?", [char_id, user_id]) do
      {:ok, %{rows: [[_id]]}} ->
        socket = assign(socket, :char_id, char_id)
        {:ok, %{char_id: char_id}, socket}

      _ ->
        {:error, %{reason: "not_your_character"}}
    end
  end

  # All messages on user:* are server-push only (no client handle_in needed).
  # The Endpoint.broadcast!/3 calls from battle handlers deliver directly.
  # But we add a catch-all in case the client sends anything.
  @impl true
  def handle_in(_event, _payload, socket) do
    {:noreply, socket}
  end

  defp parse_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp parse_int(val) when is_integer(val), do: val
  defp parse_int(_), do: 0
end
