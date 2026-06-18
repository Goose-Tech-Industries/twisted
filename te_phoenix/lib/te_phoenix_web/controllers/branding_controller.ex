defmodule TePhoenixWeb.BrandingController do
  @moduledoc """
  Branding / splash-page configuration.

  Reads + writes a curated set of `splash_*` and `login_*` keys from
  `system_settings`. The SvelteKit player calls `GET /api/branding` on
  boot to drive the splash + login look (theme, tagline, button text,
  hero quote, etc); admins update them via the AdminSauce LiveView at
  /sauce/branding which posts to `POST /api/branding`.

  Defaults live in `@defaults` so a fresh install renders the canonical
  Twisted Engine look without the table being seeded.
  """

  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  @defaults %{
    "splash_theme"           => "gothic",
    "splash_title"           => "Twisted Engine",
    "splash_tagline"         => "Tales from beneath the cairns",
    "splash_logo_url"        => "",
    "splash_bg_color_top"    => "#110608",
    "splash_bg_color_mid"    => "#050204",
    "splash_accent_color"    => "#b22222",
    "splash_atmosphere"      => "gothic",
    "splash_show_embers"     => "true",
    "splash_embers_count"    => "36",
    "splash_auto_redirect_ms"=> "1500",
    "login_subtitle"         => "Enter the realm",
    "login_button_login"     => "Enter",
    "login_button_register"  => "Forge",
    "login_quote"            => "",
    "login_quote_author"     => "",
    "login_register_enabled" => "true",
    "login_hero_image"       => ""
  }

  @keys Map.keys(@defaults)

  # ── PUBLIC READ ──────────────────────────────────────────────────
  # No auth required — branding is what the unauth'd splash/login page
  # consumes.
  def show(conn, _params) do
    rows =
      case Repo.query(
        "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (#{placeholders(@keys)})",
        @keys
      ) do
        {:ok, %{rows: rs}} -> Map.new(rs, fn [k, v] -> {to_string(k), to_string(v || "")} end)
        _ -> %{}
      end

    branding =
      Enum.reduce(@defaults, %{}, fn {k, default}, acc ->
        Map.put(acc, k, Map.get(rows, k, default))
      end)

    json(conn, %{
      success: true,
      branding: cast_for_client(branding),
      keys: @keys
    })
  end

  # ── ADMIN WRITE ──────────────────────────────────────────────────
  def update(conn, params) do
    if staff?(conn) do
      apply_updates(params)
      show(conn, params)
    else
      conn |> put_status(403) |> json(%{success: false, message: "Staff only."})
    end
  end

  # ── HELPERS ──────────────────────────────────────────────────────

  defp apply_updates(params) do
    for k <- @keys, Map.has_key?(params, k) do
      v = params[k] |> to_string() |> String.slice(0, 1024)
      upsert(k, v)
    end
    :ok
  end

  defp upsert(key, value) do
    Repo.query(
      """
      INSERT INTO system_settings (setting_key, setting_value, description, updated_at)
      VALUES (?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()
      """,
      [key, value, "Splash + login branding (managed via /sauce/branding)"]
    )
  end

  defp placeholders(list), do: list |> Enum.map(fn _ -> "?" end) |> Enum.join(",")

  defp staff?(conn) do
    role = get_session(conn, :role) || conn.assigns[:role]
    role in ["ADMIN", "OWNER", "GM", "STAFF"]
  end

  # Coerce stringly-typed system_settings values into the JS shapes the
  # SvelteKit client expects: booleans, integers where obvious.
  defp cast_for_client(branding) do
    branding
    |> Map.update!("splash_show_embers", &to_bool/1)
    |> Map.update!("login_register_enabled", &to_bool/1)
    |> Map.update!("splash_embers_count", &to_int/1)
    |> Map.update!("splash_auto_redirect_ms", &to_int/1)
  end

  defp to_bool("true"), do: true
  defp to_bool("1"), do: true
  defp to_bool(true), do: true
  defp to_bool(_), do: false

  defp to_int(v) when is_integer(v), do: v
  defp to_int(v) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      _ -> 0
    end
  end
  defp to_int(_), do: 0
end
