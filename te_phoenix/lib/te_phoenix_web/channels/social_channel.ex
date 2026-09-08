defmodule TePhoenixWeb.SocialChannel do
  @moduledoc """
  Social system channel. Replaces socket-social.js.
  Topic format: "social:lobby" (single topic, all players).

  Handles: chat, emotes, presence, friends, greet, inspect, profiles,
  guestbook, guilds, trading, parties, staff panel, minigames,
  bank, housing, mounts, map editor, etc.
  """

  use Phoenix.Channel
  require Logger

  # aliases used by handler modules

  alias TePhoenixWeb.Social.{
    ChatHandler,
    GuildTradePartyHandler,
    StaffHandler,
    MinigameHandler,
    SocialWorldHandler
  }

  @impl true
  def join("social:lobby", _params, socket) do
    user_id = socket.assigns.user_id
    {:ok, %{user_id: user_id}, socket}
  end

  # ── Chat & Presence ─────────────────────────────────────────────
  @impl true
  def handle_in("chat_send" = e, p, s), do: ChatHandler.handle(e, p, s)
  def handle_in("title_changed" = e, p, s), do: ChatHandler.handle(e, p, s)
  def handle_in("set_presence" = e, p, s), do: ChatHandler.handle(e, p, s)
  def handle_in("typing_dm" = e, p, s), do: ChatHandler.handle(e, p, s)
  def handle_in("emote" = e, p, s), do: ChatHandler.handle(e, p, s)
  def handle_in("friend_request_sent" = e, p, s), do: ChatHandler.handle(e, p, s)
  def handle_in("greet_player" = e, p, s), do: ChatHandler.handle(e, p, s)
  def handle_in("inspect_player" = e, p, s), do: ChatHandler.handle(e, p, s)
  def handle_in("view_profile" = e, p, s), do: ChatHandler.handle(e, p, s)
  def handle_in("guestbook_post" = e, p, s), do: ChatHandler.handle(e, p, s)

  # ── Guild ───────────────────────────────────────────────────────
  def handle_in("guild_" <> _ = e, p, s), do: GuildTradePartyHandler.handle(e, p, s)

  # ── Trade ───────────────────────────────────────────────────────
  def handle_in("trade_" <> _ = e, p, s), do: GuildTradePartyHandler.handle(e, p, s)

  # ── Party ───────────────────────────────────────────────────────
  def handle_in("party_" <> _ = e, p, s), do: GuildTradePartyHandler.handle(e, p, s)

  # ── Staff Panel ─────────────────────────────────────────────────
  def handle_in("staff_" <> _ = e, p, s), do: StaffHandler.handle(e, p, s)

  # ── Minigames ───────────────────────────────────────────────────
  def handle_in("dice_roll" = e, p, s), do: MinigameHandler.handle(e, p, s)
  def handle_in("arena_place_bet" = e, p, s), do: MinigameHandler.handle(e, p, s)
  def handle_in("fish_cast" = e, p, s), do: MinigameHandler.handle(e, p, s)
  def handle_in("fish_reel" = e, p, s), do: MinigameHandler.handle(e, p, s)
  def handle_in("card_get_collection" = e, p, s), do: MinigameHandler.handle(e, p, s)
  def handle_in("card_game_challenge" = e, p, s), do: MinigameHandler.handle(e, p, s)
  def handle_in("card_game_place" = e, p, s), do: MinigameHandler.handle(e, p, s)
  def handle_in("gather" = e, p, s), do: MinigameHandler.handle(e, p, s)
  def handle_in("bounty_accept" = e, p, s), do: MinigameHandler.handle(e, p, s)

  # ── World / Housing / Mounts / Bank / NPC / Cutscene ────────────
  def handle_in("bank_deposit" = e, p, s), do: SocialWorldHandler.handle(e, p, s)
  def handle_in("bank_withdraw" = e, p, s), do: SocialWorldHandler.handle(e, p, s)
  def handle_in("capture_creature" = e, p, s), do: SocialWorldHandler.handle(e, p, s)
  def handle_in("mount_toggle" = e, p, s), do: SocialWorldHandler.handle(e, p, s)
  def handle_in("housing_purchase" = e, p, s), do: SocialWorldHandler.handle(e, p, s)
  def handle_in("housing_place_furniture" = e, p, s), do: SocialWorldHandler.handle(e, p, s)
  def handle_in("trigger_cutscene" = e, p, s), do: SocialWorldHandler.handle(e, p, s)
  def handle_in("npc_get_relationships" = e, p, s), do: SocialWorldHandler.handle(e, p, s)
  def handle_in("interact_object" = e, p, s), do: SocialWorldHandler.handle(e, p, s)

  # ── Map Editor ──────────────────────────────────────────────────
  def handle_in("map_editor_" <> _ = e, p, s), do: SocialWorldHandler.handle(e, p, s)

  # Catch-all
  def handle_in(event, _payload, socket) do
    Logger.warning("Unknown social event: #{event}")
    {:noreply, socket}
  end
end
