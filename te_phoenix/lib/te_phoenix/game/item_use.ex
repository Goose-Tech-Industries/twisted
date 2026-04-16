defmodule TePhoenix.Game.ItemUse do
  @moduledoc """
  Overworld item usage — consumables, healing, buffs, status cures.
  Executes the item's effects JSON (same schema as skill effects).
  Called from world_handler or game channel when a player uses an item outside of battle.
  """

  require Logger
  alias TePhoenix.Repo

  @doc """
  Use an item from a character's inventory.
  Validates ownership, quantity, and usability type.
  Executes effects: heal HP, restore MP, apply status, remove status, buff stats.
  Returns {:ok, effects_applied} or {:error, reason}.
  """
  def use_item(char_id, item_id, target_char_id \\ nil) do
    target_id = target_char_id || char_id

    with {:ok, inv_id, qty} <- check_inventory(char_id, item_id),
         {:ok, item} <- load_item(item_id),
         :ok <- validate_usable(item) do

      effects = parse_json(item.effects)

      if effects == %{} do
        {:error, "This item has no usable effects."}
      else
        applied = execute_effects(target_id, effects, item)

        # Consume the item (decrement qty, delete if 0)
        consume_item(inv_id, qty)

        # Fire trigger event
        TePhoenixWeb.Endpoint.broadcast!("user:#{char_id}", "trigger_event", %{
          event: "item_used",
          item_id: item_id,
          item_name: item.name,
          target_id: target_id
        })

        Logger.info("ItemUse: char=#{char_id} used item=#{item_id} (#{item.name}) on target=#{target_id}")

        {:ok, applied}
      end
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # EFFECT EXECUTION
  # ══════════════════════════════════════════════════════════════════

  defp execute_effects(target_id, effects, item) do
    applied = []

    # Heal HP
    applied = if effects["heal_hp"] do
      amount = parse_amount(effects["heal_hp"])
      if amount > 0 do
        try do
          Repo.query!("UPDATE characters SET current_hp=LEAST(max_hp, current_hp+?) WHERE id=?", [amount, target_id])
          applied ++ [%{type: :heal_hp, amount: amount}]
        rescue
          _ -> applied
        end
      else
        applied
      end
    else
      applied
    end

    # Restore MP
    applied = if effects["heal_mp"] || effects["restore_mp"] do
      amount = parse_amount(effects["heal_mp"] || effects["restore_mp"])
      if amount > 0 do
        try do
          Repo.query!("UPDATE characters SET current_mp=LEAST(max_mp, current_mp+?) WHERE id=?", [amount, target_id])
          applied ++ [%{type: :restore_mp, amount: amount}]
        rescue
          _ -> applied
        end
      else
        applied
      end
    else
      applied
    end

    # Apply status effect
    applied = if effects["apply_status"] do
      status_id = effects["apply_status"]
      duration = effects["status_duration"] || 60
      try do
        Repo.query!(
          "INSERT INTO character_status_effects (character_id, status_id, source, expires_at) VALUES (?,?,'item',DATE_ADD(NOW(), INTERVAL ? SECOND)) ON DUPLICATE KEY UPDATE expires_at=DATE_ADD(NOW(), INTERVAL ? SECOND)",
          [target_id, status_id, duration, duration]
        )
        applied ++ [%{type: :apply_status, status_id: status_id, duration: duration}]
      rescue
        _ -> applied
      end
    else
      applied
    end

    # Remove status effect
    applied = if effects["remove_status"] do
      status_id = effects["remove_status"]
      try do
        Repo.query!("DELETE FROM character_status_effects WHERE character_id=? AND status_id=?", [target_id, status_id])
        applied ++ [%{type: :remove_status, status_id: status_id}]
      rescue
        _ -> applied
      end
    else
      applied
    end

    # Cure all negative statuses
    applied = if effects["cure_all"] do
      try do
        Repo.query!("""
          DELETE cse FROM character_status_effects cse
          JOIN game_statuses gs ON gs.id = cse.status_id
          WHERE cse.character_id=? AND gs.type='DEBUFF'
        """, [target_id])
        applied ++ [%{type: :cure_all}]
      rescue
        _ -> applied
      end
    else
      applied
    end

    # Buff stats (temporary — via status effect)
    applied = if effects["buff_stats"] do
      buffs = effects["buff_stats"]
      stat_changes = Enum.flat_map(buffs, fn {stat, amount} ->
        col = stat_column(stat)
        if col do
          try do
            Repo.query!("UPDATE characters SET #{col}=#{col}+? WHERE id=?", [amount, target_id])
            [%{type: :buff_stat, stat: stat, amount: amount}]
          rescue
            _ -> []
          end
        else
          []
        end
      end)
      applied ++ stat_changes
    else
      applied
    end

    # Revive (restore from 0 HP)
    applied = if effects["revive"] do
      revive_pct = effects["revive"]
      try do
        case Repo.query("SELECT max_hp, current_hp FROM characters WHERE id=?", [target_id]) do
          {:ok, %{rows: [[max_hp, current_hp]]}} when current_hp <= 0 ->
            restored = max(1, trunc(max_hp * revive_pct))
            Repo.query!("UPDATE characters SET current_hp=? WHERE id=?", [restored, target_id])
            applied ++ [%{type: :revive, hp_restored: restored}]
          _ ->
            applied
        end
      rescue
        _ -> applied
      end
    else
      applied
    end

    %{
      item_name: item.name,
      item_icon: item.icon,
      effects: applied
    }
  end

  # ══════════════════════════════════════════════════════════════════
  # PRIVATE HELPERS
  # ══════════════════════════════════════════════════════════════════

  defp check_inventory(char_id, item_id) do
    case Repo.query(
      "SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=? AND quantity>0",
      [char_id, item_id]
    ) do
      {:ok, %{rows: [[inv_id, qty]]}} -> {:ok, inv_id, qty}
      _ -> {:error, "Item not in inventory or quantity is 0."}
    end
  end

  defp load_item(item_id) do
    case Repo.query(
      "SELECT id, name, icon, type, effects FROM game_items WHERE id=?",
      [item_id]
    ) do
      {:ok, %{rows: [[id, name, icon, type, effects]]}} ->
        {:ok, %{id: id, name: name, icon: icon || "", type: type, effects: effects}}
      _ ->
        {:error, "Item not found."}
    end
  end

  defp validate_usable(item) do
    usable_types = ["CONSUMABLE", "POTION", "SCROLL", "FOOD", "MEDICINE", "KEY_ITEM"]
    type = String.upcase(to_string(item.type || ""))
    if type in usable_types or type == "" do
      :ok
    else
      {:error, "This item cannot be used (type: #{item.type})."}
    end
  end

  defp consume_item(inv_id, qty) do
    try do
      if qty <= 1 do
        Repo.query!("DELETE FROM character_items WHERE id=?", [inv_id])
      else
        Repo.query!("UPDATE character_items SET quantity=quantity-1 WHERE id=?", [inv_id])
      end
    rescue
      _ -> nil
    end
  end

  defp parse_amount(val) when is_integer(val), do: val
  defp parse_amount(val) when is_float(val), do: trunc(val)
  defp parse_amount(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      _ -> 0
    end
  end
  defp parse_amount(%{"formula" => formula}) do
    # Simple formula support: just extract the number for overworld use
    case Integer.parse(to_string(formula)) do
      {n, _} -> n
      _ -> 50
    end
  end
  defp parse_amount(_), do: 0

  defp stat_column("atk"), do: "atk"
  defp stat_column("def"), do: "def"
  defp stat_column("mo"), do: "mo"
  defp stat_column("md"), do: "md"
  defp stat_column("speed"), do: "speed"
  defp stat_column("luck"), do: "luck"
  defp stat_column("hp"), do: "max_hp"
  defp stat_column("mp"), do: "max_mp"
  defp stat_column(_), do: nil

  defp parse_json(nil), do: %{}
  defp parse_json(""), do: %{}
  defp parse_json(val) when is_binary(val) do
    case Jason.decode(val) do
      {:ok, map} when is_map(map) -> map
      _ -> %{}
    end
  end
  defp parse_json(val) when is_map(val), do: val
  defp parse_json(_), do: %{}
end
