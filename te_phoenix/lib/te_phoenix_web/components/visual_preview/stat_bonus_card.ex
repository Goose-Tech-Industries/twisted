defmodule TePhoenixWeb.Components.VisualPreview.StatBonusCard do
  @moduledoc """
  Tier α P4 — bar-chart card for stat bonuses (item passives, buffs).
  Positive values render green, negative red. Bar lengths normalized
  against the largest absolute value in the map.

      <.stat_bonus_card stats={%{atk: 15, def: -5, hp: 200, speed: 3}} />
  """

  use Phoenix.Component

  attr :stats, :map, required: true,
       doc: "%{atk: 15, def: -5, hp: 200, ...} — keys are atoms or strings"

  attr :title, :string, default: nil

  def stat_bonus_card(assigns) do
    entries =
      assigns.stats
      |> Enum.map(fn {k, v} -> {to_string(k), to_number(v)} end)
      |> Enum.reject(fn {_, v} -> v == 0 or is_nil(v) end)

    max_abs =
      entries
      |> Enum.map(fn {_, v} -> abs(v) end)
      |> Enum.max(fn -> 1 end)
      |> max(1)

    assigns = assigns |> assign(:entries, entries) |> assign(:max_abs, max_abs)

    ~H"""
    <div class="bg-zinc-900/50 border border-zinc-800 rounded p-2 space-y-1">
      <div :if={@title} class="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">{@title}</div>
      <div :if={@entries == []} class="text-[10px] text-zinc-600 italic">No bonuses</div>
      <div :for={{stat, value} <- @entries} class="flex items-center gap-2 text-xs">
        <span class="w-12 text-zinc-400 uppercase font-mono">{stat}</span>
        <div class="flex-1 h-3 bg-zinc-950 rounded overflow-hidden flex items-center">
          <div :if={value > 0}
            class="h-full bg-emerald-600 transition-all"
            style={"width: #{Float.round(abs(value) / @max_abs * 100, 1)}%"}>
          </div>
          <div :if={value < 0}
            class="h-full bg-rose-600 transition-all"
            style={"width: #{Float.round(abs(value) / @max_abs * 100, 1)}%"}>
          </div>
        </div>
        <span class={[
          "w-14 text-right font-mono font-bold",
          value > 0 && "text-emerald-400",
          value < 0 && "text-rose-400"
        ]}>{format_value(value)}</span>
      </div>
    </div>
    """
  end

  defp to_number(n) when is_number(n), do: n
  defp to_number(s) when is_binary(s) do
    case Float.parse(s) do
      {f, _} -> f
      _ -> 0
    end
  end
  defp to_number(_), do: 0

  defp format_value(v) when v > 0, do: "+#{format_n(v)}"
  defp format_value(v), do: format_n(v)

  defp format_n(v) when is_integer(v), do: Integer.to_string(v)
  defp format_n(v) when is_float(v), do: :erlang.float_to_binary(v, decimals: 1)
end
