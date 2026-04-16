defmodule TePhoenix.Game.AdminAudit do
  @moduledoc """
  Logs all admin/GM actions to game_event_log for audit trail.
  Call `log/4` from any admin handler.
  """

  alias TePhoenix.Repo

  @doc """
  Log an admin action.

  - event_type: "gm_heal", "gm_ban", "gm_warn", "gm_teleport", "gm_give_gold", "gm_give_xp",
                "gm_role_change", "gm_mute", "gm_unmute", "gm_broadcast", etc.
  - actor: %{id: integer, name: string} — the admin performing the action
  - target: %{id: integer, name: string} | nil — the affected player/entity
  - detail: string or map — extra context (gets JSON-encoded if map)
  """
  def log(event_type, actor, target \\ nil, detail \\ nil) do
    detail_str = case detail do
      nil -> nil
      d when is_binary(d) -> d
      d when is_map(d) or is_list(d) -> Jason.encode!(d)
      d -> to_string(d)
    end

    Repo.query(
      "INSERT INTO game_event_log (event_type, actor_id, actor_name, target_id, target_name, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
      [
        event_type,
        actor[:id],
        actor[:name] || "System",
        target[:id],
        target[:name],
        detail_str
      ]
    )
  end
end
