defmodule TePhoenixWeb.Game.BountyAndSyndicateHandler do
  @moduledoc """
  Phoenix Channel handler for Lowtown Bounty Boards, Black Market Fence, and Autonomous NPC Schedules.
  """

  import Phoenix.Channel
  require Logger

  alias TePhoenix.Game.PlayerRegistry
  alias TePhoenix.World.{BountyManager, NpcSchedules, PropertyManager}

  # ── Bounty Board ───────────────────────────────────────────────────

  def handle("bounty_get_boards", _payload, socket) do
    char_id = socket.assigns[:char_id]
    data = BountyManager.list_boards_with_tasks(char_id)
    push(socket, "bounty_tasks_result", data)
    push(socket, "bounty_tasks", %{tasks: data.tasks})
    {:noreply, socket}
  end

  def handle("bounty_get_tasks", _payload, socket) do
    handle("bounty_get_boards", %{}, socket)
  end

  def handle("bounty_accept_task", payload, socket) do
    char_id = socket.assigns[:char_id] || 1
    task_id = payload["task_id"]

    res = BountyManager.accept_bounty(char_id, task_id)
    push(socket, "bounty_action_result", res)
    {:noreply, socket}
  end

  def handle("bounty_turn_in", payload, socket) do
    player = get_player(socket)
    task_id = payload["task_id"]
    capture_method = payload["capture_method"] || "alive"

    res = BountyManager.turn_in_bounty(player, task_id, capture_method)
    push(socket, "bounty_action_result", res)
    {:noreply, socket}
  end

  # ── Black Market Fence ─────────────────────────────────────────────

  def handle("fence_sell_loot", payload, socket) do
    player = get_player(socket)
    loot_type = payload["loot_type"]
    quantity = payload["quantity"] || 1

    res = BountyManager.fence_sell_loot(player, loot_type, quantity)
    push(socket, "fence_action_result", res)
    {:noreply, socket}
  end

  def handle("fence_buy_contraband", payload, socket) do
    player = get_player(socket)
    item_type = payload["item_type"]

    res = BountyManager.fence_buy_contraband(player, item_type)
    push(socket, "fence_action_result", res)
    {:noreply, socket}
  end

  # ── NPC Schedules ──────────────────────────────────────────────────

  def handle("schedules_get_active", payload, socket) do
    player = get_player(socket)
    map_id = payload["map_id"] || (player && player.map_id) || 1
    schedules = NpcSchedules.list_active_schedules(map_id)
    push(socket, "npc_schedules_list", %{schedules: schedules, map_id: map_id})
    {:noreply, socket}
  end

  def handle("schedules_force_phase", payload, socket) do
    player = get_player(socket)
    map_id = payload["map_id"] || (player && player.map_id) || 1
    phase = payload["phase"] || "night"

    case NpcSchedules.apply_schedules_for_phase(map_id, phase) do
      {:ok, updates} ->
        push(socket, "npc_schedules_update", %{map_id: map_id, phase: phase, schedules: updates})
        {:noreply, socket}

      _ ->
        {:noreply, socket}
    end
  end

  # ── Safehouse Stash & Trophies ──────────────────────────────────────

  def handle("property_get_stash", payload, socket) do
    player = get_player(socket)
    prop_id = payload["property_id"]

    case PropertyManager.get_safehouse_stash(player, prop_id) do
      {:ok, data} ->
        push(socket, "property_stash_result", Map.put(data, :success, true))
      {:error, reason} ->
        push(socket, "property_stash_result", %{success: false, error: reason})
    end
    {:noreply, socket}
  end

  def handle("property_deposit_gold", payload, socket) do
    player = get_player(socket)
    prop_id = payload["property_id"]
    amount = payload["amount"] || 0

    res = PropertyManager.deposit_stash_gold(player, prop_id, amount)
    push(socket, "property_stash_action", res)
    {:noreply, socket}
  end

  def handle("property_withdraw_gold", payload, socket) do
    player = get_player(socket)
    prop_id = payload["property_id"]
    amount = payload["amount"] || 0

    res = PropertyManager.withdraw_stash_gold(player, prop_id, amount)
    push(socket, "property_stash_action", res)
    {:noreply, socket}
  end

  def handle("property_deposit_item", payload, socket) do
    player = get_player(socket)
    prop_id = payload["property_id"]
    item_key = payload["item_key"]
    item_name = payload["item_name"]
    qty = payload["quantity"] || 1
    meta = payload["meta"] || %{}

    res = PropertyManager.deposit_stash_item(player, prop_id, item_key, item_name, qty, meta)
    push(socket, "property_stash_action", res)
    {:noreply, socket}
  end

  def handle("property_withdraw_item", payload, socket) do
    player = get_player(socket)
    prop_id = payload["property_id"]
    stash_id = payload["stash_id"]

    res = PropertyManager.withdraw_stash_item(player, prop_id, stash_id)
    push(socket, "property_stash_action", res)
    {:noreply, socket}
  end

  def handle("property_mount_trophy", payload, socket) do
    player = get_player(socket)
    prop_id = payload["property_id"]
    trophy_key = payload["trophy_key"]

    res = PropertyManager.mount_trophy(player, prop_id, trophy_key)
    push(socket, "property_trophy_action", res)
    {:noreply, socket}
  end

  def handle("property_remove_trophy", payload, socket) do
    player = get_player(socket)
    prop_id = payload["property_id"]
    trophy_id = payload["trophy_id"]

    res = PropertyManager.remove_trophy(player, prop_id, trophy_id)
    push(socket, "property_trophy_action", res)
    {:noreply, socket}
  end

  def handle("property_assign_guard", payload, socket) do
    player = get_player(socket)
    prop_id = payload["property_id"]
    comp_id = payload["companion_id"]
    comp_name = payload["companion_name"] || "Companion"

    res = PropertyManager.assign_guard_companion(player, prop_id, comp_id, comp_name)
    push(socket, "property_guard_action", res)
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
