defmodule TePhoenixWeb.Components.VisualPreview.HpBarThreshold do
  @moduledoc """
  Tier α P4 — HP bar with phase-transition markers. For boss design:
  shows where each phase fires.

      <.hp_bar_threshold
        max_hp={5000}
        current={3200}
        phases={[%{at: 75, label: "Phase 2"}, %{at: 30, label: "Enrage"}]} />
  """

  use Phoenix.Component

  attr :max_hp, :integer, required: true
  attr :current, :integer, default: nil
  attr :phases, :list, default: [],
       doc: "[%{at: pct_int, label: string}] — markers along the bar"

  attr :title, :string, default: nil

  def hp_bar_threshold(assigns) do
    current = assigns.current || assigns.max_hp
    pct = if assigns.max_hp > 0, do: current / assigns.max_hp * 100, else: 0
    assigns = assigns |> assign(:current, current) |> assign(:pct, pct)

    ~H"""
    <div class="bg-zinc-900/50 border border-zinc-800 rounded p-2 space-y-2">
      <div :if={@title} class="text-[10px] uppercase tracking-wide text-zinc-500">{@title}</div>
      <div class="text-xs flex items-center justify-between">
        <span class="text-zinc-400">HP</span>
        <span class="font-mono text-zinc-200">{@current} / {@max_hp}</span>
      </div>
      <div class="relative h-4 bg-zinc-950 border border-zinc-800 rounded overflow-hidden">
        <div class="h-full bg-gradient-to-r from-rose-700 via-amber-500 to-emerald-500 transition-all"
          style={"width: #{Float.round(@pct, 1)}%"}>
        </div>
        <div :for={phase <- @phases}
          class="absolute top-0 bottom-0 w-px bg-zinc-100/40 group"
          style={"left: #{phase.at}%"}>
          <div class="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] uppercase tracking-wider text-zinc-300 font-bold whitespace-nowrap bg-zinc-900 px-1 py-0.5 rounded border border-zinc-700">
            {phase.label}
          </div>
        </div>
      </div>
      <div class="flex justify-between text-[9px] text-zinc-600 font-mono pt-2">
        <span>0%</span><span>50%</span><span>100%</span>
      </div>
    </div>
    """
  end
end
