defmodule TePhoenixWeb.KickstarterController do
  use TePhoenixWeb, :controller

  alias TePhoenix.Marketing

  plug :put_root_layout, false
  plug :put_layout, false

  def index(conn, params) do
    referrer = get_req_header(conn, "referer") |> List.first()

    conn
    |> assign(:signed_up, params["signed_up"] == "1")
    |> assign(:already, params["already"] == "1")
    |> assign(:error, params["error"])
    |> assign(:source, params["src"] || "kickstarter-landing")
    |> assign(:referrer, referrer)
    |> render(:landing)
  end

  def signup(conn, %{"email" => email} = params) do
    source = params["source"] || "kickstarter-landing"
    referrer = get_req_header(conn, "referer") |> List.first()

    case Marketing.record_signup(email, source, referrer) do
      :ok ->
        redirect(conn, to: ~p"/kickstarter?signed_up=1")

      :already_subscribed ->
        redirect(conn, to: ~p"/kickstarter?already=1")

      {:error, :empty_email} ->
        redirect(conn, to: ~p"/kickstarter?error=missing")

      {:error, :invalid_email} ->
        redirect(conn, to: ~p"/kickstarter?error=invalid")

      {:error, :email_too_long} ->
        redirect(conn, to: ~p"/kickstarter?error=long")

      _ ->
        redirect(conn, to: ~p"/kickstarter?error=other")
    end
  end

  def signup(conn, _), do: redirect(conn, to: ~p"/kickstarter?error=missing")
end
