defmodule TePhoenixWeb.BestiaryController do
  @moduledoc """
  Bestiary — the player's catalog of monsters they've encountered.
  Discovered = present in `character_learned_enemy_skills` (any skill
  learned from the enemy implies the player fought it). Defeat counts
  come from the same table where rows mark first-defeat plus tallies.
  """

  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  def list(conn, %{"char_id" => char_id}) do
    user_id = conn.assigns.user_id

    # Verify ownership before returning anything.
    case Repo.query("SELECT id FROM characters WHERE id = ? AND user_id = ?", [char_id, user_id]) do
      {:ok, %{rows: [_]}} ->
        # Discovered enemy ids — any row in character_learned_enemy_skills.
        discovered =
          case Repo.query("SELECT DISTINCT enemy_npc_id FROM character_learned_enemy_skills WHERE character_id = ?", [char_id]) do
            {:ok, %{rows: rows}} -> rows |> List.flatten() |> MapSet.new()
            _ -> MapSet.new()
          end

        # Per-enemy defeat counts (sum of times_defeated if the table tracks it,
        # else just count of distinct rows as an approximation).
        defeated_map =
          case Repo.query(
            """
            SELECT enemy_npc_id, COUNT(*)
              FROM character_learned_enemy_skills
             WHERE character_id = ?
             GROUP BY enemy_npc_id
            """,
            [char_id]
          ) do
            {:ok, %{rows: rows}} -> Map.new(rows, fn [k, v] -> {k, v} end)
            _ -> %{}
          end

        # Pull the full enemy roster.
        case Repo.query(
          """
          SELECT id, name, icon, description, npc_level, base_hp, base_atk
            FROM game_npcs
           WHERE is_enemy = 1 AND is_active = 1
           ORDER BY npc_level, id
          """
        ) do
          {:ok, %{rows: rows, columns: cols}} ->
            entries = Enum.map(rows, fn row ->
              m = Enum.zip(cols, row) |> Map.new()
              id = m["id"]
              %{
                id: id,
                name: m["name"],
                icon: m["icon"] || "👹",
                description: m["description"],
                tier: m["npc_level"] || 1,
                discovered: MapSet.member?(discovered, id),
                defeated_count: Map.get(defeated_map, id, 0)
              }
            end)
            json(conn, %{success: true, bestiary: entries})

          _ ->
            json(conn, %{success: true, bestiary: []})
        end

      _ ->
        json(conn, %{success: false, bestiary: []})
    end
  end
end
