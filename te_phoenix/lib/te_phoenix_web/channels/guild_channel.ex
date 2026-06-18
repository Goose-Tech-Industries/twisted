defmodule TePhoenixWeb.GuildChannel do
  @moduledoc """
  Per-guild fan-out topic.

  Phoenix's social chat handler broadcasts to `guild:<guild_id>` for
  guild-scoped chat. This module exists so guild-affiliated clients
  can subscribe to their own guild's topic.

  Subscription is gated by guild membership — non-members can't tune
  in to another guild's traffic. Guild-side actions (promote, kick,
  motd) still flow through the existing social channel handlers.
  """

  use TePhoenixWeb, :channel
  alias TePhoenix.Repo

  @impl true
  def join("guild:" <> guild_id_str, _params, socket) do
    user_id = socket.assigns[:user_id]

    case Integer.parse(guild_id_str) do
      {guild_id, ""} ->
        # Membership check via the user's primary character.
        case Repo.query(
          """
          SELECT gm.id
            FROM guild_members gm
            JOIN characters c ON c.id = gm.character_id
           WHERE gm.guild_id = ? AND gm.is_active = 1 AND c.user_id = ?
           LIMIT 1
          """,
          [guild_id, user_id]
        ) do
          {:ok, %{rows: [_]}} ->
            {:ok, %{guild_id: guild_id}, assign(socket, :guild_id, guild_id)}

          _ ->
            {:error, %{reason: "unauthorized"}}
        end

      _ ->
        {:error, %{reason: "invalid_topic"}}
    end
  end

  def join(_topic, _params, _socket), do: {:error, %{reason: "invalid_topic"}}
end
