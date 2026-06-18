defmodule TePhoenixWeb.Components.AiAssist.Popover do
  @moduledoc """
  Modal-style popover anchored to the AiAssist trigger button. Closes
  on Escape or outside-click. Inner_block carries whatever the parent
  AiAssist live_component wants to render (prompt form OR result diff).
  """

  use Phoenix.Component
  alias Phoenix.LiveView.JS

  attr :id, :string, required: true
  attr :target, :any, required: true,
       doc: "phx-target for ai:close — the parent live_component."
  attr :title, :string, default: nil
  slot :inner_block, required: true

  def popover(assigns) do
    ~H"""
    <div
      id={"ai-popover-#{@id}"}
      class="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4
             bg-black/50 backdrop-blur-sm"
      phx-window-keydown={JS.push("ai:close", target: @target)}
      phx-key="escape">
      <div
        class="w-full max-w-lg bg-zinc-950 border border-amber-500/30 rounded-lg
               shadow-2xl shadow-amber-500/10"
        phx-click-away={JS.push("ai:close", target: @target)}>
        <header class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h3 class="text-sm font-bold text-amber-400 flex items-center gap-2">
            <span class="text-base">✨</span>
            <span>{@title || "AI Assist"}</span>
          </h3>
          <button
            type="button"
            phx-click="ai:close" phx-target={@target}
            class="text-zinc-500 hover:text-zinc-300"
            aria-label="Close">
            ✕
          </button>
        </header>
        <div class="p-4">
          {render_slot(@inner_block)}
        </div>
      </div>
    </div>
    """
  end
end
