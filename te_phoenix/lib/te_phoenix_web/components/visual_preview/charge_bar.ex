defmodule TePhoenixWeb.Components.VisualPreview.ChargeBar do
  @moduledoc """
  Tier α P4 — limit-break / ki / energy charge fill animation.
  Static preview for the editor — shows the bar at the given percent
  with optional segment ticks for partial-charge tier breakpoints.

      <.charge_bar pct={75} max_label="LIMIT" />
      <.charge_bar pct={40} segments={3} color="amber" />
  """

  use Phoenix.Component

  attr :pct, :integer, default: 0,
       doc: "Fill percentage 0-100"

  attr :segments, :integer, default: 1,
       doc: "Number of equal segments (e.g. 3 = breaks at 33% and 66%)"

  attr :color, :string, default: "amber",
       values: ~w(amber rose emerald sky violet)

  attr :max_label, :string, default: nil,
       doc: "Label to show when full (e.g., 'READY')"

  attr :title, :string, default: nil

  def charge_bar(assigns) do
    pct = assigns.pct |> max(0) |> min(100)
    full? = pct >= 100
    assigns = assigns |> assign(:pct, pct) |> assign(:full?, full?)

    ~H"""
    <div class="bg-zinc-900/50 border border-zinc-800 rounded p-2 space-y-1">
      <div :if={@title} class="text-[10px] uppercase tracking-wide text-zinc-500">{@title}</div>
      <div class="relative h-4 bg-zinc-950 border border-zinc-800 rounded overflow-hidden">
        <div class={[
          "h-full transition-all",
          fill_class(@color),
          @full? && "animate-pulse"
        ]} style={"width: #{@pct}%"}>
        </div>
        <div :for={n <- 1..(@segments - 1)}
          :if={@segments > 1}
          class="absolute top-0 bottom-0 w-px bg-zinc-950/60"
          style={"left: #{round(n * 100 / @segments)}%"}>
        </div>
      </div>
      <div class="flex justify-between text-[10px] font-mono">
        <span class={[@full? && "text-amber-400 font-bold animate-pulse", !@full? && "text-zinc-500"]}>
          <%= if @full? && @max_label, do: @max_label, else: "#{@pct}%" %>
        </span>
        <span class="text-zinc-600">{@segments} segment<%= if @segments != 1, do: "s" %></span>
      </div>
    </div>
    """
  end

  defp fill_class("amber"), do: "bg-gradient-to-r from-amber-700 to-amber-400"
  defp fill_class("rose"), do: "bg-gradient-to-r from-rose-700 to-rose-400"
  defp fill_class("emerald"), do: "bg-gradient-to-r from-emerald-700 to-emerald-400"
  defp fill_class("sky"), do: "bg-gradient-to-r from-sky-700 to-sky-400"
  defp fill_class("violet"), do: "bg-gradient-to-r from-violet-700 to-violet-400"
  defp fill_class(_), do: "bg-gradient-to-r from-zinc-700 to-zinc-400"
end
