defmodule TePhoenixWeb.Components.VisualPreview.RarityBadge do
  @moduledoc """
  Tier α P4 — colored pill for tier/rarity. Pure visual; no input.

      <.rarity_badge tier={:legendary} />
      <.rarity_badge tier="epic" size={:lg} />
  """

  use Phoenix.Component

  attr :tier, :any, required: true,
       doc: "atom or string: :common | :uncommon | :rare | :epic | :legendary | :mythic"
  attr :size, :atom, default: :md, values: [:sm, :md, :lg]
  attr :label, :string, default: nil,
       doc: "Override the default tier label shown in the badge"

  def rarity_badge(assigns) do
    tier = normalize_tier(assigns.tier)
    assigns = assigns |> assign(:t, tier) |> assign(:text, assigns.label || tier_text(tier))

    ~H"""
    <span class={[
      "inline-flex items-center gap-1 rounded-full font-bold tracking-wide uppercase",
      tier_class(@t),
      size_class(@size)
    ]}>
      <span>{tier_glyph(@t)}</span>
      <span>{@text}</span>
    </span>
    """
  end

  defp normalize_tier(t) when is_atom(t), do: t
  defp normalize_tier(t) when is_binary(t), do: String.to_atom(String.downcase(t))
  defp normalize_tier(_), do: :common

  defp tier_text(:common), do: "Common"
  defp tier_text(:uncommon), do: "Uncommon"
  defp tier_text(:rare), do: "Rare"
  defp tier_text(:epic), do: "Epic"
  defp tier_text(:legendary), do: "Legendary"
  defp tier_text(:mythic), do: "Mythic"
  defp tier_text(t), do: t |> Atom.to_string() |> String.capitalize()

  defp tier_glyph(:common), do: "○"
  defp tier_glyph(:uncommon), do: "◇"
  defp tier_glyph(:rare), do: "◆"
  defp tier_glyph(:epic), do: "✦"
  defp tier_glyph(:legendary), do: "★"
  defp tier_glyph(:mythic), do: "✸"
  defp tier_glyph(_), do: "•"

  defp tier_class(:common), do: "bg-zinc-700 text-zinc-200 border border-zinc-600"
  defp tier_class(:uncommon), do: "bg-emerald-800/40 text-emerald-300 border border-emerald-700"
  defp tier_class(:rare), do: "bg-sky-800/40 text-sky-300 border border-sky-700"
  defp tier_class(:epic), do: "bg-violet-800/40 text-violet-300 border border-violet-700"
  defp tier_class(:legendary), do: "bg-amber-800/40 text-amber-300 border border-amber-600"
  defp tier_class(:mythic), do: "bg-rose-800/40 text-rose-300 border border-rose-600 animate-pulse"
  defp tier_class(_), do: "bg-zinc-700 text-zinc-200 border border-zinc-600"

  defp size_class(:sm), do: "text-[9px] px-1.5 py-0.5"
  defp size_class(:md), do: "text-[10px] px-2 py-0.5"
  defp size_class(:lg), do: "text-xs px-2.5 py-1"
end
