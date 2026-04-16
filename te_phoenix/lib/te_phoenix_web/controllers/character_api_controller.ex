defmodule TePhoenixWeb.CharacterApiController do
  @moduledoc """
  Public character API — read-only profile data for external consumers.
  """

  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  def show(conn, %{"id" => id}) do
    case Repo.query(
      "SELECT id, name, level, race, class FROM characters WHERE id=?",
      [id]
    ) do
      {:ok, %{rows: [[id, name, level, race, class]]}} ->
        json(conn, %{id: id, name: name, level: level, race: race, class: class})

      _ ->
        conn |> put_status(404) |> json(%{error: "not_found"})
    end
  end
end
