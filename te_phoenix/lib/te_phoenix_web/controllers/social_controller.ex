defmodule TePhoenixWeb.SocialController do
  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  def get_profile(conn, %{"char_id" => char_id}) do
    case Repo.query(
      "SELECT c.id, c.name, c.level, c.equipped_title, c.profile_bio, c.profile_color, c.profile_banner_emoji, c.profile_favorite_quote, c.profile_signature, c.profile_views, c.presence_status, c.profile_music_url, c.profile_background, c.profile_status, cl.name AS class_name, r.name AS race_name FROM characters c LEFT JOIN game_classes cl ON cl.id=c.class_id LEFT JOIN game_races r ON r.id=c.race_id WHERE c.id=?",
      [char_id]
    ) do
      {:ok, %{rows: [row], columns: cols}} ->
        profile = Enum.zip(cols, row) |> Map.new()
        json(conn, %{success: true, profile: profile})
      _ -> json(conn, %{success: false})
    end
  end

  def update_profile(conn, params) do
    user_id = conn.assigns.user_id
    char_id = params["charId"]

    case Repo.query("SELECT id FROM characters WHERE id=? AND user_id=?", [char_id, user_id]) do
      {:ok, %{rows: [_]}} ->
        allowed = ~w(profile_bio profile_color profile_banner_emoji profile_favorite_quote profile_signature profile_music_url profile_background profile_status equipped_title)

        updates = params
          |> Enum.filter(fn {k, _v} -> k in allowed end)
          |> Enum.map(fn {k, v} -> {k, v} end)

        if updates != [] do
          set_clause = updates |> Enum.map(fn {k, _} -> "#{k}=?" end) |> Enum.join(", ")
          values = Enum.map(updates, fn {_, v} -> v end) ++ [char_id]
          try do
            Repo.query!("UPDATE characters SET #{set_clause} WHERE id=?", values)
            json(conn, %{success: true})
          rescue
            _ -> json(conn, %{success: false, message: "Update failed."})
          end
        else
          json(conn, %{success: true})
        end

      _ -> json(conn, %{success: false, message: "Unauthorized."})
    end
  end

  def get_guestbook(conn, %{"char_id" => char_id}) do
    entries = query_rows(
      "SELECT id, author_char_id, author_name, author_title, author_color, message, created_at FROM profile_guestbook WHERE profile_char_id=? AND is_deleted=0 ORDER BY created_at DESC LIMIT 20",
      [char_id]
    )
    json(conn, %{success: true, entries: entries})
  end

  def post_guestbook(conn, %{"char_id" => target_id} = params) do
    user_id = conn.assigns.user_id
    message = (params["message"] || "") |> String.trim() |> String.slice(0, 500)
    if message == "", do: json(conn, %{success: false, message: "Empty message."})

    case Repo.query("SELECT id, name, equipped_title, profile_color FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
      {:ok, %{rows: [[char_id, name, title, color]]}} ->
        # Rate limit
        case Repo.query("SELECT id FROM profile_guestbook WHERE profile_char_id=? AND author_char_id=? AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)", [target_id, char_id]) do
          {:ok, %{rows: [_]}} -> json(conn, %{success: false, message: "One post per profile per 24 hours."})
          _ ->
            Repo.query!("INSERT INTO profile_guestbook (profile_char_id, author_char_id, author_name, author_title, author_color, message) VALUES (?,?,?,?,?,?)",
              [target_id, char_id, name, title, color, message])
            json(conn, %{success: true})
        end
      _ -> json(conn, %{success: false})
    end
  end

  def spotify_now_playing(conn, %{"char_id" => char_id}) do
    case Repo.query("SELECT spotify_track_url, spotify_track_name, spotify_artist_name FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[url, track, artist]]}} when not is_nil(url) ->
        json(conn, %{success: true, spotify: %{url: url, track: track, artist: artist}})
      _ -> json(conn, %{success: true, spotify: nil})
    end
  end

  def spotify_set_track(conn, params) do
    user_id = conn.assigns.user_id
    char_id = params["charId"]

    case Repo.query("SELECT id FROM characters WHERE id=? AND user_id=?", [char_id, user_id]) do
      {:ok, %{rows: [_]}} ->
        Repo.query("UPDATE characters SET spotify_track_url=?, spotify_track_name=?, spotify_artist_name=? WHERE id=?",
          [params["url"], params["track"], params["artist"], char_id])
        json(conn, %{success: true})
      _ -> json(conn, %{success: false})
    end
  end

  defp query_rows(sql, params) do
    case Repo.query(sql, params) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
  end
end
