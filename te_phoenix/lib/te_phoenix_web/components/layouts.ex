defmodule TePhoenixWeb.Layouts do
  @moduledoc """
  Layout components for the LiveView admin panel.
  """
  use TePhoenixWeb, :html

  import TePhoenixWeb.CoreComponents

  embed_templates "layouts/*"

  defp role_name_color("OWNER"), do: "staff-name-owner"
  defp role_name_color("ADMIN"), do: "text-red-400 staff-name-admin"
  defp role_name_color("GM"), do: "text-purple-400 staff-name-gm"
  defp role_name_color("MOD"), do: "text-green-400 staff-name-mod"
  defp role_name_color("STAFF"), do: "text-cyan-400"
  defp role_name_color(_), do: "text-zinc-300"

  defp status_dot_color("OWNER"), do: "bg-yellow-400"
  defp status_dot_color("ADMIN"), do: "bg-red-400"
  defp status_dot_color("GM"), do: "bg-purple-400"
  defp status_dot_color("MOD"), do: "bg-green-400"
  defp status_dot_color(_), do: "bg-cyan-400"

  defp group_display_name(channel) do
    # Format: "group:1-2-5:teamname" → "teamname"
    # Or: "group:teamname" → "teamname"
    parts = String.split(channel, ":")
    case parts do
      ["group", _ids, name] -> name
      ["group", name] -> name
      _ -> String.replace_prefix(channel, "group:", "")
    end
  end

  defp format_chat_time(nil), do: ""
  defp format_chat_time(%NaiveDateTime{} = ts), do: Calendar.strftime(ts, "%H:%M")
  defp format_chat_time(%DateTime{} = ts), do: Calendar.strftime(ts, "%H:%M")
  defp format_chat_time(ts), do: to_string(ts)

  defp format_chat_body(text) when is_binary(text) do
    text
    |> Phoenix.HTML.html_escape()
    |> Phoenix.HTML.safe_to_string()
    |> String.replace(~r/\*([^*]+)\*/, "<strong>\\1</strong>")
    |> String.replace(~r/_([^_]+)_/, "<em>\\1</em>")
    |> String.replace(~r/~([^~]+)~/, "<s class=\"opacity-60\">\\1</s>")
    |> Phoenix.HTML.raw()
  end
  defp format_chat_body(_), do: ""
end
