defmodule TePhoenixWeb.NemesisController do
  @moduledoc """
  Controller for Living Nemesis and Faction Memory Engine endpoints.
  """
  use TePhoenixWeb, :controller
  alias TePhoenix.Game.Nemesis

  def get_dossier(conn, %{"char_id" => char_id_param}) do
    char_id = to_int(char_id_param)
    dossier = Nemesis.get_dossier(char_id)
    json(conn, dossier)
  end

  def record_encounter(conn, %{"char_id" => char_id_param, "nemesis_id" => nem_id, "outcome" => outcome} = params) do
    char_id = to_int(char_id_param)
    details = params["details"] || %{}
    result = Nemesis.record_encounter(char_id, nem_id, outcome, details)
    json(conn, result)
  end

  def faction_shift(conn, %{"char_id" => char_id_param, "faction" => faction_key, "delta" => delta}) do
    char_id = to_int(char_id_param)
    delta_num = to_int(delta)
    case Nemesis.adjust_faction_standing(char_id, faction_key, delta_num) do
      {:ok, res} -> json(conn, %{success: true, data: res})
      {:error, msg} -> conn |> put_status(400) |> json(%{success: false, error: msg})
    end
  end

  def check_ambush(conn, %{"char_id" => char_id_param} = params) do
    char_id = to_int(char_id_param)
    context = params["context"] || "wilds"
    case Nemesis.check_ambush(char_id, context) do
      {:ambush, data} -> json(conn, %{ambush: true, data: data})
      {:ok, :clear} -> json(conn, %{ambush: false, message: "The area is quiet... for now."})
    end
  end

  def generate(conn, params) do
    archetype = params["archetype"]
    level = to_int(params["level"] || 3)
    nemesis = Nemesis.generate_nemesis(archetype, %{level: level})
    json(conn, %{success: true, nemesis: nemesis})
  end

  defp to_int(nil), do: 0
  defp to_int(v) when is_integer(v), do: v
  defp to_int(v) when is_binary(v) do
    case Integer.parse(v) do
      {num, _} -> num
      _ -> 0
    end
  end
  defp to_int(_), do: 0
end
