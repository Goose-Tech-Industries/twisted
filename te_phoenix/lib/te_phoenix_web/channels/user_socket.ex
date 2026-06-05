defmodule TePhoenixWeb.UserSocket do
  use Phoenix.Socket

  channel "game:*", TePhoenixWeb.GameChannel
  channel "social:*", TePhoenixWeb.SocialChannel
  channel "battle:*", TePhoenixWeb.BattleChannel
  channel "user:*", TePhoenixWeb.UserChannel
  channel "map:*", TePhoenixWeb.MapChannel
  channel "raid:*", TePhoenixWeb.RaidChannel
  channel "battle_ref:*", TePhoenixWeb.BattleRefChannel
  channel "player:*", TePhoenixWeb.PlayerChannel
  channel "party:*", TePhoenixWeb.PartyChannel
  channel "guild:*", TePhoenixWeb.GuildChannel

  @impl true
  def connect(%{"token" => token}, socket, _connect_info) do
    # TODO: Verify JWT/session token and assign user_id + char_id
    # For now, accept connections with a user_id param
    case Phoenix.Token.verify(socket, "user socket", token, max_age: 86_400) do
      {:ok, user_id} ->
        {:ok, assign(socket, :user_id, user_id)}

      {:error, _reason} ->
        :error
    end
  end

  def connect(_params, _socket, _connect_info), do: :error

  @impl true
  def id(socket), do: "user_socket:#{socket.assigns.user_id}"
end
