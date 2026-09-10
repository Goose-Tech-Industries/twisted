defmodule TePhoenixWeb.GuildController do
  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  def list_guilds(conn, _params) do
    guilds = query_rows("SELECT g.id, g.name, g.icon, g.description, g.level, u.username AS leader_name, (SELECT COUNT(*) FROM guild_members WHERE guild_id=g.id AND is_active=1) AS member_count FROM guilds g LEFT JOIN users u ON u.id=(SELECT user_id FROM characters WHERE id=g.leader_id) WHERE g.is_active=1 ORDER BY g.name")
    json(conn, %{success: true, guilds: guilds})
  end

  def get_guild(conn, %{"id" => id}) do
    case Repo.query("SELECT * FROM guilds WHERE id=? AND is_active=1", [id]) do
      {:ok, %{rows: [row], columns: cols}} ->
        guild = Enum.zip(cols, row) |> Map.new()
        members = query_rows("SELECT gm.character_id, gm.rank, gm.joined_at, c.name, c.level FROM guild_members gm JOIN characters c ON c.id=gm.character_id WHERE gm.guild_id=? AND gm.is_active=1 ORDER BY FIELD(gm.rank,'LEADER','OFFICER','MEMBER')", [id])
        json(conn, %{success: true, guild: Map.put(guild, "members", members)})
      _ -> json(conn, %{success: false, message: "Guild not found."})
    end
  end

  def create_guild(conn, params) do
    user_id = conn.assigns.user_id
    name = (params["name"] || "") |> String.trim()
    description = params["description"] || ""
    emblem = params["emblem"] || params["icon"] || "⚔️"
    # Schema: `tag VARCHAR(6) NOT NULL` with no default. Derive when the
    # client doesn't pass one.
    tag =
      (params["tag"] || derive_tag(name))
      |> to_string()
      |> String.upcase()
      |> String.slice(0, 6)

    cond do
      String.length(name) < 3 or String.length(name) > 64 ->
        json(conn, %{success: false, message: "Guild name must be 3-64 characters."})

      tag == "" ->
        json(conn, %{success: false, message: "Guild tag required."})

      true ->
        do_create_guild(conn, user_id, name, tag, emblem, description)
    end
  end

  defp do_create_guild(conn, user_id, name, tag, emblem, description) do
    case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id]]}} ->
        case Repo.query("SELECT id FROM guild_members WHERE character_id=? AND is_active=1", [char_id]) do
          {:ok, %{rows: [_]}} ->
            json(conn, %{success: false, message: "Already in a guild."})

          _ ->
            try do
              {:ok, result} = Repo.query(
                "INSERT INTO guilds (name, tag, description, emblem, leader_id) VALUES (?,?,?,?,?)",
                [name, tag, description, emblem, char_id]
              )
              guild_id = result.last_insert_id
              Repo.query!(
                "INSERT INTO guild_members (guild_id, character_id, rank) VALUES (?,?,'LEADER')",
                [guild_id, char_id]
              )
              json(conn, %{success: true, guildId: guild_id, tag: tag, message: "Guild created!"})
            rescue
              e ->
                msg =
                  if String.contains?(Exception.message(e), "duplicate key") or
                     String.contains?(Exception.message(e), "unique constraint") do
                    "Guild name or tag already taken."
                  else
                    "Create failed: #{Exception.message(e)}"
                  end

                json(conn, %{success: false, message: msg})
            end
        end

      _ ->
        json(conn, %{success: false, message: "No character found."})
    end
  end

  # Initials of the first words, falling back to the first up-to-4
  # letters of the name. Capped to fit the 6-char `tag` column.
  defp derive_tag(name) do
    initials =
      name
      |> String.split(~r/\s+/, trim: true)
      |> Enum.map(&String.first/1)
      |> Enum.reject(&is_nil/1)
      |> Enum.join()

    raw = if String.length(initials) >= 2, do: initials, else: name
    raw |> String.replace(~r/[^A-Za-z]/, "") |> String.slice(0, 4)
  end

  def get_members(conn, %{"id" => id}) do
    members = query_rows("SELECT gm.character_id, gm.rank, gm.joined_at, c.name, c.level FROM guild_members gm JOIN characters c ON c.id=gm.character_id WHERE gm.guild_id=? AND gm.is_active=1", [id])
    json(conn, %{success: true, members: members})
  end

  def get_news(conn, %{"id" => id}) do
    news = query_rows("SELECT gn.*, c.name AS author_name FROM guild_news gn LEFT JOIN characters c ON c.id=gn.author_char_id WHERE gn.guild_id=? ORDER BY gn.created_at DESC LIMIT 20", [id])
    json(conn, %{success: true, news: news})
  end

  def post_news(conn, %{"id" => id} = params) do
    user_id = conn.assigns.user_id
    case Repo.query("SELECT gm.character_id, gm.rank FROM guild_members gm JOIN characters c ON c.id=gm.character_id WHERE gm.guild_id=? AND c.user_id=? AND gm.is_active=1", [id, user_id]) do
      {:ok, %{rows: [[char_id, rank]]}} when rank in ["LEADER", "OFFICER"] ->
        title = params["title"] || "News"
        body = params["body"] || ""
        Repo.query!("INSERT INTO guild_news (guild_id, author_char_id, title, body) VALUES (?,?,?,?)", [id, char_id, title, body])
        json(conn, %{success: true})
      _ -> json(conn, %{success: false, message: "Not authorized."})
    end
  end

  defp query_rows(sql, params \\ []) do
    case Repo.query(sql, params) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
  end
end
