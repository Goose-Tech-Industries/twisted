defmodule TePhoenixWeb.BattleRefChannel do
  @moduledoc """
  Referee-only channel for battle referee communication.
  Topic format: "battle_ref:{battle_id}"

  Only referees join this. Receives:
  - battle_chat_msg (referee-only messages)
  """

  use Phoenix.Channel

  alias TePhoenix.Repo

  @impl true
  def join("battle_ref:" <> battle_id, _params, socket) do
    user_id = socket.assigns.user_id

    # Verify user is a registered referee for this battle
    case Repo.query(
      "SELECT id FROM game_battle_referees WHERE battle_id=? AND user_id=?",
      [battle_id, user_id]
    ) do
      {:ok, %{rows: [_]}} ->
        {:ok, socket}
      _ ->
        {:error, %{reason: "not_a_referee"}}
    end
  end

  @impl true
  def handle_in(_event, _payload, socket), do: {:noreply, socket}
end
