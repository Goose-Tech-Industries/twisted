defmodule TePhoenixWeb.OghamController do
  @moduledoc """
  Ogham (Celtic rune passive) endpoints.

    GET  /api/oghams              → library of all oghams
    GET  /api/oghams/:char_id     → character's socketed slots
    POST /api/oghams/socket       → set/clear an ogham in a slot
  """

  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  def list(conn, _params) do
    case Repo.query(
      """
      SELECT go.id, go.name, go.icon, go.description, go.lore_text, go.rank, go.family_id,
             go.stat_bonus_json, go.on_hit_status, go.on_hit_chance, go.kills_to_rank_up,
             go.element_attack,
             gof.name AS family_name, gof.icon AS family_icon, gof.set_bonus_json
        FROM game_oghams go
   LEFT JOIN game_ogham_families gof ON gof.id = go.family_id
       ORDER BY go.family_id, go.rank, go.id
      """
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        oghams = Enum.map(rows, fn row ->
          m = Enum.zip(cols, row) |> Map.new()
          %{
            id: m["id"],
            key: "ogham_#{m["id"]}",
            name: m["name"],
            glyph: m["icon"] || "᚛",
            description: m["description"] || "",
            lore: m["lore_text"],
            tier: m["rank"] || 1,
            effects: parse_json(m["stat_bonus_json"]),
            element_attack: m["element_attack"],
            on_hit_status: m["on_hit_status"],
            on_hit_chance: m["on_hit_chance"],
            kills_to_rank_up: m["kills_to_rank_up"] || 50,
            family_id: m["family_id"],
            family_name: m["family_name"] || "Unbound",
            family_icon: m["family_icon"] || "🩸",
            set_bonus: parse_json(m["set_bonus_json"])
          }
        end)
        json(conn, %{success: true, oghams: oghams})

      _ ->
        json(conn, %{success: true, oghams: []})
    end
  end

  def slots(conn, %{"char_id" => char_id}) do
    user_id = conn.assigns.user_id

    case Repo.query("SELECT max_ogham_slots FROM characters WHERE id = ? AND user_id = ?", [char_id, user_id]) do
      {:ok, %{rows: [[max_slots]]}} ->
        max = max_slots || 3
        case Repo.query(
          """
          SELECT slot_index, ogham_id, current_rank, kill_count
            FROM character_oghams
           WHERE character_id = ?
           ORDER BY slot_index
          """,
          [char_id]
        ) do
          {:ok, %{rows: rows}} ->
            slots = Enum.map(rows, fn [idx, oid, rank, kills] ->
              %{index: idx, ogham_id: oid, current_rank: rank, kill_count: kills}
            end)
            json(conn, %{success: true, slots: slots, max_slots: max})

          _ ->
            json(conn, %{success: true, slots: [], max_slots: max})
        end

      _ ->
        # Some installations don't have max_ogham_slots — fall back to 3.
        json(conn, %{success: true, slots: [], max_slots: 3})
    end
  rescue
    # Column may not exist in all DBs — don't 500 on schema variance.
    _ -> json(conn, %{success: true, slots: [], max_slots: 3})
  end

  def socket(conn, %{"slotIndex" => slot} = params) do
    user_id = conn.assigns.user_id
    ogham_id = params["oghamId"]
    slot_idx = parse_int(slot)

    case Repo.query("SELECT id FROM characters WHERE user_id = ? ORDER BY id DESC LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        if is_nil(ogham_id) do
          Repo.query("DELETE FROM character_oghams WHERE character_id = ? AND slot_index = ?", [char_id, slot_idx])
          json(conn, %{success: true})
        else
          # Item id pulled from inventory if present; otherwise 0.
          item_id = params["itemId"] || 0

          Repo.query(
            """
            INSERT INTO character_oghams (character_id, item_id, slot_index, ogham_id, current_rank, kill_count, corruption_points)
            VALUES (?, ?, ?, ?, 1, 0, 0)
            ON DUPLICATE KEY UPDATE ogham_id = VALUES(ogham_id), current_rank = 1, kill_count = 0
            """,
            [char_id, item_id, slot_idx, ogham_id]
          )
          json(conn, %{success: true})
        end

      _ ->
        json(conn, %{success: false, message: "No character."})
    end
  rescue
    e -> json(conn, %{success: false, message: Exception.message(e)})
  end

  defp parse_int(v) when is_integer(v), do: v
  defp parse_int(v) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      _ -> 0
    end
  end
  defp parse_int(_), do: 0

  defp parse_json(nil), do: %{}
  defp parse_json(""), do: %{}
  defp parse_json(s) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, m} -> m
      _ -> %{}
    end
  end
  defp parse_json(_), do: %{}
end
