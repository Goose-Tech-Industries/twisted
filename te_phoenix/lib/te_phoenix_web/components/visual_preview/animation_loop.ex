defmodule TePhoenixWeb.Components.VisualPreview.AnimationLoop do
  @moduledoc """
  Tier α P4 — sprite-frame animation preview. Cycles through a list of
  image URLs at the given fps, looping forever. Pure CSS animation —
  no JS hook required, no Pixi.

      <.animation_loop frame_urls={["/sprites/torch_0.png", "/sprites/torch_1.png"]} fps={4} />

  Implementation: stacks frames absolute-positioned, uses a CSS keyframe
  animation that flips opacity at the right moment for each frame.
  """

  use Phoenix.Component

  attr :frame_urls, :list, required: true
  attr :fps, :integer, default: 4
  attr :size, :integer, default: 64,
       doc: "Pixel dimensions of the square preview area"

  attr :title, :string, default: nil

  def animation_loop(assigns) do
    frames = assigns.frame_urls
    count = length(frames)
    duration_ms = if assigns.fps > 0 and count > 0, do: count * 1000 / assigns.fps, else: 1000
    assigns = assigns |> assign(:count, count) |> assign(:duration_ms, duration_ms)

    ~H"""
    <div class="bg-zinc-900/50 border border-zinc-800 rounded p-2 space-y-1">
      <div :if={@title} class="text-[10px] uppercase tracking-wide text-zinc-500">{@title}</div>

      <div :if={@count == 0} class="text-[10px] text-zinc-600 italic h-16 flex items-center justify-center">
        No frames provided
      </div>

      <div :if={@count > 0}
        class="relative bg-zinc-950 border border-zinc-800 rounded overflow-hidden"
        style={"width: #{@size}px; height: #{@size}px;"}>
        <%= for {url, idx} <- Enum.with_index(@frame_urls) do %>
          <img
            src={url}
            alt={"frame #{idx + 1}"}
            class="absolute inset-0 w-full h-full object-contain pixelated"
            style={"animation: anim-frame-#{@count} #{@duration_ms}ms steps(1, end) infinite; animation-delay: #{(idx * @duration_ms) / @count}ms; opacity: 0;"}>
        <% end %>
      </div>

      <div class="flex justify-between text-[9px] text-zinc-600 font-mono pt-1">
        <span>{@count} frame<%= if @count != 1, do: "s" %></span>
        <span>{@fps} fps</span>
      </div>

      <%!-- Per-frame-count keyframes: flash on for 1/N of the loop. --%>
      <style :if={@count > 0}>
        @keyframes anim-frame-{@count} {
          0% { opacity: 1; }
          {Float.round(100.0 / @count, 4)}% { opacity: 0; }
          100% { opacity: 0; }
        }
        .pixelated {
          image-rendering: pixelated;
          image-rendering: crisp-edges;
        }
      </style>
    </div>
    """
  end
end
