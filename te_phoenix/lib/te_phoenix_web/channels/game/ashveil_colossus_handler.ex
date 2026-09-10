defmodule TePhoenixWeb.Game.AshveilColossusHandler do
  @moduledoc """
  Phoenix Channel handler for the Ashveil Colossus Apex Boss Raid & Planet Mado Active Defense.
  """

  import Phoenix.Channel

  alias TePhoenix.Game.PlayerRegistry
  alias TePhoenix.Battle.AshveilColossus

  def handle("colossus_get_state", payload, socket) do
    player = get_player(socket)
    map_id = payload["map_id"] || player.map_id || 1
    state = AshveilColossus.get_or_spawn_raid(map_id)
    push(socket, "colossus_state", state)
    {:noreply, socket}
  end

  def handle("colossus_strike_limb", payload, socket) do
    player = get_player(socket)
    raid_id = payload["raid_id"]
    limb = payload["limb"] || "head"
    damage = payload["damage"] || 150

    res = AshveilColossus.strike_limb(raid_id, player, limb, damage)
    push(socket, "colossus_strike_result", res)
    {:noreply, socket}
  end

  def handle("colossus_trigger_telegraph", payload, socket) do
    raid_id = payload["raid_id"]
    atk_type = payload["attack_type"] || "overhead_slam"

    case AshveilColossus.trigger_telegraph(raid_id, atk_type) do
      {:ok, telegraph} ->
        push(socket, "colossus_telegraph", telegraph)
    end
    {:noreply, socket}
  end

  def handle("colossus_active_defense_react", payload, socket) do
    player = get_player(socket)
    raid_id = payload["raid_id"]
    defense_type = payload["defense_type"] || "parry"
    timing_ms = payload["timing_ms"] || 0

    case AshveilColossus.react_active_defense(player, raid_id, defense_type, timing_ms) do
      {:ok, result} ->
        push(socket, "colossus_defense_result", result)
    end
    {:noreply, socket}
  end

  def handle("colossus_claim_loot", payload, socket) do
    player = get_player(socket)
    raid_id = payload["raid_id"]

    res = AshveilColossus.claim_raid_loot(player, raid_id)
    push(socket, "colossus_loot_result", res)
    {:noreply, socket}
  end

  # ── Helpers ────────────────────────────────────────────────────────

  defp get_player(socket) do
    char_id = socket.assigns[:char_id] || socket.assigns[:party_char_id] || 1
    char_name = socket.assigns[:char_name] || "Adventurer"
    p = PlayerRegistry.get(char_id)
    p || %{id: char_id, name: char_name, map_id: socket.assigns[:map_id] || 1}
  end
end
