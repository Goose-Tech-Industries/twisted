defmodule TePhoenixWeb.Components.VisualPreview.AffinityChart do
  @moduledoc """
  Tier α P4 — bar chart with elemental affinities. Positive values
  show as resistance (green), negative as weakness (red), zero as neutral.

      <.affinity_chart affinities={%{fire: 0.5, water: -0.25, shadow: 1.0, light: -1.0}} />
  """

  use Phoenix.Component

  attr :affinities, :map, required: true,
       doc: "%{element_atom_or_string => float -1..1}"

  attr :title, :string, default: nil

  def affinity_chart(assigns) do
    rows =
      assigns.affinities
      |> Enum.map(fn {k, v} -> {to_string(k), to_float(v)} end)
      |> Enum.reject(fn {_, v} -> is_nil(v) end)
      |> Enum.sort_by(fn {_, v} -> -v end)

    assigns = assign(assigns, :rows, rows)

    ~H"""
    <div class="bg-zinc-900/50 border border-zinc-800 rounded p-2 space-y-1">
      <div :if={@title} class="text-[10px] uppercase tracking-wide text-zinc-500">{@title}</div>
      <div :if={@rows == []} class="text-[10px] text-zinc-600 italic">No affinities</div>
      <div :for={{element, value} <- @rows} class="flex items-center gap-2 text-xs">
        <span class="w-16 text-zinc-400 capitalize" style={"color: #{element_color(element)}"}>
          ◆ {element}
        </span>
        <div class="flex-1 h-3 bg-zinc-950 rounded overflow-hidden flex relative">
          <%!-- Center divider --%>
          <div class="absolute inset-y-0 left-1/2 w-px bg-zinc-700"></div>
          <%!-- Negative side (left) --%>
          <div :if={value < 0}
            class="absolute inset-y-0 right-1/2 bg-rose-600"
            style={"width: #{Float.round(abs(value) * 50, 1)}%"}>
          </div>
          <%!-- Positive side (right) --%>
          <div :if={value > 0}
            class="absolute inset-y-0 left-1/2 bg-emerald-600"
            style={"width: #{Float.round(abs(value) * 50, 1)}%"}>
          </div>
        </div>
        <span class={[
          "w-12 text-right font-mono font-bold",
          value > 0 && "text-emerald-400",
          value < 0 && "text-rose-400",
          value == 0 && "text-zinc-500"
        ]}>{format_pct(value)}</span>
      </div>
      <div class="flex justify-between text-[9px] text-zinc-600 font-mono pt-1">
        <span>weak</span><span>neutral</span><span>resist</span>
      </div>
    </div>
    """
  end

  defp to_float(n) when is_number(n), do: n * 1.0
  defp to_float(_), do: nil

  defp format_pct(v) when v > 0, do: "+#{trunc(v * 100)}%"
  defp format_pct(v) when v < 0, do: "#{trunc(v * 100)}%"
  defp format_pct(_), do: "0"

  defp element_color("fire"), do: "#f97316"
  defp element_color("water"), do: "#3b82f6"
  defp element_color("earth"), do: "#a16207"
  defp element_color("air"), do: "#a3e635"
  defp element_color("shadow"), do: "#7c3aed"
  defp element_color("light"), do: "#fbbf24"
  defp element_color("poison"), do: "#84cc16"
  defp element_color("ice"), do: "#67e8f9"
  defp element_color(_), do: "#a1a1aa"
end
