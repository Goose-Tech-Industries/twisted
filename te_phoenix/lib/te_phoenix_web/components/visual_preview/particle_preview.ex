defmodule TePhoenixWeb.Components.VisualPreview.ParticlePreview do
  @moduledoc """
  Tier α P4 — surface texture / effect loop. Pure CSS animation
  (no canvas or JS) renders a small swatch with a moving particle/
  texture pattern keyed off the surface kind.

      <.particle_preview kind="fire" />
      <.particle_preview kind="ice" size={96} />
  """

  use Phoenix.Component

  attr :kind, :string, required: true,
       doc: "fire | ice | poison | water | shadow | light | electric | smoke | blood | sand"

  attr :size, :integer, default: 64
  attr :title, :string, default: nil

  def particle_preview(assigns) do
    ~H"""
    <div class="bg-zinc-900/50 border border-zinc-800 rounded p-2 space-y-1">
      <div :if={@title} class="text-[10px] uppercase tracking-wide text-zinc-500">{@title}</div>
      <div
        class={["relative overflow-hidden rounded border border-zinc-800", base_class(@kind)]}
        style={"width: #{@size}px; height: #{@size}px;"}>
        <div :for={n <- 1..6}
          class={["absolute rounded-full opacity-70", particle_class(@kind)]}
          style={particle_style(@kind, n, @size)}>
        </div>
      </div>
      <div class="text-[10px] text-zinc-400 capitalize text-center">{@kind}</div>

      <style>
        @keyframes pp-rise {
          0% { transform: translateY(100%); opacity: 0; }
          20% { opacity: 0.8; }
          100% { transform: translateY(-20%); opacity: 0; }
        }
        @keyframes pp-drift {
          0% { transform: translate(0, 0); }
          50% { transform: translate(8px, -6px); }
          100% { transform: translate(0, 0); }
        }
        @keyframes pp-spark {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.4); }
        }
      </style>
    </div>
    """
  end

  defp base_class("fire"), do: "bg-gradient-to-t from-amber-900 via-orange-700 to-rose-700"
  defp base_class("ice"), do: "bg-gradient-to-t from-sky-950 via-sky-700 to-cyan-300"
  defp base_class("poison"), do: "bg-gradient-to-t from-emerald-950 via-lime-800 to-yellow-500"
  defp base_class("water"), do: "bg-gradient-to-t from-blue-950 via-blue-700 to-cyan-400"
  defp base_class("shadow"), do: "bg-gradient-to-t from-zinc-950 via-violet-950 to-purple-900"
  defp base_class("light"), do: "bg-gradient-to-t from-amber-300 via-yellow-200 to-white"
  defp base_class("electric"), do: "bg-gradient-to-t from-yellow-900 via-yellow-500 to-cyan-300"
  defp base_class("smoke"), do: "bg-gradient-to-t from-zinc-900 via-zinc-700 to-zinc-500"
  defp base_class("blood"), do: "bg-gradient-to-t from-rose-950 via-rose-800 to-rose-600"
  defp base_class("sand"), do: "bg-gradient-to-t from-amber-900 via-amber-600 to-amber-300"
  defp base_class(_), do: "bg-zinc-800"

  defp particle_class("fire"), do: "bg-amber-300"
  defp particle_class("ice"), do: "bg-white"
  defp particle_class("poison"), do: "bg-lime-300"
  defp particle_class("water"), do: "bg-cyan-200"
  defp particle_class("shadow"), do: "bg-violet-400"
  defp particle_class("light"), do: "bg-yellow-100"
  defp particle_class("electric"), do: "bg-yellow-200"
  defp particle_class("smoke"), do: "bg-zinc-300"
  defp particle_class("blood"), do: "bg-rose-300"
  defp particle_class("sand"), do: "bg-amber-200"
  defp particle_class(_), do: "bg-zinc-200"

  defp particle_style(kind, n, size) do
    delay = rem(n * 137, 1500)
    duration = animation_duration(kind)
    left_pct = rem(n * 17, 90)
    psize = max(2, div(size, 12))

    anim =
      case kind do
        "ice" -> "pp-spark"
        "shadow" -> "pp-spark"
        _ -> "pp-rise"
      end

    "left: #{left_pct}%; bottom: 0; width: #{psize}px; height: #{psize}px; " <>
      "animation: #{anim} #{duration}ms ease-in-out #{delay}ms infinite;"
  end

  defp animation_duration("fire"), do: 1400
  defp animation_duration("electric"), do: 600
  defp animation_duration("smoke"), do: 2200
  defp animation_duration("ice"), do: 1800
  defp animation_duration(_), do: 1600
end
